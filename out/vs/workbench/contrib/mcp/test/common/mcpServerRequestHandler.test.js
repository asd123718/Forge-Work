import * as assert from "assert";
import * as sinon from "sinon";
import { upcast } from "../../../../../base/common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILoggerService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { TestLoggerService, TestProductService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { McpServerRequestHandler, McpTask } from "../../common/mcpServerRequestHandler.js";
import { McpConnectionState } from "../../common/mcpTypes.js";
import { MCP } from "../../common/modelContextProtocol.js";
import { TestMcpMessageTransport } from "./mcpRegistryTypes.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { McpTaskManager } from "../../common/mcpTaskManager.js";
import { upcastPartial } from "../../../../../base/test/common/mock.js";
class TestMcpHostDelegate extends Disposable {
  constructor() {
    super();
    this.priority = 0;
    this._transport = this._register(new TestMcpMessageTransport());
  }
  substituteVariables(serverDefinition, launch) {
    return Promise.resolve(launch);
  }
  canStart() {
    return true;
  }
  start() {
    return this._transport;
  }
  getTransport() {
    return this._transport;
  }
  waitForInitialProviderPromises() {
    return Promise.resolve();
  }
}
suite("Workbench - MCP - ServerRequestHandler", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let delegate;
  let transport;
  let handler;
  let cts;
  setup(async () => {
    delegate = store.add(new TestMcpHostDelegate());
    transport = delegate.getTransport();
    cts = store.add(new CancellationTokenSource());
    const services = new ServiceCollection(
      [ILoggerService, store.add(new TestLoggerService())],
      [IOutputService, upcast({ showChannel: () => {
      } })],
      [IStorageService, store.add(new TestStorageService())],
      [IProductService, TestProductService]
    );
    instantiationService = store.add(new TestInstantiationService(services));
    transport.setConnectionState({ state: McpConnectionState.Kind.Running });
    const logger = store.add(instantiationService.get(ILoggerService).createLogger("mcpServerTest", { hidden: true, name: "MCP Test" }));
    const handlerPromise = McpServerRequestHandler.create(instantiationService, { logger, launch: transport, taskManager: store.add(new McpTaskManager()) }, cts.token);
    handler = await handlerPromise;
    store.add(handler);
  });
  test("should send and receive JSON-RPC requests", async () => {
    const requestPromise = handler.listResources();
    const sentMessages = transport.getSentMessages();
    assert.strictEqual(sentMessages.length, 3);
    const listResourcesRequest = sentMessages[2];
    assert.strictEqual(listResourcesRequest.method, "resources/list");
    assert.strictEqual(listResourcesRequest.jsonrpc, MCP.JSONRPC_VERSION);
    assert.ok(typeof listResourcesRequest.id === "number");
    transport.simulateReceiveMessage({
      jsonrpc: MCP.JSONRPC_VERSION,
      id: listResourcesRequest.id,
      result: {
        resources: [
          { uri: "resource1", type: "text/plain", name: "Test Resource 1" },
          { uri: "resource2", type: "text/plain", name: "Test Resource 2" }
        ]
      }
    });
    const resources = await requestPromise;
    assert.strictEqual(resources.length, 2);
    assert.strictEqual(resources[0].uri, "resource1");
    assert.strictEqual(resources[1].name, "Test Resource 2");
  });
  test("should handle paginated requests", async () => {
    const requestPromise = handler.listResources();
    const sentMessages = transport.getSentMessages();
    const listResourcesRequest = sentMessages[2];
    transport.simulateReceiveMessage({
      jsonrpc: MCP.JSONRPC_VERSION,
      id: listResourcesRequest.id,
      result: {
        resources: [
          { uri: "resource1", type: "text/plain", name: "Test Resource 1" }
        ],
        nextCursor: "page2"
      }
    });
    transport.clearSentMessages();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sentMessages2 = transport.getSentMessages();
    assert.strictEqual(sentMessages2.length, 1);
    const listResourcesRequest2 = sentMessages2[0];
    assert.strictEqual(listResourcesRequest2.method, "resources/list");
    assert.deepStrictEqual(listResourcesRequest2.params, { cursor: "page2" });
    transport.simulateReceiveMessage({
      jsonrpc: MCP.JSONRPC_VERSION,
      id: listResourcesRequest2.id,
      result: {
        resources: [
          { uri: "resource2", type: "text/plain", name: "Test Resource 2" }
        ]
      }
    });
    const resources = await requestPromise;
    assert.strictEqual(resources.length, 2);
    assert.strictEqual(resources[0].uri, "resource1");
    assert.strictEqual(resources[1].uri, "resource2");
  });
  test("should handle error responses", async () => {
    const requestPromise = handler.readResource({ uri: "non-existent" });
    const sentMessages = transport.getSentMessages();
    const readResourceRequest = sentMessages[2];
    transport.simulateReceiveMessage({
      jsonrpc: MCP.JSONRPC_VERSION,
      id: readResourceRequest.id,
      error: {
        code: MCP.METHOD_NOT_FOUND,
        message: "Resource not found"
      }
    });
    try {
      await requestPromise;
      assert.fail("Expected error was not thrown");
    } catch (e) {
      assert.strictEqual(e.message, "MPC -32601: Resource not found");
      assert.strictEqual(e.code, MCP.METHOD_NOT_FOUND);
    }
  });
  test("should handle server requests", async () => {
    const pingRequest = {
      jsonrpc: MCP.JSONRPC_VERSION,
      id: 100,
      method: "ping"
    };
    transport.simulateReceiveMessage(pingRequest);
    const sentMessages = transport.getSentMessages();
    const pingResponse = sentMessages.find(
      (m) => "id" in m && m.id === pingRequest.id && "result" in m
    );
    assert.ok(pingResponse, "No ping response was sent");
    assert.deepStrictEqual(pingResponse.result, {});
  });
  test("should handle roots list requests", async () => {
    handler.roots = [
      { uri: "file:///test/root1", name: "Root 1" },
      { uri: "file:///test/root2", name: "Root 2" }
    ];
    const rootsRequest = {
      jsonrpc: MCP.JSONRPC_VERSION,
      id: 101,
      method: "roots/list"
    };
    transport.simulateReceiveMessage(rootsRequest);
    const sentMessages = transport.getSentMessages();
    const rootsResponse = sentMessages.find(
      (m) => "id" in m && m.id === rootsRequest.id && "result" in m
    );
    assert.ok(rootsResponse, "No roots/list response was sent");
    assert.strictEqual(rootsResponse.result.roots.length, 2);
    assert.strictEqual(rootsResponse.result.roots[0].uri, "file:///test/root1");
  });
  test("should handle server notifications", async () => {
    let progressNotificationReceived = false;
    store.add(handler.onDidReceiveProgressNotification((notification) => {
      progressNotificationReceived = true;
      assert.strictEqual(notification.method, "notifications/progress");
      assert.strictEqual(notification.params.progressToken, "token1");
      assert.strictEqual(notification.params.progress, 50);
    }));
    const progressNotification = {
      jsonrpc: MCP.JSONRPC_VERSION,
      method: "notifications/progress",
      params: {
        progressToken: "token1",
        progress: 50,
        total: 100
      }
    };
    transport.simulateReceiveMessage(progressNotification);
    assert.strictEqual(progressNotificationReceived, true);
  });
  test("should handle cancellation", async () => {
    const testCts = store.add(new CancellationTokenSource());
    const requestPromise = handler.listResources(void 0, testCts.token);
    const sentMessages = transport.getSentMessages();
    const listResourcesRequest = sentMessages[2];
    const requestId = listResourcesRequest.id;
    testCts.cancel();
    const cancelNotification = transport.getSentMessages().find(
      (m) => !("id" in m) && "method" in m && m.method === "notifications/cancelled" && "params" in m && m.params && m.params.requestId === requestId
    );
    assert.ok(cancelNotification, "No cancellation notification was sent");
    try {
      await requestPromise;
      assert.fail("Promise should have been cancelled");
    } catch (e) {
      assert.strictEqual(e.name, "Canceled");
    }
  });
  test("should handle cancelled notification from server", async () => {
    const requestPromise = handler.listResources();
    const sentMessages = transport.getSentMessages();
    const listResourcesRequest = sentMessages[2];
    const requestId = listResourcesRequest.id;
    const cancelledNotification = {
      jsonrpc: MCP.JSONRPC_VERSION,
      method: "notifications/cancelled",
      params: {
        requestId
      }
    };
    transport.simulateReceiveMessage(cancelledNotification);
    try {
      await requestPromise;
      assert.fail("Promise should have been cancelled");
    } catch (e) {
      assert.strictEqual(e.name, "Canceled");
    }
  });
  test("should dispose properly and cancel pending requests", async () => {
    const request1 = handler.listResources();
    const request2 = handler.listTools();
    handler.dispose();
    try {
      await request1;
      assert.fail("Promise 1 should have been cancelled");
    } catch (e) {
      assert.strictEqual(e.name, "Canceled");
    }
    try {
      await request2;
      assert.fail("Promise 2 should have been cancelled");
    } catch (e) {
      assert.strictEqual(e.name, "Canceled");
    }
  });
  test("should handle connection error by cancelling requests", async () => {
    const requestPromise = handler.listResources();
    transport.setConnectionState({
      state: McpConnectionState.Kind.Error,
      message: "Connection lost"
    });
    try {
      await requestPromise;
      assert.fail("Promise should have been cancelled");
    } catch (e) {
      assert.strictEqual(e.name, "Canceled");
    }
  });
  test("callTool forwards _meta.traceparent to the JSON-RPC payload (MCP SEP-414)", async () => {
    const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const tracestate = "rojo=00f067aa0ba902b7";
    const callPromise = handler.callTool({
      name: "echo",
      arguments: { hello: "world" },
      _meta: { traceparent, tracestate, progressToken: "tok-1" }
    });
    const sentMessages = transport.getSentMessages();
    const callRequest = sentMessages[2];
    assert.strictEqual(callRequest.method, "tools/call");
    assert.deepStrictEqual(callRequest.params._meta, {
      traceparent,
      tracestate,
      progressToken: "tok-1"
    });
    transport.simulateReceiveMessage({
      jsonrpc: MCP.JSONRPC_VERSION,
      id: callRequest.id,
      result: { content: [] }
    });
    await callPromise;
  });
});
suite.skip("Workbench - MCP - McpTask", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let clock;
  setup(() => {
    clock = sinon.useFakeTimers();
  });
  teardown(() => {
    clock.restore();
  });
  function createTask(overrides = {}) {
    return {
      taskId: "task1",
      status: "working",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastUpdatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      ttl: null,
      ...overrides
    };
  }
  test("should resolve when task completes", async () => {
    const getTaskResultStub = sinon.stub().resolves({ content: [{ type: "text", text: "result" }] });
    const mockHandler = upcastPartial({
      getTask: sinon.stub().resolves(createTask({ status: "completed" })),
      getTaskResult: getTaskResultStub
    });
    const task = store.add(new McpTask(createTask()));
    task.setHandler(mockHandler);
    await clock.tickAsync(2e3);
    task.onDidUpdateState(createTask({ status: "completed" }));
    const result = await task.result;
    assert.deepStrictEqual(result, { content: [{ type: "text", text: "result" }] });
    assert.ok(getTaskResultStub.calledWith({ taskId: "task1" }));
  });
  test("should poll for task updates", async () => {
    const getTaskStub = sinon.stub();
    getTaskStub.onCall(0).resolves(createTask({ status: "working" }));
    getTaskStub.onCall(1).resolves(createTask({ status: "working" }));
    getTaskStub.onCall(2).resolves(createTask({ status: "completed" }));
    const mockHandler = upcastPartial({
      getTask: getTaskStub,
      getTaskResult: sinon.stub().resolves({ content: [{ type: "text", text: "result" }] })
    });
    const task = store.add(new McpTask(createTask({ pollInterval: 1e3 })));
    task.setHandler(mockHandler);
    await clock.tickAsync(1e3);
    assert.strictEqual(getTaskStub.callCount, 1);
    await clock.tickAsync(1e3);
    assert.strictEqual(getTaskStub.callCount, 2);
    await clock.tickAsync(1e3);
    assert.strictEqual(getTaskStub.callCount, 3);
    const result = await task.result;
    assert.deepStrictEqual(result, { content: [{ type: "text", text: "result" }] });
  });
  test("should use default poll interval if not specified", async () => {
    const getTaskStub = sinon.stub();
    getTaskStub.resolves(createTask({ status: "working" }));
    const mockHandler = upcastPartial({
      getTask: getTaskStub
    });
    const task = store.add(new McpTask(createTask()));
    task.setHandler(mockHandler);
    await clock.tickAsync(2e3);
    assert.strictEqual(getTaskStub.callCount, 1);
    await clock.tickAsync(2e3);
    assert.strictEqual(getTaskStub.callCount, 2);
    task.dispose();
  });
  test("should reject when task fails", async () => {
    const mockHandler = upcastPartial({
      getTask: sinon.stub().resolves(createTask({
        status: "failed",
        statusMessage: "Something went wrong"
      }))
    });
    const task = store.add(new McpTask(createTask()));
    task.setHandler(mockHandler);
    task.onDidUpdateState(createTask({
      status: "failed",
      statusMessage: "Something went wrong"
    }));
    await assert.rejects(
      task.result,
      (error) => {
        assert.ok(error.message.includes("Task task1 failed"));
        assert.ok(error.message.includes("Something went wrong"));
        return true;
      }
    );
  });
  test("should cancel when task is cancelled", async () => {
    const task = store.add(new McpTask(createTask()));
    task.onDidUpdateState(createTask({ status: "cancelled" }));
    await assert.rejects(
      task.result,
      (error) => {
        assert.strictEqual(error.name, "Canceled");
        return true;
      }
    );
  });
  test("should cancel when cancellation token is triggered", async () => {
    const cts = store.add(new CancellationTokenSource());
    const task = store.add(new McpTask(createTask(), cts.token));
    cts.cancel();
    await assert.rejects(
      task.result,
      (error) => {
        assert.strictEqual(error.name, "Canceled");
        return true;
      }
    );
  });
  test("should handle TTL expiration", async () => {
    const now = Date.now();
    clock.setSystemTime(now);
    const task = store.add(new McpTask(createTask({ ttl: 5e3 })));
    await clock.tickAsync(6e3);
    await assert.rejects(
      task.result,
      (error) => {
        assert.strictEqual(error.name, "Canceled");
        return true;
      }
    );
  });
  test("should stop polling when in terminal state", async () => {
    const getTaskStub = sinon.stub();
    getTaskStub.resolves(createTask({ status: "completed" }));
    const mockHandler = upcastPartial({
      getTask: getTaskStub,
      getTaskResult: sinon.stub().resolves({ content: [{ type: "text", text: "result" }] })
    });
    const task = store.add(new McpTask(createTask({ pollInterval: 1e3 })));
    task.setHandler(mockHandler);
    task.onDidUpdateState(createTask({ status: "completed" }));
    await task.result;
    const initialCallCount = getTaskStub.callCount;
    await clock.tickAsync(5e3);
    assert.strictEqual(getTaskStub.callCount, initialCallCount);
  });
  test("should handle handler reconnection", async () => {
    const getTaskStub1 = sinon.stub();
    getTaskStub1.resolves(createTask({ status: "working" }));
    const mockHandler1 = upcastPartial({
      getTask: getTaskStub1
    });
    const task = store.add(new McpTask(createTask({ pollInterval: 1e3 })));
    task.setHandler(mockHandler1);
    await clock.tickAsync(1e3);
    assert.strictEqual(getTaskStub1.callCount, 1);
    const getTaskStub2 = sinon.stub();
    getTaskStub2.resolves(createTask({ status: "completed" }));
    const mockHandler2 = upcastPartial({
      getTask: getTaskStub2,
      getTaskResult: sinon.stub().resolves({ content: [{ type: "text", text: "result" }] })
    });
    task.setHandler(mockHandler2);
    await clock.tickAsync(1e3);
    assert.strictEqual(getTaskStub1.callCount, 1);
    assert.strictEqual(getTaskStub2.callCount, 1);
    const result = await task.result;
    assert.deepStrictEqual(result, { content: [{ type: "text", text: "result" }] });
  });
  test("should not poll when handler is undefined", async () => {
    const task = store.add(new McpTask(createTask({ pollInterval: 1e3 })));
    await clock.tickAsync(5e3);
    const getTaskStub = sinon.stub();
    getTaskStub.resolves(createTask({ status: "completed" }));
    const mockHandler = upcastPartial({
      getTask: getTaskStub,
      getTaskResult: sinon.stub().resolves({ content: [{ type: "text", text: "result" }] })
    });
    task.setHandler(mockHandler);
    await clock.tickAsync(1e3);
    assert.strictEqual(getTaskStub.callCount, 1);
    task.dispose();
  });
  test("should handle input_required state", async () => {
    const getTaskStub = sinon.stub();
    getTaskStub.resolves(createTask({ status: "completed" }));
    const mockHandler = upcastPartial({
      getTask: getTaskStub,
      getTaskResult: sinon.stub().resolves({ content: [{ type: "text", text: "result" }] })
    });
    const task = store.add(new McpTask(createTask({ pollInterval: 1e3 })));
    task.setHandler(mockHandler);
    task.onDidUpdateState(createTask({ status: "input_required" }));
    await clock.tickAsync(0);
    assert.strictEqual(getTaskStub.callCount, 1);
    const result = await task.result;
    assert.deepStrictEqual(result, { content: [{ type: "text", text: "result" }] });
  });
  test("should handle getTask returning cancelled during polling", async () => {
    const getTaskStub = sinon.stub();
    getTaskStub.resolves(createTask({ status: "cancelled" }));
    const mockHandler = upcastPartial({
      getTask: getTaskStub
    });
    const task = store.add(new McpTask(createTask({ pollInterval: 1e3 })));
    task.setHandler(mockHandler);
    await clock.tickAsync(1e3);
    await assert.rejects(
      task.result,
      (error) => {
        assert.strictEqual(error.name, "Canceled");
        return true;
      }
    );
  });
  test("should return correct task id", () => {
    const task = store.add(new McpTask(createTask({ taskId: "my-task-id" })));
    assert.strictEqual(task.id, "my-task-id");
  });
  test("should dispose cleanly", async () => {
    const getTaskStub = sinon.stub();
    getTaskStub.resolves(createTask({ status: "working" }));
    const mockHandler = upcastPartial({
      getTask: getTaskStub
    });
    const task = store.add(new McpTask(createTask({ pollInterval: 1e3 })));
    task.setHandler(mockHandler);
    await clock.tickAsync(1e3);
    const callCountBeforeDispose = getTaskStub.callCount;
    task.dispose();
    await clock.tickAsync(5e3);
    assert.strictEqual(getTaskStub.callCount, callCountBeforeDispose);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyB1cGNhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRlc3RMb2dnZXJTZXJ2aWNlLCBUZXN0UHJvZHVjdFNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTWNwSG9zdERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIsIE1jcFRhc2sgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwU2VydmVyUmVxdWVzdEhhbmRsZXIuanMnO1xuaW1wb3J0IHsgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTZXJ2ZXJMYXVuY2ggfSBmcm9tICcuLi8uLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcbmltcG9ydCB7IFRlc3RNY3BNZXNzYWdlVHJhbnNwb3J0IH0gZnJvbSAnLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBNY3BUYXNrTWFuYWdlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BUYXNrTWFuYWdlci5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcblxuY2xhc3MgVGVzdE1jcEhvc3REZWxlZ2F0ZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwSG9zdERlbGVnYXRlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNwb3J0OiBUZXN0TWNwTWVzc2FnZVRyYW5zcG9ydDtcblxuXHRwcmlvcml0eSA9IDA7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90cmFuc3BvcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGVzdE1jcE1lc3NhZ2VUcmFuc3BvcnQoKSk7XG5cdH1cblxuXG5cdHN1YnN0aXR1dGVWYXJpYWJsZXMoc2VydmVyRGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbiwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gpOiBQcm9taXNlPE1jcFNlcnZlckxhdW5jaD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobGF1bmNoKTtcblx0fVxuXG5cdGNhblN0YXJ0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c3RhcnQoKTogVGVzdE1jcE1lc3NhZ2VUcmFuc3BvcnQge1xuXHRcdHJldHVybiB0aGlzLl90cmFuc3BvcnQ7XG5cdH1cblxuXHRnZXRUcmFuc3BvcnQoKTogVGVzdE1jcE1lc3NhZ2VUcmFuc3BvcnQge1xuXHRcdHJldHVybiB0aGlzLl90cmFuc3BvcnQ7XG5cdH1cblxuXHR3YWl0Rm9ySW5pdGlhbFByb3ZpZGVyUHJvbWlzZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBNQ1AgLSBTZXJ2ZXJSZXF1ZXN0SGFuZGxlcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGRlbGVnYXRlOiBUZXN0TWNwSG9zdERlbGVnYXRlO1xuXHRsZXQgdHJhbnNwb3J0OiBUZXN0TWNwTWVzc2FnZVRyYW5zcG9ydDtcblx0bGV0IGhhbmRsZXI6IE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyO1xuXHRsZXQgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0ZGVsZWdhdGUgPSBzdG9yZS5hZGQobmV3IFRlc3RNY3BIb3N0RGVsZWdhdGUoKSk7XG5cdFx0dHJhbnNwb3J0ID0gZGVsZWdhdGUuZ2V0VHJhbnNwb3J0KCk7XG5cdFx0Y3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdC8vIFNldHVwIHRlc3Qgc2VydmljZXNcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nZ2VyU2VydmljZSwgc3RvcmUuYWRkKG5ldyBUZXN0TG9nZ2VyU2VydmljZSgpKV0sXG5cdFx0XHRbSU91dHB1dFNlcnZpY2UsIHVwY2FzdCh7IHNob3dDaGFubmVsOiAoKSA9PiB7IH0gfSldLFxuXHRcdFx0W0lTdG9yYWdlU2VydmljZSwgc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSldLFxuXHRcdFx0W0lQcm9kdWN0U2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlXSxcblx0XHQpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXG5cdFx0dHJhbnNwb3J0LnNldENvbm5lY3Rpb25TdGF0ZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pO1xuXG5cdFx0Ly8gTWFudWFsbHkgY3JlYXRlIHRoZSBoYW5kbGVyIHNpbmNlIHdlIG5lZWQgdGhlIHRyYW5zcG9ydCBhbHJlYWR5IHNldCB1cFxuXHRcdGNvbnN0IGxvZ2dlciA9IHN0b3JlLmFkZCgoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMb2dnZXJTZXJ2aWNlKSBhcyBUZXN0TG9nZ2VyU2VydmljZSlcblx0XHRcdC5jcmVhdGVMb2dnZXIoJ21jcFNlcnZlclRlc3QnLCB7IGhpZGRlbjogdHJ1ZSwgbmFtZTogJ01DUCBUZXN0JyB9KSk7XG5cblx0XHQvLyBTdGFydCB0aGUgaGFuZGxlciBjcmVhdGlvblxuXHRcdGNvbnN0IGhhbmRsZXJQcm9taXNlID0gTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIuY3JlYXRlKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IGxvZ2dlciwgbGF1bmNoOiB0cmFuc3BvcnQsIHRhc2tNYW5hZ2VyOiBzdG9yZS5hZGQobmV3IE1jcFRhc2tNYW5hZ2VyKCkpIH0sIGN0cy50b2tlbik7XG5cblx0XHRoYW5kbGVyID0gYXdhaXQgaGFuZGxlclByb21pc2U7XG5cdFx0c3RvcmUuYWRkKGhhbmRsZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc2VuZCBhbmQgcmVjZWl2ZSBKU09OLVJQQyByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXR1cCByZXF1ZXN0XG5cdFx0Y29uc3QgcmVxdWVzdFByb21pc2UgPSBoYW5kbGVyLmxpc3RSZXNvdXJjZXMoKTtcblxuXHRcdC8vIEdldCB0aGUgc2VudCBtZXNzYWdlIGFuZCB2ZXJpZnkgaXRcblx0XHRjb25zdCBzZW50TWVzc2FnZXMgPSB0cmFuc3BvcnQuZ2V0U2VudE1lc3NhZ2VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnRNZXNzYWdlcy5sZW5ndGgsIDMpOyAvLyBpbml0aWFsaXplICsgbGlzdFJlc291cmNlc1xuXG5cdFx0Ly8gVmVyaWZ5IGxpc3RSZXNvdXJjZXMgcmVxdWVzdCBmb3JtYXRcblx0XHRjb25zdCBsaXN0UmVzb3VyY2VzUmVxdWVzdCA9IHNlbnRNZXNzYWdlc1syXSBhcyBNQ1AuSlNPTlJQQ1JlcXVlc3Q7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RSZXNvdXJjZXNSZXF1ZXN0Lm1ldGhvZCwgJ3Jlc291cmNlcy9saXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RSZXNvdXJjZXNSZXF1ZXN0Lmpzb25ycGMsIE1DUC5KU09OUlBDX1ZFUlNJT04pO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgbGlzdFJlc291cmNlc1JlcXVlc3QuaWQgPT09ICdudW1iZXInKTtcblxuXHRcdC8vIFNpbXVsYXRlIHNlcnZlciByZXNwb25zZSB3aXRoIG1vY2sgcmVzb3VyY2VzIHRoYXQgbWF0Y2ggdGhlIGV4cGVjdGVkIFJlc291cmNlIGludGVyZmFjZVxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZVJlY2VpdmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6IE1DUC5KU09OUlBDX1ZFUlNJT04sXG5cdFx0XHRpZDogbGlzdFJlc291cmNlc1JlcXVlc3QuaWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0cmVzb3VyY2VzOiBbXG5cdFx0XHRcdFx0eyB1cmk6ICdyZXNvdXJjZTEnLCB0eXBlOiAndGV4dC9wbGFpbicsIG5hbWU6ICdUZXN0IFJlc291cmNlIDEnIH0sXG5cdFx0XHRcdFx0eyB1cmk6ICdyZXNvdXJjZTInLCB0eXBlOiAndGV4dC9wbGFpbicsIG5hbWU6ICdUZXN0IFJlc291cmNlIDInIH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSByZXN1bHRcblx0XHRjb25zdCByZXNvdXJjZXMgPSBhd2FpdCByZXF1ZXN0UHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb3VyY2VzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc291cmNlc1swXS51cmksICdyZXNvdXJjZTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb3VyY2VzWzFdLm5hbWUsICdUZXN0IFJlc291cmNlIDInKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBwYWdpbmF0ZWQgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgcmVxdWVzdFxuXHRcdGNvbnN0IHJlcXVlc3RQcm9taXNlID0gaGFuZGxlci5saXN0UmVzb3VyY2VzKCk7XG5cblx0XHQvLyBHZXQgdGhlIGZpcnN0IHJlcXVlc3QgYW5kIHJlc3BvbmQgd2l0aCBwYWdpbmF0aW9uXG5cdFx0Y29uc3Qgc2VudE1lc3NhZ2VzID0gdHJhbnNwb3J0LmdldFNlbnRNZXNzYWdlcygpO1xuXHRcdGNvbnN0IGxpc3RSZXNvdXJjZXNSZXF1ZXN0ID0gc2VudE1lc3NhZ2VzWzJdIGFzIE1DUC5KU09OUlBDUmVxdWVzdDtcblxuXHRcdC8vIFNlbmQgZmlyc3QgcGFnZSB3aXRoIG5leHRDdXJzb3Jcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVSZWNlaXZlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiBNQ1AuSlNPTlJQQ19WRVJTSU9OLFxuXHRcdFx0aWQ6IGxpc3RSZXNvdXJjZXNSZXF1ZXN0LmlkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHJlc291cmNlczogW1xuXHRcdFx0XHRcdHsgdXJpOiAncmVzb3VyY2UxJywgdHlwZTogJ3RleHQvcGxhaW4nLCBuYW1lOiAnVGVzdCBSZXNvdXJjZSAxJyB9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdG5leHRDdXJzb3I6ICdwYWdlMidcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIENsZWFyIHRoZSBzZW50IG1lc3NhZ2VzIHRvIG9ubHkgY2FwdHVyZSB0aGUgbmV4dCBwYWdlIHJlcXVlc3Rcblx0XHR0cmFuc3BvcnQuY2xlYXJTZW50TWVzc2FnZXMoKTtcblxuXHRcdC8vIFdhaXQgYSBiaXQgdG8gYWxsb3cgdGhlIGhhbmRsZXIgdG8gcHJvY2VzcyBhbmQgc2VuZCB0aGUgbmV4dCByZXF1ZXN0XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdC8vIEdldCB0aGUgc2Vjb25kIHJlcXVlc3QgYW5kIHZlcmlmeSBjdXJzb3IgaXMgaW5jbHVkZWRcblx0XHRjb25zdCBzZW50TWVzc2FnZXMyID0gdHJhbnNwb3J0LmdldFNlbnRNZXNzYWdlcygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW50TWVzc2FnZXMyLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBsaXN0UmVzb3VyY2VzUmVxdWVzdDIgPSBzZW50TWVzc2FnZXMyWzBdIGFzIE1DUC5KU09OUlBDUmVxdWVzdDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdFJlc291cmNlc1JlcXVlc3QyLm1ldGhvZCwgJ3Jlc291cmNlcy9saXN0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0UmVzb3VyY2VzUmVxdWVzdDIucGFyYW1zLCB7IGN1cnNvcjogJ3BhZ2UyJyB9KTtcblxuXHRcdC8vIFNlbmQgZmluYWwgcGFnZSB3aXRoIG5vIG5leHRDdXJzb3Jcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVSZWNlaXZlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiBNQ1AuSlNPTlJQQ19WRVJTSU9OLFxuXHRcdFx0aWQ6IGxpc3RSZXNvdXJjZXNSZXF1ZXN0Mi5pZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRyZXNvdXJjZXM6IFtcblx0XHRcdFx0XHR7IHVyaTogJ3Jlc291cmNlMicsIHR5cGU6ICd0ZXh0L3BsYWluJywgbmFtZTogJ1Rlc3QgUmVzb3VyY2UgMicgfVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGNvbWJpbmVkIHJlc3VsdFxuXHRcdGNvbnN0IHJlc291cmNlcyA9IGF3YWl0IHJlcXVlc3RQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvdXJjZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb3VyY2VzWzBdLnVyaSwgJ3Jlc291cmNlMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvdXJjZXNbMV0udXJpLCAncmVzb3VyY2UyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZXJyb3IgcmVzcG9uc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHJlcXVlc3Rcblx0XHRjb25zdCByZXF1ZXN0UHJvbWlzZSA9IGhhbmRsZXIucmVhZFJlc291cmNlKHsgdXJpOiAnbm9uLWV4aXN0ZW50JyB9KTtcblxuXHRcdC8vIEdldCB0aGUgc2VudCBtZXNzYWdlXG5cdFx0Y29uc3Qgc2VudE1lc3NhZ2VzID0gdHJhbnNwb3J0LmdldFNlbnRNZXNzYWdlcygpO1xuXHRcdGNvbnN0IHJlYWRSZXNvdXJjZVJlcXVlc3QgPSBzZW50TWVzc2FnZXNbMl0gYXMgTUNQLkpTT05SUENSZXF1ZXN0OyAvLyBbMF0gaXMgaW5pdGlhbGl6ZVxuXG5cdFx0Ly8gU2ltdWxhdGUgZXJyb3IgcmVzcG9uc2Vcblx0XHR0cmFuc3BvcnQuc2ltdWxhdGVSZWNlaXZlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiBNQ1AuSlNPTlJQQ19WRVJTSU9OLFxuXHRcdFx0aWQ6IHJlYWRSZXNvdXJjZVJlcXVlc3QuaWQsXG5cdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRjb2RlOiBNQ1AuTUVUSE9EX05PVF9GT1VORCxcblx0XHRcdFx0bWVzc2FnZTogJ1Jlc291cmNlIG5vdCBmb3VuZCdcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgZXJyb3IgaXMgdGhyb3duIGNvcnJlY3RseVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCByZXF1ZXN0UHJvbWlzZTtcblx0XHRcdGFzc2VydC5mYWlsKCdFeHBlY3RlZCBlcnJvciB3YXMgbm90IHRocm93bicpO1xuXHRcdH0gY2F0Y2ggKGU6IHVua25vd24pIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZSBhcyBFcnJvcikubWVzc2FnZSwgJ01QQyAtMzI2MDE6IFJlc291cmNlIG5vdCBmb3VuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChlIGFzIHsgY29kZTogbnVtYmVyIH0pLmNvZGUsIE1DUC5NRVRIT0RfTk9UX0ZPVU5EKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc2VydmVyIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlIHBpbmcgcmVxdWVzdCBmcm9tIHNlcnZlclxuXHRcdGNvbnN0IHBpbmdSZXF1ZXN0OiBNQ1AuSlNPTlJQQ1JlcXVlc3QgJiBNQ1AuUGluZ1JlcXVlc3QgPSB7XG5cdFx0XHRqc29ucnBjOiBNQ1AuSlNPTlJQQ19WRVJTSU9OLFxuXHRcdFx0aWQ6IDEwMCxcblx0XHRcdG1ldGhvZDogJ3BpbmcnXG5cdFx0fTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZVJlY2VpdmVNZXNzYWdlKHBpbmdSZXF1ZXN0KTtcblxuXHRcdC8vIFRoZSBoYW5kbGVyIHNob3VsZCBoYXZlIHNlbnQgYSByZXNwb25zZVxuXHRcdGNvbnN0IHNlbnRNZXNzYWdlcyA9IHRyYW5zcG9ydC5nZXRTZW50TWVzc2FnZXMoKTtcblx0XHRjb25zdCBwaW5nUmVzcG9uc2UgPSBzZW50TWVzc2FnZXMuZmluZChtID0+XG5cdFx0XHQnaWQnIGluIG0gJiYgbS5pZCA9PT0gcGluZ1JlcXVlc3QuaWQgJiYgJ3Jlc3VsdCcgaW4gbVxuXHRcdCkgYXMgTUNQLkpTT05SUENSZXN1bHRSZXNwb25zZTtcblxuXHRcdGFzc2VydC5vayhwaW5nUmVzcG9uc2UsICdObyBwaW5nIHJlc3BvbnNlIHdhcyBzZW50Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaW5nUmVzcG9uc2UucmVzdWx0LCB7fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcm9vdHMgbGlzdCByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXQgcm9vdHNcblx0XHRoYW5kbGVyLnJvb3RzID0gW1xuXHRcdFx0eyB1cmk6ICdmaWxlOi8vL3Rlc3Qvcm9vdDEnLCBuYW1lOiAnUm9vdCAxJyB9LFxuXHRcdFx0eyB1cmk6ICdmaWxlOi8vL3Rlc3Qvcm9vdDInLCBuYW1lOiAnUm9vdCAyJyB9XG5cdFx0XTtcblxuXHRcdC8vIFNpbXVsYXRlIHJvb3RzL2xpc3QgcmVxdWVzdCBmcm9tIHNlcnZlclxuXHRcdGNvbnN0IHJvb3RzUmVxdWVzdDogTUNQLkpTT05SUENSZXF1ZXN0ICYgTUNQLkxpc3RSb290c1JlcXVlc3QgPSB7XG5cdFx0XHRqc29ucnBjOiBNQ1AuSlNPTlJQQ19WRVJTSU9OLFxuXHRcdFx0aWQ6IDEwMSxcblx0XHRcdG1ldGhvZDogJ3Jvb3RzL2xpc3QnXG5cdFx0fTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZVJlY2VpdmVNZXNzYWdlKHJvb3RzUmVxdWVzdCk7XG5cblx0XHQvLyBUaGUgaGFuZGxlciBzaG91bGQgaGF2ZSBzZW50IGEgcmVzcG9uc2Vcblx0XHRjb25zdCBzZW50TWVzc2FnZXMgPSB0cmFuc3BvcnQuZ2V0U2VudE1lc3NhZ2VzKCk7XG5cdFx0Y29uc3Qgcm9vdHNSZXNwb25zZSA9IHNlbnRNZXNzYWdlcy5maW5kKG0gPT5cblx0XHRcdCdpZCcgaW4gbSAmJiBtLmlkID09PSByb290c1JlcXVlc3QuaWQgJiYgJ3Jlc3VsdCcgaW4gbVxuXHRcdCkgYXMgTUNQLkpTT05SUENSZXN1bHRSZXNwb25zZTtcblxuXHRcdGFzc2VydC5vayhyb290c1Jlc3BvbnNlLCAnTm8gcm9vdHMvbGlzdCByZXNwb25zZSB3YXMgc2VudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocm9vdHNSZXNwb25zZS5yZXN1bHQgYXMgTUNQLkxpc3RSb290c1Jlc3VsdCkucm9vdHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJvb3RzUmVzcG9uc2UucmVzdWx0IGFzIE1DUC5MaXN0Um9vdHNSZXN1bHQpLnJvb3RzWzBdLnVyaSwgJ2ZpbGU6Ly8vdGVzdC9yb290MScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNlcnZlciBub3RpZmljYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBwcm9ncmVzc05vdGlmaWNhdGlvblJlY2VpdmVkID0gZmFsc2U7XG5cdFx0c3RvcmUuYWRkKGhhbmRsZXIub25EaWRSZWNlaXZlUHJvZ3Jlc3NOb3RpZmljYXRpb24obm90aWZpY2F0aW9uID0+IHtcblx0XHRcdHByb2dyZXNzTm90aWZpY2F0aW9uUmVjZWl2ZWQgPSB0cnVlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbi5tZXRob2QsICdub3RpZmljYXRpb25zL3Byb2dyZXNzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uLnBhcmFtcy5wcm9ncmVzc1Rva2VuLCAndG9rZW4xJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uLnBhcmFtcy5wcm9ncmVzcywgNTApO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNpbXVsYXRlIHByb2dyZXNzIG5vdGlmaWNhdGlvbiB3aXRoIGNvcnJlY3QgZm9ybWF0XG5cdFx0Y29uc3QgcHJvZ3Jlc3NOb3RpZmljYXRpb246IE1DUC5KU09OUlBDTm90aWZpY2F0aW9uICYgTUNQLlByb2dyZXNzTm90aWZpY2F0aW9uID0ge1xuXHRcdFx0anNvbnJwYzogTUNQLkpTT05SUENfVkVSU0lPTixcblx0XHRcdG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvcHJvZ3Jlc3MnLFxuXHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdHByb2dyZXNzVG9rZW46ICd0b2tlbjEnLFxuXHRcdFx0XHRwcm9ncmVzczogNTAsXG5cdFx0XHRcdHRvdGFsOiAxMDBcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dHJhbnNwb3J0LnNpbXVsYXRlUmVjZWl2ZU1lc3NhZ2UocHJvZ3Jlc3NOb3RpZmljYXRpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9ncmVzc05vdGlmaWNhdGlvblJlY2VpdmVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjYW5jZWxsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgYSBuZXcgY2FuY2VsbGF0aW9uIHRva2VuIHNvdXJjZSBmb3IgdGhpcyBzcGVjaWZpYyB0ZXN0XG5cdFx0Y29uc3QgdGVzdEN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgcmVxdWVzdFByb21pc2UgPSBoYW5kbGVyLmxpc3RSZXNvdXJjZXModW5kZWZpbmVkLCB0ZXN0Q3RzLnRva2VuKTtcblxuXHRcdC8vIEdldCB0aGUgcmVxdWVzdCBJRFxuXHRcdGNvbnN0IHNlbnRNZXNzYWdlcyA9IHRyYW5zcG9ydC5nZXRTZW50TWVzc2FnZXMoKTtcblx0XHRjb25zdCBsaXN0UmVzb3VyY2VzUmVxdWVzdCA9IHNlbnRNZXNzYWdlc1syXSBhcyBNQ1AuSlNPTlJQQ1JlcXVlc3Q7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gbGlzdFJlc291cmNlc1JlcXVlc3QuaWQ7XG5cblx0XHQvLyBDYW5jZWwgdGhlIHJlcXVlc3Rcblx0XHR0ZXN0Q3RzLmNhbmNlbCgpO1xuXG5cdFx0Ly8gQ2hlY2sgdGhhdCBhIGNhbmNlbGxhdGlvbiBub3RpZmljYXRpb24gd2FzIHNlbnRcblx0XHRjb25zdCBjYW5jZWxOb3RpZmljYXRpb24gPSB0cmFuc3BvcnQuZ2V0U2VudE1lc3NhZ2VzKCkuZmluZChtID0+XG5cdFx0XHQhKCdpZCcgaW4gbSkgJiZcblx0XHRcdCdtZXRob2QnIGluIG0gJiZcblx0XHRcdG0ubWV0aG9kID09PSAnbm90aWZpY2F0aW9ucy9jYW5jZWxsZWQnICYmXG5cdFx0XHQncGFyYW1zJyBpbiBtICYmXG5cdFx0XHRtLnBhcmFtcyAmJiBtLnBhcmFtcy5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2soY2FuY2VsTm90aWZpY2F0aW9uLCAnTm8gY2FuY2VsbGF0aW9uIG5vdGlmaWNhdGlvbiB3YXMgc2VudCcpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBwcm9taXNlIHdhcyBjYW5jZWxsZWRcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmVxdWVzdFByb21pc2U7XG5cdFx0XHRhc3NlcnQuZmFpbCgnUHJvbWlzZSBzaG91bGQgaGF2ZSBiZWVuIGNhbmNlbGxlZCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLm5hbWUsICdDYW5jZWxlZCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjYW5jZWxsZWQgbm90aWZpY2F0aW9uIGZyb20gc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldHVwIHJlcXVlc3Rcblx0XHRjb25zdCByZXF1ZXN0UHJvbWlzZSA9IGhhbmRsZXIubGlzdFJlc291cmNlcygpO1xuXG5cdFx0Ly8gR2V0IHRoZSByZXF1ZXN0IElEXG5cdFx0Y29uc3Qgc2VudE1lc3NhZ2VzID0gdHJhbnNwb3J0LmdldFNlbnRNZXNzYWdlcygpO1xuXHRcdGNvbnN0IGxpc3RSZXNvdXJjZXNSZXF1ZXN0ID0gc2VudE1lc3NhZ2VzWzJdIGFzIE1DUC5KU09OUlBDUmVxdWVzdDtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSBsaXN0UmVzb3VyY2VzUmVxdWVzdC5pZDtcblxuXHRcdC8vIFNpbXVsYXRlIGNhbmNlbGxlZCBub3RpZmljYXRpb24gZnJvbSBzZXJ2ZXJcblx0XHRjb25zdCBjYW5jZWxsZWROb3RpZmljYXRpb246IE1DUC5KU09OUlBDTm90aWZpY2F0aW9uICYgTUNQLkNhbmNlbGxlZE5vdGlmaWNhdGlvbiA9IHtcblx0XHRcdGpzb25ycGM6IE1DUC5KU09OUlBDX1ZFUlNJT04sXG5cdFx0XHRtZXRob2Q6ICdub3RpZmljYXRpb25zL2NhbmNlbGxlZCcsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0cmVxdWVzdElkXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZVJlY2VpdmVNZXNzYWdlKGNhbmNlbGxlZE5vdGlmaWNhdGlvbik7XG5cblx0XHQvLyBWZXJpZnkgdGhlIHByb21pc2Ugd2FzIGNhbmNlbGxlZFxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCByZXF1ZXN0UHJvbWlzZTtcblx0XHRcdGFzc2VydC5mYWlsKCdQcm9taXNlIHNob3VsZCBoYXZlIGJlZW4gY2FuY2VsbGVkJyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUubmFtZSwgJ0NhbmNlbGVkJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZGlzcG9zZSBwcm9wZXJseSBhbmQgY2FuY2VsIHBlbmRpbmcgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgbXVsdGlwbGUgcmVxdWVzdHNcblx0XHRjb25zdCByZXF1ZXN0MSA9IGhhbmRsZXIubGlzdFJlc291cmNlcygpO1xuXHRcdGNvbnN0IHJlcXVlc3QyID0gaGFuZGxlci5saXN0VG9vbHMoKTtcblxuXHRcdC8vIERpc3Bvc2UgdGhlIGhhbmRsZXJcblx0XHRoYW5kbGVyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFZlcmlmeSBhbGwgcHJvbWlzZXMgd2VyZSBjYW5jZWxsZWRcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmVxdWVzdDE7XG5cdFx0XHRhc3NlcnQuZmFpbCgnUHJvbWlzZSAxIHNob3VsZCBoYXZlIGJlZW4gY2FuY2VsbGVkJyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUubmFtZSwgJ0NhbmNlbGVkJyk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlcXVlc3QyO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Byb21pc2UgMiBzaG91bGQgaGF2ZSBiZWVuIGNhbmNlbGxlZCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLm5hbWUsICdDYW5jZWxlZCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb25uZWN0aW9uIGVycm9yIGJ5IGNhbmNlbGxpbmcgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2V0dXAgcmVxdWVzdFxuXHRcdGNvbnN0IHJlcXVlc3RQcm9taXNlID0gaGFuZGxlci5saXN0UmVzb3VyY2VzKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBjb25uZWN0aW9uIGVycm9yXG5cdFx0dHJhbnNwb3J0LnNldENvbm5lY3Rpb25TdGF0ZSh7XG5cdFx0XHRzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IsXG5cdFx0XHRtZXNzYWdlOiAnQ29ubmVjdGlvbiBsb3N0J1xuXHRcdH0pO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBwcm9taXNlIHdhcyBjYW5jZWxsZWRcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmVxdWVzdFByb21pc2U7XG5cdFx0XHRhc3NlcnQuZmFpbCgnUHJvbWlzZSBzaG91bGQgaGF2ZSBiZWVuIGNhbmNlbGxlZCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLm5hbWUsICdDYW5jZWxlZCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2FsbFRvb2wgZm9yd2FyZHMgX21ldGEudHJhY2VwYXJlbnQgdG8gdGhlIEpTT04tUlBDIHBheWxvYWQgKE1DUCBTRVAtNDE0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0cmFjZXBhcmVudCA9ICcwMC0wYWY3NjUxOTE2Y2Q0M2RkODQ0OGViMjExYzgwMzE5Yy1iN2FkNmI3MTY5MjAzMzMxLTAxJztcblx0XHRjb25zdCB0cmFjZXN0YXRlID0gJ3Jvam89MDBmMDY3YWEwYmE5MDJiNyc7XG5cblx0XHRjb25zdCBjYWxsUHJvbWlzZSA9IGhhbmRsZXIuY2FsbFRvb2woe1xuXHRcdFx0bmFtZTogJ2VjaG8nLFxuXHRcdFx0YXJndW1lbnRzOiB7IGhlbGxvOiAnd29ybGQnIH0sXG5cdFx0XHRfbWV0YTogeyB0cmFjZXBhcmVudCwgdHJhY2VzdGF0ZSwgcHJvZ3Jlc3NUb2tlbjogJ3Rvay0xJyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VudE1lc3NhZ2VzID0gdHJhbnNwb3J0LmdldFNlbnRNZXNzYWdlcygpO1xuXHRcdGNvbnN0IGNhbGxSZXF1ZXN0ID0gc2VudE1lc3NhZ2VzWzJdIGFzIE1DUC5KU09OUlBDUmVxdWVzdCAmIE1DUC5DYWxsVG9vbFJlcXVlc3Q7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxSZXF1ZXN0Lm1ldGhvZCwgJ3Rvb2xzL2NhbGwnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxSZXF1ZXN0LnBhcmFtcy5fbWV0YSwge1xuXHRcdFx0dHJhY2VwYXJlbnQsXG5cdFx0XHR0cmFjZXN0YXRlLFxuXHRcdFx0cHJvZ3Jlc3NUb2tlbjogJ3Rvay0xJyxcblx0XHR9KTtcblxuXHRcdHRyYW5zcG9ydC5zaW11bGF0ZVJlY2VpdmVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6IE1DUC5KU09OUlBDX1ZFUlNJT04sXG5cdFx0XHRpZDogY2FsbFJlcXVlc3QuaWQsXG5cdFx0XHRyZXN1bHQ6IHsgY29udGVudDogW10gfSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGNhbGxQcm9taXNlO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZS5za2lwKCdXb3JrYmVuY2ggLSBNQ1AgLSBNY3BUYXNrJywgKCkgPT4geyAvLyBUT0RPQGNvbm5vcjQzMTIgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI4MDEyNlxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgY2xvY2s6IHNpbm9uLlNpbm9uRmFrZVRpbWVycztcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRhc2sob3ZlcnJpZGVzOiBQYXJ0aWFsPE1DUC5UYXNrPiA9IHt9KTogTUNQLlRhc2sge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0YXNrSWQ6ICd0YXNrMScsXG5cdFx0XHRzdGF0dXM6ICd3b3JraW5nJyxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bGFzdFVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0dHRsOiBudWxsLFxuXHRcdFx0Li4ub3ZlcnJpZGVzXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHdoZW4gdGFzayBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2V0VGFza1Jlc3VsdFN0dWIgPSBzaW5vbi5zdHViKCkucmVzb2x2ZXMoeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdyZXN1bHQnIH1dIH0pO1xuXHRcdGNvbnN0IG1vY2tIYW5kbGVyID0gdXBjYXN0UGFydGlhbDxNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlcj4oe1xuXHRcdFx0Z2V0VGFzazogc2lub24uc3R1YigpLnJlc29sdmVzKGNyZWF0ZVRhc2soeyBzdGF0dXM6ICdjb21wbGV0ZWQnIH0pKSxcblx0XHRcdGdldFRhc2tSZXN1bHQ6IGdldFRhc2tSZXN1bHRTdHViXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YXNrID0gc3RvcmUuYWRkKG5ldyBNY3BUYXNrKGNyZWF0ZVRhc2soKSkpO1xuXHRcdHRhc2suc2V0SGFuZGxlcihtb2NrSGFuZGxlcik7XG5cblx0XHQvLyBBZHZhbmNlIHRpbWUgdG8gdHJpZ2dlciBwb2xsaW5nXG5cdFx0YXdhaXQgY2xvY2sudGlja0FzeW5jKDIwMDApO1xuXG5cdFx0Ly8gVXBkYXRlIHRvIGNvbXBsZXRlZCBzdGF0ZVxuXHRcdHRhc2sub25EaWRVcGRhdGVTdGF0ZShjcmVhdGVUYXNrKHsgc3RhdHVzOiAnY29tcGxldGVkJyB9KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0YXNrLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdyZXN1bHQnIH1dIH0pO1xuXHRcdGFzc2VydC5vayhnZXRUYXNrUmVzdWx0U3R1Yi5jYWxsZWRXaXRoKHsgdGFza0lkOiAndGFzazEnIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHBvbGwgZm9yIHRhc2sgdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnZXRUYXNrU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRnZXRUYXNrU3R1Yi5vbkNhbGwoMCkucmVzb2x2ZXMoY3JlYXRlVGFzayh7IHN0YXR1czogJ3dvcmtpbmcnIH0pKTtcblx0XHRnZXRUYXNrU3R1Yi5vbkNhbGwoMSkucmVzb2x2ZXMoY3JlYXRlVGFzayh7IHN0YXR1czogJ3dvcmtpbmcnIH0pKTtcblx0XHRnZXRUYXNrU3R1Yi5vbkNhbGwoMikucmVzb2x2ZXMoY3JlYXRlVGFzayh7IHN0YXR1czogJ2NvbXBsZXRlZCcgfSkpO1xuXG5cdFx0Y29uc3QgbW9ja0hhbmRsZXIgPSB1cGNhc3RQYXJ0aWFsPE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyPih7XG5cdFx0XHRnZXRUYXNrOiBnZXRUYXNrU3R1Yixcblx0XHRcdGdldFRhc2tSZXN1bHQ6IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyh7IGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3Jlc3VsdCcgfV0gfSlcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhc2sgPSBzdG9yZS5hZGQobmV3IE1jcFRhc2soY3JlYXRlVGFzayh7IHBvbGxJbnRlcnZhbDogMTAwMCB9KSkpO1xuXHRcdHRhc2suc2V0SGFuZGxlcihtb2NrSGFuZGxlcik7XG5cblx0XHQvLyBGaXJzdCBwb2xsXG5cdFx0YXdhaXQgY2xvY2sudGlja0FzeW5jKDEwMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrU3R1Yi5jYWxsQ291bnQsIDEpO1xuXG5cdFx0Ly8gU2Vjb25kIHBvbGxcblx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoMTAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tTdHViLmNhbGxDb3VudCwgMik7XG5cblx0XHQvLyBUaGlyZCBwb2xsIC0gY29tcGxldGVzXG5cdFx0YXdhaXQgY2xvY2sudGlja0FzeW5jKDEwMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrU3R1Yi5jYWxsQ291bnQsIDMpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGFzay5yZXN1bHQ7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAncmVzdWx0JyB9XSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHVzZSBkZWZhdWx0IHBvbGwgaW50ZXJ2YWwgaWYgbm90IHNwZWNpZmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnZXRUYXNrU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRnZXRUYXNrU3R1Yi5yZXNvbHZlcyhjcmVhdGVUYXNrKHsgc3RhdHVzOiAnd29ya2luZycgfSkpO1xuXG5cdFx0Y29uc3QgbW9ja0hhbmRsZXIgPSB1cGNhc3RQYXJ0aWFsPE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyPih7XG5cdFx0XHRnZXRUYXNrOiBnZXRUYXNrU3R1Yixcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhc2sgPSBzdG9yZS5hZGQobmV3IE1jcFRhc2soY3JlYXRlVGFzaygpKSk7XG5cdFx0dGFzay5zZXRIYW5kbGVyKG1vY2tIYW5kbGVyKTtcblxuXHRcdC8vIERlZmF1bHQgcG9sbCBpbnRlcnZhbCBpcyAyMDAwbXNcblx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoMjAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tTdHViLmNhbGxDb3VudCwgMSk7XG5cblx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoMjAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tTdHViLmNhbGxDb3VudCwgMik7XG5cblx0XHR0YXNrLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJlamVjdCB3aGVuIHRhc2sgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9ja0hhbmRsZXIgPSB1cGNhc3RQYXJ0aWFsPE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyPih7XG5cdFx0XHRnZXRUYXNrOiBzaW5vbi5zdHViKCkucmVzb2x2ZXMoY3JlYXRlVGFzayh7XG5cdFx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRcdHN0YXR1c01lc3NhZ2U6ICdTb21ldGhpbmcgd2VudCB3cm9uZydcblx0XHRcdH0pKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFzayA9IHN0b3JlLmFkZChuZXcgTWNwVGFzayhjcmVhdGVUYXNrKCkpKTtcblx0XHR0YXNrLnNldEhhbmRsZXIobW9ja0hhbmRsZXIpO1xuXG5cdFx0Ly8gVXBkYXRlIHRvIGZhaWxlZCBzdGF0ZVxuXHRcdHRhc2sub25EaWRVcGRhdGVTdGF0ZShjcmVhdGVUYXNrKHtcblx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRzdGF0dXNNZXNzYWdlOiAnU29tZXRoaW5nIHdlbnQgd3JvbmcnXG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHR0YXNrLnJlc3VsdCxcblx0XHRcdChlcnJvcjogRXJyb3IpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ1Rhc2sgdGFzazEgZmFpbGVkJykpO1xuXHRcdFx0XHRhc3NlcnQub2soZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnU29tZXRoaW5nIHdlbnQgd3JvbmcnKSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjYW5jZWwgd2hlbiB0YXNrIGlzIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXNrID0gc3RvcmUuYWRkKG5ldyBNY3BUYXNrKGNyZWF0ZVRhc2soKSkpO1xuXG5cdFx0Ly8gVXBkYXRlIHRvIGNhbmNlbGxlZCBzdGF0ZVxuXHRcdHRhc2sub25EaWRVcGRhdGVTdGF0ZShjcmVhdGVUYXNrKHsgc3RhdHVzOiAnY2FuY2VsbGVkJyB9KSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdHRhc2sucmVzdWx0LFxuXHRcdFx0KGVycm9yOiBFcnJvcikgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IubmFtZSwgJ0NhbmNlbGVkJyk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjYW5jZWwgd2hlbiBjYW5jZWxsYXRpb24gdG9rZW4gaXMgdHJpZ2dlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgdGFzayA9IHN0b3JlLmFkZChuZXcgTWNwVGFzayhjcmVhdGVUYXNrKCksIGN0cy50b2tlbikpO1xuXG5cdFx0Ly8gQ2FuY2VsIHRoZSB0b2tlblxuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0dGFzay5yZXN1bHQsXG5cdFx0XHQoZXJyb3I6IEVycm9yKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5uYW1lLCAnQ2FuY2VsZWQnKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBUVEwgZXhwaXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNsb2NrLnNldFN5c3RlbVRpbWUobm93KTtcblxuXHRcdGNvbnN0IHRhc2sgPSBzdG9yZS5hZGQobmV3IE1jcFRhc2soY3JlYXRlVGFzayh7IHR0bDogNTAwMCB9KSkpO1xuXG5cdFx0Ly8gQWR2YW5jZSB0aW1lIHBhc3QgVFRMXG5cdFx0YXdhaXQgY2xvY2sudGlja0FzeW5jKDYwMDApO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHR0YXNrLnJlc3VsdCxcblx0XHRcdChlcnJvcjogRXJyb3IpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLm5hbWUsICdDYW5jZWxlZCcpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3RvcCBwb2xsaW5nIHdoZW4gaW4gdGVybWluYWwgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2V0VGFza1N0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0Z2V0VGFza1N0dWIucmVzb2x2ZXMoY3JlYXRlVGFzayh7IHN0YXR1czogJ2NvbXBsZXRlZCcgfSkpO1xuXG5cdFx0Y29uc3QgbW9ja0hhbmRsZXIgPSB1cGNhc3RQYXJ0aWFsPE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyPih7XG5cdFx0XHRnZXRUYXNrOiBnZXRUYXNrU3R1Yixcblx0XHRcdGdldFRhc2tSZXN1bHQ6IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyh7IGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3Jlc3VsdCcgfV0gfSlcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhc2sgPSBzdG9yZS5hZGQobmV3IE1jcFRhc2soY3JlYXRlVGFzayh7IHBvbGxJbnRlcnZhbDogMTAwMCB9KSkpO1xuXHRcdHRhc2suc2V0SGFuZGxlcihtb2NrSGFuZGxlcik7XG5cblx0XHQvLyBVcGRhdGUgdG8gY29tcGxldGVkIHN0YXRlIGltbWVkaWF0ZWx5XG5cdFx0dGFzay5vbkRpZFVwZGF0ZVN0YXRlKGNyZWF0ZVRhc2soeyBzdGF0dXM6ICdjb21wbGV0ZWQnIH0pKTtcblxuXHRcdGF3YWl0IHRhc2sucmVzdWx0O1xuXG5cdFx0Ly8gQWR2YW5jZSB0aW1lIC0gc2hvdWxkIG5vdCBwb2xsIGFueW1vcmVcblx0XHRjb25zdCBpbml0aWFsQ2FsbENvdW50ID0gZ2V0VGFza1N0dWIuY2FsbENvdW50O1xuXHRcdGF3YWl0IGNsb2NrLnRpY2tBc3luYyg1MDAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza1N0dWIuY2FsbENvdW50LCBpbml0aWFsQ2FsbENvdW50KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBoYW5kbGVyIHJlY29ubmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnZXRUYXNrU3R1YjEgPSBzaW5vbi5zdHViKCk7XG5cdFx0Z2V0VGFza1N0dWIxLnJlc29sdmVzKGNyZWF0ZVRhc2soeyBzdGF0dXM6ICd3b3JraW5nJyB9KSk7XG5cblx0XHRjb25zdCBtb2NrSGFuZGxlcjEgPSB1cGNhc3RQYXJ0aWFsPE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyPih7XG5cdFx0XHRnZXRUYXNrOiBnZXRUYXNrU3R1YjEsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YXNrID0gc3RvcmUuYWRkKG5ldyBNY3BUYXNrKGNyZWF0ZVRhc2soeyBwb2xsSW50ZXJ2YWw6IDEwMDAgfSkpKTtcblx0XHR0YXNrLnNldEhhbmRsZXIobW9ja0hhbmRsZXIxKTtcblxuXHRcdC8vIEZpcnN0IHBvbGwgd2l0aCBoYW5kbGVyMVxuXHRcdGF3YWl0IGNsb2NrLnRpY2tBc3luYygxMDAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza1N0dWIxLmNhbGxDb3VudCwgMSk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gYSBuZXcgaGFuZGxlclxuXHRcdGNvbnN0IGdldFRhc2tTdHViMiA9IHNpbm9uLnN0dWIoKTtcblx0XHRnZXRUYXNrU3R1YjIucmVzb2x2ZXMoY3JlYXRlVGFzayh7IHN0YXR1czogJ2NvbXBsZXRlZCcgfSkpO1xuXG5cdFx0Y29uc3QgbW9ja0hhbmRsZXIyID0gdXBjYXN0UGFydGlhbDxNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlcj4oe1xuXHRcdFx0Z2V0VGFzazogZ2V0VGFza1N0dWIyLFxuXHRcdFx0Z2V0VGFza1Jlc3VsdDogc2lub24uc3R1YigpLnJlc29sdmVzKHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAncmVzdWx0JyB9XSB9KVxuXHRcdH0pO1xuXG5cdFx0dGFzay5zZXRIYW5kbGVyKG1vY2tIYW5kbGVyMik7XG5cblx0XHQvLyBTZWNvbmQgcG9sbCB3aXRoIGhhbmRsZXIyXG5cdFx0YXdhaXQgY2xvY2sudGlja0FzeW5jKDEwMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrU3R1YjEuY2FsbENvdW50LCAxKTsgLy8gTm8gbW9yZSBjYWxscyB0byBvbGQgaGFuZGxlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUYXNrU3R1YjIuY2FsbENvdW50LCAxKTsgLy8gTmV3IGhhbmRsZXIgaXMgY2FsbGVkXG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0YXNrLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdyZXN1bHQnIH1dIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IHBvbGwgd2hlbiBoYW5kbGVyIGlzIHVuZGVmaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXNrID0gc3RvcmUuYWRkKG5ldyBNY3BUYXNrKGNyZWF0ZVRhc2soeyBwb2xsSW50ZXJ2YWw6IDEwMDAgfSkpKTtcblxuXHRcdC8vIEFkdmFuY2UgdGltZSAtIHNob3VsZCBub3QgY3Jhc2hcblx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoNTAwMCk7XG5cblx0XHQvLyBOb3cgc2V0IGEgaGFuZGxlciBhbmQgaXQgc2hvdWxkIHN0YXJ0IHBvbGxpbmdcblx0XHRjb25zdCBnZXRUYXNrU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRnZXRUYXNrU3R1Yi5yZXNvbHZlcyhjcmVhdGVUYXNrKHsgc3RhdHVzOiAnY29tcGxldGVkJyB9KSk7XG5cblx0XHRjb25zdCBtb2NrSGFuZGxlciA9IHVwY2FzdFBhcnRpYWw8TWNwU2VydmVyUmVxdWVzdEhhbmRsZXI+KHtcblx0XHRcdGdldFRhc2s6IGdldFRhc2tTdHViLFxuXHRcdFx0Z2V0VGFza1Jlc3VsdDogc2lub24uc3R1YigpLnJlc29sdmVzKHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAncmVzdWx0JyB9XSB9KVxuXHRcdH0pO1xuXG5cdFx0dGFzay5zZXRIYW5kbGVyKG1vY2tIYW5kbGVyKTtcblx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoMTAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tTdHViLmNhbGxDb3VudCwgMSk7XG5cblx0XHR0YXNrLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBpbnB1dF9yZXF1aXJlZCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnZXRUYXNrU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHQvLyBnZXRUYXNrIGNhbGwgcmV0dXJucyBjb21wbGV0ZWQgKHRyaWdnZXJlZCBieSBpbnB1dF9yZXF1aXJlZCBoYW5kbGluZylcblx0XHRnZXRUYXNrU3R1Yi5yZXNvbHZlcyhjcmVhdGVUYXNrKHsgc3RhdHVzOiAnY29tcGxldGVkJyB9KSk7XG5cblx0XHRjb25zdCBtb2NrSGFuZGxlciA9IHVwY2FzdFBhcnRpYWw8TWNwU2VydmVyUmVxdWVzdEhhbmRsZXI+KHtcblx0XHRcdGdldFRhc2s6IGdldFRhc2tTdHViLFxuXHRcdFx0Z2V0VGFza1Jlc3VsdDogc2lub24uc3R1YigpLnJlc29sdmVzKHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAncmVzdWx0JyB9XSB9KVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFzayA9IHN0b3JlLmFkZChuZXcgTWNwVGFzayhjcmVhdGVUYXNrKHsgcG9sbEludGVydmFsOiAxMDAwIH0pKSk7XG5cdFx0dGFzay5zZXRIYW5kbGVyKG1vY2tIYW5kbGVyKTtcblxuXHRcdC8vIFVwZGF0ZSB0byBpbnB1dF9yZXF1aXJlZCAtIHRoaXMgdHJpZ2dlcnMgYSBnZXRUYXNrIGNhbGxcblx0XHR0YXNrLm9uRGlkVXBkYXRlU3RhdGUoY3JlYXRlVGFzayh7IHN0YXR1czogJ2lucHV0X3JlcXVpcmVkJyB9KSk7XG5cblx0XHQvLyBBbGxvdyB0aGUgcHJvbWlzZSB0byBzZXR0bGVcblx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoMCk7XG5cblx0XHQvLyBWZXJpZnkgZ2V0VGFzayB3YXMgY2FsbGVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRhc2tTdHViLmNhbGxDb3VudCwgMSk7XG5cblx0XHQvLyBPbmNlIGdldFRhc2sgcmVzb2x2ZXMgd2l0aCBjb21wbGV0ZWQsIHNob3VsZCBmZXRjaCByZXN1bHRcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0YXNrLnJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdyZXN1bHQnIH1dIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGdldFRhc2sgcmV0dXJuaW5nIGNhbmNlbGxlZCBkdXJpbmcgcG9sbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnZXRUYXNrU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRnZXRUYXNrU3R1Yi5yZXNvbHZlcyhjcmVhdGVUYXNrKHsgc3RhdHVzOiAnY2FuY2VsbGVkJyB9KSk7XG5cblx0XHRjb25zdCBtb2NrSGFuZGxlciA9IHVwY2FzdFBhcnRpYWw8TWNwU2VydmVyUmVxdWVzdEhhbmRsZXI+KHtcblx0XHRcdGdldFRhc2s6IGdldFRhc2tTdHViLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFzayA9IHN0b3JlLmFkZChuZXcgTWNwVGFzayhjcmVhdGVUYXNrKHsgcG9sbEludGVydmFsOiAxMDAwIH0pKSk7XG5cdFx0dGFzay5zZXRIYW5kbGVyKG1vY2tIYW5kbGVyKTtcblxuXHRcdC8vIEFkdmFuY2UgdGltZSB0byB0cmlnZ2VyIHBvbGxpbmdcblx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoMTAwMCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdHRhc2sucmVzdWx0LFxuXHRcdFx0KGVycm9yOiBFcnJvcikgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IubmFtZSwgJ0NhbmNlbGVkJyk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCB0YXNrIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRhc2sgPSBzdG9yZS5hZGQobmV3IE1jcFRhc2soY3JlYXRlVGFzayh7IHRhc2tJZDogJ215LXRhc2staWQnIH0pKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhc2suaWQsICdteS10YXNrLWlkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBkaXNwb3NlIGNsZWFubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2V0VGFza1N0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0Z2V0VGFza1N0dWIucmVzb2x2ZXMoY3JlYXRlVGFzayh7IHN0YXR1czogJ3dvcmtpbmcnIH0pKTtcblxuXHRcdGNvbnN0IG1vY2tIYW5kbGVyID0gdXBjYXN0UGFydGlhbDxNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlcj4oe1xuXHRcdFx0Z2V0VGFzazogZ2V0VGFza1N0dWIsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YXNrID0gc3RvcmUuYWRkKG5ldyBNY3BUYXNrKGNyZWF0ZVRhc2soeyBwb2xsSW50ZXJ2YWw6IDEwMDAgfSkpKTtcblx0XHR0YXNrLnNldEhhbmRsZXIobW9ja0hhbmRsZXIpO1xuXG5cdFx0Ly8gUG9sbCBvbmNlXG5cdFx0YXdhaXQgY2xvY2sudGlja0FzeW5jKDEwMDApO1xuXHRcdGNvbnN0IGNhbGxDb3VudEJlZm9yZURpc3Bvc2UgPSBnZXRUYXNrU3R1Yi5jYWxsQ291bnQ7XG5cblx0XHQvLyBEaXNwb3NlXG5cdFx0dGFzay5kaXNwb3NlKCk7XG5cblx0XHQvLyBBZHZhbmNlIHRpbWUgLSBzaG91bGQgbm90IHBvbGwgYW55bW9yZVxuXHRcdGF3YWl0IGNsb2NrLnRpY2tBc3luYyg1MDAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGFza1N0dWIuY2FsbENvdW50LCBjYWxsQ291bnRCZWZvcmVEaXNwb3NlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixZQUFZLFdBQVc7QUFDdkIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLG9CQUFvQiwwQkFBMEI7QUFFMUUsU0FBUyx5QkFBeUIsZUFBZTtBQUNqRCxTQUFTLDBCQUFnRTtBQUN6RSxTQUFTLFdBQVc7QUFDcEIsU0FBUywr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LFlBQVksV0FBVyxDQUFDO0FBRzNDLFVBQU0sU0FBUyxNQUFNLEtBQUs7QUFDMUIsV0FBTyxnQkFBZ0IsUUFBUSxFQUFFLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxNQUFNLFNBQVMsQ0FBQyxFQUFFLENBQUM7QUFBQSxFQUMvRSxDQUFDO0FBRUQsT0FBSyw0REFBNEQsWUFBWTtBQUM1RSxVQUFNLGNBQWMsTUFBTSxLQUFLO0FBQy9CLGdCQUFZLFNBQVMsV0FBVyxFQUFFLFFBQVEsWUFBWSxDQUFDLENBQUM7QUFFeEQsVUFBTSxjQUFjLGNBQXVDO0FBQUEsTUFDMUQsU0FBUztBQUFBLElBQ1YsQ0FBQztBQUVELFVBQU0sT0FBTyxNQUFNLElBQUksSUFBSSxRQUFRLFdBQVcsRUFBRSxjQUFjLElBQUssQ0FBQyxDQUFDLENBQUM7QUFDdEUsU0FBSyxXQUFXLFdBQVc7QUFHM0IsVUFBTSxNQUFNLFVBQVUsR0FBSTtBQUUxQixVQUFNLE9BQU87QUFBQSxNQUNaLEtBQUs7QUFBQSxNQUNMLENBQUMsVUFBaUI7QUFDakIsZUFBTyxZQUFZLE1BQU0sTUFBTSxVQUFVO0FBQ3pDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0MsVUFBTSxPQUFPLE1BQU0sSUFBSSxJQUFJLFFBQVEsV0FBVyxFQUFFLFFBQVEsYUFBYSxDQUFDLENBQUMsQ0FBQztBQUN4RSxXQUFPLFlBQVksS0FBSyxJQUFJLFlBQVk7QUFBQSxFQUN6QyxDQUFDO0FBRUQsT0FBSywwQkFBMEIsWUFBWTtBQUMxQyxVQUFNLGNBQWMsTUFBTSxLQUFLO0FBQy9CLGdCQUFZLFNBQVMsV0FBVyxFQUFFLFFBQVEsVUFBVSxDQUFDLENBQUM7QUFFdEQsVUFBTSxjQUFjLGNBQXVDO0FBQUEsTUFDMUQsU0FBUztBQUFBLElBQ1YsQ0FBQztBQUVELFVBQU0sT0FBTyxNQUFNLElBQUksSUFBSSxRQUFRLFdBQVcsRUFBRSxjQUFjLElBQUssQ0FBQyxDQUFDLENBQUM7QUFDdEUsU0FBSyxXQUFXLFdBQVc7QUFHM0IsVUFBTSxNQUFNLFVBQVUsR0FBSTtBQUMxQixVQUFNLHlCQUF5QixZQUFZO0FBRzNDLFNBQUssUUFBUTtBQUdiLFVBQU0sTUFBTSxVQUFVLEdBQUk7QUFDMUIsV0FBTyxZQUFZLFlBQVksV0FBVyxzQkFBc0I7QUFBQSxFQUNqRSxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
