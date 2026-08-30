import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../platform/contextkey/browser/contextKeyService.js";
import { ChatEntitlementContextKeys } from "../../../../../services/chat/common/chatEntitlementService.js";
import { AgentHostByokLmHandler } from "../../../browser/agentSessions/agentHost/agentHostByokLmHandler.js";
import { SessionType } from "../../../common/chatSessionsService.js";
import { ChatMessageRole } from "../../../common/languageModels.js";
class TestLanguageModelsService extends mock() {
  constructor(_models, _respond, onDidChangeModelVisibility = Event.None, _isModelHidden = () => false) {
    super();
    this._models = _models;
    this._respond = _respond;
    this._isModelHidden = _isModelHidden;
    this.onDidChangeLanguageModels = Event.None;
    this.onDidChangeModelVisibility = onDidChangeModelVisibility;
  }
  getLanguageModelIds() {
    return [...this._models.keys()];
  }
  lookupLanguageModel(modelId) {
    return this._models.get(modelId);
  }
  isModelHidden(identifier) {
    return this._isModelHidden(identifier);
  }
  async sendChatRequest(modelId, _from, messages, options, _token) {
    this.captured = { modelId, messages, options };
    return this._respond(this.captured);
  }
}
class TestChatEntitlementService extends mock() {
  constructor(_contextKeyService) {
    super();
    this._contextKeyService = _contextKeyService;
  }
  get clientByokEnabled() {
    return this._contextKeyService.getContextKeyValue(ChatEntitlementContextKeys.clientByokEnabled.key) === true;
  }
}
function byokModel(vendor, id, capabilities) {
  return {
    extension: new ExtensionIdentifier("test.byok"),
    name: `${vendor} ${id}`,
    id,
    vendor,
    version: "1.0.0",
    family: "test",
    maxInputTokens: 1e3,
    maxOutputTokens: 1e3,
    isDefaultForLocation: {},
    isBYOK: true,
    capabilities
  };
}
function responseOf(parts) {
  return {
    stream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
    result: Promise.resolve(void 0)
  };
}
suite("AgentHostByokLmHandler", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createPolicyContext(enabled) {
    const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
    const clientByokEnabled = ChatEntitlementContextKeys.clientByokEnabled.bindTo(contextKeyService);
    clientByokEnabled.set(enabled);
    return { contextKeyService, clientByokEnabled };
  }
  function createHandler(service) {
    const { contextKeyService } = createPolicyContext(true);
    return store.add(new AgentHostByokLmHandler(service, new NullLogService(), new TestChatEntitlementService(contextKeyService), contextKeyService));
  }
  test("updates model discovery and blocks requests when BYOK policy changes", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id-acme", byokModel("acme", "claude")]]),
      () => responseOf([])
    );
    const { contextKeyService, clientByokEnabled } = createPolicyContext(true);
    const handler = store.add(new AgentHostByokLmHandler(service, new NullLogService(), new TestChatEntitlementService(contextKeyService), contextKeyService));
    let modelChangeCount = 0;
    store.add(handler.onDidChangeModels(() => modelChangeCount++));
    clientByokEnabled.set(false);
    const disabledModels = await handler.listModels(CancellationToken.None);
    const disabledResult = await handler.chat({
      vendor: "acme",
      modelId: "claude",
      input: []
    }, CancellationToken.None);
    clientByokEnabled.set(true);
    const enabledModels = await handler.listModels(CancellationToken.None);
    assert.deepStrictEqual({
      modelChangeCount,
      disabledModels,
      disabledResult,
      enabledModels,
      requestSent: service.captured !== void 0
    }, {
      modelChangeCount: 2,
      disabledModels: [],
      disabledResult: { output: [], error: "BYOK models are disabled by policy." },
      enabledModels: [
        { vendor: "acme", id: "claude", name: "acme claude", modelIdentifier: "id-acme", maxContextWindowTokens: 2e3, supportsVision: false }
      ],
      requestSent: false
    });
  });
  test("listModels enumerates renderer BYOK models and excludes agent-host copies", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([
        ["id-acme", byokModel("acme", "claude", { vision: true })],
        ["id-copy", { ...byokModel("acme", "claude"), targetChatSessionType: "copilotcli" }],
        ["id-capi", { ...byokModel("copilot", "gpt-4"), isBYOK: false }]
      ]),
      () => responseOf([])
    );
    const handler = createHandler(service);
    const models = await handler.listModels(CancellationToken.None);
    assert.deepStrictEqual(models, [
      { vendor: "acme", id: "claude", name: "acme claude", modelIdentifier: "id-acme", maxContextWindowTokens: 2e3, supportsVision: true }
    ]);
  });
  test("listModels carries the LM service identifier (the Manage Models visibility key)", async () => {
    const groupedId = "openrouter/OpenRouter 2/ai21/jamba-large-1.7";
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([
        [groupedId, byokModel("openrouter", "ai21/jamba-large-1.7")],
        ["openrouter/gpt-4", byokModel("openrouter", "gpt-4")]
      ]),
      () => responseOf([])
    );
    const handler = createHandler(service);
    const models = await handler.listModels(CancellationToken.None);
    assert.deepStrictEqual(models, [
      { vendor: "openrouter", id: "ai21/jamba-large-1.7", name: "openrouter ai21/jamba-large-1.7", modelIdentifier: groupedId, maxContextWindowTokens: 2e3, supportsVision: false },
      { vendor: "openrouter", id: "gpt-4", name: "openrouter gpt-4", modelIdentifier: "openrouter/gpt-4", maxContextWindowTokens: 2e3, supportsVision: false }
    ]);
  });
  test("listModels excludes hidden BYOK sources and Agent Host copies", async () => {
    const sourceIdentifier = "openrouter/OpenRouter 2/ai21/jamba-large-1.7";
    const agentHostIdentifier = `${SessionType.AgentHostCopilot}:openrouter/OpenRouter 2/ai21/jamba-large-1.7`;
    const hidden = /* @__PURE__ */ new Set();
    const visibilityChanges = store.add(new Emitter());
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([[sourceIdentifier, byokModel("openrouter", "ai21/jamba-large-1.7")]]),
      () => responseOf([]),
      visibilityChanges.event,
      (identifier) => hidden.has(identifier)
    );
    const handler = createHandler(service);
    let modelChangeCount = 0;
    store.add(handler.onDidChangeModels(() => modelChangeCount++));
    const visibleModels = await handler.listModels(CancellationToken.None);
    hidden.add(sourceIdentifier);
    visibilityChanges.fire();
    const sourceHiddenModels = await handler.listModels(CancellationToken.None);
    hidden.delete(sourceIdentifier);
    hidden.add(agentHostIdentifier);
    visibilityChanges.fire();
    const copyHiddenModels = await handler.listModels(CancellationToken.None);
    hidden.clear();
    visibilityChanges.fire();
    const restoredModels = await handler.listModels(CancellationToken.None);
    assert.deepStrictEqual({
      modelChangeCount,
      visibleModels,
      sourceHiddenModels,
      copyHiddenModels,
      restoredModels
    }, {
      modelChangeCount: 3,
      visibleModels: [{
        vendor: "openrouter",
        id: "ai21/jamba-large-1.7",
        name: "openrouter ai21/jamba-large-1.7",
        modelIdentifier: sourceIdentifier,
        maxContextWindowTokens: 2e3,
        supportsVision: false
      }],
      sourceHiddenModels: [],
      copyHiddenModels: [],
      restoredModels: [{
        vendor: "openrouter",
        id: "ai21/jamba-large-1.7",
        name: "openrouter ai21/jamba-large-1.7",
        modelIdentifier: sourceIdentifier,
        maxContextWindowTokens: 2e3,
        supportsVision: false
      }]
    });
  });
  test("listModels carries string reasoning effort metadata from renderer BYOK schemas", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([
        ["id-reasoning", {
          ...byokModel("acme", "reasoning"),
          configurationSchema: {
            properties: {
              reasoningEffort: {
                type: "string",
                enum: ["minimal", "low", 1, "high"],
                default: "high"
              }
            }
          }
        }],
        ["id-malformed", {
          ...byokModel("acme", "malformed"),
          configurationSchema: {
            properties: {
              reasoningEffort: {
                type: "string",
                enum: [1, false],
                default: 1
              }
            }
          }
        }],
        ["id-plain", byokModel("acme", "plain")]
      ]),
      () => responseOf([])
    );
    const handler = createHandler(service);
    const models = await handler.listModels(CancellationToken.None);
    assert.deepStrictEqual(models, [
      {
        vendor: "acme",
        id: "reasoning",
        name: "acme reasoning",
        modelIdentifier: "id-reasoning",
        maxContextWindowTokens: 2e3,
        supportsVision: false,
        supportedReasoningEfforts: ["minimal", "low", "high"],
        defaultReasoningEffort: "high"
      },
      { vendor: "acme", id: "malformed", name: "acme malformed", modelIdentifier: "id-malformed", maxContextWindowTokens: 2e3, supportsVision: false },
      { vendor: "acme", id: "plain", name: "acme plain", modelIdentifier: "id-plain", maxContextWindowTokens: 2e3, supportsVision: false }
    ]);
  });
  test("chat resolves the configured provider group when models share a vendor and id", async () => {
    const workIdentifier = "google/Gemini Work/gemini-2.5-pro";
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([
        ["google/Gemini Personal/gemini-2.5-pro", byokModel("google", "gemini-2.5-pro")],
        [workIdentifier, byokModel("google", "gemini-2.5-pro")]
      ]),
      () => responseOf([])
    );
    const handler = createHandler(service);
    await handler.chat({
      vendor: "google",
      modelId: "Gemini Work/gemini-2.5-pro",
      input: []
    }, CancellationToken.None);
    assert.strictEqual(service.captured?.modelId, workIdentifier);
  });
  test("buffers ordered thinking, text, tool calls, continuation and usage", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id-acme-claude", byokModel("acme", "claude")]]),
      () => responseOf([
        { type: "thinking", value: "considered ", id: "rs_1" },
        { type: "thinking", value: ["options"], id: "rs_1", metadata: { encrypted_content: "opaque" } },
        { type: "thinking", value: "", id: "thinking_2", metadata: { signature: "sig", _completeThinking: "full thought" } },
        { type: "text", value: "hello " },
        { type: "text", value: "world" },
        { type: "tool_use", name: "getWeather", toolCallId: "t1", parameters: { city: "NYC" } },
        { type: "tool_use", name: "apply_patch", toolCallId: "t2", parameters: { input: "patch" } },
        { type: "data", mimeType: "stateful_marker", data: VSBuffer.fromString("claude\\resp_provider") },
        { type: "data", mimeType: "usage", data: VSBuffer.fromString('{"prompt_tokens":10,"completion_tokens":5,"completion_tokens_details":{"reasoning_tokens":2}}') }
      ])
    );
    const handler = createHandler(service);
    const result = await handler.chat(
      {
        vendor: "acme",
        modelId: "claude",
        input: [{ type: "message", role: "user", content: [{ type: "text", text: "hi" }] }],
        tools: [
          { type: "function", name: "getWeather" },
          { type: "custom", name: "apply_patch" }
        ]
      },
      CancellationToken.None
    );
    assert.strictEqual(service.captured?.modelId, "id-acme-claude");
    assert.deepStrictEqual(result, {
      output: [
        { type: "reasoning", id: "rs_1", summary: ["considered ", "options"], encryptedContent: "opaque", metadata: { encrypted_content: "opaque" } },
        { type: "reasoning", id: "thinking_2", summary: [""], encryptedContent: 'vscode-reasoning-metadata:{"signature":"sig","_completeThinking":"full thought"}', metadata: { signature: "sig", _completeThinking: "full thought" } },
        { type: "message", content: [{ type: "text", text: "hello world" }] },
        { type: "function_call", callId: "t1", name: "getWeather", argumentsJson: '{"city":"NYC"}' },
        { type: "custom_tool_call", callId: "t2", name: "apply_patch", input: "patch" }
      ],
      responseId: "resp_provider",
      usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 }
    });
  });
  test("combines streamed thinking chunks into one summary entry", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id-deepseek", byokModel("customendpoint", "deepseek")]]),
      () => responseOf([
        { type: "thinking", value: "Analy" },
        { type: "thinking", value: "zing" }
      ])
    );
    const handler = createHandler(service);
    const result = await handler.chat({
      vendor: "customendpoint",
      modelId: "deepseek",
      input: [{ type: "message", role: "user", content: [{ type: "text", text: "hi" }] }]
    }, CancellationToken.None);
    assert.deepStrictEqual(result.output, [{
      type: "reasoning",
      id: void 0,
      summary: ["Analyzing"],
      encryptedContent: void 0,
      metadata: void 0
    }]);
  });
  test("preserves streamed reasoning summary part boundaries", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id", byokModel("customendpoint", "reasoning")]]),
      () => responseOf([
        { type: "thinking", value: "fir", id: "rs_1" },
        { type: "thinking", value: "st", id: "rs_1" },
        { type: "thinking", value: "", id: "rs_1", metadata: { vscode_reasoning_summary_part_done: true } },
        { type: "thinking", value: "sec", id: "rs_1" },
        { type: "thinking", value: "ond", id: "rs_1" },
        { type: "thinking", value: "", id: "rs_1", metadata: { vscode_reasoning_summary_part_done: true } },
        { type: "thinking", value: "", id: "rs_1", metadata: { encrypted_content: "opaque" } }
      ])
    );
    const handler = createHandler(service);
    const result = await handler.chat({
      vendor: "customendpoint",
      modelId: "reasoning",
      input: []
    }, CancellationToken.None);
    assert.deepStrictEqual(result.output, [{
      type: "reasoning",
      id: "rs_1",
      summary: ["first", "second"],
      encryptedContent: "opaque",
      metadata: { encrypted_content: "opaque" }
    }]);
  });
  test("maps ordered Responses input and options to LM API chat messages", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id", byokModel("acme", "claude")]]),
      () => responseOf([{ type: "text", value: "ok" }])
    );
    const handler = createHandler(service);
    await handler.chat(
      {
        vendor: "acme",
        modelId: "claude",
        instructions: "be helpful",
        previousResponseId: "resp_previous",
        reasoningEffort: "high",
        modelOptions: { temperature: 0.5 },
        tools: [
          { type: "function", name: "getWeather", parametersSchema: { type: "object" } },
          { type: "custom", name: "apply_patch" }
        ],
        input: [
          { type: "reasoning", id: "rs_1", summary: ["thought"], encryptedContent: "opaque" },
          { type: "reasoning", id: "rs_2", summary: ["other thought"], encryptedContent: 'vscode-reasoning-metadata:{"signature":"sig-2","_completeThinking":"other complete thought"}' },
          { type: "message", role: "assistant", content: [{ type: "text", text: "check" }, { type: "text", text: "ing" }] },
          { type: "function_call", callId: "t1", name: "getWeather", argumentsJson: '{"city":"NYC"}' },
          { type: "custom_tool_call", callId: "t2", name: "apply_patch", input: "patch" },
          { type: "function_call_output", callId: "t1", output: "sunny" },
          { type: "custom_tool_call_output", callId: "t2", output: "Done!" },
          {
            type: "message",
            role: "user",
            content: [
              { type: "text", text: "hi" },
              { type: "image", mimeType: "image/png", data: "aW1hZ2U=" }
            ]
          }
        ]
      },
      CancellationToken.None
    );
    const messages = service.captured?.messages.map((message) => ({
      role: message.role,
      content: message.content.map((part) => part.type === "data" ? { ...part, data: part.data.toString() } : part)
    }));
    assert.deepStrictEqual({
      messages,
      options: service.captured?.options
    }, {
      messages: [
        { role: ChatMessageRole.Assistant, content: [{ type: "data", mimeType: "stateful_marker", data: "claude\\resp_previous" }] },
        { role: ChatMessageRole.System, content: [{ type: "text", value: "be helpful" }] },
        {
          role: ChatMessageRole.Assistant,
          content: [
            { type: "thinking", value: ["thought"], id: "rs_1", metadata: { encrypted_content: "opaque" } },
            { type: "thinking", value: ["other thought"], id: "rs_2", metadata: { signature: "sig-2", _completeThinking: "other complete thought" } },
            { type: "text", value: "checking" },
            { type: "tool_use", name: "getWeather", toolCallId: "t1", parameters: { city: "NYC" } },
            { type: "tool_use", name: "apply_patch", toolCallId: "t2", parameters: { input: "patch" } }
          ]
        },
        { role: ChatMessageRole.User, content: [{ type: "tool_result", toolCallId: "t1", value: [{ type: "text", value: "sunny" }] }] },
        { role: ChatMessageRole.User, content: [{ type: "tool_result", toolCallId: "t2", value: [{ type: "text", value: "Done!" }] }] },
        {
          role: ChatMessageRole.User,
          content: [
            { type: "text", value: "hi" },
            { type: "image_url", value: { mimeType: "image/png", data: VSBuffer.fromString("image") } }
          ]
        }
      ],
      options: {
        modelOptions: { temperature: 0.5 },
        includeEncryptedThinking: true,
        configuration: { reasoningEffort: "high" },
        tools: [
          { name: "getWeather", description: "", inputSchema: { type: "object" } },
          { name: "apply_patch", description: "", inputSchema: { type: "object", properties: { input: { type: "string" } }, required: ["input"] } }
        ]
      }
    });
  });
  test("returns an error result when no BYOK model matches", async () => {
    const service = new TestLanguageModelsService(/* @__PURE__ */ new Map(), () => responseOf([]));
    const handler = createHandler(service);
    const result = await handler.chat(
      { vendor: "acme", modelId: "missing", input: [] },
      CancellationToken.None
    );
    assert.deepStrictEqual(result.output, []);
    assert.ok(result.error?.includes("acme/missing"), `expected error to name the model: ${result.error}`);
  });
  test("returns an error result when the LM request throws", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id", byokModel("acme", "claude")]]),
      () => {
        throw new Error("provider exploded");
      }
    );
    const handler = createHandler(service);
    const result = await handler.chat(
      { vendor: "acme", modelId: "claude", input: [{ type: "message", role: "user", content: [{ type: "text", text: "hi" }] }] },
      CancellationToken.None
    );
    assert.deepStrictEqual(result, { output: [], error: "provider exploded" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdEJ5b2tMbUhhbmRsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnlva0xtQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEJ5b2tMbS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cywgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEJ5b2tMbUhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEJ5b2tMbUhhbmRsZXIuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TWVzc2FnZVJvbGUsIElDaGF0TWVzc2FnZSwgSUNoYXRSZXNwb25zZVBhcnQsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucywgSUxhbmd1YWdlTW9kZWxDaGF0UmVzcG9uc2UsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuXG5pbnRlcmZhY2UgSUNhcHR1cmVkUmVxdWVzdCB7XG5cdG1vZGVsSWQ6IHN0cmluZztcblx0bWVzc2FnZXM6IElDaGF0TWVzc2FnZVtdO1xuXHRvcHRpb25zOiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucztcbn1cblxuLyoqXG4gKiBGYWtlIExNIEFQSSBzZXJ2aWNlOiByZXNvbHZlcyBhIHNtYWxsIGZpeGVkIG1vZGVsIHNldCBhbmQgcmVwbGF5cyBhXG4gKiBzY3JpcHRlZCByZXNwb25zZSBzdHJlYW0sIGNhcHR1cmluZyB3aGF0IHRoZSBoYW5kbGVyIGZvcndhcmRlZC4gU3RhbmRzIGluXG4gKiBmb3IgdGhlIHJlbmRlcmVyJ3MgcmVhbCBgSUxhbmd1YWdlTW9kZWxzU2VydmljZWAgc28gdGhlIGJyaWRnZSBoYW5kbGVyIGNhbiBiZVxuICogZXhlcmNpc2VkIHdpdGhvdXQgYW55IGV4dGVuc2lvbiBvciBtb2RlbCBwcm92aWRlci5cbiAqL1xuY2xhc3MgVGVzdExhbmd1YWdlTW9kZWxzU2VydmljZSBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oKSB7XG5cblx0Y2FwdHVyZWQ6IElDYXB0dXJlZFJlcXVlc3QgfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5OiBFdmVudDx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHM6IFJlYWRvbmx5TWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3BvbmQ6IChyZXF1ZXN0OiBJQ2FwdHVyZWRSZXF1ZXN0KSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZSxcblx0XHRvbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eSA9IEV2ZW50Lk5vbmUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNNb2RlbEhpZGRlbjogKGlkZW50aWZpZXI6IHN0cmluZykgPT4gYm9vbGVhbiA9ICgpID0+IGZhbHNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkgPSBvbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fbW9kZWxzLmtleXMoKV07XG5cdH1cblxuXHRvdmVycmlkZSBsb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWQ6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxzLmdldChtb2RlbElkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzTW9kZWxIaWRkZW4oaWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzTW9kZWxIaWRkZW4oaWRlbnRpZmllcik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZW5kQ2hhdFJlcXVlc3QobW9kZWxJZDogc3RyaW5nLCBfZnJvbTogRXh0ZW5zaW9uSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgbWVzc2FnZXM6IElDaGF0TWVzc2FnZVtdLCBvcHRpb25zOiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUxhbmd1YWdlTW9kZWxDaGF0UmVzcG9uc2U+IHtcblx0XHR0aGlzLmNhcHR1cmVkID0geyBtb2RlbElkLCBtZXNzYWdlcywgb3B0aW9ucyB9O1xuXHRcdHJldHVybiB0aGlzLl9yZXNwb25kKHRoaXMuY2FwdHVyZWQpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQ2hhdEVudGl0bGVtZW50U2VydmljZT4oKSB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGNsaWVudEJ5b2tFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuY2xpZW50Qnlva0VuYWJsZWQua2V5KSA9PT0gdHJ1ZTtcblx0fVxufVxuXG5mdW5jdGlvbiBieW9rTW9kZWwodmVuZG9yOiBzdHJpbmcsIGlkOiBzdHJpbmcsIGNhcGFiaWxpdGllcz86IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhWydjYXBhYmlsaXRpZXMnXSk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmJ5b2snKSxcblx0XHRuYW1lOiBgJHt2ZW5kb3J9ICR7aWR9YCxcblx0XHRpZCxcblx0XHR2ZW5kb3IsXG5cdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRmYW1pbHk6ICd0ZXN0Jyxcblx0XHRtYXhJbnB1dFRva2VuczogMTAwMCxcblx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMDAsXG5cdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdGlzQllPSzogdHJ1ZSxcblx0XHRjYXBhYmlsaXRpZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJlc3BvbnNlT2YocGFydHM6IElDaGF0UmVzcG9uc2VQYXJ0W10pOiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZSB7XG5cdHJldHVybiB7XG5cdFx0c3RyZWFtOiAoYXN5bmMgZnVuY3Rpb24qICgpIHtcblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuXHRcdFx0XHR5aWVsZCBwYXJ0O1xuXHRcdFx0fVxuXHRcdH0pKCksXG5cdFx0cmVzdWx0OiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0fTtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdEJ5b2tMbUhhbmRsZXInLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVQb2xpY3lDb250ZXh0KGVuYWJsZWQ6IGJvb2xlYW4pOiB7IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7IGNsaWVudEJ5b2tFbmFibGVkOiBJQ29udGV4dEtleTxib29sZWFuPiB9IHtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHN0b3JlLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UobmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgY2xpZW50Qnlva0VuYWJsZWQgPSBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5jbGllbnRCeW9rRW5hYmxlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNsaWVudEJ5b2tFbmFibGVkLnNldChlbmFibGVkKTtcblx0XHRyZXR1cm4geyBjb250ZXh0S2V5U2VydmljZSwgY2xpZW50Qnlva0VuYWJsZWQgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhhbmRsZXIoc2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSk6IEFnZW50SG9zdEJ5b2tMbUhhbmRsZXIge1xuXHRcdGNvbnN0IHsgY29udGV4dEtleVNlcnZpY2UgfSA9IGNyZWF0ZVBvbGljeUNvbnRleHQodHJ1ZSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0Qnlva0xtSGFuZGxlcihzZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IFRlc3RDaGF0RW50aXRsZW1lbnRTZXJ2aWNlKGNvbnRleHRLZXlTZXJ2aWNlKSwgY29udGV4dEtleVNlcnZpY2UpKTtcblx0fVxuXG5cdHRlc3QoJ3VwZGF0ZXMgbW9kZWwgZGlzY292ZXJ5IGFuZCBibG9ja3MgcmVxdWVzdHMgd2hlbiBCWU9LIHBvbGljeSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBNYXAoW1snaWQtYWNtZScsIGJ5b2tNb2RlbCgnYWNtZScsICdjbGF1ZGUnKV1dKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW10pLFxuXHRcdCk7XG5cdFx0Y29uc3QgeyBjb250ZXh0S2V5U2VydmljZSwgY2xpZW50Qnlva0VuYWJsZWQgfSA9IGNyZWF0ZVBvbGljeUNvbnRleHQodHJ1ZSk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IHN0b3JlLmFkZChuZXcgQWdlbnRIb3N0Qnlva0xtSGFuZGxlcihzZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IFRlc3RDaGF0RW50aXRsZW1lbnRTZXJ2aWNlKGNvbnRleHRLZXlTZXJ2aWNlKSwgY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRsZXQgbW9kZWxDaGFuZ2VDb3VudCA9IDA7XG5cdFx0c3RvcmUuYWRkKGhhbmRsZXIub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4gbW9kZWxDaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRjbGllbnRCeW9rRW5hYmxlZC5zZXQoZmFsc2UpO1xuXHRcdGNvbnN0IGRpc2FibGVkTW9kZWxzID0gYXdhaXQgaGFuZGxlci5saXN0TW9kZWxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGRpc2FibGVkUmVzdWx0ID0gYXdhaXQgaGFuZGxlci5jaGF0KHtcblx0XHRcdHZlbmRvcjogJ2FjbWUnLFxuXHRcdFx0bW9kZWxJZDogJ2NsYXVkZScsXG5cdFx0XHRpbnB1dDogW10sXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y2xpZW50Qnlva0VuYWJsZWQuc2V0KHRydWUpO1xuXHRcdGNvbnN0IGVuYWJsZWRNb2RlbHMgPSBhd2FpdCBoYW5kbGVyLmxpc3RNb2RlbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGVsQ2hhbmdlQ291bnQsXG5cdFx0XHRkaXNhYmxlZE1vZGVscyxcblx0XHRcdGRpc2FibGVkUmVzdWx0LFxuXHRcdFx0ZW5hYmxlZE1vZGVscyxcblx0XHRcdHJlcXVlc3RTZW50OiBzZXJ2aWNlLmNhcHR1cmVkICE9PSB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0bW9kZWxDaGFuZ2VDb3VudDogMixcblx0XHRcdGRpc2FibGVkTW9kZWxzOiBbXSxcblx0XHRcdGRpc2FibGVkUmVzdWx0OiB7IG91dHB1dDogW10sIGVycm9yOiAnQllPSyBtb2RlbHMgYXJlIGRpc2FibGVkIGJ5IHBvbGljeS4nIH0sXG5cdFx0XHRlbmFibGVkTW9kZWxzOiBbXG5cdFx0XHRcdHsgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJywgbmFtZTogJ2FjbWUgY2xhdWRlJywgbW9kZWxJZGVudGlmaWVyOiAnaWQtYWNtZScsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDIwMDAsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdFx0XSxcblx0XHRcdHJlcXVlc3RTZW50OiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdE1vZGVscyBlbnVtZXJhdGVzIHJlbmRlcmVyIEJZT0sgbW9kZWxzIGFuZCBleGNsdWRlcyBhZ2VudC1ob3N0IGNvcGllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KFtcblx0XHRcdFx0WydpZC1hY21lJywgYnlva01vZGVsKCdhY21lJywgJ2NsYXVkZScsIHsgdmlzaW9uOiB0cnVlIH0pXSxcblx0XHRcdFx0WydpZC1jb3B5JywgeyAuLi5ieW9rTW9kZWwoJ2FjbWUnLCAnY2xhdWRlJyksIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknIH1dLFxuXHRcdFx0XHRbJ2lkLWNhcGknLCB7IC4uLmJ5b2tNb2RlbCgnY29waWxvdCcsICdncHQtNCcpLCBpc0JZT0s6IGZhbHNlIH1dLFxuXHRcdFx0XSksXG5cdFx0XHQoKSA9PiByZXNwb25zZU9mKFtdKSxcblx0XHQpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgaGFuZGxlci5saXN0TW9kZWxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbHMsIFtcblx0XHRcdHsgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJywgbmFtZTogJ2FjbWUgY2xhdWRlJywgbW9kZWxJZGVudGlmaWVyOiAnaWQtYWNtZScsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDIwMDAsIHN1cHBvcnRzVmlzaW9uOiB0cnVlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RNb2RlbHMgY2FycmllcyB0aGUgTE0gc2VydmljZSBpZGVudGlmaWVyICh0aGUgTWFuYWdlIE1vZGVscyB2aXNpYmlsaXR5IGtleSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSBncm91cGVkIEJZT0sgbW9kZWwgaXMgcmVnaXN0ZXJlZCB1bmRlciBgPHZlbmRvcj4vPGdyb3VwPi88aWQ+YCBcdTIwMTQgZXhhY3RseSB0aGUgaWQgdGhlXG5cdFx0Ly8gTWFuYWdlIE1vZGVscyB2aWV3IGtleXMgdmlzaWJpbGl0eSBieS4gVGhlIGhhbmRsZXIgY2FycmllcyB0aGF0IGlkZW50aWZpZXIgdmVyYmF0aW0gc29cblx0XHQvLyB0aGUgcGlja2VyIGNhbiBob25vdXIgdGhlIHRvZ2dsZSBmb3IgdGhlIG1vZGVsJ3MgYWdlbnQtaG9zdCBjb3B5LlxuXHRcdGNvbnN0IGdyb3VwZWRJZCA9ICdvcGVucm91dGVyL09wZW5Sb3V0ZXIgMi9haTIxL2phbWJhLWxhcmdlLTEuNyc7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPihbXG5cdFx0XHRcdFtncm91cGVkSWQsIGJ5b2tNb2RlbCgnb3BlbnJvdXRlcicsICdhaTIxL2phbWJhLWxhcmdlLTEuNycpXSxcblx0XHRcdFx0WydvcGVucm91dGVyL2dwdC00JywgYnlva01vZGVsKCdvcGVucm91dGVyJywgJ2dwdC00JyldLFxuXHRcdFx0XSksXG5cdFx0XHQoKSA9PiByZXNwb25zZU9mKFtdKSxcblx0XHQpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgaGFuZGxlci5saXN0TW9kZWxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbHMsIFtcblx0XHRcdHsgdmVuZG9yOiAnb3BlbnJvdXRlcicsIGlkOiAnYWkyMS9qYW1iYS1sYXJnZS0xLjcnLCBuYW1lOiAnb3BlbnJvdXRlciBhaTIxL2phbWJhLWxhcmdlLTEuNycsIG1vZGVsSWRlbnRpZmllcjogZ3JvdXBlZElkLCBtYXhDb250ZXh0V2luZG93VG9rZW5zOiAyMDAwLCBzdXBwb3J0c1Zpc2lvbjogZmFsc2UgfSxcblx0XHRcdHsgdmVuZG9yOiAnb3BlbnJvdXRlcicsIGlkOiAnZ3B0LTQnLCBuYW1lOiAnb3BlbnJvdXRlciBncHQtNCcsIG1vZGVsSWRlbnRpZmllcjogJ29wZW5yb3V0ZXIvZ3B0LTQnLCBtYXhDb250ZXh0V2luZG93VG9rZW5zOiAyMDAwLCBzdXBwb3J0c1Zpc2lvbjogZmFsc2UgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdE1vZGVscyBleGNsdWRlcyBoaWRkZW4gQllPSyBzb3VyY2VzIGFuZCBBZ2VudCBIb3N0IGNvcGllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VJZGVudGlmaWVyID0gJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jztcblx0XHRjb25zdCBhZ2VudEhvc3RJZGVudGlmaWVyID0gYCR7U2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdH06b3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWkyMS9qYW1iYS1sYXJnZS0xLjdgO1xuXHRcdGNvbnN0IGhpZGRlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHZpc2liaWxpdHlDaGFuZ2VzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBNYXAoW1tzb3VyY2VJZGVudGlmaWVyLCBieW9rTW9kZWwoJ29wZW5yb3V0ZXInLCAnYWkyMS9qYW1iYS1sYXJnZS0xLjcnKV1dKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW10pLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXMuZXZlbnQsXG5cdFx0XHRpZGVudGlmaWVyID0+IGhpZGRlbi5oYXMoaWRlbnRpZmllciksXG5cdFx0KTtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcihzZXJ2aWNlKTtcblx0XHRsZXQgbW9kZWxDaGFuZ2VDb3VudCA9IDA7XG5cdFx0c3RvcmUuYWRkKGhhbmRsZXIub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4gbW9kZWxDaGFuZ2VDb3VudCsrKSk7XG5cblx0XHRjb25zdCB2aXNpYmxlTW9kZWxzID0gYXdhaXQgaGFuZGxlci5saXN0TW9kZWxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGhpZGRlbi5hZGQoc291cmNlSWRlbnRpZmllcik7XG5cdFx0dmlzaWJpbGl0eUNoYW5nZXMuZmlyZSgpO1xuXHRcdGNvbnN0IHNvdXJjZUhpZGRlbk1vZGVscyA9IGF3YWl0IGhhbmRsZXIubGlzdE1vZGVscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRoaWRkZW4uZGVsZXRlKHNvdXJjZUlkZW50aWZpZXIpO1xuXHRcdGhpZGRlbi5hZGQoYWdlbnRIb3N0SWRlbnRpZmllcik7XG5cdFx0dmlzaWJpbGl0eUNoYW5nZXMuZmlyZSgpO1xuXHRcdGNvbnN0IGNvcHlIaWRkZW5Nb2RlbHMgPSBhd2FpdCBoYW5kbGVyLmxpc3RNb2RlbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aGlkZGVuLmNsZWFyKCk7XG5cdFx0dmlzaWJpbGl0eUNoYW5nZXMuZmlyZSgpO1xuXHRcdGNvbnN0IHJlc3RvcmVkTW9kZWxzID0gYXdhaXQgaGFuZGxlci5saXN0TW9kZWxzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbENoYW5nZUNvdW50LFxuXHRcdFx0dmlzaWJsZU1vZGVscyxcblx0XHRcdHNvdXJjZUhpZGRlbk1vZGVscyxcblx0XHRcdGNvcHlIaWRkZW5Nb2RlbHMsXG5cdFx0XHRyZXN0b3JlZE1vZGVscyxcblx0XHR9LCB7XG5cdFx0XHRtb2RlbENoYW5nZUNvdW50OiAzLFxuXHRcdFx0dmlzaWJsZU1vZGVsczogW3tcblx0XHRcdFx0dmVuZG9yOiAnb3BlbnJvdXRlcicsXG5cdFx0XHRcdGlkOiAnYWkyMS9qYW1iYS1sYXJnZS0xLjcnLFxuXHRcdFx0XHRuYW1lOiAnb3BlbnJvdXRlciBhaTIxL2phbWJhLWxhcmdlLTEuNycsXG5cdFx0XHRcdG1vZGVsSWRlbnRpZmllcjogc291cmNlSWRlbnRpZmllcixcblx0XHRcdFx0bWF4Q29udGV4dFdpbmRvd1Rva2VuczogMjAwMCxcblx0XHRcdFx0c3VwcG9ydHNWaXNpb246IGZhbHNlLFxuXHRcdFx0fV0sXG5cdFx0XHRzb3VyY2VIaWRkZW5Nb2RlbHM6IFtdLFxuXHRcdFx0Y29weUhpZGRlbk1vZGVsczogW10sXG5cdFx0XHRyZXN0b3JlZE1vZGVsczogW3tcblx0XHRcdFx0dmVuZG9yOiAnb3BlbnJvdXRlcicsXG5cdFx0XHRcdGlkOiAnYWkyMS9qYW1iYS1sYXJnZS0xLjcnLFxuXHRcdFx0XHRuYW1lOiAnb3BlbnJvdXRlciBhaTIxL2phbWJhLWxhcmdlLTEuNycsXG5cdFx0XHRcdG1vZGVsSWRlbnRpZmllcjogc291cmNlSWRlbnRpZmllcixcblx0XHRcdFx0bWF4Q29udGV4dFdpbmRvd1Rva2VuczogMjAwMCxcblx0XHRcdFx0c3VwcG9ydHNWaXNpb246IGZhbHNlLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RNb2RlbHMgY2FycmllcyBzdHJpbmcgcmVhc29uaW5nIGVmZm9ydCBtZXRhZGF0YSBmcm9tIHJlbmRlcmVyIEJZT0sgc2NoZW1hcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KFtcblx0XHRcdFx0WydpZC1yZWFzb25pbmcnLCB7XG5cdFx0XHRcdFx0Li4uYnlva01vZGVsKCdhY21lJywgJ3JlYXNvbmluZycpLFxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25TY2hlbWE6IHtcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydtaW5pbWFsJywgJ2xvdycsIDEsICdoaWdoJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJ2hpZ2gnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydpZC1tYWxmb3JtZWQnLCB7XG5cdFx0XHRcdFx0Li4uYnlva01vZGVsKCdhY21lJywgJ21hbGZvcm1lZCcpLFxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25TY2hlbWE6IHtcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWzEsIGZhbHNlXSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAxLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydpZC1wbGFpbicsIGJ5b2tNb2RlbCgnYWNtZScsICdwbGFpbicpXSxcblx0XHRcdF0pLFxuXHRcdFx0KCkgPT4gcmVzcG9uc2VPZihbXSksXG5cdFx0KTtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcihzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IGhhbmRsZXIubGlzdE1vZGVscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWxzLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHZlbmRvcjogJ2FjbWUnLFxuXHRcdFx0XHRpZDogJ3JlYXNvbmluZycsXG5cdFx0XHRcdG5hbWU6ICdhY21lIHJlYXNvbmluZycsXG5cdFx0XHRcdG1vZGVsSWRlbnRpZmllcjogJ2lkLXJlYXNvbmluZycsXG5cdFx0XHRcdG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDIwMDAsXG5cdFx0XHRcdHN1cHBvcnRzVmlzaW9uOiBmYWxzZSxcblx0XHRcdFx0c3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0czogWydtaW5pbWFsJywgJ2xvdycsICdoaWdoJ10sXG5cdFx0XHRcdGRlZmF1bHRSZWFzb25pbmdFZmZvcnQ6ICdoaWdoJyxcblx0XHRcdH0sXG5cdFx0XHR7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ21hbGZvcm1lZCcsIG5hbWU6ICdhY21lIG1hbGZvcm1lZCcsIG1vZGVsSWRlbnRpZmllcjogJ2lkLW1hbGZvcm1lZCcsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDIwMDAsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdFx0eyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdwbGFpbicsIG5hbWU6ICdhY21lIHBsYWluJywgbW9kZWxJZGVudGlmaWVyOiAnaWQtcGxhaW4nLCBtYXhDb250ZXh0V2luZG93VG9rZW5zOiAyMDAwLCBzdXBwb3J0c1Zpc2lvbjogZmFsc2UgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhdCByZXNvbHZlcyB0aGUgY29uZmlndXJlZCBwcm92aWRlciBncm91cCB3aGVuIG1vZGVscyBzaGFyZSBhIHZlbmRvciBhbmQgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya0lkZW50aWZpZXIgPSAnZ29vZ2xlL0dlbWluaSBXb3JrL2dlbWluaS0yLjUtcHJvJztcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgTWFwKFtcblx0XHRcdFx0Wydnb29nbGUvR2VtaW5pIFBlcnNvbmFsL2dlbWluaS0yLjUtcHJvJywgYnlva01vZGVsKCdnb29nbGUnLCAnZ2VtaW5pLTIuNS1wcm8nKV0sXG5cdFx0XHRcdFt3b3JrSWRlbnRpZmllciwgYnlva01vZGVsKCdnb29nbGUnLCAnZ2VtaW5pLTIuNS1wcm8nKV0sXG5cdFx0XHRdKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW10pLFxuXHRcdCk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoc2VydmljZSk7XG5cblx0XHRhd2FpdCBoYW5kbGVyLmNoYXQoe1xuXHRcdFx0dmVuZG9yOiAnZ29vZ2xlJyxcblx0XHRcdG1vZGVsSWQ6ICdHZW1pbmkgV29yay9nZW1pbmktMi41LXBybycsXG5cdFx0XHRpbnB1dDogW10sXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYXB0dXJlZD8ubW9kZWxJZCwgd29ya0lkZW50aWZpZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJzIG9yZGVyZWQgdGhpbmtpbmcsIHRleHQsIHRvb2wgY2FsbHMsIGNvbnRpbnVhdGlvbiBhbmQgdXNhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IE1hcChbWydpZC1hY21lLWNsYXVkZScsIGJ5b2tNb2RlbCgnYWNtZScsICdjbGF1ZGUnKV1dKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW1xuXHRcdFx0XHR7IHR5cGU6ICd0aGlua2luZycsIHZhbHVlOiAnY29uc2lkZXJlZCAnLCBpZDogJ3JzXzEnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3RoaW5raW5nJywgdmFsdWU6IFsnb3B0aW9ucyddLCBpZDogJ3JzXzEnLCBtZXRhZGF0YTogeyBlbmNyeXB0ZWRfY29udGVudDogJ29wYXF1ZScgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0aGlua2luZycsIHZhbHVlOiAnJywgaWQ6ICd0aGlua2luZ18yJywgbWV0YWRhdGE6IHsgc2lnbmF0dXJlOiAnc2lnJywgX2NvbXBsZXRlVGhpbmtpbmc6ICdmdWxsIHRob3VnaHQnIH0gfSxcblx0XHRcdFx0eyB0eXBlOiAndGV4dCcsIHZhbHVlOiAnaGVsbG8gJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdmFsdWU6ICd3b3JsZCcgfSxcblx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAnZ2V0V2VhdGhlcicsIHRvb2xDYWxsSWQ6ICd0MScsIHBhcmFtZXRlcnM6IHsgY2l0eTogJ05ZQycgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX3VzZScsIG5hbWU6ICdhcHBseV9wYXRjaCcsIHRvb2xDYWxsSWQ6ICd0MicsIHBhcmFtZXRlcnM6IHsgaW5wdXQ6ICdwYXRjaCcgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkYXRhJywgbWltZVR5cGU6ICdzdGF0ZWZ1bF9tYXJrZXInLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdjbGF1ZGVcXFxccmVzcF9wcm92aWRlcicpIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RhdGEnLCBtaW1lVHlwZTogJ3VzYWdlJywgZGF0YTogVlNCdWZmZXIuZnJvbVN0cmluZygne1wicHJvbXB0X3Rva2Vuc1wiOjEwLFwiY29tcGxldGlvbl90b2tlbnNcIjo1LFwiY29tcGxldGlvbl90b2tlbnNfZGV0YWlsc1wiOntcInJlYXNvbmluZ190b2tlbnNcIjoyfX0nKSB9LFxuXHRcdFx0XSksXG5cdFx0KTtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcihzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuY2hhdChcblx0XHRcdHtcblx0XHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRcdG1vZGVsSWQ6ICdjbGF1ZGUnLFxuXHRcdFx0XHRpbnB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJyB9XSB9XSxcblx0XHRcdFx0dG9vbHM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdmdW5jdGlvbicsIG5hbWU6ICdnZXRXZWF0aGVyJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2N1c3RvbScsIG5hbWU6ICdhcHBseV9wYXRjaCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYXB0dXJlZD8ubW9kZWxJZCwgJ2lkLWFjbWUtY2xhdWRlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdG91dHB1dDogW1xuXHRcdFx0XHR7IHR5cGU6ICdyZWFzb25pbmcnLCBpZDogJ3JzXzEnLCBzdW1tYXJ5OiBbJ2NvbnNpZGVyZWQgJywgJ29wdGlvbnMnXSwgZW5jcnlwdGVkQ29udGVudDogJ29wYXF1ZScsIG1ldGFkYXRhOiB7IGVuY3J5cHRlZF9jb250ZW50OiAnb3BhcXVlJyB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ3JlYXNvbmluZycsIGlkOiAndGhpbmtpbmdfMicsIHN1bW1hcnk6IFsnJ10sIGVuY3J5cHRlZENvbnRlbnQ6ICd2c2NvZGUtcmVhc29uaW5nLW1ldGFkYXRhOntcInNpZ25hdHVyZVwiOlwic2lnXCIsXCJfY29tcGxldGVUaGlua2luZ1wiOlwiZnVsbCB0aG91Z2h0XCJ9JywgbWV0YWRhdGE6IHsgc2lnbmF0dXJlOiAnc2lnJywgX2NvbXBsZXRlVGhpbmtpbmc6ICdmdWxsIHRob3VnaHQnIH0gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hlbGxvIHdvcmxkJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdmdW5jdGlvbl9jYWxsJywgY2FsbElkOiAndDEnLCBuYW1lOiAnZ2V0V2VhdGhlcicsIGFyZ3VtZW50c0pzb246ICd7XCJjaXR5XCI6XCJOWUNcIn0nIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2N1c3RvbV90b29sX2NhbGwnLCBjYWxsSWQ6ICd0MicsIG5hbWU6ICdhcHBseV9wYXRjaCcsIGlucHV0OiAncGF0Y2gnIH0sXG5cdFx0XHRdLFxuXHRcdFx0cmVzcG9uc2VJZDogJ3Jlc3BfcHJvdmlkZXInLFxuXHRcdFx0dXNhZ2U6IHsgaW5wdXRUb2tlbnM6IDEwLCBvdXRwdXRUb2tlbnM6IDUsIHJlYXNvbmluZ1Rva2VuczogMiB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21iaW5lcyBzdHJlYW1lZCB0aGlua2luZyBjaHVua3MgaW50byBvbmUgc3VtbWFyeSBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgTWFwKFtbJ2lkLWRlZXBzZWVrJywgYnlva01vZGVsKCdjdXN0b21lbmRwb2ludCcsICdkZWVwc2VlaycpXV0pLFxuXHRcdFx0KCkgPT4gcmVzcG9uc2VPZihbXG5cdFx0XHRcdHsgdHlwZTogJ3RoaW5raW5nJywgdmFsdWU6ICdBbmFseScgfSxcblx0XHRcdFx0eyB0eXBlOiAndGhpbmtpbmcnLCB2YWx1ZTogJ3ppbmcnIH0sXG5cdFx0XHRdKSxcblx0XHQpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5jaGF0KHtcblx0XHRcdHZlbmRvcjogJ2N1c3RvbWVuZHBvaW50Jyxcblx0XHRcdG1vZGVsSWQ6ICdkZWVwc2VlaycsXG5cdFx0XHRpbnB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJyB9XSB9XSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm91dHB1dCwgW3tcblx0XHRcdHR5cGU6ICdyZWFzb25pbmcnLFxuXHRcdFx0aWQ6IHVuZGVmaW5lZCxcblx0XHRcdHN1bW1hcnk6IFsnQW5hbHl6aW5nJ10sXG5cdFx0XHRlbmNyeXB0ZWRDb250ZW50OiB1bmRlZmluZWQsXG5cdFx0XHRtZXRhZGF0YTogdW5kZWZpbmVkLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIHN0cmVhbWVkIHJlYXNvbmluZyBzdW1tYXJ5IHBhcnQgYm91bmRhcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgTWFwKFtbJ2lkJywgYnlva01vZGVsKCdjdXN0b21lbmRwb2ludCcsICdyZWFzb25pbmcnKV1dKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW1xuXHRcdFx0XHR7IHR5cGU6ICd0aGlua2luZycsIHZhbHVlOiAnZmlyJywgaWQ6ICdyc18xJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0aGlua2luZycsIHZhbHVlOiAnc3QnLCBpZDogJ3JzXzEnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3RoaW5raW5nJywgdmFsdWU6ICcnLCBpZDogJ3JzXzEnLCBtZXRhZGF0YTogeyB2c2NvZGVfcmVhc29uaW5nX3N1bW1hcnlfcGFydF9kb25lOiB0cnVlIH0gfSxcblx0XHRcdFx0eyB0eXBlOiAndGhpbmtpbmcnLCB2YWx1ZTogJ3NlYycsIGlkOiAncnNfMScgfSxcblx0XHRcdFx0eyB0eXBlOiAndGhpbmtpbmcnLCB2YWx1ZTogJ29uZCcsIGlkOiAncnNfMScgfSxcblx0XHRcdFx0eyB0eXBlOiAndGhpbmtpbmcnLCB2YWx1ZTogJycsIGlkOiAncnNfMScsIG1ldGFkYXRhOiB7IHZzY29kZV9yZWFzb25pbmdfc3VtbWFyeV9wYXJ0X2RvbmU6IHRydWUgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0aGlua2luZycsIHZhbHVlOiAnJywgaWQ6ICdyc18xJywgbWV0YWRhdGE6IHsgZW5jcnlwdGVkX2NvbnRlbnQ6ICdvcGFxdWUnIH0gfSxcblx0XHRcdF0pLFxuXHRcdCk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoc2VydmljZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmNoYXQoe1xuXHRcdFx0dmVuZG9yOiAnY3VzdG9tZW5kcG9pbnQnLFxuXHRcdFx0bW9kZWxJZDogJ3JlYXNvbmluZycsXG5cdFx0XHRpbnB1dDogW10sXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5vdXRwdXQsIFt7XG5cdFx0XHR0eXBlOiAncmVhc29uaW5nJyxcblx0XHRcdGlkOiAncnNfMScsXG5cdFx0XHRzdW1tYXJ5OiBbJ2ZpcnN0JywgJ3NlY29uZCddLFxuXHRcdFx0ZW5jcnlwdGVkQ29udGVudDogJ29wYXF1ZScsXG5cdFx0XHRtZXRhZGF0YTogeyBlbmNyeXB0ZWRfY29udGVudDogJ29wYXF1ZScgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgb3JkZXJlZCBSZXNwb25zZXMgaW5wdXQgYW5kIG9wdGlvbnMgdG8gTE0gQVBJIGNoYXQgbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IE1hcChbWydpZCcsIGJ5b2tNb2RlbCgnYWNtZScsICdjbGF1ZGUnKV1dKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ29rJyB9XSksXG5cdFx0KTtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcihzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGhhbmRsZXIuY2hhdChcblx0XHRcdHtcblx0XHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRcdG1vZGVsSWQ6ICdjbGF1ZGUnLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6ICdiZSBoZWxwZnVsJyxcblx0XHRcdFx0cHJldmlvdXNSZXNwb25zZUlkOiAncmVzcF9wcmV2aW91cycsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnLFxuXHRcdFx0XHRtb2RlbE9wdGlvbnM6IHsgdGVtcGVyYXR1cmU6IDAuNSB9LFxuXHRcdFx0XHR0b29sczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uJywgbmFtZTogJ2dldFdlYXRoZXInLCBwYXJhbWV0ZXJzU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnIH0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdjdXN0b20nLCBuYW1lOiAnYXBwbHlfcGF0Y2gnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGlucHV0OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18xJywgc3VtbWFyeTogWyd0aG91Z2h0J10sIGVuY3J5cHRlZENvbnRlbnQ6ICdvcGFxdWUnIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18yJywgc3VtbWFyeTogWydvdGhlciB0aG91Z2h0J10sIGVuY3J5cHRlZENvbnRlbnQ6ICd2c2NvZGUtcmVhc29uaW5nLW1ldGFkYXRhOntcInNpZ25hdHVyZVwiOlwic2lnLTJcIixcIl9jb21wbGV0ZVRoaW5raW5nXCI6XCJvdGhlciBjb21wbGV0ZSB0aG91Z2h0XCJ9JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnY2hlY2snIH0sIHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaW5nJyB9XSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGwnLCBjYWxsSWQ6ICd0MScsIG5hbWU6ICdnZXRXZWF0aGVyJywgYXJndW1lbnRzSnNvbjogJ3tcImNpdHlcIjpcIk5ZQ1wifScgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJywgY2FsbElkOiAndDInLCBuYW1lOiAnYXBwbHlfcGF0Y2gnLCBpbnB1dDogJ3BhdGNoJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0JywgY2FsbElkOiAndDEnLCBvdXRwdXQ6ICdzdW5ueScgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsX291dHB1dCcsIGNhbGxJZDogJ3QyJywgb3V0cHV0OiAnRG9uZSEnIH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ21lc3NhZ2UnLFxuXHRcdFx0XHRcdFx0cm9sZTogJ3VzZXInLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJyB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdpbWFnZScsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgZGF0YTogJ2FXMWhaMlU9JyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VzID0gc2VydmljZS5jYXB0dXJlZD8ubWVzc2FnZXMubWFwKG1lc3NhZ2UgPT4gKHtcblx0XHRcdHJvbGU6IG1lc3NhZ2Uucm9sZSxcblx0XHRcdGNvbnRlbnQ6IG1lc3NhZ2UuY29udGVudC5tYXAocGFydCA9PiBwYXJ0LnR5cGUgPT09ICdkYXRhJyA/IHsgLi4ucGFydCwgZGF0YTogcGFydC5kYXRhLnRvU3RyaW5nKCkgfSA6IHBhcnQpLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1lc3NhZ2VzLFxuXHRcdFx0b3B0aW9uczogc2VydmljZS5jYXB0dXJlZD8ub3B0aW9ucyxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlczogW1xuXHRcdFx0XHR7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsIGNvbnRlbnQ6IFt7IHR5cGU6ICdkYXRhJywgbWltZVR5cGU6ICdzdGF0ZWZ1bF9tYXJrZXInLCBkYXRhOiAnY2xhdWRlXFxcXHJlc3BfcHJldmlvdXMnIH1dIH0sXG5cdFx0XHRcdHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlN5c3RlbSwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ2JlIGhlbHBmdWwnIH1dIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyb2xlOiBDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50LFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3RoaW5raW5nJywgdmFsdWU6IFsndGhvdWdodCddLCBpZDogJ3JzXzEnLCBtZXRhZGF0YTogeyBlbmNyeXB0ZWRfY29udGVudDogJ29wYXF1ZScgfSB9LFxuXHRcdFx0XHRcdFx0eyB0eXBlOiAndGhpbmtpbmcnLCB2YWx1ZTogWydvdGhlciB0aG91Z2h0J10sIGlkOiAncnNfMicsIG1ldGFkYXRhOiB7IHNpZ25hdHVyZTogJ3NpZy0yJywgX2NvbXBsZXRlVGhpbmtpbmc6ICdvdGhlciBjb21wbGV0ZSB0aG91Z2h0JyB9IH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdmFsdWU6ICdjaGVja2luZycgfSxcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ2dldFdlYXRoZXInLCB0b29sQ2FsbElkOiAndDEnLCBwYXJhbWV0ZXJzOiB7IGNpdHk6ICdOWUMnIH0gfSxcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ2FwcGx5X3BhdGNoJywgdG9vbENhbGxJZDogJ3QyJywgcGFyYW1ldGVyczogeyBpbnB1dDogJ3BhdGNoJyB9IH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0eyByb2xlOiBDaGF0TWVzc2FnZVJvbGUuVXNlciwgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbENhbGxJZDogJ3QxJywgdmFsdWU6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6ICdzdW5ueScgfV0gfV0gfSxcblx0XHRcdFx0eyByb2xlOiBDaGF0TWVzc2FnZVJvbGUuVXNlciwgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbENhbGxJZDogJ3QyJywgdmFsdWU6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6ICdEb25lIScgfV0gfV0gfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ2hpJyB9LFxuXHRcdFx0XHRcdFx0eyB0eXBlOiAnaW1hZ2VfdXJsJywgdmFsdWU6IHsgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdpbWFnZScpIH0gfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0bW9kZWxPcHRpb25zOiB7IHRlbXBlcmF0dXJlOiAwLjUgfSxcblx0XHRcdFx0aW5jbHVkZUVuY3J5cHRlZFRoaW5raW5nOiB0cnVlLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7IHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnIH0sXG5cdFx0XHRcdHRvb2xzOiBbXG5cdFx0XHRcdFx0eyBuYW1lOiAnZ2V0V2VhdGhlcicsIGRlc2NyaXB0aW9uOiAnJywgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcgfSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ2FwcGx5X3BhdGNoJywgZGVzY3JpcHRpb246ICcnLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBpbnB1dDogeyB0eXBlOiAnc3RyaW5nJyB9IH0sIHJlcXVpcmVkOiBbJ2lucHV0J10gfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhbiBlcnJvciByZXN1bHQgd2hlbiBubyBCWU9LIG1vZGVsIG1hdGNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKG5ldyBNYXAoKSwgKCkgPT4gcmVzcG9uc2VPZihbXSkpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5jaGF0KFxuXHRcdFx0eyB2ZW5kb3I6ICdhY21lJywgbW9kZWxJZDogJ21pc3NpbmcnLCBpbnB1dDogW10gfSBzYXRpc2ZpZXMgSUJ5b2tMbUNoYXRSZXF1ZXN0LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQub3V0cHV0LCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5lcnJvcj8uaW5jbHVkZXMoJ2FjbWUvbWlzc2luZycpLCBgZXhwZWN0ZWQgZXJyb3IgdG8gbmFtZSB0aGUgbW9kZWw6ICR7cmVzdWx0LmVycm9yfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFuIGVycm9yIHJlc3VsdCB3aGVuIHRoZSBMTSByZXF1ZXN0IHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgTWFwKFtbJ2lkJywgYnlva01vZGVsKCdhY21lJywgJ2NsYXVkZScpXV0pLFxuXHRcdFx0KCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3Byb3ZpZGVyIGV4cGxvZGVkJyk7IH0sXG5cdFx0KTtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcihzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuY2hhdChcblx0XHRcdHsgdmVuZG9yOiAnYWNtZScsIG1vZGVsSWQ6ICdjbGF1ZGUnLCBpbnB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJyB9XSB9XSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgb3V0cHV0OiBbXSwgZXJyb3I6ICdwcm92aWRlciBleHBsb2RlZCcgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsa0NBQTJEO0FBQ3BFLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQTBLO0FBY25MLE1BQU0sa0NBQWtDLEtBQTZCLEVBQUU7QUFBQSxFQU90RSxZQUNrQixTQUNBLFVBQ2pCLDZCQUE2QixNQUFNLE1BQ2xCLGlCQUFrRCxNQUFNLE9BQ3hFO0FBQ0QsVUFBTTtBQUxXO0FBQ0E7QUFFQTtBQVBsQixTQUFrQiw0QkFBNEIsTUFBTTtBQVVuRCxTQUFLLDZCQUE2QjtBQUFBLEVBQ25DO0FBQUEsRUFFUyxzQkFBZ0M7QUFDeEMsV0FBTyxDQUFDLEdBQUcsS0FBSyxRQUFRLEtBQUssQ0FBQztBQUFBLEVBQy9CO0FBQUEsRUFFUyxvQkFBb0IsU0FBeUQ7QUFDckYsV0FBTyxLQUFLLFFBQVEsSUFBSSxPQUFPO0FBQUEsRUFDaEM7QUFBQSxFQUVTLGNBQWMsWUFBNkI7QUFDbkQsV0FBTyxLQUFLLGVBQWUsVUFBVTtBQUFBLEVBQ3RD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
