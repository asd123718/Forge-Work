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
import { disposableTimeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { isJsonRpcResponse } from "../../../base/common/jsonRpcProtocol.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILogService } from "../../log/common/log.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { getAgentHostClientType } from "../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind, readClientConnectionKind, readClientDevDeviceId, readClientMachineId } from "../common/agentHostTelemetry.js";
import { AgentSession } from "../common/agent.js";
import { isManagedSettingsPermissions } from "../common/agentHostManagedSettings.js";
import { isActionEnvelopeRelevantToSubscriptionUris } from "../common/state/agentSubscription.js";
import { ChatSourceKind } from "../common/state/protocol/channels-chat/commands.js";
import { ActionType, isAnnotationsAction, isChangesetAction, isChatAction, isSessionAction, isTerminalAction } from "../common/state/sessionActions.js";
import { PROTOCOL_VERSION } from "../common/state/protocol/version/registry.js";
import { negotiateProtocolVersion } from "../common/state/protocol/version/negotiation.js";
import { VSCODE_UPGRADE_METHOD } from "../common/state/protocolUpgrade.js";
import { getAgentHostManagementSocketPath, requestAgentHostUpgrade } from "./agentHostUpgradeChannel.js";
import {
  AHP_AUTH_REQUIRED,
  AhpErrorCodes,
  AHP_PROVIDER_NOT_FOUND,
  AHP_SESSION_NOT_FOUND,
  AHP_UNSUPPORTED_PROTOCOL_VERSION,
  isJsonRpcNotification,
  isJsonRpcRequest,
  JSON_RPC_INTERNAL_ERROR,
  JsonRpcErrorCodes,
  ProtocolError
} from "../common/state/sessionProtocol.js";
import { isAhpResourceWatchChannel, isAhpRootChannel, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildDefaultChatUri, isAhpChatChannel, parseChatUri, parseRequiredSessionUriFromChatUri } from "../common/state/sessionState.js";
import { IAgentHostManagedSettingsService } from "./agentHostManagedSettingsService.js";
import {
  buildOtlpLogsChannelUri,
  extractLevelFromOtlpLogsUri,
  levelToSeverityNumber,
  OTLP_CHANNEL_SCHEME,
  OTLP_LOGS_CHANNEL_TEMPLATE,
  toResourceLogsPayload
} from "../common/otlp/otlpLogEmitter.js";
import { isFileResourceRead } from "../common/resourceReadLogging.js";
import { AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION, AgentHostClientConnectionTelemetryTracker } from "./agentHostClientConnectionTelemetry.js";
import { AgentHostTelemetryReporter } from "./agentHostTelemetryReporter.js";
const REPLAY_BUFFER_CAPACITY = 1e3;
const CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT = 3e4;
const UNSUPPORTED_CLIENT_ACTION_TYPES = /* @__PURE__ */ new Set([
  ActionType.ChatWorkingDirectorySet,
  ActionType.ChatWorkingDirectoryRemoved
]);
function isPendingToolCallStatus(status) {
  return status === ToolCallStatus.Streaming || status === ToolCallStatus.Running || status === ToolCallStatus.PendingConfirmation;
}
function jsonRpcSuccess(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function jsonRpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, ...data !== void 0 ? { data } : {} } };
}
function jsonRpcErrorFrom(id, err) {
  if (err instanceof ProtocolError) {
    return jsonRpcError(id, err.code, err.message, err.data);
  }
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, message);
}
function shouldLogFailedRequest(method, params, err) {
  if (!(err instanceof ProtocolError) || err.code !== AhpErrorCodes.NotFound || !isFileResourceRead(method, params)) {
    return true;
  }
  return false;
}
function isParamsObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readMcpChannel(params) {
  if (!isParamsObject(params)) {
    return void 0;
  }
  const channel = params["channel"];
  if (typeof channel !== "string" || !channel.startsWith("mcp://")) {
    return void 0;
  }
  return channel;
}
var ChannelKind = /* @__PURE__ */ ((ChannelKind2) => {
  ChannelKind2["State"] = "state";
  ChannelKind2["ResourceWatch"] = "resource-watch";
  ChannelKind2["OtlpLogs"] = "otlp-logs";
  return ChannelKind2;
})(ChannelKind || {});
function classifyChannel(channel) {
  if (channel.toLowerCase().startsWith(`${OTLP_CHANNEL_SCHEME}:`)) {
    const level = extractLevelFromOtlpLogsUri(channel);
    if (!level) {
      return void 0;
    }
    return { kind: "otlp-logs" /* OtlpLogs */, uri: buildOtlpLogsChannelUri(level), level };
  }
  if (isAhpResourceWatchChannel(channel)) {
    return { kind: "resource-watch" /* ResourceWatch */, uri: channel };
  }
  return { kind: "state" /* State */, uri: channel };
}
let ProtocolServerHandler = class extends Disposable {
  constructor(_agentService, _stateManager, _server, _config, _clientFileSystemProvider, _logService, telemetryService, _managedSettingsService) {
    super();
    this._agentService = _agentService;
    this._stateManager = _stateManager;
    this._server = _server;
    this._config = _config;
    this._clientFileSystemProvider = _clientFileSystemProvider;
    this._logService = _logService;
    this._managedSettingsService = _managedSettingsService;
    /**
     * Per-client records keyed by clientId. Holds both connected clients
     * (`connections` non-empty) and recently-disconnected ones retained for the
     * tool-call disconnect-grace window (`connections.length === 0`). See
     * {@link IClientRecord}.
     */
    this._clients = /* @__PURE__ */ new Map();
    this._replayBuffer = [];
    this._managedSettingsOwnerId = generateUuid();
    this._onDidChangeConnectionCount = this._register(new Emitter());
    /** Fires with the current client count whenever a client connects or disconnects. */
    this.onDidChangeConnectionCount = this._onDidChangeConnectionCount.event;
    // ---- Requests (expect a response) ---------------------------------------
    /**
     * Methods handled by the request dispatcher (excludes initialize/reconnect
     * which are handled during the handshake phase).
     */
    this._requestHandlers = {
      subscribe: async (client, params) => {
        const classified = classifyChannel(params.channel);
        if (!classified) {
          return {};
        }
        if (classified.kind === "otlp-logs" /* OtlpLogs */) {
          if (!this._config.otlpLogEmitter) {
            this._logService.warn(`[ProtocolServer] Ignoring OTLP subscribe for ${params.channel}: no OTLP emitter configured.`);
            return {};
          }
          client.subscriptions.set(classified.uri, classified);
          return {};
        }
        if (classified.kind === "resource-watch" /* ResourceWatch */) {
          const descriptor = this._agentService.onResourceWatchSubscribed(classified.uri);
          if (!descriptor) {
            throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource watch not found: ${params.channel}`);
          }
          client.subscriptions.set(classified.uri, classified);
          return {
            snapshot: {
              resource: classified.uri,
              state: descriptor,
              fromSeq: this._stateManager.serverSeq
            }
          };
        }
        try {
          const snapshot = await this._agentService.subscribe(URI.parse(params.channel), client.clientId);
          client.subscriptions.set(classified.uri, classified);
          this._clearClientToolCallDisconnectTimeout(client.clientId, classified.uri);
          return { snapshot };
        } catch (err) {
          if (err instanceof ProtocolError) {
            throw err;
          }
          throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource not found: ${params.channel}`);
        }
      },
      createSession: async (_client, params) => {
        let createdSession;
        let fork;
        if (params.fork) {
          if (URI.parse(params.fork.session).toString() === URI.parse(params.channel).toString()) {
            throw new ProtocolError(AhpErrorCodes.SessionAlreadyExists, `Fork target session must differ from source session: ${params.channel}`);
          }
          const sourceState = this._stateManager.getSessionState(params.fork.session);
          if (!sourceState) {
            throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Fork source session not found: ${params.fork.session}`);
          }
          const turnIndex = sourceState.turns.findIndex((t) => t.id === params.fork.turnId);
          if (turnIndex < 0) {
            throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Fork turn ID ${params.fork.turnId} not found in session ${params.fork.session}`);
          }
          const sourceSession = URI.parse(params.fork.session);
          fork = { session: sourceSession, chat: URI.parse(buildDefaultChatUri(sourceSession)), turnIndex, turnId: params.fork.turnId };
        }
        if (params.activeClient && params.activeClient.clientId !== _client.clientId) {
          throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `createSession.activeClient.clientId must match the connection's clientId`);
        }
        try {
          createdSession = await this._agentService.createSession({
            provider: params.provider,
            _meta: params._meta,
            workingDirectories: params.workingDirectories?.map((d) => URI.parse(d)),
            session: URI.parse(params.channel),
            fork,
            config: params.config,
            activeClient: params.activeClient,
            progressToken: params.progressToken
          });
        } catch (err) {
          if (err instanceof ProtocolError) {
            throw err;
          }
          throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, err instanceof Error ? err.message : String(err));
        }
        if (createdSession.toString() !== URI.parse(params.channel).toString()) {
          this._logService.warn(`[ProtocolServer] createSession: provider returned URI ${createdSession.toString()} but client requested ${params.channel}`);
        }
        return null;
      },
      disposeSession: async (_client, params) => {
        await this._agentService.disposeSession(URI.parse(params.channel));
        return null;
      },
      createChat: async (_client, params) => {
        const state = this._stateManager.getSessionState(params.channel);
        if (!state) {
          throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.channel}`);
        }
        const defaultChat = state.defaultChat ?? buildDefaultChatUri(params.channel);
        if (URI.parse(params.chat).toString() === URI.parse(defaultChat).toString()) {
          return null;
        }
        const source = params.source;
        let options;
        if (source) {
          switch (source.kind) {
            case ChatSourceKind.Fork:
              options = { fork: { source: URI.parse(source.chat), turnId: source.turnId } };
              break;
            case ChatSourceKind.SideChat:
              options = {
                sideChat: {
                  source: URI.parse(source.chat),
                  turnId: source.turnId,
                  ...source.selection ? { selection: source.selection } : {}
                }
              };
              break;
            default:
              throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unsupported createChat source kind: ${String(source.kind)}`);
          }
        }
        await this._agentService.createChat(
          URI.parse(params.channel),
          URI.parse(params.chat),
          options
        );
        return null;
      },
      disposeChat: async (_client, params) => {
        const chat = URI.parse(params.channel);
        const parsed = parseChatUri(chat);
        if (!parsed) {
          return null;
        }
        await this._agentService.disposeChat(URI.parse(parsed.session), chat);
        return null;
      },
      resourceWrite: async (_client, params) => {
        return this._agentService.resourceWrite(params);
      },
      listSessions: async () => {
        const sessions = await this._agentService.listSessions();
        const items = sessions.map((s) => {
          const provider = AgentSession.provider(s.session);
          if (!provider) {
            throw new Error(`Agent session URI has no provider scheme: ${s.session.toString()}`);
          }
          return {
            resource: s.session.toString(),
            provider,
            title: s.summary ?? "Session",
            status: s.status ?? SessionStatus.Idle,
            activity: s.activity,
            createdAt: new Date(s.startTime).toISOString(),
            modifiedAt: new Date(s.modifiedTime).toISOString(),
            ...s.project ? { project: { uri: s.project.uri.toString(), displayName: s.project.displayName } } : {},
            workingDirectories: s.workingDirectories?.map((d) => d.toString()),
            changes: s.changes,
            // `_meta` carries durable host provenance, including session kind
            // and provider-native discovery provenance.
            ...s._meta !== void 0 ? { _meta: s._meta } : {}
          };
        });
        return { items };
      },
      resolveSessionConfig: async (_client, params) => {
        return this._agentService.resolveSessionConfig({
          provider: params.provider,
          workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : void 0,
          config: params.config
        });
      },
      sessionConfigCompletions: async (_client, params) => {
        return this._agentService.sessionConfigCompletions({
          provider: params.provider,
          workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : void 0,
          config: params.config,
          property: params.property,
          query: params.query
        });
      },
      completions: async (_client, params) => {
        return this._agentService.completions(params);
      },
      fetchTurns: async (_client, params) => {
        const state = this._stateManager.getChatState(params.channel);
        if (!state) {
          throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.channel}`);
        }
        if (params.cursor && params.cursor !== state.turnsNextCursor) {
          throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unrecognized fetchTurns cursor`);
        }
        this._stateManager.dispatchServerAction(params.channel, {
          type: ActionType.ChatTurnsLoaded,
          turns: []
        });
        return {};
      },
      resourceList: async (_client, params) => {
        return this._agentService.resourceList(URI.parse(params.uri));
      },
      resourceRead: async (_client, params) => {
        return this._agentService.resourceRead(URI.parse(params.uri));
      },
      resourceCopy: async (_client, params) => {
        return this._agentService.resourceCopy(params);
      },
      resourceDelete: async (_client, params) => {
        return this._agentService.resourceDelete(params);
      },
      resourceMove: async (_client, params) => {
        return this._agentService.resourceMove(params);
      },
      resourceResolve: async (_client, params) => {
        return this._agentService.resourceResolve(params);
      },
      resourceMkdir: async (_client, params) => {
        return this._agentService.resourceMkdir(params);
      },
      createResourceWatch: async (_client, params) => {
        return this._agentService.createResourceWatch(params);
      },
      resourceRequest: async (_client, _params) => {
        return {};
      },
      authenticate: async (_client, params) => {
        const result = await this._agentService.authenticate(params);
        if (!result.authenticated) {
          throw new ProtocolError(AHP_AUTH_REQUIRED, `Authentication failed for resource: ${params.resource}`);
        }
        return {};
      },
      createTerminal: async (_client, params) => {
        await this._agentService.createTerminal(params);
        return null;
      },
      disposeTerminal: async (_client, params) => {
        await this._agentService.disposeTerminal(URI.parse(params.channel));
        return null;
      },
      invokeChangesetOperation: async (_client, params) => {
        return this._agentService.invokeChangesetOperation(params);
      }
    };
    // ---- Reverse RPC (server → client requests) ----------------------------
    this._reverseRequestId = 0;
    this._pendingReverseRequests = /* @__PURE__ */ new Map();
    this._inflightRequests = /* @__PURE__ */ new Set();
    this._telemetryReporter = new AgentHostTelemetryReporter(telemetryService);
    this._connectionTelemetryTracker = this._config.connectionTelemetryTracker ?? this._register(new AgentHostClientConnectionTelemetryTracker());
    this._register(this._server.onConnection((transport) => {
      this._handleNewConnection(transport);
    }));
    this._register(this._stateManager.onDidEmitEnvelope((envelope) => {
      this._replayBuffer.push(envelope);
      if (this._replayBuffer.length > REPLAY_BUFFER_CAPACITY) {
        this._replayBuffer.shift();
      }
      this._broadcastAction(envelope);
      if (envelope.action.type === ActionType.ChatToolCallStart || envelope.action.type === ActionType.ChatToolCallReady) {
        if (!isAhpChatChannel(envelope.channel)) {
          throw new Error(`[ProtocolServer] Chat tool-call action emitted on non-chat channel: ${envelope.channel}`);
        }
        this._checkOrphanedClientToolCalls(parseRequiredSessionUriFromChatUri(envelope.channel), envelope.channel);
      }
    }));
    this._register(this._stateManager.onDidEmitNotification((notification) => {
      this._broadcastNotification(notification);
    }));
    this._register(this._agentService.onMcpNotification((notification) => {
      this._broadcastMcpNotification(notification);
    }));
    if (this._config.otlpLogEmitter) {
      this._register(this._config.otlpLogEmitter.onDidLog((record) => this._broadcastOtlpLog(record)));
    }
  }
  // ---- Connection handling -------------------------------------------------
  _handleNewConnection(transport) {
    const disposables = new DisposableStore();
    let client;
    disposables.add(transport.onMessage((msg) => {
      if (isJsonRpcRequest(msg)) {
        this._logService.trace(`[ProtocolServer] request: method=${msg.method} id=${msg.id}`);
        if (msg.method === "ping") {
          transport.send(jsonRpcSuccess(msg.id, null));
          return;
        }
        if (!client && msg.method === "initialize") {
          try {
            const result = this._handleInitialize(msg.params, transport, disposables);
            client = result.client;
            transport.send(jsonRpcSuccess(msg.id, result.response));
          } catch (err) {
            transport.send(jsonRpcErrorFrom(msg.id, err));
          }
          return;
        }
        if (!client && msg.method === "reconnect") {
          let responsePromise;
          try {
            const result = this._handleReconnect(msg.params, transport, disposables);
            client = result.client;
            responsePromise = this._trackRequest(result.responsePromise);
          } catch (err) {
            transport.send(jsonRpcErrorFrom(msg.id, err));
            return;
          }
          responsePromise.then(
            (response) => transport.send(jsonRpcSuccess(msg.id, response)),
            (err) => transport.send(jsonRpcErrorFrom(msg.id, err))
          );
          return;
        }
        if (msg.method === VSCODE_UPGRADE_METHOD) {
          this._handleVscodeUpgrade(msg.id, transport);
          return;
        }
        if (!client) {
          transport.send(jsonRpcError(msg.id, JsonRpcErrorCodes.MethodNotFound, `Method not found: ${msg.method}`));
          return;
        }
        this._handleRequest(client, msg.method, msg.params, msg.id);
      } else if (isJsonRpcNotification(msg)) {
        this._logService.trace(`[ProtocolServer] notification: method=${msg.method}`);
        if (msg.method === "setClientManagedSettingsPermissions") {
          if (client) {
            const permissions = msg.params?.permissions;
            if (isManagedSettingsPermissions(permissions)) {
              this._managedSettingsService.setClientPermissions(this._managedSettingsContributionId(client.clientId), permissions);
            } else {
              this._logService.warn("[ProtocolServer] Ignoring invalid managed settings permissions contribution.");
            }
          }
          return;
        }
        switch (msg.method) {
          case "unsubscribe":
            if (client) {
              this._removeSubscription(client, msg.params.channel);
            }
            break;
          case "dispatchAction":
            if (client) {
              this._logService.trace(`[ProtocolServer] dispatchAction: ${JSON.stringify(msg.params.action.type)}`);
              const action = msg.params.action;
              const channel = msg.params.channel;
              if (UNSUPPORTED_CLIENT_ACTION_TYPES.has(action.type)) {
                this._logService.warn(`[ProtocolServer] rejecting unsupported client action: ${action.type}`);
                this._stateManager.rejectClientAction(
                  channel,
                  action,
                  { clientId: client.clientId, clientSeq: msg.params.clientSeq },
                  `Unsupported action: ${action.type}`
                );
              } else if (isSessionAction(action) || isChatAction(action) || isTerminalAction(action) || isChangesetAction(action) || isAnnotationsAction(action) || action.type === ActionType.RootConfigChanged) {
                this._agentService.dispatchAction(channel, action, client.clientId, msg.params.clientSeq, client.telemetryContext);
              }
            }
            break;
        }
      } else if (isJsonRpcResponse(msg)) {
        const pending = this._pendingReverseRequests.get(msg.id);
        if (pending && pending.client === client) {
          this._pendingReverseRequests.delete(msg.id);
          if (hasKey(msg, { error: true })) {
            pending.reject(new ProtocolError(
              msg.error?.code ?? -32e3,
              msg.error?.message ?? "Reverse RPC error",
              msg.error?.data
            ));
          } else {
            pending.resolve(msg.result);
          }
        }
      }
    }));
    disposables.add(transport.onClose(() => {
      const record = client ? this._clients.get(client.clientId) : void 0;
      if (client && record?.state === "active") {
        const connectionIndex = record.connections.indexOf(client);
        if (connectionIndex !== -1) {
          const subscriptionCount = client.subscriptions.size;
          record.connections.splice(connectionIndex, 1);
          this._releaseClientSubscriptions(client, record);
          this._rejectPendingReverseRequestsForConnection(client);
          if (record.connections.length === 0) {
            this._logService.info(`[ProtocolServer] Client disconnected: ${client.clientId}, subscriptions=${subscriptionCount}`);
            this._clients.set(client.clientId, {
              state: "grace",
              clientInfo: record.clientInfo,
              telemetryContext: client.telemetryContext,
              protocolVersion: client.protocolVersion,
              lastSeenAt: Date.now(),
              disconnectTimeouts: new DisposableMap()
            });
            this._handleClientDisconnected(client.clientId);
            this._onDidChangeConnectionCount.fire(this._connectedClientCount);
          }
          this._reportClientDisconnected(client, subscriptionCount);
        }
      }
      disposables.dispose();
    }));
    disposables.add(transport);
  }
  // ---- Handshake handlers ----------------------------------------------------
  _handleInitialize(params, transport, disposables) {
    const offered = Array.isArray(params.protocolVersions) ? params.protocolVersions : [];
    this._logService.info(`[ProtocolServer] Initialize: clientId=${params.clientId}, protocolVersions=[${offered.join(", ")}]`);
    const negotiated = negotiateProtocolVersion(offered, PROTOCOL_VERSION);
    if (!negotiated) {
      const data = {
        supportedVersions: [`^${PROTOCOL_VERSION}`],
        // Only advertise the in-band upgrade method when the agent
        // host was spawned by a VS Code CLI that is listening for
        // management requests (presence of the env var). Otherwise
        // there is no supervisor to actually act on it, so don't
        // lie to the client.
        _meta: getAgentHostManagementSocketPath() ? { vscodeUpgradeMethod: VSCODE_UPGRADE_METHOD } : void 0
      };
      throw new ProtocolError(
        AHP_UNSUPPORTED_PROTOCOL_VERSION,
        `Client offered protocol versions [${offered.join(", ")}], none of which are compatible with this server's version ${PROTOCOL_VERSION} (server accepts ^${PROTOCOL_VERSION}).`,
        data
      );
    }
    const previousRecord = this._clients.get(params.clientId);
    const telemetryTransportToken = {};
    const initializationDisposables = disposables.add(new DisposableStore());
    const telemetryContext = this._createClientTelemetryContext(params.clientInfo, params._meta, transport);
    const client = {
      clientId: params.clientId,
      clientInfo: params.clientInfo,
      telemetryContext,
      protocolVersion: negotiated,
      transport,
      connectionStopWatch: StopWatch.create(true),
      telemetryTransportToken,
      isReconnect: this._connectionTelemetryTracker.hasSeenClient(params.clientId),
      telemetryConnectionActive: false,
      subscriptions: /* @__PURE__ */ new Map(),
      disposables,
      initializationDisposables
    };
    this._attachConnection(params.clientId, client);
    try {
      this._registerClientFileSystemAuthority(params.clientId, initializationDisposables);
      const snapshots = [];
      if (params.initialSubscriptions) {
        for (const uri of params.initialSubscriptions) {
          const snapshot = this._addInitialSubscription(client, uri.toString());
          if (snapshot) {
            snapshots.push(snapshot);
          }
        }
      }
      const counts = this._connectionTelemetryTracker.connect(params.clientId, telemetryTransportToken);
      client.telemetryConnectionActive = true;
      if (previousRecord?.state === "grace") {
        previousRecord.disconnectTimeouts.dispose();
      }
      this._onDidChangeConnectionCount.fire(this._connectedClientCount);
      this._telemetryReporter.clientConnection({
        action: "connected",
        context: telemetryContext,
        clientId: client.clientId,
        clientImplementationName: client.clientInfo?.name,
        clientImplementationVersion: client.clientInfo?.version,
        protocolVersion: client.protocolVersion,
        ...counts
      });
      return {
        client,
        response: {
          protocolVersion: negotiated,
          serverSeq: this._stateManager.serverSeq,
          snapshots,
          defaultDirectory: this._config.defaultDirectory,
          completionTriggerCharacters: this._config.completionTriggerCharacters,
          terminalCommandPrefix: this._config.terminalCommandPrefix,
          telemetry: this._config.otlpLogEmitter ? { logs: OTLP_LOGS_CHANNEL_TEMPLATE } : void 0
        }
      };
    } catch (error) {
      this._rollbackFailedInitialization(client, previousRecord);
      throw error;
    }
  }
  /**
   * Helper for `initialize` and `reconnect` initial-subscription
   * processing: classify `channel`, install the matching subscription
   * on the client, and return the snapshot to include in the handshake
   * response (or `undefined` for stateless channels and missing state).
   *
   * Side effects:
   * - State channels: register with the agent service and clear any
   *   pending tool-call disconnect timeout.
   * - OTLP channels: install the canonical entry on the client's
   *   {@link IConnectedClient.subscriptions} map.
   *
   * Channels with unsupported shapes (e.g. `ahp-otlp://logs/verbose`
   * with no recognised level) are silently dropped. Valid state channels
   * remain subscribed even when their snapshot has not materialized yet.
   */
  _addInitialSubscription(client, channel) {
    const sub = classifyChannel(channel);
    if (!sub) {
      return void 0;
    }
    if (sub.kind === "otlp-logs" /* OtlpLogs */) {
      if (!this._config.otlpLogEmitter) {
        this._logService.warn(`[ProtocolServer] Ignoring OTLP initialSubscription ${channel}: no OTLP emitter configured.`);
        return void 0;
      }
      client.subscriptions.set(sub.uri, sub);
      return void 0;
    }
    const snapshot = this._stateManager.getSnapshot(channel);
    client.subscriptions.set(sub.uri, sub);
    this._agentService.addSubscriber(URI.parse(sub.uri), client.clientId);
    this._clearClientToolCallDisconnectTimeout(client.clientId, sub.uri);
    return snapshot;
  }
  /**
   * Forwards a client's upgrade request to the hosting VS Code CLI's
   * HTTP management API (advertised via the {@link VSCODE_AGENT_HOST_MANAGEMENT_SOCKET_ENV}).
   * Returns the CLI's parsed response verbatim so the client can render
   * a meaningful status (already up-to-date, restart scheduled, etc.).
   *
   * When the server was not spawned by a managing CLI, responds with
   * `MethodNotFound` — the upgrade method is only meaningfully callable
   * on CLI-hosted servers.
   */
  _handleVscodeUpgrade(id, transport) {
    const socketPath = getAgentHostManagementSocketPath();
    if (!socketPath) {
      transport.send(jsonRpcError(
        id,
        JsonRpcErrorCodes.MethodNotFound,
        `No upgrade supervisor is available for this agent host.`
      ));
      return;
    }
    this._trackRequest(requestAgentHostUpgrade(socketPath)).then(
      (result) => transport.send(jsonRpcSuccess(id, result)),
      (err) => {
        this._logService.warn(`[ProtocolServer] vscodeUpgrade signal failed: ${err instanceof Error ? err.message : String(err)}`);
        transport.send(jsonRpcErrorFrom(id, err));
      }
    );
  }
  _handleReconnect(params, transport, disposables) {
    this._logService.info(`[ProtocolServer] Reconnect: clientId=${params.clientId}, lastSeenSeq=${params.lastSeenServerSeq}`);
    const existingRecord = this._clients.get(params.clientId);
    if (!existingRecord) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `Reconnect client not found: ${params.clientId}`);
    }
    const priorTelemetryContext = existingRecord.state === "active" ? existingRecord.connections.at(-1)?.telemetryContext : existingRecord.telemetryContext;
    const priorProtocolVersion = existingRecord.state === "active" ? existingRecord.connections.at(-1)?.protocolVersion : existingRecord.protocolVersion;
    const telemetryTransportToken = {};
    const initializationDisposables = disposables.add(new DisposableStore());
    const client = {
      clientId: params.clientId,
      clientInfo: existingRecord.clientInfo,
      telemetryContext: this._createClientTelemetryContext(existingRecord.clientInfo, params._meta, transport, priorTelemetryContext?.connectionKind),
      protocolVersion: priorProtocolVersion ?? PROTOCOL_VERSION,
      transport,
      connectionStopWatch: StopWatch.create(true),
      telemetryTransportToken,
      isReconnect: true,
      telemetryConnectionActive: false,
      subscriptions: /* @__PURE__ */ new Map(),
      disposables,
      initializationDisposables
    };
    this._attachConnection(params.clientId, client);
    try {
      this._registerClientFileSystemAuthority(params.clientId, initializationDisposables);
      const oldestBuffered = this._replayBuffer.length > 0 ? this._replayBuffer[0].serverSeq : this._stateManager.serverSeq;
      const canReplay = params.lastSeenServerSeq >= oldestBuffered;
      const responsePromise = this._restoreReconnectSubscriptions(client, params, canReplay);
      const counts = this._connectionTelemetryTracker.connect(params.clientId, telemetryTransportToken);
      client.telemetryConnectionActive = true;
      if (existingRecord.state === "grace") {
        existingRecord.disconnectTimeouts.dispose();
      }
      this._onDidChangeConnectionCount.fire(this._connectedClientCount);
      this._telemetryReporter.clientConnection({
        action: "connected",
        context: client.telemetryContext,
        clientId: client.clientId,
        clientImplementationName: client.clientInfo?.name,
        clientImplementationVersion: client.clientInfo?.version,
        protocolVersion: client.protocolVersion,
        ...counts
      });
      return { client, responsePromise };
    } catch (error) {
      this._rollbackFailedInitialization(client, existingRecord);
      throw error;
    }
  }
  /**
   * Wires the reverse-RPC filesystem callbacks for `clientId` and binds
   * the unregister to `disposables` (the transport's per-connection
   * store). The callbacks dispatch through {@link _sendReverseRequest},
   * which looks up the *current* connected client by id — so re-binding
   * after a reconnect picks up the new transport without rebuilding the
   * closures.
   */
  _registerClientFileSystemAuthority(clientId, disposables) {
    disposables.add(this._clientFileSystemProvider.registerAuthority(clientId, {
      resourceList: (uri) => this._sendReverseRequest(clientId, "resourceList", { uri: uri.toString() }),
      resourceRead: (uri) => this._sendReverseRequest(clientId, "resourceRead", { uri: uri.toString() }),
      resourceWrite: (params_) => this._sendReverseRequest(clientId, "resourceWrite", params_),
      resourceCopy: (params_) => this._sendReverseRequest(clientId, "resourceCopy", params_),
      resourceDelete: (params_) => this._sendReverseRequest(clientId, "resourceDelete", params_),
      resourceMove: (params_) => this._sendReverseRequest(clientId, "resourceMove", params_),
      resourceRequest: (params_) => this._sendReverseRequest(clientId, "resourceRequest", params_),
      resourceResolve: (params_) => this._sendReverseRequest(clientId, "resourceResolve", params_),
      resourceMkdir: (params_) => this._sendReverseRequest(clientId, "resourceMkdir", params_)
    }));
  }
  /**
   * Re-establish each of the client's prior subscriptions on the server side.
   * Uses {@link IAgentService.subscribe} (rather than a bare `addSubscriber`
   * + `getSnapshot`) so any session state that was evicted while the client
   * was disconnected is restored. Returns the appropriate reconnect response
   * payload — `replay` actions when the client's last-seen seq is still in
   * the buffer, otherwise fresh `snapshot`s.
   */
  async _restoreReconnectSubscriptions(client, params, canReplay) {
    const missing = [];
    const snapshots = await Promise.all(params.subscriptions.map(async (sub) => {
      const key = sub.toString();
      const classified = classifyChannel(key);
      if (!classified) {
        return void 0;
      }
      if (classified.kind === "otlp-logs" /* OtlpLogs */) {
        if (!this._config.otlpLogEmitter) {
          this._logService.warn(`[ProtocolServer] Reconnect: dropping OTLP subscription ${key}: no OTLP emitter configured.`);
          return void 0;
        }
        client.subscriptions.set(classified.uri, classified);
        return void 0;
      }
      if (classified.kind === "resource-watch" /* ResourceWatch */) {
        const descriptor = this._agentService.onResourceWatchSubscribed(classified.uri);
        if (!descriptor) {
          this._logService.info(`[ProtocolServer] Reconnect: resource watch ${key} no longer parses`);
          missing.push(sub);
          return void 0;
        }
        client.subscriptions.set(classified.uri, classified);
        return {
          resource: classified.uri,
          state: descriptor,
          fromSeq: this._stateManager.serverSeq
        };
      }
      try {
        const snapshot = await this._agentService.subscribe(URI.parse(key), client.clientId);
        client.subscriptions.set(classified.uri, classified);
        this._clearClientToolCallDisconnectTimeout(client.clientId, classified.uri);
        return snapshot;
      } catch (err) {
        this._logService.info(`[ProtocolServer] Reconnect: failed to restore subscription ${key}: ${err instanceof Error ? err.message : String(err)}`);
        missing.push(sub);
        return void 0;
      }
    }));
    this._reconcileActiveClientsAfterReconnect(client);
    if (canReplay) {
      const actions = [];
      for (const envelope of this._replayBuffer) {
        if (envelope.serverSeq > params.lastSeenServerSeq) {
          if (this._isRelevantToClient(client, envelope)) {
            actions.push(envelope);
          }
        }
      }
      return { type: "replay", actions, missing };
    }
    return { type: "snapshot", snapshots: snapshots.filter((s) => s !== void 0) };
  }
  /**
   * Release a client from every session where it is still an active client
   * but did not resubscribe during a reconnect. The set of resubscribed
   * sessions is gathered from every live connection the client currently
   * holds (not just the reconnecting one) so an overlapping connection that
   * still subscribes to a session keeps the client active there.
   */
  _reconcileActiveClientsAfterReconnect(client) {
    const record = this._clients.get(client.clientId);
    const resubscribed = /* @__PURE__ */ new Set();
    for (const connection of record?.state === "active" ? record.connections : [client]) {
      for (const sub of connection.subscriptions.values()) {
        if (sub.kind === "state" /* State */) {
          resubscribed.add(sub.uri);
        }
      }
    }
    for (const session of this._stateManager.getSessionUris()) {
      const state = this._stateManager.getSessionState(session);
      if (state && this._isActiveClient(state, client.clientId)) {
        for (const chat of state.chats) {
          if (!resubscribed.has(session) && !resubscribed.has(chat.resource)) {
            this._releaseActiveClientForSession(session, client.clientId, chat.resource);
          }
        }
      }
    }
  }
  _handleClientDisconnected(clientId) {
    const record = this._clients.get(clientId);
    if (record?.state === "grace") {
      record.disconnectTimeouts.set("managed-settings", disposableTimeout(() => {
        record.disconnectTimeouts.deleteAndDispose("managed-settings");
        this._managedSettingsService.removeClientPermissions(this._managedSettingsContributionId(clientId));
      }, CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT));
    }
    for (const session of this._stateManager.getSessionUris()) {
      const state = this._stateManager.getSessionState(session);
      const isActive = state ? this._isActiveClient(state, clientId) : false;
      const ownsPendingToolCall = state ? this._hasPendingClientToolCall(state, clientId) : false;
      if (isActive || ownsPendingToolCall) {
        for (const chat of state?.chats ?? []) {
          this._startClientToolCallDisconnectTimeout(clientId, session, chat.resource);
        }
      }
    }
  }
  /** Whether `clientId` is one of the session's active clients. */
  _isActiveClient(state, clientId) {
    return state.activeClients.some((c) => c.clientId === clientId);
  }
  /**
   * Remove `clientId` from a session's active clients, if present. Dispatched
   * as a server action so the removal is reflected in state and broadcast to
   * the remaining subscribers.
   */
  _removeActiveClient(session, clientId) {
    const state = this._stateManager.getSessionState(session);
    if (state && this._isActiveClient(state, clientId)) {
      this._stateManager.dispatchServerAction(session, {
        type: ActionType.SessionActiveClientRemoved,
        clientId
      });
    }
  }
  /**
   * Release a client from a session: clear its pending disconnect timeout,
   * fail any client tool calls it still owns, and remove it from the active
   * clients. Used by the explicit-unsubscribe and reconnect-reconciliation
   * paths to drop a client that has left a session.
   */
  _releaseActiveClientForSession(session, clientId, chatChannel) {
    this._clearClientToolCallDisconnectTimeout(clientId, chatChannel);
    this._completeDisconnectedClientToolCalls(clientId, session, chatChannel);
    this._removeActiveClient(session, clientId);
  }
  /**
   * Yields every still-pending client-contributed tool call in `state`'s
   * active turn, paired with its owning `clientId`. Single source of truth
   * for the disconnect-grace machinery: detect ownership
   * ({@link _hasPendingClientToolCall}), arm timeouts
   * ({@link _checkOrphanedClientToolCalls}), and fail orphaned calls
   * ({@link _completeDisconnectedClientToolCalls}).
   */
  *_pendingClientToolCalls(state) {
    const activeTurn = state?.activeTurn;
    if (!activeTurn) {
      return;
    }
    for (const part of activeTurn.responseParts) {
      if (part.kind !== ResponsePartKind.ToolCall) {
        continue;
      }
      const toolCall = part.toolCall;
      const contributor = toolCall.contributor;
      if (contributor?.kind === ToolCallContributorKind.Client && isPendingToolCallStatus(toolCall.status)) {
        yield { toolCall, clientId: contributor.clientId };
      }
    }
  }
  _hasPendingClientToolCall(state, clientId) {
    for (const pending of this._pendingClientToolCalls(state)) {
      if (pending.clientId === clientId) {
        return true;
      }
    }
    return false;
  }
  _hasReplacementActiveClientTool(state, clientId, toolName) {
    return state.activeClients.some((client) => client.clientId !== clientId && client.tools.some((tool) => tool.name === toolName));
  }
  /**
   * Arm (or re-arm) the per-(clientId, session) timeout that fails pending
   * client tool calls owned by `clientId` if it does not reconnect before the
   * grace window elapses. Only meaningful for a client with no live transport:
   * a connected client is handled by {@link _attachConnection}, which disposes
   * any armed timers, so this is a no-op when the client is active. The delay
   * is the remaining grace measured from when the client disconnected — so a
   * client that disconnected a while before the call was issued gets the
   * residual window rather than a fresh one, and a stamp from a long-disconnected
   * client fails promptly. Re-arms triggered by later orphaned tool calls in the
   * same session shrink the remaining window instead of resetting it.
   */
  _startClientToolCallDisconnectTimeout(clientId, session, chatChannel) {
    const record = this._ensureGraceRecord(clientId);
    if (!record) {
      return;
    }
    record.disconnectTimeouts.deleteAndDispose(chatChannel);
    const elapsed = Date.now() - record.lastSeenAt;
    const delay = Math.max(0, CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT - elapsed);
    record.disconnectTimeouts.set(chatChannel, disposableTimeout(() => {
      this._releaseActiveClientForSession(session, clientId, chatChannel);
    }, delay));
  }
  /**
   * Scan a chat for pending client tool calls owned by a disconnected client
   * of this protocol server, and arm the disconnect timeout for each owner.
   * Called when a `ChatToolCallStart` / `ChatToolCallReady` envelope is
   * observed — covering calls issued for an already-gone client, which the
   * live disconnect path never sees. Ownerless client tool calls (no client
   * connected at stamp time) are failed immediately by the provider, so they
   * never reach a pending state here. Unknown client ids are ignored because
   * they may belong to another transport such as local IPC.
   */
  _checkOrphanedClientToolCalls(session, chatChannel) {
    const state = this._stateManager.getSessionState(chatChannel);
    const orphanOwners = /* @__PURE__ */ new Set();
    for (const { clientId } of this._pendingClientToolCalls(state)) {
      const ownerRecord = this._clients.get(clientId);
      if (ownerRecord?.state === "grace") {
        orphanOwners.add(clientId);
      }
    }
    for (const ownerId of orphanOwners) {
      this._startClientToolCallDisconnectTimeout(ownerId, session, chatChannel);
    }
  }
  /**
   * Register a freshly connected (or reconnected) transport for `clientId`,
   * promoting the record to {@link IActiveClientRecord}. Promoting a grace
   * record back to active disposes its pending disconnect timers: the
   * disconnect-grace window only applies while the client has no live
   * transport. This is the single place that maintains the "active records
   * hold no grace timers" invariant.
   */
  _attachConnection(clientId, client) {
    const existing = this._clients.get(clientId);
    if (existing?.state === "active") {
      existing.connections.push(client);
      existing.clientInfo = client.clientInfo ?? existing.clientInfo;
    } else {
      this._clients.set(clientId, { state: "active", clientInfo: client.clientInfo ?? existing?.clientInfo, connections: [client] });
    }
    this._pruneClientRecords();
  }
  _rollbackFailedInitialization(client, previousRecord) {
    const record = this._clients.get(client.clientId);
    if (record?.state === "active") {
      const connectionIndex = record.connections.indexOf(client);
      if (connectionIndex !== -1) {
        record.connections.splice(connectionIndex, 1);
        this._releaseClientSubscriptions(client, record);
        this._rejectPendingReverseRequestsForConnection(client);
      }
      if (record.connections.length === 0) {
        if (previousRecord?.state === "grace") {
          this._clients.set(client.clientId, previousRecord);
        } else {
          this._clients.delete(client.clientId);
        }
      }
    }
    client.initializationDisposables.dispose();
  }
  /**
   * Return the existing grace record for `clientId`, creating one for a
   * never-connected client (an orphan tool-call stamp). Returns `undefined`
   * when the client is currently active — the grace machinery does not apply
   * to a connected client. A newly created record pins its grace clock to now.
   */
  _ensureGraceRecord(clientId) {
    const record = this._clients.get(clientId);
    if (record?.state === "active") {
      return void 0;
    }
    if (record) {
      return record;
    }
    const created = {
      state: "grace",
      clientInfo: void 0,
      telemetryContext: void 0,
      protocolVersion: void 0,
      lastSeenAt: Date.now(),
      disconnectTimeouts: new DisposableMap()
    };
    this._clients.set(clientId, created);
    return created;
  }
  _getActiveClient(clientId) {
    return this._getActiveClientFromRecord(this._clients.get(clientId));
  }
  _getActiveClientFromRecord(record) {
    if (record?.state !== "active") {
      return void 0;
    }
    return record.connections[record.connections.length - 1];
  }
  _releaseClientSubscriptions(client, record) {
    for (const sub of client.subscriptions.values()) {
      if (sub.kind === "state" /* State */) {
        if (this._hasSubscriptionInOtherConnection(record, client, sub.uri)) {
          continue;
        }
        this._agentService.unsubscribe(URI.parse(sub.uri), client.clientId);
      } else if (sub.kind === "resource-watch" /* ResourceWatch */) {
        this._agentService.onResourceWatchUnsubscribed(sub.uri);
      }
    }
    client.subscriptions.clear();
  }
  _hasSubscriptionInOtherConnection(record, client, uri) {
    if (record.state !== "active") {
      return false;
    }
    for (const other of record.connections) {
      if (other !== client && other.subscriptions.has(uri)) {
        return true;
      }
    }
    return false;
  }
  /** Number of clients that currently have a live connection. */
  get _connectedClientCount() {
    let count = 0;
    for (const record of this._clients.values()) {
      if (record.state === "active") {
        count++;
      }
    }
    return count;
  }
  _createClientTelemetryContext(clientInfo, meta, transport, fallbackConnectionKind = AgentHostClientConnectionKind.Unknown) {
    const connectionKind = readClientConnectionKind(meta);
    const machineId = readClientMachineId(meta);
    const devDeviceId = readClientDevDeviceId(meta);
    return {
      clientType: getAgentHostClientType(clientInfo),
      connectionKind: connectionKind === AgentHostClientConnectionKind.Unknown ? fallbackConnectionKind : connectionKind,
      transportKind: transport.transportKind ?? AgentHostTransportKind.Unknown,
      hostLaunchKind: this._config.hostLaunchKind ?? AgentHostLaunchKind.Unknown,
      ...machineId ? { machineId } : {},
      ...devDeviceId ? { devDeviceId } : {}
    };
  }
  _reportClientDisconnected(client, subscriptionCount) {
    if (!client.telemetryConnectionActive) {
      return;
    }
    client.telemetryConnectionActive = false;
    const counts = this._connectionTelemetryTracker.disconnect(client.clientId, client.telemetryTransportToken);
    this._telemetryReporter.clientConnection({
      action: "disconnected",
      context: client.telemetryContext,
      clientId: client.clientId,
      clientImplementationName: client.clientInfo?.name,
      clientImplementationVersion: client.clientInfo?.version,
      protocolVersion: client.protocolVersion,
      isReconnect: client.isReconnect,
      ...counts,
      connectionDurationMs: client.connectionStopWatch.elapsed(),
      subscriptionCount
    });
  }
  /**
   * Drop grace records whose timers have all fired and whose last-seen time is
   * stale beyond the retention window (10× the disconnect timeout). This
   * covers both genuinely-disconnected clients and never-connected orphan
   * stamps. Bounds {@link _clients} without tracking liveness precisely — a
   * pruned-then-resurfacing stamp simply falls back to the full grace window.
   * Active records are never pruned; they persist until their last transport
   * closes.
   */
  _pruneClientRecords() {
    const cutoff = Date.now() - AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION;
    for (const [clientId, record] of this._clients) {
      if (record.state === "grace" && record.disconnectTimeouts.size === 0 && record.lastSeenAt < cutoff) {
        this._clients.delete(clientId);
      }
    }
  }
  _clearClientToolCallDisconnectTimeout(clientId, channel) {
    const record = this._clients.get(clientId);
    if (record?.state === "grace") {
      record.disconnectTimeouts.deleteAndDispose(channel);
    }
  }
  _completeDisconnectedClientToolCalls(clientId, session, chatChannel) {
    const state = this._stateManager.getSessionState(chatChannel);
    const activeTurn = state?.activeTurn;
    if (!state || !activeTurn) {
      return;
    }
    for (const { toolCall, clientId: ownerId } of this._pendingClientToolCalls(state)) {
      if (ownerId !== clientId) {
        continue;
      }
      const mayRetryWithReplacementClient = this._hasReplacementActiveClientTool(state, clientId, toolCall.toolName);
      if (toolCall.status === ToolCallStatus.Streaming) {
        this._stateManager.dispatchServerAction(chatChannel, {
          type: ActionType.ChatToolCallReady,
          turnId: activeTurn.id,
          toolCallId: toolCall.toolCallId,
          invocationMessage: toolCall.invocationMessage ?? toolCall.displayName,
          confirmed: ToolCallConfirmationReason.NotNeeded
        });
      }
      this._stateManager.dispatchServerAction(chatChannel, {
        type: ActionType.ChatToolCallComplete,
        turnId: activeTurn.id,
        toolCallId: toolCall.toolCallId,
        result: {
          success: false,
          pastTenseMessage: `${toolCall.displayName} failed`,
          ...mayRetryWithReplacementClient ? { content: [{ type: ToolResultContentType.Text, text: `The client that was running ${toolCall.displayName} disconnected, but another active client now provides ${toolCall.displayName}. You may try calling the tool again.` }] } : {},
          error: { message: `Client ${clientId} disconnected before completing ${toolCall.displayName}` }
        }
      });
    }
  }
  /**
   * Sends a JSON-RPC request to a connected client and waits for the response.
   * Used for reverse-RPC operations like reading client-side files.
   * Rejects if the client disconnects or the server is disposed.
   */
  _sendReverseRequest(clientId, method, params) {
    const client = this._getActiveClient(clientId);
    if (!client) {
      return Promise.reject(new Error(`Client ${clientId} is not connected`));
    }
    const id = ++this._reverseRequestId;
    return new Promise((resolve, reject) => {
      this._pendingReverseRequests.set(id, { client, resolve, reject });
      const request = { jsonrpc: "2.0", id, method, params };
      client.transport.send(request);
    });
  }
  /**
   * Rejects and clears all pending reverse-RPC requests sent over a given
   * connection.
   */
  _rejectPendingReverseRequestsForConnection(client) {
    for (const [id, pending] of this._pendingReverseRequests) {
      if (pending.client === client) {
        this._pendingReverseRequests.delete(id);
        pending.reject(new Error(`Client ${client.clientId} disconnected`));
      }
    }
  }
  _handleRequest(client, method, params, id) {
    const handler = this._requestHandlers.hasOwnProperty(method) ? this._requestHandlers[method] : void 0;
    if (handler) {
      this._trackRequest(handler(client, params)).then((result) => {
        this._logService.trace(`[ProtocolServer] Request '${method}' id=${id} succeeded`);
        client.transport.send(jsonRpcSuccess(id, result ?? null));
      }).catch((err) => {
        if (shouldLogFailedRequest(method, params, err)) {
          this._logService.error(`[ProtocolServer] Request '${method}' failed`, err);
        }
        client.transport.send(jsonRpcErrorFrom(id, err));
      });
      return;
    }
    const extensionResult = this._handleExtensionRequest(method, params);
    if (extensionResult) {
      this._trackRequest(extensionResult).then((result) => {
        client.transport.send(jsonRpcSuccess(id, result ?? null));
      }).catch((err) => {
        this._logService.error(`[ProtocolServer] Extension request '${method}' failed`, err);
        client.transport.send(jsonRpcErrorFrom(id, err));
      });
      return;
    }
    const mcpChannel = readMcpChannel(params);
    if (mcpChannel !== void 0) {
      const paramsObj = isParamsObject(params) ? params : void 0;
      this._trackRequest(this._agentService.handleMcpRequest(mcpChannel, method, paramsObj)).then((result) => {
        client.transport.send(jsonRpcSuccess(id, result ?? null));
      }).catch((err) => {
        if (err instanceof Error && err.message.startsWith("Method not found")) {
          client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.MethodNotFound, err.message));
          return;
        }
        this._logService.error(`[ProtocolServer] mcp:// request '${method}' on ${mcpChannel} failed`, err);
        client.transport.send(jsonRpcErrorFrom(id, err));
      });
      return;
    }
    client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.MethodNotFound, `Method not found: ${method}`));
  }
  async whenIdle() {
    while (this._inflightRequests.size > 0) {
      await Promise.all([...this._inflightRequests].map((promise) => promise.then(() => {
      }, () => {
      })));
    }
  }
  _trackRequest(promise) {
    this._inflightRequests.add(promise);
    const remove = () => this._inflightRequests.delete(promise);
    void promise.then(remove, remove);
    return promise;
  }
  /**
   * Handle VS Code extension methods that are not yet part of the typed
   * protocol. Returns a Promise if the method was recognized, undefined
   * otherwise.
   */
  _handleExtensionRequest(method, params) {
    if (this._config.allowExtensionMethods === false) {
      return void 0;
    }
    switch (method) {
      case "shutdown":
        return this._agentService.shutdown();
      case "getNetworkDiagnosticsInfo":
        return this._agentService.getNetworkDiagnosticsInfo();
      case "getManagedSettingsDiagnostics":
        return this._agentService.getManagedSettingsDiagnostics();
      case "diagnosticsFetch":
        return this._agentService.diagnosticsFetch(params.url);
      default:
        return void 0;
    }
  }
  // ---- Broadcasting -------------------------------------------------------
  _broadcastAction(envelope) {
    this._logService.trace(`[ProtocolServer] Broadcasting action: ${envelope.action.type}`);
    const msg = { jsonrpc: "2.0", method: "action", params: envelope };
    for (const record of this._clients.values()) {
      const client = this._getActiveClientFromRecord(record);
      if (client && this._isRelevantToClient(client, envelope)) {
        client.transport.send(msg);
      }
    }
  }
  _broadcastNotification(notification) {
    const { type, ...params } = notification;
    const msg = { jsonrpc: "2.0", method: type, params };
    for (const record of this._clients.values()) {
      this._getActiveClientFromRecord(record)?.transport.send(msg);
    }
  }
  /**
   * Forward an MCP server-originated notification (e.g.
   * `notifications/tools/list_changed`) over the AHP transport. The
   * `channel` field on `params` is the AHP routing envelope; the
   * receiving client demultiplexes by it. Notifications are broadcast
   * to every connected client — per-channel subscription filtering is
   * left to the client, since MCP notifications are cheap and the
   * client already knows which channels it cares about.
   */
  _broadcastMcpNotification(notification) {
    const params = { ...notification.params ?? {}, channel: notification.channel };
    const msg = { jsonrpc: "2.0", method: notification.method, params };
    for (const record of this._clients.values()) {
      this._getActiveClientFromRecord(record)?.transport.send(msg);
    }
  }
  /**
   * Drop a subscription identified by `channel` from `client`. Handles
   * canonicalisation for OTLP URIs (so an `unsubscribe` with a URI
   * variant collapses to the same entry as the original `subscribe`)
   * and tears down the agent-service refcount for state channels.
   */
  _removeSubscription(client, channel) {
    const classified = classifyChannel(channel);
    if (!classified) {
      return;
    }
    const sub = client.subscriptions.get(classified.uri);
    if (!sub) {
      return;
    }
    client.subscriptions.delete(classified.uri);
    if (sub.kind === "state" /* State */) {
      const record = this._clients.get(client.clientId);
      if (record && this._hasSubscriptionInOtherConnection(record, client, sub.uri)) {
        return;
      }
      this._agentService.unsubscribe(URI.parse(sub.uri), client.clientId);
      if (isAhpChatChannel(sub.uri)) {
        this._releaseActiveClientForSession(parseRequiredSessionUriFromChatUri(sub.uri), client.clientId, sub.uri);
      } else {
        const state = this._stateManager.getSessionState(sub.uri);
        for (const chat of state?.chats ?? []) {
          this._releaseActiveClientForSession(sub.uri, client.clientId, chat.resource);
        }
      }
    } else if (sub.kind === "resource-watch" /* ResourceWatch */) {
      this._agentService.onResourceWatchUnsubscribed(sub.uri);
    }
  }
  /**
   * Fan out an OTLP log record to every connected client that has
   * subscribed to a logs channel whose `{level}` band includes the
   * record's `severityNumber`. The notification's `channel` field is
   * the canonical URI the client subscribed against — clients can
   * route by URI without re-deriving the level.
   */
  _broadcastOtlpLog(record) {
    const payload = toResourceLogsPayload(record);
    for (const clientRecord of this._clients.values()) {
      const client = this._getActiveClientFromRecord(clientRecord);
      if (!client) {
        continue;
      }
      for (const sub of client.subscriptions.values()) {
        if (sub.kind !== "otlp-logs" /* OtlpLogs */) {
          continue;
        }
        if (record.severityNumber < levelToSeverityNumber(sub.level)) {
          continue;
        }
        const msg = {
          jsonrpc: "2.0",
          method: "otlp/exportLogs",
          params: { channel: sub.uri, payload }
        };
        client.transport.send(msg);
      }
    }
  }
  _isRelevantToClient(client, envelope) {
    const sub = client.subscriptions.get(envelope.channel);
    if (sub?.kind === "state" /* State */ || sub?.kind === "resource-watch" /* ResourceWatch */) {
      return true;
    }
    if (!isAhpRootChannel(envelope.channel)) {
      return false;
    }
    return isActionEnvelopeRelevantToSubscriptionUris(envelope, this._stateAndResourceWatchUris(client));
  }
  *_stateAndResourceWatchUris(client) {
    for (const sub of client.subscriptions.values()) {
      if (sub.kind === "state" /* State */ || sub.kind === "resource-watch" /* ResourceWatch */) {
        yield sub.uri;
      }
    }
  }
  _managedSettingsContributionId(clientId) {
    return `${this._managedSettingsOwnerId}:${clientId}`;
  }
  dispose() {
    for (const [clientId, record] of this._clients) {
      this._managedSettingsService.removeClientPermissions(this._managedSettingsContributionId(clientId));
      if (record.state === "active") {
        for (const connection of [...record.connections]) {
          const subscriptionCount = connection.subscriptions.size;
          const connectionIndex = record.connections.indexOf(connection);
          if (connectionIndex !== -1) {
            record.connections.splice(connectionIndex, 1);
          }
          this._releaseClientSubscriptions(connection, record);
          this._rejectPendingReverseRequestsForConnection(connection);
          this._reportClientDisconnected(connection, subscriptionCount);
          connection.disposables.dispose();
        }
      } else {
        record.disconnectTimeouts.dispose();
      }
    }
    this._clients.clear();
    for (const [, pending] of this._pendingReverseRequests) {
      pending.reject(new Error("ProtocolServerHandler disposed"));
    }
    this._pendingReverseRequests.clear();
    this._replayBuffer.length = 0;
    super.dispose();
  }
};
ProtocolServerHandler = __decorateClass([
  __decorateParam(5, ILogService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IAgentHostManagedSettingsService)
], ProtocolServerHandler);
export {
  ProtocolServerHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxwcm90b2NvbFNlcnZlckhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc0pzb25ScGNSZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25ScGNQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBSFBGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGdldEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZCwgQWdlbnRIb3N0TGF1bmNoS2luZCwgQWdlbnRIb3N0VHJhbnNwb3J0S2luZCwgcmVhZENsaWVudENvbm5lY3Rpb25LaW5kLCByZWFkQ2xpZW50RGV2RGV2aWNlSWQsIHJlYWRDbGllbnRNYWNoaW5lSWQsIHR5cGUgSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgdHlwZSBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucywgdHlwZSBJTWNwTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IGlzTWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzLmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBY3Rpb25FbnZlbG9wZVJlbGV2YW50VG9TdWJzY3JpcHRpb25VcmlzIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IENoYXRTb3VyY2VLaW5kIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLWNoYXQvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBDb21tYW5kTWFwIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL21lc3NhZ2VzLmpzJztcbmltcG9ydCB7IEFjdGlvbkVudmVsb3BlLCBBY3Rpb25UeXBlLCBJTm90aWZpY2F0aW9uLCBpc0Fubm90YXRpb25zQWN0aW9uLCBpc0NoYW5nZXNldEFjdGlvbiwgaXNDaGF0QWN0aW9uLCBpc1Nlc3Npb25BY3Rpb24sIGlzVGVybWluYWxBY3Rpb24sIHR5cGUgQ2hhdEFjdGlvbiwgdHlwZSBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiwgdHlwZSBDbGllbnRDaGFuZ2VzZXRBY3Rpb24sIHR5cGUgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24sIHR5cGUgVGVybWluYWxBY3Rpb24gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IG5lZ290aWF0ZVByb3RvY29sVmVyc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL25lZ290aWF0aW9uLmpzJztcbmltcG9ydCB7IFZTQ09ERV9VUEdSQURFX01FVEhPRCwgdHlwZSBVbnN1cHBvcnRlZFByb3RvY29sVmVyc2lvbkVycm9yRGF0YUV4IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sVXBncmFkZS5qcyc7XG5pbXBvcnQgeyBnZXRBZ2VudEhvc3RNYW5hZ2VtZW50U29ja2V0UGF0aCwgcmVxdWVzdEFnZW50SG9zdFVwZ3JhZGUgfSBmcm9tICcuL2FnZW50SG9zdFVwZ3JhZGVDaGFubmVsLmpzJztcbmltcG9ydCB7XG5cdEFIUF9BVVRIX1JFUVVJUkVELFxuXHRBaHBFcnJvckNvZGVzLFxuXHRBSFBfUFJPVklERVJfTk9UX0ZPVU5ELFxuXHRBSFBfU0VTU0lPTl9OT1RfRk9VTkQsXG5cdEFIUF9VTlNVUFBPUlRFRF9QUk9UT0NPTF9WRVJTSU9OLFxuXHRKc29uUnBjUmVxdWVzdCxcblx0aXNKc29uUnBjTm90aWZpY2F0aW9uLFxuXHRpc0pzb25ScGNSZXF1ZXN0LFxuXHRKU09OX1JQQ19JTlRFUk5BTF9FUlJPUixcblx0SnNvblJwY0Vycm9yQ29kZXMsXG5cdFByb3RvY29sRXJyb3IsXG5cdHR5cGUgQWhwU2VydmVyTm90aWZpY2F0aW9uLFxuXHR0eXBlIEluaXRpYWxpemVQYXJhbXMsXG5cdHR5cGUgSnNvblJwY1Jlc3BvbnNlLFxuXHR0eXBlIFJlY29ubmVjdFBhcmFtcyxcblx0dHlwZSBJU3RhdGVTbmFwc2hvdCxcblx0dHlwZSBTdWJzY3JpYmVSZXN1bHQsXG5cdHR5cGUgTGlzdFNlc3Npb25zUmVzdWx0LFxufSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IGlzQWhwUmVzb3VyY2VXYXRjaENoYW5uZWwsIGlzQWhwUm9vdENoYW5uZWwsIFJlc3BvbnNlUGFydEtpbmQsIFNlc3Npb25TdGF0dXMsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgaXNBaHBDaGF0Q2hhbm5lbCwgcGFyc2VDaGF0VXJpLCBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpLCB0eXBlIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCB0eXBlIFNlc3Npb25TdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvdG9jb2xTZXJ2ZXIsIElQcm90b2NvbFRyYW5zcG9ydCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4vYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkT3RscExvZ3NDaGFubmVsVXJpLFxuXHRleHRyYWN0TGV2ZWxGcm9tT3RscExvZ3NVcmksXG5cdGxldmVsVG9TZXZlcml0eU51bWJlcixcblx0T1RMUF9DSEFOTkVMX1NDSEVNRSxcblx0T1RMUF9MT0dTX0NIQU5ORUxfVEVNUExBVEUsXG5cdE90bHBMb2dFbWl0dGVyLFxuXHR0b1Jlc291cmNlTG9nc1BheWxvYWQsXG5cdHR5cGUgSU90bHBMb2dSZWNvcmQsXG5cdHR5cGUgT3RscExvZ0xldmVsTmFtZSxcbn0gZnJvbSAnLi4vY29tbW9uL290bHAvb3RscExvZ0VtaXR0ZXIuanMnO1xuaW1wb3J0IHsgaXNGaWxlUmVzb3VyY2VSZWFkIH0gZnJvbSAnLi4vY29tbW9uL3Jlc291cmNlUmVhZExvZ2dpbmcuanMnO1xuaW1wb3J0IHR5cGUgeyBJbXBsZW1lbnRhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9DTElFTlRfQ09OTkVDVElPTl9ISVNUT1JZX1JFVEVOVElPTiwgQWdlbnRIb3N0Q2xpZW50Q29ubmVjdGlvblRlbGVtZXRyeVRyYWNrZXIgfSBmcm9tICcuL2FnZW50SG9zdENsaWVudENvbm5lY3Rpb25UZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIgfSBmcm9tICcuL2FnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyLmpzJztcblxuLyoqIERlZmF1bHQgY2FwYWNpdHkgb2YgdGhlIHNlcnZlci1zaWRlIGFjdGlvbiByZXBsYXkgYnVmZmVyLiAqL1xuY29uc3QgUkVQTEFZX0JVRkZFUl9DQVBBQ0lUWSA9IDEwMDA7XG5cbmNvbnN0IENMSUVOVF9UT09MX0NBTExfRElTQ09OTkVDVF9USU1FT1VUID0gMzBfMDAwO1xuXG4vKipcbiAqIENoYXQtbGV2ZWwgd29ya2luZy1kaXJlY3Rvcnkgc3Vic2V0cyBhcmUgbm90IHlldCBvcGVyYXRpb25hbCBpbiB0aGlzIGJ1aWxkLlxuICovXG5jb25zdCBVTlNVUFBPUlRFRF9DTElFTlRfQUNUSU9OX1RZUEVTOiBSZWFkb25seVNldDxBY3Rpb25UeXBlPiA9IG5ldyBTZXQoW1xuXHRBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5U2V0LFxuXHRBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCxcbl0pO1xuXG4vKiogQSBjbGllbnQgdG9vbCBjYWxsIGluIGFueSBvZiB0aGVzZSBzdGF0dXNlcyBpcyBzdGlsbCBhd2FpdGluZyBpdHMgcmVzdWx0LiAqL1xuZnVuY3Rpb24gaXNQZW5kaW5nVG9vbENhbGxTdGF0dXMoc3RhdHVzOiBUb29sQ2FsbFN0YXR1cyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmdcblx0XHR8fCBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmdcblx0XHR8fCBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb247XG59XG5cbi8qKiBCdWlsZCBhIEpTT04tUlBDIHN1Y2Nlc3MgcmVzcG9uc2Ugc3VpdGFibGUgZm9yIHRyYW5zcG9ydC5zZW5kKCkuICovXG5mdW5jdGlvbiBqc29uUnBjU3VjY2VzcyhpZDogbnVtYmVyLCByZXN1bHQ6IHVua25vd24pOiBKc29uUnBjUmVzcG9uc2Uge1xuXHRyZXR1cm4geyBqc29ucnBjOiAnMi4wJywgaWQsIHJlc3VsdCB9O1xufVxuXG4vKiogQnVpbGQgYSBKU09OLVJQQyBlcnJvciByZXNwb25zZSBzdWl0YWJsZSBmb3IgdHJhbnNwb3J0LnNlbmQoKS4gKi9cbmZ1bmN0aW9uIGpzb25ScGNFcnJvcihpZDogbnVtYmVyLCBjb2RlOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZywgZGF0YT86IHVua25vd24pOiBKc29uUnBjUmVzcG9uc2Uge1xuXHRyZXR1cm4geyBqc29ucnBjOiAnMi4wJywgaWQsIGVycm9yOiB7IGNvZGUsIG1lc3NhZ2UsIC4uLihkYXRhICE9PSB1bmRlZmluZWQgPyB7IGRhdGEgfSA6IHt9KSB9IH07XG59XG5cbi8qKiBCdWlsZCBhIEpTT04tUlBDIGVycm9yIHJlc3BvbnNlIGZyb20gYW4gdW5rbm93biB0aHJvd24gdmFsdWUsIHByZXNlcnZpbmcge0BsaW5rIFByb3RvY29sRXJyb3J9IGZpZWxkcy4gKi9cbmZ1bmN0aW9uIGpzb25ScGNFcnJvckZyb20oaWQ6IG51bWJlciwgZXJyOiB1bmtub3duKTogSnNvblJwY1Jlc3BvbnNlIHtcblx0aWYgKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpIHtcblx0XHRyZXR1cm4ganNvblJwY0Vycm9yKGlkLCBlcnIuY29kZSwgZXJyLm1lc3NhZ2UsIGVyci5kYXRhKTtcblx0fVxuXHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyAoZXJyLnN0YWNrID8/IGVyci5tZXNzYWdlKSA6IFN0cmluZyhlcnIpO1xuXHRyZXR1cm4ganNvblJwY0Vycm9yKGlkLCBKU09OX1JQQ19JTlRFUk5BTF9FUlJPUiwgbWVzc2FnZSk7XG59XG5cbmZ1bmN0aW9uIHNob3VsZExvZ0ZhaWxlZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93biwgZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdGlmICghKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpIHx8IGVyci5jb2RlICE9PSBBaHBFcnJvckNvZGVzLk5vdEZvdW5kIHx8ICFpc0ZpbGVSZXNvdXJjZVJlYWQobWV0aG9kLCBwYXJhbXMpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGB2YWx1ZWAgaXMgYSBub24tbnVsbCBwYXJhbXMgb2JqZWN0IChhcyBvcHBvc2VkIHRvIGFuIGFycmF5IG9yIHByaW1pdGl2ZSkuICovXG5mdW5jdGlvbiBpc1BhcmFtc09iamVjdCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGBjaGFubmVsYCBVUkkgY2FycmllZCBvbiBhIHJlcXVlc3QncyBwYXJhbXMgd2hlbiBpdCBpcyBhblxuICogYG1jcDovL2AgY2hhbm5lbCBcdTIwMTQgdGhlIEFIUCByb3V0aW5nIGVudmVsb3BlIGZvciByYXcgTUNQIHJlcXVlc3RzXG4gKiB0dW5uZWxsZWQgb3ZlciB0aGUgSlNPTi1SUEMgY29ubmVjdGlvbi4gUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgYW55XG4gKiBvdGhlciBwYXJhbXMgc2hhcGUuXG4gKi9cbmZ1bmN0aW9uIHJlYWRNY3BDaGFubmVsKHBhcmFtczogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghaXNQYXJhbXNPYmplY3QocGFyYW1zKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY2hhbm5lbCA9IHBhcmFtc1snY2hhbm5lbCddO1xuXHRpZiAodHlwZW9mIGNoYW5uZWwgIT09ICdzdHJpbmcnIHx8ICFjaGFubmVsLnN0YXJ0c1dpdGgoJ21jcDovLycpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gY2hhbm5lbDtcbn1cblxuLyoqXG4gKiBNZXRob2RzIGhhbmRsZWQgYnkgdGhlIHJlcXVlc3QgZGlzcGF0Y2hlci4gRXhjbHVkZXMgYGluaXRpYWxpemVgLFxuICogYHJlY29ubmVjdGAsIGFuZCBgcGluZ2AsIHdoaWNoIGFyZSBoYW5kbGVkIGRpcmVjdGx5IGR1cmluZyBtZXNzYWdlXG4gKiBkaXNwYXRjaCB3aXRob3V0IHJlcXVpcmluZyBhbiBlc3RhYmxpc2hlZCBjbGllbnQgY29udGV4dC5cbiAqL1xudHlwZSBSZXF1ZXN0TWV0aG9kID0gRXhjbHVkZTxrZXlvZiBDb21tYW5kTWFwLCAnaW5pdGlhbGl6ZScgfCAncmVjb25uZWN0JyB8ICdwaW5nJz47XG5cbi8qKlxuICogVHlwZWQgaGFuZGxlciBtYXA6IGVhY2gga2V5IGlzIGEgcmVxdWVzdCBtZXRob2QsIGVhY2ggdmFsdWUgaXMgYSBoYW5kbGVyXG4gKiB0aGF0IHJlY2VpdmVzIHRoZSBjb3JyZWN0bHktdHlwZWQgcGFyYW1zIGFuZCBtdXN0IHJldHVybiB0aGUgY29ycmVjdGx5LXR5cGVkXG4gKiByZXN1bHQuIFRoZSBjb21waWxlciB3aWxsIGVycm9yIGlmIGEgaGFuZGxlciByZXR1cm5zIHRoZSB3cm9uZyBzaGFwZS5cbiAqL1xudHlwZSBSZXF1ZXN0SGFuZGxlck1hcCA9IHtcblx0W00gaW4gUmVxdWVzdE1ldGhvZF06IChjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQsIHBhcmFtczogQ29tbWFuZE1hcFtNXVsncGFyYW1zJ10pID0+IFByb21pc2U8Q29tbWFuZE1hcFtNXVsncmVzdWx0J10+O1xufTtcblxuLyoqXG4gKiBEaXNjcmltaW5hbnQgZm9yIHtAbGluayBDaGFubmVsU3Vic2NyaXB0aW9ufS4gRGlzdGluZ3Vpc2hlcyBhIHJlZ3VsYXJcbiAqIHN0YXRlLWJlYXJpbmcgY2hhbm5lbCAocm9vdCwgc2Vzc2lvbiwgdGVybWluYWwsIGNoYW5nZXNldCkgZnJvbSB0aGVcbiAqIHN0YXRlbGVzcyBPVExQIHNpZ25hbCBjaGFubmVscyBzbyBlYWNoIHN1YnNjcmliZS91bnN1YnNjcmliZSBwYXRoIGNhblxuICogZGlzcGF0Y2ggdGhyb3VnaCBhIHNpbmdsZSB0eXBlZCBsb29rdXAuXG4gKi9cbmNvbnN0IGVudW0gQ2hhbm5lbEtpbmQge1xuXHQvKipcblx0ICogU3Vic2NyaWJlZCB2aWEge0BsaW5rIElBZ2VudFNlcnZpY2Uuc3Vic2NyaWJlfSBhbmQgdHJhY2tlZCBieSB0aGVcblx0ICogc2VydmVyLXNpZGUgcmVmY291bnQuIENhcnJpZXMgcmVwbGF5YWJsZSBzdGF0ZSwgcGFydGljaXBhdGVzIGluXG5cdCAqIGFjdGlvbiBicm9hZGNhc3RzICh7QGxpbmsgX2Jyb2FkY2FzdEFjdGlvbn0pIGFuZCByZWNvbm5lY3Rcblx0ICogc25hcHNob3QvcmVwbGF5LlxuXHQgKi9cblx0U3RhdGUgPSAnc3RhdGUnLFxuXHQvKipcblx0ICogUmVzb3VyY2Utd2F0Y2ggY2hhbm5lbHMgKGBhaHAtcmVzb3VyY2Utd2F0Y2g6LzxpZD5gKS4gVHJhY2tlZFxuXHQgKiBzZXBhcmF0ZWx5IHNvIHN1YnNjcmliZS91bnN1YnNjcmliZSByb3V0ZXMgdGhyb3VnaCB0aGUgYWdlbnRcblx0ICogc2VydmljZSdzIHBlci13YXRjaCByZWZjb3VudCArIGdyYWNlIHRpbWVyIHJhdGhlciB0aGFuIHRoZVxuXHQgKiBzZXNzaW9uLXNoYXBlZCB7QGxpbmsgSUFnZW50U2VydmljZS5zdWJzY3JpYmV9IHBhdGguXG5cdCAqL1xuXHRSZXNvdXJjZVdhdGNoID0gJ3Jlc291cmNlLXdhdGNoJyxcblx0LyoqXG5cdCAqIFN1YnNjcmliZWQgYWdhaW5zdCB0aGUgT1RMUCBsb2dzIGNoYW5uZWwgdGVtcGxhdGUgYWR2ZXJ0aXNlZCBpblxuXHQgKiB7QGxpbmsgSW5pdGlhbGl6ZVJlc3VsdC50ZWxlbWV0cnl9LiBTdGF0ZWxlc3MgXHUyMDE0IG5vIHNuYXBzaG90LCBub1xuXHQgKiBhZ2VudC1zZXJ2aWNlIHJlZmNvdW50LiBUaGUgYGxldmVsYCBmaWVsZCByZWNvcmRzIHRoZSBtaW5pbXVtXG5cdCAqIHNldmVyaXR5IHRoZSBjbGllbnQgYXNrZWQgdG8gcmVjZWl2ZS5cblx0ICovXG5cdE90bHBMb2dzID0gJ290bHAtbG9ncycsXG59XG5cbi8qKlxuICogUGVyLWNoYW5uZWwgc2VydmVyLXNpZGUgc3Vic2NyaXB0aW9uIHJlY29yZC4gU3RvcmVkIG9uIGV2ZXJ5XG4gKiB7QGxpbmsgSUNvbm5lY3RlZENsaWVudH0gc28gZWFjaCBzdWJzY3JpYmVkIGNoYW5uZWwgY2FuIGJlIHJvdXRlZCBieVxuICogaXRzIGBraW5kYCB3aXRob3V0IHJlLWRlcml2aW5nIGl0IGZyb20gdGhlIFVSSSBvbiBldmVyeSBkaXNwYXRjaC5cbiAqXG4gKiBgdXJpYCBpcyB0aGUgY2Fub25pY2FsIGNoYW5uZWwgVVJJIHN0cmluZyB1c2VkIGV2ZXJ5d2hlcmUgYSBzdWJzY3JpcHRpb25cbiAqIGlzIHJlZmVyZW5jZWQgXHUyMDE0IHRoZSBzYW1lIHN0cmluZyBpcyBicm9hZGNhc3Qgb24gb3V0Ym91bmQgbm90aWZpY2F0aW9uc1xuICogYW5kIHBlcnNpc3RzIGFjcm9zcyByZWNvbm5lY3RzLlxuICovXG50eXBlIENoYW5uZWxTdWJzY3JpcHRpb24gPVxuXHR8IHsgcmVhZG9ubHkga2luZDogQ2hhbm5lbEtpbmQuU3RhdGU7IHJlYWRvbmx5IHVyaTogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IENoYW5uZWxLaW5kLlJlc291cmNlV2F0Y2g7IHJlYWRvbmx5IHVyaTogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IENoYW5uZWxLaW5kLk90bHBMb2dzOyByZWFkb25seSB1cmk6IHN0cmluZzsgcmVhZG9ubHkgbGV2ZWw6IE90bHBMb2dMZXZlbE5hbWUgfTtcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgY29ubmVjdGVkIHByb3RvY29sIGNsaWVudCB3aXRoIGl0cyBzdWJzY3JpcHRpb24gc3RhdGUuXG4gKi9cbmludGVyZmFjZSBJQ29ubmVjdGVkQ2xpZW50IHtcblx0cmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY2xpZW50SW5mbzogSW1wbGVtZW50YXRpb24gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHRlbGVtZXRyeUNvbnRleHQ6IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0O1xuXHRyZWFkb25seSBwcm90b2NvbFZlcnNpb246IHN0cmluZztcblx0cmVhZG9ubHkgdHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQ7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25TdG9wV2F0Y2g6IFN0b3BXYXRjaDtcblx0cmVhZG9ubHkgdGVsZW1ldHJ5VHJhbnNwb3J0VG9rZW46IG9iamVjdDtcblx0cmVhZG9ubHkgaXNSZWNvbm5lY3Q6IGJvb2xlYW47XG5cdHRlbGVtZXRyeUNvbm5lY3Rpb25BY3RpdmU6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFdmVyeSBjaGFubmVsIHRoZSBjbGllbnQgaXMgY3VycmVudGx5IHN1YnNjcmliZWQgdG8sIGtleWVkIGJ5IHRoZVxuXHQgKiBjYW5vbmljYWwgY2hhbm5lbCBVUkkuIE9UTFAgY2hhbm5lbCBVUklzIGFyZSBjYW5vbmljYWxpc2VkIHRvXG5cdCAqIGBidWlsZE90bHBMb2dzQ2hhbm5lbFVyaShsZXZlbClgIHNvIFVSSSB2YXJpYW50cyB0aGF0IHJlc29sdmUgdG9cblx0ICogdGhlIHNhbWUgbG9naWNhbCBjaGFubmVsIGNvbGxhcHNlIHRvIG9uZSBlbnRyeS5cblx0ICovXG5cdHJlYWRvbmx5IHN1YnNjcmlwdGlvbnM6IE1hcDxzdHJpbmcsIENoYW5uZWxTdWJzY3JpcHRpb24+O1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBpbml0aWFsaXphdGlvbkRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbi8qKlxuICogUGVyLWNsaWVudCBzZXJ2ZXItc2lkZSByZWNvcmQsIGtleWVkIGJ5IGNsaWVudElkIGluXG4gKiB7QGxpbmsgUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyLl9jbGllbnRzfS4gVW5saWtlIHtAbGluayBJQ29ubmVjdGVkQ2xpZW50fSxcbiAqIHRoZSByZWNvcmQgT1VUTElWRVMgaW5kaXZpZHVhbCB0cmFuc3BvcnRzOiBtdWx0aXBsZSBvdmVybGFwcGluZyB0cmFuc3BvcnRzXG4gKiBmb3IgdGhlIHNhbWUgbG9naWNhbCBjbGllbnQgYXJlIGhlbGQgb2xkZXN0LWZpcnN0LCB3aXRoIHRoZSBhY3RpdmUgdHJhbnNwb3J0XG4gKiBhdCB0aGUgZW5kLiBXaGVuIHRoZSBsYXN0IHRyYW5zcG9ydCBkaXNjb25uZWN0cywgdGhlIHJlY29yZCBpcyByZXRhaW5lZFxuICogKHVudGlsIHBydW5lZCkgc28gdGhlIHRvb2wtY2FsbCBkaXNjb25uZWN0LWdyYWNlIG1hY2hpbmVyeSBjYW4gY29tcHV0ZSB0aGVcbiAqIHJlbWFpbmluZyB3aW5kb3cgYW5kIGhvbGQgYW55IGFybWVkIHRpbWVvdXRzLlxuICpcbiAqIEEgY2xpZW50IGlzIGluIGV4YWN0bHkgb25lIG9mIHR3byBzdGF0ZXMsIHdoaWNoIG1ha2VzIHRoZSBjb3JlIGludmFyaWFudFxuICogdW5yZXByZXNlbnRhYmxlIGluIHRoZSB3cm9uZyBzaGFwZTogYSBjbGllbnQgZWl0aGVyIGhhcyBvbmUgb3IgbW9yZSBsaXZlXG4gKiB0cmFuc3BvcnRzICh7QGxpbmsgSUFjdGl2ZUNsaWVudFJlY29yZH0sIG5ldmVyIGFueSBkaXNjb25uZWN0LWdyYWNlIHRpbWVycylcbiAqIG9yIGhhcyBubyB0cmFuc3BvcnQgYW5kIGlzIHdpdGhpbiBpdHMgZGlzY29ubmVjdC1ncmFjZSB3aW5kb3dcbiAqICh7QGxpbmsgSUdyYWNlQ2xpZW50UmVjb3JkfSwgbmV2ZXIgYW55IGNvbm5lY3Rpb25zKS4gVHJhbnNpdGlvbnMgaGFwcGVuIG9ubHlcbiAqIGluIHtAbGluayBQcm90b2NvbFNlcnZlckhhbmRsZXIuX2F0dGFjaENvbm5lY3Rpb259IChcdTIxOTIgYWN0aXZlLCB3aGljaCBkaXNwb3Nlc1xuICogYW55IGdyYWNlIHRpbWVycykgYW5kIHRoZSB0cmFuc3BvcnQgYG9uQ2xvc2VgIGhhbmRsZXIgKFx1MjE5MiBncmFjZSwgb25jZSB0aGUgbGFzdFxuICogdHJhbnNwb3J0IGlzIGdvbmUpLlxuICovXG50eXBlIElDbGllbnRSZWNvcmQgPSBJQWN0aXZlQ2xpZW50UmVjb3JkIHwgSUdyYWNlQ2xpZW50UmVjb3JkO1xuXG5pbnRlcmZhY2UgSUFjdGl2ZUNsaWVudFJlY29yZCB7XG5cdHJlYWRvbmx5IHN0YXRlOiAnYWN0aXZlJztcblx0Y2xpZW50SW5mbzogSW1wbGVtZW50YXRpb24gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBMaXZlIHRyYW5zcG9ydHMgZm9yIHRoaXMgY2xpZW50LCBvbGRlc3QgZmlyc3QuIFRoZSBhY3RpdmUgY29ubmVjdGlvbiBpc1xuXHQgKiB0aGUgbGFzdCBlbnRyeSAobW9zdCByZWNlbnQgd2lucykuIE9sZGVyIGVudHJpZXMgYXJlIGtlcHQgc28gdGhhdCBpZiBhXG5cdCAqIHJlY29ubmVjdGluZyBjbGllbnQgcmVnaXN0ZXJzIGBBYCwgdGhlbiBgQmAsIHRoZW4gYEJgIGNsb3NlcyBmaXJzdCwgd2UgY2FuXG5cdCAqIGZhbGwgYmFjayB0byBgQWAgaW5zdGVhZCBvZiB0cmVhdGluZyB0aGUgY2xpZW50IGFzIGRpc2Nvbm5lY3RlZC4gTmV2ZXJcblx0ICogZW1wdHk6IHJlbW92aW5nIHRoZSBsYXN0IHRyYW5zcG9ydCBwcm9tb3RlcyB0aGUgcmVjb3JkIHRvIGEgZ3JhY2UgcmVjb3JkLlxuXHQgKi9cblx0cmVhZG9ubHkgY29ubmVjdGlvbnM6IElDb25uZWN0ZWRDbGllbnRbXTtcbn1cblxuaW50ZXJmYWNlIElHcmFjZUNsaWVudFJlY29yZCB7XG5cdHJlYWRvbmx5IHN0YXRlOiAnZ3JhY2UnO1xuXHRyZWFkb25seSBjbGllbnRJbmZvOiBJbXBsZW1lbnRhdGlvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGVsZW1ldHJ5Q29udGV4dDogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHByb3RvY29sVmVyc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogRXBvY2ggbXMgd2hlbiB0aGUgY2xpZW50IGxhc3QgaGFkIGEgbGl2ZSB0cmFuc3BvcnQsIG9yIHdoZW4gdGhpcyByZWNvcmRcblx0ICogd2FzIGNyZWF0ZWQgZm9yIGEgbmV2ZXItY29ubmVjdGVkIG9ycGhhbiB0b29sLWNhbGwgc3RhbXAuIFBpbnMgdGhlIGdyYWNlXG5cdCAqIGNsb2NrIHNvIHJlLWFybXMgdHJpZ2dlcmVkIGJ5IGxhdGVyIG9ycGhhbmVkIHRvb2wgY2FsbHMgc2hyaW5rIHRoZVxuXHQgKiByZW1haW5pbmcgd2luZG93IGluc3RlYWQgb2YgcmVzZXR0aW5nIGl0LiBEcml2ZXMgdGhlIGRpc2Nvbm5lY3QtdGltZW91dFxuXHQgKiBkZWxheSAocmVzaWR1YWwgd2luZG93IGZyb20gdGhpcyBpbnN0YW50KS5cblx0ICovXG5cdGxhc3RTZWVuQXQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIFBlbmRpbmcgdG9vbC1jYWxsIGRpc2Nvbm5lY3QgdGltZW91dHMgb3duZWQgYnkgdGhpcyBjbGllbnQsIGtleWVkIGJ5XG5cdCAqIHNlc3Npb24gVVJJLiBBcm1lZCB3aGVuIHRoZSBjbGllbnQgb3ducyBhIHBlbmRpbmcgY2xpZW50IHRvb2wgY2FsbCBidXQgaXNcblx0ICogbm90IGNvbm5lY3RlZDsgZmlyZXMgYSBmYWlsaW5nIGNvbXBsZXRpb24gaWYgaXQgZG9lcyBub3QgKHJlKWNvbm5lY3Rcblx0ICogd2l0aGluIHRoZSBncmFjZSB3aW5kb3cuIFJlY29ubmVjdGluZyBwcm9tb3RlcyB0aGUgcmVjb3JkIHRvIGFjdGl2ZSBhbmRcblx0ICogZGlzcG9zZXMgdGhlc2UgdGltZXJzICh0aGUgZ3JhY2Ugd2luZG93IG5vIGxvbmdlciBhcHBsaWVzIG9uY2UgYSB0cmFuc3BvcnRcblx0ICogaXMgbGl2ZSkuIERpc3Bvc2luZyBhbiBlbnRyeSAob3IgdGhlIHdob2xlIG1hcCkgY2xlYXJzIHRoZSB0aW1lci5cblx0ICovXG5cdHJlYWRvbmx5IGRpc2Nvbm5lY3RUaW1lb3V0czogRGlzcG9zYWJsZU1hcDxzdHJpbmc+O1xufVxuXG4vKipcbiAqIENsYXNzaWZpZXMgYSByYXcgY2hhbm5lbCBVUkkgc3RyaW5nIGludG8gaXRzIHtAbGluayBDaGFubmVsS2luZH0gYW5kXG4gKiByZXR1cm5zIHRoZSBjYW5vbmljYWwgVVJJIHRvIGtleSBzdWJzY3JpcHRpb25zIGJ5LiBSZXR1cm5zIGB1bmRlZmluZWRgXG4gKiB3aGVuIHRoZSBjaGFubmVsIGlzIE9UTFAtZmxhdm91cmVkIGJ1dCB0aGUgVVJJIGRvZXMgbm90IHBhcnNlIGludG8gYVxuICogc3VwcG9ydGVkIHNoYXBlICh1bmtub3duIGxldmVsLCBtaXNzaW5nIHBhdGgpIHNvIHRoZSBjYWxsZXIgY2FuXG4gKiBzaWxlbnRseSBkcm9wIHRoZSBzdWJzY3JpYmUgcmF0aGVyIHRoYW4gaW5zdGFsbGluZyBhIGJyb2tlbiBlbnRyeS5cbiAqXG4gKiBGb3Igc3RhdGUgY2hhbm5lbHMgdGhlIGNhbm9uaWNhbCBVUkkgaXMganVzdCB0aGUgaW5wdXQgdmVyYmF0aW0gXHUyMDE0IHRoZVxuICogYWdlbnQgc2VydmljZSBpcyB0aGUgYXV0aG9yaXRhdGl2ZSBkZWR1cGxpY2F0aW9uIHBvaW50IGFuZCB0b2xlcmF0ZXNcbiAqIHdoYXRldmVyIFVSSSBmb3JtIHRoZSBjbGllbnQgc2VudC5cbiAqL1xuZnVuY3Rpb24gY2xhc3NpZnlDaGFubmVsKGNoYW5uZWw6IHN0cmluZyk6IENoYW5uZWxTdWJzY3JpcHRpb24gfCB1bmRlZmluZWQge1xuXHRpZiAoY2hhbm5lbC50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoYCR7T1RMUF9DSEFOTkVMX1NDSEVNRX06YCkpIHtcblx0XHRjb25zdCBsZXZlbCA9IGV4dHJhY3RMZXZlbEZyb21PdGxwTG9nc1VyaShjaGFubmVsKTtcblx0XHRpZiAoIWxldmVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBraW5kOiBDaGFubmVsS2luZC5PdGxwTG9ncywgdXJpOiBidWlsZE90bHBMb2dzQ2hhbm5lbFVyaShsZXZlbCksIGxldmVsIH07XG5cdH1cblx0aWYgKGlzQWhwUmVzb3VyY2VXYXRjaENoYW5uZWwoY2hhbm5lbCkpIHtcblx0XHRyZXR1cm4geyBraW5kOiBDaGFubmVsS2luZC5SZXNvdXJjZVdhdGNoLCB1cmk6IGNoYW5uZWwgfTtcblx0fVxuXHRyZXR1cm4geyBraW5kOiBDaGFubmVsS2luZC5TdGF0ZSwgdXJpOiBjaGFubmVsIH07XG59XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBmb3IgcHJvdG9jb2wtbGV2ZWwgY29uY2VybnMgb3V0c2lkZSBvZiBJQWdlbnRTZXJ2aWNlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElQcm90b2NvbFNlcnZlckNvbmZpZyB7XG5cdC8qKiBQcm9jZXNzIGxhdW5jaGVyIHRoYXQgb3ducyB0aGlzIGFnZW50IGhvc3QuICovXG5cdHJlYWRvbmx5IGhvc3RMYXVuY2hLaW5kPzogQWdlbnRIb3N0TGF1bmNoS2luZDtcblx0LyoqIFByb2Nlc3Mtd2lkZSBjbGllbnQgY291bnQgdHJhY2tlciBzaGFyZWQgYnkgZXZlcnkgbGlzdGVuZXIgaW4gdGhpcyBob3N0LiAqL1xuXHRyZWFkb25seSBjb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlcj86IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyO1xuXG5cdC8qKiBEZWZhdWx0IGRpcmVjdG9yeSByZXR1cm5lZCB0byBjbGllbnRzIGR1cmluZyB0aGUgaW5pdGlhbGl6ZSBoYW5kc2hha2UuICovXG5cdHJlYWRvbmx5IGRlZmF1bHREaXJlY3Rvcnk/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRvIGV4cG9zZSBWUyBDb2RlIGV4dGVuc2lvbiBtZXRob2RzIG91dHNpZGUgdGhlIEFnZW50IEhvc3QgUHJvdG9jb2wuXG5cdCAqIERlZmF1bHRzIHRvIGB0cnVlYCBmb3IgZXhpc3RpbmcgcmVtb3RlIGxpc3RlbmVycy5cblx0ICovXG5cdHJlYWRvbmx5IGFsbG93RXh0ZW5zaW9uTWV0aG9kcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDaGFyYWN0ZXJzIHRoYXQsIHdoZW4gdHlwZWQgaW4gYSB7QGxpbmsgVXNlck1lc3NhZ2V9IGlucHV0LCBTSE9VTERcblx0ICogY2F1c2UgdGhlIGNsaWVudCB0byBpc3N1ZSBhIGBjb21wbGV0aW9uc2AgcmVxdWVzdC4gQW5ub3VuY2VkIHRvXG5cdCAqIGNsaWVudHMgaW4gdGhlIGBpbml0aWFsaXplYCByZXNwb25zZS5cblx0ICovXG5cdHJlYWRvbmx5IGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHQvKipcblx0ICogUHJlZml4IHRoYXQgbWFya3MgYSB1c2VyIG1lc3NhZ2UgYXMgYSBob3N0IHRlcm1pbmFsIGNvbW1hbmQuXG5cdCAqL1xuXHRyZWFkb25seSB0ZXJtaW5hbENvbW1hbmRQcmVmaXg/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBlbWl0dGVyIHRvIHVzZSBhcyB0aGUgc291cmNlIGZvciB0aGUgT1RMUCBsb2dzIGNoYW5uZWxcblx0ICogYWR2ZXJ0aXNlZCB2aWEgYEluaXRpYWxpemVSZXN1bHQudGVsZW1ldHJ5LmxvZ3NgLiBXaGVuIHByZXNlbnQsIHRoaXNcblx0ICogaGFuZGxlciB3aWxsIHJvdXRlIGBzdWJzY3JpYmVgL2B1bnN1YnNjcmliZWAgcmVxdWVzdHMgb25cblx0ICogYGFocC1vdGxwOmAgY2hhbm5lbHMgdG8gaXRzIGludGVybmFsIE9UTFAgc3Vic2NyaXB0aW9uIHJlZ2lzdHJ5IGFuZFxuXHQgKiBicm9hZGNhc3QgZXZlcnkgcmVjb3JkIGZlZCBpbnRvIHRoZSBlbWl0dGVyIGFzIGFuXG5cdCAqIGBvdGxwL2V4cG9ydExvZ3NgIG5vdGlmaWNhdGlvbi4gV2hlbiBhYnNlbnQsIHRoZSBPVExQIGNoYW5uZWwgaXNcblx0ICogbm90IGFkdmVydGlzZWQgYW5kIGFueSBpbmJvdW5kIGBhaHAtb3RscDpgIHN1YnNjcmliZSByZXF1ZXN0IGlzXG5cdCAqIHJlamVjdGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb3RscExvZ0VtaXR0ZXI/OiBPdGxwTG9nRW1pdHRlcjtcbn1cblxuLyoqXG4gKiBTZXJ2ZXItc2lkZSBoYW5kbGVyIHRoYXQgbWFuYWdlcyBwcm90b2NvbCBjb25uZWN0aW9ucywgcm91dGVzIEpTT04tUlBDXG4gKiBtZXNzYWdlcyB0byB0aGUgYWdlbnQgc2VydmljZSwgYW5kIGJyb2FkY2FzdHMgYWN0aW9ucy9ub3RpZmljYXRpb25zXG4gKiB0byBzdWJzY3JpYmVkIGNsaWVudHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm90b2NvbFNlcnZlckhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogUGVyLWNsaWVudCByZWNvcmRzIGtleWVkIGJ5IGNsaWVudElkLiBIb2xkcyBib3RoIGNvbm5lY3RlZCBjbGllbnRzXG5cdCAqIChgY29ubmVjdGlvbnNgIG5vbi1lbXB0eSkgYW5kIHJlY2VudGx5LWRpc2Nvbm5lY3RlZCBvbmVzIHJldGFpbmVkIGZvciB0aGVcblx0ICogdG9vbC1jYWxsIGRpc2Nvbm5lY3QtZ3JhY2Ugd2luZG93IChgY29ubmVjdGlvbnMubGVuZ3RoID09PSAwYCkuIFNlZVxuXHQgKiB7QGxpbmsgSUNsaWVudFJlY29yZH0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGllbnRzID0gbmV3IE1hcDxzdHJpbmcsIElDbGllbnRSZWNvcmQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcGxheUJ1ZmZlcjogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlSZXBvcnRlcjogQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyOiBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFuYWdlZFNldHRpbmdzT3duZXJJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblxuXHQvKiogRmlyZXMgd2l0aCB0aGUgY3VycmVudCBjbGllbnQgY291bnQgd2hlbmV2ZXIgYSBjbGllbnQgY29ubmVjdHMgb3IgZGlzY29ubmVjdHMuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50ID0gdGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRTZXJ2aWNlOiBJQWdlbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlcjogSVByb3RvY29sU2VydmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZzogSVByb3RvY29sU2VydmVyQ29uZmlnLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcjogQUhQRmlsZVN5c3RlbVByb3ZpZGVyLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hbmFnZWRTZXR0aW5nc1NlcnZpY2U6IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyID0gbmV3IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyKHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyID0gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyID8/IHRoaXMuX3JlZ2lzdGVyKG5ldyBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlcigpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NlcnZlci5vbkNvbm5lY3Rpb24odHJhbnNwb3J0ID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZU5ld0Nvbm5lY3Rpb24odHJhbnNwb3J0KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0dGhpcy5fcmVwbGF5QnVmZmVyLnB1c2goZW52ZWxvcGUpO1xuXHRcdFx0aWYgKHRoaXMuX3JlcGxheUJ1ZmZlci5sZW5ndGggPiBSRVBMQVlfQlVGRkVSX0NBUEFDSVRZKSB7XG5cdFx0XHRcdHRoaXMuX3JlcGxheUJ1ZmZlci5zaGlmdCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYnJvYWRjYXN0QWN0aW9uKGVudmVsb3BlKTtcblx0XHRcdC8vIEEgY2xpZW50IHRvb2wgY2FsbCBtYXkgYmUgaXNzdWVkIGZvciBhIGNsaWVudCB0aGF0IGlzIG5vIGxvbmdlclxuXHRcdFx0Ly8gY29ubmVjdGVkIFx1MjAxNCBlLmcuIGEgc3RhbGUgc3RhbXAgZnJvbSBhIHdpbmRvdyB0aGF0IHJlbG9hZGVkLiBUaGVcblx0XHRcdC8vIGxpdmUtZGlzY29ubmVjdCBwYXRoIChgX2hhbmRsZUNsaWVudERpc2Nvbm5lY3RlZGApIGRvZXMgbm90IGNvdmVyXG5cdFx0XHQvLyB0aGVzZSBiZWNhdXNlIG5vIGRpc2Nvbm5lY3QgZXZlbnQgZmlyZXMgZm9yIGFuIGFscmVhZHktZ29uZVxuXHRcdFx0Ly8gY2xpZW50LiBEZXRlY3QgdGhlIG9ycGhhbiBhdCBpc3N1YW5jZSB0aW1lIGFuZCBhcm0gdGhlIHNhbWVcblx0XHRcdC8vIGdyYWNlLXBlcmlvZCB0aW1lb3V0IHNvIHRoZSBjYWxsIGNhbm5vdCBoYW5nIGZvcmV2ZXIuIENhbGxzXG5cdFx0XHQvLyBzdGFtcGVkIHdoaWxlIG5vIGNsaWVudCBpcyBjb25uZWN0ZWQgYXJlIGZhaWxlZCBpbW1lZGlhdGVseSBieVxuXHRcdFx0Ly8gdGhlIHByb3ZpZGVyLCBzbyB0aGV5IG5ldmVyIHJlYWNoIHRoaXMgcGF0aC5cblx0XHRcdGlmIChlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCB8fCBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSkge1xuXHRcdFx0XHRpZiAoIWlzQWhwQ2hhdENoYW5uZWwoZW52ZWxvcGUuY2hhbm5lbCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtQcm90b2NvbFNlcnZlcl0gQ2hhdCB0b29sLWNhbGwgYWN0aW9uIGVtaXR0ZWQgb24gbm9uLWNoYXQgY2hhbm5lbDogJHtlbnZlbG9wZS5jaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NoZWNrT3JwaGFuZWRDbGllbnRUb29sQ2FsbHMocGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShlbnZlbG9wZS5jaGFubmVsKSwgZW52ZWxvcGUuY2hhbm5lbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihub3RpZmljYXRpb24gPT4ge1xuXHRcdFx0dGhpcy5fYnJvYWRjYXN0Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbik7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnRTZXJ2aWNlLm9uTWNwTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbiA9PiB7XG5cdFx0XHR0aGlzLl9icm9hZGNhc3RNY3BOb3RpZmljYXRpb24obm90aWZpY2F0aW9uKTtcblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5fY29uZmlnLm90bHBMb2dFbWl0dGVyKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWcub3RscExvZ0VtaXR0ZXIub25EaWRMb2cocmVjb3JkID0+IHRoaXMuX2Jyb2FkY2FzdE90bHBMb2cocmVjb3JkKSkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gQ29ubmVjdGlvbiBoYW5kbGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfaGFuZGxlTmV3Q29ubmVjdGlvbih0cmFuc3BvcnQ6IElQcm90b2NvbFRyYW5zcG9ydCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQgfCB1bmRlZmluZWQ7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodHJhbnNwb3J0Lm9uTWVzc2FnZShtc2cgPT4ge1xuXHRcdFx0aWYgKGlzSnNvblJwY1JlcXVlc3QobXNnKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbUHJvdG9jb2xTZXJ2ZXJdIHJlcXVlc3Q6IG1ldGhvZD0ke21zZy5tZXRob2R9IGlkPSR7bXNnLmlkfWApO1xuXG5cdFx0XHRcdC8vIFBpbmcgaXMgc3RhdGVsZXNzIGFuZCBNVVNUIGJlIGFuc3dlcmFibGUgcmVnYXJkbGVzcyBvZiB3aGV0aGVyXG5cdFx0XHRcdC8vIHRoZSBjb25uZWN0aW9uIGhhcyBiZWVuIGluaXRpYWxpemVkLiBDYXJyaWVzIG5vIHBheWxvYWQgXHUyMDE0IHRoZVxuXHRcdFx0XHQvLyByb3VuZC10cmlwIGl0c2VsZiBpcyB0aGUgbGl2ZW5lc3Mgc2lnbmFsLlxuXHRcdFx0XHRpZiAobXNnLm1ldGhvZCA9PT0gJ3BpbmcnKSB7XG5cdFx0XHRcdFx0dHJhbnNwb3J0LnNlbmQoanNvblJwY1N1Y2Nlc3MobXNnLmlkLCBudWxsKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSGFuZGxlIGluaXRpYWxpemUvcmVjb25uZWN0IGFzIHJlcXVlc3RzIHRoYXQgc2V0IHVwIHRoZSBjbGllbnRcblx0XHRcdFx0aWYgKCFjbGllbnQgJiYgbXNnLm1ldGhvZCA9PT0gJ2luaXRpYWxpemUnKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2hhbmRsZUluaXRpYWxpemUobXNnLnBhcmFtcywgdHJhbnNwb3J0LCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0XHRjbGllbnQgPSByZXN1bHQuY2xpZW50O1xuXHRcdFx0XHRcdFx0dHJhbnNwb3J0LnNlbmQoanNvblJwY1N1Y2Nlc3MobXNnLmlkLCByZXN1bHQucmVzcG9uc2UpKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvckZyb20obXNnLmlkLCBlcnIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghY2xpZW50ICYmIG1zZy5tZXRob2QgPT09ICdyZWNvbm5lY3QnKSB7XG5cdFx0XHRcdFx0bGV0IHJlc3BvbnNlUHJvbWlzZTogUHJvbWlzZTx1bmtub3duPjtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5faGFuZGxlUmVjb25uZWN0KG1zZy5wYXJhbXMsIHRyYW5zcG9ydCwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdFx0Y2xpZW50ID0gcmVzdWx0LmNsaWVudDtcblx0XHRcdFx0XHRcdHJlc3BvbnNlUHJvbWlzZSA9IHRoaXMuX3RyYWNrUmVxdWVzdChyZXN1bHQucmVzcG9uc2VQcm9taXNlKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvckZyb20obXNnLmlkLCBlcnIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzcG9uc2VQcm9taXNlLnRoZW4oXG5cdFx0XHRcdFx0XHRyZXNwb25zZSA9PiB0cmFuc3BvcnQuc2VuZChqc29uUnBjU3VjY2Vzcyhtc2cuaWQsIHJlc3BvbnNlKSksXG5cdFx0XHRcdFx0XHRlcnIgPT4gdHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yRnJvbShtc2cuaWQsIGVycikpLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGhlIFZTIENvZGUgdXBncmFkZSByZXF1ZXN0IHJpZGVzIG9uIHRoZSBzYW1lIHRyYW5zcG9ydCBidXRcblx0XHRcdFx0Ly8gaXMgY2FsbGFibGUgcHJlLWBpbml0aWFsaXplYDogYnkgZGVmaW5pdGlvbiB3ZSBnZXQgaGVyZSB3aGVuXG5cdFx0XHRcdC8vIHRoZSBjbGllbnQncyBwcm90b2NvbCB2ZXJzaW9uIHdhcyByZWplY3RlZCwgc28gdGhlIGNsaWVudFxuXHRcdFx0XHQvLyBuZXZlciBtYW5hZ2VkIHRvIGNvbXBsZXRlIHRoZSBoYW5kc2hha2UuXG5cdFx0XHRcdGlmICgobXNnLm1ldGhvZCBhcyBzdHJpbmcpID09PSBWU0NPREVfVVBHUkFERV9NRVRIT0QpIHtcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVWc2NvZGVVcGdyYWRlKG1zZy5pZCwgdHJhbnNwb3J0KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWNsaWVudCkge1xuXHRcdFx0XHRcdHRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvcihtc2cuaWQsIEpzb25ScGNFcnJvckNvZGVzLk1ldGhvZE5vdEZvdW5kLCBgTWV0aG9kIG5vdCBmb3VuZDogJHttc2cubWV0aG9kfWApKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faGFuZGxlUmVxdWVzdChjbGllbnQsIG1zZy5tZXRob2QsIG1zZy5wYXJhbXMsIG1zZy5pZCk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzSnNvblJwY05vdGlmaWNhdGlvbihtc2cpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtQcm90b2NvbFNlcnZlcl0gbm90aWZpY2F0aW9uOiBtZXRob2Q9JHttc2cubWV0aG9kfWApO1xuXHRcdFx0XHRpZiAoKG1zZyBhcyB7IG1ldGhvZDogc3RyaW5nIH0pLm1ldGhvZCA9PT0gJ3NldENsaWVudE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zJykge1xuXHRcdFx0XHRcdGlmIChjbGllbnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBlcm1pc3Npb25zID0gKChtc2cgYXMgeyBwYXJhbXM/OiB7IHBlcm1pc3Npb25zPzogdW5rbm93biB9IH0pLnBhcmFtcyk/LnBlcm1pc3Npb25zO1xuXHRcdFx0XHRcdFx0aWYgKGlzTWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMocGVybWlzc2lvbnMpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX21hbmFnZWRTZXR0aW5nc1NlcnZpY2Uuc2V0Q2xpZW50UGVybWlzc2lvbnModGhpcy5fbWFuYWdlZFNldHRpbmdzQ29udHJpYnV0aW9uSWQoY2xpZW50LmNsaWVudElkKSwgcGVybWlzc2lvbnMpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbUHJvdG9jb2xTZXJ2ZXJdIElnbm9yaW5nIGludmFsaWQgbWFuYWdlZCBzZXR0aW5ncyBwZXJtaXNzaW9ucyBjb250cmlidXRpb24uJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBOb3RpZmljYXRpb24gXHUyMDE0IGZpcmUtYW5kLWZvcmdldFxuXHRcdFx0XHRzd2l0Y2ggKG1zZy5tZXRob2QpIHtcblx0XHRcdFx0XHRjYXNlICd1bnN1YnNjcmliZSc6XG5cdFx0XHRcdFx0XHRpZiAoY2xpZW50KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3JlbW92ZVN1YnNjcmlwdGlvbihjbGllbnQsIG1zZy5wYXJhbXMuY2hhbm5lbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdkaXNwYXRjaEFjdGlvbic6XG5cdFx0XHRcdFx0XHRpZiAoY2xpZW50KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtQcm90b2NvbFNlcnZlcl0gZGlzcGF0Y2hBY3Rpb246ICR7SlNPTi5zdHJpbmdpZnkobXNnLnBhcmFtcy5hY3Rpb24udHlwZSl9YCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IG1zZy5wYXJhbXMuYWN0aW9uIGFzIFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbjtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2hhbm5lbCA9IG1zZy5wYXJhbXMuY2hhbm5lbDtcblx0XHRcdFx0XHRcdFx0Ly8gVW5zdXBwb3J0ZWQgYWN0aW9ucyBhcmUgZWNob2VkIGFzIHJlamVjdGlvbnMgc28gb3B0aW1pc3RpYyBjbGllbnRzIHJvbGwgYmFjay5cblx0XHRcdFx0XHRcdFx0aWYgKFVOU1VQUE9SVEVEX0NMSUVOVF9BQ1RJT05fVFlQRVMuaGFzKGFjdGlvbi50eXBlKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Byb3RvY29sU2VydmVyXSByZWplY3RpbmcgdW5zdXBwb3J0ZWQgY2xpZW50IGFjdGlvbjogJHthY3Rpb24udHlwZX1gKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVqZWN0Q2xpZW50QWN0aW9uKFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2hhbm5lbCxcblx0XHRcdFx0XHRcdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0XHRcdFx0XHRcdHsgY2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCwgY2xpZW50U2VxOiBtc2cucGFyYW1zLmNsaWVudFNlcSB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0YFVuc3VwcG9ydGVkIGFjdGlvbjogJHthY3Rpb24udHlwZX1gLFxuXHRcdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNTZXNzaW9uQWN0aW9uKGFjdGlvbikgfHwgaXNDaGF0QWN0aW9uKGFjdGlvbikgfHwgaXNUZXJtaW5hbEFjdGlvbihhY3Rpb24pIHx8IGlzQ2hhbmdlc2V0QWN0aW9uKGFjdGlvbikgfHwgaXNBbm5vdGF0aW9uc0FjdGlvbihhY3Rpb24pIHx8IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fYWdlbnRTZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgY2xpZW50LmNsaWVudElkLCBtc2cucGFyYW1zLmNsaWVudFNlcSwgY2xpZW50LnRlbGVtZXRyeUNvbnRleHQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc0pzb25ScGNSZXNwb25zZShtc2cpKSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nUmV2ZXJzZVJlcXVlc3RzLmdldChtc2cuaWQpO1xuXHRcdFx0XHRpZiAocGVuZGluZyAmJiBwZW5kaW5nLmNsaWVudCA9PT0gY2xpZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1JldmVyc2VSZXF1ZXN0cy5kZWxldGUobXNnLmlkKTtcblx0XHRcdFx0XHRpZiAoaGFzS2V5KG1zZywgeyBlcnJvcjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdFx0cGVuZGluZy5yZWplY3QobmV3IFByb3RvY29sRXJyb3IoXG5cdFx0XHRcdFx0XHRcdG1zZy5lcnJvcj8uY29kZSA/PyAtMzIwMDAsXG5cdFx0XHRcdFx0XHRcdG1zZy5lcnJvcj8ubWVzc2FnZSA/PyAnUmV2ZXJzZSBSUEMgZXJyb3InLFxuXHRcdFx0XHRcdFx0XHRtc2cuZXJyb3I/LmRhdGEsXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGVuZGluZy5yZXNvbHZlKG1zZy5yZXN1bHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFuc3BvcnQub25DbG9zZSgoKSA9PiB7XG5cdFx0XHRjb25zdCByZWNvcmQgPSBjbGllbnQgPyB0aGlzLl9jbGllbnRzLmdldChjbGllbnQuY2xpZW50SWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNsaWVudCAmJiByZWNvcmQ/LnN0YXRlID09PSAnYWN0aXZlJykge1xuXHRcdFx0XHRjb25zdCBjb25uZWN0aW9uSW5kZXggPSByZWNvcmQuY29ubmVjdGlvbnMuaW5kZXhPZihjbGllbnQpO1xuXHRcdFx0XHRpZiAoY29ubmVjdGlvbkluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbkNvdW50ID0gY2xpZW50LnN1YnNjcmlwdGlvbnMuc2l6ZTtcblx0XHRcdFx0XHRyZWNvcmQuY29ubmVjdGlvbnMuc3BsaWNlKGNvbm5lY3Rpb25JbmRleCwgMSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVsZWFzZUNsaWVudFN1YnNjcmlwdGlvbnMoY2xpZW50LCByZWNvcmQpO1xuXHRcdFx0XHRcdHRoaXMuX3JlamVjdFBlbmRpbmdSZXZlcnNlUmVxdWVzdHNGb3JDb25uZWN0aW9uKGNsaWVudCk7XG5cdFx0XHRcdFx0aWYgKHJlY29yZC5jb25uZWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1Byb3RvY29sU2VydmVyXSBDbGllbnQgZGlzY29ubmVjdGVkOiAke2NsaWVudC5jbGllbnRJZH0sIHN1YnNjcmlwdGlvbnM9JHtzdWJzY3JpcHRpb25Db3VudH1gKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NsaWVudHMuc2V0KGNsaWVudC5jbGllbnRJZCwge1xuXHRcdFx0XHRcdFx0XHRzdGF0ZTogJ2dyYWNlJyxcblx0XHRcdFx0XHRcdFx0Y2xpZW50SW5mbzogcmVjb3JkLmNsaWVudEluZm8sXG5cdFx0XHRcdFx0XHRcdHRlbGVtZXRyeUNvbnRleHQ6IGNsaWVudC50ZWxlbWV0cnlDb250ZXh0LFxuXHRcdFx0XHRcdFx0XHRwcm90b2NvbFZlcnNpb246IGNsaWVudC5wcm90b2NvbFZlcnNpb24sXG5cdFx0XHRcdFx0XHRcdGxhc3RTZWVuQXQ6IERhdGUubm93KCksXG5cdFx0XHRcdFx0XHRcdGRpc2Nvbm5lY3RUaW1lb3V0czogbmV3IERpc3Bvc2FibGVNYXAoKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5faGFuZGxlQ2xpZW50RGlzY29ubmVjdGVkKGNsaWVudC5jbGllbnRJZCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudC5maXJlKHRoaXMuX2Nvbm5lY3RlZENsaWVudENvdW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3J0Q2xpZW50RGlzY29ubmVjdGVkKGNsaWVudCwgc3Vic2NyaXB0aW9uQ291bnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRyYW5zcG9ydCk7XG5cdH1cblxuXHQvLyAtLS0tIEhhbmRzaGFrZSBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfaGFuZGxlSW5pdGlhbGl6ZShcblx0XHRwYXJhbXM6IEluaXRpYWxpemVQYXJhbXMsXG5cdFx0dHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQsXG5cdFx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0KTogeyBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQ7IHJlc3BvbnNlOiB1bmtub3duIH0ge1xuXHRcdGNvbnN0IG9mZmVyZWQgPSBBcnJheS5pc0FycmF5KHBhcmFtcy5wcm90b2NvbFZlcnNpb25zKSA/IHBhcmFtcy5wcm90b2NvbFZlcnNpb25zIDogW107XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUHJvdG9jb2xTZXJ2ZXJdIEluaXRpYWxpemU6IGNsaWVudElkPSR7cGFyYW1zLmNsaWVudElkfSwgcHJvdG9jb2xWZXJzaW9ucz1bJHtvZmZlcmVkLmpvaW4oJywgJyl9XWApO1xuXG5cdFx0Y29uc3QgbmVnb3RpYXRlZCA9IG5lZ290aWF0ZVByb3RvY29sVmVyc2lvbihvZmZlcmVkLCBQUk9UT0NPTF9WRVJTSU9OKTtcblx0XHRpZiAoIW5lZ290aWF0ZWQpIHtcblx0XHRcdGNvbnN0IGRhdGE6IFVuc3VwcG9ydGVkUHJvdG9jb2xWZXJzaW9uRXJyb3JEYXRhRXggPSB7XG5cdFx0XHRcdHN1cHBvcnRlZFZlcnNpb25zOiBbYF4ke1BST1RPQ09MX1ZFUlNJT059YF0sXG5cdFx0XHRcdC8vIE9ubHkgYWR2ZXJ0aXNlIHRoZSBpbi1iYW5kIHVwZ3JhZGUgbWV0aG9kIHdoZW4gdGhlIGFnZW50XG5cdFx0XHRcdC8vIGhvc3Qgd2FzIHNwYXduZWQgYnkgYSBWUyBDb2RlIENMSSB0aGF0IGlzIGxpc3RlbmluZyBmb3Jcblx0XHRcdFx0Ly8gbWFuYWdlbWVudCByZXF1ZXN0cyAocHJlc2VuY2Ugb2YgdGhlIGVudiB2YXIpLiBPdGhlcndpc2Vcblx0XHRcdFx0Ly8gdGhlcmUgaXMgbm8gc3VwZXJ2aXNvciB0byBhY3R1YWxseSBhY3Qgb24gaXQsIHNvIGRvbid0XG5cdFx0XHRcdC8vIGxpZSB0byB0aGUgY2xpZW50LlxuXHRcdFx0XHRfbWV0YTogZ2V0QWdlbnRIb3N0TWFuYWdlbWVudFNvY2tldFBhdGgoKVxuXHRcdFx0XHRcdD8geyB2c2NvZGVVcGdyYWRlTWV0aG9kOiBWU0NPREVfVVBHUkFERV9NRVRIT0QgfVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKFxuXHRcdFx0XHRBSFBfVU5TVVBQT1JURURfUFJPVE9DT0xfVkVSU0lPTixcblx0XHRcdFx0YENsaWVudCBvZmZlcmVkIHByb3RvY29sIHZlcnNpb25zIFske29mZmVyZWQuam9pbignLCAnKX1dLCBub25lIG9mIHdoaWNoIGFyZSBjb21wYXRpYmxlIHdpdGggdGhpcyBzZXJ2ZXIncyB2ZXJzaW9uICR7UFJPVE9DT0xfVkVSU0lPTn0gKHNlcnZlciBhY2NlcHRzIF4ke1BST1RPQ09MX1ZFUlNJT059KS5gLFxuXHRcdFx0XHRkYXRhLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c1JlY29yZCA9IHRoaXMuX2NsaWVudHMuZ2V0KHBhcmFtcy5jbGllbnRJZCk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5VHJhbnNwb3J0VG9rZW4gPSB7fTtcblx0XHRjb25zdCBpbml0aWFsaXphdGlvbkRpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5Q29udGV4dCA9IHRoaXMuX2NyZWF0ZUNsaWVudFRlbGVtZXRyeUNvbnRleHQocGFyYW1zLmNsaWVudEluZm8sIHBhcmFtcy5fbWV0YSwgdHJhbnNwb3J0KTtcblx0XHRjb25zdCBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQgPSB7XG5cdFx0XHRjbGllbnRJZDogcGFyYW1zLmNsaWVudElkLFxuXHRcdFx0Y2xpZW50SW5mbzogcGFyYW1zLmNsaWVudEluZm8sXG5cdFx0XHR0ZWxlbWV0cnlDb250ZXh0LFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBuZWdvdGlhdGVkLFxuXHRcdFx0dHJhbnNwb3J0LFxuXHRcdFx0Y29ubmVjdGlvblN0b3BXYXRjaDogU3RvcFdhdGNoLmNyZWF0ZSh0cnVlKSxcblx0XHRcdHRlbGVtZXRyeVRyYW5zcG9ydFRva2VuLFxuXHRcdFx0aXNSZWNvbm5lY3Q6IHRoaXMuX2Nvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyLmhhc1NlZW5DbGllbnQocGFyYW1zLmNsaWVudElkKSxcblx0XHRcdHRlbGVtZXRyeUNvbm5lY3Rpb25BY3RpdmU6IGZhbHNlLFxuXHRcdFx0c3Vic2NyaXB0aW9uczogbmV3IE1hcCgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRpbml0aWFsaXphdGlvbkRpc3Bvc2FibGVzLFxuXHRcdH07XG5cdFx0dGhpcy5fYXR0YWNoQ29ubmVjdGlvbihwYXJhbXMuY2xpZW50SWQsIGNsaWVudCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyQ2xpZW50RmlsZVN5c3RlbUF1dGhvcml0eShwYXJhbXMuY2xpZW50SWQsIGluaXRpYWxpemF0aW9uRGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRjb25zdCBzbmFwc2hvdHM6IElTdGF0ZVNuYXBzaG90W10gPSBbXTtcblx0XHRcdGlmIChwYXJhbXMuaW5pdGlhbFN1YnNjcmlwdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB1cmkgb2YgcGFyYW1zLmluaXRpYWxTdWJzY3JpcHRpb25zKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSB0aGlzLl9hZGRJbml0aWFsU3Vic2NyaXB0aW9uKGNsaWVudCwgdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGlmIChzbmFwc2hvdCkge1xuXHRcdFx0XHRcdFx0c25hcHNob3RzLnB1c2goc25hcHNob3QpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb3VudHMgPSB0aGlzLl9jb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlci5jb25uZWN0KHBhcmFtcy5jbGllbnRJZCwgdGVsZW1ldHJ5VHJhbnNwb3J0VG9rZW4pO1xuXHRcdFx0Y2xpZW50LnRlbGVtZXRyeUNvbm5lY3Rpb25BY3RpdmUgPSB0cnVlO1xuXHRcdFx0aWYgKHByZXZpb3VzUmVjb3JkPy5zdGF0ZSA9PT0gJ2dyYWNlJykge1xuXHRcdFx0XHRwcmV2aW91c1JlY29yZC5kaXNjb25uZWN0VGltZW91dHMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQuZmlyZSh0aGlzLl9jb25uZWN0ZWRDbGllbnRDb3VudCk7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci5jbGllbnRDb25uZWN0aW9uKHtcblx0XHRcdFx0YWN0aW9uOiAnY29ubmVjdGVkJyxcblx0XHRcdFx0Y29udGV4dDogdGVsZW1ldHJ5Q29udGV4dCxcblx0XHRcdFx0Y2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCxcblx0XHRcdFx0Y2xpZW50SW1wbGVtZW50YXRpb25OYW1lOiBjbGllbnQuY2xpZW50SW5mbz8ubmFtZSxcblx0XHRcdFx0Y2xpZW50SW1wbGVtZW50YXRpb25WZXJzaW9uOiBjbGllbnQuY2xpZW50SW5mbz8udmVyc2lvbixcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBjbGllbnQucHJvdG9jb2xWZXJzaW9uLFxuXHRcdFx0XHQuLi5jb3VudHMsXG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y2xpZW50LFxuXHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdHByb3RvY29sVmVyc2lvbjogbmVnb3RpYXRlZCxcblx0XHRcdFx0XHRzZXJ2ZXJTZXE6IHRoaXMuX3N0YXRlTWFuYWdlci5zZXJ2ZXJTZXEsXG5cdFx0XHRcdFx0c25hcHNob3RzLFxuXHRcdFx0XHRcdGRlZmF1bHREaXJlY3Rvcnk6IHRoaXMuX2NvbmZpZy5kZWZhdWx0RGlyZWN0b3J5LFxuXHRcdFx0XHRcdGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyczogdGhpcy5fY29uZmlnLmNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycyxcblx0XHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRQcmVmaXg6IHRoaXMuX2NvbmZpZy50ZXJtaW5hbENvbW1hbmRQcmVmaXgsXG5cdFx0XHRcdFx0dGVsZW1ldHJ5OiB0aGlzLl9jb25maWcub3RscExvZ0VtaXR0ZXIgPyB7IGxvZ3M6IE9UTFBfTE9HU19DSEFOTkVMX1RFTVBMQVRFIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9yb2xsYmFja0ZhaWxlZEluaXRpYWxpemF0aW9uKGNsaWVudCwgcHJldmlvdXNSZWNvcmQpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhlbHBlciBmb3IgYGluaXRpYWxpemVgIGFuZCBgcmVjb25uZWN0YCBpbml0aWFsLXN1YnNjcmlwdGlvblxuXHQgKiBwcm9jZXNzaW5nOiBjbGFzc2lmeSBgY2hhbm5lbGAsIGluc3RhbGwgdGhlIG1hdGNoaW5nIHN1YnNjcmlwdGlvblxuXHQgKiBvbiB0aGUgY2xpZW50LCBhbmQgcmV0dXJuIHRoZSBzbmFwc2hvdCB0byBpbmNsdWRlIGluIHRoZSBoYW5kc2hha2Vcblx0ICogcmVzcG9uc2UgKG9yIGB1bmRlZmluZWRgIGZvciBzdGF0ZWxlc3MgY2hhbm5lbHMgYW5kIG1pc3Npbmcgc3RhdGUpLlxuXHQgKlxuXHQgKiBTaWRlIGVmZmVjdHM6XG5cdCAqIC0gU3RhdGUgY2hhbm5lbHM6IHJlZ2lzdGVyIHdpdGggdGhlIGFnZW50IHNlcnZpY2UgYW5kIGNsZWFyIGFueVxuXHQgKiAgIHBlbmRpbmcgdG9vbC1jYWxsIGRpc2Nvbm5lY3QgdGltZW91dC5cblx0ICogLSBPVExQIGNoYW5uZWxzOiBpbnN0YWxsIHRoZSBjYW5vbmljYWwgZW50cnkgb24gdGhlIGNsaWVudCdzXG5cdCAqICAge0BsaW5rIElDb25uZWN0ZWRDbGllbnQuc3Vic2NyaXB0aW9uc30gbWFwLlxuXHQgKlxuXHQgKiBDaGFubmVscyB3aXRoIHVuc3VwcG9ydGVkIHNoYXBlcyAoZS5nLiBgYWhwLW90bHA6Ly9sb2dzL3ZlcmJvc2VgXG5cdCAqIHdpdGggbm8gcmVjb2duaXNlZCBsZXZlbCkgYXJlIHNpbGVudGx5IGRyb3BwZWQuIFZhbGlkIHN0YXRlIGNoYW5uZWxzXG5cdCAqIHJlbWFpbiBzdWJzY3JpYmVkIGV2ZW4gd2hlbiB0aGVpciBzbmFwc2hvdCBoYXMgbm90IG1hdGVyaWFsaXplZCB5ZXQuXG5cdCAqL1xuXHRwcml2YXRlIF9hZGRJbml0aWFsU3Vic2NyaXB0aW9uKGNsaWVudDogSUNvbm5lY3RlZENsaWVudCwgY2hhbm5lbDogc3RyaW5nKTogSVN0YXRlU25hcHNob3QgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN1YiA9IGNsYXNzaWZ5Q2hhbm5lbChjaGFubmVsKTtcblx0XHRpZiAoIXN1Yikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHN1Yi5raW5kID09PSBDaGFubmVsS2luZC5PdGxwTG9ncykge1xuXHRcdFx0aWYgKCF0aGlzLl9jb25maWcub3RscExvZ0VtaXR0ZXIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUHJvdG9jb2xTZXJ2ZXJdIElnbm9yaW5nIE9UTFAgaW5pdGlhbFN1YnNjcmlwdGlvbiAke2NoYW5uZWx9OiBubyBPVExQIGVtaXR0ZXIgY29uZmlndXJlZC5gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNsaWVudC5zdWJzY3JpcHRpb25zLnNldChzdWIudXJpLCBzdWIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc25hcHNob3QgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoY2hhbm5lbCk7XG5cdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuc2V0KHN1Yi51cmksIHN1Yik7XG5cdFx0dGhpcy5fYWdlbnRTZXJ2aWNlLmFkZFN1YnNjcmliZXIoVVJJLnBhcnNlKHN1Yi51cmkpLCBjbGllbnQuY2xpZW50SWQpO1xuXHRcdHRoaXMuX2NsZWFyQ2xpZW50VG9vbENhbGxEaXNjb25uZWN0VGltZW91dChjbGllbnQuY2xpZW50SWQsIHN1Yi51cmkpO1xuXHRcdHJldHVybiBzbmFwc2hvdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3J3YXJkcyBhIGNsaWVudCdzIHVwZ3JhZGUgcmVxdWVzdCB0byB0aGUgaG9zdGluZyBWUyBDb2RlIENMSSdzXG5cdCAqIEhUVFAgbWFuYWdlbWVudCBBUEkgKGFkdmVydGlzZWQgdmlhIHRoZSB7QGxpbmsgVlNDT0RFX0FHRU5UX0hPU1RfTUFOQUdFTUVOVF9TT0NLRVRfRU5WfSkuXG5cdCAqIFJldHVybnMgdGhlIENMSSdzIHBhcnNlZCByZXNwb25zZSB2ZXJiYXRpbSBzbyB0aGUgY2xpZW50IGNhbiByZW5kZXJcblx0ICogYSBtZWFuaW5nZnVsIHN0YXR1cyAoYWxyZWFkeSB1cC10by1kYXRlLCByZXN0YXJ0IHNjaGVkdWxlZCwgZXRjLikuXG5cdCAqXG5cdCAqIFdoZW4gdGhlIHNlcnZlciB3YXMgbm90IHNwYXduZWQgYnkgYSBtYW5hZ2luZyBDTEksIHJlc3BvbmRzIHdpdGhcblx0ICogYE1ldGhvZE5vdEZvdW5kYCBcdTIwMTQgdGhlIHVwZ3JhZGUgbWV0aG9kIGlzIG9ubHkgbWVhbmluZ2Z1bGx5IGNhbGxhYmxlXG5cdCAqIG9uIENMSS1ob3N0ZWQgc2VydmVycy5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZVZzY29kZVVwZ3JhZGUoaWQ6IG51bWJlciwgdHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQpOiB2b2lkIHtcblx0XHRjb25zdCBzb2NrZXRQYXRoID0gZ2V0QWdlbnRIb3N0TWFuYWdlbWVudFNvY2tldFBhdGgoKTtcblx0XHRpZiAoIXNvY2tldFBhdGgpIHtcblx0XHRcdHRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvcihcblx0XHRcdFx0aWQsXG5cdFx0XHRcdEpzb25ScGNFcnJvckNvZGVzLk1ldGhvZE5vdEZvdW5kLFxuXHRcdFx0XHRgTm8gdXBncmFkZSBzdXBlcnZpc29yIGlzIGF2YWlsYWJsZSBmb3IgdGhpcyBhZ2VudCBob3N0LmAsXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdHJhY2tSZXF1ZXN0KHJlcXVlc3RBZ2VudEhvc3RVcGdyYWRlKHNvY2tldFBhdGgpKS50aGVuKFxuXHRcdFx0KHJlc3VsdCkgPT4gdHJhbnNwb3J0LnNlbmQoanNvblJwY1N1Y2Nlc3MoaWQsIHJlc3VsdCkpLFxuXHRcdFx0KGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtQcm90b2NvbFNlcnZlcl0gdnNjb2RlVXBncmFkZSBzaWduYWwgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdFx0dHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yRnJvbShpZCwgZXJyKSk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSZWNvbm5lY3QoXG5cdFx0cGFyYW1zOiBSZWNvbm5lY3RQYXJhbXMsXG5cdFx0dHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQsXG5cdFx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0KTogeyBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQ7IHJlc3BvbnNlUHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiB9IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtQcm90b2NvbFNlcnZlcl0gUmVjb25uZWN0OiBjbGllbnRJZD0ke3BhcmFtcy5jbGllbnRJZH0sIGxhc3RTZWVuU2VxPSR7cGFyYW1zLmxhc3RTZWVuU2VydmVyU2VxfWApO1xuXHRcdGNvbnN0IGV4aXN0aW5nUmVjb3JkID0gdGhpcy5fY2xpZW50cy5nZXQocGFyYW1zLmNsaWVudElkKTtcblx0XHRpZiAoIWV4aXN0aW5nUmVjb3JkKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgUmVjb25uZWN0IGNsaWVudCBub3QgZm91bmQ6ICR7cGFyYW1zLmNsaWVudElkfWApO1xuXHRcdH1cblxuXHRcdC8vIFN5bmNocm9ub3VzbHkgaW5zdGFsbCB0aGUgY2xpZW50IHNvIG1lc3NhZ2VzIGFycml2aW5nIG9uIHRoaXMgdHJhbnNwb3J0XG5cdFx0Ly8gd2hpbGUgd2UgcmVzdG9yZSBzdWJzY3JpcHRpb25zIGNhbiBmaW5kIGEgdmFsaWQgY2xpZW50IG9iamVjdC4gVGhlXG5cdFx0Ly8gcmVjb25uZWN0IHJlc3BvbnNlIGlzIG9ubHkgc2VudCBvbmNlIGByZXNwb25zZVByb21pc2VgIHJlc29sdmVzIGJlbG93LlxuXHRcdGNvbnN0IHByaW9yVGVsZW1ldHJ5Q29udGV4dCA9IGV4aXN0aW5nUmVjb3JkLnN0YXRlID09PSAnYWN0aXZlJ1xuXHRcdFx0PyBleGlzdGluZ1JlY29yZC5jb25uZWN0aW9ucy5hdCgtMSk/LnRlbGVtZXRyeUNvbnRleHRcblx0XHRcdDogZXhpc3RpbmdSZWNvcmQudGVsZW1ldHJ5Q29udGV4dDtcblx0XHRjb25zdCBwcmlvclByb3RvY29sVmVyc2lvbiA9IGV4aXN0aW5nUmVjb3JkLnN0YXRlID09PSAnYWN0aXZlJ1xuXHRcdFx0PyBleGlzdGluZ1JlY29yZC5jb25uZWN0aW9ucy5hdCgtMSk/LnByb3RvY29sVmVyc2lvblxuXHRcdFx0OiBleGlzdGluZ1JlY29yZC5wcm90b2NvbFZlcnNpb247XG5cdFx0Y29uc3QgdGVsZW1ldHJ5VHJhbnNwb3J0VG9rZW4gPSB7fTtcblx0XHRjb25zdCBpbml0aWFsaXphdGlvbkRpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50ID0ge1xuXHRcdFx0Y2xpZW50SWQ6IHBhcmFtcy5jbGllbnRJZCxcblx0XHRcdGNsaWVudEluZm86IGV4aXN0aW5nUmVjb3JkLmNsaWVudEluZm8sXG5cdFx0XHR0ZWxlbWV0cnlDb250ZXh0OiB0aGlzLl9jcmVhdGVDbGllbnRUZWxlbWV0cnlDb250ZXh0KGV4aXN0aW5nUmVjb3JkLmNsaWVudEluZm8sIHBhcmFtcy5fbWV0YSwgdHJhbnNwb3J0LCBwcmlvclRlbGVtZXRyeUNvbnRleHQ/LmNvbm5lY3Rpb25LaW5kKSxcblx0XHRcdHByb3RvY29sVmVyc2lvbjogcHJpb3JQcm90b2NvbFZlcnNpb24gPz8gUFJPVE9DT0xfVkVSU0lPTixcblx0XHRcdHRyYW5zcG9ydCxcblx0XHRcdGNvbm5lY3Rpb25TdG9wV2F0Y2g6IFN0b3BXYXRjaC5jcmVhdGUodHJ1ZSksXG5cdFx0XHR0ZWxlbWV0cnlUcmFuc3BvcnRUb2tlbixcblx0XHRcdGlzUmVjb25uZWN0OiB0cnVlLFxuXHRcdFx0dGVsZW1ldHJ5Q29ubmVjdGlvbkFjdGl2ZTogZmFsc2UsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBuZXcgTWFwKCksXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGluaXRpYWxpemF0aW9uRGlzcG9zYWJsZXMsXG5cdFx0fTtcblx0XHR0aGlzLl9hdHRhY2hDb25uZWN0aW9uKHBhcmFtcy5jbGllbnRJZCwgY2xpZW50KTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gUmUtZXN0YWJsaXNoIHRoZSByZXZlcnNlLVJQQyBmaWxlc3lzdGVtIGF1dGhvcml0eSBmb3IgdGhpcyBjbGllbnQuXG5cdFx0XHQvLyBUaGUgcHJpb3IgdHJhbnNwb3J0J3MgYG9uQ2xvc2VgIGRpc3Bvc2VkIHRoZSBwcmV2aW91cyByZWdpc3RyYXRpb24sXG5cdFx0XHQvLyBzbyB3aXRob3V0IHRoaXMgc3RlcCBhbnkgc3Vic2VxdWVudCBgcmVzb3VyY2VSZWFkYCAvIGByZXNvdXJjZVdyaXRlYFxuXHRcdFx0Ly8gLyBldGMuIGZyb20gdGhlIGFnZW50IGhvc3Qgd291bGQgZmFpbCB3aXRoIFwibm8gY29ubmVjdGlvbiByZWdpc3RlcmVkXG5cdFx0XHQvLyBmb3IgYXV0aG9yaXR5XCIgdW50aWwgdGhlIGNsaWVudCBkaXNjb25uZWN0ZWQgYW5kIHJlLWluaXRpYWxpemVkLlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXJDbGllbnRGaWxlU3lzdGVtQXV0aG9yaXR5KHBhcmFtcy5jbGllbnRJZCwgaW5pdGlhbGl6YXRpb25EaXNwb3NhYmxlcyk7XG5cblx0XHRcdGNvbnN0IG9sZGVzdEJ1ZmZlcmVkID0gdGhpcy5fcmVwbGF5QnVmZmVyLmxlbmd0aCA+IDAgPyB0aGlzLl9yZXBsYXlCdWZmZXJbMF0uc2VydmVyU2VxIDogdGhpcy5fc3RhdGVNYW5hZ2VyLnNlcnZlclNlcTtcblx0XHRcdGNvbnN0IGNhblJlcGxheSA9IHBhcmFtcy5sYXN0U2VlblNlcnZlclNlcSA+PSBvbGRlc3RCdWZmZXJlZDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHRoaXMuX3Jlc3RvcmVSZWNvbm5lY3RTdWJzY3JpcHRpb25zKGNsaWVudCwgcGFyYW1zLCBjYW5SZXBsYXkpO1xuXG5cdFx0XHRjb25zdCBjb3VudHMgPSB0aGlzLl9jb25uZWN0aW9uVGVsZW1ldHJ5VHJhY2tlci5jb25uZWN0KHBhcmFtcy5jbGllbnRJZCwgdGVsZW1ldHJ5VHJhbnNwb3J0VG9rZW4pO1xuXHRcdFx0Y2xpZW50LnRlbGVtZXRyeUNvbm5lY3Rpb25BY3RpdmUgPSB0cnVlO1xuXHRcdFx0aWYgKGV4aXN0aW5nUmVjb3JkLnN0YXRlID09PSAnZ3JhY2UnKSB7XG5cdFx0XHRcdGV4aXN0aW5nUmVjb3JkLmRpc2Nvbm5lY3RUaW1lb3V0cy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudC5maXJlKHRoaXMuX2Nvbm5lY3RlZENsaWVudENvdW50KTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLmNsaWVudENvbm5lY3Rpb24oe1xuXHRcdFx0XHRhY3Rpb246ICdjb25uZWN0ZWQnLFxuXHRcdFx0XHRjb250ZXh0OiBjbGllbnQudGVsZW1ldHJ5Q29udGV4dCxcblx0XHRcdFx0Y2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCxcblx0XHRcdFx0Y2xpZW50SW1wbGVtZW50YXRpb25OYW1lOiBjbGllbnQuY2xpZW50SW5mbz8ubmFtZSxcblx0XHRcdFx0Y2xpZW50SW1wbGVtZW50YXRpb25WZXJzaW9uOiBjbGllbnQuY2xpZW50SW5mbz8udmVyc2lvbixcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBjbGllbnQucHJvdG9jb2xWZXJzaW9uLFxuXHRcdFx0XHQuLi5jb3VudHMsXG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHsgY2xpZW50LCByZXNwb25zZVByb21pc2UgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fcm9sbGJhY2tGYWlsZWRJbml0aWFsaXphdGlvbihjbGllbnQsIGV4aXN0aW5nUmVjb3JkKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXaXJlcyB0aGUgcmV2ZXJzZS1SUEMgZmlsZXN5c3RlbSBjYWxsYmFja3MgZm9yIGBjbGllbnRJZGAgYW5kIGJpbmRzXG5cdCAqIHRoZSB1bnJlZ2lzdGVyIHRvIGBkaXNwb3NhYmxlc2AgKHRoZSB0cmFuc3BvcnQncyBwZXItY29ubmVjdGlvblxuXHQgKiBzdG9yZSkuIFRoZSBjYWxsYmFja3MgZGlzcGF0Y2ggdGhyb3VnaCB7QGxpbmsgX3NlbmRSZXZlcnNlUmVxdWVzdH0sXG5cdCAqIHdoaWNoIGxvb2tzIHVwIHRoZSAqY3VycmVudCogY29ubmVjdGVkIGNsaWVudCBieSBpZCBcdTIwMTQgc28gcmUtYmluZGluZ1xuXHQgKiBhZnRlciBhIHJlY29ubmVjdCBwaWNrcyB1cCB0aGUgbmV3IHRyYW5zcG9ydCB3aXRob3V0IHJlYnVpbGRpbmcgdGhlXG5cdCAqIGNsb3N1cmVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJDbGllbnRGaWxlU3lzdGVtQXV0aG9yaXR5KGNsaWVudElkOiBzdHJpbmcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fY2xpZW50RmlsZVN5c3RlbVByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KGNsaWVudElkLCB7XG5cdFx0XHRyZXNvdXJjZUxpc3Q6ICh1cmkpID0+IHRoaXMuX3NlbmRSZXZlcnNlUmVxdWVzdChjbGllbnRJZCwgJ3Jlc291cmNlTGlzdCcsIHsgdXJpOiB1cmkudG9TdHJpbmcoKSB9KSxcblx0XHRcdHJlc291cmNlUmVhZDogKHVyaSkgPT4gdGhpcy5fc2VuZFJldmVyc2VSZXF1ZXN0KGNsaWVudElkLCAncmVzb3VyY2VSZWFkJywgeyB1cmk6IHVyaS50b1N0cmluZygpIH0pLFxuXHRcdFx0cmVzb3VyY2VXcml0ZTogKHBhcmFtc18pID0+IHRoaXMuX3NlbmRSZXZlcnNlUmVxdWVzdChjbGllbnRJZCwgJ3Jlc291cmNlV3JpdGUnLCBwYXJhbXNfKSxcblx0XHRcdHJlc291cmNlQ29weTogKHBhcmFtc18pID0+IHRoaXMuX3NlbmRSZXZlcnNlUmVxdWVzdChjbGllbnRJZCwgJ3Jlc291cmNlQ29weScsIHBhcmFtc18pLFxuXHRcdFx0cmVzb3VyY2VEZWxldGU6IChwYXJhbXNfKSA9PiB0aGlzLl9zZW5kUmV2ZXJzZVJlcXVlc3QoY2xpZW50SWQsICdyZXNvdXJjZURlbGV0ZScsIHBhcmFtc18pLFxuXHRcdFx0cmVzb3VyY2VNb3ZlOiAocGFyYW1zXykgPT4gdGhpcy5fc2VuZFJldmVyc2VSZXF1ZXN0KGNsaWVudElkLCAncmVzb3VyY2VNb3ZlJywgcGFyYW1zXyksXG5cdFx0XHRyZXNvdXJjZVJlcXVlc3Q6IChwYXJhbXNfKSA9PiB0aGlzLl9zZW5kUmV2ZXJzZVJlcXVlc3QoY2xpZW50SWQsICdyZXNvdXJjZVJlcXVlc3QnLCBwYXJhbXNfKSxcblx0XHRcdHJlc291cmNlUmVzb2x2ZTogKHBhcmFtc18pID0+IHRoaXMuX3NlbmRSZXZlcnNlUmVxdWVzdChjbGllbnRJZCwgJ3Jlc291cmNlUmVzb2x2ZScsIHBhcmFtc18pLFxuXHRcdFx0cmVzb3VyY2VNa2RpcjogKHBhcmFtc18pID0+IHRoaXMuX3NlbmRSZXZlcnNlUmVxdWVzdChjbGllbnRJZCwgJ3Jlc291cmNlTWtkaXInLCBwYXJhbXNfKSxcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtZXN0YWJsaXNoIGVhY2ggb2YgdGhlIGNsaWVudCdzIHByaW9yIHN1YnNjcmlwdGlvbnMgb24gdGhlIHNlcnZlciBzaWRlLlxuXHQgKiBVc2VzIHtAbGluayBJQWdlbnRTZXJ2aWNlLnN1YnNjcmliZX0gKHJhdGhlciB0aGFuIGEgYmFyZSBgYWRkU3Vic2NyaWJlcmBcblx0ICogKyBgZ2V0U25hcHNob3RgKSBzbyBhbnkgc2Vzc2lvbiBzdGF0ZSB0aGF0IHdhcyBldmljdGVkIHdoaWxlIHRoZSBjbGllbnRcblx0ICogd2FzIGRpc2Nvbm5lY3RlZCBpcyByZXN0b3JlZC4gUmV0dXJucyB0aGUgYXBwcm9wcmlhdGUgcmVjb25uZWN0IHJlc3BvbnNlXG5cdCAqIHBheWxvYWQgXHUyMDE0IGByZXBsYXlgIGFjdGlvbnMgd2hlbiB0aGUgY2xpZW50J3MgbGFzdC1zZWVuIHNlcSBpcyBzdGlsbCBpblxuXHQgKiB0aGUgYnVmZmVyLCBvdGhlcndpc2UgZnJlc2ggYHNuYXBzaG90YHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXN0b3JlUmVjb25uZWN0U3Vic2NyaXB0aW9ucyhcblx0XHRjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQsXG5cdFx0cGFyYW1zOiBSZWNvbm5lY3RQYXJhbXMsXG5cdFx0Y2FuUmVwbGF5OiBib29sZWFuLFxuXHQpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBtaXNzaW5nOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHNuYXBzaG90cyA9IGF3YWl0IFByb21pc2UuYWxsKHBhcmFtcy5zdWJzY3JpcHRpb25zLm1hcChhc3luYyBzdWIgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gc3ViLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBjbGFzc2lmaWVkID0gY2xhc3NpZnlDaGFubmVsKGtleSk7XG5cdFx0XHRpZiAoIWNsYXNzaWZpZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChjbGFzc2lmaWVkLmtpbmQgPT09IENoYW5uZWxLaW5kLk90bHBMb2dzKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fY29uZmlnLm90bHBMb2dFbWl0dGVyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUHJvdG9jb2xTZXJ2ZXJdIFJlY29ubmVjdDogZHJvcHBpbmcgT1RMUCBzdWJzY3JpcHRpb24gJHtrZXl9OiBubyBPVExQIGVtaXR0ZXIgY29uZmlndXJlZC5gKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFN0YXRlbGVzczogcmUtaW5zdGFsbCB3aXRob3V0IGdvaW5nIHRocm91Z2ggdGhlIGFnZW50IHNlcnZpY2UuXG5cdFx0XHRcdGNsaWVudC5zdWJzY3JpcHRpb25zLnNldChjbGFzc2lmaWVkLnVyaSwgY2xhc3NpZmllZCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2xhc3NpZmllZC5raW5kID09PSBDaGFubmVsS2luZC5SZXNvdXJjZVdhdGNoKSB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSB0aGlzLl9hZ2VudFNlcnZpY2Uub25SZXNvdXJjZVdhdGNoU3Vic2NyaWJlZChjbGFzc2lmaWVkLnVyaSk7XG5cdFx0XHRcdGlmICghZGVzY3JpcHRvcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1Byb3RvY29sU2VydmVyXSBSZWNvbm5lY3Q6IHJlc291cmNlIHdhdGNoICR7a2V5fSBubyBsb25nZXIgcGFyc2VzYCk7XG5cdFx0XHRcdFx0bWlzc2luZy5wdXNoKHN1Yik7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjbGllbnQuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NpZmllZC51cmksIGNsYXNzaWZpZWQpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlc291cmNlOiBjbGFzc2lmaWVkLnVyaSxcblx0XHRcdFx0XHRzdGF0ZTogZGVzY3JpcHRvcixcblx0XHRcdFx0XHRmcm9tU2VxOiB0aGlzLl9zdGF0ZU1hbmFnZXIuc2VydmVyU2VxLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCB0aGlzLl9hZ2VudFNlcnZpY2Uuc3Vic2NyaWJlKFVSSS5wYXJzZShrZXkpLCBjbGllbnQuY2xpZW50SWQpO1xuXHRcdFx0XHRjbGllbnQuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NpZmllZC51cmksIGNsYXNzaWZpZWQpO1xuXHRcdFx0XHR0aGlzLl9jbGVhckNsaWVudFRvb2xDYWxsRGlzY29ubmVjdFRpbWVvdXQoY2xpZW50LmNsaWVudElkLCBjbGFzc2lmaWVkLnVyaSk7XG5cdFx0XHRcdHJldHVybiBzbmFwc2hvdDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtQcm90b2NvbFNlcnZlcl0gUmVjb25uZWN0OiBmYWlsZWQgdG8gcmVzdG9yZSBzdWJzY3JpcHRpb24gJHtrZXl9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdFx0bWlzc2luZy5wdXNoKHN1Yik7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVjb25jaWxlQWN0aXZlQ2xpZW50c0FmdGVyUmVjb25uZWN0KGNsaWVudCk7XG5cblx0XHRpZiAoY2FuUmVwbGF5KSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGVudmVsb3BlIG9mIHRoaXMuX3JlcGxheUJ1ZmZlcikge1xuXHRcdFx0XHRpZiAoZW52ZWxvcGUuc2VydmVyU2VxID4gcGFyYW1zLmxhc3RTZWVuU2VydmVyU2VxKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzUmVsZXZhbnRUb0NsaWVudChjbGllbnQsIGVudmVsb3BlKSkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKGVudmVsb3BlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHR5cGU6ICdyZXBsYXknLCBhY3Rpb25zLCBtaXNzaW5nIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHR5cGU6ICdzbmFwc2hvdCcsIHNuYXBzaG90czogc25hcHNob3RzLmZpbHRlcigocyk6IHMgaXMgSVN0YXRlU25hcHNob3QgPT4gcyAhPT0gdW5kZWZpbmVkKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbGVhc2UgYSBjbGllbnQgZnJvbSBldmVyeSBzZXNzaW9uIHdoZXJlIGl0IGlzIHN0aWxsIGFuIGFjdGl2ZSBjbGllbnRcblx0ICogYnV0IGRpZCBub3QgcmVzdWJzY3JpYmUgZHVyaW5nIGEgcmVjb25uZWN0LiBUaGUgc2V0IG9mIHJlc3Vic2NyaWJlZFxuXHQgKiBzZXNzaW9ucyBpcyBnYXRoZXJlZCBmcm9tIGV2ZXJ5IGxpdmUgY29ubmVjdGlvbiB0aGUgY2xpZW50IGN1cnJlbnRseVxuXHQgKiBob2xkcyAobm90IGp1c3QgdGhlIHJlY29ubmVjdGluZyBvbmUpIHNvIGFuIG92ZXJsYXBwaW5nIGNvbm5lY3Rpb24gdGhhdFxuXHQgKiBzdGlsbCBzdWJzY3JpYmVzIHRvIGEgc2Vzc2lvbiBrZWVwcyB0aGUgY2xpZW50IGFjdGl2ZSB0aGVyZS5cblx0ICovXG5cdHByaXZhdGUgX3JlY29uY2lsZUFjdGl2ZUNsaWVudHNBZnRlclJlY29ubmVjdChjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQpOiB2b2lkIHtcblx0XHRjb25zdCByZWNvcmQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnQuY2xpZW50SWQpO1xuXHRcdGNvbnN0IHJlc3Vic2NyaWJlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgY29ubmVjdGlvbiBvZiByZWNvcmQ/LnN0YXRlID09PSAnYWN0aXZlJyA/IHJlY29yZC5jb25uZWN0aW9ucyA6IFtjbGllbnRdKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHN1YiBvZiBjb25uZWN0aW9uLnN1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKHN1Yi5raW5kID09PSBDaGFubmVsS2luZC5TdGF0ZSkge1xuXHRcdFx0XHRcdHJlc3Vic2NyaWJlZC5hZGQoc3ViLnVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uVXJpcygpKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik7XG5cdFx0XHRpZiAoc3RhdGUgJiYgdGhpcy5faXNBY3RpdmVDbGllbnQoc3RhdGUsIGNsaWVudC5jbGllbnRJZCkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGF0IG9mIHN0YXRlLmNoYXRzKSB7XG5cdFx0XHRcdFx0aWYgKCFyZXN1YnNjcmliZWQuaGFzKHNlc3Npb24pICYmICFyZXN1YnNjcmliZWQuaGFzKGNoYXQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZWxlYXNlQWN0aXZlQ2xpZW50Rm9yU2Vzc2lvbihzZXNzaW9uLCBjbGllbnQuY2xpZW50SWQsIGNoYXQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUNsaWVudERpc2Nvbm5lY3RlZChjbGllbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVjb3JkID0gdGhpcy5fY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuXHRcdGlmIChyZWNvcmQ/LnN0YXRlID09PSAnZ3JhY2UnKSB7XG5cdFx0XHRyZWNvcmQuZGlzY29ubmVjdFRpbWVvdXRzLnNldCgnbWFuYWdlZC1zZXR0aW5ncycsIGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0cmVjb3JkLmRpc2Nvbm5lY3RUaW1lb3V0cy5kZWxldGVBbmREaXNwb3NlKCdtYW5hZ2VkLXNldHRpbmdzJyk7XG5cdFx0XHRcdHRoaXMuX21hbmFnZWRTZXR0aW5nc1NlcnZpY2UucmVtb3ZlQ2xpZW50UGVybWlzc2lvbnModGhpcy5fbWFuYWdlZFNldHRpbmdzQ29udHJpYnV0aW9uSWQoY2xpZW50SWQpKTtcblx0XHRcdH0sIENMSUVOVF9UT09MX0NBTExfRElTQ09OTkVDVF9USU1FT1VUKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblVyaXMoKSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pO1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBzdGF0ZSA/IHRoaXMuX2lzQWN0aXZlQ2xpZW50KHN0YXRlLCBjbGllbnRJZCkgOiBmYWxzZTtcblx0XHRcdGNvbnN0IG93bnNQZW5kaW5nVG9vbENhbGwgPSBzdGF0ZSA/IHRoaXMuX2hhc1BlbmRpbmdDbGllbnRUb29sQ2FsbChzdGF0ZSwgY2xpZW50SWQpIDogZmFsc2U7XG5cdFx0XHQvLyBLZWVwIHRoZSBjbGllbnQgbWFya2VkIGFjdGl2ZSBkdXJpbmcgdGhlIGdyYWNlIHdpbmRvdyBzbyBhIHF1aWNrXG5cdFx0XHQvLyByZWNvbm5lY3QgdGhhdCByZXN1YnNjcmliZXMgY2FuIHJldGFpbiBpdHMgc2xvdC4gVGhlIGRpc2Nvbm5lY3Rcblx0XHRcdC8vIHRpbWVvdXQgcmVtb3ZlcyB0aGUgYWN0aXZlIGNsaWVudCAoYW5kIGZhaWxzIGl0cyBwZW5kaW5nIHRvb2xcblx0XHRcdC8vIGNhbGxzKSBpZiBpdCBuZXZlciByZXR1cm5zOyBhbiBleHBsaWNpdCB1bnN1YnNjcmliZSBvciBhXG5cdFx0XHQvLyByZWNvbm5lY3Qgd2l0aG91dCByZXN1YnNjcmlwdGlvbiByZW1vdmVzIGl0IHNvb25lci5cblx0XHRcdGlmIChpc0FjdGl2ZSB8fCBvd25zUGVuZGluZ1Rvb2xDYWxsKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhdCBvZiBzdGF0ZT8uY2hhdHMgPz8gW10pIHtcblx0XHRcdFx0XHR0aGlzLl9zdGFydENsaWVudFRvb2xDYWxsRGlzY29ubmVjdFRpbWVvdXQoY2xpZW50SWQsIHNlc3Npb24sIGNoYXQucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIFdoZXRoZXIgYGNsaWVudElkYCBpcyBvbmUgb2YgdGhlIHNlc3Npb24ncyBhY3RpdmUgY2xpZW50cy4gKi9cblx0cHJpdmF0ZSBfaXNBY3RpdmVDbGllbnQoc3RhdGU6IFNlc3Npb25TdGF0ZSwgY2xpZW50SWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzdGF0ZS5hY3RpdmVDbGllbnRzLnNvbWUoYyA9PiBjLmNsaWVudElkID09PSBjbGllbnRJZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIGBjbGllbnRJZGAgZnJvbSBhIHNlc3Npb24ncyBhY3RpdmUgY2xpZW50cywgaWYgcHJlc2VudC4gRGlzcGF0Y2hlZFxuXHQgKiBhcyBhIHNlcnZlciBhY3Rpb24gc28gdGhlIHJlbW92YWwgaXMgcmVmbGVjdGVkIGluIHN0YXRlIGFuZCBicm9hZGNhc3QgdG9cblx0ICogdGhlIHJlbWFpbmluZyBzdWJzY3JpYmVycy5cblx0ICovXG5cdHByaXZhdGUgX3JlbW92ZUFjdGl2ZUNsaWVudChzZXNzaW9uOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik7XG5cdFx0aWYgKHN0YXRlICYmIHRoaXMuX2lzQWN0aXZlQ2xpZW50KHN0YXRlLCBjbGllbnRJZCkpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFJlbW92ZWQsXG5cdFx0XHRcdGNsaWVudElkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbGVhc2UgYSBjbGllbnQgZnJvbSBhIHNlc3Npb246IGNsZWFyIGl0cyBwZW5kaW5nIGRpc2Nvbm5lY3QgdGltZW91dCxcblx0ICogZmFpbCBhbnkgY2xpZW50IHRvb2wgY2FsbHMgaXQgc3RpbGwgb3ducywgYW5kIHJlbW92ZSBpdCBmcm9tIHRoZSBhY3RpdmVcblx0ICogY2xpZW50cy4gVXNlZCBieSB0aGUgZXhwbGljaXQtdW5zdWJzY3JpYmUgYW5kIHJlY29ubmVjdC1yZWNvbmNpbGlhdGlvblxuXHQgKiBwYXRocyB0byBkcm9wIGEgY2xpZW50IHRoYXQgaGFzIGxlZnQgYSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVsZWFzZUFjdGl2ZUNsaWVudEZvclNlc3Npb24oc2Vzc2lvbjogc3RyaW5nLCBjbGllbnRJZDogc3RyaW5nLCBjaGF0Q2hhbm5lbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXJDbGllbnRUb29sQ2FsbERpc2Nvbm5lY3RUaW1lb3V0KGNsaWVudElkLCBjaGF0Q2hhbm5lbCk7XG5cdFx0dGhpcy5fY29tcGxldGVEaXNjb25uZWN0ZWRDbGllbnRUb29sQ2FsbHMoY2xpZW50SWQsIHNlc3Npb24sIGNoYXRDaGFubmVsKTtcblx0XHR0aGlzLl9yZW1vdmVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgY2xpZW50SWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFlpZWxkcyBldmVyeSBzdGlsbC1wZW5kaW5nIGNsaWVudC1jb250cmlidXRlZCB0b29sIGNhbGwgaW4gYHN0YXRlYCdzXG5cdCAqIGFjdGl2ZSB0dXJuLCBwYWlyZWQgd2l0aCBpdHMgb3duaW5nIGBjbGllbnRJZGAuIFNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGhcblx0ICogZm9yIHRoZSBkaXNjb25uZWN0LWdyYWNlIG1hY2hpbmVyeTogZGV0ZWN0IG93bmVyc2hpcFxuXHQgKiAoe0BsaW5rIF9oYXNQZW5kaW5nQ2xpZW50VG9vbENhbGx9KSwgYXJtIHRpbWVvdXRzXG5cdCAqICh7QGxpbmsgX2NoZWNrT3JwaGFuZWRDbGllbnRUb29sQ2FsbHN9KSwgYW5kIGZhaWwgb3JwaGFuZWQgY2FsbHNcblx0ICogKHtAbGluayBfY29tcGxldGVEaXNjb25uZWN0ZWRDbGllbnRUb29sQ2FsbHN9KS5cblx0ICovXG5cdHByaXZhdGUgKl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzKHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGFjdGl2ZVR1cm4gPSBzdGF0ZT8uYWN0aXZlVHVybjtcblx0XHRpZiAoIWFjdGl2ZVR1cm4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGFjdGl2ZVR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0aWYgKHBhcnQua2luZCAhPT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvb2xDYWxsID0gcGFydC50b29sQ2FsbDtcblx0XHRcdGNvbnN0IGNvbnRyaWJ1dG9yID0gdG9vbENhbGwuY29udHJpYnV0b3I7XG5cdFx0XHRpZiAoY29udHJpYnV0b3I/LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCAmJiBpc1BlbmRpbmdUb29sQ2FsbFN0YXR1cyh0b29sQ2FsbC5zdGF0dXMpKSB7XG5cdFx0XHRcdHlpZWxkIHsgdG9vbENhbGwsIGNsaWVudElkOiBjb250cmlidXRvci5jbGllbnRJZCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhc1BlbmRpbmdDbGllbnRUb29sQ2FsbChzdGF0ZTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQgfCB1bmRlZmluZWQsIGNsaWVudElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgdGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscyhzdGF0ZSkpIHtcblx0XHRcdGlmIChwZW5kaW5nLmNsaWVudElkID09PSBjbGllbnRJZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzUmVwbGFjZW1lbnRBY3RpdmVDbGllbnRUb29sKHN0YXRlOiBTZXNzaW9uU3RhdGUsIGNsaWVudElkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc3RhdGUuYWN0aXZlQ2xpZW50cy5zb21lKGNsaWVudCA9PlxuXHRcdFx0Y2xpZW50LmNsaWVudElkICE9PSBjbGllbnRJZFxuXHRcdFx0JiYgY2xpZW50LnRvb2xzLnNvbWUodG9vbCA9PiB0b29sLm5hbWUgPT09IHRvb2xOYW1lKSk7XG5cdH1cblxuXHQvKipcblx0ICogQXJtIChvciByZS1hcm0pIHRoZSBwZXItKGNsaWVudElkLCBzZXNzaW9uKSB0aW1lb3V0IHRoYXQgZmFpbHMgcGVuZGluZ1xuXHQgKiBjbGllbnQgdG9vbCBjYWxscyBvd25lZCBieSBgY2xpZW50SWRgIGlmIGl0IGRvZXMgbm90IHJlY29ubmVjdCBiZWZvcmUgdGhlXG5cdCAqIGdyYWNlIHdpbmRvdyBlbGFwc2VzLiBPbmx5IG1lYW5pbmdmdWwgZm9yIGEgY2xpZW50IHdpdGggbm8gbGl2ZSB0cmFuc3BvcnQ6XG5cdCAqIGEgY29ubmVjdGVkIGNsaWVudCBpcyBoYW5kbGVkIGJ5IHtAbGluayBfYXR0YWNoQ29ubmVjdGlvbn0sIHdoaWNoIGRpc3Bvc2VzXG5cdCAqIGFueSBhcm1lZCB0aW1lcnMsIHNvIHRoaXMgaXMgYSBuby1vcCB3aGVuIHRoZSBjbGllbnQgaXMgYWN0aXZlLiBUaGUgZGVsYXlcblx0ICogaXMgdGhlIHJlbWFpbmluZyBncmFjZSBtZWFzdXJlZCBmcm9tIHdoZW4gdGhlIGNsaWVudCBkaXNjb25uZWN0ZWQgXHUyMDE0IHNvIGFcblx0ICogY2xpZW50IHRoYXQgZGlzY29ubmVjdGVkIGEgd2hpbGUgYmVmb3JlIHRoZSBjYWxsIHdhcyBpc3N1ZWQgZ2V0cyB0aGVcblx0ICogcmVzaWR1YWwgd2luZG93IHJhdGhlciB0aGFuIGEgZnJlc2ggb25lLCBhbmQgYSBzdGFtcCBmcm9tIGEgbG9uZy1kaXNjb25uZWN0ZWRcblx0ICogY2xpZW50IGZhaWxzIHByb21wdGx5LiBSZS1hcm1zIHRyaWdnZXJlZCBieSBsYXRlciBvcnBoYW5lZCB0b29sIGNhbGxzIGluIHRoZVxuXHQgKiBzYW1lIHNlc3Npb24gc2hyaW5rIHRoZSByZW1haW5pbmcgd2luZG93IGluc3RlYWQgb2YgcmVzZXR0aW5nIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRDbGllbnRUb29sQ2FsbERpc2Nvbm5lY3RUaW1lb3V0KGNsaWVudElkOiBzdHJpbmcsIHNlc3Npb246IHN0cmluZywgY2hhdENoYW5uZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlY29yZCA9IHRoaXMuX2Vuc3VyZUdyYWNlUmVjb3JkKGNsaWVudElkKTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0Ly8gQ2xpZW50IGlzIGNvbm5lY3RlZDsgdGhlIGdyYWNlIG1hY2hpbmVyeSBkb2VzIG5vdCBhcHBseS5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVjb3JkLmRpc2Nvbm5lY3RUaW1lb3V0cy5kZWxldGVBbmREaXNwb3NlKGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBlbGFwc2VkID0gRGF0ZS5ub3coKSAtIHJlY29yZC5sYXN0U2VlbkF0O1xuXHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5tYXgoMCwgQ0xJRU5UX1RPT0xfQ0FMTF9ESVNDT05ORUNUX1RJTUVPVVQgLSBlbGFwc2VkKTtcblx0XHRyZWNvcmQuZGlzY29ubmVjdFRpbWVvdXRzLnNldChjaGF0Q2hhbm5lbCwgZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVsZWFzZUFjdGl2ZUNsaWVudEZvclNlc3Npb24oc2Vzc2lvbiwgY2xpZW50SWQsIGNoYXRDaGFubmVsKTtcblx0XHR9LCBkZWxheSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNjYW4gYSBjaGF0IGZvciBwZW5kaW5nIGNsaWVudCB0b29sIGNhbGxzIG93bmVkIGJ5IGEgZGlzY29ubmVjdGVkIGNsaWVudFxuXHQgKiBvZiB0aGlzIHByb3RvY29sIHNlcnZlciwgYW5kIGFybSB0aGUgZGlzY29ubmVjdCB0aW1lb3V0IGZvciBlYWNoIG93bmVyLlxuXHQgKiBDYWxsZWQgd2hlbiBhIGBDaGF0VG9vbENhbGxTdGFydGAgLyBgQ2hhdFRvb2xDYWxsUmVhZHlgIGVudmVsb3BlIGlzXG5cdCAqIG9ic2VydmVkIFx1MjAxNCBjb3ZlcmluZyBjYWxscyBpc3N1ZWQgZm9yIGFuIGFscmVhZHktZ29uZSBjbGllbnQsIHdoaWNoIHRoZVxuXHQgKiBsaXZlIGRpc2Nvbm5lY3QgcGF0aCBuZXZlciBzZWVzLiBPd25lcmxlc3MgY2xpZW50IHRvb2wgY2FsbHMgKG5vIGNsaWVudFxuXHQgKiBjb25uZWN0ZWQgYXQgc3RhbXAgdGltZSkgYXJlIGZhaWxlZCBpbW1lZGlhdGVseSBieSB0aGUgcHJvdmlkZXIsIHNvIHRoZXlcblx0ICogbmV2ZXIgcmVhY2ggYSBwZW5kaW5nIHN0YXRlIGhlcmUuIFVua25vd24gY2xpZW50IGlkcyBhcmUgaWdub3JlZCBiZWNhdXNlXG5cdCAqIHRoZXkgbWF5IGJlbG9uZyB0byBhbm90aGVyIHRyYW5zcG9ydCBzdWNoIGFzIGxvY2FsIElQQy5cblx0ICovXG5cdHByaXZhdGUgX2NoZWNrT3JwaGFuZWRDbGllbnRUb29sQ2FsbHMoc2Vzc2lvbjogc3RyaW5nLCBjaGF0Q2hhbm5lbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBvcnBoYW5Pd25lcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHsgY2xpZW50SWQgfSBvZiB0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzKHN0YXRlKSkge1xuXHRcdFx0Y29uc3Qgb3duZXJSZWNvcmQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnRJZCk7XG5cdFx0XHRpZiAob3duZXJSZWNvcmQ/LnN0YXRlID09PSAnZ3JhY2UnKSB7XG5cdFx0XHRcdG9ycGhhbk93bmVycy5hZGQoY2xpZW50SWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IG93bmVySWQgb2Ygb3JwaGFuT3duZXJzKSB7XG5cdFx0XHR0aGlzLl9zdGFydENsaWVudFRvb2xDYWxsRGlzY29ubmVjdFRpbWVvdXQob3duZXJJZCwgc2Vzc2lvbiwgY2hhdENoYW5uZWwpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBhIGZyZXNobHkgY29ubmVjdGVkIChvciByZWNvbm5lY3RlZCkgdHJhbnNwb3J0IGZvciBgY2xpZW50SWRgLFxuXHQgKiBwcm9tb3RpbmcgdGhlIHJlY29yZCB0byB7QGxpbmsgSUFjdGl2ZUNsaWVudFJlY29yZH0uIFByb21vdGluZyBhIGdyYWNlXG5cdCAqIHJlY29yZCBiYWNrIHRvIGFjdGl2ZSBkaXNwb3NlcyBpdHMgcGVuZGluZyBkaXNjb25uZWN0IHRpbWVyczogdGhlXG5cdCAqIGRpc2Nvbm5lY3QtZ3JhY2Ugd2luZG93IG9ubHkgYXBwbGllcyB3aGlsZSB0aGUgY2xpZW50IGhhcyBubyBsaXZlXG5cdCAqIHRyYW5zcG9ydC4gVGhpcyBpcyB0aGUgc2luZ2xlIHBsYWNlIHRoYXQgbWFpbnRhaW5zIHRoZSBcImFjdGl2ZSByZWNvcmRzXG5cdCAqIGhvbGQgbm8gZ3JhY2UgdGltZXJzXCIgaW52YXJpYW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfYXR0YWNoQ29ubmVjdGlvbihjbGllbnRJZDogc3RyaW5nLCBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQpOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NsaWVudHMuZ2V0KGNsaWVudElkKTtcblx0XHRpZiAoZXhpc3Rpbmc/LnN0YXRlID09PSAnYWN0aXZlJykge1xuXHRcdFx0ZXhpc3RpbmcuY29ubmVjdGlvbnMucHVzaChjbGllbnQpO1xuXHRcdFx0ZXhpc3RpbmcuY2xpZW50SW5mbyA9IGNsaWVudC5jbGllbnRJbmZvID8/IGV4aXN0aW5nLmNsaWVudEluZm87XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NsaWVudHMuc2V0KGNsaWVudElkLCB7IHN0YXRlOiAnYWN0aXZlJywgY2xpZW50SW5mbzogY2xpZW50LmNsaWVudEluZm8gPz8gZXhpc3Rpbmc/LmNsaWVudEluZm8sIGNvbm5lY3Rpb25zOiBbY2xpZW50XSB9KTtcblx0XHR9XG5cdFx0dGhpcy5fcHJ1bmVDbGllbnRSZWNvcmRzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yb2xsYmFja0ZhaWxlZEluaXRpYWxpemF0aW9uKGNsaWVudDogSUNvbm5lY3RlZENsaWVudCwgcHJldmlvdXNSZWNvcmQ6IElDbGllbnRSZWNvcmQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWNvcmQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnQuY2xpZW50SWQpO1xuXHRcdGlmIChyZWNvcmQ/LnN0YXRlID09PSAnYWN0aXZlJykge1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbkluZGV4ID0gcmVjb3JkLmNvbm5lY3Rpb25zLmluZGV4T2YoY2xpZW50KTtcblx0XHRcdGlmIChjb25uZWN0aW9uSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHJlY29yZC5jb25uZWN0aW9ucy5zcGxpY2UoY29ubmVjdGlvbkluZGV4LCAxKTtcblx0XHRcdFx0dGhpcy5fcmVsZWFzZUNsaWVudFN1YnNjcmlwdGlvbnMoY2xpZW50LCByZWNvcmQpO1xuXHRcdFx0XHR0aGlzLl9yZWplY3RQZW5kaW5nUmV2ZXJzZVJlcXVlc3RzRm9yQ29ubmVjdGlvbihjbGllbnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlY29yZC5jb25uZWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0aWYgKHByZXZpb3VzUmVjb3JkPy5zdGF0ZSA9PT0gJ2dyYWNlJykge1xuXHRcdFx0XHRcdHRoaXMuX2NsaWVudHMuc2V0KGNsaWVudC5jbGllbnRJZCwgcHJldmlvdXNSZWNvcmQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2NsaWVudHMuZGVsZXRlKGNsaWVudC5jbGllbnRJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y2xpZW50LmluaXRpYWxpemF0aW9uRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgZXhpc3RpbmcgZ3JhY2UgcmVjb3JkIGZvciBgY2xpZW50SWRgLCBjcmVhdGluZyBvbmUgZm9yIGFcblx0ICogbmV2ZXItY29ubmVjdGVkIGNsaWVudCAoYW4gb3JwaGFuIHRvb2wtY2FsbCBzdGFtcCkuIFJldHVybnMgYHVuZGVmaW5lZGBcblx0ICogd2hlbiB0aGUgY2xpZW50IGlzIGN1cnJlbnRseSBhY3RpdmUgXHUyMDE0IHRoZSBncmFjZSBtYWNoaW5lcnkgZG9lcyBub3QgYXBwbHlcblx0ICogdG8gYSBjb25uZWN0ZWQgY2xpZW50LiBBIG5ld2x5IGNyZWF0ZWQgcmVjb3JkIHBpbnMgaXRzIGdyYWNlIGNsb2NrIHRvIG5vdy5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZUdyYWNlUmVjb3JkKGNsaWVudElkOiBzdHJpbmcpOiBJR3JhY2VDbGllbnRSZWNvcmQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlY29yZCA9IHRoaXMuX2NsaWVudHMuZ2V0KGNsaWVudElkKTtcblx0XHRpZiAocmVjb3JkPy5zdGF0ZSA9PT0gJ2FjdGl2ZScpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChyZWNvcmQpIHtcblx0XHRcdHJldHVybiByZWNvcmQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNyZWF0ZWQ6IElHcmFjZUNsaWVudFJlY29yZCA9IHtcblx0XHRcdHN0YXRlOiAnZ3JhY2UnLFxuXHRcdFx0Y2xpZW50SW5mbzogdW5kZWZpbmVkLFxuXHRcdFx0dGVsZW1ldHJ5Q29udGV4dDogdW5kZWZpbmVkLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiB1bmRlZmluZWQsXG5cdFx0XHRsYXN0U2VlbkF0OiBEYXRlLm5vdygpLFxuXHRcdFx0ZGlzY29ubmVjdFRpbWVvdXRzOiBuZXcgRGlzcG9zYWJsZU1hcCgpLFxuXHRcdH07XG5cdFx0dGhpcy5fY2xpZW50cy5zZXQoY2xpZW50SWQsIGNyZWF0ZWQpO1xuXHRcdHJldHVybiBjcmVhdGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZlQ2xpZW50KGNsaWVudElkOiBzdHJpbmcpOiBJQ29ubmVjdGVkQ2xpZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QWN0aXZlQ2xpZW50RnJvbVJlY29yZCh0aGlzLl9jbGllbnRzLmdldChjbGllbnRJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZlQ2xpZW50RnJvbVJlY29yZChyZWNvcmQ6IElDbGllbnRSZWNvcmQgfCB1bmRlZmluZWQpOiBJQ29ubmVjdGVkQ2xpZW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmVjb3JkPy5zdGF0ZSAhPT0gJ2FjdGl2ZScpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiByZWNvcmQuY29ubmVjdGlvbnNbcmVjb3JkLmNvbm5lY3Rpb25zLmxlbmd0aCAtIDFdO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVsZWFzZUNsaWVudFN1YnNjcmlwdGlvbnMoY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LCByZWNvcmQ6IElBY3RpdmVDbGllbnRSZWNvcmQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHN1YiBvZiBjbGllbnQuc3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHN1Yi5raW5kID09PSBDaGFubmVsS2luZC5TdGF0ZSkge1xuXHRcdFx0XHRpZiAodGhpcy5faGFzU3Vic2NyaXB0aW9uSW5PdGhlckNvbm5lY3Rpb24ocmVjb3JkLCBjbGllbnQsIHN1Yi51cmkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYWdlbnRTZXJ2aWNlLnVuc3Vic2NyaWJlKFVSSS5wYXJzZShzdWIudXJpKSwgY2xpZW50LmNsaWVudElkKTtcblx0XHRcdH0gZWxzZSBpZiAoc3ViLmtpbmQgPT09IENoYW5uZWxLaW5kLlJlc291cmNlV2F0Y2gpIHtcblx0XHRcdFx0dGhpcy5fYWdlbnRTZXJ2aWNlLm9uUmVzb3VyY2VXYXRjaFVuc3Vic2NyaWJlZChzdWIudXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc1N1YnNjcmlwdGlvbkluT3RoZXJDb25uZWN0aW9uKHJlY29yZDogSUNsaWVudFJlY29yZCwgY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LCB1cmk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChyZWNvcmQuc3RhdGUgIT09ICdhY3RpdmUnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgb3RoZXIgb2YgcmVjb3JkLmNvbm5lY3Rpb25zKSB7XG5cdFx0XHRpZiAob3RoZXIgIT09IGNsaWVudCAmJiBvdGhlci5zdWJzY3JpcHRpb25zLmhhcyh1cmkpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKiogTnVtYmVyIG9mIGNsaWVudHMgdGhhdCBjdXJyZW50bHkgaGF2ZSBhIGxpdmUgY29ubmVjdGlvbi4gKi9cblx0cHJpdmF0ZSBnZXQgX2Nvbm5lY3RlZENsaWVudENvdW50KCk6IG51bWJlciB7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IHJlY29yZCBvZiB0aGlzLl9jbGllbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAocmVjb3JkLnN0YXRlID09PSAnYWN0aXZlJykge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY291bnQ7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDbGllbnRUZWxlbWV0cnlDb250ZXh0KGNsaWVudEluZm86IEltcGxlbWVudGF0aW9uIHwgdW5kZWZpbmVkLCBtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCwgdHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQsIGZhbGxiYWNrQ29ubmVjdGlvbktpbmQgPSBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZC5Vbmtub3duKTogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25LaW5kID0gcmVhZENsaWVudENvbm5lY3Rpb25LaW5kKG1ldGEpO1xuXHRcdGNvbnN0IG1hY2hpbmVJZCA9IHJlYWRDbGllbnRNYWNoaW5lSWQobWV0YSk7XG5cdFx0Y29uc3QgZGV2RGV2aWNlSWQgPSByZWFkQ2xpZW50RGV2RGV2aWNlSWQobWV0YSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNsaWVudFR5cGU6IGdldEFnZW50SG9zdENsaWVudFR5cGUoY2xpZW50SW5mbyksXG5cdFx0XHRjb25uZWN0aW9uS2luZDogY29ubmVjdGlvbktpbmQgPT09IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLlVua25vd24gPyBmYWxsYmFja0Nvbm5lY3Rpb25LaW5kIDogY29ubmVjdGlvbktpbmQsXG5cdFx0XHR0cmFuc3BvcnRLaW5kOiB0cmFuc3BvcnQudHJhbnNwb3J0S2luZCA/PyBBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLlVua25vd24sXG5cdFx0XHRob3N0TGF1bmNoS2luZDogdGhpcy5fY29uZmlnLmhvc3RMYXVuY2hLaW5kID8/IEFnZW50SG9zdExhdW5jaEtpbmQuVW5rbm93bixcblx0XHRcdC4uLihtYWNoaW5lSWQgPyB7IG1hY2hpbmVJZCB9IDoge30pLFxuXHRcdFx0Li4uKGRldkRldmljZUlkID8geyBkZXZEZXZpY2VJZCB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9yZXBvcnRDbGllbnREaXNjb25uZWN0ZWQoY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LCBzdWJzY3JpcHRpb25Db3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCFjbGllbnQudGVsZW1ldHJ5Q29ubmVjdGlvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjbGllbnQudGVsZW1ldHJ5Q29ubmVjdGlvbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGNvdW50cyA9IHRoaXMuX2Nvbm5lY3Rpb25UZWxlbWV0cnlUcmFja2VyLmRpc2Nvbm5lY3QoY2xpZW50LmNsaWVudElkLCBjbGllbnQudGVsZW1ldHJ5VHJhbnNwb3J0VG9rZW4pO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLmNsaWVudENvbm5lY3Rpb24oe1xuXHRcdFx0YWN0aW9uOiAnZGlzY29ubmVjdGVkJyxcblx0XHRcdGNvbnRleHQ6IGNsaWVudC50ZWxlbWV0cnlDb250ZXh0LFxuXHRcdFx0Y2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCxcblx0XHRcdGNsaWVudEltcGxlbWVudGF0aW9uTmFtZTogY2xpZW50LmNsaWVudEluZm8/Lm5hbWUsXG5cdFx0XHRjbGllbnRJbXBsZW1lbnRhdGlvblZlcnNpb246IGNsaWVudC5jbGllbnRJbmZvPy52ZXJzaW9uLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBjbGllbnQucHJvdG9jb2xWZXJzaW9uLFxuXHRcdFx0aXNSZWNvbm5lY3Q6IGNsaWVudC5pc1JlY29ubmVjdCxcblx0XHRcdC4uLmNvdW50cyxcblx0XHRcdGNvbm5lY3Rpb25EdXJhdGlvbk1zOiBjbGllbnQuY29ubmVjdGlvblN0b3BXYXRjaC5lbGFwc2VkKCksXG5cdFx0XHRzdWJzY3JpcHRpb25Db3VudCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wIGdyYWNlIHJlY29yZHMgd2hvc2UgdGltZXJzIGhhdmUgYWxsIGZpcmVkIGFuZCB3aG9zZSBsYXN0LXNlZW4gdGltZSBpc1xuXHQgKiBzdGFsZSBiZXlvbmQgdGhlIHJldGVudGlvbiB3aW5kb3cgKDEwXHUwMEQ3IHRoZSBkaXNjb25uZWN0IHRpbWVvdXQpLiBUaGlzXG5cdCAqIGNvdmVycyBib3RoIGdlbnVpbmVseS1kaXNjb25uZWN0ZWQgY2xpZW50cyBhbmQgbmV2ZXItY29ubmVjdGVkIG9ycGhhblxuXHQgKiBzdGFtcHMuIEJvdW5kcyB7QGxpbmsgX2NsaWVudHN9IHdpdGhvdXQgdHJhY2tpbmcgbGl2ZW5lc3MgcHJlY2lzZWx5IFx1MjAxNCBhXG5cdCAqIHBydW5lZC10aGVuLXJlc3VyZmFjaW5nIHN0YW1wIHNpbXBseSBmYWxscyBiYWNrIHRvIHRoZSBmdWxsIGdyYWNlIHdpbmRvdy5cblx0ICogQWN0aXZlIHJlY29yZHMgYXJlIG5ldmVyIHBydW5lZDsgdGhleSBwZXJzaXN0IHVudGlsIHRoZWlyIGxhc3QgdHJhbnNwb3J0XG5cdCAqIGNsb3Nlcy5cblx0ICovXG5cdHByaXZhdGUgX3BydW5lQ2xpZW50UmVjb3JkcygpOiB2b2lkIHtcblx0XHRjb25zdCBjdXRvZmYgPSBEYXRlLm5vdygpIC0gQUdFTlRfSE9TVF9DTElFTlRfQ09OTkVDVElPTl9ISVNUT1JZX1JFVEVOVElPTjtcblx0XHRmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVjb3JkXSBvZiB0aGlzLl9jbGllbnRzKSB7XG5cdFx0XHRpZiAocmVjb3JkLnN0YXRlID09PSAnZ3JhY2UnXG5cdFx0XHRcdCYmIHJlY29yZC5kaXNjb25uZWN0VGltZW91dHMuc2l6ZSA9PT0gMFxuXHRcdFx0XHQmJiByZWNvcmQubGFzdFNlZW5BdCA8IGN1dG9mZikge1xuXHRcdFx0XHR0aGlzLl9jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJDbGllbnRUb29sQ2FsbERpc2Nvbm5lY3RUaW1lb3V0KGNsaWVudElkOiBzdHJpbmcsIGNoYW5uZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlY29yZCA9IHRoaXMuX2NsaWVudHMuZ2V0KGNsaWVudElkKTtcblx0XHRpZiAocmVjb3JkPy5zdGF0ZSA9PT0gJ2dyYWNlJykge1xuXHRcdFx0cmVjb3JkLmRpc2Nvbm5lY3RUaW1lb3V0cy5kZWxldGVBbmREaXNwb3NlKGNoYW5uZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbXBsZXRlRGlzY29ubmVjdGVkQ2xpZW50VG9vbENhbGxzKGNsaWVudElkOiBzdHJpbmcsIHNlc3Npb246IHN0cmluZywgY2hhdENoYW5uZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGF0Q2hhbm5lbCk7XG5cdFx0Y29uc3QgYWN0aXZlVHVybiA9IHN0YXRlPy5hY3RpdmVUdXJuO1xuXHRcdGlmICghc3RhdGUgfHwgIWFjdGl2ZVR1cm4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB7IHRvb2xDYWxsLCBjbGllbnRJZDogb3duZXJJZCB9IG9mIHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMoc3RhdGUpKSB7XG5cdFx0XHRpZiAob3duZXJJZCAhPT0gY2xpZW50SWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtYXlSZXRyeVdpdGhSZXBsYWNlbWVudENsaWVudCA9IHRoaXMuX2hhc1JlcGxhY2VtZW50QWN0aXZlQ2xpZW50VG9vbChzdGF0ZSwgY2xpZW50SWQsIHRvb2xDYWxsLnRvb2xOYW1lKTtcblx0XHRcdGlmICh0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZykge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhdENoYW5uZWwsIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHRcdHR1cm5JZDogYWN0aXZlVHVybi5pZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB0b29sQ2FsbC5pbnZvY2F0aW9uTWVzc2FnZSA/PyB0b29sQ2FsbC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhdENoYW5uZWwsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiBhY3RpdmVUdXJuLmlkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBgJHt0b29sQ2FsbC5kaXNwbGF5TmFtZX0gZmFpbGVkYCxcblx0XHRcdFx0XHQuLi4obWF5UmV0cnlXaXRoUmVwbGFjZW1lbnRDbGllbnQgPyB7IGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiBgVGhlIGNsaWVudCB0aGF0IHdhcyBydW5uaW5nICR7dG9vbENhbGwuZGlzcGxheU5hbWV9IGRpc2Nvbm5lY3RlZCwgYnV0IGFub3RoZXIgYWN0aXZlIGNsaWVudCBub3cgcHJvdmlkZXMgJHt0b29sQ2FsbC5kaXNwbGF5TmFtZX0uIFlvdSBtYXkgdHJ5IGNhbGxpbmcgdGhlIHRvb2wgYWdhaW4uYCB9XSB9IDoge30pLFxuXHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6IGBDbGllbnQgJHtjbGllbnRJZH0gZGlzY29ubmVjdGVkIGJlZm9yZSBjb21wbGV0aW5nICR7dG9vbENhbGwuZGlzcGxheU5hbWV9YCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBSZXF1ZXN0cyAoZXhwZWN0IGEgcmVzcG9uc2UpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBNZXRob2RzIGhhbmRsZWQgYnkgdGhlIHJlcXVlc3QgZGlzcGF0Y2hlciAoZXhjbHVkZXMgaW5pdGlhbGl6ZS9yZWNvbm5lY3Rcblx0ICogd2hpY2ggYXJlIGhhbmRsZWQgZHVyaW5nIHRoZSBoYW5kc2hha2UgcGhhc2UpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdEhhbmRsZXJzOiBSZXF1ZXN0SGFuZGxlck1hcCA9IHtcblx0XHRzdWJzY3JpYmU6IGFzeW5jIChjbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0Y29uc3QgY2xhc3NpZmllZCA9IGNsYXNzaWZ5Q2hhbm5lbChwYXJhbXMuY2hhbm5lbCk7XG5cdFx0XHRpZiAoIWNsYXNzaWZpZWQpIHtcblx0XHRcdFx0Ly8gT1RMUC1mbGF2b3VyZWQgVVJJIHdlIGRvbid0IHVuZGVyc3RhbmQgKGUuZy4gdW5rbm93blxuXHRcdFx0XHQvLyBsZXZlbCkuIEFja25vd2xlZGdlIGFzIHN0YXRlbGVzcyBzbyB0aGUgY2xpZW50IGRvZXNuJ3Rcblx0XHRcdFx0Ly8gaGFuZywgYnV0IGluc3RhbGwgbm90aGluZy5cblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNsYXNzaWZpZWQua2luZCA9PT0gQ2hhbm5lbEtpbmQuT3RscExvZ3MpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jb25maWcub3RscExvZ0VtaXR0ZXIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtQcm90b2NvbFNlcnZlcl0gSWdub3JpbmcgT1RMUCBzdWJzY3JpYmUgZm9yICR7cGFyYW1zLmNoYW5uZWx9OiBubyBPVExQIGVtaXR0ZXIgY29uZmlndXJlZC5gKTtcblx0XHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzaWZpZWQudXJpLCBjbGFzc2lmaWVkKTtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNsYXNzaWZpZWQua2luZCA9PT0gQ2hhbm5lbEtpbmQuUmVzb3VyY2VXYXRjaCkge1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdG9yID0gdGhpcy5fYWdlbnRTZXJ2aWNlLm9uUmVzb3VyY2VXYXRjaFN1YnNjcmliZWQoY2xhc3NpZmllZC51cmkpO1xuXHRcdFx0XHRpZiAoIWRlc2NyaXB0b3IpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIGBSZXNvdXJjZSB3YXRjaCBub3QgZm91bmQ6ICR7cGFyYW1zLmNoYW5uZWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzaWZpZWQudXJpLCBjbGFzc2lmaWVkKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzbmFwc2hvdDoge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IGNsYXNzaWZpZWQudXJpLFxuXHRcdFx0XHRcdFx0c3RhdGU6IGRlc2NyaXB0b3IsXG5cdFx0XHRcdFx0XHRmcm9tU2VxOiB0aGlzLl9zdGF0ZU1hbmFnZXIuc2VydmVyU2VxLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHRoaXMuX2FnZW50U2VydmljZS5zdWJzY3JpYmUoVVJJLnBhcnNlKHBhcmFtcy5jaGFubmVsKSwgY2xpZW50LmNsaWVudElkKTtcblx0XHRcdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzaWZpZWQudXJpLCBjbGFzc2lmaWVkKTtcblx0XHRcdFx0dGhpcy5fY2xlYXJDbGllbnRUb29sQ2FsbERpc2Nvbm5lY3RUaW1lb3V0KGNsaWVudC5jbGllbnRJZCwgY2xhc3NpZmllZC51cmkpO1xuXHRcdFx0XHQvLyBgSVN0YXRlU25hcHNob3RgIGlzIHdpZGVuZWQgd2l0aCBgQ2hhdFN0YXRlYCAoc2VlIHNlc3Npb25Qcm90b2NvbC50cyk7XG5cdFx0XHRcdC8vIHRoZSBnZW5lcmF0ZWQgd2lyZSBgU25hcHNob3RgIHVuaW9uIGRvZXMgbm90IGxpc3QgaXQgeWV0LiBUaGUgdmFsdWVcblx0XHRcdFx0Ly8gaXMgSlNPTiBvdmVyIHRoZSB3aXJlLCBzbyBuYXJyb3dpbmcgYXQgdGhpcyBib3VuZGFyeSBpcyBzYWZlLlxuXHRcdFx0XHRyZXR1cm4geyBzbmFwc2hvdDogc25hcHNob3QgYXMgU3Vic2NyaWJlUmVzdWx0WydzbmFwc2hvdCddIH07XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQUhQX1NFU1NJT05fTk9UX0ZPVU5ELCBgUmVzb3VyY2Ugbm90IGZvdW5kOiAke3BhcmFtcy5jaGFubmVsfWApO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Y3JlYXRlU2Vzc2lvbjogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0bGV0IGNyZWF0ZWRTZXNzaW9uOiBVUkk7XG5cdFx0XHQvLyBSZXNvbHZlIGZvcmsgdHVybklkIHRvIGEgMC1iYXNlZCBpbmRleCB1c2luZyB0aGUgc291cmNlIHNlc3Npb24nc1xuXHRcdFx0Ly8gdHVybiBsaXN0IGluIHRoZSBzdGF0ZSBtYW5hZ2VyLlxuXHRcdFx0bGV0IGZvcms6IHsgc2Vzc2lvbjogVVJJOyBjaGF0OiBVUkk7IHR1cm5JbmRleDogbnVtYmVyOyB0dXJuSWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHBhcmFtcy5mb3JrKSB7XG5cdFx0XHRcdGlmIChVUkkucGFyc2UocGFyYW1zLmZvcmsuc2Vzc2lvbikudG9TdHJpbmcoKSA9PT0gVVJJLnBhcnNlKHBhcmFtcy5jaGFubmVsKS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5TZXNzaW9uQWxyZWFkeUV4aXN0cywgYEZvcmsgdGFyZ2V0IHNlc3Npb24gbXVzdCBkaWZmZXIgZnJvbSBzb3VyY2Ugc2Vzc2lvbjogJHtwYXJhbXMuY2hhbm5lbH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzb3VyY2VTdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUocGFyYW1zLmZvcmsuc2Vzc2lvbik7XG5cdFx0XHRcdGlmICghc291cmNlU3RhdGUpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIGBGb3JrIHNvdXJjZSBzZXNzaW9uIG5vdCBmb3VuZDogJHtwYXJhbXMuZm9yay5zZXNzaW9ufWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHR1cm5JbmRleCA9IHNvdXJjZVN0YXRlLnR1cm5zLmZpbmRJbmRleCh0ID0+IHQuaWQgPT09IHBhcmFtcy5mb3JrIS50dXJuSWQpO1xuXHRcdFx0XHRpZiAodHVybkluZGV4IDwgMCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYEZvcmsgdHVybiBJRCAke3BhcmFtcy5mb3JrLnR1cm5JZH0gbm90IGZvdW5kIGluIHNlc3Npb24gJHtwYXJhbXMuZm9yay5zZXNzaW9ufWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNvdXJjZVNlc3Npb24gPSBVUkkucGFyc2UocGFyYW1zLmZvcmsuc2Vzc2lvbik7XG5cdFx0XHRcdGZvcmsgPSB7IHNlc3Npb246IHNvdXJjZVNlc3Npb24sIGNoYXQ6IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNvdXJjZVNlc3Npb24pKSwgdHVybkluZGV4LCB0dXJuSWQ6IHBhcmFtcy5mb3JrLnR1cm5JZCB9O1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgdGhlIGNsaWVudCBlYWdlcmx5IGNsYWltZWQgdGhlIGFjdGl2ZSBjbGllbnQgcm9sZSwgdmFsaWRhdGVcblx0XHRcdC8vIHRoZSBjbGllbnRJZCBtYXRjaGVzIHRoZSBjb25uZWN0aW9uIGJlZm9yZSBmb3J3YXJkaW5nLlxuXHRcdFx0aWYgKHBhcmFtcy5hY3RpdmVDbGllbnQgJiYgcGFyYW1zLmFjdGl2ZUNsaWVudC5jbGllbnRJZCAhPT0gX2NsaWVudC5jbGllbnRJZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zLCBgY3JlYXRlU2Vzc2lvbi5hY3RpdmVDbGllbnQuY2xpZW50SWQgbXVzdCBtYXRjaCB0aGUgY29ubmVjdGlvbidzIGNsaWVudElkYCk7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjcmVhdGVkU2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2FnZW50U2VydmljZS5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRwcm92aWRlcjogcGFyYW1zLnByb3ZpZGVyLFxuXHRcdFx0XHRcdF9tZXRhOiBwYXJhbXMuX21ldGEsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBwYXJhbXMud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZCA9PiBVUkkucGFyc2UoZCkpLFxuXHRcdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShwYXJhbXMuY2hhbm5lbCksXG5cdFx0XHRcdFx0Zm9yayxcblx0XHRcdFx0XHRjb25maWc6IHBhcmFtcy5jb25maWcsXG5cdFx0XHRcdFx0YWN0aXZlQ2xpZW50OiBwYXJhbXMuYWN0aXZlQ2xpZW50LFxuXHRcdFx0XHRcdHByb2dyZXNzVG9rZW46IHBhcmFtcy5wcm9ncmVzc1Rva2VuLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBSFBfUFJPVklERVJfTk9UX0ZPVU5ELCBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBwcm92aWRlciBob25vcmVkIHRoZSBjbGllbnQtY2hvc2VuIHNlc3Npb24gVVJJIHBlciB0aGUgcHJvdG9jb2wgY29udHJhY3Rcblx0XHRcdGlmIChjcmVhdGVkU2Vzc2lvbi50b1N0cmluZygpICE9PSBVUkkucGFyc2UocGFyYW1zLmNoYW5uZWwpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUHJvdG9jb2xTZXJ2ZXJdIGNyZWF0ZVNlc3Npb246IHByb3ZpZGVyIHJldHVybmVkIFVSSSAke2NyZWF0ZWRTZXNzaW9uLnRvU3RyaW5nKCl9IGJ1dCBjbGllbnQgcmVxdWVzdGVkICR7cGFyYW1zLmNoYW5uZWx9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9LFxuXHRcdGRpc3Bvc2VTZXNzaW9uOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZ2VudFNlcnZpY2UuZGlzcG9zZVNlc3Npb24oVVJJLnBhcnNlKHBhcmFtcy5jaGFubmVsKSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9LFxuXHRcdGNyZWF0ZUNoYXQ6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShwYXJhbXMuY2hhbm5lbCk7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFNlc3Npb24gbm90IGZvdW5kOiAke3BhcmFtcy5jaGFubmVsfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBzdGF0ZS5kZWZhdWx0Q2hhdCA/PyBidWlsZERlZmF1bHRDaGF0VXJpKHBhcmFtcy5jaGFubmVsKTtcblx0XHRcdC8vIFRoZSBkZWZhdWx0IGNoYXQgaXMgY3JlYXRlZCBhbG9uZ3NpZGUgaXRzIHNlc3Npb247IGNyZWF0aW5nIGl0XG5cdFx0XHQvLyBhZ2FpbiBpcyBhIG5vLW9wLiBBbnkgb3RoZXIgY2hhdCBVUkkgc3BpbnMgdXAgYW4gYWRkaXRpb25hbCBjaGF0LlxuXHRcdFx0aWYgKFVSSS5wYXJzZShwYXJhbXMuY2hhdCkudG9TdHJpbmcoKSA9PT0gVVJJLnBhcnNlKGRlZmF1bHRDaGF0KS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc291cmNlID0gcGFyYW1zLnNvdXJjZTtcblx0XHRcdGxldCBvcHRpb25zOiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0c3dpdGNoIChzb3VyY2Uua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgQ2hhdFNvdXJjZUtpbmQuRm9yazpcblx0XHRcdFx0XHRcdG9wdGlvbnMgPSB7IGZvcms6IHsgc291cmNlOiBVUkkucGFyc2Uoc291cmNlLmNoYXQpLCB0dXJuSWQ6IHNvdXJjZS50dXJuSWQgfSB9O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBDaGF0U291cmNlS2luZC5TaWRlQ2hhdDpcblx0XHRcdFx0XHRcdG9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHRcdHNpZGVDaGF0OiB7XG5cdFx0XHRcdFx0XHRcdFx0c291cmNlOiBVUkkucGFyc2Uoc291cmNlLmNoYXQpLFxuXHRcdFx0XHRcdFx0XHRcdHR1cm5JZDogc291cmNlLnR1cm5JZCxcblx0XHRcdFx0XHRcdFx0XHQuLi4oc291cmNlLnNlbGVjdGlvbiA/IHsgc2VsZWN0aW9uOiBzb3VyY2Uuc2VsZWN0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBVbnN1cHBvcnRlZCBjcmVhdGVDaGF0IHNvdXJjZSBraW5kOiAke1N0cmluZygoc291cmNlIGFzIHsga2luZD86IHVua25vd24gfSkua2luZCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2FnZW50U2VydmljZS5jcmVhdGVDaGF0KFxuXHRcdFx0XHRVUkkucGFyc2UocGFyYW1zLmNoYW5uZWwpLFxuXHRcdFx0XHRVUkkucGFyc2UocGFyYW1zLmNoYXQpLFxuXHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0sXG5cdFx0ZGlzcG9zZUNoYXQ6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UocGFyYW1zLmNoYW5uZWwpO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKGNoYXQpO1xuXHRcdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9hZ2VudFNlcnZpY2UuZGlzcG9zZUNoYXQoVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uKSwgY2hhdCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9LFxuXHRcdHJlc291cmNlV3JpdGU6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UucmVzb3VyY2VXcml0ZShwYXJhbXMpO1xuXHRcdH0sXG5cdFx0bGlzdFNlc3Npb25zOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2FnZW50U2VydmljZS5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gc2Vzc2lvbnMubWFwKHMgPT4ge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IEFnZW50U2Vzc2lvbi5wcm92aWRlcihzLnNlc3Npb24pO1xuXHRcdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBZ2VudCBzZXNzaW9uIFVSSSBoYXMgbm8gcHJvdmlkZXIgc2NoZW1lOiAke3Muc2Vzc2lvbi50b1N0cmluZygpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHMuc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdHRpdGxlOiBzLnN1bW1hcnkgPz8gJ1Nlc3Npb24nLFxuXHRcdFx0XHRcdHN0YXR1czogcy5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRcdGFjdGl2aXR5OiBzLmFjdGl2aXR5LFxuXHRcdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUocy5zdGFydFRpbWUpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUocy5tb2RpZmllZFRpbWUpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0Li4uKHMucHJvamVjdCA/IHsgcHJvamVjdDogeyB1cmk6IHMucHJvamVjdC51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IHMucHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzLndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHRcdFx0XHRjaGFuZ2VzOiBzLmNoYW5nZXMsXG5cdFx0XHRcdFx0Ly8gYF9tZXRhYCBjYXJyaWVzIGR1cmFibGUgaG9zdCBwcm92ZW5hbmNlLCBpbmNsdWRpbmcgc2Vzc2lvbiBraW5kXG5cdFx0XHRcdFx0Ly8gYW5kIHByb3ZpZGVyLW5hdGl2ZSBkaXNjb3ZlcnkgcHJvdmVuYW5jZS5cblx0XHRcdFx0XHQuLi4ocy5fbWV0YSAhPT0gdW5kZWZpbmVkID8geyBfbWV0YTogcy5fbWV0YSB9IDoge30pLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBMaXN0U2Vzc2lvbnNSZXN1bHRbJ2l0ZW1zJ11bbnVtYmVyXTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHsgaXRlbXMgfTtcblx0XHR9LFxuXHRcdHJlc29sdmVTZXNzaW9uQ29uZmlnOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdFx0cHJvdmlkZXI6IHBhcmFtcy5wcm92aWRlcixcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcGFyYW1zLndvcmtpbmdEaXJlY3RvcnkgPyBVUkkucGFyc2UocGFyYW1zLndvcmtpbmdEaXJlY3RvcnkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maWc6IHBhcmFtcy5jb25maWcsXG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdHNlc3Npb25Db25maWdDb21wbGV0aW9uczogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5zZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMoe1xuXHRcdFx0XHRwcm92aWRlcjogcGFyYW1zLnByb3ZpZGVyLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBwYXJhbXMud29ya2luZ0RpcmVjdG9yeSA/IFVSSS5wYXJzZShwYXJhbXMud29ya2luZ0RpcmVjdG9yeSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbmZpZzogcGFyYW1zLmNvbmZpZyxcblx0XHRcdFx0cHJvcGVydHk6IHBhcmFtcy5wcm9wZXJ0eSxcblx0XHRcdFx0cXVlcnk6IHBhcmFtcy5xdWVyeSxcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0Y29tcGxldGlvbnM6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UuY29tcGxldGlvbnMocGFyYW1zKTtcblx0XHR9LFxuXHRcdGZldGNoVHVybnM6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShwYXJhbXMuY2hhbm5lbCk7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFNlc3Npb24gbm90IGZvdW5kOiAke3BhcmFtcy5jaGFubmVsfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhcmFtcy5jdXJzb3IgJiYgcGFyYW1zLmN1cnNvciAhPT0gc3RhdGUudHVybnNOZXh0Q3Vyc29yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBVbnJlY29nbml6ZWQgZmV0Y2hUdXJucyBjdXJzb3JgKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwYXJhbXMuY2hhbm5lbCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuc0xvYWRlZCxcblx0XHRcdFx0dHVybnM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fSxcblx0XHRyZXNvdXJjZUxpc3Q6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UucmVzb3VyY2VMaXN0KFVSSS5wYXJzZShwYXJhbXMudXJpKSk7XG5cdFx0fSxcblx0XHRyZXNvdXJjZVJlYWQ6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UucmVzb3VyY2VSZWFkKFVSSS5wYXJzZShwYXJhbXMudXJpKSk7XG5cdFx0fSxcblx0XHRyZXNvdXJjZUNvcHk6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UucmVzb3VyY2VDb3B5KHBhcmFtcyk7XG5cdFx0fSxcblx0XHRyZXNvdXJjZURlbGV0ZTogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5yZXNvdXJjZURlbGV0ZShwYXJhbXMpO1xuXHRcdH0sXG5cdFx0cmVzb3VyY2VNb3ZlOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLnJlc291cmNlTW92ZShwYXJhbXMpO1xuXHRcdH0sXG5cdFx0cmVzb3VyY2VSZXNvbHZlOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLnJlc291cmNlUmVzb2x2ZShwYXJhbXMpO1xuXHRcdH0sXG5cdFx0cmVzb3VyY2VNa2RpcjogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5yZXNvdXJjZU1rZGlyKHBhcmFtcyk7XG5cdFx0fSxcblx0XHRjcmVhdGVSZXNvdXJjZVdhdGNoOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLmNyZWF0ZVJlc291cmNlV2F0Y2gocGFyYW1zKTtcblx0XHR9LFxuXHRcdHJlc291cmNlUmVxdWVzdDogYXN5bmMgKF9jbGllbnQsIF9wYXJhbXMpID0+IHtcblx0XHRcdC8vIFRoZSBsb2NhbCBhZ2VudCBob3N0IGRvZXMgbm90IHlldCBlbmZvcmNlIHBlci1yZXNvdXJjZSBncmFudHNcblx0XHRcdC8vIGZvciBjbGllbnQgXHUyMTkyIHNlcnZlciBhY2Nlc3MuIEFsd2F5cyBncmFudDsgcmVjZWl2ZXJzIE1BWSByZXNjaW5kXG5cdFx0XHQvLyBhY2Nlc3MgYnkgcmV0dXJuaW5nIGBQZXJtaXNzaW9uRGVuaWVkYCBvbiBzdWJzZXF1ZW50IG9wZXJhdGlvbnMuXG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fSxcblx0XHRhdXRoZW50aWNhdGU6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2FnZW50U2VydmljZS5hdXRoZW50aWNhdGUocGFyYW1zKTtcblx0XHRcdGlmICghcmVzdWx0LmF1dGhlbnRpY2F0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQUhQX0FVVEhfUkVRVUlSRUQsIGBBdXRoZW50aWNhdGlvbiBmYWlsZWQgZm9yIHJlc291cmNlOiAke3BhcmFtcy5yZXNvdXJjZX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7fTtcblx0XHR9LFxuXHRcdGNyZWF0ZVRlcm1pbmFsOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZ2VudFNlcnZpY2UuY3JlYXRlVGVybWluYWwocGFyYW1zKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0sXG5cdFx0ZGlzcG9zZVRlcm1pbmFsOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZ2VudFNlcnZpY2UuZGlzcG9zZVRlcm1pbmFsKFVSSS5wYXJzZShwYXJhbXMuY2hhbm5lbCkpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSxcblx0XHRpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb246IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UuaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uKHBhcmFtcyk7XG5cdFx0fSxcblx0fTtcblxuXG5cdC8vIC0tLS0gUmV2ZXJzZSBSUEMgKHNlcnZlciBcdTIxOTIgY2xpZW50IHJlcXVlc3RzKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfcmV2ZXJzZVJlcXVlc3RJZCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdSZXZlcnNlUmVxdWVzdHMgPSBuZXcgTWFwPG51bWJlciwgeyBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQ7IHJlc29sdmU6ICh2YWx1ZTogdW5rbm93bikgPT4gdm9pZDsgcmVqZWN0OiAocmVhc29uOiB1bmtub3duKSA9PiB2b2lkIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luZmxpZ2h0UmVxdWVzdHMgPSBuZXcgU2V0PFByb21pc2U8dW5rbm93bj4+KCk7XG5cblx0LyoqXG5cdCAqIFNlbmRzIGEgSlNPTi1SUEMgcmVxdWVzdCB0byBhIGNvbm5lY3RlZCBjbGllbnQgYW5kIHdhaXRzIGZvciB0aGUgcmVzcG9uc2UuXG5cdCAqIFVzZWQgZm9yIHJldmVyc2UtUlBDIG9wZXJhdGlvbnMgbGlrZSByZWFkaW5nIGNsaWVudC1zaWRlIGZpbGVzLlxuXHQgKiBSZWplY3RzIGlmIHRoZSBjbGllbnQgZGlzY29ubmVjdHMgb3IgdGhlIHNlcnZlciBpcyBkaXNwb3NlZC5cblx0ICovXG5cdHByaXZhdGUgX3NlbmRSZXZlcnNlUmVxdWVzdDxUPihjbGllbnRJZDogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duKTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gdGhpcy5fZ2V0QWN0aXZlQ2xpZW50KGNsaWVudElkKTtcblx0XHRpZiAoIWNsaWVudCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgQ2xpZW50ICR7Y2xpZW50SWR9IGlzIG5vdCBjb25uZWN0ZWRgKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGlkID0gKyt0aGlzLl9yZXZlcnNlUmVxdWVzdElkO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmV2ZXJzZVJlcXVlc3RzLnNldChpZCwgeyBjbGllbnQsIHJlc29sdmU6IHJlc29sdmUgYXMgKHZhbHVlOiB1bmtub3duKSA9PiB2b2lkLCByZWplY3QgfSk7XG5cdFx0XHRjb25zdCByZXF1ZXN0OiBKc29uUnBjUmVxdWVzdCA9IHsganNvbnJwYzogJzIuMCcsIGlkLCBtZXRob2QsIHBhcmFtcyB9O1xuXHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKHJlcXVlc3QpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlamVjdHMgYW5kIGNsZWFycyBhbGwgcGVuZGluZyByZXZlcnNlLVJQQyByZXF1ZXN0cyBzZW50IG92ZXIgYSBnaXZlblxuXHQgKiBjb25uZWN0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVqZWN0UGVuZGluZ1JldmVyc2VSZXF1ZXN0c0ZvckNvbm5lY3Rpb24oY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbaWQsIHBlbmRpbmddIG9mIHRoaXMuX3BlbmRpbmdSZXZlcnNlUmVxdWVzdHMpIHtcblx0XHRcdGlmIChwZW5kaW5nLmNsaWVudCA9PT0gY2xpZW50KSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZXZlcnNlUmVxdWVzdHMuZGVsZXRlKGlkKTtcblx0XHRcdFx0cGVuZGluZy5yZWplY3QobmV3IEVycm9yKGBDbGllbnQgJHtjbGllbnQuY2xpZW50SWR9IGRpc2Nvbm5lY3RlZGApKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSZXF1ZXN0KGNsaWVudDogSUNvbm5lY3RlZENsaWVudCwgbWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93biwgaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9yZXF1ZXN0SGFuZGxlcnMuaGFzT3duUHJvcGVydHkobWV0aG9kKSA/IHRoaXMuX3JlcXVlc3RIYW5kbGVyc1ttZXRob2QgYXMgUmVxdWVzdE1ldGhvZF0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGhhbmRsZXIpIHtcblx0XHRcdHRoaXMuX3RyYWNrUmVxdWVzdCgoaGFuZGxlciBhcyAoY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LCBwYXJhbXM6IHVua25vd24pID0+IFByb21pc2U8dW5rbm93bj4pKGNsaWVudCwgcGFyYW1zKSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbUHJvdG9jb2xTZXJ2ZXJdIFJlcXVlc3QgJyR7bWV0aG9kfScgaWQ9JHtpZH0gc3VjY2VlZGVkYCk7XG5cdFx0XHRcdGNsaWVudC50cmFuc3BvcnQuc2VuZChqc29uUnBjU3VjY2VzcyhpZCwgcmVzdWx0ID8/IG51bGwpKTtcblx0XHRcdH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdGlmIChzaG91bGRMb2dGYWlsZWRSZXF1ZXN0KG1ldGhvZCwgcGFyYW1zLCBlcnIpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1Byb3RvY29sU2VydmVyXSBSZXF1ZXN0ICcke21ldGhvZH0nIGZhaWxlZGAsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvckZyb20oaWQsIGVycikpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVlMgQ29kZSBleHRlbnNpb24gbWV0aG9kcyAobm90IGluIHRoZSB0eXBlZCBwcm90b2NvbCBtYXBzIHlldClcblx0XHRjb25zdCBleHRlbnNpb25SZXN1bHQgPSB0aGlzLl9oYW5kbGVFeHRlbnNpb25SZXF1ZXN0KG1ldGhvZCwgcGFyYW1zKTtcblx0XHRpZiAoZXh0ZW5zaW9uUmVzdWx0KSB7XG5cdFx0XHR0aGlzLl90cmFja1JlcXVlc3QoZXh0ZW5zaW9uUmVzdWx0KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdGNsaWVudC50cmFuc3BvcnQuc2VuZChqc29uUnBjU3VjY2VzcyhpZCwgcmVzdWx0ID8/IG51bGwpKTtcblx0XHRcdH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtQcm90b2NvbFNlcnZlcl0gRXh0ZW5zaW9uIHJlcXVlc3QgJyR7bWV0aG9kfScgZmFpbGVkYCwgZXJyKTtcblx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvckZyb20oaWQsIGVycikpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTUNQIHNpZGUtY2hhbm5lbDogcmVxdWVzdHMgdGFyZ2V0aW5nIGFuIGBtY3A6Ly9gIGNoYW5uZWwgY2FycnkgdGhlXG5cdFx0Ly8gY2hhbm5lbCBVUkkgaW4gYHBhcmFtcy5jaGFubmVsYC4gV2UgZm9yd2FyZCB0aGVtIHRocm91Z2ggdGhlXG5cdFx0Ly8gYWdlbnQgc2VydmljZSwgd2hpY2ggcm91dGVzIGJ5IGA8cHJvdmlkZXJJZD4vPHNlc3Npb25JZD4vPHNlcnZlck5hbWU+YFxuXHRcdC8vIHRvIHRoZSBvd25pbmcgYWdlbnQncyBNQ1AgQXBwIGltcGxlbWVudGF0aW9uLiBVbmtub3duIGNoYW5uZWxzIGFuZFxuXHRcdC8vIHVua25vd24gbWV0aG9kcyBhcmUgcmVqZWN0ZWQgd2l0aCBgLTMyNjAxYC5cblx0XHRjb25zdCBtY3BDaGFubmVsID0gcmVhZE1jcENoYW5uZWwocGFyYW1zKTtcblx0XHRpZiAobWNwQ2hhbm5lbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBwYXJhbXNPYmogPSBpc1BhcmFtc09iamVjdChwYXJhbXMpID8gcGFyYW1zIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fdHJhY2tSZXF1ZXN0KHRoaXMuX2FnZW50U2VydmljZS5oYW5kbGVNY3BSZXF1ZXN0KG1jcENoYW5uZWwsIG1ldGhvZCwgcGFyYW1zT2JqKSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRjbGllbnQudHJhbnNwb3J0LnNlbmQoanNvblJwY1N1Y2Nlc3MoaWQsIHJlc3VsdCA/PyBudWxsKSk7XG5cdFx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyLm1lc3NhZ2Uuc3RhcnRzV2l0aCgnTWV0aG9kIG5vdCBmb3VuZCcpKSB7XG5cdFx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvcihpZCwgSnNvblJwY0Vycm9yQ29kZXMuTWV0aG9kTm90Rm91bmQsIGVyci5tZXNzYWdlKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtQcm90b2NvbFNlcnZlcl0gbWNwOi8vIHJlcXVlc3QgJyR7bWV0aG9kfScgb24gJHttY3BDaGFubmVsfSBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0XHRjbGllbnQudHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yRnJvbShpZCwgZXJyKSk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjbGllbnQudHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yKGlkLCBKc29uUnBjRXJyb3JDb2Rlcy5NZXRob2ROb3RGb3VuZCwgYE1ldGhvZCBub3QgZm91bmQ6ICR7bWV0aG9kfWApKTtcblx0fVxuXG5cdGFzeW5jIHdoZW5JZGxlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHdoaWxlICh0aGlzLl9pbmZsaWdodFJlcXVlc3RzLnNpemUgPiAwKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udGhpcy5faW5mbGlnaHRSZXF1ZXN0c10ubWFwKHByb21pc2UgPT4gcHJvbWlzZS50aGVuKCgpID0+IHsgfSwgKCkgPT4geyB9KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RyYWNrUmVxdWVzdDxUPihwcm9taXNlOiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0dGhpcy5faW5mbGlnaHRSZXF1ZXN0cy5hZGQocHJvbWlzZSk7XG5cdFx0Y29uc3QgcmVtb3ZlID0gKCkgPT4gdGhpcy5faW5mbGlnaHRSZXF1ZXN0cy5kZWxldGUocHJvbWlzZSk7XG5cdFx0dm9pZCBwcm9taXNlLnRoZW4ocmVtb3ZlLCByZW1vdmUpO1xuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBWUyBDb2RlIGV4dGVuc2lvbiBtZXRob2RzIHRoYXQgYXJlIG5vdCB5ZXQgcGFydCBvZiB0aGUgdHlwZWRcblx0ICogcHJvdG9jb2wuIFJldHVybnMgYSBQcm9taXNlIGlmIHRoZSBtZXRob2Qgd2FzIHJlY29nbml6ZWQsIHVuZGVmaW5lZFxuXHQgKiBvdGhlcndpc2UuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVFeHRlbnNpb25SZXF1ZXN0KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd24pOiBQcm9taXNlPHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY29uZmlnLmFsbG93RXh0ZW5zaW9uTWV0aG9kcyA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChtZXRob2QpIHtcblx0XHRcdGNhc2UgJ3NodXRkb3duJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5zaHV0ZG93bigpO1xuXHRcdFx0Y2FzZSAnZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbyc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UuZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbygpO1xuXHRcdFx0Y2FzZSAnZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLmdldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKCk7XG5cdFx0XHRjYXNlICdkaWFnbm9zdGljc0ZldGNoJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5kaWFnbm9zdGljc0ZldGNoKChwYXJhbXMgYXMgeyB1cmw6IHN0cmluZyB9KS51cmwpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIEJyb2FkY2FzdGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfYnJvYWRjYXN0QWN0aW9uKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtQcm90b2NvbFNlcnZlcl0gQnJvYWRjYXN0aW5nIGFjdGlvbjogJHtlbnZlbG9wZS5hY3Rpb24udHlwZX1gKTtcblx0XHRjb25zdCBtc2c6IEFocFNlcnZlck5vdGlmaWNhdGlvbjwnYWN0aW9uJz4gPSB7IGpzb25ycGM6ICcyLjAnLCBtZXRob2Q6ICdhY3Rpb24nLCBwYXJhbXM6IGVudmVsb3BlIH07XG5cdFx0Zm9yIChjb25zdCByZWNvcmQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gdGhpcy5fZ2V0QWN0aXZlQ2xpZW50RnJvbVJlY29yZChyZWNvcmQpO1xuXHRcdFx0aWYgKGNsaWVudCAmJiB0aGlzLl9pc1JlbGV2YW50VG9DbGllbnQoY2xpZW50LCBlbnZlbG9wZSkpIHtcblx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKG1zZyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYnJvYWRjYXN0Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbik6IHZvaWQge1xuXHRcdC8vIEVhY2ggcHJvdG9jb2wgbm90aWZpY2F0aW9uIG5vdyBzaGlwcyBhcyBpdHMgb3duIHRvcC1sZXZlbCBtZXRob2QuIFRoZVxuXHRcdC8vIGB0eXBlYCBkaXNjcmltaW5hbnQgb24gb3VyIGxvY2FsIHtAbGluayBQcm90b2NvbE5vdGlmaWNhdGlvbn0gdW5pb24gaXNcblx0XHQvLyB0aGUgd2lyZS1sZXZlbCBtZXRob2QgbmFtZSwgc28gd2UgY2FuIHJvdXRlIGl0IGRpcmVjdGx5LlxuXHRcdGNvbnN0IHsgdHlwZSwgLi4ucGFyYW1zIH0gPSBub3RpZmljYXRpb247XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdGNvbnN0IG1zZyA9IHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogdHlwZSwgcGFyYW1zIH0gYXMgQWhwU2VydmVyTm90aWZpY2F0aW9uO1xuXHRcdGZvciAoY29uc3QgcmVjb3JkIG9mIHRoaXMuX2NsaWVudHMudmFsdWVzKCkpIHtcblx0XHRcdHRoaXMuX2dldEFjdGl2ZUNsaWVudEZyb21SZWNvcmQocmVjb3JkKT8udHJhbnNwb3J0LnNlbmQobXNnKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRm9yd2FyZCBhbiBNQ1Agc2VydmVyLW9yaWdpbmF0ZWQgbm90aWZpY2F0aW9uIChlLmcuXG5cdCAqIGBub3RpZmljYXRpb25zL3Rvb2xzL2xpc3RfY2hhbmdlZGApIG92ZXIgdGhlIEFIUCB0cmFuc3BvcnQuIFRoZVxuXHQgKiBgY2hhbm5lbGAgZmllbGQgb24gYHBhcmFtc2AgaXMgdGhlIEFIUCByb3V0aW5nIGVudmVsb3BlOyB0aGVcblx0ICogcmVjZWl2aW5nIGNsaWVudCBkZW11bHRpcGxleGVzIGJ5IGl0LiBOb3RpZmljYXRpb25zIGFyZSBicm9hZGNhc3Rcblx0ICogdG8gZXZlcnkgY29ubmVjdGVkIGNsaWVudCBcdTIwMTQgcGVyLWNoYW5uZWwgc3Vic2NyaXB0aW9uIGZpbHRlcmluZyBpc1xuXHQgKiBsZWZ0IHRvIHRoZSBjbGllbnQsIHNpbmNlIE1DUCBub3RpZmljYXRpb25zIGFyZSBjaGVhcCBhbmQgdGhlXG5cdCAqIGNsaWVudCBhbHJlYWR5IGtub3dzIHdoaWNoIGNoYW5uZWxzIGl0IGNhcmVzIGFib3V0LlxuXHQgKi9cblx0cHJpdmF0ZSBfYnJvYWRjYXN0TWNwTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbjogSU1jcE5vdGlmaWNhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLihub3RpZmljYXRpb24ucGFyYW1zID8/IHt9KSwgY2hhbm5lbDogbm90aWZpY2F0aW9uLmNoYW5uZWwgfTtcblx0XHQvLyBNQ1Agbm90aWZpY2F0aW9ucyBkb24ndCBzaGFyZSBhIGRpc2NyaW1pbmF0ZWQgYG1ldGhvZGAgbGl0ZXJhbFxuXHRcdC8vIHdpdGggdGhlIGtub3duIHtAbGluayBBaHBTZXJ2ZXJOb3RpZmljYXRpb259IHVuaW9uLCBzbyBjYXN0XG5cdFx0Ly8gdGhyb3VnaCBgdW5rbm93bmAgdG8gc2F0aXNmeSB0aGUgdHJhbnNwb3J0IGNvbnRyYWN0LlxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRjb25zdCBtc2cgPSB7IGpzb25ycGM6ICcyLjAnIGFzIGNvbnN0LCBtZXRob2Q6IG5vdGlmaWNhdGlvbi5tZXRob2QsIHBhcmFtcyB9IGFzIHVua25vd24gYXMgQWhwU2VydmVyTm90aWZpY2F0aW9uO1xuXHRcdGZvciAoY29uc3QgcmVjb3JkIG9mIHRoaXMuX2NsaWVudHMudmFsdWVzKCkpIHtcblx0XHRcdHRoaXMuX2dldEFjdGl2ZUNsaWVudEZyb21SZWNvcmQocmVjb3JkKT8udHJhbnNwb3J0LnNlbmQobXNnKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRHJvcCBhIHN1YnNjcmlwdGlvbiBpZGVudGlmaWVkIGJ5IGBjaGFubmVsYCBmcm9tIGBjbGllbnRgLiBIYW5kbGVzXG5cdCAqIGNhbm9uaWNhbGlzYXRpb24gZm9yIE9UTFAgVVJJcyAoc28gYW4gYHVuc3Vic2NyaWJlYCB3aXRoIGEgVVJJXG5cdCAqIHZhcmlhbnQgY29sbGFwc2VzIHRvIHRoZSBzYW1lIGVudHJ5IGFzIHRoZSBvcmlnaW5hbCBgc3Vic2NyaWJlYClcblx0ICogYW5kIHRlYXJzIGRvd24gdGhlIGFnZW50LXNlcnZpY2UgcmVmY291bnQgZm9yIHN0YXRlIGNoYW5uZWxzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVtb3ZlU3Vic2NyaXB0aW9uKGNsaWVudDogSUNvbm5lY3RlZENsaWVudCwgY2hhbm5lbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2xhc3NpZmllZCA9IGNsYXNzaWZ5Q2hhbm5lbChjaGFubmVsKTtcblx0XHRpZiAoIWNsYXNzaWZpZWQpIHtcblx0XHRcdC8vIE9UTFAtZmxhdm91cmVkIFVSSSB3aXRoIGFuIHVua25vd24gbGV2ZWwgXHUyMDE0IHRoZXJlIGNhbiBuZXZlclxuXHRcdFx0Ly8gaGF2ZSBiZWVuIGEgbWF0Y2hpbmcgc3Vic2NyaXB0aW9uLiBTaWxlbnRseSBpZ25vcmUuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN1YiA9IGNsaWVudC5zdWJzY3JpcHRpb25zLmdldChjbGFzc2lmaWVkLnVyaSk7XG5cdFx0aWYgKCFzdWIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzaWZpZWQudXJpKTtcblx0XHRpZiAoc3ViLmtpbmQgPT09IENoYW5uZWxLaW5kLlN0YXRlKSB7XG5cdFx0XHRjb25zdCByZWNvcmQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnQuY2xpZW50SWQpO1xuXHRcdFx0aWYgKHJlY29yZCAmJiB0aGlzLl9oYXNTdWJzY3JpcHRpb25Jbk90aGVyQ29ubmVjdGlvbihyZWNvcmQsIGNsaWVudCwgc3ViLnVyaSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYWdlbnRTZXJ2aWNlLnVuc3Vic2NyaWJlKFVSSS5wYXJzZShzdWIudXJpKSwgY2xpZW50LmNsaWVudElkKTtcblx0XHRcdGlmIChpc0FocENoYXRDaGFubmVsKHN1Yi51cmkpKSB7XG5cdFx0XHRcdHRoaXMuX3JlbGVhc2VBY3RpdmVDbGllbnRGb3JTZXNzaW9uKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoc3ViLnVyaSksIGNsaWVudC5jbGllbnRJZCwgc3ViLnVyaSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViLnVyaSk7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhdCBvZiBzdGF0ZT8uY2hhdHMgPz8gW10pIHtcblx0XHRcdFx0XHR0aGlzLl9yZWxlYXNlQWN0aXZlQ2xpZW50Rm9yU2Vzc2lvbihzdWIudXJpLCBjbGllbnQuY2xpZW50SWQsIGNoYXQucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChzdWIua2luZCA9PT0gQ2hhbm5lbEtpbmQuUmVzb3VyY2VXYXRjaCkge1xuXHRcdFx0dGhpcy5fYWdlbnRTZXJ2aWNlLm9uUmVzb3VyY2VXYXRjaFVuc3Vic2NyaWJlZChzdWIudXJpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRmFuIG91dCBhbiBPVExQIGxvZyByZWNvcmQgdG8gZXZlcnkgY29ubmVjdGVkIGNsaWVudCB0aGF0IGhhc1xuXHQgKiBzdWJzY3JpYmVkIHRvIGEgbG9ncyBjaGFubmVsIHdob3NlIGB7bGV2ZWx9YCBiYW5kIGluY2x1ZGVzIHRoZVxuXHQgKiByZWNvcmQncyBgc2V2ZXJpdHlOdW1iZXJgLiBUaGUgbm90aWZpY2F0aW9uJ3MgYGNoYW5uZWxgIGZpZWxkIGlzXG5cdCAqIHRoZSBjYW5vbmljYWwgVVJJIHRoZSBjbGllbnQgc3Vic2NyaWJlZCBhZ2FpbnN0IFx1MjAxNCBjbGllbnRzIGNhblxuXHQgKiByb3V0ZSBieSBVUkkgd2l0aG91dCByZS1kZXJpdmluZyB0aGUgbGV2ZWwuXG5cdCAqL1xuXHRwcml2YXRlIF9icm9hZGNhc3RPdGxwTG9nKHJlY29yZDogSU90bHBMb2dSZWNvcmQpOiB2b2lkIHtcblx0XHRjb25zdCBwYXlsb2FkID0gdG9SZXNvdXJjZUxvZ3NQYXlsb2FkKHJlY29yZCk7XG5cdFx0Zm9yIChjb25zdCBjbGllbnRSZWNvcmQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gdGhpcy5fZ2V0QWN0aXZlQ2xpZW50RnJvbVJlY29yZChjbGllbnRSZWNvcmQpO1xuXHRcdFx0aWYgKCFjbGllbnQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHN1YiBvZiBjbGllbnQuc3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0XHRpZiAoc3ViLmtpbmQgIT09IENoYW5uZWxLaW5kLk90bHBMb2dzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlY29yZC5zZXZlcml0eU51bWJlciA8IGxldmVsVG9TZXZlcml0eU51bWJlcihzdWIubGV2ZWwpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbXNnOiBBaHBTZXJ2ZXJOb3RpZmljYXRpb248J290bHAvZXhwb3J0TG9ncyc+ID0ge1xuXHRcdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRcdG1ldGhvZDogJ290bHAvZXhwb3J0TG9ncycsXG5cdFx0XHRcdFx0cGFyYW1zOiB7IGNoYW5uZWw6IHN1Yi51cmksIHBheWxvYWQgfSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKG1zZyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNSZWxldmFudFRvQ2xpZW50KGNsaWVudDogSUNvbm5lY3RlZENsaWVudCwgZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3ViID0gY2xpZW50LnN1YnNjcmlwdGlvbnMuZ2V0KGVudmVsb3BlLmNoYW5uZWwpO1xuXHRcdGlmIChzdWI/LmtpbmQgPT09IENoYW5uZWxLaW5kLlN0YXRlIHx8IHN1Yj8ua2luZCA9PT0gQ2hhbm5lbEtpbmQuUmVzb3VyY2VXYXRjaCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghaXNBaHBSb290Q2hhbm5lbChlbnZlbG9wZS5jaGFubmVsKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNBY3Rpb25FbnZlbG9wZVJlbGV2YW50VG9TdWJzY3JpcHRpb25VcmlzKGVudmVsb3BlLCB0aGlzLl9zdGF0ZUFuZFJlc291cmNlV2F0Y2hVcmlzKGNsaWVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSAqX3N0YXRlQW5kUmVzb3VyY2VXYXRjaFVyaXMoY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50KTogSXRlcmFibGU8c3RyaW5nPiB7XG5cdFx0Zm9yIChjb25zdCBzdWIgb2YgY2xpZW50LnN1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChzdWIua2luZCA9PT0gQ2hhbm5lbEtpbmQuU3RhdGUgfHwgc3ViLmtpbmQgPT09IENoYW5uZWxLaW5kLlJlc291cmNlV2F0Y2gpIHtcblx0XHRcdFx0eWllbGQgc3ViLnVyaTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tYW5hZ2VkU2V0dGluZ3NDb250cmlidXRpb25JZChjbGllbnRJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5fbWFuYWdlZFNldHRpbmdzT3duZXJJZH06JHtjbGllbnRJZH1gO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVjb3JkXSBvZiB0aGlzLl9jbGllbnRzKSB7XG5cdFx0XHR0aGlzLl9tYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLnJlbW92ZUNsaWVudFBlcm1pc3Npb25zKHRoaXMuX21hbmFnZWRTZXR0aW5nc0NvbnRyaWJ1dGlvbklkKGNsaWVudElkKSk7XG5cdFx0XHRpZiAocmVjb3JkLnN0YXRlID09PSAnYWN0aXZlJykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgWy4uLnJlY29yZC5jb25uZWN0aW9uc10pIHtcblx0XHRcdFx0XHRjb25zdCBzdWJzY3JpcHRpb25Db3VudCA9IGNvbm5lY3Rpb24uc3Vic2NyaXB0aW9ucy5zaXplO1xuXHRcdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmRleCA9IHJlY29yZC5jb25uZWN0aW9ucy5pbmRleE9mKGNvbm5lY3Rpb24pO1xuXHRcdFx0XHRcdGlmIChjb25uZWN0aW9uSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRyZWNvcmQuY29ubmVjdGlvbnMuc3BsaWNlKGNvbm5lY3Rpb25JbmRleCwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3JlbGVhc2VDbGllbnRTdWJzY3JpcHRpb25zKGNvbm5lY3Rpb24sIHJlY29yZCk7XG5cdFx0XHRcdFx0dGhpcy5fcmVqZWN0UGVuZGluZ1JldmVyc2VSZXF1ZXN0c0ZvckNvbm5lY3Rpb24oY29ubmVjdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3J0Q2xpZW50RGlzY29ubmVjdGVkKGNvbm5lY3Rpb24sIHN1YnNjcmlwdGlvbkNvdW50KTtcblx0XHRcdFx0XHRjb25uZWN0aW9uLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVjb3JkLmRpc2Nvbm5lY3RUaW1lb3V0cy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NsaWVudHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IFssIHBlbmRpbmddIG9mIHRoaXMuX3BlbmRpbmdSZXZlcnNlUmVxdWVzdHMpIHtcblx0XHRcdHBlbmRpbmcucmVqZWN0KG5ldyBFcnJvcignUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyIGRpc3Bvc2VkJykpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nUmV2ZXJzZVJlcXVlc3RzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVwbGF5QnVmZmVyLmxlbmd0aCA9IDA7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksZUFBZSx1QkFBdUI7QUFDM0QsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLCtCQUErQixxQkFBcUIsd0JBQXdCLDBCQUEwQix1QkFBdUIsMkJBQWtFO0FBQ3hNLFNBQVMsb0JBQXlFO0FB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
