import assert from "assert";
import { EventEmitter } from "events";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { McpGatewaySession } from "../../node/mcpGatewaySession.js";
class TestServerResponse extends EventEmitter {
  constructor() {
    super(...arguments);
    this.writes = [];
    this.destroyed = false;
    this.writableEnded = false;
  }
  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }
  write(chunk) {
    this.writes.push(chunk);
    return true;
  }
  end(chunk) {
    if (chunk) {
      this.writes.push(chunk);
    }
    this.writableEnded = true;
    this.destroyed = true;
    this.emit("close");
    return this;
  }
}
suite("McpGatewaySession", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createInvoker() {
    const onDidChangeTools = new Emitter();
    const onDidChangeResources = new Emitter();
    const tools = [{
      name: "test_tool",
      description: "Test tool",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" }
        }
      }
    }];
    const resources = [{
      uri: "file:///test/resource.txt",
      name: "resource.txt"
    }];
    return {
      onDidChangeTools,
      onDidChangeResources,
      invoker: {
        onDidChangeTools: onDidChangeTools.event,
        onDidChangeResources: onDidChangeResources.event,
        listTools: async () => tools,
        callTool: async (_name, args) => ({
          content: [{ type: "text", text: `Hello, ${typeof args.name === "string" ? args.name : "World"}!` }]
        }),
        listResources: async () => resources,
        readResource: async (_uri) => ({
          contents: [{ uri: "file:///test/resource.txt", text: "hello world", mimeType: "text/plain" }]
        }),
        listResourceTemplates: async () => [{ uriTemplate: "file:///test/{name}", name: "Test Template" }]
      }
    };
  }
  test("returns initialize result", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-1", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.jsonrpc, "2.0");
    assert.strictEqual(response.id, 1);
    assert.strictEqual(response.result.protocolVersion, "2025-11-25");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("negotiates to older protocol version when client requests it", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-negotiate-1", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.result.protocolVersion, "2025-03-26");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("negotiates to each supported protocol version", async () => {
    const supportedVersions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"];
    for (const version of supportedVersions) {
      const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
      const session = new McpGatewaySession(`session-ver-${version}`, new NullLogService(), () => {
      }, invoker);
      const responses = await session.handleIncoming({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: version, capabilities: {} }
      });
      const response = responses[0];
      assert.strictEqual(
        response.result.protocolVersion,
        version,
        `Expected server to negotiate to ${version}`
      );
      session.dispose();
      onDidChangeTools.dispose();
      onDidChangeResources.dispose();
    }
  });
  test("falls back to latest version for unsupported client version", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-negotiate-2", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2099-01-01",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.result.protocolVersion, "2025-11-25");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("falls back to latest version when no params provided", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-negotiate-3", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize"
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.result.protocolVersion, "2025-11-25");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("falls back to latest version when protocolVersion is not a string", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-negotiate-4", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: 42,
        capabilities: {}
      }
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.result.protocolVersion, "2025-11-25");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("initialize response includes server info and capabilities", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-init-caps", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} }
    });
    const result = responses[0].result;
    assert.deepStrictEqual(result, {
      protocolVersion: "2025-03-26",
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true }
      },
      serverInfo: {
        name: "VS Code MCP Gateway",
        version: "1.0.0"
      }
    });
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("rejects non-initialize requests before initialized notification", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-2", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.jsonrpc, "2.0");
    assert.strictEqual(response.id, 2);
    assert.strictEqual(response.error.code, -32600);
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("serves tools/list and tools/call after initialized notification", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-3", new NullLogService(), () => {
    }, invoker);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const notificationResponses = await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.strictEqual(notificationResponses.length, 0);
    const listResponses = await session.handleIncoming({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    const listResponse = listResponses[0];
    const tools = listResponse.result.tools;
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].name, "test_tool");
    const callResponses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: {
          name: "VS Code"
        }
      }
    });
    const callResponse = callResponses[0];
    const text = callResponse.result.content[0].text;
    assert.strictEqual(text, "Hello, VS Code!");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("broadcasts notifications to attached SSE clients", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-4", new NullLogService(), () => {
    }, invoker);
    const response = new TestServerResponse();
    session.attachSseClient({}, response);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers?.["Content-Type"], "text/event-stream");
    assert.ok(response.writes.some((chunk) => chunk.includes(": connected")));
    assert.ok(response.writes.some((chunk) => chunk.includes("event: message")));
    assert.ok(response.writes.some((chunk) => chunk.includes("notifications/tools/list_changed")));
    assert.ok(response.writes.some((chunk) => chunk.includes("notifications/resources/list_changed")));
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("emits list changed on tool invoker changes", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-5", new NullLogService(), () => {
    }, invoker);
    const response = new TestServerResponse();
    session.attachSseClient({}, response);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const writesBefore = response.writes.length;
    onDidChangeTools.fire();
    assert.ok(response.writes.length > writesBefore);
    assert.ok(response.writes.slice(writesBefore).some((chunk) => chunk.includes("notifications/tools/list_changed")));
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("disposes attached SSE clients and callback", () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    let disposed = false;
    const session = new McpGatewaySession("session-6", new NullLogService(), () => {
      disposed = true;
    }, invoker);
    const response = new TestServerResponse();
    session.attachSseClient({}, response);
    session.dispose();
    assert.strictEqual(response.writableEnded, true);
    assert.strictEqual(disposed, true);
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("emits resources list changed on resource invoker changes", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-7", new NullLogService(), () => {
    }, invoker);
    const response = new TestServerResponse();
    session.attachSseClient({}, response);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const writesBefore = response.writes.length;
    onDidChangeResources.fire();
    assert.ok(response.writes.length > writesBefore);
    assert.ok(response.writes.slice(writesBefore).some((chunk) => chunk.includes("notifications/resources/list_changed")));
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("serves resources/list with raw URIs", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-8", new NullLogService(), () => {
    }, invoker);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const responses = await session.handleIncoming({ jsonrpc: "2.0", id: 2, method: "resources/list" });
    const response = responses[0];
    const resources = response.result.resources;
    assert.strictEqual(resources.length, 1);
    assert.strictEqual(resources[0].uri, "file:///test/resource.txt");
    assert.strictEqual(resources[0].name, "resource.txt");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("serves resources/read with raw URIs", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-9", new NullLogService(), () => {
    }, invoker);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/read",
      params: { uri: "file:///test/resource.txt" }
    });
    const response = responses[0];
    const contents = response.result.contents;
    assert.strictEqual(contents.length, 1);
    assert.strictEqual(contents[0].uri, "file:///test/resource.txt");
    assert.strictEqual(contents[0].text, "hello world");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("serves resources/templates/list with raw URI templates", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-10", new NullLogService(), () => {
    }, invoker);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const responses = await session.handleIncoming({ jsonrpc: "2.0", id: 2, method: "resources/templates/list" });
    const response = responses[0];
    const templates = response.result.resourceTemplates;
    assert.strictEqual(templates.length, 1);
    assert.strictEqual(templates[0].uriTemplate, "file:///test/{name}");
    assert.strictEqual(templates[0].name, "Test Template");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWNwXFx0ZXN0XFxub2RlXFxtY3BHYXRld2F5U2Vzc2lvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSnNvblJwY0Vycm9yUmVzcG9uc2UsIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblJwY1Byb3RvY29sLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNQ1AgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTWNwR2F0ZXdheVNlc3Npb24gfSBmcm9tICcuLi8uLi9ub2RlL21jcEdhdGV3YXlTZXNzaW9uLmpzJztcblxuY2xhc3MgVGVzdFNlcnZlclJlc3BvbnNlIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcblx0cHVibGljIHN0YXR1c0NvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHVibGljIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSB3cml0ZXM6IHN0cmluZ1tdID0gW107XG5cdHB1YmxpYyBkZXN0cm95ZWQgPSBmYWxzZTtcblx0cHVibGljIHdyaXRhYmxlRW5kZWQgPSBmYWxzZTtcblxuXHR3cml0ZUhlYWQoc3RhdHVzQ29kZTogbnVtYmVyLCBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPikge1xuXHRcdHRoaXMuc3RhdHVzQ29kZSA9IHN0YXR1c0NvZGU7XG5cdFx0dGhpcy5oZWFkZXJzID0gaGVhZGVycztcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHdyaXRlKGNodW5rOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHR0aGlzLndyaXRlcy5wdXNoKGNodW5rKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGVuZChjaHVuaz86IHN0cmluZyk6IHRoaXMge1xuXHRcdGlmIChjaHVuaykge1xuXHRcdFx0dGhpcy53cml0ZXMucHVzaChjaHVuayk7XG5cdFx0fVxuXG5cdFx0dGhpcy53cml0YWJsZUVuZGVkID0gdHJ1ZTtcblx0XHR0aGlzLmRlc3Ryb3llZCA9IHRydWU7XG5cdFx0dGhpcy5lbWl0KCdjbG9zZScpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59XG5cbnN1aXRlKCdNY3BHYXRld2F5U2Vzc2lvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlSW52b2tlcigpIHtcblx0XHRjb25zdCBvbkRpZENoYW5nZVRvb2xzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVJlc291cmNlcyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgdG9vbHM6IHJlYWRvbmx5IE1DUC5Ub29sW10gPSBbe1xuXHRcdFx0bmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3QgdG9vbCcsXG5cdFx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycgfVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fV07XG5cblx0XHRjb25zdCByZXNvdXJjZXM6IHJlYWRvbmx5IE1DUC5SZXNvdXJjZVtdID0gW3tcblx0XHRcdHVyaTogJ2ZpbGU6Ly8vdGVzdC9yZXNvdXJjZS50eHQnLFxuXHRcdFx0bmFtZTogJ3Jlc291cmNlLnR4dCcsXG5cdFx0fV07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2VUb29scyxcblx0XHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLFxuXHRcdFx0aW52b2tlcjoge1xuXHRcdFx0XHRvbkRpZENoYW5nZVRvb2xzOiBvbkRpZENoYW5nZVRvb2xzLmV2ZW50LFxuXHRcdFx0XHRvbkRpZENoYW5nZVJlc291cmNlczogb25EaWRDaGFuZ2VSZXNvdXJjZXMuZXZlbnQsXG5cdFx0XHRcdGxpc3RUb29sczogYXN5bmMgKCkgPT4gdG9vbHMsXG5cdFx0XHRcdGNhbGxUb29sOiBhc3luYyAoX25hbWU6IHN0cmluZywgYXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+ICh7XG5cdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3RleHQnIGFzIGNvbnN0LCB0ZXh0OiBgSGVsbG8sICR7dHlwZW9mIGFyZ3MubmFtZSA9PT0gJ3N0cmluZycgPyBhcmdzLm5hbWUgOiAnV29ybGQnfSFgIH1dXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRsaXN0UmVzb3VyY2VzOiBhc3luYyAoKSA9PiByZXNvdXJjZXMsXG5cdFx0XHRcdHJlYWRSZXNvdXJjZTogYXN5bmMgKF91cmk6IHN0cmluZykgPT4gKHtcblx0XHRcdFx0XHRjb250ZW50czogW3sgdXJpOiAnZmlsZTovLy90ZXN0L3Jlc291cmNlLnR4dCcsIHRleHQ6ICdoZWxsbyB3b3JsZCcsIG1pbWVUeXBlOiAndGV4dC9wbGFpbicgfV0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRsaXN0UmVzb3VyY2VUZW1wbGF0ZXM6IGFzeW5jICgpID0+IFt7IHVyaVRlbXBsYXRlOiAnZmlsZTovLy90ZXN0L3tuYW1lfScsIG5hbWU6ICdUZXN0IFRlbXBsYXRlJyB9XSxcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0dGVzdCgncmV0dXJucyBpbml0aWFsaXplIHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi0xJywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cblx0XHRjb25zdCByZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDEsXG5cdFx0XHRtZXRob2Q6ICdpbml0aWFsaXplJyxcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRwcm90b2NvbFZlcnNpb246ICcyMDI1LTExLTI1Jyxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7fSxcblx0XHRcdFx0Y2xpZW50SW5mbzogeyBuYW1lOiAndGVzdC1jbGllbnQnLCB2ZXJzaW9uOiAnMS4wLjAnIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5qc29ucnBjLCAnMi4wJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlkLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3BvbnNlLnJlc3VsdCBhcyB7IHByb3RvY29sVmVyc2lvbjogc3RyaW5nIH0pLnByb3RvY29sVmVyc2lvbiwgJzIwMjUtMTEtMjUnKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25lZ290aWF0ZXMgdG8gb2xkZXIgcHJvdG9jb2wgdmVyc2lvbiB3aGVuIGNsaWVudCByZXF1ZXN0cyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi1uZWdvdGlhdGUtMScsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAxLFxuXHRcdFx0bWV0aG9kOiAnaW5pdGlhbGl6ZScsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiAnMjAyNS0wMy0yNicsXG5cdFx0XHRcdGNhcGFiaWxpdGllczoge30sXG5cdFx0XHRcdGNsaWVudEluZm86IHsgbmFtZTogJ3Rlc3QtY2xpZW50JywgdmVyc2lvbjogJzEuMC4wJyB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZXMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlc3BvbnNlc1swXSBhcyBJSnNvblJwY1N1Y2Nlc3NSZXNwb25zZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3BvbnNlLnJlc3VsdCBhcyB7IHByb3RvY29sVmVyc2lvbjogc3RyaW5nIH0pLnByb3RvY29sVmVyc2lvbiwgJzIwMjUtMDMtMjYnKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25lZ290aWF0ZXMgdG8gZWFjaCBzdXBwb3J0ZWQgcHJvdG9jb2wgdmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdXBwb3J0ZWRWZXJzaW9ucyA9IFsnMjAyNS0xMS0yNScsICcyMDI1LTA2LTE4JywgJzIwMjUtMDMtMjYnLCAnMjAyNC0xMS0wNScsICcyMDI0LTEwLTA3J107XG5cdFx0Zm9yIChjb25zdCB2ZXJzaW9uIG9mIHN1cHBvcnRlZFZlcnNpb25zKSB7XG5cdFx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE1jcEdhdGV3YXlTZXNzaW9uKGBzZXNzaW9uLXZlci0ke3ZlcnNpb259YCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlcyA9IGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoe1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IDEsXG5cdFx0XHRcdG1ldGhvZDogJ2luaXRpYWxpemUnLFxuXHRcdFx0XHRwYXJhbXM6IHsgcHJvdG9jb2xWZXJzaW9uOiB2ZXJzaW9uLCBjYXBhYmlsaXRpZXM6IHt9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdChyZXNwb25zZS5yZXN1bHQgYXMgeyBwcm90b2NvbFZlcnNpb246IHN0cmluZyB9KS5wcm90b2NvbFZlcnNpb24sXG5cdFx0XHRcdHZlcnNpb24sXG5cdFx0XHRcdGBFeHBlY3RlZCBzZXJ2ZXIgdG8gbmVnb3RpYXRlIHRvICR7dmVyc2lvbn1gXG5cdFx0XHQpO1xuXHRcdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gbGF0ZXN0IHZlcnNpb24gZm9yIHVuc3VwcG9ydGVkIGNsaWVudCB2ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW52b2tlciwgb25EaWRDaGFuZ2VUb29scywgb25EaWRDaGFuZ2VSZXNvdXJjZXMgfSA9IGNyZWF0ZUludm9rZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE1jcEdhdGV3YXlTZXNzaW9uKCdzZXNzaW9uLW5lZ290aWF0ZS0yJywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cblx0XHRjb25zdCByZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDEsXG5cdFx0XHRtZXRob2Q6ICdpbml0aWFsaXplJyxcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRwcm90b2NvbFZlcnNpb246ICcyMDk5LTAxLTAxJyxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7fSxcblx0XHRcdFx0Y2xpZW50SW5mbzogeyBuYW1lOiAndGVzdC1jbGllbnQnLCB2ZXJzaW9uOiAnMS4wLjAnIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzcG9uc2UucmVzdWx0IGFzIHsgcHJvdG9jb2xWZXJzaW9uOiBzdHJpbmcgfSkucHJvdG9jb2xWZXJzaW9uLCAnMjAyNS0xMS0yNScpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlVG9vbHMuZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBsYXRlc3QgdmVyc2lvbiB3aGVuIG5vIHBhcmFtcyBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi1uZWdvdGlhdGUtMycsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAxLFxuXHRcdFx0bWV0aG9kOiAnaW5pdGlhbGl6ZScsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2VzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXNwb25zZS5yZXN1bHQgYXMgeyBwcm90b2NvbFZlcnNpb246IHN0cmluZyB9KS5wcm90b2NvbFZlcnNpb24sICcyMDI1LTExLTI1Jyk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGxhdGVzdCB2ZXJzaW9uIHdoZW4gcHJvdG9jb2xWZXJzaW9uIGlzIG5vdCBhIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi1uZWdvdGlhdGUtNCcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAxLFxuXHRcdFx0bWV0aG9kOiAnaW5pdGlhbGl6ZScsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiA0Mixcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2VzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXNwb25zZS5yZXN1bHQgYXMgeyBwcm90b2NvbFZlcnNpb246IHN0cmluZyB9KS5wcm90b2NvbFZlcnNpb24sICcyMDI1LTExLTI1Jyk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplIHJlc3BvbnNlIGluY2x1ZGVzIHNlcnZlciBpbmZvIGFuZCBjYXBhYmlsaXRpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24taW5pdC1jYXBzJywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cblx0XHRjb25zdCByZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDEsXG5cdFx0XHRtZXRob2Q6ICdpbml0aWFsaXplJyxcblx0XHRcdHBhcmFtczogeyBwcm90b2NvbFZlcnNpb246ICcyMDI1LTAzLTI2JywgY2FwYWJpbGl0aWVzOiB7fSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gKHJlc3BvbnNlc1swXSBhcyBJSnNvblJwY1N1Y2Nlc3NSZXNwb25zZSkucmVzdWx0IGFzIE1DUC5Jbml0aWFsaXplUmVzdWx0O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRwcm90b2NvbFZlcnNpb246ICcyMDI1LTAzLTI2Jyxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHR0b29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LFxuXHRcdFx0XHRyZXNvdXJjZXM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0XHRzZXJ2ZXJJbmZvOiB7XG5cdFx0XHRcdG5hbWU6ICdWUyBDb2RlIE1DUCBHYXRld2F5Jyxcblx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG5vbi1pbml0aWFsaXplIHJlcXVlc3RzIGJlZm9yZSBpbml0aWFsaXplZCBub3RpZmljYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tMicsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAyLFxuXHRcdFx0bWV0aG9kOiAndG9vbHMvbGlzdCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2VzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZXNbMF0gYXMgSUpzb25ScGNFcnJvclJlc3BvbnNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5qc29ucnBjLCAnMi4wJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlkLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuZXJyb3IuY29kZSwgLTMyNjAwKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZlcyB0b29scy9saXN0IGFuZCB0b29scy9jYWxsIGFmdGVyIGluaXRpYWxpemVkIG5vdGlmaWNhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi0zJywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBtZXRob2Q6ICdpbml0aWFsaXplJyB9KTtcblx0XHRjb25zdCBub3RpZmljYXRpb25SZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvaW5pdGlhbGl6ZWQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25SZXNwb25zZXMubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IGxpc3RSZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAzLCBtZXRob2Q6ICd0b29scy9saXN0JyB9KTtcblx0XHRjb25zdCBsaXN0UmVzcG9uc2UgPSBsaXN0UmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGNvbnN0IHRvb2xzID0gKGxpc3RSZXNwb25zZS5yZXN1bHQgYXMgeyB0b29sczogQXJyYXk8eyBuYW1lOiBzdHJpbmcgfT4gfSkudG9vbHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzWzBdLm5hbWUsICd0ZXN0X3Rvb2wnKTtcblxuXHRcdGNvbnN0IGNhbGxSZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDQsXG5cdFx0XHRtZXRob2Q6ICd0b29scy9jYWxsJyxcblx0XHRcdHBhcmFtczoge1xuXHRcdFx0XHRuYW1lOiAndGVzdF90b29sJyxcblx0XHRcdFx0YXJndW1lbnRzOiB7XG5cdFx0XHRcdFx0bmFtZTogJ1ZTIENvZGUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNhbGxSZXNwb25zZSA9IGNhbGxSZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2U7XG5cdFx0Y29uc3QgdGV4dCA9ICgoY2FsbFJlc3BvbnNlLnJlc3VsdCBhcyB7IGNvbnRlbnQ6IEFycmF5PHsgdGV4dDogc3RyaW5nIH0+IH0pLmNvbnRlbnRbMF0udGV4dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHQsICdIZWxsbywgVlMgQ29kZSEnKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jyb2FkY2FzdHMgbm90aWZpY2F0aW9ucyB0byBhdHRhY2hlZCBTU0UgY2xpZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi00JywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBuZXcgVGVzdFNlcnZlclJlc3BvbnNlKCk7XG5cblx0XHRzZXNzaW9uLmF0dGFjaFNzZUNsaWVudCh7fSBhcyBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzcG9uc2UgYXMgdW5rbm93biBhcyBodHRwLlNlcnZlclJlc3BvbnNlKTtcblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBtZXRob2Q6ICdpbml0aWFsaXplJyB9KTtcblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvaW5pdGlhbGl6ZWQnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmhlYWRlcnM/LlsnQ29udGVudC1UeXBlJ10sICd0ZXh0L2V2ZW50LXN0cmVhbScpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZS53cml0ZXMuc29tZShjaHVuayA9PiBjaHVuay5pbmNsdWRlcygnOiBjb25uZWN0ZWQnKSkpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZS53cml0ZXMuc29tZShjaHVuayA9PiBjaHVuay5pbmNsdWRlcygnZXZlbnQ6IG1lc3NhZ2UnKSkpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZS53cml0ZXMuc29tZShjaHVuayA9PiBjaHVuay5pbmNsdWRlcygnbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWQnKSkpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZS53cml0ZXMuc29tZShjaHVuayA9PiBjaHVuay5pbmNsdWRlcygnbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvbGlzdF9jaGFuZ2VkJykpKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIGxpc3QgY2hhbmdlZCBvbiB0b29sIGludm9rZXIgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi01JywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBuZXcgVGVzdFNlcnZlclJlc3BvbnNlKCk7XG5cblx0XHRzZXNzaW9uLmF0dGFjaFNzZUNsaWVudCh7fSBhcyBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzcG9uc2UgYXMgdW5rbm93biBhcyBodHRwLlNlcnZlclJlc3BvbnNlKTtcblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBtZXRob2Q6ICdpbml0aWFsaXplJyB9KTtcblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvaW5pdGlhbGl6ZWQnIH0pO1xuXG5cdFx0Y29uc3Qgd3JpdGVzQmVmb3JlID0gcmVzcG9uc2Uud3JpdGVzLmxlbmd0aDtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmZpcmUoKTtcblxuXHRcdGFzc2VydC5vayhyZXNwb25zZS53cml0ZXMubGVuZ3RoID4gd3JpdGVzQmVmb3JlKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2Uud3JpdGVzLnNsaWNlKHdyaXRlc0JlZm9yZSkuc29tZShjaHVuayA9PiBjaHVuay5pbmNsdWRlcygnbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWQnKSkpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlVG9vbHMuZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZXMgYXR0YWNoZWQgU1NFIGNsaWVudHMgYW5kIGNhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW52b2tlciwgb25EaWRDaGFuZ2VUb29scywgb25EaWRDaGFuZ2VSZXNvdXJjZXMgfSA9IGNyZWF0ZUludm9rZXIoKTtcblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE1jcEdhdGV3YXlTZXNzaW9uKCdzZXNzaW9uLTYnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHRcdH0sIGludm9rZXIpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gbmV3IFRlc3RTZXJ2ZXJSZXNwb25zZSgpO1xuXG5cdFx0c2Vzc2lvbi5hdHRhY2hTc2VDbGllbnQoe30gYXMgaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlc3BvbnNlIGFzIHVua25vd24gYXMgaHR0cC5TZXJ2ZXJSZXNwb25zZSk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2Uud3JpdGFibGVFbmRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkLCB0cnVlKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIHJlc291cmNlcyBsaXN0IGNoYW5nZWQgb24gcmVzb3VyY2UgaW52b2tlciBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW52b2tlciwgb25EaWRDaGFuZ2VUb29scywgb25EaWRDaGFuZ2VSZXNvdXJjZXMgfSA9IGNyZWF0ZUludm9rZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE1jcEdhdGV3YXlTZXNzaW9uKCdzZXNzaW9uLTcnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKCkgPT4geyB9LCBpbnZva2VyKTtcblx0XHRjb25zdCByZXNwb25zZSA9IG5ldyBUZXN0U2VydmVyUmVzcG9uc2UoKTtcblxuXHRcdHNlc3Npb24uYXR0YWNoU3NlQ2xpZW50KHt9IGFzIGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXNwb25zZSBhcyB1bmtub3duIGFzIGh0dHAuU2VydmVyUmVzcG9uc2UpO1xuXHRcdGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIG1ldGhvZDogJ2luaXRpYWxpemUnIH0pO1xuXHRcdGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoeyBqc29ucnBjOiAnMi4wJywgbWV0aG9kOiAnbm90aWZpY2F0aW9ucy9pbml0aWFsaXplZCcgfSk7XG5cblx0XHRjb25zdCB3cml0ZXNCZWZvcmUgPSByZXNwb25zZS53cml0ZXMubGVuZ3RoO1xuXHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmZpcmUoKTtcblxuXHRcdGFzc2VydC5vayhyZXNwb25zZS53cml0ZXMubGVuZ3RoID4gd3JpdGVzQmVmb3JlKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2Uud3JpdGVzLnNsaWNlKHdyaXRlc0JlZm9yZSkuc29tZShjaHVuayA9PiBjaHVuay5pbmNsdWRlcygnbm90aWZpY2F0aW9ucy9yZXNvdXJjZXMvbGlzdF9jaGFuZ2VkJykpKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZlcyByZXNvdXJjZXMvbGlzdCB3aXRoIHJhdyBVUklzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW52b2tlciwgb25EaWRDaGFuZ2VUb29scywgb25EaWRDaGFuZ2VSZXNvdXJjZXMgfSA9IGNyZWF0ZUludm9rZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE1jcEdhdGV3YXlTZXNzaW9uKCdzZXNzaW9uLTgnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKCkgPT4geyB9LCBpbnZva2VyKTtcblxuXHRcdGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIG1ldGhvZDogJ2luaXRpYWxpemUnIH0pO1xuXHRcdGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoeyBqc29ucnBjOiAnMi4wJywgbWV0aG9kOiAnbm90aWZpY2F0aW9ucy9pbml0aWFsaXplZCcgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAyLCBtZXRob2Q6ICdyZXNvdXJjZXMvbGlzdCcgfSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2U7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gKHJlc3BvbnNlLnJlc3VsdCBhcyB7IHJlc291cmNlczogQXJyYXk8eyB1cmk6IHN0cmluZzsgbmFtZTogc3RyaW5nIH0+IH0pLnJlc291cmNlcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb3VyY2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc291cmNlc1swXS51cmksICdmaWxlOi8vL3Rlc3QvcmVzb3VyY2UudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc291cmNlc1swXS5uYW1lLCAncmVzb3VyY2UudHh0Jyk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXMgcmVzb3VyY2VzL3JlYWQgd2l0aCByYXcgVVJJcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi05JywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBtZXRob2Q6ICdpbml0aWFsaXplJyB9KTtcblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvaW5pdGlhbGl6ZWQnIH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAyLFxuXHRcdFx0bWV0aG9kOiAncmVzb3VyY2VzL3JlYWQnLFxuXHRcdFx0cGFyYW1zOiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC9yZXNvdXJjZS50eHQnIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2U7XG5cdFx0Y29uc3QgY29udGVudHMgPSAocmVzcG9uc2UucmVzdWx0IGFzIHsgY29udGVudHM6IEFycmF5PHsgdXJpOiBzdHJpbmc7IHRleHQ6IHN0cmluZyB9PiB9KS5jb250ZW50cztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudHNbMF0udXJpLCAnZmlsZTovLy90ZXN0L3Jlc291cmNlLnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50c1swXS50ZXh0LCAnaGVsbG8gd29ybGQnKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZlcyByZXNvdXJjZXMvdGVtcGxhdGVzL2xpc3Qgd2l0aCByYXcgVVJJIHRlbXBsYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi0xMCcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgbWV0aG9kOiAnaW5pdGlhbGl6ZScgfSk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBtZXRob2Q6ICdub3RpZmljYXRpb25zL2luaXRpYWxpemVkJyB9KTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlcyA9IGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDIsIG1ldGhvZDogJ3Jlc291cmNlcy90ZW1wbGF0ZXMvbGlzdCcgfSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2U7XG5cdFx0Y29uc3QgdGVtcGxhdGVzID0gKHJlc3BvbnNlLnJlc3VsdCBhcyB7IHJlc291cmNlVGVtcGxhdGVzOiBBcnJheTx7IHVyaVRlbXBsYXRlOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9PiB9KS5yZXNvdXJjZVRlbXBsYXRlcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVtcGxhdGVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlbXBsYXRlc1swXS51cmlUZW1wbGF0ZSwgJ2ZpbGU6Ly8vdGVzdC97bmFtZX0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVtcGxhdGVzWzBdLm5hbWUsICdUZXN0IFRlbXBsYXRlJyk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUV4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLDJCQUEyQixhQUFhO0FBQUEsRUFBOUM7QUFBQTtBQUdDLFNBQWdCLFNBQW1CLENBQUM7QUFDcEMsU0FBTyxZQUFZO0FBQ25CLFNBQU8sZ0JBQWdCO0FBQUE7QUFBQSxFQUV2QixVQUFVLFlBQW9CLFNBQWtDO0FBQy9ELFNBQUssYUFBYTtBQUNsQixTQUFLLFVBQVU7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxPQUF3QjtBQUM3QixTQUFLLE9BQU8sS0FBSyxLQUFLO0FBQ3RCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxJQUFJLE9BQXNCO0FBQ3pCLFFBQUksT0FBTztBQUNWLFdBQUssT0FBTyxLQUFLLEtBQUs7QUFBQSxJQUN2QjtBQUVBLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssWUFBWTtBQUNqQixTQUFLLEtBQUssT0FBTztB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
