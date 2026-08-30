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
import { AsyncIterableProducer, raceCancellationError, Sequencer } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Iterable } from "../../../../base/common/iterator.js";
import * as json from "../../../../base/common/json.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../base/common/map.js";
import { Schemas } from "../../../../base/common/network.js";
import { mapValues } from "../../../../base/common/objects.js";
import { autorun, autorunSelfDisposable, derived, derivedDisposable, disposableObservableValue, observableFromEvent, ObservablePromise, observableValue, transaction } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { createURITransformer } from "../../../../base/common/uriTransformer.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IAllowedMcpServersService } from "../../../../platform/mcp/common/mcpManagement.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ConfigurationResolverExpression } from "../../../services/configurationResolver/common/configurationResolverExpression.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { chatSessionResourceToId } from "../../chat/common/model/chatUri.js";
import { mcpActivationEvent } from "./mcpConfiguration.js";
import { McpDevModeServerAttache } from "./mcpDevMode.js";
import { McpIcons, parseAndValidateMcpIcon } from "./mcpIcons.js";
import { IMcpRegistry } from "./mcpRegistryTypes.js";
import { IMcpSandboxService } from "./mcpSandboxService.js";
import { McpTaskManager } from "./mcpTaskManager.js";
import { ElicitationKind, extensionMcpCollectionPrefix, IMcpElicitationService, IMcpSamplingService, McpCapability, McpConnectionFailedError, McpConnectionState, mcpPromptReplaceSpecialChars, McpResourceURI, McpServerCacheState, McpServerStaticToolAvailability, McpServerTransportType, McpToolName, McpToolVisibility, MpcResponseError, UserInteractionRequiredError } from "./mcpTypes.js";
import { MCP } from "./modelContextProtocol.js";
import { UriTemplate } from "../../../../base/common/uriTemplate.js";
const emptyToolEntry = {
  serverName: void 0,
  serverIcons: [],
  serverInstructions: void 0,
  trustedAtNonce: void 0,
  nonce: void 0,
  tools: [],
  prompts: void 0,
  capabilities: void 0
};
const toolInvalidCharRe = /[^a-z0-9_-]/gi;
let McpServerMetadataCache = class extends Disposable {
  constructor(scope, storageService) {
    super();
    this.didChange = false;
    this.cache = new LRUCache(128);
    this.extensionServers = /* @__PURE__ */ new Map();
    const storageKey = "mcpToolCache";
    this._register(storageService.onWillSaveState(() => {
      if (this.didChange) {
        storageService.store(storageKey, {
          extensionServers: [...this.extensionServers],
          serverTools: this.cache.toJSON()
        }, scope, StorageTarget.MACHINE);
        this.didChange = false;
      }
    }));
    try {
      const cached = storageService.getObject(storageKey, scope);
      this.extensionServers = new Map(cached?.extensionServers ?? []);
      cached?.serverTools?.forEach(([k, v]) => this.cache.set(k, v));
    } catch {
    }
  }
  /** Resets the cache for primitives and extension servers */
  reset() {
    this.cache.clear();
    this.extensionServers.clear();
    this.didChange = true;
  }
  /** Gets cached primitives for a server (used before a server is running) */
  get(definitionId) {
    return this.cache.get(definitionId);
  }
  /** Sets cached primitives for a server */
  store(definitionId, entry) {
    const prev = this.get(definitionId) || emptyToolEntry;
    this.cache.set(definitionId, { ...prev, ...entry });
    this.didChange = true;
  }
  /** Gets cached servers for a collection (used for extensions, before the extension activates) */
  getServers(collectionId) {
    return this.extensionServers.get(collectionId);
  }
  /** Sets cached servers for a collection */
  storeServers(collectionId, entry) {
    if (entry) {
      this.extensionServers.set(collectionId, entry);
    } else {
      this.extensionServers.delete(collectionId);
    }
    this.didChange = true;
  }
};
McpServerMetadataCache = __decorateClass([
  __decorateParam(1, IStorageService)
], McpServerMetadataCache);
class McpPrefixGenerator {
  constructor() {
    this._buckets = /* @__PURE__ */ new Map();
  }
  take(name) {
    const safeName = name.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, McpToolName.MaxPrefixLen - McpToolName.Prefix.length - 1);
    let bucket = this._buckets.get(safeName);
    if (!bucket) {
      bucket = { usedIndexes: /* @__PURE__ */ new Set(), size: 0 };
      this._buckets.set(safeName, bucket);
    }
    let index = 1;
    while (bucket.usedIndexes.has(index)) {
      index++;
    }
    bucket.usedIndexes.add(index);
    bucket.size++;
    const suffix = (index === 1 ? "" : String(index)) + "_";
    const maxNameLen = McpToolName.MaxPrefixLen - McpToolName.Prefix.length - suffix.length;
    const prefix = McpToolName.Prefix + safeName.slice(0, maxNameLen) + suffix;
    return {
      object: prefix,
      dispose: () => {
        bucket.usedIndexes.delete(index);
        bucket.size--;
        if (bucket.size === 0) {
          this._buckets.delete(safeName);
        }
      }
    };
  }
}
class CachedPrimitive {
  /**
   * @param _definitionId Server definition ID
   * @param _cache Metadata cache instance
   * @param _fromStaticDefinition Static definition that came with the server.
   * This should ONLY have a value if it should be used instead of whatever
   * is currently in the cache.
   * @param _fromCache Pull the value from the cache entry.
   * @param _toT Transform the value to the observable type.
   * @param defaultValue Default value if no cache entry.
   */
  constructor(_definitionId, _cache, _fromStaticDefinition, _fromCache, _toT, defaultValue) {
    this._definitionId = _definitionId;
    this._cache = _cache;
    this._fromStaticDefinition = _fromStaticDefinition;
    this._fromCache = _fromCache;
    this._toT = _toT;
    this.defaultValue = defaultValue;
    this.fromServerPromise = observableValue(this, void 0);
    this.fromServer = derived((reader) => this.fromServerPromise.read(reader)?.promiseResult.read(reader)?.data);
    this.value = derived((reader) => {
      const serverTools = this.fromServer.read(reader);
      const definitions = serverTools?.data ?? this._fromStaticDefinition?.read(reader) ?? this.fromCache?.data ?? this.defaultValue;
      return this._toT(definitions, reader);
    });
  }
  get fromCache() {
    const c = this._cache.get(this._definitionId);
    return c ? { data: this._fromCache(c), nonce: c.nonce } : void 0;
  }
  hasStaticDefinition(reader) {
    return !!this._fromStaticDefinition?.read(reader);
  }
}
let McpServer = class extends Disposable {
  constructor(initialCollection, definition, explicitRoots, _requiresExtensionActivation, _primitiveCache, prefixGenerator, enablementModel, _mcpRegistry, _allowedMcpServersService, workspacesService, _extensionService, _loggerService, _outputService, _telemetryService, _commandService, _instantiationService, _dialogService, _notificationService, _openerService, _samplingService, _elicitationService, _mcpSandboxService, environmentService) {
    super();
    this.definition = definition;
    this._requiresExtensionActivation = _requiresExtensionActivation;
    this._primitiveCache = _primitiveCache;
    this._mcpRegistry = _mcpRegistry;
    this._allowedMcpServersService = _allowedMcpServersService;
    this._extensionService = _extensionService;
    this._loggerService = _loggerService;
    this._outputService = _outputService;
    this._telemetryService = _telemetryService;
    this._commandService = _commandService;
    this._instantiationService = _instantiationService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._openerService = _openerService;
    this._samplingService = _samplingService;
    this._elicitationService = _elicitationService;
    this._mcpSandboxService = _mcpSandboxService;
    /** Shared task manager that survives reconnections */
    this._taskManager = this._register(new McpTaskManager());
    this._connectionSequencer = new Sequencer();
    this._connection = this._register(disposableObservableValue(this, void 0));
    this.connection = this._connection;
    this.connectionState = derived((reader) => this._policyBlock.read(reader) ?? this._connection.read(reader)?.state.read(reader) ?? { state: McpConnectionState.Kind.Stopped });
    /** Cached tools are suppressed while the server is blocked by policy so they cannot be listed, referenced, or executed. */
    this._gatedTools = derived((reader) => this._policyBlock.read(reader) ? [] : this._tools.value.read(reader));
    /** Cached prompts are suppressed while the server is blocked by policy. */
    this._gatedPrompts = derived((reader) => this._policyBlock.read(reader) ? [] : this._prompts.value.read(reader));
    this.cacheState = derived((reader) => {
      const currentNonce = () => this._fullDefinitions.read(reader)?.server?.cacheNonce;
      const stateWhenServingFromCache = () => {
        if (this._tools.hasStaticDefinition(reader)) {
          return McpServerCacheState.Cached;
        }
        if (!this._tools.fromCache) {
          return McpServerCacheState.Unknown;
        }
        return currentNonce() === this._tools.fromCache.nonce ? McpServerCacheState.Cached : McpServerCacheState.Outdated;
      };
      const fromServer = this._tools.fromServerPromise.read(reader);
      const connectionState = this.connectionState.read(reader);
      const isIdle = McpConnectionState.canBeStarted(connectionState.state) || !fromServer;
      if (isIdle) {
        return stateWhenServingFromCache();
      }
      const fromServerResult = fromServer?.promiseResult.read(reader);
      if (!fromServerResult) {
        return this._tools.fromCache ? McpServerCacheState.RefreshingFromCached : McpServerCacheState.RefreshingFromUnknown;
      }
      if (fromServerResult.error) {
        return stateWhenServingFromCache();
      }
      return fromServerResult.data?.nonce === currentNonce() ? McpServerCacheState.Live : McpServerCacheState.Outdated;
    });
    this._lastModeDebugged = false;
    this._isQuietStart = false;
    this._isSandboxSuggestionDialogVisible = false;
    this._potentialSandboxBlocks = [];
    this._potentialSandboxBlockListener = this._register(new MutableDisposable());
    /** Count of running tool calls, used to detect if sampling is during an LM call */
    this.runningToolCalls = /* @__PURE__ */ new Set();
    this.collection = initialCollection;
    this._fullDefinitions = this._mcpRegistry.getServerDefinition(this.collection, this.definition);
    this.enablement = derived((r) => enablementModel.readEnabled(definition.id, r));
    this._policyEpoch = observableFromEvent(this, this._allowedMcpServersService.onDidChangeAllowedMcpServers, () => void 0);
    this._policyBlock = derived(this, (reader) => {
      this._policyEpoch.read(reader);
      const connection = this._connection.read(reader);
      if (connection) {
        return this._evaluatePolicy(this._identityFromLaunch(connection.launchDefinition));
      }
      const launch = this._fullDefinitions.read(reader).server?.launch;
      if (!launch) {
        return void 0;
      }
      const identity = this._identityFromLaunch(launch);
      if (McpServer._hasUnresolvedVariables(identity)) {
        return void 0;
      }
      return this._evaluatePolicy(identity);
    });
    this._register(autorun((reader) => {
      if (this._policyBlock.read(reader) && this._connection.read(void 0)) {
        this._connection.set(void 0, void 0);
      }
    }));
    this._loggerId = `mcpServer.${definition.id}`;
    this._logger = this._register(_loggerService.createLogger(this._loggerId, { hidden: true, name: `MCP: ${definition.label}` }));
    const that = this;
    this._register(this._instantiationService.createInstance(McpDevModeServerAttache, this, { get lastModeDebugged() {
      return that._lastModeDebugged;
    } }));
    this._register(toDisposable(() => _loggerService.deregisterLogger(this._loggerId)));
    const workspaces = explicitRoots ? observableValue(this, explicitRoots.map((uri) => ({ uri, name: basename(uri) }))) : observableFromEvent(
      this,
      workspacesService.onDidChangeWorkspaceFolders,
      () => workspacesService.getWorkspace().folders
    );
    const uriTransformer = environmentService.remoteAuthority ? createURITransformer(environmentService.remoteAuthority) : void 0;
    this._register(autorun((reader) => {
      const cnx = this._connection.read(reader)?.handler.read(reader);
      if (!cnx) {
        return;
      }
      cnx.roots = workspaces.read(reader).filter((w) => w.uri.authority === (initialCollection.remoteAuthority || "")).map((w) => {
        let uri = URI.from(uriTransformer?.transformIncoming(w.uri) ?? w.uri);
        if (uri.scheme === Schemas.file) {
          uri = URI.file(normalizeDriveLetter(uri.fsPath, true));
        }
        return { name: w.name, uri: uri.toString() };
      });
    }));
    this._register(autorun((reader) => {
      const cnx = this._connection.read(reader);
      const handler = cnx?.handler.read(reader);
      if (handler) {
        this._populateLiveData(handler, cnx?.definition.cacheNonce, reader.store);
      } else if (this._tools) {
        this.resetLiveData();
      }
    }));
    this._register(autorun((reader) => {
      const cnx = this._connection.read(reader);
      this._potentialSandboxBlockListener.value = cnx?.onPotentialSandboxBlock((block) => this.recordPotentialSandboxBlock(block));
    }));
    const staticMetadata = derived((reader) => {
      const def = this._fullDefinitions.read(reader).server;
      return def && def.cacheNonce !== this._tools.fromCache?.nonce ? def.staticMetadata : void 0;
    });
    this._serverMetadata = new CachedPrimitive(
      this.definition.id,
      this._primitiveCache,
      staticMetadata.map((m) => m ? this._toStoredMetadata(m?.serverInfo, m?.instructions) : void 0),
      (entry) => ({ serverName: entry.serverName, serverInstructions: entry.serverInstructions, serverIcons: entry.serverIcons }),
      (entry) => ({ serverName: entry?.serverName, serverInstructions: entry?.serverInstructions, icons: McpIcons.fromStored(entry?.serverIcons) }),
      void 0
    );
    const preferredName = derived((reader) => this._serverMetadata.value.read(reader)?.serverName || this.definition.label);
    const prefixRef = derivedDisposable((reader) => prefixGenerator.take(preferredName.read(reader)));
    const toolPrefix = prefixRef.map((ref) => ref.object);
    this._tools = new CachedPrimitive(
      this.definition.id,
      this._primitiveCache,
      staticMetadata.map((m) => {
        const tools = m?.tools?.filter((t) => t.availability === McpServerStaticToolAvailability.Initial).map((t) => t.definition);
        return tools?.length ? new ObservablePromise(this._getValidatedTools(tools)) : void 0;
      }).map((o, reader) => o?.promiseResult.read(reader)?.data),
      (entry) => entry.tools,
      (entry, reader) => entry.map((def) => this._instantiationService.createInstance(McpTool, this, toolPrefix.read(reader), def)).sort((a, b) => a.compare(b)),
      []
    );
    this._prompts = new CachedPrimitive(
      this.definition.id,
      this._primitiveCache,
      void 0,
      (entry) => entry.prompts || [],
      (entry) => entry.map((e) => new McpPrompt(this, e)),
      []
    );
    this._capabilities = new CachedPrimitive(
      this.definition.id,
      this._primitiveCache,
      staticMetadata.map((m) => m?.capabilities !== void 0 ? encodeCapabilities(m.capabilities) : void 0),
      (entry) => entry.capabilities,
      (entry) => entry,
      void 0
    );
    prefixRef.recomputeInitiallyAndOnChange(this._store);
  }
  /**
   * Helper function to call the function on the handler once it's online. The
   * connection started if it is not already.
   */
  static async callOn(server, fn, token = CancellationToken.None) {
    await server.start({ promptType: "all-untrusted" });
    let ranOnce = false;
    let d;
    const callPromise = new Promise((resolve, reject) => {
      d = autorun((reader) => {
        if (ranOnce) {
          return;
        }
        const connection = server.connection.read(reader);
        if (!connection) {
          const state = server.connectionState.read(reader);
          if (state.state === McpConnectionState.Kind.Error) {
            reject(new McpConnectionFailedError(`MCP server could not be started: ${state.message}`));
          } else if (state.state === McpConnectionState.Kind.Stopped) {
            reject(new McpConnectionFailedError("MCP server has stopped"));
          }
          return;
        }
        const handler = connection.handler.read(reader);
        if (!handler) {
          const state = connection.state.read(reader);
          if (state.state === McpConnectionState.Kind.Error) {
            reject(new McpConnectionFailedError(`MCP server could not be started: ${state.message}`));
            return;
          } else if (state.state === McpConnectionState.Kind.Stopped) {
            reject(new McpConnectionFailedError("MCP server has stopped"));
            return;
          } else {
            return;
          }
        }
        resolve(fn(handler, connection));
        ranOnce = true;
      });
    });
    return raceCancellationError(callPromise, token).finally(() => d.dispose());
  }
  get capabilities() {
    return this._capabilities.value;
  }
  get tools() {
    return this._gatedTools;
  }
  get prompts() {
    return this._gatedPrompts;
  }
  get serverMetadata() {
    return this._serverMetadata.value;
  }
  get trustedAtNonce() {
    return this._primitiveCache.get(this.definition.id)?.trustedAtNonce;
  }
  set trustedAtNonce(nonce) {
    this._primitiveCache.store(this.definition.id, { trustedAtNonce: nonce });
  }
  get logger() {
    return this._logger;
  }
  readDefinitions() {
    return this._fullDefinitions;
  }
  showOutput(preserveFocus) {
    this._loggerService.setVisibility(this._loggerId, true);
    return this._outputService.showChannel(this._loggerId, preserveFocus);
  }
  resources(token) {
    const cts = new CancellationTokenSource(token);
    return new AsyncIterableProducer(async (emitter) => {
      await McpServer.callOn(this, async (handler) => {
        for await (const resource of handler.listResourcesIterable({}, cts.token)) {
          emitter.emitOne(resource.map((r) => new McpResource(this, r, McpIcons.fromParsed(this._parseIcons(r)))));
          if (cts.token.isCancellationRequested) {
            return;
          }
        }
      });
    }, () => cts.dispose(true));
  }
  resourceTemplates(token) {
    return McpServer.callOn(this, async (handler) => {
      const templates = await handler.listResourceTemplates({}, token);
      return templates.map((t) => new McpResourceTemplate(this, t, McpIcons.fromParsed(this._parseIcons(t))));
    }, token);
  }
  _identityFromLaunch(launch) {
    if (launch?.type === McpServerTransportType.HTTP) {
      return { name: this.definition.label, url: launch.uri.toString(true) };
    }
    if (launch?.type === McpServerTransportType.Stdio) {
      return typeof launch.command === "string" ? { name: this.definition.label, command: [launch.command, ...(launch.args ?? []).filter((arg) => typeof arg === "string")] } : { name: this.definition.label };
    }
    return { name: this.definition.label };
  }
  _evaluatePolicy(identity) {
    const allowed = this._allowedMcpServersService.isServerAllowed(identity);
    return allowed === true ? void 0 : { state: McpConnectionState.Kind.Error, message: allowed.value };
  }
  /**
   * Whether the URL/command fields matched by the policy still contain unresolved `${...}`
   * configuration variables. When they do, matching against allow/deny URL or command rules is
   * unreliable, so the block is deferred until the launch is resolved. The server name is used
   * verbatim and is not considered here.
   */
  static _hasUnresolvedVariables(identity) {
    const variableMarker = ConfigurationResolverExpression.VARIABLE_LHS;
    return !!identity.url?.includes(variableMarker) || !!identity.command?.some((arg) => arg.includes(variableMarker));
  }
  start({ interaction, autoTrustChanges, promptType, debug, errorOnUserInteraction } = {}) {
    interaction?.participants.set(this.definition.id, { s: "unknown" });
    return this._connectionSequencer.queue(async () => {
      const preStartBlock = this._policyBlock.get();
      if (preStartBlock) {
        return preStartBlock;
      }
      const activationEvent = mcpActivationEvent(this.collection.id.slice(extensionMcpCollectionPrefix.length));
      if (this._requiresExtensionActivation && !this._extensionService.activationEventIsDone(activationEvent)) {
        await this._extensionService.activateByEvent(activationEvent);
        await Promise.all(this._mcpRegistry.delegates.get().map((r) => r.waitForInitialProviderPromises()));
        if (this._store.isDisposed) {
          return { state: McpConnectionState.Kind.Stopped };
        }
      }
      let connection = this._connection.get();
      this._isQuietStart = !!errorOnUserInteraction;
      if (connection && McpConnectionState.canBeStarted(connection.state.get().state)) {
        connection.dispose();
        connection = void 0;
        this._connection.set(connection, void 0);
      }
      if (!connection) {
        this._lastModeDebugged = !!debug;
        const that = this;
        connection = await this._mcpRegistry.resolveConnection({
          interaction,
          autoTrustChanges,
          promptType,
          trustNonceBearer: {
            get trustedAtNonce() {
              return that.trustedAtNonce;
            },
            set trustedAtNonce(nonce) {
              that.trustedAtNonce = nonce;
            }
          },
          logger: this._logger,
          collectionRef: this.collection,
          definitionRef: this.definition,
          debug,
          errorOnUserInteraction,
          taskManager: this._taskManager
        });
        if (!connection) {
          return { state: McpConnectionState.Kind.Stopped };
        }
        if (this._store.isDisposed) {
          connection.dispose();
          return { state: McpConnectionState.Kind.Stopped };
        }
        this._connection.set(connection, void 0);
        if (connection.definition.devMode) {
          this.showOutput();
        }
      }
      const resolvedBlock = this._policyBlock.get();
      if (resolvedBlock) {
        this._connection.set(void 0, void 0);
        return resolvedBlock;
      }
      this._potentialSandboxBlocks.length = 0;
      const start = Date.now();
      let state = await connection.start({
        createMessageRequestHandler: (params, token) => this._samplingService.sample({
          isDuringToolCall: this.runningToolCalls.size > 0,
          server: this,
          params
        }, token).then((r) => r.sample),
        elicitationRequestHandler: async (req, token) => {
          const serverInfo = connection.handler.get()?.serverInfo;
          if (serverInfo) {
            this._telemetryService.publicLog2("mcp.elicitationRequested", {
              serverName: serverInfo.name,
              serverVersion: serverInfo.version
            });
          }
          const r = await this._elicitationService.elicit(this, Iterable.first(this.runningToolCalls), req, token || CancellationToken.None);
          r.dispose();
          return r.value;
        }
      });
      this._telemetryService.publicLog2("mcp/serverBootState", {
        state: McpConnectionState.toKindString(state.state),
        time: Date.now() - start
      });
      if (errorOnUserInteraction && state.state === McpConnectionState.Kind.Running) {
        let disposable;
        state = await new Promise((resolve, reject) => {
          disposable = autorun((reader) => {
            const handler = connection.handler.read(reader);
            if (handler) {
              resolve(state);
            }
            const s = connection.state.read(reader);
            if (s.state === McpConnectionState.Kind.Stopped && s.reason === "needs-user-interaction") {
              reject(new UserInteractionRequiredError("auth"));
            }
            if (!McpConnectionState.isRunning(s)) {
              resolve(s);
            }
          });
        }).finally(() => disposable.dispose());
      }
      if (state.state === McpConnectionState.Kind.Error) {
        let disposable;
        state = await new Promise((resolve, reject) => {
          disposable = autorun((reader) => {
            const cnx = this._connection.read(reader);
            const state2 = cnx?.state.read(reader);
            if (cnx && state2?.state === McpConnectionState.Kind.Error) {
              if (!this._isQuietStart) {
                this.showInteractiveError(cnx, state2, this._lastModeDebugged);
              } else {
                reject(new UserInteractionRequiredError("start"));
              }
            }
          });
        }).finally(() => disposable.dispose());
      }
      return state;
    }).finally(() => {
      interaction?.participants.set(this.definition.id, { s: "resolved" });
    });
  }
  showInteractiveError(cnx, error, debug) {
    if (cnx.definition.sandboxEnabled) {
      if (!this.showSandboxConfigSuggestionFromPotentialBlocks(cnx, this._potentialSandboxBlocks)) {
        this._notificationService.warn(localize("mcpServerError", "The MCP server {0} could not be started: {1}", cnx.definition.label, error.message));
      }
      return;
    }
    if (error.code === "ENOENT" && cnx.launchDefinition.type === McpServerTransportType.Stdio) {
      let docsLink;
      switch (cnx.launchDefinition.command) {
        case "uvx":
          docsLink = `https://aka.ms/vscode-mcp-install/uvx`;
          break;
        case "npx":
          docsLink = `https://aka.ms/vscode-mcp-install/npx`;
          break;
        case "dnx":
          docsLink = `https://aka.ms/vscode-mcp-install/dnx`;
          break;
        case "dotnet":
          docsLink = `https://aka.ms/vscode-mcp-install/dotnet`;
          break;
      }
      const options = [{
        label: localize("mcp.command.showOutput", "Show Output"),
        run: () => this.showOutput()
      }];
      if (cnx.definition.devMode?.debug?.type === "debugpy" && debug) {
        this._notificationService.prompt(Severity.Error, localize("mcpDebugPyHelp", 'The command "{0}" was not found. You can specify the path to debugpy in the `dev.debug.debugpyPath` option.', cnx.launchDefinition.command, cnx.definition.label), [...options, {
          label: localize("mcpViewDocs", "View Docs"),
          run: () => this._openerService.open(URI.parse("https://aka.ms/vscode-mcp-install/debugpy"))
        }]);
        return;
      }
      if (docsLink) {
        options.push({
          label: localize("mcpServerInstall", "Install {0}", cnx.launchDefinition.command),
          run: () => this._openerService.open(URI.parse(docsLink))
        });
      }
      this._notificationService.prompt(Severity.Error, localize("mcpServerNotFound", 'The command "{0}" needed to run {1} was not found.', cnx.launchDefinition.command, cnx.definition.label), options);
    } else {
      this._notificationService.warn(localize("mcpServerError", "The MCP server {0} could not be started: {1}", cnx.definition.label, error.message));
    }
  }
  showSandboxConfigSuggestionFromPotentialBlocks(cnx, potentialBlocks) {
    if (!cnx.definition.sandboxEnabled || !potentialBlocks.length || this._isSandboxSuggestionDialogVisible) {
      return false;
    }
    if (this._isQuietStart) {
      throw new UserInteractionRequiredError("sandbox-suggestion");
    }
    const existingSandboxConfig = this._fullDefinitions.get().collection?.sandbox;
    const suggestion = this._mcpSandboxService.getSandboxConfigSuggestionMessage(cnx.definition.label, potentialBlocks, existingSandboxConfig);
    if (!suggestion) {
      this._removePotentialSandboxBlocks(potentialBlocks);
      return false;
    }
    this._confirmAndApplySandboxConfigSuggestion(cnx, potentialBlocks, suggestion);
    return true;
  }
  _confirmAndApplySandboxConfigSuggestion(cnx, potentialBlocks, suggestion) {
    const mcpResource = cnx.definition.presentation?.origin?.uri ?? this.collection.presentation?.origin;
    const configTarget = this._fullDefinitions.get().collection?.configTarget;
    this._isSandboxSuggestionDialogVisible = true;
    void this._dialogService.confirm({
      type: "warning",
      message: localize("mcpSandboxSuggestion.confirm.message", "Update sandbox configuration in mcp.json for {0}?", cnx.definition.label),
      detail: suggestion.message,
      primaryButton: localize("mcpSandboxSuggestion.confirm.yes", "Yes"),
      cancelButton: localize("mcpSandboxSuggestion.confirm.no", "No")
    }).then(async (result) => {
      if (!result.confirmed) {
        return;
      }
      if (!mcpResource || configTarget === void 0) {
        this._notificationService.warn(localize("mcpSandboxSuggestion.apply.unavailable", "Couldn't determine where to update sandbox configuration for {0}.", cnx.definition.label));
        return;
      }
      try {
        const updated = await this._mcpSandboxService.applySandboxConfigSuggestion(cnx.definition, mcpResource, configTarget, potentialBlocks, suggestion.sandboxConfig);
        if (updated) {
          this._removePotentialSandboxBlocks(potentialBlocks);
          this._notificationService.info(localize("mcpSandboxSuggestion.apply.success", "Updated sandbox configuration for {0} in mcp.json. Restart server.", cnx.definition.label));
        }
      } catch (e) {
        this._notificationService.error(localize("mcpSandboxSuggestion.apply.error", "Failed to update sandbox configuration for {0}: {1}", cnx.definition.label, e instanceof Error ? e.message : String(e)));
      }
    }).finally(() => {
      this._isSandboxSuggestionDialogVisible = false;
    });
  }
  recordPotentialSandboxBlock(block) {
    this._potentialSandboxBlocks.push(block);
    if (this._potentialSandboxBlocks.length > 200) {
      this._potentialSandboxBlocks.splice(0, this._potentialSandboxBlocks.length - 200);
    }
    const connection = this._connection.get();
    if (connection?.state.get().state === McpConnectionState.Kind.Running) {
      this.showSandboxConfigSuggestionFromPotentialBlocks(connection, this._potentialSandboxBlocks);
    }
  }
  _removePotentialSandboxBlocks(blocks) {
    if (!blocks.length || !this._potentialSandboxBlocks.length) {
      return;
    }
    const toRemove = new Set(blocks);
    this._potentialSandboxBlocks = this._potentialSandboxBlocks.filter((block) => !toRemove.has(block));
  }
  stop() {
    return this._connection.get()?.stop() || Promise.resolve();
  }
  /** Waits for any ongoing tools to be refreshed before resolving. */
  awaitToolRefresh() {
    return new Promise((resolve) => {
      autorunSelfDisposable((reader) => {
        const promise = this._tools.fromServerPromise.read(reader);
        const result = promise?.promiseResult.read(reader);
        if (result) {
          resolve();
        }
      });
    });
  }
  resetLiveData() {
    transaction((tx) => {
      this._tools.fromServerPromise.set(void 0, tx);
      this._prompts.fromServerPromise.set(void 0, tx);
    });
  }
  async _normalizeTool(originalTool) {
    const uiMeta = originalTool._meta?.ui;
    let visibility = McpToolVisibility.Model | McpToolVisibility.App;
    if (uiMeta?.visibility && Array.isArray(uiMeta.visibility)) {
      visibility &= 0;
      if (uiMeta.visibility.includes("model")) {
        visibility |= McpToolVisibility.Model;
      }
      if (uiMeta.visibility.includes("app")) {
        visibility |= McpToolVisibility.App;
      }
    }
    const tool = {
      ...originalTool,
      serverToolName: originalTool.name,
      _icons: this._parseIcons(originalTool),
      visibility,
      uiResourceUri: uiMeta?.resourceUri
    };
    if (!tool.description) {
      this._logger.warn(`Tool ${tool.name} does not have a description. Tools must be accurately described to be called`);
      tool.description = "<empty>";
    }
    if (toolInvalidCharRe.test(tool.name)) {
      this._logger.warn(`Tool ${JSON.stringify(tool.name)} is invalid. Tools names may only contain [a-z0-9_-]`);
      tool.name = tool.name.replace(toolInvalidCharRe, "_");
    }
    if (tool.inputSchema && !tool.inputSchema.properties) {
      tool.inputSchema = { ...tool.inputSchema, properties: {} };
    }
    let diagnostics = [];
    const toolJson = JSON.stringify(tool.inputSchema);
    try {
      const schemaUri = URI.parse("https://json-schema.org/draft-07/schema");
      diagnostics = await this._commandService.executeCommand("json.validate", schemaUri, toolJson) || [];
    } catch (e) {
    }
    if (!diagnostics.length) {
      return tool;
    }
    const tree = json.parseTree(toolJson);
    const messages = diagnostics.map((d) => {
      const node = json.findNodeAtOffset(tree, d.range[0].character);
      const path = node && `/${json.getNodePath(node).join("/")}`;
      return d.message + (path ? ` (at ${path})` : "");
    });
    return { error: messages };
  }
  async _getValidatedTools(tools) {
    let error = "";
    const validations = await Promise.all(tools.map((t) => this._normalizeTool(t)));
    const validated = [];
    for (const [i, result] of validations.entries()) {
      if ("error" in result) {
        error += localize("mcpBadSchema.tool", "Tool `{0}` has invalid JSON parameters:", tools[i].name) + "\n";
        for (const message of result.error) {
          error += `	- ${message}
`;
        }
        error += `	- Schema: ${JSON.stringify(tools[i].inputSchema)}

`;
      } else {
        validated.push(result);
      }
    }
    if (error) {
      this._logger.warn(`${tools.length - validated.length} tools have invalid JSON schemas and will be omitted`);
      warnInvalidTools(this._instantiationService, this.definition.label, error);
    }
    return validated;
  }
  /**
   * Parses incoming MCP icons and returns the resulting 'stored' record. Note
   * that this requires an active MCP server connection since we validate
   * against some of that connection's data. The icons may however be stored
   * and rehydrated later.
   */
  _parseIcons(icons) {
    const cnx = this._connection.get();
    if (!cnx) {
      return [];
    }
    return parseAndValidateMcpIcon(icons, cnx.launchDefinition, this._logger);
  }
  _setServerTools(nonce, toolsPromise, tx) {
    const toolPromiseSafe = toolsPromise.then(async (tools) => {
      this._logger.info(`Discovered ${tools.length} tools`);
      const data = await this._getValidatedTools(tools);
      this._primitiveCache.store(this.definition.id, { tools: data, nonce });
      return { data, nonce };
    });
    this._tools.fromServerPromise.set(new ObservablePromise(toolPromiseSafe), tx);
    return toolPromiseSafe;
  }
  _setServerPrompts(nonce, promptsPromise, tx) {
    const promptsPromiseSafe = promptsPromise.then((result) => {
      const data = result.map((prompt) => ({
        ...prompt,
        _icons: this._parseIcons(prompt)
      }));
      this._primitiveCache.store(this.definition.id, { prompts: data, nonce });
      return { data, nonce };
    });
    this._prompts.fromServerPromise.set(new ObservablePromise(promptsPromiseSafe), tx);
    return promptsPromiseSafe;
  }
  _toStoredMetadata(serverInfo, instructions) {
    return {
      serverName: serverInfo ? serverInfo.title || serverInfo.name : void 0,
      serverInstructions: instructions,
      serverIcons: serverInfo ? this._parseIcons(serverInfo) : void 0
    };
  }
  _setServerMetadata(nonce, { serverInfo, instructions, capabilities }, tx) {
    const serverMetadata = this._toStoredMetadata(serverInfo, instructions);
    this._serverMetadata.fromServerPromise.set(ObservablePromise.resolved({ nonce, data: serverMetadata }), tx);
    const capabilitiesEncoded = encodeCapabilities(capabilities);
    this._capabilities.fromServerPromise.set(ObservablePromise.resolved({ data: capabilitiesEncoded, nonce }), tx);
    this._primitiveCache.store(this.definition.id, { ...serverMetadata, nonce, capabilities: capabilitiesEncoded });
  }
  _populateLiveData(handler, cacheNonce, store) {
    const cts = new CancellationTokenSource();
    store.add(toDisposable(() => cts.dispose(true)));
    const updateTools = (tx) => {
      const toolPromise = handler.capabilities.tools ? handler.listTools({}, cts.token) : Promise.resolve([]);
      return this._setServerTools(cacheNonce, toolPromise, tx);
    };
    const updatePrompts = (tx) => {
      const promptsPromise = handler.capabilities.prompts ? handler.listPrompts({}, cts.token) : Promise.resolve([]);
      return this._setServerPrompts(cacheNonce, promptsPromise, tx);
    };
    store.add(handler.onDidChangeToolList(() => {
      this._logger.info("Tool list changed, refreshing tools...");
      updateTools(void 0);
    }));
    store.add(handler.onDidChangePromptList(() => {
      this._logger.info("Prompts list changed, refreshing prompts...");
      updatePrompts(void 0);
    }));
    transaction((tx) => {
      this._setServerMetadata(cacheNonce, { serverInfo: handler.serverInfo, instructions: handler.serverInstructions, capabilities: handler.capabilities }, tx);
      updatePrompts(tx);
      const toolUpdate = updateTools(tx);
      toolUpdate.then((tools) => {
        this._telemetryService.publicLog2("mcp/serverBoot", {
          supportsLogging: !!handler.capabilities.logging,
          supportsPrompts: !!handler.capabilities.prompts,
          supportsResources: !!handler.capabilities.resources,
          toolCount: tools.data.length,
          serverName: handler.serverInfo.name,
          serverVersion: handler.serverInfo.version
        });
      });
    });
  }
};
McpServer = __decorateClass([
  __decorateParam(7, IMcpRegistry),
  __decorateParam(8, IAllowedMcpServersService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, ILoggerService),
  __decorateParam(12, IOutputService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, ICommandService),
  __decorateParam(15, IInstantiationService),
  __decorateParam(16, IDialogService),
  __decorateParam(17, INotificationService),
  __decorateParam(18, IOpenerService),
  __decorateParam(19, IMcpSamplingService),
  __decorateParam(20, IMcpElicitationService),
  __decorateParam(21, IMcpSandboxService),
  __decorateParam(22, IWorkbenchEnvironmentService)
], McpServer);
class McpPrompt {
  constructor(_server, _definition) {
    this._server = _server;
    this._definition = _definition;
    this.id = mcpPromptReplaceSpecialChars(this._server.definition.label + "." + _definition.name);
    this.name = _definition.name;
    this.title = _definition.title;
    this.description = _definition.description;
    this.arguments = _definition.arguments || [];
    this.icons = McpIcons.fromStored(this._definition._icons);
  }
  async resolve(args, token) {
    const result = await McpServer.callOn(this._server, (h) => h.getPrompt({ name: this._definition.name, arguments: args }, token), token);
    return result.messages;
  }
  async complete(argument, prefix, alreadyResolved, token) {
    const result = await McpServer.callOn(this._server, (h) => h.complete({
      ref: { type: "ref/prompt", name: this._definition.name },
      argument: { name: argument, value: prefix },
      context: { arguments: alreadyResolved }
    }, token), token);
    return result.completion.values;
  }
}
function encodeCapabilities(cap) {
  let out = 0;
  if (cap.logging) {
    out |= McpCapability.Logging;
  }
  if (cap.completions) {
    out |= McpCapability.Completions;
  }
  if (cap.prompts) {
    out |= McpCapability.Prompts;
    if (cap.prompts.listChanged) {
      out |= McpCapability.PromptsListChanged;
    }
  }
  if (cap.resources) {
    out |= McpCapability.Resources;
    if (cap.resources.subscribe) {
      out |= McpCapability.ResourcesSubscribe;
    }
    if (cap.resources.listChanged) {
      out |= McpCapability.ResourcesListChanged;
    }
  }
  if (cap.tools) {
    out |= McpCapability.Tools;
    if (cap.tools.listChanged) {
      out |= McpCapability.ToolsListChanged;
    }
  }
  return out;
}
let McpTool = class {
  constructor(_server, idPrefix, _definition, _elicitationService) {
    this._server = _server;
    this._definition = _definition;
    this._elicitationService = _elicitationService;
    this.referenceName = _definition.name.replaceAll(".", "_");
    this.id = (idPrefix + _definition.name).replaceAll(".", "_").slice(0, McpToolName.MaxLength);
    this.icons = McpIcons.fromStored(this._definition._icons);
    this.visibility = _definition.visibility ?? McpToolVisibility.Model | McpToolVisibility.App;
  }
  get definition() {
    return this._definition;
  }
  get uiResourceUri() {
    return this._definition.uiResourceUri;
  }
  async call(params, context, token) {
    if (context) {
      this._server.runningToolCalls.add(context);
    }
    try {
      return await this._callWithProgress(params, void 0, context, token);
    } finally {
      if (context) {
        this._server.runningToolCalls.delete(context);
      }
    }
  }
  async callWithProgress(params, progress, context, token) {
    if (context) {
      this._server.runningToolCalls.add(context);
    }
    try {
      return await this._callWithProgress(params, progress, context, token);
    } finally {
      if (context) {
        this._server.runningToolCalls.delete(context);
      }
    }
  }
  _callWithProgress(params, progress, context, token = CancellationToken.None, allowRetry = true) {
    const name = this._definition.serverToolName ?? this._definition.name;
    const progressToken = progress ? generateUuid() : void 0;
    const store = new DisposableStore();
    return McpServer.callOn(this._server, async (h) => {
      if (progress) {
        store.add(h.onDidReceiveProgressNotification((e) => {
          if (e.params.progressToken === progressToken) {
            progress.report({
              message: e.params.message,
              progress: e.params.total !== void 0 && e.params.progress !== void 0 ? e.params.progress / e.params.total : void 0
            });
          }
        }));
      }
      const meta = { progressToken };
      if (context?.chatSessionResource) {
        meta["vscode.conversationId"] = chatSessionResourceToId(context.chatSessionResource);
      }
      if (context?.chatRequestId) {
        meta["vscode.requestId"] = context.chatRequestId;
      }
      if (context?.traceparent) {
        meta["traceparent"] = context.traceparent;
        if (context.tracestate) {
          meta["tracestate"] = context.tracestate;
        }
      }
      const taskHint = this._definition.execution?.taskSupport;
      const serverSupportsTasksForTools = h.capabilities.tasks?.requests?.tools?.call !== void 0;
      const shouldUseTask = serverSupportsTasksForTools && (taskHint === "required" || taskHint === "optional");
      try {
        const result = await h.callTool({
          name,
          arguments: params,
          task: shouldUseTask ? {} : void 0,
          _meta: meta
        }, token, progress ? (message) => progress.report({ message }) : void 0);
        await this._server.awaitToolRefresh();
        return result;
      } catch (err) {
        if (err instanceof MpcResponseError && err.code === MCP.URL_ELICITATION_REQUIRED && allowRetry) {
          await this._handleElicitationErr(err, context, token);
          return this._callWithProgress(params, progress, context, token, false);
        }
        const state = this._server.connectionState.get();
        if (allowRetry && state.state === McpConnectionState.Kind.Error && state.shouldRetry) {
          return this._callWithProgress(params, progress, context, token, false);
        } else {
          throw err;
        }
      } finally {
        store.dispose();
      }
    }, token);
  }
  async _handleElicitationErr(err, context, token) {
    const elicitations = err.data?.elicitations;
    if (Array.isArray(elicitations) && elicitations.length > 0) {
      for (const elicitation of elicitations) {
        const elicitResult = await this._elicitationService.elicit(this._server, context, elicitation, token);
        try {
          if (elicitResult.value.action !== "accept") {
            throw err;
          }
          if (elicitResult.kind === ElicitationKind.URL) {
            await elicitResult.wait;
          }
        } finally {
          elicitResult.dispose();
        }
      }
    }
  }
  compare(other) {
    return this._definition.name.localeCompare(other.definition.name);
  }
};
McpTool = __decorateClass([
  __decorateParam(3, IMcpElicitationService)
], McpTool);
function warnInvalidTools(instaService, serverName, errorText) {
  instaService.invokeFunction((accessor) => {
    const notificationService = accessor.get(INotificationService);
    const editorService = accessor.get(IEditorService);
    notificationService.notify({
      severity: Severity.Warning,
      message: localize("mcpBadSchema", "MCP server `{0}` has tools with invalid parameters which will be omitted.", serverName),
      actions: {
        primary: [{
          class: void 0,
          enabled: true,
          id: "mcpBadSchema.show",
          tooltip: "",
          label: localize("mcpBadSchema.show", "Show"),
          run: () => {
            editorService.openEditor({
              resource: void 0,
              contents: errorText
            });
          }
        }]
      }
    });
  });
}
class McpResource {
  constructor(server, original, icons) {
    this.icons = icons;
    this.mcpUri = original.uri;
    this.title = original.title;
    this.uri = McpResourceURI.fromServer(server.definition, original.uri);
    this.name = original.name;
    this.description = original.description;
    this.mimeType = original.mimeType;
    this.sizeInBytes = original.size;
  }
}
class McpResourceTemplate {
  constructor(_server, _definition, icons) {
    this._server = _server;
    this._definition = _definition;
    this.icons = icons;
    this.name = _definition.name;
    this.description = _definition.description;
    this.mimeType = _definition.mimeType;
    this.title = _definition.title;
    this.template = UriTemplate.parse(_definition.uriTemplate);
  }
  resolveURI(vars) {
    const serverUri = this.template.resolve(vars);
    return McpResourceURI.fromServer(this._server.definition, serverUri);
  }
  async complete(templatePart, prefix, alreadyResolved, token) {
    const result = await McpServer.callOn(this._server, (h) => h.complete({
      ref: { type: "ref/resource", uri: this._definition.uriTemplate },
      argument: { name: templatePart, value: prefix },
      context: {
        arguments: mapValues(alreadyResolved, (v) => Array.isArray(v) ? v.join("/") : v)
      }
    }, token), token);
    return result.completion.values;
  }
}
export {
  McpPrefixGenerator,
  McpServer,
  McpServerMetadataCache,
  McpTool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BTZXJ2ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBc3luY0l0ZXJhYmxlUHJvZHVjZXIsIHJhY2VDYW5jZWxsYXRpb25FcnJvciwgU2VxdWVuY2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0ICogYXMganNvbiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZURyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgbWFwVmFsdWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBhdXRvcnVuU2VsZkRpc3Bvc2FibGUsIGRlcml2ZWQsIGRlcml2ZWREaXNwb3NhYmxlLCBkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlLCBJRGVyaXZlZFJlYWRlciwgSU9ic2VydmFibGUsIElSZWFkZXIsIElUcmFuc2FjdGlvbiwgb2JzZXJ2YWJsZUZyb21FdmVudCwgT2JzZXJ2YWJsZVByb21pc2UsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVVUklUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaVRyYW5zZm9ybWVyLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2ZXJJZGVudGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vYWxsb3dlZE1jcFNlcnZlcnMuanMnO1xuaW1wb3J0IHsgSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJUHJvbXB0Q2hvaWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBjaGF0U2Vzc2lvblJlc291cmNlVG9JZCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtY3BBY3RpdmF0aW9uRXZlbnQgfSBmcm9tICcuL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWNwRGV2TW9kZVNlcnZlckF0dGFjaGUgfSBmcm9tICcuL21jcERldk1vZGUuanMnO1xuaW1wb3J0IHsgTWNwSWNvbnMsIHBhcnNlQW5kVmFsaWRhdGVNY3BJY29uLCBTdG9yZWRNY3BJY29ucyB9IGZyb20gJy4vbWNwSWNvbnMuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BTYW5kYm94U2VydmljZSB9IGZyb20gJy4vbWNwU2FuZGJveFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIgfSBmcm9tICcuL21jcFNlcnZlclJlcXVlc3RIYW5kbGVyLmpzJztcbmltcG9ydCB7IE1jcFRhc2tNYW5hZ2VyIH0gZnJvbSAnLi9tY3BUYXNrTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBFbGljaXRhdGlvbktpbmQsIGV4dGVuc2lvbk1jcENvbGxlY3Rpb25QcmVmaXgsIElNY3BFbGljaXRhdGlvblNlcnZpY2UsIElNY3BJY29ucywgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9jaywgSU1jcFByb21wdCwgSU1jcFByb21wdE1lc3NhZ2UsIElNY3BSZXNvdXJjZSwgSU1jcFJlc291cmNlVGVtcGxhdGUsIElNY3BTYW1wbGluZ1NlcnZpY2UsIElNY3BTZXJ2ZXIsIElNY3BTZXJ2ZXJDb25uZWN0aW9uLCBJTWNwU2VydmVyU3RhcnRPcHRzLCBJTWNwVG9vbCwgSU1jcFRvb2xDYWxsQ29udGV4dCwgTWNwQ2FwYWJpbGl0eSwgTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sIE1jcENvbGxlY3Rpb25SZWZlcmVuY2UsIE1jcENvbm5lY3Rpb25GYWlsZWRFcnJvciwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BEZWZpbml0aW9uUmVmZXJlbmNlLCBtY3BQcm9tcHRSZXBsYWNlU3BlY2lhbENoYXJzLCBNY3BSZXNvdXJjZVVSSSwgTWNwU2VydmVyQ2FjaGVTdGF0ZSwgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJTdGF0aWNUb29sQXZhaWxhYmlsaXR5LCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLCBNY3BUb29sTmFtZSwgTWNwVG9vbFZpc2liaWxpdHksIE1wY1Jlc3BvbnNlRXJyb3IsIFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IgfSBmcm9tICcuL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSwgSUVuYWJsZW1lbnRNb2RlbCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBNY3BBcHBzIH0gZnJvbSAnLi9tb2RlbENvbnRleHRQcm90b2NvbEFwcHMuanMnO1xuaW1wb3J0IHsgVXJpVGVtcGxhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmlUZW1wbGF0ZS5qcyc7XG5cbnR5cGUgU2VydmVyQm9vdERhdGEgPSB7XG5cdHN1cHBvcnRzTG9nZ2luZzogYm9vbGVhbjtcblx0c3VwcG9ydHNQcm9tcHRzOiBib29sZWFuO1xuXHRzdXBwb3J0c1Jlc291cmNlczogYm9vbGVhbjtcblx0dG9vbENvdW50OiBudW1iZXI7XG5cdHNlcnZlck5hbWU6IHN0cmluZztcblx0c2VydmVyVmVyc2lvbjogc3RyaW5nO1xufTtcbnR5cGUgU2VydmVyQm9vdENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2Nvbm5vcjQzMTInO1xuXHRjb21tZW50OiAnRGV0YWlscyB0aGUgY2FwYWJpbGl0aWVzIG9mIHRoZSBNQ1Agc2VydmVyJztcblx0c3VwcG9ydHNMb2dnaW5nOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGUgc2VydmVyIHN1cHBvcnRzIGxvZ2dpbmcnIH07XG5cdHN1cHBvcnRzUHJvbXB0czogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIHNlcnZlciBzdXBwb3J0cyBwcm9tcHRzJyB9O1xuXHRzdXBwb3J0c1Jlc291cmNlczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIHNlcnZlciBzdXBwb3J0cyByZXNvdXJjZScgfTtcblx0dG9vbENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiB0b29scyB0aGUgc2VydmVyIGFkdmVydGlzZXMnIH07XG5cdHNlcnZlck5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgTUNQIHNlcnZlcicgfTtcblx0c2VydmVyVmVyc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB2ZXJzaW9uIG9mIHRoZSBNQ1Agc2VydmVyJyB9O1xufTtcblxudHlwZSBFbGljaXRhdGlvblRlbGVtZXRyeURhdGEgPSB7XG5cdHNlcnZlck5hbWU6IHN0cmluZztcblx0c2VydmVyVmVyc2lvbjogc3RyaW5nO1xufTtcblxudHlwZSBFbGljaXRhdGlvblRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2Nvbm5vcjQzMTInO1xuXHRjb21tZW50OiAnVHJpZ2dlcmVkIHdoZW4gZWxpY3RhdGlvbiBpcyByZXF1ZXN0ZWQnO1xuXHRzZXJ2ZXJOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIE1DUCBzZXJ2ZXInIH07XG5cdHNlcnZlclZlcnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdmVyc2lvbiBvZiB0aGUgTUNQIHNlcnZlcicgfTtcbn07XG5cbmV4cG9ydCB0eXBlIE1jcFNlcnZlckluc3RhbGxEYXRhID0ge1xuXHRzZXJ2ZXJOYW1lOiBzdHJpbmc7XG5cdHNvdXJjZTogJ2dhbGxlcnknIHwgJ2xvY2FsJztcblx0c2NvcGU6IHN0cmluZztcblx0c3VjY2VzczogYm9vbGVhbjtcblx0ZXJyb3I/OiBzdHJpbmc7XG5cdGhhc0lucHV0czogYm9vbGVhbjtcbn07XG5cbmV4cG9ydCB0eXBlIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdjb25ub3I0MzEyJztcblx0Y29tbWVudDogJ01DUCBzZXJ2ZXIgaW5zdGFsbGF0aW9uIGV2ZW50IHRyYWNraW5nJztcblx0c2VydmVyTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSBNQ1Agc2VydmVyIGJlaW5nIGluc3RhbGxlZCcgfTtcblx0c291cmNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSW5zdGFsbGF0aW9uIHNvdXJjZSAoZ2FsbGVyeSBvciBsb2NhbCknIH07XG5cdHNjb3BlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSW5zdGFsbGF0aW9uIHNjb3BlICh1c2VyLCB3b3Jrc3BhY2UsIGV0Yy4pJyB9O1xuXHRzdWNjZXNzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciBpbnN0YWxsYXRpb24gc3VjY2VlZGVkJyB9O1xuXHRlcnJvcj86IHsgY2xhc3NpZmljYXRpb246ICdDYWxsc3RhY2tPckV4Y2VwdGlvbic7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdFcnJvciBtZXNzYWdlIGlmIGluc3RhbGxhdGlvbiBmYWlsZWQnIH07XG5cdGhhc0lucHV0czogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIHNlcnZlciByZXF1aXJlcyBpbnB1dCBjb25maWd1cmF0aW9uJyB9O1xufTtcblxudHlwZSBTZXJ2ZXJCb290U3RhdGUgPSB7XG5cdHN0YXRlOiBzdHJpbmc7XG5cdHRpbWU6IG51bWJlcjtcbn07XG50eXBlIFNlcnZlckJvb3RTdGF0ZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2Nvbm5vcjQzMTInO1xuXHRjb21tZW50OiAnRGV0YWlscyB0aGUgY2FwYWJpbGl0aWVzIG9mIHRoZSBNQ1Agc2VydmVyJztcblx0c3RhdGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc2VydmVyIG91dGNvbWUnIH07XG5cdHRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdEdXJhdGlvbiBpbiBtaWxsaXNlY29uZHMgdG8gcmVhY2ggdGhhdCBzdGF0ZScgfTtcbn07XG5cbnR5cGUgU3RvcmVkTWNwUHJvbXB0ID0gTUNQLlByb21wdCAmIHsgX2ljb25zOiBTdG9yZWRNY3BJY29ucyB9O1xuXG5pbnRlcmZhY2UgSVRvb2xDYWNoZUVudHJ5IHtcblx0cmVhZG9ubHkgc2VydmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzZXJ2ZXJJbnN0cnVjdGlvbnM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2VydmVySWNvbnM6IFN0b3JlZE1jcEljb25zO1xuXG5cdHJlYWRvbmx5IHRydXN0ZWRBdE5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIENhY2hlZCB0b29scyBzbyB3ZSBjYW4gc2hvdyB3aGF0J3MgYXZhaWxhYmxlIGJlZm9yZSBpdCdzIHN0YXJ0ZWQgKi9cblx0cmVhZG9ubHkgdG9vbHM6IHJlYWRvbmx5IFZhbGlkYXRlZE1jcFRvb2xbXTtcblx0LyoqIENhY2hlZCBwcm9tcHRzICovXG5cdHJlYWRvbmx5IHByb21wdHM6IHJlYWRvbmx5IFN0b3JlZE1jcFByb21wdFtdIHwgdW5kZWZpbmVkO1xuXHQvKiogQ2FjaGVkIGNhcGFiaWxpdGllcyAqL1xuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IE1jcENhcGFiaWxpdHkgfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IGVtcHR5VG9vbEVudHJ5OiBJVG9vbENhY2hlRW50cnkgPSB7XG5cdHNlcnZlck5hbWU6IHVuZGVmaW5lZCxcblx0c2VydmVySWNvbnM6IFtdLFxuXHRzZXJ2ZXJJbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCxcblx0dHJ1c3RlZEF0Tm9uY2U6IHVuZGVmaW5lZCxcblx0bm9uY2U6IHVuZGVmaW5lZCxcblx0dG9vbHM6IFtdLFxuXHRwcm9tcHRzOiB1bmRlZmluZWQsXG5cdGNhcGFiaWxpdGllczogdW5kZWZpbmVkLFxufTtcblxuaW50ZXJmYWNlIElTZXJ2ZXJDYWNoZUVudHJ5IHtcblx0cmVhZG9ubHkgc2VydmVyczogcmVhZG9ubHkgTWNwU2VydmVyRGVmaW5pdGlvbi5TZXJpYWxpemVkW107XG59XG5cbmNvbnN0IHRvb2xJbnZhbGlkQ2hhclJlID0gL1teYS16MC05Xy1dL2dpO1xuXG5leHBvcnQgY2xhc3MgTWNwU2VydmVyTWV0YWRhdGFDYWNoZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIGRpZENoYW5nZSA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlID0gbmV3IExSVUNhY2hlPHN0cmluZywgSVRvb2xDYWNoZUVudHJ5PigxMjgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZlcnMgPSBuZXcgTWFwPC8qIGNvbGxlY3Rpb24gSUQgKi9zdHJpbmcsIElTZXJ2ZXJDYWNoZUVudHJ5PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNjb3BlOiBTdG9yYWdlU2NvcGUsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dHlwZSBTdG9yZWRUeXBlID0ge1xuXHRcdFx0ZXh0ZW5zaW9uU2VydmVyczogW3N0cmluZywgSVNlcnZlckNhY2hlRW50cnldW107XG5cdFx0XHRzZXJ2ZXJUb29sczogW3N0cmluZywgSVRvb2xDYWNoZUVudHJ5XVtdO1xuXHRcdH07XG5cblx0XHRjb25zdCBzdG9yYWdlS2V5ID0gJ21jcFRvb2xDYWNoZSc7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmRpZENoYW5nZSkge1xuXHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uU2VydmVyczogWy4uLnRoaXMuZXh0ZW5zaW9uU2VydmVyc10sXG5cdFx0XHRcdFx0c2VydmVyVG9vbHM6IHRoaXMuY2FjaGUudG9KU09OKCksXG5cdFx0XHRcdH0gc2F0aXNmaWVzIFN0b3JlZFR5cGUsIHNjb3BlLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHR0aGlzLmRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjYWNoZWQ6IFN0b3JlZFR5cGUgfCB1bmRlZmluZWQgPSBzdG9yYWdlU2VydmljZS5nZXRPYmplY3Qoc3RvcmFnZUtleSwgc2NvcGUpO1xuXHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2ZXJzID0gbmV3IE1hcChjYWNoZWQ/LmV4dGVuc2lvblNlcnZlcnMgPz8gW10pO1xuXHRcdFx0Y2FjaGVkPy5zZXJ2ZXJUb29scz8uZm9yRWFjaCgoW2ssIHZdKSA9PiB0aGlzLmNhY2hlLnNldChrLCB2KSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmVkXG5cdFx0fVxuXHR9XG5cblx0LyoqIFJlc2V0cyB0aGUgY2FjaGUgZm9yIHByaW1pdGl2ZXMgYW5kIGV4dGVuc2lvbiBzZXJ2ZXJzICovXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuY2FjaGUuY2xlYXIoKTtcblx0XHR0aGlzLmV4dGVuc2lvblNlcnZlcnMuY2xlYXIoKTtcblx0XHR0aGlzLmRpZENoYW5nZSA9IHRydWU7XG5cdH1cblxuXHQvKiogR2V0cyBjYWNoZWQgcHJpbWl0aXZlcyBmb3IgYSBzZXJ2ZXIgKHVzZWQgYmVmb3JlIGEgc2VydmVyIGlzIHJ1bm5pbmcpICovXG5cdGdldChkZWZpbml0aW9uSWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLmNhY2hlLmdldChkZWZpbml0aW9uSWQpO1xuXHR9XG5cblx0LyoqIFNldHMgY2FjaGVkIHByaW1pdGl2ZXMgZm9yIGEgc2VydmVyICovXG5cdHN0b3JlKGRlZmluaXRpb25JZDogc3RyaW5nLCBlbnRyeTogUGFydGlhbDxJVG9vbENhY2hlRW50cnk+KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldiA9IHRoaXMuZ2V0KGRlZmluaXRpb25JZCkgfHwgZW1wdHlUb29sRW50cnk7XG5cdFx0dGhpcy5jYWNoZS5zZXQoZGVmaW5pdGlvbklkLCB7IC4uLnByZXYsIC4uLmVudHJ5IH0pO1xuXHRcdHRoaXMuZGlkQ2hhbmdlID0gdHJ1ZTtcblx0fVxuXG5cdC8qKiBHZXRzIGNhY2hlZCBzZXJ2ZXJzIGZvciBhIGNvbGxlY3Rpb24gKHVzZWQgZm9yIGV4dGVuc2lvbnMsIGJlZm9yZSB0aGUgZXh0ZW5zaW9uIGFjdGl2YXRlcykgKi9cblx0Z2V0U2VydmVycyhjb2xsZWN0aW9uSWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvblNlcnZlcnMuZ2V0KGNvbGxlY3Rpb25JZCk7XG5cdH1cblxuXHQvKiogU2V0cyBjYWNoZWQgc2VydmVycyBmb3IgYSBjb2xsZWN0aW9uICovXG5cdHN0b3JlU2VydmVycyhjb2xsZWN0aW9uSWQ6IHN0cmluZywgZW50cnk6IElTZXJ2ZXJDYWNoZUVudHJ5IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvblNlcnZlcnMuc2V0KGNvbGxlY3Rpb25JZCwgZW50cnkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvblNlcnZlcnMuZGVsZXRlKGNvbGxlY3Rpb25JZCk7XG5cdFx0fVxuXHRcdHRoaXMuZGlkQ2hhbmdlID0gdHJ1ZTtcblx0fVxufVxuXG4vKipcbiAqIFNoYXJlZCBhY3Jvc3MgYWxsIHtAbGluayBNY3BTZXJ2ZXJ9cy4gRWFjaCBzZXJ2ZXIgYHRha2VgcyB0aGUgbmFtZSBpdCB3YW50c1xuICogdG8gYmFzZSBpdHMgdG9vbCBwcmVmaXggb24gKGFubm91bmNlZCBgc2VydmVySW5mby50aXRsZWAvYG5hbWVgIHdoZW4ga25vd24sXG4gKiBvdGhlcndpc2UgdGhlIG1jcC5qc29uIGtleSkgYW5kIGdldHMgYmFjayBhIHN0YWJsZSwgY29sbGlzaW9uLXJlc29sdmVkIHByZWZpeFxuICogb2JzZXJ2YWJsZS4gV2hlbiBhIHNlcnZlcidzIHByZWZlcnJlZCBuYW1lIGNoYW5nZXMgKGUuZy4gYWZ0ZXIgdGhlIGxpdmVcbiAqIGBzZXJ2ZXJJbmZvYCBhcnJpdmVzKSwgaXQgc2ltcGx5IHRha2VzIGFnYWluIGFuZCBkaXNwb3NlcyB0aGUgcHJldmlvdXNcbiAqIHJlZmVyZW5jZTsgb3RoZXIgc2VydmVycyB0aGF0IHNoYXJlIHRoZSBuYW1lIGtlZXAgdGhlIHN1ZmZpeCB0aGV5IHdlcmVcbiAqIGFscmVhZHkgYXNzaWduZWQuIFNlZSAjMjk5NzQ5LlxuICovXG5leHBvcnQgY2xhc3MgTWNwUHJlZml4R2VuZXJhdG9yIHtcblx0cHJpdmF0ZSByZWFkb25seSBfYnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCB7IHVzZWRJbmRleGVzOiBTZXQ8bnVtYmVyPjsgc2l6ZTogbnVtYmVyIH0+KCk7XG5cblx0dGFrZShuYW1lOiBzdHJpbmcpOiBJUmVmZXJlbmNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHNhZmVOYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05Xy4tXSsvZywgJ18nKS5zbGljZSgwLCBNY3BUb29sTmFtZS5NYXhQcmVmaXhMZW4gLSBNY3BUb29sTmFtZS5QcmVmaXgubGVuZ3RoIC0gMSk7XG5cdFx0bGV0IGJ1Y2tldCA9IHRoaXMuX2J1Y2tldHMuZ2V0KHNhZmVOYW1lKTtcblx0XHRpZiAoIWJ1Y2tldCkge1xuXHRcdFx0YnVja2V0ID0geyB1c2VkSW5kZXhlczogbmV3IFNldCgpLCBzaXplOiAwIH07XG5cdFx0XHR0aGlzLl9idWNrZXRzLnNldChzYWZlTmFtZSwgYnVja2V0KTtcblx0XHR9XG5cblx0XHRsZXQgaW5kZXggPSAxO1xuXHRcdHdoaWxlIChidWNrZXQudXNlZEluZGV4ZXMuaGFzKGluZGV4KSkge1xuXHRcdFx0aW5kZXgrKztcblx0XHR9XG5cdFx0YnVja2V0LnVzZWRJbmRleGVzLmFkZChpbmRleCk7XG5cdFx0YnVja2V0LnNpemUrKztcblxuXHRcdC8vIFRyaW0gc2FmZU5hbWUgZm9yIHRoaXMgb3V0cHV0IGlmIGEgbXVsdGktZGlnaXQgc3VmZml4IHdvdWxkIHB1c2ggdXMgcGFzdFxuXHRcdC8vIE1heFByZWZpeExlbi4gVGhlIGJ1Y2tldCBpcyBrZXllZCBvbiB0aGUgdW4tdHJpbW1lZCBzYWZlTmFtZSBzbyBjb2xsaXNpb25zXG5cdFx0Ly8gYXJlIHN0aWxsIGRldGVjdGVkIGNvbnNpc3RlbnRseSBhY3Jvc3MgaW5kZXhlcy5cblx0XHRjb25zdCBzdWZmaXggPSAoaW5kZXggPT09IDEgPyAnJyA6IFN0cmluZyhpbmRleCkpICsgJ18nO1xuXHRcdGNvbnN0IG1heE5hbWVMZW4gPSBNY3BUb29sTmFtZS5NYXhQcmVmaXhMZW4gLSBNY3BUb29sTmFtZS5QcmVmaXgubGVuZ3RoIC0gc3VmZml4Lmxlbmd0aDtcblx0XHRjb25zdCBwcmVmaXggPSBNY3BUb29sTmFtZS5QcmVmaXggKyBzYWZlTmFtZS5zbGljZSgwLCBtYXhOYW1lTGVuKSArIHN1ZmZpeDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IHByZWZpeCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0YnVja2V0IS51c2VkSW5kZXhlcy5kZWxldGUoaW5kZXgpO1xuXHRcdFx0XHRidWNrZXQhLnNpemUtLTtcblx0XHRcdFx0aWYgKGJ1Y2tldCEuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2J1Y2tldHMuZGVsZXRlKHNhZmVOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG59XG5cbnR5cGUgVmFsaWRhdGVkTWNwVG9vbCA9IE1DUC5Ub29sICYge1xuXHRfaWNvbnM6IFN0b3JlZE1jcEljb25zO1xuXG5cdC8qKlxuXHQgKiBUb29sIG5hbWUgYXMgcHVibGlzaGVkIGJ5IHRoZSBNQ1Agc2VydmVyLiBUaGlzIG1heVxuXHQgKiBiZSBkaWZmZXJlbnQgdGhhbiB0aGUgb25lIGluIHtAbGluayBkZWZpbml0aW9ufSBkdWUgdG8gbmFtZSBub3JtYWxpemF0aW9uXG5cdCAqIGluIHtAbGluayBNY3BTZXJ2ZXIuX2dldFZhbGlkYXRlZFRvb2xzfS5cblx0ICovXG5cdHNlcnZlclRvb2xOYW1lOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFZpc2liaWxpdHkgb2YgdGhlIHRvb2wsIHBhcnNlZCBmcm9tIGBfbWV0YS51aS52aXNpYmlsaXR5YC5cblx0ICogRGVmYXVsdHMgdG8gTW9kZWwgfCBBcHAgaWYgbm90IHNwZWNpZmllZC5cblx0ICovXG5cdHZpc2liaWxpdHk6IE1jcFRvb2xWaXNpYmlsaXR5O1xuXG5cdC8qKlxuXHQgKiBVSSByZXNvdXJjZSBVUkkgaWYgdGhpcyB0b29sIGhhcyBhbiBhc3NvY2lhdGVkIE1DUCBBcHAgVUkuXG5cdCAqIFBhcnNlZCBmcm9tIGBfbWV0YS51aS5yZXNvdXJjZVVyaWAuXG5cdCAqL1xuXHR1aVJlc291cmNlVXJpPzogc3RyaW5nO1xufTtcblxuaW50ZXJmYWNlIFN0b3JlZFNlcnZlck1ldGFkYXRhIHtcblx0cmVhZG9ubHkgc2VydmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzZXJ2ZXJJbnN0cnVjdGlvbnM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2VydmVySWNvbnM6IFN0b3JlZE1jcEljb25zIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgU2VydmVyTWV0YWRhdGEge1xuXHRyZWFkb25seSBzZXJ2ZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNlcnZlckluc3RydWN0aW9uczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpY29uczogSU1jcEljb25zO1xufVxuXG5jbGFzcyBDYWNoZWRQcmltaXRpdmU8VCwgQz4ge1xuXHQvKipcblx0ICogQHBhcmFtIF9kZWZpbml0aW9uSWQgU2VydmVyIGRlZmluaXRpb24gSURcblx0ICogQHBhcmFtIF9jYWNoZSBNZXRhZGF0YSBjYWNoZSBpbnN0YW5jZVxuXHQgKiBAcGFyYW0gX2Zyb21TdGF0aWNEZWZpbml0aW9uIFN0YXRpYyBkZWZpbml0aW9uIHRoYXQgY2FtZSB3aXRoIHRoZSBzZXJ2ZXIuXG5cdCAqIFRoaXMgc2hvdWxkIE9OTFkgaGF2ZSBhIHZhbHVlIGlmIGl0IHNob3VsZCBiZSB1c2VkIGluc3RlYWQgb2Ygd2hhdGV2ZXJcblx0ICogaXMgY3VycmVudGx5IGluIHRoZSBjYWNoZS5cblx0ICogQHBhcmFtIF9mcm9tQ2FjaGUgUHVsbCB0aGUgdmFsdWUgZnJvbSB0aGUgY2FjaGUgZW50cnkuXG5cdCAqIEBwYXJhbSBfdG9UIFRyYW5zZm9ybSB0aGUgdmFsdWUgdG8gdGhlIG9ic2VydmFibGUgdHlwZS5cblx0ICogQHBhcmFtIGRlZmF1bHRWYWx1ZSBEZWZhdWx0IHZhbHVlIGlmIG5vIGNhY2hlIGVudHJ5LlxuXHQgKi9cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVmaW5pdGlvbklkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGU6IE1jcFNlcnZlck1ldGFkYXRhQ2FjaGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZnJvbVN0YXRpY0RlZmluaXRpb246IElPYnNlcnZhYmxlPEMgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Zyb21DYWNoZTogKGVudHJ5OiBJVG9vbENhY2hlRW50cnkpID0+IEMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdG9UOiAodmFsdWVzOiBDLCByZWFkZXI6IElEZXJpdmVkUmVhZGVyPHZvaWQ+KSA9PiBULFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdFZhbHVlOiBDLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBnZXQgZnJvbUNhY2hlKCk6IHsgbm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZDsgZGF0YTogQyB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjID0gdGhpcy5fY2FjaGUuZ2V0KHRoaXMuX2RlZmluaXRpb25JZCk7XG5cdFx0cmV0dXJuIGMgPyB7IGRhdGE6IHRoaXMuX2Zyb21DYWNoZShjKSwgbm9uY2U6IGMubm9uY2UgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBoYXNTdGF0aWNEZWZpbml0aW9uKHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2Zyb21TdGF0aWNEZWZpbml0aW9uPy5yZWFkKHJlYWRlcik7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgZnJvbVNlcnZlclByb21pc2UgPSBvYnNlcnZhYmxlVmFsdWU8T2JzZXJ2YWJsZVByb21pc2U8e1xuXHRcdHJlYWRvbmx5IGRhdGE6IEM7XG5cdFx0cmVhZG9ubHkgbm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0fT4gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmcm9tU2VydmVyID0gZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5mcm9tU2VydmVyUHJvbWlzZS5yZWFkKHJlYWRlcik/LnByb21pc2VSZXN1bHQucmVhZChyZWFkZXIpPy5kYXRhKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdmFsdWU6IElPYnNlcnZhYmxlPFQ+ID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHNlcnZlclRvb2xzID0gdGhpcy5mcm9tU2VydmVyLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBkZWZpbml0aW9ucyA9IHNlcnZlclRvb2xzPy5kYXRhID8/IHRoaXMuX2Zyb21TdGF0aWNEZWZpbml0aW9uPy5yZWFkKHJlYWRlcikgPz8gdGhpcy5mcm9tQ2FjaGU/LmRhdGEgPz8gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0cmV0dXJuIHRoaXMuX3RvVChkZWZpbml0aW9ucywgcmVhZGVyKTtcblx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcFNlcnZlciB7XG5cdC8qKiBTaGFyZWQgdGFzayBtYW5hZ2VyIHRoYXQgc3Vydml2ZXMgcmVjb25uZWN0aW9ucyAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YXNrTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNY3BUYXNrTWFuYWdlcigpKTtcblxuXHQvKipcblx0ICogSGVscGVyIGZ1bmN0aW9uIHRvIGNhbGwgdGhlIGZ1bmN0aW9uIG9uIHRoZSBoYW5kbGVyIG9uY2UgaXQncyBvbmxpbmUuIFRoZVxuXHQgKiBjb25uZWN0aW9uIHN0YXJ0ZWQgaWYgaXQgaXMgbm90IGFscmVhZHkuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGFzeW5jIGNhbGxPbjxSPihzZXJ2ZXI6IElNY3BTZXJ2ZXIsIGZuOiAoaGFuZGxlcjogTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIsIGNvbm5lY3Rpb246IElNY3BTZXJ2ZXJDb25uZWN0aW9uKSA9PiBQcm9taXNlPFI+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxSPiB7XG5cdFx0YXdhaXQgc2VydmVyLnN0YXJ0KHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnIH0pOyAvLyBpZGVtcG90ZW50XG5cblx0XHRsZXQgcmFuT25jZSA9IGZhbHNlO1xuXHRcdGxldCBkOiBJRGlzcG9zYWJsZTtcblxuXHRcdGNvbnN0IGNhbGxQcm9taXNlID0gbmV3IFByb21pc2U8Uj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRkID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRpZiAocmFuT25jZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBzZXJ2ZXIuY29ubmVjdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0XHRcdC8vIE5vIGxpdmUgY29ubmVjdGlvbjogdGhlIHNlcnZlciBtYXkgYmUgYmxvY2tlZCBieSBwb2xpY3kgKGl0cyBjb25uZWN0aW9uIGlzIHRvcm5cblx0XHRcdFx0XHQvLyBkb3duIHdoaWxlIGJsb2NrZWQpIG9yIHN0b3BwZWQuIFN1cmZhY2UgdGhlIHRlcm1pbmFsIHN0YXRlIGluc3RlYWQgb2Ygd2FpdGluZyBmb3JldmVyLlxuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmVyLmNvbm5lY3Rpb25TdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKHN0YXRlLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcikge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBNY3BDb25uZWN0aW9uRmFpbGVkRXJyb3IoYE1DUCBzZXJ2ZXIgY291bGQgbm90IGJlIHN0YXJ0ZWQ6ICR7c3RhdGUubWVzc2FnZX1gKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCkge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBNY3BDb25uZWN0aW9uRmFpbGVkRXJyb3IoJ01DUCBzZXJ2ZXIgaGFzIHN0b3BwZWQnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGhhbmRsZXIgPSBjb25uZWN0aW9uLmhhbmRsZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IGNvbm5lY3Rpb24uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IpIHtcblx0XHRcdFx0XHRcdHJlamVjdChuZXcgTWNwQ29ubmVjdGlvbkZhaWxlZEVycm9yKGBNQ1Agc2VydmVyIGNvdWxkIG5vdCBiZSBzdGFydGVkOiAke3N0YXRlLm1lc3NhZ2V9YCkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQpIHtcblx0XHRcdFx0XHRcdHJlamVjdChuZXcgTWNwQ29ubmVjdGlvbkZhaWxlZEVycm9yKCdNQ1Agc2VydmVyIGhhcyBzdG9wcGVkJykpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBrZWVwIHdhaXRpbmcgZm9yIGhhbmRsZXJcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXNvbHZlKGZuKGhhbmRsZXIsIGNvbm5lY3Rpb24pKTtcblx0XHRcdFx0cmFuT25jZSA9IHRydWU7IC8vIGFnZ3Jlc3NpdmUgcHJldmVudCBtdWx0aXBsZSByYWNleSBjYWxscywgZG9uJ3QgZGlzcG9zZSBiZWNhdXNlIGF1dG9ydW4gaXMgc3luY1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmFjZUNhbmNlbGxhdGlvbkVycm9yKGNhbGxQcm9taXNlLCB0b2tlbikuZmluYWxseSgoKSA9PiBkLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvblJlZmVyZW5jZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvblNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVPYnNlcnZhYmxlVmFsdWU8SU1jcFNlcnZlckNvbm5lY3Rpb24gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCkpO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb25uZWN0aW9uID0gdGhpcy5fY29ubmVjdGlvbjtcblxuXHQvKipcblx0ICogUmVhY3RpdmVseSBldmFsdWF0ZXMgdGhlIGBjaGF0Lm1jcC5hbGxvd2VkU2VydmVyc2AgLyBgY2hhdC5tY3AuZGVuaWVkU2VydmVyc2AgcG9saWN5IGFnYWluc3Rcblx0ICogdGhpcyBzZXJ2ZXIncyBpZGVudGl0eS4gSG9sZHMgYW4gZXJyb3Igc3RhdGUgd2hpbGUgYmxvY2tlZCwgYHVuZGVmaW5lZGAgd2hpbGUgYWxsb3dlZC5cblx0ICpcblx0ICogQmVpbmcgYSBkZXJpdmVkLCBpdCByZWNvbXB1dGVzIHdoZW5ldmVyIHRoZSBwb2xpY3kgY2hhbmdlcyAodmlhIHtAbGluayBfcG9saWN5RXBvY2h9KSwgdGhlXG5cdCAqIHNlcnZlciBkZWZpbml0aW9uIGNoYW5nZXMsIG9yIGEgY29ubmVjdGlvbiByZXNvbHZlcyBcdTIwMTQgc28gaXQgYWx3YXlzIGV2YWx1YXRlcyB0aGUgKnJlc29sdmVkKlxuXHQgKiBsYXVuY2ggb2YgYSBsaXZlIGNvbm5lY3Rpb24gYW5kIGZhbGxzIGJhY2sgdG8gdGhlIGRlZmluaXRpb24gb3RoZXJ3aXNlLiBUaGlzIGFsc28gbWVhbnMgYVxuXHQgKiBibG9ja2VkIHNlcnZlciBzdXJmYWNlcyB0aGUgYmxvY2sgYXQgcmVzdCAoYmVmb3JlIGFueSBzdGFydCksIHdoaWNoIGhpZGVzIGl0cyBjYWNoZWQgdG9vbHNcblx0ICogYW5kIHByb21wdHMgYW5kIGxldHMgdGhlIFVJIHNob3cgdGhlIHJlYXNvbi5cblx0ICpcblx0ICogSW5pdGlhbGl6ZWQgaW4gdGhlIGNvbnN0cnVjdG9yIGJlY2F1c2UgaXQgZGVwZW5kcyBvbiB0aGUgaW5qZWN0ZWQgYWxsb3dlZC1zZXJ2ZXJzIHNlcnZpY2UuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wb2xpY3lFcG9jaDogSU9ic2VydmFibGU8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BvbGljeUJsb2NrOiBJT2JzZXJ2YWJsZTxNY3BDb25uZWN0aW9uU3RhdGUuRXJyb3IgfCB1bmRlZmluZWQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgY29ubmVjdGlvblN0YXRlOiBJT2JzZXJ2YWJsZTxNY3BDb25uZWN0aW9uU3RhdGU+ID0gZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5fcG9saWN5QmxvY2sucmVhZChyZWFkZXIpID8/IHRoaXMuX2Nvbm5lY3Rpb24ucmVhZChyZWFkZXIpPy5zdGF0ZS5yZWFkKHJlYWRlcikgPz8geyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9KTtcblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhcGFiaWxpdGllczogQ2FjaGVkUHJpbWl0aXZlPG51bWJlciB8IHVuZGVmaW5lZCwgbnVtYmVyIHwgdW5kZWZpbmVkPjtcblx0cHVibGljIGdldCBjYXBhYmlsaXRpZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhcGFiaWxpdGllcy52YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xzOiBDYWNoZWRQcmltaXRpdmU8cmVhZG9ubHkgSU1jcFRvb2xbXSwgcmVhZG9ubHkgVmFsaWRhdGVkTWNwVG9vbFtdPjtcblx0LyoqIENhY2hlZCB0b29scyBhcmUgc3VwcHJlc3NlZCB3aGlsZSB0aGUgc2VydmVyIGlzIGJsb2NrZWQgYnkgcG9saWN5IHNvIHRoZXkgY2Fubm90IGJlIGxpc3RlZCwgcmVmZXJlbmNlZCwgb3IgZXhlY3V0ZWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dhdGVkVG9vbHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElNY3BUb29sW10+ID0gZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5fcG9saWN5QmxvY2sucmVhZChyZWFkZXIpID8gW10gOiB0aGlzLl90b29scy52YWx1ZS5yZWFkKHJlYWRlcikpO1xuXHRwdWJsaWMgZ2V0IHRvb2xzKCkge1xuXHRcdHJldHVybiB0aGlzLl9nYXRlZFRvb2xzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbXB0czogQ2FjaGVkUHJpbWl0aXZlPHJlYWRvbmx5IElNY3BQcm9tcHRbXSwgcmVhZG9ubHkgU3RvcmVkTWNwUHJvbXB0W10+O1xuXHQvKiogQ2FjaGVkIHByb21wdHMgYXJlIHN1cHByZXNzZWQgd2hpbGUgdGhlIHNlcnZlciBpcyBibG9ja2VkIGJ5IHBvbGljeS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZ2F0ZWRQcm9tcHRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJTWNwUHJvbXB0W10+ID0gZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5fcG9saWN5QmxvY2sucmVhZChyZWFkZXIpID8gW10gOiB0aGlzLl9wcm9tcHRzLnZhbHVlLnJlYWQocmVhZGVyKSk7XG5cdHB1YmxpYyBnZXQgcHJvbXB0cygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2F0ZWRQcm9tcHRzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2VydmVyTWV0YWRhdGE6IENhY2hlZFByaW1pdGl2ZTxTZXJ2ZXJNZXRhZGF0YSwgU3RvcmVkU2VydmVyTWV0YWRhdGEgfCB1bmRlZmluZWQ+O1xuXHRwdWJsaWMgZ2V0IHNlcnZlck1ldGFkYXRhKCkge1xuXHRcdHJldHVybiB0aGlzLl9zZXJ2ZXJNZXRhZGF0YS52YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdHJ1c3RlZEF0Tm9uY2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByaW1pdGl2ZUNhY2hlLmdldCh0aGlzLmRlZmluaXRpb24uaWQpPy50cnVzdGVkQXROb25jZTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgdHJ1c3RlZEF0Tm9uY2Uobm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3ByaW1pdGl2ZUNhY2hlLnN0b3JlKHRoaXMuZGVmaW5pdGlvbi5pZCwgeyB0cnVzdGVkQXROb25jZTogbm9uY2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mdWxsRGVmaW5pdGlvbnM6IElPYnNlcnZhYmxlPHtcblx0XHRzZXJ2ZXI6IE1jcFNlcnZlckRlZmluaXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24gfCB1bmRlZmluZWQ7XG5cdH0+O1xuXG5cdHB1YmxpYyByZWFkb25seSBjYWNoZVN0YXRlID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGN1cnJlbnROb25jZSA9ICgpID0+IHRoaXMuX2Z1bGxEZWZpbml0aW9ucy5yZWFkKHJlYWRlcik/LnNlcnZlcj8uY2FjaGVOb25jZTtcblx0XHRjb25zdCBzdGF0ZVdoZW5TZXJ2aW5nRnJvbUNhY2hlID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Rvb2xzLmhhc1N0YXRpY0RlZmluaXRpb24ocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gTWNwU2VydmVyQ2FjaGVTdGF0ZS5DYWNoZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fdG9vbHMuZnJvbUNhY2hlKSB7XG5cdFx0XHRcdHJldHVybiBNY3BTZXJ2ZXJDYWNoZVN0YXRlLlVua25vd247XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjdXJyZW50Tm9uY2UoKSA9PT0gdGhpcy5fdG9vbHMuZnJvbUNhY2hlLm5vbmNlID8gTWNwU2VydmVyQ2FjaGVTdGF0ZS5DYWNoZWQgOiBNY3BTZXJ2ZXJDYWNoZVN0YXRlLk91dGRhdGVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBmcm9tU2VydmVyID0gdGhpcy5fdG9vbHMuZnJvbVNlcnZlclByb21pc2UucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25TdGF0ZSA9IHRoaXMuY29ubmVjdGlvblN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpc0lkbGUgPSBNY3BDb25uZWN0aW9uU3RhdGUuY2FuQmVTdGFydGVkKGNvbm5lY3Rpb25TdGF0ZS5zdGF0ZSkgfHwgIWZyb21TZXJ2ZXI7XG5cdFx0aWYgKGlzSWRsZSkge1xuXHRcdFx0cmV0dXJuIHN0YXRlV2hlblNlcnZpbmdGcm9tQ2FjaGUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBmcm9tU2VydmVyUmVzdWx0ID0gZnJvbVNlcnZlcj8ucHJvbWlzZVJlc3VsdC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFmcm9tU2VydmVyUmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9vbHMuZnJvbUNhY2hlID8gTWNwU2VydmVyQ2FjaGVTdGF0ZS5SZWZyZXNoaW5nRnJvbUNhY2hlZCA6IE1jcFNlcnZlckNhY2hlU3RhdGUuUmVmcmVzaGluZ0Zyb21Vbmtub3duO1xuXHRcdH1cblxuXHRcdGlmIChmcm9tU2VydmVyUmVzdWx0LmVycm9yKSB7XG5cdFx0XHRyZXR1cm4gc3RhdGVXaGVuU2VydmluZ0Zyb21DYWNoZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmcm9tU2VydmVyUmVzdWx0LmRhdGE/Lm5vbmNlID09PSBjdXJyZW50Tm9uY2UoKSA/IE1jcFNlcnZlckNhY2hlU3RhdGUuTGl2ZSA6IE1jcFNlcnZlckNhY2hlU3RhdGUuT3V0ZGF0ZWQ7XG5cdH0pO1xuXG5cdHB1YmxpYyBnZXQgbG9nZ2VyKCk6IElMb2dnZXIge1xuXHRcdHJldHVybiB0aGlzLl9sb2dnZXI7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXJJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElMb2dnZXI7XG5cdHByaXZhdGUgX2xhc3RNb2RlRGVidWdnZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNRdWlldFN0YXJ0ID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzU2FuZGJveFN1Z2dlc3Rpb25EaWFsb2dWaXNpYmxlID0gZmFsc2U7XG5cdHByaXZhdGUgX3BvdGVudGlhbFNhbmRib3hCbG9ja3M6IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSA9IFtdO1xuXHRwcml2YXRlIF9wb3RlbnRpYWxTYW5kYm94QmxvY2tMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdC8qKiBDb3VudCBvZiBydW5uaW5nIHRvb2wgY2FsbHMsIHVzZWQgdG8gZGV0ZWN0IGlmIHNhbXBsaW5nIGlzIGR1cmluZyBhbiBMTSBjYWxsICovXG5cdHB1YmxpYyBydW5uaW5nVG9vbENhbGxzID0gbmV3IFNldDxJTWNwVG9vbENhbGxDb250ZXh0PigpO1xuXG5cdHB1YmxpYyByZWFkb25seSBlbmFibGVtZW50OiBJT2JzZXJ2YWJsZTxDb250cmlidXRpb25FbmFibGVtZW50U3RhdGU+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGluaXRpYWxDb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGVmaW5pdGlvbjogTWNwRGVmaW5pdGlvblJlZmVyZW5jZSxcblx0XHRleHBsaWNpdFJvb3RzOiBVUklbXSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1aXJlc0V4dGVuc2lvbkFjdGl2YXRpb246IGJvb2xlYW4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJpbWl0aXZlQ2FjaGU6IE1jcFNlcnZlck1ldGFkYXRhQ2FjaGUsXG5cdFx0cHJlZml4R2VuZXJhdG9yOiBNY3BQcmVmaXhHZW5lcmF0b3IsXG5cdFx0ZW5hYmxlbWVudE1vZGVsOiBJRW5hYmxlbWVudE1vZGVsLFxuXHRcdEBJTWNwUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VzU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdFx0QElPdXRwdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX291dHB1dFNlcnZpY2U6IElPdXRwdXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTWNwU2FtcGxpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NhbXBsaW5nU2VydmljZTogSU1jcFNhbXBsaW5nU2VydmljZSxcblx0XHRASU1jcEVsaWNpdGF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbGljaXRhdGlvblNlcnZpY2U6IElNY3BFbGljaXRhdGlvblNlcnZpY2UsXG5cdFx0QElNY3BTYW5kYm94U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTYW5kYm94U2VydmljZTogSU1jcFNhbmRib3hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29sbGVjdGlvbiA9IGluaXRpYWxDb2xsZWN0aW9uO1xuXHRcdHRoaXMuX2Z1bGxEZWZpbml0aW9ucyA9IHRoaXMuX21jcFJlZ2lzdHJ5LmdldFNlcnZlckRlZmluaXRpb24odGhpcy5jb2xsZWN0aW9uLCB0aGlzLmRlZmluaXRpb24pO1xuXHRcdHRoaXMuZW5hYmxlbWVudCA9IGRlcml2ZWQociA9PiBlbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoZGVmaW5pdGlvbi5pZCwgcikpO1xuXG5cdFx0dGhpcy5fcG9saWN5RXBvY2ggPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuX2FsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZS5vbkRpZENoYW5nZUFsbG93ZWRNY3BTZXJ2ZXJzLCAoKSA9PiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3BvbGljeUJsb2NrID0gZGVyaXZlZDxNY3BDb25uZWN0aW9uU3RhdGUuRXJyb3IgfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9wb2xpY3lFcG9jaC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fY29ubmVjdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0XHQvLyBBdXRob3JpdGF0aXZlOiB0aGUgY29ubmVjdGlvbiBjYXJyaWVzIHRoZSBmdWxseSByZXNvbHZlZCBsYXVuY2guXG5cdFx0XHRcdHJldHVybiB0aGlzLl9ldmFsdWF0ZVBvbGljeSh0aGlzLl9pZGVudGl0eUZyb21MYXVuY2goY29ubmVjdGlvbi5sYXVuY2hEZWZpbml0aW9uKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBBdCByZXN0LCBvbmx5IGRlY2lkZSB3aGVuIHdlIGhhdmUgYSBjb25jcmV0ZSwgZnVsbHktcmVzb2x2ZWQgbGF1bmNoLiBJZiB0aGUgZGVmaW5pdGlvblxuXHRcdFx0Ly8gaGFzIG5vdCBiZWVuIHByb3ZpZGVkIHlldCAoZS5nLiBhIGxhenkvZXh0ZW5zaW9uIHNlcnZlciBiZWZvcmUgYWN0aXZhdGlvbikgb3IgdGhlIGxhdW5jaFxuXHRcdFx0Ly8gc3RpbGwgY29udGFpbnMgdW5yZXNvbHZlZCBgJHsuLi59YCB2YXJpYWJsZXMgKGlucHV0cywgd29ya3NwYWNlIG9yIGVudiB2YXJzKSwgYVxuXHRcdFx0Ly8gVVJML2NvbW1hbmQgYWxsb3cvZGVueSBydWxlIGNhbm5vdCBiZSBtYXRjaGVkIHJlbGlhYmx5LCBzbyBkZWZlciB0aGUgZGVjaXNpb24gdG8gc3RhcnQoKVxuXHRcdFx0Ly8gXHUyMDE0IHdoaWNoIHJlLWNoZWNrcyB0aGUgZnVsbHkgcmVzb2x2ZWQgbGF1bmNoIFx1MjAxNCB0byBhdm9pZCBvdmVyLWVhZ2VybHkgYmxvY2tpbmcgKGFuZCBoaWRpbmdcblx0XHRcdC8vIHRoZSBjYWNoZWQgdG9vbHMgb2YpIGEgc2VydmVyIHRoYXQgd2lsbCBhY3R1YWxseSBiZSBhbGxvd2VkIG9uY2UgcmVzb2x2ZWQuIGBjaGF0Lm1jcC5hY2Nlc3NgXG5cdFx0XHQvLyBhbmQgZGVueS1ieS1uYW1lIGFyZSBzdGlsbCBlbmZvcmNlZCBhdCBzdGFydCgpLCBhbmQgYWNjZXNzIGFsc28gYnkgdGhlIGVuYWJsZW1lbnQgbGF5ZXIuXG5cdFx0XHRjb25zdCBsYXVuY2ggPSB0aGlzLl9mdWxsRGVmaW5pdGlvbnMucmVhZChyZWFkZXIpLnNlcnZlcj8ubGF1bmNoO1xuXHRcdFx0aWYgKCFsYXVuY2gpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlkZW50aXR5ID0gdGhpcy5faWRlbnRpdHlGcm9tTGF1bmNoKGxhdW5jaCk7XG5cdFx0XHRpZiAoTWNwU2VydmVyLl9oYXNVbnJlc29sdmVkVmFyaWFibGVzKGlkZW50aXR5KSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2V2YWx1YXRlUG9saWN5KGlkZW50aXR5KTtcblx0XHR9KTtcblxuXHRcdC8vIFN0b3AgYSBsaXZlIGNvbm5lY3Rpb24gd2hlbiB0aGUgcG9saWN5IGJsb2NrcyBpdCAoZS5nLiB0aGUgcG9saWN5IHdhcyB0aWdodGVuZWQgd2hpbGUgdGhlXG5cdFx0Ly8gc2VydmVyIHdhcyBydW5uaW5nKS4gVGhlIGJsb2NrIGl0c2VsZiBpcyBldmFsdWF0ZWQgcmVhY3RpdmVseSBieSBgX3BvbGljeUJsb2NrYCwgd2hpY2ggYWxzb1xuXHRcdC8vIGhpZGVzIGNhY2hlZCB0b29scy9wcm9tcHRzIGFuZCBzdXJmYWNlcyB0aGUgcmVhc29uIGluIHRoZSBVSS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcG9saWN5QmxvY2sucmVhZChyZWFkZXIpICYmIHRoaXMuX2Nvbm5lY3Rpb24ucmVhZCh1bmRlZmluZWQpKSB7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTsgLy8gZGlzcG9zZXMgYW5kIHN0b3BzIHRoZSBjb25uZWN0aW9uXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbG9nZ2VySWQgPSBgbWNwU2VydmVyLiR7ZGVmaW5pdGlvbi5pZH1gO1xuXHRcdHRoaXMuX2xvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKF9sb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcih0aGlzLl9sb2dnZXJJZCwgeyBoaWRkZW46IHRydWUsIG5hbWU6IGBNQ1A6ICR7ZGVmaW5pdGlvbi5sYWJlbH1gIH0pKTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcERldk1vZGVTZXJ2ZXJBdHRhY2hlLCB0aGlzLCB7IGdldCBsYXN0TW9kZURlYnVnZ2VkKCkgeyByZXR1cm4gdGhhdC5fbGFzdE1vZGVEZWJ1Z2dlZDsgfSB9KSk7XG5cblx0XHQvLyBJZiB0aGUgbG9nZ2VyIGlzIGRpc3Bvc2VkIGJ1dCBub3QgZGVyZWdpc3RlcmVkLCB0aGVuIHRoZSBkaXNwb3NlZCBpbnN0YW5jZVxuXHRcdC8vIGlzIHJldXNlZCBhbmQgbm8tb3BzLiB0b2RvQHNhbmR5MDgxIHRoaXMgc2VlbXMgbGlrZSBhIGJ1Zy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gX2xvZ2dlclNlcnZpY2UuZGVyZWdpc3RlckxvZ2dlcih0aGlzLl9sb2dnZXJJZCkpKTtcblxuXHRcdC8vIDEuIFJlZmxlY3Qgd29ya3NwYWNlcyBpbnRvIHRoZSBNQ1Agcm9vdHNcblx0XHRjb25zdCB3b3Jrc3BhY2VzID0gZXhwbGljaXRSb290c1xuXHRcdFx0PyBvYnNlcnZhYmxlVmFsdWUodGhpcywgZXhwbGljaXRSb290cy5tYXAodXJpID0+ICh7IHVyaSwgbmFtZTogYmFzZW5hbWUodXJpKSB9KSkpXG5cdFx0XHQ6IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHRcdHRoaXMsXG5cdFx0XHRcdHdvcmtzcGFjZXNTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyxcblx0XHRcdFx0KCkgPT4gd29ya3NwYWNlc1NlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycyxcblx0XHRcdCk7XG5cblx0XHRjb25zdCB1cmlUcmFuc2Zvcm1lciA9IGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgPyBjcmVhdGVVUklUcmFuc2Zvcm1lcihlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSA6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNueCA9IHRoaXMuX2Nvbm5lY3Rpb24ucmVhZChyZWFkZXIpPy5oYW5kbGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghY254KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y254LnJvb3RzID0gd29ya3NwYWNlcy5yZWFkKHJlYWRlcilcblx0XHRcdFx0LmZpbHRlcih3ID0+IHcudXJpLmF1dGhvcml0eSA9PT0gKGluaXRpYWxDb2xsZWN0aW9uLnJlbW90ZUF1dGhvcml0eSB8fCAnJykpXG5cdFx0XHRcdC5tYXAodyA9PiB7XG5cdFx0XHRcdFx0bGV0IHVyaSA9IFVSSS5mcm9tKHVyaVRyYW5zZm9ybWVyPy50cmFuc2Zvcm1JbmNvbWluZyh3LnVyaSkgPz8gdy51cmkpO1xuXHRcdFx0XHRcdGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHsgLy8gIzI3MTgxMlxuXHRcdFx0XHRcdFx0dXJpID0gVVJJLmZpbGUobm9ybWFsaXplRHJpdmVMZXR0ZXIodXJpLmZzUGF0aCwgdHJ1ZSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB7IG5hbWU6IHcubmFtZSwgdXJpOiB1cmkudG9TdHJpbmcoKSB9O1xuXHRcdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHQvLyAyLiBQb3B1bGF0ZSB0aGlzLnRvb2xzIHdoZW4gd2UgY29ubmVjdCB0byBhIHNlcnZlci5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjbnggPSB0aGlzLl9jb25uZWN0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGhhbmRsZXIgPSBjbng/LmhhbmRsZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGhhbmRsZXIpIHtcblx0XHRcdFx0dGhpcy5fcG9wdWxhdGVMaXZlRGF0YShoYW5kbGVyLCBjbng/LmRlZmluaXRpb24uY2FjaGVOb25jZSwgcmVhZGVyLnN0b3JlKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fdG9vbHMpIHtcblx0XHRcdFx0dGhpcy5yZXNldExpdmVEYXRhKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY254ID0gdGhpcy5fY29ubmVjdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tMaXN0ZW5lci52YWx1ZSA9IGNueD8ub25Qb3RlbnRpYWxTYW5kYm94QmxvY2soYmxvY2sgPT4gdGhpcy5yZWNvcmRQb3RlbnRpYWxTYW5kYm94QmxvY2soYmxvY2spKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzdGF0aWNNZXRhZGF0YSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGRlZiA9IHRoaXMuX2Z1bGxEZWZpbml0aW9ucy5yZWFkKHJlYWRlcikuc2VydmVyO1xuXHRcdFx0cmV0dXJuIGRlZiAmJiBkZWYuY2FjaGVOb25jZSAhPT0gdGhpcy5fdG9vbHMuZnJvbUNhY2hlPy5ub25jZSA/IGRlZi5zdGF0aWNNZXRhZGF0YSA6IHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3NlcnZlck1ldGFkYXRhID0gbmV3IENhY2hlZFByaW1pdGl2ZTxTZXJ2ZXJNZXRhZGF0YSwgU3RvcmVkU2VydmVyTWV0YWRhdGEgfCB1bmRlZmluZWQ+KFxuXHRcdFx0dGhpcy5kZWZpbml0aW9uLmlkLFxuXHRcdFx0dGhpcy5fcHJpbWl0aXZlQ2FjaGUsXG5cdFx0XHRzdGF0aWNNZXRhZGF0YS5tYXAobSA9PiBtID8gdGhpcy5fdG9TdG9yZWRNZXRhZGF0YShtPy5zZXJ2ZXJJbmZvLCBtPy5pbnN0cnVjdGlvbnMpIDogdW5kZWZpbmVkKSxcblx0XHRcdChlbnRyeSkgPT4gKHsgc2VydmVyTmFtZTogZW50cnkuc2VydmVyTmFtZSwgc2VydmVySW5zdHJ1Y3Rpb25zOiBlbnRyeS5zZXJ2ZXJJbnN0cnVjdGlvbnMsIHNlcnZlckljb25zOiBlbnRyeS5zZXJ2ZXJJY29ucyB9KSxcblx0XHRcdChlbnRyeSkgPT4gKHsgc2VydmVyTmFtZTogZW50cnk/LnNlcnZlck5hbWUsIHNlcnZlckluc3RydWN0aW9uczogZW50cnk/LnNlcnZlckluc3RydWN0aW9ucywgaWNvbnM6IE1jcEljb25zLmZyb21TdG9yZWQoZW50cnk/LnNlcnZlckljb25zKSB9KSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0Ly8gRm9ybSB0aGUgdG9vbCBwcmVmaXggZnJvbSB0aGUgc2VydmVyLWFubm91bmNlZCBuYW1lIHdoZW4ga25vd24gc28gdGhhdFxuXHRcdC8vIHJlZ2lzdHJ5LXN0eWxlIG1jcC5qc29uIGtleXMgbGlrZSBgaW8uZ2l0aHViLnVwc3Rhc2gvY29udGV4dDdgIGRvbid0IGVuZFxuXHRcdC8vIHVwIGluIGBtY3BfaW9fZ2l0aHViX3Vwc18qYCB0cnVuY2F0ZWQgbmFtZXMuIFNlZSAjMjk5NzQ5LlxuXHRcdGNvbnN0IHByZWZlcnJlZE5hbWUgPSBkZXJpdmVkKHJlYWRlciA9PiB0aGlzLl9zZXJ2ZXJNZXRhZGF0YS52YWx1ZS5yZWFkKHJlYWRlcik/LnNlcnZlck5hbWUgfHwgdGhpcy5kZWZpbml0aW9uLmxhYmVsKTtcblx0XHRjb25zdCBwcmVmaXhSZWYgPSBkZXJpdmVkRGlzcG9zYWJsZShyZWFkZXIgPT4gcHJlZml4R2VuZXJhdG9yLnRha2UocHJlZmVycmVkTmFtZS5yZWFkKHJlYWRlcikpKTtcblx0XHRjb25zdCB0b29sUHJlZml4ID0gcHJlZml4UmVmLm1hcChyZWYgPT4gcmVmLm9iamVjdCk7XG5cblx0XHQvLyAzLiBQdWJsaXNoIHRvb2xzXG5cdFx0dGhpcy5fdG9vbHMgPSBuZXcgQ2FjaGVkUHJpbWl0aXZlPHJlYWRvbmx5IElNY3BUb29sW10sIHJlYWRvbmx5IFZhbGlkYXRlZE1jcFRvb2xbXT4oXG5cdFx0XHR0aGlzLmRlZmluaXRpb24uaWQsXG5cdFx0XHR0aGlzLl9wcmltaXRpdmVDYWNoZSxcblx0XHRcdHN0YXRpY01ldGFkYXRhXG5cdFx0XHRcdC5tYXAobSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbHMgPSBtPy50b29scz8uZmlsdGVyKHQgPT4gdC5hdmFpbGFiaWxpdHkgPT09IE1jcFNlcnZlclN0YXRpY1Rvb2xBdmFpbGFiaWxpdHkuSW5pdGlhbCkubWFwKHQgPT4gdC5kZWZpbml0aW9uKTtcblx0XHRcdFx0XHRyZXR1cm4gdG9vbHM/Lmxlbmd0aCA/IG5ldyBPYnNlcnZhYmxlUHJvbWlzZSh0aGlzLl9nZXRWYWxpZGF0ZWRUb29scyh0b29scykpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQubWFwKChvLCByZWFkZXIpID0+IG8/LnByb21pc2VSZXN1bHQucmVhZChyZWFkZXIpPy5kYXRhKSxcblx0XHRcdChlbnRyeSkgPT4gZW50cnkudG9vbHMsXG5cdFx0XHQoZW50cnksIHJlYWRlcikgPT4gZW50cnkubWFwKGRlZiA9PiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BUb29sLCB0aGlzLCB0b29sUHJlZml4LnJlYWQocmVhZGVyKSwgZGVmKSkuc29ydCgoYSwgYikgPT4gYS5jb21wYXJlKGIpKSxcblx0XHRcdFtdLFxuXHRcdCk7XG5cblx0XHQvLyA0LiBQdWJsaXNoIHByb21wdHNcblx0XHR0aGlzLl9wcm9tcHRzID0gbmV3IENhY2hlZFByaW1pdGl2ZTxyZWFkb25seSBJTWNwUHJvbXB0W10sIHJlYWRvbmx5IFN0b3JlZE1jcFByb21wdFtdPihcblx0XHRcdHRoaXMuZGVmaW5pdGlvbi5pZCxcblx0XHRcdHRoaXMuX3ByaW1pdGl2ZUNhY2hlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KGVudHJ5KSA9PiBlbnRyeS5wcm9tcHRzIHx8IFtdLFxuXHRcdFx0KGVudHJ5KSA9PiBlbnRyeS5tYXAoZSA9PiBuZXcgTWNwUHJvbXB0KHRoaXMsIGUpKSxcblx0XHRcdFtdLFxuXHRcdCk7XG5cblx0XHR0aGlzLl9jYXBhYmlsaXRpZXMgPSBuZXcgQ2FjaGVkUHJpbWl0aXZlPG51bWJlciB8IHVuZGVmaW5lZCwgbnVtYmVyIHwgdW5kZWZpbmVkPihcblx0XHRcdHRoaXMuZGVmaW5pdGlvbi5pZCxcblx0XHRcdHRoaXMuX3ByaW1pdGl2ZUNhY2hlLFxuXHRcdFx0c3RhdGljTWV0YWRhdGEubWFwKG0gPT4gbT8uY2FwYWJpbGl0aWVzICE9PSB1bmRlZmluZWQgPyBlbmNvZGVDYXBhYmlsaXRpZXMobS5jYXBhYmlsaXRpZXMpIDogdW5kZWZpbmVkKSxcblx0XHRcdChlbnRyeSkgPT4gZW50cnkuY2FwYWJpbGl0aWVzLFxuXHRcdFx0KGVudHJ5KSA9PiBlbnRyeSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0Ly8gSG9sZCB0aGUgcHJlZml4IGZvciB0aGUgbGlmZXRpbWUgb2YgdGhlIHNlcnZlciBzbyBpdHMgdG9vbCBuYW1lIHN0YXlzXG5cdFx0Ly8gc3RhYmxlIGV2ZW4gd2hlbiBubyBvbmUgaXMgY3VycmVudGx5IG9ic2VydmluZyB0aGUgdG9vbHMgbGlzdC5cblx0XHRwcmVmaXhSZWYucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXHR9XG5cblx0cHVibGljIHJlYWREZWZpbml0aW9ucygpOiBJT2JzZXJ2YWJsZTx7IHNlcnZlcjogTWNwU2VydmVyRGVmaW5pdGlvbiB8IHVuZGVmaW5lZDsgY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24gfCB1bmRlZmluZWQgfT4ge1xuXHRcdHJldHVybiB0aGlzLl9mdWxsRGVmaW5pdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgc2hvd091dHB1dChwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikge1xuXHRcdHRoaXMuX2xvZ2dlclNlcnZpY2Uuc2V0VmlzaWJpbGl0eSh0aGlzLl9sb2dnZXJJZCwgdHJ1ZSk7XG5cdFx0cmV0dXJuIHRoaXMuX291dHB1dFNlcnZpY2Uuc2hvd0NoYW5uZWwodGhpcy5fbG9nZ2VySWQsIHByZXNlcnZlRm9jdXMpO1xuXHR9XG5cblx0cHVibGljIHJlc291cmNlcyh0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogQXN5bmNJdGVyYWJsZTxJTWNwUmVzb3VyY2VbXT4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cdFx0cmV0dXJuIG5ldyBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8SU1jcFJlc291cmNlW10+KGFzeW5jIGVtaXR0ZXIgPT4ge1xuXHRcdFx0YXdhaXQgTWNwU2VydmVyLmNhbGxPbih0aGlzLCBhc3luYyAoaGFuZGxlcikgPT4ge1xuXHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHJlc291cmNlIG9mIGhhbmRsZXIubGlzdFJlc291cmNlc0l0ZXJhYmxlKHt9LCBjdHMudG9rZW4pKSB7XG5cdFx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKHJlc291cmNlLm1hcChyID0+IG5ldyBNY3BSZXNvdXJjZSh0aGlzLCByLCBNY3BJY29ucy5mcm9tUGFyc2VkKHRoaXMuX3BhcnNlSWNvbnMocikpKSkpO1xuXHRcdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0sICgpID0+IGN0cy5kaXNwb3NlKHRydWUpKTtcblx0fVxuXG5cdHB1YmxpYyByZXNvdXJjZVRlbXBsYXRlcyh0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWNwUmVzb3VyY2VUZW1wbGF0ZVtdPiB7XG5cdFx0cmV0dXJuIE1jcFNlcnZlci5jYWxsT24odGhpcywgYXN5bmMgKGhhbmRsZXIpID0+IHtcblx0XHRcdGNvbnN0IHRlbXBsYXRlcyA9IGF3YWl0IGhhbmRsZXIubGlzdFJlc291cmNlVGVtcGxhdGVzKHt9LCB0b2tlbik7XG5cdFx0XHRyZXR1cm4gdGVtcGxhdGVzLm1hcCh0ID0+IG5ldyBNY3BSZXNvdXJjZVRlbXBsYXRlKHRoaXMsIHQsIE1jcEljb25zLmZyb21QYXJzZWQodGhpcy5fcGFyc2VJY29ucyh0KSkpKTtcblx0XHR9LCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIF9pZGVudGl0eUZyb21MYXVuY2gobGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2ggfCB1bmRlZmluZWQpOiBJTWNwU2VydmVySWRlbnRpdHkge1xuXHRcdGlmIChsYXVuY2g/LnR5cGUgPT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuSFRUUCkge1xuXHRcdFx0cmV0dXJuIHsgbmFtZTogdGhpcy5kZWZpbml0aW9uLmxhYmVsLCB1cmw6IGxhdW5jaC51cmkudG9TdHJpbmcodHJ1ZSkgfTtcblx0XHR9XG5cdFx0aWYgKGxhdW5jaD8udHlwZSA9PT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbykge1xuXHRcdFx0Ly8gYGxhdW5jaC5jb21tYW5kYC9gbGF1bmNoLmFyZ3NgIGFyZSB0eXBlZCBhcyBub24tbnVsbGFibGUgYnV0IGNhbiBiZSBgdW5kZWZpbmVkYCBhdFxuXHRcdFx0Ly8gcnVudGltZSB3aGVuIHRoZXkgb3JpZ2luYXRlIGZyb20gdXNlci9kaXNjb3ZlcnkgY29uZmlndXJhdGlvbiB0aGF0IG9taXR0ZWQgdGhlIGZpZWxkLlxuXHRcdFx0Ly8gV2hlbiBgY29tbWFuZGAgaXMgcHJlc2VudCwgYnVpbGQgdGhlIGZ1bGwgY29tbWFuZCBsaW5lIChkZWZhdWx0aW5nIGBhcmdzYCB0byBhbiBlbXB0eVxuXHRcdFx0Ly8gYXJyYXkgYW5kIGRyb3BwaW5nIGFueSBub24tc3RyaW5nIGVudHJpZXMpOyB0aGUgcHJvZHVjZWQgYElNY3BTZXJ2ZXJJZGVudGl0eS5jb21tYW5kYFxuXHRcdFx0Ly8gdGhlbiBuZXZlciBjb250YWlucyBhIG5vbi1zdHJpbmcgZW50cnksIHdoaWNoIHdvdWxkIG90aGVyd2lzZSBicmVhayBwb2xpY3kgbWF0Y2hpbmcgYW5kXG5cdFx0XHQvLyB0aGUgdW5yZXNvbHZlZC12YXJpYWJsZSBjaGVjay4gVXNlIGEgc3RyaW5nIGNoZWNrIHNvIGEgdmFsaWQtYnV0LWVtcHR5IGNvbW1hbmQgc3RyaW5nIGlzXG5cdFx0XHQvLyBwcmVzZXJ2ZWQgd2hpbGUgbWFsZm9ybWVkIG5vbi1zdHJpbmcgY29tbWFuZCB2YWx1ZXMgYXJlIGRyb3BwZWQuIFdoZW4gYGNvbW1hbmRgIGlzIGFic2VudFxuXHRcdFx0Ly8gdGhlIGZ1bGwgY29tbWFuZCBsaW5lIGlzIHVua25vd24sIHNvIG9taXQgdGhlIGZpZWxkIGVudGlyZWx5IHJhdGhlciB0aGFuIG1hdGNoaW5nIG9uIGFyZ3Ncblx0XHRcdC8vIGFsb25lICh3aGljaCBjb3VsZCBjb2xsaWRlIHdpdGggdW5yZWxhdGVkIHNlcnZlcnMpLlxuXHRcdFx0cmV0dXJuIHR5cGVvZiBsYXVuY2guY29tbWFuZCA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyB7IG5hbWU6IHRoaXMuZGVmaW5pdGlvbi5sYWJlbCwgY29tbWFuZDogW2xhdW5jaC5jb21tYW5kLCAuLi4obGF1bmNoLmFyZ3MgPz8gW10pLmZpbHRlcihhcmcgPT4gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycpXSB9XG5cdFx0XHRcdDogeyBuYW1lOiB0aGlzLmRlZmluaXRpb24ubGFiZWwgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbmFtZTogdGhpcy5kZWZpbml0aW9uLmxhYmVsIH07XG5cdH1cblxuXHRwcml2YXRlIF9ldmFsdWF0ZVBvbGljeShpZGVudGl0eTogSU1jcFNlcnZlcklkZW50aXR5KTogTWNwQ29ubmVjdGlvblN0YXRlLkVycm9yIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhbGxvd2VkID0gdGhpcy5fYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLmlzU2VydmVyQWxsb3dlZChpZGVudGl0eSk7XG5cdFx0cmV0dXJuIGFsbG93ZWQgPT09IHRydWUgPyB1bmRlZmluZWQgOiB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciwgbWVzc2FnZTogYWxsb3dlZC52YWx1ZSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIFVSTC9jb21tYW5kIGZpZWxkcyBtYXRjaGVkIGJ5IHRoZSBwb2xpY3kgc3RpbGwgY29udGFpbiB1bnJlc29sdmVkIGAkey4uLn1gXG5cdCAqIGNvbmZpZ3VyYXRpb24gdmFyaWFibGVzLiBXaGVuIHRoZXkgZG8sIG1hdGNoaW5nIGFnYWluc3QgYWxsb3cvZGVueSBVUkwgb3IgY29tbWFuZCBydWxlcyBpc1xuXHQgKiB1bnJlbGlhYmxlLCBzbyB0aGUgYmxvY2sgaXMgZGVmZXJyZWQgdW50aWwgdGhlIGxhdW5jaCBpcyByZXNvbHZlZC4gVGhlIHNlcnZlciBuYW1lIGlzIHVzZWRcblx0ICogdmVyYmF0aW0gYW5kIGlzIG5vdCBjb25zaWRlcmVkIGhlcmUuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyBfaGFzVW5yZXNvbHZlZFZhcmlhYmxlcyhpZGVudGl0eTogSU1jcFNlcnZlcklkZW50aXR5KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdmFyaWFibGVNYXJrZXIgPSBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLlZBUklBQkxFX0xIUztcblx0XHRyZXR1cm4gISFpZGVudGl0eS51cmw/LmluY2x1ZGVzKHZhcmlhYmxlTWFya2VyKSB8fCAhIWlkZW50aXR5LmNvbW1hbmQ/LnNvbWUoYXJnID0+IGFyZy5pbmNsdWRlcyh2YXJpYWJsZU1hcmtlcikpO1xuXHR9XG5cblx0cHVibGljIHN0YXJ0KHsgaW50ZXJhY3Rpb24sIGF1dG9UcnVzdENoYW5nZXMsIHByb21wdFR5cGUsIGRlYnVnLCBlcnJvck9uVXNlckludGVyYWN0aW9uIH06IElNY3BTZXJ2ZXJTdGFydE9wdHMgPSB7fSk6IFByb21pc2U8TWNwQ29ubmVjdGlvblN0YXRlPiB7XG5cdFx0aW50ZXJhY3Rpb24/LnBhcnRpY2lwYW50cy5zZXQodGhpcy5kZWZpbml0aW9uLmlkLCB7IHM6ICd1bmtub3duJyB9KTtcblxuXHRcdHJldHVybiB0aGlzLl9jb25uZWN0aW9uU2VxdWVuY2VyLnF1ZXVlPE1jcENvbm5lY3Rpb25TdGF0ZT4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRXZhbHVhdGVkIGFnYWluc3QgdGhlIGRlZmluaXRpb24gaGVyZSAobm8gY29ubmVjdGlvbiB5ZXQpLiBgX3BvbGljeUJsb2NrYCByZS1ldmFsdWF0ZXNcblx0XHRcdC8vIGFnYWluc3QgdGhlIHJlc29sdmVkIGxhdW5jaCBvbmNlIHRoZSBjb25uZWN0aW9uIGV4aXN0cyAoY2hlY2tlZCBhZ2FpbiBiZWxvdykuXG5cdFx0XHRjb25zdCBwcmVTdGFydEJsb2NrID0gdGhpcy5fcG9saWN5QmxvY2suZ2V0KCk7XG5cdFx0XHRpZiAocHJlU3RhcnRCbG9jaykge1xuXHRcdFx0XHRyZXR1cm4gcHJlU3RhcnRCbG9jaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aXZhdGlvbkV2ZW50ID0gbWNwQWN0aXZhdGlvbkV2ZW50KHRoaXMuY29sbGVjdGlvbi5pZC5zbGljZShleHRlbnNpb25NY3BDb2xsZWN0aW9uUHJlZml4Lmxlbmd0aCkpO1xuXHRcdFx0aWYgKHRoaXMuX3JlcXVpcmVzRXh0ZW5zaW9uQWN0aXZhdGlvbiAmJiAhdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0aW9uRXZlbnRJc0RvbmUoYWN0aXZhdGlvbkV2ZW50KSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQpO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aGlzLl9tY3BSZWdpc3RyeS5kZWxlZ2F0ZXMuZ2V0KClcblx0XHRcdFx0XHQubWFwKHIgPT4gci53YWl0Rm9ySW5pdGlhbFByb3ZpZGVyUHJvbWlzZXMoKSkpO1xuXHRcdFx0XHQvLyBUaGlzIGNhbiBoYXBwZW4gaWYgdGhlIHNlcnZlciB3YXMgY3JlYXRlZCBmcm9tIGEgY2FjaGVkIE1DUCBzZXJ2ZXIgc2VlblxuXHRcdFx0XHQvLyBmcm9tIGFuIGV4dGVuc2lvbiwgYnV0IHRoZW4gaXQgd2Fzbid0IHJlZ2lzdGVyZWQgd2hlbiB0aGUgZXh0ZW5zaW9uIGFjdGl2YXRlZC5cblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjb25uZWN0aW9uID0gdGhpcy5fY29ubmVjdGlvbi5nZXQoKTtcblx0XHRcdHRoaXMuX2lzUXVpZXRTdGFydCA9ICEhZXJyb3JPblVzZXJJbnRlcmFjdGlvbjtcblx0XHRcdGlmIChjb25uZWN0aW9uICYmIE1jcENvbm5lY3Rpb25TdGF0ZS5jYW5CZVN0YXJ0ZWQoY29ubmVjdGlvbi5zdGF0ZS5nZXQoKS5zdGF0ZSkpIHtcblx0XHRcdFx0Y29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdGNvbm5lY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24uc2V0KGNvbm5lY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0XHR0aGlzLl9sYXN0TW9kZURlYnVnZ2VkID0gISFkZWJ1Zztcblx0XHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHRcdGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9tY3BSZWdpc3RyeS5yZXNvbHZlQ29ubmVjdGlvbih7XG5cdFx0XHRcdFx0aW50ZXJhY3Rpb24sXG5cdFx0XHRcdFx0YXV0b1RydXN0Q2hhbmdlcyxcblx0XHRcdFx0XHRwcm9tcHRUeXBlLFxuXHRcdFx0XHRcdHRydXN0Tm9uY2VCZWFyZXI6IHtcblx0XHRcdFx0XHRcdGdldCB0cnVzdGVkQXROb25jZSgpIHsgcmV0dXJuIHRoYXQudHJ1c3RlZEF0Tm9uY2U7IH0sXG5cdFx0XHRcdFx0XHRzZXQgdHJ1c3RlZEF0Tm9uY2Uobm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCkgeyB0aGF0LnRydXN0ZWRBdE5vbmNlID0gbm9uY2U7IH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGxvZ2dlcjogdGhpcy5fbG9nZ2VyLFxuXHRcdFx0XHRcdGNvbGxlY3Rpb25SZWY6IHRoaXMuY29sbGVjdGlvbixcblx0XHRcdFx0XHRkZWZpbml0aW9uUmVmOiB0aGlzLmRlZmluaXRpb24sXG5cdFx0XHRcdFx0ZGVidWcsXG5cdFx0XHRcdFx0ZXJyb3JPblVzZXJJbnRlcmFjdGlvbixcblx0XHRcdFx0XHR0YXNrTWFuYWdlcjogdGhpcy5fdGFza01hbmFnZXIsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm4geyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbi5zZXQoY29ubmVjdGlvbiwgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRpZiAoY29ubmVjdGlvbi5kZWZpbml0aW9uLmRldk1vZGUpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dPdXRwdXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZS1ldmFsdWF0ZSB0aGUgcG9saWN5IGFnYWluc3QgdGhlICpyZXNvbHZlZCogbGF1bmNoIGRlZmluaXRpb24uIEV4dGVuc2lvbiBhY3RpdmF0aW9uIGFuZFxuXHRcdFx0Ly8gdmFyaWFibGUvaW5wdXQgc3Vic3RpdHV0aW9uIGR1cmluZyByZXNvbHV0aW9uIGNhbiBjaGFuZ2UgdGhlIFVSTCBvciBjb21tYW5kLCBzbyB0aGVcblx0XHRcdC8vIGlkZW50aXR5IHRoYXQgYWN0dWFsbHkgbGF1bmNoZXMgbWF5IGRpZmZlciBmcm9tIHRoZSBvbmUgY2hlY2tlZCBiZWZvcmUgcmVzb2x1dGlvbi5cblx0XHRcdC8vIGBfcG9saWN5QmxvY2tgIG5vdyBzZWVzIHRoZSBsaXZlIGNvbm5lY3Rpb24gYW5kIHVzZXMgaXRzIHJlc29sdmVkIGxhdW5jaC5cblx0XHRcdGNvbnN0IHJlc29sdmVkQmxvY2sgPSB0aGlzLl9wb2xpY3lCbG9jay5nZXQoKTtcblx0XHRcdGlmIChyZXNvbHZlZEJsb2NrKSB7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTsgLy8gZGlzcG9zZSB0aGUganVzdC1yZXNvbHZlZCBjb25uZWN0aW9uXG5cdFx0XHRcdHJldHVybiByZXNvbHZlZEJsb2NrO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tzLmxlbmd0aCA9IDA7XG5cblx0XHRcdGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcblx0XHRcdGxldCBzdGF0ZSA9IGF3YWl0IGNvbm5lY3Rpb24uc3RhcnQoe1xuXHRcdFx0XHRjcmVhdGVNZXNzYWdlUmVxdWVzdEhhbmRsZXI6IChwYXJhbXMsIHRva2VuKSA9PiB0aGlzLl9zYW1wbGluZ1NlcnZpY2Uuc2FtcGxlKHtcblx0XHRcdFx0XHRpc0R1cmluZ1Rvb2xDYWxsOiB0aGlzLnJ1bm5pbmdUb29sQ2FsbHMuc2l6ZSA+IDAsXG5cdFx0XHRcdFx0c2VydmVyOiB0aGlzLFxuXHRcdFx0XHRcdHBhcmFtcyxcblx0XHRcdFx0fSwgdG9rZW4pLnRoZW4ociA9PiByLnNhbXBsZSksXG5cdFx0XHRcdGVsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXI6IGFzeW5jIChyZXEsIHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VydmVySW5mbyA9IGNvbm5lY3Rpb24uaGFuZGxlci5nZXQoKT8uc2VydmVySW5mbztcblx0XHRcdFx0XHRpZiAoc2VydmVySW5mbykge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEVsaWNpdGF0aW9uVGVsZW1ldHJ5RGF0YSwgRWxpY2l0YXRpb25UZWxlbWV0cnlDbGFzc2lmaWNhdGlvbj4oJ21jcC5lbGljaXRhdGlvblJlcXVlc3RlZCcsIHtcblx0XHRcdFx0XHRcdFx0c2VydmVyTmFtZTogc2VydmVySW5mby5uYW1lLFxuXHRcdFx0XHRcdFx0XHRzZXJ2ZXJWZXJzaW9uOiBzZXJ2ZXJJbmZvLnZlcnNpb24sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByID0gYXdhaXQgdGhpcy5fZWxpY2l0YXRpb25TZXJ2aWNlLmVsaWNpdCh0aGlzLCBJdGVyYWJsZS5maXJzdCh0aGlzLnJ1bm5pbmdUb29sQ2FsbHMpLCByZXEsIHRva2VuIHx8IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdHIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiByLnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFNlcnZlckJvb3RTdGF0ZSwgU2VydmVyQm9vdFN0YXRlQ2xhc3NpZmljYXRpb24+KCdtY3Avc2VydmVyQm9vdFN0YXRlJywge1xuXHRcdFx0XHRzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLnRvS2luZFN0cmluZyhzdGF0ZS5zdGF0ZSksXG5cdFx0XHRcdHRpbWU6IERhdGUubm93KCkgLSBzdGFydCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBNQ1Agc2VydmVycyB0aGF0IG5lZWQgYXV0aCBjYW4gJ3N0YXJ0JyBidXQgd2lsbCBzdG9wIHdpdGggYW4gaW50ZXJhY3Rpb24tbmVlZGVkXG5cdFx0XHQvLyBlcnJvciB0aGV5IGZpcnN0IG1ha2UgYSByZXF1ZXN0LiBJbiB0aGlzIGNhc2UsIHdhaXQgdW50aWwgdGhlIGhhbmRsZXIgZnVsbHlcblx0XHRcdC8vIGluaXRpYWxpemVzIGJlZm9yZSByZXNvbHZpbmcgKHRocm93aW5nIGlmIGl0IGVuZHMgdXAgbmVlZGluZyBhdXRoKVxuXHRcdFx0aWYgKGVycm9yT25Vc2VySW50ZXJhY3Rpb24gJiYgc3RhdGUuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcpIHtcblx0XHRcdFx0bGV0IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHRcdFx0XHRzdGF0ZSA9IGF3YWl0IG5ldyBQcm9taXNlPE1jcENvbm5lY3Rpb25TdGF0ZT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBoYW5kbGVyID0gY29ubmVjdGlvbi5oYW5kbGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdGlmIChoYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoc3RhdGUpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBzID0gY29ubmVjdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0XHRpZiAocy5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCAmJiBzLnJlYXNvbiA9PT0gJ25lZWRzLXVzZXItaW50ZXJhY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRcdHJlamVjdChuZXcgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvcignYXV0aCcpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKCFNY3BDb25uZWN0aW9uU3RhdGUuaXNSdW5uaW5nKHMpKSB7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUocyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhdGUuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yKSB7XG5cdFx0XHRcdGxldCBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0XHRcdFx0c3RhdGUgPSBhd2FpdCBuZXcgUHJvbWlzZTxNY3BDb25uZWN0aW9uU3RhdGU+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY254ID0gdGhpcy5fY29ubmVjdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IGNueD8uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0aWYgKGNueCAmJiBzdGF0ZT8uc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghdGhpcy5faXNRdWlldFN0YXJ0KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5zaG93SW50ZXJhY3RpdmVFcnJvcihjbngsIHN0YXRlLCB0aGlzLl9sYXN0TW9kZURlYnVnZ2VkKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZWplY3QobmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ3N0YXJ0JykpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpbnRlcmFjdGlvbj8ucGFydGljaXBhbnRzLnNldCh0aGlzLmRlZmluaXRpb24uaWQsIHsgczogJ3Jlc29sdmVkJyB9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0ludGVyYWN0aXZlRXJyb3IoY254OiBJTWNwU2VydmVyQ29ubmVjdGlvbiwgZXJyb3I6IE1jcENvbm5lY3Rpb25TdGF0ZS5FcnJvciwgZGVidWc/OiBib29sZWFuKSB7XG5cdFx0aWYgKGNueC5kZWZpbml0aW9uLnNhbmRib3hFbmFibGVkKSB7XG5cdFx0XHRpZiAoIXRoaXMuc2hvd1NhbmRib3hDb25maWdTdWdnZXN0aW9uRnJvbVBvdGVudGlhbEJsb2NrcyhjbngsIHRoaXMuX3BvdGVudGlhbFNhbmRib3hCbG9ja3MpKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnbWNwU2VydmVyRXJyb3InLCAnVGhlIE1DUCBzZXJ2ZXIgezB9IGNvdWxkIG5vdCBiZSBzdGFydGVkOiB7MX0nLCBjbnguZGVmaW5pdGlvbi5sYWJlbCwgZXJyb3IubWVzc2FnZSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXJyb3IuY29kZSA9PT0gJ0VOT0VOVCcgJiYgY254LmxhdW5jaERlZmluaXRpb24udHlwZSA9PT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbykge1xuXHRcdFx0bGV0IGRvY3NMaW5rOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRzd2l0Y2ggKGNueC5sYXVuY2hEZWZpbml0aW9uLmNvbW1hbmQpIHtcblx0XHRcdFx0Y2FzZSAndXZ4Jzpcblx0XHRcdFx0XHRkb2NzTGluayA9IGBodHRwczovL2FrYS5tcy92c2NvZGUtbWNwLWluc3RhbGwvdXZ4YDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbnB4Jzpcblx0XHRcdFx0XHRkb2NzTGluayA9IGBodHRwczovL2FrYS5tcy92c2NvZGUtbWNwLWluc3RhbGwvbnB4YDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnZG54Jzpcblx0XHRcdFx0XHRkb2NzTGluayA9IGBodHRwczovL2FrYS5tcy92c2NvZGUtbWNwLWluc3RhbGwvZG54YDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnZG90bmV0Jzpcblx0XHRcdFx0XHRkb2NzTGluayA9IGBodHRwczovL2FrYS5tcy92c2NvZGUtbWNwLWluc3RhbGwvZG90bmV0YDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3B0aW9uczogSVByb21wdENob2ljZVtdID0gW3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuY29tbWFuZC5zaG93T3V0cHV0JywgXCJTaG93IE91dHB1dFwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnNob3dPdXRwdXQoKSxcblx0XHRcdH1dO1xuXG5cdFx0XHRpZiAoY254LmRlZmluaXRpb24uZGV2TW9kZT8uZGVidWc/LnR5cGUgPT09ICdkZWJ1Z3B5JyAmJiBkZWJ1Zykge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgbG9jYWxpemUoJ21jcERlYnVnUHlIZWxwJywgJ1RoZSBjb21tYW5kIFwiezB9XCIgd2FzIG5vdCBmb3VuZC4gWW91IGNhbiBzcGVjaWZ5IHRoZSBwYXRoIHRvIGRlYnVncHkgaW4gdGhlIGBkZXYuZGVidWcuZGVidWdweVBhdGhgIG9wdGlvbi4nLCBjbngubGF1bmNoRGVmaW5pdGlvbi5jb21tYW5kLCBjbnguZGVmaW5pdGlvbi5sYWJlbCksIFsuLi5vcHRpb25zLCB7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3BWaWV3RG9jcycsICdWaWV3IERvY3MnKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1tY3AtaW5zdGFsbC9kZWJ1Z3B5JykpLFxuXHRcdFx0XHR9XSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRvY3NMaW5rKSB7XG5cdFx0XHRcdG9wdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3BTZXJ2ZXJJbnN0YWxsJywgJ0luc3RhbGwgezB9JywgY254LmxhdW5jaERlZmluaXRpb24uY29tbWFuZCksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKGRvY3NMaW5rKSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgbG9jYWxpemUoJ21jcFNlcnZlck5vdEZvdW5kJywgJ1RoZSBjb21tYW5kIFwiezB9XCIgbmVlZGVkIHRvIHJ1biB7MX0gd2FzIG5vdCBmb3VuZC4nLCBjbngubGF1bmNoRGVmaW5pdGlvbi5jb21tYW5kLCBjbnguZGVmaW5pdGlvbi5sYWJlbCksIG9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ21jcFNlcnZlckVycm9yJywgJ1RoZSBNQ1Agc2VydmVyIHswfSBjb3VsZCBub3QgYmUgc3RhcnRlZDogezF9JywgY254LmRlZmluaXRpb24ubGFiZWwsIGVycm9yLm1lc3NhZ2UpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2hvd1NhbmRib3hDb25maWdTdWdnZXN0aW9uRnJvbVBvdGVudGlhbEJsb2Nrcyhjbng6IElNY3BTZXJ2ZXJDb25uZWN0aW9uLCBwb3RlbnRpYWxCbG9ja3M6IHJlYWRvbmx5IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSk6IGJvb2xlYW4ge1xuXHRcdGlmICghY254LmRlZmluaXRpb24uc2FuZGJveEVuYWJsZWQgfHwgIXBvdGVudGlhbEJsb2Nrcy5sZW5ndGggfHwgdGhpcy5faXNTYW5kYm94U3VnZ2VzdGlvbkRpYWxvZ1Zpc2libGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzUXVpZXRTdGFydCkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ3NhbmRib3gtc3VnZ2VzdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nU2FuZGJveENvbmZpZyA9IHRoaXMuX2Z1bGxEZWZpbml0aW9ucy5nZXQoKS5jb2xsZWN0aW9uPy5zYW5kYm94O1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb24gPSB0aGlzLl9tY3BTYW5kYm94U2VydmljZS5nZXRTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbk1lc3NhZ2UoY254LmRlZmluaXRpb24ubGFiZWwsIHBvdGVudGlhbEJsb2NrcywgZXhpc3RpbmdTYW5kYm94Q29uZmlnKTtcblx0XHRpZiAoIXN1Z2dlc3Rpb24pIHtcblx0XHRcdC8vIGNsZWFyIHBvdGVudGlhbCBibG9ja3MgYXMgdGhlcmUgYXJlIG5vIHN1Z2dlc3Rpb25zIGZvciB0aGVtLlxuXHRcdFx0dGhpcy5fcmVtb3ZlUG90ZW50aWFsU2FuZGJveEJsb2Nrcyhwb3RlbnRpYWxCbG9ja3MpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbmZpcm1BbmRBcHBseVNhbmRib3hDb25maWdTdWdnZXN0aW9uKGNueCwgcG90ZW50aWFsQmxvY2tzLCBzdWdnZXN0aW9uKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbmZpcm1BbmRBcHBseVNhbmRib3hDb25maWdTdWdnZXN0aW9uKGNueDogSU1jcFNlcnZlckNvbm5lY3Rpb24sIHBvdGVudGlhbEJsb2NrczogcmVhZG9ubHkgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9ja1tdLCBzdWdnZXN0aW9uOiBOb25OdWxsYWJsZTxSZXR1cm5UeXBlPElNY3BTYW5kYm94U2VydmljZVsnZ2V0U2FuZGJveENvbmZpZ1N1Z2dlc3Rpb25NZXNzYWdlJ10+Pik6IHZvaWQge1xuXHRcdGNvbnN0IG1jcFJlc291cmNlID0gY254LmRlZmluaXRpb24ucHJlc2VudGF0aW9uPy5vcmlnaW4/LnVyaSA/PyB0aGlzLmNvbGxlY3Rpb24ucHJlc2VudGF0aW9uPy5vcmlnaW47XG5cdFx0Y29uc3QgY29uZmlnVGFyZ2V0ID0gdGhpcy5fZnVsbERlZmluaXRpb25zLmdldCgpLmNvbGxlY3Rpb24/LmNvbmZpZ1RhcmdldDtcblx0XHR0aGlzLl9pc1NhbmRib3hTdWdnZXN0aW9uRGlhbG9nVmlzaWJsZSA9IHRydWU7XG5cblx0XHR2b2lkIHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwU2FuZGJveFN1Z2dlc3Rpb24uY29uZmlybS5tZXNzYWdlJywgXCJVcGRhdGUgc2FuZGJveCBjb25maWd1cmF0aW9uIGluIG1jcC5qc29uIGZvciB7MH0/XCIsIGNueC5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdGRldGFpbDogc3VnZ2VzdGlvbi5tZXNzYWdlLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ21jcFNhbmRib3hTdWdnZXN0aW9uLmNvbmZpcm0ueWVzJywgXCJZZXNcIiksXG5cdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdtY3BTYW5kYm94U3VnZ2VzdGlvbi5jb25maXJtLm5vJywgXCJOb1wiKSxcblx0XHR9KS50aGVuKGFzeW5jIHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIW1jcFJlc291cmNlIHx8IGNvbmZpZ1RhcmdldCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnbWNwU2FuZGJveFN1Z2dlc3Rpb24uYXBwbHkudW5hdmFpbGFibGUnLCBcIkNvdWxkbid0IGRldGVybWluZSB3aGVyZSB0byB1cGRhdGUgc2FuZGJveCBjb25maWd1cmF0aW9uIGZvciB7MH0uXCIsIGNueC5kZWZpbml0aW9uLmxhYmVsKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXBkYXRlZCA9IGF3YWl0IHRoaXMuX21jcFNhbmRib3hTZXJ2aWNlLmFwcGx5U2FuZGJveENvbmZpZ1N1Z2dlc3Rpb24oY254LmRlZmluaXRpb24sIG1jcFJlc291cmNlLCBjb25maWdUYXJnZXQsIHBvdGVudGlhbEJsb2Nrcywgc3VnZ2VzdGlvbi5zYW5kYm94Q29uZmlnKTtcblx0XHRcdFx0aWYgKHVwZGF0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW1vdmVQb3RlbnRpYWxTYW5kYm94QmxvY2tzKHBvdGVudGlhbEJsb2Nrcyk7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCdtY3BTYW5kYm94U3VnZ2VzdGlvbi5hcHBseS5zdWNjZXNzJywgXCJVcGRhdGVkIHNhbmRib3ggY29uZmlndXJhdGlvbiBmb3IgezB9IGluIG1jcC5qc29uLiBSZXN0YXJ0IHNlcnZlci5cIiwgY254LmRlZmluaXRpb24ubGFiZWwpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdtY3BTYW5kYm94U3VnZ2VzdGlvbi5hcHBseS5lcnJvcicsIFwiRmFpbGVkIHRvIHVwZGF0ZSBzYW5kYm94IGNvbmZpZ3VyYXRpb24gZm9yIHswfTogezF9XCIsIGNueC5kZWZpbml0aW9uLmxhYmVsLCBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSkpKTtcblx0XHRcdH1cblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMuX2lzU2FuZGJveFN1Z2dlc3Rpb25EaWFsb2dWaXNpYmxlID0gZmFsc2U7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcmVjb3JkUG90ZW50aWFsU2FuZGJveEJsb2NrKGJsb2NrOiBJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrKTogdm9pZCB7XG5cdFx0dGhpcy5fcG90ZW50aWFsU2FuZGJveEJsb2Nrcy5wdXNoKGJsb2NrKTtcblx0XHRpZiAodGhpcy5fcG90ZW50aWFsU2FuZGJveEJsb2Nrcy5sZW5ndGggPiAyMDApIHtcblx0XHRcdHRoaXMuX3BvdGVudGlhbFNhbmRib3hCbG9ja3Muc3BsaWNlKDAsIHRoaXMuX3BvdGVudGlhbFNhbmRib3hCbG9ja3MubGVuZ3RoIC0gMjAwKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fY29ubmVjdGlvbi5nZXQoKTtcblx0XHRpZiAoY29ubmVjdGlvbj8uc3RhdGUuZ2V0KCkuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcpIHtcblx0XHRcdHRoaXMuc2hvd1NhbmRib3hDb25maWdTdWdnZXN0aW9uRnJvbVBvdGVudGlhbEJsb2Nrcyhjb25uZWN0aW9uLCB0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVQb3RlbnRpYWxTYW5kYm94QmxvY2tzKGJsb2NrczogcmVhZG9ubHkgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9ja1tdKTogdm9pZCB7XG5cdFx0aWYgKCFibG9ja3MubGVuZ3RoIHx8ICF0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvUmVtb3ZlID0gbmV3IFNldChibG9ja3MpO1xuXHRcdHRoaXMuX3BvdGVudGlhbFNhbmRib3hCbG9ja3MgPSB0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tzLmZpbHRlcihibG9jayA9PiAhdG9SZW1vdmUuaGFzKGJsb2NrKSk7XG5cdH1cblxuXHRwdWJsaWMgc3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29ubmVjdGlvbi5nZXQoKT8uc3RvcCgpIHx8IFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0LyoqIFdhaXRzIGZvciBhbnkgb25nb2luZyB0b29scyB0byBiZSByZWZyZXNoZWQgYmVmb3JlIHJlc29sdmluZy4gKi9cblx0cHVibGljIGF3YWl0VG9vbFJlZnJlc2goKSB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0YXV0b3J1blNlbGZEaXNwb3NhYmxlKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLl90b29scy5mcm9tU2VydmVyUHJvbWlzZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHByb21pc2U/LnByb21pc2VSZXN1bHQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXRMaXZlRGF0YSgpIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl90b29scy5mcm9tU2VydmVyUHJvbWlzZS5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0XHR0aGlzLl9wcm9tcHRzLmZyb21TZXJ2ZXJQcm9taXNlLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX25vcm1hbGl6ZVRvb2wob3JpZ2luYWxUb29sOiBNQ1AuVG9vbCk6IFByb21pc2U8VmFsaWRhdGVkTWNwVG9vbCB8IHsgZXJyb3I6IHN0cmluZ1tdIH0+IHtcblx0XHQvLyBQYXJzZSBNQ1AgQXBwcyBVSSBtZXRhZGF0YSBmcm9tIF9tZXRhLnVpXG5cdFx0Y29uc3QgdWlNZXRhID0gb3JpZ2luYWxUb29sLl9tZXRhPy51aSBhcyBNY3BBcHBzLk1jcFVpVG9vbE1ldGEgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBDb21wdXRlIHZpc2liaWxpdHkgZnJvbSBfbWV0YS51aS52aXNpYmlsaXR5LCBkZWZhdWx0aW5nIHRvIE1vZGVsIHwgQXBwXG5cdFx0bGV0IHZpc2liaWxpdHk6IE1jcFRvb2xWaXNpYmlsaXR5ID0gTWNwVG9vbFZpc2liaWxpdHkuTW9kZWwgfCBNY3BUb29sVmlzaWJpbGl0eS5BcHA7XG5cdFx0aWYgKHVpTWV0YT8udmlzaWJpbGl0eSAmJiBBcnJheS5pc0FycmF5KHVpTWV0YS52aXNpYmlsaXR5KSkge1xuXHRcdFx0dmlzaWJpbGl0eSAmPSAwO1xuXG5cdFx0XHRpZiAodWlNZXRhLnZpc2liaWxpdHkuaW5jbHVkZXMoJ21vZGVsJykpIHtcblx0XHRcdFx0dmlzaWJpbGl0eSB8PSBNY3BUb29sVmlzaWJpbGl0eS5Nb2RlbDtcblx0XHRcdH1cblx0XHRcdGlmICh1aU1ldGEudmlzaWJpbGl0eS5pbmNsdWRlcygnYXBwJykpIHtcblx0XHRcdFx0dmlzaWJpbGl0eSB8PSBNY3BUb29sVmlzaWJpbGl0eS5BcHA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9vbDogVmFsaWRhdGVkTWNwVG9vbCA9IHtcblx0XHRcdC4uLm9yaWdpbmFsVG9vbCxcblx0XHRcdHNlcnZlclRvb2xOYW1lOiBvcmlnaW5hbFRvb2wubmFtZSxcblx0XHRcdF9pY29uczogdGhpcy5fcGFyc2VJY29ucyhvcmlnaW5hbFRvb2wpLFxuXHRcdFx0dmlzaWJpbGl0eSxcblx0XHRcdHVpUmVzb3VyY2VVcmk6IHVpTWV0YT8ucmVzb3VyY2VVcmksXG5cdFx0fTtcblx0XHRpZiAoIXRvb2wuZGVzY3JpcHRpb24pIHtcblx0XHRcdC8vIEVuc3VyZSBhIGRlc2NyaXB0aW9uIGlzIHByb3ZpZGVkIGZvciBlYWNoIHRvb2wsICMyNDM5MTlcblx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBUb29sICR7dG9vbC5uYW1lfSBkb2VzIG5vdCBoYXZlIGEgZGVzY3JpcHRpb24uIFRvb2xzIG11c3QgYmUgYWNjdXJhdGVseSBkZXNjcmliZWQgdG8gYmUgY2FsbGVkYCk7XG5cdFx0XHR0b29sLmRlc2NyaXB0aW9uID0gJzxlbXB0eT4nO1xuXHRcdH1cblxuXHRcdGlmICh0b29sSW52YWxpZENoYXJSZS50ZXN0KHRvb2wubmFtZSkpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBUb29sICR7SlNPTi5zdHJpbmdpZnkodG9vbC5uYW1lKX0gaXMgaW52YWxpZC4gVG9vbHMgbmFtZXMgbWF5IG9ubHkgY29udGFpbiBbYS16MC05Xy1dYCk7XG5cdFx0XHR0b29sLm5hbWUgPSB0b29sLm5hbWUucmVwbGFjZSh0b29sSW52YWxpZENoYXJSZSwgJ18nKTtcblx0XHR9XG5cblx0XHQvLyBQZXIgTUNQIHNwZWMsIHByb3BlcnRpZXMgaXMgb3B0aW9uYWwuIEJ1dCBKU09OIFNjaGVtYSBEcmFmdCA3IHJlcXVpcmVzXG5cdFx0Ly8gaXQgZm9yIG9iamVjdCB0eXBlcy4gTm9ybWFsaXplIHRoZSBzY2hlbWEgdG8gaW5jbHVkZSBhbiBlbXB0eSBwcm9wZXJ0aWVzXG5cdFx0Ly8gb2JqZWN0IGlmIG5vdCBwcmVzZW50LiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjUxNzIzXG5cdFx0aWYgKHRvb2wuaW5wdXRTY2hlbWEgJiYgIXRvb2wuaW5wdXRTY2hlbWEucHJvcGVydGllcykge1xuXHRcdFx0dG9vbC5pbnB1dFNjaGVtYSA9IHsgLi4udG9vbC5pbnB1dFNjaGVtYSwgcHJvcGVydGllczoge30gfTtcblx0XHR9XG5cblx0XHR0eXBlIEpzb25EaWFnbm9zdGljID0geyBtZXNzYWdlOiBzdHJpbmc7IHJhbmdlOiB7IGxpbmU6IG51bWJlcjsgY2hhcmFjdGVyOiBudW1iZXIgfVtdIH07XG5cblx0XHRsZXQgZGlhZ25vc3RpY3M6IEpzb25EaWFnbm9zdGljW10gPSBbXTtcblx0XHRjb25zdCB0b29sSnNvbiA9IEpTT04uc3RyaW5naWZ5KHRvb2wuaW5wdXRTY2hlbWEpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzY2hlbWFVcmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA3L3NjaGVtYScpO1xuXHRcdFx0ZGlhZ25vc3RpY3MgPSBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxKc29uRGlhZ25vc3RpY1tdPignanNvbi52YWxpZGF0ZScsIHNjaGVtYVVyaSwgdG9vbEpzb24pIHx8IFtdO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGlnbm9yZWQgKGVycm9yIGluIGpzb24gZXh0ZW5zaW9uPyk7XG5cdFx0fVxuXG5cdFx0aWYgKCFkaWFnbm9zdGljcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0b29sO1xuXHRcdH1cblxuXHRcdC8vIGJlY2F1c2UgaXQncyBhbGwgb25lIGxpbmUgZnJvbSBKU09OLnN0cmluZ2lmeSwgd2UgY2FuIHRyZWF0IGNoYXJhY3RlcnMgYXMgb2Zmc2V0cy5cblx0XHRjb25zdCB0cmVlID0ganNvbi5wYXJzZVRyZWUodG9vbEpzb24pO1xuXHRcdGNvbnN0IG1lc3NhZ2VzID0gZGlhZ25vc3RpY3MubWFwKGQgPT4ge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IGpzb24uZmluZE5vZGVBdE9mZnNldCh0cmVlLCBkLnJhbmdlWzBdLmNoYXJhY3Rlcik7XG5cdFx0XHRjb25zdCBwYXRoID0gbm9kZSAmJiBgLyR7anNvbi5nZXROb2RlUGF0aChub2RlKS5qb2luKCcvJyl9YDtcblx0XHRcdHJldHVybiBkLm1lc3NhZ2UgKyAocGF0aCA/IGAgKGF0ICR7cGF0aH0pYCA6ICcnKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB7IGVycm9yOiBtZXNzYWdlcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0VmFsaWRhdGVkVG9vbHModG9vbHM6IE1DUC5Ub29sW10pOiBQcm9taXNlPFZhbGlkYXRlZE1jcFRvb2xbXT4ge1xuXHRcdGxldCBlcnJvciA9ICcnO1xuXG5cdFx0Y29uc3QgdmFsaWRhdGlvbnMgPSBhd2FpdCBQcm9taXNlLmFsbCh0b29scy5tYXAodCA9PiB0aGlzLl9ub3JtYWxpemVUb29sKHQpKSk7XG5cdFx0Y29uc3QgdmFsaWRhdGVkOiBWYWxpZGF0ZWRNY3BUb29sW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtpLCByZXN1bHRdIG9mIHZhbGlkYXRpb25zLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKCdlcnJvcicgaW4gcmVzdWx0KSB7XG5cdFx0XHRcdGVycm9yICs9IGxvY2FsaXplKCdtY3BCYWRTY2hlbWEudG9vbCcsICdUb29sIGB7MH1gIGhhcyBpbnZhbGlkIEpTT04gcGFyYW1ldGVyczonLCB0b29sc1tpXS5uYW1lKSArICdcXG4nO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgcmVzdWx0LmVycm9yKSB7XG5cdFx0XHRcdFx0ZXJyb3IgKz0gYFxcdC0gJHttZXNzYWdlfVxcbmA7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXJyb3IgKz0gYFxcdC0gU2NoZW1hOiAke0pTT04uc3RyaW5naWZ5KHRvb2xzW2ldLmlucHV0U2NoZW1hKX1cXG5cXG5gO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFsaWRhdGVkLnB1c2gocmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGAke3Rvb2xzLmxlbmd0aCAtIHZhbGlkYXRlZC5sZW5ndGh9IHRvb2xzIGhhdmUgaW52YWxpZCBKU09OIHNjaGVtYXMgYW5kIHdpbGwgYmUgb21pdHRlZGApO1xuXHRcdFx0d2FybkludmFsaWRUb29scyh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5kZWZpbml0aW9uLmxhYmVsLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZhbGlkYXRlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBQYXJzZXMgaW5jb21pbmcgTUNQIGljb25zIGFuZCByZXR1cm5zIHRoZSByZXN1bHRpbmcgJ3N0b3JlZCcgcmVjb3JkLiBOb3RlXG5cdCAqIHRoYXQgdGhpcyByZXF1aXJlcyBhbiBhY3RpdmUgTUNQIHNlcnZlciBjb25uZWN0aW9uIHNpbmNlIHdlIHZhbGlkYXRlXG5cdCAqIGFnYWluc3Qgc29tZSBvZiB0aGF0IGNvbm5lY3Rpb24ncyBkYXRhLiBUaGUgaWNvbnMgbWF5IGhvd2V2ZXIgYmUgc3RvcmVkXG5cdCAqIGFuZCByZWh5ZHJhdGVkIGxhdGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGFyc2VJY29ucyhpY29uczogTUNQLkljb25zKSB7XG5cdFx0Y29uc3QgY254ID0gdGhpcy5fY29ubmVjdGlvbi5nZXQoKTtcblx0XHRpZiAoIWNueCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXJzZUFuZFZhbGlkYXRlTWNwSWNvbihpY29ucywgY254LmxhdW5jaERlZmluaXRpb24sIHRoaXMuX2xvZ2dlcik7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTZXJ2ZXJUb29scyhub25jZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b29sc1Byb21pc2U6IFByb21pc2U8TUNQLlRvb2xbXT4sIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCB0b29sUHJvbWlzZVNhZmUgPSB0b29sc1Byb21pc2UudGhlbihhc3luYyB0b29scyA9PiB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgRGlzY292ZXJlZCAke3Rvb2xzLmxlbmd0aH0gdG9vbHNgKTtcblx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLl9nZXRWYWxpZGF0ZWRUb29scyh0b29scyk7XG5cdFx0XHR0aGlzLl9wcmltaXRpdmVDYWNoZS5zdG9yZSh0aGlzLmRlZmluaXRpb24uaWQsIHsgdG9vbHM6IGRhdGEsIG5vbmNlIH0pO1xuXHRcdFx0cmV0dXJuIHsgZGF0YSwgbm9uY2UgfTtcblx0XHR9KTtcblx0XHR0aGlzLl90b29scy5mcm9tU2VydmVyUHJvbWlzZS5zZXQobmV3IE9ic2VydmFibGVQcm9taXNlKHRvb2xQcm9taXNlU2FmZSksIHR4KTtcblx0XHRyZXR1cm4gdG9vbFByb21pc2VTYWZlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U2VydmVyUHJvbXB0cyhub25jZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBwcm9tcHRzUHJvbWlzZTogUHJvbWlzZTxNQ1AuUHJvbXB0W10+LCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgcHJvbXB0c1Byb21pc2VTYWZlID0gcHJvbXB0c1Byb21pc2UudGhlbigocmVzdWx0KTogeyBkYXRhOiBTdG9yZWRNY3BQcm9tcHRbXTsgbm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCB9ID0+IHtcblx0XHRcdGNvbnN0IGRhdGE6IFN0b3JlZE1jcFByb21wdFtdID0gcmVzdWx0Lm1hcChwcm9tcHQgPT4gKHtcblx0XHRcdFx0Li4ucHJvbXB0LFxuXHRcdFx0XHRfaWNvbnM6IHRoaXMuX3BhcnNlSWNvbnMocHJvbXB0KVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcHJpbWl0aXZlQ2FjaGUuc3RvcmUodGhpcy5kZWZpbml0aW9uLmlkLCB7IHByb21wdHM6IGRhdGEsIG5vbmNlIH0pO1xuXHRcdFx0cmV0dXJuIHsgZGF0YSwgbm9uY2UgfTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3Byb21wdHMuZnJvbVNlcnZlclByb21pc2Uuc2V0KG5ldyBPYnNlcnZhYmxlUHJvbWlzZShwcm9tcHRzUHJvbWlzZVNhZmUpLCB0eCk7XG5cdFx0cmV0dXJuIHByb21wdHNQcm9taXNlU2FmZTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU3RvcmVkTWV0YWRhdGEoc2VydmVySW5mbz86IE1DUC5JbXBsZW1lbnRhdGlvbiwgaW5zdHJ1Y3Rpb25zPzogc3RyaW5nKTogU3RvcmVkU2VydmVyTWV0YWRhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXJ2ZXJOYW1lOiBzZXJ2ZXJJbmZvID8gc2VydmVySW5mby50aXRsZSB8fCBzZXJ2ZXJJbmZvLm5hbWUgOiB1bmRlZmluZWQsXG5cdFx0XHRzZXJ2ZXJJbnN0cnVjdGlvbnM6IGluc3RydWN0aW9ucyxcblx0XHRcdHNlcnZlckljb25zOiBzZXJ2ZXJJbmZvID8gdGhpcy5fcGFyc2VJY29ucyhzZXJ2ZXJJbmZvKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U2VydmVyTWV0YWRhdGEoXG5cdFx0bm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHR7IHNlcnZlckluZm8sIGluc3RydWN0aW9ucywgY2FwYWJpbGl0aWVzIH06IHsgc2VydmVySW5mbzogTUNQLkltcGxlbWVudGF0aW9uOyBpbnN0cnVjdGlvbnM6IHN0cmluZyB8IHVuZGVmaW5lZDsgY2FwYWJpbGl0aWVzOiBNQ1AuU2VydmVyQ2FwYWJpbGl0aWVzIH0sXG5cdFx0dHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IFN0b3JlZFNlcnZlck1ldGFkYXRhID0gdGhpcy5fdG9TdG9yZWRNZXRhZGF0YShzZXJ2ZXJJbmZvLCBpbnN0cnVjdGlvbnMpO1xuXHRcdHRoaXMuX3NlcnZlck1ldGFkYXRhLmZyb21TZXJ2ZXJQcm9taXNlLnNldChPYnNlcnZhYmxlUHJvbWlzZS5yZXNvbHZlZCh7IG5vbmNlLCBkYXRhOiBzZXJ2ZXJNZXRhZGF0YSB9KSwgdHgpO1xuXG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzRW5jb2RlZCA9IGVuY29kZUNhcGFiaWxpdGllcyhjYXBhYmlsaXRpZXMpO1xuXHRcdHRoaXMuX2NhcGFiaWxpdGllcy5mcm9tU2VydmVyUHJvbWlzZS5zZXQoT2JzZXJ2YWJsZVByb21pc2UucmVzb2x2ZWQoeyBkYXRhOiBjYXBhYmlsaXRpZXNFbmNvZGVkLCBub25jZSB9KSwgdHgpO1xuXHRcdHRoaXMuX3ByaW1pdGl2ZUNhY2hlLnN0b3JlKHRoaXMuZGVmaW5pdGlvbi5pZCwgeyAuLi5zZXJ2ZXJNZXRhZGF0YSwgbm9uY2UsIGNhcGFiaWxpdGllczogY2FwYWJpbGl0aWVzRW5jb2RlZCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3BvcHVsYXRlTGl2ZURhdGEoaGFuZGxlcjogTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIsIGNhY2hlTm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSkge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVRvb2xzID0gKHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xQcm9taXNlID0gaGFuZGxlci5jYXBhYmlsaXRpZXMudG9vbHMgPyBoYW5kbGVyLmxpc3RUb29scyh7fSwgY3RzLnRva2VuKSA6IFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2V0U2VydmVyVG9vbHMoY2FjaGVOb25jZSwgdG9vbFByb21pc2UsIHR4KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlUHJvbXB0cyA9ICh0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9tcHRzUHJvbWlzZSA9IGhhbmRsZXIuY2FwYWJpbGl0aWVzLnByb21wdHMgPyBoYW5kbGVyLmxpc3RQcm9tcHRzKHt9LCBjdHMudG9rZW4pIDogUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdHJldHVybiB0aGlzLl9zZXRTZXJ2ZXJQcm9tcHRzKGNhY2hlTm9uY2UsIHByb21wdHNQcm9taXNlLCB0eCk7XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChoYW5kbGVyLm9uRGlkQ2hhbmdlVG9vbExpc3QoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oJ1Rvb2wgbGlzdCBjaGFuZ2VkLCByZWZyZXNoaW5nIHRvb2xzLi4uJyk7XG5cdFx0XHR1cGRhdGVUb29scyh1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChoYW5kbGVyLm9uRGlkQ2hhbmdlUHJvbXB0TGlzdCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbygnUHJvbXB0cyBsaXN0IGNoYW5nZWQsIHJlZnJlc2hpbmcgcHJvbXB0cy4uLicpO1xuXHRcdFx0dXBkYXRlUHJvbXB0cyh1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3NldFNlcnZlck1ldGFkYXRhKGNhY2hlTm9uY2UsIHsgc2VydmVySW5mbzogaGFuZGxlci5zZXJ2ZXJJbmZvLCBpbnN0cnVjdGlvbnM6IGhhbmRsZXIuc2VydmVySW5zdHJ1Y3Rpb25zLCBjYXBhYmlsaXRpZXM6IGhhbmRsZXIuY2FwYWJpbGl0aWVzIH0sIHR4KTtcblx0XHRcdHVwZGF0ZVByb21wdHModHgpO1xuXHRcdFx0Y29uc3QgdG9vbFVwZGF0ZSA9IHVwZGF0ZVRvb2xzKHR4KTtcblxuXHRcdFx0dG9vbFVwZGF0ZS50aGVuKHRvb2xzID0+IHtcblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFNlcnZlckJvb3REYXRhLCBTZXJ2ZXJCb290Q2xhc3NpZmljYXRpb24+KCdtY3Avc2VydmVyQm9vdCcsIHtcblx0XHRcdFx0XHRzdXBwb3J0c0xvZ2dpbmc6ICEhaGFuZGxlci5jYXBhYmlsaXRpZXMubG9nZ2luZyxcblx0XHRcdFx0XHRzdXBwb3J0c1Byb21wdHM6ICEhaGFuZGxlci5jYXBhYmlsaXRpZXMucHJvbXB0cyxcblx0XHRcdFx0XHRzdXBwb3J0c1Jlc291cmNlczogISFoYW5kbGVyLmNhcGFiaWxpdGllcy5yZXNvdXJjZXMsXG5cdFx0XHRcdFx0dG9vbENvdW50OiB0b29scy5kYXRhLmxlbmd0aCxcblx0XHRcdFx0XHRzZXJ2ZXJOYW1lOiBoYW5kbGVyLnNlcnZlckluZm8ubmFtZSxcblx0XHRcdFx0XHRzZXJ2ZXJWZXJzaW9uOiBoYW5kbGVyLnNlcnZlckluZm8udmVyc2lvbixcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBNY3BQcm9tcHQgaW1wbGVtZW50cyBJTWNwUHJvbXB0IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFyZ3VtZW50czogcmVhZG9ubHkgTUNQLlByb21wdEFyZ3VtZW50W107XG5cdHJlYWRvbmx5IGljb25zOiBJTWNwSWNvbnM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2VydmVyOiBNY3BTZXJ2ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVmaW5pdGlvbjogU3RvcmVkTWNwUHJvbXB0LFxuXHQpIHtcblx0XHR0aGlzLmlkID0gbWNwUHJvbXB0UmVwbGFjZVNwZWNpYWxDaGFycyh0aGlzLl9zZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCArICcuJyArIF9kZWZpbml0aW9uLm5hbWUpO1xuXHRcdHRoaXMubmFtZSA9IF9kZWZpbml0aW9uLm5hbWU7XG5cdFx0dGhpcy50aXRsZSA9IF9kZWZpbml0aW9uLnRpdGxlO1xuXHRcdHRoaXMuZGVzY3JpcHRpb24gPSBfZGVmaW5pdGlvbi5kZXNjcmlwdGlvbjtcblx0XHR0aGlzLmFyZ3VtZW50cyA9IF9kZWZpbml0aW9uLmFyZ3VtZW50cyB8fCBbXTtcblx0XHR0aGlzLmljb25zID0gTWNwSWNvbnMuZnJvbVN0b3JlZCh0aGlzLl9kZWZpbml0aW9uLl9pY29ucyk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlKGFyZ3M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNY3BQcm9tcHRNZXNzYWdlW10+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBNY3BTZXJ2ZXIuY2FsbE9uKHRoaXMuX3NlcnZlciwgaCA9PiBoLmdldFByb21wdCh7IG5hbWU6IHRoaXMuX2RlZmluaXRpb24ubmFtZSwgYXJndW1lbnRzOiBhcmdzIH0sIHRva2VuKSwgdG9rZW4pO1xuXHRcdHJldHVybiByZXN1bHQubWVzc2FnZXM7XG5cdH1cblxuXHRhc3luYyBjb21wbGV0ZShhcmd1bWVudDogc3RyaW5nLCBwcmVmaXg6IHN0cmluZywgYWxyZWFkeVJlc29sdmVkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IE1jcFNlcnZlci5jYWxsT24odGhpcy5fc2VydmVyLCBoID0+IGguY29tcGxldGUoe1xuXHRcdFx0cmVmOiB7IHR5cGU6ICdyZWYvcHJvbXB0JywgbmFtZTogdGhpcy5fZGVmaW5pdGlvbi5uYW1lIH0sXG5cdFx0XHRhcmd1bWVudDogeyBuYW1lOiBhcmd1bWVudCwgdmFsdWU6IHByZWZpeCB9LFxuXHRcdFx0Y29udGV4dDogeyBhcmd1bWVudHM6IGFscmVhZHlSZXNvbHZlZCB9LFxuXHRcdH0sIHRva2VuKSwgdG9rZW4pO1xuXHRcdHJldHVybiByZXN1bHQuY29tcGxldGlvbi52YWx1ZXM7XG5cdH1cbn1cblxuZnVuY3Rpb24gZW5jb2RlQ2FwYWJpbGl0aWVzKGNhcDogTUNQLlNlcnZlckNhcGFiaWxpdGllcyk6IE1jcENhcGFiaWxpdHkge1xuXHRsZXQgb3V0ID0gMDtcblx0aWYgKGNhcC5sb2dnaW5nKSB7IG91dCB8PSBNY3BDYXBhYmlsaXR5LkxvZ2dpbmc7IH1cblx0aWYgKGNhcC5jb21wbGV0aW9ucykgeyBvdXQgfD0gTWNwQ2FwYWJpbGl0eS5Db21wbGV0aW9uczsgfVxuXHRpZiAoY2FwLnByb21wdHMpIHtcblx0XHRvdXQgfD0gTWNwQ2FwYWJpbGl0eS5Qcm9tcHRzO1xuXHRcdGlmIChjYXAucHJvbXB0cy5saXN0Q2hhbmdlZCkge1xuXHRcdFx0b3V0IHw9IE1jcENhcGFiaWxpdHkuUHJvbXB0c0xpc3RDaGFuZ2VkO1xuXHRcdH1cblx0fVxuXHRpZiAoY2FwLnJlc291cmNlcykge1xuXHRcdG91dCB8PSBNY3BDYXBhYmlsaXR5LlJlc291cmNlcztcblx0XHRpZiAoY2FwLnJlc291cmNlcy5zdWJzY3JpYmUpIHtcblx0XHRcdG91dCB8PSBNY3BDYXBhYmlsaXR5LlJlc291cmNlc1N1YnNjcmliZTtcblx0XHR9XG5cdFx0aWYgKGNhcC5yZXNvdXJjZXMubGlzdENoYW5nZWQpIHtcblx0XHRcdG91dCB8PSBNY3BDYXBhYmlsaXR5LlJlc291cmNlc0xpc3RDaGFuZ2VkO1xuXHRcdH1cblx0fVxuXHRpZiAoY2FwLnRvb2xzKSB7XG5cdFx0b3V0IHw9IE1jcENhcGFiaWxpdHkuVG9vbHM7XG5cdFx0aWYgKGNhcC50b29scy5saXN0Q2hhbmdlZCkge1xuXHRcdFx0b3V0IHw9IE1jcENhcGFiaWxpdHkuVG9vbHNMaXN0Q2hhbmdlZDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGNsYXNzIE1jcFRvb2wgaW1wbGVtZW50cyBJTWNwVG9vbCB7XG5cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVmZXJlbmNlTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uczogSU1jcEljb25zO1xuXHRyZWFkb25seSB2aXNpYmlsaXR5OiBNY3BUb29sVmlzaWJpbGl0eTtcblxuXHRwdWJsaWMgZ2V0IGRlZmluaXRpb24oKTogTUNQLlRvb2wgeyByZXR1cm4gdGhpcy5fZGVmaW5pdGlvbjsgfVxuXHRwdWJsaWMgZ2V0IHVpUmVzb3VyY2VVcmkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2RlZmluaXRpb24udWlSZXNvdXJjZVVyaTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlcjogTWNwU2VydmVyLFxuXHRcdGlkUHJlZml4OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVmaW5pdGlvbjogVmFsaWRhdGVkTWNwVG9vbCxcblx0XHRASU1jcEVsaWNpdGF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbGljaXRhdGlvblNlcnZpY2U6IElNY3BFbGljaXRhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMucmVmZXJlbmNlTmFtZSA9IF9kZWZpbml0aW9uLm5hbWUucmVwbGFjZUFsbCgnLicsICdfJyk7XG5cdFx0dGhpcy5pZCA9IChpZFByZWZpeCArIF9kZWZpbml0aW9uLm5hbWUpLnJlcGxhY2VBbGwoJy4nLCAnXycpLnNsaWNlKDAsIE1jcFRvb2xOYW1lLk1heExlbmd0aCk7XG5cdFx0dGhpcy5pY29ucyA9IE1jcEljb25zLmZyb21TdG9yZWQodGhpcy5fZGVmaW5pdGlvbi5faWNvbnMpO1xuXHRcdHRoaXMudmlzaWJpbGl0eSA9IF9kZWZpbml0aW9uLnZpc2liaWxpdHkgPz8gKE1jcFRvb2xWaXNpYmlsaXR5Lk1vZGVsIHwgTWNwVG9vbFZpc2liaWxpdHkuQXBwKTtcblx0fVxuXG5cdGFzeW5jIGNhbGwocGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgY29udGV4dD86IElNY3BUb29sQ2FsbENvbnRleHQsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD4ge1xuXHRcdGlmIChjb250ZXh0KSB7IHRoaXMuX3NlcnZlci5ydW5uaW5nVG9vbENhbGxzLmFkZChjb250ZXh0KTsgfVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fY2FsbFdpdGhQcm9ncmVzcyhwYXJhbXMsIHVuZGVmaW5lZCwgY29udGV4dCwgdG9rZW4pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoY29udGV4dCkgeyB0aGlzLl9zZXJ2ZXIucnVubmluZ1Rvb2xDYWxscy5kZWxldGUoY29udGV4dCk7IH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBjYWxsV2l0aFByb2dyZXNzKHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIGNvbnRleHQ/OiBJTWNwVG9vbENhbGxDb250ZXh0LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuQ2FsbFRvb2xSZXN1bHQ+IHtcblx0XHRpZiAoY29udGV4dCkgeyB0aGlzLl9zZXJ2ZXIucnVubmluZ1Rvb2xDYWxscy5hZGQoY29udGV4dCk7IH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2NhbGxXaXRoUHJvZ3Jlc3MocGFyYW1zLCBwcm9ncmVzcywgY29udGV4dCwgdG9rZW4pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoY29udGV4dCkgeyB0aGlzLl9zZXJ2ZXIucnVubmluZ1Rvb2xDYWxscy5kZWxldGUoY29udGV4dCk7IH1cblx0XHR9XG5cdH1cblxuXHRfY2FsbFdpdGhQcm9ncmVzcyhwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9ncmVzczogVG9vbFByb2dyZXNzIHwgdW5kZWZpbmVkLCBjb250ZXh0PzogSU1jcFRvb2xDYWxsQ29udGV4dCwgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBhbGxvd1JldHJ5ID0gdHJ1ZSk6IFByb21pc2U8TUNQLkNhbGxUb29sUmVzdWx0PiB7XG5cdFx0Ly8gc2VydmVyVG9vbE5hbWUgaXMgYWx3YXlzIHNldCBub3csIGJ1dCBvbGRlciBjYWNoZSBlbnRyaWVzIChmcm9tIDEuOTktSW5zaWRlcnMpIG1heSBub3QgaGF2ZSBpdC5cblx0XHRjb25zdCBuYW1lID0gdGhpcy5fZGVmaW5pdGlvbi5zZXJ2ZXJUb29sTmFtZSA/PyB0aGlzLl9kZWZpbml0aW9uLm5hbWU7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NUb2tlbiA9IHByb2dyZXNzID8gZ2VuZXJhdGVVdWlkKCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRyZXR1cm4gTWNwU2VydmVyLmNhbGxPbih0aGlzLl9zZXJ2ZXIsIGFzeW5jIGggPT4ge1xuXHRcdFx0aWYgKHByb2dyZXNzKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChoLm9uRGlkUmVjZWl2ZVByb2dyZXNzTm90aWZpY2F0aW9uKChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUucGFyYW1zLnByb2dyZXNzVG9rZW4gPT09IHByb2dyZXNzVG9rZW4pIHtcblx0XHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGUucGFyYW1zLm1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRcdHByb2dyZXNzOiBlLnBhcmFtcy50b3RhbCAhPT0gdW5kZWZpbmVkICYmIGUucGFyYW1zLnByb2dyZXNzICE9PSB1bmRlZmluZWQgPyBlLnBhcmFtcy5wcm9ncmVzcyAvIGUucGFyYW1zLnRvdGFsIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyBwcm9ncmVzc1Rva2VuIH07XG5cdFx0XHRpZiAoY29udGV4dD8uY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRtZXRhWyd2c2NvZGUuY29udmVyc2F0aW9uSWQnXSA9IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29udGV4dD8uY2hhdFJlcXVlc3RJZCkge1xuXHRcdFx0XHRtZXRhWyd2c2NvZGUucmVxdWVzdElkJ10gPSBjb250ZXh0LmNoYXRSZXF1ZXN0SWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBQcm9wYWdhdGUgVzNDIHRyYWNlIGNvbnRleHQgdG8gdGhlIE1DUCBzZXJ2ZXIgKE1DUCBTRVAtNDE0KSBzbyBzZXJ2ZXItc2lkZVxuXHRcdFx0Ly8gc3BhbnMgY2FuIGJlIGNvcnJlbGF0ZWQgd2l0aCB0aGUgY2xpZW50IHRyYWNlLlxuXHRcdFx0aWYgKGNvbnRleHQ/LnRyYWNlcGFyZW50KSB7XG5cdFx0XHRcdG1ldGFbJ3RyYWNlcGFyZW50J10gPSBjb250ZXh0LnRyYWNlcGFyZW50O1xuXHRcdFx0XHRpZiAoY29udGV4dC50cmFjZXN0YXRlKSB7XG5cdFx0XHRcdFx0bWV0YVsndHJhY2VzdGF0ZSddID0gY29udGV4dC50cmFjZXN0YXRlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhc2tIaW50ID0gdGhpcy5fZGVmaW5pdGlvbi5leGVjdXRpb24/LnRhc2tTdXBwb3J0O1xuXHRcdFx0Y29uc3Qgc2VydmVyU3VwcG9ydHNUYXNrc0ZvclRvb2xzID0gaC5jYXBhYmlsaXRpZXMudGFza3M/LnJlcXVlc3RzPy50b29scz8uY2FsbCAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc2hvdWxkVXNlVGFzayA9IHNlcnZlclN1cHBvcnRzVGFza3NGb3JUb29scyAmJiAodGFza0hpbnQgPT09ICdyZXF1aXJlZCcgfHwgdGFza0hpbnQgPT09ICdvcHRpb25hbCcpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoLmNhbGxUb29sKHtcblx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdGFyZ3VtZW50czogcGFyYW1zLFxuXHRcdFx0XHRcdHRhc2s6IHNob3VsZFVzZVRhc2sgPyB7fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogbWV0YSxcblx0XHRcdFx0fSwgdG9rZW4sIHByb2dyZXNzID8gKG1lc3NhZ2UpID0+IHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2UgfSkgOiB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdC8vIFdhaXQgZm9yIHRvb2xzIHRvIHJlZnJlc2ggZm9yIGR5bmFtaWMgc2VydmVycyAoIzI2MTYxMSlcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2VydmVyLmF3YWl0VG9vbFJlZnJlc2goKTtcblxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdC8vIEhhbmRsZSBVUkwgZWxpY2l0YXRpb24gcmVxdWlyZWQgZXJyb3Jcblx0XHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIE1wY1Jlc3BvbnNlRXJyb3IgJiYgZXJyLmNvZGUgPT09IE1DUC5VUkxfRUxJQ0lUQVRJT05fUkVRVUlSRUQgJiYgYWxsb3dSZXRyeSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZUVsaWNpdGF0aW9uRXJyKGVyciwgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jYWxsV2l0aFByb2dyZXNzKHBhcmFtcywgcHJvZ3Jlc3MsIGNvbnRleHQsIHRva2VuLCBmYWxzZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3NlcnZlci5jb25uZWN0aW9uU3RhdGUuZ2V0KCk7XG5cdFx0XHRcdGlmIChhbGxvd1JldHJ5ICYmIHN0YXRlLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciAmJiBzdGF0ZS5zaG91bGRSZXRyeSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jYWxsV2l0aFByb2dyZXNzKHBhcmFtcywgcHJvZ3Jlc3MsIGNvbnRleHQsIHRva2VuLCBmYWxzZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRWxpY2l0YXRpb25FcnIoZXJyOiBNcGNSZXNwb25zZUVycm9yLCBjb250ZXh0OiBJTWNwVG9vbENhbGxDb250ZXh0IHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRjb25zdCBlbGljaXRhdGlvbnMgPSAoZXJyLmRhdGEgYXMgTUNQLlVSTEVsaWNpdGF0aW9uUmVxdWlyZWRFcnJvclsnZXJyb3InXVsnZGF0YSddKT8uZWxpY2l0YXRpb25zO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGVsaWNpdGF0aW9ucykgJiYgZWxpY2l0YXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgZWxpY2l0YXRpb24gb2YgZWxpY2l0YXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGVsaWNpdFJlc3VsdCA9IGF3YWl0IHRoaXMuX2VsaWNpdGF0aW9uU2VydmljZS5lbGljaXQodGhpcy5fc2VydmVyLCBjb250ZXh0LCBlbGljaXRhdGlvbiwgdG9rZW4pO1xuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKGVsaWNpdFJlc3VsdC52YWx1ZS5hY3Rpb24gIT09ICdhY2NlcHQnKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGVsaWNpdFJlc3VsdC5raW5kID09PSBFbGljaXRhdGlvbktpbmQuVVJMKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBlbGljaXRSZXN1bHQud2FpdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0ZWxpY2l0UmVzdWx0LmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbXBhcmUob3RoZXI6IElNY3BUb29sKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVmaW5pdGlvbi5uYW1lLmxvY2FsZUNvbXBhcmUob3RoZXIuZGVmaW5pdGlvbi5uYW1lKTtcblx0fVxufVxuXG5mdW5jdGlvbiB3YXJuSW52YWxpZFRvb2xzKGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2ZXJOYW1lOiBzdHJpbmcsIGVycm9yVGV4dDogc3RyaW5nKSB7XG5cdGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtY3BCYWRTY2hlbWEnLCAnTUNQIHNlcnZlciBgezB9YCBoYXMgdG9vbHMgd2l0aCBpbnZhbGlkIHBhcmFtZXRlcnMgd2hpY2ggd2lsbCBiZSBvbWl0dGVkLicsIHNlcnZlck5hbWUpLFxuXHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRwcmltYXJ5OiBbe1xuXHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRpZDogJ21jcEJhZFNjaGVtYS5zaG93Jyxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcEJhZFNjaGVtYS5zaG93JywgJ1Nob3cnKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0XHRcdHJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiBlcnJvclRleHQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5jbGFzcyBNY3BSZXNvdXJjZSBpbXBsZW1lbnRzIElNY3BSZXNvdXJjZSB7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBtY3BVcmk6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtaW1lVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzaXplSW5CeXRlczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlcnZlcjogTWNwU2VydmVyLFxuXHRcdG9yaWdpbmFsOiBNQ1AuUmVzb3VyY2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IGljb25zOiBJTWNwSWNvbnMsXG5cdCkge1xuXHRcdHRoaXMubWNwVXJpID0gb3JpZ2luYWwudXJpO1xuXHRcdHRoaXMudGl0bGUgPSBvcmlnaW5hbC50aXRsZTtcblx0XHR0aGlzLnVyaSA9IE1jcFJlc291cmNlVVJJLmZyb21TZXJ2ZXIoc2VydmVyLmRlZmluaXRpb24sIG9yaWdpbmFsLnVyaSk7XG5cdFx0dGhpcy5uYW1lID0gb3JpZ2luYWwubmFtZTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gb3JpZ2luYWwuZGVzY3JpcHRpb247XG5cdFx0dGhpcy5taW1lVHlwZSA9IG9yaWdpbmFsLm1pbWVUeXBlO1xuXHRcdHRoaXMuc2l6ZUluQnl0ZXMgPSBvcmlnaW5hbC5zaXplO1xuXHR9XG59XG5cbmNsYXNzIE1jcFJlc291cmNlVGVtcGxhdGUgaW1wbGVtZW50cyBJTWNwUmVzb3VyY2VUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBtaW1lVHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgdGVtcGxhdGU6IFVyaVRlbXBsYXRlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlcjogTWNwU2VydmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlZmluaXRpb246IE1DUC5SZXNvdXJjZVRlbXBsYXRlLFxuXHRcdHB1YmxpYyByZWFkb25seSBpY29uczogSU1jcEljb25zLFxuXHQpIHtcblx0XHR0aGlzLm5hbWUgPSBfZGVmaW5pdGlvbi5uYW1lO1xuXHRcdHRoaXMuZGVzY3JpcHRpb24gPSBfZGVmaW5pdGlvbi5kZXNjcmlwdGlvbjtcblx0XHR0aGlzLm1pbWVUeXBlID0gX2RlZmluaXRpb24ubWltZVR5cGU7XG5cdFx0dGhpcy50aXRsZSA9IF9kZWZpbml0aW9uLnRpdGxlO1xuXHRcdHRoaXMudGVtcGxhdGUgPSBVcmlUZW1wbGF0ZS5wYXJzZShfZGVmaW5pdGlvbi51cmlUZW1wbGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZVVSSSh2YXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFVSSSB7XG5cdFx0Y29uc3Qgc2VydmVyVXJpID0gdGhpcy50ZW1wbGF0ZS5yZXNvbHZlKHZhcnMpO1xuXHRcdHJldHVybiBNY3BSZXNvdXJjZVVSSS5mcm9tU2VydmVyKHRoaXMuX3NlcnZlci5kZWZpbml0aW9uLCBzZXJ2ZXJVcmkpO1xuXHR9XG5cblx0YXN5bmMgY29tcGxldGUodGVtcGxhdGVQYXJ0OiBzdHJpbmcsIHByZWZpeDogc3RyaW5nLCBhbHJlYWR5UmVzb2x2ZWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHN0cmluZ1tdPiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBNY3BTZXJ2ZXIuY2FsbE9uKHRoaXMuX3NlcnZlciwgaCA9PiBoLmNvbXBsZXRlKHtcblx0XHRcdHJlZjogeyB0eXBlOiAncmVmL3Jlc291cmNlJywgdXJpOiB0aGlzLl9kZWZpbml0aW9uLnVyaVRlbXBsYXRlIH0sXG5cdFx0XHRhcmd1bWVudDogeyBuYW1lOiB0ZW1wbGF0ZVBhcnQsIHZhbHVlOiBwcmVmaXggfSxcblx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0YXJndW1lbnRzOiBtYXBWYWx1ZXMoYWxyZWFkeVJlc29sdmVkLCB2ID0+IEFycmF5LmlzQXJyYXkodikgPyB2LmpvaW4oJy8nKSA6IHYpLFxuXHRcdFx0fSxcblx0XHR9LCB0b2tlbiksIHRva2VuKTtcblx0XHRyZXR1cm4gcmVzdWx0LmNvbXBsZXRpb24udmFsdWVzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCLHVCQUF1QixpQkFBaUI7QUFDeEUsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksVUFBVTtBQUN0QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFlBQVksaUJBQTBDLG1CQUFtQixvQkFBb0I7QUFDdEcsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsU0FBUyx1QkFBdUIsU0FBUyxtQkFBbUIsMkJBQStFLHFCQUFxQixtQkFBbUIsaUJBQWlCLG1CQUFtQjtBQUNoTyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyw0QkFBNEI7QUFDckMsU0FB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
