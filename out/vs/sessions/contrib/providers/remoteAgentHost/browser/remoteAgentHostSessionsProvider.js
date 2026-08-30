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
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { agentHostUri } from "../../../../../platform/agentHost/common/agentHostFileSystemProvider.js";
import { AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentSession } from "../../../../../platform/agentHost/common/agent.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService, IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IAgentHostActiveClientService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { buildAgentHostSessionWorkspace, readBranchProtectionPatterns } from "../../../../common/agentHostSessionWorkspace.js";
import { SESSION_WORKSPACE_GROUP_REMOTE } from "../../../../services/sessions/common/session.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { IGitHubService } from "../../../github/browser/githubService.js";
import { BaseAgentHostSessionsProvider } from "../../agentHost/browser/baseAgentHostSessionsProvider.js";
import { remoteAgentHostSessionTypeId } from "../../../../../platform/agentHost/common/agentHostSessionType.js";
const CACHED_SESSIONS_STORAGE_PREFIX = "remoteAgentHost.cachedSessions.v2.";
const CACHED_SESSIONS_STORAGE_PREFIX_LEGACY = "remoteAgentHost.cachedSessions.";
function toLocalProjectUri(uri, connectionAuthority) {
  return uri.scheme === Schemas.file ? toAgentHostUri(uri, connectionAuthority) : uri;
}
let RemoteAgentHostSessionsProvider = class extends BaseAgentHostSessionsProvider {
  constructor(config, _fileDialogService, _notificationService, storageService, chatSessionsService, chatService, chatWidgetService, languageModelsService, _remoteAgentHostService, _labelService, _configurationService, logService, gitHubService, instantiationService, sessionsService, activeClientService, dialogService, workspaceTrustManagementService) {
    super(chatSessionsService, chatService, chatWidgetService, languageModelsService, _configurationService, logService, gitHubService, instantiationService, sessionsService, activeClientService, storageService, dialogService, workspaceTrustManagementService);
    this._fileDialogService = _fileDialogService;
    this._notificationService = _notificationService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._labelService = _labelService;
    this._configurationService = _configurationService;
    this.icon = Codicon.remote;
    this._connectionStatus = observableValue("connectionStatus", RemoteAgentHostConnectionStatus.disconnected);
    /**
     * Forces this host's sessions read-only. Distinct from `disconnected`: a disconnected host may
     * come back, so its sessions stay writable and queue on reconnect, whereas this marks a host
     * that is gone and whose sessions exist only as replayed history.
     */
    this._readOnly = observableValue("providerReadOnly", false);
    this.connectionStatus = this._connectionStatus;
    /**
     * `true` while we are still resolving and pushing tokens for the host's
     * `protectedResources`. Defaults to `true` so that sessions surface as
     * loading until the first authentication pass settles.
     */
    this._authenticationPending = observableValue("authenticationPending", true);
    this._authenticationSettled = false;
    this._onDidDisconnect = this._register(new Emitter());
    this._connectionListeners = this._register(new DisposableStore());
    /**
     * When `true`, the provider has been marked unreachable and sessions are
     * hidden from {@link getSessions}, even though {@link _sessionCache} and
     * persistent storage are retained. Cleared when a new connection is wired
     * up in {@link setConnection}, at which point the cached entries are
     * re-announced so the UI can repopulate.
     */
    this._unpublished = false;
    this._connectionAuthority = agentHostAuthority(config.address);
    this._connectOnDemand = config.connectOnDemand;
    this._disconnectOnDemand = config.disconnectOnDemand;
    this._sessionSchemeAlias = config.sessionSchemeAlias;
    this._omitHostFromWorkspaceLabel = config.omitHostFromWorkspaceLabel === true;
    this._workspaceTypeIcon = config.workspaceTypeIcon;
    this.onDidReportConnectProgress = config.onDidReportConnectProgress;
    this.canConnectOnDemand = !!config.connectOnDemand;
    const displayName = config.name || config.address;
    this.id = `agenthost-${this._connectionAuthority}`;
    this.label = displayName;
    this.remoteAddress = config.address;
    this.remoteLocationPreferenceKey = config.preferenceKey ?? config.address;
    this._storageKey = `${CACHED_SESSIONS_STORAGE_PREFIX}${this._connectionAuthority}`;
    this.browseActions = [{
      label: localize("folders", "Folders"),
      description: displayName,
      group: SESSION_WORKSPACE_GROUP_REMOTE,
      icon: Codicon.remote,
      providerId: this.id,
      run: () => this._browseForFolder(),
      listFolders: (query, token) => this._listRemoteFolders(query, token)
    }];
    this._enableSessionCachePersistence(this._storageKey, `${CACHED_SESSIONS_STORAGE_PREFIX_LEGACY}${this._connectionAuthority}`);
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("git.branchProtection")) {
        this._refreshSessionWorkspaces();
      }
    }));
  }
  get onConnectionLost() {
    return this._onDidDisconnect.event;
  }
  /**
   * Overridable seam so tests can exercise both the web and non-web
   * branches of the label/description gating without depending on the
   * ambient {@link isWeb} constant (the browser test runner always
   * reports `isWeb === true`).
   */
  get isWebPlatform() {
    return isWeb;
  }
  // -- BaseAgentHostSessionsProvider hooks ---------------------------------
  get connection() {
    return this._connection;
  }
  get authenticationPending() {
    return this._authenticationPending;
  }
  /**
   * Suspend cache-change tracking while sessions are unpublished (offline) so
   * the on-disk snapshot survives an unreachable host. See
   * {@link unpublishCachedSessions}.
   */
  _shouldTrackSessionCacheChanges() {
    return !this._unpublished;
  }
  _adapterOptions() {
    const hostLabel = this._workspaceHostLabel;
    const typeIcon = this._workspaceTypeIcon;
    return {
      readOnly: this._readOnly,
      buildWorkspace: (project, workingDirectories, gitHubInfo, gitState) => {
        const primary = workingDirectories?.[0];
        const uriForDescription = project?.uri ?? primary;
        const description = uriForDescription ? this._labelService.getUriLabel(dirname(uriForDescription), { relative: false }) : void 0;
        const branchProtectionPatterns = readBranchProtectionPatterns(this._configurationService, primary ?? project?.uri);
        return RemoteAgentHostSessionsProvider.buildWorkspace(project, workingDirectories, hostLabel, gitHubInfo, gitState, description, branchProtectionPatterns, typeIcon);
      }
    };
  }
  resourceSchemeForProvider(provider) {
    return remoteAgentHostSessionTypeId(this._connectionAuthority, provider);
  }
  getSessions() {
    return this._unpublished ? [] : super.getSessions();
  }
  mapWorkingDirectoryUri(uri) {
    return toAgentHostUri(uri, this._connectionAuthority);
  }
  mapProjectUri(uri) {
    return toLocalProjectUri(uri, this._connectionAuthority);
  }
  _diffUriMapper() {
    return (uri) => toAgentHostUri(uri, this._connectionAuthority);
  }
  _validateBeforeCreate(_sessionType) {
    if (!this._connection) {
      throw new Error(localize("notConnectedSession", "Cannot create session: not connected to remote agent host '{0}'.", this.label));
    }
  }
  _noAgentsErrorMessage() {
    return localize("noAgents", "Remote agent host '{0}' has not advertised any agents yet.", this.label);
  }
  _notConnectedSendErrorMessage() {
    return localize("notConnectedSend", "Cannot send request: not connected to remote agent host '{0}'.", this.label);
  }
  // -- Connection lifecycle ------------------------------------------------
  /**
   * Establish (or re-establish) the connection for this host on demand.
   * Tunnel-backed providers use their relay hook; other providers fall
   * back to the generic remote agent host reconnect path.
   */
  async connect() {
    if (this._connectOnDemand) {
      await this._connectOnDemand();
      return;
    }
    this._remoteAgentHostService.reconnect(this.remoteAddress);
  }
  /**
   * Tear down the active connection for this host. Tunnel-backed providers
   * use their relay hook; other providers fall back to the generic remote
   * agent host disconnect path. Cached sessions are hidden from the UI so
   * the sessions list reflects the disconnected state; the persisted cache
   * is retained so sessions can be restored on reconnect.
   */
  async disconnect() {
    this.unpublishCachedSessions();
    if (this._disconnectOnDemand) {
      await this._disconnectOnDemand();
      return;
    }
    await this._remoteAgentHostService.removeRemoteAgentHost(this.remoteAddress);
  }
  /** Update the connection status for this provider. */
  setConnectionStatus(status) {
    this._connectionStatus.set(status, void 0);
  }
  /**
   * Forces every session on this host to be read-only.
   *
   * Set when the host is permanently unreachable and its sessions are being served from
   * persisted history: the conversation is genuine, but there is no host left to send to, so the
   * composer must be hidden rather than accept input that can never be delivered.
   */
  setReadOnly(readOnly) {
    this._readOnly.set(readOnly, void 0);
  }
  /**
   * Seed discovered session summaries into the cache so they surface in the sessions list
   * **before** a connection is established (lazy discovery).
   *
   * An entry that already exists keeps everything the host has told us, except for a missing
   * project: the repository name is resolved over the network and that lookup can fail, so
   * filling it in on a later pass is what makes retrying worth anything. Opening a seeded session
   * triggers `connectOnDemand`, after which `_refreshSessions` reconciles against the host.
   */
  seedSessions(metas) {
    const added = [];
    const changed = [];
    for (const rawMeta of metas) {
      const meta = this._adoptSessionMeta(rawMeta);
      const rawId = AgentSession.id(meta.session);
      const existing = this._sessionCache.get(rawId);
      if (existing) {
        if (meta.project && !existing.project && existing.backfillProject(meta.project)) {
          changed.push(existing);
        }
        continue;
      }
      const adapter = this.createAdapter(meta);
      this._sessionCache.set(rawId, adapter);
      added.push(adapter);
    }
    if (added.length > 0 || changed.length > 0) {
      this._onDidChangeSessions.fire({ added, removed: [], changed });
    }
  }
  /**
   * Map a host-reported session URI onto the UI scheme, so the session routes to the agent's
   * content provider. The raw id is preserved, so cache keys are unaffected.
   */
  _adoptSessionMeta(meta) {
    const alias = this._sessionSchemeAlias;
    if (!alias || meta.session.scheme !== alias.backend) {
      return meta;
    }
    return { ...meta, session: meta.session.with({ scheme: alias.ui }) };
  }
  /**
   * Inverse of {@link _adoptSessionMeta}: map the UI scheme back to the one the host's session
   * registry is keyed by, so backend calls address the URI the host knows.
   */
  _backendSessionScheme(agentProvider) {
    const alias = this._sessionSchemeAlias;
    return alias && agentProvider === alias.ui ? alias.backend : agentProvider;
  }
  setAuthenticationPending(pending) {
    if (this._authenticationSettled) {
      return;
    }
    if (!pending) {
      this._authenticationSettled = true;
    }
    this._authenticationPending.set(pending, void 0);
    if (!pending) {
      this._resumeNewSessionAfterAuthenticationSettles();
    }
  }
  /**
   * Wire a live connection to this provider, enabling session operations and folder browsing.
   */
  setConnection(connection, defaultDirectory) {
    if (this._connection === connection && this._defaultDirectory === defaultDirectory) {
      return;
    }
    const wasUnpublished = this._unpublished;
    this._connectionListeners.clear();
    this._sessionStateSubscriptions.clearAndDisposeAll();
    this._connection = connection;
    this._defaultDirectory = defaultDirectory;
    this._unpublished = false;
    this._syncRootState(connection.rootState.value);
    this._connectionListeners.add(connection.rootState.onDidChange(() => {
      this._syncRootState(connection.rootState.value);
    }));
    if (connection.rootState.onDidError) {
      this._connectionListeners.add(connection.rootState.onDidError((error) => {
        this._syncRootState(error);
      }));
    }
    this._attachConnectionListeners(connection, this._connectionListeners);
    this._refreshSessions(wasUnpublished);
  }
  /**
   * Clear the connection, e.g. when the remote host disconnects.
   * Retains the provider registration so it remains visible in the UI,
   * and **preserves** the cached session list so previously loaded
   * sessions stay visible while we're offline. Callers that know the
   * host is unreachable should follow up with {@link unpublishCachedSessions}.
   */
  clearConnection() {
    this._connectionListeners.clear();
    this._sessionStateSubscriptions.clearAndDisposeAll();
    this._onDidDisconnect.fire();
    this._connection = void 0;
    this._defaultDirectory = void 0;
    this._disposeAllNewSessions();
    this._syncRootState(void 0);
    if (this._pendingSession) {
      const pending = this._pendingSession;
      this._pendingSession = void 0;
      this._onDidChangeSessions.fire({ added: [], removed: [pending], changed: [] });
    }
    this._cacheInitialized = false;
    this._cancelSessionRefreshRetry();
  }
  /**
   * Hide cached sessions from the UI without discarding them. Called by the
   * host-tracking contributions when they determine the remote host is
   * unreachable (tunnel offline or SSH reconnect failed). The in-memory
   * cache and persisted storage are left intact so the sessions can be
   * restored if the host comes back online in this session, or on the next
   * launch. The next {@link setConnection} call re-announces the cached
   * entries.
   */
  unpublishCachedSessions() {
    if (this._unpublished) {
      return;
    }
    this._unpublished = true;
    if (this._sessionCache.size > 0) {
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
    }
  }
  // -- Session-type sync ---------------------------------------------------
  _formatSessionTypeLabel(agentLabel) {
    if (this.isWebPlatform) {
      return agentLabel;
    }
    return `${agentLabel} [${this.label}]`;
  }
  // -- Workspaces ----------------------------------------------------------
  /**
   * The host name appended to this host's workspace labels, or `undefined` when it would add
   * nothing — in web the workbench is already scoped to a single host by the host picker.
   */
  get _workspaceHostLabel() {
    return this.isWebPlatform || this._omitHostFromWorkspaceLabel ? void 0 : this.label;
  }
  static buildWorkspace(project, workingDirectories, providerLabel, gitHubInfo, gitState, description, branchProtectionPatterns, typeIcon) {
    return buildAgentHostSessionWorkspace(project, workingDirectories, { providerLabel, fallbackIcon: Codicon.remote, requiresWorkspaceTrust: true, description, branchProtectionPatterns, group: SESSION_WORKSPACE_GROUP_REMOTE, typeIcon }, gitHubInfo, gitState);
  }
  _buildWorkspaceFromUri(uri) {
    const folderName = basename(uri) || uri.path;
    const hostLabel = this._workspaceHostLabel;
    return {
      uri,
      label: hostLabel ? `${folderName} [${hostLabel}]` : folderName,
      description: this._labelService.getUriLabel(dirname(uri), { relative: false }),
      group: SESSION_WORKSPACE_GROUP_REMOTE,
      icon: Codicon.remote,
      folders: [{
        root: uri,
        workingDirectory: uri,
        name: folderName,
        description: void 0,
        gitRepository: { uri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
      }],
      requiresWorkspaceTrust: true,
      isVirtualWorkspace: false
    };
  }
  resolveWorkspace(repositoryUri) {
    if (repositoryUri.scheme !== AGENT_HOST_SCHEME) {
      return void 0;
    }
    if (repositoryUri.authority !== this._connectionAuthority) {
      return void 0;
    }
    return this._buildWorkspaceFromUri(repositoryUri);
  }
  // -- Browse --------------------------------------------------------------
  async _browseForFolder() {
    if (!this._connection && this._connectOnDemand) {
      try {
        await this._connectOnDemand();
      } catch (err) {
        this._notificationService.error(localize("connectFailed", "Failed to connect to remote agent host '{0}': {1}", this.label, err instanceof Error ? err.message : String(err)));
        return void 0;
      }
    }
    if (!this._connection) {
      this._notificationService.error(localize("notConnected", "Unable to connect to remote agent host '{0}'.", this.label));
      return void 0;
    }
    const defaultUri = agentHostUri(this._connectionAuthority, this._defaultDirectory ?? "/");
    try {
      const selected = await this._fileDialogService.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: localize("selectRemoteFolder", "Select Folder on {0}", this.label),
        availableFileSystems: [AGENT_HOST_SCHEME],
        defaultUri
      });
      if (selected?.[0]) {
        return this._buildWorkspaceFromUri(selected[0]);
      }
    } catch {
    }
    return void 0;
  }
  /**
   * Enumerate subdirectories below {@link _defaultDirectory}, filtered
   * by a case-insensitive substring query. Backs the inline folder
   * list rendered by the mobile workspace picker sheet so users can
   * pick a folder without opening a separate file-dialog.
   *
   * The query supports light path navigation: a `/` in the query is
   * treated as a path delimiter, listing children of `<default>/<prefix>`
   * and matching the part after the last slash. So typing `projects/`
   * drills into the `projects` directory, and `projects/foo` lists
   * children of `projects` whose name contains `foo`.
   *
   * Hidden directories (those starting with `.`) are omitted, results
   * are sorted by name, and the cancellation token is honored before
   * and after the network round-trip so stale queries don't surface
   * after the user has typed more characters.
   */
  async _listRemoteFolders(query, token) {
    if (!this._connection && this._connectOnDemand) {
      try {
        await this._connectOnDemand();
      } catch {
        return [];
      }
    }
    if (!this._connection || token.isCancellationRequested) {
      return [];
    }
    const rootAgentHostUri = agentHostUri(this._connectionAuthority, this._defaultDirectory ?? "/");
    const trimmed = query.trim();
    const lastSlash = trimmed.lastIndexOf("/");
    let listingAgentHostUri = rootAgentHostUri;
    let filter = trimmed;
    if (lastSlash >= 0) {
      const subPath = trimmed.slice(0, lastSlash).replace(/^\/+|\/+$/g, "");
      filter = trimmed.slice(lastSlash + 1);
      if (subPath) {
        listingAgentHostUri = URI.joinPath(rootAgentHostUri, subPath);
      }
    }
    const listingOriginalUri = fromAgentHostUri(listingAgentHostUri);
    let entries;
    try {
      const result = await this._connection.resourceList(listingOriginalUri);
      entries = result.entries;
    } catch {
      return [];
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const lowerFilter = filter.toLocaleLowerCase();
    const folders = [];
    for (const entry of entries) {
      if (entry.type !== "directory") {
        continue;
      }
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (lowerFilter && !entry.name.toLocaleLowerCase().includes(lowerFilter)) {
        continue;
      }
      const childUri = URI.joinPath(listingAgentHostUri, entry.name);
      folders.push({ ...this._buildWorkspaceFromUri(childUri), icon: Codicon.folder });
    }
    folders.sort((a, b) => a.label.localeCompare(b.label));
    return folders;
  }
};
RemoteAgentHostSessionsProvider = __decorateClass([
  __decorateParam(1, IFileDialogService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IChatSessionsService),
  __decorateParam(5, IChatService),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, ILanguageModelsService),
  __decorateParam(8, IRemoteAgentHostService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IGitHubService),
  __decorateParam(13, IInstantiationService),
  __decorateParam(14, ISessionsService),
  __decorateParam(15, IAgentHostActiveClientService),
  __decorateParam(16, IDialogService),
  __decorateParam(17, IWorkspaceTrustManagementService)
], RemoteAgentHostSessionsProvider);
export {
  RemoteAgentHostSessionsProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXHJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9TQ0hFTUUsIGFnZW50SG9zdEF1dGhvcml0eSwgZnJvbUFnZW50SG9zdFVyaSwgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIHR5cGUgSUFnZW50U2Vzc2lvbk1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyB0eXBlIElBZ2VudENvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uR2l0U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDb25uZWN0UHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBidWlsZEFnZW50SG9zdFNlc3Npb25Xb3Jrc3BhY2UsIHJlYWRCcmFuY2hQcm90ZWN0aW9uUGF0dGVybnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbldvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViSW5mbywgSVNlc3Npb24sIElTZXNzaW9uVHlwZSwgSVNlc3Npb25Xb3Jrc3BhY2UsIElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9naXRodWJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYWdlbnRIb3N0L2Jyb3dzZXIvYmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgcmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U2Vzc2lvblR5cGUuanMnO1xuXG4vKiogU3RvcmFnZSBrZXkgcHJlZml4IGZvciBjYWNoZWQgc2Vzc2lvbiBzdW1tYXJpZXMsIHBlciByZW1vdGUgYWRkcmVzcy4gKi9cbmNvbnN0IENBQ0hFRF9TRVNTSU9OU19TVE9SQUdFX1BSRUZJWCA9ICdyZW1vdGVBZ2VudEhvc3QuY2FjaGVkU2Vzc2lvbnMudjIuJztcbi8vIFRPRE9Ac2FuZHkwODEgUmVtb3ZlIHRoaXMgbGVnYWN5IGNhY2hlLWtleSBjbGVhbnVwIGFmdGVyIDIwMjYtMTAtMTQuXG5jb25zdCBDQUNIRURfU0VTU0lPTlNfU1RPUkFHRV9QUkVGSVhfTEVHQUNZID0gJ3JlbW90ZUFnZW50SG9zdC5jYWNoZWRTZXNzaW9ucy4nO1xuXG5mdW5jdGlvbiB0b0xvY2FsUHJvamVjdFVyaSh1cmk6IFVSSSwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogVVJJIHtcblx0cmV0dXJuIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHRvQWdlbnRIb3N0VXJpKHVyaSwgY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1cmk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJDb25maWcge1xuXHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0LyoqXG5cdCAqIFN0YWJsZSBwcmVmZXJlbmNlIGtleSBmb3IgdGhpcyBob3N0IChzZWVcblx0ICoge0BsaW5rIElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLnJlbW90ZUxvY2F0aW9uUHJlZmVyZW5jZUtleX0pLCB3aGVuXG5cdCAqIGl0IGRpZmZlcnMgZnJvbSB7QGxpbmsgYWRkcmVzc30gXHUyMDE0IGUuZy4gYW4gU1NIIGhvc3Qnc1xuXHQgKiBgY29tcHV0ZVNTSENvbm5lY3Rpb25LZXkoKWAgcmVzdWx0IHZlcnN1cyBpdHMgbGl2ZSBmb3J3YXJkZWQgYWRkcmVzcy5cblx0ICogRGVmYXVsdHMgdG8ge0BsaW5rIGFkZHJlc3N9IHdoZW4gb21pdHRlZC5cblx0ICovXG5cdHJlYWRvbmx5IHByZWZlcmVuY2VLZXk/OiBzdHJpbmc7XG5cdC8qKiBPcHRpb25hbCBob29rIHRvIGVzdGFibGlzaCBhIGNvbm5lY3Rpb24gb24gZGVtYW5kIChlLmcuIHR1bm5lbCByZWxheSkuICovXG5cdHJlYWRvbmx5IGNvbm5lY3RPbkRlbWFuZD86ICgpID0+IFByb21pc2U8dm9pZD47XG5cdC8qKiBPcHRpb25hbCBob29rIHRvIHRlYXIgZG93biB0aGUgYWN0aXZlIGNvbm5lY3Rpb24gb24gZGVtYW5kIChlLmcuIHR1bm5lbCByZWxheSkuICovXG5cdHJlYWRvbmx5IGRpc2Nvbm5lY3RPbkRlbWFuZD86ICgpID0+IFByb21pc2U8dm9pZD47XG5cdC8qKiBPcHRpb25hbCBwcm9ncmVzcyBtZXNzYWdlcyBkdXJpbmcgb24tZGVtYW5kIGNvbm5lY3QuICovXG5cdHJlYWRvbmx5IG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzPzogRXZlbnQ8SUFnZW50SG9zdENvbm5lY3RQcm9ncmVzcz47XG5cdC8qKlxuXHQgKiBTZXQgd2hlbiB0aGUgaG9zdCBhZGRyZXNzZXMgc2Vzc2lvbnMgdW5kZXIgYSBzY2hlbWUgdGhhdCBkaWZmZXJzIGZyb20gaXRzIGFnZW50IHByb3ZpZGVyLCBhc1xuXHQgKiB0aGUgY2xvdWQgc2FuZGJveCBob3N0IGRvZXMgKHNlc3Npb25zIGFyZSBgYWhwLXNlc3Npb246LzxpZD5gIHdoaWxlIHRoZSBhZ2VudCBpcyBgY29waWxvdGApLlxuXHQgKiBUaGUgcHJvdmlkZXIgZGVyaXZlcyBib3RoIGRpcmVjdGlvbnMgZnJvbSB0aGlzIHBhaXIsIHNvIHRoZXkgY2Fubm90IGRyaWZ0IGFwYXJ0LlxuXHQgKi9cblx0cmVhZG9ubHkgc2Vzc2lvblNjaGVtZUFsaWFzPzogSVNlc3Npb25TY2hlbWVBbGlhcztcblx0LyoqXG5cdCAqIFN1cHByZXNzZXMgdGhlIGBbaG9zdF1gIHN1ZmZpeCB0aGF0IG90aGVyd2lzZSBkaXNhbWJpZ3VhdGVzIHRoaXMgaG9zdCdzIHdvcmtzcGFjZXMgZnJvbVxuXHQgKiBpZGVudGljYWxseS1uYW1lZCBvbmVzIG9uIG90aGVyIGhvc3RzLiBTZXQgYnkgaG9zdHMgd2hvc2UgbGFiZWwgbmFtZXMgYSB0YXNrIHJhdGhlciB0aGFuIGFcblx0ICogbG9jYXRpb24sIHdoZXJlIHRoZSBzdWZmaXggd291bGQgcHV0IGV2ZXJ5IHNlc3Npb24gaW4gYSB3b3Jrc3BhY2UgZ3JvdXAgb2Ygb25lLlxuXHQgKi9cblx0cmVhZG9ubHkgb21pdEhvc3RGcm9tV29ya3NwYWNlTGFiZWw/OiBib29sZWFuO1xuXHQvKiogVHlwZSBpY29uIGZvciB0aGlzIGhvc3QncyB3b3Jrc3BhY2VzLiBTZWUge0BsaW5rIElTZXNzaW9uV29ya3NwYWNlLnR5cGVJY29ufS4gKi9cblx0cmVhZG9ubHkgd29ya3NwYWNlVHlwZUljb24/OiBUaGVtZUljb247XG59XG5cbi8qKlxuICogVGhlIHR3byBuYW1lcyBhIHNlc3Npb24gZ29lcyBieSB3aGVuIHRoZSBob3N0J3Mgc2Vzc2lvbiBzY2hlbWUgZGlmZmVycyBmcm9tIGl0cyBhZ2VudCBwcm92aWRlci5cbiAqIFRoZSByYXcgc2Vzc2lvbiBpZCBpcyBzaGFyZWQsIHNvIG9ubHkgdGhlIHNjaGVtZSBpcyB0cmFuc2xhdGVkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uU2NoZW1lQWxpYXMge1xuXHQvKiogU2NoZW1lIHRoZSBVSSByb3V0ZXMgYnkgXHUyMDE0IHRoZSBhZ2VudCBwcm92aWRlciAoZS5nLiBgY29waWxvdGApLiAqL1xuXHRyZWFkb25seSB1aTogc3RyaW5nO1xuXHQvKiogU2NoZW1lIHRoZSBob3N0J3Mgc2Vzc2lvbiByZWdpc3RyeSBpcyBrZXllZCBieSAoZS5nLiBgYWhwLXNlc3Npb25gKS4gKi9cblx0cmVhZG9ubHkgYmFja2VuZDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFNlc3Npb25zIHByb3ZpZGVyIGZvciBhIHJlbW90ZSBhZ2VudCBob3N0IGNvbm5lY3Rpb24uIEEgdGhpbiBzdWJjbGFzcyBvZlxuICoge0BsaW5rIEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyfSB0aGF0IGFkZHMgdGhlIGNvbm5lY3Rpb24tbGlmZWN5Y2xlXG4gKiBzdXJmYWNlIChgc2V0Q29ubmVjdGlvbmAvYGNsZWFyQ29ubmVjdGlvbmApLCBzdGlja3kgYXV0aGVudGljYXRpb24tcGVuZGluZ1xuICogdHJhY2tpbmcsIHRoZSB3ZWxsLWtub3duIHNlc3Npb24tdHlwZSBtYXBwaW5nLCBhbmQgYSByZW1vdGUgZm9sZGVyIHBpY2tlci5cbiAqXG4gKiAqKlVSSS9JRCBzY2hlbWU6KipcbiAqIC0gKipyYXdJZCoqIC0gdW5pcXVlIHNlc3Npb24gaWRlbnRpZmllciAoZS5nLiBgYWJjMTIzYCksIHVzZWQgYXMgdGhlIGNhY2hlIGtleS5cbiAqIC0gKipyZXNvdXJjZSoqIC0gYHtyZXNvdXJjZVNjaGVtZX06Ly8ve3Jhd0lkfWAuIFRoZSBzY2hlbWUgaXMgdGhlIHVuaXF1ZVxuICogICBwZXItY29ubmVjdGlvbiBpZCBhbmQgcm91dGVzIHRoZSBjaGF0IHNlcnZpY2UgdG8gdGhlIGNvcnJlY3RcbiAqICAge0BsaW5rIEFnZW50SG9zdFNlc3Npb25IYW5kbGVyfS5cbiAqIC0gKipzZXNzaW9uVHlwZSoqIC0gdGhlIGxvZ2ljYWwgc2Vzc2lvbiB0eXBlIChlLmcuIGBjb3BpbG90Y2xpYCBmb3IgY29waWxvdFxuICogICBhZ2VudHMsIG9yIHRoZSBwZXItY29ubmVjdGlvbiBpZCBmb3Igb3RoZXIgYWdlbnRzKS4gRGlzdGluY3QgZnJvbSB0aGVcbiAqICAgcmVzb3VyY2Ugc2NoZW1lLlxuICogLSAqKnNlc3Npb25JZCoqIC0gYHtwcm92aWRlcklkfTp7cmVzb3VyY2V9YCAtIHRoZSBwcm92aWRlci1zY29wZWQgSUQgdXNlZCBieVxuICogICB7QGxpbmsgSVNlc3Npb25zUHJvdmlkZXJ9IG1ldGhvZHMuXG4gKiAtIFByb3RvY29sIG9wZXJhdGlvbnMgKGUuZy4gYGRpc3Bvc2VTZXNzaW9uYCkgdXNlIHRoZSBjYW5vbmljYWwgYWdlbnRcbiAqICAgc2Vzc2lvbiBVUkkgKGBjb3BpbG90Oi8vL2FiYzEyM2ApLCByZWNvbnN0cnVjdGVkIHZpYSBgQWdlbnRTZXNzaW9uLnVyaWAuXG4gKi9cbmV4cG9ydCBjbGFzcyBSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIGV4dGVuZHMgQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIge1xuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbiA9IENvZGljb24ucmVtb3RlO1xuXHRyZWFkb25seSByZW1vdGVBZGRyZXNzOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlbW90ZUxvY2F0aW9uUHJlZmVyZW5jZUtleTogc3RyaW5nO1xuXHRyZWFkb25seSBicm93c2VBY3Rpb25zOiByZWFkb25seSBJU2Vzc2lvbldvcmtzcGFjZUJyb3dzZUFjdGlvbltdO1xuXHRyZWFkb25seSBjYW5Db25uZWN0T25EZW1hbmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzOiBFdmVudDxJQWdlbnRIb3N0Q29ubmVjdFByb2dyZXNzPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uU3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCdjb25uZWN0aW9uU3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHQvKipcblx0ICogRm9yY2VzIHRoaXMgaG9zdCdzIHNlc3Npb25zIHJlYWQtb25seS4gRGlzdGluY3QgZnJvbSBgZGlzY29ubmVjdGVkYDogYSBkaXNjb25uZWN0ZWQgaG9zdCBtYXlcblx0ICogY29tZSBiYWNrLCBzbyBpdHMgc2Vzc2lvbnMgc3RheSB3cml0YWJsZSBhbmQgcXVldWUgb24gcmVjb25uZWN0LCB3aGVyZWFzIHRoaXMgbWFya3MgYSBob3N0XG5cdCAqIHRoYXQgaXMgZ29uZSBhbmQgd2hvc2Ugc2Vzc2lvbnMgZXhpc3Qgb25seSBhcyByZXBsYXllZCBoaXN0b3J5LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVhZE9ubHkgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ3Byb3ZpZGVyUmVhZE9ubHknLCBmYWxzZSk7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25TdGF0dXM6IElPYnNlcnZhYmxlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+ID0gdGhpcy5fY29ubmVjdGlvblN0YXR1cztcblxuXHQvKipcblx0ICogYHRydWVgIHdoaWxlIHdlIGFyZSBzdGlsbCByZXNvbHZpbmcgYW5kIHB1c2hpbmcgdG9rZW5zIGZvciB0aGUgaG9zdCdzXG5cdCAqIGBwcm90ZWN0ZWRSZXNvdXJjZXNgLiBEZWZhdWx0cyB0byBgdHJ1ZWAgc28gdGhhdCBzZXNzaW9ucyBzdXJmYWNlIGFzXG5cdCAqIGxvYWRpbmcgdW50aWwgdGhlIGZpcnN0IGF1dGhlbnRpY2F0aW9uIHBhc3Mgc2V0dGxlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uUGVuZGluZyA9IG9ic2VydmFibGVWYWx1ZSgnYXV0aGVudGljYXRpb25QZW5kaW5nJywgdHJ1ZSk7XG5cdHByaXZhdGUgX2F1dGhlbnRpY2F0aW9uU2V0dGxlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzY29ubmVjdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IG9uQ29ubmVjdGlvbkxvc3QoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWREaXNjb25uZWN0LmV2ZW50OyB9XG5cblx0LyoqXG5cdCAqIE92ZXJyaWRhYmxlIHNlYW0gc28gdGVzdHMgY2FuIGV4ZXJjaXNlIGJvdGggdGhlIHdlYiBhbmQgbm9uLXdlYlxuXHQgKiBicmFuY2hlcyBvZiB0aGUgbGFiZWwvZGVzY3JpcHRpb24gZ2F0aW5nIHdpdGhvdXQgZGVwZW5kaW5nIG9uIHRoZVxuXHQgKiBhbWJpZW50IHtAbGluayBpc1dlYn0gY29uc3RhbnQgKHRoZSBicm93c2VyIHRlc3QgcnVubmVyIGFsd2F5c1xuXHQgKiByZXBvcnRzIGBpc1dlYiA9PT0gdHJ1ZWApLlxuXHQgKi9cblx0cHJvdGVjdGVkIGdldCBpc1dlYlBsYXRmb3JtKCk6IGJvb2xlYW4geyByZXR1cm4gaXNXZWI7IH1cblxuXHRwcml2YXRlIF9jb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZWZhdWx0RGlyZWN0b3J5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25MaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3RPbkRlbWFuZDogKCgpID0+IFByb21pc2U8dm9pZD4pIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNjb25uZWN0T25EZW1hbmQ6ICgoKSA9PiBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblNjaGVtZUFsaWFzOiBJU2Vzc2lvblNjaGVtZUFsaWFzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbWl0SG9zdEZyb21Xb3Jrc3BhY2VMYWJlbDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHlwZUljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDtcblx0LyoqIFN0b3JhZ2Uga2V5IHVzZWQgZm9yIHBlcnNpc3Rpbmcge0BsaW5rIF9zZXNzaW9uQ2FjaGV9IHNuYXBzaG90cy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZUtleTogc3RyaW5nO1xuXHQvKipcblx0ICogV2hlbiBgdHJ1ZWAsIHRoZSBwcm92aWRlciBoYXMgYmVlbiBtYXJrZWQgdW5yZWFjaGFibGUgYW5kIHNlc3Npb25zIGFyZVxuXHQgKiBoaWRkZW4gZnJvbSB7QGxpbmsgZ2V0U2Vzc2lvbnN9LCBldmVuIHRob3VnaCB7QGxpbmsgX3Nlc3Npb25DYWNoZX0gYW5kXG5cdCAqIHBlcnNpc3RlbnQgc3RvcmFnZSBhcmUgcmV0YWluZWQuIENsZWFyZWQgd2hlbiBhIG5ldyBjb25uZWN0aW9uIGlzIHdpcmVkXG5cdCAqIHVwIGluIHtAbGluayBzZXRDb25uZWN0aW9ufSwgYXQgd2hpY2ggcG9pbnQgdGhlIGNhY2hlZCBlbnRyaWVzIGFyZVxuXHQgKiByZS1hbm5vdW5jZWQgc28gdGhlIFVJIGNhbiByZXBvcHVsYXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfdW5wdWJsaXNoZWQgPSBmYWxzZTtcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbmZpZzogSVJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJDb25maWcsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUdpdEh1YlNlcnZpY2UgZ2l0SHViU2VydmljZTogSUdpdEh1YlNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgYWN0aXZlQ2xpZW50U2VydmljZTogSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY2hhdFNlc3Npb25zU2VydmljZSwgY2hhdFNlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UsIF9jb25maWd1cmF0aW9uU2VydmljZSwgbG9nU2VydmljZSwgZ2l0SHViU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgYWN0aXZlQ2xpZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eShjb25maWcuYWRkcmVzcyk7XG5cdFx0dGhpcy5fY29ubmVjdE9uRGVtYW5kID0gY29uZmlnLmNvbm5lY3RPbkRlbWFuZDtcblx0XHR0aGlzLl9kaXNjb25uZWN0T25EZW1hbmQgPSBjb25maWcuZGlzY29ubmVjdE9uRGVtYW5kO1xuXHRcdHRoaXMuX3Nlc3Npb25TY2hlbWVBbGlhcyA9IGNvbmZpZy5zZXNzaW9uU2NoZW1lQWxpYXM7XG5cdFx0dGhpcy5fb21pdEhvc3RGcm9tV29ya3NwYWNlTGFiZWwgPSBjb25maWcub21pdEhvc3RGcm9tV29ya3NwYWNlTGFiZWwgPT09IHRydWU7XG5cdFx0dGhpcy5fd29ya3NwYWNlVHlwZUljb24gPSBjb25maWcud29ya3NwYWNlVHlwZUljb247XG5cdFx0dGhpcy5vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcyA9IGNvbmZpZy5vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcztcblx0XHR0aGlzLmNhbkNvbm5lY3RPbkRlbWFuZCA9ICEhY29uZmlnLmNvbm5lY3RPbkRlbWFuZDtcblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGNvbmZpZy5uYW1lIHx8IGNvbmZpZy5hZGRyZXNzO1xuXG5cdFx0dGhpcy5pZCA9IGBhZ2VudGhvc3QtJHt0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5fWA7XG5cdFx0dGhpcy5sYWJlbCA9IGRpc3BsYXlOYW1lO1xuXHRcdHRoaXMucmVtb3RlQWRkcmVzcyA9IGNvbmZpZy5hZGRyZXNzO1xuXHRcdHRoaXMucmVtb3RlTG9jYXRpb25QcmVmZXJlbmNlS2V5ID0gY29uZmlnLnByZWZlcmVuY2VLZXkgPz8gY29uZmlnLmFkZHJlc3M7XG5cdFx0dGhpcy5fc3RvcmFnZUtleSA9IGAke0NBQ0hFRF9TRVNTSU9OU19TVE9SQUdFX1BSRUZJWH0ke3RoaXMuX2Nvbm5lY3Rpb25BdXRob3JpdHl9YDtcblxuXHRcdHRoaXMuYnJvd3NlQWN0aW9ucyA9IFt7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZvbGRlcnMnLCBcIkZvbGRlcnNcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogZGlzcGxheU5hbWUsXG5cdFx0XHRncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZW1vdGUsXG5cdFx0XHRwcm92aWRlcklkOiB0aGlzLmlkLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9icm93c2VGb3JGb2xkZXIoKSxcblx0XHRcdGxpc3RGb2xkZXJzOiAocXVlcnksIHRva2VuKSA9PiB0aGlzLl9saXN0UmVtb3RlRm9sZGVycyhxdWVyeSwgdG9rZW4pLFxuXHRcdH1dO1xuXG5cdFx0dGhpcy5fZW5hYmxlU2Vzc2lvbkNhY2hlUGVyc2lzdGVuY2UodGhpcy5fc3RvcmFnZUtleSwgYCR7Q0FDSEVEX1NFU1NJT05TX1NUT1JBR0VfUFJFRklYX0xFR0FDWX0ke3RoaXMuX2Nvbm5lY3Rpb25BdXRob3JpdHl9YCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2dpdC5icmFuY2hQcm90ZWN0aW9uJykpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaFNlc3Npb25Xb3Jrc3BhY2VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0gQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgaG9va3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJvdGVjdGVkIGdldCBjb25uZWN0aW9uKCk6IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY29ubmVjdGlvbjsgfVxuXG5cdHByb3RlY3RlZCBnZXQgYXV0aGVudGljYXRpb25QZW5kaW5nKCk6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHsgcmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0aW9uUGVuZGluZzsgfVxuXG5cdC8qKlxuXHQgKiBTdXNwZW5kIGNhY2hlLWNoYW5nZSB0cmFja2luZyB3aGlsZSBzZXNzaW9ucyBhcmUgdW5wdWJsaXNoZWQgKG9mZmxpbmUpIHNvXG5cdCAqIHRoZSBvbi1kaXNrIHNuYXBzaG90IHN1cnZpdmVzIGFuIHVucmVhY2hhYmxlIGhvc3QuIFNlZVxuXHQgKiB7QGxpbmsgdW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnN9LlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zaG91bGRUcmFja1Nlc3Npb25DYWNoZUNoYW5nZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl91bnB1Ymxpc2hlZDtcblx0fVxuXG5cdHByb3RlY3RlZCBfYWRhcHRlck9wdGlvbnMoKSB7XG5cdFx0Y29uc3QgaG9zdExhYmVsID0gdGhpcy5fd29ya3NwYWNlSG9zdExhYmVsO1xuXHRcdGNvbnN0IHR5cGVJY29uID0gdGhpcy5fd29ya3NwYWNlVHlwZUljb247XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlYWRPbmx5OiB0aGlzLl9yZWFkT25seSxcblx0XHRcdGJ1aWxkV29ya3NwYWNlOiAocHJvamVjdDogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydwcm9qZWN0J10sIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIGdpdEh1YkluZm86IElPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPiwgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeSA9IHdvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdFx0XHRjb25zdCB1cmlGb3JEZXNjcmlwdGlvbiA9IHByb2plY3Q/LnVyaSA/PyBwcmltYXJ5O1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHVyaUZvckRlc2NyaXB0aW9uID8gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUodXJpRm9yRGVzY3JpcHRpb24pLCB7IHJlbGF0aXZlOiBmYWxzZSB9KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgYnJhbmNoUHJvdGVjdGlvblBhdHRlcm5zID0gcmVhZEJyYW5jaFByb3RlY3Rpb25QYXR0ZXJucyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgcHJpbWFyeSA/PyBwcm9qZWN0Py51cmkpO1xuXHRcdFx0XHRyZXR1cm4gUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5idWlsZFdvcmtzcGFjZShwcm9qZWN0LCB3b3JraW5nRGlyZWN0b3JpZXMsIGhvc3RMYWJlbCwgZ2l0SHViSW5mbywgZ2l0U3RhdGUsIGRlc2NyaXB0aW9uLCBicmFuY2hQcm90ZWN0aW9uUGF0dGVybnMsIHR5cGVJY29uKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCByZXNvdXJjZVNjaGVtZUZvclByb3ZpZGVyKHByb3ZpZGVyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkKHRoaXMuX2Nvbm5lY3Rpb25BdXRob3JpdHksIHByb3ZpZGVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl91bnB1Ymxpc2hlZCA/IFtdIDogc3VwZXIuZ2V0U2Vzc2lvbnMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBtYXBXb3JraW5nRGlyZWN0b3J5VXJpKHVyaTogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gdG9BZ2VudEhvc3RVcmkodXJpLCB0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBtYXBQcm9qZWN0VXJpKHVyaTogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gdG9Mb2NhbFByb2plY3RVcmkodXJpLCB0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZGlmZlVyaU1hcHBlcigpOiAodXJpOiBVUkkpID0+IFVSSSB7XG5cdFx0cmV0dXJuIHVyaSA9PiB0b0FnZW50SG9zdFVyaSh1cmksIHRoaXMuX2Nvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF92YWxpZGF0ZUJlZm9yZUNyZWF0ZShfc2Vzc2lvblR5cGU6IElTZXNzaW9uVHlwZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29ubmVjdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub3RDb25uZWN0ZWRTZXNzaW9uJywgXCJDYW5ub3QgY3JlYXRlIHNlc3Npb246IG5vdCBjb25uZWN0ZWQgdG8gcmVtb3RlIGFnZW50IGhvc3QgJ3swfScuXCIsIHRoaXMubGFiZWwpKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX25vQWdlbnRzRXJyb3JNZXNzYWdlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdub0FnZW50cycsIFwiUmVtb3RlIGFnZW50IGhvc3QgJ3swfScgaGFzIG5vdCBhZHZlcnRpc2VkIGFueSBhZ2VudHMgeWV0LlwiLCB0aGlzLmxhYmVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfbm90Q29ubmVjdGVkU2VuZEVycm9yTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbm90Q29ubmVjdGVkU2VuZCcsIFwiQ2Fubm90IHNlbmQgcmVxdWVzdDogbm90IGNvbm5lY3RlZCB0byByZW1vdGUgYWdlbnQgaG9zdCAnezB9Jy5cIiwgdGhpcy5sYWJlbCk7XG5cdH1cblxuXHQvLyAtLSBDb25uZWN0aW9uIGxpZmVjeWNsZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogRXN0YWJsaXNoIChvciByZS1lc3RhYmxpc2gpIHRoZSBjb25uZWN0aW9uIGZvciB0aGlzIGhvc3Qgb24gZGVtYW5kLlxuXHQgKiBUdW5uZWwtYmFja2VkIHByb3ZpZGVycyB1c2UgdGhlaXIgcmVsYXkgaG9vazsgb3RoZXIgcHJvdmlkZXJzIGZhbGxcblx0ICogYmFjayB0byB0aGUgZ2VuZXJpYyByZW1vdGUgYWdlbnQgaG9zdCByZWNvbm5lY3QgcGF0aC5cblx0ICovXG5cdGFzeW5jIGNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2Nvbm5lY3RPbkRlbWFuZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY29ubmVjdE9uRGVtYW5kKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UucmVjb25uZWN0KHRoaXMucmVtb3RlQWRkcmVzcyk7XG5cdH1cblxuXHQvKipcblx0ICogVGVhciBkb3duIHRoZSBhY3RpdmUgY29ubmVjdGlvbiBmb3IgdGhpcyBob3N0LiBUdW5uZWwtYmFja2VkIHByb3ZpZGVyc1xuXHQgKiB1c2UgdGhlaXIgcmVsYXkgaG9vazsgb3RoZXIgcHJvdmlkZXJzIGZhbGwgYmFjayB0byB0aGUgZ2VuZXJpYyByZW1vdGVcblx0ICogYWdlbnQgaG9zdCBkaXNjb25uZWN0IHBhdGguIENhY2hlZCBzZXNzaW9ucyBhcmUgaGlkZGVuIGZyb20gdGhlIFVJIHNvXG5cdCAqIHRoZSBzZXNzaW9ucyBsaXN0IHJlZmxlY3RzIHRoZSBkaXNjb25uZWN0ZWQgc3RhdGU7IHRoZSBwZXJzaXN0ZWQgY2FjaGVcblx0ICogaXMgcmV0YWluZWQgc28gc2Vzc2lvbnMgY2FuIGJlIHJlc3RvcmVkIG9uIHJlY29ubmVjdC5cblx0ICovXG5cdGFzeW5jIGRpc2Nvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy51bnB1Ymxpc2hDYWNoZWRTZXNzaW9ucygpO1xuXHRcdGlmICh0aGlzLl9kaXNjb25uZWN0T25EZW1hbmQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Rpc2Nvbm5lY3RPbkRlbWFuZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnJlbW92ZVJlbW90ZUFnZW50SG9zdCh0aGlzLnJlbW90ZUFkZHJlc3MpO1xuXHR9XG5cblx0LyoqIFVwZGF0ZSB0aGUgY29ubmVjdGlvbiBzdGF0dXMgZm9yIHRoaXMgcHJvdmlkZXIuICovXG5cdHNldENvbm5lY3Rpb25TdGF0dXMoc3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzKTogdm9pZCB7XG5cdFx0dGhpcy5fY29ubmVjdGlvblN0YXR1cy5zZXQoc3RhdHVzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcmNlcyBldmVyeSBzZXNzaW9uIG9uIHRoaXMgaG9zdCB0byBiZSByZWFkLW9ubHkuXG5cdCAqXG5cdCAqIFNldCB3aGVuIHRoZSBob3N0IGlzIHBlcm1hbmVudGx5IHVucmVhY2hhYmxlIGFuZCBpdHMgc2Vzc2lvbnMgYXJlIGJlaW5nIHNlcnZlZCBmcm9tXG5cdCAqIHBlcnNpc3RlZCBoaXN0b3J5OiB0aGUgY29udmVyc2F0aW9uIGlzIGdlbnVpbmUsIGJ1dCB0aGVyZSBpcyBubyBob3N0IGxlZnQgdG8gc2VuZCB0bywgc28gdGhlXG5cdCAqIGNvbXBvc2VyIG11c3QgYmUgaGlkZGVuIHJhdGhlciB0aGFuIGFjY2VwdCBpbnB1dCB0aGF0IGNhbiBuZXZlciBiZSBkZWxpdmVyZWQuXG5cdCAqL1xuXHRzZXRSZWFkT25seShyZWFkT25seTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3JlYWRPbmx5LnNldChyZWFkT25seSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkIGRpc2NvdmVyZWQgc2Vzc2lvbiBzdW1tYXJpZXMgaW50byB0aGUgY2FjaGUgc28gdGhleSBzdXJmYWNlIGluIHRoZSBzZXNzaW9ucyBsaXN0XG5cdCAqICoqYmVmb3JlKiogYSBjb25uZWN0aW9uIGlzIGVzdGFibGlzaGVkIChsYXp5IGRpc2NvdmVyeSkuXG5cdCAqXG5cdCAqIEFuIGVudHJ5IHRoYXQgYWxyZWFkeSBleGlzdHMga2VlcHMgZXZlcnl0aGluZyB0aGUgaG9zdCBoYXMgdG9sZCB1cywgZXhjZXB0IGZvciBhIG1pc3Npbmdcblx0ICogcHJvamVjdDogdGhlIHJlcG9zaXRvcnkgbmFtZSBpcyByZXNvbHZlZCBvdmVyIHRoZSBuZXR3b3JrIGFuZCB0aGF0IGxvb2t1cCBjYW4gZmFpbCwgc29cblx0ICogZmlsbGluZyBpdCBpbiBvbiBhIGxhdGVyIHBhc3MgaXMgd2hhdCBtYWtlcyByZXRyeWluZyB3b3J0aCBhbnl0aGluZy4gT3BlbmluZyBhIHNlZWRlZCBzZXNzaW9uXG5cdCAqIHRyaWdnZXJzIGBjb25uZWN0T25EZW1hbmRgLCBhZnRlciB3aGljaCBgX3JlZnJlc2hTZXNzaW9uc2AgcmVjb25jaWxlcyBhZ2FpbnN0IHRoZSBob3N0LlxuXHQgKi9cblx0c2VlZFNlc3Npb25zKG1ldGFzOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZGVkOiBJU2Vzc2lvbltdID0gW107XG5cdFx0Y29uc3QgY2hhbmdlZDogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmF3TWV0YSBvZiBtZXRhcykge1xuXHRcdFx0Y29uc3QgbWV0YSA9IHRoaXMuX2Fkb3B0U2Vzc2lvbk1ldGEocmF3TWV0YSk7XG5cdFx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChtZXRhLnNlc3Npb24pO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHQvLyBBbm5vdW5jaW5nIHRoZSBjaGFuZ2UgYWxzbyBtYXJrcyB0aGUgc2Vzc2lvbiBjYWNoZSBkaXJ0eSwgc28gdGhlIGZpbGxlZC1pblxuXHRcdFx0XHQvLyBwcm9qZWN0IHJlYWNoZXMgdGhlIG5leHQgcGVyc2lzdGVkIHNuYXBzaG90LlxuXHRcdFx0XHRpZiAobWV0YS5wcm9qZWN0ICYmICFleGlzdGluZy5wcm9qZWN0ICYmIGV4aXN0aW5nLmJhY2tmaWxsUHJvamVjdChtZXRhLnByb2plY3QpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZC5wdXNoKGV4aXN0aW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSB0aGlzLmNyZWF0ZUFkYXB0ZXIobWV0YSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuc2V0KHJhd0lkLCBhZGFwdGVyKTtcblx0XHRcdGFkZGVkLnB1c2goYWRhcHRlcik7XG5cdFx0fVxuXHRcdGlmIChhZGRlZC5sZW5ndGggPiAwIHx8IGNoYW5nZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQsIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNYXAgYSBob3N0LXJlcG9ydGVkIHNlc3Npb24gVVJJIG9udG8gdGhlIFVJIHNjaGVtZSwgc28gdGhlIHNlc3Npb24gcm91dGVzIHRvIHRoZSBhZ2VudCdzXG5cdCAqIGNvbnRlbnQgcHJvdmlkZXIuIFRoZSByYXcgaWQgaXMgcHJlc2VydmVkLCBzbyBjYWNoZSBrZXlzIGFyZSB1bmFmZmVjdGVkLlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hZG9wdFNlc3Npb25NZXRhKG1ldGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IElBZ2VudFNlc3Npb25NZXRhZGF0YSB7XG5cdFx0Y29uc3QgYWxpYXMgPSB0aGlzLl9zZXNzaW9uU2NoZW1lQWxpYXM7XG5cdFx0aWYgKCFhbGlhcyB8fCBtZXRhLnNlc3Npb24uc2NoZW1lICE9PSBhbGlhcy5iYWNrZW5kKSB7XG5cdFx0XHRyZXR1cm4gbWV0YTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgLi4ubWV0YSwgc2Vzc2lvbjogbWV0YS5zZXNzaW9uLndpdGgoeyBzY2hlbWU6IGFsaWFzLnVpIH0pIH07XG5cdH1cblxuXHQvKipcblx0ICogSW52ZXJzZSBvZiB7QGxpbmsgX2Fkb3B0U2Vzc2lvbk1ldGF9OiBtYXAgdGhlIFVJIHNjaGVtZSBiYWNrIHRvIHRoZSBvbmUgdGhlIGhvc3QncyBzZXNzaW9uXG5cdCAqIHJlZ2lzdHJ5IGlzIGtleWVkIGJ5LCBzbyBiYWNrZW5kIGNhbGxzIGFkZHJlc3MgdGhlIFVSSSB0aGUgaG9zdCBrbm93cy5cblx0ICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYmFja2VuZFNlc3Npb25TY2hlbWUoYWdlbnRQcm92aWRlcjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBhbGlhcyA9IHRoaXMuX3Nlc3Npb25TY2hlbWVBbGlhcztcblx0XHRyZXR1cm4gYWxpYXMgJiYgYWdlbnRQcm92aWRlciA9PT0gYWxpYXMudWkgPyBhbGlhcy5iYWNrZW5kIDogYWdlbnRQcm92aWRlcjtcblx0fVxuXG5cdHNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhwZW5kaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gU3RpY2t5OiBvbmNlIHRoZSBmaXJzdCBhdXRoZW50aWNhdGlvbiBwYXNzIHNldHRsZXMsIG5ldmVyIHN1cmZhY2Vcblx0XHQvLyBwZW5kaW5nIGFnYWluLiBTdWJzZXF1ZW50IHJlLWF1dGhzIGhhcHBlbiBzaWxlbnRseSBpbiB0aGUgYmFja2dyb3VuZC5cblx0XHRpZiAodGhpcy5fYXV0aGVudGljYXRpb25TZXR0bGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25TZXR0bGVkID0gdHJ1ZTtcblx0XHR9XG5cdFx0dGhpcy5fYXV0aGVudGljYXRpb25QZW5kaW5nLnNldChwZW5kaW5nLCB1bmRlZmluZWQpO1xuXHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0dGhpcy5fcmVzdW1lTmV3U2Vzc2lvbkFmdGVyQXV0aGVudGljYXRpb25TZXR0bGVzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdpcmUgYSBsaXZlIGNvbm5lY3Rpb24gdG8gdGhpcyBwcm92aWRlciwgZW5hYmxpbmcgc2Vzc2lvbiBvcGVyYXRpb25zIGFuZCBmb2xkZXIgYnJvd3NpbmcuXG5cdCAqL1xuXHRzZXRDb25uZWN0aW9uKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIGRlZmF1bHREaXJlY3Rvcnk/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29ubmVjdGlvbiA9PT0gY29ubmVjdGlvbiAmJiB0aGlzLl9kZWZhdWx0RGlyZWN0b3J5ID09PSBkZWZhdWx0RGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2FzVW5wdWJsaXNoZWQgPSB0aGlzLl91bnB1Ymxpc2hlZDtcblx0XHR0aGlzLl9jb25uZWN0aW9uTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHR0aGlzLl9jb25uZWN0aW9uID0gY29ubmVjdGlvbjtcblx0XHR0aGlzLl9kZWZhdWx0RGlyZWN0b3J5ID0gZGVmYXVsdERpcmVjdG9yeTtcblx0XHR0aGlzLl91bnB1Ymxpc2hlZCA9IGZhbHNlO1xuXG5cdFx0dGhpcy5fc3luY1Jvb3RTdGF0ZShjb25uZWN0aW9uLnJvb3RTdGF0ZS52YWx1ZSk7XG5cdFx0dGhpcy5fY29ubmVjdGlvbkxpc3RlbmVycy5hZGQoY29ubmVjdGlvbi5yb290U3RhdGUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3luY1Jvb3RTdGF0ZShjb25uZWN0aW9uLnJvb3RTdGF0ZS52YWx1ZSk7XG5cdFx0fSkpO1xuXHRcdGlmIChjb25uZWN0aW9uLnJvb3RTdGF0ZS5vbkRpZEVycm9yKSB7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uTGlzdGVuZXJzLmFkZChjb25uZWN0aW9uLnJvb3RTdGF0ZS5vbkRpZEVycm9yKGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5fc3luY1Jvb3RTdGF0ZShlcnJvcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYXR0YWNoQ29ubmVjdGlvbkxpc3RlbmVycyhjb25uZWN0aW9uLCB0aGlzLl9jb25uZWN0aW9uTGlzdGVuZXJzKTtcblxuXHRcdC8vIEFsd2F5cyByZWZyZXNoIHNlc3Npb25zIHdoZW4gYSBjb25uZWN0aW9uIGlzIChyZSllc3RhYmxpc2hlZC5cblx0XHQvLyBgX3JlZnJlc2hTZXNzaW9uc2Agb3ducyBgX2NhY2hlSW5pdGlhbGl6ZWRgIChzZXQgb24gYSBzdWNjZXNzZnVsXG5cdFx0Ly8gbGlzdCkgYW5kIGFybXMgYSBiYWNrb2ZmIHJldHJ5IGlmIHRoZSBmaXJzdCBhdHRlbXB0IGZhaWxzLlxuXHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9ucyh3YXNVbnB1Ymxpc2hlZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgdGhlIGNvbm5lY3Rpb24sIGUuZy4gd2hlbiB0aGUgcmVtb3RlIGhvc3QgZGlzY29ubmVjdHMuXG5cdCAqIFJldGFpbnMgdGhlIHByb3ZpZGVyIHJlZ2lzdHJhdGlvbiBzbyBpdCByZW1haW5zIHZpc2libGUgaW4gdGhlIFVJLFxuXHQgKiBhbmQgKipwcmVzZXJ2ZXMqKiB0aGUgY2FjaGVkIHNlc3Npb24gbGlzdCBzbyBwcmV2aW91c2x5IGxvYWRlZFxuXHQgKiBzZXNzaW9ucyBzdGF5IHZpc2libGUgd2hpbGUgd2UncmUgb2ZmbGluZS4gQ2FsbGVycyB0aGF0IGtub3cgdGhlXG5cdCAqIGhvc3QgaXMgdW5yZWFjaGFibGUgc2hvdWxkIGZvbGxvdyB1cCB3aXRoIHtAbGluayB1bnB1Ymxpc2hDYWNoZWRTZXNzaW9uc30uXG5cdCAqL1xuXHRjbGVhckNvbm5lY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fY29ubmVjdGlvbkxpc3RlbmVycy5jbGVhcigpO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0dGhpcy5fb25EaWREaXNjb25uZWN0LmZpcmUoKTtcblx0XHR0aGlzLl9jb25uZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2RlZmF1bHREaXJlY3RvcnkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGlzcG9zZUFsbE5ld1Nlc3Npb25zKCk7XG5cdFx0dGhpcy5fc3luY1Jvb3RTdGF0ZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gRHJvcCBvbmx5IHRoZSB0cmFuc2llbnQgcGVuZGluZy9kcmFmdCBzZXNzaW9uOyBrZWVwIHRoZSBwZXJzaXN0ZWRcblx0XHQvLyBjYWNoZSBzbyB0aGUgd29ya3NwYWNlIHBpY2tlciBrZWVwcyBzaG93aW5nIG9mZmxpbmUgc2Vzc2lvbnMuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdTZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1Nlc3Npb247XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3BlbmRpbmddLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHR9XG5cblx0XHQvLyBSZXNldCB0aGUgaW4tbWVtb3J5IGNhY2hlLWluaXRpYWxpemVkIGZsYWcgc28gYSBmcmVzaCBjb25uZWN0aW9uXG5cdFx0Ly8gdHJpZ2dlcnMgYSBmdWxsIGxpc3QgcmVmcmVzaCAod2hpY2ggd2lsbCByZWNvbmNpbGUgYWdhaW5zdCB0aGVcblx0XHQvLyBwZXJzaXN0ZWQgZW50cmllcyB3ZSBrZWVwIG9uIGRpc2spLlxuXHRcdHRoaXMuX2NhY2hlSW5pdGlhbGl6ZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9jYW5jZWxTZXNzaW9uUmVmcmVzaFJldHJ5KCk7XG5cdH1cblxuXHQvKipcblx0ICogSGlkZSBjYWNoZWQgc2Vzc2lvbnMgZnJvbSB0aGUgVUkgd2l0aG91dCBkaXNjYXJkaW5nIHRoZW0uIENhbGxlZCBieSB0aGVcblx0ICogaG9zdC10cmFja2luZyBjb250cmlidXRpb25zIHdoZW4gdGhleSBkZXRlcm1pbmUgdGhlIHJlbW90ZSBob3N0IGlzXG5cdCAqIHVucmVhY2hhYmxlICh0dW5uZWwgb2ZmbGluZSBvciBTU0ggcmVjb25uZWN0IGZhaWxlZCkuIFRoZSBpbi1tZW1vcnlcblx0ICogY2FjaGUgYW5kIHBlcnNpc3RlZCBzdG9yYWdlIGFyZSBsZWZ0IGludGFjdCBzbyB0aGUgc2Vzc2lvbnMgY2FuIGJlXG5cdCAqIHJlc3RvcmVkIGlmIHRoZSBob3N0IGNvbWVzIGJhY2sgb25saW5lIGluIHRoaXMgc2Vzc2lvbiwgb3Igb24gdGhlIG5leHRcblx0ICogbGF1bmNoLiBUaGUgbmV4dCB7QGxpbmsgc2V0Q29ubmVjdGlvbn0gY2FsbCByZS1hbm5vdW5jZXMgdGhlIGNhY2hlZFxuXHQgKiBlbnRyaWVzLlxuXHQgKi9cblx0dW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3VucHVibGlzaGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3VucHVibGlzaGVkID0gdHJ1ZTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbkNhY2hlLnNpemUgPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uLXR5cGUgc3luYyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcm90ZWN0ZWQgX2Zvcm1hdFNlc3Npb25UeXBlTGFiZWwoYWdlbnRMYWJlbDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBJbiB3ZWIgKHZzY29kZS5kZXYvYWdlbnRzKSB0aGUgd29ya2JlbmNoIGlzIGFscmVhZHkgc2NvcGVkIHRvIGFcblx0XHQvLyBzaW5nbGUgaG9zdCB2aWEgdGhlIGhvc3QgcGlja2VyLCBzbyB0aGVyZSdzIG5vIG5lZWQgdG8gZGlzYW1iaWd1YXRlXG5cdFx0Ly8gdGhlIHNlc3Npb24tdHlwZSBsYWJlbCB3aXRoIHRoZSBob3N0IG5hbWUuXG5cdFx0aWYgKHRoaXMuaXNXZWJQbGF0Zm9ybSkge1xuXHRcdFx0cmV0dXJuIGFnZW50TGFiZWw7XG5cdFx0fVxuXHRcdHJldHVybiBgJHthZ2VudExhYmVsfSBbJHt0aGlzLmxhYmVsfV1gO1xuXHR9XG5cblx0Ly8gLS0gV29ya3NwYWNlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFRoZSBob3N0IG5hbWUgYXBwZW5kZWQgdG8gdGhpcyBob3N0J3Mgd29ya3NwYWNlIGxhYmVscywgb3IgYHVuZGVmaW5lZGAgd2hlbiBpdCB3b3VsZCBhZGRcblx0ICogbm90aGluZyBcdTIwMTQgaW4gd2ViIHRoZSB3b3JrYmVuY2ggaXMgYWxyZWFkeSBzY29wZWQgdG8gYSBzaW5nbGUgaG9zdCBieSB0aGUgaG9zdCBwaWNrZXIuXG5cdCAqL1xuXHRwcml2YXRlIGdldCBfd29ya3NwYWNlSG9zdExhYmVsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaXNXZWJQbGF0Zm9ybSB8fCB0aGlzLl9vbWl0SG9zdEZyb21Xb3Jrc3BhY2VMYWJlbCA/IHVuZGVmaW5lZCA6IHRoaXMubGFiZWw7XG5cdH1cblxuXHRzdGF0aWMgYnVpbGRXb3Jrc3BhY2UocHJvamVjdDogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydwcm9qZWN0J10sIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIHByb3ZpZGVyTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogSU9ic2VydmFibGU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+LCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZCwgZGVzY3JpcHRpb24/OiBzdHJpbmcsIGJyYW5jaFByb3RlY3Rpb25QYXR0ZXJucz86IHJlYWRvbmx5IHN0cmluZ1tdLCB0eXBlSWNvbj86IFRoZW1lSWNvbik6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gYnVpbGRBZ2VudEhvc3RTZXNzaW9uV29ya3NwYWNlKHByb2plY3QsIHdvcmtpbmdEaXJlY3RvcmllcywgeyBwcm92aWRlckxhYmVsLCBmYWxsYmFja0ljb246IENvZGljb24ucmVtb3RlLCByZXF1aXJlc1dvcmtzcGFjZVRydXN0OiB0cnVlLCBkZXNjcmlwdGlvbiwgYnJhbmNoUHJvdGVjdGlvblBhdHRlcm5zLCBncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFLCB0eXBlSWNvbiB9LCBnaXRIdWJJbmZvLCBnaXRTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZFdvcmtzcGFjZUZyb21VcmkodXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB7XG5cdFx0Y29uc3QgZm9sZGVyTmFtZSA9IGJhc2VuYW1lKHVyaSkgfHwgdXJpLnBhdGg7XG5cdFx0Y29uc3QgaG9zdExhYmVsID0gdGhpcy5fd29ya3NwYWNlSG9zdExhYmVsO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmksXG5cdFx0XHRsYWJlbDogaG9zdExhYmVsID8gYCR7Zm9sZGVyTmFtZX0gWyR7aG9zdExhYmVsfV1gIDogZm9sZGVyTmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZSh1cmkpLCB7IHJlbGF0aXZlOiBmYWxzZSB9KSxcblx0XHRcdGdyb3VwOiBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUsXG5cdFx0XHRpY29uOiBDb2RpY29uLnJlbW90ZSxcblx0XHRcdGZvbGRlcnM6IFt7XG5cdFx0XHRcdHJvb3Q6IHVyaSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdXJpLFxuXHRcdFx0XHRuYW1lOiBmb2xkZXJOYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaSwgd29ya1RyZWVVcmk6IHVuZGVmaW5lZCwgYmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgfSxcblx0XHRcdH1dLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogdHJ1ZSxcblx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdHJlc29sdmVXb3Jrc3BhY2UocmVwb3NpdG9yeVVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyZXBvc2l0b3J5VXJpLnNjaGVtZSAhPT0gQUdFTlRfSE9TVF9TQ0hFTUUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIE9ubHkgY2xhaW0gVVJJcyB0aGF0IGJlbG9uZyB0byAqdGhpcyogY29ubmVjdGlvbi4gV2l0aG91dCB0aGlzXG5cdFx0Ly8gY2hlY2ssIGV2ZXJ5IGFnZW50LWhvc3QgcHJvdmlkZXIgbWF0Y2hlcyBldmVyeSBhZ2VudC1ob3N0IFVSSVxuXHRcdC8vIGFuZCB0aGUgd29ya3NwYWNlIHBpY2tlcidzIGZpcnN0LW1hdGNoLXdpbnMgbG9va3VwIGF0dHJpYnV0ZXNcblx0XHQvLyB0aGUgZm9sZGVyIHRvIHdoaWNoZXZlciBwcm92aWRlciBpcyBpdGVyYXRlZCBmaXJzdCBcdTIwMTQgc28gYSBmb2xkZXJcblx0XHQvLyBwaWNrZWQgZnJvbSBXU0wgZW5kcyB1cCBsYWJlbGxlZCB3aXRoIGFub3RoZXIgaG9zdCdzIG5hbWUuXG5cdFx0aWYgKHJlcG9zaXRvcnlVcmkuYXV0aG9yaXR5ICE9PSB0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYnVpbGRXb3Jrc3BhY2VGcm9tVXJpKHJlcG9zaXRvcnlVcmkpO1xuXHR9XG5cblx0Ly8gLS0gQnJvd3NlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfYnJvd3NlRm9yRm9sZGVyKCk6IFByb21pc2U8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBFc3RhYmxpc2ggY29ubmVjdGlvbiBvbiBkZW1hbmQgaWYgYSBob29rIGlzIHByb3ZpZGVkIChlLmcuIHR1bm5lbCByZWxheSlcblx0XHRpZiAoIXRoaXMuX2Nvbm5lY3Rpb24gJiYgdGhpcy5fY29ubmVjdE9uRGVtYW5kKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb25uZWN0T25EZW1hbmQoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdjb25uZWN0RmFpbGVkJywgXCJGYWlsZWQgdG8gY29ubmVjdCB0byByZW1vdGUgYWdlbnQgaG9zdCAnezB9JzogezF9XCIsIHRoaXMubGFiZWwsIGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSkpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY29ubmVjdGlvbikge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnbm90Q29ubmVjdGVkJywgXCJVbmFibGUgdG8gY29ubmVjdCB0byByZW1vdGUgYWdlbnQgaG9zdCAnezB9Jy5cIiwgdGhpcy5sYWJlbCkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZhdWx0VXJpID0gYWdlbnRIb3N0VXJpKHRoaXMuX2Nvbm5lY3Rpb25BdXRob3JpdHksIHRoaXMuX2RlZmF1bHREaXJlY3RvcnkgPz8gJy8nKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHRoaXMuX2ZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZWxlY3RSZW1vdGVGb2xkZXInLCBcIlNlbGVjdCBGb2xkZXIgb24gezB9XCIsIHRoaXMubGFiZWwpLFxuXHRcdFx0XHRhdmFpbGFibGVGaWxlU3lzdGVtczogW0FHRU5UX0hPU1RfU0NIRU1FXSxcblx0XHRcdFx0ZGVmYXVsdFVyaSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHNlbGVjdGVkPy5bMF0pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2J1aWxkV29ya3NwYWNlRnJvbVVyaShzZWxlY3RlZFswXSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBkaWFsb2cgd2FzIGNhbmNlbGxlZCBvciBmYWlsZWRcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnVtZXJhdGUgc3ViZGlyZWN0b3JpZXMgYmVsb3cge0BsaW5rIF9kZWZhdWx0RGlyZWN0b3J5fSwgZmlsdGVyZWRcblx0ICogYnkgYSBjYXNlLWluc2Vuc2l0aXZlIHN1YnN0cmluZyBxdWVyeS4gQmFja3MgdGhlIGlubGluZSBmb2xkZXJcblx0ICogbGlzdCByZW5kZXJlZCBieSB0aGUgbW9iaWxlIHdvcmtzcGFjZSBwaWNrZXIgc2hlZXQgc28gdXNlcnMgY2FuXG5cdCAqIHBpY2sgYSBmb2xkZXIgd2l0aG91dCBvcGVuaW5nIGEgc2VwYXJhdGUgZmlsZS1kaWFsb2cuXG5cdCAqXG5cdCAqIFRoZSBxdWVyeSBzdXBwb3J0cyBsaWdodCBwYXRoIG5hdmlnYXRpb246IGEgYC9gIGluIHRoZSBxdWVyeSBpc1xuXHQgKiB0cmVhdGVkIGFzIGEgcGF0aCBkZWxpbWl0ZXIsIGxpc3RpbmcgY2hpbGRyZW4gb2YgYDxkZWZhdWx0Pi88cHJlZml4PmBcblx0ICogYW5kIG1hdGNoaW5nIHRoZSBwYXJ0IGFmdGVyIHRoZSBsYXN0IHNsYXNoLiBTbyB0eXBpbmcgYHByb2plY3RzL2Bcblx0ICogZHJpbGxzIGludG8gdGhlIGBwcm9qZWN0c2AgZGlyZWN0b3J5LCBhbmQgYHByb2plY3RzL2Zvb2AgbGlzdHNcblx0ICogY2hpbGRyZW4gb2YgYHByb2plY3RzYCB3aG9zZSBuYW1lIGNvbnRhaW5zIGBmb29gLlxuXHQgKlxuXHQgKiBIaWRkZW4gZGlyZWN0b3JpZXMgKHRob3NlIHN0YXJ0aW5nIHdpdGggYC5gKSBhcmUgb21pdHRlZCwgcmVzdWx0c1xuXHQgKiBhcmUgc29ydGVkIGJ5IG5hbWUsIGFuZCB0aGUgY2FuY2VsbGF0aW9uIHRva2VuIGlzIGhvbm9yZWQgYmVmb3JlXG5cdCAqIGFuZCBhZnRlciB0aGUgbmV0d29yayByb3VuZC10cmlwIHNvIHN0YWxlIHF1ZXJpZXMgZG9uJ3Qgc3VyZmFjZVxuXHQgKiBhZnRlciB0aGUgdXNlciBoYXMgdHlwZWQgbW9yZSBjaGFyYWN0ZXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbGlzdFJlbW90ZUZvbGRlcnMocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvbldvcmtzcGFjZVtdPiB7XG5cdFx0Ly8gRXN0YWJsaXNoIGEgY29ubmVjdGlvbiBvbiBkZW1hbmQgaWYgYSBob29rIGlzIGF2YWlsYWJsZTsgaWYgaXRcblx0XHQvLyBmYWlscyBvciBpcyB1bmF2YWlsYWJsZSwgcmV0dXJuIGVtcHR5IHNvIHRoZSBzaGVldCByZW5kZXJzIGFuXG5cdFx0Ly8gZW1wdHkgcmVzdWx0IHJhdGhlciB0aGFuIHRocm93aW5nLlxuXHRcdGlmICghdGhpcy5fY29ubmVjdGlvbiAmJiB0aGlzLl9jb25uZWN0T25EZW1hbmQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3RPbkRlbWFuZCgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9jb25uZWN0aW9uIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgcm9vdEFnZW50SG9zdFVyaSA9IGFnZW50SG9zdFVyaSh0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5LCB0aGlzLl9kZWZhdWx0RGlyZWN0b3J5ID8/ICcvJyk7XG5cblx0XHQvLyBQYXJzZSBwYXRoIG5hdmlnYXRpb24gb3V0IG9mIHRoZSBxdWVyeS4gQW55dGhpbmcgYmVmb3JlIHRoZVxuXHRcdC8vIGxhc3QgYC9gIGlzIGEgcmVsYXRpdmUgZGlyZWN0b3J5IHdlIGRlc2NlbmQgaW50bzsgdGhlIHBhcnRcblx0XHQvLyBhZnRlciBpcyB0aGUgZmlsdGVyIHdlIGFwcGx5IHRvIHRoYXQgZGlyZWN0b3J5J3MgY2hpbGRyZW4uXG5cdFx0Y29uc3QgdHJpbW1lZCA9IHF1ZXJ5LnRyaW0oKTtcblx0XHRjb25zdCBsYXN0U2xhc2ggPSB0cmltbWVkLmxhc3RJbmRleE9mKCcvJyk7XG5cdFx0bGV0IGxpc3RpbmdBZ2VudEhvc3RVcmkgPSByb290QWdlbnRIb3N0VXJpO1xuXHRcdGxldCBmaWx0ZXIgPSB0cmltbWVkO1xuXHRcdGlmIChsYXN0U2xhc2ggPj0gMCkge1xuXHRcdFx0Y29uc3Qgc3ViUGF0aCA9IHRyaW1tZWQuc2xpY2UoMCwgbGFzdFNsYXNoKS5yZXBsYWNlKC9eXFwvK3xcXC8rJC9nLCAnJyk7XG5cdFx0XHRmaWx0ZXIgPSB0cmltbWVkLnNsaWNlKGxhc3RTbGFzaCArIDEpO1xuXHRcdFx0aWYgKHN1YlBhdGgpIHtcblx0XHRcdFx0bGlzdGluZ0FnZW50SG9zdFVyaSA9IFVSSS5qb2luUGF0aChyb290QWdlbnRIb3N0VXJpLCBzdWJQYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgbGlzdGluZ09yaWdpbmFsVXJpID0gZnJvbUFnZW50SG9zdFVyaShsaXN0aW5nQWdlbnRIb3N0VXJpKTtcblxuXHRcdGxldCBlbnRyaWVzO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9jb25uZWN0aW9uLnJlc291cmNlTGlzdChsaXN0aW5nT3JpZ2luYWxVcmkpO1xuXHRcdFx0ZW50cmllcyA9IHJlc3VsdC5lbnRyaWVzO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBsb3dlckZpbHRlciA9IGZpbHRlci50b0xvY2FsZUxvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IGZvbGRlcnM6IElTZXNzaW9uV29ya3NwYWNlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGlmIChlbnRyeS50eXBlICE9PSAnZGlyZWN0b3J5Jykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChlbnRyeS5uYW1lLnN0YXJ0c1dpdGgoJy4nKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsb3dlckZpbHRlciAmJiAhZW50cnkubmFtZS50b0xvY2FsZUxvd2VyQ2FzZSgpLmluY2x1ZGVzKGxvd2VyRmlsdGVyKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoaWxkVXJpID0gVVJJLmpvaW5QYXRoKGxpc3RpbmdBZ2VudEhvc3RVcmksIGVudHJ5Lm5hbWUpO1xuXHRcdFx0Ly8gVXNlIGEgZm9sZGVyIGljb24gZm9yIGlubGluZSBsaXN0IHJvd3MgXHUyMDE0IGBDb2RpY29uLnJlbW90ZWBcblx0XHRcdC8vIGlzIHRoZSByaWdodCBjaG9pY2UgZm9yIHRoZSBob3N0LWxldmVsIGJyb3dzZSBhY3Rpb24sXG5cdFx0XHQvLyBidXQgcGVyLWZvbGRlciByb3dzIHJlYWQgYmV0dGVyIGFzIGZvbGRlciBnbHlwaHMuXG5cdFx0XHRmb2xkZXJzLnB1c2goeyAuLi50aGlzLl9idWlsZFdvcmtzcGFjZUZyb21VcmkoY2hpbGRVcmkpLCBpY29uOiBDb2RpY29uLmZvbGRlciB9KTtcblx0XHR9XG5cdFx0Zm9sZGVycy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXHRcdHJldHVybiBmb2xkZXJzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUE4Qix1QkFBdUI7QUFDOUQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsVUFBVSxlQUFlO0FBRWxDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQixvQkFBb0Isa0JBQWtCLHNCQUFzQjtBQUN4RixTQUFTLG9CQUFnRDtBQUV6RCxTQUFTLHlCQUF5Qix1Q0FBdUM7QUFFekUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsZ0NBQWdDLG9DQUFvQztBQUM3RSxTQUFnRyxzQ0FBc0M7QUFDdEksU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxvQ0FBb0M7QUFHN0MsTUFBTSxpQ0FBaUM7QUFFdkMsTUFB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
