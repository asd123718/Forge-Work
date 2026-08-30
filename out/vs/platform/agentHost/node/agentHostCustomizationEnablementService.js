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
import { Emitter } from "../../../base/common/event.js";
import { Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { AgentSession } from "../common/agentService.js";
import { ISessionDataService } from "../common/sessionDataService.js";
import { DEFAULT_CUSTOMIZATION_ENABLED, isCustomizationEnabled, sortCustomizationEnablement, withCustomizationEnablement } from "../common/customizationEnablement.js";
import { isAhpChatChannel, parseRequiredSessionUriFromChatUri, readSessionWorkspaceless } from "../common/state/sessionState.js";
import { ActionType } from "../common/state/protocol/common/actions.js";
import { CustomizationEnablementKind, CustomizationType } from "../common/state/protocol/channels-session/state.js";
import { IAgentHostStorageService } from "./agentHostStorageService.js";
import { getEffectiveWorkingDirectories } from "./agentConfigurationService.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
const STORAGE_KEY = "customizationEnablement";
const LRU_STORAGE_KEY = "customizationEnablementLru";
const SESSION_METADATA_KEY = "customizationEnablement";
const MAX_PERSISTED_DECISIONS = 512;
const IAgentHostCustomizationEnablementService = createDecorator("agentHostCustomizationEnablementService");
function getCustomizationEnablementKey(target, kind) {
  if (kind === CustomizationEnablementKind.Session) {
    return target.id;
  }
  switch (target.type) {
    case CustomizationType.Plugin:
      return target.source.toString();
    case CustomizationType.McpServer:
      return target.owningPluginSource ? `${target.owningPluginSource.toString()}#mcp=${target.name}` : `mcpServers#${target.name}`;
    default:
      throw new Error(`Enablement is only supported for plugins and MCP servers, not ${target.type}`);
  }
}
function targetForUnownedMcpServer(name) {
  return {
    id: `mcpServers#${name}`,
    type: CustomizationType.McpServer,
    name,
    source: URI.parse(`mcpServers#${name}`)
  };
}
let AgentHostCustomizationEnablementService = class extends Disposable {
  constructor(_storageService, _sessionDataService, _sessionState, _logService) {
    super();
    this._storageService = _storageService;
    this._sessionDataService = _sessionDataService;
    this._sessionState = _sessionState;
    this._logService = _logService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._clientGlobalEnablement = /* @__PURE__ */ new Map();
    /**
     * Loaded once and authoritative for synchronous resolution, which runs while customizations are published.
     * An async read here could mistake an unavailable result for an absent decision.
     */
    this._sessionEnablement = /* @__PURE__ */ new Map();
    this._sessionLoads = /* @__PURE__ */ new Map();
    this._sessionsById = /* @__PURE__ */ new Map();
    this._pendingSessionWrites = /* @__PURE__ */ new Set();
    /**
     * Retains writes made before session metadata or directory registration resolves.
     * Replayed after either session load or a working-directory event, while resolution reports `pending` rather than no decision.
     */
    this._pendingReplacements = /* @__PURE__ */ new Map();
    this._worktreePendingListener = this._register(new MutableDisposable());
    this._persistent = this._readPersistentEnablement();
    this._lru = this._readLru();
    this._reconcileLru();
    this._register(this._sessionState.onDidEmitEnvelope((envelope) => {
      const session = isAhpChatChannel(envelope.channel) ? parseRequiredSessionUriFromChatUri(envelope.channel) : this._sessionState.getSessionSummary(envelope.channel) ? envelope.channel : void 0;
      if (session !== void 0) {
        this._sessionsById.set(AgentSession.id(session), session);
        void this.initializeSession(session);
        if (envelope.action.type === ActionType.SessionWorkingDirectorySet || envelope.action.type === ActionType.SessionWorkingDirectoryRemoved) {
          const affectedSessions = this._applyPendingReplacements(session);
          affectedSessions.add(session);
          this._notifyDecisionChanged(affectedSessions);
        }
      }
    }));
  }
  /** Bound after AgentService construction because WorktreeIsolation depends on ICopilotApiService and AgentService's endpoint service. */
  setWorktreeIsolation(worktree) {
    this._worktree = worktree;
    const onDidChangeWorkingDirectoryPending = worktree.onDidChangeWorkingDirectoryPending;
    this._worktreePendingListener.value = onDidChangeWorkingDirectoryPending?.((sessionId) => {
      const session = this._sessionsById.get(sessionId);
      if (session === void 0) {
        return;
      }
      this._notifyDecisionChanged([session]);
    });
  }
  async initializeSession(session) {
    const existing = this._sessionLoads.get(session);
    if (existing) {
      return existing;
    }
    this._sessionsById.set(AgentSession.id(session), session);
    const load = this._loadSessionEnablement(session);
    this._sessionLoads.set(session, load);
    return load;
  }
  getWorkingDirectoryState(session) {
    const summary = this._sessionState.getSessionSummary(session);
    if (readSessionWorkspaceless(summary?._meta)) {
      return { kind: "workspaceless" };
    }
    if (this._worktree?.isWorkingDirectoryPending(AgentSession.id(session))) {
      return { kind: "pending" };
    }
    const directory = getEffectiveWorkingDirectories(this._sessionState, session)?.[0];
    if (directory === void 0) {
      return { kind: "pending" };
    }
    return { kind: "directory", uri: URI.parse(directory) };
  }
  resolve(session, target) {
    const sessionEnablement = this._sessionEnablement.get(session);
    if (sessionEnablement === void 0) {
      return { kind: "pending", reason: "session" };
    }
    const workingDirectory = this.getWorkingDirectoryState(session);
    if (workingDirectory.kind === "pending") {
      return { kind: "pending", reason: "workingDirectory" };
    }
    const persistentKey = this._persistentKey(target);
    const decisions = [];
    const sessionDecision = sessionEnablement.get(this._sessionKey(target));
    if (sessionDecision !== void 0) {
      decisions.push({ kind: CustomizationEnablementKind.Session, enabled: sessionDecision });
    }
    if (workingDirectory.kind === "directory") {
      const workspaceDecision = this._persistent.workingDirectories?.[workingDirectory.uri.toString()]?.[persistentKey];
      if (workspaceDecision !== void 0) {
        decisions.push({ kind: CustomizationEnablementKind.Workspace, uri: workingDirectory.uri.toString(), enabled: workspaceDecision });
      }
    }
    const globalDecision = this._persistent.global?.[persistentKey];
    if (globalDecision !== void 0) {
      decisions.push({ kind: CustomizationEnablementKind.Global, enabled: globalDecision });
    } else {
      const clientGlobalDecision = this._clientGlobalEnablement.get(session)?.get(persistentKey);
      if (clientGlobalDecision !== void 0) {
        decisions.push({ kind: CustomizationEnablementKind.Global, enabled: clientGlobalDecision });
      }
    }
    const enablement = sortCustomizationEnablement(decisions);
    return {
      kind: "resolved",
      enablement,
      enabled: isCustomizationEnabled({ enablement }),
      workingDirectory
    };
  }
  applyClientGlobalEnablement(session, target, enablement) {
    const global = enablement.find((entry) => entry.kind === CustomizationEnablementKind.Global);
    if (global === void 0) {
      throw new Error(`Client customization ${target.source.toString()} is missing its required global enablement entry`);
    }
    if (!target.isClientBundled) {
      return this.resolve(session, target);
    }
    this._setClientGlobal(session, target, global.enabled);
    return this.resolve(session, target);
  }
  setEnablement(session, target, kind, enabled) {
    const before = this._captureDecisionSnapshot(session, target);
    const resolution = this._replaceEnablement(session, target, { replacementKind: "scoped", scope: kind, enabled });
    this._notifyDecisionChanged(this._getAffectedSessions(session, target, before));
    return resolution;
  }
  replaceEnablement(session, target, enablement) {
    const before = this._captureDecisionSnapshot(session, target);
    const resolution = this._replaceEnablement(session, target, { replacementKind: "full", enablement });
    this._notifyDecisionChanged(this._getAffectedSessions(session, target, before));
    return resolution;
  }
  _replaceEnablement(session, target, replacement) {
    const resolution = this.resolve(session, target);
    if (resolution.kind === "pending") {
      if (replacement.replacementKind === "full") {
        this._setGlobal(session, target, this._getGlobalReplacement(replacement.enablement));
        this._queueReplacement(session, target, replacement);
      } else if (replacement.scope === CustomizationEnablementKind.Global) {
        this._setGlobal(session, target, replacement.enabled);
        if (this._pendingReplacements.has(`${session}\0${this._persistentKey(target)}`)) {
          this._queueReplacement(session, target, replacement);
        }
      } else {
        this._queueReplacement(session, target, replacement);
      }
      return resolution;
    }
    const enablement = this._replacementEnablement(resolution.enablement, resolution.workingDirectory, replacement);
    this._applyReplacement(session, target, enablement, resolution.workingDirectory);
    return this.resolve(session, target);
  }
  _applyPendingReplacements(session) {
    const affectedSessions = /* @__PURE__ */ new Set();
    for (const [key, replacement] of this._pendingReplacements) {
      if (!key.startsWith(`${session}\0`)) {
        continue;
      }
      const resolution = this.resolve(session, replacement.target);
      if (resolution.kind === "pending") {
        continue;
      }
      let enablement = replacement.enablement ?? resolution.enablement;
      for (const scopedReplacement of replacement.scopedReplacements) {
        enablement = this._replacementEnablement(enablement, resolution.workingDirectory, scopedReplacement);
      }
      const before = this._captureDecisionSnapshot(session, replacement.target);
      this._applyReplacement(session, replacement.target, enablement, resolution.workingDirectory);
      for (const affectedSession of this._getAffectedSessions(session, replacement.target, before)) {
        affectedSessions.add(affectedSession);
      }
      this._pendingReplacements.delete(key);
    }
    return affectedSessions;
  }
  _queueReplacement(session, target, replacement) {
    const key = `${session}\0${this._persistentKey(target)}`;
    const existing = this._pendingReplacements.get(key);
    if (replacement.replacementKind === "full") {
      this._pendingReplacements.set(key, { target, enablement: replacement.enablement, scopedReplacements: [] });
      return;
    }
    const scopedReplacements = [
      ...existing?.scopedReplacements.filter((entry) => entry.scope !== replacement.scope) ?? [],
      replacement
    ];
    this._pendingReplacements.set(key, {
      target,
      ...existing?.enablement ? { enablement: existing.enablement } : {},
      scopedReplacements
    });
  }
  _replacementEnablement(current, workingDirectory, replacement) {
    if (replacement.replacementKind === "full") {
      return [...replacement.enablement];
    }
    return withCustomizationEnablement(current, replacement.scope, this._enablementEntry(replacement, workingDirectory));
  }
  _enablementEntry(replacement, workingDirectory) {
    switch (replacement.scope) {
      case CustomizationEnablementKind.Global:
        return { kind: CustomizationEnablementKind.Global, enabled: replacement.enabled };
      case CustomizationEnablementKind.Workspace:
        if (workingDirectory.kind !== "directory") {
          throw new Error("Cannot record workspace enablement for a workspace-less session");
        }
        return { kind: CustomizationEnablementKind.Workspace, uri: workingDirectory.uri.toString(), enabled: replacement.enabled };
      case CustomizationEnablementKind.Session:
        return { kind: CustomizationEnablementKind.Session, enabled: replacement.enabled };
      default: {
        const exhaustiveKind = replacement.scope;
        throw new Error(`Unknown customization enablement kind: ${exhaustiveKind}`);
      }
    }
  }
  _applyReplacement(session, target, enablement, workingDirectory) {
    this._setGlobal(session, target, this._getGlobalReplacement(enablement));
    this._replaceNonGlobalEnablement(session, target, enablement, workingDirectory);
  }
  _getGlobalReplacement(enablement) {
    return enablement.find((entry) => entry.kind === CustomizationEnablementKind.Global)?.enabled;
  }
  _replaceNonGlobalEnablement(session, target, enablement, workingDirectory) {
    const byKind = new Map(enablement.map((entry) => [entry.kind, entry]));
    if (workingDirectory.kind === "directory") {
      this._setWorkspace(session, target, workingDirectory.uri, byKind.get(CustomizationEnablementKind.Workspace)?.enabled);
    }
    this._setSession(session, target, workingDirectory, byKind.get(CustomizationEnablementKind.Session)?.enabled);
  }
  async whenIdle() {
    await this._storageService.whenIdle();
    while (this._pendingSessionWrites.size > 0) {
      await Promise.allSettled([...this._pendingSessionWrites]);
    }
  }
  async _loadSessionEnablement(session) {
    const transitioned = !this._sessionEnablement.has(session);
    let reference;
    try {
      reference = this._sessionDataService.openDatabase(URI.parse(session));
      const raw = await reference.object.getMetadata(SESSION_METADATA_KEY);
      this._sessionEnablement.set(session, this._parseSessionEnablement(raw));
    } catch (err) {
      this._logService.warn(`[AgentHostCustomizationEnablementService] Failed to read session enablement for ${session}`, err);
      this._sessionEnablement.set(session, /* @__PURE__ */ new Map());
    } finally {
      reference?.dispose();
    }
    if (transitioned) {
      const affectedSessions = this._applyPendingReplacements(session);
      affectedSessions.add(session);
      this._notifyDecisionChanged(affectedSessions);
    }
  }
  _setGlobal(session, target, enabled) {
    this._setGlobalEnablement(session, target, enabled, true);
  }
  _setClientGlobal(session, target, enabled) {
    const key = this._persistentKey(target);
    let decisions = this._clientGlobalEnablement.get(session);
    if (decisions === void 0) {
      decisions = /* @__PURE__ */ new Map();
      this._clientGlobalEnablement.set(session, decisions);
    }
    decisions.set(key, enabled);
  }
  _setGlobalEnablement(session, target, enabled, removeRedundantWorkspaceDecisions) {
    const key = this._persistentKey(target);
    const global = this._persistent.global ?? {};
    this._setPersistentDecision("global", global, key, enabled, this._clientGlobalEnablement.get(session)?.get(key) ?? DEFAULT_CUSTOMIZATION_ENABLED);
    this._persistent = { ...this._persistent, global };
    if (removeRedundantWorkspaceDecisions && global[key] !== void 0) {
      this._removeRedundantWorkspaceDecisions(key);
    }
    this._persist();
  }
  /**
   * `undefined` clears a scope, and a decision matching its inherited value is cleared too.
   * This lets the UI restore inheritance without a third 'Inherit' action.
   */
  _setPersistentDecision(scope, decisions, key, enabled, inherited, workingDirectory) {
    if (enabled === void 0 || enabled === inherited) {
      delete decisions[key];
      this._removeLru(scope, key, workingDirectory);
    } else {
      decisions[key] = enabled;
      this._touchLru({ scope, key, ...workingDirectory === void 0 ? {} : { workingDirectory } });
    }
  }
  _persistentKey(target) {
    return getCustomizationEnablementKey(target, CustomizationEnablementKind.Global);
  }
  _sessionKey(target) {
    return getCustomizationEnablementKey(target, CustomizationEnablementKind.Session);
  }
  _workspaceInheritedEnablement(session, target, workingDirectory) {
    return this._persistent.workingDirectories?.[workingDirectory.toString()]?.[this._persistentKey(target)] ?? this._globalEnablement(session, target);
  }
  _globalEnablement(session, target) {
    const key = this._persistentKey(target);
    return this._persistent.global?.[key] ?? this._clientGlobalEnablement.get(session)?.get(key) ?? DEFAULT_CUSTOMIZATION_ENABLED;
  }
  _setWorkspace(session, target, workingDirectory, enabled) {
    const key = this._persistentKey(target);
    const directoryKey = workingDirectory.toString();
    const workingDirectories = this._persistent.workingDirectories ?? {};
    const workspace = workingDirectories[directoryKey] ?? {};
    this._setPersistentDecision("workspace", workspace, key, enabled, this._globalEnablement(session, target), directoryKey);
    workingDirectories[directoryKey] = workspace;
    this._persistent = { ...this._persistent, workingDirectories };
    this._persist();
  }
  /** Needs the working-directory state to calculate the lower-scope inherited value before clearing. */
  _setSession(session, target, workingDirectory, enabled) {
    const enablement = this._sessionEnablement.get(session);
    if (enablement === void 0) {
      throw new Error(`Session enablement has not been initialized: ${session}`);
    }
    const inherited = workingDirectory.kind === "directory" ? this._workspaceInheritedEnablement(session, target, workingDirectory.uri) : this._globalEnablement(session, target);
    const sessionKey = this._sessionKey(target);
    if (enabled === void 0 || enabled === inherited) {
      enablement.delete(sessionKey);
    } else {
      enablement.set(sessionKey, enabled);
    }
    this._persistSession(session, enablement);
  }
  _persistSession(session, enablement) {
    const reference = this._sessionDataService.openDatabase(URI.parse(session));
    const write = reference.object.setMetadata(SESSION_METADATA_KEY, JSON.stringify(Object.fromEntries(enablement))).catch((err) => {
      this._logService.error(`[AgentHostCustomizationEnablementService] Failed to write session enablement for ${session}`, err);
    }).finally(() => reference.dispose());
    this._pendingSessionWrites.add(write);
    const untrack = () => this._pendingSessionWrites.delete(write);
    write.then(untrack, untrack);
  }
  /** Prunes matching workspace decisions in every stored directory, preserving only overrides that beat the new global value. */
  _removeRedundantWorkspaceDecisions(key) {
    const inherited = this._persistent.global?.[key];
    if (inherited === void 0) {
      return;
    }
    for (const [directory, values] of Object.entries(this._persistent.workingDirectories ?? {})) {
      if (values[key] === inherited) {
        delete values[key];
        this._removeLru("workspace", key, directory);
      }
    }
  }
  _persist() {
    this._evictLru();
    const global = this._persistent.global && Object.keys(this._persistent.global).length > 0 ? this._persistent.global : void 0;
    const workingDirectories = Object.fromEntries(Object.entries(this._persistent.workingDirectories ?? {}).filter(([, values]) => Object.keys(values).length > 0));
    this._persistent = {
      ...global ? { global } : {},
      ...Object.keys(workingDirectories).length > 0 ? { workingDirectories } : {}
    };
    if (Object.keys(this._persistent).length === 0) {
      this._storageService.delete(STORAGE_KEY);
    } else {
      this._storageService.set(STORAGE_KEY, this._persistent);
    }
    if (this._lru.length === 0) {
      this._storageService.delete(LRU_STORAGE_KEY);
    } else {
      this._storageService.set(LRU_STORAGE_KEY, this._lru);
    }
  }
  _touchLru(entry) {
    this._removeLru(entry.scope, entry.key, entry.workingDirectory);
    this._lru.push(entry);
  }
  _removeLru(scope, key, workingDirectory) {
    this._lru = this._lru.filter((entry) => entry.scope !== scope || entry.key !== key || entry.workingDirectory !== workingDirectory);
  }
  _evictLru() {
    while (this._lru.length > MAX_PERSISTED_DECISIONS) {
      const entry = this._lru.shift();
      if (entry.scope === "global") {
        delete this._persistent.global?.[entry.key];
      } else if (entry.workingDirectory !== void 0) {
        delete this._persistent.workingDirectories?.[entry.workingDirectory]?.[entry.key];
      }
    }
  }
  _readPersistentEnablement() {
    const value = this._storageService.get(STORAGE_KEY);
    if (!isRecord(value)) {
      return {};
    }
    const global = readBooleanRecord(value["global"]);
    const workingDirectories = isRecord(value["workingDirectories"]) ? Object.fromEntries(Object.entries(value["workingDirectories"]).map(([directory, decisions]) => [directory, readBooleanRecord(decisions)]).filter(([, decisions]) => Object.keys(decisions).length > 0)) : void 0;
    return {
      ...global && Object.keys(global).length > 0 ? { global } : {},
      ...workingDirectories && Object.keys(workingDirectories).length > 0 ? { workingDirectories } : {}
    };
  }
  _readLru() {
    const value = this._storageService.get(LRU_STORAGE_KEY);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (entry) => isRecord(entry) && (entry["scope"] === "global" || entry["scope"] === "workspace") && typeof entry["key"] === "string" && (entry["workingDirectory"] === void 0 || typeof entry["workingDirectory"] === "string")
    );
  }
  _reconcileLru() {
    const persistedEntries = [
      ...Object.keys(this._persistent.global ?? {}).sort().map((key) => ({ scope: "global", key })),
      ...Object.entries(this._persistent.workingDirectories ?? {}).flatMap(([workingDirectory, values]) => Object.keys(values).sort().map((key) => ({ scope: "workspace", key, workingDirectory })))
    ];
    const valid = this._lru.filter((entry) => persistedEntries.some((candidate) => entriesEqual(candidate, entry)));
    for (const entry of persistedEntries) {
      if (!valid.some((candidate) => entriesEqual(candidate, entry))) {
        valid.push(entry);
      }
    }
    this._lru = valid;
    this._evictLru();
  }
  _parseSessionEnablement(raw) {
    if (raw === void 0) {
      return /* @__PURE__ */ new Map();
    }
    try {
      return new Map(Object.entries(readBooleanRecord(JSON.parse(raw))));
    } catch {
      return /* @__PURE__ */ new Map();
    }
  }
  _captureDecisionSnapshot(session, target) {
    const persistentKey = this._persistentKey(target);
    const workspace = /* @__PURE__ */ new Map();
    for (const [directory, decisions] of Object.entries(this._persistent.workingDirectories ?? {})) {
      const decision = decisions[persistentKey];
      if (decision !== void 0) {
        workspace.set(directory, decision);
      }
    }
    return {
      global: this._persistent.global?.[persistentKey],
      workspace,
      session: this._sessionEnablement.get(session)?.get(this._sessionKey(target))
    };
  }
  _getAffectedSessions(session, target, before) {
    const after = this._captureDecisionSnapshot(session, target);
    const affectedSessions = /* @__PURE__ */ new Set();
    if (before.global !== after.global) {
      for (const candidate of this._sessionState.getSessionUris()) {
        affectedSessions.add(candidate);
      }
    }
    for (const directory of /* @__PURE__ */ new Set([...before.workspace.keys(), ...after.workspace.keys()])) {
      if (before.workspace.get(directory) !== after.workspace.get(directory)) {
        for (const candidate of this._sessionState.getSessionUris()) {
          const workingDirectory = this.getWorkingDirectoryState(candidate);
          if (workingDirectory.kind === "directory" && workingDirectory.uri.toString() === directory) {
            affectedSessions.add(candidate);
          }
        }
      }
    }
    if (before.session !== after.session) {
      affectedSessions.add(session);
    }
    return affectedSessions;
  }
  _notifyDecisionChanged(sessions) {
    const affectedSessions = [...new Set(sessions)];
    if (affectedSessions.length > 0) {
      this._onDidChange.fire({ sessions: affectedSessions });
    }
  }
};
AgentHostCustomizationEnablementService = __decorateClass([
  __decorateParam(0, IAgentHostStorageService),
  __decorateParam(1, ISessionDataService),
  __decorateParam(2, IAgentHostStateManager),
  __decorateParam(3, ILogService)
], AgentHostCustomizationEnablementService);
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readBooleanRecord(value) {
  if (!isRecord(value)) {
    return {};
  }
  const result = {};
  for (const [key, decision] of Object.entries(value)) {
    if (typeof decision === "boolean") {
      result[key] = decision;
    }
  }
  return result;
}
function entriesEqual(a, b) {
  return a.scope === b.scope && a.key === b.key && a.workingDirectory === b.workingDirectory;
}
export {
  AgentHostCustomizationEnablementService,
  IAgentHostCustomizationEnablementService,
  getCustomizationEnablementKey,
  targetForUnownedMcpServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0eXBlIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UsIHR5cGUgSVNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9DVVNUT01JWkFUSU9OX0VOQUJMRUQsIGlzQ3VzdG9taXphdGlvbkVuYWJsZWQsIHNvcnRDdXN0b21pemF0aW9uRW5hYmxlbWVudCwgd2l0aEN1c3RvbWl6YXRpb25FbmFibGVtZW50IH0gZnJvbSAnLi4vY29tbW9uL2N1c3RvbWl6YXRpb25FbmFibGVtZW50LmpzJztcbmltcG9ydCB7IGlzQWhwQ2hhdENoYW5uZWwsIHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmksIHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcyB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIEN1c3RvbWl6YXRpb25FbmFibGVtZW50IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLXNlc3Npb24vc3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RTdG9yYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMgfSBmcm9tICcuL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0V29ya3RyZWVJc29sYXRpb24gfSBmcm9tICcuL3NoYXJlZC93b3JrdHJlZUlzb2xhdGlvbi5qcyc7XG5cbmNvbnN0IFNUT1JBR0VfS0VZID0gJ2N1c3RvbWl6YXRpb25FbmFibGVtZW50JztcbmNvbnN0IExSVV9TVE9SQUdFX0tFWSA9ICdjdXN0b21pemF0aW9uRW5hYmxlbWVudExydSc7XG5jb25zdCBTRVNTSU9OX01FVEFEQVRBX0tFWSA9ICdjdXN0b21pemF0aW9uRW5hYmxlbWVudCc7XG4vKiogQm91bmRzIG9ycGhhbmVkIGR1cmFibGUgZGVjaXNpb25zLCB3aG9zZSBzb3VyY2UtZGVyaXZlZCBrZXlzIGJlY29tZSB1bnJlYWNoYWJsZSB3aGVuIHRoZWlyIHBsdWdpbiBkaXNhcHBlYXJzLiAqL1xuY29uc3QgTUFYX1BFUlNJU1RFRF9ERUNJU0lPTlMgPSA1MTI7XG5cbmludGVyZmFjZSBJUGVyc2lzdGVkRW5hYmxlbWVudCB7XG5cdHJlYWRvbmx5IGdsb2JhbD86IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3JpZXM/OiBSZWNvcmQ8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj47XG59XG5cblxuaW50ZXJmYWNlIElMcnVFbnRyeSB7XG5cdHJlYWRvbmx5IHNjb3BlOiAnZ2xvYmFsJyB8ICd3b3Jrc3BhY2UnO1xuXHRyZWFkb25seSBrZXk6IHN0cmluZztcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElGdWxsRW5hYmxlbWVudFJlcGxhY2VtZW50IHtcblx0cmVhZG9ubHkgcmVwbGFjZW1lbnRLaW5kOiAnZnVsbCc7XG5cdHJlYWRvbmx5IGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W107XG59XG5cbmludGVyZmFjZSBJU2NvcGVkRW5hYmxlbWVudFJlcGxhY2VtZW50IHtcblx0cmVhZG9ubHkgcmVwbGFjZW1lbnRLaW5kOiAnc2NvcGVkJztcblx0cmVhZG9ubHkgc2NvcGU6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZDtcblx0cmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjtcbn1cblxudHlwZSBFbmFibGVtZW50UmVwbGFjZW1lbnQgPSBJRnVsbEVuYWJsZW1lbnRSZXBsYWNlbWVudCB8IElTY29wZWRFbmFibGVtZW50UmVwbGFjZW1lbnQ7XG5cbmludGVyZmFjZSBJUGVuZGluZ1JlcGxhY2VtZW50IHtcblx0cmVhZG9ubHkgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQ7XG5cdHJlYWRvbmx5IGVuYWJsZW1lbnQ/OiByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdO1xuXHRyZWFkb25seSBzY29wZWRSZXBsYWNlbWVudHM6IHJlYWRvbmx5IElTY29wZWRFbmFibGVtZW50UmVwbGFjZW1lbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB0eXBlOiBDdXN0b21pemF0aW9uVHlwZTtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgb3duaW5nUGx1Z2luU291cmNlPzogVVJJO1xuXHQvKipcblx0ICogV2hldGhlciB0aGUgY2xpZW50IHN1cHBsaWVkIHRoaXMgY3VzdG9taXphdGlvbiBhbmQgdGhlcmVmb3JlIG93bnMgaXRzIGdsb2JhbCBkZWNpc2lvbi5cblx0ICovXG5cdHJlYWRvbmx5IGlzQ2xpZW50QnVuZGxlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogYHBlbmRpbmdgIG1lYW5zIHRoZSBkaXJlY3RvcnkgaXMgbm90IHJlZ2lzdGVyZWQgeWV0OyBgd29ya3NwYWNlbGVzc2AgZXhwbGljaXRseSBtZWFucyB0aGVyZSBpcyBub25lLlxuICogS2VlcGluZyB0aGVtIGRpc3RpbmN0IHByZXZlbnRzIHdvcmtzcGFjZSBkZWNpc2lvbnMgZnJvbSBiZWluZyBzaWxlbnRseSBkaXNjYXJkZWQgd2hpbGUgcmVnaXN0cmF0aW9uIGlzIHBlbmRpbmcuXG4gKi9cbmV4cG9ydCB0eXBlIFdvcmtpbmdEaXJlY3RvcnlTdGF0ZSA9XG5cdHwgeyByZWFkb25seSBraW5kOiAnZGlyZWN0b3J5JzsgcmVhZG9ubHkgdXJpOiBVUkkgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3dvcmtzcGFjZWxlc3MnIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdwZW5kaW5nJyB9O1xuXG5leHBvcnQgdHlwZSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlc29sdXRpb24gPVxuXHR8IHtcblx0XHRyZWFkb25seSBraW5kOiAncmVzb2x2ZWQnO1xuXHRcdHJlYWRvbmx5IGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W107XG5cdFx0cmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjtcblx0XHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5OiBFeGNsdWRlPFdvcmtpbmdEaXJlY3RvcnlTdGF0ZSwgeyBraW5kOiAncGVuZGluZycgfT47XG5cdH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdwZW5kaW5nJzsgcmVhZG9ubHkgcmVhc29uOiAnc2Vzc2lvbicgfCAnd29ya2luZ0RpcmVjdG9yeScgfTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IHNlc3Npb25zOiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNvbnN0IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZT4oJ2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRDaGFuZ2VFdmVudD47XG5cdGluaXRpYWxpemVTZXNzaW9uKHNlc3Npb246IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdGdldFdvcmtpbmdEaXJlY3RvcnlTdGF0ZShzZXNzaW9uOiBzdHJpbmcpOiBXb3JraW5nRGlyZWN0b3J5U3RhdGU7XG5cdHJlc29sdmUoc2Vzc2lvbjogc3RyaW5nLCB0YXJnZXQ6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCk6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50UmVzb2x1dGlvbjtcblx0YXBwbHlDbGllbnRHbG9iYWxFbmFibGVtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10pOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlc29sdXRpb247XG5cdHJlcGxhY2VFbmFibGVtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10pOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlc29sdXRpb247XG5cdHNldEVuYWJsZW1lbnQoc2Vzc2lvbjogc3RyaW5nLCB0YXJnZXQ6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCwga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBlbmFibGVkOiBib29sZWFuKTogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRSZXNvbHV0aW9uO1xuXHR3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHNjb3BlLWFwcHJvcHJpYXRlIGlkZW50aXR5IGZvciBhIGN1c3RvbWl6YXRpb24gZGVjaXNpb24uXG4gKlxuICogU2Vzc2lvbiBkZWNpc2lvbnMgdXNlIGEgY3VzdG9taXphdGlvbiBpZCBiZWNhdXNlIGl0IG5lZWQgb25seSBiZSBzdGFibGUgd2l0aGluIHRoYXQgc2Vzc2lvbjsgZHVyYWJsZSBkZWNpc2lvbnMgdXNlIHN0YWJsZSBzb3VyY2UtZGVyaXZlZCBpZGVudGl0aWVzIGJlY2F1c2UgcGx1Z2luIGNoaWxkIGlkcyBjb250YWluIG1hdGVyaWFsaXplZCBwYXRocyBhbmQgY29udGVudCBoYXNoZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDdXN0b21pemF0aW9uRW5hYmxlbWVudEtleSh0YXJnZXQ6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCwga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kKTogc3RyaW5nIHtcblx0aWYgKGtpbmQgPT09IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uKSB7XG5cdFx0cmV0dXJuIHRhcmdldC5pZDtcblx0fVxuXG5cdHN3aXRjaCAodGFyZ2V0LnR5cGUpIHtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbjpcblx0XHRcdHJldHVybiB0YXJnZXQuc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXI6XG5cdFx0XHRyZXR1cm4gdGFyZ2V0Lm93bmluZ1BsdWdpblNvdXJjZVxuXHRcdFx0XHQ/IGAke3RhcmdldC5vd25pbmdQbHVnaW5Tb3VyY2UudG9TdHJpbmcoKX0jbWNwPSR7dGFyZ2V0Lm5hbWV9YFxuXHRcdFx0XHQ6IGBtY3BTZXJ2ZXJzIyR7dGFyZ2V0Lm5hbWV9YDtcblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFbmFibGVtZW50IGlzIG9ubHkgc3VwcG9ydGVkIGZvciBwbHVnaW5zIGFuZCBNQ1Agc2VydmVycywgbm90ICR7dGFyZ2V0LnR5cGV9YCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhcmdldEZvclVub3duZWRNY3BTZXJ2ZXIobmFtZTogc3RyaW5nKTogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0IHtcblx0cmV0dXJuIHtcblx0XHRpZDogYG1jcFNlcnZlcnMjJHtuYW1lfWAsXG5cdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdG5hbWUsXG5cdFx0c291cmNlOiBVUkkucGFyc2UoYG1jcFNlcnZlcnMjJHtuYW1lfWApLFxuXHR9O1xufVxuXG4vKipcbiAqIE93bnMgaG9zdCBnbG9iYWwsIHdvcmtzcGFjZSwgYW5kIHNlc3Npb24gZGVjaXNpb25zLCByZXNvbHZpbmcgdGhlbSBvdmVyIGEgY2xpZW50IGdsb2JhbCBiYXNlLlxuICpcbiAqIEdsb2JhbCBhbmQgd29ya3NwYWNlIGRlY2lzaW9ucyB1c2UgaG9zdCBKU09OIHN0b3JhZ2U7IHNlc3Npb24gZGVjaXNpb25zIHJlbWFpbiBpbiB0aGF0IHNlc3Npb24ncyBkYXRhYmFzZSBhY3Jvc3MgcmVzdGFydHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUN1c3RvbWl6YXRpb25FbmFibGVtZW50Q2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX3BlcnNpc3RlbnQ6IElQZXJzaXN0ZWRFbmFibGVtZW50O1xuXHRwcml2YXRlIF9scnU6IElMcnVFbnRyeVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGllbnRHbG9iYWxFbmFibGVtZW50ID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIGJvb2xlYW4+PigpO1xuXHQvKipcblx0ICogTG9hZGVkIG9uY2UgYW5kIGF1dGhvcml0YXRpdmUgZm9yIHN5bmNocm9ub3VzIHJlc29sdXRpb24sIHdoaWNoIHJ1bnMgd2hpbGUgY3VzdG9taXphdGlvbnMgYXJlIHB1Ymxpc2hlZC5cblx0ICogQW4gYXN5bmMgcmVhZCBoZXJlIGNvdWxkIG1pc3Rha2UgYW4gdW5hdmFpbGFibGUgcmVzdWx0IGZvciBhbiBhYnNlbnQgZGVjaXNpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRW5hYmxlbWVudCA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBib29sZWFuPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkxvYWRzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTZXNzaW9uV3JpdGVzID0gbmV3IFNldDxQcm9taXNlPHZvaWQ+PigpO1xuXHQvKipcblx0ICogUmV0YWlucyB3cml0ZXMgbWFkZSBiZWZvcmUgc2Vzc2lvbiBtZXRhZGF0YSBvciBkaXJlY3RvcnkgcmVnaXN0cmF0aW9uIHJlc29sdmVzLlxuXHQgKiBSZXBsYXllZCBhZnRlciBlaXRoZXIgc2Vzc2lvbiBsb2FkIG9yIGEgd29ya2luZy1kaXJlY3RvcnkgZXZlbnQsIHdoaWxlIHJlc29sdXRpb24gcmVwb3J0cyBgcGVuZGluZ2AgcmF0aGVyIHRoYW4gbm8gZGVjaXNpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUmVwbGFjZW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIElQZW5kaW5nUmVwbGFjZW1lbnQ+KCk7XG5cdHByaXZhdGUgX3dvcmt0cmVlOiBJQWdlbnRIb3N0V29ya3RyZWVJc29sYXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmt0cmVlUGVuZGluZ0xpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRIb3N0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElBZ2VudEhvc3RTdG9yYWdlU2VydmljZSxcblx0XHRASVNlc3Npb25EYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblN0YXRlOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3BlcnNpc3RlbnQgPSB0aGlzLl9yZWFkUGVyc2lzdGVudEVuYWJsZW1lbnQoKTtcblx0XHR0aGlzLl9scnUgPSB0aGlzLl9yZWFkTHJ1KCk7XG5cdFx0dGhpcy5fcmVjb25jaWxlTHJ1KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvblN0YXRlLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBpc0FocENoYXRDaGFubmVsKGVudmVsb3BlLmNoYW5uZWwpXG5cdFx0XHRcdD8gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShlbnZlbG9wZS5jaGFubmVsKVxuXHRcdFx0XHQ6IHRoaXMuX3Nlc3Npb25TdGF0ZS5nZXRTZXNzaW9uU3VtbWFyeShlbnZlbG9wZS5jaGFubmVsKSA/IGVudmVsb3BlLmNoYW5uZWwgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc2Vzc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25zQnlJZC5zZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLCBzZXNzaW9uKTtcblx0XHRcdFx0dm9pZCB0aGlzLmluaXRpYWxpemVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0XHRpZiAoZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQgfHwgZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWZmZWN0ZWRTZXNzaW9ucyA9IHRoaXMuX2FwcGx5UGVuZGluZ1JlcGxhY2VtZW50cyhzZXNzaW9uKTtcblx0XHRcdFx0XHRhZmZlY3RlZFNlc3Npb25zLmFkZChzZXNzaW9uKTtcblx0XHRcdFx0XHR0aGlzLl9ub3RpZnlEZWNpc2lvbkNoYW5nZWQoYWZmZWN0ZWRTZXNzaW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKiogQm91bmQgYWZ0ZXIgQWdlbnRTZXJ2aWNlIGNvbnN0cnVjdGlvbiBiZWNhdXNlIFdvcmt0cmVlSXNvbGF0aW9uIGRlcGVuZHMgb24gSUNvcGlsb3RBcGlTZXJ2aWNlIGFuZCBBZ2VudFNlcnZpY2UncyBlbmRwb2ludCBzZXJ2aWNlLiAqL1xuXHRzZXRXb3JrdHJlZUlzb2xhdGlvbih3b3JrdHJlZTogSUFnZW50SG9zdFdvcmt0cmVlSXNvbGF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3RyZWUgPSB3b3JrdHJlZTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVdvcmtpbmdEaXJlY3RvcnlQZW5kaW5nID0gd29ya3RyZWUub25EaWRDaGFuZ2VXb3JraW5nRGlyZWN0b3J5UGVuZGluZztcblx0XHR0aGlzLl93b3JrdHJlZVBlbmRpbmdMaXN0ZW5lci52YWx1ZSA9IG9uRGlkQ2hhbmdlV29ya2luZ0RpcmVjdG9yeVBlbmRpbmc/LihzZXNzaW9uSWQgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zQnlJZC5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdGlmIChzZXNzaW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gQSB3b3JrdHJlZSBjYW4gYmVjb21lIHBlbmRpbmcgYmVmb3JlIHRoaXMgc2VydmljZSBpbml0aWFsaXplcyBpdHNcblx0XHRcdFx0Ly8gc2Vzc2lvbi4gSXQgY2Fubm90IGhhdmUgcHJvZHVjZWQgYSByZXNvbHV0aW9uIHlldDsgaW5pdGlhbGl6YXRpb25cblx0XHRcdFx0Ly8gcmVhZHMgdGhlIGN1cnJlbnQgcGVuZGluZyBzdGF0ZSwgYW5kIGFueSBsYXRlciBjbGVhciBpcyBvYnNlcnZlZC5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbm90aWZ5RGVjaXNpb25DaGFuZ2VkKFtzZXNzaW9uXSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplU2Vzc2lvbihzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25Mb2Fkcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2Vzc2lvbnNCeUlkLnNldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksIHNlc3Npb24pO1xuXHRcdGNvbnN0IGxvYWQgPSB0aGlzLl9sb2FkU2Vzc2lvbkVuYWJsZW1lbnQoc2Vzc2lvbik7XG5cdFx0dGhpcy5fc2Vzc2lvbkxvYWRzLnNldChzZXNzaW9uLCBsb2FkKTtcblx0XHRyZXR1cm4gbG9hZDtcblx0fVxuXG5cdGdldFdvcmtpbmdEaXJlY3RvcnlTdGF0ZShzZXNzaW9uOiBzdHJpbmcpOiBXb3JraW5nRGlyZWN0b3J5U3RhdGUge1xuXHRcdGNvbnN0IHN1bW1hcnkgPSB0aGlzLl9zZXNzaW9uU3RhdGUuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbik7XG5cdFx0aWYgKHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcyhzdW1tYXJ5Py5fbWV0YSkpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICd3b3Jrc3BhY2VsZXNzJyB9O1xuXHRcdH1cblx0XHRpZiAodGhpcy5fd29ya3RyZWU/LmlzV29ya2luZ0RpcmVjdG9yeVBlbmRpbmcoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSkge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3BlbmRpbmcnIH07XG5cdFx0fVxuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3Rvcmllcyh0aGlzLl9zZXNzaW9uU3RhdGUsIHNlc3Npb24pPy5bMF07XG5cdFx0aWYgKGRpcmVjdG9yeSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAncGVuZGluZycgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2luZDogJ2RpcmVjdG9yeScsIHVyaTogVVJJLnBhcnNlKGRpcmVjdG9yeSkgfTtcblx0fVxuXG5cdHJlc29sdmUoc2Vzc2lvbjogc3RyaW5nLCB0YXJnZXQ6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCk6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50UmVzb2x1dGlvbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkVuYWJsZW1lbnQgPSB0aGlzLl9zZXNzaW9uRW5hYmxlbWVudC5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKHNlc3Npb25FbmFibGVtZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdwZW5kaW5nJywgcmVhc29uOiAnc2Vzc2lvbicgfTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gdGhpcy5nZXRXb3JraW5nRGlyZWN0b3J5U3RhdGUoc2Vzc2lvbik7XG5cdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcnkua2luZCA9PT0gJ3BlbmRpbmcnKSB7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAncGVuZGluZycsIHJlYXNvbjogJ3dvcmtpbmdEaXJlY3RvcnknIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVyc2lzdGVudEtleSA9IHRoaXMuX3BlcnNpc3RlbnRLZXkodGFyZ2V0KTtcblx0XHRjb25zdCBkZWNpc2lvbnM6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uRGVjaXNpb24gPSBzZXNzaW9uRW5hYmxlbWVudC5nZXQodGhpcy5fc2Vzc2lvbktleSh0YXJnZXQpKTtcblx0XHRpZiAoc2Vzc2lvbkRlY2lzaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlY2lzaW9ucy5wdXNoKHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHNlc3Npb25EZWNpc2lvbiB9KTtcblx0XHR9XG5cdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcnkua2luZCA9PT0gJ2RpcmVjdG9yeScpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZURlY2lzaW9uID0gdGhpcy5fcGVyc2lzdGVudC53b3JraW5nRGlyZWN0b3JpZXM/Llt3b3JraW5nRGlyZWN0b3J5LnVyaS50b1N0cmluZygpXT8uW3BlcnNpc3RlbnRLZXldO1xuXHRcdFx0aWYgKHdvcmtzcGFjZURlY2lzaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZGVjaXNpb25zLnB1c2goeyBraW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuV29ya3NwYWNlLCB1cmk6IHdvcmtpbmdEaXJlY3RvcnkudXJpLnRvU3RyaW5nKCksIGVuYWJsZWQ6IHdvcmtzcGFjZURlY2lzaW9uIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBnbG9iYWxEZWNpc2lvbiA9IHRoaXMuX3BlcnNpc3RlbnQuZ2xvYmFsPy5bcGVyc2lzdGVudEtleV07XG5cdFx0aWYgKGdsb2JhbERlY2lzaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlY2lzaW9ucy5wdXNoKHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZ2xvYmFsRGVjaXNpb24gfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNsaWVudEdsb2JhbERlY2lzaW9uID0gdGhpcy5fY2xpZW50R2xvYmFsRW5hYmxlbWVudC5nZXQoc2Vzc2lvbik/LmdldChwZXJzaXN0ZW50S2V5KTtcblx0XHRcdGlmIChjbGllbnRHbG9iYWxEZWNpc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGRlY2lzaW9ucy5wdXNoKHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogY2xpZW50R2xvYmFsRGVjaXNpb24gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5hYmxlbWVudCA9IHNvcnRDdXN0b21pemF0aW9uRW5hYmxlbWVudChkZWNpc2lvbnMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncmVzb2x2ZWQnLFxuXHRcdFx0ZW5hYmxlbWVudCxcblx0XHRcdGVuYWJsZWQ6IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoeyBlbmFibGVtZW50IH0pLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHR9O1xuXHR9XG5cblx0YXBwbHlDbGllbnRHbG9iYWxFbmFibGVtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10pOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlc29sdXRpb24ge1xuXHRcdGNvbnN0IGdsb2JhbCA9IGVuYWJsZW1lbnQuZmluZChlbnRyeSA9PiBlbnRyeS5raW5kID09PSBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsKTtcblx0XHRpZiAoZ2xvYmFsID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2xpZW50IGN1c3RvbWl6YXRpb24gJHt0YXJnZXQuc291cmNlLnRvU3RyaW5nKCl9IGlzIG1pc3NpbmcgaXRzIHJlcXVpcmVkIGdsb2JhbCBlbmFibGVtZW50IGVudHJ5YCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0YXJnZXQuaXNDbGllbnRCdW5kbGVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlKHNlc3Npb24sIHRhcmdldCk7XG5cdFx0fVxuXHRcdHRoaXMuX3NldENsaWVudEdsb2JhbChzZXNzaW9uLCB0YXJnZXQsIGdsb2JhbC5lbmFibGVkKTtcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlKHNlc3Npb24sIHRhcmdldCk7XG5cdH1cblxuXHRzZXRFbmFibGVtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZCwgZW5hYmxlZDogYm9vbGVhbik6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50UmVzb2x1dGlvbiB7XG5cdFx0Y29uc3QgYmVmb3JlID0gdGhpcy5fY2FwdHVyZURlY2lzaW9uU25hcHNob3Qoc2Vzc2lvbiwgdGFyZ2V0KTtcblx0XHRjb25zdCByZXNvbHV0aW9uID0gdGhpcy5fcmVwbGFjZUVuYWJsZW1lbnQoc2Vzc2lvbiwgdGFyZ2V0LCB7IHJlcGxhY2VtZW50S2luZDogJ3Njb3BlZCcsIHNjb3BlOiBraW5kLCBlbmFibGVkIH0pO1xuXHRcdHRoaXMuX25vdGlmeURlY2lzaW9uQ2hhbmdlZCh0aGlzLl9nZXRBZmZlY3RlZFNlc3Npb25zKHNlc3Npb24sIHRhcmdldCwgYmVmb3JlKSk7XG5cdFx0cmV0dXJuIHJlc29sdXRpb247XG5cdH1cblxuXHRyZXBsYWNlRW5hYmxlbWVudChzZXNzaW9uOiBzdHJpbmcsIHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0LCBlbmFibGVtZW50OiByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdKTogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRSZXNvbHV0aW9uIHtcblx0XHRjb25zdCBiZWZvcmUgPSB0aGlzLl9jYXB0dXJlRGVjaXNpb25TbmFwc2hvdChzZXNzaW9uLCB0YXJnZXQpO1xuXHRcdGNvbnN0IHJlc29sdXRpb24gPSB0aGlzLl9yZXBsYWNlRW5hYmxlbWVudChzZXNzaW9uLCB0YXJnZXQsIHsgcmVwbGFjZW1lbnRLaW5kOiAnZnVsbCcsIGVuYWJsZW1lbnQgfSk7XG5cdFx0dGhpcy5fbm90aWZ5RGVjaXNpb25DaGFuZ2VkKHRoaXMuX2dldEFmZmVjdGVkU2Vzc2lvbnMoc2Vzc2lvbiwgdGFyZ2V0LCBiZWZvcmUpKTtcblx0XHRyZXR1cm4gcmVzb2x1dGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX3JlcGxhY2VFbmFibGVtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIHJlcGxhY2VtZW50OiBFbmFibGVtZW50UmVwbGFjZW1lbnQpOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlc29sdXRpb24ge1xuXHRcdGNvbnN0IHJlc29sdXRpb24gPSB0aGlzLnJlc29sdmUoc2Vzc2lvbiwgdGFyZ2V0KTtcblx0XHRpZiAocmVzb2x1dGlvbi5raW5kID09PSAncGVuZGluZycpIHtcblx0XHRcdGlmIChyZXBsYWNlbWVudC5yZXBsYWNlbWVudEtpbmQgPT09ICdmdWxsJykge1xuXHRcdFx0XHR0aGlzLl9zZXRHbG9iYWwoc2Vzc2lvbiwgdGFyZ2V0LCB0aGlzLl9nZXRHbG9iYWxSZXBsYWNlbWVudChyZXBsYWNlbWVudC5lbmFibGVtZW50KSk7XG5cdFx0XHRcdHRoaXMuX3F1ZXVlUmVwbGFjZW1lbnQoc2Vzc2lvbiwgdGFyZ2V0LCByZXBsYWNlbWVudCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlcGxhY2VtZW50LnNjb3BlID09PSBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuR2xvYmFsKSB7XG5cdFx0XHRcdHRoaXMuX3NldEdsb2JhbChzZXNzaW9uLCB0YXJnZXQsIHJlcGxhY2VtZW50LmVuYWJsZWQpO1xuXHRcdFx0XHRpZiAodGhpcy5fcGVuZGluZ1JlcGxhY2VtZW50cy5oYXMoYCR7c2Vzc2lvbn1cXHUwMDAwJHt0aGlzLl9wZXJzaXN0ZW50S2V5KHRhcmdldCl9YCkpIHtcblx0XHRcdFx0XHR0aGlzLl9xdWV1ZVJlcGxhY2VtZW50KHNlc3Npb24sIHRhcmdldCwgcmVwbGFjZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9xdWV1ZVJlcGxhY2VtZW50KHNlc3Npb24sIHRhcmdldCwgcmVwbGFjZW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdXRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5hYmxlbWVudCA9IHRoaXMuX3JlcGxhY2VtZW50RW5hYmxlbWVudChyZXNvbHV0aW9uLmVuYWJsZW1lbnQsIHJlc29sdXRpb24ud29ya2luZ0RpcmVjdG9yeSwgcmVwbGFjZW1lbnQpO1xuXHRcdHRoaXMuX2FwcGx5UmVwbGFjZW1lbnQoc2Vzc2lvbiwgdGFyZ2V0LCBlbmFibGVtZW50LCByZXNvbHV0aW9uLndvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdHJldHVybiB0aGlzLnJlc29sdmUoc2Vzc2lvbiwgdGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5UGVuZGluZ1JlcGxhY2VtZW50cyhzZXNzaW9uOiBzdHJpbmcpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgYWZmZWN0ZWRTZXNzaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgW2tleSwgcmVwbGFjZW1lbnRdIG9mIHRoaXMuX3BlbmRpbmdSZXBsYWNlbWVudHMpIHtcblx0XHRcdGlmICgha2V5LnN0YXJ0c1dpdGgoYCR7c2Vzc2lvbn1cXHUwMDAwYCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvbHV0aW9uID0gdGhpcy5yZXNvbHZlKHNlc3Npb24sIHJlcGxhY2VtZW50LnRhcmdldCk7XG5cdFx0XHRpZiAocmVzb2x1dGlvbi5raW5kID09PSAncGVuZGluZycpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgZW5hYmxlbWVudCA9IHJlcGxhY2VtZW50LmVuYWJsZW1lbnQgPz8gcmVzb2x1dGlvbi5lbmFibGVtZW50O1xuXHRcdFx0Zm9yIChjb25zdCBzY29wZWRSZXBsYWNlbWVudCBvZiByZXBsYWNlbWVudC5zY29wZWRSZXBsYWNlbWVudHMpIHtcblx0XHRcdFx0ZW5hYmxlbWVudCA9IHRoaXMuX3JlcGxhY2VtZW50RW5hYmxlbWVudChlbmFibGVtZW50LCByZXNvbHV0aW9uLndvcmtpbmdEaXJlY3RvcnksIHNjb3BlZFJlcGxhY2VtZW50KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJlZm9yZSA9IHRoaXMuX2NhcHR1cmVEZWNpc2lvblNuYXBzaG90KHNlc3Npb24sIHJlcGxhY2VtZW50LnRhcmdldCk7XG5cdFx0XHR0aGlzLl9hcHBseVJlcGxhY2VtZW50KHNlc3Npb24sIHJlcGxhY2VtZW50LnRhcmdldCwgZW5hYmxlbWVudCwgcmVzb2x1dGlvbi53b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGZvciAoY29uc3QgYWZmZWN0ZWRTZXNzaW9uIG9mIHRoaXMuX2dldEFmZmVjdGVkU2Vzc2lvbnMoc2Vzc2lvbiwgcmVwbGFjZW1lbnQudGFyZ2V0LCBiZWZvcmUpKSB7XG5cdFx0XHRcdGFmZmVjdGVkU2Vzc2lvbnMuYWRkKGFmZmVjdGVkU2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVwbGFjZW1lbnRzLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gYWZmZWN0ZWRTZXNzaW9ucztcblx0fVxuXG5cdHByaXZhdGUgX3F1ZXVlUmVwbGFjZW1lbnQoc2Vzc2lvbjogc3RyaW5nLCB0YXJnZXQ6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCwgcmVwbGFjZW1lbnQ6IEVuYWJsZW1lbnRSZXBsYWNlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IGAke3Nlc3Npb259XFx1MDAwMCR7dGhpcy5fcGVyc2lzdGVudEtleSh0YXJnZXQpfWA7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9wZW5kaW5nUmVwbGFjZW1lbnRzLmdldChrZXkpO1xuXHRcdGlmIChyZXBsYWNlbWVudC5yZXBsYWNlbWVudEtpbmQgPT09ICdmdWxsJykge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcGxhY2VtZW50cy5zZXQoa2V5LCB7IHRhcmdldCwgZW5hYmxlbWVudDogcmVwbGFjZW1lbnQuZW5hYmxlbWVudCwgc2NvcGVkUmVwbGFjZW1lbnRzOiBbXSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2NvcGVkUmVwbGFjZW1lbnRzID0gW1xuXHRcdFx0Li4uKGV4aXN0aW5nPy5zY29wZWRSZXBsYWNlbWVudHMuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnNjb3BlICE9PSByZXBsYWNlbWVudC5zY29wZSkgPz8gW10pLFxuXHRcdFx0cmVwbGFjZW1lbnQsXG5cdFx0XTtcblx0XHR0aGlzLl9wZW5kaW5nUmVwbGFjZW1lbnRzLnNldChrZXksIHtcblx0XHRcdHRhcmdldCxcblx0XHRcdC4uLihleGlzdGluZz8uZW5hYmxlbWVudCA/IHsgZW5hYmxlbWVudDogZXhpc3RpbmcuZW5hYmxlbWVudCB9IDoge30pLFxuXHRcdFx0c2NvcGVkUmVwbGFjZW1lbnRzLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwbGFjZW1lbnRFbmFibGVtZW50KGN1cnJlbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10sIHdvcmtpbmdEaXJlY3Rvcnk6IEV4Y2x1ZGU8V29ya2luZ0RpcmVjdG9yeVN0YXRlLCB7IGtpbmQ6ICdwZW5kaW5nJyB9PiwgcmVwbGFjZW1lbnQ6IEVuYWJsZW1lbnRSZXBsYWNlbWVudCk6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10ge1xuXHRcdGlmIChyZXBsYWNlbWVudC5yZXBsYWNlbWVudEtpbmQgPT09ICdmdWxsJykge1xuXHRcdFx0cmV0dXJuIFsuLi5yZXBsYWNlbWVudC5lbmFibGVtZW50XTtcblx0XHR9XG5cdFx0cmV0dXJuIHdpdGhDdXN0b21pemF0aW9uRW5hYmxlbWVudChjdXJyZW50LCByZXBsYWNlbWVudC5zY29wZSwgdGhpcy5fZW5hYmxlbWVudEVudHJ5KHJlcGxhY2VtZW50LCB3b3JraW5nRGlyZWN0b3J5KSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmFibGVtZW50RW50cnkocmVwbGFjZW1lbnQ6IElTY29wZWRFbmFibGVtZW50UmVwbGFjZW1lbnQsIHdvcmtpbmdEaXJlY3Rvcnk6IEV4Y2x1ZGU8V29ya2luZ0RpcmVjdG9yeVN0YXRlLCB7IGtpbmQ6ICdwZW5kaW5nJyB9Pik6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50IHtcblx0XHRzd2l0Y2ggKHJlcGxhY2VtZW50LnNjb3BlKSB7XG5cdFx0XHRjYXNlIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWw6XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHJlcGxhY2VtZW50LmVuYWJsZWQgfTtcblx0XHRcdGNhc2UgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZTpcblx0XHRcdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcnkua2luZCAhPT0gJ2RpcmVjdG9yeScpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZWNvcmQgd29ya3NwYWNlIGVuYWJsZW1lbnQgZm9yIGEgd29ya3NwYWNlLWxlc3Mgc2Vzc2lvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UsIHVyaTogd29ya2luZ0RpcmVjdG9yeS51cmkudG9TdHJpbmcoKSwgZW5hYmxlZDogcmVwbGFjZW1lbnQuZW5hYmxlZCB9O1xuXHRcdFx0Y2FzZSBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbjpcblx0XHRcdFx0cmV0dXJuIHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24sIGVuYWJsZWQ6IHJlcGxhY2VtZW50LmVuYWJsZWQgfTtcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0Y29uc3QgZXhoYXVzdGl2ZUtpbmQ6IG5ldmVyID0gcmVwbGFjZW1lbnQuc2NvcGU7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjdXN0b21pemF0aW9uIGVuYWJsZW1lbnQga2luZDogJHtleGhhdXN0aXZlS2luZH1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVJlcGxhY2VtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIGVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10sIHdvcmtpbmdEaXJlY3Rvcnk6IEV4Y2x1ZGU8V29ya2luZ0RpcmVjdG9yeVN0YXRlLCB7IGtpbmQ6ICdwZW5kaW5nJyB9Pik6IHZvaWQge1xuXHRcdC8vIFVwZGF0ZSBnbG9iYWwgZmlyc3Qgc28gd29ya3NwYWNlIGFuZCBzZXNzaW9uIGluaGVyaXRhbmNlIHNlZSB0aGUgbmV3IHZhbHVlLlxuXHRcdHRoaXMuX3NldEdsb2JhbChzZXNzaW9uLCB0YXJnZXQsIHRoaXMuX2dldEdsb2JhbFJlcGxhY2VtZW50KGVuYWJsZW1lbnQpKTtcblx0XHR0aGlzLl9yZXBsYWNlTm9uR2xvYmFsRW5hYmxlbWVudChzZXNzaW9uLCB0YXJnZXQsIGVuYWJsZW1lbnQsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0R2xvYmFsUmVwbGFjZW1lbnQoZW5hYmxlbWVudDogcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXSk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBlbmFibGVtZW50LmZpbmQoZW50cnkgPT4gZW50cnkua2luZCA9PT0gQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCk/LmVuYWJsZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZXBsYWNlTm9uR2xvYmFsRW5hYmxlbWVudChzZXNzaW9uOiBzdHJpbmcsIHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0LCBlbmFibGVtZW50OiByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdLCB3b3JraW5nRGlyZWN0b3J5OiBFeGNsdWRlPFdvcmtpbmdEaXJlY3RvcnlTdGF0ZSwgeyBraW5kOiAncGVuZGluZycgfT4pOiB2b2lkIHtcblx0XHRjb25zdCBieUtpbmQgPSBuZXcgTWFwKGVuYWJsZW1lbnQubWFwKGVudHJ5ID0+IFtlbnRyeS5raW5kLCBlbnRyeV0pKTtcblx0XHQvLyBBIHNjb3BlIGFic2VudCBmcm9tIHRoZSBpbmNvbWluZyBsaXN0IGlzIENMRUFSRUQ7IHJlcGxhY2VtZW50IGlzIG5ldmVyIGEgcGF0Y2guXG5cdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcnkua2luZCA9PT0gJ2RpcmVjdG9yeScpIHtcblx0XHRcdHRoaXMuX3NldFdvcmtzcGFjZShzZXNzaW9uLCB0YXJnZXQsIHdvcmtpbmdEaXJlY3RvcnkudXJpLCBieUtpbmQuZ2V0KEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5Xb3Jrc3BhY2UpPy5lbmFibGVkKTtcblx0XHR9XG5cdFx0dGhpcy5fc2V0U2Vzc2lvbihzZXNzaW9uLCB0YXJnZXQsIHdvcmtpbmdEaXJlY3RvcnksIGJ5S2luZC5nZXQoQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLlNlc3Npb24pPy5lbmFibGVkKTtcblx0fVxuXG5cblx0YXN5bmMgd2hlbklkbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fc3RvcmFnZVNlcnZpY2Uud2hlbklkbGUoKTtcblx0XHQvLyBBIHNldHRsZWQgd3JpdGUgcmVtb3ZlcyBpdHNlbGYgYW5kIGRvZXMgbm90IHF1ZXVlIGFub3RoZXIgd3JpdGUsIHNvIGVhY2hcblx0XHQvLyBsb29wIHBhc3Mgc3RyaWN0bHkgcmVkdWNlcyB0aGlzIHNldCB0byBhbnkgd3JpdGVzIHF1ZXVlZCBjb25jdXJyZW50bHkuXG5cdFx0d2hpbGUgKHRoaXMuX3BlbmRpbmdTZXNzaW9uV3JpdGVzLnNpemUgPiAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoWy4uLnRoaXMuX3BlbmRpbmdTZXNzaW9uV3JpdGVzXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZFNlc3Npb25FbmFibGVtZW50KHNlc3Npb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyYW5zaXRpb25lZCA9ICF0aGlzLl9zZXNzaW9uRW5hYmxlbWVudC5oYXMoc2Vzc2lvbik7XG5cdFx0bGV0IHJlZmVyZW5jZTogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPiB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0cmVmZXJlbmNlID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdFx0Y29uc3QgcmF3ID0gYXdhaXQgcmVmZXJlbmNlLm9iamVjdC5nZXRNZXRhZGF0YShTRVNTSU9OX01FVEFEQVRBX0tFWSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uRW5hYmxlbWVudC5zZXQoc2Vzc2lvbiwgdGhpcy5fcGFyc2VTZXNzaW9uRW5hYmxlbWVudChyYXcpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZV0gRmFpbGVkIHRvIHJlYWQgc2Vzc2lvbiBlbmFibGVtZW50IGZvciAke3Nlc3Npb259YCwgZXJyKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25FbmFibGVtZW50LnNldChzZXNzaW9uLCBuZXcgTWFwKCkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWZlcmVuY2U/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0aWYgKHRyYW5zaXRpb25lZCkge1xuXHRcdFx0Y29uc3QgYWZmZWN0ZWRTZXNzaW9ucyA9IHRoaXMuX2FwcGx5UGVuZGluZ1JlcGxhY2VtZW50cyhzZXNzaW9uKTtcblx0XHRcdGFmZmVjdGVkU2Vzc2lvbnMuYWRkKHNlc3Npb24pO1xuXHRcdFx0dGhpcy5fbm90aWZ5RGVjaXNpb25DaGFuZ2VkKGFmZmVjdGVkU2Vzc2lvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEdsb2JhbChzZXNzaW9uOiBzdHJpbmcsIHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0LCBlbmFibGVkOiBib29sZWFuIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0R2xvYmFsRW5hYmxlbWVudChzZXNzaW9uLCB0YXJnZXQsIGVuYWJsZWQsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q2xpZW50R2xvYmFsKHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9wZXJzaXN0ZW50S2V5KHRhcmdldCk7XG5cdFx0bGV0IGRlY2lzaW9ucyA9IHRoaXMuX2NsaWVudEdsb2JhbEVuYWJsZW1lbnQuZ2V0KHNlc3Npb24pO1xuXHRcdGlmIChkZWNpc2lvbnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVjaXNpb25zID0gbmV3IE1hcCgpO1xuXHRcdFx0dGhpcy5fY2xpZW50R2xvYmFsRW5hYmxlbWVudC5zZXQoc2Vzc2lvbiwgZGVjaXNpb25zKTtcblx0XHR9XG5cdFx0ZGVjaXNpb25zLnNldChrZXksIGVuYWJsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0R2xvYmFsRW5hYmxlbWVudChzZXNzaW9uOiBzdHJpbmcsIHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0LCBlbmFibGVkOiBib29sZWFuIHwgdW5kZWZpbmVkLCByZW1vdmVSZWR1bmRhbnRXb3Jrc3BhY2VEZWNpc2lvbnM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9wZXJzaXN0ZW50S2V5KHRhcmdldCk7XG5cdFx0Y29uc3QgZ2xvYmFsID0gdGhpcy5fcGVyc2lzdGVudC5nbG9iYWwgPz8ge307XG5cdFx0dGhpcy5fc2V0UGVyc2lzdGVudERlY2lzaW9uKCdnbG9iYWwnLCBnbG9iYWwsIGtleSwgZW5hYmxlZCwgdGhpcy5fY2xpZW50R2xvYmFsRW5hYmxlbWVudC5nZXQoc2Vzc2lvbik/LmdldChrZXkpID8/IERFRkFVTFRfQ1VTVE9NSVpBVElPTl9FTkFCTEVEKTtcblx0XHR0aGlzLl9wZXJzaXN0ZW50ID0geyAuLi50aGlzLl9wZXJzaXN0ZW50LCBnbG9iYWwgfTtcblx0XHRpZiAocmVtb3ZlUmVkdW5kYW50V29ya3NwYWNlRGVjaXNpb25zICYmIGdsb2JhbFtrZXldICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3JlbW92ZVJlZHVuZGFudFdvcmtzcGFjZURlY2lzaW9ucyhrZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9wZXJzaXN0KCk7XG5cdH1cblxuXHQvKipcblx0ICogYHVuZGVmaW5lZGAgY2xlYXJzIGEgc2NvcGUsIGFuZCBhIGRlY2lzaW9uIG1hdGNoaW5nIGl0cyBpbmhlcml0ZWQgdmFsdWUgaXMgY2xlYXJlZCB0b28uXG5cdCAqIFRoaXMgbGV0cyB0aGUgVUkgcmVzdG9yZSBpbmhlcml0YW5jZSB3aXRob3V0IGEgdGhpcmQgJ0luaGVyaXQnIGFjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3NldFBlcnNpc3RlbnREZWNpc2lvbihzY29wZTogSUxydUVudHJ5WydzY29wZSddLCBkZWNpc2lvbnM6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+LCBrZXk6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbiB8IHVuZGVmaW5lZCwgaW5oZXJpdGVkOiBib29sZWFuLCB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGVuYWJsZWQgPT09IHVuZGVmaW5lZCB8fCBlbmFibGVkID09PSBpbmhlcml0ZWQpIHtcblx0XHRcdGRlbGV0ZSBkZWNpc2lvbnNba2V5XTtcblx0XHRcdHRoaXMuX3JlbW92ZUxydShzY29wZSwga2V5LCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVjaXNpb25zW2tleV0gPSBlbmFibGVkO1xuXHRcdFx0dGhpcy5fdG91Y2hMcnUoeyBzY29wZSwga2V5LCAuLi4od29ya2luZ0RpcmVjdG9yeSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IHdvcmtpbmdEaXJlY3RvcnkgfSkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcGVyc2lzdGVudEtleSh0YXJnZXQ6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGdldEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2V5KHRhcmdldCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXNzaW9uS2V5KHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZ2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRLZXkodGFyZ2V0LCBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQuU2Vzc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIF93b3Jrc3BhY2VJbmhlcml0ZWRFbmFibGVtZW50KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wZXJzaXN0ZW50LndvcmtpbmdEaXJlY3Rvcmllcz8uW3dvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKV0/Llt0aGlzLl9wZXJzaXN0ZW50S2V5KHRhcmdldCldID8/IHRoaXMuX2dsb2JhbEVuYWJsZW1lbnQoc2Vzc2lvbiwgdGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX2dsb2JhbEVuYWJsZW1lbnQoc2Vzc2lvbjogc3RyaW5nLCB0YXJnZXQ6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudFRhcmdldCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX3BlcnNpc3RlbnRLZXkodGFyZ2V0KTtcblx0XHRyZXR1cm4gdGhpcy5fcGVyc2lzdGVudC5nbG9iYWw/LltrZXldID8/IHRoaXMuX2NsaWVudEdsb2JhbEVuYWJsZW1lbnQuZ2V0KHNlc3Npb24pPy5nZXQoa2V5KSA/PyBERUZBVUxUX0NVU1RPTUlaQVRJT05fRU5BQkxFRDtcblx0fVxuXG5cdHByaXZhdGUgX3NldFdvcmtzcGFjZShzZXNzaW9uOiBzdHJpbmcsIHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0LCB3b3JraW5nRGlyZWN0b3J5OiBVUkksIGVuYWJsZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9wZXJzaXN0ZW50S2V5KHRhcmdldCk7XG5cdFx0Y29uc3QgZGlyZWN0b3J5S2V5ID0gd29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX3BlcnNpc3RlbnQud29ya2luZ0RpcmVjdG9yaWVzID8/IHt9O1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHdvcmtpbmdEaXJlY3Rvcmllc1tkaXJlY3RvcnlLZXldID8/IHt9O1xuXHRcdHRoaXMuX3NldFBlcnNpc3RlbnREZWNpc2lvbignd29ya3NwYWNlJywgd29ya3NwYWNlLCBrZXksIGVuYWJsZWQsIHRoaXMuX2dsb2JhbEVuYWJsZW1lbnQoc2Vzc2lvbiwgdGFyZ2V0KSwgZGlyZWN0b3J5S2V5KTtcblx0XHR3b3JraW5nRGlyZWN0b3JpZXNbZGlyZWN0b3J5S2V5XSA9IHdvcmtzcGFjZTtcblx0XHR0aGlzLl9wZXJzaXN0ZW50ID0geyAuLi50aGlzLl9wZXJzaXN0ZW50LCB3b3JraW5nRGlyZWN0b3JpZXMgfTtcblx0XHR0aGlzLl9wZXJzaXN0KCk7XG5cdH1cblxuXHQvKiogTmVlZHMgdGhlIHdvcmtpbmctZGlyZWN0b3J5IHN0YXRlIHRvIGNhbGN1bGF0ZSB0aGUgbG93ZXItc2NvcGUgaW5oZXJpdGVkIHZhbHVlIGJlZm9yZSBjbGVhcmluZy4gKi9cblx0cHJpdmF0ZSBfc2V0U2Vzc2lvbihzZXNzaW9uOiBzdHJpbmcsIHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0LCB3b3JraW5nRGlyZWN0b3J5OiBFeGNsdWRlPFdvcmtpbmdEaXJlY3RvcnlTdGF0ZSwgeyBraW5kOiAncGVuZGluZycgfT4sIGVuYWJsZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVtZW50ID0gdGhpcy5fc2Vzc2lvbkVuYWJsZW1lbnQuZ2V0KHNlc3Npb24pO1xuXHRcdGlmIChlbmFibGVtZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBlbmFibGVtZW50IGhhcyBub3QgYmVlbiBpbml0aWFsaXplZDogJHtzZXNzaW9ufWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluaGVyaXRlZCA9IHdvcmtpbmdEaXJlY3Rvcnkua2luZCA9PT0gJ2RpcmVjdG9yeSdcblx0XHRcdD8gdGhpcy5fd29ya3NwYWNlSW5oZXJpdGVkRW5hYmxlbWVudChzZXNzaW9uLCB0YXJnZXQsIHdvcmtpbmdEaXJlY3RvcnkudXJpKVxuXHRcdFx0OiB0aGlzLl9nbG9iYWxFbmFibGVtZW50KHNlc3Npb24sIHRhcmdldCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHRoaXMuX3Nlc3Npb25LZXkodGFyZ2V0KTtcblx0XHRpZiAoZW5hYmxlZCA9PT0gdW5kZWZpbmVkIHx8IGVuYWJsZWQgPT09IGluaGVyaXRlZCkge1xuXHRcdFx0ZW5hYmxlbWVudC5kZWxldGUoc2Vzc2lvbktleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVuYWJsZW1lbnQuc2V0KHNlc3Npb25LZXksIGVuYWJsZWQpO1xuXHRcdH1cblx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbihzZXNzaW9uLCBlbmFibGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3BlcnNpc3RTZXNzaW9uKHNlc3Npb246IHN0cmluZywgZW5hYmxlbWVudDogUmVhZG9ubHlNYXA8c3RyaW5nLCBib29sZWFuPik6IHZvaWQge1xuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRjb25zdCB3cml0ZSA9IHJlZmVyZW5jZS5vYmplY3Quc2V0TWV0YWRhdGEoU0VTU0lPTl9NRVRBREFUQV9LRVksIEpTT04uc3RyaW5naWZ5KE9iamVjdC5mcm9tRW50cmllcyhlbmFibGVtZW50KSkpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlXSBGYWlsZWQgdG8gd3JpdGUgc2Vzc2lvbiBlbmFibGVtZW50IGZvciAke3Nlc3Npb259YCwgZXJyKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHJlZmVyZW5jZS5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uV3JpdGVzLmFkZCh3cml0ZSk7XG5cdFx0Y29uc3QgdW50cmFjayA9ICgpID0+IHRoaXMuX3BlbmRpbmdTZXNzaW9uV3JpdGVzLmRlbGV0ZSh3cml0ZSk7XG5cdFx0d3JpdGUudGhlbih1bnRyYWNrLCB1bnRyYWNrKTtcblx0fVxuXG5cdC8qKiBQcnVuZXMgbWF0Y2hpbmcgd29ya3NwYWNlIGRlY2lzaW9ucyBpbiBldmVyeSBzdG9yZWQgZGlyZWN0b3J5LCBwcmVzZXJ2aW5nIG9ubHkgb3ZlcnJpZGVzIHRoYXQgYmVhdCB0aGUgbmV3IGdsb2JhbCB2YWx1ZS4gKi9cblx0cHJpdmF0ZSBfcmVtb3ZlUmVkdW5kYW50V29ya3NwYWNlRGVjaXNpb25zKGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5oZXJpdGVkID0gdGhpcy5fcGVyc2lzdGVudC5nbG9iYWw/LltrZXldO1xuXHRcdGlmIChpbmhlcml0ZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFtkaXJlY3RvcnksIHZhbHVlc10gb2YgT2JqZWN0LmVudHJpZXModGhpcy5fcGVyc2lzdGVudC53b3JraW5nRGlyZWN0b3JpZXMgPz8ge30pKSB7XG5cdFx0XHRpZiAodmFsdWVzW2tleV0gPT09IGluaGVyaXRlZCkge1xuXHRcdFx0XHRkZWxldGUgdmFsdWVzW2tleV07XG5cdFx0XHRcdHRoaXMuX3JlbW92ZUxydSgnd29ya3NwYWNlJywga2V5LCBkaXJlY3RvcnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BlcnNpc3QoKTogdm9pZCB7XG5cdFx0dGhpcy5fZXZpY3RMcnUoKTtcblx0XHRjb25zdCBnbG9iYWwgPSB0aGlzLl9wZXJzaXN0ZW50Lmdsb2JhbCAmJiBPYmplY3Qua2V5cyh0aGlzLl9wZXJzaXN0ZW50Lmdsb2JhbCkubGVuZ3RoID4gMCA/IHRoaXMuX3BlcnNpc3RlbnQuZ2xvYmFsIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyh0aGlzLl9wZXJzaXN0ZW50LndvcmtpbmdEaXJlY3RvcmllcyA/PyB7fSkuZmlsdGVyKChbLCB2YWx1ZXNdKSA9PiBPYmplY3Qua2V5cyh2YWx1ZXMpLmxlbmd0aCA+IDApKTtcblx0XHR0aGlzLl9wZXJzaXN0ZW50ID0ge1xuXHRcdFx0Li4uKGdsb2JhbCA/IHsgZ2xvYmFsIH0gOiB7fSksXG5cdFx0XHQuLi4oT2JqZWN0LmtleXMod29ya2luZ0RpcmVjdG9yaWVzKS5sZW5ndGggPiAwID8geyB3b3JraW5nRGlyZWN0b3JpZXMgfSA6IHt9KSxcblx0XHR9O1xuXHRcdGlmIChPYmplY3Qua2V5cyh0aGlzLl9wZXJzaXN0ZW50KS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmRlbGV0ZShTVE9SQUdFX0tFWSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnNldChTVE9SQUdFX0tFWSwgdGhpcy5fcGVyc2lzdGVudCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9scnUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5kZWxldGUoTFJVX1NUT1JBR0VfS0VZKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc2V0KExSVV9TVE9SQUdFX0tFWSwgdGhpcy5fbHJ1KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90b3VjaExydShlbnRyeTogSUxydUVudHJ5KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVtb3ZlTHJ1KGVudHJ5LnNjb3BlLCBlbnRyeS5rZXksIGVudHJ5LndvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdC8vIFJlY2VuY3kgaXMgZGVsaWJlcmF0ZWx5IHVwZGF0ZWQgb25seSBvbiB3cml0ZXMsIG5vdCByZWFkcywgdG8ga2VlcFxuXHRcdC8vIHBlcnNpc3RlbmNlIGNoZWFwIGFuZCBkZXRlcm1pbmlzdGljIGFjcm9zcyByZXN0YXJ0cy5cblx0XHR0aGlzLl9scnUucHVzaChlbnRyeSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVMcnUoc2NvcGU6IElMcnVFbnRyeVsnc2NvcGUnXSwga2V5OiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9scnUgPSB0aGlzLl9scnUuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnNjb3BlICE9PSBzY29wZSB8fCBlbnRyeS5rZXkgIT09IGtleSB8fCBlbnRyeS53b3JraW5nRGlyZWN0b3J5ICE9PSB3b3JraW5nRGlyZWN0b3J5KTtcblx0fVxuXG5cdHByaXZhdGUgX2V2aWN0THJ1KCk6IHZvaWQge1xuXHRcdHdoaWxlICh0aGlzLl9scnUubGVuZ3RoID4gTUFYX1BFUlNJU1RFRF9ERUNJU0lPTlMpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fbHJ1LnNoaWZ0KCkhO1xuXHRcdFx0aWYgKGVudHJ5LnNjb3BlID09PSAnZ2xvYmFsJykge1xuXHRcdFx0XHRkZWxldGUgdGhpcy5fcGVyc2lzdGVudC5nbG9iYWw/LltlbnRyeS5rZXldO1xuXHRcdFx0fSBlbHNlIGlmIChlbnRyeS53b3JraW5nRGlyZWN0b3J5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZGVsZXRlIHRoaXMuX3BlcnNpc3RlbnQud29ya2luZ0RpcmVjdG9yaWVzPy5bZW50cnkud29ya2luZ0RpcmVjdG9yeV0/LltlbnRyeS5rZXldO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlYWRQZXJzaXN0ZW50RW5hYmxlbWVudCgpOiBJUGVyc2lzdGVkRW5hYmxlbWVudCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQ8dW5rbm93bj4oU1RPUkFHRV9LRVkpO1xuXHRcdGlmICghaXNSZWNvcmQodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGNvbnN0IGdsb2JhbCA9IHJlYWRCb29sZWFuUmVjb3JkKHZhbHVlWydnbG9iYWwnXSk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gaXNSZWNvcmQodmFsdWVbJ3dvcmtpbmdEaXJlY3RvcmllcyddKVxuXHRcdFx0PyBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXModmFsdWVbJ3dvcmtpbmdEaXJlY3RvcmllcyddKS5tYXAoKFtkaXJlY3RvcnksIGRlY2lzaW9uc10pID0+IFtkaXJlY3RvcnksIHJlYWRCb29sZWFuUmVjb3JkKGRlY2lzaW9ucyldKS5maWx0ZXIoKFssIGRlY2lzaW9uc10pID0+IE9iamVjdC5rZXlzKGRlY2lzaW9ucykubGVuZ3RoID4gMCkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uKGdsb2JhbCAmJiBPYmplY3Qua2V5cyhnbG9iYWwpLmxlbmd0aCA+IDAgPyB7IGdsb2JhbCB9IDoge30pLFxuXHRcdFx0Li4uKHdvcmtpbmdEaXJlY3RvcmllcyAmJiBPYmplY3Qua2V5cyh3b3JraW5nRGlyZWN0b3JpZXMpLmxlbmd0aCA+IDAgPyB7IHdvcmtpbmdEaXJlY3RvcmllcyB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkTHJ1KCk6IElMcnVFbnRyeVtdIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldDx1bmtub3duPihMUlVfU1RPUkFHRV9LRVkpO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlLmZpbHRlcigoZW50cnkpOiBlbnRyeSBpcyBJTHJ1RW50cnkgPT5cblx0XHRcdGlzUmVjb3JkKGVudHJ5KVxuXHRcdFx0JiYgKGVudHJ5WydzY29wZSddID09PSAnZ2xvYmFsJyB8fCBlbnRyeVsnc2NvcGUnXSA9PT0gJ3dvcmtzcGFjZScpXG5cdFx0XHQmJiB0eXBlb2YgZW50cnlbJ2tleSddID09PSAnc3RyaW5nJ1xuXHRcdFx0JiYgKGVudHJ5Wyd3b3JraW5nRGlyZWN0b3J5J10gPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgZW50cnlbJ3dvcmtpbmdEaXJlY3RvcnknXSA9PT0gJ3N0cmluZycpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZUxydSgpOiB2b2lkIHtcblx0XHRjb25zdCBwZXJzaXN0ZWRFbnRyaWVzOiBJTHJ1RW50cnlbXSA9IFtcblx0XHRcdC4uLk9iamVjdC5rZXlzKHRoaXMuX3BlcnNpc3RlbnQuZ2xvYmFsID8/IHt9KS5zb3J0KCkubWFwKGtleSA9PiAoeyBzY29wZTogJ2dsb2JhbCcgYXMgY29uc3QsIGtleSB9KSksXG5cdFx0XHQuLi5PYmplY3QuZW50cmllcyh0aGlzLl9wZXJzaXN0ZW50LndvcmtpbmdEaXJlY3RvcmllcyA/PyB7fSkuZmxhdE1hcCgoW3dvcmtpbmdEaXJlY3RvcnksIHZhbHVlc10pID0+IE9iamVjdC5rZXlzKHZhbHVlcykuc29ydCgpLm1hcChrZXkgPT4gKHsgc2NvcGU6ICd3b3Jrc3BhY2UnIGFzIGNvbnN0LCBrZXksIHdvcmtpbmdEaXJlY3RvcnkgfSkpKSxcblx0XHRdO1xuXHRcdGNvbnN0IHZhbGlkID0gdGhpcy5fbHJ1LmZpbHRlcihlbnRyeSA9PiBwZXJzaXN0ZWRFbnRyaWVzLnNvbWUoY2FuZGlkYXRlID0+IGVudHJpZXNFcXVhbChjYW5kaWRhdGUsIGVudHJ5KSkpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgcGVyc2lzdGVkRW50cmllcykge1xuXHRcdFx0aWYgKCF2YWxpZC5zb21lKGNhbmRpZGF0ZSA9PiBlbnRyaWVzRXF1YWwoY2FuZGlkYXRlLCBlbnRyeSkpKSB7XG5cdFx0XHRcdHZhbGlkLnB1c2goZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9scnUgPSB2YWxpZDtcblx0XHR0aGlzLl9ldmljdExydSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VTZXNzaW9uRW5hYmxlbWVudChyYXc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IE1hcDxzdHJpbmcsIGJvb2xlYW4+IHtcblx0XHRpZiAocmF3ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBuZXcgTWFwKCk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcChPYmplY3QuZW50cmllcyhyZWFkQm9vbGVhblJlY29yZChKU09OLnBhcnNlKHJhdykpKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NhcHR1cmVEZWNpc2lvblNuYXBzaG90KHNlc3Npb246IHN0cmluZywgdGFyZ2V0OiBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRUYXJnZXQpOiBJRW5hYmxlbWVudERlY2lzaW9uU25hcHNob3Qge1xuXHRcdGNvbnN0IHBlcnNpc3RlbnRLZXkgPSB0aGlzLl9wZXJzaXN0ZW50S2V5KHRhcmdldCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cdFx0Zm9yIChjb25zdCBbZGlyZWN0b3J5LCBkZWNpc2lvbnNdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMuX3BlcnNpc3RlbnQud29ya2luZ0RpcmVjdG9yaWVzID8/IHt9KSkge1xuXHRcdFx0Y29uc3QgZGVjaXNpb24gPSBkZWNpc2lvbnNbcGVyc2lzdGVudEtleV07XG5cdFx0XHRpZiAoZGVjaXNpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR3b3Jrc3BhY2Uuc2V0KGRpcmVjdG9yeSwgZGVjaXNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2xvYmFsOiB0aGlzLl9wZXJzaXN0ZW50Lmdsb2JhbD8uW3BlcnNpc3RlbnRLZXldLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0c2Vzc2lvbjogdGhpcy5fc2Vzc2lvbkVuYWJsZW1lbnQuZ2V0KHNlc3Npb24pPy5nZXQodGhpcy5fc2Vzc2lvbktleSh0YXJnZXQpKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWZmZWN0ZWRTZXNzaW9ucyhzZXNzaW9uOiBzdHJpbmcsIHRhcmdldDogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50VGFyZ2V0LCBiZWZvcmU6IElFbmFibGVtZW50RGVjaXNpb25TbmFwc2hvdCk6IFNldDxzdHJpbmc+IHtcblx0XHRjb25zdCBhZnRlciA9IHRoaXMuX2NhcHR1cmVEZWNpc2lvblNuYXBzaG90KHNlc3Npb24sIHRhcmdldCk7XG5cdFx0Y29uc3QgYWZmZWN0ZWRTZXNzaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGlmIChiZWZvcmUuZ2xvYmFsICE9PSBhZnRlci5nbG9iYWwpIHtcblx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuX3Nlc3Npb25TdGF0ZS5nZXRTZXNzaW9uVXJpcygpKSB7XG5cdFx0XHRcdGFmZmVjdGVkU2Vzc2lvbnMuYWRkKGNhbmRpZGF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZGlyZWN0b3J5IG9mIG5ldyBTZXQoWy4uLmJlZm9yZS53b3Jrc3BhY2Uua2V5cygpLCAuLi5hZnRlci53b3Jrc3BhY2Uua2V5cygpXSkpIHtcblx0XHRcdGlmIChiZWZvcmUud29ya3NwYWNlLmdldChkaXJlY3RvcnkpICE9PSBhZnRlci53b3Jrc3BhY2UuZ2V0KGRpcmVjdG9yeSkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgdGhpcy5fc2Vzc2lvblN0YXRlLmdldFNlc3Npb25VcmlzKCkpIHtcblx0XHRcdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gdGhpcy5nZXRXb3JraW5nRGlyZWN0b3J5U3RhdGUoY2FuZGlkYXRlKTtcblx0XHRcdFx0XHRpZiAod29ya2luZ0RpcmVjdG9yeS5raW5kID09PSAnZGlyZWN0b3J5JyAmJiB3b3JraW5nRGlyZWN0b3J5LnVyaS50b1N0cmluZygpID09PSBkaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRcdGFmZmVjdGVkU2Vzc2lvbnMuYWRkKGNhbmRpZGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChiZWZvcmUuc2Vzc2lvbiAhPT0gYWZ0ZXIuc2Vzc2lvbikge1xuXHRcdFx0YWZmZWN0ZWRTZXNzaW9ucy5hZGQoc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBhZmZlY3RlZFNlc3Npb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm90aWZ5RGVjaXNpb25DaGFuZ2VkKHNlc3Npb25zOiBJdGVyYWJsZTxzdHJpbmc+KTogdm9pZCB7XG5cdFx0Y29uc3QgYWZmZWN0ZWRTZXNzaW9ucyA9IFsuLi5uZXcgU2V0KHNlc3Npb25zKV07XG5cdFx0aWYgKGFmZmVjdGVkU2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHNlc3Npb25zOiBhZmZlY3RlZFNlc3Npb25zIH0pO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSUVuYWJsZW1lbnREZWNpc2lvblNuYXBzaG90IHtcblx0cmVhZG9ubHkgZ2xvYmFsOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IFJlYWRvbmx5TWFwPHN0cmluZywgYm9vbGVhbj47XG5cdHJlYWRvbmx5IHNlc3Npb246IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzUmVjb3JkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRyZXR1cm4gdmFsdWUgIT09IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHJlYWRCb29sZWFuUmVjb3JkKHZhbHVlOiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4ge1xuXHRpZiAoIWlzUmVjb3JkKHZhbHVlKSkge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG5cdGZvciAoY29uc3QgW2tleSwgZGVjaXNpb25dIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlKSkge1xuXHRcdGlmICh0eXBlb2YgZGVjaXNpb24gPT09ICdib29sZWFuJykge1xuXHRcdFx0cmVzdWx0W2tleV0gPSBkZWNpc2lvbjtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZW50cmllc0VxdWFsKGE6IElMcnVFbnRyeSwgYjogSUxydUVudHJ5KTogYm9vbGVhbiB7XG5cdHJldHVybiBhLnNjb3BlID09PSBiLnNjb3BlICYmIGEua2V5ID09PSBiLmtleSAmJiBhLndvcmtpbmdEaXJlY3RvcnkgPT09IGIud29ya2luZ0RpcmVjdG9yeTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVkseUJBQTBDO0FBQy9ELFNBQVMsV0FBVztBQUNwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJCQUFrRDtBQUMzRCxTQUFTLCtCQUErQix3QkFBd0IsNkJBQTZCLG1DQUFtQztBQUNoSSxTQUFTLGtCQUFrQixvQ0FBb0MsZ0NBQWdDO0FBQy9GLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCLHlCQUF1RDtBQUM3RixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFnQyw4QkFBOEI7QUFHOUQsTUFBTSxjQUFjO0FBQ3BCLE1BQU0sa0JBQWtCO0FBQ3hCLE1BQU0sdUJBQXVCO0FBRTdCLE1BQU0sMEJBQTBCO0FBbUV6QixNQUFNLDJDQUEyQyxnQkFBMEQseUNBQXlDO0FBbUJwSixTQUFTLDhCQUE4QixRQUF3QyxNQUEyQztBQUNoSSxNQUFJLFNBQVMsNEJBQTRCLFNBQVM7QUFDakQsV0FBTyxPQUFPO0FBQUEsRUFDZjtBQUVBLFVBQVEsT0FBTyxNQUFNO0FBQUEsSUFDcEIsS0FBSyxrQkFBa0I7QUFDdEIsYUFBTyxPQUFPLE9BQU8sU0FBUztBQUFBLElBQy9CLEtBQUssa0JB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
