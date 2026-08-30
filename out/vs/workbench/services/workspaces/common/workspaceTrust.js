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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { getRemoteAuthority } from "../../../../platform/remote/common/remoteHosts.js";
import { isVirtualResource } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { AGENT_HOST_SCHEME } from "../../../../platform/agentHost/common/agentHostUri.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { isSavedWorkspace, isSingleFolderWorkspaceIdentifier, isTemporaryWorkspace, IWorkspaceContextService, toWorkspaceIdentifier, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, WorkspaceTrustUriResponse, IWorkspaceTrustEnablementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { Memento } from "../../../common/memento.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { isEqualAuthority } from "../../../../base/common/resources.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { promiseWithResolvers } from "../../../../base/common/async.js";
import { ResourceMap } from "../../../../base/common/map.js";
const WORKSPACE_TRUST_ENABLED = "security.workspace.trust.enabled";
const WORKSPACE_TRUST_STARTUP_PROMPT = "security.workspace.trust.startupPrompt";
const WORKSPACE_TRUST_BANNER = "security.workspace.trust.banner";
const WORKSPACE_TRUST_UNTRUSTED_FILES = "security.workspace.trust.untrustedFiles";
const WORKSPACE_TRUST_EMPTY_WINDOW = "security.workspace.trust.emptyWindow";
const WORKSPACE_TRUST_EXTENSION_SUPPORT = "extensions.supportUntrustedWorkspaces";
const WORKSPACE_TRUST_STORAGE_KEY = "content.trust.model.key";
class CanonicalWorkspace {
  constructor(originalWorkspace, canonicalFolderUris, canonicalConfiguration) {
    this.originalWorkspace = originalWorkspace;
    this.canonicalFolderUris = canonicalFolderUris;
    this.canonicalConfiguration = canonicalConfiguration;
  }
  get folders() {
    return this.originalWorkspace.folders.map((folder, index) => {
      return {
        index: folder.index,
        name: folder.name,
        toResource: folder.toResource,
        uri: this.canonicalFolderUris[index]
      };
    });
  }
  get transient() {
    return this.originalWorkspace.transient;
  }
  get configuration() {
    return this.canonicalConfiguration ?? this.originalWorkspace.configuration;
  }
  get id() {
    return this.originalWorkspace.id;
  }
}
let WorkspaceTrustEnablementService = class extends Disposable {
  constructor(configurationService, environmentService) {
    super();
    this.configurationService = configurationService;
    this.environmentService = environmentService;
  }
  isWorkspaceTrustEnabled() {
    if (this.environmentService.disableWorkspaceTrust) {
      return false;
    }
    return !!this.configurationService.getValue(WORKSPACE_TRUST_ENABLED);
  }
};
WorkspaceTrustEnablementService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IWorkbenchEnvironmentService)
], WorkspaceTrustEnablementService);
let WorkspaceTrustManagementService = class extends Disposable {
  constructor(configurationService, remoteAuthorityResolverService, storageService, uriIdentityService, environmentService, workspaceService, workspaceTrustEnablementService, fileService) {
    super();
    this.configurationService = configurationService;
    this.remoteAuthorityResolverService = remoteAuthorityResolverService;
    this.storageService = storageService;
    this.uriIdentityService = uriIdentityService;
    this.environmentService = environmentService;
    this.workspaceService = workspaceService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.fileService = fileService;
    this.storageKey = WORKSPACE_TRUST_STORAGE_KEY;
    this._onDidChangeTrust = this._register(new Emitter());
    this.onDidChangeTrust = this._onDidChangeTrust.event;
    this._onDidChangeTrustedFolders = this._register(new Emitter());
    this.onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;
    this._canonicalStartupFiles = [];
    this._canonicalUrisResolved = false;
    this._canonicalWorkspace = this.workspaceService.getWorkspace();
    ({ promise: this._workspaceResolvedPromise, resolve: this._workspaceResolvedPromiseResolve } = promiseWithResolvers());
    ({ promise: this._workspaceTrustInitializedPromise, resolve: this._workspaceTrustInitializedPromiseResolve } = promiseWithResolvers());
    this._storedTrustState = new WorkspaceTrustMemento(isWeb && this.isEmptyWorkspace() ? void 0 : this.storageService);
    this._trustTransitionManager = this._register(new WorkspaceTrustTransitionManager());
    this._trustStateInfo = this.loadTrustInfo();
    this._isTrusted = this.calculateWorkspaceTrust();
    this.initializeWorkspaceTrust();
    this.registerListeners();
  }
  //#region initialize
  initializeWorkspaceTrust() {
    this.resolveCanonicalUris().then(async () => {
      this._canonicalUrisResolved = true;
      await this.updateWorkspaceTrust();
    }).finally(() => {
      this._workspaceResolvedPromiseResolve();
      if (!this.environmentService.remoteAuthority) {
        this._workspaceTrustInitializedPromiseResolve();
      }
    });
    if (this.environmentService.remoteAuthority) {
      this.remoteAuthorityResolverService.resolveAuthority(this.environmentService.remoteAuthority).then(async (result) => {
        this._remoteAuthority = result;
        await this.fileService.activateProvider(Schemas.vscodeRemote);
        await this.updateWorkspaceTrust();
      }).finally(() => {
        this._workspaceTrustInitializedPromiseResolve();
      });
    }
    if (this.isEmptyWorkspace()) {
      this._workspaceTrustInitializedPromise.then(() => {
        if (this._storedTrustState.isEmptyWorkspaceTrusted === void 0) {
          this._storedTrustState.isEmptyWorkspaceTrusted = this.isWorkspaceTrusted();
        }
      });
    }
  }
  //#endregion
  //#region private interface
  registerListeners() {
    this._register(this.workspaceService.onDidChangeWorkspaceFolders(async () => await this.updateWorkspaceTrust()));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, this.storageKey, this._store)(async () => {
      if (JSON.stringify(this._trustStateInfo) !== JSON.stringify(this.loadTrustInfo())) {
        this._trustStateInfo = this.loadTrustInfo();
        this._onDidChangeTrustedFolders.fire();
        await this.updateWorkspaceTrust();
      }
    }));
  }
  async getCanonicalUri(uri) {
    let canonicalUri = uri;
    if (this.environmentService.remoteAuthority && uri.scheme === Schemas.vscodeRemote) {
      canonicalUri = await this.remoteAuthorityResolverService.getCanonicalURI(uri);
    } else if (uri.scheme === "vscode-vfs") {
      const index = uri.authority.indexOf("+");
      if (index !== -1) {
        canonicalUri = uri.with({ authority: uri.authority.substr(0, index) });
      }
    }
    return canonicalUri.with({ query: null, fragment: null });
  }
  async resolveCanonicalUris() {
    const filesToOpen = [];
    if (this.environmentService.filesToOpenOrCreate) {
      filesToOpen.push(...this.environmentService.filesToOpenOrCreate);
    }
    if (this.environmentService.filesToDiff) {
      filesToOpen.push(...this.environmentService.filesToDiff);
    }
    if (this.environmentService.filesToMerge) {
      filesToOpen.push(...this.environmentService.filesToMerge);
    }
    if (filesToOpen.length) {
      const filesToOpenOrCreateUris = filesToOpen.filter((f) => !!f.fileUri).map((f) => f.fileUri);
      const canonicalFilesToOpen = await Promise.all(filesToOpenOrCreateUris.map((uri) => this.getCanonicalUri(uri)));
      this._canonicalStartupFiles.push(...canonicalFilesToOpen.filter((uri) => this._canonicalStartupFiles.every((u) => !this.uriIdentityService.extUri.isEqual(uri, u))));
    }
    const workspaceUris = this.workspaceService.getWorkspace().folders.map((f) => f.uri);
    const canonicalWorkspaceFolders = await Promise.all(workspaceUris.map((uri) => this.getCanonicalUri(uri)));
    let canonicalWorkspaceConfiguration = this.workspaceService.getWorkspace().configuration;
    if (canonicalWorkspaceConfiguration && isSavedWorkspace(canonicalWorkspaceConfiguration, this.environmentService)) {
      canonicalWorkspaceConfiguration = await this.getCanonicalUri(canonicalWorkspaceConfiguration);
    }
    this._canonicalWorkspace = new CanonicalWorkspace(this.workspaceService.getWorkspace(), canonicalWorkspaceFolders, canonicalWorkspaceConfiguration);
  }
  loadTrustInfo() {
    const infoAsString = this.storageService.get(this.storageKey, StorageScope.APPLICATION_SHARED);
    let result;
    try {
      if (infoAsString) {
        result = JSON.parse(infoAsString);
      }
    } catch {
    }
    if (!result) {
      result = {
        uriTrustInfo: []
      };
    }
    if (!result.uriTrustInfo) {
      result.uriTrustInfo = [];
    }
    result.uriTrustInfo = result.uriTrustInfo.map((info) => {
      return { uri: URI.revive(info.uri), trusted: info.trusted };
    });
    result.uriTrustInfo = result.uriTrustInfo.filter((info) => info.trusted);
    return result;
  }
  async saveTrustInfo() {
    this.storageService.store(this.storageKey, JSON.stringify(this._trustStateInfo), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
    this._onDidChangeTrustedFolders.fire();
    await this.updateWorkspaceTrust();
  }
  getWorkspaceUris() {
    const workspaceUris = this._canonicalWorkspace.folders.map((f) => f.uri);
    const workspaceConfiguration = this._canonicalWorkspace.configuration;
    if (workspaceConfiguration && isSavedWorkspace(workspaceConfiguration, this.environmentService)) {
      workspaceUris.push(workspaceConfiguration);
    }
    return workspaceUris;
  }
  calculateWorkspaceTrust() {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return true;
    }
    if (!this._canonicalUrisResolved) {
      return false;
    }
    if (this.environmentService.remoteAuthority && this._remoteAuthority?.options?.isTrusted) {
      return this._remoteAuthority.options.isTrusted;
    }
    if (this.isEmptyWorkspace()) {
      if (this._storedTrustState.isEmptyWorkspaceTrusted !== void 0) {
        return this._storedTrustState.isEmptyWorkspaceTrusted;
      }
      if (this._canonicalStartupFiles.length) {
        return this.getUrisTrust(this._canonicalStartupFiles);
      }
      return !!this.configurationService.getValue(WORKSPACE_TRUST_EMPTY_WINDOW);
    }
    return this.getUrisTrust(this.getWorkspaceUris());
  }
  async updateWorkspaceTrust(trusted) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return;
    }
    if (trusted === void 0) {
      await this.resolveCanonicalUris();
      trusted = this.calculateWorkspaceTrust();
    }
    if (this.isWorkspaceTrusted() === trusted) {
      return;
    }
    this.isTrusted = trusted;
    await this._trustTransitionManager.participate(trusted);
    this._onDidChangeTrust.fire(trusted);
  }
  getUrisTrust(uris) {
    let state = true;
    for (const uri of uris) {
      const { trusted } = this.doGetUriTrustInfo(uri);
      if (!trusted) {
        state = trusted;
        return state;
      }
    }
    return state;
  }
  doGetUriTrustInfo(uri) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return { trusted: true, uri };
    }
    if (this.uriIdentityService.extUri.isEqual(uri, this.environmentService.agentSessionsWorkspace)) {
      return { trusted: true, uri };
    }
    if (this.isTrustedVirtualResource(uri)) {
      return { trusted: true, uri };
    }
    if (this.isTrustedByRemote(uri)) {
      return { trusted: true, uri };
    }
    let resultState = false;
    let maxLength = -1;
    let resultUri = uri;
    for (const trustInfo of this._trustStateInfo.uriTrustInfo) {
      if (this.uriIdentityService.extUri.isEqualOrParent(uri, trustInfo.uri)) {
        const fsPath = trustInfo.uri.fsPath;
        if (fsPath.length > maxLength) {
          maxLength = fsPath.length;
          resultState = trustInfo.trusted;
          resultUri = trustInfo.uri;
        }
      }
    }
    return { trusted: resultState, uri: resultUri };
  }
  async doSetUrisTrust(uris, trusted) {
    let changed = false;
    for (const uri of uris) {
      if (trusted) {
        if (this.isTrustedVirtualResource(uri)) {
          continue;
        }
        if (this.isTrustedByRemote(uri)) {
          continue;
        }
        const foundItem = this._trustStateInfo.uriTrustInfo.find((trustInfo) => this.uriIdentityService.extUri.isEqual(trustInfo.uri, uri));
        if (!foundItem) {
          this._trustStateInfo.uriTrustInfo.push({ uri, trusted: true });
          changed = true;
        }
      } else {
        const previousLength = this._trustStateInfo.uriTrustInfo.length;
        this._trustStateInfo.uriTrustInfo = this._trustStateInfo.uriTrustInfo.filter((trustInfo) => !this.uriIdentityService.extUri.isEqual(trustInfo.uri, uri));
        if (previousLength !== this._trustStateInfo.uriTrustInfo.length) {
          changed = true;
        }
      }
    }
    if (changed) {
      await this.saveTrustInfo();
    }
  }
  isEmptyWorkspace() {
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return true;
    }
    const workspace = this.workspaceService.getWorkspace();
    if (workspace) {
      return isTemporaryWorkspace(this.workspaceService.getWorkspace()) && workspace.folders.length === 0;
    }
    return false;
  }
  isTrustedVirtualResource(uri) {
    return isVirtualResource(uri) && uri.scheme !== "vscode-vfs" && uri.scheme !== AGENT_HOST_SCHEME;
  }
  isTrustedByRemote(uri) {
    if (!this.environmentService.remoteAuthority) {
      return false;
    }
    if (!this._remoteAuthority) {
      return false;
    }
    return isEqualAuthority(getRemoteAuthority(uri), this._remoteAuthority.authority.authority) && !!this._remoteAuthority.options?.isTrusted;
  }
  set isTrusted(value) {
    this._isTrusted = value;
    if (!value) {
      this._storedTrustState.acceptsOutOfWorkspaceFiles = false;
    }
    if (this.isEmptyWorkspace()) {
      this._storedTrustState.isEmptyWorkspaceTrusted = value;
    }
  }
  //#endregion
  //#region public interface
  get workspaceResolved() {
    return this._workspaceResolvedPromise;
  }
  get workspaceTrustInitialized() {
    return this._workspaceTrustInitializedPromise;
  }
  get acceptsOutOfWorkspaceFiles() {
    return this._storedTrustState.acceptsOutOfWorkspaceFiles;
  }
  set acceptsOutOfWorkspaceFiles(value) {
    this._storedTrustState.acceptsOutOfWorkspaceFiles = value;
  }
  isWorkspaceTrusted() {
    return this._isTrusted;
  }
  isWorkspaceTrustForced() {
    if (this.environmentService.remoteAuthority && this._remoteAuthority?.options?.isTrusted !== void 0) {
      return true;
    }
    const workspaceUris = this.getWorkspaceUris().filter((uri) => !this.isTrustedVirtualResource(uri));
    if (workspaceUris.length === 0) {
      return true;
    }
    return false;
  }
  canSetParentFolderTrust() {
    const workspaceIdentifier = toWorkspaceIdentifier(this._canonicalWorkspace);
    if (!isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return false;
    }
    if (workspaceIdentifier.uri.scheme !== Schemas.file && workspaceIdentifier.uri.scheme !== Schemas.vscodeRemote) {
      return false;
    }
    const parentFolder = this.uriIdentityService.extUri.dirname(workspaceIdentifier.uri);
    if (this.uriIdentityService.extUri.isEqual(workspaceIdentifier.uri, parentFolder)) {
      return false;
    }
    return true;
  }
  async setParentFolderTrust(trusted) {
    if (this.canSetParentFolderTrust()) {
      const workspaceUri = toWorkspaceIdentifier(this._canonicalWorkspace).uri;
      const parentFolder = this.uriIdentityService.extUri.dirname(workspaceUri);
      await this.setUrisTrust([parentFolder], trusted);
    }
  }
  canSetWorkspaceTrust() {
    if (this.environmentService.remoteAuthority && (!this._remoteAuthority || this._remoteAuthority.options?.isTrusted !== void 0)) {
      return false;
    }
    if (this.isEmptyWorkspace()) {
      return true;
    }
    const workspaceUris = this.getWorkspaceUris().filter((uri) => !this.isTrustedVirtualResource(uri));
    if (workspaceUris.length === 0) {
      return false;
    }
    if (!this.isWorkspaceTrusted()) {
      return true;
    }
    const workspaceIdentifier = toWorkspaceIdentifier(this._canonicalWorkspace);
    if (!isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return false;
    }
    if (workspaceIdentifier.uri.scheme !== Schemas.file && workspaceIdentifier.uri.scheme !== "vscode-vfs") {
      return false;
    }
    const trustInfo = this.doGetUriTrustInfo(workspaceIdentifier.uri);
    if (!trustInfo.trusted || !this.uriIdentityService.extUri.isEqual(workspaceIdentifier.uri, trustInfo.uri)) {
      return false;
    }
    if (this.canSetParentFolderTrust()) {
      const parentFolder = this.uriIdentityService.extUri.dirname(workspaceIdentifier.uri);
      const parentPathTrustInfo = this.doGetUriTrustInfo(parentFolder);
      if (parentPathTrustInfo.trusted) {
        return false;
      }
    }
    return true;
  }
  async setWorkspaceTrust(trusted) {
    if (this.isEmptyWorkspace()) {
      await this.updateWorkspaceTrust(trusted);
      return;
    }
    const workspaceFolders = this.getWorkspaceUris();
    await this.setUrisTrust(workspaceFolders, trusted);
  }
  async getUriTrustInfo(uri) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return { trusted: true, uri };
    }
    if (this.isTrustedByRemote(uri)) {
      return { trusted: true, uri };
    }
    return this.doGetUriTrustInfo(await this.getCanonicalUri(uri));
  }
  async setUrisTrust(uris, trusted) {
    this.doSetUrisTrust(await Promise.all(uris.map((uri) => this.getCanonicalUri(uri))), trusted);
  }
  getTrustedUris() {
    return this._trustStateInfo.uriTrustInfo.map((info) => info.uri);
  }
  async setTrustedUris(uris) {
    this._trustStateInfo.uriTrustInfo = [];
    for (const uri of uris) {
      const canonicalUri = await this.getCanonicalUri(uri);
      const cleanUri = this.uriIdentityService.extUri.removeTrailingPathSeparator(canonicalUri);
      let added = false;
      for (const addedUri of this._trustStateInfo.uriTrustInfo) {
        if (this.uriIdentityService.extUri.isEqual(addedUri.uri, cleanUri)) {
          added = true;
          break;
        }
      }
      if (added) {
        continue;
      }
      this._trustStateInfo.uriTrustInfo.push({
        trusted: true,
        uri: cleanUri
      });
    }
    await this.saveTrustInfo();
  }
  addWorkspaceTrustTransitionParticipant(participant) {
    return this._trustTransitionManager.addWorkspaceTrustTransitionParticipant(participant);
  }
  //#endregion
};
WorkspaceTrustManagementService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IRemoteAuthorityResolverService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IWorkspaceTrustEnablementService),
  __decorateParam(7, IFileService)
], WorkspaceTrustManagementService);
let WorkspaceTrustRequestService = class extends Disposable {
  constructor(configurationService, workspaceTrustManagementService) {
    super();
    this.configurationService = configurationService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this._resourcesTrustRequestPromises = new ResourceMap();
    this._resourcesTrustRequestResolvers = new ResourceMap();
    this._onDidInitiateOpenFilesTrustRequest = this._register(new Emitter());
    this.onDidInitiateOpenFilesTrustRequest = this._onDidInitiateOpenFilesTrustRequest.event;
    this._onDidInitiateResourcesTrustRequest = this._register(new Emitter());
    this.onDidInitiateResourcesTrustRequest = this._onDidInitiateResourcesTrustRequest.event;
    this._onDidInitiateWorkspaceTrustRequest = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;
    this._onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter());
    this.onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;
  }
  //#region Open file(s) trust request
  get untrustedFilesSetting() {
    return this.configurationService.getValue(WORKSPACE_TRUST_UNTRUSTED_FILES);
  }
  set untrustedFilesSetting(value) {
    this.configurationService.updateValue(WORKSPACE_TRUST_UNTRUSTED_FILES, value);
  }
  async completeOpenFilesTrustRequest(result, saveResponse) {
    if (!this._openFilesTrustRequestResolver) {
      return;
    }
    if (result === WorkspaceTrustUriResponse.Open) {
      this.workspaceTrustManagementService.acceptsOutOfWorkspaceFiles = true;
    }
    if (saveResponse) {
      if (result === WorkspaceTrustUriResponse.Open) {
        this.untrustedFilesSetting = "open";
      }
      if (result === WorkspaceTrustUriResponse.OpenInNewWindow) {
        this.untrustedFilesSetting = "newWindow";
      }
    }
    this._openFilesTrustRequestResolver(result);
    this._openFilesTrustRequestResolver = void 0;
    this._openFilesTrustRequestPromise = void 0;
  }
  async requestOpenFilesTrust(uris) {
    if (!this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      return WorkspaceTrustUriResponse.Open;
    }
    const openFilesTrustInfo = await Promise.all(uris.map((uri) => this.workspaceTrustManagementService.getUriTrustInfo(uri)));
    if (openFilesTrustInfo.map((info) => info.trusted).every((trusted) => trusted)) {
      return WorkspaceTrustUriResponse.Open;
    }
    if (this.untrustedFilesSetting !== "prompt") {
      if (this.untrustedFilesSetting === "newWindow") {
        return WorkspaceTrustUriResponse.OpenInNewWindow;
      }
      if (this.untrustedFilesSetting === "open") {
        return WorkspaceTrustUriResponse.Open;
      }
    }
    if (this.workspaceTrustManagementService.acceptsOutOfWorkspaceFiles) {
      return WorkspaceTrustUriResponse.Open;
    }
    if (!this._openFilesTrustRequestPromise) {
      this._openFilesTrustRequestPromise = new Promise((resolve) => {
        this._openFilesTrustRequestResolver = resolve;
      });
    } else {
      return this._openFilesTrustRequestPromise;
    }
    this._onDidInitiateOpenFilesTrustRequest.fire();
    return this._openFilesTrustRequestPromise;
  }
  //#endregion
  //#region Resource(s) trust request
  async completeResourcesTrustRequest(uri, result) {
    const resolver = this._resourcesTrustRequestResolvers.get(uri);
    if (!resolver) {
      return;
    }
    const trusted = result === WorkspaceTrustUriResponse.Open;
    await this.workspaceTrustManagementService.setUrisTrust([uri], trusted);
    resolver(trusted);
    this._resourcesTrustRequestResolvers.delete(uri);
    this._resourcesTrustRequestPromises.delete(uri);
  }
  async requestResourcesTrust(options) {
    const resourcesTrustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(options.uri);
    if (resourcesTrustInfo.trusted) {
      return true;
    }
    const existingPromise = this._resourcesTrustRequestPromises.get(options.uri);
    if (existingPromise) {
      return existingPromise;
    }
    const promise = new Promise((resolve) => {
      this._resourcesTrustRequestResolvers.set(options.uri, resolve);
    });
    this._resourcesTrustRequestPromises.set(options.uri, promise);
    this._onDidInitiateResourcesTrustRequest.fire(options);
    return promise;
  }
  //#endregion
  //#region Workspace trust request
  resolveWorkspaceTrustRequest(trusted) {
    if (this._workspaceTrustRequestResolver) {
      this._workspaceTrustRequestResolver(trusted ?? this.workspaceTrustManagementService.isWorkspaceTrusted());
      this._workspaceTrustRequestResolver = void 0;
      this._workspaceTrustRequestPromise = void 0;
    }
  }
  cancelWorkspaceTrustRequest() {
    if (this._workspaceTrustRequestResolver) {
      this._workspaceTrustRequestResolver(void 0);
      this._workspaceTrustRequestResolver = void 0;
      this._workspaceTrustRequestPromise = void 0;
    }
  }
  async completeWorkspaceTrustRequest(trusted) {
    if (trusted === void 0 || trusted === this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      this.resolveWorkspaceTrustRequest(trusted);
      return;
    }
    Event.once(this.workspaceTrustManagementService.onDidChangeTrust)((trusted2) => this.resolveWorkspaceTrustRequest(trusted2));
    await this.workspaceTrustManagementService.setWorkspaceTrust(trusted);
  }
  async requestWorkspaceTrust(options) {
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      return this.workspaceTrustManagementService.isWorkspaceTrusted();
    }
    if (!this._workspaceTrustRequestPromise) {
      this._workspaceTrustRequestPromise = new Promise((resolve) => {
        this._workspaceTrustRequestResolver = resolve;
      });
    } else {
      return this._workspaceTrustRequestPromise;
    }
    this._onDidInitiateWorkspaceTrustRequest.fire(options);
    return this._workspaceTrustRequestPromise;
  }
  requestWorkspaceTrustOnStartup() {
    if (!this._workspaceTrustRequestPromise) {
      this._workspaceTrustRequestPromise = new Promise((resolve) => {
        this._workspaceTrustRequestResolver = resolve;
      });
    }
    this._onDidInitiateWorkspaceTrustRequestOnStartup.fire();
  }
  //#endregion
};
WorkspaceTrustRequestService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IWorkspaceTrustManagementService)
], WorkspaceTrustRequestService);
class WorkspaceTrustTransitionManager extends Disposable {
  constructor() {
    super(...arguments);
    this.participants = new LinkedList();
  }
  addWorkspaceTrustTransitionParticipant(participant) {
    const remove = this.participants.push(participant);
    return toDisposable(() => remove());
  }
  async participate(trusted) {
    for (const participant of this.participants) {
      await participant.participate(trusted);
    }
  }
  dispose() {
    this.participants.clear();
    super.dispose();
  }
}
class WorkspaceTrustMemento {
  constructor(storageService) {
    this._acceptsOutOfWorkspaceFilesKey = "acceptsOutOfWorkspaceFiles";
    this._isEmptyWorkspaceTrustedKey = "isEmptyWorkspaceTrusted";
    if (storageService) {
      this._memento = new Memento("workspaceTrust", storageService);
      this._mementoObject = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this._mementoObject = {};
    }
  }
  get acceptsOutOfWorkspaceFiles() {
    return this._mementoObject[this._acceptsOutOfWorkspaceFilesKey] ?? false;
  }
  set acceptsOutOfWorkspaceFiles(value) {
    this._mementoObject[this._acceptsOutOfWorkspaceFilesKey] = value;
    this._memento?.saveMemento();
  }
  get isEmptyWorkspaceTrusted() {
    return this._mementoObject[this._isEmptyWorkspaceTrustedKey];
  }
  set isEmptyWorkspaceTrusted(value) {
    this._mementoObject[this._isEmptyWorkspaceTrustedKey] = value;
    this._memento?.saveMemento();
  }
}
registerSingleton(IWorkspaceTrustRequestService, WorkspaceTrustRequestService, InstantiationType.Delayed);
export {
  CanonicalWorkspace,
  WORKSPACE_TRUST_BANNER,
  WORKSPACE_TRUST_EMPTY_WINDOW,
  WORKSPACE_TRUST_ENABLED,
  WORKSPACE_TRUST_EXTENSION_SUPPORT,
  WORKSPACE_TRUST_STARTUP_PROMPT,
  WORKSPACE_TRUST_STORAGE_KEY,
  WORKSPACE_TRUST_UNTRUSTED_FILES,
  WorkspaceTrustEnablementService,
  WorkspaceTrustManagementService,
  WorkspaceTrustRequestService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3Jrc3BhY2VzXFxjb21tb25cXHdvcmtzcGFjZVRydXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLCBSZXNvbHZlclJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgZ2V0UmVtb3RlQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVIb3N0cy5qcyc7XG5pbXBvcnQgeyBpc1ZpcnR1YWxSZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX1NDSEVNRSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNTYXZlZFdvcmtzcGFjZSwgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1RlbXBvcmFyeVdvcmtzcGFjZSwgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCB0b1dvcmtzcGFjZUlkZW50aWZpZXIsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T3B0aW9ucywgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdEluZm8sIElXb3Jrc3BhY2VUcnVzdFVyaUluZm8sIElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQsIFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UsIElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLCBSZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IE1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWVtZW50by5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IGlzRXF1YWxBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgcHJvbWlzZVdpdGhSZXNvbHZlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5cbmV4cG9ydCBjb25zdCBXT1JLU1BBQ0VfVFJVU1RfRU5BQkxFRCA9ICdzZWN1cml0eS53b3Jrc3BhY2UudHJ1c3QuZW5hYmxlZCc7XG5leHBvcnQgY29uc3QgV09SS1NQQUNFX1RSVVNUX1NUQVJUVVBfUFJPTVBUID0gJ3NlY3VyaXR5LndvcmtzcGFjZS50cnVzdC5zdGFydHVwUHJvbXB0JztcbmV4cG9ydCBjb25zdCBXT1JLU1BBQ0VfVFJVU1RfQkFOTkVSID0gJ3NlY3VyaXR5LndvcmtzcGFjZS50cnVzdC5iYW5uZXInO1xuZXhwb3J0IGNvbnN0IFdPUktTUEFDRV9UUlVTVF9VTlRSVVNURURfRklMRVMgPSAnc2VjdXJpdHkud29ya3NwYWNlLnRydXN0LnVudHJ1c3RlZEZpbGVzJztcbmV4cG9ydCBjb25zdCBXT1JLU1BBQ0VfVFJVU1RfRU1QVFlfV0lORE9XID0gJ3NlY3VyaXR5LndvcmtzcGFjZS50cnVzdC5lbXB0eVdpbmRvdyc7XG5leHBvcnQgY29uc3QgV09SS1NQQUNFX1RSVVNUX0VYVEVOU0lPTl9TVVBQT1JUID0gJ2V4dGVuc2lvbnMuc3VwcG9ydFVudHJ1c3RlZFdvcmtzcGFjZXMnO1xuZXhwb3J0IGNvbnN0IFdPUktTUEFDRV9UUlVTVF9TVE9SQUdFX0tFWSA9ICdjb250ZW50LnRydXN0Lm1vZGVsLmtleSc7XG5cbmV4cG9ydCBjbGFzcyBDYW5vbmljYWxXb3Jrc3BhY2UgaW1wbGVtZW50cyBJV29ya3NwYWNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbFdvcmtzcGFjZTogSVdvcmtzcGFjZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNhbm9uaWNhbEZvbGRlclVyaXM6IFVSSVtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2Fub25pY2FsQ29uZmlndXJhdGlvbjogVVJJIHwgbnVsbCB8IHVuZGVmaW5lZFxuXHQpIHsgfVxuXG5cblx0Z2V0IGZvbGRlcnMoKTogSVdvcmtzcGFjZUZvbGRlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5vcmlnaW5hbFdvcmtzcGFjZS5mb2xkZXJzLm1hcCgoZm9sZGVyLCBpbmRleCkgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5kZXg6IGZvbGRlci5pbmRleCxcblx0XHRcdFx0bmFtZTogZm9sZGVyLm5hbWUsXG5cdFx0XHRcdHRvUmVzb3VyY2U6IGZvbGRlci50b1Jlc291cmNlLFxuXHRcdFx0XHR1cmk6IHRoaXMuY2Fub25pY2FsRm9sZGVyVXJpc1tpbmRleF1cblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgdHJhbnNpZW50KCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm9yaWdpbmFsV29ya3NwYWNlLnRyYW5zaWVudDtcblx0fVxuXG5cdGdldCBjb25maWd1cmF0aW9uKCk6IFVSSSB8IG51bGwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNhbm9uaWNhbENvbmZpZ3VyYXRpb24gPz8gdGhpcy5vcmlnaW5hbFdvcmtzcGFjZS5jb25maWd1cmF0aW9uO1xuXHR9XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZ2luYWxXb3Jrc3BhY2UuaWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0aXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmRpc2FibGVXb3Jrc3BhY2VUcnVzdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiAhIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoV09SS1NQQUNFX1RSVVNUX0VOQUJMRUQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdG9yYWdlS2V5ID0gV09SS1NQQUNFX1RSVVNUX1NUT1JBR0VfS0VZO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVJlc29sdmVkUHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlUmVzb2x2ZWRQcm9taXNlUmVzb2x2ZTogKCkgPT4gdm9pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZFByb21pc2U6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWRQcm9taXNlUmVzb2x2ZTogKCkgPT4gdm9pZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRydXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHJ1c3QgPSB0aGlzLl9vbkRpZENoYW5nZVRydXN0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycyA9IHRoaXMuX29uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY2Fub25pY2FsU3RhcnR1cEZpbGVzOiBVUklbXSA9IFtdO1xuXHRwcml2YXRlIF9jYW5vbmljYWxXb3Jrc3BhY2U6IElXb3Jrc3BhY2U7XG5cdHByaXZhdGUgX2Nhbm9uaWNhbFVyaXNSZXNvbHZlZDogYm9vbGVhbjtcblxuXHRwcml2YXRlIF9pc1RydXN0ZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX3RydXN0U3RhdGVJbmZvOiBJV29ya3NwYWNlVHJ1c3RJbmZvO1xuXHRwcml2YXRlIF9yZW1vdGVBdXRob3JpdHk6IFJlc29sdmVyUmVzdWx0IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JlZFRydXN0U3RhdGU6IFdvcmtzcGFjZVRydXN0TWVtZW50bztcblx0cHJpdmF0ZSByZWFkb25seSBfdHJ1c3RUcmFuc2l0aW9uTWFuYWdlcjogV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uTWFuYWdlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZTogSVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jYW5vbmljYWxVcmlzUmVzb2x2ZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9jYW5vbmljYWxXb3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cblx0XHQoeyBwcm9taXNlOiB0aGlzLl93b3Jrc3BhY2VSZXNvbHZlZFByb21pc2UsIHJlc29sdmU6IHRoaXMuX3dvcmtzcGFjZVJlc29sdmVkUHJvbWlzZVJlc29sdmUgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzKCkpO1xuXHRcdCh7IHByb21pc2U6IHRoaXMuX3dvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWRQcm9taXNlLCByZXNvbHZlOiB0aGlzLl93b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkUHJvbWlzZVJlc29sdmUgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzKCkpO1xuXG5cdFx0dGhpcy5fc3RvcmVkVHJ1c3RTdGF0ZSA9IG5ldyBXb3Jrc3BhY2VUcnVzdE1lbWVudG8oaXNXZWIgJiYgdGhpcy5pc0VtcHR5V29ya3NwYWNlKCkgPyB1bmRlZmluZWQgOiB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl90cnVzdFRyYW5zaXRpb25NYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvbk1hbmFnZXIoKSk7XG5cblx0XHR0aGlzLl90cnVzdFN0YXRlSW5mbyA9IHRoaXMubG9hZFRydXN0SW5mbygpO1xuXHRcdHRoaXMuX2lzVHJ1c3RlZCA9IHRoaXMuY2FsY3VsYXRlV29ya3NwYWNlVHJ1c3QoKTtcblxuXHRcdHRoaXMuaW5pdGlhbGl6ZVdvcmtzcGFjZVRydXN0KCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIGluaXRpYWxpemVcblxuXHRwcml2YXRlIGluaXRpYWxpemVXb3Jrc3BhY2VUcnVzdCgpOiB2b2lkIHtcblx0XHQvLyBSZXNvbHZlIGNhbm9uaWNhbCBVcmlzXG5cdFx0dGhpcy5yZXNvbHZlQ2Fub25pY2FsVXJpcygpXG5cdFx0XHQudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2Nhbm9uaWNhbFVyaXNSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlV29ya3NwYWNlVHJ1c3QoKTtcblx0XHRcdH0pXG5cdFx0XHQuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3dvcmtzcGFjZVJlc29sdmVkUHJvbWlzZVJlc29sdmUoKTtcblxuXHRcdFx0XHRpZiAoIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWRQcm9taXNlUmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdC8vIFJlbW90ZSAtIHJlc29sdmUgcmVtb3RlIGF1dGhvcml0eVxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHRoaXMucmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVBdXRob3JpdHkodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KVxuXHRcdFx0XHQudGhlbihhc3luYyByZXN1bHQgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eSA9IHJlc3VsdDtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmFjdGl2YXRlUHJvdmlkZXIoU2NoZW1hcy52c2NvZGVSZW1vdGUpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlV29ya3NwYWNlVHJ1c3QoKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0LmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWRQcm9taXNlUmVzb2x2ZSgpO1xuXHRcdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBFbXB0eSB3b3Jrc3BhY2UgLSBzYXZlIGluaXRpYWwgc3RhdGUgdG8gbWVtZW50b1xuXHRcdGlmICh0aGlzLmlzRW1wdHlXb3Jrc3BhY2UoKSkge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZFByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZWRUcnVzdFN0YXRlLmlzRW1wdHlXb3Jrc3BhY2VUcnVzdGVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zdG9yZWRUcnVzdFN0YXRlLmlzRW1wdHlXb3Jrc3BhY2VUcnVzdGVkID0gdGhpcy5pc1dvcmtzcGFjZVRydXN0ZWQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIHByaXZhdGUgaW50ZXJmYWNlXG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGFzeW5jICgpID0+IGF3YWl0IHRoaXMudXBkYXRlV29ya3NwYWNlVHJ1c3QoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCB0aGlzLnN0b3JhZ2VLZXksIHRoaXMuX3N0b3JlKShhc3luYyAoKSA9PiB7XG5cdFx0XHQvKiBUaGlzIHdpbGwgb25seSBleGVjdXRlIGlmIHN0b3JhZ2Ugd2FzIGNoYW5nZWQgYnkgYSB1c2VyIGFjdGlvbiBpbiBhIHNlcGFyYXRlIHdpbmRvdyAqL1xuXHRcdFx0aWYgKEpTT04uc3RyaW5naWZ5KHRoaXMuX3RydXN0U3RhdGVJbmZvKSAhPT0gSlNPTi5zdHJpbmdpZnkodGhpcy5sb2FkVHJ1c3RJbmZvKCkpKSB7XG5cdFx0XHRcdHRoaXMuX3RydXN0U3RhdGVJbmZvID0gdGhpcy5sb2FkVHJ1c3RJbmZvKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMuZmlyZSgpO1xuXG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlV29ya3NwYWNlVHJ1c3QoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldENhbm9uaWNhbFVyaSh1cmk6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0bGV0IGNhbm9uaWNhbFVyaSA9IHVyaTtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICYmIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0XHRjYW5vbmljYWxVcmkgPSBhd2FpdCB0aGlzLnJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5nZXRDYW5vbmljYWxVUkkodXJpKTtcblx0XHR9IGVsc2UgaWYgKHVyaS5zY2hlbWUgPT09ICd2c2NvZGUtdmZzJykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB1cmkuYXV0aG9yaXR5LmluZGV4T2YoJysnKTtcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0Y2Fub25pY2FsVXJpID0gdXJpLndpdGgoeyBhdXRob3JpdHk6IHVyaS5hdXRob3JpdHkuc3Vic3RyKDAsIGluZGV4KSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBpZ25vcmUgcXVlcnkgYW5kIGZyYWdlbnQgc2VjdGlvbiBvZiB1cmlzIGFsd2F5c1xuXHRcdHJldHVybiBjYW5vbmljYWxVcmkud2l0aCh7IHF1ZXJ5OiBudWxsLCBmcmFnbWVudDogbnVsbCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUNhbm9uaWNhbFVyaXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT3BlbiBlZGl0b3JzXG5cdFx0Y29uc3QgZmlsZXNUb09wZW46IElQYXRoW10gPSBbXTtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZmlsZXNUb09wZW5PckNyZWF0ZSkge1xuXHRcdFx0ZmlsZXNUb09wZW4ucHVzaCguLi50aGlzLmVudmlyb25tZW50U2VydmljZS5maWxlc1RvT3Blbk9yQ3JlYXRlKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZmlsZXNUb0RpZmYpIHtcblx0XHRcdGZpbGVzVG9PcGVuLnB1c2goLi4udGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZmlsZXNUb0RpZmYpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5maWxlc1RvTWVyZ2UpIHtcblx0XHRcdGZpbGVzVG9PcGVuLnB1c2goLi4udGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZmlsZXNUb01lcmdlKTtcblx0XHR9XG5cblx0XHRpZiAoZmlsZXNUb09wZW4ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBmaWxlc1RvT3Blbk9yQ3JlYXRlVXJpcyA9IGZpbGVzVG9PcGVuLmZpbHRlcihmID0+ICEhZi5maWxlVXJpKS5tYXAoZiA9PiBmLmZpbGVVcmkhKTtcblx0XHRcdGNvbnN0IGNhbm9uaWNhbEZpbGVzVG9PcGVuID0gYXdhaXQgUHJvbWlzZS5hbGwoZmlsZXNUb09wZW5PckNyZWF0ZVVyaXMubWFwKHVyaSA9PiB0aGlzLmdldENhbm9uaWNhbFVyaSh1cmkpKSk7XG5cblx0XHRcdHRoaXMuX2Nhbm9uaWNhbFN0YXJ0dXBGaWxlcy5wdXNoKC4uLmNhbm9uaWNhbEZpbGVzVG9PcGVuLmZpbHRlcih1cmkgPT4gdGhpcy5fY2Fub25pY2FsU3RhcnR1cEZpbGVzLmV2ZXJ5KHUgPT4gIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHVyaSwgdSkpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlXG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpcyA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmID0+IGYudXJpKTtcblx0XHRjb25zdCBjYW5vbmljYWxXb3Jrc3BhY2VGb2xkZXJzID0gYXdhaXQgUHJvbWlzZS5hbGwod29ya3NwYWNlVXJpcy5tYXAodXJpID0+IHRoaXMuZ2V0Q2Fub25pY2FsVXJpKHVyaSkpKTtcblxuXHRcdGxldCBjYW5vbmljYWxXb3Jrc3BhY2VDb25maWd1cmF0aW9uID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb247XG5cdFx0aWYgKGNhbm9uaWNhbFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gJiYgaXNTYXZlZFdvcmtzcGFjZShjYW5vbmljYWxXb3Jrc3BhY2VDb25maWd1cmF0aW9uLCB0aGlzLmVudmlyb25tZW50U2VydmljZSkpIHtcblx0XHRcdGNhbm9uaWNhbFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gPSBhd2FpdCB0aGlzLmdldENhbm9uaWNhbFVyaShjYW5vbmljYWxXb3Jrc3BhY2VDb25maWd1cmF0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jYW5vbmljYWxXb3Jrc3BhY2UgPSBuZXcgQ2Fub25pY2FsV29ya3NwYWNlKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKSwgY2Fub25pY2FsV29ya3NwYWNlRm9sZGVycywgY2Fub25pY2FsV29ya3NwYWNlQ29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRUcnVzdEluZm8oKTogSVdvcmtzcGFjZVRydXN0SW5mbyB7XG5cdFx0Y29uc3QgaW5mb0FzU3RyaW5nID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQodGhpcy5zdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEKTtcblxuXHRcdGxldCByZXN1bHQ6IElXb3Jrc3BhY2VUcnVzdEluZm8gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChpbmZvQXNTdHJpbmcpIHtcblx0XHRcdFx0cmVzdWx0ID0gSlNPTi5wYXJzZShpbmZvQXNTdHJpbmcpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggeyB9XG5cblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmVzdWx0ID0ge1xuXHRcdFx0XHR1cmlUcnVzdEluZm86IFtdXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghcmVzdWx0LnVyaVRydXN0SW5mbykge1xuXHRcdFx0cmVzdWx0LnVyaVRydXN0SW5mbyA9IFtdO1xuXHRcdH1cblxuXHRcdHJlc3VsdC51cmlUcnVzdEluZm8gPSByZXN1bHQudXJpVHJ1c3RJbmZvLm1hcChpbmZvID0+IHsgcmV0dXJuIHsgdXJpOiBVUkkucmV2aXZlKGluZm8udXJpKSwgdHJ1c3RlZDogaW5mby50cnVzdGVkIH07IH0pO1xuXHRcdHJlc3VsdC51cmlUcnVzdEluZm8gPSByZXN1bHQudXJpVHJ1c3RJbmZvLmZpbHRlcihpbmZvID0+IGluZm8udHJ1c3RlZCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzYXZlVHJ1c3RJbmZvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5zdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeSh0aGlzLl90cnVzdFN0YXRlSW5mbyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycy5maXJlKCk7XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZVdvcmtzcGFjZVRydXN0KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmtzcGFjZVVyaXMoKTogVVJJW10ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaXMgPSB0aGlzLl9jYW5vbmljYWxXb3Jrc3BhY2UuZm9sZGVycy5tYXAoZiA9PiBmLnVyaSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMuX2Nhbm9uaWNhbFdvcmtzcGFjZS5jb25maWd1cmF0aW9uO1xuXHRcdGlmICh3b3Jrc3BhY2VDb25maWd1cmF0aW9uICYmIGlzU2F2ZWRXb3Jrc3BhY2Uod29ya3NwYWNlQ29uZmlndXJhdGlvbiwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpKSB7XG5cdFx0XHR3b3Jrc3BhY2VVcmlzLnB1c2god29ya3NwYWNlQ29uZmlndXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdvcmtzcGFjZVVyaXM7XG5cdH1cblxuXHRwcml2YXRlIGNhbGN1bGF0ZVdvcmtzcGFjZVRydXN0KCk6IGJvb2xlYW4ge1xuXHRcdC8vIEZlYXR1cmUgaXMgZGlzYWJsZWRcblx0XHRpZiAoIXRoaXMud29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBDYW5vbmljYWwgVXJpcyBub3QgeWV0IHJlc29sdmVkXG5cdFx0aWYgKCF0aGlzLl9jYW5vbmljYWxVcmlzUmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdGUgLSByZXNvbHZlciBleHBsaWNpdGx5IHNldHMgd29ya3NwYWNlIHRydXN0IHRvIFRSVUVcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICYmIHRoaXMuX3JlbW90ZUF1dGhvcml0eT8ub3B0aW9ucz8uaXNUcnVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlQXV0aG9yaXR5Lm9wdGlvbnMuaXNUcnVzdGVkO1xuXHRcdH1cblxuXHRcdC8vIEVtcHR5IHdvcmtzcGFjZSAtIHVzZSBtZW1lbnRvLCBvcGVuIGVkaW9ycywgb3IgdXNlciBzZXR0aW5nXG5cdFx0aWYgKHRoaXMuaXNFbXB0eVdvcmtzcGFjZSgpKSB7XG5cdFx0XHQvLyBVc2UgbWVtZW50byBpZiBwcmVzZW50XG5cdFx0XHRpZiAodGhpcy5fc3RvcmVkVHJ1c3RTdGF0ZS5pc0VtcHR5V29ya3NwYWNlVHJ1c3RlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9zdG9yZWRUcnVzdFN0YXRlLmlzRW1wdHlXb3Jrc3BhY2VUcnVzdGVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdGFydHVwIGZpbGVzXG5cdFx0XHRpZiAodGhpcy5fY2Fub25pY2FsU3RhcnR1cEZpbGVzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRVcmlzVHJ1c3QodGhpcy5fY2Fub25pY2FsU3RhcnR1cEZpbGVzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXNlciBzZXR0aW5nXG5cdFx0XHRyZXR1cm4gISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFdPUktTUEFDRV9UUlVTVF9FTVBUWV9XSU5ET1cpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldFVyaXNUcnVzdCh0aGlzLmdldFdvcmtzcGFjZVVyaXMoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVdvcmtzcGFjZVRydXN0KHRydXN0ZWQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0cnVzdGVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVzb2x2ZUNhbm9uaWNhbFVyaXMoKTtcblx0XHRcdHRydXN0ZWQgPSB0aGlzLmNhbGN1bGF0ZVdvcmtzcGFjZVRydXN0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNXb3Jrc3BhY2VUcnVzdGVkKCkgPT09IHRydXN0ZWQpIHsgcmV0dXJuOyB9XG5cblx0XHQvLyBVcGRhdGUgd29ya3NwYWNlIHRydXN0XG5cdFx0dGhpcy5pc1RydXN0ZWQgPSB0cnVzdGVkO1xuXG5cdFx0Ly8gUnVuIHdvcmtzcGFjZSB0cnVzdCB0cmFuc2l0aW9uIHBhcnRpY2lwYW50c1xuXHRcdGF3YWl0IHRoaXMuX3RydXN0VHJhbnNpdGlvbk1hbmFnZXIucGFydGljaXBhdGUodHJ1c3RlZCk7XG5cblx0XHQvLyBGaXJlIHdvcmtzcGFjZSB0cnVzdCBjaGFuZ2UgZXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRydXN0LmZpcmUodHJ1c3RlZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFVyaXNUcnVzdCh1cmlzOiBVUklbXSk6IGJvb2xlYW4ge1xuXHRcdGxldCBzdGF0ZSA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgdXJpcykge1xuXHRcdFx0Y29uc3QgeyB0cnVzdGVkIH0gPSB0aGlzLmRvR2V0VXJpVHJ1c3RJbmZvKHVyaSk7XG5cblx0XHRcdGlmICghdHJ1c3RlZCkge1xuXHRcdFx0XHRzdGF0ZSA9IHRydXN0ZWQ7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0VXJpVHJ1c3RJbmZvKHVyaTogVVJJKTogSVdvcmtzcGFjZVRydXN0VXJpSW5mbyB7XG5cdFx0Ly8gUmV0dXJuIHRydXN0ZWQgd2hlbiB3b3Jrc3BhY2UgdHJ1c3QgaXMgZGlzYWJsZWRcblx0XHRpZiAoIXRoaXMud29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4geyB0cnVzdGVkOiB0cnVlLCB1cmkgfTtcblx0XHR9XG5cblx0XHQvLyBBZ2VudCBzZXNzaW9ucyB3b3Jrc3BhY2UgZmlsZSBpcyBhbHdheXMgdHJ1c3RlZFxuXHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh1cmksIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmFnZW50U2Vzc2lvbnNXb3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4geyB0cnVzdGVkOiB0cnVlLCB1cmkgfTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1RydXN0ZWRWaXJ0dWFsUmVzb3VyY2UodXJpKSkge1xuXHRcdFx0cmV0dXJuIHsgdHJ1c3RlZDogdHJ1ZSwgdXJpIH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNUcnVzdGVkQnlSZW1vdGUodXJpKSkge1xuXHRcdFx0cmV0dXJuIHsgdHJ1c3RlZDogdHJ1ZSwgdXJpIH07XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdFN0YXRlID0gZmFsc2U7XG5cdFx0bGV0IG1heExlbmd0aCA9IC0xO1xuXG5cdFx0bGV0IHJlc3VsdFVyaSA9IHVyaTtcblxuXHRcdGZvciAoY29uc3QgdHJ1c3RJbmZvIG9mIHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mbykge1xuXHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodXJpLCB0cnVzdEluZm8udXJpKSkge1xuXHRcdFx0XHRjb25zdCBmc1BhdGggPSB0cnVzdEluZm8udXJpLmZzUGF0aDtcblx0XHRcdFx0aWYgKGZzUGF0aC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcblx0XHRcdFx0XHRtYXhMZW5ndGggPSBmc1BhdGgubGVuZ3RoO1xuXHRcdFx0XHRcdHJlc3VsdFN0YXRlID0gdHJ1c3RJbmZvLnRydXN0ZWQ7XG5cdFx0XHRcdFx0cmVzdWx0VXJpID0gdHJ1c3RJbmZvLnVyaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHRydXN0ZWQ6IHJlc3VsdFN0YXRlLCB1cmk6IHJlc3VsdFVyaSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1NldFVyaXNUcnVzdCh1cmlzOiBVUklbXSwgdHJ1c3RlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB1cmlzKSB7XG5cdFx0XHRpZiAodHJ1c3RlZCkge1xuXHRcdFx0XHRpZiAodGhpcy5pc1RydXN0ZWRWaXJ0dWFsUmVzb3VyY2UodXJpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuaXNUcnVzdGVkQnlSZW1vdGUodXJpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZm91bmRJdGVtID0gdGhpcy5fdHJ1c3RTdGF0ZUluZm8udXJpVHJ1c3RJbmZvLmZpbmQodHJ1c3RJbmZvID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRydXN0SW5mby51cmksIHVyaSkpO1xuXHRcdFx0XHRpZiAoIWZvdW5kSXRlbSkge1xuXHRcdFx0XHRcdHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mby5wdXNoKHsgdXJpLCB0cnVzdGVkOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c0xlbmd0aCA9IHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mby5sZW5ndGg7XG5cdFx0XHRcdHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mbyA9IHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mby5maWx0ZXIodHJ1c3RJbmZvID0+ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh0cnVzdEluZm8udXJpLCB1cmkpKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzTGVuZ3RoICE9PSB0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5zYXZlVHJ1c3RJbmZvKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc0VtcHR5V29ya3NwYWNlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gaXNUZW1wb3JhcnlXb3Jrc3BhY2UodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSAmJiB3b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGggPT09IDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1RydXN0ZWRWaXJ0dWFsUmVzb3VyY2UodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHQvLyBgdnNjb2RlLXZmc2AgKGUuZy4gR2l0SHViIFJlcG9zaXRvcmllcykgYW5kIGB2c2NvZGUtYWdlbnQtaG9zdGBcblx0XHQvLyAocmVtb3RlIGFnZW50IGhvc3QgZm9sZGVycykgcmVwcmVzZW50IHJlYWwsIHdyaXRhYmxlIHJlc291cmNlcyB3aGVyZVxuXHRcdC8vIGNvZGUgY2FuIHJ1biBvciBmaWxlcyBjYW4gY2hhbmdlLCBzbyB0aGV5IG11c3QgZ28gdGhyb3VnaCBub3JtYWxcblx0XHQvLyB3b3Jrc3BhY2UgdHJ1c3QgcmF0aGVyIHRoYW4gYmVpbmcgYXV0by10cnVzdGVkIGFzIHZpcnR1YWwgcmVzb3VyY2VzLlxuXHRcdHJldHVybiBpc1ZpcnR1YWxSZXNvdXJjZSh1cmkpICYmIHVyaS5zY2hlbWUgIT09ICd2c2NvZGUtdmZzJyAmJiB1cmkuc2NoZW1lICE9PSBBR0VOVF9IT1NUX1NDSEVNRTtcblx0fVxuXG5cdHByaXZhdGUgaXNUcnVzdGVkQnlSZW1vdGUodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fcmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChpc0VxdWFsQXV0aG9yaXR5KGdldFJlbW90ZUF1dGhvcml0eSh1cmkpLCB0aGlzLl9yZW1vdGVBdXRob3JpdHkuYXV0aG9yaXR5LmF1dGhvcml0eSkpICYmICEhdGhpcy5fcmVtb3RlQXV0aG9yaXR5Lm9wdGlvbnM/LmlzVHJ1c3RlZDtcblx0fVxuXG5cdHByaXZhdGUgc2V0IGlzVHJ1c3RlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2lzVHJ1c3RlZCA9IHZhbHVlO1xuXG5cdFx0Ly8gUmVzZXQgYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXNcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHR0aGlzLl9zdG9yZWRUcnVzdFN0YXRlLmFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRW1wdHkgd29ya3NwYWNlIC0gc2F2ZSBtZW1lbnRvXG5cdFx0aWYgKHRoaXMuaXNFbXB0eVdvcmtzcGFjZSgpKSB7XG5cdFx0XHR0aGlzLl9zdG9yZWRUcnVzdFN0YXRlLmlzRW1wdHlXb3Jrc3BhY2VUcnVzdGVkID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIHB1YmxpYyBpbnRlcmZhY2VcblxuXHRnZXQgd29ya3NwYWNlUmVzb2x2ZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZVJlc29sdmVkUHJvbWlzZTtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkUHJvbWlzZTtcblx0fVxuXG5cdGdldCBhY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmVkVHJ1c3RTdGF0ZS5hY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlcztcblx0fVxuXG5cdHNldCBhY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlcyh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3N0b3JlZFRydXN0U3RhdGUuYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXMgPSB2YWx1ZTtcblx0fVxuXG5cdGlzV29ya3NwYWNlVHJ1c3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNUcnVzdGVkO1xuXHR9XG5cblx0aXNXb3Jrc3BhY2VUcnVzdEZvcmNlZCgpOiBib29sZWFuIHtcblx0XHQvLyBSZW1vdGUgLSByZW1vdGUgYXV0aG9yaXR5IGV4cGxpY2l0bHkgc2V0cyB3b3Jrc3BhY2UgdHJ1c3Rcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICYmIHRoaXMuX3JlbW90ZUF1dGhvcml0eT8ub3B0aW9ucz8uaXNUcnVzdGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIEFsbCB3b3Jrc3BhY2UgdXJpcyBhcmUgdHJ1c3RlZCBhdXRvbWF0aWNhbGx5XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpcyA9IHRoaXMuZ2V0V29ya3NwYWNlVXJpcygpLmZpbHRlcih1cmkgPT4gIXRoaXMuaXNUcnVzdGVkVmlydHVhbFJlc291cmNlKHVyaSkpO1xuXHRcdGlmICh3b3Jrc3BhY2VVcmlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y2FuU2V0UGFyZW50Rm9sZGVyVHJ1c3QoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlSWRlbnRpZmllciA9IHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLl9jYW5vbmljYWxXb3Jrc3BhY2UpO1xuXG5cdFx0aWYgKCFpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlSWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAod29ya3NwYWNlSWRlbnRpZmllci51cmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgJiYgd29ya3NwYWNlSWRlbnRpZmllci51cmkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudEZvbGRlciA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHdvcmtzcGFjZUlkZW50aWZpZXIudXJpKTtcblx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwod29ya3NwYWNlSWRlbnRpZmllci51cmksIHBhcmVudEZvbGRlcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIHNldFBhcmVudEZvbGRlclRydXN0KHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jYW5TZXRQYXJlbnRGb2xkZXJUcnVzdCgpKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSAodG9Xb3Jrc3BhY2VJZGVudGlmaWVyKHRoaXMuX2Nhbm9uaWNhbFdvcmtzcGFjZSkgYXMgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIpLnVyaTtcblx0XHRcdGNvbnN0IHBhcmVudEZvbGRlciA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHdvcmtzcGFjZVVyaSk7XG5cblx0XHRcdGF3YWl0IHRoaXMuc2V0VXJpc1RydXN0KFtwYXJlbnRGb2xkZXJdLCB0cnVzdGVkKTtcblx0XHR9XG5cdH1cblxuXHRjYW5TZXRXb3Jrc3BhY2VUcnVzdCgpOiBib29sZWFuIHtcblx0XHQvLyBSZW1vdGUgLSByZW1vdGUgYXV0aG9yaXR5IG5vdCB5ZXQgcmVzb2x2ZWQsIG9yIHJlbW90ZSBhdXRob3JpdHkgZXhwbGljaXRseSBzZXRzIHdvcmtzcGFjZSB0cnVzdFxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgJiYgKCF0aGlzLl9yZW1vdGVBdXRob3JpdHkgfHwgdGhpcy5fcmVtb3RlQXV0aG9yaXR5Lm9wdGlvbnM/LmlzVHJ1c3RlZCAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEVtcHR5IHdvcmtzcGFjZVxuXHRcdGlmICh0aGlzLmlzRW1wdHlXb3Jrc3BhY2UoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQWxsIHdvcmtzcGFjZSB1cmlzIGFyZSB0cnVzdGVkIGF1dG9tYXRpY2FsbHlcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmlzID0gdGhpcy5nZXRXb3Jrc3BhY2VVcmlzKCkuZmlsdGVyKHVyaSA9PiAhdGhpcy5pc1RydXN0ZWRWaXJ0dWFsUmVzb3VyY2UodXJpKSk7XG5cdFx0aWYgKHdvcmtzcGFjZVVyaXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gVW50cnVzdGVkIHdvcmtzcGFjZVxuXHRcdGlmICghdGhpcy5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gVHJ1c3RlZCB3b3Jrc3BhY2VzXG5cdFx0Ly8gQ2FuIG9ubHkgdW50cnVzdGVkIGluIHRoZSBzaW5nbGUgZm9sZGVyIHNjZW5hcmlvXG5cdFx0Y29uc3Qgd29ya3NwYWNlSWRlbnRpZmllciA9IHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLl9jYW5vbmljYWxXb3Jrc3BhY2UpO1xuXHRcdGlmICghaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZUlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FuIG9ubHkgYmUgdW50cnVzdGVkIGluIGNlcnRhaW4gc2NoZW1lc1xuXHRcdGlmICh3b3Jrc3BhY2VJZGVudGlmaWVyLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSAmJiB3b3Jrc3BhY2VJZGVudGlmaWVyLnVyaS5zY2hlbWUgIT09ICd2c2NvZGUtdmZzJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBjdXJyZW50IGZvbGRlciBpc24ndCB0cnVzdGVkIGRpcmVjdGx5LCByZXR1cm4gZmFsc2Vcblx0XHRjb25zdCB0cnVzdEluZm8gPSB0aGlzLmRvR2V0VXJpVHJ1c3RJbmZvKHdvcmtzcGFjZUlkZW50aWZpZXIudXJpKTtcblx0XHRpZiAoIXRydXN0SW5mby50cnVzdGVkIHx8ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh3b3Jrc3BhY2VJZGVudGlmaWVyLnVyaSwgdHJ1c3RJbmZvLnVyaSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgcGFyZW50IGlzIGFsc28gdHJ1c3RlZFxuXHRcdGlmICh0aGlzLmNhblNldFBhcmVudEZvbGRlclRydXN0KCkpIHtcblx0XHRcdGNvbnN0IHBhcmVudEZvbGRlciA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHdvcmtzcGFjZUlkZW50aWZpZXIudXJpKTtcblx0XHRcdGNvbnN0IHBhcmVudFBhdGhUcnVzdEluZm8gPSB0aGlzLmRvR2V0VXJpVHJ1c3RJbmZvKHBhcmVudEZvbGRlcik7XG5cdFx0XHRpZiAocGFyZW50UGF0aFRydXN0SW5mby50cnVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIHNldFdvcmtzcGFjZVRydXN0KHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBFbXB0eSB3b3Jrc3BhY2Vcblx0XHRpZiAodGhpcy5pc0VtcHR5V29ya3NwYWNlKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlV29ya3NwYWNlVHJ1c3QodHJ1c3RlZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMuZ2V0V29ya3NwYWNlVXJpcygpO1xuXHRcdGF3YWl0IHRoaXMuc2V0VXJpc1RydXN0KHdvcmtzcGFjZUZvbGRlcnMsIHRydXN0ZWQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VXJpVHJ1c3RJbmZvKHVyaTogVVJJKTogUHJvbWlzZTxJV29ya3NwYWNlVHJ1c3RVcmlJbmZvPiB7XG5cdFx0Ly8gUmV0dXJuIHRydXN0ZWQgd2hlbiB3b3Jrc3BhY2UgdHJ1c3QgaXMgZGlzYWJsZWRcblx0XHRpZiAoIXRoaXMud29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4geyB0cnVzdGVkOiB0cnVlLCB1cmkgfTtcblx0XHR9XG5cblx0XHQvLyBVcmkgaXMgdHJ1c3RlZCBhdXRvbWF0aWNhbGx5IGJ5IHRoZSByZW1vdGVcblx0XHRpZiAodGhpcy5pc1RydXN0ZWRCeVJlbW90ZSh1cmkpKSB7XG5cdFx0XHRyZXR1cm4geyB0cnVzdGVkOiB0cnVlLCB1cmkgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb0dldFVyaVRydXN0SW5mbyhhd2FpdCB0aGlzLmdldENhbm9uaWNhbFVyaSh1cmkpKTtcblx0fVxuXG5cdGFzeW5jIHNldFVyaXNUcnVzdCh1cmlzOiBVUklbXSwgdHJ1c3RlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZG9TZXRVcmlzVHJ1c3QoYXdhaXQgUHJvbWlzZS5hbGwodXJpcy5tYXAodXJpID0+IHRoaXMuZ2V0Q2Fub25pY2FsVXJpKHVyaSkpKSwgdHJ1c3RlZCk7XG5cdH1cblxuXHRnZXRUcnVzdGVkVXJpcygpOiBVUklbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mby5tYXAoaW5mbyA9PiBpbmZvLnVyaSk7XG5cdH1cblxuXHRhc3luYyBzZXRUcnVzdGVkVXJpcyh1cmlzOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3RydXN0U3RhdGVJbmZvLnVyaVRydXN0SW5mbyA9IFtdO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIHVyaXMpIHtcblx0XHRcdGNvbnN0IGNhbm9uaWNhbFVyaSA9IGF3YWl0IHRoaXMuZ2V0Q2Fub25pY2FsVXJpKHVyaSk7XG5cdFx0XHRjb25zdCBjbGVhblVyaSA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5yZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IoY2Fub25pY2FsVXJpKTtcblx0XHRcdGxldCBhZGRlZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBhZGRlZFVyaSBvZiB0aGlzLl90cnVzdFN0YXRlSW5mby51cmlUcnVzdEluZm8pIHtcblx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGFkZGVkVXJpLnVyaSwgY2xlYW5VcmkpKSB7XG5cdFx0XHRcdFx0YWRkZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhZGRlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdHJ1c3RTdGF0ZUluZm8udXJpVHJ1c3RJbmZvLnB1c2goe1xuXHRcdFx0XHR0cnVzdGVkOiB0cnVlLFxuXHRcdFx0XHR1cmk6IGNsZWFuVXJpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnNhdmVUcnVzdEluZm8oKTtcblx0fVxuXG5cdGFkZFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50KHBhcnRpY2lwYW50OiBJV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RydXN0VHJhbnNpdGlvbk1hbmFnZXIuYWRkV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQocGFydGljaXBhbnQpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29wZW5GaWxlc1RydXN0UmVxdWVzdFByb21pc2U/OiBQcm9taXNlPFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2U+O1xuXHRwcml2YXRlIF9vcGVuRmlsZXNUcnVzdFJlcXVlc3RSZXNvbHZlcj86IChyZXNwb25zZTogV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSkgPT4gdm9pZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZXNUcnVzdFJlcXVlc3RQcm9taXNlcyA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZXNUcnVzdFJlcXVlc3RSZXNvbHZlcnMgPSBuZXcgUmVzb3VyY2VNYXA8KHRydXN0ZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpID0+IHZvaWQ+KCk7XG5cblx0cHJpdmF0ZSBfd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UHJvbWlzZT86IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgX3dvcmtzcGFjZVRydXN0UmVxdWVzdFJlc29sdmVyPzogKHRydXN0ZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWF0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluaXRpYXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fb25EaWRJbml0aWF0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluaXRpYXRlUmVzb3VyY2VzVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVzb3VyY2VUcnVzdFJlcXVlc3RPcHRpb25zPigpKTtcblx0cmVhZG9ubHkgb25EaWRJbml0aWF0ZVJlc291cmNlc1RydXN0UmVxdWVzdCA9IHRoaXMuX29uRGlkSW5pdGlhdGVSZXNvdXJjZXNUcnVzdFJlcXVlc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdvcmtzcGFjZVRydXN0UmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0ID0gdGhpcy5fb25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPblN0YXJ0dXAgPSB0aGlzLl9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvLyNyZWdpb24gT3BlbiBmaWxlKHMpIHRydXN0IHJlcXVlc3RcblxuXHRwcml2YXRlIGdldCB1bnRydXN0ZWRGaWxlc1NldHRpbmcoKTogJ3Byb21wdCcgfCAnb3BlbicgfCAnbmV3V2luZG93JyB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoV09SS1NQQUNFX1RSVVNUX1VOVFJVU1RFRF9GSUxFUyk7XG5cdH1cblxuXHRwcml2YXRlIHNldCB1bnRydXN0ZWRGaWxlc1NldHRpbmcodmFsdWU6ICdwcm9tcHQnIHwgJ29wZW4nIHwgJ25ld1dpbmRvdycpIHtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFdPUktTUEFDRV9UUlVTVF9VTlRSVVNURURfRklMRVMsIHZhbHVlKTtcblx0fVxuXG5cdGFzeW5jIGNvbXBsZXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0KHJlc3VsdDogV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSwgc2F2ZVJlc3BvbnNlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fb3BlbkZpbGVzVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZXQgYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXNcblx0XHRpZiAocmVzdWx0ID09PSBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW4pIHtcblx0XHRcdHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5hY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlcyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gU2F2ZSByZXNwb25zZVxuXHRcdGlmIChzYXZlUmVzcG9uc2UpIHtcblx0XHRcdGlmIChyZXN1bHQgPT09IFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UuT3Blbikge1xuXHRcdFx0XHR0aGlzLnVudHJ1c3RlZEZpbGVzU2V0dGluZyA9ICdvcGVuJztcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc3VsdCA9PT0gV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuSW5OZXdXaW5kb3cpIHtcblx0XHRcdFx0dGhpcy51bnRydXN0ZWRGaWxlc1NldHRpbmcgPSAnbmV3V2luZG93Jztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIHByb21pc2Vcblx0XHR0aGlzLl9vcGVuRmlsZXNUcnVzdFJlcXVlc3RSZXNvbHZlcihyZXN1bHQpO1xuXG5cdFx0dGhpcy5fb3BlbkZpbGVzVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb3BlbkZpbGVzVHJ1c3RSZXF1ZXN0UHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3RPcGVuRmlsZXNUcnVzdCh1cmlzOiBVUklbXSk6IFByb21pc2U8V29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZT4ge1xuXHRcdC8vIElmIHdvcmtzcGFjZSBpcyB1bnRydXN0ZWQsIHRoZXJlIGlzIG5vIGNvbmZsaWN0XG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdHJldHVybiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BlbkZpbGVzVHJ1c3RJbmZvID0gYXdhaXQgUHJvbWlzZS5hbGwodXJpcy5tYXAodXJpID0+IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRVcmlUcnVzdEluZm8odXJpKSkpO1xuXG5cdFx0Ly8gSWYgYWxsIHVyaXMgYXJlIHRydXN0ZWQsIHRoZXJlIGlzIG5vIGNvbmZsaWN0XG5cdFx0aWYgKG9wZW5GaWxlc1RydXN0SW5mby5tYXAoaW5mbyA9PiBpbmZvLnRydXN0ZWQpLmV2ZXJ5KHRydXN0ZWQgPT4gdHJ1c3RlZCkpIHtcblx0XHRcdHJldHVybiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdXNlciBoYXMgc2V0dGluZywgZG9uJ3QgbmVlZCB0byBhc2tcblx0XHRpZiAodGhpcy51bnRydXN0ZWRGaWxlc1NldHRpbmcgIT09ICdwcm9tcHQnKSB7XG5cdFx0XHRpZiAodGhpcy51bnRydXN0ZWRGaWxlc1NldHRpbmcgPT09ICduZXdXaW5kb3cnKSB7XG5cdFx0XHRcdHJldHVybiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW5Jbk5ld1dpbmRvdztcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMudW50cnVzdGVkRmlsZXNTZXR0aW5nID09PSAnb3BlbicpIHtcblx0XHRcdFx0cmV0dXJuIFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UuT3Blbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBhbHJlYWR5IGFza2VkIHRoZSB1c2VyLCBkb24ndCBuZWVkIHRvIGFzayBhZ2FpblxuXHRcdGlmICh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXMpIHtcblx0XHRcdHJldHVybiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW47XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlL3JldHVybiBhIHByb21pc2Vcblx0XHRpZiAoIXRoaXMuX29wZW5GaWxlc1RydXN0UmVxdWVzdFByb21pc2UpIHtcblx0XHRcdHRoaXMuX29wZW5GaWxlc1RydXN0UmVxdWVzdFByb21pc2UgPSBuZXcgUHJvbWlzZTxXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlPihyZXNvbHZlID0+IHtcblx0XHRcdFx0dGhpcy5fb3BlbkZpbGVzVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIgPSByZXNvbHZlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9vcGVuRmlsZXNUcnVzdFJlcXVlc3RQcm9taXNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkSW5pdGlhdGVPcGVuRmlsZXNUcnVzdFJlcXVlc3QuZmlyZSgpO1xuXHRcdHJldHVybiB0aGlzLl9vcGVuRmlsZXNUcnVzdFJlcXVlc3RQcm9taXNlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFJlc291cmNlKHMpIHRydXN0IHJlcXVlc3RcblxuXHRhc3luYyBjb21wbGV0ZVJlc291cmNlc1RydXN0UmVxdWVzdCh1cmk6IFVSSSwgcmVzdWx0OiBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSB0aGlzLl9yZXNvdXJjZXNUcnVzdFJlcXVlc3RSZXNvbHZlcnMuZ2V0KHVyaSk7XG5cdFx0aWYgKCFyZXNvbHZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRydXN0ZWQgPSByZXN1bHQgPT09IFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UuT3Blbjtcblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0VXJpc1RydXN0KFt1cmldLCB0cnVzdGVkKTtcblxuXHRcdHJlc29sdmVyKHRydXN0ZWQpO1xuXG5cdFx0dGhpcy5fcmVzb3VyY2VzVHJ1c3RSZXF1ZXN0UmVzb2x2ZXJzLmRlbGV0ZSh1cmkpO1xuXHRcdHRoaXMuX3Jlc291cmNlc1RydXN0UmVxdWVzdFByb21pc2VzLmRlbGV0ZSh1cmkpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdFJlc291cmNlc1RydXN0KG9wdGlvbnM6IFJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIENoZWNrIGlmIGFsbCByZXNvdXJjZXMgYXJlIGFscmVhZHkgdHJ1c3RlZFxuXHRcdGNvbnN0IHJlc291cmNlc1RydXN0SW5mbyA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRVcmlUcnVzdEluZm8ob3B0aW9ucy51cmkpO1xuXHRcdGlmIChyZXNvdXJjZXNUcnVzdEluZm8udHJ1c3RlZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGV4aXN0aW5nIHByb21pc2UgZm9yIHRoaXMgVVJJXG5cdFx0Y29uc3QgZXhpc3RpbmdQcm9taXNlID0gdGhpcy5fcmVzb3VyY2VzVHJ1c3RSZXF1ZXN0UHJvbWlzZXMuZ2V0KG9wdGlvbnMudXJpKTtcblx0XHRpZiAoZXhpc3RpbmdQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmdQcm9taXNlO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBhIG5ldyBwcm9taXNlIGZvciB0aGlzIFVSSVxuXHRcdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdHRoaXMuX3Jlc291cmNlc1RydXN0UmVxdWVzdFJlc29sdmVycy5zZXQob3B0aW9ucy51cmksIHJlc29sdmUpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3Jlc291cmNlc1RydXN0UmVxdWVzdFByb21pc2VzLnNldChvcHRpb25zLnVyaSwgcHJvbWlzZSk7XG5cdFx0dGhpcy5fb25EaWRJbml0aWF0ZVJlc291cmNlc1RydXN0UmVxdWVzdC5maXJlKG9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gV29ya3NwYWNlIHRydXN0IHJlcXVlc3RcblxuXHRwcml2YXRlIHJlc29sdmVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QodHJ1c3RlZD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFJlc29sdmVyKHRydXN0ZWQgPz8gdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKTtcblxuXHRcdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGNhbmNlbFdvcmtzcGFjZVRydXN0UmVxdWVzdCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFJlc29sdmVyKHVuZGVmaW5lZCk7XG5cblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFJlc29sdmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb21wbGV0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCh0cnVzdGVkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0cnVzdGVkID09PSB1bmRlZmluZWQgfHwgdHJ1c3RlZCA9PT0gdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHR0aGlzLnJlc29sdmVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QodHJ1c3RlZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVnaXN0ZXIgb25lLXRpbWUgZXZlbnQgaGFuZGxlciB0byByZXNvbHZlIHRoZSBwcm9taXNlIHdoZW4gd29ya3NwYWNlIHRydXN0IGNoYW5nZWRcblx0XHRFdmVudC5vbmNlKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0KSh0cnVzdGVkID0+IHRoaXMucmVzb2x2ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCh0cnVzdGVkKSk7XG5cblx0XHQvLyBVcGRhdGUgc3RvcmFnZSwgdHJhbnNpdGlvbiB3b3Jrc3BhY2Ugc3RhdGVcblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0V29ya3NwYWNlVHJ1c3QodHJ1c3RlZCk7XG5cdH1cblxuXHRhc3luYyByZXF1ZXN0V29ya3NwYWNlVHJ1c3Qob3B0aW9ucz86IFdvcmtzcGFjZVRydXN0UmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBUcnVzdGVkIHdvcmtzcGFjZVxuXHRcdGlmICh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cdFx0fVxuXG5cdFx0Ly8gTW9kYWwgcmVxdWVzdFxuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UHJvbWlzZSkge1xuXHRcdFx0Ly8gQ3JlYXRlIHByb21pc2Vcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UmVzb2x2ZXIgPSByZXNvbHZlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFJldHVybiBleGlzdGluZyBwcm9taXNlXG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UHJvbWlzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0LmZpcmUob3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFByb21pc2U7XG5cdH1cblxuXHRyZXF1ZXN0V29ya3NwYWNlVHJ1c3RPblN0YXJ0dXAoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RQcm9taXNlKSB7XG5cdFx0XHQvLyBDcmVhdGUgcHJvbWlzZVxuXHRcdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0UHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RSZXNvbHZlciA9IHJlc29sdmU7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZEluaXRpYXRlV29ya3NwYWNlVHJ1c3RSZXF1ZXN0T25TdGFydHVwLmZpcmUoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5jbGFzcyBXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25NYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwYXJ0aWNpcGFudHMgPSBuZXcgTGlua2VkTGlzdDxJV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQ+KCk7XG5cblx0YWRkV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZW1vdmUgPSB0aGlzLnBhcnRpY2lwYW50cy5wdXNoKHBhcnRpY2lwYW50KTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHJlbW92ZSgpKTtcblx0fVxuXG5cdGFzeW5jIHBhcnRpY2lwYXRlKHRydXN0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHBhcnRpY2lwYW50IG9mIHRoaXMucGFydGljaXBhbnRzKSB7XG5cdFx0XHRhd2FpdCBwYXJ0aWNpcGFudC5wYXJ0aWNpcGF0ZSh0cnVzdGVkKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMucGFydGljaXBhbnRzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBXb3Jrc3BhY2VUcnVzdE1lbWVudG9EYXRhIHtcblx0YWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXM/OiBib29sZWFuO1xuXHRpc0VtcHR5V29ya3NwYWNlVHJ1c3RlZD86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIFdvcmtzcGFjZVRydXN0TWVtZW50byB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWVtZW50bz86IE1lbWVudG88V29ya3NwYWNlVHJ1c3RNZW1lbnRvRGF0YT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbWVudG9PYmplY3Q6IFdvcmtzcGFjZVRydXN0TWVtZW50b0RhdGE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXNLZXkgPSAnYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXMnO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0VtcHR5V29ya3NwYWNlVHJ1c3RlZEtleSA9ICdpc0VtcHR5V29ya3NwYWNlVHJ1c3RlZCc7XG5cblx0Y29uc3RydWN0b3Ioc3RvcmFnZVNlcnZpY2U/OiBJU3RvcmFnZVNlcnZpY2UpIHtcblx0XHRpZiAoc3RvcmFnZVNlcnZpY2UpIHtcblx0XHRcdHRoaXMuX21lbWVudG8gPSBuZXcgTWVtZW50bygnd29ya3NwYWNlVHJ1c3QnLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0XHR0aGlzLl9tZW1lbnRvT2JqZWN0ID0gdGhpcy5fbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21lbWVudG9PYmplY3QgPSB7fTtcblx0XHR9XG5cdH1cblxuXHRnZXQgYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21lbWVudG9PYmplY3RbdGhpcy5fYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXNLZXldID8/IGZhbHNlO1xuXHR9XG5cblx0c2V0IGFjY2VwdHNPdXRPZldvcmtzcGFjZUZpbGVzKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWVtZW50b09iamVjdFt0aGlzLl9hY2NlcHRzT3V0T2ZXb3Jrc3BhY2VGaWxlc0tleV0gPSB2YWx1ZTtcblxuXHRcdHRoaXMuX21lbWVudG8/LnNhdmVNZW1lbnRvKCk7XG5cdH1cblxuXHRnZXQgaXNFbXB0eVdvcmtzcGFjZVRydXN0ZWQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21lbWVudG9PYmplY3RbdGhpcy5faXNFbXB0eVdvcmtzcGFjZVRydXN0ZWRLZXldO1xuXHR9XG5cblx0c2V0IGlzRW1wdHlXb3Jrc3BhY2VUcnVzdGVkKHZhbHVlOiBib29sZWFuIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fbWVtZW50b09iamVjdFt0aGlzLl9pc0VtcHR5V29ya3NwYWNlVHJ1c3RlZEtleV0gPSB2YWx1ZTtcblxuXHRcdHRoaXMuX21lbWVudG8/LnNhdmVNZW1lbnRvKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsIFdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHVDQUF1RDtBQUNoRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUEyQyxrQkFBa0IsbUNBQW1DLHNCQUFrQywwQkFBNEMsdUJBQXVCLHNCQUFzQjtBQUMzTixTQUF1QyxrQ0FBK0UsK0JBQXFFLDJCQUEyQix3Q0FBcUU7QUFDM1IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMkJB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
