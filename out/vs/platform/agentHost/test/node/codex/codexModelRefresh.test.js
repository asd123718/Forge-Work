import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import { Event } from "../../../../../base/common/event.js";
import { join } from "../../../../../base/common/path.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { INativeEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IAgentHostGitHubEndpointService } from "../../../node/agentHostGitHubEndpointService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../../node/agentConfigurationService.js";
import { AgentHostStateManager } from "../../../node/agentHostStateManager.js";
import { IAgentHostSessionTitleSignal } from "../../../node/agentHostSessionTitleSignal.js";
import { IAgentSdkDownloader } from "../../../node/agentSdkDownloader.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../../common/agentHostCheckpointService.js";
import { CodexAgent, codexManagedModelProviderEdits, isCodexNonOverridableBuiltInProvider, toCodexModelSelectionId } from "../../../node/codex/codexAgent.js";
import { ICodexProxyService } from "../../../node/codex/codexProxyService.js";
import { ICopilotApiService } from "../../../node/shared/copilotApiService.js";
import { ISessionDataService } from "../../../common/sessionDataService.js";
import { createTestGitHubEndpointService } from "../testGitHubEndpointService.js";
import { AgentHostCodexMultiRootEnabledConfigKey } from "../../../common/agentHostSchema.js";
import { IAgentHostOTelService } from "../../../common/otel/agentHostOTelService.js";
import { AgentHostConfigKey } from "../../../common/agentHostCustomizationConfig.js";
import { CODEX_MODELS_ROOT_CONFIG_KEY, normalizeCodexModelsConfig } from "../../../common/codexModelsConfig.js";
function createAgent(disposables, models, rootConfig = {}, userHome = "/tmp") {
  const instantiationService = new TestInstantiationService();
  const logService = new NullLogService();
  const stateManager = disposables.add(new AgentHostStateManager(logService));
  const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
  configurationService.updateRootConfig(rootConfig);
  instantiationService.stub(ISessionDataService, { _serviceBrand: void 0 });
  instantiationService.stub(ICopilotApiService, { _serviceBrand: void 0, models });
  instantiationService.stub(ICodexProxyService, { _serviceBrand: void 0 });
  instantiationService.stub(IAgentConfigurationService, configurationService);
  instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
  instantiationService.stub(IAgentSdkDownloader, {
    _serviceBrand: void 0,
    isSdkResolvableWithoutDownload: () => new Promise(() => {
    })
  });
  instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
  instantiationService.stub(IAgentHostOTelService, { _serviceBrand: void 0, getNativeSdkTelemetryConfig: async () => void 0 });
  instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: void 0, onDidChangeSessionTitle: Event.None });
  instantiationService.stub(IProductService, { _serviceBrand: void 0, version: "1.0.0-test" });
  instantiationService.stub(INativeEnvironmentService, { userHome: URI.file(userHome) });
  instantiationService.stub(ILogService, logService);
  return disposables.add(instantiationService.createInstance(CodexAgent));
}
suite("CodexAgent model refresh", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const modelListResponse = {
    data: [{
      id: "gpt-5.6-sol",
      model: "gpt-5.6-sol",
      upgrade: null,
      upgradeInfo: null,
      availabilityNux: null,
      displayName: "GPT-5.6-Sol",
      description: "Latest frontier agentic coding model.",
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "Fast responses with lighter reasoning" },
        { reasoningEffort: "medium", description: "Balances speed and reasoning depth for everyday tasks" },
        { reasoningEffort: "high", description: "Greater reasoning depth for complex problems" },
        { reasoningEffort: "xhigh", description: "Extra high reasoning depth for complex problems" },
        { reasoningEffort: "max", description: "Maximum reasoning depth for the hardest problems" },
        { reasoningEffort: "ultra", description: "Maximum reasoning with automatic task delegation" }
      ],
      defaultReasoningEffort: "low",
      inputModalities: ["text", "image"],
      supportsPersonality: true,
      additionalSpeedTiers: [],
      serviceTiers: [],
      defaultServiceTier: null,
      isDefault: true
    }],
    nextCursor: null
  };
  function createChatGPTHome() {
    const userHome = fs.mkdtempSync(join(os.tmpdir(), "vscode-codex-agent-test-"));
    const codexHome = join(userHome, ".codex");
    fs.mkdirSync(codexHome);
    fs.writeFileSync(join(codexHome, "auth.json"), JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: "access", refresh_token: "refresh" }
    }));
    return userHome;
  }
  function createChatGPTConnection(account = { type: "chatgpt", email: "person@example.com", planType: "plus" }) {
    return {
      kind: "ready",
      client: {
        request: async (method) => {
          if (method === "account/read") {
            return { account, requiresOpenaiAuth: true };
          }
          if (method === "config/read") {
            return { config: { model_provider: "openai" } };
          }
          if (method === "model/list") {
            return modelListResponse;
          }
          throw new Error(`Unexpected request: ${method}`);
        }
      },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
  }
  test("eagerly enumerates authoritative ChatGPT models when existing auth is detected", async () => {
    const userHome = createChatGPTHome();
    try {
      const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome);
      const connection = createChatGPTConnection();
      let resolveConnection;
      const connectionPromise = new Promise((resolve) => {
        resolveConnection = () => resolve(connection);
      });
      let ensureConnectionCalls = 0;
      agent["_isSdkResolvableWithoutDownload"] = async () => false;
      agent["_ensureConnection"] = async () => {
        ensureConnectionCalls++;
        return connectionPromise;
      };
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(ensureConnectionCalls, 1);
      assert.deepStrictEqual(agent.models.get(), []);
      resolveConnection();
      await agent.refreshModels();
      assert.deepStrictEqual(agent.models.get().map((model) => ({ provider: model.provider, id: model.id, name: model.name, meta: model._meta })), [{
        provider: "chatgpt",
        id: toCodexModelSelectionId("openai", "gpt-5.6-sol"),
        name: "GPT-5.6-Sol",
        meta: { modelSourceId: "chatgptSubscription" }
      }]);
    } finally {
      fs.rmSync(userHome, { recursive: true, force: true });
    }
  });
  test("does not enumerate ChatGPT models while signed-out use is disabled", async () => {
    const userHome = createChatGPTHome();
    try {
      const agent = createAgent(disposables, async () => [], {}, userHome);
      let ensureConnectionCalls = 0;
      agent["_isSdkResolvableWithoutDownload"] = async () => false;
      agent["_ensureConnection"] = async () => {
        ensureConnectionCalls++;
        return createChatGPTConnection();
      };
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(ensureConnectionCalls, 0);
      assert.deepStrictEqual(agent.models.get(), []);
    } finally {
      fs.rmSync(userHome, { recursive: true, force: true });
    }
  });
  test("requires Copilot unless signed-out use and persisted ChatGPT auth are both present", () => {
    const userHome = createChatGPTHome();
    try {
      const copilotRequired = (agent) => agent.getProtectedResources()[0].required;
      assert.deepStrictEqual({
        noChatGPTAuth: copilotRequired(createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true })),
        chatGPTAuthEnabled: copilotRequired(createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome)),
        chatGPTAuthDisabled: copilotRequired(createAgent(disposables, async () => [], {}, userHome))
      }, {
        noChatGPTAuth: true,
        chatGPTAuthEnabled: false,
        chatGPTAuthDisabled: true
      });
    } finally {
      fs.rmSync(userHome, { recursive: true, force: true });
    }
  });
  test("requires Copilot again after persisted ChatGPT auth is removed", async () => {
    const userHome = createChatGPTHome();
    try {
      const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome);
      assert.strictEqual(agent.getProtectedResources()[0].required, false);
      fs.rmSync(join(userHome, ".codex", "auth.json"));
      agent["_connection"] = createChatGPTConnection(null);
      await agent.refreshModels();
      assert.deepStrictEqual({
        copilotRequired: agent.getProtectedResources()[0].required,
        models: agent.models.get()
      }, {
        copilotRequired: true,
        models: []
      });
    } finally {
      fs.rmSync(userHome, { recursive: true, force: true });
    }
  });
  test("waits for an app-server already starting when signed-out use becomes enabled", async () => {
    const userHome = createChatGPTHome();
    try {
      const agent = createAgent(disposables, async () => [], {}, userHome);
      const connection = createChatGPTConnection();
      let resolveConnection;
      agent["_connection"] = { kind: "starting", promise: new Promise((resolve) => {
        resolveConnection = () => resolve(connection);
      }) };
      agent["_configurationService"].updateRootConfig({ [AgentHostConfigKey.AllowSignedOutWhenUsable]: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(agent.models.get(), []);
      resolveConnection();
      await agent.refreshModels();
      assert.deepStrictEqual(agent.models.get().map((model) => model.id), [toCodexModelSelectionId("openai", "gpt-5.6-sol")]);
    } finally {
      fs.rmSync(userHome, { recursive: true, force: true });
    }
  });
  test("does not publish ChatGPT models when detected credentials are invalid", async () => {
    const userHome = createChatGPTHome();
    try {
      const copilotModels = [{ id: "copilot-model", name: "Copilot Model", supported_endpoints: ["/responses"] }];
      const agent = createAgent(disposables, async () => copilotModels, { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome);
      agent["_githubToken"] = "token";
      agent["_connection"] = createChatGPTConnection(null);
      await agent.refreshModels();
      assert.deepStrictEqual({
        providers: agent.models.get().map((model) => model.provider),
        copilotRequired: agent.getProtectedResources()[0].required
      }, {
        providers: ["copilot"],
        copilotRequired: true
      });
    } finally {
      fs.rmSync(userHome, { recursive: true, force: true });
    }
  });
  test("does not publish a model when authoritative discovery fails", async () => {
    const userHome = createChatGPTHome();
    try {
      const agent = createAgent(disposables, async () => [], { [AgentHostConfigKey.AllowSignedOutWhenUsable]: true }, userHome);
      agent["_connection"] = {
        kind: "ready",
        client: {
          request: async (method) => {
            if (method === "account/read") {
              return { account: { type: "chatgpt", email: null, planType: "plus" }, requiresOpenaiAuth: true };
            }
            throw new Error("model discovery failed");
          }
        },
        proxyHandle: { dispose() {
        } },
        child: { kill: () => true }
      };
      await agent.refreshModels();
      assert.deepStrictEqual(agent.models.get(), []);
    } finally {
      fs.rmSync(userHome, { recursive: true, force: true });
    }
  });
  test("keeps the last known-good models when a periodic refresh fails", async () => {
    let shouldFail = false;
    const models = [{ id: "gpt-5.5", name: "GPT-5.5", supported_endpoints: ["/responses"] }];
    const agent = createAgent(disposables, async () => {
      if (shouldFail) {
        throw new Error("transient failure");
      }
      return models;
    });
    agent["_isSdkResolvableWithoutDownload"] = async () => false;
    const resource = agent.getProtectedResources()[0].resource;
    await agent.authenticate(resource, "token");
    await agent.refreshModels();
    shouldFail = true;
    await agent.refreshModels();
    assert.deepStrictEqual(agent.models.get().map((model) => model.id), [toCodexModelSelectionId("vscode-proxy", "gpt-5.5")]);
  });
  test("uses the reasoning efforts advertised by Copilot models", async () => {
    const model = {
      billing: { is_premium: true, multiplier: 1, restricted_to: [] },
      capabilities: {
        family: "gpt-5.6",
        limits: { max_context_window_tokens: 272e3, max_output_tokens: 32e3, max_prompt_tokens: 24e4 },
        object: "model_capabilities",
        supports: { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: true },
        tokenizer: "o200k_base",
        type: "chat"
      },
      id: "gpt-5.6-sol",
      is_chat_default: true,
      is_chat_fallback: false,
      model_picker_category: "advanced",
      model_picker_enabled: true,
      name: "GPT-5.6-Sol",
      object: "model",
      policy: { state: "enabled", terms: "" },
      preview: false,
      supported_endpoints: ["/responses"],
      vendor: "OpenAI",
      version: "gpt-5.6-sol"
    };
    model.capabilities.supports.reasoning_effort = ["none", "low", "medium", "high", "xhigh", "max"];
    const agent = createAgent(disposables, async () => [model]);
    await agent.authenticate(agent.getProtectedResources()[0].resource, "token");
    await agent.refreshModels();
    assert.deepStrictEqual(agent.models.get().map((model2) => ({
      id: model2.id,
      thinkingLevel: model2.configSchema?.properties.thinkingLevel && {
        enum: model2.configSchema.properties.thinkingLevel.enum,
        default: model2.configSchema.properties.thinkingLevel.default
      }
    })), [{
      id: toCodexModelSelectionId("vscode-proxy", "gpt-5.6-sol"),
      thinkingLevel: {
        enum: ["none", "low", "medium", "high", "xhigh", "max"],
        default: "medium"
      }
    }]);
  });
  test("omits the thinking level when a Copilot model advertises no reasoning efforts", async () => {
    const model = { id: "gpt-5.5", name: "GPT-5.5", supported_endpoints: ["/responses"] };
    const agent = createAgent(disposables, async () => [model]);
    await agent.authenticate(agent.getProtectedResources()[0].resource, "token");
    await agent.refreshModels();
    assert.strictEqual(agent.models.get()[0].configSchema, void 0);
  });
  test("applies authentication received while the connection is starting to the proxy", async () => {
    const agent = createAgent(disposables, async () => []);
    agent["_queueModelRefresh"] = async () => {
    };
    agent["_refreshProviderConfiguration"] = async () => {
    };
    const appliedTokens = [];
    const ready = {
      client: { dispose() {
      } },
      proxyHandle: {
        setToken: (token) => appliedTokens.push(token),
        dispose() {
        }
      },
      child: { kill: () => true }
    };
    let resolveStart;
    agent["_startConnection"] = () => new Promise((resolve) => resolveStart = resolve);
    const connection = agent["_ensureConnection"]();
    await agent.authenticate(agent.getProtectedResources()[0].resource, "token-arriving-during-start");
    resolveStart(ready);
    await connection;
    assert.deepStrictEqual(appliedTokens, ["token-arriving-during-start"]);
  });
  test("surfaces current ChatGPT subscription models under the ChatGPT provider", async () => {
    const agent = createAgent(disposables, async () => []);
    agent["_connection"] = {
      kind: "ready",
      client: {
        request: async (method) => {
          if (method === "account/read") {
            return { account: { type: "chatgpt", email: "person@example.com", planType: "plus" }, requiresOpenaiAuth: true };
          }
          if (method === "config/read") {
            return { config: { model_provider: "openai" } };
          }
          if (method === "model/list") {
            return modelListResponse;
          }
          throw new Error(`Unexpected request: ${method}`);
        }
      },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
    await agent.refreshModels();
    assert.deepStrictEqual(agent.models.get().map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name,
      thinkingLevel: model.configSchema?.properties.thinkingLevel && {
        enum: model.configSchema.properties.thinkingLevel.enum,
        default: model.configSchema.properties.thinkingLevel.default
      },
      meta: model._meta
    })), [{
      provider: "chatgpt",
      id: toCodexModelSelectionId("openai", "gpt-5.6-sol"),
      name: "GPT-5.6-Sol",
      thinkingLevel: {
        enum: ["low", "medium", "high", "xhigh", "max", "ultra"],
        default: "low"
      },
      meta: { modelSourceId: "chatgptSubscription" }
    }]);
  });
  test("omits the thinking level when a Codex model advertises no reasoning efforts", async () => {
    const agent = createAgent(disposables, async () => []);
    agent["_connection"] = {
      kind: "ready",
      client: {
        request: async (method) => {
          if (method === "account/read") {
            return { account: { type: "chatgpt", email: "person@example.com", planType: "plus" }, requiresOpenaiAuth: true };
          }
          if (method === "config/read") {
            return { config: { model_provider: "openai" } };
          }
          if (method === "model/list") {
            return {
              ...modelListResponse,
              data: modelListResponse.data.map((model) => ({ ...model, supportedReasoningEfforts: [] }))
            };
          }
          throw new Error(`Unexpected request: ${method}`);
        }
      },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
    await agent.refreshModels();
    assert.strictEqual(agent.models.get()[0].configSchema, void 0);
  });
  test("removes ChatGPT models when account/read reports signed out", async () => {
    const agent = createAgent(disposables, async () => []);
    agent["_codexModels"] = [{ provider: "chatgpt", id: toCodexModelSelectionId("openai", "gpt-5.6-sol"), name: "GPT-5.6-Sol", supportsVision: true }];
    agent["_connection"] = {
      kind: "ready",
      client: {
        request: async (method) => {
          assert.strictEqual(method, "account/read");
          return { account: null, requiresOpenaiAuth: true };
        }
      },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
    await agent["_refreshCodexModels"]();
    assert.deepStrictEqual(agent["_codexModels"], []);
  });
  test("keeps a configured Ollama model available while ChatGPT is signed out", async () => {
    const agent = createAgent(disposables, async () => [], {
      [CODEX_MODELS_ROOT_CONFIG_KEY]: {
        model: "qwen3.5:9b-q4_k_m",
        modelProvider: "ollama",
        providers: [{
          id: "ollama",
          catalogId: "ollama",
          name: "Ollama",
          baseUrl: "http://localhost:11434/v1",
          envKey: "",
          kind: "ollama",
          authMode: "none",
          wireApi: "responses",
          enabled: true,
          models: [{ name: "qwen3.5:9b-q4_k_m", enabled: true }],
          selectedModel: "qwen3.5:9b-q4_k_m"
        }]
      }
    });
    agent["_discoverLocalModels"] = async () => [{ id: "qwen3.5:9b-q4_k_m", name: "Qwen 3.5 9B" }];
    let appServerRequests = 0;
    agent["_connection"] = {
      kind: "ready",
      client: { request: async () => {
        appServerRequests++;
        throw new Error("local refresh must not depend on account/read");
      } },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
    await agent["_refreshCodexModels"]();
    assert.deepStrictEqual({
      appServerRequests,
      models: agent["_codexModels"].map((model) => ({ provider: model.provider, id: model.id, name: model.name }))
    }, {
      appServerRequests: 0,
      models: [{
        provider: "ollama",
        id: toCodexModelSelectionId("ollama", "qwen3.5:9b-q4_k_m"),
        name: "Qwen 3.5 9B"
      }]
    });
  });
  test("does not write non-overridable built-in providers as custom model_providers", () => {
    assert.deepStrictEqual({
      openai: isCodexNonOverridableBuiltInProvider("openai"),
      ollama: isCodexNonOverridableBuiltInProvider("OLLAMA"),
      lmstudio: isCodexNonOverridableBuiltInProvider("lmstudio"),
      custom: isCodexNonOverridableBuiltInProvider("openai-custom")
    }, {
      openai: true,
      ollama: true,
      lmstudio: true,
      custom: false
    });
  });
  test("syncs an Ollama selection without writing a reserved model_providers.ollama table", () => {
    const previous = normalizeCodexModelsConfig({ model: "", modelProvider: "", providers: [] });
    const next = normalizeCodexModelsConfig({
      model: "qwen3.5:9b-q4_k_m",
      modelProvider: "ollama",
      providers: [{
        id: "ollama",
        catalogId: "ollama",
        name: "Ollama",
        baseUrl: "http://localhost:11434/v1",
        envKey: "",
        kind: "ollama",
        authMode: "none",
        wireApi: "responses",
        enabled: true,
        models: [{ name: "qwen3.5:9b-q4_k_m", enabled: true }],
        selectedModel: "qwen3.5:9b-q4_k_m"
      }]
    });
    assert.deepStrictEqual(codexManagedModelProviderEdits(previous, next), []);
  });
  test("keeps configured non-human providers out of the ChatGPT group", async () => {
    const agent = createAgent(disposables, async () => []);
    agent["_connection"] = {
      kind: "ready",
      client: {
        request: async (method) => {
          if (method === "account/read") {
            return { account: { type: "apiKey" }, requiresOpenaiAuth: true };
          }
          if (method === "config/read") {
            return { config: { model_provider: "custom-provider" } };
          }
          if (method === "model/list") {
            return modelListResponse;
          }
          throw new Error(`Unexpected request: ${method}`);
        }
      },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
    await agent["_refreshCodexModels"]();
    assert.deepStrictEqual(agent["_codexModels"].map((model) => ({ provider: model.provider, id: model.id, meta: model._meta })), [{
      provider: "custom-provider",
      id: toCodexModelSelectionId("custom-provider", "gpt-5.6-sol"),
      meta: void 0
    }]);
  });
  test("does not treat a custom provider named chatgpt as a ChatGPT subscription", async () => {
    const agent = createAgent(disposables, async () => []);
    agent["_connection"] = {
      kind: "ready",
      client: {
        request: async (method) => {
          if (method === "account/read") {
            return { account: { type: "apiKey" }, requiresOpenaiAuth: false };
          }
          if (method === "config/read") {
            return { config: { model_provider: "chatgpt" } };
          }
          if (method === "model/list") {
            return modelListResponse;
          }
          throw new Error(`Unexpected request: ${method}`);
        }
      },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
    await agent["_refreshCodexModels"]();
    assert.deepStrictEqual(agent["_codexModels"].map((model) => ({ provider: model.provider, meta: model._meta })), [{
      provider: "chatgpt",
      meta: void 0
    }]);
  });
  test("does not relabel a custom provider when ChatGPT authentication is available", async () => {
    const agent = createAgent(disposables, async () => []);
    agent["_connection"] = {
      kind: "ready",
      client: {
        request: async (method) => {
          if (method === "account/read") {
            return { account: { type: "chatgpt", email: "person@example.com", planType: "plus" }, requiresOpenaiAuth: false };
          }
          if (method === "config/read") {
            return { config: { model_provider: "custom-provider" } };
          }
          if (method === "model/list") {
            return modelListResponse;
          }
          throw new Error(`Unexpected request: ${method}`);
        }
      },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
    await agent["_refreshCodexModels"]();
    assert.deepStrictEqual(agent["_codexModels"].map((model) => ({ provider: model.provider, meta: model._meta })), [{
      provider: "custom-provider",
      meta: void 0
    }]);
  });
  test("signs out through app-server and refreshes account state", async () => {
    const agent = createAgent(disposables, async () => []);
    const requests = [];
    agent["_connection"] = {
      kind: "ready",
      client: {
        request: async (method) => {
          requests.push(method);
          if (method === "account/logout") {
            return {};
          }
          if (method === "account/read") {
            return { account: null, requiresOpenaiAuth: true };
          }
          throw new Error(`Unexpected request: ${method}`);
        }
      },
      proxyHandle: { dispose() {
      } },
      child: { kill: () => true }
    };
    agent["_queueModelRefresh"] = async () => {
    };
    await agent["_signOutOfChatGPT"]();
    assert.deepStrictEqual({
      requests,
      accountStatus: agent["_openAIAccountState"].status
    }, {
      requests: ["account/logout", "account/read"],
      accountStatus: "signedOut"
    });
  });
  test("clears Copilot proxy credentials and models when authentication is removed", async () => {
    const agent = createAgent(disposables, async () => []);
    const appliedTokens = [];
    agent["_githubToken"] = "stale-token";
    agent["_copilotModels"] = [{
      provider: "copilot",
      id: toCodexModelSelectionId("vscode-proxy", "gpt-5.3-codex"),
      name: "GPT-5.3-Codex",
      supportsVision: false
    }];
    agent["_models"].set(agent["_copilotModels"], void 0);
    agent["_connection"] = {
      kind: "ready",
      client: {
        request: async (method) => {
          if (method === "account/read") {
            return { account: null, requiresOpenaiAuth: true };
          }
          throw new Error(`Unexpected request: ${method}`);
        }
      },
      proxyHandle: {
        setToken: (token) => appliedTokens.push(token),
        dispose() {
        }
      },
      child: { kill: () => true }
    };
    await agent.authenticate(agent.getProtectedResources()[0].resource, "");
    await agent.refreshModels();
    assert.deepStrictEqual({
      githubToken: agent["_githubToken"],
      appliedTokens,
      models: agent.models.get()
    }, {
      githubToken: void 0,
      appliedTokens: [""],
      models: []
    });
  });
  test("advertises multiple working directories only while enabled", () => {
    const agent = createAgent(disposables, async () => []);
    const disabledByDefault = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
    agent["_configurationService"].updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: true });
    const whenEnabled = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
    agent["_configurationService"].updateRootConfig({ [AgentHostCodexMultiRootEnabledConfigKey]: false });
    const afterDisabling = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
    assert.deepStrictEqual({ disabledByDefault, whenEnabled, afterDisabling }, {
      disabledByDefault: void 0,
      whenEnabled: { immutablePrimary: true },
      afterDisabling: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhNb2RlbFJlZnJlc2gudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ0NBTW9kZWwgfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHR5cGUgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCB9IGZyb20gJy4uLy4uLy4uL25vZGUvYWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsLmpzJztcbmltcG9ydCB7IElBZ2VudFNka0Rvd25sb2FkZXIgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50U2RrRG93bmxvYWRlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGV4QWdlbnQsIGNvZGV4TWFuYWdlZE1vZGVsUHJvdmlkZXJFZGl0cywgaXNDb2RleE5vbk92ZXJyaWRhYmxlQnVpbHRJblByb3ZpZGVyLCB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhBZ2VudC5qcyc7XG5pbXBvcnQgeyBJQ29kZXhQcm94eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4UHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdE9UZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL290ZWwvYWdlbnRIb3N0T1RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWcuanMnO1xuaW1wb3J0IHsgQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWSwgbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29kZXhNb2RlbHNDb25maWcuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVBZ2VudChkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgbW9kZWxzOiAoKSA9PiBQcm9taXNlPENDQU1vZGVsW10+LCByb290Q29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9LCB1c2VySG9tZSA9ICcvdG1wJyk6IENvZGV4QWdlbnQge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSb290Q29uZmlnKHJvb3RDb25maWcpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb3BpbG90QXBpU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIG1vZGVscyB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29kZXhQcm94eVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRTZGtEb3dubG9hZGVyLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGlzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZDogKCkgPT4gbmV3IFByb21pc2U8Ym9vbGVhbj4oKCkgPT4geyB9KSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdE9UZWxTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgZ2V0TmF0aXZlU2RrVGVsZW1ldHJ5Q29uZmlnOiBhc3luYyAoKSA9PiB1bmRlZmluZWQgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlU2Vzc2lvblRpdGxlOiBFdmVudC5Ob25lIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIHZlcnNpb246ICcxLjAuMC10ZXN0JyB9IGFzIElQcm9kdWN0U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSwgeyB1c2VySG9tZTogVVJJLmZpbGUodXNlckhvbWUpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RleEFnZW50KSk7XG59XG5cbnN1aXRlKCdDb2RleEFnZW50IG1vZGVsIHJlZnJlc2gnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0Y29uc3QgbW9kZWxMaXN0UmVzcG9uc2UgPSB7XG5cdFx0ZGF0YTogW3tcblx0XHRcdGlkOiAnZ3B0LTUuNi1zb2wnLFxuXHRcdFx0bW9kZWw6ICdncHQtNS42LXNvbCcsXG5cdFx0XHR1cGdyYWRlOiBudWxsLFxuXHRcdFx0dXBncmFkZUluZm86IG51bGwsXG5cdFx0XHRhdmFpbGFiaWxpdHlOdXg6IG51bGwsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0dQVC01LjYtU29sJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnTGF0ZXN0IGZyb250aWVyIGFnZW50aWMgY29kaW5nIG1vZGVsLicsXG5cdFx0XHRoaWRkZW46IGZhbHNlLFxuXHRcdFx0c3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0czogW1xuXHRcdFx0XHR7IHJlYXNvbmluZ0VmZm9ydDogJ2xvdycsIGRlc2NyaXB0aW9uOiAnRmFzdCByZXNwb25zZXMgd2l0aCBsaWdodGVyIHJlYXNvbmluZycgfSxcblx0XHRcdFx0eyByZWFzb25pbmdFZmZvcnQ6ICdtZWRpdW0nLCBkZXNjcmlwdGlvbjogJ0JhbGFuY2VzIHNwZWVkIGFuZCByZWFzb25pbmcgZGVwdGggZm9yIGV2ZXJ5ZGF5IHRhc2tzJyB9LFxuXHRcdFx0XHR7IHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnLCBkZXNjcmlwdGlvbjogJ0dyZWF0ZXIgcmVhc29uaW5nIGRlcHRoIGZvciBjb21wbGV4IHByb2JsZW1zJyB9LFxuXHRcdFx0XHR7IHJlYXNvbmluZ0VmZm9ydDogJ3hoaWdoJywgZGVzY3JpcHRpb246ICdFeHRyYSBoaWdoIHJlYXNvbmluZyBkZXB0aCBmb3IgY29tcGxleCBwcm9ibGVtcycgfSxcblx0XHRcdFx0eyByZWFzb25pbmdFZmZvcnQ6ICdtYXgnLCBkZXNjcmlwdGlvbjogJ01heGltdW0gcmVhc29uaW5nIGRlcHRoIGZvciB0aGUgaGFyZGVzdCBwcm9ibGVtcycgfSxcblx0XHRcdFx0eyByZWFzb25pbmdFZmZvcnQ6ICd1bHRyYScsIGRlc2NyaXB0aW9uOiAnTWF4aW11bSByZWFzb25pbmcgd2l0aCBhdXRvbWF0aWMgdGFzayBkZWxlZ2F0aW9uJyB9LFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHRSZWFzb25pbmdFZmZvcnQ6ICdsb3cnLFxuXHRcdFx0aW5wdXRNb2RhbGl0aWVzOiBbJ3RleHQnLCAnaW1hZ2UnXSxcblx0XHRcdHN1cHBvcnRzUGVyc29uYWxpdHk6IHRydWUsXG5cdFx0XHRhZGRpdGlvbmFsU3BlZWRUaWVyczogW10sXG5cdFx0XHRzZXJ2aWNlVGllcnM6IFtdLFxuXHRcdFx0ZGVmYXVsdFNlcnZpY2VUaWVyOiBudWxsLFxuXHRcdFx0aXNEZWZhdWx0OiB0cnVlLFxuXHRcdH1dLFxuXHRcdG5leHRDdXJzb3I6IG51bGwsXG5cdH07XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ2hhdEdQVEhvbWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCB1c2VySG9tZSA9IGZzLm1rZHRlbXBTeW5jKGpvaW4ob3MudG1wZGlyKCksICd2c2NvZGUtY29kZXgtYWdlbnQtdGVzdC0nKSk7XG5cdFx0Y29uc3QgY29kZXhIb21lID0gam9pbih1c2VySG9tZSwgJy5jb2RleCcpO1xuXHRcdGZzLm1rZGlyU3luYyhjb2RleEhvbWUpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbihjb2RleEhvbWUsICdhdXRoLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0YXV0aF9tb2RlOiAnY2hhdGdwdCcsXG5cdFx0XHR0b2tlbnM6IHsgYWNjZXNzX3Rva2VuOiAnYWNjZXNzJywgcmVmcmVzaF90b2tlbjogJ3JlZnJlc2gnIH0sXG5cdFx0fSkpO1xuXHRcdHJldHVybiB1c2VySG9tZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNoYXRHUFRDb25uZWN0aW9uKGFjY291bnQ6IHVua25vd24gPSB7IHR5cGU6ICdjaGF0Z3B0JywgZW1haWw6ICdwZXJzb25AZXhhbXBsZS5jb20nLCBwbGFuVHlwZTogJ3BsdXMnIH0pIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3JlYWR5Jyxcblx0XHRcdGNsaWVudDoge1xuXHRcdFx0XHRyZXF1ZXN0OiBhc3luYyAobWV0aG9kOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRpZiAobWV0aG9kID09PSAnYWNjb3VudC9yZWFkJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgYWNjb3VudCwgcmVxdWlyZXNPcGVuYWlBdXRoOiB0cnVlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtZXRob2QgPT09ICdjb25maWcvcmVhZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGNvbmZpZzogeyBtb2RlbF9wcm92aWRlcjogJ29wZW5haScgfSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWV0aG9kID09PSAnbW9kZWwvbGlzdCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiBtb2RlbExpc3RSZXNwb25zZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHJlcXVlc3Q6ICR7bWV0aG9kfWApO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHByb3h5SGFuZGxlOiB7IGRpc3Bvc2UoKSB7IH0gfSxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZWFnZXJseSBlbnVtZXJhdGVzIGF1dGhvcml0YXRpdmUgQ2hhdEdQVCBtb2RlbHMgd2hlbiBleGlzdGluZyBhdXRoIGlzIGRldGVjdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVzZXJIb21lID0gY3JlYXRlQ2hhdEdQVEhvbWUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgYXN5bmMgKCkgPT4gW10sIHsgW0FnZW50SG9zdENvbmZpZ0tleS5BbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVdOiB0cnVlIH0sIHVzZXJIb21lKTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBjcmVhdGVDaGF0R1BUQ29ubmVjdGlvbigpO1xuXHRcdFx0bGV0IHJlc29sdmVDb25uZWN0aW9uITogKCkgPT4gdm9pZDtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb25Qcm9taXNlID0gbmV3IFByb21pc2U8bmV2ZXI+KHJlc29sdmUgPT4geyByZXNvbHZlQ29ubmVjdGlvbiA9ICgpID0+IHJlc29sdmUoY29ubmVjdGlvbiBhcyBuZXZlcik7IH0pO1xuXHRcdFx0bGV0IGVuc3VyZUNvbm5lY3Rpb25DYWxscyA9IDA7XG5cdFx0XHRhZ2VudFsnX2lzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZCddID0gYXN5bmMgKCkgPT4gZmFsc2U7XG5cdFx0XHRhZ2VudFsnX2Vuc3VyZUNvbm5lY3Rpb24nXSA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0ZW5zdXJlQ29ubmVjdGlvbkNhbGxzKys7XG5cdFx0XHRcdHJldHVybiBjb25uZWN0aW9uUHJvbWlzZTtcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5zdXJlQ29ubmVjdGlvbkNhbGxzLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQubW9kZWxzLmdldCgpLCBbXSk7XG5cblx0XHRcdHJlc29sdmVDb25uZWN0aW9uKCk7XG5cdFx0XHRhd2FpdCBhZ2VudC5yZWZyZXNoTW9kZWxzKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQubW9kZWxzLmdldCgpLm1hcChtb2RlbCA9PiAoeyBwcm92aWRlcjogbW9kZWwucHJvdmlkZXIsIGlkOiBtb2RlbC5pZCwgbmFtZTogbW9kZWwubmFtZSwgbWV0YTogbW9kZWwuX21ldGEgfSkpLCBbe1xuXHRcdFx0XHRwcm92aWRlcjogJ2NoYXRncHQnLFxuXHRcdFx0XHRpZDogdG9Db2RleE1vZGVsU2VsZWN0aW9uSWQoJ29wZW5haScsICdncHQtNS42LXNvbCcpLFxuXHRcdFx0XHRuYW1lOiAnR1BULTUuNi1Tb2wnLFxuXHRcdFx0XHRtZXRhOiB7IG1vZGVsU291cmNlSWQ6ICdjaGF0Z3B0U3Vic2NyaXB0aW9uJyB9LFxuXHRcdFx0fV0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmcy5ybVN5bmModXNlckhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGVudW1lcmF0ZSBDaGF0R1BUIG1vZGVscyB3aGlsZSBzaWduZWQtb3V0IHVzZSBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1c2VySG9tZSA9IGNyZWF0ZUNoYXRHUFRIb21lKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IFtdLCB7fSwgdXNlckhvbWUpO1xuXHRcdFx0bGV0IGVuc3VyZUNvbm5lY3Rpb25DYWxscyA9IDA7XG5cdFx0XHRhZ2VudFsnX2lzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZCddID0gYXN5bmMgKCkgPT4gZmFsc2U7XG5cdFx0XHRhZ2VudFsnX2Vuc3VyZUNvbm5lY3Rpb24nXSA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0ZW5zdXJlQ29ubmVjdGlvbkNhbGxzKys7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVDaGF0R1BUQ29ubmVjdGlvbigpIGFzIG5ldmVyO1xuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuc3VyZUNvbm5lY3Rpb25DYWxscywgMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50Lm1vZGVscy5nZXQoKSwgW10pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmcy5ybVN5bmModXNlckhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIENvcGlsb3QgdW5sZXNzIHNpZ25lZC1vdXQgdXNlIGFuZCBwZXJzaXN0ZWQgQ2hhdEdQVCBhdXRoIGFyZSBib3RoIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSBjcmVhdGVDaGF0R1BUSG9tZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb3BpbG90UmVxdWlyZWQgPSAoYWdlbnQ6IENvZGV4QWdlbnQpID0+IGFnZW50LmdldFByb3RlY3RlZFJlc291cmNlcygpWzBdLnJlcXVpcmVkO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG5vQ2hhdEdQVEF1dGg6IGNvcGlsb3RSZXF1aXJlZChjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgYXN5bmMgKCkgPT4gW10sIHsgW0FnZW50SG9zdENvbmZpZ0tleS5BbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVdOiB0cnVlIH0pKSxcblx0XHRcdFx0Y2hhdEdQVEF1dGhFbmFibGVkOiBjb3BpbG90UmVxdWlyZWQoY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IFtdLCB7IFtBZ2VudEhvc3RDb25maWdLZXkuQWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlXTogdHJ1ZSB9LCB1c2VySG9tZSkpLFxuXHRcdFx0XHRjaGF0R1BUQXV0aERpc2FibGVkOiBjb3BpbG90UmVxdWlyZWQoY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IFtdLCB7fSwgdXNlckhvbWUpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bm9DaGF0R1BUQXV0aDogdHJ1ZSxcblx0XHRcdFx0Y2hhdEdQVEF1dGhFbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0Y2hhdEdQVEF1dGhEaXNhYmxlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmcy5ybVN5bmModXNlckhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIENvcGlsb3QgYWdhaW4gYWZ0ZXIgcGVyc2lzdGVkIENoYXRHUFQgYXV0aCBpcyByZW1vdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVzZXJIb21lID0gY3JlYXRlQ2hhdEdQVEhvbWUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgYXN5bmMgKCkgPT4gW10sIHsgW0FnZW50SG9zdENvbmZpZ0tleS5BbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVdOiB0cnVlIH0sIHVzZXJIb21lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKVswXS5yZXF1aXJlZCwgZmFsc2UpO1xuXG5cdFx0XHRmcy5ybVN5bmMoam9pbih1c2VySG9tZSwgJy5jb2RleCcsICdhdXRoLmpzb24nKSk7XG5cdFx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IGNyZWF0ZUNoYXRHUFRDb25uZWN0aW9uKG51bGwpIGFzIG5ldmVyO1xuXHRcdFx0YXdhaXQgYWdlbnQucmVmcmVzaE1vZGVscygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29waWxvdFJlcXVpcmVkOiBhZ2VudC5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKVswXS5yZXF1aXJlZCxcblx0XHRcdFx0bW9kZWxzOiBhZ2VudC5tb2RlbHMuZ2V0KCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvcGlsb3RSZXF1aXJlZDogdHJ1ZSxcblx0XHRcdFx0bW9kZWxzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmcy5ybVN5bmModXNlckhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3dhaXRzIGZvciBhbiBhcHAtc2VydmVyIGFscmVhZHkgc3RhcnRpbmcgd2hlbiBzaWduZWQtb3V0IHVzZSBiZWNvbWVzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSBjcmVhdGVDaGF0R1BUSG9tZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBbXSwge30sIHVzZXJIb21lKTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBjcmVhdGVDaGF0R1BUQ29ubmVjdGlvbigpO1xuXHRcdFx0bGV0IHJlc29sdmVDb25uZWN0aW9uITogKCkgPT4gdm9pZDtcblx0XHRcdGFnZW50WydfY29ubmVjdGlvbiddID0geyBraW5kOiAnc3RhcnRpbmcnLCBwcm9taXNlOiBuZXcgUHJvbWlzZTxuZXZlcj4ocmVzb2x2ZSA9PiB7IHJlc29sdmVDb25uZWN0aW9uID0gKCkgPT4gcmVzb2x2ZShjb25uZWN0aW9uIGFzIG5ldmVyKTsgfSkgfTtcblxuXHRcdFx0YWdlbnRbJ19jb25maWd1cmF0aW9uU2VydmljZSddLnVwZGF0ZVJvb3RDb25maWcoeyBbQWdlbnRIb3N0Q29uZmlnS2V5LkFsbG93U2lnbmVkT3V0V2hlblVzYWJsZV06IHRydWUgfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5tb2RlbHMuZ2V0KCksIFtdKTtcblxuXHRcdFx0cmVzb2x2ZUNvbm5lY3Rpb24oKTtcblx0XHRcdGF3YWl0IGFnZW50LnJlZnJlc2hNb2RlbHMoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5tb2RlbHMuZ2V0KCkubWFwKG1vZGVsID0+IG1vZGVsLmlkKSwgW3RvQ29kZXhNb2RlbFNlbGVjdGlvbklkKCdvcGVuYWknLCAnZ3B0LTUuNi1zb2wnKV0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmcy5ybVN5bmModXNlckhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHB1Ymxpc2ggQ2hhdEdQVCBtb2RlbHMgd2hlbiBkZXRlY3RlZCBjcmVkZW50aWFscyBhcmUgaW52YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1c2VySG9tZSA9IGNyZWF0ZUNoYXRHUFRIb21lKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvcGlsb3RNb2RlbHMgPSBbeyBpZDogJ2NvcGlsb3QtbW9kZWwnLCBuYW1lOiAnQ29waWxvdCBNb2RlbCcsIHN1cHBvcnRlZF9lbmRwb2ludHM6IFsnL3Jlc3BvbnNlcyddIH1dIGFzIENDQU1vZGVsW107XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBjb3BpbG90TW9kZWxzLCB7IFtBZ2VudEhvc3RDb25maWdLZXkuQWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlXTogdHJ1ZSB9LCB1c2VySG9tZSk7XG5cdFx0XHRhZ2VudFsnX2dpdGh1YlRva2VuJ10gPSAndG9rZW4nO1xuXHRcdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSBjcmVhdGVDaGF0R1BUQ29ubmVjdGlvbihudWxsKSBhcyBuZXZlcjtcblxuXHRcdFx0YXdhaXQgYWdlbnQucmVmcmVzaE1vZGVscygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cHJvdmlkZXJzOiBhZ2VudC5tb2RlbHMuZ2V0KCkubWFwKG1vZGVsID0+IG1vZGVsLnByb3ZpZGVyKSxcblx0XHRcdFx0Y29waWxvdFJlcXVpcmVkOiBhZ2VudC5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKVswXS5yZXF1aXJlZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbJ2NvcGlsb3QnXSxcblx0XHRcdFx0Y29waWxvdFJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGZzLnJtU3luYyh1c2VySG9tZSwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcHVibGlzaCBhIG1vZGVsIHdoZW4gYXV0aG9yaXRhdGl2ZSBkaXNjb3ZlcnkgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSBjcmVhdGVDaGF0R1BUSG9tZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBbXSwgeyBbQWdlbnRIb3N0Q29uZmlnS2V5LkFsbG93U2lnbmVkT3V0V2hlblVzYWJsZV06IHRydWUgfSwgdXNlckhvbWUpO1xuXHRcdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRcdGNsaWVudDoge1xuXHRcdFx0XHRcdHJlcXVlc3Q6IGFzeW5jIChtZXRob2Q6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKG1ldGhvZCA9PT0gJ2FjY291bnQvcmVhZCcpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgYWNjb3VudDogeyB0eXBlOiAnY2hhdGdwdCcsIGVtYWlsOiBudWxsLCBwbGFuVHlwZTogJ3BsdXMnIH0sIHJlcXVpcmVzT3BlbmFpQXV0aDogdHJ1ZSB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtb2RlbCBkaXNjb3ZlcnkgZmFpbGVkJyk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJveHlIYW5kbGU6IHsgZGlzcG9zZSgpIHsgfSB9LFxuXHRcdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0XHR9IGFzIG5ldmVyO1xuXG5cdFx0XHRhd2FpdCBhZ2VudC5yZWZyZXNoTW9kZWxzKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50Lm1vZGVscy5nZXQoKSwgW10pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRmcy5ybVN5bmModXNlckhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRoZSBsYXN0IGtub3duLWdvb2QgbW9kZWxzIHdoZW4gYSBwZXJpb2RpYyByZWZyZXNoIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzaG91bGRGYWlsID0gZmFsc2U7XG5cdFx0Y29uc3QgbW9kZWxzID0gW3sgaWQ6ICdncHQtNS41JywgbmFtZTogJ0dQVC01LjUnLCBzdXBwb3J0ZWRfZW5kcG9pbnRzOiBbJy9yZXNwb25zZXMnXSB9XSBhcyBDQ0FNb2RlbFtdO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChzaG91bGRGYWlsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigndHJhbnNpZW50IGZhaWx1cmUnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtb2RlbHM7XG5cdFx0fSk7XG5cdFx0YWdlbnRbJ19pc1Nka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQnXSA9IGFzeW5jICgpID0+IGZhbHNlO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBhZ2VudC5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKVswXS5yZXNvdXJjZTtcblx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUocmVzb3VyY2UsICd0b2tlbicpO1xuXHRcdGF3YWl0IGFnZW50LnJlZnJlc2hNb2RlbHMoKTtcblx0XHRzaG91bGRGYWlsID0gdHJ1ZTtcblx0XHRhd2FpdCBhZ2VudC5yZWZyZXNoTW9kZWxzKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50Lm1vZGVscy5nZXQoKS5tYXAobW9kZWwgPT4gbW9kZWwuaWQpLCBbdG9Db2RleE1vZGVsU2VsZWN0aW9uSWQoJ3ZzY29kZS1wcm94eScsICdncHQtNS41JyldKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgcmVhc29uaW5nIGVmZm9ydHMgYWR2ZXJ0aXNlZCBieSBDb3BpbG90IG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbDogQ0NBTW9kZWwgPSB7XG5cdFx0XHRiaWxsaW5nOiB7IGlzX3ByZW1pdW06IHRydWUsIG11bHRpcGxpZXI6IDEsIHJlc3RyaWN0ZWRfdG86IFtdIH0sXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0ZmFtaWx5OiAnZ3B0LTUuNicsXG5cdFx0XHRcdGxpbWl0czogeyBtYXhfY29udGV4dF93aW5kb3dfdG9rZW5zOiAyNzJfMDAwLCBtYXhfb3V0cHV0X3Rva2VuczogMzJfMDAwLCBtYXhfcHJvbXB0X3Rva2VuczogMjQwXzAwMCB9LFxuXHRcdFx0XHRvYmplY3Q6ICdtb2RlbF9jYXBhYmlsaXRpZXMnLFxuXHRcdFx0XHRzdXBwb3J0czogeyBwYXJhbGxlbF90b29sX2NhbGxzOiB0cnVlLCBzdHJlYW1pbmc6IHRydWUsIHRvb2xfY2FsbHM6IHRydWUsIHZpc2lvbjogdHJ1ZSB9LFxuXHRcdFx0XHR0b2tlbml6ZXI6ICdvMjAwa19iYXNlJyxcblx0XHRcdFx0dHlwZTogJ2NoYXQnLFxuXHRcdFx0fSxcblx0XHRcdGlkOiAnZ3B0LTUuNi1zb2wnLFxuXHRcdFx0aXNfY2hhdF9kZWZhdWx0OiB0cnVlLFxuXHRcdFx0aXNfY2hhdF9mYWxsYmFjazogZmFsc2UsXG5cdFx0XHRtb2RlbF9waWNrZXJfY2F0ZWdvcnk6ICdhZHZhbmNlZCcsXG5cdFx0XHRtb2RlbF9waWNrZXJfZW5hYmxlZDogdHJ1ZSxcblx0XHRcdG5hbWU6ICdHUFQtNS42LVNvbCcsXG5cdFx0XHRvYmplY3Q6ICdtb2RlbCcsXG5cdFx0XHRwb2xpY3k6IHsgc3RhdGU6ICdlbmFibGVkJywgdGVybXM6ICcnIH0sXG5cdFx0XHRwcmV2aWV3OiBmYWxzZSxcblx0XHRcdHN1cHBvcnRlZF9lbmRwb2ludHM6IFsnL3Jlc3BvbnNlcyddLFxuXHRcdFx0dmVuZG9yOiAnT3BlbkFJJyxcblx0XHRcdHZlcnNpb246ICdncHQtNS42LXNvbCcsXG5cdFx0fTtcblx0XHQobW9kZWwuY2FwYWJpbGl0aWVzLnN1cHBvcnRzIGFzIHsgcmVhc29uaW5nX2VmZm9ydD86IHN0cmluZ1tdIH0pLnJlYXNvbmluZ19lZmZvcnQgPSBbJ25vbmUnLCAnbG93JywgJ21lZGl1bScsICdoaWdoJywgJ3hoaWdoJywgJ21heCddO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IFttb2RlbF0pO1xuXG5cdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKGFnZW50LmdldFByb3RlY3RlZFJlc291cmNlcygpWzBdLnJlc291cmNlLCAndG9rZW4nKTtcblx0XHRhd2FpdCBhZ2VudC5yZWZyZXNoTW9kZWxzKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50Lm1vZGVscy5nZXQoKS5tYXAobW9kZWwgPT4gKHtcblx0XHRcdGlkOiBtb2RlbC5pZCxcblx0XHRcdHRoaW5raW5nTGV2ZWw6IG1vZGVsLmNvbmZpZ1NjaGVtYT8ucHJvcGVydGllcy50aGlua2luZ0xldmVsICYmIHtcblx0XHRcdFx0ZW51bTogbW9kZWwuY29uZmlnU2NoZW1hLnByb3BlcnRpZXMudGhpbmtpbmdMZXZlbC5lbnVtLFxuXHRcdFx0XHRkZWZhdWx0OiBtb2RlbC5jb25maWdTY2hlbWEucHJvcGVydGllcy50aGlua2luZ0xldmVsLmRlZmF1bHQsXG5cdFx0XHR9LFxuXHRcdH0pKSwgW3tcblx0XHRcdGlkOiB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZCgndnNjb2RlLXByb3h5JywgJ2dwdC01LjYtc29sJyksXG5cdFx0XHR0aGlua2luZ0xldmVsOiB7XG5cdFx0XHRcdGVudW06IFsnbm9uZScsICdsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnLCAneGhpZ2gnLCAnbWF4J10sXG5cdFx0XHRcdGRlZmF1bHQ6ICdtZWRpdW0nLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIHRoZSB0aGlua2luZyBsZXZlbCB3aGVuIGEgQ29waWxvdCBtb2RlbCBhZHZlcnRpc2VzIG5vIHJlYXNvbmluZyBlZmZvcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0geyBpZDogJ2dwdC01LjUnLCBuYW1lOiAnR1BULTUuNScsIHN1cHBvcnRlZF9lbmRwb2ludHM6IFsnL3Jlc3BvbnNlcyddIH0gYXMgQ0NBTW9kZWw7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgYXN5bmMgKCkgPT4gW21vZGVsXSk7XG5cblx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoYWdlbnQuZ2V0UHJvdGVjdGVkUmVzb3VyY2VzKClbMF0ucmVzb3VyY2UsICd0b2tlbicpO1xuXHRcdGF3YWl0IGFnZW50LnJlZnJlc2hNb2RlbHMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5tb2RlbHMuZ2V0KClbMF0uY29uZmlnU2NoZW1hLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBsaWVzIGF1dGhlbnRpY2F0aW9uIHJlY2VpdmVkIHdoaWxlIHRoZSBjb25uZWN0aW9uIGlzIHN0YXJ0aW5nIHRvIHRoZSBwcm94eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBbXSk7XG5cdFx0YWdlbnRbJ19xdWV1ZU1vZGVsUmVmcmVzaCddID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFnZW50WydfcmVmcmVzaFByb3ZpZGVyQ29uZmlndXJhdGlvbiddID0gYXN5bmMgKCkgPT4geyB9O1xuXG5cdFx0Y29uc3QgYXBwbGllZFRva2Vuczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByZWFkeSA9IHtcblx0XHRcdGNsaWVudDogeyBkaXNwb3NlKCkgeyB9IH0sXG5cdFx0XHRwcm94eUhhbmRsZToge1xuXHRcdFx0XHRzZXRUb2tlbjogKHRva2VuOiBzdHJpbmcpID0+IGFwcGxpZWRUb2tlbnMucHVzaCh0b2tlbiksXG5cdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHR9LFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH07XG5cdFx0bGV0IHJlc29sdmVTdGFydCE6ICh2YWx1ZTogdHlwZW9mIHJlYWR5KSA9PiB2b2lkO1xuXHRcdGFnZW50Wydfc3RhcnRDb25uZWN0aW9uJ10gPSAoKSA9PiBuZXcgUHJvbWlzZTx0eXBlb2YgcmVhZHk+KHJlc29sdmUgPT4gcmVzb2x2ZVN0YXJ0ID0gcmVzb2x2ZSkgYXMgbmV2ZXI7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYWdlbnRbJ19lbnN1cmVDb25uZWN0aW9uJ10oKTtcblx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoYWdlbnQuZ2V0UHJvdGVjdGVkUmVzb3VyY2VzKClbMF0ucmVzb3VyY2UsICd0b2tlbi1hcnJpdmluZy1kdXJpbmctc3RhcnQnKTtcblx0XHRyZXNvbHZlU3RhcnQocmVhZHkpO1xuXHRcdGF3YWl0IGNvbm5lY3Rpb247XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWRUb2tlbnMsIFsndG9rZW4tYXJyaXZpbmctZHVyaW5nLXN0YXJ0J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXJmYWNlcyBjdXJyZW50IENoYXRHUFQgc3Vic2NyaXB0aW9uIG1vZGVscyB1bmRlciB0aGUgQ2hhdEdQVCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBbXSk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50OiB7XG5cdFx0XHRcdHJlcXVlc3Q6IGFzeW5jIChtZXRob2Q6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGlmIChtZXRob2QgPT09ICdhY2NvdW50L3JlYWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBhY2NvdW50OiB7IHR5cGU6ICdjaGF0Z3B0JywgZW1haWw6ICdwZXJzb25AZXhhbXBsZS5jb20nLCBwbGFuVHlwZTogJ3BsdXMnIH0sIHJlcXVpcmVzT3BlbmFpQXV0aDogdHJ1ZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWV0aG9kID09PSAnY29uZmlnL3JlYWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBjb25maWc6IHsgbW9kZWxfcHJvdmlkZXI6ICdvcGVuYWknIH0gfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1ldGhvZCA9PT0gJ21vZGVsL2xpc3QnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kZWxMaXN0UmVzcG9uc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCByZXF1ZXN0OiAke21ldGhvZH1gKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRwcm94eUhhbmRsZTogeyBkaXNwb3NlKCkgeyB9IH0sXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblxuXHRcdGF3YWl0IGFnZW50LnJlZnJlc2hNb2RlbHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQubW9kZWxzLmdldCgpLm1hcChtb2RlbCA9PiAoe1xuXHRcdFx0cHJvdmlkZXI6IG1vZGVsLnByb3ZpZGVyLFxuXHRcdFx0aWQ6IG1vZGVsLmlkLFxuXHRcdFx0bmFtZTogbW9kZWwubmFtZSxcblx0XHRcdHRoaW5raW5nTGV2ZWw6IG1vZGVsLmNvbmZpZ1NjaGVtYT8ucHJvcGVydGllcy50aGlua2luZ0xldmVsICYmIHtcblx0XHRcdFx0ZW51bTogbW9kZWwuY29uZmlnU2NoZW1hLnByb3BlcnRpZXMudGhpbmtpbmdMZXZlbC5lbnVtLFxuXHRcdFx0XHRkZWZhdWx0OiBtb2RlbC5jb25maWdTY2hlbWEucHJvcGVydGllcy50aGlua2luZ0xldmVsLmRlZmF1bHQsXG5cdFx0XHR9LFxuXHRcdFx0bWV0YTogbW9kZWwuX21ldGEsXG5cdFx0fSkpLCBbe1xuXHRcdFx0cHJvdmlkZXI6ICdjaGF0Z3B0Jyxcblx0XHRcdGlkOiB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZCgnb3BlbmFpJywgJ2dwdC01LjYtc29sJyksXG5cdFx0XHRuYW1lOiAnR1BULTUuNi1Tb2wnLFxuXHRcdFx0dGhpbmtpbmdMZXZlbDoge1xuXHRcdFx0XHRlbnVtOiBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCcsICd4aGlnaCcsICdtYXgnLCAndWx0cmEnXSxcblx0XHRcdFx0ZGVmYXVsdDogJ2xvdycsXG5cdFx0XHR9LFxuXHRcdFx0bWV0YTogeyBtb2RlbFNvdXJjZUlkOiAnY2hhdGdwdFN1YnNjcmlwdGlvbicgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIHRoZSB0aGlua2luZyBsZXZlbCB3aGVuIGEgQ29kZXggbW9kZWwgYWR2ZXJ0aXNlcyBubyByZWFzb25pbmcgZWZmb3J0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBbXSk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50OiB7XG5cdFx0XHRcdHJlcXVlc3Q6IGFzeW5jIChtZXRob2Q6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGlmIChtZXRob2QgPT09ICdhY2NvdW50L3JlYWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBhY2NvdW50OiB7IHR5cGU6ICdjaGF0Z3B0JywgZW1haWw6ICdwZXJzb25AZXhhbXBsZS5jb20nLCBwbGFuVHlwZTogJ3BsdXMnIH0sIHJlcXVpcmVzT3BlbmFpQXV0aDogdHJ1ZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWV0aG9kID09PSAnY29uZmlnL3JlYWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBjb25maWc6IHsgbW9kZWxfcHJvdmlkZXI6ICdvcGVuYWknIH0gfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1ldGhvZCA9PT0gJ21vZGVsL2xpc3QnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHQuLi5tb2RlbExpc3RSZXNwb25zZSxcblx0XHRcdFx0XHRcdFx0ZGF0YTogbW9kZWxMaXN0UmVzcG9uc2UuZGF0YS5tYXAobW9kZWwgPT4gKHsgLi4ubW9kZWwsIHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM6IFtdIH0pKSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCByZXF1ZXN0OiAke21ldGhvZH1gKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRwcm94eUhhbmRsZTogeyBkaXNwb3NlKCkgeyB9IH0sXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblxuXHRcdGF3YWl0IGFnZW50LnJlZnJlc2hNb2RlbHMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5tb2RlbHMuZ2V0KClbMF0uY29uZmlnU2NoZW1hLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVzIENoYXRHUFQgbW9kZWxzIHdoZW4gYWNjb3VudC9yZWFkIHJlcG9ydHMgc2lnbmVkIG91dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBbXSk7XG5cdFx0YWdlbnRbJ19jb2RleE1vZGVscyddID0gW3sgcHJvdmlkZXI6ICdjaGF0Z3B0JywgaWQ6IHRvQ29kZXhNb2RlbFNlbGVjdGlvbklkKCdvcGVuYWknLCAnZ3B0LTUuNi1zb2wnKSwgbmFtZTogJ0dQVC01LjYtU29sJywgc3VwcG9ydHNWaXNpb246IHRydWUgfV07XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50OiB7XG5cdFx0XHRcdHJlcXVlc3Q6IGFzeW5jIChtZXRob2Q6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXRob2QsICdhY2NvdW50L3JlYWQnKTtcblx0XHRcdFx0XHRyZXR1cm4geyBhY2NvdW50OiBudWxsLCByZXF1aXJlc09wZW5haUF1dGg6IHRydWUgfTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRwcm94eUhhbmRsZTogeyBkaXNwb3NlKCkgeyB9IH0sXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblxuXHRcdGF3YWl0IGFnZW50WydfcmVmcmVzaENvZGV4TW9kZWxzJ10oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRbJ19jb2RleE1vZGVscyddLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGEgY29uZmlndXJlZCBPbGxhbWEgbW9kZWwgYXZhaWxhYmxlIHdoaWxlIENoYXRHUFQgaXMgc2lnbmVkIG91dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBbXSwge1xuXHRcdFx0W0NPREVYX01PREVMU19ST09UX0NPTkZJR19LRVldOiB7XG5cdFx0XHRcdG1vZGVsOiAncXdlbjMuNTo5Yi1xNF9rX20nLFxuXHRcdFx0XHRtb2RlbFByb3ZpZGVyOiAnb2xsYW1hJyxcblx0XHRcdFx0cHJvdmlkZXJzOiBbe1xuXHRcdFx0XHRcdGlkOiAnb2xsYW1hJyxcblx0XHRcdFx0XHRjYXRhbG9nSWQ6ICdvbGxhbWEnLFxuXHRcdFx0XHRcdG5hbWU6ICdPbGxhbWEnLFxuXHRcdFx0XHRcdGJhc2VVcmw6ICdodHRwOi8vbG9jYWxob3N0OjExNDM0L3YxJyxcblx0XHRcdFx0XHRlbnZLZXk6ICcnLFxuXHRcdFx0XHRcdGtpbmQ6ICdvbGxhbWEnLFxuXHRcdFx0XHRcdGF1dGhNb2RlOiAnbm9uZScsXG5cdFx0XHRcdFx0d2lyZUFwaTogJ3Jlc3BvbnNlcycsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRtb2RlbHM6IFt7IG5hbWU6ICdxd2VuMy41OjliLXE0X2tfbScsIGVuYWJsZWQ6IHRydWUgfV0sXG5cdFx0XHRcdFx0c2VsZWN0ZWRNb2RlbDogJ3F3ZW4zLjU6OWItcTRfa19tJyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFnZW50WydfZGlzY292ZXJMb2NhbE1vZGVscyddID0gYXN5bmMgKCkgPT4gW3sgaWQ6ICdxd2VuMy41OjliLXE0X2tfbScsIG5hbWU6ICdRd2VuIDMuNSA5QicgfV07XG5cdFx0bGV0IGFwcFNlcnZlclJlcXVlc3RzID0gMDtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQ6IHsgcmVxdWVzdDogYXN5bmMgKCkgPT4geyBhcHBTZXJ2ZXJSZXF1ZXN0cysrOyB0aHJvdyBuZXcgRXJyb3IoJ2xvY2FsIHJlZnJlc2ggbXVzdCBub3QgZGVwZW5kIG9uIGFjY291bnQvcmVhZCcpOyB9IH0sXG5cdFx0XHRwcm94eUhhbmRsZTogeyBkaXNwb3NlKCkgeyB9IH0sXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblxuXHRcdGF3YWl0IGFnZW50WydfcmVmcmVzaENvZGV4TW9kZWxzJ10oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXBwU2VydmVyUmVxdWVzdHMsXG5cdFx0XHRtb2RlbHM6IGFnZW50WydfY29kZXhNb2RlbHMnXS5tYXAobW9kZWwgPT4gKHsgcHJvdmlkZXI6IG1vZGVsLnByb3ZpZGVyLCBpZDogbW9kZWwuaWQsIG5hbWU6IG1vZGVsLm5hbWUgfSkpLFxuXHRcdH0sIHtcblx0XHRcdGFwcFNlcnZlclJlcXVlc3RzOiAwLFxuXHRcdFx0bW9kZWxzOiBbe1xuXHRcdFx0XHRwcm92aWRlcjogJ29sbGFtYScsXG5cdFx0XHRcdGlkOiB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZCgnb2xsYW1hJywgJ3F3ZW4zLjU6OWItcTRfa19tJyksXG5cdFx0XHRcdG5hbWU6ICdRd2VuIDMuNSA5QicsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgd3JpdGUgbm9uLW92ZXJyaWRhYmxlIGJ1aWx0LWluIHByb3ZpZGVycyBhcyBjdXN0b20gbW9kZWxfcHJvdmlkZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3BlbmFpOiBpc0NvZGV4Tm9uT3ZlcnJpZGFibGVCdWlsdEluUHJvdmlkZXIoJ29wZW5haScpLFxuXHRcdFx0b2xsYW1hOiBpc0NvZGV4Tm9uT3ZlcnJpZGFibGVCdWlsdEluUHJvdmlkZXIoJ09MTEFNQScpLFxuXHRcdFx0bG1zdHVkaW86IGlzQ29kZXhOb25PdmVycmlkYWJsZUJ1aWx0SW5Qcm92aWRlcignbG1zdHVkaW8nKSxcblx0XHRcdGN1c3RvbTogaXNDb2RleE5vbk92ZXJyaWRhYmxlQnVpbHRJblByb3ZpZGVyKCdvcGVuYWktY3VzdG9tJyksXG5cdFx0fSwge1xuXHRcdFx0b3BlbmFpOiB0cnVlLFxuXHRcdFx0b2xsYW1hOiB0cnVlLFxuXHRcdFx0bG1zdHVkaW86IHRydWUsXG5cdFx0XHRjdXN0b206IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jcyBhbiBPbGxhbWEgc2VsZWN0aW9uIHdpdGhvdXQgd3JpdGluZyBhIHJlc2VydmVkIG1vZGVsX3Byb3ZpZGVycy5vbGxhbWEgdGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSBub3JtYWxpemVDb2RleE1vZGVsc0NvbmZpZyh7IG1vZGVsOiAnJywgbW9kZWxQcm92aWRlcjogJycsIHByb3ZpZGVyczogW10gfSk7XG5cdFx0Y29uc3QgbmV4dCA9IG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKHtcblx0XHRcdFx0bW9kZWw6ICdxd2VuMy41OjliLXE0X2tfbScsXG5cdFx0XHRcdG1vZGVsUHJvdmlkZXI6ICdvbGxhbWEnLFxuXHRcdFx0XHRwcm92aWRlcnM6IFt7XG5cdFx0XHRcdFx0aWQ6ICdvbGxhbWEnLFxuXHRcdFx0XHRcdGNhdGFsb2dJZDogJ29sbGFtYScsXG5cdFx0XHRcdFx0bmFtZTogJ09sbGFtYScsXG5cdFx0XHRcdFx0YmFzZVVybDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MTE0MzQvdjEnLFxuXHRcdFx0XHRcdGVudktleTogJycsXG5cdFx0XHRcdFx0a2luZDogJ29sbGFtYScsXG5cdFx0XHRcdFx0YXV0aE1vZGU6ICdub25lJyxcblx0XHRcdFx0XHR3aXJlQXBpOiAncmVzcG9uc2VzJyxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdG1vZGVsczogW3sgbmFtZTogJ3F3ZW4zLjU6OWItcTRfa19tJywgZW5hYmxlZDogdHJ1ZSB9XSxcblx0XHRcdFx0XHRzZWxlY3RlZE1vZGVsOiAncXdlbjMuNTo5Yi1xNF9rX20nLFxuXHRcdFx0XHR9XSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29kZXhNYW5hZ2VkTW9kZWxQcm92aWRlckVkaXRzKHByZXZpb3VzLCBuZXh0KSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBjb25maWd1cmVkIG5vbi1odW1hbiBwcm92aWRlcnMgb3V0IG9mIHRoZSBDaGF0R1BUIGdyb3VwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IFtdKTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQ6IHtcblx0XHRcdFx0cmVxdWVzdDogYXN5bmMgKG1ldGhvZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG1ldGhvZCA9PT0gJ2FjY291bnQvcmVhZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGFjY291bnQ6IHsgdHlwZTogJ2FwaUtleScgfSwgcmVxdWlyZXNPcGVuYWlBdXRoOiB0cnVlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtZXRob2QgPT09ICdjb25maWcvcmVhZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGNvbmZpZzogeyBtb2RlbF9wcm92aWRlcjogJ2N1c3RvbS1wcm92aWRlcicgfSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWV0aG9kID09PSAnbW9kZWwvbGlzdCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiBtb2RlbExpc3RSZXNwb25zZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHJlcXVlc3Q6ICR7bWV0aG9kfWApO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHByb3h5SGFuZGxlOiB7IGRpc3Bvc2UoKSB7IH0gfSxcblx0XHRcdGNoaWxkOiB7IGtpbGw6ICgpID0+IHRydWUgfSxcblx0XHR9IGFzIG5ldmVyO1xuXG5cdFx0YXdhaXQgYWdlbnRbJ19yZWZyZXNoQ29kZXhNb2RlbHMnXSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudFsnX2NvZGV4TW9kZWxzJ10ubWFwKG1vZGVsID0+ICh7IHByb3ZpZGVyOiBtb2RlbC5wcm92aWRlciwgaWQ6IG1vZGVsLmlkLCBtZXRhOiBtb2RlbC5fbWV0YSB9KSksIFt7XG5cdFx0XHRwcm92aWRlcjogJ2N1c3RvbS1wcm92aWRlcicsXG5cdFx0XHRpZDogdG9Db2RleE1vZGVsU2VsZWN0aW9uSWQoJ2N1c3RvbS1wcm92aWRlcicsICdncHQtNS42LXNvbCcpLFxuXHRcdFx0bWV0YTogdW5kZWZpbmVkLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgdHJlYXQgYSBjdXN0b20gcHJvdmlkZXIgbmFtZWQgY2hhdGdwdCBhcyBhIENoYXRHUFQgc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IFtdKTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQ6IHtcblx0XHRcdFx0cmVxdWVzdDogYXN5bmMgKG1ldGhvZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG1ldGhvZCA9PT0gJ2FjY291bnQvcmVhZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGFjY291bnQ6IHsgdHlwZTogJ2FwaUtleScgfSwgcmVxdWlyZXNPcGVuYWlBdXRoOiBmYWxzZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWV0aG9kID09PSAnY29uZmlnL3JlYWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBjb25maWc6IHsgbW9kZWxfcHJvdmlkZXI6ICdjaGF0Z3B0JyB9IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtZXRob2QgPT09ICdtb2RlbC9saXN0Jykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1vZGVsTGlzdFJlc3BvbnNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgcmVxdWVzdDogJHttZXRob2R9YCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0cHJveHlIYW5kbGU6IHsgZGlzcG9zZSgpIHsgfSB9LFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0gYXMgbmV2ZXI7XG5cblx0XHRhd2FpdCBhZ2VudFsnX3JlZnJlc2hDb2RleE1vZGVscyddKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50WydfY29kZXhNb2RlbHMnXS5tYXAobW9kZWwgPT4gKHsgcHJvdmlkZXI6IG1vZGVsLnByb3ZpZGVyLCBtZXRhOiBtb2RlbC5fbWV0YSB9KSksIFt7XG5cdFx0XHRwcm92aWRlcjogJ2NoYXRncHQnLFxuXHRcdFx0bWV0YTogdW5kZWZpbmVkLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVsYWJlbCBhIGN1c3RvbSBwcm92aWRlciB3aGVuIENoYXRHUFQgYXV0aGVudGljYXRpb24gaXMgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IFtdKTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQ6IHtcblx0XHRcdFx0cmVxdWVzdDogYXN5bmMgKG1ldGhvZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG1ldGhvZCA9PT0gJ2FjY291bnQvcmVhZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGFjY291bnQ6IHsgdHlwZTogJ2NoYXRncHQnLCBlbWFpbDogJ3BlcnNvbkBleGFtcGxlLmNvbScsIHBsYW5UeXBlOiAncGx1cycgfSwgcmVxdWlyZXNPcGVuYWlBdXRoOiBmYWxzZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWV0aG9kID09PSAnY29uZmlnL3JlYWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBjb25maWc6IHsgbW9kZWxfcHJvdmlkZXI6ICdjdXN0b20tcHJvdmlkZXInIH0gfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1ldGhvZCA9PT0gJ21vZGVsL2xpc3QnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kZWxMaXN0UmVzcG9uc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCByZXF1ZXN0OiAke21ldGhvZH1gKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRwcm94eUhhbmRsZTogeyBkaXNwb3NlKCkgeyB9IH0sXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblxuXHRcdGF3YWl0IGFnZW50WydfcmVmcmVzaENvZGV4TW9kZWxzJ10oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRbJ19jb2RleE1vZGVscyddLm1hcChtb2RlbCA9PiAoeyBwcm92aWRlcjogbW9kZWwucHJvdmlkZXIsIG1ldGE6IG1vZGVsLl9tZXRhIH0pKSwgW3tcblx0XHRcdHByb3ZpZGVyOiAnY3VzdG9tLXByb3ZpZGVyJyxcblx0XHRcdG1ldGE6IHVuZGVmaW5lZCxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpZ25zIG91dCB0aHJvdWdoIGFwcC1zZXJ2ZXIgYW5kIHJlZnJlc2hlcyBhY2NvdW50IHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoZGlzcG9zYWJsZXMsIGFzeW5jICgpID0+IFtdKTtcblx0XHRjb25zdCByZXF1ZXN0czogc3RyaW5nW10gPSBbXTtcblx0XHRhZ2VudFsnX2Nvbm5lY3Rpb24nXSA9IHtcblx0XHRcdGtpbmQ6ICdyZWFkeScsXG5cdFx0XHRjbGllbnQ6IHtcblx0XHRcdFx0cmVxdWVzdDogYXN5bmMgKG1ldGhvZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0cmVxdWVzdHMucHVzaChtZXRob2QpO1xuXHRcdFx0XHRcdGlmIChtZXRob2QgPT09ICdhY2NvdW50L2xvZ291dCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1ldGhvZCA9PT0gJ2FjY291bnQvcmVhZCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGFjY291bnQ6IG51bGwsIHJlcXVpcmVzT3BlbmFpQXV0aDogdHJ1ZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgcmVxdWVzdDogJHttZXRob2R9YCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0cHJveHlIYW5kbGU6IHsgZGlzcG9zZSgpIHsgfSB9LFxuXHRcdFx0Y2hpbGQ6IHsga2lsbDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0gYXMgbmV2ZXI7XG5cdFx0YWdlbnRbJ19xdWV1ZU1vZGVsUmVmcmVzaCddID0gYXN5bmMgKCkgPT4geyB9O1xuXG5cdFx0YXdhaXQgYWdlbnRbJ19zaWduT3V0T2ZDaGF0R1BUJ10oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdHMsXG5cdFx0XHRhY2NvdW50U3RhdHVzOiBhZ2VudFsnX29wZW5BSUFjY291bnRTdGF0ZSddLnN0YXR1cyxcblx0XHR9LCB7XG5cdFx0XHRyZXF1ZXN0czogWydhY2NvdW50L2xvZ291dCcsICdhY2NvdW50L3JlYWQnXSxcblx0XHRcdGFjY291bnRTdGF0dXM6ICdzaWduZWRPdXQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgQ29waWxvdCBwcm94eSBjcmVkZW50aWFscyBhbmQgbW9kZWxzIHdoZW4gYXV0aGVudGljYXRpb24gaXMgcmVtb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KGRpc3Bvc2FibGVzLCBhc3luYyAoKSA9PiBbXSk7XG5cdFx0Y29uc3QgYXBwbGllZFRva2Vuczogc3RyaW5nW10gPSBbXTtcblx0XHRhZ2VudFsnX2dpdGh1YlRva2VuJ10gPSAnc3RhbGUtdG9rZW4nO1xuXHRcdGFnZW50WydfY29waWxvdE1vZGVscyddID0gW3tcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRpZDogdG9Db2RleE1vZGVsU2VsZWN0aW9uSWQoJ3ZzY29kZS1wcm94eScsICdncHQtNS4zLWNvZGV4JyksXG5cdFx0XHRuYW1lOiAnR1BULTUuMy1Db2RleCcsXG5cdFx0XHRzdXBwb3J0c1Zpc2lvbjogZmFsc2UsXG5cdFx0fV07XG5cdFx0YWdlbnRbJ19tb2RlbHMnXS5zZXQoYWdlbnRbJ19jb3BpbG90TW9kZWxzJ10sIHVuZGVmaW5lZCk7XG5cdFx0YWdlbnRbJ19jb25uZWN0aW9uJ10gPSB7XG5cdFx0XHRraW5kOiAncmVhZHknLFxuXHRcdFx0Y2xpZW50OiB7XG5cdFx0XHRcdHJlcXVlc3Q6IGFzeW5jIChtZXRob2Q6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGlmIChtZXRob2QgPT09ICdhY2NvdW50L3JlYWQnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBhY2NvdW50OiBudWxsLCByZXF1aXJlc09wZW5haUF1dGg6IHRydWUgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHJlcXVlc3Q6ICR7bWV0aG9kfWApO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHByb3h5SGFuZGxlOiB7XG5cdFx0XHRcdHNldFRva2VuOiAodG9rZW46IHN0cmluZykgPT4gYXBwbGllZFRva2Vucy5wdXNoKHRva2VuKSxcblx0XHRcdFx0ZGlzcG9zZSgpIHsgfSxcblx0XHRcdH0sXG5cdFx0XHRjaGlsZDogeyBraWxsOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSBhcyBuZXZlcjtcblxuXHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZShhZ2VudC5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKVswXS5yZXNvdXJjZSwgJycpO1xuXHRcdGF3YWl0IGFnZW50LnJlZnJlc2hNb2RlbHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2l0aHViVG9rZW46IGFnZW50WydfZ2l0aHViVG9rZW4nXSxcblx0XHRcdGFwcGxpZWRUb2tlbnMsXG5cdFx0XHRtb2RlbHM6IGFnZW50Lm1vZGVscy5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRnaXRodWJUb2tlbjogdW5kZWZpbmVkLFxuXHRcdFx0YXBwbGllZFRva2VuczogWycnXSxcblx0XHRcdG1vZGVsczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkdmVydGlzZXMgbXVsdGlwbGUgd29ya2luZyBkaXJlY3RvcmllcyBvbmx5IHdoaWxlIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVBZ2VudChkaXNwb3NhYmxlcywgYXN5bmMgKCkgPT4gW10pO1xuXHRcdGNvbnN0IGRpc2FibGVkQnlEZWZhdWx0ID0gYWdlbnQuZ2V0RGVzY3JpcHRvcigpLmNhcGFiaWxpdGllcz8ubXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0YWdlbnRbJ19jb25maWd1cmF0aW9uU2VydmljZSddLnVwZGF0ZVJvb3RDb25maWcoeyBbQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9KTtcblx0XHRjb25zdCB3aGVuRW5hYmxlZCA9IGFnZW50LmdldERlc2NyaXB0b3IoKS5jYXBhYmlsaXRpZXM/Lm11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdGFnZW50WydfY29uZmlndXJhdGlvblNlcnZpY2UnXS51cGRhdGVSb290Q29uZmlnKHsgW0FnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGFmdGVyRGlzYWJsaW5nID0gYWdlbnQuZ2V0RGVzY3JpcHRvcigpLmNhcGFiaWxpdGllcz8ubXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXM7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZGlzYWJsZWRCeURlZmF1bHQsIHdoZW5FbmFibGVkLCBhZnRlckRpc2FibGluZyB9LCB7XG5cdFx0XHRkaXNhYmxlZEJ5RGVmYXVsdDogdW5kZWZpbmVkLFxuXHRcdFx0d2hlbkVuYWJsZWQ6IHsgaW1tdXRhYmxlUHJpbWFyeTogdHJ1ZSB9LFxuXHRcdFx0YWZ0ZXJEaXNhYmxpbmc6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVk7QUFFckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywyQkFBMkIsa0NBQWtDO0FBQ3RFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCLCtCQUErQjtBQUNyRSxTQUFTLFlBQVksZ0NBQWdDLHNDQUFzQywrQkFBK0I7QUFDMUgsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEIsa0NBQWtDO0FBRXpFLFNBQVMsWUFBWSxhQUEyQyxRQUFtQyxhQUFzQyxDQUFDLEdBQUcsV0FBVyxRQUFvQjtBQUMzSyxRQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUMxRCxRQUFNLGFBQWEsSUFBSSxlQUFlO0FBQ3RDLFFBQU0sZUFBZSxZQUFZLElBQUksSUFBSSxzQkFBc0IsVUFBVSxDQUFDO0FBQzFFLFFBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLDBCQUEwQixjQUFjLFVBQVUsQ0FBQztBQUNwRyx1QkFBcUIsaUJBQWlCLFVBQVU7QUFDaEQsdUJBQXFCLEtBQUsscUJBQXFCLEVBQUUsZUFBZSxPQUFVLENBQUM7QUFDM0UsdUJBQXFCLEtBQUssb0JBQW9CLEVBQUUsZUFBZSxRQUFXLE9BQU8sQ0FBQztBQUNsRix1QkFBcUIsS0FBSyxvQkFBb0IsRUFBRSxlQUFlLE9BQVUsQ0FBQztBQUMxRSx1QkFBcUIsS0FBSyw0QkFBNEIsb0JBQW9CO0FBQzFFLHVCQUFxQixLQUFLLGlDQUFpQyxnQ0FBZ0MsQ0FBQztBQUM1Rix1QkFBcUIsS0FBSyxxQkFBcUI7QUFBQSxJQUM5QyxlQUFlO0FBQUEsSUFDZixnQ0FBZ0MsTUFBTSxJQUFJLFFBQWlCLE1BQU07QUFBQSxJQUFFLENBQUM7QUFBQSxFQUNyRSxDQUFDO0FBQ0QsdUJBQXFCLEtBQUssNkJBQTZCLHVCQUF1QjtBQUM5RSx1QkFBcUIsS0FBSyx1QkFBdUIsRUFBRSxlQUFlLFFBQVcsNkJBQTZCLFlBQVksT0FBVSxDQUFDO0FBQ2pJLHVCQUFxQixLQUFLLDhCQUE4QixFQUFFLGVBQWUsUUFBVyx5QkFBeUIsTUFBTSxLQUFLLENBQUM7QUFDekgsdUJBQXFCLEtBQUssaUJBQWlCLEVBQUUsZUFBZSxRQUFXLFNBQVMsYUFBYSxDQUFvQjtBQUNqSCx1QkFBcUIsS0FBSywyQkFBMkIsRUFBRSxVQUFVLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztBQUNyRix1QkFBcUIsS0FBSyxhQUFhLFVBQVU7QUFDakQsU0FBTyxZQUFZLElBQUkscUJBQXFCLGVBQWUsVUFBVSxDQUFDO0FBQ3ZFO0FBRUEsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QyxRQUFNLGNBQWMsd0NBQXdDO0FBQzVELFFBQU0sb0JBQW9CO0FBQUEsSUFDekIsTUFBTSxDQUFDO0FBQUEsTUFDTixJQUFJO0FBQUEsTUFDSixPQUFPO0FBQUEsTUFDUCxTQUFTO0FBQUEsTUFDVCxhQUFhO0FBQUEsTUFDYixpQkFBaUI7QUFBQSxNQUNqQixhQUFhO0FBQUEsTUFDYixhQUFhO0FBQUEsTUFDYixRQUFRO0FBQUEsTUFDUiwyQkFBMkI7QUFBQSxRQUMxQixFQUFFLGlCQUFpQixPQUFPLGFBQWEsd0NBQXdDO0FBQUEsUUFDL0UsRUFBRSxpQkFBaUIsVUFBVSxhQUFhLHdEQUF3RDtBQUFBLFFBQ2xHLEVBQUUsaUJBQWlCLFFBQVEsYUFBYSwrQ0FBK0M7QUFBQSxRQUN2RixFQUFFLGlCQUFpQixTQUFTLGFBQWEsa0RBQWtEO0FBQUEsUUFDM0YsRUFBRSxpQkFBaUIsT0FBTyxhQUFhLG1EQUFtRDtBQUFBLFFBQzFGLEVBQUUsaUJBQWlCLFNBQVMsYUFBYSxtREFBbUQ7QUFBQSxNQUM3RjtBQUFBLE1BQ0Esd0JBQXdCO0FBQUEsTUFDeEIsaUJBQWlCLENBQUMsUUFBUSxPQUFPO0FBQUEsTUFDakMscUJBQXFCO0FBQUEsTUFDckIsc0JBQXNCLENBQUM7QUFBQSxNQUN2QixjQUFjLENBQUM7QUFBQSxNQUNmLG9CQUFvQjtBQUFBLE1BQ3BCLFdBQVc7QUFBQSxJQUNaLENBQUM7QUFBQSxJQUNELFlBQVk7QUFBQSxFQUNiO0FBRUEsV0FBUyxvQkFBNEI7QUFDcEMsVUFBTSxXQUFXLEdBQUcsWUFBWSxLQUFLLEdBQUcsT0FBTyxHQUFHLDBCQUEwQixDQUFDO0FBQzdFLFVBQU0sWUFBWSxLQUFLLFVBQVUsUUFBUTtBQUN6QyxPQUFHLFVBQVUsU0FBUztBQUN0QixPQUFHLGNBQWMsS0FBSyxXQUFXLFdBQVcsR0FBRyxLQUFLLFVBQVU7QUFBQSxNQUM3RCxXQUFXO0FBQUEsTUFDWCxRQUFRLEVBQUUsY0FBYyxVQUFVLGVBQWUsVUFBVTtBQUFBLElBQzVELENBQUMsQ0FBQztBQUNGLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyx3QkFBd0IsVUFBbUIsRUFBRSxNQUFNLFdBQVcsT0FBTyxzQkFBc0IsVUFBVSxPQUFPLEdBQUc7QUFDdkgsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLFFBQ1AsU0FBUyxPQUFPLFdBQW1CO0FBQ2xDLGNBQUksV0FBVyxnQkFBZ0I7QUFDOUIsbUJBQU8sRUFBRSxTQUFTLG9CQUFvQixLQUFLO0FBQUEsVUFDNUM7QUFDQSxjQUFJLFdBQVcsZUFBZTtBQUM3QixtQkFBTyxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsU0FBUyxFQUFFO0FBQUEsVUFDL0M7QUFDQSxjQUFJLFdBQVcsY0FBYztBQUM1QixtQkFBTztBQUFBLFVBQ1I7QUFDQSxnQkFBTSxJQUFJLE1BQU0sdUJBQXVCLE1BQU0sRUFBRTtBQUFBLFFBQ2hEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsYUFBYSxFQUFFLFVBQVU7QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUM3QixPQUFPLEVBQUUsTUFBTSxNQUFNLEtBQUs7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFFQSxPQUFLLGtGQUFrRixZQUFZO0FBQ2xHLFVBQU0sV0FBVyxrQkFBa0I7QUFDbkMsUUFBSTtBQUNILFlBQU0sUUFBUSxZQUFZLGFBQWEsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLG1CQUFtQix3QkFBd0IsR0FBRyxLQUFLLEdBQUcsUUFBUTtBQUN4SCxZQUFNLGFBQWEsd0JBQXdCO0FBQzNDLFVBQUk7QUFDSixZQUFNLG9CQUFvQixJQUFJLFFBQWUsYUFBVztBQUFFLDRCQUFvQixNQUFNLFFBQVEsVUFBbUI7QUFBQSxNQUFHLENBQUM7QUFDbkgsVUFBSSx3QkFBd0I7QUFDNUIsWUFBTSxpQ0FBaUMsSUFBSSxZQUFZO0FBQ3ZELFlBQU0sbUJBQW1CLElBQUksWUFBWTtBQUN4QztBQUNBLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxJQUFJLFFBQWMsYUFBVyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ3pELGFBQU8sWUFBWSx1QkFBdUIsQ0FBQztBQUMzQyxhQUFPLGdCQUFnQixNQUFNLE9BQU8sSUFBSSxHQUFHLENBQUMsQ0FBQztBQUU3Qyx3QkFBa0I7QUFDbEIsWUFBTSxNQUFNLGNBQWM7QUFFMUIsYUFBTyxnQkFBZ0IsTUFBTSxPQUFPLElBQUksRUFBRSxJQUFJLFlBQVUsRUFBRSxVQUFVLE1BQU0sVUFBVSxJQUFJLE1BQU0sSUFBSSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxFQUFFLEdBQUcsQ0FBQztBQUFBLFFBQzNJLFVBQVU7QUFBQSxRQUNWLElBQUksd0JBQXdCLFVBQVUsYUFBYTtBQUFBLFFBQ25ELE1BQU07QUFBQSxRQUNOLE1BQU0sRUFBRSxlQUFlLHNCQUFzQjtBQUFBLE1BQzlDLENBQUMsQ0FBQztBQUFBLElBQ0gsVUFBRTtBQUNELFNBQUcsT0FBTyxVQUFVLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDckQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFVBQU0sV0FBVyxrQkFBa0I7QUFDbkMsUUFBSTtBQUNILFlBQU0sUUFBUSxZQUFZLGFBQWEsWUFBWSxDQUFDLEdBQUcsQ0FBQyxHQUFHLFFBQVE7QUFDbkUsVUFBSSx3QkFBd0I7QUFDNUIsWUFBTSxpQ0FBaUMsSUFBSSxZQUFZO0FBQ3ZELFlBQU0sbUJBQW1CLElBQUksWUFBWTtBQUN4QztBQUNBLGVBQU8sd0JBQXdCO0FBQUEsTUFDaEM7QUFFQSxZQUFNLElBQUksUUFBYyxhQUFXLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFFekQsYUFBTyxZQUFZLHVCQUF1QixDQUFDO0FBQzNDLGFBQU8sZ0JBQWdCLE1BQU0sT0FBTyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDOUMsVUFBRTtBQUNELFNBQUcsT0FBTyxVQUFVLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDckQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNGQUFzRixNQUFNO0FBQ2hHLFVBQU0sV0FBVyxrQkFBa0I7QUFDbkMsUUFBSTtBQUNILFlBQU0sa0JBQWtCLENBQUMsVUFBc0IsTUFBTSxzQkFBc0IsRUFBRSxDQUFDLEVBQUU7QUFDaEYsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixlQUFlLGdCQUFnQixZQUFZLGFBQWEsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLG1CQUFtQix3QkFBd0IsR0FBRyxLQUFLLENBQUMsQ0FBQztBQUFBLFFBQ2hJLG9CQUFvQixnQkFBZ0IsWUFBWSxhQUFhLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsd0JBQXdCLEdBQUcsS0FBSyxHQUFHLFFBQVEsQ0FBQztBQUFBLFFBQy9JLHFCQUFxQixnQkFBZ0IsWUFBWSxhQUFhLFlBQVksQ0FBQyxHQUFHLENBQUMsR0FBRyxRQUFRLENBQUM7QUFBQSxNQUM1RixHQUFHO0FBQUEsUUFDRixlQUFlO0FBQUEsUUFDZixvQkFBb0I7QUFBQSxRQUNwQixxQkFBcUI7QUFBQSxNQUN0QixDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsU0FBRyxPQUFPLFVBQVUsRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFBQSxJQUNyRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0VBQWtFLFlBQVk7QUFDbEYsVUFBTSxXQUFXLGtCQUFrQjtBQUNuQyxRQUFJO0FBQ0gsWUFBTSxRQUFRLFlBQVksYUFBYSxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsbUJBQW1CLHdCQUF3QixHQUFHLEtBQUssR0FBRyxRQUFRO0FBQ3hILGFBQU8sWUFBWSxNQUFNLHNCQUFzQixFQUFFLENBQUMsRUFBRSxVQUFVLEtBQUs7QUFFbkUsU0FBRyxPQUFPLEtBQUssVUFBVSxVQUFVLFdBQVcsQ0FBQztBQUMvQyxZQUFNLGFBQWEsSUFBSSx3QkFBd0IsSUFBSTtBQUNuRCxZQUFNLE1BQU0sY0FBYztBQUUxQixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLGlCQUFpQixNQUFNLHNCQUFzQixFQUFFLENBQUMsRUFBRTtBQUFBLFFBQ2xELFFBQVEsTUFBTSxPQUFPLElBQUk7QUFBQSxNQUMxQixHQUFHO0FBQUEsUUFDRixpQkFBaUI7QUFBQSxRQUNqQixRQUFRLENBQUM7QUFBQSxNQUNWLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxTQUFHLE9BQU8sVUFBVSxFQUFFLFdBQVcsTUFBTSxPQUFPLEtBQUssQ0FBQztBQUFBLElBQ3JEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsWUFBWTtBQUNoRyxVQUFNLFdBQVcsa0JBQWtCO0FBQ25DLFFBQUk7QUFDSCxZQUFNLFFBQVEsWUFBWSxhQUFhLFlBQVksQ0FBQyxHQUFHLENBQUMsR0FBRyxRQUFRO0FBQ25FLFlBQU0sYUFBYSx3QkFBd0I7QUFDM0MsVUFBSTtBQUNKLFlBQU0sYUFBYSxJQUFJLEVBQUUsTUFBTSxZQUFZLFNBQVMsSUFBSSxRQUFlLGFBQVc7QUFBRSw0QkFBb0IsTUFBTSxRQUFRLFVBQW1CO0FBQUEsTUFBRyxDQUFDLEVBQUU7QUFFL0ksWUFBTSx1QkFBdUIsRUFBRSxpQkFBaUIsRUFBRSxDQUFDLG1CQUFtQix3QkFBd0IsR0FBRyxLQUFLLENBQUM7QUFDdkcsWUFBTSxJQUFJLFFBQWMsYUFBVyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ3pELGFBQU8sZ0JBQWdCLE1BQU0sT0FBTyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBRTdDLHdCQUFrQjtBQUNsQixZQUFNLE1BQU0sY0FBYztBQUUxQixhQUFPLGdCQUFnQixNQUFNLE9BQU8sSUFBSSxFQUFFLElBQUksV0FBUyxNQUFNLEVBQUUsR0FBRyxDQUFDLHdCQUF3QixVQUFVLGFBQWEsQ0FBQyxDQUFDO0FBQUEsSUFDckgsVUFBRTtBQUNELFNBQUcsT0FBTyxVQUFVLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDckQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLFVBQU0sV0FBVyxrQkFBa0I7QUFDbkMsUUFBSTtBQUNILFlBQU0sZ0JBQWdCLENBQUMsRUFBRSxJQUFJLGlCQUFpQixNQUFNLGlCQUFpQixxQkFBcUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUMxRyxZQUFNLFFBQVEsWUFBWSxhQUFhLFlBQVksZUFBZSxFQUFFLENBQUMsbUJBQW1CLHdCQUF3QixHQUFHLEtBQUssR0FBRyxRQUFRO0FBQ25JLFlBQU0sY0FBYyxJQUFJO0FBQ3hCLFlBQU0sYUFBYSxJQUFJLHdCQUF3QixJQUFJO0FBRW5ELFlBQU0sTUFBTSxjQUFjO0FBRTFCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsV0FBVyxNQUFNLE9BQU8sSUFBSSxFQUFFLElBQUksV0FBUyxNQUFNLFFBQVE7QUFBQSxRQUN6RCxpQkFBaUIsTUFBTSxzQkFBc0IsRUFBRSxDQUFDLEVBQUU7QUFBQSxNQUNuRCxHQUFHO0FBQUEsUUFDRixXQUFXLENBQUMsU0FBUztBQUFBLFFBQ3JCLGlCQUFpQjtBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxTQUFHLE9BQU8sVUFBVSxFQUFFLFdBQVcsTUFBTSxPQUFPLEtBQUssQ0FBQztBQUFBLElBQ3JEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywrREFBK0QsWUFBWTtBQUMvRSxVQUFNLFdBQVcsa0JBQWtCO0FBQ25DLFFBQUk7QUFDSCxZQUFNLFFBQVEsWUFBWSxhQUFhLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsd0JBQXdCLEdBQUcsS0FBSyxHQUFHLFFBQVE7QUFDeEgsWUFBTSxhQUFhLElBQUk7QUFBQSxRQUN0QixNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsVUFDUCxTQUFTLE9BQU8sV0FBbUI7QUFDbEMsZ0JBQUksV0FBVyxnQkFBZ0I7QUFDOUIscUJBQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxXQUFXLE9BQU8sTUFBTSxVQUFVLE9BQU8sR0FBRyxvQkFBb0IsS0FBSztBQUFBLFlBQ2hHO0FBQ0Esa0JBQU0sSUFBSSxNQUFNLHdCQUF3QjtBQUFBLFVBQ3pDO0FBQUEsUUFDRDtBQUFBLFFBQ0EsYUFBYSxFQUFFLFVBQVU7QUFBQSxRQUFFLEVBQUU7QUFBQSxRQUM3QixPQUFPLEVBQUUsTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUMzQjtBQUVBLFlBQU0sTUFBTSxjQUFjO0FBQzFCLGFBQU8sZ0JBQWdCLE1BQU0sT0FBTyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDOUMsVUFBRTtBQUNELFNBQUcsT0FBTyxVQUFVLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDckQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtFQUFrRSxZQUFZO0FBQ2xGLFFBQUksYUFBYTtBQUNqQixVQUFNLFNBQVMsQ0FBQyxFQUFFLElBQUksV0FBVyxNQUFNLFdBQVcscUJBQXFCLENBQUMsWUFBWSxFQUFFLENBQUM7QUFDdkYsVUFBTSxRQUFRLFlBQVksYUFBYSxZQUFZO0FBQ2xELFVBQUksWUFBWTtBQUNmLGNBQU0sSUFBSSxNQUFNLG1CQUFtQjtBQUFBLE1BQ3BDO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUNELFVBQU0saUNBQWlDLElBQUksWUFBWTtBQUV2RCxVQUFNLFdBQVcsTUFBTSxzQkFBc0IsRUFBRSxDQUFDLEVBQUU7QUFDbEQsVUFBTSxNQUFNLGFBQWEsVUFBVSxPQUFPO0FBQzFDLFVBQU0sTUFBTSxjQUFjO0FBQzFCLGlCQUFhO0FBQ2IsVUFBTSxNQUFNLGNBQWM7QUFFMUIsV0FBTyxnQkFBZ0IsTUFBTSxPQUFPLElBQUksRUFBRSxJQUFJLFdBQVMsTUFBTSxFQUFFLEdBQUcsQ0FBQyx3QkFBd0IsZ0JBQWdCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDdkgsQ0FBQztBQUVELE9BQUssMkRBQTJELFlBQVk7QUFDM0UsVUFBTSxRQUFrQjtBQUFBLE1BQ3ZCLFNBQVMsRUFBRSxZQUFZLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxFQUFFO0FBQUEsTUFDOUQsY0FBYztBQUFBLFFBQ2IsUUFBUTtBQUFBLFFBQ1IsUUFBUSxFQUFFLDJCQUEyQixPQUFTLG1CQUFtQixNQUFRLG1CQUFtQixLQUFRO0FBQUEsUUFDcEcsUUFBUTtBQUFBLFFBQ1IsVUFBVSxFQUFFLHFCQUFxQixNQUFNLFdBQVcsTUFBTSxZQUFZLE1BQU0sUUFBUSxLQUFLO0FBQUEsUUFDdkYsV0FBVztBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLElBQUk7QUFBQSxNQUNKLGlCQUFpQjtBQUFBLE1BQ2pCLGtCQUFrQjtBQUFBLE1BQ2xCLHVCQUF1QjtBQUFBLE1BQ3ZCLHNCQUFzQjtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFFBQVEsRUFBRSxPQUFPLFdBQVcsT0FBTyxHQUFHO0FBQUEsTUFDdEMsU0FBUztBQUFBLE1BQ1QscUJBQXFCLENBQUMsWUFBWTtBQUFBLE1BQ2xDLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxJQUNWO0FBQ0EsSUFBQyxNQUFNLGFBQWEsU0FBNkMsbUJBQW1CLENBQUMsUUFBUSxPQUFPLFVBQVUsUUFBUSxTQUFTLEtBQUs7QUFDcEksVUFBTSxRQUFRLFlBQVksYUFBYSxZQUFZLENBQUMsS0FBSyxDQUFDO0FBRTFELFVBQU0sTUFBTSxhQUFhLE1BQU0sc0JBQXNCLEVBQUUsQ0FBQyxFQUFFLFVBQVUsT0FBTztBQUMzRSxVQUFNLE1BQU0sY0FBYztBQUUxQixXQUFPLGdCQUFnQixNQUFNLE9BQU8sSUFBSSxFQUFFLElBQUksQ0FBQUEsWUFBVTtBQUFBLE1BQ3ZELElBQUlBLE9BQU07QUFBQSxNQUNWLGVBQWVBLE9BQU0sY0FBYyxXQUFXLGlCQUFpQjtBQUFBLFFBQzlELE1BQU1BLE9BQU0sYUFBYSxXQUFXLGNBQWM7QUFBQSxRQUNsRCxTQUFTQSxPQUFNLGFBQWEsV0FBVyxjQUFjO0FBQUEsTUFDdEQ7QUFBQSxJQUNELEVBQUUsR0FBRyxDQUFDO0FBQUEsTUFDTCxJQUFJLHdCQUF3QixnQkFBZ0IsYUFBYTtBQUFBLE1BQ3pELGVBQWU7QUFBQSxRQUNkLE1BQU0sQ0FBQyxRQUFRLE9BQU8sVUFBVSxRQUFRLFNBQVMsS0FBSztBQUFBLFFBQ3RELFNBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLGlGQUFpRixZQUFZO0FBQ2pHLFVBQU0sUUFBUSxFQUFFLElBQUksV0FBVyxNQUFNLFdBQVcscUJBQXFCLENBQUMsWUFBWSxFQUFFO0FBQ3BGLFVBQU0sUUFBUSxZQUFZLGFBQWEsWUFBWSxDQUFDLEtBQUssQ0FBQztBQUUxRCxVQUFNLE1BQU0sYUFBYSxNQUFNLHNCQUFzQixFQUFFLENBQUMsRUFBRSxVQUFVLE9BQU87QUFDM0UsVUFBTSxNQUFNLGNBQWM7QUFFMUIsV0FBTyxZQUFZLE1BQU0sT0FBTyxJQUFJLEVBQUUsQ0FBQyxFQUFFLGNBQWMsTUFBUztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLGlGQUFpRixZQUFZO0FBQ2pHLFVBQU0sUUFBUSxZQUFZLGFBQWEsWUFBWSxDQUFDLENBQUM7QUFDckQsVUFBTSxvQkFBb0IsSUFBSSxZQUFZO0FBQUEsSUFBRTtBQUM1QyxVQUFNLCtCQUErQixJQUFJLFlBQVk7QUFBQSxJQUFFO0FBRXZELFVBQU0sZ0JBQTBCLENBQUM7QUFDakMsVUFBTSxRQUFRO0FBQUEsTUFDYixRQUFRLEVBQUUsVUFBVTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQ3hCLGFBQWE7QUFBQSxRQUNaLFVBQVUsQ0FBQyxVQUFrQixjQUFjLEtBQUssS0FBSztBQUFBLFFBQ3JELFVBQVU7QUFBQSxRQUFFO0FBQUEsTUFDYjtBQUFBLE1BQ0EsT0FBTyxFQUFFLE1BQU0sTUFBTSxLQUFLO0FBQUEsSUFDM0I7QUFDQSxRQUFJO0FBQ0osVUFBTSxrQkFBa0IsSUFBSSxNQUFNLElBQUksUUFBc0IsYUFBVyxlQUFlLE9BQU87QUFFN0YsVUFBTSxhQUFhLE1BQU0sbUJBQW1CLEVBQUU7QUFDOUMsVUFBTSxNQUFNLGFBQWEsTUFBTSxzQkFBc0IsRUFBRSxDQUFDLEVBQUUsVUFBVSw2QkFBNkI7QUFDakcsaUJBQWEsS0FBSztBQUNsQixVQUFNO0FBRU4sV0FBTyxnQkFBZ0IsZUFBZSxDQUFDLDZCQUE2QixDQUFDO0FBQUEsRUFDdEUsQ0FBQztBQUVELE9BQUssMkVBQTJFLFlBQVk7QUFDM0YsVUFBTSxRQUFRLFlBQVksYUFBYSxZQUFZLENBQUMsQ0FBQztBQUNyRCxVQUFNLGFBQWEsSUFBSTtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxRQUNQLFNBQVMsT0FBTyxXQUFtQjtBQUNsQyxjQUFJLFdBQVcsZ0JBQWdCO0FBQzlCLG1CQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sV0FBVyxPQUFPLHNCQUFzQixVQUFVLE9BQU8sR0FBRyxvQkFBb0IsS0FBSztBQUFBLFVBQ2hIO0FBQ0EsY0FBSSxXQUFXLGVBQWU7QUFDN0IsbUJBQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLFNBQVMsRUFBRTtBQUFBLFVBQy9DO0FBQ0EsY0FBSSxXQUFXLGNBQWM7QUFDNUIsbUJBQU87QUFBQSxVQUNSO0FBQ0EsZ0JBQU0sSUFBSSxNQUFNLHVCQUF1QixNQUFNLEVBQUU7QUFBQSxRQUNoRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGFBQWEsRUFBRSxVQUFVO0FBQUEsTUFBRSxFQUFFO0FBQUEsTUFDN0IsT0FBTyxFQUFFLE1BQU0sTUFBTSxLQUFLO0FBQUEsSUFDM0I7QUFFQSxVQUFNLE1BQU0sY0FBYztBQUUxQixXQUFPLGdCQUFnQixNQUFNLE9BQU8sSUFBSSxFQUFFLElBQUksWUFBVTtBQUFBLE1BQ3ZELFVBQVUsTUFBTTtBQUFBLE1BQ2hCLElBQUksTUFBTTtBQUFBLE1BQ1YsTUFBTSxNQUFNO0FBQUEsTUFDWixlQUFlLE1BQU0sY0FBYyxXQUFXLGlCQUFpQjtBQUFBLFFBQzlELE1BQU0sTUFBTSxhQUFhLFdBQVcsY0FBYztBQUFBLFFBQ2xELFNBQVMsTUFBTSxhQUFhLFdBQVcsY0FBYztBQUFBLE1BQ3REO0FBQUEsTUFDQSxNQUFNLE1BQU07QUFBQSxJQUNiLEVBQUUsR0FBRyxDQUFDO0FBQUEsTUFDTCxVQUFVO0FBQUEsTUFDVixJQUFJLHdCQUF3QixVQUFVLGFBQWE7QUFBQSxNQUNuRCxNQUFNO0FBQUEsTUFDTixlQUFlO0FBQUEsUUFDZCxNQUFNLENBQUMsT0FBTyxVQUFVLFFBQVEsU0FBUyxPQUFPLE9BQU87QUFBQSxRQUN2RCxTQUFTO0FBQUEsTUFDVjtBQUFBLE1BQ0EsTUFBTSxFQUFFLGVBQWUsc0JBQXNCO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSywrRUFBK0UsWUFBWTtBQUMvRixVQUFNLFFBQVEsWUFBWSxhQUFhLFlBQVksQ0FBQyxDQUFDO0FBQ3JELFVBQU0sYUFBYSxJQUFJO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLFFBQ1AsU0FBUyxPQUFPLFdBQW1CO0FBQ2xDLGNBQUksV0FBVyxnQkFBZ0I7QUFDOUIsbUJBQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxXQUFXLE9BQU8sc0JBQXNCLFVBQVUsT0FBTyxHQUFHLG9CQUFvQixLQUFLO0FBQUEsVUFDaEg7QUFDQSxjQUFJLFdBQVcsZUFBZTtBQUM3QixtQkFBTyxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsU0FBUyxFQUFFO0FBQUEsVUFDL0M7QUFDQSxjQUFJLFdBQVcsY0FBYztBQUM1QixtQkFBTztBQUFBLGNBQ04sR0FBRztBQUFBLGNBQ0gsTUFBTSxrQkFBa0IsS0FBSyxJQUFJLFlBQVUsRUFBRSxHQUFHLE9BQU8sMkJBQTJCLENBQUMsRUFBRSxFQUFFO0FBQUEsWUFDeEY7QUFBQSxVQUNEO0FBQ0EsZ0JBQU0sSUFBSSxNQUFNLHVCQUF1QixNQUFNLEVBQUU7QUFBQSxRQUNoRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGFBQWEsRUFBRSxVQUFVO0FBQUEsTUFBRSxFQUFFO0FBQUEsTUFDN0IsT0FBTyxFQUFFLE1BQU0sTUFBTSxLQUFLO0FBQUEsSUFDM0I7QUFFQSxVQUFNLE1BQU0sY0FBYztBQUUxQixXQUFPLFlBQVksTUFBTSxPQUFPLElBQUksRUFBRSxDQUFDLEVBQUUsY0FBYyxNQUFTO0FBQUEsRUFDakUsQ0FBQztBQUVELE9BQUssK0RBQStELFlBQVk7QUFDL0UsVUFBTSxRQUFRLFlBQVksYUFBYSxZQUFZLENBQUMsQ0FBQztBQUNyRCxVQUFNLGNBQWMsSUFBSSxDQUFDLEVBQUUsVUFBVSxXQUFXLElBQUksd0JBQXdCLFVBQVUsYUFBYSxHQUFHLE1BQU0sZUFBZSxnQkFBZ0IsS0FBSyxDQUFDO0FBQ2pKLFVBQU0sYUFBYSxJQUFJO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLFFBQ1AsU0FBUyxPQUFPLFdBQW1CO0FBQ2xDLGlCQUFPLFlBQVksUUFBUSxjQUFjO0FBQ3pDLGlCQUFPLEVBQUUsU0FBUyxNQUFNLG9CQUFvQixLQUFLO0FBQUEsUUFDbEQ7QUFBQSxNQUNEO0FBQUEsTUFDQSxhQUFhLEVBQUUsVUFBVTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQzdCLE9BQU8sRUFBRSxNQUFNLE1BQU0sS0FBSztBQUFBLElBQzNCO0FBRUEsVUFBTSxNQUFNLHFCQUFxQixFQUFFO0FBRW5DLFdBQU8sZ0JBQWdCLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ2pELENBQUM7QUFFRCxPQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLFVBQU0sUUFBUSxZQUFZLGFBQWEsWUFBWSxDQUFDLEdBQUc7QUFBQSxNQUN0RCxDQUFDLDRCQUE0QixHQUFHO0FBQUEsUUFDL0IsT0FBTztBQUFBLFFBQ1AsZUFBZTtBQUFBLFFBQ2YsV0FBVyxDQUFDO0FBQUEsVUFDWCxJQUFJO0FBQUEsVUFDSixXQUFXO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixNQUFNO0FBQUEsVUFDTixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVCxRQUFRLENBQUMsRUFBRSxNQUFNLHFCQUFxQixTQUFTLEtBQUssQ0FBQztBQUFBLFVBQ3JELGVBQWU7QUFBQSxRQUNoQixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sc0JBQXNCLElBQUksWUFBWSxDQUFDLEVBQUUsSUFBSSxxQkFBcUIsTUFBTSxjQUFjLENBQUM7QUFDN0YsUUFBSSxvQkFBb0I7QUFDeEIsVUFBTSxhQUFhLElBQUk7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixRQUFRLEVBQUUsU0FBUyxZQUFZO0FBQUU7QUFBcUIsY0FBTSxJQUFJLE1BQU0sK0NBQStDO0FBQUEsTUFBRyxFQUFFO0FBQUEsTUFDMUgsYUFBYSxFQUFFLFVBQVU7QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUM3QixPQUFPLEVBQUUsTUFBTSxNQUFNLEtBQUs7QUFBQSxJQUMzQjtBQUVBLFVBQU0sTUFBTSxxQkFBcUIsRUFBRTtBQUVuQyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxRQUFRLE1BQU0sY0FBYyxFQUFFLElBQUksWUFBVSxFQUFFLFVBQVUsTUFBTSxVQUFVLElBQUksTUFBTSxJQUFJLE1BQU0sTUFBTSxLQUFLLEVBQUU7QUFBQSxJQUMxRyxHQUFHO0FBQUEsTUFDRixtQkFBbUI7QUFBQSxNQUNuQixRQUFRLENBQUM7QUFBQSxRQUNSLFVBQVU7QUFBQSxRQUNWLElBQUksd0JBQXdCLFVBQVUsbUJBQW1CO0FBQUEsUUFDekQsTUFBTTtBQUFBLE1BQ1AsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0VBQStFLE1BQU07QUFDekYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixRQUFRLHFDQUFxQyxRQUFRO0FBQUEsTUFDckQsUUFBUSxxQ0FBcUMsUUFBUTtBQUFBLE1BQ3JELFVBQVUscUNBQXFDLFVBQVU7QUFBQSxNQUN6RCxRQUFRLHFDQUFxQyxlQUFlO0FBQUEsSUFDN0QsR0FBRztBQUFBLE1BQ0YsUUFBUTtBQUFBLE1BQ1IsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUZBQXFGLE1BQU07QUFDL0YsVUFBTSxXQUFXLDJCQUEyQixFQUFFLE9BQU8sSUFBSSxlQUFlLElBQUksV0FBVyxDQUFDLEVBQUUsQ0FBQztBQUMzRixVQUFNLE9BQU8sMkJBQTJCO0FBQUEsTUFDdEMsT0FBTztBQUFBLE1BQ1AsZUFBZTtBQUFBLE1BQ2YsV0FBVyxDQUFDO0FBQUEsUUFDWCxJQUFJO0FBQUEsUUFDSixXQUFXO0FBQUEsUUFDWCxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixVQUFVO0FBQUEsUUFDVixTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsUUFDVCxRQUFRLENBQUMsRUFBRSxNQUFNLHFCQUFxQixTQUFTLEtBQUssQ0FBQztBQUFBLFFBQ3JELGVBQWU7QUFBQSxNQUNoQixDQUFDO0FBQUEsSUFDSCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsK0JBQStCLFVBQVUsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQzFFLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFVBQU0sUUFBUSxZQUFZLGFBQWEsWUFBWSxDQUFDLENBQUM7QUFDckQsVUFBTSxhQUFhLElBQUk7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsUUFDUCxTQUFTLE9BQU8sV0FBbUI7QUFDbEMsY0FBSSxXQUFXLGdCQUFnQjtBQUM5QixtQkFBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLFNBQVMsR0FBRyxvQkFBb0IsS0FBSztBQUFBLFVBQ2hFO0FBQ0EsY0FBSSxXQUFXLGVBQWU7QUFDN0IsbUJBQU8sRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLGtCQUFrQixFQUFFO0FBQUEsVUFDeEQ7QUFDQSxjQUFJLFdBQVcsY0FBYztBQUM1QixtQkFBTztBQUFBLFVBQ1I7QUFDQSxnQkFBTSxJQUFJLE1BQU0sdUJBQXVCLE1BQU0sRUFBRTtBQUFBLFFBQ2hEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsYUFBYSxFQUFFLFVBQVU7QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUM3QixPQUFPLEVBQUUsTUFBTSxNQUFNLEtBQUs7QUFBQSxJQUMzQjtBQUVBLFVBQU0sTUFBTSxxQkFBcUIsRUFBRTtBQUVuQyxXQUFPLGdCQUFnQixNQUFNLGNBQWMsRUFBRSxJQUFJLFlBQVUsRUFBRSxVQUFVLE1BQU0sVUFBVSxJQUFJLE1BQU0sSUFBSSxNQUFNLE1BQU0sTUFBTSxFQUFFLEdBQUcsQ0FBQztBQUFBLE1BQzVILFVBQVU7QUFBQSxNQUNWLElBQUksd0JBQXdCLG1CQUFtQixhQUFhO0FBQUEsTUFDNUQsTUFBTTtBQUFBLElBQ1AsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyw0RUFBNEUsWUFBWTtBQUM1RixVQUFNLFFBQVEsWUFBWSxhQUFhLFlBQVksQ0FBQyxDQUFDO0FBQ3JELFVBQU0sYUFBYSxJQUFJO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLFFBQ1AsU0FBUyxPQUFPLFdBQW1CO0FBQ2xDLGNBQUksV0FBVyxnQkFBZ0I7QUFDOUIsbUJBQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxTQUFTLEdBQUcsb0JBQW9CLE1BQU07QUFBQSxVQUNqRTtBQUNBLGNBQUksV0FBVyxlQUFlO0FBQzdCLG1CQUFPLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixVQUFVLEVBQUU7QUFBQSxVQUNoRDtBQUNBLGNBQUksV0FBVyxjQUFjO0FBQzVCLG1CQUFPO0FBQUEsVUFDUjtBQUNBLGdCQUFNLElBQUksTUFBTSx1QkFBdUIsTUFBTSxFQUFFO0FBQUEsUUFDaEQ7QUFBQSxNQUNEO0FBQUEsTUFDQSxhQUFhLEVBQUUsVUFBVTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQzdCLE9BQU8sRUFBRSxNQUFNLE1BQU0sS0FBSztBQUFBLElBQzNCO0FBRUEsVUFBTSxNQUFNLHFCQUFxQixFQUFFO0FBRW5DLFdBQU8sZ0JBQWdCLE1BQU0sY0FBYyxFQUFFLElBQUksWUFBVSxFQUFFLFVBQVUsTUFBTSxVQUFVLE1BQU0sTUFBTSxNQUFNLEVBQUUsR0FBRyxDQUFDO0FBQUEsTUFDOUcsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLElBQ1AsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSywrRUFBK0UsWUFBWTtBQUMvRixVQUFNLFFBQVEsWUFBWSxhQUFhLFlBQVksQ0FBQyxDQUFDO0FBQ3JELFVBQU0sYUFBYSxJQUFJO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLFFBQ1AsU0FBUyxPQUFPLFdBQW1CO0FBQ2xDLGNBQUksV0FBVyxnQkFBZ0I7QUFDOUIsbUJBQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxXQUFXLE9BQU8sc0JBQXNCLFVBQVUsT0FBTyxHQUFHLG9CQUFvQixNQUFNO0FBQUEsVUFDakg7QUFDQSxjQUFJLFdBQVcsZUFBZTtBQUM3QixtQkFBTyxFQUFFLFFBQVEsRUFBRSxnQkFBZ0Isa0JBQWtCLEVBQUU7QUFBQSxVQUN4RDtBQUNBLGNBQUksV0FBVyxjQUFjO0FBQzVCLG1CQUFPO0FBQUEsVUFDUjtBQUNBLGdCQUFNLElBQUksTUFBTSx1QkFBdUIsTUFBTSxFQUFFO0FBQUEsUUFDaEQ7QUFBQSxNQUNEO0FBQUEsTUFDQSxhQUFhLEVBQUUsVUFBVTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQzdCLE9BQU8sRUFBRSxNQUFNLE1BQU0sS0FBSztBQUFBLElBQzNCO0FBRUEsVUFBTSxNQUFNLHFCQUFxQixFQUFFO0FBRW5DLFdBQU8sZ0JBQWdCLE1BQU0sY0FBYyxFQUFFLElBQUksWUFBVSxFQUFFLFVBQVUsTUFBTSxVQUFVLE1BQU0sTUFBTSxNQUFNLEVBQUUsR0FBRyxDQUFDO0FBQUEsTUFDOUcsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLElBQ1AsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyw0REFBNEQsWUFBWTtBQUM1RSxVQUFNLFFBQVEsWUFBWSxhQUFhLFlBQVksQ0FBQyxDQUFDO0FBQ3JELFVBQU0sV0FBcUIsQ0FBQztBQUM1QixVQUFNLGFBQWEsSUFBSTtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxRQUNQLFNBQVMsT0FBTyxXQUFtQjtBQUNsQyxtQkFBUyxLQUFLLE1BQU07QUFDcEIsY0FBSSxXQUFXLGtCQUFrQjtBQUNoQyxtQkFBTyxDQUFDO0FBQUEsVUFDVDtBQUNBLGNBQUksV0FBVyxnQkFBZ0I7QUFDOUIsbUJBQU8sRUFBRSxTQUFTLE1BQU0sb0JBQW9CLEtBQUs7QUFBQSxVQUNsRDtBQUNBLGdCQUFNLElBQUksTUFBTSx1QkFBdUIsTUFBTSxFQUFFO0FBQUEsUUFDaEQ7QUFBQSxNQUNEO0FBQUEsTUFDQSxhQUFhLEVBQUUsVUFBVTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQzdCLE9BQU8sRUFBRSxNQUFNLE1BQU0sS0FBSztBQUFBLElBQzNCO0FBQ0EsVUFBTSxvQkFBb0IsSUFBSSxZQUFZO0FBQUEsSUFBRTtBQUU1QyxVQUFNLE1BQU0sbUJBQW1CLEVBQUU7QUFFakMsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsZUFBZSxNQUFNLHFCQUFxQixFQUFFO0FBQUEsSUFDN0MsR0FBRztBQUFBLE1BQ0YsVUFBVSxDQUFDLGtCQUFrQixjQUFjO0FBQUEsTUFDM0MsZUFBZTtBQUFBLElBQ2hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhFQUE4RSxZQUFZO0FBQzlGLFVBQU0sUUFBUSxZQUFZLGFBQWEsWUFBWSxDQUFDLENBQUM7QUFDckQsVUFBTSxnQkFBMEIsQ0FBQztBQUNqQyxVQUFNLGNBQWMsSUFBSTtBQUN4QixVQUFNLGdCQUFnQixJQUFJLENBQUM7QUFBQSxNQUMxQixVQUFVO0FBQUEsTUFDVixJQUFJLHdCQUF3QixnQkFBZ0IsZUFBZTtBQUFBLE1BQzNELE1BQU07QUFBQSxNQUNOLGdCQUFnQjtBQUFBLElBQ2pCLENBQUM7QUFDRCxVQUFNLFNBQVMsRUFBRSxJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsTUFBUztBQUN2RCxVQUFNLGFBQWEsSUFBSTtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxRQUNQLFNBQVMsT0FBTyxXQUFtQjtBQUNsQyxjQUFJLFdBQVcsZ0JBQWdCO0FBQzlCLG1CQUFPLEVBQUUsU0FBUyxNQUFNLG9CQUFvQixLQUFLO0FBQUEsVUFDbEQ7QUFDQSxnQkFBTSxJQUFJLE1BQU0sdUJBQXVCLE1BQU0sRUFBRTtBQUFBLFFBQ2hEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsYUFBYTtBQUFBLFFBQ1osVUFBVSxDQUFDLFVBQWtCLGNBQWMsS0FBSyxLQUFLO0FBQUEsUUFDckQsVUFBVTtBQUFBLFFBQUU7QUFBQSxNQUNiO0FBQUEsTUFDQSxPQUFPLEVBQUUsTUFBTSxNQUFNLEtBQUs7QUFBQSxJQUMzQjtBQUVBLFVBQU0sTUFBTSxhQUFhLE1BQU0sc0JBQXNCLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRTtBQUN0RSxVQUFNLE1BQU0sY0FBYztBQUUxQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGFBQWEsTUFBTSxjQUFjO0FBQUEsTUFDakM7QUFBQSxNQUNBLFFBQVEsTUFBTSxPQUFPLElBQUk7QUFBQSxJQUMxQixHQUFHO0FBQUEsTUFDRixhQUFhO0FBQUEsTUFDYixlQUFlLENBQUMsRUFBRTtBQUFBLE1BQ2xCLFFBQVEsQ0FBQztBQUFBLElBQ1YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOERBQThELE1BQU07QUFDeEUsVUFBTSxRQUFRLFlBQVksYUFBYSxZQUFZLENBQUMsQ0FBQztBQUNyRCxVQUFNLG9CQUFvQixNQUFNLGNBQWMsRUFBRSxjQUFjO0FBQzlELFVBQU0sdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyx1Q0FBdUMsR0FBRyxLQUFLLENBQUM7QUFDbkcsVUFBTSxjQUFjLE1BQU0sY0FBYyxFQUFFLGNBQWM7QUFDeEQsVUFBTSx1QkFBdUIsRUFBRSxpQkFBaUIsRUFBRSxDQUFDLHVDQUF1QyxHQUFHLE1BQU0sQ0FBQztBQUNwRyxVQUFNLGlCQUFpQixNQUFNLGNBQWMsRUFBRSxjQUFjO0FBRTNELFdBQU8sZ0JBQWdCLEVBQUUsbUJBQW1CLGFBQWEsZUFBZSxHQUFHO0FBQUEsTUFDMUUsbUJBQW1CO0FBQUEsTUFDbkIsYUFBYSxFQUFFLGtCQUFrQixLQUFLO0FBQUEsTUFDdEMsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbIm1vZGVsIl0KfQo=
