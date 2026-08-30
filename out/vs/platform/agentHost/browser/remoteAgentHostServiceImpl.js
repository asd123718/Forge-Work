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
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { DeferredPromise, raceTimeout } from "../../../base/common/async.js";
import { ConfigurationTarget, IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILabelService } from "../../label/common/label.js";
import { ILogService } from "../../log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { hasKey } from "../../../base/common/types.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../common/agentService.js";
import {
  RemoteAgentHostConnectionStatus,
  RemoteAgentHostsEnabledSettingId,
  RemoteAgentHostsSettingId,
  SSH_ENTRY_TYPE_CONFIG,
  WEBSOCKET_ENTRY_TYPE_CONFIG,
  getEntryTypeConfig,
  parseLegacyRawEntry
} from "../common/remoteAgentHostService.js";
import { RemoteAgentHostProtocolClient, AgentHostClientState } from "./remoteAgentHostProtocolClient.js";
import { WebSocketClientTransport } from "./webSocketClientTransport.js";
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, normalizeRemoteAgentHostAddress } from "../common/agentHostUri.js";
import { PROTOCOL_VERSION } from "../common/state/protocol/version/registry.js";
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from "../common/agentHostClientInfo.js";
const SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY = "remoteAgentHost.sshConnections";
function disposeEntry(entry) {
  entry.store.dispose();
  entry.transportDisposable?.dispose();
}
function isRawRemoteAgentHostEntry(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value;
  return typeof candidate.address === "string" && typeof candidate.name === "string" && (candidate.connectionToken === void 0 || typeof candidate.connectionToken === "string") && (candidate.sshConfigHost === void 0 || typeof candidate.sshConfigHost === "string") && (candidate.sshHostName === void 0 || typeof candidate.sshHostName === "string") && (candidate.sshUser === void 0 || typeof candidate.sshUser === "string") && (candidate.sshPort === void 0 || typeof candidate.sshPort === "number");
}
function isLegacySshRawEntry(entry) {
  return entry.sshConfigHost !== void 0 || entry.sshHostName !== void 0 || entry.sshUser !== void 0 || entry.sshPort !== void 0;
}
let RemoteAgentHostService = class extends Disposable {
  constructor(_configurationService, _instantiationService, _logService, _labelService, _environmentService, _storageService) {
    super();
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._labelService = _labelService;
    this._environmentService = _environmentService;
    this._storageService = _storageService;
    this._onDidChangeConnections = this._register(new Emitter());
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._entries = /* @__PURE__ */ new Map();
    this._names = /* @__PURE__ */ new Map();
    this._tokens = /* @__PURE__ */ new Map();
    /**
     * Stores the original {@link IRemoteAgentHostEntry} for connections
     * registered via {@link addManagedConnection}. This is needed because
     * tunnel entries are not persisted to settings and therefore don't
     * appear in {@link configuredEntries}.
     */
    this._registeredEntries = /* @__PURE__ */ new Map();
    this._pendingConnectionWaits = /* @__PURE__ */ new Map();
    /** Pending reconnect timeouts, keyed by normalized address. */
    this._reconnectTimeouts = /* @__PURE__ */ new Map();
    /** Current reconnect attempt count per address for exponential backoff. */
    this._reconnectAttempts = /* @__PURE__ */ new Map();
    /**
     * Per-address {@link ILabelService} formatter handles for the
     * {@link AGENT_HOST_SCHEME}. The formatter advertises the entry's
     * human-readable name as the host label so any UI looking up the host
     * label for an agent host URI gets the friendly name.
     */
    this._labelFormatters = /* @__PURE__ */ new Map();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
        this._reconcileConnections();
      }
    }));
    this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, this._store)(() => {
      this._reconcileConnections();
      this._onDidChangeConnections.fire();
    }));
    this._migrateSSHEntriesFromSetting();
    this._reconcileConnections();
  }
  get clientInfo() {
    return editorWindowAgentHostClientInfo;
  }
  _entryAddress(entry) {
    const config = getEntryTypeConfig(entry.connection.type);
    const address = config.address(entry.connection);
    return config.normalizedAddress ? normalizeRemoteAgentHostAddress(address) : address;
  }
  _normalizeEntry(entry) {
    const config = getEntryTypeConfig(entry.connection.type);
    if (!config.normalizedAddress || !hasKey(entry.connection, { address: true })) {
      return entry;
    }
    return { ...entry, connection: { ...entry.connection, address: normalizeRemoteAgentHostAddress(entry.connection.address) } };
  }
  get connections() {
    const result = [];
    for (const [address, entry] of this._entries) {
      result.push({
        address,
        name: this._names.get(address) ?? address,
        clientId: entry.client.clientId,
        defaultDirectory: entry.client.defaultDirectory,
        status: entry.status
      });
    }
    return result;
  }
  get configuredEntries() {
    return this._getConfiguredEntries().map((entry) => this._normalizeEntry(entry));
  }
  getConnection(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const entry = this._entries.get(normalized);
    return entry?.connected ? entry.client : void 0;
  }
  getConnectionByAuthority(authority) {
    for (const [address, entry] of this._entries) {
      if (entry.connected && agentHostAuthority(address) === authority) {
        return entry.client;
      }
    }
    return void 0;
  }
  getEntryByAddress(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const registered = this._registeredEntries.get(normalized);
    if (registered) {
      return registered;
    }
    return this.configuredEntries.find(
      (entry) => this._entryAddress(entry) === normalized
    );
  }
  async triggerServerUpgrade(address, method) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const entry = this._entries.get(normalized);
    if (!entry) {
      throw new Error(`No remote agent host entry found for ${address}.`);
    }
    const result = await raceTimeout(
      entry.client.triggerVscodeUpgrade(method),
      RemoteAgentHostService.UpgradeRequestTimeout
    );
    if (result === void 0) {
      throw new Error(`Server upgrade request timed out after ${RemoteAgentHostService.UpgradeRequestTimeout}ms.`);
    }
    return result;
  }
  reconnect(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const configuredEntry = this._getConfiguredEntries().find(
      (entry2) => this._entryAddress(entry2) === normalized
    );
    if (configuredEntry && !getEntryTypeConfig(configuredEntry.connection.type).selfConnecting) {
      return;
    }
    const token = this._tokens.get(normalized);
    this._cancelReconnect(normalized);
    this._reconnectAttempts.delete(normalized);
    const entry = this._entries.get(normalized);
    if (entry) {
      this._entries.delete(normalized);
      entry.store.dispose();
    }
    this._connectTo(normalized, token);
  }
  async addRemoteAgentHost(input) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const entry = this._normalizeEntry(input);
    const address = this._entryAddress(entry);
    const existingConnection = this._getConnectionInfo(address);
    const config = getEntryTypeConfig(entry.connection.type);
    if (config.store !== "runtime") {
      await this._storeConfiguredEntries(this._upsertEntry(this._getConfiguredEntries(true), entry));
    }
    if (existingConnection) {
      return {
        ...existingConnection,
        name: entry.name
      };
    }
    if (!config.selfConnecting) {
      return {
        address,
        name: entry.name,
        clientId: "",
        status: RemoteAgentHostConnectionStatus.disconnected
      };
    }
    const connectedConnection = this._getConnectionInfo(address);
    if (connectedConnection) {
      return connectedConnection;
    }
    const wait = this._getOrCreateConnectionWait(address);
    const connection = await raceTimeout(wait.p, RemoteAgentHostService.ConnectionWaitTimeout, () => {
      this._pendingConnectionWaits.delete(address);
    });
    if (!connection) {
      throw new Error(`Timed out connecting to ${address}`);
    }
    return connection;
  }
  async addManagedConnection(entry, connection, transportDisposable, status = RemoteAgentHostConnectionStatus.connected) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const address = this._entryAddress(entry);
    const existingEntry = this._entries.get(address);
    if (existingEntry) {
      this._entries.delete(address);
      existingEntry.store.dispose();
    }
    const store = new DisposableStore();
    const protocolClient = connection;
    store.add(protocolClient);
    const connEntry = { store, client: protocolClient, transportDisposable, connected: RemoteAgentHostConnectionStatus.isConnected(status), status };
    this._entries.set(address, connEntry);
    this._names.set(address, entry.name);
    this._registeredEntries.set(address, entry);
    this._updateHostLabelFormatter(address, entry.name);
    if (entry.connectionToken) {
      this._tokens.set(address, entry.connectionToken);
    }
    store.add(protocolClient.onDidClose(() => {
      if (this._entries.get(address) === connEntry) {
        connEntry.connected = false;
        connEntry.status = RemoteAgentHostConnectionStatus.disconnected;
        this._onDidChangeConnections.fire();
      }
    }));
    const config = getEntryTypeConfig(entry.connection.type);
    if (config.store !== "runtime") {
      await this._storeConfiguredEntries(this._upsertEntry(this._getConfiguredEntries(true), entry));
    }
    this._onDidChangeConnections.fire();
    return {
      address,
      name: entry.name,
      clientId: protocolClient.clientId,
      defaultDirectory: protocolClient.defaultDirectory,
      status
    };
  }
  async removeRemoteAgentHost(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const entry = this._registeredEntries.get(normalized) ?? this._getConfiguredEntries().find((entry2) => this._entryAddress(entry2) === normalized);
    if (entry) {
      const config = getEntryTypeConfig(entry.connection.type);
      if (config.store !== "runtime") {
        const entries = this._getConfiguredEntries(true).filter((entry2) => this._entryAddress(entry2) !== normalized);
        await this._storeConfiguredEntries(entries);
      }
    }
    this._names.delete(normalized);
    this._tokens.delete(normalized);
    this._registeredEntries.delete(normalized);
    this._clearHostLabelFormatter(normalized);
    this._cancelReconnect(normalized);
    this._reconnectAttempts.delete(normalized);
    this._removeConnection(normalized);
  }
  _removeConnection(address) {
    const entry = this._entries.get(address);
    if (entry) {
      this._entries.delete(address);
      this._registeredEntries.delete(address);
      disposeEntry(entry);
      this._rejectPendingConnectionWait(address, new Error(`Connection closed: ${address}`));
      this._onDidChangeConnections.fire();
    }
  }
  notifyConnectionClosed(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const entry = this._entries.get(normalized);
    if (entry) {
      this._logService.info(`[RemoteAgentHost] notifyConnectionClosed: notifying protocol client for ${normalized}`);
      entry.client.notifyTransportClosed();
    } else {
      this._logService.info(`[RemoteAgentHost] notifyConnectionClosed: no entry found for ${normalized} (already removed?)`);
    }
  }
  _reconcileConnections() {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      for (const address of [...this._entries.keys()]) {
        this._cancelReconnect(address);
        this._removeConnection(address);
      }
      this._names.clear();
      this._tokens.clear();
      this._reconnectAttempts.clear();
      for (const address of [...this._labelFormatters.keys()]) {
        if (!this._registeredEntries.has(address)) {
          this._clearHostLabelFormatter(address);
        }
      }
      return;
    }
    const configuredEntries = this._getConfiguredEntries();
    const entriesWithAddress = configuredEntries.map((entry) => ({ entry, address: this._entryAddress(entry) }));
    const desired = new Set(entriesWithAddress.map((e) => e.address));
    this._logService.info(`[RemoteAgentHost] Reconciling: desired=[${[...desired].join(", ")}], current=[${[...this._entries.keys()].map((a) => `${a}(${this._entries.get(a).connected ? "connected" : "pending"})`).join(", ")}]`);
    let namesChanged = false;
    const oldNames = new Map(this._names);
    this._names.clear();
    this._tokens.clear();
    for (const [address, entry] of this._registeredEntries) {
      this._names.set(address, entry.name);
      this._tokens.set(address, entry.connectionToken);
    }
    for (const { entry, address } of entriesWithAddress) {
      this._names.set(address, entry.name);
      this._tokens.set(address, entry.connectionToken);
      this._updateHostLabelFormatter(address, entry.name);
      if (this._entries.has(address) && oldNames.get(address) !== entry.name) {
        namesChanged = true;
      }
    }
    for (const address of [...this._labelFormatters.keys()]) {
      if (!desired.has(address) && !this._registeredEntries.has(address)) {
        this._clearHostLabelFormatter(address);
      }
    }
    for (const address of [...this._entries.keys()]) {
      if (!desired.has(address) && !this._registeredEntries.has(address)) {
        this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
        this._cancelReconnect(address);
        this._reconnectAttempts.delete(address);
        this._removeConnection(address);
      }
    }
    for (const { entry, address } of entriesWithAddress) {
      if (!this._entries.has(address) && getEntryTypeConfig(entry.connection.type).selfConnecting) {
        this._connectTo(address, entry.connectionToken);
      }
    }
    if (namesChanged) {
      this._onDidChangeConnections.fire();
    }
  }
  _connectTo(address, connectionToken) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return;
    }
    const existingEntry = this._entries.get(address);
    if (existingEntry) {
      this._entries.delete(address);
      existingEntry.store.dispose();
    }
    const store = new DisposableStore();
    const ahpLoggingEnabled = !!this._configurationService.getValue(AgentHostAhpJsonlLoggingSettingId);
    const transportFactory = () => this._instantiationService.createInstance(
      WebSocketClientTransport,
      address,
      connectionToken,
      ahpLoggingEnabled ? { logsHome: this._environmentService.logsHome, connectionId: address, transport: "websocket" } : void 0
    );
    const client = store.add(this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transportFactory, void 0, void 0, this.clientInfo));
    const entry = { store, client, connected: false, status: RemoteAgentHostConnectionStatus.connecting };
    this._entries.set(address, entry);
    const isCurrentEntry = () => this._entries.get(address) === entry;
    store.add(client.onDidClose(() => {
      if (!isCurrentEntry()) {
        return;
      }
      this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
      entry.connected = false;
      entry.status = RemoteAgentHostConnectionStatus.disconnected;
      this._onDidChangeConnections.fire();
      this._scheduleReconnect(address, connectionToken);
    }));
    store.add(client.onDidChangeConnectionState((state) => {
      if (!isCurrentEntry()) {
        return;
      }
      switch (state) {
        case AgentHostClientState.Reconnecting:
          entry.connected = false;
          entry.status = RemoteAgentHostConnectionStatus.connecting;
          this._onDidChangeConnections.fire();
          break;
        case AgentHostClientState.Connected:
          entry.connected = true;
          entry.status = RemoteAgentHostConnectionStatus.connected;
          this._onDidChangeConnections.fire();
          break;
        case AgentHostClientState.Connecting:
        case AgentHostClientState.Incompatible:
        case AgentHostClientState.Closed:
          break;
      }
    }));
    this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
    this._onDidChangeConnections.fire();
    client.connect().then(() => {
      if (store.isDisposed) {
        return;
      }
      this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
      entry.connected = true;
      entry.status = RemoteAgentHostConnectionStatus.connected;
      this._reconnectAttempts.delete(address);
      this._resolvePendingConnectionWait(address);
      this._onDidChangeConnections.fire();
    }).catch((err) => {
      if (!isCurrentEntry()) {
        return;
      }
      const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
      if (incompatible) {
        this._logService.warn(`[RemoteAgentHost] Incompatible with ${address}: ${incompatible.kind === "incompatible" ? incompatible.message : ""}`);
        entry.status = incompatible;
        this._reconnectAttempts.delete(address);
        this._rejectPendingConnectionWait(address, err);
        this._onDidChangeConnections.fire();
        return;
      }
      this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}. Verify address and connectionToken`, err);
      entry.status = RemoteAgentHostConnectionStatus.disconnected;
      this._entries.delete(address);
      entry.store.dispose();
      this._rejectPendingConnectionWait(address, err);
      this._onDidChangeConnections.fire();
      this._scheduleReconnect(address, connectionToken);
    });
  }
  /**
   * Schedule a reconnect attempt with exponential backoff.
   * Only reconnects if the address is still in the configured entries.
   */
  _scheduleReconnect(address, connectionToken) {
    if (!this._getConfiguredEntries().some((entry) => this._entryAddress(entry) === address)) {
      this._logService.info(`[RemoteAgentHost] Not reconnecting to ${address}: no longer configured`);
      return;
    }
    const attempt = (this._reconnectAttempts.get(address) ?? 0) + 1;
    this._reconnectAttempts.set(address, attempt);
    const delay = Math.min(
      RemoteAgentHostService.ReconnectInitialDelay * Math.pow(2, attempt - 1),
      RemoteAgentHostService.ReconnectMaxDelay
    );
    this._logService.info(`[RemoteAgentHost] Scheduling reconnect to ${address} in ${delay}ms (attempt ${attempt})`);
    this._cancelReconnect(address);
    const timeout = setTimeout(() => {
      this._reconnectTimeouts.delete(address);
      if (this._getConfiguredEntries().some((entry) => this._entryAddress(entry) === address)) {
        this._connectTo(address, connectionToken ?? this._tokens.get(address));
      }
    }, delay);
    this._reconnectTimeouts.set(address, timeout);
  }
  /** Cancel a pending reconnect timeout for the given address. */
  _cancelReconnect(address) {
    const timeout = this._reconnectTimeouts.get(address);
    if (timeout !== void 0) {
      clearTimeout(timeout);
      this._reconnectTimeouts.delete(address);
    }
  }
  _getConnectionInfo(address) {
    return this.connections.find((connection) => connection.address === address && RemoteAgentHostConnectionStatus.isConnected(connection.status));
  }
  _getConfiguredEntries(targetSettings = false) {
    let entries = this._getSettings(targetSettings).entries.filter(isRawRemoteAgentHostEntry).filter((entry) => !isLegacySshRawEntry(entry)).map((entry) => WEBSOCKET_ENTRY_TYPE_CONFIG.fromRaw(entry));
    for (const entry of this._getStoredSSHEntries()) {
      entries = this._upsertEntry(entries, entry);
    }
    return entries;
  }
  _upsertEntry(entries, entry) {
    const address = this._entryAddress(entry);
    const existingIndex = entries.findIndex((candidate) => this._entryAddress(candidate) === address);
    return existingIndex === -1 ? [...entries, entry] : entries.map((candidate, index) => index === existingIndex ? entry : candidate);
  }
  _getSettings(targetOnly = false) {
    const inspected = this._configurationService.inspect(RemoteAgentHostsSettingId);
    const target = inspected.userLocalValue !== void 0 ? ConfigurationTarget.USER_LOCAL : inspected.userRemoteValue !== void 0 ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER;
    return {
      target,
      entries: !targetOnly ? this._configurationService.getValue(RemoteAgentHostsSettingId) ?? [] : target === ConfigurationTarget.USER_LOCAL ? inspected.userLocalValue ?? [] : target === ConfigurationTarget.USER_REMOTE ? inspected.userRemoteValue ?? [] : inspected.userValue ?? []
    };
  }
  /**
   * Writes both durable projections of `entries`, which must be the full
   * merged set. Entries are keyed globally by normalized address, so a
   * replacement can move an address between stores; writing only the
   * destination would leave the source row behind for
   * {@link _getConfiguredEntries} to resurrect. Each store is left
   * untouched when its projection is unchanged.
   */
  async _storeConfiguredEntries(entries) {
    const settingsRaw = [];
    const storageRaw = [];
    for (const entry of entries) {
      const config = getEntryTypeConfig(entry.connection.type);
      if (config.store === "runtime") {
        continue;
      }
      (config.store === "storage" ? storageRaw : settingsRaw).push(config.toRaw(entry, entry.connection));
    }
    this._storeStoredSSHEntries(storageRaw);
    const settings = this._getSettings(true);
    if (JSON.stringify(settings.entries) !== JSON.stringify(settingsRaw)) {
      await this._configurationService.updateValue(RemoteAgentHostsSettingId, settingsRaw, settings.target);
    }
  }
  _getStoredSSHEntries() {
    const raw = this._storageService.get(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isRawRemoteAgentHostEntry).filter(isLegacySshRawEntry).map((entry) => SSH_ENTRY_TYPE_CONFIG.fromRaw(entry)) : [];
    } catch {
      return [];
    }
  }
  _storeStoredSSHEntries(entries) {
    const raw = JSON.stringify(entries);
    const stored = this._storageService.get(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
    if (stored === raw) {
      return;
    }
    if (entries.length === 0) {
      if (stored !== void 0) {
        this._storageService.remove(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
      }
      return;
    }
    this._storageService.store(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.USER);
  }
  _migrateSSHEntriesFromSetting() {
    const settings = this._getSettings(true);
    const legacyEntries = settings.entries.filter(isRawRemoteAgentHostEntry).map(parseLegacyRawEntry);
    const sshEntries = legacyEntries.filter((entry) => getEntryTypeConfig(entry.connection.type).store === "storage");
    if (sshEntries.length === 0) {
      return;
    }
    let migratedEntries = this._getStoredSSHEntries();
    for (const entry of sshEntries) {
      migratedEntries = this._upsertEntry(migratedEntries, entry);
    }
    const settingsEntries = legacyEntries.filter((entry) => getEntryTypeConfig(entry.connection.type).store === "settings");
    this._storeConfiguredEntries([...migratedEntries, ...settingsEntries]).catch((err) => {
      this._logService.error("[RemoteAgentHost] Failed to migrate SSH connection details from settings to storage", err);
    });
  }
  _getOrCreateConnectionWait(address) {
    let wait = this._pendingConnectionWaits.get(address);
    if (wait) {
      return wait;
    }
    const existingConnection = this._getConnectionInfo(address);
    if (existingConnection) {
      const immediateWait = new DeferredPromise();
      immediateWait.complete(existingConnection);
      return immediateWait;
    }
    wait = new DeferredPromise();
    this._pendingConnectionWaits.set(address, wait);
    return wait;
  }
  _resolvePendingConnectionWait(address) {
    const wait = this._pendingConnectionWaits.get(address);
    const connection = this._getConnectionInfo(address);
    if (!wait || !connection) {
      return;
    }
    this._pendingConnectionWaits.delete(address);
    void wait.complete(connection);
  }
  _rejectPendingConnectionWait(address, err) {
    const wait = this._pendingConnectionWaits.get(address);
    if (!wait) {
      return;
    }
    this._pendingConnectionWaits.delete(address);
    void wait.error(err);
  }
  /**
   * Register (or re-register) the {@link AGENT_HOST_SCHEME} label formatter
   * for the given address so that {@link ILabelService.getHostLabel} resolves
   * to the entry's human-readable name. Called when an entry is added or its
   * name changes.
   */
  _updateHostLabelFormatter(address, name) {
    this._clearHostLabelFormatter(address);
    const handle = this._labelService.registerFormatter({
      scheme: AGENT_HOST_SCHEME,
      authority: agentHostAuthority(address),
      priority: true,
      formatting: {
        ...AGENT_HOST_LABEL_FORMATTER.formatting,
        workspaceSuffix: name
      }
    });
    this._labelFormatters.set(address, handle);
  }
  _clearHostLabelFormatter(address) {
    const existing = this._labelFormatters.get(address);
    if (existing) {
      existing.dispose();
      this._labelFormatters.delete(address);
    }
  }
  dispose() {
    for (const timeout of this._reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this._reconnectTimeouts.clear();
    this._reconnectAttempts.clear();
    for (const [address, wait] of this._pendingConnectionWaits) {
      void wait.error(new Error(`Remote agent host service disposed before connecting to ${address}`));
    }
    this._pendingConnectionWaits.clear();
    for (const entry of this._entries.values()) {
      disposeEntry(entry);
    }
    this._entries.clear();
    for (const handle of this._labelFormatters.values()) {
      handle.dispose();
    }
    this._labelFormatters.clear();
    super.dispose();
  }
};
RemoteAgentHostService.ConnectionWaitTimeout = 1e4;
/** Initial reconnect delay in milliseconds. */
RemoteAgentHostService.ReconnectInitialDelay = 1e3;
/** Maximum reconnect delay in milliseconds. */
RemoteAgentHostService.ReconnectMaxDelay = 3e4;
/**
 * How long to wait for a server-upgrade trigger to be acknowledged.
 * The CLI awaits the binary download synchronously before responding,
 * so this needs to accommodate first-time downloads on slow networks.
 */
RemoteAgentHostService.UpgradeRequestTimeout = 5 * 60 * 1e3;
RemoteAgentHostService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService)
], RemoteAgentHostService);
let AgentsWindowRemoteAgentHostService = class extends RemoteAgentHostService {
  get clientInfo() {
    return agentsWindowAgentHostClientInfo;
  }
  constructor(configurationService, instantiationService, logService, labelService, environmentService, storageService) {
    super(configurationService, instantiationService, logService, labelService, environmentService, storageService);
  }
};
AgentsWindowRemoteAgentHostService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService)
], AgentsWindowRemoteAgentHostService);
export {
  AgentsWindowRemoteAgentHostService,
  RemoteAgentHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxicm93c2VyXFxyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIFNlcnZpY2UgaW1wbGVtZW50YXRpb24gdGhhdCBtYW5hZ2VzIFdlYlNvY2tldCBjb25uZWN0aW9ucyB0byByZW1vdGUgYWdlbnRcbi8vIGhvc3QgcHJvY2Vzc2VzLiBSZWFkcyBXZWJTb2NrZXQgYWRkcmVzc2VzIGZyb20gdGhlIGBjaGF0LnJlbW90ZUFnZW50SG9zdHNgXG4vLyBzZXR0aW5nIGFuZCBTU0ggY29ubmVjdGlvbiBkZXRhaWxzIGZyb20gc3RvcmFnZSwgdGhlbiBtYWludGFpbnMgY29ubmVjdGlvbnMuXG5cbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuaW1wb3J0IHsgQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkLCB0eXBlIElBZ2VudENvbm5lY3Rpb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLFxuXHRSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCxcblx0UmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZCxcblx0U1NIX0VOVFJZX1RZUEVfQ09ORklHLFxuXHRXRUJTT0NLRVRfRU5UUllfVFlQRV9DT05GSUcsXG5cdGdldEVudHJ5VHlwZUNvbmZpZyxcblx0cGFyc2VMZWdhY3lSYXdFbnRyeSxcblx0dHlwZSBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnksXG5cdHR5cGUgSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvLFxuXHR0eXBlIElSZW1vdGVBZ2VudEhvc3RFbnRyeSxcbn0gZnJvbSAnLi4vY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQsIEFnZW50SG9zdENsaWVudFN0YXRlIH0gZnJvbSAnLi9yZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC5qcyc7XG5pbXBvcnQgeyBXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnQgfSBmcm9tICcuL3dlYlNvY2tldENsaWVudFRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0xBQkVMX0ZPUk1BVFRFUiwgQUdFTlRfSE9TVF9TQ0hFTUUsIGFnZW50SG9zdEF1dGhvcml0eSwgbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHR5cGUgSVZzY29kZVVwZ3JhZGVSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2xVcGdyYWRlLmpzJztcbmltcG9ydCB7IGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8sIGVkaXRvcldpbmRvd0FnZW50SG9zdENsaWVudEluZm8gfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5cbmNvbnN0IFNTSF9SRU1PVEVfQUdFTlRfSE9TVFNfU1RPUkFHRV9LRVkgPSAncmVtb3RlQWdlbnRIb3N0LnNzaENvbm5lY3Rpb25zJztcblxuLyoqIFRyYWNrcyBhIHNpbmdsZSByZW1vdGUgY29ubmVjdGlvbiB0aHJvdWdoIGl0cyBsaWZlY3ljbGUuICovXG5pbnRlcmZhY2UgSUNvbm5lY3Rpb25FbnRyeSB7XG5cdHJlYWRvbmx5IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGNsaWVudDogUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQ7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCB0ZWFyZG93biBmb3IgdGhlIHNoYXJlZC1wcm9jZXNzIHR1bm5lbCB0aGF0IHRoaXMgZW50cnknc1xuXHQgKiB0cmFuc3BvcnQgaXMgdXNpbmcgKFNTSCBvciBkZXYtdHVubmVscykuIFRyYWNrZWQgc2VwYXJhdGVseSBmcm9tXG5cdCAqIHtAbGluayBzdG9yZX0gYmVjYXVzZSBvbiByZWNvbm5lY3QgdGhlIG5ldyBlbnRyeSB0YWtlcyBvd25lcnNoaXAgb2Zcblx0ICogdGhlIHNhbWUgdW5kZXJseWluZyBjb25uZWN0aW9uSWQgXHUyMDE0IHJ1bm5pbmcgdGhlIG9sZCB0ZWFyZG93biB3b3VsZFxuXHQgKiBkaXNjb25uZWN0IHRoZSBmcmVzaGx5LWVzdGFibGlzaGVkIHR1bm5lbCBhcyBhIHNpZGUgZWZmZWN0LlxuXHQgKi9cblx0cmVhZG9ubHkgdHJhbnNwb3J0RGlzcG9zYWJsZT86IElEaXNwb3NhYmxlO1xuXHRjb25uZWN0ZWQ6IGJvb2xlYW47XG5cdC8qKiBDdXJyZW50IGNvbm5lY3Rpb24gc3RhdHVzIGZvciBVSSBkaXNwbGF5LiAqL1xuXHRzdGF0dXM6IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM7XG59XG5cbmZ1bmN0aW9uIGRpc3Bvc2VFbnRyeShlbnRyeTogSUNvbm5lY3Rpb25FbnRyeSk6IHZvaWQge1xuXHRlbnRyeS5zdG9yZS5kaXNwb3NlKCk7XG5cdGVudHJ5LnRyYW5zcG9ydERpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcbn1cblxuZnVuY3Rpb24gaXNSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeSB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWUgYXMgUGFydGlhbDxSZWNvcmQ8a2V5b2YgSVJhd1JlbW90ZUFnZW50SG9zdEVudHJ5LCB1bmtub3duPj47XG5cdHJldHVybiB0eXBlb2YgY2FuZGlkYXRlLmFkZHJlc3MgPT09ICdzdHJpbmcnXG5cdFx0JiYgdHlwZW9mIGNhbmRpZGF0ZS5uYW1lID09PSAnc3RyaW5nJ1xuXHRcdCYmIChjYW5kaWRhdGUuY29ubmVjdGlvblRva2VuID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIGNhbmRpZGF0ZS5jb25uZWN0aW9uVG9rZW4gPT09ICdzdHJpbmcnKVxuXHRcdCYmIChjYW5kaWRhdGUuc3NoQ29uZmlnSG9zdCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBjYW5kaWRhdGUuc3NoQ29uZmlnSG9zdCA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKGNhbmRpZGF0ZS5zc2hIb3N0TmFtZSA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBjYW5kaWRhdGUuc3NoSG9zdE5hbWUgPT09ICdzdHJpbmcnKVxuXHRcdCYmIChjYW5kaWRhdGUuc3NoVXNlciA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBjYW5kaWRhdGUuc3NoVXNlciA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKGNhbmRpZGF0ZS5zc2hQb3J0ID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIGNhbmRpZGF0ZS5zc2hQb3J0ID09PSAnbnVtYmVyJyk7XG59XG5cbmZ1bmN0aW9uIGlzTGVnYWN5U3NoUmF3RW50cnkoZW50cnk6IElSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZW50cnkuc3NoQ29uZmlnSG9zdCAhPT0gdW5kZWZpbmVkXG5cdFx0fHwgZW50cnkuc3NoSG9zdE5hbWUgIT09IHVuZGVmaW5lZFxuXHRcdHx8IGVudHJ5LnNzaFVzZXIgIT09IHVuZGVmaW5lZFxuXHRcdHx8IGVudHJ5LnNzaFBvcnQgIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFJlbW90ZUFnZW50SG9zdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2Uge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDb25uZWN0aW9uV2FpdFRpbWVvdXQgPSAxMDAwMDtcblx0LyoqIEluaXRpYWwgcmVjb25uZWN0IGRlbGF5IGluIG1pbGxpc2Vjb25kcy4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUmVjb25uZWN0SW5pdGlhbERlbGF5ID0gMTAwMDtcblx0LyoqIE1heGltdW0gcmVjb25uZWN0IGRlbGF5IGluIG1pbGxpc2Vjb25kcy4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUmVjb25uZWN0TWF4RGVsYXkgPSAzMDAwMDtcblx0LyoqXG5cdCAqIEhvdyBsb25nIHRvIHdhaXQgZm9yIGEgc2VydmVyLXVwZ3JhZGUgdHJpZ2dlciB0byBiZSBhY2tub3dsZWRnZWQuXG5cdCAqIFRoZSBDTEkgYXdhaXRzIHRoZSBiaW5hcnkgZG93bmxvYWQgc3luY2hyb25vdXNseSBiZWZvcmUgcmVzcG9uZGluZyxcblx0ICogc28gdGhpcyBuZWVkcyB0byBhY2NvbW1vZGF0ZSBmaXJzdC10aW1lIGRvd25sb2FkcyBvbiBzbG93IG5ldHdvcmtzLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVXBncmFkZVJlcXVlc3RUaW1lb3V0ID0gNSAqIDYwICogMTAwMDtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbm5lY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbm5lY3Rpb25FbnRyeT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbmFtZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbnMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPigpO1xuXHQvKipcblx0ICogU3RvcmVzIHRoZSBvcmlnaW5hbCB7QGxpbmsgSVJlbW90ZUFnZW50SG9zdEVudHJ5fSBmb3IgY29ubmVjdGlvbnNcblx0ICogcmVnaXN0ZXJlZCB2aWEge0BsaW5rIGFkZE1hbmFnZWRDb25uZWN0aW9ufS4gVGhpcyBpcyBuZWVkZWQgYmVjYXVzZVxuXHQgKiB0dW5uZWwgZW50cmllcyBhcmUgbm90IHBlcnNpc3RlZCB0byBzZXR0aW5ncyBhbmQgdGhlcmVmb3JlIGRvbid0XG5cdCAqIGFwcGVhciBpbiB7QGxpbmsgY29uZmlndXJlZEVudHJpZXN9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0ZXJlZEVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSVJlbW90ZUFnZW50SG9zdEVudHJ5PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ29ubmVjdGlvbldhaXRzID0gbmV3IE1hcDxzdHJpbmcsIERlZmVycmVkUHJvbWlzZTxJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8+PigpO1xuXHQvKiogUGVuZGluZyByZWNvbm5lY3QgdGltZW91dHMsIGtleWVkIGJ5IG5vcm1hbGl6ZWQgYWRkcmVzcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb25uZWN0VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4+KCk7XG5cdC8qKiBDdXJyZW50IHJlY29ubmVjdCBhdHRlbXB0IGNvdW50IHBlciBhZGRyZXNzIGZvciBleHBvbmVudGlhbCBiYWNrb2ZmLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbm5lY3RBdHRlbXB0cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdC8qKlxuXHQgKiBQZXItYWRkcmVzcyB7QGxpbmsgSUxhYmVsU2VydmljZX0gZm9ybWF0dGVyIGhhbmRsZXMgZm9yIHRoZVxuXHQgKiB7QGxpbmsgQUdFTlRfSE9TVF9TQ0hFTUV9LiBUaGUgZm9ybWF0dGVyIGFkdmVydGlzZXMgdGhlIGVudHJ5J3Ncblx0ICogaHVtYW4tcmVhZGFibGUgbmFtZSBhcyB0aGUgaG9zdCBsYWJlbCBzbyBhbnkgVUkgbG9va2luZyB1cCB0aGUgaG9zdFxuXHQgKiBsYWJlbCBmb3IgYW4gYWdlbnQgaG9zdCBVUkkgZ2V0cyB0aGUgZnJpZW5kbHkgbmFtZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsRm9ybWF0dGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblxuXHRwcm90ZWN0ZWQgZ2V0IGNsaWVudEluZm8oKSB7XG5cdFx0cmV0dXJuIGVkaXRvcldpbmRvd0FnZW50SG9zdENsaWVudEluZm87XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFJlYWN0IHRvIHNldHRpbmcgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMuX3JlY29uY2lsZUNvbm5lY3Rpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTU0hfUkVNT1RFX0FHRU5UX0hPU1RTX1NUT1JBR0VfS0VZLCB0aGlzLl9zdG9yZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlQ29ubmVjdGlvbnMoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX21pZ3JhdGVTU0hFbnRyaWVzRnJvbVNldHRpbmcoKTtcblxuXHRcdC8vIEluaXRpYWwgY29ubmVjdGlvblxuXHRcdHRoaXMuX3JlY29uY2lsZUNvbm5lY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnRyeUFkZHJlc3MoZW50cnk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY29uZmlnID0gZ2V0RW50cnlUeXBlQ29uZmlnKGVudHJ5LmNvbm5lY3Rpb24udHlwZSk7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGNvbmZpZy5hZGRyZXNzKGVudHJ5LmNvbm5lY3Rpb24pO1xuXHRcdHJldHVybiBjb25maWcubm9ybWFsaXplZEFkZHJlc3MgPyBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGFkZHJlc3MpIDogYWRkcmVzcztcblx0fVxuXG5cdHByaXZhdGUgX25vcm1hbGl6ZUVudHJ5KGVudHJ5OiBJUmVtb3RlQWdlbnRIb3N0RW50cnkpOiBJUmVtb3RlQWdlbnRIb3N0RW50cnkge1xuXHRcdGNvbnN0IGNvbmZpZyA9IGdldEVudHJ5VHlwZUNvbmZpZyhlbnRyeS5jb25uZWN0aW9uLnR5cGUpO1xuXHRcdC8vIGBoYXNLZXlgIG5hcnJvd3MgdGhlIGNvbm5lY3Rpb24gdW5pb24gZm9yIHRoZSBzcHJlYWQgYmVsb3c7XG5cdFx0Ly8gYG5vcm1hbGl6ZWRBZGRyZXNzYCBpcyB0aGUgYWN0dWFsIHBvbGljeSAob25seSB0dW5uZWxzIG9wdCBvdXQpLlxuXHRcdGlmICghY29uZmlnLm5vcm1hbGl6ZWRBZGRyZXNzIHx8ICFoYXNLZXkoZW50cnkuY29ubmVjdGlvbiwgeyBhZGRyZXNzOiB0cnVlIH0pKSB7XG5cdFx0XHRyZXR1cm4gZW50cnk7XG5cdFx0fVxuXHRcdHJldHVybiB7IC4uLmVudHJ5LCBjb25uZWN0aW9uOiB7IC4uLmVudHJ5LmNvbm5lY3Rpb24sIGFkZHJlc3M6IG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MoZW50cnkuY29ubmVjdGlvbi5hZGRyZXNzKSB9IH07XG5cdH1cblxuXHRnZXQgY29ubmVjdGlvbnMoKTogcmVhZG9ubHkgSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBlbnRyeV0gb2YgdGhpcy5fZW50cmllcykge1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRhZGRyZXNzLFxuXHRcdFx0XHRuYW1lOiB0aGlzLl9uYW1lcy5nZXQoYWRkcmVzcykgPz8gYWRkcmVzcyxcblx0XHRcdFx0Y2xpZW50SWQ6IGVudHJ5LmNsaWVudC5jbGllbnRJZCxcblx0XHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogZW50cnkuY2xpZW50LmRlZmF1bHREaXJlY3RvcnksXG5cdFx0XHRcdHN0YXR1czogZW50cnkuc3RhdHVzLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXQgY29uZmlndXJlZEVudHJpZXMoKTogcmVhZG9ubHkgSVJlbW90ZUFnZW50SG9zdEVudHJ5W10ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRDb25maWd1cmVkRW50cmllcygpLm1hcChlbnRyeSA9PiB0aGlzLl9ub3JtYWxpemVFbnRyeShlbnRyeSkpO1xuXHR9XG5cblx0Z2V0Q29ubmVjdGlvbihhZGRyZXNzOiBzdHJpbmcpOiBJQWdlbnRDb25uZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyhhZGRyZXNzKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KG5vcm1hbGl6ZWQpO1xuXHRcdHJldHVybiBlbnRyeT8uY29ubmVjdGVkID8gZW50cnkuY2xpZW50IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0Q29ubmVjdGlvbkJ5QXV0aG9yaXR5KGF1dGhvcml0eTogc3RyaW5nKTogSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzcywgZW50cnldIG9mIHRoaXMuX2VudHJpZXMpIHtcblx0XHRcdGlmIChlbnRyeS5jb25uZWN0ZWQgJiYgYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpID09PSBhdXRob3JpdHkpIHtcblx0XHRcdFx0cmV0dXJuIGVudHJ5LmNsaWVudDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEVudHJ5QnlBZGRyZXNzKGFkZHJlc3M6IHN0cmluZyk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MoYWRkcmVzcyk7XG5cdFx0Ly8gQ2hlY2sgZHluYW1pY2FsbHkgcmVnaXN0ZXJlZCBlbnRyaWVzIGZpcnN0IChlLmcuIHR1bm5lbCBjb25uZWN0aW9uc1xuXHRcdC8vIHRoYXQgYXJlIG5vdCBwZXJzaXN0ZWQgdG8gc2V0dGluZ3MpLlxuXHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSB0aGlzLl9yZWdpc3RlcmVkRW50cmllcy5nZXQobm9ybWFsaXplZCk7XG5cdFx0aWYgKHJlZ2lzdGVyZWQpIHtcblx0XHRcdHJldHVybiByZWdpc3RlcmVkO1xuXHRcdH1cblx0XHQvLyBGYWxsIGJhY2sgdG8gY29uZmlndXJlZCBlbnRyaWVzIGZyb20gc2V0dGluZ3MuXG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJlZEVudHJpZXMuZmluZChcblx0XHRcdGVudHJ5ID0+IHRoaXMuX2VudHJ5QWRkcmVzcyhlbnRyeSkgPT09IG5vcm1hbGl6ZWRcblx0XHQpO1xuXHR9XG5cblx0YXN5bmMgdHJpZ2dlclNlcnZlclVwZ3JhZGUoYWRkcmVzczogc3RyaW5nLCBtZXRob2Q6IHN0cmluZyk6IFByb21pc2U8SVZzY29kZVVwZ3JhZGVSZXN1bHQ+IHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyhhZGRyZXNzKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KG5vcm1hbGl6ZWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gcmVtb3RlIGFnZW50IGhvc3QgZW50cnkgZm91bmQgZm9yICR7YWRkcmVzc30uYCk7XG5cdFx0fVxuXHRcdC8vIFRoZSBwcm90b2NvbCBjbGllbnQgbWF5IGJlIGluIGFueSBzdGF0ZTogaXQgbWlnaHQgaGF2ZSBjb21wbGV0ZWRcblx0XHQvLyB0aGUgaGFuZHNoYWtlIChDb25uZWN0ZWQpIG9yIGl0IG1pZ2h0IGJlIHNpdHRpbmcgb24gYW5cblx0XHQvLyBgaW5jb21wYXRpYmxlYCBmYWlsdXJlIHdpdGggdGhlIHRyYW5zcG9ydCBzdGlsbCBvcGVuLiBFaXRoZXIgd2F5XG5cdFx0Ly8gd2Ugc2VuZCB0aGUgdXBncmFkZSByZXF1ZXN0IGFzIGEgcmF3IEpTT04tUlBDIGNhbGwgdXNpbmcgdGhlXG5cdFx0Ly8gbWV0aG9kIG5hbWUgdGhlIGhvc3QgYWR2ZXJ0aXNlZCBpbiBpdHMgYF9tZXRhYCBwYXlsb2FkOyB0aGVcblx0XHQvLyBzZXJ2ZXIgaGFuZGxlciBhbGxvd3MgaXQgcHJlLWBpbml0aWFsaXplYC5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChcblx0XHRcdGVudHJ5LmNsaWVudC50cmlnZ2VyVnNjb2RlVXBncmFkZShtZXRob2QpLFxuXHRcdFx0UmVtb3RlQWdlbnRIb3N0U2VydmljZS5VcGdyYWRlUmVxdWVzdFRpbWVvdXQsXG5cdFx0KTtcblx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2VydmVyIHVwZ3JhZGUgcmVxdWVzdCB0aW1lZCBvdXQgYWZ0ZXIgJHtSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLlVwZ3JhZGVSZXF1ZXN0VGltZW91dH1tcy5gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHJlY29ubmVjdChhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyhhZGRyZXNzKTtcblxuXHRcdC8vIFNTSC90dW5uZWwgZW50cmllcyBhcmUgcmVjb25uZWN0ZWQgYnkgdGhlaXIgcmVzcGVjdGl2ZSBzZXJ2aWNlc1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRFbnRyeSA9IHRoaXMuX2dldENvbmZpZ3VyZWRFbnRyaWVzKCkuZmluZChcblx0XHRcdGVudHJ5ID0+IHRoaXMuX2VudHJ5QWRkcmVzcyhlbnRyeSkgPT09IG5vcm1hbGl6ZWRcblx0XHQpO1xuXHRcdGlmIChjb25maWd1cmVkRW50cnkgJiYgIWdldEVudHJ5VHlwZUNvbmZpZyhjb25maWd1cmVkRW50cnkuY29ubmVjdGlvbi50eXBlKS5zZWxmQ29ubmVjdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fdG9rZW5zLmdldChub3JtYWxpemVkKTtcblxuXHRcdC8vIENhbmNlbCBhbnkgcGVuZGluZyByZWNvbm5lY3Rcblx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3Qobm9ybWFsaXplZCk7XG5cdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZGVsZXRlKG5vcm1hbGl6ZWQpO1xuXG5cdFx0Ly8gVGVhciBkb3duIGV4aXN0aW5nIGNvbm5lY3Rpb24gaWYgcHJlc2VudFxuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQobm9ybWFsaXplZCk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShub3JtYWxpemVkKTtcblx0XHRcdGVudHJ5LnN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBTdGFydCBmcmVzaCBjb25uZWN0aW9uIGF0dGVtcHRcblx0XHR0aGlzLl9jb25uZWN0VG8obm9ybWFsaXplZCwgdG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgYWRkUmVtb3RlQWdlbnRIb3N0KGlucHV0OiBJUmVtb3RlQWdlbnRIb3N0RW50cnkpOiBQcm9taXNlPElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbz4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbW90ZSBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIGFyZSBub3QgZW5hYmxlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX25vcm1hbGl6ZUVudHJ5KGlucHV0KTtcblx0XHRjb25zdCBhZGRyZXNzID0gdGhpcy5fZW50cnlBZGRyZXNzKGVudHJ5KTtcblx0XHRjb25zdCBleGlzdGluZ0Nvbm5lY3Rpb24gPSB0aGlzLl9nZXRDb25uZWN0aW9uSW5mbyhhZGRyZXNzKTtcblx0XHRjb25zdCBjb25maWcgPSBnZXRFbnRyeVR5cGVDb25maWcoZW50cnkuY29ubmVjdGlvbi50eXBlKTtcblx0XHRpZiAoY29uZmlnLnN0b3JlICE9PSAncnVudGltZScpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3N0b3JlQ29uZmlndXJlZEVudHJpZXModGhpcy5fdXBzZXJ0RW50cnkodGhpcy5fZ2V0Q29uZmlndXJlZEVudHJpZXModHJ1ZSksIGVudHJ5KSk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4aXN0aW5nQ29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uZXhpc3RpbmdDb25uZWN0aW9uLFxuXHRcdFx0XHRuYW1lOiBlbnRyeS5uYW1lLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoIWNvbmZpZy5zZWxmQ29ubmVjdGluZykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWRkcmVzcyxcblx0XHRcdFx0bmFtZTogZW50cnkubmFtZSxcblx0XHRcdFx0Y2xpZW50SWQ6ICcnLFxuXHRcdFx0XHRzdGF0dXM6IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25uZWN0ZWRDb25uZWN0aW9uID0gdGhpcy5fZ2V0Q29ubmVjdGlvbkluZm8oYWRkcmVzcyk7XG5cdFx0aWYgKGNvbm5lY3RlZENvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiBjb25uZWN0ZWRDb25uZWN0aW9uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhaXQgPSB0aGlzLl9nZXRPckNyZWF0ZUNvbm5lY3Rpb25XYWl0KGFkZHJlc3MpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCByYWNlVGltZW91dCh3YWl0LnAsIFJlbW90ZUFnZW50SG9zdFNlcnZpY2UuQ29ubmVjdGlvbldhaXRUaW1lb3V0LCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdGlvbldhaXRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR9KTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGltZWQgb3V0IGNvbm5lY3RpbmcgdG8gJHthZGRyZXNzfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb25uZWN0aW9uO1xuXHR9XG5cblx0YXN5bmMgYWRkTWFuYWdlZENvbm5lY3Rpb24oZW50cnk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeSwgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgdHJhbnNwb3J0RGlzcG9zYWJsZT86IElEaXNwb3NhYmxlLCBzdGF0dXMgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCk6IFByb21pc2U8SVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvPiB7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVtb3RlIGFnZW50IGhvc3QgY29ubmVjdGlvbnMgYXJlIG5vdCBlbmFibGVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZHJlc3MgPSB0aGlzLl9lbnRyeUFkZHJlc3MoZW50cnkpO1xuXG5cdFx0Ly8gRGlzcG9zZSBhbnkgZXhpc3RpbmcgZW50cnkgZm9yIHRoaXMgYWRkcmVzcyB0byBhdm9pZCBsZWFraW5nXG5cdFx0Ly8gb2xkIHByb3RvY29sIGNsaWVudHMgYW5kIHJlbGF5IHRyYW5zcG9ydHMgb24gcmVjb25uZWN0LlxuXHRcdC8vXG5cdFx0Ly8gQ1JJVElDQUw6IHdlIGRlbGliZXJhdGVseSBkbyBOT1QgcnVuIHRoZSBleGlzdGluZyBlbnRyeSdzXG5cdFx0Ly8gdHJhbnNwb3J0RGlzcG9zYWJsZS4gT24gYSByZWNvbm5lY3QgdG8gdGhlIHNhbWUgYWRkcmVzcywgdGhlXG5cdFx0Ly8gc2hhcmVkLXByb2Nlc3MgdHVubmVsIGtleWVkIGJ5IGNvbm5lY3Rpb25JZCBpcyBhbHJlYWR5IG93bmVkIGJ5XG5cdFx0Ly8gdGhlIG5ldyBjb25uZWN0aW9uIHdlIGp1c3QgZXN0YWJsaXNoZWQuIFJ1bm5pbmcgdGhlIG9sZCB0ZWFyZG93blxuXHRcdC8vIHdvdWxkIGNhbGwgX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3QoY29ubmVjdGlvbklkKSBhbmQgaW1tZWRpYXRlbHlcblx0XHQvLyBraWxsIHRoZSBicmFuZC1uZXcgdHVubmVsLlxuXHRcdGNvbnN0IGV4aXN0aW5nRW50cnkgPSB0aGlzLl9lbnRyaWVzLmdldChhZGRyZXNzKTtcblx0XHRpZiAoZXhpc3RpbmdFbnRyeSkge1xuXHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHRleGlzdGluZ0VudHJ5LnN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIENyZWF0ZSBhIGNvbm5lY3Rpb24gZW50cnkgd3JhcHBpbmcgdGhlIHByZS1jb25uZWN0ZWQgY2xpZW50XG5cdFx0Y29uc3QgcHJvdG9jb2xDbGllbnQgPSBjb25uZWN0aW9uIGFzIFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50O1xuXHRcdHN0b3JlLmFkZChwcm90b2NvbENsaWVudCk7XG5cdFx0Y29uc3QgY29ubkVudHJ5OiBJQ29ubmVjdGlvbkVudHJ5ID0geyBzdG9yZSwgY2xpZW50OiBwcm90b2NvbENsaWVudCwgdHJhbnNwb3J0RGlzcG9zYWJsZSwgY29ubmVjdGVkOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKHN0YXR1cyksIHN0YXR1cyB9O1xuXHRcdHRoaXMuX2VudHJpZXMuc2V0KGFkZHJlc3MsIGNvbm5FbnRyeSk7XG5cdFx0dGhpcy5fbmFtZXMuc2V0KGFkZHJlc3MsIGVudHJ5Lm5hbWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzLnNldChhZGRyZXNzLCBlbnRyeSk7XG5cdFx0dGhpcy5fdXBkYXRlSG9zdExhYmVsRm9ybWF0dGVyKGFkZHJlc3MsIGVudHJ5Lm5hbWUpO1xuXHRcdGlmIChlbnRyeS5jb25uZWN0aW9uVG9rZW4pIHtcblx0XHRcdHRoaXMuX3Rva2Vucy5zZXQoYWRkcmVzcywgZW50cnkuY29ubmVjdGlvblRva2VuKTtcblx0XHR9XG5cblx0XHRzdG9yZS5hZGQocHJvdG9jb2xDbGllbnQub25EaWRDbG9zZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZW50cmllcy5nZXQoYWRkcmVzcykgPT09IGNvbm5FbnRyeSkge1xuXHRcdFx0XHRjb25uRW50cnkuY29ubmVjdGVkID0gZmFsc2U7XG5cdFx0XHRcdGNvbm5FbnRyeS5zdGF0dXMgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZDtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gZ2V0RW50cnlUeXBlQ29uZmlnKGVudHJ5LmNvbm5lY3Rpb24udHlwZSk7XG5cdFx0aWYgKGNvbmZpZy5zdG9yZSAhPT0gJ3J1bnRpbWUnKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zdG9yZUNvbmZpZ3VyZWRFbnRyaWVzKHRoaXMuX3Vwc2VydEVudHJ5KHRoaXMuX2dldENvbmZpZ3VyZWRFbnRyaWVzKHRydWUpLCBlbnRyeSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGFkZHJlc3MsXG5cdFx0XHRuYW1lOiBlbnRyeS5uYW1lLFxuXHRcdFx0Y2xpZW50SWQ6IHByb3RvY29sQ2xpZW50LmNsaWVudElkLFxuXHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogcHJvdG9jb2xDbGllbnQuZGVmYXVsdERpcmVjdG9yeSxcblx0XHRcdHN0YXR1cyxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlUmVtb3RlQWdlbnRIb3N0KGFkZHJlc3M6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGFkZHJlc3MpO1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fcmVnaXN0ZXJlZEVudHJpZXMuZ2V0KG5vcm1hbGl6ZWQpID8/IHRoaXMuX2dldENvbmZpZ3VyZWRFbnRyaWVzKCkuZmluZChlbnRyeSA9PiB0aGlzLl9lbnRyeUFkZHJlc3MoZW50cnkpID09PSBub3JtYWxpemVkKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGdldEVudHJ5VHlwZUNvbmZpZyhlbnRyeS5jb25uZWN0aW9uLnR5cGUpO1xuXHRcdFx0aWYgKGNvbmZpZy5zdG9yZSAhPT0gJ3J1bnRpbWUnKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLl9nZXRDb25maWd1cmVkRW50cmllcyh0cnVlKS5maWx0ZXIoZW50cnkgPT4gdGhpcy5fZW50cnlBZGRyZXNzKGVudHJ5KSAhPT0gbm9ybWFsaXplZCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3N0b3JlQ29uZmlndXJlZEVudHJpZXMoZW50cmllcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRWFnZXJseSBjbGVhciBpbi1tZW1vcnkgc3RhdGUgc28gdGhlIFVJIHVwZGF0ZXMgaW1tZWRpYXRlbHlcblx0XHQvLyAodGhlIGNvbmZpZyBjaGFuZ2UgbGlzdGVuZXIgd2lsbCByZWNvbmNpbGUsIGJ1dCB0aGlzIGlzIGluc3RhbnQpLlxuXHRcdHRoaXMuX25hbWVzLmRlbGV0ZShub3JtYWxpemVkKTtcblx0XHR0aGlzLl90b2tlbnMuZGVsZXRlKG5vcm1hbGl6ZWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzLmRlbGV0ZShub3JtYWxpemVkKTtcblx0XHR0aGlzLl9jbGVhckhvc3RMYWJlbEZvcm1hdHRlcihub3JtYWxpemVkKTtcblx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3Qobm9ybWFsaXplZCk7XG5cdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZGVsZXRlKG5vcm1hbGl6ZWQpO1xuXHRcdHRoaXMuX3JlbW92ZUNvbm5lY3Rpb24obm9ybWFsaXplZCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVDb25uZWN0aW9uKGFkZHJlc3M6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRcdGRpc3Bvc2VFbnRyeShlbnRyeSk7XG5cdFx0XHR0aGlzLl9yZWplY3RQZW5kaW5nQ29ubmVjdGlvbldhaXQoYWRkcmVzcywgbmV3IEVycm9yKGBDb25uZWN0aW9uIGNsb3NlZDogJHthZGRyZXNzfWApKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdG5vdGlmeUNvbm5lY3Rpb25DbG9zZWQoYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MoYWRkcmVzcyk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnRyaWVzLmdldChub3JtYWxpemVkKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gbm90aWZ5Q29ubmVjdGlvbkNsb3NlZDogbm90aWZ5aW5nIHByb3RvY29sIGNsaWVudCBmb3IgJHtub3JtYWxpemVkfWApO1xuXHRcdFx0ZW50cnkuY2xpZW50Lm5vdGlmeVRyYW5zcG9ydENsb3NlZCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIG5vdGlmeUNvbm5lY3Rpb25DbG9zZWQ6IG5vIGVudHJ5IGZvdW5kIGZvciAke25vcm1hbGl6ZWR9IChhbHJlYWR5IHJlbW92ZWQ/KWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZUNvbm5lY3Rpb25zKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHQvLyBEaXNjb25uZWN0IGFsbCB3aGVuIGRpc2FibGVkXG5cdFx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgWy4uLnRoaXMuX2VudHJpZXMua2V5cygpXSkge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3QoYWRkcmVzcyk7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZUNvbm5lY3Rpb24oYWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9uYW1lcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fdG9rZW5zLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9yZWNvbm5lY3RBdHRlbXB0cy5jbGVhcigpO1xuXHRcdFx0Ly8gRHJvcCBsYWJlbCBmb3JtYXR0ZXJzIGZvciBlbnRyaWVzIG5vIGxvbmdlciByZXByZXNlbnRlZCBieSBhblxuXHRcdFx0Ly8gYWN0aXZlIGNvbm5lY3Rpb24gb3IgYSBkeW5hbWljYWxseSByZWdpc3RlcmVkIGVudHJ5LiBDb25uZWN0aW9uc1xuXHRcdFx0Ly8gYWRkZWQgdmlhIHtAbGluayBhZGRNYW5hZ2VkQ29ubmVjdGlvbn0gKGUuZy4gdHVubmVscykgbGl2ZSBvdXRzaWRlXG5cdFx0XHQvLyB0aGUgY29uZmlndXJlZC1lbnRyaWVzIHNldCBhbmQgbXVzdCBrZWVwIHRoZWlyIGZvcm1hdHRlci5cblx0XHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiBbLi4udGhpcy5fbGFiZWxGb3JtYXR0ZXJzLmtleXMoKV0pIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9yZWdpc3RlcmVkRW50cmllcy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0XHR0aGlzLl9jbGVhckhvc3RMYWJlbEZvcm1hdHRlcihhZGRyZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRFbnRyaWVzID0gdGhpcy5fZ2V0Q29uZmlndXJlZEVudHJpZXMoKTtcblx0XHRjb25zdCBlbnRyaWVzV2l0aEFkZHJlc3MgPSBjb25maWd1cmVkRW50cmllcy5tYXAoZW50cnkgPT4gKHsgZW50cnksIGFkZHJlc3M6IHRoaXMuX2VudHJ5QWRkcmVzcyhlbnRyeSkgfSkpO1xuXHRcdGNvbnN0IGRlc2lyZWQgPSBuZXcgU2V0KGVudHJpZXNXaXRoQWRkcmVzcy5tYXAoZSA9PiBlLmFkZHJlc3MpKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gUmVjb25jaWxpbmc6IGRlc2lyZWQ9WyR7Wy4uLmRlc2lyZWRdLmpvaW4oJywgJyl9XSwgY3VycmVudD1bJHtbLi4udGhpcy5fZW50cmllcy5rZXlzKCldLm1hcChhID0+IGAke2F9KCR7dGhpcy5fZW50cmllcy5nZXQoYSkhLmNvbm5lY3RlZCA/ICdjb25uZWN0ZWQnIDogJ3BlbmRpbmcnfSlgKS5qb2luKCcsICcpfV1gKTtcblxuXHRcdC8vIFVwZGF0ZSBuYW1lIG1hcCBhbmQgZGV0ZWN0IG5hbWUgY2hhbmdlcyBmb3IgZXhpc3RpbmcgY29ubmVjdGlvbnNcblx0XHRsZXQgbmFtZXNDaGFuZ2VkID0gZmFsc2U7XG5cdFx0Y29uc3Qgb2xkTmFtZXMgPSBuZXcgTWFwKHRoaXMuX25hbWVzKTtcblx0XHR0aGlzLl9uYW1lcy5jbGVhcigpO1xuXHRcdHRoaXMuX3Rva2Vucy5jbGVhcigpO1xuXHRcdC8vIFJ1bnRpbWUtcmVnaXN0ZXJlZCBjb25uZWN0aW9ucyBhcmUgbm90IHBhcnQgb2YgdGhlIHBlcnNpc3RlZCBzZXQsIHNvXG5cdFx0Ly8gc2VlZCB0aGVpciBtZXRhZGF0YSBmaXJzdDsgd2l0aG91dCB0aGlzIGEgbGl2ZSB0dW5uZWwvV1NML2Nsb3VkXG5cdFx0Ly8gY29ubmVjdGlvbiBzdXJ2aXZlcyByZWNvbmNpbGUgYnV0IHJlcG9ydHMgaXRzIGFkZHJlc3MgYXMgaXRzIG5hbWUsXG5cdFx0Ly8gd2hpY2ggZG93bnN0cmVhbSBwcm92aWRlciByZWNvbmNpbGlhdGlvbiB0cmVhdHMgYXMgYSByZW5hbWUuXG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzcywgZW50cnldIG9mIHRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzKSB7XG5cdFx0XHR0aGlzLl9uYW1lcy5zZXQoYWRkcmVzcywgZW50cnkubmFtZSk7XG5cdFx0XHR0aGlzLl90b2tlbnMuc2V0KGFkZHJlc3MsIGVudHJ5LmNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgeyBlbnRyeSwgYWRkcmVzcyB9IG9mIGVudHJpZXNXaXRoQWRkcmVzcykge1xuXHRcdFx0dGhpcy5fbmFtZXMuc2V0KGFkZHJlc3MsIGVudHJ5Lm5hbWUpO1xuXHRcdFx0dGhpcy5fdG9rZW5zLnNldChhZGRyZXNzLCBlbnRyeS5jb25uZWN0aW9uVG9rZW4pO1xuXHRcdFx0dGhpcy5fdXBkYXRlSG9zdExhYmVsRm9ybWF0dGVyKGFkZHJlc3MsIGVudHJ5Lm5hbWUpO1xuXHRcdFx0aWYgKHRoaXMuX2VudHJpZXMuaGFzKGFkZHJlc3MpICYmIG9sZE5hbWVzLmdldChhZGRyZXNzKSAhPT0gZW50cnkubmFtZSkge1xuXHRcdFx0XHRuYW1lc0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERyb3AgZm9ybWF0dGVycyBmb3IgYWRkcmVzc2VzIHRoYXQgYXJlIG5vIGxvbmdlciBjb25maWd1cmVkIGFuZFxuXHRcdC8vIG5vdCBkeW5hbWljYWxseSByZWdpc3RlcmVkLlxuXHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiBbLi4udGhpcy5fbGFiZWxGb3JtYXR0ZXJzLmtleXMoKV0pIHtcblx0XHRcdGlmICghZGVzaXJlZC5oYXMoYWRkcmVzcykgJiYgIXRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9jbGVhckhvc3RMYWJlbEZvcm1hdHRlcihhZGRyZXNzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgY29ubmVjdGlvbnMgbm8gbG9uZ2VyIGluIHRoZSBzZXR0aW5nXG5cdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIFsuLi50aGlzLl9lbnRyaWVzLmtleXMoKV0pIHtcblx0XHRcdGlmICghZGVzaXJlZC5oYXMoYWRkcmVzcykgJiYgIXRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIERpc2Nvbm5lY3RpbmcgZnJvbSAke2FkZHJlc3N9YCk7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbFJlY29ubmVjdChhZGRyZXNzKTtcblx0XHRcdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVDb25uZWN0aW9uKGFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBlbnRyaWVzIHRoYXQgdGhpcyBzZXJ2aWNlIG93bnMuXG5cdFx0Zm9yIChjb25zdCB7IGVudHJ5LCBhZGRyZXNzIH0gb2YgZW50cmllc1dpdGhBZGRyZXNzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2VudHJpZXMuaGFzKGFkZHJlc3MpICYmIGdldEVudHJ5VHlwZUNvbmZpZyhlbnRyeS5jb25uZWN0aW9uLnR5cGUpLnNlbGZDb25uZWN0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3RUbyhhZGRyZXNzLCBlbnRyeS5jb25uZWN0aW9uVG9rZW4pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIG9ubHkgbmFtZXMgY2hhbmdlZCAobm8gYWRkL3JlbW92ZSksIG5vdGlmeSBzbyB0aGUgVUkgdXBkYXRlc1xuXHRcdGlmIChuYW1lc0NoYW5nZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Nvbm5lY3RUbyhhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb25Ub2tlbj86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSBhbnkgZXhpc3RpbmcgZW50cnkgZm9yIHRoaXMgYWRkcmVzcyBiZWZvcmUgY3JlYXRpbmcgYSBuZXcgb25lXG5cdFx0Ly8gdG8gYXZvaWQgbGVha2luZyBkaXNwb3NhYmxlcyBvbiByZWNvbm5lY3QuXG5cdFx0Y29uc3QgZXhpc3RpbmdFbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmIChleGlzdGluZ0VudHJ5KSB7XG5cdFx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRcdGV4aXN0aW5nRW50cnkuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFocExvZ2dpbmdFbmFibGVkID0gISF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQpO1xuXHRcdC8vIEZhY3Rvcnkgc28gdGhlIHByb3RvY29sIGNsaWVudCBjYW4gcmVwbGFjZSB0aGUgdW5kZXJseWluZyB0cmFuc3BvcnRcblx0XHQvLyBhY3Jvc3MgdHJhbnNpZW50IGRyb3BzIGFuZCB1c2UgdGhlIGByZWNvbm5lY3RgIFJQQyB0byByZXN1bWUgXHUyMDE0IHNlZVxuXHRcdC8vIHtAbGluayBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudH0uIFRoZSBzdG9yZSBvd25zIG9ubHkgdGhlIGNsaWVudDtcblx0XHQvLyBpbmRpdmlkdWFsIHRyYW5zcG9ydHMgYXJlIG93bmVkIGJ5IHRoZSBjbGllbnQgaXRzZWxmLlxuXHRcdGNvbnN0IHRyYW5zcG9ydEZhY3RvcnkgPSAoKSA9PiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdlYlNvY2tldENsaWVudFRyYW5zcG9ydCxcblx0XHRcdGFkZHJlc3MsXG5cdFx0XHRjb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRhaHBMb2dnaW5nRW5hYmxlZFxuXHRcdFx0XHQ/IHsgbG9nc0hvbWU6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSwgY29ubmVjdGlvbklkOiBhZGRyZXNzLCB0cmFuc3BvcnQ6ICd3ZWJzb2NrZXQnIH1cblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0KTtcblx0XHRjb25zdCBjbGllbnQgPSBzdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQsIGFkZHJlc3MsIHRyYW5zcG9ydEZhY3RvcnksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmNsaWVudEluZm8pKTtcblx0XHRjb25zdCBlbnRyeTogSUNvbm5lY3Rpb25FbnRyeSA9IHsgc3RvcmUsIGNsaWVudCwgY29ubmVjdGVkOiBmYWxzZSwgc3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcgfTtcblx0XHR0aGlzLl9lbnRyaWVzLnNldChhZGRyZXNzLCBlbnRyeSk7XG5cblx0XHQvLyBHdWFyZCBhZ2FpbnN0IHN0YWxlIGNhbGxiYWNrczogb25seSBhY3QgaWYgdGhlXG5cdFx0Ly8gY3VycmVudCBlbnRyeSBmb3IgdGhpcyBhZGRyZXNzIGlzIHN0aWxsIHRoZSBvbmUgd2UgY3JlYXRlZC5cblx0XHRjb25zdCBpc0N1cnJlbnRFbnRyeSA9ICgpID0+IHRoaXMuX2VudHJpZXMuZ2V0KGFkZHJlc3MpID09PSBlbnRyeTtcblxuXHRcdHN0b3JlLmFkZChjbGllbnQub25EaWRDbG9zZSgoKSA9PiB7XG5cdFx0XHRpZiAoIWlzQ3VycmVudEVudHJ5KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUmVtb3RlQWdlbnRIb3N0XSBDb25uZWN0aW9uIGNsb3NlZDogJHthZGRyZXNzfWApO1xuXHRcdFx0ZW50cnkuY29ubmVjdGVkID0gZmFsc2U7XG5cdFx0XHRlbnRyeS5zdGF0dXMgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdFx0Ly8gU2NoZWR1bGUgcmVjb25uZWN0IGlmIHRoZSBhZGRyZXNzIGlzIHN0aWxsIGNvbmZpZ3VyZWQuIFRoaXMgaXNcblx0XHRcdC8vIHRoZSBcImZhdGFsXCIgcGF0aCBcdTIwMTQgdGhlIHByb3RvY29sIGNsaWVudCBhbHJlYWR5IGdhdmUgdXAgaXRzIG93blxuXHRcdFx0Ly8gc29mdC1yZWNvbm5lY3QgYXR0ZW1wdHMgKG9yIGl0IHdhcyBuZXZlciBlbmFibGVkKSwgc28gd2UgcmVidWlsZFxuXHRcdFx0Ly8gZnJvbSBzY3JhdGNoLlxuXHRcdFx0dGhpcy5fc2NoZWR1bGVSZWNvbm5lY3QoYWRkcmVzcywgY29ubmVjdGlvblRva2VuKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWZsZWN0IHRyYW5zaWVudCB0cmFuc3BvcnQgZHJvcHMgYXMgYGNvbm5lY3RpbmdgIHN0YXR1cyAocmF0aGVyXG5cdFx0Ly8gdGhhbiBgZGlzY29ubmVjdGVkYCkgc28gdGhlIFVJIGRvZXNuJ3QgZmxpY2tlciBzZXNzaW9uIGxpc3RzIGludG9cblx0XHQvLyBhbiBlbXB0eSBzdGF0ZSBkdXJpbmcgYSBzb2Z0IHJlY29ubmVjdC5cblx0XHRzdG9yZS5hZGQoY2xpZW50Lm9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlKHN0YXRlID0+IHtcblx0XHRcdGlmICghaXNDdXJyZW50RW50cnkoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nOlxuXHRcdFx0XHRcdGVudHJ5LmNvbm5lY3RlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGVudHJ5LnN0YXR1cyA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZztcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQ6XG5cdFx0XHRcdFx0ZW50cnkuY29ubmVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRlbnRyeS5zdGF0dXMgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZDtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0aW5nOlxuXHRcdFx0XHRjYXNlIEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZTpcblx0XHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQ6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBDb25uZWN0aW5nIHRvICR7YWRkcmVzc31gKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRjbGllbnQuY29ubmVjdCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHN0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyByZW1vdmVkIGJlZm9yZSBjb25uZWN0IHJlc29sdmVkXG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIENvbm5lY3RlZCB0byAke2FkZHJlc3N9YCk7XG5cdFx0XHRlbnRyeS5jb25uZWN0ZWQgPSB0cnVlO1xuXHRcdFx0ZW50cnkuc3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQ7XG5cdFx0XHR0aGlzLl9yZWNvbm5lY3RBdHRlbXB0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlUGVuZGluZ0Nvbm5lY3Rpb25XYWl0KGFkZHJlc3MpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0fSkuY2F0Y2goKGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKCFpc0N1cnJlbnRFbnRyeSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJvdG9jb2wgdmVyc2lvbiBtaXNtYXRjaCBpcyBhIGRldGVybWluaXN0aWMsIHVzZXItdmlzaWJsZVxuXHRcdFx0Ly8gZmFpbHVyZTogdGhlIGhvc3QgZXhwbGljaXRseSB0b2xkIHVzIGl0IGNhbm5vdCBzcGVhayBvdXJcblx0XHRcdC8vIHZlcnNpb24uIFN1cmZhY2UgaXQgYXMgYGluY29tcGF0aWJsZWAgKHNvIHRoZSB3b3Jrc3BhY2UgcGlja2VyXG5cdFx0XHQvLyBjYW4gc2hvdyB0aGUgbWVzc2FnZSkgYW5kIGtlZXAgdGhlIGVudHJ5IGFyb3VuZCBcdTIwMTQgZnV0aWxlXG5cdFx0XHQvLyByZWNvbm5lY3QgYXR0ZW1wdHMgd291bGQganVzdCBzcGluIHVudGlsIHRoZSB1c2VyIHVwZ3JhZGVzXG5cdFx0XHQvLyBlaXRoZXIgc2lkZSwgc28gbGVhdmUgcmVjb3ZlcnkgdG8gdGhlIG1hbnVhbCBgUmVjb25uZWN0YFxuXHRcdFx0Ly8gYWN0aW9uIGluIHRoZSBwaWNrZXIuXG5cdFx0XHRjb25zdCBpbmNvbXBhdGlibGUgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmZyb21Db25uZWN0RXJyb3IoZXJyLCBbUFJPVE9DT0xfVkVSU0lPTl0pO1xuXHRcdFx0aWYgKGluY29tcGF0aWJsZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtSZW1vdGVBZ2VudEhvc3RdIEluY29tcGF0aWJsZSB3aXRoICR7YWRkcmVzc306ICR7aW5jb21wYXRpYmxlLmtpbmQgPT09ICdpbmNvbXBhdGlibGUnID8gaW5jb21wYXRpYmxlLm1lc3NhZ2UgOiAnJ31gKTtcblx0XHRcdFx0ZW50cnkuc3RhdHVzID0gaW5jb21wYXRpYmxlO1xuXHRcdFx0XHR0aGlzLl9yZWNvbm5lY3RBdHRlbXB0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHRcdHRoaXMuX3JlamVjdFBlbmRpbmdDb25uZWN0aW9uV2FpdChhZGRyZXNzLCBlcnIpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbUmVtb3RlQWdlbnRIb3N0XSBGYWlsZWQgdG8gY29ubmVjdCB0byAke2FkZHJlc3N9LiBWZXJpZnkgYWRkcmVzcyBhbmQgY29ubmVjdGlvblRva2VuYCwgZXJyKTtcblx0XHRcdGVudHJ5LnN0YXR1cyA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkO1xuXHRcdFx0Ly8gQ2xlYW4gdXAgdGhlIGZhaWxlZCBlbnRyeVxuXHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHRlbnRyeS5zdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9yZWplY3RQZW5kaW5nQ29ubmVjdGlvbldhaXQoYWRkcmVzcywgZXJyKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdFx0Ly8gU2NoZWR1bGUgcmVjb25uZWN0IGlmIHRoZSBhZGRyZXNzIGlzIHN0aWxsIGNvbmZpZ3VyZWRcblx0XHRcdHRoaXMuX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3MsIGNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2NoZWR1bGUgYSByZWNvbm5lY3QgYXR0ZW1wdCB3aXRoIGV4cG9uZW50aWFsIGJhY2tvZmYuXG5cdCAqIE9ubHkgcmVjb25uZWN0cyBpZiB0aGUgYWRkcmVzcyBpcyBzdGlsbCBpbiB0aGUgY29uZmlndXJlZCBlbnRyaWVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVSZWNvbm5lY3QoYWRkcmVzczogc3RyaW5nLCBjb25uZWN0aW9uVG9rZW4/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBEb24ndCByZWNvbm5lY3QgaWYgdGhlIGFkZHJlc3Mgd2FzIHJlbW92ZWQgZnJvbSBzZXR0aW5nc1xuXHRcdGlmICghdGhpcy5fZ2V0Q29uZmlndXJlZEVudHJpZXMoKS5zb21lKGVudHJ5ID0+IHRoaXMuX2VudHJ5QWRkcmVzcyhlbnRyeSkgPT09IGFkZHJlc3MpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIE5vdCByZWNvbm5lY3RpbmcgdG8gJHthZGRyZXNzfTogbm8gbG9uZ2VyIGNvbmZpZ3VyZWRgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhdHRlbXB0ID0gKHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmdldChhZGRyZXNzKSA/PyAwKSArIDE7XG5cdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuc2V0KGFkZHJlc3MsIGF0dGVtcHQpO1xuXHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5taW4oXG5cdFx0XHRSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLlJlY29ubmVjdEluaXRpYWxEZWxheSAqIE1hdGgucG93KDIsIGF0dGVtcHQgLSAxKSxcblx0XHRcdFJlbW90ZUFnZW50SG9zdFNlcnZpY2UuUmVjb25uZWN0TWF4RGVsYXksXG5cdFx0KTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gU2NoZWR1bGluZyByZWNvbm5lY3QgdG8gJHthZGRyZXNzfSBpbiAke2RlbGF5fW1zIChhdHRlbXB0ICR7YXR0ZW1wdH0pYCk7XG5cblx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3QoYWRkcmVzcyk7XG5cdFx0Y29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVjb25uZWN0VGltZW91dHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0aWYgKHRoaXMuX2dldENvbmZpZ3VyZWRFbnRyaWVzKCkuc29tZShlbnRyeSA9PiB0aGlzLl9lbnRyeUFkZHJlc3MoZW50cnkpID09PSBhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0VG8oYWRkcmVzcywgY29ubmVjdGlvblRva2VuID8/IHRoaXMuX3Rva2Vucy5nZXQoYWRkcmVzcykpO1xuXHRcdFx0fVxuXHRcdH0sIGRlbGF5KTtcblx0XHR0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy5zZXQoYWRkcmVzcywgdGltZW91dCk7XG5cdH1cblxuXHQvKiogQ2FuY2VsIGEgcGVuZGluZyByZWNvbm5lY3QgdGltZW91dCBmb3IgdGhlIGdpdmVuIGFkZHJlc3MuICovXG5cdHByaXZhdGUgX2NhbmNlbFJlY29ubmVjdChhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0aW1lb3V0ID0gdGhpcy5fcmVjb25uZWN0VGltZW91dHMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmICh0aW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdHRoaXMuX3JlY29ubmVjdFRpbWVvdXRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb25uZWN0aW9uSW5mbyhhZGRyZXNzOiBzdHJpbmcpOiBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbm5lY3Rpb25zLmZpbmQoY29ubmVjdGlvbiA9PiBjb25uZWN0aW9uLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uZWN0aW9uLnN0YXR1cykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29uZmlndXJlZEVudHJpZXModGFyZ2V0U2V0dGluZ3MgPSBmYWxzZSk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeVtdIHtcblx0XHRsZXQgZW50cmllcyA9IHRoaXMuX2dldFNldHRpbmdzKHRhcmdldFNldHRpbmdzKS5lbnRyaWVzXG5cdFx0XHQuZmlsdGVyKGlzUmF3UmVtb3RlQWdlbnRIb3N0RW50cnkpXG5cdFx0XHQuZmlsdGVyKGVudHJ5ID0+ICFpc0xlZ2FjeVNzaFJhd0VudHJ5KGVudHJ5KSlcblx0XHRcdC5tYXAoZW50cnkgPT4gV0VCU09DS0VUX0VOVFJZX1RZUEVfQ09ORklHLmZyb21SYXcoZW50cnkpKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2dldFN0b3JlZFNTSEVudHJpZXMoKSkge1xuXHRcdFx0ZW50cmllcyA9IHRoaXMuX3Vwc2VydEVudHJ5KGVudHJpZXMsIGVudHJ5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJpZXM7XG5cdH1cblxuXHRwcml2YXRlIF91cHNlcnRFbnRyeShlbnRyaWVzOiByZWFkb25seSBJUmVtb3RlQWdlbnRIb3N0RW50cnlbXSwgZW50cnk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeSk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeVtdIHtcblx0XHRjb25zdCBhZGRyZXNzID0gdGhpcy5fZW50cnlBZGRyZXNzKGVudHJ5KTtcblx0XHRjb25zdCBleGlzdGluZ0luZGV4ID0gZW50cmllcy5maW5kSW5kZXgoY2FuZGlkYXRlID0+IHRoaXMuX2VudHJ5QWRkcmVzcyhjYW5kaWRhdGUpID09PSBhZGRyZXNzKTtcblx0XHRyZXR1cm4gZXhpc3RpbmdJbmRleCA9PT0gLTFcblx0XHRcdD8gWy4uLmVudHJpZXMsIGVudHJ5XVxuXHRcdFx0OiBlbnRyaWVzLm1hcCgoY2FuZGlkYXRlLCBpbmRleCkgPT4gaW5kZXggPT09IGV4aXN0aW5nSW5kZXggPyBlbnRyeSA6IGNhbmRpZGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTZXR0aW5ncyh0YXJnZXRPbmx5ID0gZmFsc2UpOiB7IHJlYWRvbmx5IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldDsgcmVhZG9ubHkgZW50cmllczogcmVhZG9ubHkgSVJhd1JlbW90ZUFnZW50SG9zdEVudHJ5W10gfSB7XG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnlbXT4oUmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gaW5zcGVjdGVkLnVzZXJMb2NhbFZhbHVlICE9PSB1bmRlZmluZWRcblx0XHRcdD8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMXG5cdFx0XHQ6IGluc3BlY3RlZC51c2VyUmVtb3RlVmFsdWUgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEVcblx0XHRcdFx0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRhcmdldCxcblx0XHRcdGVudHJpZXM6ICF0YXJnZXRPbmx5XG5cdFx0XHRcdD8gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVJhd1JlbW90ZUFnZW50SG9zdEVudHJ5W10+KFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQpID8/IFtdXG5cdFx0XHRcdDogdGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxcblx0XHRcdFx0XHQ/IGluc3BlY3RlZC51c2VyTG9jYWxWYWx1ZSA/PyBbXVxuXHRcdFx0XHRcdDogdGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFXG5cdFx0XHRcdFx0XHQ/IGluc3BlY3RlZC51c2VyUmVtb3RlVmFsdWUgPz8gW11cblx0XHRcdFx0XHRcdDogaW5zcGVjdGVkLnVzZXJWYWx1ZSA/PyBbXSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFdyaXRlcyBib3RoIGR1cmFibGUgcHJvamVjdGlvbnMgb2YgYGVudHJpZXNgLCB3aGljaCBtdXN0IGJlIHRoZSBmdWxsXG5cdCAqIG1lcmdlZCBzZXQuIEVudHJpZXMgYXJlIGtleWVkIGdsb2JhbGx5IGJ5IG5vcm1hbGl6ZWQgYWRkcmVzcywgc28gYVxuXHQgKiByZXBsYWNlbWVudCBjYW4gbW92ZSBhbiBhZGRyZXNzIGJldHdlZW4gc3RvcmVzOyB3cml0aW5nIG9ubHkgdGhlXG5cdCAqIGRlc3RpbmF0aW9uIHdvdWxkIGxlYXZlIHRoZSBzb3VyY2Ugcm93IGJlaGluZCBmb3Jcblx0ICoge0BsaW5rIF9nZXRDb25maWd1cmVkRW50cmllc30gdG8gcmVzdXJyZWN0LiBFYWNoIHN0b3JlIGlzIGxlZnRcblx0ICogdW50b3VjaGVkIHdoZW4gaXRzIHByb2plY3Rpb24gaXMgdW5jaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc3RvcmVDb25maWd1cmVkRW50cmllcyhlbnRyaWVzOiByZWFkb25seSBJUmVtb3RlQWdlbnRIb3N0RW50cnlbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNldHRpbmdzUmF3OiBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnlbXSA9IFtdO1xuXHRcdGNvbnN0IHN0b3JhZ2VSYXc6IElSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBnZXRFbnRyeVR5cGVDb25maWcoZW50cnkuY29ubmVjdGlvbi50eXBlKTtcblx0XHRcdGlmIChjb25maWcuc3RvcmUgPT09ICdydW50aW1lJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdChjb25maWcuc3RvcmUgPT09ICdzdG9yYWdlJyA/IHN0b3JhZ2VSYXcgOiBzZXR0aW5nc1JhdykucHVzaChjb25maWcudG9SYXcoZW50cnksIGVudHJ5LmNvbm5lY3Rpb24pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdG9yZVN0b3JlZFNTSEVudHJpZXMoc3RvcmFnZVJhdyk7XG5cblx0XHRjb25zdCBzZXR0aW5ncyA9IHRoaXMuX2dldFNldHRpbmdzKHRydWUpO1xuXHRcdGlmIChKU09OLnN0cmluZ2lmeShzZXR0aW5ncy5lbnRyaWVzKSAhPT0gSlNPTi5zdHJpbmdpZnkoc2V0dGluZ3NSYXcpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShSZW1vdGVBZ2VudEhvc3RzU2V0dGluZ0lkLCBzZXR0aW5nc1Jhdywgc2V0dGluZ3MudGFyZ2V0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdG9yZWRTU0hFbnRyaWVzKCk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeVtdIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoU1NIX1JFTU9URV9BR0VOVF9IT1NUU19TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkOiB1bmtub3duID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKVxuXHRcdFx0XHQ/IHBhcnNlZC5maWx0ZXIoaXNSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeSkuZmlsdGVyKGlzTGVnYWN5U3NoUmF3RW50cnkpLm1hcChlbnRyeSA9PiBTU0hfRU5UUllfVFlQRV9DT05GSUcuZnJvbVJhdyhlbnRyeSkpXG5cdFx0XHRcdDogW107XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcmVTdG9yZWRTU0hFbnRyaWVzKGVudHJpZXM6IHJlYWRvbmx5IElSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gSlNPTi5zdHJpbmdpZnkoZW50cmllcyk7XG5cdFx0Y29uc3Qgc3RvcmVkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFNTSF9SRU1PVEVfQUdFTlRfSE9TVFNfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKHN0b3JlZCA9PT0gcmF3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKHN0b3JlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTU0hfUkVNT1RFX0FHRU5UX0hPU1RTX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShTU0hfUkVNT1RFX0FHRU5UX0hPU1RTX1NUT1JBR0VfS0VZLCByYXcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgX21pZ3JhdGVTU0hFbnRyaWVzRnJvbVNldHRpbmcoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSB0aGlzLl9nZXRTZXR0aW5ncyh0cnVlKTtcblx0XHRjb25zdCBsZWdhY3lFbnRyaWVzID0gc2V0dGluZ3MuZW50cmllc1xuXHRcdFx0LmZpbHRlcihpc1Jhd1JlbW90ZUFnZW50SG9zdEVudHJ5KVxuXHRcdFx0Lm1hcChwYXJzZUxlZ2FjeVJhd0VudHJ5KTtcblx0XHRjb25zdCBzc2hFbnRyaWVzID0gbGVnYWN5RW50cmllcy5maWx0ZXIoZW50cnkgPT4gZ2V0RW50cnlUeXBlQ29uZmlnKGVudHJ5LmNvbm5lY3Rpb24udHlwZSkuc3RvcmUgPT09ICdzdG9yYWdlJyk7XG5cdFx0aWYgKHNzaEVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG1pZ3JhdGVkRW50cmllcyA9IHRoaXMuX2dldFN0b3JlZFNTSEVudHJpZXMoKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHNzaEVudHJpZXMpIHtcblx0XHRcdG1pZ3JhdGVkRW50cmllcyA9IHRoaXMuX3Vwc2VydEVudHJ5KG1pZ3JhdGVkRW50cmllcywgZW50cnkpO1xuXHRcdH1cblx0XHRjb25zdCBzZXR0aW5nc0VudHJpZXMgPSBsZWdhY3lFbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBnZXRFbnRyeVR5cGVDb25maWcoZW50cnkuY29ubmVjdGlvbi50eXBlKS5zdG9yZSA9PT0gJ3NldHRpbmdzJyk7XG5cdFx0Ly8gT25lIHdyaXRlIG9mIHRoZSB3aG9sZSBtZXJnZWQgc2V0OiBTU0ggZW50cmllcyBsYW5kIGluIHN0b3JhZ2UgYW5kXG5cdFx0Ly8gYXJlIGRyb3BwZWQgZnJvbSBzZXR0aW5ncyBpbiB0aGUgc2FtZSBwYXNzLlxuXHRcdHRoaXMuX3N0b3JlQ29uZmlndXJlZEVudHJpZXMoWy4uLm1pZ3JhdGVkRW50cmllcywgLi4uc2V0dGluZ3NFbnRyaWVzXSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tSZW1vdGVBZ2VudEhvc3RdIEZhaWxlZCB0byBtaWdyYXRlIFNTSCBjb25uZWN0aW9uIGRldGFpbHMgZnJvbSBzZXR0aW5ncyB0byBzdG9yYWdlJywgZXJyKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlQ29ubmVjdGlvbldhaXQoYWRkcmVzczogc3RyaW5nKTogRGVmZXJyZWRQcm9taXNlPElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbz4ge1xuXHRcdGxldCB3YWl0ID0gdGhpcy5fcGVuZGluZ0Nvbm5lY3Rpb25XYWl0cy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKHdhaXQpIHtcblx0XHRcdHJldHVybiB3YWl0O1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBjb25uZWN0aW9uIGlzIGFscmVhZHkgYXZhaWxhYmxlIChmYXN0IGNvbm5lY3QgcmVzb2x2ZWQgYmVmb3JlXG5cdFx0Ly8gdGhlIGNhbGxlciBjYWxsZWQgdXMpLCByZXR1cm4gYW4gaW1tZWRpYXRlbHktY29tcGxldGVkIHdhaXQuXG5cdFx0Y29uc3QgZXhpc3RpbmdDb25uZWN0aW9uID0gdGhpcy5fZ2V0Q29ubmVjdGlvbkluZm8oYWRkcmVzcyk7XG5cdFx0aWYgKGV4aXN0aW5nQ29ubmVjdGlvbikge1xuXHRcdFx0Y29uc3QgaW1tZWRpYXRlV2FpdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvPigpO1xuXHRcdFx0aW1tZWRpYXRlV2FpdC5jb21wbGV0ZShleGlzdGluZ0Nvbm5lY3Rpb24pO1xuXHRcdFx0cmV0dXJuIGltbWVkaWF0ZVdhaXQ7XG5cdFx0fVxuXG5cdFx0d2FpdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvPigpO1xuXHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0aW9uV2FpdHMuc2V0KGFkZHJlc3MsIHdhaXQpO1xuXHRcdHJldHVybiB3YWl0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVBlbmRpbmdDb25uZWN0aW9uV2FpdChhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB3YWl0ID0gdGhpcy5fcGVuZGluZ0Nvbm5lY3Rpb25XYWl0cy5nZXQoYWRkcmVzcyk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX2dldENvbm5lY3Rpb25JbmZvKGFkZHJlc3MpO1xuXHRcdGlmICghd2FpdCB8fCAhY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0aW9uV2FpdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHZvaWQgd2FpdC5jb21wbGV0ZShjb25uZWN0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlamVjdFBlbmRpbmdDb25uZWN0aW9uV2FpdChhZGRyZXNzOiBzdHJpbmcsIGVycjogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IHdhaXQgPSB0aGlzLl9wZW5kaW5nQ29ubmVjdGlvbldhaXRzLmdldChhZGRyZXNzKTtcblx0XHRpZiAoIXdhaXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdGlvbldhaXRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR2b2lkIHdhaXQuZXJyb3IoZXJyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciAob3IgcmUtcmVnaXN0ZXIpIHRoZSB7QGxpbmsgQUdFTlRfSE9TVF9TQ0hFTUV9IGxhYmVsIGZvcm1hdHRlclxuXHQgKiBmb3IgdGhlIGdpdmVuIGFkZHJlc3Mgc28gdGhhdCB7QGxpbmsgSUxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWx9IHJlc29sdmVzXG5cdCAqIHRvIHRoZSBlbnRyeSdzIGh1bWFuLXJlYWRhYmxlIG5hbWUuIENhbGxlZCB3aGVuIGFuIGVudHJ5IGlzIGFkZGVkIG9yIGl0c1xuXHQgKiBuYW1lIGNoYW5nZXMuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVIb3N0TGFiZWxGb3JtYXR0ZXIoYWRkcmVzczogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhckhvc3RMYWJlbEZvcm1hdHRlcihhZGRyZXNzKTtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9sYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiBBR0VOVF9IT1NUX1NDSEVNRSxcblx0XHRcdGF1dGhvcml0eTogYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpLFxuXHRcdFx0cHJpb3JpdHk6IHRydWUsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdC4uLkFHRU5UX0hPU1RfTEFCRUxfRk9STUFUVEVSLmZvcm1hdHRpbmcsXG5cdFx0XHRcdHdvcmtzcGFjZVN1ZmZpeDogbmFtZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0dGhpcy5fbGFiZWxGb3JtYXR0ZXJzLnNldChhZGRyZXNzLCBoYW5kbGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJIb3N0TGFiZWxGb3JtYXR0ZXIoYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9sYWJlbEZvcm1hdHRlcnMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0ZXhpc3RpbmcuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbGFiZWxGb3JtYXR0ZXJzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdGltZW91dCBvZiB0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy52YWx1ZXMoKSkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy5jbGVhcigpO1xuXHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzcywgd2FpdF0gb2YgdGhpcy5fcGVuZGluZ0Nvbm5lY3Rpb25XYWl0cykge1xuXHRcdFx0dm9pZCB3YWl0LmVycm9yKG5ldyBFcnJvcihgUmVtb3RlIGFnZW50IGhvc3Qgc2VydmljZSBkaXNwb3NlZCBiZWZvcmUgY29ubmVjdGluZyB0byAke2FkZHJlc3N9YCkpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdGlvbldhaXRzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9lbnRyaWVzLnZhbHVlcygpKSB7XG5cdFx0XHRkaXNwb3NlRW50cnkoZW50cnkpO1xuXHRcdH1cblx0XHR0aGlzLl9lbnRyaWVzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBoYW5kbGUgb2YgdGhpcy5fbGFiZWxGb3JtYXR0ZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9sYWJlbEZvcm1hdHRlcnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50c1dpbmRvd1JlbW90ZUFnZW50SG9zdFNlcnZpY2UgZXh0ZW5kcyBSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0IGNsaWVudEluZm8oKSB7XG5cdFx0cmV0dXJuIGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm87XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29uZmlndXJhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsb2dTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVNBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsaUJBQWlCLG1CQUFtQjtBQUM3QyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxjQUFjO0FBRXZCLFNBQVMseUNBQWdFO0FBQ3pFO0FBQUEsRUFFQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BSU07QUFDUCxTQUFTLCtCQUErQiw0QkFBNEI7QUFDcEUsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFB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
