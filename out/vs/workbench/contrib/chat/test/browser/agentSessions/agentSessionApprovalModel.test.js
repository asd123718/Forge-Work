import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { agentSessionApprovalId, AgentSessionApprovalModel } from "../../../browser/agentSessions/agentSessionApprovalModel.js";
import { MockChatModel } from "../../common/model/mockChatModel.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
function makeToolInvocationPart(options) {
  return {
    kind: "toolInvocation",
    presentation: void 0,
    originMessage: void 0,
    invocationMessage: options.invocationMessage ?? "Running tool...",
    pastTenseMessage: void 0,
    source: void 0,
    toolId: "test-tool",
    toolCallId: options.toolCallId ?? "call-1",
    state: observableValue("toolState", options.state),
    toolSpecificData: options.toolSpecificData,
    toolSpecificDataKind: observableValue("test", options.toolSpecificData?.kind),
    isAttachedToThinking: false,
    toJSON: () => void 0
  };
}
function makeTerminalToolData(overrides) {
  return {
    kind: "terminal",
    commandLine: { original: "echo hello" },
    language: "sh",
    ...overrides
  };
}
function makeWaitingState(confirm) {
  return {
    type: IChatToolInvocation.StateKind.WaitingForConfirmation,
    parameters: {},
    confirm: confirm ?? (() => {
    })
  };
}
function makePostApprovalState(confirm) {
  return {
    type: IChatToolInvocation.StateKind.WaitingForPostApproval,
    parameters: {},
    confirmed: { type: ToolConfirmKind.UserAction },
    resultDetails: void 0,
    confirm: confirm ?? (() => {
    }),
    contentForModel: []
  };
}
function makeExecutingState() {
  return {
    type: IChatToolInvocation.StateKind.Executing,
    parameters: {},
    confirmed: { type: ToolConfirmKind.UserAction },
    progress: observableValue("progress", { message: void 0, progress: void 0 })
  };
}
function mockModelWithResponse(model, parts) {
  const response = {
    response: { value: parts, getMarkdown: () => "", getFinalResponse: () => "", toString: () => "" }
  };
  const request = {
    response
  };
  model.lastRequest = request;
}
class MockLanguageService {
  getLanguageIdByLanguageName(name) {
    switch (name) {
      case "bash":
        return "sh";
      case "python":
        return "python";
      case "powershell":
        return "pwsh";
      default:
        return name;
    }
  }
}
suite("AgentSessionApprovalModel", () => {
  const disposables = new DisposableStore();
  let chatService;
  let chatModelsObs;
  let langservice;
  setup(() => {
    chatService = new MockChatService();
    langservice = new MockLanguageService();
    chatModelsObs = chatService.chatModels;
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createModel() {
    const model = new AgentSessionApprovalModel(chatService, langservice);
    disposables.add(model);
    return model;
  }
  function addChatModel(uri) {
    const chatModel = disposables.add(new MockChatModel(uri ?? URI.parse(`test://session/${Math.random()}`)));
    chatModelsObs.set([...Array.from(chatModelsObs.get()), chatModel], void 0);
    return chatModel;
  }
  function getApproval(approvalModel, chatModel) {
    return approvalModel.getApproval(chatModel.sessionResource).get();
  }
  test("returns undefined when no models exist", () => {
    const approvalModel = createModel();
    const result = approvalModel.getApproval(URI.parse("test://nonexistent")).get();
    assert.strictEqual(result, void 0);
  });
  test("returns undefined when model has no requestNeedsInput", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("returns undefined when requestNeedsInput is set but no response exists", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("returns undefined when response has no tool invocation parts", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    mockModelWithResponse(chatModel, []);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("returns undefined when tool invocation is in Executing state", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({ state: makeExecutingState() });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("returns approval info for WaitingForConfirmation state with terminal data", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "echo hello",
      language: "sh"
    });
  });
  test("returns approval info for WaitingForPostApproval state", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makePostApprovalState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "npm install" } })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "npm install",
      language: "sh"
    });
  });
  test("prefers presentationOverrides.commandLine and language", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({
        commandLine: { original: 'python -c "print(1)"' },
        language: "sh",
        presentationOverrides: { commandLine: "print(1)", language: "python" }
      })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "print(1)",
      language: "python"
    });
  });
  test("uses forDisplay from commandLine when available", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({
        commandLine: { original: "echo raw", forDisplay: "echo display" }
      })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "echo display");
  });
  test("uses userEdited from commandLine when forDisplay is not set", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({
        commandLine: { original: "orig", userEdited: "user-edited" }
      })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "user-edited");
  });
  test("uses toolEdited from commandLine as fallback", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({
        commandLine: { original: "orig", toolEdited: "tool-edited" }
      })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "tool-edited");
  });
  test("uses needsInput.detail when tool is not terminal", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({ state: makeWaitingState() });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test", detail: "Custom detail message" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "Custom detail message",
      language: void 0
    });
  });
  test("uses invocationMessage string when no terminal data and no detail", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      invocationMessage: "Searching files..."
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "Searching files...",
      language: void 0
    });
  });
  test("uses invocationMessage MarkdownString when no terminal data and no detail", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      invocationMessage: new MarkdownString("**Running** tool")
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "Running tool");
  });
  test("confirm() delegates to tool state confirm with UserAction", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    let confirmedWith;
    const part = makeToolInvocationPart({
      state: makeWaitingState((reason) => {
        confirmedWith = reason;
      }),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    getApproval(approvalModel, chatModel)?.confirm();
    assert.deepStrictEqual(confirmedWith, { type: ToolConfirmKind.UserAction });
  });
  test("reacts to requestNeedsInput becoming undefined", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.ok(getApproval(approvalModel, chatModel));
    chatModel.requestNeedsInput.set(void 0, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("reacts to tool state changing from waiting to executing", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const stateObs = observableValue("toolState", makeWaitingState());
    const part = {
      ...makeToolInvocationPart({ state: makeWaitingState(), toolSpecificData: makeTerminalToolData() }),
      state: stateObs
    };
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.ok(getApproval(approvalModel, chatModel));
    stateObs.set(makeExecutingState(), void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("tracks multiple models independently", () => {
    const approvalModel = createModel();
    const chatModel1 = addChatModel(URI.parse("test://session/1"));
    const chatModel2 = addChatModel(URI.parse("test://session/2"));
    const part1 = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "cmd1" } })
    });
    mockModelWithResponse(chatModel1, [part1]);
    chatModel1.requestNeedsInput.set({ title: "Session 1" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel1)?.label, "cmd1");
    assert.strictEqual(getApproval(approvalModel, chatModel2), void 0);
  });
  test("clears approval when model is removed", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.ok(getApproval(approvalModel, chatModel));
    chatModelsObs.set([], void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
  test("keeps approval identity stable when a chat model reloads", () => {
    const approvalModel = createModel();
    const uri = URI.parse("test://session/reloaded");
    const firstModel = addChatModel(uri);
    mockModelWithResponse(firstModel, [makeToolInvocationPart({ state: makeWaitingState(), toolCallId: "stable-call" })]);
    firstModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const firstId = agentSessionApprovalId(getApproval(approvalModel, firstModel));
    chatModelsObs.set([], void 0);
    const restoredModel = addChatModel(uri);
    mockModelWithResponse(restoredModel, [makeToolInvocationPart({ state: makeWaitingState(), toolCallId: "stable-call" })]);
    restoredModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.deepStrictEqual([firstId, agentSessionApprovalId(getApproval(approvalModel, restoredModel))], ["stable-call", "stable-call"]);
  });
  test("picks the first WaitingForConfirmation part when multiple parts exist", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const executingPart = makeToolInvocationPart({ state: makeExecutingState() });
    const waitingPart = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "second-cmd" } })
    });
    mockModelWithResponse(chatModel, [executingPart, waitingPart]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "second-cmd");
  });
  test("handles model added after approval model is created", () => {
    const approvalModel = createModel();
    const uri = URI.parse("test://session/late");
    assert.strictEqual(approvalModel.getApproval(uri).get(), void 0);
    const chatModel = addChatModel(uri);
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "late-cmd" } })
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "late-cmd");
  });
  test("handles legacy terminal tool data", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const legacyData = { kind: "terminal", command: "legacy-cmd", language: "bash" };
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: legacyData
    });
    mockModelWithResponse(chatModel, [part]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    const result = getApproval(approvalModel, chatModel);
    assert.deepStrictEqual({
      label: result?.label,
      language: result?.languageId
    }, {
      label: "legacy-cmd",
      language: "sh"
    });
  });
  test("observable is reused for the same session resource", () => {
    const approvalModel = createModel();
    const uri = URI.parse("test://session/same");
    const obs1 = approvalModel.getApproval(uri);
    const obs2 = approvalModel.getApproval(uri);
    assert.strictEqual(obs1, obs2);
  });
  test("skips non-toolInvocation parts", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const markdownPart = { kind: "markdownContent", content: new MarkdownString("hello") };
    const waitingPart = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData({ commandLine: { original: "the-cmd" } })
    });
    mockModelWithResponse(chatModel, [markdownPart, waitingPart]);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel)?.label, "the-cmd");
  });
  test("updating requestNeedsInput triggers re-evaluation", () => {
    const approvalModel = createModel();
    const chatModel = addChatModel();
    const part = makeToolInvocationPart({
      state: makeWaitingState(),
      toolSpecificData: makeTerminalToolData()
    });
    mockModelWithResponse(chatModel, [part]);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
    chatModel.requestNeedsInput.set({ title: "Test" }, void 0);
    assert.ok(getApproval(approvalModel, chatModel));
    chatModel.requestNeedsInput.set(void 0, void 0);
    assert.strictEqual(getApproval(approvalModel, chatModel), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgYWdlbnRTZXNzaW9uQXBwcm92YWxJZCwgQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCwgSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbW9ja0NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvbW9ja0NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIFRvb2xDb25maXJtS2luZCwgQ29uZmlybWVkUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0UmVxdWVzdE1vZGVsLCBJQ2hhdFJlc3BvbnNlTW9kZWwsIElSZXNwb25zZSwgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcblxuZnVuY3Rpb24gbWFrZVRvb2xJbnZvY2F0aW9uUGFydChvcHRpb25zOiB7XG5cdHN0YXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlO1xuXHR0b29sU3BlY2lmaWNEYXRhPzogSUNoYXRUb29sSW52b2NhdGlvblsndG9vbFNwZWNpZmljRGF0YSddO1xuXHRpbnZvY2F0aW9uTWVzc2FnZT86IHN0cmluZyB8IE1hcmtkb3duU3RyaW5nO1xuXHR0b29sQ2FsbElkPzogc3RyaW5nO1xufSk6IElDaGF0VG9vbEludm9jYXRpb24ge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicsXG5cdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQhLFxuXHRcdG9yaWdpbk1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRpbnZvY2F0aW9uTWVzc2FnZTogb3B0aW9ucy5pbnZvY2F0aW9uTWVzc2FnZSA/PyAnUnVubmluZyB0b29sLi4uJyxcblx0XHRwYXN0VGVuc2VNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0c291cmNlOiB1bmRlZmluZWQhLFxuXHRcdHRvb2xJZDogJ3Rlc3QtdG9vbCcsXG5cdFx0dG9vbENhbGxJZDogb3B0aW9ucy50b29sQ2FsbElkID8/ICdjYWxsLTEnLFxuXHRcdHN0YXRlOiBvYnNlcnZhYmxlVmFsdWUoJ3Rvb2xTdGF0ZScsIG9wdGlvbnMuc3RhdGUpLFxuXHRcdHRvb2xTcGVjaWZpY0RhdGE6IG9wdGlvbnMudG9vbFNwZWNpZmljRGF0YSxcblx0XHR0b29sU3BlY2lmaWNEYXRhS2luZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0Jywgb3B0aW9ucy50b29sU3BlY2lmaWNEYXRhPy5raW5kKSxcblx0XHRpc0F0dGFjaGVkVG9UaGlua2luZzogZmFsc2UsXG5cdFx0dG9KU09OOiAoKSA9PiB1bmRlZmluZWQhLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlVGVybWluYWxUb29sRGF0YShvdmVycmlkZXM/OiBQYXJ0aWFsPElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE+KTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ2VjaG8gaGVsbG8nIH0sXG5cdFx0bGFuZ3VhZ2U6ICdzaCcsXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlV2FpdGluZ1N0YXRlKGNvbmZpcm0/OiAocmVhc29uOiBDb25maXJtZWRSZWFzb24pID0+IHZvaWQpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdHBhcmFtZXRlcnM6IHt9LFxuXHRcdGNvbmZpcm06IGNvbmZpcm0gPz8gKCgpID0+IHsgfSksXG5cdH0gYXMgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZTtcbn1cblxuZnVuY3Rpb24gbWFrZVBvc3RBcHByb3ZhbFN0YXRlKGNvbmZpcm0/OiAocmVhc29uOiBDb25maXJtZWRSZWFzb24pID0+IHZvaWQpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsLFxuXHRcdHBhcmFtZXRlcnM6IHt9LFxuXHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9LFxuXHRcdHJlc3VsdERldGFpbHM6IHVuZGVmaW5lZCxcblx0XHRjb25maXJtOiBjb25maXJtID8/ICgoKSA9PiB7IH0pLFxuXHRcdGNvbnRlbnRGb3JNb2RlbDogW10sXG5cdH0gYXMgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZTtcbn1cblxuZnVuY3Rpb24gbWFrZUV4ZWN1dGluZ1N0YXRlKCk6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSxcblx0XHRwcm9ncmVzczogb2JzZXJ2YWJsZVZhbHVlKCdwcm9ncmVzcycsIHsgbWVzc2FnZTogdW5kZWZpbmVkLCBwcm9ncmVzczogdW5kZWZpbmVkIH0pLFxuXHR9IGFzIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU7XG59XG5cbi8qKiBDcmVhdGVzIGEgbWluaW1hbCBtb2NrIHRoYXQgc2F0aXNmaWVzIHRoZSByZXNwb25zZSBjaGFpbjogbGFzdFJlcXVlc3QucmVzcG9uc2UucmVzcG9uc2UudmFsdWUgKi9cbmZ1bmN0aW9uIG1vY2tNb2RlbFdpdGhSZXNwb25zZShtb2RlbDogTW9ja0NoYXRNb2RlbCwgcGFydHM6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnRbXSk6IHZvaWQge1xuXHRjb25zdCByZXNwb25zZTogUGFydGlhbDxJQ2hhdFJlc3BvbnNlTW9kZWw+ID0ge1xuXHRcdHJlc3BvbnNlOiB7IHZhbHVlOiBwYXJ0cywgZ2V0TWFya2Rvd246ICgpID0+ICcnLCBnZXRGaW5hbFJlc3BvbnNlOiAoKSA9PiAnJywgdG9TdHJpbmc6ICgpID0+ICcnIH0gc2F0aXNmaWVzIElSZXNwb25zZSxcblx0fTtcblx0Y29uc3QgcmVxdWVzdDogUGFydGlhbDxJQ2hhdFJlcXVlc3RNb2RlbD4gPSB7XG5cdFx0cmVzcG9uc2U6IHJlc3BvbnNlIGFzIElDaGF0UmVzcG9uc2VNb2RlbCxcblx0fTtcblx0KG1vZGVsIGFzIHsgbGFzdFJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkIH0pLmxhc3RSZXF1ZXN0ID0gcmVxdWVzdCBhcyBJQ2hhdFJlcXVlc3RNb2RlbDtcbn1cblxuY2xhc3MgTW9ja0xhbmd1YWdlU2VydmljZSB7XG5cdGdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAobmFtZSkge1xuXHRcdFx0Y2FzZSAnYmFzaCc6IHJldHVybiAnc2gnO1xuXHRcdFx0Y2FzZSAncHl0aG9uJzogcmV0dXJuICdweXRob24nO1xuXHRcdFx0Y2FzZSAncG93ZXJzaGVsbCc6IHJldHVybiAncHdzaCc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gbmFtZTtcblx0XHR9XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBjaGF0U2VydmljZTogTW9ja0NoYXRTZXJ2aWNlO1xuXHRsZXQgY2hhdE1vZGVsc09iczogSVNldHRhYmxlT2JzZXJ2YWJsZTxJdGVyYWJsZTxJQ2hhdE1vZGVsPj47XG5cdGxldCBsYW5nc2VydmljZTogTW9ja0xhbmd1YWdlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y2hhdFNlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXJ2aWNlKCk7XG5cdFx0bGFuZ3NlcnZpY2UgPSBuZXcgTW9ja0xhbmd1YWdlU2VydmljZSgpO1xuXHRcdGNoYXRNb2RlbHNPYnMgPSBjaGF0U2VydmljZS5jaGF0TW9kZWxzIGFzIElTZXR0YWJsZU9ic2VydmFibGU8SXRlcmFibGU8SUNoYXRNb2RlbD4+O1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9kZWwoKTogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbChjaGF0U2VydmljZSwgbGFuZ3NlcnZpY2UgYXMgSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRmdW5jdGlvbiBhZGRDaGF0TW9kZWwodXJpPzogVVJJKTogTW9ja0NoYXRNb2RlbCB7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQ2hhdE1vZGVsKHVyaSA/PyBVUkkucGFyc2UoYHRlc3Q6Ly9zZXNzaW9uLyR7TWF0aC5yYW5kb20oKX1gKSkpO1xuXHRcdGNoYXRNb2RlbHNPYnMuc2V0KFsuLi5BcnJheS5mcm9tKGNoYXRNb2RlbHNPYnMuZ2V0KCkpLCBjaGF0TW9kZWxdLCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiBjaGF0TW9kZWw7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWw6IE1vY2tDaGF0TW9kZWwpOiBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gYXBwcm92YWxNb2RlbC5nZXRBcHByb3ZhbChjaGF0TW9kZWwuc2Vzc2lvblJlc291cmNlKS5nZXQoKTtcblx0fVxuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gbW9kZWxzIGV4aXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGFwcHJvdmFsTW9kZWwuZ2V0QXBwcm92YWwoVVJJLnBhcnNlKCd0ZXN0Oi8vbm9uZXhpc3RlbnQnKSkuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBtb2RlbCBoYXMgbm8gcmVxdWVzdE5lZWRzSW5wdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gcmVxdWVzdE5lZWRzSW5wdXQgaXMgc2V0IGJ1dCBubyByZXNwb25zZSBleGlzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiByZXNwb25zZSBoYXMgbm8gdG9vbCBpbnZvY2F0aW9uIHBhcnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRvb2wgaW52b2NhdGlvbiBpcyBpbiBFeGVjdXRpbmcgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7IHN0YXRlOiBtYWtlRXhlY3V0aW5nU3RhdGUoKSB9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhcHByb3ZhbCBpbmZvIGZvciBXYWl0aW5nRm9yQ29uZmlybWF0aW9uIHN0YXRlIHdpdGggdGVybWluYWwgZGF0YScsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSgpLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogcmVzdWx0Py5sYWJlbCxcblx0XHRcdGxhbmd1YWdlOiByZXN1bHQ/Lmxhbmd1YWdlSWQsXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdlY2hvIGhlbGxvJyxcblx0XHRcdGxhbmd1YWdlOiAnc2gnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFwcHJvdmFsIGluZm8gZm9yIFdhaXRpbmdGb3JQb3N0QXBwcm92YWwgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVBvc3RBcHByb3ZhbFN0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSh7IGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnbnBtIGluc3RhbGwnIH0gfSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiByZXN1bHQ/LmxhYmVsLFxuXHRcdFx0bGFuZ3VhZ2U6IHJlc3VsdD8ubGFuZ3VhZ2VJZCxcblx0XHR9LCB7XG5cdFx0XHRsYWJlbDogJ25wbSBpbnN0YWxsJyxcblx0XHRcdGxhbmd1YWdlOiAnc2gnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmZXJzIHByZXNlbnRhdGlvbk92ZXJyaWRlcy5jb21tYW5kTGluZSBhbmQgbGFuZ3VhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoe1xuXHRcdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ3B5dGhvbiAtYyBcInByaW50KDEpXCInIH0sXG5cdFx0XHRcdGxhbmd1YWdlOiAnc2gnLFxuXHRcdFx0XHRwcmVzZW50YXRpb25PdmVycmlkZXM6IHsgY29tbWFuZExpbmU6ICdwcmludCgxKScsIGxhbmd1YWdlOiAncHl0aG9uJyB9LFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiByZXN1bHQ/LmxhYmVsLFxuXHRcdFx0bGFuZ3VhZ2U6IHJlc3VsdD8ubGFuZ3VhZ2VJZCxcblx0XHR9LCB7XG5cdFx0XHRsYWJlbDogJ3ByaW50KDEpJyxcblx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBmb3JEaXNwbGF5IGZyb20gY29tbWFuZExpbmUgd2hlbiBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoe1xuXHRcdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ2VjaG8gcmF3JywgZm9yRGlzcGxheTogJ2VjaG8gZGlzcGxheScgfSxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpPy5sYWJlbCwgJ2VjaG8gZGlzcGxheScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHVzZXJFZGl0ZWQgZnJvbSBjb21tYW5kTGluZSB3aGVuIGZvckRpc3BsYXkgaXMgbm90IHNldCcsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSh7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnb3JpZycsIHVzZXJFZGl0ZWQ6ICd1c2VyLWVkaXRlZCcgfSxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpPy5sYWJlbCwgJ3VzZXItZWRpdGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdG9vbEVkaXRlZCBmcm9tIGNvbW1hbmRMaW5lIGFzIGZhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgcGFydCA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoe1xuXHRcdFx0c3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG1ha2VUZXJtaW5hbFRvb2xEYXRhKHtcblx0XHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICdvcmlnJywgdG9vbEVkaXRlZDogJ3Rvb2wtZWRpdGVkJyB9LFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk/LmxhYmVsLCAndG9vbC1lZGl0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBuZWVkc0lucHV0LmRldGFpbCB3aGVuIHRvb2wgaXMgbm90IHRlcm1pbmFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGFkZENoYXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgcGFydCA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoeyBzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpIH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcsIGRldGFpbDogJ0N1c3RvbSBkZXRhaWwgbWVzc2FnZScgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogcmVzdWx0Py5sYWJlbCxcblx0XHRcdGxhbmd1YWdlOiByZXN1bHQ/Lmxhbmd1YWdlSWQsXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdDdXN0b20gZGV0YWlsIG1lc3NhZ2UnLFxuXHRcdFx0bGFuZ3VhZ2U6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBpbnZvY2F0aW9uTWVzc2FnZSBzdHJpbmcgd2hlbiBubyB0ZXJtaW5hbCBkYXRhIGFuZCBubyBkZXRhaWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2hpbmcgZmlsZXMuLi4nLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogcmVzdWx0Py5sYWJlbCxcblx0XHRcdGxhbmd1YWdlOiByZXN1bHQ/Lmxhbmd1YWdlSWQsXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdTZWFyY2hpbmcgZmlsZXMuLi4nLFxuXHRcdFx0bGFuZ3VhZ2U6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBpbnZvY2F0aW9uTWVzc2FnZSBNYXJrZG93blN0cmluZyB3aGVuIG5vIHRlcm1pbmFsIGRhdGEgYW5kIG5vIGRldGFpbCcsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHtcblx0XHRcdHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKCcqKlJ1bm5pbmcqKiB0b29sJyksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW3BhcnRdKTtcblx0XHRjaGF0TW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuc2V0KHsgdGl0bGU6ICdUZXN0JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk/LmxhYmVsLCAnUnVubmluZyB0b29sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpcm0oKSBkZWxlZ2F0ZXMgdG8gdG9vbCBzdGF0ZSBjb25maXJtIHdpdGggVXNlckFjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGxldCBjb25maXJtZWRXaXRoOiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGFydCA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoe1xuXHRcdFx0c3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUocmVhc29uID0+IHsgY29uZmlybWVkV2l0aCA9IHJlYXNvbjsgfSksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBtYWtlVGVybWluYWxUb29sRGF0YSgpLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCk/LmNvbmZpcm0oKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpcm1lZFdpdGgsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWN0cyB0byByZXF1ZXN0TmVlZHNJbnB1dCBiZWNvbWluZyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoKSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCkpO1xuXG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWN0cyB0byB0b29sIHN0YXRlIGNoYW5naW5nIGZyb20gd2FpdGluZyB0byBleGVjdXRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBzdGF0ZU9icyA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPigndG9vbFN0YXRlJywgbWFrZVdhaXRpbmdTdGF0ZSgpKTtcblx0XHRjb25zdCBwYXJ0OiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0Li4ubWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7IHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksIHRvb2xTcGVjaWZpY0RhdGE6IG1ha2VUZXJtaW5hbFRvb2xEYXRhKCkgfSksXG5cdFx0XHRzdGF0ZTogc3RhdGVPYnMsXG5cdFx0fTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCkpO1xuXG5cdFx0c3RhdGVPYnMuc2V0KG1ha2VFeGVjdXRpbmdTdGF0ZSgpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFja3MgbXVsdGlwbGUgbW9kZWxzIGluZGVwZW5kZW50bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsMSA9IGFkZENoYXRNb2RlbChVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLzEnKSk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsMiA9IGFkZENoYXRNb2RlbChVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLzInKSk7XG5cblx0XHRjb25zdCBwYXJ0MSA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoe1xuXHRcdFx0c3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG1ha2VUZXJtaW5hbFRvb2xEYXRhKHsgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICdjbWQxJyB9IH0pLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwxLCBbcGFydDFdKTtcblx0XHRjaGF0TW9kZWwxLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnU2Vzc2lvbiAxJyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbDEpPy5sYWJlbCwgJ2NtZDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsMiksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFycyBhcHByb3ZhbCB3aGVuIG1vZGVsIGlzIHJlbW92ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoKSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGdldEFwcHJvdmFsKGFwcHJvdmFsTW9kZWwsIGNoYXRNb2RlbCkpO1xuXG5cdFx0Ly8gUmVtb3ZlIG1vZGVsIGZyb20gY2hhdE1vZGVsc1xuXHRcdGNoYXRNb2RlbHNPYnMuc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBhcHByb3ZhbCBpZGVudGl0eSBzdGFibGUgd2hlbiBhIGNoYXQgbW9kZWwgcmVsb2FkcycsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uL3JlbG9hZGVkJyk7XG5cdFx0Y29uc3QgZmlyc3RNb2RlbCA9IGFkZENoYXRNb2RlbCh1cmkpO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShmaXJzdE1vZGVsLCBbbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7IHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksIHRvb2xDYWxsSWQ6ICdzdGFibGUtY2FsbCcgfSldKTtcblx0XHRmaXJzdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBmaXJzdElkID0gYWdlbnRTZXNzaW9uQXBwcm92YWxJZChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBmaXJzdE1vZGVsKSEpO1xuXG5cdFx0Y2hhdE1vZGVsc09icy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcmVzdG9yZWRNb2RlbCA9IGFkZENoYXRNb2RlbCh1cmkpO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShyZXN0b3JlZE1vZGVsLCBbbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7IHN0YXRlOiBtYWtlV2FpdGluZ1N0YXRlKCksIHRvb2xDYWxsSWQ6ICdzdGFibGUtY2FsbCcgfSldKTtcblx0XHRyZXN0b3JlZE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2ZpcnN0SWQsIGFnZW50U2Vzc2lvbkFwcHJvdmFsSWQoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgcmVzdG9yZWRNb2RlbCkhKV0sIFsnc3RhYmxlLWNhbGwnLCAnc3RhYmxlLWNhbGwnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BpY2tzIHRoZSBmaXJzdCBXYWl0aW5nRm9yQ29uZmlybWF0aW9uIHBhcnQgd2hlbiBtdWx0aXBsZSBwYXJ0cyBleGlzdCcsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdGNvbnN0IGV4ZWN1dGluZ1BhcnQgPSBtYWtlVG9vbEludm9jYXRpb25QYXJ0KHsgc3RhdGU6IG1ha2VFeGVjdXRpbmdTdGF0ZSgpIH0pO1xuXHRcdGNvbnN0IHdhaXRpbmdQYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoeyBjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ3NlY29uZC1jbWQnIH0gfSksXG5cdFx0fSk7XG5cdFx0bW9ja01vZGVsV2l0aFJlc3BvbnNlKGNoYXRNb2RlbCwgW2V4ZWN1dGluZ1BhcnQsIHdhaXRpbmdQYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpPy5sYWJlbCwgJ3NlY29uZC1jbWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBtb2RlbCBhZGRlZCBhZnRlciBhcHByb3ZhbCBtb2RlbCBpcyBjcmVhdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXG5cdFx0Ly8gTm8gbW9kZWxzIHlldFxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vbGF0ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3ZhbE1vZGVsLmdldEFwcHJvdmFsKHVyaSkuZ2V0KCksIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBBZGQgbW9kZWwgbGF0ZXJcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwodXJpKTtcblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoeyBjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ2xhdGUtY21kJyB9IH0pLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFtwYXJ0XSk7XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpPy5sYWJlbCwgJ2xhdGUtY21kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbGVnYWN5IHRlcm1pbmFsIHRvb2wgZGF0YScsICgpID0+IHtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBhZGRDaGF0TW9kZWwoKTtcblxuXHRcdC8vIExlZ2FjeSBmb3JtYXQgaGFzIGBjb21tYW5kYCBpbnN0ZWFkIG9mIGBjb21tYW5kTGluZWBcblx0XHRjb25zdCBsZWdhY3lEYXRhID0geyBraW5kOiAndGVybWluYWwnIGFzIGNvbnN0LCBjb21tYW5kOiAnbGVnYWN5LWNtZCcsIGxhbmd1YWdlOiAnYmFzaCcgfTtcblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbGVnYWN5RGF0YSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGFiZWw6IHJlc3VsdD8ubGFiZWwsXG5cdFx0XHRsYW5ndWFnZTogcmVzdWx0Py5sYW5ndWFnZUlkLFxuXHRcdH0sIHtcblx0XHRcdGxhYmVsOiAnbGVnYWN5LWNtZCcsXG5cdFx0XHRsYW5ndWFnZTogJ3NoJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb2JzZXJ2YWJsZSBpcyByZXVzZWQgZm9yIHRoZSBzYW1lIHNlc3Npb24gcmVzb3VyY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi9zYW1lJyk7XG5cblx0XHRjb25zdCBvYnMxID0gYXBwcm92YWxNb2RlbC5nZXRBcHByb3ZhbCh1cmkpO1xuXHRcdGNvbnN0IG9iczIgPSBhcHByb3ZhbE1vZGVsLmdldEFwcHJvdmFsKHVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9iczEsIG9iczIpO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBub24tdG9vbEludm9jYXRpb24gcGFydHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHRjb25zdCBtYXJrZG93blBhcnQgPSB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIGFzIGNvbnN0LCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ2hlbGxvJykgfTtcblx0XHRjb25zdCB3YWl0aW5nUGFydCA9IG1ha2VUb29sSW52b2NhdGlvblBhcnQoe1xuXHRcdFx0c3RhdGU6IG1ha2VXYWl0aW5nU3RhdGUoKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG1ha2VUZXJtaW5hbFRvb2xEYXRhKHsgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICd0aGUtY21kJyB9IH0pLFxuXHRcdH0pO1xuXHRcdG1vY2tNb2RlbFdpdGhSZXNwb25zZShjaGF0TW9kZWwsIFttYXJrZG93blBhcnQgYXMgdW5rbm93biBhcyBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50LCB3YWl0aW5nUGFydF0pO1xuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQoeyB0aXRsZTogJ1Rlc3QnIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKT8ubGFiZWwsICd0aGUtY21kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0aW5nIHJlcXVlc3ROZWVkc0lucHV0IHRyaWdnZXJzIHJlLWV2YWx1YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gYWRkQ2hhdE1vZGVsKCk7XG5cblx0XHQvLyBJbml0aWFsbHkgbm8gcmVxdWVzdE5lZWRzSW5wdXRcblx0XHRjb25zdCBwYXJ0ID0gbWFrZVRvb2xJbnZvY2F0aW9uUGFydCh7XG5cdFx0XHRzdGF0ZTogbWFrZVdhaXRpbmdTdGF0ZSgpLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogbWFrZVRlcm1pbmFsVG9vbERhdGEoKSxcblx0XHR9KTtcblx0XHRtb2NrTW9kZWxXaXRoUmVzcG9uc2UoY2hhdE1vZGVsLCBbcGFydF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU2V0IHJlcXVlc3ROZWVkc0lucHV0XG5cdFx0Y2hhdE1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LnNldCh7IHRpdGxlOiAnVGVzdCcgfSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soZ2V0QXBwcm92YWwoYXBwcm92YWxNb2RlbCwgY2hhdE1vZGVsKSk7XG5cblx0XHQvLyBDbGVhciBhZ2FpblxuXHRcdGNoYXRNb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBcHByb3ZhbChhcHByb3ZhbE1vZGVsLCBjaGF0TW9kZWwpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQThCLHVCQUF1QjtBQUNyRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0IsaUNBQTREO0FBQzdGLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXNE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
