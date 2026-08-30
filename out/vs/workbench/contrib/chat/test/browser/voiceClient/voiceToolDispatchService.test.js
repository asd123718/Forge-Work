import assert from "assert";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentSessionStatus } from "../../../browser/agentSessions/agentSessionsModel.js";
import { resolveVoiceModel, VoiceToolDispatchService } from "../../../browser/voiceClient/voiceToolDispatchService.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { ChatPlanReviewData } from "../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { AskQuestionsToolId } from "../../../common/tools/builtinTools/askQuestionsTool.js";
import { derivePendingId } from "../../../common/voiceClient/voiceClientService.js";
suite("VoiceToolDispatchService - model selection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const model = (identifier, name, id = name) => ({
    identifier,
    metadata: { name, id, family: id, vendor: "copilot" }
  });
  test("matches a unique normalized model name", () => {
    const result = resolveVoiceModel([
      model("copilot/gpt-5", "GPT-5"),
      model("copilot/claude", "Claude Sonnet 4")
    ], "gpt 5");
    assert.deepStrictEqual(result, {
      ok: true,
      identifier: "copilot/gpt-5",
      selected_model: { identifier: "copilot/gpt-5", name: "GPT-5", vendor: "copilot" }
    });
  });
  test("returns candidates instead of guessing between ambiguous names", () => {
    const result = resolveVoiceModel([
      model("copilot/gpt-5-fast", "GPT-5"),
      model("openai/gpt-5", "GPT-5")
    ], "GPT-5");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "ambiguous_model");
    assert.deepStrictEqual(result.available_models?.map((candidate) => candidate.identifier), ["copilot/gpt-5-fast", "openai/gpt-5"]);
  });
});
suite("VoiceToolDispatchService - session actions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createActionHarness(options = {}) {
    const calls = {
      switchedTo: [],
      targeted: [],
      selectedModels: []
    };
    let currentResource = options.currentResource;
    let targetResource = options.targetResource;
    const agentSessionsService = new class extends mock() {
      get model() {
        return {
          sessions: (options.agentSessionResources ?? []).map((resource) => ({
            isArchived: () => false,
            resource,
            label: "Agent session",
            status: AgentSessionStatus.NeedsInput,
            timing: {},
            changes: void 0
          }))
        };
      }
    }();
    const chatService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.chatModels = observableValue("chatModels", options.chatModels ?? []);
      }
      getSession(resource) {
        return this.chatModels.get().find((model) => model.sessionResource.toString() === resource.toString());
      }
    }();
    const service = new VoiceToolDispatchService(
      agentSessionsService,
      chatService,
      new class extends mock() {
      }()
    );
    service.setDelegate(new class extends mock() {
      async getCurrentSessionResource() {
        return currentResource;
      }
      async switchToSession(resource) {
        calls.switchedTo.push(resource);
        if (options.switchSucceeds === false) {
          return false;
        }
        currentResource = resource;
        return true;
      }
      setTargetSession(resource) {
        targetResource = resource;
        calls.targeted.push(resource);
      }
      getTargetSessionResource() {
        return targetResource;
      }
      async selectModel(requestedModel) {
        calls.selectedModels.push(requestedModel);
        return options.selectModelResult ?? {
          ok: true,
          selected_model: { identifier: requestedModel, name: requestedModel, vendor: "test" }
        };
      }
    }());
    return { service, calls };
  }
  async function dispatch(service, name, args = {}) {
    return JSON.parse(await service.dispatchToolCall({ name, args }));
  }
  test("focusing a session also retargets subsequent voice turns", async () => {
    const resource = URI.parse("agent-session://test/target");
    const { service, calls } = createActionHarness({ agentSessionResources: [resource] });
    const result = await dispatch(service, "focus_session", { coding_session_id: resource.toString() });
    assert.deepStrictEqual(result, { ok: true, session_id: resource.toString() });
    assert.strictEqual(calls.switchedTo[0]?.toString(), resource.toString());
    assert.strictEqual(calls.targeted[0]?.toString(), resource.toString());
  });
  test("sets a model on the current session without changing the voice target", async () => {
    const currentResource = URI.parse("vscode-chat://test/current");
    const { service, calls } = createActionHarness({ currentResource });
    const result = await dispatch(service, "set_model", { model: "GPT-5" });
    assert.deepStrictEqual(result, {
      ok: true,
      selected_model: { identifier: "GPT-5", name: "GPT-5", vendor: "test" }
    });
    assert.deepStrictEqual(calls.selectedModels, ["GPT-5"]);
    assert.deepStrictEqual(calls.switchedTo, []);
    assert.deepStrictEqual(calls.targeted, []);
  });
  test("targets a requested session and preserves a model selection failure", async () => {
    const currentResource = URI.parse("vscode-chat://test/current");
    const targetResource = URI.parse("vscode-chat://test/target");
    const targetModel = { sessionResource: targetResource };
    const { service, calls } = createActionHarness({
      currentResource,
      chatModels: [targetModel],
      selectModelResult: { ok: false, reason: "selection_failed" }
    });
    const result = await dispatch(service, "set_model", { model_id: "copilot/gpt-5", coding_session_id: targetResource.toString() });
    assert.deepStrictEqual(result, { ok: false, reason: "selection_failed" });
    assert.strictEqual(calls.switchedTo[0]?.toString(), targetResource.toString());
    assert.strictEqual(calls.targeted[0]?.toString(), targetResource.toString());
    assert.deepStrictEqual(calls.selectedModels, ["copilot/gpt-5"]);
  });
  test("does not select a model when the requested session cannot be found or shown", async () => {
    const currentResource = URI.parse("vscode-chat://test/current");
    const targetResource = URI.parse("vscode-chat://test/target");
    const targetModel = { sessionResource: targetResource };
    const missing = createActionHarness({ currentResource });
    const unavailable = createActionHarness({ currentResource, chatModels: [targetModel], switchSucceeds: false });
    assert.deepStrictEqual(
      await dispatch(missing.service, "set_model", { model: "GPT-5", coding_session_id: targetResource.toString() }),
      { ok: false, reason: "session_not_found" }
    );
    assert.deepStrictEqual(
      await dispatch(unavailable.service, "set_model", { model: "GPT-5", coding_session_id: targetResource.toString() }),
      { ok: false, reason: "switch_failed" }
    );
    assert.deepStrictEqual(missing.calls.selectedModels, []);
    assert.deepStrictEqual(unavailable.calls.selectedModels, []);
    assert.deepStrictEqual(unavailable.calls.targeted, []);
  });
  test("includes an active regular chat before its first request", async () => {
    const resource = URI.parse("vscode-chat://test/empty-active");
    const model = {
      sessionResource: resource,
      title: "New chat",
      lastMessageDate: 0,
      getRequests: () => []
    };
    const { service } = createActionHarness({ currentResource: resource, chatModels: [model] });
    const result = await dispatch(service, "get_session_info");
    assert.strictEqual(result.total_sessions, 1);
    assert.deepStrictEqual(result.counts, { working: 0, waiting_for_input: 0, idle: 1 });
    assert.deepStrictEqual(result.sessions[0], {
      id: resource.toString(),
      label: "New chat",
      session_type: "chat",
      state: "idle",
      is_active: true,
      insertions: 0,
      deletions: 0
    });
  });
  test("reports Agent Host sessions using the backend session id", async () => {
    const resource = URI.parse("agent-host-copilotcli:/waiting-session");
    const { service } = createActionHarness({ currentResource: resource, agentSessionResources: [resource] });
    const result = await dispatch(service, "get_session_info");
    assert.deepStrictEqual(result.sessions[0], {
      id: "copilotcli:/waiting-session",
      label: "Agent session",
      session_type: "agent",
      state: "waiting_for_input",
      is_active: true,
      insertions: 0,
      deletions: 0
    });
  });
});
suite("VoiceToolDispatchService - respondToSession", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const sessionResource = URI.parse("agent-session://test/one");
  const requestId = "req-1";
  function serviceFor(part) {
    const parts = Array.isArray(part) ? part : [part];
    const model = new class extends mock() {
      getRequests() {
        return [{ id: requestId, response: { response: { value: parts } } }];
      }
    }();
    const agentSessionsService = new class extends mock() {
      get model() {
        return { sessions: [{ isArchived: () => false, resource: sessionResource }] };
      }
    }();
    const chatService = new class extends mock() {
      getSession() {
        return model;
      }
      notifyQuestionCarouselAnswer() {
      }
    }();
    return new VoiceToolDispatchService(
      agentSessionsService,
      chatService,
      new class extends mock() {
      }()
    );
  }
  function approvalCall(part, type) {
    return {
      name: "respond_to_session",
      args: {
        coding_session_id: sessionResource.toString(),
        request_id: requestId,
        pending_id: derivePendingId(requestId, part),
        response: { type }
      }
    };
  }
  function carousel(allowSkip = false) {
    return new ChatQuestionCarouselData([{
      id: "region",
      type: "singleSelect",
      title: "Region",
      message: "Which region should this deploy to?",
      options: [
        { id: "west", label: "West US", value: "westus" },
        { id: "east", label: "East US", value: "eastus" }
      ]
    }], allowSkip, "resolve-1");
  }
  function answerCall(part, response) {
    return {
      name: "respond_to_session",
      args: {
        coding_session_id: sessionResource.toString(),
        request_id: requestId,
        pending_id: derivePendingId(requestId, part),
        response
      }
    };
  }
  test("a spoken answer submits the form", async () => {
    const part = carousel();
    const call = answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "eastus" }] });
    const result = await serviceFor(part).respondToSession(call);
    const answers = { region: { selectedValue: "eastus" } };
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(part.isUsed, true);
    assert.deepStrictEqual(part.data, answers);
    assert.deepStrictEqual(await part.completion.p, { answers });
  });
  test("a value the form does not offer leaves it untouched", async () => {
    const part = carousel();
    const call = answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "West US" }] });
    const result = await serviceFor(part).respondToSession(call);
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_answer" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("an approval spoken at a question form is refused rather than applied", async () => {
    const part = carousel();
    const result = await serviceFor(part).respondToSession(approvalCall(part, "approve"));
    assert.deepStrictEqual(result, { ok: false, reason: "unsupported" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("an approval spoken at the ask-questions tool is refused rather than applied", async () => {
    const confirmations = [];
    const part = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.toolId = AskQuestionsToolId;
        this.state = observableValue("state", {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters: { questions: [{ question: "Which region?", options: [{ label: "West US" }] }] },
          confirmationMessages: {
            title: "Answer questions?",
            message: "The questionnaire is open."
          },
          confirm: (reason) => confirmations.push(reason.type)
        });
      }
    }();
    const result = await serviceFor(part).respondToSession(approvalCall(part, "approve"));
    assert.deepStrictEqual({ result, confirmations }, {
      result: { ok: false, reason: "unsupported" },
      confirmations: []
    });
  });
  test("tool and plan confirmations remain voice-approvable", async () => {
    const confirmations = [];
    const tool = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.toolId = "testTool";
        this.state = observableValue("state", {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters: {},
          confirmationMessages: {
            title: "Run the build?",
            message: "Runs the visible build task."
          },
          confirm: (reason) => confirmations.push(reason.type)
        });
      }
    }();
    const plan = new ChatPlanReviewData("Review plan", "Plan body", [
      { id: "implement", label: "Implement Plan", default: true }
    ], true);
    const toolResult = await serviceFor(tool).respondToSession(approvalCall(tool, "approve"));
    const planResult = await serviceFor(plan).respondToSession(approvalCall(plan, "approve"));
    assert.deepStrictEqual({
      toolResult,
      confirmations,
      planResult,
      planData: plan.data,
      planCompletion: await plan.completion.p
    }, {
      toolResult: { ok: true },
      confirmations: [ToolConfirmKind.UserAction],
      planResult: { ok: true },
      planData: {
        action: "Implement Plan",
        actionId: "implement",
        rejected: false
      },
      planCompletion: {
        action: "Implement Plan",
        actionId: "implement",
        rejected: false
      }
    });
  });
  test("refuses an approval id after the same tool is re-armed", async () => {
    const confirmations = [];
    const state = observableValue("state", {
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: {},
      confirm: (reason) => confirmations.push(reason.type)
    });
    const tool = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.toolId = "testTool";
        this.state = state;
      }
    }();
    const staleCall = approvalCall(tool, "approve");
    state.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: {},
      confirm: (reason) => confirmations.push(reason.type)
    }, void 0);
    const result = await serviceFor(tool).respondToSession(staleCall);
    assert.deepStrictEqual({ result, confirmations }, {
      result: { ok: false, reason: "stale_pending" },
      confirmations: []
    });
  });
  test("a spoken approval retires every rehydrated copy", async () => {
    const confirmations = [];
    const tool = () => {
      const state = observableValue("state", {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: { command: "npm install" },
        confirm: (reason) => confirmations.push(reason.type)
      });
      const part = new class extends mock() {
        constructor() {
          super(...arguments);
          this.kind = "toolInvocation";
          this.toolId = "testTool";
          this.toolCallId = "tool-call";
          this.state = state;
        }
      }();
      return { part, state };
    };
    const first = tool();
    const staleCopy = tool();
    const parts = [first.part, staleCopy.part];
    const service = serviceFor(parts);
    const call = approvalCall(first.part, "approve");
    assert.strictEqual(derivePendingId(requestId, staleCopy.part), call.args["pending_id"]);
    const firstResult = await service.respondToSession(call);
    const duplicateResult = await service.respondToSession(call);
    assert.deepStrictEqual({ firstResult, duplicateResult, confirmations }, {
      firstResult: { ok: true },
      duplicateResult: { ok: false, reason: "stale_pending" },
      confirmations: [ToolConfirmKind.UserAction]
    });
    for (const copy of [first, staleCopy]) {
      copy.state.set({
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: ToolConfirmKind.Skipped,
        parameters: {}
      }, void 0);
    }
  });
  test("a skip is refused when the form forbids it", async () => {
    const part = carousel();
    const result = await serviceFor(part).respondToSession(answerCall(part, { type: "skip" }));
    assert.deepStrictEqual(result, { ok: false, reason: "stale_pending" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("a skip submits an unanswered form when the form allows it", async () => {
    const part = carousel(true);
    const result = await serviceFor(part).respondToSession(answerCall(part, { type: "skip" }));
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(part.isUsed, true);
  });
  test("an answer is refused once the form has been used", async () => {
    const part = carousel();
    part.dismiss({ region: { selectedValue: "westus" } });
    const call = answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "eastus" }] });
    const result = await serviceFor(part).respondToSession(call);
    assert.deepStrictEqual(result, { ok: false, reason: "stale_pending" });
    assert.deepStrictEqual(part.data, { region: { selectedValue: "westus" } });
  });
  test("refuses an answer that leaves a required question blank", async () => {
    const part = new ChatQuestionCarouselData([
      { id: "region", type: "singleSelect", title: "Region", options: [{ id: "west", label: "West US", value: "westus" }] },
      { id: "tier", type: "singleSelect", title: "Tier", required: true, options: [{ id: "std", label: "Standard", value: "standard" }] }
    ], true, "resolve-1");
    const call = answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "westus" }] });
    assert.deepStrictEqual(await serviceFor(part).respondToSession(call), { ok: false, reason: "invalid_answer" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("skipping may leave a required question blank", async () => {
    const part = new ChatQuestionCarouselData([
      { id: "tier", type: "singleSelect", title: "Tier", required: true, options: [{ id: "std", label: "Standard", value: "standard" }] }
    ], true, "resolve-1");
    assert.deepStrictEqual(await serviceFor(part).respondToSession(answerCall(part, { type: "skip" })), { ok: true });
  });
  test("refuses a malformed answers field rather than reading it as empty", async () => {
    const part = carousel(true);
    const result = await serviceFor(part).respondToSession(answerCall(part, { type: "skip", answers: "westus" }));
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_answer" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("refuses an unresolvable carousel without marking it answered", async () => {
    const part = {
      kind: "questionCarousel",
      questions: [{ id: "region", type: "singleSelect", title: "Region", options: [{ id: "west", label: "West US", value: "westus" }] }],
      isUsed: false,
      data: void 0
    };
    const result = await serviceFor(part).respondToSession(
      answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "westus" }] })
    );
    assert.deepStrictEqual(result, { ok: false, reason: "unsupported" });
    assert.strictEqual(part.isUsed, false);
    assert.strictEqual(part.data, void 0);
  });
  test("refuses an id minted for a part that has since been replaced", async () => {
    const published = carousel();
    const call = answerCall(published, { type: "answer", answers: [{ question_id: "region", value: "eastus" }] });
    const replacement = carousel();
    const result = await serviceFor(replacement).respondToSession(call);
    assert.deepStrictEqual(result, { ok: false, reason: "stale_pending" });
    assert.strictEqual(replacement.isUsed, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFx2b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TdGF0dXMsIElBZ2VudFNlc3Npb25zTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VNb2RlbFNlbGVjdGlvblJlc3VsdCwgSVZvaWNlVG9vbERpc3BhdGNoRGVsZWdhdGUsIHJlc29sdmVWb2ljZU1vZGVsLCBWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlVG9vbERpc3BhdGNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFF1ZXN0aW9uQW5zd2VycywgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXNrUXVlc3Rpb25zVG9vbElkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9hc2tRdWVzdGlvbnNUb29sLmpzJztcbmltcG9ydCB7IGRlcml2ZVBlbmRpbmdJZCwgSVZvaWNlVG9vbENhbGwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5cbnN1aXRlKCdWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UgLSBtb2RlbCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IG1vZGVsID0gKGlkZW50aWZpZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCBpZCA9IG5hbWUpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgPT4gKHtcblx0XHRpZGVudGlmaWVyLFxuXHRcdG1ldGFkYXRhOiB7IG5hbWUsIGlkLCBmYW1pbHk6IGlkLCB2ZW5kb3I6ICdjb3BpbG90JyB9LFxuXHR9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcik7XG5cblx0dGVzdCgnbWF0Y2hlcyBhIHVuaXF1ZSBub3JtYWxpemVkIG1vZGVsIG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVZvaWNlTW9kZWwoW1xuXHRcdFx0bW9kZWwoJ2NvcGlsb3QvZ3B0LTUnLCAnR1BULTUnKSxcblx0XHRcdG1vZGVsKCdjb3BpbG90L2NsYXVkZScsICdDbGF1ZGUgU29ubmV0IDQnKSxcblx0XHRdLCAnZ3B0IDUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRvazogdHJ1ZSxcblx0XHRcdGlkZW50aWZpZXI6ICdjb3BpbG90L2dwdC01Jyxcblx0XHRcdHNlbGVjdGVkX21vZGVsOiB7IGlkZW50aWZpZXI6ICdjb3BpbG90L2dwdC01JywgbmFtZTogJ0dQVC01JywgdmVuZG9yOiAnY29waWxvdCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBjYW5kaWRhdGVzIGluc3RlYWQgb2YgZ3Vlc3NpbmcgYmV0d2VlbiBhbWJpZ3VvdXMgbmFtZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVZvaWNlTW9kZWwoW1xuXHRcdFx0bW9kZWwoJ2NvcGlsb3QvZ3B0LTUtZmFzdCcsICdHUFQtNScpLFxuXHRcdFx0bW9kZWwoJ29wZW5haS9ncHQtNScsICdHUFQtNScpLFxuXHRcdF0sICdHUFQtNScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5vaywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVhc29uLCAnYW1iaWd1b3VzX21vZGVsJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYXZhaWxhYmxlX21vZGVscz8ubWFwKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWRlbnRpZmllciksIFsnY29waWxvdC9ncHQtNS1mYXN0JywgJ29wZW5haS9ncHQtNSddKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1ZvaWNlVG9vbERpc3BhdGNoU2VydmljZSAtIHNlc3Npb24gYWN0aW9ucycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0aW50ZXJmYWNlIElBY3Rpb25IYXJuZXNzT3B0aW9ucyB7XG5cdFx0cmVhZG9ubHkgY3VycmVudFJlc291cmNlPzogVVJJO1xuXHRcdHJlYWRvbmx5IHRhcmdldFJlc291cmNlPzogVVJJO1xuXHRcdHJlYWRvbmx5IGFnZW50U2Vzc2lvblJlc291cmNlcz86IHJlYWRvbmx5IFVSSVtdO1xuXHRcdHJlYWRvbmx5IGNoYXRNb2RlbHM/OiByZWFkb25seSBJQ2hhdE1vZGVsW107XG5cdFx0cmVhZG9ubHkgc2VsZWN0TW9kZWxSZXN1bHQ/OiBJVm9pY2VNb2RlbFNlbGVjdGlvblJlc3VsdDtcblx0XHRyZWFkb25seSBzd2l0Y2hTdWNjZWVkcz86IGJvb2xlYW47XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVBY3Rpb25IYXJuZXNzKG9wdGlvbnM6IElBY3Rpb25IYXJuZXNzT3B0aW9ucyA9IHt9KSB7XG5cdFx0Y29uc3QgY2FsbHMgPSB7XG5cdFx0XHRzd2l0Y2hlZFRvOiBbXSBhcyBVUklbXSxcblx0XHRcdHRhcmdldGVkOiBbXSBhcyBVUklbXSxcblx0XHRcdHNlbGVjdGVkTW9kZWxzOiBbXSBhcyBzdHJpbmdbXSxcblx0XHR9O1xuXHRcdGxldCBjdXJyZW50UmVzb3VyY2UgPSBvcHRpb25zLmN1cnJlbnRSZXNvdXJjZTtcblx0XHRsZXQgdGFyZ2V0UmVzb3VyY2UgPSBvcHRpb25zLnRhcmdldFJlc291cmNlO1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0IG1vZGVsKCk6IElBZ2VudFNlc3Npb25zTW9kZWwge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHNlc3Npb25zOiAob3B0aW9ucy5hZ2VudFNlc3Npb25SZXNvdXJjZXMgPz8gW10pLm1hcChyZXNvdXJjZSA9PiAoe1xuXHRcdFx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnQWdlbnQgc2Vzc2lvbicsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LFxuXHRcdFx0XHRcdFx0dGltaW5nOiB7fSxcblx0XHRcdFx0XHRcdGNoYW5nZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdH0gYXMgSUFnZW50U2Vzc2lvbnNNb2RlbDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhdE1vZGVscyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQ2hhdE1vZGVsW10+KCdjaGF0TW9kZWxzJywgb3B0aW9ucy5jaGF0TW9kZWxzID8/IFtdKTtcblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElDaGF0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jaGF0TW9kZWxzLmdldCgpLmZpbmQobW9kZWwgPT4gbW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UoXG5cdFx0XHRhZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRcdGNoYXRTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZT4oKSB7IH0sXG5cdFx0KTtcblx0XHRzZXJ2aWNlLnNldERlbGVnYXRlKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlVG9vbERpc3BhdGNoRGVsZWdhdGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZSgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4geyByZXR1cm4gY3VycmVudFJlc291cmNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzd2l0Y2hUb1Nlc3Npb24ocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdFx0XHRjYWxscy5zd2l0Y2hlZFRvLnB1c2gocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAob3B0aW9ucy5zd2l0Y2hTdWNjZWVkcyA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VycmVudFJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2V0VGFyZ2V0U2Vzc2lvbihyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0XHRcdHRhcmdldFJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0XHRcdGNhbGxzLnRhcmdldGVkLnB1c2gocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0VGFyZ2V0U2Vzc2lvblJlc291cmNlKCk6IFVSSSB8IHVuZGVmaW5lZCB7IHJldHVybiB0YXJnZXRSZXNvdXJjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2VsZWN0TW9kZWwocmVxdWVzdGVkTW9kZWw6IHN0cmluZyk6IFByb21pc2U8SVZvaWNlTW9kZWxTZWxlY3Rpb25SZXN1bHQ+IHtcblx0XHRcdFx0Y2FsbHMuc2VsZWN0ZWRNb2RlbHMucHVzaChyZXF1ZXN0ZWRNb2RlbCk7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLnNlbGVjdE1vZGVsUmVzdWx0ID8/IHtcblx0XHRcdFx0XHRvazogdHJ1ZSxcblx0XHRcdFx0XHRzZWxlY3RlZF9tb2RlbDogeyBpZGVudGlmaWVyOiByZXF1ZXN0ZWRNb2RlbCwgbmFtZTogcmVxdWVzdGVkTW9kZWwsIHZlbmRvcjogJ3Rlc3QnIH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSgpKTtcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBjYWxscyB9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZGlzcGF0Y2goc2VydmljZTogVm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlLCBuYW1lOiBzdHJpbmcsIGFyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pIHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShhd2FpdCBzZXJ2aWNlLmRpc3BhdGNoVG9vbENhbGwoeyBuYW1lLCBhcmdzIH0gYXMgSVZvaWNlVG9vbENhbGwpKTtcblx0fVxuXG5cdHRlc3QoJ2ZvY3VzaW5nIGEgc2Vzc2lvbiBhbHNvIHJldGFyZ2V0cyBzdWJzZXF1ZW50IHZvaWNlIHR1cm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1zZXNzaW9uOi8vdGVzdC90YXJnZXQnKTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNhbGxzIH0gPSBjcmVhdGVBY3Rpb25IYXJuZXNzKHsgYWdlbnRTZXNzaW9uUmVzb3VyY2VzOiBbcmVzb3VyY2VdIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGlzcGF0Y2goc2VydmljZSwgJ2ZvY3VzX3Nlc3Npb24nLCB7IGNvZGluZ19zZXNzaW9uX2lkOiByZXNvdXJjZS50b1N0cmluZygpIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgb2s6IHRydWUsIHNlc3Npb25faWQ6IHJlc291cmNlLnRvU3RyaW5nKCkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLnN3aXRjaGVkVG9bMF0/LnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy50YXJnZXRlZFswXT8udG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldHMgYSBtb2RlbCBvbiB0aGUgY3VycmVudCBzZXNzaW9uIHdpdGhvdXQgY2hhbmdpbmcgdGhlIHZvaWNlIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdXJyZW50UmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vdGVzdC9jdXJyZW50Jyk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBjYWxscyB9ID0gY3JlYXRlQWN0aW9uSGFybmVzcyh7IGN1cnJlbnRSZXNvdXJjZSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpc3BhdGNoKHNlcnZpY2UsICdzZXRfbW9kZWwnLCB7IG1vZGVsOiAnR1BULTUnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdG9rOiB0cnVlLFxuXHRcdFx0c2VsZWN0ZWRfbW9kZWw6IHsgaWRlbnRpZmllcjogJ0dQVC01JywgbmFtZTogJ0dQVC01JywgdmVuZG9yOiAndGVzdCcgfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLnNlbGVjdGVkTW9kZWxzLCBbJ0dQVC01J10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMuc3dpdGNoZWRUbywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMudGFyZ2V0ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndGFyZ2V0cyBhIHJlcXVlc3RlZCBzZXNzaW9uIGFuZCBwcmVzZXJ2ZXMgYSBtb2RlbCBzZWxlY3Rpb24gZmFpbHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdXJyZW50UmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vdGVzdC9jdXJyZW50Jyk7XG5cdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vdGVzdC90YXJnZXQnKTtcblx0XHRjb25zdCB0YXJnZXRNb2RlbCA9IHsgc2Vzc2lvblJlc291cmNlOiB0YXJnZXRSZXNvdXJjZSB9IGFzIElDaGF0TW9kZWw7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBjYWxscyB9ID0gY3JlYXRlQWN0aW9uSGFybmVzcyh7XG5cdFx0XHRjdXJyZW50UmVzb3VyY2UsXG5cdFx0XHRjaGF0TW9kZWxzOiBbdGFyZ2V0TW9kZWxdLFxuXHRcdFx0c2VsZWN0TW9kZWxSZXN1bHQ6IHsgb2s6IGZhbHNlLCByZWFzb246ICdzZWxlY3Rpb25fZmFpbGVkJyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGlzcGF0Y2goc2VydmljZSwgJ3NldF9tb2RlbCcsIHsgbW9kZWxfaWQ6ICdjb3BpbG90L2dwdC01JywgY29kaW5nX3Nlc3Npb25faWQ6IHRhcmdldFJlc291cmNlLnRvU3RyaW5nKCkgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogZmFsc2UsIHJlYXNvbjogJ3NlbGVjdGlvbl9mYWlsZWQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy5zd2l0Y2hlZFRvWzBdPy50b1N0cmluZygpLCB0YXJnZXRSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMudGFyZ2V0ZWRbMF0/LnRvU3RyaW5nKCksIHRhcmdldFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMuc2VsZWN0ZWRNb2RlbHMsIFsnY29waWxvdC9ncHQtNSddKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc2VsZWN0IGEgbW9kZWwgd2hlbiB0aGUgcmVxdWVzdGVkIHNlc3Npb24gY2Fubm90IGJlIGZvdW5kIG9yIHNob3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN1cnJlbnRSZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQ6Ly90ZXN0L2N1cnJlbnQnKTtcblx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQ6Ly90ZXN0L3RhcmdldCcpO1xuXHRcdGNvbnN0IHRhcmdldE1vZGVsID0geyBzZXNzaW9uUmVzb3VyY2U6IHRhcmdldFJlc291cmNlIH0gYXMgSUNoYXRNb2RlbDtcblx0XHRjb25zdCBtaXNzaW5nID0gY3JlYXRlQWN0aW9uSGFybmVzcyh7IGN1cnJlbnRSZXNvdXJjZSB9KTtcblx0XHRjb25zdCB1bmF2YWlsYWJsZSA9IGNyZWF0ZUFjdGlvbkhhcm5lc3MoeyBjdXJyZW50UmVzb3VyY2UsIGNoYXRNb2RlbHM6IFt0YXJnZXRNb2RlbF0sIHN3aXRjaFN1Y2NlZWRzOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCBkaXNwYXRjaChtaXNzaW5nLnNlcnZpY2UsICdzZXRfbW9kZWwnLCB7IG1vZGVsOiAnR1BULTUnLCBjb2Rpbmdfc2Vzc2lvbl9pZDogdGFyZ2V0UmVzb3VyY2UudG9TdHJpbmcoKSB9KSxcblx0XHRcdHsgb2s6IGZhbHNlLCByZWFzb246ICdzZXNzaW9uX25vdF9mb3VuZCcgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCBkaXNwYXRjaCh1bmF2YWlsYWJsZS5zZXJ2aWNlLCAnc2V0X21vZGVsJywgeyBtb2RlbDogJ0dQVC01JywgY29kaW5nX3Nlc3Npb25faWQ6IHRhcmdldFJlc291cmNlLnRvU3RyaW5nKCkgfSksXG5cdFx0XHR7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3dpdGNoX2ZhaWxlZCcgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlzc2luZy5jYWxscy5zZWxlY3RlZE1vZGVscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodW5hdmFpbGFibGUuY2FsbHMuc2VsZWN0ZWRNb2RlbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVuYXZhaWxhYmxlLmNhbGxzLnRhcmdldGVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIGFuIGFjdGl2ZSByZWd1bGFyIGNoYXQgYmVmb3JlIGl0cyBmaXJzdCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdDovL3Rlc3QvZW1wdHktYWN0aXZlJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0dGl0bGU6ICdOZXcgY2hhdCcsXG5cdFx0XHRsYXN0TWVzc2FnZURhdGU6IDAsXG5cdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW10sXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0TW9kZWw7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVBY3Rpb25IYXJuZXNzKHsgY3VycmVudFJlc291cmNlOiByZXNvdXJjZSwgY2hhdE1vZGVsczogW21vZGVsXSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpc3BhdGNoKHNlcnZpY2UsICdnZXRfc2Vzc2lvbl9pbmZvJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvdGFsX3Nlc3Npb25zLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5jb3VudHMsIHsgd29ya2luZzogMCwgd2FpdGluZ19mb3JfaW5wdXQ6IDAsIGlkbGU6IDEgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuc2Vzc2lvbnNbMF0sIHtcblx0XHRcdGlkOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWw6ICdOZXcgY2hhdCcsXG5cdFx0XHRzZXNzaW9uX3R5cGU6ICdjaGF0Jyxcblx0XHRcdHN0YXRlOiAnaWRsZScsXG5cdFx0XHRpc19hY3RpdmU6IHRydWUsXG5cdFx0XHRpbnNlcnRpb25zOiAwLFxuXHRcdFx0ZGVsZXRpb25zOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIEFnZW50IEhvc3Qgc2Vzc2lvbnMgdXNpbmcgdGhlIGJhY2tlbmQgc2Vzc2lvbiBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi93YWl0aW5nLXNlc3Npb24nKTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZUFjdGlvbkhhcm5lc3MoeyBjdXJyZW50UmVzb3VyY2U6IHJlc291cmNlLCBhZ2VudFNlc3Npb25SZXNvdXJjZXM6IFtyZXNvdXJjZV0gfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaXNwYXRjaChzZXJ2aWNlLCAnZ2V0X3Nlc3Npb25faW5mbycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuc2Vzc2lvbnNbMF0sIHtcblx0XHRcdGlkOiAnY29waWxvdGNsaTovd2FpdGluZy1zZXNzaW9uJyxcblx0XHRcdGxhYmVsOiAnQWdlbnQgc2Vzc2lvbicsXG5cdFx0XHRzZXNzaW9uX3R5cGU6ICdhZ2VudCcsXG5cdFx0XHRzdGF0ZTogJ3dhaXRpbmdfZm9yX2lucHV0Jyxcblx0XHRcdGlzX2FjdGl2ZTogdHJ1ZSxcblx0XHRcdGluc2VydGlvbnM6IDAsXG5cdFx0XHRkZWxldGlvbnM6IDAsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UgLSByZXNwb25kVG9TZXNzaW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LXNlc3Npb246Ly90ZXN0L29uZScpO1xuXHRjb25zdCByZXF1ZXN0SWQgPSAncmVxLTEnO1xuXG5cdGZ1bmN0aW9uIHNlcnZpY2VGb3IocGFydDogb2JqZWN0IHwgcmVhZG9ubHkgb2JqZWN0W10pOiBWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2Uge1xuXHRcdGNvbnN0IHBhcnRzID0gQXJyYXkuaXNBcnJheShwYXJ0KSA/IHBhcnQgOiBbcGFydF07XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0TW9kZWw+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0UmVxdWVzdHMoKSB7XG5cdFx0XHRcdHJldHVybiBbeyBpZDogcmVxdWVzdElkLCByZXNwb25zZTogeyByZXNwb25zZTogeyB2YWx1ZTogcGFydHMgfSB9IH1dIGFzIHVua25vd24gYXMgUmV0dXJuVHlwZTxJQ2hhdE1vZGVsWydnZXRSZXF1ZXN0cyddPjtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0IG1vZGVsKCk6IElBZ2VudFNlc3Npb25zTW9kZWwge1xuXHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uczogW3sgaXNBcmNoaXZlZDogKCkgPT4gZmFsc2UsIHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UgfV0gfSBhcyBJQWdlbnRTZXNzaW9uc01vZGVsO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwgYXMgSUNoYXRNb2RlbDtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIG5vdGlmeVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIoKSB7IH1cblx0XHR9O1xuXHRcdHJldHVybiBuZXcgVm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlKFxuXHRcdFx0YWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHRjaGF0U2VydmljZSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U+KCkgeyB9LFxuXHRcdCk7XG5cdH1cblxuXHRmdW5jdGlvbiBhcHByb3ZhbENhbGwocGFydDogb2JqZWN0LCB0eXBlOiAnYXBwcm92ZScgfCAncmVqZWN0Jyk6IElWb2ljZVRvb2xDYWxsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogJ3Jlc3BvbmRfdG9fc2Vzc2lvbicsXG5cdFx0XHRhcmdzOiB7XG5cdFx0XHRcdGNvZGluZ19zZXNzaW9uX2lkOiBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVxdWVzdF9pZDogcmVxdWVzdElkLFxuXHRcdFx0XHRwZW5kaW5nX2lkOiBkZXJpdmVQZW5kaW5nSWQocmVxdWVzdElkLCBwYXJ0KSxcblx0XHRcdFx0cmVzcG9uc2U6IHsgdHlwZSB9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSVZvaWNlVG9vbENhbGw7XG5cdH1cblxuXHRmdW5jdGlvbiBjYXJvdXNlbChhbGxvd1NraXAgPSBmYWxzZSk6IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB7XG5cdFx0cmV0dXJuIG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW3tcblx0XHRcdGlkOiAncmVnaW9uJyxcblx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0dGl0bGU6ICdSZWdpb24nLFxuXHRcdFx0bWVzc2FnZTogJ1doaWNoIHJlZ2lvbiBzaG91bGQgdGhpcyBkZXBsb3kgdG8/Jyxcblx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ3dlc3QnLCBsYWJlbDogJ1dlc3QgVVMnLCB2YWx1ZTogJ3dlc3R1cycgfSxcblx0XHRcdFx0eyBpZDogJ2Vhc3QnLCBsYWJlbDogJ0Vhc3QgVVMnLCB2YWx1ZTogJ2Vhc3R1cycgfSxcblx0XHRcdF0sXG5cdFx0fV0sIGFsbG93U2tpcCwgJ3Jlc29sdmUtMScpO1xuXHR9XG5cblx0ZnVuY3Rpb24gYW5zd2VyQ2FsbChwYXJ0OiBvYmplY3QsIHJlc3BvbnNlOiBvYmplY3QpOiBJVm9pY2VUb29sQ2FsbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6ICdyZXNwb25kX3RvX3Nlc3Npb24nLFxuXHRcdFx0YXJnczoge1xuXHRcdFx0XHRjb2Rpbmdfc2Vzc2lvbl9pZDogc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHJlcXVlc3RfaWQ6IHJlcXVlc3RJZCxcblx0XHRcdFx0cGVuZGluZ19pZDogZGVyaXZlUGVuZGluZ0lkKHJlcXVlc3RJZCwgcGFydCksXG5cdFx0XHRcdHJlc3BvbnNlLFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSVZvaWNlVG9vbENhbGw7XG5cdH1cblxuXHQvLyBUaGUgcmVwb3J0ZWQgYnVnOiBhIHNwb2tlbiBhbnN3ZXIgbGVmdCB0aGUgZm9ybSBvbiBzY3JlZW4sIHVuYW5zd2VyZWQuXG5cblx0dGVzdCgnYSBzcG9rZW4gYW5zd2VyIHN1Ym1pdHMgdGhlIGZvcm0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNhcm91c2VsKCk7XG5cdFx0Y29uc3QgY2FsbCA9IGFuc3dlckNhbGwocGFydCwgeyB0eXBlOiAnYW5zd2VyJywgYW5zd2VyczogW3sgcXVlc3Rpb25faWQ6ICdyZWdpb24nLCB2YWx1ZTogJ2Vhc3R1cycgfV0gfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlRm9yKHBhcnQpLnJlc3BvbmRUb1Nlc3Npb24oY2FsbCk7XG5cblx0XHRjb25zdCBhbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyA9IHsgcmVnaW9uOiB7IHNlbGVjdGVkVmFsdWU6ICdlYXN0dXMnIH0gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5pc1VzZWQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5kYXRhLCBhbnN3ZXJzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHBhcnQuY29tcGxldGlvbi5wLCB7IGFuc3dlcnMgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgdmFsdWUgdGhlIGZvcm0gZG9lcyBub3Qgb2ZmZXIgbGVhdmVzIGl0IHVudG91Y2hlZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgYmFja2VuZCByZXNvbHZlcyBvcmRpbmFscyBhZ2FpbnN0IGl0cyBvd24gbWlycm9yLCBzbyBhbiB1bm1hdGNoZWRcblx0XHQvLyB2YWx1ZSBtZWFucyB0aGF0IG1pcnJvciB3YXMgc3RhbGUuIEFuc3dlcmluZyB3aXRoIGEgZ3Vlc3Mgd291bGQgc3VibWl0XG5cdFx0Ly8gc29tZXRoaW5nIHRoZSB1c2VyIG5ldmVyIGNob3NlLlxuXHRcdGNvbnN0IHBhcnQgPSBjYXJvdXNlbCgpO1xuXHRcdGNvbnN0IGNhbGwgPSBhbnN3ZXJDYWxsKHBhcnQsIHsgdHlwZTogJ2Fuc3dlcicsIGFuc3dlcnM6IFt7IHF1ZXN0aW9uX2lkOiAncmVnaW9uJywgdmFsdWU6ICdXZXN0IFVTJyB9XSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocGFydCkucmVzcG9uZFRvU2Vzc2lvbihjYWxsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG9rOiBmYWxzZSwgcmVhc29uOiAnaW52YWxpZF9hbnN3ZXInIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmlzVXNlZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYW4gYXBwcm92YWwgc3Bva2VuIGF0IGEgcXVlc3Rpb24gZm9ybSBpcyByZWZ1c2VkIHJhdGhlciB0aGFuIGFwcGxpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNhcm91c2VsKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlRm9yKHBhcnQpLnJlc3BvbmRUb1Nlc3Npb24oYXBwcm92YWxDYWxsKHBhcnQsICdhcHByb3ZlJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuaXNVc2VkLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBhcHByb3ZhbCBzcG9rZW4gYXQgdGhlIGFzay1xdWVzdGlvbnMgdG9vbCBpcyByZWZ1c2VkIHJhdGhlciB0aGFuIGFwcGxpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uczogVG9vbENvbmZpcm1LaW5kW10gPSBbXTtcblx0XHRjb25zdCBwYXJ0ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFRvb2xJbnZvY2F0aW9uPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGtpbmQgPSAndG9vbEludm9jYXRpb24nIGFzIGNvbnN0O1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdG9vbElkID0gQXNrUXVlc3Rpb25zVG9vbElkO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ3N0YXRlJywge1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHF1ZXN0aW9uczogW3sgcXVlc3Rpb246ICdXaGljaCByZWdpb24/Jywgb3B0aW9uczogW3sgbGFiZWw6ICdXZXN0IFVTJyB9XSB9XSB9LFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdHRpdGxlOiAnQW5zd2VyIHF1ZXN0aW9ucz8nLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdUaGUgcXVlc3Rpb25uYWlyZSBpcyBvcGVuLicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbmZpcm06IHJlYXNvbiA9PiBjb25maXJtYXRpb25zLnB1c2gocmVhc29uLnR5cGUpLFxuXHRcdFx0fSk7XG5cdFx0fSgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZUZvcihwYXJ0KS5yZXNwb25kVG9TZXNzaW9uKGFwcHJvdmFsQ2FsbChwYXJ0LCAnYXBwcm92ZScpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQsIGNvbmZpcm1hdGlvbnMgfSwge1xuXHRcdFx0cmVzdWx0OiB7IG9rOiBmYWxzZSwgcmVhc29uOiAndW5zdXBwb3J0ZWQnIH0sXG5cdFx0XHRjb25maXJtYXRpb25zOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndG9vbCBhbmQgcGxhbiBjb25maXJtYXRpb25zIHJlbWFpbiB2b2ljZS1hcHByb3ZhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvbnM6IFRvb2xDb25maXJtS2luZFtdID0gW107XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb29sSW52b2NhdGlvbj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBraW5kID0gJ3Rvb2xJbnZvY2F0aW9uJyBhcyBjb25zdDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRvb2xJZCA9ICd0ZXN0VG9vbCc7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPignc3RhdGUnLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHt9LFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHRcdHRpdGxlOiAnUnVuIHRoZSBidWlsZD8nLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdSdW5zIHRoZSB2aXNpYmxlIGJ1aWxkIHRhc2suJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29uZmlybTogcmVhc29uID0+IGNvbmZpcm1hdGlvbnMucHVzaChyZWFzb24udHlwZSksXG5cdFx0XHR9KTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgcGxhbiA9IG5ldyBDaGF0UGxhblJldmlld0RhdGEoJ1JldmlldyBwbGFuJywgJ1BsYW4gYm9keScsIFtcblx0XHRcdHsgaWQ6ICdpbXBsZW1lbnQnLCBsYWJlbDogJ0ltcGxlbWVudCBQbGFuJywgZGVmYXVsdDogdHJ1ZSB9LFxuXHRcdF0sIHRydWUpO1xuXG5cdFx0Y29uc3QgdG9vbFJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IodG9vbCkucmVzcG9uZFRvU2Vzc2lvbihhcHByb3ZhbENhbGwodG9vbCwgJ2FwcHJvdmUnKSk7XG5cdFx0Y29uc3QgcGxhblJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocGxhbikucmVzcG9uZFRvU2Vzc2lvbihhcHByb3ZhbENhbGwocGxhbiwgJ2FwcHJvdmUnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvb2xSZXN1bHQsXG5cdFx0XHRjb25maXJtYXRpb25zLFxuXHRcdFx0cGxhblJlc3VsdCxcblx0XHRcdHBsYW5EYXRhOiBwbGFuLmRhdGEsXG5cdFx0XHRwbGFuQ29tcGxldGlvbjogYXdhaXQgcGxhbi5jb21wbGV0aW9uLnAsXG5cdFx0fSwge1xuXHRcdFx0dG9vbFJlc3VsdDogeyBvazogdHJ1ZSB9LFxuXHRcdFx0Y29uZmlybWF0aW9uczogW1Rvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uXSxcblx0XHRcdHBsYW5SZXN1bHQ6IHsgb2s6IHRydWUgfSxcblx0XHRcdHBsYW5EYXRhOiB7XG5cdFx0XHRcdGFjdGlvbjogJ0ltcGxlbWVudCBQbGFuJyxcblx0XHRcdFx0YWN0aW9uSWQ6ICdpbXBsZW1lbnQnLFxuXHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0cGxhbkNvbXBsZXRpb246IHtcblx0XHRcdFx0YWN0aW9uOiAnSW1wbGVtZW50IFBsYW4nLFxuXHRcdFx0XHRhY3Rpb25JZDogJ2ltcGxlbWVudCcsXG5cdFx0XHRcdHJlamVjdGVkOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnVzZXMgYW4gYXBwcm92YWwgaWQgYWZ0ZXIgdGhlIHNhbWUgdG9vbCBpcyByZS1hcm1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maXJtYXRpb25zOiBUb29sQ29uZmlybUtpbmRbXSA9IFtdO1xuXHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+KCdzdGF0ZScsIHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRcdGNvbmZpcm06IHJlYXNvbiA9PiBjb25maXJtYXRpb25zLnB1c2gocmVhc29uLnR5cGUpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0VG9vbEludm9jYXRpb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkga2luZCA9ICd0b29sSW52b2NhdGlvbicgYXMgY29uc3Q7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB0b29sSWQgPSAndGVzdFRvb2wnO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBzdGF0ZTtcblx0XHR9KCk7XG5cdFx0Y29uc3Qgc3RhbGVDYWxsID0gYXBwcm92YWxDYWxsKHRvb2wsICdhcHByb3ZlJyk7XG5cblx0XHRzdGF0ZS5zZXQoe1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdHBhcmFtZXRlcnM6IHt9LFxuXHRcdFx0Y29uZmlybTogcmVhc29uID0+IGNvbmZpcm1hdGlvbnMucHVzaChyZWFzb24udHlwZSksXG5cdFx0fSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlRm9yKHRvb2wpLnJlc3BvbmRUb1Nlc3Npb24oc3RhbGVDYWxsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQsIGNvbmZpcm1hdGlvbnMgfSwge1xuXHRcdFx0cmVzdWx0OiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RhbGVfcGVuZGluZycgfSxcblx0XHRcdGNvbmZpcm1hdGlvbnM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHNwb2tlbiBhcHByb3ZhbCByZXRpcmVzIGV2ZXJ5IHJlaHlkcmF0ZWQgY29weScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maXJtYXRpb25zOiBUb29sQ29uZmlybUtpbmRbXSA9IFtdO1xuXHRcdGNvbnN0IHRvb2wgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPignc3RhdGUnLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgY29tbWFuZDogJ25wbSBpbnN0YWxsJyB9LFxuXHRcdFx0XHRjb25maXJtOiByZWFzb24gPT4gY29uZmlybWF0aW9ucy5wdXNoKHJlYXNvbi50eXBlKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGFydCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb29sSW52b2NhdGlvbj4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGtpbmQgPSAndG9vbEludm9jYXRpb24nIGFzIGNvbnN0O1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB0b29sSWQgPSAndGVzdFRvb2wnO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB0b29sQ2FsbElkID0gJ3Rvb2wtY2FsbCc7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gc3RhdGU7XG5cdFx0XHR9KCk7XG5cdFx0XHRyZXR1cm4geyBwYXJ0LCBzdGF0ZSB9O1xuXHRcdH07XG5cdFx0Y29uc3QgZmlyc3QgPSB0b29sKCk7XG5cdFx0Y29uc3Qgc3RhbGVDb3B5ID0gdG9vbCgpO1xuXHRcdGNvbnN0IHBhcnRzID0gW2ZpcnN0LnBhcnQsIHN0YWxlQ29weS5wYXJ0XTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc2VydmljZUZvcihwYXJ0cyk7XG5cdFx0Y29uc3QgY2FsbCA9IGFwcHJvdmFsQ2FsbChmaXJzdC5wYXJ0LCAnYXBwcm92ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXJpdmVQZW5kaW5nSWQocmVxdWVzdElkLCBzdGFsZUNvcHkucGFydCksIGNhbGwuYXJnc1sncGVuZGluZ19pZCddKTtcblxuXHRcdGNvbnN0IGZpcnN0UmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNwb25kVG9TZXNzaW9uKGNhbGwpO1xuXHRcdGNvbnN0IGR1cGxpY2F0ZVJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzcG9uZFRvU2Vzc2lvbihjYWxsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmaXJzdFJlc3VsdCwgZHVwbGljYXRlUmVzdWx0LCBjb25maXJtYXRpb25zIH0sIHtcblx0XHRcdGZpcnN0UmVzdWx0OiB7IG9rOiB0cnVlIH0sXG5cdFx0XHRkdXBsaWNhdGVSZXN1bHQ6IHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGFsZV9wZW5kaW5nJyB9LFxuXHRcdFx0Y29uZmlybWF0aW9uczogW1Rvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uXSxcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgY29weSBvZiBbZmlyc3QsIHN0YWxlQ29weV0pIHtcblx0XHRcdGNvcHkuc3RhdGUuc2V0KHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkLFxuXHRcdFx0XHRyZWFzb246IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdhIHNraXAgaXMgcmVmdXNlZCB3aGVuIHRoZSBmb3JtIGZvcmJpZHMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNhcm91c2VsKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlRm9yKHBhcnQpLnJlc3BvbmRUb1Nlc3Npb24oYW5zd2VyQ2FsbChwYXJ0LCB7IHR5cGU6ICdza2lwJyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogZmFsc2UsIHJlYXNvbjogJ3N0YWxlX3BlbmRpbmcnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmlzVXNlZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYSBza2lwIHN1Ym1pdHMgYW4gdW5hbnN3ZXJlZCBmb3JtIHdoZW4gdGhlIGZvcm0gYWxsb3dzIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnQgPSBjYXJvdXNlbCh0cnVlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocGFydCkucmVzcG9uZFRvU2Vzc2lvbihhbnN3ZXJDYWxsKHBhcnQsIHsgdHlwZTogJ3NraXAnIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG9rOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmlzVXNlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGFuc3dlciBpcyByZWZ1c2VkIG9uY2UgdGhlIGZvcm0gaGFzIGJlZW4gdXNlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJ0ID0gY2Fyb3VzZWwoKTtcblx0XHRwYXJ0LmRpc21pc3MoeyByZWdpb246IHsgc2VsZWN0ZWRWYWx1ZTogJ3dlc3R1cycgfSB9KTtcblx0XHRjb25zdCBjYWxsID0gYW5zd2VyQ2FsbChwYXJ0LCB7IHR5cGU6ICdhbnN3ZXInLCBhbnN3ZXJzOiBbeyBxdWVzdGlvbl9pZDogJ3JlZ2lvbicsIHZhbHVlOiAnZWFzdHVzJyB9XSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocGFydCkucmVzcG9uZFRvU2Vzc2lvbihjYWxsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RhbGVfcGVuZGluZycgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0LmRhdGEsIHsgcmVnaW9uOiB7IHNlbGVjdGVkVmFsdWU6ICd3ZXN0dXMnIH0gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnVzZXMgYW4gYW5zd2VyIHRoYXQgbGVhdmVzIGEgcmVxdWlyZWQgcXVlc3Rpb24gYmxhbmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIHdpZGdldCB3aWxsIG5vdCBzdWJtaXQgdGhpcyBmb3JtOyBuZWl0aGVyIG1heSBhIHNwb2tlbiBhbnN3ZXIuXG5cdFx0Y29uc3QgcGFydCA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW1xuXHRcdFx0eyBpZDogJ3JlZ2lvbicsIHR5cGU6ICdzaW5nbGVTZWxlY3QnLCB0aXRsZTogJ1JlZ2lvbicsIG9wdGlvbnM6IFt7IGlkOiAnd2VzdCcsIGxhYmVsOiAnV2VzdCBVUycsIHZhbHVlOiAnd2VzdHVzJyB9XSB9LFxuXHRcdFx0eyBpZDogJ3RpZXInLCB0eXBlOiAnc2luZ2xlU2VsZWN0JywgdGl0bGU6ICdUaWVyJywgcmVxdWlyZWQ6IHRydWUsIG9wdGlvbnM6IFt7IGlkOiAnc3RkJywgbGFiZWw6ICdTdGFuZGFyZCcsIHZhbHVlOiAnc3RhbmRhcmQnIH1dIH0sXG5cdFx0XSwgdHJ1ZSwgJ3Jlc29sdmUtMScpO1xuXHRcdGNvbnN0IGNhbGwgPSBhbnN3ZXJDYWxsKHBhcnQsIHsgdHlwZTogJ2Fuc3dlcicsIGFuc3dlcnM6IFt7IHF1ZXN0aW9uX2lkOiAncmVnaW9uJywgdmFsdWU6ICd3ZXN0dXMnIH1dIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlRm9yKHBhcnQpLnJlc3BvbmRUb1Nlc3Npb24oY2FsbCksIHsgb2s6IGZhbHNlLCByZWFzb246ICdpbnZhbGlkX2Fuc3dlcicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuaXNVc2VkLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcGluZyBtYXkgbGVhdmUgYSByZXF1aXJlZCBxdWVzdGlvbiBibGFuaycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTa2lwIGlzIHRoZSB1c2VyIGRlY2xpbmluZyB0aGUgZm9ybSwgbm90IGFuIGluY29tcGxldGUgc3VibWlzc2lvbi5cblx0XHRjb25zdCBwYXJ0ID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbXG5cdFx0XHR7IGlkOiAndGllcicsIHR5cGU6ICdzaW5nbGVTZWxlY3QnLCB0aXRsZTogJ1RpZXInLCByZXF1aXJlZDogdHJ1ZSwgb3B0aW9uczogW3sgaWQ6ICdzdGQnLCBsYWJlbDogJ1N0YW5kYXJkJywgdmFsdWU6ICdzdGFuZGFyZCcgfV0gfSxcblx0XHRdLCB0cnVlLCAncmVzb2x2ZS0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2VGb3IocGFydCkucmVzcG9uZFRvU2Vzc2lvbihhbnN3ZXJDYWxsKHBhcnQsIHsgdHlwZTogJ3NraXAnIH0pKSwgeyBvazogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmdXNlcyBhIG1hbGZvcm1lZCBhbnN3ZXJzIGZpZWxkIHJhdGhlciB0aGFuIHJlYWRpbmcgaXQgYXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQ29lcmNpbmcgYSBwcmVzZW50IG5vbi1hcnJheSB0byBlbXB0eSB3b3VsZCBsZXQgYSBza2lwIHN1Y2NlZWQgd2hpbGVcblx0XHQvLyBzaWxlbnRseSBkaXNjYXJkaW5nIHdoYXRldmVyIHRoZSBjYWxsIGFjdHVhbGx5IGNhcnJpZWQuXG5cdFx0Y29uc3QgcGFydCA9IGNhcm91c2VsKHRydWUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZUZvcihwYXJ0KS5yZXNwb25kVG9TZXNzaW9uKGFuc3dlckNhbGwocGFydCwgeyB0eXBlOiAnc2tpcCcsIGFuc3dlcnM6ICd3ZXN0dXMnIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG9rOiBmYWxzZSwgcmVhc29uOiAnaW52YWxpZF9hbnN3ZXInIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmlzVXNlZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVmdXNlcyBhbiB1bnJlc29sdmFibGUgY2Fyb3VzZWwgd2l0aG91dCBtYXJraW5nIGl0IGFuc3dlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgcGxhaW4gY2Fyb3VzZWwgd2l0aCBubyBkZWZlcnJlZCBjb21wbGV0aW9uIGFuZCBubyByZXNvbHZlIGlkIGhhc1xuXHRcdC8vIG5vd2hlcmUgdG8gcHV0IGFuIGFuc3dlci4gTXV0YXRpbmcgaXQgZmlyc3Qgd291bGQgbGVhdmUgdGhlIGZvcm1cblx0XHQvLyBhbnN3ZXJlZCBvbiBzY3JlZW4gd2hpbGUgdGhlIGFzc2lzdGFudCByZXBvcnRzIHRoYXQgaXQgZGlkIG5vdCBsYW5kLlxuXHRcdGNvbnN0IHBhcnQgPSB7XG5cdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsXG5cdFx0XHRxdWVzdGlvbnM6IFt7IGlkOiAncmVnaW9uJywgdHlwZTogJ3NpbmdsZVNlbGVjdCcsIHRpdGxlOiAnUmVnaW9uJywgb3B0aW9uczogW3sgaWQ6ICd3ZXN0JywgbGFiZWw6ICdXZXN0IFVTJywgdmFsdWU6ICd3ZXN0dXMnIH1dIH1dLFxuXHRcdFx0aXNVc2VkOiBmYWxzZSxcblx0XHRcdGRhdGE6IHVuZGVmaW5lZCBhcyBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZUZvcihwYXJ0KS5yZXNwb25kVG9TZXNzaW9uKFxuXHRcdFx0YW5zd2VyQ2FsbChwYXJ0LCB7IHR5cGU6ICdhbnN3ZXInLCBhbnN3ZXJzOiBbeyBxdWVzdGlvbl9pZDogJ3JlZ2lvbicsIHZhbHVlOiAnd2VzdHVzJyB9XSB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5pc1VzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kYXRhLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZ1c2VzIGFuIGlkIG1pbnRlZCBmb3IgYSBwYXJ0IHRoYXQgaGFzIHNpbmNlIGJlZW4gcmVwbGFjZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSBwZW5kaW5nIGlkIGlzIGFuIGlkZW50aXR5LCBub3QgYSBwb3NpdGlvbi4gYFJlc3BvbnNlLmNsZWFyYCBhbmRcblx0XHQvLyBgY2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb25gIHNwbGljZSB0aGUgcGFydCBsaXN0LCBzbyBhIHBvc2l0aW9uIHRoZVxuXHRcdC8vIGJhY2tlbmQgd2FzIHRvbGQgYWJvdXQgY2FuIGVuZCB1cCBvY2N1cGllZCBieSBhIGRpZmZlcmVudCBmb3JtLCBhbmRcblx0XHQvLyBhbnN3ZXJpbmcgKnRoYXQqIGFuc3dlcnMgc29tZXRoaW5nIHRoZSB1c2VyIHdhcyBuZXZlciBzaG93bi5cblx0XHRjb25zdCBwdWJsaXNoZWQgPSBjYXJvdXNlbCgpO1xuXHRcdGNvbnN0IGNhbGwgPSBhbnN3ZXJDYWxsKHB1Ymxpc2hlZCwgeyB0eXBlOiAnYW5zd2VyJywgYW5zd2VyczogW3sgcXVlc3Rpb25faWQ6ICdyZWdpb24nLCB2YWx1ZTogJ2Vhc3R1cycgfV0gfSk7XG5cdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBjYXJvdXNlbCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZUZvcihyZXBsYWNlbWVudCkucmVzcG9uZFRvU2Vzc2lvbihjYWxsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RhbGVfcGVuZGluZycgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVx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
