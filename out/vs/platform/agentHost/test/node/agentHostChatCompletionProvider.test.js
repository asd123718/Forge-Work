import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, ChatOriginKind, createChatState, createSessionState, MessageAttachmentKind, MessageKind, mergeSessionWithDefaultChat, SessionStatus, TurnState } from "../../common/state/sessionState.js";
import { AgentHostCompletions, CompletionTriggerCharacter } from "../../node/agentHostCompletions.js";
import { AgentHostChatCompletionProvider, extractChatToken } from "../../node/agentHostChatCompletionProvider.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
const SESSION_URI = "ahp-copilot://session-1";
const DEFAULT_CHAT_URI = buildDefaultChatUri(SESSION_URI);
function makeTurn(id) {
  return { id, message: { text: "", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0, state: TurnState.Complete };
}
function makeActiveTurn(id) {
  return { id, startedAt: (/* @__PURE__ */ new Date(0)).toISOString(), message: { text: "", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0 };
}
function makeChatSummary(resource, title, opts) {
  return {
    resource,
    title,
    status: SessionStatus.Idle,
    modifiedAt: opts?.modifiedAt ?? (/* @__PURE__ */ new Date(0)).toISOString(),
    origin: opts?.origin,
    interactivity: opts?.interactivity
  };
}
class FakeStateManager extends AgentHostStateManager {
  constructor(chats, defaultChat) {
    super(new NullLogService());
    this._fixtureChatStates = /* @__PURE__ */ new Map();
    const summary = {
      resource: SESSION_URI,
      provider: "copilot",
      title: "t",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString()
    };
    this._session = mergeSessionWithDefaultChat({ ...createSessionState(summary), chats: chats.map((c) => c.summary), defaultChat }, void 0);
    for (const chat of chats) {
      this._fixtureChatStates.set(chat.summary.resource, { ...createChatState(chat.summary), turns: [...chat.turns ?? []], activeTurn: chat.activeTurn });
    }
  }
  getSessionState() {
    return this._session;
  }
  getChatState(chat) {
    return this._fixtureChatStates.get(chat);
  }
  getDefaultChatState() {
    return this._fixtureChatStates.get(DEFAULT_CHAT_URI);
  }
}
suite("AgentHostChatCompletionProvider", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test('announces only "#" as a trigger character via IAgentHostCompletions', () => {
    const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
    const stateManager = disposables.add(new FakeStateManager([]));
    disposables.add(completions.registerProvider(new AgentHostChatCompletionProvider(stateManager)));
    assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.Hash]);
  });
  suite("extractChatToken", () => {
    test("extracts the title filter and range across the prefix lifecycle", () => {
      assert.deepStrictEqual(
        [
          extractChatToken("hello world", 5),
          // no '#'
          extractChatToken("ping #file", 10),
          // '#file' is not a chat token
          extractChatToken("ping #", 6),
          // bare '#': still could become #chat:
          extractChatToken("ping #ch", 8),
          // typing the 'chat:' prefix
          extractChatToken("ping #chat:", 11),
          // prefix complete, empty filter
          extractChatToken("ping #chat:Pla", 14),
          // filter typed
          extractChatToken("#CHAT:Pla", 9),
          // case-insensitive prefix
          extractChatToken("a#chat:x", 8),
          // '#' not preceded by whitespace
          extractChatToken("#chat:a b", 9)
          // whitespace terminates the token
        ],
        [
          void 0,
          void 0,
          { typed: "", rangeStart: 5, rangeEnd: 6 },
          { typed: "", rangeStart: 5, rangeEnd: 8 },
          { typed: "", rangeStart: 5, rangeEnd: 11 },
          { typed: "Pla", rangeStart: 5, rangeEnd: 14 },
          { typed: "Pla", rangeStart: 0, rangeEnd: 9 },
          void 0,
          void 0
        ]
      );
    });
  });
  suite("provideCompletionItems", () => {
    function run(stateManager, text, offset, channel = DEFAULT_CHAT_URI) {
      const provider = new AgentHostChatCompletionProvider(stateManager);
      return provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel, text, offset },
        CancellationToken.None
      );
    }
    test("returns [] when no chat token is being typed", async () => {
      const stateManager = disposables.add(new FakeStateManager([
        { summary: makeChatSummary(DEFAULT_CHAT_URI, "Default", { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn("d1")] },
        { summary: makeChatSummary(buildChatUri(SESSION_URI, "c1"), "Planning"), turns: [makeTurn("c1-1")] }
      ]));
      assert.deepStrictEqual(await run(stateManager, "see #file", 9), []);
    });
    test("excludes current chat, subagent chats, hidden chats, and chats without a completed turn", async () => {
      const planningUri = buildChatUri(SESSION_URI, "planning");
      const stateManager = disposables.add(new FakeStateManager([
        // current chat (the default chat) — must never be listed
        { summary: makeChatSummary(DEFAULT_CHAT_URI, "Default", { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn("d1")] },
        // a normal peer chat with two completed turns → endTurn is the last one
        { summary: makeChatSummary(planningUri, "Planning notes"), turns: [makeTurn("p1"), makeTurn("p2")] },
        // subagent chat spawned by a tool → excluded
        { summary: makeChatSummary(buildChatUri(SESSION_URI, "sub"), "Worker", { origin: { kind: ChatOriginKind.Tool, chat: DEFAULT_CHAT_URI, toolCallId: "tc1" } }), turns: [makeTurn("s1")] },
        // hidden worker chat → excluded
        { summary: makeChatSummary(buildChatUri(SESSION_URI, "hidden"), "Hidden", { interactivity: ChatInteractivity.Hidden }), turns: [makeTurn("h1")] },
        // only an active turn, no completed turn → skipped
        { summary: makeChatSummary(buildChatUri(SESSION_URI, "active"), "Active", { interactivity: ChatInteractivity.Full }), activeTurn: makeActiveTurn("a1") }
      ]));
      const result = await run(stateManager, "ref #chat:", 10);
      assert.deepStrictEqual(result, [{
        insertText: "#chat:Planning notes ",
        rangeStart: 4,
        rangeEnd: 10,
        attachment: {
          type: MessageAttachmentKind.Chat,
          resource: planningUri,
          endTurn: "p2",
          label: "Planning notes"
        }
      }]);
    });
    test("excludes the default chat when the channel is the session URI", async () => {
      const peerUri = buildChatUri(SESSION_URI, "peer");
      const stateManager = disposables.add(new FakeStateManager([
        { summary: makeChatSummary(DEFAULT_CHAT_URI, "Default", { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn("d1")] },
        { summary: makeChatSummary(peerUri, "Peer"), turns: [makeTurn("e1")] }
      ]));
      const result = await run(stateManager, "#chat:", 6, SESSION_URI);
      assert.deepStrictEqual(result.map((i) => i.attachment), [{
        type: MessageAttachmentKind.Chat,
        resource: peerUri,
        endTurn: "e1",
        label: "Peer"
      }]);
    });
    test("filters by title (case-insensitive) and sorts newest first", async () => {
      const alpha = buildChatUri(SESSION_URI, "alpha");
      const beta = buildChatUri(SESSION_URI, "beta");
      const gamma = buildChatUri(SESSION_URI, "gamma");
      const stateManager = disposables.add(new FakeStateManager([
        { summary: makeChatSummary(DEFAULT_CHAT_URI, "Default", { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn("d1")] },
        { summary: makeChatSummary(alpha, "Alpha review", { modifiedAt: "2025-01-01T00:00:00.000Z" }), turns: [makeTurn("a1")] },
        { summary: makeChatSummary(beta, "Beta review", { modifiedAt: "2025-03-01T00:00:00.000Z" }), turns: [makeTurn("b1")] },
        { summary: makeChatSummary(gamma, "Unrelated", { modifiedAt: "2025-06-01T00:00:00.000Z" }), turns: [makeTurn("g1")] }
      ]));
      const result = await run(stateManager, "#chat:review", 12);
      assert.deepStrictEqual(result.map((i) => i.attachment.label), ["Beta review", "Alpha review"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RDaGF0Q29tcGxldGlvblByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBidWlsZENoYXRVcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIENoYXRJbnRlcmFjdGl2aXR5LCBDaGF0T3JpZ2luS2luZCwgY3JlYXRlQ2hhdFN0YXRlLCBjcmVhdGVTZXNzaW9uU3RhdGUsIE1lc3NhZ2VBdHRhY2htZW50S2luZCwgTWVzc2FnZUtpbmQsIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgU2Vzc2lvblN0YXR1cywgVHVyblN0YXRlLCB0eXBlIEFjdGl2ZVR1cm4sIHR5cGUgQ2hhdE9yaWdpbiwgdHlwZSBDaGF0U3RhdGUsIHR5cGUgQ2hhdFN1bW1hcnksIHR5cGUgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQsIHR5cGUgU2Vzc2lvblN1bW1hcnksIHR5cGUgVHVybiwgdHlwZSBVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbXBsZXRpb25zLCBDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0Q29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhdENvbXBsZXRpb25Qcm92aWRlciwgZXh0cmFjdENoYXRUb2tlbiB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0Q2hhdENvbXBsZXRpb25Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5cbmNvbnN0IFNFU1NJT05fVVJJID0gJ2FocC1jb3BpbG90Oi8vc2Vzc2lvbi0xJztcbmNvbnN0IERFRkFVTFRfQ0hBVF9VUkkgPSBidWlsZERlZmF1bHRDaGF0VXJpKFNFU1NJT05fVVJJKTtcblxuZnVuY3Rpb24gbWFrZVR1cm4oaWQ6IHN0cmluZyk6IFR1cm4ge1xuXHRyZXR1cm4geyBpZCwgbWVzc2FnZTogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LCByZXNwb25zZVBhcnRzOiBbXSwgdXNhZ2U6IHVuZGVmaW5lZCwgc3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSB9O1xufVxuXG5mdW5jdGlvbiBtYWtlQWN0aXZlVHVybihpZDogc3RyaW5nKTogQWN0aXZlVHVybiB7XG5cdHJldHVybiB7IGlkLCBzdGFydGVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksIG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSwgcmVzcG9uc2VQYXJ0czogW10sIHVzYWdlOiB1bmRlZmluZWQgfTtcbn1cblxuZnVuY3Rpb24gbWFrZUNoYXRTdW1tYXJ5KHJlc291cmNlOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIG9wdHM/OiB7IG1vZGlmaWVkQXQ/OiBzdHJpbmc7IG9yaWdpbj86IENoYXRPcmlnaW47IGludGVyYWN0aXZpdHk/OiBDaGF0SW50ZXJhY3Rpdml0eSB9KTogQ2hhdFN1bW1hcnkge1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlLFxuXHRcdHRpdGxlLFxuXHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdG1vZGlmaWVkQXQ6IG9wdHM/Lm1vZGlmaWVkQXQgPz8gbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRvcmlnaW46IG9wdHM/Lm9yaWdpbixcblx0XHRpbnRlcmFjdGl2aXR5OiBvcHRzPy5pbnRlcmFjdGl2aXR5LFxuXHR9O1xufVxuXG4vKipcbiAqIEEgZml4dHVyZSBjaGF0OiBpdHMgY2F0YWxvZyBzdW1tYXJ5IHBsdXMgdGhlIGNvbXBsZXRlZC9hY3RpdmUgdHVybnMgb2YgaXRzXG4gKiB7QGxpbmsgQ2hhdFN0YXRlfS5cbiAqL1xuaW50ZXJmYWNlIElGaXh0dXJlQ2hhdCB7XG5cdHJlYWRvbmx5IHN1bW1hcnk6IENoYXRTdW1tYXJ5O1xuXHRyZWFkb25seSB0dXJucz86IHJlYWRvbmx5IFR1cm5bXTtcblx0cmVhZG9ubHkgYWN0aXZlVHVybj86IEFjdGl2ZVR1cm47XG59XG5cbi8qKlxuICogQSBtaW5pbWFsIHtAbGluayBBZ2VudEhvc3RTdGF0ZU1hbmFnZXJ9IHRoYXQgc2VydmVzIGNvbnRyb2xsZWQgZml4dHVyZXMgZm9yXG4gKiB0aGUgdGhyZWUgcmVhZCBtZXRob2RzIHRoZSBwcm92aWRlciB1c2VzLiBFdmVyeSBjaGF0IHN0YXRlIChkZWZhdWx0IGFuZCBwZWVyKVxuICogaXMga2V5ZWQgYnkgaXRzIHJlc291cmNlIGluIG9uZSBtYXAsIHNvIGBnZXRDaGF0U3RhdGVgIHJlc29sdmVzIHRoZW0gYWxsLlxuICovXG5jbGFzcyBGYWtlU3RhdGVNYW5hZ2VyIGV4dGVuZHMgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbjogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpeHR1cmVDaGF0U3RhdGVzID0gbmV3IE1hcDxzdHJpbmcsIENoYXRTdGF0ZT4oKTtcblxuXHRjb25zdHJ1Y3RvcihjaGF0czogcmVhZG9ubHkgSUZpeHR1cmVDaGF0W10sIGRlZmF1bHRDaGF0Pzogc3RyaW5nKSB7XG5cdFx0c3VwZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5ID0ge1xuXHRcdFx0cmVzb3VyY2U6IFNFU1NJT05fVVJJLFxuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHRpdGxlOiAndCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0fTtcblx0XHR0aGlzLl9zZXNzaW9uID0gbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0KHsgLi4uY3JlYXRlU2Vzc2lvblN0YXRlKHN1bW1hcnkpLCBjaGF0czogY2hhdHMubWFwKGMgPT4gYy5zdW1tYXJ5KSwgZGVmYXVsdENoYXQgfSwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgY2hhdHMpIHtcblx0XHRcdHRoaXMuX2ZpeHR1cmVDaGF0U3RhdGVzLnNldChjaGF0LnN1bW1hcnkucmVzb3VyY2UsIHsgLi4uY3JlYXRlQ2hhdFN0YXRlKGNoYXQuc3VtbWFyeSksIHR1cm5zOiBbLi4uKGNoYXQudHVybnMgPz8gW10pXSwgYWN0aXZlVHVybjogY2hhdC5hY3RpdmVUdXJuIH0pO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGdldFNlc3Npb25TdGF0ZSgpOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb247XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDaGF0U3RhdGUoY2hhdDogVVJJKTogQ2hhdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZml4dHVyZUNoYXRTdGF0ZXMuZ2V0KGNoYXQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0RGVmYXVsdENoYXRTdGF0ZSgpOiBDaGF0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9maXh0dXJlQ2hhdFN0YXRlcy5nZXQoREVGQVVMVF9DSEFUX1VSSSk7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdENoYXRDb21wbGV0aW9uUHJvdmlkZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhbm5vdW5jZXMgb25seSBcIiNcIiBhcyBhIHRyaWdnZXIgY2hhcmFjdGVyIHZpYSBJQWdlbnRIb3N0Q29tcGxldGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENvbXBsZXRpb25zKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlU3RhdGVNYW5hZ2VyKFtdKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbXBsZXRpb25zLnJlZ2lzdGVyUHJvdmlkZXIobmV3IEFnZW50SG9zdENoYXRDb21wbGV0aW9uUHJvdmlkZXIoc3RhdGVNYW5hZ2VyKSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNvbXBsZXRpb25zLnRyaWdnZXJDaGFyYWN0ZXJzXSwgW0NvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyLkhhc2hdKTtcblx0fSk7XG5cblx0c3VpdGUoJ2V4dHJhY3RDaGF0VG9rZW4nLCAoKSA9PiB7XG5cdFx0dGVzdCgnZXh0cmFjdHMgdGhlIHRpdGxlIGZpbHRlciBhbmQgcmFuZ2UgYWNyb3NzIHRoZSBwcmVmaXggbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGV4dHJhY3RDaGF0VG9rZW4oJ2hlbGxvIHdvcmxkJywgNSksICAgICAgICAgIC8vIG5vICcjJ1xuXHRcdFx0XHRcdGV4dHJhY3RDaGF0VG9rZW4oJ3BpbmcgI2ZpbGUnLCAxMCksICAgICAgICAgIC8vICcjZmlsZScgaXMgbm90IGEgY2hhdCB0b2tlblxuXHRcdFx0XHRcdGV4dHJhY3RDaGF0VG9rZW4oJ3BpbmcgIycsIDYpLCAgICAgICAgICAgICAgIC8vIGJhcmUgJyMnOiBzdGlsbCBjb3VsZCBiZWNvbWUgI2NoYXQ6XG5cdFx0XHRcdFx0ZXh0cmFjdENoYXRUb2tlbigncGluZyAjY2gnLCA4KSwgICAgICAgICAgICAgLy8gdHlwaW5nIHRoZSAnY2hhdDonIHByZWZpeFxuXHRcdFx0XHRcdGV4dHJhY3RDaGF0VG9rZW4oJ3BpbmcgI2NoYXQ6JywgMTEpLCAgICAgICAgIC8vIHByZWZpeCBjb21wbGV0ZSwgZW1wdHkgZmlsdGVyXG5cdFx0XHRcdFx0ZXh0cmFjdENoYXRUb2tlbigncGluZyAjY2hhdDpQbGEnLCAxNCksICAgICAgLy8gZmlsdGVyIHR5cGVkXG5cdFx0XHRcdFx0ZXh0cmFjdENoYXRUb2tlbignI0NIQVQ6UGxhJywgOSksICAgICAgICAgICAgLy8gY2FzZS1pbnNlbnNpdGl2ZSBwcmVmaXhcblx0XHRcdFx0XHRleHRyYWN0Q2hhdFRva2VuKCdhI2NoYXQ6eCcsIDgpLCAgICAgICAgICAgICAvLyAnIycgbm90IHByZWNlZGVkIGJ5IHdoaXRlc3BhY2Vcblx0XHRcdFx0XHRleHRyYWN0Q2hhdFRva2VuKCcjY2hhdDphIGInLCA5KSwgICAgICAgICAgICAvLyB3aGl0ZXNwYWNlIHRlcm1pbmF0ZXMgdGhlIHRva2VuXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHsgdHlwZWQ6ICcnLCByYW5nZVN0YXJ0OiA1LCByYW5nZUVuZDogNiB9LFxuXHRcdFx0XHRcdHsgdHlwZWQ6ICcnLCByYW5nZVN0YXJ0OiA1LCByYW5nZUVuZDogOCB9LFxuXHRcdFx0XHRcdHsgdHlwZWQ6ICcnLCByYW5nZVN0YXJ0OiA1LCByYW5nZUVuZDogMTEgfSxcblx0XHRcdFx0XHR7IHR5cGVkOiAnUGxhJywgcmFuZ2VTdGFydDogNSwgcmFuZ2VFbmQ6IDE0IH0sXG5cdFx0XHRcdFx0eyB0eXBlZDogJ1BsYScsIHJhbmdlU3RhcnQ6IDAsIHJhbmdlRW5kOiA5IH0sXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwcm92aWRlQ29tcGxldGlvbkl0ZW1zJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gcnVuKHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCB0ZXh0OiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBjaGFubmVsID0gREVGQVVMVF9DSEFUX1VSSSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgQWdlbnRIb3N0Q2hhdENvbXBsZXRpb25Qcm92aWRlcihzdGF0ZU1hbmFnZXIpO1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsLCB0ZXh0LCBvZmZzZXQgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgncmV0dXJucyBbXSB3aGVuIG5vIGNoYXQgdG9rZW4gaXMgYmVpbmcgdHlwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VTdGF0ZU1hbmFnZXIoW1xuXHRcdFx0XHR7IHN1bW1hcnk6IG1ha2VDaGF0U3VtbWFyeShERUZBVUxUX0NIQVRfVVJJLCAnRGVmYXVsdCcsIHsgb3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlVzZXIgfSB9KSwgdHVybnM6IFttYWtlVHVybignZDEnKV0gfSxcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoYnVpbGRDaGF0VXJpKFNFU1NJT05fVVJJLCAnYzEnKSwgJ1BsYW5uaW5nJyksIHR1cm5zOiBbbWFrZVR1cm4oJ2MxLTEnKV0gfSxcblx0XHRcdF0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcnVuKHN0YXRlTWFuYWdlciwgJ3NlZSAjZmlsZScsIDkpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlcyBjdXJyZW50IGNoYXQsIHN1YmFnZW50IGNoYXRzLCBoaWRkZW4gY2hhdHMsIGFuZCBjaGF0cyB3aXRob3V0IGEgY29tcGxldGVkIHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbGFubmluZ1VyaSA9IGJ1aWxkQ2hhdFVyaShTRVNTSU9OX1VSSSwgJ3BsYW5uaW5nJyk7XG5cdFx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VTdGF0ZU1hbmFnZXIoW1xuXHRcdFx0XHQvLyBjdXJyZW50IGNoYXQgKHRoZSBkZWZhdWx0IGNoYXQpIFx1MjAxNCBtdXN0IG5ldmVyIGJlIGxpc3RlZFxuXHRcdFx0XHR7IHN1bW1hcnk6IG1ha2VDaGF0U3VtbWFyeShERUZBVUxUX0NIQVRfVVJJLCAnRGVmYXVsdCcsIHsgb3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlVzZXIgfSB9KSwgdHVybnM6IFttYWtlVHVybignZDEnKV0gfSxcblx0XHRcdFx0Ly8gYSBub3JtYWwgcGVlciBjaGF0IHdpdGggdHdvIGNvbXBsZXRlZCB0dXJucyBcdTIxOTIgZW5kVHVybiBpcyB0aGUgbGFzdCBvbmVcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkocGxhbm5pbmdVcmksICdQbGFubmluZyBub3RlcycpLCB0dXJuczogW21ha2VUdXJuKCdwMScpLCBtYWtlVHVybigncDInKV0gfSxcblx0XHRcdFx0Ly8gc3ViYWdlbnQgY2hhdCBzcGF3bmVkIGJ5IGEgdG9vbCBcdTIxOTIgZXhjbHVkZWRcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoYnVpbGRDaGF0VXJpKFNFU1NJT05fVVJJLCAnc3ViJyksICdXb3JrZXInLCB7IG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBERUZBVUxUX0NIQVRfVVJJLCB0b29sQ2FsbElkOiAndGMxJyB9IH0pLCB0dXJuczogW21ha2VUdXJuKCdzMScpXSB9LFxuXHRcdFx0XHQvLyBoaWRkZW4gd29ya2VyIGNoYXQgXHUyMTkyIGV4Y2x1ZGVkXG5cdFx0XHRcdHsgc3VtbWFyeTogbWFrZUNoYXRTdW1tYXJ5KGJ1aWxkQ2hhdFVyaShTRVNTSU9OX1VSSSwgJ2hpZGRlbicpLCAnSGlkZGVuJywgeyBpbnRlcmFjdGl2aXR5OiBDaGF0SW50ZXJhY3Rpdml0eS5IaWRkZW4gfSksIHR1cm5zOiBbbWFrZVR1cm4oJ2gxJyldIH0sXG5cdFx0XHRcdC8vIG9ubHkgYW4gYWN0aXZlIHR1cm4sIG5vIGNvbXBsZXRlZCB0dXJuIFx1MjE5MiBza2lwcGVkXG5cdFx0XHRcdHsgc3VtbWFyeTogbWFrZUNoYXRTdW1tYXJ5KGJ1aWxkQ2hhdFVyaShTRVNTSU9OX1VSSSwgJ2FjdGl2ZScpLCAnQWN0aXZlJywgeyBpbnRlcmFjdGl2aXR5OiBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsIH0pLCBhY3RpdmVUdXJuOiBtYWtlQWN0aXZlVHVybignYTEnKSB9LFxuXHRcdFx0XSkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4oc3RhdGVNYW5hZ2VyLCAncmVmICNjaGF0OicsIDEwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRcdGluc2VydFRleHQ6ICcjY2hhdDpQbGFubmluZyBub3RlcyAnLFxuXHRcdFx0XHRyYW5nZVN0YXJ0OiA0LFxuXHRcdFx0XHRyYW5nZUVuZDogMTAsXG5cdFx0XHRcdGF0dGFjaG1lbnQ6IHtcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdCxcblx0XHRcdFx0XHRyZXNvdXJjZTogcGxhbm5pbmdVcmksXG5cdFx0XHRcdFx0ZW5kVHVybjogJ3AyJyxcblx0XHRcdFx0XHRsYWJlbDogJ1BsYW5uaW5nIG5vdGVzJyxcblx0XHRcdFx0fSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2x1ZGVzIHRoZSBkZWZhdWx0IGNoYXQgd2hlbiB0aGUgY2hhbm5lbCBpcyB0aGUgc2Vzc2lvbiBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwZWVyVXJpID0gYnVpbGRDaGF0VXJpKFNFU1NJT05fVVJJLCAncGVlcicpO1xuXHRcdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlU3RhdGVNYW5hZ2VyKFtcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoREVGQVVMVF9DSEFUX1VSSSwgJ0RlZmF1bHQnLCB7IG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Vc2VyIH0gfSksIHR1cm5zOiBbbWFrZVR1cm4oJ2QxJyldIH0sXG5cdFx0XHRcdHsgc3VtbWFyeTogbWFrZUNoYXRTdW1tYXJ5KHBlZXJVcmksICdQZWVyJyksIHR1cm5zOiBbbWFrZVR1cm4oJ2UxJyldIH0sXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4oc3RhdGVNYW5hZ2VyLCAnI2NoYXQ6JywgNiwgU0VTU0lPTl9VUkkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGkgPT4gaS5hdHRhY2htZW50KSwgW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdHJlc291cmNlOiBwZWVyVXJpLFxuXHRcdFx0XHRlbmRUdXJuOiAnZTEnLFxuXHRcdFx0XHRsYWJlbDogJ1BlZXInLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBieSB0aXRsZSAoY2FzZS1pbnNlbnNpdGl2ZSkgYW5kIHNvcnRzIG5ld2VzdCBmaXJzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFscGhhID0gYnVpbGRDaGF0VXJpKFNFU1NJT05fVVJJLCAnYWxwaGEnKTtcblx0XHRcdGNvbnN0IGJldGEgPSBidWlsZENoYXRVcmkoU0VTU0lPTl9VUkksICdiZXRhJyk7XG5cdFx0XHRjb25zdCBnYW1tYSA9IGJ1aWxkQ2hhdFVyaShTRVNTSU9OX1VSSSwgJ2dhbW1hJyk7XG5cdFx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VTdGF0ZU1hbmFnZXIoW1xuXHRcdFx0XHR7IHN1bW1hcnk6IG1ha2VDaGF0U3VtbWFyeShERUZBVUxUX0NIQVRfVVJJLCAnRGVmYXVsdCcsIHsgb3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlVzZXIgfSB9KSwgdHVybnM6IFttYWtlVHVybignZDEnKV0gfSxcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoYWxwaGEsICdBbHBoYSByZXZpZXcnLCB7IG1vZGlmaWVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonIH0pLCB0dXJuczogW21ha2VUdXJuKCdhMScpXSB9LFxuXHRcdFx0XHR7IHN1bW1hcnk6IG1ha2VDaGF0U3VtbWFyeShiZXRhLCAnQmV0YSByZXZpZXcnLCB7IG1vZGlmaWVkQXQ6ICcyMDI1LTAzLTAxVDAwOjAwOjAwLjAwMFonIH0pLCB0dXJuczogW21ha2VUdXJuKCdiMScpXSB9LFxuXHRcdFx0XHR7IHN1bW1hcnk6IG1ha2VDaGF0U3VtbWFyeShnYW1tYSwgJ1VucmVsYXRlZCcsIHsgbW9kaWZpZWRBdDogJzIwMjUtMDYtMDFUMDA6MDA6MDAuMDAwWicgfSksIHR1cm5zOiBbbWFrZVR1cm4oJ2cxJyldIH0sXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4oc3RhdGVNYW5hZ2VyLCAnI2NoYXQ6cmV2aWV3JywgMTIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGkgPT4gaS5hdHRhY2htZW50LmxhYmVsKSwgWydCZXRhIHJldmlldycsICdBbHBoYSByZXZpZXcnXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7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
