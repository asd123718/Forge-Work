import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { PluginFormat } from "../../../agentPlugins/common/pluginParsers.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { CopilotCliConfigKey } from "../../common/copilotCliConfig.js";
import { reasoningEffortLevels } from "../../common/reasoningEffort.js";
import { CustomizationType } from "../../common/state/protocol/state.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from "../../common/toolSearchConstants.js";
import { ActiveClientToolSet } from "../../node/activeClientState.js";
import { IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostManagedSettingsService, IAgentHostManagedSettingsService } from "../../node/agentHostManagedSettingsService.js";
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from "../../node/byokLmBridgeRegistry.js";
import { ByokLmProxyService, IByokLmProxyService } from "../../node/copilot/byokLmProxyService.js";
import { CopilotSessionLauncher, filterClientToolNames, getCopilotReasoningEffort, isCopilotReasoningEffort, resolveByokSessionConfig, normalizeToolFilterPatterns, resolveConfiguredReasoningEffortOverride, resolveCopilotReasoningEffort, toSdkToolFilterPatterns } from "../../node/copilot/copilotSessionLauncher.js";
const testRuntime = {
  handlePermissionRequest: async () => {
    throw new Error("Unexpected permission request");
  },
  handleExitPlanModeRequest: async () => {
    throw new Error("Unexpected exit plan mode request");
  },
  handleUserInputRequest: async () => {
    throw new Error("Unexpected user input request");
  },
  handleElicitationRequest: async () => {
    throw new Error("Unexpected elicitation request");
  },
  handleMcpAuthRequest: async () => {
    throw new Error("Unexpected MCP auth request");
  },
  requestUnsandboxedCommandConfirmation: async () => false,
  handlePreToolUse: async () => {
  },
  handlePostToolUse: async () => {
  },
  handleUserPromptSubmitted: () => void 0,
  createClientSdkTools: () => [],
  createServerSdkTools: () => []
};
const testWorkingDirectory = URI.file(process.cwd());
function createTestLauncher(managedSettingsPermissions, rootValues = {}) {
  const configurationService = {
    getRootValue: (_schema, key) => rootValues[key]
  };
  return new CopilotSessionLauncher(
    configurationService,
    { permissions: managedSettingsPermissions ?? {} },
    {},
    new NullLogService(),
    {},
    { _serviceBrand: void 0, start: async () => {
      throw new Error("Unexpected proxy start");
    }, dispose: () => {
    } },
    new ByokLmBridgeRegistry(),
    {
      _serviceBrand: void 0,
      getSessionTraceContext: () => void 0,
      releaseSessionTraceContext: () => {
      },
      withTraceContext: (_context, fn) => fn()
    }
  );
}
suite("resolveByokSessionConfig", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const sessionId = "sess-1";
  const log = new NullLogService();
  function connectionOf(models, chat = async () => ({ output: [] })) {
    const emitter = store.add(new Emitter({
      onDidAddFirstListener: () => emitter.fire(models)
    }));
    return { chat, onDidChangeModels: emitter.event };
  }
  function countingProxy() {
    let starts = 0;
    const handle = {
      baseUrl: "http://127.0.0.1:1",
      nonce: "NONCE",
      providerBaseUrl: (vendor) => `http://127.0.0.1:1/v/${vendor}`,
      dispose: () => {
      }
    };
    return {
      get starts() {
        return starts;
      },
      startProxy: async () => {
        starts++;
        return handle;
      }
    };
  }
  test("returns empty and never starts the proxy when no bridge is active", async () => {
    const registry = new ByokLmBridgeRegistry();
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    assert.deepStrictEqual(config, {});
    assert.strictEqual(proxy.starts, 0);
  });
  test("returns empty and never starts the proxy when the bridge reports no models", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", connectionOf([]));
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.deepStrictEqual(config, {});
    assert.strictEqual(proxy.starts, 0);
  });
  test("returns empty and never starts the proxy for a window that never pushes a snapshot", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", { chat: async () => ({ output: [] }), onDidChangeModels: Event.None });
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.deepStrictEqual(config, {});
    assert.strictEqual(proxy.starts, 0);
  });
  test("synthesizes deduped providers and per-model config from the active bridge", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", connectionOf([
      { vendor: "acme", id: "claude", name: "Acme Claude", maxContextWindowTokens: 2e5 },
      { vendor: "acme", id: "gpt", name: void 0, maxContextWindowTokens: void 0 },
      { vendor: "globex", id: "llama", name: "Globex Llama" }
    ]));
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.strictEqual(proxy.starts, 1);
    assert.deepStrictEqual(config, {
      providers: [
        { name: "acme", type: "openai", wireApi: "responses", baseUrl: "http://127.0.0.1:1/v/acme", bearerToken: "NONCE.sess-1" },
        { name: "globex", type: "openai", wireApi: "responses", baseUrl: "http://127.0.0.1:1/v/globex", bearerToken: "NONCE.sess-1" }
      ],
      models: [
        { id: "claude", provider: "acme", name: "Acme Claude", maxContextWindowTokens: 2e5 },
        { id: "gpt", provider: "acme" },
        { id: "llama", provider: "globex", name: "Globex Llama" }
      ]
    });
  });
  test("preserves provider groups when models share a vendor and id", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", connectionOf([
      { vendor: "google", id: "gemini-2.5-pro", modelIdentifier: "google/Gemini Personal/gemini-2.5-pro" },
      { vendor: "google", id: "gemini-2.5-pro", modelIdentifier: "google/Gemini Work/gemini-2.5-pro" }
    ]));
    const proxy = countingProxy();
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.deepStrictEqual(config.models, [
      { id: "Gemini Personal/gemini-2.5-pro", provider: "google" },
      { id: "Gemini Work/gemini-2.5-pro", provider: "google" }
    ]);
  });
  test("synthesized provider config routes through a live proxy to the bridge", async () => {
    const registry = new ByokLmBridgeRegistry();
    let captured;
    const registration = registry.register("client-1", connectionOf(
      [{ vendor: "acme", id: "claude" }],
      async (request) => {
        captured = request;
        return { output: [{ type: "message", content: [{ type: "text", text: "hello from byok" }] }] };
      }
    ));
    const service = new ByokLmProxyService(log, registry);
    let handle;
    const config = await resolveByokSessionConfig(sessionId, registry, async () => handle = await service.start(), log);
    const provider = config.providers[0];
    const model = config.models[0];
    try {
      const response = await fetch(`${provider.baseUrl}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${provider.bearerToken}` },
        body: JSON.stringify({ model: model.id, input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }] })
      });
      assert.strictEqual(response.status, 200);
      const text = await response.text();
      assert.ok(text.includes("hello from byok"), `expected content in SSE: ${text}`);
    } finally {
      handle?.dispose();
      registration.dispose();
      service.dispose();
    }
    assert.strictEqual(captured?.vendor, "acme");
    assert.strictEqual(captured?.modelId, "claude");
  });
  test("reads the latest pushed snapshot from the registry cache", async () => {
    const registry = new ByokLmBridgeRegistry();
    const emitter = store.add(new Emitter());
    const registration = registry.register("client-1", {
      chat: async () => ({ output: [] }),
      onDidChangeModels: emitter.event
    });
    const proxy = countingProxy();
    emitter.fire([]);
    emitter.fire([{ vendor: "acme", id: "claude", name: "Acme Claude" }]);
    const config = await resolveByokSessionConfig(sessionId, registry, proxy.startProxy, log);
    registration.dispose();
    assert.deepStrictEqual(config.models, [{ id: "claude", provider: "acme", name: "Acme Claude" }]);
  });
});
suite("CopilotSessionLauncher BYOK proxy lifecycle", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const sessionId = "sess-1";
  function connectionOf(store, models) {
    const emitter = store.add(new Emitter({
      onDidAddFirstListener: () => emitter.fire(models)
    }));
    return { chat: async () => ({ output: [] }), onDidChangeModels: emitter.event };
  }
  function fakeProxyService() {
    let starts = 0;
    let disposes = 0;
    const service = {
      _serviceBrand: void 0,
      start: async () => {
        const nonce = `NONCE-${++starts}`;
        return {
          baseUrl: "http://127.0.0.1:1",
          nonce,
          providerBaseUrl: (vendor) => `http://127.0.0.1:1/v/${vendor}`,
          dispose: () => {
            disposes++;
          }
        };
      },
      dispose: () => {
      }
    };
    return { service, get starts() {
      return starts;
    }, get disposes() {
      return disposes;
    } };
  }
  function createLauncher(store, proxy, registry) {
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IByokLmProxyService, proxy);
    services.set(IByokLmBridgeRegistry, registry);
    const instantiationService = store.add(new InstantiationService(services));
    return instantiationService.createInstance(CopilotSessionLauncher);
  }
  test("memoizes the handle, and disposeByokProxyHandle releases it so the next launch mints a fresh nonce", async () => {
    const store = new DisposableStore();
    const proxy = fakeProxyService();
    const registry = new ByokLmBridgeRegistry();
    store.add(registry.register("client-1", connectionOf(store, [{ vendor: "acme", id: "claude" }])));
    const launcher = createLauncher(store, proxy.service, registry);
    const resolve = () => launcher._resolveByokSessionConfig(sessionId);
    const first = await resolve();
    const second = await resolve();
    assert.strictEqual(proxy.starts, 1, "subsequent launches share the memoized bind");
    assert.strictEqual(first.providers[0].bearerToken, second.providers[0].bearerToken, "the shared bind reuses one nonce");
    await launcher.disposeByokProxyHandle();
    await launcher.disposeByokProxyHandle();
    assert.strictEqual(proxy.disposes, 1, "the handle is released exactly once and disposal is idempotent");
    const third = await resolve();
    assert.strictEqual(proxy.starts, 2, "a fresh bind is minted after disposal");
    assert.notStrictEqual(third.providers[0].bearerToken, first.providers[0].bearerToken, "the fresh bind carries a new nonce");
    store.dispose();
  });
});
suite("CopilotSessionLauncher shared session config", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes Agent Host defaults, managed permissions, and exit-plan handler to create and resume", async () => {
    const createConfigs = [];
    const resumeConfigs = [];
    const session = {
      sessionId: "session-1",
      on: () => () => {
      },
      disconnect: async () => {
      }
    };
    const client = {
      createSession: async (config) => {
        createConfigs.push(config);
        return session;
      },
      resumeSession: async (_sessionId, config) => {
        resumeConfigs.push(config);
        return session;
      }
    };
    const managedSettingsPermissions = {
      disableBypassPermissionsMode: "disable",
      ask: ["Shell"]
    };
    const launcher = createTestLauncher(managedSettingsPermissions);
    const pluginDir = URI.file("/tmp/synced-customizations");
    const skillUri = URI.joinPath(pluginDir, "skills", "user-skill", "SKILL.md");
    const instructionUri = URI.joinPath(pluginDir, "rules", "user.instructions.md");
    const plugin = {
      format: PluginFormat.Copilot,
      hooks: [],
      mcpServers: [],
      disabledMcpServers: ["azure", "azure"],
      agents: [],
      skills: [{
        uri: skillUri,
        name: "user-skill",
        customization: { type: CustomizationType.Skill, id: skillUri.toString(), uri: skillUri.toString(), name: "user-skill" }
      }],
      instructions: [{
        uri: instructionUri,
        name: "user",
        customization: { type: CustomizationType.Rule, id: instructionUri.toString(), uri: instructionUri.toString(), name: "user", alwaysApply: true }
      }],
      pluginDir
    };
    const basePlan = {
      client,
      sessionId: "session-1",
      workingDirectory: testWorkingDirectory,
      resolvedAgentName: void 0,
      snapshot: { tools: [], plugins: [plugin], mcpServers: {} },
      disabledRootMcpServers: ["github", "azure"],
      activeClientToolSet: new ActiveClientToolSet(),
      shellManager: void 0,
      githubToken: void 0
    };
    const createPlan = {
      ...basePlan,
      kind: "create",
      model: void 0
    };
    const resumePlan = {
      ...basePlan,
      kind: "resume",
      fallback: { model: void 0 }
    };
    const sessions = new DisposableStore();
    try {
      sessions.add(await launcher.launch(createPlan, testRuntime));
      sessions.add(await launcher.launch(resumePlan, testRuntime));
      assert.deepStrictEqual({
        createClientName: createConfigs[0].clientName,
        createGitHubMcpToolConfig: createConfigs[0].githubMcpToolConfig,
        createPluginDirectories: createConfigs[0].pluginDirectories,
        createSkillDirectories: createConfigs[0].skillDirectories,
        createInstructionDirectories: createConfigs[0].instructionDirectories,
        createDisabledMcpServers: createConfigs[0].disabledMcpServers,
        createHasExitPlanHandler: typeof createConfigs[0].onExitPlanModeRequest === "function",
        createLargeOutput: createConfigs[0].largeOutput,
        createManagedSettings: createConfigs[0].managedSettings,
        resumeClientName: resumeConfigs[0].clientName,
        resumeGitHubMcpToolConfig: resumeConfigs[0].githubMcpToolConfig,
        resumePluginDirectories: resumeConfigs[0].pluginDirectories,
        resumeSkillDirectories: resumeConfigs[0].skillDirectories,
        resumeInstructionDirectories: resumeConfigs[0].instructionDirectories,
        resumeDisabledMcpServers: resumeConfigs[0].disabledMcpServers,
        resumeHasExitPlanHandler: typeof resumeConfigs[0].onExitPlanModeRequest === "function",
        resumeLargeOutput: resumeConfigs[0].largeOutput,
        resumeManagedSettings: resumeConfigs[0].managedSettings
      }, {
        createClientName: "vscode-agent-host",
        createGitHubMcpToolConfig: { disableFormDeferral: true },
        createPluginDirectories: [pluginDir.fsPath],
        createSkillDirectories: [],
        createInstructionDirectories: [URI.joinPath(pluginDir, "rules").fsPath],
        createDisabledMcpServers: ["azure", "github"],
        createHasExitPlanHandler: true,
        createLargeOutput: { maxSizeBytes: 8192 },
        createManagedSettings: { permissions: managedSettingsPermissions },
        resumeClientName: "vscode-agent-host",
        resumeGitHubMcpToolConfig: { disableFormDeferral: true },
        resumePluginDirectories: [pluginDir.fsPath],
        resumeSkillDirectories: [],
        resumeInstructionDirectories: [URI.joinPath(pluginDir, "rules").fsPath],
        resumeDisabledMcpServers: ["azure", "github"],
        resumeHasExitPlanHandler: true,
        resumeLargeOutput: { maxSizeBytes: 8192 },
        resumeManagedSettings: { permissions: managedSettingsPermissions }
      });
    } finally {
      sessions.dispose();
      await launcher.disposeByokProxyHandle();
    }
  });
});
suite("CopilotSessionLauncher resume fallback", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class TestSdkError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }
  function createResumeFailingLaunch(message, code = -32603) {
    let createSessionCalls = 0;
    const session = {
      sessionId: "session-1",
      on: () => () => {
      },
      disconnect: async () => {
      }
    };
    const client = {
      createSession: async () => {
        createSessionCalls++;
        return session;
      },
      resumeSession: async () => {
        throw new TestSdkError(message, code);
      }
    };
    return {
      launcher: createTestLauncher(),
      plan: {
        client,
        sessionId: "session-1",
        workingDirectory: testWorkingDirectory,
        resolvedAgentName: void 0,
        snapshot: { tools: [], plugins: [], mcpServers: {} },
        activeClientToolSet: new ActiveClientToolSet(),
        shellManager: void 0,
        githubToken: void 0,
        kind: "resume",
        fallback: { model: void 0 }
      },
      getCreateSessionCalls: () => createSessionCalls
    };
  }
  test("falls back to createSession after a Start Over truncate leaves the session empty", async () => {
    const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch(`Request session.resume failed with message: LocalRpcSession: 'session.getMessages' returned no events for session session-1`);
    const sessions = new DisposableStore();
    try {
      sessions.add(await launcher.launch(plan, testRuntime));
      assert.strictEqual(getCreateSessionCalls(), 1);
    } finally {
      sessions.dispose();
      await launcher.disposeByokProxyHandle();
    }
  });
  test("falls back to createSession when the SDK reports the session was not found", async () => {
    const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch("Request session.resume failed with message: Session not found: session-1");
    const sessions = new DisposableStore();
    try {
      sessions.add(await launcher.launch(plan, testRuntime));
      assert.strictEqual(getCreateSessionCalls(), 1);
    } finally {
      sessions.dispose();
      await launcher.disposeByokProxyHandle();
    }
  });
  test("does not replace a session with an empty one after a transient network failure", async () => {
    const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch("Request session.resume failed with message: network fetch failed: request failed: error sending request for url (https://api.github.com/copilot_internal/user)");
    try {
      await assert.rejects(() => launcher.launch(plan, testRuntime), /network fetch failed/);
      assert.strictEqual(getCreateSessionCalls(), 0);
    } finally {
      await launcher.disposeByokProxyHandle();
    }
  });
  test("does not replace a session with an empty one for an unrecognized -32603", async () => {
    const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch("Request session.resume failed: something went wrong");
    try {
      await assert.rejects(() => launcher.launch(plan, testRuntime), /something went wrong/);
      assert.strictEqual(getCreateSessionCalls(), 0);
    } finally {
      await launcher.disposeByokProxyHandle();
    }
  });
  test("does not replace a corrupted session file with an empty session", async () => {
    const { launcher, plan, getCreateSessionCalls } = createResumeFailingLaunch("Request session.resume failed with message: Session file is corrupted (line 19567: data.compactionTokensUsed.copilotUsage.tokenDetails.0.batchSize: Number must be greater than 0)");
    try {
      await assert.rejects(() => launcher.launch(plan, testRuntime), /Session file is corrupted/);
      assert.strictEqual(getCreateSessionCalls(), 0);
    } finally {
      await launcher.disposeByokProxyHandle();
    }
  });
});
suite("CopilotSessionLauncher verbosity", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function applyVerbosity(verbosity) {
    const launcher = createTestLauncher();
    const session = {
      rpc: {
        options: {
          update: async (options) => updates.push(options)
        }
      }
    };
    return launcher._applyVerbosity(session, verbosity, "session-1");
  }
  const updates = [];
  setup(() => updates.length = 0);
  test("forwards the requested verbosity", async () => {
    await applyVerbosity("high");
    assert.deepStrictEqual(updates, [{ verbosity: "high" }]);
  });
});
suite("CopilotSessionLauncher reasoning summary", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function applyReasoningSummary(reasoningSummary) {
    const launcher = createTestLauncher();
    const session = {
      rpc: {
        options: {
          update: async (options) => updates.push(options)
        }
      }
    };
    return launcher._applyReasoningSummary(session, reasoningSummary, "session-1");
  }
  const updates = [];
  setup(() => updates.length = 0);
  test("forwards the requested reasoning summary", async () => {
    await applyReasoningSummary("detailed");
    assert.deepStrictEqual(updates, [{ reasoningSummary: "detailed" }]);
  });
});
suite("CopilotSessionLauncher GPT-5.6 customizations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("applies verbosity and concise reasoning summary when enabled by experiment", async () => {
    const updates = [];
    const launcher = createTestLauncher(void 0, { [CopilotCliConfigKey.ReasoningSummary]: true });
    const session = {
      rpc: {
        options: {
          update: async (options) => updates.push(options)
        }
      }
    };
    await launcher._applyGpt56Customizations(session, "session-1");
    assert.deepStrictEqual(updates, [
      { verbosity: "medium" },
      { reasoningSummary: "concise" }
    ]);
  });
  test("does not apply reasoning summary when the experiment is unset or disabled", async () => {
    for (const reasoningSummary of [void 0, false]) {
      const updates = [];
      const launcher = createTestLauncher(void 0, { [CopilotCliConfigKey.ReasoningSummary]: reasoningSummary });
      const session = {
        rpc: { options: { update: async (options) => updates.push(options) } }
      };
      await launcher._applyGpt56Customizations(session, "session-1");
      assert.deepStrictEqual(updates, [{ verbosity: "medium" }]);
    }
  });
  test("applies GPT-5.6 customizations when resuming an existing session", async () => {
    const updates = [];
    const session = {
      sessionId: "session-1",
      on: () => () => {
      },
      disconnect: async () => {
      },
      rpc: { options: { update: async (options) => updates.push(options) } }
    };
    const launcher = createTestLauncher(void 0, { [CopilotCliConfigKey.ReasoningSummary]: true });
    const plan = {
      kind: "resume",
      client: { resumeSession: async () => session },
      sessionId: "session-1",
      workingDirectory: testWorkingDirectory,
      resolvedAgentName: void 0,
      snapshot: { tools: [], plugins: [], mcpServers: {} },
      activeClientToolSet: new ActiveClientToolSet(),
      shellManager: void 0,
      githubToken: void 0,
      fallback: { model: { id: "gpt-5.6-sol", config: {} } }
    };
    const wrapper = await launcher.launch(plan, testRuntime);
    try {
      assert.deepStrictEqual(updates, [
        { verbosity: "medium" },
        { reasoningSummary: "concise" }
      ]);
    } finally {
      wrapper.dispose();
      await launcher.disposeByokProxyHandle();
    }
  });
});
suite("getCopilotReasoningEffort", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("a valid override wins over the picker value; an invalid or absent override falls back", () => {
    const model = { id: "gpt-5", config: { thinkingLevel: "medium" } };
    assert.deepStrictEqual(
      [
        getCopilotReasoningEffort(model),
        getCopilotReasoningEffort(model, "xhigh"),
        getCopilotReasoningEffort(model, "turbo"),
        getCopilotReasoningEffort(void 0, "high"),
        getCopilotReasoningEffort(void 0)
      ],
      ["medium", "xhigh", "medium", "high", void 0]
    );
  });
  test("recognizes every canonical reasoning-effort tier so none is dropped from the picker", () => {
    assert.deepStrictEqual({
      accepted: reasoningEffortLevels.filter(isCopilotReasoningEffort),
      rejectsUnknown: isCopilotReasoningEffort("turbo")
    }, {
      accepted: [...reasoningEffortLevels],
      rejectsUnknown: false
    });
  });
});
suite("resolveCopilotReasoningEffort", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function configOf(values) {
    return { getRootValue: (_schema, key) => values[key] };
  }
  test("a specific entry beats the wildcard beats the picker; invalid values fall through", () => {
    const log = new NullLogService();
    const model = { id: "gpt-5", config: { thinkingLevel: "medium" } };
    assert.deepStrictEqual(
      [
        // a specific entry wins over the picker
        resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { "gpt-5": { reasoningEffort: "low" } } }), log, "s1"),
        // the wildcard applies to any model; a specific entry wins over it
        resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { "*": { reasoningEffort: "high" } } }), log, "s1"),
        resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { "*": { reasoningEffort: "high" }, "gpt-5": { reasoningEffort: "low" } } }), log, "s1"),
        // an invalid specific value is ignored, so it cannot mask the wildcard
        resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { "*": { reasoningEffort: "high" }, "gpt-5": { reasoningEffort: "turbo" } } }), log, "s1"),
        // an invalid value falls through to the picker
        resolveCopilotReasoningEffort(model, configOf({ modelCapabilityOverrides: { "gpt-5": { reasoningEffort: "turbo" } } }), log, "s1"),
        // nothing configured → picker value
        resolveCopilotReasoningEffort(model, configOf({}), log, "s1"),
        // no model (server-side "Auto"): the `*` entry still matches, but a
        // model-id entry cannot
        resolveCopilotReasoningEffort(void 0, configOf({ modelCapabilityOverrides: { "*": { reasoningEffort: "low" } } }), log, "s1"),
        resolveCopilotReasoningEffort(void 0, configOf({ modelCapabilityOverrides: { "gpt-5": { reasoningEffort: "low" } } }), log, "s1")
      ],
      ["low", "high", "low", "high", "medium", "medium", "low", void 0]
    );
  });
  test("resolveConfiguredReasoningEffortOverride reports only the configured override, never the picker value", () => {
    const log = new NullLogService();
    const model = { id: "gpt-5", config: { thinkingLevel: "medium" } };
    assert.deepStrictEqual(
      [
        // same resolution as above...
        resolveConfiguredReasoningEffortOverride(model, configOf({ modelCapabilityOverrides: { "gpt-5": { reasoningEffort: "low" } } }), log, "s1"),
        resolveConfiguredReasoningEffortOverride(model, configOf({ modelCapabilityOverrides: { "*": { reasoningEffort: "high" } } }), log, "s1"),
        // ...but no picker fallback: unconfigured or invalid means "leave it alone"
        resolveConfiguredReasoningEffortOverride(model, configOf({ modelCapabilityOverrides: { "gpt-5": { reasoningEffort: "turbo" } } }), log, "s1"),
        resolveConfiguredReasoningEffortOverride(model, configOf({}), log, "s1")
      ],
      ["low", "high", void 0, void 0]
    );
  });
});
suite("filterClientToolNames", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("applies allow/deny patterns with excludedTools winning; other sources never match", () => {
    const names = /* @__PURE__ */ new Set(["openBrowserPage", "readPage", "runTask"]);
    const resolve = (available, excluded) => [...filterClientToolNames(names, available, excluded)].sort();
    assert.deepStrictEqual(
      [
        // no filters → same set (and same instance semantics: everything survives)
        resolve(void 0, void 0),
        // bare-name, source-qualified, and source-wildcard exclusion
        resolve(void 0, ["openBrowserPage"]),
        resolve(void 0, ["custom:readPage"]),
        resolve(void 0, ["custom:*"]),
        // builtin/mcp patterns never match client tools
        resolve(void 0, ["builtin:*", "mcp:*", "bash"]),
        // allowlist keeps only matches; excludedTools wins over availableTools
        resolve(["openBrowserPage", "custom:readPage"], void 0),
        resolve(["custom:*"], ["openBrowserPage"])
      ],
      [
        ["openBrowserPage", "readPage", "runTask"],
        ["readPage", "runTask"],
        ["openBrowserPage", "runTask"],
        [],
        ["openBrowserPage", "readPage", "runTask"],
        ["openBrowserPage", "readPage"],
        ["readPage", "runTask"]
      ]
    );
    const withSearch = /* @__PURE__ */ new Set([CLIENT_TOOL_SEARCH_REFERENCE_NAME, "runTask"]);
    const resolveSearch = (excluded) => [...filterClientToolNames(withSearch, void 0, excluded)].sort();
    assert.deepStrictEqual(
      [
        resolveSearch([`builtin:${RUNTIME_TOOL_SEARCH_TOOL_NAME}`]),
        resolveSearch(["builtin:*"]),
        resolveSearch([RUNTIME_TOOL_SEARCH_TOOL_NAME]),
        // Client tools are custom-source even when they override a built-in.
        [...filterClientToolNames(withSearch, ["builtin:*"], void 0)]
      ],
      [
        ["runTask", "toolSearch"],
        ["runTask", "toolSearch"],
        ["runTask"],
        []
      ]
    );
  });
  test("keeps Agent Host and SDK tool-search names consistent", () => {
    const names = /* @__PURE__ */ new Set([CLIENT_TOOL_SEARCH_REFERENCE_NAME]);
    assert.deepStrictEqual(
      [
        [...filterClientToolNames(names, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], void 0)],
        [...filterClientToolNames(names, [RUNTIME_TOOL_SEARCH_TOOL_NAME], void 0)],
        [...filterClientToolNames(names, void 0, [`custom:${RUNTIME_TOOL_SEARCH_TOOL_NAME}`])],
        toSdkToolFilterPatterns([CLIENT_TOOL_SEARCH_REFERENCE_NAME, `custom:${CLIENT_TOOL_SEARCH_REFERENCE_NAME}`, "builtin:*"])
      ],
      [
        [CLIENT_TOOL_SEARCH_REFERENCE_NAME],
        [CLIENT_TOOL_SEARCH_REFERENCE_NAME],
        [],
        [RUNTIME_TOOL_SEARCH_TOOL_NAME, `custom:${RUNTIME_TOOL_SEARCH_TOOL_NAME}`, "builtin:*"]
      ]
    );
  });
});
suite("normalizeToolFilterPatterns", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("expands a bare wildcard and coerces a lone string; unusable values read as unset", () => {
    assert.deepStrictEqual(
      [
        // a bare '*' is expanded, not dropped — an "exclude everything"
        // denylist must not degrade into "exclude nothing"
        normalizeToolFilterPatterns(["*"]),
        normalizeToolFilterPatterns(["mcp:*", "*"]),
        // a lone string reads as a one-element list
        normalizeToolFilterPatterns("mcp:*"),
        // an empty allowlist means "no tools", so it must not read as unset
        normalizeToolFilterPatterns([]),
        // not a list at all → unusable
        normalizeToolFilterPatterns(void 0),
        normalizeToolFilterPatterns(42),
        normalizeToolFilterPatterns(["ok", 7])
      ],
      [
        ["builtin:*", "mcp:*", "custom:*"],
        ["mcp:*", "builtin:*", "custom:*"],
        ["mcp:*"],
        [],
        void 0,
        void 0,
        void 0
      ]
    );
  });
});
suite("CopilotSessionLauncher resume config", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createLauncher(store, values) {
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IByokLmBridgeRegistry, new ByokLmBridgeRegistry());
    services.set(IAgentHostManagedSettingsService, store.add(new AgentHostManagedSettingsService()));
    services.set(IAgentConfigurationService, {
      _serviceBrand: void 0,
      getRootValue: (_schema, key) => values[key]
    });
    const instantiationService = store.add(new InstantiationService(services));
    return instantiationService.createInstance(CopilotSessionLauncher);
  }
  function buildResumeConfig(launcher, model, snapshot = { tools: [], plugins: [], mcpServers: {} }, createClientSdkTools = () => []) {
    const plan = {
      kind: "resume",
      client: { createSession: async () => {
        throw new Error("unused");
      }, resumeSession: async () => {
        throw new Error("unused");
      } },
      sessionId: "sess-1",
      workingDirectory: URI.file("/workspace"),
      resolvedAgentName: void 0,
      snapshot,
      activeClientToolSet: new ActiveClientToolSet(),
      shellManager: void 0,
      githubToken: "token",
      fallback: { model }
    };
    const runtime = { createClientSdkTools, createServerSdkTools: () => [] };
    return launcher._buildSessionConfig(plan, runtime);
  }
  test("forwards a configured override on resume and leaves the effort untouched otherwise", async () => {
    const store = new DisposableStore();
    const model = { id: "gpt-5", config: { thinkingLevel: "medium" } };
    const perModel = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { "gpt-5": { reasoningEffort: "low" } } }), model);
    const wildcard = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { "*": { reasoningEffort: "xhigh" } } }), model);
    const none = await buildResumeConfig(createLauncher(store, {}), model);
    assert.deepStrictEqual(
      [perModel.reasoningEffort, wildcard.reasoningEffort, none.reasoningEffort],
      ["low", "xhigh", void 0]
    );
    store.dispose();
  });
  test("never sends the model or context tier on resume, aliased or not", async () => {
    const store = new DisposableStore();
    const model = { id: "preview-model", config: { thinkingLevel: "medium" } };
    const aliased = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { "preview-model": { family: "claude-opus-4.8" } } }), model);
    const none = await buildResumeConfig(createLauncher(store, {}), model);
    assert.deepStrictEqual(
      [aliased.model, aliased.contextTier, none.model, none.contextTier],
      [void 0, void 0, void 0, void 0]
    );
    store.dispose();
  });
  test("a session with no stored model still gets the wildcard entry effort and tool filters", async () => {
    const store = new DisposableStore();
    const launcher = createLauncher(store, { modelCapabilityOverrides: { "*": { reasoningEffort: "high", excludedTools: ["mcp:*"] }, "gpt-5": { reasoningEffort: "low" } } });
    const config = await buildResumeConfig(launcher, void 0);
    assert.deepStrictEqual(
      [config.reasoningEffort, config.excludedTools],
      ["high", ["mcp:*"]]
    );
    store.dispose();
  });
  test("forwards a configured modelCapabilities override and ignores a non-object one", async () => {
    const store = new DisposableStore();
    const model = { id: "gpt-5", config: { thinkingLevel: "medium" } };
    const valid = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { "gpt-5": { modelCapabilities: { supports: { vision: false } } } } }), model);
    const invalid = await buildResumeConfig(createLauncher(store, { modelCapabilityOverrides: { "gpt-5": { modelCapabilities: "oops" } } }), model);
    const wildcardFallback = await buildResumeConfig(createLauncher(store, {
      modelCapabilityOverrides: {
        "*": {
          availableTools: ["custom:*"],
          excludedTools: ["mcp:*"],
          modelCapabilities: { supports: { vision: true } }
        },
        "gpt-5": {
          availableTools: 42,
          excludedTools: 42,
          modelCapabilities: "oops"
        }
      }
    }), model);
    const none = await buildResumeConfig(createLauncher(store, {}), model);
    assert.deepStrictEqual(
      [
        valid.modelCapabilities,
        invalid.modelCapabilities,
        {
          availableTools: wildcardFallback.availableTools,
          excludedTools: wildcardFallback.excludedTools,
          modelCapabilities: wildcardFallback.modelCapabilities
        },
        none.modelCapabilities
      ],
      [
        { supports: { vision: false } },
        void 0,
        {
          availableTools: ["custom:*"],
          excludedTools: ["mcp:*"],
          modelCapabilities: { supports: { vision: true } }
        },
        void 0
      ]
    );
    store.dispose();
  });
  test("maps tool-search reference names to the SDK runtime name", async () => {
    const store = new DisposableStore();
    const model = { id: "gpt-5", config: { thinkingLevel: "medium" } };
    const config = await buildResumeConfig(createLauncher(store, {
      modelCapabilityOverrides: {
        "gpt-5": {
          availableTools: [CLIENT_TOOL_SEARCH_REFERENCE_NAME],
          excludedTools: [`custom:${CLIENT_TOOL_SEARCH_REFERENCE_NAME}`]
        }
      }
    }), model);
    assert.deepStrictEqual(
      [config.availableTools, config.excludedTools],
      [[RUNTIME_TOOL_SEARCH_TOOL_NAME], [`custom:${RUNTIME_TOOL_SEARCH_TOOL_NAME}`]]
    );
    store.dispose();
  });
  test("tool search gates on the flag, model support, and the family alias", async () => {
    const store = new DisposableStore();
    const searchSnapshot = {
      tools: [{ name: CLIENT_TOOL_SEARCH_REFERENCE_NAME, description: "Search tools", inputSchema: { type: "object", properties: {} } }],
      plugins: [],
      mcpServers: {}
    };
    const toolSearchOf = async (values, model) => (await buildResumeConfig(createLauncher(store, values), model, searchSnapshot)).toolSearch;
    assert.deepStrictEqual(
      [
        // flag off → disabled even on a supported model
        await toolSearchOf({ toolSearchEnabled: false }, { id: "claude-opus-4.8" }),
        // unsupported model → disabled even with the flag on
        await toolSearchOf({ toolSearchEnabled: true }, { id: "preview-model-x" }),
        // a family alias makes an unsupported preview model tool-search-capable
        await toolSearchOf({ toolSearchEnabled: true, modelCapabilityOverrides: { "preview-model-x": { family: "claude-opus-4.8" } } }, { id: "preview-model-x" })
      ],
      [
        { enabled: false },
        { enabled: false },
        { enabled: true, deferThreshold: 1 }
      ]
    );
    store.dispose();
  });
  test("uses one launch-time tool-search decision for the config and client tools", async () => {
    const store = new DisposableStore();
    const decisions = [];
    const model = { id: "claude-opus-4.8", config: { thinkingLevel: "medium" } };
    const config = await buildResumeConfig(
      createLauncher(store, {
        toolSearchEnabled: true,
        modelCapabilityOverrides: { "claude-opus-4.8": { availableTools: ["custom:*"] } }
      }),
      model,
      {
        tools: [{ name: CLIENT_TOOL_SEARCH_REFERENCE_NAME, description: "Search tools", inputSchema: { type: "object", properties: {} } }],
        plugins: [],
        mcpServers: {}
      },
      (toolSearchActive) => {
        decisions.push(toolSearchActive);
        return [];
      }
    );
    assert.deepStrictEqual({ config: config.toolSearch, decisions }, {
      config: { enabled: true, deferThreshold: 1 },
      decisions: [true]
    });
    store.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90U2Vzc2lvbkxhdW5jaGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IENvcGlsb3RDbGllbnQsIENvcGlsb3RTZXNzaW9uLCBSZWFzb25pbmdTdW1tYXJ5LCBWZXJib3NpdHkgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBsdWdpbkZvcm1hdCB9IGZyb20gJy4uLy4uLy4uL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgdHlwZSB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnlva0xtQnJpZGdlQ29ubmVjdGlvbiwgSUJ5b2tMbUNoYXRSZXF1ZXN0LCBJQnlva0xtQ2hhdFJlc3VsdCwgSUJ5b2tMbU1vZGVsSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RCeW9rTG0uanMnO1xuaW1wb3J0IHR5cGUgeyBTY2hlbWFWYWx1ZXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdE1hbmFnZWRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90Q2xpQ29uZmlnS2V5LCBjb3BpbG90Q2xpQ29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RDbGlDb25maWcuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWFzb25pbmdFZmZvcnRMZXZlbHMgfSBmcm9tICcuLi8uLi9jb21tb24vcmVhc29uaW5nRWZmb3J0LmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIE1vZGVsU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSwgUlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUUgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbFNlYXJjaENvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBBY3RpdmVDbGllbnRUb29sU2V0IH0gZnJvbSAnLi4vLi4vbm9kZS9hY3RpdmVDbGllbnRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSwgSUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vbm9kZS9ieW9rTG1CcmlkZ2VSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBCeW9rTG1Qcm94eVNlcnZpY2UsIElCeW9rTG1Qcm94eVNlcnZpY2UsIHR5cGUgSUJ5b2tMbVByb3h5SGFuZGxlIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2J5b2tMbVByb3h5U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb3BpbG90UGx1Z2luSW5mbyB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90QWdlbnQuanMnO1xuaW1wb3J0IHsgQ29waWxvdFNlc3Npb25MYXVuY2hlciwgZmlsdGVyQ2xpZW50VG9vbE5hbWVzLCBnZXRDb3BpbG90UmVhc29uaW5nRWZmb3J0LCBpc0NvcGlsb3RSZWFzb25pbmdFZmZvcnQsIHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZywgbm9ybWFsaXplVG9vbEZpbHRlclBhdHRlcm5zLCByZXNvbHZlQ29uZmlndXJlZFJlYXNvbmluZ0VmZm9ydE92ZXJyaWRlLCByZXNvbHZlQ29waWxvdFJlYXNvbmluZ0VmZm9ydCwgdG9TZGtUb29sRmlsdGVyUGF0dGVybnMsIHR5cGUgQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuLCB0eXBlIElDb3BpbG90U2Vzc2lvblJ1bnRpbWUgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvY29waWxvdFNlc3Npb25MYXVuY2hlci5qcyc7XG5cbmNvbnN0IHRlc3RSdW50aW1lOiBJQ29waWxvdFNlc3Npb25SdW50aW1lID0ge1xuXHRoYW5kbGVQZXJtaXNzaW9uUmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcGVybWlzc2lvbiByZXF1ZXN0Jyk7IH0sXG5cdGhhbmRsZUV4aXRQbGFuTW9kZVJlcXVlc3Q6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGV4aXQgcGxhbiBtb2RlIHJlcXVlc3QnKTsgfSxcblx0aGFuZGxlVXNlcklucHV0UmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgdXNlciBpbnB1dCByZXF1ZXN0Jyk7IH0sXG5cdGhhbmRsZUVsaWNpdGF0aW9uUmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZWxpY2l0YXRpb24gcmVxdWVzdCcpOyB9LFxuXHRoYW5kbGVNY3BBdXRoUmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgTUNQIGF1dGggcmVxdWVzdCcpOyB9LFxuXHRyZXF1ZXN0VW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uOiBhc3luYyAoKSA9PiBmYWxzZSxcblx0aGFuZGxlUHJlVG9vbFVzZTogYXN5bmMgKCkgPT4geyB9LFxuXHRoYW5kbGVQb3N0VG9vbFVzZTogYXN5bmMgKCkgPT4geyB9LFxuXHRoYW5kbGVVc2VyUHJvbXB0U3VibWl0dGVkOiAoKSA9PiB1bmRlZmluZWQsXG5cdGNyZWF0ZUNsaWVudFNka1Rvb2xzOiAoKSA9PiBbXSxcblx0Y3JlYXRlU2VydmVyU2RrVG9vbHM6ICgpID0+IFtdLFxufTtcblxuY29uc3QgdGVzdFdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZShwcm9jZXNzLmN3ZCgpKTtcblxuZnVuY3Rpb24gY3JlYXRlVGVzdExhdW5jaGVyKG1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zPzogSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zLCByb290VmFsdWVzOiBQYXJ0aWFsPFJlY29yZDxDb3BpbG90Q2xpQ29uZmlnS2V5LCB1bmtub3duPj4gPSB7fSk6IENvcGlsb3RTZXNzaW9uTGF1bmNoZXIge1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IHtcblx0XHRnZXRSb290VmFsdWU6IChfc2NoZW1hOiB1bmtub3duLCBrZXk6IENvcGlsb3RDbGlDb25maWdLZXkpID0+IHJvb3RWYWx1ZXNba2V5XSxcblx0fSBhcyBQYXJ0aWFsPElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlPiBhcyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZTtcblx0cmV0dXJuIG5ldyBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyKFxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHsgcGVybWlzc2lvbnM6IG1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zID8/IHt9IH0gYXMgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsXG5cdFx0e30gYXMgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcixcblx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHR7fSBhcyBJRmlsZVNlcnZpY2UsXG5cdFx0eyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIHN0YXJ0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBwcm94eSBzdGFydCcpOyB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfSxcblx0XHRuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKSxcblx0XHR7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRnZXRTZXNzaW9uVHJhY2VDb250ZXh0OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRyZWxlYXNlU2Vzc2lvblRyYWNlQ29udGV4dDogKCkgPT4geyB9LFxuXHRcdFx0d2l0aFRyYWNlQ29udGV4dDogPFQ+KF9jb250ZXh0OiB1bmRlZmluZWQsIGZuOiAoKSA9PiBUKTogVCA9PiBmbigpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0T1RlbFNlcnZpY2UsXG5cdCk7XG59XG5cbi8qKlxuICogQ292ZXJzIHRoZSBCWU9LIHByb3ZpZGVyL21vZGVsIHN5bnRoZXNpcyB0aGUgbGF1bmNoZXIgZmVlZHMgaW50b1xuICogYGNyZWF0ZVNlc3Npb25gIC8gYHJlc3VtZVNlc3Npb25gLiBUaGUgZmlyc3QgZm91ciB0ZXN0cyBwaW4gdGhlIGdhdGluZyBhbmRcbiAqIGdyYWNlZnVsLWRlZ3JhZGF0aW9uIGJyYW5jaGVzIHBsdXMgdGhlIGV4YWN0IFNESyBjb25maWcgc2hhcGUgdXNpbmcgYSByZWFsXG4gKiB7QGxpbmsgQnlva0xtQnJpZGdlUmVnaXN0cnl9IGFuZCBhIGNvdW50aW5nIHByb3h5IHRodW5rIChubyByZWFsIHByb3h5KS4gVGhlXG4gKiBsYXN0IHRlc3Qgd2lyZXMgdGhlIHN5bnRoZXNpemVkIGNvbmZpZyBzdHJhaWdodCBpbnRvIGEgbGl2ZVxuICoge0BsaW5rIEJ5b2tMbVByb3h5U2VydmljZX0gYW5kIFBPU1RzIGF0IGl0LCBwcm92aW5nIHRoZSBsYXVuY2hlcidzIG91dHB1dCBpc1xuICogY29uc3VtYWJsZSBlbmQtdG8tZW5kOiBwcm92aWRlciBgYmFzZVVybGAgKyBgQmVhcmVyIDxub25jZT4uPHNlc3Npb25JZD5gICtcbiAqIGBtb2RlbCA9IGlkYCByb3V0ZSB0aHJvdWdoIHRoZSBwcm94eSB0byB0aGUgcmVuZGVyZXIgYnJpZGdlLlxuICovXG5zdWl0ZSgncmVzb2x2ZUJ5b2tTZXNzaW9uQ29uZmlnJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Nlc3MtMSc7XG5cdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdC8qKlxuXHQgKiBBIGJyaWRnZSBjb25uZWN0aW9uIHRoYXQgcHVzaGVzIGBtb2RlbHNgIGFzIGl0cyBzbmFwc2hvdCBzeW5jaHJvbm91c2x5IHdoZW5cblx0ICogdGhlIHJlZ2lzdHJ5IHN1YnNjcmliZXM7IGBjaGF0YCBpcyBzY3JpcHRlZCAodW51c2VkIGJ5IG1vc3QgdGVzdHMpLlxuXHQgKi9cblx0ZnVuY3Rpb24gY29ubmVjdGlvbk9mKG1vZGVsczogSUJ5b2tMbU1vZGVsSW5mb1tdLCBjaGF0OiBJQnlva0xtQnJpZGdlQ29ubmVjdGlvblsnY2hhdCddID0gYXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSB9KSk6IElCeW9rTG1CcmlkZ2VDb25uZWN0aW9uIHtcblx0XHRjb25zdCBlbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElCeW9rTG1Nb2RlbEluZm9bXT4oe1xuXHRcdFx0b25EaWRBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiBlbWl0dGVyLmZpcmUobW9kZWxzKSxcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHsgY2hhdCwgb25EaWRDaGFuZ2VNb2RlbHM6IGVtaXR0ZXIuZXZlbnQgfTtcblx0fVxuXG5cdC8qKiBBIGZha2UgcHJveHkgaGFuZGxlIHBsdXMgYSBgc3RhcnRQcm94eWAgdGh1bmsgdGhhdCByZWNvcmRzIGl0cyBjYWxsIGNvdW50LiAqL1xuXHRmdW5jdGlvbiBjb3VudGluZ1Byb3h5KCkge1xuXHRcdGxldCBzdGFydHMgPSAwO1xuXHRcdGNvbnN0IGhhbmRsZTogSUJ5b2tMbVByb3h5SGFuZGxlID0ge1xuXHRcdFx0YmFzZVVybDogJ2h0dHA6Ly8xMjcuMC4wLjE6MScsXG5cdFx0XHRub25jZTogJ05PTkNFJyxcblx0XHRcdHByb3ZpZGVyQmFzZVVybDogdmVuZG9yID0+IGBodHRwOi8vMTI3LjAuMC4xOjEvdi8ke3ZlbmRvcn1gLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldCBzdGFydHMoKSB7IHJldHVybiBzdGFydHM7IH0sXG5cdFx0XHRzdGFydFByb3h5OiBhc3luYyAoKSA9PiB7IHN0YXJ0cysrOyByZXR1cm4gaGFuZGxlOyB9LFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGFuZCBuZXZlciBzdGFydHMgdGhlIHByb3h5IHdoZW4gbm8gYnJpZGdlIGlzIGFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IHByb3h5ID0gY291bnRpbmdQcm94eSgpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgcmVzb2x2ZUJ5b2tTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCwgcmVnaXN0cnksIHByb3h5LnN0YXJ0UHJveHksIGxvZyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZywge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS5zdGFydHMsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGFuZCBuZXZlciBzdGFydHMgdGhlIHByb3h5IHdoZW4gdGhlIGJyaWRnZSByZXBvcnRzIG5vIG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtMScsIGNvbm5lY3Rpb25PZihbXSkpO1xuXHRcdGNvbnN0IHByb3h5ID0gY291bnRpbmdQcm94eSgpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgcmVzb2x2ZUJ5b2tTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCwgcmVnaXN0cnksIHByb3h5LnN0YXJ0UHJveHksIGxvZyk7XG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnLCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5LnN0YXJ0cywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgYW5kIG5ldmVyIHN0YXJ0cyB0aGUgcHJveHkgZm9yIGEgd2luZG93IHRoYXQgbmV2ZXIgcHVzaGVzIGEgc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHQvLyBBIHdpbmRvdyBjb25uZWN0ZWQgd2l0aG91dCBhIEJZT0sgaGFuZGxlciBuZXZlciBwdXNoZXMsIHNvIGl0IHN0YXlzXG5cdFx0Ly8gbm9uLXNlcnZpbmcgYW5kIGNvbnRyaWJ1dGVzIG5vIG1vZGVscy5cblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSByZWdpc3RyeS5yZWdpc3RlcignY2xpZW50LTEnLCB7IGNoYXQ6IGFzeW5jICgpOiBQcm9taXNlPElCeW9rTG1DaGF0UmVzdWx0PiA9PiAoeyBvdXRwdXQ6IFtdIH0pLCBvbkRpZENoYW5nZU1vZGVsczogRXZlbnQuTm9uZSB9KTtcblx0XHRjb25zdCBwcm94eSA9IGNvdW50aW5nUHJveHkoKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQsIHJlZ2lzdHJ5LCBwcm94eS5zdGFydFByb3h5LCBsb2cpO1xuXHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZywge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS5zdGFydHMsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW50aGVzaXplcyBkZWR1cGVkIHByb3ZpZGVycyBhbmQgcGVyLW1vZGVsIGNvbmZpZyBmcm9tIHRoZSBhY3RpdmUgYnJpZGdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2NsaWVudC0xJywgY29ubmVjdGlvbk9mKFtcblx0XHRcdHsgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJywgbmFtZTogJ0FjbWUgQ2xhdWRlJywgbWF4Q29udGV4dFdpbmRvd1Rva2VuczogMjAwMDAwIH0sXG5cdFx0XHR7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2dwdCcsIG5hbWU6IHVuZGVmaW5lZCwgbWF4Q29udGV4dFdpbmRvd1Rva2VuczogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IHZlbmRvcjogJ2dsb2JleCcsIGlkOiAnbGxhbWEnLCBuYW1lOiAnR2xvYmV4IExsYW1hJyB9LFxuXHRcdF0pKTtcblx0XHRjb25zdCBwcm94eSA9IGNvdW50aW5nUHJveHkoKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQsIHJlZ2lzdHJ5LCBwcm94eS5zdGFydFByb3h5LCBsb2cpO1xuXHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuc3RhcnRzLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZywge1xuXHRcdFx0cHJvdmlkZXJzOiBbXG5cdFx0XHRcdHsgbmFtZTogJ2FjbWUnLCB0eXBlOiAnb3BlbmFpJywgd2lyZUFwaTogJ3Jlc3BvbnNlcycsIGJhc2VVcmw6ICdodHRwOi8vMTI3LjAuMC4xOjEvdi9hY21lJywgYmVhcmVyVG9rZW46ICdOT05DRS5zZXNzLTEnIH0sXG5cdFx0XHRcdHsgbmFtZTogJ2dsb2JleCcsIHR5cGU6ICdvcGVuYWknLCB3aXJlQXBpOiAncmVzcG9uc2VzJywgYmFzZVVybDogJ2h0dHA6Ly8xMjcuMC4wLjE6MS92L2dsb2JleCcsIGJlYXJlclRva2VuOiAnTk9OQ0Uuc2Vzcy0xJyB9LFxuXHRcdFx0XSxcblx0XHRcdG1vZGVsczogW1xuXHRcdFx0XHR7IGlkOiAnY2xhdWRlJywgcHJvdmlkZXI6ICdhY21lJywgbmFtZTogJ0FjbWUgQ2xhdWRlJywgbWF4Q29udGV4dFdpbmRvd1Rva2VuczogMjAwMDAwIH0sXG5cdFx0XHRcdHsgaWQ6ICdncHQnLCBwcm92aWRlcjogJ2FjbWUnIH0sXG5cdFx0XHRcdHsgaWQ6ICdsbGFtYScsIHByb3ZpZGVyOiAnZ2xvYmV4JywgbmFtZTogJ0dsb2JleCBMbGFtYScgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBwcm92aWRlciBncm91cHMgd2hlbiBtb2RlbHMgc2hhcmUgYSB2ZW5kb3IgYW5kIGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2NsaWVudC0xJywgY29ubmVjdGlvbk9mKFtcblx0XHRcdHsgdmVuZG9yOiAnZ29vZ2xlJywgaWQ6ICdnZW1pbmktMi41LXBybycsIG1vZGVsSWRlbnRpZmllcjogJ2dvb2dsZS9HZW1pbmkgUGVyc29uYWwvZ2VtaW5pLTIuNS1wcm8nIH0sXG5cdFx0XHR7IHZlbmRvcjogJ2dvb2dsZScsIGlkOiAnZ2VtaW5pLTIuNS1wcm8nLCBtb2RlbElkZW50aWZpZXI6ICdnb29nbGUvR2VtaW5pIFdvcmsvZ2VtaW5pLTIuNS1wcm8nIH0sXG5cdFx0XSkpO1xuXHRcdGNvbnN0IHByb3h5ID0gY291bnRpbmdQcm94eSgpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgcmVzb2x2ZUJ5b2tTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCwgcmVnaXN0cnksIHByb3h5LnN0YXJ0UHJveHksIGxvZyk7XG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnLm1vZGVscywgW1xuXHRcdFx0eyBpZDogJ0dlbWluaSBQZXJzb25hbC9nZW1pbmktMi41LXBybycsIHByb3ZpZGVyOiAnZ29vZ2xlJyB9LFxuXHRcdFx0eyBpZDogJ0dlbWluaSBXb3JrL2dlbWluaS0yLjUtcHJvJywgcHJvdmlkZXI6ICdnb29nbGUnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bnRoZXNpemVkIHByb3ZpZGVyIGNvbmZpZyByb3V0ZXMgdGhyb3VnaCBhIGxpdmUgcHJveHkgdG8gdGhlIGJyaWRnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGxldCBjYXB0dXJlZDogSUJ5b2tMbUNoYXRSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtMScsIGNvbm5lY3Rpb25PZihcblx0XHRcdFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScgfV0sXG5cdFx0XHRhc3luYyAocmVxdWVzdCkgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZCA9IHJlcXVlc3Q7XG5cdFx0XHRcdHJldHVybiB7IG91dHB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoZWxsbyBmcm9tIGJ5b2snIH1dIH1dIH07XG5cdFx0XHR9LFxuXHRcdCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgQnlva0xtUHJveHlTZXJ2aWNlKGxvZywgcmVnaXN0cnkpO1xuXHRcdGxldCBoYW5kbGU6IElCeW9rTG1Qcm94eUhhbmRsZSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQsIHJlZ2lzdHJ5LCBhc3luYyAoKSA9PiAoaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydCgpKSwgbG9nKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNvbmZpZy5wcm92aWRlcnMhWzBdO1xuXHRcdGNvbnN0IG1vZGVsID0gY29uZmlnLm1vZGVscyFbMF07XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7cHJvdmlkZXIuYmFzZVVybH0vcmVzcG9uc2VzYCwge1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0aGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtwcm92aWRlci5iZWFyZXJUb2tlbn1gIH0sXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6IG1vZGVsLmlkLCBpbnB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICdpbnB1dF90ZXh0JywgdGV4dDogJ2hpJyB9XSB9XSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgMjAwKTtcblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnaGVsbG8gZnJvbSBieW9rJyksIGBleHBlY3RlZCBjb250ZW50IGluIFNTRTogJHt0ZXh0fWApO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRoYW5kbGU/LmRpc3Bvc2UoKTtcblx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkPy52ZW5kb3IsICdhY21lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkPy5tb2RlbElkLCAnY2xhdWRlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRzIHRoZSBsYXRlc3QgcHVzaGVkIHNuYXBzaG90IGZyb20gdGhlIHJlZ2lzdHJ5IGNhY2hlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQnlva0xtTW9kZWxJbmZvW10+KCkpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtMScsIHtcblx0XHRcdGNoYXQ6IGFzeW5jICgpOiBQcm9taXNlPElCeW9rTG1DaGF0UmVzdWx0PiA9PiAoeyBvdXRwdXQ6IFtdIH0pLFxuXHRcdFx0b25EaWRDaGFuZ2VNb2RlbHM6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJveHkgPSBjb3VudGluZ1Byb3h5KCk7XG5cblx0XHQvLyBUaGUgd2luZG93IHN0YXJ0cyBzZXJ2aW5nLWJ1dC1lbXB0eSwgdGhlbiBwdXNoZXMgYSBtb2RlbDsgdGhlIHJlc29sdmVkXG5cdFx0Ly8gY29uZmlnIHJlZmxlY3RzIHRoZSBsYXRlc3QgY2FjaGVkIHB1c2ggd2l0aCBubyByZW5kZXJlciByb3VuZC10cmlwLlxuXHRcdGVtaXR0ZXIuZmlyZShbXSk7XG5cdFx0ZW1pdHRlci5maXJlKFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScsIG5hbWU6ICdBY21lIENsYXVkZScgfV0pO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgcmVzb2x2ZUJ5b2tTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCwgcmVnaXN0cnksIHByb3h5LnN0YXJ0UHJveHksIGxvZyk7XG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnLm1vZGVscywgW3sgaWQ6ICdjbGF1ZGUnLCBwcm92aWRlcjogJ2FjbWUnLCBuYW1lOiAnQWNtZSBDbGF1ZGUnIH1dKTtcblx0fSk7XG59KTtcblxuLyoqXG4gKiBDb3ZlcnMgdGhlIGxhdW5jaGVyJ3MgbGF6eSBtZW1vaXphdGlvbiBhbmQgZGlzcG9zYWwgb2YgdGhlIHNoYXJlZCBCWU9LIHByb3h5XG4gKiBoYW5kbGU6IGNvbmN1cnJlbnQgbGF1bmNoZXMgc2hhcmUgb25lIGJpbmQsIGFuZFxuICoge0BsaW5rIENvcGlsb3RTZXNzaW9uTGF1bmNoZXIuZGlzcG9zZUJ5b2tQcm94eUhhbmRsZX0gKGNhbGxlZCBieSB0aGUgYWdlbnRcbiAqIGFmdGVyIHRoZSBydW50aW1lIHN1YnByb2Nlc3Mgc3RvcHMpIHJlbGVhc2VzIGl0IHNvIHRoZSBuZXh0IGxhdW5jaCBtaW50cyBhXG4gKiBmcmVzaCBub25jZS5cbiAqL1xuc3VpdGUoJ0NvcGlsb3RTZXNzaW9uTGF1bmNoZXIgQllPSyBwcm94eSBsaWZlY3ljbGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Nlc3MtMSc7XG5cblx0LyoqXG5cdCAqIEEgYnJpZGdlIGNvbm5lY3Rpb24gdGhhdCBwdXNoZXMgYG1vZGVsc2AgYXMgaXRzIHNuYXBzaG90IHN5bmNocm9ub3VzbHkgd2hlblxuXHQgKiB0aGUgcmVnaXN0cnkgc3Vic2NyaWJlczsgdGhlIGJhY2tpbmcgZW1pdHRlciBpcyBvd25lZCBieSBgc3RvcmVgLlxuXHQgKi9cblx0ZnVuY3Rpb24gY29ubmVjdGlvbk9mKHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIG1vZGVsczogSUJ5b2tMbU1vZGVsSW5mb1tdKTogSUJ5b2tMbUJyaWRnZUNvbm5lY3Rpb24ge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUJ5b2tMbU1vZGVsSW5mb1tdPih7XG5cdFx0XHRvbkRpZEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IGVtaXR0ZXIuZmlyZShtb2RlbHMpLFxuXHRcdH0pKTtcblx0XHRyZXR1cm4geyBjaGF0OiBhc3luYyAoKTogUHJvbWlzZTxJQnlva0xtQ2hhdFJlc3VsdD4gPT4gKHsgb3V0cHV0OiBbXSB9KSwgb25EaWRDaGFuZ2VNb2RlbHM6IGVtaXR0ZXIuZXZlbnQgfTtcblx0fVxuXG5cdC8qKiBBIGZha2UgcHJveHkgc2VydmljZSB3aG9zZSBoYW5kbGVzIGNhcnJ5IGEgdW5pcXVlIG5vbmNlIHBlciBgc3RhcnQoKWAuICovXG5cdGZ1bmN0aW9uIGZha2VQcm94eVNlcnZpY2UoKSB7XG5cdFx0bGV0IHN0YXJ0cyA9IDA7XG5cdFx0bGV0IGRpc3Bvc2VzID0gMDtcblx0XHRjb25zdCBzZXJ2aWNlOiBJQnlva0xtUHJveHlTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c3RhcnQ6IGFzeW5jICgpOiBQcm9taXNlPElCeW9rTG1Qcm94eUhhbmRsZT4gPT4ge1xuXHRcdFx0XHRjb25zdCBub25jZSA9IGBOT05DRS0keysrc3RhcnRzfWA7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0YmFzZVVybDogJ2h0dHA6Ly8xMjcuMC4wLjE6MScsXG5cdFx0XHRcdFx0bm9uY2UsXG5cdFx0XHRcdFx0cHJvdmlkZXJCYXNlVXJsOiB2ZW5kb3IgPT4gYGh0dHA6Ly8xMjcuMC4wLjE6MS92LyR7dmVuZG9yfWAsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyBkaXNwb3NlcysrOyB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdHJldHVybiB7IHNlcnZpY2UsIGdldCBzdGFydHMoKSB7IHJldHVybiBzdGFydHM7IH0sIGdldCBkaXNwb3NlcygpIHsgcmV0dXJuIGRpc3Bvc2VzOyB9IH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVMYXVuY2hlcihzdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBwcm94eTogSUJ5b2tMbVByb3h5U2VydmljZSwgcmVnaXN0cnk6IElCeW9rTG1CcmlkZ2VSZWdpc3RyeSk6IENvcGlsb3RTZXNzaW9uTGF1bmNoZXIge1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElCeW9rTG1Qcm94eVNlcnZpY2UsIHByb3h5KTtcblx0XHRzZXJ2aWNlcy5zZXQoSUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5LCByZWdpc3RyeSk7XG5cdFx0Ly8gVGhlIGxhdW5jaGVyJ3Mgb3RoZXIgZGVwZW5kZW5jaWVzIGFyZSB1bnVzZWQgYnkgdGhlIEJZT0sgcGF0aCBhbmRcblx0XHQvLyByZXNvbHZlIHRvIGB1bmRlZmluZWRgIHVuZGVyIHRoZSBub24tc3RyaWN0IEluc3RhbnRpYXRpb25TZXJ2aWNlLlxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90U2Vzc2lvbkxhdW5jaGVyKTtcblx0fVxuXG5cdHRlc3QoJ21lbW9pemVzIHRoZSBoYW5kbGUsIGFuZCBkaXNwb3NlQnlva1Byb3h5SGFuZGxlIHJlbGVhc2VzIGl0IHNvIHRoZSBuZXh0IGxhdW5jaCBtaW50cyBhIGZyZXNoIG5vbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHByb3h5ID0gZmFrZVByb3h5U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtMScsIGNvbm5lY3Rpb25PZihzdG9yZSwgW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJyB9XSkpKTtcblx0XHRjb25zdCBsYXVuY2hlciA9IGNyZWF0ZUxhdW5jaGVyKHN0b3JlLCBwcm94eS5zZXJ2aWNlLCByZWdpc3RyeSk7XG5cdFx0Y29uc3QgcmVzb2x2ZSA9ICgpID0+IChsYXVuY2hlciBhcyB1bmtub3duIGFzIHsgX3Jlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhpZDogc3RyaW5nKTogUHJvbWlzZTx7IHByb3ZpZGVycz86IHsgYmVhcmVyVG9rZW46IHN0cmluZyB9W10gfT4gfSkuX3Jlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCByZXNvbHZlKCk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgcmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS5zdGFydHMsIDEsICdzdWJzZXF1ZW50IGxhdW5jaGVzIHNoYXJlIHRoZSBtZW1vaXplZCBiaW5kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnByb3ZpZGVycyFbMF0uYmVhcmVyVG9rZW4sIHNlY29uZC5wcm92aWRlcnMhWzBdLmJlYXJlclRva2VuLCAndGhlIHNoYXJlZCBiaW5kIHJldXNlcyBvbmUgbm9uY2UnKTtcblxuXHRcdGF3YWl0IGxhdW5jaGVyLmRpc3Bvc2VCeW9rUHJveHlIYW5kbGUoKTtcblx0XHRhd2FpdCBsYXVuY2hlci5kaXNwb3NlQnlva1Byb3h5SGFuZGxlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5LmRpc3Bvc2VzLCAxLCAndGhlIGhhbmRsZSBpcyByZWxlYXNlZCBleGFjdGx5IG9uY2UgYW5kIGRpc3Bvc2FsIGlzIGlkZW1wb3RlbnQnKTtcblxuXHRcdGNvbnN0IHRoaXJkID0gYXdhaXQgcmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS5zdGFydHMsIDIsICdhIGZyZXNoIGJpbmQgaXMgbWludGVkIGFmdGVyIGRpc3Bvc2FsJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRoaXJkLnByb3ZpZGVycyFbMF0uYmVhcmVyVG9rZW4sIGZpcnN0LnByb3ZpZGVycyFbMF0uYmVhcmVyVG9rZW4sICd0aGUgZnJlc2ggYmluZCBjYXJyaWVzIGEgbmV3IG5vbmNlJyk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIHNoYXJlZCBzZXNzaW9uIGNvbmZpZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXNzZXMgQWdlbnQgSG9zdCBkZWZhdWx0cywgbWFuYWdlZCBwZXJtaXNzaW9ucywgYW5kIGV4aXQtcGxhbiBoYW5kbGVyIHRvIGNyZWF0ZSBhbmQgcmVzdW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZUNvbmZpZ3M6IFBhcmFtZXRlcnM8Q29waWxvdENsaWVudFsnY3JlYXRlU2Vzc2lvbiddPlswXVtdID0gW107XG5cdFx0Y29uc3QgcmVzdW1lQ29uZmlnczogUGFyYW1ldGVyczxDb3BpbG90Q2xpZW50WydyZXN1bWVTZXNzaW9uJ10+WzFdW10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdG9uOiAoKSA9PiAoKSA9PiB7IH0sXG5cdFx0XHRkaXNjb25uZWN0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXHRcdGNvbnN0IGNsaWVudCA9IHtcblx0XHRcdGNyZWF0ZVNlc3Npb246IGFzeW5jIChjb25maWc6IFBhcmFtZXRlcnM8Q29waWxvdENsaWVudFsnY3JlYXRlU2Vzc2lvbiddPlswXSkgPT4ge1xuXHRcdFx0XHRjcmVhdGVDb25maWdzLnB1c2goY29uZmlnKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9LFxuXHRcdFx0cmVzdW1lU2Vzc2lvbjogYXN5bmMgKF9zZXNzaW9uSWQ6IHN0cmluZywgY29uZmlnOiBQYXJhbWV0ZXJzPENvcGlsb3RDbGllbnRbJ3Jlc3VtZVNlc3Npb24nXT5bMV0pID0+IHtcblx0XHRcdFx0cmVzdW1lQ29uZmlncy5wdXNoKGNvbmZpZyk7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IG1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zOiBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMgPSB7XG5cdFx0XHRkaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlOiAnZGlzYWJsZScsXG5cdFx0XHRhc2s6IFsnU2hlbGwnXSxcblx0XHR9O1xuXHRcdGNvbnN0IGxhdW5jaGVyID0gY3JlYXRlVGVzdExhdW5jaGVyKG1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zKTtcblx0XHRjb25zdCBwbHVnaW5EaXIgPSBVUkkuZmlsZSgnL3RtcC9zeW5jZWQtY3VzdG9taXphdGlvbnMnKTtcblx0XHRjb25zdCBza2lsbFVyaSA9IFVSSS5qb2luUGF0aChwbHVnaW5EaXIsICdza2lsbHMnLCAndXNlci1za2lsbCcsICdTS0lMTC5tZCcpO1xuXHRcdGNvbnN0IGluc3RydWN0aW9uVXJpID0gVVJJLmpvaW5QYXRoKHBsdWdpbkRpciwgJ3J1bGVzJywgJ3VzZXIuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0Y29uc3QgcGx1Z2luOiBJQ29waWxvdFBsdWdpbkluZm8gPSB7XG5cdFx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdFx0aG9va3M6IFtdLFxuXHRcdFx0bWNwU2VydmVyczogW10sXG5cdFx0XHRkaXNhYmxlZE1jcFNlcnZlcnM6IFsnYXp1cmUnLCAnYXp1cmUnXSxcblx0XHRcdGFnZW50czogW10sXG5cdFx0XHRza2lsbHM6IFt7XG5cdFx0XHRcdHVyaTogc2tpbGxVcmksXG5cdFx0XHRcdG5hbWU6ICd1c2VyLXNraWxsJyxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgaWQ6IHNraWxsVXJpLnRvU3RyaW5nKCksIHVyaTogc2tpbGxVcmkudG9TdHJpbmcoKSwgbmFtZTogJ3VzZXItc2tpbGwnIH0sXG5cdFx0XHR9XSxcblx0XHRcdGluc3RydWN0aW9uczogW3tcblx0XHRcdFx0dXJpOiBpbnN0cnVjdGlvblVyaSxcblx0XHRcdFx0bmFtZTogJ3VzZXInLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUsIGlkOiBpbnN0cnVjdGlvblVyaS50b1N0cmluZygpLCB1cmk6IGluc3RydWN0aW9uVXJpLnRvU3RyaW5nKCksIG5hbWU6ICd1c2VyJywgYWx3YXlzQXBwbHk6IHRydWUgfSxcblx0XHRcdH1dLFxuXHRcdFx0cGx1Z2luRGlyLFxuXHRcdH07XG5cdFx0Y29uc3QgYmFzZVBsYW4gPSB7XG5cdFx0XHRjbGllbnQsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdGVzdFdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRyZXNvbHZlZEFnZW50TmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0c25hcHNob3Q6IHsgdG9vbHM6IFtdLCBwbHVnaW5zOiBbcGx1Z2luXSwgbWNwU2VydmVyczoge30gfSxcblx0XHRcdGRpc2FibGVkUm9vdE1jcFNlcnZlcnM6IFsnZ2l0aHViJywgJ2F6dXJlJ10sXG5cdFx0XHRhY3RpdmVDbGllbnRUb29sU2V0OiBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpLFxuXHRcdFx0c2hlbGxNYW5hZ2VyOiB1bmRlZmluZWQsXG5cdFx0XHRnaXRodWJUb2tlbjogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgY3JlYXRlUGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuID0ge1xuXHRcdFx0Li4uYmFzZVBsYW4sXG5cdFx0XHRraW5kOiAnY3JlYXRlJyxcblx0XHRcdG1vZGVsOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bWVQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4gPSB7XG5cdFx0XHQuLi5iYXNlUGxhbixcblx0XHRcdGtpbmQ6ICdyZXN1bWUnLFxuXHRcdFx0ZmFsbGJhY2s6IHsgbW9kZWw6IHVuZGVmaW5lZCB9LFxuXHRcdH07XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0c2Vzc2lvbnMuYWRkKGF3YWl0IGxhdW5jaGVyLmxhdW5jaChjcmVhdGVQbGFuLCB0ZXN0UnVudGltZSkpO1xuXHRcdFx0c2Vzc2lvbnMuYWRkKGF3YWl0IGxhdW5jaGVyLmxhdW5jaChyZXN1bWVQbGFuLCB0ZXN0UnVudGltZSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y3JlYXRlQ2xpZW50TmFtZTogY3JlYXRlQ29uZmlnc1swXS5jbGllbnROYW1lLFxuXHRcdFx0XHRjcmVhdGVHaXRIdWJNY3BUb29sQ29uZmlnOiBjcmVhdGVDb25maWdzWzBdLmdpdGh1Yk1jcFRvb2xDb25maWcsXG5cdFx0XHRcdGNyZWF0ZVBsdWdpbkRpcmVjdG9yaWVzOiBjcmVhdGVDb25maWdzWzBdLnBsdWdpbkRpcmVjdG9yaWVzLFxuXHRcdFx0XHRjcmVhdGVTa2lsbERpcmVjdG9yaWVzOiBjcmVhdGVDb25maWdzWzBdLnNraWxsRGlyZWN0b3JpZXMsXG5cdFx0XHRcdGNyZWF0ZUluc3RydWN0aW9uRGlyZWN0b3JpZXM6IGNyZWF0ZUNvbmZpZ3NbMF0uaW5zdHJ1Y3Rpb25EaXJlY3Rvcmllcyxcblx0XHRcdFx0Y3JlYXRlRGlzYWJsZWRNY3BTZXJ2ZXJzOiBjcmVhdGVDb25maWdzWzBdLmRpc2FibGVkTWNwU2VydmVycyxcblx0XHRcdFx0Y3JlYXRlSGFzRXhpdFBsYW5IYW5kbGVyOiB0eXBlb2YgY3JlYXRlQ29uZmlnc1swXS5vbkV4aXRQbGFuTW9kZVJlcXVlc3QgPT09ICdmdW5jdGlvbicsXG5cdFx0XHRcdGNyZWF0ZUxhcmdlT3V0cHV0OiBjcmVhdGVDb25maWdzWzBdLmxhcmdlT3V0cHV0LFxuXHRcdFx0XHRjcmVhdGVNYW5hZ2VkU2V0dGluZ3M6IGNyZWF0ZUNvbmZpZ3NbMF0ubWFuYWdlZFNldHRpbmdzLFxuXHRcdFx0XHRyZXN1bWVDbGllbnROYW1lOiByZXN1bWVDb25maWdzWzBdLmNsaWVudE5hbWUsXG5cdFx0XHRcdHJlc3VtZUdpdEh1Yk1jcFRvb2xDb25maWc6IHJlc3VtZUNvbmZpZ3NbMF0uZ2l0aHViTWNwVG9vbENvbmZpZyxcblx0XHRcdFx0cmVzdW1lUGx1Z2luRGlyZWN0b3JpZXM6IHJlc3VtZUNvbmZpZ3NbMF0ucGx1Z2luRGlyZWN0b3JpZXMsXG5cdFx0XHRcdHJlc3VtZVNraWxsRGlyZWN0b3JpZXM6IHJlc3VtZUNvbmZpZ3NbMF0uc2tpbGxEaXJlY3Rvcmllcyxcblx0XHRcdFx0cmVzdW1lSW5zdHJ1Y3Rpb25EaXJlY3RvcmllczogcmVzdW1lQ29uZmlnc1swXS5pbnN0cnVjdGlvbkRpcmVjdG9yaWVzLFxuXHRcdFx0XHRyZXN1bWVEaXNhYmxlZE1jcFNlcnZlcnM6IHJlc3VtZUNvbmZpZ3NbMF0uZGlzYWJsZWRNY3BTZXJ2ZXJzLFxuXHRcdFx0XHRyZXN1bWVIYXNFeGl0UGxhbkhhbmRsZXI6IHR5cGVvZiByZXN1bWVDb25maWdzWzBdLm9uRXhpdFBsYW5Nb2RlUmVxdWVzdCA9PT0gJ2Z1bmN0aW9uJyxcblx0XHRcdFx0cmVzdW1lTGFyZ2VPdXRwdXQ6IHJlc3VtZUNvbmZpZ3NbMF0ubGFyZ2VPdXRwdXQsXG5cdFx0XHRcdHJlc3VtZU1hbmFnZWRTZXR0aW5nczogcmVzdW1lQ29uZmlnc1swXS5tYW5hZ2VkU2V0dGluZ3MsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNyZWF0ZUNsaWVudE5hbWU6ICd2c2NvZGUtYWdlbnQtaG9zdCcsXG5cdFx0XHRcdGNyZWF0ZUdpdEh1Yk1jcFRvb2xDb25maWc6IHsgZGlzYWJsZUZvcm1EZWZlcnJhbDogdHJ1ZSB9LFxuXHRcdFx0XHRjcmVhdGVQbHVnaW5EaXJlY3RvcmllczogW3BsdWdpbkRpci5mc1BhdGhdLFxuXHRcdFx0XHRjcmVhdGVTa2lsbERpcmVjdG9yaWVzOiBbXSxcblx0XHRcdFx0Y3JlYXRlSW5zdHJ1Y3Rpb25EaXJlY3RvcmllczogW1VSSS5qb2luUGF0aChwbHVnaW5EaXIsICdydWxlcycpLmZzUGF0aF0sXG5cdFx0XHRcdGNyZWF0ZURpc2FibGVkTWNwU2VydmVyczogWydhenVyZScsICdnaXRodWInXSxcblx0XHRcdFx0Y3JlYXRlSGFzRXhpdFBsYW5IYW5kbGVyOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVMYXJnZU91dHB1dDogeyBtYXhTaXplQnl0ZXM6IDgxOTIgfSxcblx0XHRcdFx0Y3JlYXRlTWFuYWdlZFNldHRpbmdzOiB7IHBlcm1pc3Npb25zOiBtYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucyB9LFxuXHRcdFx0XHRyZXN1bWVDbGllbnROYW1lOiAndnNjb2RlLWFnZW50LWhvc3QnLFxuXHRcdFx0XHRyZXN1bWVHaXRIdWJNY3BUb29sQ29uZmlnOiB7IGRpc2FibGVGb3JtRGVmZXJyYWw6IHRydWUgfSxcblx0XHRcdFx0cmVzdW1lUGx1Z2luRGlyZWN0b3JpZXM6IFtwbHVnaW5EaXIuZnNQYXRoXSxcblx0XHRcdFx0cmVzdW1lU2tpbGxEaXJlY3RvcmllczogW10sXG5cdFx0XHRcdHJlc3VtZUluc3RydWN0aW9uRGlyZWN0b3JpZXM6IFtVUkkuam9pblBhdGgocGx1Z2luRGlyLCAncnVsZXMnKS5mc1BhdGhdLFxuXHRcdFx0XHRyZXN1bWVEaXNhYmxlZE1jcFNlcnZlcnM6IFsnYXp1cmUnLCAnZ2l0aHViJ10sXG5cdFx0XHRcdHJlc3VtZUhhc0V4aXRQbGFuSGFuZGxlcjogdHJ1ZSxcblx0XHRcdFx0cmVzdW1lTGFyZ2VPdXRwdXQ6IHsgbWF4U2l6ZUJ5dGVzOiA4MTkyIH0sXG5cdFx0XHRcdHJlc3VtZU1hbmFnZWRTZXR0aW5nczogeyBwZXJtaXNzaW9uczogbWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMgfSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXNzaW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCBsYXVuY2hlci5kaXNwb3NlQnlva1Byb3h5SGFuZGxlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ29waWxvdFNlc3Npb25MYXVuY2hlciByZXN1bWUgZmFsbGJhY2snLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgVGVzdFNka0Vycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRcdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgcmVhZG9ubHkgY29kZTogbnVtYmVyKSB7XG5cdFx0XHRzdXBlcihtZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVSZXN1bWVGYWlsaW5nTGF1bmNoKG1lc3NhZ2U6IHN0cmluZywgY29kZSA9IC0zMjYwMyk6IHsgcmVhZG9ubHkgbGF1bmNoZXI6IENvcGlsb3RTZXNzaW9uTGF1bmNoZXI7IHJlYWRvbmx5IHBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbjsgcmVhZG9ubHkgZ2V0Q3JlYXRlU2Vzc2lvbkNhbGxzOiAoKSA9PiBudW1iZXIgfSB7XG5cdFx0bGV0IGNyZWF0ZVNlc3Npb25DYWxscyA9IDA7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRvbjogKCkgPT4gKCkgPT4geyB9LFxuXHRcdFx0ZGlzY29ubmVjdDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90U2Vzc2lvbjtcblx0XHRjb25zdCBjbGllbnQgPSB7XG5cdFx0XHRjcmVhdGVTZXNzaW9uOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNyZWF0ZVNlc3Npb25DYWxscysrO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH0sXG5cdFx0XHRyZXN1bWVTZXNzaW9uOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBUZXN0U2RrRXJyb3IobWVzc2FnZSwgY29kZSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhdW5jaGVyOiBjcmVhdGVUZXN0TGF1bmNoZXIoKSxcblx0XHRcdHBsYW46IHtcblx0XHRcdFx0Y2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB0ZXN0V29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0cmVzb2x2ZWRBZ2VudE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0c25hcHNob3Q6IHsgdG9vbHM6IFtdLCBwbHVnaW5zOiBbXSwgbWNwU2VydmVyczoge30gfSxcblx0XHRcdFx0YWN0aXZlQ2xpZW50VG9vbFNldDogbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKSxcblx0XHRcdFx0c2hlbGxNYW5hZ2VyOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdGh1YlRva2VuOiB1bmRlZmluZWQsXG5cdFx0XHRcdGtpbmQ6ICdyZXN1bWUnLFxuXHRcdFx0XHRmYWxsYmFjazogeyBtb2RlbDogdW5kZWZpbmVkIH0sXG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q3JlYXRlU2Vzc2lvbkNhbGxzOiAoKSA9PiBjcmVhdGVTZXNzaW9uQ2FsbHMsXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gY3JlYXRlU2Vzc2lvbiBhZnRlciBhIFN0YXJ0IE92ZXIgdHJ1bmNhdGUgbGVhdmVzIHRoZSBzZXNzaW9uIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbGF1bmNoZXIsIHBsYW4sIGdldENyZWF0ZVNlc3Npb25DYWxscyB9ID0gY3JlYXRlUmVzdW1lRmFpbGluZ0xhdW5jaChgUmVxdWVzdCBzZXNzaW9uLnJlc3VtZSBmYWlsZWQgd2l0aCBtZXNzYWdlOiBMb2NhbFJwY1Nlc3Npb246ICdzZXNzaW9uLmdldE1lc3NhZ2VzJyByZXR1cm5lZCBubyBldmVudHMgZm9yIHNlc3Npb24gc2Vzc2lvbi0xYCk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0c2Vzc2lvbnMuYWRkKGF3YWl0IGxhdW5jaGVyLmxhdW5jaChwbGFuLCB0ZXN0UnVudGltZSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENyZWF0ZVNlc3Npb25DYWxscygpLCAxKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2Vzc2lvbnMuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgbGF1bmNoZXIuZGlzcG9zZUJ5b2tQcm94eUhhbmRsZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBjcmVhdGVTZXNzaW9uIHdoZW4gdGhlIFNESyByZXBvcnRzIHRoZSBzZXNzaW9uIHdhcyBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsYXVuY2hlciwgcGxhbiwgZ2V0Q3JlYXRlU2Vzc2lvbkNhbGxzIH0gPSBjcmVhdGVSZXN1bWVGYWlsaW5nTGF1bmNoKCdSZXF1ZXN0IHNlc3Npb24ucmVzdW1lIGZhaWxlZCB3aXRoIG1lc3NhZ2U6IFNlc3Npb24gbm90IGZvdW5kOiBzZXNzaW9uLTEnKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRzZXNzaW9ucy5hZGQoYXdhaXQgbGF1bmNoZXIubGF1bmNoKHBsYW4sIHRlc3RSdW50aW1lKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q3JlYXRlU2Vzc2lvbkNhbGxzKCksIDEpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXNzaW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCBsYXVuY2hlci5kaXNwb3NlQnlva1Byb3h5SGFuZGxlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXBsYWNlIGEgc2Vzc2lvbiB3aXRoIGFuIGVtcHR5IG9uZSBhZnRlciBhIHRyYW5zaWVudCBuZXR3b3JrIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogdGhpcyB1c2VkIHRvIGZhbGwgdGhyb3VnaCB0byBgY3JlYXRlU2Vzc2lvbmAsIHByZXNlbnRpbmcgYVxuXHRcdC8vIHNlc3Npb24gd2l0aCByZWFsIGhpc3RvcnkgYXMgaGF2aW5nIHplcm8gdHVybnMgXHUyMDE0IHdoaWNoIHRoZSBlbXB0eS1zZXNzaW9uXG5cdFx0Ly8gR0MgdGhlbiBkZWxldGVkIGFsb25nIHdpdGggaXRzIHdvcmt0cmVlLlxuXHRcdGNvbnN0IHsgbGF1bmNoZXIsIHBsYW4sIGdldENyZWF0ZVNlc3Npb25DYWxscyB9ID0gY3JlYXRlUmVzdW1lRmFpbGluZ0xhdW5jaCgnUmVxdWVzdCBzZXNzaW9uLnJlc3VtZSBmYWlsZWQgd2l0aCBtZXNzYWdlOiBuZXR3b3JrIGZldGNoIGZhaWxlZDogcmVxdWVzdCBmYWlsZWQ6IGVycm9yIHNlbmRpbmcgcmVxdWVzdCBmb3IgdXJsIChodHRwczovL2FwaS5naXRodWIuY29tL2NvcGlsb3RfaW50ZXJuYWwvdXNlciknKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBsYXVuY2hlci5sYXVuY2gocGxhbiwgdGVzdFJ1bnRpbWUpLCAvbmV0d29yayBmZXRjaCBmYWlsZWQvKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDcmVhdGVTZXNzaW9uQ2FsbHMoKSwgMCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGxhdW5jaGVyLmRpc3Bvc2VCeW9rUHJveHlIYW5kbGUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlcGxhY2UgYSBzZXNzaW9uIHdpdGggYW4gZW1wdHkgb25lIGZvciBhbiB1bnJlY29nbml6ZWQgLTMyNjAzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbGF1bmNoZXIsIHBsYW4sIGdldENyZWF0ZVNlc3Npb25DYWxscyB9ID0gY3JlYXRlUmVzdW1lRmFpbGluZ0xhdW5jaCgnUmVxdWVzdCBzZXNzaW9uLnJlc3VtZSBmYWlsZWQ6IHNvbWV0aGluZyB3ZW50IHdyb25nJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gbGF1bmNoZXIubGF1bmNoKHBsYW4sIHRlc3RSdW50aW1lKSwgL3NvbWV0aGluZyB3ZW50IHdyb25nLyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q3JlYXRlU2Vzc2lvbkNhbGxzKCksIDApO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBsYXVuY2hlci5kaXNwb3NlQnlva1Byb3h5SGFuZGxlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXBsYWNlIGEgY29ycnVwdGVkIHNlc3Npb24gZmlsZSB3aXRoIGFuIGVtcHR5IHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBsYXVuY2hlciwgcGxhbiwgZ2V0Q3JlYXRlU2Vzc2lvbkNhbGxzIH0gPSBjcmVhdGVSZXN1bWVGYWlsaW5nTGF1bmNoKCdSZXF1ZXN0IHNlc3Npb24ucmVzdW1lIGZhaWxlZCB3aXRoIG1lc3NhZ2U6IFNlc3Npb24gZmlsZSBpcyBjb3JydXB0ZWQgKGxpbmUgMTk1Njc6IGRhdGEuY29tcGFjdGlvblRva2Vuc1VzZWQuY29waWxvdFVzYWdlLnRva2VuRGV0YWlscy4wLmJhdGNoU2l6ZTogTnVtYmVyIG11c3QgYmUgZ3JlYXRlciB0aGFuIDApJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gbGF1bmNoZXIubGF1bmNoKHBsYW4sIHRlc3RSdW50aW1lKSwgL1Nlc3Npb24gZmlsZSBpcyBjb3JydXB0ZWQvKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDcmVhdGVTZXNzaW9uQ2FsbHMoKSwgMCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGxhdW5jaGVyLmRpc3Bvc2VCeW9rUHJveHlIYW5kbGUoKTtcblx0XHR9XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIHZlcmJvc2l0eScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBhcHBseVZlcmJvc2l0eSh2ZXJib3NpdHk6IFZlcmJvc2l0eSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxhdW5jaGVyID0gY3JlYXRlVGVzdExhdW5jaGVyKCkgYXMgdW5rbm93biBhcyB7XG5cdFx0XHRfYXBwbHlWZXJib3NpdHkoc2Vzc2lvbjogQ29waWxvdFNlc3Npb24sIHZlcmJvc2l0eTogVmVyYm9zaXR5LCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdFx0fTtcblx0XHRjb25zdCBzZXNzaW9uID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHR1cGRhdGU6IGFzeW5jIChvcHRpb25zOiB1bmtub3duKSA9PiB1cGRhdGVzLnB1c2gob3B0aW9ucyksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90U2Vzc2lvbjtcblx0XHRyZXR1cm4gbGF1bmNoZXIuX2FwcGx5VmVyYm9zaXR5KHNlc3Npb24sIHZlcmJvc2l0eSwgJ3Nlc3Npb24tMScpO1xuXHR9XG5cblx0Y29uc3QgdXBkYXRlczogdW5rbm93bltdID0gW107XG5cblx0c2V0dXAoKCkgPT4gdXBkYXRlcy5sZW5ndGggPSAwKTtcblxuXHR0ZXN0KCdmb3J3YXJkcyB0aGUgcmVxdWVzdGVkIHZlcmJvc2l0eScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhcHBseVZlcmJvc2l0eSgnaGlnaCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVzLCBbeyB2ZXJib3NpdHk6ICdoaWdoJyB9XSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIHJlYXNvbmluZyBzdW1tYXJ5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGFwcGx5UmVhc29uaW5nU3VtbWFyeShyZWFzb25pbmdTdW1tYXJ5OiBSZWFzb25pbmdTdW1tYXJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGF1bmNoZXIgPSBjcmVhdGVUZXN0TGF1bmNoZXIoKSBhcyB1bmtub3duIGFzIHtcblx0XHRcdF9hcHBseVJlYXNvbmluZ1N1bW1hcnkoc2Vzc2lvbjogQ29waWxvdFNlc3Npb24sIHJlYXNvbmluZ1N1bW1hcnk6IFJlYXNvbmluZ1N1bW1hcnksIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0XHR9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHVwZGF0ZTogYXN5bmMgKG9wdGlvbnM6IHVua25vd24pID0+IHVwZGF0ZXMucHVzaChvcHRpb25zKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXHRcdHJldHVybiBsYXVuY2hlci5fYXBwbHlSZWFzb25pbmdTdW1tYXJ5KHNlc3Npb24sIHJlYXNvbmluZ1N1bW1hcnksICdzZXNzaW9uLTEnKTtcblx0fVxuXG5cdGNvbnN0IHVwZGF0ZXM6IHVua25vd25bXSA9IFtdO1xuXG5cdHNldHVwKCgpID0+IHVwZGF0ZXMubGVuZ3RoID0gMCk7XG5cblx0dGVzdCgnZm9yd2FyZHMgdGhlIHJlcXVlc3RlZCByZWFzb25pbmcgc3VtbWFyeScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhcHBseVJlYXNvbmluZ1N1bW1hcnkoJ2RldGFpbGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZXMsIFt7IHJlYXNvbmluZ1N1bW1hcnk6ICdkZXRhaWxlZCcgfV0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ29waWxvdFNlc3Npb25MYXVuY2hlciBHUFQtNS42IGN1c3RvbWl6YXRpb25zJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FwcGxpZXMgdmVyYm9zaXR5IGFuZCBjb25jaXNlIHJlYXNvbmluZyBzdW1tYXJ5IHdoZW4gZW5hYmxlZCBieSBleHBlcmltZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVwZGF0ZXM6IHVua25vd25bXSA9IFtdO1xuXHRcdGNvbnN0IGxhdW5jaGVyID0gY3JlYXRlVGVzdExhdW5jaGVyKHVuZGVmaW5lZCwgeyBbQ29waWxvdENsaUNvbmZpZ0tleS5SZWFzb25pbmdTdW1tYXJ5XTogdHJ1ZSB9KSBhcyB1bmtub3duIGFzIHtcblx0XHRcdF9hcHBseUdwdDU2Q3VzdG9taXphdGlvbnMoc2Vzc2lvbjogQ29waWxvdFNlc3Npb24sIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0XHR9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHVwZGF0ZTogYXN5bmMgKG9wdGlvbnM6IHVua25vd24pID0+IHVwZGF0ZXMucHVzaChvcHRpb25zKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXG5cdFx0YXdhaXQgbGF1bmNoZXIuX2FwcGx5R3B0NTZDdXN0b21pemF0aW9ucyhzZXNzaW9uLCAnc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZXMsIFtcblx0XHRcdHsgdmVyYm9zaXR5OiAnbWVkaXVtJyB9LFxuXHRcdFx0eyByZWFzb25pbmdTdW1tYXJ5OiAnY29uY2lzZScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYXBwbHkgcmVhc29uaW5nIHN1bW1hcnkgd2hlbiB0aGUgZXhwZXJpbWVudCBpcyB1bnNldCBvciBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IHJlYXNvbmluZ1N1bW1hcnkgb2YgW3VuZGVmaW5lZCwgZmFsc2VdKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVzOiB1bmtub3duW10gPSBbXTtcblx0XHRcdGNvbnN0IGxhdW5jaGVyID0gY3JlYXRlVGVzdExhdW5jaGVyKHVuZGVmaW5lZCwgeyBbQ29waWxvdENsaUNvbmZpZ0tleS5SZWFzb25pbmdTdW1tYXJ5XTogcmVhc29uaW5nU3VtbWFyeSB9KSBhcyB1bmtub3duIGFzIHtcblx0XHRcdFx0X2FwcGx5R3B0NTZDdXN0b21pemF0aW9ucyhzZXNzaW9uOiBDb3BpbG90U2Vzc2lvbiwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0XHRcdHJwYzogeyBvcHRpb25zOiB7IHVwZGF0ZTogYXN5bmMgKG9wdGlvbnM6IHVua25vd24pID0+IHVwZGF0ZXMucHVzaChvcHRpb25zKSB9IH0sXG5cdFx0XHR9IGFzIHVua25vd24gYXMgQ29waWxvdFNlc3Npb247XG5cblx0XHRcdGF3YWl0IGxhdW5jaGVyLl9hcHBseUdwdDU2Q3VzdG9taXphdGlvbnMoc2Vzc2lvbiwgJ3Nlc3Npb24tMScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZXMsIFt7IHZlcmJvc2l0eTogJ21lZGl1bScgfV0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYXBwbGllcyBHUFQtNS42IGN1c3RvbWl6YXRpb25zIHdoZW4gcmVzdW1pbmcgYW4gZXhpc3Rpbmcgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cGRhdGVzOiB1bmtub3duW10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdG9uOiAoKSA9PiAoKSA9PiB7IH0sXG5cdFx0XHRkaXNjb25uZWN0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRycGM6IHsgb3B0aW9uczogeyB1cGRhdGU6IGFzeW5jIChvcHRpb25zOiB1bmtub3duKSA9PiB1cGRhdGVzLnB1c2gob3B0aW9ucykgfSB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90U2Vzc2lvbjtcblx0XHRjb25zdCBsYXVuY2hlciA9IGNyZWF0ZVRlc3RMYXVuY2hlcih1bmRlZmluZWQsIHsgW0NvcGlsb3RDbGlDb25maWdLZXkuUmVhc29uaW5nU3VtbWFyeV06IHRydWUgfSk7XG5cdFx0Y29uc3QgcGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuID0ge1xuXHRcdFx0a2luZDogJ3Jlc3VtZScsXG5cdFx0XHRjbGllbnQ6IHsgcmVzdW1lU2Vzc2lvbjogYXN5bmMgKCkgPT4gc2Vzc2lvbiB9IGFzIHVua25vd24gYXMgQ29waWxvdENsaWVudCxcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB0ZXN0V29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHJlc29sdmVkQWdlbnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRzbmFwc2hvdDogeyB0b29sczogW10sIHBsdWdpbnM6IFtdLCBtY3BTZXJ2ZXJzOiB7fSB9LFxuXHRcdFx0YWN0aXZlQ2xpZW50VG9vbFNldDogbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKSxcblx0XHRcdHNoZWxsTWFuYWdlcjogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0aHViVG9rZW46IHVuZGVmaW5lZCxcblx0XHRcdGZhbGxiYWNrOiB7IG1vZGVsOiB7IGlkOiAnZ3B0LTUuNi1zb2wnLCBjb25maWc6IHt9IH0gfSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgd3JhcHBlciA9IGF3YWl0IGxhdW5jaGVyLmxhdW5jaChwbGFuLCB0ZXN0UnVudGltZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlcywgW1xuXHRcdFx0XHR7IHZlcmJvc2l0eTogJ21lZGl1bScgfSxcblx0XHRcdFx0eyByZWFzb25pbmdTdW1tYXJ5OiAnY29uY2lzZScgfSxcblx0XHRcdF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR3cmFwcGVyLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IGxhdW5jaGVyLmRpc3Bvc2VCeW9rUHJveHlIYW5kbGUoKTtcblx0XHR9XG5cdH0pO1xufSk7XG5cbi8qKlxuICogQ292ZXJzIHRoZSByZWFzb25pbmctZWZmb3J0IHJlc29sdXRpb24gZmVkIGludG8gYGNyZWF0ZVNlc3Npb25gIGFuZFxuICogYENvcGlsb3RBZ2VudC5fY2hhbmdlTW9kZWxgOiBhIHZhbGlkIGNhcGFiaWxpdHkgb3ZlcnJpZGUgd2lucyBvdmVyIHRoZSBtb2RlbFxuICogcGlja2VyJ3MgdGhpbmtpbmcgbGV2ZWwsIGFuZCBkZWdyYWRlcyB0byB0aGUgcGlja2VyIHZhbHVlIG90aGVyd2lzZS5cbiAqL1xuc3VpdGUoJ2dldENvcGlsb3RSZWFzb25pbmdFZmZvcnQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYSB2YWxpZCBvdmVycmlkZSB3aW5zIG92ZXIgdGhlIHBpY2tlciB2YWx1ZTsgYW4gaW52YWxpZCBvciBhYnNlbnQgb3ZlcnJpZGUgZmFsbHMgYmFjaycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbDogTW9kZWxTZWxlY3Rpb24gPSB7IGlkOiAnZ3B0LTUnLCBjb25maWc6IHsgdGhpbmtpbmdMZXZlbDogJ21lZGl1bScgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbXG5cdFx0XHRcdGdldENvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwpLFxuXHRcdFx0XHRnZXRDb3BpbG90UmVhc29uaW5nRWZmb3J0KG1vZGVsLCAneGhpZ2gnKSxcblx0XHRcdFx0Z2V0Q29waWxvdFJlYXNvbmluZ0VmZm9ydChtb2RlbCwgJ3R1cmJvJyksXG5cdFx0XHRcdGdldENvcGlsb3RSZWFzb25pbmdFZmZvcnQodW5kZWZpbmVkLCAnaGlnaCcpLFxuXHRcdFx0XHRnZXRDb3BpbG90UmVhc29uaW5nRWZmb3J0KHVuZGVmaW5lZCksXG5cdFx0XHRdLFxuXHRcdFx0WydtZWRpdW0nLCAneGhpZ2gnLCAnbWVkaXVtJywgJ2hpZ2gnLCB1bmRlZmluZWRdXG5cdFx0KTtcblx0fSk7XG5cblx0Ly8gVGhlIG1vZGVsIHBpY2tlcidzIG9wdGlvbnMgYXJlIGBzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzLmZpbHRlcihpc0NvcGlsb3RSZWFzb25pbmdFZmZvcnQpYCxcblx0Ly8gc28gYW55IHRpZXIgdGhpcyBndWFyZCByZWplY3RzIHNpbGVudGx5IGRpc2FwcGVhcnMgZnJvbSB0aGUgcGlja2VyIFx1MjAxNCB0aGF0IGlzIGhvdyBgJ21heCdgXG5cdC8vIHdlbnQgbWlzc2luZy4gVGhlIGd1YXJkIG11c3QgdGhlcmVmb3JlIHJlY29nbml6ZSBldmVyeSBjYW5vbmljYWwgdGllcjsgcmUtaW50cm9kdWNpbmcgYVxuXHQvLyBuYXJyb3dlciBwcml2YXRlIGFsbG93LWxpc3QgaGVyZSBoYXMgdG8gZmFpbC5cblx0dGVzdCgncmVjb2duaXplcyBldmVyeSBjYW5vbmljYWwgcmVhc29uaW5nLWVmZm9ydCB0aWVyIHNvIG5vbmUgaXMgZHJvcHBlZCBmcm9tIHRoZSBwaWNrZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY2NlcHRlZDogcmVhc29uaW5nRWZmb3J0TGV2ZWxzLmZpbHRlcihpc0NvcGlsb3RSZWFzb25pbmdFZmZvcnQpLFxuXHRcdFx0cmVqZWN0c1Vua25vd246IGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydCgndHVyYm8nKSxcblx0XHR9LCB7XG5cdFx0XHRhY2NlcHRlZDogWy4uLnJlYXNvbmluZ0VmZm9ydExldmVsc10sXG5cdFx0XHRyZWplY3RzVW5rbm93bjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbi8qKiBBIHNwZWNpZmljIGVudHJ5IHdpbnMgb3ZlciBgKmAsIHdoaWNoIHdpbnMgb3ZlciB0aGUgcGlja2VyOyBpbnZhbGlkIGZhbGxzIHRocm91Z2guICovXG5zdWl0ZSgncmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqIFN0dWJzIHRoZSBjb25maWcgc2VydmljZSB3aXRoIGEgZml4ZWQgcm9vdC12YWx1ZSBiYWcuICovXG5cdGZ1bmN0aW9uIGNvbmZpZ09mKHZhbHVlczogU2NoZW1hVmFsdWVzPHR5cGVvZiBjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLmRlZmluaXRpb24+KTogUGljazxJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgJ2dldFJvb3RWYWx1ZSc+IHtcblx0XHQvLyBgbmV2ZXJgIHNhdGlzZmllcyB0aGUgZ2VuZXJpYyByZXR1cm4gdHlwZSB3aXRob3V0IHdpZGVuaW5nIHRvIGBhbnlgLlxuXHRcdHJldHVybiB7IGdldFJvb3RWYWx1ZTogKF9zY2hlbWEsIGtleSkgPT4gdmFsdWVzW2tleSBhcyBrZXlvZiB0eXBlb2YgdmFsdWVzXSBhcyBuZXZlciB9O1xuXHR9XG5cblx0dGVzdCgnYSBzcGVjaWZpYyBlbnRyeSBiZWF0cyB0aGUgd2lsZGNhcmQgYmVhdHMgdGhlIHBpY2tlcjsgaW52YWxpZCB2YWx1ZXMgZmFsbCB0aHJvdWdoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IG1vZGVsOiBNb2RlbFNlbGVjdGlvbiA9IHsgaWQ6ICdncHQtNScsIGNvbmZpZzogeyB0aGlua2luZ0xldmVsOiAnbWVkaXVtJyB9IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0Ly8gYSBzcGVjaWZpYyBlbnRyeSB3aW5zIG92ZXIgdGhlIHBpY2tlclxuXHRcdFx0XHRyZXNvbHZlQ29waWxvdFJlYXNvbmluZ0VmZm9ydChtb2RlbCwgY29uZmlnT2YoeyBtb2RlbENhcGFiaWxpdHlPdmVycmlkZXM6IHsgJ2dwdC01JzogeyByZWFzb25pbmdFZmZvcnQ6ICdsb3cnIH0gfSB9KSwgbG9nLCAnczEnKSxcblx0XHRcdFx0Ly8gdGhlIHdpbGRjYXJkIGFwcGxpZXMgdG8gYW55IG1vZGVsOyBhIHNwZWNpZmljIGVudHJ5IHdpbnMgb3ZlciBpdFxuXHRcdFx0XHRyZXNvbHZlQ29waWxvdFJlYXNvbmluZ0VmZm9ydChtb2RlbCwgY29uZmlnT2YoeyBtb2RlbENhcGFiaWxpdHlPdmVycmlkZXM6IHsgJyonOiB7IHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnIH0gfSB9KSwgbG9nLCAnczEnKSxcblx0XHRcdFx0cmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwsIGNvbmZpZ09mKHsgbW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzOiB7ICcqJzogeyByZWFzb25pbmdFZmZvcnQ6ICdoaWdoJyB9LCAnZ3B0LTUnOiB7IHJlYXNvbmluZ0VmZm9ydDogJ2xvdycgfSB9IH0pLCBsb2csICdzMScpLFxuXHRcdFx0XHQvLyBhbiBpbnZhbGlkIHNwZWNpZmljIHZhbHVlIGlzIGlnbm9yZWQsIHNvIGl0IGNhbm5vdCBtYXNrIHRoZSB3aWxkY2FyZFxuXHRcdFx0XHRyZXNvbHZlQ29waWxvdFJlYXNvbmluZ0VmZm9ydChtb2RlbCwgY29uZmlnT2YoeyBtb2RlbENhcGFiaWxpdHlPdmVycmlkZXM6IHsgJyonOiB7IHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnIH0sICdncHQtNSc6IHsgcmVhc29uaW5nRWZmb3J0OiAndHVyYm8nIH0gfSB9KSwgbG9nLCAnczEnKSxcblx0XHRcdFx0Ly8gYW4gaW52YWxpZCB2YWx1ZSBmYWxscyB0aHJvdWdoIHRvIHRoZSBwaWNrZXJcblx0XHRcdFx0cmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwsIGNvbmZpZ09mKHsgbW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzOiB7ICdncHQtNSc6IHsgcmVhc29uaW5nRWZmb3J0OiAndHVyYm8nIH0gfSB9KSwgbG9nLCAnczEnKSxcblx0XHRcdFx0Ly8gbm90aGluZyBjb25maWd1cmVkIFx1MjE5MiBwaWNrZXIgdmFsdWVcblx0XHRcdFx0cmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwsIGNvbmZpZ09mKHt9KSwgbG9nLCAnczEnKSxcblx0XHRcdFx0Ly8gbm8gbW9kZWwgKHNlcnZlci1zaWRlIFwiQXV0b1wiKTogdGhlIGAqYCBlbnRyeSBzdGlsbCBtYXRjaGVzLCBidXQgYVxuXHRcdFx0XHQvLyBtb2RlbC1pZCBlbnRyeSBjYW5ub3Rcblx0XHRcdFx0cmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQodW5kZWZpbmVkLCBjb25maWdPZih7IG1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlczogeyAnKic6IHsgcmVhc29uaW5nRWZmb3J0OiAnbG93JyB9IH0gfSksIGxvZywgJ3MxJyksXG5cdFx0XHRcdHJlc29sdmVDb3BpbG90UmVhc29uaW5nRWZmb3J0KHVuZGVmaW5lZCwgY29uZmlnT2YoeyBtb2RlbENhcGFiaWxpdHlPdmVycmlkZXM6IHsgJ2dwdC01JzogeyByZWFzb25pbmdFZmZvcnQ6ICdsb3cnIH0gfSB9KSwgbG9nLCAnczEnKSxcblx0XHRcdF0sXG5cdFx0XHRbJ2xvdycsICdoaWdoJywgJ2xvdycsICdoaWdoJywgJ21lZGl1bScsICdtZWRpdW0nLCAnbG93JywgdW5kZWZpbmVkXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVDb25maWd1cmVkUmVhc29uaW5nRWZmb3J0T3ZlcnJpZGUgcmVwb3J0cyBvbmx5IHRoZSBjb25maWd1cmVkIG92ZXJyaWRlLCBuZXZlciB0aGUgcGlja2VyIHZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IG1vZGVsOiBNb2RlbFNlbGVjdGlvbiA9IHsgaWQ6ICdncHQtNScsIGNvbmZpZzogeyB0aGlua2luZ0xldmVsOiAnbWVkaXVtJyB9IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0Ly8gc2FtZSByZXNvbHV0aW9uIGFzIGFib3ZlLi4uXG5cdFx0XHRcdHJlc29sdmVDb25maWd1cmVkUmVhc29uaW5nRWZmb3J0T3ZlcnJpZGUobW9kZWwsIGNvbmZpZ09mKHsgbW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzOiB7ICdncHQtNSc6IHsgcmVhc29uaW5nRWZmb3J0OiAnbG93JyB9IH0gfSksIGxvZywgJ3MxJyksXG5cdFx0XHRcdHJlc29sdmVDb25maWd1cmVkUmVhc29uaW5nRWZmb3J0T3ZlcnJpZGUobW9kZWwsIGNvbmZpZ09mKHsgbW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzOiB7ICcqJzogeyByZWFzb25pbmdFZmZvcnQ6ICdoaWdoJyB9IH0gfSksIGxvZywgJ3MxJyksXG5cdFx0XHRcdC8vIC4uLmJ1dCBubyBwaWNrZXIgZmFsbGJhY2s6IHVuY29uZmlndXJlZCBvciBpbnZhbGlkIG1lYW5zIFwibGVhdmUgaXQgYWxvbmVcIlxuXHRcdFx0XHRyZXNvbHZlQ29uZmlndXJlZFJlYXNvbmluZ0VmZm9ydE92ZXJyaWRlKG1vZGVsLCBjb25maWdPZih7IG1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlczogeyAnZ3B0LTUnOiB7IHJlYXNvbmluZ0VmZm9ydDogJ3R1cmJvJyB9IH0gfSksIGxvZywgJ3MxJyksXG5cdFx0XHRcdHJlc29sdmVDb25maWd1cmVkUmVhc29uaW5nRWZmb3J0T3ZlcnJpZGUobW9kZWwsIGNvbmZpZ09mKHt9KSwgbG9nLCAnczEnKSxcblx0XHRcdF0sXG5cdFx0XHRbJ2xvdycsICdoaWdoJywgdW5kZWZpbmVkLCB1bmRlZmluZWRdXG5cdFx0KTtcblx0fSk7XG59KTtcblxuLyoqXG4gKiBDbGllbnQgdG9vbHMgYXJlIGFsbCBgY3VzdG9tOmAtc291cmNlLCBzbyBvbmx5IGEgYmFyZSBuYW1lLCBgY3VzdG9tOjxuYW1lPmAgb3JcbiAqIGBjdXN0b206KmAgbWF0Y2hlcywgYW5kIGBleGNsdWRlZFRvb2xzYCB3aW5zIFx1MjAxNCBtaXJyb3JpbmcgdGhlIFNESy5cbiAqL1xuc3VpdGUoJ2ZpbHRlckNsaWVudFRvb2xOYW1lcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhcHBsaWVzIGFsbG93L2RlbnkgcGF0dGVybnMgd2l0aCBleGNsdWRlZFRvb2xzIHdpbm5pbmc7IG90aGVyIHNvdXJjZXMgbmV2ZXIgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmFtZXMgPSBuZXcgU2V0KFsnb3BlbkJyb3dzZXJQYWdlJywgJ3JlYWRQYWdlJywgJ3J1blRhc2snXSk7XG5cdFx0Y29uc3QgcmVzb2x2ZSA9IChhdmFpbGFibGU/OiBzdHJpbmdbXSwgZXhjbHVkZWQ/OiBzdHJpbmdbXSkgPT4gWy4uLmZpbHRlckNsaWVudFRvb2xOYW1lcyhuYW1lcywgYXZhaWxhYmxlLCBleGNsdWRlZCldLnNvcnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHQvLyBubyBmaWx0ZXJzIFx1MjE5MiBzYW1lIHNldCAoYW5kIHNhbWUgaW5zdGFuY2Ugc2VtYW50aWNzOiBldmVyeXRoaW5nIHN1cnZpdmVzKVxuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0Ly8gYmFyZS1uYW1lLCBzb3VyY2UtcXVhbGlmaWVkLCBhbmQgc291cmNlLXdpbGRjYXJkIGV4Y2x1c2lvblxuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCwgWydvcGVuQnJvd3NlclBhZ2UnXSksXG5cdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkLCBbJ2N1c3RvbTpyZWFkUGFnZSddKSxcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQsIFsnY3VzdG9tOionXSksXG5cdFx0XHRcdC8vIGJ1aWx0aW4vbWNwIHBhdHRlcm5zIG5ldmVyIG1hdGNoIGNsaWVudCB0b29sc1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCwgWydidWlsdGluOionLCAnbWNwOionLCAnYmFzaCddKSxcblx0XHRcdFx0Ly8gYWxsb3dsaXN0IGtlZXBzIG9ubHkgbWF0Y2hlczsgZXhjbHVkZWRUb29scyB3aW5zIG92ZXIgYXZhaWxhYmxlVG9vbHNcblx0XHRcdFx0cmVzb2x2ZShbJ29wZW5Ccm93c2VyUGFnZScsICdjdXN0b206cmVhZFBhZ2UnXSwgdW5kZWZpbmVkKSxcblx0XHRcdFx0cmVzb2x2ZShbJ2N1c3RvbToqJ10sIFsnb3BlbkJyb3dzZXJQYWdlJ10pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0WydvcGVuQnJvd3NlclBhZ2UnLCAncmVhZFBhZ2UnLCAncnVuVGFzayddLFxuXHRcdFx0XHRbJ3JlYWRQYWdlJywgJ3J1blRhc2snXSxcblx0XHRcdFx0WydvcGVuQnJvd3NlclBhZ2UnLCAncnVuVGFzayddLFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0WydvcGVuQnJvd3NlclBhZ2UnLCAncmVhZFBhZ2UnLCAncnVuVGFzayddLFxuXHRcdFx0XHRbJ29wZW5Ccm93c2VyUGFnZScsICdyZWFkUGFnZSddLFxuXHRcdFx0XHRbJ3JlYWRQYWdlJywgJ3J1blRhc2snXSxcblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0Y29uc3Qgd2l0aFNlYXJjaCA9IG5ldyBTZXQoW0NMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSwgJ3J1blRhc2snXSk7XG5cdFx0Y29uc3QgcmVzb2x2ZVNlYXJjaCA9IChleGNsdWRlZDogc3RyaW5nW10pID0+IFsuLi5maWx0ZXJDbGllbnRUb29sTmFtZXMod2l0aFNlYXJjaCwgdW5kZWZpbmVkLCBleGNsdWRlZCldLnNvcnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRyZXNvbHZlU2VhcmNoKFtgYnVpbHRpbjoke1JVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FfWBdKSxcblx0XHRcdFx0cmVzb2x2ZVNlYXJjaChbJ2J1aWx0aW46KiddKSxcblx0XHRcdFx0cmVzb2x2ZVNlYXJjaChbUlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUVdKSxcblx0XHRcdFx0Ly8gQ2xpZW50IHRvb2xzIGFyZSBjdXN0b20tc291cmNlIGV2ZW4gd2hlbiB0aGV5IG92ZXJyaWRlIGEgYnVpbHQtaW4uXG5cdFx0XHRcdFsuLi5maWx0ZXJDbGllbnRUb29sTmFtZXMod2l0aFNlYXJjaCwgWydidWlsdGluOionXSwgdW5kZWZpbmVkKV0sXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3J1blRhc2snLCAndG9vbFNlYXJjaCddLFxuXHRcdFx0XHRbJ3J1blRhc2snLCAndG9vbFNlYXJjaCddLFxuXHRcdFx0XHRbJ3J1blRhc2snXSxcblx0XHRcdFx0W10sXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgQWdlbnQgSG9zdCBhbmQgU0RLIHRvb2wtc2VhcmNoIG5hbWVzIGNvbnNpc3RlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmFtZXMgPSBuZXcgU2V0KFtDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUVdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRbLi4uZmlsdGVyQ2xpZW50VG9vbE5hbWVzKG5hbWVzLCBbQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FXSwgdW5kZWZpbmVkKV0sXG5cdFx0XHRcdFsuLi5maWx0ZXJDbGllbnRUb29sTmFtZXMobmFtZXMsIFtSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRV0sIHVuZGVmaW5lZCldLFxuXHRcdFx0XHRbLi4uZmlsdGVyQ2xpZW50VG9vbE5hbWVzKG5hbWVzLCB1bmRlZmluZWQsIFtgY3VzdG9tOiR7UlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUV9YF0pXSxcblx0XHRcdFx0dG9TZGtUb29sRmlsdGVyUGF0dGVybnMoW0NMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSwgYGN1c3RvbToke0NMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRX1gLCAnYnVpbHRpbjoqJ10pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0W0NMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRV0sXG5cdFx0XHRcdFtDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUVdLFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0W1JVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FLCBgY3VzdG9tOiR7UlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUV9YCwgJ2J1aWx0aW46KiddLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbi8qKlxuICogQSByZXN1bWVkIHNlc3Npb24ga2VlcHMgdGhlIGVmZm9ydCB0aGUgcnVudGltZSBqb3VybmFsZWQgdW5sZXNzIGFuIG92ZXJyaWRlIGlzXG4gKiBjb25maWd1cmVkOyBgX2NyZWF0ZVNlc3Npb25gIHJlc29sdmVzIHRoZSBmdWxsIGVmZm9ydCBmb3IgYSBjcmVhdGUuXG4gKi9cbnN1aXRlKCdub3JtYWxpemVUb29sRmlsdGVyUGF0dGVybnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZXhwYW5kcyBhIGJhcmUgd2lsZGNhcmQgYW5kIGNvZXJjZXMgYSBsb25lIHN0cmluZzsgdW51c2FibGUgdmFsdWVzIHJlYWQgYXMgdW5zZXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0Ly8gYSBiYXJlICcqJyBpcyBleHBhbmRlZCwgbm90IGRyb3BwZWQgXHUyMDE0IGFuIFwiZXhjbHVkZSBldmVyeXRoaW5nXCJcblx0XHRcdFx0Ly8gZGVueWxpc3QgbXVzdCBub3QgZGVncmFkZSBpbnRvIFwiZXhjbHVkZSBub3RoaW5nXCJcblx0XHRcdFx0bm9ybWFsaXplVG9vbEZpbHRlclBhdHRlcm5zKFsnKiddKSxcblx0XHRcdFx0bm9ybWFsaXplVG9vbEZpbHRlclBhdHRlcm5zKFsnbWNwOionLCAnKiddKSxcblx0XHRcdFx0Ly8gYSBsb25lIHN0cmluZyByZWFkcyBhcyBhIG9uZS1lbGVtZW50IGxpc3Rcblx0XHRcdFx0bm9ybWFsaXplVG9vbEZpbHRlclBhdHRlcm5zKCdtY3A6KicpLFxuXHRcdFx0XHQvLyBhbiBlbXB0eSBhbGxvd2xpc3QgbWVhbnMgXCJubyB0b29sc1wiLCBzbyBpdCBtdXN0IG5vdCByZWFkIGFzIHVuc2V0XG5cdFx0XHRcdG5vcm1hbGl6ZVRvb2xGaWx0ZXJQYXR0ZXJucyhbXSksXG5cdFx0XHRcdC8vIG5vdCBhIGxpc3QgYXQgYWxsIFx1MjE5MiB1bnVzYWJsZVxuXHRcdFx0XHRub3JtYWxpemVUb29sRmlsdGVyUGF0dGVybnModW5kZWZpbmVkKSxcblx0XHRcdFx0bm9ybWFsaXplVG9vbEZpbHRlclBhdHRlcm5zKDQyKSxcblx0XHRcdFx0bm9ybWFsaXplVG9vbEZpbHRlclBhdHRlcm5zKFsnb2snLCA3XSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRbJ2J1aWx0aW46KicsICdtY3A6KicsICdjdXN0b206KiddLFxuXHRcdFx0XHRbJ21jcDoqJywgJ2J1aWx0aW46KicsICdjdXN0b206KiddLFxuXHRcdFx0XHRbJ21jcDoqJ10sXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIHJlc3VtZSBjb25maWcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqIEJ1aWxkcyBhIGxhdW5jaGVyIG92ZXIgYSBjb25maWcgc2VydmljZSBzdHViYmVkIHdpdGggYSBmaXhlZCByb290LXZhbHVlIGJhZy4gKi9cblx0ZnVuY3Rpb24gY3JlYXRlTGF1bmNoZXIoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgdmFsdWVzOiBTY2hlbWFWYWx1ZXM8dHlwZW9mIGNvcGlsb3RDbGlDb25maWdTY2hlbWEuZGVmaW5pdGlvbj4pOiBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIHtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJQnlva0xtQnJpZGdlUmVnaXN0cnksIG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZSgpKSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRnZXRSb290VmFsdWU6IChfc2NoZW1hOiB1bmtub3duLCBrZXk6IHN0cmluZykgPT4gdmFsdWVzW2tleSBhcyBrZXlvZiB0eXBlb2YgdmFsdWVzXSxcblx0XHR9IGFzIHVua25vd24gYXMgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdC8vIFRoZSBsYXVuY2hlcidzIG90aGVyIGRlcGVuZGVuY2llcyBhcmUgdW51c2VkIGJ5IHRoaXMgcGF0aCBhbmQgcmVzb2x2ZVxuXHRcdC8vIHRvIGB1bmRlZmluZWRgIHVuZGVyIHRoZSBub24tc3RyaWN0IEluc3RhbnRpYXRpb25TZXJ2aWNlLlxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90U2Vzc2lvbkxhdW5jaGVyKTtcblx0fVxuXG5cdC8qKiBJbnZva2VzIHRoZSBwcml2YXRlIGNvbmZpZyBidWlsZGVyIHdpdGggYSBtaW5pbWFsIHJlc3VtZSBwbGFuLiAqL1xuXHRmdW5jdGlvbiBidWlsZFJlc3VtZUNvbmZpZyhcblx0XHRsYXVuY2hlcjogQ29waWxvdFNlc3Npb25MYXVuY2hlcixcblx0XHRtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0c25hcHNob3Q6IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhblsnc25hcHNob3QnXSA9IHsgdG9vbHM6IFtdLCBwbHVnaW5zOiBbXSwgbWNwU2VydmVyczoge30gfSxcblx0XHRjcmVhdGVDbGllbnRTZGtUb29sczogSUNvcGlsb3RTZXNzaW9uUnVudGltZVsnY3JlYXRlQ2xpZW50U2RrVG9vbHMnXSA9ICgpID0+IFtdLFxuXHQpOiBQcm9taXNlPHsgbW9kZWw/OiBzdHJpbmc7IHJlYXNvbmluZ0VmZm9ydD86IHN0cmluZzsgY29udGV4dFRpZXI/OiBzdHJpbmc7IGF2YWlsYWJsZVRvb2xzPzogc3RyaW5nW107IGV4Y2x1ZGVkVG9vbHM/OiBzdHJpbmdbXTsgbW9kZWxDYXBhYmlsaXRpZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjsgdG9vbFNlYXJjaD86IHsgZW5hYmxlZDogYm9vbGVhbiB9IH0+IHtcblx0XHRjb25zdCBwbGFuID0ge1xuXHRcdFx0a2luZDogJ3Jlc3VtZScsXG5cdFx0XHRjbGllbnQ6IHsgY3JlYXRlU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3VudXNlZCcpOyB9LCByZXN1bWVTZXNzaW9uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigndW51c2VkJyk7IH0gfSxcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3MtMScsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpLFxuXHRcdFx0cmVzb2x2ZWRBZ2VudE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdHNuYXBzaG90LFxuXHRcdFx0YWN0aXZlQ2xpZW50VG9vbFNldDogbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKSxcblx0XHRcdHNoZWxsTWFuYWdlcjogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0aHViVG9rZW46ICd0b2tlbicsXG5cdFx0XHRmYWxsYmFjazogeyBtb2RlbCB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcnVudGltZSA9IHsgY3JlYXRlQ2xpZW50U2RrVG9vbHMsIGNyZWF0ZVNlcnZlclNka1Rvb2xzOiAoKSA9PiBbXSB9O1xuXHRcdHJldHVybiAobGF1bmNoZXIgYXMgdW5rbm93biBhcyB7IF9idWlsZFNlc3Npb25Db25maWcocGxhbjogdW5rbm93biwgcnVudGltZTogdW5rbm93bik6IFByb21pc2U8eyBtb2RlbD86IHN0cmluZzsgcmVhc29uaW5nRWZmb3J0Pzogc3RyaW5nOyBjb250ZXh0VGllcj86IHN0cmluZzsgYXZhaWxhYmxlVG9vbHM/OiBzdHJpbmdbXTsgZXhjbHVkZWRUb29scz86IHN0cmluZ1tdOyBtb2RlbENhcGFiaWxpdGllcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+OyB0b29sU2VhcmNoPzogeyBlbmFibGVkOiBib29sZWFuIH0gfT4gfSkuX2J1aWxkU2Vzc2lvbkNvbmZpZyhwbGFuLCBydW50aW1lKTtcblx0fVxuXG5cdHRlc3QoJ2ZvcndhcmRzIGEgY29uZmlndXJlZCBvdmVycmlkZSBvbiByZXN1bWUgYW5kIGxlYXZlcyB0aGUgZWZmb3J0IHVudG91Y2hlZCBvdGhlcndpc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWw6IE1vZGVsU2VsZWN0aW9uID0geyBpZDogJ2dwdC01JywgY29uZmlnOiB7IHRoaW5raW5nTGV2ZWw6ICdtZWRpdW0nIH0gfTtcblx0XHRjb25zdCBwZXJNb2RlbCA9IGF3YWl0IGJ1aWxkUmVzdW1lQ29uZmlnKGNyZWF0ZUxhdW5jaGVyKHN0b3JlLCB7IG1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlczogeyAnZ3B0LTUnOiB7IHJlYXNvbmluZ0VmZm9ydDogJ2xvdycgfSB9IH0pLCBtb2RlbCk7XG5cdFx0Y29uc3Qgd2lsZGNhcmQgPSBhd2FpdCBidWlsZFJlc3VtZUNvbmZpZyhjcmVhdGVMYXVuY2hlcihzdG9yZSwgeyBtb2RlbENhcGFiaWxpdHlPdmVycmlkZXM6IHsgJyonOiB7IHJlYXNvbmluZ0VmZm9ydDogJ3hoaWdoJyB9IH0gfSksIG1vZGVsKTtcblx0XHQvLyBUaGUgcGlja2VyIHZhbHVlIGlzIE5PVCByZS1zZW50OiB3aXRob3V0IGFuIG92ZXJyaWRlIHRoZSByZXN1bWVkXG5cdFx0Ly8gc2Vzc2lvbiBrZWVwcyB3aGF0ZXZlciBlZmZvcnQgdGhlIHJ1bnRpbWUgcGVyc2lzdGVkIGZvciBpdC5cblx0XHRjb25zdCBub25lID0gYXdhaXQgYnVpbGRSZXN1bWVDb25maWcoY3JlYXRlTGF1bmNoZXIoc3RvcmUsIHt9KSwgbW9kZWwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtwZXJNb2RlbC5yZWFzb25pbmdFZmZvcnQsIHdpbGRjYXJkLnJlYXNvbmluZ0VmZm9ydCwgbm9uZS5yZWFzb25pbmdFZmZvcnRdLFxuXHRcdFx0Wydsb3cnLCAneGhpZ2gnLCB1bmRlZmluZWRdXG5cdFx0KTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldmVyIHNlbmRzIHRoZSBtb2RlbCBvciBjb250ZXh0IHRpZXIgb24gcmVzdW1lLCBhbGlhc2VkIG9yIG5vdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbDogTW9kZWxTZWxlY3Rpb24gPSB7IGlkOiAncHJldmlldy1tb2RlbCcsIGNvbmZpZzogeyB0aGlua2luZ0xldmVsOiAnbWVkaXVtJyB9IH07XG5cdFx0Ly8gQSBgZmFtaWx5YCBhbGlhcyByb3V0ZXMgdGhlIGhvc3QgcHJvbXB0IG9ubHksIHNvIHRoZSByZXN1bWVkIHNlc3Npb24ga2VlcHNcblx0XHQvLyB0aGUgbW9kZWwgYW5kIHRpZXIgdGhlIHJ1bnRpbWUgam91cm5hbGVkIGZvciBpdC5cblx0XHRjb25zdCBhbGlhc2VkID0gYXdhaXQgYnVpbGRSZXN1bWVDb25maWcoY3JlYXRlTGF1bmNoZXIoc3RvcmUsIHsgbW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzOiB7ICdwcmV2aWV3LW1vZGVsJzogeyBmYW1pbHk6ICdjbGF1ZGUtb3B1cy00LjgnIH0gfSB9KSwgbW9kZWwpO1xuXHRcdGNvbnN0IG5vbmUgPSBhd2FpdCBidWlsZFJlc3VtZUNvbmZpZyhjcmVhdGVMYXVuY2hlcihzdG9yZSwge30pLCBtb2RlbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W2FsaWFzZWQubW9kZWwsIGFsaWFzZWQuY29udGV4dFRpZXIsIG5vbmUubW9kZWwsIG5vbmUuY29udGV4dFRpZXJdLFxuXHRcdFx0W3VuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZF1cblx0XHQpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYSBzZXNzaW9uIHdpdGggbm8gc3RvcmVkIG1vZGVsIHN0aWxsIGdldHMgdGhlIHdpbGRjYXJkIGVudHJ5IGVmZm9ydCBhbmQgdG9vbCBmaWx0ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdC8vIFNlc3Npb25zIGNyZWF0ZWQgd2l0aG91dCBhbiBleHBsaWNpdCBtb2RlbCAoc2VydmVyLXNpZGUgXCJBdXRvXCIpIHJlc3VtZVxuXHRcdC8vIHdpdGggYGZhbGxiYWNrLm1vZGVsID09PSB1bmRlZmluZWRgOyBgKmAgbWVhbnMgZXZlcnkgc2Vzc2lvbiwgc29cblx0XHQvLyBleGVtcHRpbmcgdGhlbSB3b3VsZCBtYWtlIHRoZSBlbnRyeSBtZWFuIFwiZXZlcnkgbW9kZWwgZXhjZXB0IEF1dG9cIi5cblx0XHRjb25zdCBsYXVuY2hlciA9IGNyZWF0ZUxhdW5jaGVyKHN0b3JlLCB7IG1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlczogeyAnKic6IHsgcmVhc29uaW5nRWZmb3J0OiAnaGlnaCcsIGV4Y2x1ZGVkVG9vbHM6IFsnbWNwOionXSB9LCAnZ3B0LTUnOiB7IHJlYXNvbmluZ0VmZm9ydDogJ2xvdycgfSB9IH0pO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IGJ1aWxkUmVzdW1lQ29uZmlnKGxhdW5jaGVyLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtjb25maWcucmVhc29uaW5nRWZmb3J0LCBjb25maWcuZXhjbHVkZWRUb29sc10sXG5cdFx0XHRbJ2hpZ2gnLCBbJ21jcDoqJ11dXG5cdFx0KTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGEgY29uZmlndXJlZCBtb2RlbENhcGFiaWxpdGllcyBvdmVycmlkZSBhbmQgaWdub3JlcyBhIG5vbi1vYmplY3Qgb25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1vZGVsOiBNb2RlbFNlbGVjdGlvbiA9IHsgaWQ6ICdncHQtNScsIGNvbmZpZzogeyB0aGlua2luZ0xldmVsOiAnbWVkaXVtJyB9IH07XG5cdFx0Y29uc3QgdmFsaWQgPSBhd2FpdCBidWlsZFJlc3VtZUNvbmZpZyhjcmVhdGVMYXVuY2hlcihzdG9yZSwgeyBtb2RlbENhcGFiaWxpdHlPdmVycmlkZXM6IHsgJ2dwdC01JzogeyBtb2RlbENhcGFiaWxpdGllczogeyBzdXBwb3J0czogeyB2aXNpb246IGZhbHNlIH0gfSB9IH0gfSksIG1vZGVsKTtcblx0XHRjb25zdCBpbnZhbGlkID0gYXdhaXQgYnVpbGRSZXN1bWVDb25maWcoY3JlYXRlTGF1bmNoZXIoc3RvcmUsIHsgbW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzOiB7ICdncHQtNSc6IHsgbW9kZWxDYXBhYmlsaXRpZXM6ICdvb3BzJyBhcyBuZXZlciB9IH0gfSksIG1vZGVsKTtcblx0XHRjb25zdCB3aWxkY2FyZEZhbGxiYWNrID0gYXdhaXQgYnVpbGRSZXN1bWVDb25maWcoY3JlYXRlTGF1bmNoZXIoc3RvcmUsIHtcblx0XHRcdG1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlczoge1xuXHRcdFx0XHQnKic6IHtcblx0XHRcdFx0XHRhdmFpbGFibGVUb29sczogWydjdXN0b206KiddLFxuXHRcdFx0XHRcdGV4Y2x1ZGVkVG9vbHM6IFsnbWNwOionXSxcblx0XHRcdFx0XHRtb2RlbENhcGFiaWxpdGllczogeyBzdXBwb3J0czogeyB2aXNpb246IHRydWUgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZ3B0LTUnOiB7XG5cdFx0XHRcdFx0YXZhaWxhYmxlVG9vbHM6IDQyIGFzIG5ldmVyLFxuXHRcdFx0XHRcdGV4Y2x1ZGVkVG9vbHM6IDQyIGFzIG5ldmVyLFxuXHRcdFx0XHRcdG1vZGVsQ2FwYWJpbGl0aWVzOiAnb29wcycgYXMgbmV2ZXIsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pLCBtb2RlbCk7XG5cdFx0Y29uc3Qgbm9uZSA9IGF3YWl0IGJ1aWxkUmVzdW1lQ29uZmlnKGNyZWF0ZUxhdW5jaGVyKHN0b3JlLCB7fSksIG1vZGVsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbXG5cdFx0XHRcdHZhbGlkLm1vZGVsQ2FwYWJpbGl0aWVzLFxuXHRcdFx0XHRpbnZhbGlkLm1vZGVsQ2FwYWJpbGl0aWVzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YXZhaWxhYmxlVG9vbHM6IHdpbGRjYXJkRmFsbGJhY2suYXZhaWxhYmxlVG9vbHMsXG5cdFx0XHRcdFx0ZXhjbHVkZWRUb29sczogd2lsZGNhcmRGYWxsYmFjay5leGNsdWRlZFRvb2xzLFxuXHRcdFx0XHRcdG1vZGVsQ2FwYWJpbGl0aWVzOiB3aWxkY2FyZEZhbGxiYWNrLm1vZGVsQ2FwYWJpbGl0aWVzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRub25lLm1vZGVsQ2FwYWJpbGl0aWVzLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0eyBzdXBwb3J0czogeyB2aXNpb246IGZhbHNlIH0gfSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YXZhaWxhYmxlVG9vbHM6IFsnY3VzdG9tOionXSxcblx0XHRcdFx0XHRleGNsdWRlZFRvb2xzOiBbJ21jcDoqJ10sXG5cdFx0XHRcdFx0bW9kZWxDYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHM6IHsgdmlzaW9uOiB0cnVlIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHRvb2wtc2VhcmNoIHJlZmVyZW5jZSBuYW1lcyB0byB0aGUgU0RLIHJ1bnRpbWUgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbDogTW9kZWxTZWxlY3Rpb24gPSB7IGlkOiAnZ3B0LTUnLCBjb25maWc6IHsgdGhpbmtpbmdMZXZlbDogJ21lZGl1bScgfSB9O1xuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IGJ1aWxkUmVzdW1lQ29uZmlnKGNyZWF0ZUxhdW5jaGVyKHN0b3JlLCB7XG5cdFx0XHRtb2RlbENhcGFiaWxpdHlPdmVycmlkZXM6IHtcblx0XHRcdFx0J2dwdC01Jzoge1xuXHRcdFx0XHRcdGF2YWlsYWJsZVRvb2xzOiBbQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FXSxcblx0XHRcdFx0XHRleGNsdWRlZFRvb2xzOiBbYGN1c3RvbToke0NMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRX1gXSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSksIG1vZGVsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbY29uZmlnLmF2YWlsYWJsZVRvb2xzLCBjb25maWcuZXhjbHVkZWRUb29sc10sXG5cdFx0XHRbW1JVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FXSwgW2BjdXN0b206JHtSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRX1gXV1cblx0XHQpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbCBzZWFyY2ggZ2F0ZXMgb24gdGhlIGZsYWcsIG1vZGVsIHN1cHBvcnQsIGFuZCB0aGUgZmFtaWx5IGFsaWFzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNlYXJjaFNuYXBzaG90ID0ge1xuXHRcdFx0dG9vbHM6IFt7IG5hbWU6IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSwgZGVzY3JpcHRpb246ICdTZWFyY2ggdG9vbHMnLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JyBhcyBjb25zdCwgcHJvcGVydGllczoge30gfSB9XSxcblx0XHRcdHBsdWdpbnM6IFtdLFxuXHRcdFx0bWNwU2VydmVyczoge30sXG5cdFx0fTtcblx0XHRjb25zdCB0b29sU2VhcmNoT2YgPSBhc3luYyAodmFsdWVzOiBTY2hlbWFWYWx1ZXM8dHlwZW9mIGNvcGlsb3RDbGlDb25maWdTY2hlbWEuZGVmaW5pdGlvbj4sIG1vZGVsOiBNb2RlbFNlbGVjdGlvbikgPT5cblx0XHRcdChhd2FpdCBidWlsZFJlc3VtZUNvbmZpZyhjcmVhdGVMYXVuY2hlcihzdG9yZSwgdmFsdWVzKSwgbW9kZWwsIHNlYXJjaFNuYXBzaG90KSkudG9vbFNlYXJjaDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbXG5cdFx0XHRcdC8vIGZsYWcgb2ZmIFx1MjE5MiBkaXNhYmxlZCBldmVuIG9uIGEgc3VwcG9ydGVkIG1vZGVsXG5cdFx0XHRcdGF3YWl0IHRvb2xTZWFyY2hPZih7IHRvb2xTZWFyY2hFbmFibGVkOiBmYWxzZSB9LCB7IGlkOiAnY2xhdWRlLW9wdXMtNC44JyB9KSxcblx0XHRcdFx0Ly8gdW5zdXBwb3J0ZWQgbW9kZWwgXHUyMTkyIGRpc2FibGVkIGV2ZW4gd2l0aCB0aGUgZmxhZyBvblxuXHRcdFx0XHRhd2FpdCB0b29sU2VhcmNoT2YoeyB0b29sU2VhcmNoRW5hYmxlZDogdHJ1ZSB9LCB7IGlkOiAncHJldmlldy1tb2RlbC14JyB9KSxcblx0XHRcdFx0Ly8gYSBmYW1pbHkgYWxpYXMgbWFrZXMgYW4gdW5zdXBwb3J0ZWQgcHJldmlldyBtb2RlbCB0b29sLXNlYXJjaC1jYXBhYmxlXG5cdFx0XHRcdGF3YWl0IHRvb2xTZWFyY2hPZih7IHRvb2xTZWFyY2hFbmFibGVkOiB0cnVlLCBtb2RlbENhcGFiaWxpdHlPdmVycmlkZXM6IHsgJ3ByZXZpZXctbW9kZWwteCc6IHsgZmFtaWx5OiAnY2xhdWRlLW9wdXMtNC44JyB9IH0gfSwgeyBpZDogJ3ByZXZpZXctbW9kZWwteCcgfSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHR7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0eyBlbmFibGVkOiB0cnVlLCBkZWZlclRocmVzaG9sZDogMSB9LFxuXHRcdFx0XVxuXHRcdCk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIG9uZSBsYXVuY2gtdGltZSB0b29sLXNlYXJjaCBkZWNpc2lvbiBmb3IgdGhlIGNvbmZpZyBhbmQgY2xpZW50IHRvb2xzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGRlY2lzaW9uczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3QgbW9kZWw6IE1vZGVsU2VsZWN0aW9uID0geyBpZDogJ2NsYXVkZS1vcHVzLTQuOCcsIGNvbmZpZzogeyB0aGlua2luZ0xldmVsOiAnbWVkaXVtJyB9IH07XG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgYnVpbGRSZXN1bWVDb25maWcoXG5cdFx0XHRjcmVhdGVMYXVuY2hlcihzdG9yZSwge1xuXHRcdFx0XHR0b29sU2VhcmNoRW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzOiB7ICdjbGF1ZGUtb3B1cy00LjgnOiB7IGF2YWlsYWJsZVRvb2xzOiBbJ2N1c3RvbToqJ10gfSB9LFxuXHRcdFx0fSksXG5cdFx0XHRtb2RlbCxcblx0XHRcdHtcblx0XHRcdFx0dG9vbHM6IFt7IG5hbWU6IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSwgZGVzY3JpcHRpb246ICdTZWFyY2ggdG9vbHMnLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSB9XSxcblx0XHRcdFx0cGx1Z2luczogW10sXG5cdFx0XHRcdG1jcFNlcnZlcnM6IHt9LFxuXHRcdFx0fSxcblx0XHRcdHRvb2xTZWFyY2hBY3RpdmUgPT4ge1xuXHRcdFx0XHRkZWNpc2lvbnMucHVzaCh0b29sU2VhcmNoQWN0aXZlKTtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNvbmZpZzogY29uZmlnLnRvb2xTZWFyY2gsIGRlY2lzaW9ucyB9LCB7XG5cdFx0XHRjb25maWc6IHsgZW5hYmxlZDogdHJ1ZSwgZGVmZXJUaHJlc2hvbGQ6IDEgfSxcblx0XHRcdGRlY2lzaW9uczogW3RydWVdLFxuXHRcdH0pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhLHNCQUFzQjtBQUk1QyxTQUFTLDJCQUFtRDtBQUU1RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUE4QztBQUN2RCxTQUFTLG1DQUFtQyxxQ0FBcUM7QUFDakYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxpQ0FBaUMsd0NBQXdDO0FBRWxGLFNBQVMsc0JBQXNCLDZCQUE2QjtBQUM1RCxTQUFTLG9CQUFvQiwyQkFBb0Q7QUFFakYsU0FBUyx3QkFBd0IsdUJBQXVCLDJCQUEyQiwwQkFBMEIsMEJBQTBCLDZCQUE2QiwwQ0FBMEMsK0JBQStCLCtCQUEyRjtBQUV4VSxNQUFNLGNBQXNDO0FBQUEsRUFDM0MseUJBQXlCLFlBQVk7QUFBRSxVQUFNLElBQUksTUFBTSwrQkFBK0I7QUFBQSxFQUFHO0FBQUEsRUFDekYsMkJBQTJCLFlBQVk7QUFBRSxVQUFNLElBQUksTUFBTSxtQ0FBbUM7QUFBQSxFQUFHO0FBQUEsRUFDL0Ysd0JBQXdCLFlBQVk7QUFBRSxVQUFNLElBQUksTUFBTSwrQkFBK0I7QUFBQSxFQUFHO0FBQUEsRUFDeEYsMEJBQTBCLFlBQVk7QUFBRSxVQUFNLElBQUksTUFBTSxnQ0FBZ0M7QUFBQSxFQUFHO0FBQUEsRUFDM0Ysc0JBQXNCLFlBQVk7QUFBRSxVQUFNLElBQUksTUFBTSw2QkFBNkI7QUFBQSxFQUFHO0FBQUEsRUFDcEYsdUNBQXVDLFlBQVk7QUFBQSxFQUNuRCxrQkFBa0IsWUFBWTtBQUFBLEVBQUU7QUFBQSxFQUNoQyxtQkFBbUIsWUFBWTtBQUFBLEVBQUU7QUFBQSxFQUNqQywyQkFBMkIsTUFBTTtBQUFBLEVBQ2pDLHNCQUFzQixNQUFNLENBQUM7QUFBQSxFQUM3QixzQkFBc0IsTUFBTSxDQUFDO0FBQzlCO0FBRUEsTUFBTSx1QkFBdUIsSUFBSSxLQUFLLFFBQVEsSUFBSSxDQUFDO0FBRW5ELFNBQVMsbUJBQW1CLDRCQUFtRSxhQUE0RCxDQUFDLEdBQTJCO0FBQ3RMLFFBQU0sdUJBQXVCO0FBQUEsSUFDNUIsY0FBYyxDQUFDLFNBQWtCLFFBQTZCLFdBQVcsR0FBRztBQUFBLEVBQzdFO0FBQ0EsU0FBTyxJQUFJO0FBQUEsSUFDVjtBQUFBLElBQ0EsRUFBRSxhQUFhLDhCQUE4QixDQUFDLEVBQUU7QUFBQSxJQUNoRCxDQUFDO0FBQUEsSUFDRCxJQUFJLGVBQWU7QUFBQSxJQUNuQixDQUFDO0FBQUEsSUFDRCxFQUFFLGVBQWUsUUFBVyxPQUFPLFlBQVk7QUFBRSxZQUFNLElBQUksTUFBTSx3QkFBd0I7QUFBQSxJQUFHLEdBQUcsU0FBUyxNQUFNO0FBQUEsSUFBRSxFQUFFO0FBQUEsSUFDbEgsSUFBSSxxQkFBcUI7QUFBQSxJQUN6QjtBQUFBLE1BQ0MsZUFBZTtBQUFBLE1BQ2Ysd0JBQXdCLE1BQU07QUFBQSxNQUM5Qiw0QkFBNEIsTUFBTTtBQUFBLE1BQUU7QUFBQSxNQUNwQyxrQkFBa0IsQ0FBSSxVQUFxQixPQUFtQixHQUFHO0FBQUEsSUFDbEU7QUFBQSxFQUNEO0FBQ0Q7QUFZQSxNQUFNLDRCQUE0QixNQUFNO0FBRXZDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsUUFBTSxZQUFZO0FBQ2xCLFFBQU0sTUFBTSxJQUFJLGVBQWU7QUFNL0IsV0FBUyxhQUFhLFFBQTRCLE9BQXdDLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxJQUE2QjtBQUNoSixVQUFNLFVBQVUsTUFBTSxJQUFJLElBQUksUUFBNEI7QUFBQSxNQUN6RCx1QkFBdUIsTUFBTSxRQUFRLEtBQUssTUFBTTtBQUFBLElBQ2pELENBQUMsQ0FBQztBQUNGLFdBQU8sRUFBRSxNQUFNLG1CQUFtQixRQUFRLE1BQU07QUFBQSxFQUNqRDtBQUdBLFdBQVMsZ0JBQWdCO0FBQ3hCLFFBQUksU0FBUztBQUNiLFVBQU0sU0FBNkI7QUFBQSxNQUNsQyxTQUFTO0FBQUEsTUFDVCxPQUFPO0FBQUEsTUFDUCxpQkFBaUIsWUFBVSx3QkFBd0IsTUFBTTtBQUFBLE1BQ3pELFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNsQjtBQUNBLFdBQU87QUFBQSxNQUNOLElBQUksU0FBUztBQUFFLGVBQU87QUFBQSxNQUFRO0FBQUEsTUFDOUIsWUFBWSxZQUFZO0FBQUU7QUFBVSxlQUFPO0FBQUEsTUFBUTtBQUFBLElBQ3BEO0FBQUEsRUFDRDtBQUVBLE9BQUsscUVBQXFFLFlBQVk7QUFDckYsVUFBTSxXQUFXLElBQUkscUJBQXFCO0FBQzFDLFVBQU0sUUFBUSxjQUFjO0FBRTVCLFVBQU0sU0FBUyxNQUFNLHlCQUF5QixXQUFXLFVBQVUsTUFBTSxZQUFZLEdBQUc7QUFFeEYsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDbkMsQ0FBQztBQUVELE9BQUssOEVBQThFLFlBQVk7QUFDOUYsVUFBTSxXQUFXLElBQUkscUJBQXFCO0FBQzFDLFVBQU0sZUFBZSxTQUFTLFNBQVMsWUFBWSxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQ25FLFVBQU0sUUFBUSxjQUFjO0FBRTVCLFVBQU0sU0FBUyxNQUFNLHlCQUF5QixXQUFXLFVBQVUsTUFBTSxZQUFZLEdBQUc7QUFDeEYsaUJBQWEsUUFBUTtBQUVyQixXQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxRQUFRLENBQUM7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSyxzRkFBc0YsWUFBWTtBQUN0RyxVQUFNLFdBQVcsSUFBSSxxQkFBcUI7QUFHMUMsVUFBTSxlQUFlLFNBQVMsU0FBUyxZQUFZLEVBQUUsTUFBTSxhQUF5QyxFQUFFLFFBQVEsQ0FBQyxFQUFFLElBQUksbUJBQW1CLE1BQU0sS0FBSyxDQUFDO0FBQ3BKLFVBQU0sUUFBUSxjQUFjO0FBRTVCLFVBQU0sU0FBUyxNQUFNLHlCQUF5QixXQUFXLFVBQVUsTUFBTSxZQUFZLEdBQUc7QUFDeEYsaUJBQWEsUUFBUTtBQUVyQixXQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxRQUFRLENBQUM7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLFdBQVcsSUFBSSxxQkFBcUI7QUFDMUMsVUFBTSxlQUFlLFNBQVMsU0FBUyxZQUFZLGFBQWE7QUFBQSxNQUMvRCxFQUFFLFFBQVEsUUFBUSxJQUFJLFVBQVUsTUFBTSxlQUFlLHdCQUF3QixJQUFPO0FBQUEsTUFDcEYsRUFBRSxRQUFRLFFBQVEsSUFBSSxPQUFPLE1BQU0sUUFBVyx3QkFBd0IsT0FBVTtBQUFBLE1BQ2hGLEVBQUUsUUFBUSxVQUFVLElBQUksU0FBUyxNQUFNLGVBQWU7QUFBQSxJQUN2RCxDQUFDLENBQUM7QUFDRixVQUFNLFFBQVEsY0FBYztBQUU1QixVQUFNLFNBQVMsTUFBTSx5QkFBeUIsV0FBVyxVQUFVLE1BQU0sWUFBWSxHQUFHO0FBQ3hGLGlCQUFhLFFBQVE7QUFFckIsV0FBTyxZQUFZLE1BQU0sUUFBUSxDQUFDO0FBQ2xDLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixXQUFXO0FBQUEsUUFDVixFQUFFLE1BQU0sUUFBUSxNQUFNLFVBQVUsU0FBUyxhQUFhLFNBQVMsNkJBQTZCLGFBQWEsZUFBZTtBQUFBLFFBQ3hILEVBQUUsTUFBTSxVQUFVLE1BQU0sVUFBVSxTQUFTLGFBQWEsU0FBUywrQkFBK0IsYUFBYSxlQUFlO0FBQUEsTUFDN0g7QUFBQSxNQUNBLFFBQVE7QUFBQSxRQUNQLEVBQUUsSUFBSSxVQUFVLFVBQVUsUUFBUSxNQUFNLGVBQWUsd0JBQXdCLElBQU87QUFBQSxRQUN0RixFQUFFLElBQUksT0FBTyxVQUFVLE9BQU87QUFBQSxRQUM5QixFQUFFLElBQUksU0FBUyxVQUFVLFVBQVUsTUFBTSxlQUFlO0FBQUEsTUFDekQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtEQUErRCxZQUFZO0FBQy9FLFVBQU0sV0FBVyxJQUFJLHFCQUFxQjtBQUMxQyxVQUFNLGVBQWUsU0FBUyxTQUFTLFlBQVksYUFBYTtBQUFBLE1BQy9ELEVBQUUsUUFBUSxVQUFVLElBQUksa0JBQWtCLGlCQUFpQix3Q0FBd0M7QUFBQSxNQUNuRyxFQUFFLFFBQVEsVUFBVSxJQUFJLGtCQUFrQixpQkFBaUIsb0NBQW9DO0FBQUEsSUFDaEcsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxRQUFRLGNBQWM7QUFFNUIsVUFBTSxTQUFTLE1BQU0seUJBQXlCLFdBQVcsVUFBVSxNQUFNLFlBQVksR0FBRztBQUN4RixpQkFBYSxRQUFRO0FBRXJCLFdBQU8sZ0JBQWdCLE9BQU8sUUFBUTtBQUFBLE1BQ3JDLEVBQUUsSUFBSSxrQ0FBa0MsVUFBVSxTQUFTO0FBQUEsTUFDM0QsRUFBRSxJQUFJLDhCQUE4QixVQUFVLFNBQVM7QUFBQSxJQUN4RCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5RUFBeUUsWUFBWTtBQUN6RixVQUFNLFdBQVcsSUFBSSxxQkFBcUI7QUFDMUMsUUFBSTtBQUNKLFVBQU0sZUFBZSxTQUFTLFNBQVMsWUFBWTtBQUFBLE1BQ2xELENBQUMsRUFBRSxRQUFRLFFBQVEsSUFBSSxTQUFTLENBQUM7QUFBQSxNQUNqQyxPQUFPLFlBQVk7QUFDbEIsbUJBQVc7QUFDWCxlQUFPLEVBQUUsUUFBUSxDQUFDLEVBQUUsTUFBTSxXQUFXLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxNQUFNLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxFQUFFO0FBQUEsTUFDOUY7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFVBQVUsSUFBSSxtQkFBbUIsS0FBSyxRQUFRO0FBQ3BELFFBQUk7QUFFSixVQUFNLFNBQVMsTUFBTSx5QkFBeUIsV0FBVyxVQUFVLFlBQWEsU0FBUyxNQUFNLFFBQVEsTUFBTSxHQUFJLEdBQUc7QUFDcEgsVUFBTSxXQUFXLE9BQU8sVUFBVyxDQUFDO0FBQ3BDLFVBQU0sUUFBUSxPQUFPLE9BQVEsQ0FBQztBQUM5QixRQUFJO0FBQ0gsWUFBTSxXQUFXLE1BQU0sTUFBTSxHQUFHLFNBQVMsT0FBTyxjQUFjO0FBQUEsUUFDN0QsUUFBUTtBQUFBLFFBQ1IsU0FBUyxFQUFFLGdCQUFnQixvQkFBb0IsaUJBQWlCLFVBQVUsU0FBUyxXQUFXLEdBQUc7QUFBQSxRQUNqRyxNQUFNLEtBQUssVUFBVSxFQUFFLE9BQU8sTUFBTSxJQUFJLE9BQU8sQ0FBQyxFQUFFLE1BQU0sV0FBVyxNQUFNLFFBQVEsU0FBUyxDQUFDLEVBQUUsTUFBTSxjQUFjLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUNwSSxDQUFDO0FBQ0QsYUFBTyxZQUFZLFNBQVMsUUFBUSxHQUFHO0FBQ3ZDLFlBQU0sT0FBTyxNQUFNLFNBQVMsS0FBSztBQUNqQyxhQUFPLEdBQUcsS0FBSyxTQUFTLGlCQUFpQixHQUFHLDRCQUE0QixJQUFJLEVBQUU7QUFBQSxJQUMvRSxVQUFFO0FBQ0QsY0FBUSxRQUFRO0FBQ2hCLG1CQUFhLFFBQVE7QUFDckIsY0FBUSxRQUFRO0FBQUEsSUFDakI7QUFDQSxXQUFPLFlBQVksVUFBVSxRQUFRLE1BQU07QUFDM0MsV0FBTyxZQUFZLFVBQVUsU0FBUyxRQUFRO0FBQUEsRUFDL0MsQ0FBQztBQUVELE9BQUssNERBQTRELFlBQVk7QUFDNUUsVUFBTSxXQUFXLElBQUkscUJBQXFCO0FBQzFDLFVBQU0sVUFBVSxNQUFNLElBQUksSUFBSSxRQUE0QixDQUFDO0FBQzNELFVBQU0sZUFBZSxTQUFTLFNBQVMsWUFBWTtBQUFBLE1BQ2xELE1BQU0sYUFBeUMsRUFBRSxRQUFRLENBQUMsRUFBRTtBQUFBLE1BQzVELG1CQUFtQixRQUFRO0FBQUEsSUFDNUIsQ0FBQztBQUNELFVBQU0sUUFBUSxjQUFjO0FBSTVCLFlBQVEsS0FBSyxDQUFDLENBQUM7QUFDZixZQUFRLEtBQUssQ0FBQyxFQUFFLFFBQVEsUUFBUSxJQUFJLFVBQVUsTUFBTSxjQUFjLENBQUMsQ0FBQztBQUVwRSxVQUFNLFNBQVMsTUFBTSx5QkFBeUIsV0FBVyxVQUFVLE1BQU0sWUFBWSxHQUFHO0FBQ3hGLGlCQUFhLFFBQVE7QUFFckIsV0FBTyxnQkFBZ0IsT0FBTyxRQUFRLENBQUMsRUFBRSxJQUFJLFVBQVUsVUFBVSxRQUFRLE1BQU0sY0FBYyxDQUFDLENBQUM7QUFBQSxFQUNoRyxDQUFDO0FBQ0YsQ0FBQztBQVNELE1BQU0sK0NBQStDLE1BQU07QUFFMUQsMENBQXdDO0FBRXhDLFFBQU0sWUFBWTtBQU1sQixXQUFTLGFBQWEsT0FBd0IsUUFBcUQ7QUFDbEcsVUFBTSxVQUFVLE1BQU0sSUFBSSxJQUFJLFFBQTRCO0FBQUEsTUFDekQsdUJBQXVCLE1BQU0sUUFBUSxLQUFLLE1BQU07QUFBQSxJQUNqRCxDQUFDLENBQUM7QUFDRixXQUFPLEVBQUUsTUFBTSxhQUF5QyxFQUFFLFFBQVEsQ0FBQyxFQUFFLElBQUksbUJBQW1CLFFBQVEsTUFBTTtBQUFBLEVBQzNHO0FBR0EsV0FBUyxtQkFBbUI7QUFDM0IsUUFBSSxTQUFTO0FBQ2IsUUFBSSxXQUFXO0FBQ2YsVUFBTSxVQUErQjtBQUFBLE1BQ3BDLGVBQWU7QUFBQSxNQUNmLE9BQU8sWUFBeUM7QUFDL0MsY0FBTSxRQUFRLFNBQVMsRUFBRSxNQUFNO0FBQy9CLGVBQU87QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNUO0FBQUEsVUFDQSxpQkFBaUIsWUFBVSx3QkFBd0IsTUFBTTtBQUFBLFVBQ3pELFNBQVMsTUFBTTtBQUFFO0FBQUEsVUFBWTtBQUFBLFFBQzlCO0FBQUEsTUFDRDtBQUFBLE1BQ0EsU0FBUyxNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ2xCO0FBQ0EsV0FBTyxFQUFFLFNBQVMsSUFBSSxTQUFTO0FBQUUsYUFBTztBQUFBLElBQVEsR0FBRyxJQUFJLFdBQVc7QUFBRSxhQUFPO0FBQUEsSUFBVSxFQUFFO0FBQUEsRUFDeEY7QUFFQSxXQUFTLGVBQWUsT0FBd0IsT0FBNEIsVUFBeUQ7QUFDcEksVUFBTSxXQUFXLElBQUksa0JBQWtCO0FBQ3ZDLGFBQVMsSUFBSSxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzlDLGFBQVMsSUFBSSxxQkFBcUIsS0FBSztBQUN2QyxhQUFTLElBQUksdUJBQXVCLFFBQVE7QUFHNUMsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkscUJBQXFCLFFBQVEsQ0FBQztBQUN6RSxXQUFPLHFCQUFxQixlQUFlLHNCQUFzQjtBQUFBLEVBQ2xFO0FBRUEsT0FBSyxzR0FBc0csWUFBWTtBQUN0SCxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxRQUFRLGlCQUFpQjtBQUMvQixVQUFNLFdBQVcsSUFBSSxxQkFBcUI7QUFDMUMsVUFBTSxJQUFJLFNBQVMsU0FBUyxZQUFZLGFBQWEsT0FBTyxDQUFDLEVBQUUsUUFBUSxRQUFRLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hHLFVBQU0sV0FBVyxlQUFlLE9BQU8sTUFBTSxTQUFTLFFBQVE7QUFDOUQsVUFBTSxVQUFVLE1BQU8sU0FBc0gsMEJBQTBCLFNBQVM7QUFFaEwsVUFBTSxRQUFRLE1BQU0sUUFBUTtBQUM1QixVQUFNLFNBQVMsTUFBTSxRQUFRO0FBQzdCLFdBQU8sWUFBWSxNQUFNLFFBQVEsR0FBRyw2Q0FBNkM7QUFDakYsV0FBTyxZQUFZLE1BQU0sVUFBVyxDQUFDLEVBQUUsYUFBYSxPQUFPLFVBQVcsQ0FBQyxFQUFFLGFBQWEsa0NBQWtDO0FBRXhILFVBQU0sU0FBUyx1QkFBdUI7QUFDdEMsVUFBTSxTQUFTLHVCQUF1QjtBQUN0QyxXQUFPLFlBQVksTUFBTSxVQUFVLEdBQUcsZ0VBQWdFO0FBRXRHLFVBQU0sUUFBUSxNQUFNLFFBQVE7QUFDNUIsV0FBTyxZQUFZLE1BQU0sUUFBUSxHQUFHLHVDQUF1QztBQUMzRSxXQUFPLGVBQWUsTUFBTSxVQUFXLENBQUMsRUFBRSxhQUFhLE1BQU0sVUFBVyxDQUFDLEVBQUUsYUFBYSxvQ0FBb0M7QUFFNUgsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sZ0RBQWdELE1BQU07QUFFM0QsMENBQXdDO0FBRXhDLE9BQUssK0ZBQStGLFlBQVk7QUFDL0csVUFBTSxnQkFBaUUsQ0FBQztBQUN4RSxVQUFNLGdCQUFpRSxDQUFDO0FBQ3hFLFVBQU0sVUFBVTtBQUFBLE1BQ2YsV0FBVztBQUFBLE1BQ1gsSUFBSSxNQUFNLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDbEIsWUFBWSxZQUFZO0FBQUEsTUFBRTtBQUFBLElBQzNCO0FBQ0EsVUFBTSxTQUFTO0FBQUEsTUFDZCxlQUFlLE9BQU8sV0FBMEQ7QUFDL0Usc0JBQWMsS0FBSyxNQUFNO0FBQ3pCLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxlQUFlLE9BQU8sWUFBb0IsV0FBMEQ7QUFDbkcsc0JBQWMsS0FBSyxNQUFNO0FBQ3pCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFVBQU0sNkJBQW1FO0FBQUEsTUFDeEUsOEJBQThCO0FBQUEsTUFDOUIsS0FBSyxDQUFDLE9BQU87QUFBQSxJQUNkO0FBQ0EsVUFBTSxXQUFXLG1CQUFtQiwwQkFBMEI7QUFDOUQsVUFBTSxZQUFZLElBQUksS0FBSyw0QkFBNEI7QUFDdkQsVUFBTSxXQUFXLElBQUksU0FBUyxXQUFXLFVBQVUsY0FBYyxVQUFVO0FBQzNFLFVBQU0saUJBQWlCLElBQUksU0FBUyxXQUFXLFNBQVMsc0JBQXNCO0FBQzlFLFVBQU0sU0FBNkI7QUFBQSxNQUNsQyxRQUFRLGFBQWE7QUFBQSxNQUNyQixPQUFPLENBQUM7QUFBQSxNQUNSLFlBQVksQ0FBQztBQUFBLE1BQ2Isb0JBQW9CLENBQUMsU0FBUyxPQUFPO0FBQUEsTUFDckMsUUFBUSxDQUFDO0FBQUEsTUFDVCxRQUFRLENBQUM7QUFBQSxRQUNSLEtBQUs7QUFBQSxRQUNMLE1BQU07QUFBQSxRQUNOLGVBQWUsRUFBRSxNQUFNLGtCQUFrQixPQUFPLElBQUksU0FBUyxTQUFTLEdBQUcsS0FBSyxTQUFTLFNBQVMsR0FBRyxNQUFNLGFBQWE7QUFBQSxNQUN2SCxDQUFDO0FBQUEsTUFDRCxjQUFjLENBQUM7QUFBQSxRQUNkLEtBQUs7QUFBQSxRQUNMLE1BQU07QUFBQSxRQUNOLGVBQWUsRUFBRSxNQUFNLGtCQUFrQixNQUFNLElBQUksZUFBZSxTQUFTLEdBQUcsS0FBSyxlQUFlLFNBQVMsR0FBRyxNQUFNLFFBQVEsYUFBYSxLQUFLO0FBQUEsTUFDL0ksQ0FBQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBLFdBQVc7QUFBQSxNQUNYLGtCQUFrQjtBQUFBLE1BQ2xCLG1CQUFtQjtBQUFBLE1BQ25CLFVBQVUsRUFBRSxPQUFPLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxHQUFHLFlBQVksQ0FBQyxFQUFFO0FBQUEsTUFDekQsd0JBQXdCLENBQUMsVUFBVSxPQUFPO0FBQUEsTUFDMUMscUJBQXFCLElBQUksb0JBQW9CO0FBQUEsTUFDN0MsY0FBYztBQUFBLE1BQ2QsYUFBYTtBQUFBLElBQ2Q7QUFDQSxVQUFNLGFBQXVDO0FBQUEsTUFDNUMsR0FBRztBQUFBLE1BQ0gsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGFBQXVDO0FBQUEsTUFDNUMsR0FBRztBQUFBLE1BQ0gsTUFBTTtBQUFBLE1BQ04sVUFBVSxFQUFFLE9BQU8sT0FBVTtBQUFBLElBQzlCO0FBRUEsVUFBTSxXQUFXLElBQUksZ0JBQWdCO0FBQ3JDLFFBQUk7QUFDSCxlQUFTLElBQUksTUFBTSxTQUFTLE9BQU8sWUFBWSxXQUFXLENBQUM7QUFDM0QsZUFBUyxJQUFJLE1BQU0sU0FBUyxPQUFPLFlBQVksV0FBVyxDQUFDO0FBRTNELGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsa0JBQWtCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDbkMsMkJBQTJCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDNUMseUJBQXlCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDMUMsd0JBQXdCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDekMsOEJBQThCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDL0MsMEJBQTBCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDM0MsMEJBQTBCLE9BQU8sY0FBYyxDQUFDLEVBQUUsMEJBQTBCO0FBQUEsUUFDNUUsbUJBQW1CLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDcEMsdUJBQXVCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDeEMsa0JBQWtCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDbkMsMkJBQTJCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDNUMseUJBQXlCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDMUMsd0JBQXdCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDekMsOEJBQThCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDL0MsMEJBQTBCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDM0MsMEJBQTBCLE9BQU8sY0FBYyxDQUFDLEVBQUUsMEJBQTBCO0FBQUEsUUFDNUUsbUJBQW1CLGNBQWMsQ0FBQyxFQUFFO0FBQUEsUUFDcEMsdUJBQXVCLGNBQWMsQ0FBQyxFQUFFO0FBQUEsTUFDekMsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCO0FBQUEsUUFDbEIsMkJBQTJCLEVBQUUscUJBQXFCLEtBQUs7QUFBQSxRQUN2RCx5QkFBeUIsQ0FBQyxVQUFVLE1BQU07QUFBQSxRQUMxQyx3QkFBd0IsQ0FBQztBQUFBLFFBQ3pCLDhCQUE4QixDQUFDLElBQUksU0FBUyxXQUFXLE9BQU8sRUFBRSxNQUFNO0FBQUEsUUFDdEUsMEJBQTBCLENBQUMsU0FBUyxRQUFRO0FBQUEsUUFDNUMsMEJBQTBCO0FBQUEsUUFDMUIsbUJBQW1CLEVBQUUsY0FBYyxLQUFLO0FBQUEsUUFDeEMsdUJBQXVCLEVBQUUsYUFBYSwyQkFBMkI7QUFBQSxRQUNqRSxrQkFBa0I7QUFBQSxRQUNsQiwyQkFBMkIsRUFBRSxxQkFBcUIsS0FBSztBQUFBLFFBQ3ZELHlCQUF5QixDQUFDLFVBQVUsTUFBTTtBQUFBLFFBQzFDLHdCQUF3QixDQUFDO0FBQUEsUUFDekIsOEJBQThCLENBQUMsSUFBSSxTQUFTLFdBQVcsT0FBTyxFQUFFLE1BQU07QUFBQSxRQUN0RSwwQkFBMEIsQ0FBQyxTQUFTLFFBQVE7QUFBQSxRQUM1QywwQkFBMEI7QUFBQSxRQUMxQixtQkFBbUIsRUFBRSxjQUFjLEtBQUs7QUFBQSxRQUN4Qyx1QkFBdUIsRUFBRSxhQUFhLDJCQUEyQjtBQUFBLE1BQ2xFLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxlQUFTLFFBQVE7QUFDakIsWUFBTSxTQUFTLHVCQUF1QjtBQUFBLElBQ3ZDO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sMENBQTBDLE1BQU07QUFFckQsMENBQXdDO0FBQUEsRUFFeEMsTUFBTSxxQkFBcUIsTUFBTTtBQUFBLElBQ2hDLFlBQVksU0FBMEIsTUFBYztBQUNuRCxZQUFNLE9BQU87QUFEd0I7QUFBQSxJQUV0QztBQUFBLEVBQ0Q7QUFFQSxXQUFTLDBCQUEwQixTQUFpQixPQUFPLFFBQThJO0FBQ3hNLFFBQUkscUJBQXFCO0FBQ3pCLFVBQU0sVUFBVTtBQUFBLE1BQ2YsV0FBVztBQUFBLE1BQ1gsSUFBSSxNQUFNLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDbEIsWUFBWSxZQUFZO0FBQUEsTUFBRTtBQUFBLElBQzNCO0FBQ0EsVUFBTSxTQUFTO0FBQUEsTUFDZCxlQUFlLFlBQVk7QUFDMUI7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsZUFBZSxZQUFZO0FBQzFCLGNBQU0sSUFBSSxhQUFhLFNBQVMsSUFBSTtBQUFBLE1BQ3JDO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxNQUNOLFVBQVUsbUJBQW1CO0FBQUEsTUFDN0IsTUFBTTtBQUFBLFFBQ0w7QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYLGtCQUFrQjtBQUFBLFFBQ2xCLG1CQUFtQjtBQUFBLFFBQ25CLFVBQVUsRUFBRSxPQUFPLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxZQUFZLENBQUMsRUFBRTtBQUFBLFFBQ25ELHFCQUFxQixJQUFJLG9CQUFvQjtBQUFBLFFBQzdDLGNBQWM7QUFBQSxRQUNkLGFBQWE7QUFBQSxRQUNiLE1BQU07QUFBQSxRQUNOLFVBQVUsRUFBRSxPQUFPLE9BQVU7QUFBQSxNQUM5QjtBQUFBLE1BQ0EsdUJBQXVCLE1BQU07QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFFQSxPQUFLLG9GQUFvRixZQUFZO0FBQ3BHLFVBQU0sRUFBRSxVQUFVLE1BQU0sc0JBQXNCLElBQUksMEJBQTBCLDZIQUE2SDtBQUV6TSxVQUFNLFdBQVcsSUFBSSxnQkFBZ0I7QUFDckMsUUFBSTtBQUNILGVBQVMsSUFBSSxNQUFNLFNBQVMsT0FBTyxNQUFNLFdBQVcsQ0FBQztBQUNyRCxhQUFPLFlBQVksc0JBQXNCLEdBQUcsQ0FBQztBQUFBLElBQzlDLFVBQUU7QUFDRCxlQUFTLFFBQVE7QUFDakIsWUFBTSxTQUFTLHVCQUF1QjtBQUFBLElBQ3ZDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw4RUFBOEUsWUFBWTtBQUM5RixVQUFNLEVBQUUsVUFBVSxNQUFNLHNCQUFzQixJQUFJLDBCQUEwQiwwRUFBMEU7QUFFdEosVUFBTSxXQUFXLElBQUksZ0JBQWdCO0FBQ3JDLFFBQUk7QUFDSCxlQUFTLElBQUksTUFBTSxTQUFTLE9BQU8sTUFBTSxXQUFXLENBQUM7QUFDckQsYUFBTyxZQUFZLHNCQUFzQixHQUFHLENBQUM7QUFBQSxJQUM5QyxVQUFFO0FBQ0QsZUFBUyxRQUFRO0FBQ2pCLFlBQU0sU0FBUyx1QkFBdUI7QUFBQSxJQUN2QztBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0ZBQWtGLFlBQVk7QUFJbEcsVUFBTSxFQUFFLFVBQVUsTUFBTSxzQkFBc0IsSUFBSSwwQkFBMEIsZ0tBQWdLO0FBRTVPLFFBQUk7QUFDSCxZQUFNLE9BQU8sUUFBUSxNQUFNLFNBQVMsT0FBTyxNQUFNLFdBQVcsR0FBRyxzQkFBc0I7QUFDckYsYUFBTyxZQUFZLHNCQUFzQixHQUFHLENBQUM7QUFBQSxJQUM5QyxVQUFFO0FBQ0QsWUFBTSxTQUFTLHVCQUF1QjtBQUFBLElBQ3ZDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyRUFBMkUsWUFBWTtBQUMzRixVQUFNLEVBQUUsVUFBVSxNQUFNLHNCQUFzQixJQUFJLDBCQUEwQixxREFBcUQ7QUFFakksUUFBSTtBQUNILFlBQU0sT0FBTyxRQUFRLE1BQU0sU0FBUyxPQUFPLE1BQU0sV0FBVyxHQUFHLHNCQUFzQjtBQUNyRixhQUFPLFlBQVksc0JBQXNCLEdBQUcsQ0FBQztBQUFBLElBQzlDLFVBQUU7QUFDRCxZQUFNLFNBQVMsdUJBQXVCO0FBQUEsSUFDdkM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFVBQU0sRUFBRSxVQUFVLE1BQU0sc0JBQXNCLElBQUksMEJBQTBCLG9MQUFvTDtBQUVoUSxRQUFJO0FBQ0gsWUFBTSxPQUFPLFFBQVEsTUFBTSxTQUFTLE9BQU8sTUFBTSxXQUFXLEdBQUcsMkJBQTJCO0FBQzFGLGFBQU8sWUFBWSxzQkFBc0IsR0FBRyxDQUFDO0FBQUEsSUFDOUMsVUFBRTtBQUNELFlBQU0sU0FBUyx1QkFBdUI7QUFBQSxJQUN2QztBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLG9DQUFvQyxNQUFNO0FBRS9DLDBDQUF3QztBQUV4QyxXQUFTLGVBQWUsV0FBcUM7QUFDNUQsVUFBTSxXQUFXLG1CQUFtQjtBQUdwQyxVQUFNLFVBQVU7QUFBQSxNQUNmLEtBQUs7QUFBQSxRQUNKLFNBQVM7QUFBQSxVQUNSLFFBQVEsT0FBTyxZQUFxQixRQUFRLEtBQUssT0FBTztBQUFBLFFBQ3pEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLFNBQVMsZ0JBQWdCLFNBQVMsV0FBVyxXQUFXO0FBQUEsRUFDaEU7QUFFQSxRQUFNLFVBQXFCLENBQUM7QUFFNUIsUUFBTSxNQUFNLFFBQVEsU0FBUyxDQUFDO0FBRTlCLE9BQUssb0NBQW9DLFlBQVk7QUFDcEQsVUFBTSxlQUFlLE1BQU07QUFFM0IsV0FBTyxnQkFBZ0IsU0FBUyxDQUFDLEVBQUUsV0FBVyxPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ3hELENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSw0Q0FBNEMsTUFBTTtBQUV2RCwwQ0FBd0M7QUFFeEMsV0FBUyxzQkFBc0Isa0JBQW1EO0FBQ2pGLFVBQU0sV0FBVyxtQkFBbUI7QUFHcEMsVUFBTSxVQUFVO0FBQUEsTUFDZixLQUFLO0FBQUEsUUFDSixTQUFTO0FBQUEsVUFDUixRQUFRLE9BQU8sWUFBcUIsUUFBUSxLQUFLLE9BQU87QUFBQSxRQUN6RDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTyxTQUFTLHVCQUF1QixTQUFTLGtCQUFrQixXQUFXO0FBQUEsRUFDOUU7QUFFQSxRQUFNLFVBQXFCLENBQUM7QUFFNUIsUUFBTSxNQUFNLFFBQVEsU0FBUyxDQUFDO0FBRTlCLE9BQUssNENBQTRDLFlBQVk7QUFDNUQsVUFBTSxzQkFBc0IsVUFBVTtBQUV0QyxXQUFPLGdCQUFnQixTQUFTLENBQUMsRUFBRSxrQkFBa0IsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUNuRSxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0saURBQWlELE1BQU07QUFFNUQsMENBQXdDO0FBRXhDLE9BQUssOEVBQThFLFlBQVk7QUFDOUYsVUFBTSxVQUFxQixDQUFDO0FBQzVCLFVBQU0sV0FBVyxtQkFBbUIsUUFBVyxFQUFFLENBQUMsb0JBQW9CLGdCQUFnQixHQUFHLEtBQUssQ0FBQztBQUcvRixVQUFNLFVBQVU7QUFBQSxNQUNmLEtBQUs7QUFBQSxRQUNKLFNBQVM7QUFBQSxVQUNSLFFBQVEsT0FBTyxZQUFxQixRQUFRLEtBQUssT0FBTztBQUFBLFFBQ3pEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsMEJBQTBCLFNBQVMsV0FBVztBQUU3RCxXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0IsRUFBRSxXQUFXLFNBQVM7QUFBQSxNQUN0QixFQUFFLGtCQUFrQixVQUFVO0FBQUEsSUFDL0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkVBQTZFLFlBQVk7QUFDN0YsZUFBVyxvQkFBb0IsQ0FBQyxRQUFXLEtBQUssR0FBRztBQUNsRCxZQUFNLFVBQXFCLENBQUM7QUFDNUIsWUFBTSxXQUFXLG1CQUFtQixRQUFXLEVBQUUsQ0FBQyxvQkFBb0IsZ0JBQWdCLEdBQUcsaUJBQWlCLENBQUM7QUFHM0csWUFBTSxVQUFVO0FBQUEsUUFDZixLQUFLLEVBQUUsU0FBUyxFQUFFLFFBQVEsT0FBTyxZQUFxQixRQUFRLEtBQUssT0FBTyxFQUFFLEVBQUU7QUFBQSxNQUMvRTtBQUVBLFlBQU0sU0FBUywwQkFBMEIsU0FBUyxXQUFXO0FBRTdELGFBQU8sZ0JBQWdCLFNBQVMsQ0FBQyxFQUFFLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFBQSxJQUMxRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0VBQW9FLFlBQVk7QUFDcEYsVUFBTSxVQUFxQixDQUFDO0FBQzVCLFVBQU0sVUFBVTtBQUFBLE1BQ2YsV0FBVztBQUFBLE1BQ1gsSUFBSSxNQUFNLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDbEIsWUFBWSxZQUFZO0FBQUEsTUFBRTtBQUFBLE1BQzFCLEtBQUssRUFBRSxTQUFTLEVBQUUsUUFBUSxPQUFPLFlBQXFCLFFBQVEsS0FBSyxPQUFPLEVBQUUsRUFBRTtBQUFBLElBQy9FO0FBQ0EsVUFBTSxXQUFXLG1CQUFtQixRQUFXLEVBQUUsQ0FBQyxvQkFBb0IsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO0FBQy9GLFVBQU0sT0FBaUM7QUFBQSxNQUN0QyxNQUFNO0FBQUEsTUFDTixRQUFRLEVBQUUsZUFBZSxZQUFZLFFBQVE7QUFBQSxNQUM3QyxXQUFXO0FBQUEsTUFDWCxrQkFBa0I7QUFBQSxNQUNsQixtQkFBbUI7QUFBQSxNQUNuQixVQUFVLEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsWUFBWSxDQUFDLEVBQUU7QUFBQSxNQUNuRCxxQkFBcUIsSUFBSSxvQkFBb0I7QUFBQSxNQUM3QyxjQUFjO0FBQUEsTUFDZCxhQUFhO0FBQUEsTUFDYixVQUFVLEVBQUUsT0FBTyxFQUFFLElBQUksZUFBZSxRQUFRLENBQUMsRUFBRSxFQUFFO0FBQUEsSUFDdEQ7QUFFQSxVQUFNLFVBQVUsTUFBTSxTQUFTLE9BQU8sTUFBTSxXQUFXO0FBQ3ZELFFBQUk7QUFDSCxhQUFPLGdCQUFnQixTQUFTO0FBQUEsUUFDL0IsRUFBRSxXQUFXLFNBQVM7QUFBQSxRQUN0QixFQUFFLGtCQUFrQixVQUFVO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELGNBQVEsUUFBUTtBQUNoQixZQUFNLFNBQVMsdUJBQXVCO0FBQUEsSUFDdkM7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDO0FBT0QsTUFBTSw2QkFBNkIsTUFBTTtBQUV4QywwQ0FBd0M7QUFFeEMsT0FBSyx5RkFBeUYsTUFBTTtBQUNuRyxVQUFNLFFBQXdCLEVBQUUsSUFBSSxTQUFTLFFBQVEsRUFBRSxlQUFlLFNBQVMsRUFBRTtBQUNqRixXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsMEJBQTBCLEtBQUs7QUFBQSxRQUMvQiwwQkFBMEIsT0FBTyxPQUFPO0FBQUEsUUFDeEMsMEJBQTBCLE9BQU8sT0FBTztBQUFBLFFBQ3hDLDBCQUEwQixRQUFXLE1BQU07QUFBQSxRQUMzQywwQkFBMEIsTUFBUztBQUFBLE1BQ3BDO0FBQUEsTUFDQSxDQUFDLFVBQVUsU0FBUyxVQUFVLFFBQVEsTUFBUztBQUFBLElBQ2hEO0FBQUEsRUFDRCxDQUFDO0FBTUQsT0FBSyx1RkFBdUYsTUFBTTtBQUNqRyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFVBQVUsc0JBQXNCLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0QsZ0JBQWdCLHlCQUF5QixPQUFPO0FBQUEsSUFDakQsR0FBRztBQUFBLE1BQ0YsVUFBVSxDQUFDLEdBQUcscUJBQXFCO0FBQUEsTUFDbkMsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFHRCxNQUFNLGlDQUFpQyxNQUFNO0FBRTVDLDBDQUF3QztBQUd4QyxXQUFTLFNBQVMsUUFBa0g7QUFFbkksV0FBTyxFQUFFLGNBQWMsQ0FBQyxTQUFTLFFBQVEsT0FBTyxHQUEwQixFQUFXO0FBQUEsRUFDdEY7QUFFQSxPQUFLLHFGQUFxRixNQUFNO0FBQy9GLFVBQU0sTUFBTSxJQUFJLGVBQWU7QUFDL0IsVUFBTSxRQUF3QixFQUFFLElBQUksU0FBUyxRQUFRLEVBQUUsZUFBZSxTQUFTLEVBQUU7QUFDakYsV0FBTztBQUFBLE1BQ047QUFBQTtBQUFBLFFBRUMsOEJBQThCLE9BQU8sU0FBUyxFQUFFLDBCQUEwQixFQUFFLFNBQVMsRUFBRSxpQkFBaUIsTUFBTSxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssSUFBSTtBQUFBO0FBQUEsUUFFL0gsOEJBQThCLE9BQU8sU0FBUyxFQUFFLDBCQUEwQixFQUFFLEtBQUssRUFBRSxpQkFBaUIsT0FBTyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssSUFBSTtBQUFBLFFBQzVILDhCQUE4QixPQUFPLFNBQVMsRUFBRSwwQkFBMEIsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLE9BQU8sR0FBRyxTQUFTLEVBQUUsaUJBQWlCLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLElBQUk7QUFBQTtBQUFBLFFBRWpLLDhCQUE4QixPQUFPLFNBQVMsRUFBRSwwQkFBMEIsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLE9BQU8sR0FBRyxTQUFTLEVBQUUsaUJBQWlCLFFBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLElBQUk7QUFBQTtBQUFBLFFBRW5LLDhCQUE4QixPQUFPLFNBQVMsRUFBRSwwQkFBMEIsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLFFBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLElBQUk7QUFBQTtBQUFBLFFBRWpJLDhCQUE4QixPQUFPLFNBQVMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxJQUFJO0FBQUE7QUFBQTtBQUFBLFFBRzVELDhCQUE4QixRQUFXLFNBQVMsRUFBRSwwQkFBMEIsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLElBQUk7QUFBQSxRQUMvSCw4QkFBOEIsUUFBVyxTQUFTLEVBQUUsMEJBQTBCLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixNQUFNLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSyxJQUFJO0FBQUEsTUFDcEk7QUFBQSxNQUNBLENBQUMsT0FBTyxRQUFRLE9BQU8sUUFBUSxVQUFVLFVBQVUsT0FBTyxNQUFTO0FBQUEsSUFDcEU7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlHQUF5RyxNQUFNO0FBQ25ILFVBQU0sTUFBTSxJQUFJLGVBQWU7QUFDL0IsVUFBTSxRQUF3QixFQUFFLElBQUksU0FBUyxRQUFRLEVBQUUsZUFBZSxTQUFTLEVBQUU7QUFDakYsV0FBTztBQUFBLE1BQ047QUFBQTtBQUFBLFFBRUMseUNBQXlDLE9BQU8sU0FBUyxFQUFFLDBCQUEwQixFQUFFLFNBQVMsRUFBRSxpQkFBaUIsTUFBTSxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssSUFBSTtBQUFBLFFBQzFJLHlDQUF5QyxPQUFPLFNBQVMsRUFBRSwwQkFBMEIsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLE9BQU8sRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLElBQUk7QUFBQTtBQUFBLFFBRXZJLHlDQUF5QyxPQUFPLFNBQVMsRUFBRSwwQkFBMEIsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLFFBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLElBQUk7QUFBQSxRQUM1SSx5Q0FBeUMsT0FBTyxTQUFTLENBQUMsQ0FBQyxHQUFHLEtBQUssSUFBSTtBQUFBLE1BQ3hFO0FBQUEsTUFDQSxDQUFDLE9BQU8sUUFBUSxRQUFXLE1BQVM7QUFBQSxJQUNyQztBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7QUFNRCxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLDBDQUF3QztBQUV4QyxPQUFLLHFGQUFxRixNQUFNO0FBQy9GLFVBQU0sUUFBUSxvQkFBSSxJQUFJLENBQUMsbUJBQW1CLFlBQVksU0FBUyxDQUFDO0FBQ2hFLFVBQU0sVUFBVSxDQUFDLFdBQXNCLGFBQXdCLENBQUMsR0FBRyxzQkFBc0IsT0FBTyxXQUFXLFFBQVEsQ0FBQyxFQUFFLEtBQUs7QUFDM0gsV0FBTztBQUFBLE1BQ047QUFBQTtBQUFBLFFBRUMsUUFBUSxRQUFXLE1BQVM7QUFBQTtBQUFBLFFBRTVCLFFBQVEsUUFBVyxDQUFDLGlCQUFpQixDQUFDO0FBQUEsUUFDdEMsUUFBUSxRQUFXLENBQUMsaUJBQWlCLENBQUM7QUFBQSxRQUN0QyxRQUFRLFFBQVcsQ0FBQyxVQUFVLENBQUM7QUFBQTtBQUFBLFFBRS9CLFFBQVEsUUFBVyxDQUFDLGFBQWEsU0FBUyxNQUFNLENBQUM7QUFBQTtBQUFBLFFBRWpELFFBQVEsQ0FBQyxtQkFBbUIsaUJBQWlCLEdBQUcsTUFBUztBQUFBLFFBQ3pELFFBQVEsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQztBQUFBLE1BQzFDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsQ0FBQyxtQkFBbUIsWUFBWSxTQUFTO0FBQUEsUUFDekMsQ0FBQyxZQUFZLFNBQVM7QUFBQSxRQUN0QixDQUFDLG1CQUFtQixTQUFTO0FBQUEsUUFDN0IsQ0FBQztBQUFBLFFBQ0QsQ0FBQyxtQkFBbUIsWUFBWSxTQUFTO0FBQUEsUUFDekMsQ0FBQyxtQkFBbUIsVUFBVTtBQUFBLFFBQzlCLENBQUMsWUFBWSxTQUFTO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLG9CQUFJLElBQUksQ0FBQyxtQ0FBbUMsU0FBUyxDQUFDO0FBQ3pFLFVBQU0sZ0JBQWdCLENBQUMsYUFBdUIsQ0FBQyxHQUFHLHNCQUFzQixZQUFZLFFBQVcsUUFBUSxDQUFDLEVBQUUsS0FBSztBQUMvRyxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsY0FBYyxDQUFDLFdBQVcsNkJBQTZCLEVBQUUsQ0FBQztBQUFBLFFBQzFELGNBQWMsQ0FBQyxXQUFXLENBQUM7QUFBQSxRQUMzQixjQUFjLENBQUMsNkJBQTZCLENBQUM7QUFBQTtBQUFBLFFBRTdDLENBQUMsR0FBRyxzQkFBc0IsWUFBWSxDQUFDLFdBQVcsR0FBRyxNQUFTLENBQUM7QUFBQSxNQUNoRTtBQUFBLE1BQ0E7QUFBQSxRQUNDLENBQUMsV0FBVyxZQUFZO0FBQUEsUUFDeEIsQ0FBQyxXQUFXLFlBQVk7QUFBQSxRQUN4QixDQUFDLFNBQVM7QUFBQSxRQUNWLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsVUFBTSxRQUFRLG9CQUFJLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQztBQUN6RCxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsQ0FBQyxHQUFHLHNCQUFzQixPQUFPLENBQUMsaUNBQWlDLEdBQUcsTUFBUyxDQUFDO0FBQUEsUUFDaEYsQ0FBQyxHQUFHLHNCQUFzQixPQUFPLENBQUMsNkJBQTZCLEdBQUcsTUFBUyxDQUFDO0FBQUEsUUFDNUUsQ0FBQyxHQUFHLHNCQUFzQixPQUFPLFFBQVcsQ0FBQyxVQUFVLDZCQUE2QixFQUFFLENBQUMsQ0FBQztBQUFBLFFBQ3hGLHdCQUF3QixDQUFDLG1DQUFtQyxVQUFVLGlDQUFpQyxJQUFJLFdBQVcsQ0FBQztBQUFBLE1BQ3hIO0FBQUEsTUFDQTtBQUFBLFFBQ0MsQ0FBQyxpQ0FBaUM7QUFBQSxRQUNsQyxDQUFDLGlDQUFpQztBQUFBLFFBQ2xDLENBQUM7QUFBQSxRQUNELENBQUMsK0JBQStCLFVBQVUsNkJBQTZCLElBQUksV0FBVztBQUFBLE1BQ3ZGO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7QUFNRCxNQUFNLCtCQUErQixNQUFNO0FBRTFDLDBDQUF3QztBQUV4QyxPQUFLLG9GQUFvRixNQUFNO0FBQzlGLFdBQU87QUFBQSxNQUNOO0FBQUE7QUFBQTtBQUFBLFFBR0MsNEJBQTRCLENBQUMsR0FBRyxDQUFDO0FBQUEsUUFDakMsNEJBQTRCLENBQUMsU0FBUyxHQUFHLENBQUM7QUFBQTtBQUFBLFFBRTFDLDRCQUE0QixPQUFPO0FBQUE7QUFBQSxRQUVuQyw0QkFBNEIsQ0FBQyxDQUFDO0FBQUE7QUFBQSxRQUU5Qiw0QkFBNEIsTUFBUztBQUFBLFFBQ3JDLDRCQUE0QixFQUFFO0FBQUEsUUFDOUIsNEJBQTRCLENBQUMsTUFBTSxDQUFDLENBQUM7QUFBQSxNQUN0QztBQUFBLE1BQ0E7QUFBQSxRQUNDLENBQUMsYUFBYSxTQUFTLFVBQVU7QUFBQSxRQUNqQyxDQUFDLFNBQVMsYUFBYSxVQUFVO0FBQUEsUUFDakMsQ0FBQyxPQUFPO0FBQUEsUUFDUixDQUFDO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSx3Q0FBd0MsTUFBTTtBQUVuRCwwQ0FBd0M7QUFHeEMsV0FBUyxlQUFlLE9BQXdCLFFBQXdGO0FBQ3ZJLFVBQU0sV0FBVyxJQUFJLGtCQUFrQjtBQUN2QyxhQUFTLElBQUksYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUM5QyxhQUFTLElBQUksdUJBQXVCLElBQUkscUJBQXFCLENBQUM7QUFDOUQsYUFBUyxJQUFJLGtDQUFrQyxNQUFNLElBQUksSUFBSSxnQ0FBZ0MsQ0FBQyxDQUFDO0FBQy9GLGFBQVMsSUFBSSw0QkFBNEI7QUFBQSxNQUN4QyxlQUFlO0FBQUEsTUFDZixjQUFjLENBQUMsU0FBa0IsUUFBZ0IsT0FBTyxHQUEwQjtBQUFBLElBQ25GLENBQTBDO0FBRzFDLFVBQU0sdUJBQXVCLE1BQU0sSUFBSSxJQUFJLHFCQUFxQixRQUFRLENBQUM7QUFDekUsV0FBTyxxQkFBcUIsZUFBZSxzQkFBc0I7QUFBQSxFQUNsRTtBQUdBLFdBQVMsa0JBQ1IsVUFDQSxPQUNBLFdBQWlELEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsWUFBWSxDQUFDLEVBQUUsR0FDMUYsdUJBQXVFLE1BQU0sQ0FBQyxHQUNxSTtBQUNuTixVQUFNLE9BQU87QUFBQSxNQUNaLE1BQU07QUFBQSxNQUNOLFFBQVEsRUFBRSxlQUFlLFlBQVk7QUFBRSxjQUFNLElBQUksTUFBTSxRQUFRO0FBQUEsTUFBRyxHQUFHLGVBQWUsWUFBWTtBQUFFLGNBQU0sSUFBSSxNQUFNLFFBQVE7QUFBQSxNQUFHLEVBQUU7QUFBQSxNQUMvSCxXQUFXO0FBQUEsTUFDWCxrQkFBa0IsSUFBSSxLQUFLLFlBQVk7QUFBQSxNQUN2QyxtQkFBbUI7QUFBQSxNQUNuQjtBQUFBLE1BQ0EscUJBQXFCLElBQUksb0JBQW9CO0FBQUEsTUFDN0MsY0FBYztBQUFBLE1BQ2QsYUFBYTtBQUFBLE1BQ2IsVUFBVSxFQUFFLE1BQU07QUFBQSxJQUNuQjtBQUNBLFVBQU0sVUFBVSxFQUFFLHNCQUFzQixzQkFBc0IsTUFBTSxDQUFDLEVBQUU7QUFDdkUsV0FBUSxTQUFtUyxvQkFBb0IsTUFBTSxPQUFPO0FBQUEsRUFDN1U7QUFFQSxPQUFLLHNGQUFzRixZQUFZO0FBQ3RHLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLFFBQXdCLEVBQUUsSUFBSSxTQUFTLFFBQVEsRUFBRSxlQUFlLFNBQVMsRUFBRTtBQUNqRixVQUFNLFdBQVcsTUFBTSxrQkFBa0IsZUFBZSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixNQUFNLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSztBQUM1SSxVQUFNLFdBQVcsTUFBTSxrQkFBa0IsZUFBZSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixRQUFRLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSztBQUcxSSxVQUFNLE9BQU8sTUFBTSxrQkFBa0IsZUFBZSxPQUFPLENBQUMsQ0FBQyxHQUFHLEtBQUs7QUFFckUsV0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLGlCQUFpQixTQUFTLGlCQUFpQixLQUFLLGVBQWU7QUFBQSxNQUN6RSxDQUFDLE9BQU8sU0FBUyxNQUFTO0FBQUEsSUFDM0I7QUFDQSxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLFFBQXdCLEVBQUUsSUFBSSxpQkFBaUIsUUFBUSxFQUFFLGVBQWUsU0FBUyxFQUFFO0FBR3pGLFVBQU0sVUFBVSxNQUFNLGtCQUFrQixlQUFlLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxpQkFBaUIsRUFBRSxRQUFRLGtCQUFrQixFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUs7QUFDdEosVUFBTSxPQUFPLE1BQU0sa0JBQWtCLGVBQWUsT0FBTyxDQUFDLENBQUMsR0FBRyxLQUFLO0FBRXJFLFdBQU87QUFBQSxNQUNOLENBQUMsUUFBUSxPQUFPLFFBQVEsYUFBYSxLQUFLLE9BQU8sS0FBSyxXQUFXO0FBQUEsTUFDakUsQ0FBQyxRQUFXLFFBQVcsUUFBVyxNQUFTO0FBQUEsSUFDNUM7QUFDQSxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFFRCxPQUFLLHdGQUF3RixZQUFZO0FBQ3hHLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUlsQyxVQUFNLFdBQVcsZUFBZSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixRQUFRLGVBQWUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxTQUFTLEVBQUUsaUJBQWlCLE1BQU0sRUFBRSxFQUFFLENBQUM7QUFDeEssVUFBTSxTQUFTLE1BQU0sa0JBQWtCLFVBQVUsTUFBUztBQUUxRCxXQUFPO0FBQUEsTUFDTixDQUFDLE9BQU8saUJBQWlCLE9BQU8sYUFBYTtBQUFBLE1BQzdDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztBQUFBLElBQ25CO0FBQ0EsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyxpRkFBaUYsWUFBWTtBQUNqRyxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxRQUF3QixFQUFFLElBQUksU0FBUyxRQUFRLEVBQUUsZUFBZSxTQUFTLEVBQUU7QUFDakYsVUFBTSxRQUFRLE1BQU0sa0JBQWtCLGVBQWUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLFNBQVMsRUFBRSxtQkFBbUIsRUFBRSxVQUFVLEVBQUUsUUFBUSxNQUFNLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUs7QUFDckssVUFBTSxVQUFVLE1BQU0sa0JBQWtCLGVBQWUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLFNBQVMsRUFBRSxtQkFBbUIsT0FBZ0IsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLO0FBQ3ZKLFVBQU0sbUJBQW1CLE1BQU0sa0JBQWtCLGVBQWUsT0FBTztBQUFBLE1BQ3RFLDBCQUEwQjtBQUFBLFFBQ3pCLEtBQUs7QUFBQSxVQUNKLGdCQUFnQixDQUFDLFVBQVU7QUFBQSxVQUMzQixlQUFlLENBQUMsT0FBTztBQUFBLFVBQ3ZCLG1CQUFtQixFQUFFLFVBQVUsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLFFBQ2pEO0FBQUEsUUFDQSxTQUFTO0FBQUEsVUFDUixnQkFBZ0I7QUFBQSxVQUNoQixlQUFlO0FBQUEsVUFDZixtQkFBbUI7QUFBQSxRQUNwQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsR0FBRyxLQUFLO0FBQ1QsVUFBTSxPQUFPLE1BQU0sa0JBQWtCLGVBQWUsT0FBTyxDQUFDLENBQUMsR0FBRyxLQUFLO0FBRXJFLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUjtBQUFBLFVBQ0MsZ0JBQWdCLGlCQUFpQjtBQUFBLFVBQ2pDLGVBQWUsaUJBQWlCO0FBQUEsVUFDaEMsbUJBQW1CLGlCQUFpQjtBQUFBLFFBQ3JDO0FBQUEsUUFDQSxLQUFLO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxRQUNDLEVBQUUsVUFBVSxFQUFFLFFBQVEsTUFBTSxFQUFFO0FBQUEsUUFDOUI7QUFBQSxRQUNBO0FBQUEsVUFDQyxnQkFBZ0IsQ0FBQyxVQUFVO0FBQUEsVUFDM0IsZUFBZSxDQUFDLE9BQU87QUFBQSxVQUN2QixtQkFBbUIsRUFBRSxVQUFVLEVBQUUsUUFBUSxLQUFLLEVBQUU7QUFBQSxRQUNqRDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUVELE9BQUssNERBQTRELFlBQVk7QUFDNUUsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFVBQU0sUUFBd0IsRUFBRSxJQUFJLFNBQVMsUUFBUSxFQUFFLGVBQWUsU0FBUyxFQUFFO0FBQ2pGLFVBQU0sU0FBUyxNQUFNLGtCQUFrQixlQUFlLE9BQU87QUFBQSxNQUM1RCwwQkFBMEI7QUFBQSxRQUN6QixTQUFTO0FBQUEsVUFDUixnQkFBZ0IsQ0FBQyxpQ0FBaUM7QUFBQSxVQUNsRCxlQUFlLENBQUMsVUFBVSxpQ0FBaUMsRUFBRTtBQUFBLFFBQzlEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxHQUFHLEtBQUs7QUFFVCxXQUFPO0FBQUEsTUFDTixDQUFDLE9BQU8sZ0JBQWdCLE9BQU8sYUFBYTtBQUFBLE1BQzVDLENBQUMsQ0FBQyw2QkFBNkIsR0FBRyxDQUFDLFVBQVUsNkJBQTZCLEVBQUUsQ0FBQztBQUFBLElBQzlFO0FBQ0EsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxpQkFBaUI7QUFBQSxNQUN0QixPQUFPLENBQUMsRUFBRSxNQUFNLG1DQUFtQyxhQUFhLGdCQUFnQixhQUFhLEVBQUUsTUFBTSxVQUFtQixZQUFZLENBQUMsRUFBRSxFQUFFLENBQUM7QUFBQSxNQUMxSSxTQUFTLENBQUM7QUFBQSxNQUNWLFlBQVksQ0FBQztBQUFBLElBQ2Q7QUFDQSxVQUFNLGVBQWUsT0FBTyxRQUFnRSxXQUMxRixNQUFNLGtCQUFrQixlQUFlLE9BQU8sTUFBTSxHQUFHLE9BQU8sY0FBYyxHQUFHO0FBRWpGLFdBQU87QUFBQSxNQUNOO0FBQUE7QUFBQSxRQUVDLE1BQU0sYUFBYSxFQUFFLG1CQUFtQixNQUFNLEdBQUcsRUFBRSxJQUFJLGtCQUFrQixDQUFDO0FBQUE7QUFBQSxRQUUxRSxNQUFNLGFBQWEsRUFBRSxtQkFBbUIsS0FBSyxHQUFHLEVBQUUsSUFBSSxrQkFBa0IsQ0FBQztBQUFBO0FBQUEsUUFFekUsTUFBTSxhQUFhLEVBQUUsbUJBQW1CLE1BQU0sMEJBQTBCLEVBQUUsbUJBQW1CLEVBQUUsUUFBUSxrQkFBa0IsRUFBRSxFQUFFLEdBQUcsRUFBRSxJQUFJLGtCQUFrQixDQUFDO0FBQUEsTUFDMUo7QUFBQSxNQUNBO0FBQUEsUUFDQyxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQ2pCLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFDakIsRUFBRSxTQUFTLE1BQU0sZ0JBQWdCLEVBQUU7QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxZQUFZO0FBQzdGLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLFlBQXVCLENBQUM7QUFDOUIsVUFBTSxRQUF3QixFQUFFLElBQUksbUJBQW1CLFFBQVEsRUFBRSxlQUFlLFNBQVMsRUFBRTtBQUMzRixVQUFNLFNBQVMsTUFBTTtBQUFBLE1BQ3BCLGVBQWUsT0FBTztBQUFBLFFBQ3JCLG1CQUFtQjtBQUFBLFFBQ25CLDBCQUEwQixFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxFQUFFO0FBQUEsTUFDakYsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLENBQUMsRUFBRSxNQUFNLG1DQUFtQyxhQUFhLGdCQUFnQixhQUFhLEVBQUUsTUFBTSxVQUFVLFlBQVksQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUFBLFFBQ2pJLFNBQVMsQ0FBQztBQUFBLFFBQ1YsWUFBWSxDQUFDO0FBQUEsTUFDZDtBQUFBLE1BQ0Esc0JBQW9CO0FBQ25CLGtCQUFVLEtBQUssZ0JBQWdCO0FBQy9CLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBRUEsV0FBTyxnQkFBZ0IsRUFBRSxRQUFRLE9BQU8sWUFBWSxVQUFVLEdBQUc7QUFBQSxNQUNoRSxRQUFRLEVBQUUsU0FBUyxNQUFNLGdCQUFnQixFQUFFO0FBQUEsTUFDM0MsV0FBVyxDQUFDLElBQUk7QUFBQSxJQUNqQixDQUFDO0FBQ0QsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
