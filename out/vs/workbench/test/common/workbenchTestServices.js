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
import { DeferredPromise, timeout } from "../../../base/common/async.js";
import { bufferToStream, readableToBuffer, VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { Schemas } from "../../../base/common/network.js";
import { observableValue } from "../../../base/common/observable.js";
import { join } from "../../../base/common/path.js";
import { isLinux, isMacintosh } from "../../../base/common/platform.js";
import { basename, isEqual, isEqualOrParent } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { FileSystemProviderCapabilities } from "../../../platform/files/common/files.js";
import { AbstractLoggerService, LogLevel, NullLogger } from "../../../platform/log/common/log.js";
import product from "../../../platform/product/common/product.js";
import { InMemoryStorageService } from "../../../platform/storage/common/storage.js";
import { toUserDataProfile } from "../../../platform/userDataProfile/common/userDataProfile.js";
import { WorkbenchState } from "../../../platform/workspace/common/workspace.js";
import { WorkspaceTrustUriResponse } from "../../../platform/workspace/common/workspaceTrust.js";
import { TestWorkspace } from "../../../platform/workspace/test/common/testWorkspace.js";
import { SaveReason } from "../../common/editor.js";
import { ChatEntitlement } from "../../services/chat/common/chatEntitlementService.js";
import { NullExtensionService } from "../../services/extensions/common/extensions.js";
import { LifecyclePhase, ShutdownReason } from "../../services/lifecycle/common/lifecycle.js";
import { WorkingCopyCapabilities } from "../../services/workingCopy/common/workingCopy.js";
class TestLoggerService extends AbstractLoggerService {
  constructor(logsHome) {
    super(LogLevel.Info, logsHome ?? URI.file("tests").with({ scheme: "vscode-tests" }));
  }
  doCreateLogger() {
    return new NullLogger();
  }
}
let TestTextResourcePropertiesService = class {
  constructor(configurationService) {
    this.configurationService = configurationService;
  }
  getEOL(resource, language) {
    const eol = this.configurationService.getValue("files.eol", { overrideIdentifier: language, resource });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    return isLinux || isMacintosh ? "\n" : "\r\n";
  }
};
TestTextResourcePropertiesService = __decorateClass([
  __decorateParam(0, IConfigurationService)
], TestTextResourcePropertiesService);
class TestUserDataProfileService {
  constructor() {
    this.onDidChangeCurrentProfile = Event.None;
    this.currentProfile = toUserDataProfile("test", "test", URI.file("tests").with({ scheme: "vscode-tests" }), URI.file("tests").with({ scheme: "vscode-tests" }));
  }
  async updateCurrentProfile() {
  }
}
class TestContextService {
  get onDidChangeWorkspaceName() {
    return this._onDidChangeWorkspaceName.event;
  }
  get onWillChangeWorkspaceFolders() {
    return this._onWillChangeWorkspaceFolders.event;
  }
  get onDidChangeWorkspaceFolders() {
    return this._onDidChangeWorkspaceFolders.event;
  }
  get onDidChangeWorkbenchState() {
    return this._onDidChangeWorkbenchState.event;
  }
  constructor(workspace = TestWorkspace, options = null) {
    this.workspace = workspace;
    this.options = options || /* @__PURE__ */ Object.create(null);
    this._onDidChangeWorkspaceName = new Emitter();
    this._onWillChangeWorkspaceFolders = new Emitter();
    this._onDidChangeWorkspaceFolders = new Emitter();
    this._onDidChangeWorkbenchState = new Emitter();
  }
  getFolders() {
    return this.workspace ? this.workspace.folders : [];
  }
  getWorkbenchState() {
    if (this.workspace.configuration) {
      return WorkbenchState.WORKSPACE;
    }
    if (this.workspace.folders.length) {
      return WorkbenchState.FOLDER;
    }
    return WorkbenchState.EMPTY;
  }
  hasWorkspaceData() {
    return this.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  getCompleteWorkspace() {
    return Promise.resolve(this.getWorkspace());
  }
  getWorkspace() {
    return this.workspace;
  }
  getWorkspaceFolder(resource) {
    return this.workspace.getFolder(resource);
  }
  setWorkspace(workspace) {
    this.workspace = workspace;
  }
  getOptions() {
    return this.options;
  }
  updateOptions() {
  }
  isInsideWorkspace(resource) {
    if (resource && this.workspace) {
      return isEqualOrParent(resource, this.workspace.folders[0].uri);
    }
    return false;
  }
  toResource(workspaceRelativePath) {
    return URI.file(join("C:\\", workspaceRelativePath));
  }
  isCurrentWorkspace(workspaceIdOrFolder) {
    return URI.isUri(workspaceIdOrFolder) && isEqual(this.workspace.folders[0].uri, workspaceIdOrFolder);
  }
}
class TestStorageService extends InMemoryStorageService {
  testEmitWillSaveState(reason) {
    super.emitWillSaveState(reason);
  }
}
class TestHistoryService {
  constructor(root) {
    this.root = root;
  }
  async reopenLastClosedEditor() {
  }
  async goForward() {
  }
  async goBack() {
  }
  async goPrevious() {
  }
  async goLast() {
  }
  removeFromHistory(_input) {
  }
  clear() {
  }
  clearRecentlyOpened() {
  }
  getHistory() {
    return [];
  }
  async openNextRecentlyUsedEditor(group) {
  }
  async openPreviouslyUsedEditor(group) {
  }
  getLastActiveWorkspaceRoot(_schemeFilter) {
    return this.root;
  }
  getLastActiveFile(_schemeFilter) {
    return void 0;
  }
}
class TestWorkingCopy extends Disposable {
  constructor(resource, isDirty = false, typeId = "testWorkingCopyType") {
    super();
    this.resource = resource;
    this.typeId = typeId;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this.capabilities = WorkingCopyCapabilities.None;
    this.dirty = false;
    this.name = basename(this.resource);
    this.dirty = isDirty;
  }
  setDirty(dirty) {
    if (this.dirty !== dirty) {
      this.dirty = dirty;
      this._onDidChangeDirty.fire();
    }
  }
  setContent(content) {
    this._onDidChangeContent.fire();
  }
  isDirty() {
    return this.dirty;
  }
  isModified() {
    return this.isDirty();
  }
  async save(options, stat) {
    this._onDidSave.fire({ reason: options?.reason ?? SaveReason.EXPLICIT, stat: stat ?? createFileStat(this.resource), source: options?.source });
    return true;
  }
  async revert(options) {
    this.setDirty(false);
  }
  async backup(token) {
    return {};
  }
}
function createFileStat(resource, readonly = false, isFile, isDirectory, isSymbolicLink, children, executable) {
  return {
    resource,
    etag: Date.now().toString(),
    mtime: Date.now(),
    ctime: Date.now(),
    size: 42,
    isFile: isFile ?? true,
    isDirectory: isDirectory ?? false,
    isSymbolicLink: isSymbolicLink ?? false,
    readonly,
    locked: false,
    executable: executable ?? false,
    name: basename(resource),
    children: children?.map((c) => createFileStat(c.resource, false, c.isFile, c.isDirectory, c.isSymbolicLink, void 0, c.executable))
  };
}
class TestWorkingCopyFileService {
  constructor() {
    this.onWillRunWorkingCopyFileOperation = Event.None;
    this.onDidFailWorkingCopyFileOperation = Event.None;
    this.onDidRunWorkingCopyFileOperation = Event.None;
    this.hasSaveParticipants = false;
  }
  addFileOperationParticipant(participant) {
    return Disposable.None;
  }
  addSaveParticipant(participant) {
    return Disposable.None;
  }
  async runSaveParticipants(workingCopy, context, progress, token) {
  }
  async delete(operations, token, undoInfo) {
  }
  registerWorkingCopyProvider(provider) {
    return Disposable.None;
  }
  getDirty(resource) {
    return [];
  }
  create(operations, token, undoInfo) {
    throw new Error("Method not implemented.");
  }
  createFolder(operations, token, undoInfo) {
    throw new Error("Method not implemented.");
  }
  move(operations, token, undoInfo) {
    throw new Error("Method not implemented.");
  }
  copy(operations, token, undoInfo) {
    throw new Error("Method not implemented.");
  }
}
function mock() {
  return function() {
  };
}
class TestExtensionService extends NullExtensionService {
}
const TestProductService = { _serviceBrand: void 0, ...product };
class TestActivityService {
  constructor() {
    this.onDidChangeActivity = Event.None;
  }
  getViewContainerActivities(viewContainerId) {
    return [];
  }
  getActivity(id) {
    return [];
  }
  showViewContainerActivity(viewContainerId, badge) {
    return this;
  }
  showViewActivity(viewId, badge) {
    return this;
  }
  showAccountsActivity(activity) {
    return this;
  }
  showGlobalActivity(activity) {
    return this;
  }
  dispose() {
  }
}
const NullFilesConfigurationService = new class {
  constructor() {
    this.onDidChangeAutoSaveConfiguration = Event.None;
    this.onDidChangeAutoSaveDisabled = Event.None;
    this.onDidChangeReadonly = Event.None;
    this.onDidChangeFilesAssociation = Event.None;
    this.isHotExitEnabled = false;
    this.hotExitConfiguration = void 0;
  }
  getAutoSaveConfiguration() {
    throw new Error("Method not implemented.");
  }
  getAutoSaveMode() {
    throw new Error("Method not implemented.");
  }
  hasShortAutoSaveDelay() {
    throw new Error("Method not implemented.");
  }
  toggleAutoSave() {
    throw new Error("Method not implemented.");
  }
  enableAutoSaveAfterShortDelay(resourceOrEditor) {
    throw new Error("Method not implemented.");
  }
  disableAutoSave(resourceOrEditor) {
    throw new Error("Method not implemented.");
  }
  isReadonly(resource, stat) {
    return false;
  }
  async updateReadonly(_resource, _readonly) {
  }
  preventSaveConflicts(resource, language) {
    throw new Error("Method not implemented.");
  }
}();
class TestWorkspaceTrustEnablementService {
  constructor(isEnabled = true) {
    this.isEnabled = isEnabled;
  }
  isWorkspaceTrustEnabled() {
    return this.isEnabled;
  }
}
class TestWorkspaceTrustManagementService extends Disposable {
  constructor(trusted = true, trustedUris = new ResourceSet()) {
    super();
    this.trusted = trusted;
    this.trustedUris = trustedUris;
    this._onDidChangeTrust = this._register(new Emitter());
    this.onDidChangeTrust = this._onDidChangeTrust.event;
    this._onDidChangeTrustedFolders = this._register(new Emitter());
    this.onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;
    this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
  }
  get acceptsOutOfWorkspaceFiles() {
    throw new Error("Method not implemented.");
  }
  set acceptsOutOfWorkspaceFiles(value) {
    throw new Error("Method not implemented.");
  }
  addWorkspaceTrustTransitionParticipant(participant) {
    throw new Error("Method not implemented.");
  }
  getTrustedUris() {
    throw new Error("Method not implemented.");
  }
  setParentFolderTrust(trusted) {
    throw new Error("Method not implemented.");
  }
  getUriTrustInfo(uri) {
    return Promise.resolve({ trusted: this.trustedUris.has(uri), uri });
  }
  async setTrustedUris(folders) {
    this.trustedUris = new ResourceSet(folders);
  }
  async setUrisTrust(uris, trusted) {
    throw new Error("Method not implemented.");
  }
  canSetParentFolderTrust() {
    throw new Error("Method not implemented.");
  }
  canSetWorkspaceTrust() {
    throw new Error("Method not implemented.");
  }
  isWorkspaceTrusted() {
    return this.trusted;
  }
  isWorkspaceTrustForced() {
    return false;
  }
  get workspaceTrustInitialized() {
    return Promise.resolve();
  }
  get workspaceResolved() {
    return Promise.resolve();
  }
  async setWorkspaceTrust(trusted) {
    if (this.trusted !== trusted) {
      this.trusted = trusted;
      this._onDidChangeTrust.fire(this.trusted);
    }
  }
}
class TestWorkspaceTrustRequestService extends Disposable {
  constructor(_trusted) {
    super();
    this._trusted = _trusted;
    this._onDidInitiateOpenFilesTrustRequest = this._register(new Emitter());
    this.onDidInitiateOpenFilesTrustRequest = this._onDidInitiateOpenFilesTrustRequest.event;
    this._onDidInitiateResourcesTrustRequest = this._register(new Emitter());
    this.onDidInitiateResourcesTrustRequest = this._onDidInitiateResourcesTrustRequest.event;
    this._onDidInitiateWorkspaceTrustRequest = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;
    this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
    this.requestOpenUrisHandler = async (uris) => {
      return WorkspaceTrustUriResponse.Open;
    };
  }
  requestOpenFilesTrust(uris) {
    return this.requestOpenUrisHandler(uris);
  }
  async completeOpenFilesTrustRequest(result, saveResponse) {
    throw new Error("Method not implemented.");
  }
  async completeResourcesTrustRequest(uri, result) {
    throw new Error("Method not implemented.");
  }
  async requestResourcesTrust(options) {
    return this._trusted;
  }
  cancelWorkspaceTrustRequest() {
    throw new Error("Method not implemented.");
  }
  async completeWorkspaceTrustRequest(trusted) {
    throw new Error("Method not implemented.");
  }
  async requestWorkspaceTrust(options) {
    return this._trusted;
  }
  requestWorkspaceTrustOnStartup() {
    throw new Error("Method not implemented.");
  }
}
class TestMarkerService {
  constructor() {
    this.onMarkerChanged = Event.None;
  }
  getStatistics() {
    throw new Error("Method not implemented.");
  }
  changeOne(owner, resource, markers) {
  }
  changeAll(owner, data) {
  }
  remove(owner, resources) {
  }
  read(filter) {
    return [];
  }
  installResourceFilter(resource, reason) {
    return { dispose: () => {
    } };
  }
}
class TestFileService {
  constructor() {
    this._onDidFilesChange = new Emitter();
    this._onDidRunOperation = new Emitter();
    this._onDidChangeFileSystemProviderCapabilities = new Emitter();
    this._onWillActivateFileSystemProvider = new Emitter();
    this.onWillActivateFileSystemProvider = this._onWillActivateFileSystemProvider.event;
    this.onDidWatchError = Event.None;
    this.content = "Hello Html";
    this.readonly = false;
    // Tracking functionality for tests
    this.writeOperations = [];
    this.readOperations = [];
    this.notExistsSet = new ResourceMap();
    this.readShouldThrowError = void 0;
    this.writeShouldThrowError = void 0;
    this.onDidChangeFileSystemProviderRegistrations = Event.None;
    this.providers = /* @__PURE__ */ new Map();
    this.watches = [];
  }
  get onDidFilesChange() {
    return this._onDidFilesChange.event;
  }
  fireFileChanges(event) {
    this._onDidFilesChange.fire(event);
  }
  get onDidRunOperation() {
    return this._onDidRunOperation.event;
  }
  fireAfterOperation(event) {
    this._onDidRunOperation.fire(event);
  }
  get onDidChangeFileSystemProviderCapabilities() {
    return this._onDidChangeFileSystemProviderCapabilities.event;
  }
  fireFileSystemProviderCapabilitiesChangeEvent(event) {
    this._onDidChangeFileSystemProviderCapabilities.fire(event);
  }
  setContent(content) {
    this.content = content;
  }
  getContent() {
    return this.content;
  }
  getLastReadFileUri() {
    return this.lastReadFileUri;
  }
  // Clear tracking data for tests
  clearTracking() {
    this.writeOperations.length = 0;
    this.readOperations.length = 0;
  }
  async resolve(resource, _options) {
    return createFileStat(resource, this.readonly);
  }
  stat(resource) {
    return this.resolve(resource, { resolveMetadata: true });
  }
  async realpath(resource) {
    return resource;
  }
  async resolveAll(toResolve) {
    const stats = await Promise.all(toResolve.map((resourceAndOption) => this.resolve(resourceAndOption.resource, resourceAndOption.options)));
    return stats.map((stat) => ({ stat, success: true }));
  }
  async exists(_resource) {
    return !this.notExistsSet.has(_resource);
  }
  async readFile(resource, options) {
    if (this.readShouldThrowError) {
      throw this.readShouldThrowError;
    }
    this.lastReadFileUri = resource;
    this.readOperations.push({ resource });
    return {
      ...createFileStat(resource, this.readonly),
      value: VSBuffer.fromString(this.content)
    };
  }
  async readFileStream(resource, options) {
    if (this.readShouldThrowError) {
      throw this.readShouldThrowError;
    }
    this.lastReadFileUri = resource;
    return {
      ...createFileStat(resource, this.readonly),
      value: bufferToStream(VSBuffer.fromString(this.content))
    };
  }
  async writeFile(resource, bufferOrReadable, options) {
    await timeout(0);
    if (this.writeShouldThrowError) {
      throw this.writeShouldThrowError;
    }
    let content;
    if (bufferOrReadable instanceof VSBuffer) {
      content = bufferOrReadable;
    } else {
      try {
        content = readableToBuffer(bufferOrReadable);
      } catch {
      }
    }
    if (content) {
      this.writeOperations.push({ resource, content: content.toString() });
    }
    return createFileStat(resource, this.readonly);
  }
  move(_source, _target, _overwrite) {
    return Promise.resolve(null);
  }
  copy(_source, _target, _overwrite) {
    return Promise.resolve(null);
  }
  async cloneFile(_source, _target) {
  }
  createFile(_resource, _content, _options) {
    return Promise.resolve(null);
  }
  createFolder(_resource) {
    return Promise.resolve(null);
  }
  registerProvider(scheme, provider) {
    this.providers.set(scheme, provider);
    return toDisposable(() => this.providers.delete(scheme));
  }
  getProvider(scheme) {
    return this.providers.get(scheme);
  }
  async activateProvider(_scheme) {
    this._onWillActivateFileSystemProvider.fire({ scheme: _scheme, join: () => {
    } });
  }
  async canHandleResource(resource) {
    return this.hasProvider(resource);
  }
  hasProvider(resource) {
    return resource.scheme === Schemas.file || this.providers.has(resource.scheme);
  }
  listCapabilities() {
    return [
      { scheme: Schemas.file, capabilities: FileSystemProviderCapabilities.FileOpenReadWriteClose },
      ...Iterable.map(this.providers, ([scheme, p]) => {
        return { scheme, capabilities: p.capabilities };
      })
    ];
  }
  hasCapability(resource, capability) {
    if (capability === FileSystemProviderCapabilities.PathCaseSensitive && isLinux) {
      return true;
    }
    const provider = this.getProvider(resource.scheme);
    return !!(provider && provider.capabilities & capability);
  }
  async del(_resource, _options) {
  }
  createWatcher(resource, options) {
    return {
      onDidChange: Event.None,
      dispose: () => {
      }
    };
  }
  watch(_resource) {
    this.watches.push(_resource);
    return toDisposable(() => this.watches.splice(this.watches.indexOf(_resource), 1));
  }
  getWriteEncoding(_resource) {
    return { encoding: "utf8", hasBOM: false };
  }
  dispose() {
  }
  async canCreateFile(source, options) {
    return true;
  }
  async canMove(source, target, overwrite) {
    return true;
  }
  async canCopy(source, target, overwrite) {
    return true;
  }
  async canDelete(resource, options) {
    return true;
  }
}
class InMemoryTestFileService extends TestFileService {
  constructor() {
    super(...arguments);
    this.files = new ResourceMap();
  }
  clearTracking() {
    super.clearTracking();
    this.files.clear();
  }
  async readFile(resource, options) {
    if (this.readShouldThrowError) {
      throw this.readShouldThrowError;
    }
    this.lastReadFileUri = resource;
    this.readOperations.push({ resource });
    const content = this.files.get(resource);
    if (content) {
      return {
        ...createFileStat(resource, this.readonly),
        value: content
      };
    }
    return {
      ...createFileStat(resource, this.readonly),
      value: VSBuffer.fromString(this.content)
    };
  }
  async writeFile(resource, bufferOrReadable, options) {
    await timeout(0);
    if (this.writeShouldThrowError) {
      throw this.writeShouldThrowError;
    }
    let content;
    if (bufferOrReadable instanceof VSBuffer) {
      content = bufferOrReadable;
    } else {
      content = readableToBuffer(bufferOrReadable);
    }
    this.files.set(resource, content);
    this.writeOperations.push({ resource, content: content.toString() });
    return createFileStat(resource, this.readonly);
  }
  async del(resource, _options) {
    this.files.delete(resource);
    this.notExistsSet.set(resource, true);
  }
  async exists(resource) {
    const inMemory = this.files.has(resource);
    if (inMemory) {
      return true;
    }
    return super.exists(resource);
  }
}
class TestChatEntitlementService {
  constructor() {
    this.isInternal = false;
    this.sku = void 0;
    this.copilotTrackingId = void 0;
    this.onDidChangeQuotaExceeded = Event.None;
    this.onDidChangeQuotaRemaining = Event.None;
    this.onDidChangeUsageBasedBilling = Event.None;
    this.quotas = {};
    this.onDidChangeSentiment = Event.None;
    this.sentimentObs = observableValue({}, {});
    this.sentiment = {};
    this.onDidChangeEntitlement = Event.None;
    this.entitlement = ChatEntitlement.Unknown;
    this.entitlementObs = observableValue({}, ChatEntitlement.Unknown);
    this.anonymous = false;
    this.onDidChangeAnonymous = Event.None;
    this.anonymousObs = observableValue({}, false);
    this.clientByokEnabled = false;
    this.hasByokModels = false;
  }
  update(token) {
    throw new Error("Method not implemented.");
  }
  acceptQuotas() {
  }
  clearQuotas() {
  }
  markAnonymousRateLimited() {
  }
  markSetupCompleted() {
  }
  setForceHidden(_hidden) {
  }
}
class TestLifecycleService extends Disposable {
  constructor() {
    super(...arguments);
    this.usePhases = false;
    this.whenStarted = new DeferredPromise();
    this.whenReady = new DeferredPromise();
    this.whenRestored = new DeferredPromise();
    this.whenEventually = new DeferredPromise();
    this.willShutdown = false;
    this._onBeforeShutdown = this._register(new Emitter());
    this._onBeforeShutdownError = this._register(new Emitter());
    this._onShutdownVeto = this._register(new Emitter());
    this._onWillShutdown = this._register(new Emitter());
    this._onDidShutdown = this._register(new Emitter());
    this.shutdownJoiners = [];
  }
  get phase() {
    return this._phase;
  }
  set phase(value) {
    this._phase = value;
    if (value === LifecyclePhase.Starting) {
      this.whenStarted.complete();
    } else if (value === LifecyclePhase.Ready) {
      this.whenReady.complete();
    } else if (value === LifecyclePhase.Restored) {
      this.whenRestored.complete();
    } else if (value === LifecyclePhase.Eventually) {
      this.whenEventually.complete();
    }
  }
  async when(phase) {
    if (!this.usePhases) {
      return;
    }
    if (phase === LifecyclePhase.Starting) {
      await this.whenStarted.p;
    } else if (phase === LifecyclePhase.Ready) {
      await this.whenReady.p;
    } else if (phase === LifecyclePhase.Restored) {
      await this.whenRestored.p;
    } else if (phase === LifecyclePhase.Eventually) {
      await this.whenEventually.p;
    }
  }
  get onBeforeShutdown() {
    return this._onBeforeShutdown.event;
  }
  get onBeforeShutdownError() {
    return this._onBeforeShutdownError.event;
  }
  get onShutdownVeto() {
    return this._onShutdownVeto.event;
  }
  get onWillShutdown() {
    return this._onWillShutdown.event;
  }
  get onDidShutdown() {
    return this._onDidShutdown.event;
  }
  fireShutdown(reason = ShutdownReason.QUIT) {
    this.shutdownJoiners = [];
    this._onWillShutdown.fire({
      join: (p) => {
        this.shutdownJoiners.push(typeof p === "function" ? p() : p);
      },
      joiners: () => [],
      force: () => {
      },
      token: CancellationToken.None,
      reason
    });
  }
  fireBeforeShutdown(event) {
    this._onBeforeShutdown.fire(event);
  }
  fireWillShutdown(event) {
    this._onWillShutdown.fire(event);
  }
  async shutdown() {
    this.fireShutdown();
  }
}
export {
  InMemoryTestFileService,
  NullFilesConfigurationService,
  TestActivityService,
  TestChatEntitlementService,
  TestContextService,
  TestExtensionService,
  TestFileService,
  TestHistoryService,
  TestLifecycleService,
  TestLoggerService,
  TestMarkerService,
  TestProductService,
  TestStorageService,
  TestTextResourcePropertiesService,
  TestUserDataProfileService,
  TestWorkingCopy,
  TestWorkingCopyFileService,
  TestWorkspaceTrustEnablementService,
  TestWorkspaceTrustManagementService,
  TestWorkspaceTrustRequestService,
  createFileStat,
  mock
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGNvbW1vblxcd29ya2JlbmNoVGVzdFNlcnZpY2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9TdHJlYW0sIHJlYWRhYmxlVG9CdWZmZXIsIFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlT3BlcmF0aW9uRXZlbnQsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgSUJhc2VGaWxlU3RhdCwgSUNyZWF0ZUZpbGVPcHRpb25zLCBJRmlsZUNvbnRlbnQsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0LCBJRmlsZVN0YXRSZXN1bHQsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSwgSUZpbGVTdHJlYW1Db250ZW50LCBJRmlsZVN5c3RlbVByb3ZpZGVyLCBJRmlsZVN5c3RlbVByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50LCBJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQsIElGaWxlU3lzdGVtV2F0Y2hlciwgSVJlYWRGaWxlT3B0aW9ucywgSVJlYWRGaWxlU3RyZWFtT3B0aW9ucywgSVJlc29sdmVGaWxlT3B0aW9ucywgSVJlc29sdmVNZXRhZGF0YUZpbGVPcHRpb25zLCBJV2F0Y2hPcHRpb25zLCBJV2F0Y2hPcHRpb25zV2l0aENvcnJlbGF0aW9uLCBJV3JpdGVGaWxlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdExvZ2dlclNlcnZpY2UsIElMb2dnZXIsIExvZ0xldmVsLCBOdWxsTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1hcmtlciwgSU1hcmtlckRhdGEsIElNYXJrZXJTZXJ2aWNlLCBJUmVzb3VyY2VNYXJrZXIsIE1hcmtlclN0YXRpc3RpY3MgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTdGVwIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFdpbGxTYXZlU3RhdGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IHRvVXNlckRhdGFQcm9maWxlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCwgSVdvcmtzcGFjZUZvbGRlcnNXaWxsQ2hhbmdlRXZlbnQsIElXb3Jrc3BhY2VJZGVudGlmaWVyLCBXb3JrYmVuY2hTdGF0ZSwgV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgSVdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50LCBJV29ya3NwYWNlVHJ1c3RVcmlJbmZvLCBSZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnMsIFdvcmtzcGFjZVRydXN0UmVxdWVzdE9wdGlvbnMsIFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IFRlc3RXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBHcm91cElkZW50aWZpZXIsIElSZXZlcnRPcHRpb25zLCBJU2F2ZU9wdGlvbnMsIFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHksIElBY3Rpdml0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBDaGF0RW50aXRsZW1lbnRDb250ZXh0LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgTnVsbEV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElBdXRvU2F2ZUNvbmZpZ3VyYXRpb24sIElBdXRvU2F2ZU1vZGUsIElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgQmVmb3JlU2h1dGRvd25FcnJvckV2ZW50LCBJTGlmZWN5Y2xlU2VydmljZSwgSW50ZXJuYWxCZWZvcmVTaHV0ZG93bkV2ZW50LCBMaWZlY3ljbGVQaGFzZSwgU2h1dGRvd25SZWFzb24sIFN0YXJ0dXBLaW5kLCBXaWxsU2h1dGRvd25FdmVudCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVuY29kaW5nIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlRXZlbnQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weSwgSVdvcmtpbmdDb3B5QmFja3VwLCBXb3JraW5nQ29weUNhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJQ29weU9wZXJhdGlvbiwgSUNyZWF0ZUZpbGVPcGVyYXRpb24sIElDcmVhdGVPcGVyYXRpb24sIElEZWxldGVPcGVyYXRpb24sIElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvLCBJTW92ZU9wZXJhdGlvbiwgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudCwgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIElXb3JraW5nQ29weUZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudCwgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIFdvcmtpbmdDb3B5RmlsZUV2ZW50IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVzdExvZ2dlclNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlclNlcnZpY2Uge1xuXHRjb25zdHJ1Y3Rvcihsb2dzSG9tZT86IFVSSSkge1xuXHRcdHN1cGVyKExvZ0xldmVsLkluZm8sIGxvZ3NIb21lID8/IFVSSS5maWxlKCd0ZXN0cycpLndpdGgoeyBzY2hlbWU6ICd2c2NvZGUtdGVzdHMnIH0pKTtcblx0fVxuXHRwcm90ZWN0ZWQgZG9DcmVhdGVMb2dnZXIoKTogSUxvZ2dlciB7IHJldHVybiBuZXcgTnVsbExvZ2dlcigpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgaW1wbGVtZW50cyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGdldEVPTChyZXNvdXJjZTogVVJJLCBsYW5ndWFnZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZW9sID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZmlsZXMuZW9sJywgeyBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlLCByZXNvdXJjZSB9KTtcblx0XHRpZiAoZW9sICYmIHR5cGVvZiBlb2wgPT09ICdzdHJpbmcnICYmIGVvbCAhPT0gJ2F1dG8nKSB7XG5cdFx0XHRyZXR1cm4gZW9sO1xuXHRcdH1cblx0XHRyZXR1cm4gKGlzTGludXggfHwgaXNNYWNpbnRvc2gpID8gJ1xcbicgOiAnXFxyXFxuJztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgaW1wbGVtZW50cyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgY3VycmVudFByb2ZpbGUgPSB0b1VzZXJEYXRhUHJvZmlsZSgndGVzdCcsICd0ZXN0JywgVVJJLmZpbGUoJ3Rlc3RzJykud2l0aCh7IHNjaGVtZTogJ3ZzY29kZS10ZXN0cycgfSksIFVSSS5maWxlKCd0ZXN0cycpLndpdGgoeyBzY2hlbWU6ICd2c2NvZGUtdGVzdHMnIH0pKTtcblx0YXN5bmMgdXBkYXRlQ3VycmVudFByb2ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RDb250ZXh0U2VydmljZSBpbXBsZW1lbnRzIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB3b3Jrc3BhY2U6IFdvcmtzcGFjZTtcblx0cHJpdmF0ZSBvcHRpb25zOiBvYmplY3Q7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lOiBFbWl0dGVyPHZvaWQ+O1xuXHRnZXQgb25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlTmFtZS5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnM6IEVtaXR0ZXI8SVdvcmtzcGFjZUZvbGRlcnNXaWxsQ2hhbmdlRXZlbnQ+O1xuXHRnZXQgb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycygpOiBFdmVudDxJV29ya3NwYWNlRm9sZGVyc1dpbGxDaGFuZ2VFdmVudD4geyByZXR1cm4gdGhpcy5fb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogRW1pdHRlcjxJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50Pjtcblx0Z2V0IG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygpOiBFdmVudDxJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50PiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlOiBFbWl0dGVyPFdvcmtiZW5jaFN0YXRlPjtcblx0Z2V0IG9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKTogRXZlbnQ8V29ya2JlbmNoU3RhdGU+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUuZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcih3b3Jrc3BhY2UgPSBUZXN0V29ya3NwYWNlLCBvcHRpb25zID0gbnVsbCkge1xuXHRcdHRoaXMud29ya3NwYWNlID0gd29ya3NwYWNlO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwgT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdHRoaXMuX29uV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBuZXcgRW1pdHRlcjxJV29ya3NwYWNlRm9sZGVyc1dpbGxDaGFuZ2VFdmVudD4oKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBuZXcgRW1pdHRlcjxJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50PigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUgPSBuZXcgRW1pdHRlcjxXb3JrYmVuY2hTdGF0ZT4oKTtcblx0fVxuXG5cdGdldEZvbGRlcnMoKTogSVdvcmtzcGFjZUZvbGRlcltdIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2UgPyB0aGlzLndvcmtzcGFjZS5mb2xkZXJzIDogW107XG5cdH1cblxuXHRnZXRXb3JrYmVuY2hTdGF0ZSgpOiBXb3JrYmVuY2hTdGF0ZSB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHJldHVybiBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gV29ya2JlbmNoU3RhdGUuRk9MREVSO1xuXHRcdH1cblxuXHRcdHJldHVybiBXb3JrYmVuY2hTdGF0ZS5FTVBUWTtcblx0fVxuXG5cdGhhc1dvcmtzcGFjZURhdGEoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdH1cblxuXHRnZXRDb21wbGV0ZVdvcmtzcGFjZSgpOiBQcm9taXNlPElXb3Jrc3BhY2U+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZ2V0V29ya3NwYWNlKCkpO1xuXHR9XG5cblx0Z2V0V29ya3NwYWNlKCk6IElXb3Jrc3BhY2Uge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZTtcblx0fVxuXG5cdGdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZTogVVJJKTogSVdvcmtzcGFjZUZvbGRlciB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZS5nZXRGb2xkZXIocmVzb3VyY2UpO1xuXHR9XG5cblx0c2V0V29ya3NwYWNlKHdvcmtzcGFjZTogYW55KTogdm9pZCB7XG5cdFx0dGhpcy53b3Jrc3BhY2UgPSB3b3Jrc3BhY2U7XG5cdH1cblxuXHRnZXRPcHRpb25zKCkge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnM7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKCkgeyB9XG5cblx0aXNJbnNpZGVXb3Jrc3BhY2UocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGlmIChyZXNvdXJjZSAmJiB0aGlzLndvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIGlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgdGhpcy53b3Jrc3BhY2UuZm9sZGVyc1swXS51cmkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHRvUmVzb3VyY2Uod29ya3NwYWNlUmVsYXRpdmVQYXRoOiBzdHJpbmcpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZmlsZShqb2luKCdDOlxcXFwnLCB3b3Jrc3BhY2VSZWxhdGl2ZVBhdGgpKTtcblx0fVxuXG5cdGlzQ3VycmVudFdvcmtzcGFjZSh3b3Jrc3BhY2VJZE9yRm9sZGVyOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIFVSSS5pc1VyaSh3b3Jrc3BhY2VJZE9yRm9sZGVyKSAmJiBpc0VxdWFsKHRoaXMud29ya3NwYWNlLmZvbGRlcnNbMF0udXJpLCB3b3Jrc3BhY2VJZE9yRm9sZGVyKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFN0b3JhZ2VTZXJ2aWNlIGV4dGVuZHMgSW5NZW1vcnlTdG9yYWdlU2VydmljZSB7XG5cblx0dGVzdEVtaXRXaWxsU2F2ZVN0YXRlKHJlYXNvbjogV2lsbFNhdmVTdGF0ZVJlYXNvbik6IHZvaWQge1xuXHRcdHN1cGVyLmVtaXRXaWxsU2F2ZVN0YXRlKHJlYXNvbik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RIaXN0b3J5U2VydmljZSBpbXBsZW1lbnRzIElIaXN0b3J5U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByb290PzogVVJJKSB7IH1cblxuXHRhc3luYyByZW9wZW5MYXN0Q2xvc2VkRWRpdG9yKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdvRm9yd2FyZCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnb0JhY2soKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ29QcmV2aW91cygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnb0xhc3QoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0cmVtb3ZlRnJvbUhpc3RvcnkoX2lucHV0OiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0KTogdm9pZCB7IH1cblx0Y2xlYXIoKTogdm9pZCB7IH1cblx0Y2xlYXJSZWNlbnRseU9wZW5lZCgpOiB2b2lkIHsgfVxuXHRnZXRIaXN0b3J5KCk6IHJlYWRvbmx5IChFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0KVtdIHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIG9wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9yKGdyb3VwPzogR3JvdXBJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgb3BlblByZXZpb3VzbHlVc2VkRWRpdG9yKGdyb3VwPzogR3JvdXBJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0Z2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3QoX3NjaGVtZUZpbHRlcjogc3RyaW5nKTogVVJJIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMucm9vdDsgfVxuXHRnZXRMYXN0QWN0aXZlRmlsZShfc2NoZW1lRmlsdGVyOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0V29ya2luZ0NvcHkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtpbmdDb3B5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURpcnR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHkgPSB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQgPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZSA9IHRoaXMuX29uRGlkU2F2ZS5ldmVudDtcblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXMgPSBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5Ob25lO1xuXG5cdHJlYWRvbmx5IG5hbWU7XG5cblx0cHJpdmF0ZSBkaXJ0eSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHJlc291cmNlOiBVUkksIGlzRGlydHkgPSBmYWxzZSwgcmVhZG9ubHkgdHlwZUlkID0gJ3Rlc3RXb3JraW5nQ29weVR5cGUnKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMubmFtZSA9IGJhc2VuYW1lKHRoaXMucmVzb3VyY2UpO1xuXHRcdHRoaXMuZGlydHkgPSBpc0RpcnR5O1xuXHR9XG5cblx0c2V0RGlydHkoZGlydHk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kaXJ0eSAhPT0gZGlydHkpIHtcblx0XHRcdHRoaXMuZGlydHkgPSBkaXJ0eTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHNldENvbnRlbnQoY29udGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmZpcmUoKTtcblx0fVxuXG5cdGlzRGlydHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlydHk7XG5cdH1cblxuXHRpc01vZGlmaWVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzRGlydHkoKTtcblx0fVxuXG5cdGFzeW5jIHNhdmUob3B0aW9ucz86IElTYXZlT3B0aW9ucywgc3RhdD86IElGaWxlU3RhdFdpdGhNZXRhZGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuX29uRGlkU2F2ZS5maXJlKHsgcmVhc29uOiBvcHRpb25zPy5yZWFzb24gPz8gU2F2ZVJlYXNvbi5FWFBMSUNJVCwgc3RhdDogc3RhdCA/PyBjcmVhdGVGaWxlU3RhdCh0aGlzLnJlc291cmNlKSwgc291cmNlOiBvcHRpb25zPy5zb3VyY2UgfSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIHJldmVydChvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNldERpcnR5KGZhbHNlKTtcblx0fVxuXG5cdGFzeW5jIGJhY2t1cCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElXb3JraW5nQ29weUJhY2t1cD4ge1xuXHRcdHJldHVybiB7fTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRmlsZVN0YXQocmVzb3VyY2U6IFVSSSwgcmVhZG9ubHkgPSBmYWxzZSwgaXNGaWxlPzogYm9vbGVhbiwgaXNEaXJlY3Rvcnk/OiBib29sZWFuLCBpc1N5bWJvbGljTGluaz86IGJvb2xlYW4sIGNoaWxkcmVuPzogeyByZXNvdXJjZTogVVJJOyBpc0ZpbGU/OiBib29sZWFuOyBpc0RpcmVjdG9yeT86IGJvb2xlYW47IGlzU3ltYm9saWNMaW5rPzogYm9vbGVhbjsgZXhlY3V0YWJsZT86IGJvb2xlYW4gfVtdIHwgdW5kZWZpbmVkLCBleGVjdXRhYmxlPzogYm9vbGVhbik6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2UsXG5cdFx0ZXRhZzogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuXHRcdG10aW1lOiBEYXRlLm5vdygpLFxuXHRcdGN0aW1lOiBEYXRlLm5vdygpLFxuXHRcdHNpemU6IDQyLFxuXHRcdGlzRmlsZTogaXNGaWxlID8/IHRydWUsXG5cdFx0aXNEaXJlY3Rvcnk6IGlzRGlyZWN0b3J5ID8/IGZhbHNlLFxuXHRcdGlzU3ltYm9saWNMaW5rOiBpc1N5bWJvbGljTGluayA/PyBmYWxzZSxcblx0XHRyZWFkb25seSxcblx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdGV4ZWN1dGFibGU6IGV4ZWN1dGFibGUgPz8gZmFsc2UsXG5cdFx0bmFtZTogYmFzZW5hbWUocmVzb3VyY2UpLFxuXHRcdGNoaWxkcmVuOiBjaGlsZHJlbj8ubWFwKGMgPT4gY3JlYXRlRmlsZVN0YXQoYy5yZXNvdXJjZSwgZmFsc2UsIGMuaXNGaWxlLCBjLmlzRGlyZWN0b3J5LCBjLmlzU3ltYm9saWNMaW5rLCB1bmRlZmluZWQsIGMuZXhlY3V0YWJsZSkpLFxuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgVGVzdFdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgaW1wbGVtZW50cyBJV29ya2luZ0NvcHlGaWxlU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25XaWxsUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uOiBFdmVudDxXb3JraW5nQ29weUZpbGVFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEZhaWxXb3JraW5nQ29weUZpbGVPcGVyYXRpb246IEV2ZW50PFdvcmtpbmdDb3B5RmlsZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkUnVuV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uOiBFdmVudDxXb3JraW5nQ29weUZpbGVFdmVudD4gPSBFdmVudC5Ob25lO1xuXG5cdGFkZEZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudChwYXJ0aWNpcGFudDogSVdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvblBhcnRpY2lwYW50KTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cblx0cmVhZG9ubHkgaGFzU2F2ZVBhcnRpY2lwYW50cyA9IGZhbHNlO1xuXHRhZGRTYXZlUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnQpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0YXN5bmMgcnVuU2F2ZVBhcnRpY2lwYW50cyh3b3JraW5nQ29weTogSVdvcmtpbmdDb3B5LCBjb250ZXh0OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRhc3luYyBkZWxldGUob3BlcmF0aW9uczogSURlbGV0ZU9wZXJhdGlvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHVuZG9JbmZvPzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdHJlZ2lzdGVyV29ya2luZ0NvcHlQcm92aWRlcihwcm92aWRlcjogKHJlc291cmNlT3JGb2xkZXI6IFVSSSkgPT4gSVdvcmtpbmdDb3B5W10pOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblxuXHRnZXREaXJ0eShyZXNvdXJjZTogVVJJKTogSVdvcmtpbmdDb3B5W10geyByZXR1cm4gW107IH1cblxuXHRjcmVhdGUob3BlcmF0aW9uczogSUNyZWF0ZUZpbGVPcGVyYXRpb25bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCB1bmRvSW5mbz86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGFbXT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Y3JlYXRlRm9sZGVyKG9wZXJhdGlvbnM6IElDcmVhdGVPcGVyYXRpb25bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCB1bmRvSW5mbz86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGFbXT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblxuXHRtb3ZlKG9wZXJhdGlvbnM6IElNb3ZlT3BlcmF0aW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgdW5kb0luZm8/OiBJRmlsZU9wZXJhdGlvblVuZG9SZWRvSW5mbyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhW10+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cblx0Y29weShvcGVyYXRpb25zOiBJQ29weU9wZXJhdGlvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHVuZG9JbmZvPzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9jazxUPigpOiBDdG9yPFQ+IHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdHJldHVybiBmdW5jdGlvbiAoKSB7IH0gYXMgYW55O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEN0b3I8VD4ge1xuXHRuZXcoKTogVDtcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFeHRlbnNpb25TZXJ2aWNlIGV4dGVuZHMgTnVsbEV4dGVuc2lvblNlcnZpY2UgeyB9XG5cbmV4cG9ydCBjb25zdCBUZXN0UHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgLi4ucHJvZHVjdCB9O1xuXG5leHBvcnQgY2xhc3MgVGVzdEFjdGl2aXR5U2VydmljZSBpbXBsZW1lbnRzIElBY3Rpdml0eVNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdG9uRGlkQ2hhbmdlQWN0aXZpdHkgPSBFdmVudC5Ob25lO1xuXHRnZXRWaWV3Q29udGFpbmVyQWN0aXZpdGllcyh2aWV3Q29udGFpbmVySWQ6IHN0cmluZyk6IElBY3Rpdml0eVtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Z2V0QWN0aXZpdHkoaWQ6IHN0cmluZyk6IElBY3Rpdml0eVtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0c2hvd1ZpZXdDb250YWluZXJBY3Rpdml0eSh2aWV3Q29udGFpbmVySWQ6IHN0cmluZywgYmFkZ2U6IElBY3Rpdml0eSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXHRzaG93Vmlld0FjdGl2aXR5KHZpZXdJZDogc3RyaW5nLCBiYWRnZTogSUFjdGl2aXR5KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cdHNob3dBY2NvdW50c0FjdGl2aXR5KGFjdGl2aXR5OiBJQWN0aXZpdHkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblx0c2hvd0dsb2JhbEFjdGl2aXR5KGFjdGl2aXR5OiBJQWN0aXZpdHkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRkaXNwb3NlKCkgeyB9XG59XG5cbmV4cG9ydCBjb25zdCBOdWxsRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdXRvU2F2ZUNvbmZpZ3VyYXRpb24gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUF1dG9TYXZlRGlzYWJsZWQgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlYWRvbmx5ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlc0Fzc29jaWF0aW9uID0gRXZlbnQuTm9uZTtcblxuXHRyZWFkb25seSBpc0hvdEV4aXRFbmFibGVkID0gZmFsc2U7XG5cdHJlYWRvbmx5IGhvdEV4aXRDb25maWd1cmF0aW9uID0gdW5kZWZpbmVkO1xuXG5cdGdldEF1dG9TYXZlQ29uZmlndXJhdGlvbigpOiBJQXV0b1NhdmVDb25maWd1cmF0aW9uIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldEF1dG9TYXZlTW9kZSgpOiBJQXV0b1NhdmVNb2RlIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGhhc1Nob3J0QXV0b1NhdmVEZWxheSgpOiBib29sZWFuIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHRvZ2dsZUF1dG9TYXZlKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0ZW5hYmxlQXV0b1NhdmVBZnRlclNob3J0RGVsYXkocmVzb3VyY2VPckVkaXRvcjogVVJJIHwgRWRpdG9ySW5wdXQpOiBJRGlzcG9zYWJsZSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRkaXNhYmxlQXV0b1NhdmUocmVzb3VyY2VPckVkaXRvcjogVVJJIHwgRWRpdG9ySW5wdXQpOiBJRGlzcG9zYWJsZSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRpc1JlYWRvbmx5KHJlc291cmNlOiBVUkksIHN0YXQ/OiBJQmFzZUZpbGVTdGF0IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyB1cGRhdGVSZWFkb25seShfcmVzb3VyY2U6IFVSSSB8IFVSSVtdLCBfcmVhZG9ubHk6IGJvb2xlYW4gfCAndG9nZ2xlJyB8ICdyZXNldCcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRwcmV2ZW50U2F2ZUNvbmZsaWN0cyhyZXNvdXJjZTogVVJJLCBsYW5ndWFnZT86IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cbn07XG5cbmV4cG9ydCBjbGFzcyBUZXN0V29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSBpbXBsZW1lbnRzIElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgaXNFbmFibGVkOiBib29sZWFuID0gdHJ1ZSkgeyB9XG5cblx0aXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNFbmFibGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0V29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVRydXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdG9uRGlkQ2hhbmdlVHJ1c3QgPSB0aGlzLl9vbkRpZENoYW5nZVRydXN0LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0b25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycyA9IHRoaXMuX29uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdE9uU3RhcnR1cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRvbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwID0gdGhpcy5fb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdE9uU3RhcnR1cC5ldmVudDtcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdHJ1c3RlZDogYm9vbGVhbiA9IHRydWUsXG5cdFx0cHJpdmF0ZSB0cnVzdGVkVXJpczogUmVzb3VyY2VTZXQgPSBuZXcgUmVzb3VyY2VTZXQoKVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0IGFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzKCk6IGJvb2xlYW4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHNldCBhY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlcyh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGFkZFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50KHBhcnRpY2lwYW50OiBJV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Z2V0VHJ1c3RlZFVyaXMoKTogVVJJW10ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHNldFBhcmVudEZvbGRlclRydXN0KHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXRVcmlUcnVzdEluZm8odXJpOiBVUkkpOiBQcm9taXNlPElXb3Jrc3BhY2VUcnVzdFVyaUluZm8+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgdHJ1c3RlZDogdGhpcy50cnVzdGVkVXJpcy5oYXModXJpKSwgdXJpIH0pO1xuXHR9XG5cblx0YXN5bmMgc2V0VHJ1c3RlZFVyaXMoZm9sZGVyczogVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRydXN0ZWRVcmlzID0gbmV3IFJlc291cmNlU2V0KGZvbGRlcnMpO1xuXHR9XG5cblx0YXN5bmMgc2V0VXJpc1RydXN0KHVyaXM6IFVSSVtdLCB0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Y2FuU2V0UGFyZW50Rm9sZGVyVHJ1c3QoKTogYm9vbGVhbiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Y2FuU2V0V29ya3NwYWNlVHJ1c3QoKTogYm9vbGVhbiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0aXNXb3Jrc3BhY2VUcnVzdGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRydXN0ZWQ7XG5cdH1cblxuXHRpc1dvcmtzcGFjZVRydXN0Rm9yY2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VSZXNvbHZlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRhc3luYyBzZXRXb3Jrc3BhY2VUcnVzdCh0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMudHJ1c3RlZCAhPT0gdHJ1c3RlZCkge1xuXHRcdFx0dGhpcy50cnVzdGVkID0gdHJ1c3RlZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVHJ1c3QuZmlyZSh0aGlzLnRydXN0ZWQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiBhbnk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWF0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluaXRpYXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fb25EaWRJbml0aWF0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluaXRpYXRlUmVzb3VyY2VzVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVzb3VyY2VUcnVzdFJlcXVlc3RPcHRpb25zPigpKTtcblx0cmVhZG9ubHkgb25EaWRJbml0aWF0ZVJlc291cmNlc1RydXN0UmVxdWVzdCA9IHRoaXMuX29uRGlkSW5pdGlhdGVSZXNvdXJjZXNUcnVzdFJlcXVlc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdvcmtzcGFjZVRydXN0UmVxdWVzdE9wdGlvbnM+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPblN0YXJ0dXAgPSB0aGlzLl9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3RydXN0ZWQ6IGJvb2xlYW4pIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVxdWVzdE9wZW5VcmlzSGFuZGxlciA9IGFzeW5jICh1cmlzOiBVUklbXSkgPT4ge1xuXHRcdHJldHVybiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW47XG5cdH07XG5cblx0cmVxdWVzdE9wZW5GaWxlc1RydXN0KHVyaXM6IFVSSVtdKTogUHJvbWlzZTxXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVxdWVzdE9wZW5VcmlzSGFuZGxlcih1cmlzKTtcblx0fVxuXG5cdGFzeW5jIGNvbXBsZXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0KHJlc3VsdDogV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSwgc2F2ZVJlc3BvbnNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0YXN5bmMgY29tcGxldGVSZXNvdXJjZXNUcnVzdFJlcXVlc3QodXJpOiBVUkksIHJlc3VsdDogV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3RSZXNvdXJjZXNUcnVzdChvcHRpb25zOiBSZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJ1c3RlZDtcblx0fVxuXG5cdGNhbmNlbFdvcmtzcGFjZVRydXN0UmVxdWVzdCgpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRhc3luYyBjb21wbGV0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCh0cnVzdGVkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3RXb3Jrc3BhY2VUcnVzdChvcHRpb25zPzogV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl90cnVzdGVkO1xuXHR9XG5cblx0cmVxdWVzdFdvcmtzcGFjZVRydXN0T25TdGFydHVwKCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdE1hcmtlclNlcnZpY2UgaW1wbGVtZW50cyBJTWFya2VyU2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdG9uTWFya2VyQ2hhbmdlZCA9IEV2ZW50Lk5vbmU7XG5cblx0Z2V0U3RhdGlzdGljcygpOiBNYXJrZXJTdGF0aXN0aWNzIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGNoYW5nZU9uZShvd25lcjogc3RyaW5nLCByZXNvdXJjZTogVVJJLCBtYXJrZXJzOiBJTWFya2VyRGF0YVtdKTogdm9pZCB7IH1cblx0Y2hhbmdlQWxsKG93bmVyOiBzdHJpbmcsIGRhdGE6IElSZXNvdXJjZU1hcmtlcltdKTogdm9pZCB7IH1cblx0cmVtb3ZlKG93bmVyOiBzdHJpbmcsIHJlc291cmNlczogVVJJW10pOiB2b2lkIHsgfVxuXHRyZWFkKGZpbHRlcj86IHsgb3duZXI/OiBzdHJpbmcgfCB1bmRlZmluZWQ7IHJlc291cmNlPzogVVJJIHwgdW5kZWZpbmVkOyBzZXZlcml0aWVzPzogbnVtYmVyIHwgdW5kZWZpbmVkOyB0YWtlPzogbnVtYmVyIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQpOiBJTWFya2VyW10geyByZXR1cm4gW107IH1cblx0aW5zdGFsbFJlc291cmNlRmlsdGVyKHJlc291cmNlOiBVUkksIHJlYXNvbjogc3RyaW5nKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgLyogVE9ETzogSW1wbGVtZW50IGNsZWFudXAgbG9naWMgKi8gfSB9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RmlsZVNlcnZpY2UgaW1wbGVtZW50cyBJRmlsZVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmlsZXNDaGFuZ2UgPSBuZXcgRW1pdHRlcjxGaWxlQ2hhbmdlc0V2ZW50PigpO1xuXHRnZXQgb25EaWRGaWxlc0NoYW5nZSgpOiBFdmVudDxGaWxlQ2hhbmdlc0V2ZW50PiB7IHJldHVybiB0aGlzLl9vbkRpZEZpbGVzQ2hhbmdlLmV2ZW50OyB9XG5cdGZpcmVGaWxlQ2hhbmdlcyhldmVudDogRmlsZUNoYW5nZXNFdmVudCk6IHZvaWQgeyB0aGlzLl9vbkRpZEZpbGVzQ2hhbmdlLmZpcmUoZXZlbnQpOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSdW5PcGVyYXRpb24gPSBuZXcgRW1pdHRlcjxGaWxlT3BlcmF0aW9uRXZlbnQ+KCk7XG5cdGdldCBvbkRpZFJ1bk9wZXJhdGlvbigpOiBFdmVudDxGaWxlT3BlcmF0aW9uRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkUnVuT3BlcmF0aW9uLmV2ZW50OyB9XG5cdGZpcmVBZnRlck9wZXJhdGlvbihldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZCB7IHRoaXMuX29uRGlkUnVuT3BlcmF0aW9uLmZpcmUoZXZlbnQpOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMgPSBuZXcgRW1pdHRlcjxJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQ+KCk7XG5cdGdldCBvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcygpOiBFdmVudDxJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLmV2ZW50OyB9XG5cdGZpcmVGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudChldmVudDogSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50KTogdm9pZCB7IHRoaXMuX29uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLmZpcmUoZXZlbnQpOyB9XG5cblx0cHJpdmF0ZSBfb25XaWxsQWN0aXZhdGVGaWxlU3lzdGVtUHJvdmlkZXIgPSBuZXcgRW1pdHRlcjxJRmlsZVN5c3RlbVByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50PigpO1xuXHRyZWFkb25seSBvbldpbGxBY3RpdmF0ZUZpbGVTeXN0ZW1Qcm92aWRlciA9IHRoaXMuX29uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZFdhdGNoRXJyb3IgPSBFdmVudC5Ob25lO1xuXG5cdHByb3RlY3RlZCBjb250ZW50ID0gJ0hlbGxvIEh0bWwnO1xuXHRwcm90ZWN0ZWQgbGFzdFJlYWRGaWxlVXJpITogVVJJO1xuXG5cdHJlYWRvbmx5ID0gZmFsc2U7XG5cblx0Ly8gVHJhY2tpbmcgZnVuY3Rpb25hbGl0eSBmb3IgdGVzdHNcblx0cmVhZG9ubHkgd3JpdGVPcGVyYXRpb25zOiBBcnJheTx7IHJlc291cmNlOiBVUkk7IGNvbnRlbnQ6IHN0cmluZyB9PiA9IFtdO1xuXHRyZWFkb25seSByZWFkT3BlcmF0aW9uczogQXJyYXk8eyByZXNvdXJjZTogVVJJIH0+ID0gW107XG5cblx0c2V0Q29udGVudChjb250ZW50OiBzdHJpbmcpOiB2b2lkIHsgdGhpcy5jb250ZW50ID0gY29udGVudDsgfVxuXHRnZXRDb250ZW50KCk6IHN0cmluZyB7IHJldHVybiB0aGlzLmNvbnRlbnQ7IH1cblx0Z2V0TGFzdFJlYWRGaWxlVXJpKCk6IFVSSSB7IHJldHVybiB0aGlzLmxhc3RSZWFkRmlsZVVyaTsgfVxuXG5cdC8vIENsZWFyIHRyYWNraW5nIGRhdGEgZm9yIHRlc3RzXG5cdGNsZWFyVHJhY2tpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy53cml0ZU9wZXJhdGlvbnMubGVuZ3RoID0gMDtcblx0XHR0aGlzLnJlYWRPcGVyYXRpb25zLmxlbmd0aCA9IDA7XG5cdH1cblxuXHRyZXNvbHZlKHJlc291cmNlOiBVUkksIF9vcHRpb25zOiBJUmVzb2x2ZU1ldGFkYXRhRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT47XG5cdHJlc29sdmUocmVzb3VyY2U6IFVSSSwgX29wdGlvbnM/OiBJUmVzb2x2ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXQ+O1xuXHRhc3luYyByZXNvbHZlKHJlc291cmNlOiBVUkksIF9vcHRpb25zPzogSVJlc29sdmVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0PiB7XG5cdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCB0aGlzLnJlYWRvbmx5KTtcblx0fVxuXG5cdHN0YXQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLnJlc29sdmUocmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHR9XG5cblx0YXN5bmMgcmVhbHBhdGgocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0cmV0dXJuIHJlc291cmNlO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUFsbCh0b1Jlc29sdmU6IHsgcmVzb3VyY2U6IFVSSTsgb3B0aW9ucz86IElSZXNvbHZlRmlsZU9wdGlvbnMgfVtdKTogUHJvbWlzZTxJRmlsZVN0YXRSZXN1bHRbXT4ge1xuXHRcdGNvbnN0IHN0YXRzID0gYXdhaXQgUHJvbWlzZS5hbGwodG9SZXNvbHZlLm1hcChyZXNvdXJjZUFuZE9wdGlvbiA9PiB0aGlzLnJlc29sdmUocmVzb3VyY2VBbmRPcHRpb24ucmVzb3VyY2UsIHJlc291cmNlQW5kT3B0aW9uLm9wdGlvbnMpKSk7XG5cblx0XHRyZXR1cm4gc3RhdHMubWFwKHN0YXQgPT4gKHsgc3RhdCwgc3VjY2VzczogdHJ1ZSB9KSk7XG5cdH1cblxuXHRyZWFkb25seSBub3RFeGlzdHNTZXQgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblxuXHRhc3luYyBleGlzdHMoX3Jlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuICF0aGlzLm5vdEV4aXN0c1NldC5oYXMoX3Jlc291cmNlKTsgfVxuXG5cdHJlYWRTaG91bGRUaHJvd0Vycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSVJlYWRGaWxlT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUZpbGVDb250ZW50PiB7XG5cdFx0aWYgKHRoaXMucmVhZFNob3VsZFRocm93RXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMucmVhZFNob3VsZFRocm93RXJyb3I7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0UmVhZEZpbGVVcmkgPSByZXNvdXJjZTtcblx0XHR0aGlzLnJlYWRPcGVyYXRpb25zLnB1c2goeyByZXNvdXJjZSB9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jcmVhdGVGaWxlU3RhdChyZXNvdXJjZSwgdGhpcy5yZWFkb25seSksXG5cdFx0XHR2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyh0aGlzLmNvbnRlbnQpXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHJlYWRGaWxlU3RyZWFtKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVTdHJlYW1PcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJRmlsZVN0cmVhbUNvbnRlbnQ+IHtcblx0XHRpZiAodGhpcy5yZWFkU2hvdWxkVGhyb3dFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5yZWFkU2hvdWxkVGhyb3dFcnJvcjtcblx0XHR9XG5cblx0XHR0aGlzLmxhc3RSZWFkRmlsZVVyaSA9IHJlc291cmNlO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCB0aGlzLnJlYWRvbmx5KSxcblx0XHRcdHZhbHVlOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKHRoaXMuY29udGVudCkpXG5cdFx0fTtcblx0fVxuXG5cdHdyaXRlU2hvdWxkVGhyb3dFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0YXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGJ1ZmZlck9yUmVhZGFibGU6IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSwgb3B0aW9ucz86IElXcml0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0aWYgKHRoaXMud3JpdGVTaG91bGRUaHJvd0Vycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLndyaXRlU2hvdWxkVGhyb3dFcnJvcjtcblx0XHR9XG5cblx0XHRsZXQgY29udGVudDogVlNCdWZmZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGJ1ZmZlck9yUmVhZGFibGUgaW5zdGFuY2VvZiBWU0J1ZmZlcikge1xuXHRcdFx0Y29udGVudCA9IGJ1ZmZlck9yUmVhZGFibGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnRlbnQgPSByZWFkYWJsZVRvQnVmZmVyKGJ1ZmZlck9yUmVhZGFibGUpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFNvbWUgcHJlZXhpc3RpbmcgdGVzdHMgYXJlIHdyaXRpbmcgd2l0aCBpbnZhbGlkIG9iamVjdHNcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0dGhpcy53cml0ZU9wZXJhdGlvbnMucHVzaCh7IHJlc291cmNlLCBjb250ZW50OiBjb250ZW50LnRvU3RyaW5nKCkgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCB0aGlzLnJlYWRvbmx5KTtcblx0fVxuXG5cdG1vdmUoX3NvdXJjZTogVVJJLCBfdGFyZ2V0OiBVUkksIF9vdmVyd3JpdGU/OiBib29sZWFuKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoTWV0YWRhdGE+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7IH1cblx0Y29weShfc291cmNlOiBVUkksIF90YXJnZXQ6IFVSSSwgX292ZXJ3cml0ZT86IGJvb2xlYW4pOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTsgfVxuXHRhc3luYyBjbG9uZUZpbGUoX3NvdXJjZTogVVJJLCBfdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRjcmVhdGVGaWxlKF9yZXNvdXJjZTogVVJJLCBfY29udGVudD86IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSwgX29wdGlvbnM/OiBJQ3JlYXRlRmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTsgfVxuXHRjcmVhdGVGb2xkZXIoX3Jlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTsgfVxuXG5cdG9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSBwcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgSUZpbGVTeXN0ZW1Qcm92aWRlcj4oKTtcblxuXHRyZWdpc3RlclByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogSUZpbGVTeXN0ZW1Qcm92aWRlcikge1xuXHRcdHRoaXMucHJvdmlkZXJzLnNldChzY2hlbWUsIHByb3ZpZGVyKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5wcm92aWRlcnMuZGVsZXRlKHNjaGVtZSkpO1xuXHR9XG5cblx0Z2V0UHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5wcm92aWRlcnMuZ2V0KHNjaGVtZSk7XG5cdH1cblxuXHRhc3luYyBhY3RpdmF0ZVByb3ZpZGVyKF9zY2hlbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX29uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyLmZpcmUoeyBzY2hlbWU6IF9zY2hlbWUsIGpvaW46ICgpID0+IHsgfSB9KTtcblx0fVxuXHRhc3luYyBjYW5IYW5kbGVSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiB0aGlzLmhhc1Byb3ZpZGVyKHJlc291cmNlKTsgfVxuXHRoYXNQcm92aWRlcihyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7IHJldHVybiByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fCB0aGlzLnByb3ZpZGVycy5oYXMocmVzb3VyY2Uuc2NoZW1lKTsgfVxuXHRsaXN0Q2FwYWJpbGl0aWVzKCkge1xuXHRcdHJldHVybiBbXG5cdFx0XHR7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBjYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIH0sXG5cdFx0XHQuLi5JdGVyYWJsZS5tYXAodGhpcy5wcm92aWRlcnMsIChbc2NoZW1lLCBwXSkgPT4geyByZXR1cm4geyBzY2hlbWUsIGNhcGFiaWxpdGllczogcC5jYXBhYmlsaXRpZXMgfTsgfSlcblx0XHRdO1xuXHR9XG5cdGhhc0NhcGFiaWxpdHkocmVzb3VyY2U6IFVSSSwgY2FwYWJpbGl0eTogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKTogYm9vbGVhbiB7XG5cdFx0aWYgKGNhcGFiaWxpdHkgPT09IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZSAmJiBpc0xpbnV4KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZ2V0UHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKTtcblxuXHRcdHJldHVybiAhIShwcm92aWRlciAmJiAocHJvdmlkZXIuY2FwYWJpbGl0aWVzICYgY2FwYWJpbGl0eSkpO1xuXHR9XG5cblx0YXN5bmMgZGVsKF9yZXNvdXJjZTogVVJJLCBfb3B0aW9ucz86IHsgdXNlVHJhc2g/OiBib29sZWFuOyByZWN1cnNpdmU/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGNyZWF0ZVdhdGNoZXIocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVdhdGNoT3B0aW9ucyk6IElGaWxlU3lzdGVtV2F0Y2hlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxuXG5cblx0cmVhZG9ubHkgd2F0Y2hlczogVVJJW10gPSBbXTtcblx0d2F0Y2goX3Jlc291cmNlOiBVUkksIG9wdGlvbnM6IElXYXRjaE9wdGlvbnNXaXRoQ29ycmVsYXRpb24pOiBJRmlsZVN5c3RlbVdhdGNoZXI7XG5cdHdhdGNoKF9yZXNvdXJjZTogVVJJKTogSURpc3Bvc2FibGU7XG5cdHdhdGNoKF9yZXNvdXJjZTogVVJJKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMud2F0Y2hlcy5wdXNoKF9yZXNvdXJjZSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMud2F0Y2hlcy5zcGxpY2UodGhpcy53YXRjaGVzLmluZGV4T2YoX3Jlc291cmNlKSwgMSkpO1xuXHR9XG5cblx0Z2V0V3JpdGVFbmNvZGluZyhfcmVzb3VyY2U6IFVSSSk6IElSZXNvdXJjZUVuY29kaW5nIHsgcmV0dXJuIHsgZW5jb2Rpbmc6ICd1dGY4JywgaGFzQk9NOiBmYWxzZSB9OyB9XG5cdGRpc3Bvc2UoKTogdm9pZCB7IH1cblxuXHRhc3luYyBjYW5DcmVhdGVGaWxlKHNvdXJjZTogVVJJLCBvcHRpb25zPzogSUNyZWF0ZUZpbGVPcHRpb25zKTogUHJvbWlzZTxFcnJvciB8IHRydWU+IHsgcmV0dXJuIHRydWU7IH1cblx0YXN5bmMgY2FuTW92ZShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG92ZXJ3cml0ZT86IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBQcm9taXNlPEVycm9yIHwgdHJ1ZT4geyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyBjYW5Db3B5KHNvdXJjZTogVVJJLCB0YXJnZXQ6IFVSSSwgb3ZlcndyaXRlPzogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8RXJyb3IgfCB0cnVlPiB7IHJldHVybiB0cnVlOyB9XG5cdGFzeW5jIGNhbkRlbGV0ZShyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogeyB1c2VUcmFzaD86IGJvb2xlYW4gfCB1bmRlZmluZWQ7IHJlY3Vyc2l2ZT86IGJvb2xlYW4gfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCk6IFByb21pc2U8RXJyb3IgfCB0cnVlPiB7IHJldHVybiB0cnVlOyB9XG59XG5cbi8qKlxuICogVGVzdEZpbGVTZXJ2aWNlIHdpdGggaW4tbWVtb3J5IGZpbGUgc3RvcmFnZS5cbiAqIFVzZSB0aGlzIHdoZW4geW91ciB0ZXN0IG5lZWRzIHRvIHdyaXRlIGZpbGVzIGFuZCByZWFkIHRoZW0gYmFjay5cbiAqL1xuZXhwb3J0IGNsYXNzIEluTWVtb3J5VGVzdEZpbGVTZXJ2aWNlIGV4dGVuZHMgVGVzdEZpbGVTZXJ2aWNlIHtcblxuXHRwcml2YXRlIGZpbGVzID0gbmV3IFJlc291cmNlTWFwPFZTQnVmZmVyPigpO1xuXG5cdG92ZXJyaWRlIGNsZWFyVHJhY2tpbmcoKTogdm9pZCB7XG5cdFx0c3VwZXIuY2xlYXJUcmFja2luZygpO1xuXHRcdHRoaXMuZmlsZXMuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQ+IHtcblx0XHRpZiAodGhpcy5yZWFkU2hvdWxkVGhyb3dFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5yZWFkU2hvdWxkVGhyb3dFcnJvcjtcblx0XHR9XG5cblx0XHR0aGlzLmxhc3RSZWFkRmlsZVVyaSA9IHJlc291cmNlO1xuXHRcdHRoaXMucmVhZE9wZXJhdGlvbnMucHVzaCh7IHJlc291cmNlIH0pO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgd2UgaGF2ZSBjb250ZW50IGluIG91ciBpbi1tZW1vcnkgc3RvcmVcblx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5maWxlcy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5jcmVhdGVGaWxlU3RhdChyZXNvdXJjZSwgdGhpcy5yZWFkb25seSksXG5cdFx0XHRcdHZhbHVlOiBjb250ZW50XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jcmVhdGVGaWxlU3RhdChyZXNvdXJjZSwgdGhpcy5yZWFkb25seSksXG5cdFx0XHR2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyh0aGlzLmNvbnRlbnQpXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBidWZmZXJPclJlYWRhYmxlOiBWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUsIG9wdGlvbnM/OiBJV3JpdGVGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGlmICh0aGlzLndyaXRlU2hvdWxkVGhyb3dFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy53cml0ZVNob3VsZFRocm93RXJyb3I7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbnRlbnQ6IFZTQnVmZmVyO1xuXHRcdGlmIChidWZmZXJPclJlYWRhYmxlIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdGNvbnRlbnQgPSBidWZmZXJPclJlYWRhYmxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250ZW50ID0gcmVhZGFibGVUb0J1ZmZlcihidWZmZXJPclJlYWRhYmxlKTtcblx0XHR9XG5cblx0XHQvLyBTdG9yZSBpbiBtZW1vcnkgYW5kIHRyYWNrXG5cdFx0dGhpcy5maWxlcy5zZXQocmVzb3VyY2UsIGNvbnRlbnQpO1xuXHRcdHRoaXMud3JpdGVPcGVyYXRpb25zLnB1c2goeyByZXNvdXJjZSwgY29udGVudDogY29udGVudC50b1N0cmluZygpIH0pO1xuXG5cdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlLCB0aGlzLnJlYWRvbmx5KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRlbChyZXNvdXJjZTogVVJJLCBfb3B0aW9ucz86IHsgdXNlVHJhc2g/OiBib29sZWFuOyByZWN1cnNpdmU/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmZpbGVzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0dGhpcy5ub3RFeGlzdHNTZXQuc2V0KHJlc291cmNlLCB0cnVlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGV4aXN0cyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgaW5NZW1vcnkgPSB0aGlzLmZpbGVzLmhhcyhyZXNvdXJjZSk7XG5cdFx0aWYgKGluTWVtb3J5KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuZXhpc3RzKHJlc291cmNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdENoYXRFbnRpdGxlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnRleHQ6IExhenk8Q2hhdEVudGl0bGVtZW50Q29udGV4dD4gfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb3JnYW5pc2F0aW9uczogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpc0ludGVybmFsOiBib29sZWFuID0gZmFsc2U7XG5cdHJlYWRvbmx5IHNrdSA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29waWxvdFRyYWNraW5nSWQgPSB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmcgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBxdW90YXMgPSB7fTtcblxuXHR1cGRhdGUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZW50aW1lbnQgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBzZW50aW1lbnRPYnMgPSBvYnNlcnZhYmxlVmFsdWUoe30sIHt9KTtcblx0cmVhZG9ubHkgc2VudGltZW50ID0ge307XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRpdGxlbWVudCA9IEV2ZW50Lk5vbmU7XG5cdGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQgPSBDaGF0RW50aXRsZW1lbnQuVW5rbm93bjtcblx0cmVhZG9ubHkgZW50aXRsZW1lbnRPYnMgPSBvYnNlcnZhYmxlVmFsdWUoe30sIENoYXRFbnRpdGxlbWVudC5Vbmtub3duKTtcblxuXHRyZWFkb25seSBhbm9ueW1vdXMgPSBmYWxzZTtcblx0b25EaWRDaGFuZ2VBbm9ueW1vdXMgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBhbm9ueW1vdXNPYnMgPSBvYnNlcnZhYmxlVmFsdWUoe30sIGZhbHNlKTtcblxuXHRhY2NlcHRRdW90YXMoKTogdm9pZCB7IH1cblx0Y2xlYXJRdW90YXMoKTogdm9pZCB7IH1cblx0bWFya0Fub255bW91c1JhdGVMaW1pdGVkKCk6IHZvaWQgeyB9XG5cdG1hcmtTZXR1cENvbXBsZXRlZCgpOiB2b2lkIHsgfVxuXHRzZXRGb3JjZUhpZGRlbihfaGlkZGVuOiBib29sZWFuKTogdm9pZCB7IH1cblxuXHRyZWFkb25seSBjbGllbnRCeW9rRW5hYmxlZCA9IGZhbHNlO1xuXHRyZWFkb25seSBoYXNCeW9rTW9kZWxzID0gZmFsc2U7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TGlmZWN5Y2xlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTGlmZWN5Y2xlU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0dXNlUGhhc2VzID0gZmFsc2U7XG5cdF9waGFzZSE6IExpZmVjeWNsZVBoYXNlO1xuXHRnZXQgcGhhc2UoKTogTGlmZWN5Y2xlUGhhc2UgeyByZXR1cm4gdGhpcy5fcGhhc2U7IH1cblx0c2V0IHBoYXNlKHZhbHVlOiBMaWZlY3ljbGVQaGFzZSkge1xuXHRcdHRoaXMuX3BoYXNlID0gdmFsdWU7XG5cdFx0aWYgKHZhbHVlID09PSBMaWZlY3ljbGVQaGFzZS5TdGFydGluZykge1xuXHRcdFx0dGhpcy53aGVuU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IExpZmVjeWNsZVBoYXNlLlJlYWR5KSB7XG5cdFx0XHR0aGlzLndoZW5SZWFkeS5jb21wbGV0ZSgpO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKSB7XG5cdFx0XHR0aGlzLndoZW5SZXN0b3JlZC5jb21wbGV0ZSgpO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpIHtcblx0XHRcdHRoaXMud2hlbkV2ZW50dWFsbHkuY29tcGxldGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHdoZW5TdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdoZW5SZWFkeSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVzdG9yZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlbkV2ZW50dWFsbHkgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdGFzeW5jIHdoZW4ocGhhc2U6IExpZmVjeWNsZVBoYXNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnVzZVBoYXNlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocGhhc2UgPT09IExpZmVjeWNsZVBoYXNlLlN0YXJ0aW5nKSB7XG5cdFx0XHRhd2FpdCB0aGlzLndoZW5TdGFydGVkLnA7XG5cdFx0fSBlbHNlIGlmIChwaGFzZSA9PT0gTGlmZWN5Y2xlUGhhc2UuUmVhZHkpIHtcblx0XHRcdGF3YWl0IHRoaXMud2hlblJlYWR5LnA7XG5cdFx0fSBlbHNlIGlmIChwaGFzZSA9PT0gTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMud2hlblJlc3RvcmVkLnA7XG5cdFx0fSBlbHNlIGlmIChwaGFzZSA9PT0gTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSkge1xuXHRcdFx0YXdhaXQgdGhpcy53aGVuRXZlbnR1YWxseS5wO1xuXHRcdH1cblx0fVxuXG5cdHN0YXJ0dXBLaW5kITogU3RhcnR1cEtpbmQ7XG5cdHdpbGxTaHV0ZG93biA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmVmb3JlU2h1dGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnRlcm5hbEJlZm9yZVNodXRkb3duRXZlbnQ+KCkpO1xuXHRnZXQgb25CZWZvcmVTaHV0ZG93bigpOiBFdmVudDxJbnRlcm5hbEJlZm9yZVNodXRkb3duRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uQmVmb3JlU2h1dGRvd24uZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJlZm9yZVNodXRkb3duRXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxCZWZvcmVTaHV0ZG93bkVycm9yRXZlbnQ+KCkpO1xuXHRnZXQgb25CZWZvcmVTaHV0ZG93bkVycm9yKCk6IEV2ZW50PEJlZm9yZVNodXRkb3duRXJyb3JFdmVudD4geyByZXR1cm4gdGhpcy5fb25CZWZvcmVTaHV0ZG93bkVycm9yLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25TaHV0ZG93blZldG8gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uU2h1dGRvd25WZXRvKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uU2h1dGRvd25WZXRvLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2h1dGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxXaWxsU2h1dGRvd25FdmVudD4oKSk7XG5cdGdldCBvbldpbGxTaHV0ZG93bigpOiBFdmVudDxXaWxsU2h1dGRvd25FdmVudD4geyByZXR1cm4gdGhpcy5fb25XaWxsU2h1dGRvd24uZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNodXRkb3duID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZFNodXRkb3duKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkU2h1dGRvd24uZXZlbnQ7IH1cblxuXHRzaHV0ZG93bkpvaW5lcnM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXG5cdGZpcmVTaHV0ZG93bihyZWFzb24gPSBTaHV0ZG93blJlYXNvbi5RVUlUKTogdm9pZCB7XG5cdFx0dGhpcy5zaHV0ZG93bkpvaW5lcnMgPSBbXTtcblxuXHRcdHRoaXMuX29uV2lsbFNodXRkb3duLmZpcmUoe1xuXHRcdFx0am9pbjogcCA9PiB7XG5cdFx0XHRcdHRoaXMuc2h1dGRvd25Kb2luZXJzLnB1c2godHlwZW9mIHAgPT09ICdmdW5jdGlvbicgPyBwKCkgOiBwKTtcblx0XHRcdH0sXG5cdFx0XHRqb2luZXJzOiAoKSA9PiBbXSxcblx0XHRcdGZvcmNlOiAoKSA9PiB7IC8qIE5vLU9wIGluIHRlc3RzICovIH0sXG5cdFx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdHJlYXNvblxuXHRcdH0pO1xuXHR9XG5cblx0ZmlyZUJlZm9yZVNodXRkb3duKGV2ZW50OiBJbnRlcm5hbEJlZm9yZVNodXRkb3duRXZlbnQpOiB2b2lkIHsgdGhpcy5fb25CZWZvcmVTaHV0ZG93bi5maXJlKGV2ZW50KTsgfVxuXG5cdGZpcmVXaWxsU2h1dGRvd24oZXZlbnQ6IFdpbGxTaHV0ZG93bkV2ZW50KTogdm9pZCB7IHRoaXMuX29uV2lsbFNodXRkb3duLmZpcmUoZXZlbnQpOyB9XG5cblx0YXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5maXJlU2h1dGRvd24oKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsZ0JBQWdCLGtCQUFrQixnQkFBa0M7QUFDN0UsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsU0FBUyxtQkFBbUI7QUFDckMsU0FBUyxVQUFVLFNBQVMsdUJBQXVCO0FBQ25ELFNBQVMsV0FBVztBQUVwQixTQUFTLDZCQUE2QjtBQUV0QyxTQUErQyxzQ0FBK2Q7QUFDOWdCLFNBQVMsdUJBQWdDLFVBQVUsa0JBQWtCO0FBRXJFLE9BQU8sYUFBYTtBQUVwQixTQUFTLDhCQUFtRDtBQUM1RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUF5TCxzQkFBaUM7QUFDMU4sU0FBcU8saUNBQWlDO0FBQ3RRLFNBQVMscUJBQXFCO0FBQzlCLFNBQXdELGtCQUFrQjtBQUcxRSxTQUFTLHVCQUF3RTtBQUVqRixTQUFTLDRCQUE0QjtBQUdyQyxTQUFtRixnQkFBZ0Isc0JBQXNEO0FBSXpKLFNBQTJDLCtCQUErQjtBQUduRSxNQUFNLDBCQUEwQixzQkFBc0I7QUFBQSxFQUM1RCxZQUFZLFVBQWdCO0FBQzNCLFVBQU0sU0FBUyxNQUFNLFlBQVksSUFBSSxLQUFLLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxlQUFlLENBQUMsQ0FBQztBQUFBLEVBQ3BGO0FBQUEsRUFDVSxpQkFBMEI7QUFBRSxXQUFPLElBQUksV0FBVztBQUFBLEVBQUc7QUFDaEU7QUFFTyxJQUFNLG9DQUFOLE1BQWtGO0FBQUEsRUFJeEYsWUFDeUMsc0JBQ3ZDO0FBRHVDO0FBQUEsRUFFekM7QUFBQSxFQUVBLE9BQU8sVUFBZSxVQUEyQjtBQUNoRCxVQUFNLE1BQU0sS0FBSyxxQkFBcUIsU0FBUyxhQUFhLEVBQUUsb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3RHLFFBQUksT0FBTyxPQUFPLFFBQVEsWUFBWSxRQUFRLFFBQVE7QUFDckQsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFRLFdBQVcsY0FBZSxPQUFPO0FBQUEsRUFDMUM7QUFDRDtBQWhCYSxvQ0FBTjtBQUFBLEVBS0o7QUFBQSxHQUxVO0FBa0JOLE1BQU0sMkJBQThEO0FBQUEsRUFBcEU7QUFHTixTQUFTLDRCQUE0QixNQUFNO0FBQzNDLFNBQVMsaUJBQWlCLGtCQUFrQixRQUFRLFFBQVEsSUFBSSxLQUFLLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxlQUFlLENBQUMsR0FBRyxJQUFJLEtBQUssT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLGVBQWUsQ0FBQyxDQUFDO0FBQUE7QUFBQSxFQUNsSyxNQUFNLHVCQUFzQztBQUFBLEVBQUU7QUFDL0M7QUFFTyxNQUFNLG1CQUF1RDtBQUFBLEVBUW5FLElBQUksMkJBQXdDO0FBQUUsV0FBTyxLQUFLLDBCQUEwQjtBQUFBLEVBQU87QUFBQSxFQUczRixJQUFJLCtCQUF3RTtBQUFFLFdBQU8sS0FBSyw4QkFBOEI7QUFBQSxFQUFPO0FBQUEsRUFHL0gsSUFBSSw4QkFBbUU7QUFBRSxXQUFPLEtBQUssNkJBQTZCO0FBQUEsRUFBTztBQUFBLEVBR3pILElBQUksNEJBQW1EO0FBQUUsV0FBTyxLQUFLLDJCQUEyQjtBQUFBLEVBQU87QUFBQSxFQUV2RyxZQUFZLFlBQVksZUFBZSxVQUFVLE1BQU07QUFDdEQsU0FBSyxZQUFZO0FBQ2pCLFNBQUssVUFBVSxXQUFXLHVCQUFPLE9BQU8sSUFBSTtBQUM1QyxTQUFLLDRCQUE0QixJQUFJLFFBQWM7QUFDbkQsU0FBSyxnQ0FBZ0MsSUFBSSxRQUEwQztBQUNuRixTQUFLLCtCQUErQixJQUFJLFFBQXNDO0FBQzlFLFNBQUssNkJBQTZCLElBQUksUUFBd0I7QUFBQSxFQUMvRDtBQUFBLEVBRUEsYUFBaUM7QUFDaEMsV0FBTyxLQUFLLFlBQVksS0FBSyxVQUFVLFVBQVUsQ0FBQztBQUFBLEVBQ25EO0FBQUEsRUFFQSxvQkFBb0M7QUFDbkMsUUFBSSxLQUFLLFVBQVUsZUFBZTtBQUNqQyxhQUFPLGVBQWU7QUFBQSxJQUN2QjtBQUVBLFFBQUksS0FBSyxVQUFVLFFBQVEsUUFBUTtBQUNsQyxhQUFPLGVBQWU7QUFBQSxJQUN2QjtBQUVBLFdBQU8sZUFBZTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxtQkFBNEI7QUFDM0IsV0FBTyxLQUFLLGtCQUFrQixNQUFNLGVBQWU7QUFBQSxFQUNwRDtBQUFBLEVBRUEsdUJBQTRDO0FBQzNDLFdBQU8sUUFBUSxRQUFRLEtBQUssYUFBYSxDQUFDO0FBQUEsRUFDM0M7QUFBQSxFQUVBLGVBQTJCO0FBQzFCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLG1CQUFtQixVQUF3QztBQUMxRCxXQUFPLEtBQUssVUFBVSxVQUFVLFFBQVE7QUFBQSxFQUN6QztBQUFBLEVBRUEsYUFBYSxXQUFzQjtBQUNsQyxTQUFLLFlBQVk7QUFBQSxFQUNsQjtBQUFBLEVBRUEsYUFBYTtBQUNaLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLGdCQUFnQjtBQUFBLEVBQUU7QUFBQSxFQUVsQixrQkFBa0IsVUFBd0I7QUFDekMsUUFBSSxZQUFZLEtBQUssV0FBVztBQUMvQixhQUFPLGdCQUFnQixVQUFVLEtBQUssVUFBVSxRQUFRLENBQUMsRUFBRSxHQUFHO0FBQUEsSUFDL0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsV0FBVyx1QkFBb0M7QUFDOUMsV0FBTyxJQUFJLEtBQUssS0FBSyxRQUFRLHFCQUFxQixDQUFDO0FBQUEsRUFDcEQ7QUFBQSxFQUVBLG1CQUFtQixxQkFBNkY7QUFDL0csV0FBTyxJQUFJLE1BQU0sbUJBQW1CLEtBQUssUUFBUSxLQUFLLFVBQVUsUUFBUSxDQUFDLEVBQUUsS0FBSyxtQkFBbUI7QUFBQSxFQUNwRztBQUNEO0FBRU8sTUFBTSwyQkFBMkIsdUJBQXVCO0FBQUEsRUFFOUQsc0JBQXNCLFFBQW1DO0FBQ3hELFVBQU0sa0JBQWtCLE1BQU07QUFBQSxFQUMvQjtBQUNEO0FBRU8sTUFBTSxtQkFBOEM7QUFBQSxFQUkxRCxZQUFvQixNQUFZO0FBQVo7QUFBQSxFQUFjO0FBQUEsRUFFbEMsTUFBTSx5QkFBd0M7QUFBQSxFQUFFO0FBQUEsRUFDaEQsTUFBTSxZQUEyQjtBQUFBLEVBQUU7QUFBQSxFQUNuQyxNQUFNLFNBQXdCO0FBQUEsRUFBRTtBQUFBLEVBQ2hDLE1BQU0sYUFBNEI7QUFBQSxFQUFFO0FBQUEsRUFDcEMsTUFBTSxTQUF3QjtBQUFBLEVBQUU7QUFBQSxFQUNoQyxrQkFBa0IsUUFBa0Q7QUFBQSxFQUFFO0FBQUEsRUFDdEUsUUFBYztBQUFBLEVBQUU7QUFBQSxFQUNoQixzQkFBNEI7QUFBQSxFQUFFO0FBQUEsRUFDOUIsYUFBOEQ7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDM0UsTUFBTSwyQkFBMkIsT0FBd0M7QUFBQSxFQUFFO0FBQUEsRUFDM0UsTUFBTSx5QkFBeUIsT0FBd0M7QUFBQSxFQUFFO0FBQUEsRUFDekUsMkJBQTJCLGVBQXdDO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBTTtBQUFBLEVBQ3ZGLGtCQUFrQixlQUF3QztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQy9FO0FBRU8sTUFBTSx3QkFBd0IsV0FBbUM7QUFBQSxFQWlCdkUsWUFBcUIsVUFBZSxVQUFVLE9BQWdCLFNBQVMsdUJBQXVCO0FBQzdGLFVBQU07QUFEYztBQUF5QztBQWY5RCxTQUFpQixvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3ZFLFNBQVMsbUJBQW1CLEtBQUssa0JBQWtCO0FBRW5ELFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDekUsU0FBUyxxQkFBcUIsS0FBSyxvQkFBb0I7QUFFdkQsU0FBaUIsYUFBYSxLQUFLLFVBQVUsSUFBSSxRQUF5QyxDQUFDO0FBQzNGLFNBQVMsWUFBWSxLQUFLLFdBQVc7QUFFckMsU0FBUyxlQUFlLHdCQUF3QjtBQUloRCxTQUFRLFFBQVE7QUFLZixTQUFLLE9BQU8sU0FBUyxLQUFLLFFBQVE7QUFDbEMsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRUEsU0FBUyxPQUFzQjtBQUM5QixRQUFJLEtBQUssVUFBVSxPQUFPO0FBQ3pCLFdBQUssUUFBUTtBQUNiLFdBQUssa0JBQWtCLEtBQUs7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFdBQVcsU0FBdUI7QUFDakMsU0FBSyxvQkFBb0IsS0FBSztBQUFBLEVBQy9CO0FBQUEsRUFFQSxVQUFtQjtBQUNsQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxhQUFzQjtBQUNyQixXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxNQUFNLEtBQUssU0FBd0IsTUFBZ0Q7QUFDbEYsU0FBSyxXQUFXLEtBQUssRUFBRSxRQUFRLFNBQVMsVUFBVSxXQUFXLFVBQVUsTUFBTSxRQUFRLGVBQWUsS0FBSyxRQUFRLEdBQUcsUUFBUSxTQUFTLE9BQU8sQ0FBQztBQUU3SSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxPQUFPLFNBQXlDO0FBQ3JELFNBQUssU0FBUyxLQUFLO0FBQUEsRUFDcEI7QUFBQSxFQUVBLE1BQU0sT0FBTyxPQUF1RDtBQUNuRSxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQ0Q7QUFFTyxTQUFTLGVBQWUsVUFBZSxXQUFXLE9BQU8sUUFBa0IsYUFBdUIsZ0JBQTBCLFVBQXFJLFlBQTZDO0FBQ3BULFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxNQUFNLEtBQUssSUFBSSxFQUFFLFNBQVM7QUFBQSxJQUMxQixPQUFPLEtBQUssSUFBSTtBQUFBLElBQ2hCLE9BQU8sS0FBSyxJQUFJO0FBQUEsSUFDaEIsTUFBTTtBQUFBLElBQ04sUUFBUSxVQUFVO0FBQUEsSUFDbEIsYUFBYSxlQUFlO0FBQUEsSUFDNUIsZ0JBQWdCLGtCQUFrQjtBQUFBLElBQ2xDO0FBQUEsSUFDQSxRQUFRO0FBQUEsSUFDUixZQUFZLGNBQWM7QUFBQSxJQUMxQixNQUFNLFNBQVMsUUFBUTtBQUFBLElBQ3ZCLFVBQVUsVUFBVSxJQUFJLE9BQUssZUFBZSxFQUFFLFVBQVUsT0FBTyxFQUFFLFFBQVEsRUFBRSxhQUFhLEVBQUUsZ0JBQWdCLFFBQVcsRUFBRSxVQUFVLENBQUM7QUFBQSxFQUNuSTtBQUNEO0FBRU8sTUFBTSwyQkFBOEQ7QUFBQSxFQUFwRTtBQUlOLFNBQVMsb0NBQWlFLE1BQU07QUFDaEYsU0FBUyxvQ0FBaUUsTUFBTTtBQUNoRixTQUFTLG1DQUFnRSxNQUFNO0FBSS9FLFNBQVMsc0JBQXNCO0FBQUE7QUFBQSxFQUYvQiw0QkFBNEIsYUFBZ0U7QUFBRSxXQUFPLFdBQVc7QUFBQSxFQUFNO0FBQUEsRUFHdEgsbUJBQW1CLGFBQWlFO0FBQUUsV0FBTyxXQUFXO0FBQUEsRUFBTTtBQUFBLEVBQzlHLE1BQU0sb0JBQW9CLGFBQTJCLFNBQXVELFVBQW9DLE9BQXlDO0FBQUEsRUFBRTtBQUFBLEVBRTNMLE1BQU0sT0FBTyxZQUFnQyxPQUEwQixVQUFzRDtBQUFBLEVBQUU7QUFBQSxFQUUvSCw0QkFBNEIsVUFBa0U7QUFBRSxXQUFPLFdBQVc7QUFBQSxFQUFNO0FBQUEsRUFFeEgsU0FBUyxVQUErQjtBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUVyRCxPQUFPLFlBQW9DLE9BQTBCLFVBQXlFO0FBQUUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFBRztBQUFBLEVBQzVMLGFBQWEsWUFBZ0MsT0FBMEIsVUFBeUU7QUFBRSxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUFHO0FBQUEsRUFFOUwsS0FBSyxZQUE4QixPQUEwQixVQUF5RTtBQUFFLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQUc7QUFBQSxFQUVwTCxLQUFLLFlBQThCLE9BQTBCLFVBQXlFO0FBQUUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFBRztBQUNyTDtBQUVPLFNBQVMsT0FBbUI7QUFFbEMsU0FBTyxXQUFZO0FBQUEsRUFBRTtBQUN0QjtBQU1PLE1BQU0sNkJBQTZCLHFCQUFxQjtBQUFFO0FBRTFELE1BQU0scUJBQXFCLEVBQUUsZUFBZSxRQUFXLEdBQUcsUUFBUTtBQUVsRSxNQUFNLG9CQUFnRDtBQUFBLEVBQXREO0FBRU4sK0JBQXNCLE1BQU07QUFBQTtBQUFBLEVBQzVCLDJCQUEyQixpQkFBc0M7QUFDaEUsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBQ0EsWUFBWSxJQUF5QjtBQUNwQyxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQUEsRUFDQSwwQkFBMEIsaUJBQXlCLE9BQStCO0FBQ2pGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxpQkFBaUIsUUFBZ0IsT0FBK0I7QUFDL0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLHFCQUFxQixVQUFrQztBQUN0RCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsbUJBQW1CLFVBQWtDO0FBQ3BELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxVQUFVO0FBQUEsRUFBRTtBQUNiO0FBRU8sTUFBTSxnQ0FBZ0MsSUFBSSxNQUE0QztBQUFBLEVBQTVDO0FBSWhELFNBQVMsbUNBQW1DLE1BQU07QUFDbEQsU0FBUyw4QkFBOEIsTUFBTTtBQUM3QyxTQUFTLHNCQUFzQixNQUFNO0FBQ3JDLFNBQVMsOEJBQThCLE1BQU07QUFFN0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFBQTtBQUFBLEVBRWhDLDJCQUFtRDtBQUFFLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQUc7QUFBQSxFQUNqRyxrQkFBaUM7QUFBRSxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUFHO0FBQUEsRUFDL0Usd0JBQWlDO0FBQUUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFBRztBQUFBLEVBQy9FLGlCQUFnQztBQUFFLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQUc7QUFBQSxFQUM5RSw4QkFBOEIsa0JBQWtEO0FBQUUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFBRztBQUFBLEVBQzlILGdCQUFnQixrQkFBa0Q7QUFBRSxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUFHO0FBQUEsRUFDaEgsV0FBVyxVQUFlLE1BQTJDO0FBQUUsV0FBTztBQUFBLEVBQU87QUFBQSxFQUNyRixNQUFNLGVBQWUsV0FBd0IsV0FBd0Q7QUFBQSxFQUFFO0FBQUEsRUFDdkcscUJBQXFCLFVBQWUsVUFBd0M7QUFBRSxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUFHO0FBQzNIO0FBRU8sTUFBTSxvQ0FBZ0Y7QUFBQSxFQUc1RixZQUFvQixZQUFxQixNQUFNO0FBQTNCO0FBQUEsRUFBNkI7QUFBQSxFQUVqRCwwQkFBbUM7QUFDbEMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBRU8sTUFBTSw0Q0FBNEMsV0FBdUQ7QUFBQSxFQWEvRyxZQUNTLFVBQW1CLE1BQ25CLGNBQTJCLElBQUksWUFBWSxHQUNsRDtBQUNELFVBQU07QUFIRTtBQUNBO0FBWlQsU0FBUSxvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBaUIsQ0FBQztBQUNqRSw0QkFBbUIsS0FBSyxrQkFBa0I7QUFFMUMsU0FBUSw2QkFBNkIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3ZFLHFDQUE0QixLQUFLLDJCQUEyQjtBQUU1RCxTQUFRLCtDQUErQyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDekYsdURBQThDLEtBQUssNkNBQTZDO0FBQUEsRUFRaEc7QUFBQSxFQUVBLElBQUksNkJBQXNDO0FBQ3pDLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxJQUFJLDJCQUEyQixPQUFnQjtBQUM5QyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBRUEsdUNBQXVDLGFBQWdFO0FBQ3RHLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxpQkFBd0I7QUFDdkIsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLHFCQUFxQixTQUFpQztBQUNyRCxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBRUEsZ0JBQWdCLEtBQTJDO0FBQzFELFdBQU8sUUFBUSxRQUFRLEVBQUUsU0FBUyxLQUFLLFlBQVksSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDO0FBQUEsRUFDbkU7QUFBQSxFQUVBLE1BQU0sZUFBZSxTQUErQjtBQUNuRCxTQUFLLGNBQWMsSUFBSSxZQUFZLE9BQU87QUFBQSxFQUMzQztBQUFBLEVBRUEsTUFBTSxhQUFhLE1BQWEsU0FBaUM7QUFDaEUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLDBCQUFtQztBQUNsQyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBRUEsdUJBQWdDO0FBQy9CLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxxQkFBOEI7QUFDN0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEseUJBQWtDO0FBQ2pDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxJQUFJLDRCQUEyQztBQUM5QyxXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxJQUFJLG9CQUFtQztBQUN0QyxXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixTQUFpQztBQUN4RCxRQUFJLEtBQUssWUFBWSxTQUFTO0FBQzdCLFdBQUssVUFBVTtBQUNmLFdBQUssa0JBQWtCLEtBQUssS0FBSyxPQUFPO0FBQUEsSUFDekM7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxNQUFNLHlDQUF5QyxXQUFvRDtBQUFBLEVBZXpHLFlBQTZCLFVBQW1CO0FBQy9DLFVBQU07QUFEc0I7QUFaN0IsU0FBaUIsc0NBQXNDLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN6RixTQUFTLHFDQUFxQyxLQUFLLG9DQUFvQztBQUV2RixTQUFpQixzQ0FBc0MsS0FBSyxVQUFVLElBQUksUUFBcUMsQ0FBQztBQUNoSCxTQUFTLHFDQUFxQyxLQUFLLG9DQUFvQztBQUV2RixTQUFpQixzQ0FBc0MsS0FBSyxVQUFVLElBQUksUUFBc0MsQ0FBQztBQUNqSCxTQUFTLHFDQUFxQyxLQUFLLG9DQUFvQztBQUV2RixTQUFpQiwrQ0FBK0MsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2xHLFNBQVMsOENBQThDLEtBQUssNkNBQTZDO0FBTXpHLGtDQUF5QixPQUFPLFNBQWdCO0FBQy9DLGFBQU8sMEJBQTBCO0FBQUEsSUFDbEM7QUFBQSxFQUpBO0FBQUEsRUFNQSxzQkFBc0IsTUFBaUQ7QUFDdEUsV0FBTyxLQUFLLHVCQUF1QixJQUFJO0FBQUEsRUFDeEM7QUFBQSxFQUVBLE1BQU0sOEJBQThCLFFBQW1DLGNBQXNDO0FBQzVHLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxNQUFNLDhCQUE4QixLQUFVLFFBQWtEO0FBQy9GLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxNQUFNLHNCQUFzQixTQUFvRTtBQUMvRixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSw4QkFBb0M7QUFDbkMsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLE1BQU0sOEJBQThCLFNBQWtDO0FBQ3JFLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxNQUFNLHNCQUFzQixTQUEwRDtBQUNyRixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxpQ0FBdUM7QUFDdEMsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFDRDtBQUVPLE1BQU0sa0JBQTRDO0FBQUEsRUFBbEQ7QUFJTiwyQkFBa0IsTUFBTTtBQUFBO0FBQUEsRUFFeEIsZ0JBQWtDO0FBQUUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFBRztBQUFBLEVBQ2hGLFVBQVUsT0FBZSxVQUFlLFNBQThCO0FBQUEsRUFBRTtBQUFBLEVBQ3hFLFVBQVUsT0FBZSxNQUErQjtBQUFBLEVBQUU7QUFBQSxFQUMxRCxPQUFPLE9BQWUsV0FBd0I7QUFBQSxFQUFFO0FBQUEsRUFDaEQsS0FBSyxRQUF3SjtBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUMxSyxzQkFBc0IsVUFBZSxRQUE2QjtBQUNqRSxXQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsSUFBc0MsRUFBRTtBQUFBLEVBQ2pFO0FBQ0Q7QUFFTyxNQUFNLGdCQUF3QztBQUFBLEVBQTlDO0FBSU4sU0FBaUIsb0JBQW9CLElBQUksUUFBMEI7QUFJbkUsU0FBaUIscUJBQXFCLElBQUksUUFBNEI7QUFJdEUsU0FBaUIsNkNBQTZDLElBQUksUUFBb0Q7QUFJdEgsU0FBUSxvQ0FBb0MsSUFBSSxRQUE0QztBQUM1RixTQUFTLG1DQUFtQyxLQUFLLGtDQUFrQztBQUNuRixTQUFTLGtCQUFrQixNQUFNO0FBRWpDLFNBQVUsVUFBVTtBQUdwQixvQkFBVztBQUdYO0FBQUEsU0FBUyxrQkFBNkQsQ0FBQztBQUN2RSxTQUFTLGlCQUEyQyxDQUFDO0FBZ0NyRCxTQUFTLGVBQWUsSUFBSSxZQUFxQjtBQUlqRCxnQ0FBMEM7QUE2QjFDLGlDQUEyQztBQWlDM0Msc0RBQTZDLE1BQU07QUFFbkQsU0FBUSxZQUFZLG9CQUFJLElBQWlDO0FBMkN6RCxTQUFTLFVBQWlCLENBQUM7QUFBQTtBQUFBLEVBckszQixJQUFJLG1CQUE0QztBQUFFLFdBQU8sS0FBSyxrQkFBa0I7QUFBQSxFQUFPO0FBQUEsRUFDdkYsZ0JBQWdCLE9BQStCO0FBQUUsU0FBSyxrQkFBa0IsS0FBSyxLQUFLO0FBQUEsRUFBRztBQUFBLEVBR3JGLElBQUksb0JBQStDO0FBQUUsV0FBTyxLQUFLLG1CQUFtQjtBQUFBLEVBQU87QUFBQSxFQUMzRixtQkFBbUIsT0FBaUM7QUFBRSxTQUFLLG1CQUFtQixLQUFLLEtBQUs7QUFBQSxFQUFHO0FBQUEsRUFHM0YsSUFBSSw0Q0FBK0Y7QUFBRSxXQUFPLEtBQUssMkNBQTJDO0FBQUEsRUFBTztBQUFBLEVBQ25LLDhDQUE4QyxPQUF5RDtBQUFFLFNBQUssMkNBQTJDLEtBQUssS0FBSztBQUFBLEVBQUc7QUFBQSxFQWV0SyxXQUFXLFNBQXVCO0FBQUUsU0FBSyxVQUFVO0FBQUEsRUFBUztBQUFBLEVBQzVELGFBQXFCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBUztBQUFBLEVBQzVDLHFCQUEwQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWlCO0FBQUE7QUFBQSxFQUd6RCxnQkFBc0I7QUFDckIsU0FBSyxnQkFBZ0IsU0FBUztBQUM5QixTQUFLLGVBQWUsU0FBUztBQUFBLEVBQzlCO0FBQUEsRUFJQSxNQUFNLFFBQVEsVUFBZSxVQUFvRDtBQUNoRixXQUFPLGVBQWUsVUFBVSxLQUFLLFFBQVE7QUFBQSxFQUM5QztBQUFBLEVBRUEsS0FBSyxVQUFzRDtBQUMxRCxXQUFPLEtBQUssUUFBUSxVQUFVLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUFBLEVBQ3hEO0FBQUEsRUFFQSxNQUFNLFNBQVMsVUFBNkI7QUFDM0MsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sV0FBVyxXQUEyRjtBQUMzRyxVQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksVUFBVSxJQUFJLHVCQUFxQixLQUFLLFFBQVEsa0JBQWtCLFVBQVUsa0JBQWtCLE9BQU8sQ0FBQyxDQUFDO0FBRXZJLFdBQU8sTUFBTSxJQUFJLFdBQVMsRUFBRSxNQUFNLFNBQVMsS0FBSyxFQUFFO0FBQUEsRUFDbkQ7QUFBQSxFQUlBLE1BQU0sT0FBTyxXQUFrQztBQUFFLFdBQU8sQ0FBQyxLQUFLLGFBQWEsSUFBSSxTQUFTO0FBQUEsRUFBRztBQUFBLEVBSTNGLE1BQU0sU0FBUyxVQUFlLFNBQStEO0FBQzVGLFFBQUksS0FBSyxzQkFBc0I7QUFDOUIsWUFBTSxLQUFLO0FBQUEsSUFDWjtBQUVBLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssZUFBZSxLQUFLLEVBQUUsU0FBUyxDQUFDO0FBRXJDLFdBQU87QUFBQSxNQUNOLEdBQUcsZUFBZSxVQUFVLEtBQUssUUFBUTtBQUFBLE1BQ3pDLE9BQU8sU0FBUyxXQUFXLEtBQUssT0FBTztBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQWUsU0FBMkU7QUFDOUcsUUFBSSxLQUFLLHNCQUFzQjtBQUM5QixZQUFNLEtBQUs7QUFBQSxJQUNaO0FBRUEsU0FBSyxrQkFBa0I7QUFFdkIsV0FBTztBQUFBLE1BQ04sR0FBRyxlQUFlLFVBQVUsS0FBSyxRQUFRO0FBQUEsTUFDekMsT0FBTyxlQUFlLFNBQVMsV0FBVyxLQUFLLE9BQU8sQ0FBQztBQUFBLElBQ3hEO0FBQUEsRUFDRDtBQUFBLEVBSUEsTUFBTSxVQUFVLFVBQWUsa0JBQStDLFNBQTZEO0FBQzFJLFVBQU0sUUFBUSxDQUFDO0FBRWYsUUFBSSxLQUFLLHVCQUF1QjtBQUMvQixZQUFNLEtBQUs7QUFBQSxJQUNaO0FBRUEsUUFBSTtBQUNKLFFBQUksNEJBQTRCLFVBQVU7QUFDekMsZ0JBQVU7QUFBQSxJQUNYLE9BQU87QUFDTixVQUFJO0FBQ0gsa0JBQVUsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQzVDLFFBQVE7QUFBQSxNQUVSO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUztBQUNaLFdBQUssZ0JBQWdCLEtBQUssRUFBRSxVQUFVLFNBQVMsUUFBUSxTQUFTLEVBQUUsQ0FBQztBQUFBLElBQ3BFO0FBRUEsV0FBTyxlQUFlLFVBQVUsS0FBSyxRQUFRO0FBQUEsRUFDOUM7QUFBQSxFQUVBLEtBQUssU0FBYyxTQUFjLFlBQXNEO0FBQUUsV0FBTyxRQUFRLFFBQVEsSUFBSztBQUFBLEVBQUc7QUFBQSxFQUN4SCxLQUFLLFNBQWMsU0FBYyxZQUFzRDtBQUFFLFdBQU8sUUFBUSxRQUFRLElBQUs7QUFBQSxFQUFHO0FBQUEsRUFDeEgsTUFBTSxVQUFVLFNBQWMsU0FBNkI7QUFBQSxFQUFFO0FBQUEsRUFDN0QsV0FBVyxXQUFnQixVQUF3QyxVQUErRDtBQUFFLFdBQU8sUUFBUSxRQUFRLElBQUs7QUFBQSxFQUFHO0FBQUEsRUFDbkssYUFBYSxXQUFnRDtBQUFFLFdBQU8sUUFBUSxRQUFRLElBQUs7QUFBQSxFQUFHO0FBQUEsRUFNOUYsaUJBQWlCLFFBQWdCLFVBQStCO0FBQy9ELFNBQUssVUFBVSxJQUFJLFFBQVEsUUFBUTtBQUVuQyxXQUFPLGFBQWEsTUFBTSxLQUFLLFVBQVUsT0FBTyxNQUFNLENBQUM7QUFBQSxFQUN4RDtBQUFBLEVBRUEsWUFBWSxRQUFnQjtBQUMzQixXQUFPLEtBQUssVUFBVSxJQUFJLE1BQU07QUFBQSxFQUNqQztBQUFBLEVBRUEsTUFBTSxpQkFBaUIsU0FBZ0M7QUFDdEQsU0FBSyxrQ0FBa0MsS0FBSyxFQUFFLFFBQVEsU0FBUyxNQUFNLE1BQU07QUFBQSxJQUFFLEVBQUUsQ0FBQztBQUFBLEVBQ2pGO0FBQUEsRUFDQSxNQUFNLGtCQUFrQixVQUFpQztBQUFFLFdBQU8sS0FBSyxZQUFZLFFBQVE7QUFBQSxFQUFHO0FBQUEsRUFDOUYsWUFBWSxVQUF3QjtBQUFFLFdBQU8sU0FBUyxXQUFXLFFBQVEsUUFBUSxLQUFLLFVBQVUsSUFBSSxTQUFTLE1BQU07QUFBQSxFQUFHO0FBQUEsRUFDdEgsbUJBQW1CO0FBQ2xCLFdBQU87QUFBQSxNQUNOLEVBQUUsUUFBUSxRQUFRLE1BQU0sY0FBYywrQkFBK0IsdUJBQXVCO0FBQUEsTUFDNUYsR0FBRyxTQUFTLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTTtBQUFFLGVBQU8sRUFBRSxRQUFRLGNBQWMsRUFBRSxhQUFhO0FBQUEsTUFBRyxDQUFDO0FBQUEsSUFDdEc7QUFBQSxFQUNEO0FBQUEsRUFDQSxjQUFjLFVBQWUsWUFBcUQ7QUFDakYsUUFBSSxlQUFlLCtCQUErQixxQkFBcUIsU0FBUztBQUMvRSxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sV0FBVyxLQUFLLFlBQVksU0FBUyxNQUFNO0FBRWpELFdBQU8sQ0FBQyxFQUFFLFlBQWEsU0FBUyxlQUFlO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLE1BQU0sSUFBSSxXQUFnQixVQUF1RTtBQUFBLEVBQUU7QUFBQSxFQUVuRyxjQUFjLFVBQWUsU0FBNEM7QUFDeEUsV0FBTztBQUFBLE1BQ04sYUFBYSxNQUFNO0FBQUEsTUFDbkIsU0FBUyxNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBLEVBTUEsTUFBTSxXQUE2QjtBQUNsQyxTQUFLLFFBQVEsS0FBSyxTQUFTO0FBRTNCLFdBQU8sYUFBYSxNQUFNLEtBQUssUUFBUSxPQUFPLEtBQUssUUFBUSxRQUFRLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUNsRjtBQUFBLEVBRUEsaUJBQWlCLFdBQW1DO0FBQUUsV0FBTyxFQUFFLFVBQVUsUUFBUSxRQUFRLE1BQU07QUFBQSxFQUFHO0FBQUEsRUFDbEcsVUFBZ0I7QUFBQSxFQUFFO0FBQUEsRUFFbEIsTUFBTSxjQUFjLFFBQWEsU0FBcUQ7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQ3JHLE1BQU0sUUFBUSxRQUFhLFFBQWEsV0FBd0Q7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQy9HLE1BQU0sUUFBUSxRQUFhLFFBQWEsV0FBd0Q7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQy9HLE1BQU0sVUFBVSxVQUFlLFNBQWtIO0FBQUUsV0FBTztBQUFBLEVBQU07QUFDaks7QUFNTyxNQUFNLGdDQUFnQyxnQkFBZ0I7QUFBQSxFQUF0RDtBQUFBO0FBRU4sU0FBUSxRQUFRLElBQUksWUFBc0I7QUFBQTtBQUFBLEVBRWpDLGdCQUFzQjtBQUM5QixVQUFNLGNBQWM7QUFDcEIsU0FBSyxNQUFNLE1BQU07QUFBQSxFQUNsQjtBQUFBLEVBRUEsTUFBZSxTQUFTLFVBQWUsU0FBK0Q7QUFDckcsUUFBSSxLQUFLLHNCQUFzQjtBQUM5QixZQUFNLEtBQUs7QUFBQSxJQUNaO0FBRUEsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxlQUFlLEtBQUssRUFBRSxTQUFTLENBQUM7QUFHckMsVUFBTSxVQUFVLEtBQUssTUFBTSxJQUFJLFFBQVE7QUFDdkMsUUFBSSxTQUFTO0FBQ1osYUFBTztBQUFBLFFBQ04sR0FBRyxlQUFlLFVBQVUsS0FBSyxRQUFRO0FBQUEsUUFDekMsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLE1BQ04sR0FBRyxlQUFlLFVBQVUsS0FBSyxRQUFRO0FBQUEsTUFDekMsT0FBTyxTQUFTLFdBQVcsS0FBSyxPQUFPO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFlLFVBQVUsVUFBZSxrQkFBK0MsU0FBNkQ7QUFDbkosVUFBTSxRQUFRLENBQUM7QUFFZixRQUFJLEtBQUssdUJBQXVCO0FBQy9CLFlBQU0sS0FBSztBQUFBLElBQ1o7QUFFQSxRQUFJO0FBQ0osUUFBSSw0QkFBNEIsVUFBVTtBQUN6QyxnQkFBVTtBQUFBLElBQ1gsT0FBTztBQUNOLGdCQUFVLGlCQUFpQixnQkFBZ0I7QUFBQSxJQUM1QztBQUdBLFNBQUssTUFBTSxJQUFJLFVBQVUsT0FBTztBQUNoQyxTQUFLLGdCQUFnQixLQUFLLEVBQUUsVUFBVSxTQUFTLFFBQVEsU0FBUyxFQUFFLENBQUM7QUFFbkUsV0FBTyxlQUFlLFVBQVUsS0FBSyxRQUFRO0FBQUEsRUFDOUM7QUFBQSxFQUVBLE1BQWUsSUFBSSxVQUFlLFVBQXVFO0FBQ3hHLFNBQUssTUFBTSxPQUFPLFFBQVE7QUFDMUIsU0FBSyxhQUFhLElBQUksVUFBVSxJQUFJO0FBQUEsRUFDckM7QUFBQSxFQUVBLE1BQWUsT0FBTyxVQUFpQztBQUN0RCxVQUFNLFdBQVcsS0FBSyxNQUFNLElBQUksUUFBUTtBQUN4QyxRQUFJLFVBQVU7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sTUFBTSxPQUFPLFFBQVE7QUFBQSxFQUM3QjtBQUNEO0FBRU8sTUFBTSwyQkFBOEQ7QUFBQSxFQUFwRTtBQU9OLFNBQVMsYUFBc0I7QUFDL0IsU0FBUyxNQUFNO0FBQ2YsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUywyQkFBMkIsTUFBTTtBQUMxQyxTQUFTLDRCQUE0QixNQUFNO0FBQzNDLFNBQVMsK0JBQStCLE1BQU07QUFDOUMsU0FBUyxTQUFTLENBQUM7QUFNbkIsU0FBUyx1QkFBdUIsTUFBTTtBQUN0QyxTQUFTLGVBQWUsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDOUMsU0FBUyxZQUFZLENBQUM7QUFFdEIsU0FBUyx5QkFBeUIsTUFBTTtBQUN4Qyx1QkFBK0IsZ0JBQWdCO0FBQy9DLFNBQVMsaUJBQWlCLGdCQUFnQixDQUFDLEdBQUcsZ0JBQWdCLE9BQU87QUFFckUsU0FBUyxZQUFZO0FBQ3JCLGdDQUF1QixNQUFNO0FBQzdCLFNBQVMsZUFBZSxnQkFBZ0IsQ0FBQyxHQUFHLEtBQUs7QUFRakQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFBQTtBQUFBLEVBdkJ6QixPQUFPLE9BQXlDO0FBQy9DLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFjQSxlQUFxQjtBQUFBLEVBQUU7QUFBQSxFQUN2QixjQUFvQjtBQUFBLEVBQUU7QUFBQSxFQUN0QiwyQkFBaUM7QUFBQSxFQUFFO0FBQUEsRUFDbkMscUJBQTJCO0FBQUEsRUFBRTtBQUFBLEVBQzdCLGVBQWUsU0FBd0I7QUFBQSxFQUFFO0FBSTFDO0FBRU8sTUFBTSw2QkFBNkIsV0FBd0M7QUFBQSxFQUEzRTtBQUFBO0FBSU4scUJBQVk7QUFnQlosU0FBaUIsY0FBYyxJQUFJLGdCQUFzQjtBQUN6RCxTQUFpQixZQUFZLElBQUksZ0JBQXNCO0FBQ3ZELFNBQWlCLGVBQWUsSUFBSSxnQkFBc0I7QUFDMUQsU0FBaUIsaUJBQWlCLElBQUksZ0JBQXNCO0FBaUI1RCx3QkFBZTtBQUVmLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxRQUFxQyxDQUFDO0FBRzlGLFNBQWlCLHlCQUF5QixLQUFLLFVBQVUsSUFBSSxRQUFrQyxDQUFDO0FBR2hHLFNBQWlCLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFHckUsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLFFBQTJCLENBQUM7QUFHbEYsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUdwRSwyQkFBbUMsQ0FBQztBQUFBO0FBQUEsRUFuRHBDLElBQUksUUFBd0I7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFRO0FBQUEsRUFDbEQsSUFBSSxNQUFNLE9BQXVCO0FBQ2hDLFNBQUssU0FBUztBQUNkLFFBQUksVUFBVSxlQUFlLFVBQVU7QUFDdEMsV0FBSyxZQUFZLFNBQVM7QUFBQSxJQUMzQixXQUFXLFVBQVUsZUFBZSxPQUFPO0FBQzFDLFdBQUssVUFBVSxTQUFTO0FBQUEsSUFDekIsV0FBVyxVQUFVLGVBQWUsVUFBVTtBQUM3QyxXQUFLLGFBQWEsU0FBUztBQUFBLElBQzVCLFdBQVcsVUFBVSxlQUFlLFlBQVk7QUFDL0MsV0FBSyxlQUFlLFNBQVM7QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFBQSxFQU1BLE1BQU0sS0FBSyxPQUFzQztBQUNoRCxRQUFJLENBQUMsS0FBSyxXQUFXO0FBQ3BCO0FBQUEsSUFDRDtBQUNBLFFBQUksVUFBVSxlQUFlLFVBQVU7QUFDdEMsWUFBTSxLQUFLLFlBQVk7QUFBQSxJQUN4QixXQUFXLFVBQVUsZUFBZSxPQUFPO0FBQzFDLFlBQU0sS0FBSyxVQUFVO0FBQUEsSUFDdEIsV0FBVyxVQUFVLGVBQWUsVUFBVTtBQUM3QyxZQUFNLEtBQUssYUFBYTtBQUFBLElBQ3pCLFdBQVcsVUFBVSxlQUFlLFlBQVk7QUFDL0MsWUFBTSxLQUFLLGVBQWU7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQU1BLElBQUksbUJBQXVEO0FBQUUsV0FBTyxLQUFLLGtCQUFrQjtBQUFBLEVBQU87QUFBQSxFQUdsRyxJQUFJLHdCQUF5RDtBQUFFLFdBQU8sS0FBSyx1QkFBdUI7QUFBQSxFQUFPO0FBQUEsRUFHekcsSUFBSSxpQkFBOEI7QUFBRSxXQUFPLEtBQUssZ0JBQWdCO0FBQUEsRUFBTztBQUFBLEVBR3ZFLElBQUksaUJBQTJDO0FBQUUsV0FBTyxLQUFLLGdCQUFnQjtBQUFBLEVBQU87QUFBQSxFQUdwRixJQUFJLGdCQUE2QjtBQUFFLFdBQU8sS0FBSyxlQUFlO0FBQUEsRUFBTztBQUFBLEVBSXJFLGFBQWEsU0FBUyxlQUFlLE1BQVk7QUFDaEQsU0FBSyxrQkFBa0IsQ0FBQztBQUV4QixTQUFLLGdCQUFnQixLQUFLO0FBQUEsTUFDekIsTUFBTSxPQUFLO0FBQ1YsYUFBSyxnQkFBZ0IsS0FBSyxPQUFPLE1BQU0sYUFBYSxFQUFFLElBQUksQ0FBQztBQUFBLE1BQzVEO0FBQUEsTUFDQSxTQUFTLE1BQU0sQ0FBQztBQUFBLE1BQ2hCLE9BQU8sTUFBTTtBQUFBLE1BQXVCO0FBQUEsTUFDcEMsT0FBTyxrQkFBa0I7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLG1CQUFtQixPQUEwQztBQUFFLFNBQUssa0JBQWtCLEtBQUssS0FBSztBQUFBLEVBQUc7QUFBQSxFQUVuRyxpQkFBaUIsT0FBZ0M7QUFBRSxTQUFLLGdCQUFnQixLQUFLLEtBQUs7QUFBQSxFQUFHO0FBQUEsRUFFckYsTUFBTSxXQUEwQjtBQUMvQixTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
