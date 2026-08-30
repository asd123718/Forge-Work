import assert from "assert";
import { DeferredPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { AgentHostIpcChannels } from "../../../platform/agentHost/common/agentService.js";
import { NullLogService, NullLoggerService } from "../../../platform/log/common/log.js";
import { NullTelemetryServiceShape } from "../../../platform/telemetry/common/telemetryUtils.js";
import { ServerAgentHostManager } from "../../node/serverAgentHostManager.js";
class MockChannel {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
    this._callResults = /* @__PURE__ */ new Map();
  }
  getEmitter(event) {
    let emitter = this._listeners.get(event);
    if (!emitter) {
      emitter = new Emitter();
      this._listeners.set(event, emitter);
    }
    return emitter;
  }
  setCallResult(command, value) {
    this._callResults.set(command, value);
  }
  call(command, _arg) {
    return Promise.resolve(this._callResults.get(command) ?? void 0);
  }
  listen(event, _arg) {
    return this.getEmitter(event).event;
  }
  dispose() {
    for (const emitter of this._listeners.values()) {
      emitter.dispose();
    }
    this._listeners.clear();
  }
}
class MockAgentHostStarter {
  constructor() {
    this._onDidProcessExit = new Emitter();
    this.connectionStores = [];
    this.startCount = 0;
    this.shutdownCount = 0;
    this.agentHostChannel = new MockChannel();
    this.connectionTrackerChannel = new MockChannel();
    this.loggerChannel = new MockChannel();
    this.loggerChannel.setCallResult("getRegisteredLoggers", []);
  }
  async start() {
    this.startCount++;
    if (this._startError) {
      const error = this._startError;
      this._startError = void 0;
      throw error;
    }
    const store = new DisposableStore();
    this.connectionStores.push(store);
    const client = {
      getChannel: (name) => {
        switch (name) {
          case AgentHostIpcChannels.AgentHost:
            return this.agentHostChannel;
          case AgentHostIpcChannels.Logger:
            return this.loggerChannel;
          case AgentHostIpcChannels.ConnectionTracker:
            return this.connectionTrackerChannel;
          default:
            throw new Error(`Unknown channel: ${name}`);
        }
      }
    };
    return {
      client,
      store,
      onDidProcessExit: this._onDidProcessExit.event,
      shutdown: async () => {
        this.shutdownCount++;
      }
    };
  }
  fireProcessExit(code) {
    this._onDidProcessExit.fire({ code, signal: "" });
  }
  failNextStart(error) {
    this._startError = error;
  }
  dispose() {
    this._onDidProcessExit.dispose();
    this.agentHostChannel.dispose();
    this.loggerChannel.dispose();
    this.connectionTrackerChannel.dispose();
  }
}
class MockServerLifetimeService extends Disposable {
  constructor() {
    super(...arguments);
    this._onWillShutdown = this._register(new Emitter());
    this.onWillShutdown = this._onWillShutdown.event;
    this._onDidAbortShutdown = this._register(new Emitter());
    this.onDidAbortShutdown = this._onDidAbortShutdown.event;
    this._activeCount = 0;
  }
  get hasActiveConsumers() {
    return this._activeCount > 0;
  }
  active(_consumer) {
    this._activeCount++;
    return toDisposable(() => {
      this._activeCount--;
    });
  }
  delay() {
  }
  requestShutdown() {
    const joins = [];
    this._onWillShutdown.fire({ join: (promise) => joins.push(promise) });
    return Promise.all(joins).then(() => void 0);
  }
  abortShutdown() {
    this._onDidAbortShutdown.fire();
  }
}
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.errorEvents = [];
  }
  publicLogError2(eventName, data) {
    if (eventName) {
      this.errorEvents.push({ eventName, data });
    }
  }
}
function readWillRestart(data) {
  if (typeof data === "object" && data !== null) {
    const willRestart = Reflect.get(data, "willRestart");
    return typeof willRestart === "boolean" ? willRestart : void 0;
  }
  return void 0;
}
suite("ServerAgentHostManager", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let starter;
  let lifetimeService;
  let telemetryService;
  setup(() => {
    starter = new MockAgentHostStarter();
    lifetimeService = ds.add(new MockServerLifetimeService());
    telemetryService = new TestTelemetryService();
  });
  function createManager(options = {}) {
    return ds.add(new ServerAgentHostManager(
      starter,
      options,
      new NullLogService(),
      ds.add(new NullLoggerService()),
      lifetimeService,
      telemetryService
    ));
  }
  async function waitForStart(manager) {
    await manager.ensureStarted();
  }
  function fireActiveSessions(count) {
    starter.agentHostChannel.getEmitter("onDidAction").fire({
      action: { type: "root/activeSessionsChanged", activeSessions: count },
      serverSeq: 1,
      origin: void 0
    });
  }
  function fireConnectionCount(count) {
    starter.connectionTrackerChannel.getEmitter("onDidChangeConnectionCount").fire(count);
  }
  test("no lifetime token initially", async () => {
    const manager = createManager();
    await waitForStart(manager);
    assert.strictEqual(lifetimeService.hasActiveConsumers, false);
  });
  test("joins graceful Agent Host shutdown before server exit", async () => {
    const manager = createManager();
    await waitForStart(manager);
    await lifetimeService.requestShutdown();
    assert.deepStrictEqual({
      shutdownCount: starter.shutdownCount,
      connectionDisposed: starter.connectionStores[0].isDisposed
    }, {
      shutdownCount: 1,
      connectionDisposed: true
    });
  });
  test("restarts an eager Agent Host after server shutdown is aborted", async () => {
    const manager = createManager();
    await waitForStart(manager);
    await lifetimeService.requestShutdown();
    lifetimeService.abortShutdown();
    await manager.ensureStarted();
    assert.deepStrictEqual({
      startCount: starter.startCount,
      shutdownCount: starter.shutdownCount
    }, {
      startCount: 2,
      shutdownCount: 1
    });
  });
  test("acquires token when sessions become active", async () => {
    const manager = createManager();
    await waitForStart(manager);
    fireActiveSessions(1);
    assert.strictEqual(lifetimeService.hasActiveConsumers, true);
  });
  test("acquires token when standalone WebSocket clients connect", async () => {
    const manager = createManager();
    await waitForStart(manager);
    fireConnectionCount(2);
    assert.strictEqual(lifetimeService.hasActiveConsumers, true);
  });
  test("releases token only when both sessions and standalone WebSocket connections are zero", async () => {
    const manager = createManager();
    await waitForStart(manager);
    fireActiveSessions(1);
    assert.strictEqual(lifetimeService.hasActiveConsumers, true);
    fireConnectionCount(1);
    assert.strictEqual(lifetimeService.hasActiveConsumers, true);
    fireActiveSessions(0);
    assert.strictEqual(lifetimeService.hasActiveConsumers, true);
    fireConnectionCount(0);
    assert.strictEqual(lifetimeService.hasActiveConsumers, false);
  });
  test("process exit resets both signals and clears token", async () => {
    const manager = createManager();
    await waitForStart(manager);
    fireActiveSessions(2);
    fireConnectionCount(1);
    assert.strictEqual(lifetimeService.hasActiveConsumers, true);
    starter.fireProcessExit(1);
    assert.strictEqual(lifetimeService.hasActiveConsumers, false);
  });
  test("reports unexpected process exit", async () => {
    const manager = createManager();
    await waitForStart(manager);
    starter.fireProcessExit(17);
    assert.deepStrictEqual(telemetryService.errorEvents, [{
      eventName: "agentHost.processError",
      data: {
        hostLaunchKind: "vscode_cli",
        kind: "unexpectedExit",
        code: 17,
        restartCount: 0,
        willRestart: true,
        isError: true
      }
    }]);
  });
  test("reports process start failure", async () => {
    const error = new Error("test start failure");
    error.stack = "test start failure stack";
    starter.failNextStart(error);
    const manager = createManager();
    await waitForStart(manager);
    assert.deepStrictEqual(telemetryService.errorEvents, [{
      eventName: "agentHost.processError",
      data: {
        hostLaunchKind: "vscode_cli",
        kind: "startFailed",
        restartCount: 0,
        willRestart: true,
        isError: true,
        callstack: "test start failure stack",
        msg: "test start failure"
      }
    }]);
  });
  test("starts eagerly by default", async () => {
    const manager = createManager();
    await manager.ensureStarted();
    assert.strictEqual(starter.startCount, 1);
  });
  test("does not start lazily until requested", async () => {
    const manager = createManager({ startMode: "lazy" });
    assert.strictEqual(starter.startCount, 0);
    await manager.ensureStarted();
    assert.strictEqual(starter.startCount, 1);
  });
  test("shares concurrent lazy startup", async () => {
    const manager = createManager({ startMode: "lazy" });
    await Promise.all([
      manager.ensureStarted(),
      manager.ensureStarted()
    ]);
    assert.strictEqual(starter.startCount, 1);
  });
  test("restarts after a lazy agent host crash", async () => {
    const manager = createManager({ startMode: "lazy" });
    await manager.ensureStarted();
    starter.fireProcessExit(1);
    await manager.ensureStarted();
    assert.strictEqual(starter.startCount, 2);
  });
  test("waits for the configured WebSocket listener before resolving startup", async () => {
    const ready = new DeferredPromise();
    starter.connectionTrackerChannel.setCallResult("waitForConfiguredWebSocketServer", ready.p);
    const manager = createManager({ startMode: "lazy" });
    const start = manager.ensureStarted();
    let started = false;
    void start.then(() => started = true);
    await Promise.resolve();
    assert.strictEqual(started, false);
    await ready.complete();
    await start;
    assert.strictEqual(started, true);
  });
  test("disposes the agent host connection when the manager shuts down during startup", async () => {
    const ready = new DeferredPromise();
    starter.connectionTrackerChannel.setCallResult("waitForConfiguredWebSocketServer", ready.p);
    const manager = createManager({ startMode: "lazy" });
    const start = manager.ensureStarted();
    await Promise.resolve();
    manager.dispose();
    await ready.complete();
    await start;
    assert.strictEqual(starter.connectionStores[0].isDisposed, true);
  });
  test("allows a new explicit start after exhausting crash restarts", async () => {
    const manager = createManager({ startMode: "lazy" });
    await manager.ensureStarted();
    for (let i = 0; i <= 5; i++) {
      starter.fireProcessExit(1);
      await manager.ensureStarted();
    }
    starter.fireProcessExit(1);
    await manager.ensureStarted();
    assert.strictEqual(starter.startCount, 8);
  });
  test("keeps the original request pending while a transient start failure is retried", async () => {
    const manager = createManager({ startMode: "lazy" });
    starter.failNextStart(new Error("transient"));
    await manager.ensureStarted();
    assert.strictEqual(starter.startCount, 2);
  });
  test("does not double-restart when the host exits during startup", async () => {
    const ready = new DeferredPromise();
    starter.connectionTrackerChannel.setCallResult("waitForConfiguredWebSocketServer", ready.p);
    const manager = createManager({ startMode: "lazy" });
    const start = manager.ensureStarted();
    await Promise.resolve();
    starter.connectionTrackerChannel.setCallResult("waitForConfiguredWebSocketServer", Promise.resolve());
    ready.error(new Error("canceled"));
    starter.fireProcessExit(1);
    await start;
    assert.strictEqual(starter.startCount, 2);
  });
  test("stops after five restarts and disposes every exited connection", async () => {
    const manager = createManager();
    await waitForStart(manager);
    for (let restartCount = 0; restartCount < 5; restartCount++) {
      starter.fireProcessExit(17);
      await waitForStart(manager);
    }
    starter.fireProcessExit(17);
    await Promise.resolve();
    assert.deepStrictEqual({
      startCount: starter.startCount,
      allConnectionsDisposed: starter.connectionStores.every((store) => store.isDisposed),
      willRestart: telemetryService.errorEvents.map((event) => readWillRestart(event.data))
    }, {
      startCount: 6,
      allConnectionsDisposed: true,
      willRestart: [true, true, true, true, true, false]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXHRlc3RcXG5vZGVcXHNlcnZlckFnZW50SG9zdE1hbmFnZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNoYW5uZWwsIElDaGFubmVsQ2xpZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q29ubmVjdGlvbiwgSUFnZW50SG9zdFN0YXJ0ZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElwY0NoYW5uZWxzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UsIE51bGxMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgU2VydmVyQWdlbnRIb3N0TWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvc2VydmVyQWdlbnRIb3N0TWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJU2VydmVyTGlmZXRpbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zZXJ2ZXJMaWZldGltZVNlcnZpY2UuanMnO1xuXG4vLyAtLS0tIE1vY2sgaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBNb2NrQ2hhbm5lbCBpbXBsZW1lbnRzIElDaGFubmVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdGVuZXJzID0gbmV3IE1hcDxzdHJpbmcsIEVtaXR0ZXI8dW5rbm93bj4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbGxSZXN1bHRzID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7XG5cblx0Z2V0RW1pdHRlcihldmVudDogc3RyaW5nKTogRW1pdHRlcjx1bmtub3duPiB7XG5cdFx0bGV0IGVtaXR0ZXIgPSB0aGlzLl9saXN0ZW5lcnMuZ2V0KGV2ZW50KTtcblx0XHRpZiAoIWVtaXR0ZXIpIHtcblx0XHRcdGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx1bmtub3duPigpO1xuXHRcdFx0dGhpcy5fbGlzdGVuZXJzLnNldChldmVudCwgZW1pdHRlcik7XG5cdFx0fVxuXHRcdHJldHVybiBlbWl0dGVyO1xuXHR9XG5cblx0c2V0Q2FsbFJlc3VsdChjb21tYW5kOiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FsbFJlc3VsdHMuc2V0KGNvbW1hbmQsIHZhbHVlKTtcblx0fVxuXG5cdGNhbGw8VD4oY29tbWFuZDogc3RyaW5nLCBfYXJnPzogdW5rbm93bik6IFByb21pc2U8VD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKHRoaXMuX2NhbGxSZXN1bHRzLmdldChjb21tYW5kKSA/PyB1bmRlZmluZWQpIGFzIFQpO1xuXHR9XG5cblx0bGlzdGVuPFQ+KGV2ZW50OiBzdHJpbmcsIF9hcmc/OiB1bmtub3duKTogRXZlbnQ8VD4ge1xuXHRcdHJldHVybiB0aGlzLmdldEVtaXR0ZXIoZXZlbnQpLmV2ZW50IGFzIEV2ZW50PFQ+O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVtaXR0ZXIgb2YgdGhpcy5fbGlzdGVuZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fbGlzdGVuZXJzLmNsZWFyKCk7XG5cdH1cbn1cblxuY2xhc3MgTW9ja0FnZW50SG9zdFN0YXJ0ZXIgaW1wbGVtZW50cyBJQWdlbnRIb3N0U3RhcnRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHJvY2Vzc0V4aXQgPSBuZXcgRW1pdHRlcjx7IGNvZGU6IG51bWJlcjsgc2lnbmFsOiBzdHJpbmcgfT4oKTtcblx0cHJpdmF0ZSBfc3RhcnRFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25TdG9yZXM6IERpc3Bvc2FibGVTdG9yZVtdID0gW107XG5cdHN0YXJ0Q291bnQgPSAwO1xuXHRzaHV0ZG93bkNvdW50ID0gMDtcblxuXHRyZWFkb25seSBhZ2VudEhvc3RDaGFubmVsID0gbmV3IE1vY2tDaGFubmVsKCk7XG5cdHJlYWRvbmx5IGxvZ2dlckNoYW5uZWw6IE1vY2tDaGFubmVsO1xuXHRyZWFkb25seSBjb25uZWN0aW9uVHJhY2tlckNoYW5uZWwgPSBuZXcgTW9ja0NoYW5uZWwoKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLmxvZ2dlckNoYW5uZWwgPSBuZXcgTW9ja0NoYW5uZWwoKTtcblx0XHR0aGlzLmxvZ2dlckNoYW5uZWwuc2V0Q2FsbFJlc3VsdCgnZ2V0UmVnaXN0ZXJlZExvZ2dlcnMnLCBbXSk7XG5cdH1cblxuXHRhc3luYyBzdGFydCgpOiBQcm9taXNlPElBZ2VudEhvc3RDb25uZWN0aW9uPiB7XG5cdFx0dGhpcy5zdGFydENvdW50Kys7XG5cdFx0aWYgKHRoaXMuX3N0YXJ0RXJyb3IpIHtcblx0XHRcdGNvbnN0IGVycm9yID0gdGhpcy5fc3RhcnRFcnJvcjtcblx0XHRcdHRoaXMuX3N0YXJ0RXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmNvbm5lY3Rpb25TdG9yZXMucHVzaChzdG9yZSk7XG5cdFx0Y29uc3QgY2xpZW50OiBJQ2hhbm5lbENsaWVudCA9IHtcblx0XHRcdGdldENoYW5uZWw6IDxUIGV4dGVuZHMgSUNoYW5uZWw+KG5hbWU6IHN0cmluZyk6IFQgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKG5hbWUpIHtcblx0XHRcdFx0XHRjYXNlIEFnZW50SG9zdElwY0NoYW5uZWxzLkFnZW50SG9zdDpcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmFnZW50SG9zdENoYW5uZWwgYXMgdW5rbm93biBhcyBUO1xuXHRcdFx0XHRcdGNhc2UgQWdlbnRIb3N0SXBjQ2hhbm5lbHMuTG9nZ2VyOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMubG9nZ2VyQ2hhbm5lbCBhcyB1bmtub3duIGFzIFQ7XG5cdFx0XHRcdFx0Y2FzZSBBZ2VudEhvc3RJcGNDaGFubmVscy5Db25uZWN0aW9uVHJhY2tlcjpcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbm5lY3Rpb25UcmFja2VyQ2hhbm5lbCBhcyB1bmtub3duIGFzIFQ7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBjaGFubmVsOiAke25hbWV9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2xpZW50LFxuXHRcdFx0c3RvcmUsXG5cdFx0XHRvbkRpZFByb2Nlc3NFeGl0OiB0aGlzLl9vbkRpZFByb2Nlc3NFeGl0LmV2ZW50LFxuXHRcdFx0c2h1dGRvd246IGFzeW5jICgpID0+IHsgdGhpcy5zaHV0ZG93bkNvdW50Kys7IH0sXG5cdFx0fTtcblx0fVxuXG5cdGZpcmVQcm9jZXNzRXhpdChjb2RlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFByb2Nlc3NFeGl0LmZpcmUoeyBjb2RlLCBzaWduYWw6ICcnIH0pO1xuXHR9XG5cblx0ZmFpbE5leHRTdGFydChlcnJvcjogRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGFydEVycm9yID0gZXJyb3I7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkUHJvY2Vzc0V4aXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuYWdlbnRIb3N0Q2hhbm5lbC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5sb2dnZXJDaGFubmVsLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNvbm5lY3Rpb25UcmFja2VyQ2hhbm5lbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTW9ja1NlcnZlckxpZmV0aW1lU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2VydmVyTGlmZXRpbWVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2h1dGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGpvaW4ocHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IHZvaWQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbFNodXRkb3duID0gdGhpcy5fb25XaWxsU2h1dGRvd24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWJvcnRTaHV0ZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFib3J0U2h1dGRvd24gPSB0aGlzLl9vbkRpZEFib3J0U2h1dGRvd24uZXZlbnQ7XG5cdHByaXZhdGUgX2FjdGl2ZUNvdW50ID0gMDtcblxuXHRnZXQgaGFzQWN0aXZlQ29uc3VtZXJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVDb3VudCA+IDA7XG5cdH1cblxuXHRhY3RpdmUoX2NvbnN1bWVyOiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fYWN0aXZlQ291bnQrKztcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHsgdGhpcy5fYWN0aXZlQ291bnQtLTsgfSk7XG5cdH1cblxuXHRkZWxheSgpOiB2b2lkIHsgfVxuXG5cdHJlcXVlc3RTaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBqb2luczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0dGhpcy5fb25XaWxsU2h1dGRvd24uZmlyZSh7IGpvaW46IHByb21pc2UgPT4gam9pbnMucHVzaChwcm9taXNlKSB9KTtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoam9pbnMpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKTtcblx0fVxuXG5cdGFib3J0U2h1dGRvd24oKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRBYm9ydFNodXRkb3duLmZpcmUoKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBlcnJvckV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10gPSBbXTtcblxuXHRvdmVycmlkZSBwdWJsaWNMb2dFcnJvcjIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdHRoaXMuZXJyb3JFdmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVhZFdpbGxSZXN0YXJ0KGRhdGE6IHVua25vd24pOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhICE9PSBudWxsKSB7XG5cdFx0Y29uc3Qgd2lsbFJlc3RhcnQgPSBSZWZsZWN0LmdldChkYXRhLCAnd2lsbFJlc3RhcnQnKTtcblx0XHRyZXR1cm4gdHlwZW9mIHdpbGxSZXN0YXJ0ID09PSAnYm9vbGVhbicgPyB3aWxsUmVzdGFydCA6IHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5zdWl0ZSgnU2VydmVyQWdlbnRIb3N0TWFuYWdlcicsICgpID0+IHtcblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgc3RhcnRlcjogTW9ja0FnZW50SG9zdFN0YXJ0ZXI7XG5cdGxldCBsaWZldGltZVNlcnZpY2U6IE1vY2tTZXJ2ZXJMaWZldGltZVNlcnZpY2U7XG5cdGxldCB0ZWxlbWV0cnlTZXJ2aWNlOiBUZXN0VGVsZW1ldHJ5U2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c3RhcnRlciA9IG5ldyBNb2NrQWdlbnRIb3N0U3RhcnRlcigpO1xuXHRcdGxpZmV0aW1lU2VydmljZSA9IGRzLmFkZChuZXcgTW9ja1NlcnZlckxpZmV0aW1lU2VydmljZSgpKTtcblx0XHR0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1hbmFnZXIob3B0aW9ucyA9IHt9KTogU2VydmVyQWdlbnRIb3N0TWFuYWdlciB7XG5cdFx0cmV0dXJuIGRzLmFkZChuZXcgU2VydmVyQWdlbnRIb3N0TWFuYWdlcihcblx0XHRcdHN0YXJ0ZXIsXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRkcy5hZGQobmV3IE51bGxMb2dnZXJTZXJ2aWNlKCkpLFxuXHRcdFx0bGlmZXRpbWVTZXJ2aWNlLFxuXHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHQpKTtcblx0fVxuXG5cdC8vIGBTZXJ2ZXJBZ2VudEhvc3RNYW5hZ2VyYCByZXBvcnRzIHN0YXJ0dXAgY29tcGxldGUgb25seSBvbmNlIHRoZSBhZ2VudCBob3N0XG5cdC8vIGNvbmZpcm1zIGl0cyBjb25maWd1cmVkIFdlYlNvY2tldCBsaXN0ZW5lciBpcyBib3VuZCwgc28gd2FpdCBmb3IgdGhlIHJlYWxcblx0Ly8gc2lnbmFsIHJhdGhlciB0aGFuIGEgZml4ZWQgbnVtYmVyIG9mIG1pY3JvdGFza3MuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JTdGFydChtYW5hZ2VyOiBTZXJ2ZXJBZ2VudEhvc3RNYW5hZ2VyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgbWFuYWdlci5lbnN1cmVTdGFydGVkKCk7XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlQWN0aXZlU2Vzc2lvbnMoY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHN0YXJ0ZXIuYWdlbnRIb3N0Q2hhbm5lbC5nZXRFbWl0dGVyKCdvbkRpZEFjdGlvbicpLmZpcmUoe1xuXHRcdFx0YWN0aW9uOiB7IHR5cGU6ICdyb290L2FjdGl2ZVNlc3Npb25zQ2hhbmdlZCcsIGFjdGl2ZVNlc3Npb25zOiBjb3VudCB9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlQ29ubmVjdGlvbkNvdW50KGNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdGFydGVyLmNvbm5lY3Rpb25UcmFja2VyQ2hhbm5lbC5nZXRFbWl0dGVyKCdvbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudCcpLmZpcmUoY291bnQpO1xuXHR9XG5cblx0dGVzdCgnbm8gbGlmZXRpbWUgdG9rZW4gaW5pdGlhbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXJ0KG1hbmFnZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaWZldGltZVNlcnZpY2UuaGFzQWN0aXZlQ29uc3VtZXJzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2pvaW5zIGdyYWNlZnVsIEFnZW50IEhvc3Qgc2h1dGRvd24gYmVmb3JlIHNlcnZlciBleGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXJ0KG1hbmFnZXIpO1xuXG5cdFx0YXdhaXQgbGlmZXRpbWVTZXJ2aWNlLnJlcXVlc3RTaHV0ZG93bigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaHV0ZG93bkNvdW50OiBzdGFydGVyLnNodXRkb3duQ291bnQsXG5cdFx0XHRjb25uZWN0aW9uRGlzcG9zZWQ6IHN0YXJ0ZXIuY29ubmVjdGlvblN0b3Jlc1swXS5pc0Rpc3Bvc2VkLFxuXHRcdH0sIHtcblx0XHRcdHNodXRkb3duQ291bnQ6IDEsXG5cdFx0XHRjb25uZWN0aW9uRGlzcG9zZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RhcnRzIGFuIGVhZ2VyIEFnZW50IEhvc3QgYWZ0ZXIgc2VydmVyIHNodXRkb3duIGlzIGFib3J0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhcnQobWFuYWdlcik7XG5cdFx0YXdhaXQgbGlmZXRpbWVTZXJ2aWNlLnJlcXVlc3RTaHV0ZG93bigpO1xuXG5cdFx0bGlmZXRpbWVTZXJ2aWNlLmFib3J0U2h1dGRvd24oKTtcblx0XHRhd2FpdCBtYW5hZ2VyLmVuc3VyZVN0YXJ0ZWQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnRDb3VudDogc3RhcnRlci5zdGFydENvdW50LFxuXHRcdFx0c2h1dGRvd25Db3VudDogc3RhcnRlci5zaHV0ZG93bkNvdW50LFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0Q291bnQ6IDIsXG5cdFx0XHRzaHV0ZG93bkNvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3F1aXJlcyB0b2tlbiB3aGVuIHNlc3Npb25zIGJlY29tZSBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhcnQobWFuYWdlcik7XG5cdFx0ZmlyZUFjdGl2ZVNlc3Npb25zKDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaWZldGltZVNlcnZpY2UuaGFzQWN0aXZlQ29uc3VtZXJzLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYWNxdWlyZXMgdG9rZW4gd2hlbiBzdGFuZGFsb25lIFdlYlNvY2tldCBjbGllbnRzIGNvbm5lY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhcnQobWFuYWdlcik7XG5cdFx0ZmlyZUNvbm5lY3Rpb25Db3VudCgyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlmZXRpbWVTZXJ2aWNlLmhhc0FjdGl2ZUNvbnN1bWVycywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGVhc2VzIHRva2VuIG9ubHkgd2hlbiBib3RoIHNlc3Npb25zIGFuZCBzdGFuZGFsb25lIFdlYlNvY2tldCBjb25uZWN0aW9ucyBhcmUgemVybycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGFydChtYW5hZ2VyKTtcblxuXHRcdGZpcmVBY3RpdmVTZXNzaW9ucygxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlmZXRpbWVTZXJ2aWNlLmhhc0FjdGl2ZUNvbnN1bWVycywgdHJ1ZSk7XG5cblx0XHRmaXJlQ29ubmVjdGlvbkNvdW50KDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaWZldGltZVNlcnZpY2UuaGFzQWN0aXZlQ29uc3VtZXJzLCB0cnVlKTtcblxuXHRcdGZpcmVBY3RpdmVTZXNzaW9ucygwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlmZXRpbWVTZXJ2aWNlLmhhc0FjdGl2ZUNvbnN1bWVycywgdHJ1ZSk7XG5cblx0XHRmaXJlQ29ubmVjdGlvbkNvdW50KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaWZldGltZVNlcnZpY2UuaGFzQWN0aXZlQ29uc3VtZXJzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb2Nlc3MgZXhpdCByZXNldHMgYm90aCBzaWduYWxzIGFuZCBjbGVhcnMgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhcnQobWFuYWdlcik7XG5cdFx0ZmlyZUFjdGl2ZVNlc3Npb25zKDIpO1xuXHRcdGZpcmVDb25uZWN0aW9uQ291bnQoMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpZmV0aW1lU2VydmljZS5oYXNBY3RpdmVDb25zdW1lcnMsIHRydWUpO1xuXG5cdFx0c3RhcnRlci5maXJlUHJvY2Vzc0V4aXQoMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpZmV0aW1lU2VydmljZS5oYXNBY3RpdmVDb25zdW1lcnMsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyB1bmV4cGVjdGVkIHByb2Nlc3MgZXhpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGFydChtYW5hZ2VyKTtcblxuXHRcdHN0YXJ0ZXIuZmlyZVByb2Nlc3NFeGl0KDE3KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5U2VydmljZS5lcnJvckV2ZW50cywgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC5wcm9jZXNzRXJyb3InLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRob3N0TGF1bmNoS2luZDogJ3ZzY29kZV9jbGknLFxuXHRcdFx0XHRraW5kOiAndW5leHBlY3RlZEV4aXQnLFxuXHRcdFx0XHRjb2RlOiAxNyxcblx0XHRcdFx0cmVzdGFydENvdW50OiAwLFxuXHRcdFx0XHR3aWxsUmVzdGFydDogdHJ1ZSxcblx0XHRcdFx0aXNFcnJvcjogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIHByb2Nlc3Mgc3RhcnQgZmFpbHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcigndGVzdCBzdGFydCBmYWlsdXJlJyk7XG5cdFx0ZXJyb3Iuc3RhY2sgPSAndGVzdCBzdGFydCBmYWlsdXJlIHN0YWNrJztcblx0XHRzdGFydGVyLmZhaWxOZXh0U3RhcnQoZXJyb3IpO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXJ0KG1hbmFnZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmVycm9yRXZlbnRzLCBbe1xuXHRcdFx0ZXZlbnROYW1lOiAnYWdlbnRIb3N0LnByb2Nlc3NFcnJvcicsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX2NsaScsXG5cdFx0XHRcdGtpbmQ6ICdzdGFydEZhaWxlZCcsXG5cdFx0XHRcdHJlc3RhcnRDb3VudDogMCxcblx0XHRcdFx0d2lsbFJlc3RhcnQ6IHRydWUsXG5cdFx0XHRcdGlzRXJyb3I6IHRydWUsXG5cdFx0XHRcdGNhbGxzdGFjazogJ3Rlc3Qgc3RhcnQgZmFpbHVyZSBzdGFjaycsXG5cdFx0XHRcdG1zZzogJ3Rlc3Qgc3RhcnQgZmFpbHVyZScsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnRzIGVhZ2VybHkgYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gY3JlYXRlTWFuYWdlcigpO1xuXG5cdFx0YXdhaXQgbWFuYWdlci5lbnN1cmVTdGFydGVkKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0ZXIuc3RhcnRDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHN0YXJ0IGxhemlseSB1bnRpbCByZXF1ZXN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGNyZWF0ZU1hbmFnZXIoeyBzdGFydE1vZGU6ICdsYXp5JyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydGVyLnN0YXJ0Q291bnQsIDApO1xuXHRcdGF3YWl0IG1hbmFnZXIuZW5zdXJlU3RhcnRlZCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydGVyLnN0YXJ0Q291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGFyZXMgY29uY3VycmVudCBsYXp5IHN0YXJ0dXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGNyZWF0ZU1hbmFnZXIoeyBzdGFydE1vZGU6ICdsYXp5JyB9KTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdG1hbmFnZXIuZW5zdXJlU3RhcnRlZCgpLFxuXHRcdFx0bWFuYWdlci5lbnN1cmVTdGFydGVkKCksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0ZXIuc3RhcnRDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RhcnRzIGFmdGVyIGEgbGF6eSBhZ2VudCBob3N0IGNyYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBjcmVhdGVNYW5hZ2VyKHsgc3RhcnRNb2RlOiAnbGF6eScgfSk7XG5cdFx0YXdhaXQgbWFuYWdlci5lbnN1cmVTdGFydGVkKCk7XG5cblx0XHRzdGFydGVyLmZpcmVQcm9jZXNzRXhpdCgxKTtcblx0XHRhd2FpdCBtYW5hZ2VyLmVuc3VyZVN0YXJ0ZWQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnRlci5zdGFydENvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnd2FpdHMgZm9yIHRoZSBjb25maWd1cmVkIFdlYlNvY2tldCBsaXN0ZW5lciBiZWZvcmUgcmVzb2x2aW5nIHN0YXJ0dXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhZHkgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0c3RhcnRlci5jb25uZWN0aW9uVHJhY2tlckNoYW5uZWwuc2V0Q2FsbFJlc3VsdCgnd2FpdEZvckNvbmZpZ3VyZWRXZWJTb2NrZXRTZXJ2ZXInLCByZWFkeS5wKTtcblx0XHRjb25zdCBtYW5hZ2VyID0gY3JlYXRlTWFuYWdlcih7IHN0YXJ0TW9kZTogJ2xhenknIH0pO1xuXHRcdGNvbnN0IHN0YXJ0ID0gbWFuYWdlci5lbnN1cmVTdGFydGVkKCk7XG5cdFx0bGV0IHN0YXJ0ZWQgPSBmYWxzZTtcblx0XHR2b2lkIHN0YXJ0LnRoZW4oKCkgPT4gc3RhcnRlZCA9IHRydWUpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0ZWQsIGZhbHNlKTtcblxuXHRcdGF3YWl0IHJlYWR5LmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgc3RhcnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlcyB0aGUgYWdlbnQgaG9zdCBjb25uZWN0aW9uIHdoZW4gdGhlIG1hbmFnZXIgc2h1dHMgZG93biBkdXJpbmcgc3RhcnR1cCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWFkeSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRzdGFydGVyLmNvbm5lY3Rpb25UcmFja2VyQ2hhbm5lbC5zZXRDYWxsUmVzdWx0KCd3YWl0Rm9yQ29uZmlndXJlZFdlYlNvY2tldFNlcnZlcicsIHJlYWR5LnApO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBjcmVhdGVNYW5hZ2VyKHsgc3RhcnRNb2RlOiAnbGF6eScgfSk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBtYW5hZ2VyLmVuc3VyZVN0YXJ0ZWQoKTtcblxuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdG1hbmFnZXIuZGlzcG9zZSgpO1xuXHRcdGF3YWl0IHJlYWR5LmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgc3RhcnQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnRlci5jb25uZWN0aW9uU3RvcmVzWzBdLmlzRGlzcG9zZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgYSBuZXcgZXhwbGljaXQgc3RhcnQgYWZ0ZXIgZXhoYXVzdGluZyBjcmFzaCByZXN0YXJ0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gY3JlYXRlTWFuYWdlcih7IHN0YXJ0TW9kZTogJ2xhenknIH0pO1xuXHRcdGF3YWl0IG1hbmFnZXIuZW5zdXJlU3RhcnRlZCgpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPD0gNTsgaSsrKSB7XG5cdFx0XHRzdGFydGVyLmZpcmVQcm9jZXNzRXhpdCgxKTtcblx0XHRcdGF3YWl0IG1hbmFnZXIuZW5zdXJlU3RhcnRlZCgpO1xuXHRcdH1cblx0XHRzdGFydGVyLmZpcmVQcm9jZXNzRXhpdCgxKTtcblx0XHRhd2FpdCBtYW5hZ2VyLmVuc3VyZVN0YXJ0ZWQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydGVyLnN0YXJ0Q291bnQsIDgpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgb3JpZ2luYWwgcmVxdWVzdCBwZW5kaW5nIHdoaWxlIGEgdHJhbnNpZW50IHN0YXJ0IGZhaWx1cmUgaXMgcmV0cmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gY3JlYXRlTWFuYWdlcih7IHN0YXJ0TW9kZTogJ2xhenknIH0pO1xuXHRcdHN0YXJ0ZXIuZmFpbE5leHRTdGFydChuZXcgRXJyb3IoJ3RyYW5zaWVudCcpKTtcblxuXHRcdGF3YWl0IG1hbmFnZXIuZW5zdXJlU3RhcnRlZCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0ZXIuc3RhcnRDb3VudCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRvdWJsZS1yZXN0YXJ0IHdoZW4gdGhlIGhvc3QgZXhpdHMgZHVyaW5nIHN0YXJ0dXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhZHkgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0c3RhcnRlci5jb25uZWN0aW9uVHJhY2tlckNoYW5uZWwuc2V0Q2FsbFJlc3VsdCgnd2FpdEZvckNvbmZpZ3VyZWRXZWJTb2NrZXRTZXJ2ZXInLCByZWFkeS5wKTtcblx0XHRjb25zdCBtYW5hZ2VyID0gY3JlYXRlTWFuYWdlcih7IHN0YXJ0TW9kZTogJ2xhenknIH0pO1xuXHRcdGNvbnN0IHN0YXJ0ID0gbWFuYWdlci5lbnN1cmVTdGFydGVkKCk7XG5cblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHQvLyBUaGUgSVBDIGNsaWVudCByZWplY3RzIGluLWZsaWdodCByZXF1ZXN0cyBiZWZvcmUgc3VyZmFjaW5nIHRoZSBleGl0LCBzb1xuXHRcdC8vIGJvdGggdGhlIHJlYWRpbmVzcyByZWplY3Rpb24gYW5kIHRoZSBleGl0IGV2ZW50IHJhY2UgdG8gcmVzdGFydC5cblx0XHRzdGFydGVyLmNvbm5lY3Rpb25UcmFja2VyQ2hhbm5lbC5zZXRDYWxsUmVzdWx0KCd3YWl0Rm9yQ29uZmlndXJlZFdlYlNvY2tldFNlcnZlcicsIFByb21pc2UucmVzb2x2ZSgpKTtcblx0XHRyZWFkeS5lcnJvcihuZXcgRXJyb3IoJ2NhbmNlbGVkJykpO1xuXHRcdHN0YXJ0ZXIuZmlyZVByb2Nlc3NFeGl0KDEpO1xuXHRcdGF3YWl0IHN0YXJ0O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0ZXIuc3RhcnRDb3VudCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3BzIGFmdGVyIGZpdmUgcmVzdGFydHMgYW5kIGRpc3Bvc2VzIGV2ZXJ5IGV4aXRlZCBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXJ0KG1hbmFnZXIpO1xuXG5cdFx0Zm9yIChsZXQgcmVzdGFydENvdW50ID0gMDsgcmVzdGFydENvdW50IDwgNTsgcmVzdGFydENvdW50KyspIHtcblx0XHRcdHN0YXJ0ZXIuZmlyZVByb2Nlc3NFeGl0KDE3KTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGFydChtYW5hZ2VyKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgbmV4dCBjcmFzaCBleGhhdXN0cyB0aGUgcmVzdGFydCBidWRnZXQsIHNvIG5vIGF1dG9tYXRpYyByZXN0YXJ0IGZvbGxvd3MuXG5cdFx0c3RhcnRlci5maXJlUHJvY2Vzc0V4aXQoMTcpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydENvdW50OiBzdGFydGVyLnN0YXJ0Q291bnQsXG5cdFx0XHRhbGxDb25uZWN0aW9uc0Rpc3Bvc2VkOiBzdGFydGVyLmNvbm5lY3Rpb25TdG9yZXMuZXZlcnkoc3RvcmUgPT4gc3RvcmUuaXNEaXNwb3NlZCksXG5cdFx0XHR3aWxsUmVzdGFydDogdGVsZW1ldHJ5U2VydmljZS5lcnJvckV2ZW50cy5tYXAoZXZlbnQgPT4gcmVhZFdpbGxSZXN0YXJ0KGV2ZW50LmRhdGEpKSxcblx0XHR9LCB7XG5cdFx0XHRzdGFydENvdW50OiA2LFxuXHRcdFx0YWxsQ29ubmVjdGlvbnNEaXNwb3NlZDogdHJ1ZSxcblx0XHRcdHdpbGxSZXN0YXJ0OiBbdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgdHJ1ZSwgZmFsc2VdLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUywrQ0FBK0M7QUFHeEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsOEJBQThCO0FBS3ZDLE1BQU0sWUFBZ0M7QUFBQSxFQUF0QztBQUNDLFNBQWlCLGFBQWEsb0JBQUksSUFBOEI7QUFDaEUsU0FBaUIsZUFBZSxvQkFBSSxJQUFxQjtBQUFBO0FBQUEsRUFFekQsV0FBVyxPQUFpQztBQUMzQyxRQUFJLFVBQVUsS0FBSyxXQUFXLElBQUksS0FBSztBQUN2QyxRQUFJLENBQUMsU0FBUztBQUNiLGdCQUFVLElBQUksUUFBaUI7QUFDL0IsV0FBSyxXQUFXLElBQUksT0FBTyxPQUFPO0FBQUEsSUFDbkM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsY0FBYyxTQUFp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
