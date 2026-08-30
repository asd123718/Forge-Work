import assert from "assert";
import { autorun, constObservable, observableValue, transaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AgentSessionApprovalKind, agentSessionApprovalId } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { BlockedSessionReason } from "../../../blockedSessions/browser/blockedSessions.js";
import { BlockedSessionsIndicatorModel, RequiresInputKind } from "../../browser/blockedSessionsIndicatorModel.js";
suite("BlockedSessionsIndicatorModel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createModel(options) {
    const blockedModel = new TestBlockedSessions();
    const approvalModel = new TestApprovalModel();
    const ciFixModel = new TestCIFixModel();
    const sessionsService = new TestSessionsService();
    const productService = { quality: options?.quality ?? "insider" };
    const instantiationService = new class extends mock() {
    }();
    const model = store.add(new BlockedSessionsIndicatorModel(
      approvalModel,
      blockedModel,
      ciFixModel,
      sessionsService,
      instantiationService,
      productService,
      ciFixModel
    ));
    store.add(autorun((reader) => {
      model.blockedSessions.read(reader);
    }));
    return { model, blockedModel, approvalModel, ciFixModel, sessionsService };
  }
  function blockedIds(model) {
    return model.blockedSessions.get().map((entry) => entry.session.sessionId);
  }
  test("excludes visible sessions from the blocked set", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
    sessionsService.setVisible([s1]);
    assert.deepStrictEqual(blockedIds(model), ["s2"]);
  });
  test("excludes sessions whose CI fix is being submitted", () => {
    const { model, blockedModel, ciFixModel } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    blockedModel.setBlocked([failingCI(s1), failingCI(s2)]);
    assert.deepStrictEqual(blockedIds(model), ["s1", "s2"]);
    ciFixModel.setHidden(["s1"]);
    assert.deepStrictEqual(blockedIds(model), ["s2"]);
  });
  test("blinks when a new, not-yet-visible session becomes blocked", () => {
    const { model, blockedModel } = createModel();
    blockedModel.setBlocked([needsInput(new TestSession("s1"))]);
    assert.strictEqual(model.consumePendingBlink(), true);
  });
  test("does not blink when a new block is already visible", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    sessionsService.setVisible([s1]);
    blockedModel.setBlocked([needsInput(s1)]);
    assert.strictEqual(model.consumePendingBlink(), false);
  });
  test("acknowledges a blocked session when it becomes visible", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    assert.strictEqual(model.consumePendingBlink(), true);
    sessionsService.setVisible([s1]);
    assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
    sessionsService.setVisible([]);
    assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
  });
  test("keeps an approval acknowledged when its chat model reloads", () => {
    const { model, blockedModel, approvalModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(1e3), "tool-call-1"));
    blockedModel.setBlocked([needsInput(s1)]);
    sessionsService.setVisible([s1]);
    sessionsService.setVisible([]);
    approvalModel.setApproval(s1.resource, void 0);
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(2e3), "tool-call-1"));
    const afterReload = blockedIds(model);
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(3e3), "tool-call-2"));
    assert.deepStrictEqual({ afterReload, afterNewApproval: blockedIds(model) }, { afterReload: [], afterNewApproval: ["s1"] });
  });
  test("blinks again when an additional, not-yet-visible session becomes blocked", () => {
    const { model, blockedModel } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    blockedModel.setBlocked([needsInput(s1)]);
    assert.strictEqual(model.consumePendingBlink(), true);
    blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
    assert.strictEqual(model.consumePendingBlink(), true);
  });
  test("does not blink when a queued block becomes visible before the blink plays", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    sessionsService.setVisible([s1]);
    assert.strictEqual(model.consumePendingBlink(), false);
  });
  test("does not blink when a queued block becomes visible then remains acknowledged", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    sessionsService.setVisible([s1]);
    sessionsService.setVisible([]);
    assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
  });
  test("does not blink when a queued block unblocks before the blink plays", () => {
    const { model, blockedModel } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    blockedModel.setBlocked([]);
    assert.strictEqual(model.consumePendingBlink(), false);
  });
  test("consumePendingBlink clears the pending blink", () => {
    const { model, blockedModel } = createModel();
    blockedModel.setBlocked([needsInput(new TestSession("s1"))]);
    assert.deepStrictEqual([model.consumePendingBlink(), model.consumePendingBlink()], [true, false]);
  });
  test("reports a homogeneous requires-input kind", () => {
    const { model, blockedModel, approvalModel } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal));
    approvalModel.setApproval(s2.resource, approval(AgentSessionApprovalKind.Terminal));
    blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
    assert.strictEqual(model.requiresInputKind.get(), RequiresInputKind.TerminalApproval);
  });
  test("reports no kind for a mix of reasons", () => {
    const { model, blockedModel, approvalModel } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal));
    approvalModel.setApproval(s2.resource, approval(AgentSessionApprovalKind.Question));
    blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
    assert.strictEqual(model.requiresInputKind.get(), void 0);
  });
  test("classifies failing-CI reason", () => {
    const { model, blockedModel } = createModel();
    const ci = new TestSession("ci");
    blockedModel.setBlocked([failingCI(ci)]);
    assert.strictEqual(model.requiresInputKind.get(), RequiresInputKind.FailingCI);
  });
  test("builds the requires-input label per kind and count", () => {
    const { model } = createModel();
    assert.deepStrictEqual({
      terminalOne: model.getRequiresInputLabel(1, RequiresInputKind.TerminalApproval),
      terminalMany: model.getRequiresInputLabel(3, RequiresInputKind.TerminalApproval),
      questionOne: model.getRequiresInputLabel(1, RequiresInputKind.Question),
      failingCIMany: model.getRequiresInputLabel(2, RequiresInputKind.FailingCI),
      genericOne: model.getRequiresInputLabel(1, void 0),
      genericMany: model.getRequiresInputLabel(4, void 0)
    }, {
      terminalOne: "1 session requires terminal approval",
      terminalMany: "3 sessions require terminal approval",
      questionOne: "1 session has a question",
      failingCIMany: "2 sessions are failing CI",
      genericOne: "1 session requires input",
      genericMany: "4 sessions require input"
    });
  });
  test("dismissing an approval hides the session until a distinct approval appears", () => {
    const { model, blockedModel, approvalModel } = createModel();
    const s1 = new TestSession("s1");
    const first = approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(1e3));
    approvalModel.setApproval(s1.resource, first);
    blockedModel.setBlocked([needsInput(s1)]);
    assert.deepStrictEqual(blockedIds(model), ["s1"]);
    model.dismissApproval({ session: s1, approvalId: agentSessionApprovalId(first) });
    assert.deepStrictEqual(blockedIds(model), []);
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(2e3)));
    assert.deepStrictEqual(blockedIds(model), ["s1"]);
  });
  test("ignores the current input-needed occurrence until the session blocks again", () => {
    const { model, blockedModel } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    model.ignoreSession(s1);
    assert.deepStrictEqual(blockedIds(model), []);
    blockedModel.setBlocked([]);
    blockedModel.setBlocked([needsInput(s1)]);
    assert.deepStrictEqual(blockedIds(model), ["s1"]);
  });
  test("ignores only the current CI failure occurrence", () => {
    const { model, blockedModel } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([failingCI(s1, "sha1")]);
    model.ignoreSession(s1);
    assert.deepStrictEqual(blockedIds(model), []);
    blockedModel.setBlocked([failingCI(s1, "sha2")]);
    assert.deepStrictEqual(blockedIds(model), ["s1"]);
  });
  test("ignores all currently surfaced blocked sessions", () => {
    const { model, blockedModel } = createModel();
    const input = new TestSession("input");
    const ci = new TestSession("ci");
    blockedModel.setBlocked([needsInput(input), failingCI(ci, "sha1")]);
    model.ignoreAllSessions();
    const ignored = blockedIds(model);
    blockedModel.setBlocked([]);
    blockedModel.setBlocked([needsInput(input), failingCI(ci, "sha2")]);
    assert.deepStrictEqual({ ignored, afterNewOccurrences: blockedIds(model) }, { ignored: [], afterNewOccurrences: ["input", "ci"] });
  });
  test("reports nothing and never blinks when disabled (stable quality)", () => {
    const { model, blockedModel } = createModel({ quality: "stable" });
    blockedModel.setBlocked([needsInput(new TestSession("s1"))]);
    assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
  });
});
function needsInput(session) {
  return { session, reason: BlockedSessionReason.NeedsInput, occurrenceId: BlockedSessionReason.NeedsInput };
}
function failingCI(session, headSha = "sha") {
  return { session, reason: BlockedSessionReason.FailingCI, occurrenceId: `${BlockedSessionReason.FailingCI}:${headSha}` };
}
function approval(kind, since = /* @__PURE__ */ new Date(), approvalId = `${kind}:${since.getTime()}`) {
  return { approvalId, kind, label: "npm run build", languageId: void 0, since, confirm: () => {
  } };
}
class TestSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.resource = URI.parse(`test-session:/${sessionId}`);
    this.chats = constObservable([{ resource: this.resource }]);
  }
}
class TestBlockedSessions {
  constructor() {
    this.blockedSessionsWithReasons = observableValue("withReasons", []);
    this.blockedSessions = observableValue("blocked", []);
  }
  setBlocked(blocked) {
    transaction((tx) => {
      this.blockedSessionsWithReasons.set(blocked, tx);
      this.blockedSessions.set(blocked.map((entry) => entry.session), tx);
    });
  }
}
class TestApprovalModel {
  constructor() {
    this._approvals = /* @__PURE__ */ new Map();
  }
  getApproval(resource) {
    return this._obs(resource.toString());
  }
  setApproval(resource, info) {
    this._obs(resource.toString()).set(info, void 0);
  }
  _obs(key) {
    let obs = this._approvals.get(key);
    if (!obs) {
      obs = observableValue(`approval.${key}`, void 0);
      this._approvals.set(key, obs);
    }
    return obs;
  }
}
class TestCIFixModel {
  constructor() {
    this.hiddenSessions = observableValue("ciFixHidden", /* @__PURE__ */ new Set());
  }
  setHidden(sessionIds) {
    this.hiddenSessions.set(new Set(sessionIds), void 0);
  }
}
class TestSessionsService {
  constructor() {
    this.visibleSessions = observableValue("visible", []);
  }
  setVisible(sessions) {
    this.visibleSessions.set(sessions, void 0);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXHRlc3RcXGJyb3dzZXJcXGJsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLCBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLCBhZ2VudFNlc3Npb25BcHByb3ZhbElkLCBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25SZWFzb24sIEJsb2NrZWRTZXNzaW9ucywgSUJsb2NrZWRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vYmxvY2tlZFNlc3Npb25zL2Jyb3dzZXIvYmxvY2tlZFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL2Jsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwuanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWwsIFJlcXVpcmVzSW5wdXRLaW5kIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ibG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbC5qcyc7XG5cbnN1aXRlKCdCbG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vZGVsKG9wdGlvbnM/OiB7IHF1YWxpdHk/OiBzdHJpbmcgfSk6IHtcblx0XHRtb2RlbDogQmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWw7XG5cdFx0YmxvY2tlZE1vZGVsOiBUZXN0QmxvY2tlZFNlc3Npb25zO1xuXHRcdGFwcHJvdmFsTW9kZWw6IFRlc3RBcHByb3ZhbE1vZGVsO1xuXHRcdGNpRml4TW9kZWw6IFRlc3RDSUZpeE1vZGVsO1xuXHRcdHNlc3Npb25zU2VydmljZTogVGVzdFNlc3Npb25zU2VydmljZTtcblx0fSB7XG5cdFx0Y29uc3QgYmxvY2tlZE1vZGVsID0gbmV3IFRlc3RCbG9ja2VkU2Vzc2lvbnMoKTtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gbmV3IFRlc3RBcHByb3ZhbE1vZGVsKCk7XG5cdFx0Y29uc3QgY2lGaXhNb2RlbCA9IG5ldyBUZXN0Q0lGaXhNb2RlbCgpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IG5ldyBUZXN0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IHF1YWxpdHk6IG9wdGlvbnM/LnF1YWxpdHkgPz8gJ2luc2lkZXInIH0gYXMgdW5rbm93biBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElJbnN0YW50aWF0aW9uU2VydmljZT4oKSB7IH0oKTtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgQmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWwoXG5cdFx0XHRhcHByb3ZhbE1vZGVsIGFzIHVua25vd24gYXMgQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCxcblx0XHRcdGJsb2NrZWRNb2RlbCBhcyB1bmtub3duIGFzIEJsb2NrZWRTZXNzaW9ucyxcblx0XHRcdGNpRml4TW9kZWwgYXMgdW5rbm93biBhcyBCbG9ja2VkU2Vzc2lvbnNDSUZpeE1vZGVsLFxuXHRcdFx0c2Vzc2lvbnNTZXJ2aWNlIGFzIHVua25vd24gYXMgSVNlc3Npb25zU2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRjaUZpeE1vZGVsIGFzIHVua25vd24gYXMgQmxvY2tlZFNlc3Npb25zQ0lGaXhNb2RlbCxcblx0XHQpKTtcblx0XHQvLyBLZWVwIHRoZSBkZXJpdmVkIGxpdmUgc28gaXQgcmVjb21wdXRlcyBvbiB2aXNpYmlsaXR5L2Rpc21pc3NhbCBjaGFuZ2VzLlxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7IG1vZGVsLmJsb2NrZWRTZXNzaW9ucy5yZWFkKHJlYWRlcik7IH0pKTtcblx0XHRyZXR1cm4geyBtb2RlbCwgYmxvY2tlZE1vZGVsLCBhcHByb3ZhbE1vZGVsLCBjaUZpeE1vZGVsLCBzZXNzaW9uc1NlcnZpY2UgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGJsb2NrZWRJZHMobW9kZWw6IEJsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBtb2RlbC5ibG9ja2VkU2Vzc2lvbnMuZ2V0KCkubWFwKGVudHJ5ID0+IGVudHJ5LnNlc3Npb24uc2Vzc2lvbklkKTtcblx0fVxuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHZpc2libGUgc2Vzc2lvbnMgZnJvbSB0aGUgYmxvY2tlZCBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsLCBzZXNzaW9uc1NlcnZpY2UgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBuZXcgVGVzdFNlc3Npb24oJ3MyJyk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpLCBuZWVkc0lucHV0KHMyKV0pO1xuXHRcdHNlc3Npb25zU2VydmljZS5zZXRWaXNpYmxlKFtzMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmxvY2tlZElkcyhtb2RlbCksIFsnczInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHNlc3Npb25zIHdob3NlIENJIGZpeCBpcyBiZWluZyBzdWJtaXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsLCBjaUZpeE1vZGVsIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGNvbnN0IHMyID0gbmV3IFRlc3RTZXNzaW9uKCdzMicpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtmYWlsaW5nQ0koczEpLCBmYWlsaW5nQ0koczIpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChibG9ja2VkSWRzKG1vZGVsKSwgWydzMScsICdzMiddKTtcblx0XHRjaUZpeE1vZGVsLnNldEhpZGRlbihbJ3MxJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmxvY2tlZElkcyhtb2RlbCksIFsnczInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JsaW5rcyB3aGVuIGEgbmV3LCBub3QteWV0LXZpc2libGUgc2Vzc2lvbiBiZWNvbWVzIGJsb2NrZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KG5ldyBUZXN0U2Vzc2lvbignczEnKSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY29uc3VtZVBlbmRpbmdCbGluaygpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYmxpbmsgd2hlbiBhIG5ldyBibG9jayBpcyBhbHJlYWR5IHZpc2libGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsLCBzZXNzaW9uc1NlcnZpY2UgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLnNldFZpc2libGUoW3MxXSk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2tub3dsZWRnZXMgYSBibG9ja2VkIHNlc3Npb24gd2hlbiBpdCBiZWNvbWVzIHZpc2libGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsLCBzZXNzaW9uc1NlcnZpY2UgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSwgdHJ1ZSk7XG5cblx0XHRzZXNzaW9uc1NlcnZpY2Uuc2V0VmlzaWJsZShbczFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYmxvY2tlZDogYmxvY2tlZElkcyhtb2RlbCksIGJsaW5rOiBtb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCkgfSwgeyBibG9ja2VkOiBbXSwgYmxpbms6IGZhbHNlIH0pO1xuXG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLnNldFZpc2libGUoW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBibG9ja2VkOiBibG9ja2VkSWRzKG1vZGVsKSwgYmxpbms6IG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSB9LCB7IGJsb2NrZWQ6IFtdLCBibGluazogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGFuIGFwcHJvdmFsIGFja25vd2xlZGdlZCB3aGVuIGl0cyBjaGF0IG1vZGVsIHJlbG9hZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsLCBhcHByb3ZhbE1vZGVsLCBzZXNzaW9uc1NlcnZpY2UgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0YXBwcm92YWxNb2RlbC5zZXRBcHByb3ZhbChzMS5yZXNvdXJjZSwgYXBwcm92YWwoQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsLCBuZXcgRGF0ZSgxMDAwKSwgJ3Rvb2wtY2FsbC0xJykpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdHNlc3Npb25zU2VydmljZS5zZXRWaXNpYmxlKFtzMV0pO1xuXHRcdHNlc3Npb25zU2VydmljZS5zZXRWaXNpYmxlKFtdKTtcblxuXHRcdGFwcHJvdmFsTW9kZWwuc2V0QXBwcm92YWwoczEucmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdFx0YXBwcm92YWxNb2RlbC5zZXRBcHByb3ZhbChzMS5yZXNvdXJjZSwgYXBwcm92YWwoQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsLCBuZXcgRGF0ZSgyMDAwKSwgJ3Rvb2wtY2FsbC0xJykpO1xuXHRcdGNvbnN0IGFmdGVyUmVsb2FkID0gYmxvY2tlZElkcyhtb2RlbCk7XG5cdFx0YXBwcm92YWxNb2RlbC5zZXRBcHByb3ZhbChzMS5yZXNvdXJjZSwgYXBwcm92YWwoQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsLCBuZXcgRGF0ZSgzMDAwKSwgJ3Rvb2wtY2FsbC0yJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFmdGVyUmVsb2FkLCBhZnRlck5ld0FwcHJvdmFsOiBibG9ja2VkSWRzKG1vZGVsKSB9LCB7IGFmdGVyUmVsb2FkOiBbXSwgYWZ0ZXJOZXdBcHByb3ZhbDogWydzMSddIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdibGlua3MgYWdhaW4gd2hlbiBhbiBhZGRpdGlvbmFsLCBub3QteWV0LXZpc2libGUgc2Vzc2lvbiBiZWNvbWVzIGJsb2NrZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGNvbnN0IHMyID0gbmV3IFRlc3RTZXNzaW9uKCdzMicpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCksIHRydWUpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKSwgbmVlZHNJbnB1dChzMildKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY29uc3VtZVBlbmRpbmdCbGluaygpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYmxpbmsgd2hlbiBhIHF1ZXVlZCBibG9jayBiZWNvbWVzIHZpc2libGUgYmVmb3JlIHRoZSBibGluayBwbGF5cycsICgpID0+IHtcblx0XHQvLyBTaW11bGF0ZXMgYSBibGluayBxdWV1ZWQgd2hpbGUgdGhlIHBpbGwgaXMgc3VwcHJlc3NlZCAoZS5nLiB0aGUgdHJhbnNpZW50XG5cdFx0Ly8gXCJBcHByb3ZlZCBOIHNlc3Npb25zXCIgc3RhdGUpOiBpZiB0aGUgc2Vzc2lvbiBiZWNvbWVzIHZpc2libGUgYmVmb3JlIHRoZSBwaWxsXG5cdFx0Ly8gc2hvd3MsIHRoZSBxdWV1ZWQgYmxpbmsgbXVzdCBub3QgZmlyZSBvbiB0aGUgbGF0ZXIgcmVuZGVyLlxuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgc2Vzc2lvbnNTZXJ2aWNlIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdC8vIEJsaW5rIGlzIHF1ZXVlZCBidXQgTk9UIGNvbnN1bWVkIHlldCAocGlsbCBzdXBwcmVzc2VkKTsgdGhlIHNlc3Npb24gdGhlblxuXHRcdC8vIGJlY29tZXMgdmlzaWJsZSBiZWZvcmUgdGhlIHBpbGwgcmVuZGVycy5cblx0XHRzZXNzaW9uc1NlcnZpY2Uuc2V0VmlzaWJsZShbczFdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY29uc3VtZVBlbmRpbmdCbGluaygpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJsaW5rIHdoZW4gYSBxdWV1ZWQgYmxvY2sgYmVjb21lcyB2aXNpYmxlIHRoZW4gcmVtYWlucyBhY2tub3dsZWRnZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsLCBzZXNzaW9uc1NlcnZpY2UgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpXSk7XG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLnNldFZpc2libGUoW3MxXSk7XG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLnNldFZpc2libGUoW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBibG9ja2VkOiBibG9ja2VkSWRzKG1vZGVsKSwgYmxpbms6IG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSB9LCB7IGJsb2NrZWQ6IFtdLCBibGluazogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJsaW5rIHdoZW4gYSBxdWV1ZWQgYmxvY2sgdW5ibG9ja3MgYmVmb3JlIHRoZSBibGluayBwbGF5cycsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpXSk7XG5cdFx0Ly8gVGhlIHNlc3Npb24gc3RvcHMgYmVpbmcgYmxvY2tlZCBiZWZvcmUgdGhlIHF1ZXVlZCBibGluayBpcyBjb25zdW1lZC5cblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdW1lUGVuZGluZ0JsaW5rIGNsZWFycyB0aGUgcGVuZGluZyBibGluaycsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQobmV3IFRlc3RTZXNzaW9uKCdzMScpKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW21vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSwgbW9kZWwuY29uc3VtZVBlbmRpbmdCbGluaygpXSwgW3RydWUsIGZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgYSBob21vZ2VuZW91cyByZXF1aXJlcy1pbnB1dCBraW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgYXBwcm92YWxNb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBzMSA9IG5ldyBUZXN0U2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IG5ldyBUZXN0U2Vzc2lvbignczInKTtcblx0XHRhcHByb3ZhbE1vZGVsLnNldEFwcHJvdmFsKHMxLnJlc291cmNlLCBhcHByb3ZhbChBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuVGVybWluYWwpKTtcblx0XHRhcHByb3ZhbE1vZGVsLnNldEFwcHJvdmFsKHMyLnJlc291cmNlLCBhcHByb3ZhbChBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuVGVybWluYWwpKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChzMSksIG5lZWRzSW5wdXQoczIpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnJlcXVpcmVzSW5wdXRLaW5kLmdldCgpLCBSZXF1aXJlc0lucHV0S2luZC5UZXJtaW5hbEFwcHJvdmFsKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBubyBraW5kIGZvciBhIG1peCBvZiByZWFzb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgYXBwcm92YWxNb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBzMSA9IG5ldyBUZXN0U2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IG5ldyBUZXN0U2Vzc2lvbignczInKTtcblx0XHRhcHByb3ZhbE1vZGVsLnNldEFwcHJvdmFsKHMxLnJlc291cmNlLCBhcHByb3ZhbChBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuVGVybWluYWwpKTtcblx0XHRhcHByb3ZhbE1vZGVsLnNldEFwcHJvdmFsKHMyLnJlc291cmNlLCBhcHByb3ZhbChBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuUXVlc3Rpb24pKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChzMSksIG5lZWRzSW5wdXQoczIpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnJlcXVpcmVzSW5wdXRLaW5kLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGFzc2lmaWVzIGZhaWxpbmctQ0kgcmVhc29uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBjaSA9IG5ldyBUZXN0U2Vzc2lvbignY2knKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbZmFpbGluZ0NJKGNpKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5yZXF1aXJlc0lucHV0S2luZC5nZXQoKSwgUmVxdWlyZXNJbnB1dEtpbmQuRmFpbGluZ0NJKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIHRoZSByZXF1aXJlcy1pbnB1dCBsYWJlbCBwZXIga2luZCBhbmQgY291bnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRlcm1pbmFsT25lOiBtb2RlbC5nZXRSZXF1aXJlc0lucHV0TGFiZWwoMSwgUmVxdWlyZXNJbnB1dEtpbmQuVGVybWluYWxBcHByb3ZhbCksXG5cdFx0XHR0ZXJtaW5hbE1hbnk6IG1vZGVsLmdldFJlcXVpcmVzSW5wdXRMYWJlbCgzLCBSZXF1aXJlc0lucHV0S2luZC5UZXJtaW5hbEFwcHJvdmFsKSxcblx0XHRcdHF1ZXN0aW9uT25lOiBtb2RlbC5nZXRSZXF1aXJlc0lucHV0TGFiZWwoMSwgUmVxdWlyZXNJbnB1dEtpbmQuUXVlc3Rpb24pLFxuXHRcdFx0ZmFpbGluZ0NJTWFueTogbW9kZWwuZ2V0UmVxdWlyZXNJbnB1dExhYmVsKDIsIFJlcXVpcmVzSW5wdXRLaW5kLkZhaWxpbmdDSSksXG5cdFx0XHRnZW5lcmljT25lOiBtb2RlbC5nZXRSZXF1aXJlc0lucHV0TGFiZWwoMSwgdW5kZWZpbmVkKSxcblx0XHRcdGdlbmVyaWNNYW55OiBtb2RlbC5nZXRSZXF1aXJlc0lucHV0TGFiZWwoNCwgdW5kZWZpbmVkKSxcblx0XHR9LCB7XG5cdFx0XHR0ZXJtaW5hbE9uZTogJzEgc2Vzc2lvbiByZXF1aXJlcyB0ZXJtaW5hbCBhcHByb3ZhbCcsXG5cdFx0XHR0ZXJtaW5hbE1hbnk6ICczIHNlc3Npb25zIHJlcXVpcmUgdGVybWluYWwgYXBwcm92YWwnLFxuXHRcdFx0cXVlc3Rpb25PbmU6ICcxIHNlc3Npb24gaGFzIGEgcXVlc3Rpb24nLFxuXHRcdFx0ZmFpbGluZ0NJTWFueTogJzIgc2Vzc2lvbnMgYXJlIGZhaWxpbmcgQ0knLFxuXHRcdFx0Z2VuZXJpY09uZTogJzEgc2Vzc2lvbiByZXF1aXJlcyBpbnB1dCcsXG5cdFx0XHRnZW5lcmljTWFueTogJzQgc2Vzc2lvbnMgcmVxdWlyZSBpbnB1dCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NpbmcgYW4gYXBwcm92YWwgaGlkZXMgdGhlIHNlc3Npb24gdW50aWwgYSBkaXN0aW5jdCBhcHByb3ZhbCBhcHBlYXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgYXBwcm92YWxNb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBzMSA9IG5ldyBUZXN0U2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBmaXJzdCA9IGFwcHJvdmFsKEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCwgbmV3IERhdGUoMTAwMCkpO1xuXHRcdGFwcHJvdmFsTW9kZWwuc2V0QXBwcm92YWwoczEucmVzb3VyY2UsIGZpcnN0KTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChzMSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJsb2NrZWRJZHMobW9kZWwpLCBbJ3MxJ10pO1xuXG5cdFx0Ly8gVGhlIHVzZXIgYWxsb3dzIHRoZSBwZW5kaW5nIGFwcHJvdmFsIFx1MjAxNCB0aGUgc2Vzc2lvbiBkcm9wcyBvdXQgaW1tZWRpYXRlbHkuXG5cdFx0bW9kZWwuZGlzbWlzc0FwcHJvdmFsKHsgc2Vzc2lvbjogczEgYXMgdW5rbm93biBhcyBJU2Vzc2lvbiwgYXBwcm92YWxJZDogYWdlbnRTZXNzaW9uQXBwcm92YWxJZChmaXJzdCkgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChibG9ja2VkSWRzKG1vZGVsKSwgW10pO1xuXG5cdFx0Ly8gQSBuZXcsIGRpc3RpbmN0IGFwcHJvdmFsIHJlLXN1cmZhY2VzIHRoZSBzZXNzaW9uLlxuXHRcdGFwcHJvdmFsTW9kZWwuc2V0QXBwcm92YWwoczEucmVzb3VyY2UsIGFwcHJvdmFsKEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCwgbmV3IERhdGUoMjAwMCkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJsb2NrZWRJZHMobW9kZWwpLCBbJ3MxJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIHRoZSBjdXJyZW50IGlucHV0LW5lZWRlZCBvY2N1cnJlbmNlIHVudGlsIHRoZSBzZXNzaW9uIGJsb2NrcyBhZ2FpbicsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpXSk7XG5cdFx0bW9kZWwuaWdub3JlU2Vzc2lvbihzMSBhcyB1bmtub3duIGFzIElTZXNzaW9uKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJsb2NrZWRJZHMobW9kZWwpLCBbXSk7XG5cblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbXSk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChibG9ja2VkSWRzKG1vZGVsKSwgWydzMSddKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBvbmx5IHRoZSBjdXJyZW50IENJIGZhaWx1cmUgb2NjdXJyZW5jZScsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW2ZhaWxpbmdDSShzMSwgJ3NoYTEnKV0pO1xuXHRcdG1vZGVsLmlnbm9yZVNlc3Npb24oczEgYXMgdW5rbm93biBhcyBJU2Vzc2lvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChibG9ja2VkSWRzKG1vZGVsKSwgW10pO1xuXG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW2ZhaWxpbmdDSShzMSwgJ3NoYTInKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmxvY2tlZElkcyhtb2RlbCksIFsnczEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYWxsIGN1cnJlbnRseSBzdXJmYWNlZCBibG9ja2VkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBpbnB1dCA9IG5ldyBUZXN0U2Vzc2lvbignaW5wdXQnKTtcblx0XHRjb25zdCBjaSA9IG5ldyBUZXN0U2Vzc2lvbignY2knKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChpbnB1dCksIGZhaWxpbmdDSShjaSwgJ3NoYTEnKV0pO1xuXHRcdG1vZGVsLmlnbm9yZUFsbFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgaWdub3JlZCA9IGJsb2NrZWRJZHMobW9kZWwpO1xuXG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW10pO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KGlucHV0KSwgZmFpbGluZ0NJKGNpLCAnc2hhMicpXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaWdub3JlZCwgYWZ0ZXJOZXdPY2N1cnJlbmNlczogYmxvY2tlZElkcyhtb2RlbCkgfSwgeyBpZ25vcmVkOiBbXSwgYWZ0ZXJOZXdPY2N1cnJlbmNlczogWydpbnB1dCcsICdjaSddIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIG5vdGhpbmcgYW5kIG5ldmVyIGJsaW5rcyB3aGVuIGRpc2FibGVkIChzdGFibGUgcXVhbGl0eSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsIH0gPSBjcmVhdGVNb2RlbCh7IHF1YWxpdHk6ICdzdGFibGUnIH0pO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KG5ldyBUZXN0U2Vzc2lvbignczEnKSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYmxvY2tlZDogYmxvY2tlZElkcyhtb2RlbCksIGJsaW5rOiBtb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCkgfSwgeyBibG9ja2VkOiBbXSwgYmxpbms6IGZhbHNlIH0pO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBuZWVkc0lucHV0KHNlc3Npb246IFRlc3RTZXNzaW9uKTogSUJsb2NrZWRTZXNzaW9uIHtcblx0cmV0dXJuIHsgc2Vzc2lvbjogc2Vzc2lvbiBhcyB1bmtub3duIGFzIElTZXNzaW9uLCByZWFzb246IEJsb2NrZWRTZXNzaW9uUmVhc29uLk5lZWRzSW5wdXQsIG9jY3VycmVuY2VJZDogQmxvY2tlZFNlc3Npb25SZWFzb24uTmVlZHNJbnB1dCB9O1xufVxuXG5mdW5jdGlvbiBmYWlsaW5nQ0koc2Vzc2lvbjogVGVzdFNlc3Npb24sIGhlYWRTaGE6IHN0cmluZyA9ICdzaGEnKTogSUJsb2NrZWRTZXNzaW9uIHtcblx0cmV0dXJuIHsgc2Vzc2lvbjogc2Vzc2lvbiBhcyB1bmtub3duIGFzIElTZXNzaW9uLCByZWFzb246IEJsb2NrZWRTZXNzaW9uUmVhc29uLkZhaWxpbmdDSSwgb2NjdXJyZW5jZUlkOiBgJHtCbG9ja2VkU2Vzc2lvblJlYXNvbi5GYWlsaW5nQ0l9OiR7aGVhZFNoYX1gIH07XG59XG5cbmZ1bmN0aW9uIGFwcHJvdmFsKGtpbmQ6IEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZCwgc2luY2U6IERhdGUgPSBuZXcgRGF0ZSgpLCBhcHByb3ZhbElkOiBzdHJpbmcgPSBgJHtraW5kfToke3NpbmNlLmdldFRpbWUoKX1gKTogSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB7XG5cdHJldHVybiB7IGFwcHJvdmFsSWQsIGtpbmQsIGxhYmVsOiAnbnBtIHJ1biBidWlsZCcsIGxhbmd1YWdlSWQ6IHVuZGVmaW5lZCwgc2luY2UsIGNvbmZpcm06ICgpID0+IHsgfSB9O1xufVxuXG5jbGFzcyBUZXN0U2Vzc2lvbiB7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGNoYXRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSB7IHJlYWRvbmx5IHJlc291cmNlOiBVUkkgfVtdPjtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZykge1xuXHRcdHRoaXMucmVzb3VyY2UgPSBVUkkucGFyc2UoYHRlc3Qtc2Vzc2lvbjovJHtzZXNzaW9uSWR9YCk7XG5cdFx0dGhpcy5jaGF0cyA9IGNvbnN0T2JzZXJ2YWJsZShbeyByZXNvdXJjZTogdGhpcy5yZXNvdXJjZSB9XSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdEJsb2NrZWRTZXNzaW9ucyB7XG5cdHJlYWRvbmx5IGJsb2NrZWRTZXNzaW9uc1dpdGhSZWFzb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElCbG9ja2VkU2Vzc2lvbltdPignd2l0aFJlYXNvbnMnLCBbXSk7XG5cdHJlYWRvbmx5IGJsb2NrZWRTZXNzaW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJU2Vzc2lvbltdPignYmxvY2tlZCcsIFtdKTtcblxuXHRzZXRCbG9ja2VkKGJsb2NrZWQ6IHJlYWRvbmx5IElCbG9ja2VkU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5ibG9ja2VkU2Vzc2lvbnNXaXRoUmVhc29ucy5zZXQoYmxvY2tlZCwgdHgpO1xuXHRcdFx0dGhpcy5ibG9ja2VkU2Vzc2lvbnMuc2V0KGJsb2NrZWQubWFwKGVudHJ5ID0+IGVudHJ5LnNlc3Npb24pLCB0eCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdEFwcHJvdmFsTW9kZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcHByb3ZhbHMgPSBuZXcgTWFwPHN0cmluZywgSVNldHRhYmxlT2JzZXJ2YWJsZTxJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIHwgdW5kZWZpbmVkPj4oKTtcblxuXHRnZXRBcHByb3ZhbChyZXNvdXJjZTogVVJJKTogSU9ic2VydmFibGU8SUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vYnMocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRzZXRBcHByb3ZhbChyZXNvdXJjZTogVVJJLCBpbmZvOiBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fb2JzKHJlc291cmNlLnRvU3RyaW5nKCkpLnNldChpbmZvLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb2JzKGtleTogc3RyaW5nKTogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IG9icyA9IHRoaXMuX2FwcHJvdmFscy5nZXQoa2V5KTtcblx0XHRpZiAoIW9icykge1xuXHRcdFx0b2JzID0gb2JzZXJ2YWJsZVZhbHVlPElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQ+KGBhcHByb3ZhbC4ke2tleX1gLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fYXBwcm92YWxzLnNldChrZXksIG9icyk7XG5cdFx0fVxuXHRcdHJldHVybiBvYnM7XG5cdH1cbn1cblxuY2xhc3MgVGVzdENJRml4TW9kZWwge1xuXHRyZWFkb25seSBoaWRkZW5TZXNzaW9ucyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+PignY2lGaXhIaWRkZW4nLCBuZXcgU2V0KCkpO1xuXG5cdHNldEhpZGRlbihzZXNzaW9uSWRzOiByZWFkb25seSBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuaGlkZGVuU2Vzc2lvbnMuc2V0KG5ldyBTZXQoc2Vzc2lvbklkcyksIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFNlc3Npb25zU2VydmljZSB7XG5cdHJlYWRvbmx5IHZpc2libGVTZXNzaW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+KCd2aXNpYmxlJywgW10pO1xuXG5cdHNldFZpc2libGUoc2Vzc2lvbnM6IHJlYWRvbmx5IFRlc3RTZXNzaW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLnZpc2libGVTZXNzaW9ucy5zZXQoc2Vzc2lvbnMgYXMgdW5rbm93biBhcyByZWFkb25seSBJQWN0aXZlU2Vzc2lvbltdLCB1bmRlZmluZWQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTLGlCQUFtRCxpQkFBaUIsbUJBQW1CO0FBQ3pHLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFHeEQsU0FBUywwQkFBcUQsOEJBQXlEO0FBSXZILFNBQVMsNEJBQThEO0FBRXZFLFNBQVMsK0JBQStCLHlCQUF5QjtBQUVqRSxNQUFNLGlDQUFpQyxNQUFNO0FBRTVDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsV0FBUyxZQUFZLFNBTW5CO0FBQ0QsVUFBTSxlQUFlLElBQUksb0JBQW9CO0FBQzdDLFVBQU0sZ0JBQWdCLElBQUksa0JBQWtCO0FBQzVDLFVBQU0sYUFBYSxJQUFJLGVBQWU7QUFD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
