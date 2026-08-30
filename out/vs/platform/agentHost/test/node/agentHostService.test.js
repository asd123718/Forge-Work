import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService, NullLoggerService } from "../../../log/common/log.js";
import { NullTelemetryServiceShape } from "../../../telemetry/common/telemetryUtils.js";
import { AgentHostProcessManager } from "../../node/agentHostService.js";
class TestChannel {
  call(_command, _arg) {
    return Promise.resolve([]);
  }
  listen(_event, _arg) {
    return Event.None;
  }
}
class TestAgentHostStarter {
  constructor() {
    this._onRequestConnection = new Emitter();
    this.onRequestConnection = this._onRequestConnection.event;
    this._onRequestRestart = new Emitter();
    this.onRequestRestart = this._onRequestRestart.event;
    this._onWillShutdown = new Emitter();
    this.onWillShutdown = this._onWillShutdown.event;
    this._onDidStart = new Emitter();
    this._exitEmitters = [];
    this._channel = new TestChannel();
    this.connectionStores = [];
    this.startCount = 0;
    this.shutdownCount = 0;
    this.isDisposed = false;
  }
  async start() {
    this.startCount++;
    this._onDidStart.fire(this.startCount);
    const startBarrier = this._startBarrier;
    if (startBarrier) {
      await startBarrier.p;
      if (this._startBarrier === startBarrier) {
        this._startBarrier = void 0;
      }
    }
    if (this._startError) {
      const error = this._startError;
      this._startError = void 0;
      throw error;
    }
    const exitEmitter = new Emitter();
    this._exitEmitters.push(exitEmitter);
    const store = new DisposableStore();
    store.add(exitEmitter);
    this.connectionStores.push(store);
    const client = {
      getChannel: () => this._channel
    };
    return {
      client,
      store,
      onDidProcessExit: exitEmitter.event,
      shutdown: async () => {
        this.shutdownCount++;
        await this._shutdownBarrier?.p;
      }
    };
  }
  requestConnection() {
    let startPromise;
    this._onRequestConnection.fire({
      waitUntil: (promise) => startPromise = promise
    });
    if (!startPromise) {
      throw new Error("Start request was not handled.");
    }
    return startPromise;
  }
  requestRestart() {
    this._onRequestRestart.fire();
  }
  async waitForStartCount(startCount) {
    if (this.startCount >= startCount) {
      return;
    }
    await Event.toPromise(Event.filter(this._onDidStart.event, (count) => count >= startCount));
  }
  fireProcessExit(code) {
    this._exitEmitters.at(-1)?.fire({ code, signal: "unknown" });
  }
  failNextStart(error) {
    this._startError = error;
  }
  blockNextStart() {
    this._startBarrier = new DeferredPromise();
    return this._startBarrier;
  }
  blockShutdown() {
    this._shutdownBarrier = new DeferredPromise();
    return this._shutdownBarrier;
  }
  requestShutdown() {
    let shutdownPromise;
    this._onWillShutdown.fire({
      join: (promise) => shutdownPromise = promise
    });
    if (!shutdownPromise) {
      throw new Error("Shutdown request was not handled.");
    }
    return shutdownPromise;
  }
  dispose() {
    this.isDisposed = true;
    this._onRequestConnection.dispose();
    this._onRequestRestart.dispose();
    this._onDidStart.dispose();
    this._onWillShutdown.dispose();
    for (const store of this.connectionStores) {
      store.dispose();
    }
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
suite("AgentHostProcessManager", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  async function createManager(platform = "linux") {
    const starter = new TestAgentHostStarter();
    const telemetryService = new TestTelemetryService();
    const manager = disposables.add(new AgentHostProcessManager(
      starter,
      platform,
      new NullLogService(),
      disposables.add(new NullLoggerService()),
      telemetryService
    ));
    await starter.requestConnection();
    return { manager, starter, telemetryService };
  }
  for (const [name, code] of [
    ["STATUS_DLL_INIT_FAILED_LOGOFF", 3221226091],
    ["DBG_TERMINATE_PROCESS", 1073807364]
  ]) {
    test(`does not automatically restart or report ${name}, but allows explicit recovery`, async () => {
      const { manager, starter, telemetryService } = await createManager("win32");
      starter.fireProcessExit(code);
      await Promise.resolve();
      const startCountAfterExit = starter.startCount;
      await manager.restart();
      assert.deepStrictEqual({
        startCountAfterExit,
        startCountAfterRestart: starter.startCount,
        connectionDisposed: starter.connectionStores[0].isDisposed,
        errorEvents: telemetryService.errorEvents
      }, {
        startCountAfterExit: 1,
        startCountAfterRestart: 2,
        connectionDisposed: true,
        errorEvents: []
      });
    });
  }
  test("restarts and reports the same exit code on non-Windows platforms", async () => {
    const { starter, telemetryService } = await createManager("linux");
    starter.fireProcessExit(3221226091);
    await starter.waitForStartCount(2);
    assert.deepStrictEqual({
      startCount: starter.startCount,
      errorEvents: telemetryService.errorEvents
    }, {
      startCount: 2,
      errorEvents: [{
        eventName: "agentHost.processError",
        data: {
          hostLaunchKind: "vscode_main_process",
          kind: "unexpectedExit",
          code: 3221226091,
          restartCount: 0,
          willRestart: true,
          isError: true
        }
      }]
    });
  });
  test("explicit restart disposes the current process and resets crash recovery", async () => {
    const { manager, starter, telemetryService } = await createManager();
    starter.fireProcessExit(17);
    await starter.waitForStartCount(2);
    await manager.restart();
    starter.fireProcessExit(18);
    await starter.waitForStartCount(4);
    assert.deepStrictEqual({
      startCount: starter.startCount,
      shutdownCount: starter.shutdownCount,
      connectionStoresDisposed: starter.connectionStores.map((store) => store.isDisposed),
      errorEvents: telemetryService.errorEvents
    }, {
      startCount: 4,
      shutdownCount: 1,
      connectionStoresDisposed: [true, true, true, false],
      errorEvents: [
        { eventName: "agentHost.processError", data: { hostLaunchKind: "vscode_main_process", kind: "unexpectedExit", code: 17, restartCount: 0, willRestart: true, isError: true } },
        { eventName: "agentHost.processError", data: { hostLaunchKind: "vscode_main_process", kind: "unexpectedExit", code: 18, restartCount: 0, willRestart: true, isError: true } }
      ]
    });
  });
  test("handles restart requests from the starter", async () => {
    const { starter, telemetryService } = await createManager();
    starter.requestRestart();
    await starter.waitForStartCount(2);
    assert.deepStrictEqual({
      startCount: starter.startCount,
      shutdownCount: starter.shutdownCount,
      connectionStoresDisposed: starter.connectionStores.map((store) => store.isDisposed),
      errorEvents: telemetryService.errorEvents
    }, {
      startCount: 2,
      shutdownCount: 1,
      connectionStoresDisposed: [true, false],
      errorEvents: []
    });
  });
  test("rejects lifecycle work after disposal", async () => {
    const { manager } = await createManager();
    manager.dispose();
    await assert.rejects(manager.restart(), /shutting down/);
  });
  test("stops after the configured number of restarts", async () => {
    const { starter, telemetryService } = await createManager();
    for (let restartCount = 0; restartCount <= 5; restartCount++) {
      starter.fireProcessExit(17);
      if (restartCount < 5) {
        await starter.waitForStartCount(restartCount + 2);
      }
    }
    await assert.rejects(starter.requestConnection(), /stopped after 5 restarts/);
    assert.deepStrictEqual({
      startCount: starter.startCount,
      errorEvents: telemetryService.errorEvents
    }, {
      startCount: 6,
      errorEvents: [
        { eventName: "agentHost.processError", data: { hostLaunchKind: "vscode_main_process", kind: "unexpectedExit", code: 17, restartCount: 0, willRestart: true, isError: true } },
        { eventName: "agentHost.processError", data: { hostLaunchKind: "vscode_main_process", kind: "unexpectedExit", code: 17, restartCount: 1, willRestart: true, isError: true } },
        { eventName: "agentHost.processError", data: { hostLaunchKind: "vscode_main_process", kind: "unexpectedExit", code: 17, restartCount: 2, willRestart: true, isError: true } },
        { eventName: "agentHost.processError", data: { hostLaunchKind: "vscode_main_process", kind: "unexpectedExit", code: 17, restartCount: 3, willRestart: true, isError: true } },
        { eventName: "agentHost.processError", data: { hostLaunchKind: "vscode_main_process", kind: "unexpectedExit", code: 17, restartCount: 4, willRestart: true, isError: true } },
        { eventName: "agentHost.processError", data: { hostLaunchKind: "vscode_main_process", kind: "unexpectedExit", code: 17, restartCount: 5, willRestart: false, isError: true } }
      ]
    });
  });
  test("retries a failed start on the next connection request", async () => {
    const starter = new TestAgentHostStarter();
    const telemetryService = new TestTelemetryService();
    disposables.add(new AgentHostProcessManager(
      starter,
      "linux",
      new NullLogService(),
      disposables.add(new NullLoggerService()),
      telemetryService
    ));
    starter.failNextStart(new Error("failed"));
    await assert.rejects(starter.requestConnection(), /failed/);
    await starter.requestConnection();
    assert.deepStrictEqual({
      startCount: starter.startCount,
      errorEvents: telemetryService.errorEvents.length
    }, {
      startCount: 2,
      errorEvents: 1
    });
  });
  test("shares an in-flight start across connection requests", async () => {
    const starter = new TestAgentHostStarter();
    const barrier = starter.blockNextStart();
    disposables.add(new AgentHostProcessManager(
      starter,
      "linux",
      new NullLogService(),
      disposables.add(new NullLoggerService()),
      new TestTelemetryService()
    ));
    const firstRequest = starter.requestConnection();
    const secondRequest = starter.requestConnection();
    await Promise.resolve();
    const startCountWhileBlocked = starter.startCount;
    barrier.complete();
    await Promise.all([firstRequest, secondRequest]);
    assert.deepStrictEqual({
      startCountWhileBlocked,
      finalStartCount: starter.startCount
    }, {
      startCountWhileBlocked: 1,
      finalStartCount: 1
    });
  });
  test("serializes an explicit restart after an in-flight start", async () => {
    const starter = new TestAgentHostStarter();
    const barrier = starter.blockNextStart();
    const manager = disposables.add(new AgentHostProcessManager(
      starter,
      "linux",
      new NullLogService(),
      disposables.add(new NullLoggerService()),
      new TestTelemetryService()
    ));
    const initialStart = starter.requestConnection();
    const restart = manager.restart();
    await Promise.resolve();
    const startCountWhileBlocked = starter.startCount;
    barrier.complete();
    await Promise.all([initialStart, restart]);
    assert.deepStrictEqual({
      startCountWhileBlocked,
      finalStartCount: starter.startCount,
      connectionStoresDisposed: starter.connectionStores.map((store) => store.isDisposed)
    }, {
      startCountWhileBlocked: 1,
      finalStartCount: 2,
      connectionStoresDisposed: [true, false]
    });
  });
  test("connection requests wait while explicit restart drains the old process", async () => {
    const { manager, starter } = await createManager();
    const shutdownBarrier = starter.blockShutdown();
    const restart = manager.restart();
    const connectionRequest = starter.requestConnection();
    let connectionResolved = false;
    void connectionRequest.then(() => connectionResolved = true);
    await Promise.resolve();
    const startCountWhileDraining = starter.startCount;
    const connectionResolvedWhileDraining = connectionResolved;
    shutdownBarrier.complete();
    await Promise.all([restart, connectionRequest]);
    assert.deepStrictEqual({
      startCountWhileDraining,
      connectionResolvedWhileDraining,
      finalStartCount: starter.startCount
    }, {
      startCountWhileDraining: 1,
      connectionResolvedWhileDraining: false,
      finalStartCount: 2
    });
  });
  test("joins graceful shutdown and disposes the connection", async () => {
    const { starter } = await createManager();
    await starter.requestShutdown();
    assert.deepStrictEqual({
      shutdownCount: starter.shutdownCount,
      connectionDisposed: starter.connectionStores[0].isDisposed
    }, {
      shutdownCount: 1,
      connectionDisposed: true
    });
  });
  test("bounds graceful shutdown before disposing the connection", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const { starter } = await createManager();
    starter.blockShutdown();
    await starter.requestShutdown();
    assert.deepStrictEqual({
      shutdownCount: starter.shutdownCount,
      connectionDisposed: starter.connectionStores[0].isDisposed
    }, {
      shutdownCount: 1,
      connectionDisposed: true
    });
  }));
  test("bounds shutdown while startup is still pending", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const starter = new TestAgentHostStarter();
    starter.blockNextStart();
    disposables.add(new AgentHostProcessManager(
      starter,
      "linux",
      new NullLogService(),
      disposables.add(new NullLoggerService()),
      new TestTelemetryService()
    ));
    void starter.requestConnection().catch(() => {
    });
    await starter.requestShutdown();
    assert.deepStrictEqual({
      startCount: starter.startCount,
      shutdownCount: starter.shutdownCount,
      connectionCount: starter.connectionStores.length,
      starterDisposed: starter.isDisposed
    }, {
      startCount: 1,
      shutdownCount: 0,
      connectionCount: 0,
      starterDisposed: true
    });
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ2hhbm5lbCwgSUNoYW5uZWxDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlLCBOdWxsTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDb25uZWN0aW9uLCBJQWdlbnRIb3N0U2h1dGRvd25SZXF1ZXN0LCBJQWdlbnRIb3N0U3RhcnRlciwgSUFnZW50SG9zdFN0YXJ0UmVxdWVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U2VydmljZS5qcyc7XG5cbmNsYXNzIFRlc3RDaGFubmVsIGltcGxlbWVudHMgSUNoYW5uZWwge1xuXHRjYWxsPFQ+KF9jb21tYW5kOiBzdHJpbmcsIF9hcmc/OiB1bmtub3duKTogUHJvbWlzZTxUPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSBhcyBUKTtcblx0fVxuXG5cdGxpc3RlbjxUPihfZXZlbnQ6IHN0cmluZywgX2FyZz86IHVua25vd24pOiBFdmVudDxUPiB7XG5cdFx0cmV0dXJuIEV2ZW50Lk5vbmU7XG5cdH1cbn1cblxuY2xhc3MgVGVzdEFnZW50SG9zdFN0YXJ0ZXIgaW1wbGVtZW50cyBJQWdlbnRIb3N0U3RhcnRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUmVxdWVzdENvbm5lY3Rpb24gPSBuZXcgRW1pdHRlcjxJQWdlbnRIb3N0U3RhcnRSZXF1ZXN0PigpO1xuXHRyZWFkb25seSBvblJlcXVlc3RDb25uZWN0aW9uID0gdGhpcy5fb25SZXF1ZXN0Q29ubmVjdGlvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXF1ZXN0UmVzdGFydCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uUmVxdWVzdFJlc3RhcnQgPSB0aGlzLl9vblJlcXVlc3RSZXN0YXJ0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxTaHV0ZG93biA9IG5ldyBFbWl0dGVyPElBZ2VudEhvc3RTaHV0ZG93blJlcXVlc3Q+KCk7XG5cdHJlYWRvbmx5IG9uV2lsbFNodXRkb3duID0gdGhpcy5fb25XaWxsU2h1dGRvd24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RhcnQgPSBuZXcgRW1pdHRlcjxudW1iZXI+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXhpdEVtaXR0ZXJzOiBFbWl0dGVyPHsgY29kZTogbnVtYmVyOyBzaWduYWw6IHN0cmluZyB9PltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5uZWwgPSBuZXcgVGVzdENoYW5uZWwoKTtcblx0cmVhZG9ubHkgY29ubmVjdGlvblN0b3JlczogRGlzcG9zYWJsZVN0b3JlW10gPSBbXTtcblx0c3RhcnRDb3VudCA9IDA7XG5cdHNodXRkb3duQ291bnQgPSAwO1xuXHRpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX3N0YXJ0RXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGFydEJhcnJpZXI6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2h1dGRvd25CYXJyaWVyOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0YXN5bmMgc3RhcnQoKTogUHJvbWlzZTxJQWdlbnRIb3N0Q29ubmVjdGlvbj4ge1xuXHRcdHRoaXMuc3RhcnRDb3VudCsrO1xuXHRcdHRoaXMuX29uRGlkU3RhcnQuZmlyZSh0aGlzLnN0YXJ0Q291bnQpO1xuXHRcdGNvbnN0IHN0YXJ0QmFycmllciA9IHRoaXMuX3N0YXJ0QmFycmllcjtcblx0XHRpZiAoc3RhcnRCYXJyaWVyKSB7XG5cdFx0XHRhd2FpdCBzdGFydEJhcnJpZXIucDtcblx0XHRcdGlmICh0aGlzLl9zdGFydEJhcnJpZXIgPT09IHN0YXJ0QmFycmllcikge1xuXHRcdFx0XHR0aGlzLl9zdGFydEJhcnJpZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGFydEVycm9yKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IHRoaXMuX3N0YXJ0RXJyb3I7XG5cdFx0XHR0aGlzLl9zdGFydEVycm9yID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBjb2RlOiBudW1iZXI7IHNpZ25hbDogc3RyaW5nIH0+KCk7XG5cdFx0dGhpcy5fZXhpdEVtaXR0ZXJzLnB1c2goZXhpdEVtaXR0ZXIpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChleGl0RW1pdHRlcik7XG5cdFx0dGhpcy5jb25uZWN0aW9uU3RvcmVzLnB1c2goc3RvcmUpO1xuXHRcdGNvbnN0IGNsaWVudDogSUNoYW5uZWxDbGllbnQgPSB7XG5cdFx0XHRnZXRDaGFubmVsOiA8VCBleHRlbmRzIElDaGFubmVsPigpOiBUID0+IHRoaXMuX2NoYW5uZWwgYXMgVCxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRjbGllbnQsXG5cdFx0XHRzdG9yZSxcblx0XHRcdG9uRGlkUHJvY2Vzc0V4aXQ6IGV4aXRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0c2h1dGRvd246IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5zaHV0ZG93bkNvdW50Kys7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3NodXRkb3duQmFycmllcj8ucDtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHJlcXVlc3RDb25uZWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBzdGFydFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25SZXF1ZXN0Q29ubmVjdGlvbi5maXJlKHtcblx0XHRcdHdhaXRVbnRpbDogcHJvbWlzZSA9PiBzdGFydFByb21pc2UgPSBwcm9taXNlLFxuXHRcdH0pO1xuXHRcdGlmICghc3RhcnRQcm9taXNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1N0YXJ0IHJlcXVlc3Qgd2FzIG5vdCBoYW5kbGVkLicpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhcnRQcm9taXNlO1xuXHR9XG5cblx0cmVxdWVzdFJlc3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25SZXF1ZXN0UmVzdGFydC5maXJlKCk7XG5cdH1cblxuXHRhc3luYyB3YWl0Rm9yU3RhcnRDb3VudChzdGFydENvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdGFydENvdW50ID49IHN0YXJ0Q291bnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcih0aGlzLl9vbkRpZFN0YXJ0LmV2ZW50LCBjb3VudCA9PiBjb3VudCA+PSBzdGFydENvdW50KSk7XG5cdH1cblxuXHRmaXJlUHJvY2Vzc0V4aXQoY29kZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZXhpdEVtaXR0ZXJzLmF0KC0xKT8uZmlyZSh7IGNvZGUsIHNpZ25hbDogJ3Vua25vd24nIH0pO1xuXHR9XG5cblx0ZmFpbE5leHRTdGFydChlcnJvcjogRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGFydEVycm9yID0gZXJyb3I7XG5cdH1cblxuXHRibG9ja05leHRTdGFydCgpOiBEZWZlcnJlZFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3N0YXJ0QmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRCYXJyaWVyO1xuXHR9XG5cblx0YmxvY2tTaHV0ZG93bigpOiBEZWZlcnJlZFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3NodXRkb3duQmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRyZXR1cm4gdGhpcy5fc2h1dGRvd25CYXJyaWVyO1xuXHR9XG5cblx0cmVxdWVzdFNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBzaHV0ZG93blByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25XaWxsU2h1dGRvd24uZmlyZSh7XG5cdFx0XHRqb2luOiBwcm9taXNlID0+IHNodXRkb3duUHJvbWlzZSA9IHByb21pc2UsXG5cdFx0fSk7XG5cdFx0aWYgKCFzaHV0ZG93blByb21pc2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2h1dGRvd24gcmVxdWVzdCB3YXMgbm90IGhhbmRsZWQuJyk7XG5cdFx0fVxuXHRcdHJldHVybiBzaHV0ZG93blByb21pc2U7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fb25SZXF1ZXN0Q29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25SZXF1ZXN0UmVzdGFydC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRTdGFydC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25XaWxsU2h1dGRvd24uZGlzcG9zZSgpO1xuXHRcdGZvciAoY29uc3Qgc3RvcmUgb2YgdGhpcy5jb25uZWN0aW9uU3RvcmVzKSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRlc3RUZWxlbWV0cnlTZXJ2aWNlIGV4dGVuZHMgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB7XG5cdHJlYWRvbmx5IGVycm9yRXZlbnRzOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHB1YmxpY0xvZ0Vycm9yMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50TmFtZSkge1xuXHRcdFx0dGhpcy5lcnJvckV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHRcdH1cblx0fVxufVxuXG5zdWl0ZSgnQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlTWFuYWdlcihwbGF0Zm9ybTogTm9kZUpTLlBsYXRmb3JtID0gJ2xpbnV4Jyk6IFByb21pc2U8e1xuXHRcdG1hbmFnZXI6IEFnZW50SG9zdFByb2Nlc3NNYW5hZ2VyO1xuXHRcdHN0YXJ0ZXI6IFRlc3RBZ2VudEhvc3RTdGFydGVyO1xuXHRcdHRlbGVtZXRyeVNlcnZpY2U6IFRlc3RUZWxlbWV0cnlTZXJ2aWNlO1xuXHR9PiB7XG5cdFx0Y29uc3Qgc3RhcnRlciA9IG5ldyBUZXN0QWdlbnRIb3N0U3RhcnRlcigpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCBtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcihcblx0XHRcdHN0YXJ0ZXIsXG5cdFx0XHRwbGF0Zm9ybSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nZ2VyU2VydmljZSgpKSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0YXdhaXQgc3RhcnRlci5yZXF1ZXN0Q29ubmVjdGlvbigpO1xuXHRcdHJldHVybiB7IG1hbmFnZXIsIHN0YXJ0ZXIsIHRlbGVtZXRyeVNlcnZpY2UgfTtcblx0fVxuXG5cdGZvciAoY29uc3QgW25hbWUsIGNvZGVdIG9mIFtcblx0XHRbJ1NUQVRVU19ETExfSU5JVF9GQUlMRURfTE9HT0ZGJywgMHhDMDAwMDI2Ql0sXG5cdFx0WydEQkdfVEVSTUlOQVRFX1BST0NFU1MnLCAweDQwMDEwMDA0XSxcblx0XSBhcyBjb25zdCkge1xuXHRcdHRlc3QoYGRvZXMgbm90IGF1dG9tYXRpY2FsbHkgcmVzdGFydCBvciByZXBvcnQgJHtuYW1lfSwgYnV0IGFsbG93cyBleHBsaWNpdCByZWNvdmVyeWAsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbWFuYWdlciwgc3RhcnRlciwgdGVsZW1ldHJ5U2VydmljZSB9ID0gYXdhaXQgY3JlYXRlTWFuYWdlcignd2luMzInKTtcblxuXHRcdFx0c3RhcnRlci5maXJlUHJvY2Vzc0V4aXQoY29kZSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdGNvbnN0IHN0YXJ0Q291bnRBZnRlckV4aXQgPSBzdGFydGVyLnN0YXJ0Q291bnQ7XG5cdFx0XHRhd2FpdCBtYW5hZ2VyLnJlc3RhcnQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXJ0Q291bnRBZnRlckV4aXQsXG5cdFx0XHRcdHN0YXJ0Q291bnRBZnRlclJlc3RhcnQ6IHN0YXJ0ZXIuc3RhcnRDb3VudCxcblx0XHRcdFx0Y29ubmVjdGlvbkRpc3Bvc2VkOiBzdGFydGVyLmNvbm5lY3Rpb25TdG9yZXNbMF0uaXNEaXNwb3NlZCxcblx0XHRcdFx0ZXJyb3JFdmVudHM6IHRlbGVtZXRyeVNlcnZpY2UuZXJyb3JFdmVudHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXJ0Q291bnRBZnRlckV4aXQ6IDEsXG5cdFx0XHRcdHN0YXJ0Q291bnRBZnRlclJlc3RhcnQ6IDIsXG5cdFx0XHRcdGNvbm5lY3Rpb25EaXNwb3NlZDogdHJ1ZSxcblx0XHRcdFx0ZXJyb3JFdmVudHM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdyZXN0YXJ0cyBhbmQgcmVwb3J0cyB0aGUgc2FtZSBleGl0IGNvZGUgb24gbm9uLVdpbmRvd3MgcGxhdGZvcm1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc3RhcnRlciwgdGVsZW1ldHJ5U2VydmljZSB9ID0gYXdhaXQgY3JlYXRlTWFuYWdlcignbGludXgnKTtcblxuXHRcdHN0YXJ0ZXIuZmlyZVByb2Nlc3NFeGl0KDB4QzAwMDAyNkIpO1xuXHRcdGF3YWl0IHN0YXJ0ZXIud2FpdEZvclN0YXJ0Q291bnQoMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0Q291bnQ6IHN0YXJ0ZXIuc3RhcnRDb3VudCxcblx0XHRcdGVycm9yRXZlbnRzOiB0ZWxlbWV0cnlTZXJ2aWNlLmVycm9yRXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0Q291bnQ6IDIsXG5cdFx0XHRlcnJvckV2ZW50czogW3tcblx0XHRcdFx0ZXZlbnROYW1lOiAnYWdlbnRIb3N0LnByb2Nlc3NFcnJvcicsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRob3N0TGF1bmNoS2luZDogJ3ZzY29kZV9tYWluX3Byb2Nlc3MnLFxuXHRcdFx0XHRcdGtpbmQ6ICd1bmV4cGVjdGVkRXhpdCcsXG5cdFx0XHRcdFx0Y29kZTogMHhDMDAwMDI2Qixcblx0XHRcdFx0XHRyZXN0YXJ0Q291bnQ6IDAsXG5cdFx0XHRcdFx0d2lsbFJlc3RhcnQ6IHRydWUsXG5cdFx0XHRcdFx0aXNFcnJvcjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCByZXN0YXJ0IGRpc3Bvc2VzIHRoZSBjdXJyZW50IHByb2Nlc3MgYW5kIHJlc2V0cyBjcmFzaCByZWNvdmVyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IG1hbmFnZXIsIHN0YXJ0ZXIsIHRlbGVtZXRyeVNlcnZpY2UgfSA9IGF3YWl0IGNyZWF0ZU1hbmFnZXIoKTtcblxuXHRcdHN0YXJ0ZXIuZmlyZVByb2Nlc3NFeGl0KDE3KTtcblx0XHRhd2FpdCBzdGFydGVyLndhaXRGb3JTdGFydENvdW50KDIpO1xuXHRcdGF3YWl0IG1hbmFnZXIucmVzdGFydCgpO1xuXHRcdHN0YXJ0ZXIuZmlyZVByb2Nlc3NFeGl0KDE4KTtcblx0XHRhd2FpdCBzdGFydGVyLndhaXRGb3JTdGFydENvdW50KDQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydENvdW50OiBzdGFydGVyLnN0YXJ0Q291bnQsXG5cdFx0XHRzaHV0ZG93bkNvdW50OiBzdGFydGVyLnNodXRkb3duQ291bnQsXG5cdFx0XHRjb25uZWN0aW9uU3RvcmVzRGlzcG9zZWQ6IHN0YXJ0ZXIuY29ubmVjdGlvblN0b3Jlcy5tYXAoc3RvcmUgPT4gc3RvcmUuaXNEaXNwb3NlZCksXG5cdFx0XHRlcnJvckV2ZW50czogdGVsZW1ldHJ5U2VydmljZS5lcnJvckV2ZW50cyxcblx0XHR9LCB7XG5cdFx0XHRzdGFydENvdW50OiA0LFxuXHRcdFx0c2h1dGRvd25Db3VudDogMSxcblx0XHRcdGNvbm5lY3Rpb25TdG9yZXNEaXNwb3NlZDogW3RydWUsIHRydWUsIHRydWUsIGZhbHNlXSxcblx0XHRcdGVycm9yRXZlbnRzOiBbXG5cdFx0XHRcdHsgZXZlbnROYW1lOiAnYWdlbnRIb3N0LnByb2Nlc3NFcnJvcicsIGRhdGE6IHsgaG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJywga2luZDogJ3VuZXhwZWN0ZWRFeGl0JywgY29kZTogMTcsIHJlc3RhcnRDb3VudDogMCwgd2lsbFJlc3RhcnQ6IHRydWUsIGlzRXJyb3I6IHRydWUgfSB9LFxuXHRcdFx0XHR7IGV2ZW50TmFtZTogJ2FnZW50SG9zdC5wcm9jZXNzRXJyb3InLCBkYXRhOiB7IGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsIGtpbmQ6ICd1bmV4cGVjdGVkRXhpdCcsIGNvZGU6IDE4LCByZXN0YXJ0Q291bnQ6IDAsIHdpbGxSZXN0YXJ0OiB0cnVlLCBpc0Vycm9yOiB0cnVlIH0gfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgcmVzdGFydCByZXF1ZXN0cyBmcm9tIHRoZSBzdGFydGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc3RhcnRlciwgdGVsZW1ldHJ5U2VydmljZSB9ID0gYXdhaXQgY3JlYXRlTWFuYWdlcigpO1xuXG5cdFx0c3RhcnRlci5yZXF1ZXN0UmVzdGFydCgpO1xuXHRcdGF3YWl0IHN0YXJ0ZXIud2FpdEZvclN0YXJ0Q291bnQoMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0Q291bnQ6IHN0YXJ0ZXIuc3RhcnRDb3VudCxcblx0XHRcdHNodXRkb3duQ291bnQ6IHN0YXJ0ZXIuc2h1dGRvd25Db3VudCxcblx0XHRcdGNvbm5lY3Rpb25TdG9yZXNEaXNwb3NlZDogc3RhcnRlci5jb25uZWN0aW9uU3RvcmVzLm1hcChzdG9yZSA9PiBzdG9yZS5pc0Rpc3Bvc2VkKSxcblx0XHRcdGVycm9yRXZlbnRzOiB0ZWxlbWV0cnlTZXJ2aWNlLmVycm9yRXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0Q291bnQ6IDIsXG5cdFx0XHRzaHV0ZG93bkNvdW50OiAxLFxuXHRcdFx0Y29ubmVjdGlvblN0b3Jlc0Rpc3Bvc2VkOiBbdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0ZXJyb3JFdmVudHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGxpZmVjeWNsZSB3b3JrIGFmdGVyIGRpc3Bvc2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbWFuYWdlciB9ID0gYXdhaXQgY3JlYXRlTWFuYWdlcigpO1xuXHRcdG1hbmFnZXIuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMobWFuYWdlci5yZXN0YXJ0KCksIC9zaHV0dGluZyBkb3duLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3BzIGFmdGVyIHRoZSBjb25maWd1cmVkIG51bWJlciBvZiByZXN0YXJ0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHN0YXJ0ZXIsIHRlbGVtZXRyeVNlcnZpY2UgfSA9IGF3YWl0IGNyZWF0ZU1hbmFnZXIoKTtcblxuXHRcdGZvciAobGV0IHJlc3RhcnRDb3VudCA9IDA7IHJlc3RhcnRDb3VudCA8PSA1OyByZXN0YXJ0Q291bnQrKykge1xuXHRcdFx0c3RhcnRlci5maXJlUHJvY2Vzc0V4aXQoMTcpO1xuXHRcdFx0aWYgKHJlc3RhcnRDb3VudCA8IDUpIHtcblx0XHRcdFx0YXdhaXQgc3RhcnRlci53YWl0Rm9yU3RhcnRDb3VudChyZXN0YXJ0Q291bnQgKyAyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoc3RhcnRlci5yZXF1ZXN0Q29ubmVjdGlvbigpLCAvc3RvcHBlZCBhZnRlciA1IHJlc3RhcnRzLyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0Q291bnQ6IHN0YXJ0ZXIuc3RhcnRDb3VudCxcblx0XHRcdGVycm9yRXZlbnRzOiB0ZWxlbWV0cnlTZXJ2aWNlLmVycm9yRXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0Q291bnQ6IDYsXG5cdFx0XHRlcnJvckV2ZW50czogW1xuXHRcdFx0XHR7IGV2ZW50TmFtZTogJ2FnZW50SG9zdC5wcm9jZXNzRXJyb3InLCBkYXRhOiB7IGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsIGtpbmQ6ICd1bmV4cGVjdGVkRXhpdCcsIGNvZGU6IDE3LCByZXN0YXJ0Q291bnQ6IDAsIHdpbGxSZXN0YXJ0OiB0cnVlLCBpc0Vycm9yOiB0cnVlIH0gfSxcblx0XHRcdFx0eyBldmVudE5hbWU6ICdhZ2VudEhvc3QucHJvY2Vzc0Vycm9yJywgZGF0YTogeyBob3N0TGF1bmNoS2luZDogJ3ZzY29kZV9tYWluX3Byb2Nlc3MnLCBraW5kOiAndW5leHBlY3RlZEV4aXQnLCBjb2RlOiAxNywgcmVzdGFydENvdW50OiAxLCB3aWxsUmVzdGFydDogdHJ1ZSwgaXNFcnJvcjogdHJ1ZSB9IH0sXG5cdFx0XHRcdHsgZXZlbnROYW1lOiAnYWdlbnRIb3N0LnByb2Nlc3NFcnJvcicsIGRhdGE6IHsgaG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJywga2luZDogJ3VuZXhwZWN0ZWRFeGl0JywgY29kZTogMTcsIHJlc3RhcnRDb3VudDogMiwgd2lsbFJlc3RhcnQ6IHRydWUsIGlzRXJyb3I6IHRydWUgfSB9LFxuXHRcdFx0XHR7IGV2ZW50TmFtZTogJ2FnZW50SG9zdC5wcm9jZXNzRXJyb3InLCBkYXRhOiB7IGhvc3RMYXVuY2hLaW5kOiAndnNjb2RlX21haW5fcHJvY2VzcycsIGtpbmQ6ICd1bmV4cGVjdGVkRXhpdCcsIGNvZGU6IDE3LCByZXN0YXJ0Q291bnQ6IDMsIHdpbGxSZXN0YXJ0OiB0cnVlLCBpc0Vycm9yOiB0cnVlIH0gfSxcblx0XHRcdFx0eyBldmVudE5hbWU6ICdhZ2VudEhvc3QucHJvY2Vzc0Vycm9yJywgZGF0YTogeyBob3N0TGF1bmNoS2luZDogJ3ZzY29kZV9tYWluX3Byb2Nlc3MnLCBraW5kOiAndW5leHBlY3RlZEV4aXQnLCBjb2RlOiAxNywgcmVzdGFydENvdW50OiA0LCB3aWxsUmVzdGFydDogdHJ1ZSwgaXNFcnJvcjogdHJ1ZSB9IH0sXG5cdFx0XHRcdHsgZXZlbnROYW1lOiAnYWdlbnRIb3N0LnByb2Nlc3NFcnJvcicsIGRhdGE6IHsgaG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJywga2luZDogJ3VuZXhwZWN0ZWRFeGl0JywgY29kZTogMTcsIHJlc3RhcnRDb3VudDogNSwgd2lsbFJlc3RhcnQ6IGZhbHNlLCBpc0Vycm9yOiB0cnVlIH0gfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHJpZXMgYSBmYWlsZWQgc3RhcnQgb24gdGhlIG5leHQgY29ubmVjdGlvbiByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXJ0ZXIgPSBuZXcgVGVzdEFnZW50SG9zdFN0YXJ0ZXIoKTtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcihcblx0XHRcdHN0YXJ0ZXIsXG5cdFx0XHQnbGludXgnLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dnZXJTZXJ2aWNlKCkpLFxuXHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHQpKTtcblx0XHRzdGFydGVyLmZhaWxOZXh0U3RhcnQobmV3IEVycm9yKCdmYWlsZWQnKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhzdGFydGVyLnJlcXVlc3RDb25uZWN0aW9uKCksIC9mYWlsZWQvKTtcblx0XHRhd2FpdCBzdGFydGVyLnJlcXVlc3RDb25uZWN0aW9uKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0Q291bnQ6IHN0YXJ0ZXIuc3RhcnRDb3VudCxcblx0XHRcdGVycm9yRXZlbnRzOiB0ZWxlbWV0cnlTZXJ2aWNlLmVycm9yRXZlbnRzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRzdGFydENvdW50OiAyLFxuXHRcdFx0ZXJyb3JFdmVudHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoYXJlcyBhbiBpbi1mbGlnaHQgc3RhcnQgYWNyb3NzIGNvbm5lY3Rpb24gcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhcnRlciA9IG5ldyBUZXN0QWdlbnRIb3N0U3RhcnRlcigpO1xuXHRcdGNvbnN0IGJhcnJpZXIgPSBzdGFydGVyLmJsb2NrTmV4dFN0YXJ0KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcihcblx0XHRcdHN0YXJ0ZXIsXG5cdFx0XHQnbGludXgnLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dnZXJTZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBmaXJzdFJlcXVlc3QgPSBzdGFydGVyLnJlcXVlc3RDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2Vjb25kUmVxdWVzdCA9IHN0YXJ0ZXIucmVxdWVzdENvbm5lY3Rpb24oKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBzdGFydENvdW50V2hpbGVCbG9ja2VkID0gc3RhcnRlci5zdGFydENvdW50O1xuXHRcdGJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbZmlyc3RSZXF1ZXN0LCBzZWNvbmRSZXF1ZXN0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0Q291bnRXaGlsZUJsb2NrZWQsXG5cdFx0XHRmaW5hbFN0YXJ0Q291bnQ6IHN0YXJ0ZXIuc3RhcnRDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRzdGFydENvdW50V2hpbGVCbG9ja2VkOiAxLFxuXHRcdFx0ZmluYWxTdGFydENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemVzIGFuIGV4cGxpY2l0IHJlc3RhcnQgYWZ0ZXIgYW4gaW4tZmxpZ2h0IHN0YXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXJ0ZXIgPSBuZXcgVGVzdEFnZW50SG9zdFN0YXJ0ZXIoKTtcblx0XHRjb25zdCBiYXJyaWVyID0gc3RhcnRlci5ibG9ja05leHRTdGFydCgpO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFByb2Nlc3NNYW5hZ2VyKFxuXHRcdFx0c3RhcnRlcixcblx0XHRcdCdsaW51eCcsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ2dlclNlcnZpY2UoKSksXG5cdFx0XHRuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGluaXRpYWxTdGFydCA9IHN0YXJ0ZXIucmVxdWVzdENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCByZXN0YXJ0ID0gbWFuYWdlci5yZXN0YXJ0KCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y29uc3Qgc3RhcnRDb3VudFdoaWxlQmxvY2tlZCA9IHN0YXJ0ZXIuc3RhcnRDb3VudDtcblx0XHRiYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2luaXRpYWxTdGFydCwgcmVzdGFydF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydENvdW50V2hpbGVCbG9ja2VkLFxuXHRcdFx0ZmluYWxTdGFydENvdW50OiBzdGFydGVyLnN0YXJ0Q291bnQsXG5cdFx0XHRjb25uZWN0aW9uU3RvcmVzRGlzcG9zZWQ6IHN0YXJ0ZXIuY29ubmVjdGlvblN0b3Jlcy5tYXAoc3RvcmUgPT4gc3RvcmUuaXNEaXNwb3NlZCksXG5cdFx0fSwge1xuXHRcdFx0c3RhcnRDb3VudFdoaWxlQmxvY2tlZDogMSxcblx0XHRcdGZpbmFsU3RhcnRDb3VudDogMixcblx0XHRcdGNvbm5lY3Rpb25TdG9yZXNEaXNwb3NlZDogW3RydWUsIGZhbHNlXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29ubmVjdGlvbiByZXF1ZXN0cyB3YWl0IHdoaWxlIGV4cGxpY2l0IHJlc3RhcnQgZHJhaW5zIHRoZSBvbGQgcHJvY2VzcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IG1hbmFnZXIsIHN0YXJ0ZXIgfSA9IGF3YWl0IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCBzaHV0ZG93bkJhcnJpZXIgPSBzdGFydGVyLmJsb2NrU2h1dGRvd24oKTtcblxuXHRcdGNvbnN0IHJlc3RhcnQgPSBtYW5hZ2VyLnJlc3RhcnQoKTtcblx0XHRjb25zdCBjb25uZWN0aW9uUmVxdWVzdCA9IHN0YXJ0ZXIucmVxdWVzdENvbm5lY3Rpb24oKTtcblx0XHRsZXQgY29ubmVjdGlvblJlc29sdmVkID0gZmFsc2U7XG5cdFx0dm9pZCBjb25uZWN0aW9uUmVxdWVzdC50aGVuKCgpID0+IGNvbm5lY3Rpb25SZXNvbHZlZCA9IHRydWUpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IHN0YXJ0Q291bnRXaGlsZURyYWluaW5nID0gc3RhcnRlci5zdGFydENvdW50O1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25SZXNvbHZlZFdoaWxlRHJhaW5pbmcgPSBjb25uZWN0aW9uUmVzb2x2ZWQ7XG5cdFx0c2h1dGRvd25CYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3Jlc3RhcnQsIGNvbm5lY3Rpb25SZXF1ZXN0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0Q291bnRXaGlsZURyYWluaW5nLFxuXHRcdFx0Y29ubmVjdGlvblJlc29sdmVkV2hpbGVEcmFpbmluZyxcblx0XHRcdGZpbmFsU3RhcnRDb3VudDogc3RhcnRlci5zdGFydENvdW50LFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0Q291bnRXaGlsZURyYWluaW5nOiAxLFxuXHRcdFx0Y29ubmVjdGlvblJlc29sdmVkV2hpbGVEcmFpbmluZzogZmFsc2UsXG5cdFx0XHRmaW5hbFN0YXJ0Q291bnQ6IDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2pvaW5zIGdyYWNlZnVsIHNodXRkb3duIGFuZCBkaXNwb3NlcyB0aGUgY29ubmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHN0YXJ0ZXIgfSA9IGF3YWl0IGNyZWF0ZU1hbmFnZXIoKTtcblxuXHRcdGF3YWl0IHN0YXJ0ZXIucmVxdWVzdFNodXRkb3duKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNodXRkb3duQ291bnQ6IHN0YXJ0ZXIuc2h1dGRvd25Db3VudCxcblx0XHRcdGNvbm5lY3Rpb25EaXNwb3NlZDogc3RhcnRlci5jb25uZWN0aW9uU3RvcmVzWzBdLmlzRGlzcG9zZWQsXG5cdFx0fSwge1xuXHRcdFx0c2h1dGRvd25Db3VudDogMSxcblx0XHRcdGNvbm5lY3Rpb25EaXNwb3NlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYm91bmRzIGdyYWNlZnVsIHNodXRkb3duIGJlZm9yZSBkaXNwb3NpbmcgdGhlIGNvbm5lY3Rpb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHN0YXJ0ZXIgfSA9IGF3YWl0IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRzdGFydGVyLmJsb2NrU2h1dGRvd24oKTtcblxuXHRcdGF3YWl0IHN0YXJ0ZXIucmVxdWVzdFNodXRkb3duKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNodXRkb3duQ291bnQ6IHN0YXJ0ZXIuc2h1dGRvd25Db3VudCxcblx0XHRcdGNvbm5lY3Rpb25EaXNwb3NlZDogc3RhcnRlci5jb25uZWN0aW9uU3RvcmVzWzBdLmlzRGlzcG9zZWQsXG5cdFx0fSwge1xuXHRcdFx0c2h1dGRvd25Db3VudDogMSxcblx0XHRcdGNvbm5lY3Rpb25EaXNwb3NlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2JvdW5kcyBzaHV0ZG93biB3aGlsZSBzdGFydHVwIGlzIHN0aWxsIHBlbmRpbmcnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdGFydGVyID0gbmV3IFRlc3RBZ2VudEhvc3RTdGFydGVyKCk7XG5cdFx0c3RhcnRlci5ibG9ja05leHRTdGFydCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXIoXG5cdFx0XHRzdGFydGVyLFxuXHRcdFx0J2xpbnV4Jyxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nZ2VyU2VydmljZSgpKSxcblx0XHRcdG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpLFxuXHRcdCkpO1xuXHRcdHZvaWQgc3RhcnRlci5yZXF1ZXN0Q29ubmVjdGlvbigpLmNhdGNoKCgpID0+IHsgfSk7XG5cblx0XHRhd2FpdCBzdGFydGVyLnJlcXVlc3RTaHV0ZG93bigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydENvdW50OiBzdGFydGVyLnN0YXJ0Q291bnQsXG5cdFx0XHRzaHV0ZG93bkNvdW50OiBzdGFydGVyLnNodXRkb3duQ291bnQsXG5cdFx0XHRjb25uZWN0aW9uQ291bnQ6IHN0YXJ0ZXIuY29ubmVjdGlvblN0b3Jlcy5sZW5ndGgsXG5cdFx0XHRzdGFydGVyRGlzcG9zZWQ6IHN0YXJ0ZXIuaXNEaXNwb3NlZCxcblx0XHR9LCB7XG5cdFx0XHRzdGFydENvdW50OiAxLFxuXHRcdFx0c2h1dGRvd25Db3VudDogMCxcblx0XHRcdGNvbm5lY3Rpb25Db3VudDogMCxcblx0XHRcdHN0YXJ0ZXJEaXNwb3NlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSkpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsaUNBQWlD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
