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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived } from "../../../../base/common/observable.js";
import { localize2 } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { AGENT_HOST_SCHEME, fromAgentHostUri } from "../../../../platform/agentHost/common/agentHostUri.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { IAgentHostTerminalService } from "../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js";
import { ITerminalService } from "../../../../workbench/contrib/terminal/browser/terminal.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { IPathService } from "../../../../workbench/services/path/common/pathService.js";
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../common/agentHostSessionsProvider.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { ITerminalProfileService } from "../../../../workbench/contrib/terminal/common/terminal.js";
import { ISessionTaskRunnerRegistry } from "../../chat/browser/sessionTaskRunner.js";
import { AgentHostSessionTaskRunner } from "./agentHostSessionTaskRunner.js";
function getSessionTerminalInfo(session, reader) {
  if (!session) {
    return void 0;
  }
  const workspace = reader ? session.workspace.read(reader) : session.workspace.get();
  if (workspace?.isVirtualWorkspace !== false) {
    return void 0;
  }
  const folder = workspace.folders[0];
  const cwd = folder?.workingDirectory;
  if (!cwd) {
    return void 0;
  }
  if (cwd.scheme === AGENT_HOST_SCHEME) {
    return { cwd: fromAgentHostUri(cwd), agentHostCwd: cwd };
  }
  return { cwd };
}
let SessionsTerminalContribution = class extends Disposable {
  constructor(_sessionsManagementService, _sessionsService, _sessionsProvidersService, _terminalService, _agentHostTerminalService, _logService, _pathService, _terminalProfileService) {
    super();
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._terminalService = _terminalService;
    this._agentHostTerminalService = _agentHostTerminalService;
    this._logService = _logService;
    this._pathService = _pathService;
    this._terminalProfileService = _terminalProfileService;
    this._sessionTerminals = /* @__PURE__ */ new Map();
    this._standaloneTerminalIds = /* @__PURE__ */ new Set();
    /** In-flight terminal work for drafts, retained only until each operation settles. */
    this._pendingTerminalOperations = /* @__PURE__ */ new Map();
    /**
     * Session ids already processed as archived. The archive cleanup runs only
     * on the not-archived → archived transition: the provider keeps archived
     * sessions cached and re-emits them in `changed` on every sync, so acting on
     * the current archived state would re-run the cwd cleanup each time and sweep
     * terminals the user opened afterwards. See #313510, #318645.
     */
    this._archivedSessionIds = /* @__PURE__ */ new Set();
    for (const session of this._sessionsManagementService.getSessions()) {
      if (session.isArchived.get()) {
        this._archivedSessionIds.add(session.sessionId);
      }
    }
    const profileOverride = derived((reader) => {
      const session = this._sessionsService.activeSession.read(reader);
      if (!session || session.providerId === LOCAL_AGENT_HOST_PROVIDER_ID) {
        return;
      }
      const address = this._getSessionAgentHostAddress(session);
      if (!address) {
        return;
      }
      const profiles = this._agentHostTerminalService.profiles.read(reader);
      return profiles.find((p) => p.address === address) ?? this._agentHostTerminalService.getProfileForConnection(address);
    });
    this._register(autorun((reader) => {
      const profile = profileOverride.read(reader);
      if (profile) {
        reader.store.add(this._terminalProfileService.overrideDefaultProfile(
          profile.extensionIdentifier,
          profile.profileId
        ));
      }
    }));
    this._register(autorun((reader) => {
      const session = this._sessionsService.activeSession.read(reader);
      if (session?.loading.read(reader)) {
        this._agentHostTerminalService.setDefaultCwd(void 0);
        return;
      }
      const info = getSessionTerminalInfo(session, reader);
      this._agentHostTerminalService.setDefaultCwd(info?.cwd);
    }));
    this._register(autorun((reader) => {
      const session = this._sessionsService.activeSession.read(reader);
      if (session?.loading.read(reader)) {
        this._activeKey = void 0;
        this._activeSessionId = void 0;
        return;
      }
      this._onActiveSessionChanged(session);
    }));
    this._register(this._sessionsManagementService.onDidReplaceNewDraftSession(({ from, to }) => {
      this._onDidReplaceNewDraftSession(from, to);
    }));
    this._register(this._sessionsManagementService.onDidReplaceSession(({ from, to }) => {
      this._transferTerminals(from.sessionId, to.sessionId);
    }));
    this._register(this._terminalService.onDidDisposeInstance((instance) => {
      this._removeTerminalFromTrackedSessions(instance.instanceId);
      this._standaloneTerminalIds.delete(instance.instanceId);
    }));
    this._register(this._terminalService.onDidCreateInstance((instance) => {
      if (instance.shellLaunchConfig.hideFromUser) {
        return;
      }
      if (instance.shellLaunchConfig.attachPersistentProcess && this._activeKey) {
        instance.getInitialCwd().then((cwd) => {
          if (cwd.toLowerCase() !== this._activeKey) {
            const availableInstance = this._getAvailableTerminal(instance, `hide restored terminal for ${cwd}`);
            if (!availableInstance) {
              return;
            }
            this._terminalService.moveToBackground(availableInstance);
            this._logService.trace(`[SessionsTerminal] Hid restored terminal ${availableInstance.instanceId} (cwd: ${cwd})`);
          }
        });
      }
    }));
    this._register(this._sessionsManagementService.onDidChangeSessions((e) => {
      for (const session of e.added) {
        if (session.isArchived.get()) {
          this._archivedSessionIds.add(session.sessionId);
        }
      }
      const justArchived = [];
      for (const session of e.changed) {
        if (session.isArchived.get()) {
          if (!this._archivedSessionIds.has(session.sessionId)) {
            this._archivedSessionIds.add(session.sessionId);
            justArchived.push(session);
          }
        } else {
          this._archivedSessionIds.delete(session.sessionId);
        }
      }
      for (const session of e.removed) {
        this._archivedSessionIds.delete(session.sessionId);
      }
      if (e.removed.length === 0 && justArchived.length === 0) {
        return;
      }
      this._logService.trace(`[SessionsTerminal] onDidChangeSessions cleanup (removed: ${e.removed.length}, justArchived: ${justArchived.length}, trackedSessions: ${this._sessionTerminals.size}, activeKey: ${this._activeKey ?? "<none>"})`);
      for (const session of e.removed) {
        void this._closeTerminalsForSession(session.sessionId, `session removed (${session.sessionId})`).finally(() => this._sessionTerminals.delete(session.sessionId));
      }
      for (const session of justArchived) {
        void this._hideTerminalsForSession(session.sessionId, `session archived (${session.sessionId})`);
      }
    }));
  }
  /**
   * Ensures a terminal exists for the given cwd. When a session is provided,
   * tracked terminals for that session id are preferred; otherwise the method
   * falls back to matching untracked terminals by initial cwd for backward
   * compatibility before creating a new terminal. Sets newly created terminals
   * as active and optionally focuses them.
   *
   * When {@link session} is provided and the session is backed by an agent
   * host, the terminal is created on the agent host instead of locally.
   */
  async ensureTerminal(cwd, focus, session) {
    if (!session) {
      return this._ensureTerminal(cwd, focus, session);
    }
    this._beginTerminalOperation(session.sessionId);
    try {
      return await this._ensureTerminal(cwd, focus, session);
    } finally {
      this._endTerminalOperation(session.sessionId);
    }
  }
  async _ensureTerminal(cwd, focus, session) {
    if (session && this._pendingTerminalOperations.get(session.sessionId)?.replaced) {
      return [];
    }
    const key = cwd.fsPath.toLowerCase();
    let existing = session ? this._getTrackedTerminalsForSession(session.sessionId) : [];
    if (existing.length === 0) {
      existing = await this._findTerminalsForKey(key, { excludeTracked: !!session });
      if (session && this._pendingTerminalOperations.get(session.sessionId)?.replaced) {
        return [];
      }
    }
    if (existing.length === 0) {
      try {
        const instance = await this._createTerminalForSession(cwd, session);
        const createdInstance = this._getAvailableTerminal(instance, `activate created terminal for ${cwd.fsPath}`);
        if (!createdInstance) {
          return [];
        }
        if (session && this._pendingTerminalOperations.get(session.sessionId)?.replaced) {
          await this._terminalService.safeDisposeTerminal(createdInstance);
          return [];
        }
        existing = [createdInstance];
        this._terminalService.setActiveInstance(createdInstance);
        this._logService.trace(`[SessionsTerminal] Created terminal ${createdInstance.instanceId} for ${cwd.fsPath}`);
      } catch (e) {
        this._logService.trace(`[SessionsTerminal] Cannot create terminal for ${cwd.fsPath}: ${e}`);
        return [];
      }
    }
    if (session) {
      this._trackTerminalsForSession(session.sessionId, existing);
    }
    if (focus) {
      await this._terminalService.focusActiveInstance();
    }
    return existing;
  }
  /**
   * Creates a terminal for the given cwd. If the session is backed by an
   * agent host, creates an agent host terminal; otherwise creates a local one.
   */
  async _createTerminalForSession(cwd, session) {
    const address = session && this._getSessionAgentHostAddress(session);
    if (address) {
      const instance = await this._agentHostTerminalService.createTerminalForEntry(address, { cwd });
      if (instance) {
        return instance;
      }
    }
    return this._terminalService.createTerminal({ config: { cwd } });
  }
  /**
   * Returns the agent host address for the given session's provider,
   * or `undefined` if the session is not backed by an agent host.
   */
  _getSessionAgentHostAddress(session) {
    if (!session) {
      return void 0;
    }
    const provider = this._sessionsProvidersService.getProvider(session.providerId);
    if (!provider || !isAgentHostProvider(provider)) {
      return void 0;
    }
    return provider.remoteAddress ?? "__local__";
  }
  async _onActiveSessionChanged(session) {
    if (!session) {
      return;
    }
    this._beginTerminalOperation(session.sessionId);
    try {
      const info = getSessionTerminalInfo(session);
      const targetPath = info?.cwd ?? await this._pathService.userHome();
      const targetKey = targetPath.fsPath.toLowerCase();
      if (this._activeKey === targetKey && this._activeSessionId === session.sessionId) {
        return;
      }
      this._activeKey = targetKey;
      this._activeSessionId = session.sessionId;
      const instances = await this._ensureTerminal(targetPath, false, session);
      if (this._activeKey !== targetKey || this._activeSessionId !== session.sessionId) {
        return;
      }
      await this._updateTerminalVisibility(session, targetKey, instances.map((instance) => instance.instanceId));
    } finally {
      this._endTerminalOperation(session.sessionId);
    }
  }
  /**
   * Finds all terminal instances whose initial cwd (lower-cased) matches
   * the given key.
   */
  async _findTerminalsForKey(key, options) {
    const result = [];
    for (const instance of this._terminalService.instances) {
      if (instance.shellLaunchConfig.hideFromUser) {
        continue;
      }
      if (options?.excludeTracked && (this._isTerminalTracked(instance.instanceId) || this._standaloneTerminalIds.has(instance.instanceId))) {
        continue;
      }
      try {
        const cwd = await instance.getInitialCwd();
        if (cwd.toLowerCase() === key) {
          result.push(instance);
        }
      } catch {
      }
    }
    return result;
  }
  _trackTerminalsForSession(sessionId, instances) {
    if (instances.length === 0) {
      return;
    }
    let terminalIds = this._sessionTerminals.get(sessionId);
    if (!terminalIds) {
      terminalIds = /* @__PURE__ */ new Set();
      this._sessionTerminals.set(sessionId, terminalIds);
    }
    for (const instance of instances) {
      terminalIds.add(instance.instanceId);
    }
  }
  _beginTerminalOperation(sessionId) {
    const operation = this._pendingTerminalOperations.get(sessionId);
    if (operation) {
      operation.count++;
      return;
    }
    this._pendingTerminalOperations.set(sessionId, { count: 1, replaced: false });
  }
  _endTerminalOperation(sessionId) {
    const operation = this._pendingTerminalOperations.get(sessionId);
    if (!operation) {
      return;
    }
    operation.count--;
    if (operation.count > 0) {
      return;
    }
    this._pendingTerminalOperations.delete(sessionId);
  }
  _onDidReplaceNewDraftSession(from, to) {
    const pendingOperation = this._pendingTerminalOperations.get(from.sessionId);
    if (pendingOperation) {
      pendingOperation.replaced = true;
    }
    const fromCwd = getSessionTerminalInfo(from)?.cwd.fsPath.toLowerCase();
    const toCwd = getSessionTerminalInfo(to)?.cwd.fsPath.toLowerCase();
    const fromAgentHostAddress = this._getSessionAgentHostAddress(from);
    const toAgentHostAddress = this._getSessionAgentHostAddress(to);
    if (fromCwd === toCwd && fromAgentHostAddress === toAgentHostAddress) {
      this._transferTerminals(from.sessionId, to.sessionId);
    } else {
      this._rehomeTerminals(from.sessionId);
    }
  }
  _rehomeTerminals(sessionId) {
    const terminals = this._getTrackedTerminalsForSession(sessionId);
    for (const terminal of terminals) {
      this._standaloneTerminalIds.add(terminal.instanceId);
    }
    if (terminals.length > 0) {
      this._logService.trace(`[SessionsTerminal] Rehomed ${terminals.length} terminal(s) from session ${sessionId}`);
    }
    this._sessionTerminals.delete(sessionId);
  }
  _transferTerminals(fromSessionId, toSessionId) {
    const terminalIds = this._sessionTerminals.get(fromSessionId);
    if (terminalIds && terminalIds.size > 0) {
      let targetIds = this._sessionTerminals.get(toSessionId);
      if (!targetIds) {
        targetIds = /* @__PURE__ */ new Set();
        this._sessionTerminals.set(toSessionId, targetIds);
      }
      for (const id of terminalIds) {
        targetIds.add(id);
      }
      this._logService.trace(`[SessionsTerminal] Transferred ${terminalIds.size} terminal(s) from session ${fromSessionId} to ${toSessionId}`);
    }
    this._sessionTerminals.delete(fromSessionId);
  }
  _getTrackedTerminalsForSession(sessionId) {
    const terminalIds = this._sessionTerminals.get(sessionId);
    if (!terminalIds) {
      return [];
    }
    const result = [];
    for (const instanceId of [...terminalIds]) {
      const instance = this._terminalService.getInstanceFromId(instanceId);
      if (!instance || instance.isDisposed || instance.shellLaunchConfig.hideFromUser) {
        terminalIds.delete(instanceId);
        continue;
      }
      result.push(instance);
    }
    if (terminalIds.size === 0) {
      this._sessionTerminals.delete(sessionId);
    }
    return result;
  }
  _isTerminalTracked(instanceId) {
    for (const [sessionId, terminalIds] of this._sessionTerminals) {
      if (terminalIds.has(instanceId)) {
        const instance = this._terminalService.getInstanceFromId(instanceId);
        if (!instance || instance.isDisposed) {
          terminalIds.delete(instanceId);
          if (terminalIds.size === 0) {
            this._sessionTerminals.delete(sessionId);
          }
          continue;
        }
        return true;
      }
    }
    return false;
  }
  _removeTerminalFromTrackedSessions(instanceId) {
    for (const [sessionId, terminalIds] of this._sessionTerminals) {
      terminalIds.delete(instanceId);
      if (terminalIds.size === 0) {
        this._sessionTerminals.delete(sessionId);
      }
    }
  }
  _getAvailableTerminal(instance, action) {
    const currentInstance = this._terminalService.getInstanceFromId(instance.instanceId);
    if (!currentInstance || currentInstance.isDisposed) {
      this._logService.trace(`[SessionsTerminal] Cannot ${action}; terminal ${instance.instanceId} is no longer available`);
      return void 0;
    }
    return currentInstance;
  }
  /**
   * Shows background terminals that belong to the active session and hides
   * foreground terminals that belong to other sessions. When the active
   * session has no tracked terminals yet, falls back to initial cwd matching
   * for compatibility with restored terminals from previous sessions.
   */
  async _updateTerminalVisibility(activeSession, activeKey, forceForegroundTerminalIds) {
    const toShow = [];
    const toHide = [];
    const trackedTerminalIds = new Set(this._getTrackedTerminalsForSession(activeSession.sessionId).map((instance) => instance.instanceId));
    for (const instance of [...this._terminalService.instances]) {
      if (instance.shellLaunchConfig.hideFromUser || this._standaloneTerminalIds.has(instance.instanceId)) {
        continue;
      }
      let cwd;
      const currentInstance = this._getAvailableTerminal(instance, "update terminal visibility");
      if (!currentInstance) {
        continue;
      }
      const isForeground = this._terminalService.foregroundInstances.includes(currentInstance);
      const isForceVisible = forceForegroundTerminalIds.includes(currentInstance.instanceId);
      let belongsToActiveSession = trackedTerminalIds.has(currentInstance.instanceId);
      if (!belongsToActiveSession && !this._isTerminalTracked(currentInstance.instanceId)) {
        try {
          cwd = (await currentInstance.getInitialCwd()).toLowerCase();
        } catch {
          continue;
        }
        belongsToActiveSession = cwd === activeKey;
      }
      if ((belongsToActiveSession || isForceVisible) && !isForeground) {
        toShow.push(currentInstance);
      } else if (!belongsToActiveSession && !isForceVisible && isForeground) {
        toHide.push(currentInstance);
      }
    }
    for (const instance of toShow) {
      const availableInstance = this._getAvailableTerminal(instance, "show background terminal");
      if (availableInstance) {
        await this._terminalService.showBackgroundTerminal(availableInstance, true);
      }
    }
    for (const instance of toHide) {
      const availableInstance = this._getAvailableTerminal(instance, "move terminal to background");
      if (availableInstance) {
        this._logService.debug(`[SessionsTerminal] Hiding terminal ${availableInstance.instanceId} (does not belong to active key ${activeKey})`);
        this._terminalService.moveToBackground(availableInstance);
      }
    }
    const foreground = this._terminalService.foregroundInstances;
    let mostRecent;
    let mostRecentTimestamp = -1;
    for (const instance of foreground) {
      if (this._standaloneTerminalIds.has(instance.instanceId)) {
        continue;
      }
      const cmdDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
      const lastCmd = cmdDetection?.commands.at(-1);
      if (lastCmd && lastCmd.timestamp > mostRecentTimestamp) {
        mostRecentTimestamp = lastCmd.timestamp;
        mostRecent = instance;
      }
    }
    if (mostRecent) {
      this._terminalService.setActiveInstance(mostRecent);
    }
  }
  /**
   * Disposes (kills) terminals associated with the given session id. Used
   * when a session is removed: removal is an explicit user action, so the pty
   * is torn down.
   *
   * Never disposes the terminal the user is currently working in. Removal also
   * covers session *graduation* (untitled → committed via `onDidReplaceSession`,
   * which surfaces the skeleton in `removed`): the focused (active) instance is
   * therefore always protected.
   *
   * {@link reason} is logged for each killed terminal so unexpected disposals in
   * the agents window can be diagnosed from the logs. See #313510, #318645.
   */
  async _closeTerminalsForSession(sessionId, reason) {
    const protectedInstanceId = this._terminalService.activeInstance?.instanceId;
    for (const instance of this._getTrackedTerminalsForSession(sessionId)) {
      if (protectedInstanceId !== void 0 && instance.instanceId === protectedInstanceId) {
        this._logService.info(`[SessionsTerminal] Skipping active terminal ${instance.instanceId} for session ${sessionId} (user is working in it)`);
        continue;
      }
      const availableInstance = this._getAvailableTerminal(instance, `close removed session terminal for session ${sessionId}`);
      if (!availableInstance) {
        continue;
      }
      this._logService.info(`[SessionsTerminal] Killing terminal ${availableInstance.instanceId} (session: ${sessionId}, reason: ${reason})`);
      await this._terminalService.safeDisposeTerminal(availableInstance);
      this._removeTerminalFromTrackedSessions(availableInstance.instanceId);
    }
  }
  /**
   * Hides (moves to background) terminals associated with the given session id
   * without disposing them. Used when a session is archived ("Mark as Done"):
   * archiving is reversible and the pty must survive so it can be shown again.
   *
   * Archiving is asynchronous and can land while the user is working in a
   * just-opened terminal at this cwd, so the focused (active) instance is
   * never hidden out from under the user.
   *
   * {@link reason} is logged for each hidden terminal so unexpected visibility
   * changes in the agents window can be diagnosed from the logs. See #313510,
   * #318645.
   */
  async _hideTerminalsForSession(sessionId, reason) {
    const protectedInstanceId = this._terminalService.activeInstance?.instanceId;
    for (const instance of this._getTrackedTerminalsForSession(sessionId)) {
      if (protectedInstanceId !== void 0 && instance.instanceId === protectedInstanceId) {
        this._logService.info(`[SessionsTerminal] Skipping active terminal ${instance.instanceId} for session ${sessionId} (user is working in it)`);
        continue;
      }
      const availableInstance = this._getAvailableTerminal(instance, `hide archived terminal for session ${sessionId}`);
      if (!availableInstance) {
        continue;
      }
      this._logService.info(`[SessionsTerminal] Hiding terminal ${availableInstance.instanceId} (session: ${sessionId}, reason: ${reason})`);
      this._terminalService.moveToBackground(availableInstance);
    }
  }
  async dumpTracking() {
    console.log(`[SessionsTerminal] Active key: ${this._activeKey ?? "<none>"}`);
    console.log(`[SessionsTerminal] Session terminals: ${JSON.stringify([...this._sessionTerminals.entries()].map(([sessionId, terminalIds]) => [sessionId, [...terminalIds]]))}`);
    console.log(`[SessionsTerminal] Standalone terminals: ${JSON.stringify([...this._standaloneTerminalIds])}`);
    console.log("[SessionsTerminal] === All Terminals ===");
    for (const instance of this._terminalService.instances) {
      let cwd = "<unknown>";
      try {
        cwd = await instance.getInitialCwd();
      } catch {
      }
      const isForeground = this._terminalService.foregroundInstances.includes(instance);
      console.log(`  ${instance.instanceId} - ${cwd} - ${isForeground ? "foreground" : "background"}`);
    }
  }
  async showAllTerminals() {
    for (const instance of this._terminalService.instances) {
      if (!this._terminalService.foregroundInstances.includes(instance)) {
        await this._terminalService.showBackgroundTerminal(instance, true);
        this._logService.trace(`[SessionsTerminal] Moved terminal ${instance.instanceId} to foreground`);
      }
    }
  }
};
SessionsTerminalContribution.ID = "workbench.contrib.sessionsTerminal";
SessionsTerminalContribution = __decorateClass([
  __decorateParam(0, ISessionsManagementService),
  __decorateParam(1, ISessionsService),
  __decorateParam(2, ISessionsProvidersService),
  __decorateParam(3, ITerminalService),
  __decorateParam(4, IAgentHostTerminalService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IPathService),
  __decorateParam(7, ITerminalProfileService)
], SessionsTerminalContribution);
registerWorkbenchContribution2(SessionsTerminalContribution.ID, SessionsTerminalContribution, WorkbenchPhase.AfterRestored);
let RegisterAgentHostSessionTaskRunnerContribution = class extends Disposable {
  constructor(instantiationService, registry) {
    super();
    const runner = instantiationService.createInstance(AgentHostSessionTaskRunner);
    this._register(registry.register(runner));
  }
};
RegisterAgentHostSessionTaskRunnerContribution.ID = "workbench.contrib.sessions.registerAgentHostTaskRunner";
RegisterAgentHostSessionTaskRunnerContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ISessionTaskRunnerRegistry)
], RegisterAgentHostSessionTaskRunnerContribution);
registerWorkbenchContribution2(RegisterAgentHostSessionTaskRunnerContribution.ID, RegisterAgentHostSessionTaskRunnerContribution, WorkbenchPhase.BlockStartup);
class DumpTerminalTrackingAction extends Action2 {
  constructor() {
    super({
      id: "agentSession.dumpTerminalTracking",
      title: localize2("dumpTerminalTracking", "Dump Terminal Tracking"),
      f1: true
    });
  }
  async run() {
    const contribution = getWorkbenchContribution(SessionsTerminalContribution.ID);
    await contribution.dumpTracking();
  }
}
registerAction2(DumpTerminalTrackingAction);
class ShowAllTerminalsAction extends Action2 {
  constructor() {
    super({
      id: "agentSession.showAllTerminals",
      title: localize2("showAllTerminals", "Show All Terminals"),
      f1: true
    });
  }
  async run() {
    const contribution = getWorkbenchContribution(SessionsTerminalContribution.ID);
    await contribution.showAllTerminals();
  }
}
registerAction2(ShowAllTerminalsAction);
export {
  SessionsTerminalContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcdGVybWluYWxcXGJyb3dzZXJcXHNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIElSZWFkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX1NDSEVNRSwgZnJvbUFnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBnZXRXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RQcm92aWRlciwgTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvc2Vzc2lvblRhc2tSdW5uZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvblRhc2tSdW5uZXIgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25UYXNrUnVubmVyLmpzJztcblxuaW50ZXJmYWNlIElTZXNzaW9uVGVybWluYWxJbmZvIHtcblx0LyoqIFRoZSBjd2QgdG8gdXNlIGZvciB0ZXJtaW5hbCBtYXRjaGluZy9jcmVhdGlvbi4gRm9yIGFnZW50IGhvc3Qgc2Vzc2lvbnMgdGhpcyBpcyB0aGUgdW53cmFwcGVkIGZpbGUgVVJJLiAqL1xuXHRyZWFkb25seSBjd2Q6IFVSSTtcblx0LyoqIFdoZW4gc2V0LCB0aGUgdGVybWluYWwgc2hvdWxkIGJlIGNyZWF0ZWQgb24gdGhlIGFnZW50IGhvc3QgcmF0aGVyIHRoYW4gbG9jYWxseS4gKi9cblx0cmVhZG9ubHkgYWdlbnRIb3N0Q3dkPzogVVJJO1xufVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdUZXJtaW5hbE9wZXJhdGlvbiB7XG5cdGNvdW50OiBudW1iZXI7XG5cdHJlcGxhY2VkOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGVybWluYWwgaW5mbyBmb3IgdGhlIGdpdmVuIHNlc3Npb246IHdvcmt0cmVlIG9yIHJlcG9zaXRvcnkgcGF0aCBmb3JcbiAqIHdvcmtzcGFjZS1iYWNrZWQgYWdlbnQgc2Vzc2lvbnMuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIHNlc3Npb25zIHdpdGhvdXQgYVxuICogd29ya3NwYWNlIChlLmcuIENsb3VkKSwgb3Igd2hlbiBubyBwYXRoIGlzIGF2YWlsYWJsZS5cbiAqL1xuZnVuY3Rpb24gZ2V0U2Vzc2lvblRlcm1pbmFsSW5mbyhzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcmVhZGVyPzogSVJlYWRlcik6IElTZXNzaW9uVGVybWluYWxJbmZvIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB3b3Jrc3BhY2UgPSByZWFkZXIgPyBzZXNzaW9uLndvcmtzcGFjZS5yZWFkKHJlYWRlcikgOiBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKTtcblx0aWYgKHdvcmtzcGFjZT8uaXNWaXJ0dWFsV29ya3NwYWNlICE9PSBmYWxzZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZm9sZGVyID0gd29ya3NwYWNlLmZvbGRlcnNbMF07XG5cdGNvbnN0IGN3ZCA9IGZvbGRlcj8ud29ya2luZ0RpcmVjdG9yeTtcblx0aWYgKCFjd2QpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChjd2Quc2NoZW1lID09PSBBR0VOVF9IT1NUX1NDSEVNRSkge1xuXHRcdHJldHVybiB7IGN3ZDogZnJvbUFnZW50SG9zdFVyaShjd2QpLCBhZ2VudEhvc3RDd2Q6IGN3ZCB9O1xuXHR9XG5cdHJldHVybiB7IGN3ZCB9O1xufVxuXG4vKipcbiAqIE1hbmFnZXMgdGVybWluYWwgaW5zdGFuY2VzIGluIHRoZSBzZXNzaW9ucyB3aW5kb3csIGVuc3VyaW5nOlxuICogLSBBIHRlcm1pbmFsIGV4aXN0cyBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uJ3Mgd29ya3RyZWUgKG9yIHJlcG9zaXRvcnkgaWYgbm8gd29ya3RyZWUpLlxuICogLSBUZXJtaW5hbHMgYXJlIHRyYWNrZWQgcGVyIHNlc3Npb24gaWQgYW5kIHNob3duL2hpZGRlbiBiYXNlZCBvbiB0aGF0IGFzc29jaWF0aW9uLlxuICogLSBUZXJtaW5hbHMgY3JlYXRlZCBiZWZvcmUgc2Vzc2lvbi1pZCB0cmFja2luZyBmYWxsIGJhY2sgdG8gaW5pdGlhbCBjd2QgbWF0Y2hpbmdcbiAqICAgdW50aWwgdGhleSBhcmUgYXNzb2NpYXRlZCB3aXRoIGEgc2Vzc2lvbiBpbiB0aGlzIHdpbmRvdy5cbiAqIC0gVGVybWluYWxzIGZvciBhcmNoaXZlZC9yZW1vdmVkIHNlc3Npb25zIGFyZSBoaWRkZW4vY2xvc2VkIHVzaW5nIHRoZWlyIHRyYWNrZWRcbiAqICAgc2Vzc2lvbiBpZCBhc3NvY2lhdGlvbiB3aGlsZSBrZWVwaW5nIHRoZSBhY3RpdmUgdGVybWluYWwgcHJvdGVjdGVkLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNUZXJtaW5hbENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuc2Vzc2lvbnNUZXJtaW5hbCc7XG5cblx0cHJpdmF0ZSBfYWN0aXZlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGl2ZVNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVGVybWluYWxzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxudW1iZXI+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFuZGFsb25lVGVybWluYWxJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0LyoqIEluLWZsaWdodCB0ZXJtaW5hbCB3b3JrIGZvciBkcmFmdHMsIHJldGFpbmVkIG9ubHkgdW50aWwgZWFjaCBvcGVyYXRpb24gc2V0dGxlcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Rlcm1pbmFsT3BlcmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJUGVuZGluZ1Rlcm1pbmFsT3BlcmF0aW9uPigpO1xuXG5cdC8qKlxuXHQgKiBTZXNzaW9uIGlkcyBhbHJlYWR5IHByb2Nlc3NlZCBhcyBhcmNoaXZlZC4gVGhlIGFyY2hpdmUgY2xlYW51cCBydW5zIG9ubHlcblx0ICogb24gdGhlIG5vdC1hcmNoaXZlZCBcdTIxOTIgYXJjaGl2ZWQgdHJhbnNpdGlvbjogdGhlIHByb3ZpZGVyIGtlZXBzIGFyY2hpdmVkXG5cdCAqIHNlc3Npb25zIGNhY2hlZCBhbmQgcmUtZW1pdHMgdGhlbSBpbiBgY2hhbmdlZGAgb24gZXZlcnkgc3luYywgc28gYWN0aW5nIG9uXG5cdCAqIHRoZSBjdXJyZW50IGFyY2hpdmVkIHN0YXRlIHdvdWxkIHJlLXJ1biB0aGUgY3dkIGNsZWFudXAgZWFjaCB0aW1lIGFuZCBzd2VlcFxuXHQgKiB0ZXJtaW5hbHMgdGhlIHVzZXIgb3BlbmVkIGFmdGVyd2FyZHMuIFNlZSAjMzEzNTEwLCAjMzE4NjQ1LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYXJjaGl2ZWRTZXNzaW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFRlcm1pbmFsU2VydmljZTogSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFNlZWQgd2l0aCBzZXNzaW9ucyB0aGF0IGFyZSBhbHJlYWR5IGFyY2hpdmVkIChlLmcuIHJlc3RvcmVkIGFyY2hpdmVkXG5cdFx0Ly8gZnJvbSBhIHByZXZpb3VzIHdpbmRvdykgc28gdGhleSBhcmUgbm90IHRyZWF0ZWQgYXMgbmV3bHkgYXJjaGl2ZWQgb25cblx0XHQvLyB0aGVpciBmaXJzdCBjaGFuZ2UgZXZlbnQuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbnMoKSkge1xuXHRcdFx0aWYgKHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLl9hcmNoaXZlZFNlc3Npb25JZHMuYWRkKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwcm9maWxlT3ZlcnJpZGUgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzZXNzaW9uIHx8IHNlc3Npb24ucHJvdmlkZXJJZCA9PT0gTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vIG5lZWQgdG8gb3ZlcnJpZGUgbG9jYWwgZGVmYXVsdCBwcm9maWxlcyB3aXRoIHRoZSBsb2NhbCBBSFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhZGRyZXNzID0gdGhpcy5fZ2V0U2Vzc2lvbkFnZW50SG9zdEFkZHJlc3Moc2Vzc2lvbik7XG5cdFx0XHRpZiAoIWFkZHJlc3MpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm9maWxlcyA9IHRoaXMuX2FnZW50SG9zdFRlcm1pbmFsU2VydmljZS5wcm9maWxlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gcHJvZmlsZXMuZmluZChwID0+IHAuYWRkcmVzcyA9PT0gYWRkcmVzcykgPz8gdGhpcy5fYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLmdldFByb2ZpbGVGb3JDb25uZWN0aW9uKGFkZHJlc3MpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IHByb2ZpbGVPdmVycmlkZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAocHJvZmlsZSkge1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2Uub3ZlcnJpZGVEZWZhdWx0UHJvZmlsZShcblx0XHRcdFx0XHRwcm9maWxlLmV4dGVuc2lvbklkZW50aWZpZXIsIHByb2ZpbGUucHJvZmlsZUlkLFxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBLZWVwIHRoZSBkZWZhdWx0IGN3ZCBpbiBzeW5jIHdpdGggdGhlIGFjdGl2ZSBzZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3Rvcnlcblx0XHQvLyBzbyB0aGF0IFwiTmV3IFRlcm1pbmFsXCIgdXNlcyBpdCBhdXRvbWF0aWNhbGx5LlxuXHRcdC8vIFRoaXMgaXMgYSBsaXR0bGUgaGFja3kgYnV0IEkgZG9uJ3Qgc2VlIGFueSBiZXR0ZXIgYXBwcm9hY2guXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChzZXNzaW9uPy5sb2FkaW5nLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHR0aGlzLl9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2Uuc2V0RGVmYXVsdEN3ZCh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbmZvID0gZ2V0U2Vzc2lvblRlcm1pbmFsSW5mbyhzZXNzaW9uLCByZWFkZXIpO1xuXHRcdFx0dGhpcy5fYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLnNldERlZmF1bHRDd2QoaW5mbz8uY3dkKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWFjdCB0byBhY3RpdmUgc2Vzc2lvbiBjaGFuZ2VzIFx1MjAxNCB1c2Ugd29ya3RyZWUvcmVwbyBmb3IgYmFja2dyb3VuZCBzZXNzaW9ucywgaG9tZSBkaXIgb3RoZXJ3aXNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChzZXNzaW9uPy5sb2FkaW5nLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVLZXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25JZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25BY3RpdmVTZXNzaW9uQ2hhbmdlZChzZXNzaW9uKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZXBlYXRlZCBOZXcgU2Vzc2lvbiBhY3Rpb25zIHJlcGxhY2Ugb25lIGRyYWZ0IHdpdGggYW5vdGhlci4gVHJhbnNmZXJcblx0XHQvLyB0aGUgb2xkIGRyYWZ0J3MgdGVybWluYWxzIHdoZW4gYm90aCBkcmFmdHMgdXNlIHRoZSBzYW1lIGN3ZCBhbmQgYmFja2VuZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbigoeyBmcm9tLCB0byB9KSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24oZnJvbSwgdG8pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gYSBzZXNzaW9uIGlzIHJlcGxhY2VkICh1bnRpdGxlZCBcdTIxOTIgY29tbWl0dGVkIGdyYWR1YXRpb24pLCB0cmFuc2ZlclxuXHRcdC8vIHRyYWNrZWQgdGVybWluYWxzIGZyb20gdGhlIG9sZCBzZXNzaW9uIGlkIHRvIHRoZSBuZXcgb25lIHNvIHRoZXkgYXJlXG5cdFx0Ly8gbm90IG9ycGhhbmVkIGFuZCBjbG9zZWQgYnkgdGhlIHJlbW92YWwgY2xlYW51cC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkUmVwbGFjZVNlc3Npb24oKHsgZnJvbSwgdG8gfSkgPT4ge1xuXHRcdFx0dGhpcy5fdHJhbnNmZXJUZXJtaW5hbHMoZnJvbS5zZXNzaW9uSWQsIHRvLnNlc3Npb25JZCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgdHJhY2tlZCB0ZXJtaW5hbCBpZHMgd2hlbiB0ZXJtaW5hbHMgYXJlIGV4dGVybmFsbHkgZGlzcG9zZWRcblx0XHQvLyAoZS5nLiB1c2VyIGNsb3NlcyBhIHRlcm1pbmFsIHRhYikgc28gdGhlIG1hcCBkb2Vzbid0IGhvbGQgc3RhbGUgZW50cmllcy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWREaXNwb3NlSW5zdGFuY2UoaW5zdGFuY2UgPT4ge1xuXHRcdFx0dGhpcy5fcmVtb3ZlVGVybWluYWxGcm9tVHJhY2tlZFNlc3Npb25zKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZVRlcm1pbmFsSWRzLmRlbGV0ZShpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIaWRlIHJlc3RvcmVkIHRlcm1pbmFscyBmcm9tIGEgcHJldmlvdXMgd2luZG93IHNlc3Npb24gdGhhdCBkb24ndFxuXHRcdC8vIGJlbG9uZyB0byB0aGUgY3VycmVudCBhY3RpdmUgc2Vzc2lvbi4gVGhlc2UgYXJyaXZlIGFzeW5jaHJvbm91c2x5XG5cdFx0Ly8gZHVyaW5nIHJlY29ubmVjdGlvbiBhbmQgd291bGQgb3RoZXJ3aXNlIGZsYXNoIGluIHRoZSBmb3JlZ3JvdW5kLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENyZWF0ZUluc3RhbmNlKGluc3RhbmNlID0+IHtcblx0XHRcdC8vIFNraXAgaGlkZGVuIHRvb2wgdGVybWluYWxzIFx1MjAxNCBtYW5hZ2VkIGJ5IHRoZSBjaGF0IHRvb2wgbGlmZWN5Y2xlXG5cdFx0XHRpZiAoaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuaGlkZUZyb21Vc2VyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyAmJiB0aGlzLl9hY3RpdmVLZXkpIHtcblx0XHRcdFx0aW5zdGFuY2UuZ2V0SW5pdGlhbEN3ZCgpLnRoZW4oY3dkID0+IHtcblx0XHRcdFx0XHRpZiAoY3dkLnRvTG93ZXJDYXNlKCkgIT09IHRoaXMuX2FjdGl2ZUtleSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYXZhaWxhYmxlSW5zdGFuY2UgPSB0aGlzLl9nZXRBdmFpbGFibGVUZXJtaW5hbChpbnN0YW5jZSwgYGhpZGUgcmVzdG9yZWQgdGVybWluYWwgZm9yICR7Y3dkfWApO1xuXHRcdFx0XHRcdFx0aWYgKCFhdmFpbGFibGVJbnN0YW5jZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UubW92ZVRvQmFja2dyb3VuZChhdmFpbGFibGVJbnN0YW5jZSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNUZXJtaW5hbF0gSGlkIHJlc3RvcmVkIHRlcm1pbmFsICR7YXZhaWxhYmxlSW5zdGFuY2UuaW5zdGFuY2VJZH0gKGN3ZDogJHtjd2R9KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgdGVybWluYWxzIGZvciBhcmNoaXZlZC9yZW1vdmVkIHNlc3Npb25zIHVzaW5nIHRoZWlyIHRyYWNrZWRcblx0XHQvLyBzZXNzaW9uLXRvLXRlcm1pbmFsIGFzc29jaWF0aW9ucy5cblx0XHQvL1xuXHRcdC8vIEFyY2hpdmUgdnMgcmVtb3ZlIGRpZmZlciBpbiBob3cgYWdncmVzc2l2ZSB0aGUgY2xlYW51cCBpczpcblx0XHQvLyAtIEFyY2hpdmluZyBpcyByZXZlcnNpYmxlIGFuZCB0ZXJtaW5hbHMgY2FuIGJlIHJldXNlZCBieVxuXHRcdC8vICAgdGhlIHNhbWUgc2Vzc2lvbiwgc28gd2Ugb25seSBISURFIHRoZSB0ZXJtaW5hbCAodGhlIHB0eSBzdXJ2aXZlcyBhbmQgY2FuXG5cdFx0Ly8gICBiZSBzaG93biBhZ2FpbiBvbiB1bmFyY2hpdmUgb3IgcmV1c2UpLiBTZWUgYF9oaWRlVGVybWluYWxzRm9yU2Vzc2lvbmAuXG5cdFx0Ly8gLSBSZW1vdmFsIGlzIGFuIGV4cGxpY2l0LCBkZXN0cnVjdGl2ZSB1c2VyIGFjdGlvbiwgc28gd2UgS0lMTCB0aGVcblx0XHQvLyAgIHRlcm1pbmFsLiBTZWUgYF9jbG9zZVRlcm1pbmFsc0ZvclNlc3Npb25gLlxuXHRcdC8vXG5cdFx0Ly8gVGhlIGFyY2hpdmUgY2xlYW51cCBydW5zIG9ubHkgb24gdGhlIG5vdC1hcmNoaXZlZCBcdTIxOTIgYXJjaGl2ZWQgdHJhbnNpdGlvbi5cblx0XHQvLyBUaGUgcHJvdmlkZXIga2VlcHMgYXJjaGl2ZWQgc2Vzc2lvbnMgY2FjaGVkIGFuZCByZS1lbWl0cyB0aGVtIGluXG5cdFx0Ly8gYGNoYW5nZWRgIG9uIGV2ZXJ5IHN5bmM7IGFjdGluZyBvbiB0aGUgY3VycmVudCBhcmNoaXZlZCBzdGF0ZSB3b3VsZFxuXHRcdC8vIHJlLXJ1biB0aGUgY3dkIGNsZWFudXAgZWFjaCB0aW1lIGFuZCBzd2VlcCB0ZXJtaW5hbHMgdGhlIHVzZXIgb3BlbmVkXG5cdFx0Ly8gYWZ0ZXIgYXJjaGl2aW5nLlxuXHRcdC8vXG5cdFx0Ly8gQm90aCBwYXRocyBhcmUgYXN5bmNocm9ub3VzIGFuZCBjYW4gbGFuZCB3aGlsZSB0aGUgdXNlciBpcyB3b3JraW5nIGluIGFcblx0XHQvLyBqdXN0LW9wZW5lZCB0ZXJtaW5hbCBhdCB0aGlzIGN3ZCAoZS5nLiByZW1vdmFsIGFsc28gY292ZXJzIHVudGl0bGVkIFx1MjE5MlxuXHRcdC8vIGNvbW1pdHRlZCBncmFkdWF0aW9uIHZpYSBgb25EaWRSZXBsYWNlU2Vzc2lvbmAsIHdoaWNoIHN1cmZhY2VzIHRoZVxuXHRcdC8vIHNrZWxldG9uIGluIGByZW1vdmVkYCkuIFRoZSBmb2N1c2VkIChhY3RpdmUpIHRlcm1pbmFsIGlzIHRoZXJlZm9yZSBuZXZlclxuXHRcdC8vIHRvdWNoZWQgb24gZWl0aGVyIHBhdGguIFNlZSAjMzEzNTEwLCAjMzE4NjQ1LlxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0Ly8gT25seSBhY3Qgb24gdGhlIG5vdC1hcmNoaXZlZCBcdTIxOTIgYXJjaGl2ZWQgdHJhbnNpdGlvbjsgaWdub3JlIHJlLWVtaXRzXG5cdFx0XHQvLyBvZiBzZXNzaW9ucyBhbHJlYWR5IGtub3duIHRvIGJlIGFyY2hpdmVkLiBLZWVwIHRoZSB0cmFja2VkIHNldCBpblxuXHRcdFx0Ly8gc3luYzogcmVjb3JkIHNlc3Npb25zIHRoYXQgYXJyaXZlIGFscmVhZHktYXJjaGl2ZWQgKGUuZy4gcmVzdG9yZWRcblx0XHRcdC8vIGZyb20gYSBwcmV2aW91cyB3aW5kb3cpIHNvIHRoZXkgbmV2ZXIgY291bnQgYXMgYSBmcmVzaCB0cmFuc2l0aW9uLFxuXHRcdFx0Ly8gYW5kIGRyb3AgaWRzIHRoYXQgd2VyZSB1bi1hcmNoaXZlZCBvciByZW1vdmVkLlxuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGUuYWRkZWQpIHtcblx0XHRcdFx0aWYgKHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSkge1xuXHRcdFx0XHRcdHRoaXMuX2FyY2hpdmVkU2Vzc2lvbklkcy5hZGQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBqdXN0QXJjaGl2ZWQ6IElTZXNzaW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBlLmNoYW5nZWQpIHtcblx0XHRcdFx0aWYgKHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fYXJjaGl2ZWRTZXNzaW9uSWRzLmhhcyhzZXNzaW9uLnNlc3Npb25JZCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2FyY2hpdmVkU2Vzc2lvbklkcy5hZGQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0anVzdEFyY2hpdmVkLnB1c2goc2Vzc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2FyY2hpdmVkU2Vzc2lvbklkcy5kZWxldGUoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHRcdHRoaXMuX2FyY2hpdmVkU2Vzc2lvbklkcy5kZWxldGUoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUucmVtb3ZlZC5sZW5ndGggPT09IDAgJiYganVzdEFyY2hpdmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNUZXJtaW5hbF0gb25EaWRDaGFuZ2VTZXNzaW9ucyBjbGVhbnVwIChyZW1vdmVkOiAke2UucmVtb3ZlZC5sZW5ndGh9LCBqdXN0QXJjaGl2ZWQ6ICR7anVzdEFyY2hpdmVkLmxlbmd0aH0sIHRyYWNrZWRTZXNzaW9uczogJHt0aGlzLl9zZXNzaW9uVGVybWluYWxzLnNpemV9LCBhY3RpdmVLZXk6ICR7dGhpcy5fYWN0aXZlS2V5ID8/ICc8bm9uZT4nfSlgKTtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9jbG9zZVRlcm1pbmFsc0ZvclNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQsIGBzZXNzaW9uIHJlbW92ZWQgKCR7c2Vzc2lvbi5zZXNzaW9uSWR9KWApLmZpbmFsbHkoKCkgPT4gdGhpcy5fc2Vzc2lvblRlcm1pbmFscy5kZWxldGUoc2Vzc2lvbi5zZXNzaW9uSWQpKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBqdXN0QXJjaGl2ZWQpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9oaWRlVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCwgYHNlc3Npb24gYXJjaGl2ZWQgKCR7c2Vzc2lvbi5zZXNzaW9uSWR9KWApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIGEgdGVybWluYWwgZXhpc3RzIGZvciB0aGUgZ2l2ZW4gY3dkLiBXaGVuIGEgc2Vzc2lvbiBpcyBwcm92aWRlZCxcblx0ICogdHJhY2tlZCB0ZXJtaW5hbHMgZm9yIHRoYXQgc2Vzc2lvbiBpZCBhcmUgcHJlZmVycmVkOyBvdGhlcndpc2UgdGhlIG1ldGhvZFxuXHQgKiBmYWxscyBiYWNrIHRvIG1hdGNoaW5nIHVudHJhY2tlZCB0ZXJtaW5hbHMgYnkgaW5pdGlhbCBjd2QgZm9yIGJhY2t3YXJkXG5cdCAqIGNvbXBhdGliaWxpdHkgYmVmb3JlIGNyZWF0aW5nIGEgbmV3IHRlcm1pbmFsLiBTZXRzIG5ld2x5IGNyZWF0ZWQgdGVybWluYWxzXG5cdCAqIGFzIGFjdGl2ZSBhbmQgb3B0aW9uYWxseSBmb2N1c2VzIHRoZW0uXG5cdCAqXG5cdCAqIFdoZW4ge0BsaW5rIHNlc3Npb259IGlzIHByb3ZpZGVkIGFuZCB0aGUgc2Vzc2lvbiBpcyBiYWNrZWQgYnkgYW4gYWdlbnRcblx0ICogaG9zdCwgdGhlIHRlcm1pbmFsIGlzIGNyZWF0ZWQgb24gdGhlIGFnZW50IGhvc3QgaW5zdGVhZCBvZiBsb2NhbGx5LlxuXHQgKi9cblx0YXN5bmMgZW5zdXJlVGVybWluYWwoY3dkOiBVUkksIGZvY3VzOiBib29sZWFuLCBzZXNzaW9uPzogSVNlc3Npb24pOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlW10+IHtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9lbnN1cmVUZXJtaW5hbChjd2QsIGZvY3VzLCBzZXNzaW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLl9iZWdpblRlcm1pbmFsT3BlcmF0aW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2Vuc3VyZVRlcm1pbmFsKGN3ZCwgZm9jdXMsIHNlc3Npb24pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9lbmRUZXJtaW5hbE9wZXJhdGlvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlVGVybWluYWwoY3dkOiBVUkksIGZvY3VzOiBib29sZWFuLCBzZXNzaW9uPzogSVNlc3Npb24pOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlW10+IHtcblx0XHRpZiAoc2Vzc2lvbiAmJiB0aGlzLl9wZW5kaW5nVGVybWluYWxPcGVyYXRpb25zLmdldChzZXNzaW9uLnNlc3Npb25JZCk/LnJlcGxhY2VkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gY3dkLmZzUGF0aC50b0xvd2VyQ2FzZSgpO1xuXHRcdGxldCBleGlzdGluZyA9IHNlc3Npb24gPyB0aGlzLl9nZXRUcmFja2VkVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCkgOiBbXTtcblx0XHRpZiAoZXhpc3RpbmcubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRleGlzdGluZyA9IGF3YWl0IHRoaXMuX2ZpbmRUZXJtaW5hbHNGb3JLZXkoa2V5LCB7IGV4Y2x1ZGVUcmFja2VkOiAhIXNlc3Npb24gfSk7XG5cdFx0XHRpZiAoc2Vzc2lvbiAmJiB0aGlzLl9wZW5kaW5nVGVybWluYWxPcGVyYXRpb25zLmdldChzZXNzaW9uLnNlc3Npb25JZCk/LnJlcGxhY2VkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhpc3RpbmcubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRoaXMuX2NyZWF0ZVRlcm1pbmFsRm9yU2Vzc2lvbihjd2QsIHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCBjcmVhdGVkSW5zdGFuY2UgPSB0aGlzLl9nZXRBdmFpbGFibGVUZXJtaW5hbChpbnN0YW5jZSwgYGFjdGl2YXRlIGNyZWF0ZWQgdGVybWluYWwgZm9yICR7Y3dkLmZzUGF0aH1gKTtcblx0XHRcdFx0aWYgKCFjcmVhdGVkSW5zdGFuY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlc3Npb24gJiYgdGhpcy5fcGVuZGluZ1Rlcm1pbmFsT3BlcmF0aW9ucy5nZXQoc2Vzc2lvbi5zZXNzaW9uSWQpPy5yZXBsYWNlZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zYWZlRGlzcG9zZVRlcm1pbmFsKGNyZWF0ZWRJbnN0YW5jZSk7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4aXN0aW5nID0gW2NyZWF0ZWRJbnN0YW5jZV07XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShjcmVhdGVkSW5zdGFuY2UpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNUZXJtaW5hbF0gQ3JlYXRlZCB0ZXJtaW5hbCAke2NyZWF0ZWRJbnN0YW5jZS5pbnN0YW5jZUlkfSBmb3IgJHtjd2QuZnNQYXRofWApO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNUZXJtaW5hbF0gQ2Fubm90IGNyZWF0ZSB0ZXJtaW5hbCBmb3IgJHtjd2QuZnNQYXRofTogJHtlfWApO1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3RyYWNrVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCwgZXhpc3RpbmcpO1xuXHRcdH1cblxuXHRcdGlmIChmb2N1cykge1xuXHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmZvY3VzQWN0aXZlSW5zdGFuY2UoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHRlcm1pbmFsIGZvciB0aGUgZ2l2ZW4gY3dkLiBJZiB0aGUgc2Vzc2lvbiBpcyBiYWNrZWQgYnkgYW5cblx0ICogYWdlbnQgaG9zdCwgY3JlYXRlcyBhbiBhZ2VudCBob3N0IHRlcm1pbmFsOyBvdGhlcndpc2UgY3JlYXRlcyBhIGxvY2FsIG9uZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVRlcm1pbmFsRm9yU2Vzc2lvbihjd2Q6IFVSSSwgc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IHNlc3Npb24gJiYgdGhpcy5fZ2V0U2Vzc2lvbkFnZW50SG9zdEFkZHJlc3Moc2Vzc2lvbik7XG5cdFx0aWYgKGFkZHJlc3MpIHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsRm9yRW50cnkoYWRkcmVzcywgeyBjd2QgfSk7XG5cdFx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgY29uZmlnOiB7IGN3ZCB9IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGFnZW50IGhvc3QgYWRkcmVzcyBmb3IgdGhlIGdpdmVuIHNlc3Npb24ncyBwcm92aWRlcixcblx0ICogb3IgYHVuZGVmaW5lZGAgaWYgdGhlIHNlc3Npb24gaXMgbm90IGJhY2tlZCBieSBhbiBhZ2VudCBob3N0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvbkFnZW50SG9zdEFkZHJlc3Moc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIoc2Vzc2lvbi5wcm92aWRlcklkKTtcblx0XHRpZiAoIXByb3ZpZGVyIHx8ICFpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3ZpZGVyLnJlbW90ZUFkZHJlc3MgPz8gJ19fbG9jYWxfXyc7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vbkFjdGl2ZVNlc3Npb25DaGFuZ2VkKHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYmVnaW5UZXJtaW5hbE9wZXJhdGlvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluZm8gPSBnZXRTZXNzaW9uVGVybWluYWxJbmZvKHNlc3Npb24pO1xuXHRcdFx0Y29uc3QgdGFyZ2V0UGF0aCA9IGluZm8/LmN3ZCA/PyBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0S2V5ID0gdGFyZ2V0UGF0aC5mc1BhdGgudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmVLZXkgPT09IHRhcmdldEtleSAmJiB0aGlzLl9hY3RpdmVTZXNzaW9uSWQgPT09IHNlc3Npb24uc2Vzc2lvbklkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FjdGl2ZUtleSA9IHRhcmdldEtleTtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25JZCA9IHNlc3Npb24uc2Vzc2lvbklkO1xuXG5cdFx0XHRjb25zdCBpbnN0YW5jZXMgPSBhd2FpdCB0aGlzLl9lbnN1cmVUZXJtaW5hbCh0YXJnZXRQYXRoLCBmYWxzZSwgc2Vzc2lvbik7XG5cblx0XHRcdC8vIElmIHRoZSBhY3RpdmUgc2Vzc2lvbiBvciBrZXkgY2hhbmdlZCB3aGlsZSB3ZSB3ZXJlIGF3YWl0aW5nLCBhIG5ld2VyXG5cdFx0XHQvLyBjYWxsIGhhcyB0YWtlbiBvdmVyIFx1MjAxNCBza2lwIHRoZSB2aXNpYmlsaXR5IHVwZGF0ZSB0byBhdm9pZCBmbGlja2VyLlxuXHRcdFx0aWYgKHRoaXMuX2FjdGl2ZUtleSAhPT0gdGFyZ2V0S2V5IHx8IHRoaXMuX2FjdGl2ZVNlc3Npb25JZCAhPT0gc2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlVGVybWluYWxWaXNpYmlsaXR5KHNlc3Npb24sIHRhcmdldEtleSwgaW5zdGFuY2VzLm1hcChpbnN0YW5jZSA9PiBpbnN0YW5jZS5pbnN0YW5jZUlkKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2VuZFRlcm1pbmFsT3BlcmF0aW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRmluZHMgYWxsIHRlcm1pbmFsIGluc3RhbmNlcyB3aG9zZSBpbml0aWFsIGN3ZCAobG93ZXItY2FzZWQpIG1hdGNoZXNcblx0ICogdGhlIGdpdmVuIGtleS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmRUZXJtaW5hbHNGb3JLZXkoa2V5OiBzdHJpbmcsIG9wdGlvbnM/OiB7IGV4Y2x1ZGVUcmFja2VkPzogYm9vbGVhbiB9KTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZVtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGVybWluYWxJbnN0YW5jZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHQvLyBTa2lwIGhpZGRlbiB0b29sIHRlcm1pbmFscyBcdTIwMTQgbWFuYWdlZCBieSB0aGUgY2hhdCB0b29sIGxpZmVjeWNsZVxuXHRcdFx0aWYgKGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmhpZGVGcm9tVXNlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChvcHRpb25zPy5leGNsdWRlVHJhY2tlZCAmJiAodGhpcy5faXNUZXJtaW5hbFRyYWNrZWQoaW5zdGFuY2UuaW5zdGFuY2VJZCkgfHwgdGhpcy5fc3RhbmRhbG9uZVRlcm1pbmFsSWRzLmhhcyhpbnN0YW5jZS5pbnN0YW5jZUlkKSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjd2QgPSBhd2FpdCBpbnN0YW5jZS5nZXRJbml0aWFsQ3dkKCk7XG5cdFx0XHRcdGlmIChjd2QudG9Mb3dlckNhc2UoKSA9PT0ga2V5KSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goaW5zdGFuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIHRlcm1pbmFscyB3aG9zZSBjd2QgY2Fubm90IGJlIHJlc29sdmVkXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF90cmFja1Rlcm1pbmFsc0ZvclNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIGluc3RhbmNlczogcmVhZG9ubHkgSVRlcm1pbmFsSW5zdGFuY2VbXSk6IHZvaWQge1xuXHRcdGlmIChpbnN0YW5jZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCB0ZXJtaW5hbElkcyA9IHRoaXMuX3Nlc3Npb25UZXJtaW5hbHMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCF0ZXJtaW5hbElkcykge1xuXHRcdFx0dGVybWluYWxJZHMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbHMuc2V0KHNlc3Npb25JZCwgdGVybWluYWxJZHMpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIGluc3RhbmNlcykge1xuXHRcdFx0dGVybWluYWxJZHMuYWRkKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2JlZ2luVGVybWluYWxPcGVyYXRpb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBvcGVyYXRpb24gPSB0aGlzLl9wZW5kaW5nVGVybWluYWxPcGVyYXRpb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChvcGVyYXRpb24pIHtcblx0XHRcdG9wZXJhdGlvbi5jb3VudCsrO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nVGVybWluYWxPcGVyYXRpb25zLnNldChzZXNzaW9uSWQsIHsgY291bnQ6IDEsIHJlcGxhY2VkOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2VuZFRlcm1pbmFsT3BlcmF0aW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gdGhpcy5fcGVuZGluZ1Rlcm1pbmFsT3BlcmF0aW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIW9wZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRvcGVyYXRpb24uY291bnQtLTtcblx0XHRpZiAob3BlcmF0aW9uLmNvdW50ID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nVGVybWluYWxPcGVyYXRpb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uKGZyb206IElTZXNzaW9uLCB0bzogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nT3BlcmF0aW9uID0gdGhpcy5fcGVuZGluZ1Rlcm1pbmFsT3BlcmF0aW9ucy5nZXQoZnJvbS5zZXNzaW9uSWQpO1xuXHRcdGlmIChwZW5kaW5nT3BlcmF0aW9uKSB7XG5cdFx0XHRwZW5kaW5nT3BlcmF0aW9uLnJlcGxhY2VkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBmcm9tQ3dkID0gZ2V0U2Vzc2lvblRlcm1pbmFsSW5mbyhmcm9tKT8uY3dkLmZzUGF0aC50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IHRvQ3dkID0gZ2V0U2Vzc2lvblRlcm1pbmFsSW5mbyh0byk/LmN3ZC5mc1BhdGgudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCBmcm9tQWdlbnRIb3N0QWRkcmVzcyA9IHRoaXMuX2dldFNlc3Npb25BZ2VudEhvc3RBZGRyZXNzKGZyb20pO1xuXHRcdGNvbnN0IHRvQWdlbnRIb3N0QWRkcmVzcyA9IHRoaXMuX2dldFNlc3Npb25BZ2VudEhvc3RBZGRyZXNzKHRvKTtcblx0XHRpZiAoZnJvbUN3ZCA9PT0gdG9Dd2QgJiYgZnJvbUFnZW50SG9zdEFkZHJlc3MgPT09IHRvQWdlbnRIb3N0QWRkcmVzcykge1xuXHRcdFx0dGhpcy5fdHJhbnNmZXJUZXJtaW5hbHMoZnJvbS5zZXNzaW9uSWQsIHRvLnNlc3Npb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlaG9tZVRlcm1pbmFscyhmcm9tLnNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVob21lVGVybWluYWxzKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWxzID0gdGhpcy5fZ2V0VHJhY2tlZFRlcm1pbmFsc0ZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIHRlcm1pbmFscykge1xuXHRcdFx0dGhpcy5fc3RhbmRhbG9uZVRlcm1pbmFsSWRzLmFkZCh0ZXJtaW5hbC5pbnN0YW5jZUlkKTtcblx0XHR9XG5cdFx0aWYgKHRlcm1pbmFscy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbnNUZXJtaW5hbF0gUmVob21lZCAke3Rlcm1pbmFscy5sZW5ndGh9IHRlcm1pbmFsKHMpIGZyb20gc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFscy5kZWxldGUoc2Vzc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyYW5zZmVyVGVybWluYWxzKGZyb21TZXNzaW9uSWQ6IHN0cmluZywgdG9TZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsSWRzID0gdGhpcy5fc2Vzc2lvblRlcm1pbmFscy5nZXQoZnJvbVNlc3Npb25JZCk7XG5cdFx0aWYgKHRlcm1pbmFsSWRzICYmIHRlcm1pbmFsSWRzLnNpemUgPiAwKSB7XG5cdFx0XHRsZXQgdGFyZ2V0SWRzID0gdGhpcy5fc2Vzc2lvblRlcm1pbmFscy5nZXQodG9TZXNzaW9uSWQpO1xuXHRcdFx0aWYgKCF0YXJnZXRJZHMpIHtcblx0XHRcdFx0dGFyZ2V0SWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbHMuc2V0KHRvU2Vzc2lvbklkLCB0YXJnZXRJZHMpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiB0ZXJtaW5hbElkcykge1xuXHRcdFx0XHR0YXJnZXRJZHMuYWRkKGlkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1Rlcm1pbmFsXSBUcmFuc2ZlcnJlZCAke3Rlcm1pbmFsSWRzLnNpemV9IHRlcm1pbmFsKHMpIGZyb20gc2Vzc2lvbiAke2Zyb21TZXNzaW9uSWR9IHRvICR7dG9TZXNzaW9uSWR9YCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbHMuZGVsZXRlKGZyb21TZXNzaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VHJhY2tlZFRlcm1pbmFsc0ZvclNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBJVGVybWluYWxJbnN0YW5jZVtdIHtcblx0XHRjb25zdCB0ZXJtaW5hbElkcyA9IHRoaXMuX3Nlc3Npb25UZXJtaW5hbHMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCF0ZXJtaW5hbElkcykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSVRlcm1pbmFsSW5zdGFuY2VbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2VJZCBvZiBbLi4udGVybWluYWxJZHNdKSB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21JZChpbnN0YW5jZUlkKTtcblx0XHRcdGlmICghaW5zdGFuY2UgfHwgaW5zdGFuY2UuaXNEaXNwb3NlZCB8fCBpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIpIHtcblx0XHRcdFx0dGVybWluYWxJZHMuZGVsZXRlKGluc3RhbmNlSWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKGluc3RhbmNlKTtcblx0XHR9XG5cblx0XHRpZiAodGVybWluYWxJZHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFscy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNUZXJtaW5hbFRyYWNrZWQoaW5zdGFuY2VJZDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBbc2Vzc2lvbklkLCB0ZXJtaW5hbElkc10gb2YgdGhpcy5fc2Vzc2lvblRlcm1pbmFscykge1xuXHRcdFx0aWYgKHRlcm1pbmFsSWRzLmhhcyhpbnN0YW5jZUlkKSkge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21JZChpbnN0YW5jZUlkKTtcblx0XHRcdFx0aWYgKCFpbnN0YW5jZSB8fCBpbnN0YW5jZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGVybWluYWxJZHMuZGVsZXRlKGluc3RhbmNlSWQpO1xuXHRcdFx0XHRcdGlmICh0ZXJtaW5hbElkcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlVGVybWluYWxGcm9tVHJhY2tlZFNlc3Npb25zKGluc3RhbmNlSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25JZCwgdGVybWluYWxJZHNdIG9mIHRoaXMuX3Nlc3Npb25UZXJtaW5hbHMpIHtcblx0XHRcdHRlcm1pbmFsSWRzLmRlbGV0ZShpbnN0YW5jZUlkKTtcblx0XHRcdGlmICh0ZXJtaW5hbElkcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbHMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXZhaWxhYmxlVGVybWluYWwoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBhY3Rpb246IHN0cmluZyk6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjdXJyZW50SW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tSWQoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0aWYgKCFjdXJyZW50SW5zdGFuY2UgfHwgY3VycmVudEluc3RhbmNlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1Rlcm1pbmFsXSBDYW5ub3QgJHthY3Rpb259OyB0ZXJtaW5hbCAke2luc3RhbmNlLmluc3RhbmNlSWR9IGlzIG5vIGxvbmdlciBhdmFpbGFibGVgKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBjdXJyZW50SW5zdGFuY2U7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgYmFja2dyb3VuZCB0ZXJtaW5hbHMgdGhhdCBiZWxvbmcgdG8gdGhlIGFjdGl2ZSBzZXNzaW9uIGFuZCBoaWRlc1xuXHQgKiBmb3JlZ3JvdW5kIHRlcm1pbmFscyB0aGF0IGJlbG9uZyB0byBvdGhlciBzZXNzaW9ucy4gV2hlbiB0aGUgYWN0aXZlXG5cdCAqIHNlc3Npb24gaGFzIG5vIHRyYWNrZWQgdGVybWluYWxzIHlldCwgZmFsbHMgYmFjayB0byBpbml0aWFsIGN3ZCBtYXRjaGluZ1xuXHQgKiBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIHJlc3RvcmVkIHRlcm1pbmFscyBmcm9tIHByZXZpb3VzIHNlc3Npb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlVGVybWluYWxWaXNpYmlsaXR5KGFjdGl2ZVNlc3Npb246IElTZXNzaW9uLCBhY3RpdmVLZXk6IHN0cmluZywgZm9yY2VGb3JlZ3JvdW5kVGVybWluYWxJZHM6IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9TaG93OiBJVGVybWluYWxJbnN0YW5jZVtdID0gW107XG5cdFx0Y29uc3QgdG9IaWRlOiBJVGVybWluYWxJbnN0YW5jZVtdID0gW107XG5cdFx0Y29uc3QgdHJhY2tlZFRlcm1pbmFsSWRzID0gbmV3IFNldCh0aGlzLl9nZXRUcmFja2VkVGVybWluYWxzRm9yU2Vzc2lvbihhY3RpdmVTZXNzaW9uLnNlc3Npb25JZCkubWFwKGluc3RhbmNlID0+IGluc3RhbmNlLmluc3RhbmNlSWQpKTtcblxuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgWy4uLnRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXNdKSB7XG5cdFx0XHQvLyBTa2lwIGhpZGRlbiB0b29sIHRlcm1pbmFscyBcdTIwMTQgbWFuYWdlZCBieSB0aGUgY2hhdCB0b29sIGxpZmVjeWNsZVxuXHRcdFx0aWYgKGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmhpZGVGcm9tVXNlciB8fCB0aGlzLl9zdGFuZGFsb25lVGVybWluYWxJZHMuaGFzKGluc3RhbmNlLmluc3RhbmNlSWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGN3ZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY3VycmVudEluc3RhbmNlID0gdGhpcy5fZ2V0QXZhaWxhYmxlVGVybWluYWwoaW5zdGFuY2UsICd1cGRhdGUgdGVybWluYWwgdmlzaWJpbGl0eScpO1xuXHRcdFx0aWYgKCFjdXJyZW50SW5zdGFuY2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlzRm9yZWdyb3VuZCA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5mb3JlZ3JvdW5kSW5zdGFuY2VzLmluY2x1ZGVzKGN1cnJlbnRJbnN0YW5jZSk7XG5cdFx0XHRjb25zdCBpc0ZvcmNlVmlzaWJsZSA9IGZvcmNlRm9yZWdyb3VuZFRlcm1pbmFsSWRzLmluY2x1ZGVzKGN1cnJlbnRJbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRcdGxldCBiZWxvbmdzVG9BY3RpdmVTZXNzaW9uID0gdHJhY2tlZFRlcm1pbmFsSWRzLmhhcyhjdXJyZW50SW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHRpZiAoIWJlbG9uZ3NUb0FjdGl2ZVNlc3Npb24gJiYgIXRoaXMuX2lzVGVybWluYWxUcmFja2VkKGN1cnJlbnRJbnN0YW5jZS5pbnN0YW5jZUlkKSkge1xuXHRcdFx0XHQvLyBVbnRyYWNrZWQgdGVybWluYWwgKGUuZy4gcmVzdG9yZWQgZnJvbSBhIHByZXZpb3VzIHdpbmRvdykgXHUyMDE0IGZhbGxcblx0XHRcdFx0Ly8gYmFjayB0byBjd2QgbWF0Y2hpbmcgc28gaXQgaXMgc2hvd24gYWxvbmdzaWRlIHRoZSBzZXNzaW9uJ3MgdHJhY2tlZFxuXHRcdFx0XHQvLyB0ZXJtaW5hbHMgcmF0aGVyIHRoYW4gaW5jb3JyZWN0bHkgaGlkZGVuLlxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGN3ZCA9IChhd2FpdCBjdXJyZW50SW5zdGFuY2UuZ2V0SW5pdGlhbEN3ZCgpKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRiZWxvbmdzVG9BY3RpdmVTZXNzaW9uID0gY3dkID09PSBhY3RpdmVLZXk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKGJlbG9uZ3NUb0FjdGl2ZVNlc3Npb24gfHwgaXNGb3JjZVZpc2libGUpICYmICFpc0ZvcmVncm91bmQpIHtcblx0XHRcdFx0dG9TaG93LnB1c2goY3VycmVudEluc3RhbmNlKTtcblx0XHRcdH0gZWxzZSBpZiAoIWJlbG9uZ3NUb0FjdGl2ZVNlc3Npb24gJiYgIWlzRm9yY2VWaXNpYmxlICYmIGlzRm9yZWdyb3VuZCkge1xuXHRcdFx0XHR0b0hpZGUucHVzaChjdXJyZW50SW5zdGFuY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdG9TaG93KSB7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVJbnN0YW5jZSA9IHRoaXMuX2dldEF2YWlsYWJsZVRlcm1pbmFsKGluc3RhbmNlLCAnc2hvdyBiYWNrZ3JvdW5kIHRlcm1pbmFsJyk7XG5cdFx0XHRpZiAoYXZhaWxhYmxlSW5zdGFuY2UpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLnNob3dCYWNrZ3JvdW5kVGVybWluYWwoYXZhaWxhYmxlSW5zdGFuY2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRvSGlkZSkge1xuXHRcdFx0Y29uc3QgYXZhaWxhYmxlSW5zdGFuY2UgPSB0aGlzLl9nZXRBdmFpbGFibGVUZXJtaW5hbChpbnN0YW5jZSwgJ21vdmUgdGVybWluYWwgdG8gYmFja2dyb3VuZCcpO1xuXHRcdFx0aWYgKGF2YWlsYWJsZUluc3RhbmNlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtTZXNzaW9uc1Rlcm1pbmFsXSBIaWRpbmcgdGVybWluYWwgJHthdmFpbGFibGVJbnN0YW5jZS5pbnN0YW5jZUlkfSAoZG9lcyBub3QgYmVsb25nIHRvIGFjdGl2ZSBrZXkgJHthY3RpdmVLZXl9KWApO1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UubW92ZVRvQmFja2dyb3VuZChhdmFpbGFibGVJbnN0YW5jZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IHRoZSB0ZXJtaW5hbCB3aXRoIHRoZSBtb3N0IHJlY2VudCBjb21tYW5kIGFzIGFjdGl2ZVxuXHRcdGNvbnN0IGZvcmVncm91bmQgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZm9yZWdyb3VuZEluc3RhbmNlcztcblx0XHRsZXQgbW9zdFJlY2VudDogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG1vc3RSZWNlbnRUaW1lc3RhbXAgPSAtMTtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIGZvcmVncm91bmQpIHtcblx0XHRcdGlmICh0aGlzLl9zdGFuZGFsb25lVGVybWluYWxJZHMuaGFzKGluc3RhbmNlLmluc3RhbmNlSWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY21kRGV0ZWN0aW9uID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0XHRjb25zdCBsYXN0Q21kID0gY21kRGV0ZWN0aW9uPy5jb21tYW5kcy5hdCgtMSk7XG5cdFx0XHRpZiAobGFzdENtZCAmJiBsYXN0Q21kLnRpbWVzdGFtcCA+IG1vc3RSZWNlbnRUaW1lc3RhbXApIHtcblx0XHRcdFx0bW9zdFJlY2VudFRpbWVzdGFtcCA9IGxhc3RDbWQudGltZXN0YW1wO1xuXHRcdFx0XHRtb3N0UmVjZW50ID0gaW5zdGFuY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChtb3N0UmVjZW50KSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UobW9zdFJlY2VudCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2VzIChraWxscykgdGVybWluYWxzIGFzc29jaWF0ZWQgd2l0aCB0aGUgZ2l2ZW4gc2Vzc2lvbiBpZC4gVXNlZFxuXHQgKiB3aGVuIGEgc2Vzc2lvbiBpcyByZW1vdmVkOiByZW1vdmFsIGlzIGFuIGV4cGxpY2l0IHVzZXIgYWN0aW9uLCBzbyB0aGUgcHR5XG5cdCAqIGlzIHRvcm4gZG93bi5cblx0ICpcblx0ICogTmV2ZXIgZGlzcG9zZXMgdGhlIHRlcm1pbmFsIHRoZSB1c2VyIGlzIGN1cnJlbnRseSB3b3JraW5nIGluLiBSZW1vdmFsIGFsc29cblx0ICogY292ZXJzIHNlc3Npb24gKmdyYWR1YXRpb24qICh1bnRpdGxlZCBcdTIxOTIgY29tbWl0dGVkIHZpYSBgb25EaWRSZXBsYWNlU2Vzc2lvbmAsXG5cdCAqIHdoaWNoIHN1cmZhY2VzIHRoZSBza2VsZXRvbiBpbiBgcmVtb3ZlZGApOiB0aGUgZm9jdXNlZCAoYWN0aXZlKSBpbnN0YW5jZSBpc1xuXHQgKiB0aGVyZWZvcmUgYWx3YXlzIHByb3RlY3RlZC5cblx0ICpcblx0ICoge0BsaW5rIHJlYXNvbn0gaXMgbG9nZ2VkIGZvciBlYWNoIGtpbGxlZCB0ZXJtaW5hbCBzbyB1bmV4cGVjdGVkIGRpc3Bvc2FscyBpblxuXHQgKiB0aGUgYWdlbnRzIHdpbmRvdyBjYW4gYmUgZGlhZ25vc2VkIGZyb20gdGhlIGxvZ3MuIFNlZSAjMzEzNTEwLCAjMzE4NjQ1LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY2xvc2VUZXJtaW5hbHNGb3JTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCByZWFzb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3RlY3RlZEluc3RhbmNlSWQgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U/Lmluc3RhbmNlSWQ7XG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl9nZXRUcmFja2VkVGVybWluYWxzRm9yU2Vzc2lvbihzZXNzaW9uSWQpKSB7XG5cdFx0XHRpZiAocHJvdGVjdGVkSW5zdGFuY2VJZCAhPT0gdW5kZWZpbmVkICYmIGluc3RhbmNlLmluc3RhbmNlSWQgPT09IHByb3RlY3RlZEluc3RhbmNlSWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU2Vzc2lvbnNUZXJtaW5hbF0gU2tpcHBpbmcgYWN0aXZlIHRlcm1pbmFsICR7aW5zdGFuY2UuaW5zdGFuY2VJZH0gZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9ICh1c2VyIGlzIHdvcmtpbmcgaW4gaXQpYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXZhaWxhYmxlSW5zdGFuY2UgPSB0aGlzLl9nZXRBdmFpbGFibGVUZXJtaW5hbChpbnN0YW5jZSwgYGNsb3NlIHJlbW92ZWQgc2Vzc2lvbiB0ZXJtaW5hbCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHRcdGlmICghYXZhaWxhYmxlSW5zdGFuY2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTZXNzaW9uc1Rlcm1pbmFsXSBLaWxsaW5nIHRlcm1pbmFsICR7YXZhaWxhYmxlSW5zdGFuY2UuaW5zdGFuY2VJZH0gKHNlc3Npb246ICR7c2Vzc2lvbklkfSwgcmVhc29uOiAke3JlYXNvbn0pYCk7XG5cdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2FmZURpc3Bvc2VUZXJtaW5hbChhdmFpbGFibGVJbnN0YW5jZSk7XG5cdFx0XHR0aGlzLl9yZW1vdmVUZXJtaW5hbEZyb21UcmFja2VkU2Vzc2lvbnMoYXZhaWxhYmxlSW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGVzIChtb3ZlcyB0byBiYWNrZ3JvdW5kKSB0ZXJtaW5hbHMgYXNzb2NpYXRlZCB3aXRoIHRoZSBnaXZlbiBzZXNzaW9uIGlkXG5cdCAqIHdpdGhvdXQgZGlzcG9zaW5nIHRoZW0uIFVzZWQgd2hlbiBhIHNlc3Npb24gaXMgYXJjaGl2ZWQgKFwiTWFyayBhcyBEb25lXCIpOlxuXHQgKiBhcmNoaXZpbmcgaXMgcmV2ZXJzaWJsZSBhbmQgdGhlIHB0eSBtdXN0IHN1cnZpdmUgc28gaXQgY2FuIGJlIHNob3duIGFnYWluLlxuXHQgKlxuXHQgKiBBcmNoaXZpbmcgaXMgYXN5bmNocm9ub3VzIGFuZCBjYW4gbGFuZCB3aGlsZSB0aGUgdXNlciBpcyB3b3JraW5nIGluIGFcblx0ICoganVzdC1vcGVuZWQgdGVybWluYWwgYXQgdGhpcyBjd2QsIHNvIHRoZSBmb2N1c2VkIChhY3RpdmUpIGluc3RhbmNlIGlzXG5cdCAqIG5ldmVyIGhpZGRlbiBvdXQgZnJvbSB1bmRlciB0aGUgdXNlci5cblx0ICpcblx0ICoge0BsaW5rIHJlYXNvbn0gaXMgbG9nZ2VkIGZvciBlYWNoIGhpZGRlbiB0ZXJtaW5hbCBzbyB1bmV4cGVjdGVkIHZpc2liaWxpdHlcblx0ICogY2hhbmdlcyBpbiB0aGUgYWdlbnRzIHdpbmRvdyBjYW4gYmUgZGlhZ25vc2VkIGZyb20gdGhlIGxvZ3MuIFNlZSAjMzEzNTEwLFxuXHQgKiAjMzE4NjQ1LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGlkZVRlcm1pbmFsc0ZvclNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIHJlYXNvbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdGVjdGVkSW5zdGFuY2VJZCA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZT8uaW5zdGFuY2VJZDtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX2dldFRyYWNrZWRUZXJtaW5hbHNGb3JTZXNzaW9uKHNlc3Npb25JZCkpIHtcblx0XHRcdGlmIChwcm90ZWN0ZWRJbnN0YW5jZUlkICE9PSB1bmRlZmluZWQgJiYgaW5zdGFuY2UuaW5zdGFuY2VJZCA9PT0gcHJvdGVjdGVkSW5zdGFuY2VJZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTZXNzaW9uc1Rlcm1pbmFsXSBTa2lwcGluZyBhY3RpdmUgdGVybWluYWwgJHtpbnN0YW5jZS5pbnN0YW5jZUlkfSBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gKHVzZXIgaXMgd29ya2luZyBpbiBpdClgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhdmFpbGFibGVJbnN0YW5jZSA9IHRoaXMuX2dldEF2YWlsYWJsZVRlcm1pbmFsKGluc3RhbmNlLCBgaGlkZSBhcmNoaXZlZCB0ZXJtaW5hbCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHRcdGlmICghYXZhaWxhYmxlSW5zdGFuY2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTZXNzaW9uc1Rlcm1pbmFsXSBIaWRpbmcgdGVybWluYWwgJHthdmFpbGFibGVJbnN0YW5jZS5pbnN0YW5jZUlkfSAoc2Vzc2lvbjogJHtzZXNzaW9uSWR9LCByZWFzb246ICR7cmVhc29ufSlgKTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5tb3ZlVG9CYWNrZ3JvdW5kKGF2YWlsYWJsZUluc3RhbmNlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkdW1wVHJhY2tpbmcoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc29sZS5sb2coYFtTZXNzaW9uc1Rlcm1pbmFsXSBBY3RpdmUga2V5OiAke3RoaXMuX2FjdGl2ZUtleSA/PyAnPG5vbmU+J31gKTtcblx0XHRjb25zb2xlLmxvZyhgW1Nlc3Npb25zVGVybWluYWxdIFNlc3Npb24gdGVybWluYWxzOiAke0pTT04uc3RyaW5naWZ5KFsuLi50aGlzLl9zZXNzaW9uVGVybWluYWxzLmVudHJpZXMoKV0ubWFwKChbc2Vzc2lvbklkLCB0ZXJtaW5hbElkc10pID0+IFtzZXNzaW9uSWQsIFsuLi50ZXJtaW5hbElkc11dKSl9YCk7XG5cdFx0Y29uc29sZS5sb2coYFtTZXNzaW9uc1Rlcm1pbmFsXSBTdGFuZGFsb25lIHRlcm1pbmFsczogJHtKU09OLnN0cmluZ2lmeShbLi4udGhpcy5fc3RhbmRhbG9uZVRlcm1pbmFsSWRzXSl9YCk7XG5cdFx0Y29uc29sZS5sb2coJ1tTZXNzaW9uc1Rlcm1pbmFsXSA9PT0gQWxsIFRlcm1pbmFscyA9PT0nKTtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdGxldCBjd2QgPSAnPHVua25vd24+Jztcblx0XHRcdHRyeSB7IGN3ZCA9IGF3YWl0IGluc3RhbmNlLmdldEluaXRpYWxDd2QoKTsgfSBjYXRjaCB7IC8qIGlnbm9yZWQgKi8gfVxuXHRcdFx0Y29uc3QgaXNGb3JlZ3JvdW5kID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmZvcmVncm91bmRJbnN0YW5jZXMuaW5jbHVkZXMoaW5zdGFuY2UpO1xuXHRcdFx0Y29uc29sZS5sb2coYCAgJHtpbnN0YW5jZS5pbnN0YW5jZUlkfSAtICR7Y3dkfSAtICR7aXNGb3JlZ3JvdW5kID8gJ2ZvcmVncm91bmQnIDogJ2JhY2tncm91bmQnfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNob3dBbGxUZXJtaW5hbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsU2VydmljZS5mb3JlZ3JvdW5kSW5zdGFuY2VzLmluY2x1ZGVzKGluc3RhbmNlKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2hvd0JhY2tncm91bmRUZXJtaW5hbChpbnN0YW5jZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uc1Rlcm1pbmFsXSBNb3ZlZCB0ZXJtaW5hbCAke2luc3RhbmNlLmluc3RhbmNlSWR9IHRvIGZvcmVncm91bmRgKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24uSUQsIFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiB7QGxpbmsgQWdlbnRIb3N0U2Vzc2lvblRhc2tSdW5uZXJ9IHdpdGggdGhlXG4gKiB7QGxpbmsgSVNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnl9LiBMaXZlcyBuZXh0IHRvIHRoZSBvdGhlciBhZ2VudC1ob3N0XG4gKiB0ZXJtaW5hbCB3aXJpbmcgc28gdGhhdCB0aGUgcnVubmVyIGlzIHJlbW92ZWQgdG9nZXRoZXIgd2l0aCB0aGUgcmVzdCBvZlxuICogdGhlIHNlc3Npb25zIHRlcm1pbmFsIGNvbnRyaWJ1dGlvbiBpZiB0aGUgYWdlbnRzIGFwcCBzaHV0cyBkb3duLlxuICovXG5jbGFzcyBSZWdpc3RlckFnZW50SG9zdFNlc3Npb25UYXNrUnVubmVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9ucy5yZWdpc3RlckFnZW50SG9zdFRhc2tSdW5uZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnkgcmVnaXN0cnk6IElTZXNzaW9uVGFza1J1bm5lclJlZ2lzdHJ5LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHJ1bm5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNlc3Npb25UYXNrUnVubmVyKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RyeS5yZWdpc3RlcihydW5uZXIpKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUmVnaXN0ZXJBZ2VudEhvc3RTZXNzaW9uVGFza1J1bm5lckNvbnRyaWJ1dGlvbi5JRCwgUmVnaXN0ZXJBZ2VudEhvc3RTZXNzaW9uVGFza1J1bm5lckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcblxuY2xhc3MgRHVtcFRlcm1pbmFsVHJhY2tpbmdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50U2Vzc2lvbi5kdW1wVGVybWluYWxUcmFja2luZycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkdW1wVGVybWluYWxUcmFja2luZycsIFwiRHVtcCBUZXJtaW5hbCBUcmFja2luZ1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGdldFdvcmtiZW5jaENvbnRyaWJ1dGlvbjxTZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uPihTZXNzaW9uc1Rlcm1pbmFsQ29udHJpYnV0aW9uLklEKTtcblx0XHRhd2FpdCBjb250cmlidXRpb24uZHVtcFRyYWNraW5nKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKER1bXBUZXJtaW5hbFRyYWNraW5nQWN0aW9uKTtcblxuY2xhc3MgU2hvd0FsbFRlcm1pbmFsc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRTZXNzaW9uLnNob3dBbGxUZXJtaW5hbHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd0FsbFRlcm1pbmFscycsIFwiU2hvdyBBbGwgVGVybWluYWxzXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gZ2V0V29ya2JlbmNoQ29udHJpYnV0aW9uPFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24+KFNlc3Npb25zVGVybWluYWxDb250cmlidXRpb24uSUQpO1xuXHRcdGF3YWl0IGNvbnRyaWJ1dGlvbi5zaG93QWxsVGVybWluYWxzKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFNob3dBbGxUZXJtaW5hbHNBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsZUFBd0I7QUFFMUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLG1CQUFtQix3QkFBd0I7QUFDcEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBaUMsMEJBQTBCLGdDQUFnQyxzQkFBc0I7QUFDakgsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBNEIsd0JBQXdCO0FBQ3BELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCLG9DQUFvQztBQUNsRSxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGlDQUFpQztB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
