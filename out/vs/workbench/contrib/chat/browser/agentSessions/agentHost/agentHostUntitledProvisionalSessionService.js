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
import { SequencerByKey } from "../../../../../../base/common/async.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { equals } from "../../../../../../base/common/objects.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { KNOWN_MODE_VALUES, SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { migrateLegacyAutopilotConfig } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { areSessionWorkingDirectoriesEqual } from "../../../../../../platform/agentHost/common/state/sessionWorkingDirectories.js";
import { withSessionMultiRootMetadata } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { ChatConfiguration, getChatPermissionLevelFromDefaultConfiguration } from "../../../common/constants.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IAgentHostNewSessionFolderService, computeDesiredWorkingDirectories, computeWorkingDirectories, hasImmutablePrimaryWorkingDirectory, supportsMultipleWorkingDirectories } from "./agentHostNewSessionFolderService.js";
import { areCustomizationScopeRootsEqual, IAgentHostActiveClientService } from "./agentHostActiveClientService.js";
import { IAgentHostImportConversationStore } from "./agentHostImportConversationStore.js";
const IAgentHostUntitledProvisionalSessionService = createDecorator("agentHostUntitledProvisionalSessionService");
class ActiveClientBinding extends Disposable {
  constructor(roots, scope, clientId, publish) {
    super();
    this.roots = roots;
    this.scope = scope;
    if (scope) {
      this._register(scope);
      this._register(autorun((reader) => {
        if (!scope.isResolved.read(reader)) {
          return;
        }
        scope.activeClient(clientId).read(reader);
        publish();
      }));
    }
  }
}
let AgentHostUntitledProvisionalSessionService = class extends Disposable {
  constructor(_agentHostService, _logService, chatService, _configurationService, _environmentService, _newSessionFolderService, _workspaceContextService, _workspaceTrustManagementService, _importConversationStore, _activeClientService) {
    super();
    this._agentHostService = _agentHostService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._environmentService = _environmentService;
    this._newSessionFolderService = _newSessionFolderService;
    this._workspaceContextService = _workspaceContextService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._importConversationStore = _importConversationStore;
    this._activeClientService = _activeClientService;
    this._entries = new ResourceMap();
    this._pending = new ResourceMap();
    this._resolvedConfigs = new ResourceMap();
    this._resolvedConfigRequestSeq = new ResourceMap();
    this._pendingBackendDisposals = new ResourceSet();
    // URIs that were the source of a successful `tryRebind`. The chat widget
    // briefly reattaches to the old untitled URI before its viewModel switches
    // to the new real URI; without this tombstone the picker would call
    // `getOrCreate` again and spin up an orphan provisional session on the agent.
    this._rebound = new ResourceSet();
    this._sequencer = new SequencerByKey();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(chatService.onDidDisposeSession((e) => {
      for (const sessionResource of e.sessionResources) {
        if (this._entries.has(sessionResource)) {
          void this.disposeSession(sessionResource);
        }
        this._resolvedConfigs.delete(sessionResource);
        this._resolvedConfigRequestSeq.delete(sessionResource);
        this._rebound.delete(sessionResource);
      }
    }));
    this._register(this._newSessionFolderService.onDidChangeFolder((sessionResource) => {
      const folder = this._newSessionFolderService.getFolder(sessionResource);
      if (folder && this._entries.has(sessionResource)) {
        void this._changeWorkingDirectory(sessionResource, folder);
      }
    }));
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
      for (const [sessionResource, entry] of this._entries) {
        if (entry.disposed) {
          continue;
        }
        if (!entry.usesWorkspaceRootSet && (this._computeWorkingDirectories(entry.workingDirectory, entry.provider)?.length ?? 0) > 1) {
          entry.usesWorkspaceRootSet = true;
        }
        this._updateActiveClientScope(entry);
        if (entry.usesWorkspaceRootSet && !this._generationMatchingDesiredState(entry)) {
          void this._queue(sessionResource, () => this._reconcileGeneration(sessionResource, entry));
        }
      }
    }));
    this._register(this._agentHostService.onAgentHostStart(() => this._retryPendingBackendDisposals()));
  }
  get(sessionResource) {
    const entry = this._entries.get(sessionResource);
    if (!entry || entry.disposed) {
      return void 0;
    }
    return this._generationMatchingDesiredState(entry)?.backendSession;
  }
  _computeWorkingDirectories(primary, provider) {
    return computeWorkingDirectories(primary, this._workspaceContextService.getWorkspace().folders.map((folder) => folder.uri), this._agentHostService.rootState.value, provider);
  }
  _computeEntryWorkingDirectories(entry) {
    const primary = entry.workingDirectory;
    if (!primary || !entry.usesWorkspaceRootSet || !supportsMultipleWorkingDirectories(this._agentHostService.rootState.value, entry.provider)) {
      return primary ? [primary] : void 0;
    }
    const current = entry.generation?.workingDirectories ?? [primary];
    return computeDesiredWorkingDirectories(
      primary,
      current,
      this._workspaceContextService.getWorkspace().folders.map((folder) => folder.uri)
    );
  }
  _updateActiveClientScope(entry) {
    const roots = this._computeEntryWorkingDirectories(entry) ?? [];
    if (entry.activeClientBinding.value && areCustomizationScopeRootsEqual(entry.activeClientBinding.value.roots, roots)) {
      return;
    }
    const scope = this._activeClientService.acquireScope(`agent-host-${entry.provider}`, roots);
    entry.activeClientBinding.value = new ActiveClientBinding(roots, scope, this._agentHostService.clientId, () => this._publishActiveClient(entry));
  }
  getInitialSessionMetadata() {
    const workspace = this._workspaceContextService.getWorkspace();
    if (this._environmentService.isSessionsWindow || this._workspaceContextService.getWorkbenchState() !== WorkbenchState.WORKSPACE || !URI.isUri(workspace.configuration)) {
      return void 0;
    }
    return withSessionMultiRootMetadata(void 0, {
      workspaceFile: workspace.configuration.toString()
    });
  }
  getInitialSessionConfig() {
    return this._getInitialConfig();
  }
  async waitForPending(sessionResource) {
    while (true) {
      const pending = this._pending.get(sessionResource);
      if (!pending) {
        return this.get(sessionResource);
      }
      try {
        await pending;
      } catch {
        return void 0;
      }
      if (this._pending.get(sessionResource) === pending) {
        return this.get(sessionResource);
      }
    }
  }
  getOrCreate(sessionResource, provider, workingDirectory) {
    const existing = this.get(sessionResource);
    if (existing) {
      return Promise.resolve(existing);
    }
    if (this._rebound.has(sessionResource)) {
      return Promise.resolve(void 0);
    }
    const inflight = this._pending.get(sessionResource);
    if (inflight) {
      return inflight.then(() => this.get(sessionResource));
    }
    const entry = this._ensureEntry(sessionResource, provider, workingDirectory);
    if (!entry) {
      return Promise.resolve(void 0);
    }
    return this._queue(sessionResource, async () => {
      const settled = this.get(sessionResource);
      if (settled) {
        return settled;
      }
      return this._reconcileGeneration(sessionResource, entry);
    });
  }
  _ensureEntry(sessionResource, provider, workingDirectory) {
    const existing = this._entries.get(sessionResource);
    if (existing) {
      return existing;
    }
    if (this._rebound.has(sessionResource)) {
      return void 0;
    }
    const entry = this._createEntry(provider, { ...this._getInitialConfig() ?? {} }, 0, workingDirectory);
    this._entries.set(sessionResource, entry);
    return entry;
  }
  _createEntry(provider, config, configVersion, workingDirectory, resolvedConfig) {
    const entry = {
      provider,
      activeClientBinding: new MutableDisposable(),
      generation: void 0,
      config,
      configVersion,
      workingDirectory,
      usesWorkspaceRootSet: (this._computeWorkingDirectories(workingDirectory, provider)?.length ?? 0) > 1,
      resolvedConfig,
      disposed: false
    };
    this._updateActiveClientScope(entry);
    return entry;
  }
  _publishActiveClient(entry) {
    if (entry.disposed || !entry.generation) {
      return;
    }
    const scope = entry.activeClientBinding.value?.scope;
    if (!scope?.isResolved.get()) {
      return;
    }
    const activeClient = scope.activeClient(this._agentHostService.clientId).get();
    if (!activeClient) {
      return;
    }
    this._agentHostService.dispatch(entry.generation.backendSession.toString(), {
      type: ActionType.SessionActiveClientSet,
      activeClient
    });
  }
  /**
   * Serializes lifecycle work for one logical draft and records its latest tail
   * so external callers can wait for a stable current generation.
   */
  _queue(sessionResource, task) {
    const work = this._sequencer.queue(sessionResource.toString(), task);
    this._pending.set(sessionResource, work);
    void work.finally(() => {
      if (this._pending.get(sessionResource) === work) {
        this._pending.delete(sessionResource);
      }
    }).catch(() => {
    });
    return work;
  }
  _generationMatchingDesiredState(entry) {
    const generation = entry.generation;
    const desired = this._computeEntryWorkingDirectories(entry);
    return generation && this._sameUri(generation.workingDirectory, entry.workingDirectory) && this._sameWorkingDirectories(entry.provider, generation.workingDirectories, desired) ? generation : void 0;
  }
  _sameUri(first, second) {
    return first === void 0 || second === void 0 ? first === second : isEqual(first, second);
  }
  /** Provider-agnostic: only an agent advertising `immutablePrimary` pins index 0. */
  _sameWorkingDirectories(provider, first, second) {
    return areSessionWorkingDirectoriesEqual(first, second, hasImmutablePrimaryWorkingDirectory(this._agentHostService.rootState.value, provider));
  }
  _newProvisionalUri(provider) {
    return URI.from({ scheme: provider, path: `/${generateUuid()}` });
  }
  /**
   * Ensures the published generation realizes the draft's current folder and config.
   * It keeps the previous generation hidden until a valid candidate can replace it, discarding stale candidates along the way.
   */
  async _reconcileGeneration(sessionResource, entry) {
    while (this._entries.get(sessionResource) === entry && !entry.disposed) {
      const currentGeneration = this._generationMatchingDesiredState(entry);
      if (currentGeneration) {
        return currentGeneration.backendSession;
      }
      const workingDirectory = entry.workingDirectory;
      const workingDirectories = this._computeEntryWorkingDirectories(entry);
      const configVersion = entry.configVersion;
      const config = { ...entry.config };
      if (!await this._isTargetFolderTrusted(workingDirectory)) {
        await this._retireGeneration(sessionResource, entry);
        return void 0;
      }
      const candidate = this._newProvisionalUri(entry.provider);
      let created;
      try {
        created = await this._agentHostService.createSession({
          provider: entry.provider,
          session: candidate,
          _meta: this.getInitialSessionMetadata(),
          workingDirectories,
          config,
          progressToken: generateUuid()
        });
      } catch (err) {
        this._logService.warn(`[AgentHostProvisional] Failed to create provisional session for ${sessionResource.toString()}: ${err instanceof Error ? err.message : String(err)}`);
        await this._disposeBackend(candidate, "failed provisional candidate");
        await this._retireGeneration(sessionResource, entry);
        return void 0;
      }
      if (this._entries.get(sessionResource) !== entry || entry.disposed || entry.configVersion !== configVersion || !this._sameUri(entry.workingDirectory, workingDirectory) || !this._sameWorkingDirectories(entry.provider, this._computeEntryWorkingDirectories(entry), workingDirectories)) {
        await this._disposeBackend(created, "obsolete provisional candidate");
        continue;
      }
      const previous = entry.generation;
      entry.generation = { backendSession: created, workingDirectory, workingDirectories };
      this._publishActiveClient(entry);
      this._onDidChange.fire(sessionResource);
      if (previous) {
        await this._disposeBackend(previous.backendSession, "replaced provisional generation");
      }
      return created;
    }
    return void 0;
  }
  async _retireGeneration(sessionResource, entry) {
    const generation = entry.generation;
    if (!generation) {
      return;
    }
    entry.generation = void 0;
    if (this._entries.get(sessionResource) === entry) {
      this._onDidChange.fire(sessionResource);
    }
    await this._disposeBackend(generation.backendSession, "retired provisional generation");
  }
  async _disposeBackend(backendSession, reason) {
    this._pendingBackendDisposals.add(backendSession);
    try {
      await this._agentHostService.disposeSession(backendSession);
      this._pendingBackendDisposals.delete(backendSession);
      return true;
    } catch (err) {
      this._logService.warn(`[AgentHostProvisional] Failed to dispose ${reason} ${backendSession.toString()}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
  _retryPendingBackendDisposals() {
    for (const backendSession of this._pendingBackendDisposals) {
      void this._disposeBackend(backendSession, "pending provisional cleanup");
    }
  }
  /**
   * Whether the folder the provisional agent would run in is trusted. When a
   * working directory is known (it may be a standalone folder outside the
   * open workspace, e.g. a per-session folder), gate on that folder's trust;
   * otherwise fall back to whole-workspace trust.
   */
  async _isTargetFolderTrusted(workingDirectory) {
    if (workingDirectory) {
      const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(workingDirectory);
      return trusted;
    }
    return this._workspaceTrustManagementService.isWorkspaceTrusted();
  }
  tryRebind(oldSessionResource, newSessionResource, provider, workingDirectory) {
    return this._queue(oldSessionResource, async () => {
      const alreadyBound = this.get(newSessionResource);
      if (alreadyBound) {
        return alreadyBound;
      }
      const oldEntry = this._entries.get(oldSessionResource);
      if (!oldEntry || oldEntry.disposed) {
        return void 0;
      }
      const newBackendSession = this._toBackendUri(newSessionResource, provider);
      const imported = this._importConversationStore.take(newSessionResource);
      while (this._entries.get(oldSessionResource) === oldEntry && !oldEntry.disposed) {
        const config = { ...oldEntry.config };
        const configVersion = oldEntry.configVersion;
        const targetWorkingDirectory = oldEntry.workingDirectory ?? workingDirectory;
        if (!oldEntry.usesWorkspaceRootSet && (this._computeWorkingDirectories(targetWorkingDirectory, provider)?.length ?? 0) > 1) {
          oldEntry.usesWorkspaceRootSet = true;
        }
        const targetWorkingDirectories = this._computeEntryWorkingDirectories(oldEntry);
        let created;
        try {
          created = await this._agentHostService.createSession({
            provider,
            session: newBackendSession,
            _meta: this.getInitialSessionMetadata(),
            workingDirectories: targetWorkingDirectories,
            config,
            ...imported ? { model: imported.model, importConversation: { turns: imported.turns, model: imported.model } } : {},
            progressToken: generateUuid()
          });
        } catch (err) {
          this._logService.warn(`[AgentHostProvisional] Failed to create rebound provisional: ${err instanceof Error ? err.message : String(err)}`);
          this._restoreImportedConversation(newSessionResource, imported);
          const disposed = await this._disposeBackend(newBackendSession, "failed rebound candidate");
          if (!disposed) {
            throw new Error(`Cannot safely recover rebound session ${newBackendSession.toString()} until its candidate is retired`);
          }
          return void 0;
        }
        if (this._entries.get(oldSessionResource) !== oldEntry || oldEntry.disposed) {
          const disposed = await this._disposeBackend(created, "retired rebound candidate");
          this._restoreImportedConversation(newSessionResource, imported);
          if (!disposed) {
            throw new Error(`Cannot safely recover rebound session ${newBackendSession.toString()} until its candidate is retired`);
          }
          return void 0;
        }
        if (oldEntry.configVersion !== configVersion || !this._sameUri(oldEntry.workingDirectory ?? workingDirectory, targetWorkingDirectory) || !this._sameWorkingDirectories(oldEntry.provider, this._computeEntryWorkingDirectories(oldEntry), targetWorkingDirectories)) {
          const disposed = await this._disposeBackend(created, "obsolete rebound candidate");
          if (!disposed) {
            this._restoreImportedConversation(newSessionResource, imported);
            throw new Error(`Cannot safely retry rebound session ${newBackendSession.toString()} until its stale candidate is retired`);
          }
          continue;
        }
        const oldGeneration = oldEntry.generation;
        const newEntry = this._createEntry(provider, config, configVersion, targetWorkingDirectory, oldEntry.resolvedConfig);
        newEntry.usesWorkspaceRootSet = oldEntry.usesWorkspaceRootSet;
        this._updateActiveClientScope(newEntry);
        newEntry.generation = { backendSession: created, workingDirectory: targetWorkingDirectory, workingDirectories: targetWorkingDirectories };
        this._entries.set(newSessionResource, newEntry);
        this._publishActiveClient(newEntry);
        this._entries.delete(oldSessionResource);
        oldEntry.disposed = true;
        oldEntry.activeClientBinding.dispose();
        this._resolvedConfigs.delete(oldSessionResource);
        this._resolvedConfigRequestSeq.delete(oldSessionResource);
        this._rebound.add(oldSessionResource);
        this._onDidChange.fire(newSessionResource);
        if (oldGeneration) {
          await this._disposeBackend(oldGeneration.backendSession, "temporary provisional generation");
        }
        return created;
      }
      this._restoreImportedConversation(newSessionResource, imported);
      return void 0;
    });
  }
  _restoreImportedConversation(sessionResource, imported) {
    if (imported) {
      this._importConversationStore.set(sessionResource, imported);
    }
  }
  /**
   * Recreate the provisional backend session for `sessionResource` at a new
   * working directory, preserving the user's config choices. A created
   * session's cwd is immutable, so the only way to honor a folder change is to
   * dispose and recreate. The replacement uses a fresh backend URI so existing
   * subscribers acquire an authoritative snapshot for the new incarnation.
   */
  _changeWorkingDirectory(sessionResource, newWorkingDirectory) {
    const entry = this._entries.get(sessionResource);
    if (!entry || entry.disposed || this._sameUri(entry.workingDirectory, newWorkingDirectory)) {
      return Promise.resolve();
    }
    entry.workingDirectory = newWorkingDirectory;
    entry.usesWorkspaceRootSet = (this._computeWorkingDirectories(newWorkingDirectory, entry.provider)?.length ?? 0) > 1;
    this._updateActiveClientScope(entry);
    entry.configVersion++;
    entry.resolvedConfig = void 0;
    const work = this._queue(sessionResource, async () => {
      if (this._entries.get(sessionResource) !== entry || entry.disposed) {
        return;
      }
      const backend = await this._reconcileGeneration(sessionResource, entry);
      if (!backend) {
        return;
      }
      const configVersion = entry.configVersion;
      const workingDirectory = entry.workingDirectory;
      try {
        const resolved = await this._agentHostService.resolveSessionConfig({
          provider: entry.provider,
          workingDirectory,
          config: { ...entry.config }
        });
        if (this._entries.get(sessionResource) === entry && !entry.disposed && entry.configVersion === configVersion && this._sameUri(entry.workingDirectory, workingDirectory)) {
          entry.config = { ...entry.config, ...resolved.values };
          entry.resolvedConfig = resolved;
        }
      } catch (err) {
        this._logService.warn(`[AgentHostProvisional] schema re-resolve after cwd change failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      this._onDidChange.fire(sessionResource);
    });
    this._onDidChange.fire(sessionResource);
    return work;
  }
  disposeSession(sessionResource) {
    const entry = this._entries.get(sessionResource);
    this._resolvedConfigs.delete(sessionResource);
    this._resolvedConfigRequestSeq.delete(sessionResource);
    if (!entry) {
      return Promise.resolve();
    }
    entry.disposed = true;
    entry.activeClientBinding.dispose();
    this._entries.delete(sessionResource);
    this._onDidChange.fire(sessionResource);
    return this._queue(sessionResource, async () => {
      if (entry.generation) {
        await this._disposeBackend(entry.generation.backendSession, "provisional generation");
        entry.generation = void 0;
      }
    });
  }
  dispose() {
    for (const [, entry] of this._entries) {
      entry.disposed = true;
      entry.activeClientBinding.dispose();
      if (entry.generation) {
        this._agentHostService.disposeSession(entry.generation.backendSession).catch(() => {
        });
      }
    }
    for (const backendSession of this._pendingBackendDisposals) {
      this._agentHostService.disposeSession(backendSession).catch(() => {
      });
    }
    this._entries.clear();
    this._pending.clear();
    this._pendingBackendDisposals.clear();
    this._resolvedConfigs.clear();
    this._resolvedConfigRequestSeq.clear();
    this._rebound.clear();
    super.dispose();
  }
  /**
   * Convert the chat-input UI session URI (`agent-host-PROVIDER:/<id>`)
   * to the agent-host backend URI (`PROVIDER:/<id>`).
   */
  _toBackendUri(sessionResource, provider) {
    const rawId = sessionResource.path.replace(/^\//, "");
    return URI.from({ scheme: provider, path: `/${rawId}` });
  }
  getResolvedConfig(sessionResource) {
    return this._entries.get(sessionResource)?.resolvedConfig ?? this._resolvedConfigs.get(sessionResource);
  }
  async refreshResolvedConfig(sessionResource, provider, workingDirectory, config) {
    const seq = (this._resolvedConfigRequestSeq.get(sessionResource) ?? 0) + 1;
    this._resolvedConfigRequestSeq.set(sessionResource, seq);
    try {
      const resolved = await this._agentHostService.resolveSessionConfig({
        provider,
        workingDirectory,
        config
      });
      if (this._resolvedConfigRequestSeq.get(sessionResource) !== seq) {
        return;
      }
      const entry = this._entries.get(sessionResource);
      if (entry) {
        entry.config = { ...entry.config, ...resolved.values };
        entry.resolvedConfig = resolved;
      } else {
        this._resolvedConfigs.set(sessionResource, resolved);
      }
      this._onDidChange.fire(sessionResource);
    } catch (err) {
      this._logService.warn(`[AgentHostProvisional] schema re-resolve failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async applyConfigChange(sessionResource, provider, workingDirectory, partial) {
    const entry = this._ensureEntry(sessionResource, provider, workingDirectory);
    if (!entry) {
      return void 0;
    }
    Object.assign(entry.config, partial);
    entry.configVersion++;
    if (entry.resolvedConfig) {
      entry.resolvedConfig = {
        ...entry.resolvedConfig,
        values: { ...entry.resolvedConfig.values, ...partial }
      };
    }
    return this._queue(sessionResource, async () => {
      if (this._entries.get(sessionResource) !== entry || entry.disposed) {
        return void 0;
      }
      const backend = await this._reconcileGeneration(sessionResource, entry);
      if (!backend || this._entries.get(sessionResource) !== entry || entry.disposed) {
        return void 0;
      }
      this._agentHostService.dispatch(backend.toString(), {
        type: ActionType.SessionConfigChanged,
        config: partial
      });
      const configVersion = entry.configVersion;
      const resolvedWorkingDirectory = entry.workingDirectory;
      try {
        const resolved = await this._agentHostService.resolveSessionConfig({
          provider,
          workingDirectory: resolvedWorkingDirectory,
          config: { ...entry.config }
        });
        const stillCurrent = this._entries.get(sessionResource);
        if (stillCurrent === entry && !entry.disposed && entry.configVersion === configVersion && this._sameUri(entry.workingDirectory, resolvedWorkingDirectory)) {
          const resolvedValues = { ...resolved.values };
          const mergedConfig = { ...entry.config, ...resolvedValues };
          const configChanged = !equals(entry.config, mergedConfig);
          const resolvedChanged = !equals(entry.resolvedConfig, resolved);
          if (configChanged || resolvedChanged) {
            entry.config = mergedConfig;
            entry.resolvedConfig = resolved;
            this._onDidChange.fire(sessionResource);
          }
        }
      } catch (err) {
        this._logService.warn(`[AgentHostProvisional] schema re-resolve failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return backend;
    });
  }
  /**
   * Workbench-side initial config seed sent at `createSession` time so the
   * agent's own server-side defaults don't fill `state.config.values` for
   * keys the workbench wants to control. Without this, the merge filter in
   * `agentHostSessionHandler` sees those agent defaults as "user-set" and
   * drops the workbench defaults.
   *
   * - `isolation`: workbench has no isolation picker, so always `'folder'`.
   * - `mode` / `autoApprove`: seeded from the single
   *   `chat.defaultConfiguration` object setting (`mode` and
   *   `approvals` properties). The approval seed is clamped to `'default'`
   *   when the `chat.tools.global.autoApprove` policy is off. The local-only
   *   `chat.permissions.default` setting is NOT used.
   *
   * Skipped entirely in the Agents window, where the sessions provider
   * supplies config via `request.agentHostSessionConfig` instead.
   */
  _getInitialConfig() {
    if (this._environmentService.isSessionsWindow) {
      return void 0;
    }
    const config = { [SessionConfigKey.Isolation]: "folder" };
    const configuredDefaults = this._configurationService.getValue(ChatConfiguration.DefaultConfiguration);
    const policyValue = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue;
    const configuredApprovals = getChatPermissionLevelFromDefaultConfiguration(configuredDefaults?.approvals);
    if (configuredApprovals) {
      const policyRestricted = policyValue === false;
      config[SessionConfigKey.AutoApprove] = policyRestricted && configuredApprovals !== "default" ? "default" : configuredApprovals;
    }
    const configuredMode = configuredDefaults?.mode;
    if (typeof configuredMode === "string" && KNOWN_MODE_VALUES.has(configuredMode)) {
      config[SessionConfigKey.Mode] = configuredMode;
    }
    return migrateLegacyAutopilotConfig(config);
  }
};
AgentHostUntitledProvisionalSessionService = __decorateClass([
  __decorateParam(0, IAgentHostService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IAgentHostNewSessionFolderService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IWorkspaceTrustManagementService),
  __decorateParam(8, IAgentHostImportConversationStore),
  __decorateParam(9, IAgentHostActiveClientService)
], AgentHostUntitledProvisionalSessionService);
registerSingleton(
  IAgentHostUntitledProvisionalSessionService,
  AgentHostUntitledProvisionalSessionService,
  InstantiationType.Delayed
);
export {
  AgentHostUntitledProvisionalSessionService,
  IAgentHostUntitledProvisionalSessionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBMTSBlZGl0aW5nIG1hcCBmb3IgdW50aXRsZWQgYWdlbnQtaG9zdCBjaGF0IHNlc3Npb25zLlxuICpcbiAqIFRoaXMgc2VydmljZSBleGlzdHMgc28gc2Vzc2lvbi1jb25maWcgY2hpcCBjaG9pY2VzIG1hZGUgYmVmb3JlIGZpcnN0IFNlbmRcbiAqIHJlYWNoIHRoZSBiYWNrZW5kIGBTZXNzaW9uU3RhdGUuY29uZmlnLnZhbHVlc2AuIERvIG5vdCBzaW1wbGlmeSB0aGlzIGludG8gYVxuICogZGlyZWN0IHBpY2tlci1vbmx5IGNhY2hlOiB0aGUgYWdlbnQgcmVhZHMgY29uZmlnIHRocm91Z2ggdGhlIGJhY2tlbmQgc3RhdGVcbiAqIHdoZW4gYSBwcm92aXNpb25hbCBzZXNzaW9uIG1hdGVyaWFsaXplcy5cbiAqXG4gKiBSZXNvdXJjZSBpZGVudGl0aWVzOlxuICogLSBjaGF0IFVJIHJlc291cmNlOiBgYWdlbnQtaG9zdC1QUk9WSURFUjovdW50aXRsZWQtPHV1aWQ+YCBiZWZvcmUgZmlyc3QgU2VuZC5cbiAqIC0gYmFja2VuZCByZXNvdXJjZTogYW4gb3BhcXVlIGBQUk9WSURFUjovPHV1aWQ+YCBmb3IgcHJvdmlzaW9uYWwgc3RhdGUuXG4gKiAtIHJlYWwgY2hhdCByZXNvdXJjZTogYGFnZW50LWhvc3QtUFJPVklERVI6Lzx1dWlkPmAgYWZ0ZXJcbiAqICAgYGNoYXRTZXJ2aWNlSW1wbC5hY2NlcHRJbnB1dGAgY2FsbHMgYGNyZWF0ZU5ld0NoYXRTZXNzaW9uSXRlbWAuXG4gKiAtIHJlYWwgYmFja2VuZCByZXNvdXJjZTogYFBST1ZJREVSOi88dXVpZD5gIGFmdGVyIGB0cnlSZWJpbmRgLlxuICpcbiAqIFJlcXVpcmVkIGZsb3c6XG4gKiAxLiBgQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyYCBjYWxscyBgZ2V0T3JDcmVhdGUodW50aXRsZWQsIHByb3ZpZGVyLCBjd2QpYC5cbiAqICAgIFRoaXMgY3JlYXRlcyBhIGJhY2tlbmQgcHJvdmlzaW9uYWwgc2Vzc2lvbiBzbyBgU2Vzc2lvbkNvbmZpZ0NoYW5nZWRgXG4gKiAgICBhY3Rpb25zIGhhdmUgYSByZWR1Y2VyLW93bmVkIGBTZXNzaW9uU3RhdGVgIHRvIHVwZGF0ZS5cbiAqIDIuIE9uIGZpcnN0IFNlbmQsIGBBZ2VudEhvc3RTZXNzaW9uTGlzdENvbnRyb2xsZXIubmV3Q2hhdFNlc3Npb25JdGVtYFxuICogICAgcmVjZWl2ZXMgYm90aCBgcmVxdWVzdC51bnRpdGxlZFJlc291cmNlYCBhbmQgdGhlIG5ld2x5IGdlbmVyYXRlZCByZWFsXG4gKiAgICByZXNvdXJjZS4gSXQgbXVzdCBjYWxsIGB0cnlSZWJpbmRgIGJlZm9yZSB0aGUgaGFuZGxlciBpbnZva2VzIHRoZSBhZ2VudC5cbiAqIDMuIGB0cnlSZWJpbmRgIHNuYXBzaG90cyB0aGUgd29ya2JlbmNoLW93bmVkIGNvbmZpZyBmcm9tIHRoZSB1bnRpdGxlZFxuICogICAgcHJvdmlzaW9uYWwgcmVjb3JkLCBjcmVhdGVzIGEgbmV3IHByb3Zpc2lvbmFsIGZvciB0aGUgcmVhbCBiYWNrZW5kXG4gKiAgICByZXNvdXJjZSwgc3dhcHMgYF9lbnRyaWVzYCwgZmlyZXMgYG9uRGlkQ2hhbmdlYCwgdGhlbiBiZXN0LWVmZm9ydCBkaXNwb3Nlc1xuICogICAgdGhlIHVudGl0bGVkIGJhY2tlbmQgcHJvdmlzaW9uYWwuXG4gKiA0LiBgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuX2ludm9rZUFnZW50YCBjYWxscyBgZ2V0KHJlYWxSZXNvdXJjZSlgLiBXaGVuIGFcbiAqICAgIHJlYm91bmQgcHJvdmlzaW9uYWwgZXhpc3RzLCBpdCB0YWtlcyBhIHJlZmNvdW50ZWQgc3Vic2NyaXB0aW9uIG9uIHRoYXRcbiAqICAgIGJhY2tlbmQgc3RhdGUgdXAgZnJvbnQgc28gdGhlIHJlc3Qgb2YgdGhlIGhhbmRsZXIgb2JzZXJ2ZXMgdGhlIHByZXNlcnZlZFxuICogICAgYHN0YXRlLmNvbmZpZy52YWx1ZXNgIGluc3RlYWQgb2YgYSBmcmVzaGx5IGNyZWF0ZWQgZW1wdHkgc2Vzc2lvbi4gVGhlXG4gKiAgICBlYWdlci1zdGF0ZSBicmFuY2ggdGhlbiBza2lwcyBgX2NyZWF0ZUFuZFN1YnNjcmliZWA7IHRoZSBhZ2VudFxuICogICAgbWF0ZXJpYWxpemVzIHRoZSBwcm92aXNpb25hbCBhbmQgcmVhZHMgdGhlIHByZXNlcnZlZCBjb25maWcgdmFsdWVzLlxuICpcbiAqIEludmFyaWFudHMgdG8gcHJlc2VydmU6XG4gKiAtIGBfZW50cmllc2AgaXMga2V5ZWQgYnkgY2hhdCBVSSByZXNvdXJjZXMgYW5kIHN0b3JlcyBiYWNrZW5kIHJlc291cmNlcy5cbiAqIC0gYGdldE9yQ3JlYXRlYCBpcyBzZXJpYWxpemVkIHBlciBjaGF0IFVJIHJlc291cmNlOyBjaGlwIGluc3RhbmNlcyBtYXkgcmFjZS5cbiAqIC0gUmVjb3ZlcmFibGUgYHRyeVJlYmluZGAgZmFpbHVyZSBkZWdyYWRlcyB0byB0aGUgaGFuZGxlcidzIG5vcm1hbCBjcmVhdGVcbiAqICAgcGF0aC4gSXQgcmVqZWN0cyBvbmx5IHdoZW4gYW4gYW1iaWd1b3VzIGZpbmFsIFVSSSBjYW5ub3QgYmUgcmV0aXJlZCBzYWZlbHkuXG4gKiAtIEFiYW5kb25lZCB1bnRpdGxlZCBjaGF0cyBtdXN0IGRpc3Bvc2UgdGhlaXIgYmFja2VuZCBwcm92aXNpb25hbCBzdGF0ZSB3aGVuXG4gKiAgIGBJQ2hhdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbmAgcmVwb3J0cyB0aGUgY2hhdCBVSSByZXNvdXJjZS5cbiAqIC0gQ2FsbGVycyBvd24gcHJvdmlkZXIgYW5kIHdvcmtpbmctZGlyZWN0b3J5IGNvbnNpc3RlbmN5LiBEZXJpdmUgdGhlbSBmcm9tXG4gKiAgIHRoZSBjaGF0IHJlc291cmNlL3Nlc3Npb24gdHlwZSBhbmQgYWN0aXZlIHdvcmtzcGFjZSBpbiB0aGUgc2FtZSB3YXkgb25cbiAqICAgY3JlYXRlIGFuZCByZWJpbmQuXG4gKi9cblxuaW1wb3J0IHsgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBLTk9XTl9NT0RFX1ZBTFVFUywgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgYXJlU2Vzc2lvbldvcmtpbmdEaXJlY3Rvcmllc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLmpzJztcbmltcG9ydCB7IHdpdGhTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24sIHR5cGUgSUNoYXREZWZhdWx0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSwgY29tcHV0ZURlc2lyZWRXb3JraW5nRGlyZWN0b3JpZXMsIGNvbXB1dGVXb3JraW5nRGlyZWN0b3JpZXMsIGhhc0ltbXV0YWJsZVByaW1hcnlXb3JraW5nRGlyZWN0b3J5LCBzdXBwb3J0c011bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzIH0gZnJvbSAnLi9hZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBhcmVDdXN0b21pemF0aW9uU2NvcGVSb290c0VxdWFsLCBJQWdlbnRDdXN0b21pemF0aW9uU2NvcGUsIElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvbiwgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlIH0gZnJvbSAnLi9hZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlID1cblx0Y3JlYXRlRGVjb3JhdG9yPElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2U+KCdhZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UnKTtcblxuLyoqXG4gKiBMTSBjb250cmFjdDogbWFpbnRhaW4gb25lIGJhY2tlbmQgcHJvdmlzaW9uYWwgc2Vzc2lvbiBwZXIgdW50aXRsZWQgY2hhdCBVSVxuICogcmVzb3VyY2UsIGFuZCBicmlkZ2UgaXQgdG8gdGhlIHJlYWwgY2hhdCBVSSByZXNvdXJjZSBiZWZvcmUgdGhlIGZpcnN0IGFnZW50XG4gKiBpbnZvY2F0aW9uLiBUaGUgY29udHJhY3QgaXMgYWJvdXQgYmFja2VuZCBgU2Vzc2lvblN0YXRlLmNvbmZpZy52YWx1ZXNgLCBub3RcbiAqIFVJIHJlbmRlcmluZyBzdGF0ZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyBmb3IgdGhlIGNoYXQgVUkgcmVzb3VyY2Ugd2hvc2UgYmFja2VuZCBwcm92aXNpb25hbCBtYXBwaW5nIGNoYW5nZWQuXG5cdCAqIFBpY2tlciBsaXN0ZW5lcnMgbXVzdCByZS1yZWFkIHtAbGluayBnZXR9IGFuZCBhdHRhY2ggdG8gdGhlIHJldHVybmVkXG5cdCAqIGJhY2tlbmQgVVJJLCBpZiBhbnkuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8VVJJPjtcblxuXHQvKipcblx0ICogUmVhZCB0aGUgYmFja2VuZCBwcm92aXNpb25hbCBVUkkgY3VycmVudGx5IG1hcHBlZCBmcm9tIGBzZXNzaW9uUmVzb3VyY2VgLlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIGZvciByZXNvdXJjZXMgdGhhdCBoYXZlIG5vdCBiZWVuIHByb3Zpc2lvbmVkIG9yIHdlcmVcblx0ICogYWxyZWFkeSBkaXNwb3NlZC9yZWJvdW5kIGF3YXkuXG5cdCAqL1xuXHRnZXQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEluaXRpYWwgY29uZmlnIHRoZSBlZGl0b3Igd2luZG93IGFwcGxpZXMgdG8gZXZlcnkgbmV3IEFnZW50IEhvc3Qgc2Vzc2lvbi5cblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCBpbiB0aGUgQWdlbnRzIHdpbmRvdywgd2hlcmUgdGhlIHNlc3Npb25zIHByb3ZpZGVyIG93bnNcblx0ICogdGhlIGluaXRpYWwgY29uZmlnIHN1cHBsaWVkIG9uIHRoZSByZXF1ZXN0LlxuXHQgKi9cblx0Z2V0SW5pdGlhbFNlc3Npb25Db25maWcoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cblx0LyoqIEluaXRpYWwgc2Vzc2lvbiBtZXRhZGF0YSBjb250cmlidXRlZCBieSB0aGUgY3VycmVudCBFZGl0b3Igd29ya3NwYWNlLiAqL1xuXHRnZXRJbml0aWFsU2Vzc2lvbk1ldGFkYXRhKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBFbnN1cmUgYSBiYWNrZW5kIHByb3Zpc2lvbmFsIGV4aXN0cyBmb3IgYW4gdW50aXRsZWQgY2hhdCBVSSByZXNvdXJjZS5cblx0ICogTXVsdGlwbGUgcGlja2VyIGNoaXBzIG1heSBjYWxsIHRoaXMgY29uY3VycmVudGx5OyBpbXBsZW1lbnRhdGlvbiBtdXN0IGtlZXBcblx0ICogb25lIGNyZWF0ZSBpbiBmbGlnaHQgcGVyIHJlc291cmNlIGFuZCByZXR1cm4gdGhlIHNhbWUgYmFja2VuZCBVUkkuXG5cdCAqL1xuXHRnZXRPckNyZWF0ZShcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcm92aWRlcjogc3RyaW5nLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBXYWl0IGZvciBhIHBlbmRpbmcge0BsaW5rIGdldE9yQ3JlYXRlfSBmb3IgYHNlc3Npb25SZXNvdXJjZWAsIHRoZW4gcmV0dXJuXG5cdCAqIHRoZSBjdXJyZW50IG1hcHBpbmcuIFVzZSB0aGlzIGJlZm9yZSByZWFkaW5nL2Rpc2NhcmRpbmcgYSByZXNvdXJjZSB0aGF0IG1heVxuXHQgKiBzdGlsbCBiZSByYWNpbmcgd2l0aCBwaWNrZXItdHJpZ2dlcmVkIHByb3Zpc2lvbmFsIGNyZWF0aW9uLlxuXHQgKi9cblx0d2FpdEZvclBlbmRpbmcoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIEFwcGx5IGEgcGFydGlhbCBjb25maWcgY2hhbmdlIHRvIHRoZSBiYWNrZW5kIHByb3Zpc2lvbmFsIGZvciBhbiB1bnRpdGxlZFxuXHQgKiBjaGF0IFVJIHJlc291cmNlLiBVcGRhdGVzIHRoZSB3b3JrYmVuY2gtb3duZWQgY29uZmlnIGNhY2hlIHN5bmNocm9ub3VzbHlcblx0ICogKHNvIGEgc3Vic2VxdWVudCB7QGxpbmsgdHJ5UmViaW5kfSBzZWVzIHRoZSBsYXRlc3QgdmFsdWVzIHdpdGhvdXQgYVxuXHQgKiBzZXJ2ZXIgcm91bmR0cmlwKSwgY3JlYXRlcyB0aGUgcHJvdmlzaW9uYWwgaWYgbmVlZGVkLCB0aGVuIGRpc3BhdGNoZXNcblx0ICogYFNlc3Npb25Db25maWdDaGFuZ2VkYCBvbiB0aGUgYmFja2VuZCBzbyB0aGUgYWdlbnQgYW5kIG90aGVyIGNsaWVudHNcblx0ICogcGljayB1cCB0aGUgY2hhbmdlLiBSZXR1cm5zIHRoZSBiYWNrZW5kIFVSSSBvbiBzdWNjZXNzLlxuXHQgKi9cblx0YXBwbHlDb25maWdDaGFuZ2UoXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cHJvdmlkZXI6IHN0cmluZyxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cGFydGlhbDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogQnJpZGdlIHRoZSB1bnRpdGxlZCBjaGF0IFVJIHJlc291cmNlIHRvIHRoZSByZWFsIGNoYXQgVUkgcmVzb3VyY2UgY3JlYXRlZFxuXHQgKiBmb3IgZmlyc3QgU2VuZC4gTXVzdCBjb3B5IHRoZSB3b3JrYmVuY2gtb3duZWQgY29uZmlnIGludG8gdGhlIHJlYWwgYmFja2VuZFxuXHQgKiBwcm92aXNpb25hbCBiZWZvcmUgdGhlIGhhbmRsZXIgaW52b2tlcyB0aGUgYWdlbnQuIE5vLW9wIHdoZW4gbm8gb2xkIG1hcHBpbmdcblx0ICogZXhpc3RzOyBpZGVtcG90ZW50IHdoZW4gdGhlIG5ldyBtYXBwaW5nIGlzIGFscmVhZHkgcHJlc2VudC5cblx0ICovXG5cdHRyeVJlYmluZChcblx0XHRvbGRTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRuZXdTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcm92aWRlcjogc3RyaW5nLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIGFuZCBmb3JnZXQgdGhlIGJhY2tlbmQgcHJvdmlzaW9uYWwgbWFwcGVkIGZyb20gYHNlc3Npb25SZXNvdXJjZWAuXG5cdCAqIFNhZmUgYWZ0ZXIgYSBzdWNjZXNzZnVsIHJlYmluZCBiZWNhdXNlIHRoZSBvbGQgbWFwcGluZyBpcyBhbHJlYWR5IGdvbmUuXG5cdCAqL1xuXHRkaXNwb3NlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIExhdGVzdCB3b3JrYmVuY2gtc2lkZSByZS1yZXNvbHZlZCBjb25maWcgKHNjaGVtYSArIHZhbHVlcykgZm9yIGEgY2hhdFxuXHQgKiBzZXNzaW9uLCBpZiBhbnkuIFBvcHVsYXRlZCBhZnRlciBhIHZhbHVlIGNoYW5nZSBzbyBkZXBlbmRlbnQgcHJvcGVydGllc1xuXHQgKiByZWZyZXNoIHdpdGhvdXQgYSBwcm90b2NvbC1sZXZlbCBzY2hlbWEtdXBkYXRlIGNoYW5uZWwuXG5cdCAqXG5cdCAqIEJvdGggdGhlIHNjaGVtYSBhbmQgdGhlIHZhbHVlcyBtYXR0ZXI6IGByZXNvbHZlU2Vzc2lvbkNvbmZpZ2AgcnVuc1xuXHQgKiBgdmFsaWRhdGVPckRlZmF1bHRgLCB3aGljaCBjYW4gY2xhbXAgbm93LWludmFsaWQgdmFsdWVzIG9yIGluamVjdFxuXHQgKiBkZXJpdmVkIGRlZmF1bHRzIHRoZSBjb25zdW1lciBzaG91bGQgcHJlZmVyIG92ZXIgYHN0YXRlLmNvbmZpZy52YWx1ZXNgLlxuXHQgKi9cblx0Z2V0UmVzb2x2ZWRDb25maWcoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmUtcmVzb2x2ZSBjb25maWcgZm9yIGFuIGFscmVhZHktY3JlYXRlZCBjaGF0IHNlc3Npb24gYW5kIGNhY2hlIHRoZVxuXHQgKiBzY2hlbWEvdmFsdWVzIG92ZXJsYXkgcmV0dXJuZWQgYnkgdGhlIHByb3ZpZGVyLlxuXHQgKi9cblx0cmVmcmVzaFJlc29sdmVkQ29uZmlnKFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHByb3ZpZGVyOiBzdHJpbmcsXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBJUHJvdmlzaW9uYWxHZW5lcmF0aW9uIHtcblx0cmVhZG9ubHkgYmFja2VuZFNlc3Npb246IFVSSTtcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkO1xufVxuXG50eXBlIFByb3Zpc2lvbmFsT3BlcmF0aW9uUmVzdWx0ID0gVVJJIHwgdm9pZDtcblxuY2xhc3MgQWN0aXZlQ2xpZW50QmluZGluZyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByb290czogcmVhZG9ubHkgVVJJW10sXG5cdFx0cmVhZG9ubHkgc2NvcGU6IElBZ2VudEN1c3RvbWl6YXRpb25TY29wZSB8IHVuZGVmaW5lZCxcblx0XHRjbGllbnRJZDogc3RyaW5nLFxuXHRcdHB1Ymxpc2g6ICgpID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0aWYgKHNjb3BlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihzY29wZSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGlmICghc2NvcGUuaXNSZXNvbHZlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0c2NvcGUuYWN0aXZlQ2xpZW50KGNsaWVudElkKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHB1Ymxpc2goKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElFbnRyeSB7XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFjdGl2ZUNsaWVudEJpbmRpbmc6IE11dGFibGVEaXNwb3NhYmxlPEFjdGl2ZUNsaWVudEJpbmRpbmc+O1xuXHRnZW5lcmF0aW9uOiBJUHJvdmlzaW9uYWxHZW5lcmF0aW9uIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogV29ya2JlbmNoLW93bmVkIHNuYXBzaG90IG9mIHNlc3Npb24tY29uZmlnIHZhbHVlcyBmb3IgdGhpcyBwcm92aXNpb25hbC5cblx0ICogU2VlZGVkIGZyb20ge0BsaW5rIF9nZXRJbml0aWFsQ29uZmlnfSBhdCBjcmVhdGUgdGltZSBhbmQgbXV0YXRlZFxuXHQgKiBzeW5jaHJvbm91c2x5IGJ5IHtAbGluayBhcHBseUNvbmZpZ0NoYW5nZX0gc28ge0BsaW5rIHRyeVJlYmluZH0gY2FuIHJlYWRcblx0ICogdGhlIGxhdGVzdCB2YWx1ZXMgd2l0aG91dCB3YWl0aW5nIGZvciB0aGUgYWdlbnQgdG8gZWNobyB0aGVtIGJhY2sgdGhyb3VnaFxuXHQgKiBgc3RhdGUuY29uZmlnLnZhbHVlc2AuXG5cdCAqL1xuXHRjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHQvKipcblx0ICogTW9ub3RvbmljIHJldmlzaW9uIG9mIHtAbGluayBjb25maWd9LiBBc3luYyBnZW5lcmF0aW9uIGNyZWF0aW9uIHNuYXBzaG90c1xuXHQgKiB0aGlzIHZhbHVlLCBkaXNjYXJkaW5nIGFuZCByZWNyZWF0aW5nIGl0cyBjYW5kaWRhdGUgYWZ0ZXIgYSBuZXdlciBlZGl0LlxuXHQgKi9cblx0Y29uZmlnVmVyc2lvbjogbnVtYmVyO1xuXHQvKipcblx0ICogV29ya2luZyBkaXJlY3RvcnkgdGhlIHByb3Zpc2lvbmFsIGJhY2tlbmQgc2Vzc2lvbiB3YXMgY3JlYXRlZCB3aXRoLiBBXG5cdCAqIGNyZWF0ZWQgc2Vzc2lvbidzIGN3ZCBpcyBpbW11dGFibGUsIHNvIHdoZW4gdGhlIHVzZXIgcGlja3MgYSBkaWZmZXJlbnRcblx0ICogZm9sZGVyIHRoZSBlbnRyeSBpcyByZWNyZWF0ZWQ7IHRoaXMgbGV0cyBhIGZvbGRlciBjaGFuZ2Ugbm8tb3Agd2hlbiB0aGVcblx0ICogY3dkIGlzIHVuY2hhbmdlZC4gVGhlIGdlbmVyYXRpb24gaXMgYWxzbyByZWNyZWF0ZWQgd2hlbiB0aGUgc2Vjb25kYXJ5XG5cdCAqIHJvb3Qgc2V0IGNvbXB1dGVkIGZvciB0aGlzIHByaW1hcnkgY2hhbmdlcy5cblx0ICovXG5cdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgdGhpcyBkcmFmdCB3YXMgY3JlYXRlZCBhZ2FpbnN0IHRoZSBjb21wbGV0ZSBmb2xkZXIgc2V0IG9mIGEgbXVsdGktcm9vdCB3b3Jrc3BhY2UuICovXG5cdHVzZXNXb3Jrc3BhY2VSb290U2V0OiBib29sZWFuO1xuXHQvKipcblx0ICogTGF0ZXN0IHJlLXJlc29sdmVkIGNvbmZpZyAoc2NoZW1hICsgdmFsdWVzKSBmb3IgdGhpcyBwcm92aXNpb25hbCwgc2V0XG5cdCAqIGJ5IHtAbGluayBhcHBseUNvbmZpZ0NoYW5nZX0gYWZ0ZXIgZWFjaCB2YWx1ZSBjaGFuZ2UuIENsZWFyZWQgd2hlbiB0aGVcblx0ICogZW50cnkgaXMgcmVib3VuZCBvciBkaXNwb3NlZC5cblx0ICovXG5cdHJlc29sdmVkQ29uZmlnPzogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ7XG5cdGRpc3Bvc2VkOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzID0gbmV3IFJlc291cmNlTWFwPElFbnRyeT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZyA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPFByb3Zpc2lvbmFsT3BlcmF0aW9uUmVzdWx0Pj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZWRDb25maWdzID0gbmV3IFJlc291cmNlTWFwPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlZENvbmZpZ1JlcXVlc3RTZXEgPSBuZXcgUmVzb3VyY2VNYXA8bnVtYmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQmFja2VuZERpc3Bvc2FscyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHQvLyBVUklzIHRoYXQgd2VyZSB0aGUgc291cmNlIG9mIGEgc3VjY2Vzc2Z1bCBgdHJ5UmViaW5kYC4gVGhlIGNoYXQgd2lkZ2V0XG5cdC8vIGJyaWVmbHkgcmVhdHRhY2hlcyB0byB0aGUgb2xkIHVudGl0bGVkIFVSSSBiZWZvcmUgaXRzIHZpZXdNb2RlbCBzd2l0Y2hlc1xuXHQvLyB0byB0aGUgbmV3IHJlYWwgVVJJOyB3aXRob3V0IHRoaXMgdG9tYnN0b25lIHRoZSBwaWNrZXIgd291bGQgY2FsbFxuXHQvLyBgZ2V0T3JDcmVhdGVgIGFnYWluIGFuZCBzcGluIHVwIGFuIG9ycGhhbiBwcm92aXNpb25hbCBzZXNzaW9uIG9uIHRoZSBhZ2VudC5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVib3VuZCA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlOiBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlIHByaXZhdGUgcmVhZG9ubHkgX2ltcG9ydENvbnZlcnNhdGlvblN0b3JlOiBJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUsXG5cdFx0QElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNsaWVudFNlcnZpY2U6IElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gRHJvcCBwcm92aXNpb25hbCBzZXNzaW9ucyB3aGVuIHRoZSBjaGF0IGluZnJhIGRpc3Bvc2VzIHRoZWlyXG5cdFx0Ly8gY2hhdC1pbnB1dCBzZXNzaW9uIHJlc291cmNlIChlLmcuIHRoZSB1c2VyIGNsb3NlcyB0aGUgd2lkZ2V0XG5cdFx0Ly8gd2l0aG91dCBldmVyIHNlbmRpbmcgYSBtZXNzYWdlKS4gV2l0aG91dCB0aGlzLCB1bnRpdGxlZCBjaGF0cyB0aGVcblx0XHQvLyB1c2VyIG9wZW5zIGFuZCBhYmFuZG9ucyBsZWFrIGluLW1lbW9yeSBzdGF0ZS1tYW5hZ2VyIGVudHJpZXMgb25cblx0XHQvLyB0aGUgYWdlbnQgaG9zdC5cblx0XHR0aGlzLl9yZWdpc3RlcihjaGF0U2VydmljZS5vbkRpZERpc3Bvc2VTZXNzaW9uKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uUmVzb3VyY2Ugb2YgZS5zZXNzaW9uUmVzb3VyY2VzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9lbnRyaWVzLmhhcyhzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dm9pZCB0aGlzLmRpc3Bvc2VTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRDb25maWdzLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlZENvbmZpZ1JlcXVlc3RTZXEuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdC8vIERyb3AgYW55IHRvbWJzdG9uZSBmb3IgdGhlIGFiYW5kb25lZCB1bnRpdGxlZCBVUkkgc28gdGhlXG5cdFx0XHRcdC8vIHNldCBkb2Vzbid0IGdyb3cgdW5ib3VuZGVkIGFjcm9zcyB0aGUgd29ya2JlbmNoIGxpZmV0aW1lLlxuXHRcdFx0XHR0aGlzLl9yZWJvdW5kLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEEgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGZpeGVkIGF0IGNyZWF0aW9uIHRpbWUuIFdoZW4gdGhlIHVzZXJcblx0XHQvLyBwaWNrcyBhIGRpZmZlcmVudCBmb2xkZXIgZm9yIGEgbm90LXlldC1zdGFydGVkIHNlc3Npb24gdGhhdCBhbHJlYWR5IGhhc1xuXHRcdC8vIGEgcHJvdmlzaW9uYWwgYmFja2VuZCBzZXNzaW9uIChidWlsdCB1cCBieSBjb25maWcgY2hpcHMpLCByZWNyZWF0ZSB0aGF0XG5cdFx0Ly8gcHJvdmlzaW9uYWwgYXQgdGhlIG5ldyBjd2Qgc28gY2hpcCBzY2hlbWFzIHJlc29sdmUgYWdhaW5zdCBpdC4gVGhlXG5cdFx0Ly8gc2VydmljZSBvd25zIHRoaXMgcmVhY3Rpb24gc28gY29uY3VycmVudCBjaGlwIGluc3RhbmNlcyBkb24ndCByYWNlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9sZGVyKHNlc3Npb25SZXNvdXJjZSA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLl9uZXdTZXNzaW9uRm9sZGVyU2VydmljZS5nZXRGb2xkZXIoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChmb2xkZXIgJiYgdGhpcy5fZW50cmllcy5oYXMoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX2NoYW5nZVdvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvblJlc291cmNlLCBmb2xkZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHQvLyBJZiB3b3Jrc3BhY2UgZm9sZGVycyBjaGFuZ2UsIHJlY29tcHV0ZSB0aGUgZGVzaXJlZCBkaXJlY3Rvcnkgc2V0LiBJZiBpdFxuXHRcdC8vIGRpZmZlcnMgZnJvbSB3aGF0IHRoZSBleGlzdGluZyBwcm92aXNpb25hbCB3YXMgY3JlYXRlZCB3aXRoLCBkaXNwb3NlIHRoYXRcblx0XHQvLyBiYWNrZW5kIHNlc3Npb24gYW5kIGNyZWF0ZSBhIHJlcGxhY2VtZW50IHByb3Zpc2lvbmFsIHNlc3Npb24gd2l0aCB0aGUgbmV3XG5cdFx0Ly8gc2V0IG9mIGRpcmVjdG9yaWVzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IFtzZXNzaW9uUmVzb3VyY2UsIGVudHJ5XSBvZiB0aGlzLl9lbnRyaWVzKSB7XG5cdFx0XHRcdGlmIChlbnRyeS5kaXNwb3NlZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghZW50cnkudXNlc1dvcmtzcGFjZVJvb3RTZXQgJiYgKHRoaXMuX2NvbXB1dGVXb3JraW5nRGlyZWN0b3JpZXMoZW50cnkud29ya2luZ0RpcmVjdG9yeSwgZW50cnkucHJvdmlkZXIpPy5sZW5ndGggPz8gMCkgPiAxKSB7XG5cdFx0XHRcdFx0ZW50cnkudXNlc1dvcmtzcGFjZVJvb3RTZXQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUFjdGl2ZUNsaWVudFNjb3BlKGVudHJ5KTtcblx0XHRcdFx0aWYgKGVudHJ5LnVzZXNXb3Jrc3BhY2VSb290U2V0ICYmICF0aGlzLl9nZW5lcmF0aW9uTWF0Y2hpbmdEZXNpcmVkU3RhdGUoZW50cnkpKSB7XG5cdFx0XHRcdFx0dm9pZCB0aGlzLl9xdWV1ZShzZXNzaW9uUmVzb3VyY2UsICgpID0+IHRoaXMuX3JlY29uY2lsZUdlbmVyYXRpb24oc2Vzc2lvblJlc291cmNlLCBlbnRyeSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uub25BZ2VudEhvc3RTdGFydCgoKSA9PiB0aGlzLl9yZXRyeVBlbmRpbmdCYWNrZW5kRGlzcG9zYWxzKCkpKTtcblx0fVxuXG5cdGdldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghZW50cnkgfHwgZW50cnkuZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZW5lcmF0aW9uTWF0Y2hpbmdEZXNpcmVkU3RhdGUoZW50cnkpPy5iYWNrZW5kU2Vzc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVXb3JraW5nRGlyZWN0b3JpZXMocHJpbWFyeTogVVJJIHwgdW5kZWZpbmVkLCBwcm92aWRlcjogc3RyaW5nKTogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBjb21wdXRlV29ya2luZ0RpcmVjdG9yaWVzKHByaW1hcnksIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKSwgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUudmFsdWUsIHByb3ZpZGVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVFbnRyeVdvcmtpbmdEaXJlY3RvcmllcyhlbnRyeTogSUVudHJ5KTogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByaW1hcnkgPSBlbnRyeS53b3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmICghcHJpbWFyeSB8fCAhZW50cnkudXNlc1dvcmtzcGFjZVJvb3RTZXQgfHwgIXN1cHBvcnRzTXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXModGhpcy5fYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUudmFsdWUsIGVudHJ5LnByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuIHByaW1hcnkgPyBbcHJpbWFyeV0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnQgPSBlbnRyeS5nZW5lcmF0aW9uPy53b3JraW5nRGlyZWN0b3JpZXMgPz8gW3ByaW1hcnldO1xuXHRcdHJldHVybiBjb21wdXRlRGVzaXJlZFdvcmtpbmdEaXJlY3Rvcmllcyhcblx0XHRcdHByaW1hcnksXG5cdFx0XHRjdXJyZW50LFxuXHRcdFx0dGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBY3RpdmVDbGllbnRTY29wZShlbnRyeTogSUVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdHMgPSB0aGlzLl9jb21wdXRlRW50cnlXb3JraW5nRGlyZWN0b3JpZXMoZW50cnkpID8/IFtdO1xuXHRcdGlmIChlbnRyeS5hY3RpdmVDbGllbnRCaW5kaW5nLnZhbHVlICYmIGFyZUN1c3RvbWl6YXRpb25TY29wZVJvb3RzRXF1YWwoZW50cnkuYWN0aXZlQ2xpZW50QmluZGluZy52YWx1ZS5yb290cywgcm9vdHMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NvcGUgPSB0aGlzLl9hY3RpdmVDbGllbnRTZXJ2aWNlLmFjcXVpcmVTY29wZShgYWdlbnQtaG9zdC0ke2VudHJ5LnByb3ZpZGVyfWAsIHJvb3RzKTtcblx0XHRlbnRyeS5hY3RpdmVDbGllbnRCaW5kaW5nLnZhbHVlID0gbmV3IEFjdGl2ZUNsaWVudEJpbmRpbmcocm9vdHMsIHNjb3BlLCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmNsaWVudElkLCAoKSA9PiB0aGlzLl9wdWJsaXNoQWN0aXZlQ2xpZW50KGVudHJ5KSk7XG5cdH1cblxuXHRnZXRJbml0aWFsU2Vzc2lvbk1ldGFkYXRhKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3dcblx0XHRcdHx8IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRVxuXHRcdFx0fHwgIVVSSS5pc1VyaSh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB3aXRoU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKHVuZGVmaW5lZCwge1xuXHRcdFx0d29ya3NwYWNlRmlsZTogd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24udG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fVxuXG5cdGdldEluaXRpYWxTZXNzaW9uQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0SW5pdGlhbENvbmZpZygpO1xuXHR9XG5cblx0YXN5bmMgd2FpdEZvclBlbmRpbmcoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHBlbmRpbmc7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gVGhlIG9wZXJhdGlvbiBjYWxsZXIgb3ducyBpdHMgZXJyb3I7IG9ic2VydmVycyBvbmx5IHJlLXJlYWQgc3RhYmxlIHN0YXRlLlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmcuZ2V0KHNlc3Npb25SZXNvdXJjZSkgPT09IHBlbmRpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0T3JDcmVhdGUoXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cHJvdmlkZXI6IHN0cmluZyxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShleGlzdGluZyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZWJvdW5kLmhhcyhzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGNvbnN0IGluZmxpZ2h0ID0gdGhpcy5fcGVuZGluZy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoaW5mbGlnaHQpIHtcblx0XHRcdHJldHVybiBpbmZsaWdodC50aGVuKCgpID0+IHRoaXMuZ2V0KHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW5zdXJlRW50cnkoc2Vzc2lvblJlc291cmNlLCBwcm92aWRlciwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcXVldWUoc2Vzc2lvblJlc291cmNlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR0bGVkID0gdGhpcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdHJldHVybiBzZXR0bGVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3JlY29uY2lsZUdlbmVyYXRpb24oc2Vzc2lvblJlc291cmNlLCBlbnRyeSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVFbnRyeShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcHJvdmlkZXI6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogSUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2VudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZWJvdW5kLmhhcyhzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2NyZWF0ZUVudHJ5KHByb3ZpZGVyLCB7IC4uLih0aGlzLl9nZXRJbml0aWFsQ29uZmlnKCkgPz8ge30pIH0sIDAsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdHRoaXMuX2VudHJpZXMuc2V0KHNlc3Npb25SZXNvdXJjZSwgZW50cnkpO1xuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUVudHJ5KHByb3ZpZGVyOiBzdHJpbmcsIGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGNvbmZpZ1ZlcnNpb246IG51bWJlciwgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCByZXNvbHZlZENvbmZpZz86IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0KTogSUVudHJ5IHtcblx0XHRjb25zdCBlbnRyeTogSUVudHJ5ID0ge1xuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRhY3RpdmVDbGllbnRCaW5kaW5nOiBuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSxcblx0XHRcdGdlbmVyYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGNvbmZpZyxcblx0XHRcdGNvbmZpZ1ZlcnNpb24sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0dXNlc1dvcmtzcGFjZVJvb3RTZXQ6ICh0aGlzLl9jb21wdXRlV29ya2luZ0RpcmVjdG9yaWVzKHdvcmtpbmdEaXJlY3RvcnksIHByb3ZpZGVyKT8ubGVuZ3RoID8/IDApID4gMSxcblx0XHRcdHJlc29sdmVkQ29uZmlnLFxuXHRcdFx0ZGlzcG9zZWQ6IGZhbHNlLFxuXHRcdH07XG5cdFx0dGhpcy5fdXBkYXRlQWN0aXZlQ2xpZW50U2NvcGUoZW50cnkpO1xuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdHByaXZhdGUgX3B1Ymxpc2hBY3RpdmVDbGllbnQoZW50cnk6IElFbnRyeSk6IHZvaWQge1xuXHRcdGlmIChlbnRyeS5kaXNwb3NlZCB8fCAhZW50cnkuZ2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzY29wZSA9IGVudHJ5LmFjdGl2ZUNsaWVudEJpbmRpbmcudmFsdWU/LnNjb3BlO1xuXHRcdGlmICghc2NvcGU/LmlzUmVzb2x2ZWQuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gc2NvcGUuYWN0aXZlQ2xpZW50KHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuY2xpZW50SWQpLmdldCgpO1xuXHRcdGlmICghYWN0aXZlQ2xpZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2goZW50cnkuZ2VuZXJhdGlvbi5iYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2VyaWFsaXplcyBsaWZlY3ljbGUgd29yayBmb3Igb25lIGxvZ2ljYWwgZHJhZnQgYW5kIHJlY29yZHMgaXRzIGxhdGVzdCB0YWlsXG5cdCAqIHNvIGV4dGVybmFsIGNhbGxlcnMgY2FuIHdhaXQgZm9yIGEgc3RhYmxlIGN1cnJlbnQgZ2VuZXJhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3F1ZXVlPFQgZXh0ZW5kcyBQcm92aXNpb25hbE9wZXJhdGlvblJlc3VsdD4oc2Vzc2lvblJlc291cmNlOiBVUkksIHRhc2s6ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCB3b3JrID0gdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCB0YXNrKTtcblx0XHR0aGlzLl9wZW5kaW5nLnNldChzZXNzaW9uUmVzb3VyY2UsIHdvcmspO1xuXHRcdHZvaWQgd29yay5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nLmdldChzZXNzaW9uUmVzb3VyY2UpID09PSB3b3JrKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRyZXR1cm4gd29yaztcblx0fVxuXG5cdHByaXZhdGUgX2dlbmVyYXRpb25NYXRjaGluZ0Rlc2lyZWRTdGF0ZShlbnRyeTogSUVudHJ5KTogSVByb3Zpc2lvbmFsR2VuZXJhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9IGVudHJ5LmdlbmVyYXRpb247XG5cdFx0Y29uc3QgZGVzaXJlZCA9IHRoaXMuX2NvbXB1dGVFbnRyeVdvcmtpbmdEaXJlY3RvcmllcyhlbnRyeSk7XG5cdFx0cmV0dXJuIGdlbmVyYXRpb25cblx0XHRcdCYmIHRoaXMuX3NhbWVVcmkoZ2VuZXJhdGlvbi53b3JraW5nRGlyZWN0b3J5LCBlbnRyeS53b3JraW5nRGlyZWN0b3J5KVxuXHRcdFx0JiYgdGhpcy5fc2FtZVdvcmtpbmdEaXJlY3RvcmllcyhlbnRyeS5wcm92aWRlciwgZ2VuZXJhdGlvbi53b3JraW5nRGlyZWN0b3JpZXMsIGRlc2lyZWQpXG5cdFx0XHQ/IGdlbmVyYXRpb25cblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2FtZVVyaShmaXJzdDogVVJJIHwgdW5kZWZpbmVkLCBzZWNvbmQ6IFVSSSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmaXJzdCA9PT0gdW5kZWZpbmVkIHx8IHNlY29uZCA9PT0gdW5kZWZpbmVkID8gZmlyc3QgPT09IHNlY29uZCA6IGlzRXF1YWwoZmlyc3QsIHNlY29uZCk7XG5cdH1cblxuXHQvKiogUHJvdmlkZXItYWdub3N0aWM6IG9ubHkgYW4gYWdlbnQgYWR2ZXJ0aXNpbmcgYGltbXV0YWJsZVByaW1hcnlgIHBpbnMgaW5kZXggMC4gKi9cblx0cHJpdmF0ZSBfc2FtZVdvcmtpbmdEaXJlY3Rvcmllcyhwcm92aWRlcjogc3RyaW5nLCBmaXJzdDogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIHNlY29uZDogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gYXJlU2Vzc2lvbldvcmtpbmdEaXJlY3Rvcmllc0VxdWFsKGZpcnN0LCBzZWNvbmQsIGhhc0ltbXV0YWJsZVByaW1hcnlXb3JraW5nRGlyZWN0b3J5KHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlLnZhbHVlLCBwcm92aWRlcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmV3UHJvdmlzaW9uYWxVcmkocHJvdmlkZXI6IHN0cmluZyk6IFVSSSB7XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiBwcm92aWRlciwgcGF0aDogYC8ke2dlbmVyYXRlVXVpZCgpfWAgfSk7XG5cdH1cblxuXHQvKipcblx0ICogRW5zdXJlcyB0aGUgcHVibGlzaGVkIGdlbmVyYXRpb24gcmVhbGl6ZXMgdGhlIGRyYWZ0J3MgY3VycmVudCBmb2xkZXIgYW5kIGNvbmZpZy5cblx0ICogSXQga2VlcHMgdGhlIHByZXZpb3VzIGdlbmVyYXRpb24gaGlkZGVuIHVudGlsIGEgdmFsaWQgY2FuZGlkYXRlIGNhbiByZXBsYWNlIGl0LCBkaXNjYXJkaW5nIHN0YWxlIGNhbmRpZGF0ZXMgYWxvbmcgdGhlIHdheS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlY29uY2lsZUdlbmVyYXRpb24oc2Vzc2lvblJlc291cmNlOiBVUkksIGVudHJ5OiBJRW50cnkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdHdoaWxlICh0aGlzLl9lbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpID09PSBlbnRyeSAmJiAhZW50cnkuZGlzcG9zZWQpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRHZW5lcmF0aW9uID0gdGhpcy5fZ2VuZXJhdGlvbk1hdGNoaW5nRGVzaXJlZFN0YXRlKGVudHJ5KTtcblx0XHRcdGlmIChjdXJyZW50R2VuZXJhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudEdlbmVyYXRpb24uYmFja2VuZFNlc3Npb247XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBlbnRyeS53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY29tcHV0ZUVudHJ5V29ya2luZ0RpcmVjdG9yaWVzKGVudHJ5KTtcblx0XHRcdGNvbnN0IGNvbmZpZ1ZlcnNpb24gPSBlbnRyeS5jb25maWdWZXJzaW9uO1xuXHRcdFx0Y29uc3QgY29uZmlnID0geyAuLi5lbnRyeS5jb25maWcgfTtcblxuXHRcdFx0Ly8gUHJld2FybWluZyBpcyBzaWxlbnQ7IGZpcnN0IFNlbmQgb3ducyBpbnRlcmFjdGl2ZSB0cnVzdCwgc28gbmV2ZXIgY3JlYXRlIGluIGFuIHVudHJ1c3RlZCB0YXJnZXQuXG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2lzVGFyZ2V0Rm9sZGVyVHJ1c3RlZCh3b3JraW5nRGlyZWN0b3J5KSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXRpcmVHZW5lcmF0aW9uKHNlc3Npb25SZXNvdXJjZSwgZW50cnkpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLl9uZXdQcm92aXNpb25hbFVyaShlbnRyeS5wcm92aWRlcik7XG5cdFx0XHRsZXQgY3JlYXRlZDogVVJJO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y3JlYXRlZCA9IGF3YWl0IHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0cHJvdmlkZXI6IGVudHJ5LnByb3ZpZGVyLFxuXHRcdFx0XHRcdHNlc3Npb246IGNhbmRpZGF0ZSxcblx0XHRcdFx0XHRfbWV0YTogdGhpcy5nZXRJbml0aWFsU2Vzc2lvbk1ldGFkYXRhKCksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRcdGNvbmZpZyxcblx0XHRcdFx0XHRwcm9ncmVzc1Rva2VuOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHJvdmlzaW9uYWxdIEZhaWxlZCB0byBjcmVhdGUgcHJvdmlzaW9uYWwgc2Vzc2lvbiBmb3IgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9kaXNwb3NlQmFja2VuZChjYW5kaWRhdGUsICdmYWlsZWQgcHJvdmlzaW9uYWwgY2FuZGlkYXRlJyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JldGlyZUdlbmVyYXRpb24oc2Vzc2lvblJlc291cmNlLCBlbnRyeSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9lbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpICE9PSBlbnRyeVxuXHRcdFx0XHR8fCBlbnRyeS5kaXNwb3NlZFxuXHRcdFx0XHR8fCBlbnRyeS5jb25maWdWZXJzaW9uICE9PSBjb25maWdWZXJzaW9uXG5cdFx0XHRcdHx8ICF0aGlzLl9zYW1lVXJpKGVudHJ5LndvcmtpbmdEaXJlY3RvcnksIHdvcmtpbmdEaXJlY3RvcnkpXG5cdFx0XHRcdHx8ICF0aGlzLl9zYW1lV29ya2luZ0RpcmVjdG9yaWVzKGVudHJ5LnByb3ZpZGVyLCB0aGlzLl9jb21wdXRlRW50cnlXb3JraW5nRGlyZWN0b3JpZXMoZW50cnkpLCB3b3JraW5nRGlyZWN0b3JpZXMpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VCYWNrZW5kKGNyZWF0ZWQsICdvYnNvbGV0ZSBwcm92aXNpb25hbCBjYW5kaWRhdGUnKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByZXZpb3VzID0gZW50cnkuZ2VuZXJhdGlvbjtcblx0XHRcdGVudHJ5LmdlbmVyYXRpb24gPSB7IGJhY2tlbmRTZXNzaW9uOiBjcmVhdGVkLCB3b3JraW5nRGlyZWN0b3J5LCB3b3JraW5nRGlyZWN0b3JpZXMgfTtcblx0XHRcdHRoaXMuX3B1Ymxpc2hBY3RpdmVDbGllbnQoZW50cnkpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VCYWNrZW5kKHByZXZpb3VzLmJhY2tlbmRTZXNzaW9uLCAncmVwbGFjZWQgcHJvdmlzaW9uYWwgZ2VuZXJhdGlvbicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXRpcmVHZW5lcmF0aW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBlbnRyeTogSUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9IGVudHJ5LmdlbmVyYXRpb247XG5cdFx0aWYgKCFnZW5lcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVudHJ5LmdlbmVyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2VudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSkgPT09IGVudHJ5KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VCYWNrZW5kKGdlbmVyYXRpb24uYmFja2VuZFNlc3Npb24sICdyZXRpcmVkIHByb3Zpc2lvbmFsIGdlbmVyYXRpb24nKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3Bvc2VCYWNrZW5kKGJhY2tlbmRTZXNzaW9uOiBVUkksIHJlYXNvbjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fcGVuZGluZ0JhY2tlbmREaXNwb3NhbHMuYWRkKGJhY2tlbmRTZXNzaW9uKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlU2Vzc2lvbihiYWNrZW5kU2Vzc2lvbik7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQmFja2VuZERpc3Bvc2Fscy5kZWxldGUoYmFja2VuZFNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RQcm92aXNpb25hbF0gRmFpbGVkIHRvIGRpc3Bvc2UgJHtyZWFzb259ICR7YmFja2VuZFNlc3Npb24udG9TdHJpbmcoKX06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JldHJ5UGVuZGluZ0JhY2tlbmREaXNwb3NhbHMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBiYWNrZW5kU2Vzc2lvbiBvZiB0aGlzLl9wZW5kaW5nQmFja2VuZERpc3Bvc2Fscykge1xuXHRcdFx0dm9pZCB0aGlzLl9kaXNwb3NlQmFja2VuZChiYWNrZW5kU2Vzc2lvbiwgJ3BlbmRpbmcgcHJvdmlzaW9uYWwgY2xlYW51cCcpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBmb2xkZXIgdGhlIHByb3Zpc2lvbmFsIGFnZW50IHdvdWxkIHJ1biBpbiBpcyB0cnVzdGVkLiBXaGVuIGFcblx0ICogd29ya2luZyBkaXJlY3RvcnkgaXMga25vd24gKGl0IG1heSBiZSBhIHN0YW5kYWxvbmUgZm9sZGVyIG91dHNpZGUgdGhlXG5cdCAqIG9wZW4gd29ya3NwYWNlLCBlLmcuIGEgcGVyLXNlc3Npb24gZm9sZGVyKSwgZ2F0ZSBvbiB0aGF0IGZvbGRlcidzIHRydXN0O1xuXHQgKiBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIHdob2xlLXdvcmtzcGFjZSB0cnVzdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2lzVGFyZ2V0Rm9sZGVyVHJ1c3RlZCh3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAod29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0Y29uc3QgeyB0cnVzdGVkIH0gPSBhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmdldFVyaVRydXN0SW5mbyh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdHJldHVybiB0cnVzdGVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKTtcblx0fVxuXG5cdHRyeVJlYmluZChcblx0XHRvbGRTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRuZXdTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcm92aWRlcjogc3RyaW5nLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBHcmFkdWF0aW9uIG11c3QgcnVuIGFmdGVyIGFueSBxdWV1ZWQgZm9sZGVyIG9yIGNvbmZpZyByZWNvbmNpbGlhdGlvbi5cblx0XHRyZXR1cm4gdGhpcy5fcXVldWUob2xkU2Vzc2lvblJlc291cmNlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbHJlYWR5Qm91bmQgPSB0aGlzLmdldChuZXdTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGFscmVhZHlCb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gYWxyZWFkeUJvdW5kO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvbGRFbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KG9sZFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIW9sZEVudHJ5IHx8IG9sZEVudHJ5LmRpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld0JhY2tlbmRTZXNzaW9uID0gdGhpcy5fdG9CYWNrZW5kVXJpKG5ld1Nlc3Npb25SZXNvdXJjZSwgcHJvdmlkZXIpO1xuXHRcdFx0Ly8gSW1wb3J0cyBtYXRlcmlhbGl6ZSBlYWdlcmx5LCBzbyBjYXJyeSB0aGVpciBoaXN0b3J5IGFuZCBtb2RlbCBpbnRvIHRoZSByZWJvdW5kIHNlc3Npb24uXG5cdFx0XHRjb25zdCBpbXBvcnRlZCA9IHRoaXMuX2ltcG9ydENvbnZlcnNhdGlvblN0b3JlLnRha2UobmV3U2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0d2hpbGUgKHRoaXMuX2VudHJpZXMuZ2V0KG9sZFNlc3Npb25SZXNvdXJjZSkgPT09IG9sZEVudHJ5ICYmICFvbGRFbnRyeS5kaXNwb3NlZCkge1xuXHRcdFx0XHQvLyBUaGUgd29ya2JlbmNoIGNhY2hlIGlzIGF1dGhvcml0YXRpdmU7IGJhY2tlbmQgc3RhdGUgY2FuIGxhZyBzeW5jaHJvbm91cyBjaGlwIGVkaXRzLlxuXHRcdFx0XHRjb25zdCBjb25maWcgPSB7IC4uLm9sZEVudHJ5LmNvbmZpZyB9O1xuXHRcdFx0XHRjb25zdCBjb25maWdWZXJzaW9uID0gb2xkRW50cnkuY29uZmlnVmVyc2lvbjtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0V29ya2luZ0RpcmVjdG9yeSA9IG9sZEVudHJ5LndvcmtpbmdEaXJlY3RvcnkgPz8gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdFx0aWYgKCFvbGRFbnRyeS51c2VzV29ya3NwYWNlUm9vdFNldCAmJiAodGhpcy5fY29tcHV0ZVdvcmtpbmdEaXJlY3Rvcmllcyh0YXJnZXRXb3JraW5nRGlyZWN0b3J5LCBwcm92aWRlcik/Lmxlbmd0aCA/PyAwKSA+IDEpIHtcblx0XHRcdFx0XHRvbGRFbnRyeS51c2VzV29ya3NwYWNlUm9vdFNldCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGFyZ2V0V29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY29tcHV0ZUVudHJ5V29ya2luZ0RpcmVjdG9yaWVzKG9sZEVudHJ5KTtcblx0XHRcdFx0bGV0IGNyZWF0ZWQ6IFVSSTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjcmVhdGVkID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0c2Vzc2lvbjogbmV3QmFja2VuZFNlc3Npb24sXG5cdFx0XHRcdFx0XHRfbWV0YTogdGhpcy5nZXRJbml0aWFsU2Vzc2lvbk1ldGFkYXRhKCksXG5cdFx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHRhcmdldFdvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdFx0XHRcdGNvbmZpZyxcblx0XHRcdFx0XHRcdC4uLihpbXBvcnRlZCA/IHsgbW9kZWw6IGltcG9ydGVkLm1vZGVsLCBpbXBvcnRDb252ZXJzYXRpb246IHsgdHVybnM6IGltcG9ydGVkLnR1cm5zLCBtb2RlbDogaW1wb3J0ZWQubW9kZWwgfSB9IDoge30pLFxuXHRcdFx0XHRcdFx0cHJvZ3Jlc3NUb2tlbjogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFByb3Zpc2lvbmFsXSBGYWlsZWQgdG8gY3JlYXRlIHJlYm91bmQgcHJvdmlzaW9uYWw6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc3RvcmVJbXBvcnRlZENvbnZlcnNhdGlvbihuZXdTZXNzaW9uUmVzb3VyY2UsIGltcG9ydGVkKTtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NlZCA9IGF3YWl0IHRoaXMuX2Rpc3Bvc2VCYWNrZW5kKG5ld0JhY2tlbmRTZXNzaW9uLCAnZmFpbGVkIHJlYm91bmQgY2FuZGlkYXRlJyk7XG5cdFx0XHRcdFx0aWYgKCFkaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3Qgc2FmZWx5IHJlY292ZXIgcmVib3VuZCBzZXNzaW9uICR7bmV3QmFja2VuZFNlc3Npb24udG9TdHJpbmcoKX0gdW50aWwgaXRzIGNhbmRpZGF0ZSBpcyByZXRpcmVkYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5fZW50cmllcy5nZXQob2xkU2Vzc2lvblJlc291cmNlKSAhPT0gb2xkRW50cnkgfHwgb2xkRW50cnkuZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NlZCA9IGF3YWl0IHRoaXMuX2Rpc3Bvc2VCYWNrZW5kKGNyZWF0ZWQsICdyZXRpcmVkIHJlYm91bmQgY2FuZGlkYXRlJyk7XG5cdFx0XHRcdFx0dGhpcy5fcmVzdG9yZUltcG9ydGVkQ29udmVyc2F0aW9uKG5ld1Nlc3Npb25SZXNvdXJjZSwgaW1wb3J0ZWQpO1xuXHRcdFx0XHRcdGlmICghZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHNhZmVseSByZWNvdmVyIHJlYm91bmQgc2Vzc2lvbiAke25ld0JhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCl9IHVudGlsIGl0cyBjYW5kaWRhdGUgaXMgcmV0aXJlZGApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvbGRFbnRyeS5jb25maWdWZXJzaW9uICE9PSBjb25maWdWZXJzaW9uXG5cdFx0XHRcdFx0fHwgIXRoaXMuX3NhbWVVcmkob2xkRW50cnkud29ya2luZ0RpcmVjdG9yeSA/PyB3b3JraW5nRGlyZWN0b3J5LCB0YXJnZXRXb3JraW5nRGlyZWN0b3J5KVxuXHRcdFx0XHRcdHx8ICF0aGlzLl9zYW1lV29ya2luZ0RpcmVjdG9yaWVzKG9sZEVudHJ5LnByb3ZpZGVyLCB0aGlzLl9jb21wdXRlRW50cnlXb3JraW5nRGlyZWN0b3JpZXMob2xkRW50cnkpLCB0YXJnZXRXb3JraW5nRGlyZWN0b3JpZXMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zZWQgPSBhd2FpdCB0aGlzLl9kaXNwb3NlQmFja2VuZChjcmVhdGVkLCAnb2Jzb2xldGUgcmVib3VuZCBjYW5kaWRhdGUnKTtcblx0XHRcdFx0XHRpZiAoIWRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXN0b3JlSW1wb3J0ZWRDb252ZXJzYXRpb24obmV3U2Vzc2lvblJlc291cmNlLCBpbXBvcnRlZCk7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBzYWZlbHkgcmV0cnkgcmVib3VuZCBzZXNzaW9uICR7bmV3QmFja2VuZFNlc3Npb24udG9TdHJpbmcoKX0gdW50aWwgaXRzIHN0YWxlIGNhbmRpZGF0ZSBpcyByZXRpcmVkYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgb2xkR2VuZXJhdGlvbiA9IG9sZEVudHJ5LmdlbmVyYXRpb247XG5cdFx0XHRcdC8vIFB1Ymxpc2ggdGhlIHJlYWwgbWFwcGluZyBiZWZvcmUgcmV0aXJpbmcgdGhlIHVudGl0bGVkIGVudHJ5IHNvIGNvbnN1bWVycyBuZXZlciBvYnNlcnZlIGEgcGFydGlhbCBzd2FwLlxuXHRcdFx0XHRjb25zdCBuZXdFbnRyeSA9IHRoaXMuX2NyZWF0ZUVudHJ5KHByb3ZpZGVyLCBjb25maWcsIGNvbmZpZ1ZlcnNpb24sIHRhcmdldFdvcmtpbmdEaXJlY3RvcnksIG9sZEVudHJ5LnJlc29sdmVkQ29uZmlnKTtcblx0XHRcdFx0bmV3RW50cnkudXNlc1dvcmtzcGFjZVJvb3RTZXQgPSBvbGRFbnRyeS51c2VzV29ya3NwYWNlUm9vdFNldDtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQWN0aXZlQ2xpZW50U2NvcGUobmV3RW50cnkpO1xuXHRcdFx0XHRuZXdFbnRyeS5nZW5lcmF0aW9uID0geyBiYWNrZW5kU2Vzc2lvbjogY3JlYXRlZCwgd29ya2luZ0RpcmVjdG9yeTogdGFyZ2V0V29ya2luZ0RpcmVjdG9yeSwgd29ya2luZ0RpcmVjdG9yaWVzOiB0YXJnZXRXb3JraW5nRGlyZWN0b3JpZXMgfTtcblx0XHRcdFx0dGhpcy5fZW50cmllcy5zZXQobmV3U2Vzc2lvblJlc291cmNlLCBuZXdFbnRyeSk7XG5cdFx0XHRcdHRoaXMuX3B1Ymxpc2hBY3RpdmVDbGllbnQobmV3RW50cnkpO1xuXHRcdFx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShvbGRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRvbGRFbnRyeS5kaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdG9sZEVudHJ5LmFjdGl2ZUNsaWVudEJpbmRpbmcuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlZENvbmZpZ3MuZGVsZXRlKG9sZFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVkQ29uZmlnUmVxdWVzdFNlcS5kZWxldGUob2xkU2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fcmVib3VuZC5hZGQob2xkU2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0Ly8gTm90aWZ5IG9ubHkgdGhlIHJlYWwgcmVzb3VyY2U7IG5vdGlmeWluZyB0aGUgb2xkIFVSSSBjYW4gcmVjcmVhdGUgYW4gb3JwaGFuIHdoaWxlIHRoZSB3aWRnZXQgc3RpbGwgdXNlcyBpdC5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShuZXdTZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRcdGlmIChvbGRHZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gVGhlIHRlbXBvcmFyeSBnZW5lcmF0aW9uIGlzIGluLW1lbW9yeSBvbmx5LCBzbyBkaXNwb3NhbCBpcyBiZXN0LWVmZm9ydC5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9kaXNwb3NlQmFja2VuZChvbGRHZW5lcmF0aW9uLmJhY2tlbmRTZXNzaW9uLCAndGVtcG9yYXJ5IHByb3Zpc2lvbmFsIGdlbmVyYXRpb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Jlc3RvcmVJbXBvcnRlZENvbnZlcnNhdGlvbihuZXdTZXNzaW9uUmVzb3VyY2UsIGltcG9ydGVkKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlSW1wb3J0ZWRDb252ZXJzYXRpb24oc2Vzc2lvblJlc291cmNlOiBVUkksIGltcG9ydGVkOiBJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGltcG9ydGVkKSB7XG5cdFx0XHR0aGlzLl9pbXBvcnRDb252ZXJzYXRpb25TdG9yZS5zZXQoc2Vzc2lvblJlc291cmNlLCBpbXBvcnRlZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY3JlYXRlIHRoZSBwcm92aXNpb25hbCBiYWNrZW5kIHNlc3Npb24gZm9yIGBzZXNzaW9uUmVzb3VyY2VgIGF0IGEgbmV3XG5cdCAqIHdvcmtpbmcgZGlyZWN0b3J5LCBwcmVzZXJ2aW5nIHRoZSB1c2VyJ3MgY29uZmlnIGNob2ljZXMuIEEgY3JlYXRlZFxuXHQgKiBzZXNzaW9uJ3MgY3dkIGlzIGltbXV0YWJsZSwgc28gdGhlIG9ubHkgd2F5IHRvIGhvbm9yIGEgZm9sZGVyIGNoYW5nZSBpcyB0b1xuXHQgKiBkaXNwb3NlIGFuZCByZWNyZWF0ZS4gVGhlIHJlcGxhY2VtZW50IHVzZXMgYSBmcmVzaCBiYWNrZW5kIFVSSSBzbyBleGlzdGluZ1xuXHQgKiBzdWJzY3JpYmVycyBhY3F1aXJlIGFuIGF1dGhvcml0YXRpdmUgc25hcHNob3QgZm9yIHRoZSBuZXcgaW5jYXJuYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9jaGFuZ2VXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZTogVVJJLCBuZXdXb3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFlbnRyeSB8fCBlbnRyeS5kaXNwb3NlZCB8fCB0aGlzLl9zYW1lVXJpKGVudHJ5LndvcmtpbmdEaXJlY3RvcnksIG5ld1dvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdGVudHJ5LndvcmtpbmdEaXJlY3RvcnkgPSBuZXdXb3JraW5nRGlyZWN0b3J5O1xuXHRcdGVudHJ5LnVzZXNXb3Jrc3BhY2VSb290U2V0ID0gKHRoaXMuX2NvbXB1dGVXb3JraW5nRGlyZWN0b3JpZXMobmV3V29ya2luZ0RpcmVjdG9yeSwgZW50cnkucHJvdmlkZXIpPy5sZW5ndGggPz8gMCkgPiAxO1xuXHRcdHRoaXMuX3VwZGF0ZUFjdGl2ZUNsaWVudFNjb3BlKGVudHJ5KTtcblx0XHRlbnRyeS5jb25maWdWZXJzaW9uKys7XG5cdFx0ZW50cnkucmVzb2x2ZWRDb25maWcgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgd29yayA9IHRoaXMuX3F1ZXVlKHNlc3Npb25SZXNvdXJjZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSkgIT09IGVudHJ5IHx8IGVudHJ5LmRpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLl9yZWNvbmNpbGVHZW5lcmF0aW9uKHNlc3Npb25SZXNvdXJjZSwgZW50cnkpO1xuXHRcdFx0aWYgKCFiYWNrZW5kKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFJlLXJlc29sdmUgY29uZmlnIGFnYWluc3QgdGhlIG5ldyBjd2Qgc28gY2hpcCBzY2hlbWFzIHJlZnJlc2guXG5cdFx0XHRjb25zdCBjb25maWdWZXJzaW9uID0gZW50cnkuY29uZmlnVmVyc2lvbjtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBlbnRyeS53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdFx0XHRwcm92aWRlcjogZW50cnkucHJvdmlkZXIsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRjb25maWc6IHsgLi4uZW50cnkuY29uZmlnIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAodGhpcy5fZW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKSA9PT0gZW50cnkgJiYgIWVudHJ5LmRpc3Bvc2VkICYmIGVudHJ5LmNvbmZpZ1ZlcnNpb24gPT09IGNvbmZpZ1ZlcnNpb24gJiYgdGhpcy5fc2FtZVVyaShlbnRyeS53b3JraW5nRGlyZWN0b3J5LCB3b3JraW5nRGlyZWN0b3J5KSkge1xuXHRcdFx0XHRcdGVudHJ5LmNvbmZpZyA9IHsgLi4uZW50cnkuY29uZmlnLCAuLi5yZXNvbHZlZC52YWx1ZXMgfTtcblx0XHRcdFx0XHRlbnRyeS5yZXNvbHZlZENvbmZpZyA9IHJlc29sdmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHJvdmlzaW9uYWxdIHNjaGVtYSByZS1yZXNvbHZlIGFmdGVyIGN3ZCBjaGFuZ2UgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9KTtcblx0XHQvLyBSZWdpc3RlciBwZW5kaW5nIHdvcmsgYmVmb3JlIG5vdGlmeWluZyBiZWNhdXNlIGxpc3RlbmVycyBjYW4gc3luY2hyb25vdXNseSB3YWl0IG9yIHJlYWNxdWlyZS5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHdvcms7XG5cdH1cblxuXHRkaXNwb3NlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9yZXNvbHZlZENvbmZpZ3MuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRDb25maWdSZXF1ZXN0U2VxLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0ZW50cnkuZGlzcG9zZWQgPSB0cnVlO1xuXHRcdGVudHJ5LmFjdGl2ZUNsaWVudEJpbmRpbmcuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHJldHVybiB0aGlzLl9xdWV1ZShzZXNzaW9uUmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChlbnRyeS5nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VCYWNrZW5kKGVudHJ5LmdlbmVyYXRpb24uYmFja2VuZFNlc3Npb24sICdwcm92aXNpb25hbCBnZW5lcmF0aW9uJyk7XG5cdFx0XHRcdGVudHJ5LmdlbmVyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIEZpcmUtYW5kLWZvcmdldCBjbGVhbnVwIGZvciBhbnkgcHJvdmlzaW9uYWxzIHN0aWxsIHRyYWNrZWQuIEF2b2lkXG5cdFx0Ly8gYXdhaXRpbmcgaW4gYGRpc3Bvc2UoKWAgdG8ga2VlcCB3b3JrYmVuY2ggdGVhcmRvd24gc3luY2hyb25vdXMuXG5cdFx0Zm9yIChjb25zdCBbLCBlbnRyeV0gb2YgdGhpcy5fZW50cmllcykge1xuXHRcdFx0ZW50cnkuZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0ZW50cnkuYWN0aXZlQ2xpZW50QmluZGluZy5kaXNwb3NlKCk7XG5cdFx0XHRpZiAoZW50cnkuZ2VuZXJhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VTZXNzaW9uKGVudHJ5LmdlbmVyYXRpb24uYmFja2VuZFNlc3Npb24pLmNhdGNoKCgpID0+IHsgLyogc3dhbGxvdyBvbiBzaHV0ZG93biAqLyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBiYWNrZW5kU2Vzc2lvbiBvZiB0aGlzLl9wZW5kaW5nQmFja2VuZERpc3Bvc2Fscykge1xuXHRcdFx0dGhpcy5fYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlU2Vzc2lvbihiYWNrZW5kU2Vzc2lvbikuY2F0Y2goKCkgPT4geyAvKiBzd2FsbG93IG9uIHNodXRkb3duICovIH0pO1xuXHRcdH1cblx0XHR0aGlzLl9lbnRyaWVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcGVuZGluZy5jbGVhcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdCYWNrZW5kRGlzcG9zYWxzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRDb25maWdzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRDb25maWdSZXF1ZXN0U2VxLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVib3VuZC5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0IHRoZSBjaGF0LWlucHV0IFVJIHNlc3Npb24gVVJJIChgYWdlbnQtaG9zdC1QUk9WSURFUjovPGlkPmApXG5cdCAqIHRvIHRoZSBhZ2VudC1ob3N0IGJhY2tlbmQgVVJJIChgUFJPVklERVI6LzxpZD5gKS5cblx0ICovXG5cdHByaXZhdGUgX3RvQmFja2VuZFVyaShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcHJvdmlkZXI6IHN0cmluZyk6IFVSSSB7XG5cdFx0Y29uc3QgcmF3SWQgPSBzZXNzaW9uUmVzb3VyY2UucGF0aC5yZXBsYWNlKC9eXFwvLywgJycpO1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogcHJvdmlkZXIsIHBhdGg6IGAvJHtyYXdJZH1gIH0pO1xuXHR9XG5cblx0Z2V0UmVzb2x2ZWRDb25maWcoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk/LnJlc29sdmVkQ29uZmlnID8/IHRoaXMuX3Jlc29sdmVkQ29uZmlncy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2hSZXNvbHZlZENvbmZpZyhcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcm92aWRlcjogc3RyaW5nLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXEgPSAodGhpcy5fcmVzb2x2ZWRDb25maWdSZXF1ZXN0U2VxLmdldChzZXNzaW9uUmVzb3VyY2UpID8/IDApICsgMTtcblx0XHR0aGlzLl9yZXNvbHZlZENvbmZpZ1JlcXVlc3RTZXEuc2V0KHNlc3Npb25SZXNvdXJjZSwgc2VxKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdGNvbmZpZyxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHRoaXMuX3Jlc29sdmVkQ29uZmlnUmVxdWVzdFNlcS5nZXQoc2Vzc2lvblJlc291cmNlKSAhPT0gc2VxKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRlbnRyeS5jb25maWcgPSB7IC4uLmVudHJ5LmNvbmZpZywgLi4ucmVzb2x2ZWQudmFsdWVzIH07XG5cdFx0XHRcdGVudHJ5LnJlc29sdmVkQ29uZmlnID0gcmVzb2x2ZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlZENvbmZpZ3Muc2V0KHNlc3Npb25SZXNvdXJjZSwgcmVzb2x2ZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHJvdmlzaW9uYWxdIHNjaGVtYSByZS1yZXNvbHZlIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYXBwbHlDb25maWdDaGFuZ2UoXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cHJvdmlkZXI6IHN0cmluZyxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cGFydGlhbDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnN1cmVFbnRyeShzZXNzaW9uUmVzb3VyY2UsIHByb3ZpZGVyLCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBGcmVzaCBlbnRyaWVzIGFscmVhZHkgY29udGFpbiBkZWZhdWx0czsgYXBwbHkgdGhlIHVzZXIncyBwYXJ0aWFsIG9uIHRvcC5cblx0XHQvLyBNdXRhdGUgYmVmb3JlIHF1ZXVlaW5nIHNvIGEgcmFjaW5nIHRyeVJlYmluZCBzZWVzIHRoZSBsYXRlc3QgY29uZmlnLlxuXHRcdE9iamVjdC5hc3NpZ24oZW50cnkuY29uZmlnLCBwYXJ0aWFsKTtcblx0XHRlbnRyeS5jb25maWdWZXJzaW9uKys7XG5cdFx0Ly8gS2VlcCBvdmVybGF5IHZhbHVlcyBjdXJyZW50IHdoaWxlIHNjaGVtYSByZS1yZXNvbHV0aW9uIGlzIHBlbmRpbmcuXG5cdFx0aWYgKGVudHJ5LnJlc29sdmVkQ29uZmlnKSB7XG5cdFx0XHRlbnRyeS5yZXNvbHZlZENvbmZpZyA9IHtcblx0XHRcdFx0Li4uZW50cnkucmVzb2x2ZWRDb25maWcsXG5cdFx0XHRcdHZhbHVlczogeyAuLi5lbnRyeS5yZXNvbHZlZENvbmZpZy52YWx1ZXMsIC4uLnBhcnRpYWwgfSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gU2VyaWFsaXplIGRpc3BhdGNoIGFuZCByZS1yZXNvbHV0aW9uIHNvIHJhY2luZyBjaGlwIGNoYW5nZXMgc2V0dGxlIGluIG9yZGVyLlxuXHRcdHJldHVybiB0aGlzLl9xdWV1ZShzZXNzaW9uUmVzb3VyY2UsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9lbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpICE9PSBlbnRyeSB8fCBlbnRyeS5kaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuX3JlY29uY2lsZUdlbmVyYXRpb24oc2Vzc2lvblJlc291cmNlLCBlbnRyeSk7XG5cdFx0XHRpZiAoIWJhY2tlbmQgfHwgdGhpcy5fZW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKSAhPT0gZW50cnkgfHwgZW50cnkuZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuZGlzcGF0Y2goYmFja2VuZC50b1N0cmluZygpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogcGFydGlhbCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29uZmlnVmVyc2lvbiA9IGVudHJ5LmNvbmZpZ1ZlcnNpb247XG5cdFx0XHRjb25zdCByZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPSBlbnRyeS53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdFx0Y29uZmlnOiB7IC4uLmVudHJ5LmNvbmZpZyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3Qgc3RpbGxDdXJyZW50ID0gdGhpcy5fZW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKHN0aWxsQ3VycmVudCA9PT0gZW50cnkgJiYgIWVudHJ5LmRpc3Bvc2VkICYmIGVudHJ5LmNvbmZpZ1ZlcnNpb24gPT09IGNvbmZpZ1ZlcnNpb24gJiYgdGhpcy5fc2FtZVVyaShlbnRyeS53b3JraW5nRGlyZWN0b3J5LCByZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRWYWx1ZXMgPSB7IC4uLnJlc29sdmVkLnZhbHVlcyB9O1xuXHRcdFx0XHRcdC8vIE1lcmdlIHJlc29sdmVkIHZhbHVlcyBpbnRvIGVudHJ5LmNvbmZpZyBzbyBhIGxhdGVyIGB0cnlSZWJpbmRgXG5cdFx0XHRcdFx0Ly8gbWF0ZXJpYWxpemVzIHRoZSBiYWNrZW5kIHNlc3Npb24gd2l0aCB0aGUgdmFsaWRhdGVkIGNvbmZpZ3VyYXRpb25cblx0XHRcdFx0XHQvLyB0aGUgVUkgaXMgZGlzcGxheWluZy4gTWVyZ2UgKG5vdCByZXBsYWNlKSBzbyBhbnkga2V5cyB0aGUgc2NoZW1hXG5cdFx0XHRcdFx0Ly8gZG9lc24ndCBrbm93IGFib3V0IHN1cnZpdmUuXG5cdFx0XHRcdFx0Y29uc3QgbWVyZ2VkQ29uZmlnID0geyAuLi5lbnRyeS5jb25maWcsIC4uLnJlc29sdmVkVmFsdWVzIH07XG5cdFx0XHRcdFx0Y29uc3QgY29uZmlnQ2hhbmdlZCA9ICFlcXVhbHMoZW50cnkuY29uZmlnLCBtZXJnZWRDb25maWcpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkQ2hhbmdlZCA9ICFlcXVhbHMoZW50cnkucmVzb2x2ZWRDb25maWcsIHJlc29sdmVkKTtcblx0XHRcdFx0XHRpZiAoY29uZmlnQ2hhbmdlZCB8fCByZXNvbHZlZENoYW5nZWQpIHtcblx0XHRcdFx0XHRcdGVudHJ5LmNvbmZpZyA9IG1lcmdlZENvbmZpZztcblx0XHRcdFx0XHRcdGVudHJ5LnJlc29sdmVkQ29uZmlnID0gcmVzb2x2ZWQ7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHJvdmlzaW9uYWxdIHNjaGVtYSByZS1yZXNvbHZlIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYmFja2VuZDtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXb3JrYmVuY2gtc2lkZSBpbml0aWFsIGNvbmZpZyBzZWVkIHNlbnQgYXQgYGNyZWF0ZVNlc3Npb25gIHRpbWUgc28gdGhlXG5cdCAqIGFnZW50J3Mgb3duIHNlcnZlci1zaWRlIGRlZmF1bHRzIGRvbid0IGZpbGwgYHN0YXRlLmNvbmZpZy52YWx1ZXNgIGZvclxuXHQgKiBrZXlzIHRoZSB3b3JrYmVuY2ggd2FudHMgdG8gY29udHJvbC4gV2l0aG91dCB0aGlzLCB0aGUgbWVyZ2UgZmlsdGVyIGluXG5cdCAqIGBhZ2VudEhvc3RTZXNzaW9uSGFuZGxlcmAgc2VlcyB0aG9zZSBhZ2VudCBkZWZhdWx0cyBhcyBcInVzZXItc2V0XCIgYW5kXG5cdCAqIGRyb3BzIHRoZSB3b3JrYmVuY2ggZGVmYXVsdHMuXG5cdCAqXG5cdCAqIC0gYGlzb2xhdGlvbmA6IHdvcmtiZW5jaCBoYXMgbm8gaXNvbGF0aW9uIHBpY2tlciwgc28gYWx3YXlzIGAnZm9sZGVyJ2AuXG5cdCAqIC0gYG1vZGVgIC8gYGF1dG9BcHByb3ZlYDogc2VlZGVkIGZyb20gdGhlIHNpbmdsZVxuXHQgKiAgIGBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uYCBvYmplY3Qgc2V0dGluZyAoYG1vZGVgIGFuZFxuXHQgKiAgIGBhcHByb3ZhbHNgIHByb3BlcnRpZXMpLiBUaGUgYXBwcm92YWwgc2VlZCBpcyBjbGFtcGVkIHRvIGAnZGVmYXVsdCdgXG5cdCAqICAgd2hlbiB0aGUgYGNoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlYCBwb2xpY3kgaXMgb2ZmLiBUaGUgbG9jYWwtb25seVxuXHQgKiAgIGBjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHRgIHNldHRpbmcgaXMgTk9UIHVzZWQuXG5cdCAqXG5cdCAqIFNraXBwZWQgZW50aXJlbHkgaW4gdGhlIEFnZW50cyB3aW5kb3csIHdoZXJlIHRoZSBzZXNzaW9ucyBwcm92aWRlclxuXHQgKiBzdXBwbGllcyBjb25maWcgdmlhIGByZXF1ZXN0LmFnZW50SG9zdFNlc3Npb25Db25maWdgIGluc3RlYWQuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRJbml0aWFsQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICdmb2xkZXInIH07XG5cblx0XHRjb25zdCBjb25maWd1cmVkRGVmYXVsdHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJQ2hhdERlZmF1bHRDb25maWd1cmF0aW9uPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0Q29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgcG9saWN5VmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKS5wb2xpY3lWYWx1ZTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRBcHByb3ZhbHMgPSBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uKGNvbmZpZ3VyZWREZWZhdWx0cz8uYXBwcm92YWxzKTtcblx0XHRpZiAoY29uZmlndXJlZEFwcHJvdmFscykge1xuXHRcdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IHBvbGljeVZhbHVlID09PSBmYWxzZTtcblx0XHRcdC8vIEJ5cGFzcyBhbmQgKGxlZ2FjeSkgQXV0b3BpbG90IGF1dG8tYXBwcm92ZSBhdCBsZWFzdCBzb21lIHRvb2xcblx0XHRcdC8vIGNhbGxzLCBzbyBjbGFtcCBhbnl0aGluZyBidXQgRGVmYXVsdCB1bmRlciBwb2xpY3kuXG5cdFx0XHRjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV0gPSBwb2xpY3lSZXN0cmljdGVkICYmIGNvbmZpZ3VyZWRBcHByb3ZhbHMgIT09ICdkZWZhdWx0JyA/ICdkZWZhdWx0JyA6IGNvbmZpZ3VyZWRBcHByb3ZhbHM7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJlZE1vZGUgPSBjb25maWd1cmVkRGVmYXVsdHM/Lm1vZGU7XG5cdFx0aWYgKHR5cGVvZiBjb25maWd1cmVkTW9kZSA9PT0gJ3N0cmluZycgJiYgS05PV05fTU9ERV9WQUxVRVMuaGFzKGNvbmZpZ3VyZWRNb2RlKSkge1xuXHRcdFx0Y29uZmlnW1Nlc3Npb25Db25maWdLZXkuTW9kZV0gPSBjb25maWd1cmVkTW9kZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyhjb25maWcpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKFxuXHRJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLFxuXHRBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsXG5cdEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQsXG4pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFrREEsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUNwRCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFT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
