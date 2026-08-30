import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ContextKeyService } from "../../../../../../platform/contextkey/browser/contextKeyService.js";
import { ContextKeyExpr, RawContextKey } from "../../../../../../platform/contextkey/common/contextkey.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { applyCodexAgentHostPreference, ChatSessionsService } from "../../../browser/chatSessions/chatSessions.contribution.js";
import { ChatSessionOptionsMap, SessionType } from "../../../common/chatSessionsService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId, GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE, protectedResourcesRequireGitHubCopilotSignIn } from "../../../../../../platform/agentHost/common/agentService.js";
import { IsSessionsWindowContext } from "../../../../../common/contextkeys.js";
suite("Codex Agent Host preference", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function isCodexExtensionHostAvailable(options) {
    const configurationService = new TestConfigurationService({
      [AgentHostCodexAgentEnabledSettingId]: options.codexAgentEnabled,
      [CodexPreferAgentHostEditorSettingId]: options.preferAgentHost
    });
    const contextKeyService = store.add(new ContextKeyService(configurationService));
    AGENT_HOST_ENABLED_CONTEXT_KEY.bindTo(contextKeyService).set(options.agentHostEnabled);
    IsSessionsWindowContext.bindTo(contextKeyService).set(options.isSessionsWindow);
    const contribution = applyCodexAgentHostPreference({
      type: SessionType.Codex,
      name: "codex",
      displayName: "Codex",
      description: ""
    });
    const when = ContextKeyExpr.deserialize(contribution.when);
    return !!when && contextKeyService.contextMatchesRules(when);
  }
  test("never surfaces extension-host Codex in the Agents window and replaces it when preferred in the editor", () => {
    assert.deepStrictEqual({
      agentsWindowPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: true, preferAgentHost: true }),
      agentsWindowNotPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: true, preferAgentHost: false }),
      agentsWindowAgentHostDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: false, codexAgentEnabled: false, isSessionsWindow: true, preferAgentHost: false }),
      editorWindowPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: true }),
      editorWindowNotPreferred: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: false }),
      agentHostDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: false, codexAgentEnabled: true, isSessionsWindow: false, preferAgentHost: true }),
      codexAgentDisabled: isCodexExtensionHostAvailable({ agentHostEnabled: true, codexAgentEnabled: false, isSessionsWindow: false, preferAgentHost: true })
    }, {
      agentsWindowPreferred: false,
      agentsWindowNotPreferred: false,
      agentsWindowAgentHostDisabled: false,
      editorWindowPreferred: false,
      editorWindowNotPreferred: true,
      agentHostDisabled: true,
      codexAgentDisabled: true
    });
  });
});
suite.skip("ChatSessionsService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let chatSessionsService;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    chatSessionsService = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  suite("extractFileNameFromLink", () => {
    function callExtractFileNameFromLink(filePath) {
      return chatSessionsService["extractFileNameFromLink"](filePath);
    }
    test("should extract filename from markdown link with link text", () => {
      const input = "Read [README](file:///path/to/README.md) for more info";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Read README for more info");
    });
    test("should extract filename from markdown link without link text", () => {
      const input = "Read [](file:///index.js) for instructions";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Read index.js for instructions");
    });
    test("should extract filename from markdown link with empty link text", () => {
      const input = "Check [  ](file:///config.json) settings";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Check config.json settings");
    });
    test("should handle multiple file links in same string", () => {
      const input = "See [main](file:///main.js) and [utils](file:///utils/helper.ts)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "See main and utils");
    });
    test("should handle file path without extension", () => {
      const input = "Open [](file:///src/components/Button)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Open Button");
    });
    test("should handle deep file paths", () => {
      const input = "Edit [](file:///very/deep/nested/path/to/file.tsx)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Edit file.tsx");
    });
    test("should handle file path that is just a filename", () => {
      const input = "View [script](file:///script.py)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "View script");
    });
    test("should handle link text with special characters", () => {
      const input = "See [App.js (main)](file:///App.js)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "See App.js (main)");
    });
    test("should return original string if no file links present", () => {
      const input = "This is just regular text with no links";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "This is just regular text with no links");
    });
    test("should handle mixed content with file links and regular text", () => {
      const input = "Check [config](file:///config.yml) and visit https://example.com";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Check config and visit https://example.com");
    });
    test("should handle file path with query parameters or fragments", () => {
      const input = "Open [](file:///index.html?param=value#section)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Open index.html?param=value#section");
    });
    test("should handle Windows-style paths", () => {
      const input = "Edit [](file:///C:/Users/user/Documents/file.txt)";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "Edit file.txt");
    });
    test("should preserve whitespace around replacements", () => {
      const input = "   Check [](file:///test.js)   ";
      const result = callExtractFileNameFromLink(input);
      assert.strictEqual(result, "   Check test.js   ");
    });
  });
});
suite("ChatSessionsService - getChatSessionItems availability", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const GATED_TYPE = "gated-type";
  const UNGATED_TYPE = "ungated-type";
  const gatedKey = new RawContextKey("test.gatedTypeEnabled", false);
  let service;
  let contextKeyService;
  let gatedEnabled;
  class FakeItemController {
    constructor(_type) {
      this._type = _type;
      this._onDidChange = store.add(new Emitter());
      this.onDidChangeChatSessionItems = this._onDidChange.event;
    }
    get items() {
      return [{
        resource: URI.from({ scheme: this._type, path: `/session-1` }),
        label: `${this._type} session`,
        timing: { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 }
      }];
    }
    async refresh() {
    }
  }
  function registerType(type, when) {
    const contribution = { type, name: type, displayName: type, description: "", when };
    store.add(service.registerChatSessionContribution(contribution));
    store.add(service.registerChatSessionItemController(type, new FakeItemController(type)));
  }
  async function resolvedTypes() {
    const types = [];
    for await (const { chatSessionType, items } of service.getChatSessionItems(void 0, CancellationToken.None)) {
      if (items.length > 0) {
        types.push(chatSessionType);
      }
    }
    return types.sort();
  }
  setup(() => {
    const configurationService = new TestConfigurationService();
    contextKeyService = store.add(new ContextKeyService(configurationService));
    gatedEnabled = gatedKey.bindTo(contextKeyService);
    const instantiationService = store.add(workbenchInstantiationService({
      contextKeyService: () => contextKeyService,
      configurationService: () => configurationService
    }, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
    registerType(GATED_TYPE, `${gatedKey.key}`);
    registerType(UNGATED_TYPE, void 0);
  });
  test("excludes a type whose contribution `when` is false", async () => {
    gatedEnabled.set(false);
    assert.deepStrictEqual(await resolvedTypes(), [UNGATED_TYPE]);
  });
  test("includes a type whose contribution `when` is true", async () => {
    gatedEnabled.set(true);
    assert.deepStrictEqual(await resolvedTypes(), [GATED_TYPE, UNGATED_TYPE]);
  });
  test("reflects a runtime `when` flip without re-registration", async () => {
    gatedEnabled.set(true);
    assert.deepStrictEqual(await resolvedTypes(), [GATED_TYPE, UNGATED_TYPE]);
    gatedEnabled.set(false);
    assert.deepStrictEqual(await resolvedTypes(), [UNGATED_TYPE]);
  });
});
suite("ChatSessionsService - requiresCopilotSignInForSessionType", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  function register(type, extra) {
    store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: "", ...extra }));
  }
  test("evaluates a functional requiresCopilotSignIn, and reads a static flag otherwise", () => {
    register("static-required", { requiresCopilotSignIn: true });
    register("static-not-required", { requiresCopilotSignIn: false });
    const resourcesByProvider = {
      proxy: [GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE],
      native: [{ ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false }, GITHUB_REPO_PROTECTED_RESOURCE],
      "codex-openai": [{ ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false }],
      unresolved: void 0
    };
    const derive = (provider) => () => {
      const resources = resourcesByProvider[provider];
      return resources !== void 0 ? protectedResourcesRequireGitHubCopilotSignIn(resources) : true;
    };
    register("ah-proxy", { agentHostProviderId: "proxy", requiresCopilotSignIn: derive("proxy") });
    register("ah-native", { agentHostProviderId: "native", requiresCopilotSignIn: derive("native") });
    register("ah-codex-openai", { agentHostProviderId: "codex-openai", requiresCopilotSignIn: derive("codex-openai") });
    register("ah-unresolved", { agentHostProviderId: "unresolved", requiresCopilotSignIn: derive("unresolved") });
    assert.deepStrictEqual({
      staticRequired: service.requiresCopilotSignInForSessionType("static-required"),
      staticNotRequired: service.requiresCopilotSignInForSessionType("static-not-required"),
      ahProxy: service.requiresCopilotSignInForSessionType("ah-proxy"),
      ahNative: service.requiresCopilotSignInForSessionType("ah-native"),
      ahCodexOpenai: service.requiresCopilotSignInForSessionType("ah-codex-openai"),
      ahUnresolved: service.requiresCopilotSignInForSessionType("ah-unresolved"),
      unknownType: service.requiresCopilotSignInForSessionType("never-registered")
    }, {
      staticRequired: true,
      staticNotRequired: false,
      ahProxy: true,
      ahNative: false,
      ahCodexOpenai: false,
      ahUnresolved: true,
      unknownType: false
    });
  });
  test("a contribution change event re-fires onDidChangeAvailability until it is unregistered", () => {
    const changed = store.add(new Emitter());
    let availabilityFires = 0;
    store.add(service.onDidChangeAvailability(() => availabilityFires++));
    const registration = store.add(service.registerChatSessionContribution({
      type: "dyn",
      name: "dyn",
      displayName: "dyn",
      description: "",
      requiresCopilotSignIn: () => true,
      onDidChangeRequiresCopilotSignIn: changed.event
    }));
    const afterRegister = availabilityFires;
    changed.fire();
    const afterChange = availabilityFires;
    registration.dispose();
    const afterDispose = availabilityFires;
    changed.fire();
    const afterChangePostDispose = availabilityFires;
    assert.deepStrictEqual(
      { afterRegister, afterChange, afterDispose, afterChangePostDispose },
      { afterRegister: 1, afterChange: 2, afterDispose: 3, afterChangePostDispose: 3 }
    );
  });
});
suite("ChatSessionsService - archive capability", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class TestItemController {
    constructor(setChatSessionItemArchived) {
      this.setChatSessionItemArchived = setChatSessionItemArchived;
      this.onDidChangeChatSessionItems = Event.None;
      this.items = [];
    }
    async refresh() {
    }
  }
  let service;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  test("delegates to the registered controller", () => {
    const sessionType = "supported-type";
    const updates = [];
    const controller = new TestItemController((resource2, archived) => updates.push({ resource: resource2.toString(), archived }));
    store.add(service.registerChatSessionContribution({
      type: sessionType,
      name: sessionType,
      displayName: sessionType,
      description: ""
    }));
    store.add(service.registerChatSessionItemController(sessionType, controller));
    const resource = URI.from({ scheme: sessionType, path: "/session-1" });
    service.setChatSessionItemArchived(resource, true);
    assert.deepStrictEqual({
      canSetArchived: service.canSetChatSessionItemArchived(resource),
      updates
    }, {
      canSetArchived: true,
      updates: [{ resource: resource.toString(), archived: true }]
    });
  });
  test("reports and rejects an unsupported controller", () => {
    const sessionType = "unsupported-type";
    store.add(service.registerChatSessionContribution({
      type: sessionType,
      name: sessionType,
      displayName: sessionType,
      description: ""
    }));
    store.add(service.registerChatSessionItemController(sessionType, new TestItemController()));
    const resource = URI.from({ scheme: sessionType, path: "/session-1" });
    assert.strictEqual(service.canSetChatSessionItemArchived(resource), false);
    assert.throws(() => service.setChatSessionItemArchived(resource, true), /does not support archiving/);
  });
});
suite("ChatSessionsService - read capability", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class TestItemController {
    constructor(setChatSessionItemRead) {
      this.setChatSessionItemRead = setChatSessionItemRead;
      this.onDidChangeChatSessionItems = Event.None;
      this.items = [];
    }
    async refresh() {
    }
  }
  let service;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  test("delegates to the registered controller", () => {
    const sessionType = "read-supported-type";
    const updates = [];
    const controller = new TestItemController((resource2, isRead) => updates.push({ resource: resource2.toString(), isRead }));
    store.add(service.registerChatSessionContribution({
      type: sessionType,
      name: sessionType,
      displayName: sessionType,
      description: ""
    }));
    store.add(service.registerChatSessionItemController(sessionType, controller));
    const resource = URI.from({ scheme: sessionType, path: "/session-1" });
    service.setChatSessionItemRead(resource, true);
    service.setChatSessionItemRead(resource, false);
    assert.deepStrictEqual({
      canSetRead: service.canSetChatSessionItemRead(resource),
      updates
    }, {
      canSetRead: true,
      updates: [
        { resource: resource.toString(), isRead: true },
        { resource: resource.toString(), isRead: false }
      ]
    });
  });
  test("reports and rejects an unsupported controller", () => {
    const sessionType = "read-unsupported-type";
    store.add(service.registerChatSessionContribution({
      type: sessionType,
      name: sessionType,
      displayName: sessionType,
      description: ""
    }));
    store.add(service.registerChatSessionItemController(sessionType, new TestItemController()));
    const resource = URI.from({ scheme: sessionType, path: "/session-1" });
    assert.strictEqual(service.canSetChatSessionItemRead(resource), false);
    assert.throws(() => service.setChatSessionItemRead(resource, true), /does not own read state/);
  });
});
suite("ChatSessionsService - untitled\u2194real session aliases", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  const untitled = URI.from({ scheme: "remoteProvider", path: "/untitled-abc" });
  const real = URI.from({ scheme: "remoteProvider", path: "/real-abc" });
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  test("setMaterializedSessionResource publishes the forward untitled\u2192real mapping", () => {
    assert.strictEqual(service.getMaterializedSessionResource(untitled), void 0, "no mapping before publish");
    service.registerSessionResourceAlias(untitled, real);
    assert.strictEqual(service.getMaterializedSessionResource(untitled), void 0, "registerSessionResourceAlias alone does not publish the forward mapping");
    service.setMaterializedSessionResource(untitled, real);
    assert.strictEqual(service.getMaterializedSessionResource(untitled)?.toString(), real.toString());
  });
  test("clearMaterializedSessionResource clears the forward mapping when called with the untitled key", () => {
    service.registerSessionResourceAlias(untitled, real);
    service.setMaterializedSessionResource(untitled, real);
    service.clearMaterializedSessionResource(untitled);
    assert.strictEqual(service.getMaterializedSessionResource(untitled), void 0);
  });
  test("clearMaterializedSessionResource clears the forward mapping when called with the real value", () => {
    service.registerSessionResourceAlias(untitled, real);
    service.setMaterializedSessionResource(untitled, real);
    service.clearMaterializedSessionResource(real);
    assert.strictEqual(service.getMaterializedSessionResource(untitled), void 0);
  });
  test("options selected before first send survive disposal of the untitled session", async () => {
    const type = untitled.scheme;
    store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: "" }));
    store.add(service.registerChatSessionContentProvider(type, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        history: [],
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    await service.getOrCreateChatSession(untitled, CancellationToken.None);
    service.setSessionOption(untitled, "model", "sonnet");
    service.registerSessionResourceAlias(untitled, real);
    await service.getOrCreateChatSession(real, CancellationToken.None);
    service.setMaterializedSessionResource(untitled, real);
    assert.strictEqual(service.getSessionOption(real, "model"), "sonnet");
    service.clearMaterializedSessionResource(untitled);
    assert.strictEqual(service.getSessionOption(real, "model"), "sonnet");
  });
});
suite("ChatSessionsService - lightweight history reads", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    service = store.add(instantiationService.createInstance(ChatSessionsService));
  });
  function registerHistoryProvider(type, history, counters) {
    store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: "" }));
    store.add(service.registerChatSessionContentProvider(type, {
      provideChatSessionContent: async (resource) => {
        counters.provided++;
        return {
          sessionResource: resource,
          history,
          onWillDispose: Event.None,
          dispose: () => counters.disposed++
        };
      }
    }));
  }
  test("loads and disposes uncached sessions without retaining them", async () => {
    const type = "history-preview";
    const resource = URI.from({ scheme: type, path: "/session-1" });
    const history = [{ type: "request", prompt: "Summarize the changes", participant: "test" }];
    const counters = { provided: 0, disposed: 0 };
    registerHistoryProvider(type, history, counters);
    const first = await service.getChatSessionHistory(resource, CancellationToken.None);
    const second = await service.getChatSessionHistory(resource, CancellationToken.None);
    assert.deepStrictEqual({ first, second, counters }, {
      first: history,
      second: history,
      counters: { provided: 2, disposed: 2 }
    });
  });
  test("reads an already retained session without resolving it again", async () => {
    const type = "history-cached";
    const resource = URI.from({ scheme: type, path: "/session-1" });
    const history = [{ type: "request", prompt: "Continue the review", participant: "test" }];
    const counters = { provided: 0, disposed: 0 };
    registerHistoryProvider(type, history, counters);
    await service.getOrCreateChatSession(resource, CancellationToken.None);
    const result = await service.getChatSessionHistory(resource, CancellationToken.None);
    assert.deepStrictEqual({ result, counters }, {
      result: history,
      counters: { provided: 1, disposed: 0 }
    });
  });
  test("reads an aliased retained session without resolving it again", async () => {
    const type = "history-cached-alias";
    const resource = URI.from({ scheme: type, path: "/session-1" });
    const alias = URI.from({ scheme: type, path: "/session-1-materialized" });
    const history = [{ type: "request", prompt: "Continue the aliased session", participant: "test" }];
    const counters = { provided: 0, disposed: 0 };
    registerHistoryProvider(type, history, counters);
    await service.getOrCreateChatSession(resource, CancellationToken.None);
    service.registerSessionResourceAlias(resource, alias);
    const result = await service.getChatSessionHistory(alias, CancellationToken.None);
    assert.deepStrictEqual({ result, counters }, {
      result: history,
      counters: { provided: 1, disposed: 0 }
    });
  });
  test("resolves alternative session types through their primary provider", async () => {
    const type = "history-primary";
    const alternativeType = "history-alternative";
    const resource = URI.from({ scheme: alternativeType, path: "/session-1" });
    const history = [{ type: "request", prompt: "Read through the primary provider", participant: "test" }];
    const counters = { provided: 0, disposed: 0 };
    store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: "", alternativeIds: [alternativeType] }));
    store.add(service.registerChatSessionContentProvider(type, {
      provideChatSessionContent: async (sessionResource) => {
        counters.provided++;
        return {
          sessionResource,
          history,
          onWillDispose: Event.None,
          dispose: () => counters.disposed++
        };
      }
    }));
    const result = await service.getChatSessionHistory(resource, CancellationToken.None);
    assert.deepStrictEqual({ result, counters }, {
      result: history,
      counters: { provided: 1, disposed: 1 }
    });
  });
  test("returns empty history for an unretained untitled session", async () => {
    const resource = URI.from({ scheme: "history-untitled", path: "/untitled-session-1" });
    assert.deepStrictEqual(await service.getChatSessionHistory(resource, CancellationToken.None), []);
  });
  test("throws when a retained-session provider cannot be resolved", async () => {
    const type = "history-unresolvable";
    const resource = URI.from({ scheme: type, path: "/session-1" });
    store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: "" }));
    await assert.rejects(service.getChatSessionHistory(resource, CancellationToken.None), new Error(`Cannot find provider '${type}'`));
  });
});
suite("ChatSessionOptionsMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("toStrValueArray", () => {
    test("should return undefined for undefined input", () => {
      assert.strictEqual(ChatSessionOptionsMap.toStrValueArray(void 0), void 0);
    });
    test("should convert a Map to an array of {optionId, value}", () => {
      const map = /* @__PURE__ */ new Map([["models", "gpt-4"], ["repo", "my-repo"]]);
      assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
        { optionId: "models", value: "gpt-4" },
        { optionId: "repo", value: "my-repo" }
      ]);
    });
    test("should extract .id from IChatSessionProviderOptionItem values", () => {
      const map = /* @__PURE__ */ new Map([
        ["agent", { id: "copilot", name: "Copilot" }]
      ]);
      assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
        { optionId: "agent", value: "copilot" }
      ]);
    });
    test("should handle a plain object as if it were a record (defensive fallback)", () => {
      const plainObject = { models: "gpt-4", repo: "my-repo" };
      assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(plainObject), [
        { optionId: "models", value: "gpt-4" },
        { optionId: "repo", value: "my-repo" }
      ]);
    });
  });
  suite("toRecord", () => {
    test("should convert a Map to a record", () => {
      const map = /* @__PURE__ */ new Map([["models", "gpt-4"]]);
      const record = ChatSessionOptionsMap.toRecord(map);
      assert.strictEqual(record["models"], "gpt-4");
    });
    test("should handle a plain object as if it were a record (defensive fallback)", () => {
      const plainObject = { models: "gpt-4" };
      const record = ChatSessionOptionsMap.toRecord(plainObject);
      assert.strictEqual(record["models"], "gpt-4");
    });
  });
  suite("fromRecord", () => {
    test("should convert a record to a Map", () => {
      const map = ChatSessionOptionsMap.fromRecord({ models: "gpt-4", repo: "my-repo" });
      assert.strictEqual(map.get("models"), "gpt-4");
      assert.strictEqual(map.get("repo"), "my-repo");
      assert.strictEqual(map.size, 2);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRTZXNzaW9uc1xcY2hhdFNlc3Npb25zU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGFwcGx5Q29kZXhBZ2VudEhvc3RQcmVmZXJlbmNlLCBDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0U2Vzc2lvbnMvY2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAsIElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciwgSUNoYXRTZXNzaW9uSXRlbXNEZWx0YSwgSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50LCBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9FTkFCTEVEX0NPTlRFWFRfS0VZIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCwgQ29kZXhQcmVmZXJBZ2VudEhvc3RFZGl0b3JTZXR0aW5nSWQsIEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSwgR0lUSFVCX1JFUE9fUFJPVEVDVEVEX1JFU09VUkNFLCBwcm90ZWN0ZWRSZXNvdXJjZXNSZXF1aXJlR2l0SHViQ29waWxvdFNpZ25JbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcblxuc3VpdGUoJ0NvZGV4IEFnZW50IEhvc3QgcHJlZmVyZW5jZScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGlzQ29kZXhFeHRlbnNpb25Ib3N0QXZhaWxhYmxlKG9wdGlvbnM6IHtcblx0XHRhZ2VudEhvc3RFbmFibGVkOiBib29sZWFuO1xuXHRcdGNvZGV4QWdlbnRFbmFibGVkOiBib29sZWFuO1xuXHRcdGlzU2Vzc2lvbnNXaW5kb3c6IGJvb2xlYW47XG5cdFx0cHJlZmVyQWdlbnRIb3N0OiBib29sZWFuO1xuXHR9KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZF06IG9wdGlvbnMuY29kZXhBZ2VudEVuYWJsZWQsXG5cdFx0XHRbQ29kZXhQcmVmZXJBZ2VudEhvc3RFZGl0b3JTZXR0aW5nSWRdOiBvcHRpb25zLnByZWZlckFnZW50SG9zdCxcblx0XHR9KTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHN0b3JlLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UoY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKS5zZXQob3B0aW9ucy5hZ2VudEhvc3RFbmFibGVkKTtcblx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldChvcHRpb25zLmlzU2Vzc2lvbnNXaW5kb3cpO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gYXBwbHlDb2RleEFnZW50SG9zdFByZWZlcmVuY2Uoe1xuXHRcdFx0dHlwZTogU2Vzc2lvblR5cGUuQ29kZXgsXG5cdFx0XHRuYW1lOiAnY29kZXgnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdDb2RleCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgd2hlbiA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGNvbnRyaWJ1dGlvbi53aGVuKTtcblx0XHRyZXR1cm4gISF3aGVuICYmIGNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMod2hlbik7XG5cdH1cblxuXHR0ZXN0KCduZXZlciBzdXJmYWNlcyBleHRlbnNpb24taG9zdCBDb2RleCBpbiB0aGUgQWdlbnRzIHdpbmRvdyBhbmQgcmVwbGFjZXMgaXQgd2hlbiBwcmVmZXJyZWQgaW4gdGhlIGVkaXRvcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFnZW50c1dpbmRvd1ByZWZlcnJlZDogaXNDb2RleEV4dGVuc2lvbkhvc3RBdmFpbGFibGUoeyBhZ2VudEhvc3RFbmFibGVkOiB0cnVlLCBjb2RleEFnZW50RW5hYmxlZDogdHJ1ZSwgaXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSwgcHJlZmVyQWdlbnRIb3N0OiB0cnVlIH0pLFxuXHRcdFx0YWdlbnRzV2luZG93Tm90UHJlZmVycmVkOiBpc0NvZGV4RXh0ZW5zaW9uSG9zdEF2YWlsYWJsZSh7IGFnZW50SG9zdEVuYWJsZWQ6IHRydWUsIGNvZGV4QWdlbnRFbmFibGVkOiB0cnVlLCBpc1Nlc3Npb25zV2luZG93OiB0cnVlLCBwcmVmZXJBZ2VudEhvc3Q6IGZhbHNlIH0pLFxuXHRcdFx0YWdlbnRzV2luZG93QWdlbnRIb3N0RGlzYWJsZWQ6IGlzQ29kZXhFeHRlbnNpb25Ib3N0QXZhaWxhYmxlKHsgYWdlbnRIb3N0RW5hYmxlZDogZmFsc2UsIGNvZGV4QWdlbnRFbmFibGVkOiBmYWxzZSwgaXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSwgcHJlZmVyQWdlbnRIb3N0OiBmYWxzZSB9KSxcblx0XHRcdGVkaXRvcldpbmRvd1ByZWZlcnJlZDogaXNDb2RleEV4dGVuc2lvbkhvc3RBdmFpbGFibGUoeyBhZ2VudEhvc3RFbmFibGVkOiB0cnVlLCBjb2RleEFnZW50RW5hYmxlZDogdHJ1ZSwgaXNTZXNzaW9uc1dpbmRvdzogZmFsc2UsIHByZWZlckFnZW50SG9zdDogdHJ1ZSB9KSxcblx0XHRcdGVkaXRvcldpbmRvd05vdFByZWZlcnJlZDogaXNDb2RleEV4dGVuc2lvbkhvc3RBdmFpbGFibGUoeyBhZ2VudEhvc3RFbmFibGVkOiB0cnVlLCBjb2RleEFnZW50RW5hYmxlZDogdHJ1ZSwgaXNTZXNzaW9uc1dpbmRvdzogZmFsc2UsIHByZWZlckFnZW50SG9zdDogZmFsc2UgfSksXG5cdFx0XHRhZ2VudEhvc3REaXNhYmxlZDogaXNDb2RleEV4dGVuc2lvbkhvc3RBdmFpbGFibGUoeyBhZ2VudEhvc3RFbmFibGVkOiBmYWxzZSwgY29kZXhBZ2VudEVuYWJsZWQ6IHRydWUsIGlzU2Vzc2lvbnNXaW5kb3c6IGZhbHNlLCBwcmVmZXJBZ2VudEhvc3Q6IHRydWUgfSksXG5cdFx0XHRjb2RleEFnZW50RGlzYWJsZWQ6IGlzQ29kZXhFeHRlbnNpb25Ib3N0QXZhaWxhYmxlKHsgYWdlbnRIb3N0RW5hYmxlZDogdHJ1ZSwgY29kZXhBZ2VudEVuYWJsZWQ6IGZhbHNlLCBpc1Nlc3Npb25zV2luZG93OiBmYWxzZSwgcHJlZmVyQWdlbnRIb3N0OiB0cnVlIH0pLFxuXHRcdH0sIHtcblx0XHRcdGFnZW50c1dpbmRvd1ByZWZlcnJlZDogZmFsc2UsXG5cdFx0XHRhZ2VudHNXaW5kb3dOb3RQcmVmZXJyZWQ6IGZhbHNlLFxuXHRcdFx0YWdlbnRzV2luZG93QWdlbnRIb3N0RGlzYWJsZWQ6IGZhbHNlLFxuXHRcdFx0ZWRpdG9yV2luZG93UHJlZmVycmVkOiBmYWxzZSxcblx0XHRcdGVkaXRvcldpbmRvd05vdFByZWZlcnJlZDogdHJ1ZSxcblx0XHRcdGFnZW50SG9zdERpc2FibGVkOiB0cnVlLFxuXHRcdFx0Y29kZXhBZ2VudERpc2FibGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZS5za2lwKCdDaGF0U2Vzc2lvbnNTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0Y2hhdFNlc3Npb25zU2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0RmlsZU5hbWVGcm9tTGluaycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNhbGxFeHRyYWN0RmlsZU5hbWVGcm9tTGluayhmaWxlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRcdC8vIEFjY2VzcyB0aGUgcHJpdmF0ZSBtZXRob2QgdXNpbmcgYnJhY2tldCBub3RhdGlvbiB3aXRoIHByb3BlciB0eXBpbmdcblx0XHRcdHR5cGUgU2VydmljZVdpdGhQcml2YXRlTWV0aG9kID0gUmVjb3JkPCdleHRyYWN0RmlsZU5hbWVGcm9tTGluaycsIChmaWxlUGF0aDogc3RyaW5nKSA9PiBzdHJpbmc+O1xuXHRcdFx0cmV0dXJuIChjaGF0U2Vzc2lvbnNTZXJ2aWNlIGFzIHVua25vd24gYXMgU2VydmljZVdpdGhQcml2YXRlTWV0aG9kKVsnZXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsnXShmaWxlUGF0aCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgZmlsZW5hbWUgZnJvbSBtYXJrZG93biBsaW5rIHdpdGggbGluayB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnUmVhZCBbUkVBRE1FXShmaWxlOi8vL3BhdGgvdG8vUkVBRE1FLm1kKSBmb3IgbW9yZSBpbmZvJztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNhbGxFeHRyYWN0RmlsZU5hbWVGcm9tTGluayhpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnUmVhZCBSRUFETUUgZm9yIG1vcmUgaW5mbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgZmlsZW5hbWUgZnJvbSBtYXJrZG93biBsaW5rIHdpdGhvdXQgbGluayB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnUmVhZCBbXShmaWxlOi8vL2luZGV4LmpzKSBmb3IgaW5zdHJ1Y3Rpb25zJztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNhbGxFeHRyYWN0RmlsZU5hbWVGcm9tTGluayhpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnUmVhZCBpbmRleC5qcyBmb3IgaW5zdHJ1Y3Rpb25zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBmaWxlbmFtZSBmcm9tIG1hcmtkb3duIGxpbmsgd2l0aCBlbXB0eSBsaW5rIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdDaGVjayBbICBdKGZpbGU6Ly8vY29uZmlnLmpzb24pIHNldHRpbmdzJztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNhbGxFeHRyYWN0RmlsZU5hbWVGcm9tTGluayhpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnQ2hlY2sgY29uZmlnLmpzb24gc2V0dGluZ3MnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgZmlsZSBsaW5rcyBpbiBzYW1lIHN0cmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ1NlZSBbbWFpbl0oZmlsZTovLy9tYWluLmpzKSBhbmQgW3V0aWxzXShmaWxlOi8vL3V0aWxzL2hlbHBlci50cyknO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdTZWUgbWFpbiBhbmQgdXRpbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZmlsZSBwYXRoIHdpdGhvdXQgZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnT3BlbiBbXShmaWxlOi8vL3NyYy9jb21wb25lbnRzL0J1dHRvbiknO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdPcGVuIEJ1dHRvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBkZWVwIGZpbGUgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdFZGl0IFtdKGZpbGU6Ly8vdmVyeS9kZWVwL25lc3RlZC9wYXRoL3RvL2ZpbGUudHN4KSc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ0VkaXQgZmlsZS50c3gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZmlsZSBwYXRoIHRoYXQgaXMganVzdCBhIGZpbGVuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnVmlldyBbc2NyaXB0XShmaWxlOi8vL3NjcmlwdC5weSknO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdWaWV3IHNjcmlwdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBsaW5rIHRleHQgd2l0aCBzcGVjaWFsIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdTZWUgW0FwcC5qcyAobWFpbildKGZpbGU6Ly8vQXBwLmpzKSc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ1NlZSBBcHAuanMgKG1haW4pJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIG9yaWdpbmFsIHN0cmluZyBpZiBubyBmaWxlIGxpbmtzIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdUaGlzIGlzIGp1c3QgcmVndWxhciB0ZXh0IHdpdGggbm8gbGlua3MnO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdUaGlzIGlzIGp1c3QgcmVndWxhciB0ZXh0IHdpdGggbm8gbGlua3MnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgY29udGVudCB3aXRoIGZpbGUgbGlua3MgYW5kIHJlZ3VsYXIgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ0NoZWNrIFtjb25maWddKGZpbGU6Ly8vY29uZmlnLnltbCkgYW5kIHZpc2l0IGh0dHBzOi8vZXhhbXBsZS5jb20nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdDaGVjayBjb25maWcgYW5kIHZpc2l0IGh0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZmlsZSBwYXRoIHdpdGggcXVlcnkgcGFyYW1ldGVycyBvciBmcmFnbWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdPcGVuIFtdKGZpbGU6Ly8vaW5kZXguaHRtbD9wYXJhbT12YWx1ZSNzZWN0aW9uKSc7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjYWxsRXh0cmFjdEZpbGVOYW1lRnJvbUxpbmsoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ09wZW4gaW5kZXguaHRtbD9wYXJhbT12YWx1ZSNzZWN0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIFdpbmRvd3Mtc3R5bGUgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdFZGl0IFtdKGZpbGU6Ly8vQzovVXNlcnMvdXNlci9Eb2N1bWVudHMvZmlsZS50eHQpJztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNhbGxFeHRyYWN0RmlsZU5hbWVGcm9tTGluayhpbnB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnRWRpdCBmaWxlLnR4dCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIHdoaXRlc3BhY2UgYXJvdW5kIHJlcGxhY2VtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJyAgIENoZWNrIFtdKGZpbGU6Ly8vdGVzdC5qcykgICAnO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2FsbEV4dHJhY3RGaWxlTmFtZUZyb21MaW5rKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICcgICBDaGVjayB0ZXN0LmpzICAgJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDaGF0U2Vzc2lvbnNTZXJ2aWNlIC0gZ2V0Q2hhdFNlc3Npb25JdGVtcyBhdmFpbGFiaWxpdHknLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBHQVRFRF9UWVBFID0gJ2dhdGVkLXR5cGUnO1xuXHRjb25zdCBVTkdBVEVEX1RZUEUgPSAndW5nYXRlZC10eXBlJztcblx0Y29uc3QgZ2F0ZWRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndGVzdC5nYXRlZFR5cGVFbmFibGVkJywgZmFsc2UpO1xuXG5cdGxldCBzZXJ2aWNlOiBDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXHRsZXQgY29udGV4dEtleVNlcnZpY2U6IENvbnRleHRLZXlTZXJ2aWNlO1xuXHRsZXQgZ2F0ZWRFbmFibGVkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvKipcblx0ICogQSBtaW5pbWFsIGl0ZW0gY29udHJvbGxlciB0aGF0IGltbWVkaWF0ZWx5IGV4cG9zZXMgYSBzaW5nbGUgc2Vzc2lvbiBpdGVtLlxuXHQgKiBUaGlzIHN0YW5kcyBpbiBmb3IgYW4gZXh0ZW5zaW9uLWhvc3QtcmVnaXN0ZXJlZCBjb250cm9sbGVyLCB3aGljaCBpc1xuXHQgKiByZWdpc3RlcmVkIGluZGVwZW5kZW50bHkgb2YgdGhlIGNvbnRyaWJ1dGlvbidzIGB3aGVuYCBjbGF1c2UuXG5cdCAqL1xuXHRjbGFzcyBGYWtlSXRlbUNvbnRyb2xsZXIgaW1wbGVtZW50cyBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciB7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUNoYXRTZXNzaW9uSXRlbXNEZWx0YT4oKSk7XG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zOiBFdmVudDxJQ2hhdFNlc3Npb25JdGVtc0RlbHRhPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdFx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfdHlwZTogc3RyaW5nKSB7IH1cblxuXHRcdGdldCBpdGVtcygpOiByZWFkb25seSBJQ2hhdFNlc3Npb25JdGVtW10ge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogdGhpcy5fdHlwZSwgcGF0aDogYC9zZXNzaW9uLTFgIH0pLFxuXHRcdFx0XHRsYWJlbDogYCR7dGhpcy5fdHlwZX0gc2Vzc2lvbmAsXG5cdFx0XHRcdHRpbWluZzogeyBjcmVhdGVkOiAwLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCwgbGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR9XTtcblx0XHR9XG5cblx0XHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdH1cblxuXHRmdW5jdGlvbiByZWdpc3RlclR5cGUodHlwZTogc3RyaW5nLCB3aGVuOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cmlidXRpb246IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCA9IHsgdHlwZSwgbmFtZTogdHlwZSwgZGlzcGxheU5hbWU6IHR5cGUsIGRlc2NyaXB0aW9uOiAnJywgd2hlbiB9O1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb24oY29udHJpYnV0aW9uKSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHR5cGUsIG5ldyBGYWtlSXRlbUNvbnRyb2xsZXIodHlwZSkpKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlc29sdmVkVHlwZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IHR5cGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciBhd2FpdCAoY29uc3QgeyBjaGF0U2Vzc2lvblR5cGUsIGl0ZW1zIH0gb2Ygc2VydmljZS5nZXRDaGF0U2Vzc2lvbkl0ZW1zKHVuZGVmaW5lZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpIHtcblx0XHRcdGlmIChpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHR5cGVzLnB1c2goY2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVzLnNvcnQoKTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb250ZXh0S2V5U2VydmljZSA9IHN0b3JlLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UoY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRnYXRlZEVuYWJsZWQgPSBnYXRlZEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6ICgpID0+IGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdH0sIHN0b3JlKSk7XG5cdFx0c2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cblx0XHRyZWdpc3RlclR5cGUoR0FURURfVFlQRSwgYCR7Z2F0ZWRLZXkua2V5fWApO1xuXHRcdHJlZ2lzdGVyVHlwZShVTkdBVEVEX1RZUEUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGEgdHlwZSB3aG9zZSBjb250cmlidXRpb24gYHdoZW5gIGlzIGZhbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGdhdGVkRW5hYmxlZC5zZXQoZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVzb2x2ZWRUeXBlcygpLCBbVU5HQVRFRF9UWVBFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIGEgdHlwZSB3aG9zZSBjb250cmlidXRpb24gYHdoZW5gIGlzIHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Z2F0ZWRFbmFibGVkLnNldCh0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVkVHlwZXMoKSwgW0dBVEVEX1RZUEUsIFVOR0FURURfVFlQRV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZsZWN0cyBhIHJ1bnRpbWUgYHdoZW5gIGZsaXAgd2l0aG91dCByZS1yZWdpc3RyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Z2F0ZWRFbmFibGVkLnNldCh0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVkVHlwZXMoKSwgW0dBVEVEX1RZUEUsIFVOR0FURURfVFlQRV0pO1xuXG5cdFx0Z2F0ZWRFbmFibGVkLnNldChmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlZFR5cGVzKCksIFtVTkdBVEVEX1RZUEVdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXRTZXNzaW9uc1NlcnZpY2UgLSByZXF1aXJlc0NvcGlsb3RTaWduSW5Gb3JTZXNzaW9uVHlwZScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBzZXJ2aWNlOiBDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0c2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHJlZ2lzdGVyKHR5cGU6IHN0cmluZywgZXh0cmE6IFBhcnRpYWw8SUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50Pik6IHZvaWQge1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb24oeyB0eXBlLCBuYW1lOiB0eXBlLCBkaXNwbGF5TmFtZTogdHlwZSwgZGVzY3JpcHRpb246ICcnLCAuLi5leHRyYSB9KSk7XG5cdH1cblxuXHR0ZXN0KCdldmFsdWF0ZXMgYSBmdW5jdGlvbmFsIHJlcXVpcmVzQ29waWxvdFNpZ25JbiwgYW5kIHJlYWRzIGEgc3RhdGljIGZsYWcgb3RoZXJ3aXNlJywgKCkgPT4ge1xuXHRcdC8vIERlY2xhcmF0aXZlIChleHRlbnNpb24pIHR5cGVzIHN1cHBseSBhIHN0YXRpYyBib29sZWFuLCByZWFkIGRpcmVjdGx5LlxuXHRcdHJlZ2lzdGVyKCdzdGF0aWMtcmVxdWlyZWQnLCB7IHJlcXVpcmVzQ29waWxvdFNpZ25JbjogdHJ1ZSB9KTtcblx0XHRyZWdpc3Rlcignc3RhdGljLW5vdC1yZXF1aXJlZCcsIHsgcmVxdWlyZXNDb3BpbG90U2lnbkluOiBmYWxzZSB9KTtcblxuXHRcdC8vIFByb2dyYW1tYXRpYyB0eXBlcyAoZS5nLiBhZ2VudCBob3N0KSBvd24gYSBmdW5jdGlvbiBkZXJpdmluZyB0aGVcblx0XHQvLyByZXF1aXJlbWVudCBmcm9tIHRoZWlyIGFnZW50J3MgYWR2ZXJ0aXNlZCBwcm90ZWN0ZWQgcmVzb3VyY2VzIFx1MjAxNCBhbiBhZ2VudFxuXHRcdC8vIHRoYXQgbWFya3MgdGhlIENvcGlsb3QgcmVzb3VyY2UgYHJlcXVpcmVkOiBmYWxzZWAgKENsYXVkZSBuYXRpdmUsIENvZGV4IG9uXG5cdFx0Ly8gT3BlbkFJKSBpcyB1c2FibGUgd2l0aG91dCBzaWduaW5nIGluOyBhbiB1bnJlc29sdmVkIGFnZW50IGZhbGxzIGJhY2sgdG9cblx0XHQvLyBcInJlcXVpcmVkXCIuXG5cdFx0Y29uc3QgcmVzb3VyY2VzQnlQcm92aWRlcjogUmVjb3JkPHN0cmluZywgcmVhZG9ubHkgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YVtdIHwgdW5kZWZpbmVkPiA9IHtcblx0XHRcdHByb3h5OiBbR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFLCBHSVRIVUJfUkVQT19QUk9URUNURURfUkVTT1VSQ0VdLFxuXHRcdFx0bmF0aXZlOiBbeyAuLi5HSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UsIHJlcXVpcmVkOiBmYWxzZSB9LCBHSVRIVUJfUkVQT19QUk9URUNURURfUkVTT1VSQ0VdLFxuXHRcdFx0J2NvZGV4LW9wZW5haSc6IFt7IC4uLkdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSwgcmVxdWlyZWQ6IGZhbHNlIH1dLFxuXHRcdFx0dW5yZXNvbHZlZDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgZGVyaXZlID0gKHByb3ZpZGVyOiBzdHJpbmcpID0+ICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IHJlc291cmNlc0J5UHJvdmlkZXJbcHJvdmlkZXJdO1xuXHRcdFx0cmV0dXJuIHJlc291cmNlcyAhPT0gdW5kZWZpbmVkID8gcHJvdGVjdGVkUmVzb3VyY2VzUmVxdWlyZUdpdEh1YkNvcGlsb3RTaWduSW4ocmVzb3VyY2VzKSA6IHRydWU7XG5cdFx0fTtcblx0XHRyZWdpc3RlcignYWgtcHJveHknLCB7IGFnZW50SG9zdFByb3ZpZGVySWQ6ICdwcm94eScsIHJlcXVpcmVzQ29waWxvdFNpZ25JbjogZGVyaXZlKCdwcm94eScpIH0pO1xuXHRcdHJlZ2lzdGVyKCdhaC1uYXRpdmUnLCB7IGFnZW50SG9zdFByb3ZpZGVySWQ6ICduYXRpdmUnLCByZXF1aXJlc0NvcGlsb3RTaWduSW46IGRlcml2ZSgnbmF0aXZlJykgfSk7XG5cdFx0cmVnaXN0ZXIoJ2FoLWNvZGV4LW9wZW5haScsIHsgYWdlbnRIb3N0UHJvdmlkZXJJZDogJ2NvZGV4LW9wZW5haScsIHJlcXVpcmVzQ29waWxvdFNpZ25JbjogZGVyaXZlKCdjb2RleC1vcGVuYWknKSB9KTtcblx0XHRyZWdpc3RlcignYWgtdW5yZXNvbHZlZCcsIHsgYWdlbnRIb3N0UHJvdmlkZXJJZDogJ3VucmVzb2x2ZWQnLCByZXF1aXJlc0NvcGlsb3RTaWduSW46IGRlcml2ZSgndW5yZXNvbHZlZCcpIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0aWNSZXF1aXJlZDogc2VydmljZS5yZXF1aXJlc0NvcGlsb3RTaWduSW5Gb3JTZXNzaW9uVHlwZSgnc3RhdGljLXJlcXVpcmVkJyksXG5cdFx0XHRzdGF0aWNOb3RSZXF1aXJlZDogc2VydmljZS5yZXF1aXJlc0NvcGlsb3RTaWduSW5Gb3JTZXNzaW9uVHlwZSgnc3RhdGljLW5vdC1yZXF1aXJlZCcpLFxuXHRcdFx0YWhQcm94eTogc2VydmljZS5yZXF1aXJlc0NvcGlsb3RTaWduSW5Gb3JTZXNzaW9uVHlwZSgnYWgtcHJveHknKSxcblx0XHRcdGFoTmF0aXZlOiBzZXJ2aWNlLnJlcXVpcmVzQ29waWxvdFNpZ25JbkZvclNlc3Npb25UeXBlKCdhaC1uYXRpdmUnKSxcblx0XHRcdGFoQ29kZXhPcGVuYWk6IHNlcnZpY2UucmVxdWlyZXNDb3BpbG90U2lnbkluRm9yU2Vzc2lvblR5cGUoJ2FoLWNvZGV4LW9wZW5haScpLFxuXHRcdFx0YWhVbnJlc29sdmVkOiBzZXJ2aWNlLnJlcXVpcmVzQ29waWxvdFNpZ25JbkZvclNlc3Npb25UeXBlKCdhaC11bnJlc29sdmVkJyksXG5cdFx0XHR1bmtub3duVHlwZTogc2VydmljZS5yZXF1aXJlc0NvcGlsb3RTaWduSW5Gb3JTZXNzaW9uVHlwZSgnbmV2ZXItcmVnaXN0ZXJlZCcpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXRpY1JlcXVpcmVkOiB0cnVlLFxuXHRcdFx0c3RhdGljTm90UmVxdWlyZWQ6IGZhbHNlLFxuXHRcdFx0YWhQcm94eTogdHJ1ZSxcblx0XHRcdGFoTmF0aXZlOiBmYWxzZSxcblx0XHRcdGFoQ29kZXhPcGVuYWk6IGZhbHNlLFxuXHRcdFx0YWhVbnJlc29sdmVkOiB0cnVlLFxuXHRcdFx0dW5rbm93blR5cGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGNvbnRyaWJ1dGlvbiBjaGFuZ2UgZXZlbnQgcmUtZmlyZXMgb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkgdW50aWwgaXQgaXMgdW5yZWdpc3RlcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYW5nZWQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0bGV0IGF2YWlsYWJpbGl0eUZpcmVzID0gMDtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkRpZENoYW5nZUF2YWlsYWJpbGl0eSgoKSA9PiBhdmFpbGFiaWxpdHlGaXJlcysrKSk7XG5cblx0XHQvLyBSZWdpc3RlcmluZyB0aGUgY29udHJpYnV0aW9uIGZpcmVzIGF2YWlsYWJpbGl0eSBvbmNlIChhIHR5cGUgYXBwZWFyZWQpO1xuXHRcdC8vIGl0cyBvbkRpZENoYW5nZVJlcXVpcmVzQ29waWxvdFNpZ25JbiBpcyB3aXJlZCBnZW5lcmljYWxseS5cblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSBzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHtcblx0XHRcdHR5cGU6ICdkeW4nLCBuYW1lOiAnZHluJywgZGlzcGxheU5hbWU6ICdkeW4nLCBkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRyZXF1aXJlc0NvcGlsb3RTaWduSW46ICgpID0+IHRydWUsXG5cdFx0XHRvbkRpZENoYW5nZVJlcXVpcmVzQ29waWxvdFNpZ25JbjogY2hhbmdlZC5ldmVudCxcblx0XHR9KSk7XG5cdFx0Y29uc3QgYWZ0ZXJSZWdpc3RlciA9IGF2YWlsYWJpbGl0eUZpcmVzO1xuXG5cdFx0Y2hhbmdlZC5maXJlKCk7XG5cdFx0Y29uc3QgYWZ0ZXJDaGFuZ2UgPSBhdmFpbGFiaWxpdHlGaXJlcztcblxuXHRcdC8vIFVucmVnaXN0ZXJpbmcgZGlzcG9zZXMgdGhlIHN1YnNjcmlwdGlvbiAoYW5kIGZpcmVzIG9uY2UgZm9yIHRoZSByZW1vdmFsKSxcblx0XHQvLyBzbyBhIGxhdGVyIGNoYW5nZSBubyBsb25nZXIgZHJpdmVzIGF2YWlsYWJpbGl0eS5cblx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdGNvbnN0IGFmdGVyRGlzcG9zZSA9IGF2YWlsYWJpbGl0eUZpcmVzO1xuXHRcdGNoYW5nZWQuZmlyZSgpO1xuXHRcdGNvbnN0IGFmdGVyQ2hhbmdlUG9zdERpc3Bvc2UgPSBhdmFpbGFiaWxpdHlGaXJlcztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGFmdGVyUmVnaXN0ZXIsIGFmdGVyQ2hhbmdlLCBhZnRlckRpc3Bvc2UsIGFmdGVyQ2hhbmdlUG9zdERpc3Bvc2UgfSxcblx0XHRcdHsgYWZ0ZXJSZWdpc3RlcjogMSwgYWZ0ZXJDaGFuZ2U6IDIsIGFmdGVyRGlzcG9zZTogMywgYWZ0ZXJDaGFuZ2VQb3N0RGlzcG9zZTogMyB9LFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDaGF0U2Vzc2lvbnNTZXJ2aWNlIC0gYXJjaGl2ZSBjYXBhYmlsaXR5JywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgVGVzdEl0ZW1Db250cm9sbGVyIGltcGxlbWVudHMgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIge1xuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyA9IEV2ZW50Lk5vbmU7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHJlYWRvbmx5IHNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkPzogKHJlc291cmNlOiBVUkksIGFyY2hpdmVkOiBib29sZWFuKSA9PiB2b2lkLFxuXHRcdCkgeyB9XG5cblx0XHRyZWFkb25seSBpdGVtczogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSXRlbVtdID0gW107XG5cblx0XHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdH1cblxuXHRsZXQgc2VydmljZTogQ2hhdFNlc3Npb25zU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkpO1xuXHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlc3Npb25zU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxlZ2F0ZXMgdG8gdGhlIHJlZ2lzdGVyZWQgY29udHJvbGxlcicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdzdXBwb3J0ZWQtdHlwZSc7XG5cdFx0Y29uc3QgdXBkYXRlczogeyByZXNvdXJjZTogc3RyaW5nOyBhcmNoaXZlZDogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFRlc3RJdGVtQ29udHJvbGxlcigocmVzb3VyY2UsIGFyY2hpdmVkKSA9PiB1cGRhdGVzLnB1c2goeyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgYXJjaGl2ZWQgfSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb24oe1xuXHRcdFx0dHlwZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRuYW1lOiBzZXNzaW9uVHlwZSxcblx0XHRcdGRpc3BsYXlOYW1lOiBzZXNzaW9uVHlwZSxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHNlc3Npb25UeXBlLCBjb250cm9sbGVyKSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBzZXNzaW9uVHlwZSwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdHNlcnZpY2Uuc2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQocmVzb3VyY2UsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYW5TZXRBcmNoaXZlZDogc2VydmljZS5jYW5TZXRDaGF0U2Vzc2lvbkl0ZW1BcmNoaXZlZChyZXNvdXJjZSksXG5cdFx0XHR1cGRhdGVzLFxuXHRcdH0sIHtcblx0XHRcdGNhblNldEFyY2hpdmVkOiB0cnVlLFxuXHRcdFx0dXBkYXRlczogW3sgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIGFyY2hpdmVkOiB0cnVlIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIGFuZCByZWplY3RzIGFuIHVuc3VwcG9ydGVkIGNvbnRyb2xsZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAndW5zdXBwb3J0ZWQtdHlwZSc7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih7XG5cdFx0XHR0eXBlOiBzZXNzaW9uVHlwZSxcblx0XHRcdG5hbWU6IHNlc3Npb25UeXBlLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHNlc3Npb25UeXBlLFxuXHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblR5cGUsIG5ldyBUZXN0SXRlbUNvbnRyb2xsZXIoKSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogc2Vzc2lvblR5cGUsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5TZXRDaGF0U2Vzc2lvbkl0ZW1BcmNoaXZlZChyZXNvdXJjZSksIGZhbHNlKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHNlcnZpY2Uuc2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQocmVzb3VyY2UsIHRydWUpLCAvZG9lcyBub3Qgc3VwcG9ydCBhcmNoaXZpbmcvKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NoYXRTZXNzaW9uc1NlcnZpY2UgLSByZWFkIGNhcGFiaWxpdHknLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBUZXN0SXRlbUNvbnRyb2xsZXIgaW1wbGVtZW50cyBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciB7XG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zID0gRXZlbnQuTm9uZTtcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0cmVhZG9ubHkgc2V0Q2hhdFNlc3Npb25JdGVtUmVhZD86IChyZXNvdXJjZTogVVJJLCBpc1JlYWQ6IGJvb2xlYW4pID0+IHZvaWQsXG5cdFx0KSB7IH1cblxuXHRcdHJlYWRvbmx5IGl0ZW1zOiByZWFkb25seSBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblxuXHRcdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0fVxuXG5cdGxldCBzZXJ2aWNlOiBDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0c2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGVnYXRlcyB0byB0aGUgcmVnaXN0ZXJlZCBjb250cm9sbGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ3JlYWQtc3VwcG9ydGVkLXR5cGUnO1xuXHRcdGNvbnN0IHVwZGF0ZXM6IHsgcmVzb3VyY2U6IHN0cmluZzsgaXNSZWFkOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgVGVzdEl0ZW1Db250cm9sbGVyKChyZXNvdXJjZSwgaXNSZWFkKSA9PiB1cGRhdGVzLnB1c2goeyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgaXNSZWFkIH0pKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHtcblx0XHRcdHR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdFx0bmFtZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRkaXNwbGF5TmFtZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihzZXNzaW9uVHlwZSwgY29udHJvbGxlcikpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogc2Vzc2lvblR5cGUsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRzZXJ2aWNlLnNldENoYXRTZXNzaW9uSXRlbVJlYWQocmVzb3VyY2UsIHRydWUpO1xuXHRcdHNlcnZpY2Uuc2V0Q2hhdFNlc3Npb25JdGVtUmVhZChyZXNvdXJjZSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYW5TZXRSZWFkOiBzZXJ2aWNlLmNhblNldENoYXRTZXNzaW9uSXRlbVJlYWQocmVzb3VyY2UpLFxuXHRcdFx0dXBkYXRlcyxcblx0XHR9LCB7XG5cdFx0XHRjYW5TZXRSZWFkOiB0cnVlLFxuXHRcdFx0dXBkYXRlczogW1xuXHRcdFx0XHR7IHJlc291cmNlOiByZXNvdXJjZS50b1N0cmluZygpLCBpc1JlYWQ6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgaXNSZWFkOiBmYWxzZSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhbmQgcmVqZWN0cyBhbiB1bnN1cHBvcnRlZCBjb250cm9sbGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ3JlYWQtdW5zdXBwb3J0ZWQtdHlwZSc7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih7XG5cdFx0XHR0eXBlOiBzZXNzaW9uVHlwZSxcblx0XHRcdG5hbWU6IHNlc3Npb25UeXBlLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHNlc3Npb25UeXBlLFxuXHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblR5cGUsIG5ldyBUZXN0SXRlbUNvbnRyb2xsZXIoKSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogc2Vzc2lvblR5cGUsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5TZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VydmljZS5zZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHJlc291cmNlLCB0cnVlKSwgL2RvZXMgbm90IG93biByZWFkIHN0YXRlLyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDaGF0U2Vzc2lvbnNTZXJ2aWNlIC0gdW50aXRsZWRcdTIxOTRyZWFsIHNlc3Npb24gYWxpYXNlcycsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBzZXJ2aWNlOiBDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXG5cdGNvbnN0IHVudGl0bGVkID0gVVJJLmZyb20oeyBzY2hlbWU6ICdyZW1vdGVQcm92aWRlcicsIHBhdGg6ICcvdW50aXRsZWQtYWJjJyB9KTtcblx0Y29uc3QgcmVhbCA9IFVSSS5mcm9tKHsgc2NoZW1lOiAncmVtb3RlUHJvdmlkZXInLCBwYXRoOiAnL3JlYWwtYWJjJyB9KTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkpO1xuXHRcdHNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlc3Npb25zU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UgcHVibGlzaGVzIHRoZSBmb3J3YXJkIHVudGl0bGVkXHUyMTkycmVhbCBtYXBwaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZCksIHVuZGVmaW5lZCwgJ25vIG1hcHBpbmcgYmVmb3JlIHB1Ymxpc2gnKTtcblx0XHQvLyBUaGUgaW52ZXJzZSBhbGlhcyBhbG9uZSBtdXN0IG5vdCBwdWJsaXNoIHRoZSBmb3J3YXJkIG1hcHBpbmcgKGl0IGlzIG9ubHlcblx0XHQvLyBwdWJsaXNoZWQgb25jZSB0aGUgcmVhbCBzZXNzaW9uIGhhcyBsb2FkZWQpLlxuXHRcdHNlcnZpY2UucmVnaXN0ZXJTZXNzaW9uUmVzb3VyY2VBbGlhcyh1bnRpdGxlZCwgcmVhbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkKSwgdW5kZWZpbmVkLCAncmVnaXN0ZXJTZXNzaW9uUmVzb3VyY2VBbGlhcyBhbG9uZSBkb2VzIG5vdCBwdWJsaXNoIHRoZSBmb3J3YXJkIG1hcHBpbmcnKTtcblx0XHRzZXJ2aWNlLnNldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZCwgcmVhbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkKT8udG9TdHJpbmcoKSwgcmVhbC50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UgY2xlYXJzIHRoZSBmb3J3YXJkIG1hcHBpbmcgd2hlbiBjYWxsZWQgd2l0aCB0aGUgdW50aXRsZWQga2V5JywgKCkgPT4ge1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJTZXNzaW9uUmVzb3VyY2VBbGlhcyh1bnRpdGxlZCwgcmVhbCk7XG5cdFx0c2VydmljZS5zZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWQsIHJlYWwpO1xuXHRcdHNlcnZpY2UuY2xlYXJNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyTWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlIGNsZWFycyB0aGUgZm9yd2FyZCBtYXBwaW5nIHdoZW4gY2FsbGVkIHdpdGggdGhlIHJlYWwgdmFsdWUnLCAoKSA9PiB7XG5cdFx0c2VydmljZS5yZWdpc3RlclNlc3Npb25SZXNvdXJjZUFsaWFzKHVudGl0bGVkLCByZWFsKTtcblx0XHRzZXJ2aWNlLnNldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZCwgcmVhbCk7XG5cdFx0c2VydmljZS5jbGVhck1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZShyZWFsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcHRpb25zIHNlbGVjdGVkIGJlZm9yZSBmaXJzdCBzZW5kIHN1cnZpdmUgZGlzcG9zYWwgb2YgdGhlIHVudGl0bGVkIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHlwZSA9IHVudGl0bGVkLnNjaGVtZTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHsgdHlwZSwgbmFtZTogdHlwZSwgZGlzcGxheU5hbWU6IHR5cGUsIGRlc2NyaXB0aW9uOiAnJyB9KSk7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcih0eXBlLCB7XG5cdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiAocmVzb3VyY2U6IFVSSSkgPT4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRcdG9uV2lsbERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgdW50aXRsZWQgc2Vzc2lvbiBlbnRyeSBhbmQgcmVjb3JkIGEgdXNlciBvcHRpb24gc2VsZWN0aW9uIG9uIGl0LlxuXHRcdGF3YWl0IHNlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbih1bnRpdGxlZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0c2VydmljZS5zZXRTZXNzaW9uT3B0aW9uKHVudGl0bGVkLCAnbW9kZWwnLCAnc29ubmV0Jyk7XG5cblx0XHQvLyBNYXRlcmlhbGl6ZTogcmVnaXN0ZXIgdGhlIGludmVyc2UgYWxpYXMsIGxvYWQgdGhlIHJlYWwgc2Vzc2lvbiwgcHVibGlzaFxuXHRcdC8vIHRoZSBmb3J3YXJkIG1hcHBpbmcuXG5cdFx0c2VydmljZS5yZWdpc3RlclNlc3Npb25SZXNvdXJjZUFsaWFzKHVudGl0bGVkLCByZWFsKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVhbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0c2VydmljZS5zZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWQsIHJlYWwpO1xuXG5cdFx0Ly8gVGhlIHJlYWwgc2Vzc2lvbiByZXNvbHZlcyB0aGUgb3B0aW9uIHRocm91Z2ggdGhlIGludmVyc2UgYWxpYXMuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZWFsLCAnbW9kZWwnKSwgJ3Nvbm5ldCcpO1xuXG5cdFx0Ly8gRGlzcG9zaW5nIHRoZSB1bnRpdGxlZCBtb2RlbCBjbGVhcnMgb25seSB0aGUgZm9yd2FyZCBtYXBwaW5nOyB0aGUgaW52ZXJzZVxuXHRcdC8vIGFsaWFzIGlzIGludGVudGlvbmFsbHkga2VwdCwgc28gdGhlIHJlYWwgc2Vzc2lvbiBrZWVwcyByZXNvbHZpbmcgdGhlXG5cdFx0Ly8gb3B0aW9uIHRvIHRoZSB1bnRpdGxlZCBlbnRyeS5cblx0XHRzZXJ2aWNlLmNsZWFyTWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHJlYWwsICdtb2RlbCcpLCAnc29ubmV0Jyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDaGF0U2Vzc2lvbnNTZXJ2aWNlIC0gbGlnaHR3ZWlnaHQgaGlzdG9yeSByZWFkcycsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBzZXJ2aWNlOiBDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0c2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHJlZ2lzdGVySGlzdG9yeVByb3ZpZGVyKHR5cGU6IHN0cmluZywgaGlzdG9yeTogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW1bXSwgY291bnRlcnM6IHsgcHJvdmlkZWQ6IG51bWJlcjsgZGlzcG9zZWQ6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih7IHR5cGUsIG5hbWU6IHR5cGUsIGRpc3BsYXlOYW1lOiB0eXBlLCBkZXNjcmlwdGlvbjogJycgfSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIodHlwZSwge1xuXHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudDogYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRjb3VudGVycy5wcm92aWRlZCsrO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0aGlzdG9yeSxcblx0XHRcdFx0XHRvbldpbGxEaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGNvdW50ZXJzLmRpc3Bvc2VkKyssXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0fVxuXG5cdHRlc3QoJ2xvYWRzIGFuZCBkaXNwb3NlcyB1bmNhY2hlZCBzZXNzaW9ucyB3aXRob3V0IHJldGFpbmluZyB0aGVtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHR5cGUgPSAnaGlzdG9yeS1wcmV2aWV3Jztcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiB0eXBlLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgaGlzdG9yeTogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW1bXSA9IFt7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnU3VtbWFyaXplIHRoZSBjaGFuZ2VzJywgcGFydGljaXBhbnQ6ICd0ZXN0JyB9XTtcblx0XHRjb25zdCBjb3VudGVycyA9IHsgcHJvdmlkZWQ6IDAsIGRpc3Bvc2VkOiAwIH07XG5cdFx0cmVnaXN0ZXJIaXN0b3J5UHJvdmlkZXIodHlwZSwgaGlzdG9yeSwgY291bnRlcnMpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBzZXJ2aWNlLmdldENoYXRTZXNzaW9uSGlzdG9yeShyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VydmljZS5nZXRDaGF0U2Vzc2lvbkhpc3RvcnkocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGZpcnN0LCBzZWNvbmQsIGNvdW50ZXJzIH0sIHtcblx0XHRcdGZpcnN0OiBoaXN0b3J5LFxuXHRcdFx0c2Vjb25kOiBoaXN0b3J5LFxuXHRcdFx0Y291bnRlcnM6IHsgcHJvdmlkZWQ6IDIsIGRpc3Bvc2VkOiAyIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRzIGFuIGFscmVhZHkgcmV0YWluZWQgc2Vzc2lvbiB3aXRob3V0IHJlc29sdmluZyBpdCBhZ2FpbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0eXBlID0gJ2hpc3RvcnktY2FjaGVkJztcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiB0eXBlLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgaGlzdG9yeTogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW1bXSA9IFt7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnQ29udGludWUgdGhlIHJldmlldycsIHBhcnRpY2lwYW50OiAndGVzdCcgfV07XG5cdFx0Y29uc3QgY291bnRlcnMgPSB7IHByb3ZpZGVkOiAwLCBkaXNwb3NlZDogMCB9O1xuXHRcdHJlZ2lzdGVySGlzdG9yeVByb3ZpZGVyKHR5cGUsIGhpc3RvcnksIGNvdW50ZXJzKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXRDaGF0U2Vzc2lvbkhpc3RvcnkocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdCwgY291bnRlcnMgfSwge1xuXHRcdFx0cmVzdWx0OiBoaXN0b3J5LFxuXHRcdFx0Y291bnRlcnM6IHsgcHJvdmlkZWQ6IDEsIGRpc3Bvc2VkOiAwIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRzIGFuIGFsaWFzZWQgcmV0YWluZWQgc2Vzc2lvbiB3aXRob3V0IHJlc29sdmluZyBpdCBhZ2FpbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0eXBlID0gJ2hpc3RvcnktY2FjaGVkLWFsaWFzJztcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiB0eXBlLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgYWxpYXMgPSBVUkkuZnJvbSh7IHNjaGVtZTogdHlwZSwgcGF0aDogJy9zZXNzaW9uLTEtbWF0ZXJpYWxpemVkJyB9KTtcblx0XHRjb25zdCBoaXN0b3J5OiByZWFkb25seSBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbVtdID0gW3sgdHlwZTogJ3JlcXVlc3QnLCBwcm9tcHQ6ICdDb250aW51ZSB0aGUgYWxpYXNlZCBzZXNzaW9uJywgcGFydGljaXBhbnQ6ICd0ZXN0JyB9XTtcblx0XHRjb25zdCBjb3VudGVycyA9IHsgcHJvdmlkZWQ6IDAsIGRpc3Bvc2VkOiAwIH07XG5cdFx0cmVnaXN0ZXJIaXN0b3J5UHJvdmlkZXIodHlwZSwgaGlzdG9yeSwgY291bnRlcnMpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyU2Vzc2lvblJlc291cmNlQWxpYXMocmVzb3VyY2UsIGFsaWFzKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldENoYXRTZXNzaW9uSGlzdG9yeShhbGlhcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCBjb3VudGVycyB9LCB7XG5cdFx0XHRyZXN1bHQ6IGhpc3RvcnksXG5cdFx0XHRjb3VudGVyczogeyBwcm92aWRlZDogMSwgZGlzcG9zZWQ6IDAgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgYWx0ZXJuYXRpdmUgc2Vzc2lvbiB0eXBlcyB0aHJvdWdoIHRoZWlyIHByaW1hcnkgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHlwZSA9ICdoaXN0b3J5LXByaW1hcnknO1xuXHRcdGNvbnN0IGFsdGVybmF0aXZlVHlwZSA9ICdoaXN0b3J5LWFsdGVybmF0aXZlJztcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBhbHRlcm5hdGl2ZVR5cGUsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCBoaXN0b3J5OiByZWFkb25seSBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbVtdID0gW3sgdHlwZTogJ3JlcXVlc3QnLCBwcm9tcHQ6ICdSZWFkIHRocm91Z2ggdGhlIHByaW1hcnkgcHJvdmlkZXInLCBwYXJ0aWNpcGFudDogJ3Rlc3QnIH1dO1xuXHRcdGNvbnN0IGNvdW50ZXJzID0geyBwcm92aWRlZDogMCwgZGlzcG9zZWQ6IDAgfTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHsgdHlwZSwgbmFtZTogdHlwZSwgZGlzcGxheU5hbWU6IHR5cGUsIGRlc2NyaXB0aW9uOiAnJywgYWx0ZXJuYXRpdmVJZHM6IFthbHRlcm5hdGl2ZVR5cGVdIH0pKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKHR5cGUsIHtcblx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQ6IGFzeW5jIHNlc3Npb25SZXNvdXJjZSA9PiB7XG5cdFx0XHRcdGNvdW50ZXJzLnByb3ZpZGVkKys7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhpc3RvcnksXG5cdFx0XHRcdFx0b25XaWxsRGlzcG9zZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBjb3VudGVycy5kaXNwb3NlZCsrLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldENoYXRTZXNzaW9uSGlzdG9yeShyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCBjb3VudGVycyB9LCB7XG5cdFx0XHRyZXN1bHQ6IGhpc3RvcnksXG5cdFx0XHRjb3VudGVyczogeyBwcm92aWRlZDogMSwgZGlzcG9zZWQ6IDEgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBoaXN0b3J5IGZvciBhbiB1bnJldGFpbmVkIHVudGl0bGVkIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2hpc3RvcnktdW50aXRsZWQnLCBwYXRoOiAnL3VudGl0bGVkLXNlc3Npb24tMScgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZ2V0Q2hhdFNlc3Npb25IaXN0b3J5KHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd0aHJvd3Mgd2hlbiBhIHJldGFpbmVkLXNlc3Npb24gcHJvdmlkZXIgY2Fubm90IGJlIHJlc29sdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHR5cGUgPSAnaGlzdG9yeS11bnJlc29sdmFibGUnO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHR5cGUsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHsgdHlwZSwgbmFtZTogdHlwZSwgZGlzcGxheU5hbWU6IHR5cGUsIGRlc2NyaXB0aW9uOiAnJyB9KSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhzZXJ2aWNlLmdldENoYXRTZXNzaW9uSGlzdG9yeShyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIG5ldyBFcnJvcihgQ2Fubm90IGZpbmQgcHJvdmlkZXIgJyR7dHlwZX0nYCkpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFNlc3Npb25PcHRpb25zTWFwJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCd0b1N0clZhbHVlQXJyYXknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgdW5kZWZpbmVkIGlucHV0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRTZXNzaW9uT3B0aW9uc01hcC50b1N0clZhbHVlQXJyYXkodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb252ZXJ0IGEgTWFwIHRvIGFuIGFycmF5IG9mIHtvcHRpb25JZCwgdmFsdWV9JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFwID0gbmV3IE1hcChbWydtb2RlbHMnLCAnZ3B0LTQnXSwgWydyZXBvJywgJ215LXJlcG8nXV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDaGF0U2Vzc2lvbk9wdGlvbnNNYXAudG9TdHJWYWx1ZUFycmF5KG1hcCksIFtcblx0XHRcdFx0eyBvcHRpb25JZDogJ21vZGVscycsIHZhbHVlOiAnZ3B0LTQnIH0sXG5cdFx0XHRcdHsgb3B0aW9uSWQ6ICdyZXBvJywgdmFsdWU6ICdteS1yZXBvJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCAuaWQgZnJvbSBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFwOiBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2FnZW50JywgeyBpZDogJ2NvcGlsb3QnLCBuYW1lOiAnQ29waWxvdCcgfV0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQ2hhdFNlc3Npb25PcHRpb25zTWFwLnRvU3RyVmFsdWVBcnJheShtYXApLCBbXG5cdFx0XHRcdHsgb3B0aW9uSWQ6ICdhZ2VudCcsIHZhbHVlOiAnY29waWxvdCcgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBhIHBsYWluIG9iamVjdCBhcyBpZiBpdCB3ZXJlIGEgcmVjb3JkIChkZWZlbnNpdmUgZmFsbGJhY2spJywgKCkgPT4ge1xuXHRcdFx0Ly8gU2ltdWxhdGVzIGEgTWFwIHRoYXQgbG9zdCBpdHMgcHJvdG90eXBlIGR1cmluZyBzZXJpYWxpemF0aW9uXG5cdFx0XHRjb25zdCBwbGFpbk9iamVjdCA9IHsgbW9kZWxzOiAnZ3B0LTQnLCByZXBvOiAnbXktcmVwbycgfSBhcyB1bmtub3duIGFzIFJlYWRvbmx5Q2hhdFNlc3Npb25PcHRpb25zTWFwO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDaGF0U2Vzc2lvbk9wdGlvbnNNYXAudG9TdHJWYWx1ZUFycmF5KHBsYWluT2JqZWN0KSwgW1xuXHRcdFx0XHR7IG9wdGlvbklkOiAnbW9kZWxzJywgdmFsdWU6ICdncHQtNCcgfSxcblx0XHRcdFx0eyBvcHRpb25JZDogJ3JlcG8nLCB2YWx1ZTogJ215LXJlcG8nIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RvUmVjb3JkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNvbnZlcnQgYSBNYXAgdG8gYSByZWNvcmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXAgPSBuZXcgTWFwKFtbJ21vZGVscycsICdncHQtNCddXSk7XG5cdFx0XHRjb25zdCByZWNvcmQgPSBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAudG9SZWNvcmQobWFwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvcmRbJ21vZGVscyddLCAnZ3B0LTQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYSBwbGFpbiBvYmplY3QgYXMgaWYgaXQgd2VyZSBhIHJlY29yZCAoZGVmZW5zaXZlIGZhbGxiYWNrKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWluT2JqZWN0ID0geyBtb2RlbHM6ICdncHQtNCcgfSBhcyB1bmtub3duIGFzIFJlYWRvbmx5Q2hhdFNlc3Npb25PcHRpb25zTWFwO1xuXHRcdFx0Y29uc3QgcmVjb3JkID0gQ2hhdFNlc3Npb25PcHRpb25zTWFwLnRvUmVjb3JkKHBsYWluT2JqZWN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvcmRbJ21vZGVscyddLCAnZ3B0LTQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Zyb21SZWNvcmQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBhIHJlY29yZCB0byBhIE1hcCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcCA9IENoYXRTZXNzaW9uT3B0aW9uc01hcC5mcm9tUmVjb3JkKHsgbW9kZWxzOiAnZ3B0LTQnLCByZXBvOiAnbXktcmVwbycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnbW9kZWxzJyksICdncHQtNCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ3JlcG8nKSwgJ215LXJlcG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMik7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFD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TyxnQkFBZ0Isc0JBQXNCLGdCQUFnQixHQUFHLEdBQUc7QUFBQSxRQUNsRSxFQUFFLFVBQVUsVUFBVSxPQUFPLFFBQVE7QUFBQSxRQUNyQyxFQUFFLFVBQVUsUUFBUSxPQUFPLFVBQVU7QUFBQSxNQUN0QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxZQUFNLE1BQXFDLG9CQUFJLElBQUk7QUFBQSxRQUNsRCxDQUFDLFNBQVMsRUFBRSxJQUFJLFdBQVcsTUFBTSxVQUFVLENBQUM7QUFBQSxNQUM3QyxDQUFDO0FBQ0QsYUFBTyxnQkFBZ0Isc0JBQXNCLGdCQUFnQixHQUFHLEdBQUc7QUFBQSxRQUNsRSxFQUFFLFVBQVUsU0FBUyxPQUFPLFVBQVU7QUFBQSxNQUN2QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyw0RUFBNEUsTUFBTTtBQUV0RixZQUFNLGNBQWMsRUFBRSxRQUFRLFNBQVMsTUFBTSxVQUFVO0FBQ3ZELGFBQU8sZ0JBQWdCLHNCQUFzQixnQkFBZ0IsV0FBVyxHQUFHO0FBQUEsUUFDMUUsRUFBRSxVQUFVLFVBQVUsT0FBTyxRQUFRO0FBQUEsUUFDckMsRUFBRSxVQUFVLFFBQVEsT0FBTyxVQUFVO0FBQUEsTUFDdEMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sWUFBWSxNQUFNO0FBRXZCLFNBQUssb0NBQW9DLE1BQU07QUFDOUMsWUFBTSxNQUFNLG9CQUFJLElBQUksQ0FBQyxDQUFDLFVBQVUsT0FBTyxDQUFDLENBQUM7QUFDekMsWUFBTSxTQUFTLHNCQUFzQixTQUFTLEdBQUc7QUFDakQsYUFBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLE9BQU87QUFBQSxJQUM3QyxDQUFDO0FBRUQsU0FBSyw0RUFBNEUsTUFBTTtBQUN0RixZQUFNLGNBQWMsRUFBRSxRQUFRLFFBQVE7QUFDdEMsWUFBTSxTQUFTLHNCQUFzQixTQUFTLFdBQVc7QUFDekQsYUFBTyxZQUFZLE9BQU8sUUFBUSxHQUFHLE9BQU87QUFBQSxJQUM3QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxjQUFjLE1BQU07QUFFekIsU0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxZQUFNLE1BQU0sc0JBQXNCLFdBQVcsRUFBRSxRQUFRLFNBQVMsTUFBTSxVQUFVLENBQUM7QUFDakYsYUFBTyxZQUFZLElBQUksSUFBSSxRQUFRLEdBQUcsT0FBTztBQUM3QyxhQUFPLFlBQVksSUFBSSxJQUFJLE1BQU0sR0FBRyxTQUFTO0FBQzdDLGFBQU8sWUFBWSxJQUFJLE1BQU0sQ0FBQztBQUFBLElBQy9CLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJyZXNvdXJjZSJdCn0K
