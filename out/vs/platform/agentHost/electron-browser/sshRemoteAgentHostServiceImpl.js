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
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { ILogService } from "../../log/common/log.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IDialogService } from "../../dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { INotificationService, Severity } from "../../notification/common/notification.js";
import { toAction } from "../../../base/common/actions.js";
import { IProductService } from "../../product/common/productService.js";
import { ISharedProcessService } from "../../ipc/electron-browser/services.js";
import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from "../common/remoteAgentHostService.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IQuickInputService } from "../../quickinput/common/quickInput.js";
import { AhpJsonlLogger } from "../common/ahpJsonlLogger.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../common/agentService.js";
import { IRemoteAgentHostLocationPreferenceService } from "../common/remoteAgentHostLocationPreference.js";
import { promptRemoteAgentHostLocationPreference } from "../common/remoteAgentHostLocationPreferenceDialog.js";
import { SSHRelayTransport } from "./sshRelayTransport.js";
import { RemoteAgentHostProtocolClient } from "../browser/remoteAgentHostProtocolClient.js";
import { agentsWindowAgentHostClientInfo } from "../common/agentHostClientInfo.js";
import { PROTOCOL_VERSION } from "../common/state/protocol/version/registry.js";
import {
  SSH_REMOTE_AGENT_HOST_CHANNEL,
  computeSSHConnectionKey
} from "../common/sshRemoteAgentHost.js";
import { ISSHHostKeyTrustService } from "../common/sshHostKeyTrust.js";
import { decideHostKeyTrust } from "../common/sshHostKeyPolicy.js";
function describeHostKeyType(keyType) {
  switch (keyType) {
    case "ssh-ed25519":
      return "ED25519";
    case "ssh-rsa":
    case "rsa-sha2-256":
    case "rsa-sha2-512":
      return "RSA";
    case "ssh-dss":
      return "DSA";
    case "ecdsa-sha2-nistp256":
    case "ecdsa-sha2-nistp384":
    case "ecdsa-sha2-nistp521":
      return "ECDSA";
    default:
      return keyType;
  }
}
const ISSHRelayClientFactory = createDecorator("sshRelayClientFactory");
let SSHRelayClientFactory = class {
  constructor(_instantiationService, _configurationService, _environmentService) {
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._environmentService = _environmentService;
  }
  createClient(mainService, connectionId, address) {
    const ahpLoggingEnabled = !!this._configurationService.getValue(AgentHostAhpJsonlLoggingSettingId);
    const logger = ahpLoggingEnabled ? this._instantiationService.createInstance(
      AhpJsonlLogger,
      { logsHome: this._environmentService.logsHome, connectionId, transport: "ssh" }
    ) : void 0;
    const transport = this._instantiationService.createInstance(SSHRelayTransport, connectionId, mainService, logger);
    return this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transport, void 0, void 0, agentsWindowAgentHostClientInfo);
  }
};
SSHRelayClientFactory = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEnvironmentService)
], SSHRelayClientFactory);
let SSHRemoteAgentHostService = class extends Disposable {
  constructor(sharedProcessService, _remoteAgentHostService, _logService, _configurationService, _relayClientFactory, _quickInputService, _notificationService, _locationPreferenceService, _dialogService, _productService, _hostKeyTrustService) {
    super();
    this._remoteAgentHostService = _remoteAgentHostService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._relayClientFactory = _relayClientFactory;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._locationPreferenceService = _locationPreferenceService;
    this._dialogService = _dialogService;
    this._productService = _productService;
    this._hostKeyTrustService = _hostKeyTrustService;
    this._onDidChangeConnections = this._register(new Emitter());
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._connections = /* @__PURE__ */ new Map();
    /**
     * The server type ('editor' or 'standalone') of the last successfully
     * established connection for a given (stable) connection address.
     * Deliberately NOT cleared when a connection closes (see
     * `onDidCloseConnection` below) — it needs to survive disconnect cleanup
     * so a later automatic reconnect can detect an editor→standalone
     * failover and surface a one-time notification. Only ever updated after
     * a connection has fully and successfully registered.
     */
    this._lastConnectedServerTypeByAddress = /* @__PURE__ */ new Map();
    /**
     * The host key that authenticated the most recent session for a given
     * connection key. Used to decide whether an `UpdateHostKeys` announcement
     * may be trusted (see {@link _handleAnnouncedHostKeys}). Bounded by the
     * number of distinct SSH hosts, and each entry is overwritten on reconnect.
     */
    this._sessionHostKeys = /* @__PURE__ */ new Map();
    this._mainService = ProxyChannel.toService(
      sharedProcessService.getChannel(SSH_REMOTE_AGENT_HOST_CHANNEL)
    );
    this.onDidReportConnectProgress = this._mainService.onDidReportConnectProgress;
    this._register(this._mainService.onDidCloseConnection((connectionId) => {
      this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: connectionId=${connectionId}`);
      const handle = this._connections.get(connectionId);
      if (handle) {
        this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: found handle for ${connectionId}, cleaning up`);
        this._connections.delete(connectionId);
        handle.fireClose();
        handle.dispose();
        this._onDidChangeConnections.fire();
        this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: notifying protocol client for ${handle.localAddress}`);
        this._remoteAgentHostService.notifyConnectionClosed(handle.localAddress);
      } else {
        this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: no renderer-side handle for ${connectionId} (already cleaned up?)`);
      }
    }));
    this._register(this._mainService.onDidRequestKeyboardInteractive((request) => {
      this._handleKeyboardInteractiveRequest(request);
    }));
    this._register(this._mainService.onDidRequestEndpointSelection((request) => {
      this._handleEndpointSelectionRequest(request);
    }));
    this._register(this._mainService.onDidRequestHostKeyVerification((request) => {
      this._trackHostKeyVerification(this._handleHostKeyVerificationRequest(request));
    }));
    this._register(this._mainService.onDidAnnounceHostKeys((announcement) => {
      this._handleAnnouncedHostKeys(announcement);
    }));
  }
  get connections() {
    return [...this._connections.values()];
  }
  async connect(config) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const augmentedConfig = this._augmentConfig(config);
    this._logService.info(`[SSHRemoteAgentHost] Connecting to ${config.host}`);
    const result = await this._mainService.connect(augmentedConfig);
    this._logService.trace(`[SSHRemoteAgentHost] SSH tunnel established, connectionId=${result.connectionId}`);
    return this._setupConnection(result, config.userInitiated ?? true);
  }
  async disconnect(host) {
    await this._mainService.disconnect(host);
  }
  async listSSHConfigHosts() {
    return this._mainService.listSSHConfigHosts();
  }
  async ensureUserSSHConfig() {
    return this._mainService.ensureUserSSHConfig();
  }
  async listSSHConfigFiles() {
    return this._mainService.listSSHConfigFiles();
  }
  async resolveSSHConfig(host) {
    return this._mainService.resolveSSHConfig(host);
  }
  async reconnect(sshConfigHost, name, userInitiated) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const commandOverride = this._getRemoteAgentHostCommand();
    const agentForward = this._isSSHAgentForwardingEnabled();
    const preferredAgentLocation = this._locationPreferenceService.getPreference(computeSSHConnectionKey({ sshConfigHost }));
    this._logService.info(`[SSHRemoteAgentHost] Reconnecting to ${sshConfigHost} (userInitiated=${userInitiated ?? true})`);
    const result = await this._mainService.reconnect(sshConfigHost, name, commandOverride, agentForward, userInitiated, preferredAgentLocation);
    return this._setupConnection(result, userInitiated ?? true);
  }
  /**
   * Build the renderer-side handle, do the protocol handshake, and register
   * with IRemoteAgentHostService. Any failure after the shared-process tunnel
   * was established tears it back down so we don't leak it.
   */
  async _setupConnection(result, userInitiated) {
    const existing = this._connections.get(result.connectionId);
    if (existing) {
      if (this._remoteAgentHostService.getConnection(result.address)) {
        this._logService.trace("[SSHRemoteAgentHost] Returning existing connection handle");
        return existing;
      }
      this._logService.info(`[SSHRemoteAgentHost] Replacing stale connection handle for ${result.address}`);
      this._connections.delete(result.connectionId);
      existing.fireClose();
      existing.dispose();
      this._onDidChangeConnections.fire();
    }
    let registeredHandle = false;
    const protocolClient = this._createRelayClient(result);
    let status = RemoteAgentHostConnectionStatus.connected;
    let connectError;
    try {
      await protocolClient.connect();
      this._logService.trace("[SSHRemoteAgentHost] Protocol handshake completed");
    } catch (err) {
      const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
      if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
        this._logService.error("[SSHRemoteAgentHost] Connection setup failed", err);
        protocolClient.dispose();
        this._mainService.disconnect(result.connectionId).catch(() => {
        });
        throw err;
      }
      this._logService.warn(`[SSHRemoteAgentHost] Incompatible with ${result.address}: ${incompatible.message}`);
      status = incompatible;
      connectError = err;
    }
    const handle = new SSHAgentHostConnectionHandle(
      result.config,
      result.address,
      result.name,
      result.serverType,
      result.instanceId,
      result.primary,
      result.lifecycle,
      () => this._mainService.disconnect(result.connectionId)
    );
    try {
      this._connections.set(result.connectionId, handle);
      registeredHandle = true;
      this._onDidChangeConnections.fire();
      await this._remoteAgentHostService.addManagedConnection({
        name: result.name,
        connectionToken: result.connectionToken,
        connection: {
          type: RemoteAgentHostEntryType.SSH,
          address: result.address,
          sshConfigHost: result.sshConfigHost,
          hostName: result.config.host,
          user: result.config.username || void 0,
          port: result.config.port
        }
      }, protocolClient, this._createTransportDisposable(result.connectionId, handle), status);
    } catch (err) {
      this._logService.error("[SSHRemoteAgentHost] Connection setup failed", err);
      if (registeredHandle && this._connections.get(result.connectionId) === handle) {
        this._connections.delete(result.connectionId);
        this._onDidChangeConnections.fire();
      }
      handle.dispose();
      protocolClient.dispose();
      this._mainService.disconnect(result.connectionId).catch(() => {
      });
      throw err;
    }
    if (connectError) {
      throw connectError;
    }
    this._recordEndpointSelection(result, userInitiated);
    return handle;
  }
  /**
   * Update the last-known server type for {@link result.address}, and — if
   * this was an automatic/background reconnect (`userInitiated === false`)
   * that moved this stable remote address from a previously connected
   * `editor`-owned endpoint to a newly selected `standalone` endpoint —
   * surface a single informational notification. Never fires for the
   * initial connect to a remote (no prior recorded server type), a
   * user-initiated reconnect, or a same-kind transition
   * (editor→editor/standalone→standalone).
   */
  _recordEndpointSelection(result, userInitiated) {
    if (!result.serverType) {
      return;
    }
    const previousServerType = this._lastConnectedServerTypeByAddress.get(result.address);
    const isUnattendedFailoverFromEditor = userInitiated === false && previousServerType === "editor" && result.serverType === "standalone";
    this._lastConnectedServerTypeByAddress.set(result.address, result.serverType);
    if (isUnattendedFailoverFromEditor) {
      this._notificationService.info(localize(
        "sshEditorAgentHostReplacedByStandalone",
        "The editor agent host exited. Reconnected to a dedicated agent host. In-progress work may have been interrupted."
      ));
    }
  }
  /**
   * Build a disposable that the {@link IRemoteAgentHostService} will own
   * for the lifetime of this entry. When the entry is removed (either by
   * the user via "Remove Remote" or by config reconciliation), this runs
   * and tears down the renderer-side handle and the shared-process SSH
   * tunnel together. Without this hookup, the SSH tunnel would leak and
   * the next `connect()` would silently reuse it.
   */
  _createTransportDisposable(connectionId, handle) {
    return toDisposable(() => {
      if (this._connections.get(connectionId) === handle) {
        this._connections.delete(connectionId);
        this._onDidChangeConnections.fire();
      }
      handle.fireClose();
      handle.dispose();
      this._mainService.disconnect(connectionId).catch(() => {
      });
    });
  }
  _createRelayClient(result) {
    return this._relayClientFactory.createClient(this._mainService, result.connectionId, result.address);
  }
  _augmentConfig(config) {
    const result = { ...config };
    const commandOverride = this._getRemoteAgentHostCommand();
    if (commandOverride) {
      result.remoteAgentHostCommand = commandOverride;
    }
    if (this._isSSHAgentForwardingEnabled() && config.agentForward) {
      result.agentForward = true;
    }
    const preferredAgentLocation = this._locationPreferenceService.getPreference(computeSSHConnectionKey(config));
    if (preferredAgentLocation) {
      result.preferredAgentLocation = preferredAgentLocation;
    }
    return result;
  }
  _getRemoteAgentHostCommand() {
    return this._configurationService.getValue("chat.sshRemoteAgentHostCommand") || void 0;
  }
  _isSSHAgentForwardingEnabled() {
    return this._configurationService.getValue("chat.agentHost.forwardSSHAgent") || void 0;
  }
  /**
   * Show a quick-input prompt for each entry in a keyboard-interactive
   * challenge and forward the responses (or cancel) back to the main service.
   *
   * The renderer collects all prompts up front before responding so the
   * server gets a single batched answer set, matching how OpenSSH presents
   * keyboard-interactive challenges.
   */
  async _handleKeyboardInteractiveRequest(request) {
    this._logService.info(`[SSHRemoteAgentHost] Keyboard-interactive prompt for ${request.displayHost} (${request.prompts.length} prompt(s))`);
    const cts = new CancellationTokenSource();
    const cancelListener = this._mainService.onDidCancelKeyboardInteractive((requestId) => {
      if (requestId === request.requestId) {
        cts.cancel();
      }
    });
    try {
      if (request.prompts.length === 0) {
        await this._mainService.respondKeyboardInteractive(request.requestId, []);
        return;
      }
      const responses = [];
      for (let i = 0; i < request.prompts.length; i++) {
        if (cts.token.isCancellationRequested) {
          return;
        }
        const prompt = request.prompts[i];
        const cleanedPrompt = prompt.prompt.replace(/[\s:]+$/, "");
        const title = request.prompts.length > 1 ? `${request.displayHost} (${i + 1}/${request.prompts.length})` : request.displayHost;
        const value = await this._quickInputService.input({
          title,
          prompt: cleanedPrompt || localize("sshKbiDefaultPrompt", "Authentication required for {0}@{1}", request.username, request.displayHost),
          password: !prompt.echo,
          ignoreFocusLost: true
        }, cts.token);
        if (cts.token.isCancellationRequested) {
          return;
        }
        if (value === void 0) {
          await this._mainService.respondKeyboardInteractive(request.requestId, void 0);
          return;
        }
        responses.push(value);
      }
      if (cts.token.isCancellationRequested) {
        return;
      }
      await this._mainService.respondKeyboardInteractive(request.requestId, responses);
    } catch (err) {
      this._logService.error("[SSHRemoteAgentHost] Failed handling keyboard-interactive prompt", err);
      try {
        await this._mainService.respondKeyboardInteractive(request.requestId, void 0);
      } catch {
      }
    } finally {
      cancelListener.dispose();
      cts.dispose();
    }
  }
  /**
   * Decide whether to trust a server's host key, and tell the shared process.
   *
   * Policy lives in {@link decideHostKeyTrust}; this method owns the UI and
   * the storage writes. Every path must respond exactly once — the SSH
   * handshake is suspended until it hears back.
   */
  /**
   * Hook for observing when a host key verification has fully settled.
   * Overridden by tests so they can await the real operation instead of
   * sleeping for a fixed interval, which is load-dependent and flaky —
   * particularly for the cases that assert *nothing* happened.
   */
  _trackHostKeyVerification(handled) {
    void handled;
  }
  async _handleHostKeyVerificationRequest(request) {
    this._logService.info(`[SSHRemoteAgentHost] Host key verification for ${request.displayHost}: ${request.keyType} ${request.fingerprint} (known_hosts: ${request.knownHostsMatch})`);
    const cts = new CancellationTokenSource();
    const cancelListener = this._mainService.onDidCancelHostKeyVerification((requestId) => {
      if (requestId === request.requestId) {
        cts.cancel();
      }
    });
    try {
      const decision = decideHostKeyTrust(request, this._hostKeyTrustService.getTrustedKeys(request.host, request.port));
      this._logService.info(`[SSHRemoteAgentHost] Host key decision for ${request.displayHost}: ${decision.kind} (${decision.reason})`);
      let trusted;
      switch (decision.kind) {
        case "trust":
          if (decision.persist) {
            this._trustHostKey(request);
          }
          trusted = true;
          break;
        case "deny":
          this._reportHostKeyDenied(request, decision);
          trusted = false;
          break;
        case "prompt": {
          trusted = await this._promptForHostKey(request, decision.reason, cts.token);
          if (cts.token.isCancellationRequested) {
            return;
          }
          if (trusted) {
            this._trustHostKey(request);
          }
          break;
        }
      }
      if (cts.token.isCancellationRequested) {
        return;
      }
      this._sessionHostKeys.set(request.connectionKey, { keyType: request.keyType, fingerprint: request.fingerprint });
      await this._mainService.respondHostKeyVerification(request.requestId, trusted);
    } catch (err) {
      this._logService.error("[SSHRemoteAgentHost] Failed handling host key verification", err);
      try {
        await this._mainService.respondHostKeyVerification(request.requestId, false);
      } catch {
      }
    } finally {
      cancelListener.dispose();
      cts.dispose();
    }
  }
  _trustHostKey(request) {
    this._hostKeyTrustService.trustHostKey(request.host, request.port, {
      keyType: request.keyType,
      fingerprint: request.fingerprint,
      addedAt: Date.now(),
      ...request.displayHost !== request.host ? { alias: request.displayHost } : void 0
    });
  }
  /**
   * Ask the user whether to trust an unrecognized host key, echoing OpenSSH's
   * wording so it is recognizable to anyone who has used `ssh` directly.
   * Cancel is the default so the safe answer is the one you get by dismissing.
   *
   * Uses a custom dialog so the prompt can be dismissed programmatically when
   * the connection dies underneath it — a native dialog cannot be, and would
   * strand the user with a question about a connection that no longer exists.
   * Answering a stale prompt was always safe (the caller re-checks
   * cancellation before acting), but leaving it on screen is confusing.
   */
  async _promptForHostKey(request, reason, token) {
    if (token.isCancellationRequested) {
      return false;
    }
    const detail = reason === "ca-only" ? localize(
      "sshHostKeyCaOnlyDetail",
      "{0} key fingerprint is {1}.\n\nThis host is configured to use a certificate authority, but certificate-based host keys cannot be verified here, so this key cannot be checked against it.",
      describeHostKeyType(request.keyType),
      request.fingerprint
    ) : localize(
      "sshHostKeyUnknownDetail",
      "{0} key fingerprint is {1}.\n\nVerify this fingerprint matches the host before continuing.",
      describeHostKeyType(request.keyType),
      request.fingerprint
    );
    const { confirmed } = await this._dialogService.confirm({
      type: "warning",
      message: localize("sshHostKeyUnknownMessage", "The authenticity of host '{0}' can't be established.", request.displayHost),
      detail,
      primaryButton: localize("sshHostKeyConnect", "&&Connect"),
      cancelButton: localize("sshHostKeyCancel", "Cancel"),
      custom: { icon: Codicon.shield },
      // Cancellation resolves the dialog as if Cancel was pressed, which
      // is also the answer we want for a connection that is already gone.
      token
    });
    return confirmed;
  }
  /**
   * Explain a refusal. A changed or revoked key gets an error notification
   * with no "trust anyway" affordance — recovering requires explicitly
   * forgetting the host, so a possible impersonation cannot be dismissed
   * with a single reflexive click.
   */
  _reportHostKeyDenied(request, denial) {
    if (denial.reason === "not-user-initiated") {
      this._logService.warn(`[SSHRemoteAgentHost] Declining unknown host key for ${request.displayHost} during a background reconnect; connect manually to review it.`);
      return;
    }
    if (denial.reason === "strict-yes") {
      this._notificationService.error(localize(
        "sshHostKeyStrictUnknown",
        `Can't connect to '{0}': its host key is not known, and StrictHostKeyChecking is set to "yes" in your SSH configuration.`,
        request.displayHost
      ));
      return;
    }
    if (denial.reason !== "mismatch") {
      this._notificationService.error(localize(
        "sshHostKeyRevoked",
        "Host key verification failed for '{0}'. This host's {1} key has been marked as revoked in your known_hosts file. Remove the @revoked line from known_hosts if this key should be trusted again.",
        request.displayHost,
        describeHostKeyType(request.keyType)
      ));
      return;
    }
    if (denial.source === "known-hosts") {
      this._notificationService.error(localize(
        "sshHostKeyChangedKnownHosts",
        "Host key verification failed for '{0}'. Its {1} host key does not match the entry in your known_hosts file, which could mean someone is impersonating the host \u2014 or that the host was legitimately rebuilt. Received {2}. Update or remove the known_hosts entry if this change was expected.",
        request.displayHost,
        describeHostKeyType(request.keyType),
        request.fingerprint
      ));
      return;
    }
    this._notificationService.notify({
      severity: Severity.Error,
      message: localize(
        "sshHostKeyChanged",
        "Host key verification failed for '{0}'. Its {1} host key has changed, which could mean someone is impersonating the host \u2014 or that the host was legitimately rebuilt. Received {2}.",
        request.displayHost,
        describeHostKeyType(request.keyType),
        request.fingerprint
      ),
      actions: {
        primary: [toAction({
          id: "sshHostKey.forget",
          label: localize("sshHostKeyForgetAction", "Forget Saved Host Key"),
          run: () => this._hostKeyTrustService.forgetHost(request.host, request.port)
        })]
      }
    });
  }
  /**
   * Persist host keys the server proved it owns, so a legitimate key
   * rotation is invisible to the user instead of a hard failure on the next
   * connect.
   *
   * ssh2 verifies the `hostkeys-prove` signatures before surfacing these,
   * but that only proves the keys belong to *whoever we are currently
   * talking to* — it says nothing about whether that party is the real host.
   * So we additionally require that the host key which authenticated this
   * very session is itself currently trusted. This mirrors OpenSSH, whose
   * `UpdateHostKeys` documentation states additional host keys are accepted
   * only "if the key used to authenticate the host was already trusted or
   * explicitly accepted by the user".
   *
   * Without that check, a session accepted through
   * `StrictHostKeyChecking=no` — where we deliberately did not verify
   * anything — could announce keys that overwrite the user's genuine stored
   * key, leaving an impostor's key trusted once strict checking is restored.
   */
  _handleAnnouncedHostKeys(announcement) {
    const existing = this._hostKeyTrustService.getTrustedKeys(announcement.host, announcement.port);
    if (!existing.length) {
      return;
    }
    const sessionKey = this._sessionHostKeys.get(announcement.connectionKey);
    if (!sessionKey || !existing.some((e) => e.keyType === sessionKey.keyType && e.fingerprint === sessionKey.fingerprint)) {
      this._logService.warn(`[SSHRemoteAgentHost] Ignoring announced host keys for ${announcement.host}: the key that authenticated this session is not itself trusted`);
      return;
    }
    for (const key of announcement.keys) {
      if (!existing.some((e) => e.keyType === key.keyType && e.fingerprint === key.fingerprint)) {
        this._logService.info(`[SSHRemoteAgentHost] Learned rotated ${key.keyType} host key for ${announcement.host}: ${key.fingerprint}`);
        this._hostKeyTrustService.trustHostKey(announcement.host, announcement.port, {
          keyType: key.keyType,
          fingerprint: key.fingerprint,
          addedAt: Date.now()
        });
      }
    }
  }
  /**
   * Resolve which live remote agent host endpoint (or "start a new one")
   * to connect to and forward the choice (or cancellation) back to the
   * main service. Consults the stored per-host {@link IRemoteAgentHostLocationPreferenceService}
   * preference for `request.connectionKey` first; only opens the shared
   * preference modal ({@link promptRemoteAgentHostLocationPreference})
   * when no preference is stored and an `editor`-owned endpoint is live,
   * since otherwise there's no ambiguity worth interrupting the user for.
   */
  async _handleEndpointSelectionRequest(request) {
    this._logService.info(`[SSHRemoteAgentHost] Endpoint selection requested for ${request.displayHost} (${request.candidates.length} candidate(s))`);
    const cts = new CancellationTokenSource();
    const cancelListener = this._mainService.onDidCancelEndpointSelection((requestId) => {
      if (requestId === request.requestId) {
        cts.cancel();
      }
    });
    try {
      const selection = await this._resolveEndpointSelection(request, cts.token);
      await this._mainService.respondEndpointSelection(request.requestId, selection);
    } catch (err) {
      this._logService.error("[SSHRemoteAgentHost] Failed handling endpoint selection prompt", err);
      try {
        await this._mainService.respondEndpointSelection(request.requestId, void 0);
      } catch {
      }
    } finally {
      cancelListener.dispose();
      cts.dispose();
    }
  }
  /**
   * Apply the preference-resolution rules described on
   * {@link _handleEndpointSelectionRequest}. Returns `undefined` only when
   * the shared preference modal was shown and the user cancelled it.
   */
  async _resolveEndpointSelection(request, token) {
    const hasLiveEditor = request.candidates.some((candidate) => candidate.type === "editor");
    const preference = this._locationPreferenceService.getPreference(request.connectionKey);
    if (preference === "editor") {
      return hasLiveEditor ? this._deterministicSelection(request.candidates, "editor") : this._dedicatedSelection(request.candidates);
    }
    if (preference === "dedicated") {
      return this._dedicatedSelection(request.candidates);
    }
    if (!hasLiveEditor) {
      return this._dedicatedSelection(request.candidates);
    }
    const chosen = await promptRemoteAgentHostLocationPreference(this._dialogService, request.displayHost, this._productService.nameShort, void 0, token);
    if (token.isCancellationRequested || !chosen) {
      return void 0;
    }
    this._locationPreferenceService.setPreference(request.connectionKey, chosen);
    return chosen === "editor" ? this._deterministicSelection(request.candidates, "editor") : this._dedicatedSelection(request.candidates);
  }
  /** Reuse a live standalone endpoint if one exists, or spawn a new dedicated one. */
  _dedicatedSelection(candidates) {
    return this._deterministicSelection(candidates, "standalone") ?? { kind: "spawn" };
  }
  /**
   * Pick the candidate of `type` deterministically when several are live,
   * by sorting on `instanceId` so every renderer resolving the same
   * request (e.g. multiple open editor windows) converges on the same
   * choice without needing to coordinate.
   */
  _deterministicSelection(candidates, type) {
    const matching = candidates.filter((candidate) => candidate.type === type);
    if (matching.length === 0) {
      return void 0;
    }
    const [chosen] = matching.slice().sort((a, b) => a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0);
    return { kind: "candidate", type: chosen.type, pid: chosen.pid, instanceId: chosen.instanceId };
  }
};
SSHRemoteAgentHostService = __decorateClass([
  __decorateParam(0, ISharedProcessService),
  __decorateParam(1, IRemoteAgentHostService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ISSHRelayClientFactory),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IRemoteAgentHostLocationPreferenceService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IProductService),
  __decorateParam(10, ISSHHostKeyTrustService)
], SSHRemoteAgentHostService);
class SSHAgentHostConnectionHandle extends Disposable {
  constructor(config, localAddress, name, serverType, instanceId, primary, lifecycle, disconnectFn) {
    super();
    this.config = config;
    this.localAddress = localAddress;
    this.name = name;
    this.serverType = serverType;
    this.instanceId = instanceId;
    this.primary = primary;
    this.lifecycle = lifecycle;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._closedByMain = false;
    this._register(toDisposable(() => {
      if (!this._closedByMain) {
        disconnectFn().catch(() => {
        });
      }
    }));
  }
  /** Called by the service when the main process signals connection closure. */
  fireClose() {
    this._closedByMain = true;
    this._onDidClose.fire();
  }
}
export {
  ISSHRelayClientFactory,
  SSHRelayClientFactory,
  SSHRemoteAgentHostService,
  describeHostKeyType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxlbGVjdHJvbi1icm93c2VyXFxzc2hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTaGFyZWRQcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL2lwYy9lbGVjdHJvbi1icm93c2VyL3NlcnZpY2VzLmpzJztcbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsIFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZSwgUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBBaHBKc29ubExvZ2dlciB9IGZyb20gJy4uL2NvbW1vbi9haHBKc29ubExvZ2dlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRIb3N0U2VydmVyVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RFbmRwb2ludFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3JlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZS5qcyc7XG5pbXBvcnQgeyBwcm9tcHRSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UgfSBmcm9tICcuLi9jb21tb24vcmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlRGlhbG9nLmpzJztcbmltcG9ydCB7IFNTSFJlbGF5VHJhbnNwb3J0IH0gZnJvbSAnLi9zc2hSZWxheVRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCB9IGZyb20gJy4uL2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuanMnO1xuaW1wb3J0IHsgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQge1xuXHRJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0U1NIX1JFTU9URV9BR0VOVF9IT1NUX0NIQU5ORUwsXG5cdGNvbXB1dGVTU0hDb25uZWN0aW9uS2V5LFxuXHR0eXBlIElTU0hBZ2VudEhvc3RDb25maWcsXG5cdHR5cGUgSVNTSEFnZW50SG9zdENvbm5lY3Rpb24sXG5cdHR5cGUgSVNTSENvbm5lY3RSZXN1bHQsXG5cdHR5cGUgSVNTSEVuZHBvaW50Q2FuZGlkYXRlLFxuXHR0eXBlIElTU0hFbmRwb2ludFNlbGVjdGlvbixcblx0dHlwZSBJU1NIRW5kcG9pbnRTZWxlY3Rpb25SZXF1ZXN0LFxuXHR0eXBlIElTU0hIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdCxcblx0dHlwZSBJU1NISG9zdEtleXNBbm5vdW5jZW1lbnQsXG5cdHR5cGUgSVNTSEtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0LFxuXHR0eXBlIElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSxcblx0dHlwZSBJU1NIUmVzb2x2ZWRDb25maWcsXG5cdHR5cGUgSVNTSENvbm5lY3RQcm9ncmVzcyxcbn0gZnJvbSAnLi4vY29tbW9uL3NzaFJlbW90ZUFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBJU1NISG9zdEtleVRydXN0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zc2hIb3N0S2V5VHJ1c3QuanMnO1xuaW1wb3J0IHsgZGVjaWRlSG9zdEtleVRydXN0LCB0eXBlIFNTSEhvc3RLZXlEZW5pYWwgfSBmcm9tICcuLi9jb21tb24vc3NoSG9zdEtleVBvbGljeS5qcyc7XG5cbi8qKlxuICogSHVtYW4tcmVhZGFibGUgbmFtZSBmb3IgYSBob3N0IGtleSBhbGdvcml0aG0sIG1hdGNoaW5nIGhvdyBPcGVuU1NIIGxhYmVsc1xuICogdGhlbSBpbiBpdHMgb3duIHByb21wdHMgKGUuZy4gXCJFRDI1NTE5IGtleSBmaW5nZXJwcmludCBpcyAuLi5cIikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXNjcmliZUhvc3RLZXlUeXBlKGtleVR5cGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoa2V5VHlwZSkge1xuXHRcdGNhc2UgJ3NzaC1lZDI1NTE5JzogcmV0dXJuICdFRDI1NTE5Jztcblx0XHRjYXNlICdzc2gtcnNhJzpcblx0XHRjYXNlICdyc2Etc2hhMi0yNTYnOlxuXHRcdGNhc2UgJ3JzYS1zaGEyLTUxMic6IHJldHVybiAnUlNBJztcblx0XHRjYXNlICdzc2gtZHNzJzogcmV0dXJuICdEU0EnO1xuXHRcdGNhc2UgJ2VjZHNhLXNoYTItbmlzdHAyNTYnOlxuXHRcdGNhc2UgJ2VjZHNhLXNoYTItbmlzdHAzODQnOlxuXHRcdGNhc2UgJ2VjZHNhLXNoYTItbmlzdHA1MjEnOiByZXR1cm4gJ0VDRFNBJztcblx0XHRkZWZhdWx0OiByZXR1cm4ga2V5VHlwZTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgSVNTSFJlbGF5Q2xpZW50RmFjdG9yeSA9IGNyZWF0ZURlY29yYXRvcjxJU1NIUmVsYXlDbGllbnRGYWN0b3J5Pignc3NoUmVsYXlDbGllbnRGYWN0b3J5Jyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNTSFJlbGF5Q2xpZW50RmFjdG9yeSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0Y3JlYXRlQ2xpZW50KG1haW5TZXJ2aWNlOiBJU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2UsIGNvbm5lY3Rpb25JZDogc3RyaW5nLCBhZGRyZXNzOiBzdHJpbmcpOiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudDtcbn1cblxuZXhwb3J0IGNsYXNzIFNTSFJlbGF5Q2xpZW50RmFjdG9yeSBpbXBsZW1lbnRzIElTU0hSZWxheUNsaWVudEZhY3Rvcnkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0KSB7IH1cblxuXHRjcmVhdGVDbGllbnQobWFpblNlcnZpY2U6IElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSwgY29ubmVjdGlvbklkOiBzdHJpbmcsIGFkZHJlc3M6IHN0cmluZyk6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50IHtcblx0XHRjb25zdCBhaHBMb2dnaW5nRW5hYmxlZCA9ICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkKTtcblx0XHRjb25zdCBsb2dnZXIgPSBhaHBMb2dnaW5nRW5hYmxlZCA/IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QWhwSnNvbmxMb2dnZXIsXG5cdFx0XHR7IGxvZ3NIb21lOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsIGNvbm5lY3Rpb25JZCwgdHJhbnNwb3J0OiAnc3NoJyB9LFxuXHRcdCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU1NIUmVsYXlUcmFuc3BvcnQsIGNvbm5lY3Rpb25JZCwgbWFpblNlcnZpY2UsIGxvZ2dlcik7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LCBhZGRyZXNzLCB0cmFuc3BvcnQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBhZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvKTtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcmVyLXNpZGUgaW1wbGVtZW50YXRpb24gb2Yge0BsaW5rIElTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlfSB0aGF0XG4gKiBkZWxlZ2F0ZXMgdGhlIGFjdHVhbCBTU0ggd29yayB0byB0aGUgbWFpbiBwcm9jZXNzIHZpYSBJUEMsIHRoZW4gcmVnaXN0ZXJzXG4gKiB0aGUgcmVzdWx0aW5nIGNvbm5lY3Rpb24gd2l0aCB0aGUgcmVuZGVyZXItbG9jYWwge0BsaW5rIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlfS5cbiAqL1xuZXhwb3J0IGNsYXNzIFNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYWluU2VydmljZTogSVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb25uZWN0aW9uczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmV2ZW50O1xuXG5cdHJlYWRvbmx5IG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzOiBFdmVudDxJU1NIQ29ubmVjdFByb2dyZXNzPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBTU0hBZ2VudEhvc3RDb25uZWN0aW9uSGFuZGxlPigpO1xuXG5cdC8qKlxuXHQgKiBUaGUgc2VydmVyIHR5cGUgKCdlZGl0b3InIG9yICdzdGFuZGFsb25lJykgb2YgdGhlIGxhc3Qgc3VjY2Vzc2Z1bGx5XG5cdCAqIGVzdGFibGlzaGVkIGNvbm5lY3Rpb24gZm9yIGEgZ2l2ZW4gKHN0YWJsZSkgY29ubmVjdGlvbiBhZGRyZXNzLlxuXHQgKiBEZWxpYmVyYXRlbHkgTk9UIGNsZWFyZWQgd2hlbiBhIGNvbm5lY3Rpb24gY2xvc2VzIChzZWVcblx0ICogYG9uRGlkQ2xvc2VDb25uZWN0aW9uYCBiZWxvdykgXHUyMDE0IGl0IG5lZWRzIHRvIHN1cnZpdmUgZGlzY29ubmVjdCBjbGVhbnVwXG5cdCAqIHNvIGEgbGF0ZXIgYXV0b21hdGljIHJlY29ubmVjdCBjYW4gZGV0ZWN0IGFuIGVkaXRvclx1MjE5MnN0YW5kYWxvbmVcblx0ICogZmFpbG92ZXIgYW5kIHN1cmZhY2UgYSBvbmUtdGltZSBub3RpZmljYXRpb24uIE9ubHkgZXZlciB1cGRhdGVkIGFmdGVyXG5cdCAqIGEgY29ubmVjdGlvbiBoYXMgZnVsbHkgYW5kIHN1Y2Nlc3NmdWxseSByZWdpc3RlcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdENvbm5lY3RlZFNlcnZlclR5cGVCeUFkZHJlc3MgPSBuZXcgTWFwPHN0cmluZywgQWdlbnRIb3N0U2VydmVyVHlwZT4oKTtcblxuXHQvKipcblx0ICogVGhlIGhvc3Qga2V5IHRoYXQgYXV0aGVudGljYXRlZCB0aGUgbW9zdCByZWNlbnQgc2Vzc2lvbiBmb3IgYSBnaXZlblxuXHQgKiBjb25uZWN0aW9uIGtleS4gVXNlZCB0byBkZWNpZGUgd2hldGhlciBhbiBgVXBkYXRlSG9zdEtleXNgIGFubm91bmNlbWVudFxuXHQgKiBtYXkgYmUgdHJ1c3RlZCAoc2VlIHtAbGluayBfaGFuZGxlQW5ub3VuY2VkSG9zdEtleXN9KS4gQm91bmRlZCBieSB0aGVcblx0ICogbnVtYmVyIG9mIGRpc3RpbmN0IFNTSCBob3N0cywgYW5kIGVhY2ggZW50cnkgaXMgb3ZlcndyaXR0ZW4gb24gcmVjb25uZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkhvc3RLZXlzID0gbmV3IE1hcDxzdHJpbmcsIHsga2V5VHlwZTogc3RyaW5nOyBmaW5nZXJwcmludDogc3RyaW5nIH0+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTaGFyZWRQcm9jZXNzU2VydmljZSBzaGFyZWRQcm9jZXNzU2VydmljZTogSVNoYXJlZFByb2Nlc3NTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU1NIUmVsYXlDbGllbnRGYWN0b3J5IHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5Q2xpZW50RmFjdG9yeTogSVNTSFJlbGF5Q2xpZW50RmFjdG9yeSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJU1NISG9zdEtleVRydXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3N0S2V5VHJ1c3RTZXJ2aWNlOiBJU1NISG9zdEtleVRydXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX21haW5TZXJ2aWNlID0gUHJveHlDaGFubmVsLnRvU2VydmljZTxJU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2U+KFxuXHRcdFx0c2hhcmVkUHJvY2Vzc1NlcnZpY2UuZ2V0Q2hhbm5lbChTU0hfUkVNT1RFX0FHRU5UX0hPU1RfQ0hBTk5FTCksXG5cdFx0KTtcblxuXHRcdHRoaXMub25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3MgPSB0aGlzLl9tYWluU2VydmljZS5vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcztcblxuXHRcdC8vIFdoZW4gc2hhcmVkIHByb2Nlc3MgZmlyZXMgb25EaWRDbG9zZUNvbm5lY3Rpb24sIGNsZWFuIHVwIHRoZSByZW5kZXJlci1zaWRlIGhhbmRsZS5cblx0XHQvLyBEbyBOT1QgcmVtb3ZlIHRoZSBjb25maWd1cmVkIGVudHJ5IFx1MjAxNCBpdCBzdGF5cyBwZXJzaXN0ZWQgc28gc3RhcnR1cCByZWNvbm5lY3Rcblx0XHQvLyBjYW4gcmUtZXN0YWJsaXNoIHRoZSBTU0ggdHVubmVsIG9uIG5leHQgbGF1bmNoLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21haW5TZXJ2aWNlLm9uRGlkQ2xvc2VDb25uZWN0aW9uKGNvbm5lY3Rpb25JZCA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIG9uRGlkQ2xvc2VDb25uZWN0aW9uOiBjb25uZWN0aW9uSWQ9JHtjb25uZWN0aW9uSWR9YCk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbklkKTtcblx0XHRcdGlmIChoYW5kbGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU1NIUmVtb3RlQWdlbnRIb3N0XSBvbkRpZENsb3NlQ29ubmVjdGlvbjogZm91bmQgaGFuZGxlIGZvciAke2Nvbm5lY3Rpb25JZH0sIGNsZWFuaW5nIHVwYCk7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZShjb25uZWN0aW9uSWQpO1xuXHRcdFx0XHRoYW5kbGUuZmlyZUNsb3NlKCk7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXG5cdFx0XHRcdC8vIERlZmVuc2UtaW4tZGVwdGg6IGFsc28gc2lnbmFsIHRoZSBwcm90b2NvbCBjbGllbnQgZGlyZWN0bHkuIFRoZVxuXHRcdFx0XHQvLyBTU0hSZWxheVRyYW5zcG9ydCBub3JtYWxseSBvYnNlcnZlcyBgb25EaWRSZWxheUNsb3NlYCAoZmlyZWQgZnJvbVxuXHRcdFx0XHQvLyB0aGUgc2FtZSBzaGFyZWQtcHJvY2VzcyBjb2RlIHBhdGggYXMgdGhpcyBldmVudCkgYW5kIGNhbGxzIGJhY2tcblx0XHRcdFx0Ly8gaW50byB0aGUgY2xpZW50LiBJZiB0aGF0IElQQyBkZWxpdmVyeSBpcyBtaXNzZWQgZm9yIGFueSByZWFzb24sXG5cdFx0XHRcdC8vIHRoZSByZW5kZXJlci1zaWRlIGNsaWVudCB3b3VsZCBzdGF5IGluIGBDb25uZWN0ZWRgIHVudGlsIGl0c1xuXHRcdFx0XHQvLyBsaXZlbmVzcyB3YXRjaGRvZyBmaXJlcyBcdTIwMTQgd2hpY2ggY2FuIHRha2UgaG91cnMgd2hlbiB0aGVcblx0XHRcdFx0Ly8gcmVuZGVyZXIgaXMgYmFja2dyb3VuZGVkIGFuZCBDaHJvbWl1bSB0aHJvdHRsZXMgYHNldFRpbWVvdXRgLlxuXHRcdFx0XHQvLyBVc2UgdGhlIGhhbmRsZSdzIGFkZHJlc3MgKGUuZy4sIFwic3NoOm1hY2Jvb2stYWlyXCIpIHNpbmNlXG5cdFx0XHRcdC8vIFJlbW90ZUFnZW50SG9zdFNlcnZpY2Uga2V5cyBpdHMgY2xpZW50cyBieSBhZGRyZXNzLCBub3QgY29ubmVjdGlvbklkLlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIG9uRGlkQ2xvc2VDb25uZWN0aW9uOiBub3RpZnlpbmcgcHJvdG9jb2wgY2xpZW50IGZvciAke2hhbmRsZS5sb2NhbEFkZHJlc3N9YCk7XG5cdFx0XHRcdHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2Uubm90aWZ5Q29ubmVjdGlvbkNsb3NlZChoYW5kbGUubG9jYWxBZGRyZXNzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1NTSFJlbW90ZUFnZW50SG9zdF0gb25EaWRDbG9zZUNvbm5lY3Rpb246IG5vIHJlbmRlcmVyLXNpZGUgaGFuZGxlIGZvciAke2Nvbm5lY3Rpb25JZH0gKGFscmVhZHkgY2xlYW5lZCB1cD8pYCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQnJpZGdlIGtleWJvYXJkLWludGVyYWN0aXZlIHByb21wdHMgZnJvbSB0aGUgc2hhcmVkIHByb2Nlc3MgdG8gdGhlXG5cdFx0Ly8gcXVpY2sgaW5wdXQgVUkgc28gcGFzc3dvcmQgLyAyRkEgZmFsbGJhY2tzIHdvcmsgZm9yIFNTSCBjb25maWcgaG9zdHNcblx0XHQvLyB3aGVyZSBrZXktYmFzZWQgYXV0aCBmYWlscy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tYWluU2VydmljZS5vbkRpZFJlcXVlc3RLZXlib2FyZEludGVyYWN0aXZlKHJlcXVlc3QgPT4ge1xuXHRcdFx0dGhpcy5faGFuZGxlS2V5Ym9hcmRJbnRlcmFjdGl2ZVJlcXVlc3QocmVxdWVzdCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQnJpZGdlIGVuZHBvaW50LXNlbGVjdGlvbiByZXF1ZXN0cyAobXVsdGlwbGUgbGl2ZSByZW1vdGUgYWdlbnRcblx0XHQvLyBob3N0cyBmb3VuZCBvbiB0aGUgcmVtb3RlKSB0byB0aGUgc3RvcmVkIHBlci1ob3N0IGxvY2F0aW9uXG5cdFx0Ly8gcHJlZmVyZW5jZSwgcHJvbXB0aW5nIHdpdGggdGhlIHNoYXJlZCBwcmVmZXJlbmNlIG1vZGFsIG9ubHkgd2hlblxuXHRcdC8vIG5vIHByZWZlcmVuY2UgaXMgc3RvcmVkIGFuZCBhbiBlZGl0b3Itb3duZWQgZW5kcG9pbnQgaXMgbGl2ZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tYWluU2VydmljZS5vbkRpZFJlcXVlc3RFbmRwb2ludFNlbGVjdGlvbihyZXF1ZXN0ID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZUVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdChyZXF1ZXN0KTtcblx0XHR9KSk7XG5cblx0XHQvLyBWZXJpZnkgc2VydmVyIGhvc3Qga2V5cy4gV2l0aG91dCB0aGlzIHRoZSBzaGFyZWQgcHJvY2VzcyB3b3VsZCBhY2NlcHRcblx0XHQvLyBhbnkga2V5IGZyb20gYW55IHNlcnZlciwgc28gdGhpcyBpcyB3aGF0IGFjdHVhbGx5IG1ha2VzIFNTSCBhZ2VudFxuXHRcdC8vIGhvc3QgY29ubmVjdGlvbnMgcmVzaXN0YW50IHRvIGltcGVyc29uYXRpb24uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbWFpblNlcnZpY2Uub25EaWRSZXF1ZXN0SG9zdEtleVZlcmlmaWNhdGlvbihyZXF1ZXN0ID0+IHtcblx0XHRcdHRoaXMuX3RyYWNrSG9zdEtleVZlcmlmaWNhdGlvbih0aGlzLl9oYW5kbGVIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdChyZXF1ZXN0KSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGVhcm4gaG9zdCBrZXlzIGEgc2VydmVyIHByb3ZlcyBpdCBvd25zIG92ZXIgYW4gYWxyZWFkeS1hdXRoZW50aWNhdGVkXG5cdFx0Ly8gY29ubmVjdGlvbiAoT3BlblNTSCdzIFVwZGF0ZUhvc3RLZXlzKSwgc28gYSBsZWdpdGltYXRlIGtleSByb3RhdGlvblxuXHRcdC8vIGlzIHBpY2tlZCB1cCBzaWxlbnRseSByYXRoZXIgdGhhbiBiZWNvbWluZyBhIGhhcmQgZmFpbHVyZSBsYXRlci5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tYWluU2VydmljZS5vbkRpZEFubm91bmNlSG9zdEtleXMoYW5ub3VuY2VtZW50ID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZUFubm91bmNlZEhvc3RLZXlzKGFubm91bmNlbWVudCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IGNvbm5lY3Rpb25zKCk6IHJlYWRvbmx5IElTU0hBZ2VudEhvc3RDb25uZWN0aW9uW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fY29ubmVjdGlvbnMudmFsdWVzKCldO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdChjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcpOiBQcm9taXNlPElTU0hBZ2VudEhvc3RDb25uZWN0aW9uPiB7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVtb3RlIGFnZW50IGhvc3QgY29ubmVjdGlvbnMgYXJlIG5vdCBlbmFibGVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1Z21lbnRlZENvbmZpZyA9IHRoaXMuX2F1Z21lbnRDb25maWcoY29uZmlnKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIENvbm5lY3RpbmcgdG8gJHtjb25maWcuaG9zdH1gKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9tYWluU2VydmljZS5jb25uZWN0KGF1Z21lbnRlZENvbmZpZyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1NTSFJlbW90ZUFnZW50SG9zdF0gU1NIIHR1bm5lbCBlc3RhYmxpc2hlZCwgY29ubmVjdGlvbklkPSR7cmVzdWx0LmNvbm5lY3Rpb25JZH1gKTtcblx0XHRyZXR1cm4gdGhpcy5fc2V0dXBDb25uZWN0aW9uKHJlc3VsdCwgY29uZmlnLnVzZXJJbml0aWF0ZWQgPz8gdHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBkaXNjb25uZWN0KGhvc3Q6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3QoaG9zdCk7XG5cdH1cblxuXHRhc3luYyBsaXN0U1NIQ29uZmlnSG9zdHMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9tYWluU2VydmljZS5saXN0U1NIQ29uZmlnSG9zdHMoKTtcblx0fVxuXG5cdGFzeW5jIGVuc3VyZVVzZXJTU0hDb25maWcoKTogUHJvbWlzZTxVUkk+IHtcblx0XHRyZXR1cm4gdGhpcy5fbWFpblNlcnZpY2UuZW5zdXJlVXNlclNTSENvbmZpZygpO1xuXHR9XG5cblx0YXN5bmMgbGlzdFNTSENvbmZpZ0ZpbGVzKCk6IFByb21pc2U8VVJJW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fbWFpblNlcnZpY2UubGlzdFNTSENvbmZpZ0ZpbGVzKCk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlU1NIQ29uZmlnKGhvc3Q6IHN0cmluZyk6IFByb21pc2U8SVNTSFJlc29sdmVkQ29uZmlnPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21haW5TZXJ2aWNlLnJlc29sdmVTU0hDb25maWcoaG9zdCk7XG5cdH1cblxuXHRhc3luYyByZWNvbm5lY3Qoc3NoQ29uZmlnSG9zdDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHVzZXJJbml0aWF0ZWQ/OiBib29sZWFuKTogUHJvbWlzZTxJU1NIQWdlbnRIb3N0Q29ubmVjdGlvbj4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbW90ZSBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIGFyZSBub3QgZW5hYmxlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kT3ZlcnJpZGUgPSB0aGlzLl9nZXRSZW1vdGVBZ2VudEhvc3RDb21tYW5kKCk7XG5cdFx0Y29uc3QgYWdlbnRGb3J3YXJkID0gdGhpcy5faXNTU0hBZ2VudEZvcndhcmRpbmdFbmFibGVkKCk7XG5cdFx0Y29uc3QgcHJlZmVycmVkQWdlbnRMb2NhdGlvbiA9IHRoaXMuX2xvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UuZ2V0UHJlZmVyZW5jZShjb21wdXRlU1NIQ29ubmVjdGlvbktleSh7IHNzaENvbmZpZ0hvc3QgfSkpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1NTSFJlbW90ZUFnZW50SG9zdF0gUmVjb25uZWN0aW5nIHRvICR7c3NoQ29uZmlnSG9zdH0gKHVzZXJJbml0aWF0ZWQ9JHt1c2VySW5pdGlhdGVkID8/IHRydWV9KWApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnJlY29ubmVjdChzc2hDb25maWdIb3N0LCBuYW1lLCBjb21tYW5kT3ZlcnJpZGUsIGFnZW50Rm9yd2FyZCwgdXNlckluaXRpYXRlZCwgcHJlZmVycmVkQWdlbnRMb2NhdGlvbik7XG5cdFx0cmV0dXJuIHRoaXMuX3NldHVwQ29ubmVjdGlvbihyZXN1bHQsIHVzZXJJbml0aWF0ZWQgPz8gdHJ1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIHJlbmRlcmVyLXNpZGUgaGFuZGxlLCBkbyB0aGUgcHJvdG9jb2wgaGFuZHNoYWtlLCBhbmQgcmVnaXN0ZXJcblx0ICogd2l0aCBJUmVtb3RlQWdlbnRIb3N0U2VydmljZS4gQW55IGZhaWx1cmUgYWZ0ZXIgdGhlIHNoYXJlZC1wcm9jZXNzIHR1bm5lbFxuXHQgKiB3YXMgZXN0YWJsaXNoZWQgdGVhcnMgaXQgYmFjayBkb3duIHNvIHdlIGRvbid0IGxlYWsgaXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zZXR1cENvbm5lY3Rpb24ocmVzdWx0OiBJU1NIQ29ubmVjdFJlc3VsdCwgdXNlckluaXRpYXRlZDogYm9vbGVhbik6IFByb21pc2U8SVNTSEFnZW50SG9zdENvbm5lY3Rpb24+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2Nvbm5lY3Rpb25zLmdldChyZXN1bHQuY29ubmVjdGlvbklkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdC8vIFJldXNlIHRoZSBleGlzdGluZyBoYW5kbGUgb25seSBpZiB0aGUgbWFuYWdlZCBlbnRyeSBpcyBzdGlsbFxuXHRcdFx0Ly8gaW4gYSB1c2FibGUgc3RhdGUuIEFmdGVyIGEgYHJlY29ubmVjdGAgdGhhdCByZXBsYWNlZCB0aGVcblx0XHRcdC8vIHVuZGVybHlpbmcgU1NIIHJlbGF5IChlLmcuIGZvbGxvd2luZyBhIENMSS1kcml2ZW4gc2VydmVyXG5cdFx0XHQvLyB1cGdyYWRlKSwgdGhlIHByZXZpb3VzIHByb3RvY29sIGNsaWVudCBpcyBib3VuZCB0byBhXG5cdFx0XHQvLyB0b3JuLWRvd24gdHJhbnNwb3J0IGFuZCBcdTIwMTQgaWYgaXRzIGhhbmRzaGFrZSBoYWQgZmFpbGVkIHdpdGhcblx0XHRcdC8vIGBpbmNvbXBhdGlibGVgIFx1MjAxNCB3aWxsIG5ldmVyIHJlLWhhbmRzaGFrZSBvbiBpdHMgb3duLiBEcm9wXG5cdFx0XHQvLyB0aGUgc3RhbGUgbG9jYWwgc3RhdGUgYW5kIGZhbGwgdGhyb3VnaCB0byBhIGZyZXNoXG5cdFx0XHQvLyBoYW5kc2hha2U7IHRoZSBzdWJzZXF1ZW50IGBhZGRNYW5hZ2VkQ29ubmVjdGlvbmAgY2FsbFxuXHRcdFx0Ly8gZGlzcG9zZXMgdGhlIHN0YWxlIHByb3RvY29sIGNsaWVudCBieSByZXBsYWNpbmcgdGhlIGVudHJ5LlxuXHRcdFx0aWYgKHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuZ2V0Q29ubmVjdGlvbihyZXN1bHQuYWRkcmVzcykpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW1NTSFJlbW90ZUFnZW50SG9zdF0gUmV0dXJuaW5nIGV4aXN0aW5nIGNvbm5lY3Rpb24gaGFuZGxlJyk7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1NTSFJlbW90ZUFnZW50SG9zdF0gUmVwbGFjaW5nIHN0YWxlIGNvbm5lY3Rpb24gaGFuZGxlIGZvciAke3Jlc3VsdC5hZGRyZXNzfWApO1xuXHRcdFx0dGhpcy5fY29ubmVjdGlvbnMuZGVsZXRlKHJlc3VsdC5jb25uZWN0aW9uSWQpO1xuXHRcdFx0Ly8gTWFyayBjbG9zZWQtYnktbWFpbiBzbyBkaXNwb3NpbmcgdGhlIGhhbmRsZSBkb2VzIE5PVCBjYWxsXG5cdFx0XHQvLyBkaXNjb25uZWN0KCkgXHUyMDE0IHRoZSBtYWluIHNlcnZpY2Uga2VwdCB0aGUgU1NIIGNsaWVudCBhbGl2ZVxuXHRcdFx0Ly8gYWNyb3NzIGByZXBsYWNlUmVsYXlgLCBhbmQgd2UnZCBraWxsIHRoZSBicmFuZC1uZXcgdHVubmVsXG5cdFx0XHQvLyBvdGhlcndpc2UuXG5cdFx0XHRleGlzdGluZy5maXJlQ2xvc2UoKTtcblx0XHRcdGV4aXN0aW5nLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdH1cblx0XHRsZXQgcmVnaXN0ZXJlZEhhbmRsZSA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3RvY29sQ2xpZW50ID0gdGhpcy5fY3JlYXRlUmVsYXlDbGllbnQocmVzdWx0KTtcblx0XHRsZXQgc3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQ7XG5cdFx0bGV0IGNvbm5lY3RFcnJvcjogdW5rbm93bjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdG9jb2xDbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW1NTSFJlbW90ZUFnZW50SG9zdF0gUHJvdG9jb2wgaGFuZHNoYWtlIGNvbXBsZXRlZCcpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgaW5jb21wYXRpYmxlID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5mcm9tQ29ubmVjdEVycm9yKGVyciwgW1BST1RPQ09MX1ZFUlNJT05dKTtcblx0XHRcdGlmICghUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0luY29tcGF0aWJsZShpbmNvbXBhdGlibGUpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tTU0hSZW1vdGVBZ2VudEhvc3RdIENvbm5lY3Rpb24gc2V0dXAgZmFpbGVkJywgZXJyKTtcblx0XHRcdFx0cHJvdG9jb2xDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KHJlc3VsdC5jb25uZWN0aW9uSWQpLmNhdGNoKCgpID0+IHsgLyogYmVzdCBlZmZvcnQgKi8gfSk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1NTSFJlbW90ZUFnZW50SG9zdF0gSW5jb21wYXRpYmxlIHdpdGggJHtyZXN1bHQuYWRkcmVzc306ICR7aW5jb21wYXRpYmxlLm1lc3NhZ2V9YCk7XG5cdFx0XHRzdGF0dXMgPSBpbmNvbXBhdGlibGU7XG5cdFx0XHRjb25uZWN0RXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlID0gbmV3IFNTSEFnZW50SG9zdENvbm5lY3Rpb25IYW5kbGUoXG5cdFx0XHRyZXN1bHQuY29uZmlnLFxuXHRcdFx0cmVzdWx0LmFkZHJlc3MsXG5cdFx0XHRyZXN1bHQubmFtZSxcblx0XHRcdHJlc3VsdC5zZXJ2ZXJUeXBlLFxuXHRcdFx0cmVzdWx0Lmluc3RhbmNlSWQsXG5cdFx0XHRyZXN1bHQucHJpbWFyeSxcblx0XHRcdHJlc3VsdC5saWZlY3ljbGUsXG5cdFx0XHQoKSA9PiB0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KHJlc3VsdC5jb25uZWN0aW9uSWQpLFxuXHRcdCk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fY29ubmVjdGlvbnMuc2V0KHJlc3VsdC5jb25uZWN0aW9uSWQsIGhhbmRsZSk7XG5cdFx0XHRyZWdpc3RlcmVkSGFuZGxlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKHtcblx0XHRcdFx0bmFtZTogcmVzdWx0Lm5hbWUsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogcmVzdWx0LmNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdFx0YWRkcmVzczogcmVzdWx0LmFkZHJlc3MsXG5cdFx0XHRcdFx0c3NoQ29uZmlnSG9zdDogcmVzdWx0LnNzaENvbmZpZ0hvc3QsXG5cdFx0XHRcdFx0aG9zdE5hbWU6IHJlc3VsdC5jb25maWcuaG9zdCxcblx0XHRcdFx0XHR1c2VyOiByZXN1bHQuY29uZmlnLnVzZXJuYW1lIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwb3J0OiByZXN1bHQuY29uZmlnLnBvcnQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCBwcm90b2NvbENsaWVudCwgdGhpcy5fY3JlYXRlVHJhbnNwb3J0RGlzcG9zYWJsZShyZXN1bHQuY29ubmVjdGlvbklkLCBoYW5kbGUpLCBzdGF0dXMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW1NTSFJlbW90ZUFnZW50SG9zdF0gQ29ubmVjdGlvbiBzZXR1cCBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0aWYgKHJlZ2lzdGVyZWRIYW5kbGUgJiYgdGhpcy5fY29ubmVjdGlvbnMuZ2V0KHJlc3VsdC5jb25uZWN0aW9uSWQpID09PSBoYW5kbGUpIHtcblx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbnMuZGVsZXRlKHJlc3VsdC5jb25uZWN0aW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRwcm90b2NvbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KHJlc3VsdC5jb25uZWN0aW9uSWQpLmNhdGNoKCgpID0+IHsgLyogYmVzdCBlZmZvcnQgKi8gfSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbm5lY3RFcnJvcikge1xuXHRcdFx0dGhyb3cgY29ubmVjdEVycm9yO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgdHJhY2svbm90aWZ5IGZvciBhIGZ1bGx5IHN1Y2Nlc3NmdWwgc2V0dXAgXHUyMDE0IGFuIGluY29tcGF0aWJsZVxuXHRcdC8vIGhhbmRzaGFrZSAoY29ubmVjdEVycm9yIGFib3ZlKSBzdGlsbCByZWdpc3RlcnMgYSBtYW5hZ2VkIGVudHJ5XG5cdFx0Ly8gYnV0IGlzbid0IGEgdXNhYmxlIGNvbm5lY3Rpb24sIHNvIGl0IG11c3Qgbm90IGNvdW50IGFzIFwicmVjb25uZWN0XG5cdFx0Ly8gc3VjY2VlZGVkXCIgZm9yIGZhaWxvdmVyLWRldGVjdGlvbiBwdXJwb3Nlcy5cblx0XHR0aGlzLl9yZWNvcmRFbmRwb2ludFNlbGVjdGlvbihyZXN1bHQsIHVzZXJJbml0aWF0ZWQpO1xuXG5cdFx0cmV0dXJuIGhhbmRsZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIGxhc3Qta25vd24gc2VydmVyIHR5cGUgZm9yIHtAbGluayByZXN1bHQuYWRkcmVzc30sIGFuZCBcdTIwMTQgaWZcblx0ICogdGhpcyB3YXMgYW4gYXV0b21hdGljL2JhY2tncm91bmQgcmVjb25uZWN0IChgdXNlckluaXRpYXRlZCA9PT0gZmFsc2VgKVxuXHQgKiB0aGF0IG1vdmVkIHRoaXMgc3RhYmxlIHJlbW90ZSBhZGRyZXNzIGZyb20gYSBwcmV2aW91c2x5IGNvbm5lY3RlZFxuXHQgKiBgZWRpdG9yYC1vd25lZCBlbmRwb2ludCB0byBhIG5ld2x5IHNlbGVjdGVkIGBzdGFuZGFsb25lYCBlbmRwb2ludCBcdTIwMTRcblx0ICogc3VyZmFjZSBhIHNpbmdsZSBpbmZvcm1hdGlvbmFsIG5vdGlmaWNhdGlvbi4gTmV2ZXIgZmlyZXMgZm9yIHRoZVxuXHQgKiBpbml0aWFsIGNvbm5lY3QgdG8gYSByZW1vdGUgKG5vIHByaW9yIHJlY29yZGVkIHNlcnZlciB0eXBlKSwgYVxuXHQgKiB1c2VyLWluaXRpYXRlZCByZWNvbm5lY3QsIG9yIGEgc2FtZS1raW5kIHRyYW5zaXRpb25cblx0ICogKGVkaXRvclx1MjE5MmVkaXRvci9zdGFuZGFsb25lXHUyMTkyc3RhbmRhbG9uZSkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWNvcmRFbmRwb2ludFNlbGVjdGlvbihyZXN1bHQ6IElTU0hDb25uZWN0UmVzdWx0LCB1c2VySW5pdGlhdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFyZXN1bHQuc2VydmVyVHlwZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2aW91c1NlcnZlclR5cGUgPSB0aGlzLl9sYXN0Q29ubmVjdGVkU2VydmVyVHlwZUJ5QWRkcmVzcy5nZXQocmVzdWx0LmFkZHJlc3MpO1xuXHRcdGNvbnN0IGlzVW5hdHRlbmRlZEZhaWxvdmVyRnJvbUVkaXRvciA9IHVzZXJJbml0aWF0ZWQgPT09IGZhbHNlXG5cdFx0XHQmJiBwcmV2aW91c1NlcnZlclR5cGUgPT09ICdlZGl0b3InXG5cdFx0XHQmJiByZXN1bHQuc2VydmVyVHlwZSA9PT0gJ3N0YW5kYWxvbmUnO1xuXHRcdHRoaXMuX2xhc3RDb25uZWN0ZWRTZXJ2ZXJUeXBlQnlBZGRyZXNzLnNldChyZXN1bHQuYWRkcmVzcywgcmVzdWx0LnNlcnZlclR5cGUpO1xuXHRcdGlmIChpc1VuYXR0ZW5kZWRGYWlsb3ZlckZyb21FZGl0b3IpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZShcblx0XHRcdFx0J3NzaEVkaXRvckFnZW50SG9zdFJlcGxhY2VkQnlTdGFuZGFsb25lJyxcblx0XHRcdFx0XCJUaGUgZWRpdG9yIGFnZW50IGhvc3QgZXhpdGVkLiBSZWNvbm5lY3RlZCB0byBhIGRlZGljYXRlZCBhZ2VudCBob3N0LiBJbi1wcm9ncmVzcyB3b3JrIG1heSBoYXZlIGJlZW4gaW50ZXJydXB0ZWQuXCJcblx0XHRcdCkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCBhIGRpc3Bvc2FibGUgdGhhdCB0aGUge0BsaW5rIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlfSB3aWxsIG93blxuXHQgKiBmb3IgdGhlIGxpZmV0aW1lIG9mIHRoaXMgZW50cnkuIFdoZW4gdGhlIGVudHJ5IGlzIHJlbW92ZWQgKGVpdGhlciBieVxuXHQgKiB0aGUgdXNlciB2aWEgXCJSZW1vdmUgUmVtb3RlXCIgb3IgYnkgY29uZmlnIHJlY29uY2lsaWF0aW9uKSwgdGhpcyBydW5zXG5cdCAqIGFuZCB0ZWFycyBkb3duIHRoZSByZW5kZXJlci1zaWRlIGhhbmRsZSBhbmQgdGhlIHNoYXJlZC1wcm9jZXNzIFNTSFxuXHQgKiB0dW5uZWwgdG9nZXRoZXIuIFdpdGhvdXQgdGhpcyBob29rdXAsIHRoZSBTU0ggdHVubmVsIHdvdWxkIGxlYWsgYW5kXG5cdCAqIHRoZSBuZXh0IGBjb25uZWN0KClgIHdvdWxkIHNpbGVudGx5IHJldXNlIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlVHJhbnNwb3J0RGlzcG9zYWJsZShjb25uZWN0aW9uSWQ6IHN0cmluZywgaGFuZGxlOiBTU0hBZ2VudEhvc3RDb25uZWN0aW9uSGFuZGxlKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Ly8gRHJvcCB0aGUgcmVuZGVyZXItc2lkZSBoYW5kbGUgbWFwIGVudHJ5IGZpcnN0IHNvIGEgY29uY3VycmVudFxuXHRcdFx0Ly8gYGNvbm5lY3QoKWAgZm9yIHRoZSBzYW1lIGtleSBkb2Vzbid0IGxhdGNoIG9udG8gYSBiZWluZy10b3JuLWRvd25cblx0XHRcdC8vIGNvbm5lY3Rpb24uXG5cdFx0XHRpZiAodGhpcy5fY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25JZCkgPT09IGhhbmRsZSkge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGUoY29ubmVjdGlvbklkKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBNYXJrIHRoZSBoYW5kbGUgYXMgYWxyZWFkeSBjbG9zZWQtZnJvbS1tYWluIHNvIGRpc3Bvc2luZyBpdFxuXHRcdFx0Ly8gZG9lc24ndCBraWNrIG9mZiBhIHJlZHVuZGFudCBzZWNvbmQgZGlzY29ubmVjdCBJUEMuIFRoZSBhY3R1YWxcblx0XHRcdC8vIGRpc2Nvbm5lY3QgaXMgaW5pdGlhdGVkIGJlbG93LlxuXHRcdFx0aGFuZGxlLmZpcmVDbG9zZSgpO1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3QoY29ubmVjdGlvbklkKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QgZWZmb3J0ICovIH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUmVsYXlDbGllbnQocmVzdWx0OiB7IGNvbm5lY3Rpb25JZDogc3RyaW5nOyBhZGRyZXNzOiBzdHJpbmcgfSk6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVsYXlDbGllbnRGYWN0b3J5LmNyZWF0ZUNsaWVudCh0aGlzLl9tYWluU2VydmljZSwgcmVzdWx0LmNvbm5lY3Rpb25JZCwgcmVzdWx0LmFkZHJlc3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXVnbWVudENvbmZpZyhjb25maWc6IElTU0hBZ2VudEhvc3RDb25maWcpOiBJU1NIQWdlbnRIb3N0Q29uZmlnIHtcblx0XHRjb25zdCByZXN1bHQgPSB7IC4uLmNvbmZpZyB9O1xuXHRcdGNvbnN0IGNvbW1hbmRPdmVycmlkZSA9IHRoaXMuX2dldFJlbW90ZUFnZW50SG9zdENvbW1hbmQoKTtcblx0XHRpZiAoY29tbWFuZE92ZXJyaWRlKSB7XG5cdFx0XHRyZXN1bHQucmVtb3RlQWdlbnRIb3N0Q29tbWFuZCA9IGNvbW1hbmRPdmVycmlkZTtcblx0XHR9XG5cdFx0Ly8gQWdlbnQgZm9yd2FyZGluZyByZXF1aXJlcyBib3RoIHRoZSBnbG9iYWwgc2V0dGluZyAoc2VjdXJpdHkgb3B0LWluKVxuXHRcdC8vIGFuZCB0aGUgcGVyLWhvc3QgU1NIIGNvbmZpZyBgRm9yd2FyZEFnZW50IHllc2AgdG8gYmUgZW5hYmxlZC5cblx0XHRpZiAodGhpcy5faXNTU0hBZ2VudEZvcndhcmRpbmdFbmFibGVkKCkgJiYgY29uZmlnLmFnZW50Rm9yd2FyZCkge1xuXHRcdFx0cmVzdWx0LmFnZW50Rm9yd2FyZCA9IHRydWU7XG5cdFx0fVxuXHRcdC8vIFRocmVhZCB0aGUgc3RvcmVkIHBlci1ob3N0IGxvY2F0aW9uIHByZWZlcmVuY2UgdGhyb3VnaCB0byB0aGUgbWFpblxuXHRcdC8vIHByb2Nlc3Mgc28gYHNlbGVjdEVuZHBvaW50YCBjYW4gaG9ub3IgaXQgZGlyZWN0bHkgXHUyMDE0IHdpdGhvdXQgZXZlclxuXHRcdC8vIGVtaXR0aW5nIGFuIGVuZHBvaW50LXNlbGVjdGlvbiByZXF1ZXN0IFx1MjAxNCBmb3IgYm90aCB1c2VyLWluaXRpYXRlZFxuXHRcdC8vIGFuZCBzaWxlbnQvYmFja2dyb3VuZCBjb25uZWN0cyAoc2VlIGBJU1NIQWdlbnRIb3N0Q29uZmlnLnByZWZlcnJlZEFnZW50TG9jYXRpb25gKS5cblx0XHRjb25zdCBwcmVmZXJyZWRBZ2VudExvY2F0aW9uID0gdGhpcy5fbG9jYXRpb25QcmVmZXJlbmNlU2VydmljZS5nZXRQcmVmZXJlbmNlKGNvbXB1dGVTU0hDb25uZWN0aW9uS2V5KGNvbmZpZykpO1xuXHRcdGlmIChwcmVmZXJyZWRBZ2VudExvY2F0aW9uKSB7XG5cdFx0XHRyZXN1bHQucHJlZmVycmVkQWdlbnRMb2NhdGlvbiA9IHByZWZlcnJlZEFnZW50TG9jYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZW1vdGVBZ2VudEhvc3RDb21tYW5kKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuc3NoUmVtb3RlQWdlbnRIb3N0Q29tbWFuZCcpIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzU1NIQWdlbnRGb3J3YXJkaW5nRW5hYmxlZCgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2NoYXQuYWdlbnRIb3N0LmZvcndhcmRTU0hBZ2VudCcpIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93IGEgcXVpY2staW5wdXQgcHJvbXB0IGZvciBlYWNoIGVudHJ5IGluIGEga2V5Ym9hcmQtaW50ZXJhY3RpdmVcblx0ICogY2hhbGxlbmdlIGFuZCBmb3J3YXJkIHRoZSByZXNwb25zZXMgKG9yIGNhbmNlbCkgYmFjayB0byB0aGUgbWFpbiBzZXJ2aWNlLlxuXHQgKlxuXHQgKiBUaGUgcmVuZGVyZXIgY29sbGVjdHMgYWxsIHByb21wdHMgdXAgZnJvbnQgYmVmb3JlIHJlc3BvbmRpbmcgc28gdGhlXG5cdCAqIHNlcnZlciBnZXRzIGEgc2luZ2xlIGJhdGNoZWQgYW5zd2VyIHNldCwgbWF0Y2hpbmcgaG93IE9wZW5TU0ggcHJlc2VudHNcblx0ICoga2V5Ym9hcmQtaW50ZXJhY3RpdmUgY2hhbGxlbmdlcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0KHJlcXVlc3Q6IElTU0hLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1NTSFJlbW90ZUFnZW50SG9zdF0gS2V5Ym9hcmQtaW50ZXJhY3RpdmUgcHJvbXB0IGZvciAke3JlcXVlc3QuZGlzcGxheUhvc3R9ICgke3JlcXVlc3QucHJvbXB0cy5sZW5ndGh9IHByb21wdChzKSlgKTtcblxuXHRcdC8vIEhvbm9yIGNhbmNlbGxhdGlvbiBpZiB0aGUgdW5kZXJseWluZyBjb25uZWN0IGF0dGVtcHQgZmFpbHMgb3Jcblx0XHQvLyBjb21wbGV0ZXMgd2hpbGUgd2UncmUgc3RpbGwgZ2F0aGVyaW5nIHJlc3BvbnNlcy4gUGFzcyB0aGVcblx0XHQvLyBDYW5jZWxsYXRpb25Ub2tlbiBpbnRvIHF1aWNrSW5wdXQgc28gYW4gaW4tZmxpZ2h0IHByb21wdCBpc1xuXHRcdC8vIGRpc21pc3NlZCBpbW1lZGlhdGVseSByYXRoZXIgdGhhbiBsaW5nZXJpbmcgb24gc2NyZWVuLlxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGNhbmNlbExpc3RlbmVyID0gdGhpcy5fbWFpblNlcnZpY2Uub25EaWRDYW5jZWxLZXlib2FyZEludGVyYWN0aXZlKHJlcXVlc3RJZCA9PiB7XG5cdFx0XHRpZiAocmVxdWVzdElkID09PSByZXF1ZXN0LnJlcXVlc3RJZCkge1xuXHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKHJlcXVlc3QucHJvbXB0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbWFpblNlcnZpY2UucmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdC5yZXF1ZXN0SWQsIFtdKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXNwb25zZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlcXVlc3QucHJvbXB0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHByb21wdCA9IHJlcXVlc3QucHJvbXB0c1tpXTtcblx0XHRcdFx0Ly8gVHJpbSB0cmFpbGluZyB3aGl0ZXNwYWNlL2NvbG9ucyBmcm9tIHRoZSBzZXJ2ZXItc3VwcGxpZWRcblx0XHRcdFx0Ly8gcHJvbXB0IGZvciBhIGNsZWFuZXIgdGl0bGUgKGUuZy4gXCJQYXNzd29yZDogXCIgLT4gXCJQYXNzd29yZFwiKS5cblx0XHRcdFx0Y29uc3QgY2xlYW5lZFByb21wdCA9IHByb21wdC5wcm9tcHQucmVwbGFjZSgvW1xcczpdKyQvLCAnJyk7XG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gcmVxdWVzdC5wcm9tcHRzLmxlbmd0aCA+IDFcblx0XHRcdFx0XHQ/IGAke3JlcXVlc3QuZGlzcGxheUhvc3R9ICgke2kgKyAxfS8ke3JlcXVlc3QucHJvbXB0cy5sZW5ndGh9KWBcblx0XHRcdFx0XHQ6IHJlcXVlc3QuZGlzcGxheUhvc3Q7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdHByb21wdDogY2xlYW5lZFByb21wdCB8fCBsb2NhbGl6ZSgnc3NoS2JpRGVmYXVsdFByb21wdCcsIFwiQXV0aGVudGljYXRpb24gcmVxdWlyZWQgZm9yIHswfUB7MX1cIiwgcmVxdWVzdC51c2VybmFtZSwgcmVxdWVzdC5kaXNwbGF5SG9zdCksXG5cdFx0XHRcdFx0cGFzc3dvcmQ6ICFwcm9tcHQuZWNobyxcblx0XHRcdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0XHRcdH0sIGN0cy50b2tlbik7XG5cdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBVc2VyIGNhbmNlbGxlZCBcdTIwMTQgYWJvcnQgdGhlIG93bmluZyBjb25uZWN0aW9uIGF0dGVtcHQuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fbWFpblNlcnZpY2UucmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdC5yZXF1ZXN0SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3BvbnNlcy5wdXNoKHZhbHVlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9tYWluU2VydmljZS5yZXNwb25kS2V5Ym9hcmRJbnRlcmFjdGl2ZShyZXF1ZXN0LnJlcXVlc3RJZCwgcmVzcG9uc2VzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tTU0hSZW1vdGVBZ2VudEhvc3RdIEZhaWxlZCBoYW5kbGluZyBrZXlib2FyZC1pbnRlcmFjdGl2ZSBwcm9tcHQnLCBlcnIpO1xuXHRcdFx0Ly8gQmVzdCBlZmZvcnQ6IHRlbGwgdGhlIG1haW4gc2VydmljZSB0byBnaXZlIHVwIG9uIHRoaXMgYXR0ZW1wdFxuXHRcdFx0Ly8gc28gdGhlIFNTSCBjb25uZWN0IHByb21pc2UgcmVqZWN0cyByYXRoZXIgdGhhbiBoYW5naW5nLlxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbWFpblNlcnZpY2UucmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdC5yZXF1ZXN0SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGNhdGNoIHsgLyogc3dhbGxvdyAqLyB9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNhbmNlbExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERlY2lkZSB3aGV0aGVyIHRvIHRydXN0IGEgc2VydmVyJ3MgaG9zdCBrZXksIGFuZCB0ZWxsIHRoZSBzaGFyZWQgcHJvY2Vzcy5cblx0ICpcblx0ICogUG9saWN5IGxpdmVzIGluIHtAbGluayBkZWNpZGVIb3N0S2V5VHJ1c3R9OyB0aGlzIG1ldGhvZCBvd25zIHRoZSBVSSBhbmRcblx0ICogdGhlIHN0b3JhZ2Ugd3JpdGVzLiBFdmVyeSBwYXRoIG11c3QgcmVzcG9uZCBleGFjdGx5IG9uY2UgXHUyMDE0IHRoZSBTU0hcblx0ICogaGFuZHNoYWtlIGlzIHN1c3BlbmRlZCB1bnRpbCBpdCBoZWFycyBiYWNrLlxuXHQgKi9cblx0LyoqXG5cdCAqIEhvb2sgZm9yIG9ic2VydmluZyB3aGVuIGEgaG9zdCBrZXkgdmVyaWZpY2F0aW9uIGhhcyBmdWxseSBzZXR0bGVkLlxuXHQgKiBPdmVycmlkZGVuIGJ5IHRlc3RzIHNvIHRoZXkgY2FuIGF3YWl0IHRoZSByZWFsIG9wZXJhdGlvbiBpbnN0ZWFkIG9mXG5cdCAqIHNsZWVwaW5nIGZvciBhIGZpeGVkIGludGVydmFsLCB3aGljaCBpcyBsb2FkLWRlcGVuZGVudCBhbmQgZmxha3kgXHUyMDE0XG5cdCAqIHBhcnRpY3VsYXJseSBmb3IgdGhlIGNhc2VzIHRoYXQgYXNzZXJ0ICpub3RoaW5nKiBoYXBwZW5lZC5cblx0ICovXG5cdHByb3RlY3RlZCBfdHJhY2tIb3N0S2V5VmVyaWZpY2F0aW9uKGhhbmRsZWQ6IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHR2b2lkIGhhbmRsZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVIb3N0S2V5VmVyaWZpY2F0aW9uUmVxdWVzdChyZXF1ZXN0OiBJU1NISG9zdEtleVZlcmlmaWNhdGlvblJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIEhvc3Qga2V5IHZlcmlmaWNhdGlvbiBmb3IgJHtyZXF1ZXN0LmRpc3BsYXlIb3N0fTogJHtyZXF1ZXN0LmtleVR5cGV9ICR7cmVxdWVzdC5maW5nZXJwcmludH0gKGtub3duX2hvc3RzOiAke3JlcXVlc3Qua25vd25Ib3N0c01hdGNofSlgKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGNhbmNlbExpc3RlbmVyID0gdGhpcy5fbWFpblNlcnZpY2Uub25EaWRDYW5jZWxIb3N0S2V5VmVyaWZpY2F0aW9uKHJlcXVlc3RJZCA9PiB7XG5cdFx0XHRpZiAocmVxdWVzdElkID09PSByZXF1ZXN0LnJlcXVlc3RJZCkge1xuXHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGVjaXNpb24gPSBkZWNpZGVIb3N0S2V5VHJ1c3QocmVxdWVzdCwgdGhpcy5faG9zdEtleVRydXN0U2VydmljZS5nZXRUcnVzdGVkS2V5cyhyZXF1ZXN0Lmhvc3QsIHJlcXVlc3QucG9ydCkpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU1NIUmVtb3RlQWdlbnRIb3N0XSBIb3N0IGtleSBkZWNpc2lvbiBmb3IgJHtyZXF1ZXN0LmRpc3BsYXlIb3N0fTogJHtkZWNpc2lvbi5raW5kfSAoJHtkZWNpc2lvbi5yZWFzb259KWApO1xuXG5cdFx0XHRsZXQgdHJ1c3RlZDogYm9vbGVhbjtcblx0XHRcdHN3aXRjaCAoZGVjaXNpb24ua2luZCkge1xuXHRcdFx0XHRjYXNlICd0cnVzdCc6XG5cdFx0XHRcdFx0aWYgKGRlY2lzaW9uLnBlcnNpc3QpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3RydXN0SG9zdEtleShyZXF1ZXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dHJ1c3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RlbnknOlxuXHRcdFx0XHRcdHRoaXMuX3JlcG9ydEhvc3RLZXlEZW5pZWQocmVxdWVzdCwgZGVjaXNpb24pO1xuXHRcdFx0XHRcdHRydXN0ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncHJvbXB0Jzoge1xuXHRcdFx0XHRcdHRydXN0ZWQgPSBhd2FpdCB0aGlzLl9wcm9tcHRGb3JIb3N0S2V5KHJlcXVlc3QsIGRlY2lzaW9uLnJlYXNvbiwgY3RzLnRva2VuKTtcblx0XHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0cnVzdGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90cnVzdEhvc3RLZXkocmVxdWVzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmVtZW1iZXIgd2hpY2ggaG9zdCBrZXkgYWN0dWFsbHkgYXV0aGVudGljYXRlZCB0aGlzIHNlc3Npb24sIHNvXG5cdFx0XHQvLyBhIGxhdGVyIFVwZGF0ZUhvc3RLZXlzIGFubm91bmNlbWVudCBjYW4gYmUgY2hlY2tlZCBhZ2FpbnN0IGl0LlxuXHRcdFx0dGhpcy5fc2Vzc2lvbkhvc3RLZXlzLnNldChyZXF1ZXN0LmNvbm5lY3Rpb25LZXksIHsga2V5VHlwZTogcmVxdWVzdC5rZXlUeXBlLCBmaW5nZXJwcmludDogcmVxdWVzdC5maW5nZXJwcmludCB9KTtcblx0XHRcdGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnJlc3BvbmRIb3N0S2V5VmVyaWZpY2F0aW9uKHJlcXVlc3QucmVxdWVzdElkLCB0cnVzdGVkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tTU0hSZW1vdGVBZ2VudEhvc3RdIEZhaWxlZCBoYW5kbGluZyBob3N0IGtleSB2ZXJpZmljYXRpb24nLCBlcnIpO1xuXHRcdFx0Ly8gRmFpbCBjbG9zZWQ6IGFuIGVycm9yIGhlcmUgbXVzdCBuZXZlciBiZWNvbWUgYSB3YXkgdG8gY29ubmVjdCB0b1xuXHRcdFx0Ly8gYW4gdW52ZXJpZmllZCBzZXJ2ZXIuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9tYWluU2VydmljZS5yZXNwb25kSG9zdEtleVZlcmlmaWNhdGlvbihyZXF1ZXN0LnJlcXVlc3RJZCwgZmFsc2UpO1xuXHRcdFx0fSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjYW5jZWxMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RydXN0SG9zdEtleShyZXF1ZXN0OiBJU1NISG9zdEtleVZlcmlmaWNhdGlvblJlcXVlc3QpOiB2b2lkIHtcblx0XHR0aGlzLl9ob3N0S2V5VHJ1c3RTZXJ2aWNlLnRydXN0SG9zdEtleShyZXF1ZXN0Lmhvc3QsIHJlcXVlc3QucG9ydCwge1xuXHRcdFx0a2V5VHlwZTogcmVxdWVzdC5rZXlUeXBlLFxuXHRcdFx0ZmluZ2VycHJpbnQ6IHJlcXVlc3QuZmluZ2VycHJpbnQsXG5cdFx0XHRhZGRlZEF0OiBEYXRlLm5vdygpLFxuXHRcdFx0Li4uKHJlcXVlc3QuZGlzcGxheUhvc3QgIT09IHJlcXVlc3QuaG9zdCA/IHsgYWxpYXM6IHJlcXVlc3QuZGlzcGxheUhvc3QgfSA6IHVuZGVmaW5lZCksXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQXNrIHRoZSB1c2VyIHdoZXRoZXIgdG8gdHJ1c3QgYW4gdW5yZWNvZ25pemVkIGhvc3Qga2V5LCBlY2hvaW5nIE9wZW5TU0gnc1xuXHQgKiB3b3JkaW5nIHNvIGl0IGlzIHJlY29nbml6YWJsZSB0byBhbnlvbmUgd2hvIGhhcyB1c2VkIGBzc2hgIGRpcmVjdGx5LlxuXHQgKiBDYW5jZWwgaXMgdGhlIGRlZmF1bHQgc28gdGhlIHNhZmUgYW5zd2VyIGlzIHRoZSBvbmUgeW91IGdldCBieSBkaXNtaXNzaW5nLlxuXHQgKlxuXHQgKiBVc2VzIGEgY3VzdG9tIGRpYWxvZyBzbyB0aGUgcHJvbXB0IGNhbiBiZSBkaXNtaXNzZWQgcHJvZ3JhbW1hdGljYWxseSB3aGVuXG5cdCAqIHRoZSBjb25uZWN0aW9uIGRpZXMgdW5kZXJuZWF0aCBpdCBcdTIwMTQgYSBuYXRpdmUgZGlhbG9nIGNhbm5vdCBiZSwgYW5kIHdvdWxkXG5cdCAqIHN0cmFuZCB0aGUgdXNlciB3aXRoIGEgcXVlc3Rpb24gYWJvdXQgYSBjb25uZWN0aW9uIHRoYXQgbm8gbG9uZ2VyIGV4aXN0cy5cblx0ICogQW5zd2VyaW5nIGEgc3RhbGUgcHJvbXB0IHdhcyBhbHdheXMgc2FmZSAodGhlIGNhbGxlciByZS1jaGVja3Ncblx0ICogY2FuY2VsbGF0aW9uIGJlZm9yZSBhY3RpbmcpLCBidXQgbGVhdmluZyBpdCBvbiBzY3JlZW4gaXMgY29uZnVzaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcHJvbXB0Rm9ySG9zdEtleShyZXF1ZXN0OiBJU1NISG9zdEtleVZlcmlmaWNhdGlvblJlcXVlc3QsIHJlYXNvbjogJ3Vua25vd24nIHwgJ2NhLW9ubHknLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXRhaWwgPSByZWFzb24gPT09ICdjYS1vbmx5J1xuXHRcdFx0PyBsb2NhbGl6ZShcblx0XHRcdFx0J3NzaEhvc3RLZXlDYU9ubHlEZXRhaWwnLFxuXHRcdFx0XHRcInswfSBrZXkgZmluZ2VycHJpbnQgaXMgezF9LlxcblxcblRoaXMgaG9zdCBpcyBjb25maWd1cmVkIHRvIHVzZSBhIGNlcnRpZmljYXRlIGF1dGhvcml0eSwgYnV0IGNlcnRpZmljYXRlLWJhc2VkIGhvc3Qga2V5cyBjYW5ub3QgYmUgdmVyaWZpZWQgaGVyZSwgc28gdGhpcyBrZXkgY2Fubm90IGJlIGNoZWNrZWQgYWdhaW5zdCBpdC5cIixcblx0XHRcdFx0ZGVzY3JpYmVIb3N0S2V5VHlwZShyZXF1ZXN0LmtleVR5cGUpLCByZXF1ZXN0LmZpbmdlcnByaW50KVxuXHRcdFx0OiBsb2NhbGl6ZShcblx0XHRcdFx0J3NzaEhvc3RLZXlVbmtub3duRGV0YWlsJyxcblx0XHRcdFx0XCJ7MH0ga2V5IGZpbmdlcnByaW50IGlzIHsxfS5cXG5cXG5WZXJpZnkgdGhpcyBmaW5nZXJwcmludCBtYXRjaGVzIHRoZSBob3N0IGJlZm9yZSBjb250aW51aW5nLlwiLFxuXHRcdFx0XHRkZXNjcmliZUhvc3RLZXlUeXBlKHJlcXVlc3Qua2V5VHlwZSksIHJlcXVlc3QuZmluZ2VycHJpbnQpO1xuXG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc3NoSG9zdEtleVVua25vd25NZXNzYWdlJywgXCJUaGUgYXV0aGVudGljaXR5IG9mIGhvc3QgJ3swfScgY2FuJ3QgYmUgZXN0YWJsaXNoZWQuXCIsIHJlcXVlc3QuZGlzcGxheUhvc3QpLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ3NzaEhvc3RLZXlDb25uZWN0JywgXCImJkNvbm5lY3RcIiksXG5cdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdzc2hIb3N0S2V5Q2FuY2VsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRjdXN0b206IHsgaWNvbjogQ29kaWNvbi5zaGllbGQgfSxcblx0XHRcdC8vIENhbmNlbGxhdGlvbiByZXNvbHZlcyB0aGUgZGlhbG9nIGFzIGlmIENhbmNlbCB3YXMgcHJlc3NlZCwgd2hpY2hcblx0XHRcdC8vIGlzIGFsc28gdGhlIGFuc3dlciB3ZSB3YW50IGZvciBhIGNvbm5lY3Rpb24gdGhhdCBpcyBhbHJlYWR5IGdvbmUuXG5cdFx0XHR0b2tlbixcblx0XHR9KTtcblx0XHRyZXR1cm4gY29uZmlybWVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGxhaW4gYSByZWZ1c2FsLiBBIGNoYW5nZWQgb3IgcmV2b2tlZCBrZXkgZ2V0cyBhbiBlcnJvciBub3RpZmljYXRpb25cblx0ICogd2l0aCBubyBcInRydXN0IGFueXdheVwiIGFmZm9yZGFuY2UgXHUyMDE0IHJlY292ZXJpbmcgcmVxdWlyZXMgZXhwbGljaXRseVxuXHQgKiBmb3JnZXR0aW5nIHRoZSBob3N0LCBzbyBhIHBvc3NpYmxlIGltcGVyc29uYXRpb24gY2Fubm90IGJlIGRpc21pc3NlZFxuXHQgKiB3aXRoIGEgc2luZ2xlIHJlZmxleGl2ZSBjbGljay5cblx0ICovXG5cdHByaXZhdGUgX3JlcG9ydEhvc3RLZXlEZW5pZWQocmVxdWVzdDogSVNTSEhvc3RLZXlWZXJpZmljYXRpb25SZXF1ZXN0LCBkZW5pYWw6IFNTSEhvc3RLZXlEZW5pYWwpOiB2b2lkIHtcblx0XHRpZiAoZGVuaWFsLnJlYXNvbiA9PT0gJ25vdC11c2VyLWluaXRpYXRlZCcpIHtcblx0XHRcdC8vIEEgYmFja2dyb3VuZCByZWNvbm5lY3Q6IGxvZyBpdCwgYnV0IGRvIG5vdCBpbnRlcnJ1cHQgd2l0aCBVSSB0aGVcblx0XHRcdC8vIHVzZXIgZGlkIG5vdCBhc2sgZm9yLiBDb25uZWN0aW5nIG1hbnVhbGx5IHN1cmZhY2VzIHRoZSBwcm9tcHQuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIERlY2xpbmluZyB1bmtub3duIGhvc3Qga2V5IGZvciAke3JlcXVlc3QuZGlzcGxheUhvc3R9IGR1cmluZyBhIGJhY2tncm91bmQgcmVjb25uZWN0OyBjb25uZWN0IG1hbnVhbGx5IHRvIHJldmlldyBpdC5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZGVuaWFsLnJlYXNvbiA9PT0gJ3N0cmljdC15ZXMnKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKFxuXHRcdFx0XHQnc3NoSG9zdEtleVN0cmljdFVua25vd24nLFxuXHRcdFx0XHRcIkNhbid0IGNvbm5lY3QgdG8gJ3swfSc6IGl0cyBob3N0IGtleSBpcyBub3Qga25vd24sIGFuZCBTdHJpY3RIb3N0S2V5Q2hlY2tpbmcgaXMgc2V0IHRvIFxcXCJ5ZXNcXFwiIGluIHlvdXIgU1NIIGNvbmZpZ3VyYXRpb24uXCIsXG5cdFx0XHRcdHJlcXVlc3QuZGlzcGxheUhvc3QpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGb3JnZXR0aW5nIG91ciBzdG9yZWQga2V5IG9ubHkgaGVscHMgd2hlbiBvdXIgc3RvcmUgaXMgd2hhdFxuXHRcdC8vIGRpc2FncmVlZC4gQSByZXZva2VkIG1hcmtlciwgb3IgYSBjb25mbGljdGluZyBga25vd25faG9zdHNgIGVudHJ5LFxuXHRcdC8vIGxpdmVzIGluIHRoZSB1c2VyJ3Mgb3duIGZpbGVzIGFuZCB3b3VsZCBrZWVwIHdpbm5pbmcgYWZ0ZXJ3YXJkcyBcdTIwMTQgc29cblx0XHQvLyBvZmZlcmluZyB0aGUgYWN0aW9uIHRoZXJlIHdvdWxkIHNlbmQgdGhlbSBpbiBjaXJjbGVzLlxuXHRcdGlmIChkZW5pYWwucmVhc29uICE9PSAnbWlzbWF0Y2gnKSB7IC8vICdyZXZva2VkJ1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0J3NzaEhvc3RLZXlSZXZva2VkJyxcblx0XHRcdFx0XCJIb3N0IGtleSB2ZXJpZmljYXRpb24gZmFpbGVkIGZvciAnezB9Jy4gVGhpcyBob3N0J3MgezF9IGtleSBoYXMgYmVlbiBtYXJrZWQgYXMgcmV2b2tlZCBpbiB5b3VyIGtub3duX2hvc3RzIGZpbGUuIFJlbW92ZSB0aGUgQHJldm9rZWQgbGluZSBmcm9tIGtub3duX2hvc3RzIGlmIHRoaXMga2V5IHNob3VsZCBiZSB0cnVzdGVkIGFnYWluLlwiLFxuXHRcdFx0XHRyZXF1ZXN0LmRpc3BsYXlIb3N0LCBkZXNjcmliZUhvc3RLZXlUeXBlKHJlcXVlc3Qua2V5VHlwZSkpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZGVuaWFsLnNvdXJjZSA9PT0gJ2tub3duLWhvc3RzJykge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0J3NzaEhvc3RLZXlDaGFuZ2VkS25vd25Ib3N0cycsXG5cdFx0XHRcdFwiSG9zdCBrZXkgdmVyaWZpY2F0aW9uIGZhaWxlZCBmb3IgJ3swfScuIEl0cyB7MX0gaG9zdCBrZXkgZG9lcyBub3QgbWF0Y2ggdGhlIGVudHJ5IGluIHlvdXIga25vd25faG9zdHMgZmlsZSwgd2hpY2ggY291bGQgbWVhbiBzb21lb25lIGlzIGltcGVyc29uYXRpbmcgdGhlIGhvc3QgXHUyMDE0IG9yIHRoYXQgdGhlIGhvc3Qgd2FzIGxlZ2l0aW1hdGVseSByZWJ1aWx0LiBSZWNlaXZlZCB7Mn0uIFVwZGF0ZSBvciByZW1vdmUgdGhlIGtub3duX2hvc3RzIGVudHJ5IGlmIHRoaXMgY2hhbmdlIHdhcyBleHBlY3RlZC5cIixcblx0XHRcdFx0cmVxdWVzdC5kaXNwbGF5SG9zdCwgZGVzY3JpYmVIb3N0S2V5VHlwZShyZXF1ZXN0LmtleVR5cGUpLCByZXF1ZXN0LmZpbmdlcnByaW50KSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoXG5cdFx0XHRcdCdzc2hIb3N0S2V5Q2hhbmdlZCcsXG5cdFx0XHRcdFwiSG9zdCBrZXkgdmVyaWZpY2F0aW9uIGZhaWxlZCBmb3IgJ3swfScuIEl0cyB7MX0gaG9zdCBrZXkgaGFzIGNoYW5nZWQsIHdoaWNoIGNvdWxkIG1lYW4gc29tZW9uZSBpcyBpbXBlcnNvbmF0aW5nIHRoZSBob3N0IFx1MjAxNCBvciB0aGF0IHRoZSBob3N0IHdhcyBsZWdpdGltYXRlbHkgcmVidWlsdC4gUmVjZWl2ZWQgezJ9LlwiLFxuXHRcdFx0XHRyZXF1ZXN0LmRpc3BsYXlIb3N0LCBkZXNjcmliZUhvc3RLZXlUeXBlKHJlcXVlc3Qua2V5VHlwZSksIHJlcXVlc3QuZmluZ2VycHJpbnQpLFxuXHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRwcmltYXJ5OiBbdG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiAnc3NoSG9zdEtleS5mb3JnZXQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc3NoSG9zdEtleUZvcmdldEFjdGlvbicsIFwiRm9yZ2V0IFNhdmVkIEhvc3QgS2V5XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5faG9zdEtleVRydXN0U2VydmljZS5mb3JnZXRIb3N0KHJlcXVlc3QuaG9zdCwgcmVxdWVzdC5wb3J0KSxcblx0XHRcdFx0fSldLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJzaXN0IGhvc3Qga2V5cyB0aGUgc2VydmVyIHByb3ZlZCBpdCBvd25zLCBzbyBhIGxlZ2l0aW1hdGUga2V5XG5cdCAqIHJvdGF0aW9uIGlzIGludmlzaWJsZSB0byB0aGUgdXNlciBpbnN0ZWFkIG9mIGEgaGFyZCBmYWlsdXJlIG9uIHRoZSBuZXh0XG5cdCAqIGNvbm5lY3QuXG5cdCAqXG5cdCAqIHNzaDIgdmVyaWZpZXMgdGhlIGBob3N0a2V5cy1wcm92ZWAgc2lnbmF0dXJlcyBiZWZvcmUgc3VyZmFjaW5nIHRoZXNlLFxuXHQgKiBidXQgdGhhdCBvbmx5IHByb3ZlcyB0aGUga2V5cyBiZWxvbmcgdG8gKndob2V2ZXIgd2UgYXJlIGN1cnJlbnRseVxuXHQgKiB0YWxraW5nIHRvKiBcdTIwMTQgaXQgc2F5cyBub3RoaW5nIGFib3V0IHdoZXRoZXIgdGhhdCBwYXJ0eSBpcyB0aGUgcmVhbCBob3N0LlxuXHQgKiBTbyB3ZSBhZGRpdGlvbmFsbHkgcmVxdWlyZSB0aGF0IHRoZSBob3N0IGtleSB3aGljaCBhdXRoZW50aWNhdGVkIHRoaXNcblx0ICogdmVyeSBzZXNzaW9uIGlzIGl0c2VsZiBjdXJyZW50bHkgdHJ1c3RlZC4gVGhpcyBtaXJyb3JzIE9wZW5TU0gsIHdob3NlXG5cdCAqIGBVcGRhdGVIb3N0S2V5c2AgZG9jdW1lbnRhdGlvbiBzdGF0ZXMgYWRkaXRpb25hbCBob3N0IGtleXMgYXJlIGFjY2VwdGVkXG5cdCAqIG9ubHkgXCJpZiB0aGUga2V5IHVzZWQgdG8gYXV0aGVudGljYXRlIHRoZSBob3N0IHdhcyBhbHJlYWR5IHRydXN0ZWQgb3Jcblx0ICogZXhwbGljaXRseSBhY2NlcHRlZCBieSB0aGUgdXNlclwiLlxuXHQgKlxuXHQgKiBXaXRob3V0IHRoYXQgY2hlY2ssIGEgc2Vzc2lvbiBhY2NlcHRlZCB0aHJvdWdoXG5cdCAqIGBTdHJpY3RIb3N0S2V5Q2hlY2tpbmc9bm9gIFx1MjAxNCB3aGVyZSB3ZSBkZWxpYmVyYXRlbHkgZGlkIG5vdCB2ZXJpZnlcblx0ICogYW55dGhpbmcgXHUyMDE0IGNvdWxkIGFubm91bmNlIGtleXMgdGhhdCBvdmVyd3JpdGUgdGhlIHVzZXIncyBnZW51aW5lIHN0b3JlZFxuXHQgKiBrZXksIGxlYXZpbmcgYW4gaW1wb3N0b3IncyBrZXkgdHJ1c3RlZCBvbmNlIHN0cmljdCBjaGVja2luZyBpcyByZXN0b3JlZC5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUFubm91bmNlZEhvc3RLZXlzKGFubm91bmNlbWVudDogSVNTSEhvc3RLZXlzQW5ub3VuY2VtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9ob3N0S2V5VHJ1c3RTZXJ2aWNlLmdldFRydXN0ZWRLZXlzKGFubm91bmNlbWVudC5ob3N0LCBhbm5vdW5jZW1lbnQucG9ydCk7XG5cdFx0aWYgKCFleGlzdGluZy5sZW5ndGgpIHtcblx0XHRcdC8vIE9ubHkgZXh0ZW5kIHRydXN0IHdlIGFscmVhZHkgaGF2ZS4gUmVjb3JkaW5nIGtleXMgZm9yIGEgaG9zdCB0aGVcblx0XHRcdC8vIHVzZXIgaGFzIG5ldmVyIGFjY2VwdGVkIHdvdWxkIHR1cm4gYW4gYW5ub3VuY2VtZW50IGludG8gYSB3YXkgdG9cblx0XHRcdC8vIGVzdGFibGlzaCB0cnVzdCB3aXRob3V0IGFueSB2ZXJpZmljYXRpb24gYXQgYWxsLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSB0aGlzLl9zZXNzaW9uSG9zdEtleXMuZ2V0KGFubm91bmNlbWVudC5jb25uZWN0aW9uS2V5KTtcblx0XHRpZiAoIXNlc3Npb25LZXkgfHwgIWV4aXN0aW5nLnNvbWUoZSA9PiBlLmtleVR5cGUgPT09IHNlc3Npb25LZXkua2V5VHlwZSAmJiBlLmZpbmdlcnByaW50ID09PSBzZXNzaW9uS2V5LmZpbmdlcnByaW50KSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbU1NIUmVtb3RlQWdlbnRIb3N0XSBJZ25vcmluZyBhbm5vdW5jZWQgaG9zdCBrZXlzIGZvciAke2Fubm91bmNlbWVudC5ob3N0fTogdGhlIGtleSB0aGF0IGF1dGhlbnRpY2F0ZWQgdGhpcyBzZXNzaW9uIGlzIG5vdCBpdHNlbGYgdHJ1c3RlZGApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGFubm91bmNlbWVudC5rZXlzKSB7XG5cdFx0XHRpZiAoIWV4aXN0aW5nLnNvbWUoZSA9PiBlLmtleVR5cGUgPT09IGtleS5rZXlUeXBlICYmIGUuZmluZ2VycHJpbnQgPT09IGtleS5maW5nZXJwcmludCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU1NIUmVtb3RlQWdlbnRIb3N0XSBMZWFybmVkIHJvdGF0ZWQgJHtrZXkua2V5VHlwZX0gaG9zdCBrZXkgZm9yICR7YW5ub3VuY2VtZW50Lmhvc3R9OiAke2tleS5maW5nZXJwcmludH1gKTtcblx0XHRcdFx0dGhpcy5faG9zdEtleVRydXN0U2VydmljZS50cnVzdEhvc3RLZXkoYW5ub3VuY2VtZW50Lmhvc3QsIGFubm91bmNlbWVudC5wb3J0LCB7XG5cdFx0XHRcdFx0a2V5VHlwZToga2V5LmtleVR5cGUsXG5cdFx0XHRcdFx0ZmluZ2VycHJpbnQ6IGtleS5maW5nZXJwcmludCxcblx0XHRcdFx0XHRhZGRlZEF0OiBEYXRlLm5vdygpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB3aGljaCBsaXZlIHJlbW90ZSBhZ2VudCBob3N0IGVuZHBvaW50IChvciBcInN0YXJ0IGEgbmV3IG9uZVwiKVxuXHQgKiB0byBjb25uZWN0IHRvIGFuZCBmb3J3YXJkIHRoZSBjaG9pY2UgKG9yIGNhbmNlbGxhdGlvbikgYmFjayB0byB0aGVcblx0ICogbWFpbiBzZXJ2aWNlLiBDb25zdWx0cyB0aGUgc3RvcmVkIHBlci1ob3N0IHtAbGluayBJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZX1cblx0ICogcHJlZmVyZW5jZSBmb3IgYHJlcXVlc3QuY29ubmVjdGlvbktleWAgZmlyc3Q7IG9ubHkgb3BlbnMgdGhlIHNoYXJlZFxuXHQgKiBwcmVmZXJlbmNlIG1vZGFsICh7QGxpbmsgcHJvbXB0UmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlfSlcblx0ICogd2hlbiBubyBwcmVmZXJlbmNlIGlzIHN0b3JlZCBhbmQgYW4gYGVkaXRvcmAtb3duZWQgZW5kcG9pbnQgaXMgbGl2ZSxcblx0ICogc2luY2Ugb3RoZXJ3aXNlIHRoZXJlJ3Mgbm8gYW1iaWd1aXR5IHdvcnRoIGludGVycnVwdGluZyB0aGUgdXNlciBmb3IuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVFbmRwb2ludFNlbGVjdGlvblJlcXVlc3QocmVxdWVzdDogSVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1NTSFJlbW90ZUFnZW50SG9zdF0gRW5kcG9pbnQgc2VsZWN0aW9uIHJlcXVlc3RlZCBmb3IgJHtyZXF1ZXN0LmRpc3BsYXlIb3N0fSAoJHtyZXF1ZXN0LmNhbmRpZGF0ZXMubGVuZ3RofSBjYW5kaWRhdGUocykpYCk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBjYW5jZWxMaXN0ZW5lciA9IHRoaXMuX21haW5TZXJ2aWNlLm9uRGlkQ2FuY2VsRW5kcG9pbnRTZWxlY3Rpb24ocmVxdWVzdElkID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0SWQgPT09IHJlcXVlc3QucmVxdWVzdElkKSB7XG5cdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhd2FpdCB0aGlzLl9yZXNvbHZlRW5kcG9pbnRTZWxlY3Rpb24ocmVxdWVzdCwgY3RzLnRva2VuKTtcblx0XHRcdGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnJlc3BvbmRFbmRwb2ludFNlbGVjdGlvbihyZXF1ZXN0LnJlcXVlc3RJZCwgc2VsZWN0aW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tTU0hSZW1vdGVBZ2VudEhvc3RdIEZhaWxlZCBoYW5kbGluZyBlbmRwb2ludCBzZWxlY3Rpb24gcHJvbXB0JywgZXJyKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnJlc3BvbmRFbmRwb2ludFNlbGVjdGlvbihyZXF1ZXN0LnJlcXVlc3RJZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0gY2F0Y2ggeyAvKiBzd2FsbG93ICovIH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2FuY2VsTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgdGhlIHByZWZlcmVuY2UtcmVzb2x1dGlvbiBydWxlcyBkZXNjcmliZWQgb25cblx0ICoge0BsaW5rIF9oYW5kbGVFbmRwb2ludFNlbGVjdGlvblJlcXVlc3R9LiBSZXR1cm5zIGB1bmRlZmluZWRgIG9ubHkgd2hlblxuXHQgKiB0aGUgc2hhcmVkIHByZWZlcmVuY2UgbW9kYWwgd2FzIHNob3duIGFuZCB0aGUgdXNlciBjYW5jZWxsZWQgaXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlRW5kcG9pbnRTZWxlY3Rpb24ocmVxdWVzdDogSVNTSEVuZHBvaW50U2VsZWN0aW9uUmVxdWVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU1NIRW5kcG9pbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBoYXNMaXZlRWRpdG9yID0gcmVxdWVzdC5jYW5kaWRhdGVzLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS50eXBlID09PSAnZWRpdG9yJyk7XG5cdFx0Y29uc3QgcHJlZmVyZW5jZSA9IHRoaXMuX2xvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UuZ2V0UHJlZmVyZW5jZShyZXF1ZXN0LmNvbm5lY3Rpb25LZXkpO1xuXG5cdFx0aWYgKHByZWZlcmVuY2UgPT09ICdlZGl0b3InKSB7XG5cdFx0XHQvLyBFeHBsaWNpdCBjb25zZW50IHRvIHJ1biBpbiBhbiBlZGl0b3IuIElmIG5vbmUgaXMgbGl2ZSByaWdodFxuXHRcdFx0Ly8gbm93LCBmYWxsIGJhY2sgdG8gYSBkZWRpY2F0ZWQgc2VsZWN0aW9uIHdpdGhvdXQgdG91Y2hpbmcgdGhlXG5cdFx0XHQvLyBzYXZlZCBwcmVmZXJlbmNlIFx1MjAxNCBzZWUgdGhlIGNsYXNzLWxldmVsIGNvbW1lbnQgb25cblx0XHRcdC8vIGBfbGFzdENvbm5lY3RlZFNlcnZlclR5cGVCeUFkZHJlc3NgIGZvciB3aHkgYSBmdXR1cmUgY29ubmVjdFxuXHRcdFx0Ly8gc2hvdWxkIHN0aWxsIGJlIGFibGUgdG8gcHJlZmVyIGFuIGVkaXRvciBhZ2Fpbi5cblx0XHRcdHJldHVybiBoYXNMaXZlRWRpdG9yID8gdGhpcy5fZGV0ZXJtaW5pc3RpY1NlbGVjdGlvbihyZXF1ZXN0LmNhbmRpZGF0ZXMsICdlZGl0b3InKSA6IHRoaXMuX2RlZGljYXRlZFNlbGVjdGlvbihyZXF1ZXN0LmNhbmRpZGF0ZXMpO1xuXHRcdH1cblxuXHRcdGlmIChwcmVmZXJlbmNlID09PSAnZGVkaWNhdGVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlZGljYXRlZFNlbGVjdGlvbihyZXF1ZXN0LmNhbmRpZGF0ZXMpO1xuXHRcdH1cblxuXHRcdGlmICghaGFzTGl2ZUVkaXRvcikge1xuXHRcdFx0Ly8gTm8gc3RvcmVkIHByZWZlcmVuY2UgYW5kIG5vIGVkaXRvciB0byBkaXNhbWJpZ3VhdGUgYWdhaW5zdCBcdTIwMTRcblx0XHRcdC8vIG5vdGhpbmcgaGVyZSBjYW4gc3RlYWwgYSBzZXNzaW9uIGZyb20gYW5vdGhlciBvcGVuIHdpbmRvdyxcblx0XHRcdC8vIHNvIHJlc29sdmUgc2lsZW50bHkgd2l0aG91dCBwcm9tcHRpbmcuXG5cdFx0XHRyZXR1cm4gdGhpcy5fZGVkaWNhdGVkU2VsZWN0aW9uKHJlcXVlc3QuY2FuZGlkYXRlcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hvc2VuID0gYXdhaXQgcHJvbXB0UmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlKHRoaXMuX2RpYWxvZ1NlcnZpY2UsIHJlcXVlc3QuZGlzcGxheUhvc3QsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFjaG9zZW4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2xvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2Uuc2V0UHJlZmVyZW5jZShyZXF1ZXN0LmNvbm5lY3Rpb25LZXksIGNob3Nlbik7XG5cdFx0cmV0dXJuIGNob3NlbiA9PT0gJ2VkaXRvcicgPyB0aGlzLl9kZXRlcm1pbmlzdGljU2VsZWN0aW9uKHJlcXVlc3QuY2FuZGlkYXRlcywgJ2VkaXRvcicpIDogdGhpcy5fZGVkaWNhdGVkU2VsZWN0aW9uKHJlcXVlc3QuY2FuZGlkYXRlcyk7XG5cdH1cblxuXHQvKiogUmV1c2UgYSBsaXZlIHN0YW5kYWxvbmUgZW5kcG9pbnQgaWYgb25lIGV4aXN0cywgb3Igc3Bhd24gYSBuZXcgZGVkaWNhdGVkIG9uZS4gKi9cblx0cHJpdmF0ZSBfZGVkaWNhdGVkU2VsZWN0aW9uKGNhbmRpZGF0ZXM6IHJlYWRvbmx5IElTU0hFbmRwb2ludENhbmRpZGF0ZVtdKTogSVNTSEVuZHBvaW50U2VsZWN0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fZGV0ZXJtaW5pc3RpY1NlbGVjdGlvbihjYW5kaWRhdGVzLCAnc3RhbmRhbG9uZScpID8/IHsga2luZDogJ3NwYXduJyB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFBpY2sgdGhlIGNhbmRpZGF0ZSBvZiBgdHlwZWAgZGV0ZXJtaW5pc3RpY2FsbHkgd2hlbiBzZXZlcmFsIGFyZSBsaXZlLFxuXHQgKiBieSBzb3J0aW5nIG9uIGBpbnN0YW5jZUlkYCBzbyBldmVyeSByZW5kZXJlciByZXNvbHZpbmcgdGhlIHNhbWVcblx0ICogcmVxdWVzdCAoZS5nLiBtdWx0aXBsZSBvcGVuIGVkaXRvciB3aW5kb3dzKSBjb252ZXJnZXMgb24gdGhlIHNhbWVcblx0ICogY2hvaWNlIHdpdGhvdXQgbmVlZGluZyB0byBjb29yZGluYXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGV0ZXJtaW5pc3RpY1NlbGVjdGlvbihjYW5kaWRhdGVzOiByZWFkb25seSBJU1NIRW5kcG9pbnRDYW5kaWRhdGVbXSwgdHlwZTogQWdlbnRIb3N0U2VydmVyVHlwZSk6IElTU0hFbmRwb2ludFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbWF0Y2hpbmcgPSBjYW5kaWRhdGVzLmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnR5cGUgPT09IHR5cGUpO1xuXHRcdGlmIChtYXRjaGluZy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IFtjaG9zZW5dID0gbWF0Y2hpbmcuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBhLmluc3RhbmNlSWQgPCBiLmluc3RhbmNlSWQgPyAtMSA6IGEuaW5zdGFuY2VJZCA+IGIuaW5zdGFuY2VJZCA/IDEgOiAwKTtcblx0XHRyZXR1cm4geyBraW5kOiAnY2FuZGlkYXRlJywgdHlwZTogY2hvc2VuLnR5cGUsIHBpZDogY2hvc2VuLnBpZCwgaW5zdGFuY2VJZDogY2hvc2VuLmluc3RhbmNlSWQgfTtcblx0fVxufVxuXG4vKipcbiAqIExpZ2h0d2VpZ2h0IHJlbmRlcmVyLXNpZGUgaGFuZGxlIHRoYXQgcmVwcmVzZW50cyBhIGNvbm5lY3Rpb25cbiAqIG1hbmFnZWQgYnkgdGhlIG1haW4gcHJvY2Vzcy5cbiAqL1xuY2xhc3MgU1NIQWdlbnRIb3N0Q29ubmVjdGlvbkhhbmRsZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU1NIQWdlbnRIb3N0Q29ubmVjdGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZSA9IHRoaXMuX29uRGlkQ2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY2xvc2VkQnlNYWluID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29ubmVjdGlvblsnY29uZmlnJ10sXG5cdFx0cmVhZG9ubHkgbG9jYWxBZGRyZXNzOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHNlcnZlclR5cGU6IElTU0hBZ2VudEhvc3RDb25uZWN0aW9uWydzZXJ2ZXJUeXBlJ10sXG5cdFx0cmVhZG9ubHkgaW5zdGFuY2VJZDogSVNTSEFnZW50SG9zdENvbm5lY3Rpb25bJ2luc3RhbmNlSWQnXSxcblx0XHRyZWFkb25seSBwcmltYXJ5OiBJU1NIQWdlbnRIb3N0Q29ubmVjdGlvblsncHJpbWFyeSddLFxuXHRcdHJlYWRvbmx5IGxpZmVjeWNsZTogSVNTSEFnZW50SG9zdENvbm5lY3Rpb25bJ2xpZmVjeWNsZSddLFxuXHRcdGRpc2Nvbm5lY3RGbjogKCkgPT4gUHJvbWlzZTx2b2lkPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFdoZW4gdGhpcyBoYW5kbGUgaXMgZGlzcG9zZWQsIHRlYXIgZG93biB0aGUgbWFpbi1wcm9jZXNzIHR1bm5lbFxuXHRcdC8vIChza2lwIGlmIGFscmVhZHkgY2xvc2VkIGZyb20gdGhlIG1haW4gcHJvY2VzcyBzaWRlKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2Nsb3NlZEJ5TWFpbikge1xuXHRcdFx0XHRkaXNjb25uZWN0Rm4oKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QgZWZmb3J0ICovIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBDYWxsZWQgYnkgdGhlIHNlcnZpY2Ugd2hlbiB0aGUgbWFpbiBwcm9jZXNzIHNpZ25hbHMgY29ubmVjdGlvbiBjbG9zdXJlLiAqL1xuXHRmaXJlQ2xvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xvc2VkQnlNYWluID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9C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
