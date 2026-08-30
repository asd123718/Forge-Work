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
import { DeferredPromise, raceCancellationError, Sequencer, timeout } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { AUTH_SCOPE_SEPARATOR, fetchAuthorizationServerMetadata, fetchResourceMetadata, getDefaultMetadataForUrl, parseWWWAuthenticateHeader, scopesMatch } from "../../../base/common/oauth.js";
import { SSEParser } from "../../../base/common/sseParser.js";
import { URI } from "../../../base/common/uri.js";
import { vArray, vNumber, vObj, vObjAny, vOptionalProp, vString } from "../../../base/common/validation.js";
import { ConfigurationTarget } from "../../../platform/configuration/common/configuration.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { canLog, ILogService, LogLevel } from "../../../platform/log/common/log.js";
import product from "../../../platform/product/common/product.js";
import { StorageScope } from "../../../platform/storage/common/storage.js";
import { extensionPrefixedIdentifier, McpConnectionState, McpServerLaunch, McpServerStaticToolAvailability, McpServerTransportType, UserInteractionRequiredError } from "../../contrib/mcp/common/mcpTypes.js";
import { MCP } from "../../contrib/mcp/common/modelContextProtocol.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { MainContext, IAuthResourceMetadataSource, IAuthServerMetadataSource } from "./extHost.protocol.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import * as Convert from "./extHostTypeConverters.js";
import { McpToolAvailability } from "./extHostTypes.js";
import { IExtHostVariableResolverProvider } from "./extHostVariableResolverService.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
const IExtHostMpcService = createDecorator("IExtHostMpcService");
const serverDataValidation = vObj({
  label: vString(),
  version: vOptionalProp(vString()),
  metadata: vOptionalProp(vObj({
    capabilities: vOptionalProp(vObjAny()),
    serverInfo: vOptionalProp(vObjAny()),
    tools: vOptionalProp(vArray(vObj({
      availability: vNumber(),
      definition: vObjAny()
    })))
  })),
  authentication: vOptionalProp(vObj({
    providerId: vString(),
    scopes: vArray(vString())
  }))
});
let ExtHostMcpService = class extends Disposable {
  constructor(extHostRpc, _logService, _extHostInitData, _workspaceService, _variableResolver) {
    super();
    this._logService = _logService;
    this._extHostInitData = _extHostInitData;
    this._workspaceService = _workspaceService;
    this._variableResolver = _variableResolver;
    this._initialProviderPromises = /* @__PURE__ */ new Set();
    this._sseEventSources = this._register(new DisposableMap());
    this._unresolvedMcpServers = /* @__PURE__ */ new Map();
    // MCP server definitions synced from main thread
    this._onDidChangeMcpServerDefinitions = this._register(new Emitter());
    this.onDidChangeMcpServerDefinitions = this._onDidChangeMcpServerDefinitions.event;
    this._mcpServerDefinitions = [];
    // Active gateways with their server emitters for dynamic updates
    this._activeGateways = /* @__PURE__ */ new Map();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadMcp);
  }
  /** Returns all MCP server definitions known to the editor. */
  get mcpServerDefinitions() {
    return this._mcpServerDefinitions;
  }
  /** Called by main thread to notify that MCP server definitions have changed. */
  $onDidChangeMcpServerDefinitions(servers) {
    this._mcpServerDefinitions = servers.map((dto) => Convert.McpServerDefinition.to(dto));
    this._onDidChangeMcpServerDefinitions.fire();
  }
  $startMcp(id, opts) {
    this._startMcp(id, McpServerLaunch.fromSerialized(opts.launch), opts.defaultCwd && URI.revive(opts.defaultCwd), opts.errorOnUserInteraction);
  }
  _startMcp(id, launch, _defaultCwd, errorOnUserInteraction) {
    if (launch.type === McpServerTransportType.HTTP) {
      this._sseEventSources.set(id, new McpHTTPHandle(id, launch, this._proxy, this._logService, errorOnUserInteraction));
      return;
    }
    throw new Error("not implemented");
  }
  async $substituteVariables(_workspaceFolder, value) {
    const folderURI = URI.revive(_workspaceFolder);
    const folder = folderURI && await this._workspaceService.resolveWorkspaceFolder(folderURI);
    const variableResolver = await this._variableResolver.getResolver();
    return variableResolver.resolveAsync(folder && {
      uri: folder.uri,
      name: folder.name,
      index: folder.index
    }, value);
  }
  $stopMcp(id) {
    this._sseEventSources.get(id)?.close().then(() => this._didClose(id));
  }
  _didClose(id) {
    this._sseEventSources.deleteAndDispose(id);
  }
  $sendMessage(id, message) {
    this._sseEventSources.get(id)?.send(message);
  }
  async $waitForInitialCollectionProviders() {
    await Promise.all(this._initialProviderPromises);
  }
  async $resolveMcpLaunch(collectionId, label) {
    const rec = this._unresolvedMcpServers.get(collectionId);
    if (!rec) {
      return;
    }
    const server = rec.servers.find((s) => s.label === label);
    if (!server) {
      return;
    }
    if (!rec.provider.resolveMcpServerDefinition) {
      return Convert.McpServerDefinition.from(server);
    }
    const resolved = await rec.provider.resolveMcpServerDefinition(server, CancellationToken.None);
    return resolved ? Convert.McpServerDefinition.from(resolved) : void 0;
  }
  /** {@link vscode.lm.registerMcpServerDefinitionProvider} */
  registerMcpConfigurationProvider(extension, id, provider) {
    const store = new DisposableStore();
    const metadata = extension.contributes?.mcpServerDefinitionProviders?.find((m) => m.id === id);
    if (!metadata) {
      throw new Error(`MCP configuration providers must be registered in the contributes.mcpServerDefinitionProviders array within your package.json, but "${id}" was not`);
    }
    const mcp = {
      id: extensionPrefixedIdentifier(extension.identifier, id),
      isTrustedByDefault: true,
      label: metadata?.label ?? extension.displayName ?? extension.name,
      scope: StorageScope.WORKSPACE,
      canResolveLaunch: typeof provider.resolveMcpServerDefinition === "function",
      extensionId: extension.identifier.value,
      configTarget: this._extHostInitData.remote.isRemote ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER
    };
    const update = async () => {
      const list = await provider.provideMcpServerDefinitions(CancellationToken.None);
      this._unresolvedMcpServers.set(mcp.id, { servers: list ?? [], provider });
      const servers = [];
      for (const item of list ?? []) {
        let id2 = ExtensionIdentifier.toKey(extension.identifier) + "/" + item.label;
        if (servers.some((s) => s.id === id2)) {
          let i = 2;
          while (servers.some((s) => s.id === id2 + i)) {
            i++;
          }
          id2 = id2 + i;
        }
        serverDataValidation.validateOrThrow(item);
        if (item.authentication) {
          checkProposedApiEnabled(extension, "mcpToolDefinitions");
        }
        let staticMetadata;
        const castAs2 = item;
        if (isProposedApiEnabled(extension, "mcpToolDefinitions") && castAs2.metadata) {
          staticMetadata = {
            capabilities: castAs2.metadata.capabilities,
            instructions: castAs2.metadata.instructions,
            serverInfo: castAs2.metadata.serverInfo,
            tools: castAs2.metadata.tools?.map((t) => ({
              availability: t.availability === McpToolAvailability.Dynamic ? McpServerStaticToolAvailability.Dynamic : McpServerStaticToolAvailability.Initial,
              definition: t.definition
            }))
          };
        }
        servers.push({
          id: id2,
          label: item.label,
          cacheNonce: item.version || "$$NONE",
          staticMetadata,
          launch: Convert.McpServerDefinition.from(item)
        });
      }
      this._proxy.$upsertMcpCollection(mcp, servers);
    };
    store.add(toDisposable(() => {
      this._unresolvedMcpServers.delete(mcp.id);
      this._proxy.$deleteMcpCollection(mcp.id);
    }));
    if (provider.onDidChangeMcpServerDefinitions) {
      store.add(provider.onDidChangeMcpServerDefinitions(update));
    }
    if (provider.onDidChangeServerDefinitions) {
      store.add(provider.onDidChangeServerDefinitions(update));
    }
    if (provider.onDidChange) {
      store.add(provider.onDidChange(update));
    }
    const promise = new Promise((resolve) => {
      setTimeout(() => update().finally(() => {
        this._initialProviderPromises.delete(promise);
        resolve();
      }), 0);
    });
    this._initialProviderPromises.add(promise);
    return store;
  }
  /** {@link vscode.lm.startMcpGateway} */
  async startMcpGateway(chatSessionResource) {
    const result = await this._proxy.$startMcpGateway(chatSessionResource?.toJSON());
    if (!result) {
      return void 0;
    }
    const gatewayId = result.gatewayId;
    const servers = result.servers.map((s) => ({
      label: s.label,
      address: URI.revive(s.address)
    }));
    const onDidChangeServers = new Emitter();
    this._activeGateways.set(gatewayId, { servers, onDidChangeServers });
    return {
      get servers() {
        return servers;
      },
      onDidChangeServers: onDidChangeServers.event,
      dispose: () => {
        this._activeGateways.delete(gatewayId);
        onDidChangeServers.dispose();
        this._proxy.$disposeMcpGateway(gatewayId);
      }
    };
  }
  /** Called by main thread to notify that a gateway's server set has changed. */
  $onDidChangeGatewayServers(gatewayId, newServers) {
    const gateway = this._activeGateways.get(gatewayId);
    if (!gateway) {
      return;
    }
    const servers = newServers.map((s) => ({
      label: s.label,
      address: URI.revive(s.address)
    }));
    gateway.servers.length = 0;
    gateway.servers.push(...servers);
    gateway.onDidChangeServers.fire(servers);
  }
};
ExtHostMcpService = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostInitDataService),
  __decorateParam(3, IExtHostWorkspace),
  __decorateParam(4, IExtHostVariableResolverProvider)
], ExtHostMcpService);
function stringifyError(err) {
  if (!(err instanceof Error)) {
    return String(err);
  }
  let msg = String(err);
  let cause = err.cause;
  for (let depth = 0; cause !== void 0 && depth < 5; depth++) {
    msg += `: ${cause instanceof Error ? cause.message || String(cause) : String(cause)}`;
    cause = cause instanceof Error ? cause.cause : void 0;
  }
  return msg;
}
var HttpMode = /* @__PURE__ */ ((HttpMode2) => {
  HttpMode2[HttpMode2["Unknown"] = 0] = "Unknown";
  HttpMode2[HttpMode2["Http"] = 1] = "Http";
  HttpMode2[HttpMode2["SSE"] = 2] = "SSE";
  return HttpMode2;
})(HttpMode || {});
const MAX_FOLLOW_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];
const ALLOWED_REDIRECT_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
const CROSS_ORIGIN_STRIPPED_HEADERS = /* @__PURE__ */ new Set(["authorization", "cookie", "proxy-authorization", "mcp-session-id"]);
function setHostHeader(headers, name, value) {
  for (const configuredName of Object.keys(headers)) {
    if (configuredName.toLowerCase() === name.toLowerCase()) {
      delete headers[configuredName];
    }
  }
  headers[name] = value;
}
class McpHTTPHandle extends Disposable {
  constructor(_id, _launch, _proxy, _logService, _errorOnUserInteraction) {
    super();
    this._id = _id;
    this._launch = _launch;
    this._proxy = _proxy;
    this._logService = _logService;
    this._errorOnUserInteraction = _errorOnUserInteraction;
    this._requestSequencer = new Sequencer();
    this._postEndpoint = new DeferredPromise();
    this._mode = { value: 0 /* Unknown */ };
    this._cts = new CancellationTokenSource();
    this._abortCtrl = new AbortController();
    this._didSendClose = false;
    this._register(toDisposable(() => {
      this._abortCtrl.abort();
      this._cts.dispose(true);
    }));
    this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Running });
  }
  async send(message) {
    try {
      if (this._mode.value === 0 /* Unknown */) {
        await this._requestSequencer.queue(() => this._send(message));
      } else {
        await this._send(message);
      }
    } catch (err) {
      const msg = `Error sending message to ${this._launch.uri}: ${stringifyError(err)}`;
      this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: msg });
    }
  }
  async close() {
    if (this._mode.value === 1 /* Http */ && this._mode.sessionId && !this._didSendClose) {
      this._didSendClose = true;
      try {
        await this._closeSession(this._mode.sessionId);
      } catch {
      }
    }
    this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped });
  }
  async _closeSession(sessionId) {
    const headers = {
      ...Object.fromEntries(this._launch.headers),
      "Mcp-Session-Id": sessionId
    };
    try {
      await this._addAuthHeader(headers, { errorOnUserInteraction: true });
    } catch (e) {
      this._log(LogLevel.Debug, `Skipping session close: authentication no longer available`);
      return;
    }
    await this._fetch(
      this._launch.uri.toString(true),
      {
        method: "DELETE",
        headers
      }
    );
  }
  _send(message) {
    if (this._mode.value === 2 /* SSE */) {
      return this._sendLegacySSE(this._mode.endpoint, message);
    } else {
      return this._sendStreamableHttp(message, this._mode.value === 1 /* Http */ ? this._mode.sessionId : void 0);
    }
  }
  /**
   * Sends a streamable-HTTP request.
   * 1. Posts to the endpoint
   * 2. Updates internal state as needed. Falls back to SSE if appropriate.
   * 3. If the response body is empty, JSON, or a JSON stream, handle it appropriately.
   */
  async _sendStreamableHttp(message, sessionId) {
    const asBytes = new TextEncoder().encode(message);
    const headers = {
      ...Object.fromEntries(this._launch.headers),
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json"
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }
    await this._addAuthHeader(headers);
    const res = await this._fetchWithAuthRetry(
      this._launch.uri.toString(true),
      {
        method: "POST",
        headers,
        body: asBytes
      },
      headers
    );
    const wasUnknown = this._mode.value === 0 /* Unknown */;
    const nextSessionId = res.headers.get("Mcp-Session-Id");
    if (nextSessionId) {
      this._mode = { value: 1 /* Http */, sessionId: nextSessionId };
    }
    if (this._mode.value === 0 /* Unknown */ && // We care about 4xx errors...
    res.status >= 400 && res.status < 500 && !isAuthStatusCode(res.status)) {
      this._log(LogLevel.Info, `${res.status} status sending message to ${this._launch.uri}, will attempt to fall back to legacy SSE`);
      this._sseFallbackWithMessage(message);
      return;
    }
    if (res.status >= 300) {
      const retryWithSessionId = this._mode.value === 1 /* Http */ && !!this._mode.sessionId && (res.status === 400 || res.status === 404);
      this._proxy.$onDidChangeState(this._id, {
        state: McpConnectionState.Kind.Error,
        message: `${res.status} status sending message to ${this._launch.uri}: ${await this._getErrText(res)}` + (retryWithSessionId ? `; will retry with new session ID` : ""),
        shouldRetry: retryWithSessionId
      });
      return;
    }
    if (this._mode.value === 0 /* Unknown */) {
      this._mode = { value: 1 /* Http */, sessionId: void 0 };
    }
    if (wasUnknown) {
      this._attachStreamableBackchannel();
    }
    await this._handleSuccessfulStreamableHttp(res, message);
  }
  async _sseFallbackWithMessage(message) {
    const endpoint = await this._attachSSE();
    if (endpoint) {
      this._mode = { value: 2 /* SSE */, endpoint };
      await this._sendLegacySSE(endpoint, message);
    }
  }
  async _handleSuccessfulStreamableHttp(res, message) {
    if (res.status === 202) {
      return;
    }
    const contentType = res.headers.get("Content-Type")?.toLowerCase() || "";
    if (contentType.startsWith("text/event-stream")) {
      const parser = new SSEParser((event) => {
        if (event.type === "message") {
          this._proxy.$onDidReceiveMessage(this._id, event.data);
        } else if (event.type === "endpoint") {
          this._log(LogLevel.Warning, `Received SSE endpoint from a POST to ${this._launch.uri}, will fall back to legacy SSE`);
          this._sseFallbackWithMessage(message);
          throw new CancellationError();
        }
      });
      try {
        await this._doSSE(parser, res);
      } catch (err) {
        this._log(LogLevel.Warning, `Error reading SSE stream: ${stringifyError(err)}`);
      }
    } else if (contentType.startsWith("application/json")) {
      this._proxy.$onDidReceiveMessage(this._id, await res.text());
    } else {
      const responseBody = await res.text();
      if (isJSON(responseBody)) {
        this._proxy.$onDidReceiveMessage(this._id, responseBody);
      } else {
        this._log(LogLevel.Warning, `Unexpected ${res.status} response for request: ${responseBody}`);
      }
    }
  }
  /**
   * Attaches the SSE backchannel that streamable HTTP servers can use
   * for async notifications. This is a "MAY" support, so if the server gives
   * us a 4xx code, we'll stop trying to connect..
   */
  async _attachStreamableBackchannel() {
    let lastEventId;
    let canReconnectAt;
    for (let retry = 0; !this._store.isDisposed; retry++) {
      if (canReconnectAt !== void 0) {
        await timeout(Math.max(0, canReconnectAt - Date.now()), this._cts.token);
        canReconnectAt = void 0;
      } else {
        await timeout(Math.min(retry * 1e3, 3e4), this._cts.token);
      }
      let res;
      try {
        const headers = {
          ...Object.fromEntries(this._launch.headers),
          "Accept": "text/event-stream"
        };
        await this._addAuthHeader(headers);
        if (this._mode.value === 1 /* Http */ && this._mode.sessionId !== void 0) {
          headers["Mcp-Session-Id"] = this._mode.sessionId;
        }
        if (lastEventId) {
          headers["Last-Event-ID"] = lastEventId;
        }
        res = await this._fetchWithAuthRetry(
          this._launch.uri.toString(true),
          {
            method: "GET",
            headers
          },
          headers
        );
      } catch (e) {
        this._log(LogLevel.Info, `Error connecting to ${this._launch.uri} for async notifications, will retry`);
        continue;
      }
      if (res.status >= 400) {
        this._log(LogLevel.Debug, `${res.status} status connecting to ${this._launch.uri} for async notifications; they will be disabled: ${await this._getErrText(res)}`);
        return;
      }
      if (res.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
        retry = 0;
      }
      const parser = new SSEParser((event) => {
        if (event.retry) {
          canReconnectAt = Date.now() + event.retry;
        }
        if (event.type === "message" && event.data) {
          this._proxy.$onDidReceiveMessage(this._id, event.data);
        }
        if (event.id) {
          lastEventId = event.id;
        }
      });
      try {
        await this._doSSE(parser, res);
      } catch (e) {
        this._log(LogLevel.Info, `Error reading from async stream, we will reconnect: ${e}`);
      }
    }
  }
  /**
   * Starts a legacy SSE attachment, where the SSE response is the session lifetime.
   * Unlike `_attachStreamableBackchannel`, this fails the server if it disconnects.
   */
  async _attachSSE() {
    const postEndpoint = new DeferredPromise();
    const headers = {
      ...Object.fromEntries(this._launch.headers),
      "Accept": "text/event-stream"
    };
    await this._addAuthHeader(headers);
    let res;
    try {
      res = await this._fetchWithAuthRetry(
        this._launch.uri.toString(true),
        {
          method: "GET",
          headers
        },
        headers
      );
      if (res.status >= 300) {
        this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `${res.status} status connecting to ${this._launch.uri} as SSE: ${await this._getErrText(res)}` });
        return;
      }
    } catch (e) {
      this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `Error connecting to ${this._launch.uri} as SSE: ${e}` });
      return;
    }
    const parser = new SSEParser((event) => {
      if (event.type === "message") {
        this._proxy.$onDidReceiveMessage(this._id, event.data);
      } else if (event.type === "endpoint") {
        postEndpoint.complete(new URL(event.data, this._launch.uri.toString(true)).toString());
      }
    });
    this._register(toDisposable(() => postEndpoint.cancel()));
    this._doSSE(parser, res).catch((err) => {
      this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Error, message: `Error reading SSE stream: ${stringifyError(err)}` });
    });
    return postEndpoint.p;
  }
  /**
   * Sends a legacy SSE message to the server. The response is always empty and
   * is otherwise received in {@link _attachSSE}'s loop.
   */
  async _sendLegacySSE(url, message) {
    const asBytes = new TextEncoder().encode(message);
    const headers = {
      ...Object.fromEntries(this._launch.headers),
      "Content-Type": "application/json"
    };
    await this._addAuthHeader(headers);
    const res = await this._fetch(url, {
      method: "POST",
      headers,
      body: asBytes
    });
    if (res.status >= 300) {
      this._log(LogLevel.Warning, `${res.status} status sending message to ${this._postEndpoint}: ${await this._getErrText(res)}`);
    }
  }
  /** Generic handle to pipe a response into an SSE parser. */
  async _doSSE(parser, res) {
    if (!res.body) {
      return;
    }
    const reader = res.body.getReader();
    let chunk;
    do {
      try {
        chunk = await raceCancellationError(reader.read(), this._cts.token);
      } catch (err) {
        reader.cancel();
        if (this._store.isDisposed) {
          return;
        } else {
          throw err;
        }
      }
      if (chunk.value) {
        parser.feed(chunk.value);
      }
    } while (!chunk.done);
  }
  async _addAuthHeader(headers, options) {
    const errorOnUserInteraction = options?.errorOnUserInteraction ?? this._errorOnUserInteraction;
    if (this._authMetadata) {
      try {
        const authDetails = {
          authorizationServer: this._authMetadata.authorizationServer.toJSON(),
          authorizationServerMetadata: this._authMetadata.serverMetadata,
          resourceMetadata: this._authMetadata.resourceMetadata,
          scopes: this._authMetadata.scopes,
          clientId: this._launch.oauth?.clientId,
          enterpriseManaged: this._launch.oauth?.enterpriseManaged
        };
        const token = await this._proxy.$getTokenFromServerMetadata(
          this._id,
          authDetails,
          {
            errorOnUserInteraction,
            forceNewRegistration: options?.forceNewRegistration
          }
        );
        if (token) {
          setHostHeader(headers, "Authorization", `Bearer ${token}`);
        }
      } catch (e) {
        if (UserInteractionRequiredError.is(e)) {
          this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped, reason: "needs-user-interaction" });
          throw new CancellationError();
        }
        this._log(LogLevel.Warning, `Error getting token from server metadata: ${String(e)}`);
      }
    }
    if (this._launch.authentication) {
      try {
        this._log(LogLevel.Debug, `Using provided authentication config: providerId=${this._launch.authentication.providerId}, scopes=${this._launch.authentication.scopes.join(", ")}`);
        const token = await this._proxy.$getTokenForProviderId(
          this._id,
          this._launch.authentication.providerId,
          this._launch.authentication.scopes,
          {
            errorOnUserInteraction,
            forceNewRegistration: options?.forceNewRegistration,
            clientId: this._launch.oauth?.clientId
          }
        );
        if (token) {
          setHostHeader(headers, "Authorization", `Bearer ${token}`);
          this._log(LogLevel.Info, "Successfully obtained token from provided authentication config");
        }
      } catch (e) {
        if (UserInteractionRequiredError.is(e)) {
          this._proxy.$onDidChangeState(this._id, { state: McpConnectionState.Kind.Stopped, reason: "needs-user-interaction" });
          throw new CancellationError();
        }
        this._log(LogLevel.Warning, `Error getting token from provided authentication config: ${String(e)}`);
      }
    }
    return headers;
  }
  _log(level, message) {
    if (!this._store.isDisposed) {
      this._proxy.$onDidPublishLog(this._id, level, message);
    }
  }
  async _getErrText(res) {
    try {
      return await res.text();
    } catch {
      return res.statusText;
    }
  }
  /**
   * Helper method to perform fetch with authentication retry logic.
   * If the initial request returns an auth error and we don't have auth metadata,
   * it will populate the auth metadata and retry once.
   * If we already have auth metadata, check if the scopes changed and update them.
   */
  async _fetchWithAuthRetry(mcpUrl, init, headers) {
    const doFetch = () => this._fetch(mcpUrl, init);
    let res = await doFetch();
    if (isAuthStatusCode(res.status)) {
      if (!this._authMetadata) {
        this._authMetadata = await createAuthMetadata(mcpUrl, res.headers, {
          sameOriginHeaders: {
            ...Object.fromEntries(this._launch.headers),
            "MCP-Protocol-Version": MCP.LATEST_PROTOCOL_VERSION
          },
          fetch: (url, init2) => this._fetch(url, init2),
          log: (level, message) => this._log(level, message)
        });
        this._proxy.$logMcpAuthSetup(this._authMetadata.telemetry);
        await this._addAuthHeader(headers);
        if (headers["Authorization"]) {
          init.headers = headers;
          res = await doFetch();
        }
      } else {
        if (this._authMetadata.update(res.headers)) {
          await this._addAuthHeader(headers);
          if (headers["Authorization"]) {
            init.headers = headers;
            res = await doFetch();
          }
        }
      }
    }
    if (headers["Authorization"] && isAuthStatusCode(res.status)) {
      const errorText = await this._getErrText(res);
      this._log(LogLevel.Info, `Received ${res.status} status with Authorization header, retrying with new auth registration. Error details: ${errorText || "no additional details"}`);
      await this._addAuthHeader(headers, { forceNewRegistration: true });
      res = await doFetch();
    }
    return res;
  }
  async _fetch(url, init) {
    setHostHeader(init.headers, "user-agent", `${product.nameLong}/${product.version}`);
    if (canLog(this._logService.getLevel(), LogLevel.Trace)) {
      const traceObj = { ...init, headers: { ...init.headers } };
      if (traceObj.body) {
        traceObj.body = new TextDecoder().decode(traceObj.body);
      }
      if (traceObj.headers?.Authorization) {
        traceObj.headers.Authorization = "***";
      }
      this._log(LogLevel.Trace, `Fetching ${url} with options: ${JSON.stringify(traceObj)}`);
    }
    let currentUrl = url;
    let response;
    for (let redirectCount = 0; redirectCount < MAX_FOLLOW_REDIRECTS; redirectCount++) {
      response = await this._fetchInternal(currentUrl, {
        ...init,
        signal: this._abortCtrl.signal,
        redirect: "manual"
      });
      if (!REDIRECT_STATUS_CODES.includes(response.status)) {
        break;
      }
      const location = response.headers.get("location");
      if (!location) {
        break;
      }
      const currentUrlParsed = new URL(currentUrl);
      const nextUrlParsed = new URL(location, currentUrl);
      if (!ALLOWED_REDIRECT_PROTOCOLS.has(nextUrlParsed.protocol)) {
        throw new Error(`MCP server redirected to a non-http(s) target (${nextUrlParsed.protocol}), which is not allowed`);
      }
      if (currentUrlParsed.origin !== nextUrlParsed.origin) {
        for (const name of Object.keys(init.headers)) {
          if (CROSS_ORIGIN_STRIPPED_HEADERS.has(name.toLowerCase())) {
            delete init.headers[name];
          }
        }
      }
      const nextUrl = nextUrlParsed.toString();
      this._log(LogLevel.Trace, `Redirect (${response.status}) from ${currentUrl} to ${nextUrl}`);
      currentUrl = nextUrl;
      if (response.status === 303 || (response.status === 301 || response.status === 302) && init.method === "POST") {
        init.method = "GET";
        delete init.body;
      }
    }
    if (canLog(this._logService.getLevel(), LogLevel.Trace)) {
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      this._log(LogLevel.Trace, `Fetched ${currentUrl}: ${JSON.stringify({
        status: response.status,
        headers
      })}`);
    }
    return response;
  }
  _fetchInternal(url, init) {
    return fetch(url, init);
  }
}
function isJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}
function isAuthStatusCode(status) {
  return status === 401 || status === 403;
}
class AuthMetadata {
  constructor(authorizationServer, serverMetadata, resourceMetadata, scopes, telemetry, _log) {
    this.authorizationServer = authorizationServer;
    this.serverMetadata = serverMetadata;
    this.resourceMetadata = resourceMetadata;
    this.telemetry = telemetry;
    this._log = _log;
    this._scopes = scopes;
  }
  get scopes() {
    return this._scopes;
  }
  update(responseHeaders) {
    const scopesChallenge = this._parseScopesFromResponse(responseHeaders);
    if (!scopesMatch(scopesChallenge, this._scopes)) {
      this._log(LogLevel.Info, `Scopes changed from ${JSON.stringify(this._scopes)} to ${JSON.stringify(scopesChallenge)}, updating`);
      this._scopes = scopesChallenge;
      return true;
    }
    return false;
  }
  _parseScopesFromResponse(responseHeaders) {
    const authHeader = responseHeaders.get("WWW-Authenticate");
    if (!authHeader) {
      return void 0;
    }
    const challenges = parseWWWAuthenticateHeader(authHeader);
    for (const challenge of challenges) {
      if (challenge.scheme === "Bearer" && challenge.params["scope"]) {
        const scopes = challenge.params["scope"].split(AUTH_SCOPE_SEPARATOR).filter((s) => s.trim().length);
        if (scopes.length) {
          this._log(LogLevel.Info, `Found scope challenge in WWW-Authenticate header: ${challenge.params["scope"]}`);
          return scopes;
        }
      }
    }
    return void 0;
  }
}
async function createAuthMetadata(resourceUrl, initialResponseHeaders, options) {
  const { sameOriginHeaders, fetch: fetch2, log } = options;
  let resourceMetadataSource = IAuthResourceMetadataSource.None;
  let serverMetadataSource;
  const { resourceMetadataChallenge, scopesChallenge: scopesChallengeFromHeader } = parseWWWAuthenticateHeaderForChallenges(initialResponseHeaders.get("WWW-Authenticate") ?? void 0, log);
  let serverMetadataUrl;
  let resource;
  let scopesChallenge = scopesChallengeFromHeader;
  try {
    const { metadata, discoveryUrl, errors } = await fetchResourceMetadata(resourceUrl, resourceMetadataChallenge, {
      sameOriginHeaders,
      fetch: (url, init) => fetch2(url, init)
    });
    for (const err of errors) {
      log(LogLevel.Warning, `Error fetching resource metadata: ${err}`);
    }
    log(LogLevel.Info, `Discovered resource metadata at ${discoveryUrl}`);
    resourceMetadataSource = resourceMetadataChallenge ? IAuthResourceMetadataSource.Header : IAuthResourceMetadataSource.WellKnown;
    serverMetadataUrl = metadata.authorization_servers?.[0];
    if (!serverMetadataUrl) {
      log(LogLevel.Warning, `No authorization_servers found in resource metadata ${discoveryUrl} - Is this resource metadata configured correctly?`);
    } else {
      log(LogLevel.Info, `Using auth server metadata url: ${serverMetadataUrl}`);
      serverMetadataSource = IAuthServerMetadataSource.ResourceMetadata;
    }
    scopesChallenge ??= metadata.scopes_supported;
    resource = metadata;
  } catch (e) {
    log(LogLevel.Warning, `Could not fetch resource metadata: ${String(e)}`);
  }
  const baseUrl = new URL(resourceUrl).origin;
  let additionalHeaders = {};
  if (!serverMetadataUrl) {
    serverMetadataUrl = baseUrl;
    if (sameOriginHeaders) {
      additionalHeaders = sameOriginHeaders;
    }
  }
  try {
    log(LogLevel.Debug, `Fetching auth server metadata for: ${serverMetadataUrl} ...`);
    const { metadata, discoveryUrl, errors } = await fetchAuthorizationServerMetadata(serverMetadataUrl, {
      additionalHeaders,
      fetch: (url, init) => fetch2(url, init)
    });
    for (const err of errors) {
      log(LogLevel.Warning, `Error fetching authorization server metadata: ${err}`);
    }
    log(LogLevel.Info, `Discovered authorization server metadata at ${discoveryUrl}`);
    serverMetadataSource ??= IAuthServerMetadataSource.WellKnown;
    return new AuthMetadata(
      URI.parse(serverMetadataUrl),
      metadata,
      resource,
      scopesChallenge,
      { resourceMetadataSource, serverMetadataSource },
      log
    );
  } catch (e) {
    log(LogLevel.Warning, `Error populating auth server metadata for ${serverMetadataUrl}: ${String(e)}`);
  }
  const defaultMetadata = getDefaultMetadataForUrl(new URL(baseUrl));
  log(LogLevel.Info, "Using default auth metadata");
  return new AuthMetadata(
    URI.parse(baseUrl),
    defaultMetadata,
    resource,
    scopesChallenge,
    { resourceMetadataSource, serverMetadataSource: IAuthServerMetadataSource.Default },
    log
  );
}
function parseWWWAuthenticateHeaderForChallenges(wwwAuthenticateValue, log) {
  if (!wwwAuthenticateValue) {
    return {};
  }
  let resourceMetadataChallenge;
  let scopesChallenge;
  const challenges = parseWWWAuthenticateHeader(wwwAuthenticateValue);
  for (const challenge of challenges) {
    if (challenge.scheme === "Bearer") {
      if (!resourceMetadataChallenge && challenge.params["resource_metadata"]) {
        resourceMetadataChallenge = challenge.params["resource_metadata"];
        log(LogLevel.Debug, `Found resource_metadata challenge in WWW-Authenticate header: ${resourceMetadataChallenge}`);
      }
      if (!scopesChallenge && challenge.params["scope"]) {
        const scopes = challenge.params["scope"].split(AUTH_SCOPE_SEPARATOR).filter((s) => s.trim().length);
        if (scopes.length) {
          log(LogLevel.Debug, `Found scope challenge in WWW-Authenticate header: ${challenge.params["scope"]}`);
          scopesChallenge = scopes;
        }
      }
      if (resourceMetadataChallenge && scopesChallenge) {
        break;
      }
    }
  }
  return { resourceMetadataChallenge, scopesChallenge };
}
export {
  ExtHostMcpService,
  IExtHostMpcService,
  McpHTTPHandle,
  createAuthMetadata
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0TWNwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJhY2VDYW5jZWxsYXRpb25FcnJvciwgU2VxdWVuY2VyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFVVEhfU0NPUEVfU0VQQVJBVE9SLCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhLCBnZXREZWZhdWx0TWV0YWRhdGFGb3JVcmwsIElBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgcGFyc2VXV1dBdXRoZW50aWNhdGVIZWFkZXIsIHNjb3Blc01hdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgU1NFUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3NlUGFyc2VyLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB2QXJyYXksIHZOdW1iZXIsIHZPYmosIHZPYmpBbnksIHZPcHRpb25hbFByb3AsIHZTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi92YWxpZGF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBjYW5Mb2csIElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBleHRlbnNpb25QcmVmaXhlZElkZW50aWZpZXIsIE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLCBNY3BDb25uZWN0aW9uU3RhdGUsIE1jcFNlcnZlckRlZmluaXRpb24sIE1jcFNlcnZlckxhdW5jaCwgTWNwU2VydmVyU3RhdGljTWV0YWRhdGEsIE1jcFNlcnZlclN0YXRpY1Rvb2xBdmFpbGFiaWxpdHksIE1jcFNlcnZlclRyYW5zcG9ydEhUVFAsIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUsIFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IgfSBmcm9tICcuLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE1jcFNoYXBlLCBJTWNwQXV0aGVudGljYXRpb25EZXRhaWxzLCBJQXV0aE1ldGFkYXRhU291cmNlLCBJU3RhcnRNY3BPcHRpb25zLCBNYWluQ29udGV4dCwgTWFpblRocmVhZE1jcFNoYXBlLCBJQXV0aFJlc291cmNlTWV0YWRhdGFTb3VyY2UsIElBdXRoU2VydmVyTWV0YWRhdGFTb3VyY2UgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RJbml0RGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBDb252ZXJ0IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IE1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTdGRpb1NlcnZlckRlZmluaXRpb24sIE1jcFRvb2xBdmFpbGFiaWxpdHkgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJQcm92aWRlciB9IGZyb20gJy4vZXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0V29ya3NwYWNlIH0gZnJvbSAnLi9leHRIb3N0V29ya3NwYWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0TXBjU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0SG9zdE1wY1NlcnZpY2U+KCdJRXh0SG9zdE1wY1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdE1wY1NlcnZpY2UgZXh0ZW5kcyBFeHRIb3N0TWNwU2hhcGUge1xuXHRyZWdpc3Rlck1jcENvbmZpZ3VyYXRpb25Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5NY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXIpOiBJRGlzcG9zYWJsZTtcblxuXHQvKiogRXZlbnQgdGhhdCBmaXJlcyB3aGVuIHRoZSBzZXQgb2YgTUNQIHNlcnZlciBkZWZpbml0aW9ucyBjaGFuZ2VzLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zOiBFdmVudDx2b2lkPjtcblxuXHQvKiogUmV0dXJucyBhbGwgTUNQIHNlcnZlciBkZWZpbml0aW9ucyBrbm93biB0byB0aGUgZWRpdG9yLiAqL1xuXHRyZWFkb25seSBtY3BTZXJ2ZXJEZWZpbml0aW9uczogcmVhZG9ubHkgdnNjb2RlLk1jcFNlcnZlckRlZmluaXRpb25bXTtcblxuXHQvKiogU3RhcnRzIGFuIE1DUCBnYXRld2F5IHRoYXQgZXhwb3NlcyBNQ1Agc2VydmVycyB2aWEgSFRUUCBlbmRwb2ludHMuICovXG5cdHN0YXJ0TWNwR2F0ZXdheShjaGF0U2Vzc2lvblJlc291cmNlPzogVVJJKTogUHJvbWlzZTx2c2NvZGUuTWNwR2F0ZXdheSB8IHVuZGVmaW5lZD47XG59XG5cbmNvbnN0IHNlcnZlckRhdGFWYWxpZGF0aW9uID0gdk9iaih7XG5cdGxhYmVsOiB2U3RyaW5nKCksXG5cdHZlcnNpb246IHZPcHRpb25hbFByb3AodlN0cmluZygpKSxcblx0bWV0YWRhdGE6IHZPcHRpb25hbFByb3Aodk9iaih7XG5cdFx0Y2FwYWJpbGl0aWVzOiB2T3B0aW9uYWxQcm9wKHZPYmpBbnkoKSksXG5cdFx0c2VydmVySW5mbzogdk9wdGlvbmFsUHJvcCh2T2JqQW55KCkpLFxuXHRcdHRvb2xzOiB2T3B0aW9uYWxQcm9wKHZBcnJheSh2T2JqKHtcblx0XHRcdGF2YWlsYWJpbGl0eTogdk51bWJlcigpLFxuXHRcdFx0ZGVmaW5pdGlvbjogdk9iakFueSgpLFxuXHRcdH0pKSksXG5cdH0pKSxcblx0YXV0aGVudGljYXRpb246IHZPcHRpb25hbFByb3Aodk9iaih7XG5cdFx0cHJvdmlkZXJJZDogdlN0cmluZygpLFxuXHRcdHNjb3BlczogdkFycmF5KHZTdHJpbmcoKSksXG5cdH0pKVxufSk7XG5cbi8vIENhbiBiZSB2YWxpZGF0ZWQgd2l0aDpcbi8vIGRlY2xhcmUgY29uc3QgX3NlcnZlckRhdGFWYWxpZGF0aW9uVGVzdDogdnNjb2RlLk1jcFN0ZGlvU2VydmVyRGVmaW5pdGlvbiB8IHZzY29kZS5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbjtcbi8vIGNvbnN0IF9zZXJ2ZXJEYXRhVmFsaWRhdGlvblByb2Q6IFZhbGlkYXRvclR5cGU8dHlwZW9mIHNlcnZlckRhdGFWYWxpZGF0aW9uPiA9IF9zZXJ2ZXJEYXRhVmFsaWRhdGlvblRlc3Q7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0TWNwU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0SG9zdE1wY1NlcnZpY2Uge1xuXHRwcm90ZWN0ZWQgX3Byb3h5OiBNYWluVGhyZWFkTWNwU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxQcm92aWRlclByb21pc2VzID0gbmV3IFNldDxQcm9taXNlPHZvaWQ+PigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3NzZUV2ZW50U291cmNlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgTWNwSFRUUEhhbmRsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VucmVzb2x2ZWRNY3BTZXJ2ZXJzID0gbmV3IE1hcDwvKiBjb2xsZWN0aW9uSWQgKi8gc3RyaW5nLCB7XG5cdFx0cHJvdmlkZXI6IHZzY29kZS5NY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXI7XG5cdFx0c2VydmVyczogdnNjb2RlLk1jcFNlcnZlckRlZmluaXRpb25bXTtcblx0fT4oKTtcblxuXHQvLyBNQ1Agc2VydmVyIGRlZmluaXRpb25zIHN5bmNlZCBmcm9tIG1haW4gdGhyZWFkXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWNwU2VydmVyRGVmaW5pdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9uczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zLmV2ZW50O1xuXHRwcml2YXRlIF9tY3BTZXJ2ZXJEZWZpbml0aW9uczogcmVhZG9ubHkgdnNjb2RlLk1jcFNlcnZlckRlZmluaXRpb25bXSA9IFtdO1xuXG5cdC8vIEFjdGl2ZSBnYXRld2F5cyB3aXRoIHRoZWlyIHNlcnZlciBlbWl0dGVycyBmb3IgZHluYW1pYyB1cGRhdGVzXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUdhdGV3YXlzID0gbmV3IE1hcDxzdHJpbmcsIHtcblx0XHRzZXJ2ZXJzOiB2c2NvZGUuTWNwR2F0ZXdheVNlcnZlcltdO1xuXHRcdG9uRGlkQ2hhbmdlU2VydmVyczogRW1pdHRlcjxyZWFkb25seSB2c2NvZGUuTWNwR2F0ZXdheVNlcnZlcltdPjtcblx0fT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdEluaXREYXRhOiBJRXh0SG9zdEluaXREYXRhU2VydmljZSxcblx0XHRASUV4dEhvc3RXb3Jrc3BhY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF93b3Jrc3BhY2VTZXJ2aWNlOiBJRXh0SG9zdFdvcmtzcGFjZSxcblx0XHRASUV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXIgcHJpdmF0ZSByZWFkb25seSBfdmFyaWFibGVSZXNvbHZlcjogSUV4dEhvc3RWYXJpYWJsZVJlc29sdmVyUHJvdmlkZXIsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRNY3ApO1xuXHR9XG5cblx0LyoqIFJldHVybnMgYWxsIE1DUCBzZXJ2ZXIgZGVmaW5pdGlvbnMga25vd24gdG8gdGhlIGVkaXRvci4gKi9cblx0Z2V0IG1jcFNlcnZlckRlZmluaXRpb25zKCk6IHJlYWRvbmx5IHZzY29kZS5NY3BTZXJ2ZXJEZWZpbml0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9tY3BTZXJ2ZXJEZWZpbml0aW9ucztcblx0fVxuXG5cdC8qKiBDYWxsZWQgYnkgbWFpbiB0aHJlYWQgdG8gbm90aWZ5IHRoYXQgTUNQIHNlcnZlciBkZWZpbml0aW9ucyBoYXZlIGNoYW5nZWQuICovXG5cdCRvbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zKHNlcnZlcnM6IE1jcFNlcnZlckRlZmluaXRpb24uU2VyaWFsaXplZFtdKTogdm9pZCB7XG5cdFx0dGhpcy5fbWNwU2VydmVyRGVmaW5pdGlvbnMgPSBzZXJ2ZXJzLm1hcChkdG8gPT4gQ29udmVydC5NY3BTZXJ2ZXJEZWZpbml0aW9uLnRvKGR0bykpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTWNwU2VydmVyRGVmaW5pdGlvbnMuZmlyZSgpO1xuXHR9XG5cblx0JHN0YXJ0TWNwKGlkOiBudW1iZXIsIG9wdHM6IElTdGFydE1jcE9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGFydE1jcChpZCwgTWNwU2VydmVyTGF1bmNoLmZyb21TZXJpYWxpemVkKG9wdHMubGF1bmNoKSwgb3B0cy5kZWZhdWx0Q3dkICYmIFVSSS5yZXZpdmUob3B0cy5kZWZhdWx0Q3dkKSwgb3B0cy5lcnJvck9uVXNlckludGVyYWN0aW9uKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfc3RhcnRNY3AoaWQ6IG51bWJlciwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gsIF9kZWZhdWx0Q3dkPzogVVJJLCBlcnJvck9uVXNlckludGVyYWN0aW9uPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChsYXVuY2gudHlwZSA9PT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5IVFRQKSB7XG5cdFx0XHR0aGlzLl9zc2VFdmVudFNvdXJjZXMuc2V0KGlkLCBuZXcgTWNwSFRUUEhhbmRsZShpZCwgbGF1bmNoLCB0aGlzLl9wcm94eSwgdGhpcy5fbG9nU2VydmljZSwgZXJyb3JPblVzZXJJbnRlcmFjdGlvbikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRhc3luYyAkc3Vic3RpdHV0ZVZhcmlhYmxlczxUPihfd29ya3NwYWNlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCB2YWx1ZTogVCk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGZvbGRlclVSSSA9IFVSSS5yZXZpdmUoX3dvcmtzcGFjZUZvbGRlcik7XG5cdFx0Y29uc3QgZm9sZGVyID0gZm9sZGVyVVJJICYmIGF3YWl0IHRoaXMuX3dvcmtzcGFjZVNlcnZpY2UucmVzb2x2ZVdvcmtzcGFjZUZvbGRlcihmb2xkZXJVUkkpO1xuXHRcdGNvbnN0IHZhcmlhYmxlUmVzb2x2ZXIgPSBhd2FpdCB0aGlzLl92YXJpYWJsZVJlc29sdmVyLmdldFJlc29sdmVyKCk7XG5cdFx0cmV0dXJuIHZhcmlhYmxlUmVzb2x2ZXIucmVzb2x2ZUFzeW5jKGZvbGRlciAmJiB7XG5cdFx0XHR1cmk6IGZvbGRlci51cmksXG5cdFx0XHRuYW1lOiBmb2xkZXIubmFtZSxcblx0XHRcdGluZGV4OiBmb2xkZXIuaW5kZXgsXG5cdFx0fSwgdmFsdWUpIGFzIFQ7XG5cdH1cblxuXHQkc3RvcE1jcChpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fc3NlRXZlbnRTb3VyY2VzLmdldChpZClcblx0XHRcdD8uY2xvc2UoKVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5fZGlkQ2xvc2UoaWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2RpZENsb3NlKGlkOiBudW1iZXIpIHtcblx0XHR0aGlzLl9zc2VFdmVudFNvdXJjZXMuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cdH1cblxuXHQkc2VuZE1lc3NhZ2UoaWQ6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc3NlRXZlbnRTb3VyY2VzLmdldChpZCk/LnNlbmQobWVzc2FnZSk7XG5cdH1cblxuXHRhc3luYyAkd2FpdEZvckluaXRpYWxDb2xsZWN0aW9uUHJvdmlkZXJzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHRoaXMuX2luaXRpYWxQcm92aWRlclByb21pc2VzKTtcblx0fVxuXG5cdGFzeW5jICRyZXNvbHZlTWNwTGF1bmNoKGNvbGxlY3Rpb25JZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogUHJvbWlzZTxNY3BTZXJ2ZXJMYXVuY2guU2VyaWFsaXplZCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlYyA9IHRoaXMuX3VucmVzb2x2ZWRNY3BTZXJ2ZXJzLmdldChjb2xsZWN0aW9uSWQpO1xuXHRcdGlmICghcmVjKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VydmVyID0gcmVjLnNlcnZlcnMuZmluZChzID0+IHMubGFiZWwgPT09IGxhYmVsKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXJlYy5wcm92aWRlci5yZXNvbHZlTWNwU2VydmVyRGVmaW5pdGlvbikge1xuXHRcdFx0cmV0dXJuIENvbnZlcnQuTWNwU2VydmVyRGVmaW5pdGlvbi5mcm9tKHNlcnZlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCByZWMucHJvdmlkZXIucmVzb2x2ZU1jcFNlcnZlckRlZmluaXRpb24oc2VydmVyLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gcmVzb2x2ZWQgPyBDb252ZXJ0Lk1jcFNlcnZlckRlZmluaXRpb24uZnJvbShyZXNvbHZlZCkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKioge0BsaW5rIHZzY29kZS5sbS5yZWdpc3Rlck1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcn0gKi9cblx0cHVibGljIHJlZ2lzdGVyTWNwQ29uZmlndXJhdGlvblByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLk1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IG1ldGFkYXRhID0gZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzPy5tY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzPy5maW5kKG0gPT4gbS5pZCA9PT0gaWQpO1xuXHRcdGlmICghbWV0YWRhdGEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTUNQIGNvbmZpZ3VyYXRpb24gcHJvdmlkZXJzIG11c3QgYmUgcmVnaXN0ZXJlZCBpbiB0aGUgY29udHJpYnV0ZXMubWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVycyBhcnJheSB3aXRoaW4geW91ciBwYWNrYWdlLmpzb24sIGJ1dCBcIiR7aWR9XCIgd2FzIG5vdGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1jcDogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24uRnJvbUV4dEhvc3QgPSB7XG5cdFx0XHRpZDogZXh0ZW5zaW9uUHJlZml4ZWRJZGVudGlmaWVyKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBpZCksXG5cdFx0XHRpc1RydXN0ZWRCeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRsYWJlbDogbWV0YWRhdGE/LmxhYmVsID8/IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24ubmFtZSxcblx0XHRcdHNjb3BlOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLFxuXHRcdFx0Y2FuUmVzb2x2ZUxhdW5jaDogdHlwZW9mIHByb3ZpZGVyLnJlc29sdmVNY3BTZXJ2ZXJEZWZpbml0aW9uID09PSAnZnVuY3Rpb24nLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdFx0Y29uZmlnVGFyZ2V0OiB0aGlzLl9leHRIb3N0SW5pdERhdGEucmVtb3RlLmlzUmVtb3RlID8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSA6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVNY3BTZXJ2ZXJEZWZpbml0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdHRoaXMuX3VucmVzb2x2ZWRNY3BTZXJ2ZXJzLnNldChtY3AuaWQsIHsgc2VydmVyczogbGlzdCA/PyBbXSwgcHJvdmlkZXIgfSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlcnM6IE1jcFNlcnZlckRlZmluaXRpb24uU2VyaWFsaXplZFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgbGlzdCA/PyBbXSkge1xuXHRcdFx0XHRsZXQgaWQgPSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbi5pZGVudGlmaWVyKSArICcvJyArIGl0ZW0ubGFiZWw7XG5cdFx0XHRcdGlmIChzZXJ2ZXJzLnNvbWUocyA9PiBzLmlkID09PSBpZCkpIHtcblx0XHRcdFx0XHRsZXQgaSA9IDI7XG5cdFx0XHRcdFx0d2hpbGUgKHNlcnZlcnMuc29tZShzID0+IHMuaWQgPT09IGlkICsgaSkpIHsgaSsrOyB9XG5cdFx0XHRcdFx0aWQgPSBpZCArIGk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZXJ2ZXJEYXRhVmFsaWRhdGlvbi52YWxpZGF0ZU9yVGhyb3coaXRlbSk7XG5cdFx0XHRcdGlmICgoaXRlbSBhcyB2c2NvZGUuTWNwSHR0cFNlcnZlckRlZmluaXRpb24yKS5hdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ21jcFRvb2xEZWZpbml0aW9ucycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHN0YXRpY01ldGFkYXRhOiBNY3BTZXJ2ZXJTdGF0aWNNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgY2FzdEFzMiA9IGl0ZW0gYXMgTWNwU3RkaW9TZXJ2ZXJEZWZpbml0aW9uIHwgTWNwSHR0cFNlcnZlckRlZmluaXRpb247XG5cdFx0XHRcdGlmIChpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdtY3BUb29sRGVmaW5pdGlvbnMnKSAmJiBjYXN0QXMyLm1ldGFkYXRhKSB7XG5cdFx0XHRcdFx0c3RhdGljTWV0YWRhdGEgPSB7XG5cdFx0XHRcdFx0XHRjYXBhYmlsaXRpZXM6IGNhc3RBczIubWV0YWRhdGEuY2FwYWJpbGl0aWVzIGFzIE1DUC5TZXJ2ZXJDYXBhYmlsaXRpZXMsXG5cdFx0XHRcdFx0XHRpbnN0cnVjdGlvbnM6IGNhc3RBczIubWV0YWRhdGEuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdFx0c2VydmVySW5mbzogY2FzdEFzMi5tZXRhZGF0YS5zZXJ2ZXJJbmZvIGFzIE1DUC5JbXBsZW1lbnRhdGlvbixcblx0XHRcdFx0XHRcdHRvb2xzOiBjYXN0QXMyLm1ldGFkYXRhLnRvb2xzPy5tYXAodCA9PiAoe1xuXHRcdFx0XHRcdFx0XHRhdmFpbGFiaWxpdHk6IHQuYXZhaWxhYmlsaXR5ID09PSBNY3BUb29sQXZhaWxhYmlsaXR5LkR5bmFtaWMgPyBNY3BTZXJ2ZXJTdGF0aWNUb29sQXZhaWxhYmlsaXR5LkR5bmFtaWMgOiBNY3BTZXJ2ZXJTdGF0aWNUb29sQXZhaWxhYmlsaXR5LkluaXRpYWwsXG5cdFx0XHRcdFx0XHRcdGRlZmluaXRpb246IHQuZGVmaW5pdGlvbiBhcyBNQ1AuVG9vbCxcblx0XHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VydmVycy5wdXNoKHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdFx0XHRjYWNoZU5vbmNlOiBpdGVtLnZlcnNpb24gfHwgJyQkTk9ORScsXG5cdFx0XHRcdFx0c3RhdGljTWV0YWRhdGEsXG5cdFx0XHRcdFx0bGF1bmNoOiBDb252ZXJ0Lk1jcFNlcnZlckRlZmluaXRpb24uZnJvbShpdGVtKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3Byb3h5LiR1cHNlcnRNY3BDb2xsZWN0aW9uKG1jcCwgc2VydmVycyk7XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdW5yZXNvbHZlZE1jcFNlcnZlcnMuZGVsZXRlKG1jcC5pZCk7XG5cdFx0XHR0aGlzLl9wcm94eS4kZGVsZXRlTWNwQ29sbGVjdGlvbihtY3AuaWQpO1xuXHRcdH0pKTtcblxuXHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zKSB7XG5cdFx0XHRzdG9yZS5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9ucyh1cGRhdGUpKTtcblx0XHR9XG5cdFx0Ly8gdG9kb0Bjb25ub3I0MzEyOiBwcm9wb3NlZCBBUEkgYmFjay1jb21wYXRcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRpZiAoKHByb3ZpZGVyIGFzIGFueSkub25EaWRDaGFuZ2VTZXJ2ZXJEZWZpbml0aW9ucykge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRzdG9yZS5hZGQoKHByb3ZpZGVyIGFzIGFueSkub25EaWRDaGFuZ2VTZXJ2ZXJEZWZpbml0aW9ucyh1cGRhdGUpKTtcblx0XHR9XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0aWYgKChwcm92aWRlciBhcyBhbnkpLm9uRGlkQ2hhbmdlKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHN0b3JlLmFkZCgocHJvdmlkZXIgYXMgYW55KS5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHVwZGF0ZSgpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9pbml0aWFsUHJvdmlkZXJQcm9taXNlcy5kZWxldGUocHJvbWlzZSk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pLCAwKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2luaXRpYWxQcm92aWRlclByb21pc2VzLmFkZChwcm9taXNlKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cdC8qKiB7QGxpbmsgdnNjb2RlLmxtLnN0YXJ0TWNwR2F0ZXdheX0gKi9cblx0cHVibGljIGFzeW5jIHN0YXJ0TWNwR2F0ZXdheShjaGF0U2Vzc2lvblJlc291cmNlPzogVVJJKTogUHJvbWlzZTx2c2NvZGUuTWNwR2F0ZXdheSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRzdGFydE1jcEdhdGV3YXkoY2hhdFNlc3Npb25SZXNvdXJjZT8udG9KU09OKCkpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdhdGV3YXlJZCA9IHJlc3VsdC5nYXRld2F5SWQ7XG5cdFx0Y29uc3Qgc2VydmVyczogdnNjb2RlLk1jcEdhdGV3YXlTZXJ2ZXJbXSA9IHJlc3VsdC5zZXJ2ZXJzLm1hcChzID0+ICh7XG5cdFx0XHRsYWJlbDogcy5sYWJlbCxcblx0XHRcdGFkZHJlc3M6IFVSSS5yZXZpdmUocy5hZGRyZXNzKSxcblx0XHR9KSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZXJ2ZXJzID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgdnNjb2RlLk1jcEdhdGV3YXlTZXJ2ZXJbXT4oKTtcblxuXHRcdHRoaXMuX2FjdGl2ZUdhdGV3YXlzLnNldChnYXRld2F5SWQsIHsgc2VydmVycywgb25EaWRDaGFuZ2VTZXJ2ZXJzIH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldCBzZXJ2ZXJzKCkgeyByZXR1cm4gc2VydmVyczsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlU2VydmVyczogb25EaWRDaGFuZ2VTZXJ2ZXJzLmV2ZW50LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVHYXRld2F5cy5kZWxldGUoZ2F0ZXdheUlkKTtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXJ2ZXJzLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGRpc3Bvc2VNY3BHYXRld2F5KGdhdGV3YXlJZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8qKiBDYWxsZWQgYnkgbWFpbiB0aHJlYWQgdG8gbm90aWZ5IHRoYXQgYSBnYXRld2F5J3Mgc2VydmVyIHNldCBoYXMgY2hhbmdlZC4gKi9cblx0JG9uRGlkQ2hhbmdlR2F0ZXdheVNlcnZlcnMoZ2F0ZXdheUlkOiBzdHJpbmcsIG5ld1NlcnZlcnM6IHsgbGFiZWw6IHN0cmluZzsgYWRkcmVzczogVXJpQ29tcG9uZW50cyB9W10pOiB2b2lkIHtcblx0XHRjb25zdCBnYXRld2F5ID0gdGhpcy5fYWN0aXZlR2F0ZXdheXMuZ2V0KGdhdGV3YXlJZCk7XG5cdFx0aWYgKCFnYXRld2F5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VydmVyczogdnNjb2RlLk1jcEdhdGV3YXlTZXJ2ZXJbXSA9IG5ld1NlcnZlcnMubWFwKHMgPT4gKHtcblx0XHRcdGxhYmVsOiBzLmxhYmVsLFxuXHRcdFx0YWRkcmVzczogVVJJLnJldml2ZShzLmFkZHJlc3MpLFxuXHRcdH0pKTtcblx0XHRnYXRld2F5LnNlcnZlcnMubGVuZ3RoID0gMDtcblx0XHRnYXRld2F5LnNlcnZlcnMucHVzaCguLi5zZXJ2ZXJzKTtcblx0XHRnYXRld2F5Lm9uRGlkQ2hhbmdlU2VydmVycy5maXJlKHNlcnZlcnMpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHN0cmluZ2lmeUVycm9yKGVycjogdW5rbm93bik6IHN0cmluZyB7XG5cdGlmICghKGVyciBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdHJldHVybiBTdHJpbmcoZXJyKTtcblx0fVxuXHRsZXQgbXNnID0gU3RyaW5nKGVycik7XG5cdGxldCBjYXVzZTogdW5rbm93biA9IGVyci5jYXVzZTtcblx0Zm9yIChsZXQgZGVwdGggPSAwOyBjYXVzZSAhPT0gdW5kZWZpbmVkICYmIGRlcHRoIDwgNTsgZGVwdGgrKykge1xuXHRcdG1zZyArPSBgOiAke2NhdXNlIGluc3RhbmNlb2YgRXJyb3IgPyAoY2F1c2UubWVzc2FnZSB8fCBTdHJpbmcoY2F1c2UpKSA6IFN0cmluZyhjYXVzZSl9YDtcblx0XHRjYXVzZSA9IGNhdXNlIGluc3RhbmNlb2YgRXJyb3IgPyBjYXVzZS5jYXVzZSA6IHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gbXNnO1xufVxuXG5jb25zdCBlbnVtIEh0dHBNb2RlIHtcblx0VW5rbm93bixcblx0SHR0cCxcblx0U1NFLFxufVxuXG50eXBlIEh0dHBNb2RlVCA9XG5cdHwgeyB2YWx1ZTogSHR0cE1vZGUuVW5rbm93biB9XG5cdHwgeyB2YWx1ZTogSHR0cE1vZGUuSHR0cDsgc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQgfVxuXHR8IHsgdmFsdWU6IEh0dHBNb2RlLlNTRTsgZW5kcG9pbnQ6IHN0cmluZyB9O1xuXG5jb25zdCBNQVhfRk9MTE9XX1JFRElSRUNUUyA9IDU7XG5jb25zdCBSRURJUkVDVF9TVEFUVVNfQ09ERVMgPSBbMzAxLCAzMDIsIDMwMywgMzA3LCAzMDhdO1xuLy8gTUNQIHNlcnZlciBVUkxzIGFyZSByZXN0cmljdGVkIHRvIGh0dHAocykgYXQgY29uZmlndXJhdGlvbiB0aW1lOyB0aGUgcmVkaXJlY3Rcbi8vIHBhdGggbXVzdCBlbmZvcmNlIHRoZSBzYW1lIHNvIGEgTG9jYXRpb24gaGVhZGVyIGNhbm5vdCByZWFjaCB1bml4Oi8vLCBwaXBlOi8vLFxuLy8gZmlsZTovLywgZXRjLlxuY29uc3QgQUxMT1dFRF9SRURJUkVDVF9QUk9UT0NPTFMgPSBuZXcgU2V0KFsnaHR0cDonLCAnaHR0cHM6J10pO1xuLy8gQ3JlZGVudGlhbC1iZWFyaW5nIGhlYWRlcnMgdGhhdCBtdXN0IG5vdCBiZSByZXBsYXllZCB0byBhIGRpZmZlcmVudCBvcmlnaW5cbi8vIGFmdGVyIGEgcmVkaXJlY3QgKG1hdGNoZXMgYnJvd3NlciBmZXRjaCAvIGN1cmwgYmVoYXZpb3IpLiBDb21wYXJlZCBjYXNlLWluc2Vuc2l0aXZlbHkuXG5jb25zdCBDUk9TU19PUklHSU5fU1RSSVBQRURfSEVBREVSUyA9IG5ldyBTZXQoWydhdXRob3JpemF0aW9uJywgJ2Nvb2tpZScsICdwcm94eS1hdXRob3JpemF0aW9uJywgJ21jcC1zZXNzaW9uLWlkJ10pO1xuXG5mdW5jdGlvbiBzZXRIb3N0SGVhZGVyKGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIG5hbWU6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRmb3IgKGNvbnN0IGNvbmZpZ3VyZWROYW1lIG9mIE9iamVjdC5rZXlzKGhlYWRlcnMpKSB7XG5cdFx0aWYgKGNvbmZpZ3VyZWROYW1lLnRvTG93ZXJDYXNlKCkgPT09IG5hbWUudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0ZGVsZXRlIGhlYWRlcnNbY29uZmlndXJlZE5hbWVdO1xuXHRcdH1cblx0fVxuXHRoZWFkZXJzW25hbWVdID0gdmFsdWU7XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgYm90aCBNQ1AgSFRUUCBTdHJlYW1pbmcgYXMgd2VsbCBhcyBsZWdhY3kgU1NFLlxuICpcbiAqIFRoZSBmaXJzdCByZXF1ZXN0IHdpbGwgUE9TVCB0byB0aGUgZW5kcG9pbnQsIGFzc3VtaW5nIEhUVFAgc3RyZWFtaW5nLiBJZiB0aGVcbiAqIHNlcnZlciBpcyBsZWdhY3kgU1NFLCBpdCBzaG91bGQgcmV0dXJuIHNvbWUgNHh4IHN0YXR1cyBpbiB0aGF0IGNhc2UsXG4gKiBhbmQgd2UnbGwgYXV0b21hdGljYWxseSBmYWxsIGJhY2sgdG8gU1NFIGFuZCByZXNcbiAqL1xuZXhwb3J0IGNsYXNzIE1jcEhUVFBIYW5kbGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdFNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcG9zdEVuZHBvaW50ID0gbmV3IERlZmVycmVkUHJvbWlzZTx7IHVybDogc3RyaW5nOyB0cmFuc3BvcnQ6IE1jcFNlcnZlclRyYW5zcG9ydEhUVFAgfT4oKTtcblx0cHJpdmF0ZSBfbW9kZTogSHR0cE1vZGVUID0geyB2YWx1ZTogSHR0cE1vZGUuVW5rbm93biB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWJvcnRDdHJsID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRwcml2YXRlIF9hdXRoTWV0YWRhdGE/OiBBdXRoTWV0YWRhdGE7XG5cdHByaXZhdGUgX2RpZFNlbmRDbG9zZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGF1bmNoOiBNY3BTZXJ2ZXJUcmFuc3BvcnRIVFRQLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkTWNwU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXJyb3JPblVzZXJJbnRlcmFjdGlvbj86IGJvb2xlYW4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWJvcnRDdHJsLmFib3J0KCk7XG5cdFx0XHR0aGlzLl9jdHMuZGlzcG9zZSh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU3RhdGUodGhpcy5faWQsIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cdH1cblxuXHRhc3luYyBzZW5kKG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5fbW9kZS52YWx1ZSA9PT0gSHR0cE1vZGUuVW5rbm93bikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXF1ZXN0U2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuX3NlbmQobWVzc2FnZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2VuZChtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IG1zZyA9IGBFcnJvciBzZW5kaW5nIG1lc3NhZ2UgdG8gJHt0aGlzLl9sYXVuY2gudXJpfTogJHtzdHJpbmdpZnlFcnJvcihlcnIpfWA7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZSh0aGlzLl9pZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IsIG1lc3NhZ2U6IG1zZyB9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjbG9zZSgpIHtcblx0XHRpZiAodGhpcy5fbW9kZS52YWx1ZSA9PT0gSHR0cE1vZGUuSHR0cCAmJiB0aGlzLl9tb2RlLnNlc3Npb25JZCAmJiAhdGhpcy5fZGlkU2VuZENsb3NlKSB7XG5cdFx0XHR0aGlzLl9kaWRTZW5kQ2xvc2UgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY2xvc2VTZXNzaW9uKHRoaXMuX21vZGUuc2Vzc2lvbklkKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmVkIC0tIGFscmVhZHkgbG9nZ2VkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU3RhdGUodGhpcy5faWQsIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jbG9zZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0Li4uT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuX2xhdW5jaC5oZWFkZXJzKSxcblx0XHRcdCdNY3AtU2Vzc2lvbi1JZCc6IHNlc3Npb25JZCxcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2FkZEF1dGhIZWFkZXIoaGVhZGVycywgeyBlcnJvck9uVXNlckludGVyYWN0aW9uOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIElmIGF1dGggaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZSAoZS5nLiB1c2VyIHNpZ25lZCBvdXQpLCBza2lwIHRoZSBjbG9zZSByZXF1ZXN0XG5cdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuRGVidWcsIGBTa2lwcGluZyBzZXNzaW9uIGNsb3NlOiBhdXRoZW50aWNhdGlvbiBubyBsb25nZXIgYXZhaWxhYmxlYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gbm8gZmV0Y2ggd2l0aCByZXRyeSBoZXJlIC0tIGRvbid0IHRyeSB0byBhdXRoIGlmIHdlIGdldCBhbiBhdXRoIGZhaWx1cmVcblx0XHRhd2FpdCB0aGlzLl9mZXRjaChcblx0XHRcdHRoaXMuX2xhdW5jaC51cmkudG9TdHJpbmcodHJ1ZSksXG5cdFx0XHR7XG5cdFx0XHRcdG1ldGhvZDogJ0RFTEVURScsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kKG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl9tb2RlLnZhbHVlID09PSBIdHRwTW9kZS5TU0UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZW5kTGVnYWN5U1NFKHRoaXMuX21vZGUuZW5kcG9pbnQsIG1lc3NhZ2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2VuZFN0cmVhbWFibGVIdHRwKG1lc3NhZ2UsIHRoaXMuX21vZGUudmFsdWUgPT09IEh0dHBNb2RlLkh0dHAgPyB0aGlzLl9tb2RlLnNlc3Npb25JZCA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmRzIGEgc3RyZWFtYWJsZS1IVFRQIHJlcXVlc3QuXG5cdCAqIDEuIFBvc3RzIHRvIHRoZSBlbmRwb2ludFxuXHQgKiAyLiBVcGRhdGVzIGludGVybmFsIHN0YXRlIGFzIG5lZWRlZC4gRmFsbHMgYmFjayB0byBTU0UgaWYgYXBwcm9wcmlhdGUuXG5cdCAqIDMuIElmIHRoZSByZXNwb25zZSBib2R5IGlzIGVtcHR5LCBKU09OLCBvciBhIEpTT04gc3RyZWFtLCBoYW5kbGUgaXQgYXBwcm9wcmlhdGVseS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRTdHJlYW1hYmxlSHR0cChtZXNzYWdlOiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgYXNCeXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShtZXNzYWdlKSBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPjtcblx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0Li4uT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuX2xhdW5jaC5oZWFkZXJzKSxcblx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRBY2NlcHQ6ICd0ZXh0L2V2ZW50LXN0cmVhbSwgYXBwbGljYXRpb24vanNvbicsXG5cdFx0fTtcblx0XHRpZiAoc2Vzc2lvbklkKSB7XG5cdFx0XHRoZWFkZXJzWydNY3AtU2Vzc2lvbi1JZCddID0gc2Vzc2lvbklkO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9hZGRBdXRoSGVhZGVyKGhlYWRlcnMpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5fZmV0Y2hXaXRoQXV0aFJldHJ5KFxuXHRcdFx0dGhpcy5fbGF1bmNoLnVyaS50b1N0cmluZyh0cnVlKSxcblx0XHRcdHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdGJvZHk6IGFzQnl0ZXMsXG5cdFx0XHR9LFxuXHRcdFx0aGVhZGVyc1xuXHRcdCk7XG5cblx0XHRjb25zdCB3YXNVbmtub3duID0gdGhpcy5fbW9kZS52YWx1ZSA9PT0gSHR0cE1vZGUuVW5rbm93bjtcblxuXHRcdC8vIE1jcC1TZXNzaW9uLUlkIGlzIHRoZSBzdHJvbmdlc3Qgc2lnbmFsIHRoYXQgd2UncmUgaW4gc3RyZWFtYWJsZSBIVFRQIG1vZGVcblx0XHRjb25zdCBuZXh0U2Vzc2lvbklkID0gcmVzLmhlYWRlcnMuZ2V0KCdNY3AtU2Vzc2lvbi1JZCcpO1xuXHRcdGlmIChuZXh0U2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLl9tb2RlID0geyB2YWx1ZTogSHR0cE1vZGUuSHR0cCwgc2Vzc2lvbklkOiBuZXh0U2Vzc2lvbklkIH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21vZGUudmFsdWUgPT09IEh0dHBNb2RlLlVua25vd24gJiZcblx0XHRcdC8vIFdlIGNhcmUgYWJvdXQgNHh4IGVycm9ycy4uLlxuXHRcdFx0cmVzLnN0YXR1cyA+PSA0MDAgJiYgcmVzLnN0YXR1cyA8IDUwMFxuXHRcdFx0Ly8gLi4uZXhjZXB0IGZvciBhdXRoIGVycm9yc1xuXHRcdFx0JiYgIWlzQXV0aFN0YXR1c0NvZGUocmVzLnN0YXR1cylcblx0XHQpIHtcblx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5JbmZvLCBgJHtyZXMuc3RhdHVzfSBzdGF0dXMgc2VuZGluZyBtZXNzYWdlIHRvICR7dGhpcy5fbGF1bmNoLnVyaX0sIHdpbGwgYXR0ZW1wdCB0byBmYWxsIGJhY2sgdG8gbGVnYWN5IFNTRWApO1xuXHRcdFx0dGhpcy5fc3NlRmFsbGJhY2tXaXRoTWVzc2FnZShtZXNzYWdlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocmVzLnN0YXR1cyA+PSAzMDApIHtcblx0XHRcdC8vIFwiV2hlbiBhIGNsaWVudCByZWNlaXZlcyBIVFRQIDQwNCBpbiByZXNwb25zZSB0byBhIHJlcXVlc3QgY29udGFpbmluZyBhbiBNY3AtU2Vzc2lvbi1JZCwgaXQgTVVTVCBzdGFydCBhIG5ldyBzZXNzaW9uIGJ5IHNlbmRpbmcgYSBuZXcgSW5pdGlhbGl6ZVJlcXVlc3Qgd2l0aG91dCBhIHNlc3Npb24gSUQgYXR0YWNoZWRcIlxuXHRcdFx0Ly8gVGhvdWdoIHRoaXMgc2F5cyBvbmx5IDQwNCwgc29tZSBzZXJ2ZXJzIHNlbmQgNDAwcyBhcyB3ZWxsLCBpbmNsdWRpbmcgdGhlaXIgZXhhbXBsZVxuXHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21vZGVsY29udGV4dHByb3RvY29sL3R5cGVzY3JpcHQtc2RrL2lzc3Vlcy8zODlcblx0XHRcdGNvbnN0IHJldHJ5V2l0aFNlc3Npb25JZCA9IHRoaXMuX21vZGUudmFsdWUgPT09IEh0dHBNb2RlLkh0dHAgJiYgISF0aGlzLl9tb2RlLnNlc3Npb25JZCAmJiAocmVzLnN0YXR1cyA9PT0gNDAwIHx8IHJlcy5zdGF0dXMgPT09IDQwNCk7XG5cblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVN0YXRlKHRoaXMuX2lkLCB7XG5cdFx0XHRcdHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogYCR7cmVzLnN0YXR1c30gc3RhdHVzIHNlbmRpbmcgbWVzc2FnZSB0byAke3RoaXMuX2xhdW5jaC51cml9OiAke2F3YWl0IHRoaXMuX2dldEVyclRleHQocmVzKX1gICsgKHJldHJ5V2l0aFNlc3Npb25JZCA/IGA7IHdpbGwgcmV0cnkgd2l0aCBuZXcgc2Vzc2lvbiBJRGAgOiAnJyksXG5cdFx0XHRcdHNob3VsZFJldHJ5OiByZXRyeVdpdGhTZXNzaW9uSWQsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbW9kZS52YWx1ZSA9PT0gSHR0cE1vZGUuVW5rbm93bikge1xuXHRcdFx0dGhpcy5fbW9kZSA9IHsgdmFsdWU6IEh0dHBNb2RlLkh0dHAsIHNlc3Npb25JZDogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHRcdGlmICh3YXNVbmtub3duKSB7XG5cdFx0XHR0aGlzLl9hdHRhY2hTdHJlYW1hYmxlQmFja2NoYW5uZWwoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9oYW5kbGVTdWNjZXNzZnVsU3RyZWFtYWJsZUh0dHAocmVzLCBtZXNzYWdlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NzZUZhbGxiYWNrV2l0aE1lc3NhZ2UobWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZW5kcG9pbnQgPSBhd2FpdCB0aGlzLl9hdHRhY2hTU0UoKTtcblx0XHRpZiAoZW5kcG9pbnQpIHtcblx0XHRcdHRoaXMuX21vZGUgPSB7IHZhbHVlOiBIdHRwTW9kZS5TU0UsIGVuZHBvaW50IH07XG5cdFx0XHRhd2FpdCB0aGlzLl9zZW5kTGVnYWN5U1NFKGVuZHBvaW50LCBtZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVTdWNjZXNzZnVsU3RyZWFtYWJsZUh0dHAocmVzOiBDb21tb25SZXNwb25zZSwgbWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0aWYgKHJlcy5zdGF0dXMgPT09IDIwMikge1xuXHRcdFx0cmV0dXJuOyAvLyBubyBib2R5XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudFR5cGUgPSByZXMuaGVhZGVycy5nZXQoJ0NvbnRlbnQtVHlwZScpPy50b0xvd2VyQ2FzZSgpIHx8ICcnO1xuXHRcdGlmIChjb250ZW50VHlwZS5zdGFydHNXaXRoKCd0ZXh0L2V2ZW50LXN0cmVhbScpKSB7XG5cdFx0XHRjb25zdCBwYXJzZXIgPSBuZXcgU1NFUGFyc2VyKGV2ZW50ID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50LnR5cGUgPT09ICdtZXNzYWdlJykge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZFJlY2VpdmVNZXNzYWdlKHRoaXMuX2lkLCBldmVudC5kYXRhKTtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC50eXBlID09PSAnZW5kcG9pbnQnKSB7XG5cdFx0XHRcdFx0Ly8gQW4gU1NFIHNlcnZlciB0aGF0IGRpZG4ndCBjb3JyZWN0bHkgcmV0dXJuIGEgNHh4IHN0YXR1cyB3aGVuIHdlIFBPU1RlZFxuXHRcdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5XYXJuaW5nLCBgUmVjZWl2ZWQgU1NFIGVuZHBvaW50IGZyb20gYSBQT1NUIHRvICR7dGhpcy5fbGF1bmNoLnVyaX0sIHdpbGwgZmFsbCBiYWNrIHRvIGxlZ2FjeSBTU0VgKTtcblx0XHRcdFx0XHR0aGlzLl9zc2VGYWxsYmFja1dpdGhNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpOyAvLyBqdXN0IHRvIGVuZCB0aGUgU1NFIHN0cmVhbVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZG9TU0UocGFyc2VyLCByZXMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5XYXJuaW5nLCBgRXJyb3IgcmVhZGluZyBTU0Ugc3RyZWFtOiAke3N0cmluZ2lmeUVycm9yKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjb250ZW50VHlwZS5zdGFydHNXaXRoKCdhcHBsaWNhdGlvbi9qc29uJykpIHtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZFJlY2VpdmVNZXNzYWdlKHRoaXMuX2lkLCBhd2FpdCByZXMudGV4dCgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VCb2R5ID0gYXdhaXQgcmVzLnRleHQoKTtcblx0XHRcdGlmIChpc0pTT04ocmVzcG9uc2VCb2R5KSkgeyAvLyB0cnkgdG8gcmVhZCBhcyBKU09OIGV2ZW4gaWYgdGhlIHNlcnZlciBkaWRuJ3Qgc2V0IHRoZSBjb250ZW50IHR5cGVcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkUmVjZWl2ZU1lc3NhZ2UodGhpcy5faWQsIHJlc3BvbnNlQm9keSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuV2FybmluZywgYFVuZXhwZWN0ZWQgJHtyZXMuc3RhdHVzfSByZXNwb25zZSBmb3IgcmVxdWVzdDogJHtyZXNwb25zZUJvZHl9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEF0dGFjaGVzIHRoZSBTU0UgYmFja2NoYW5uZWwgdGhhdCBzdHJlYW1hYmxlIEhUVFAgc2VydmVycyBjYW4gdXNlXG5cdCAqIGZvciBhc3luYyBub3RpZmljYXRpb25zLiBUaGlzIGlzIGEgXCJNQVlcIiBzdXBwb3J0LCBzbyBpZiB0aGUgc2VydmVyIGdpdmVzXG5cdCAqIHVzIGEgNHh4IGNvZGUsIHdlJ2xsIHN0b3AgdHJ5aW5nIHRvIGNvbm5lY3QuLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoU3RyZWFtYWJsZUJhY2tjaGFubmVsKCkge1xuXHRcdGxldCBsYXN0RXZlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjYW5SZWNvbm5lY3RBdDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAobGV0IHJldHJ5ID0gMDsgIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQ7IHJldHJ5KyspIHtcblx0XHRcdGlmIChjYW5SZWNvbm5lY3RBdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoTWF0aC5tYXgoMCwgY2FuUmVjb25uZWN0QXQgLSBEYXRlLm5vdygpKSwgdGhpcy5fY3RzLnRva2VuKTtcblx0XHRcdFx0Y2FuUmVjb25uZWN0QXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KE1hdGgubWluKHJldHJ5ICogMTAwMCwgMzBfMDAwKSwgdGhpcy5fY3RzLnRva2VuKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlczogQ29tbW9uUmVzcG9uc2U7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0XHRcdC4uLk9iamVjdC5mcm9tRW50cmllcyh0aGlzLl9sYXVuY2guaGVhZGVycyksXG5cdFx0XHRcdFx0J0FjY2VwdCc6ICd0ZXh0L2V2ZW50LXN0cmVhbScsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2FkZEF1dGhIZWFkZXIoaGVhZGVycyk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX21vZGUudmFsdWUgPT09IEh0dHBNb2RlLkh0dHAgJiYgdGhpcy5fbW9kZS5zZXNzaW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGhlYWRlcnNbJ01jcC1TZXNzaW9uLUlkJ10gPSB0aGlzLl9tb2RlLnNlc3Npb25JZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobGFzdEV2ZW50SWQpIHtcblx0XHRcdFx0XHRoZWFkZXJzWydMYXN0LUV2ZW50LUlEJ10gPSBsYXN0RXZlbnRJZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlcyA9IGF3YWl0IHRoaXMuX2ZldGNoV2l0aEF1dGhSZXRyeShcblx0XHRcdFx0XHR0aGlzLl9sYXVuY2gudXJpLnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGVhZGVyc1xuXHRcdFx0XHQpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuSW5mbywgYEVycm9yIGNvbm5lY3RpbmcgdG8gJHt0aGlzLl9sYXVuY2gudXJpfSBmb3IgYXN5bmMgbm90aWZpY2F0aW9ucywgd2lsbCByZXRyeWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlcy5zdGF0dXMgPj0gNDAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5EZWJ1ZywgYCR7cmVzLnN0YXR1c30gc3RhdHVzIGNvbm5lY3RpbmcgdG8gJHt0aGlzLl9sYXVuY2gudXJpfSBmb3IgYXN5bmMgbm90aWZpY2F0aW9uczsgdGhleSB3aWxsIGJlIGRpc2FibGVkOiAke2F3YWl0IHRoaXMuX2dldEVyclRleHQocmVzKX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmx5IHJlc2V0IHRoZSByZXRyeSBjb3VudGVyIGlmIHdlIGRlZmluaXRlbHkgZ2V0IGFuIGV2ZW50IHN0cmVhbSB0byBhdm9pZFxuXHRcdFx0Ly8gc3BhbW1pbmcgc2VydmVycyB0aGF0IChpbmNvcnJlY3RseSkgZG9uJ3QgcmV0dXJuIG9uZSBmcm9tIHRoaXMgZW5kcG9pbnQuXG5cdFx0XHRpZiAocmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKT8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndGV4dC9ldmVudC1zdHJlYW0nKSkge1xuXHRcdFx0XHRyZXRyeSA9IDA7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhcnNlciA9IG5ldyBTU0VQYXJzZXIoZXZlbnQgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnQucmV0cnkpIHtcblx0XHRcdFx0XHRjYW5SZWNvbm5lY3RBdCA9IERhdGUubm93KCkgKyBldmVudC5yZXRyeTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXZlbnQudHlwZSA9PT0gJ21lc3NhZ2UnICYmIGV2ZW50LmRhdGEpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRSZWNlaXZlTWVzc2FnZSh0aGlzLl9pZCwgZXZlbnQuZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV2ZW50LmlkKSB7XG5cdFx0XHRcdFx0bGFzdEV2ZW50SWQgPSBldmVudC5pZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2RvU1NFKHBhcnNlciwgcmVzKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLkluZm8sIGBFcnJvciByZWFkaW5nIGZyb20gYXN5bmMgc3RyZWFtLCB3ZSB3aWxsIHJlY29ubmVjdDogJHtlfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdGFydHMgYSBsZWdhY3kgU1NFIGF0dGFjaG1lbnQsIHdoZXJlIHRoZSBTU0UgcmVzcG9uc2UgaXMgdGhlIHNlc3Npb24gbGlmZXRpbWUuXG5cdCAqIFVubGlrZSBgX2F0dGFjaFN0cmVhbWFibGVCYWNrY2hhbm5lbGAsIHRoaXMgZmFpbHMgdGhlIHNlcnZlciBpZiBpdCBkaXNjb25uZWN0cy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2F0dGFjaFNTRSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBvc3RFbmRwb2ludCA9IG5ldyBEZWZlcnJlZFByb21pc2U8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHQuLi5PYmplY3QuZnJvbUVudHJpZXModGhpcy5fbGF1bmNoLmhlYWRlcnMpLFxuXHRcdFx0J0FjY2VwdCc6ICd0ZXh0L2V2ZW50LXN0cmVhbScsXG5cdFx0fTtcblx0XHRhd2FpdCB0aGlzLl9hZGRBdXRoSGVhZGVyKGhlYWRlcnMpO1xuXG5cdFx0bGV0IHJlczogQ29tbW9uUmVzcG9uc2U7XG5cdFx0dHJ5IHtcblx0XHRcdHJlcyA9IGF3YWl0IHRoaXMuX2ZldGNoV2l0aEF1dGhSZXRyeShcblx0XHRcdFx0dGhpcy5fbGF1bmNoLnVyaS50b1N0cmluZyh0cnVlKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0fSxcblx0XHRcdFx0aGVhZGVyc1xuXHRcdFx0KTtcblx0XHRcdGlmIChyZXMuc3RhdHVzID49IDMwMCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZSh0aGlzLl9pZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IsIG1lc3NhZ2U6IGAke3Jlcy5zdGF0dXN9IHN0YXR1cyBjb25uZWN0aW5nIHRvICR7dGhpcy5fbGF1bmNoLnVyaX0gYXMgU1NFOiAke2F3YWl0IHRoaXMuX2dldEVyclRleHQocmVzKX1gIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU3RhdGUodGhpcy5faWQsIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yLCBtZXNzYWdlOiBgRXJyb3IgY29ubmVjdGluZyB0byAke3RoaXMuX2xhdW5jaC51cml9IGFzIFNTRTogJHtlfWAgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VyID0gbmV3IFNTRVBhcnNlcihldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQudHlwZSA9PT0gJ21lc3NhZ2UnKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZFJlY2VpdmVNZXNzYWdlKHRoaXMuX2lkLCBldmVudC5kYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQudHlwZSA9PT0gJ2VuZHBvaW50Jykge1xuXHRcdFx0XHRwb3N0RW5kcG9pbnQuY29tcGxldGUobmV3IFVSTChldmVudC5kYXRhLCB0aGlzLl9sYXVuY2gudXJpLnRvU3RyaW5nKHRydWUpKS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBwb3N0RW5kcG9pbnQuY2FuY2VsKCkpKTtcblx0XHR0aGlzLl9kb1NTRShwYXJzZXIsIHJlcykuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVN0YXRlKHRoaXMuX2lkLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciwgbWVzc2FnZTogYEVycm9yIHJlYWRpbmcgU1NFIHN0cmVhbTogJHtzdHJpbmdpZnlFcnJvcihlcnIpfWAgfSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcG9zdEVuZHBvaW50LnA7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZHMgYSBsZWdhY3kgU1NFIG1lc3NhZ2UgdG8gdGhlIHNlcnZlci4gVGhlIHJlc3BvbnNlIGlzIGFsd2F5cyBlbXB0eSBhbmRcblx0ICogaXMgb3RoZXJ3aXNlIHJlY2VpdmVkIGluIHtAbGluayBfYXR0YWNoU1NFfSdzIGxvb3AuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zZW5kTGVnYWN5U1NFKHVybDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRjb25zdCBhc0J5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKG1lc3NhZ2UpIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+O1xuXHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHQuLi5PYmplY3QuZnJvbUVudHJpZXModGhpcy5fbGF1bmNoLmhlYWRlcnMpLFxuXHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHR9O1xuXHRcdGF3YWl0IHRoaXMuX2FkZEF1dGhIZWFkZXIoaGVhZGVycyk7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5fZmV0Y2godXJsLCB7XG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdGhlYWRlcnMsXG5cdFx0XHRib2R5OiBhc0J5dGVzLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlcy5zdGF0dXMgPj0gMzAwKSB7XG5cdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuV2FybmluZywgYCR7cmVzLnN0YXR1c30gc3RhdHVzIHNlbmRpbmcgbWVzc2FnZSB0byAke3RoaXMuX3Bvc3RFbmRwb2ludH06ICR7YXdhaXQgdGhpcy5fZ2V0RXJyVGV4dChyZXMpfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBHZW5lcmljIGhhbmRsZSB0byBwaXBlIGEgcmVzcG9uc2UgaW50byBhbiBTU0UgcGFyc2VyLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9kb1NTRShwYXJzZXI6IFNTRVBhcnNlciwgcmVzOiBDb21tb25SZXNwb25zZSkge1xuXHRcdGlmICghcmVzLmJvZHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZWFkZXIgPSByZXMuYm9keS5nZXRSZWFkZXIoKTtcblx0XHRsZXQgY2h1bms6IFJlYWRhYmxlU3RyZWFtUmVhZFJlc3VsdDxVaW50OEFycmF5Pjtcblx0XHRkbyB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjaHVuayA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihyZWFkZXIucmVhZCgpLCB0aGlzLl9jdHMudG9rZW4pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJlYWRlci5jYW5jZWwoKTtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaHVuay52YWx1ZSkge1xuXHRcdFx0XHRwYXJzZXIuZmVlZChjaHVuay52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSB3aGlsZSAoIWNodW5rLmRvbmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWRkQXV0aEhlYWRlcihoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBvcHRpb25zPzogeyBmb3JjZU5ld1JlZ2lzdHJhdGlvbj86IGJvb2xlYW47IGVycm9yT25Vc2VySW50ZXJhY3Rpb24/OiBib29sZWFuIH0pIHtcblx0XHRjb25zdCBlcnJvck9uVXNlckludGVyYWN0aW9uID0gb3B0aW9ucz8uZXJyb3JPblVzZXJJbnRlcmFjdGlvbiA/PyB0aGlzLl9lcnJvck9uVXNlckludGVyYWN0aW9uO1xuXHRcdGlmICh0aGlzLl9hdXRoTWV0YWRhdGEpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGF1dGhEZXRhaWxzOiBJTWNwQXV0aGVudGljYXRpb25EZXRhaWxzID0ge1xuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXI6IHRoaXMuX2F1dGhNZXRhZGF0YS5hdXRob3JpemF0aW9uU2VydmVyLnRvSlNPTigpLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YTogdGhpcy5fYXV0aE1ldGFkYXRhLnNlcnZlck1ldGFkYXRhLFxuXHRcdFx0XHRcdHJlc291cmNlTWV0YWRhdGE6IHRoaXMuX2F1dGhNZXRhZGF0YS5yZXNvdXJjZU1ldGFkYXRhLFxuXHRcdFx0XHRcdHNjb3BlczogdGhpcy5fYXV0aE1ldGFkYXRhLnNjb3Blcyxcblx0XHRcdFx0XHRjbGllbnRJZDogdGhpcy5fbGF1bmNoLm9hdXRoPy5jbGllbnRJZCxcblx0XHRcdFx0XHRlbnRlcnByaXNlTWFuYWdlZDogdGhpcy5fbGF1bmNoLm9hdXRoPy5lbnRlcnByaXNlTWFuYWdlZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSBhd2FpdCB0aGlzLl9wcm94eS4kZ2V0VG9rZW5Gcm9tU2VydmVyTWV0YWRhdGEoXG5cdFx0XHRcdFx0dGhpcy5faWQsXG5cdFx0XHRcdFx0YXV0aERldGFpbHMsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZXJyb3JPblVzZXJJbnRlcmFjdGlvbixcblx0XHRcdFx0XHRcdGZvcmNlTmV3UmVnaXN0cmF0aW9uOiBvcHRpb25zPy5mb3JjZU5ld1JlZ2lzdHJhdGlvblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAodG9rZW4pIHtcblx0XHRcdFx0XHRzZXRIb3N0SGVhZGVyKGhlYWRlcnMsICdBdXRob3JpemF0aW9uJywgYEJlYXJlciAke3Rva2VufWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmIChVc2VySW50ZXJhY3Rpb25SZXF1aXJlZEVycm9yLmlzKGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU3RhdGUodGhpcy5faWQsIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQsIHJlYXNvbjogJ25lZWRzLXVzZXItaW50ZXJhY3Rpb24nIH0pO1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5XYXJuaW5nLCBgRXJyb3IgZ2V0dGluZyB0b2tlbiBmcm9tIHNlcnZlciBtZXRhZGF0YTogJHtTdHJpbmcoZSl9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9sYXVuY2guYXV0aGVudGljYXRpb24pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5EZWJ1ZywgYFVzaW5nIHByb3ZpZGVkIGF1dGhlbnRpY2F0aW9uIGNvbmZpZzogcHJvdmlkZXJJZD0ke3RoaXMuX2xhdW5jaC5hdXRoZW50aWNhdGlvbi5wcm92aWRlcklkfSwgc2NvcGVzPSR7dGhpcy5fbGF1bmNoLmF1dGhlbnRpY2F0aW9uLnNjb3Blcy5qb2luKCcsICcpfWApO1xuXHRcdFx0XHRjb25zdCB0b2tlbiA9IGF3YWl0IHRoaXMuX3Byb3h5LiRnZXRUb2tlbkZvclByb3ZpZGVySWQoXG5cdFx0XHRcdFx0dGhpcy5faWQsXG5cdFx0XHRcdFx0dGhpcy5fbGF1bmNoLmF1dGhlbnRpY2F0aW9uLnByb3ZpZGVySWQsXG5cdFx0XHRcdFx0dGhpcy5fbGF1bmNoLmF1dGhlbnRpY2F0aW9uLnNjb3Blcyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlcnJvck9uVXNlckludGVyYWN0aW9uLFxuXHRcdFx0XHRcdFx0Zm9yY2VOZXdSZWdpc3RyYXRpb246IG9wdGlvbnM/LmZvcmNlTmV3UmVnaXN0cmF0aW9uLFxuXHRcdFx0XHRcdFx0Y2xpZW50SWQ6IHRoaXMuX2xhdW5jaC5vYXV0aD8uY2xpZW50SWQsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAodG9rZW4pIHtcblx0XHRcdFx0XHRzZXRIb3N0SGVhZGVyKGhlYWRlcnMsICdBdXRob3JpemF0aW9uJywgYEJlYXJlciAke3Rva2VufWApO1xuXHRcdFx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5JbmZvLCAnU3VjY2Vzc2Z1bGx5IG9idGFpbmVkIHRva2VuIGZyb20gcHJvdmlkZWQgYXV0aGVudGljYXRpb24gY29uZmlnJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IuaXMoZSkpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VTdGF0ZSh0aGlzLl9pZCwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCwgcmVhc29uOiAnbmVlZHMtdXNlci1pbnRlcmFjdGlvbicgfSk7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLldhcm5pbmcsIGBFcnJvciBnZXR0aW5nIHRva2VuIGZyb20gcHJvdmlkZWQgYXV0aGVudGljYXRpb24gY29uZmlnOiAke1N0cmluZyhlKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGhlYWRlcnM7XG5cdH1cblxuXHRwcml2YXRlIF9sb2cobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZFB1Ymxpc2hMb2codGhpcy5faWQsIGxldmVsLCBtZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRFcnJUZXh0KHJlczogQ29tbW9uUmVzcG9uc2UpIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHJlcy50ZXh0KCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gcmVzLnN0YXR1c1RleHQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhlbHBlciBtZXRob2QgdG8gcGVyZm9ybSBmZXRjaCB3aXRoIGF1dGhlbnRpY2F0aW9uIHJldHJ5IGxvZ2ljLlxuXHQgKiBJZiB0aGUgaW5pdGlhbCByZXF1ZXN0IHJldHVybnMgYW4gYXV0aCBlcnJvciBhbmQgd2UgZG9uJ3QgaGF2ZSBhdXRoIG1ldGFkYXRhLFxuXHQgKiBpdCB3aWxsIHBvcHVsYXRlIHRoZSBhdXRoIG1ldGFkYXRhIGFuZCByZXRyeSBvbmNlLlxuXHQgKiBJZiB3ZSBhbHJlYWR5IGhhdmUgYXV0aCBtZXRhZGF0YSwgY2hlY2sgaWYgdGhlIHNjb3BlcyBjaGFuZ2VkIGFuZCB1cGRhdGUgdGhlbS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoV2l0aEF1dGhSZXRyeShtY3BVcmw6IHN0cmluZywgaW5pdDogTWluaW1hbFJlcXVlc3RJbml0LCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxDb21tb25SZXNwb25zZT4ge1xuXHRcdGNvbnN0IGRvRmV0Y2ggPSAoKSA9PiB0aGlzLl9mZXRjaChtY3BVcmwsIGluaXQpO1xuXG5cdFx0bGV0IHJlcyA9IGF3YWl0IGRvRmV0Y2goKTtcblx0XHRpZiAoaXNBdXRoU3RhdHVzQ29kZShyZXMuc3RhdHVzKSkge1xuXHRcdFx0aWYgKCF0aGlzLl9hdXRoTWV0YWRhdGEpIHtcblx0XHRcdFx0dGhpcy5fYXV0aE1ldGFkYXRhID0gYXdhaXQgY3JlYXRlQXV0aE1ldGFkYXRhKG1jcFVybCwgcmVzLmhlYWRlcnMsIHtcblx0XHRcdFx0XHRzYW1lT3JpZ2luSGVhZGVyczoge1xuXHRcdFx0XHRcdFx0Li4uT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuX2xhdW5jaC5oZWFkZXJzKSxcblx0XHRcdFx0XHRcdCdNQ1AtUHJvdG9jb2wtVmVyc2lvbic6IE1DUC5MQVRFU1RfUFJPVE9DT0xfVkVSU0lPTlxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZmV0Y2g6ICh1cmwsIGluaXQpID0+IHRoaXMuX2ZldGNoKHVybCwgaW5pdCBhcyBNaW5pbWFsUmVxdWVzdEluaXQpLFxuXHRcdFx0XHRcdGxvZzogKGxldmVsLCBtZXNzYWdlKSA9PiB0aGlzLl9sb2cobGV2ZWwsIG1lc3NhZ2UpXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kbG9nTWNwQXV0aFNldHVwKHRoaXMuX2F1dGhNZXRhZGF0YS50ZWxlbWV0cnkpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9hZGRBdXRoSGVhZGVyKGhlYWRlcnMpO1xuXHRcdFx0XHRpZiAoaGVhZGVyc1snQXV0aG9yaXphdGlvbiddKSB7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBoZWFkZXJzIGluIHRoZSBpbml0IG9iamVjdFxuXHRcdFx0XHRcdGluaXQuaGVhZGVycyA9IGhlYWRlcnM7XG5cdFx0XHRcdFx0cmVzID0gYXdhaXQgZG9GZXRjaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBXZSBoYXZlIGF1dGggbWV0YWRhdGEsIGJ1dCBnb3QgYW4gYXV0aCBlcnJvci4gQ2hlY2sgaWYgdGhlIHNjb3BlcyBjaGFuZ2VkLlxuXHRcdFx0XHRpZiAodGhpcy5fYXV0aE1ldGFkYXRhLnVwZGF0ZShyZXMuaGVhZGVycykpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hZGRBdXRoSGVhZGVyKGhlYWRlcnMpO1xuXHRcdFx0XHRcdGlmIChoZWFkZXJzWydBdXRob3JpemF0aW9uJ10pIHtcblx0XHRcdFx0XHRcdC8vIFVwZGF0ZSB0aGUgaGVhZGVycyBpbiB0aGUgaW5pdCBvYmplY3Rcblx0XHRcdFx0XHRcdGluaXQuaGVhZGVycyA9IGhlYWRlcnM7XG5cdFx0XHRcdFx0XHRyZXMgPSBhd2FpdCBkb0ZldGNoKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIElmIHdlIGhhdmUgYW4gQXV0aG9yaXphdGlvbiBoZWFkZXIgYW5kIHN0aWxsIGdldCBhbiBhdXRoIGVycm9yLCB3ZSBzaG91bGQgcmV0cnkgd2l0aCBhIG5ldyBhdXRoIHJlZ2lzdHJhdGlvblxuXHRcdGlmIChoZWFkZXJzWydBdXRob3JpemF0aW9uJ10gJiYgaXNBdXRoU3RhdHVzQ29kZShyZXMuc3RhdHVzKSkge1xuXHRcdFx0Y29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgdGhpcy5fZ2V0RXJyVGV4dChyZXMpO1xuXHRcdFx0dGhpcy5fbG9nKExvZ0xldmVsLkluZm8sIGBSZWNlaXZlZCAke3Jlcy5zdGF0dXN9IHN0YXR1cyB3aXRoIEF1dGhvcml6YXRpb24gaGVhZGVyLCByZXRyeWluZyB3aXRoIG5ldyBhdXRoIHJlZ2lzdHJhdGlvbi4gRXJyb3IgZGV0YWlsczogJHtlcnJvclRleHQgfHwgJ25vIGFkZGl0aW9uYWwgZGV0YWlscyd9YCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZGRBdXRoSGVhZGVyKGhlYWRlcnMsIHsgZm9yY2VOZXdSZWdpc3RyYXRpb246IHRydWUgfSk7XG5cdFx0XHRyZXMgPSBhd2FpdCBkb0ZldGNoKCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaCh1cmw6IHN0cmluZywgaW5pdDogTWluaW1hbFJlcXVlc3RJbml0KTogUHJvbWlzZTxDb21tb25SZXNwb25zZT4ge1xuXHRcdHNldEhvc3RIZWFkZXIoaW5pdC5oZWFkZXJzLCAndXNlci1hZ2VudCcsIGAke3Byb2R1Y3QubmFtZUxvbmd9LyR7cHJvZHVjdC52ZXJzaW9ufWApO1xuXG5cdFx0aWYgKGNhbkxvZyh0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCksIExvZ0xldmVsLlRyYWNlKSkge1xuXHRcdFx0Y29uc3QgdHJhY2VPYmo6IGFueSA9IHsgLi4uaW5pdCwgaGVhZGVyczogeyAuLi5pbml0LmhlYWRlcnMgfSB9O1xuXHRcdFx0aWYgKHRyYWNlT2JqLmJvZHkpIHtcblx0XHRcdFx0dHJhY2VPYmouYm9keSA9IG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZSh0cmFjZU9iai5ib2R5KTtcblx0XHRcdH1cblx0XHRcdGlmICh0cmFjZU9iai5oZWFkZXJzPy5BdXRob3JpemF0aW9uKSB7XG5cdFx0XHRcdHRyYWNlT2JqLmhlYWRlcnMuQXV0aG9yaXphdGlvbiA9ICcqKionOyAvLyBkb24ndCBsb2cgdGhlIGF1dGggaGVhZGVyXG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuVHJhY2UsIGBGZXRjaGluZyAke3VybH0gd2l0aCBvcHRpb25zOiAke0pTT04uc3RyaW5naWZ5KHRyYWNlT2JqKX1gKTtcblx0XHR9XG5cblx0XHRsZXQgY3VycmVudFVybCA9IHVybDtcblx0XHRsZXQgcmVzcG9uc2UhOiBDb21tb25SZXNwb25zZTtcblx0XHRmb3IgKGxldCByZWRpcmVjdENvdW50ID0gMDsgcmVkaXJlY3RDb3VudCA8IE1BWF9GT0xMT1dfUkVESVJFQ1RTOyByZWRpcmVjdENvdW50KyspIHtcblx0XHRcdHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fZmV0Y2hJbnRlcm5hbChjdXJyZW50VXJsLCB7XG5cdFx0XHRcdC4uLmluaXQsXG5cdFx0XHRcdHNpZ25hbDogdGhpcy5fYWJvcnRDdHJsLnNpZ25hbCxcblx0XHRcdFx0cmVkaXJlY3Q6ICdtYW51YWwnXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIHJlZGlyZWN0IHN0YXR1cyBjb2RlcyAoMzAxLCAzMDIsIDMwMywgMzA3LCAzMDgpXG5cdFx0XHRpZiAoIVJFRElSRUNUX1NUQVRVU19DT0RFUy5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdsb2NhdGlvbicpO1xuXHRcdFx0aWYgKCFsb2NhdGlvbikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudFVybFBhcnNlZCA9IG5ldyBVUkwoY3VycmVudFVybCk7XG5cdFx0XHRjb25zdCBuZXh0VXJsUGFyc2VkID0gbmV3IFVSTChsb2NhdGlvbiwgY3VycmVudFVybCk7XG5cblx0XHRcdC8vIE9ubHkgZm9sbG93IHJlZGlyZWN0cyB0byBodHRwKHMpLiBCbG9ja3MgYSBtYWxpY2lvdXMgTG9jYXRpb24gaGVhZGVyIGZyb21cblx0XHRcdC8vIHJlYWNoaW5nIHRoZSB1bml4Oi8vIC8gcGlwZTovLyBzb2NrZXQgZGlzcGF0Y2hlciBvciBvdGhlciBsb2NhbCBzY2hlbWVzLlxuXHRcdFx0Ly8gRmFpbCBjbG9zZWQgc28gdGhlIGNvbm5lY3Rpb24gZXJyb3JzIGRldGVybWluaXN0aWNhbGx5IHJhdGhlciB0aGFuIHRoZVxuXHRcdFx0Ly8gY2FsbGVyIHRyZWF0aW5nIHRoZSAzeHggcmVzcG9uc2UgYXMgZmluYWwuXG5cdFx0XHRpZiAoIUFMTE9XRURfUkVESVJFQ1RfUFJPVE9DT0xTLmhhcyhuZXh0VXJsUGFyc2VkLnByb3RvY29sKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1DUCBzZXJ2ZXIgcmVkaXJlY3RlZCB0byBhIG5vbi1odHRwKHMpIHRhcmdldCAoJHtuZXh0VXJsUGFyc2VkLnByb3RvY29sfSksIHdoaWNoIGlzIG5vdCBhbGxvd2VkYCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9uIGEgY3Jvc3Mtb3JpZ2luIHJlZGlyZWN0LCBzdHJpcCBjcmVkZW50aWFsLWJlYXJpbmcgaGVhZGVycyBzbyB0b2tlbnMgYW5kXG5cdFx0XHQvLyBzZXNzaW9uIGlkcyBjb25maWd1cmVkIGZvciB0aGUgb3JpZ2luYWwgb3JpZ2luIGFyZSBub3QgcmVwbGF5ZWQgdG8gYW5vdGhlciBob3N0LlxuXHRcdFx0aWYgKGN1cnJlbnRVcmxQYXJzZWQub3JpZ2luICE9PSBuZXh0VXJsUGFyc2VkLm9yaWdpbikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG5hbWUgb2YgT2JqZWN0LmtleXMoaW5pdC5oZWFkZXJzKSkge1xuXHRcdFx0XHRcdGlmIChDUk9TU19PUklHSU5fU1RSSVBQRURfSEVBREVSUy5oYXMobmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIGluaXQuaGVhZGVyc1tuYW1lXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV4dFVybCA9IG5leHRVcmxQYXJzZWQudG9TdHJpbmcoKTtcblx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5UcmFjZSwgYFJlZGlyZWN0ICgke3Jlc3BvbnNlLnN0YXR1c30pIGZyb20gJHtjdXJyZW50VXJsfSB0byAke25leHRVcmx9YCk7XG5cdFx0XHRjdXJyZW50VXJsID0gbmV4dFVybDtcblx0XHRcdC8vIFBlciBmZXRjaCBzcGVjLCBmb3IgMzAzIGFsd2F5cyB1c2UgR0VULCBrZWVwIG1ldGhvZCB1bmxlc3Mgb3JpZ2luYWwgd2FzIFBPU1QgYW5kIDMwMS8zMDIsIHRoZW4gR0VULlxuXHRcdFx0aWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gMzAzIHx8ICgocmVzcG9uc2Uuc3RhdHVzID09PSAzMDEgfHwgcmVzcG9uc2Uuc3RhdHVzID09PSAzMDIpICYmIGluaXQubWV0aG9kID09PSAnUE9TVCcpKSB7XG5cdFx0XHRcdGluaXQubWV0aG9kID0gJ0dFVCc7XG5cdFx0XHRcdGRlbGV0ZSBpbml0LmJvZHk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNhbkxvZyh0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCksIExvZ0xldmVsLlRyYWNlKSkge1xuXHRcdFx0Y29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdFx0cmVzcG9uc2UuaGVhZGVycy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7IGhlYWRlcnNba2V5XSA9IHZhbHVlOyB9KTtcblx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5UcmFjZSwgYEZldGNoZWQgJHtjdXJyZW50VXJsfTogJHtKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLFxuXHRcdFx0XHRoZWFkZXJzOiBoZWFkZXJzLFxuXHRcdFx0fSl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9mZXRjaEludGVybmFsKHVybDogc3RyaW5nLCBpbml0PzogQ29tbW9uUmVxdWVzdEluaXQpOiBQcm9taXNlPENvbW1vblJlc3BvbnNlPiB7XG5cdFx0cmV0dXJuIGZldGNoKHVybCwgaW5pdCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIE1pbmltYWxSZXF1ZXN0SW5pdCB7XG5cdG1ldGhvZDogc3RyaW5nO1xuXHRoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRib2R5PzogVWludDhBcnJheTxBcnJheUJ1ZmZlcj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbW9uUmVxdWVzdEluaXQgZXh0ZW5kcyBNaW5pbWFsUmVxdWVzdEluaXQge1xuXHRzaWduYWw/OiBBYm9ydFNpZ25hbDtcblx0cmVkaXJlY3Q/OiBSZXF1ZXN0UmVkaXJlY3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbW9uUmVzcG9uc2Uge1xuXHRzdGF0dXM6IG51bWJlcjtcblx0c3RhdHVzVGV4dDogc3RyaW5nO1xuXHRoZWFkZXJzOiBIZWFkZXJzO1xuXHRib2R5PzogUmVhZGFibGVTdHJlYW0gfCBudWxsO1xuXHR1cmw6IHN0cmluZztcblx0anNvbigpOiBQcm9taXNlPGFueT47XG5cdHRleHQoKTogUHJvbWlzZTxzdHJpbmc+O1xufVxuXG5mdW5jdGlvbiBpc0pTT04oc3RyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0dHJ5IHtcblx0XHRKU09OLnBhcnNlKHN0cik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNBdXRoU3RhdHVzQ29kZShzdGF0dXM6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdHVzID09PSA0MDEgfHwgc3RhdHVzID09PSA0MDM7XG59XG5cblxuLy8jcmVnaW9uIEF1dGhNZXRhZGF0YVxuXG4vKipcbiAqIExvZ2dlciBjYWxsYmFjayB0eXBlIGZvciBBdXRoTWV0YWRhdGEgb3BlcmF0aW9ucy5cbiAqL1xuZXhwb3J0IHR5cGUgQXV0aE1ldGFkYXRhTG9nZ2VyID0gKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkO1xuXG4vKipcbiAqIEludGVyZmFjZSBmb3IgYXV0aGVudGljYXRpb24gbWV0YWRhdGEgdGhhdCBjYW4gYmUgdXBkYXRlZCB3aGVuIHNjb3BlcyBjaGFuZ2UuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dGhNZXRhZGF0YSB7XG5cdHJlYWRvbmx5IGF1dGhvcml6YXRpb25TZXJ2ZXI6IFVSSTtcblx0cmVhZG9ubHkgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGE7XG5cdHJlYWRvbmx5IHJlc291cmNlTWV0YWRhdGE6IElBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2NvcGVzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0LyoqIFRlbGVtZXRyeSBkYXRhIGFib3V0IGhvdyBhdXRoIG1ldGFkYXRhIHdhcyBkaXNjb3ZlcmVkICovXG5cdHJlYWRvbmx5IHRlbGVtZXRyeTogSUF1dGhNZXRhZGF0YVNvdXJjZTtcblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgc2NvcGVzIGJhc2VkIG9uIHRoZSBXV1ctQXV0aGVudGljYXRlIGhlYWRlciBpbiB0aGUgcmVzcG9uc2UuXG5cdCAqIEBwYXJhbSByZXNwb25zZSBUaGUgSFRUUCByZXNwb25zZSBjb250YWluaW5nIHBvdGVudGlhbCBzY29wZSBjaGFsbGVuZ2VzXG5cdCAqIEByZXR1cm5zIHRydWUgaWYgc2NvcGVzIHdlcmUgdXBkYXRlZCwgZmFsc2Ugb3RoZXJ3aXNlXG5cdCAqL1xuXHR1cGRhdGUocmVzcG9uc2VIZWFkZXJzOiBIZWFkZXJzKTogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBDb25jcmV0ZSBpbXBsZW1lbnRhdGlvbiBvZiBJQXV0aE1ldGFkYXRhIHRoYXQgbWFuYWdlcyBPQXV0aCBhdXRoZW50aWNhdGlvbiBtZXRhZGF0YS5cbiAqIENvbnN1bWVycyBzaG91bGQgdXNlIHtAbGluayBjcmVhdGVBdXRoTWV0YWRhdGF9IHRvIGNyZWF0ZSBpbnN0YW5jZXMuXG4gKi9cbmNsYXNzIEF1dGhNZXRhZGF0YSBpbXBsZW1lbnRzIElBdXRoTWV0YWRhdGEge1xuXHRwcml2YXRlIF9zY29wZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBhdXRob3JpemF0aW9uU2VydmVyOiBVUkksXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhLFxuXHRcdHB1YmxpYyByZWFkb25seSByZXNvdXJjZU1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfCB1bmRlZmluZWQsXG5cdFx0c2NvcGVzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdGVsZW1ldHJ5OiBJQXV0aE1ldGFkYXRhU291cmNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZzogQXV0aE1ldGFkYXRhTG9nZ2VyLFxuXHQpIHtcblx0XHR0aGlzLl9zY29wZXMgPSBzY29wZXM7XG5cdH1cblxuXHRnZXQgc2NvcGVzKCk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2NvcGVzO1xuXHR9XG5cblx0dXBkYXRlKHJlc3BvbnNlSGVhZGVyczogSGVhZGVycyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNjb3Blc0NoYWxsZW5nZSA9IHRoaXMuX3BhcnNlU2NvcGVzRnJvbVJlc3BvbnNlKHJlc3BvbnNlSGVhZGVycyk7XG5cdFx0aWYgKCFzY29wZXNNYXRjaChzY29wZXNDaGFsbGVuZ2UsIHRoaXMuX3Njb3BlcykpIHtcblx0XHRcdHRoaXMuX2xvZyhMb2dMZXZlbC5JbmZvLCBgU2NvcGVzIGNoYW5nZWQgZnJvbSAke0pTT04uc3RyaW5naWZ5KHRoaXMuX3Njb3Blcyl9IHRvICR7SlNPTi5zdHJpbmdpZnkoc2NvcGVzQ2hhbGxlbmdlKX0sIHVwZGF0aW5nYCk7XG5cdFx0XHR0aGlzLl9zY29wZXMgPSBzY29wZXNDaGFsbGVuZ2U7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VTY29wZXNGcm9tUmVzcG9uc2UocmVzcG9uc2VIZWFkZXJzOiBIZWFkZXJzKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF1dGhIZWFkZXIgPSByZXNwb25zZUhlYWRlcnMuZ2V0KCdXV1ctQXV0aGVudGljYXRlJyk7XG5cdFx0aWYgKCFhdXRoSGVhZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjaGFsbGVuZ2VzID0gcGFyc2VXV1dBdXRoZW50aWNhdGVIZWFkZXIoYXV0aEhlYWRlcik7XG5cdFx0Zm9yIChjb25zdCBjaGFsbGVuZ2Ugb2YgY2hhbGxlbmdlcykge1xuXHRcdFx0aWYgKGNoYWxsZW5nZS5zY2hlbWUgPT09ICdCZWFyZXInICYmIGNoYWxsZW5nZS5wYXJhbXNbJ3Njb3BlJ10pIHtcblx0XHRcdFx0Y29uc3Qgc2NvcGVzID0gY2hhbGxlbmdlLnBhcmFtc1snc2NvcGUnXS5zcGxpdChBVVRIX1NDT1BFX1NFUEFSQVRPUikuZmlsdGVyKHMgPT4gcy50cmltKCkubGVuZ3RoKTtcblx0XHRcdFx0aWYgKHNjb3Blcy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2coTG9nTGV2ZWwuSW5mbywgYEZvdW5kIHNjb3BlIGNoYWxsZW5nZSBpbiBXV1ctQXV0aGVudGljYXRlIGhlYWRlcjogJHtjaGFsbGVuZ2UucGFyYW1zWydzY29wZSddfWApO1xuXHRcdFx0XHRcdHJldHVybiBzY29wZXM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIE9wdGlvbnMgZm9yIGNyZWF0aW5nIEF1dGhNZXRhZGF0YS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ3JlYXRlQXV0aE1ldGFkYXRhT3B0aW9ucyB7XG5cdC8qKiBIZWFkZXJzIHRvIGluY2x1ZGUgd2hlbiBmZXRjaGluZyBtZXRhZGF0YSBmcm9tIHRoZSBzYW1lIG9yaWdpbiBhcyB0aGUgcmVzb3VyY2Ugc2VydmVyICovXG5cdHNhbWVPcmlnaW5IZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0LyoqIEZldGNoIGZ1bmN0aW9uIHRvIHVzZSBmb3IgSFRUUCByZXF1ZXN0cyAqL1xuXHRmZXRjaDogKHVybDogc3RyaW5nLCBpbml0OiBNaW5pbWFsUmVxdWVzdEluaXQpID0+IFByb21pc2U8Q29tbW9uUmVzcG9uc2U+O1xuXHQvKiogTG9nZ2VyIGZ1bmN0aW9uIGZvciBkaWFnbm9zdGljIG91dHB1dCAqL1xuXHRsb2c6IEF1dGhNZXRhZGF0YUxvZ2dlcjtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIEF1dGhNZXRhZGF0YSBpbnN0YW5jZSBieSBkaXNjb3ZlcmluZyBPQXV0aCBtZXRhZGF0YSBmcm9tIHRoZSBzZXJ2ZXIuXG4gKlxuICogVGhpcyBmdW5jdGlvbjpcbiAqIDEuIFBhcnNlcyB0aGUgV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgZm9yIHJlc291cmNlX21ldGFkYXRhIGFuZCBzY29wZSBjaGFsbGVuZ2VzXG4gKiAyLiBGZXRjaGVzIE9BdXRoIHByb3RlY3RlZCByZXNvdXJjZSBtZXRhZGF0YSBmcm9tIHdlbGwta25vd24gVVJJcyBvciB0aGUgY2hhbGxlbmdlIFVSTFxuICogMy4gRmV0Y2hlcyBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YVxuICogNC4gRmFsbHMgYmFjayB0byBkZWZhdWx0IG1ldGFkYXRhIGlmIGRpc2NvdmVyeSBmYWlsc1xuICpcbiAqIEBwYXJhbSByZXNvdXJjZVVybCBUaGUgcmVzb3VyY2Ugc2VydmVyIFVSTFxuICogQHBhcmFtIHd3d0F1dGhlbnRpY2F0ZVZhbHVlIFRoZSB2YWx1ZSBvZiB0aGUgV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgZnJvbSB0aGUgb3JpZ2luYWwgSFRUUCByZXNwb25zZVxuICogQHBhcmFtIG9wdGlvbnMgQ29uZmlndXJhdGlvbiBvcHRpb25zIGluY2x1ZGluZyBoZWFkZXJzLCBmZXRjaCBmdW5jdGlvbiwgYW5kIGxvZ2dlclxuICogQHJldHVybnMgQSBuZXcgQXV0aE1ldGFkYXRhIGluc3RhbmNlXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVBdXRoTWV0YWRhdGEoXG5cdHJlc291cmNlVXJsOiBzdHJpbmcsXG5cdGluaXRpYWxSZXNwb25zZUhlYWRlcnM6IEhlYWRlcnMsXG5cdG9wdGlvbnM6IElDcmVhdGVBdXRoTWV0YWRhdGFPcHRpb25zXG4pOiBQcm9taXNlPEF1dGhNZXRhZGF0YT4ge1xuXHRjb25zdCB7IHNhbWVPcmlnaW5IZWFkZXJzLCBmZXRjaCwgbG9nIH0gPSBvcHRpb25zO1xuXG5cdC8vIFRyYWNrIGRpc2NvdmVyeSBzb3VyY2VzIGZvciB0ZWxlbWV0cnlcblx0bGV0IHJlc291cmNlTWV0YWRhdGFTb3VyY2UgPSBJQXV0aFJlc291cmNlTWV0YWRhdGFTb3VyY2UuTm9uZTtcblx0bGV0IHNlcnZlck1ldGFkYXRhU291cmNlOiBJQXV0aFNlcnZlck1ldGFkYXRhU291cmNlIHwgdW5kZWZpbmVkO1xuXG5cdC8vIFBhcnNlIHRoZSBXV1ctQXV0aGVudGljYXRlIGhlYWRlciBmb3IgcmVzb3VyY2VfbWV0YWRhdGEgYW5kIHNjb3BlIGNoYWxsZW5nZXNcblx0Y29uc3QgeyByZXNvdXJjZU1ldGFkYXRhQ2hhbGxlbmdlLCBzY29wZXNDaGFsbGVuZ2U6IHNjb3Blc0NoYWxsZW5nZUZyb21IZWFkZXIgfSA9IHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyRm9yQ2hhbGxlbmdlcyhpbml0aWFsUmVzcG9uc2VIZWFkZXJzLmdldCgnV1dXLUF1dGhlbnRpY2F0ZScpID8/IHVuZGVmaW5lZCwgbG9nKTtcblxuXHQvLyBGZXRjaCB0aGUgcmVzb3VyY2UgbWV0YWRhdGEgZWl0aGVyIGZyb20gdGhlIGNoYWxsZW5nZSBVUkwgb3IgZnJvbSB3ZWxsLWtub3duIFVSSXNcblx0bGV0IHNlcnZlck1ldGFkYXRhVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCByZXNvdXJjZTogSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRsZXQgc2NvcGVzQ2hhbGxlbmdlID0gc2NvcGVzQ2hhbGxlbmdlRnJvbUhlYWRlcjtcblxuXHR0cnkge1xuXHRcdGNvbnN0IHsgbWV0YWRhdGEsIGRpc2NvdmVyeVVybCwgZXJyb3JzIH0gPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEocmVzb3VyY2VVcmwsIHJlc291cmNlTWV0YWRhdGFDaGFsbGVuZ2UsIHtcblx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzLFxuXHRcdFx0ZmV0Y2g6ICh1cmwsIGluaXQpID0+IGZldGNoKHVybCwgaW5pdCBhcyBNaW5pbWFsUmVxdWVzdEluaXQpXG5cdFx0fSk7XG5cdFx0Zm9yIChjb25zdCBlcnIgb2YgZXJyb3JzKSB7XG5cdFx0XHRsb2coTG9nTGV2ZWwuV2FybmluZywgYEVycm9yIGZldGNoaW5nIHJlc291cmNlIG1ldGFkYXRhOiAke2Vycn1gKTtcblx0XHR9XG5cdFx0bG9nKExvZ0xldmVsLkluZm8sIGBEaXNjb3ZlcmVkIHJlc291cmNlIG1ldGFkYXRhIGF0ICR7ZGlzY292ZXJ5VXJsfWApO1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIGlmIHJlc291cmNlIG1ldGFkYXRhIGNhbWUgZnJvbSBoZWFkZXIgb3Igd2VsbC1rbm93blxuXHRcdHJlc291cmNlTWV0YWRhdGFTb3VyY2UgPSByZXNvdXJjZU1ldGFkYXRhQ2hhbGxlbmdlID8gSUF1dGhSZXNvdXJjZU1ldGFkYXRhU291cmNlLkhlYWRlciA6IElBdXRoUmVzb3VyY2VNZXRhZGF0YVNvdXJjZS5XZWxsS25vd247XG5cblx0XHQvLyBUT0RPOkBUeWxlckxlb25oYXJkdCBzdXBwb3J0IG11bHRpcGxlIGF1dGhvcml6YXRpb24gc2VydmVyc1xuXHRcdC8vIENvbnNpZGVyIHVzaW5nIG9uZSB0aGF0IGhhcyBhbiBhdXRoIHByb3ZpZGVyIGZpcnN0LCBvdmVyIHRoZSBkeW5hbWljIGZsb3dcblx0XHRzZXJ2ZXJNZXRhZGF0YVVybCA9IG1ldGFkYXRhLmF1dGhvcml6YXRpb25fc2VydmVycz8uWzBdO1xuXHRcdGlmICghc2VydmVyTWV0YWRhdGFVcmwpIHtcblx0XHRcdGxvZyhMb2dMZXZlbC5XYXJuaW5nLCBgTm8gYXV0aG9yaXphdGlvbl9zZXJ2ZXJzIGZvdW5kIGluIHJlc291cmNlIG1ldGFkYXRhICR7ZGlzY292ZXJ5VXJsfSAtIElzIHRoaXMgcmVzb3VyY2UgbWV0YWRhdGEgY29uZmlndXJlZCBjb3JyZWN0bHk/YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZyhMb2dMZXZlbC5JbmZvLCBgVXNpbmcgYXV0aCBzZXJ2ZXIgbWV0YWRhdGEgdXJsOiAke3NlcnZlck1ldGFkYXRhVXJsfWApO1xuXHRcdFx0c2VydmVyTWV0YWRhdGFTb3VyY2UgPSBJQXV0aFNlcnZlck1ldGFkYXRhU291cmNlLlJlc291cmNlTWV0YWRhdGE7XG5cdFx0fVxuXHRcdHNjb3Blc0NoYWxsZW5nZSA/Pz0gbWV0YWRhdGEuc2NvcGVzX3N1cHBvcnRlZDtcblx0XHRyZXNvdXJjZSA9IG1ldGFkYXRhO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0bG9nKExvZ0xldmVsLldhcm5pbmcsIGBDb3VsZCBub3QgZmV0Y2ggcmVzb3VyY2UgbWV0YWRhdGE6ICR7U3RyaW5nKGUpfWApO1xuXHR9XG5cblx0Y29uc3QgYmFzZVVybCA9IG5ldyBVUkwocmVzb3VyY2VVcmwpLm9yaWdpbjtcblxuXHQvLyBJZiB3ZSBhcmUgbm90IGdpdmVuIGEgcmVzb3VyY2VfbWV0YWRhdGEsIHNlZSBpZiB0aGUgd2VsbC1rbm93biBzZXJ2ZXIgbWV0YWRhdGEgaXMgYXZhaWxhYmxlXG5cdC8vIG9uIHRoZSBiYXNlIHVybC5cblx0bGV0IGFkZGl0aW9uYWxIZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdGlmICghc2VydmVyTWV0YWRhdGFVcmwpIHtcblx0XHRzZXJ2ZXJNZXRhZGF0YVVybCA9IGJhc2VVcmw7XG5cdFx0Ly8gTWFpbnRhaW4gdGhlIHNhbWUgb3JpZ2luIGhlYWRlcnMgd2hlbiB0YWxraW5nIHRvIHRoZSByZXNvdXJjZSBvcmlnaW4uXG5cdFx0aWYgKHNhbWVPcmlnaW5IZWFkZXJzKSB7XG5cdFx0XHRhZGRpdGlvbmFsSGVhZGVycyA9IHNhbWVPcmlnaW5IZWFkZXJzO1xuXHRcdH1cblx0fVxuXG5cdHRyeSB7XG5cdFx0bG9nKExvZ0xldmVsLkRlYnVnLCBgRmV0Y2hpbmcgYXV0aCBzZXJ2ZXIgbWV0YWRhdGEgZm9yOiAke3NlcnZlck1ldGFkYXRhVXJsfSAuLi5gKTtcblx0XHRjb25zdCB7IG1ldGFkYXRhLCBkaXNjb3ZlcnlVcmwsIGVycm9ycyB9ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoc2VydmVyTWV0YWRhdGFVcmwsIHtcblx0XHRcdGFkZGl0aW9uYWxIZWFkZXJzLFxuXHRcdFx0ZmV0Y2g6ICh1cmwsIGluaXQpID0+IGZldGNoKHVybCwgaW5pdCBhcyBNaW5pbWFsUmVxdWVzdEluaXQpXG5cdFx0fSk7XG5cdFx0Zm9yIChjb25zdCBlcnIgb2YgZXJyb3JzKSB7XG5cdFx0XHRsb2coTG9nTGV2ZWwuV2FybmluZywgYEVycm9yIGZldGNoaW5nIGF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhOiAke2Vycn1gKTtcblx0XHR9XG5cdFx0bG9nKExvZ0xldmVsLkluZm8sIGBEaXNjb3ZlcmVkIGF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhIGF0ICR7ZGlzY292ZXJ5VXJsfWApO1xuXG5cdFx0Ly8gSWYgc2VydmVyTWV0YWRhdGFTb3VyY2UgaXMgbm90IHlldCBkZWZpbmVkLCBpdCBtZWFucyB3ZSBmZWxsIGJhY2sgdG8gYmFzZVVybFxuXHRcdC8vIGFuZCBzdWNjZXNzZnVsbHkgZmV0Y2hlZCBmcm9tIHdlbGwta25vd25cblx0XHRzZXJ2ZXJNZXRhZGF0YVNvdXJjZSA/Pz0gSUF1dGhTZXJ2ZXJNZXRhZGF0YVNvdXJjZS5XZWxsS25vd247XG5cblx0XHRyZXR1cm4gbmV3IEF1dGhNZXRhZGF0YShcblx0XHRcdFVSSS5wYXJzZShzZXJ2ZXJNZXRhZGF0YVVybCksXG5cdFx0XHRtZXRhZGF0YSxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0c2NvcGVzQ2hhbGxlbmdlLFxuXHRcdFx0eyByZXNvdXJjZU1ldGFkYXRhU291cmNlLCBzZXJ2ZXJNZXRhZGF0YVNvdXJjZSB9LFxuXHRcdFx0bG9nXG5cdFx0KTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdGxvZyhMb2dMZXZlbC5XYXJuaW5nLCBgRXJyb3IgcG9wdWxhdGluZyBhdXRoIHNlcnZlciBtZXRhZGF0YSBmb3IgJHtzZXJ2ZXJNZXRhZGF0YVVybH06ICR7U3RyaW5nKGUpfWApO1xuXHR9XG5cblx0Ly8gSWYgdGhlcmUncyBubyB3ZWxsLWtub3duIHNlcnZlciBtZXRhZGF0YSwgdGhlbiB1c2UgdGhlIGRlZmF1bHQgdmFsdWVzIGJhc2VkIG9mZiBvZiB0aGUgdXJsLlxuXHRjb25zdCBkZWZhdWx0TWV0YWRhdGEgPSBnZXREZWZhdWx0TWV0YWRhdGFGb3JVcmwobmV3IFVSTChiYXNlVXJsKSk7XG5cdGxvZyhMb2dMZXZlbC5JbmZvLCAnVXNpbmcgZGVmYXVsdCBhdXRoIG1ldGFkYXRhJyk7XG5cdHJldHVybiBuZXcgQXV0aE1ldGFkYXRhKFxuXHRcdFVSSS5wYXJzZShiYXNlVXJsKSxcblx0XHRkZWZhdWx0TWV0YWRhdGEsXG5cdFx0cmVzb3VyY2UsXG5cdFx0c2NvcGVzQ2hhbGxlbmdlLFxuXHRcdHsgcmVzb3VyY2VNZXRhZGF0YVNvdXJjZSwgc2VydmVyTWV0YWRhdGFTb3VyY2U6IElBdXRoU2VydmVyTWV0YWRhdGFTb3VyY2UuRGVmYXVsdCB9LFxuXHRcdGxvZ1xuXHQpO1xufVxuXG4vKipcbiAqIFBhcnNlcyB0aGUgV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgZm9yIHJlc291cmNlX21ldGFkYXRhIGFuZCBzY29wZSBjaGFsbGVuZ2VzLlxuICovXG5mdW5jdGlvbiBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlckZvckNoYWxsZW5nZXMoXG5cdHd3d0F1dGhlbnRpY2F0ZVZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdGxvZzogQXV0aE1ldGFkYXRhTG9nZ2VyXG4pOiB7IHJlc291cmNlTWV0YWRhdGFDaGFsbGVuZ2U/OiBzdHJpbmc7IHNjb3Blc0NoYWxsZW5nZT86IHN0cmluZ1tdIH0ge1xuXHRpZiAoIXd3d0F1dGhlbnRpY2F0ZVZhbHVlKSB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cdGxldCByZXNvdXJjZU1ldGFkYXRhQ2hhbGxlbmdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBzY29wZXNDaGFsbGVuZ2U6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0IGNoYWxsZW5nZXMgPSBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlcih3d3dBdXRoZW50aWNhdGVWYWx1ZSk7XG5cdGZvciAoY29uc3QgY2hhbGxlbmdlIG9mIGNoYWxsZW5nZXMpIHtcblx0XHRpZiAoY2hhbGxlbmdlLnNjaGVtZSA9PT0gJ0JlYXJlcicpIHtcblx0XHRcdGlmICghcmVzb3VyY2VNZXRhZGF0YUNoYWxsZW5nZSAmJiBjaGFsbGVuZ2UucGFyYW1zWydyZXNvdXJjZV9tZXRhZGF0YSddKSB7XG5cdFx0XHRcdHJlc291cmNlTWV0YWRhdGFDaGFsbGVuZ2UgPSBjaGFsbGVuZ2UucGFyYW1zWydyZXNvdXJjZV9tZXRhZGF0YSddO1xuXHRcdFx0XHRsb2coTG9nTGV2ZWwuRGVidWcsIGBGb3VuZCByZXNvdXJjZV9tZXRhZGF0YSBjaGFsbGVuZ2UgaW4gV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXI6ICR7cmVzb3VyY2VNZXRhZGF0YUNoYWxsZW5nZX1gKTtcblx0XHRcdH1cblx0XHRcdGlmICghc2NvcGVzQ2hhbGxlbmdlICYmIGNoYWxsZW5nZS5wYXJhbXNbJ3Njb3BlJ10pIHtcblx0XHRcdFx0Y29uc3Qgc2NvcGVzID0gY2hhbGxlbmdlLnBhcmFtc1snc2NvcGUnXS5zcGxpdChBVVRIX1NDT1BFX1NFUEFSQVRPUikuZmlsdGVyKHMgPT4gcy50cmltKCkubGVuZ3RoKTtcblx0XHRcdFx0aWYgKHNjb3Blcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRsb2coTG9nTGV2ZWwuRGVidWcsIGBGb3VuZCBzY29wZSBjaGFsbGVuZ2UgaW4gV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXI6ICR7Y2hhbGxlbmdlLnBhcmFtc1snc2NvcGUnXX1gKTtcblx0XHRcdFx0XHRzY29wZXNDaGFsbGVuZ2UgPSBzY29wZXM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChyZXNvdXJjZU1ldGFkYXRhQ2hhbGxlbmdlICYmIHNjb3Blc0NoYWxsZW5nZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHsgcmVzb3VyY2VNZXRhZGF0YUNoYWxsZW5nZSwgc2NvcGVzQ2hhbGxlbmdlIH07XG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGlCQUFpQix1QkFBdUIsV0FBVyxlQUFlO0FBQzNFLFNBQVMsbUJBQW1C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
