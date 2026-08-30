import * as assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { LanguageModelToolsConfirmationService } from "../../../browser/tools/languageModelToolsConfirmationService.js";
import { ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { computeCombinationKey } from "../../../common/tools/languageModelToolsConfirmationService.js";
import { ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
suite("LanguageModelToolsConfirmationService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  let instantiationService;
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
  });
  function createToolRef(toolId, source = ToolDataSource.Internal, parameters = {}) {
    return { toolId, source, parameters };
  }
  function createMcpToolRef(toolId, definitionId, serverLabel, parameters = {}) {
    return {
      toolId,
      source: {
        type: "mcp",
        label: serverLabel,
        serverLabel,
        instructions: void 0,
        collectionId: "testCollection",
        definitionId
      },
      parameters
    };
  }
  async function createCombinationRef(toolId, parameters, combinationLabel, combinationArgs) {
    return {
      ...createToolRef(toolId, ToolDataSource.Internal, parameters),
      combination: {
        label: combinationLabel,
        key: await computeCombinationKey(toolId, parameters),
        arguments: combinationArgs
      }
    };
  }
  test("getPreConfirmAction returns undefined by default", () => {
    const ref = createToolRef("testTool");
    const result = service.getPreConfirmAction(ref);
    assert.strictEqual(result, void 0);
  });
  test("getPostConfirmAction returns undefined by default", () => {
    const ref = createToolRef("testTool");
    const result = service.getPostConfirmAction(ref);
    assert.strictEqual(result, void 0);
  });
  test("getPreConfirmActions returns default tool-level actions", () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    assert.ok(actions.length >= 3);
    assert.ok(actions.some((a) => a.label.includes("Session")));
    assert.ok(actions.some((a) => a.label.includes("Workspace")));
    assert.ok(actions.some((a) => a.label.includes("Always Allow")));
  });
  test("getPostConfirmActions returns default tool-level actions", () => {
    const ref = createToolRef("testTool");
    const actions = service.getPostConfirmActions(ref);
    assert.ok(actions.length >= 3);
    assert.ok(actions.some((a) => a.label.includes("Session")));
    assert.ok(actions.some((a) => a.label.includes("Workspace")));
    assert.ok(actions.some((a) => a.label.includes("Always Allow")));
  });
  test("getPreConfirmActions includes server-level actions for MCP tools", () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref);
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Session")));
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Workspace")));
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Always Allow")));
  });
  test("getPostConfirmActions includes server-level actions for MCP tools", () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPostConfirmActions(ref);
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Session")));
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Workspace")));
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Always Allow")));
  });
  test("pre-execution session confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    const sessionAction = actions.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction);
    await sessionAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("pre-execution workspace confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    const workspaceAction = actions.find((a) => a.label.includes("Workspace") && !a.label.includes("Server"));
    assert.ok(workspaceAction);
    await workspaceAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("pre-execution profile confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    const profileAction = actions.find((a) => a.label.includes("Always Allow") && !a.label.includes("Server"));
    assert.ok(profileAction);
    await profileAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "profile" });
  });
  test("post-execution session confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPostConfirmActions(ref);
    const sessionAction = actions.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction);
    await sessionAction.select();
    const result = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("post-execution workspace confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPostConfirmActions(ref);
    const workspaceAction = actions.find((a) => a.label.includes("Workspace") && !a.label.includes("Server"));
    assert.ok(workspaceAction);
    await workspaceAction.select();
    const result = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("post-execution profile confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPostConfirmActions(ref);
    const profileAction = actions.find((a) => a.label.includes("Always Allow") && !a.label.includes("Server"));
    assert.ok(profileAction);
    await profileAction.select();
    const result = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "profile" });
  });
  test("MCP server-level pre-execution session confirmation works", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("MCP server-level pre-execution workspace confirmation works", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Workspace"));
    assert.ok(serverAction);
    await serverAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("MCP server-level pre-execution profile confirmation works", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Always Allow"));
    assert.ok(serverAction);
    await serverAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "profile" });
  });
  test("MCP server-level post-execution session confirmation works", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPostConfirmActions(ref);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    const result = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("MCP server-level confirmation applies to all tools from that server", async () => {
    const ref1 = createMcpToolRef("mcpTool1", "serverId", "Test Server");
    const ref2 = createMcpToolRef("mcpTool2", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref1);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    const result1 = service.getPreConfirmAction(ref1);
    const result2 = service.getPreConfirmAction(ref2);
    assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("tool-level confirmation takes precedence over server-level confirmation", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const serverActions = service.getPreConfirmActions(ref);
    const serverAction = serverActions.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    const toolActions = service.getPreConfirmActions(ref);
    const toolAction = toolActions.find((a) => !a.label.includes("Test Server") && a.label.includes("Workspace"));
    assert.ok(toolAction);
    await toolAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("registerConfirmationContribution allows custom pre-confirm actions", () => {
    const contribution = {
      getPreConfirmAction: (ref2) => {
        return { type: ToolConfirmKind.UserAction };
      }
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const result = service.getPreConfirmAction(ref);
    assert.ok(result);
    assert.strictEqual(result.type, ToolConfirmKind.UserAction);
  });
  test("registerConfirmationContribution allows custom post-confirm actions", () => {
    const contribution = {
      getPostConfirmAction: (ref2) => {
        return { type: ToolConfirmKind.UserAction };
      }
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const result = service.getPostConfirmAction(ref);
    assert.ok(result);
    assert.strictEqual(result.type, ToolConfirmKind.UserAction);
  });
  test("registerConfirmationContribution allows custom pre-confirm action list", () => {
    const customActions = [
      {
        label: "Custom Action 1",
        select: async () => true
      },
      {
        label: "Custom Action 2",
        select: async () => true
      }
    ];
    const contribution = {
      getPreConfirmActions: (ref2) => customActions
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const actions = service.getPreConfirmActions(ref);
    assert.ok(actions.some((a) => a.label === "Custom Action 1"));
    assert.ok(actions.some((a) => a.label === "Custom Action 2"));
    assert.ok(actions.some((a) => a.label.includes("Session")));
  });
  test("registerConfirmationContribution with canUseDefaultApprovals=false only shows custom actions", () => {
    const customActions = [
      {
        label: "Custom Action Only",
        select: async () => true
      }
    ];
    const contribution = {
      canUseDefaultApprovals: false,
      getPreConfirmActions: (ref2) => customActions
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const actions = service.getPreConfirmActions(ref);
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].label, "Custom Action Only");
  });
  test("contribution getPreConfirmAction takes precedence over default stores", () => {
    const contribution = {
      getPreConfirmAction: (ref2) => {
        return { type: ToolConfirmKind.UserAction };
      }
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const result = service.getPreConfirmAction(ref);
    assert.ok(result);
    assert.strictEqual(result.type, ToolConfirmKind.UserAction);
  });
  test("contribution with canUseDefaultApprovals=false prevents default store checks", () => {
    const contribution = {
      canUseDefaultApprovals: false,
      getPreConfirmAction: () => void 0
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const actions = service.getPreConfirmActions(ref);
    assert.strictEqual(actions.length, 0);
  });
  test("resetToolAutoConfirmation clears all confirmations", async () => {
    const ref1 = createToolRef("tool1");
    const ref2 = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions1 = service.getPreConfirmActions(ref1);
    const sessionAction1 = actions1.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction1);
    await sessionAction1.select();
    const actions2 = service.getPreConfirmActions(ref2);
    const serverAction = actions2.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    assert.ok(service.getPreConfirmAction(ref1));
    assert.ok(service.getPreConfirmAction(ref2));
    service.resetToolAutoConfirmation();
    assert.strictEqual(service.getPreConfirmAction(ref1), void 0);
    assert.strictEqual(service.getPreConfirmAction(ref2), void 0);
  });
  test("resetToolAutoConfirmation calls contribution reset", () => {
    let resetCalled = false;
    const contribution = {
      reset: () => {
        resetCalled = true;
      }
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    service.resetToolAutoConfirmation();
    assert.strictEqual(resetCalled, true);
  });
  test("disposing contribution registration removes it", () => {
    const contribution = {
      getPreConfirmAction: (ref2) => {
        return { type: ToolConfirmKind.UserAction };
      }
    };
    const disposable = service.registerConfirmationContribution("customTool", contribution);
    const ref = createToolRef("customTool");
    let result = service.getPreConfirmAction(ref);
    assert.ok(result);
    assert.strictEqual(result.type, ToolConfirmKind.UserAction);
    disposable.dispose();
    result = service.getPreConfirmAction(ref);
    assert.strictEqual(result, void 0);
  });
  test("different tools have independent confirmations", async () => {
    const ref1 = createToolRef("tool1");
    const ref2 = createToolRef("tool2");
    const actions1 = service.getPreConfirmActions(ref1);
    const sessionAction = actions1.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction);
    await sessionAction.select();
    const actions2 = service.getPreConfirmActions(ref2);
    const workspaceAction = actions2.find((a) => a.label.includes("Workspace") && !a.label.includes("Server"));
    assert.ok(workspaceAction);
    await workspaceAction.select();
    const result1 = service.getPreConfirmAction(ref1);
    const result2 = service.getPreConfirmAction(ref2);
    assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("pre and post execution confirmations are independent", async () => {
    const ref = createToolRef("testTool");
    const preActions = service.getPreConfirmActions(ref);
    const preSessionAction = preActions.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(preSessionAction);
    await preSessionAction.select();
    const postActions = service.getPostConfirmActions(ref);
    const postWorkspaceAction = postActions.find((a) => a.label.includes("Workspace") && !a.label.includes("Server"));
    assert.ok(postWorkspaceAction);
    await postWorkspaceAction.select();
    const preResult = service.getPreConfirmAction(ref);
    const postResult = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(preResult, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    assert.deepStrictEqual(postResult, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("different MCP servers have independent confirmations", async () => {
    const ref1 = createMcpToolRef("tool1", "server1", "Server 1");
    const ref2 = createMcpToolRef("tool2", "server2", "Server 2");
    const actions1 = service.getPreConfirmActions(ref1);
    const serverAction1 = actions1.find((a) => a.label.includes("Server 1") && a.label.includes("Session"));
    assert.ok(serverAction1);
    await serverAction1.select();
    const actions2 = service.getPreConfirmActions(ref2);
    const serverAction2 = actions2.find((a) => a.label.includes("Server 2") && a.label.includes("Workspace"));
    assert.ok(serverAction2);
    await serverAction2.select();
    const result1 = service.getPreConfirmAction(ref1);
    const result2 = service.getPreConfirmAction(ref2);
    assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("actions return true when select is called", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    for (const action of actions) {
      const result = await action.select();
      assert.strictEqual(result, true);
    }
  });
  test("session confirmations are stored in memory only", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    const sessionAction = actions.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction);
    await sessionAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    const newResult = newService.getPreConfirmAction(ref);
    assert.strictEqual(newResult, void 0);
  });
  test("combination actions are only offered when combinationLabel is set", async () => {
    const refWithout = createToolRef("testTool", ToolDataSource.Internal, { file: "foo.txt" });
    const actionsWithout = service.getPreConfirmActions(refWithout);
    assert.ok(!actionsWithout.some((a) => a.label.includes("foo.txt")));
    const refWith = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actionsWith = service.getPreConfirmActions(refWith);
    assert.ok(actionsWith.some((a) => a.label.includes('Allow reading "foo.txt"')));
  });
  test("combination actions include session, workspace, and profile scopes", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const combinationActions = actions.filter((a) => a.label.includes('Allow reading "foo.txt"'));
    assert.strictEqual(combinationActions.length, 3);
    assert.ok(combinationActions.some((a) => a.scope === "session"));
    assert.ok(combinationActions.some((a) => a.scope === "workspace"));
    assert.ok(combinationActions.some((a) => a.scope === "profile"));
  });
  test("selecting a combination session action auto-confirms the same parameters", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    assert.strictEqual(service.getPreConfirmAction(ref), void 0);
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "session");
    assert.ok(combinationAction);
    await combinationAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("selecting a combination workspace action stores at workspace scope", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "workspace");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.deepStrictEqual(service.getPreConfirmAction(ref), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("combination approval does not apply to different parameters", async () => {
    const refFoo = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const refBar = await createCombinationRef("testTool", { file: "bar.txt" }, 'Allow reading "bar.txt"');
    const actions = service.getPreConfirmActions(refFoo);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "session");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.ok(service.getPreConfirmAction(refFoo));
    assert.strictEqual(service.getPreConfirmAction(refBar), void 0);
  });
  test("tool-level approval takes precedence over combination approval", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const toolSessionAction = actions.find((a) => a.label.includes("Session") && !a.label.includes("foo.txt") && !a.label.includes("Server"));
    assert.ok(toolSessionAction);
    await toolSessionAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("combination approvals are cleared on reset", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "session");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.ok(service.getPreConfirmAction(ref));
    service.resetToolAutoConfirmation();
    assert.strictEqual(service.getPreConfirmAction(ref), void 0);
  });
  test("combination session approvals do not persist across service instances", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "session");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.ok(service.getPreConfirmAction(ref));
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    assert.strictEqual(newService.getPreConfirmAction(ref), void 0);
  });
  test("legacy string[] storage format is read correctly", () => {
    const storageService = instantiationService.get(IStorageService);
    storageService.store("chat/autoconfirm", JSON.stringify(["tool1", "tool2"]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    const ref1 = createToolRef("tool1");
    const ref2 = createToolRef("tool2");
    const ref3 = createToolRef("tool3");
    assert.deepStrictEqual(newService.getPreConfirmAction(ref1), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
    assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
    assert.strictEqual(newService.getPreConfirmAction(ref3), void 0);
  });
  test("new Record storage format preserves labels", () => {
    const storageService = instantiationService.get(IStorageService);
    const data = {
      "tool1:combination:12345": "Allow reading foo.txt",
      "tool2": true
    };
    storageService.store("chat/autoconfirm", JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    const ref2 = createToolRef("tool2");
    assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("object storage format with arguments round-trips across restart", () => {
    const storageService = instantiationService.get(IStorageService);
    const data = {
      "tool1:combination:12345": { label: "Allow reading foo.txt", arguments: '["foo.txt"]' },
      "tool2:combination:67890": { label: "Allow command with args" }
    };
    storageService.store("chat/autoconfirm-combination", JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    const ref1 = {
      ...createToolRef("tool1"),
      combination: { label: "Allow reading foo.txt", key: "tool1:combination:12345", arguments: '["foo.txt"]' }
    };
    const ref2 = {
      ...createToolRef("tool2"),
      combination: { label: "Allow command with args", key: "tool2:combination:67890" }
    };
    assert.deepStrictEqual(newService.getPreConfirmAction(ref1), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
    assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("combination approval with arguments persists via workspace scope", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"', '{"file":"foo.txt"}');
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "workspace");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.deepStrictEqual(service.getPreConfirmAction(ref), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHRvb2xzXFxsYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVDb21iaW5hdGlvbktleSwgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9ucywgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uLCBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHNlcnZpY2U6IExhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2U7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXG5cdFx0c2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRvb2xSZWYodG9vbElkOiBzdHJpbmcsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UgPSBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgcGFyYW1ldGVyczogdW5rbm93biA9IHt9KTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmIHtcblx0XHRyZXR1cm4geyB0b29sSWQsIHNvdXJjZSwgcGFyYW1ldGVycyB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTWNwVG9vbFJlZih0b29sSWQ6IHN0cmluZywgZGVmaW5pdGlvbklkOiBzdHJpbmcsIHNlcnZlckxhYmVsOiBzdHJpbmcsIHBhcmFtZXRlcnM6IHVua25vd24gPSB7fSk6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvb2xJZCxcblx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHR0eXBlOiAnbWNwJyxcblx0XHRcdFx0bGFiZWw6IHNlcnZlckxhYmVsLFxuXHRcdFx0XHRzZXJ2ZXJMYWJlbCxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbGxlY3Rpb25JZDogJ3Rlc3RDb2xsZWN0aW9uJyxcblx0XHRcdFx0ZGVmaW5pdGlvbklkXG5cdFx0XHR9LFxuXHRcdFx0cGFyYW1ldGVyc1xuXHRcdH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVDb21iaW5hdGlvblJlZih0b29sSWQ6IHN0cmluZywgcGFyYW1ldGVyczogdW5rbm93biwgY29tYmluYXRpb25MYWJlbDogc3RyaW5nLCBjb21iaW5hdGlvbkFyZ3M/OiBzdHJpbmcpOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZj4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jcmVhdGVUb29sUmVmKHRvb2xJZCwgVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsIHBhcmFtZXRlcnMpLFxuXHRcdFx0Y29tYmluYXRpb246IHtcblx0XHRcdFx0bGFiZWw6IGNvbWJpbmF0aW9uTGFiZWwsXG5cdFx0XHRcdGtleTogYXdhaXQgY29tcHV0ZUNvbWJpbmF0aW9uS2V5KHRvb2xJZCwgcGFyYW1ldGVycyksXG5cdFx0XHRcdGFyZ3VtZW50czogY29tYmluYXRpb25BcmdzLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZ2V0UHJlQ29uZmlybUFjdGlvbiByZXR1cm5zIHVuZGVmaW5lZCBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ3Rlc3RUb29sJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UG9zdENvbmZpcm1BY3Rpb24gcmV0dXJucyB1bmRlZmluZWQgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQcmVDb25maXJtQWN0aW9ucyByZXR1cm5zIGRlZmF1bHQgdG9vbC1sZXZlbCBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ3Rlc3RUb29sJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblxuXHRcdGFzc2VydC5vayhhY3Rpb25zLmxlbmd0aCA+PSAzKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKSk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1dvcmtzcGFjZScpKSk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdycpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBvc3RDb25maXJtQWN0aW9ucyByZXR1cm5zIGRlZmF1bHQgdG9vbC1sZXZlbCBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ3Rlc3RUb29sJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb25zKHJlZik7XG5cblx0XHRhc3NlcnQub2soYWN0aW9ucy5sZW5ndGggPj0gMyk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSkpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdXb3Jrc3BhY2UnKSkpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQcmVDb25maXJtQWN0aW9ucyBpbmNsdWRlcyBzZXJ2ZXItbGV2ZWwgYWN0aW9ucyBmb3IgTUNQIHRvb2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZU1jcFRvb2xSZWYoJ21jcFRvb2wnLCAnc2VydmVySWQnLCAnVGVzdCBTZXJ2ZXInKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKSk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnV29ya3NwYWNlJykpKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQb3N0Q29uZmlybUFjdGlvbnMgaW5jbHVkZXMgc2VydmVyLWxldmVsIGFjdGlvbnMgZm9yIE1DUCB0b29scycsICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVNY3BUb29sUmVmKCdtY3BUb29sJywgJ3NlcnZlcklkJywgJ1Rlc3QgU2VydmVyJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb25zKHJlZik7XG5cblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdXb3Jrc3BhY2UnKSkpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdUZXN0IFNlcnZlcicpICYmIGEubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdycpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZS1leGVjdXRpb24gc2Vzc2lvbiBjb25maXJtYXRpb24gd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHNlc3Npb25BY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykgJiYgIWEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlcicpKTtcblxuXHRcdGFzc2VydC5vayhzZXNzaW9uQWN0aW9uKTtcblx0XHRhd2FpdCBzZXNzaW9uQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZS1leGVjdXRpb24gd29ya3NwYWNlIGNvbmZpcm1hdGlvbiB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnV29ya3NwYWNlJykgJiYgIWEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlcicpKTtcblxuXHRcdGFzc2VydC5vayh3b3Jrc3BhY2VBY3Rpb24pO1xuXHRcdGF3YWl0IHdvcmtzcGFjZUFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZS1leGVjdXRpb24gcHJvZmlsZSBjb25maXJtYXRpb24gd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHByb2ZpbGVBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cnKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByb2ZpbGVBY3Rpb24pO1xuXHRcdGF3YWl0IHByb2ZpbGVBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdwcm9maWxlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncG9zdC1leGVjdXRpb24gc2Vzc2lvbiBjb25maXJtYXRpb24gd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCBzZXNzaW9uQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpICYmICFhLmxhYmVsLmluY2x1ZGVzKCdTZXJ2ZXInKSk7XG5cblx0XHRhc3NlcnQub2soc2Vzc2lvbkFjdGlvbik7XG5cdFx0YXdhaXQgc2Vzc2lvbkFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncG9zdC1leGVjdXRpb24gd29ya3NwYWNlIGNvbmZpcm1hdGlvbiB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1dvcmtzcGFjZScpICYmICFhLmxhYmVsLmluY2x1ZGVzKCdTZXJ2ZXInKSk7XG5cblx0XHRhc3NlcnQub2sod29ya3NwYWNlQWN0aW9uKTtcblx0XHRhd2FpdCB3b3Jrc3BhY2VBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncG9zdC1leGVjdXRpb24gcHJvZmlsZSBjb25maXJtYXRpb24gd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCBwcm9maWxlQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnQWx3YXlzIEFsbG93JykgJiYgIWEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlcicpKTtcblxuXHRcdGFzc2VydC5vayhwcm9maWxlQWN0aW9uKTtcblx0XHRhd2FpdCBwcm9maWxlQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3Byb2ZpbGUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNQ1Agc2VydmVyLWxldmVsIHByZS1leGVjdXRpb24gc2Vzc2lvbiBjb25maXJtYXRpb24gd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlTWNwVG9vbFJlZignbWNwVG9vbCcsICdzZXJ2ZXJJZCcsICdUZXN0IFNlcnZlcicpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3Qgc2VydmVyQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlcnZlckFjdGlvbik7XG5cdFx0YXdhaXQgc2VydmVyQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01DUCBzZXJ2ZXItbGV2ZWwgcHJlLWV4ZWN1dGlvbiB3b3Jrc3BhY2UgY29uZmlybWF0aW9uIHdvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZU1jcFRvb2xSZWYoJ21jcFRvb2wnLCAnc2VydmVySWQnLCAnVGVzdCBTZXJ2ZXInKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHNlcnZlckFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnV29ya3NwYWNlJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlcnZlckFjdGlvbik7XG5cdFx0YXdhaXQgc2VydmVyQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnTUNQIHNlcnZlci1sZXZlbCBwcmUtZXhlY3V0aW9uIHByb2ZpbGUgY29uZmlybWF0aW9uIHdvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZU1jcFRvb2xSZWYoJ21jcFRvb2wnLCAnc2VydmVySWQnLCAnVGVzdCBTZXJ2ZXInKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHNlcnZlckFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnQWx3YXlzIEFsbG93JykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlcnZlckFjdGlvbik7XG5cdFx0YXdhaXQgc2VydmVyQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAncHJvZmlsZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01DUCBzZXJ2ZXItbGV2ZWwgcG9zdC1leGVjdXRpb24gc2Vzc2lvbiBjb25maXJtYXRpb24gd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlTWNwVG9vbFJlZignbWNwVG9vbCcsICdzZXJ2ZXJJZCcsICdUZXN0IFNlcnZlcicpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHNlcnZlckFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKTtcblxuXHRcdGFzc2VydC5vayhzZXJ2ZXJBY3Rpb24pO1xuXHRcdGF3YWl0IHNlcnZlckFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnTUNQIHNlcnZlci1sZXZlbCBjb25maXJtYXRpb24gYXBwbGllcyB0byBhbGwgdG9vbHMgZnJvbSB0aGF0IHNlcnZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYxID0gY3JlYXRlTWNwVG9vbFJlZignbWNwVG9vbDEnLCAnc2VydmVySWQnLCAnVGVzdCBTZXJ2ZXInKTtcblx0XHRjb25zdCByZWYyID0gY3JlYXRlTWNwVG9vbFJlZignbWNwVG9vbDInLCAnc2VydmVySWQnLCAnVGVzdCBTZXJ2ZXInKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZjEpO1xuXHRcdGNvbnN0IHNlcnZlckFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKTtcblxuXHRcdGFzc2VydC5vayhzZXJ2ZXJBY3Rpb24pO1xuXHRcdGF3YWl0IHNlcnZlckFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHJlc3VsdDEgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMSk7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rvb2wtbGV2ZWwgY29uZmlybWF0aW9uIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBzZXJ2ZXItbGV2ZWwgY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZU1jcFRvb2xSZWYoJ21jcFRvb2wnLCAnc2VydmVySWQnLCAnVGVzdCBTZXJ2ZXInKTtcblxuXHRcdC8vIFNldCBzZXJ2ZXItbGV2ZWwgY29uZmlybWF0aW9uXG5cdFx0Y29uc3Qgc2VydmVyQWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCBzZXJ2ZXJBY3Rpb24gPSBzZXJ2ZXJBY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdUZXN0IFNlcnZlcicpICYmIGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZlckFjdGlvbik7XG5cdFx0YXdhaXQgc2VydmVyQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Ly8gU2V0IHRvb2wtbGV2ZWwgY29uZmlybWF0aW9uIHRvIGEgZGlmZmVyZW50IHNjb3BlXG5cdFx0Y29uc3QgdG9vbEFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3QgdG9vbEFjdGlvbiA9IHRvb2xBY3Rpb25zLmZpbmQoYSA9PiAhYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdXb3Jrc3BhY2UnKSk7XG5cdFx0YXNzZXJ0Lm9rKHRvb2xBY3Rpb24pO1xuXHRcdGF3YWl0IHRvb2xBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHQvLyBUb29sLWxldmVsIHNob3VsZCB0YWtlIHByZWNlZGVuY2Vcblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiBhbGxvd3MgY3VzdG9tIHByZS1jb25maXJtIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24gPSB7XG5cdFx0XHRnZXRQcmVDb25maXJtQWN0aW9uOiAocmVmKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uKCdjdXN0b21Ub29sJywgY29udHJpYnV0aW9uKSk7XG5cblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCdjdXN0b21Ub29sJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnR5cGUsIFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uKTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24gYWxsb3dzIGN1c3RvbSBwb3N0LWNvbmZpcm0gYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjb250cmlidXRpb246IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiA9IHtcblx0XHRcdGdldFBvc3RDb25maXJtQWN0aW9uOiAocmVmKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uKCdjdXN0b21Ub29sJywgY29udHJpYnV0aW9uKSk7XG5cblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCdjdXN0b21Ub29sJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbihyZWYpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50eXBlLCBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbik7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uIGFsbG93cyBjdXN0b20gcHJlLWNvbmZpcm0gYWN0aW9uIGxpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY3VzdG9tQWN0aW9uczogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N1c3RvbSBBY3Rpb24gMScsXG5cdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4gdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdXN0b20gQWN0aW9uIDInLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24gPSB7XG5cdFx0XHRnZXRQcmVDb25maXJtQWN0aW9uczogKHJlZikgPT4gY3VzdG9tQWN0aW9uc1xuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbignY3VzdG9tVG9vbCcsIGNvbnRyaWJ1dGlvbikpO1xuXG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZignY3VzdG9tVG9vbCcpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cblx0XHQvLyBTaG91bGQgaW5jbHVkZSBib3RoIGN1c3RvbSBhY3Rpb25zIGFuZCBkZWZhdWx0IGFjdGlvbnNcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbCA9PT0gJ0N1c3RvbSBBY3Rpb24gMScpKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbCA9PT0gJ0N1c3RvbSBBY3Rpb24gMicpKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uIHdpdGggY2FuVXNlRGVmYXVsdEFwcHJvdmFscz1mYWxzZSBvbmx5IHNob3dzIGN1c3RvbSBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN1c3RvbUFjdGlvbnM6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkFjdGlvbnNbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdXN0b20gQWN0aW9uIE9ubHknLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24gPSB7XG5cdFx0XHRjYW5Vc2VEZWZhdWx0QXBwcm92YWxzOiBmYWxzZSxcblx0XHRcdGdldFByZUNvbmZpcm1BY3Rpb25zOiAocmVmKSA9PiBjdXN0b21BY3Rpb25zXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uKCdjdXN0b21Ub29sJywgY29udHJpYnV0aW9uKSk7XG5cblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCdjdXN0b21Ub29sJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0ubGFiZWwsICdDdXN0b20gQWN0aW9uIE9ubHknKTtcblx0fSk7XG5cblx0dGVzdCgnY29udHJpYnV0aW9uIGdldFByZUNvbmZpcm1BY3Rpb24gdGFrZXMgcHJlY2VkZW5jZSBvdmVyIGRlZmF1bHQgc3RvcmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uID0ge1xuXHRcdFx0Z2V0UHJlQ29uZmlybUFjdGlvbjogKHJlZikgPT4ge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbignY3VzdG9tVG9vbCcsIGNvbnRyaWJ1dGlvbikpO1xuXG5cdFx0Ly8gQ29udHJpYnV0aW9uIHNob3VsZCB0YWtlIHByZWNlZGVuY2UgZXZlbiB3aXRob3V0IHNldHRpbmcgZGVmYXVsdFxuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ2N1c3RvbVRvb2wnKTtcblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnR5cGUsIFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uKTtcblx0fSk7XG5cblx0dGVzdCgnY29udHJpYnV0aW9uIHdpdGggY2FuVXNlRGVmYXVsdEFwcHJvdmFscz1mYWxzZSBwcmV2ZW50cyBkZWZhdWx0IHN0b3JlIGNoZWNrcycsICgpID0+IHtcblx0XHRjb25zdCBjb250cmlidXRpb246IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiA9IHtcblx0XHRcdGNhblVzZURlZmF1bHRBcHByb3ZhbHM6IGZhbHNlLFxuXHRcdFx0Z2V0UHJlQ29uZmlybUFjdGlvbjogKCkgPT4gdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uKCdjdXN0b21Ub29sJywgY29udHJpYnV0aW9uKSk7XG5cblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCdjdXN0b21Ub29sJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblxuXHRcdC8vIFNob3VsZCBoYXZlIG5vIGFjdGlvbnMgc2luY2UgY2FuVXNlRGVmYXVsdEFwcHJvdmFscyBpcyBmYWxzZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2V0VG9vbEF1dG9Db25maXJtYXRpb24gY2xlYXJzIGFsbCBjb25maXJtYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZjEgPSBjcmVhdGVUb29sUmVmKCd0b29sMScpO1xuXHRcdGNvbnN0IHJlZjIgPSBjcmVhdGVNY3BUb29sUmVmKCdtY3BUb29sJywgJ3NlcnZlcklkJywgJ1Rlc3QgU2VydmVyJyk7XG5cblx0XHQvLyBTZXQgc29tZSBjb25maXJtYXRpb25zXG5cdFx0Y29uc3QgYWN0aW9uczEgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZjEpO1xuXHRcdGNvbnN0IHNlc3Npb25BY3Rpb24xID0gYWN0aW9uczEuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uQWN0aW9uMSk7XG5cdFx0YXdhaXQgc2Vzc2lvbkFjdGlvbjEuc2VsZWN0KCk7XG5cblx0XHRjb25zdCBhY3Rpb25zMiA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmMik7XG5cdFx0Y29uc3Qgc2VydmVyQWN0aW9uID0gYWN0aW9uczIuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKTtcblx0XHRhc3NlcnQub2soc2VydmVyQWN0aW9uKTtcblx0XHRhd2FpdCBzZXJ2ZXJBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHQvLyBWZXJpZnkgdGhleSdyZSBzZXRcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjEpKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjIpKTtcblxuXHRcdC8vIFJlc2V0XG5cdFx0c2VydmljZS5yZXNldFRvb2xBdXRvQ29uZmlybWF0aW9uKCk7XG5cblx0XHQvLyBWZXJpZnkgdGhleSdyZSBjbGVhcmVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYxKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjIpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldFRvb2xBdXRvQ29uZmlybWF0aW9uIGNhbGxzIGNvbnRyaWJ1dGlvbiByZXNldCcsICgpID0+IHtcblx0XHRsZXQgcmVzZXRDYWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCBjb250cmlidXRpb246IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiA9IHtcblx0XHRcdHJlc2V0OiAoKSA9PiB7XG5cdFx0XHRcdHJlc2V0Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24oJ2N1c3RvbVRvb2wnLCBjb250cmlidXRpb24pKTtcblxuXHRcdHNlcnZpY2UucmVzZXRUb29sQXV0b0NvbmZpcm1hdGlvbigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc2V0Q2FsbGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zaW5nIGNvbnRyaWJ1dGlvbiByZWdpc3RyYXRpb24gcmVtb3ZlcyBpdCcsICgpID0+IHtcblx0XHRjb25zdCBjb250cmlidXRpb246IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiA9IHtcblx0XHRcdGdldFByZUNvbmZpcm1BY3Rpb246IChyZWYpID0+IHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHNlcnZpY2UucmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24oJ2N1c3RvbVRvb2wnLCBjb250cmlidXRpb24pO1xuXG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZignY3VzdG9tVG9vbCcpO1xuXHRcdGxldCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnR5cGUsIFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0cmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IHRvb2xzIGhhdmUgaW5kZXBlbmRlbnQgY29uZmlybWF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYxID0gY3JlYXRlVG9vbFJlZigndG9vbDEnKTtcblx0XHRjb25zdCByZWYyID0gY3JlYXRlVG9vbFJlZigndG9vbDInKTtcblxuXHRcdC8vIFNldCBzZXNzaW9uIGZvciB0b29sMVxuXHRcdGNvbnN0IGFjdGlvbnMxID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYxKTtcblx0XHRjb25zdCBzZXNzaW9uQWN0aW9uID0gYWN0aW9uczEuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uQWN0aW9uKTtcblx0XHRhd2FpdCBzZXNzaW9uQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Ly8gU2V0IHdvcmtzcGFjZSBmb3IgdG9vbDJcblx0XHRjb25zdCBhY3Rpb25zMiA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmMik7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQWN0aW9uID0gYWN0aW9uczIuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1dvcmtzcGFjZScpICYmICFhLmxhYmVsLmluY2x1ZGVzKCdTZXJ2ZXInKSk7XG5cdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZUFjdGlvbik7XG5cdFx0YXdhaXQgd29ya3NwYWNlQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZXkncmUgaW5kZXBlbmRlbnRcblx0XHRjb25zdCByZXN1bHQxID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjEpO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDEsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZSBhbmQgcG9zdCBleGVjdXRpb24gY29uZmlybWF0aW9ucyBhcmUgaW5kZXBlbmRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblxuXHRcdC8vIFNldCBwcmUtZXhlY3V0aW9uIHRvIHNlc3Npb25cblx0XHRjb25zdCBwcmVBY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHByZVNlc3Npb25BY3Rpb24gPSBwcmVBY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykgJiYgIWEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlcicpKTtcblx0XHRhc3NlcnQub2socHJlU2Vzc2lvbkFjdGlvbik7XG5cdFx0YXdhaXQgcHJlU2Vzc2lvbkFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdC8vIFNldCBwb3N0LWV4ZWN1dGlvbiB0byB3b3Jrc3BhY2Vcblx0XHRjb25zdCBwb3N0QWN0aW9ucyA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3QgcG9zdFdvcmtzcGFjZUFjdGlvbiA9IHBvc3RBY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdXb3Jrc3BhY2UnKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXHRcdGFzc2VydC5vayhwb3N0V29ya3NwYWNlQWN0aW9uKTtcblx0XHRhd2FpdCBwb3N0V29ya3NwYWNlQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZXkncmUgaW5kZXBlbmRlbnRcblx0XHRjb25zdCBwcmVSZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRjb25zdCBwb3N0UmVzdWx0ID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbihyZWYpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVSZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwb3N0UmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmZlcmVudCBNQ1Agc2VydmVycyBoYXZlIGluZGVwZW5kZW50IGNvbmZpcm1hdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmMSA9IGNyZWF0ZU1jcFRvb2xSZWYoJ3Rvb2wxJywgJ3NlcnZlcjEnLCAnU2VydmVyIDEnKTtcblx0XHRjb25zdCByZWYyID0gY3JlYXRlTWNwVG9vbFJlZigndG9vbDInLCAnc2VydmVyMicsICdTZXJ2ZXIgMicpO1xuXG5cdFx0Ly8gU2V0IHNlcnZlcjEgdG8gc2Vzc2lvblxuXHRcdGNvbnN0IGFjdGlvbnMxID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYxKTtcblx0XHRjb25zdCBzZXJ2ZXJBY3Rpb24xID0gYWN0aW9uczEuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlciAxJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKTtcblx0XHRhc3NlcnQub2soc2VydmVyQWN0aW9uMSk7XG5cdFx0YXdhaXQgc2VydmVyQWN0aW9uMS5zZWxlY3QoKTtcblxuXHRcdC8vIFNldCBzZXJ2ZXIyIHRvIHdvcmtzcGFjZVxuXHRcdGNvbnN0IGFjdGlvbnMyID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYyKTtcblx0XHRjb25zdCBzZXJ2ZXJBY3Rpb24yID0gYWN0aW9uczIuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlciAyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnV29ya3NwYWNlJykpO1xuXHRcdGFzc2VydC5vayhzZXJ2ZXJBY3Rpb24yKTtcblx0XHRhd2FpdCBzZXJ2ZXJBY3Rpb24yLnNlbGVjdCgpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZXkncmUgaW5kZXBlbmRlbnRcblx0XHRjb25zdCByZXN1bHQxID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjEpO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDEsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGlvbnMgcmV0dXJuIHRydWUgd2hlbiBzZWxlY3QgaXMgY2FsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ3Rlc3RUb29sJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblxuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFjdGlvbi5zZWxlY3QoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBjb25maXJtYXRpb25zIGFyZSBzdG9yZWQgaW4gbWVtb3J5IG9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHNlc3Npb25BY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykgJiYgIWEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlcicpKTtcblxuXHRcdGFzc2VydC5vayhzZXNzaW9uQWN0aW9uKTtcblx0XHRhd2FpdCBzZXNzaW9uQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Ly8gVmVyaWZ5IGl0J3Mgc2V0XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfSk7XG5cblx0XHQvLyBDcmVhdGUgbmV3IHNlcnZpY2UgaW5zdGFuY2UgKHNpbXVsYXRpbmcgcmVzdGFydClcblx0XHRjb25zdCBuZXdTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UpKTtcblxuXHRcdC8vIFNlc3Npb24gY29uZmlybWF0aW9uIHNob3VsZCBub3QgcGVyc2lzdFxuXHRcdGNvbnN0IG5ld1Jlc3VsdCA9IG5ld1NlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdSZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbWJpbmF0aW9uIGFjdGlvbnMgYXJlIG9ubHkgb2ZmZXJlZCB3aGVuIGNvbWJpbmF0aW9uTGFiZWwgaXMgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZldpdGhvdXQgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcsIFRvb2xEYXRhU291cmNlLkludGVybmFsLCB7IGZpbGU6ICdmb28udHh0JyB9KTtcblx0XHRjb25zdCBhY3Rpb25zV2l0aG91dCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmV2l0aG91dCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3Rpb25zV2l0aG91dC5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnZm9vLnR4dCcpKSk7XG5cblx0XHRjb25zdCByZWZXaXRoID0gYXdhaXQgY3JlYXRlQ29tYmluYXRpb25SZWYoJ3Rlc3RUb29sJywgeyBmaWxlOiAnZm9vLnR4dCcgfSwgJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKTtcblx0XHRjb25zdCBhY3Rpb25zV2l0aCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmV2l0aCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnNXaXRoLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJykpKTtcblx0fSk7XG5cblx0dGVzdCgnY29tYmluYXRpb24gYWN0aW9ucyBpbmNsdWRlIHNlc3Npb24sIHdvcmtzcGFjZSwgYW5kIHByb2ZpbGUgc2NvcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IGNyZWF0ZUNvbWJpbmF0aW9uUmVmKCd0ZXN0VG9vbCcsIHsgZmlsZTogJ2Zvby50eHQnIH0sICdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCBjb21iaW5hdGlvbkFjdGlvbnMgPSBhY3Rpb25zLmZpbHRlcihhID0+IGEubGFiZWwuaW5jbHVkZXMoJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbWJpbmF0aW9uQWN0aW9ucy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5vayhjb21iaW5hdGlvbkFjdGlvbnMuc29tZShhID0+IGEuc2NvcGUgPT09ICdzZXNzaW9uJykpO1xuXHRcdGFzc2VydC5vayhjb21iaW5hdGlvbkFjdGlvbnMuc29tZShhID0+IGEuc2NvcGUgPT09ICd3b3Jrc3BhY2UnKSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbWJpbmF0aW9uQWN0aW9ucy5zb21lKGEgPT4gYS5zY29wZSA9PT0gJ3Byb2ZpbGUnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGluZyBhIGNvbWJpbmF0aW9uIHNlc3Npb24gYWN0aW9uIGF1dG8tY29uZmlybXMgdGhlIHNhbWUgcGFyYW1ldGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCBjcmVhdGVDb21iaW5hdGlvblJlZigndGVzdFRvb2wnLCB7IGZpbGU6ICdmb28udHh0JyB9LCAnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCBjb21iaW5hdGlvbkFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKSAmJiBhLnNjb3BlID09PSAnc2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhjb21iaW5hdGlvbkFjdGlvbik7XG5cdFx0YXdhaXQgY29tYmluYXRpb25BY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0aW5nIGEgY29tYmluYXRpb24gd29ya3NwYWNlIGFjdGlvbiBzdG9yZXMgYXQgd29ya3NwYWNlIHNjb3BlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IGNyZWF0ZUNvbWJpbmF0aW9uUmVmKCd0ZXN0VG9vbCcsIHsgZmlsZTogJ2Zvby50eHQnIH0sICdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJyk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IGNvbWJpbmF0aW9uQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpICYmIGEuc2NvcGUgPT09ICd3b3Jrc3BhY2UnKTtcblx0XHRhc3NlcnQub2soY29tYmluYXRpb25BY3Rpb24pO1xuXHRcdGF3YWl0IGNvbWJpbmF0aW9uQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21iaW5hdGlvbiBhcHByb3ZhbCBkb2VzIG5vdCBhcHBseSB0byBkaWZmZXJlbnQgcGFyYW1ldGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWZGb28gPSBhd2FpdCBjcmVhdGVDb21iaW5hdGlvblJlZigndGVzdFRvb2wnLCB7IGZpbGU6ICdmb28udHh0JyB9LCAnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpO1xuXHRcdGNvbnN0IHJlZkJhciA9IGF3YWl0IGNyZWF0ZUNvbWJpbmF0aW9uUmVmKCd0ZXN0VG9vbCcsIHsgZmlsZTogJ2Jhci50eHQnIH0sICdBbGxvdyByZWFkaW5nIFwiYmFyLnR4dFwiJyk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWZGb28pO1xuXHRcdGNvbnN0IGNvbWJpbmF0aW9uQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpICYmIGEuc2NvcGUgPT09ICdzZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbWJpbmF0aW9uQWN0aW9uKTtcblx0XHRhd2FpdCBjb21iaW5hdGlvbkFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmRm9vKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWZCYXIpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sLWxldmVsIGFwcHJvdmFsIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBjb21iaW5hdGlvbiBhcHByb3ZhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCBjcmVhdGVDb21iaW5hdGlvblJlZigndGVzdFRvb2wnLCB7IGZpbGU6ICdmb28udHh0JyB9LCAnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCB0b29sU2Vzc2lvbkFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKVxuXHRcdFx0JiYgIWEubGFiZWwuaW5jbHVkZXMoJ2Zvby50eHQnKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXHRcdGFzc2VydC5vayh0b29sU2Vzc2lvbkFjdGlvbik7XG5cdFx0YXdhaXQgdG9vbFNlc3Npb25BY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tYmluYXRpb24gYXBwcm92YWxzIGFyZSBjbGVhcmVkIG9uIHJlc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IGNyZWF0ZUNvbWJpbmF0aW9uUmVmKCd0ZXN0VG9vbCcsIHsgZmlsZTogJ2Zvby50eHQnIH0sICdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJyk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IGNvbWJpbmF0aW9uQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpICYmIGEuc2NvcGUgPT09ICdzZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbWJpbmF0aW9uQWN0aW9uKTtcblx0XHRhd2FpdCBjb21iaW5hdGlvbkFjdGlvbi5zZWxlY3QoKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZikpO1xuXG5cdFx0c2VydmljZS5yZXNldFRvb2xBdXRvQ29uZmlybWF0aW9uKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21iaW5hdGlvbiBzZXNzaW9uIGFwcHJvdmFscyBkbyBub3QgcGVyc2lzdCBhY3Jvc3Mgc2VydmljZSBpbnN0YW5jZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgY3JlYXRlQ29tYmluYXRpb25SZWYoJ3Rlc3RUb29sJywgeyBmaWxlOiAnZm9vLnR4dCcgfSwgJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3QgY29tYmluYXRpb25BY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJykgJiYgYS5zY29wZSA9PT0gJ3Nlc3Npb24nKTtcblx0XHRhc3NlcnQub2soY29tYmluYXRpb25BY3Rpb24pO1xuXHRcdGF3YWl0IGNvbWJpbmF0aW9uQWN0aW9uLnNlbGVjdCgpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKSk7XG5cblx0XHRjb25zdCBuZXdTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3U2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZiksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlZ2FjeSBzdHJpbmdbXSBzdG9yYWdlIGZvcm1hdCBpcyByZWFkIGNvcnJlY3RseScsICgpID0+IHtcblx0XHQvLyBQcmUtc2VlZCBzdG9yYWdlIHdpdGggdGhlIGxlZ2FjeSBzdHJpbmdbXSBmb3JtYXRcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0L2F1dG9jb25maXJtJywgSlNPTi5zdHJpbmdpZnkoWyd0b29sMScsICd0b29sMiddKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdC8vIENyZWF0ZSBhIG5ldyBzZXJ2aWNlIGluc3RhbmNlIHRoYXQgcmVhZHMgdGhlIGxlZ2FjeSBkYXRhXG5cdFx0Y29uc3QgbmV3U2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKSk7XG5cblx0XHRjb25zdCByZWYxID0gY3JlYXRlVG9vbFJlZigndG9vbDEnKTtcblx0XHRjb25zdCByZWYyID0gY3JlYXRlVG9vbFJlZigndG9vbDInKTtcblx0XHRjb25zdCByZWYzID0gY3JlYXRlVG9vbFJlZigndG9vbDMnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3U2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjEpLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdTZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMiksIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3U2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjMpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgUmVjb3JkIHN0b3JhZ2UgZm9ybWF0IHByZXNlcnZlcyBsYWJlbHMnLCAoKSA9PiB7XG5cdFx0Ly8gUHJlLXNlZWQgc3RvcmFnZSB3aXRoIHRoZSBuZXcgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbj4gZm9ybWF0XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPiA9IHtcblx0XHRcdCd0b29sMTpjb21iaW5hdGlvbjoxMjM0NSc6ICdBbGxvdyByZWFkaW5nIGZvby50eHQnLFxuXHRcdFx0J3Rvb2wyJzogdHJ1ZSxcblx0XHR9O1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdjaGF0L2F1dG9jb25maXJtJywgSlNPTi5zdHJpbmdpZnkoZGF0YSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRjb25zdCBuZXdTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UpKTtcblxuXHRcdC8vIHRvb2wyIHNob3VsZCBiZSBhdXRvLWNvbmZpcm1lZCAoYm9vbGVhbiB0cnVlLCBubyBsYWJlbClcblx0XHRjb25zdCByZWYyID0gY3JlYXRlVG9vbFJlZigndG9vbDInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1NlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYyKSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvYmplY3Qgc3RvcmFnZSBmb3JtYXQgd2l0aCBhcmd1bWVudHMgcm91bmQtdHJpcHMgYWNyb3NzIHJlc3RhcnQnLCAoKSA9PiB7XG5cdFx0Ly8gUHJlLXNlZWQgc3RvcmFnZSB3aXRoIHRoZSBuZXcgb2JqZWN0IGZvcm1hdCBjb250YWluaW5nIGFyZ3VtZW50c1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbiB8IHsgbGFiZWw/OiBzdHJpbmc7IGFyZ3VtZW50cz86IHN0cmluZyB9PiA9IHtcblx0XHRcdCd0b29sMTpjb21iaW5hdGlvbjoxMjM0NSc6IHsgbGFiZWw6ICdBbGxvdyByZWFkaW5nIGZvby50eHQnLCBhcmd1bWVudHM6ICdbXCJmb28udHh0XCJdJyB9LFxuXHRcdFx0J3Rvb2wyOmNvbWJpbmF0aW9uOjY3ODkwJzogeyBsYWJlbDogJ0FsbG93IGNvbW1hbmQgd2l0aCBhcmdzJyB9LFxuXHRcdH07XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NoYXQvYXV0b2NvbmZpcm0tY29tYmluYXRpb24nLCBKU09OLnN0cmluZ2lmeShkYXRhKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnN0IG5ld1NlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSkpO1xuXG5cdFx0Ly8gQm90aCBjb21iaW5hdGlvbiBrZXlzIHNob3VsZCBiZSBhdXRvLWNvbmZpcm1lZFxuXHRcdGNvbnN0IHJlZjE6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZiA9IHtcblx0XHRcdC4uLmNyZWF0ZVRvb2xSZWYoJ3Rvb2wxJyksXG5cdFx0XHRjb21iaW5hdGlvbjogeyBsYWJlbDogJ0FsbG93IHJlYWRpbmcgZm9vLnR4dCcsIGtleTogJ3Rvb2wxOmNvbWJpbmF0aW9uOjEyMzQ1JywgYXJndW1lbnRzOiAnW1wiZm9vLnR4dFwiXScgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlZjI6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZiA9IHtcblx0XHRcdC4uLmNyZWF0ZVRvb2xSZWYoJ3Rvb2wyJyksXG5cdFx0XHRjb21iaW5hdGlvbjogeyBsYWJlbDogJ0FsbG93IGNvbW1hbmQgd2l0aCBhcmdzJywga2V5OiAndG9vbDI6Y29tYmluYXRpb246Njc4OTAnIH0sXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3U2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjEpLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdTZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMiksIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tYmluYXRpb24gYXBwcm92YWwgd2l0aCBhcmd1bWVudHMgcGVyc2lzdHMgdmlhIHdvcmtzcGFjZSBzY29wZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCBjcmVhdGVDb21iaW5hdGlvblJlZigndGVzdFRvb2wnLCB7IGZpbGU6ICdmb28udHh0JyB9LCAnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicsICd7XCJmaWxlXCI6XCJmb28udHh0XCJ9Jyk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IGNvbWJpbmF0aW9uQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpICYmIGEuc2NvcGUgPT09ICd3b3Jrc3BhY2UnKTtcblx0XHRhc3NlcnQub2soY29tYmluYXRpb25BY3Rpb24pO1xuXHRcdGF3YWl0IGNvbWJpbmF0aW9uQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsaUJBQWlCLHdCQUF3QixjQUFjLHFCQUFxQjtBQUNyRixTQUFTLDZDQUE2QztBQUN0RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUFtSjtBQUM1SixTQUFTLHNCQUFzQjtBQUUvQixNQUFNLHlDQUF5QyxNQUFNO0FBQ3BELFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCwyQkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDL0Qs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
