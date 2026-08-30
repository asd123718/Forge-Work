import assert from "assert";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ContributionEnablementState } from "../../../chat/common/enablement.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { McpGatewayToolBrokerChannel } from "../../common/mcpGatewayToolBrokerChannel.js";
import { McpConnectionState, McpServerCacheState, McpToolVisibility } from "../../common/mcpTypes.js";
import { TestMcpService } from "./testMcpService.js";
suite("McpGatewayToolBrokerChannel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("lists model-visible tools for a specific server", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const serverA = createServer("collectionA", "serverA", [
      createTool("mcp_serverA_echo", async () => ({ content: [{ type: "text", text: "A" }] })),
      createTool("app-only", async () => ({ content: [{ type: "text", text: "A2" }] }), McpToolVisibility.App)
    ]);
    const serverB = createServer("collectionB", "serverB", [
      createTool("mcp_serverB_echo", async () => ({ content: [{ type: "text", text: "B" }] }))
    ]);
    mcpService.servers.set([serverA, serverB], void 0);
    const resultA = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
    assert.deepStrictEqual(resultA.map((t) => t.name), ["mcp_serverA_echo"]);
    const resultB = await channel.call(void 0, "listToolsForServer", { serverId: "serverB" });
    assert.deepStrictEqual(resultB.map((t) => t.name), ["mcp_serverB_echo"]);
    channel.dispose();
  });
  test("routes tool calls to specific server", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const invoked = [];
    const serverA = createServer("collectionA", "serverA", [
      createTool("mcp_serverA_echo", async (args) => {
        invoked.push(`A:${String(args.name)}`);
        return { content: [{ type: "text", text: "from A" }] };
      })
    ]);
    const serverB = createServer("collectionB", "serverB", [
      createTool("mcp_serverB_echo", async (args) => {
        invoked.push(`B:${String(args.name)}`);
        return { content: [{ type: "text", text: "from B" }] };
      })
    ]);
    mcpService.servers.set([serverA, serverB], void 0);
    const resultA = await channel.call(void 0, "callToolForServer", {
      serverId: "serverA",
      name: "mcp_serverA_echo",
      args: { name: "one" }
    });
    const resultB = await channel.call(void 0, "callToolForServer", {
      serverId: "serverB",
      name: "mcp_serverB_echo",
      args: { name: "two" }
    });
    assert.deepStrictEqual(invoked, ["A:one", "B:two"]);
    assert.strictEqual(resultA.content[0].text, "from A");
    assert.strictEqual(resultB.content[0].text, "from B");
    channel.dispose();
  });
  test("emits onDidChangeTools when tool lists change", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const server = createServer("collectionA", "serverA", [
      createTool("echo", async () => ({ content: [{ type: "text", text: "A" }] }))
    ]);
    mcpService.servers.set([server], void 0);
    let events = 0;
    const disposable = channel.listen(void 0, "onDidChangeTools")(() => {
      events++;
    });
    server.toolsValue.set([
      createTool("echo", async () => ({ content: [{ type: "text", text: "A" }] })),
      createTool("echo2", async () => ({ content: [{ type: "text", text: "A2" }] }))
    ], void 0);
    assert.ok(events >= 1);
    disposable.dispose();
    channel.dispose();
  });
  test("does not start server when cache state is live", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const server = createServer(
      "collectionA",
      "serverA",
      [createTool("echo", async () => ({ content: [{ type: "text", text: "A" }] }))],
      McpServerCacheState.Live
    );
    mcpService.servers.set([server], void 0);
    await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
    assert.strictEqual(server.startCalls, 0);
    channel.dispose();
  });
  test("starts server when cache state is unknown", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const server = createServer(
      "collectionA",
      "serverA",
      [createTool("echo", async () => ({ content: [{ type: "text", text: "A" }] }))],
      McpServerCacheState.Unknown
    );
    mcpService.servers.set([server], void 0);
    const tools = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
    assert.strictEqual(server.startCalls, 1);
    assert.deepStrictEqual(tools.map((t) => t.name), ["echo"]);
    channel.dispose();
  });
  test("starts server and waits within grace period when cache state is outdated", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const server = createServer(
      "collectionA",
      "serverA",
      [createTool("echo", async () => ({ content: [{ type: "text", text: "A" }] }))],
      McpServerCacheState.Outdated
    );
    mcpService.servers.set([server], void 0);
    const tools = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
    assert.strictEqual(server.startCalls, 1);
    assert.deepStrictEqual(tools.map((t) => t.name), ["echo"]);
    channel.dispose();
  });
  test("returns empty tools and does not re-wait if server does not start within grace period", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const mcpService = new TestMcpService();
      const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);
      const server = createNeverStartingServer(
        "collectionA",
        "serverA",
        [createTool("echo", async () => ({ content: [{ type: "text", text: "A" }] }))]
      );
      mcpService.servers.set([server], void 0);
      const tools = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
      assert.deepStrictEqual(tools, []);
      const tools2 = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
      assert.deepStrictEqual(tools2, []);
      channel.dispose();
    });
  });
  test("invalidates stale grace entry when cacheState regresses to Unknown after timeout", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const mcpService = new TestMcpService();
      const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);
      const server = createNeverStartingServer(
        "collectionA",
        "serverA",
        [createTool("echo", async () => ({ content: [{ type: "text", text: "A" }] }))]
      );
      mcpService.servers.set([server], void 0);
      const tools1 = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
      assert.deepStrictEqual(tools1, []);
      assert.strictEqual(server.startCalls, 1);
      server.cacheStateValue.set(McpServerCacheState.Unknown, void 0);
      server.startBehavior = "succeed";
      const tools2 = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
      assert.deepStrictEqual(tools2.map((t) => t.name), ["echo"]);
      assert.strictEqual(server.startCalls, 2);
      channel.dispose();
    });
  });
  test("does not invalidate grace entry when cacheState is not Unknown/Outdated", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const mcpService = new TestMcpService();
      const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);
      const server = createServer(
        "collectionA",
        "serverA",
        [createTool("echo", async () => ({ content: [{ type: "text", text: "A" }] }))],
        McpServerCacheState.Unknown
      );
      mcpService.servers.set([server], void 0);
      const tools1 = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
      assert.deepStrictEqual(tools1.map((t) => t.name), ["echo"]);
      assert.strictEqual(server.startCalls, 1);
      const tools2 = await channel.call(void 0, "listToolsForServer", { serverId: "serverA" });
      assert.deepStrictEqual(tools2.map((t) => t.name), ["echo"]);
      assert.strictEqual(server.startCalls, 1);
      channel.dispose();
    });
  });
  test("listServers returns all servers regardless of cache state", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const liveServer = createServer("collectionA", "serverA", [], McpServerCacheState.Live);
    const unknownServer = createServer("collectionB", "serverB", [], McpServerCacheState.Unknown);
    mcpService.servers.set([liveServer, unknownServer], void 0);
    const servers = await channel.call(void 0, "listServers");
    assert.deepStrictEqual(servers, [
      { id: "serverA", label: "serverA" },
      { id: "serverB", label: "serverB" }
    ]);
    channel.dispose();
  });
  test("forwards chatSessionResource as tool call context", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const receivedContexts = [];
    const server = createServer("collectionA", "serverA", [
      createToolWithContextCapture("echo", receivedContexts, async () => ({ content: [{ type: "text", text: "ok" }] }))
    ]);
    mcpService.servers.set([server], void 0);
    const sessionUri = "vscode-chat-session://test/session-123";
    await channel.call(void 0, "callToolForServer", {
      serverId: "serverA",
      name: "echo",
      args: { input: "hello" },
      chatSessionResource: sessionUri
    });
    assert.strictEqual(receivedContexts.length, 1);
    assert.ok(receivedContexts[0]);
    assert.strictEqual(receivedContexts[0].chatSessionResource.toString(), URI.parse(sessionUri).toString());
    channel.dispose();
  });
  test("passes undefined context when chatSessionResource is omitted", async () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const receivedContexts = [];
    const server = createServer("collectionA", "serverA", [
      createToolWithContextCapture("echo", receivedContexts, async () => ({ content: [{ type: "text", text: "ok" }] }))
    ]);
    mcpService.servers.set([server], void 0);
    await channel.call(void 0, "callToolForServer", {
      serverId: "serverA",
      name: "echo",
      args: { input: "hello" }
    });
    assert.strictEqual(receivedContexts.length, 1);
    assert.strictEqual(receivedContexts[0], void 0);
    channel.dispose();
  });
  test("emits onDidChangeServers with descriptors when servers change", () => {
    const mcpService = new TestMcpService();
    const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
    const serverA = createServer("collectionA", "serverA", []);
    mcpService.servers.set([serverA], void 0);
    const received = [];
    const disposable = channel.listen(void 0, "onDidChangeServers")((e) => {
      received.push(e);
    });
    const serverB = createServer("collectionB", "serverB", []);
    mcpService.servers.set([serverA, serverB], void 0);
    assert.strictEqual(received.length, 1);
    assert.deepStrictEqual(received[0], [
      { id: "serverA", label: "serverA" },
      { id: "serverB", label: "serverB" }
    ]);
    mcpService.servers.set([serverB], void 0);
    assert.strictEqual(received.length, 2);
    assert.deepStrictEqual(received[1], [
      { id: "serverB", label: "serverB" }
    ]);
    disposable.dispose();
    channel.dispose();
  });
});
function createServer(collectionId, definitionId, initialTools, initialCacheState = McpServerCacheState.Live) {
  const owner = {};
  const tools = observableValue(owner, initialTools);
  const connectionState = observableValue(owner, { state: McpConnectionState.Kind.Running });
  const cacheState = observableValue(owner, initialCacheState);
  let startCalls = 0;
  return {
    collection: { id: collectionId, label: collectionId, order: 0 },
    definition: { id: definitionId, label: definitionId },
    connection: observableValue(owner, void 0),
    connectionState,
    enablement: observableValue(owner, ContributionEnablementState.EnabledProfile),
    serverMetadata: observableValue(owner, void 0),
    readDefinitions: () => observableValue(owner, { server: void 0, collection: void 0 }),
    showOutput: async () => {
    },
    start: async () => {
      startCalls++;
      cacheState.set(McpServerCacheState.Live, void 0);
      return { state: McpConnectionState.Kind.Running };
    },
    stop: async () => {
    },
    cacheState,
    tools,
    prompts: observableValue(owner, []),
    capabilities: observableValue(owner, void 0),
    resources: () => (async function* () {
    })(),
    resourceTemplates: async () => [],
    dispose: () => {
    },
    toolsValue: tools,
    get startCalls() {
      return startCalls;
    }
  };
}
function createNeverStartingServer(collectionId, definitionId, initialTools) {
  const owner = {};
  const tools = observableValue(owner, initialTools);
  const connectionState = observableValue(owner, { state: McpConnectionState.Kind.Running });
  const cacheState = observableValue(owner, McpServerCacheState.Unknown);
  let startCalls = 0;
  let startBehavior = "hang";
  const result = {
    collection: { id: collectionId, label: collectionId, order: 0 },
    definition: { id: definitionId, label: definitionId },
    connection: observableValue(owner, void 0),
    connectionState,
    enablement: observableValue(owner, ContributionEnablementState.EnabledProfile),
    serverMetadata: observableValue(owner, void 0),
    readDefinitions: () => observableValue(owner, { server: void 0, collection: void 0 }),
    showOutput: async () => {
    },
    start: async () => {
      startCalls++;
      if (result.startBehavior === "succeed") {
        cacheState.set(McpServerCacheState.Live, void 0);
        return { state: McpConnectionState.Kind.Running };
      }
      return new Promise(() => {
      });
    },
    stop: async () => {
    },
    cacheState,
    tools,
    prompts: observableValue(owner, []),
    capabilities: observableValue(owner, void 0),
    resources: () => (async function* () {
    })(),
    resourceTemplates: async () => [],
    dispose: () => {
    },
    get startCalls() {
      return startCalls;
    },
    get startBehavior() {
      return startBehavior;
    },
    set startBehavior(v) {
      startBehavior = v;
    },
    cacheStateValue: cacheState
  };
  return result;
}
function createToolWithContextCapture(name, receivedContexts, call, visibility = McpToolVisibility.Model) {
  const definition = {
    name,
    description: `Tool ${name}`,
    inputSchema: { type: "object", properties: { input: { type: "string" } } }
  };
  return {
    id: `tool_${name}`,
    referenceName: name,
    icons: {},
    definition,
    visibility,
    uiResourceUri: void 0,
    call: (params, context, _token) => {
      receivedContexts.push(context);
      return call(params);
    },
    callWithProgress: (params, _progress, context, _token = CancellationToken.None) => {
      receivedContexts.push(context);
      return call(params);
    }
  };
}
function createTool(name, call, visibility = McpToolVisibility.Model) {
  const definition = {
    name,
    description: `Tool ${name}`,
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string" }
      }
    }
  };
  return {
    id: `tool_${name}`,
    referenceName: name,
    icons: {},
    definition,
    visibility,
    uiResourceUri: void 0,
    call: (params, _context, _token) => call(params),
    callWithProgress: (params, _progress, _context, _token = CancellationToken.None) => call(params)
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWNwR2F0ZXdheVNlcnZlckRlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcEdhdGV3YXkuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcbmltcG9ydCB7IE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwuanMnO1xuaW1wb3J0IHsgSU1jcEljb25zLCBJTWNwU2VydmVyLCBJTWNwVG9vbCwgSU1jcFRvb2xDYWxsQ29udGV4dCwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BTZXJ2ZXJDYWNoZVN0YXRlLCBNY3BUb29sVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0TWNwU2VydmljZSB9IGZyb20gJy4vdGVzdE1jcFNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnTWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdsaXN0cyBtb2RlbC12aXNpYmxlIHRvb2xzIGZvciBhIHNwZWNpZmljIHNlcnZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbmV3IFRlc3RNY3BTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IG5ldyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwobWNwU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3Qgc2VydmVyQSA9IGNyZWF0ZVNlcnZlcignY29sbGVjdGlvbkEnLCAnc2VydmVyQScsIFtcblx0XHRcdGNyZWF0ZVRvb2woJ21jcF9zZXJ2ZXJBX2VjaG8nLCBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdBJyB9XSB9KSksXG5cdFx0XHRjcmVhdGVUb29sKCdhcHAtb25seScsIGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ0EyJyB9XSB9KSwgTWNwVG9vbFZpc2liaWxpdHkuQXBwKSxcblx0XHRdKTtcblx0XHRjb25zdCBzZXJ2ZXJCID0gY3JlYXRlU2VydmVyKCdjb2xsZWN0aW9uQicsICdzZXJ2ZXJCJywgW1xuXHRcdFx0Y3JlYXRlVG9vbCgnbWNwX3NlcnZlckJfZWNobycsIGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ0InIH1dIH0pKSxcblx0XHRdKTtcblxuXHRcdG1jcFNlcnZpY2Uuc2VydmVycy5zZXQoW3NlcnZlckEsIHNlcnZlckJdLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0QSA9IGF3YWl0IGNoYW5uZWwuY2FsbDxyZWFkb25seSBNQ1AuVG9vbFtdPih1bmRlZmluZWQsICdsaXN0VG9vbHNGb3JTZXJ2ZXInLCB7IHNlcnZlcklkOiAnc2VydmVyQScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRBLm1hcCh0ID0+IHQubmFtZSksIFsnbWNwX3NlcnZlckFfZWNobyddKTtcblxuXHRcdGNvbnN0IHJlc3VsdEIgPSBhd2FpdCBjaGFubmVsLmNhbGw8cmVhZG9ubHkgTUNQLlRvb2xbXT4odW5kZWZpbmVkLCAnbGlzdFRvb2xzRm9yU2VydmVyJywgeyBzZXJ2ZXJJZDogJ3NlcnZlckInIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Qi5tYXAodCA9PiB0Lm5hbWUpLCBbJ21jcF9zZXJ2ZXJCX2VjaG8nXSk7XG5cblx0XHRjaGFubmVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncm91dGVzIHRvb2wgY2FsbHMgdG8gc3BlY2lmaWMgc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBuZXcgVGVzdE1jcFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGFubmVsID0gbmV3IE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbChtY3BTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBpbnZva2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZlckEgPSBjcmVhdGVTZXJ2ZXIoJ2NvbGxlY3Rpb25BJywgJ3NlcnZlckEnLCBbXG5cdFx0XHRjcmVhdGVUb29sKCdtY3Bfc2VydmVyQV9lY2hvJywgYXN5bmMgYXJncyA9PiB7XG5cdFx0XHRcdGludm9rZWQucHVzaChgQToke1N0cmluZyhhcmdzLm5hbWUpfWApO1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdmcm9tIEEnIH1dIH07XG5cdFx0XHR9KSxcblx0XHRdKTtcblx0XHRjb25zdCBzZXJ2ZXJCID0gY3JlYXRlU2VydmVyKCdjb2xsZWN0aW9uQicsICdzZXJ2ZXJCJywgW1xuXHRcdFx0Y3JlYXRlVG9vbCgnbWNwX3NlcnZlckJfZWNobycsIGFzeW5jIGFyZ3MgPT4ge1xuXHRcdFx0XHRpbnZva2VkLnB1c2goYEI6JHtTdHJpbmcoYXJncy5uYW1lKX1gKTtcblx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZnJvbSBCJyB9XSB9O1xuXHRcdFx0fSksXG5cdFx0XSk7XG5cblx0XHRtY3BTZXJ2aWNlLnNlcnZlcnMuc2V0KFtzZXJ2ZXJBLCBzZXJ2ZXJCXSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlc3VsdEEgPSBhd2FpdCBjaGFubmVsLmNhbGw8TUNQLkNhbGxUb29sUmVzdWx0Pih1bmRlZmluZWQsICdjYWxsVG9vbEZvclNlcnZlcicsIHtcblx0XHRcdHNlcnZlcklkOiAnc2VydmVyQScsXG5cdFx0XHRuYW1lOiAnbWNwX3NlcnZlckFfZWNobycsXG5cdFx0XHRhcmdzOiB7IG5hbWU6ICdvbmUnIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0QiA9IGF3YWl0IGNoYW5uZWwuY2FsbDxNQ1AuQ2FsbFRvb2xSZXN1bHQ+KHVuZGVmaW5lZCwgJ2NhbGxUb29sRm9yU2VydmVyJywge1xuXHRcdFx0c2VydmVySWQ6ICdzZXJ2ZXJCJyxcblx0XHRcdG5hbWU6ICdtY3Bfc2VydmVyQl9lY2hvJyxcblx0XHRcdGFyZ3M6IHsgbmFtZTogJ3R3bycgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2tlZCwgWydBOm9uZScsICdCOnR3byddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdEEuY29udGVudFswXSBhcyBNQ1AuVGV4dENvbnRlbnQpLnRleHQsICdmcm9tIEEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdEIuY29udGVudFswXSBhcyBNQ1AuVGV4dENvbnRlbnQpLnRleHQsICdmcm9tIEInKTtcblxuXHRcdGNoYW5uZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBvbkRpZENoYW5nZVRvb2xzIHdoZW4gdG9vbCBsaXN0cyBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG5ldyBUZXN0TWNwU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBuZXcgTWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsKG1jcFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoJ2NvbGxlY3Rpb25BJywgJ3NlcnZlckEnLCBbXG5cdFx0XHRjcmVhdGVUb29sKCdlY2hvJywgYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnQScgfV0gfSkpLFxuXHRcdF0pO1xuXG5cdFx0bWNwU2VydmljZS5zZXJ2ZXJzLnNldChbc2VydmVyXSwgdW5kZWZpbmVkKTtcblxuXHRcdGxldCBldmVudHMgPSAwO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBjaGFubmVsLmxpc3Rlbjx2b2lkPih1bmRlZmluZWQsICdvbkRpZENoYW5nZVRvb2xzJykoKCkgPT4ge1xuXHRcdFx0ZXZlbnRzKys7XG5cdFx0fSk7XG5cblx0XHRzZXJ2ZXIudG9vbHNWYWx1ZS5zZXQoW1xuXHRcdFx0Y3JlYXRlVG9vbCgnZWNobycsIGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ0EnIH1dIH0pKSxcblx0XHRcdGNyZWF0ZVRvb2woJ2VjaG8yJywgYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnQTInIH1dIH0pKSxcblx0XHRdLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50cyA+PSAxKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGNoYW5uZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBzdGFydCBzZXJ2ZXIgd2hlbiBjYWNoZSBzdGF0ZSBpcyBsaXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBuZXcgVGVzdE1jcFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGFubmVsID0gbmV3IE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbChtY3BTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoXG5cdFx0XHQnY29sbGVjdGlvbkEnLFxuXHRcdFx0J3NlcnZlckEnLFxuXHRcdFx0W2NyZWF0ZVRvb2woJ2VjaG8nLCBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdBJyB9XSB9KSldLFxuXHRcdFx0TWNwU2VydmVyQ2FjaGVTdGF0ZS5MaXZlLFxuXHRcdCk7XG5cblx0XHRtY3BTZXJ2aWNlLnNlcnZlcnMuc2V0KFtzZXJ2ZXJdLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IGNoYW5uZWwuY2FsbDxyZWFkb25seSBNQ1AuVG9vbFtdPih1bmRlZmluZWQsICdsaXN0VG9vbHNGb3JTZXJ2ZXInLCB7IHNlcnZlcklkOiAnc2VydmVyQScgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnN0YXJ0Q2FsbHMsIDApO1xuXHRcdGNoYW5uZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydHMgc2VydmVyIHdoZW4gY2FjaGUgc3RhdGUgaXMgdW5rbm93bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbmV3IFRlc3RNY3BTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IG5ldyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwobWNwU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlU2VydmVyKFxuXHRcdFx0J2NvbGxlY3Rpb25BJyxcblx0XHRcdCdzZXJ2ZXJBJyxcblx0XHRcdFtjcmVhdGVUb29sKCdlY2hvJywgYXN5bmMgKCkgPT4gKHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnQScgfV0gfSkpXSxcblx0XHRcdE1jcFNlcnZlckNhY2hlU3RhdGUuVW5rbm93bixcblx0XHQpO1xuXG5cdFx0bWNwU2VydmljZS5zZXJ2ZXJzLnNldChbc2VydmVyXSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNoYW5uZWwuY2FsbDxyZWFkb25seSBNQ1AuVG9vbFtdPih1bmRlZmluZWQsICdsaXN0VG9vbHNGb3JTZXJ2ZXInLCB7IHNlcnZlcklkOiAnc2VydmVyQScgfSk7XG5cblx0XHQvLyBTZXJ2ZXIgc3RhcnRlZCBkdXJpbmcgdGhlIGdyYWNlIHBlcmlvZDsgdG9vbHMgYXJlIG5vdyBhdmFpbGFibGUuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5zdGFydENhbGxzLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xzLm1hcCh0ID0+IHQubmFtZSksIFsnZWNobyddKTtcblx0XHRjaGFubmVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnRzIHNlcnZlciBhbmQgd2FpdHMgd2l0aGluIGdyYWNlIHBlcmlvZCB3aGVuIGNhY2hlIHN0YXRlIGlzIG91dGRhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBuZXcgVGVzdE1jcFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGFubmVsID0gbmV3IE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbChtY3BTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoXG5cdFx0XHQnY29sbGVjdGlvbkEnLFxuXHRcdFx0J3NlcnZlckEnLFxuXHRcdFx0W2NyZWF0ZVRvb2woJ2VjaG8nLCBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdBJyB9XSB9KSldLFxuXHRcdFx0TWNwU2VydmVyQ2FjaGVTdGF0ZS5PdXRkYXRlZCxcblx0XHQpO1xuXG5cdFx0bWNwU2VydmljZS5zZXJ2ZXJzLnNldChbc2VydmVyXSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNoYW5uZWwuY2FsbDxyZWFkb25seSBNQ1AuVG9vbFtdPih1bmRlZmluZWQsICdsaXN0VG9vbHNGb3JTZXJ2ZXInLCB7IHNlcnZlcklkOiAnc2VydmVyQScgfSk7XG5cblx0XHQvLyBPdXRkYXRlZCBzZXJ2ZXIgZ2V0cyB0aGUgc2FtZSBncmFjZSBwZXJpb2QgYXMgVW5rbm93biBcdTIwMTQgc3RhcnRlZCBhbmQgdG9vbHMgcmV0dXJuZWQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5zdGFydENhbGxzLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xzLm1hcCh0ID0+IHQubmFtZSksIFsnZWNobyddKTtcblx0XHRjaGFubmVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSB0b29scyBhbmQgZG9lcyBub3QgcmUtd2FpdCBpZiBzZXJ2ZXIgZG9lcyBub3Qgc3RhcnQgd2l0aGluIGdyYWNlIHBlcmlvZCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbmV3IFRlc3RNY3BTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBjaGFubmVsID0gbmV3IE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbChtY3BTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgMTAwKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlTmV2ZXJTdGFydGluZ1NlcnZlcihcblx0XHRcdFx0J2NvbGxlY3Rpb25BJyxcblx0XHRcdFx0J3NlcnZlckEnLFxuXHRcdFx0XHRbY3JlYXRlVG9vbCgnZWNobycsIGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ0EnIH1dIH0pKV0sXG5cdFx0XHQpO1xuXG5cdFx0XHRtY3BTZXJ2aWNlLnNlcnZlcnMuc2V0KFtzZXJ2ZXJdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsOiB3YWl0cyB1cCB0byB0aGUgZ3JhY2UgcGVyaW9kLCBzZXJ2ZXIgbmV2ZXIgc3RhcnRzIFx1MjE5MiBlbXB0eSByZXN1bHQuXG5cdFx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNoYW5uZWwuY2FsbDxyZWFkb25seSBNQ1AuVG9vbFtdPih1bmRlZmluZWQsICdsaXN0VG9vbHNGb3JTZXJ2ZXInLCB7IHNlcnZlcklkOiAnc2VydmVyQScgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xzLCBbXSk7XG5cblx0XHRcdC8vIFNlY29uZCBjYWxsOiBncmFjZS1wZXJpb2QgcHJvbWlzZSBhbHJlYWR5IHJlc29sdmVkOyByZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGhvdXQgcmUtd2FpdGluZy5cblx0XHRcdGNvbnN0IHRvb2xzMiA9IGF3YWl0IGNoYW5uZWwuY2FsbDxyZWFkb25seSBNQ1AuVG9vbFtdPih1bmRlZmluZWQsICdsaXN0VG9vbHNGb3JTZXJ2ZXInLCB7IHNlcnZlcklkOiAnc2VydmVyQScgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xzMiwgW10pO1xuXG5cdFx0XHRjaGFubmVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZGF0ZXMgc3RhbGUgZ3JhY2UgZW50cnkgd2hlbiBjYWNoZVN0YXRlIHJlZ3Jlc3NlcyB0byBVbmtub3duIGFmdGVyIHRpbWVvdXQnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWNwU2VydmljZSA9IG5ldyBUZXN0TWNwU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IG5ldyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwobWNwU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIDEwMCk7XG5cblx0XHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZU5ldmVyU3RhcnRpbmdTZXJ2ZXIoXG5cdFx0XHRcdCdjb2xsZWN0aW9uQScsXG5cdFx0XHRcdCdzZXJ2ZXJBJyxcblx0XHRcdFx0W2NyZWF0ZVRvb2woJ2VjaG8nLCBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdBJyB9XSB9KSldLFxuXHRcdFx0KTtcblxuXHRcdFx0bWNwU2VydmljZS5zZXJ2ZXJzLnNldChbc2VydmVyXSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbDogZ3JhY2UgcGVyaW9kIGVsYXBzZXMsIHNlcnZlciBuZXZlciBzdGFydHMgXHUyMTkyIGVtcHR5LlxuXHRcdFx0Y29uc3QgdG9vbHMxID0gYXdhaXQgY2hhbm5lbC5jYWxsPHJlYWRvbmx5IE1DUC5Ub29sW10+KHVuZGVmaW5lZCwgJ2xpc3RUb29sc0ZvclNlcnZlcicsIHsgc2VydmVySWQ6ICdzZXJ2ZXJBJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbHMxLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnN0YXJ0Q2FsbHMsIDEpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBhIGNhY2hlIHJlc2V0OiBzZXJ2ZXIgZ29lcyBiYWNrIHRvIFVua25vd24uXG5cdFx0XHRzZXJ2ZXIuY2FjaGVTdGF0ZVZhbHVlLnNldChNY3BTZXJ2ZXJDYWNoZVN0YXRlLlVua25vd24sIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIE1ha2UgdGhlIHNlcnZlciBzdWNjZWVkIHRoaXMgdGltZS5cblx0XHRcdHNlcnZlci5zdGFydEJlaGF2aW9yID0gJ3N1Y2NlZWQnO1xuXG5cdFx0XHQvLyBTZWNvbmQgY2FsbDogc3RhbGUgZ3JhY2UgZW50cnkgc2hvdWxkIGJlIGRpc2NhcmRlZCwgYSBuZXcgZ3JhY2UgcmFjZSBzdGFydHMsXG5cdFx0XHQvLyBhbmQgdGhlIHNlcnZlciBzdWNjZXNzZnVsbHkgc3RhcnRzIFx1MjE5MiB0b29scyByZXR1cm5lZC5cblx0XHRcdGNvbnN0IHRvb2xzMiA9IGF3YWl0IGNoYW5uZWwuY2FsbDxyZWFkb25seSBNQ1AuVG9vbFtdPih1bmRlZmluZWQsICdsaXN0VG9vbHNGb3JTZXJ2ZXInLCB7IHNlcnZlcklkOiAnc2VydmVyQScgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xzMi5tYXAodCA9PiB0Lm5hbWUpLCBbJ2VjaG8nXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnN0YXJ0Q2FsbHMsIDIpO1xuXG5cdFx0XHRjaGFubmVsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaW52YWxpZGF0ZSBncmFjZSBlbnRyeSB3aGVuIGNhY2hlU3RhdGUgaXMgbm90IFVua25vd24vT3V0ZGF0ZWQnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWNwU2VydmljZSA9IG5ldyBUZXN0TWNwU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IG5ldyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwobWNwU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIDEwMCk7XG5cblx0XHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZVNlcnZlcihcblx0XHRcdFx0J2NvbGxlY3Rpb25BJyxcblx0XHRcdFx0J3NlcnZlckEnLFxuXHRcdFx0XHRbY3JlYXRlVG9vbCgnZWNobycsIGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ0EnIH1dIH0pKV0sXG5cdFx0XHRcdE1jcFNlcnZlckNhY2hlU3RhdGUuVW5rbm93bixcblx0XHRcdCk7XG5cblx0XHRcdG1jcFNlcnZpY2Uuc2VydmVycy5zZXQoW3NlcnZlcl0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIEZpcnN0IGNhbGw6IHNlcnZlciBzdGFydHMgc3VjY2Vzc2Z1bGx5IGR1cmluZyBncmFjZSBwZXJpb2QuXG5cdFx0XHRjb25zdCB0b29sczEgPSBhd2FpdCBjaGFubmVsLmNhbGw8cmVhZG9ubHkgTUNQLlRvb2xbXT4odW5kZWZpbmVkLCAnbGlzdFRvb2xzRm9yU2VydmVyJywgeyBzZXJ2ZXJJZDogJ3NlcnZlckEnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sczEubWFwKHQgPT4gdC5uYW1lKSwgWydlY2hvJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5zdGFydENhbGxzLCAxKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGNhbGw6IGNhY2hlU3RhdGUgaXMgbm93IExpdmUgKHNlcnZlciBzdGFydGVkKSwgZ3JhY2UgZW50cnkgc2hvdWxkIE5PVFxuXHRcdFx0Ly8gYmUgaW52YWxpZGF0ZWQsIHNvIG5vIGFkZGl0aW9uYWwgc3RhcnQgY2FsbCBpcyBtYWRlLlxuXHRcdFx0Y29uc3QgdG9vbHMyID0gYXdhaXQgY2hhbm5lbC5jYWxsPHJlYWRvbmx5IE1DUC5Ub29sW10+KHVuZGVmaW5lZCwgJ2xpc3RUb29sc0ZvclNlcnZlcicsIHsgc2VydmVySWQ6ICdzZXJ2ZXJBJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbHMyLm1hcCh0ID0+IHQubmFtZSksIFsnZWNobyddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIuc3RhcnRDYWxscywgMSk7XG5cblx0XHRcdGNoYW5uZWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0U2VydmVycyByZXR1cm5zIGFsbCBzZXJ2ZXJzIHJlZ2FyZGxlc3Mgb2YgY2FjaGUgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG5ldyBUZXN0TWNwU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBuZXcgTWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsKG1jcFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGxpdmVTZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoJ2NvbGxlY3Rpb25BJywgJ3NlcnZlckEnLCBbXSwgTWNwU2VydmVyQ2FjaGVTdGF0ZS5MaXZlKTtcblx0XHRjb25zdCB1bmtub3duU2VydmVyID0gY3JlYXRlU2VydmVyKCdjb2xsZWN0aW9uQicsICdzZXJ2ZXJCJywgW10sIE1jcFNlcnZlckNhY2hlU3RhdGUuVW5rbm93bik7XG5cblx0XHRtY3BTZXJ2aWNlLnNlcnZlcnMuc2V0KFtsaXZlU2VydmVyLCB1bmtub3duU2VydmVyXSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHNlcnZlcnMgPSBhd2FpdCBjaGFubmVsLmNhbGw8cmVhZG9ubHkgSU1jcEdhdGV3YXlTZXJ2ZXJEZXNjcmlwdG9yW10+KHVuZGVmaW5lZCwgJ2xpc3RTZXJ2ZXJzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2ZXJzLCBbXG5cdFx0XHR7IGlkOiAnc2VydmVyQScsIGxhYmVsOiAnc2VydmVyQScgfSxcblx0XHRcdHsgaWQ6ICdzZXJ2ZXJCJywgbGFiZWw6ICdzZXJ2ZXJCJyB9LFxuXHRcdF0pO1xuXG5cdFx0Y2hhbm5lbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGNoYXRTZXNzaW9uUmVzb3VyY2UgYXMgdG9vbCBjYWxsIGNvbnRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IG5ldyBUZXN0TWNwU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBuZXcgTWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsKG1jcFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHJlY2VpdmVkQ29udGV4dHM6IChJTWNwVG9vbENhbGxDb250ZXh0IHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlU2VydmVyKCdjb2xsZWN0aW9uQScsICdzZXJ2ZXJBJywgW1xuXHRcdFx0Y3JlYXRlVG9vbFdpdGhDb250ZXh0Q2FwdHVyZSgnZWNobycsIHJlY2VpdmVkQ29udGV4dHMsIGFzeW5jICgpID0+ICh7IGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSB9KSksXG5cdFx0XSk7XG5cblx0XHRtY3BTZXJ2aWNlLnNlcnZlcnMuc2V0KFtzZXJ2ZXJdLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9ICd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uLTEyMyc7XG5cdFx0YXdhaXQgY2hhbm5lbC5jYWxsPE1DUC5DYWxsVG9vbFJlc3VsdD4odW5kZWZpbmVkLCAnY2FsbFRvb2xGb3JTZXJ2ZXInLCB7XG5cdFx0XHRzZXJ2ZXJJZDogJ3NlcnZlckEnLFxuXHRcdFx0bmFtZTogJ2VjaG8nLFxuXHRcdFx0YXJnczogeyBpbnB1dDogJ2hlbGxvJyB9LFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblVyaSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZENvbnRleHRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlY2VpdmVkQ29udGV4dHNbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZENvbnRleHRzWzBdIS5jaGF0U2Vzc2lvblJlc291cmNlIS50b1N0cmluZygpLCBVUkkucGFyc2Uoc2Vzc2lvblVyaSkudG9TdHJpbmcoKSk7XG5cblx0XHRjaGFubmVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncGFzc2VzIHVuZGVmaW5lZCBjb250ZXh0IHdoZW4gY2hhdFNlc3Npb25SZXNvdXJjZSBpcyBvbWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1jcFNlcnZpY2UgPSBuZXcgVGVzdE1jcFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGFubmVsID0gbmV3IE1jcEdhdGV3YXlUb29sQnJva2VyQ2hhbm5lbChtY3BTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZWNlaXZlZENvbnRleHRzOiAoSU1jcFRvb2xDYWxsQ29udGV4dCB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZVNlcnZlcignY29sbGVjdGlvbkEnLCAnc2VydmVyQScsIFtcblx0XHRcdGNyZWF0ZVRvb2xXaXRoQ29udGV4dENhcHR1cmUoJ2VjaG8nLCByZWNlaXZlZENvbnRleHRzLCBhc3luYyAoKSA9PiAoeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0gfSkpLFxuXHRcdF0pO1xuXG5cdFx0bWNwU2VydmljZS5zZXJ2ZXJzLnNldChbc2VydmVyXSwgdW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IGNoYW5uZWwuY2FsbDxNQ1AuQ2FsbFRvb2xSZXN1bHQ+KHVuZGVmaW5lZCwgJ2NhbGxUb29sRm9yU2VydmVyJywge1xuXHRcdFx0c2VydmVySWQ6ICdzZXJ2ZXJBJyxcblx0XHRcdG5hbWU6ICdlY2hvJyxcblx0XHRcdGFyZ3M6IHsgaW5wdXQ6ICdoZWxsbycgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZENvbnRleHRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY2VpdmVkQ29udGV4dHNbMF0sIHVuZGVmaW5lZCk7XG5cblx0XHRjaGFubmVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgb25EaWRDaGFuZ2VTZXJ2ZXJzIHdpdGggZGVzY3JpcHRvcnMgd2hlbiBzZXJ2ZXJzIGNoYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gbmV3IFRlc3RNY3BTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IG5ldyBNY3BHYXRld2F5VG9vbEJyb2tlckNoYW5uZWwobWNwU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlcnZlckEgPSBjcmVhdGVTZXJ2ZXIoJ2NvbGxlY3Rpb25BJywgJ3NlcnZlckEnLCBbXSk7XG5cblx0XHRtY3BTZXJ2aWNlLnNlcnZlcnMuc2V0KFtzZXJ2ZXJBXSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlY2VpdmVkOiAocmVhZG9ubHkgSU1jcEdhdGV3YXlTZXJ2ZXJEZXNjcmlwdG9yW10pW10gPSBbXTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gY2hhbm5lbC5saXN0ZW48cmVhZG9ubHkgSU1jcEdhdGV3YXlTZXJ2ZXJEZXNjcmlwdG9yW10+KHVuZGVmaW5lZCwgJ29uRGlkQ2hhbmdlU2VydmVycycpKGUgPT4ge1xuXHRcdFx0cmVjZWl2ZWQucHVzaChlKTtcblx0XHR9KTtcblxuXHRcdC8vIEFkZCBhIHNlY29uZCBzZXJ2ZXJcblx0XHRjb25zdCBzZXJ2ZXJCID0gY3JlYXRlU2VydmVyKCdjb2xsZWN0aW9uQicsICdzZXJ2ZXJCJywgW10pO1xuXHRcdG1jcFNlcnZpY2Uuc2VydmVycy5zZXQoW3NlcnZlckEsIHNlcnZlckJdLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY2VpdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZFswXSwgW1xuXHRcdFx0eyBpZDogJ3NlcnZlckEnLCBsYWJlbDogJ3NlcnZlckEnIH0sXG5cdFx0XHR7IGlkOiAnc2VydmVyQicsIGxhYmVsOiAnc2VydmVyQicgfSxcblx0XHRdKTtcblxuXHRcdC8vIFJlbW92ZSB0aGUgZmlyc3Qgc2VydmVyXG5cdFx0bWNwU2VydmljZS5zZXJ2ZXJzLnNldChbc2VydmVyQl0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjZWl2ZWQubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY2VpdmVkWzFdLCBbXG5cdFx0XHR7IGlkOiAnc2VydmVyQicsIGxhYmVsOiAnc2VydmVyQicgfSxcblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGNoYW5uZWwuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBjcmVhdGVTZXJ2ZXIoXG5cdGNvbGxlY3Rpb25JZDogc3RyaW5nLFxuXHRkZWZpbml0aW9uSWQ6IHN0cmluZyxcblx0aW5pdGlhbFRvb2xzOiByZWFkb25seSBJTWNwVG9vbFtdLFxuXHRpbml0aWFsQ2FjaGVTdGF0ZTogTWNwU2VydmVyQ2FjaGVTdGF0ZSA9IE1jcFNlcnZlckNhY2hlU3RhdGUuTGl2ZSxcbik6IElNY3BTZXJ2ZXIgJiB7IHRvb2xzVmFsdWU6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJTWNwVG9vbFtdPj47IHN0YXJ0Q2FsbHM6IG51bWJlciB9IHtcblx0Y29uc3Qgb3duZXIgPSB7fTtcblx0Y29uc3QgdG9vbHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSU1jcFRvb2xbXT4ob3duZXIsIGluaXRpYWxUb29scyk7XG5cdGNvbnN0IGNvbm5lY3Rpb25TdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxNY3BDb25uZWN0aW9uU3RhdGU+KG93bmVyLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nIH0pO1xuXHRjb25zdCBjYWNoZVN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPE1jcFNlcnZlckNhY2hlU3RhdGU+KG93bmVyLCBpbml0aWFsQ2FjaGVTdGF0ZSk7XG5cdGxldCBzdGFydENhbGxzID0gMDtcblxuXHRyZXR1cm4ge1xuXHRcdGNvbGxlY3Rpb246IHsgaWQ6IGNvbGxlY3Rpb25JZCwgbGFiZWw6IGNvbGxlY3Rpb25JZCwgb3JkZXI6IDAgfSxcblx0XHRkZWZpbml0aW9uOiB7IGlkOiBkZWZpbml0aW9uSWQsIGxhYmVsOiBkZWZpbml0aW9uSWQgfSxcblx0XHRjb25uZWN0aW9uOiBvYnNlcnZhYmxlVmFsdWUob3duZXIsIHVuZGVmaW5lZCksXG5cdFx0Y29ubmVjdGlvblN0YXRlLFxuXHRcdGVuYWJsZW1lbnQ6IG9ic2VydmFibGVWYWx1ZShvd25lciwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKSxcblx0XHRzZXJ2ZXJNZXRhZGF0YTogb2JzZXJ2YWJsZVZhbHVlKG93bmVyLCB1bmRlZmluZWQpLFxuXHRcdHJlYWREZWZpbml0aW9uczogKCkgPT4gb2JzZXJ2YWJsZVZhbHVlKG93bmVyLCB7IHNlcnZlcjogdW5kZWZpbmVkLCBjb2xsZWN0aW9uOiB1bmRlZmluZWQgfSksXG5cdFx0c2hvd091dHB1dDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdHN0YXJ0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGFydENhbGxzKys7XG5cdFx0XHRjYWNoZVN0YXRlLnNldChNY3BTZXJ2ZXJDYWNoZVN0YXRlLkxpdmUsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4geyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyB9O1xuXHRcdH0sXG5cdFx0c3RvcDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGNhY2hlU3RhdGUsXG5cdFx0dG9vbHMsXG5cdFx0cHJvbXB0czogb2JzZXJ2YWJsZVZhbHVlKG93bmVyLCBbXSksXG5cdFx0Y2FwYWJpbGl0aWVzOiBvYnNlcnZhYmxlVmFsdWUob3duZXIsIHVuZGVmaW5lZCksXG5cdFx0cmVzb3VyY2VzOiAoKSA9PiAoYXN5bmMgZnVuY3Rpb24qICgpIHsgfSkoKSxcblx0XHRyZXNvdXJjZVRlbXBsYXRlczogYXN5bmMgKCkgPT4gW10sXG5cdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdHRvb2xzVmFsdWU6IHRvb2xzLFxuXHRcdGdldCBzdGFydENhbGxzKCkgeyByZXR1cm4gc3RhcnRDYWxsczsgfSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTmV2ZXJTdGFydGluZ1NlcnZlcihcblx0Y29sbGVjdGlvbklkOiBzdHJpbmcsXG5cdGRlZmluaXRpb25JZDogc3RyaW5nLFxuXHRpbml0aWFsVG9vbHM6IHJlYWRvbmx5IElNY3BUb29sW10sXG4pOiBJTWNwU2VydmVyICYgeyBzdGFydENhbGxzOiBudW1iZXI7IHN0YXJ0QmVoYXZpb3I6ICdoYW5nJyB8ICdzdWNjZWVkJzsgY2FjaGVTdGF0ZVZhbHVlOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8TWNwU2VydmVyQ2FjaGVTdGF0ZT4+IH0ge1xuXHRjb25zdCBvd25lciA9IHt9O1xuXHRjb25zdCB0b29scyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJTWNwVG9vbFtdPihvd25lciwgaW5pdGlhbFRvb2xzKTtcblx0Y29uc3QgY29ubmVjdGlvblN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPE1jcENvbm5lY3Rpb25TdGF0ZT4ob3duZXIsIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgfSk7XG5cdGNvbnN0IGNhY2hlU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8TWNwU2VydmVyQ2FjaGVTdGF0ZT4ob3duZXIsIE1jcFNlcnZlckNhY2hlU3RhdGUuVW5rbm93bik7XG5cdGxldCBzdGFydENhbGxzID0gMDtcblx0bGV0IHN0YXJ0QmVoYXZpb3I6ICdoYW5nJyB8ICdzdWNjZWVkJyA9ICdoYW5nJztcblxuXHRjb25zdCByZXN1bHQ6IElNY3BTZXJ2ZXIgJiB7IHN0YXJ0Q2FsbHM6IG51bWJlcjsgc3RhcnRCZWhhdmlvcjogJ2hhbmcnIHwgJ3N1Y2NlZWQnOyBjYWNoZVN0YXRlVmFsdWU6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxNY3BTZXJ2ZXJDYWNoZVN0YXRlPj4gfSA9IHtcblx0XHRjb2xsZWN0aW9uOiB7IGlkOiBjb2xsZWN0aW9uSWQsIGxhYmVsOiBjb2xsZWN0aW9uSWQsIG9yZGVyOiAwIH0sXG5cdFx0ZGVmaW5pdGlvbjogeyBpZDogZGVmaW5pdGlvbklkLCBsYWJlbDogZGVmaW5pdGlvbklkIH0sXG5cdFx0Y29ubmVjdGlvbjogb2JzZXJ2YWJsZVZhbHVlKG93bmVyLCB1bmRlZmluZWQpLFxuXHRcdGNvbm5lY3Rpb25TdGF0ZSxcblx0XHRlbmFibGVtZW50OiBvYnNlcnZhYmxlVmFsdWUob3duZXIsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSksXG5cdFx0c2VydmVyTWV0YWRhdGE6IG9ic2VydmFibGVWYWx1ZShvd25lciwgdW5kZWZpbmVkKSxcblx0XHRyZWFkRGVmaW5pdGlvbnM6ICgpID0+IG9ic2VydmFibGVWYWx1ZShvd25lciwgeyBzZXJ2ZXI6IHVuZGVmaW5lZCwgY29sbGVjdGlvbjogdW5kZWZpbmVkIH0pLFxuXHRcdHNob3dPdXRwdXQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRzdGFydDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RhcnRDYWxscysrO1xuXHRcdFx0aWYgKHJlc3VsdC5zdGFydEJlaGF2aW9yID09PSAnc3VjY2VlZCcpIHtcblx0XHRcdFx0Y2FjaGVTdGF0ZS5zZXQoTWNwU2VydmVyQ2FjaGVTdGF0ZS5MaXZlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm4geyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyB9O1xuXHRcdFx0fVxuXHRcdFx0Ly8gTmV2ZXIgcmVzb2x2ZXMgXHUyMDE0IHNpbXVsYXRlcyBhIHNlcnZlciB0aGF0IGhhbmdzIG9uIHN0YXJ0dXAuXG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8TWNwQ29ubmVjdGlvblN0YXRlPigoKSA9PiB7IH0pO1xuXHRcdH0sXG5cdFx0c3RvcDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGNhY2hlU3RhdGUsXG5cdFx0dG9vbHMsXG5cdFx0cHJvbXB0czogb2JzZXJ2YWJsZVZhbHVlKG93bmVyLCBbXSksXG5cdFx0Y2FwYWJpbGl0aWVzOiBvYnNlcnZhYmxlVmFsdWUob3duZXIsIHVuZGVmaW5lZCksXG5cdFx0cmVzb3VyY2VzOiAoKSA9PiAoYXN5bmMgZnVuY3Rpb24qICgpIHsgfSkoKSxcblx0XHRyZXNvdXJjZVRlbXBsYXRlczogYXN5bmMgKCkgPT4gW10sXG5cdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdGdldCBzdGFydENhbGxzKCkgeyByZXR1cm4gc3RhcnRDYWxsczsgfSxcblx0XHRnZXQgc3RhcnRCZWhhdmlvcigpIHsgcmV0dXJuIHN0YXJ0QmVoYXZpb3I7IH0sXG5cdFx0c2V0IHN0YXJ0QmVoYXZpb3IodikgeyBzdGFydEJlaGF2aW9yID0gdjsgfSxcblx0XHRjYWNoZVN0YXRlVmFsdWU6IGNhY2hlU3RhdGUsXG5cdH07XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRvb2xXaXRoQ29udGV4dENhcHR1cmUoXG5cdG5hbWU6IHN0cmluZyxcblx0cmVjZWl2ZWRDb250ZXh0czogKElNY3BUb29sQ2FsbENvbnRleHQgfCB1bmRlZmluZWQpW10sXG5cdGNhbGw6IChwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD4sXG5cdHZpc2liaWxpdHk6IE1jcFRvb2xWaXNpYmlsaXR5ID0gTWNwVG9vbFZpc2liaWxpdHkuTW9kZWwsXG4pOiBJTWNwVG9vbCB7XG5cdGNvbnN0IGRlZmluaXRpb246IE1DUC5Ub29sID0ge1xuXHRcdG5hbWUsXG5cdFx0ZGVzY3JpcHRpb246IGBUb29sICR7bmFtZX1gLFxuXHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IGlucHV0OiB7IHR5cGU6ICdzdHJpbmcnIH0gfSB9LFxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0aWQ6IGB0b29sXyR7bmFtZX1gLFxuXHRcdHJlZmVyZW5jZU5hbWU6IG5hbWUsXG5cdFx0aWNvbnM6IHt9IGFzIElNY3BJY29ucyxcblx0XHRkZWZpbml0aW9uLFxuXHRcdHZpc2liaWxpdHksXG5cdFx0dWlSZXNvdXJjZVVyaTogdW5kZWZpbmVkLFxuXHRcdGNhbGw6IChwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBjb250ZXh0LCBfdG9rZW4pID0+IHtcblx0XHRcdHJlY2VpdmVkQ29udGV4dHMucHVzaChjb250ZXh0KTtcblx0XHRcdHJldHVybiBjYWxsKHBhcmFtcyk7XG5cdFx0fSxcblx0XHRjYWxsV2l0aFByb2dyZXNzOiAocGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgX3Byb2dyZXNzLCBjb250ZXh0LCBfdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSA9PiB7XG5cdFx0XHRyZWNlaXZlZENvbnRleHRzLnB1c2goY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gY2FsbChwYXJhbXMpO1xuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRvb2wobmFtZTogc3RyaW5nLCBjYWxsOiAocGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gUHJvbWlzZTxNQ1AuQ2FsbFRvb2xSZXN1bHQ+LCB2aXNpYmlsaXR5OiBNY3BUb29sVmlzaWJpbGl0eSA9IE1jcFRvb2xWaXNpYmlsaXR5Lk1vZGVsKTogSU1jcFRvb2wge1xuXHRjb25zdCBkZWZpbml0aW9uOiBNQ1AuVG9vbCA9IHtcblx0XHRuYW1lLFxuXHRcdGRlc2NyaXB0aW9uOiBgVG9vbCAke25hbWV9YCxcblx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGlucHV0OiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHRpZDogYHRvb2xfJHtuYW1lfWAsXG5cdFx0cmVmZXJlbmNlTmFtZTogbmFtZSxcblx0XHRpY29uczoge30gYXMgSU1jcEljb25zLFxuXHRcdGRlZmluaXRpb24sXG5cdFx0dmlzaWJpbGl0eSxcblx0XHR1aVJlc291cmNlVXJpOiB1bmRlZmluZWQsXG5cdFx0Y2FsbDogKHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIF9jb250ZXh0LCBfdG9rZW4pID0+IGNhbGwocGFyYW1zKSxcblx0XHRjYWxsV2l0aFByb2dyZXNzOiAocGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgX3Byb2dyZXNzLCBfY29udGV4dCwgX3Rva2VuID0gQ2Fu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
