import { DeferredPromise } from "../../../../../base/common/async.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { AbstractDebugAdapter } from "../../common/abstractDebugAdapter.js";
import { State } from "../../common/debug.js";
import { DebugStorage } from "../../common/debugStorage.js";
class MockDebugService {
  get state() {
    throw new Error("not implemented");
  }
  get onWillNewSession() {
    throw new Error("not implemented");
  }
  get onDidNewSession() {
    throw new Error("not implemented");
  }
  get onDidEndSession() {
    throw new Error("not implemented");
  }
  get onDidChangeState() {
    throw new Error("not implemented");
  }
  getConfigurationManager() {
    throw new Error("not implemented");
  }
  getAdapterManager() {
    throw new Error("Method not implemented.");
  }
  canSetBreakpointsIn(model) {
    throw new Error("Method not implemented.");
  }
  focusStackFrame(focusedStackFrame) {
    throw new Error("not implemented");
  }
  sendAllBreakpoints(session) {
    throw new Error("not implemented");
  }
  sendBreakpoints(modelUri, sourceModified, session) {
    throw new Error("not implemented");
  }
  addBreakpoints(uri2, rawBreakpoints) {
    throw new Error("not implemented");
  }
  updateBreakpoints(uri2, data, sendOnResourceSaved) {
    throw new Error("not implemented");
  }
  enableOrDisableBreakpoints(enabled) {
    throw new Error("not implemented");
  }
  setBreakpointsActivated() {
    throw new Error("not implemented");
  }
  removeBreakpoints() {
    throw new Error("not implemented");
  }
  addInstructionBreakpoint(opts) {
    throw new Error("Method not implemented.");
  }
  removeInstructionBreakpoints(address) {
    throw new Error("Method not implemented.");
  }
  setExceptionBreakpointCondition(breakpoint, condition) {
    throw new Error("Method not implemented.");
  }
  setExceptionBreakpointsForSession(session, data) {
    throw new Error("Method not implemented.");
  }
  addFunctionBreakpoint() {
  }
  moveWatchExpression(id, position) {
  }
  updateFunctionBreakpoint(id, update) {
    throw new Error("not implemented");
  }
  removeFunctionBreakpoints(id) {
    throw new Error("not implemented");
  }
  addDataBreakpoint() {
    throw new Error("Method not implemented.");
  }
  updateDataBreakpoint(id, update) {
    throw new Error("not implemented");
  }
  removeDataBreakpoints(id) {
    throw new Error("Method not implemented.");
  }
  addReplExpression(name) {
    throw new Error("not implemented");
  }
  removeReplExpressions() {
  }
  addWatchExpression(name) {
    throw new Error("not implemented");
  }
  renameWatchExpression(id, newName) {
    throw new Error("not implemented");
  }
  removeWatchExpressions(id) {
  }
  startDebugging(launch, configOrName, options) {
    return Promise.resolve(true);
  }
  restartSession() {
    throw new Error("not implemented");
  }
  stopSession() {
    throw new Error("not implemented");
  }
  getModel() {
    throw new Error("not implemented");
  }
  getViewModel() {
    throw new Error("not implemented");
  }
  sourceIsNotAvailable(uri2) {
  }
  tryToAutoFocusStackFrame(thread) {
    throw new Error("not implemented");
  }
  runTo(uri2, lineNumber, column) {
    throw new Error("Method not implemented.");
  }
}
class MockSession {
  constructor() {
    this.suppressDebugToolbar = false;
    this.suppressDebugStatusbar = false;
    this.suppressDebugView = false;
    this.autoExpandLazyVariables = false;
    this.configuration = { type: "mock", name: "mock", request: "launch" };
    this.unresolvedConfiguration = { type: "mock", name: "mock", request: "launch" };
    this.state = State.Stopped;
    this.capabilities = {};
  }
  dispose() {
  }
  getMemory(memoryReference) {
    throw new Error("Method not implemented.");
  }
  get onDidInvalidateMemory() {
    throw new Error("Not implemented");
  }
  readMemory(memoryReference, offset, count) {
    throw new Error("Method not implemented.");
  }
  writeMemory(memoryReference, offset, data, allowPartial) {
    throw new Error("Method not implemented.");
  }
  cancelCorrelatedTestRun() {
  }
  get compoundRoot() {
    return void 0;
  }
  get saveBeforeRestart() {
    return true;
  }
  get isSimpleUI() {
    return false;
  }
  get lifecycleManagedByParent() {
    return false;
  }
  stepInTargets(frameId) {
    throw new Error("Method not implemented.");
  }
  cancel(_progressId) {
    throw new Error("Method not implemented.");
  }
  breakpointsLocations(uri2, lineNumber) {
    throw new Error("Method not implemented.");
  }
  dataBytesBreakpointInfo(address, bytes) {
    throw new Error("Method not implemented.");
  }
  dataBreakpointInfo(name, variablesReference, frameId) {
    throw new Error("Method not implemented.");
  }
  sendDataBreakpoints(dbps) {
    throw new Error("Method not implemented.");
  }
  get compact() {
    return false;
  }
  setSubId(subId) {
    throw new Error("Method not implemented.");
  }
  get parentSession() {
    return void 0;
  }
  getReplElements() {
    return [];
  }
  hasSeparateRepl() {
    return true;
  }
  removeReplExpressions() {
  }
  get onDidChangeReplElements() {
    throw new Error("not implemented");
  }
  addReplExpression(stackFrame, name) {
    return Promise.resolve(void 0);
  }
  appendToRepl(data) {
  }
  getId() {
    return "mock";
  }
  getLabel() {
    return "mockname";
  }
  get name() {
    return "mockname";
  }
  setName(name) {
    throw new Error("not implemented");
  }
  getSourceForUri(modelUri) {
    throw new Error("not implemented");
  }
  getThread(threadId) {
    throw new Error("not implemented");
  }
  getStoppedDetails() {
    throw new Error("not implemented");
  }
  get onDidCustomEvent() {
    throw new Error("not implemented");
  }
  get onDidLoadedSource() {
    throw new Error("not implemented");
  }
  get onDidChangeState() {
    throw new Error("not implemented");
  }
  get onDidEndAdapter() {
    throw new Error("not implemented");
  }
  get onDidChangeName() {
    throw new Error("not implemented");
  }
  get onDidProgressStart() {
    throw new Error("not implemented");
  }
  get onDidProgressUpdate() {
    throw new Error("not implemented");
  }
  get onDidProgressEnd() {
    throw new Error("not implemented");
  }
  setConfiguration(configuration) {
  }
  getAllThreads() {
    return [];
  }
  getSource(raw) {
    throw new Error("not implemented");
  }
  getLoadedSources() {
    return Promise.resolve([]);
  }
  completions(frameId, threadId, text, position) {
    throw new Error("not implemented");
  }
  clearThreads(removeThreads, reference) {
  }
  rawUpdate(data) {
  }
  initialize(dbgr) {
    throw new Error("Method not implemented.");
  }
  launchOrAttach(config) {
    throw new Error("Method not implemented.");
  }
  restart() {
    throw new Error("Method not implemented.");
  }
  sendBreakpoints(modelUri, bpts, sourceModified) {
    throw new Error("Method not implemented.");
  }
  sendFunctionBreakpoints(fbps) {
    throw new Error("Method not implemented.");
  }
  sendExceptionBreakpoints(exbpts) {
    throw new Error("Method not implemented.");
  }
  sendInstructionBreakpoints(dbps) {
    throw new Error("Method not implemented.");
  }
  getDebugProtocolBreakpoint(breakpointId) {
    throw new Error("Method not implemented.");
  }
  customRequest(request, args) {
    throw new Error("Method not implemented.");
  }
  stackTrace(threadId, startFrame, levels, token) {
    throw new Error("Method not implemented.");
  }
  exceptionInfo(threadId) {
    throw new Error("Method not implemented.");
  }
  scopes(frameId) {
    throw new Error("Method not implemented.");
  }
  variables(variablesReference, threadId, filter, start, count) {
    throw new Error("Method not implemented.");
  }
  evaluate(expression, frameId, context) {
    throw new Error("Method not implemented.");
  }
  restartFrame(frameId, threadId) {
    throw new Error("Method not implemented.");
  }
  next(threadId, granularity) {
    throw new Error("Method not implemented.");
  }
  stepIn(threadId, targetId, granularity) {
    throw new Error("Method not implemented.");
  }
  stepOut(threadId, granularity) {
    throw new Error("Method not implemented.");
  }
  stepBack(threadId, granularity) {
    throw new Error("Method not implemented.");
  }
  continue(threadId) {
    throw new Error("Method not implemented.");
  }
  reverseContinue(threadId) {
    throw new Error("Method not implemented.");
  }
  pause(threadId) {
    throw new Error("Method not implemented.");
  }
  terminateThreads(threadIds) {
    throw new Error("Method not implemented.");
  }
  setVariable(variablesReference, name, value) {
    throw new Error("Method not implemented.");
  }
  setExpression(frameId, expression, value) {
    throw new Error("Method not implemented.");
  }
  loadSource(resource) {
    throw new Error("Method not implemented.");
  }
  disassemble(memoryReference, offset, instructionOffset, instructionCount) {
    throw new Error("Method not implemented.");
  }
  terminate(restart = false) {
    throw new Error("Method not implemented.");
  }
  disconnect(restart = false) {
    throw new Error("Method not implemented.");
  }
  gotoTargets(source, line, column) {
    throw new Error("Method not implemented.");
  }
  goto(threadId, targetId) {
    throw new Error("Method not implemented.");
  }
  resolveLocationReference(locationReference) {
    throw new Error("Method not implemented.");
  }
}
class MockRawSession {
  constructor() {
    this.capabilities = {};
    this.disconnected = false;
    this.sessionLengthInSeconds = 0;
    this.readyForBreakpoints = true;
    this.emittedStopped = true;
    this.onDidStop = null;
  }
  getLengthInSeconds() {
    return 100;
  }
  stackTrace(args) {
    return Promise.resolve({
      seq: 1,
      type: "response",
      request_seq: 1,
      success: true,
      command: "stackTrace",
      body: {
        stackFrames: [{
          id: 1,
          name: "mock",
          line: 5,
          column: 6
        }]
      }
    });
  }
  exceptionInfo(args) {
    throw new Error("not implemented");
  }
  launchOrAttach(args) {
    throw new Error("not implemented");
  }
  scopes(args) {
    throw new Error("not implemented");
  }
  variables(args) {
    throw new Error("not implemented");
  }
  evaluate(args) {
    return Promise.resolve(null);
  }
  custom(request, args) {
    throw new Error("not implemented");
  }
  terminate(restart = false) {
    throw new Error("not implemented");
  }
  disconnect() {
    throw new Error("not implemented");
  }
  threads() {
    throw new Error("not implemented");
  }
  stepIn(args) {
    throw new Error("not implemented");
  }
  stepOut(args) {
    throw new Error("not implemented");
  }
  stepBack(args) {
    throw new Error("not implemented");
  }
  continue(args) {
    throw new Error("not implemented");
  }
  reverseContinue(args) {
    throw new Error("not implemented");
  }
  pause(args) {
    throw new Error("not implemented");
  }
  terminateThreads(args) {
    throw new Error("not implemented");
  }
  setVariable(args) {
    throw new Error("not implemented");
  }
  restartFrame(args) {
    throw new Error("not implemented");
  }
  completions(args) {
    throw new Error("not implemented");
  }
  next(args) {
    throw new Error("not implemented");
  }
  source(args) {
    throw new Error("not implemented");
  }
  loadedSources(args) {
    throw new Error("not implemented");
  }
  setBreakpoints(args) {
    throw new Error("not implemented");
  }
  setFunctionBreakpoints(args) {
    throw new Error("not implemented");
  }
  setExceptionBreakpoints(args) {
    throw new Error("not implemented");
  }
}
class MockDebugAdapter extends AbstractDebugAdapter {
  constructor() {
    super(...arguments);
    this.seq = 0;
    this.pendingResponses = /* @__PURE__ */ new Map();
  }
  startSession() {
    return Promise.resolve();
  }
  stopSession() {
    return Promise.resolve();
  }
  sendMessage(message) {
    if (message.type === "request") {
      setTimeout(() => {
        const request = message;
        switch (request.command) {
          case "evaluate":
            this.evaluate(request, request.arguments);
            return;
        }
        this.sendResponseBody(request, {});
        return;
      }, 0);
    } else if (message.type === "response") {
      const response = message;
      if (this.pendingResponses.has(response.command)) {
        this.pendingResponses.get(response.command).complete(response);
      }
    }
  }
  sendResponseBody(request, body) {
    const response = {
      seq: ++this.seq,
      type: "response",
      request_seq: request.seq,
      command: request.command,
      success: true,
      body
    };
    this.acceptMessage(response);
  }
  sendEventBody(event, body) {
    const response = {
      seq: ++this.seq,
      type: "event",
      event,
      body
    };
    this.acceptMessage(response);
  }
  waitForResponseFromClient(command) {
    const deferred = new DeferredPromise();
    if (this.pendingResponses.has(command)) {
      return this.pendingResponses.get(command).p;
    }
    this.pendingResponses.set(command, deferred);
    return deferred.p;
  }
  sendRequestBody(command, args) {
    const response = {
      seq: ++this.seq,
      type: "request",
      command,
      arguments: args
    };
    this.acceptMessage(response);
  }
  evaluate(request, args) {
    if (args.expression.indexOf("before.") === 0) {
      this.sendEventBody("output", { output: args.expression });
    }
    this.sendResponseBody(request, {
      result: "=" + args.expression,
      variablesReference: 0
    });
    if (args.expression.indexOf("after.") === 0) {
      this.sendEventBody("output", { output: args.expression });
    }
  }
}
class MockDebugStorage extends DebugStorage {
  constructor(storageService) {
    super(storageService, void 0, void 0, new NullLogService());
  }
}
export {
  MockDebugAdapter,
  MockDebugService,
  MockDebugStorage,
  MockRawSession,
  MockSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxjb21tb25cXG1vY2tEZWJ1Zy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3REZWJ1Z0FkYXB0ZXIgfSBmcm9tICcuLi8uLi9jb21tb24vYWJzdHJhY3REZWJ1Z0FkYXB0ZXIuanMnO1xuaW1wb3J0IHsgQWRhcHRlckVuZEV2ZW50LCBJQWRhcHRlck1hbmFnZXIsIElCcmVha3BvaW50LCBJQnJlYWtwb2ludERhdGEsIElCcmVha3BvaW50VXBkYXRlRGF0YSwgSUNvbmZpZywgSUNvbmZpZ3VyYXRpb25NYW5hZ2VyLCBJRGF0YUJyZWFrcG9pbnQsIElEYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSwgSURlYnVnTG9jYXRpb25SZWZlcmVuY2VkLCBJRGVidWdNb2RlbCwgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgSURlYnVnU2Vzc2lvbk9wdGlvbnMsIElEZWJ1Z2dlciwgSUV4Y2VwdGlvbkJyZWFrcG9pbnQsIElFeGNlcHRpb25JbmZvLCBJRnVuY3Rpb25CcmVha3BvaW50LCBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50LCBJTGF1bmNoLCBJTWVtb3J5UmVnaW9uLCBJTmV3UmVwbEVsZW1lbnREYXRhLCBJUmF3TW9kZWxVcGRhdGUsIElSYXdTdG9wcGVkRGV0YWlscywgSVJlcGxFbGVtZW50LCBJU3RhY2tGcmFtZSwgSVRocmVhZCwgSVZpZXdNb2RlbCwgTG9hZGVkU291cmNlRXZlbnQsIFN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IERlYnVnQ29tcG91bmRSb290IH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlYnVnQ29tcG91bmRSb290LmpzJztcbmltcG9ydCB7IElJbnN0cnVjdGlvbkJyZWFrcG9pbnRPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RlYnVnU291cmNlLmpzJztcbmltcG9ydCB7IERlYnVnU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9kZWJ1Z1N0b3JhZ2UuanMnO1xuXG5leHBvcnQgY2xhc3MgTW9ja0RlYnVnU2VydmljZSBpbXBsZW1lbnRzIElEZWJ1Z1NlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Z2V0IHN0YXRlKCk6IFN0YXRlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0Z2V0IG9uV2lsbE5ld1Nlc3Npb24oKTogRXZlbnQ8SURlYnVnU2Vzc2lvbj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXQgb25EaWROZXdTZXNzaW9uKCk6IEV2ZW50PElEZWJ1Z1Nlc3Npb24+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0Z2V0IG9uRGlkRW5kU2Vzc2lvbigpOiBFdmVudDx7IHNlc3Npb246IElEZWJ1Z1Nlc3Npb247IHJlc3RhcnQ6IGJvb2xlYW4gfT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VTdGF0ZSgpOiBFdmVudDxTdGF0ZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uTWFuYWdlcigpOiBJQ29uZmlndXJhdGlvbk1hbmFnZXIge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXRBZGFwdGVyTWFuYWdlcigpOiBJQWRhcHRlck1hbmFnZXIge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGNhblNldEJyZWFrcG9pbnRzSW4obW9kZWw6IElUZXh0TW9kZWwpOiBib29sZWFuIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRmb2N1c1N0YWNrRnJhbWUoZm9jdXNlZFN0YWNrRnJhbWU6IElTdGFja0ZyYW1lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHNlbmRBbGxCcmVha3BvaW50cyhzZXNzaW9uPzogSURlYnVnU2Vzc2lvbik6IFByb21pc2U8YW55PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHNlbmRCcmVha3BvaW50cyhtb2RlbFVyaTogdXJpLCBzb3VyY2VNb2RpZmllZD86IGJvb2xlYW4gfCB1bmRlZmluZWQsIHNlc3Npb24/OiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0YWRkQnJlYWtwb2ludHModXJpOiB1cmksIHJhd0JyZWFrcG9pbnRzOiBJQnJlYWtwb2ludERhdGFbXSk6IFByb21pc2U8SUJyZWFrcG9pbnRbXT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHR1cGRhdGVCcmVha3BvaW50cyh1cmk6IHVyaSwgZGF0YTogTWFwPHN0cmluZywgSUJyZWFrcG9pbnRVcGRhdGVEYXRhPiwgc2VuZE9uUmVzb3VyY2VTYXZlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRlbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhlbmFibGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHNldEJyZWFrcG9pbnRzQWN0aXZhdGVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRyZW1vdmVCcmVha3BvaW50cygpOiBQcm9taXNlPGFueT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRhZGRJbnN0cnVjdGlvbkJyZWFrcG9pbnQob3B0czogSUluc3RydWN0aW9uQnJlYWtwb2ludE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRyZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKGFkZHJlc3M/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRzZXRFeGNlcHRpb25CcmVha3BvaW50Q29uZGl0aW9uKGJyZWFrcG9pbnQ6IElFeGNlcHRpb25CcmVha3BvaW50LCBjb25kaXRpb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBkYXRhOiBEZWJ1Z1Byb3RvY29sLkV4Y2VwdGlvbkJyZWFrcG9pbnRzRmlsdGVyW10pOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRhZGRGdW5jdGlvbkJyZWFrcG9pbnQoKTogdm9pZCB7IH1cblxuXHRtb3ZlV2F0Y2hFeHByZXNzaW9uKGlkOiBzdHJpbmcsIHBvc2l0aW9uOiBudW1iZXIpOiB2b2lkIHsgfVxuXG5cdHVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludChpZDogc3RyaW5nLCB1cGRhdGU6IHsgbmFtZT86IHN0cmluZzsgaGl0Q29uZGl0aW9uPzogc3RyaW5nOyBjb25kaXRpb24/OiBzdHJpbmcgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRyZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdGFkZERhdGFCcmVha3BvaW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHVwZGF0ZURhdGFCcmVha3BvaW50KGlkOiBzdHJpbmcsIHVwZGF0ZTogeyBoaXRDb25kaXRpb24/OiBzdHJpbmc7IGNvbmRpdGlvbj86IHN0cmluZyB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHJlbW92ZURhdGFCcmVha3BvaW50cyhpZD86IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGFkZFJlcGxFeHByZXNzaW9uKG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRyZW1vdmVSZXBsRXhwcmVzc2lvbnMoKTogdm9pZCB7IH1cblxuXHRhZGRXYXRjaEV4cHJlc3Npb24obmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRyZW5hbWVXYXRjaEV4cHJlc3Npb24oaWQ6IHN0cmluZywgbmV3TmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoaWQ/OiBzdHJpbmcpOiB2b2lkIHsgfVxuXG5cdHN0YXJ0RGVidWdnaW5nKGxhdW5jaDogSUxhdW5jaCwgY29uZmlnT3JOYW1lPzogSUNvbmZpZyB8IHN0cmluZywgb3B0aW9ucz86IElEZWJ1Z1Nlc3Npb25PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0fVxuXG5cdHJlc3RhcnRTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHN0b3BTZXNzaW9uKCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdGdldE1vZGVsKCk6IElEZWJ1Z01vZGVsIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0Z2V0Vmlld01vZGVsKCk6IElWaWV3TW9kZWwge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRzb3VyY2VJc05vdEF2YWlsYWJsZSh1cmk6IHVyaSk6IHZvaWQgeyB9XG5cblx0dHJ5VG9BdXRvRm9jdXNTdGFja0ZyYW1lKHRocmVhZDogSVRocmVhZCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHJ1blRvKHVyaTogdXJpLCBsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbj86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW9ja1Nlc3Npb24gaW1wbGVtZW50cyBJRGVidWdTZXNzaW9uIHtcblx0cmVhZG9ubHkgc3VwcHJlc3NEZWJ1Z1Rvb2xiYXIgPSBmYWxzZTtcblx0cmVhZG9ubHkgc3VwcHJlc3NEZWJ1Z1N0YXR1c2JhciA9IGZhbHNlO1xuXHRyZWFkb25seSBzdXBwcmVzc0RlYnVnVmlldyA9IGZhbHNlO1xuXHRyZWFkb25seSBhdXRvRXhwYW5kTGF6eVZhcmlhYmxlcyA9IGZhbHNlO1xuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cblx0fVxuXG5cdGdldE1lbW9yeShtZW1vcnlSZWZlcmVuY2U6IHN0cmluZyk6IElNZW1vcnlSZWdpb24ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGdldCBvbkRpZEludmFsaWRhdGVNZW1vcnkoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5NZW1vcnlFdmVudD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRyZWFkTWVtb3J5KG1lbW9yeVJlZmVyZW5jZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgY291bnQ6IG51bWJlcik6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZWFkTWVtb3J5UmVzcG9uc2UgfCB1bmRlZmluZWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHR3cml0ZU1lbW9yeShtZW1vcnlSZWZlcmVuY2U6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIsIGRhdGE6IHN0cmluZywgYWxsb3dQYXJ0aWFsPzogYm9vbGVhbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5Xcml0ZU1lbW9yeVJlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Y2FuY2VsQ29ycmVsYXRlZFRlc3RSdW4oKTogdm9pZCB7XG5cblx0fVxuXG5cdGdldCBjb21wb3VuZFJvb3QoKTogRGVidWdDb21wb3VuZFJvb3QgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgc2F2ZUJlZm9yZVJlc3RhcnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXQgaXNTaW1wbGVVSSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXQgbGlmZWN5Y2xlTWFuYWdlZEJ5UGFyZW50KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHN0ZXBJblRhcmdldHMoZnJhbWVJZDogbnVtYmVyKTogUHJvbWlzZTx7IGlkOiBudW1iZXI7IGxhYmVsOiBzdHJpbmcgfVtdPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Y2FuY2VsKF9wcm9ncmVzc0lkOiBzdHJpbmcpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuQ2FuY2VsUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRicmVha3BvaW50c0xvY2F0aW9ucyh1cmk6IHVyaSwgbGluZU51bWJlcjogbnVtYmVyKTogUHJvbWlzZTxJUG9zaXRpb25bXT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGRhdGFCeXRlc0JyZWFrcG9pbnRJbmZvKGFkZHJlc3M6IHN0cmluZywgYnl0ZXM6IG51bWJlcik6IFByb21pc2U8SURhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0ZGF0YUJyZWFrcG9pbnRJbmZvKG5hbWU6IHN0cmluZywgdmFyaWFibGVzUmVmZXJlbmNlPzogbnVtYmVyIHwgdW5kZWZpbmVkLCBmcmFtZUlkPzogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx7IGRhdGFJZDogc3RyaW5nIHwgbnVsbDsgZGVzY3JpcHRpb246IHN0cmluZzsgY2FuUGVyc2lzdD86IGJvb2xlYW4gfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHNlbmREYXRhQnJlYWtwb2ludHMoZGJwczogSURhdGFCcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRzdWJJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBjb21wYWN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHNldFN1YklkKHN1YklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXQgcGFyZW50U2Vzc2lvbigpOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0UmVwbEVsZW1lbnRzKCk6IElSZXBsRWxlbWVudFtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRoYXNTZXBhcmF0ZVJlcGwoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRyZW1vdmVSZXBsRXhwcmVzc2lvbnMoKTogdm9pZCB7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlUmVwbEVsZW1lbnRzKCk6IEV2ZW50PElSZXBsRWxlbWVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRhZGRSZXBsRXhwcmVzc2lvbihzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSwgbmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0YXBwZW5kVG9SZXBsKGRhdGE6IElOZXdSZXBsRWxlbWVudERhdGEpOiB2b2lkIHsgfVxuXG5cdGNvbmZpZ3VyYXRpb246IElDb25maWcgPSB7IHR5cGU6ICdtb2NrJywgbmFtZTogJ21vY2snLCByZXF1ZXN0OiAnbGF1bmNoJyB9O1xuXHR1bnJlc29sdmVkQ29uZmlndXJhdGlvbjogSUNvbmZpZyA9IHsgdHlwZTogJ21vY2snLCBuYW1lOiAnbW9jaycsIHJlcXVlc3Q6ICdsYXVuY2gnIH07XG5cdHN0YXRlID0gU3RhdGUuU3RvcHBlZDtcblx0cm9vdCE6IElXb3Jrc3BhY2VGb2xkZXI7XG5cdGNhcGFiaWxpdGllczogRGVidWdQcm90b2NvbC5DYXBhYmlsaXRpZXMgPSB7fTtcblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnbW9jayc7XG5cdH1cblxuXHRnZXRMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnbW9ja25hbWUnO1xuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ21vY2tuYW1lJztcblx0fVxuXG5cdHNldE5hbWUobmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdGdldFNvdXJjZUZvclVyaShtb2RlbFVyaTogdXJpKTogU291cmNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0Z2V0VGhyZWFkKHRocmVhZElkOiBudW1iZXIpOiBJVGhyZWFkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0Z2V0U3RvcHBlZERldGFpbHMoKTogSVJhd1N0b3BwZWREZXRhaWxzIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ3VzdG9tRXZlbnQoKTogRXZlbnQ8RGVidWdQcm90b2NvbC5FdmVudD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXQgb25EaWRMb2FkZWRTb3VyY2UoKTogRXZlbnQ8TG9hZGVkU291cmNlRXZlbnQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlU3RhdGUoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXQgb25EaWRFbmRBZGFwdGVyKCk6IEV2ZW50PEFkYXB0ZXJFbmRFdmVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VOYW1lKCk6IEV2ZW50PHN0cmluZz4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXQgb25EaWRQcm9ncmVzc1N0YXJ0KCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuUHJvZ3Jlc3NTdGFydEV2ZW50PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdGdldCBvbkRpZFByb2dyZXNzVXBkYXRlKCk6IEV2ZW50PERlYnVnUHJvdG9jb2wuUHJvZ3Jlc3NVcGRhdGVFdmVudD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRnZXQgb25EaWRQcm9ncmVzc0VuZCgpOiBFdmVudDxEZWJ1Z1Byb3RvY29sLlByb2dyZXNzRW5kRXZlbnQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0c2V0Q29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uOiB7IHJlc29sdmVkOiBJQ29uZmlnOyB1bnJlc29sdmVkOiBJQ29uZmlnIH0pIHsgfVxuXG5cdGdldEFsbFRocmVhZHMoKTogSVRocmVhZFtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRnZXRTb3VyY2UocmF3OiBEZWJ1Z1Byb3RvY29sLlNvdXJjZSk6IFNvdXJjZSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdGdldExvYWRlZFNvdXJjZXMoKTogUHJvbWlzZTxTb3VyY2VbXT4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHR9XG5cblx0Y29tcGxldGlvbnMoZnJhbWVJZDogbnVtYmVyLCB0aHJlYWRJZDogbnVtYmVyLCB0ZXh0OiBzdHJpbmcsIHBvc2l0aW9uOiBQb3NpdGlvbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5Db21wbGV0aW9uc1Jlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdGNsZWFyVGhyZWFkcyhyZW1vdmVUaHJlYWRzOiBib29sZWFuLCByZWZlcmVuY2U/OiBudW1iZXIpOiB2b2lkIHsgfVxuXG5cdHJhd1VwZGF0ZShkYXRhOiBJUmF3TW9kZWxVcGRhdGUpOiB2b2lkIHsgfVxuXG5cdGluaXRpYWxpemUoZGJncjogSURlYnVnZ2VyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGxhdW5jaE9yQXR0YWNoKGNvbmZpZzogSUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRyZXN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRzZW5kQnJlYWtwb2ludHMobW9kZWxVcmk6IHVyaSwgYnB0czogSUJyZWFrcG9pbnRbXSwgc291cmNlTW9kaWZpZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoZmJwczogSUZ1bmN0aW9uQnJlYWtwb2ludFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHNlbmRFeGNlcHRpb25CcmVha3BvaW50cyhleGJwdHM6IElFeGNlcHRpb25CcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c2VuZEluc3RydWN0aW9uQnJlYWtwb2ludHMoZGJwczogSUluc3RydWN0aW9uQnJlYWtwb2ludFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGdldERlYnVnUHJvdG9jb2xCcmVha3BvaW50KGJyZWFrcG9pbnRJZDogc3RyaW5nKTogRGVidWdQcm90b2NvbC5CcmVha3BvaW50IHwgdW5kZWZpbmVkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0Y3VzdG9tUmVxdWVzdChyZXF1ZXN0OiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRzdGFja1RyYWNlKHRocmVhZElkOiBudW1iZXIsIHN0YXJ0RnJhbWU6IG51bWJlciwgbGV2ZWxzOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RGVidWdQcm90b2NvbC5TdGFja1RyYWNlUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZXhjZXB0aW9uSW5mbyh0aHJlYWRJZDogbnVtYmVyKTogUHJvbWlzZTxJRXhjZXB0aW9uSW5mbz4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRzY29wZXMoZnJhbWVJZDogbnVtYmVyKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNjb3Blc1Jlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHZhcmlhYmxlcyh2YXJpYWJsZXNSZWZlcmVuY2U6IG51bWJlciwgdGhyZWFkSWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZmlsdGVyOiAnaW5kZXhlZCcgfCAnbmFtZWQnLCBzdGFydDogbnVtYmVyLCBjb3VudDogbnVtYmVyKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlZhcmlhYmxlc1Jlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGV2YWx1YXRlKGV4cHJlc3Npb246IHN0cmluZywgZnJhbWVJZDogbnVtYmVyLCBjb250ZXh0Pzogc3RyaW5nKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkV2YWx1YXRlUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0cmVzdGFydEZyYW1lKGZyYW1lSWQ6IG51bWJlciwgdGhyZWFkSWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRuZXh0KHRocmVhZElkOiBudW1iZXIsIGdyYW51bGFyaXR5PzogRGVidWdQcm90b2NvbC5TdGVwcGluZ0dyYW51bGFyaXR5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHN0ZXBJbih0aHJlYWRJZDogbnVtYmVyLCB0YXJnZXRJZD86IG51bWJlciwgZ3JhbnVsYXJpdHk/OiBEZWJ1Z1Byb3RvY29sLlN0ZXBwaW5nR3JhbnVsYXJpdHkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c3RlcE91dCh0aHJlYWRJZDogbnVtYmVyLCBncmFudWxhcml0eT86IERlYnVnUHJvdG9jb2wuU3RlcHBpbmdHcmFudWxhcml0eSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRzdGVwQmFjayh0aHJlYWRJZDogbnVtYmVyLCBncmFudWxhcml0eT86IERlYnVnUHJvdG9jb2wuU3RlcHBpbmdHcmFudWxhcml0eSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRjb250aW51ZSh0aHJlYWRJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHJldmVyc2VDb250aW51ZSh0aHJlYWRJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHBhdXNlKHRocmVhZElkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0dGVybWluYXRlVGhyZWFkcyh0aHJlYWRJZHM6IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHNldFZhcmlhYmxlKHZhcmlhYmxlc1JlZmVyZW5jZTogbnVtYmVyLCBuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU2V0VmFyaWFibGVSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRzZXRFeHByZXNzaW9uKGZyYW1lSWQ6IG51bWJlciwgZXhwcmVzc2lvbjogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldEV4cHJlc3Npb25SZXNwb25zZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRsb2FkU291cmNlKHJlc291cmNlOiB1cmkpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU291cmNlUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZGlzYXNzZW1ibGUobWVtb3J5UmVmZXJlbmNlOiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBpbnN0cnVjdGlvbk9mZnNldDogbnVtYmVyLCBpbnN0cnVjdGlvbkNvdW50OiBudW1iZXIpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuRGlzYXNzZW1ibGVkSW5zdHJ1Y3Rpb25bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHRlcm1pbmF0ZShyZXN0YXJ0ID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0ZGlzY29ubmVjdChyZXN0YXJ0ID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnb3RvVGFyZ2V0cyhzb3VyY2U6IERlYnVnUHJvdG9jb2wuU291cmNlLCBsaW5lOiBudW1iZXIsIGNvbHVtbj86IG51bWJlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Hb3RvVGFyZ2V0c1Jlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGdvdG8odGhyZWFkSWQ6IG51bWJlciwgdGFyZ2V0SWQ6IG51bWJlcik6IFByb21pc2U8RGVidWdQcm90b2NvbC5Hb3RvUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0cmVzb2x2ZUxvY2F0aW9uUmVmZXJlbmNlKGxvY2F0aW9uUmVmZXJlbmNlOiBudW1iZXIpOiBQcm9taXNlPElEZWJ1Z0xvY2F0aW9uUmVmZXJlbmNlZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW9ja1Jhd1Nlc3Npb24ge1xuXG5cdGNhcGFiaWxpdGllczogRGVidWdQcm90b2NvbC5DYXBhYmlsaXRpZXMgPSB7fTtcblx0ZGlzY29ubmVjdGVkID0gZmFsc2U7XG5cdHNlc3Npb25MZW5ndGhJblNlY29uZHM6IG51bWJlciA9IDA7XG5cblx0cmVhZHlGb3JCcmVha3BvaW50cyA9IHRydWU7XG5cdGVtaXR0ZWRTdG9wcGVkID0gdHJ1ZTtcblxuXHRnZXRMZW5ndGhJblNlY29uZHMoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMTAwO1xuXHR9XG5cblx0c3RhY2tUcmFjZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlN0YWNrVHJhY2VBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RhY2tUcmFjZVJlc3BvbnNlPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRzZXE6IDEsXG5cdFx0XHR0eXBlOiAncmVzcG9uc2UnLFxuXHRcdFx0cmVxdWVzdF9zZXE6IDEsXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0Y29tbWFuZDogJ3N0YWNrVHJhY2UnLFxuXHRcdFx0Ym9keToge1xuXHRcdFx0XHRzdGFja0ZyYW1lczogW3tcblx0XHRcdFx0XHRpZDogMSxcblx0XHRcdFx0XHRuYW1lOiAnbW9jaycsXG5cdFx0XHRcdFx0bGluZTogNSxcblx0XHRcdFx0XHRjb2x1bW46IDZcblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGV4Y2VwdGlvbkluZm8oYXJnczogRGVidWdQcm90b2NvbC5FeGNlcHRpb25JbmZvQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkV4Y2VwdGlvbkluZm9SZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRsYXVuY2hPckF0dGFjaChhcmdzOiBJQ29uZmlnKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHNjb3BlcyhhcmdzOiBEZWJ1Z1Byb3RvY29sLlNjb3Blc0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TY29wZXNSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHR2YXJpYWJsZXMoYXJnczogRGVidWdQcm90b2NvbC5WYXJpYWJsZXNBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuVmFyaWFibGVzUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0ZXZhbHVhdGUoYXJnczogRGVidWdQcm90b2NvbC5FdmFsdWF0ZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5FdmFsdWF0ZVJlc3BvbnNlPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdH1cblxuXHRjdXN0b20ocmVxdWVzdDogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0dGVybWluYXRlKHJlc3RhcnQgPSBmYWxzZSk6IFByb21pc2U8RGVidWdQcm90b2NvbC5UZXJtaW5hdGVSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRkaXNjb25uZWN0KCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHRocmVhZHMoKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlRocmVhZHNSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRzdGVwSW4oYXJnczogRGVidWdQcm90b2NvbC5TdGVwSW5Bcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RlcEluUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0c3RlcE91dChhcmdzOiBEZWJ1Z1Byb3RvY29sLlN0ZXBPdXRBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RlcE91dFJlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHN0ZXBCYWNrKGFyZ3M6IERlYnVnUHJvdG9jb2wuU3RlcEJhY2tBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuU3RlcEJhY2tSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRjb250aW51ZShhcmdzOiBEZWJ1Z1Byb3RvY29sLkNvbnRpbnVlQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkNvbnRpbnVlUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0cmV2ZXJzZUNvbnRpbnVlKGFyZ3M6IERlYnVnUHJvdG9jb2wuUmV2ZXJzZUNvbnRpbnVlQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlJldmVyc2VDb250aW51ZVJlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHBhdXNlKGFyZ3M6IERlYnVnUHJvdG9jb2wuUGF1c2VBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuUGF1c2VSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHR0ZXJtaW5hdGVUaHJlYWRzKGFyZ3M6IERlYnVnUHJvdG9jb2wuVGVybWluYXRlVGhyZWFkc0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5UZXJtaW5hdGVUaHJlYWRzUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0c2V0VmFyaWFibGUoYXJnczogRGVidWdQcm90b2NvbC5TZXRWYXJpYWJsZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TZXRWYXJpYWJsZVJlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHJlc3RhcnRGcmFtZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlJlc3RhcnRGcmFtZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXN0YXJ0RnJhbWVSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRjb21wbGV0aW9ucyhhcmdzOiBEZWJ1Z1Byb3RvY29sLkNvbXBsZXRpb25zQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkNvbXBsZXRpb25zUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0bmV4dChhcmdzOiBEZWJ1Z1Byb3RvY29sLk5leHRBcmd1bWVudHMpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuTmV4dFJlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHNvdXJjZShhcmdzOiBEZWJ1Z1Byb3RvY29sLlNvdXJjZUFyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Tb3VyY2VSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRsb2FkZWRTb3VyY2VzKGFyZ3M6IERlYnVnUHJvdG9jb2wuTG9hZGVkU291cmNlc0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5Mb2FkZWRTb3VyY2VzUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0c2V0QnJlYWtwb2ludHMoYXJnczogRGVidWdQcm90b2NvbC5TZXRCcmVha3BvaW50c0FyZ3VtZW50cyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5TZXRCcmVha3BvaW50c1Jlc3BvbnNlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0fVxuXG5cdHNldEZ1bmN0aW9uQnJlYWtwb2ludHMoYXJnczogRGVidWdQcm90b2NvbC5TZXRGdW5jdGlvbkJyZWFrcG9pbnRzQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldEZ1bmN0aW9uQnJlYWtwb2ludHNSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRzZXRFeGNlcHRpb25CcmVha3BvaW50cyhhcmdzOiBEZWJ1Z1Byb3RvY29sLlNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzQXJndW1lbnRzKTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzUmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHR9XG5cblx0cmVhZG9ubHkgb25EaWRTdG9wOiBFdmVudDxEZWJ1Z1Byb3RvY29sLlN0b3BwZWRFdmVudD4gPSBudWxsITtcbn1cblxuZXhwb3J0IGNsYXNzIE1vY2tEZWJ1Z0FkYXB0ZXIgZXh0ZW5kcyBBYnN0cmFjdERlYnVnQWRhcHRlciB7XG5cdHByaXZhdGUgc2VxID0gMDtcblxuXHRwcml2YXRlIHBlbmRpbmdSZXNwb25zZXMgPSBuZXcgTWFwPHN0cmluZywgRGVmZXJyZWRQcm9taXNlPERlYnVnUHJvdG9jb2wuUmVzcG9uc2U+PigpO1xuXG5cdHN0YXJ0U2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRzdG9wU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRzZW5kTWVzc2FnZShtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXHRcdGlmIChtZXNzYWdlLnR5cGUgPT09ICdyZXF1ZXN0Jykge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtZXNzYWdlIGFzIERlYnVnUHJvdG9jb2wuUmVxdWVzdDtcblx0XHRcdFx0c3dpdGNoIChyZXF1ZXN0LmNvbW1hbmQpIHtcblx0XHRcdFx0XHRjYXNlICdldmFsdWF0ZSc6XG5cdFx0XHRcdFx0XHR0aGlzLmV2YWx1YXRlKHJlcXVlc3QsIHJlcXVlc3QuYXJndW1lbnRzKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNlbmRSZXNwb25zZUJvZHkocmVxdWVzdCwge30pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9LCAwKTtcblx0XHR9IGVsc2UgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ3Jlc3BvbnNlJykge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBtZXNzYWdlIGFzIERlYnVnUHJvdG9jb2wuUmVzcG9uc2U7XG5cdFx0XHRpZiAodGhpcy5wZW5kaW5nUmVzcG9uc2VzLmhhcyhyZXNwb25zZS5jb21tYW5kKSkge1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdSZXNwb25zZXMuZ2V0KHJlc3BvbnNlLmNvbW1hbmQpIS5jb21wbGV0ZShyZXNwb25zZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2VuZFJlc3BvbnNlQm9keShyZXF1ZXN0OiBEZWJ1Z1Byb3RvY29sLlJlcXVlc3QsIGJvZHk6IGFueSkge1xuXHRcdGNvbnN0IHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlID0ge1xuXHRcdFx0c2VxOiArK3RoaXMuc2VxLFxuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlJyxcblx0XHRcdHJlcXVlc3Rfc2VxOiByZXF1ZXN0LnNlcSxcblx0XHRcdGNvbW1hbmQ6IHJlcXVlc3QuY29tbWFuZCxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRib2R5XG5cdFx0fTtcblx0XHR0aGlzLmFjY2VwdE1lc3NhZ2UocmVzcG9uc2UpO1xuXHR9XG5cblx0c2VuZEV2ZW50Qm9keShldmVudDogc3RyaW5nLCBib2R5OiBhbnkpIHtcblx0XHRjb25zdCByZXNwb25zZTogRGVidWdQcm90b2NvbC5FdmVudCA9IHtcblx0XHRcdHNlcTogKyt0aGlzLnNlcSxcblx0XHRcdHR5cGU6ICdldmVudCcsXG5cdFx0XHRldmVudCxcblx0XHRcdGJvZHlcblx0XHR9O1xuXHRcdHRoaXMuYWNjZXB0TWVzc2FnZShyZXNwb25zZSk7XG5cdH1cblxuXHR3YWl0Rm9yUmVzcG9uc2VGcm9tQ2xpZW50KGNvbW1hbmQ6IHN0cmluZyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5SZXNwb25zZT4ge1xuXHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlPigpO1xuXHRcdGlmICh0aGlzLnBlbmRpbmdSZXNwb25zZXMuaGFzKGNvbW1hbmQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wZW5kaW5nUmVzcG9uc2VzLmdldChjb21tYW5kKSEucDtcblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdSZXNwb25zZXMuc2V0KGNvbW1hbmQsIGRlZmVycmVkKTtcblx0XHRyZXR1cm4gZGVmZXJyZWQucDtcblx0fVxuXG5cdHNlbmRSZXF1ZXN0Qm9keShjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IGFueSkge1xuXHRcdGNvbnN0IHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlJlcXVlc3QgPSB7XG5cdFx0XHRzZXE6ICsrdGhpcy5zZXEsXG5cdFx0XHR0eXBlOiAncmVxdWVzdCcsXG5cdFx0XHRjb21tYW5kLFxuXHRcdFx0YXJndW1lbnRzOiBhcmdzXG5cdFx0fTtcblx0XHR0aGlzLmFjY2VwdE1lc3NhZ2UocmVzcG9uc2UpO1xuXHR9XG5cblx0ZXZhbHVhdGUocmVxdWVzdDogRGVidWdQcm90b2NvbC5SZXF1ZXN0LCBhcmdzOiBEZWJ1Z1Byb3RvY29sLkV2YWx1YXRlQXJndW1lbnRzKSB7XG5cdFx0aWYgKGFyZ3MuZXhwcmVzc2lvbi5pbmRleE9mKCdiZWZvcmUuJykgPT09IDApIHtcblx0XHRcdHRoaXMuc2VuZEV2ZW50Qm9keSgnb3V0cHV0JywgeyBvdXRwdXQ6IGFyZ3MuZXhwcmVzc2lvbiB9KTtcblx0XHR9XG5cblx0XHR0aGlzLnNlbmRSZXNwb25zZUJvZHkocmVxdWVzdCwge1xuXHRcdFx0cmVzdWx0OiAnPScgKyBhcmdzLmV4cHJlc3Npb24sXG5cdFx0XHR2YXJpYWJsZXNSZWZlcmVuY2U6IDBcblx0XHR9KTtcblxuXHRcdGlmIChhcmdzLmV4cHJlc3Npb24uaW5kZXhPZignYWZ0ZXIuJykgPT09IDApIHtcblx0XHRcdHRoaXMuc2VuZEV2ZW50Qm9keSgnb3V0cHV0JywgeyBvdXRwdXQ6IGFyZ3MuZXhwcmVzc2lvbiB9KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vY2tEZWJ1Z1N0b3JhZ2UgZXh0ZW5kcyBEZWJ1Z1N0b3JhZ2Uge1xuXG5cdGNvbnN0cnVjdG9yKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpIHtcblx0XHRzdXBlcihzdG9yYWdlU2VydmljZSwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQU1oQyxTQUFTLHNCQUFzQjtBQUcvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUE0ZixhQUFhO0FBSXpnQixTQUFTLG9CQUFvQjtBQUV0QixNQUFNLGlCQUEwQztBQUFBLEVBR3RELElBQUksUUFBZTtBQUNsQixVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsSUFBSSxtQkFBeUM7QUFDNUMsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLElBQUksa0JBQXdDO0FBQzNDLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxJQUFJLGtCQUF1RTtBQUMxRSxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsSUFBSSxtQkFBaUM7QUFDcEMsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLDBCQUFpRDtBQUNoRCxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsb0JBQXFDO0FBQ3BDLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxvQkFBb0IsT0FBNEI7QUFDL0MsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLGdCQUFnQixtQkFBK0M7QUFDOUQsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLG1CQUFtQixTQUF1QztBQUN6RCxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsZ0JBQWdCLFVBQWUsZ0JBQXNDLFNBQW1EO0FBQ3ZILFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxlQUFlQSxNQUFVLGdCQUEyRDtBQUNuRixVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsa0JBQWtCQSxNQUFVLE1BQTBDLHFCQUE2QztBQUNsSCxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsMkJBQTJCLFNBQWlDO0FBQzNELFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSwwQkFBeUM7QUFDeEMsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLG9CQUFrQztBQUNqQyxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEseUJBQXlCLE1BQW9EO0FBQzVFLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSw2QkFBNkIsU0FBaUM7QUFDN0QsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLGdDQUFnQyxZQUFrQyxXQUFrQztBQUNuRyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBRUEsa0NBQWtDLFNBQXdCLE1BQXdEO0FBQ2pILFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSx3QkFBOEI7QUFBQSxFQUFFO0FBQUEsRUFFaEMsb0JBQW9CLElBQVksVUFBd0I7QUFBQSxFQUFFO0FBQUEsRUFFMUQseUJBQXlCLElBQVksUUFBcUY7QUFDekgsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLDBCQUEwQixJQUE0QjtBQUNyRCxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsb0JBQW1DO0FBQ2xDLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxxQkFBcUIsSUFBWSxRQUFzRTtBQUN0RyxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsc0JBQXNCLElBQXdDO0FBQzdELFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxrQkFBa0IsTUFBNkI7QUFDOUMsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLHdCQUE4QjtBQUFBLEVBQUU7QUFBQSxFQUVoQyxtQkFBbUIsTUFBOEI7QUFDaEQsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLHNCQUFzQixJQUFZLFNBQWdDO0FBQ2pFLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSx1QkFBdUIsSUFBbUI7QUFBQSxFQUFFO0FBQUEsRUFFNUMsZUFBZSxRQUFpQixjQUFpQyxTQUFrRDtBQUNsSCxXQUFPLFFBQVEsUUFBUSxJQUFJO0FBQUEsRUFDNUI7QUFBQSxFQUVBLGlCQUErQjtBQUM5QixVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsY0FBNEI7QUFDM0IsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLFdBQXdCO0FBQ3ZCLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxlQUEyQjtBQUMxQixVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEscUJBQXFCQSxNQUFnQjtBQUFBLEVBQUU7QUFBQSxFQUV2Qyx5QkFBeUIsUUFBK0I7QUFDdkQsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE1BQU1BLE1BQVUsWUFBb0IsUUFBZ0M7QUFDbkUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFDRDtBQUVPLE1BQU0sWUFBcUM7QUFBQSxFQUEzQztBQUNOLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCO0FBbUduQyx5QkFBeUIsRUFBRSxNQUFNLFFBQVEsTUFBTSxRQUFRLFNBQVMsU0FBUztBQUN6RSxtQ0FBbUMsRUFBRSxNQUFNLFFBQVEsTUFBTSxRQUFRLFNBQVMsU0FBUztBQUNuRixpQkFBUSxNQUFNO0FBRWQsd0JBQTJDLENBQUM7QUFBQTtBQUFBLEVBckc1QyxVQUFnQjtBQUFBLEVBRWhCO0FBQUEsRUFFQSxVQUFVLGlCQUF3QztBQUNqRCxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBRUEsSUFBSSx3QkFBMEQ7QUFDN0QsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLFdBQVcsaUJBQXlCLFFBQWdCLE9BQXNFO0FBQ3pILFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxZQUFZLGlCQUF5QixRQUFnQixNQUFjLGNBQWdGO0FBQ2xKLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSwwQkFBZ0M7QUFBQSxFQUVoQztBQUFBLEVBRUEsSUFBSSxlQUE4QztBQUNqRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsSUFBSSxvQkFBNkI7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQUksYUFBc0I7QUFDekIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQUksMkJBQW9DO0FBQ3ZDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLFNBQTJEO0FBQ3hFLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxPQUFPLGFBQTREO0FBQ2xFLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxxQkFBcUJBLE1BQVUsWUFBMEM7QUFDeEUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLHdCQUF3QixTQUFpQixPQUFpRTtBQUN6RyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBRUEsbUJBQW1CLE1BQWMsb0JBQXlDLFNBQXFJO0FBQzlNLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxvQkFBb0IsTUFBd0M7QUFDM0QsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUlBLElBQUksVUFBbUI7QUFDdEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFNBQVMsT0FBaUM7QUFDekMsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLElBQUksZ0JBQTJDO0FBQzlDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxrQkFBa0M7QUFDakMsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRUEsa0JBQTJCO0FBQzFCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSx3QkFBOEI7QUFBQSxFQUFFO0FBQUEsRUFDaEMsSUFBSSwwQkFBMkQ7QUFDOUQsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLGtCQUFrQixZQUF5QixNQUE2QjtBQUN2RSxXQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsRUFDakM7QUFBQSxFQUVBLGFBQWEsTUFBaUM7QUFBQSxFQUFFO0FBQUEsRUFRaEQsUUFBZ0I7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsV0FBbUI7QUFDbEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQUksT0FBZTtBQUNsQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsUUFBUSxNQUFvQjtBQUMzQixVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsZ0JBQWdCLFVBQXVCO0FBQ3RDLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxVQUFVLFVBQTJCO0FBQ3BDLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxvQkFBd0M7QUFDdkMsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLElBQUksbUJBQStDO0FBQ2xELFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxJQUFJLG9CQUE4QztBQUNqRCxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsSUFBSSxtQkFBZ0M7QUFDbkMsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLElBQUksa0JBQXNEO0FBQ3pELFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxJQUFJLGtCQUFpQztBQUNwQyxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsSUFBSSxxQkFBOEQ7QUFDakUsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLElBQUksc0JBQWdFO0FBQ25FLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxJQUFJLG1CQUEwRDtBQUM3RCxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsaUJBQWlCLGVBQTJEO0FBQUEsRUFBRTtBQUFBLEVBRTlFLGdCQUEyQjtBQUMxQixXQUFPLENBQUM7QUFBQSxFQUNUO0FBQUEsRUFFQSxVQUFVLEtBQW1DO0FBQzVDLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxtQkFBc0M7QUFDckMsV0FBTyxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDMUI7QUFBQSxFQUVBLFlBQVksU0FBaUIsVUFBa0IsTUFBYyxVQUFnRTtBQUM1SCxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsYUFBYSxlQUF3QixXQUEwQjtBQUFBLEVBQUU7QUFBQSxFQUVqRSxVQUFVLE1BQTZCO0FBQUEsRUFBRTtBQUFBLEVBRXpDLFdBQVcsTUFBZ0M7QUFDMUMsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLGVBQWUsUUFBZ0M7QUFDOUMsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLFVBQXlCO0FBQ3hCLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFDQSxnQkFBZ0IsVUFBZSxNQUFxQixnQkFBd0M7QUFDM0YsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLHdCQUF3QixNQUE0QztBQUNuRSxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EseUJBQXlCLFFBQStDO0FBQ3ZFLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFDQSwyQkFBMkIsTUFBK0M7QUFDekUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLDJCQUEyQixjQUE0RDtBQUN0RixVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsY0FBYyxTQUFpQixNQUE0QztBQUMxRSxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsV0FBVyxVQUFrQixZQUFvQixRQUFnQixPQUFxRTtBQUNySSxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsY0FBYyxVQUEyQztBQUN4RCxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsT0FBTyxTQUF3RDtBQUM5RCxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsVUFBVSxvQkFBNEIsVUFBOEIsUUFBNkIsT0FBZSxPQUF5RDtBQUN4SyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsU0FBUyxZQUFvQixTQUFpQixTQUEyRDtBQUN4RyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsYUFBYSxTQUFpQixVQUFpQztBQUM5RCxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsS0FBSyxVQUFrQixhQUFnRTtBQUN0RixVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsT0FBTyxVQUFrQixVQUFtQixhQUFnRTtBQUMzRyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsUUFBUSxVQUFrQixhQUFnRTtBQUN6RixVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsU0FBUyxVQUFrQixhQUFnRTtBQUMxRixVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsU0FBUyxVQUFpQztBQUN6QyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsZ0JBQWdCLFVBQWlDO0FBQ2hELFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFDQSxNQUFNLFVBQWlDO0FBQ3RDLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFDQSxpQkFBaUIsV0FBb0M7QUFDcEQsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLFlBQVksb0JBQTRCLE1BQWMsT0FBMkQ7QUFDaEgsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLGNBQWMsU0FBaUIsWUFBb0IsT0FBeUU7QUFDM0gsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLFdBQVcsVUFBc0Q7QUFDaEUsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLFlBQVksaUJBQXlCLFFBQWdCLG1CQUEyQixrQkFBd0Y7QUFDdkssVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLFVBQVUsVUFBVSxPQUFzQjtBQUN6QyxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMxQztBQUFBLEVBQ0EsV0FBVyxVQUFVLE9BQXNCO0FBQzFDLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzFDO0FBQUEsRUFFQSxZQUFZLFFBQThCLE1BQWMsUUFBeUU7QUFDaEksVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLEtBQUssVUFBa0IsVUFBdUQ7QUFDN0UsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFBQSxFQUNBLHlCQUF5QixtQkFBOEQ7QUFDdEYsVUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsRUFDMUM7QUFDRDtBQUVPLE1BQU0sZUFBZTtBQUFBLEVBQXJCO0FBRU4sd0JBQTJDLENBQUM7QUFDNUMsd0JBQWU7QUFDZixrQ0FBaUM7QUFFakMsK0JBQXNCO0FBQ3RCLDBCQUFpQjtBQTRIakIsU0FBUyxZQUErQztBQUFBO0FBQUEsRUExSHhELHFCQUE2QjtBQUM1QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsV0FBVyxNQUFvRjtBQUM5RixXQUFPLFFBQVEsUUFBUTtBQUFBLE1BQ3RCLEtBQUs7QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxNQUNiLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxRQUNMLGFBQWEsQ0FBQztBQUFBLFVBQ2IsSUFBSTtBQUFBLFVBQ0osTUFBTTtBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sUUFBUTtBQUFBLFFBQ1QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxjQUFjLE1BQTBGO0FBQ3ZHLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxlQUFlLE1BQWdEO0FBQzlELFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxPQUFPLE1BQTRFO0FBQ2xGLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxVQUFVLE1BQWtGO0FBQzNGLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxTQUFTLE1BQWdGO0FBQ3hGLFdBQU8sUUFBUSxRQUFRLElBQUs7QUFBQSxFQUM3QjtBQUFBLEVBRUEsT0FBTyxTQUFpQixNQUE0QztBQUNuRSxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsVUFBVSxVQUFVLE9BQWlEO0FBQ3BFLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxhQUEyQjtBQUMxQixVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsVUFBa0Q7QUFDakQsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE9BQU8sTUFBNEU7QUFDbEYsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLFFBQVEsTUFBOEU7QUFDckYsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLFNBQVMsTUFBZ0Y7QUFDeEYsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLFNBQVMsTUFBZ0Y7QUFDeEYsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLGdCQUFnQixNQUE4RjtBQUM3RyxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBTSxNQUEwRTtBQUMvRSxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsaUJBQWlCLE1BQWdHO0FBQ2hILFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxZQUFZLE1BQXNGO0FBQ2pHLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxhQUFhLE1BQXdGO0FBQ3BHLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxZQUFZLE1BQXNGO0FBQ2pHLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxLQUFLLE1BQXdFO0FBQzVFLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxPQUFPLE1BQTRFO0FBQ2xGLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxjQUFjLE1BQTBGO0FBQ3ZHLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxlQUFlLE1BQTRGO0FBQzFHLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSx1QkFBdUIsTUFBNEc7QUFDbEksVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFDbEM7QUFBQSxFQUVBLHdCQUF3QixNQUE4RztBQUNySSxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUNsQztBQUdEO0FBRU8sTUFBTSx5QkFBeUIscUJBQXFCO0FBQUEsRUFBcEQ7QUFBQTtBQUNOLFNBQVEsTUFBTTtBQUVkLFNBQVEsbUJBQW1CLG9CQUFJLElBQXFEO0FBQUE7QUFBQSxFQUVwRixlQUE4QjtBQUM3QixXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxjQUE2QjtBQUM1QixXQUFPLFFBQVEsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxZQUFZLFNBQThDO0FBQ3pELFFBQUksUUFBUSxTQUFTLFdBQVc7QUFDL0IsaUJBQVcsTUFBTTtBQUNoQixjQUFNLFVBQVU7QUFDaEIsZ0JBQVEsUUFBUSxTQUFTO0FBQUEsVUFDeEIsS0FBSztBQUNKLGlCQUFLLFNBQVMsU0FBUyxRQUFRLFNBQVM7QUFDeEM7QUFBQSxRQUNGO0FBQ0EsYUFBSyxpQkFBaUIsU0FBUyxDQUFDLENBQUM7QUFDakM7QUFBQSxNQUNELEdBQUcsQ0FBQztBQUFBLElBQ0wsV0FBVyxRQUFRLFNBQVMsWUFBWTtBQUN2QyxZQUFNLFdBQVc7QUFDakIsVUFBSSxLQUFLLGlCQUFpQixJQUFJLFNBQVMsT0FBTyxHQUFHO0FBQ2hELGFBQUssaUJBQWlCLElBQUksU0FBUyxPQUFPLEVBQUcsU0FBUyxRQUFRO0FBQUEsTUFDL0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsaUJBQWlCLFNBQWdDLE1BQVc7QUFDM0QsVUFBTSxXQUFtQztBQUFBLE1BQ3hDLEtBQUssRUFBRSxLQUFLO0FBQUEsTUFDWixNQUFNO0FBQUEsTUFDTixhQUFhLFFBQVE7QUFBQSxNQUNyQixTQUFTLFFBQVE7QUFBQSxNQUNqQixTQUFTO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFDQSxTQUFLLGNBQWMsUUFBUTtBQUFBLEVBQzVCO0FBQUEsRUFFQSxjQUFjLE9BQWUsTUFBVztBQUN2QyxVQUFNLFdBQWdDO0FBQUEsTUFDckMsS0FBSyxFQUFFLEtBQUs7QUFBQSxNQUNaLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxTQUFLLGNBQWMsUUFBUTtBQUFBLEVBQzVCO0FBQUEsRUFFQSwwQkFBMEIsU0FBa0Q7QUFDM0UsVUFBTSxXQUFXLElBQUksZ0JBQXdDO0FBQzdELFFBQUksS0FBSyxpQkFBaUIsSUFBSSxPQUFPLEdBQUc7QUFDdkMsYUFBTyxLQUFLLGlCQUFpQixJQUFJLE9BQU8sRUFBRztBQUFBLElBQzVDO0FBRUEsU0FBSyxpQkFBaUIsSUFBSSxTQUFTLFFBQVE7QUFDM0MsV0FBTyxTQUFTO0FBQUEsRUFDakI7QUFBQSxFQUVBLGdCQUFnQixTQUFpQixNQUFXO0FBQzNDLFVBQU0sV0FBa0M7QUFBQSxNQUN2QyxLQUFLLEVBQUUsS0FBSztBQUFBLE1BQ1osTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBLFdBQVc7QUFBQSxJQUNaO0FBQ0EsU0FBSyxjQUFjLFFBQVE7QUFBQSxFQUM1QjtBQUFBLEVBRUEsU0FBUyxTQUFnQyxNQUF1QztBQUMvRSxRQUFJLEtBQUssV0FBVyxRQUFRLFNBQVMsTUFBTSxHQUFHO0FBQzdDLFdBQUssY0FBYyxVQUFVLEVBQUUsUUFBUSxLQUFLLFdBQVcsQ0FBQztBQUFBLElBQ3pEO0FBRUEsU0FBSyxpQkFBaUIsU0FBUztBQUFBLE1BQzlCLFFBQVEsTUFBTSxLQUFLO0FBQUEsTUFDbkIsb0JBQW9CO0FBQUEsSUFDckIsQ0FBQztBQUVELFFBQUksS0FBSyxXQUFXLFFBQVEsUUFBUSxNQUFNLEdBQUc7QUFDNUMsV0FBSyxjQUFjLFVBQVUsRUFBRSxRQUFRLEtBQUssV0FBVyxDQUFDO0FBQUEsSUFDekQ7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxNQUFNLHlCQUF5QixhQUFhO0FBQUEsRUFFbEQsWUFBWSxnQkFBaUM7QUFDNUMsVUFBTSxnQkFBZ0IsUUFBWSxRQUFZLElBQUksZUFBZSxDQUFDO0FBQUEsRUFDbkU7QUFDRDsiLAogICJuYW1lcyI6IFsidXJpIl0KfQo=
