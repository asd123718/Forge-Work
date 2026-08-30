import * as assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../../base/common/observable.js";
import { upcast } from "../../../../../base/common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILoggerService, LogLevel, NullLogger } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { TestLoggerService, TestProductService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { McpServerConnection } from "../../common/mcpServerConnection.js";
import { McpConnectionState, McpServerTransportType, McpServerTrust } from "../../common/mcpTypes.js";
import { TestMcpMessageTransport } from "./mcpRegistryTypes.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { Event } from "../../../../../base/common/event.js";
import { McpTaskManager } from "../../common/mcpTaskManager.js";
class TestMcpHostDelegate extends Disposable {
  constructor() {
    super();
    this._canStartValue = true;
    this.priority = 0;
    this._transport = this._register(new TestMcpMessageTransport());
  }
  substituteVariables(serverDefinition, launch) {
    return Promise.resolve(launch);
  }
  canStart() {
    return this._canStartValue;
  }
  start() {
    if (!this._canStartValue) {
      throw new Error("Cannot start server");
    }
    return this._transport;
  }
  getTransport() {
    return this._transport;
  }
  setCanStart(value) {
    this._canStartValue = value;
  }
  waitForInitialProviderPromises() {
    return Promise.resolve();
  }
}
suite("Workbench - MCP - ServerConnection", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let delegate;
  let transport;
  let collection;
  let serverDefinition;
  setup(() => {
    delegate = store.add(new TestMcpHostDelegate());
    transport = delegate.getTransport();
    const services = new ServiceCollection(
      [ILoggerService, store.add(new TestLoggerService())],
      [IOutputService, upcast({ showChannel: () => {
      } })],
      [IStorageService, store.add(new TestStorageService())],
      [IProductService, TestProductService]
    );
    instantiationService = store.add(new TestInstantiationService(services));
    collection = {
      id: "test-collection",
      label: "Test Collection",
      remoteAuthority: null,
      serverDefinitions: observableValue("serverDefs", []),
      trustBehavior: McpServerTrust.Kind.Trusted,
      scope: StorageScope.APPLICATION,
      configTarget: ConfigurationTarget.USER,
      order: 0
    };
    serverDefinition = {
      id: "test-server",
      label: "Test Server",
      cacheNonce: "a",
      launch: {
        type: McpServerTransportType.Stdio,
        command: "test-command",
        args: [],
        env: {},
        envFile: void 0,
        cwd: "/test",
        sandbox: void 0
      }
    };
  });
  function waitForHandler(cnx) {
    const handler = cnx.handler.get();
    if (handler) {
      return Promise.resolve(handler);
    }
    return new Promise((resolve) => {
      const disposable = autorun((reader) => {
        const handler2 = cnx.handler.read(reader);
        if (handler2) {
          disposable.dispose();
          resolve(handler2);
        }
      });
    });
  }
  test("should start and set state to Running when transport succeeds", async () => {
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const startPromise = connection.start({});
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    const state = await startPromise;
    assert.strictEqual(state.state, McpConnectionState.Kind.Running);
    transport.simulateInitialized();
    assert.ok(await waitForHandler(connection));
  });
  test("should handle errors during start", async () => {
    delegate.setCanStart(false);
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const state = await connection.start({});
    assert.strictEqual(state.state, McpConnectionState.Kind.Error);
    assert.ok(state.message);
  });
  test("should handle transport errors", async () => {
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const startPromise = connection.start({});
    transport.setConnectionState({
      state: McpConnectionState.Kind.Error,
      message: "Test error message"
    });
    const state = await startPromise;
    assert.strictEqual(state.state, McpConnectionState.Kind.Error);
    assert.strictEqual(state.message, "Test error message");
  });
  test("should stop and set state to Stopped", async () => {
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const startPromise = connection.start({});
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    await startPromise;
    const stopPromise = connection.stop();
    await stopPromise;
    assert.strictEqual(connection.state.get().state, McpConnectionState.Kind.Stopped);
  });
  test("should not restart if already starting", async () => {
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const startPromise1 = connection.start({});
    const startPromise2 = connection.start({});
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    const state1 = await startPromise1;
    const state2 = await startPromise2;
    assert.strictEqual(state1.state, McpConnectionState.Kind.Running);
    assert.strictEqual(state2.state, McpConnectionState.Kind.Running);
    transport.simulateInitialized();
    assert.ok(await waitForHandler(connection));
    connection.dispose();
  });
  test("should clean up when disposed", async () => {
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    const startPromise = connection.start({});
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    await startPromise;
    connection.dispose();
    assert.strictEqual(connection.state.get().state, McpConnectionState.Kind.Stopped);
  });
  test("should log transport messages", async () => {
    const loggedMessages = [];
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      {
        onDidChangeLogLevel: Event.None,
        getLevel: () => LogLevel.Debug,
        info: (message) => {
          loggedMessages.push(message);
        },
        error: () => {
        },
        dispose: () => {
        }
      },
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const startPromise = connection.start({});
    transport.simulateLog("Test log message");
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    await startPromise;
    assert.ok(loggedMessages.some((msg) => msg === "Test log message"));
    connection.dispose();
    await timeout(10);
  });
  test("should emit a sandbox filesystem block for read-only errors with backtick paths", async () => {
    const sandboxedDefinition = {
      ...serverDefinition,
      sandboxEnabled: true
    };
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      sandboxedDefinition,
      delegate,
      sandboxedDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const message = "error: failed to open file `/test-for-sandbox/.git`: Read-only file system (os error 30)";
    const sandboxBlock = Event.toPromise(connection.onPotentialSandboxBlock);
    const startPromise = connection.start({});
    transport.simulateLog(message);
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    assert.deepStrictEqual(await sandboxBlock, {
      kind: "filesystem",
      message,
      path: "/test-for-sandbox/.git"
    });
    await startPromise;
    connection.dispose();
    await timeout(10);
  });
  test("should emit a sandbox filesystem block for read-only errors with double-quoted paths", async () => {
    const sandboxedDefinition = {
      ...serverDefinition,
      sandboxEnabled: true
    };
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      sandboxedDefinition,
      delegate,
      sandboxedDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const message = "error: failed to open file `/test-for-sandbox/.testfile`: Read-only file system (os error 30)";
    const sandboxBlock = Event.toPromise(connection.onPotentialSandboxBlock);
    const startPromise = connection.start({});
    transport.simulateLog(message);
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    assert.deepStrictEqual(await sandboxBlock, {
      kind: "filesystem",
      message,
      path: "/test-for-sandbox/.testfile"
    });
    await startPromise;
    connection.dispose();
    await timeout(10);
  });
  test("should emit a sandbox filesystem block for read-only at-path errors with double-quoted paths", async () => {
    const sandboxedDefinition = {
      ...serverDefinition,
      sandboxEnabled: true
    };
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      sandboxedDefinition,
      delegate,
      sandboxedDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const message = 'error: Read-only file system (os error 30) at path "/test-for-sandbox/.testfile"';
    const sandboxBlock = Event.toPromise(connection.onPotentialSandboxBlock);
    const startPromise = connection.start({});
    transport.simulateLog(message);
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    assert.deepStrictEqual(await sandboxBlock, {
      kind: "filesystem",
      message,
      path: "/test-for-sandbox/.testfile"
    });
    await startPromise;
    connection.dispose();
    await timeout(10);
  });
  test("should emit a sandbox network block with the denied host", async () => {
    const sandboxedDefinition = {
      ...serverDefinition,
      sandboxEnabled: true
    };
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      sandboxedDefinition,
      delegate,
      sandboxedDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const sandboxBlock = Event.toPromise(connection.onPotentialSandboxBlock);
    const startPromise = connection.start({});
    transport.simulateLog("No matching config rule, denying: api.example.com:443.");
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    assert.deepStrictEqual(await sandboxBlock, {
      kind: "network",
      message: "No matching config rule, denying: api.example.com:443.",
      host: "api.example.com"
    });
    await startPromise;
    connection.dispose();
    await timeout(10);
  });
  test("should correctly handle transitions to and from error state", async () => {
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    const startPromise = connection.start({});
    const errorState = {
      state: McpConnectionState.Kind.Error,
      message: "Temporary error"
    };
    transport.setConnectionState(errorState);
    let state = await startPromise;
    assert.equal(state, errorState);
    transport.setConnectionState({ state: McpConnectionState.Kind.Stopped });
    const startPromise2 = connection.start({});
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    state = await startPromise2;
    assert.deepStrictEqual(state, { state: McpConnectionState.Kind.Running });
    connection.dispose();
    await timeout(10);
  });
  test("should handle multiple start/stop cycles", async () => {
    const connection = instantiationService.createInstance(
      McpServerConnection,
      collection,
      serverDefinition,
      delegate,
      serverDefinition.launch,
      new NullLogger(),
      false,
      store.add(new McpTaskManager())
    );
    store.add(connection);
    let startPromise = connection.start({});
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    await startPromise;
    await connection.stop();
    assert.deepStrictEqual(connection.state.get(), { state: McpConnectionState.Kind.Stopped });
    startPromise = connection.start({});
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    await startPromise;
    assert.deepStrictEqual(connection.state.get(), { state: McpConnectionState.Kind.Running });
    await connection.stop();
    assert.deepStrictEqual(connection.state.get(), { state: McpConnectionState.Kind.Stopped });
    connection.dispose();
    await timeout(10);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BTZXJ2ZXJDb25uZWN0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgdXBjYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dnZXIsIElMb2dnZXJTZXJ2aWNlLCBMb2dMZXZlbCwgTnVsbExvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IFRlc3RMb2dnZXJTZXJ2aWNlLCBUZXN0UHJvZHVjdFNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTWNwSG9zdERlbGVnYXRlLCBJTWNwTWVzc2FnZVRyYW5zcG9ydCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlckNvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vbWNwU2VydmVyQ29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTZXJ2ZXJMYXVuY2gsIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUsIE1jcFNlcnZlclRydXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RNY3BNZXNzYWdlVHJhbnNwb3J0IH0gZnJvbSAnLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWNwVGFza01hbmFnZXIgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwVGFza01hbmFnZXIuanMnO1xuXG5jbGFzcyBUZXN0TWNwSG9zdERlbGVnYXRlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BIb3N0RGVsZWdhdGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc3BvcnQ6IFRlc3RNY3BNZXNzYWdlVHJhbnNwb3J0O1xuXHRwcml2YXRlIF9jYW5TdGFydFZhbHVlID0gdHJ1ZTtcblxuXHRwcmlvcml0eSA9IDA7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90cmFuc3BvcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGVzdE1jcE1lc3NhZ2VUcmFuc3BvcnQoKSk7XG5cdH1cblxuXHRzdWJzdGl0dXRlVmFyaWFibGVzKHNlcnZlckRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24sIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoKTogUHJvbWlzZTxNY3BTZXJ2ZXJMYXVuY2g+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGxhdW5jaCk7XG5cdH1cblxuXHRjYW5TdGFydCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuU3RhcnRWYWx1ZTtcblx0fVxuXG5cdHN0YXJ0KCk6IElNY3BNZXNzYWdlVHJhbnNwb3J0IHtcblx0XHRpZiAoIXRoaXMuX2NhblN0YXJ0VmFsdWUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHN0YXJ0IHNlcnZlcicpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNwb3J0O1xuXHR9XG5cblx0Z2V0VHJhbnNwb3J0KCk6IFRlc3RNY3BNZXNzYWdlVHJhbnNwb3J0IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNwb3J0O1xuXHR9XG5cblx0c2V0Q2FuU3RhcnQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5TdGFydFZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHR3YWl0Rm9ySW5pdGlhbFByb3ZpZGVyUHJvbWlzZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBNQ1AgLSBTZXJ2ZXJDb25uZWN0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgZGVsZWdhdGU6IFRlc3RNY3BIb3N0RGVsZWdhdGU7XG5cdGxldCB0cmFuc3BvcnQ6IFRlc3RNY3BNZXNzYWdlVHJhbnNwb3J0O1xuXHRsZXQgY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb247XG5cdGxldCBzZXJ2ZXJEZWZpbml0aW9uOiBNY3BTZXJ2ZXJEZWZpbml0aW9uO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkZWxlZ2F0ZSA9IHN0b3JlLmFkZChuZXcgVGVzdE1jcEhvc3REZWxlZ2F0ZSgpKTtcblx0XHR0cmFuc3BvcnQgPSBkZWxlZ2F0ZS5nZXRUcmFuc3BvcnQoKTtcblxuXHRcdC8vIFNldHVwIHRlc3Qgc2VydmljZXNcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nZ2VyU2VydmljZSwgc3RvcmUuYWRkKG5ldyBUZXN0TG9nZ2VyU2VydmljZSgpKV0sXG5cdFx0XHRbSU91dHB1dFNlcnZpY2UsIHVwY2FzdCh7IHNob3dDaGFubmVsOiAoKSA9PiB7IH0gfSldLFxuXHRcdFx0W0lTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSldLFxuXHRcdFx0W0lQcm9kdWN0U2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlXSxcblx0XHQpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRlc3QgY29sbGVjdGlvblxuXHRcdGNvbGxlY3Rpb24gPSB7XG5cdFx0XHRpZDogJ3Rlc3QtY29sbGVjdGlvbicsXG5cdFx0XHRsYWJlbDogJ1Rlc3QgQ29sbGVjdGlvbicsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IG51bGwsXG5cdFx0XHRzZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdzZXJ2ZXJEZWZzJywgW10pLFxuXHRcdFx0dHJ1c3RCZWhhdmlvcjogTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTixcblx0XHRcdGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0b3JkZXI6IDAsXG5cdFx0fTtcblxuXHRcdC8vIENyZWF0ZSBzZXJ2ZXIgZGVmaW5pdGlvblxuXHRcdHNlcnZlckRlZmluaXRpb24gPSB7XG5cdFx0XHRpZDogJ3Rlc3Qtc2VydmVyJyxcblx0XHRcdGxhYmVsOiAnVGVzdCBTZXJ2ZXInLFxuXHRcdFx0Y2FjaGVOb25jZTogJ2EnLFxuXHRcdFx0bGF1bmNoOiB7XG5cdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdFx0XHRcdGNvbW1hbmQ6ICd0ZXN0LWNvbW1hbmQnLFxuXHRcdFx0XHRhcmdzOiBbXSxcblx0XHRcdFx0ZW52OiB7fSxcblx0XHRcdFx0ZW52RmlsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRjd2Q6ICcvdGVzdCcsXG5cdFx0XHRcdHNhbmRib3g6IHVuZGVmaW5lZFxuXHRcdFx0fVxuXHRcdH07XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHdhaXRGb3JIYW5kbGVyKGNueDogTWNwU2VydmVyQ29ubmVjdGlvbikge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjbnguaGFuZGxlci5nZXQoKTtcblx0XHRpZiAoaGFuZGxlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShoYW5kbGVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBoYW5kbGVyID0gY254LmhhbmRsZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoaGFuZGxlcikge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoaGFuZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnc2hvdWxkIHN0YXJ0IGFuZCBzZXQgc3RhdGUgdG8gUnVubmluZyB3aGVuIHRyYW5zcG9ydCBzdWNjZWVkcycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBDcmVhdGUgc2VydmVyIGNvbm5lY3Rpb25cblx0XHRjb25zdCBjb25uZWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNY3BTZXJ2ZXJDb25uZWN0aW9uLFxuXHRcdFx0Y29sbGVjdGlvbixcblx0XHRcdHNlcnZlckRlZmluaXRpb24sXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHNlcnZlckRlZmluaXRpb24ubGF1bmNoLFxuXHRcdFx0bmV3IE51bGxMb2dnZXIoKSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBNY3BUYXNrTWFuYWdlcigpKSxcblx0XHQpO1xuXHRcdHN0b3JlLmFkZChjb25uZWN0aW9uKTtcblxuXHRcdC8vIFN0YXJ0IHRoZSBjb25uZWN0aW9uXG5cdFx0Y29uc3Qgc3RhcnRQcm9taXNlID0gY29ubmVjdGlvbi5zdGFydCh7fSk7XG5cblx0XHQvLyBTaW11bGF0ZSBzdWNjZXNzZnVsIGNvbm5lY3Rpb25cblx0XHR0cmFuc3BvcnQuc2V0Q29ubmVjdGlvblN0YXRlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IHN0YXJ0UHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdGUsIE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcpO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlSW5pdGlhbGl6ZWQoKTtcblx0XHRhc3NlcnQub2soYXdhaXQgd2FpdEZvckhhbmRsZXIoY29ubmVjdGlvbikpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVycm9ycyBkdXJpbmcgc3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgZGVsZWdhdGUgdG8gZmFpbCBvbiBzdGFydFxuXHRcdGRlbGVnYXRlLnNldENhblN0YXJ0KGZhbHNlKTtcblxuXHRcdC8vIENyZWF0ZSBzZXJ2ZXIgY29ubmVjdGlvblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE1jcFNlcnZlckNvbm5lY3Rpb24sXG5cdFx0XHRjb2xsZWN0aW9uLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbixcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbi5sYXVuY2gsXG5cdFx0XHRuZXcgTnVsbExvZ2dlcigpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRzdG9yZS5hZGQobmV3IE1jcFRhc2tNYW5hZ2VyKCkpLFxuXHRcdCk7XG5cdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24pO1xuXG5cdFx0Ly8gU3RhcnQgdGhlIGNvbm5lY3Rpb25cblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGNvbm5lY3Rpb24uc3RhcnQoe30pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXRlLCBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcik7XG5cdFx0YXNzZXJ0Lm9rKHN0YXRlLm1lc3NhZ2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIHRyYW5zcG9ydCBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIHNlcnZlciBjb25uZWN0aW9uXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWNwU2VydmVyQ29ubmVjdGlvbixcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRzZXJ2ZXJEZWZpbml0aW9uLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRzZXJ2ZXJEZWZpbml0aW9uLmxhdW5jaCxcblx0XHRcdG5ldyBOdWxsTG9nZ2VyKCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHN0b3JlLmFkZChuZXcgTWNwVGFza01hbmFnZXIoKSksXG5cdFx0KTtcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbik7XG5cblx0XHQvLyBTdGFydCB0aGUgY29ubmVjdGlvblxuXHRcdGNvbnN0IHN0YXJ0UHJvbWlzZSA9IGNvbm5lY3Rpb24uc3RhcnQoe30pO1xuXG5cdFx0Ly8gU2ltdWxhdGUgZXJyb3IgaW4gdHJhbnNwb3J0XG5cdFx0dHJhbnNwb3J0LnNldENvbm5lY3Rpb25TdGF0ZSh7XG5cdFx0XHRzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IsXG5cdFx0XHRtZXNzYWdlOiAnVGVzdCBlcnJvciBtZXNzYWdlJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBzdGFydFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnN0YXRlLCBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm1lc3NhZ2UsICdUZXN0IGVycm9yIG1lc3NhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHN0b3AgYW5kIHNldCBzdGF0ZSB0byBTdG9wcGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIENyZWF0ZSBzZXJ2ZXIgY29ubmVjdGlvblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE1jcFNlcnZlckNvbm5lY3Rpb24sXG5cdFx0XHRjb2xsZWN0aW9uLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbixcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbi5sYXVuY2gsXG5cdFx0XHRuZXcgTnVsbExvZ2dlcigpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRzdG9yZS5hZGQobmV3IE1jcFRhc2tNYW5hZ2VyKCkpLFxuXHRcdCk7XG5cdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24pO1xuXG5cdFx0Ly8gU3RhcnQgdGhlIGNvbm5lY3Rpb25cblx0XHRjb25zdCBzdGFydFByb21pc2UgPSBjb25uZWN0aW9uLnN0YXJ0KHt9KTtcblx0XHR0cmFuc3BvcnQuc2V0Q29ubmVjdGlvblN0YXRlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cdFx0YXdhaXQgc3RhcnRQcm9taXNlO1xuXG5cdFx0Ly8gU3RvcCB0aGUgY29ubmVjdGlvblxuXHRcdGNvbnN0IHN0b3BQcm9taXNlID0gY29ubmVjdGlvbi5zdG9wKCk7XG5cdFx0YXdhaXQgc3RvcFByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5zdGF0ZS5nZXQoKS5zdGF0ZSwgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgcmVzdGFydCBpZiBhbHJlYWR5IHN0YXJ0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIENyZWF0ZSBzZXJ2ZXIgY29ubmVjdGlvblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE1jcFNlcnZlckNvbm5lY3Rpb24sXG5cdFx0XHRjb2xsZWN0aW9uLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbixcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbi5sYXVuY2gsXG5cdFx0XHRuZXcgTnVsbExvZ2dlcigpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRzdG9yZS5hZGQobmV3IE1jcFRhc2tNYW5hZ2VyKCkpLFxuXHRcdCk7XG5cdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24pO1xuXG5cdFx0Ly8gU3RhcnQgdGhlIGNvbm5lY3Rpb25cblx0XHRjb25zdCBzdGFydFByb21pc2UxID0gY29ubmVjdGlvbi5zdGFydCh7fSk7XG5cblx0XHQvLyBUcnkgdG8gc3RhcnQgYWdhaW4gd2hpbGUgc3RhcnRpbmdcblx0XHRjb25zdCBzdGFydFByb21pc2UyID0gY29ubmVjdGlvbi5zdGFydCh7fSk7XG5cblx0XHQvLyBTaW11bGF0ZSBzdWNjZXNzZnVsIGNvbm5lY3Rpb25cblx0XHR0cmFuc3BvcnQuc2V0Q29ubmVjdGlvblN0YXRlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cblx0XHRjb25zdCBzdGF0ZTEgPSBhd2FpdCBzdGFydFByb21pc2UxO1xuXHRcdGNvbnN0IHN0YXRlMiA9IGF3YWl0IHN0YXJ0UHJvbWlzZTI7XG5cblx0XHQvLyBCb3RoIHByb21pc2VzIHNob3VsZCByZXNvbHZlIHRvIHRoZSBzYW1lIHN0YXRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlMS5zdGF0ZSwgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlMi5zdGF0ZSwgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyk7XG5cblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVJbml0aWFsaXplZCgpO1xuXHRcdGFzc2VydC5vayhhd2FpdCB3YWl0Rm9ySGFuZGxlcihjb25uZWN0aW9uKSk7XG5cblx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGNsZWFuIHVwIHdoZW4gZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIHNlcnZlciBjb25uZWN0aW9uXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWNwU2VydmVyQ29ubmVjdGlvbixcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRzZXJ2ZXJEZWZpbml0aW9uLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRzZXJ2ZXJEZWZpbml0aW9uLmxhdW5jaCxcblx0XHRcdG5ldyBOdWxsTG9nZ2VyKCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHN0b3JlLmFkZChuZXcgTWNwVGFza01hbmFnZXIoKSksXG5cdFx0KTtcblxuXHRcdC8vIFN0YXJ0IHRoZSBjb25uZWN0aW9uXG5cdFx0Y29uc3Qgc3RhcnRQcm9taXNlID0gY29ubmVjdGlvbi5zdGFydCh7fSk7XG5cdFx0dHJhbnNwb3J0LnNldENvbm5lY3Rpb25TdGF0ZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pO1xuXHRcdGF3YWl0IHN0YXJ0UHJvbWlzZTtcblxuXHRcdC8vIERpc3Bvc2UgdGhlIGNvbm5lY3Rpb25cblx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLnN0YXRlLmdldCgpLnN0YXRlLCBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGxvZyB0cmFuc3BvcnQgbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVHJhY2sgbG9nZ2VkIG1lc3NhZ2VzXG5cdFx0Y29uc3QgbG9nZ2VkTWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHQvLyBDcmVhdGUgc2VydmVyIGNvbm5lY3Rpb25cblx0XHRjb25zdCBjb25uZWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNY3BTZXJ2ZXJDb25uZWN0aW9uLFxuXHRcdFx0Y29sbGVjdGlvbixcblx0XHRcdHNlcnZlckRlZmluaXRpb24sXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHNlcnZlckRlZmluaXRpb24ubGF1bmNoLFxuXHRcdFx0e1xuXHRcdFx0XHRvbkRpZENoYW5nZUxvZ0xldmVsOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRnZXRMZXZlbDogKCkgPT4gTG9nTGV2ZWwuRGVidWcsXG5cdFx0XHRcdGluZm86IChtZXNzYWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRsb2dnZWRNZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlcnJvcjogKCkgPT4geyB9LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHRcdH0gYXMgUGFydGlhbDxJTG9nZ2VyPiBhcyBJTG9nZ2VyLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRzdG9yZS5hZGQobmV3IE1jcFRhc2tNYW5hZ2VyKCkpLFxuXHRcdCk7XG5cdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24pO1xuXG5cdFx0Ly8gU3RhcnQgdGhlIGNvbm5lY3Rpb25cblx0XHRjb25zdCBzdGFydFByb21pc2UgPSBjb25uZWN0aW9uLnN0YXJ0KHt9KTtcblxuXHRcdC8vIFNpbXVsYXRlIGxvZyBtZXNzYWdlIGZyb20gdHJhbnNwb3J0XG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTG9nKCdUZXN0IGxvZyBtZXNzYWdlJyk7XG5cblx0XHQvLyBTZXQgY29ubmVjdGlvbiB0byBydW5uaW5nXG5cdFx0dHJhbnNwb3J0LnNldENvbm5lY3Rpb25TdGF0ZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pO1xuXHRcdGF3YWl0IHN0YXJ0UHJvbWlzZTtcblxuXHRcdC8vIENoZWNrIHRoYXQgdGhlIG1lc3NhZ2Ugd2FzIGxvZ2dlZFxuXHRcdGFzc2VydC5vayhsb2dnZWRNZXNzYWdlcy5zb21lKG1zZyA9PiBtc2cgPT09ICdUZXN0IGxvZyBtZXNzYWdlJykpO1xuXG5cdFx0Y29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBlbWl0IGEgc2FuZGJveCBmaWxlc3lzdGVtIGJsb2NrIGZvciByZWFkLW9ubHkgZXJyb3JzIHdpdGggYmFja3RpY2sgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2FuZGJveGVkRGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiA9IHtcblx0XHRcdC4uLnNlcnZlckRlZmluaXRpb24sXG5cdFx0XHRzYW5kYm94RW5hYmxlZDogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWNwU2VydmVyQ29ubmVjdGlvbixcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRzYW5kYm94ZWREZWZpbml0aW9uLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRzYW5kYm94ZWREZWZpbml0aW9uLmxhdW5jaCxcblx0XHRcdG5ldyBOdWxsTG9nZ2VyKCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHN0b3JlLmFkZChuZXcgTWNwVGFza01hbmFnZXIoKSksXG5cdFx0KTtcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbik7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gJ2Vycm9yOiBmYWlsZWQgdG8gb3BlbiBmaWxlIGAvdGVzdC1mb3Itc2FuZGJveC8uZ2l0YDogUmVhZC1vbmx5IGZpbGUgc3lzdGVtIChvcyBlcnJvciAzMCknO1xuXHRcdGNvbnN0IHNhbmRib3hCbG9jayA9IEV2ZW50LnRvUHJvbWlzZShjb25uZWN0aW9uLm9uUG90ZW50aWFsU2FuZGJveEJsb2NrKTtcblx0XHRjb25zdCBzdGFydFByb21pc2UgPSBjb25uZWN0aW9uLnN0YXJ0KHt9KTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUxvZyhtZXNzYWdlKTtcblx0XHR0cmFuc3BvcnQuc2V0Q29ubmVjdGlvblN0YXRlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNhbmRib3hCbG9jaywge1xuXHRcdFx0a2luZDogJ2ZpbGVzeXN0ZW0nLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHBhdGg6ICcvdGVzdC1mb3Itc2FuZGJveC8uZ2l0Jyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHN0YXJ0UHJvbWlzZTtcblxuXHRcdGNvbm5lY3Rpb24uZGlzcG9zZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZW1pdCBhIHNhbmRib3ggZmlsZXN5c3RlbSBibG9jayBmb3IgcmVhZC1vbmx5IGVycm9ycyB3aXRoIGRvdWJsZS1xdW90ZWQgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2FuZGJveGVkRGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiA9IHtcblx0XHRcdC4uLnNlcnZlckRlZmluaXRpb24sXG5cdFx0XHRzYW5kYm94RW5hYmxlZDogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWNwU2VydmVyQ29ubmVjdGlvbixcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRzYW5kYm94ZWREZWZpbml0aW9uLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRzYW5kYm94ZWREZWZpbml0aW9uLmxhdW5jaCxcblx0XHRcdG5ldyBOdWxsTG9nZ2VyKCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHN0b3JlLmFkZChuZXcgTWNwVGFza01hbmFnZXIoKSksXG5cdFx0KTtcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbik7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gJ2Vycm9yOiBmYWlsZWQgdG8gb3BlbiBmaWxlIGAvdGVzdC1mb3Itc2FuZGJveC8udGVzdGZpbGVgOiBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0gKG9zIGVycm9yIDMwKSc7XG5cdFx0Y29uc3Qgc2FuZGJveEJsb2NrID0gRXZlbnQudG9Qcm9taXNlKGNvbm5lY3Rpb24ub25Qb3RlbnRpYWxTYW5kYm94QmxvY2spO1xuXHRcdGNvbnN0IHN0YXJ0UHJvbWlzZSA9IGNvbm5lY3Rpb24uc3RhcnQoe30pO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTG9nKG1lc3NhZ2UpO1xuXHRcdHRyYW5zcG9ydC5zZXRDb25uZWN0aW9uU3RhdGUoeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2FuZGJveEJsb2NrLCB7XG5cdFx0XHRraW5kOiAnZmlsZXN5c3RlbScsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0cGF0aDogJy90ZXN0LWZvci1zYW5kYm94Ly50ZXN0ZmlsZScsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBzdGFydFByb21pc2U7XG5cblx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGVtaXQgYSBzYW5kYm94IGZpbGVzeXN0ZW0gYmxvY2sgZm9yIHJlYWQtb25seSBhdC1wYXRoIGVycm9ycyB3aXRoIGRvdWJsZS1xdW90ZWQgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2FuZGJveGVkRGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiA9IHtcblx0XHRcdC4uLnNlcnZlckRlZmluaXRpb24sXG5cdFx0XHRzYW5kYm94RW5hYmxlZDogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWNwU2VydmVyQ29ubmVjdGlvbixcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRzYW5kYm94ZWREZWZpbml0aW9uLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRzYW5kYm94ZWREZWZpbml0aW9uLmxhdW5jaCxcblx0XHRcdG5ldyBOdWxsTG9nZ2VyKCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHN0b3JlLmFkZChuZXcgTWNwVGFza01hbmFnZXIoKSksXG5cdFx0KTtcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbik7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gJ2Vycm9yOiBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0gKG9zIGVycm9yIDMwKSBhdCBwYXRoIFwiL3Rlc3QtZm9yLXNhbmRib3gvLnRlc3RmaWxlXCInO1xuXHRcdGNvbnN0IHNhbmRib3hCbG9jayA9IEV2ZW50LnRvUHJvbWlzZShjb25uZWN0aW9uLm9uUG90ZW50aWFsU2FuZGJveEJsb2NrKTtcblx0XHRjb25zdCBzdGFydFByb21pc2UgPSBjb25uZWN0aW9uLnN0YXJ0KHt9KTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZUxvZyhtZXNzYWdlKTtcblx0XHR0cmFuc3BvcnQuc2V0Q29ubmVjdGlvblN0YXRlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNhbmRib3hCbG9jaywge1xuXHRcdFx0a2luZDogJ2ZpbGVzeXN0ZW0nLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHBhdGg6ICcvdGVzdC1mb3Itc2FuZGJveC8udGVzdGZpbGUnLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgc3RhcnRQcm9taXNlO1xuXG5cdFx0Y29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBlbWl0IGEgc2FuZGJveCBuZXR3b3JrIGJsb2NrIHdpdGggdGhlIGRlbmllZCBob3N0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNhbmRib3hlZERlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24gPSB7XG5cdFx0XHQuLi5zZXJ2ZXJEZWZpbml0aW9uLFxuXHRcdFx0c2FuZGJveEVuYWJsZWQ6IHRydWUsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE1jcFNlcnZlckNvbm5lY3Rpb24sXG5cdFx0XHRjb2xsZWN0aW9uLFxuXHRcdFx0c2FuZGJveGVkRGVmaW5pdGlvbixcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0c2FuZGJveGVkRGVmaW5pdGlvbi5sYXVuY2gsXG5cdFx0XHRuZXcgTnVsbExvZ2dlcigpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRzdG9yZS5hZGQobmV3IE1jcFRhc2tNYW5hZ2VyKCkpLFxuXHRcdCk7XG5cdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24pO1xuXG5cdFx0Y29uc3Qgc2FuZGJveEJsb2NrID0gRXZlbnQudG9Qcm9taXNlKGNvbm5lY3Rpb24ub25Qb3RlbnRpYWxTYW5kYm94QmxvY2spO1xuXHRcdGNvbnN0IHN0YXJ0UHJvbWlzZSA9IGNvbm5lY3Rpb24uc3RhcnQoe30pO1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlTG9nKCdObyBtYXRjaGluZyBjb25maWcgcnVsZSwgZGVueWluZzogYXBpLmV4YW1wbGUuY29tOjQ0My4nKTtcblx0XHR0cmFuc3BvcnQuc2V0Q29ubmVjdGlvblN0YXRlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNhbmRib3hCbG9jaywge1xuXHRcdFx0a2luZDogJ25ldHdvcmsnLFxuXHRcdFx0bWVzc2FnZTogJ05vIG1hdGNoaW5nIGNvbmZpZyBydWxlLCBkZW55aW5nOiBhcGkuZXhhbXBsZS5jb206NDQzLicsXG5cdFx0XHRob3N0OiAnYXBpLmV4YW1wbGUuY29tJyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHN0YXJ0UHJvbWlzZTtcblxuXHRcdGNvbm5lY3Rpb24uZGlzcG9zZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgY29ycmVjdGx5IGhhbmRsZSB0cmFuc2l0aW9ucyB0byBhbmQgZnJvbSBlcnJvciBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBDcmVhdGUgc2VydmVyIGNvbm5lY3Rpb25cblx0XHRjb25zdCBjb25uZWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNY3BTZXJ2ZXJDb25uZWN0aW9uLFxuXHRcdFx0Y29sbGVjdGlvbixcblx0XHRcdHNlcnZlckRlZmluaXRpb24sXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHNlcnZlckRlZmluaXRpb24ubGF1bmNoLFxuXHRcdFx0bmV3IE51bGxMb2dnZXIoKSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBNY3BUYXNrTWFuYWdlcigpKSxcblx0XHQpO1xuXHRcdHN0b3JlLmFkZChjb25uZWN0aW9uKTtcblxuXHRcdC8vIFN0YXJ0IHRoZSBjb25uZWN0aW9uXG5cdFx0Y29uc3Qgc3RhcnRQcm9taXNlID0gY29ubmVjdGlvbi5zdGFydCh7fSk7XG5cblx0XHQvLyBUcmFuc2l0aW9uIHRvIGVycm9yIHN0YXRlXG5cdFx0Y29uc3QgZXJyb3JTdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlID0ge1xuXHRcdFx0c3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yLFxuXHRcdFx0bWVzc2FnZTogJ1RlbXBvcmFyeSBlcnJvcidcblx0XHR9O1xuXHRcdHRyYW5zcG9ydC5zZXRDb25uZWN0aW9uU3RhdGUoZXJyb3JTdGF0ZSk7XG5cblx0XHRsZXQgc3RhdGUgPSBhd2FpdCBzdGFydFByb21pc2U7XG5cdFx0YXNzZXJ0LmVxdWFsKHN0YXRlLCBlcnJvclN0YXRlKTtcblxuXG5cdFx0dHJhbnNwb3J0LnNldENvbm5lY3Rpb25TdGF0ZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkIH0pO1xuXG5cdFx0Ly8gVHJhbnNpdGlvbiBiYWNrIHRvIHJ1bm5pbmcgc3RhdGVcblx0XHRjb25zdCBzdGFydFByb21pc2UyID0gY29ubmVjdGlvbi5zdGFydCh7fSk7XG5cdFx0dHJhbnNwb3J0LnNldENvbm5lY3Rpb25TdGF0ZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pO1xuXHRcdHN0YXRlID0gYXdhaXQgc3RhcnRQcm9taXNlMjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pO1xuXG5cdFx0Y29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgc3RhcnQvc3RvcCBjeWNsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIHNlcnZlciBjb25uZWN0aW9uXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWNwU2VydmVyQ29ubmVjdGlvbixcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHRzZXJ2ZXJEZWZpbml0aW9uLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRzZXJ2ZXJEZWZpbml0aW9uLmxhdW5jaCxcblx0XHRcdG5ldyBOdWxsTG9nZ2VyKCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHN0b3JlLmFkZChuZXcgTWNwVGFza01hbmFnZXIoKSksXG5cdFx0KTtcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbik7XG5cblx0XHQvLyBGaXJzdCBjeWNsZVxuXHRcdGxldCBzdGFydFByb21pc2UgPSBjb25uZWN0aW9uLnN0YXJ0KHt9KTtcblx0XHR0cmFuc3BvcnQuc2V0Q29ubmVjdGlvblN0YXRlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cdFx0YXdhaXQgc3RhcnRQcm9taXNlO1xuXG5cdFx0YXdhaXQgY29ubmVjdGlvbi5zdG9wKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLnN0YXRlLmdldCgpLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkIH0pO1xuXG5cdFx0Ly8gU2Vjb25kIGN5Y2xlXG5cdFx0c3RhcnRQcm9taXNlID0gY29ubmVjdGlvbi5zdGFydCh7fSk7XG5cdFx0dHJhbnNwb3J0LnNldENvbm5lY3Rpb25TdGF0ZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pO1xuXHRcdGF3YWl0IHN0YXJ0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5zdGF0ZS5nZXQoKSwgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyB9KTtcblxuXHRcdGF3YWl0IGNvbm5lY3Rpb24uc3RvcCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLnN0YXRlLmdldCgpLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkIH0pO1xuXG5cdFx0Y29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQWtCLGdCQUFnQixVQUFVLGtCQUFrQjtBQUM5RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUIsb0JBQW9CLDBCQUEwQjtBQUUxRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFrQyxvQkFBMEQsd0JBQXdCLHNCQUFzQjtBQUMxSSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSw0QkFBNEIsV0FBdUM7QUFBQSxFQU14RSxjQUFjO0FBQ2IsVUFBTTtBQUxQLFNBQVEsaUJBQWlCO0FBRXpCLG9CQUFXO0FBSVYsU0FBSyxhQUFhLEtBQUssVUFBVSxJQUFJLHdCQUF3QixDQUFDO0FBQUEsRUFDL0Q7QUFBQSxFQUVBLG9CQUFvQixrQkFBdUMsUUFBbUQ7QUFDN0csV0FBTyxRQUFRLFFBQVEsTUFBTTtBQUFBLEVBQzlCO0FBQUEsRUFFQSxXQUFvQjtBQUNuQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxRQUE4QjtBQUM3QixRQUFJLENBQUMsS0FBSyxnQkFBZ0I7QUFDekIsWUFB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
