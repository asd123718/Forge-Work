import { equals } from "../../../../base/common/arrays.js";
import { assertNever, softAssertNever } from "../../../../base/common/assert.js";
import { DeferredPromise, disposableTimeout, IntervalTimer, isThenable } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { JsonRpcError, JsonRpcProtocol } from "../../../../base/common/jsonRpcProtocol.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, ObservablePromise, observableValue, transaction } from "../../../../base/common/observable.js";
import { canLog, log, LogLevel } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { McpConnectionState, McpError, MpcResponseError } from "./mcpTypes.js";
import { isTaskResult, translateMcpLogMessage } from "./mcpTypesUtils.js";
import { MCP } from "./modelContextProtocol.js";
class McpServerRequestHandler extends Disposable {
  constructor({
    launch,
    logger,
    createMessageRequestHandler,
    elicitationRequestHandler,
    requestLogLevel = LogLevel.Debug,
    taskManager
  }) {
    super();
    this._hasAnnouncedRoots = false;
    this._roots = [];
    // Event emitters for server notifications
    this._onDidReceiveCancelledNotification = this._register(new Emitter());
    this.onDidReceiveCancelledNotification = this._onDidReceiveCancelledNotification.event;
    this._onDidReceiveProgressNotification = this._register(new Emitter());
    this.onDidReceiveProgressNotification = this._onDidReceiveProgressNotification.event;
    this._onDidReceiveElicitationCompleteNotification = this._register(new Emitter());
    this.onDidReceiveElicitationCompleteNotification = this._onDidReceiveElicitationCompleteNotification.event;
    this._onDidChangeResourceList = this._register(new Emitter());
    this.onDidChangeResourceList = this._onDidChangeResourceList.event;
    this._onDidUpdateResource = this._register(new Emitter());
    this.onDidUpdateResource = this._onDidUpdateResource.event;
    this._onDidChangeToolList = this._register(new Emitter());
    this.onDidChangeToolList = this._onDidChangeToolList.event;
    this._onDidChangePromptList = this._register(new Emitter());
    this.onDidChangePromptList = this._onDidChangePromptList.event;
    this._launch = launch;
    this.logger = logger;
    this._requestLogLevel = requestLogLevel;
    this._createMessageRequestHandler = createMessageRequestHandler;
    this._elicitationRequestHandler = elicitationRequestHandler;
    this._taskManager = taskManager;
    this._rpc = this._register(new JsonRpcProtocol(
      (message) => this.send(message),
      {
        handleRequest: (request, token) => this.handleServerRequest(request, token),
        handleNotification: (notification) => this.handleServerNotification(notification)
      }
    ));
    this._taskManager.setHandler(this);
    this._register(this._taskManager.onDidUpdateTask((task) => {
      this.send({
        jsonrpc: MCP.JSONRPC_VERSION,
        method: "notifications/tasks/status",
        params: task
      });
    }));
    this._register(toDisposable(() => this._taskManager.setHandler(void 0)));
    this._register(launch.onDidReceiveMessage((message) => {
      if (canLog(this.logger.getLevel(), this._requestLogLevel)) {
        log(this.logger, this._requestLogLevel, `[server -> editor] ${JSON.stringify(message)}`);
      }
      void this._rpc.handleMessage(message);
    }));
    this._register(autorun((reader) => {
      const state = launch.state.read(reader).state;
      if (state === McpConnectionState.Kind.Error || state === McpConnectionState.Kind.Stopped) {
        this.cancelAllRequests();
      }
    }));
    this._register(logger.onDidChangeLogLevel((logLevel) => {
      this._sendLogLevelToServer(logLevel);
    }));
  }
  set roots(roots) {
    if (!equals(this._roots, roots)) {
      this._roots = roots;
      if (this._hasAnnouncedRoots) {
        this.sendNotification({ method: "notifications/roots/list_changed" });
        this._hasAnnouncedRoots = false;
      }
    }
  }
  get capabilities() {
    return this._serverInit.capabilities;
  }
  get serverInfo() {
    return this._serverInit.serverInfo;
  }
  get serverInstructions() {
    return this._serverInit.instructions;
  }
  /**
   * Connects to the MCP server and does the initialization handshake.
   * @throws MpcResponseError if the server fails to initialize.
   */
  static async create(instaService, opts, token) {
    const mcp = new McpServerRequestHandler(opts);
    const store = new DisposableStore();
    try {
      const timer = store.add(new IntervalTimer());
      timer.cancelAndSet(() => {
        opts.logger.info("Waiting for server to respond to `initialize` request...");
      }, 5e3);
      await instaService.invokeFunction(async (accessor) => {
        const productService = accessor.get(IProductService);
        const initialized = await mcp.sendRequest({
          method: "initialize",
          params: {
            protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
            capabilities: {
              roots: { listChanged: true },
              sampling: opts.createMessageRequestHandler ? {} : void 0,
              elicitation: opts.elicitationRequestHandler ? { form: {}, url: {} } : void 0,
              tasks: {
                list: {},
                cancel: {},
                requests: {
                  sampling: opts.createMessageRequestHandler ? { createMessage: {} } : void 0,
                  elicitation: opts.elicitationRequestHandler ? { create: {} } : void 0
                }
              },
              extensions: {
                "io.modelcontextprotocol/ui": {
                  mimeTypes: ["text/html;profile=mcp-app"]
                }
              }
            },
            clientInfo: {
              name: productService.nameLong,
              version: productService.version
            }
          }
        }, token);
        mcp._serverInit = initialized;
        mcp._sendLogLevelToServer(opts.logger.getLevel());
        mcp.sendNotification({
          method: "notifications/initialized"
        });
      });
      return mcp;
    } catch (e) {
      mcp.dispose();
      throw e;
    } finally {
      store.dispose();
    }
  }
  /**
   * Send a client request to the server and return the response.
   *
   * @param request The request to send
   * @param token Cancellation token
   * @param timeoutMs Optional timeout in milliseconds
   * @returns A promise that resolves with the response
   */
  async sendRequest(request, token = CancellationToken.None) {
    if (this._store.isDisposed) {
      return Promise.reject(new CancellationError());
    }
    return this._rpc.sendRequest(
      request,
      token,
      (id) => this.sendNotification({ method: "notifications/cancelled", params: { requestId: id } })
    ).catch((error) => {
      if (error instanceof JsonRpcError) {
        throw new MpcResponseError(error.message, error.code, error.data);
      }
      throw error;
    });
  }
  send(mcp) {
    if (canLog(this.logger.getLevel(), this._requestLogLevel)) {
      log(this.logger, this._requestLogLevel, `[editor -> server] ${JSON.stringify(mcp)}`);
    }
    this._launch.send(mcp);
  }
  /**
   * Handles paginated requests by making multiple requests until all items are retrieved.
   *
   * @param method The method name to call
   * @param getItems Function to extract the array of items from a result
   * @param initialParams Initial parameters
   * @param token Cancellation token
   * @returns Promise with all items combined
   */
  async *sendRequestPaginated(method, getItems, initialParams, token = CancellationToken.None) {
    let nextCursor = void 0;
    do {
      const params = {
        ...initialParams,
        cursor: nextCursor
      };
      const result = await this.sendRequest({ method, params }, token);
      yield getItems(result);
      nextCursor = result.nextCursor;
    } while (nextCursor !== void 0 && !token.isCancellationRequested);
  }
  sendNotification(notification) {
    this.send({ ...notification, jsonrpc: MCP.JSONRPC_VERSION });
  }
  /**
   * Handle incoming server requests
   */
  handleServerRequest(request, token) {
    const mapError = (error) => {
      if (error instanceof McpError) {
        return new JsonRpcError(error.code, error.message, error.data);
      }
      this.logger.error(`Error handling request ${request.method}:`, error);
      const mcpError = McpError.unknown(error instanceof Error ? error : new Error(String(error)));
      return new JsonRpcError(mcpError.code, mcpError.message, mcpError.data);
    };
    try {
      let result;
      if (request.method === "ping") {
        result = this.handlePing(request);
      } else if (request.method === "roots/list") {
        result = this.handleRootsList(request);
      } else if (request.method === "sampling/createMessage" && this._createMessageRequestHandler) {
        if (request.params.task) {
          const taskResult = this._taskManager.createTask(
            request.params.task.ttl ?? null,
            (token2) => this._createMessageRequestHandler(request.params, token2)
          );
          taskResult._meta ??= {};
          taskResult._meta["io.modelcontextprotocol/related-task"] = { taskId: taskResult.task.taskId };
          result = taskResult;
        } else {
          result = this._createMessageRequestHandler(request.params, token);
        }
      } else if (request.method === "elicitation/create" && this._elicitationRequestHandler) {
        if (request.params.task) {
          const taskResult = this._taskManager.createTask(
            request.params.task.ttl ?? null,
            (token2) => this._elicitationRequestHandler(request.params, token2)
          );
          taskResult._meta ??= {};
          taskResult._meta["io.modelcontextprotocol/related-task"] = { taskId: taskResult.task.taskId };
          result = taskResult;
        } else {
          result = this._elicitationRequestHandler(request.params, token);
        }
      } else if (request.method === "tasks/get") {
        result = this._taskManager.getTask(request.params.taskId);
      } else if (request.method === "tasks/result") {
        result = this._taskManager.getTaskResult(request.params.taskId);
      } else if (request.method === "tasks/cancel") {
        result = this._taskManager.cancelTask(request.params.taskId);
      } else if (request.method === "tasks/list") {
        result = this._taskManager.listTasks();
      } else {
        throw McpError.methodNotFound(request.method);
      }
      if (isThenable(result)) {
        return result.then(void 0, (error) => {
          throw mapError(error);
        });
      }
      return result;
    } catch (e) {
      throw mapError(e);
    }
  }
  /**
   * Handle incoming server notifications
   */
  handleServerNotification(request) {
    try {
      switch (request.method) {
        case "notifications/message":
          return this.handleLoggingNotification(request);
        case "notifications/cancelled":
          this._onDidReceiveCancelledNotification.fire(request);
          return this.handleCancelledNotification(request);
        case "notifications/progress":
          this._onDidReceiveProgressNotification.fire(request);
          return;
        case "notifications/resources/list_changed":
          this._onDidChangeResourceList.fire();
          return;
        case "notifications/resources/updated":
          this._onDidUpdateResource.fire(request);
          return;
        case "notifications/tools/list_changed":
          this._onDidChangeToolList.fire();
          return;
        case "notifications/prompts/list_changed":
          this._onDidChangePromptList.fire();
          return;
        case "notifications/elicitation/complete":
          this._onDidReceiveElicitationCompleteNotification.fire(request);
          return;
        case "notifications/tasks/status":
          this._taskManager.getClientTask(request.params.taskId)?.onDidUpdateState(request.params);
          return;
        default:
          softAssertNever(request);
      }
    } catch (error) {
      this.logger.error(`Error handling notification ${request.method}:`, error);
    }
  }
  handleCancelledNotification(request) {
    if (request.params.requestId) {
      this._rpc.cancelPendingRequest(request.params.requestId);
    }
  }
  handleLoggingNotification(request) {
    translateMcpLogMessage(this.logger, request.params);
  }
  /**
   * Send a response to a ping request
   */
  handlePing(_request) {
    return {};
  }
  /**
   * Send a response to a roots/list request
   */
  handleRootsList(_request) {
    this._hasAnnouncedRoots = true;
    return { roots: this._roots };
  }
  cancelAllRequests() {
    this._rpc.cancelAllRequests();
  }
  dispose() {
    this.cancelAllRequests();
    super.dispose();
  }
  /**
   * Forwards log level changes to the MCP server if it supports logging
   */
  async _sendLogLevelToServer(logLevel) {
    try {
      if (!this.capabilities.logging) {
        return;
      }
      await this.setLevel({ level: mapLogLevelToMcp(logLevel) });
    } catch (error) {
      this.logger.error(`Failed to set MCP server log level: ${error}`);
    }
  }
  /**
   * Send an initialize request
   */
  initialize(params, token) {
    return this.sendRequest({ method: "initialize", params }, token);
  }
  /**
   * List available resources
   */
  listResources(params, token) {
    return Iterable.asyncToArrayFlat(this.listResourcesIterable(params, token));
  }
  /**
   * List available resources (iterable)
   */
  listResourcesIterable(params, token) {
    return this.sendRequestPaginated("resources/list", (result) => result.resources, params, token);
  }
  /**
   * Read a specific resource
   */
  readResource(params, token) {
    return this.sendRequest({ method: "resources/read", params }, token);
  }
  /**
   * List available resource templates
   */
  listResourceTemplates(params, token) {
    return Iterable.asyncToArrayFlat(this.sendRequestPaginated("resources/templates/list", (result) => result.resourceTemplates, params, token));
  }
  /**
   * Subscribe to resource updates
   */
  subscribe(params, token) {
    return this.sendRequest({ method: "resources/subscribe", params }, token);
  }
  /**
   * Unsubscribe from resource updates
   */
  unsubscribe(params, token) {
    return this.sendRequest({ method: "resources/unsubscribe", params }, token);
  }
  /**
   * List available prompts
   */
  listPrompts(params, token) {
    return Iterable.asyncToArrayFlat(this.sendRequestPaginated("prompts/list", (result) => result.prompts, params, token));
  }
  /**
   * Get a specific prompt
   */
  getPrompt(params, token) {
    return this.sendRequest({ method: "prompts/get", params }, token);
  }
  /**
   * List available tools
   */
  listTools(params, token) {
    return Iterable.asyncToArrayFlat(this.sendRequestPaginated("tools/list", (result) => result.tools, params, token));
  }
  /**
   * Call a specific tool. Supports tasks automatically if `task` is set on the request.
   */
  async callTool(params, token, onStatusMessage) {
    const response = await this.sendRequest({ method: "tools/call", params }, token);
    if (isTaskResult(response)) {
      const task = new McpTask(response.task, token, onStatusMessage);
      this._taskManager.adoptClientTask(task);
      task.setHandler(this);
      return task.result.finally(() => {
        this._taskManager.abandonClientTask(task.id);
      });
    }
    return response;
  }
  /**
   * Set the logging level
   */
  setLevel(params, token) {
    return this.sendRequest({ method: "logging/setLevel", params }, token);
  }
  /**
   * Find completions for an argument
   */
  complete(params, token) {
    return this.sendRequest({ method: "completion/complete", params }, token);
  }
  /**
   * Get task status
   */
  getTask(params, token) {
    return this.sendRequest({ method: "tasks/get", params }, token);
  }
  /**
   * Get task result
   */
  getTaskResult(params, token) {
    return this.sendRequest({ method: "tasks/result", params }, token);
  }
  /**
   * Cancel a task
   */
  cancelTask(params, token) {
    return this.sendRequest({ method: "tasks/cancel", params }, token);
  }
  /**
   * List all tasks
   */
  listTasks(params, token) {
    return Iterable.asyncToArrayFlat(
      this.sendRequestPaginated(
        "tasks/list",
        (result) => result.tasks,
        params,
        token
      )
    );
  }
}
function isTaskInTerminalState(task) {
  return task.status === "completed" || task.status === "failed" || task.status === "cancelled";
}
class McpTask extends Disposable {
  constructor(_task, _token = CancellationToken.None, _onStatusMessage) {
    super();
    this._task = _task;
    this._onStatusMessage = _onStatusMessage;
    this.promise = new DeferredPromise();
    this._handler = observableValue("mcpTaskHandler", void 0);
    const expiresAt = _task.ttl ? Date.now() + _task.ttl : void 0;
    this._lastTaskState = observableValue("lastTaskState", this._task);
    const store = this._register(new DisposableStore());
    if (_token.isCancellationRequested) {
      this._lastTaskState.set({ ...this._task, status: "cancelled" }, void 0);
    } else {
      store.add(_token.onCancellationRequested(() => {
        const current = this._lastTaskState.get();
        if (!isTaskInTerminalState(current)) {
          this._lastTaskState.set({ ...current, status: "cancelled" }, void 0);
        }
      }));
    }
    if (expiresAt) {
      const ttlTimeout = expiresAt - Date.now();
      if (ttlTimeout <= 0) {
        this._lastTaskState.set({ ...this._task, status: "cancelled", statusMessage: "Task timed out." }, void 0);
      } else {
        store.add(disposableTimeout(() => {
          const current = this._lastTaskState.get();
          if (!isTaskInTerminalState(current)) {
            this._lastTaskState.set({ ...current, status: "cancelled", statusMessage: "Task timed out." }, void 0);
          }
        }, ttlTimeout));
      }
    }
    const inputRequiredLookup = observableValue("activeResultLookup", void 0);
    store.add(autorun((reader) => {
      const current = this._lastTaskState.read(reader);
      if (isTaskInTerminalState(current)) {
        return;
      }
      const lookup = inputRequiredLookup.read(reader);
      if (lookup) {
        const result = lookup.promiseResult.read(reader);
        return transaction((tx) => {
          if (!result) {
          } else if (result.data) {
            inputRequiredLookup.set(void 0, tx);
            this._lastTaskState.set(result.data, tx);
          } else {
            inputRequiredLookup.set(void 0, tx);
            if (result.error instanceof McpError && result.error.code === MCP.INVALID_PARAMS) {
              this._lastTaskState.set({ ...current, status: "cancelled" }, void 0);
            } else {
              this._lastTaskState.set({ ...current, status: "working" }, void 0);
            }
          }
        });
      }
      const handler = this._handler.read(reader);
      if (!handler) {
        return;
      }
      const pollInterval = _task.pollInterval ?? 2e3;
      const cts = new CancellationTokenSource(_token);
      reader.store.add(toDisposable(() => cts.dispose(true)));
      reader.store.add(disposableTimeout(() => {
        handler.getTask({ taskId: current.taskId }, cts.token).catch((e) => {
          if (e instanceof McpError && e.code === MCP.INVALID_PARAMS) {
            return { ...current, status: "cancelled" };
          } else {
            return { ...current };
          }
        }).then((r) => {
          if (r && !cts.token.isCancellationRequested) {
            this._lastTaskState.set(r, void 0);
          }
        });
      }, pollInterval));
    }));
    const lastStatus = this._lastTaskState.map((task) => task.status);
    store.add(autorun((reader) => {
      const status = lastStatus.read(reader);
      if (status === "failed") {
        const current = this._lastTaskState.read(void 0);
        this.promise.error(new Error(`Task ${current.taskId} failed: ${current.statusMessage ?? "unknown error"}`));
        store.dispose();
      } else if (status === "cancelled") {
        this.promise.cancel();
        store.dispose();
      } else if (status === "input_required") {
        const handler = this._handler.read(reader);
        if (handler) {
          const current = this._lastTaskState.read(void 0);
          const cts = new CancellationTokenSource(_token);
          reader.store.add(toDisposable(() => cts.dispose(true)));
          inputRequiredLookup.set(new ObservablePromise(handler.getTask({ taskId: current.taskId }, cts.token)), void 0);
        }
      } else if (status === "completed") {
        const handler = this._handler.read(reader);
        if (handler) {
          this.promise.settleWith(handler.getTaskResult({ taskId: _task.taskId }, _token));
          store.dispose();
        }
      } else if (status === "working") {
      } else {
        softAssertNever(status);
      }
    }));
  }
  get result() {
    return this.promise.p;
  }
  get id() {
    return this._task.taskId;
  }
  onDidUpdateState(task) {
    this._lastTaskState.set(task, void 0);
    if (task.statusMessage && this._onStatusMessage) {
      this._onStatusMessage(task.statusMessage);
    }
  }
  setHandler(handler) {
    this._handler.set(handler, void 0);
  }
}
function mapLogLevelToMcp(logLevel) {
  switch (logLevel) {
    case LogLevel.Trace:
      return "debug";
    // MCP doesn't have trace, use debug
    case LogLevel.Debug:
      return "debug";
    case LogLevel.Info:
      return "info";
    case LogLevel.Warning:
      return "warning";
    case LogLevel.Error:
      return "error";
    case LogLevel.Off:
      return "emergency";
    // MCP doesn't have off, use emergency
    default:
      return assertNever(logLevel);
  }
}
export {
  McpServerRequestHandler,
  McpTask
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciwgc29mdEFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgZGlzcG9zYWJsZVRpbWVvdXQsIEludGVydmFsVGltZXIsIGlzVGhlbmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSnNvblJwY0Vycm9yLCBKc29uUnBjUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uUnBjUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgT2JzZXJ2YWJsZVByb21pc2UsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgY2FuTG9nLCBJTG9nZ2VyLCBsb2csIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1jcE1lc3NhZ2VUcmFuc3BvcnQgfSBmcm9tICcuL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcFRhc2tJbnRlcm5hbCwgTWNwVGFza01hbmFnZXIgfSBmcm9tICcuL21jcFRhc2tNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElNY3BDbGllbnRNZXRob2RzLCBNY3BDb25uZWN0aW9uU3RhdGUsIE1jcEVycm9yLCBNcGNSZXNwb25zZUVycm9yIH0gZnJvbSAnLi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBpc1Rhc2tSZXN1bHQsIHRyYW5zbGF0ZU1jcExvZ01lc3NhZ2UgfSBmcm9tICcuL21jcFR5cGVzVXRpbHMuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWNwUm9vdCB7XG5cdHVyaTogc3RyaW5nO1xuXHRuYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlck9wdGlvbnMgZXh0ZW5kcyBJTWNwQ2xpZW50TWV0aG9kcyB7XG5cdC8qKiBNQ1AgbWVzc2FnZSB0cmFuc3BvcnQgKi9cblx0bGF1bmNoOiBJTWNwTWVzc2FnZVRyYW5zcG9ydDtcblx0LyoqIExvZ2dlciBpbnN0YW5jZS4gKi9cblx0bG9nZ2VyOiBJTG9nZ2VyO1xuXHQvKiogTG9nIGxldmVsIE1DUCBtZXNzYWdlcyBpcyBsb2dnZWQgYXQgKi9cblx0cmVxdWVzdExvZ0xldmVsPzogTG9nTGV2ZWw7XG5cdC8qKiBUYXNrIG1hbmFnZXIgZm9yIHNlcnZlci1zaWRlIE1DUCB0YXNrcyAoc2hhcmVkIGFjcm9zcyByZWNvbm5lY3Rpb25zKSAqL1xuXHR0YXNrTWFuYWdlcjogTWNwVGFza01hbmFnZXI7XG59XG5cbi8qKlxuICogUmVxdWVzdCBoYW5kbGVyIGZvciBjb21tdW5pY2F0aW5nIHdpdGggYW4gTUNQIHNlcnZlci5cbiAqXG4gKiBIYW5kbGVzIHNlbmRpbmcgcmVxdWVzdHMgYW5kIHJlY2VpdmluZyByZXNwb25zZXMsIHdpdGggYXV0b21hdGljXG4gKiBoYW5kbGluZyBvZiBwaW5nIHJlcXVlc3RzIGFuZCB0eXBlZCBjbGllbnQgcmVxdWVzdCBtZXRob2RzLlxuICovXG5leHBvcnQgY2xhc3MgTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcnBjOiBKc29uUnBjUHJvdG9jb2w7XG5cblx0cHJpdmF0ZSBfaGFzQW5ub3VuY2VkUm9vdHMgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcm9vdHM6IE1DUC5Sb290W10gPSBbXTtcblxuXHRwdWJsaWMgc2V0IHJvb3RzKHJvb3RzOiBNQ1AuUm9vdFtdKSB7XG5cdFx0aWYgKCFlcXVhbHModGhpcy5fcm9vdHMsIHJvb3RzKSkge1xuXHRcdFx0dGhpcy5fcm9vdHMgPSByb290cztcblx0XHRcdGlmICh0aGlzLl9oYXNBbm5vdW5jZWRSb290cykge1xuXHRcdFx0XHR0aGlzLnNlbmROb3RpZmljYXRpb24oeyBtZXRob2Q6ICdub3RpZmljYXRpb25zL3Jvb3RzL2xpc3RfY2hhbmdlZCcgfSk7XG5cdFx0XHRcdHRoaXMuX2hhc0Fubm91bmNlZFJvb3RzID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2VydmVySW5pdCE6IE1DUC5Jbml0aWFsaXplUmVzdWx0O1xuXHRwdWJsaWMgZ2V0IGNhcGFiaWxpdGllcygpOiBNQ1AuU2VydmVyQ2FwYWJpbGl0aWVzIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VydmVySW5pdC5jYXBhYmlsaXRpZXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHNlcnZlckluZm8oKTogTUNQLkltcGxlbWVudGF0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VydmVySW5pdC5zZXJ2ZXJJbmZvO1xuXHR9XG5cblx0cHVibGljIGdldCBzZXJ2ZXJJbnN0cnVjdGlvbnMoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VydmVySW5pdC5pbnN0cnVjdGlvbnM7XG5cdH1cblxuXHQvLyBFdmVudCBlbWl0dGVycyBmb3Igc2VydmVyIG5vdGlmaWNhdGlvbnNcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlQ2FuY2VsbGVkTm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TUNQLkNhbmNlbGxlZE5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZUNhbmNlbGxlZE5vdGlmaWNhdGlvbiA9IHRoaXMuX29uRGlkUmVjZWl2ZUNhbmNlbGxlZE5vdGlmaWNhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlY2VpdmVQcm9ncmVzc05vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1DUC5Qcm9ncmVzc05vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZVByb2dyZXNzTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWRSZWNlaXZlUHJvZ3Jlc3NOb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlRWxpY2l0YXRpb25Db21wbGV0ZU5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1DUC5FbGljaXRhdGlvbkNvbXBsZXRlTm90aWZpY2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWNlaXZlRWxpY2l0YXRpb25Db21wbGV0ZU5vdGlmaWNhdGlvbiA9IHRoaXMuX29uRGlkUmVjZWl2ZUVsaWNpdGF0aW9uQ29tcGxldGVOb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZXNvdXJjZUxpc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZXNvdXJjZUxpc3QgPSB0aGlzLl9vbkRpZENoYW5nZVJlc291cmNlTGlzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZVJlc291cmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TUNQLlJlc291cmNlVXBkYXRlZE5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlUmVzb3VyY2UgPSB0aGlzLl9vbkRpZFVwZGF0ZVJlc291cmNlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVG9vbExpc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUb29sTGlzdCA9IHRoaXMuX29uRGlkQ2hhbmdlVG9vbExpc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcm9tcHRMaXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvbXB0TGlzdCA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvbXB0TGlzdC5ldmVudDtcblxuXHQvKipcblx0ICogQ29ubmVjdHMgdG8gdGhlIE1DUCBzZXJ2ZXIgYW5kIGRvZXMgdGhlIGluaXRpYWxpemF0aW9uIGhhbmRzaGFrZS5cblx0ICogQHRocm93cyBNcGNSZXNwb25zZUVycm9yIGlmIHRoZSBzZXJ2ZXIgZmFpbHMgdG8gaW5pdGlhbGl6ZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgYXN5bmMgY3JlYXRlKGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcHRzOiBJTWNwU2VydmVyUmVxdWVzdEhhbmRsZXJPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0Y29uc3QgbWNwID0gbmV3IE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyKG9wdHMpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0aW1lciA9IHN0b3JlLmFkZChuZXcgSW50ZXJ2YWxUaW1lcigpKTtcblx0XHRcdHRpbWVyLmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHRcdG9wdHMubG9nZ2VyLmluZm8oJ1dhaXRpbmcgZm9yIHNlcnZlciB0byByZXNwb25kIHRvIGBpbml0aWFsaXplYCByZXF1ZXN0Li4uJyk7XG5cdFx0XHR9LCA1MDAwKTtcblxuXHRcdFx0YXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2R1Y3RTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbGl6ZWQgPSBhd2FpdCBtY3Auc2VuZFJlcXVlc3Q8TUNQLkluaXRpYWxpemVSZXF1ZXN0LCBNQ1AuSW5pdGlhbGl6ZVJlc3VsdD4oe1xuXHRcdFx0XHRcdG1ldGhvZDogJ2luaXRpYWxpemUnLFxuXHRcdFx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBNQ1AuTEFURVNUX1BST1RPQ09MX1ZFUlNJT04sXG5cdFx0XHRcdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0XHRcdFx0cm9vdHM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSxcblx0XHRcdFx0XHRcdFx0c2FtcGxpbmc6IG9wdHMuY3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyID8ge30gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGVsaWNpdGF0aW9uOiBvcHRzLmVsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXIgPyB7IGZvcm06IHt9LCB1cmw6IHt9IH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHRhc2tzOiB7XG5cdFx0XHRcdFx0XHRcdFx0bGlzdDoge30sXG5cdFx0XHRcdFx0XHRcdFx0Y2FuY2VsOiB7fSxcblx0XHRcdFx0XHRcdFx0XHRyZXF1ZXN0czoge1xuXHRcdFx0XHRcdFx0XHRcdFx0c2FtcGxpbmc6IG9wdHMuY3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyID8geyBjcmVhdGVNZXNzYWdlOiB7fSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZWxpY2l0YXRpb246IG9wdHMuZWxpY2l0YXRpb25SZXF1ZXN0SGFuZGxlciA/IHsgY3JlYXRlOiB7fSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHQnaW8ubW9kZWxjb250ZXh0cHJvdG9jb2wvdWknOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lVHlwZXM6IFsndGV4dC9odG1sO3Byb2ZpbGU9bWNwLWFwcCddXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Y2xpZW50SW5mbzoge1xuXHRcdFx0XHRcdFx0XHRuYW1lOiBwcm9kdWN0U2VydmljZS5uYW1lTG9uZyxcblx0XHRcdFx0XHRcdFx0dmVyc2lvbjogcHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHRva2VuKTtcblx0XHRcdFx0bWNwLl9zZXJ2ZXJJbml0ID0gaW5pdGlhbGl6ZWQ7XG5cdFx0XHRcdG1jcC5fc2VuZExvZ0xldmVsVG9TZXJ2ZXIob3B0cy5sb2dnZXIuZ2V0TGV2ZWwoKSk7XG5cblx0XHRcdFx0bWNwLnNlbmROb3RpZmljYXRpb248TUNQLkluaXRpYWxpemVkTm90aWZpY2F0aW9uPih7XG5cdFx0XHRcdFx0bWV0aG9kOiAnbm90aWZpY2F0aW9ucy9pbml0aWFsaXplZCdcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIG1jcDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRtY3AuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBsb2dnZXI6IElMb2dnZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhdW5jaDogSU1jcE1lc3NhZ2VUcmFuc3BvcnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3RMb2dMZXZlbDogTG9nTGV2ZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NyZWF0ZU1lc3NhZ2VSZXF1ZXN0SGFuZGxlcjogSU1jcFNlcnZlclJlcXVlc3RIYW5kbGVyT3B0aW9uc1snY3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyJ107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXI6IElNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlck9wdGlvbnNbJ2VsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXInXTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFza01hbmFnZXI6IE1jcFRhc2tNYW5hZ2VyO1xuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3Rvcih7XG5cdFx0bGF1bmNoLFxuXHRcdGxvZ2dlcixcblx0XHRjcmVhdGVNZXNzYWdlUmVxdWVzdEhhbmRsZXIsXG5cdFx0ZWxpY2l0YXRpb25SZXF1ZXN0SGFuZGxlcixcblx0XHRyZXF1ZXN0TG9nTGV2ZWwgPSBMb2dMZXZlbC5EZWJ1Zyxcblx0XHR0YXNrTWFuYWdlcixcblx0fTogSU1jcFNlcnZlclJlcXVlc3RIYW5kbGVyT3B0aW9ucykge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbGF1bmNoID0gbGF1bmNoO1xuXHRcdHRoaXMubG9nZ2VyID0gbG9nZ2VyO1xuXHRcdHRoaXMuX3JlcXVlc3RMb2dMZXZlbCA9IHJlcXVlc3RMb2dMZXZlbDtcblx0XHR0aGlzLl9jcmVhdGVNZXNzYWdlUmVxdWVzdEhhbmRsZXIgPSBjcmVhdGVNZXNzYWdlUmVxdWVzdEhhbmRsZXI7XG5cdFx0dGhpcy5fZWxpY2l0YXRpb25SZXF1ZXN0SGFuZGxlciA9IGVsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXI7XG5cdFx0dGhpcy5fdGFza01hbmFnZXIgPSB0YXNrTWFuYWdlcjtcblxuXHRcdHRoaXMuX3JwYyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBKc29uUnBjUHJvdG9jb2woXG5cdFx0XHRtZXNzYWdlID0+IHRoaXMuc2VuZChtZXNzYWdlIGFzIE1DUC5KU09OUlBDTWVzc2FnZSksXG5cdFx0XHR7XG5cdFx0XHRcdGhhbmRsZVJlcXVlc3Q6IChyZXF1ZXN0LCB0b2tlbikgPT4gdGhpcy5oYW5kbGVTZXJ2ZXJSZXF1ZXN0KHJlcXVlc3QgYXMgTUNQLkpTT05SUENSZXF1ZXN0ICYgTUNQLlNlcnZlclJlcXVlc3QsIHRva2VuKSxcblx0XHRcdFx0aGFuZGxlTm90aWZpY2F0aW9uOiBub3RpZmljYXRpb24gPT4gdGhpcy5oYW5kbGVTZXJ2ZXJOb3RpZmljYXRpb24obm90aWZpY2F0aW9uIGFzIE1DUC5KU09OUlBDTm90aWZpY2F0aW9uICYgTUNQLlNlcnZlck5vdGlmaWNhdGlvbiksXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBBdHRhY2ggdGhpcyBoYW5kbGVyIHRvIHRoZSB0YXNrIG1hbmFnZXJcblx0XHR0aGlzLl90YXNrTWFuYWdlci5zZXRIYW5kbGVyKHRoaXMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rhc2tNYW5hZ2VyLm9uRGlkVXBkYXRlVGFzayh0YXNrID0+IHtcblx0XHRcdHRoaXMuc2VuZCh7XG5cdFx0XHRcdGpzb25ycGM6IE1DUC5KU09OUlBDX1ZFUlNJT04sXG5cdFx0XHRcdG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvdGFza3Mvc3RhdHVzJyxcblx0XHRcdFx0cGFyYW1zOiB0YXNrXG5cdFx0XHR9IHNhdGlzZmllcyBNQ1AuVGFza1N0YXR1c05vdGlmaWNhdGlvbik7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl90YXNrTWFuYWdlci5zZXRIYW5kbGVyKHVuZGVmaW5lZCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhdW5jaC5vbkRpZFJlY2VpdmVNZXNzYWdlKG1lc3NhZ2UgPT4ge1xuXHRcdFx0aWYgKGNhbkxvZyh0aGlzLmxvZ2dlci5nZXRMZXZlbCgpLCB0aGlzLl9yZXF1ZXN0TG9nTGV2ZWwpKSB7XG5cdFx0XHRcdGxvZyh0aGlzLmxvZ2dlciwgdGhpcy5fcmVxdWVzdExvZ0xldmVsLCBgW3NlcnZlciAtPiBlZGl0b3JdICR7SlNPTi5zdHJpbmdpZnkobWVzc2FnZSl9YCk7XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX3JwYy5oYW5kbGVNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGxhdW5jaC5zdGF0ZS5yZWFkKHJlYWRlcikuc3RhdGU7XG5cdFx0XHQvLyB0aGUgaGFuZGxlciB3aWxsIGdldCBkaXNwb3NlZCB3aGVuIHRoZSBsYXVuY2ggc3RvcHMsIGJ1dCBpZiB3ZSdyZSBzdGlsbFxuXHRcdFx0Ly8gY3JlYXRlKCknaW5nIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHRvIGNhbmNlbCB0aGUgaW5pdGlhbGl6ZSByZXF1ZXN0LlxuXHRcdFx0aWYgKHN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciB8fCBzdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCkge1xuXHRcdFx0XHR0aGlzLmNhbmNlbEFsbFJlcXVlc3RzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBsb2cgbGV2ZWwgY2hhbmdlcyBhbmQgZm9yd2FyZCB0aGVtIHRvIHRoZSBNQ1Agc2VydmVyXG5cdFx0dGhpcy5fcmVnaXN0ZXIobG9nZ2VyLm9uRGlkQ2hhbmdlTG9nTGV2ZWwoKGxvZ0xldmVsKSA9PiB7XG5cdFx0XHR0aGlzLl9zZW5kTG9nTGV2ZWxUb1NlcnZlcihsb2dMZXZlbCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSBjbGllbnQgcmVxdWVzdCB0byB0aGUgc2VydmVyIGFuZCByZXR1cm4gdGhlIHJlc3BvbnNlLlxuXHQgKlxuXHQgKiBAcGFyYW0gcmVxdWVzdCBUaGUgcmVxdWVzdCB0byBzZW5kXG5cdCAqIEBwYXJhbSB0b2tlbiBDYW5jZWxsYXRpb24gdG9rZW5cblx0ICogQHBhcmFtIHRpbWVvdXRNcyBPcHRpb25hbCB0aW1lb3V0IGluIG1pbGxpc2Vjb25kc1xuXHQgKiBAcmV0dXJucyBBIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIHRoZSByZXNwb25zZVxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBzZW5kUmVxdWVzdDxUIGV4dGVuZHMgTUNQLkNsaWVudFJlcXVlc3QsIFIgZXh0ZW5kcyBNQ1AuU2VydmVyUmVzdWx0Pihcblx0XHRyZXF1ZXN0OiBQaWNrPFQsICdwYXJhbXMnIHwgJ21ldGhvZCc+LFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0KTogUHJvbWlzZTxSPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3JwYy5zZW5kUmVxdWVzdDxSPihcblx0XHRcdHJlcXVlc3QsXG5cdFx0XHR0b2tlbixcblx0XHRcdGlkID0+IHRoaXMuc2VuZE5vdGlmaWNhdGlvbih7IG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvY2FuY2VsbGVkJywgcGFyYW1zOiB7IHJlcXVlc3RJZDogaWQgfSB9KVxuXHRcdCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgSnNvblJwY0Vycm9yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBNcGNSZXNwb25zZUVycm9yKGVycm9yLm1lc3NhZ2UsIGVycm9yLmNvZGUsIGVycm9yLmRhdGEpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNlbmQobWNwOiBNQ1AuSlNPTlJQQ01lc3NhZ2UpIHtcblx0XHRpZiAoY2FuTG9nKHRoaXMubG9nZ2VyLmdldExldmVsKCksIHRoaXMuX3JlcXVlc3RMb2dMZXZlbCkpIHsgLy8gYXZvaWQgYnVpbGRpbmcgdGhlIHN0cmluZyBpZiB3ZSBkb24ndCBuZWVkIHRvXG5cdFx0XHRsb2codGhpcy5sb2dnZXIsIHRoaXMuX3JlcXVlc3RMb2dMZXZlbCwgYFtlZGl0b3IgLT4gc2VydmVyXSAke0pTT04uc3RyaW5naWZ5KG1jcCl9YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGF1bmNoLnNlbmQobWNwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHBhZ2luYXRlZCByZXF1ZXN0cyBieSBtYWtpbmcgbXVsdGlwbGUgcmVxdWVzdHMgdW50aWwgYWxsIGl0ZW1zIGFyZSByZXRyaWV2ZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBtZXRob2QgVGhlIG1ldGhvZCBuYW1lIHRvIGNhbGxcblx0ICogQHBhcmFtIGdldEl0ZW1zIEZ1bmN0aW9uIHRvIGV4dHJhY3QgdGhlIGFycmF5IG9mIGl0ZW1zIGZyb20gYSByZXN1bHRcblx0ICogQHBhcmFtIGluaXRpYWxQYXJhbXMgSW5pdGlhbCBwYXJhbWV0ZXJzXG5cdCAqIEBwYXJhbSB0b2tlbiBDYW5jZWxsYXRpb24gdG9rZW5cblx0ICogQHJldHVybnMgUHJvbWlzZSB3aXRoIGFsbCBpdGVtcyBjb21iaW5lZFxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyAqc2VuZFJlcXVlc3RQYWdpbmF0ZWQ8VCBleHRlbmRzIE1DUC5QYWdpbmF0ZWRSZXF1ZXN0ICYgTUNQLkNsaWVudFJlcXVlc3QsIFIgZXh0ZW5kcyBNQ1AuUGFnaW5hdGVkUmVzdWx0LCBJPihtZXRob2Q6IFRbJ21ldGhvZCddLCBnZXRJdGVtczogKHJlc3VsdDogUikgPT4gSVtdLCBpbml0aWFsUGFyYW1zPzogT21pdDxUWydwYXJhbXMnXSwgJ2pzb25ycGMnIHwgJ2lkJz4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBBc3luY0l0ZXJhYmxlPElbXT4ge1xuXHRcdGxldCBuZXh0Q3Vyc29yOiBNQ1AuQ3Vyc29yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0ZG8ge1xuXHRcdFx0Y29uc3QgcGFyYW1zOiBUWydwYXJhbXMnXSA9IHtcblx0XHRcdFx0Li4uaW5pdGlhbFBhcmFtcyxcblx0XHRcdFx0Y3Vyc29yOiBuZXh0Q3Vyc29yXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IFIgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0PFQsIFI+KHsgbWV0aG9kLCBwYXJhbXMgfSwgdG9rZW4pO1xuXHRcdFx0eWllbGQgZ2V0SXRlbXMocmVzdWx0KTtcblx0XHRcdG5leHRDdXJzb3IgPSByZXN1bHQubmV4dEN1cnNvcjtcblx0XHR9IHdoaWxlIChuZXh0Q3Vyc29yICE9PSB1bmRlZmluZWQgJiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKTtcblx0fVxuXG5cdHByaXZhdGUgc2VuZE5vdGlmaWNhdGlvbjxOIGV4dGVuZHMgTUNQLkNsaWVudE5vdGlmaWNhdGlvbj4obm90aWZpY2F0aW9uOiBPbWl0PE4sICdqc29ucnBjJz4pOiB2b2lkIHtcblx0XHR0aGlzLnNlbmQoeyAuLi5ub3RpZmljYXRpb24sIGpzb25ycGM6IE1DUC5KU09OUlBDX1ZFUlNJT04gfSk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlIGluY29taW5nIHNlcnZlciByZXF1ZXN0c1xuXHQgKi9cblx0cHJpdmF0ZSBoYW5kbGVTZXJ2ZXJSZXF1ZXN0KHJlcXVlc3Q6IE1DUC5KU09OUlBDUmVxdWVzdCAmIE1DUC5TZXJ2ZXJSZXF1ZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBNQ1AuUmVzdWx0IHwgUHJvbWlzZTxNQ1AuUmVzdWx0PiB7XG5cdFx0Y29uc3QgbWFwRXJyb3IgPSAoZXJyb3I6IHVua25vd24pOiBKc29uUnBjRXJyb3IgPT4ge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgTWNwRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBKc29uUnBjRXJyb3IoZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZXJyb3IuZGF0YSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGBFcnJvciBoYW5kbGluZyByZXF1ZXN0ICR7cmVxdWVzdC5tZXRob2R9OmAsIGVycm9yKTtcblx0XHRcdGNvbnN0IG1jcEVycm9yID0gTWNwRXJyb3IudW5rbm93bihlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSkpO1xuXHRcdFx0cmV0dXJuIG5ldyBKc29uUnBjRXJyb3IobWNwRXJyb3IuY29kZSwgbWNwRXJyb3IubWVzc2FnZSwgbWNwRXJyb3IuZGF0YSk7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRsZXQgcmVzdWx0OiBNQ1AuUmVzdWx0IHwgUHJvbWlzZTxNQ1AuUmVzdWx0Pjtcblx0XHRcdGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ3BpbmcnKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuaGFuZGxlUGluZyhyZXF1ZXN0KTtcblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5tZXRob2QgPT09ICdyb290cy9saXN0Jykge1xuXHRcdFx0XHRyZXN1bHQgPSB0aGlzLmhhbmRsZVJvb3RzTGlzdChyZXF1ZXN0KTtcblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5tZXRob2QgPT09ICdzYW1wbGluZy9jcmVhdGVNZXNzYWdlJyAmJiB0aGlzLl9jcmVhdGVNZXNzYWdlUmVxdWVzdEhhbmRsZXIpIHtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhIHRhc2stYXVnbWVudGVkIHJlcXVlc3Rcblx0XHRcdFx0aWYgKHJlcXVlc3QucGFyYW1zLnRhc2spIHtcblx0XHRcdFx0XHRjb25zdCB0YXNrUmVzdWx0ID0gdGhpcy5fdGFza01hbmFnZXIuY3JlYXRlVGFzayhcblx0XHRcdFx0XHRcdHJlcXVlc3QucGFyYW1zLnRhc2sudHRsID8/IG51bGwsXG5cdFx0XHRcdFx0XHQodG9rZW4pID0+IHRoaXMuX2NyZWF0ZU1lc3NhZ2VSZXF1ZXN0SGFuZGxlciEocmVxdWVzdC5wYXJhbXMsIHRva2VuKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0dGFza1Jlc3VsdC5fbWV0YSA/Pz0ge307XG5cdFx0XHRcdFx0dGFza1Jlc3VsdC5fbWV0YVsnaW8ubW9kZWxjb250ZXh0cHJvdG9jb2wvcmVsYXRlZC10YXNrJ10gPSB7IHRhc2tJZDogdGFza1Jlc3VsdC50YXNrLnRhc2tJZCB9O1xuXHRcdFx0XHRcdHJlc3VsdCA9IHRhc2tSZXN1bHQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gdGhpcy5fY3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyKHJlcXVlc3QucGFyYW1zLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5tZXRob2QgPT09ICdlbGljaXRhdGlvbi9jcmVhdGUnICYmIHRoaXMuX2VsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXIpIHtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyBhIHRhc2stYXVnbWVudGVkIHJlcXVlc3Rcblx0XHRcdFx0aWYgKHJlcXVlc3QucGFyYW1zLnRhc2spIHtcblx0XHRcdFx0XHRjb25zdCB0YXNrUmVzdWx0ID0gdGhpcy5fdGFza01hbmFnZXIuY3JlYXRlVGFzayhcblx0XHRcdFx0XHRcdHJlcXVlc3QucGFyYW1zLnRhc2sudHRsID8/IG51bGwsXG5cdFx0XHRcdFx0XHQodG9rZW4pID0+IHRoaXMuX2VsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXIhKHJlcXVlc3QucGFyYW1zLCB0b2tlbilcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHRhc2tSZXN1bHQuX21ldGEgPz89IHt9O1xuXHRcdFx0XHRcdHRhc2tSZXN1bHQuX21ldGFbJ2lvLm1vZGVsY29udGV4dHByb3RvY29sL3JlbGF0ZWQtdGFzayddID0geyB0YXNrSWQ6IHRhc2tSZXN1bHQudGFzay50YXNrSWQgfTtcblx0XHRcdFx0XHRyZXN1bHQgPSB0YXNrUmVzdWx0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdCA9IHRoaXMuX2VsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXIocmVxdWVzdC5wYXJhbXMsIHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ3Rhc2tzL2dldCcpIHtcblx0XHRcdFx0cmVzdWx0ID0gdGhpcy5fdGFza01hbmFnZXIuZ2V0VGFzayhyZXF1ZXN0LnBhcmFtcy50YXNrSWQpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ3Rhc2tzL3Jlc3VsdCcpIHtcblx0XHRcdFx0cmVzdWx0ID0gdGhpcy5fdGFza01hbmFnZXIuZ2V0VGFza1Jlc3VsdChyZXF1ZXN0LnBhcmFtcy50YXNrSWQpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ3Rhc2tzL2NhbmNlbCcpIHtcblx0XHRcdFx0cmVzdWx0ID0gdGhpcy5fdGFza01hbmFnZXIuY2FuY2VsVGFzayhyZXF1ZXN0LnBhcmFtcy50YXNrSWQpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ3Rhc2tzL2xpc3QnKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuX3Rhc2tNYW5hZ2VyLmxpc3RUYXNrcygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgTWNwRXJyb3IubWV0aG9kTm90Rm91bmQocmVxdWVzdC5tZXRob2QpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNUaGVuYWJsZShyZXN1bHQpKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQudGhlbih1bmRlZmluZWQsIChlcnJvcjogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdHRocm93IG1hcEVycm9yKGVycm9yKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3cgbWFwRXJyb3IoZSk7XG5cdFx0fVxuXHR9XG5cdC8qKlxuXHQgKiBIYW5kbGUgaW5jb21pbmcgc2VydmVyIG5vdGlmaWNhdGlvbnNcblx0ICovXG5cdHByaXZhdGUgaGFuZGxlU2VydmVyTm90aWZpY2F0aW9uKHJlcXVlc3Q6IE1DUC5KU09OUlBDTm90aWZpY2F0aW9uICYgTUNQLlNlcnZlck5vdGlmaWNhdGlvbik6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHRzd2l0Y2ggKHJlcXVlc3QubWV0aG9kKSB7XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvbWVzc2FnZSc6XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaGFuZGxlTG9nZ2luZ05vdGlmaWNhdGlvbihyZXF1ZXN0KTtcblx0XHRcdFx0Y2FzZSAnbm90aWZpY2F0aW9ucy9jYW5jZWxsZWQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVjZWl2ZUNhbmNlbGxlZE5vdGlmaWNhdGlvbi5maXJlKHJlcXVlc3QpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmhhbmRsZUNhbmNlbGxlZE5vdGlmaWNhdGlvbihyZXF1ZXN0KTtcblx0XHRcdFx0Y2FzZSAnbm90aWZpY2F0aW9ucy9wcm9ncmVzcyc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZWNlaXZlUHJvZ3Jlc3NOb3RpZmljYXRpb24uZmlyZShyZXF1ZXN0KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL2xpc3RfY2hhbmdlZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXNvdXJjZUxpc3QuZmlyZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSAnbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvdXBkYXRlZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRVcGRhdGVSZXNvdXJjZS5maXJlKHJlcXVlc3QpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSAnbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVG9vbExpc3QuZmlyZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSAnbm90aWZpY2F0aW9ucy9wcm9tcHRzL2xpc3RfY2hhbmdlZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9tcHRMaXN0LmZpcmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvZWxpY2l0YXRpb24vY29tcGxldGUnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVjZWl2ZUVsaWNpdGF0aW9uQ29tcGxldGVOb3RpZmljYXRpb24uZmlyZShyZXF1ZXN0KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvdGFza3Mvc3RhdHVzJzpcblx0XHRcdFx0XHR0aGlzLl90YXNrTWFuYWdlci5nZXRDbGllbnRUYXNrKHJlcXVlc3QucGFyYW1zLnRhc2tJZCk/Lm9uRGlkVXBkYXRlU3RhdGUocmVxdWVzdC5wYXJhbXMpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRzb2Z0QXNzZXJ0TmV2ZXIocmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGBFcnJvciBoYW5kbGluZyBub3RpZmljYXRpb24gJHtyZXF1ZXN0Lm1ldGhvZH06YCwgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQ2FuY2VsbGVkTm90aWZpY2F0aW9uKHJlcXVlc3Q6IE1DUC5DYW5jZWxsZWROb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHRpZiAocmVxdWVzdC5wYXJhbXMucmVxdWVzdElkKSB7XG5cdFx0XHR0aGlzLl9ycGMuY2FuY2VsUGVuZGluZ1JlcXVlc3QocmVxdWVzdC5wYXJhbXMucmVxdWVzdElkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUxvZ2dpbmdOb3RpZmljYXRpb24ocmVxdWVzdDogTUNQLkxvZ2dpbmdNZXNzYWdlTm90aWZpY2F0aW9uKTogdm9pZCB7XG5cdFx0dHJhbnNsYXRlTWNwTG9nTWVzc2FnZSh0aGlzLmxvZ2dlciwgcmVxdWVzdC5wYXJhbXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSByZXNwb25zZSB0byBhIHBpbmcgcmVxdWVzdFxuXHQgKi9cblx0cHJpdmF0ZSBoYW5kbGVQaW5nKF9yZXF1ZXN0OiBNQ1AuUGluZ1JlcXVlc3QpOiB7fSB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSByZXNwb25zZSB0byBhIHJvb3RzL2xpc3QgcmVxdWVzdFxuXHQgKi9cblx0cHJpdmF0ZSBoYW5kbGVSb290c0xpc3QoX3JlcXVlc3Q6IE1DUC5MaXN0Um9vdHNSZXF1ZXN0KTogTUNQLkxpc3RSb290c1Jlc3VsdCB7XG5cdFx0dGhpcy5faGFzQW5ub3VuY2VkUm9vdHMgPSB0cnVlO1xuXHRcdHJldHVybiB7IHJvb3RzOiB0aGlzLl9yb290cyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5jZWxBbGxSZXF1ZXN0cygpIHtcblx0XHR0aGlzLl9ycGMuY2FuY2VsQWxsUmVxdWVzdHMoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FuY2VsQWxsUmVxdWVzdHMoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogRm9yd2FyZHMgbG9nIGxldmVsIGNoYW5nZXMgdG8gdGhlIE1DUCBzZXJ2ZXIgaWYgaXQgc3VwcG9ydHMgbG9nZ2luZ1xuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VuZExvZ0xldmVsVG9TZXJ2ZXIobG9nTGV2ZWw6IExvZ0xldmVsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIE9ubHkgc2VuZCBpZiB0aGUgc2VydmVyIHN1cHBvcnRzIGxvZ2dpbmcgY2FwYWJpbGl0aWVzXG5cdFx0XHRpZiAoIXRoaXMuY2FwYWJpbGl0aWVzLmxvZ2dpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnNldExldmVsKHsgbGV2ZWw6IG1hcExvZ0xldmVsVG9NY3AobG9nTGV2ZWwpIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHNldCBNQ1Agc2VydmVyIGxvZyBsZXZlbDogJHtlcnJvcn1gKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCBhbiBpbml0aWFsaXplIHJlcXVlc3Rcblx0ICovXG5cdGluaXRpYWxpemUocGFyYW1zOiBNQ1AuSW5pdGlhbGl6ZVJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuSW5pdGlhbGl6ZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0PE1DUC5Jbml0aWFsaXplUmVxdWVzdCwgTUNQLkluaXRpYWxpemVSZXN1bHQ+KHsgbWV0aG9kOiAnaW5pdGlhbGl6ZScsIHBhcmFtcyB9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogTGlzdCBhdmFpbGFibGUgcmVzb3VyY2VzXG5cdCAqL1xuXHRsaXN0UmVzb3VyY2VzKHBhcmFtcz86IE1DUC5MaXN0UmVzb3VyY2VzUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5SZXNvdXJjZVtdPiB7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLmFzeW5jVG9BcnJheUZsYXQodGhpcy5saXN0UmVzb3VyY2VzSXRlcmFibGUocGFyYW1zLCB0b2tlbikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgYXZhaWxhYmxlIHJlc291cmNlcyAoaXRlcmFibGUpXG5cdCAqL1xuXHRsaXN0UmVzb3VyY2VzSXRlcmFibGUocGFyYW1zPzogTUNQLkxpc3RSZXNvdXJjZXNSZXF1ZXN0WydwYXJhbXMnXSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IEFzeW5jSXRlcmFibGU8TUNQLlJlc291cmNlW10+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdFBhZ2luYXRlZDxNQ1AuTGlzdFJlc291cmNlc1JlcXVlc3QsIE1DUC5MaXN0UmVzb3VyY2VzUmVzdWx0LCBNQ1AuUmVzb3VyY2U+KCdyZXNvdXJjZXMvbGlzdCcsIHJlc3VsdCA9PiByZXN1bHQucmVzb3VyY2VzLCBwYXJhbXMsIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkIGEgc3BlY2lmaWMgcmVzb3VyY2Vcblx0ICovXG5cdHJlYWRSZXNvdXJjZShwYXJhbXM6IE1DUC5SZWFkUmVzb3VyY2VSZXF1ZXN0WydwYXJhbXMnXSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLlJlYWRSZXNvdXJjZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0PE1DUC5SZWFkUmVzb3VyY2VSZXF1ZXN0LCBNQ1AuUmVhZFJlc291cmNlUmVzdWx0Pih7IG1ldGhvZDogJ3Jlc291cmNlcy9yZWFkJywgcGFyYW1zIH0sIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0IGF2YWlsYWJsZSByZXNvdXJjZSB0ZW1wbGF0ZXNcblx0ICovXG5cdGxpc3RSZXNvdXJjZVRlbXBsYXRlcyhwYXJhbXM/OiBNQ1AuTGlzdFJlc291cmNlVGVtcGxhdGVzUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5SZXNvdXJjZVRlbXBsYXRlW10+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUuYXN5bmNUb0FycmF5RmxhdCh0aGlzLnNlbmRSZXF1ZXN0UGFnaW5hdGVkPE1DUC5MaXN0UmVzb3VyY2VUZW1wbGF0ZXNSZXF1ZXN0LCBNQ1AuTGlzdFJlc291cmNlVGVtcGxhdGVzUmVzdWx0LCBNQ1AuUmVzb3VyY2VUZW1wbGF0ZT4oJ3Jlc291cmNlcy90ZW1wbGF0ZXMvbGlzdCcsIHJlc3VsdCA9PiByZXN1bHQucmVzb3VyY2VUZW1wbGF0ZXMsIHBhcmFtcywgdG9rZW4pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdWJzY3JpYmUgdG8gcmVzb3VyY2UgdXBkYXRlc1xuXHQgKi9cblx0c3Vic2NyaWJlKHBhcmFtczogTUNQLlN1YnNjcmliZVJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuRW1wdHlSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxNQ1AuU3Vic2NyaWJlUmVxdWVzdCwgTUNQLkVtcHR5UmVzdWx0Pih7IG1ldGhvZDogJ3Jlc291cmNlcy9zdWJzY3JpYmUnLCBwYXJhbXMgfSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVuc3Vic2NyaWJlIGZyb20gcmVzb3VyY2UgdXBkYXRlc1xuXHQgKi9cblx0dW5zdWJzY3JpYmUocGFyYW1zOiBNQ1AuVW5zdWJzY3JpYmVSZXF1ZXN0WydwYXJhbXMnXSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkVtcHR5UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8TUNQLlVuc3Vic2NyaWJlUmVxdWVzdCwgTUNQLkVtcHR5UmVzdWx0Pih7IG1ldGhvZDogJ3Jlc291cmNlcy91bnN1YnNjcmliZScsIHBhcmFtcyB9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogTGlzdCBhdmFpbGFibGUgcHJvbXB0c1xuXHQgKi9cblx0bGlzdFByb21wdHMocGFyYW1zPzogTUNQLkxpc3RQcm9tcHRzUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5Qcm9tcHRbXT4ge1xuXHRcdHJldHVybiBJdGVyYWJsZS5hc3luY1RvQXJyYXlGbGF0KHRoaXMuc2VuZFJlcXVlc3RQYWdpbmF0ZWQ8TUNQLkxpc3RQcm9tcHRzUmVxdWVzdCwgTUNQLkxpc3RQcm9tcHRzUmVzdWx0LCBNQ1AuUHJvbXB0PigncHJvbXB0cy9saXN0JywgcmVzdWx0ID0+IHJlc3VsdC5wcm9tcHRzLCBwYXJhbXMsIHRva2VuKSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGEgc3BlY2lmaWMgcHJvbXB0XG5cdCAqL1xuXHRnZXRQcm9tcHQocGFyYW1zOiBNQ1AuR2V0UHJvbXB0UmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5HZXRQcm9tcHRSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxNQ1AuR2V0UHJvbXB0UmVxdWVzdCwgTUNQLkdldFByb21wdFJlc3VsdD4oeyBtZXRob2Q6ICdwcm9tcHRzL2dldCcsIHBhcmFtcyB9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogTGlzdCBhdmFpbGFibGUgdG9vbHNcblx0ICovXG5cdGxpc3RUb29scyhwYXJhbXM/OiBNQ1AuTGlzdFRvb2xzUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5Ub29sW10+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUuYXN5bmNUb0FycmF5RmxhdCh0aGlzLnNlbmRSZXF1ZXN0UGFnaW5hdGVkPE1DUC5MaXN0VG9vbHNSZXF1ZXN0LCBNQ1AuTGlzdFRvb2xzUmVzdWx0LCBNQ1AuVG9vbD4oJ3Rvb2xzL2xpc3QnLCByZXN1bHQgPT4gcmVzdWx0LnRvb2xzLCBwYXJhbXMsIHRva2VuKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbCBhIHNwZWNpZmljIHRvb2wuIFN1cHBvcnRzIHRhc2tzIGF1dG9tYXRpY2FsbHkgaWYgYHRhc2tgIGlzIHNldCBvbiB0aGUgcmVxdWVzdC5cblx0ICovXG5cdGFzeW5jIGNhbGxUb29sKHBhcmFtczogTUNQLkNhbGxUb29sUmVxdWVzdFsncGFyYW1zJ10gJiBNQ1AuUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4sIG9uU3RhdHVzTWVzc2FnZT86IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQpOiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdDxNQ1AuQ2FsbFRvb2xSZXF1ZXN0LCBNQ1AuQ2FsbFRvb2xSZXN1bHQgfCBNQ1AuQ3JlYXRlVGFza1Jlc3VsdD4oeyBtZXRob2Q6ICd0b29scy9jYWxsJywgcGFyYW1zIH0sIHRva2VuKTtcblxuXHRcdGlmIChpc1Rhc2tSZXN1bHQocmVzcG9uc2UpKSB7XG5cdFx0XHRjb25zdCB0YXNrID0gbmV3IE1jcFRhc2s8TUNQLkNhbGxUb29sUmVzdWx0PihyZXNwb25zZS50YXNrLCB0b2tlbiwgb25TdGF0dXNNZXNzYWdlKTtcblx0XHRcdHRoaXMuX3Rhc2tNYW5hZ2VyLmFkb3B0Q2xpZW50VGFzayh0YXNrKTtcblx0XHRcdHRhc2suc2V0SGFuZGxlcih0aGlzKTtcblx0XHRcdHJldHVybiB0YXNrLnJlc3VsdC5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdGFza01hbmFnZXIuYWJhbmRvbkNsaWVudFRhc2sodGFzay5pZCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGxvZ2dpbmcgbGV2ZWxcblx0ICovXG5cdHNldExldmVsKHBhcmFtczogTUNQLlNldExldmVsUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5FbXB0eVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0PE1DUC5TZXRMZXZlbFJlcXVlc3QsIE1DUC5FbXB0eVJlc3VsdD4oeyBtZXRob2Q6ICdsb2dnaW5nL3NldExldmVsJywgcGFyYW1zIH0sIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIGNvbXBsZXRpb25zIGZvciBhbiBhcmd1bWVudFxuXHQgKi9cblx0Y29tcGxldGUocGFyYW1zOiBNQ1AuQ29tcGxldGVSZXF1ZXN0WydwYXJhbXMnXSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNvbXBsZXRlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8TUNQLkNvbXBsZXRlUmVxdWVzdCwgTUNQLkNvbXBsZXRlUmVzdWx0Pih7IG1ldGhvZDogJ2NvbXBsZXRpb24vY29tcGxldGUnLCBwYXJhbXMgfSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0YXNrIHN0YXR1c1xuXHQgKi9cblx0Z2V0VGFzayhwYXJhbXM6IHsgdGFza0lkOiBzdHJpbmcgfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkdldFRhc2tSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxNQ1AuR2V0VGFza1JlcXVlc3QsIE1DUC5HZXRUYXNrUmVzdWx0Pih7IG1ldGhvZDogJ3Rhc2tzL2dldCcsIHBhcmFtcyB9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRhc2sgcmVzdWx0XG5cdCAqL1xuXHRnZXRUYXNrUmVzdWx0KHBhcmFtczogeyB0YXNrSWQ6IHN0cmluZyB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuR2V0VGFza1BheWxvYWRSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxNQ1AuR2V0VGFza1BheWxvYWRSZXF1ZXN0LCBNQ1AuR2V0VGFza1BheWxvYWRSZXN1bHQ+KHsgbWV0aG9kOiAndGFza3MvcmVzdWx0JywgcGFyYW1zIH0sIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgYSB0YXNrXG5cdCAqL1xuXHRjYW5jZWxUYXNrKHBhcmFtczogeyB0YXNrSWQ6IHN0cmluZyB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuQ2FuY2VsVGFza1Jlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0PE1DUC5DYW5jZWxUYXNrUmVxdWVzdCwgTUNQLkNhbmNlbFRhc2tSZXN1bHQ+KHsgbWV0aG9kOiAndGFza3MvY2FuY2VsJywgcGFyYW1zIH0sIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0IGFsbCB0YXNrc1xuXHQgKi9cblx0bGlzdFRhc2tzKHBhcmFtcz86IE1DUC5MaXN0VGFza3NSZXF1ZXN0WydwYXJhbXMnXSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLlRhc2tbXT4ge1xuXHRcdHJldHVybiBJdGVyYWJsZS5hc3luY1RvQXJyYXlGbGF0KFxuXHRcdFx0dGhpcy5zZW5kUmVxdWVzdFBhZ2luYXRlZDxNQ1AuTGlzdFRhc2tzUmVxdWVzdCwgTUNQLkxpc3RUYXNrc1Jlc3VsdCwgTUNQLlRhc2s+KFxuXHRcdFx0XHQndGFza3MvbGlzdCcsIHJlc3VsdCA9PiByZXN1bHQudGFza3MsIHBhcmFtcywgdG9rZW5cblx0XHRcdClcblx0XHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzVGFza0luVGVybWluYWxTdGF0ZSh0YXNrOiBNQ1AuVGFzayk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdGFzay5zdGF0dXMgPT09ICdjb21wbGV0ZWQnIHx8IHRhc2suc3RhdHVzID09PSAnZmFpbGVkJyB8fCB0YXNrLnN0YXR1cyA9PT0gJ2NhbmNlbGxlZCc7XG59XG5cbi8qKlxuICogSW1wbGVtZW50YXRpb24gb2YgYSB0YXNrIHRoYXQgaGFuZGxlcyBwb2xsaW5nLCBzdGF0dXMgbm90aWZpY2F0aW9ucywgYW5kIGhhbmRsZXIgcmVjb25uZWN0aW9ucy4gSXQgaW1wbGVtZW50cyB0aGUgdGFzayBwb2xsaW5nIGxvb3AgaW50ZXJuYWxseSBhbmQgY2FuIGFsc28gYmVcbiAqIHVwZGF0ZWQgZXh0ZXJuYWxseSB2aWEgYG9uRGlkVXBkYXRlU3RhdGVgLCB3aGVuIG5vdGlmaWNhdGlvbnMgYXJlIHJlY2VpdmVkXG4gKiBmb3IgZXhhbXBsZS5cbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgY2xhc3MgTWNwVGFzazxUIGV4dGVuZHMgTUNQLlJlc3VsdD4gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcFRhc2tJbnRlcm5hbCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8VD4oKTtcblxuXHRwdWJsaWMgZ2V0IHJlc3VsdCgpOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm9taXNlLnA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlkKCkge1xuXHRcdHJldHVybiB0aGlzLl90YXNrLnRhc2tJZDtcblx0fVxuXG5cdHByaXZhdGUgX2xhc3RUYXNrU3RhdGU6IElTZXR0YWJsZU9ic2VydmFibGU8TUNQLlRhc2s+O1xuXHRwcml2YXRlIF9oYW5kbGVyID0gb2JzZXJ2YWJsZVZhbHVlPE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyIHwgdW5kZWZpbmVkPignbWNwVGFza0hhbmRsZXInLCB1bmRlZmluZWQpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rhc2s6IE1DUC5UYXNrLFxuXHRcdF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uU3RhdHVzTWVzc2FnZT86IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBleHBpcmVzQXQgPSBfdGFzay50dGwgPyAoRGF0ZS5ub3coKSArIF90YXNrLnR0bCkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbGFzdFRhc2tTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSgnbGFzdFRhc2tTdGF0ZScsIHRoaXMuX3Rhc2spO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0Ly8gSGFuZGxlIGV4dGVybmFsIGNhbmNlbGxhdGlvbiB0b2tlblxuXHRcdGlmIChfdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuX2xhc3RUYXNrU3RhdGUuc2V0KHsgLi4udGhpcy5fdGFzaywgc3RhdHVzOiAnY2FuY2VsbGVkJyB9LCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdG9yZS5hZGQoX3Rva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2xhc3RUYXNrU3RhdGUuZ2V0KCk7XG5cdFx0XHRcdGlmICghaXNUYXNrSW5UZXJtaW5hbFN0YXRlKGN1cnJlbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGFzdFRhc2tTdGF0ZS5zZXQoeyAuLi5jdXJyZW50LCBzdGF0dXM6ICdjYW5jZWxsZWQnIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgVFRMIGV4cGlyYXRpb24gd2l0aCBhbiBleHBsaWNpdCB0aW1lb3V0XG5cdFx0aWYgKGV4cGlyZXNBdCkge1xuXHRcdFx0Y29uc3QgdHRsVGltZW91dCA9IGV4cGlyZXNBdCAtIERhdGUubm93KCk7XG5cdFx0XHRpZiAodHRsVGltZW91dCA8PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RUYXNrU3RhdGUuc2V0KHsgLi4udGhpcy5fdGFzaywgc3RhdHVzOiAnY2FuY2VsbGVkJywgc3RhdHVzTWVzc2FnZTogJ1Rhc2sgdGltZWQgb3V0LicgfSwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2xhc3RUYXNrU3RhdGUuZ2V0KCk7XG5cdFx0XHRcdFx0aWYgKCFpc1Rhc2tJblRlcm1pbmFsU3RhdGUoY3VycmVudCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xhc3RUYXNrU3RhdGUuc2V0KHsgLi4uY3VycmVudCwgc3RhdHVzOiAnY2FuY2VsbGVkJywgc3RhdHVzTWVzc2FnZTogJ1Rhc2sgdGltZWQgb3V0LicgfSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHR0bFRpbWVvdXQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBIGB0YXNrcy9yZXN1bHRgIGNhbGwgdHJpZ2dlcmVkIGJ5IGFuIGlucHV0X3JlcXVpcmVkIHN0YXRlLlxuXHRcdGNvbnN0IGlucHV0UmVxdWlyZWRMb29rdXAgPSBvYnNlcnZhYmxlVmFsdWU8T2JzZXJ2YWJsZVByb21pc2U8TUNQLlRhc2s+IHwgdW5kZWZpbmVkPignYWN0aXZlUmVzdWx0TG9va3VwJywgdW5kZWZpbmVkKTtcblxuXHRcdC8vIDEuIFBvbGwgZm9yIHRhc2sgdXBkYXRlcyB3aGVuIHRoZSB0YXNrIGlzbid0IGluIGEgdGVybWluYWwgc3RhdGVcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2xhc3RUYXNrU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGlzVGFza0luVGVybWluYWxTdGF0ZShjdXJyZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdoZW4gYSB0YXNrIGdvZXMgaW50byB0aGUgaW5wdXRfcmVxdWlyZWQgc3RhdGUsIGJ5IHNwZWMgd2Ugc2hvdWxkIGNhbGxcblx0XHRcdC8vIGB0YXNrcy9yZXN1bHRgIHdoaWNoIGNhbiByZXR1cm4gYW4gU1NFIHN0cmVhbSBvZiB0YXNrIHVwZGF0ZXMuIE5vIG5lZWRcblx0XHRcdC8vIHRvIHBvbGwgd2hpbGUgc3VjaCBhIGxvb2t1cCBpcyBnb2luZyBvbiwgYnV0IG9uY2UgaXQgcmVzb2x2ZXMgd2Ugc2hvdWxkXG5cdFx0XHQvLyBjbGVhciBhbmQgdXBkYXRlIG91ciBzdGF0ZS5cblx0XHRcdGNvbnN0IGxvb2t1cCA9IGlucHV0UmVxdWlyZWRMb29rdXAucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGxvb2t1cCkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBsb29rdXAucHJvbWlzZVJlc3VsdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHJldHVybiB0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRcdC8vIHN0aWxsIG9uZ29pbmdcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHJlc3VsdC5kYXRhKSB7XG5cdFx0XHRcdFx0XHRpbnB1dFJlcXVpcmVkTG9va3VwLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHRcdFx0XHRcdHRoaXMuX2xhc3RUYXNrU3RhdGUuc2V0KHJlc3VsdC5kYXRhLCB0eCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlucHV0UmVxdWlyZWRMb29rdXAuc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdC5lcnJvciBpbnN0YW5jZW9mIE1jcEVycm9yICYmIHJlc3VsdC5lcnJvci5jb2RlID09PSBNQ1AuSU5WQUxJRF9QQVJBTVMpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbGFzdFRhc2tTdGF0ZS5zZXQoeyAuLi5jdXJyZW50LCBzdGF0dXM6ICdjYW5jZWxsZWQnIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBNYXliZSBhIGNvbm5lY3Rpb24gZXJyb3IgLS0gc3RhcnQgcG9sbGluZyBhZ2FpblxuXHRcdFx0XHRcdFx0XHR0aGlzLl9sYXN0VGFza1N0YXRlLnNldCh7IC4uLmN1cnJlbnQsIHN0YXR1czogJ3dvcmtpbmcnIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaGFuZGxlciA9IHRoaXMuX2hhbmRsZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcG9sbEludGVydmFsID0gX3Rhc2sucG9sbEludGVydmFsID8/IDIwMDA7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoX3Rva2VuKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0aGFuZGxlci5nZXRUYXNrKHsgdGFza0lkOiBjdXJyZW50LnRhc2tJZCB9LCBjdHMudG9rZW4pXG5cdFx0XHRcdFx0LmNhdGNoKChlKTogTUNQLlRhc2sgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBNY3BFcnJvciAmJiBlLmNvZGUgPT09IE1DUC5JTlZBTElEX1BBUkFNUykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyAuLi5jdXJyZW50LCBzdGF0dXM6ICdjYW5jZWxsZWQnIH07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyAuLi5jdXJyZW50IH07IC8vIGVycm9ycyBhcmUgYWxyZWFkeSBsb2dnZWQsIGtlZXAgaW4gY3VycmVudCBzdGF0ZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0LnRoZW4ociA9PiB7XG5cdFx0XHRcdFx0XHRpZiAociAmJiAhY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xhc3RUYXNrU3RhdGUuc2V0KHIsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9LCBwb2xsSW50ZXJ2YWwpKTtcblx0XHR9KSk7XG5cblx0XHQvLyAyLiBHZXQgdGhlIHJlc3VsdCBvbmNlIGl0J3MgYXZhaWxhYmxlIChvciBwcm9wYWdhdGUgZXJyb3JzKS4gVHJpZ2dlclxuXHRcdC8vIGlucHV0X3JlcXVpcmVkIGhhbmRsaW5nIGFzIG5lZWRlZC4gT25seSByZWFjdCB3aGVuIHRoZSBzdGF0dXMgaXRzZWxmIGNoYW5nZXMuXG5cdFx0Y29uc3QgbGFzdFN0YXR1cyA9IHRoaXMuX2xhc3RUYXNrU3RhdGUubWFwKHRhc2sgPT4gdGFzay5zdGF0dXMpO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSBsYXN0U3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChzdGF0dXMgPT09ICdmYWlsZWQnKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9sYXN0VGFza1N0YXRlLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5wcm9taXNlLmVycm9yKG5ldyBFcnJvcihgVGFzayAke2N1cnJlbnQudGFza0lkfSBmYWlsZWQ6ICR7Y3VycmVudC5zdGF0dXNNZXNzYWdlID8/ICd1bmtub3duIGVycm9yJ31gKSk7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH0gZWxzZSBpZiAoc3RhdHVzID09PSAnY2FuY2VsbGVkJykge1xuXHRcdFx0XHR0aGlzLnByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH0gZWxzZSBpZiAoc3RhdHVzID09PSAnaW5wdXRfcmVxdWlyZWQnKSB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKGhhbmRsZXIpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fbGFzdFRhc2tTdGF0ZS5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKF90b2tlbik7XG5cdFx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRcdFx0XHRpbnB1dFJlcXVpcmVkTG9va3VwLnNldChuZXcgT2JzZXJ2YWJsZVByb21pc2U8TUNQLlRhc2s+KGhhbmRsZXIuZ2V0VGFzayh7IHRhc2tJZDogY3VycmVudC50YXNrSWQgfSwgY3RzLnRva2VuKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoc3RhdHVzID09PSAnY29tcGxldGVkJykge1xuXHRcdFx0XHRjb25zdCBoYW5kbGVyID0gdGhpcy5faGFuZGxlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChoYW5kbGVyKSB7XG5cdFx0XHRcdFx0dGhpcy5wcm9taXNlLnNldHRsZVdpdGgoaGFuZGxlci5nZXRUYXNrUmVzdWx0KHsgdGFza0lkOiBfdGFzay50YXNrSWQgfSwgX3Rva2VuKSBhcyBQcm9taXNlPFQ+KTtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoc3RhdHVzID09PSAnd29ya2luZycpIHtcblx0XHRcdFx0Ly8gbm8tb3Bcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNvZnRBc3NlcnROZXZlcihzdGF0dXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG9uRGlkVXBkYXRlU3RhdGUodGFzazogTUNQLlRhc2spIHtcblx0XHR0aGlzLl9sYXN0VGFza1N0YXRlLnNldCh0YXNrLCB1bmRlZmluZWQpO1xuXHRcdGlmICh0YXNrLnN0YXR1c01lc3NhZ2UgJiYgdGhpcy5fb25TdGF0dXNNZXNzYWdlKSB7XG5cdFx0XHR0aGlzLl9vblN0YXR1c01lc3NhZ2UodGFzay5zdGF0dXNNZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRzZXRIYW5kbGVyKGhhbmRsZXI6IE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5faGFuZGxlci5zZXQoaGFuZGxlciwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG4vKipcbiAqIE1hcHMgVlNDb2RlIExvZ0xldmVsIHRvIE1DUCBMb2dnaW5nTGV2ZWxcbiAqL1xuZnVuY3Rpb24gbWFwTG9nTGV2ZWxUb01jcChsb2dMZXZlbDogTG9nTGV2ZWwpOiBNQ1AuTG9nZ2luZ0xldmVsIHtcblx0c3dpdGNoIChsb2dMZXZlbCkge1xuXHRcdGNhc2UgTG9nTGV2ZWwuVHJhY2U6XG5cdFx0XHRyZXR1cm4gJ2RlYnVnJzsgLy8gTUNQIGRvZXNuJ3QgaGF2ZSB0cmFjZSwgdXNlIGRlYnVnXG5cdFx0Y2FzZSBMb2dMZXZlbC5EZWJ1Zzpcblx0XHRcdHJldHVybiAnZGVidWcnO1xuXHRcdGNhc2UgTG9nTGV2ZWwuSW5mbzpcblx0XHRcdHJldHVybiAnaW5mbyc7XG5cdFx0Y2FzZSBMb2dMZXZlbC5XYXJuaW5nOlxuXHRcdFx0cmV0dXJuICd3YXJuaW5nJztcblx0XHRjYXNlIExvZ0xldmVsLkVycm9yOlxuXHRcdFx0cmV0dXJuICdlcnJvcic7XG5cdFx0Y2FzZSBMb2dMZXZlbC5PZmY6XG5cdFx0XHRyZXR1cm4gJ2VtZXJnZW5jeSc7IC8vIE1DUCBkb2Vzbid0IGhhdmUgb2ZmLCB1c2UgZW1lcmdlbmN5XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBhc3NlcnROZXZlcihsb2dMZXZlbCk7IC8vIE9mZiBhbmQgb3RoZXIgbGV2ZWxzIGFyZSBub3Qgc3VwcG9ydGVkXG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWEsdUJBQXVCO0FBQzdDLFNBQVMsaUJBQWlCLG1CQUFtQixlQUFlLGtCQUFrQjtBQUM5RSxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYyx1QkFBdUI7QUFDOUMsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxTQUE4QixtQkFBbUIsaUJBQWlCLG1CQUFtQjtBQUU5RixTQUFTLFFBQWlCLEtBQUssZ0JBQWdCO0FBQy9DLFNB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
