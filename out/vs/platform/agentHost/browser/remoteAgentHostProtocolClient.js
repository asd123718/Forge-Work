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
import { DeferredPromise, TimeoutTimer } from "../../../base/common/async.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILogService } from "../../log/common/log.js";
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from "../../files/common/files.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { AgentSession } from "../common/agent.js";
import { AMBIENT_AGENT_HOST_AUTHORITY } from "../common/agentHostConnectionsService.js";
import { createRemoteWatchHandle } from "../common/agentHostFileSystemProvider.js";
import { AgentSubscriptionManager } from "../common/state/agentSubscription.js";
import { agentHostAuthority, fromAgentHostUri, toAgentHostUri } from "../common/agentHostUri.js";
import { AgentHostResourcePermissionError, IAgentHostResourceService, LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from "../common/agentHostResourceService.js";
import { ActionType } from "../common/state/sessionActions.js";
import { MessageAttachmentKind, ROOT_STATE_URI, StateComponents, isAhpRootChannel } from "../common/state/sessionState.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "../common/state/protocol/version/registry.js";
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, ProtocolError, ReconnectResultType } from "../common/state/sessionProtocol.js";
import { isClientTransport, NonReconnectableTransportError } from "../common/state/sessionTransport.js";
import { AhpErrorCodes } from "../common/state/protocol/errors.js";
import { ChatSourceKind, ContentEncoding } from "../common/state/protocol/commands.js";
import { encodeBase64 } from "../../../base/common/buffer.js";
import { LoadEstimator } from "../../../base/parts/ipc/common/ipc.net.js";
import { ITelemetryService, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID, TelemetryLevel, telemetryLevelEnabled } from "../../telemetry/common/telemetry.js";
import { getTelemetryLevel } from "../../telemetry/common/telemetryUtils.js";
import { AgentHostTelemetryLevelConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, getAgentHostTerminalAutoApproveRulesConfig, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, telemetryLevelToAgentHostConfigValue } from "../common/agentHostSchema.js";
import { getAgentHostConfigurationSyncEntries, resolveAgentHostConfigurationSyncPatch, resolveAgentHostConfigurationSyncValue } from "../common/agentHostConfigurationSync.js";
import { managedPermissionsConfigurationIds, resolveManagedSettingsPermissions } from "../common/agentHostManagedSettings.js";
import { AgentHostClientConnectionKind, toClientTelemetryMeta } from "../common/agentHostTelemetry.js";
import { dirname } from "../../../base/common/resources.js";
import { observableValue } from "../../../base/common/observable.js";
import { isFileResourceRead } from "../common/resourceReadLogging.js";
import { ResourceSet } from "../../../base/common/map.js";
const AHP_CLIENT_CONNECTION_CLOSED = -32e3;
const RECONNECT_INITIAL_DELAY_MS = 1e3;
const RECONNECT_MAX_DELAY_MS = 3e4;
const PING_INTERVAL_MS = 5e3;
const LIVENESS_TIMEOUT_MS = 2e4;
function connectionTimeoutError(address, silenceMs) {
  return new ProtocolError(
    AHP_CLIENT_CONNECTION_CLOSED,
    `Connection appears dead: ${address}; no message received for ${silenceMs}ms.`
  );
}
function connectionClosedError(address) {
  return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection closed: ${address}`);
}
function connectionDisposedError(address) {
  return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection disposed: ${address}`);
}
function transportLostError(address) {
  return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Transport lost (reconnecting): ${address}`);
}
var AgentHostClientState = /* @__PURE__ */ ((AgentHostClientState2) => {
  AgentHostClientState2["Connecting"] = "connecting";
  AgentHostClientState2["Incompatible"] = "incompatible";
  AgentHostClientState2["Connected"] = "connected";
  AgentHostClientState2["Reconnecting"] = "reconnecting";
  AgentHostClientState2["Closed"] = "closed";
  return AgentHostClientState2;
})(AgentHostClientState || {});
let RemoteAgentHostProtocolClient = class extends Disposable {
  constructor(identity, transportOrFactory, loadEstimator, clientId = void 0, _clientInfo, _logService, _resourceService, _configurationService, _telemetryService) {
    super();
    this._clientInfo = _clientInfo;
    this._logService = _logService;
    this._resourceService = _resourceService;
    this._configurationService = _configurationService;
    this._telemetryService = _telemetryService;
    /** Disposable holding the listeners attached to the current transport. */
    this._transportListeners = this._register(new MutableDisposable());
    this._serverSeq = 0;
    this._nextClientSeq = 1;
    /**
     * Latest `initialize` response from the host. Captured at the end of
     * {@link connect} and re-captured after a soft-reconnect that pulled
     * a fresh snapshot. `undefined` before the handshake completes.
     */
    this._initializeResult = observableValue("agentHostInitializeResult", void 0);
    this._onDidAction = this._register(new Emitter());
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = this._register(new Emitter());
    this.onDidNotification = this._onDidNotification.event;
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    /**
     * Fires for every `otlp/exportLogs` notification the host sends on a
     * channel this client has subscribed to. Each payload is an
     * OTLP/JSON `ExportLogsServiceRequest` value verbatim; consumers
     * decode it (see `iterateOtlpLogRecords`) and route the records to a
     * registered logger or sink.
     *
     * Channel URIs are kept opaque on the wire so the same event covers
     * every {@link TelemetryCapabilities.logs} URI the host advertises —
     * subscribers should filter by `channel` if they care.
     */
    this._onDidReceiveOtlpLogs = this._register(new Emitter());
    this.onDidReceiveOtlpLogs = this._onDidReceiveOtlpLogs.event;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeConnectionState = this._register(new Emitter());
    this.onDidChangeConnectionState = this._onDidChangeConnectionState.event;
    /**
     * Discriminated state union. Read via narrowing (`_state.kind === ...`);
     * reconnect-only fields like the gate/outbox/attempt counter are only
     * accessible while {@link _state.kind} is {@link AgentHostClientState.Reconnecting},
     * and protocol errors are only accessible while the state is
     * {@link AgentHostClientState.Incompatible} or {@link AgentHostClientState.Closed}.
     */
    this._state = { kind: "connecting" /* Connecting */, outbox: [] };
    /** Pending JSON-RPC requests keyed by request id. */
    this._pendingRequests = /* @__PURE__ */ new Map();
    this._authentication = /* @__PURE__ */ new Map();
    this._nextRequestId = 1;
    /**
     * Timestamp of the most recent message of any kind received from the
     * server. Used only for diagnostic logging when the close timer fires.
     */
    this._lastReadTime = Date.now();
    /**
     * Liveness watchdog — see {@link _resetLivenessTimers}.
     *
     * {@link _pingTimer} fires after {@link PING_INTERVAL_MS} of inbound
     * silence and sends an application-level `ping` so we have something
     * to time out on. {@link _closeTimer} fires after another
     * {@link LIVENESS_TIMEOUT_MS} of continued silence and force-closes
     * the transport so the renderer's reconnect logic kicks in. Both are
     * reset on every received message, so busy connections generate no
     * ping traffic at all.
     *
     * Detects silently-dead transports (e.g. SSH/tunnel after laptop
     * sleep + network change) that don't produce a socket close event of
     * their own.
     */
    this._pingTimer = this._register(new TimeoutTimer());
    this._closeTimer = this._register(new TimeoutTimer());
    /**
     * URIs we have already granted implicit read access for on this connection.
     * Uses URI-aware comparison to dedupe repeat sends and is cleared with the connection.
     */
    this._grantedImplicitReadUris = new ResourceSet();
    this._implicitReadGrants = this._register(new DisposableStore());
    this._resourceIdentity = identity;
    this._address = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? AMBIENT_AGENT_HOST_AUTHORITY : identity;
    this._clientId = clientId ?? generateUuid();
    this._connectionAuthority = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? AMBIENT_AGENT_HOST_AUTHORITY : agentHostAuthority(identity);
    this._loadEstimator = loadEstimator ?? LoadEstimator.getInstance();
    if (typeof transportOrFactory === "function") {
      this._transportFactory = transportOrFactory;
      this._installTransport(transportOrFactory());
    } else {
      this._transportFactory = void 0;
      this._installTransport(transportOrFactory);
    }
    this._subscriptionManager = this._register(new AgentSubscriptionManager(
      this._clientId,
      () => this.nextClientSeq(),
      (msg) => this._logService.warn(`[RemoteAgentHostProtocolClient] ${msg}`),
      (resource) => this.subscribe(resource),
      (resource) => this.unsubscribe(resource)
    ));
    this._register(this.onDidAction((envelope) => {
      this._subscriptionManager.receiveEnvelope(envelope);
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (this._state.kind !== "connected" /* Connected */) {
        return;
      }
      const patch = {};
      for (const entry of getAgentHostConfigurationSyncEntries(this._resourceIdentity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY)) {
        if (!e.affectsConfiguration(entry.settingId)) {
          continue;
        }
        const value = resolveAgentHostConfigurationSyncValue(this._configurationService, entry);
        if (value !== void 0) {
          patch[entry.sync.key] = value;
        }
      }
      if (Object.keys(patch).length) {
        this._dispatchRootConfig(patch);
      }
      if (e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID) || e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)) {
        this._updateTelemetryLevel();
      }
      if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID)) {
        this._updateTerminalAutoApproveEnabled();
      }
      if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_SETTING_ID) || e.affectsConfiguration(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID)) {
        this._updateTerminalAutoApproveRules();
      }
      if (e.affectsConfiguration(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID)) {
        this._updateDisableRepoInfoTelemetry();
      }
      if (managedPermissionsConfigurationIds.some((settingId) => e.affectsConfiguration(settingId))) {
        void this._updateManagedSettingsPermissions();
      }
    }));
    if (!isClientTransport(this._transport)) {
      this._resetLivenessTimers();
    }
  }
  get clientId() {
    return this._clientId;
  }
  get address() {
    return this._address;
  }
  get defaultDirectory() {
    return this._defaultDirectory;
  }
  get connectionState() {
    return this._state.kind;
  }
  /**
   * The latest `initialize` response from the host, or `undefined` if
   * the handshake has not completed yet. Exposed observably so callers can
   * react as advertised capabilities (telemetry, `completionTriggerCharacters`,
   * `terminalCommandPrefix`, ...) arrive.
   */
  get initializeResult() {
    return this._initializeResult;
  }
  /**
   * Install a transport and wire listeners. Used both for the initial
   * transport and for replacements created by the factory during a
   * transport-level reconnect.
   */
  _installTransport(transport) {
    const listeners = new DisposableStore();
    listeners.add(transport);
    listeners.add(transport.onMessage((msg) => this._handleMessage(msg)));
    listeners.add(transport.onClose(() => this._handleTransportClose()));
    this._transport = transport;
    this._transportListeners.value = listeners;
  }
  /**
   * Transition to a new {@link ClientState}. Fires {@link onDidChangeConnectionState}
   * only when the variant kind actually changes; in-place mutation of
   * reconnect-state fields (e.g. swapping the gate on a failed retry) does
   * NOT count as a transition and produces no event.
   */
  _transitionTo(next) {
    if (this._state.kind === next.kind) {
      return;
    }
    this._state = next;
    this._onDidChangeConnectionState.fire(next.kind);
  }
  _newReconnectGate() {
    const deferred = new DeferredPromise();
    deferred.p.then(void 0, () => {
    });
    return deferred;
  }
  _newReconnectState() {
    return { gate: this._newReconnectGate(), outbox: [], attempt: 0, timeoutHandle: void 0 };
  }
  dispose() {
    this._handleClose(connectionDisposedError(this._address));
    super.dispose();
  }
  /**
   * Connect to the remote agent host and perform the protocol handshake.
   */
  async connect() {
    try {
      if (isClientTransport(this._transport)) {
        await this._raceClose(this._transport.connect());
      }
      if (this._state.kind !== "connecting" /* Connecting */) {
        throw transportLostError(this._address);
      }
      const result = await this._dispatchRequest("initialize", {
        channel: ROOT_STATE_URI,
        // Advertise every version this client can negotiate, most-preferred first, so an
        // older host (a cloud sandbox running a 0.5.x `copilotd`) can negotiate down
        // instead of rejecting the connection. A current host still picks the newest.
        protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        clientId: this._clientId,
        clientInfo: this._clientInfo,
        ...this._clientConnectionTelemetryMeta(),
        initialSubscriptions: [ROOT_STATE_URI]
      }, { bypassInitializeQueue: true });
      this._applyInitializeResult(result);
      for (const snapshot of result.snapshots ?? []) {
        if (isAhpRootChannel(snapshot.resource)) {
          this._subscriptionManager.handleRootSnapshot(snapshot.state, snapshot.fromSeq);
        }
      }
      if (isClientTransport(this._transport) && this._state.kind === "connecting" /* Connecting */) {
        for (const message of this._state.outbox) {
          this._transport.send(message);
        }
        this._state.outbox.length = 0;
      }
      this._transitionTo({ kind: "connected" /* Connected */ });
      this._resetLivenessTimers();
    } catch (error) {
      const protocolError = error instanceof ProtocolError ? error : new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, error instanceof Error ? error.message : String(error));
      if (protocolError.code === AhpErrorCodes.UnsupportedProtocolVersion) {
        this._cancelLivenessTimers();
        if (this._state.kind === "connecting" /* Connecting */) {
          this._state.outbox.length = 0;
        }
        this._rejectPendingRequests(protocolError);
        this._transitionTo({ kind: "incompatible" /* Incompatible */, error: protocolError });
        throw error;
      }
      if (error instanceof NonReconnectableTransportError) {
        this._handleClose(protocolError);
        throw error;
      }
      if (this._state.kind === "reconnecting" /* Reconnecting */) {
        throw error;
      }
      if (protocolError.code === AHP_CLIENT_CONNECTION_CLOSED && this._beginReconnectFromConnecting(protocolError)) {
        throw error;
      }
      this._handleClose(protocolError);
      throw error;
    }
  }
  /**
   * Externally signal that the transport has closed. Used by services
   * managing a passive transport (SSH / dev-tunnels) when they observe
   * a connection-loss IPC event independent of the transport's own
   * onClose — without this, a single dropped IPC delivery on the
   * transport's close channel leaves the client stranded in
   * `Connected` until its watchdog fires (which can take hours when
   * the renderer is backgrounded and `setTimeout` is throttled).
   *
   * Idempotent — no-op if already closed or mid-reconnect.
   */
  notifyTransportClosed() {
    this._handleTransportClose();
  }
  /**
   * Called from the transport's `onClose` event. When a {@link _transportFactory}
   * is configured we attempt to soft-reconnect rather than fire `onDidClose` —
   * the protocol-level `reconnect` request lets the server replay missed
   * actions and preserves the `clientId` so pending tool calls etc. are not
   * cancelled by the host-side disconnect timeout. Without a factory
   * (passive-transport SSH/relay path) we fall back to "close means closed"
   * and let the service decide whether to spin up a fresh client.
   */
  _handleTransportClose() {
    switch (this._state.kind) {
      case "closed" /* Closed */:
        return;
      case "connecting" /* Connecting */:
        if (!this._beginReconnectFromConnecting(connectionClosedError(this._address))) {
          this._handleClose(connectionClosedError(this._address));
        }
        return;
      case "incompatible" /* Incompatible */:
        this._handleClose(connectionClosedError(this._address));
        return;
      case "connected" /* Connected */: {
        if (!this._transportFactory) {
          this._handleClose(connectionClosedError(this._address));
          return;
        }
        this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address}; scheduling reconnect.`);
        this._transitionTo({ kind: "reconnecting" /* Reconnecting */, reconnect: this._newReconnectState() });
        this._cancelLivenessTimers();
        this._rejectPendingRequests(transportLostError(this._address));
        this._scheduleReconnect();
        return;
      }
      case "reconnecting" /* Reconnecting */:
        this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address} mid-reconnect; aborting the current attempt.`);
        this._cancelLivenessTimers();
        this._rejectPendingRequests(transportLostError(this._address));
        return;
    }
  }
  _beginReconnectFromConnecting(error) {
    if (this._state.kind !== "connecting" /* Connecting */ || !this._transportFactory) {
      return false;
    }
    this._logService.info(`[RemoteAgentHostProtocol] Transport lost while connecting to ${this._address}; scheduling a fresh initialize.`);
    const outbox = this._state.outbox;
    this._rejectPendingRequests(error);
    this._grantedImplicitReadUris.clear();
    this._implicitReadGrants.clear();
    this._transitionTo({
      kind: "reconnecting" /* Reconnecting */,
      reconnect: { ...this._newReconnectState(), outbox }
    });
    this._cancelLivenessTimers();
    this._scheduleReconnect();
    return true;
  }
  /**
   * Reopens a terminal connection after its host has been explicitly restarted.
   */
  reconnectFromClosed() {
    if (this._state.kind !== "closed" /* Closed */ || !this._transportFactory || this._store.isDisposed) {
      return false;
    }
    this._transitionTo({ kind: "reconnecting" /* Reconnecting */, reconnect: this._newReconnectState() });
    this._scheduleReconnect();
    return true;
  }
  _scheduleReconnect() {
    if (this._state.kind !== "reconnecting" /* Reconnecting */ || !this._transportFactory) {
      return;
    }
    const reconnect = this._state.reconnect;
    if (reconnect.timeoutHandle !== void 0) {
      return;
    }
    const attempt = reconnect.attempt + 1;
    const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * Math.pow(2, attempt - 1), RECONNECT_MAX_DELAY_MS);
    this._logService.info(`[RemoteAgentHostProtocol] Reconnecting to ${this._address} in ${delay}ms (attempt ${attempt}).`);
    reconnect.timeoutHandle = setTimeout(() => {
      if (this._state.kind === "reconnecting" /* Reconnecting */) {
        this._state.reconnect.timeoutHandle = void 0;
      }
      void this._attemptReconnect();
    }, delay);
  }
  async _attemptReconnect() {
    if (this._state.kind !== "reconnecting" /* Reconnecting */ || !this._transportFactory) {
      return;
    }
    const reconnect = this._state.reconnect;
    reconnect.attempt++;
    let transport;
    try {
      transport = this._transportFactory();
      this._installTransport(transport);
      if (isClientTransport(transport)) {
        await transport.connect();
      }
      if (this._state.kind !== "reconnecting" /* Reconnecting */) {
        return;
      }
      const subscriptions = this._subscriptionManager.currentSubscriptionUris().map((u) => u.toString());
      if (!subscriptions.includes(ROOT_STATE_URI)) {
        subscriptions.unshift(ROOT_STATE_URI);
      }
      const lastSeenServerSeq = this._serverSeq;
      const { result, freshInitialize } = await this._reconnectOrInitialize(lastSeenServerSeq, subscriptions);
      if (this._state.kind !== "reconnecting" /* Reconnecting */) {
        return;
      }
      this._applyReconnectResult(result, freshInitialize);
      this._updateManagedSettingsPermissions(true);
      if (freshInitialize && result.type === ReconnectResultType.Snapshot) {
        await this._restoreAuthenticationAfterFreshInitialize();
        await this._restoreSubscriptionsAfterFreshInitialize(result.snapshots);
      }
      if (this._state.kind !== "reconnecting" /* Reconnecting */) {
        return;
      }
      this._forwardClientConfig(false);
      const { gate } = reconnect;
      this._drainAfterReconnect(reconnect.outbox);
      this._lastReadTime = Date.now();
      this._resetLivenessTimers();
      this._transitionTo({ kind: "connected" /* Connected */ });
      gate.complete();
      this._logService.info(`[RemoteAgentHostProtocol] Reconnected to ${this._address}.`);
    } catch (err) {
      this._logService.warn(`[RemoteAgentHostProtocol] Reconnect attempt failed for ${this._address}: ${err instanceof Error ? err.message : String(err)}`);
      transport?.dispose();
      if (this._state.kind !== "reconnecting" /* Reconnecting */) {
        return;
      }
      if (err instanceof NonReconnectableTransportError) {
        this._handleClose(new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, err.message));
        return;
      }
      const oldGate = this._state.reconnect.gate;
      this._state.reconnect.gate = this._newReconnectGate();
      oldGate.error(err);
      this._scheduleReconnect();
    }
  }
  async _reconnectOrInitialize(lastSeenServerSeq, subscriptions) {
    try {
      const result = await this._dispatchRequest("reconnect", {
        clientId: this._clientId,
        lastSeenServerSeq,
        subscriptions,
        ...this._clientConnectionTelemetryMeta()
      }, { bypassReconnectGate: true });
      return { result, freshInitialize: false };
    } catch (error) {
      if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.NotFound) {
        throw error;
      }
    }
    this._logService.info(`[RemoteAgentHostProtocol] Server forgot client ${this._clientId}; initializing a fresh connection.`);
    const initializeResult = await this._dispatchRequest("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      clientId: this._clientId,
      clientInfo: this._clientInfo,
      ...this._clientConnectionTelemetryMeta(),
      initialSubscriptions: subscriptions
    }, { bypassReconnectGate: true });
    this._applyInitializeResult(initializeResult, false);
    return {
      result: { type: ReconnectResultType.Snapshot, snapshots: initializeResult.snapshots ?? [] },
      freshInitialize: true
    };
  }
  async _restoreSubscriptionsAfterFreshInitialize(initialSnapshots) {
    const restored = new Set(initialSnapshots.map((snapshot) => snapshot.resource));
    const active = this._subscriptionManager.getActiveSubscriptions().filter((subscription) => !restored.has(subscription.resource.toString()));
    const restoreGroup = async (subscriptions) => {
      await Promise.all(subscriptions.map(async (subscription) => {
        try {
          const result = await this._dispatchRequest("subscribe", {
            channel: subscription.resource.toString()
          }, { bypassReconnectGate: true });
          if (result.snapshot) {
            this._subscriptionManager.applyReconnectSnapshot(
              result.snapshot.resource,
              result.snapshot.state,
              result.snapshot.fromSeq,
              true
            );
            this._serverSeq = Math.max(this._serverSeq, result.snapshot.fromSeq);
          }
        } catch (error) {
          if (error instanceof ProtocolError && error.code === AHP_CLIENT_CONNECTION_CLOSED) {
            throw error;
          }
          this._logService.warn(`[RemoteAgentHostProtocolClient] Failed to restore subscription ${subscription.resource.toString()} after host restart: ${error instanceof Error ? error.message : String(error)}`);
          this._subscriptionManager.markSubscriptionsMissing([subscription.resource]);
        }
      }));
    };
    await restoreGroup(active.filter((subscription) => subscription.kind === StateComponents.Session));
    await Promise.all([
      restoreGroup(active.filter((subscription) => subscription.kind === StateComponents.Chat)),
      restoreGroup(active.filter((subscription) => subscription.kind !== StateComponents.Session && subscription.kind !== StateComponents.Chat))
    ]);
  }
  async _restoreAuthenticationAfterFreshInitialize() {
    await Promise.all([...this._authentication.values()].map((params) => this._dispatchRequest("authenticate", {
      channel: ROOT_STATE_URI,
      ...params,
      scopes: params.scopes ? [...params.scopes] : void 0
    }, { bypassReconnectGate: true })));
  }
  _clientConnectionTelemetryMeta() {
    const sendIdentity = telemetryLevelEnabled(this._telemetryService, TelemetryLevel.USAGE);
    const machineId = sendIdentity ? this._telemetryService.machineId : void 0;
    const devDeviceId = sendIdentity ? this._telemetryService.devDeviceId : void 0;
    const meta = toClientTelemetryMeta(this._transport.clientConnectionKind, machineId, devDeviceId);
    return meta ? { _meta: meta } : {};
  }
  _applyInitializeResult(result, forwardClientConfig = true) {
    this._initializeResult.set(result, void 0);
    this._serverSeq = result.serverSeq;
    if (result.defaultDirectory) {
      const directory = result.defaultDirectory;
      this._defaultDirectory = typeof directory === "string" ? URI.parse(directory).path : URI.revive(directory).path;
    }
    if (forwardClientConfig) {
      this._forwardClientConfig();
    }
  }
  /**
   * Push the renderer-owned config values the host mirrors (telemetry level,
   * proxy discovery, migrate flag, …) as `RootConfigChanged` actions. Called on
   * initial connect AND on reconnect: a reconnected host may be a freshly
   * restarted process (or one that lost these values), and re-pushing is a cheap
   * no-op when nothing changed. Without this, a value read early — like the
   * migrate flag in `listSessions` — can be missing after a window reload.
   *
   * Most settings arrive here declaratively, via `agentHost` on their
   * configuration schema. The explicit calls below cover the cases a single
   * key-plus-transform can't express: values derived from several settings, and
   * settings contributed by an extension rather than by core.
   */
  _forwardClientConfig(includeManagedSettings = true) {
    this._dispatchRootConfig(resolveAgentHostConfigurationSyncPatch(this._configurationService, this._resourceIdentity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY));
    this._updateTelemetryLevel();
    this._updateTerminalAutoApproveEnabled();
    this._updateTerminalAutoApproveRules();
    this._updateDisableRepoInfoTelemetry();
    if (includeManagedSettings) {
      void this._updateManagedSettingsPermissions();
    }
  }
  /**
   * Apply a `reconnect` RPC result to the subscription manager. On `replay`
   * we feed each missed envelope through the normal action path; on
   * `snapshot` we reseat each named subscription with the fresh state and
   * advance the server seq cursor accordingly.
   */
  _applyReconnectResult(result, preservePending = false) {
    if (result.type === ReconnectResultType.Replay) {
      let maxSeq = this._serverSeq;
      for (const envelope of result.actions) {
        if (envelope.origin?.clientId === this._clientId && envelope.origin.clientSeq !== void 0 && !envelope.rejectionReason) {
          this._subscriptionManager.dropPendingSessionAction(envelope.channel, envelope.origin.clientSeq);
        }
        if (envelope.serverSeq > maxSeq) {
          maxSeq = envelope.serverSeq;
        }
        this._onDidAction.fire(envelope);
      }
      this._serverSeq = maxSeq;
      if (result.missing.length > 0) {
        this._logService.info(`[RemoteAgentHostProtocol] Server cannot resume ${result.missing.length} subscription(s) after reconnect.`);
        this._subscriptionManager.markSubscriptionsMissing(result.missing.map((u) => URI.parse(u)));
      }
    } else {
      let maxSeq = this._serverSeq;
      for (const snapshot of result.snapshots) {
        this._subscriptionManager.applyReconnectSnapshot(snapshot.resource, snapshot.state, snapshot.fromSeq, preservePending);
        if (snapshot.fromSeq > maxSeq) {
          maxSeq = snapshot.fromSeq;
        }
      }
      this._serverSeq = maxSeq;
    }
  }
  /**
   * Drain queued outgoing wire traffic after a successful soft reconnect:
   *
   * 1. Resend pending optimistic session actions that the server did NOT
   *    echo back in the replay buffer (i.e. anything still on
   *    {@link AgentSubscriptionManager.getPendingSessionActions}).
   * 2. Flush every message that {@link _sendNotification} queued onto the
   *    outbox while the gate was engaged.
   *
   * Replays are deduped against the outbox by `clientSeq` so a session
   * action that was both optimistic-tracked AND queued during the
   * reconnect window only goes out once.
   */
  _drainAfterReconnect(outbox) {
    const queuedSeqs = /* @__PURE__ */ new Set();
    for (const msg of outbox) {
      if (hasKey(msg, { method: true }) && msg.method === "dispatchAction") {
        queuedSeqs.add(msg.params.clientSeq);
      }
    }
    const replays = [];
    for (const entry of this._subscriptionManager.getPendingSessionActions()) {
      if (queuedSeqs.has(entry.clientSeq)) {
        continue;
      }
      this._grantImplicitReadsForOutgoingAction(entry.action);
      replays.push({
        jsonrpc: "2.0",
        method: "dispatchAction",
        params: { channel: entry.channel, clientSeq: entry.clientSeq, action: entry.action }
      });
    }
    if (replays.length > 0) {
      this._logService.info(`[RemoteAgentHostProtocol] Replaying ${replays.length} pending action(s) after reconnect to ${this._address}.`);
    }
    for (const msg of replays) {
      this._transport.send(msg);
    }
    for (const msg of outbox) {
      this._transport.send(msg);
    }
  }
  // ---- IAgentConnection subscription API ----------------------------------
  get rootState() {
    return this._subscriptionManager.rootState;
  }
  getSubscription(kind, resource, owner) {
    return this._subscriptionManager.getSubscription(kind, resource, owner);
  }
  getSubscriptionUnmanaged(_kind, resource) {
    return this._subscriptionManager.getSubscriptionUnmanaged(resource);
  }
  getInflightSessionCreate(resource) {
    return this._subscriptionManager.getInflightSessionCreate(resource);
  }
  trackSessionCreate(resource, promise) {
    this._subscriptionManager.trackSessionCreate(resource, promise);
  }
  getActiveSubscriptions() {
    return this._subscriptionManager.getActiveSubscriptions();
  }
  dispatch(channel, action) {
    const seq = this._subscriptionManager.dispatchOptimistic(channel, action);
    this.dispatchAction(channel, action, this._clientId, seq);
  }
  /**
   * Subscribe to state at a URI. Returns the current state snapshot.
   *
   * For stateless channels (e.g. `ahp-otlp:` telemetry channels) use
   * {@link subscribeStateless} — calling this method on a stateless
   * channel rejects because the server omits `snapshot` on the
   * response.
   */
  async subscribe(resource) {
    const result = await this._sendRequest("subscribe", { channel: resource.toString() });
    if (!result.snapshot) {
      throw new Error(`subscribe to ${resource.toString()} returned no snapshot`);
    }
    return result.snapshot;
  }
  /**
   * Subscribe to a stateless channel — one for which the server does
   * not maintain replayable state and therefore omits `snapshot` from
   * the `subscribe` response. Used today for the host's OTLP telemetry
   * channels (`ahp-otlp:`).
   *
   * Returns once the subscription is confirmed by the server.
   * Subsequent notifications on the channel arrive via the relevant
   * dispatch event (e.g. {@link onDidReceiveOtlpLogs} for log records).
   */
  async subscribeStateless(resource) {
    await this._sendRequest("subscribe", { channel: resource.toString() });
  }
  /**
   * Unsubscribe from state at a URI.
   */
  unsubscribe(resource) {
    this._sendNotification("unsubscribe", { channel: resource.toString() });
  }
  /**
   * Dispatch a client action to the server. Returns the clientSeq used.
   */
  dispatchAction(channel, action, _clientId, clientSeq) {
    this._grantImplicitReadsForOutgoingAction(action);
    this._sendNotification("dispatchAction", { channel, clientSeq, action });
  }
  /**
   * Create a new session on the remote agent host.
   */
  createSession(config) {
    const provider = config?.provider;
    if (!provider) {
      throw new Error("Cannot create remote agent host session without a provider.");
    }
    const session = config?.session ?? AgentSession.uri(provider, generateUuid());
    if (config?.activeClient?.customizations) {
      this._grantImplicitReadsForCustomizations(config.activeClient.customizations);
    }
    const promise = this._sendRequest("createSession", {
      channel: session.toString(),
      _meta: config?._meta,
      provider,
      workingDirectories: config?.workingDirectories?.map((d) => fromAgentHostUri(d).toString()),
      fork: config?.fork ? { session: fromAgentHostUri(config.fork.session).toString(), turnId: config.fork.turnId } : void 0,
      config: config?.config,
      activeClient: config?.activeClient,
      progressToken: config?.progressToken
    }).then(() => session);
    this._subscriptionManager.trackSessionCreate(session, promise);
    return promise;
  }
  async resolveSessionConfig(params) {
    return this._sendRequest("resolveSessionConfig", {
      channel: ROOT_STATE_URI,
      provider: params.provider,
      workingDirectory: params.workingDirectory ? fromAgentHostUri(params.workingDirectory).toString() : void 0,
      config: params.config
    });
  }
  async sessionConfigCompletions(params) {
    return this._sendRequest("sessionConfigCompletions", {
      channel: ROOT_STATE_URI,
      provider: params.provider,
      workingDirectory: params.workingDirectory ? fromAgentHostUri(params.workingDirectory).toString() : void 0,
      config: params.config,
      property: params.property,
      query: params.query
    });
  }
  async completions(params) {
    return this._sendRequest("completions", params);
  }
  /**
   * Send an application-level ping and wait for the server's response.
   * Used by {@link _watchdogTick} to keep idle connections under
   * watchdog supervision; safe to call from external code as well.
   *
   * The returned promise rejects with a {@link ProtocolError} if the
   * connection closes before a response arrives.
   */
  async ping() {
    await this._sendRequest("ping", { channel: ROOT_STATE_URI });
  }
  /**
   * Returns the trigger characters captured from the `initialize` handshake.
   * Empty when the remote host did not announce any.
   */
  async getCompletionTriggerCharacters() {
    while (this._state.kind === "connecting" /* Connecting */) {
      await Event.toPromise(this.onDidChangeConnectionState);
    }
    switch (this._state.kind) {
      case "incompatible" /* Incompatible */:
      case "closed" /* Closed */:
        throw this._state.error;
      case "connected" /* Connected */:
      case "reconnecting" /* Reconnecting */:
        return this._initializeResult.get()?.completionTriggerCharacters ?? [];
    }
  }
  /**
   * Authenticate with the remote agent host using a specific scheme.
   */
  async authenticate(params) {
    const normalizedParams = {
      ...params,
      scopes: params.scopes ? [...new Set(params.scopes)].sort() : void 0
    };
    await this._sendRequest("authenticate", {
      channel: ROOT_STATE_URI,
      ...normalizedParams,
      scopes: normalizedParams.scopes ? [...normalizedParams.scopes] : void 0
    });
    const key = `${normalizedParams.resource}\0${JSON.stringify(normalizedParams.scopes ?? [])}`;
    if (params.token) {
      this._authentication.set(key, normalizedParams);
    } else {
      this._authentication.delete(key);
    }
    return { authenticated: true };
  }
  /**
   * Gracefully shut down all sessions on the remote host.
   */
  async shutdown() {
    await this._sendExtensionRequest("shutdown");
  }
  /**
   * List the endpoints the remote agent host suggests probing for connectivity.
   */
  async getNetworkDiagnosticsInfo() {
    return this._sendExtensionRequest("getNetworkDiagnosticsInfo");
  }
  async getManagedSettingsDiagnostics() {
    return this._sendExtensionRequest("getManagedSettingsDiagnostics");
  }
  /**
   * Probe connectivity from the remote agent host to a single `url`.
   */
  async diagnosticsFetch(url) {
    return this._sendExtensionRequest("diagnosticsFetch", { url });
  }
  /**
   * Dispose a session on the remote agent host.
   */
  async disposeSession(session) {
    await this._sendRequest("disposeSession", { channel: session.toString() });
  }
  async createChat(session, chat, options) {
    await this._sendRequest("createChat", {
      channel: session.toString(),
      chat: chat.toString(),
      ...options?.fork ? {
        source: { kind: ChatSourceKind.Fork, chat: options.fork.source.toString(), turnId: options.fork.turnId }
      } : {},
      ...options?.sideChat ? {
        source: {
          kind: ChatSourceKind.SideChat,
          chat: options.sideChat.source.toString(),
          turnId: options.sideChat.turnId,
          ...options.sideChat.selection ? { selection: options.sideChat.selection } : {}
        }
      } : {}
    });
  }
  async disposeChat(chat) {
    await this._sendRequest("disposeChat", { channel: chat.toString() });
  }
  /**
   * Create a new terminal on the remote agent host.
   */
  async createTerminal(params) {
    await this._sendRequest("createTerminal", params);
  }
  /**
   * Dispose a terminal on the remote agent host.
   */
  async disposeTerminal(terminal) {
    await this._sendRequest("disposeTerminal", { channel: terminal.toString() });
  }
  async invokeChangesetOperation(params) {
    return await this._sendRequest("invokeChangesetOperation", params);
  }
  /**
   * Send a request on an `mcp://` AHP side channel. The agent-host
   * routes by `params.channel` so we inject it automatically.
   */
  async handleMcpRequest(channel, method, params) {
    return await this._dispatchRequest(method, { ...params ?? {}, channel });
  }
  /**
   * List all sessions from the remote agent host.
   */
  async listSessions() {
    const result = await this._sendRequest("listSessions", { channel: ROOT_STATE_URI });
    return result.items.map((s) => ({
      session: URI.parse(s.resource),
      startTime: Date.parse(s.createdAt),
      modifiedTime: Date.parse(s.modifiedAt),
      ...s.project ? {
        project: {
          uri: this._toLocalProjectUri(URI.parse(s.project.uri)),
          displayName: s.project.displayName
        }
      } : {},
      summary: s.title,
      status: s.status,
      activity: s.activity,
      workingDirectory: typeof s.workingDirectories?.[0] === "string" ? toAgentHostUri(URI.parse(s.workingDirectories?.[0]), this._connectionAuthority) : void 0,
      workingDirectories: s.workingDirectories?.map((d) => toAgentHostUri(URI.parse(d), this._connectionAuthority)),
      changes: s.changes,
      // Carry durable host provenance for sessions first materialized from a listing.
      ...s._meta !== void 0 ? { _meta: s._meta } : {}
    }));
  }
  _toLocalProjectUri(uri) {
    return uri.scheme === Schemas.file ? toAgentHostUri(uri, this._connectionAuthority) : uri;
  }
  /**
   * Inspect an outgoing client-dispatched action and grant implicit reads for
   * resources that the host will need to read after receiving the action.
   */
  _grantImplicitReadsForOutgoingAction(action) {
    switch (action.type) {
      case ActionType.SessionActiveClientSet:
        if (action.activeClient.customizations) {
          this._grantImplicitReadsForCustomizations(action.activeClient.customizations);
        }
        break;
      case ActionType.ChatTurnStarted:
      case ActionType.ChatPendingMessageSet:
        this._grantImplicitReadsForMessage(action.message);
        break;
    }
  }
  _grantImplicitReadsForMessage(message) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.type !== MessageAttachmentKind.Resource) {
        continue;
      }
      try {
        this._grantImplicitRead(URI.parse(attachment.uri));
      } catch {
        continue;
      }
    }
  }
  /**
   * Register implicit read grants for each customization URI that we are
   * about to send to the host. The host needs to read these to materialize
   * the customization, but should not need to write them. Grants are
   * deduped per connection and revoked when the connection closes.
   */
  _grantImplicitReadsForCustomizations(refs) {
    for (const ref of refs) {
      let uri;
      try {
        uri = URI.parse(ref.uri);
      } catch {
        continue;
      }
      this._grantImplicitRead(dirname(uri));
    }
  }
  _grantImplicitRead(uri) {
    if (this._grantedImplicitReadUris.has(uri)) {
      return;
    }
    this._grantedImplicitReadUris.add(uri);
    this._implicitReadGrants.add(this._resourceService.grantImplicitRead(this._resourceIdentity, uri));
  }
  /**
   * List the contents of a directory on the remote host's filesystem.
   */
  async resourceList(uri) {
    return await this._sendRequest("resourceList", { channel: ROOT_STATE_URI, uri: uri.toString() });
  }
  /**
   * Read the content of a resource on the remote host.
   */
  async resourceRead(uri) {
    return this._sendRequest("resourceRead", { channel: ROOT_STATE_URI, uri: uri.toString() });
  }
  async resourceWrite(params) {
    return this._sendRequest("resourceWrite", params);
  }
  async resourceCopy(params) {
    return this._sendRequest("resourceCopy", params);
  }
  async resourceDelete(params) {
    return this._sendRequest("resourceDelete", params);
  }
  async resourceMove(params) {
    return this._sendRequest("resourceMove", params);
  }
  async resourceResolve(params) {
    return this._sendRequest("resourceResolve", params);
  }
  async resourceMkdir(params) {
    return this._sendRequest("resourceMkdir", params);
  }
  async createResourceWatch(params) {
    return this._sendRequest("createResourceWatch", params);
  }
  /**
   * Convenience wrapper used by {@link AHPFileSystemProvider.watch}:
   * runs `createResourceWatch` + `subscribe` and returns a handle that
   * surfaces `resourceWatch/changed` envelopes as
   * {@link IFileChange}[] events. Disposing the handle unsubscribes
   * the watch channel.
   */
  watchResource(params) {
    return createRemoteWatchHandle({
      createResourceWatch: (p) => this.createResourceWatch(p),
      subscribe: (uri) => this.subscribe(uri),
      unsubscribe: (uri) => this.unsubscribe(uri),
      onDidAction: this.onDidAction
    }, params);
  }
  /**
   * Trigger the CLI-managed upgrade flow for this agent host using the
   * method name advertised by the server (typically
   * {@link VSCODE_UPGRADE_METHOD}). Callable before {@link connect} has
   * completed — typically used when the host has just rejected our
   * `initialize` with an `UnsupportedProtocolVersion` error. The
   * transport stays open after the rejection, so the extension request
   * rides over it without a special out-of-band path.
   *
   * The result mirrors the CLI's HTTP response: ok flag, whether the
   * upgrade is needed / started, running/latest commits.
   */
  triggerVscodeUpgrade(method) {
    return this._dispatchRequest(method, {}, { allowIncompatibleUpgrade: true });
  }
  _handleMessage(msg) {
    if (this._state.kind === "closed" /* Closed */) {
      return;
    }
    this._lastReadTime = Date.now();
    this._resetLivenessTimers();
    if (isJsonRpcRequest(msg)) {
      this._handleReverseRequest(msg.id, msg.method, msg.params);
    } else if (isJsonRpcResponse(msg)) {
      const pending = this._pendingRequests.get(msg.id);
      if (pending) {
        this._pendingRequests.delete(msg.id);
        if (hasKey(msg, { error: true })) {
          if (this._shouldLogFailedRequest(pending, msg.error)) {
            this._logService.warn(`[RemoteAgentHostProtocol] Request ${msg.id} failed:`, msg.error);
          }
          pending.deferred.error(this._toProtocolError(msg.error));
        } else {
          pending.deferred.complete(msg.result);
        }
      } else {
        this._logService.warn(`[RemoteAgentHostProtocol] Received response for unknown request id ${msg.id}`);
      }
    } else if (isJsonRpcNotification(msg)) {
      switch (msg.method) {
        case "action": {
          const envelope = msg.params;
          this._serverSeq = Math.max(this._serverSeq, envelope.serverSeq);
          this._onDidAction.fire(envelope);
          break;
        }
        case "root/sessionAdded":
        case "root/sessionRemoved":
        case "root/sessionSummaryChanged":
        case "root/progress":
        case "auth/required": {
          this._logService.trace(`[RemoteAgentHostProtocol] Notification: ${msg.method}`);
          this._onDidNotification.fire({ type: msg.method, ...msg.params });
          break;
        }
        case "otlp/exportLogs":
          this._onDidReceiveOtlpLogs.fire(msg.params);
          break;
        case "otlp/exportTraces":
        case "otlp/exportMetrics":
          break;
        default: {
          const rawChannel = msg.params && typeof msg.params === "object" ? msg.params.channel : void 0;
          if (typeof rawChannel === "string" && rawChannel.toLowerCase().startsWith("mcp:/")) {
            const { channel: _channel, ...rest } = msg.params;
            this._onMcpNotification.fire({ channel: rawChannel, method: msg.method, params: rest });
            break;
          }
          this._logService.trace(`[RemoteAgentHostProtocol] Unhandled method: ${msg.method}`);
          break;
        }
      }
    } else {
      this._logService.warn(`[RemoteAgentHostProtocol] Unrecognized message:`, JSON.stringify(msg));
    }
  }
  _handleClose(error) {
    if (this._state.kind === "closed" /* Closed */) {
      return;
    }
    this._cancelLivenessTimers();
    if (this._state.kind === "reconnecting" /* Reconnecting */) {
      const reconnect = this._state.reconnect;
      if (reconnect.timeoutHandle !== void 0) {
        clearTimeout(reconnect.timeoutHandle);
      }
      if (!reconnect.gate.isSettled) {
        reconnect.gate.error(error);
      }
    }
    if (this._state.kind === "connecting" /* Connecting */) {
      this._state.outbox.length = 0;
    }
    this._rejectPendingRequests(error);
    this._grantedImplicitReadUris.clear();
    this._implicitReadGrants.clear();
    this._resourceService.connectionClosed(this._resourceIdentity);
    this._transitionTo({ kind: "closed" /* Closed */, error });
    this._onDidClose.fire();
  }
  async _raceClose(promise) {
    if (this._state.kind === "closed" /* Closed */) {
      return Promise.reject(this._state.error);
    }
    let closeListener = Disposable.None;
    const closePromise = new Promise((_resolve, reject) => {
      closeListener = this.onDidClose(() => reject(this._state.kind === "closed" /* Closed */ ? this._state.error : connectionClosedError(this._address)));
    });
    try {
      return await Promise.race([promise, closePromise]);
    } finally {
      closeListener.dispose();
    }
  }
  /**
   * Handles reverse RPC requests from the server (e.g. resourceList,
   * resourceRead). Thin wire adapter — dispatches each frame to
   * {@link IAgentHostResourceService} (which owns gating, virtual reads,
   * and the user-prompt flow) and translates results / errors back into
   * JSON-RPC frames.
   */
  _handleReverseRequest(id, method, params) {
    const transport = this._transport;
    const sendResult = (result) => {
      transport.send({ jsonrpc: "2.0", id, result });
    };
    const sendError = (err) => {
      if (err instanceof AgentHostResourcePermissionError) {
        transport.send({
          jsonrpc: "2.0",
          id,
          error: {
            code: AhpErrorCodes.PermissionDenied,
            message: err.message,
            data: err.request ? { request: err.request } : void 0
          }
        });
        return;
      }
      const fsCode = toFileSystemProviderErrorCode(err instanceof Error ? err : void 0);
      let code = -32e3;
      switch (fsCode) {
        case FileSystemProviderErrorCode.FileNotFound:
          code = AhpErrorCodes.NotFound;
          break;
        case FileSystemProviderErrorCode.NoPermissions:
          code = AhpErrorCodes.PermissionDenied;
          break;
        case FileSystemProviderErrorCode.FileExists:
          code = AhpErrorCodes.AlreadyExists;
          break;
      }
      transport.send({ jsonrpc: "2.0", id, error: { code, message: err instanceof Error ? err.message : String(err) } });
    };
    const p = params ?? {};
    const identity = this._resourceIdentity;
    void (async () => {
      try {
        switch (method) {
          case "resourceList": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            const result = await this._resourceService.list(identity, URI.parse(p.uri));
            sendResult({ entries: result.entries });
            return;
          }
          case "resourceRead": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            const result = await this._resourceService.read(identity, URI.parse(p.uri));
            sendResult({ data: encodeBase64(result.bytes), encoding: ContentEncoding.Base64 });
            return;
          }
          case "resourceWrite": {
            if (!p.uri || p.data === void 0) {
              throw new Error("Missing uri or data");
            }
            await this._resourceService.write(identity, p);
            sendResult({});
            return;
          }
          case "resourceDelete": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            await this._resourceService.del(identity, p);
            sendResult({});
            return;
          }
          case "resourceMove": {
            if (!p.source || !p.destination) {
              throw new Error("Missing source or destination");
            }
            await this._resourceService.move(identity, p);
            sendResult({});
            return;
          }
          case "resourceCopy": {
            if (!p.source || !p.destination) {
              throw new Error("Missing source or destination");
            }
            await this._resourceService.copy(identity, p);
            sendResult({});
            return;
          }
          case "resourceResolve": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            const result = await this._resourceService.resolve(identity, p);
            sendResult(result);
            return;
          }
          case "resourceMkdir": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            await this._resourceService.mkdir(identity, p);
            sendResult({});
            return;
          }
          case "resourceRequest": {
            try {
              await this._resourceService.request(identity, p);
              sendResult({});
            } catch (err) {
              if (err instanceof CancellationError) {
                throw new AgentHostResourcePermissionError(void 0);
              }
              throw err;
            }
            return;
          }
          default:
            this._logService.warn(`[RemoteAgentHostProtocol] Unhandled reverse request: ${method}`);
            throw new Error(`Unknown method: ${method}`);
        }
      } catch (err) {
        sendError(err);
      }
    })();
  }
  /** Send a typed JSON-RPC notification for a protocol-defined method. */
  _sendNotification(method, params) {
    this._sendNotificationMessage(method, params);
  }
  _sendExtensionNotification(method, params, sendDuringReconnect = false) {
    this._sendNotificationMessage(method, params, sendDuringReconnect);
  }
  _sendNotificationMessage(method, params, sendDuringReconnect = false) {
    if (this._state.kind === "closed" /* Closed */ || this._state.kind === "incompatible" /* Incompatible */) {
      return;
    }
    const message = { jsonrpc: "2.0", method, params };
    if (isClientTransport(this._transport) && this._state.kind === "connecting" /* Connecting */) {
      this._state.outbox.push(message);
      return;
    }
    if (this._state.kind === "reconnecting" /* Reconnecting */ && !sendDuringReconnect) {
      this._state.reconnect.outbox.push(message);
      return;
    }
    this._transport.send(message);
  }
  /** Send a typed JSON-RPC request for a protocol-defined method. */
  _sendRequest(method, params) {
    return this._dispatchRequest(method, params);
  }
  /** Send a JSON-RPC request for a VS Code extension method (not in the protocol spec). */
  _sendExtensionRequest(method, params) {
    return this._dispatchRequest(method, params);
  }
  _updateTelemetryLevel() {
    this._dispatchRootConfig({ [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(getTelemetryLevel(this._configurationService)) });
  }
  /** Merge a patch into the agent host's root configuration. */
  _dispatchRootConfig(config) {
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config
    }, this._clientId, 0);
  }
  _updateDisableRepoInfoTelemetry() {
    const disabled = this._configurationService.getValue(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID) === true;
    this._dispatchRootConfig({ [AgentHostDisableRepoInfoTelemetryConfigKey]: disabled });
  }
  _updateTerminalAutoApproveEnabled() {
    const enabled = this._configurationService.getValue(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID) !== false;
    this._dispatchRootConfig({ [AgentHostTerminalAutoApproveEnabledConfigKey]: enabled });
  }
  _updateTerminalAutoApproveRules() {
    this._dispatchRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: getAgentHostTerminalAutoApproveRulesConfig(this._configurationService) });
  }
  _updateManagedSettingsPermissions(sendDuringReconnect = false) {
    const permissions = this._resourceIdentity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? resolveManagedSettingsPermissions(this._configurationService) : {};
    this._sendExtensionNotification("setClientManagedSettingsPermissions", { permissions }, sendDuringReconnect);
  }
  /**
   * Common path for outgoing JSON-RPC requests: queue pre-initialize traffic,
   * gate on any in-flight reconnect (unless explicitly bypassed for the
   * `reconnect` RPC itself), assign an id, register the pending deferred, and
   * write to the wire.
   *
   * The reconnect-gate bypass exists because the `reconnect` request is sent
   * from inside `_attemptReconnect` while the gate is engaged, so it can't
   * wait on its own resolution.
   */
  async _dispatchRequest(method, params, options = {}) {
    if (this._state.kind === "closed" /* Closed */) {
      throw this._state.error;
    }
    if (this._state.kind === "incompatible" /* Incompatible */) {
      if (!options.allowIncompatibleUpgrade) {
        throw this._state.error;
      }
      const { request: request2, result: result2 } = this._createRequest(method, params);
      this._transport.send(request2);
      return result2;
    }
    if (!options.bypassInitializeQueue && isClientTransport(this._transport) && this._state.kind === "connecting" /* Connecting */) {
      const { request: request2, result: result2 } = this._createRequest(method, params);
      this._state.outbox.push(request2);
      return result2;
    }
    while (!options.bypassReconnectGate && this._state.kind === "reconnecting" /* Reconnecting */) {
      const current2 = this._state;
      if (current2.kind !== "reconnecting" /* Reconnecting */) {
        break;
      }
      try {
        await current2.reconnect.gate.p;
      } catch {
      }
    }
    const current = this._state;
    if (current.kind === "closed" /* Closed */ || current.kind === "incompatible" /* Incompatible */) {
      throw current.error;
    }
    const { request, result } = this._createRequest(method, params);
    this._transport.send(request);
    return result;
  }
  _createRequest(method, params) {
    const id = this._nextRequestId++;
    const deferred = new DeferredPromise();
    this._pendingRequests.set(id, { deferred, suppressNotFoundWarning: isFileResourceRead(method, params), sentAt: Date.now() });
    return {
      request: { jsonrpc: "2.0", id, method, params },
      result: deferred.p
    };
  }
  _shouldLogFailedRequest(request, error) {
    if (error.code === AhpErrorCodes.NotFound && request.suppressNotFoundWarning) {
      return false;
    }
    return true;
  }
  _toProtocolError(error) {
    return new ProtocolError(error.code, error.message, error.data);
  }
  _rejectPendingRequests(error) {
    for (const pending of this._pendingRequests.values()) {
      pending.deferred.error(error);
    }
    this._pendingRequests.clear();
  }
  /**
   * Reset the liveness timers. Called at construction for an already-open
   * passive transport, after a successful client-transport initialization,
   * once on every received message (which is itself proof the remote is
   * alive), and once after a successful soft reconnect.
   *
   * Two timers cooperate:
   *
   * 1. {@link _pingTimer} fires after {@link PING_INTERVAL_MS} of silence
   *    and sends an application-level `ping` so the close timer has
   *    something to time out on. Tolerates servers that don't implement
   *    `ping` — the error response still resets both timers.
   *
   * 2. {@link _closeTimer} fires after {@link PING_INTERVAL_MS}+
   *    {@link LIVENESS_TIMEOUT_MS} of continued silence and force-closes
   *    the transport so the renderer's reconnect logic kicks in. Catches
   *    silently-dead transports (e.g. SSH/tunnel after laptop sleep +
   *    network change) that don't emit a socket close event of their own.
   *
   * After laptop sleep + wake the JS event loop is paused, so a timer
   * armed before sleep fires immediately after wake. That's fine —
   * any inbound message processed during the wake catch-up resets it
   * before the close handler runs.
   *
   * No-op while {@link _state.kind} is {@link AgentHostClientState.Incompatible},
   * {@link AgentHostClientState.Reconnecting}, or {@link AgentHostClientState.Closed}:
   * the transport is not available for normal liveness traffic in those states.
   */
  _resetLivenessTimers() {
    this._cancelLivenessTimers();
    if (this._state.kind === "incompatible" /* Incompatible */ || this._state.kind === "reconnecting" /* Reconnecting */ || this._state.kind === "closed" /* Closed */) {
      return;
    }
    this._pingTimer.cancelAndSet(() => this._onPingTimer(), PING_INTERVAL_MS);
    this._closeTimer.cancelAndSet(() => this._onCloseTimer(), PING_INTERVAL_MS + LIVENESS_TIMEOUT_MS);
  }
  _cancelLivenessTimers() {
    this._pingTimer.cancel();
    this._closeTimer.cancel();
  }
  _onPingTimer() {
    if (this._state.kind === "incompatible" /* Incompatible */ || this._state.kind === "closed" /* Closed */ || this._state.kind === "reconnecting" /* Reconnecting */) {
      return;
    }
    void this.ping().catch(() => void 0);
  }
  _onCloseTimer() {
    if (this._state.kind === "incompatible" /* Incompatible */ || this._state.kind === "closed" /* Closed */ || this._state.kind === "reconnecting" /* Reconnecting */) {
      return;
    }
    if (this._transport.clientConnectionKind === AgentHostClientConnectionKind.Local) {
      return;
    }
    if (this._loadEstimator.hasHighLoad()) {
      this._closeTimer.cancelAndSet(() => this._onCloseTimer(), PING_INTERVAL_MS);
      return;
    }
    const silence = Date.now() - this._lastReadTime;
    this._logService.info(
      `[RemoteAgentHostProtocol] Liveness: no message from ${this._address} for ${silence}ms; forcing close to trigger reconnect.`
    );
    this._transportListeners.clear();
    if (this._transportFactory) {
      this._rejectPendingRequests(connectionTimeoutError(this._address, silence));
      this._handleTransportClose();
      return;
    }
    this._handleClose(connectionTimeoutError(this._address, silence));
  }
  /**
   * Get the next client sequence number for optimistic dispatch.
   */
  nextClientSeq() {
    return this._nextClientSeq++;
  }
};
RemoteAgentHostProtocolClient = __decorateClass([
  __decorateParam(5, ILogService),
  __decorateParam(6, IAgentHostResourceService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITelemetryService)
], RemoteAgentHostProtocolClient);
export {
  AgentHostClientState,
  RemoteAgentHostProtocolClient
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxicm93c2VyXFxyZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIFByb3RvY29sIGNsaWVudCBmb3IgY29tbXVuaWNhdGluZyB3aXRoIGEgcmVtb3RlIGFnZW50IGhvc3QgcHJvY2Vzcy5cbi8vIFdyYXBzIFdlYlNvY2tldENsaWVudFRyYW5zcG9ydCBhbmQgU2Vzc2lvbkNsaWVudFN0YXRlIHRvIHByb3ZpZGUgYVxuLy8gaGlnaGVyLWxldmVsIEFQSSBtYXRjaGluZyBJQWdlbnRTZXJ2aWNlLlxuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgdG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnLCBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcywgSUFnZW50U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUGFyYW1zLCBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsIEF1dGhlbnRpY2F0ZVBhcmFtcywgQXV0aGVudGljYXRlUmVzdWx0LCBJTWNwTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IElBZ2VudENvbm5lY3Rpb24sIElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcywgSUFnZW50SG9zdE5ldHdvcmtEaWFnbm9zdGljc0luZm8sIElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFNQklFTlRfQUdFTlRfSE9TVF9BVVRIT1JJVFkgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlbW90ZVdhdGNoSGFuZGxlLCB0eXBlIElSZW1vdGVXYXRjaEhhbmRsZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTdWJzY3JpcHRpb25NYW5hZ2VyLCB0eXBlIElBY3RpdmVTdWJzY3JpcHRpb25JbmZvLCB0eXBlIElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBhZ2VudEhvc3RBdXRob3JpdHksIGZyb21BZ2VudEhvc3RVcmksIHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCBBZ2VudEhvc3RSZXNvdXJjZVBlcm1pc3Npb25FcnJvciwgSUFnZW50SG9zdFJlc291cmNlU2VydmljZSwgTE9DQUxfQUdFTlRfSE9TVF9SRVNPVVJDRV9JREVOVElUWSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBDbGllbnROb3RpZmljYXRpb25NYXAsIENvbW1hbmRNYXAsIEpzb25ScGNFcnJvclJlc3BvbnNlLCBKc29uUnBjUmVxdWVzdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9tZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIEFjdGlvbkVudmVsb3BlLCB0eXBlIENoYXRBY3Rpb24sIHR5cGUgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24sIHR5cGUgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uLCB0eXBlIElOb3RpZmljYXRpb24sIHR5cGUgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24sIHR5cGUgVGVybWluYWxBY3Rpb24gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCBTZXNzaW9uU3VtbWFyeSwgUk9PVF9TVEFURV9VUkksIFN0YXRlQ29tcG9uZW50cywgaXNBaHBSb290Q2hhbm5lbCwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIE1lc3NhZ2UsIHR5cGUgUm9vdFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBTVVBQT1JURURfUFJPVE9DT0xfVkVSU0lPTlMgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc0pzb25ScGNOb3RpZmljYXRpb24sIGlzSnNvblJwY1JlcXVlc3QsIGlzSnNvblJwY1Jlc3BvbnNlLCBQcm90b2NvbEVycm9yLCBSZWNvbm5lY3RSZXN1bHRUeXBlLCB0eXBlIFByb3RvY29sTWVzc2FnZSwgdHlwZSBJU3RhdGVTbmFwc2hvdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgdHlwZSBJVnNjb2RlVXBncmFkZVJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbFVwZ3JhZGUuanMnO1xuaW1wb3J0IHsgaXNDbGllbnRUcmFuc3BvcnQsIE5vblJlY29ubmVjdGFibGVUcmFuc3BvcnRFcnJvciwgdHlwZSBJUHJvdG9jb2xUcmFuc3BvcnQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBBaHBFcnJvckNvZGVzIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBDaGF0U291cmNlS2luZCwgQ29udGVudEVuY29kaW5nLCBSZXNvdXJjZVJlcXVlc3RQYXJhbXMsIHR5cGUgQ29tcGxldGlvbnNQYXJhbXMsIHR5cGUgQ29tcGxldGlvbnNSZXN1bHQsIHR5cGUgQ3JlYXRlVGVybWluYWxQYXJhbXMsIHR5cGUgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIHR5cGUgU2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB0eXBlIHsgSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zLCBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtY2hhbmdlc2V0L2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGVuY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJTG9hZEVzdGltYXRvciwgTG9hZEVzdGltYXRvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlLCBURUxFTUVUUllfQ1JBU0hfUkVQT1JURVJfU0VUVElOR19JRCwgVEVMRU1FVFJZX09MRF9TRVRUSU5HX0lELCBURUxFTUVUUllfU0VUVElOR19JRCwgVGVsZW1ldHJ5TGV2ZWwsIHRlbGVtZXRyeUxldmVsRW5hYmxlZCB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGdldFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbENvbmZpZ0tleSwgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleSwgQWdlbnRIb3N0RGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5Q29uZmlnS2V5LCBnZXRBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWcsIFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9FTkFCTEVEX1NFVFRJTkdfSUQsIFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lELCBURVJNSU5BTF9JR05PUkVfREVGQVVMVF9BVVRPX0FQUFJPVkVfUlVMRVNfU0VUVElOR19JRCwgRElTQUJMRV9SRVBPX0lORk9fVEVMRU1FVFJZX1NFVFRJTkdfSUQsIHRlbGVtZXRyeUxldmVsVG9BZ2VudEhvc3RDb25maWdWYWx1ZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRIb3N0Q29uZmlndXJhdGlvblN5bmNFbnRyaWVzLCByZXNvbHZlQWdlbnRIb3N0Q29uZmlndXJhdGlvblN5bmNQYXRjaCwgcmVzb2x2ZUFnZW50SG9zdENvbmZpZ3VyYXRpb25TeW5jVmFsdWUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q29uZmlndXJhdGlvblN5bmMuanMnO1xuaW1wb3J0IHsgbWFuYWdlZFBlcm1pc3Npb25zQ29uZmlndXJhdGlvbklkcywgcmVzb2x2ZU1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zLCB0eXBlIElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvbktpbmQsIHRvQ2xpZW50VGVsZW1ldHJ5TWV0YSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHR5cGUgeyBPdGxwRXhwb3J0TG9nc1BhcmFtcyB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1vdGxwL25vdGlmaWNhdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBUZWxlbWV0cnlDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtb3RscC9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEltcGxlbWVudGF0aW9uLCBJbml0aWFsaXplUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSwgdHlwZSBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNGaWxlUmVzb3VyY2VSZWFkIH0gZnJvbSAnLi4vY29tbW9uL3Jlc291cmNlUmVhZExvZ2dpbmcuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuXG5jb25zdCBBSFBfQ0xJRU5UX0NPTk5FQ1RJT05fQ0xPU0VEID0gLTMyMDAwO1xuXG4vKiogSW5pdGlhbCBkZWxheSBiZWZvcmUgdGhlIGZpcnN0IHRyYW5zcG9ydC1sZXZlbCByZWNvbm5lY3QgYXR0ZW1wdC4gKi9cbmNvbnN0IFJFQ09OTkVDVF9JTklUSUFMX0RFTEFZX01TID0gMV8wMDA7XG5cbi8qKiBVcHBlciBib3VuZCBvbiB0aGUgZXhwb25lbnRpYWwgYmFja29mZiBiZXR3ZWVuIHJlY29ubmVjdCBhdHRlbXB0cy4gKi9cbmNvbnN0IFJFQ09OTkVDVF9NQVhfREVMQVlfTVMgPSAzMF8wMDA7XG5cbi8qKlxuICogQWZ0ZXIgdGhpcyBtdWNoIGluYm91bmQgc2lsZW5jZSwgc2VuZCBhbiBhcHBsaWNhdGlvbi1sZXZlbCBgcGluZ2AgdG9cbiAqIHRoZSByZW1vdGUgc28gd2UgaGF2ZSBzb21ldGhpbmcgdG8gdGltZSBvdXQgb24uIFJlc2V0IG9uIGV2ZXJ5IHJlY2VpdmVkXG4gKiBtZXNzYWdlIFx1MjAxNCBidXN5IGNvbm5lY3Rpb25zIGRvbid0IGdlbmVyYXRlIHBpbmcgdHJhZmZpYy5cbiAqXG4gKiBNaXJyb3JzIHtAbGluayBQcm90b2NvbENvbnN0YW50cy5LZWVwQWxpdmVTZW5kVGltZX0gZnJvbSB0aGUgcmVndWxhclxuICogcmVtb3RlIGV4dGVuc2lvbiBob3N0IHN0YWNrLlxuICovXG5jb25zdCBQSU5HX0lOVEVSVkFMX01TID0gNV8wMDA7XG5cbi8qKlxuICogVG90YWwgaW5ib3VuZCBzaWxlbmNlIChwaW5nIGludGVydmFsICsgdGhpcykgYmVmb3JlIGEgbm9uLWxvY2FsIGNvbm5lY3Rpb25cbiAqIGlzIGRlY2xhcmVkIGRlYWQgYW5kIGZvcmNlLWNsb3NlZCBzbyB0aGUgcmVuZGVyZXIncyByZWNvbm5lY3QgbG9naWMga2lja3NcbiAqIGluLiBSZXNldCBvbiBldmVyeSByZWNlaXZlZCBtZXNzYWdlOyB0aGUgb25seSB3YXkgdG8gcmVhY2ggdGhpcyBpcyBmb3IgdGhlXG4gKiBwaW5nIHRvIGl0c2VsZiBnbyB1bmFuc3dlcmVkLlxuICpcbiAqIE1hdGNoZXMge0BsaW5rIFByb3RvY29sQ29uc3RhbnRzLlRpbWVvdXRUaW1lfSBmcm9tIHRoZSByZWd1bGFyIHJlbW90ZVxuICogZXh0ZW5zaW9uIGhvc3Qgc3RhY2suXG4gKi9cbmNvbnN0IExJVkVORVNTX1RJTUVPVVRfTVMgPSAyMF8wMDA7XG5cbmZ1bmN0aW9uIGNvbm5lY3Rpb25UaW1lb3V0RXJyb3IoYWRkcmVzczogc3RyaW5nLCBzaWxlbmNlTXM6IG51bWJlcik6IFByb3RvY29sRXJyb3Ige1xuXHRyZXR1cm4gbmV3IFByb3RvY29sRXJyb3IoXG5cdFx0QUhQX0NMSUVOVF9DT05ORUNUSU9OX0NMT1NFRCxcblx0XHRgQ29ubmVjdGlvbiBhcHBlYXJzIGRlYWQ6ICR7YWRkcmVzc307IG5vIG1lc3NhZ2UgcmVjZWl2ZWQgZm9yICR7c2lsZW5jZU1zfW1zLmAsXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNvbm5lY3Rpb25DbG9zZWRFcnJvcihhZGRyZXNzOiBzdHJpbmcpOiBQcm90b2NvbEVycm9yIHtcblx0cmV0dXJuIG5ldyBQcm90b2NvbEVycm9yKEFIUF9DTElFTlRfQ09OTkVDVElPTl9DTE9TRUQsIGBDb25uZWN0aW9uIGNsb3NlZDogJHthZGRyZXNzfWApO1xufVxuXG5mdW5jdGlvbiBjb25uZWN0aW9uRGlzcG9zZWRFcnJvcihhZGRyZXNzOiBzdHJpbmcpOiBQcm90b2NvbEVycm9yIHtcblx0cmV0dXJuIG5ldyBQcm90b2NvbEVycm9yKEFIUF9DTElFTlRfQ09OTkVDVElPTl9DTE9TRUQsIGBDb25uZWN0aW9uIGRpc3Bvc2VkOiAke2FkZHJlc3N9YCk7XG59XG5cbmZ1bmN0aW9uIHRyYW5zcG9ydExvc3RFcnJvcihhZGRyZXNzOiBzdHJpbmcpOiBQcm90b2NvbEVycm9yIHtcblx0cmV0dXJuIG5ldyBQcm90b2NvbEVycm9yKEFIUF9DTElFTlRfQ09OTkVDVElPTl9DTE9TRUQsIGBUcmFuc3BvcnQgbG9zdCAocmVjb25uZWN0aW5nKTogJHthZGRyZXNzfWApO1xufVxuXG5pbnRlcmZhY2UgSVJlbW90ZUFnZW50SG9zdEV4dGVuc2lvbkNvbW1hbmRNYXAge1xuXHQnc2h1dGRvd24nOiB7IHBhcmFtczogdW5kZWZpbmVkOyByZXN1bHQ6IHZvaWQgfTtcblx0J2dldE5ldHdvcmtEaWFnbm9zdGljc0luZm8nOiB7IHBhcmFtczogdW5kZWZpbmVkOyByZXN1bHQ6IElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvIH07XG5cdCdnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyc6IHsgcGFyYW1zOiB1bmRlZmluZWQ7IHJlc3VsdDogcmVhZG9ubHkgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzW10gfTtcblx0J2RpYWdub3N0aWNzRmV0Y2gnOiB7IHBhcmFtczogeyB1cmw6IHN0cmluZyB9OyByZXN1bHQ6IElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQgfTtcbn1cblxuaW50ZXJmYWNlIElSZW1vdGVBZ2VudEhvc3RFeHRlbnNpb25Ob3RpZmljYXRpb25NYXAge1xuXHQnc2V0Q2xpZW50TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMnOiB7IHBhcmFtczogeyBwZXJtaXNzaW9uczogSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zIH0gfTtcbn1cblxuaW50ZXJmYWNlIElQZW5kaW5nUmVxdWVzdCB7XG5cdHJlYWRvbmx5IGRlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8dW5rbm93bj47XG5cdHJlYWRvbmx5IHN1cHByZXNzTm90Rm91bmRXYXJuaW5nOiBib29sZWFuO1xuXHRyZWFkb25seSBzZW50QXQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBIaWdoLWxldmVsIGNvbm5lY3Rpb24gc3RhdGUgb2YgYSB7QGxpbmsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnR9LlxuICogRXhwb3NlZCB2aWEge0BsaW5rIFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50Lm9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlfVxuICogc28gY29uc3VtZXJzIGNhbiBzdXJmYWNlIHRyYW5zaWVudCByZWNvbm5lY3QgYWN0aXZpdHkgaW4gdGhlIFVJLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBBZ2VudEhvc3RDbGllbnRTdGF0ZSB7XG5cdC8qKiBJbml0aWFsIGhhbmRzaGFrZSBpbiBwcm9ncmVzcy4gKi9cblx0Q29ubmVjdGluZyA9ICdjb25uZWN0aW5nJyxcblx0LyoqIFRoZSBob3N0IHJlamVjdGVkIHRoZSBpbml0aWFsIHByb3RvY29sIHZlcnNpb247IHVwZ3JhZGUgcmVtYWlucyBhdmFpbGFibGUuICovXG5cdEluY29tcGF0aWJsZSA9ICdpbmNvbXBhdGlibGUnLFxuXHQvKiogVHJhbnNwb3J0IGlzIG9wZW4gYW5kIGhhbmRzaGFrZS9yZWNvbm5lY3QgaGFzIGNvbXBsZXRlZC4gKi9cblx0Q29ubmVjdGVkID0gJ2Nvbm5lY3RlZCcsXG5cdC8qKiBUcmFuc3BvcnQgY2xvc2VkIHVuZXhwZWN0ZWRseTsgYW4gYXV0b21hdGljIHJlY29ubmVjdCBpcyBpbiBmbGlnaHQgb3Igc2NoZWR1bGVkLiAqL1xuXHRSZWNvbm5lY3RpbmcgPSAncmVjb25uZWN0aW5nJyxcblx0LyoqIENsaWVudCBoYXMgYmVlbiBkaXNwb3NlZCBvciBoYXMgZ2l2ZW4gdXAgcmVjb25uZWN0aW5nLiBUZXJtaW5hbCBzdGF0ZS4gKi9cblx0Q2xvc2VkID0gJ2Nsb3NlZCcsXG59XG5cbi8qKlxuICogUmVjb25uZWN0LW9ubHkgYm9va2tlZXBpbmcuIExpdmVzIGV4Y2x1c2l2ZWx5IGluc2lkZSB0aGUgYFJlY29ubmVjdGluZ2BcbiAqIHZhcmlhbnQgb2Yge0BsaW5rIENsaWVudFN0YXRlfSBzbyB0aGUgZmllbGRzIGNhbid0IGJlIHJlYWQgb3IgbXV0YXRlZCB3aGVuXG4gKiB0aGV5J3JlIG5vdCBtZWFuaW5nZnVsLlxuICovXG5pbnRlcmZhY2UgSVJlY29ubmVjdFN0YXRlIHtcblx0LyoqXG5cdCAqIFJlc29sdmVzIHdoZW4gdGhlIGN1cnJlbnQgYXR0ZW1wdCdzIGhhbmRzaGFrZSBzdWNjZWVkczsgcmVqZWN0ZWQgYW5kXG5cdCAqIHJlcGxhY2VkICh2aWEge0BsaW5rIF9uZXdSZWNvbm5lY3RHYXRlfSkgb24gYSBmYWlsZWQgYXR0ZW1wdCBzbyBhd2FpdGluZ1xuXHQgKiBjYWxsZXJzIHNlZSB0aGUgZmFpbHVyZSB3aGlsZSBuZXcgY2FsbGVycyBnYXRlIG9uIHRoZSBuZXh0IGF0dGVtcHQuXG5cdCAqL1xuXHRnYXRlOiBEZWZlcnJlZFByb21pc2U8dm9pZD47XG5cdC8qKlxuXHQgKiBXaXJlIG1lc3NhZ2VzIGJ1ZmZlcmVkIHdoaWxlIHRoZSBnYXRlIGlzIGVuZ2FnZWQuIERyYWluZWQgb250byB0aGUgbmV3XG5cdCAqIHRyYW5zcG9ydCBieSB7QGxpbmsgX2RyYWluQWZ0ZXJSZWNvbm5lY3R9IG9uY2UgdGhlIGhhbmRzaGFrZSBjb21wbGV0ZXM7XG5cdCAqIHN1cnZpdmVzIGFjcm9zcyBmYWlsZWQgYXR0ZW1wdHMgc28gbWVzc2FnZXMgcmlkZSB0aHJvdWdoIHJldHJ5IGN5Y2xlcy5cblx0ICovXG5cdHJlYWRvbmx5IG91dGJveDogUHJvdG9jb2xNZXNzYWdlW107XG5cdC8qKiBOdW1iZXIgb2YgcmVjb25uZWN0IGF0dGVtcHRzIHBlcmZvcm1lZCBpbiB0aGlzIHJlY29ubmVjdCBjeWNsZS4gKi9cblx0YXR0ZW1wdDogbnVtYmVyO1xuXHQvKiogVGltZXIgZm9yIHRoZSBuZXh0IHNjaGVkdWxlZCBhdHRlbXB0LCBpZiBhbnkuICovXG5cdHRpbWVvdXRIYW5kbGU6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEludGVybmFsIGNvbm5lY3Rpb24gc3RhdGUsIGRpc2NyaW1pbmF0ZWQgYnkge0BsaW5rIEFnZW50SG9zdENsaWVudFN0YXRlfS5cbiAqIE11dHVhbGx5LWV4Y2x1c2l2ZSBmaWVsZHMgKGNsb3NlIGVycm9yLCByZWNvbm5lY3QgYm9va2tlZXBpbmcpIGxpdmUgaW5zaWRlXG4gKiB0aGUgdmFyaWFudCB3aGVyZSB0aGV5J3JlIG1lYW5pbmdmdWwgc28gY2FsbGVycyBjYW4ndCBhY2NpZGVudGFsbHkgcmVhZCBvclxuICogd3JpdGUgdGhlbSBpbiB0aGUgd3Jvbmcgc3RhdGUuXG4gKi9cbnR5cGUgQ2xpZW50U3RhdGUgPVxuXHR8IHsgcmVhZG9ubHkga2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZzsgcmVhZG9ubHkgb3V0Ym94OiBQcm90b2NvbE1lc3NhZ2VbXSB9XG5cdHwgeyByZWFkb25seSBraW5kOiBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGU7IHJlYWRvbmx5IGVycm9yOiBQcm90b2NvbEVycm9yIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZCB9XG5cdHwgeyByZWFkb25seSBraW5kOiBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3Rpbmc7IHJlYWRvbmx5IHJlY29ubmVjdDogSVJlY29ubmVjdFN0YXRlIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZDsgcmVhZG9ubHkgZXJyb3I6IFByb3RvY29sRXJyb3IgfTtcblxuLyoqXG4gKiBBIHByb3RvY29sLWxldmVsIGNsaWVudCBmb3IgYSBzaW5nbGUgcmVtb3RlIGFnZW50IGhvc3QgY29ubmVjdGlvbi5cbiAqIE1hbmFnZXMgdGhlIFdlYlNvY2tldCB0cmFuc3BvcnQsIGhhbmRzaGFrZSwgc3Vic2NyaXB0aW9ucywgYWN0aW9uIGRpc3BhdGNoLFxuICogYW5kIGNvbW1hbmQvcmVzcG9uc2UgY29ycmVsYXRpb24uXG4gKlxuICogSW1wbGVtZW50cyB7QGxpbmsgSUFnZW50Q29ubmVjdGlvbn0gc28gY29uc3VtZXJzIGNhbiBwcm9ncmFtIGFnYWluc3RcbiAqIGEgc2luZ2xlIGludGVyZmFjZSByZWdhcmRsZXNzIG9mIHdoZXRoZXIgdGhlIGFnZW50IGhvc3QgaXMgbG9jYWwgb3IgcmVtb3RlLlxuICovXG5leHBvcnQgY2xhc3MgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50Q29ubmVjdGlvbiB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50SWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfYWRkcmVzczogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZUlkZW50aXR5OiBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc3BvcnRGYWN0b3J5OiAoKCkgPT4gSVByb3RvY29sVHJhbnNwb3J0KSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdHJhbnNwb3J0ITogSVByb3RvY29sVHJhbnNwb3J0O1xuXHQvKiogRGlzcG9zYWJsZSBob2xkaW5nIHRoZSBsaXN0ZW5lcnMgYXR0YWNoZWQgdG8gdGhlIGN1cnJlbnQgdHJhbnNwb3J0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc3BvcnRMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nO1xuXHRwcml2YXRlIF9zZXJ2ZXJTZXEgPSAwO1xuXHRwcml2YXRlIF9uZXh0Q2xpZW50U2VxID0gMTtcblx0cHJpdmF0ZSBfZGVmYXVsdERpcmVjdG9yeTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogTGF0ZXN0IGBpbml0aWFsaXplYCByZXNwb25zZSBmcm9tIHRoZSBob3N0LiBDYXB0dXJlZCBhdCB0aGUgZW5kIG9mXG5cdCAqIHtAbGluayBjb25uZWN0fSBhbmQgcmUtY2FwdHVyZWQgYWZ0ZXIgYSBzb2Z0LXJlY29ubmVjdCB0aGF0IHB1bGxlZFxuXHQgKiBhIGZyZXNoIHNuYXBzaG90LiBgdW5kZWZpbmVkYCBiZWZvcmUgdGhlIGhhbmRzaGFrZSBjb21wbGV0ZXMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsaXplUmVzdWx0ID0gb2JzZXJ2YWJsZVZhbHVlPEluaXRpYWxpemVSZXN1bHQgfCB1bmRlZmluZWQ+KCdhZ2VudEhvc3RJbml0aWFsaXplUmVzdWx0JywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3Vic2NyaXB0aW9uTWFuYWdlcjogQWdlbnRTdWJzY3JpcHRpb25NYW5hZ2VyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QWN0aW9uRW52ZWxvcGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFjdGlvbiA9IHRoaXMuX29uRGlkQWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWNwTm90aWZpY2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9vbk1jcE5vdGlmaWNhdGlvbi5ldmVudDtcblxuXHQvKipcblx0ICogRmlyZXMgZm9yIGV2ZXJ5IGBvdGxwL2V4cG9ydExvZ3NgIG5vdGlmaWNhdGlvbiB0aGUgaG9zdCBzZW5kcyBvbiBhXG5cdCAqIGNoYW5uZWwgdGhpcyBjbGllbnQgaGFzIHN1YnNjcmliZWQgdG8uIEVhY2ggcGF5bG9hZCBpcyBhblxuXHQgKiBPVExQL0pTT04gYEV4cG9ydExvZ3NTZXJ2aWNlUmVxdWVzdGAgdmFsdWUgdmVyYmF0aW07IGNvbnN1bWVyc1xuXHQgKiBkZWNvZGUgaXQgKHNlZSBgaXRlcmF0ZU90bHBMb2dSZWNvcmRzYCkgYW5kIHJvdXRlIHRoZSByZWNvcmRzIHRvIGFcblx0ICogcmVnaXN0ZXJlZCBsb2dnZXIgb3Igc2luay5cblx0ICpcblx0ICogQ2hhbm5lbCBVUklzIGFyZSBrZXB0IG9wYXF1ZSBvbiB0aGUgd2lyZSBzbyB0aGUgc2FtZSBldmVudCBjb3ZlcnNcblx0ICogZXZlcnkge0BsaW5rIFRlbGVtZXRyeUNhcGFiaWxpdGllcy5sb2dzfSBVUkkgdGhlIGhvc3QgYWR2ZXJ0aXNlcyBcdTIwMTRcblx0ICogc3Vic2NyaWJlcnMgc2hvdWxkIGZpbHRlciBieSBgY2hhbm5lbGAgaWYgdGhleSBjYXJlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlT3RscExvZ3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxPdGxwRXhwb3J0TG9nc1BhcmFtcz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZU90bHBMb2dzID0gdGhpcy5fb25EaWRSZWNlaXZlT3RscExvZ3MuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFnZW50SG9zdENsaWVudFN0YXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZS5ldmVudDtcblxuXHQvKipcblx0ICogRGlzY3JpbWluYXRlZCBzdGF0ZSB1bmlvbi4gUmVhZCB2aWEgbmFycm93aW5nIChgX3N0YXRlLmtpbmQgPT09IC4uLmApO1xuXHQgKiByZWNvbm5lY3Qtb25seSBmaWVsZHMgbGlrZSB0aGUgZ2F0ZS9vdXRib3gvYXR0ZW1wdCBjb3VudGVyIGFyZSBvbmx5XG5cdCAqIGFjY2Vzc2libGUgd2hpbGUge0BsaW5rIF9zdGF0ZS5raW5kfSBpcyB7QGxpbmsgQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nfSxcblx0ICogYW5kIHByb3RvY29sIGVycm9ycyBhcmUgb25seSBhY2Nlc3NpYmxlIHdoaWxlIHRoZSBzdGF0ZSBpc1xuXHQgKiB7QGxpbmsgQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlfSBvciB7QGxpbmsgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkfS5cblx0ICovXG5cdHByaXZhdGUgX3N0YXRlOiBDbGllbnRTdGF0ZSA9IHsga2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZywgb3V0Ym94OiBbXSB9O1xuXG5cdC8qKiBQZW5kaW5nIEpTT04tUlBDIHJlcXVlc3RzIGtleWVkIGJ5IHJlcXVlc3QgaWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdSZXF1ZXN0cyA9IG5ldyBNYXA8bnVtYmVyLCBJUGVuZGluZ1JlcXVlc3Q+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uID0gbmV3IE1hcDxzdHJpbmcsIEF1dGhlbnRpY2F0ZVBhcmFtcz4oKTtcblx0cHJpdmF0ZSBfbmV4dFJlcXVlc3RJZCA9IDE7XG5cblx0LyoqXG5cdCAqIFRpbWVzdGFtcCBvZiB0aGUgbW9zdCByZWNlbnQgbWVzc2FnZSBvZiBhbnkga2luZCByZWNlaXZlZCBmcm9tIHRoZVxuXHQgKiBzZXJ2ZXIuIFVzZWQgb25seSBmb3IgZGlhZ25vc3RpYyBsb2dnaW5nIHdoZW4gdGhlIGNsb3NlIHRpbWVyIGZpcmVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfbGFzdFJlYWRUaW1lID0gRGF0ZS5ub3coKTtcblxuXHQvKipcblx0ICogTGl2ZW5lc3Mgd2F0Y2hkb2cgXHUyMDE0IHNlZSB7QGxpbmsgX3Jlc2V0TGl2ZW5lc3NUaW1lcnN9LlxuXHQgKlxuXHQgKiB7QGxpbmsgX3BpbmdUaW1lcn0gZmlyZXMgYWZ0ZXIge0BsaW5rIFBJTkdfSU5URVJWQUxfTVN9IG9mIGluYm91bmRcblx0ICogc2lsZW5jZSBhbmQgc2VuZHMgYW4gYXBwbGljYXRpb24tbGV2ZWwgYHBpbmdgIHNvIHdlIGhhdmUgc29tZXRoaW5nXG5cdCAqIHRvIHRpbWUgb3V0IG9uLiB7QGxpbmsgX2Nsb3NlVGltZXJ9IGZpcmVzIGFmdGVyIGFub3RoZXJcblx0ICoge0BsaW5rIExJVkVORVNTX1RJTUVPVVRfTVN9IG9mIGNvbnRpbnVlZCBzaWxlbmNlIGFuZCBmb3JjZS1jbG9zZXNcblx0ICogdGhlIHRyYW5zcG9ydCBzbyB0aGUgcmVuZGVyZXIncyByZWNvbm5lY3QgbG9naWMga2lja3MgaW4uIEJvdGggYXJlXG5cdCAqIHJlc2V0IG9uIGV2ZXJ5IHJlY2VpdmVkIG1lc3NhZ2UsIHNvIGJ1c3kgY29ubmVjdGlvbnMgZ2VuZXJhdGUgbm9cblx0ICogcGluZyB0cmFmZmljIGF0IGFsbC5cblx0ICpcblx0ICogRGV0ZWN0cyBzaWxlbnRseS1kZWFkIHRyYW5zcG9ydHMgKGUuZy4gU1NIL3R1bm5lbCBhZnRlciBsYXB0b3Bcblx0ICogc2xlZXAgKyBuZXR3b3JrIGNoYW5nZSkgdGhhdCBkb24ndCBwcm9kdWNlIGEgc29ja2V0IGNsb3NlIGV2ZW50IG9mXG5cdCAqIHRoZWlyIG93bi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BpbmdUaW1lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaW1lb3V0VGltZXIoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb3NlVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGltZW91dFRpbWVyKCkpO1xuXG5cdC8qKlxuXHQgKiBVc2VkIHRvIHN1cHByZXNzIHdhdGNoZG9nLXRyaWdnZXJlZCBjbG9zZXMgd2hlbiBvdXIgb3duIEpTIGV2ZW50IGxvb3Bcblx0ICogaGFzIGJlZW4gcGVnZ2VkIFx1MjAxNCBpbiB0aGF0IGNhc2UgdGhlIHNpbGVuY2UgaXMgb24gb3VyIHNpZGUsIG5vdCB0aGVcblx0ICogcmVtb3RlJ3MsIGFuZCB0ZWFyaW5nIGRvd24gdGhlIHRyYW5zcG9ydCB3b3VsZCBqdXN0IGdlbmVyYXRlIGEgdXNlbGVzc1xuXHQgKiByZWNvbm5lY3QgY3ljbGUgdGhhdCBhYm9ydHMgaW4tZmxpZ2h0IHJlcXVlc3RzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbG9hZEVzdGltYXRvcjogSUxvYWRFc3RpbWF0b3I7XG5cblx0LyoqXG5cdCAqIFVSSXMgd2UgaGF2ZSBhbHJlYWR5IGdyYW50ZWQgaW1wbGljaXQgcmVhZCBhY2Nlc3MgZm9yIG9uIHRoaXMgY29ubmVjdGlvbi5cblx0ICogVXNlcyBVUkktYXdhcmUgY29tcGFyaXNvbiB0byBkZWR1cGUgcmVwZWF0IHNlbmRzIGFuZCBpcyBjbGVhcmVkIHdpdGggdGhlIGNvbm5lY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ncmFudGVkSW1wbGljaXRSZWFkVXJpcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbXBsaWNpdFJlYWRHcmFudHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGdldCBjbGllbnRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jbGllbnRJZDtcblx0fVxuXG5cdGdldCBhZGRyZXNzKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2FkZHJlc3M7XG5cdH1cblxuXHRnZXQgZGVmYXVsdERpcmVjdG9yeSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0RGlyZWN0b3J5O1xuXHR9XG5cblx0Z2V0IGNvbm5lY3Rpb25TdGF0ZSgpOiBBZ2VudEhvc3RDbGllbnRTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlLmtpbmQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGxhdGVzdCBgaW5pdGlhbGl6ZWAgcmVzcG9uc2UgZnJvbSB0aGUgaG9zdCwgb3IgYHVuZGVmaW5lZGAgaWZcblx0ICogdGhlIGhhbmRzaGFrZSBoYXMgbm90IGNvbXBsZXRlZCB5ZXQuIEV4cG9zZWQgb2JzZXJ2YWJseSBzbyBjYWxsZXJzIGNhblxuXHQgKiByZWFjdCBhcyBhZHZlcnRpc2VkIGNhcGFiaWxpdGllcyAodGVsZW1ldHJ5LCBgY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzYCxcblx0ICogYHRlcm1pbmFsQ29tbWFuZFByZWZpeGAsIC4uLikgYXJyaXZlLlxuXHQgKi9cblx0Z2V0IGluaXRpYWxpemVSZXN1bHQoKTogSU9ic2VydmFibGU8SW5pdGlhbGl6ZVJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsaXplUmVzdWx0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksXG5cdFx0dHJhbnNwb3J0T3JGYWN0b3J5OiBJUHJvdG9jb2xUcmFuc3BvcnQgfCAoKCkgPT4gSVByb3RvY29sVHJhbnNwb3J0KSxcblx0XHRsb2FkRXN0aW1hdG9yOiBJTG9hZEVzdGltYXRvciB8IHVuZGVmaW5lZCxcblx0XHRjbGllbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudEluZm86IEltcGxlbWVudGF0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUFnZW50SG9zdFJlc291cmNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZVNlcnZpY2U6IElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZXNvdXJjZUlkZW50aXR5ID0gaWRlbnRpdHk7XG5cdFx0dGhpcy5fYWRkcmVzcyA9IGlkZW50aXR5ID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZID8gQU1CSUVOVF9BR0VOVF9IT1NUX0FVVEhPUklUWSA6IGlkZW50aXR5O1xuXHRcdHRoaXMuX2NsaWVudElkID0gY2xpZW50SWQgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSA9IGlkZW50aXR5ID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZID8gQU1CSUVOVF9BR0VOVF9IT1NUX0FVVEhPUklUWSA6IGFnZW50SG9zdEF1dGhvcml0eShpZGVudGl0eSk7XG5cdFx0dGhpcy5fbG9hZEVzdGltYXRvciA9IGxvYWRFc3RpbWF0b3IgPz8gTG9hZEVzdGltYXRvci5nZXRJbnN0YW5jZSgpO1xuXG5cdFx0aWYgKHR5cGVvZiB0cmFuc3BvcnRPckZhY3RvcnkgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRoaXMuX3RyYW5zcG9ydEZhY3RvcnkgPSB0cmFuc3BvcnRPckZhY3Rvcnk7XG5cdFx0XHR0aGlzLl9pbnN0YWxsVHJhbnNwb3J0KHRyYW5zcG9ydE9yRmFjdG9yeSgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdHJhbnNwb3J0RmFjdG9yeSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2luc3RhbGxUcmFuc3BvcnQodHJhbnNwb3J0T3JGYWN0b3J5KTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdWJzY3JpcHRpb25NYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50U3Vic2NyaXB0aW9uTWFuYWdlcihcblx0XHRcdHRoaXMuX2NsaWVudElkLFxuXHRcdFx0KCkgPT4gdGhpcy5uZXh0Q2xpZW50U2VxKCksXG5cdFx0XHRtc2cgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnRdICR7bXNnfWApLFxuXHRcdFx0cmVzb3VyY2UgPT4gdGhpcy5zdWJzY3JpYmUocmVzb3VyY2UpLFxuXHRcdFx0cmVzb3VyY2UgPT4gdGhpcy51bnN1YnNjcmliZShyZXNvdXJjZSksXG5cdFx0KSk7XG5cblx0XHQvLyBGb3J3YXJkIGFjdGlvbiBlbnZlbG9wZXMgZnJvbSB0aGUgdHJhbnNwb3J0IHRvIHRoZSBzdWJzY3JpcHRpb24gbWFuYWdlclxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRBY3Rpb24oZW52ZWxvcGUgPT4ge1xuXHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5yZWNlaXZlRW52ZWxvcGUoZW52ZWxvcGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGF0Y2g6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGdldEFnZW50SG9zdENvbmZpZ3VyYXRpb25TeW5jRW50cmllcyh0aGlzLl9yZXNvdXJjZUlkZW50aXR5ID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZKSkge1xuXHRcdFx0XHRpZiAoIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZW50cnkuc2V0dGluZ0lkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcmVzb2x2ZUFnZW50SG9zdENvbmZpZ3VyYXRpb25TeW5jVmFsdWUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIGVudHJ5KTtcblx0XHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRwYXRjaFtlbnRyeS5zeW5jLmtleV0gPSB2YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKE9iamVjdC5rZXlzKHBhdGNoKS5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fZGlzcGF0Y2hSb290Q29uZmlnKHBhdGNoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRFTEVNRVRSWV9TRVRUSU5HX0lEKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRFTEVNRVRSWV9PTERfU0VUVElOR19JRCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihURUxFTUVUUllfQ1JBU0hfUkVQT1JURVJfU0VUVElOR19JRCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGVsZW1ldHJ5TGV2ZWwoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9FTkFCTEVEX1NFVFRJTkdfSUQpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihURVJNSU5BTF9BVVRPX0FQUFJPVkVfU0VUVElOR19JRCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihURVJNSU5BTF9JR05PUkVfREVGQVVMVF9BVVRPX0FQUFJPVkVfUlVMRVNfU0VUVElOR19JRCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihESVNBQkxFX1JFUE9fSU5GT19URUxFTUVUUllfU0VUVElOR19JRCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobWFuYWdlZFBlcm1pc3Npb25zQ29uZmlndXJhdGlvbklkcy5zb21lKHNldHRpbmdJZCA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKHNldHRpbmdJZCkpKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fdXBkYXRlTWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIWlzQ2xpZW50VHJhbnNwb3J0KHRoaXMuX3RyYW5zcG9ydCkpIHtcblx0XHRcdC8vIFBhc3NpdmUgdHJhbnNwb3J0cyBhcmUgYWxyZWFkeSBjb25uZWN0ZWQgd2hlbiBjb25zdHJ1Y3RlZC5cblx0XHRcdHRoaXMuX3Jlc2V0TGl2ZW5lc3NUaW1lcnMoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSW5zdGFsbCBhIHRyYW5zcG9ydCBhbmQgd2lyZSBsaXN0ZW5lcnMuIFVzZWQgYm90aCBmb3IgdGhlIGluaXRpYWxcblx0ICogdHJhbnNwb3J0IGFuZCBmb3IgcmVwbGFjZW1lbnRzIGNyZWF0ZWQgYnkgdGhlIGZhY3RvcnkgZHVyaW5nIGFcblx0ICogdHJhbnNwb3J0LWxldmVsIHJlY29ubmVjdC5cblx0ICovXG5cdHByaXZhdGUgX2luc3RhbGxUcmFuc3BvcnQodHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQpOiB2b2lkIHtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGlzdGVuZXJzLmFkZCh0cmFuc3BvcnQpO1xuXHRcdGxpc3RlbmVycy5hZGQodHJhbnNwb3J0Lm9uTWVzc2FnZShtc2cgPT4gdGhpcy5faGFuZGxlTWVzc2FnZShtc2cpKSk7XG5cdFx0bGlzdGVuZXJzLmFkZCh0cmFuc3BvcnQub25DbG9zZSgoKSA9PiB0aGlzLl9oYW5kbGVUcmFuc3BvcnRDbG9zZSgpKSk7XG5cdFx0dGhpcy5fdHJhbnNwb3J0ID0gdHJhbnNwb3J0O1xuXHRcdHRoaXMuX3RyYW5zcG9ydExpc3RlbmVycy52YWx1ZSA9IGxpc3RlbmVycztcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2l0aW9uIHRvIGEgbmV3IHtAbGluayBDbGllbnRTdGF0ZX0uIEZpcmVzIHtAbGluayBvbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZX1cblx0ICogb25seSB3aGVuIHRoZSB2YXJpYW50IGtpbmQgYWN0dWFsbHkgY2hhbmdlczsgaW4tcGxhY2UgbXV0YXRpb24gb2Zcblx0ICogcmVjb25uZWN0LXN0YXRlIGZpZWxkcyAoZS5nLiBzd2FwcGluZyB0aGUgZ2F0ZSBvbiBhIGZhaWxlZCByZXRyeSkgZG9lc1xuXHQgKiBOT1QgY291bnQgYXMgYSB0cmFuc2l0aW9uIGFuZCBwcm9kdWNlcyBubyBldmVudC5cblx0ICovXG5cdHByaXZhdGUgX3RyYW5zaXRpb25UbyhuZXh0OiBDbGllbnRTdGF0ZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBuZXh0LmtpbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGUgPSBuZXh0O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlLmZpcmUobmV4dC5raW5kKTtcblx0fVxuXG5cdHByaXZhdGUgX25ld1JlY29ubmVjdEdhdGUoKTogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHQvLyBBbHdheXMtYXR0YWNoZWQgaGFuZGxlciBzbyBhIHJlamVjdGlvbiB3aXRob3V0IGFuIGF3YWl0ZXIgKGUuZy4gYVxuXHRcdC8vIHJldHJ5LWZhaWwgZHVyaW5nIHRoZSByZWNvbm5lY3QgUlBDIGJ5cGFzcyB3aW5kb3cpIGRvZXNuJ3QgZ2V0XG5cdFx0Ly8gZmxhZ2dlZCBhcyB1bmhhbmRsZWQuIEFjdHVhbCBjb25zdW1lcnMgYXR0YWNoIHRoZWlyIG93biBgLnRoZW5gL2Bhd2FpdGAuXG5cdFx0ZGVmZXJyZWQucC50aGVuKHVuZGVmaW5lZCwgKCkgPT4geyAvKiBzd2FsbG93IFx1MjAxNCBlYWNoIHJlYWwgY29uc3VtZXIgaGFuZGxlcyBpdHMgb3duIGF3YWl0ICovIH0pO1xuXHRcdHJldHVybiBkZWZlcnJlZDtcblx0fVxuXG5cdHByaXZhdGUgX25ld1JlY29ubmVjdFN0YXRlKCk6IElSZWNvbm5lY3RTdGF0ZSB7XG5cdFx0cmV0dXJuIHsgZ2F0ZTogdGhpcy5fbmV3UmVjb25uZWN0R2F0ZSgpLCBvdXRib3g6IFtdLCBhdHRlbXB0OiAwLCB0aW1lb3V0SGFuZGxlOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faGFuZGxlQ2xvc2UoY29ubmVjdGlvbkRpc3Bvc2VkRXJyb3IodGhpcy5fYWRkcmVzcykpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb25uZWN0IHRvIHRoZSByZW1vdGUgYWdlbnQgaG9zdCBhbmQgcGVyZm9ybSB0aGUgcHJvdG9jb2wgaGFuZHNoYWtlLlxuXHQgKi9cblx0YXN5bmMgY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKGlzQ2xpZW50VHJhbnNwb3J0KHRoaXMuX3RyYW5zcG9ydCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmFjZUNsb3NlKHRoaXMuX3RyYW5zcG9ydC5jb25uZWN0KCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RpbmcpIHtcblx0XHRcdFx0dGhyb3cgdHJhbnNwb3J0TG9zdEVycm9yKHRoaXMuX2FkZHJlc3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kaXNwYXRjaFJlcXVlc3Q8Q29tbWFuZE1hcFsnaW5pdGlhbGl6ZSddWydyZXN1bHQnXT4oJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHQvLyBBZHZlcnRpc2UgZXZlcnkgdmVyc2lvbiB0aGlzIGNsaWVudCBjYW4gbmVnb3RpYXRlLCBtb3N0LXByZWZlcnJlZCBmaXJzdCwgc28gYW5cblx0XHRcdFx0Ly8gb2xkZXIgaG9zdCAoYSBjbG91ZCBzYW5kYm94IHJ1bm5pbmcgYSAwLjUueCBgY29waWxvdGRgKSBjYW4gbmVnb3RpYXRlIGRvd25cblx0XHRcdFx0Ly8gaW5zdGVhZCBvZiByZWplY3RpbmcgdGhlIGNvbm5lY3Rpb24uIEEgY3VycmVudCBob3N0IHN0aWxsIHBpY2tzIHRoZSBuZXdlc3QuXG5cdFx0XHRcdHByb3RvY29sVmVyc2lvbnM6IFsuLi5TVVBQT1JURURfUFJPVE9DT0xfVkVSU0lPTlNdLFxuXHRcdFx0XHRjbGllbnRJZDogdGhpcy5fY2xpZW50SWQsXG5cdFx0XHRcdGNsaWVudEluZm86IHRoaXMuX2NsaWVudEluZm8sXG5cdFx0XHRcdC4uLnRoaXMuX2NsaWVudENvbm5lY3Rpb25UZWxlbWV0cnlNZXRhKCksXG5cdFx0XHRcdGluaXRpYWxTdWJzY3JpcHRpb25zOiBbUk9PVF9TVEFURV9VUkldLFxuXHRcdFx0fSwgeyBieXBhc3NJbml0aWFsaXplUXVldWU6IHRydWUgfSk7XG5cdFx0XHR0aGlzLl9hcHBseUluaXRpYWxpemVSZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0Ly8gSHlkcmF0ZSByb290IHN0YXRlIGZyb20gdGhlIGluaXRpYWwgc25hcHNob3Rcblx0XHRcdGZvciAoY29uc3Qgc25hcHNob3Qgb2YgcmVzdWx0LnNuYXBzaG90cyA/PyBbXSkge1xuXHRcdFx0XHRpZiAoaXNBaHBSb290Q2hhbm5lbChzbmFwc2hvdC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25NYW5hZ2VyLmhhbmRsZVJvb3RTbmFwc2hvdChzbmFwc2hvdC5zdGF0ZSBhcyBSb290U3RhdGUsIHNuYXBzaG90LmZyb21TZXEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc0NsaWVudFRyYW5zcG9ydCh0aGlzLl90cmFuc3BvcnQpICYmIHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RpbmcpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIHRoaXMuX3N0YXRlLm91dGJveCkge1xuXHRcdFx0XHRcdHRoaXMuX3RyYW5zcG9ydC5zZW5kKG1lc3NhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0YXRlLm91dGJveC5sZW5ndGggPSAwO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdHJhbnNpdGlvblRvKHsga2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkIH0pO1xuXHRcdFx0dGhpcy5fcmVzZXRMaXZlbmVzc1RpbWVycygpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBwcm90b2NvbEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yXG5cdFx0XHRcdD8gZXJyb3Jcblx0XHRcdFx0OiBuZXcgUHJvdG9jb2xFcnJvcihBSFBfQ0xJRU5UX0NPTk5FQ1RJT05fQ0xPU0VELCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikpO1xuXHRcdFx0aWYgKHByb3RvY29sRXJyb3IuY29kZSA9PT0gQWhwRXJyb3JDb2Rlcy5VbnN1cHBvcnRlZFByb3RvY29sVmVyc2lvbikge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxMaXZlbmVzc1RpbWVycygpO1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZykge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlLm91dGJveC5sZW5ndGggPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JlamVjdFBlbmRpbmdSZXF1ZXN0cyhwcm90b2NvbEVycm9yKTtcblx0XHRcdFx0dGhpcy5fdHJhbnNpdGlvblRvKHsga2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlLCBlcnJvcjogcHJvdG9jb2xFcnJvciB9KTtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBOb25SZWNvbm5lY3RhYmxlVHJhbnNwb3J0RXJyb3IpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlQ2xvc2UocHJvdG9jb2xFcnJvcik7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdGlmIChwcm90b2NvbEVycm9yLmNvZGUgPT09IEFIUF9DTElFTlRfQ09OTkVDVElPTl9DTE9TRUQgJiYgdGhpcy5fYmVnaW5SZWNvbm5lY3RGcm9tQ29ubmVjdGluZyhwcm90b2NvbEVycm9yKSkge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hhbmRsZUNsb3NlKHByb3RvY29sRXJyb3IpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEV4dGVybmFsbHkgc2lnbmFsIHRoYXQgdGhlIHRyYW5zcG9ydCBoYXMgY2xvc2VkLiBVc2VkIGJ5IHNlcnZpY2VzXG5cdCAqIG1hbmFnaW5nIGEgcGFzc2l2ZSB0cmFuc3BvcnQgKFNTSCAvIGRldi10dW5uZWxzKSB3aGVuIHRoZXkgb2JzZXJ2ZVxuXHQgKiBhIGNvbm5lY3Rpb24tbG9zcyBJUEMgZXZlbnQgaW5kZXBlbmRlbnQgb2YgdGhlIHRyYW5zcG9ydCdzIG93blxuXHQgKiBvbkNsb3NlIFx1MjAxNCB3aXRob3V0IHRoaXMsIGEgc2luZ2xlIGRyb3BwZWQgSVBDIGRlbGl2ZXJ5IG9uIHRoZVxuXHQgKiB0cmFuc3BvcnQncyBjbG9zZSBjaGFubmVsIGxlYXZlcyB0aGUgY2xpZW50IHN0cmFuZGVkIGluXG5cdCAqIGBDb25uZWN0ZWRgIHVudGlsIGl0cyB3YXRjaGRvZyBmaXJlcyAod2hpY2ggY2FuIHRha2UgaG91cnMgd2hlblxuXHQgKiB0aGUgcmVuZGVyZXIgaXMgYmFja2dyb3VuZGVkIGFuZCBgc2V0VGltZW91dGAgaXMgdGhyb3R0bGVkKS5cblx0ICpcblx0ICogSWRlbXBvdGVudCBcdTIwMTQgbm8tb3AgaWYgYWxyZWFkeSBjbG9zZWQgb3IgbWlkLXJlY29ubmVjdC5cblx0ICovXG5cdG5vdGlmeVRyYW5zcG9ydENsb3NlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9oYW5kbGVUcmFuc3BvcnRDbG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCBmcm9tIHRoZSB0cmFuc3BvcnQncyBgb25DbG9zZWAgZXZlbnQuIFdoZW4gYSB7QGxpbmsgX3RyYW5zcG9ydEZhY3Rvcnl9XG5cdCAqIGlzIGNvbmZpZ3VyZWQgd2UgYXR0ZW1wdCB0byBzb2Z0LXJlY29ubmVjdCByYXRoZXIgdGhhbiBmaXJlIGBvbkRpZENsb3NlYCBcdTIwMTRcblx0ICogdGhlIHByb3RvY29sLWxldmVsIGByZWNvbm5lY3RgIHJlcXVlc3QgbGV0cyB0aGUgc2VydmVyIHJlcGxheSBtaXNzZWRcblx0ICogYWN0aW9ucyBhbmQgcHJlc2VydmVzIHRoZSBgY2xpZW50SWRgIHNvIHBlbmRpbmcgdG9vbCBjYWxscyBldGMuIGFyZSBub3Rcblx0ICogY2FuY2VsbGVkIGJ5IHRoZSBob3N0LXNpZGUgZGlzY29ubmVjdCB0aW1lb3V0LiBXaXRob3V0IGEgZmFjdG9yeVxuXHQgKiAocGFzc2l2ZS10cmFuc3BvcnQgU1NIL3JlbGF5IHBhdGgpIHdlIGZhbGwgYmFjayB0byBcImNsb3NlIG1lYW5zIGNsb3NlZFwiXG5cdCAqIGFuZCBsZXQgdGhlIHNlcnZpY2UgZGVjaWRlIHdoZXRoZXIgdG8gc3BpbiB1cCBhIGZyZXNoIGNsaWVudC5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZVRyYW5zcG9ydENsb3NlKCk6IHZvaWQge1xuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUua2luZCkge1xuXHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQ6XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZzpcblx0XHRcdFx0aWYgKCF0aGlzLl9iZWdpblJlY29ubmVjdEZyb21Db25uZWN0aW5nKGNvbm5lY3Rpb25DbG9zZWRFcnJvcih0aGlzLl9hZGRyZXNzKSkpIHtcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVDbG9zZShjb25uZWN0aW9uQ2xvc2VkRXJyb3IodGhpcy5fYWRkcmVzcykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlOlxuXHRcdFx0XHR0aGlzLl9oYW5kbGVDbG9zZShjb25uZWN0aW9uQ2xvc2VkRXJyb3IodGhpcy5fYWRkcmVzcykpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlIEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZDoge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3RyYW5zcG9ydEZhY3RvcnkpIHtcblx0XHRcdFx0XHQvLyBQYXNzaXZlLXRyYW5zcG9ydCBwYXRoIChTU0gvdHVubmVsKTogdGhlIHRyYW5zcG9ydFxuXHRcdFx0XHRcdC8vIGNhbid0IGJlIHJlY29uc3RydWN0ZWQgZnJvbSBoZXJlLCBzbyB3ZSBzdXJmYWNlIHRoZVxuXHRcdFx0XHRcdC8vIGNsb3NlIGFuZCBsZXQgdGhlIHNlcnZpY2UgZGVjaWRlIHdoZXRoZXIgdG8gc3BpbiB1cFxuXHRcdFx0XHRcdC8vIGEgZnJlc2ggY2xpZW50LlxuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZUNsb3NlKGNvbm5lY3Rpb25DbG9zZWRFcnJvcih0aGlzLl9hZGRyZXNzKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBUcmFuc3BvcnQgbG9zdCBmb3IgJHt0aGlzLl9hZGRyZXNzfTsgc2NoZWR1bGluZyByZWNvbm5lY3QuYCk7XG5cdFx0XHRcdHRoaXMuX3RyYW5zaXRpb25Ubyh7IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZywgcmVjb25uZWN0OiB0aGlzLl9uZXdSZWNvbm5lY3RTdGF0ZSgpIH0pO1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxMaXZlbmVzc1RpbWVycygpO1xuXHRcdFx0XHQvLyBJbi1mbGlnaHQgcmVxdWVzdHMgY2FuJ3QgYmUgYW5zd2VyZWQgXHUyMDE0IHRoZSBuZXcgdHJhbnNwb3J0IGhhcyBhXG5cdFx0XHRcdC8vIHNlcGFyYXRlIHJlcXVlc3QtaWQgc3BhY2UuIFJlamVjdCB0aGVtIHNvIGNhbGxlcnMgY2FuIHJldHJ5LlxuXHRcdFx0XHR0aGlzLl9yZWplY3RQZW5kaW5nUmVxdWVzdHModHJhbnNwb3J0TG9zdEVycm9yKHRoaXMuX2FkZHJlc3MpKTtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVSZWNvbm5lY3QoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3Rpbmc6XG5cdFx0XHRcdC8vIEEgc2Vjb25kIHRyYW5zcG9ydCBkcm9wIHdoaWxlIGEgcmVjb25uZWN0IHdhcyBhbHJlYWR5IGluIGZsaWdodC5cblx0XHRcdFx0Ly8gUmVqZWN0IHRoZSBpbi1mbGlnaHQgYHJlY29ubmVjdGAgUlBDIHNvIGBfYXR0ZW1wdFJlY29ubmVjdGAnc1xuXHRcdFx0XHQvLyBjYXRjaCBwYXRoIHJ1bnMgYW5kIHNjaGVkdWxlcyB0aGUgbmV4dCBhdHRlbXB0IFx1MjAxNCByZXR1cm5pbmcgZWFybHlcblx0XHRcdFx0Ly8gd291bGQgbGVhdmUgdGhlIGF3YWl0IHBlbmRpbmcgZm9yZXZlciAoI2FnZW50LWhvc3QtZGVhZGxvY2spLlxuXHRcdFx0XHQvLyBTY2hlZHVsaW5nIGxpdmVzIGluIHRoZSBjYXRjaCBzbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCB0d29cblx0XHRcdFx0Ly8gY29uY3VycmVudCBzZXRUaW1lb3V0cyByYWNpbmcgdG8gaW5zdGFsbCBuZXcgdHJhbnNwb3J0cy5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFRyYW5zcG9ydCBsb3N0IGZvciAke3RoaXMuX2FkZHJlc3N9IG1pZC1yZWNvbm5lY3Q7IGFib3J0aW5nIHRoZSBjdXJyZW50IGF0dGVtcHQuYCk7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbExpdmVuZXNzVGltZXJzKCk7XG5cdFx0XHRcdHRoaXMuX3JlamVjdFBlbmRpbmdSZXF1ZXN0cyh0cmFuc3BvcnRMb3N0RXJyb3IodGhpcy5fYWRkcmVzcykpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5SZWNvbm5lY3RGcm9tQ29ubmVjdGluZyhlcnJvcjogUHJvdG9jb2xFcnJvcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0aW5nIHx8ICF0aGlzLl90cmFuc3BvcnRGYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBUcmFuc3BvcnQgbG9zdCB3aGlsZSBjb25uZWN0aW5nIHRvICR7dGhpcy5fYWRkcmVzc307IHNjaGVkdWxpbmcgYSBmcmVzaCBpbml0aWFsaXplLmApO1xuXHRcdC8vIENhcnJ5IHRoZSBwcmUtaGFuZHNoYWtlIG91dGJveCBpbnRvIHRoZSByZWNvbm5lY3Qgc3RhdGUgc28gcXVldWVkXG5cdFx0Ly8gbWVzc2FnZXMgYXJlIHJlcGxheWVkIG9uY2UgdGhlIGZyZXNoIGluaXRpYWxpemUgc3VjY2VlZHMuXG5cdFx0Y29uc3Qgb3V0Ym94ID0gdGhpcy5fc3RhdGUub3V0Ym94O1xuXHRcdHRoaXMuX3JlamVjdFBlbmRpbmdSZXF1ZXN0cyhlcnJvcik7XG5cdFx0dGhpcy5fZ3JhbnRlZEltcGxpY2l0UmVhZFVyaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9pbXBsaWNpdFJlYWRHcmFudHMuY2xlYXIoKTtcblx0XHR0aGlzLl90cmFuc2l0aW9uVG8oe1xuXHRcdFx0a2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nLFxuXHRcdFx0cmVjb25uZWN0OiB7IC4uLnRoaXMuX25ld1JlY29ubmVjdFN0YXRlKCksIG91dGJveCB9LFxuXHRcdH0pO1xuXHRcdHRoaXMuX2NhbmNlbExpdmVuZXNzVGltZXJzKCk7XG5cdFx0dGhpcy5fc2NoZWR1bGVSZWNvbm5lY3QoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW9wZW5zIGEgdGVybWluYWwgY29ubmVjdGlvbiBhZnRlciBpdHMgaG9zdCBoYXMgYmVlbiBleHBsaWNpdGx5IHJlc3RhcnRlZC5cblx0ICovXG5cdHJlY29ubmVjdEZyb21DbG9zZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZCB8fCAhdGhpcy5fdHJhbnNwb3J0RmFjdG9yeSB8fCB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX3RyYW5zaXRpb25Ubyh7IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZywgcmVjb25uZWN0OiB0aGlzLl9uZXdSZWNvbm5lY3RTdGF0ZSgpIH0pO1xuXHRcdHRoaXMuX3NjaGVkdWxlUmVjb25uZWN0KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZVJlY29ubmVjdCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nIHx8ICF0aGlzLl90cmFuc3BvcnRGYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlY29ubmVjdCA9IHRoaXMuX3N0YXRlLnJlY29ubmVjdDtcblx0XHRpZiAocmVjb25uZWN0LnRpbWVvdXRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhdHRlbXB0ID0gcmVjb25uZWN0LmF0dGVtcHQgKyAxO1xuXHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5taW4oUkVDT05ORUNUX0lOSVRJQUxfREVMQVlfTVMgKiBNYXRoLnBvdygyLCBhdHRlbXB0IC0gMSksIFJFQ09OTkVDVF9NQVhfREVMQVlfTVMpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBSZWNvbm5lY3RpbmcgdG8gJHt0aGlzLl9hZGRyZXNzfSBpbiAke2RlbGF5fW1zIChhdHRlbXB0ICR7YXR0ZW1wdH0pLmApO1xuXHRcdHJlY29ubmVjdC50aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlY29ubmVjdC50aW1lb3V0SGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLl9hdHRlbXB0UmVjb25uZWN0KCk7XG5cdFx0fSwgZGVsYXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXR0ZW1wdFJlY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nIHx8ICF0aGlzLl90cmFuc3BvcnRGYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlY29ubmVjdCA9IHRoaXMuX3N0YXRlLnJlY29ubmVjdDtcblx0XHRyZWNvbm5lY3QuYXR0ZW1wdCsrO1xuXHRcdGxldCB0cmFuc3BvcnQ6IElQcm90b2NvbFRyYW5zcG9ydCB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0dHJhbnNwb3J0ID0gdGhpcy5fdHJhbnNwb3J0RmFjdG9yeSgpO1xuXHRcdFx0dGhpcy5faW5zdGFsbFRyYW5zcG9ydCh0cmFuc3BvcnQpO1xuXHRcdFx0aWYgKGlzQ2xpZW50VHJhbnNwb3J0KHRyYW5zcG9ydCkpIHtcblx0XHRcdFx0YXdhaXQgdHJhbnNwb3J0LmNvbm5lY3QoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb25zID0gdGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5jdXJyZW50U3Vic2NyaXB0aW9uVXJpcygpLm1hcCh1ID0+IHUudG9TdHJpbmcoKSk7XG5cdFx0XHQvLyBBbHdheXMgaW5jbHVkZSB0aGUgYWx3YXlzLWxpdmUgcm9vdCBzdGF0ZSBhbG9uZ3NpZGUgZ2V0U3Vic2NyaXB0aW9uLW1hbmFnZWQgZW50cmllcy5cblx0XHRcdGlmICghc3Vic2NyaXB0aW9ucy5pbmNsdWRlcyhST09UX1NUQVRFX1VSSSkpIHtcblx0XHRcdFx0c3Vic2NyaXB0aW9ucy51bnNoaWZ0KFJPT1RfU1RBVEVfVVJJKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhc3RTZWVuU2VydmVyU2VxID0gdGhpcy5fc2VydmVyU2VxO1xuXHRcdFx0Y29uc3QgeyByZXN1bHQsIGZyZXNoSW5pdGlhbGl6ZSB9ID0gYXdhaXQgdGhpcy5fcmVjb25uZWN0T3JJbml0aWFsaXplKGxhc3RTZWVuU2VydmVyU2VxLCBzdWJzY3JpcHRpb25zKTtcblxuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2FwcGx5UmVjb25uZWN0UmVzdWx0KHJlc3VsdCwgZnJlc2hJbml0aWFsaXplKTtcblx0XHRcdHRoaXMuX3VwZGF0ZU1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zKHRydWUpO1xuXHRcdFx0aWYgKGZyZXNoSW5pdGlhbGl6ZSAmJiByZXN1bHQudHlwZSA9PT0gUmVjb25uZWN0UmVzdWx0VHlwZS5TbmFwc2hvdCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXN0b3JlQXV0aGVudGljYXRpb25BZnRlckZyZXNoSW5pdGlhbGl6ZSgpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXN0b3JlU3Vic2NyaXB0aW9uc0FmdGVyRnJlc2hJbml0aWFsaXplKHJlc3VsdC5zbmFwc2hvdHMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlLXB1c2ggcmVuZGVyZXItb3duZWQgY29uZmlnIG9uIHJlY29ubmVjdCB0b286IGEgcmVjb25uZWN0ZWQgaG9zdCBtYXlcblx0XHRcdC8vIGJlIGEgZnJlc2hseSByZXN0YXJ0ZWQgcHJvY2VzcyB0aGF0IG5ldmVyIHJlY2VpdmVkIHRoZXNlIHZhbHVlcyAodGhlXG5cdFx0XHQvLyByZWNvbm5lY3QgcmVzdWx0IGl0c2VsZiBjYXJyaWVzIG5vbmUpLCB3aGljaCB3b3VsZCBvdGhlcndpc2UgbGVhdmVcblx0XHRcdC8vIGVhcmx5LXJlYWQgY29uZmlnIGxpa2UgdGhlIG1pZ3JhdGUgZmxhZyBhdCBpdHMgaG9zdC1zaWRlIGRlZmF1bHQuXG5cdFx0XHR0aGlzLl9mb3J3YXJkQ2xpZW50Q29uZmlnKGZhbHNlKTtcblxuXHRcdFx0Ly8gRHJhaW4gdGhlIG91dGJveCBCRUZPUkUgdGhlIHRyYW5zaXRpb24gc28gbGlzdGVuZXJzIHJlYWN0aW5nIHRvXG5cdFx0XHQvLyB7QGxpbmsgb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGV9IHRoYXQgc3luY2hyb25vdXNseSBkaXNwYXRjaCBzZWVcblx0XHRcdC8vIHN0YXRlPUNvbm5lY3RlZCBhbmQgZ28gZGlyZWN0LCBsYW5kaW5nIGFmdGVyIHRoZSBkcmFpbmVkIG91dGJveFxuXHRcdFx0Ly8gaW4gd2lyZSBvcmRlci5cblx0XHRcdGNvbnN0IHsgZ2F0ZSB9ID0gcmVjb25uZWN0O1xuXHRcdFx0dGhpcy5fZHJhaW5BZnRlclJlY29ubmVjdChyZWNvbm5lY3Qub3V0Ym94KTtcblxuXHRcdFx0dGhpcy5fbGFzdFJlYWRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdHRoaXMuX3Jlc2V0TGl2ZW5lc3NUaW1lcnMoKTtcblx0XHRcdHRoaXMuX3RyYW5zaXRpb25Ubyh7IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZCB9KTtcblx0XHRcdGdhdGUuY29tcGxldGUoKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBSZWNvbm5lY3RlZCB0byAke3RoaXMuX2FkZHJlc3N9LmApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFJlY29ubmVjdCBhdHRlbXB0IGZhaWxlZCBmb3IgJHt0aGlzLl9hZGRyZXNzfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR0cmFuc3BvcnQ/LmRpc3Bvc2UoKTtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIE5vblJlY29ubmVjdGFibGVUcmFuc3BvcnRFcnJvcikge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVDbG9zZShuZXcgUHJvdG9jb2xFcnJvcihBSFBfQ0xJRU5UX0NPTk5FQ1RJT05fQ0xPU0VELCBlcnIubWVzc2FnZSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBSZXBsYWNlIHRoZSBnYXRlIHNvIGF3YWl0aW5nIGNhbGxlcnMgc2VlIHRoZSBmYWlsdXJlIGJ1dCBuZXdcblx0XHRcdC8vIGNhbGxlcnMgZ2F0ZSBvbiB0aGUgbmV4dCBhdHRlbXB0IGluc3RlYWQgb2Ygc2xpcHBpbmcgdGhyb3VnaCBvbnRvXG5cdFx0XHQvLyB0aGUgZGVhZCB0cmFuc3BvcnQuIE91dGJveCBjYXJyaWVzIGZvcndhcmQgdG8gdGhlIG5leHQgYXR0ZW1wdC5cblx0XHRcdGNvbnN0IG9sZEdhdGUgPSB0aGlzLl9zdGF0ZS5yZWNvbm5lY3QuZ2F0ZTtcblx0XHRcdHRoaXMuX3N0YXRlLnJlY29ubmVjdC5nYXRlID0gdGhpcy5fbmV3UmVjb25uZWN0R2F0ZSgpO1xuXHRcdFx0b2xkR2F0ZS5lcnJvcihlcnIpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVSZWNvbm5lY3QoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbm5lY3RPckluaXRpYWxpemUobGFzdFNlZW5TZXJ2ZXJTZXE6IG51bWJlciwgc3Vic2NyaXB0aW9uczogc3RyaW5nW10pOiBQcm9taXNlPHsgcmVzdWx0OiBDb21tYW5kTWFwWydyZWNvbm5lY3QnXVsncmVzdWx0J107IGZyZXNoSW5pdGlhbGl6ZTogYm9vbGVhbiB9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2Rpc3BhdGNoUmVxdWVzdDxDb21tYW5kTWFwWydyZWNvbm5lY3QnXVsncmVzdWx0J10+KCdyZWNvbm5lY3QnLCB7XG5cdFx0XHRcdGNsaWVudElkOiB0aGlzLl9jbGllbnRJZCxcblx0XHRcdFx0bGFzdFNlZW5TZXJ2ZXJTZXEsXG5cdFx0XHRcdHN1YnNjcmlwdGlvbnMsXG5cdFx0XHRcdC4uLnRoaXMuX2NsaWVudENvbm5lY3Rpb25UZWxlbWV0cnlNZXRhKCksXG5cdFx0XHR9LCB7IGJ5cGFzc1JlY29ubmVjdEdhdGU6IHRydWUgfSk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQsIGZyZXNoSW5pdGlhbGl6ZTogZmFsc2UgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yKSB8fCBlcnJvci5jb2RlICE9PSBBaHBFcnJvckNvZGVzLk5vdEZvdW5kKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBTZXJ2ZXIgZm9yZ290IGNsaWVudCAke3RoaXMuX2NsaWVudElkfTsgaW5pdGlhbGl6aW5nIGEgZnJlc2ggY29ubmVjdGlvbi5gKTtcblx0XHRjb25zdCBpbml0aWFsaXplUmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlzcGF0Y2hSZXF1ZXN0PENvbW1hbmRNYXBbJ2luaXRpYWxpemUnXVsncmVzdWx0J10+KCdpbml0aWFsaXplJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbLi4uU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT05TXSxcblx0XHRcdGNsaWVudElkOiB0aGlzLl9jbGllbnRJZCxcblx0XHRcdGNsaWVudEluZm86IHRoaXMuX2NsaWVudEluZm8sXG5cdFx0XHQuLi50aGlzLl9jbGllbnRDb25uZWN0aW9uVGVsZW1ldHJ5TWV0YSgpLFxuXHRcdFx0aW5pdGlhbFN1YnNjcmlwdGlvbnM6IHN1YnNjcmlwdGlvbnMsXG5cdFx0fSwgeyBieXBhc3NSZWNvbm5lY3RHYXRlOiB0cnVlIH0pO1xuXHRcdHRoaXMuX2FwcGx5SW5pdGlhbGl6ZVJlc3VsdChpbml0aWFsaXplUmVzdWx0LCBmYWxzZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc3VsdDogeyB0eXBlOiBSZWNvbm5lY3RSZXN1bHRUeXBlLlNuYXBzaG90LCBzbmFwc2hvdHM6IGluaXRpYWxpemVSZXN1bHQuc25hcHNob3RzID8/IFtdIH0sXG5cdFx0XHRmcmVzaEluaXRpYWxpemU6IHRydWUsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc3RvcmVTdWJzY3JpcHRpb25zQWZ0ZXJGcmVzaEluaXRpYWxpemUoaW5pdGlhbFNuYXBzaG90czogcmVhZG9ubHkgSVN0YXRlU25hcHNob3RbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gbmV3IFNldChpbml0aWFsU25hcHNob3RzLm1hcChzbmFwc2hvdCA9PiBzbmFwc2hvdC5yZXNvdXJjZSkpO1xuXHRcdGNvbnN0IGFjdGl2ZSA9IHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuZ2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpXG5cdFx0XHQuZmlsdGVyKHN1YnNjcmlwdGlvbiA9PiAhcmVzdG9yZWQuaGFzKHN1YnNjcmlwdGlvbi5yZXNvdXJjZS50b1N0cmluZygpKSk7XG5cdFx0Y29uc3QgcmVzdG9yZUdyb3VwID0gYXN5bmMgKHN1YnNjcmlwdGlvbnM6IHR5cGVvZiBhY3RpdmUpID0+IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHN1YnNjcmlwdGlvbnMubWFwKGFzeW5jIHN1YnNjcmlwdGlvbiA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlzcGF0Y2hSZXF1ZXN0PENvbW1hbmRNYXBbJ3N1YnNjcmliZSddWydyZXN1bHQnXT4oJ3N1YnNjcmliZScsIHtcblx0XHRcdFx0XHRcdGNoYW5uZWw6IHN1YnNjcmlwdGlvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdH0sIHsgYnlwYXNzUmVjb25uZWN0R2F0ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRpZiAocmVzdWx0LnNuYXBzaG90KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25NYW5hZ2VyLmFwcGx5UmVjb25uZWN0U25hcHNob3QoXG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5zbmFwc2hvdC5yZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnNuYXBzaG90LnN0YXRlLFxuXHRcdFx0XHRcdFx0XHRyZXN1bHQuc25hcHNob3QuZnJvbVNlcSxcblx0XHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXJ2ZXJTZXEgPSBNYXRoLm1heCh0aGlzLl9zZXJ2ZXJTZXEsIHJlc3VsdC5zbmFwc2hvdC5mcm9tU2VxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvciAmJiBlcnJvci5jb2RlID09PSBBSFBfQ0xJRU5UX0NPTk5FQ1RJT05fQ0xPU0VEKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnRdIEZhaWxlZCB0byByZXN0b3JlIHN1YnNjcmlwdGlvbiAke3N1YnNjcmlwdGlvbi5yZXNvdXJjZS50b1N0cmluZygpfSBhZnRlciBob3N0IHJlc3RhcnQ6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIubWFya1N1YnNjcmlwdGlvbnNNaXNzaW5nKFtzdWJzY3JpcHRpb24ucmVzb3VyY2VdKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH07XG5cblx0XHRhd2FpdCByZXN0b3JlR3JvdXAoYWN0aXZlLmZpbHRlcihzdWJzY3JpcHRpb24gPT4gc3Vic2NyaXB0aW9uLmtpbmQgPT09IFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0cmVzdG9yZUdyb3VwKGFjdGl2ZS5maWx0ZXIoc3Vic2NyaXB0aW9uID0+IHN1YnNjcmlwdGlvbi5raW5kID09PSBTdGF0ZUNvbXBvbmVudHMuQ2hhdCkpLFxuXHRcdFx0cmVzdG9yZUdyb3VwKGFjdGl2ZS5maWx0ZXIoc3Vic2NyaXB0aW9uID0+IHN1YnNjcmlwdGlvbi5raW5kICE9PSBTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiAmJiBzdWJzY3JpcHRpb24ua2luZCAhPT0gU3RhdGVDb21wb25lbnRzLkNoYXQpKSxcblx0XHRdKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc3RvcmVBdXRoZW50aWNhdGlvbkFmdGVyRnJlc2hJbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi50aGlzLl9hdXRoZW50aWNhdGlvbi52YWx1ZXMoKV0ubWFwKHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaFJlcXVlc3Q8Q29tbWFuZE1hcFsnYXV0aGVudGljYXRlJ11bJ3Jlc3VsdCddPignYXV0aGVudGljYXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHQuLi5wYXJhbXMsXG5cdFx0XHRzY29wZXM6IHBhcmFtcy5zY29wZXMgPyBbLi4ucGFyYW1zLnNjb3Blc10gOiB1bmRlZmluZWQsXG5cdFx0fSwgeyBieXBhc3NSZWNvbm5lY3RHYXRlOiB0cnVlIH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGllbnRDb25uZWN0aW9uVGVsZW1ldHJ5TWV0YSgpOiB7IF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9IHwgUmVjb3JkPHN0cmluZywgbmV2ZXI+IHtcblx0XHRjb25zdCBzZW5kSWRlbnRpdHkgPSB0ZWxlbWV0cnlMZXZlbEVuYWJsZWQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwuVVNBR0UpO1xuXHRcdGNvbnN0IG1hY2hpbmVJZCA9IHNlbmRJZGVudGl0eSA/IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UubWFjaGluZUlkIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGRldkRldmljZUlkID0gc2VuZElkZW50aXR5ID8gdGhpcy5fdGVsZW1ldHJ5U2VydmljZS5kZXZEZXZpY2VJZCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtZXRhID0gdG9DbGllbnRUZWxlbWV0cnlNZXRhKHRoaXMuX3RyYW5zcG9ydC5jbGllbnRDb25uZWN0aW9uS2luZCwgbWFjaGluZUlkLCBkZXZEZXZpY2VJZCk7XG5cdFx0cmV0dXJuIG1ldGEgPyB7IF9tZXRhOiBtZXRhIH0gOiB7fTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5SW5pdGlhbGl6ZVJlc3VsdChyZXN1bHQ6IENvbW1hbmRNYXBbJ2luaXRpYWxpemUnXVsncmVzdWx0J10sIGZvcndhcmRDbGllbnRDb25maWcgPSB0cnVlKTogdm9pZCB7XG5cdFx0dGhpcy5faW5pdGlhbGl6ZVJlc3VsdC5zZXQocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3NlcnZlclNlcSA9IHJlc3VsdC5zZXJ2ZXJTZXE7XG5cdFx0aWYgKHJlc3VsdC5kZWZhdWx0RGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCBkaXJlY3RvcnkgPSByZXN1bHQuZGVmYXVsdERpcmVjdG9yeTtcblx0XHRcdHRoaXMuX2RlZmF1bHREaXJlY3RvcnkgPSB0eXBlb2YgZGlyZWN0b3J5ID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShkaXJlY3RvcnkpLnBhdGggOiBVUkkucmV2aXZlKGRpcmVjdG9yeSkucGF0aDtcblx0XHR9XG5cdFx0aWYgKGZvcndhcmRDbGllbnRDb25maWcpIHtcblx0XHRcdHRoaXMuX2ZvcndhcmRDbGllbnRDb25maWcoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHVzaCB0aGUgcmVuZGVyZXItb3duZWQgY29uZmlnIHZhbHVlcyB0aGUgaG9zdCBtaXJyb3JzICh0ZWxlbWV0cnkgbGV2ZWwsXG5cdCAqIHByb3h5IGRpc2NvdmVyeSwgbWlncmF0ZSBmbGFnLCBcdTIwMjYpIGFzIGBSb290Q29uZmlnQ2hhbmdlZGAgYWN0aW9ucy4gQ2FsbGVkIG9uXG5cdCAqIGluaXRpYWwgY29ubmVjdCBBTkQgb24gcmVjb25uZWN0OiBhIHJlY29ubmVjdGVkIGhvc3QgbWF5IGJlIGEgZnJlc2hseVxuXHQgKiByZXN0YXJ0ZWQgcHJvY2VzcyAob3Igb25lIHRoYXQgbG9zdCB0aGVzZSB2YWx1ZXMpLCBhbmQgcmUtcHVzaGluZyBpcyBhIGNoZWFwXG5cdCAqIG5vLW9wIHdoZW4gbm90aGluZyBjaGFuZ2VkLiBXaXRob3V0IHRoaXMsIGEgdmFsdWUgcmVhZCBlYXJseSBcdTIwMTQgbGlrZSB0aGVcblx0ICogbWlncmF0ZSBmbGFnIGluIGBsaXN0U2Vzc2lvbnNgIFx1MjAxNCBjYW4gYmUgbWlzc2luZyBhZnRlciBhIHdpbmRvdyByZWxvYWQuXG5cdCAqXG5cdCAqIE1vc3Qgc2V0dGluZ3MgYXJyaXZlIGhlcmUgZGVjbGFyYXRpdmVseSwgdmlhIGBhZ2VudEhvc3RgIG9uIHRoZWlyXG5cdCAqIGNvbmZpZ3VyYXRpb24gc2NoZW1hLiBUaGUgZXhwbGljaXQgY2FsbHMgYmVsb3cgY292ZXIgdGhlIGNhc2VzIGEgc2luZ2xlXG5cdCAqIGtleS1wbHVzLXRyYW5zZm9ybSBjYW4ndCBleHByZXNzOiB2YWx1ZXMgZGVyaXZlZCBmcm9tIHNldmVyYWwgc2V0dGluZ3MsIGFuZFxuXHQgKiBzZXR0aW5ncyBjb250cmlidXRlZCBieSBhbiBleHRlbnNpb24gcmF0aGVyIHRoYW4gYnkgY29yZS5cblx0ICovXG5cdHByaXZhdGUgX2ZvcndhcmRDbGllbnRDb25maWcoaW5jbHVkZU1hbmFnZWRTZXR0aW5ncyA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwYXRjaFJvb3RDb25maWcocmVzb2x2ZUFnZW50SG9zdENvbmZpZ3VyYXRpb25TeW5jUGF0Y2godGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3Jlc291cmNlSWRlbnRpdHkgPT09IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFkpKTtcblx0XHR0aGlzLl91cGRhdGVUZWxlbWV0cnlMZXZlbCgpO1xuXHRcdHRoaXMuX3VwZGF0ZVRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlVGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzKCk7XG5cdFx0dGhpcy5fdXBkYXRlRGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5KCk7XG5cdFx0aWYgKGluY2x1ZGVNYW5hZ2VkU2V0dGluZ3MpIHtcblx0XHRcdHZvaWQgdGhpcy5fdXBkYXRlTWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgYSBgcmVjb25uZWN0YCBSUEMgcmVzdWx0IHRvIHRoZSBzdWJzY3JpcHRpb24gbWFuYWdlci4gT24gYHJlcGxheWBcblx0ICogd2UgZmVlZCBlYWNoIG1pc3NlZCBlbnZlbG9wZSB0aHJvdWdoIHRoZSBub3JtYWwgYWN0aW9uIHBhdGg7IG9uXG5cdCAqIGBzbmFwc2hvdGAgd2UgcmVzZWF0IGVhY2ggbmFtZWQgc3Vic2NyaXB0aW9uIHdpdGggdGhlIGZyZXNoIHN0YXRlIGFuZFxuXHQgKiBhZHZhbmNlIHRoZSBzZXJ2ZXIgc2VxIGN1cnNvciBhY2NvcmRpbmdseS5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5UmVjb25uZWN0UmVzdWx0KHJlc3VsdDogQ29tbWFuZE1hcFsncmVjb25uZWN0J11bJ3Jlc3VsdCddLCBwcmVzZXJ2ZVBlbmRpbmcgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmIChyZXN1bHQudHlwZSA9PT0gUmVjb25uZWN0UmVzdWx0VHlwZS5SZXBsYXkpIHtcblx0XHRcdGxldCBtYXhTZXEgPSB0aGlzLl9zZXJ2ZXJTZXE7XG5cdFx0XHRmb3IgKGNvbnN0IGVudmVsb3BlIG9mIHJlc3VsdC5hY3Rpb25zKSB7XG5cdFx0XHRcdC8vIEZvciBvd24gbm9uLXJlamVjdGVkIGFjdGlvbnMsIGRyb3AgdGhlIG1hdGNoaW5nIHBlbmRpbmcgZW50cnkgdXBcblx0XHRcdFx0Ly8gZnJvbnQgc28gd2UgZG9uJ3QgcmVzZW5kIGl0IHZpYSB7QGxpbmsgX3JlcGxheVBlbmRpbmdBY3Rpb25zfS5cblx0XHRcdFx0Ly8gRm9yIHJlamVjdGVkIGFjdGlvbnMgd2UgTVVTVCBsZWF2ZSB0aGUgZW50cnkgaW4gcGxhY2Ugc28gdGhlXG5cdFx0XHRcdC8vIHN1YnNjcmlwdGlvbidzIHJlY29uY2lsZSBwYXRoIHNlZXMgYGlkeCAhPT0gLTFgIGFuZCBkaXNjYXJkc1xuXHRcdFx0XHQvLyB0aGUgYWN0aW9uIGluc3RlYWQgb2YgYXBwbHlpbmcgaXQgdG8gY29uZmlybWVkIHN0YXRlLlxuXHRcdFx0XHRpZiAoZW52ZWxvcGUub3JpZ2luPy5jbGllbnRJZCA9PT0gdGhpcy5fY2xpZW50SWRcblx0XHRcdFx0XHQmJiBlbnZlbG9wZS5vcmlnaW4uY2xpZW50U2VxICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQmJiAhZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5kcm9wUGVuZGluZ1Nlc3Npb25BY3Rpb24oZW52ZWxvcGUuY2hhbm5lbCwgZW52ZWxvcGUub3JpZ2luLmNsaWVudFNlcSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVudmVsb3BlLnNlcnZlclNlcSA+IG1heFNlcSkge1xuXHRcdFx0XHRcdG1heFNlcSA9IGVudmVsb3BlLnNlcnZlclNlcTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vbkRpZEFjdGlvbi5maXJlKGVudmVsb3BlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NlcnZlclNlcSA9IG1heFNlcTtcblx0XHRcdGlmIChyZXN1bHQubWlzc2luZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBTZXJ2ZXIgY2Fubm90IHJlc3VtZSAke3Jlc3VsdC5taXNzaW5nLmxlbmd0aH0gc3Vic2NyaXB0aW9uKHMpIGFmdGVyIHJlY29ubmVjdC5gKTtcblx0XHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5tYXJrU3Vic2NyaXB0aW9uc01pc3NpbmcocmVzdWx0Lm1pc3NpbmcubWFwKHUgPT4gVVJJLnBhcnNlKHUpKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBtYXhTZXEgPSB0aGlzLl9zZXJ2ZXJTZXE7XG5cdFx0XHRmb3IgKGNvbnN0IHNuYXBzaG90IG9mIHJlc3VsdC5zbmFwc2hvdHMpIHtcblx0XHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5hcHBseVJlY29ubmVjdFNuYXBzaG90KHNuYXBzaG90LnJlc291cmNlLCBzbmFwc2hvdC5zdGF0ZSwgc25hcHNob3QuZnJvbVNlcSwgcHJlc2VydmVQZW5kaW5nKTtcblx0XHRcdFx0aWYgKHNuYXBzaG90LmZyb21TZXEgPiBtYXhTZXEpIHtcblx0XHRcdFx0XHRtYXhTZXEgPSBzbmFwc2hvdC5mcm9tU2VxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXJ2ZXJTZXEgPSBtYXhTZXE7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERyYWluIHF1ZXVlZCBvdXRnb2luZyB3aXJlIHRyYWZmaWMgYWZ0ZXIgYSBzdWNjZXNzZnVsIHNvZnQgcmVjb25uZWN0OlxuXHQgKlxuXHQgKiAxLiBSZXNlbmQgcGVuZGluZyBvcHRpbWlzdGljIHNlc3Npb24gYWN0aW9ucyB0aGF0IHRoZSBzZXJ2ZXIgZGlkIE5PVFxuXHQgKiAgICBlY2hvIGJhY2sgaW4gdGhlIHJlcGxheSBidWZmZXIgKGkuZS4gYW55dGhpbmcgc3RpbGwgb25cblx0ICogICAge0BsaW5rIEFnZW50U3Vic2NyaXB0aW9uTWFuYWdlci5nZXRQZW5kaW5nU2Vzc2lvbkFjdGlvbnN9KS5cblx0ICogMi4gRmx1c2ggZXZlcnkgbWVzc2FnZSB0aGF0IHtAbGluayBfc2VuZE5vdGlmaWNhdGlvbn0gcXVldWVkIG9udG8gdGhlXG5cdCAqICAgIG91dGJveCB3aGlsZSB0aGUgZ2F0ZSB3YXMgZW5nYWdlZC5cblx0ICpcblx0ICogUmVwbGF5cyBhcmUgZGVkdXBlZCBhZ2FpbnN0IHRoZSBvdXRib3ggYnkgYGNsaWVudFNlcWAgc28gYSBzZXNzaW9uXG5cdCAqIGFjdGlvbiB0aGF0IHdhcyBib3RoIG9wdGltaXN0aWMtdHJhY2tlZCBBTkQgcXVldWVkIGR1cmluZyB0aGVcblx0ICogcmVjb25uZWN0IHdpbmRvdyBvbmx5IGdvZXMgb3V0IG9uY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9kcmFpbkFmdGVyUmVjb25uZWN0KG91dGJveDogcmVhZG9ubHkgUHJvdG9jb2xNZXNzYWdlW10pOiB2b2lkIHtcblx0XHQvLyBCdWlsZCB0aGUgc2V0IG9mIGNsaWVudFNlcXMgYWxyZWFkeSByZXByZXNlbnRlZCBpbiB0aGUgb3V0Ym94IHNvIHdlXG5cdFx0Ly8gZG9uJ3QgcmVwbGF5IGEgZHVwbGljYXRlLiBPbmx5IGBkaXNwYXRjaEFjdGlvbmAgbm90aWZpY2F0aW9ucyBjYXJyeVxuXHRcdC8vIGEgY2xpZW50U2VxOyBub3RoaW5nIGVsc2UgaXMgaW5kZXBlbmRlbnRseSByZS1lbWl0dGVkIGJ5IHRoZSByZXBsYXlcblx0XHQvLyBwYXRoLCBzbyBvdGhlciBxdWV1ZWQgbWVzc2FnZSBraW5kcyBuZWVkIG5vIGRlZHVwLlxuXHRcdGNvbnN0IHF1ZXVlZFNlcXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRmb3IgKGNvbnN0IG1zZyBvZiBvdXRib3gpIHtcblx0XHRcdGlmIChoYXNLZXkobXNnLCB7IG1ldGhvZDogdHJ1ZSB9KSAmJiBtc2cubWV0aG9kID09PSAnZGlzcGF0Y2hBY3Rpb24nKSB7XG5cdFx0XHRcdHF1ZXVlZFNlcXMuYWRkKG1zZy5wYXJhbXMuY2xpZW50U2VxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXBsYXlzOiBQcm90b2NvbE1lc3NhZ2VbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5nZXRQZW5kaW5nU2Vzc2lvbkFjdGlvbnMoKSkge1xuXHRcdFx0aWYgKHF1ZXVlZFNlcXMuaGFzKGVudHJ5LmNsaWVudFNlcSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ncmFudEltcGxpY2l0UmVhZHNGb3JPdXRnb2luZ0FjdGlvbihlbnRyeS5hY3Rpb24pO1xuXHRcdFx0cmVwbGF5cy5wdXNoKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdG1ldGhvZDogJ2Rpc3BhdGNoQWN0aW9uJyxcblx0XHRcdFx0cGFyYW1zOiB7IGNoYW5uZWw6IGVudHJ5LmNoYW5uZWwsIGNsaWVudFNlcTogZW50cnkuY2xpZW50U2VxLCBhY3Rpb246IGVudHJ5LmFjdGlvbiB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlcGxheXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFJlcGxheWluZyAke3JlcGxheXMubGVuZ3RofSBwZW5kaW5nIGFjdGlvbihzKSBhZnRlciByZWNvbm5lY3QgdG8gJHt0aGlzLl9hZGRyZXNzfS5gKTtcblx0XHR9XG5cblx0XHQvLyBSZXBsYXlzIGZpcnN0IChkaXNwYXRjaGVkIGJlZm9yZSB0aGUgcmVjb25uZWN0IHdpbmRvdyksIHRoZW4gdGhlXG5cdFx0Ly8gb3V0Ym94IChkaXNwYXRjaGVkIGR1cmluZyBpdCkgc28gd2lyZSBvcmRlciByb3VnaGx5IHRyYWNrc1xuXHRcdC8vIGRpc3BhdGNoIG9yZGVyLlxuXHRcdGZvciAoY29uc3QgbXNnIG9mIHJlcGxheXMpIHtcblx0XHRcdHRoaXMuX3RyYW5zcG9ydC5zZW5kKG1zZyk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbXNnIG9mIG91dGJveCkge1xuXHRcdFx0dGhpcy5fdHJhbnNwb3J0LnNlbmQobXNnKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIElBZ2VudENvbm5lY3Rpb24gc3Vic2NyaXB0aW9uIEFQSSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Z2V0IHJvb3RTdGF0ZSgpOiBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIucm9vdFN0YXRlO1xuXHR9XG5cblx0Z2V0U3Vic2NyaXB0aW9uPFQ+KGtpbmQ6IFN0YXRlQ29tcG9uZW50cywgcmVzb3VyY2U6IFVSSSwgb3duZXI6IHN0cmluZyk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPFQ+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuZ2V0U3Vic2NyaXB0aW9uPFQ+KGtpbmQsIHJlc291cmNlLCBvd25lcik7XG5cdH1cblxuXHRnZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQ8VD4oX2tpbmQ6IFN0YXRlQ29tcG9uZW50cywgcmVzb3VyY2U6IFVSSSk6IElBZ2VudFN1YnNjcmlwdGlvbjxUPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFQ+KHJlc291cmNlKTtcblx0fVxuXG5cdGdldEluZmxpZ2h0U2Vzc2lvbkNyZWF0ZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuZ2V0SW5mbGlnaHRTZXNzaW9uQ3JlYXRlKHJlc291cmNlKTtcblx0fVxuXG5cdHRyYWNrU2Vzc2lvbkNyZWF0ZShyZXNvdXJjZTogVVJJLCBwcm9taXNlOiBQcm9taXNlPHVua25vd24+KTogdm9pZCB7XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci50cmFja1Nlc3Npb25DcmVhdGUocmVzb3VyY2UsIHByb21pc2UpO1xuXHR9XG5cblx0Z2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpOiByZWFkb25seSBJQWN0aXZlU3Vic2NyaXB0aW9uSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5nZXRBY3RpdmVTdWJzY3JpcHRpb25zKCk7XG5cdH1cblxuXHRkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudENoYW5nZXNldEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VxID0gdGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5kaXNwYXRjaE9wdGltaXN0aWMoY2hhbm5lbCwgYWN0aW9uKTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgdGhpcy5fY2xpZW50SWQsIHNlcSk7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2NyaWJlIHRvIHN0YXRlIGF0IGEgVVJJLiBSZXR1cm5zIHRoZSBjdXJyZW50IHN0YXRlIHNuYXBzaG90LlxuXHQgKlxuXHQgKiBGb3Igc3RhdGVsZXNzIGNoYW5uZWxzIChlLmcuIGBhaHAtb3RscDpgIHRlbGVtZXRyeSBjaGFubmVscykgdXNlXG5cdCAqIHtAbGluayBzdWJzY3JpYmVTdGF0ZWxlc3N9IFx1MjAxNCBjYWxsaW5nIHRoaXMgbWV0aG9kIG9uIGEgc3RhdGVsZXNzXG5cdCAqIGNoYW5uZWwgcmVqZWN0cyBiZWNhdXNlIHRoZSBzZXJ2ZXIgb21pdHMgYHNuYXBzaG90YCBvbiB0aGVcblx0ICogcmVzcG9uc2UuXG5cdCAqL1xuXHRhc3luYyBzdWJzY3JpYmUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVN0YXRlU25hcHNob3Q+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdCgnc3Vic2NyaWJlJywgeyBjaGFubmVsOiByZXNvdXJjZS50b1N0cmluZygpIH0pO1xuXHRcdGlmICghcmVzdWx0LnNuYXBzaG90KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHN1YnNjcmliZSB0byAke3Jlc291cmNlLnRvU3RyaW5nKCl9IHJldHVybmVkIG5vIHNuYXBzaG90YCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQuc25hcHNob3Q7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2NyaWJlIHRvIGEgc3RhdGVsZXNzIGNoYW5uZWwgXHUyMDE0IG9uZSBmb3Igd2hpY2ggdGhlIHNlcnZlciBkb2VzXG5cdCAqIG5vdCBtYWludGFpbiByZXBsYXlhYmxlIHN0YXRlIGFuZCB0aGVyZWZvcmUgb21pdHMgYHNuYXBzaG90YCBmcm9tXG5cdCAqIHRoZSBgc3Vic2NyaWJlYCByZXNwb25zZS4gVXNlZCB0b2RheSBmb3IgdGhlIGhvc3QncyBPVExQIHRlbGVtZXRyeVxuXHQgKiBjaGFubmVscyAoYGFocC1vdGxwOmApLlxuXHQgKlxuXHQgKiBSZXR1cm5zIG9uY2UgdGhlIHN1YnNjcmlwdGlvbiBpcyBjb25maXJtZWQgYnkgdGhlIHNlcnZlci5cblx0ICogU3Vic2VxdWVudCBub3RpZmljYXRpb25zIG9uIHRoZSBjaGFubmVsIGFycml2ZSB2aWEgdGhlIHJlbGV2YW50XG5cdCAqIGRpc3BhdGNoIGV2ZW50IChlLmcuIHtAbGluayBvbkRpZFJlY2VpdmVPdGxwTG9nc30gZm9yIGxvZyByZWNvcmRzKS5cblx0ICovXG5cdGFzeW5jIHN1YnNjcmliZVN0YXRlbGVzcyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fc2VuZFJlcXVlc3QoJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcmVzb3VyY2UudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVbnN1YnNjcmliZSBmcm9tIHN0YXRlIGF0IGEgVVJJLlxuXHQgKi9cblx0dW5zdWJzY3JpYmUocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbmROb3RpZmljYXRpb24oJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiByZXNvdXJjZS50b1N0cmluZygpIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3BhdGNoIGEgY2xpZW50IGFjdGlvbiB0byB0aGUgc2VydmVyLiBSZXR1cm5zIHRoZSBjbGllbnRTZXEgdXNlZC5cblx0ICovXG5cdHByaXZhdGUgZGlzcGF0Y2hBY3Rpb24oY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgX2NsaWVudElkOiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZ3JhbnRJbXBsaWNpdFJlYWRzRm9yT3V0Z29pbmdBY3Rpb24oYWN0aW9uKTtcblx0XHR0aGlzLl9zZW5kTm90aWZpY2F0aW9uKCdkaXNwYXRjaEFjdGlvbicsIHsgY2hhbm5lbCwgY2xpZW50U2VxLCBhY3Rpb24gfSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHNlc3Npb24gb24gdGhlIHJlbW90ZSBhZ2VudCBob3N0LlxuXHQgKi9cblx0Y3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNvbmZpZz8ucHJvdmlkZXI7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY3JlYXRlIHJlbW90ZSBhZ2VudCBob3N0IHNlc3Npb24gd2l0aG91dCBhIHByb3ZpZGVyLicpO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gY29uZmlnPy5zZXNzaW9uID8/IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIsIGdlbmVyYXRlVXVpZCgpKTtcblx0XHRpZiAoY29uZmlnPy5hY3RpdmVDbGllbnQ/LmN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHR0aGlzLl9ncmFudEltcGxpY2l0UmVhZHNGb3JDdXN0b21pemF0aW9ucyhjb25maWcuYWN0aXZlQ2xpZW50LmN1c3RvbWl6YXRpb25zKTtcblx0XHR9XG5cdFx0Ly8gVXNlIGAudGhlbmAgKG5vdCBgYXN5bmNgKSBzbyB0aGUgdHJhY2tlZCBwcm9taXNlIGFuZCB0aGUgcmV0dXJuZWQgcHJvbWlzZSBhcmUgdGhlIHNhbWUgb2JqZWN0IFx1MjAxNCBjYWxsZXJzXG5cdFx0Ly8gYXdhaXRpbmcgdmlhIGBnZXRJbmZsaWdodFNlc3Npb25DcmVhdGVgIHJlc3VtZSBvbiB0aGUgc2FtZSBtaWNyb3Rhc2sgcXVldWUgYXMgZGlyZWN0IGBjcmVhdGVTZXNzaW9uKClgIGF3YWl0ZXJzLlxuXHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLl9zZW5kUmVxdWVzdCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdF9tZXRhOiBjb25maWc/Ll9tZXRhLFxuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGNvbmZpZz8ud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZCA9PiBmcm9tQWdlbnRIb3N0VXJpKGQpLnRvU3RyaW5nKCkpLFxuXHRcdFx0Zm9yazogY29uZmlnPy5mb3JrID8geyBzZXNzaW9uOiBmcm9tQWdlbnRIb3N0VXJpKGNvbmZpZy5mb3JrLnNlc3Npb24pLnRvU3RyaW5nKCksIHR1cm5JZDogY29uZmlnLmZvcmsudHVybklkIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWc6IGNvbmZpZz8uY29uZmlnLFxuXHRcdFx0YWN0aXZlQ2xpZW50OiBjb25maWc/LmFjdGl2ZUNsaWVudCxcblx0XHRcdHByb2dyZXNzVG9rZW46IGNvbmZpZz8ucHJvZ3Jlc3NUb2tlbixcblx0XHR9KS50aGVuKCgpID0+IHNlc3Npb24pO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIudHJhY2tTZXNzaW9uQ3JlYXRlKHNlc3Npb24sIHByb21pc2UpO1xuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVNlc3Npb25Db25maWcocGFyYW1zOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ3Jlc29sdmVTZXNzaW9uQ29uZmlnJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRwcm92aWRlcjogcGFyYW1zLnByb3ZpZGVyLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcGFyYW1zLndvcmtpbmdEaXJlY3RvcnkgPyBmcm9tQWdlbnRIb3N0VXJpKHBhcmFtcy53b3JraW5nRGlyZWN0b3J5KS50b1N0cmluZygpIDogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlnOiBwYXJhbXMuY29uZmlnLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHBhcmFtczogSUFnZW50U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ3Nlc3Npb25Db25maWdDb21wbGV0aW9ucycsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cHJvdmlkZXI6IHBhcmFtcy5wcm92aWRlcixcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHBhcmFtcy53b3JraW5nRGlyZWN0b3J5ID8gZnJvbUFnZW50SG9zdFVyaShwYXJhbXMud29ya2luZ0RpcmVjdG9yeSkudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCxcblx0XHRcdGNvbmZpZzogcGFyYW1zLmNvbmZpZyxcblx0XHRcdHByb3BlcnR5OiBwYXJhbXMucHJvcGVydHksXG5cdFx0XHRxdWVyeTogcGFyYW1zLnF1ZXJ5LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgY29tcGxldGlvbnMocGFyYW1zOiBDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8Q29tcGxldGlvbnNSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ2NvbXBsZXRpb25zJywgcGFyYW1zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIGFuIGFwcGxpY2F0aW9uLWxldmVsIHBpbmcgYW5kIHdhaXQgZm9yIHRoZSBzZXJ2ZXIncyByZXNwb25zZS5cblx0ICogVXNlZCBieSB7QGxpbmsgX3dhdGNoZG9nVGlja30gdG8ga2VlcCBpZGxlIGNvbm5lY3Rpb25zIHVuZGVyXG5cdCAqIHdhdGNoZG9nIHN1cGVydmlzaW9uOyBzYWZlIHRvIGNhbGwgZnJvbSBleHRlcm5hbCBjb2RlIGFzIHdlbGwuXG5cdCAqXG5cdCAqIFRoZSByZXR1cm5lZCBwcm9taXNlIHJlamVjdHMgd2l0aCBhIHtAbGluayBQcm90b2NvbEVycm9yfSBpZiB0aGVcblx0ICogY29ubmVjdGlvbiBjbG9zZXMgYmVmb3JlIGEgcmVzcG9uc2UgYXJyaXZlcy5cblx0ICovXG5cdGFzeW5jIHBpbmcoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fc2VuZFJlcXVlc3QoJ3BpbmcnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHRyaWdnZXIgY2hhcmFjdGVycyBjYXB0dXJlZCBmcm9tIHRoZSBgaW5pdGlhbGl6ZWAgaGFuZHNoYWtlLlxuXHQgKiBFbXB0eSB3aGVuIHRoZSByZW1vdGUgaG9zdCBkaWQgbm90IGFubm91bmNlIGFueS5cblx0ICovXG5cdGFzeW5jIGdldENvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycygpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPiB7XG5cdFx0d2hpbGUgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RpbmcpIHtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0aGlzLm9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlKTtcblx0XHR9XG5cdFx0c3dpdGNoICh0aGlzLl9zdGF0ZS5raW5kKSB7XG5cdFx0XHRjYXNlIEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZTpcblx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkOlxuXHRcdFx0XHR0aHJvdyB0aGlzLl9zdGF0ZS5lcnJvcjtcblx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkOlxuXHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3Rpbmc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9pbml0aWFsaXplUmVzdWx0LmdldCgpPy5jb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMgPz8gW107XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEF1dGhlbnRpY2F0ZSB3aXRoIHRoZSByZW1vdGUgYWdlbnQgaG9zdCB1c2luZyBhIHNwZWNpZmljIHNjaGVtZS5cblx0ICovXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShwYXJhbXM6IEF1dGhlbnRpY2F0ZVBhcmFtcyk6IFByb21pc2U8QXV0aGVudGljYXRlUmVzdWx0PiB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZFBhcmFtczogQXV0aGVudGljYXRlUGFyYW1zID0ge1xuXHRcdFx0Li4ucGFyYW1zLFxuXHRcdFx0c2NvcGVzOiBwYXJhbXMuc2NvcGVzID8gWy4uLm5ldyBTZXQocGFyYW1zLnNjb3BlcyldLnNvcnQoKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdhdXRoZW50aWNhdGUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdC4uLm5vcm1hbGl6ZWRQYXJhbXMsXG5cdFx0XHRzY29wZXM6IG5vcm1hbGl6ZWRQYXJhbXMuc2NvcGVzID8gWy4uLm5vcm1hbGl6ZWRQYXJhbXMuc2NvcGVzXSA6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRjb25zdCBrZXkgPSBgJHtub3JtYWxpemVkUGFyYW1zLnJlc291cmNlfVxcMCR7SlNPTi5zdHJpbmdpZnkobm9ybWFsaXplZFBhcmFtcy5zY29wZXMgPz8gW10pfWA7XG5cdFx0aWYgKHBhcmFtcy50b2tlbikge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb24uc2V0KGtleSwgbm9ybWFsaXplZFBhcmFtcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBhdXRoZW50aWNhdGVkOiB0cnVlIH07XG5cdH1cblxuXHQvKipcblx0ICogR3JhY2VmdWxseSBzaHV0IGRvd24gYWxsIHNlc3Npb25zIG9uIHRoZSByZW1vdGUgaG9zdC5cblx0ICovXG5cdGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRFeHRlbnNpb25SZXF1ZXN0KCdzaHV0ZG93bicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgdGhlIGVuZHBvaW50cyB0aGUgcmVtb3RlIGFnZW50IGhvc3Qgc3VnZ2VzdHMgcHJvYmluZyBmb3IgY29ubmVjdGl2aXR5LlxuXHQgKi9cblx0YXN5bmMgZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbygpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRFeHRlbnNpb25SZXF1ZXN0KCdnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvJyk7XG5cdH1cblxuXHRhc3luYyBnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcygpOiBQcm9taXNlPHJlYWRvbmx5IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljc1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRFeHRlbnNpb25SZXF1ZXN0KCdnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2JlIGNvbm5lY3Rpdml0eSBmcm9tIHRoZSByZW1vdGUgYWdlbnQgaG9zdCB0byBhIHNpbmdsZSBgdXJsYC5cblx0ICovXG5cdGFzeW5jIGRpYWdub3N0aWNzRmV0Y2godXJsOiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZEV4dGVuc2lvblJlcXVlc3QoJ2RpYWdub3N0aWNzRmV0Y2gnLCB7IHVybCB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIGEgc2Vzc2lvbiBvbiB0aGUgcmVtb3RlIGFnZW50IGhvc3QuXG5cdCAqL1xuXHRhc3luYyBkaXNwb3NlU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdCgnZGlzcG9zZVNlc3Npb24nLCB7IGNoYW5uZWw6IHNlc3Npb24udG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdjcmVhdGVDaGF0Jywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0Y2hhdDogY2hhdC50b1N0cmluZygpLFxuXHRcdFx0Li4uKG9wdGlvbnM/LmZvcmsgPyB7XG5cdFx0XHRcdHNvdXJjZTogeyBraW5kOiBDaGF0U291cmNlS2luZC5Gb3JrLCBjaGF0OiBvcHRpb25zLmZvcmsuc291cmNlLnRvU3RyaW5nKCksIHR1cm5JZDogb3B0aW9ucy5mb3JrLnR1cm5JZCB9XG5cdFx0XHR9IDoge30pLFxuXHRcdFx0Li4uKG9wdGlvbnM/LnNpZGVDaGF0ID8ge1xuXHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRraW5kOiBDaGF0U291cmNlS2luZC5TaWRlQ2hhdCxcblx0XHRcdFx0XHRjaGF0OiBvcHRpb25zLnNpZGVDaGF0LnNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHR1cm5JZDogb3B0aW9ucy5zaWRlQ2hhdC50dXJuSWQsXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMuc2lkZUNoYXQuc2VsZWN0aW9uID8geyBzZWxlY3Rpb246IG9wdGlvbnMuc2lkZUNoYXQuc2VsZWN0aW9uIH0gOiB7fSksXG5cdFx0XHRcdH1cblx0XHRcdH0gOiB7fSksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlQ2hhdChjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdCgnZGlzcG9zZUNoYXQnLCB7IGNoYW5uZWw6IGNoYXQudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgdGVybWluYWwgb24gdGhlIHJlbW90ZSBhZ2VudCBob3N0LlxuXHQgKi9cblx0YXN5bmMgY3JlYXRlVGVybWluYWwocGFyYW1zOiBDcmVhdGVUZXJtaW5hbFBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdjcmVhdGVUZXJtaW5hbCcsIHBhcmFtcyk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZSBhIHRlcm1pbmFsIG9uIHRoZSByZW1vdGUgYWdlbnQgaG9zdC5cblx0ICovXG5cdGFzeW5jIGRpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fc2VuZFJlcXVlc3QoJ2Rpc3Bvc2VUZXJtaW5hbCcsIHsgY2hhbm5lbDogdGVybWluYWwudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdGFzeW5jIGludm9rZUNoYW5nZXNldE9wZXJhdGlvbihwYXJhbXM6IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblBhcmFtcyk6IFByb21pc2U8SW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0PiB7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24nLCBwYXJhbXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSByZXF1ZXN0IG9uIGFuIGBtY3A6Ly9gIEFIUCBzaWRlIGNoYW5uZWwuIFRoZSBhZ2VudC1ob3N0XG5cdCAqIHJvdXRlcyBieSBgcGFyYW1zLmNoYW5uZWxgIHNvIHdlIGluamVjdCBpdCBhdXRvbWF0aWNhbGx5LlxuXHQgKi9cblx0YXN5bmMgaGFuZGxlTWNwUmVxdWVzdChjaGFubmVsOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2Rpc3BhdGNoUmVxdWVzdDx1bmtub3duPihtZXRob2QsIHsgLi4uKHBhcmFtcyA/PyB7fSksIGNoYW5uZWwgfSk7XG5cdH1cblxuXHQvKipcblx0ICogTGlzdCBhbGwgc2Vzc2lvbnMgZnJvbSB0aGUgcmVtb3RlIGFnZW50IGhvc3QuXG5cdCAqL1xuXHRhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdHJldHVybiByZXN1bHQuaXRlbXMubWFwKChzOiBTZXNzaW9uU3VtbWFyeSkgPT4gKHtcblx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzLnJlc291cmNlKSxcblx0XHRcdHN0YXJ0VGltZTogRGF0ZS5wYXJzZShzLmNyZWF0ZWRBdCksXG5cdFx0XHRtb2RpZmllZFRpbWU6IERhdGUucGFyc2Uocy5tb2RpZmllZEF0KSxcblx0XHRcdC4uLihzLnByb2plY3QgPyB7XG5cdFx0XHRcdHByb2plY3Q6IHtcblx0XHRcdFx0XHR1cmk6IHRoaXMuX3RvTG9jYWxQcm9qZWN0VXJpKFVSSS5wYXJzZShzLnByb2plY3QudXJpKSksXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6IHMucHJvamVjdC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0fVxuXHRcdFx0fSA6IHt9KSxcblx0XHRcdHN1bW1hcnk6IHMudGl0bGUsXG5cdFx0XHRzdGF0dXM6IHMuc3RhdHVzLFxuXHRcdFx0YWN0aXZpdHk6IHMuYWN0aXZpdHksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB0eXBlb2Ygcy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSA9PT0gJ3N0cmluZycgPyB0b0FnZW50SG9zdFVyaShVUkkucGFyc2Uocy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSksIHRoaXMuX2Nvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzLndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gdG9BZ2VudEhvc3RVcmkoVVJJLnBhcnNlKGQpLCB0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5KSksXG5cdFx0XHRjaGFuZ2VzOiBzLmNoYW5nZXMsXG5cdFx0XHQvLyBDYXJyeSBkdXJhYmxlIGhvc3QgcHJvdmVuYW5jZSBmb3Igc2Vzc2lvbnMgZmlyc3QgbWF0ZXJpYWxpemVkIGZyb20gYSBsaXN0aW5nLlxuXHRcdFx0Li4uKHMuX21ldGEgIT09IHVuZGVmaW5lZCA/IHsgX21ldGE6IHMuX21ldGEgfSA6IHt9KSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF90b0xvY2FsUHJvamVjdFVyaSh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0cmV0dXJuIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHRvQWdlbnRIb3N0VXJpKHVyaSwgdGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1cmk7XG5cdH1cblxuXHQvKipcblx0ICogSW5zcGVjdCBhbiBvdXRnb2luZyBjbGllbnQtZGlzcGF0Y2hlZCBhY3Rpb24gYW5kIGdyYW50IGltcGxpY2l0IHJlYWRzIGZvclxuXHQgKiByZXNvdXJjZXMgdGhhdCB0aGUgaG9zdCB3aWxsIG5lZWQgdG8gcmVhZCBhZnRlciByZWNlaXZpbmcgdGhlIGFjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2dyYW50SW1wbGljaXRSZWFkc0Zvck91dGdvaW5nQWN0aW9uKGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudENoYW5nZXNldEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQ6XG5cdFx0XHRcdGlmIChhY3Rpb24uYWN0aXZlQ2xpZW50LmN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRcdFx0dGhpcy5fZ3JhbnRJbXBsaWNpdFJlYWRzRm9yQ3VzdG9taXphdGlvbnMoYWN0aW9uLmFjdGl2ZUNsaWVudC5jdXN0b21pemF0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkOlxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldDpcblx0XHRcdFx0dGhpcy5fZ3JhbnRJbXBsaWNpdFJlYWRzRm9yTWVzc2FnZShhY3Rpb24ubWVzc2FnZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dyYW50SW1wbGljaXRSZWFkc0Zvck1lc3NhZ2UobWVzc2FnZTogTWVzc2FnZSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgYXR0YWNobWVudCBvZiBtZXNzYWdlLmF0dGFjaG1lbnRzID8/IFtdKSB7XG5cdFx0XHRpZiAoYXR0YWNobWVudC50eXBlICE9PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9ncmFudEltcGxpY2l0UmVhZChVUkkucGFyc2UoYXR0YWNobWVudC51cmkpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXIgaW1wbGljaXQgcmVhZCBncmFudHMgZm9yIGVhY2ggY3VzdG9taXphdGlvbiBVUkkgdGhhdCB3ZSBhcmVcblx0ICogYWJvdXQgdG8gc2VuZCB0byB0aGUgaG9zdC4gVGhlIGhvc3QgbmVlZHMgdG8gcmVhZCB0aGVzZSB0byBtYXRlcmlhbGl6ZVxuXHQgKiB0aGUgY3VzdG9taXphdGlvbiwgYnV0IHNob3VsZCBub3QgbmVlZCB0byB3cml0ZSB0aGVtLiBHcmFudHMgYXJlXG5cdCAqIGRlZHVwZWQgcGVyIGNvbm5lY3Rpb24gYW5kIHJldm9rZWQgd2hlbiB0aGUgY29ubmVjdGlvbiBjbG9zZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9ncmFudEltcGxpY2l0UmVhZHNGb3JDdXN0b21pemF0aW9ucyhyZWZzOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiByZWZzKSB7XG5cdFx0XHRsZXQgdXJpOiBVUkk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR1cmkgPSBVUkkucGFyc2UocmVmLnVyaSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ncmFudEltcGxpY2l0UmVhZChkaXJuYW1lKHVyaSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dyYW50SW1wbGljaXRSZWFkKHVyaTogVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2dyYW50ZWRJbXBsaWNpdFJlYWRVcmlzLmhhcyh1cmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2dyYW50ZWRJbXBsaWNpdFJlYWRVcmlzLmFkZCh1cmkpO1xuXHRcdHRoaXMuX2ltcGxpY2l0UmVhZEdyYW50cy5hZGQodGhpcy5fcmVzb3VyY2VTZXJ2aWNlLmdyYW50SW1wbGljaXRSZWFkKHRoaXMuX3Jlc291cmNlSWRlbnRpdHksIHVyaSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgdGhlIGNvbnRlbnRzIG9mIGEgZGlyZWN0b3J5IG9uIHRoZSByZW1vdGUgaG9zdCdzIGZpbGVzeXN0ZW0uXG5cdCAqL1xuXHRhc3luYyByZXNvdXJjZUxpc3QodXJpOiBVUkkpOiBQcm9taXNlPENvbW1hbmRNYXBbJ3Jlc291cmNlTGlzdCddWydyZXN1bHQnXT4ge1xuXHRcdHJldHVybiBhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdCgncmVzb3VyY2VMaXN0JywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiB1cmkudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkIHRoZSBjb250ZW50IG9mIGEgcmVzb3VyY2Ugb24gdGhlIHJlbW90ZSBob3N0LlxuXHQgKi9cblx0YXN5bmMgcmVzb3VyY2VSZWFkKHVyaTogVVJJKTogUHJvbWlzZTxDb21tYW5kTWFwWydyZXNvdXJjZVJlYWQnXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ3Jlc291cmNlUmVhZCcsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogdXJpLnRvU3RyaW5nKCkgfSk7XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZVdyaXRlKHBhcmFtczogQ29tbWFuZE1hcFsncmVzb3VyY2VXcml0ZSddWydwYXJhbXMnXSk6IFByb21pc2U8Q29tbWFuZE1hcFsncmVzb3VyY2VXcml0ZSddWydyZXN1bHQnXT4ge1xuXHRcdHJldHVybiB0aGlzLl9zZW5kUmVxdWVzdCgncmVzb3VyY2VXcml0ZScsIHBhcmFtcyk7XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZUNvcHkocGFyYW1zOiBDb21tYW5kTWFwWydyZXNvdXJjZUNvcHknXVsncGFyYW1zJ10pOiBQcm9taXNlPENvbW1hbmRNYXBbJ3Jlc291cmNlQ29weSddWydyZXN1bHQnXT4ge1xuXHRcdHJldHVybiB0aGlzLl9zZW5kUmVxdWVzdCgncmVzb3VyY2VDb3B5JywgcGFyYW1zKTtcblx0fVxuXG5cdGFzeW5jIHJlc291cmNlRGVsZXRlKHBhcmFtczogQ29tbWFuZE1hcFsncmVzb3VyY2VEZWxldGUnXVsncGFyYW1zJ10pOiBQcm9taXNlPENvbW1hbmRNYXBbJ3Jlc291cmNlRGVsZXRlJ11bJ3Jlc3VsdCddPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRSZXF1ZXN0KCdyZXNvdXJjZURlbGV0ZScsIHBhcmFtcyk7XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZU1vdmUocGFyYW1zOiBDb21tYW5kTWFwWydyZXNvdXJjZU1vdmUnXVsncGFyYW1zJ10pOiBQcm9taXNlPENvbW1hbmRNYXBbJ3Jlc291cmNlTW92ZSddWydyZXN1bHQnXT4ge1xuXHRcdHJldHVybiB0aGlzLl9zZW5kUmVxdWVzdCgncmVzb3VyY2VNb3ZlJywgcGFyYW1zKTtcblx0fVxuXG5cdGFzeW5jIHJlc291cmNlUmVzb2x2ZShwYXJhbXM6IENvbW1hbmRNYXBbJ3Jlc291cmNlUmVzb2x2ZSddWydwYXJhbXMnXSk6IFByb21pc2U8Q29tbWFuZE1hcFsncmVzb3VyY2VSZXNvbHZlJ11bJ3Jlc3VsdCddPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRSZXF1ZXN0KCdyZXNvdXJjZVJlc29sdmUnLCBwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgcmVzb3VyY2VNa2RpcihwYXJhbXM6IENvbW1hbmRNYXBbJ3Jlc291cmNlTWtkaXInXVsncGFyYW1zJ10pOiBQcm9taXNlPENvbW1hbmRNYXBbJ3Jlc291cmNlTWtkaXInXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ3Jlc291cmNlTWtkaXInLCBwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlUmVzb3VyY2VXYXRjaChwYXJhbXM6IENvbW1hbmRNYXBbJ2NyZWF0ZVJlc291cmNlV2F0Y2gnXVsncGFyYW1zJ10pOiBQcm9taXNlPENvbW1hbmRNYXBbJ2NyZWF0ZVJlc291cmNlV2F0Y2gnXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCBwYXJhbXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlbmllbmNlIHdyYXBwZXIgdXNlZCBieSB7QGxpbmsgQUhQRmlsZVN5c3RlbVByb3ZpZGVyLndhdGNofTpcblx0ICogcnVucyBgY3JlYXRlUmVzb3VyY2VXYXRjaGAgKyBgc3Vic2NyaWJlYCBhbmQgcmV0dXJucyBhIGhhbmRsZSB0aGF0XG5cdCAqIHN1cmZhY2VzIGByZXNvdXJjZVdhdGNoL2NoYW5nZWRgIGVudmVsb3BlcyBhc1xuXHQgKiB7QGxpbmsgSUZpbGVDaGFuZ2V9W10gZXZlbnRzLiBEaXNwb3NpbmcgdGhlIGhhbmRsZSB1bnN1YnNjcmliZXNcblx0ICogdGhlIHdhdGNoIGNoYW5uZWwuXG5cdCAqL1xuXHR3YXRjaFJlc291cmNlKHBhcmFtczogQ29tbWFuZE1hcFsnY3JlYXRlUmVzb3VyY2VXYXRjaCddWydwYXJhbXMnXSk6IFByb21pc2U8SVJlbW90ZVdhdGNoSGFuZGxlPiB7XG5cdFx0cmV0dXJuIGNyZWF0ZVJlbW90ZVdhdGNoSGFuZGxlKHtcblx0XHRcdGNyZWF0ZVJlc291cmNlV2F0Y2g6IHAgPT4gdGhpcy5jcmVhdGVSZXNvdXJjZVdhdGNoKHApLFxuXHRcdFx0c3Vic2NyaWJlOiB1cmkgPT4gdGhpcy5zdWJzY3JpYmUodXJpKSxcblx0XHRcdHVuc3Vic2NyaWJlOiB1cmkgPT4gdGhpcy51bnN1YnNjcmliZSh1cmkpLFxuXHRcdFx0b25EaWRBY3Rpb246IHRoaXMub25EaWRBY3Rpb24sXG5cdFx0fSwgcGFyYW1zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmlnZ2VyIHRoZSBDTEktbWFuYWdlZCB1cGdyYWRlIGZsb3cgZm9yIHRoaXMgYWdlbnQgaG9zdCB1c2luZyB0aGVcblx0ICogbWV0aG9kIG5hbWUgYWR2ZXJ0aXNlZCBieSB0aGUgc2VydmVyICh0eXBpY2FsbHlcblx0ICoge0BsaW5rIFZTQ09ERV9VUEdSQURFX01FVEhPRH0pLiBDYWxsYWJsZSBiZWZvcmUge0BsaW5rIGNvbm5lY3R9IGhhc1xuXHQgKiBjb21wbGV0ZWQgXHUyMDE0IHR5cGljYWxseSB1c2VkIHdoZW4gdGhlIGhvc3QgaGFzIGp1c3QgcmVqZWN0ZWQgb3VyXG5cdCAqIGBpbml0aWFsaXplYCB3aXRoIGFuIGBVbnN1cHBvcnRlZFByb3RvY29sVmVyc2lvbmAgZXJyb3IuIFRoZVxuXHQgKiB0cmFuc3BvcnQgc3RheXMgb3BlbiBhZnRlciB0aGUgcmVqZWN0aW9uLCBzbyB0aGUgZXh0ZW5zaW9uIHJlcXVlc3Rcblx0ICogcmlkZXMgb3ZlciBpdCB3aXRob3V0IGEgc3BlY2lhbCBvdXQtb2YtYmFuZCBwYXRoLlxuXHQgKlxuXHQgKiBUaGUgcmVzdWx0IG1pcnJvcnMgdGhlIENMSSdzIEhUVFAgcmVzcG9uc2U6IG9rIGZsYWcsIHdoZXRoZXIgdGhlXG5cdCAqIHVwZ3JhZGUgaXMgbmVlZGVkIC8gc3RhcnRlZCwgcnVubmluZy9sYXRlc3QgY29tbWl0cy5cblx0ICovXG5cdHRyaWdnZXJWc2NvZGVVcGdyYWRlKG1ldGhvZDogc3RyaW5nKTogUHJvbWlzZTxJVnNjb2RlVXBncmFkZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9kaXNwYXRjaFJlcXVlc3Q8SVZzY29kZVVwZ3JhZGVSZXN1bHQ+KG1ldGhvZCwge30sIHsgYWxsb3dJbmNvbXBhdGlibGVVcGdyYWRlOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlTWVzc2FnZShtc2c6IFByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQpIHtcblx0XHRcdC8vIEFmdGVyIGNsb3NlLCB0aGUgdHJhbnNwb3J0IG1heSBzdGlsbCBlbWl0IGxhdGUgbWVzc2FnZXMgKGUuZy5cblx0XHRcdC8vIGJlY2F1c2UgdGhlIHNhbWUgc2hhcmVkIGV2ZW50IHNvdXJjZSBpcyBhbHNvIGZlZWRpbmcgYSBuZXdlclxuXHRcdFx0Ly8gdHJhbnNwb3J0IGZvciB0aGUgc2FtZSBjb25uZWN0aW9uSWQpLiBEcm9wIHRoZW0gc28gdGhleSBjYW4ndFxuXHRcdFx0Ly8gdHJpZ2dlciBhbnkgc2lkZSBlZmZlY3RzLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFueSBpbmJvdW5kIHRyYWZmaWMgXHUyMDE0IGluY2x1ZGluZyB0aGlzIG1lc3NhZ2UgXHUyMDE0IGlzIGV2aWRlbmNlIHRoZVxuXHRcdC8vIHRyYW5zcG9ydCBpcyBzdGlsbCBhbGl2ZS4gUmVzZXQgdGhlIGxpdmVuZXNzIHRpbWVycyBiZWZvcmVcblx0XHQvLyBkaXNwYXRjaCBzbyB0aGV5J3JlIGNvbnNpc3RlbnQgZXZlbiBpZiBhIGhhbmRsZXIgc3luY2hyb25vdXNseVxuXHRcdC8vIHNjaGVkdWxlcyB3b3JrLlxuXHRcdHRoaXMuX2xhc3RSZWFkVGltZSA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fcmVzZXRMaXZlbmVzc1RpbWVycygpO1xuXG5cdFx0aWYgKGlzSnNvblJwY1JlcXVlc3QobXNnKSkge1xuXHRcdFx0dGhpcy5faGFuZGxlUmV2ZXJzZVJlcXVlc3QobXNnLmlkLCBtc2cubWV0aG9kLCBtc2cucGFyYW1zKTtcblx0XHR9IGVsc2UgaWYgKGlzSnNvblJwY1Jlc3BvbnNlKG1zZykpIHtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KG1zZy5pZCk7XG5cdFx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKG1zZy5pZCk7XG5cdFx0XHRcdGlmIChoYXNLZXkobXNnLCB7IGVycm9yOiB0cnVlIH0pKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3Nob3VsZExvZ0ZhaWxlZFJlcXVlc3QocGVuZGluZywgbXNnLmVycm9yKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFJlcXVlc3QgJHttc2cuaWR9IGZhaWxlZDpgLCBtc2cuZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwZW5kaW5nLmRlZmVycmVkLmVycm9yKHRoaXMuX3RvUHJvdG9jb2xFcnJvcihtc2cuZXJyb3IpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwZW5kaW5nLmRlZmVycmVkLmNvbXBsZXRlKG1zZy5yZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtSZW1vdGVBZ2VudEhvc3RQcm90b2NvbF0gUmVjZWl2ZWQgcmVzcG9uc2UgZm9yIHVua25vd24gcmVxdWVzdCBpZCAke21zZy5pZH1gKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzSnNvblJwY05vdGlmaWNhdGlvbihtc2cpKSB7XG5cdFx0XHRzd2l0Y2ggKG1zZy5tZXRob2QpIHtcblx0XHRcdFx0Y2FzZSAnYWN0aW9uJzoge1xuXHRcdFx0XHRcdC8vIFByb3RvY29sIGVudmVsb3BlIFx1MjE5MiBWUyBDb2RlIGVudmVsb3BlIChzdXBlcnNldCBvZiBhY3Rpb24gdHlwZXMpXG5cdFx0XHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBtc2cucGFyYW1zO1xuXHRcdFx0XHRcdHRoaXMuX3NlcnZlclNlcSA9IE1hdGgubWF4KHRoaXMuX3NlcnZlclNlcSwgZW52ZWxvcGUuc2VydmVyU2VxKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEFjdGlvbi5maXJlKGVudmVsb3BlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdyb290L3Nlc3Npb25BZGRlZCc6XG5cdFx0XHRcdGNhc2UgJ3Jvb3Qvc2Vzc2lvblJlbW92ZWQnOlxuXHRcdFx0XHRjYXNlICdyb290L3Nlc3Npb25TdW1tYXJ5Q2hhbmdlZCc6XG5cdFx0XHRcdGNhc2UgJ3Jvb3QvcHJvZ3Jlc3MnOlxuXHRcdFx0XHRjYXNlICdhdXRoL3JlcXVpcmVkJzoge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtSZW1vdGVBZ2VudEhvc3RQcm90b2NvbF0gTm90aWZpY2F0aW9uOiAke21zZy5tZXRob2R9YCk7XG5cdFx0XHRcdFx0Ly8gVGhlIGNhc2UgbmFycm93cyBgbXNnLm1ldGhvZGAgdG8gYSBzaW5nbGUgbGl0ZXJhbDsgdGhlIG1hdGNoaW5nIHBhcmFtc1xuXHRcdFx0XHRcdC8vIHNoYXBlIGlzIHBhaXJlZCB3aXRoIHRoYXQgbGl0ZXJhbCBieSB0aGUge0BsaW5rIFNlcnZlck5vdGlmaWNhdGlvbk1hcH1cblx0XHRcdFx0XHQvLyBkZWZpbml0aW9uLCBzbyBzcHJlYWRpbmcgaXMgc2FmZS5cblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0XHRcdFx0dGhpcy5fb25EaWROb3RpZmljYXRpb24uZmlyZSh7IHR5cGU6IG1zZy5tZXRob2QsIC4uLm1zZy5wYXJhbXMgfSBhcyBJTm90aWZpY2F0aW9uKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdvdGxwL2V4cG9ydExvZ3MnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVjZWl2ZU90bHBMb2dzLmZpcmUobXNnLnBhcmFtcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ290bHAvZXhwb3J0VHJhY2VzJzpcblx0XHRcdFx0Y2FzZSAnb3RscC9leHBvcnRNZXRyaWNzJzpcblx0XHRcdFx0XHQvLyBOb3QgcmVjb3JkZWQsIHlldFxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0Y29uc3QgcmF3Q2hhbm5lbCA9IG1zZy5wYXJhbXMgJiYgdHlwZW9mIG1zZy5wYXJhbXMgPT09ICdvYmplY3QnXG5cdFx0XHRcdFx0XHQ/IChtc2cucGFyYW1zIGFzIHsgY2hhbm5lbD86IHVua25vd24gfSkuY2hhbm5lbFxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiByYXdDaGFubmVsID09PSAnc3RyaW5nJyAmJiByYXdDaGFubmVsLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnbWNwOi8nKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBjaGFubmVsOiBfY2hhbm5lbCwgLi4ucmVzdCB9ID0gbXNnLnBhcmFtcyBhcyB7IGNoYW5uZWw6IHN0cmluZztbazogc3RyaW5nXTogdW5rbm93biB9O1xuXHRcdFx0XHRcdFx0dGhpcy5fb25NY3BOb3RpZmljYXRpb24uZmlyZSh7IGNoYW5uZWw6IHJhd0NoYW5uZWwsIG1ldGhvZDogbXNnLm1ldGhvZCwgcGFyYW1zOiByZXN0IH0pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtSZW1vdGVBZ2VudEhvc3RQcm90b2NvbF0gVW5oYW5kbGVkIG1ldGhvZDogJHttc2cubWV0aG9kfWApO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBVbnJlY29nbml6ZWQgbWVzc2FnZTpgLCBKU09OLnN0cmluZ2lmeShtc2cpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDbG9zZShlcnJvcjogUHJvdG9jb2xFcnJvcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU3RvcCB0aGUgbGl2ZW5lc3MgdGltZXJzIHNvIHRoZXkgZG9uJ3Qga2VlcCB0aWNraW5nIG9uIGEgZGVhZFxuXHRcdC8vIGNvbm5lY3Rpb24gKHRoZSBjbGllbnQgbWF5IG91dGxpdmUgdGhlIGNsb3NlLCB3YWl0aW5nIHRvIGJlIHJlcGxhY2VkKS5cblx0XHR0aGlzLl9jYW5jZWxMaXZlbmVzc1RpbWVycygpO1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdGNvbnN0IHJlY29ubmVjdCA9IHRoaXMuX3N0YXRlLnJlY29ubmVjdDtcblx0XHRcdGlmIChyZWNvbm5lY3QudGltZW91dEhhbmRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dChyZWNvbm5lY3QudGltZW91dEhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlY29ubmVjdC5nYXRlLmlzU2V0dGxlZCkge1xuXHRcdFx0XHRyZWNvbm5lY3QuZ2F0ZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHQvLyBPdXRib3ggaXMgZHJvcHBlZCB3aGVuIHRoZSByZWNvbm5lY3Qgc3RhdGUgaXMgZGlzY2FyZGVkIGJ5IHRoZVxuXHRcdFx0Ly8gdHJhbnNpdGlvbiBiZWxvdy5cblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RpbmcpIHtcblx0XHRcdHRoaXMuX3N0YXRlLm91dGJveC5sZW5ndGggPSAwO1xuXHRcdH1cblx0XHR0aGlzLl9yZWplY3RQZW5kaW5nUmVxdWVzdHMoZXJyb3IpO1xuXHRcdHRoaXMuX2dyYW50ZWRJbXBsaWNpdFJlYWRVcmlzLmNsZWFyKCk7XG5cdFx0dGhpcy5faW1wbGljaXRSZWFkR3JhbnRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzb3VyY2VTZXJ2aWNlLmNvbm5lY3Rpb25DbG9zZWQodGhpcy5fcmVzb3VyY2VJZGVudGl0eSk7XG5cdFx0dGhpcy5fdHJhbnNpdGlvblRvKHsga2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkLCBlcnJvciB9KTtcblx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JhY2VDbG9zZTxUPihwcm9taXNlOiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHRoaXMuX3N0YXRlLmVycm9yKTtcblx0XHR9XG5cblx0XHRsZXQgY2xvc2VMaXN0ZW5lciA9IERpc3Bvc2FibGUuTm9uZTtcblx0XHRjb25zdCBjbG9zZVByb21pc2UgPSBuZXcgUHJvbWlzZTxuZXZlcj4oKF9yZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNsb3NlTGlzdGVuZXIgPSB0aGlzLm9uRGlkQ2xvc2UoKCkgPT4gcmVqZWN0KHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZCA/IHRoaXMuX3N0YXRlLmVycm9yIDogY29ubmVjdGlvbkNsb3NlZEVycm9yKHRoaXMuX2FkZHJlc3MpKSk7XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IFByb21pc2UucmFjZShbcHJvbWlzZSwgY2xvc2VQcm9taXNlXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsb3NlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHJldmVyc2UgUlBDIHJlcXVlc3RzIGZyb20gdGhlIHNlcnZlciAoZS5nLiByZXNvdXJjZUxpc3QsXG5cdCAqIHJlc291cmNlUmVhZCkuIFRoaW4gd2lyZSBhZGFwdGVyIFx1MjAxNCBkaXNwYXRjaGVzIGVhY2ggZnJhbWUgdG9cblx0ICoge0BsaW5rIElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2V9ICh3aGljaCBvd25zIGdhdGluZywgdmlydHVhbCByZWFkcyxcblx0ICogYW5kIHRoZSB1c2VyLXByb21wdCBmbG93KSBhbmQgdHJhbnNsYXRlcyByZXN1bHRzIC8gZXJyb3JzIGJhY2sgaW50b1xuXHQgKiBKU09OLVJQQyBmcmFtZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVSZXZlcnNlUmVxdWVzdChpZDogbnVtYmVyLCBtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Ly8gQ2FwdHVyZSB0aGUgdHJhbnNwb3J0IGF0IHJlcXVlc3QtZW50cnkgc28gYXN5bmMgaGFuZGxlcnMgKHBlcm1pc3Npb25cblx0XHQvLyBjaGVja3MsIGZpbGUgb3BzKSByZXBseSBvbiB0aGUgc2FtZSB0cmFuc3BvcnQgdGhlIHJlcXVlc3QgYXJyaXZlZCBvbi5cblx0XHQvLyBXaXRob3V0IHRoaXMsIGEgc29mdCByZWNvbm5lY3QgbWlkLWhhbmRsZXIgd291bGQgcm91dGUgdGhlIHJlc3BvbnNlXG5cdFx0Ly8gb250byBhIG5ldyB0cmFuc3BvcnQgd2l0aCBhIHN0YWxlIGlkIFx1MjAxNCBzdHJheSByZXNwb25zZSBhdCBiZXN0LCBpZFxuXHRcdC8vIGNvbGxpc2lvbiB3aXRoIGEgbmV3IHNlcnZlci1pc3N1ZWQgcmV2ZXJzZSBSUEMgYXQgd29yc3QuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gdGhpcy5fdHJhbnNwb3J0O1xuXHRcdGNvbnN0IHNlbmRSZXN1bHQgPSAocmVzdWx0OiB1bmtub3duKSA9PiB7XG5cdFx0XHR0cmFuc3BvcnQuc2VuZCh7IGpzb25ycGM6ICcyLjAnLCBpZCwgcmVzdWx0IH0pO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2VuZEVycm9yID0gKGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIEFnZW50SG9zdFJlc291cmNlUGVybWlzc2lvbkVycm9yKSB7XG5cdFx0XHRcdHRyYW5zcG9ydC5zZW5kKHtcblx0XHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXJyLm1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRkYXRhOiBlcnIucmVxdWVzdCA/IHsgcmVxdWVzdDogZXJyLnJlcXVlc3QgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZnNDb2RlID0gdG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiB1bmRlZmluZWQpO1xuXHRcdFx0bGV0IGNvZGUgPSAtMzIwMDA7XG5cdFx0XHRzd2l0Y2ggKGZzQ29kZSkge1xuXHRcdFx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQ6IGNvZGUgPSBBaHBFcnJvckNvZGVzLk5vdEZvdW5kOyBicmVhaztcblx0XHRcdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9uczogY29kZSA9IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZDsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVFeGlzdHM6IGNvZGUgPSBBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHM7IGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0dHJhbnNwb3J0LnNlbmQoeyBqc29ucnBjOiAnMi4wJywgaWQsIGVycm9yOiB7IGNvZGUsIG1lc3NhZ2U6IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSB9IH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBwID0gKHBhcmFtcyA/PyB7fSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0Y29uc3QgaWRlbnRpdHkgPSB0aGlzLl9yZXNvdXJjZUlkZW50aXR5O1xuXHRcdHZvaWQgKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN3aXRjaCAobWV0aG9kKSB7XG5cdFx0XHRcdFx0Y2FzZSAncmVzb3VyY2VMaXN0Jzoge1xuXHRcdFx0XHRcdFx0aWYgKCFwLnVyaSkgeyB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdXJpJyk7IH1cblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Jlc291cmNlU2VydmljZS5saXN0KGlkZW50aXR5LCBVUkkucGFyc2UocC51cmkgYXMgc3RyaW5nKSk7XG5cdFx0XHRcdFx0XHRzZW5kUmVzdWx0KHsgZW50cmllczogcmVzdWx0LmVudHJpZXMgfSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3Jlc291cmNlUmVhZCc6IHtcblx0XHRcdFx0XHRcdGlmICghcC51cmkpIHsgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHVyaScpOyB9XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvdXJjZVNlcnZpY2UucmVhZChpZGVudGl0eSwgVVJJLnBhcnNlKHAudXJpIGFzIHN0cmluZykpO1xuXHRcdFx0XHRcdFx0c2VuZFJlc3VsdCh7IGRhdGE6IGVuY29kZUJhc2U2NChyZXN1bHQuYnl0ZXMpLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLkJhc2U2NCB9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAncmVzb3VyY2VXcml0ZSc6IHtcblx0XHRcdFx0XHRcdGlmICghcC51cmkgfHwgcC5kYXRhID09PSB1bmRlZmluZWQpIHsgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHVyaSBvciBkYXRhJyk7IH1cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc291cmNlU2VydmljZS53cml0ZShpZGVudGl0eSwgcCBhcyB1bmtub3duIGFzIFBhcmFtZXRlcnM8dHlwZW9mIHRoaXMuX3Jlc291cmNlU2VydmljZS53cml0ZT5bMV0pO1xuXHRcdFx0XHRcdFx0c2VuZFJlc3VsdCh7fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3Jlc291cmNlRGVsZXRlJzoge1xuXHRcdFx0XHRcdFx0aWYgKCFwLnVyaSkgeyB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdXJpJyk7IH1cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc291cmNlU2VydmljZS5kZWwoaWRlbnRpdHksIHAgYXMgdW5rbm93biBhcyBQYXJhbWV0ZXJzPHR5cGVvZiB0aGlzLl9yZXNvdXJjZVNlcnZpY2UuZGVsPlsxXSk7XG5cdFx0XHRcdFx0XHRzZW5kUmVzdWx0KHt9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAncmVzb3VyY2VNb3ZlJzoge1xuXHRcdFx0XHRcdFx0aWYgKCFwLnNvdXJjZSB8fCAhcC5kZXN0aW5hdGlvbikgeyB0aHJvdyBuZXcgRXJyb3IoJ01pc3Npbmcgc291cmNlIG9yIGRlc3RpbmF0aW9uJyk7IH1cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc291cmNlU2VydmljZS5tb3ZlKGlkZW50aXR5LCBwIGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2YgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLm1vdmU+WzFdKTtcblx0XHRcdFx0XHRcdHNlbmRSZXN1bHQoe30pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdyZXNvdXJjZUNvcHknOiB7XG5cdFx0XHRcdFx0XHRpZiAoIXAuc291cmNlIHx8ICFwLmRlc3RpbmF0aW9uKSB7IHRocm93IG5ldyBFcnJvcignTWlzc2luZyBzb3VyY2Ugb3IgZGVzdGluYXRpb24nKTsgfVxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLmNvcHkoaWRlbnRpdHksIHAgYXMgdW5rbm93biBhcyBQYXJhbWV0ZXJzPHR5cGVvZiB0aGlzLl9yZXNvdXJjZVNlcnZpY2UuY29weT5bMV0pO1xuXHRcdFx0XHRcdFx0c2VuZFJlc3VsdCh7fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3Jlc291cmNlUmVzb2x2ZSc6IHtcblx0XHRcdFx0XHRcdGlmICghcC51cmkpIHsgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHVyaScpOyB9XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvdXJjZVNlcnZpY2UucmVzb2x2ZShpZGVudGl0eSwgcCBhcyB1bmtub3duIGFzIFBhcmFtZXRlcnM8dHlwZW9mIHRoaXMuX3Jlc291cmNlU2VydmljZS5yZXNvbHZlPlsxXSk7XG5cdFx0XHRcdFx0XHRzZW5kUmVzdWx0KHJlc3VsdCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3Jlc291cmNlTWtkaXInOiB7XG5cdFx0XHRcdFx0XHRpZiAoIXAudXJpKSB7IHRocm93IG5ldyBFcnJvcignTWlzc2luZyB1cmknKTsgfVxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLm1rZGlyKGlkZW50aXR5LCBwIGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2YgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLm1rZGlyPlsxXSk7XG5cdFx0XHRcdFx0XHRzZW5kUmVzdWx0KHt9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAncmVzb3VyY2VSZXF1ZXN0Jzoge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLnJlcXVlc3QoaWRlbnRpdHksIHAgYXMgdW5rbm93biBhcyBSZXNvdXJjZVJlcXVlc3RQYXJhbXMpO1xuXHRcdFx0XHRcdFx0XHRzZW5kUmVzdWx0KHt9KTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgQWdlbnRIb3N0UmVzb3VyY2VQZXJtaXNzaW9uRXJyb3IodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtSZW1vdGVBZ2VudEhvc3RQcm90b2NvbF0gVW5oYW5kbGVkIHJldmVyc2UgcmVxdWVzdDogJHttZXRob2R9YCk7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gbWV0aG9kOiAke21ldGhvZH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHNlbmRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdH1cblxuXHQvKiogU2VuZCBhIHR5cGVkIEpTT04tUlBDIG5vdGlmaWNhdGlvbiBmb3IgYSBwcm90b2NvbC1kZWZpbmVkIG1ldGhvZC4gKi9cblx0cHJpdmF0ZSBfc2VuZE5vdGlmaWNhdGlvbjxNIGV4dGVuZHMga2V5b2YgQ2xpZW50Tm90aWZpY2F0aW9uTWFwPihtZXRob2Q6IE0sIHBhcmFtczogQ2xpZW50Tm90aWZpY2F0aW9uTWFwW01dWydwYXJhbXMnXSk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbmROb3RpZmljYXRpb25NZXNzYWdlKG1ldGhvZCwgcGFyYW1zKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRFeHRlbnNpb25Ob3RpZmljYXRpb248TSBleHRlbmRzIGtleW9mIElSZW1vdGVBZ2VudEhvc3RFeHRlbnNpb25Ob3RpZmljYXRpb25NYXA+KG1ldGhvZDogTSwgcGFyYW1zOiBJUmVtb3RlQWdlbnRIb3N0RXh0ZW5zaW9uTm90aWZpY2F0aW9uTWFwW01dWydwYXJhbXMnXSwgc2VuZER1cmluZ1JlY29ubmVjdCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VuZE5vdGlmaWNhdGlvbk1lc3NhZ2UobWV0aG9kLCBwYXJhbXMsIHNlbmREdXJpbmdSZWNvbm5lY3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZE5vdGlmaWNhdGlvbk1lc3NhZ2UobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93biwgc2VuZER1cmluZ1JlY29ubmVjdCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZCB8fCB0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSB7IGpzb25ycGM6ICcyLjAnIGFzIGNvbnN0LCBtZXRob2QsIHBhcmFtcyB9IGFzIFByb3RvY29sTWVzc2FnZTtcblx0XHRpZiAoaXNDbGllbnRUcmFuc3BvcnQodGhpcy5fdHJhbnNwb3J0KSAmJiB0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0aW5nKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5vdXRib3gucHVzaChtZXNzYWdlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZyAmJiAhc2VuZER1cmluZ1JlY29ubmVjdCkge1xuXHRcdFx0Ly8gUXVldWUgZm9yIHRoZSBuZXcgdHJhbnNwb3J0IFx1MjAxNCBkcmFpbmVkIGJ5IHtAbGluayBfZHJhaW5BZnRlclJlY29ubmVjdH1cblx0XHRcdC8vIG9uY2UgdGhlIHNvZnQtcmVjb25uZWN0IGhhbmRzaGFrZSBjb21wbGV0ZXMuIFRoZSBvdXRib3ggcGVyc2lzdHNcblx0XHRcdC8vIGFjcm9zcyBmYWlsZWQgYXR0ZW1wdHMgc28gYSBtZXNzYWdlIHJpZGVzIHRocm91Z2ggcmV0cnkgY3ljbGVzXG5cdFx0XHQvLyByYXRoZXIgdGhhbiBiZWluZyBzaWxlbnRseSBkcm9wcGVkLlxuXHRcdFx0dGhpcy5fc3RhdGUucmVjb25uZWN0Lm91dGJveC5wdXNoKG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90cmFuc3BvcnQuc2VuZChtZXNzYWdlKTtcblx0fVxuXG5cdC8qKiBTZW5kIGEgdHlwZWQgSlNPTi1SUEMgcmVxdWVzdCBmb3IgYSBwcm90b2NvbC1kZWZpbmVkIG1ldGhvZC4gKi9cblx0cHJpdmF0ZSBfc2VuZFJlcXVlc3Q8TSBleHRlbmRzIGtleW9mIENvbW1hbmRNYXA+KG1ldGhvZDogTSwgcGFyYW1zOiBDb21tYW5kTWFwW01dWydwYXJhbXMnXSk6IFByb21pc2U8Q29tbWFuZE1hcFtNXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGlzcGF0Y2hSZXF1ZXN0PENvbW1hbmRNYXBbTV1bJ3Jlc3VsdCddPihtZXRob2QsIHBhcmFtcyk7XG5cdH1cblxuXHQvKiogU2VuZCBhIEpTT04tUlBDIHJlcXVlc3QgZm9yIGEgVlMgQ29kZSBleHRlbnNpb24gbWV0aG9kIChub3QgaW4gdGhlIHByb3RvY29sIHNwZWMpLiAqL1xuXHRwcml2YXRlIF9zZW5kRXh0ZW5zaW9uUmVxdWVzdDxNIGV4dGVuZHMga2V5b2YgSVJlbW90ZUFnZW50SG9zdEV4dGVuc2lvbkNvbW1hbmRNYXA+KG1ldGhvZDogTSwgcGFyYW1zPzogSVJlbW90ZUFnZW50SG9zdEV4dGVuc2lvbkNvbW1hbmRNYXBbTV1bJ3BhcmFtcyddKTogUHJvbWlzZTxJUmVtb3RlQWdlbnRIb3N0RXh0ZW5zaW9uQ29tbWFuZE1hcFtNXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGlzcGF0Y2hSZXF1ZXN0PElSZW1vdGVBZ2VudEhvc3RFeHRlbnNpb25Db21tYW5kTWFwW01dWydyZXN1bHQnXT4obWV0aG9kLCBwYXJhbXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGVsZW1ldHJ5TGV2ZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcGF0Y2hSb290Q29uZmlnKHsgW0FnZW50SG9zdFRlbGVtZXRyeUxldmVsQ29uZmlnS2V5XTogdGVsZW1ldHJ5TGV2ZWxUb0FnZW50SG9zdENvbmZpZ1ZhbHVlKGdldFRlbGVtZXRyeUxldmVsKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSkgfSk7XG5cdH1cblxuXHQvKiogTWVyZ2UgYSBwYXRjaCBpbnRvIHRoZSBhZ2VudCBob3N0J3Mgcm9vdCBjb25maWd1cmF0aW9uLiAqL1xuXHRwcml2YXRlIF9kaXNwYXRjaFJvb3RDb25maWcoY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdHRoaXMuZGlzcGF0Y2hBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWcsXG5cdFx0fSwgdGhpcy5fY2xpZW50SWQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5KCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc2FibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oRElTQUJMRV9SRVBPX0lORk9fVEVMRU1FVFJZX1NFVFRJTkdfSUQpID09PSB0cnVlO1xuXHRcdHRoaXMuX2Rpc3BhdGNoUm9vdENvbmZpZyh7IFtBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXldOiBkaXNhYmxlZCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkKCk6IHZvaWQge1xuXHRcdC8vIERlbGliZXJhdGVseSBvbiB0aGUgbWFudWFsLCB3b3Jrc3BhY2UtYXdhcmUgcGF0aCByYXRoZXIgdGhhbiBkZWNsYXJpbmdcblx0XHQvLyBgYWdlbnRIb3N0YCBvbiBpdHMgc2NoZW1hOiB0aGUgc2V0dGluZyBpcyBgcmVzdHJpY3RlZGAgYW5kIHNldHRhYmxlIHBlclxuXHRcdC8vIHdvcmtzcGFjZSwgYW5kIGl0cyBjb21wYW5pb24gcnVsZSBzZXQgKGB0ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNgKSBpc1xuXHRcdC8vIHdvcmtzcGFjZS1hd2FyZSB0b28uIFJlc29sdmluZyBvbmx5IHRoZSBnbG9iYWwgdmFsdWUgaGVyZSB3b3VsZCBsZXQgYVxuXHRcdC8vIHdvcmtzcGFjZSB0aGF0IHR1cm5lZCBhdXRvLWFwcHJvdmFsIG9mZiBzdGlsbCBoYXZlIGl0IGFwcGxpZWQuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9FTkFCTEVEX1NFVFRJTkdfSUQpICE9PSBmYWxzZTtcblx0XHR0aGlzLl9kaXNwYXRjaFJvb3RDb25maWcoeyBbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXldOiBlbmFibGVkIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3BhdGNoUm9vdENvbmZpZyh7IFtBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXldOiBnZXRBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWcodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMoc2VuZER1cmluZ1JlY29ubmVjdCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVybWlzc2lvbnMgPSB0aGlzLl9yZXNvdXJjZUlkZW50aXR5ID09PSBMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZXG5cdFx0XHQ/IHJlc29sdmVNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSlcblx0XHRcdDoge307XG5cdFx0dGhpcy5fc2VuZEV4dGVuc2lvbk5vdGlmaWNhdGlvbignc2V0Q2xpZW50TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMnLCB7IHBlcm1pc3Npb25zIH0sIHNlbmREdXJpbmdSZWNvbm5lY3QpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbW1vbiBwYXRoIGZvciBvdXRnb2luZyBKU09OLVJQQyByZXF1ZXN0czogcXVldWUgcHJlLWluaXRpYWxpemUgdHJhZmZpYyxcblx0ICogZ2F0ZSBvbiBhbnkgaW4tZmxpZ2h0IHJlY29ubmVjdCAodW5sZXNzIGV4cGxpY2l0bHkgYnlwYXNzZWQgZm9yIHRoZVxuXHQgKiBgcmVjb25uZWN0YCBSUEMgaXRzZWxmKSwgYXNzaWduIGFuIGlkLCByZWdpc3RlciB0aGUgcGVuZGluZyBkZWZlcnJlZCwgYW5kXG5cdCAqIHdyaXRlIHRvIHRoZSB3aXJlLlxuXHQgKlxuXHQgKiBUaGUgcmVjb25uZWN0LWdhdGUgYnlwYXNzIGV4aXN0cyBiZWNhdXNlIHRoZSBgcmVjb25uZWN0YCByZXF1ZXN0IGlzIHNlbnRcblx0ICogZnJvbSBpbnNpZGUgYF9hdHRlbXB0UmVjb25uZWN0YCB3aGlsZSB0aGUgZ2F0ZSBpcyBlbmdhZ2VkLCBzbyBpdCBjYW4ndFxuXHQgKiB3YWl0IG9uIGl0cyBvd24gcmVzb2x1dGlvbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3BhdGNoUmVxdWVzdDxUUmVzdWx0Pihcblx0XHRtZXRob2Q6IHN0cmluZyxcblx0XHRwYXJhbXM6IHVua25vd24sXG5cdFx0b3B0aW9uczogeyByZWFkb25seSBieXBhc3NJbml0aWFsaXplUXVldWU/OiBib29sZWFuOyByZWFkb25seSBhbGxvd0luY29tcGF0aWJsZVVwZ3JhZGU/OiBib29sZWFuOyByZWFkb25seSBieXBhc3NSZWNvbm5lY3RHYXRlPzogYm9vbGVhbiB9ID0ge30sXG5cdCk6IFByb21pc2U8VFJlc3VsdD4ge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQpIHtcblx0XHRcdHRocm93IHRoaXMuX3N0YXRlLmVycm9yO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlKSB7XG5cdFx0XHRpZiAoIW9wdGlvbnMuYWxsb3dJbmNvbXBhdGlibGVVcGdyYWRlKSB7XG5cdFx0XHRcdHRocm93IHRoaXMuX3N0YXRlLmVycm9yO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyByZXF1ZXN0LCByZXN1bHQgfSA9IHRoaXMuX2NyZWF0ZVJlcXVlc3Q8VFJlc3VsdD4obWV0aG9kLCBwYXJhbXMpO1xuXHRcdFx0dGhpcy5fdHJhbnNwb3J0LnNlbmQocmVxdWVzdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRpZiAoIW9wdGlvbnMuYnlwYXNzSW5pdGlhbGl6ZVF1ZXVlICYmIGlzQ2xpZW50VHJhbnNwb3J0KHRoaXMuX3RyYW5zcG9ydCkgJiYgdGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZykge1xuXHRcdFx0Y29uc3QgeyByZXF1ZXN0LCByZXN1bHQgfSA9IHRoaXMuX2NyZWF0ZVJlcXVlc3Q8VFJlc3VsdD4obWV0aG9kLCBwYXJhbXMpO1xuXHRcdFx0dGhpcy5fc3RhdGUub3V0Ym94LnB1c2gocmVxdWVzdCBhcyBQcm90b2NvbE1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Ly8gUmlkZSB0aHJvdWdoIGFueSBudW1iZXIgb2YgcmVjb25uZWN0IGN5Y2xlcyB1bnRpbCB0aGUgY2xpZW50IGlzXG5cdFx0Ly8gZWl0aGVyIENvbm5lY3RlZCAocHJvY2VlZCkgb3IgQ2xvc2VkICh0aHJvdykuIEEgdHJhbnNpZW50IGZhaWxlZFxuXHRcdC8vIGF0dGVtcHQgZG9lcyBOT1Qgc3VyZmFjZSB0byB0aGUgY2FsbGVyIFx1MjAxNCB0aGUgcmVxdWVzdCBzdGF5cyBnYXRlZFxuXHRcdC8vIHVudGlsIHRoZSBjb25uZWN0aW9uIGV2ZW50dWFsbHkgcmVzdW1lcywgbWF0Y2hpbmcgaG93IHRoZVxuXHRcdC8vIG5vdGlmaWNhdGlvbiBvdXRib3ggcmlkZXMgYWNyb3NzIHJldHJpZXMuIEEgc3Vic2VxdWVudCB0cmFuc3BvcnRcblx0XHQvLyBkcm9wIHRoYXQgYm91bmNlcyB1cyBiYWNrIGludG8gUmVjb25uZWN0aW5nIGFmdGVyIHRoZSBnYXRlIGFscmVhZHlcblx0XHQvLyByZXNvbHZlZCBpcyBhbHNvIGhhbmRsZWQgaGVyZTogdGhlIGxvb3AgcmUtY2hlY2tzIHN0YXRlIG9uIGVhY2hcblx0XHQvLyBpdGVyYXRpb24gc28gd2UgbmV2ZXIgc2VuZCBvbiBhIGRlYWQvcmVjb25uZWN0aW5nIHRyYW5zcG9ydC5cblx0XHR3aGlsZSAoIW9wdGlvbnMuYnlwYXNzUmVjb25uZWN0R2F0ZSAmJiB0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9zdGF0ZSBhcyBDbGllbnRTdGF0ZTtcblx0XHRcdGlmIChjdXJyZW50LmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGN1cnJlbnQucmVjb25uZWN0LmdhdGUucDtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBUcmFuc2llbnQgYXR0ZW1wdCBmYWlsdXJlIFx1MjAxNCBzd2FsbG93IGFuZCByZS1jaGVjayBzdGF0ZSBvbiB0aGVcblx0XHRcdFx0Ly8gbmV4dCBsb29wIGl0ZXJhdGlvbi4gSWYgd2UgdHJhbnNpdGlvbmVkIHRvIENsb3NlZCB0aGUgY2hlY2tcblx0XHRcdFx0Ly8gYWZ0ZXIgdGhlIGxvb3Agc3VyZmFjZXMgdGhlIGVycm9yOyBpZiB3ZSdyZSBzdGlsbCBSZWNvbm5lY3Rpbmdcblx0XHRcdFx0Ly8gd2l0aCBhIGZyZXNoIGdhdGUgd2UnbGwgYXdhaXQgdGhhdCBvbmUuXG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9zdGF0ZSBhcyBDbGllbnRTdGF0ZTtcblx0XHRpZiAoY3VycmVudC5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQgfHwgY3VycmVudC5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGUpIHtcblx0XHRcdHRocm93IGN1cnJlbnQuZXJyb3I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyByZXF1ZXN0LCByZXN1bHQgfSA9IHRoaXMuX2NyZWF0ZVJlcXVlc3Q8VFJlc3VsdD4obWV0aG9kLCBwYXJhbXMpO1xuXHRcdHRoaXMuX3RyYW5zcG9ydC5zZW5kKHJlcXVlc3QpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZXF1ZXN0PFRSZXN1bHQ+KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd24pOiB7IHJlcXVlc3Q6IEpzb25ScGNSZXF1ZXN0OyByZXN1bHQ6IFByb21pc2U8VFJlc3VsdD4gfSB7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9uZXh0UmVxdWVzdElkKys7XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHVua25vd24+KCk7XG5cdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNldChpZCwgeyBkZWZlcnJlZCwgc3VwcHJlc3NOb3RGb3VuZFdhcm5pbmc6IGlzRmlsZVJlc291cmNlUmVhZChtZXRob2QsIHBhcmFtcyksIHNlbnRBdDogRGF0ZS5ub3coKSB9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVxdWVzdDogeyBqc29ucnBjOiAnMi4wJywgaWQsIG1ldGhvZCwgcGFyYW1zIH0sXG5cdFx0XHRyZXN1bHQ6IGRlZmVycmVkLnAgYXMgUHJvbWlzZTxUUmVzdWx0Pixcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkTG9nRmFpbGVkUmVxdWVzdChyZXF1ZXN0OiBJUGVuZGluZ1JlcXVlc3QsIGVycm9yOiBKc29uUnBjRXJyb3JSZXNwb25zZVsnZXJyb3InXSk6IGJvb2xlYW4ge1xuXHRcdGlmIChlcnJvci5jb2RlID09PSBBaHBFcnJvckNvZGVzLk5vdEZvdW5kICYmIHJlcXVlc3Quc3VwcHJlc3NOb3RGb3VuZFdhcm5pbmcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF90b1Byb3RvY29sRXJyb3IoZXJyb3I6IEpzb25ScGNFcnJvclJlc3BvbnNlWydlcnJvciddKTogUHJvdG9jb2xFcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBQcm90b2NvbEVycm9yKGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGVycm9yLmRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVqZWN0UGVuZGluZ1JlcXVlc3RzKGVycm9yOiBQcm90b2NvbEVycm9yKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy52YWx1ZXMoKSkge1xuXHRcdFx0cGVuZGluZy5kZWZlcnJlZC5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2V0IHRoZSBsaXZlbmVzcyB0aW1lcnMuIENhbGxlZCBhdCBjb25zdHJ1Y3Rpb24gZm9yIGFuIGFscmVhZHktb3BlblxuXHQgKiBwYXNzaXZlIHRyYW5zcG9ydCwgYWZ0ZXIgYSBzdWNjZXNzZnVsIGNsaWVudC10cmFuc3BvcnQgaW5pdGlhbGl6YXRpb24sXG5cdCAqIG9uY2Ugb24gZXZlcnkgcmVjZWl2ZWQgbWVzc2FnZSAod2hpY2ggaXMgaXRzZWxmIHByb29mIHRoZSByZW1vdGUgaXNcblx0ICogYWxpdmUpLCBhbmQgb25jZSBhZnRlciBhIHN1Y2Nlc3NmdWwgc29mdCByZWNvbm5lY3QuXG5cdCAqXG5cdCAqIFR3byB0aW1lcnMgY29vcGVyYXRlOlxuXHQgKlxuXHQgKiAxLiB7QGxpbmsgX3BpbmdUaW1lcn0gZmlyZXMgYWZ0ZXIge0BsaW5rIFBJTkdfSU5URVJWQUxfTVN9IG9mIHNpbGVuY2Vcblx0ICogICAgYW5kIHNlbmRzIGFuIGFwcGxpY2F0aW9uLWxldmVsIGBwaW5nYCBzbyB0aGUgY2xvc2UgdGltZXIgaGFzXG5cdCAqICAgIHNvbWV0aGluZyB0byB0aW1lIG91dCBvbi4gVG9sZXJhdGVzIHNlcnZlcnMgdGhhdCBkb24ndCBpbXBsZW1lbnRcblx0ICogICAgYHBpbmdgIFx1MjAxNCB0aGUgZXJyb3IgcmVzcG9uc2Ugc3RpbGwgcmVzZXRzIGJvdGggdGltZXJzLlxuXHQgKlxuXHQgKiAyLiB7QGxpbmsgX2Nsb3NlVGltZXJ9IGZpcmVzIGFmdGVyIHtAbGluayBQSU5HX0lOVEVSVkFMX01TfStcblx0ICogICAge0BsaW5rIExJVkVORVNTX1RJTUVPVVRfTVN9IG9mIGNvbnRpbnVlZCBzaWxlbmNlIGFuZCBmb3JjZS1jbG9zZXNcblx0ICogICAgdGhlIHRyYW5zcG9ydCBzbyB0aGUgcmVuZGVyZXIncyByZWNvbm5lY3QgbG9naWMga2lja3MgaW4uIENhdGNoZXNcblx0ICogICAgc2lsZW50bHktZGVhZCB0cmFuc3BvcnRzIChlLmcuIFNTSC90dW5uZWwgYWZ0ZXIgbGFwdG9wIHNsZWVwICtcblx0ICogICAgbmV0d29yayBjaGFuZ2UpIHRoYXQgZG9uJ3QgZW1pdCBhIHNvY2tldCBjbG9zZSBldmVudCBvZiB0aGVpciBvd24uXG5cdCAqXG5cdCAqIEFmdGVyIGxhcHRvcCBzbGVlcCArIHdha2UgdGhlIEpTIGV2ZW50IGxvb3AgaXMgcGF1c2VkLCBzbyBhIHRpbWVyXG5cdCAqIGFybWVkIGJlZm9yZSBzbGVlcCBmaXJlcyBpbW1lZGlhdGVseSBhZnRlciB3YWtlLiBUaGF0J3MgZmluZSBcdTIwMTRcblx0ICogYW55IGluYm91bmQgbWVzc2FnZSBwcm9jZXNzZWQgZHVyaW5nIHRoZSB3YWtlIGNhdGNoLXVwIHJlc2V0cyBpdFxuXHQgKiBiZWZvcmUgdGhlIGNsb3NlIGhhbmRsZXIgcnVucy5cblx0ICpcblx0ICogTm8tb3Agd2hpbGUge0BsaW5rIF9zdGF0ZS5raW5kfSBpcyB7QGxpbmsgQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlfSxcblx0ICoge0BsaW5rIEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZ30sIG9yIHtAbGluayBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWR9OlxuXHQgKiB0aGUgdHJhbnNwb3J0IGlzIG5vdCBhdmFpbGFibGUgZm9yIG5vcm1hbCBsaXZlbmVzcyB0cmFmZmljIGluIHRob3NlIHN0YXRlcy5cblx0ICovXG5cdHByaXZhdGUgX3Jlc2V0TGl2ZW5lc3NUaW1lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuY2VsTGl2ZW5lc3NUaW1lcnMoKTtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlXG5cdFx0XHR8fCB0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3Rpbmdcblx0XHRcdHx8IHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9waW5nVGltZXIuY2FuY2VsQW5kU2V0KCgpID0+IHRoaXMuX29uUGluZ1RpbWVyKCksIFBJTkdfSU5URVJWQUxfTVMpO1xuXHRcdHRoaXMuX2Nsb3NlVGltZXIuY2FuY2VsQW5kU2V0KCgpID0+IHRoaXMuX29uQ2xvc2VUaW1lcigpLCBQSU5HX0lOVEVSVkFMX01TICsgTElWRU5FU1NfVElNRU9VVF9NUyk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxMaXZlbmVzc1RpbWVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9waW5nVGltZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5fY2xvc2VUaW1lci5jYW5jZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uUGluZ1RpbWVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGVcblx0XHRcdHx8IHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZFxuXHRcdFx0fHwgdGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEZpcmUtYW5kLWZvcmdldC4gVGhlIHJlcGx5IChvciBhbnkgb3RoZXIgaW5ib3VuZCBtZXNzYWdlIHRoYXRcblx0XHQvLyBoYXBwZW5zIHRvIGFycml2ZSBmaXJzdCkgd2lsbCByZXNldCBib3RoIHRpbWVyczsgaWYgbm90aGluZ1xuXHRcdC8vIGFycml2ZXMsIHtAbGluayBfb25DbG9zZVRpbWVyfSBmaXJlcy5cblx0XHR2b2lkIHRoaXMucGluZygpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkNsb3NlVGltZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZVxuXHRcdFx0fHwgdGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkXG5cdFx0XHR8fCB0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3RyYW5zcG9ydC5jbGllbnRDb25uZWN0aW9uS2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvbktpbmQuTG9jYWwpIHtcblx0XHRcdC8vIFRoZSBtYWluIHByb2Nlc3MgcmVwb3J0cyBhY3R1YWwgY2hpbGQtcHJvY2VzcyBleGl0cyBleHBsaWNpdGx5LlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyB7QGxpbmsgSUxvYWRFc3RpbWF0b3J9IGd1YXJkcyBhZ2FpbnN0IHRoZSAqbG9jYWwqIHNpZGUgb2YgdGhlXG5cdFx0Ly8gY29uZnVzaW9uOiBpZiBvdXIgb3duIEpTIGV2ZW50IGxvb3AgaGFzIGJlZW4gcGVnZ2VkIHdlIHN1cHByZXNzXG5cdFx0Ly8gdGhlIGNsb3NlIFx1MjAxNCB0aGUgc2lsZW5jZSBpcyBvbiBvdXIgZW5kLCBub3QgdGhlIHJlbW90ZSdzLCBhbmRcblx0XHQvLyB0ZWFyaW5nIGRvd24gdGhlIHRyYW5zcG9ydCB3b3VsZCBqdXN0IGFib3J0IGluLWZsaWdodCByZXF1ZXN0cy5cblx0XHQvLyBSZS1hcm0gb25seSB0aGUgY2xvc2UgdGltZXIgYXQge0BsaW5rIFBJTkdfSU5URVJWQUxfTVN9IHNvIHdlXG5cdFx0Ly8gcmUtZXZhbHVhdGUgcHJvbXB0bHkgb25jZSBsb2FkIG5vcm1hbGl6ZXMgKHJhdGhlciB0aGFuIHdhaXRpbmcgYVxuXHRcdC8vIGZ1bGwgUElOR19JTlRFUlZBTCArIExJVkVORVNTX1RJTUVPVVQgd2luZG93KS5cblx0XHRpZiAodGhpcy5fbG9hZEVzdGltYXRvci5oYXNIaWdoTG9hZCgpKSB7XG5cdFx0XHR0aGlzLl9jbG9zZVRpbWVyLmNhbmNlbEFuZFNldCgoKSA9PiB0aGlzLl9vbkNsb3NlVGltZXIoKSwgUElOR19JTlRFUlZBTF9NUyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNpbGVuY2UgPSBEYXRlLm5vdygpIC0gdGhpcy5fbGFzdFJlYWRUaW1lO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIExpdmVuZXNzOiBubyBtZXNzYWdlIGZyb20gJHt0aGlzLl9hZGRyZXNzfSBmb3IgJHtzaWxlbmNlfW1zOyBmb3JjaW5nIGNsb3NlIHRvIHRyaWdnZXIgcmVjb25uZWN0LmAsXG5cdFx0KTtcblx0XHQvLyBUZWFyIGRvd24gdGhlIGRlYWQgdHJhbnNwb3J0IHNvIGl0IGNhbid0IGtlZXAgZGVsaXZlcmluZyBtZXNzYWdlc1xuXHRcdC8vIHRvIGEgUmVjb25uZWN0aW5nL0Nsb3NlZCBjbGllbnQgKGFuZCwgb24gdGhlIG5vbi1mYWN0b3J5IHBhdGgsXG5cdFx0Ly8gc28gd2UgZG9uJ3QgbGVhayBhIGhhbGYtb3BlbiBzb2NrZXQgd2FpdGluZyBmb3IgY2xpZW50IGRpc3Bvc2FsKS5cblx0XHQvLyBXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnQuZGlzcG9zZSgpIGRpc3Bvc2VzIGl0cyBlbWl0dGVyc1xuXHRcdC8vIHN5bmNocm9ub3VzbHkgYmVmb3JlIHRoZSBuYXRpdmUgY2xvc2UgZXZlbnQgYXJyaXZlcywgc28gdGhpc1xuXHRcdC8vIHdvbid0IHJlLWVudGVyIHtAbGluayBfaGFuZGxlVHJhbnNwb3J0Q2xvc2V9LlxuXHRcdHRoaXMuX3RyYW5zcG9ydExpc3RlbmVycy5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl90cmFuc3BvcnRGYWN0b3J5KSB7XG5cdFx0XHQvLyBJbiBmYWN0b3J5IG1vZGUsIHJvdXRlIGRpcmVjdGx5IHRocm91Z2ggdGhlIHNvZnQtcmVjb25uZWN0IHBhdGguXG5cdFx0XHR0aGlzLl9yZWplY3RQZW5kaW5nUmVxdWVzdHMoY29ubmVjdGlvblRpbWVvdXRFcnJvcih0aGlzLl9hZGRyZXNzLCBzaWxlbmNlKSk7XG5cdFx0XHR0aGlzLl9oYW5kbGVUcmFuc3BvcnRDbG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9oYW5kbGVDbG9zZShjb25uZWN0aW9uVGltZW91dEVycm9yKHRoaXMuX2FkZHJlc3MsIHNpbGVuY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIG5leHQgY2xpZW50IHNlcXVlbmNlIG51bWJlciBmb3Igb3B0aW1pc3RpYyBkaXNwYXRjaC5cblx0ICovXG5cdG5leHRDbGllbnRTZXEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbmV4dENsaWVudFNlcSsrO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVNBLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQWlCLHlCQUFxQztBQUMzRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QixxQ0FBcUM7QUFDM0UsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBaU87QUFFMU8sU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywrQkFBd0Q7QUFDakUsU0FBUyxnQ0FBdUY7QUFDaEcsU0FBUyxvQkFBb0Isa0JBQWtCLHNCQUFzQjtBQUNyRSxTQUFvQyxrQ0FBa0MsMkJBQTJCLDBDQUEwQztBQUUzSSxTQUFTLGtCQUE4TTtBQUN2TixTQUFTLHVCQUF1QyxnQkFBZ0IsaUJBQWlCLHdCQUFzRjtBQUN2SyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHVCQUF1QixrQkFBa0IsbUJBQW1CLGVBQWUsMkJBQXNFO0FBRTFKLFNBQVMsbUJBQW1CLHNDQUErRDtBQUMzRixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQix1QkFBK0w7QUFFeE4sU0FBUyxvQkFBb0I7QUFDN0IsU0FBeUIscUJBQXFCO0FBQzlDLFNBQVMsbUJBQW1CLHFDQUFxQywwQkFBMEIsc0JBQXNCLGdCQUFnQiw2QkFBNkI7QUFDOUosU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQ0FBa0MsOENBQThDLDRDQUE0Qyw0Q0FBNEMsNENBQTRD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LEtBQUssS0FBSyxFQUFFLE1BQU0sTUFBTSxNQUFTO0FBQUEsRUFDdkM7QUFBQSxFQUVRLGdCQUFzQjtBQUM3QixRQUFJLEtBQUssT0FBTyxTQUFTLHFDQUNyQixLQUFLLE9BQU8sU0FBUyx5QkFDckIsS0FBSyxPQUFPLFNBQVMsbUNBQW1DO0FBQzNEO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxXQUFXLHlCQUF5Qiw4QkFBOEIsT0FBTztBQUVqRjtBQUFBLElBQ0Q7QUFRQSxRQUFJLEtBQUssZUFBZSxZQUFZLEdBQUc7QUFDdEMsV0FBSyxZQUFZLGFBQWEsTUFBTSxLQUFLLGNBQWMsR0FBRyxnQkFBZ0I7QUFDMUU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUFVLEtBQUssSUFBSSxJQUFJLEtBQUs7QUFDbEMsU0FBSyxZQUFZO0FBQUEsTUFDaEIsdURBQXVELEtBQUssUUFBUSxRQUFRLE9BQU87QUFBQSxJQUNwRjtBQU9BLFNBQUssb0JBQW9CLE1BQU07QUFDL0IsUUFBSSxLQUFLLG1CQUFtQjtBQUUzQixXQUFLLHVCQUF1Qix1QkFBdUIsS0FBSyxVQUFVLE9BQU8sQ0FBQztBQUMxRSxXQUFLLHNCQUFzQjtBQUMzQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGFBQWEsdUJBQXVCLEtBQUssVUFBVSxPQUFPLENBQUM7QUFBQSxFQUNqRTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsZ0JBQXdCO0FBQ3ZCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQXBvRGEsZ0NBQU47QUFBQSxFQXlJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBNUlVOyIsCiAgIm5hbWVzIjogWyJBZ2VudEhvc3RDbGllbnRTdGF0ZSIsICJyZXF1ZXN0IiwgInJlc3VsdCIsICJjdXJyZW50Il0KfQo=
