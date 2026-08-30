import assert from "assert";
import * as sinon from "sinon";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { autorun, observableValue } from "../../../../../../base/common/observable.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { SymbolKind } from "../../../../../../editor/common/languages.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../../../../services/extensions/common/extensions.js";
import { TestExtensionService, TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { CellUri } from "../../../../notebook/common/notebookCommon.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatModel, ChatResponseResource, extractExportableSessionData, isExportableSessionData, isSerializableSessionData, normalizeSerializableChatData, Response, serializeSendOptions, toChatHistoryContent } from "../../../common/model/chatModel.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { ChatRequestTextPart } from "../../../common/requestParser/chatParserTypes.js";
import { ChatRequestQueueKind, IChatService, IChatToolInvocation, ResponseModelState } from "../../../common/chatService/chatService.js";
import { ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { MockChatService } from "../chatService/mockChatService.js";
suite("ChatModel", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IChatService, new MockChatService());
  });
  test("initialization with exported data only (imported)", async () => {
    const exportedData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: exportedData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(model.isImported, true);
    assert.ok(model.sessionId);
    assert.ok(model.timestamp > 0);
  });
  test("initialization with full serializable data (not imported)", async () => {
    const now = Date.now();
    const serializableData = {
      version: 3,
      sessionId: "existing-session",
      creationDate: now - 1e3,
      customTitle: "My Chat",
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(model.isImported, false);
    assert.strictEqual(model.sessionId, "existing-session");
    assert.strictEqual(model.timestamp, now - 1e3);
    assert.strictEqual(model.customTitle, "My Chat");
  });
  test("legacy requests without timestamps keep display time unknown", () => {
    const creationDate = 1752012321e3;
    const serializableData = {
      version: 3,
      sessionId: "legacy-session",
      creationDate,
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [{
        requestId: "req1",
        message: { text: "hello", parts: [] },
        variableData: { variables: [] },
        response: void 0
      }],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.deepStrictEqual({
      recencyTimestamp: model.getRequests()[0].timestamp,
      requestTimestamp: model.getRequests()[0].requestTimestamp,
      serializedTimestamp: model.toJSON().requests[0].timestamp
    }, {
      recencyTimestamp: creationDate,
      requestTimestamp: void 0,
      serializedTimestamp: void 0
    });
  });
  test("initialization with invalid data", async () => {
    const invalidData = {
      // Missing required fields
      requests: "not-an-array"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: invalidData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(model.getRequests().length, 0);
    assert.ok(model.sessionId);
  });
  test("initialization without data", async () => {
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      void 0,
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(model.isImported, false);
    assert.strictEqual(model.getRequests().length, 0);
    assert.ok(model.sessionId);
    assert.ok(model.timestamp > 0);
  });
  test("removeRequest", async () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    model.removeRequest(requests[0].id);
    assert.strictEqual(model.getRequests().length, 0);
  });
  test("adoptRequest", async function() {
    const model1 = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.EditorInline, canUseTools: true }));
    const model2 = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request1 = model1.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    assert.strictEqual(model1.getRequests().length, 1);
    assert.strictEqual(model2.getRequests().length, 0);
    assert.ok(request1.session === model1);
    assert.ok(request1.response?.session === model1);
    model2.adoptRequest(request1);
    assert.strictEqual(model1.getRequests().length, 0);
    assert.strictEqual(model2.getRequests().length, 1);
    assert.ok(request1.session === model2);
    assert.ok(request1.response?.session === model2);
    model2.acceptResponseProgress(request1, { content: new MarkdownString("Hello"), kind: "markdownContent" });
    assert.strictEqual(request1.response.response.toString(), "Hello");
  });
  test("acceptResponseProgress applies usage to response metadata", async function() {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2 });
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2 });
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 3 });
    assert.deepStrictEqual({
      usage: request.response?.usage,
      completionTokenCount: request.response?.completionTokenCount,
      responseContent: request.response?.response.toString()
    }, {
      usage: { kind: "usage", promptTokens: 10, completionTokens: 3 },
      completionTokenCount: 5,
      responseContent: ""
    });
  });
  test("voice progress is live-only response metadata", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("Before ") });
    model.acceptResponseProgress(request, { kind: "voiceProgress", id: "investigating", value: "Investigating the relevant code." });
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("after") });
    const response = request.response.response;
    assert.deepStrictEqual({
      responseKinds: response.value.map((part) => part.kind),
      historyKinds: toChatHistoryContent(response.value).map((part) => part.kind),
      markdown: response.getMarkdown(),
      copyText: response.toString(),
      persistedKinds: model.toExport().requests[0].response?.map((part) => hasKey(part, { kind: true }) ? part.kind : "markdown")
    }, {
      responseKinds: ["markdownContent", "voiceProgress", "markdownContent"],
      historyKinds: ["markdownContent", "markdownContent"],
      markdown: "Before after",
      copyText: "Before after",
      persistedKinds: ["markdown", "markdown"]
    });
  });
  test("a refinement of the same model call updates usage without recounting its tokens", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 1, sessionCopilotCredits: 1 });
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 1, sessionCopilotCredits: 5 });
    assert.deepStrictEqual({
      sessionCopilotCredits: request.response?.usage?.sessionCopilotCredits,
      completionTokenCount: request.response?.completionTokenCount
    }, {
      sessionCopilotCredits: 5,
      completionTokenCount: 2
    });
  });
  test("subagent credits are folded into parent response usage", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    request.response?.setSubagentCopilotCredits("subagent-1", 5);
    model.acceptResponseProgress(request, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 2 });
    request.response?.setSubagentCopilotCredits("subagent-1", 6);
    request.response?.setSubagentCopilotCredits("subagent-1", 4);
    request.response?.setSubagentCopilotCredits("subagent-2", 3);
    request.response?.setSubagentCopilotCredits("invalid", Number.NaN);
    request.response?.setSubagentCopilotCredits("invalid", -1);
    assert.deepStrictEqual({ usage: request.response?.usage, completionTokenCount: request.response?.completionTokenCount, sessionCost: model.sessionCost }, {
      usage: { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 11 },
      completionTokenCount: 2,
      sessionCost: 11
    });
    const restoredSeparateCosts = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: JSON.parse(JSON.stringify(model.toJSON())), serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(restoredSeparateCosts.sessionCost, 11);
  });
  test("the session total and the summed turns each provide a floor for session cost", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const addRequest = (text) => model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const first = addRequest("one");
    model.acceptResponseProgress(first, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 2 });
    const second = addRequest("two");
    model.acceptResponseProgress(second, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 3, sessionCopilotCredits: 9 });
    assert.strictEqual(model.sessionCost, 9);
    const restored = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: JSON.parse(JSON.stringify(model.toJSON())), serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.strictEqual(restored.sessionCost, 9);
    const third = addRequest("three");
    model.acceptResponseProgress(third, { kind: "usage", promptTokens: 10, completionTokens: 2, copilotCredits: 6 });
    assert.strictEqual(model.sessionCost, 11);
  });
  test("response details, elapsed time, and tokens roundtrip through serialization", () => {
    const completedAt = 1752012405e3;
    const serializableData = {
      version: 3,
      sessionId: "test-session",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [{
        requestId: "req1",
        message: { text: "hello", parts: [] },
        variableData: { variables: [] },
        timestamp: 1752012321e3,
        response: [{ value: "response", isTrusted: false }],
        result: { details: "GPT-5.6 Sol" },
        modelState: { value: ResponseModelState.Complete, completedAt },
        responseTimestamp: 1752012322e3,
        elapsedMs: 83e3,
        completionTokens: 1234
      }],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    const response = model.getRequests()[0].response;
    const serializedResponse = model.toJSON().requests[0];
    assert.deepStrictEqual({
      details: response?.result?.details,
      requestTimestamp: model.getRequests()[0].timestamp,
      visibleRequestTimestamp: model.getRequests()[0].requestTimestamp,
      responseTimestamp: response?.timestamp,
      completionTimestamp: response?.completionTimestamp,
      elapsedMs: response?.elapsedMs,
      completionTokens: response?.completionTokenCount,
      serializedDetails: serializedResponse.result?.details,
      serializedRequestTimestamp: serializedResponse.timestamp,
      serializedResponseTimestamp: serializedResponse.responseTimestamp,
      serializedElapsedMs: serializedResponse.elapsedMs,
      serializedCompletionTokens: serializedResponse.completionTokens
    }, {
      details: "GPT-5.6 Sol",
      requestTimestamp: 1752012321e3,
      visibleRequestTimestamp: 1752012321e3,
      responseTimestamp: 1752012322e3,
      completionTimestamp: completedAt,
      elapsedMs: 83e3,
      completionTokens: 1234,
      serializedDetails: "GPT-5.6 Sol",
      serializedRequestTimestamp: 1752012321e3,
      serializedResponseTimestamp: 1752012322e3,
      serializedElapsedMs: 83e3,
      serializedCompletionTokens: 1234
    });
  });
  test("persists reasoning duration when response progress moves on", () => {
    const clock = sinon.useFakeTimers({ now: 1e3 });
    try {
      const response = testDisposables.add(new Response([]));
      response.updateContent({ kind: "thinking", value: ["First", " thought"] });
      clock.tick(1500);
      response.updateContent({ kind: "markdownContent", content: new MarkdownString("Done") });
      assert.deepStrictEqual(response.value.map((part) => part.kind === "thinking" ? {
        kind: part.kind,
        value: part.value,
        reasoningDurationMs: part.reasoningDurationMs
      } : { kind: part.kind }), [
        { kind: "thinking", value: ["First", " thought"], reasoningDurationMs: 1500 },
        { kind: "markdownContent" }
      ]);
    } finally {
      clock.restore();
    }
  });
  test("persists reasoning duration when response completes without a rendered row", () => {
    const clock = sinon.useFakeTimers({ now: 1e3 });
    try {
      const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
      const text = "hello";
      const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
      model.acceptResponseProgress(request, { kind: "thinking", value: "Still reasoning" });
      clock.tick(2300);
      request.response?.complete();
      const thinkingPart = request.response?.entireResponse.value.find((part) => part.kind === "thinking");
      assert.strictEqual(thinkingPart?.kind === "thinking" ? thinkingPart.reasoningDurationMs : void 0, 2300);
    } finally {
      clock.restore();
    }
  });
  test("addCompleteRequest", async function() {
    const model1 = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request1 = model1.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0, void 0, void 0, void 0, void 0, void 0, void 0, true);
    assert.strictEqual(request1.isCompleteAddedRequest, true);
    assert.strictEqual(request1.response.isCompleteAddedRequest, true);
    assert.strictEqual(request1.shouldBeRemovedOnSend, void 0);
    assert.strictEqual(request1.response.shouldBeRemovedOnSend, void 0);
  });
  test("deserialization marks unused question carousels as used", async () => {
    const serializableData = {
      version: 3,
      sessionId: "test-session",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [{
        requestId: "req1",
        message: { text: "hello", parts: [] },
        variableData: { variables: [] },
        response: [
          { value: "some text", isTrusted: false },
          {
            kind: "questionCarousel",
            questions: [{ id: "q1", title: "Question 1", type: "text" }],
            allowSkip: true,
            resolveId: "resolve1",
            isUsed: false
          }
        ],
        modelState: { value: 2, completedAt: Date.now() }
      }],
      responderUsername: "bot"
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    const response = requests[0].response;
    const carouselPart = response.response.value.find((p) => p.kind === "questionCarousel");
    assert.ok(carouselPart);
    assert.strictEqual(carouselPart.isUsed, true);
    assert.strictEqual(response.isComplete, true);
  });
  test("inputModel.toJSON filters extension-contributed contexts", async function() {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const fileAttachment = {
      kind: "file",
      value: URI.parse("file:///test.ts"),
      id: "file-id",
      name: "test.ts"
    };
    const stringContextValue = {
      value: "pr-content",
      name: "PR #123",
      iconPath: Codicon.gitPullRequest,
      uri: URI.parse("pr://123"),
      handle: 1
    };
    const stringAttachment = {
      kind: "string",
      value: "pr-content",
      id: "string-id",
      name: "PR #123",
      iconPath: Codicon.gitPullRequest,
      uri: URI.parse("pr://123"),
      handle: 1
    };
    const implicitWithStringContext = {
      kind: "implicit",
      isFile: true,
      value: stringContextValue,
      uri: URI.parse("pr://123"),
      isSelection: false,
      enabled: true,
      id: "implicit-string-id",
      name: "PR Context"
    };
    const implicitWithUri = {
      kind: "implicit",
      isFile: true,
      value: URI.parse("file:///current.ts"),
      uri: URI.parse("file:///current.ts"),
      isSelection: false,
      enabled: true,
      id: "implicit-uri-id",
      name: "current.ts"
    };
    model.inputModel.setState({
      attachments: [fileAttachment, stringAttachment, implicitWithStringContext, implicitWithUri],
      inputText: "test"
    });
    const serialized = model.inputModel.toJSON();
    assert.ok(serialized);
    assert.deepStrictEqual(serialized.attachments, [fileAttachment, implicitWithUri]);
  });
  test("modeInfo roundtrips through serialization", async () => {
    const modeInfo = {
      kind: ChatModeKind.Agent,
      isBuiltin: false,
      telemetryModeId: "custom",
      modeInstructions: {
        name: "plan",
        content: "You are a planning agent",
        toolReferences: []
      },
      applyCodeBlockSuggestionId: void 0
    };
    const serializableData = {
      version: 3,
      sessionId: "test-modeinfo-session",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      responderUsername: "bot",
      requests: [{
        requestId: "req1",
        message: { text: "plan something", parts: [] },
        variableData: { variables: [] },
        response: [{ value: "Here is my plan", isTrusted: false }],
        modelState: { value: 1, completedAt: Date.now() },
        modeInfo
      }]
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    assert.deepStrictEqual(requests[0].modeInfo, modeInfo);
    const exported = model.toExport();
    assert.strictEqual(exported.requests.length, 1);
    assert.deepStrictEqual(exported.requests[0].modeInfo, modeInfo);
  });
  test("restores legacy top-level modelConfiguration into selectedModel (backwards compat)", async () => {
    const legacyConfig = { thinkingEffort: "high", contextSize: 2e3 };
    const legacyInputState = {
      attachments: [],
      contrib: {},
      inputText: "draft",
      selections: [],
      mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
      selectedModel: { identifier: "copilot/gpt", metadata: { name: "GPT" } },
      modelConfiguration: legacyConfig
    };
    const serializableData = {
      version: 3,
      sessionId: "legacy-model-config-session",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      responderUsername: "bot",
      requests: [],
      inputState: legacyInputState
    };
    const model = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializableData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    assert.deepStrictEqual(model.inputModel.state.get()?.modelConfiguration, legacyConfig);
    const serialized = model.inputModel.toJSON();
    assert.deepStrictEqual(serialized?.selectedModel?.modelConfiguration, legacyConfig);
    assert.strictEqual(serialized.modelConfiguration, void 0);
  });
});
suite("Response", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("mergeable markdown", async () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("markdown1"), kind: "markdownContent" });
    response.updateContent({ content: new MarkdownString("markdown2"), kind: "markdownContent" });
    await assertSnapshot(response.value);
    assert.strictEqual(response.toString(), "markdown1markdown2");
  });
  test("mergeable markdown across nested subagent progress", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("I"), kind: "markdownContent" });
    response.updateContent(ChatToolInvocation.createStreaming({
      toolCallId: "child-tool",
      toolId: "view",
      toolData: {
        id: "view",
        modelDescription: "Read a file",
        displayName: "Reading",
        source: ToolDataSource.Internal
      },
      subagentInvocationId: "parent-tool"
    }));
    response.updateContent({ content: new MarkdownString("'ve launched a background agent."), kind: "markdownContent" });
    assert.deepStrictEqual(response.value.map((part) => part.kind === "markdownContent" ? { kind: part.kind, content: part.content.value } : { kind: part.kind }), [
      { kind: "markdownContent", content: "I've launched a background agent." },
      { kind: "toolInvocation" }
    ]);
  });
  test("not mergeable markdown", async () => {
    const response = store.add(new Response([]));
    const md1 = new MarkdownString("markdown1");
    md1.supportHtml = true;
    response.updateContent({ content: md1, kind: "markdownContent" });
    response.updateContent({ content: new MarkdownString("markdown2"), kind: "markdownContent" });
    await assertSnapshot(response.value);
  });
  test("system notification remains distinct from later response content", () => {
    const response = store.add(new Response([]));
    response.updateContent({ kind: "systemNotification", content: new MarkdownString("Background command completed") });
    response.updateContent({ kind: "markdownContent", content: new MarkdownString("Finished processing output.") });
    assert.deepStrictEqual({
      kinds: response.value.map((part) => part.kind),
      text: response.toString()
    }, {
      kinds: ["systemNotification", "markdownContent"],
      text: "Background command completed\n\nFinished processing output."
    });
  });
  test("system notification keeps streaming tool progress at the response tail", () => {
    const response = store.add(new Response([]));
    response.updateContent({ kind: "markdownContent", content: new MarkdownString("Checking the workspace.") });
    response.updateContent(ChatToolInvocation.createStreaming({
      toolCallId: "tool-call-1",
      toolId: "view",
      toolData: {
        id: "view",
        modelDescription: "Read a file",
        displayName: "Reading",
        source: ToolDataSource.Internal
      }
    }));
    response.updateContent({ kind: "systemNotification", content: new MarkdownString("Background agent completed") });
    assert.deepStrictEqual(response.value.map((part) => part.kind), [
      "markdownContent",
      "systemNotification",
      "toolInvocation"
    ]);
  });
  test("system notification does not reorder an older streaming tool around a progress task", async () => {
    const response = store.add(new Response([]));
    const deferred = new DeferredPromise();
    const progressTask = {
      kind: "progressTask",
      content: new MarkdownString("Waiting for task"),
      deferred,
      progress: [],
      onDidAddProgress: Event.None,
      add: () => {
      },
      complete: (result) => deferred.complete(result),
      task: () => deferred.p,
      isSettled: () => deferred.isSettled,
      toJSON: () => ({ kind: "progressTaskSerialized", content: progressTask.content, progress: progressTask.progress })
    };
    response.updateContent(ChatToolInvocation.createStreaming({
      toolCallId: "tool-call-1",
      toolId: "view",
      toolData: {
        id: "view",
        modelDescription: "Read a file",
        displayName: "Reading",
        source: ToolDataSource.Internal
      }
    }));
    response.updateContent(progressTask);
    response.updateContent({ kind: "systemNotification", content: new MarkdownString("Background agent completed") });
    progressTask.complete("Task completed");
    await progressTask.task();
    assert.deepStrictEqual(response.value.map((part) => part.kind === "progressTask" || part.kind === "systemNotification" ? { kind: part.kind, content: part.content.value } : { kind: part.kind }), [
      { kind: "toolInvocation" },
      { kind: "progressTask", content: "Task completed" },
      { kind: "systemNotification", content: "Background agent completed" }
    ]);
  });
  test("inline reference", async () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("text before "), kind: "markdownContent" });
    response.updateContent({ inlineReference: URI.parse("https://microsoft.com/"), kind: "inlineReference" });
    response.updateContent({ content: new MarkdownString(" text after"), kind: "markdownContent" });
    await assertSnapshot(response.value);
    assert.strictEqual(response.toString(), "text before https://microsoft.com/ text after");
  });
  test("resolve inline reference updates existing response content", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    });
    let changes = 0;
    store.add(response.onDidChangeValue(() => changes++));
    const didResolve = response.resolveInlineReference("resolve1", {
      kind: "inlineReference",
      inlineReference: {
        name: "Foo",
        kind: SymbolKind.Class,
        location: { uri, range: new Range(2, 7, 2, 10) }
      }
    });
    const resolved = response.value[0];
    const resolvedReference = resolved.kind === "inlineReference" ? resolved.inlineReference : void 0;
    assert.deepStrictEqual({
      didResolve,
      changes,
      responseText: response.toString(),
      resolvedReference
    }, {
      didResolve: true,
      changes: 1,
      responseText: "`Foo`",
      resolvedReference: {
        name: "Foo",
        kind: SymbolKind.Class,
        location: { uri, range: new Range(2, 7, 2, 10) }
      }
    });
  });
  test("resolve inline reference updates display name when provided", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    });
    const didResolve = response.resolveInlineReference("resolve1", {
      kind: "inlineReference",
      inlineReference: {
        name: "Foo",
        kind: SymbolKind.Class,
        location: { uri, range: new Range(2, 7, 2, 10) }
      },
      name: "Resolved Foo"
    });
    const resolved = response.value[0];
    assert.deepStrictEqual({
      didResolve,
      displayName: resolved.kind === "inlineReference" ? resolved.name : void 0,
      responseText: response.toString()
    }, {
      didResolve: true,
      displayName: "Resolved Foo",
      responseText: "`Foo`"
    });
  });
  test("resolve inline reference returns false for an unknown resolve id", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    });
    let changes = 0;
    store.add(response.onDidChangeValue(() => changes++));
    const didResolve = response.resolveInlineReference("missing", {
      kind: "inlineReference",
      inlineReference: {
        name: "Foo",
        kind: SymbolKind.Class,
        location: { uri, range: new Range(2, 7, 2, 10) }
      }
    });
    assert.deepStrictEqual({
      didResolve,
      changes,
      responseText: response.toString()
    }, {
      didResolve: false,
      changes: 0,
      responseText: "`foo.ts:1`"
    });
  });
  test("inline file reference copies as code with its line suffix", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const response = store.add(new Response([]));
    response.updateContent({ kind: "inlineReference", inlineReference: { uri, range: new Range(42, 1, 42, 8) } });
    response.updateContent({ content: new MarkdownString(" and "), kind: "markdownContent" });
    response.updateContent({ kind: "inlineReference", inlineReference: { uri, range: new Range(10, 1, 20, 1) } });
    response.updateContent({ content: new MarkdownString(" and "), kind: "markdownContent" });
    response.updateContent({ kind: "inlineReference", inlineReference: uri });
    assert.strictEqual(response.toString(), "`foo.ts:42` and `foo.ts:10-20` and `foo.ts`");
  });
  test("consolidated edit summary", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Some content before edits"), kind: "markdownContent" });
    response.updateContent({ kind: "textEditGroup", uri: URI.parse("file:///file1.ts"), edits: [], state: void 0, done: true });
    response.updateContent({ kind: "textEditGroup", uri: URI.parse("file:///file2.ts"), edits: [], state: void 0, done: true });
    response.updateContent({ content: new MarkdownString("Some content after edits"), kind: "markdownContent" });
    const responseString = response.toString();
    const madeChangesCount = (responseString.match(/Made changes\./g) || []).length;
    assert.strictEqual(madeChangesCount, 1, 'Should have exactly one "Made changes." message');
    assert.ok(responseString.includes("Some content before edits"), "Should include content before edits");
    assert.ok(responseString.includes("Some content after edits"), "Should include content after edits");
    assert.ok(responseString.endsWith("Made changes."), 'Should end with "Made changes."');
  });
  test("no edit summary when no edits", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Some content"), kind: "markdownContent" });
    response.updateContent({ content: new MarkdownString("More content"), kind: "markdownContent" });
    const responseString = response.toString();
    assert.ok(!responseString.includes("Made changes."), 'Should not include "Made changes." when no edits present');
    assert.strictEqual(responseString, "Some contentMore content");
  });
  test("consolidated edit summary with clear operation", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Initial content"), kind: "markdownContent" });
    response.updateContent({ kind: "textEditGroup", uri: URI.parse("file:///file1.ts"), edits: [], state: void 0, done: true });
    response.updateContent({ kind: "clearToPreviousToolInvocation", reason: 1 });
    response.updateContent({ content: new MarkdownString("Content after clear"), kind: "markdownContent" });
    response.updateContent({ kind: "textEditGroup", uri: URI.parse("file:///file2.ts"), edits: [], state: void 0, done: true });
    const responseString = response.toString();
    const madeChangesCount = (responseString.match(/Made changes\./g) || []).length;
    assert.strictEqual(madeChangesCount, 1, 'Should have exactly one "Made changes." message after clear');
    assert.ok(responseString.includes("Content after clear"), "Should include content after clear");
    assert.ok(!responseString.includes("Initial content"), "Should not include content before clear");
    assert.ok(responseString.endsWith("Made changes."), 'Should end with "Made changes."');
  });
  test("textEdit merges edits for same URI when not done", () => {
    const response = store.add(new Response([]));
    const uri = URI.parse("file:///file1.ts");
    response.updateContent({
      kind: "textEdit",
      uri,
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit1" }],
      done: false,
      isExternalEdit: true
    });
    response.updateContent({
      kind: "textEdit",
      uri,
      edits: [{ range: new Range(2, 1, 2, 1), text: "edit2" }],
      done: true
    });
    const textEditGroups = response.value.filter((p) => p.kind === "textEditGroup");
    assert.strictEqual(textEditGroups.length, 1, "Should have exactly one textEditGroup");
    assert.strictEqual(textEditGroups[0].edits.length, 2, "Should have two edit batches merged");
    assert.strictEqual(textEditGroups[0].done, true, "Should be marked as done after final edit");
    assert.strictEqual(textEditGroups[0].isExternalEdit, true, "Should preserve isExternalEdit flag from first edit");
  });
  test("textEdit does not merge edits when previous is done", () => {
    const response = store.add(new Response([]));
    const uri = URI.parse("file:///file1.ts");
    response.updateContent({
      kind: "textEdit",
      uri,
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit1" }],
      done: true
    });
    response.updateContent({
      kind: "textEdit",
      uri,
      edits: [{ range: new Range(2, 1, 2, 1), text: "edit2" }],
      done: true
    });
    const textEditGroups = response.value.filter((p) => p.kind === "textEditGroup");
    assert.strictEqual(textEditGroups.length, 2, "Should have two separate textEditGroups");
  });
  test("textEdit does not merge edits for different URIs", () => {
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "textEdit",
      uri: URI.parse("file:///file1.ts"),
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit1" }],
      done: false
    });
    response.updateContent({
      kind: "textEdit",
      uri: URI.parse("file:///file2.ts"),
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit2" }],
      done: true
    });
    const textEditGroups = response.value.filter((p) => p.kind === "textEditGroup");
    assert.strictEqual(textEditGroups.length, 2, "Should have two separate textEditGroups for different URIs");
  });
  test("notebookEdit merges edits for same notebook URI when not done", () => {
    const response = store.add(new Response([]));
    const notebookUri = URI.parse("file:///notebook.ipynb");
    response.updateContent({
      kind: "notebookEdit",
      uri: notebookUri,
      edits: [{ editType: 1, index: 0, count: 0, cells: [] }],
      done: false,
      isExternalEdit: true
    });
    response.updateContent({
      kind: "notebookEdit",
      uri: notebookUri,
      edits: [{ editType: 1, index: 1, count: 0, cells: [] }],
      done: true
    });
    const notebookEditGroups = response.value.filter((p) => p.kind === "notebookEditGroup");
    assert.strictEqual(notebookEditGroups.length, 1, "Should have exactly one notebookEditGroup");
    assert.strictEqual(notebookEditGroups[0].edits.length, 2, "Should have two edit batches merged");
    assert.strictEqual(notebookEditGroups[0].done, true, "Should be marked as done after final edit");
    assert.strictEqual(notebookEditGroups[0].isExternalEdit, true, "Should preserve isExternalEdit flag from first edit");
  });
  test("notebookEdit does not merge edits when previous is done", () => {
    const response = store.add(new Response([]));
    const notebookUri = URI.parse("file:///notebook.ipynb");
    response.updateContent({
      kind: "notebookEdit",
      uri: notebookUri,
      edits: [{ editType: 1, index: 0, count: 0, cells: [] }],
      done: true
    });
    response.updateContent({
      kind: "notebookEdit",
      uri: notebookUri,
      edits: [{ editType: 1, index: 1, count: 0, cells: [] }],
      done: true
    });
    const notebookEditGroups = response.value.filter((p) => p.kind === "notebookEditGroup");
    assert.strictEqual(notebookEditGroups.length, 2, "Should have two separate notebookEditGroups");
  });
  test("notebookEdit does not merge edits for different notebook URIs", () => {
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "notebookEdit",
      uri: URI.parse("file:///notebook1.ipynb"),
      edits: [{ editType: 1, index: 0, count: 0, cells: [] }],
      done: false
    });
    response.updateContent({
      kind: "notebookEdit",
      uri: URI.parse("file:///notebook2.ipynb"),
      edits: [{ editType: 1, index: 0, count: 0, cells: [] }],
      done: true
    });
    const notebookEditGroups = response.value.filter((p) => p.kind === "notebookEditGroup");
    assert.strictEqual(notebookEditGroups.length, 2, "Should have two separate notebookEditGroups for different URIs");
  });
  test("textEdit to notebook cell creates notebookEditGroup", () => {
    const response = store.add(new Response([]));
    const notebookUri = URI.parse("file:///notebook.ipynb");
    const cellUri = CellUri.generate(notebookUri, 1);
    response.updateContent({
      kind: "textEdit",
      uri: cellUri,
      edits: [{ range: new Range(1, 1, 1, 1), text: "edit1" }],
      done: true
    });
    const textEditGroups = response.value.filter((p) => p.kind === "textEditGroup");
    const notebookEditGroups = response.value.filter((p) => p.kind === "notebookEditGroup");
    assert.strictEqual(textEditGroups.length, 0, "Should not have textEditGroup for cell edits");
    assert.strictEqual(notebookEditGroups.length, 1, "Should have notebookEditGroup for cell edits");
  });
  test("external terminal tool updates preserve toolSpecificData when completing an existing invocation", () => {
    const response = store.add(new Response([]));
    const toolSpecificData = {
      kind: "terminal",
      language: "bash",
      commandLine: { original: "npm test" },
      terminalCommandOutput: { text: "all green" },
      terminalCommandState: { exitCode: 0 }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-1",
      toolName: "run_in_terminal",
      isComplete: false,
      invocationMessage: "Running npm test"
    });
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-1",
      toolName: "run_in_terminal",
      isComplete: true,
      pastTenseMessage: "Ran npm test",
      toolSpecificData
    });
    assert.strictEqual(response.value.length, 1);
    assert.strictEqual(response.value[0].kind, "toolInvocation");
    assert.deepStrictEqual(response.value[0].toolSpecificData, toolSpecificData);
    assert.strictEqual(IChatToolInvocation.isComplete(response.value[0]), true);
  });
  test("external terminal tool updates preserve toolSpecificData when first pushed as complete", () => {
    const response = store.add(new Response([]));
    const toolSpecificData = {
      kind: "terminal",
      language: "bash",
      commandLine: { original: "npm test" },
      terminalCommandOutput: { text: "all green" },
      terminalCommandState: { exitCode: 0 }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-2",
      toolName: "run_in_terminal",
      isComplete: true,
      invocationMessage: "Running npm test",
      pastTenseMessage: "Ran npm test",
      toolSpecificData
    });
    assert.strictEqual(response.value.length, 1);
    assert.strictEqual(response.value[0].kind, "toolInvocation");
    assert.deepStrictEqual(response.value[0].toolSpecificData, toolSpecificData);
    assert.strictEqual(IChatToolInvocation.isComplete(response.value[0]), true);
  });
  test("response stringification prefers terminal display command over sandbox wrapper", () => {
    const response = store.add(new Response([]));
    const sandboxWrappedCommand = `ELECTRON_RUN_AS_NODE=1 TMPDIR="/tmp/vscode" "Code - Insiders" "sandbox-runtime" -c 'npm test'`;
    const toolSpecificData = {
      kind: "terminal",
      language: "bash",
      commandLine: {
        original: sandboxWrappedCommand,
        toolEdited: sandboxWrappedCommand,
        forDisplay: "npm test",
        isSandboxWrapped: true
      },
      terminalCommandOutput: { text: "all green" },
      terminalCommandState: { exitCode: 0 }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-display-command",
      toolName: "run_in_terminal",
      isComplete: true,
      pastTenseMessage: "Ran npm test",
      toolSpecificData
    });
    const responseString = response.toString();
    assert.strictEqual(responseString, "Ran terminal command: npm test");
    assert.ok(!responseString.includes("sandbox-runtime"));
    assert.ok(!responseString.includes("ELECTRON_RUN_AS_NODE=1"));
  });
  test("response stringification prefers terminal presentation override over display command", () => {
    const response = store.add(new Response([]));
    const sandboxWrappedCommand = `ELECTRON_RUN_AS_NODE=1 TMPDIR="/tmp/vscode" "Code - Insiders" "sandbox-runtime" -c 'python -c "print(1)"'`;
    const toolSpecificData = {
      kind: "terminal",
      language: "python",
      commandLine: {
        original: sandboxWrappedCommand,
        toolEdited: sandboxWrappedCommand,
        forDisplay: 'python -c "print(1)"',
        isSandboxWrapped: true
      },
      presentationOverrides: {
        commandLine: "print(1)",
        language: "python"
      },
      terminalCommandOutput: { text: "1" },
      terminalCommandState: { exitCode: 0 }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-presentation-override",
      toolName: "run_in_terminal",
      isComplete: true,
      pastTenseMessage: "Ran python command",
      toolSpecificData
    });
    const responseString = response.toString();
    assert.strictEqual(responseString, "Ran terminal command: print(1)");
    assert.ok(!responseString.includes("sandbox-runtime"));
    assert.ok(!responseString.includes('python -c "print(1)"'));
  });
  test("response stringification uses terminal presentation override for result details", () => {
    const response = store.add(new Response([]));
    const sandboxWrappedCommand = `ELECTRON_RUN_AS_NODE=1 TMPDIR="/tmp/vscode" CLAUDE_TMPDIR="/tmp/vscode" "Code - Insiders" "sandbox-runtime" --settings "/tmp/settings.json" -c 'python -c "print(1)"'`;
    const toolSpecificData = {
      kind: "terminal",
      language: "python",
      commandLine: {
        original: 'python -c "print(1)"',
        toolEdited: sandboxWrappedCommand,
        forDisplay: 'python -c "print(1)"',
        isSandboxWrapped: true
      },
      presentationOverrides: {
        commandLine: "print(1)",
        language: "python"
      }
    };
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-call-result-details",
      toolName: "run_in_terminal",
      isComplete: true,
      pastTenseMessage: "Ran python command",
      toolSpecificData,
      resultDetails: {
        input: sandboxWrappedCommand,
        output: [{ type: "embed", isText: true, value: "1" }],
        isError: true
      }
    });
    const responseString = response.toString();
    assert.strictEqual(responseString, "Ran terminal command: print(1)\nCompleted with input: print(1)");
    assert.ok(!responseString.includes("sandbox-runtime"));
    assert.ok(!responseString.includes("ELECTRON_RUN_AS_NODE=1"));
    assert.ok(!responseString.includes('python -c "print(1)"'));
  });
  test("getFinalResponse returns last contiguous markdown after tool call", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Early text"), kind: "markdownContent" });
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-1",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran tool"
    });
    response.updateContent({ content: new MarkdownString("Final text"), kind: "markdownContent" });
    assert.strictEqual(response.getFinalResponse(), "Final text");
  });
  test("getFinalResponse skips trailing empty markdown and tool calls", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Before tool"), kind: "markdownContent" });
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-1",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran tool"
    });
    response.updateContent({ content: new MarkdownString("The answer is 42."), kind: "markdownContent" });
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-2",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran another tool"
    });
    response.updateContent({ content: new MarkdownString(""), kind: "markdownContent" });
    assert.strictEqual(response.getFinalResponse(), "The answer is 42.");
  });
  test("getFinalResponse includes inline references in final block", () => {
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-1",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran tool"
    });
    response.updateContent({ content: new MarkdownString("See "), kind: "markdownContent" });
    response.updateContent({ inlineReference: URI.parse("https://example.com/"), kind: "inlineReference" });
    response.updateContent({ content: new MarkdownString(" for details."), kind: "markdownContent" });
    assert.strictEqual(response.getFinalResponse(), "See https://example.com/ for details.");
  });
  test("getFinalResponse returns empty string when no markdown", () => {
    const response = store.add(new Response([]));
    response.updateContent({
      kind: "externalToolInvocationUpdate",
      toolCallId: "tool-1",
      toolName: "some_tool",
      isComplete: true,
      invocationMessage: "Ran tool"
    });
    assert.strictEqual(response.getFinalResponse(), "");
  });
  test("getFinalResponse returns all markdown when there are no tool calls", () => {
    const response = store.add(new Response([]));
    response.updateContent({ content: new MarkdownString("Hello "), kind: "markdownContent" });
    response.updateContent({ content: new MarkdownString("World"), kind: "markdownContent" });
    assert.strictEqual(response.getFinalResponse(), "Hello World");
  });
});
suite("normalizeSerializableChatData", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("v1", () => {
    const v1Data = {
      creationDate: Date.now(),
      initialLocation: void 0,
      requests: [],
      responderUsername: "bot",
      sessionId: "session1"
    };
    const newData = normalizeSerializableChatData(v1Data);
    assert.strictEqual(newData.creationDate, v1Data.creationDate);
    assert.strictEqual(newData.version, 3);
  });
  test("v2", () => {
    const v2Data = {
      version: 2,
      creationDate: 100,
      initialLocation: void 0,
      requests: [],
      responderUsername: "bot",
      sessionId: "session1",
      computedTitle: "computed title"
    };
    const newData = normalizeSerializableChatData(v2Data);
    assert.strictEqual(newData.version, 3);
    assert.strictEqual(newData.creationDate, v2Data.creationDate);
    assert.strictEqual(newData.customTitle, v2Data.computedTitle);
  });
  test("old bad data", () => {
    const v1Data = {
      // Testing the scenario where these are missing
      sessionId: void 0,
      creationDate: void 0,
      initialLocation: void 0,
      requests: [],
      responderUsername: "bot"
    };
    const newData = normalizeSerializableChatData(v1Data);
    assert.strictEqual(newData.version, 3);
    assert.ok(newData.creationDate > 0);
    assert.ok(newData.sessionId);
  });
  test("v3 with bug", () => {
    const v3Data = {
      // Test case where old data was wrongly normalized and these fields were missing
      creationDate: void 0,
      version: 3,
      initialLocation: void 0,
      requests: [],
      responderUsername: "bot",
      sessionId: "session1",
      customTitle: "computed title"
    };
    const newData = normalizeSerializableChatData(v3Data);
    assert.strictEqual(newData.version, 3);
    assert.ok(newData.creationDate > 0);
    assert.ok(newData.sessionId);
  });
});
suite("isExportableSessionData", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("valid exportable data", () => {
    const validData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    assert.strictEqual(isExportableSessionData(validData), true);
  });
  test("invalid - missing requests", () => {
    const invalidData = {
      initialLocation: ChatAgentLocation.Chat,
      responderUsername: "bot"
    };
    assert.strictEqual(isExportableSessionData(invalidData), false);
  });
  test("invalid - requests not array", () => {
    const invalidData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: "not-an-array",
      responderUsername: "bot"
    };
    assert.strictEqual(isExportableSessionData(invalidData), false);
  });
  test("invalid - missing responderUsername", () => {
    const invalidData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: []
    };
    assert.strictEqual(isExportableSessionData(invalidData), false);
  });
  test("invalid - responderUsername not string", () => {
    const invalidData = {
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: 123
    };
    assert.strictEqual(isExportableSessionData(invalidData), false);
  });
  test("invalid - null", () => {
    assert.strictEqual(isExportableSessionData(null), false);
  });
  test("invalid - undefined", () => {
    assert.strictEqual(isExportableSessionData(void 0), false);
  });
  test("extracts only exportable session fields", () => {
    const data = {
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "assistant",
      sessionId: "../../../outside",
      creationDate: 1,
      customTitle: "Injected title"
    };
    assert.deepStrictEqual(extractExportableSessionData(data), {
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "assistant"
    });
  });
});
suite("isSerializableSessionData", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("valid serializable data", () => {
    const validData = {
      version: 3,
      sessionId: "session1",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(validData), true);
  });
  test("valid - with usedContext", () => {
    const validData = {
      version: 3,
      sessionId: "session1",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [{
        requestId: "req1",
        message: "test",
        variableData: { variables: [] },
        response: void 0,
        usedContext: { documents: [], kind: "usedContext" }
      }],
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(validData), true);
  });
  test("invalid - missing sessionId", () => {
    const invalidData = {
      version: 3,
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(invalidData), false);
  });
  test("invalid - missing creationDate", () => {
    const invalidData = {
      version: 3,
      sessionId: "session1",
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: [],
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(invalidData), false);
  });
  test("invalid - not exportable", () => {
    const invalidData = {
      version: 3,
      sessionId: "session1",
      creationDate: Date.now(),
      customTitle: void 0,
      initialLocation: ChatAgentLocation.Chat,
      requests: "not-an-array",
      responderUsername: "bot"
    };
    assert.strictEqual(isSerializableSessionData(invalidData), false);
  });
});
suite("ChatResponseModel", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IChatService, new MockChatService());
  });
  test("timestamp and confirmationAdjustedTimestamp", async () => {
    const clock = sinon.useFakeTimers();
    try {
      const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
      const start = Date.now();
      const text = "hello";
      const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
      const response = request.response;
      assert.strictEqual(response.timestamp, start);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
      clock.tick(1e3);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
      const toolState = observableValue("state", { type: 1, confirmationMessages: { title: "Please confirm" } });
      const toolInvocation = {
        kind: "toolInvocation",
        invocationMessage: "calling tool",
        state: toolState
      };
      model.acceptResponseProgress(request, toolInvocation);
      clock.tick(2e3);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start);
      toolState.set({
        type: 4
        /* IChatToolInvocation.StateKind.Completed */
      }, void 0);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start + 2e3);
      clock.tick(1e3);
      assert.strictEqual(response.confirmationAdjustedTimestamp.get(), start + 2e3);
    } finally {
      clock.restore();
    }
  });
  test("isIncomplete stays true during tool confirmations", async () => {
    const clock = sinon.useFakeTimers();
    try {
      const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
      const text = "hello";
      const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
      const response = request.response;
      assert.strictEqual(response.isIncomplete.get(), true);
      assert.strictEqual(response.isInProgress.get(), true);
      const toolState = observableValue("state", { type: 1, confirmationMessages: { title: "Please confirm" } });
      const toolInvocation = {
        kind: "toolInvocation",
        invocationMessage: "calling tool",
        state: toolState
      };
      model.acceptResponseProgress(request, toolInvocation);
      assert.strictEqual(response.isInProgress.get(), false);
      assert.strictEqual(response.isIncomplete.get(), true);
      toolState.set({
        type: 4
        /* IChatToolInvocation.StateKind.Completed */
      }, void 0);
      assert.strictEqual(response.isInProgress.get(), true);
      assert.strictEqual(response.isIncomplete.get(), true);
      response.complete();
      assert.strictEqual(response.isInProgress.get(), false);
      assert.strictEqual(response.isIncomplete.get(), false);
      assert.strictEqual(response.state, ResponseModelState.Complete);
    } finally {
      clock.restore();
    }
  });
  test("MCP tool authentication marks the response as needing input", () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const response = request.response;
    const toolInvocation = {
      kind: "toolInvocation",
      invocationMessage: "calling tool",
      state: observableValue("state", {
        type: IChatToolInvocation.StateKind.WaitingForAuthentication,
        server: { id: "server", name: "GitHub MCP", resource: "https://api.githubcopilot.com/mcp" },
        cancel: () => {
        }
      })
    };
    model.acceptResponseProgress(request, toolInvocation);
    assert.deepStrictEqual({
      isInProgress: response.isInProgress.get(),
      isIncomplete: response.isIncomplete.get(),
      pending: response.isPendingConfirmation.get()?.detail
    }, {
      isInProgress: false,
      isIncomplete: true,
      pending: "Authenticate GitHub MCP to continue..."
    });
  });
  test("isIncomplete becomes false on cancellation", async () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const response = request.response;
    assert.strictEqual(response.isIncomplete.get(), true);
    model.cancelRequest(request);
    assert.deepStrictEqual({
      isIncomplete: response.isIncomplete.get(),
      state: response.state,
      hasElapsedTime: typeof response.elapsedMs === "number"
    }, {
      isIncomplete: false,
      state: ResponseModelState.Cancelled,
      hasElapsedTime: true
    });
  });
  test("cancellation transitions streaming tool invocations to Cancelled (issue #288701)", async () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "edit a file";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    const response = request.response;
    const toolInvocation = ChatToolInvocation.createStreaming({
      toolCallId: "tool-call-1",
      toolId: "replace_string_in_file",
      toolData: {
        id: "replace_string_in_file",
        modelDescription: "Replace string in file",
        displayName: "Replace String in File",
        source: ToolDataSource.Internal
      }
    });
    model.acceptResponseProgress(request, toolInvocation);
    assert.strictEqual(toolInvocation.state.get().type, IChatToolInvocation.StateKind.Streaming);
    assert.strictEqual(IChatToolInvocation.isComplete(toolInvocation), false);
    model.cancelRequest(request);
    assert.strictEqual(toolInvocation.state.get().type, IChatToolInvocation.StateKind.Cancelled);
    assert.strictEqual(IChatToolInvocation.isComplete(toolInvocation), true);
    assert.strictEqual(response.state, ResponseModelState.Cancelled);
  });
  test("completed tool invocation ignores duplicate completion", async () => {
    const toolInvocation = new ChatToolInvocation({ invocationMessage: "Running command" }, {
      id: "run_in_terminal",
      modelDescription: "Run a command",
      displayName: "Run in Terminal",
      source: ToolDataSource.Internal
    }, "tool-call-1", void 0, {}, {});
    const result = {
      content: [],
      toolResultDetails: {
        input: "{}",
        output: [{ type: "embed", value: "iVBORw0KGgo=", mimeType: "image/png" }]
      }
    };
    let completedNotifications = 0;
    testDisposables.add(autorun((reader) => {
      if (toolInvocation.state.read(reader).type === IChatToolInvocation.StateKind.Completed) {
        completedNotifications++;
      }
    }));
    await toolInvocation.didExecuteTool(result);
    await toolInvocation.didExecuteTool(result, true);
    assert.strictEqual(completedNotifications, 1);
  });
  test("hasActiveRequest reflects last request isIncomplete", async () => {
    const model = testDisposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    assert.strictEqual(model.hasActiveRequest.get(), false);
    const text = "hello";
    const request = model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0);
    assert.strictEqual(model.hasActiveRequest.get(), true);
    request.response.complete();
    assert.strictEqual(model.hasActiveRequest.get(), false);
  });
});
suite("ChatModel - Pending Requests", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  function createModel() {
    return testDisposables.add(instantiationService.createInstance(
      ChatModel,
      void 0,
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
  }
  function addRequestToModel(model, text) {
    return model.addRequest(
      { text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] },
      { variables: [] },
      0
    );
  }
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IChatAgentService, testDisposables.add(instantiationService.createInstance(ChatAgentService)));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IChatService, new MockChatService());
  });
  test("addPendingRequest - queued messages are added at the end", () => {
    const model = createModel();
    const request1 = addRequestToModel(model, "first");
    const request2 = addRequestToModel(model, "second");
    model.addPendingRequest(request1, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(request2, ChatRequestQueueKind.Queued, {});
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].request.id, request1.id);
    assert.strictEqual(pending[1].request.id, request2.id);
  });
  test("addPendingRequest - steering messages are inserted before queued messages", () => {
    const model = createModel();
    const queued = addRequestToModel(model, "queued");
    const steering = addRequestToModel(model, "steering");
    model.addPendingRequest(queued, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(steering, ChatRequestQueueKind.Steering, {});
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].request.id, steering.id);
    assert.strictEqual(pending[0].kind, ChatRequestQueueKind.Steering);
    assert.strictEqual(pending[1].request.id, queued.id);
    assert.strictEqual(pending[1].kind, ChatRequestQueueKind.Queued);
  });
  test("addPendingRequest - multiple steering messages maintain order", () => {
    const model = createModel();
    const [steering1, steering2, queued] = ["s1", "s2", "q"].map((t) => addRequestToModel(model, t));
    model.addPendingRequest(queued, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(steering1, ChatRequestQueueKind.Steering, {});
    model.addPendingRequest(steering2, ChatRequestQueueKind.Steering, {});
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 3);
    assert.strictEqual(pending[0].request.id, steering1.id);
    assert.strictEqual(pending[1].request.id, steering2.id);
    assert.strictEqual(pending[2].request.id, queued.id);
  });
  test("addPendingRequest - fires onDidChangePendingRequests event", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    let eventFired = false;
    testDisposables.add(model.onDidChangePendingRequests(() => {
      eventFired = true;
    }));
    model.addPendingRequest(request, ChatRequestQueueKind.Queued, {});
    assert.strictEqual(eventFired, true);
  });
  test("removePendingRequest - removes specified request", () => {
    const model = createModel();
    const [request1, request2] = ["r1", "r2"].map((t) => addRequestToModel(model, t));
    model.addPendingRequest(request1, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(request2, ChatRequestQueueKind.Queued, {});
    model.removePendingRequest(request1.id);
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].request.id, request2.id);
  });
  test("removePendingRequest - no-op for non-existent request", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    model.addPendingRequest(request, ChatRequestQueueKind.Queued, {});
    let eventCount = 0;
    testDisposables.add(model.onDidChangePendingRequests(() => {
      eventCount++;
    }));
    model.removePendingRequest("non-existent-id");
    assert.strictEqual(model.getPendingRequests().length, 1);
    assert.strictEqual(eventCount, 0);
  });
  test("dequeuePendingRequest - returns and removes first request", () => {
    const model = createModel();
    const [request1, request2] = ["r1", "r2"].map((t) => addRequestToModel(model, t));
    model.addPendingRequest(request1, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(request2, ChatRequestQueueKind.Queued, {});
    const dequeued = model.dequeuePendingRequest();
    assert.strictEqual(dequeued?.request.id, request1.id);
    assert.strictEqual(model.getPendingRequests().length, 1);
    assert.strictEqual(model.getPendingRequests()[0].request.id, request2.id);
  });
  test("dequeuePendingRequest - returns undefined when empty", () => {
    const model = createModel();
    assert.strictEqual(model.dequeuePendingRequest(), void 0);
  });
  test("dequeuePendingRequest - fires event when request dequeued", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    model.addPendingRequest(request, ChatRequestQueueKind.Queued, {});
    let eventFired = false;
    testDisposables.add(model.onDidChangePendingRequests(() => {
      eventFired = true;
    }));
    model.dequeuePendingRequest();
    assert.strictEqual(eventFired, true);
  });
  test("clearPendingRequests - removes all pending requests", () => {
    const model = createModel();
    ["r1", "r2", "r3"].forEach((t) => {
      model.addPendingRequest(addRequestToModel(model, t), ChatRequestQueueKind.Queued, {});
    });
    model.clearPendingRequests();
    assert.strictEqual(model.getPendingRequests().length, 0);
  });
  test("clearPendingRequests - no event when already empty", () => {
    const model = createModel();
    let eventFired = false;
    testDisposables.add(model.onDidChangePendingRequests(() => {
      eventFired = true;
    }));
    model.clearPendingRequests();
    assert.strictEqual(eventFired, false);
  });
  test("setPendingRequests - reorders existing pending requests", () => {
    const model = createModel();
    const [r1, r2, r3] = ["r1", "r2", "r3"].map((t) => addRequestToModel(model, t));
    model.addPendingRequest(r1, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(r2, ChatRequestQueueKind.Queued, {});
    model.addPendingRequest(r3, ChatRequestQueueKind.Steering, {});
    model.setPendingRequests([
      { requestId: r2.id, kind: ChatRequestQueueKind.Queued },
      { requestId: r1.id, kind: ChatRequestQueueKind.Steering }
      // Change kind
    ]);
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].request.id, r2.id);
    assert.strictEqual(pending[1].request.id, r1.id);
    assert.strictEqual(pending[1].kind, ChatRequestQueueKind.Steering);
  });
  test("setPendingRequests - ignores non-existent request IDs", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    model.addPendingRequest(request, ChatRequestQueueKind.Queued, {});
    model.setPendingRequests([
      { requestId: "non-existent", kind: ChatRequestQueueKind.Queued },
      { requestId: request.id, kind: ChatRequestQueueKind.Queued }
    ]);
    const pending = model.getPendingRequests();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].request.id, request.id);
  });
  test("pending requests preserve send options", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    const sendOptions = { agentId: "test-agent", attempt: 3 };
    const pending = model.addPendingRequest(request, ChatRequestQueueKind.Queued, sendOptions);
    assert.strictEqual(pending.sendOptions.agentId, "test-agent");
    assert.strictEqual(pending.sendOptions.attempt, 3);
  });
  test("pending requests restore instruction context", () => {
    const model = createModel();
    const request = addRequestToModel(model, "test");
    const enabledTools = { tool1: true };
    const serializedData = JSON.parse(JSON.stringify(model.toJSON()));
    const pendingRequest = { ...serializedData.requests[0], response: void 0, result: void 0 };
    serializedData.requests = [];
    serializedData.pendingRequests = [{
      id: request.id,
      request: pendingRequest,
      kind: ChatRequestQueueKind.Steering,
      sendOptions: serializeSendOptions({
        instructionContext: { modeKind: ChatModeKind.Agent, enabledTools }
      })
    }];
    const restoredModel = testDisposables.add(instantiationService.createInstance(
      ChatModel,
      { value: serializedData, serializer: void 0 },
      { initialLocation: ChatAgentLocation.Chat, canUseTools: true }
    ));
    const restoredOptions = restoredModel.getPendingRequests()[0].sendOptions;
    assert.strictEqual(restoredOptions.instructionContext?.modeKind, ChatModeKind.Agent);
    assert.deepStrictEqual(restoredOptions.instructionContext?.enabledTools, enabledTools);
  });
});
suite("serializeSendOptions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("preserves request-scoped options through persist/restore", () => {
    const serialized = serializeSendOptions({
      userSelectedModelId: "copilot/gpt",
      userSelectedModelConfiguration: { thinkingEffort: "high", contextSize: 2e3 },
      isVoiceModeInput: true
    });
    assert.deepStrictEqual({
      modelConfiguration: serialized.userSelectedModelConfiguration,
      isVoiceModeInput: serialized.isVoiceModeInput
    }, {
      modelConfiguration: { thinkingEffort: "high", contextSize: 2e3 },
      isVoiceModeInput: true
    });
  });
});
suite("ChatResponseResource", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("createUri roundtrips through parseUri without basename", () => {
    const sessionResource = URI.parse("vscode-chat-session://local/session1");
    const uri = ChatResponseResource.createUri(sessionResource, "call-123", 2);
    const parsed = ChatResponseResource.parseUri(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.sessionResource.toString(), sessionResource.toString());
    assert.strictEqual(parsed.toolCallId, "call-123");
    assert.strictEqual(parsed.index, 2);
  });
  test("createUri roundtrips through parseUri with basename", () => {
    const sessionResource = URI.parse("vscode-chat-session://local/session1");
    const uri = ChatResponseResource.createUri(sessionResource, "call-456", 0, "file.txt");
    const parsed = ChatResponseResource.parseUri(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.sessionResource.toString(), sessionResource.toString());
    assert.strictEqual(parsed.toolCallId, "call-456");
    assert.strictEqual(parsed.index, 0);
  });
  test("parseUri rejects paths with fewer than 4 segments", () => {
    const base = URI.from({ scheme: ChatResponseResource.scheme, authority: "abc", path: "/tool/callId" });
    assert.strictEqual(ChatResponseResource.parseUri(base), void 0);
    const tooShort = URI.from({ scheme: ChatResponseResource.scheme, authority: "abc", path: "/tool" });
    assert.strictEqual(ChatResponseResource.parseUri(tooShort), void 0);
    const empty = URI.from({ scheme: ChatResponseResource.scheme, authority: "abc", path: "/" });
    assert.strictEqual(ChatResponseResource.parseUri(empty), void 0);
  });
  test("parseUri rejects wrong scheme", () => {
    const uri = URI.from({ scheme: "file", path: "/tool/callId/0" });
    assert.strictEqual(ChatResponseResource.parseUri(uri), void 0);
  });
  test("parseUri rejects wrong kind", () => {
    const uri = URI.from({ scheme: ChatResponseResource.scheme, authority: "abc", path: "/notTool/callId/0" });
    assert.strictEqual(ChatResponseResource.parseUri(uri), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGNoYXRNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgU3ltYm9sS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0RXh0ZW5zaW9uU2VydmljZSwgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENlbGxVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5LCBJQ2hhdFJlcXVlc3RTdHJpbmdWYXJpYWJsZUVudHJ5LCBJQ2hhdFJlcXVlc3RGaWxlRW50cnksIFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRTZXJ2aWNlLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwsIENoYXRSZXF1ZXN0TW9kZWwsIENoYXRSZXNwb25zZVJlc291cmNlLCBleHRyYWN0RXhwb3J0YWJsZVNlc3Npb25EYXRhLCBJQ2hhdFJlcXVlc3RNb2RlSW5mbywgSUV4cG9ydGFibGVDaGF0RGF0YSwgSVNlcmlhbGl6YWJsZUNoYXREYXRhMSwgSVNlcmlhbGl6YWJsZUNoYXREYXRhMiwgSVNlcmlhbGl6YWJsZUNoYXREYXRhMywgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUsIGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhLCBpc1NlcmlhbGl6YWJsZVNlc3Npb25EYXRhLCBub3JtYWxpemVTZXJpYWxpemFibGVDaGF0RGF0YSwgUmVzcG9uc2UsIHNlcmlhbGl6ZVNlbmRPcHRpb25zLCB0b0NoYXRIaXN0b3J5Q29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFRleHRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UXVldWVLaW5kLCBJQ2hhdFNlcnZpY2UsIElDaGF0VGFzaywgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRUb29sSW52b2NhdGlvbiwgUmVzcG9uc2VNb2RlbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uL2NoYXRTZXJ2aWNlL21vY2tDaGF0U2VydmljZS5qcyc7XG5cbnN1aXRlKCdDaGF0TW9kZWwnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IE1vY2tDaGF0U2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6YXRpb24gd2l0aCBleHBvcnRlZCBkYXRhIG9ubHkgKGltcG9ydGVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBvcnRlZERhdGE6IElFeHBvcnRhYmxlQ2hhdERhdGEgPSB7XG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IGV4cG9ydGVkRGF0YSwgc2VyaWFsaXplcjogdW5kZWZpbmVkISB9LFxuXHRcdFx0eyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH1cblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pc0ltcG9ydGVkLCB0cnVlKTtcblx0XHRhc3NlcnQub2sobW9kZWwuc2Vzc2lvbklkKTsgLy8gU2hvdWxkIGhhdmUgZ2VuZXJhdGVkIElEXG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLnRpbWVzdGFtcCA+IDApOyAvLyBTaG91bGQgaGF2ZSBnZW5lcmF0ZWQgdGltZXN0YW1wXG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemF0aW9uIHdpdGggZnVsbCBzZXJpYWxpemFibGUgZGF0YSAobm90IGltcG9ydGVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAnZXhpc3Rpbmctc2Vzc2lvbicsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IG5vdyAtIDEwMDAsXG5cdFx0XHRjdXN0b21UaXRsZTogJ015IENoYXQnLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TW9kZWwsXG5cdFx0XHR7IHZhbHVlOiBzZXJpYWxpemFibGVEYXRhLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmlzSW1wb3J0ZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuc2Vzc2lvbklkLCAnZXhpc3Rpbmctc2Vzc2lvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC50aW1lc3RhbXAsIG5vdyAtIDEwMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXN0b21UaXRsZSwgJ015IENoYXQnKTtcblx0fSk7XG5cblx0dGVzdCgnbGVnYWN5IHJlcXVlc3RzIHdpdGhvdXQgdGltZXN0YW1wcyBrZWVwIGRpc3BsYXkgdGltZSB1bmtub3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0aW9uRGF0ZSA9IDFfNzUyXzAxMl8zMjFfMDAwO1xuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAnbGVnYWN5LXNlc3Npb24nLFxuXHRcdFx0Y3JlYXRpb25EYXRlLFxuXHRcdFx0Y3VzdG9tVGl0bGU6IHVuZGVmaW5lZCxcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbe1xuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBwYXJ0czogW10gfSxcblx0XHRcdFx0dmFyaWFibGVEYXRhOiB7IHZhcmlhYmxlczogW10gfSxcblx0XHRcdFx0cmVzcG9uc2U6IHVuZGVmaW5lZCxcblx0XHRcdH1dLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdE1vZGVsLFxuXHRcdFx0eyB2YWx1ZTogc2VyaWFsaXphYmxlRGF0YSwgc2VyaWFsaXplcjogdW5kZWZpbmVkISB9LFxuXHRcdFx0eyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH1cblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVjZW5jeVRpbWVzdGFtcDogbW9kZWwuZ2V0UmVxdWVzdHMoKVswXS50aW1lc3RhbXAsXG5cdFx0XHRyZXF1ZXN0VGltZXN0YW1wOiBtb2RlbC5nZXRSZXF1ZXN0cygpWzBdLnJlcXVlc3RUaW1lc3RhbXAsXG5cdFx0XHRzZXJpYWxpemVkVGltZXN0YW1wOiBtb2RlbC50b0pTT04oKS5yZXF1ZXN0c1swXS50aW1lc3RhbXAsXG5cdFx0fSwge1xuXHRcdFx0cmVjZW5jeVRpbWVzdGFtcDogY3JlYXRpb25EYXRlLFxuXHRcdFx0cmVxdWVzdFRpbWVzdGFtcDogdW5kZWZpbmVkLFxuXHRcdFx0c2VyaWFsaXplZFRpbWVzdGFtcDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXphdGlvbiB3aXRoIGludmFsaWQgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdC8vIE1pc3NpbmcgcmVxdWlyZWQgZmllbGRzXG5cdFx0XHRyZXF1ZXN0czogJ25vdC1hbi1hcnJheSdcblx0XHR9IGFzIHVua25vd24gYXMgSUV4cG9ydGFibGVDaGF0RGF0YTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IGludmFsaWREYXRhLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXG5cdFx0Ly8gU2hvdWxkIGhhbmRsZSBncmFjZWZ1bGx5IHdpdGggZW1wdHkgc3RhdGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayhtb2RlbC5zZXNzaW9uSWQpOyAvLyBTaG91bGQgaGF2ZSBnZW5lcmF0ZWQgSURcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6YXRpb24gd2l0aG91dCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXNJbXBvcnRlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLnRpbWVzdGFtcCA+IDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVSZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdG1vZGVsLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdHMubGVuZ3RoLCAxKTtcblxuXHRcdG1vZGVsLnJlbW92ZVJlcXVlc3QocmVxdWVzdHNbMF0uaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fkb3B0UmVxdWVzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDEgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3QgbW9kZWwyID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QxID0gbW9kZWwxLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMS5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMi5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3QxLnNlc3Npb24gPT09IG1vZGVsMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3QxLnJlc3BvbnNlPy5zZXNzaW9uID09PSBtb2RlbDEpO1xuXG5cdFx0bW9kZWwyLmFkb3B0UmVxdWVzdChyZXF1ZXN0MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwxLmdldFJlcXVlc3RzKCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwyLmdldFJlcXVlc3RzKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2socmVxdWVzdDEuc2Vzc2lvbiA9PT0gbW9kZWwyKTtcblx0XHRhc3NlcnQub2socmVxdWVzdDEucmVzcG9uc2U/LnNlc3Npb24gPT09IG1vZGVsMik7XG5cblx0XHRtb2RlbDIuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0MSwgeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0hlbGxvJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3QxLnJlc3BvbnNlLnJlc3BvbnNlLnRvU3RyaW5nKCksICdIZWxsbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRSZXNwb25zZVByb2dyZXNzIGFwcGxpZXMgdXNhZ2UgdG8gcmVzcG9uc2UgbWV0YWRhdGEnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblxuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDEwLCBjb21wbGV0aW9uVG9rZW5zOiAyIH0pO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDEwLCBjb21wbGV0aW9uVG9rZW5zOiAyIH0pO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDEwLCBjb21wbGV0aW9uVG9rZW5zOiAzIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1c2FnZTogcmVxdWVzdC5yZXNwb25zZT8udXNhZ2UsXG5cdFx0XHRjb21wbGV0aW9uVG9rZW5Db3VudDogcmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGlvblRva2VuQ291bnQsXG5cdFx0XHRyZXNwb25zZUNvbnRlbnQ6IHJlcXVlc3QucmVzcG9uc2U/LnJlc3BvbnNlLnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0dXNhZ2U6IHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAxMCwgY29tcGxldGlvblRva2VuczogMyB9LFxuXHRcdFx0Y29tcGxldGlvblRva2VuQ291bnQ6IDUsXG5cdFx0XHRyZXNwb25zZUNvbnRlbnQ6ICcnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2b2ljZSBwcm9ncmVzcyBpcyBsaXZlLW9ubHkgcmVzcG9uc2UgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblxuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdCZWZvcmUgJykgfSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICdpbnZlc3RpZ2F0aW5nJywgdmFsdWU6ICdJbnZlc3RpZ2F0aW5nIHRoZSByZWxldmFudCBjb2RlLicgfSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ2FmdGVyJykgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2UhLnJlc3BvbnNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzcG9uc2VLaW5kczogcmVzcG9uc2UudmFsdWUubWFwKHBhcnQgPT4gcGFydC5raW5kKSxcblx0XHRcdGhpc3RvcnlLaW5kczogdG9DaGF0SGlzdG9yeUNvbnRlbnQocmVzcG9uc2UudmFsdWUpLm1hcChwYXJ0ID0+IHBhcnQua2luZCksXG5cdFx0XHRtYXJrZG93bjogcmVzcG9uc2UuZ2V0TWFya2Rvd24oKSxcblx0XHRcdGNvcHlUZXh0OiByZXNwb25zZS50b1N0cmluZygpLFxuXHRcdFx0cGVyc2lzdGVkS2luZHM6IG1vZGVsLnRvRXhwb3J0KCkucmVxdWVzdHNbMF0ucmVzcG9uc2U/Lm1hcChwYXJ0ID0+IGhhc0tleShwYXJ0LCB7IGtpbmQ6IHRydWUgfSkgPyBwYXJ0LmtpbmQgOiAnbWFya2Rvd24nKSxcblx0XHR9LCB7XG5cdFx0XHRyZXNwb25zZUtpbmRzOiBbJ21hcmtkb3duQ29udGVudCcsICd2b2ljZVByb2dyZXNzJywgJ21hcmtkb3duQ29udGVudCddLFxuXHRcdFx0aGlzdG9yeUtpbmRzOiBbJ21hcmtkb3duQ29udGVudCcsICdtYXJrZG93bkNvbnRlbnQnXSxcblx0XHRcdG1hcmtkb3duOiAnQmVmb3JlIGFmdGVyJyxcblx0XHRcdGNvcHlUZXh0OiAnQmVmb3JlIGFmdGVyJyxcblx0XHRcdHBlcnNpc3RlZEtpbmRzOiBbJ21hcmtkb3duJywgJ21hcmtkb3duJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgcmVmaW5lbWVudCBvZiB0aGUgc2FtZSBtb2RlbCBjYWxsIHVwZGF0ZXMgdXNhZ2Ugd2l0aG91dCByZWNvdW50aW5nIGl0cyB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblxuXHRcdC8vIFRoZSBhZ2VudCBob3N0IHJlcG9ydHMgb25lIG1vZGVsIGNhbGwgc2V2ZXJhbCB0aW1lcyBhcyBpdHMgY29udGV4dCBhdHRyaWJ1dGlvblxuXHRcdC8vIGFuZCBzZXNzaW9uIGNvc3QgcmVzb2x2ZSBhc3luY2hyb25vdXNseS4gVGhvc2UgcmVmaW5lbWVudHMgbXVzdCB1cGRhdGUgdGhlXG5cdFx0Ly8gc3RvcmVkIHVzYWdlIHdpdGhvdXQgYWRkaW5nIHRoZSBjYWxsJ3MgY29tcGxldGlvbiB0b2tlbnMgYWdhaW4uXG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAxLCBzZXNzaW9uQ29waWxvdENyZWRpdHM6IDEgfSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAxLCBzZXNzaW9uQ29waWxvdENyZWRpdHM6IDUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25Db3BpbG90Q3JlZGl0czogcmVxdWVzdC5yZXNwb25zZT8udXNhZ2U/LnNlc3Npb25Db3BpbG90Q3JlZGl0cyxcblx0XHRcdGNvbXBsZXRpb25Ub2tlbkNvdW50OiByZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0aW9uVG9rZW5Db3VudCxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uQ29waWxvdENyZWRpdHM6IDUsXG5cdFx0XHRjb21wbGV0aW9uVG9rZW5Db3VudDogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3ViYWdlbnQgY3JlZGl0cyBhcmUgZm9sZGVkIGludG8gcGFyZW50IHJlc3BvbnNlIHVzYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCB0ZXh0ID0gJ2hlbGxvJztcblx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWwuYWRkUmVxdWVzdCh7IHRleHQsIHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIHRleHQubGVuZ3RoLCAxLCB0ZXh0Lmxlbmd0aCksIHRleHQpXSB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5zZXRTdWJhZ2VudENvcGlsb3RDcmVkaXRzKCdzdWJhZ2VudC0xJywgNSk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAyIH0pO1xuXHRcdHJlcXVlc3QucmVzcG9uc2U/LnNldFN1YmFnZW50Q29waWxvdENyZWRpdHMoJ3N1YmFnZW50LTEnLCA2KTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5zZXRTdWJhZ2VudENvcGlsb3RDcmVkaXRzKCdzdWJhZ2VudC0xJywgNCk7XG5cdFx0cmVxdWVzdC5yZXNwb25zZT8uc2V0U3ViYWdlbnRDb3BpbG90Q3JlZGl0cygnc3ViYWdlbnQtMicsIDMpO1xuXHRcdHJlcXVlc3QucmVzcG9uc2U/LnNldFN1YmFnZW50Q29waWxvdENyZWRpdHMoJ2ludmFsaWQnLCBOdW1iZXIuTmFOKTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5zZXRTdWJhZ2VudENvcGlsb3RDcmVkaXRzKCdpbnZhbGlkJywgLTEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHVzYWdlOiByZXF1ZXN0LnJlc3BvbnNlPy51c2FnZSwgY29tcGxldGlvblRva2VuQ291bnQ6IHJlcXVlc3QucmVzcG9uc2U/LmNvbXBsZXRpb25Ub2tlbkNvdW50LCBzZXNzaW9uQ29zdDogbW9kZWwuc2Vzc2lvbkNvc3QgfSwge1xuXHRcdFx0dXNhZ2U6IHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAxMCwgY29tcGxldGlvblRva2VuczogMiwgY29waWxvdENyZWRpdHM6IDExIH0sXG5cdFx0XHRjb21wbGV0aW9uVG9rZW5Db3VudDogMixcblx0XHRcdHNlc3Npb25Db3N0OiAxMSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN0b3JlZFNlcGFyYXRlQ29zdHMgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdE1vZGVsLFxuXHRcdFx0eyB2YWx1ZTogSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShtb2RlbC50b0pTT04oKSkpIGFzIElTZXJpYWxpemFibGVDaGF0RGF0YTMsIHNlcmlhbGl6ZXI6IHVuZGVmaW5lZCEgfSxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkU2VwYXJhdGVDb3N0cy5zZXNzaW9uQ29zdCwgMTEpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgc2Vzc2lvbiB0b3RhbCBhbmQgdGhlIHN1bW1lZCB0dXJucyBlYWNoIHByb3ZpZGUgYSBmbG9vciBmb3Igc2Vzc2lvbiBjb3N0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCBhZGRSZXF1ZXN0ID0gKHRleHQ6IHN0cmluZykgPT4gbW9kZWwuYWRkUmVxdWVzdCh7IHRleHQsIHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIHRleHQubGVuZ3RoLCAxLCB0ZXh0Lmxlbmd0aCksIHRleHQpXSB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cblx0XHQvLyBBIHR1cm4gZnJvbSBhIGJhY2tlbmQgdGhhdCByZXBvcnRzIG5vIHNlc3Npb24gdG90YWwgKGUuZy4gQ2xhdWRlKSBzdGlsbCBjb3VudHMuXG5cdFx0Y29uc3QgZmlyc3QgPSBhZGRSZXF1ZXN0KCdvbmUnKTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKGZpcnN0LCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAyIH0pO1xuXHRcdC8vIFRoZSByZXBvcnRlZCBzZXNzaW9uIHRvdGFsIGV4Y2VlZHMgdGhlIHN1bW1lZCB0dXJucyBiZWNhdXNlIGl0IGFsc28gY292ZXJzIHdvcmtcblx0XHQvLyBiaWxsZWQgb3V0c2lkZSBhbnkgdHVybiwgc3VjaCBhcyBhIGNvbXBhY3Rpb24gdGhhdCByYW4gYmV0d2VlbiB0aGVtLlxuXHRcdGNvbnN0IHNlY29uZCA9IGFkZFJlcXVlc3QoJ3R3bycpO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3Moc2Vjb25kLCB7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAsIGNvbXBsZXRpb25Ub2tlbnM6IDIsIGNvcGlsb3RDcmVkaXRzOiAzLCBzZXNzaW9uQ29waWxvdENyZWRpdHM6IDkgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuc2Vzc2lvbkNvc3QsIDkpO1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkobW9kZWwudG9KU09OKCkpKSBhcyBJU2VyaWFsaXphYmxlQ2hhdERhdGEzLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0b3JlZC5zZXNzaW9uQ29zdCwgOSk7XG5cblx0XHQvLyBBIGxhdGVyIHR1cm4gd2hvc2UgY29zdCBoYXMgbm90IHlldCByZWFjaGVkIHRoZSByZXBvcnRlZCB0b3RhbCBtdXN0IG5vdCBzaHJpbmtcblx0XHQvLyB0aGUgc2Vzc2lvbiBjb3N0LCBhbmQgdGhlIHN1bW1lZCB0dXJucyB0YWtlIG92ZXIgb25jZSB0aGV5IGV4Y2VlZCBpdC5cblx0XHRjb25zdCB0aGlyZCA9IGFkZFJlcXVlc3QoJ3RocmVlJyk7XG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyh0aGlyZCwgeyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDEwLCBjb21wbGV0aW9uVG9rZW5zOiAyLCBjb3BpbG90Q3JlZGl0czogNiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuc2Vzc2lvbkNvc3QsIDExKTtcblx0fSk7XG5cblx0dGVzdCgncmVzcG9uc2UgZGV0YWlscywgZWxhcHNlZCB0aW1lLCBhbmQgdG9rZW5zIHJvdW5kdHJpcCB0aHJvdWdoIHNlcmlhbGl6YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tcGxldGVkQXQgPSAxXzc1Ml8wMTJfNDA1XzAwMDtcblx0XHRjb25zdCBzZXJpYWxpemFibGVEYXRhOiBJU2VyaWFsaXphYmxlQ2hhdERhdGEzID0ge1xuXHRcdFx0dmVyc2lvbjogMyxcblx0XHRcdHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbicsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IERhdGUubm93KCksXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFt7XG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIHBhcnRzOiBbXSB9LFxuXHRcdFx0XHR2YXJpYWJsZURhdGE6IHsgdmFyaWFibGVzOiBbXSB9LFxuXHRcdFx0XHR0aW1lc3RhbXA6IDFfNzUyXzAxMl8zMjFfMDAwLFxuXHRcdFx0XHRyZXNwb25zZTogW3sgdmFsdWU6ICdyZXNwb25zZScsIGlzVHJ1c3RlZDogZmFsc2UgfV0sXG5cdFx0XHRcdHJlc3VsdDogeyBkZXRhaWxzOiAnR1BULTUuNiBTb2wnIH0sXG5cdFx0XHRcdG1vZGVsU3RhdGU6IHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSwgY29tcGxldGVkQXQgfSxcblx0XHRcdFx0cmVzcG9uc2VUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjJfMDAwLFxuXHRcdFx0XHRlbGFwc2VkTXM6IDgzXzAwMCxcblx0XHRcdFx0Y29tcGxldGlvblRva2VuczogMV8yMzQsXG5cdFx0XHR9XSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYm90Jyxcblx0XHR9O1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IHNlcmlhbGl6YWJsZURhdGEsIHNlcmlhbGl6ZXI6IHVuZGVmaW5lZCEgfSxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IG1vZGVsLmdldFJlcXVlc3RzKClbMF0ucmVzcG9uc2U7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZFJlc3BvbnNlID0gbW9kZWwudG9KU09OKCkucmVxdWVzdHNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZXRhaWxzOiByZXNwb25zZT8ucmVzdWx0Py5kZXRhaWxzLFxuXHRcdFx0cmVxdWVzdFRpbWVzdGFtcDogbW9kZWwuZ2V0UmVxdWVzdHMoKVswXS50aW1lc3RhbXAsXG5cdFx0XHR2aXNpYmxlUmVxdWVzdFRpbWVzdGFtcDogbW9kZWwuZ2V0UmVxdWVzdHMoKVswXS5yZXF1ZXN0VGltZXN0YW1wLFxuXHRcdFx0cmVzcG9uc2VUaW1lc3RhbXA6IHJlc3BvbnNlPy50aW1lc3RhbXAsXG5cdFx0XHRjb21wbGV0aW9uVGltZXN0YW1wOiByZXNwb25zZT8uY29tcGxldGlvblRpbWVzdGFtcCxcblx0XHRcdGVsYXBzZWRNczogcmVzcG9uc2U/LmVsYXBzZWRNcyxcblx0XHRcdGNvbXBsZXRpb25Ub2tlbnM6IHJlc3BvbnNlPy5jb21wbGV0aW9uVG9rZW5Db3VudCxcblx0XHRcdHNlcmlhbGl6ZWREZXRhaWxzOiBzZXJpYWxpemVkUmVzcG9uc2UucmVzdWx0Py5kZXRhaWxzLFxuXHRcdFx0c2VyaWFsaXplZFJlcXVlc3RUaW1lc3RhbXA6IHNlcmlhbGl6ZWRSZXNwb25zZS50aW1lc3RhbXAsXG5cdFx0XHRzZXJpYWxpemVkUmVzcG9uc2VUaW1lc3RhbXA6IHNlcmlhbGl6ZWRSZXNwb25zZS5yZXNwb25zZVRpbWVzdGFtcCxcblx0XHRcdHNlcmlhbGl6ZWRFbGFwc2VkTXM6IHNlcmlhbGl6ZWRSZXNwb25zZS5lbGFwc2VkTXMsXG5cdFx0XHRzZXJpYWxpemVkQ29tcGxldGlvblRva2Vuczogc2VyaWFsaXplZFJlc3BvbnNlLmNvbXBsZXRpb25Ub2tlbnMsXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsczogJ0dQVC01LjYgU29sJyxcblx0XHRcdHJlcXVlc3RUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjFfMDAwLFxuXHRcdFx0dmlzaWJsZVJlcXVlc3RUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjFfMDAwLFxuXHRcdFx0cmVzcG9uc2VUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjJfMDAwLFxuXHRcdFx0Y29tcGxldGlvblRpbWVzdGFtcDogY29tcGxldGVkQXQsXG5cdFx0XHRlbGFwc2VkTXM6IDgzXzAwMCxcblx0XHRcdGNvbXBsZXRpb25Ub2tlbnM6IDFfMjM0LFxuXHRcdFx0c2VyaWFsaXplZERldGFpbHM6ICdHUFQtNS42IFNvbCcsXG5cdFx0XHRzZXJpYWxpemVkUmVxdWVzdFRpbWVzdGFtcDogMV83NTJfMDEyXzMyMV8wMDAsXG5cdFx0XHRzZXJpYWxpemVkUmVzcG9uc2VUaW1lc3RhbXA6IDFfNzUyXzAxMl8zMjJfMDAwLFxuXHRcdFx0c2VyaWFsaXplZEVsYXBzZWRNczogODNfMDAwLFxuXHRcdFx0c2VyaWFsaXplZENvbXBsZXRpb25Ub2tlbnM6IDFfMjM0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyByZWFzb25pbmcgZHVyYXRpb24gd2hlbiByZXNwb25zZSBwcm9ncmVzcyBtb3ZlcyBvbicsICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoeyBub3c6IDEwMDAgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZTogWydGaXJzdCcsICcgdGhvdWdodCddIH0pO1xuXHRcdFx0Y2xvY2sudGljaygxNTAwKTtcblx0XHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdEb25lJykgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzcG9uc2UudmFsdWUubWFwKHBhcnQgPT4gcGFydC5raW5kID09PSAndGhpbmtpbmcnID8ge1xuXHRcdFx0XHRraW5kOiBwYXJ0LmtpbmQsXG5cdFx0XHRcdHZhbHVlOiBwYXJ0LnZhbHVlLFxuXHRcdFx0XHRyZWFzb25pbmdEdXJhdGlvbk1zOiBwYXJ0LnJlYXNvbmluZ0R1cmF0aW9uTXMsXG5cdFx0XHR9IDogeyBraW5kOiBwYXJ0LmtpbmQgfSksIFtcblx0XHRcdFx0eyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZTogWydGaXJzdCcsICcgdGhvdWdodCddLCByZWFzb25pbmdEdXJhdGlvbk1zOiAxNTAwIH0sXG5cdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcgfSxcblx0XHRcdF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyByZWFzb25pbmcgZHVyYXRpb24gd2hlbiByZXNwb25zZSBjb21wbGV0ZXMgd2l0aG91dCBhIHJlbmRlcmVkIHJvdycsICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoeyBub3c6IDEwMDAgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd0aGlua2luZycsIHZhbHVlOiAnU3RpbGwgcmVhc29uaW5nJyB9KTtcblx0XHRcdGNsb2NrLnRpY2soMjMwMCk7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0ZSgpO1xuXG5cdFx0XHRjb25zdCB0aGlua2luZ1BhcnQgPSByZXF1ZXN0LnJlc3BvbnNlPy5lbnRpcmVSZXNwb25zZS52YWx1ZS5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSAndGhpbmtpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlua2luZ1BhcnQ/LmtpbmQgPT09ICd0aGlua2luZycgPyB0aGlua2luZ1BhcnQucmVhc29uaW5nRHVyYXRpb25NcyA6IHVuZGVmaW5lZCwgMjMwMCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsb2NrLnJlc3RvcmUoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZENvbXBsZXRlUmVxdWVzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtb2RlbDEgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgdGV4dCA9ICdoZWxsbyc7XG5cdFx0Y29uc3QgcmVxdWVzdDEgPSBtb2RlbDEuYWRkUmVxdWVzdCh7IHRleHQsIHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIHRleHQubGVuZ3RoLCAxLCB0ZXh0Lmxlbmd0aCksIHRleHQpXSB9LCB7IHZhcmlhYmxlczogW10gfSwgMCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdDEuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3QxLnJlc3BvbnNlIS5pc0NvbXBsZXRlQWRkZWRSZXF1ZXN0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdDEuc2hvdWxkQmVSZW1vdmVkT25TZW5kLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0MS5yZXNwb25zZSEuc2hvdWxkQmVSZW1vdmVkT25TZW5kLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXNlcmlhbGl6YXRpb24gbWFya3MgdW51c2VkIHF1ZXN0aW9uIGNhcm91c2VscyBhcyB1c2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAndGVzdC1zZXNzaW9uJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogW3tcblx0XHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgcGFydHM6IFtdIH0sXG5cdFx0XHRcdHZhcmlhYmxlRGF0YTogeyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdHJlc3BvbnNlOiBbXG5cdFx0XHRcdFx0eyB2YWx1ZTogJ3NvbWUgdGV4dCcsIGlzVHJ1c3RlZDogZmFsc2UgfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcgYXMgY29uc3QsXG5cdFx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7IGlkOiAncTEnLCB0aXRsZTogJ1F1ZXN0aW9uIDEnLCB0eXBlOiAndGV4dCcgYXMgY29uc3QgfV0sXG5cdFx0XHRcdFx0XHRhbGxvd1NraXA6IHRydWUsXG5cdFx0XHRcdFx0XHRyZXNvbHZlSWQ6ICdyZXNvbHZlMScsXG5cdFx0XHRcdFx0XHRpc1VzZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG1vZGVsU3RhdGU6IHsgdmFsdWU6IDIgLyogUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZCAqLywgY29tcGxldGVkQXQ6IERhdGUubm93KCkgfSxcblx0XHRcdH1dLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TW9kZWwsXG5cdFx0XHR7IHZhbHVlOiBzZXJpYWxpemFibGVEYXRhLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBtb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdHNbMF0ucmVzcG9uc2UhO1xuXG5cdFx0Ly8gVGhlIHF1ZXN0aW9uIGNhcm91c2VsIHNob3VsZCBiZSBtYXJrZWQgYXMgdXNlZCBhZnRlciBkZXNlcmlhbGl6YXRpb25cblx0XHRjb25zdCBjYXJvdXNlbFBhcnQgPSByZXNwb25zZS5yZXNwb25zZS52YWx1ZS5maW5kKHAgPT4gcC5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcpO1xuXHRcdGFzc2VydC5vayhjYXJvdXNlbFBhcnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXJvdXNlbFBhcnQuaXNVc2VkLCB0cnVlKTtcblxuXHRcdC8vIFRoZSByZXNwb25zZSBzaG91bGQgYmUgY29tcGxldGUgKG5vdCBzdHVjayBpbiBOZWVkc0lucHV0KVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5pc0NvbXBsZXRlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5wdXRNb2RlbC50b0pTT04gZmlsdGVycyBleHRlbnNpb24tY29udHJpYnV0ZWQgY29udGV4dHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgZmlsZUF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdEZpbGVFbnRyeSA9IHtcblx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdHZhbHVlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50cycpLFxuXHRcdFx0aWQ6ICdmaWxlLWlkJyxcblx0XHRcdG5hbWU6ICd0ZXN0LnRzJyxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RyaW5nQ29udGV4dFZhbHVlOiBTdHJpbmdDaGF0Q29udGV4dFZhbHVlID0ge1xuXHRcdFx0dmFsdWU6ICdwci1jb250ZW50Jyxcblx0XHRcdG5hbWU6ICdQUiAjMTIzJyxcblx0XHRcdGljb25QYXRoOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0LFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ3ByOi8vMTIzJyksXG5cdFx0XHRoYW5kbGU6IDFcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RyaW5nQXR0YWNobWVudDogSUNoYXRSZXF1ZXN0U3RyaW5nVmFyaWFibGVFbnRyeSA9IHtcblx0XHRcdGtpbmQ6ICdzdHJpbmcnLFxuXHRcdFx0dmFsdWU6ICdwci1jb250ZW50Jyxcblx0XHRcdGlkOiAnc3RyaW5nLWlkJyxcblx0XHRcdG5hbWU6ICdQUiAjMTIzJyxcblx0XHRcdGljb25QYXRoOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0LFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ3ByOi8vMTIzJyksXG5cdFx0XHRoYW5kbGU6IDFcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW1wbGljaXRXaXRoU3RyaW5nQ29udGV4dDogSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0a2luZDogJ2ltcGxpY2l0Jyxcblx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdHZhbHVlOiBzdHJpbmdDb250ZXh0VmFsdWUsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgncHI6Ly8xMjMnKSxcblx0XHRcdGlzU2VsZWN0aW9uOiBmYWxzZSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogJ2ltcGxpY2l0LXN0cmluZy1pZCcsXG5cdFx0XHRuYW1lOiAnUFIgQ29udGV4dCcsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGltcGxpY2l0V2l0aFVyaTogSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0a2luZDogJ2ltcGxpY2l0Jyxcblx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdHZhbHVlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3VycmVudC50cycpLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3VycmVudC50cycpLFxuXHRcdFx0aXNTZWxlY3Rpb246IGZhbHNlLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAnaW1wbGljaXQtdXJpLWlkJyxcblx0XHRcdG5hbWU6ICdjdXJyZW50LnRzJyxcblx0XHR9O1xuXG5cdFx0bW9kZWwuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7XG5cdFx0XHRhdHRhY2htZW50czogW2ZpbGVBdHRhY2htZW50LCBzdHJpbmdBdHRhY2htZW50LCBpbXBsaWNpdFdpdGhTdHJpbmdDb250ZXh0LCBpbXBsaWNpdFdpdGhVcmldLFxuXHRcdFx0aW5wdXRUZXh0OiAndGVzdCdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBtb2RlbC5pbnB1dE1vZGVsLnRvSlNPTigpO1xuXHRcdGFzc2VydC5vayhzZXJpYWxpemVkKTtcblxuXHRcdC8vIFNob3VsZCBmaWx0ZXIgb3V0IHN0cmluZyBhdHRhY2htZW50cyBhbmQgaW1wbGljaXQgYXR0YWNobWVudHMgd2l0aCBTdHJpbmdDaGF0Q29udGV4dFZhbHVlXG5cdFx0Ly8gU2hvdWxkIGtlZXAgZmlsZSBhdHRhY2htZW50cyBhbmQgaW1wbGljaXQgYXR0YWNobWVudHMgd2l0aCBVUkkgdmFsdWVzXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJpYWxpemVkLmF0dGFjaG1lbnRzLCBbZmlsZUF0dGFjaG1lbnQsIGltcGxpY2l0V2l0aFVyaV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlSW5mbyByb3VuZHRyaXBzIHRocm91Z2ggc2VyaWFsaXphdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlSW5mbzogSUNoYXRSZXF1ZXN0TW9kZUluZm8gPSB7XG5cdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRpc0J1aWx0aW46IGZhbHNlLFxuXHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnY3VzdG9tJyxcblx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0bmFtZTogJ3BsYW4nLFxuXHRcdFx0XHRjb250ZW50OiAnWW91IGFyZSBhIHBsYW5uaW5nIGFnZW50Jyxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0fSxcblx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAndGVzdC1tb2RlaW5mby1zZXNzaW9uJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0XHRyZXF1ZXN0czogW3tcblx0XHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3BsYW4gc29tZXRoaW5nJywgcGFydHM6IFtdIH0sXG5cdFx0XHRcdHZhcmlhYmxlRGF0YTogeyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdHJlc3BvbnNlOiBbeyB2YWx1ZTogJ0hlcmUgaXMgbXkgcGxhbicsIGlzVHJ1c3RlZDogZmFsc2UgfV0sXG5cdFx0XHRcdG1vZGVsU3RhdGU6IHsgdmFsdWU6IDEgLyogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlICovLCBjb21wbGV0ZWRBdDogRGF0ZS5ub3coKSB9LFxuXHRcdFx0XHRtb2RlSW5mbyxcblx0XHRcdH1dLFxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TW9kZWwsXG5cdFx0XHR7IHZhbHVlOiBzZXJpYWxpemFibGVEYXRhLCBzZXJpYWxpemVyOiB1bmRlZmluZWQhIH0sXG5cdFx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBtb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdHNbMF0ubW9kZUluZm8sIG1vZGVJbmZvKTtcblxuXHRcdC8vIFZlcmlmeSByb3VuZHRyaXAgdGhyb3VnaCB0b0V4cG9ydFxuXHRcdGNvbnN0IGV4cG9ydGVkID0gbW9kZWwudG9FeHBvcnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwb3J0ZWQucmVxdWVzdHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4cG9ydGVkLnJlcXVlc3RzWzBdLm1vZGVJbmZvLCBtb2RlSW5mbyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGxlZ2FjeSB0b3AtbGV2ZWwgbW9kZWxDb25maWd1cmF0aW9uIGludG8gc2VsZWN0ZWRNb2RlbCAoYmFja3dhcmRzIGNvbXBhdCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGVnYWN5Q29uZmlnID0geyB0aGlua2luZ0VmZm9ydDogJ2hpZ2gnLCBjb250ZXh0U2l6ZTogMjAwMCB9O1xuXG5cdFx0Ly8gT2xkIGZvcm1hdDogbW9kZWxDb25maWd1cmF0aW9uIHdhcyBwZXJzaXN0ZWQgYXMgYSBzaWJsaW5nIG9mIHNlbGVjdGVkTW9kZWxcblx0XHQvLyByYXRoZXIgdGhhbiBuZXN0ZWQgaW5zaWRlIGl0LlxuXHRcdGNvbnN0IGxlZ2FjeUlucHV0U3RhdGUgPSB7XG5cdFx0XHRhdHRhY2htZW50czogW10sXG5cdFx0XHRjb250cmliOiB7fSxcblx0XHRcdGlucHV0VGV4dDogJ2RyYWZ0Jyxcblx0XHRcdHNlbGVjdGlvbnM6IFtdLFxuXHRcdFx0bW9kZTogeyBpZDogQ2hhdE1vZGVLaW5kLkFnZW50LCBraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQgfSxcblx0XHRcdHNlbGVjdGVkTW9kZWw6IHsgaWRlbnRpZmllcjogJ2NvcGlsb3QvZ3B0JywgbWV0YWRhdGE6IHsgbmFtZTogJ0dQVCcgfSB9LFxuXHRcdFx0bW9kZWxDb25maWd1cmF0aW9uOiBsZWdhY3lDb25maWcsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0c2Vzc2lvbklkOiAnbGVnYWN5LW1vZGVsLWNvbmZpZy1zZXNzaW9uJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRpbnB1dFN0YXRlOiBsZWdhY3lJbnB1dFN0YXRlIGFzIHVua25vd24gYXMgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUsXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHsgdmFsdWU6IHNlcmlhbGl6YWJsZURhdGEsIHNlcmlhbGl6ZXI6IHVuZGVmaW5lZCEgfSxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cblx0XHQvLyBMZWdhY3kgY29uZmlnIGlzIHJlY292ZXJlZCBpbnRvIHRoZSBpbi1tZW1vcnkgaW5wdXQgc3RhdGUuLi5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmlucHV0TW9kZWwuc3RhdGUuZ2V0KCk/Lm1vZGVsQ29uZmlndXJhdGlvbiwgbGVnYWN5Q29uZmlnKTtcblxuXHRcdC8vIC4uLmFuZCByZS1zZXJpYWxpemVzIGludG8gdGhlIG5ldyBuZXN0ZWQgc2hhcGUgd2l0aCBubyB0b3AtbGV2ZWwgZmllbGQuXG5cdFx0Y29uc3Qgc2VyaWFsaXplZCA9IG1vZGVsLmlucHV0TW9kZWwudG9KU09OKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJpYWxpemVkPy5zZWxlY3RlZE1vZGVsPy5tb2RlbENvbmZpZ3VyYXRpb24sIGxlZ2FjeUNvbmZpZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzZXJpYWxpemVkIGFzIHsgbW9kZWxDb25maWd1cmF0aW9uPzogdW5rbm93biB9KS5tb2RlbENvbmZpZ3VyYXRpb24sIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdSZXNwb25zZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtZXJnZWFibGUgbWFya2Rvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnbWFya2Rvd24xJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ21hcmtkb3duMicpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXNwb25zZS52YWx1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudG9TdHJpbmcoKSwgJ21hcmtkb3duMW1hcmtkb3duMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZWFibGUgbWFya2Rvd24gYWNyb3NzIG5lc3RlZCBzdWJhZ2VudCBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdJJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoQ2hhdFRvb2xJbnZvY2F0aW9uLmNyZWF0ZVN0cmVhbWluZyh7XG5cdFx0XHR0b29sQ2FsbElkOiAnY2hpbGQtdG9vbCcsXG5cdFx0XHR0b29sSWQ6ICd2aWV3Jyxcblx0XHRcdHRvb2xEYXRhOiB7XG5cdFx0XHRcdGlkOiAndmlldycsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdSZWFkIGEgZmlsZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZGluZycsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR9LFxuXHRcdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6ICdwYXJlbnQtdG9vbCcsXG5cdFx0fSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1xcJ3ZlIGxhdW5jaGVkIGEgYmFja2dyb3VuZCBhZ2VudC4nKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlLnZhbHVlLm1hcChwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCdcblx0XHRcdD8geyBraW5kOiBwYXJ0LmtpbmQsIGNvbnRlbnQ6IHBhcnQuY29udGVudC52YWx1ZSB9XG5cdFx0XHQ6IHsga2luZDogcGFydC5raW5kIH0pLCBbXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiAnSVxcJ3ZlIGxhdW5jaGVkIGEgYmFja2dyb3VuZCBhZ2VudC4nIH0sXG5cdFx0XHR7IGtpbmQ6ICd0b29sSW52b2NhdGlvbicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbm90IG1lcmdlYWJsZSBtYXJrZG93bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRjb25zdCBtZDEgPSBuZXcgTWFya2Rvd25TdHJpbmcoJ21hcmtkb3duMScpO1xuXHRcdG1kMS5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG1kMSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnbWFya2Rvd24yJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3BvbnNlLnZhbHVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3lzdGVtIG5vdGlmaWNhdGlvbiByZW1haW5zIGRpc3RpbmN0IGZyb20gbGF0ZXIgcmVzcG9uc2UgY29udGVudCcsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3N5c3RlbU5vdGlmaWNhdGlvbicsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnQmFja2dyb3VuZCBjb21tYW5kIGNvbXBsZXRlZCcpIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdGaW5pc2hlZCBwcm9jZXNzaW5nIG91dHB1dC4nKSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZHM6IHJlc3BvbnNlLnZhbHVlLm1hcChwYXJ0ID0+IHBhcnQua2luZCksXG5cdFx0XHR0ZXh0OiByZXNwb25zZS50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGtpbmRzOiBbJ3N5c3RlbU5vdGlmaWNhdGlvbicsICdtYXJrZG93bkNvbnRlbnQnXSxcblx0XHRcdHRleHQ6ICdCYWNrZ3JvdW5kIGNvbW1hbmQgY29tcGxldGVkXFxuXFxuRmluaXNoZWQgcHJvY2Vzc2luZyBvdXRwdXQuJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3lzdGVtIG5vdGlmaWNhdGlvbiBrZWVwcyBzdHJlYW1pbmcgdG9vbCBwcm9ncmVzcyBhdCB0aGUgcmVzcG9uc2UgdGFpbCcsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnQ2hlY2tpbmcgdGhlIHdvcmtzcGFjZS4nKSB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KENoYXRUb29sSW52b2NhdGlvbi5jcmVhdGVTdHJlYW1pbmcoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdHRvb2xJZDogJ3ZpZXcnLFxuXHRcdFx0dG9vbERhdGE6IHtcblx0XHRcdFx0aWQ6ICd2aWV3Jyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1JlYWQgYSBmaWxlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSZWFkaW5nJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAnc3lzdGVtTm90aWZpY2F0aW9uJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdCYWNrZ3JvdW5kIGFnZW50IGNvbXBsZXRlZCcpIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwb25zZS52YWx1ZS5tYXAocGFydCA9PiBwYXJ0LmtpbmQpLCBbXG5cdFx0XHQnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdCdzeXN0ZW1Ob3RpZmljYXRpb24nLFxuXHRcdFx0J3Rvb2xJbnZvY2F0aW9uJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3lzdGVtIG5vdGlmaWNhdGlvbiBkb2VzIG5vdCByZW9yZGVyIGFuIG9sZGVyIHN0cmVhbWluZyB0b29sIGFyb3VuZCBhIHByb2dyZXNzIHRhc2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHN0cmluZyB8IHZvaWQ+KCk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NUYXNrOiBJQ2hhdFRhc2sgPSB7XG5cdFx0XHRraW5kOiAncHJvZ3Jlc3NUYXNrJyxcblx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnV2FpdGluZyBmb3IgdGFzaycpLFxuXHRcdFx0ZGVmZXJyZWQsXG5cdFx0XHRwcm9ncmVzczogW10sXG5cdFx0XHRvbkRpZEFkZFByb2dyZXNzOiBFdmVudC5Ob25lLFxuXHRcdFx0YWRkOiAoKSA9PiB7IH0sXG5cdFx0XHRjb21wbGV0ZTogcmVzdWx0ID0+IGRlZmVycmVkLmNvbXBsZXRlKHJlc3VsdCksXG5cdFx0XHR0YXNrOiAoKSA9PiBkZWZlcnJlZC5wLFxuXHRcdFx0aXNTZXR0bGVkOiAoKSA9PiBkZWZlcnJlZC5pc1NldHRsZWQsXG5cdFx0XHR0b0pTT046ICgpID0+ICh7IGtpbmQ6ICdwcm9ncmVzc1Rhc2tTZXJpYWxpemVkJywgY29udGVudDogcHJvZ3Jlc3NUYXNrLmNvbnRlbnQsIHByb2dyZXNzOiBwcm9ncmVzc1Rhc2sucHJvZ3Jlc3MgfSksXG5cdFx0fTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KENoYXRUb29sSW52b2NhdGlvbi5jcmVhdGVTdHJlYW1pbmcoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdHRvb2xJZDogJ3ZpZXcnLFxuXHRcdFx0dG9vbERhdGE6IHtcblx0XHRcdFx0aWQ6ICd2aWV3Jyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1JlYWQgYSBmaWxlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSZWFkaW5nJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQocHJvZ3Jlc3NUYXNrKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3N5c3RlbU5vdGlmaWNhdGlvbicsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnQmFja2dyb3VuZCBhZ2VudCBjb21wbGV0ZWQnKSB9KTtcblxuXHRcdHByb2dyZXNzVGFzay5jb21wbGV0ZSgnVGFzayBjb21wbGV0ZWQnKTtcblx0XHRhd2FpdCBwcm9ncmVzc1Rhc2sudGFzaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwb25zZS52YWx1ZS5tYXAocGFydCA9PlxuXHRcdFx0cGFydC5raW5kID09PSAncHJvZ3Jlc3NUYXNrJyB8fCBwYXJ0LmtpbmQgPT09ICdzeXN0ZW1Ob3RpZmljYXRpb24nXG5cdFx0XHRcdD8geyBraW5kOiBwYXJ0LmtpbmQsIGNvbnRlbnQ6IHBhcnQuY29udGVudC52YWx1ZSB9XG5cdFx0XHRcdDogeyBraW5kOiBwYXJ0LmtpbmQgfSksIFtcblx0XHRcdHsga2luZDogJ3Rvb2xJbnZvY2F0aW9uJyB9LFxuXHRcdFx0eyBraW5kOiAncHJvZ3Jlc3NUYXNrJywgY29udGVudDogJ1Rhc2sgY29tcGxldGVkJyB9LFxuXHRcdFx0eyBraW5kOiAnc3lzdGVtTm90aWZpY2F0aW9uJywgY29udGVudDogJ0JhY2tncm91bmQgYWdlbnQgY29tcGxldGVkJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmxpbmUgcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ3RleHQgYmVmb3JlICcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgaW5saW5lUmVmZXJlbmNlOiBVUkkucGFyc2UoJ2h0dHBzOi8vbWljcm9zb2Z0LmNvbS8nKSwga2luZDogJ2lubGluZVJlZmVyZW5jZScgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnIHRleHQgYWZ0ZXInKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzcG9uc2UudmFsdWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnRvU3RyaW5nKCksICd0ZXh0IGJlZm9yZSBodHRwczovL21pY3Jvc29mdC5jb20vIHRleHQgYWZ0ZXInKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGlubGluZSByZWZlcmVuY2UgdXBkYXRlcyBleGlzdGluZyByZXNwb25zZSBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdH0pO1xuXG5cdFx0bGV0IGNoYW5nZXMgPSAwO1xuXHRcdHN0b3JlLmFkZChyZXNwb25zZS5vbkRpZENoYW5nZVZhbHVlKCgpID0+IGNoYW5nZXMrKykpO1xuXG5cdFx0Y29uc3QgZGlkUmVzb2x2ZSA9IHJlc3BvbnNlLnJlc29sdmVJbmxpbmVSZWZlcmVuY2UoJ3Jlc29sdmUxJywge1xuXHRcdFx0a2luZDogJ2lubGluZVJlZmVyZW5jZScsXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2U6IHtcblx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNwb25zZS52YWx1ZVswXTtcblx0XHRjb25zdCByZXNvbHZlZFJlZmVyZW5jZSA9IHJlc29sdmVkLmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnID8gcmVzb2x2ZWQuaW5saW5lUmVmZXJlbmNlIDogdW5kZWZpbmVkO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaWRSZXNvbHZlLFxuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdHJlc3BvbnNlVGV4dDogcmVzcG9uc2UudG9TdHJpbmcoKSxcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlLFxuXHRcdH0sIHtcblx0XHRcdGRpZFJlc29sdmU6IHRydWUsXG5cdFx0XHRjaGFuZ2VzOiAxLFxuXHRcdFx0cmVzcG9uc2VUZXh0OiAnYEZvb2AnLFxuXHRcdFx0cmVzb2x2ZWRSZWZlcmVuY2U6IHtcblx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgaW5saW5lIHJlZmVyZW5jZSB1cGRhdGVzIGRpc3BsYXkgbmFtZSB3aGVuIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlkUmVzb2x2ZSA9IHJlc3BvbnNlLnJlc29sdmVJbmxpbmVSZWZlcmVuY2UoJ3Jlc29sdmUxJywge1xuXHRcdFx0a2luZDogJ2lubGluZVJlZmVyZW5jZScsXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2U6IHtcblx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdH0sXG5cdFx0XHRuYW1lOiAnUmVzb2x2ZWQgRm9vJyxcblx0XHR9KTtcblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc3BvbnNlLnZhbHVlWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaWRSZXNvbHZlLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHJlc29sdmVkLmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnID8gcmVzb2x2ZWQubmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3BvbnNlVGV4dDogcmVzcG9uc2UudG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHRkaWRSZXNvbHZlOiB0cnVlLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSZXNvbHZlZCBGb28nLFxuXHRcdFx0cmVzcG9uc2VUZXh0OiAnYEZvb2AnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGlubGluZSByZWZlcmVuY2UgcmV0dXJucyBmYWxzZSBmb3IgYW4gdW5rbm93biByZXNvbHZlIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdH0pO1xuXG5cdFx0bGV0IGNoYW5nZXMgPSAwO1xuXHRcdHN0b3JlLmFkZChyZXNwb25zZS5vbkRpZENoYW5nZVZhbHVlKCgpID0+IGNoYW5nZXMrKykpO1xuXG5cdFx0Y29uc3QgZGlkUmVzb2x2ZSA9IHJlc3BvbnNlLnJlc29sdmVJbmxpbmVSZWZlcmVuY2UoJ21pc3NpbmcnLCB7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZToge1xuXHRcdFx0XHRuYW1lOiAnRm9vJyxcblx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5DbGFzcyxcblx0XHRcdFx0bG9jYXRpb246IHsgdXJpLCByYW5nZTogbmV3IFJhbmdlKDIsIDcsIDIsIDEwKSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlkUmVzb2x2ZSxcblx0XHRcdGNoYW5nZXMsXG5cdFx0XHRyZXNwb25zZVRleHQ6IHJlc3BvbnNlLnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0ZGlkUmVzb2x2ZTogZmFsc2UsXG5cdFx0XHRjaGFuZ2VzOiAwLFxuXHRcdFx0cmVzcG9uc2VUZXh0OiAnYGZvby50czoxYCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubGluZSBmaWxlIHJlZmVyZW5jZSBjb3BpZXMgYXMgY29kZSB3aXRoIGl0cyBsaW5lIHN1ZmZpeCcsICgpID0+IHtcblx0XHQvLyBNYXRjaGVzIHdoYXQgdGhlIGlubGluZSBhbmNob3Igd2lkZ2V0IHJlbmRlcnMsIGFuZCBrZWVwcyBuYW1lcyBjb250YWluaW5nIGAqYCBvciBgX2Bcblx0XHQvLyBpbnRhY3Qgd2hlbiB0aGUgY29waWVkIG1hcmtkb3duIGlzIHJlbmRlcmVkIHNvbWV3aGVyZSBlbHNlLlxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLCBpbmxpbmVSZWZlcmVuY2U6IHsgdXJpLCByYW5nZTogbmV3IFJhbmdlKDQyLCAxLCA0MiwgOCkgfSB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcgYW5kICcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ2lubGluZVJlZmVyZW5jZScsIGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMTAsIDEsIDIwLCAxKSB9IH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJyBhbmQgJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiB1cmkgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudG9TdHJpbmcoKSwgJ2Bmb28udHM6NDJgIGFuZCBgZm9vLnRzOjEwLTIwYCBhbmQgYGZvby50c2AnKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc29saWRhdGVkIGVkaXQgc3VtbWFyeScsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdTb21lIGNvbnRlbnQgYmVmb3JlIGVkaXRzJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAndGV4dEVkaXRHcm91cCcsIHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUxLnRzJyksIGVkaXRzOiBbXSwgc3RhdGU6IHVuZGVmaW5lZCwgZG9uZTogdHJ1ZSB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3RleHRFZGl0R3JvdXAnLCB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9maWxlMi50cycpLCBlZGl0czogW10sIHN0YXRlOiB1bmRlZmluZWQsIGRvbmU6IHRydWUgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnU29tZSBjb250ZW50IGFmdGVyIGVkaXRzJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgc2luZ2xlIFwiTWFkZSBjaGFuZ2VzLlwiIGF0IHRoZSBlbmQgaW5zdGVhZCBvZiBtdWx0aXBsZSBlbnRyaWVzXG5cdFx0Y29uc3QgcmVzcG9uc2VTdHJpbmcgPSByZXNwb25zZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IG1hZGVDaGFuZ2VzQ291bnQgPSAocmVzcG9uc2VTdHJpbmcubWF0Y2goL01hZGUgY2hhbmdlc1xcLi9nKSB8fCBbXSkubGVuZ3RoO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWRlQ2hhbmdlc0NvdW50LCAxLCAnU2hvdWxkIGhhdmUgZXhhY3RseSBvbmUgXCJNYWRlIGNoYW5nZXMuXCIgbWVzc2FnZScpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZVN0cmluZy5pbmNsdWRlcygnU29tZSBjb250ZW50IGJlZm9yZSBlZGl0cycpLCAnU2hvdWxkIGluY2x1ZGUgY29udGVudCBiZWZvcmUgZWRpdHMnKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ1NvbWUgY29udGVudCBhZnRlciBlZGl0cycpLCAnU2hvdWxkIGluY2x1ZGUgY29udGVudCBhZnRlciBlZGl0cycpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZVN0cmluZy5lbmRzV2l0aCgnTWFkZSBjaGFuZ2VzLicpLCAnU2hvdWxkIGVuZCB3aXRoIFwiTWFkZSBjaGFuZ2VzLlwiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIGVkaXQgc3VtbWFyeSB3aGVuIG5vIGVkaXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1NvbWUgY29udGVudCcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdNb3JlIGNvbnRlbnQnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cblx0XHQvLyBTaG91bGQgbm90IGhhdmUgXCJNYWRlIGNoYW5nZXMuXCIgd2hlbiB0aGVyZSBhcmUgbm8gZWRpdCBncm91cHNcblx0XHRjb25zdCByZXNwb25zZVN0cmluZyA9IHJlc3BvbnNlLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXNwb25zZVN0cmluZy5pbmNsdWRlcygnTWFkZSBjaGFuZ2VzLicpLCAnU2hvdWxkIG5vdCBpbmNsdWRlIFwiTWFkZSBjaGFuZ2VzLlwiIHdoZW4gbm8gZWRpdHMgcHJlc2VudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZVN0cmluZywgJ1NvbWUgY29udGVudE1vcmUgY29udGVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zb2xpZGF0ZWQgZWRpdCBzdW1tYXJ5IHdpdGggY2xlYXIgb3BlcmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0luaXRpYWwgY29udGVudCcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3RleHRFZGl0R3JvdXAnLCB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9maWxlMS50cycpLCBlZGl0czogW10sIHN0YXRlOiB1bmRlZmluZWQsIGRvbmU6IHRydWUgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGtpbmQ6ICdjbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvbicsIHJlYXNvbjogMSB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdDb250ZW50IGFmdGVyIGNsZWFyJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAndGV4dEVkaXRHcm91cCcsIHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUyLnRzJyksIGVkaXRzOiBbXSwgc3RhdGU6IHVuZGVmaW5lZCwgZG9uZTogdHJ1ZSB9KTtcblxuXHRcdC8vIFNob3VsZCBvbmx5IHNob3cgXCJNYWRlIGNoYW5nZXMuXCIgZm9yIGVkaXRzIGFmdGVyIHRoZSBjbGVhciBvcGVyYXRpb25cblx0XHRjb25zdCByZXNwb25zZVN0cmluZyA9IHJlc3BvbnNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbWFkZUNoYW5nZXNDb3VudCA9IChyZXNwb25zZVN0cmluZy5tYXRjaCgvTWFkZSBjaGFuZ2VzXFwuL2cpIHx8IFtdKS5sZW5ndGg7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hZGVDaGFuZ2VzQ291bnQsIDEsICdTaG91bGQgaGF2ZSBleGFjdGx5IG9uZSBcIk1hZGUgY2hhbmdlcy5cIiBtZXNzYWdlIGFmdGVyIGNsZWFyJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlU3RyaW5nLmluY2x1ZGVzKCdDb250ZW50IGFmdGVyIGNsZWFyJyksICdTaG91bGQgaW5jbHVkZSBjb250ZW50IGFmdGVyIGNsZWFyJyk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXNwb25zZVN0cmluZy5pbmNsdWRlcygnSW5pdGlhbCBjb250ZW50JyksICdTaG91bGQgbm90IGluY2x1ZGUgY29udGVudCBiZWZvcmUgY2xlYXInKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2VTdHJpbmcuZW5kc1dpdGgoJ01hZGUgY2hhbmdlcy4nKSwgJ1Nob3VsZCBlbmQgd2l0aCBcIk1hZGUgY2hhbmdlcy5cIicpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXh0RWRpdCBtZXJnZXMgZWRpdHMgZm9yIHNhbWUgVVJJIHdoZW4gbm90IGRvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUxLnRzJyk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHR1cmksXG5cdFx0XHRlZGl0czogW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2VkaXQxJyB9XSxcblx0XHRcdGRvbmU6IGZhbHNlLFxuXHRcdFx0aXNFeHRlcm5hbEVkaXQ6IHRydWVcblx0XHR9KTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdHVyaSxcblx0XHRcdGVkaXRzOiBbeyByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDEpLCB0ZXh0OiAnZWRpdDInIH1dLFxuXHRcdFx0ZG9uZTogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGV4dEVkaXRHcm91cHMgPSByZXNwb25zZS52YWx1ZS5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICd0ZXh0RWRpdEdyb3VwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRFZGl0R3JvdXBzLmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIGV4YWN0bHkgb25lIHRleHRFZGl0R3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRHcm91cHNbMF0uZWRpdHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgdHdvIGVkaXQgYmF0Y2hlcyBtZXJnZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRHcm91cHNbMF0uZG9uZSwgdHJ1ZSwgJ1Nob3VsZCBiZSBtYXJrZWQgYXMgZG9uZSBhZnRlciBmaW5hbCBlZGl0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRFZGl0R3JvdXBzWzBdLmlzRXh0ZXJuYWxFZGl0LCB0cnVlLCAnU2hvdWxkIHByZXNlcnZlIGlzRXh0ZXJuYWxFZGl0IGZsYWcgZnJvbSBmaXJzdCBlZGl0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RleHRFZGl0IGRvZXMgbm90IG1lcmdlIGVkaXRzIHdoZW4gcHJldmlvdXMgaXMgZG9uZScsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vZmlsZTEudHMnKTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdHVyaSxcblx0XHRcdGVkaXRzOiBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnZWRpdDEnIH1dLFxuXHRcdFx0ZG9uZTogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAndGV4dEVkaXQnLFxuXHRcdFx0dXJpLFxuXHRcdFx0ZWRpdHM6IFt7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksIHRleHQ6ICdlZGl0MicgfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXh0RWRpdEdyb3VwcyA9IHJlc3BvbnNlLnZhbHVlLmZpbHRlcihwID0+IHAua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRHcm91cHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgdHdvIHNlcGFyYXRlIHRleHRFZGl0R3JvdXBzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RleHRFZGl0IGRvZXMgbm90IG1lcmdlIGVkaXRzIGZvciBkaWZmZXJlbnQgVVJJcycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUxLnRzJyksXG5cdFx0XHRlZGl0czogW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2VkaXQxJyB9XSxcblx0XHRcdGRvbmU6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9maWxlMi50cycpLFxuXHRcdFx0ZWRpdHM6IFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdlZGl0MicgfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXh0RWRpdEdyb3VwcyA9IHJlc3BvbnNlLnZhbHVlLmZpbHRlcihwID0+IHAua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEVkaXRHcm91cHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgdHdvIHNlcGFyYXRlIHRleHRFZGl0R3JvdXBzIGZvciBkaWZmZXJlbnQgVVJJcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdub3RlYm9va0VkaXQgbWVyZ2VzIGVkaXRzIGZvciBzYW1lIG5vdGVib29rIFVSSSB3aGVuIG5vdCBkb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdGNvbnN0IG5vdGVib29rVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL25vdGVib29rLmlweW5iJyk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdub3RlYm9va0VkaXQnLFxuXHRcdFx0dXJpOiBub3RlYm9va1VyaSxcblx0XHRcdGVkaXRzOiBbeyBlZGl0VHlwZTogMSAvKiBDZWxsRWRpdFR5cGUuUmVwbGFjZSAqLywgaW5kZXg6IDAsIGNvdW50OiAwLCBjZWxsczogW10gfV0sXG5cdFx0XHRkb25lOiBmYWxzZSxcblx0XHRcdGlzRXh0ZXJuYWxFZGl0OiB0cnVlXG5cdFx0fSk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdub3RlYm9va0VkaXQnLFxuXHRcdFx0dXJpOiBub3RlYm9va1VyaSxcblx0XHRcdGVkaXRzOiBbeyBlZGl0VHlwZTogMSAvKiBDZWxsRWRpdFR5cGUuUmVwbGFjZSAqLywgaW5kZXg6IDEsIGNvdW50OiAwLCBjZWxsczogW10gfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBub3RlYm9va0VkaXRHcm91cHMgPSByZXNwb25zZS52YWx1ZS5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICdub3RlYm9va0VkaXRHcm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9va0VkaXRHcm91cHMubGVuZ3RoLCAxLCAnU2hvdWxkIGhhdmUgZXhhY3RseSBvbmUgbm90ZWJvb2tFZGl0R3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2tFZGl0R3JvdXBzWzBdLmVkaXRzLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIHR3byBlZGl0IGJhdGNoZXMgbWVyZ2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rRWRpdEdyb3Vwc1swXS5kb25lLCB0cnVlLCAnU2hvdWxkIGJlIG1hcmtlZCBhcyBkb25lIGFmdGVyIGZpbmFsIGVkaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2tFZGl0R3JvdXBzWzBdLmlzRXh0ZXJuYWxFZGl0LCB0cnVlLCAnU2hvdWxkIHByZXNlcnZlIGlzRXh0ZXJuYWxFZGl0IGZsYWcgZnJvbSBmaXJzdCBlZGl0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGVib29rRWRpdCBkb2VzIG5vdCBtZXJnZSBlZGl0cyB3aGVuIHByZXZpb3VzIGlzIGRvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbm90ZWJvb2suaXB5bmInKTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHR1cmk6IG5vdGVib29rVXJpLFxuXHRcdFx0ZWRpdHM6IFt7IGVkaXRUeXBlOiAxIC8qIENlbGxFZGl0VHlwZS5SZXBsYWNlICovLCBpbmRleDogMCwgY291bnQ6IDAsIGNlbGxzOiBbXSB9XSxcblx0XHRcdGRvbmU6IHRydWVcblx0XHR9KTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHR1cmk6IG5vdGVib29rVXJpLFxuXHRcdFx0ZWRpdHM6IFt7IGVkaXRUeXBlOiAxIC8qIENlbGxFZGl0VHlwZS5SZXBsYWNlICovLCBpbmRleDogMSwgY291bnQ6IDAsIGNlbGxzOiBbXSB9XSxcblx0XHRcdGRvbmU6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IG5vdGVib29rRWRpdEdyb3VwcyA9IHJlc3BvbnNlLnZhbHVlLmZpbHRlcihwID0+IHAua2luZCA9PT0gJ25vdGVib29rRWRpdEdyb3VwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rRWRpdEdyb3Vwcy5sZW5ndGgsIDIsICdTaG91bGQgaGF2ZSB0d28gc2VwYXJhdGUgbm90ZWJvb2tFZGl0R3JvdXBzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGVib29rRWRpdCBkb2VzIG5vdCBtZXJnZSBlZGl0cyBmb3IgZGlmZmVyZW50IG5vdGVib29rIFVSSXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdub3RlYm9va0VkaXQnLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vbm90ZWJvb2sxLmlweW5iJyksXG5cdFx0XHRlZGl0czogW3sgZWRpdFR5cGU6IDEgLyogQ2VsbEVkaXRUeXBlLlJlcGxhY2UgKi8sIGluZGV4OiAwLCBjb3VudDogMCwgY2VsbHM6IFtdIH1dLFxuXHRcdFx0ZG9uZTogZmFsc2Vcblx0XHR9KTtcblxuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9ub3RlYm9vazIuaXB5bmInKSxcblx0XHRcdGVkaXRzOiBbeyBlZGl0VHlwZTogMSAvKiBDZWxsRWRpdFR5cGUuUmVwbGFjZSAqLywgaW5kZXg6IDAsIGNvdW50OiAwLCBjZWxsczogW10gfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBub3RlYm9va0VkaXRHcm91cHMgPSByZXNwb25zZS52YWx1ZS5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICdub3RlYm9va0VkaXRHcm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9va0VkaXRHcm91cHMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgdHdvIHNlcGFyYXRlIG5vdGVib29rRWRpdEdyb3VwcyBmb3IgZGlmZmVyZW50IFVSSXMnKTtcblx0fSk7XG5cblx0dGVzdCgndGV4dEVkaXQgdG8gbm90ZWJvb2sgY2VsbCBjcmVhdGVzIG5vdGVib29rRWRpdEdyb3VwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdGNvbnN0IG5vdGVib29rVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL25vdGVib29rLmlweW5iJyk7XG5cdFx0Y29uc3QgY2VsbFVyaSA9IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDEpO1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAndGV4dEVkaXQnLFxuXHRcdFx0dXJpOiBjZWxsVXJpLFxuXHRcdFx0ZWRpdHM6IFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdlZGl0MScgfV0sXG5cdFx0XHRkb25lOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXh0RWRpdEdyb3VwcyA9IHJlc3BvbnNlLnZhbHVlLmZpbHRlcihwID0+IHAua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKTtcblx0XHRjb25zdCBub3RlYm9va0VkaXRHcm91cHMgPSByZXNwb25zZS52YWx1ZS5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICdub3RlYm9va0VkaXRHcm91cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0RWRpdEdyb3Vwcy5sZW5ndGgsIDAsICdTaG91bGQgbm90IGhhdmUgdGV4dEVkaXRHcm91cCBmb3IgY2VsbCBlZGl0cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9va0VkaXRHcm91cHMubGVuZ3RoLCAxLCAnU2hvdWxkIGhhdmUgbm90ZWJvb2tFZGl0R3JvdXAgZm9yIGNlbGwgZWRpdHMnKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0ZXJuYWwgdGVybWluYWwgdG9vbCB1cGRhdGVzIHByZXNlcnZlIHRvb2xTcGVjaWZpY0RhdGEgd2hlbiBjb21wbGV0aW5nIGFuIGV4aXN0aW5nIGludm9jYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRsYW5ndWFnZTogJ2Jhc2gnLFxuXHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gdGVzdCcgfSxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZE91dHB1dDogeyB0ZXh0OiAnYWxsIGdyZWVuJyB9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kU3RhdGU6IHsgZXhpdENvZGU6IDAgfSxcblx0XHR9O1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5faW5fdGVybWluYWwnLFxuXHRcdFx0aXNDb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgbnBtIHRlc3QnLFxuXHRcdH0pO1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5faW5fdGVybWluYWwnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gbnBtIHRlc3QnLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS52YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS52YWx1ZVswXS5raW5kLCAndG9vbEludm9jYXRpb24nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlLnZhbHVlWzBdLnRvb2xTcGVjaWZpY0RhdGEsIHRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUocmVzcG9uc2UudmFsdWVbMF0pLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0ZXJuYWwgdGVybWluYWwgdG9vbCB1cGRhdGVzIHByZXNlcnZlIHRvb2xTcGVjaWZpY0RhdGEgd2hlbiBmaXJzdCBwdXNoZWQgYXMgY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBzdG9yZS5hZGQobmV3IFJlc3BvbnNlKFtdKSk7XG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRsYW5ndWFnZTogJ2Jhc2gnLFxuXHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gdGVzdCcgfSxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZE91dHB1dDogeyB0ZXh0OiAnYWxsIGdyZWVuJyB9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kU3RhdGU6IHsgZXhpdENvZGU6IDAgfSxcblx0XHR9O1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTInLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5faW5fdGVybWluYWwnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBucG0gdGVzdCcsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIG5wbSB0ZXN0Jyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudmFsdWUubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudmFsdWVbMF0ua2luZCwgJ3Rvb2xJbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwb25zZS52YWx1ZVswXS50b29sU3BlY2lmaWNEYXRhLCB0b29sU3BlY2lmaWNEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHJlc3BvbnNlLnZhbHVlWzBdKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BvbnNlIHN0cmluZ2lmaWNhdGlvbiBwcmVmZXJzIHRlcm1pbmFsIGRpc3BsYXkgY29tbWFuZCBvdmVyIHNhbmRib3ggd3JhcHBlcicsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRjb25zdCBzYW5kYm94V3JhcHBlZENvbW1hbmQgPSBgRUxFQ1RST05fUlVOX0FTX05PREU9MSBUTVBESVI9XCIvdG1wL3ZzY29kZVwiIFwiQ29kZSAtIEluc2lkZXJzXCIgXCJzYW5kYm94LXJ1bnRpbWVcIiAtYyAnbnBtIHRlc3QnYDtcblx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdGxhbmd1YWdlOiAnYmFzaCcsXG5cdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRvcmlnaW5hbDogc2FuZGJveFdyYXBwZWRDb21tYW5kLFxuXHRcdFx0XHR0b29sRWRpdGVkOiBzYW5kYm94V3JhcHBlZENvbW1hbmQsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICducG0gdGVzdCcsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kT3V0cHV0OiB7IHRleHQ6ICdhbGwgZ3JlZW4nIH0sXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRTdGF0ZTogeyBleGl0Q29kZTogMCB9LFxuXHRcdH07XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtZGlzcGxheS1jb21tYW5kJyxcblx0XHRcdHRvb2xOYW1lOiAncnVuX2luX3Rlcm1pbmFsJyxcblx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIG5wbSB0ZXN0Jyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXNwb25zZVN0cmluZyA9IHJlc3BvbnNlLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlU3RyaW5nLCAnUmFuIHRlcm1pbmFsIGNvbW1hbmQ6IG5wbSB0ZXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXNwb25zZVN0cmluZy5pbmNsdWRlcygnc2FuZGJveC1ydW50aW1lJykpO1xuXHRcdGFzc2VydC5vayghcmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ0VMRUNUUk9OX1JVTl9BU19OT0RFPTEnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BvbnNlIHN0cmluZ2lmaWNhdGlvbiBwcmVmZXJzIHRlcm1pbmFsIHByZXNlbnRhdGlvbiBvdmVycmlkZSBvdmVyIGRpc3BsYXkgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRjb25zdCBzYW5kYm94V3JhcHBlZENvbW1hbmQgPSBgRUxFQ1RST05fUlVOX0FTX05PREU9MSBUTVBESVI9XCIvdG1wL3ZzY29kZVwiIFwiQ29kZSAtIEluc2lkZXJzXCIgXCJzYW5kYm94LXJ1bnRpbWVcIiAtYyAncHl0aG9uIC1jIFwicHJpbnQoMSlcIidgO1xuXHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0b3JpZ2luYWw6IHNhbmRib3hXcmFwcGVkQ29tbWFuZCxcblx0XHRcdFx0dG9vbEVkaXRlZDogc2FuZGJveFdyYXBwZWRDb21tYW5kLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAncHl0aG9uIC1jIFwicHJpbnQoMSlcIicsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0cHJlc2VudGF0aW9uT3ZlcnJpZGVzOiB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiAncHJpbnQoMSknLFxuXHRcdFx0XHRsYW5ndWFnZTogJ3B5dGhvbicsXG5cdFx0XHR9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kT3V0cHV0OiB7IHRleHQ6ICcxJyB9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kU3RhdGU6IHsgZXhpdENvZGU6IDAgfSxcblx0XHR9O1xuXG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLXByZXNlbnRhdGlvbi1vdmVycmlkZScsXG5cdFx0XHR0b29sTmFtZTogJ3J1bl9pbl90ZXJtaW5hbCcsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBweXRob24gY29tbWFuZCcsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VTdHJpbmcgPSByZXNwb25zZS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZVN0cmluZywgJ1JhbiB0ZXJtaW5hbCBjb21tYW5kOiBwcmludCgxKScpO1xuXHRcdGFzc2VydC5vayghcmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ3NhbmRib3gtcnVudGltZScpKTtcblx0XHRhc3NlcnQub2soIXJlc3BvbnNlU3RyaW5nLmluY2x1ZGVzKCdweXRob24gLWMgXCJwcmludCgxKVwiJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNwb25zZSBzdHJpbmdpZmljYXRpb24gdXNlcyB0ZXJtaW5hbCBwcmVzZW50YXRpb24gb3ZlcnJpZGUgZm9yIHJlc3VsdCBkZXRhaWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdGNvbnN0IHNhbmRib3hXcmFwcGVkQ29tbWFuZCA9IGBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIFRNUERJUj1cIi90bXAvdnNjb2RlXCIgQ0xBVURFX1RNUERJUj1cIi90bXAvdnNjb2RlXCIgXCJDb2RlIC0gSW5zaWRlcnNcIiBcInNhbmRib3gtcnVudGltZVwiIC0tc2V0dGluZ3MgXCIvdG1wL3NldHRpbmdzLmpzb25cIiAtYyAncHl0aG9uIC1jIFwicHJpbnQoMSlcIidgO1xuXHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nLFxuXHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0b3JpZ2luYWw6ICdweXRob24gLWMgXCJwcmludCgxKVwiJyxcblx0XHRcdFx0dG9vbEVkaXRlZDogc2FuZGJveFdyYXBwZWRDb21tYW5kLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAncHl0aG9uIC1jIFwicHJpbnQoMSlcIicsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0cHJlc2VudGF0aW9uT3ZlcnJpZGVzOiB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiAncHJpbnQoMSknLFxuXHRcdFx0XHRsYW5ndWFnZTogJ3B5dGhvbicsXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtcmVzdWx0LWRldGFpbHMnLFxuXHRcdFx0dG9vbE5hbWU6ICdydW5faW5fdGVybWluYWwnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gcHl0aG9uIGNvbW1hbmQnLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdHJlc3VsdERldGFpbHM6IHtcblx0XHRcdFx0aW5wdXQ6IHNhbmRib3hXcmFwcGVkQ29tbWFuZCxcblx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiAnMScgfV0sXG5cdFx0XHRcdGlzRXJyb3I6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VTdHJpbmcgPSByZXNwb25zZS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZVN0cmluZywgJ1JhbiB0ZXJtaW5hbCBjb21tYW5kOiBwcmludCgxKVxcbkNvbXBsZXRlZCB3aXRoIGlucHV0OiBwcmludCgxKScpO1xuXHRcdGFzc2VydC5vayghcmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ3NhbmRib3gtcnVudGltZScpKTtcblx0XHRhc3NlcnQub2soIXJlc3BvbnNlU3RyaW5nLmluY2x1ZGVzKCdFTEVDVFJPTl9SVU5fQVNfTk9ERT0xJykpO1xuXHRcdGFzc2VydC5vayghcmVzcG9uc2VTdHJpbmcuaW5jbHVkZXMoJ3B5dGhvbiAtYyBcInByaW50KDEpXCInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEZpbmFsUmVzcG9uc2UgcmV0dXJucyBsYXN0IGNvbnRpZ3VvdXMgbWFya2Rvd24gYWZ0ZXIgdG9vbCBjYWxsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0Vhcmx5IHRleHQnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7XG5cdFx0XHRraW5kOiAnZXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnc29tZV90b29sJyxcblx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JhbiB0b29sJyxcblx0XHR9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdGaW5hbCB0ZXh0JyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmdldEZpbmFsUmVzcG9uc2UoKSwgJ0ZpbmFsIHRleHQnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RmluYWxSZXNwb25zZSBza2lwcyB0cmFpbGluZyBlbXB0eSBtYXJrZG93biBhbmQgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdCZWZvcmUgdG9vbCcpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdzb21lX3Rvb2wnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmFuIHRvb2wnLFxuXHRcdH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1RoZSBhbnN3ZXIgaXMgNDIuJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ2V4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHR0b29sTmFtZTogJ3NvbWVfdG9vbCcsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSYW4gYW5vdGhlciB0b29sJyxcblx0XHR9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuZ2V0RmluYWxSZXNwb25zZSgpLCAnVGhlIGFuc3dlciBpcyA0Mi4nKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RmluYWxSZXNwb25zZSBpbmNsdWRlcyBpbmxpbmUgcmVmZXJlbmNlcyBpbiBmaW5hbCBibG9jaycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHtcblx0XHRcdGtpbmQ6ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdzb21lX3Rvb2wnLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmFuIHRvb2wnLFxuXHRcdH0pO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1NlZSAnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGlubGluZVJlZmVyZW5jZTogVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tLycpLCBraW5kOiAnaW5saW5lUmVmZXJlbmNlJyB9KTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcgZm9yIGRldGFpbHMuJyksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmdldEZpbmFsUmVzcG9uc2UoKSwgJ1NlZSBodHRwczovL2V4YW1wbGUuY29tLyBmb3IgZGV0YWlscy4nKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RmluYWxSZXNwb25zZSByZXR1cm5zIGVtcHR5IHN0cmluZyB3aGVuIG5vIG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gc3RvcmUuYWRkKG5ldyBSZXNwb25zZShbXSkpO1xuXHRcdHJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoe1xuXHRcdFx0a2luZDogJ2V4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ3NvbWVfdG9vbCcsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSYW4gdG9vbCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuZ2V0RmluYWxSZXNwb25zZSgpLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEZpbmFsUmVzcG9uc2UgcmV0dXJucyBhbGwgbWFya2Rvd24gd2hlbiB0aGVyZSBhcmUgbm8gdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IHN0b3JlLmFkZChuZXcgUmVzcG9uc2UoW10pKTtcblx0XHRyZXNwb25zZS51cGRhdGVDb250ZW50KHsgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdIZWxsbyAnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0cmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnV29ybGQnKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuZ2V0RmluYWxSZXNwb25zZSgpLCAnSGVsbG8gV29ybGQnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ25vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd2MScsICgpID0+IHtcblx0XHRjb25zdCB2MURhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTEgPSB7XG5cdFx0XHRjcmVhdGlvbkRhdGU6IERhdGUubm93KCksXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYm90Jyxcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24xJyxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbmV3RGF0YSA9IG5vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhKHYxRGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0RhdGEuY3JlYXRpb25EYXRlLCB2MURhdGEuY3JlYXRpb25EYXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RGF0YS52ZXJzaW9uLCAzKTtcblx0fSk7XG5cblx0dGVzdCgndjInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdjJEYXRhOiBJU2VyaWFsaXphYmxlQ2hhdERhdGEyID0ge1xuXHRcdFx0dmVyc2lvbjogMixcblx0XHRcdGNyZWF0aW9uRGF0ZTogMTAwLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjb21wdXRlZFRpdGxlOiAnY29tcHV0ZWQgdGl0bGUnXG5cdFx0fTtcblxuXHRcdGNvbnN0IG5ld0RhdGEgPSBub3JtYWxpemVTZXJpYWxpemFibGVDaGF0RGF0YSh2MkRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdEYXRhLnZlcnNpb24sIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdEYXRhLmNyZWF0aW9uRGF0ZSwgdjJEYXRhLmNyZWF0aW9uRGF0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0RhdGEuY3VzdG9tVGl0bGUsIHYyRGF0YS5jb21wdXRlZFRpdGxlKTtcblx0fSk7XG5cblx0dGVzdCgnb2xkIGJhZCBkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHYxRGF0YTogSVNlcmlhbGl6YWJsZUNoYXREYXRhMSA9IHtcblx0XHRcdC8vIFRlc3RpbmcgdGhlIHNjZW5hcmlvIHdoZXJlIHRoZXNlIGFyZSBtaXNzaW5nXG5cdFx0XHRzZXNzaW9uSWQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IHVuZGVmaW5lZCEsXG5cblx0XHRcdGluaXRpYWxMb2NhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRjb25zdCBuZXdEYXRhID0gbm9ybWFsaXplU2VyaWFsaXphYmxlQ2hhdERhdGEodjFEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RGF0YS52ZXJzaW9uLCAzKTtcblx0XHRhc3NlcnQub2sobmV3RGF0YS5jcmVhdGlvbkRhdGUgPiAwKTtcblx0XHRhc3NlcnQub2sobmV3RGF0YS5zZXNzaW9uSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd2MyB3aXRoIGJ1ZycsICgpID0+IHtcblx0XHRjb25zdCB2M0RhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTMgPSB7XG5cdFx0XHQvLyBUZXN0IGNhc2Ugd2hlcmUgb2xkIGRhdGEgd2FzIHdyb25nbHkgbm9ybWFsaXplZCBhbmQgdGhlc2UgZmllbGRzIHdlcmUgbWlzc2luZ1xuXHRcdFx0Y3JlYXRpb25EYXRlOiB1bmRlZmluZWQhLFxuXG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjdXN0b21UaXRsZTogJ2NvbXB1dGVkIHRpdGxlJ1xuXHRcdH07XG5cblx0XHRjb25zdCBuZXdEYXRhID0gbm9ybWFsaXplU2VyaWFsaXphYmxlQ2hhdERhdGEodjNEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3RGF0YS52ZXJzaW9uLCAzKTtcblx0XHRhc3NlcnQub2sobmV3RGF0YS5jcmVhdGlvbkRhdGUgPiAwKTtcblx0XHRhc3NlcnQub2sobmV3RGF0YS5zZXNzaW9uSWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaXNFeHBvcnRhYmxlU2Vzc2lvbkRhdGEnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ZhbGlkIGV4cG9ydGFibGUgZGF0YScsICgpID0+IHtcblx0XHRjb25zdCB2YWxpZERhdGE6IElFeHBvcnRhYmxlQ2hhdERhdGEgPSB7XG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cG9ydGFibGVTZXNzaW9uRGF0YSh2YWxpZERhdGEpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCAtIG1pc3NpbmcgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52YWxpZERhdGEgPSB7XG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cG9ydGFibGVTZXNzaW9uRGF0YShpbnZhbGlkRGF0YSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCAtIHJlcXVlc3RzIG5vdCBhcnJheScsICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiAnbm90LWFuLWFycmF5Jyxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYm90Jyxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKGludmFsaWREYXRhKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIC0gbWlzc2luZyByZXNwb25kZXJVc2VybmFtZScsICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKGludmFsaWREYXRhKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIC0gcmVzcG9uZGVyVXNlcm5hbWUgbm90IHN0cmluZycsICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAxMjMsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cG9ydGFibGVTZXNzaW9uRGF0YShpbnZhbGlkRGF0YSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCAtIG51bGwnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKG51bGwpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWQgLSB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKHVuZGVmaW5lZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdHMgb25seSBleHBvcnRhYmxlIHNlc3Npb24gZmllbGRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRhdGEgPSB7XG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogW10sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2Fzc2lzdGFudCcsXG5cdFx0XHRzZXNzaW9uSWQ6ICcuLi8uLi8uLi9vdXRzaWRlJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogMSxcblx0XHRcdGN1c3RvbVRpdGxlOiAnSW5qZWN0ZWQgdGl0bGUnLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RFeHBvcnRhYmxlU2Vzc2lvbkRhdGEoZGF0YSksIHtcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYXNzaXN0YW50Jyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2lzU2VyaWFsaXphYmxlU2Vzc2lvbkRhdGEnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ZhbGlkIHNlcmlhbGl6YWJsZSBkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbGlkRGF0YTogSVNlcmlhbGl6YWJsZUNoYXREYXRhMyA9IHtcblx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IERhdGUubm93KCksXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTZXJpYWxpemFibGVTZXNzaW9uRGF0YSh2YWxpZERhdGEpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgndmFsaWQgLSB3aXRoIHVzZWRDb250ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbGlkRGF0YTogSVNlcmlhbGl6YWJsZUNoYXREYXRhMyA9IHtcblx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IERhdGUubm93KCksXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFt7XG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0XHRtZXNzYWdlOiAndGVzdCcsXG5cdFx0XHRcdHZhcmlhYmxlRGF0YTogeyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdHJlc3BvbnNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZWRDb250ZXh0OiB7IGRvY3VtZW50czogW10sIGtpbmQ6ICd1c2VkQ29udGV4dCcgfVxuXHRcdFx0fV0sXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NlcmlhbGl6YWJsZVNlc3Npb25EYXRhKHZhbGlkRGF0YSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnZhbGlkIC0gbWlzc2luZyBzZXNzaW9uSWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52YWxpZERhdGEgPSB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0Y3JlYXRpb25EYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0Y3VzdG9tVGl0bGU6IHVuZGVmaW5lZCxcblx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiAnYm90Jyxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU2VyaWFsaXphYmxlU2Vzc2lvbkRhdGEoaW52YWxpZERhdGEpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWQgLSBtaXNzaW5nIGNyZWF0aW9uRGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBpbnZhbGlkRGF0YSA9IHtcblx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uMScsXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVxdWVzdHM6IFtdLFxuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6ICdib3QnLFxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTZXJpYWxpemFibGVTZXNzaW9uRGF0YShpbnZhbGlkRGF0YSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCAtIG5vdCBleHBvcnRhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGludmFsaWREYXRhID0ge1xuXHRcdFx0dmVyc2lvbjogMyxcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24xJyxcblx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGN1c3RvbVRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRyZXF1ZXN0czogJ25vdC1hbi1hcnJheScsXG5cdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJ2JvdCcsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NlcmlhbGl6YWJsZVNlc3Npb25EYXRhKGludmFsaWREYXRhKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFJlc3BvbnNlTW9kZWwnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IE1vY2tDaGF0U2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVzdCgndGltZXN0YW1wIGFuZCBjb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gJ2hlbGxvJztcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZSE7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50aW1lc3RhbXAsIHN0YXJ0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5jb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcC5nZXQoKSwgc3RhcnQpO1xuXG5cdFx0XHQvLyBBZHZhbmNlIHRpbWUsIG5vIHBlbmRpbmcgY29uZmlybWF0aW9uXG5cdFx0XHRjbG9jay50aWNrKDEwMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wLmdldCgpLCBzdGFydCk7XG5cblx0XHRcdC8vIEFkZCBwZW5kaW5nIGNvbmZpcm1hdGlvbiB2aWEgdG9vbCBpbnZvY2F0aW9uXG5cdFx0XHRjb25zdCB0b29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8YW55Pignc3RhdGUnLCB7IHR5cGU6IDEgLyogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAqLywgY29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdQbGVhc2UgY29uZmlybScgfSB9KTtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ2NhbGxpbmcgdG9vbCcsXG5cdFx0XHRcdHN0YXRlOiB0b29sU3RhdGVcblx0XHRcdH0gYXMgUGFydGlhbDxJQ2hhdFRvb2xJbnZvY2F0aW9uPiBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXG5cdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdFx0Ly8gQWR2YW5jZSB0aW1lIHdoaWxlIHBlbmRpbmdcblx0XHRcdGNsb2NrLnRpY2soMjAwMCk7XG5cdFx0XHQvLyBUaW1lc3RhbXAgc2hvdWxkIHN0aWxsIGJlIHN0YXJ0IChpdCBpbmNsdWRlcyB0aGUgd2FpdCB0aW1lIHdoaWxlIHdhaXRpbmcpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXAuZ2V0KCksIHN0YXJ0KTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSBjb25maXJtYXRpb25cblx0XHRcdHRvb2xTdGF0ZS5zZXQoeyB0eXBlOiA0IC8qIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCAqLyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBOb3cgYWRqdXN0ZWQgdGltZXN0YW1wIHNob3VsZCByZWZsZWN0IHRoZSB3YWl0IHRpbWVcblx0XHRcdC8vIFRoZSB3YWl0IHRpbWUgd2FzIDIwMDBtcy5cblx0XHRcdC8vIGNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wID0gc3RhcnQgKyB3YWl0VGltZSA9IHN0YXJ0ICsgMjAwMFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wLmdldCgpLCBzdGFydCArIDIwMDApO1xuXG5cdFx0XHQvLyBBZHZhbmNlIHRpbWUgYWdhaW5cblx0XHRcdGNsb2NrLnRpY2soMTAwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXAuZ2V0KCksIHN0YXJ0ICsgMjAwMCk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xvY2sucmVzdG9yZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaXNJbmNvbXBsZXRlIHN0YXlzIHRydWUgZHVyaW5nIHRvb2wgY29uZmlybWF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbCwgdW5kZWZpbmVkLCB7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUgfSkpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gJ2hlbGxvJztcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZSE7XG5cblx0XHRcdC8vIEluaXRpYWxseSBpbmNvbXBsZXRlIGFuZCBpbiBwcm9ncmVzc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5jb21wbGV0ZS5nZXQoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuaXNJblByb2dyZXNzLmdldCgpLCB0cnVlKTtcblxuXHRcdFx0Ly8gQWRkIGEgcGVuZGluZyB0b29sIGNvbmZpcm1hdGlvblxuXHRcdFx0Y29uc3QgdG9vbFN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPGFueT4oJ3N0YXRlJywgeyB0eXBlOiAxIC8qIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gKi8sIGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7IHRpdGxlOiAnUGxlYXNlIGNvbmZpcm0nIH0gfSk7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdjYWxsaW5nIHRvb2wnLFxuXHRcdFx0XHRzdGF0ZTogdG9vbFN0YXRlXG5cdFx0XHR9IGFzIFBhcnRpYWw8SUNoYXRUb29sSW52b2NhdGlvbj4gYXMgSUNoYXRUb29sSW52b2NhdGlvbjtcblx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgdG9vbEludm9jYXRpb24pO1xuXG5cdFx0XHQvLyBpc0luUHJvZ3Jlc3Mgc2hvdWxkIGJlIGZhbHNlIChpdCBmYWN0b3JzIG91dCBwZW5kaW5nIGNvbmZpcm1hdGlvbnMpLCBidXQgaXNJbmNvbXBsZXRlIHNob3VsZCByZW1haW4gdHJ1ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5Qcm9ncmVzcy5nZXQoKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5jb21wbGV0ZS5nZXQoKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFJlc29sdmUgdG9vbCBjb25maXJtYXRpb25cblx0XHRcdHRvb2xTdGF0ZS5zZXQoeyB0eXBlOiA0IC8qIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCAqLyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5Qcm9ncmVzcy5nZXQoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuaXNJbmNvbXBsZXRlLmdldCgpLCB0cnVlKTtcblxuXHRcdFx0Ly8gQ29tcGxldGUgdGhlIHJlc3BvbnNlXG5cdFx0XHRyZXNwb25zZS5jb21wbGV0ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5Qcm9ncmVzcy5nZXQoKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5jb21wbGV0ZS5nZXQoKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXRlLCBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdNQ1AgdG9vbCBhdXRoZW50aWNhdGlvbiBtYXJrcyB0aGUgcmVzcG9uc2UgYXMgbmVlZGluZyBpbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3QgdGV4dCA9ICdoZWxsbyc7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZSE7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdjYWxsaW5nIHRvb2wnLFxuXHRcdFx0c3RhdGU6IG9ic2VydmFibGVWYWx1ZTxhbnk+KCdzdGF0ZScsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uLFxuXHRcdFx0XHRzZXJ2ZXI6IHsgaWQ6ICdzZXJ2ZXInLCBuYW1lOiAnR2l0SHViIE1DUCcsIHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vbWNwJyB9LFxuXHRcdFx0XHRjYW5jZWw6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdFRvb2xJbnZvY2F0aW9uPiBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXG5cdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB0b29sSW52b2NhdGlvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzSW5Qcm9ncmVzczogcmVzcG9uc2UuaXNJblByb2dyZXNzLmdldCgpLFxuXHRcdFx0aXNJbmNvbXBsZXRlOiByZXNwb25zZS5pc0luY29tcGxldGUuZ2V0KCksXG5cdFx0XHRwZW5kaW5nOiByZXNwb25zZS5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KCk/LmRldGFpbCxcblx0XHR9LCB7XG5cdFx0XHRpc0luUHJvZ3Jlc3M6IGZhbHNlLFxuXHRcdFx0aXNJbmNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0cGVuZGluZzogJ0F1dGhlbnRpY2F0ZSBHaXRIdWIgTUNQIHRvIGNvbnRpbnVlLi4uJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNJbmNvbXBsZXRlIGJlY29tZXMgZmFsc2Ugb24gY2FuY2VsbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnaGVsbG8nO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2UhO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmlzSW5jb21wbGV0ZS5nZXQoKSwgdHJ1ZSk7XG5cblx0XHRtb2RlbC5jYW5jZWxSZXF1ZXN0KHJlcXVlc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNJbmNvbXBsZXRlOiByZXNwb25zZS5pc0luY29tcGxldGUuZ2V0KCksXG5cdFx0XHRzdGF0ZTogcmVzcG9uc2Uuc3RhdGUsXG5cdFx0XHRoYXNFbGFwc2VkVGltZTogdHlwZW9mIHJlc3BvbnNlLmVsYXBzZWRNcyA9PT0gJ251bWJlcicsXG5cdFx0fSwge1xuXHRcdFx0aXNJbmNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdHN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ2FuY2VsbGVkLFxuXHRcdFx0aGFzRWxhcHNlZFRpbWU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxhdGlvbiB0cmFuc2l0aW9ucyBzdHJlYW1pbmcgdG9vbCBpbnZvY2F0aW9ucyB0byBDYW5jZWxsZWQgKGlzc3VlICMyODg3MDEpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSAnZWRpdCBhIGZpbGUnO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2UhO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSB0b29sIGludm9jYXRpb24gdGhhdCBpcyBzdGlsbCBzdHJlYW1pbmcgcGFydGlhbCBpbnB1dCBmcm9tXG5cdFx0Ly8gdGhlIExNIChlLmcuIGFuIGVkaXQgdG9vbCB3aG9zZSBhcmdzIGFyZSBzdGlsbCBiZWluZyBwcm9kdWNlZCkgd2hlblxuXHRcdC8vIHRoZSB1c2VyIHByZXNzZXMgU3RvcC4gVGhpcyBpcyB0aGUgZXhhY3Qgc2NlbmFyaW8gcmVwb3J0ZWQgaW4gIzI4ODcwMVxuXHRcdC8vIHdoZXJlIHRoZSBcIkVkaXRpbmcgZmlsZXNcIiBzcGlubmVyIHJlbWFpbmVkIGFmdGVyIGNhbmNlbGxhdGlvbi5cblx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IENoYXRUb29sSW52b2NhdGlvbi5jcmVhdGVTdHJlYW1pbmcoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdHRvb2xJZDogJ3JlcGxhY2Vfc3RyaW5nX2luX2ZpbGUnLFxuXHRcdFx0dG9vbERhdGE6IHtcblx0XHRcdFx0aWQ6ICdyZXBsYWNlX3N0cmluZ19pbl9maWxlJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1JlcGxhY2Ugc3RyaW5nIGluIGZpbGUnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1JlcGxhY2UgU3RyaW5nIGluIEZpbGUnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdC8vIFByZS1jb25kaXRpb25zOiB0aGUgdG9vbCBpcyBpbiBTdHJlYW1pbmcgc3RhdGUgKFVJIHN0aWxsIHNob3dzIHNwaW5uZXIpLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodG9vbEludm9jYXRpb24pLCBmYWxzZSk7XG5cblx0XHQvLyBVc2VyIHByZXNzZXMgU3RvcC5cblx0XHRtb2RlbC5jYW5jZWxSZXF1ZXN0KHJlcXVlc3QpO1xuXG5cdFx0Ly8gVGhlIHRvb2wgaW52b2NhdGlvbiBtdXN0IGJlIHRyYW5zaXRpb25lZCBvdXQgb2YgU3RyZWFtaW5nIHNvIHRoYXQgdGhlXG5cdFx0Ly8gdGhpbmtpbmcgY29udGVudCBwYXJ0IHNlZXMgaXQgYXMgY29tcGxldGUgYW5kIGRyb3BzIHRoZSBzcGlubmVyL2xhYmVsLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodG9vbEludm9jYXRpb24pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2Uuc3RhdGUsIFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wbGV0ZWQgdG9vbCBpbnZvY2F0aW9uIGlnbm9yZXMgZHVwbGljYXRlIGNvbXBsZXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBuZXcgQ2hhdFRvb2xJbnZvY2F0aW9uKHsgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGNvbW1hbmQnIH0sIHtcblx0XHRcdGlkOiAncnVuX2luX3Rlcm1pbmFsJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdSdW4gYSBjb21tYW5kJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIGluIFRlcm1pbmFsJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fSwgJ3Rvb2wtY2FsbC0xJywgdW5kZWZpbmVkLCB7fSwge30pO1xuXHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiB7XG5cdFx0XHRcdGlucHV0OiAne30nLFxuXHRcdFx0XHRvdXRwdXQ6IFt7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiAnaVZCT1J3MEtHZ289JywgbWltZVR5cGU6ICdpbWFnZS9wbmcnIH1dLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGxldCBjb21wbGV0ZWROb3RpZmljYXRpb25zID0gMDtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICh0b29sSW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcikudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkKSB7XG5cdFx0XHRcdGNvbXBsZXRlZE5vdGlmaWNhdGlvbnMrKztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCB0b29sSW52b2NhdGlvbi5kaWRFeGVjdXRlVG9vbChyZXN1bHQpO1xuXHRcdGF3YWl0IHRvb2xJbnZvY2F0aW9uLmRpZEV4ZWN1dGVUb29sKHJlc3VsdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkTm90aWZpY2F0aW9ucywgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhc0FjdGl2ZVJlcXVlc3QgcmVmbGVjdHMgbGFzdCByZXF1ZXN0IGlzSW5jb21wbGV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzQWN0aXZlUmVxdWVzdC5nZXQoKSwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgdGV4dCA9ICdoZWxsbyc7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QoeyB0ZXh0LCBwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCB0ZXh0Lmxlbmd0aCwgMSwgdGV4dC5sZW5ndGgpLCB0ZXh0KV0gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmhhc0FjdGl2ZVJlcXVlc3QuZ2V0KCksIHRydWUpO1xuXG5cdFx0cmVxdWVzdC5yZXNwb25zZSEuY29tcGxldGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaGFzQWN0aXZlUmVxdWVzdC5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdE1vZGVsIC0gUGVuZGluZyBSZXF1ZXN0cycsICgpID0+IHtcblx0Y29uc3QgdGVzdERpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9kZWwoKTogQ2hhdE1vZGVsIHtcblx0XHRyZXR1cm4gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNb2RlbCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9XG5cdFx0KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbDogQ2hhdE1vZGVsLCB0ZXh0OiBzdHJpbmcpOiBDaGF0UmVxdWVzdE1vZGVsIHtcblx0XHRyZXR1cm4gbW9kZWwuYWRkUmVxdWVzdChcblx0XHRcdHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sXG5cdFx0XHR7IHZhcmlhYmxlczogW10gfSxcblx0XHRcdDBcblx0XHQpO1xuXHR9XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCBuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRQZW5kaW5nUmVxdWVzdCAtIHF1ZXVlZCBtZXNzYWdlcyBhcmUgYWRkZWQgYXQgdGhlIGVuZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgcmVxdWVzdDEgPSBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgJ2ZpcnN0Jyk7XG5cdFx0Y29uc3QgcmVxdWVzdDIgPSBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgJ3NlY29uZCcpO1xuXG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocmVxdWVzdDEsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QyLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzBdLnJlcXVlc3QuaWQsIHJlcXVlc3QxLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1sxXS5yZXF1ZXN0LmlkLCByZXF1ZXN0Mi5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFBlbmRpbmdSZXF1ZXN0IC0gc3RlZXJpbmcgbWVzc2FnZXMgYXJlIGluc2VydGVkIGJlZm9yZSBxdWV1ZWQgbWVzc2FnZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHF1ZXVlZCA9IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCAncXVldWVkJyk7XG5cdFx0Y29uc3Qgc3RlZXJpbmcgPSBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgJ3N0ZWVyaW5nJyk7XG5cblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChxdWV1ZWQsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHN0ZWVyaW5nLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZywge30pO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdbMF0ucmVxdWVzdC5pZCwgc3RlZXJpbmcuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzBdLmtpbmQsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1sxXS5yZXF1ZXN0LmlkLCBxdWV1ZWQuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzFdLmtpbmQsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFBlbmRpbmdSZXF1ZXN0IC0gbXVsdGlwbGUgc3RlZXJpbmcgbWVzc2FnZXMgbWFpbnRhaW4gb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IFtzdGVlcmluZzEsIHN0ZWVyaW5nMiwgcXVldWVkXSA9IFsnczEnLCAnczInLCAncSddLm1hcCh0ID0+IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCB0KSk7XG5cblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChxdWV1ZWQsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHN0ZWVyaW5nMSwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcsIHt9KTtcblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChzdGVlcmluZzIsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLCB7fSk7XG5cblx0XHRjb25zdCBwZW5kaW5nID0gbW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmcubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1swXS5yZXF1ZXN0LmlkLCBzdGVlcmluZzEuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzFdLnJlcXVlc3QuaWQsIHN0ZWVyaW5nMi5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdbMl0ucmVxdWVzdC5pZCwgcXVldWVkLmlkKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkUGVuZGluZ1JlcXVlc3QgLSBmaXJlcyBvbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cyBldmVudCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCAndGVzdCcpO1xuXG5cdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzKCgpID0+IHsgZXZlbnRGaXJlZCA9IHRydWU7IH0pKTtcblxuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVQZW5kaW5nUmVxdWVzdCAtIHJlbW92ZXMgc3BlY2lmaWVkIHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IFtyZXF1ZXN0MSwgcmVxdWVzdDJdID0gWydyMScsICdyMiddLm1hcCh0ID0+IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCB0KSk7XG5cblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyZXF1ZXN0MSwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB7fSk7XG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocmVxdWVzdDIsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXG5cdFx0bW9kZWwucmVtb3ZlUGVuZGluZ1JlcXVlc3QocmVxdWVzdDEuaWQpO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdbMF0ucmVxdWVzdC5pZCwgcmVxdWVzdDIuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVQZW5kaW5nUmVxdWVzdCAtIG5vLW9wIGZvciBub24tZXhpc3RlbnQgcmVxdWVzdCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCAndGVzdCcpO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMoKCkgPT4geyBldmVudENvdW50Kys7IH0pKTtcblxuXHRcdG1vZGVsLnJlbW92ZVBlbmRpbmdSZXF1ZXN0KCdub24tZXhpc3RlbnQtaWQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZGVxdWV1ZVBlbmRpbmdSZXF1ZXN0IC0gcmV0dXJucyBhbmQgcmVtb3ZlcyBmaXJzdCByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBbcmVxdWVzdDEsIHJlcXVlc3QyXSA9IFsncjEnLCAncjInXS5tYXAodCA9PiBhZGRSZXF1ZXN0VG9Nb2RlbChtb2RlbCwgdCkpO1xuXG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocmVxdWVzdDEsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QyLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblxuXHRcdGNvbnN0IGRlcXVldWVkID0gbW9kZWwuZGVxdWV1ZVBlbmRpbmdSZXF1ZXN0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVxdWV1ZWQ/LnJlcXVlc3QuaWQsIHJlcXVlc3QxLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKClbMF0ucmVxdWVzdC5pZCwgcmVxdWVzdDIuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXF1ZXVlUGVuZGluZ1JlcXVlc3QgLSByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGVtcHR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZGVxdWV1ZVBlbmRpbmdSZXF1ZXN0KCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlcXVldWVQZW5kaW5nUmVxdWVzdCAtIGZpcmVzIGV2ZW50IHdoZW4gcmVxdWVzdCBkZXF1ZXVlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCAndGVzdCcpO1xuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwge30pO1xuXG5cdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzKCgpID0+IHsgZXZlbnRGaXJlZCA9IHRydWU7IH0pKTtcblxuXHRcdG1vZGVsLmRlcXVldWVQZW5kaW5nUmVxdWVzdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhclBlbmRpbmdSZXF1ZXN0cyAtIHJlbW92ZXMgYWxsIHBlbmRpbmcgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdFsncjEnLCAncjInLCAncjMnXS5mb3JFYWNoKHQgPT4ge1xuXHRcdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QoYWRkUmVxdWVzdFRvTW9kZWwobW9kZWwsIHQpLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmNsZWFyUGVuZGluZ1JlcXVlc3RzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJQZW5kaW5nUmVxdWVzdHMgLSBubyBldmVudCB3aGVuIGFscmVhZHkgZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXG5cdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzKCgpID0+IHsgZXZlbnRGaXJlZCA9IHRydWU7IH0pKTtcblxuXHRcdG1vZGVsLmNsZWFyUGVuZGluZ1JlcXVlc3RzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRGaXJlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRQZW5kaW5nUmVxdWVzdHMgLSByZW9yZGVycyBleGlzdGluZyBwZW5kaW5nIHJlcXVlc3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBbcjEsIHIyLCByM10gPSBbJ3IxJywgJ3IyJywgJ3IzJ10ubWFwKHQgPT4gYWRkUmVxdWVzdFRvTW9kZWwobW9kZWwsIHQpKTtcblxuXHRcdG1vZGVsLmFkZFBlbmRpbmdSZXF1ZXN0KHIxLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHt9KTtcblx0XHRtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyMiwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB7fSk7XG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocjMsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLCB7fSk7XG5cblx0XHQvLyBSZXZlcnNlIHRoZSBvcmRlclxuXHRcdG1vZGVsLnNldFBlbmRpbmdSZXF1ZXN0cyhbXG5cdFx0XHR7IHJlcXVlc3RJZDogcjIuaWQsIGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCB9LFxuXHRcdFx0eyByZXF1ZXN0SWQ6IHIxLmlkLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyB9LCAvLyBDaGFuZ2Uga2luZFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdbMF0ucmVxdWVzdC5pZCwgcjIuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzFdLnJlcXVlc3QuaWQsIHIxLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1sxXS5raW5kLCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFBlbmRpbmdSZXF1ZXN0cyAtIGlnbm9yZXMgbm9uLWV4aXN0ZW50IHJlcXVlc3QgSURzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYWRkUmVxdWVzdFRvTW9kZWwobW9kZWwsICd0ZXN0Jyk7XG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocmVxdWVzdCwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB7fSk7XG5cblx0XHRtb2RlbC5zZXRQZW5kaW5nUmVxdWVzdHMoW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdub24tZXhpc3RlbnQnLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQgfSxcblx0XHRcdHsgcmVxdWVzdElkOiByZXF1ZXN0LmlkLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQgfSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nWzBdLnJlcXVlc3QuaWQsIHJlcXVlc3QuaWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwZW5kaW5nIHJlcXVlc3RzIHByZXNlcnZlIHNlbmQgb3B0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IGFkZFJlcXVlc3RUb01vZGVsKG1vZGVsLCAndGVzdCcpO1xuXHRcdGNvbnN0IHNlbmRPcHRpb25zID0geyBhZ2VudElkOiAndGVzdC1hZ2VudCcsIGF0dGVtcHQ6IDMgfTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBtb2RlbC5hZGRQZW5kaW5nUmVxdWVzdChyZXF1ZXN0LCBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHNlbmRPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nLnNlbmRPcHRpb25zLmFnZW50SWQsICd0ZXN0LWFnZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmcuc2VuZE9wdGlvbnMuYXR0ZW1wdCwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlbmRpbmcgcmVxdWVzdHMgcmVzdG9yZSBpbnN0cnVjdGlvbiBjb250ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYWRkUmVxdWVzdFRvTW9kZWwobW9kZWwsICd0ZXN0Jyk7XG5cdFx0Y29uc3QgZW5hYmxlZFRvb2xzID0geyB0b29sMTogdHJ1ZSB9O1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWREYXRhID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShtb2RlbC50b0pTT04oKSkpIGFzIElTZXJpYWxpemFibGVDaGF0RGF0YTM7XG5cdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3QgPSB7IC4uLnNlcmlhbGl6ZWREYXRhLnJlcXVlc3RzWzBdLCByZXNwb25zZTogdW5kZWZpbmVkLCByZXN1bHQ6IHVuZGVmaW5lZCB9O1xuXHRcdHNlcmlhbGl6ZWREYXRhLnJlcXVlc3RzID0gW107XG5cdFx0c2VyaWFsaXplZERhdGEucGVuZGluZ1JlcXVlc3RzID0gW3tcblx0XHRcdGlkOiByZXF1ZXN0LmlkLFxuXHRcdFx0cmVxdWVzdDogcGVuZGluZ1JlcXVlc3QsXG5cdFx0XHRraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyxcblx0XHRcdHNlbmRPcHRpb25zOiBzZXJpYWxpemVTZW5kT3B0aW9ucyh7XG5cdFx0XHRcdGluc3RydWN0aW9uQ29udGV4dDogeyBtb2RlS2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LCBlbmFibGVkVG9vbHMgfSxcblx0XHRcdH0pLFxuXHRcdH1dO1xuXG5cdFx0Y29uc3QgcmVzdG9yZWRNb2RlbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TW9kZWwsXG5cdFx0XHR7IHZhbHVlOiBzZXJpYWxpemVkRGF0YSwgc2VyaWFsaXplcjogdW5kZWZpbmVkISB9LFxuXHRcdFx0eyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH1cblx0XHQpKTtcblx0XHRjb25zdCByZXN0b3JlZE9wdGlvbnMgPSByZXN0b3JlZE1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpWzBdLnNlbmRPcHRpb25zO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkT3B0aW9ucy5pbnN0cnVjdGlvbkNvbnRleHQ/Lm1vZGVLaW5kLCBDaGF0TW9kZUtpbmQuQWdlbnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdG9yZWRPcHRpb25zLmluc3RydWN0aW9uQ29udGV4dD8uZW5hYmxlZFRvb2xzLCBlbmFibGVkVG9vbHMpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnc2VyaWFsaXplU2VuZE9wdGlvbnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyByZXF1ZXN0LXNjb3BlZCBvcHRpb25zIHRocm91Z2ggcGVyc2lzdC9yZXN0b3JlJywgKCkgPT4ge1xuXHRcdC8vIEEgcGVuZGluZy9xdWV1ZWQgcmVxdWVzdCBpcyBzZXJpYWxpemVkIGFuZCBsYXRlciByZXN0b3JlZCAoZS5nLiB3aW5kb3dcblx0XHQvLyByZWxvYWQpLiBUaGUgZWRpdG9yLXNjb3BlZCBtb2RlbCBjb25maWd1cmF0aW9uIG11c3Qgcm91bmQtdHJpcCwgb3RoZXJ3aXNlXG5cdFx0Ly8gdGhlIHJlc3RvcmVkIHJlcXVlc3QgZmFsbHMgYmFjayB0byB0aGUgcHJvZmlsZS1nbG9iYWwgdmFsdWUuXG5cdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHNlcmlhbGl6ZVNlbmRPcHRpb25zKHtcblx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6ICdjb3BpbG90L2dwdCcsXG5cdFx0XHR1c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb246IHsgdGhpbmtpbmdFZmZvcnQ6ICdoaWdoJywgY29udGV4dFNpemU6IDIwMDAgfSxcblx0XHRcdGlzVm9pY2VNb2RlSW5wdXQ6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGVsQ29uZmlndXJhdGlvbjogc2VyaWFsaXplZC51c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb24sXG5cdFx0XHRpc1ZvaWNlTW9kZUlucHV0OiBzZXJpYWxpemVkLmlzVm9pY2VNb2RlSW5wdXQsXG5cdFx0fSwge1xuXHRcdFx0bW9kZWxDb25maWd1cmF0aW9uOiB7IHRoaW5raW5nRWZmb3J0OiAnaGlnaCcsIGNvbnRleHRTaXplOiAyMDAwIH0sXG5cdFx0XHRpc1ZvaWNlTW9kZUlucHV0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFJlc3BvbnNlUmVzb3VyY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NyZWF0ZVVyaSByb3VuZHRyaXBzIHRocm91Z2ggcGFyc2VVcmkgd2l0aG91dCBiYXNlbmFtZScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC9zZXNzaW9uMScpO1xuXHRcdGNvbnN0IHVyaSA9IENoYXRSZXNwb25zZVJlc291cmNlLmNyZWF0ZVVyaShzZXNzaW9uUmVzb3VyY2UsICdjYWxsLTEyMycsIDIpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IENoYXRSZXNwb25zZVJlc291cmNlLnBhcnNlVXJpKHVyaSk7XG5cblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC50b29sQ2FsbElkLCAnY2FsbC0xMjMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmluZGV4LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlVXJpIHJvdW5kdHJpcHMgdGhyb3VnaCBwYXJzZVVyaSB3aXRoIGJhc2VuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2xvY2FsL3Nlc3Npb24xJyk7XG5cdFx0Y29uc3QgdXJpID0gQ2hhdFJlc3BvbnNlUmVzb3VyY2UuY3JlYXRlVXJpKHNlc3Npb25SZXNvdXJjZSwgJ2NhbGwtNDU2JywgMCwgJ2ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgcGFyc2VkID0gQ2hhdFJlc3BvbnNlUmVzb3VyY2UucGFyc2VVcmkodXJpKTtcblxuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLnRvb2xDYWxsSWQsICdjYWxsLTQ1NicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuaW5kZXgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVVyaSByZWplY3RzIHBhdGhzIHdpdGggZmV3ZXIgdGhhbiA0IHNlZ21lbnRzJywgKCkgPT4ge1xuXHRcdC8vIHBhdGggXCIvdG9vbC9jYWxsSWQvMFwiIHNwbGl0cyBpbnRvIFsnJywgJ3Rvb2wnLCAnY2FsbElkJywgJzAnXSA9IDQgcGFydHMgPT4gdmFsaWRcblx0XHQvLyBwYXRoIFwiL3Rvb2wvY2FsbElkXCIgc3BsaXRzIGludG8gWycnLCAndG9vbCcsICdjYWxsSWQnXSA9IDMgcGFydHMgPT4gaW52YWxpZFxuXHRcdGNvbnN0IGJhc2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQ2hhdFJlc3BvbnNlUmVzb3VyY2Uuc2NoZW1lLCBhdXRob3JpdHk6ICdhYmMnLCBwYXRoOiAnL3Rvb2wvY2FsbElkJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQ2hhdFJlc3BvbnNlUmVzb3VyY2UucGFyc2VVcmkoYmFzZSksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB0b29TaG9ydCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBDaGF0UmVzcG9uc2VSZXNvdXJjZS5zY2hlbWUsIGF1dGhvcml0eTogJ2FiYycsIHBhdGg6ICcvdG9vbCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRSZXNwb25zZVJlc291cmNlLnBhcnNlVXJpKHRvb1Nob3J0KSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGVtcHR5ID0gVVJJLmZyb20oeyBzY2hlbWU6IENoYXRSZXNwb25zZVJlc291cmNlLnNjaGVtZSwgYXV0aG9yaXR5OiAnYWJjJywgcGF0aDogJy8nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChDaGF0UmVzcG9uc2VSZXNvdXJjZS5wYXJzZVVyaShlbXB0eSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlVXJpIHJlamVjdHMgd3Jvbmcgc2NoZW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvdG9vbC9jYWxsSWQvMCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRSZXNwb25zZVJlc291cmNlLnBhcnNlVXJpKHVyaSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlVXJpIHJlamVjdHMgd3Jvbmcga2luZCcsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogQ2hhdFJlc3BvbnNlUmVzb3VyY2Uuc2NoZW1lLCBhdXRob3JpdHk6ICdhYmMnLCBwYXRoOiAnL25vdFRvb2wvY2FsbElkLzAnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChDaGF0UmVzcG9uc2VSZXNvdXJjZS5wYXJzZVVyaSh1cmkpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksV0FBVztBQUN2QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQiwwQkFBMEI7QUFDekQsU0FBUyxlQUFlO0FBRXhCLFNBQVMsa0JBQWtCLHlCQUF5QjtBQUNwRCxTQUFTLFdBQTZCLHNCQUFzQiw4QkFBbUwseUJBQXlCLDJCQUEyQiwrQkFBK0IsVUFBVSxzQkFBc0IsNEJBQTRCO0FBQzlYLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCLGNBQTBELHFCQUFxQiwwQkFBMEI7QUFDeEksU0FBc0Isc0JBQXNCO0FBQzVDLFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLGFBQWEsTUFBTTtBQUN4QixRQUFNLGtCQUFrQix3Q0FBd0M7QUFFaEUsTUFBSTtBQUVKLFFBQU0sWUFBWTtBQUNqQiwyQkFBdUIsZ0JBQWdCLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUN6RSx5QkFBcUIsS0FBSyxpQkFB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
