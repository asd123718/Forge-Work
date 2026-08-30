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
import * as nls from "../../../../nls.js";
import { Emitter } from "../../../../base/common/event.js";
import * as objects from "../../../../base/common/objects.js";
import { toAction } from "../../../../base/common/actions.js";
import * as errors from "../../../../base/common/errors.js";
import { createErrorWithActions } from "../../../../base/common/errorMessage.js";
import { formatPII, isUriString } from "../common/debugUtils.js";
import { IExtensionHostDebugService } from "../../../../platform/debug/common/extensionHostDebug.js";
import { URI } from "../../../../base/common/uri.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { Schemas } from "../../../../base/common/network.js";
let RawDebugSession = class {
  constructor(debugAdapter, dbgr, sessionId, name, extensionHostDebugService, openerService, notificationService, dialogSerivce) {
    this.dbgr = dbgr;
    this.sessionId = sessionId;
    this.name = name;
    this.extensionHostDebugService = extensionHostDebugService;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this.dialogSerivce = dialogSerivce;
    this.allThreadsContinued = true;
    this._readyForBreakpoints = false;
    // shutdown
    this.debugAdapterStopped = false;
    this.inShutdown = false;
    this.terminated = false;
    this.firedAdapterExitEvent = false;
    // telemetry
    this.startTime = 0;
    this.didReceiveStoppedEvent = false;
    this.toDispose = new DisposableStore();
    // DAP events
    this._onDidInitialize = this.toDispose.add(new Emitter());
    this._onDidStop = this.toDispose.add(new Emitter());
    this._onDidContinued = this.toDispose.add(new Emitter());
    this._onDidTerminateDebugee = this.toDispose.add(new Emitter());
    this._onDidExitDebugee = this.toDispose.add(new Emitter());
    this._onDidThread = this.toDispose.add(new Emitter());
    this._onDidOutput = this.toDispose.add(new Emitter());
    this._onDidBreakpoint = this.toDispose.add(new Emitter());
    this._onDidLoadedSource = this.toDispose.add(new Emitter());
    this._onDidProgressStart = this.toDispose.add(new Emitter());
    this._onDidProgressUpdate = this.toDispose.add(new Emitter());
    this._onDidProgressEnd = this.toDispose.add(new Emitter());
    this._onDidInvalidated = this.toDispose.add(new Emitter());
    this._onDidInvalidateMemory = this.toDispose.add(new Emitter());
    this._onDidCustomEvent = this.toDispose.add(new Emitter());
    this._onDidEvent = this.toDispose.add(new Emitter());
    // DA events
    this._onDidExitAdapter = this.toDispose.add(new Emitter());
    this.stoppedSinceLastStep = false;
    this.debugAdapter = debugAdapter;
    this._capabilities = /* @__PURE__ */ Object.create(null);
    this.toDispose.add(this.debugAdapter.onError((err) => {
      this.shutdown(err);
    }));
    this.toDispose.add(this.debugAdapter.onExit((code) => {
      if (code !== 0) {
        this.shutdown(new Error(`exit code: ${code}`));
      } else {
        this.shutdown();
      }
    }));
    this.debugAdapter.onEvent((event) => {
      switch (event.event) {
        case "initialized":
          this._readyForBreakpoints = true;
          this._onDidInitialize.fire(event);
          break;
        case "loadedSource":
          this._onDidLoadedSource.fire(event);
          break;
        case "capabilities":
          if (event.body) {
            const capabilities = event.body.capabilities;
            this.mergeCapabilities(capabilities);
          }
          break;
        case "stopped":
          this.didReceiveStoppedEvent = true;
          this.stoppedSinceLastStep = true;
          this._onDidStop.fire(event);
          break;
        case "continued":
          this.allThreadsContinued = event.body.allThreadsContinued === false ? false : true;
          this._onDidContinued.fire(event);
          break;
        case "thread":
          this._onDidThread.fire(event);
          break;
        case "output":
          this._onDidOutput.fire(event);
          break;
        case "breakpoint":
          this._onDidBreakpoint.fire(event);
          break;
        case "terminated":
          this._onDidTerminateDebugee.fire(event);
          break;
        case "exited":
          this._onDidExitDebugee.fire(event);
          break;
        case "progressStart":
          this._onDidProgressStart.fire(event);
          break;
        case "progressUpdate":
          this._onDidProgressUpdate.fire(event);
          break;
        case "progressEnd":
          this._onDidProgressEnd.fire(event);
          break;
        case "invalidated":
          this._onDidInvalidated.fire(event);
          break;
        case "memory":
          this._onDidInvalidateMemory.fire(event);
          break;
        case "process":
          break;
        case "module":
          break;
        default:
          this._onDidCustomEvent.fire(event);
          break;
      }
      this._onDidEvent.fire(event);
    });
    this.debugAdapter.onRequest((request) => this.dispatchRequest(request));
  }
  get isInShutdown() {
    return this.inShutdown;
  }
  get onDidExitAdapter() {
    return this._onDidExitAdapter.event;
  }
  get capabilities() {
    return this._capabilities;
  }
  /**
   * DA is ready to accepts setBreakpoint requests.
   * Becomes true after "initialized" events has been received.
   */
  get readyForBreakpoints() {
    return this._readyForBreakpoints;
  }
  //---- DAP events
  get onDidInitialize() {
    return this._onDidInitialize.event;
  }
  get onDidStop() {
    return this._onDidStop.event;
  }
  get onDidContinued() {
    return this._onDidContinued.event;
  }
  get onDidTerminateDebugee() {
    return this._onDidTerminateDebugee.event;
  }
  get onDidExitDebugee() {
    return this._onDidExitDebugee.event;
  }
  get onDidThread() {
    return this._onDidThread.event;
  }
  get onDidOutput() {
    return this._onDidOutput.event;
  }
  get onDidBreakpoint() {
    return this._onDidBreakpoint.event;
  }
  get onDidLoadedSource() {
    return this._onDidLoadedSource.event;
  }
  get onDidCustomEvent() {
    return this._onDidCustomEvent.event;
  }
  get onDidProgressStart() {
    return this._onDidProgressStart.event;
  }
  get onDidProgressUpdate() {
    return this._onDidProgressUpdate.event;
  }
  get onDidProgressEnd() {
    return this._onDidProgressEnd.event;
  }
  get onDidInvalidated() {
    return this._onDidInvalidated.event;
  }
  get onDidInvalidateMemory() {
    return this._onDidInvalidateMemory.event;
  }
  get onDidEvent() {
    return this._onDidEvent.event;
  }
  //---- DebugAdapter lifecycle
  /**
   * Starts the underlying debug adapter and tracks the session time for telemetry.
   */
  async start() {
    if (!this.debugAdapter) {
      return Promise.reject(new Error(nls.localize("noDebugAdapterStart", "No debug adapter, can not start debug session.")));
    }
    await this.debugAdapter.startSession();
    this.startTime = (/* @__PURE__ */ new Date()).getTime();
  }
  /**
   * Send client capabilities to the debug adapter and receive DA capabilities in return.
   */
  async initialize(args) {
    const response = await this.send("initialize", args, void 0, void 0, false);
    if (response) {
      this.mergeCapabilities(response.body);
    }
    return response;
  }
  /**
   * Terminate the debuggee and shutdown the adapter
   */
  disconnect(args) {
    const terminateDebuggee = this.capabilities.supportTerminateDebuggee ? args.terminateDebuggee : void 0;
    const suspendDebuggee = this.capabilities.supportTerminateDebuggee && this.capabilities.supportSuspendDebuggee ? args.suspendDebuggee : void 0;
    return this.shutdown(void 0, args.restart, terminateDebuggee, suspendDebuggee);
  }
  //---- DAP requests
  async launchOrAttach(config) {
    const response = await this.send(config.request, config, void 0, void 0, false);
    if (response) {
      this.mergeCapabilities(response.body);
    }
    return response;
  }
  /**
   * Try killing the debuggee softly...
   */
  terminate(restart = false) {
    if (this.capabilities.supportsTerminateRequest) {
      if (!this.terminated) {
        this.terminated = true;
        return this.send("terminate", { restart }, void 0);
      }
      return this.disconnect({ terminateDebuggee: true, restart });
    }
    return Promise.reject(new Error("terminated not supported"));
  }
  restart(args) {
    if (this.capabilities.supportsRestartRequest) {
      return this.send("restart", args);
    }
    return Promise.reject(new Error("restart not supported"));
  }
  async next(args) {
    this.stoppedSinceLastStep = false;
    const response = await this.send("next", args);
    if (!this.stoppedSinceLastStep) {
      this.fireSimulatedContinuedEvent(args.threadId);
    }
    return response;
  }
  async stepIn(args) {
    this.stoppedSinceLastStep = false;
    const response = await this.send("stepIn", args);
    if (!this.stoppedSinceLastStep) {
      this.fireSimulatedContinuedEvent(args.threadId);
    }
    return response;
  }
  async stepOut(args) {
    this.stoppedSinceLastStep = false;
    const response = await this.send("stepOut", args);
    if (!this.stoppedSinceLastStep) {
      this.fireSimulatedContinuedEvent(args.threadId);
    }
    return response;
  }
  async continue(args) {
    this.stoppedSinceLastStep = false;
    const response = await this.send("continue", args);
    if (response && response.body && response.body.allThreadsContinued !== void 0) {
      this.allThreadsContinued = response.body.allThreadsContinued;
    }
    if (!this.stoppedSinceLastStep) {
      this.fireSimulatedContinuedEvent(args.threadId, this.allThreadsContinued);
    }
    return response;
  }
  pause(args) {
    return this.send("pause", args);
  }
  terminateThreads(args) {
    if (this.capabilities.supportsTerminateThreadsRequest) {
      return this.send("terminateThreads", args);
    }
    return Promise.reject(new Error("terminateThreads not supported"));
  }
  setVariable(args) {
    if (this.capabilities.supportsSetVariable) {
      return this.send("setVariable", args);
    }
    return Promise.reject(new Error("setVariable not supported"));
  }
  setExpression(args) {
    if (this.capabilities.supportsSetExpression) {
      return this.send("setExpression", args);
    }
    return Promise.reject(new Error("setExpression not supported"));
  }
  async restartFrame(args, threadId) {
    if (this.capabilities.supportsRestartFrame) {
      this.stoppedSinceLastStep = false;
      const response = await this.send("restartFrame", args);
      if (!this.stoppedSinceLastStep) {
        this.fireSimulatedContinuedEvent(threadId);
      }
      return response;
    }
    return Promise.reject(new Error("restartFrame not supported"));
  }
  stepInTargets(args) {
    if (this.capabilities.supportsStepInTargetsRequest) {
      return this.send("stepInTargets", args);
    }
    return Promise.reject(new Error("stepInTargets not supported"));
  }
  completions(args, token) {
    if (this.capabilities.supportsCompletionsRequest) {
      return this.send("completions", args, token);
    }
    return Promise.reject(new Error("completions not supported"));
  }
  setBreakpoints(args) {
    return this.send("setBreakpoints", args);
  }
  setFunctionBreakpoints(args) {
    if (this.capabilities.supportsFunctionBreakpoints) {
      return this.send("setFunctionBreakpoints", args);
    }
    return Promise.reject(new Error("setFunctionBreakpoints not supported"));
  }
  dataBreakpointInfo(args) {
    if (this.capabilities.supportsDataBreakpoints) {
      return this.send("dataBreakpointInfo", args);
    }
    return Promise.reject(new Error("dataBreakpointInfo not supported"));
  }
  setDataBreakpoints(args) {
    if (this.capabilities.supportsDataBreakpoints) {
      return this.send("setDataBreakpoints", args);
    }
    return Promise.reject(new Error("setDataBreakpoints not supported"));
  }
  setExceptionBreakpoints(args) {
    return this.send("setExceptionBreakpoints", args);
  }
  breakpointLocations(args) {
    if (this.capabilities.supportsBreakpointLocationsRequest) {
      return this.send("breakpointLocations", args);
    }
    return Promise.reject(new Error("breakpointLocations is not supported"));
  }
  configurationDone() {
    if (this.capabilities.supportsConfigurationDoneRequest) {
      return this.send("configurationDone", null);
    }
    return Promise.reject(new Error("configurationDone not supported"));
  }
  stackTrace(args, token) {
    return this.send("stackTrace", args, token);
  }
  exceptionInfo(args) {
    if (this.capabilities.supportsExceptionInfoRequest) {
      return this.send("exceptionInfo", args);
    }
    return Promise.reject(new Error("exceptionInfo not supported"));
  }
  scopes(args, token) {
    return this.send("scopes", args, token);
  }
  variables(args, token) {
    return this.send("variables", args, token);
  }
  source(args) {
    return this.send("source", args);
  }
  locations(args) {
    return this.send("locations", args);
  }
  loadedSources(args) {
    if (this.capabilities.supportsLoadedSourcesRequest) {
      return this.send("loadedSources", args);
    }
    return Promise.reject(new Error("loadedSources not supported"));
  }
  threads() {
    return this.send("threads", null);
  }
  evaluate(args) {
    return this.send("evaluate", args);
  }
  async stepBack(args) {
    if (this.capabilities.supportsStepBack) {
      this.stoppedSinceLastStep = false;
      const response = await this.send("stepBack", args);
      if (!this.stoppedSinceLastStep) {
        this.fireSimulatedContinuedEvent(args.threadId);
      }
      return response;
    }
    return Promise.reject(new Error("stepBack not supported"));
  }
  async reverseContinue(args) {
    if (this.capabilities.supportsStepBack) {
      this.stoppedSinceLastStep = false;
      const response = await this.send("reverseContinue", args);
      if (!this.stoppedSinceLastStep) {
        this.fireSimulatedContinuedEvent(args.threadId);
      }
      return response;
    }
    return Promise.reject(new Error("reverseContinue not supported"));
  }
  gotoTargets(args) {
    if (this.capabilities.supportsGotoTargetsRequest) {
      return this.send("gotoTargets", args);
    }
    return Promise.reject(new Error("gotoTargets is not supported"));
  }
  async goto(args) {
    if (this.capabilities.supportsGotoTargetsRequest) {
      this.stoppedSinceLastStep = false;
      const response = await this.send("goto", args);
      if (!this.stoppedSinceLastStep) {
        this.fireSimulatedContinuedEvent(args.threadId);
      }
      return response;
    }
    return Promise.reject(new Error("goto is not supported"));
  }
  async setInstructionBreakpoints(args) {
    if (this.capabilities.supportsInstructionBreakpoints) {
      return await this.send("setInstructionBreakpoints", args);
    }
    return Promise.reject(new Error("setInstructionBreakpoints is not supported"));
  }
  async disassemble(args) {
    if (this.capabilities.supportsDisassembleRequest) {
      return await this.send("disassemble", args);
    }
    return Promise.reject(new Error("disassemble is not supported"));
  }
  async readMemory(args) {
    if (this.capabilities.supportsReadMemoryRequest) {
      return await this.send("readMemory", args);
    }
    return Promise.reject(new Error("readMemory is not supported"));
  }
  async writeMemory(args) {
    if (this.capabilities.supportsWriteMemoryRequest) {
      return await this.send("writeMemory", args);
    }
    return Promise.reject(new Error("writeMemory is not supported"));
  }
  cancel(args) {
    return this.send("cancel", args);
  }
  custom(request, args) {
    return this.send(request, args);
  }
  //---- private
  async shutdown(error, restart = false, terminateDebuggee = void 0, suspendDebuggee = void 0) {
    if (!this.inShutdown) {
      this.inShutdown = true;
      if (this.debugAdapter) {
        try {
          const args = { restart };
          if (typeof terminateDebuggee === "boolean") {
            args.terminateDebuggee = terminateDebuggee;
          }
          if (typeof suspendDebuggee === "boolean") {
            args.suspendDebuggee = suspendDebuggee;
          }
          await this.send("disconnect", args, void 0, error ? 200 : 2e3);
        } catch (e) {
        } finally {
          await this.stopAdapter(error);
        }
      } else {
        return this.stopAdapter(error);
      }
    }
  }
  async stopAdapter(error) {
    try {
      if (this.debugAdapter) {
        const da = this.debugAdapter;
        this.debugAdapter = null;
        await da.stopSession();
        this.debugAdapterStopped = true;
      }
    } finally {
      this.fireAdapterExitEvent(error);
    }
  }
  fireAdapterExitEvent(error) {
    if (!this.firedAdapterExitEvent) {
      this.firedAdapterExitEvent = true;
      const e = {
        emittedStopped: this.didReceiveStoppedEvent,
        sessionLengthInSeconds: ((/* @__PURE__ */ new Date()).getTime() - this.startTime) / 1e3
      };
      if (error && !this.debugAdapterStopped) {
        e.error = error;
      }
      this._onDidExitAdapter.fire(e);
    }
  }
  async dispatchRequest(request) {
    const response = {
      type: "response",
      seq: 0,
      command: request.command,
      request_seq: request.seq,
      success: true
    };
    const safeSendResponse = (response2) => this.debugAdapter && this.debugAdapter.sendResponse(response2);
    if (request.command === "launchVSCode") {
      try {
        let result = await this.launchVsCode(request.arguments);
        if (!result.success) {
          const { confirmed } = await this.dialogSerivce.confirm({
            type: Severity.Warning,
            message: nls.localize("canNotStart", "The debugger needs to open a new tab or window for the debuggee but the browser prevented this. You must give permission to continue."),
            primaryButton: nls.localize({ key: "continue", comment: ["&& denotes a mnemonic"] }, "&&Continue")
          });
          if (confirmed) {
            result = await this.launchVsCode(request.arguments);
          } else {
            response.success = false;
            safeSendResponse(response);
            await this.shutdown();
          }
        }
        response.body = {
          rendererDebugAddr: result.rendererDebugAddr
        };
        safeSendResponse(response);
      } catch (err) {
        response.success = false;
        response.message = err.message;
        safeSendResponse(response);
      }
    } else if (request.command === "runInTerminal") {
      try {
        const shellProcessId = await this.dbgr.runInTerminal(request.arguments, this.sessionId);
        const resp = response;
        resp.body = {};
        if (typeof shellProcessId === "number") {
          resp.body.shellProcessId = shellProcessId;
        }
        safeSendResponse(resp);
      } catch (err) {
        response.success = false;
        response.message = err.message;
        safeSendResponse(response);
      }
    } else if (request.command === "startDebugging") {
      try {
        const args = request.arguments;
        const config = {
          ...args.configuration,
          ...{
            request: args.request,
            type: this.dbgr.type,
            name: args.configuration.name || this.name
          }
        };
        const success = await this.dbgr.startDebugging(config, this.sessionId);
        if (success) {
          safeSendResponse(response);
        } else {
          response.success = false;
          response.message = "Failed to start debugging";
          safeSendResponse(response);
        }
      } catch (err) {
        response.success = false;
        response.message = err.message;
        safeSendResponse(response);
      }
    } else {
      response.success = false;
      response.message = `unknown request '${request.command}'`;
      safeSendResponse(response);
    }
  }
  launchVsCode(vscodeArgs) {
    const args = [];
    for (const arg of vscodeArgs.args) {
      const a2 = (arg.prefix || "") + (arg.path || "");
      const match = /^--(.+)=(.+)$/.exec(a2);
      if (match && match.length === 3) {
        const key = match[1];
        let value = match[2];
        if ((key === "file-uri" || key === "folder-uri") && !isUriString(arg.path)) {
          value = isUriString(value) ? value : URI.file(value).toString();
        }
        args.push(`--${key}=${value}`);
      } else {
        args.push(a2);
      }
    }
    if (vscodeArgs.env) {
      args.push(`--extensionEnvironment=${JSON.stringify(vscodeArgs.env)}`);
    }
    return this.extensionHostDebugService.openExtensionDevelopmentHostWindow(args, !!vscodeArgs.debugRenderer);
  }
  send(command, args, token, timeout, showErrors = true) {
    return new Promise((completeDispatch, errorDispatch) => {
      if (!this.debugAdapter) {
        if (this.inShutdown) {
          completeDispatch(void 0);
        } else {
          errorDispatch(new Error(nls.localize("noDebugAdapter", "No debugger available found. Can not send '{0}'.", command)));
        }
        return;
      }
      let cancelationListener;
      const requestId = this.debugAdapter.sendRequest(command, args, (response) => {
        cancelationListener?.dispose();
        if (response.success) {
          completeDispatch(response);
        } else {
          errorDispatch(response);
        }
      }, timeout);
      if (token) {
        cancelationListener = token.onCancellationRequested(() => {
          cancelationListener.dispose();
          if (this.capabilities.supportsCancelRequest) {
            this.cancel({ requestId });
          }
        });
      }
    }).then(void 0, (err) => Promise.reject(this.handleErrorResponse(err, showErrors)));
  }
  handleErrorResponse(errorResponse, showErrors) {
    if (errorResponse.command === "canceled" && errorResponse.message === "canceled") {
      return new errors.CancellationError();
    }
    const error = errorResponse?.body?.error;
    const errorMessage = errorResponse?.message || "";
    const userMessage = error ? formatPII(error.format, false, error.variables) : errorMessage;
    const url = error?.url;
    if (error && url) {
      const label = error.urlLabel ? error.urlLabel : nls.localize("moreInfo", "More Info");
      const uri = URI.parse(url);
      const actionId = uri.scheme === Schemas.command ? "debug.moreInfo.command" : "debug.moreInfo";
      return createErrorWithActions(userMessage, [toAction({ id: actionId, label, run: () => this.openerService.open(uri, { allowCommands: true }) })]);
    }
    if (showErrors && error && error.format && error.showUser) {
      this.notificationService.error(userMessage);
    }
    const result = new errors.ErrorNoTelemetry(userMessage);
    result.showUser = error?.showUser;
    return result;
  }
  mergeCapabilities(capabilities) {
    if (capabilities) {
      this._capabilities = objects.mixin(this._capabilities, capabilities);
    }
  }
  fireSimulatedContinuedEvent(threadId, allThreadsContinued = false) {
    this._onDidContinued.fire({
      type: "event",
      event: "continued",
      body: {
        threadId,
        allThreadsContinued
      },
      seq: void 0
    });
  }
  dispose() {
    this.toDispose.dispose();
  }
};
RawDebugSession = __decorateClass([
  __decorateParam(4, IExtensionHostDebugService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IDialogService)
], RawDebugSession);
export {
  RawDebugSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxyYXdEZWJ1Z1Nlc3Npb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUVycm9yV2l0aEFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgZm9ybWF0UElJLCBpc1VyaVN0cmluZyB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IElEZWJ1Z0FkYXB0ZXIsIElDb25maWcsIEFkYXB0ZXJFbmRFdmVudCwgSURlYnVnZ2VyIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLCBJT3BlbkV4dGVuc2lvbldpbmRvd1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlYnVnL2NvbW1vbi9leHRlbnNpb25Ib3N0RGVidWcuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuXG4vKipcbiAqIFRoaXMgaW50ZXJmYWNlIHJlcHJlc2VudHMgYSBzaW5nbGUgY29tbWFuZCBsaW5lIGFyZ3VtZW50IHNwbGl0IGludG8gYSBcInByZWZpeFwiIGFuZCBhIFwicGF0aFwiIGhhbGYuXG4gKiBUaGUgb3B0aW9uYWwgXCJwcmVmaXhcIiBjb250YWlucyBhcmJpdHJhcnkgdGV4dCBhbmQgdGhlIG9wdGlvbmFsIFwicGF0aFwiIGNvbnRhaW5zIGEgZmlsZSBzeXN0ZW0gcGF0aC5cbiAqIENvbmNhdGVuYXRpbmcgYm90aCByZXN1bHRzIGluIHRoZSBvcmlnaW5hbCBjb21tYW5kIGxpbmUgYXJndW1lbnQuXG4gKi9cbmludGVyZmFjZSBJTGF1bmNoVlNDb2RlQXJndW1lbnQge1xuXHRwcmVmaXg/OiBzdHJpbmc7XG5cdHBhdGg/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJTGF1bmNoVlNDb2RlQXJndW1lbnRzIHtcblx0YXJnczogSUxhdW5jaFZTQ29kZUFyZ3VtZW50W107XG5cdGRlYnVnUmVuZGVyZXI/OiBib29sZWFuO1xuXHRlbnY/OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB8IG51bGwgfTtcbn1cblxuLyoqXG4gKiBFbmNhcHN1bGF0ZXMgdGhlIERlYnVnQWRhcHRlciBsaWZlY3ljbGUgYW5kIHNvbWUgaWRpb3N5bmNyYXNpZXMgb2YgdGhlIERlYnVnIEFkYXB0ZXIgUHJvdG9jb2wuXG4gKi9cbmV4cG9ydCBjbGFzcyBSYXdEZWJ1Z1Nlc3Npb24gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBhbGxUaHJlYWRzQ29udGludWVkID0gdHJ1ZTtcblx0cHJpdmF0ZSBfcmVhZHlGb3JCcmVha3BvaW50cyA9IGZhbHNlO1xuXHRwcml2YXRlIF9jYXBhYmlsaXRpZXM6IERlYnVnUHJvdG9jb2wuQ2FwYWJpbGl0aWVzO1xuXG5cdC8vIHNodXRkb3duXG5cdHByaXZhdGUgZGVidWdBZGFwdGVyU3RvcHBlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGluU2h1dGRvd24gPSBmYWxzZTtcblx0cHJpdmF0ZSB0ZXJtaW5hdGVkID0gZmFsc2U7XG5cdHByaXZhdGUgZmlyZWRBZGFwdGVyRXhpdEV2ZW50ID0gZmFsc2U7XG5cblx0Ly8gdGVsZW1ldHJ5XG5cdHByaXZhdGUgc3RhcnRUaW1lID0gMDtcblx0cHJpdmF0ZSBkaWRSZWNlaXZlU3RvcHBlZEV2ZW50ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Ly8gREFQIGV2ZW50c1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluaXRpYWxpemUgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5Jbml0aWFsaXplZEV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdG9wID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuU3RvcHBlZEV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb250aW51ZWQgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5Db250aW51ZWRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVGVybWluYXRlRGVidWdlZSA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLlRlcm1pbmF0ZWRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRXhpdERlYnVnZWUgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5FeGl0ZWRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVGhyZWFkID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuVGhyZWFkRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE91dHB1dCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLk91dHB1dEV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCcmVha3BvaW50ID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludEV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRMb2FkZWRTb3VyY2UgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5Mb2FkZWRTb3VyY2VFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZ3Jlc3NTdGFydCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLlByb2dyZXNzU3RhcnRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvZ3Jlc3NVcGRhdGUgPSB0aGlzLnRvRGlzcG9zZS5hZGQobmV3IEVtaXR0ZXI8RGVidWdQcm90b2NvbC5Qcm9ncmVzc1VwZGF0ZUV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQcm9ncmVzc0VuZCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLlByb2dyZXNzRW5kRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEludmFsaWRhdGVkID0gdGhpcy50b0Rpc3Bvc2UuYWRkKG5ldyBFbWl0dGVyPERlYnVnUHJvdG9jb2wuSW52YWxpZGF0ZWRFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW52YWxpZGF0ZU1lbW9yeSA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLk1lbW9yeUV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDdXN0b21FdmVudCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLkV2ZW50PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFdmVudCA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxEZWJ1Z1Byb3RvY29sLkV2ZW50PigpKTtcblxuXHQvLyBEQSBldmVudHNcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFeGl0QWRhcHRlciA9IHRoaXMudG9EaXNwb3NlLmFkZChuZXcgRW1pdHRlcjxBZGFwdGVyRW5kRXZlbnQ+KCkpO1xuXHRwcml2YXRlIGRlYnVnQWRhcHRlcjogSURlYnVnQWRhcHRlciB8IG51bGw7XG5cdHByaXZhdGUgc3RvcHBlZFNpbmNlTGFzdFN0ZXAgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkZWJ1Z0FkYXB0ZXI6IElEZWJ1Z0FkYXB0ZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRiZ3I6IElEZWJ1Z2dlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdEBJRXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2U6IElFeHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1Nlcml2Y2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmRlYnVnQWRhcHRlciA9IGRlYnVnQWRhcHRlcjtcblx0XHR0aGlzLl9jYXBhYmlsaXRpZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0dGhpcy50b0Rpc3Bvc2UuYWRkKHRoaXMuZGVidWdBZGFwdGVyLm9uRXJyb3IoZXJyID0+IHtcblx0XHRcdHRoaXMuc2h1dGRvd24oZXJyKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnRvRGlzcG9zZS5hZGQodGhpcy5kZWJ1Z0FkYXB0ZXIub25FeGl0KGNvZGUgPT4ge1xuXHRcdFx0aWYgKGNvZGUgIT09IDApIHtcblx0XHRcdFx0dGhpcy5zaHV0ZG93bihuZXcgRXJyb3IoYGV4aXQgY29kZTogJHtjb2RlfWApKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG5vcm1hbCBleGl0XG5cdFx0XHRcdHRoaXMuc2h1dGRvd24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRlYnVnQWRhcHRlci5vbkV2ZW50KGV2ZW50ID0+IHtcblx0XHRcdHN3aXRjaCAoZXZlbnQuZXZlbnQpIHtcblx0XHRcdFx0Y2FzZSAnaW5pdGlhbGl6ZWQnOlxuXHRcdFx0XHRcdHRoaXMuX3JlYWR5Rm9yQnJlYWtwb2ludHMgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkSW5pdGlhbGl6ZS5maXJlKGV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbG9hZGVkU291cmNlJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZExvYWRlZFNvdXJjZS5maXJlKDxEZWJ1Z1Byb3RvY29sLkxvYWRlZFNvdXJjZUV2ZW50PmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnY2FwYWJpbGl0aWVzJzpcblx0XHRcdFx0XHRpZiAoZXZlbnQuYm9keSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gKDxEZWJ1Z1Byb3RvY29sLkNhcGFiaWxpdGllc0V2ZW50PmV2ZW50KS5ib2R5LmNhcGFiaWxpdGllcztcblx0XHRcdFx0XHRcdHRoaXMubWVyZ2VDYXBhYmlsaXRpZXMoY2FwYWJpbGl0aWVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3N0b3BwZWQnOlxuXHRcdFx0XHRcdHRoaXMuZGlkUmVjZWl2ZVN0b3BwZWRFdmVudCA9IHRydWU7XHRcdC8vIHRlbGVtZXRyeTogcmVtZW1iZXIgdGhhdCBkZWJ1Z2dlciBzdG9wcGVkIHN1Y2Nlc3NmdWxseVxuXHRcdFx0XHRcdHRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXAgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU3RvcC5maXJlKDxEZWJ1Z1Byb3RvY29sLlN0b3BwZWRFdmVudD5ldmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2NvbnRpbnVlZCc6XG5cdFx0XHRcdFx0dGhpcy5hbGxUaHJlYWRzQ29udGludWVkID0gKDxEZWJ1Z1Byb3RvY29sLkNvbnRpbnVlZEV2ZW50PmV2ZW50KS5ib2R5LmFsbFRocmVhZHNDb250aW51ZWQgPT09IGZhbHNlID8gZmFsc2UgOiB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ29udGludWVkLmZpcmUoPERlYnVnUHJvdG9jb2wuQ29udGludWVkRXZlbnQ+ZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICd0aHJlYWQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkVGhyZWFkLmZpcmUoPERlYnVnUHJvdG9jb2wuVGhyZWFkRXZlbnQ+ZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdvdXRwdXQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkT3V0cHV0LmZpcmUoPERlYnVnUHJvdG9jb2wuT3V0cHV0RXZlbnQ+ZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdicmVha3BvaW50Jzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEJyZWFrcG9pbnQuZmlyZSg8RGVidWdQcm90b2NvbC5CcmVha3BvaW50RXZlbnQ+ZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICd0ZXJtaW5hdGVkJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFRlcm1pbmF0ZURlYnVnZWUuZmlyZSg8RGVidWdQcm90b2NvbC5UZXJtaW5hdGVkRXZlbnQ+ZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdleGl0ZWQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkRXhpdERlYnVnZWUuZmlyZSg8RGVidWdQcm90b2NvbC5FeGl0ZWRFdmVudD5ldmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3Byb2dyZXNzU3RhcnQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkUHJvZ3Jlc3NTdGFydC5maXJlKGV2ZW50IGFzIERlYnVnUHJvdG9jb2wuUHJvZ3Jlc3NTdGFydEV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncHJvZ3Jlc3NVcGRhdGUnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkUHJvZ3Jlc3NVcGRhdGUuZmlyZShldmVudCBhcyBEZWJ1Z1Byb3RvY29sLlByb2dyZXNzVXBkYXRlRXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdwcm9ncmVzc0VuZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRQcm9ncmVzc0VuZC5maXJlKGV2ZW50IGFzIERlYnVnUHJvdG9jb2wuUHJvZ3Jlc3NFbmRFdmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2ludmFsaWRhdGVkJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEludmFsaWRhdGVkLmZpcmUoZXZlbnQgYXMgRGVidWdQcm90b2NvbC5JbnZhbGlkYXRlZEV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbWVtb3J5Jzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEludmFsaWRhdGVNZW1vcnkuZmlyZShldmVudCBhcyBEZWJ1Z1Byb3RvY29sLk1lbW9yeUV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncHJvY2Vzcyc6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ21vZHVsZSc6XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDdXN0b21FdmVudC5maXJlKGV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkRXZlbnQuZmlyZShldmVudCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmRlYnVnQWRhcHRlci5vblJlcXVlc3QocmVxdWVzdCA9PiB0aGlzLmRpc3BhdGNoUmVxdWVzdChyZXF1ZXN0KSk7XG5cdH1cblxuXHRnZXQgaXNJblNodXRkb3duKCkge1xuXHRcdHJldHVybiB0aGlzLmluU2h1dGRvd247XG5cdH1cblxuXHRnZXQgb25EaWRFeGl0QWRhcHRlcigpOiBFdmVudDxBZGFwdGVyRW5kRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRFeGl0QWRhcHRlci5ldmVudDtcblx0fVxuXG5cdGdldCBjYXBhYmlsaXRpZXMoKTogRGVidWdQcm90b2NvbC5DYXBhYmlsaXRpZXMge1xuXHRcdHJldHVybiB0aGlzLl9jYXBhYmlsaXRpZXM7XG5cdH1cblxuXHQvKipcblx0ICogREEgaXMgcmVhZHkgdG8gYWNjZXB0cyBzZXRCcmVha3BvaW50IHJlcXVlc3RzLlxuXHQgKiBCZWNvbWVzIHRydWUgYWZ0ZXIgXCJpbml0aWFsaXplZFwiIGV2ZW50cyBoYXMgYmVlbiByZWNlaXZlZC5cblx0ICovXG5cdGdldCByZWFkeUZvckJyZWFrcG9pbnRzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkeUZvckJyZWFrcG9pbnRzO1xuXHR9XG5cblx0Ly8tLS0tIERBUCBldmVudHNcblxuXHRnZXQgb25EaWRJbml0aWFsaXplKCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuSW5pdGlhbGl6ZWRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEluaXRpYWxpemUuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRTdG9wKCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuU3RvcHBlZEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkU3RvcC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZENvbnRpbnVlZCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLkNvbnRpbnVlZEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ29udGludWVkLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkVGVybWluYXRlRGVidWdlZSgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLlRlcm1pbmF0ZWRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFRlcm1pbmF0ZURlYnVnZWUuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRFeGl0RGVidWdlZSgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLkV4aXRlZEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRXhpdERlYnVnZWUuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRUaHJlYWQoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5UaHJlYWRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFRocmVhZC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZE91dHB1dCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLk91dHB1dEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkT3V0cHV0LmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkQnJlYWtwb2ludCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEJyZWFrcG9pbnQuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRMb2FkZWRTb3VyY2UoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5Mb2FkZWRTb3VyY2VFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZExvYWRlZFNvdXJjZS5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZEN1c3RvbUV2ZW50KCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDdXN0b21FdmVudC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZFByb2dyZXNzU3RhcnQoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5Qcm9ncmVzc1N0YXJ0RXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRQcm9ncmVzc1N0YXJ0LmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkUHJvZ3Jlc3NVcGRhdGUoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5Qcm9ncmVzc1VwZGF0ZUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkUHJvZ3Jlc3NVcGRhdGUuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRQcm9ncmVzc0VuZCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLlByb2dyZXNzRW5kRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRQcm9ncmVzc0VuZC5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZEludmFsaWRhdGVkKCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuSW52YWxpZGF0ZWRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEludmFsaWRhdGVkLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkSW52YWxpZGF0ZU1lbW9yeSgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLk1lbW9yeUV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkSW52YWxpZGF0ZU1lbW9yeS5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZEV2ZW50KCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRFdmVudC5ldmVudDtcblx0fVxuXG5cdC8vLS0tLSBEZWJ1Z0FkYXB0ZXIgbGlmZWN5Y2xlXG5cblx0LyoqXG5cdCAqIFN0YXJ0cyB0aGUgdW5kZXJseWluZyBkZWJ1ZyBhZGFwdGVyIGFuZCB0cmFja3MgdGhlIHNlc3Npb24gdGltZSBmb3IgdGVsZW1ldHJ5LlxuXHQgKi9cblx0YXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmRlYnVnQWRhcHRlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ25vRGVidWdBZGFwdGVyU3RhcnQnLCBcIk5vIGRlYnVnIGFkYXB0ZXIsIGNhbiBub3Qgc3RhcnQgZGVidWcgc2Vzc2lvbi5cIikpKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmRlYnVnQWRhcHRlci5zdGFydFNlc3Npb24oKTtcblx0XHR0aGlzLnN0YXJ0VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgY2xpZW50IGNhcGFiaWxpdGllcyB0byB0aGUgZGVidWcgYWRhcHRlciBhbmQgcmVjZWl2ZSBEQSBjYXBhYmlsaXRpZXMgaW4gcmV0dXJuLlxuXHQgKi9cblx0YXN5bmMgaW5pdGlhbGl6ZShhcmdzOiBEZWJ1Z1Byb3RvY29sLkluaXRpYWxpemVSZXF1ZXN0QXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkluaXRpYWxpemVSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5zZW5kKCdpbml0aWFsaXplJywgYXJncywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRpZiAocmVzcG9uc2UpIHtcblx0XHRcdHRoaXMubWVyZ2VDYXBhYmlsaXRpZXMocmVzcG9uc2UuYm9keSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlcm1pbmF0ZSB0aGUgZGVidWdnZWUgYW5kIHNodXRkb3duIHRoZSBhZGFwdGVyXG5cdCAqL1xuXHRkaXNjb25uZWN0KGFyZ3M6IERlYnVnUHJvdG9jb2wuRGlzY29ubmVjdEFyZ3VtZW50cyk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgdGVybWluYXRlRGVidWdnZWUgPSB0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0VGVybWluYXRlRGVidWdnZWUgPyBhcmdzLnRlcm1pbmF0ZURlYnVnZ2VlIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHN1c3BlbmREZWJ1Z2dlZSA9IHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRUZXJtaW5hdGVEZWJ1Z2dlZSAmJiB0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0U3VzcGVuZERlYnVnZ2VlID8gYXJncy5zdXNwZW5kRGVidWdnZWUgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHRoaXMuc2h1dGRvd24odW5kZWZpbmVkLCBhcmdzLnJlc3RhcnQsIHRlcm1pbmF0ZURlYnVnZ2VlLCBzdXNwZW5kRGVidWdnZWUpO1xuXHR9XG5cblx0Ly8tLS0tIERBUCByZXF1ZXN0c1xuXG5cdGFzeW5jIGxhdW5jaE9yQXR0YWNoKGNvbmZpZzogSUNvbmZpZyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5zZW5kKGNvbmZpZy5yZXF1ZXN0LCBjb25maWcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0aWYgKHJlc3BvbnNlKSB7XG5cdFx0XHR0aGlzLm1lcmdlQ2FwYWJpbGl0aWVzKHJlc3BvbnNlLmJvZHkpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNwb25zZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcnkga2lsbGluZyB0aGUgZGVidWdnZWUgc29mdGx5Li4uXG5cdCAqL1xuXHR0ZXJtaW5hdGUocmVzdGFydCA9IGZhbHNlKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlRlcm1pbmF0ZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzVGVybWluYXRlUmVxdWVzdCkge1xuXHRcdFx0aWYgKCF0aGlzLnRlcm1pbmF0ZWQpIHtcblx0XHRcdFx0dGhpcy50ZXJtaW5hdGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VuZCgndGVybWluYXRlJywgeyByZXN0YXJ0IH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5kaXNjb25uZWN0KHsgdGVybWluYXRlRGVidWdnZWU6IHRydWUsIHJlc3RhcnQgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3Rlcm1pbmF0ZWQgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdHJlc3RhcnQoYXJnczogRGVidWdQcm90b2NvbC5SZXN0YXJ0QXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlJlc3RhcnRSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1Jlc3RhcnRSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kKCdyZXN0YXJ0JywgYXJncyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3Jlc3RhcnQgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGFzeW5jIG5leHQoYXJnczogRGVidWdQcm90b2NvbC5OZXh0QXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLk5leHRSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXAgPSBmYWxzZTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZCgnbmV4dCcsIGFyZ3MpO1xuXHRcdGlmICghdGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCkge1xuXHRcdFx0dGhpcy5maXJlU2ltdWxhdGVkQ29udGludWVkRXZlbnQoYXJncy50aHJlYWRJZCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXNwb25zZTtcblx0fVxuXG5cdGFzeW5jIHN0ZXBJbihhcmdzOiBEZWJ1Z1Byb3RvY29sLlN0ZXBJbkFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TdGVwSW5SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXAgPSBmYWxzZTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZCgnc3RlcEluJywgYXJncyk7XG5cdFx0aWYgKCF0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwKSB7XG5cdFx0XHR0aGlzLmZpcmVTaW11bGF0ZWRDb250aW51ZWRFdmVudChhcmdzLnRocmVhZElkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHR9XG5cblx0YXN5bmMgc3RlcE91dChhcmdzOiBEZWJ1Z1Byb3RvY29sLlN0ZXBPdXRBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RlcE91dFJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5zZW5kKCdzdGVwT3V0JywgYXJncyk7XG5cdFx0aWYgKCF0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwKSB7XG5cdFx0XHR0aGlzLmZpcmVTaW11bGF0ZWRDb250aW51ZWRFdmVudChhcmdzLnRocmVhZElkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHR9XG5cblx0YXN5bmMgY29udGludWUoYXJnczogRGVidWdQcm90b2NvbC5Db250aW51ZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Db250aW51ZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuQ29udGludWVSZXNwb25zZT4oJ2NvbnRpbnVlJywgYXJncyk7XG5cdFx0aWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmJvZHkgJiYgcmVzcG9uc2UuYm9keS5hbGxUaHJlYWRzQ29udGludWVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuYWxsVGhyZWFkc0NvbnRpbnVlZCA9IHJlc3BvbnNlLmJvZHkuYWxsVGhyZWFkc0NvbnRpbnVlZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwKSB7XG5cdFx0XHR0aGlzLmZpcmVTaW11bGF0ZWRDb250aW51ZWRFdmVudChhcmdzLnRocmVhZElkLCB0aGlzLmFsbFRocmVhZHNDb250aW51ZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNwb25zZTtcblx0fVxuXG5cdHBhdXNlKGFyZ3M6IERlYnVnUHJvdG9jb2wuUGF1c2VBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuUGF1c2VSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQoJ3BhdXNlJywgYXJncyk7XG5cdH1cblxuXHR0ZXJtaW5hdGVUaHJlYWRzKGFyZ3M6IERlYnVnUHJvdG9jb2wuVGVybWluYXRlVGhyZWFkc0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5UZXJtaW5hdGVUaHJlYWRzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNUZXJtaW5hdGVUaHJlYWRzUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZCgndGVybWluYXRlVGhyZWFkcycsIGFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCd0ZXJtaW5hdGVUaHJlYWRzIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRzZXRWYXJpYWJsZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlNldFZhcmlhYmxlQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldFZhcmlhYmxlUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNTZXRWYXJpYWJsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLlNldFZhcmlhYmxlUmVzcG9uc2U+KCdzZXRWYXJpYWJsZScsIGFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdzZXRWYXJpYWJsZSBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0c2V0RXhwcmVzc2lvbihhcmdzOiBEZWJ1Z1Byb3RvY29sLlNldEV4cHJlc3Npb25Bcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU2V0RXhwcmVzc2lvblJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzU2V0RXhwcmVzc2lvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLlNldEV4cHJlc3Npb25SZXNwb25zZT4oJ3NldEV4cHJlc3Npb24nLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignc2V0RXhwcmVzc2lvbiBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0YXN5bmMgcmVzdGFydEZyYW1lKGFyZ3M6IERlYnVnUHJvdG9jb2wuUmVzdGFydEZyYW1lQXJndW1lbnRzLCB0aHJlYWRJZDogbnVtYmVyKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlJlc3RhcnRGcmFtZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzUmVzdGFydEZyYW1lKSB7XG5cdFx0XHR0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwID0gZmFsc2U7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZCgncmVzdGFydEZyYW1lJywgYXJncyk7XG5cdFx0XHRpZiAoIXRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXApIHtcblx0XHRcdFx0dGhpcy5maXJlU2ltdWxhdGVkQ29udGludWVkRXZlbnQodGhyZWFkSWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdyZXN0YXJ0RnJhbWUgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdHN0ZXBJblRhcmdldHMoYXJnczogRGVidWdQcm90b2NvbC5TdGVwSW5UYXJnZXRzQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlN0ZXBJblRhcmdldHNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1N0ZXBJblRhcmdldHNSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kKCdzdGVwSW5UYXJnZXRzJywgYXJncyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3N0ZXBJblRhcmdldHMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGNvbXBsZXRpb25zKGFyZ3M6IERlYnVnUHJvdG9jb2wuQ29tcGxldGlvbnNBcmd1bWVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5Db21wbGV0aW9uc1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29tcGxldGlvbnNSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuQ29tcGxldGlvbnNSZXNwb25zZT4oJ2NvbXBsZXRpb25zJywgYXJncywgdG9rZW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdjb21wbGV0aW9ucyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0c2V0QnJlYWtwb2ludHMoYXJnczogRGVidWdQcm90b2NvbC5TZXRCcmVha3BvaW50c0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TZXRCcmVha3BvaW50c1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLlNldEJyZWFrcG9pbnRzUmVzcG9uc2U+KCdzZXRCcmVha3BvaW50cycsIGFyZ3MpO1xuXHR9XG5cblx0c2V0RnVuY3Rpb25CcmVha3BvaW50cyhhcmdzOiBEZWJ1Z1Byb3RvY29sLlNldEZ1bmN0aW9uQnJlYWtwb2ludHNBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU2V0RnVuY3Rpb25CcmVha3BvaW50c1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzRnVuY3Rpb25CcmVha3BvaW50cykge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLlNldEZ1bmN0aW9uQnJlYWtwb2ludHNSZXNwb25zZT4oJ3NldEZ1bmN0aW9uQnJlYWtwb2ludHMnLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignc2V0RnVuY3Rpb25CcmVha3BvaW50cyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0ZGF0YUJyZWFrcG9pbnRJbmZvKGFyZ3M6IERlYnVnUHJvdG9jb2wuRGF0YUJyZWFrcG9pbnRJbmZvQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuRGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2U+KCdkYXRhQnJlYWtwb2ludEluZm8nLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignZGF0YUJyZWFrcG9pbnRJbmZvIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRzZXREYXRhQnJlYWtwb2ludHMoYXJnczogRGVidWdQcm90b2NvbC5TZXREYXRhQnJlYWtwb2ludHNBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU2V0RGF0YUJyZWFrcG9pbnRzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEYXRhQnJlYWtwb2ludHMpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5TZXREYXRhQnJlYWtwb2ludHNSZXNwb25zZT4oJ3NldERhdGFCcmVha3BvaW50cycsIGFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdzZXREYXRhQnJlYWtwb2ludHMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdHNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKGFyZ3M6IERlYnVnUHJvdG9jb2wuU2V0RXhjZXB0aW9uQnJlYWtwb2ludHNBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU2V0RXhjZXB0aW9uQnJlYWtwb2ludHNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5TZXRFeGNlcHRpb25CcmVha3BvaW50c1Jlc3BvbnNlPignc2V0RXhjZXB0aW9uQnJlYWtwb2ludHMnLCBhcmdzKTtcblx0fVxuXG5cdGJyZWFrcG9pbnRMb2NhdGlvbnMoYXJnczogRGVidWdQcm90b2NvbC5CcmVha3BvaW50TG9jYXRpb25zQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnRMb2NhdGlvbnNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0JyZWFrcG9pbnRMb2NhdGlvbnNSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kKCdicmVha3BvaW50TG9jYXRpb25zJywgYXJncyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2JyZWFrcG9pbnRMb2NhdGlvbnMgaXMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGNvbmZpZ3VyYXRpb25Eb25lKCk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Db25maWd1cmF0aW9uRG9uZVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29uZmlndXJhdGlvbkRvbmVSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kKCdjb25maWd1cmF0aW9uRG9uZScsIG51bGwpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdjb25maWd1cmF0aW9uRG9uZSBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0c3RhY2tUcmFjZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlN0YWNrVHJhY2VBcmd1bWVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5TdGFja1RyYWNlUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuU3RhY2tUcmFjZVJlc3BvbnNlPignc3RhY2tUcmFjZScsIGFyZ3MsIHRva2VuKTtcblx0fVxuXG5cdGV4Y2VwdGlvbkluZm8oYXJnczogRGVidWdQcm90b2NvbC5FeGNlcHRpb25JbmZvQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkV4Y2VwdGlvbkluZm9SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0V4Y2VwdGlvbkluZm9SZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kPERlYnVnUHJvdG9jb2wuRXhjZXB0aW9uSW5mb1Jlc3BvbnNlPignZXhjZXB0aW9uSW5mbycsIGFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdleGNlcHRpb25JbmZvIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRzY29wZXMoYXJnczogRGVidWdQcm90b2NvbC5TY29wZXNBcmd1bWVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5TY29wZXNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5TY29wZXNSZXNwb25zZT4oJ3Njb3BlcycsIGFyZ3MsIHRva2VuKTtcblx0fVxuXG5cdHZhcmlhYmxlcyhhcmdzOiBEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlc0FyZ3VtZW50cywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5WYXJpYWJsZXNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5WYXJpYWJsZXNSZXNwb25zZT4oJ3ZhcmlhYmxlcycsIGFyZ3MsIHRva2VuKTtcblx0fVxuXG5cdHNvdXJjZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlNvdXJjZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Tb3VyY2VSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5Tb3VyY2VSZXNwb25zZT4oJ3NvdXJjZScsIGFyZ3MpO1xuXHR9XG5cblx0bG9jYXRpb25zKGFyZ3M6IERlYnVnUHJvdG9jb2wuTG9jYXRpb25zQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkxvY2F0aW9uc1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLkxvY2F0aW9uc1Jlc3BvbnNlPignbG9jYXRpb25zJywgYXJncyk7XG5cdH1cblxuXHRsb2FkZWRTb3VyY2VzKGFyZ3M6IERlYnVnUHJvdG9jb2wuTG9hZGVkU291cmNlc0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Mb2FkZWRTb3VyY2VzUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNMb2FkZWRTb3VyY2VzUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLkxvYWRlZFNvdXJjZXNSZXNwb25zZT4oJ2xvYWRlZFNvdXJjZXMnLCBhcmdzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignbG9hZGVkU291cmNlcyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0dGhyZWFkcygpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuVGhyZWFkc1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZDxEZWJ1Z1Byb3RvY29sLlRocmVhZHNSZXNwb25zZT4oJ3RocmVhZHMnLCBudWxsKTtcblx0fVxuXG5cdGV2YWx1YXRlKGFyZ3M6IERlYnVnUHJvdG9jb2wuRXZhbHVhdGVBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuRXZhbHVhdGVSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQ8RGVidWdQcm90b2NvbC5FdmFsdWF0ZVJlc3BvbnNlPignZXZhbHVhdGUnLCBhcmdzKTtcblx0fVxuXG5cdGFzeW5jIHN0ZXBCYWNrKGFyZ3M6IERlYnVnUHJvdG9jb2wuU3RlcEJhY2tBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RlcEJhY2tSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1N0ZXBCYWNrKSB7XG5cdFx0XHR0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwID0gZmFsc2U7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZCgnc3RlcEJhY2snLCBhcmdzKTtcblx0XHRcdGlmICghdGhpcy5zdG9wcGVkU2luY2VMYXN0U3RlcCkge1xuXHRcdFx0XHR0aGlzLmZpcmVTaW11bGF0ZWRDb250aW51ZWRFdmVudChhcmdzLnRocmVhZElkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignc3RlcEJhY2sgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGFzeW5jIHJldmVyc2VDb250aW51ZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlJldmVyc2VDb250aW51ZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXZlcnNlQ29udGludWVSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1N0ZXBCYWNrKSB7XG5cdFx0XHR0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwID0gZmFsc2U7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZCgncmV2ZXJzZUNvbnRpbnVlJywgYXJncyk7XG5cdFx0XHRpZiAoIXRoaXMuc3RvcHBlZFNpbmNlTGFzdFN0ZXApIHtcblx0XHRcdFx0dGhpcy5maXJlU2ltdWxhdGVkQ29udGludWVkRXZlbnQoYXJncy50aHJlYWRJZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3JldmVyc2VDb250aW51ZSBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0Z290b1RhcmdldHMoYXJnczogRGVidWdQcm90b2NvbC5Hb3RvVGFyZ2V0c0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Hb3RvVGFyZ2V0c1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzR290b1RhcmdldHNSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZW5kKCdnb3RvVGFyZ2V0cycsIGFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdnb3RvVGFyZ2V0cyBpcyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0YXN5bmMgZ290byhhcmdzOiBEZWJ1Z1Byb3RvY29sLkdvdG9Bcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuR290b1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzR290b1RhcmdldHNSZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwID0gZmFsc2U7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZCgnZ290bycsIGFyZ3MpO1xuXHRcdFx0aWYgKCF0aGlzLnN0b3BwZWRTaW5jZUxhc3RTdGVwKSB7XG5cdFx0XHRcdHRoaXMuZmlyZVNpbXVsYXRlZENvbnRpbnVlZEV2ZW50KGFyZ3MudGhyZWFkSWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2dvdG8gaXMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGFzeW5jIHNldEluc3RydWN0aW9uQnJlYWtwb2ludHMoYXJnczogRGVidWdQcm90b2NvbC5TZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldEluc3RydWN0aW9uQnJlYWtwb2ludHNSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0luc3RydWN0aW9uQnJlYWtwb2ludHMpIHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnNlbmQoJ3NldEluc3RydWN0aW9uQnJlYWtwb2ludHMnLCBhcmdzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdzZXRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzIGlzIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRhc3luYyBkaXNhc3NlbWJsZShhcmdzOiBEZWJ1Z1Byb3RvY29sLkRpc2Fzc2VtYmxlQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkRpc2Fzc2VtYmxlUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEaXNhc3NlbWJsZVJlcXVlc3QpIHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnNlbmQoJ2Rpc2Fzc2VtYmxlJywgYXJncyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignZGlzYXNzZW1ibGUgaXMgbm90IHN1cHBvcnRlZCcpKTtcblx0fVxuXG5cdGFzeW5jIHJlYWRNZW1vcnkoYXJnczogRGVidWdQcm90b2NvbC5SZWFkTWVtb3J5QXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlJlYWRNZW1vcnlSZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcy5zdXBwb3J0c1JlYWRNZW1vcnlSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zZW5kKCdyZWFkTWVtb3J5JywgYXJncyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcigncmVhZE1lbW9yeSBpcyBub3Qgc3VwcG9ydGVkJykpO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVNZW1vcnkoYXJnczogRGVidWdQcm90b2NvbC5Xcml0ZU1lbW9yeUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Xcml0ZU1lbW9yeVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzV3JpdGVNZW1vcnlSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zZW5kKCd3cml0ZU1lbW9yeScsIGFyZ3MpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ3dyaXRlTWVtb3J5IGlzIG5vdCBzdXBwb3J0ZWQnKSk7XG5cdH1cblxuXHRjYW5jZWwoYXJnczogRGVidWdQcm90b2NvbC5DYW5jZWxBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuQ2FuY2VsUmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kKCdjYW5jZWwnLCBhcmdzKTtcblx0fVxuXG5cdGN1c3RvbShyZXF1ZXN0OiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmQocmVxdWVzdCwgYXJncyk7XG5cdH1cblxuXHQvLy0tLS0gcHJpdmF0ZVxuXG5cdHByaXZhdGUgYXN5bmMgc2h1dGRvd24oZXJyb3I/OiBFcnJvciwgcmVzdGFydCA9IGZhbHNlLCB0ZXJtaW5hdGVEZWJ1Z2dlZTogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCwgc3VzcGVuZERlYnVnZ2VlOiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmluU2h1dGRvd24pIHtcblx0XHRcdHRoaXMuaW5TaHV0ZG93biA9IHRydWU7XG5cdFx0XHRpZiAodGhpcy5kZWJ1Z0FkYXB0ZXIpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBhcmdzOiBEZWJ1Z1Byb3RvY29sLkRpc2Nvbm5lY3RBcmd1bWVudHMgPSB7IHJlc3RhcnQgfTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHRlcm1pbmF0ZURlYnVnZ2VlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0XHRcdGFyZ3MudGVybWluYXRlRGVidWdnZWUgPSB0ZXJtaW5hdGVEZWJ1Z2dlZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIHN1c3BlbmREZWJ1Z2dlZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0XHRhcmdzLnN1c3BlbmREZWJ1Z2dlZSA9IHN1c3BlbmREZWJ1Z2dlZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBpZiB0aGVyZSdzIGFuIGVycm9yLCB0aGUgREEgaXMgcHJvYmFibHkgYWxyZWFkeSBnb25lLCBzbyBnaXZlIGl0IGEgbXVjaCBzaG9ydGVyIHRpbWVvdXQuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zZW5kKCdkaXNjb25uZWN0JywgYXJncywgdW5kZWZpbmVkLCBlcnJvciA/IDIwMCA6IDIwMDApO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gQ2F0Y2ggdGhlIHBvdGVudGlhbCAnZGlzY29ubmVjdCcgZXJyb3IgLSBubyBuZWVkIHRvIHNob3cgaXQgdG8gdGhlIHVzZXIgc2luY2UgdGhlIGFkYXB0ZXIgaXMgc2h1dHRpbmcgZG93blxuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc3RvcEFkYXB0ZXIoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zdG9wQWRhcHRlcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdG9wQWRhcHRlcihlcnJvcj86IEVycm9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLmRlYnVnQWRhcHRlcikge1xuXHRcdFx0XHRjb25zdCBkYSA9IHRoaXMuZGVidWdBZGFwdGVyO1xuXHRcdFx0XHR0aGlzLmRlYnVnQWRhcHRlciA9IG51bGw7XG5cdFx0XHRcdGF3YWl0IGRhLnN0b3BTZXNzaW9uKCk7XG5cdFx0XHRcdHRoaXMuZGVidWdBZGFwdGVyU3RvcHBlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuZmlyZUFkYXB0ZXJFeGl0RXZlbnQoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmlyZUFkYXB0ZXJFeGl0RXZlbnQoZXJyb3I/OiBFcnJvcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5maXJlZEFkYXB0ZXJFeGl0RXZlbnQpIHtcblx0XHRcdHRoaXMuZmlyZWRBZGFwdGVyRXhpdEV2ZW50ID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3QgZTogQWRhcHRlckVuZEV2ZW50ID0ge1xuXHRcdFx0XHRlbWl0dGVkU3RvcHBlZDogdGhpcy5kaWRSZWNlaXZlU3RvcHBlZEV2ZW50LFxuXHRcdFx0XHRzZXNzaW9uTGVuZ3RoSW5TZWNvbmRzOiAobmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0aGlzLnN0YXJ0VGltZSkgLyAxMDAwXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGVycm9yICYmICF0aGlzLmRlYnVnQWRhcHRlclN0b3BwZWQpIHtcblx0XHRcdFx0ZS5lcnJvciA9IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRFeGl0QWRhcHRlci5maXJlKGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGlzcGF0Y2hSZXF1ZXN0KHJlcXVlc3Q6IERlYnVnUHJvdG9jb2wuUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UgPSB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2UnLFxuXHRcdFx0c2VxOiAwLFxuXHRcdFx0Y29tbWFuZDogcmVxdWVzdC5jb21tYW5kLFxuXHRcdFx0cmVxdWVzdF9zZXE6IHJlcXVlc3Quc2VxLFxuXHRcdFx0c3VjY2VzczogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCBzYWZlU2VuZFJlc3BvbnNlID0gKHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlKSA9PiB0aGlzLmRlYnVnQWRhcHRlciAmJiB0aGlzLmRlYnVnQWRhcHRlci5zZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuXG5cdFx0aWYgKHJlcXVlc3QuY29tbWFuZCA9PT0gJ2xhdW5jaFZTQ29kZScpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxldCByZXN1bHQgPSBhd2FpdCB0aGlzLmxhdW5jaFZzQ29kZSg8SUxhdW5jaFZTQ29kZUFyZ3VtZW50cz5yZXF1ZXN0LmFyZ3VtZW50cyk7XG5cdFx0XHRcdGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJpdmNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY2FuTm90U3RhcnQnLCBcIlRoZSBkZWJ1Z2dlciBuZWVkcyB0byBvcGVuIGEgbmV3IHRhYiBvciB3aW5kb3cgZm9yIHRoZSBkZWJ1Z2dlZSBidXQgdGhlIGJyb3dzZXIgcHJldmVudGVkIHRoaXMuIFlvdSBtdXN0IGdpdmUgcGVybWlzc2lvbiB0byBjb250aW51ZS5cIiksXG5cdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoeyBrZXk6ICdjb250aW51ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvbnRpbnVlXCIpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5sYXVuY2hWc0NvZGUoPElMYXVuY2hWU0NvZGVBcmd1bWVudHM+cmVxdWVzdC5hcmd1bWVudHMpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXNwb25zZS5zdWNjZXNzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRzYWZlU2VuZFJlc3BvbnNlKHJlc3BvbnNlKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuc2h1dGRvd24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzcG9uc2UuYm9keSA9IHtcblx0XHRcdFx0XHRyZW5kZXJlckRlYnVnQWRkcjogcmVzdWx0LnJlbmRlcmVyRGVidWdBZGRyLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzYWZlU2VuZFJlc3BvbnNlKHJlc3BvbnNlKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXNwb25zZS5zdWNjZXNzID0gZmFsc2U7XG5cdFx0XHRcdHJlc3BvbnNlLm1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcblx0XHRcdFx0c2FmZVNlbmRSZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChyZXF1ZXN0LmNvbW1hbmQgPT09ICdydW5JblRlcm1pbmFsJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2hlbGxQcm9jZXNzSWQgPSBhd2FpdCB0aGlzLmRiZ3IucnVuSW5UZXJtaW5hbChyZXF1ZXN0LmFyZ3VtZW50cyBhcyBEZWJ1Z1Byb3RvY29sLlJ1bkluVGVybWluYWxSZXF1ZXN0QXJndW1lbnRzLCB0aGlzLnNlc3Npb25JZCk7XG5cdFx0XHRcdGNvbnN0IHJlc3AgPSByZXNwb25zZSBhcyBEZWJ1Z1Byb3RvY29sLlJ1bkluVGVybWluYWxSZXNwb25zZTtcblx0XHRcdFx0cmVzcC5ib2R5ID0ge307XG5cdFx0XHRcdGlmICh0eXBlb2Ygc2hlbGxQcm9jZXNzSWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0cmVzcC5ib2R5LnNoZWxsUHJvY2Vzc0lkID0gc2hlbGxQcm9jZXNzSWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2FmZVNlbmRSZXNwb25zZShyZXNwKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXNwb25zZS5zdWNjZXNzID0gZmFsc2U7XG5cdFx0XHRcdHJlc3BvbnNlLm1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcblx0XHRcdFx0c2FmZVNlbmRSZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChyZXF1ZXN0LmNvbW1hbmQgPT09ICdzdGFydERlYnVnZ2luZycpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFyZ3MgPSAocmVxdWVzdC5hcmd1bWVudHMgYXMgRGVidWdQcm90b2NvbC5TdGFydERlYnVnZ2luZ1JlcXVlc3RBcmd1bWVudHMpO1xuXHRcdFx0XHRjb25zdCBjb25maWc6IElDb25maWcgPSB7XG5cdFx0XHRcdFx0Li4uYXJncy5jb25maWd1cmF0aW9uLFxuXHRcdFx0XHRcdC4uLntcblx0XHRcdFx0XHRcdHJlcXVlc3Q6IGFyZ3MucmVxdWVzdCxcblx0XHRcdFx0XHRcdHR5cGU6IHRoaXMuZGJnci50eXBlLFxuXHRcdFx0XHRcdFx0bmFtZTogYXJncy5jb25maWd1cmF0aW9uLm5hbWUgfHwgdGhpcy5uYW1lXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5kYmdyLnN0YXJ0RGVidWdnaW5nKGNvbmZpZywgdGhpcy5zZXNzaW9uSWQpO1xuXHRcdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRcdHNhZmVTZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3BvbnNlLnN1Y2Nlc3MgPSBmYWxzZTtcblx0XHRcdFx0XHRyZXNwb25zZS5tZXNzYWdlID0gJ0ZhaWxlZCB0byBzdGFydCBkZWJ1Z2dpbmcnO1xuXHRcdFx0XHRcdHNhZmVTZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmVzcG9uc2Uuc3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0XHRyZXNwb25zZS5tZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG5cdFx0XHRcdHNhZmVTZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNwb25zZS5zdWNjZXNzID0gZmFsc2U7XG5cdFx0XHRyZXNwb25zZS5tZXNzYWdlID0gYHVua25vd24gcmVxdWVzdCAnJHtyZXF1ZXN0LmNvbW1hbmR9J2A7XG5cdFx0XHRzYWZlU2VuZFJlc3BvbnNlKHJlc3BvbnNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxhdW5jaFZzQ29kZSh2c2NvZGVBcmdzOiBJTGF1bmNoVlNDb2RlQXJndW1lbnRzKTogUHJvbWlzZTxJT3BlbkV4dGVuc2lvbldpbmRvd1Jlc3VsdD4ge1xuXG5cdFx0Y29uc3QgYXJnczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgYXJnIG9mIHZzY29kZUFyZ3MuYXJncykge1xuXHRcdFx0Y29uc3QgYTIgPSAoYXJnLnByZWZpeCB8fCAnJykgKyAoYXJnLnBhdGggfHwgJycpO1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSAvXi0tKC4rKT0oLispJC8uZXhlYyhhMik7XG5cdFx0XHRpZiAobWF0Y2ggJiYgbWF0Y2gubGVuZ3RoID09PSAzKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IG1hdGNoWzFdO1xuXHRcdFx0XHRsZXQgdmFsdWUgPSBtYXRjaFsyXTtcblxuXHRcdFx0XHRpZiAoKGtleSA9PT0gJ2ZpbGUtdXJpJyB8fCBrZXkgPT09ICdmb2xkZXItdXJpJykgJiYgIWlzVXJpU3RyaW5nKGFyZy5wYXRoKSkge1xuXHRcdFx0XHRcdHZhbHVlID0gaXNVcmlTdHJpbmcodmFsdWUpID8gdmFsdWUgOiBVUkkuZmlsZSh2YWx1ZSkudG9TdHJpbmcoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhcmdzLnB1c2goYC0tJHtrZXl9PSR7dmFsdWV9YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhcmdzLnB1c2goYTIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh2c2NvZGVBcmdzLmVudikge1xuXHRcdFx0YXJncy5wdXNoKGAtLWV4dGVuc2lvbkVudmlyb25tZW50PSR7SlNPTi5zdHJpbmdpZnkodnNjb2RlQXJncy5lbnYpfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2Uub3BlbkV4dGVuc2lvbkRldmVsb3BtZW50SG9zdFdpbmRvdyhhcmdzLCAhIXZzY29kZUFyZ3MuZGVidWdSZW5kZXJlcik7XG5cdH1cblxuXHRwcml2YXRlIHNlbmQ8UiBleHRlbmRzIERlYnVnUHJvdG9jb2wuUmVzcG9uc2U+KGNvbW1hbmQ6IHN0cmluZywgYXJnczogYW55LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuLCB0aW1lb3V0PzogbnVtYmVyLCBzaG93RXJyb3JzID0gdHJ1ZSk6IFByb21pc2U8UiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlIHwgdW5kZWZpbmVkPigoY29tcGxldGVEaXNwYXRjaCwgZXJyb3JEaXNwYXRjaCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmRlYnVnQWRhcHRlcikge1xuXHRcdFx0XHRpZiAodGhpcy5pblNodXRkb3duKSB7XG5cdFx0XHRcdFx0Ly8gV2UgYXJlIGluIHNodXRkb3duIHNpbGVudGx5IGNvbXBsZXRlXG5cdFx0XHRcdFx0Y29tcGxldGVEaXNwYXRjaCh1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVycm9yRGlzcGF0Y2gobmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnbm9EZWJ1Z0FkYXB0ZXInLCBcIk5vIGRlYnVnZ2VyIGF2YWlsYWJsZSBmb3VuZC4gQ2FuIG5vdCBzZW5kICd7MH0nLlwiLCBjb21tYW5kKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGNhbmNlbGF0aW9uTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXHRcdFx0Y29uc3QgcmVxdWVzdElkID0gdGhpcy5kZWJ1Z0FkYXB0ZXIuc2VuZFJlcXVlc3QoY29tbWFuZCwgYXJncywgKHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlKSA9PiB7XG5cdFx0XHRcdGNhbmNlbGF0aW9uTGlzdGVuZXI/LmRpc3Bvc2UoKTtcblxuXHRcdFx0XHRpZiAocmVzcG9uc2Uuc3VjY2Vzcykge1xuXHRcdFx0XHRcdGNvbXBsZXRlRGlzcGF0Y2gocmVzcG9uc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVycm9yRGlzcGF0Y2gocmVzcG9uc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0aW1lb3V0KTtcblxuXHRcdFx0aWYgKHRva2VuKSB7XG5cdFx0XHRcdGNhbmNlbGF0aW9uTGlzdGVuZXIgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0Y2FuY2VsYXRpb25MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ2FuY2VsUmVxdWVzdCkge1xuXHRcdFx0XHRcdFx0dGhpcy5jYW5jZWwoeyByZXF1ZXN0SWQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KS50aGVuKHVuZGVmaW5lZCwgZXJyID0+IFByb21pc2UucmVqZWN0KHRoaXMuaGFuZGxlRXJyb3JSZXNwb25zZShlcnIsIHNob3dFcnJvcnMpKSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUVycm9yUmVzcG9uc2UoZXJyb3JSZXNwb25zZTogRGVidWdQcm90b2NvbC5SZXNwb25zZSwgc2hvd0Vycm9yczogYm9vbGVhbik6IEVycm9yIHtcblxuXHRcdGlmIChlcnJvclJlc3BvbnNlLmNvbW1hbmQgPT09ICdjYW5jZWxlZCcgJiYgZXJyb3JSZXNwb25zZS5tZXNzYWdlID09PSAnY2FuY2VsZWQnKSB7XG5cdFx0XHRyZXR1cm4gbmV3IGVycm9ycy5DYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVycm9yOiBEZWJ1Z1Byb3RvY29sLk1lc3NhZ2UgfCB1bmRlZmluZWQgPSBlcnJvclJlc3BvbnNlPy5ib2R5Py5lcnJvcjtcblx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvclJlc3BvbnNlPy5tZXNzYWdlIHx8ICcnO1xuXG5cdFx0Y29uc3QgdXNlck1lc3NhZ2UgPSBlcnJvciA/IGZvcm1hdFBJSShlcnJvci5mb3JtYXQsIGZhbHNlLCBlcnJvci52YXJpYWJsZXMpIDogZXJyb3JNZXNzYWdlO1xuXHRcdGNvbnN0IHVybCA9IGVycm9yPy51cmw7XG5cdFx0aWYgKGVycm9yICYmIHVybCkge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBlcnJvci51cmxMYWJlbCA/IGVycm9yLnVybExhYmVsIDogbmxzLmxvY2FsaXplKCdtb3JlSW5mbycsIFwiTW9yZSBJbmZvXCIpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHVybCk7XG5cdFx0XHQvLyBVc2UgYSBzdWZmaXhlZCBpZCBpZiB1cmkgaW52b2tlcyBhIGNvbW1hbmQsIHNvIGRlZmF1bHQgJ09wZW4gbGF1bmNoLmpzb24nIGNvbW1hbmQgaXMgc3VwcHJlc3NlZCBvbiBkaWFsb2dcblx0XHRcdGNvbnN0IGFjdGlvbklkID0gdXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5jb21tYW5kID8gJ2RlYnVnLm1vcmVJbmZvLmNvbW1hbmQnIDogJ2RlYnVnLm1vcmVJbmZvJztcblx0XHRcdHJldHVybiBjcmVhdGVFcnJvcldpdGhBY3Rpb25zKHVzZXJNZXNzYWdlLCBbdG9BY3Rpb24oeyBpZDogYWN0aW9uSWQsIGxhYmVsLCBydW46ICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pIH0pXSk7XG5cdFx0fVxuXHRcdGlmIChzaG93RXJyb3JzICYmIGVycm9yICYmIGVycm9yLmZvcm1hdCAmJiBlcnJvci5zaG93VXNlcikge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKHVzZXJNZXNzYWdlKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IGVycm9ycy5FcnJvck5vVGVsZW1ldHJ5KHVzZXJNZXNzYWdlKTtcblx0XHQocmVzdWx0IGFzIHsgc2hvd1VzZXI/OiBib29sZWFuIH0pLnNob3dVc2VyID0gZXJyb3I/LnNob3dVc2VyO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VDYXBhYmlsaXRpZXMoY2FwYWJpbGl0aWVzOiBEZWJ1Z1Byb3RvY29sLkNhcGFiaWxpdGllcyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChjYXBhYmlsaXRpZXMpIHtcblx0XHRcdHRoaXMuX2NhcGFiaWxpdGllcyA9IG9iamVjdHMubWl4aW4odGhpcy5fY2FwYWJpbGl0aWVzLCBjYXBhYmlsaXRpZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmlyZVNpbXVsYXRlZENvbnRpbnVlZEV2ZW50KHRocmVhZElkOiBudW1iZXIsIGFsbFRocmVhZHNDb250aW51ZWQgPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ29udGludWVkLmZpcmUoe1xuXHRcdFx0dHlwZTogJ2V2ZW50Jyxcblx0XHRcdGV2ZW50OiAnY29udGludWVkJyxcblx0XHRcdGJvZHk6IHtcblx0XHRcdFx0dGhyZWFkSWQsXG5cdFx0XHRcdGFsbFRocmVhZHNDb250aW51ZWRcblx0XHRcdH0sXG5cdFx0XHRzZXE6IHVuZGVmaW5lZCFcblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy50b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFnQixlQUFlO0FBQy9CLFlBQVksYUFBYTtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFlBQVk7QUFDeEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxXQUFXLG1CQUFtQjtBQUV2QyxTQUFTLGtDQUE4RDtBQUN2RSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBb0M7QUFFN0MsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQXFCakIsSUFBTSxrQkFBTixNQUE2QztBQUFBLEVBeUNuRCxZQUNDLGNBQ2dCLE1BQ0MsV0FDQSxNQUM0QiwyQkFDWixlQUNNLHFCQUNOLGVBQ2hDO0FBUGU7QUFDQztBQUNBO0FBQzRCO0FBQ1o7QUFDTTtBQUNOO0FBL0NsQyxTQUFRLHNCQUFzQjtBQUM5QixTQUFRLHVCQUF1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
