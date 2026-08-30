import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MessageKind, ResponsePartKind, TurnState } from "../../common/state/sessionState.js";
import { buildSideChatSourceContext, decodeProviderData, encodeProviderData, injectSideChatContext, prepareSideChatPrompt, resolveSideChatBoundary, sliceSideChatTurns, stripSideChatContext } from "../../node/agentPeerChats.js";
suite("agentPeerChats", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const sourceTurn = {
    id: "source-turn",
    state: TurnState.Complete,
    message: { text: "source question", origin: { kind: MessageKind.User } },
    responseParts: [],
    usage: void 0
  };
  const sideChat = {
    source: "ahp-chat://default/source",
    turnId: sourceTurn.id,
    inheritedTurnId: sourceTurn.id
  };
  const countOccurrences = (value, needle) => value.split(needle).length - 1;
  test("first prompt prefers explanation and remains hidden from visible history", () => {
    const prepared = prepareSideChatPrompt("What is happening?", [sourceTurn], sideChat);
    const visible = stripSideChatContext([{
      ...sourceTurn,
      id: "side-turn",
      message: { ...sourceTurn.message, text: prepared }
    }], sideChat);
    assert.deepStrictEqual({
      hasGuidance: prepared.includes("Prefer explanation over action; do not make changes or carry out work unless the user explicitly asks."),
      visiblePrompt: visible[0]?.message.text
    }, {
      hasGuidance: true,
      visiblePrompt: "What is happening?"
    });
  });
  test("later prompts are not wrapped again", () => {
    const existingSideTurn = {
      ...sourceTurn,
      id: "side-turn",
      message: { ...sourceTurn.message, text: "What is happening?" }
    };
    assert.strictEqual(prepareSideChatPrompt("Follow up", [sourceTurn, existingSideTurn], sideChat), "Follow up");
  });
  test("injects selected text exactly once and keeps it out of visible history", () => {
    const selectedText = "  selected text  ";
    const prepared = prepareSideChatPrompt("Explain the branch", [sourceTurn], {
      ...sideChat,
      selection: { text: selectedText }
    });
    const visible = stripSideChatContext([{
      ...sourceTurn,
      id: "side-turn",
      message: { ...sourceTurn.message, text: prepared }
    }], sideChat);
    assert.deepStrictEqual({
      selectedTextCount: countOccurrences(prepared, "Selected text:"),
      includesExactSelection: prepared.includes(selectedText),
      visiblePrompt: visible[0]?.message.text
    }, {
      selectedTextCount: 1,
      includesExactSelection: true,
      visiblePrompt: "Explain the branch"
    });
  });
  test("captures the first active user message even without completed turns", () => {
    assert.strictEqual(buildSideChatSourceContext([], {
      id: "active",
      message: { text: "current question", origin: { kind: MessageKind.User } },
      responseParts: [],
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usage: void 0
    }), "User request:\ncurrent question");
  });
  test("captures completed context before an active turn", () => {
    assert.strictEqual(buildSideChatSourceContext([{
      ...sourceTurn,
      responseParts: [{ kind: ResponsePartKind.Markdown, id: "source-md", content: "source answer" }]
    }], {
      id: "active",
      message: { text: "follow-up question", origin: { kind: MessageKind.User } },
      responseParts: [],
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usage: void 0
    }), "User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\nfollow-up question");
  });
  test("does not duplicate active source context when the inherited transcript already contains the source turn", () => {
    const partialResponse = "partial answer";
    const prepared = prepareSideChatPrompt("Explain the branch", [{
      id: "active-turn",
      state: TurnState.Complete,
      message: { text: "current question", origin: { kind: MessageKind.User } },
      responseParts: [{ kind: ResponsePartKind.Markdown, id: "active-md", content: partialResponse }],
      usage: void 0
    }], {
      source: "ahp-chat://default/source",
      turnId: "active-turn",
      inheritedTurnId: "active-turn",
      context: "User request:\ncurrent question",
      partialResponse
    });
    assert.strictEqual(prepared, injectSideChatContext("Explain the branch"));
  });
  test("injects active source context exactly once when the inherited transcript is missing the source turn", () => {
    const sourceContext = "User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\ncurrent question";
    const partialResponse = "partial answer";
    const prepared = prepareSideChatPrompt("Explain the branch", [{
      ...sourceTurn,
      responseParts: [{ kind: ResponsePartKind.Markdown, id: "source-md", content: "source answer" }]
    }], {
      source: "ahp-chat://default/source",
      turnId: "active-turn",
      inheritedTurnId: sourceTurn.id,
      context: sourceContext,
      partialResponse
    });
    assert.deepStrictEqual({
      prepared,
      activeQuestionCount: countOccurrences(prepared, "User request:\ncurrent question"),
      partialResponseCount: countOccurrences(prepared, partialResponse)
    }, {
      prepared: injectSideChatContext("Explain the branch", partialResponse, sourceContext),
      activeQuestionCount: 1,
      partialResponseCount: 1
    });
  });
  test("injects completed local-turn context even when the inherited transcript already contains the concrete provider anchor", () => {
    const sourceContext = "User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\n!command";
    const localSideChat = {
      source: "ahp-chat://default/source",
      turnId: "local-turn",
      providerAnchorTurnId: sourceTurn.id,
      inheritedTurnId: sourceTurn.id,
      context: sourceContext
    };
    const prepared = prepareSideChatPrompt("Explain the branch", [sourceTurn], localSideChat);
    assert.deepStrictEqual({
      prepared,
      localQuestionCount: countOccurrences(prepared, "User request:\n!command"),
      sourceQuestionCount: countOccurrences(prepared, "User request:\nsource question")
    }, {
      prepared: injectSideChatContext("Explain the branch", void 0, sourceContext),
      localQuestionCount: 1,
      sourceQuestionCount: 1
    });
  });
  test("strips hidden context even when the source text contains the legacy delimiter", () => {
    const prepared = prepareSideChatPrompt("Visible prompt", [], {
      ...sideChat,
      context: `User request:
contains ${"</side-chat-context>"}

Agent response:
ready`
    });
    const visible = stripSideChatContext([{
      ...sourceTurn,
      id: "side-turn",
      message: { ...sourceTurn.message, text: prepared }
    }], sideChat);
    assert.strictEqual(visible[0]?.message.text, "Visible prompt");
  });
  test("round-trips side-chat selection through provider data", () => {
    const providerData = encodeProviderData({
      sdkSessionId: "sdk-session",
      sideChat: {
        ...sideChat,
        selection: { text: "  selected text  ", responsePartId: "response-part-1" }
      }
    });
    assert.deepStrictEqual(decodeProviderData(providerData)?.sideChat?.selection, {
      text: "  selected text  ",
      responsePartId: "response-part-1"
    });
  });
  test("round-trips the selected agent through provider data", () => {
    const providerData = encodeProviderData({
      sdkSessionId: "sdk-session",
      agent: { uri: "agent://workspace/reviewer" }
    });
    assert.deepStrictEqual(decodeProviderData(providerData)?.agent, {
      uri: "agent://workspace/reviewer"
    });
  });
  test("uses the seed marker for a side chat without an inherited turn id", () => {
    const inheritedTurns = Array.from({ length: 16 }, (_, index) => ({
      ...sourceTurn,
      id: `inherited-${index}`,
      message: { ...sourceTurn.message, text: `inherited ${index}` }
    }));
    const prompt = "Investigate the regression";
    const seedTurn = {
      ...sourceTurn,
      id: "side-chat-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext(prompt) }
    };
    const ownTurns = Array.from({ length: 12 }, (_, index) => ({
      ...sourceTurn,
      id: `own-${index}`,
      message: { ...sourceTurn.message, text: `own ${index}` }
    }));
    const turns = [...inheritedTurns, seedTurn, ...ownTurns];
    const visible = sliceSideChatTurns(turns, { ...sideChat, inheritedTurnId: void 0 });
    assert.deepStrictEqual({
      totalTurnCount: turns.length,
      visibleTurnCount: visible.length,
      firstVisibleText: visible[0]?.message.text,
      hasSideChatContext: visible[0]?.message.text.includes("<side-chat-context>") ?? false
    }, {
      totalTurnCount: 29,
      visibleTurnCount: 13,
      firstVisibleText: prompt,
      hasSideChatContext: false
    });
  });
  test("keeps aligned side-chat boundaries untouched", () => {
    const prompt = "Explain the branch";
    const turns = [
      sourceTurn,
      {
        ...sourceTurn,
        id: "side-chat-seed",
        message: { ...sourceTurn.message, text: injectSideChatContext(prompt) }
      },
      {
        ...sourceTurn,
        id: "own-turn",
        message: { ...sourceTurn.message, text: "Follow up" }
      }
    ];
    const visible = sliceSideChatTurns(turns, sideChat);
    assert.deepStrictEqual({
      boundary: resolveSideChatBoundary(turns, sideChat),
      visibleTurnIds: visible.map((turn) => turn.id),
      visibleTexts: visible.map((turn) => turn.message.text)
    }, {
      boundary: 1,
      visibleTurnIds: ["side-chat-seed", "own-turn"],
      visibleTexts: [prompt, "Follow up"]
    });
  });
  test("uses the aligned child seed instead of an earlier parent side-chat seed", () => {
    const parentSeed = {
      ...sourceTurn,
      id: "parent-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext("Parent prompt") }
    };
    const parentOwnTurn = {
      ...sourceTurn,
      id: "parent-own",
      message: { ...sourceTurn.message, text: "Parent follow up" }
    };
    const childPrompt = "Child prompt";
    const childSeed = {
      ...sourceTurn,
      id: "child-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext(childPrompt) }
    };
    const childOwnTurn = {
      ...sourceTurn,
      id: "child-own",
      message: { ...sourceTurn.message, text: "Child follow up" }
    };
    const turns = [sourceTurn, parentSeed, parentOwnTurn, childSeed, childOwnTurn];
    const childSideChat = { ...sideChat, inheritedTurnId: void 0 };
    const visible = sliceSideChatTurns(turns, childSideChat);
    assert.deepStrictEqual({
      boundary: resolveSideChatBoundary(turns, childSideChat),
      visibleTurnIds: visible.map((turn) => turn.id),
      visibleTexts: visible.map((turn) => turn.message.text)
    }, {
      boundary: 3,
      visibleTurnIds: ["child-seed", "child-own"],
      visibleTexts: [childPrompt, "Child follow up"]
    });
  });
  test("uses the nested child seed when no inherited turn id was persisted", () => {
    const parentSeed = {
      ...sourceTurn,
      id: "parent-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext("Parent prompt") }
    };
    const parentOwnTurn = {
      ...sourceTurn,
      id: "parent-own",
      message: { ...sourceTurn.message, text: "Parent follow up" }
    };
    const childPrompt = "Child prompt";
    const childSeed = {
      ...sourceTurn,
      id: "child-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext(childPrompt) }
    };
    const childOwnTurns = Array.from({ length: 2 }, (_, index) => ({
      ...sourceTurn,
      id: `child-own-${index}`,
      message: { ...sourceTurn.message, text: `Child follow up ${index}` }
    }));
    const turns = [sourceTurn, parentSeed, parentOwnTurn, childSeed, ...childOwnTurns];
    const childSideChat = { ...sideChat, inheritedTurnId: void 0 };
    const visible = sliceSideChatTurns(turns, childSideChat);
    assert.deepStrictEqual({
      boundary: resolveSideChatBoundary(turns, childSideChat),
      visibleTurnIds: visible.map((turn) => turn.id)
    }, {
      boundary: 3,
      visibleTurnIds: ["child-seed", "child-own-0", "child-own-1"]
    });
  });
  test("keeps a nested child that has not sent anything at its inherited turn", () => {
    const parentSeed = {
      ...sourceTurn,
      id: "parent-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext("Parent prompt") }
    };
    const parentOwnTurns = Array.from({ length: 2 }, (_, index) => ({
      ...sourceTurn,
      id: `parent-own-${index}`,
      message: { ...sourceTurn.message, text: `Parent follow up ${index}` }
    }));
    const turns = [sourceTurn, parentSeed, ...parentOwnTurns];
    const childSideChat = { ...sideChat, inheritedTurnId: "parent-own-1" };
    const prepared = prepareSideChatPrompt("Child prompt", turns, childSideChat);
    const visible = sliceSideChatTurns(turns, childSideChat);
    assert.deepStrictEqual({
      boundary: resolveSideChatBoundary(turns, childSideChat),
      visibleTurnIds: visible.map((turn) => turn.id),
      seedsTheFirstPrompt: prepared.startsWith("<side-chat-context>")
    }, {
      boundary: 4,
      visibleTurnIds: [],
      seedsTheFirstPrompt: true
    });
  });
  test("keeps the inherited turn of a nested child that already sent messages", () => {
    const parentSeed = {
      ...sourceTurn,
      id: "parent-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext("Parent prompt") }
    };
    const childSeed = {
      ...sourceTurn,
      id: "child-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext("Child prompt") }
    };
    const turns = [sourceTurn, parentSeed, { ...sourceTurn, id: "parent-own" }, childSeed, { ...sourceTurn, id: "child-own" }];
    const childSideChat = { ...sideChat, inheritedTurnId: "parent-own" };
    const visible = sliceSideChatTurns(turns, childSideChat);
    assert.deepStrictEqual({
      boundary: resolveSideChatBoundary(turns, childSideChat),
      visibleTurnIds: visible.map((turn) => turn.id)
    }, {
      boundary: 3,
      visibleTurnIds: ["child-seed", "child-own"]
    });
  });
  test("falls back to the last marker when the inherited turn is gone", () => {
    const childSeed = {
      ...sourceTurn,
      id: "child-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext("Child prompt") }
    };
    const turns = [sourceTurn, childSeed, { ...sourceTurn, id: "child-own" }];
    const childSideChat = { ...sideChat, inheritedTurnId: "removed-turn" };
    const visible = sliceSideChatTurns(turns, childSideChat);
    assert.deepStrictEqual({
      boundary: resolveSideChatBoundary(turns, childSideChat),
      visibleTurnIds: visible.map((turn) => turn.id)
    }, {
      boundary: 1,
      visibleTurnIds: ["child-seed", "child-own"]
    });
  });
  test("round-trips the inherited turn id through provider data", () => {
    const providerData = encodeProviderData({
      sdkSessionId: "sdk-session",
      sideChat: { ...sideChat, inheritedTurnId: "inherited-3" }
    });
    assert.strictEqual(decodeProviderData(providerData)?.sideChat?.inheritedTurnId, "inherited-3");
  });
  test("uses the inherited turn id when a new side chat has no seed yet", () => {
    const visible = sliceSideChatTurns([sourceTurn], sideChat);
    assert.deepStrictEqual({
      boundary: resolveSideChatBoundary([sourceTurn], sideChat),
      visibleTurnIds: visible.map((turn) => turn.id)
    }, {
      boundary: 1,
      visibleTurnIds: []
    });
  });
  test("does not inject a second seed when using the seed marker fallback", () => {
    const inheritedTurns = Array.from({ length: 16 }, (_, index) => ({
      ...sourceTurn,
      id: `inherited-${index}`,
      message: { ...sourceTurn.message, text: `inherited ${index}` }
    }));
    const seedTurn = {
      ...sourceTurn,
      id: "side-chat-seed",
      message: { ...sourceTurn.message, text: injectSideChatContext("First prompt") }
    };
    const ownTurns = Array.from({ length: 12 }, (_, index) => ({
      ...sourceTurn,
      id: `own-${index}`,
      message: { ...sourceTurn.message, text: `own ${index}` }
    }));
    const turns = [...inheritedTurns, seedTurn, ...ownTurns];
    const prompt = "Follow up";
    const prepared = prepareSideChatPrompt(prompt, turns, { ...sideChat, inheritedTurnId: void 0 });
    assert.deepStrictEqual({
      prepared,
      sideChatContextCount: countOccurrences([...turns.map((turn) => turn.message.text), prepared].join("\n"), "<side-chat-context>")
    }, {
      prepared: prompt,
      sideChatContextCount: 1
    });
  });
  test("treats the transcript as inherited when there is no inherited turn id or seed", () => {
    const turns = Array.from({ length: 21 }, (_, index) => ({
      ...sourceTurn,
      id: `source-${index}`,
      message: { ...sourceTurn.message, text: `source ${index}` }
    }));
    const legacySideChat = { ...sideChat, inheritedTurnId: void 0 };
    const visible = sliceSideChatTurns(turns, legacySideChat);
    assert.deepStrictEqual({
      boundary: resolveSideChatBoundary(turns, legacySideChat),
      visibleTurnCount: visible.length,
      visibleTurnIds: visible.map((turn) => turn.id)
    }, {
      boundary: 21,
      visibleTurnCount: 0,
      visibleTurnIds: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudFBlZXJDaGF0cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVHVyblN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkU2lkZUNoYXRTb3VyY2VDb250ZXh0LCBkZWNvZGVQcm92aWRlckRhdGEsIGVuY29kZVByb3ZpZGVyRGF0YSwgaW5qZWN0U2lkZUNoYXRDb250ZXh0LCBwcmVwYXJlU2lkZUNoYXRQcm9tcHQsIHJlc29sdmVTaWRlQ2hhdEJvdW5kYXJ5LCBzbGljZVNpZGVDaGF0VHVybnMsIHN0cmlwU2lkZUNoYXRDb250ZXh0LCB0eXBlIElQZXJzaXN0ZWRTaWRlQ2hhdCB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRQZWVyQ2hhdHMuanMnO1xuXG5zdWl0ZSgnYWdlbnRQZWVyQ2hhdHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc291cmNlVHVybjogVHVybiA9IHtcblx0XHRpZDogJ3NvdXJjZS10dXJuJyxcblx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3NvdXJjZSBxdWVzdGlvbicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHR9O1xuXHRjb25zdCBzaWRlQ2hhdDogSVBlcnNpc3RlZFNpZGVDaGF0ID0ge1xuXHRcdHNvdXJjZTogJ2FocC1jaGF0Oi8vZGVmYXVsdC9zb3VyY2UnLFxuXHRcdHR1cm5JZDogc291cmNlVHVybi5pZCxcblx0XHRpbmhlcml0ZWRUdXJuSWQ6IHNvdXJjZVR1cm4uaWQsXG5cdH07XG5cblx0Y29uc3QgY291bnRPY2N1cnJlbmNlcyA9ICh2YWx1ZTogc3RyaW5nLCBuZWVkbGU6IHN0cmluZykgPT4gdmFsdWUuc3BsaXQobmVlZGxlKS5sZW5ndGggLSAxO1xuXG5cdHRlc3QoJ2ZpcnN0IHByb21wdCBwcmVmZXJzIGV4cGxhbmF0aW9uIGFuZCByZW1haW5zIGhpZGRlbiBmcm9tIHZpc2libGUgaGlzdG9yeScsICgpID0+IHtcblx0XHRjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVTaWRlQ2hhdFByb21wdCgnV2hhdCBpcyBoYXBwZW5pbmc/JywgW3NvdXJjZVR1cm5dLCBzaWRlQ2hhdCk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHN0cmlwU2lkZUNoYXRDb250ZXh0KFt7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6ICdzaWRlLXR1cm4nLFxuXHRcdFx0bWVzc2FnZTogeyAuLi5zb3VyY2VUdXJuLm1lc3NhZ2UsIHRleHQ6IHByZXBhcmVkIH0sXG5cdFx0fV0sIHNpZGVDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzR3VpZGFuY2U6IHByZXBhcmVkLmluY2x1ZGVzKCdQcmVmZXIgZXhwbGFuYXRpb24gb3ZlciBhY3Rpb247IGRvIG5vdCBtYWtlIGNoYW5nZXMgb3IgY2Fycnkgb3V0IHdvcmsgdW5sZXNzIHRoZSB1c2VyIGV4cGxpY2l0bHkgYXNrcy4nKSxcblx0XHRcdHZpc2libGVQcm9tcHQ6IHZpc2libGVbMF0/Lm1lc3NhZ2UudGV4dCxcblx0XHR9LCB7XG5cdFx0XHRoYXNHdWlkYW5jZTogdHJ1ZSxcblx0XHRcdHZpc2libGVQcm9tcHQ6ICdXaGF0IGlzIGhhcHBlbmluZz8nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXRlciBwcm9tcHRzIGFyZSBub3Qgd3JhcHBlZCBhZ2FpbicsICgpID0+IHtcblx0XHRjb25zdCBleGlzdGluZ1NpZGVUdXJuOiBUdXJuID0ge1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAnc2lkZS10dXJuJyxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiAnV2hhdCBpcyBoYXBwZW5pbmc/JyB9LFxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZVNpZGVDaGF0UHJvbXB0KCdGb2xsb3cgdXAnLCBbc291cmNlVHVybiwgZXhpc3RpbmdTaWRlVHVybl0sIHNpZGVDaGF0KSwgJ0ZvbGxvdyB1cCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmplY3RzIHNlbGVjdGVkIHRleHQgZXhhY3RseSBvbmNlIGFuZCBrZWVwcyBpdCBvdXQgb2YgdmlzaWJsZSBoaXN0b3J5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkVGV4dCA9ICcgIHNlbGVjdGVkIHRleHQgICc7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlU2lkZUNoYXRQcm9tcHQoJ0V4cGxhaW4gdGhlIGJyYW5jaCcsIFtzb3VyY2VUdXJuXSwge1xuXHRcdFx0Li4uc2lkZUNoYXQsXG5cdFx0XHRzZWxlY3Rpb246IHsgdGV4dDogc2VsZWN0ZWRUZXh0IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHN0cmlwU2lkZUNoYXRDb250ZXh0KFt7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6ICdzaWRlLXR1cm4nLFxuXHRcdFx0bWVzc2FnZTogeyAuLi5zb3VyY2VUdXJuLm1lc3NhZ2UsIHRleHQ6IHByZXBhcmVkIH0sXG5cdFx0fV0sIHNpZGVDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VsZWN0ZWRUZXh0Q291bnQ6IGNvdW50T2NjdXJyZW5jZXMocHJlcGFyZWQsICdTZWxlY3RlZCB0ZXh0OicpLFxuXHRcdFx0aW5jbHVkZXNFeGFjdFNlbGVjdGlvbjogcHJlcGFyZWQuaW5jbHVkZXMoc2VsZWN0ZWRUZXh0KSxcblx0XHRcdHZpc2libGVQcm9tcHQ6IHZpc2libGVbMF0/Lm1lc3NhZ2UudGV4dCxcblx0XHR9LCB7XG5cdFx0XHRzZWxlY3RlZFRleHRDb3VudDogMSxcblx0XHRcdGluY2x1ZGVzRXhhY3RTZWxlY3Rpb246IHRydWUsXG5cdFx0XHR2aXNpYmxlUHJvbXB0OiAnRXhwbGFpbiB0aGUgYnJhbmNoJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FwdHVyZXMgdGhlIGZpcnN0IGFjdGl2ZSB1c2VyIG1lc3NhZ2UgZXZlbiB3aXRob3V0IGNvbXBsZXRlZCB0dXJucycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTaWRlQ2hhdFNvdXJjZUNvbnRleHQoW10sIHtcblx0XHRcdGlkOiAnYWN0aXZlJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2N1cnJlbnQgcXVlc3Rpb24nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHR9KSwgJ1VzZXIgcmVxdWVzdDpcXG5jdXJyZW50IHF1ZXN0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcHR1cmVzIGNvbXBsZXRlZCBjb250ZXh0IGJlZm9yZSBhbiBhY3RpdmUgdHVybicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTaWRlQ2hhdFNvdXJjZUNvbnRleHQoW3tcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3NvdXJjZS1tZCcsIGNvbnRlbnQ6ICdzb3VyY2UgYW5zd2VyJyB9XSxcblx0XHR9XSwge1xuXHRcdFx0aWQ6ICdhY3RpdmUnLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnZm9sbG93LXVwIHF1ZXN0aW9uJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0fSksICdVc2VyIHJlcXVlc3Q6XFxuc291cmNlIHF1ZXN0aW9uXFxuXFxuQWdlbnQgcmVzcG9uc2U6XFxuc291cmNlIGFuc3dlclxcblxcbi0tLVxcblxcblVzZXIgcmVxdWVzdDpcXG5mb2xsb3ctdXAgcXVlc3Rpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZHVwbGljYXRlIGFjdGl2ZSBzb3VyY2UgY29udGV4dCB3aGVuIHRoZSBpbmhlcml0ZWQgdHJhbnNjcmlwdCBhbHJlYWR5IGNvbnRhaW5zIHRoZSBzb3VyY2UgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWFsUmVzcG9uc2UgPSAncGFydGlhbCBhbnN3ZXInO1xuXHRcdGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZVNpZGVDaGF0UHJvbXB0KCdFeHBsYWluIHRoZSBicmFuY2gnLCBbe1xuXHRcdFx0aWQ6ICdhY3RpdmUtdHVybicsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnY3VycmVudCBxdWVzdGlvbicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnYWN0aXZlLW1kJywgY29udGVudDogcGFydGlhbFJlc3BvbnNlIH1dLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHR9XSwge1xuXHRcdFx0c291cmNlOiAnYWhwLWNoYXQ6Ly9kZWZhdWx0L3NvdXJjZScsXG5cdFx0XHR0dXJuSWQ6ICdhY3RpdmUtdHVybicsXG5cdFx0XHRpbmhlcml0ZWRUdXJuSWQ6ICdhY3RpdmUtdHVybicsXG5cdFx0XHRjb250ZXh0OiAnVXNlciByZXF1ZXN0OlxcbmN1cnJlbnQgcXVlc3Rpb24nLFxuXHRcdFx0cGFydGlhbFJlc3BvbnNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVkLCBpbmplY3RTaWRlQ2hhdENvbnRleHQoJ0V4cGxhaW4gdGhlIGJyYW5jaCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5qZWN0cyBhY3RpdmUgc291cmNlIGNvbnRleHQgZXhhY3RseSBvbmNlIHdoZW4gdGhlIGluaGVyaXRlZCB0cmFuc2NyaXB0IGlzIG1pc3NpbmcgdGhlIHNvdXJjZSB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZUNvbnRleHQgPSAnVXNlciByZXF1ZXN0OlxcbnNvdXJjZSBxdWVzdGlvblxcblxcbkFnZW50IHJlc3BvbnNlOlxcbnNvdXJjZSBhbnN3ZXJcXG5cXG4tLS1cXG5cXG5Vc2VyIHJlcXVlc3Q6XFxuY3VycmVudCBxdWVzdGlvbic7XG5cdFx0Y29uc3QgcGFydGlhbFJlc3BvbnNlID0gJ3BhcnRpYWwgYW5zd2VyJztcblx0XHRjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVTaWRlQ2hhdFByb21wdCgnRXhwbGFpbiB0aGUgYnJhbmNoJywgW3tcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3NvdXJjZS1tZCcsIGNvbnRlbnQ6ICdzb3VyY2UgYW5zd2VyJyB9XSxcblx0XHR9XSwge1xuXHRcdFx0c291cmNlOiAnYWhwLWNoYXQ6Ly9kZWZhdWx0L3NvdXJjZScsXG5cdFx0XHR0dXJuSWQ6ICdhY3RpdmUtdHVybicsXG5cdFx0XHRpbmhlcml0ZWRUdXJuSWQ6IHNvdXJjZVR1cm4uaWQsXG5cdFx0XHRjb250ZXh0OiBzb3VyY2VDb250ZXh0LFxuXHRcdFx0cGFydGlhbFJlc3BvbnNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcmVwYXJlZCxcblx0XHRcdGFjdGl2ZVF1ZXN0aW9uQ291bnQ6IGNvdW50T2NjdXJyZW5jZXMocHJlcGFyZWQsICdVc2VyIHJlcXVlc3Q6XFxuY3VycmVudCBxdWVzdGlvbicpLFxuXHRcdFx0cGFydGlhbFJlc3BvbnNlQ291bnQ6IGNvdW50T2NjdXJyZW5jZXMocHJlcGFyZWQsIHBhcnRpYWxSZXNwb25zZSksXG5cdFx0fSwge1xuXHRcdFx0cHJlcGFyZWQ6IGluamVjdFNpZGVDaGF0Q29udGV4dCgnRXhwbGFpbiB0aGUgYnJhbmNoJywgcGFydGlhbFJlc3BvbnNlLCBzb3VyY2VDb250ZXh0KSxcblx0XHRcdGFjdGl2ZVF1ZXN0aW9uQ291bnQ6IDEsXG5cdFx0XHRwYXJ0aWFsUmVzcG9uc2VDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5qZWN0cyBjb21wbGV0ZWQgbG9jYWwtdHVybiBjb250ZXh0IGV2ZW4gd2hlbiB0aGUgaW5oZXJpdGVkIHRyYW5zY3JpcHQgYWxyZWFkeSBjb250YWlucyB0aGUgY29uY3JldGUgcHJvdmlkZXIgYW5jaG9yJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZUNvbnRleHQgPSAnVXNlciByZXF1ZXN0OlxcbnNvdXJjZSBxdWVzdGlvblxcblxcbkFnZW50IHJlc3BvbnNlOlxcbnNvdXJjZSBhbnN3ZXJcXG5cXG4tLS1cXG5cXG5Vc2VyIHJlcXVlc3Q6XFxuIWNvbW1hbmQnO1xuXHRcdGNvbnN0IGxvY2FsU2lkZUNoYXQ6IElQZXJzaXN0ZWRTaWRlQ2hhdCA9IHtcblx0XHRcdHNvdXJjZTogJ2FocC1jaGF0Oi8vZGVmYXVsdC9zb3VyY2UnLFxuXHRcdFx0dHVybklkOiAnbG9jYWwtdHVybicsXG5cdFx0XHRwcm92aWRlckFuY2hvclR1cm5JZDogc291cmNlVHVybi5pZCxcblx0XHRcdGluaGVyaXRlZFR1cm5JZDogc291cmNlVHVybi5pZCxcblx0XHRcdGNvbnRleHQ6IHNvdXJjZUNvbnRleHQsXG5cdFx0fTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVTaWRlQ2hhdFByb21wdCgnRXhwbGFpbiB0aGUgYnJhbmNoJywgW3NvdXJjZVR1cm5dLCBsb2NhbFNpZGVDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJlcGFyZWQsXG5cdFx0XHRsb2NhbFF1ZXN0aW9uQ291bnQ6IGNvdW50T2NjdXJyZW5jZXMocHJlcGFyZWQsICdVc2VyIHJlcXVlc3Q6XFxuIWNvbW1hbmQnKSxcblx0XHRcdHNvdXJjZVF1ZXN0aW9uQ291bnQ6IGNvdW50T2NjdXJyZW5jZXMocHJlcGFyZWQsICdVc2VyIHJlcXVlc3Q6XFxuc291cmNlIHF1ZXN0aW9uJyksXG5cdFx0fSwge1xuXHRcdFx0cHJlcGFyZWQ6IGluamVjdFNpZGVDaGF0Q29udGV4dCgnRXhwbGFpbiB0aGUgYnJhbmNoJywgdW5kZWZpbmVkLCBzb3VyY2VDb250ZXh0KSxcblx0XHRcdGxvY2FsUXVlc3Rpb25Db3VudDogMSxcblx0XHRcdHNvdXJjZVF1ZXN0aW9uQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBoaWRkZW4gY29udGV4dCBldmVuIHdoZW4gdGhlIHNvdXJjZSB0ZXh0IGNvbnRhaW5zIHRoZSBsZWdhY3kgZGVsaW1pdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZVNpZGVDaGF0UHJvbXB0KCdWaXNpYmxlIHByb21wdCcsIFtdLCB7XG5cdFx0XHQuLi5zaWRlQ2hhdCxcblx0XHRcdGNvbnRleHQ6IGBVc2VyIHJlcXVlc3Q6XFxuY29udGFpbnMgJHsnPC9zaWRlLWNoYXQtY29udGV4dD4nfVxcblxcbkFnZW50IHJlc3BvbnNlOlxcbnJlYWR5YCxcblx0XHR9KTtcblx0XHRjb25zdCB2aXNpYmxlID0gc3RyaXBTaWRlQ2hhdENvbnRleHQoW3tcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogJ3NpZGUtdHVybicsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogcHJlcGFyZWQgfSxcblx0XHR9XSwgc2lkZUNoYXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpc2libGVbMF0/Lm1lc3NhZ2UudGV4dCwgJ1Zpc2libGUgcHJvbXB0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHNpZGUtY2hhdCBzZWxlY3Rpb24gdGhyb3VnaCBwcm92aWRlciBkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyRGF0YSA9IGVuY29kZVByb3ZpZGVyRGF0YSh7XG5cdFx0XHRzZGtTZXNzaW9uSWQ6ICdzZGstc2Vzc2lvbicsXG5cdFx0XHRzaWRlQ2hhdDoge1xuXHRcdFx0XHQuLi5zaWRlQ2hhdCxcblx0XHRcdFx0c2VsZWN0aW9uOiB7IHRleHQ6ICcgIHNlbGVjdGVkIHRleHQgICcsIHJlc3BvbnNlUGFydElkOiAncmVzcG9uc2UtcGFydC0xJyB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb2RlUHJvdmlkZXJEYXRhKHByb3ZpZGVyRGF0YSk/LnNpZGVDaGF0Py5zZWxlY3Rpb24sIHtcblx0XHRcdHRleHQ6ICcgIHNlbGVjdGVkIHRleHQgICcsXG5cdFx0XHRyZXNwb25zZVBhcnRJZDogJ3Jlc3BvbnNlLXBhcnQtMScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHRoZSBzZWxlY3RlZCBhZ2VudCB0aHJvdWdoIHByb3ZpZGVyIGRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gZW5jb2RlUHJvdmlkZXJEYXRhKHtcblx0XHRcdHNka1Nlc3Npb25JZDogJ3Nkay1zZXNzaW9uJyxcblx0XHRcdGFnZW50OiB7IHVyaTogJ2FnZW50Oi8vd29ya3NwYWNlL3Jldmlld2VyJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWNvZGVQcm92aWRlckRhdGEocHJvdmlkZXJEYXRhKT8uYWdlbnQsIHtcblx0XHRcdHVyaTogJ2FnZW50Oi8vd29ya3NwYWNlL3Jldmlld2VyJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgc2VlZCBtYXJrZXIgZm9yIGEgc2lkZSBjaGF0IHdpdGhvdXQgYW4gaW5oZXJpdGVkIHR1cm4gaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5oZXJpdGVkVHVybnM6IFR1cm5bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDE2IH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogYGluaGVyaXRlZC0ke2luZGV4fWAsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogYGluaGVyaXRlZCAke2luZGV4fWAgfSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgcHJvbXB0ID0gJ0ludmVzdGlnYXRlIHRoZSByZWdyZXNzaW9uJztcblx0XHRjb25zdCBzZWVkVHVybjogVHVybiA9IHtcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogJ3NpZGUtY2hhdC1zZWVkJyxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiBpbmplY3RTaWRlQ2hhdENvbnRleHQocHJvbXB0KSB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgb3duVHVybnM6IFR1cm5bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEyIH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogYG93bi0ke2luZGV4fWAsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogYG93biAke2luZGV4fWAgfSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgdHVybnMgPSBbLi4uaW5oZXJpdGVkVHVybnMsIHNlZWRUdXJuLCAuLi5vd25UdXJuc107XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHNsaWNlU2lkZUNoYXRUdXJucyh0dXJucywgeyAuLi5zaWRlQ2hhdCwgaW5oZXJpdGVkVHVybklkOiB1bmRlZmluZWQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvdGFsVHVybkNvdW50OiB0dXJucy5sZW5ndGgsXG5cdFx0XHR2aXNpYmxlVHVybkNvdW50OiB2aXNpYmxlLmxlbmd0aCxcblx0XHRcdGZpcnN0VmlzaWJsZVRleHQ6IHZpc2libGVbMF0/Lm1lc3NhZ2UudGV4dCxcblx0XHRcdGhhc1NpZGVDaGF0Q29udGV4dDogdmlzaWJsZVswXT8ubWVzc2FnZS50ZXh0LmluY2x1ZGVzKCc8c2lkZS1jaGF0LWNvbnRleHQ+JykgPz8gZmFsc2UsXG5cdFx0fSwge1xuXHRcdFx0dG90YWxUdXJuQ291bnQ6IDI5LFxuXHRcdFx0dmlzaWJsZVR1cm5Db3VudDogMTMsXG5cdFx0XHRmaXJzdFZpc2libGVUZXh0OiBwcm9tcHQsXG5cdFx0XHRoYXNTaWRlQ2hhdENvbnRleHQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBhbGlnbmVkIHNpZGUtY2hhdCBib3VuZGFyaWVzIHVudG91Y2hlZCcsICgpID0+IHtcblx0XHRjb25zdCBwcm9tcHQgPSAnRXhwbGFpbiB0aGUgYnJhbmNoJztcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW1xuXHRcdFx0c291cmNlVHVybixcblx0XHRcdHtcblx0XHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdFx0aWQ6ICdzaWRlLWNoYXQtc2VlZCcsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiBpbmplY3RTaWRlQ2hhdENvbnRleHQocHJvbXB0KSB9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdFx0aWQ6ICdvd24tdHVybicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiAnRm9sbG93IHVwJyB9LFxuXHRcdFx0fSxcblx0XHRdO1xuXHRcdGNvbnN0IHZpc2libGUgPSBzbGljZVNpZGVDaGF0VHVybnModHVybnMsIHNpZGVDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Ym91bmRhcnk6IHJlc29sdmVTaWRlQ2hhdEJvdW5kYXJ5KHR1cm5zLCBzaWRlQ2hhdCksXG5cdFx0XHR2aXNpYmxlVHVybklkczogdmlzaWJsZS5tYXAodHVybiA9PiB0dXJuLmlkKSxcblx0XHRcdHZpc2libGVUZXh0czogdmlzaWJsZS5tYXAodHVybiA9PiB0dXJuLm1lc3NhZ2UudGV4dCksXG5cdFx0fSwge1xuXHRcdFx0Ym91bmRhcnk6IDEsXG5cdFx0XHR2aXNpYmxlVHVybklkczogWydzaWRlLWNoYXQtc2VlZCcsICdvd24tdHVybiddLFxuXHRcdFx0dmlzaWJsZVRleHRzOiBbcHJvbXB0LCAnRm9sbG93IHVwJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGFsaWduZWQgY2hpbGQgc2VlZCBpbnN0ZWFkIG9mIGFuIGVhcmxpZXIgcGFyZW50IHNpZGUtY2hhdCBzZWVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudFNlZWQ6IFR1cm4gPSB7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6ICdwYXJlbnQtc2VlZCcsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogaW5qZWN0U2lkZUNoYXRDb250ZXh0KCdQYXJlbnQgcHJvbXB0JykgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHBhcmVudE93blR1cm46IFR1cm4gPSB7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6ICdwYXJlbnQtb3duJyxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiAnUGFyZW50IGZvbGxvdyB1cCcgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGNoaWxkUHJvbXB0ID0gJ0NoaWxkIHByb21wdCc7XG5cdFx0Y29uc3QgY2hpbGRTZWVkOiBUdXJuID0ge1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAnY2hpbGQtc2VlZCcsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogaW5qZWN0U2lkZUNoYXRDb250ZXh0KGNoaWxkUHJvbXB0KSB9LFxuXHRcdH07XG5cdFx0Y29uc3QgY2hpbGRPd25UdXJuOiBUdXJuID0ge1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAnY2hpbGQtb3duJyxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiAnQ2hpbGQgZm9sbG93IHVwJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgdHVybnMgPSBbc291cmNlVHVybiwgcGFyZW50U2VlZCwgcGFyZW50T3duVHVybiwgY2hpbGRTZWVkLCBjaGlsZE93blR1cm5dO1xuXHRcdGNvbnN0IGNoaWxkU2lkZUNoYXQgPSB7IC4uLnNpZGVDaGF0LCBpbmhlcml0ZWRUdXJuSWQ6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IHZpc2libGUgPSBzbGljZVNpZGVDaGF0VHVybnModHVybnMsIGNoaWxkU2lkZUNoYXQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRib3VuZGFyeTogcmVzb2x2ZVNpZGVDaGF0Qm91bmRhcnkodHVybnMsIGNoaWxkU2lkZUNoYXQpLFxuXHRcdFx0dmlzaWJsZVR1cm5JZHM6IHZpc2libGUubWFwKHR1cm4gPT4gdHVybi5pZCksXG5cdFx0XHR2aXNpYmxlVGV4dHM6IHZpc2libGUubWFwKHR1cm4gPT4gdHVybi5tZXNzYWdlLnRleHQpLFxuXHRcdH0sIHtcblx0XHRcdGJvdW5kYXJ5OiAzLFxuXHRcdFx0dmlzaWJsZVR1cm5JZHM6IFsnY2hpbGQtc2VlZCcsICdjaGlsZC1vd24nXSxcblx0XHRcdHZpc2libGVUZXh0czogW2NoaWxkUHJvbXB0LCAnQ2hpbGQgZm9sbG93IHVwJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIG5lc3RlZCBjaGlsZCBzZWVkIHdoZW4gbm8gaW5oZXJpdGVkIHR1cm4gaWQgd2FzIHBlcnNpc3RlZCcsICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnRTZWVkOiBUdXJuID0ge1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAncGFyZW50LXNlZWQnLFxuXHRcdFx0bWVzc2FnZTogeyAuLi5zb3VyY2VUdXJuLm1lc3NhZ2UsIHRleHQ6IGluamVjdFNpZGVDaGF0Q29udGV4dCgnUGFyZW50IHByb21wdCcpIH0sXG5cdFx0fTtcblx0XHRjb25zdCBwYXJlbnRPd25UdXJuOiBUdXJuID0ge1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAncGFyZW50LW93bicsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogJ1BhcmVudCBmb2xsb3cgdXAnIH0sXG5cdFx0fTtcblx0XHRjb25zdCBjaGlsZFByb21wdCA9ICdDaGlsZCBwcm9tcHQnO1xuXHRcdGNvbnN0IGNoaWxkU2VlZDogVHVybiA9IHtcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogJ2NoaWxkLXNlZWQnLFxuXHRcdFx0bWVzc2FnZTogeyAuLi5zb3VyY2VUdXJuLm1lc3NhZ2UsIHRleHQ6IGluamVjdFNpZGVDaGF0Q29udGV4dChjaGlsZFByb21wdCkgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGNoaWxkT3duVHVybnM6IFR1cm5bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDIgfSwgKF8sIGluZGV4KSA9PiAoe1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiBgY2hpbGQtb3duLSR7aW5kZXh9YCxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiBgQ2hpbGQgZm9sbG93IHVwICR7aW5kZXh9YCB9LFxuXHRcdH0pKTtcblx0XHRjb25zdCB0dXJucyA9IFtzb3VyY2VUdXJuLCBwYXJlbnRTZWVkLCBwYXJlbnRPd25UdXJuLCBjaGlsZFNlZWQsIC4uLmNoaWxkT3duVHVybnNdO1xuXHRcdGNvbnN0IGNoaWxkU2lkZUNoYXQgPSB7IC4uLnNpZGVDaGF0LCBpbmhlcml0ZWRUdXJuSWQ6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IHZpc2libGUgPSBzbGljZVNpZGVDaGF0VHVybnModHVybnMsIGNoaWxkU2lkZUNoYXQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRib3VuZGFyeTogcmVzb2x2ZVNpZGVDaGF0Qm91bmRhcnkodHVybnMsIGNoaWxkU2lkZUNoYXQpLFxuXHRcdFx0dmlzaWJsZVR1cm5JZHM6IHZpc2libGUubWFwKHR1cm4gPT4gdHVybi5pZCksXG5cdFx0fSwge1xuXHRcdFx0Ym91bmRhcnk6IDMsXG5cdFx0XHR2aXNpYmxlVHVybklkczogWydjaGlsZC1zZWVkJywgJ2NoaWxkLW93bi0wJywgJ2NoaWxkLW93bi0xJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGEgbmVzdGVkIGNoaWxkIHRoYXQgaGFzIG5vdCBzZW50IGFueXRoaW5nIGF0IGl0cyBpbmhlcml0ZWQgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnRTZWVkOiBUdXJuID0ge1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAncGFyZW50LXNlZWQnLFxuXHRcdFx0bWVzc2FnZTogeyAuLi5zb3VyY2VUdXJuLm1lc3NhZ2UsIHRleHQ6IGluamVjdFNpZGVDaGF0Q29udGV4dCgnUGFyZW50IHByb21wdCcpIH0sXG5cdFx0fTtcblx0XHRjb25zdCBwYXJlbnRPd25UdXJuczogVHVybltdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMiB9LCAoXywgaW5kZXgpID0+ICh7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6IGBwYXJlbnQtb3duLSR7aW5kZXh9YCxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiBgUGFyZW50IGZvbGxvdyB1cCAke2luZGV4fWAgfSxcblx0XHR9KSk7XG5cdFx0Ly8gVGhlIGNoaWxkIGZvcmtlZCB0aGUgcGFyZW50IHNpZGUgY2hhdCBidXQgaGFzIG5vdCBzZW50IGEgbWVzc2FnZSwgc28gdGhlXG5cdFx0Ly8gb25seSBtYXJrZXIgaW4gaXRzIHRyYW5zY3JpcHQgaXMgdGhlIG9uZSBpdCBpbmhlcml0ZWQgZnJvbSB0aGUgcGFyZW50LlxuXHRcdGNvbnN0IHR1cm5zID0gW3NvdXJjZVR1cm4sIHBhcmVudFNlZWQsIC4uLnBhcmVudE93blR1cm5zXTtcblx0XHRjb25zdCBjaGlsZFNpZGVDaGF0ID0geyAuLi5zaWRlQ2hhdCwgaW5oZXJpdGVkVHVybklkOiAncGFyZW50LW93bi0xJyB9O1xuXHRcdGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZVNpZGVDaGF0UHJvbXB0KCdDaGlsZCBwcm9tcHQnLCB0dXJucywgY2hpbGRTaWRlQ2hhdCk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHNsaWNlU2lkZUNoYXRUdXJucyh0dXJucywgY2hpbGRTaWRlQ2hhdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJvdW5kYXJ5OiByZXNvbHZlU2lkZUNoYXRCb3VuZGFyeSh0dXJucywgY2hpbGRTaWRlQ2hhdCksXG5cdFx0XHR2aXNpYmxlVHVybklkczogdmlzaWJsZS5tYXAodHVybiA9PiB0dXJuLmlkKSxcblx0XHRcdHNlZWRzVGhlRmlyc3RQcm9tcHQ6IHByZXBhcmVkLnN0YXJ0c1dpdGgoJzxzaWRlLWNoYXQtY29udGV4dD4nKSxcblx0XHR9LCB7XG5cdFx0XHRib3VuZGFyeTogNCxcblx0XHRcdHZpc2libGVUdXJuSWRzOiBbXSxcblx0XHRcdHNlZWRzVGhlRmlyc3RQcm9tcHQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRoZSBpbmhlcml0ZWQgdHVybiBvZiBhIG5lc3RlZCBjaGlsZCB0aGF0IGFscmVhZHkgc2VudCBtZXNzYWdlcycsICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnRTZWVkOiBUdXJuID0ge1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAncGFyZW50LXNlZWQnLFxuXHRcdFx0bWVzc2FnZTogeyAuLi5zb3VyY2VUdXJuLm1lc3NhZ2UsIHRleHQ6IGluamVjdFNpZGVDaGF0Q29udGV4dCgnUGFyZW50IHByb21wdCcpIH0sXG5cdFx0fTtcblx0XHRjb25zdCBjaGlsZFNlZWQ6IFR1cm4gPSB7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6ICdjaGlsZC1zZWVkJyxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiBpbmplY3RTaWRlQ2hhdENvbnRleHQoJ0NoaWxkIHByb21wdCcpIH0sXG5cdFx0fTtcblx0XHRjb25zdCB0dXJucyA9IFtzb3VyY2VUdXJuLCBwYXJlbnRTZWVkLCB7IC4uLnNvdXJjZVR1cm4sIGlkOiAncGFyZW50LW93bicgfSwgY2hpbGRTZWVkLCB7IC4uLnNvdXJjZVR1cm4sIGlkOiAnY2hpbGQtb3duJyB9XTtcblx0XHRjb25zdCBjaGlsZFNpZGVDaGF0ID0geyAuLi5zaWRlQ2hhdCwgaW5oZXJpdGVkVHVybklkOiAncGFyZW50LW93bicgfTtcblx0XHRjb25zdCB2aXNpYmxlID0gc2xpY2VTaWRlQ2hhdFR1cm5zKHR1cm5zLCBjaGlsZFNpZGVDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Ym91bmRhcnk6IHJlc29sdmVTaWRlQ2hhdEJvdW5kYXJ5KHR1cm5zLCBjaGlsZFNpZGVDaGF0KSxcblx0XHRcdHZpc2libGVUdXJuSWRzOiB2aXNpYmxlLm1hcCh0dXJuID0+IHR1cm4uaWQpLFxuXHRcdH0sIHtcblx0XHRcdGJvdW5kYXJ5OiAzLFxuXHRcdFx0dmlzaWJsZVR1cm5JZHM6IFsnY2hpbGQtc2VlZCcsICdjaGlsZC1vd24nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgbGFzdCBtYXJrZXIgd2hlbiB0aGUgaW5oZXJpdGVkIHR1cm4gaXMgZ29uZScsICgpID0+IHtcblx0XHRjb25zdCBjaGlsZFNlZWQ6IFR1cm4gPSB7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6ICdjaGlsZC1zZWVkJyxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiBpbmplY3RTaWRlQ2hhdENvbnRleHQoJ0NoaWxkIHByb21wdCcpIH0sXG5cdFx0fTtcblx0XHRjb25zdCB0dXJucyA9IFtzb3VyY2VUdXJuLCBjaGlsZFNlZWQsIHsgLi4uc291cmNlVHVybiwgaWQ6ICdjaGlsZC1vd24nIH1dO1xuXHRcdC8vIEEgdHJ1bmNhdGlvbiByZW1vdmVkIHRoZSByZWNvcmRlZCB0dXJuLCBzbyBpdHMgaWQgbm8gbG9uZ2VyIHJlc29sdmVzLlxuXHRcdGNvbnN0IGNoaWxkU2lkZUNoYXQgPSB7IC4uLnNpZGVDaGF0LCBpbmhlcml0ZWRUdXJuSWQ6ICdyZW1vdmVkLXR1cm4nIH07XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHNsaWNlU2lkZUNoYXRUdXJucyh0dXJucywgY2hpbGRTaWRlQ2hhdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJvdW5kYXJ5OiByZXNvbHZlU2lkZUNoYXRCb3VuZGFyeSh0dXJucywgY2hpbGRTaWRlQ2hhdCksXG5cdFx0XHR2aXNpYmxlVHVybklkczogdmlzaWJsZS5tYXAodHVybiA9PiB0dXJuLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRib3VuZGFyeTogMSxcblx0XHRcdHZpc2libGVUdXJuSWRzOiBbJ2NoaWxkLXNlZWQnLCAnY2hpbGQtb3duJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHRoZSBpbmhlcml0ZWQgdHVybiBpZCB0aHJvdWdoIHByb3ZpZGVyIGRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gZW5jb2RlUHJvdmlkZXJEYXRhKHtcblx0XHRcdHNka1Nlc3Npb25JZDogJ3Nkay1zZXNzaW9uJyxcblx0XHRcdHNpZGVDaGF0OiB7IC4uLnNpZGVDaGF0LCBpbmhlcml0ZWRUdXJuSWQ6ICdpbmhlcml0ZWQtMycgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWNvZGVQcm92aWRlckRhdGEocHJvdmlkZXJEYXRhKT8uc2lkZUNoYXQ/LmluaGVyaXRlZFR1cm5JZCwgJ2luaGVyaXRlZC0zJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGluaGVyaXRlZCB0dXJuIGlkIHdoZW4gYSBuZXcgc2lkZSBjaGF0IGhhcyBubyBzZWVkIHlldCcsICgpID0+IHtcblx0XHRjb25zdCB2aXNpYmxlID0gc2xpY2VTaWRlQ2hhdFR1cm5zKFtzb3VyY2VUdXJuXSwgc2lkZUNoYXQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRib3VuZGFyeTogcmVzb2x2ZVNpZGVDaGF0Qm91bmRhcnkoW3NvdXJjZVR1cm5dLCBzaWRlQ2hhdCksXG5cdFx0XHR2aXNpYmxlVHVybklkczogdmlzaWJsZS5tYXAodHVybiA9PiB0dXJuLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRib3VuZGFyeTogMSxcblx0XHRcdHZpc2libGVUdXJuSWRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaW5qZWN0IGEgc2Vjb25kIHNlZWQgd2hlbiB1c2luZyB0aGUgc2VlZCBtYXJrZXIgZmFsbGJhY2snLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5oZXJpdGVkVHVybnM6IFR1cm5bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDE2IH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogYGluaGVyaXRlZC0ke2luZGV4fWAsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogYGluaGVyaXRlZCAke2luZGV4fWAgfSxcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc2VlZFR1cm46IFR1cm4gPSB7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6ICdzaWRlLWNoYXQtc2VlZCcsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogaW5qZWN0U2lkZUNoYXRDb250ZXh0KCdGaXJzdCBwcm9tcHQnKSB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgb3duVHVybnM6IFR1cm5bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEyIH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogYG93bi0ke2luZGV4fWAsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogYG93biAke2luZGV4fWAgfSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgdHVybnMgPSBbLi4uaW5oZXJpdGVkVHVybnMsIHNlZWRUdXJuLCAuLi5vd25UdXJuc107XG5cdFx0Y29uc3QgcHJvbXB0ID0gJ0ZvbGxvdyB1cCc7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlU2lkZUNoYXRQcm9tcHQocHJvbXB0LCB0dXJucywgeyAuLi5zaWRlQ2hhdCwgaW5oZXJpdGVkVHVybklkOiB1bmRlZmluZWQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByZXBhcmVkLFxuXHRcdFx0c2lkZUNoYXRDb250ZXh0Q291bnQ6IGNvdW50T2NjdXJyZW5jZXMoWy4uLnR1cm5zLm1hcCh0dXJuID0+IHR1cm4ubWVzc2FnZS50ZXh0KSwgcHJlcGFyZWRdLmpvaW4oJ1xcbicpLCAnPHNpZGUtY2hhdC1jb250ZXh0PicpLFxuXHRcdH0sIHtcblx0XHRcdHByZXBhcmVkOiBwcm9tcHQsXG5cdFx0XHRzaWRlQ2hhdENvbnRleHRDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJlYXRzIHRoZSB0cmFuc2NyaXB0IGFzIGluaGVyaXRlZCB3aGVuIHRoZXJlIGlzIG5vIGluaGVyaXRlZCB0dXJuIGlkIG9yIHNlZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnM6IFR1cm5bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDIxIH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogYHNvdXJjZS0ke2luZGV4fWAsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogYHNvdXJjZSAke2luZGV4fWAgfSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgbGVnYWN5U2lkZUNoYXQgPSB7IC4uLnNpZGVDaGF0LCBpbmhlcml0ZWRUdXJuSWQ6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IHZpc2libGUgPSBzbGljZVNpZGVDaGF0VHVybnModHVybnMsIGxlZ2FjeVNpZGVDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Ym91bmRhcnk6IHJlc29sdmVTaWRlQ2hhdEJvdW5kYXJ5KHR1cm5zLCBsZWdhY3lTaWRlQ2hhdCksXG5cdFx0XHR2aXNpYmxlVHVybkNvdW50OiB2aXNpYmxlLmxlbmd0aCxcblx0XHRcdHZpc2libGVUdXJuSWRzOiB2aXNpYmxlLm1hcCh0dXJuID0+IHR1cm4uaWQpLFxuXHRcdH0sIHtcblx0XHRcdGJvdW5kYXJ5OiAyMSxcblx0XHRcdHZpc2libGVUdXJuQ291bnQ6IDAsXG5cdFx0XHR2aXNpYmxlVHVybklkczogW10sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhLGtCQUFrQixpQkFBNEI7QUFDcEUsU0FBUyw0QkFBNEIsb0JBQW9CLG9CQUFvQix1QkFBdUIsdUJBQXVCLHlCQUF5QixvQkFBb0IsNEJBQXFEO0FBRTdOLE1BQU0sa0JBQWtCLE1BQU07QUFFN0IsMENBQXdDO0FBRXhDLFFBQU0sYUFBbUI7QUFBQSxJQUN4QixJQUFJO0FBQUEsSUFDSixPQUFPLFVBQVU7QUFBQSxJQUNqQixTQUFTLEVBQUUsTUFBTSxtQkFBbUIsUUFBUSxFQUFFLE1BQU0sWUFBWSxLQUFLLEVBQUU7QUFBQSxJQUN2RSxlQUFlLENBQUM7QUFBQSxJQUNoQixPQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sV0FBK0I7QUFBQSxJQUNwQyxRQUFRO0FBQUEsSUFDUixRQUFRLFdBQVc7QUFBQSxJQUNuQixpQkFBaUIsV0FBVztBQUFBLEVBQzdCO0FBRUEsUUFBTSxtQkFBbUIsQ0FBQyxPQUFlLFdBQW1CLE1BQU0sTUFBTSxNQUFNLEVBQUUsU0FBUztBQUV6RixPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFVBQU0sV0FBVyxzQkFBc0Isc0JBQXNCLENBQUMsVUFBVSxHQUFHLFFBQVE7QUFDbkYsVUFBTSxVQUFVLHFCQUFxQixDQUFDO0FBQUEsTUFDckMsR0FBRztBQUFBLE1BQ0gsSUFB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
