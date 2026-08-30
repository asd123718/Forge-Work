import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/protocol/actions.js";
import { TerminalClaimKind } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { AgentHostPty } from "../../browser/agentHostPty.js";
import { AgentHostOutputChannel } from "../../browser/agentHostOutputChannel.js";
import { terminalReducer } from "../../../../../platform/agentHost/common/state/protocol/reducers.js";
class MockAgentConnection {
  constructor(initialState) {
    this.clientId = "test-client";
    this._seq = 0;
    this._onDidAction = new Emitter();
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = new Emitter();
    this.onDidNotification = this._onDidNotification.event;
    this.onMcpNotification = Event.None;
    this.initializeResult = constObservable(void 0);
    this.dispatchedActions = [];
    this.createdTerminals = [];
    this.disposedTerminals = [];
    this.subscribedResources = [];
    this._terminalState = {
      title: "Test Terminal",
      content: [],
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" }
    };
    // ---- IAgentConnection new API (stubs for tests) -----
    this.rootState = {
      value: void 0,
      verifiedValue: void 0,
      onDidChange: Event.None,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    if (initialState) {
      this._terminalState = { ...this._terminalState, ...initialState };
    }
  }
  nextClientSeq() {
    return ++this._seq;
  }
  async createTerminal(params) {
    this.createdTerminals.push(params);
  }
  async disposeTerminal(terminal) {
    this.disposedTerminals.push(terminal);
  }
  async invokeChangesetOperation() {
    return {};
  }
  async handleMcpRequest() {
    throw new Error("Not implemented");
  }
  /** Simulate the server sending an action to the client */
  fireAction(channel, action, serverSeq = 1) {
    this._onDidAction.fire({ channel: channel.toString(), action, serverSeq, origin: { clientId: "server", clientSeq: 0 } });
  }
  // ---- Unused IAgentService methods (stubs) -----
  async authenticate(_params) {
    return { authenticated: true };
  }
  async getNetworkDiagnosticsInfo() {
    return { version: "test", os: "test", arch: "test", proxySettings: {}, proxyEnv: {}, endpoints: [] };
  }
  async getManagedSettingsDiagnostics() {
    return [];
  }
  async diagnosticsFetch(url) {
    return { url };
  }
  async listSessions() {
    return [];
  }
  async createSession(_config) {
    return URI.parse("copilot:///test");
  }
  async resolveSessionConfig(_params) {
    return { schema: { type: "object", properties: {} }, values: {} };
  }
  async sessionConfigCompletions(_params) {
    return { items: [] };
  }
  async completions(_params) {
    return { items: [] };
  }
  async getCompletionTriggerCharacters() {
    return [];
  }
  async disposeSession(_session) {
  }
  async createChat(_session, _chat) {
  }
  async disposeChat(_chat) {
  }
  async shutdown() {
  }
  async resourceList(_uri) {
    return { entries: [] };
  }
  async resourceRead(_uri) {
    return { data: "", encoding: "utf-8" };
  }
  async resourceWrite(_params) {
    return {};
  }
  async resourceCopy(_params) {
    return {};
  }
  async resourceDelete(_params) {
    return {};
  }
  async resourceMove(_params) {
    return {};
  }
  async resourceResolve(_params) {
    throw new Error("Not implemented");
  }
  async resourceMkdir(_params) {
    return {};
  }
  async createResourceWatch(_params) {
    throw new Error("Not implemented");
  }
  async watchResource(_params) {
    throw new Error("Not implemented");
  }
  getSubscription(_kind, _resource) {
    const onDidChange = new Emitter();
    const onWillApplyAction = new Emitter();
    const onDidApplyAction = new Emitter();
    const connection = this;
    const sub = {
      get value() {
        return connection._terminalState;
      },
      get verifiedValue() {
        return connection._terminalState;
      },
      onDidChange: onDidChange.event,
      onWillApplyAction: onWillApplyAction.event,
      onDidApplyAction: onDidApplyAction.event
    };
    const listener = this._onDidAction.event((envelope) => {
      if (envelope.channel === _resource.toString()) {
        onWillApplyAction.fire(envelope);
        this._terminalState = terminalReducer(this._terminalState, envelope.action);
        onDidApplyAction.fire(envelope);
        onDidChange.fire(this._terminalState);
      }
    });
    return {
      object: sub,
      dispose: () => {
        listener.dispose();
        onDidChange.dispose();
        onWillApplyAction.dispose();
        onDidApplyAction.dispose();
      }
    };
  }
  getSubscriptionUnmanaged(_kind, _resource) {
    return void 0;
  }
  getInflightSessionCreate(_resource) {
    return void 0;
  }
  getActiveSubscriptions() {
    return [];
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action });
  }
  dispose() {
    this._onDidAction.dispose();
    this._onDidNotification.dispose();
  }
}
suite("AgentHostPty", () => {
  const disposables = new DisposableStore();
  const terminalUri = URI.parse("agenthost-terminal:///test-term-1");
  setup(() => {
    disposables.clear();
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("start() creates terminal and subscribes", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri, { name: "test" }));
    const result = await pty.start();
    assert.strictEqual(result, void 0, "start() should succeed");
    assert.strictEqual(conn.createdTerminals.length, 1);
    assert.strictEqual(conn.createdTerminals[0].channel, terminalUri.toString());
    assert.strictEqual(conn.createdTerminals[0].name, "test");
    assert.deepStrictEqual(conn.createdTerminals[0].claim, { kind: TerminalClaimKind.Client, clientId: "test-client" });
  });
  test("start() fires onProcessReady", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    let ready = false;
    disposables.add(pty.onProcessReady(() => {
      ready = true;
    }));
    await pty.start();
    assert.ok(ready);
  });
  test("replays existing content from snapshot", async () => {
    const conn = new MockAgentConnection({ content: [{ type: "unclassified", value: "existing output\n" }] });
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    const dataReceived = [];
    disposables.add(pty.onProcessData((e) => {
      dataReceived.push(typeof e === "string" ? e : e.data);
    }));
    await pty.start();
    assert.deepStrictEqual(dataReceived, ["existing output\n"]);
  });
  test("output channel follows accumulated state without creating a pty", () => {
    const conn = new MockAgentConnection({ isPty: false, content: [{ type: "unclassified", value: "existing\n" }] });
    disposables.add(conn);
    const source = disposables.add(new AgentHostOutputChannel(conn, terminalUri));
    assert.strictEqual(source.output, "existing\r\n");
    conn.fireAction(terminalUri, { type: ActionType.TerminalData, data: "next\n" });
    assert.strictEqual(source.output, "existing\r\nnext\r\n");
    conn.fireAction(terminalUri, { type: ActionType.TerminalCleared });
    conn.fireAction(terminalUri, { type: ActionType.TerminalData, data: "fresh\n" });
    conn.fireAction(terminalUri, { type: ActionType.TerminalExited, exitCode: 3 });
    assert.strictEqual(source.output, "fresh\r\n");
    assert.strictEqual(source.exitCode, 3);
  });
  test("input() dispatches terminal/input action", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    await pty.start();
    pty.input("hello");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const inputActions = conn.dispatchedActions.filter((a) => a.action.type === ActionType.TerminalInput);
    assert.strictEqual(inputActions.length, 1);
    assert.strictEqual(inputActions[0].action.data, "hello");
  });
  test("resize() dispatches terminal/resized action", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    await pty.start();
    pty.resize(120, 40);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const resizeActions = conn.dispatchedActions.filter((a) => a.action.type === ActionType.TerminalResized);
    assert.strictEqual(resizeActions.length, 1);
    assert.strictEqual(resizeActions[0].action.cols, 120);
    assert.strictEqual(resizeActions[0].action.rows, 40);
  });
  test("resize() skips duplicate dimensions", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    await pty.start();
    pty.resize(80, 24);
    pty.resize(80, 24);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const resizeActions = conn.dispatchedActions.filter((a) => a.action.type === ActionType.TerminalResized);
    assert.strictEqual(resizeActions.length, 1);
  });
  test("terminal/data action fires onProcessData", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    const dataReceived = [];
    disposables.add(pty.onProcessData((e) => {
      dataReceived.push(typeof e === "string" ? e : e.data);
    }));
    await pty.start();
    conn.fireAction(terminalUri, { type: ActionType.TerminalData, data: "hello world\r\n" });
    assert.deepStrictEqual(dataReceived, ["existing output\n", "hello world\r\n"].filter((x) => x !== "existing output\n"));
    assert.deepStrictEqual(dataReceived, ["hello world\r\n"]);
  });
  test("terminal/exited action fires onProcessExit", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    let exitCode;
    disposables.add(pty.onProcessExit((e) => {
      exitCode = e;
    }));
    await pty.start();
    conn.fireAction(terminalUri, { type: ActionType.TerminalExited, exitCode: 42 });
    assert.strictEqual(exitCode, 42);
  });
  test("terminal/cwdChanged updates cwd property", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    await pty.start();
    conn.fireAction(terminalUri, { type: ActionType.TerminalCwdChanged, cwd: "/home/user/project" });
    const cwd = await pty.getCwd();
    assert.strictEqual(cwd, "/home/user/project");
  });
  test("terminal/titleChanged updates title property", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    let changedTitle = "";
    disposables.add(pty.onDidChangeProperty((e) => {
      if (e.type === "title") {
        changedTitle = e.value;
      }
    }));
    await pty.start();
    conn.fireAction(terminalUri, { type: ActionType.TerminalTitleChanged, title: "npm test" });
    assert.strictEqual(changedTitle, "npm test");
  });
  test("ignores actions for other terminals", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    const dataReceived = [];
    disposables.add(pty.onProcessData((e) => {
      dataReceived.push(typeof e === "string" ? e : e.data);
    }));
    await pty.start();
    conn.fireAction(URI.parse("agenthost-terminal:///other"), { type: ActionType.TerminalData, data: "should not appear" });
    assert.deepStrictEqual(dataReceived, []);
  });
  test("shutdown() disposes terminal and unsubscribes", async () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    let exitFired = false;
    disposables.add(pty.onProcessExit(() => {
      exitFired = true;
    }));
    await pty.start();
    pty.shutdown(false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(conn.disposedTerminals.length, 1);
    assert.strictEqual(conn.disposedTerminals[0].toString(), terminalUri.toString());
    assert.ok(exitFired);
  });
  test("shouldPersist is false", () => {
    const conn = new MockAgentConnection();
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    assert.strictEqual(pty.shouldPersist, false);
  });
  test("getInitialCwd returns cwd from snapshot", async () => {
    const conn = new MockAgentConnection({ cwd: "/home/user" });
    disposables.add(conn);
    const pty = disposables.add(new AgentHostPty(1, conn, terminalUri));
    await pty.start();
    const cwd = await pty.getInitialCwd();
    assert.strictEqual(cwd, "/home/user");
  });
  test("reconnect() re-subscribes with new connection and replays content", async () => {
    const conn1 = new MockAgentConnection({ content: [{ type: "unclassified", value: "old output\n" }] });
    disposables.add(conn1);
    const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri));
    await pty.start();
    const conn2 = new MockAgentConnection({
      content: [{ type: "unclassified", value: "old output\nnew output after reconnect\n" }],
      cwd: "/home/reconnected",
      title: "Reconnected Terminal"
    });
    disposables.add(conn2);
    const dataReceived = [];
    disposables.add(pty.onProcessData((e) => {
      dataReceived.push(typeof e === "string" ? e : e.data);
    }));
    const result = await pty.reconnect(conn2);
    assert.strictEqual(result, true, "reconnect() should succeed");
    assert.ok(dataReceived.some((d) => d.includes("\x1B[2J")), "should clear buffer before replay");
    assert.ok(dataReceived.some((d) => d.includes("new output after reconnect")), "should replay new content");
    const cwd = await pty.getCwd();
    assert.strictEqual(cwd, "/home/reconnected");
  });
  test("reconnect() streams new actions from new connection", async () => {
    const conn1 = new MockAgentConnection();
    disposables.add(conn1);
    const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri));
    await pty.start();
    const conn2 = new MockAgentConnection();
    disposables.add(conn2);
    const dataReceived = [];
    disposables.add(pty.onProcessData((e) => {
      dataReceived.push(typeof e === "string" ? e : e.data);
    }));
    await pty.reconnect(conn2);
    dataReceived.length = 0;
    conn2.fireAction(terminalUri, { type: ActionType.TerminalData, data: "post-reconnect data" });
    assert.deepStrictEqual(dataReceived, ["post-reconnect data"]);
    conn1.fireAction(terminalUri, { type: ActionType.TerminalData, data: "stale data" });
    assert.deepStrictEqual(dataReceived, ["post-reconnect data"]);
  });
  test("reconnect() times out when subscription never hydrates", async () => {
    const conn1 = new MockAgentConnection();
    disposables.add(conn1);
    const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri));
    await pty.start();
    const conn2 = new MockAgentConnection();
    disposables.add(conn2);
    conn2.getSubscription = (_kind, _resource) => {
      const onDidChange = new Emitter();
      const onDidApplyAction = new Emitter();
      disposables.add(onDidChange);
      disposables.add(onDidApplyAction);
      const sub = {
        value: void 0,
        // never hydrated
        verifiedValue: void 0,
        onDidChange: onDidChange.event,
        onWillApplyAction: Event.None,
        onDidApplyAction: onDidApplyAction.event
      };
      return {
        object: sub,
        dispose: () => {
          onDidChange.dispose();
          onDidApplyAction.dispose();
        }
      };
    };
    const origWarn = console.warn;
    console.warn = () => {
    };
    try {
      const result = await pty.reconnect(conn2);
      assert.strictEqual(result, false, "reconnect() should fail on timeout");
    } finally {
      console.warn = origWarn;
    }
  }).timeout(15e3);
  test("reconnect() dispatches input to new connection", async () => {
    const conn1 = new MockAgentConnection();
    disposables.add(conn1);
    const pty = disposables.add(new AgentHostPty(1, conn1, terminalUri));
    await pty.start();
    const conn2 = new MockAgentConnection();
    disposables.add(conn2);
    await pty.reconnect(conn2);
    pty.input("after reconnect");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const inputActions = conn2.dispatchedActions.filter((a) => a.action.type === ActionType.TerminalInput);
    assert.strictEqual(inputActions.length, 1);
    assert.strictEqual(inputActions[0].action.data, "after reconnect");
    const oldInputActions = conn1.dispatchedActions.filter((a) => a.action.type === ActionType.TerminalInput);
    assert.strictEqual(oldInputActions.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFxhZ2VudEhvc3RQdHkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbm5lY3Rpb24sIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcywgSUFnZW50SG9zdE5ldHdvcmtEaWFnbm9zdGljc0luZm8sIElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQsIElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zLCBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMsIElBZ2VudFNlc3Npb25NZXRhZGF0YSwgQXV0aGVudGljYXRlUGFyYW1zLCBBdXRoZW50aWNhdGVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCBTdGF0ZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSb290U3RhdGUsIFRlcm1pbmFsQ2xhaW1LaW5kLCB0eXBlIFRlcm1pbmFsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgQ29tcGxldGlvbnNQYXJhbXMsIENvbXBsZXRpb25zUmVzdWx0LCBDcmVhdGVUZXJtaW5hbFBhcmFtcywgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBBY3Rpb25FbnZlbG9wZSwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBTZXNzaW9uQWN0aW9uLCBUZXJtaW5hbEFjdGlvbiwgSU5vdGlmaWNhdGlvbiwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgUmVzb3VyY2VDb3B5UGFyYW1zLCBSZXNvdXJjZUNvcHlSZXN1bHQsIFJlc291cmNlRGVsZXRlUGFyYW1zLCBSZXNvdXJjZURlbGV0ZVJlc3VsdCwgUmVzb3VyY2VMaXN0UmVzdWx0LCBSZXNvdXJjZU1vdmVQYXJhbXMsIFJlc291cmNlTW92ZVJlc3VsdCwgUmVzb3VyY2VSZWFkUmVzdWx0LCBSZXNvdXJjZVJlc29sdmVQYXJhbXMsIFJlc291cmNlUmVzb2x2ZVJlc3VsdCwgUmVzb3VyY2VXcml0ZVBhcmFtcywgUmVzb3VyY2VXcml0ZVJlc3VsdCwgQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcywgQ3JlYXRlUmVzb3VyY2VXYXRjaFJlc3VsdCwgUmVzb3VyY2VNa2RpclBhcmFtcywgUmVzb3VyY2VNa2RpclJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcblxuaW1wb3J0IHsgQWdlbnRIb3N0UHR5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEhvc3RQdHkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0T3V0cHV0Q2hhbm5lbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRIb3N0T3V0cHV0Q2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU3Vic2NyaXB0aW9uSW5mbywgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbFJlZHVjZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3JlZHVjZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgSVJlbW90ZVdhdGNoSGFuZGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuLy8gLS0tLSBNb2NrIElBZ2VudENvbm5lY3Rpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTW9ja0FnZW50Q29ubmVjdGlvbiBpbXBsZW1lbnRzIElBZ2VudENvbm5lY3Rpb24ge1xuXG5cdHJlYWRvbmx5IGNsaWVudElkID0gJ3Rlc3QtY2xpZW50JztcblxuXHRwcml2YXRlIF9zZXEgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjdGlvbiA9IG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpO1xuXHRyZWFkb25seSBvbkRpZEFjdGlvbjogRXZlbnQ8QWN0aW9uRW52ZWxvcGU+ID0gdGhpcy5fb25EaWRBY3Rpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTm90aWZpY2F0aW9uID0gbmV3IEVtaXR0ZXI8SU5vdGlmaWNhdGlvbj4oKTtcblx0cmVhZG9ubHkgb25EaWROb3RpZmljYXRpb246IEV2ZW50PElOb3RpZmljYXRpb24+ID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cdHJlYWRvbmx5IG9uTWNwTm90aWZpY2F0aW9uOiBFdmVudDxpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJykuSU1jcE5vdGlmaWNhdGlvbj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBpbml0aWFsaXplUmVzdWx0OiBJT2JzZXJ2YWJsZTxpbXBvcnQoJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL2NvbW1hbmRzLmpzJykuSW5pdGlhbGl6ZVJlc3VsdCB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblxuXHRyZWFkb25seSBkaXNwYXRjaGVkQWN0aW9uczogeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24gfVtdID0gW107XG5cdHJlYWRvbmx5IGNyZWF0ZWRUZXJtaW5hbHM6IENyZWF0ZVRlcm1pbmFsUGFyYW1zW10gPSBbXTtcblx0cmVhZG9ubHkgZGlzcG9zZWRUZXJtaW5hbHM6IFVSSVtdID0gW107XG5cdHJlYWRvbmx5IHN1YnNjcmliZWRSZXNvdXJjZXM6IFVSSVtdID0gW107XG5cblx0cHJpdmF0ZSBfdGVybWluYWxTdGF0ZTogVGVybWluYWxTdGF0ZSA9IHtcblx0XHR0aXRsZTogJ1Rlc3QgVGVybWluYWwnLCBjb250ZW50OiBbXSwgY2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKGluaXRpYWxTdGF0ZT86IFBhcnRpYWw8VGVybWluYWxTdGF0ZT4pIHtcblx0XHRpZiAoaW5pdGlhbFN0YXRlKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFN0YXRlID0geyAuLi50aGlzLl90ZXJtaW5hbFN0YXRlLCAuLi5pbml0aWFsU3RhdGUgfTtcblx0XHR9XG5cdH1cblxuXHRuZXh0Q2xpZW50U2VxKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuICsrdGhpcy5fc2VxO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlVGVybWluYWwocGFyYW1zOiBDcmVhdGVUZXJtaW5hbFBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY3JlYXRlZFRlcm1pbmFscy5wdXNoKHBhcmFtcyk7XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlVGVybWluYWwodGVybWluYWw6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzcG9zZWRUZXJtaW5hbHMucHVzaCh0ZXJtaW5hbCk7XG5cdH1cblxuXHRhc3luYyBpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24oKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0YXN5bmMgaGFuZGxlTWNwUmVxdWVzdCgpOiBQcm9taXNlPHVua25vd24+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQnKTsgfVxuXG5cdC8qKiBTaW11bGF0ZSB0aGUgc2VydmVyIHNlbmRpbmcgYW4gYWN0aW9uIHRvIHRoZSBjbGllbnQgKi9cblx0ZmlyZUFjdGlvbihjaGFubmVsOiBVUkksIGFjdGlvbjogU3RhdGVBY3Rpb24sIHNlcnZlclNlcSA9IDEpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEFjdGlvbi5maXJlKHsgY2hhbm5lbDogY2hhbm5lbC50b1N0cmluZygpLCBhY3Rpb24sIHNlcnZlclNlcSwgb3JpZ2luOiB7IGNsaWVudElkOiAnc2VydmVyJywgY2xpZW50U2VxOiAwIH0gfSk7XG5cdH1cblxuXHQvLyAtLS0tIFVudXNlZCBJQWdlbnRTZXJ2aWNlIG1ldGhvZHMgKHN0dWJzKSAtLS0tLVxuXHRhc3luYyBhdXRoZW50aWNhdGUoX3BhcmFtczogQXV0aGVudGljYXRlUGFyYW1zKTogUHJvbWlzZTxBdXRoZW50aWNhdGVSZXN1bHQ+IHsgcmV0dXJuIHsgYXV0aGVudGljYXRlZDogdHJ1ZSB9OyB9XG5cdGFzeW5jIGdldE5ldHdvcmtEaWFnbm9zdGljc0luZm8oKTogUHJvbWlzZTxJQWdlbnRIb3N0TmV0d29ya0RpYWdub3N0aWNzSW5mbz4geyByZXR1cm4geyB2ZXJzaW9uOiAndGVzdCcsIG9zOiAndGVzdCcsIGFyY2g6ICd0ZXN0JywgcHJveHlTZXR0aW5nczoge30sIHByb3h5RW52OiB7fSwgZW5kcG9pbnRzOiBbXSB9OyB9XG5cdGFzeW5jIGdldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKCk6IFByb21pc2U8cmVhZG9ubHkgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGRpYWdub3N0aWNzRmV0Y2godXJsOiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQ+IHsgcmV0dXJuIHsgdXJsIH07IH1cblx0YXN5bmMgbGlzdFNlc3Npb25zKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oX2NvbmZpZz86IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcpOiBQcm9taXNlPFVSST4geyByZXR1cm4gVVJJLnBhcnNlKCdjb3BpbG90Oi8vL3Rlc3QnKTsgfVxuXHRhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhfcGFyYW1zOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHsgcmV0dXJuIHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH07IH1cblx0YXN5bmMgc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKF9wYXJhbXM6IElBZ2VudFNlc3Npb25Db25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7IHJldHVybiB7IGl0ZW1zOiBbXSB9OyB9XG5cdGFzeW5jIGNvbXBsZXRpb25zKF9wYXJhbXM6IENvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxDb21wbGV0aW9uc1Jlc3VsdD4geyByZXR1cm4geyBpdGVtczogW10gfTsgfVxuXHRhc3luYyBnZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZGlzcG9zZVNlc3Npb24oX3Nlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGNyZWF0ZUNoYXQoX3Nlc3Npb246IFVSSSwgX2NoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGRpc3Bvc2VDaGF0KF9jaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZXNvdXJjZUxpc3QoX3VyaTogVVJJKTogUHJvbWlzZTxSZXNvdXJjZUxpc3RSZXN1bHQ+IHsgcmV0dXJuIHsgZW50cmllczogW10gfTsgfVxuXHRhc3luYyByZXNvdXJjZVJlYWQoX3VyaTogVVJJKTogUHJvbWlzZTxSZXNvdXJjZVJlYWRSZXN1bHQ+IHsgcmV0dXJuIHsgZGF0YTogJycsIGVuY29kaW5nOiAndXRmLTgnIH0gYXMgUmVzb3VyY2VSZWFkUmVzdWx0OyB9XG5cdGFzeW5jIHJlc291cmNlV3JpdGUoX3BhcmFtczogUmVzb3VyY2VXcml0ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VXcml0ZVJlc3VsdD4geyByZXR1cm4ge307IH1cblx0YXN5bmMgcmVzb3VyY2VDb3B5KF9wYXJhbXM6IFJlc291cmNlQ29weVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VDb3B5UmVzdWx0PiB7IHJldHVybiB7fTsgfVxuXHRhc3luYyByZXNvdXJjZURlbGV0ZShfcGFyYW1zOiBSZXNvdXJjZURlbGV0ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VEZWxldGVSZXN1bHQ+IHsgcmV0dXJuIHt9OyB9XG5cdGFzeW5jIHJlc291cmNlTW92ZShfcGFyYW1zOiBSZXNvdXJjZU1vdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlTW92ZVJlc3VsdD4geyByZXR1cm4ge307IH1cblx0YXN5bmMgcmVzb3VyY2VSZXNvbHZlKF9wYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PiB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7IH1cblx0YXN5bmMgcmVzb3VyY2VNa2RpcihfcGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1rZGlyUmVzdWx0PiB7IHJldHVybiB7fTsgfVxuXHRhc3luYyBjcmVhdGVSZXNvdXJjZVdhdGNoKF9wYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPENyZWF0ZVJlc291cmNlV2F0Y2hSZXN1bHQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRhc3luYyB3YXRjaFJlc291cmNlKF9wYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPElSZW1vdGVXYXRjaEhhbmRsZT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9XG5cblx0Ly8gLS0tLSBJQWdlbnRDb25uZWN0aW9uIG5ldyBBUEkgKHN0dWJzIGZvciB0ZXN0cykgLS0tLS1cblx0cmVhZG9ubHkgcm9vdFN0YXRlOiBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPiA9IHtcblx0XHR2YWx1ZTogdW5kZWZpbmVkLCB2ZXJpZmllZFZhbHVlOiB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLCBvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSwgb25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0fTtcblx0Z2V0U3Vic2NyaXB0aW9uPFQ+KF9raW5kOiBTdGF0ZUNvbXBvbmVudHMsIF9yZXNvdXJjZTogVVJJKTogSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248VD4+IHtcblx0XHRjb25zdCBvbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPFRlcm1pbmFsU3RhdGU+KCk7XG5cdFx0Y29uc3Qgb25XaWxsQXBwbHlBY3Rpb24gPSBuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKTtcblx0XHRjb25zdCBvbkRpZEFwcGx5QWN0aW9uID0gbmV3IEVtaXR0ZXI8QWN0aW9uRW52ZWxvcGU+KCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXM7XG5cdFx0Y29uc3Qgc3ViOiBJQWdlbnRTdWJzY3JpcHRpb248VGVybWluYWxTdGF0ZT4gPSB7XG5cdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBjb25uZWN0aW9uLl90ZXJtaW5hbFN0YXRlOyB9LFxuXHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKSB7IHJldHVybiBjb25uZWN0aW9uLl90ZXJtaW5hbFN0YXRlOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50LCBvbldpbGxBcHBseUFjdGlvbjogb25XaWxsQXBwbHlBY3Rpb24uZXZlbnQsIG9uRGlkQXBwbHlBY3Rpb246IG9uRGlkQXBwbHlBY3Rpb24uZXZlbnQsXG5cdFx0fTtcblx0XHQvLyBXaXJlIG9uRGlkQWN0aW9uIHRvIHRoZSBzdWJzY3JpcHRpb24ncyBldmVudHNcblx0XHRjb25zdCBsaXN0ZW5lciA9IHRoaXMuX29uRGlkQWN0aW9uLmV2ZW50KGVudmVsb3BlID0+IHtcblx0XHRcdGlmIChlbnZlbG9wZS5jaGFubmVsID09PSBfcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRvbldpbGxBcHBseUFjdGlvbi5maXJlKGVudmVsb3BlKTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTdGF0ZSA9IHRlcm1pbmFsUmVkdWNlcih0aGlzLl90ZXJtaW5hbFN0YXRlLCBlbnZlbG9wZS5hY3Rpb24gYXMgVGVybWluYWxBY3Rpb24pO1xuXHRcdFx0XHRvbkRpZEFwcGx5QWN0aW9uLmZpcmUoZW52ZWxvcGUpO1xuXHRcdFx0XHRvbkRpZENoYW5nZS5maXJlKHRoaXMuX3Rlcm1pbmFsU3RhdGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IHN1YiBhcyBJQWdlbnRTdWJzY3JpcHRpb248VD4sIGRpc3Bvc2U6ICgpID0+IHsgbGlzdGVuZXIuZGlzcG9zZSgpOyBvbkRpZENoYW5nZS5kaXNwb3NlKCk7IG9uV2lsbEFwcGx5QWN0aW9uLmRpc3Bvc2UoKTsgb25EaWRBcHBseUFjdGlvbi5kaXNwb3NlKCk7IH0sXG5cdFx0fTtcblx0fVxuXHRnZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQ8VD4oX2tpbmQ6IFN0YXRlQ29tcG9uZW50cywgX3Jlc291cmNlOiBVUkkpOiBJQWdlbnRTdWJzY3JpcHRpb248VD4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Z2V0SW5mbGlnaHRTZXNzaW9uQ3JlYXRlKF9yZXNvdXJjZTogVVJJKTogUHJvbWlzZTx1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRnZXRBY3RpdmVTdWJzY3JpcHRpb25zKCk6IHJlYWRvbmx5IElBY3RpdmVTdWJzY3JpcHRpb25JbmZvW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoZWRBY3Rpb25zLnB1c2goeyBjaGFubmVsLCBhY3Rpb24gfSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQWN0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8gLS0tLSBUZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuc3VpdGUoJ0FnZW50SG9zdFB0eScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgdGVybWluYWxVcmkgPSBVUkkucGFyc2UoJ2FnZW50aG9zdC10ZXJtaW5hbDovLy90ZXN0LXRlcm0tMScpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3RhcnQoKSBjcmVhdGVzIHRlcm1pbmFsIGFuZCBzdWJzY3JpYmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uKTtcblx0XHRjb25zdCBwdHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFB0eSgxLCBjb25uLCB0ZXJtaW5hbFVyaSwgeyBuYW1lOiAndGVzdCcgfSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHR5LnN0YXJ0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQsICdzdGFydCgpIHNob3VsZCBzdWNjZWVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm4uY3JlYXRlZFRlcm1pbmFscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uLmNyZWF0ZWRUZXJtaW5hbHNbMF0uY2hhbm5lbCwgdGVybWluYWxVcmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm4uY3JlYXRlZFRlcm1pbmFsc1swXS5uYW1lLCAndGVzdCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubi5jcmVhdGVkVGVybWluYWxzWzBdLmNsYWltLCB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0KCkgZmlyZXMgb25Qcm9jZXNzUmVhZHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm4pO1xuXHRcdGNvbnN0IHB0eSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UHR5KDEsIGNvbm4sIHRlcm1pbmFsVXJpKSk7XG5cblx0XHRsZXQgcmVhZHkgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHR5Lm9uUHJvY2Vzc1JlYWR5ISgoKSA9PiB7IHJlYWR5ID0gdHJ1ZTsgfSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0YXNzZXJ0Lm9rKHJlYWR5KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGF5cyBleGlzdGluZyBjb250ZW50IGZyb20gc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKHsgY29udGVudDogW3sgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiAnZXhpc3Rpbmcgb3V0cHV0XFxuJyB9XSB9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubik7XG5cdFx0Y29uc3QgcHR5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RQdHkoMSwgY29ubiwgdGVybWluYWxVcmkpKTtcblxuXHRcdGNvbnN0IGRhdGFSZWNlaXZlZDogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHR5Lm9uUHJvY2Vzc0RhdGEhKGUgPT4ge1xuXHRcdFx0ZGF0YVJlY2VpdmVkLnB1c2godHlwZW9mIGUgPT09ICdzdHJpbmcnID8gZSA6IGUuZGF0YSk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhUmVjZWl2ZWQsIFsnZXhpc3Rpbmcgb3V0cHV0XFxuJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdvdXRwdXQgY2hhbm5lbCBmb2xsb3dzIGFjY3VtdWxhdGVkIHN0YXRlIHdpdGhvdXQgY3JlYXRpbmcgYSBwdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKHsgaXNQdHk6IGZhbHNlLCBjb250ZW50OiBbeyB0eXBlOiAndW5jbGFzc2lmaWVkJywgdmFsdWU6ICdleGlzdGluZ1xcbicgfV0gfSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm4pO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0T3V0cHV0Q2hhbm5lbChjb25uLCB0ZXJtaW5hbFVyaSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5vdXRwdXQsICdleGlzdGluZ1xcclxcbicpO1xuXHRcdGNvbm4uZmlyZUFjdGlvbih0ZXJtaW5hbFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ25leHRcXG4nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2Uub3V0cHV0LCAnZXhpc3RpbmdcXHJcXG5uZXh0XFxyXFxuJyk7XG5cdFx0Y29ubi5maXJlQWN0aW9uKHRlcm1pbmFsVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDbGVhcmVkIH0pO1xuXHRcdGNvbm4uZmlyZUFjdGlvbih0ZXJtaW5hbFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ2ZyZXNoXFxuJyB9KTtcblx0XHRjb25uLmZpcmVBY3Rpb24odGVybWluYWxVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbEV4aXRlZCwgZXhpdENvZGU6IDMgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5vdXRwdXQsICdmcmVzaFxcclxcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2UuZXhpdENvZGUsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnB1dCgpIGRpc3BhdGNoZXMgdGVybWluYWwvaW5wdXQgYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uKTtcblx0XHRjb25zdCBwdHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFB0eSgxLCBjb25uLCB0ZXJtaW5hbFVyaSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0cHR5LmlucHV0KCdoZWxsbycpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGFzeW5jIGJhcnJpZXJcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblxuXHRcdGNvbnN0IGlucHV0QWN0aW9ucyA9IGNvbm4uZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGEgPT4gYS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbElucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChpbnB1dEFjdGlvbnNbMF0uYWN0aW9uIGFzIHsgZGF0YTogc3RyaW5nIH0pLmRhdGEsICdoZWxsbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNpemUoKSBkaXNwYXRjaGVzIHRlcm1pbmFsL3Jlc2l6ZWQgYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uKTtcblx0XHRjb25zdCBwdHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFB0eSgxLCBjb25uLCB0ZXJtaW5hbFVyaSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0cHR5LnJlc2l6ZSgxMjAsIDQwKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0Y29uc3QgcmVzaXplQWN0aW9ucyA9IGNvbm4uZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGEgPT4gYS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbFJlc2l6ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNpemVBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXNpemVBY3Rpb25zWzBdLmFjdGlvbiBhcyB7IGNvbHM6IG51bWJlcjsgcm93czogbnVtYmVyIH0pLmNvbHMsIDEyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXNpemVBY3Rpb25zWzBdLmFjdGlvbiBhcyB7IGNvbHM6IG51bWJlcjsgcm93czogbnVtYmVyIH0pLnJvd3MsIDQwKTtcblx0fSk7XG5cblx0dGVzdCgncmVzaXplKCkgc2tpcHMgZHVwbGljYXRlIGRpbWVuc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm4pO1xuXHRcdGNvbnN0IHB0eSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UHR5KDEsIGNvbm4sIHRlcm1pbmFsVXJpKSk7XG5cblx0XHRhd2FpdCBwdHkuc3RhcnQoKTtcblx0XHRwdHkucmVzaXplKDgwLCAyNCk7XG5cdFx0cHR5LnJlc2l6ZSg4MCwgMjQpOyAvLyBkdXBsaWNhdGVcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0Y29uc3QgcmVzaXplQWN0aW9ucyA9IGNvbm4uZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGEgPT4gYS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbFJlc2l6ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNpemVBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlcm1pbmFsL2RhdGEgYWN0aW9uIGZpcmVzIG9uUHJvY2Vzc0RhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm4pO1xuXHRcdGNvbnN0IHB0eSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UHR5KDEsIGNvbm4sIHRlcm1pbmFsVXJpKSk7XG5cblx0XHRjb25zdCBkYXRhUmVjZWl2ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHB0eS5vblByb2Nlc3NEYXRhIShlID0+IHtcblx0XHRcdGRhdGFSZWNlaXZlZC5wdXNoKHR5cGVvZiBlID09PSAnc3RyaW5nJyA/IGUgOiBlLmRhdGEpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHB0eS5zdGFydCgpO1xuXHRcdGNvbm4uZmlyZUFjdGlvbih0ZXJtaW5hbFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ2hlbGxvIHdvcmxkXFxyXFxuJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YVJlY2VpdmVkLCBbJ2V4aXN0aW5nIG91dHB1dFxcbicgLyogc2tpcCByZXBsYXkgc2luY2UgY29udGVudCBpcyAnJyAqLywgJ2hlbGxvIHdvcmxkXFxyXFxuJ10uZmlsdGVyKHggPT4geCAhPT0gJ2V4aXN0aW5nIG91dHB1dFxcbicpKTtcblx0XHQvLyBTaW5jZSBpbml0aWFsIGNvbnRlbnQgaXMgZW1wdHksIG9ubHkgdGhlIHN0cmVhbWVkIGRhdGEgc2hvdWxkIGJlIHJlY2VpdmVkXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhUmVjZWl2ZWQsIFsnaGVsbG8gd29ybGRcXHJcXG4nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlcm1pbmFsL2V4aXRlZCBhY3Rpb24gZmlyZXMgb25Qcm9jZXNzRXhpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubik7XG5cdFx0Y29uc3QgcHR5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RQdHkoMSwgY29ubiwgdGVybWluYWxVcmkpKTtcblxuXHRcdGxldCBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwdHkub25Qcm9jZXNzRXhpdCEoZSA9PiB7IGV4aXRDb2RlID0gZTsgfSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0Y29ubi5maXJlQWN0aW9uKHRlcm1pbmFsVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxFeGl0ZWQsIGV4aXRDb2RlOiA0MiB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGl0Q29kZSwgNDIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXJtaW5hbC9jd2RDaGFuZ2VkIHVwZGF0ZXMgY3dkIHByb3BlcnR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uKTtcblx0XHRjb25zdCBwdHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFB0eSgxLCBjb25uLCB0ZXJtaW5hbFVyaSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0Y29ubi5maXJlQWN0aW9uKHRlcm1pbmFsVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDd2RDaGFuZ2VkLCBjd2Q6ICcvaG9tZS91c2VyL3Byb2plY3QnIH0pO1xuXG5cdFx0Y29uc3QgY3dkID0gYXdhaXQgcHR5LmdldEN3ZCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjd2QsICcvaG9tZS91c2VyL3Byb2plY3QnKTtcblx0fSk7XG5cblx0dGVzdCgndGVybWluYWwvdGl0bGVDaGFuZ2VkIHVwZGF0ZXMgdGl0bGUgcHJvcGVydHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubiA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm4pO1xuXHRcdGNvbnN0IHB0eSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UHR5KDEsIGNvbm4sIHRlcm1pbmFsVXJpKSk7XG5cblx0XHRsZXQgY2hhbmdlZFRpdGxlID0gJyc7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHB0eS5vbkRpZENoYW5nZVByb3BlcnR5IShlID0+IHtcblx0XHRcdGlmIChlLnR5cGUgPT09ICd0aXRsZScpIHtcblx0XHRcdFx0Y2hhbmdlZFRpdGxlID0gZS52YWx1ZSBhcyBzdHJpbmc7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0Y29ubi5maXJlQWN0aW9uKHRlcm1pbmFsVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxUaXRsZUNoYW5nZWQsIHRpdGxlOiAnbnBtIHRlc3QnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWRUaXRsZSwgJ25wbSB0ZXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYWN0aW9ucyBmb3Igb3RoZXIgdGVybWluYWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uKTtcblx0XHRjb25zdCBwdHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFB0eSgxLCBjb25uLCB0ZXJtaW5hbFVyaSkpO1xuXG5cdFx0Y29uc3QgZGF0YVJlY2VpdmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwdHkub25Qcm9jZXNzRGF0YSEoZSA9PiB7XG5cdFx0XHRkYXRhUmVjZWl2ZWQucHVzaCh0eXBlb2YgZSA9PT0gJ3N0cmluZycgPyBlIDogZS5kYXRhKTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBwdHkuc3RhcnQoKTtcblx0XHRjb25uLmZpcmVBY3Rpb24oVVJJLnBhcnNlKCdhZ2VudGhvc3QtdGVybWluYWw6Ly8vb3RoZXInKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ3Nob3VsZCBub3QgYXBwZWFyJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YVJlY2VpdmVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NodXRkb3duKCkgZGlzcG9zZXMgdGVybWluYWwgYW5kIHVuc3Vic2NyaWJlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubik7XG5cdFx0Y29uc3QgcHR5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RQdHkoMSwgY29ubiwgdGVybWluYWxVcmkpKTtcblxuXHRcdGxldCBleGl0RmlyZWQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHR5Lm9uUHJvY2Vzc0V4aXQhKCgpID0+IHsgZXhpdEZpcmVkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0cHR5LnNodXRkb3duKGZhbHNlKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm4uZGlzcG9zZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubi5kaXNwb3NlZFRlcm1pbmFsc1swXS50b1N0cmluZygpLCB0ZXJtaW5hbFVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQub2soZXhpdEZpcmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkUGVyc2lzdCBpcyBmYWxzZScsICgpID0+IHtcblx0XHRjb25zdCBjb25uID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubik7XG5cdFx0Y29uc3QgcHR5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RQdHkoMSwgY29ubiwgdGVybWluYWxVcmkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHR5LnNob3VsZFBlcnNpc3QsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0SW5pdGlhbEN3ZCByZXR1cm5zIGN3ZCBmcm9tIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbih7IGN3ZDogJy9ob21lL3VzZXInIH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uKTtcblx0XHRjb25zdCBwdHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFB0eSgxLCBjb25uLCB0ZXJtaW5hbFVyaSkpO1xuXG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cdFx0Y29uc3QgY3dkID0gYXdhaXQgcHR5LmdldEluaXRpYWxDd2QoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3dkLCAnL2hvbWUvdXNlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QoKSByZS1zdWJzY3JpYmVzIHdpdGggbmV3IGNvbm5lY3Rpb24gYW5kIHJlcGxheXMgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uMSA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKHsgY29udGVudDogW3sgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiAnb2xkIG91dHB1dFxcbicgfV0gfSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm4xKTtcblx0XHRjb25zdCBwdHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFB0eSgxLCBjb25uMSwgdGVybWluYWxVcmkpKTtcblxuXHRcdGF3YWl0IHB0eS5zdGFydCgpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IGNvbm5lY3Rpb24gd2l0aCBkaWZmZXJlbnQgY29udGVudCAoc2ltdWxhdGluZyBzZXJ2ZXItc2lkZSBjaGFuZ2VzIGR1cmluZyBkaXNjb25uZWN0KVxuXHRcdGNvbnN0IGNvbm4yID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oe1xuXHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiAnb2xkIG91dHB1dFxcbm5ldyBvdXRwdXQgYWZ0ZXIgcmVjb25uZWN0XFxuJyB9XSwgY3dkOiAnL2hvbWUvcmVjb25uZWN0ZWQnLCB0aXRsZTogJ1JlY29ubmVjdGVkIFRlcm1pbmFsJyxcblx0XHR9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubjIpO1xuXG5cdFx0Y29uc3QgZGF0YVJlY2VpdmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwdHkub25Qcm9jZXNzRGF0YSEoZSA9PiB7XG5cdFx0XHRkYXRhUmVjZWl2ZWQucHVzaCh0eXBlb2YgZSA9PT0gJ3N0cmluZycgPyBlIDogZS5kYXRhKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwdHkucmVjb25uZWN0KGNvbm4yKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUsICdyZWNvbm5lY3QoKSBzaG91bGQgc3VjY2VlZCcpO1xuXHRcdC8vIFNob3VsZCBoYXZlIGNsZWFyIHNlcXVlbmNlICsgcmVwbGF5ZWQgY29udGVudFxuXHRcdGFzc2VydC5vayhkYXRhUmVjZWl2ZWQuc29tZShkID0+IGQuaW5jbHVkZXMoJ1xceDFiWzJKJykpLCAnc2hvdWxkIGNsZWFyIGJ1ZmZlciBiZWZvcmUgcmVwbGF5Jyk7XG5cdFx0YXNzZXJ0Lm9rKGRhdGFSZWNlaXZlZC5zb21lKGQgPT4gZC5pbmNsdWRlcygnbmV3IG91dHB1dCBhZnRlciByZWNvbm5lY3QnKSksICdzaG91bGQgcmVwbGF5IG5ldyBjb250ZW50Jyk7XG5cblx0XHRjb25zdCBjd2QgPSBhd2FpdCBwdHkuZ2V0Q3dkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN3ZCwgJy9ob21lL3JlY29ubmVjdGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29ubmVjdCgpIHN0cmVhbXMgbmV3IGFjdGlvbnMgZnJvbSBuZXcgY29ubmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uMSA9IG5ldyBNb2NrQWdlbnRDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbm4xKTtcblx0XHRjb25zdCBwdHkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFB0eSgxLCBjb25uMSwgdGVybWluYWxVcmkpKTtcblx0XHRhd2FpdCBwdHkuc3RhcnQoKTtcblxuXHRcdGNvbnN0IGNvbm4yID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubjIpO1xuXG5cdFx0Y29uc3QgZGF0YVJlY2VpdmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwdHkub25Qcm9jZXNzRGF0YSEoZSA9PiB7XG5cdFx0XHRkYXRhUmVjZWl2ZWQucHVzaCh0eXBlb2YgZSA9PT0gJ3N0cmluZycgPyBlIDogZS5kYXRhKTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBwdHkucmVjb25uZWN0KGNvbm4yKTtcblx0XHRkYXRhUmVjZWl2ZWQubGVuZ3RoID0gMDsgLy8gY2xlYXIgcmVwbGF5IGRhdGFcblxuXHRcdC8vIE5ldyBhY3Rpb25zIGZyb20gY29ubjIgc2hvdWxkIGJlIHJlY2VpdmVkXG5cdFx0Y29ubjIuZmlyZUFjdGlvbih0ZXJtaW5hbFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ3Bvc3QtcmVjb25uZWN0IGRhdGEnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhUmVjZWl2ZWQsIFsncG9zdC1yZWNvbm5lY3QgZGF0YSddKTtcblxuXHRcdC8vIE9sZCBjb25uZWN0aW9uIGFjdGlvbnMgc2hvdWxkIE5PVCBiZSByZWNlaXZlZFxuXHRcdGNvbm4xLmZpcmVBY3Rpb24odGVybWluYWxVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsIGRhdGE6ICdzdGFsZSBkYXRhJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGFSZWNlaXZlZCwgWydwb3N0LXJlY29ubmVjdCBkYXRhJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QoKSB0aW1lcyBvdXQgd2hlbiBzdWJzY3JpcHRpb24gbmV2ZXIgaHlkcmF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubjEgPSBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uMSk7XG5cdFx0Y29uc3QgcHR5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RQdHkoMSwgY29ubjEsIHRlcm1pbmFsVXJpKSk7XG5cdFx0YXdhaXQgcHR5LnN0YXJ0KCk7XG5cblx0XHQvLyBDcmVhdGUgYSBjb25uZWN0aW9uIHdob3NlIHN1YnNjcmlwdGlvbiBuZXZlciBmaXJlcyBvbkRpZENoYW5nZVxuXHRcdGNvbnN0IGNvbm4yID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubjIpO1xuXHRcdC8vIE92ZXJyaWRlIGdldFN1YnNjcmlwdGlvbiB0byByZXR1cm4gYSBzdWJzY3JpcHRpb24gdGhhdCBuZXZlciBoeWRyYXRlc1xuXHRcdGNvbm4yLmdldFN1YnNjcmlwdGlvbiA9IDxUPihfa2luZDogU3RhdGVDb21wb25lbnRzLCBfcmVzb3VyY2U6IFVSSSk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPFQ+PiA9PiB7XG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPFRlcm1pbmFsU3RhdGU+KCk7XG5cdFx0XHRjb25zdCBvbkRpZEFwcGx5QWN0aW9uID0gbmV3IEVtaXR0ZXI8QWN0aW9uRW52ZWxvcGU+KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQob25EaWRDaGFuZ2UpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG9uRGlkQXBwbHlBY3Rpb24pO1xuXHRcdFx0Y29uc3Qgc3ViOiBJQWdlbnRTdWJzY3JpcHRpb248VGVybWluYWxTdGF0ZT4gPSB7XG5cdFx0XHRcdHZhbHVlOiB1bmRlZmluZWQsIC8vIG5ldmVyIGh5ZHJhdGVkXG5cdFx0XHRcdHZlcmlmaWVkVmFsdWU6IHVuZGVmaW5lZCwgb25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50LCBvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSwgb25EaWRBcHBseUFjdGlvbjogb25EaWRBcHBseUFjdGlvbi5ldmVudCxcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvYmplY3Q6IHN1YiBhcyBJQWdlbnRTdWJzY3JpcHRpb248VD4sIGRpc3Bvc2U6ICgpID0+IHsgb25EaWRDaGFuZ2UuZGlzcG9zZSgpOyBvbkRpZEFwcGx5QWN0aW9uLmRpc3Bvc2UoKTsgfSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdC8vIFN1cHByZXNzIHRoZSBleHBlY3RlZCBjb25zb2xlLndhcm4gZnJvbSByZWNvbm5lY3QgZmFpbHVyZVxuXHRcdGNvbnN0IG9yaWdXYXJuID0gY29uc29sZS53YXJuO1xuXHRcdGNvbnNvbGUud2FybiA9ICgpID0+IHsgfTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHR5LnJlY29ubmVjdChjb25uMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSwgJ3JlY29ubmVjdCgpIHNob3VsZCBmYWlsIG9uIHRpbWVvdXQnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29uc29sZS53YXJuID0gb3JpZ1dhcm47XG5cdFx0fVxuXHR9KS50aW1lb3V0KDE1MDAwKTsgLy8gQWxsb3cgZm9yIHRoZSAxMHMgaHlkcmF0aW9uIHRpbWVvdXRcblxuXHR0ZXN0KCdyZWNvbm5lY3QoKSBkaXNwYXRjaGVzIGlucHV0IHRvIG5ldyBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4xID0gbmV3IE1vY2tBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29ubjEpO1xuXHRcdGNvbnN0IHB0eSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UHR5KDEsIGNvbm4xLCB0ZXJtaW5hbFVyaSkpO1xuXHRcdGF3YWl0IHB0eS5zdGFydCgpO1xuXG5cdFx0Y29uc3QgY29ubjIgPSBuZXcgTW9ja0FnZW50Q29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25uMik7XG5cdFx0YXdhaXQgcHR5LnJlY29ubmVjdChjb25uMik7XG5cblx0XHRwdHkuaW5wdXQoJ2FmdGVyIHJlY29ubmVjdCcpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0Y29uc3QgaW5wdXRBY3Rpb25zID0gY29ubjIuZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGEgPT4gYS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbElucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChpbnB1dEFjdGlvbnNbMF0uYWN0aW9uIGFzIHsgZGF0YTogc3RyaW5nIH0pLmRhdGEsICdhZnRlciByZWNvbm5lY3QnKTtcblxuXHRcdC8vIGNvbm4xIHNob3VsZCBub3QgaGF2ZSByZWNlaXZlZCB0aGUgaW5wdXRcblx0XHRjb25zdCBvbGRJbnB1dEFjdGlvbnMgPSBjb25uMS5kaXNwYXRjaGVkQWN0aW9ucy5maWx0ZXIoYSA9PiBhLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsSW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbGRJbnB1dEFjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUFtQztBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBb0M7QUFFN0MsU0FBUyxrQkFBK0I7QUFDeEMsU0FBb0IseUJBQTZDO0FBS2pFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsOEJBQThCO0FBR3ZDLFNBQVMsdUJBQXVCO0FBSWhDLE1BQU0sb0JBQWdEO0FBQUEsRUFxQnJELFlBQVksY0FBdUM7QUFuQm5ELFNBQVMsV0FBVztBQUVwQixTQUFRLE9BQU87QUFDZixTQUFpQixlQUFlLElBQUksUUFBd0I7QUFDNUQsU0FBUyxjQUFxQyxLQUFLLGFBQWE7QUFDaEUsU0FBaUIscUJBQXFCLElBQUksUUFBdUI7QUFDakUsU0FBUyxvQkFBMEMsS0FBSyxtQkFBbUI7QUFDM0UsU0FBUyxvQkFBZ0gsTUFBTTtBQUMvSCxTQUFTLG1CQUFtSixnQkFBZ0IsTUFBUztBQUVyTCxTQUFTLG9CQUF3SSxDQUFDO0FBQ2xKLFNBQVMsbUJBQTJDLENBQUM7QUFDckQsU0FBUyxvQkFBMkIsQ0FBQztBQUNyQyxTQUFTLHNCQUE2QixDQUFDO0FBRXZDLFNBQVEsaUJBQWdDO0FBQUEsTUFDdkMsT0FBTztBQUFBLE1BQWlCLFNBQVMsQ0FBQztBQUFBLE1BQUcsT0FBTyxFQUFFLE1BQU0sa0JBQWtCLFFBQVEsVUFBVSxjQUFjO0FBQUEsSUFDdkc7QUF1REE7QUFBQSxTQUFTLFlBQTJDO0FBQUEsTUFDbkQsT0FBTztBQUFBLE1BQVcsZUFBZTtBQUFBLE1BQVcsYUFB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
