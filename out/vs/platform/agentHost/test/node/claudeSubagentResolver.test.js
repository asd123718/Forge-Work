import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType } from "../../common/state/protocol/state.js";
import { buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { scanTranscriptForAgentIds, SUBAGENT_ID_SUFFIX_REGEX, SubagentRegistry } from "../../node/claude/claudeSubagentRegistry.js";
import {
  extractSpawningPromptFromTranscript,
  extractCompletedResultTextFromTranscript,
  fetchParentTurns,
  getSubagentTranscript,
  NativeStrategy,
  PromptMatchStrategy,
  ResultMatchStrategy,
  resolveAgentIdViaChain,
  TextSuffixStrategy
} from "../../node/claude/claudeSubagentResolver.js";
class FakeSdkService {
  constructor() {
    this.sessionMessages = /* @__PURE__ */ new Map();
    this.subagentIds = /* @__PURE__ */ new Map();
    this.subagentMessages = /* @__PURE__ */ new Map();
    this.getSessionMessagesCalls = [];
    this.listSubagentsCalls = [];
    this.getSubagentMessagesCalls = [];
  }
  async listSessions() {
    return [];
  }
  async canLoadWithoutDownload() {
    return true;
  }
  async ensureAvailableForDiscovery() {
  }
  async getSessionInfo(_id) {
    return void 0;
  }
  async startup(_p) {
    throw new Error("not used");
  }
  async query(_params) {
    throw new Error("not used");
  }
  async getSessionMessages(sessionId, options) {
    this.getSessionMessagesCalls.push({ sessionId, options });
    if (this.getSessionMessagesRejection) {
      throw this.getSessionMessagesRejection;
    }
    return this.sessionMessages.get(sessionId) ?? [];
  }
  async listSubagents(sessionId, _options) {
    this.listSubagentsCalls.push(sessionId);
    if (this.listSubagentsRejection) {
      throw this.listSubagentsRejection;
    }
    return this.subagentIds.get(sessionId) ?? [];
  }
  async getSubagentMessages(sessionId, agentId, _options) {
    this.getSubagentMessagesCalls.push({ sessionId, agentId });
    if (this.getSubagentMessagesRejection) {
      throw this.getSubagentMessagesRejection;
    }
    return this.subagentMessages.get(`${sessionId}::${agentId}`) ?? [];
  }
  async forkSession() {
    throw new Error("not implemented in test fake");
  }
  async deleteSession() {
    throw new Error("not implemented in test fake");
  }
  async createSdkMcpServer() {
    throw new Error("not implemented in test fake");
  }
  async tool() {
    throw new Error("not implemented in test fake");
  }
}
function makeAgentToolCallTurn(toolCallId, opts) {
  return {
    id: "turn-" + toolCallId,
    message: { text: "", origin: { kind: MessageKind.User } },
    responseParts: [{
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        toolCallId,
        toolName: opts.toolName ?? "Task",
        displayName: "Task",
        status: opts.status ?? ToolCallStatus.Completed,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        invocationMessage: "invoking task",
        toolInput: opts.prompt !== void 0 ? JSON.stringify({ prompt: opts.prompt, description: "d" }) : void 0,
        success: true,
        pastTenseMessage: "task done",
        content: opts.suffixText !== void 0 ? [{ type: ToolResultContentType.Text, text: opts.suffixText }] : void 0
      }
    }],
    state: 0,
    startedAt: "1970-01-01T00:00:00.001Z",
    duration: 2,
    usage: void 0
  };
}
suite("claudeSubagentResolver \u2014 SUBAGENT_ID_SUFFIX_REGEX", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches canonical and drifted formats; rejects unrelated text", () => {
    const results = [
      "agentId: abc123 (use SendMessage with to: 'abc123') ...",
      "agentId:   abc123\n",
      // multiple spaces
      "  agentId: abc123",
      // leading whitespace
      "AgentId: ABC123",
      // mixed case rejected? — regex is case-insensitive
      "noise\nagentId: xyz789 trailing",
      // multi-line, anchored to line start
      "agentid:abc",
      // missing space after colon — rejected
      "description: not an agent id"
    ].map((input) => {
      const m = SUBAGENT_ID_SUFFIX_REGEX.exec(input);
      return m ? m[1] : void 0;
    });
    assert.deepStrictEqual(results, [
      "abc123",
      "abc123",
      "abc123",
      "ABC123",
      "xyz789",
      void 0,
      void 0
    ]);
  });
});
suite("claudeSubagentResolver \u2014 TextSuffixStrategy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("hits when parent transcript carries the synthetic suffix; misses otherwise", async () => {
    const sdk = new FakeSdkService();
    const strat = new TextSuffixStrategy(sdk, new NullLogService());
    const parentUri = URI.parse("copilot:/parent-sid");
    const ctx = {
      parentUri,
      parentSessionId: "parent-sid",
      parentTranscript: [
        makeAgentToolCallTurn("toolu_hit", { suffixText: "whatever\nagentId: a7b3c1d2\n(trailing)" }),
        makeAgentToolCallTurn("toolu_no_suffix", { suffixText: "just text, no marker" })
      ],
      token: CancellationToken.None
    };
    assert.deepStrictEqual({
      hit: await strat.lookup("toolu_hit", ctx),
      miss: await strat.lookup("toolu_no_suffix", ctx),
      unknown: await strat.lookup("toolu_unknown", ctx)
    }, { hit: "a7b3c1d2", miss: void 0, unknown: void 0 });
  });
});
suite("claudeSubagentResolver \u2014 PromptMatchStrategy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("finds the agent whose first user message matches the parent Agent.tool_use.input.prompt; rejects malformed input", async () => {
    const sdk = new FakeSdkService();
    const parentUri = URI.parse("copilot:/parent-sid");
    sdk.subagentIds.set("parent-sid", ["agentother", "agenttarget"]);
    sdk.subagentMessages.set("parent-sid::agentother", [{
      type: "user",
      message: { content: [{ type: "text", text: "different prompt" }] }
    }]);
    sdk.subagentMessages.set("parent-sid::agenttarget", [{
      type: "user",
      message: { content: "do the thing" }
    }]);
    const strat = new PromptMatchStrategy(sdk, new NullLogService());
    const ctx = {
      parentUri,
      parentSessionId: "parent-sid",
      parentTranscript: [
        makeAgentToolCallTurn("toolu_target", { prompt: "do the thing" }),
        makeAgentToolCallTurn("toolu_malformed", { prompt: void 0 })
        // missing toolInput
      ],
      token: CancellationToken.None
    };
    assert.deepStrictEqual({
      matched: await strat.lookup("toolu_target", ctx),
      malformed: await strat.lookup("toolu_malformed", ctx),
      unknownToolCall: await strat.lookup("toolu_does_not_exist", ctx)
    }, {
      matched: "agenttarget",
      malformed: void 0,
      unknownToolCall: void 0
    });
    suite("claudeSubagentResolver \u2014 ResultMatchStrategy", () => {
      ensureNoDisposablesAreLeakedInTestSuite();
      test("finds a child whose final assistant result matches the completed parent tool result", async () => {
        const sdk2 = new FakeSdkService();
        sdk2.subagentIds.set("parent-sid", ["agentother", "agenttarget"]);
        sdk2.subagentMessages.set("parent-sid::agentother", [{
          type: "assistant",
          message: { content: [{ type: "text", text: "different result" }] }
        }]);
        sdk2.subagentMessages.set("parent-sid::agenttarget", [{
          type: "assistant",
          message: { content: [{ type: "thinking", thinking: "working" }] }
        }, {
          type: "assistant",
          message: { content: [{ type: "text", text: "matched result" }] }
        }]);
        const transcript = [makeAgentToolCallTurn("toolu_target", { suffixText: "matched result" })];
        const strategy = new ResultMatchStrategy(sdk2, new NullLogService());
        assert.deepStrictEqual({
          extracted: extractCompletedResultTextFromTranscript(transcript, "toolu_target"),
          matched: await strategy.lookup("toolu_target", {
            parentUri: URI.parse("claude:/parent-sid"),
            parentSessionId: "parent-sid",
            parentTranscript: transcript,
            token: CancellationToken.None
          })
        }, {
          extracted: "matched result",
          matched: "agenttarget"
        });
      });
      test("does not choose between children with the same final assistant result", async () => {
        const sdk2 = new FakeSdkService();
        sdk2.subagentIds.set("parent-sid", ["agentone", "agenttwo"]);
        for (const agentId of ["agentone", "agenttwo"]) {
          sdk2.subagentMessages.set(`parent-sid::${agentId}`, [{
            type: "assistant",
            message: { content: [{ type: "text", text: "Done." }] }
          }]);
        }
        const transcript = [makeAgentToolCallTurn("toolu_target", { suffixText: "Done." })];
        const strategy = new ResultMatchStrategy(sdk2, new NullLogService());
        assert.strictEqual(await strategy.lookup("toolu_target", {
          parentUri: URI.parse("claude:/parent-sid"),
          parentSessionId: "parent-sid",
          parentTranscript: transcript,
          token: CancellationToken.None
        }), void 0);
      });
    });
  });
});
suite("claudeSubagentResolver \u2014 NativeStrategy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("placeholder returns undefined", async () => {
    const strat = new NativeStrategy();
    assert.strictEqual(await strat.lookup(), void 0);
  });
});
suite("claudeSubagentResolver \u2014 scanTranscriptForAgentIds", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("extracts every (toolCallId, agentId) pair in one pass; skips unrelated tools", () => {
    const transcript = [
      makeAgentToolCallTurn("toolu_a", { suffixText: "agentId: agenta1" }),
      makeAgentToolCallTurn("toolu_b", { suffixText: "no marker" }),
      makeAgentToolCallTurn("toolu_c", { suffixText: "agentId: agentc1", toolName: "Bash" }),
      // non-subagent tool
      makeAgentToolCallTurn("toolu_d", { suffixText: "agentId: agentd1", toolName: "Agent" })
    ];
    const pairs = scanTranscriptForAgentIds(transcript);
    assert.deepStrictEqual([...pairs.entries()].sort(), [
      ["toolu_a", "agenta1"],
      ["toolu_d", "agentd1"]
    ]);
  });
});
suite("claudeSubagentResolver \u2014 getSubagentTranscript", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("cache hit on registry short-circuits SDK fetch; cache miss runs strategy chain and writes resolved agentId back to the registry; subsequent reads hit the cache", async () => {
    const sdk = new FakeSdkService();
    const log = new NullLogService();
    const parentUri = URI.parse("copilot:/parent-sid");
    const registry = disposables.add(new SubagentRegistry());
    registry.primeFromTranscript([
      makeAgentToolCallTurn("toolu_a", { suffixText: "agentId: agentprimeda" })
    ]);
    registry.recordSpawn("toolu_b", { agentId: "agentliveb" });
    sdk.subagentMessages.set("parent-sid::agentprimeda", []);
    sdk.subagentMessages.set("parent-sid::agentliveb", []);
    const subagentUriA = URI.parse(buildSubagentSessionUri(parentUri, "toolu_a"));
    const subagentUriB = URI.parse(buildSubagentSessionUri(parentUri, "toolu_b"));
    await getSubagentTranscript(subagentUriA, parentUri, "parent-sid", "toolu_a", registry, sdk, log, CancellationToken.None);
    await getSubagentTranscript(subagentUriB, parentUri, "parent-sid", "toolu_b", registry, sdk, log, CancellationToken.None);
    assert.deepStrictEqual({
      fetchedAgentIds: sdk.getSubagentMessagesCalls.map((c) => c.agentId),
      spawnA: registry.getSpawn("toolu_a")?.agentId,
      spawnB: registry.getSpawn("toolu_b")?.agentId
    }, {
      fetchedAgentIds: ["agentprimeda", "agentliveb"],
      spawnA: "agentprimeda",
      spawnB: "agentliveb"
    });
  });
  test("unresolvable agentId returns [] (no SDK fetch attempted) and SDK fetch failure returns [] with warn-log", async () => {
    const sdk = new FakeSdkService();
    const log = new NullLogService();
    const parentUri = URI.parse("copilot:/parent-sid");
    const registry = disposables.add(new SubagentRegistry());
    const noResolve = await getSubagentTranscript(
      URI.parse(buildSubagentSessionUri(parentUri, "toolu_unknown")),
      parentUri,
      "parent-sid",
      "toolu_unknown",
      registry,
      sdk,
      log,
      CancellationToken.None
    );
    registry.recordSpawn("toolu_known", { agentId: "agent-x" });
    sdk.getSubagentMessagesRejection = new Error("boom");
    const onError = await getSubagentTranscript(
      URI.parse(buildSubagentSessionUri(parentUri, "toolu_known")),
      parentUri,
      "parent-sid",
      "toolu_known",
      registry,
      sdk,
      log,
      CancellationToken.None
    );
    assert.deepStrictEqual({
      noResolve,
      onError,
      fetchAttempts: sdk.getSubagentMessagesCalls.map((c) => c.agentId)
    }, {
      noResolve: [],
      onError: [],
      fetchAttempts: ["agent-x"]
      // only the cached-hit attempted
    });
  });
});
suite("claudeSubagentResolver \u2014 resolveAgentIdViaChain (free function)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeStrategy(name, returns, onCall) {
    return {
      name,
      lookup: async () => {
        onCall?.();
        return returns;
      }
    };
  }
  const ctx = (token = CancellationToken.None) => ({
    parentUri: URI.parse("copilot:/p"),
    parentSessionId: "p",
    token
  });
  function makeDeps(strategies) {
    const cache = /* @__PURE__ */ new Map();
    const cacheReads = [];
    const cacheWrites = [];
    return {
      strategies,
      cacheReads,
      cacheWrites,
      cacheGet: (id) => {
        cacheReads.push(id);
        return cache.get(id);
      },
      cacheSet: (id, agentId) => {
        cacheWrites.push({ id, agentId });
        cache.set(id, agentId);
      },
      seedCache: (id, agentId) => cache.set(id, agentId)
    };
  }
  test("cache hit short-circuits before any strategy runs", async () => {
    const calls = [];
    const deps = makeDeps([
      makeStrategy("s1", "should-not-fire", () => calls.push("s1"))
    ]);
    deps.seedCache("toolu", "cached-agent");
    const out = await resolveAgentIdViaChain("toolu", ctx(), deps);
    assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
      out: "cached-agent",
      calls: [],
      cacheWrites: []
    });
  });
  test("chain ordering: first non-undefined hit wins, later strategies skipped, cache populated", async () => {
    const calls = [];
    const deps = makeDeps([
      makeStrategy("s1", void 0, () => calls.push("s1")),
      makeStrategy("s2", "agent-from-s2", () => calls.push("s2")),
      makeStrategy("s3", "agent-from-s3", () => calls.push("s3"))
    ]);
    const out = await resolveAgentIdViaChain("toolu", ctx(), deps);
    assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
      out: "agent-from-s2",
      calls: ["s1", "s2"],
      cacheWrites: [{ id: "toolu", agentId: "agent-from-s2" }]
    });
  });
  test("full miss returns undefined and writes nothing", async () => {
    const deps = makeDeps([
      makeStrategy("s1", void 0),
      makeStrategy("s2", void 0)
    ]);
    const out = await resolveAgentIdViaChain("toolu", ctx(), deps);
    assert.deepStrictEqual({ out, cacheWrites: deps.cacheWrites }, {
      out: void 0,
      cacheWrites: []
    });
  });
  test("cancellation between strategies stops the chain", async () => {
    const tokenSource = new CancellationTokenSource();
    const calls = [];
    const deps = makeDeps([
      makeStrategy("s1", void 0, () => {
        calls.push("s1");
        tokenSource.cancel();
      }),
      makeStrategy("s2", "never-reached", () => calls.push("s2"))
    ]);
    const out = await resolveAgentIdViaChain("toolu", ctx(tokenSource.token), deps);
    assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
      out: void 0,
      calls: ["s1"],
      cacheWrites: []
    });
  });
});
suite("claudeSubagentResolver \u2014 extractSpawningPromptFromTranscript", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns prompt for matching subagent tool; rejects malformed/streaming/wrong-tool", () => {
    const transcript = [
      makeAgentToolCallTurn("toolu_match", { prompt: "do the thing" }),
      makeAgentToolCallTurn("toolu_streaming", { prompt: "unfinished", status: void 0 }),
      makeAgentToolCallTurn("toolu_wrong_tool", { prompt: "p", toolName: "Read" }),
      makeAgentToolCallTurn("toolu_bad_json", {})
    ];
    transcript[1].responseParts[0].toolCall.status = ToolCallStatus.Streaming;
    transcript[3].responseParts[0].toolCall.toolInput = "{not json";
    assert.deepStrictEqual({
      match: extractSpawningPromptFromTranscript(transcript, "toolu_match"),
      streaming: extractSpawningPromptFromTranscript(transcript, "toolu_streaming"),
      wrongTool: extractSpawningPromptFromTranscript(transcript, "toolu_wrong_tool"),
      badJson: extractSpawningPromptFromTranscript(transcript, "toolu_bad_json"),
      missing: extractSpawningPromptFromTranscript(transcript, "toolu_unknown")
    }, {
      match: "do the thing",
      streaming: void 0,
      wrongTool: void 0,
      badJson: void 0,
      missing: void 0
    });
  });
});
suite("claudeSubagentResolver \u2014 fetchParentTurns", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns ctx.parentTranscript without calling SDK; falls through to SDK; logs and returns undefined on SDK error", async () => {
    const sdk = new FakeSdkService();
    const log = new NullLogService();
    const baseCtx = (overrides) => ({
      parentSessionId: "sess-1",
      parentUri: URI.parse("file:///parent"),
      token: CancellationToken.None,
      ...overrides
    });
    const cached = [];
    const fromCache = await fetchParentTurns(sdk, log, baseCtx({ parentTranscript: cached }), "L");
    const fromSdk = await fetchParentTurns(sdk, log, baseCtx({}), "L");
    sdk.getSessionMessagesRejection = new Error("boom");
    const onError = await fetchParentTurns(sdk, log, baseCtx({}), "L");
    assert.deepStrictEqual({
      fromCacheIsCached: fromCache === cached,
      fromCacheCallCount: 0,
      fromSdkIsArray: Array.isArray(fromSdk),
      onError,
      totalSdkCalls: sdk.getSessionMessagesCalls.length
    }, {
      fromCacheIsCached: true,
      fromCacheCallCount: 0,
      fromSdkIsArray: true,
      onError: void 0,
      totalSdkCalls: 2
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVTdWJhZ2VudFJlc29sdmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSB7IEdldFNlc3Npb25NZXNzYWdlc09wdGlvbnMsIEdldFN1YmFnZW50TWVzc2FnZXNPcHRpb25zLCBMaXN0U3ViYWdlbnRzT3B0aW9ucywgT3B0aW9ucywgUXVlcnksIFNES1Nlc3Npb25JbmZvLCBTREtVc2VyTWVzc2FnZSwgU2Vzc2lvbk1lc3NhZ2UsIFdhcm1RdWVyeSB9IGZyb20gJ0BhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNkayc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIHR5cGUgVHVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZFN1YmFnZW50U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUNsYXVkZUFnZW50U2RrU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZUFnZW50U2RrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzY2FuVHJhbnNjcmlwdEZvckFnZW50SWRzLCBTVUJBR0VOVF9JRF9TVUZGSVhfUkVHRVgsIFN1YmFnZW50UmVnaXN0cnkgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVTdWJhZ2VudFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7XG5cdGV4dHJhY3RTcGF3bmluZ1Byb21wdEZyb21UcmFuc2NyaXB0LFxuXHRleHRyYWN0Q29tcGxldGVkUmVzdWx0VGV4dEZyb21UcmFuc2NyaXB0LFxuXHRmZXRjaFBhcmVudFR1cm5zLFxuXHRnZXRTdWJhZ2VudFRyYW5zY3JpcHQsXG5cdHR5cGUgSVN1YmFnZW50TG9va3VwQ29udGV4dCxcblx0dHlwZSBJU3ViYWdlbnRMb29rdXBTdHJhdGVneSxcblx0TmF0aXZlU3RyYXRlZ3ksXG5cdFByb21wdE1hdGNoU3RyYXRlZ3ksXG5cdFJlc3VsdE1hdGNoU3RyYXRlZ3ksXG5cdHJlc29sdmVBZ2VudElkVmlhQ2hhaW4sXG5cdFRleHRTdWZmaXhTdHJhdGVneSxcbn0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlU3ViYWdlbnRSZXNvbHZlci5qcyc7XG5cbmNsYXNzIEZha2VTZGtTZXJ2aWNlIGltcGxlbWVudHMgSUNsYXVkZUFnZW50U2RrU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHNlc3Npb25NZXNzYWdlcyA9IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBTZXNzaW9uTWVzc2FnZVtdPigpO1xuXHRzdWJhZ2VudElkcyA9IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBzdHJpbmdbXT4oKTtcblx0c3ViYWdlbnRNZXNzYWdlcyA9IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBTZXNzaW9uTWVzc2FnZVtdPigpO1xuXG5cdGxpc3RTZXNzaW9uc1JlamVjdGlvbjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdGdldFNlc3Npb25NZXNzYWdlc1JlamVjdGlvbjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdGxpc3RTdWJhZ2VudHNSZWplY3Rpb246IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRnZXRTdWJhZ2VudE1lc3NhZ2VzUmVqZWN0aW9uOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRnZXRTZXNzaW9uTWVzc2FnZXNDYWxsczogeyBzZXNzaW9uSWQ6IHN0cmluZzsgb3B0aW9uczogdW5rbm93biB9W10gPSBbXTtcblx0bGlzdFN1YmFnZW50c0NhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRnZXRTdWJhZ2VudE1lc3NhZ2VzQ2FsbHM6IHsgc2Vzc2lvbklkOiBzdHJpbmc7IGFnZW50SWQ6IHN0cmluZyB9W10gPSBbXTtcblxuXHRhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxyZWFkb25seSBTREtTZXNzaW9uSW5mb1tdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBjYW5Mb2FkV2l0aG91dERvd25sb2FkKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyBlbnN1cmVBdmFpbGFibGVGb3JEaXNjb3ZlcnkoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ2V0U2Vzc2lvbkluZm8oX2lkOiBzdHJpbmcpOiBQcm9taXNlPFNES1Nlc3Npb25JbmZvIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgc3RhcnR1cChfcDogeyBvcHRpb25zOiBPcHRpb25zOyBpbml0aWFsaXplVGltZW91dE1zPzogbnVtYmVyIH0pOiBQcm9taXNlPFdhcm1RdWVyeT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgcXVlcnkoX3BhcmFtczogeyBwcm9tcHQ6IHN0cmluZyB8IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+OyBvcHRpb25zPzogT3B0aW9ucyB9KTogUHJvbWlzZTxRdWVyeT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb25JZDogc3RyaW5nLCBvcHRpb25zPzogR2V0U2Vzc2lvbk1lc3NhZ2VzT3B0aW9ucyk6IFByb21pc2U8cmVhZG9ubHkgU2Vzc2lvbk1lc3NhZ2VbXT4ge1xuXHRcdHRoaXMuZ2V0U2Vzc2lvbk1lc3NhZ2VzQ2FsbHMucHVzaCh7IHNlc3Npb25JZCwgb3B0aW9ucyB9KTtcblx0XHRpZiAodGhpcy5nZXRTZXNzaW9uTWVzc2FnZXNSZWplY3Rpb24pIHsgdGhyb3cgdGhpcy5nZXRTZXNzaW9uTWVzc2FnZXNSZWplY3Rpb247IH1cblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uTWVzc2FnZXMuZ2V0KHNlc3Npb25JZCkgPz8gW107XG5cdH1cblx0YXN5bmMgbGlzdFN1YmFnZW50cyhzZXNzaW9uSWQ6IHN0cmluZywgX29wdGlvbnM/OiBMaXN0U3ViYWdlbnRzT3B0aW9ucyk6IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+IHtcblx0XHR0aGlzLmxpc3RTdWJhZ2VudHNDYWxscy5wdXNoKHNlc3Npb25JZCk7XG5cdFx0aWYgKHRoaXMubGlzdFN1YmFnZW50c1JlamVjdGlvbikgeyB0aHJvdyB0aGlzLmxpc3RTdWJhZ2VudHNSZWplY3Rpb247IH1cblx0XHRyZXR1cm4gdGhpcy5zdWJhZ2VudElkcy5nZXQoc2Vzc2lvbklkKSA/PyBbXTtcblx0fVxuXHRhc3luYyBnZXRTdWJhZ2VudE1lc3NhZ2VzKHNlc3Npb25JZDogc3RyaW5nLCBhZ2VudElkOiBzdHJpbmcsIF9vcHRpb25zPzogR2V0U3ViYWdlbnRNZXNzYWdlc09wdGlvbnMpOiBQcm9taXNlPHJlYWRvbmx5IFNlc3Npb25NZXNzYWdlW10+IHtcblx0XHR0aGlzLmdldFN1YmFnZW50TWVzc2FnZXNDYWxscy5wdXNoKHsgc2Vzc2lvbklkLCBhZ2VudElkIH0pO1xuXHRcdGlmICh0aGlzLmdldFN1YmFnZW50TWVzc2FnZXNSZWplY3Rpb24pIHsgdGhyb3cgdGhpcy5nZXRTdWJhZ2VudE1lc3NhZ2VzUmVqZWN0aW9uOyB9XG5cdFx0cmV0dXJuIHRoaXMuc3ViYWdlbnRNZXNzYWdlcy5nZXQoYCR7c2Vzc2lvbklkfTo6JHthZ2VudElkfWApID8/IFtdO1xuXHR9XG5cdGFzeW5jIGZvcmtTZXNzaW9uKCk6IFByb21pc2U8bmV2ZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBmYWtlJyk7IH1cblx0YXN5bmMgZGVsZXRlU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBmYWtlJyk7IH1cblx0YXN5bmMgY3JlYXRlU2RrTWNwU2VydmVyKCk6IFByb21pc2U8bmV2ZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBmYWtlJyk7IH1cblx0YXN5bmMgdG9vbCgpOiBQcm9taXNlPG5ldmVyPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkIGluIHRlc3QgZmFrZScpOyB9XG59XG5cbmZ1bmN0aW9uIG1ha2VBZ2VudFRvb2xDYWxsVHVybih0b29sQ2FsbElkOiBzdHJpbmcsIG9wdHM6IHsgcHJvbXB0Pzogc3RyaW5nOyBzdWZmaXhUZXh0Pzogc3RyaW5nOyB0b29sTmFtZT86IHN0cmluZzsgc3RhdHVzPzogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIH0pOiBUdXJuIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ3R1cm4tJyArIHRvb2xDYWxsSWQsXG5cdFx0bWVzc2FnZTogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6IG9wdHMudG9vbE5hbWUgPz8gJ1Rhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rhc2snLFxuXHRcdFx0XHRzdGF0dXM6IG9wdHMuc3RhdHVzID8/IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnaW52b2tpbmcgdGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogb3B0cy5wcm9tcHQgIT09IHVuZGVmaW5lZCA/IEpTT04uc3RyaW5naWZ5KHsgcHJvbXB0OiBvcHRzLnByb21wdCwgZGVzY3JpcHRpb246ICdkJyB9KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ3Rhc2sgZG9uZScsXG5cdFx0XHRcdGNvbnRlbnQ6IG9wdHMuc3VmZml4VGV4dCAhPT0gdW5kZWZpbmVkID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IG9wdHMuc3VmZml4VGV4dCB9XSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fV0sXG5cdFx0c3RhdGU6IDAgYXMgdW5rbm93biBhcyBUdXJuWydzdGF0ZSddLFxuXHRcdHN0YXJ0ZWRBdDogJzE5NzAtMDEtMDFUMDA6MDA6MDAuMDAxWicsXG5cdFx0ZHVyYXRpb246IDIsXG5cdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0fSBhcyBUdXJuO1xufVxuXG5zdWl0ZSgnY2xhdWRlU3ViYWdlbnRSZXNvbHZlciBcdTIwMTQgU1VCQUdFTlRfSURfU1VGRklYX1JFR0VYJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXRjaGVzIGNhbm9uaWNhbCBhbmQgZHJpZnRlZCBmb3JtYXRzOyByZWplY3RzIHVucmVsYXRlZCB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBbXG5cdFx0XHQnYWdlbnRJZDogYWJjMTIzICh1c2UgU2VuZE1lc3NhZ2Ugd2l0aCB0bzogXFwnYWJjMTIzXFwnKSAuLi4nLFxuXHRcdFx0J2FnZW50SWQ6ICAgYWJjMTIzXFxuJywgLy8gbXVsdGlwbGUgc3BhY2VzXG5cdFx0XHQnICBhZ2VudElkOiBhYmMxMjMnLCAvLyBsZWFkaW5nIHdoaXRlc3BhY2Vcblx0XHRcdCdBZ2VudElkOiBBQkMxMjMnLCAvLyBtaXhlZCBjYXNlIHJlamVjdGVkPyBcdTIwMTQgcmVnZXggaXMgY2FzZS1pbnNlbnNpdGl2ZVxuXHRcdFx0J25vaXNlXFxuYWdlbnRJZDogeHl6Nzg5IHRyYWlsaW5nJywgLy8gbXVsdGktbGluZSwgYW5jaG9yZWQgdG8gbGluZSBzdGFydFxuXHRcdFx0J2FnZW50aWQ6YWJjJywgLy8gbWlzc2luZyBzcGFjZSBhZnRlciBjb2xvbiBcdTIwMTQgcmVqZWN0ZWRcblx0XHRcdCdkZXNjcmlwdGlvbjogbm90IGFuIGFnZW50IGlkJyxcblx0XHRdLm1hcChpbnB1dCA9PiB7XG5cdFx0XHRjb25zdCBtID0gU1VCQUdFTlRfSURfU1VGRklYX1JFR0VYLmV4ZWMoaW5wdXQpO1xuXHRcdFx0cmV0dXJuIG0gPyBtWzFdIDogdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywgW1xuXHRcdFx0J2FiYzEyMycsXG5cdFx0XHQnYWJjMTIzJyxcblx0XHRcdCdhYmMxMjMnLFxuXHRcdFx0J0FCQzEyMycsXG5cdFx0XHQneHl6Nzg5Jyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NsYXVkZVN1YmFnZW50UmVzb2x2ZXIgXHUyMDE0IFRleHRTdWZmaXhTdHJhdGVneScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaGl0cyB3aGVuIHBhcmVudCB0cmFuc2NyaXB0IGNhcnJpZXMgdGhlIHN5bnRoZXRpYyBzdWZmaXg7IG1pc3NlcyBvdGhlcndpc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2RrID0gbmV3IEZha2VTZGtTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RyYXQgPSBuZXcgVGV4dFN1ZmZpeFN0cmF0ZWd5KHNkaywgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHBhcmVudFVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovcGFyZW50LXNpZCcpO1xuXHRcdGNvbnN0IGN0eDogSVN1YmFnZW50TG9va3VwQ29udGV4dCA9IHtcblx0XHRcdHBhcmVudFVyaSxcblx0XHRcdHBhcmVudFNlc3Npb25JZDogJ3BhcmVudC1zaWQnLFxuXHRcdFx0cGFyZW50VHJhbnNjcmlwdDogW1xuXHRcdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X2hpdCcsIHsgc3VmZml4VGV4dDogJ3doYXRldmVyXFxuYWdlbnRJZDogYTdiM2MxZDJcXG4odHJhaWxpbmcpJyB9KSxcblx0XHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV9ub19zdWZmaXgnLCB7IHN1ZmZpeFRleHQ6ICdqdXN0IHRleHQsIG5vIG1hcmtlcicgfSksXG5cdFx0XHRdLFxuXHRcdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhpdDogYXdhaXQgc3RyYXQubG9va3VwKCd0b29sdV9oaXQnLCBjdHgpLFxuXHRcdFx0bWlzczogYXdhaXQgc3RyYXQubG9va3VwKCd0b29sdV9ub19zdWZmaXgnLCBjdHgpLFxuXHRcdFx0dW5rbm93bjogYXdhaXQgc3RyYXQubG9va3VwKCd0b29sdV91bmtub3duJywgY3R4KSxcblx0XHR9LCB7IGhpdDogJ2E3YjNjMWQyJywgbWlzczogdW5kZWZpbmVkLCB1bmtub3duOiB1bmRlZmluZWQgfSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCBQcm9tcHRNYXRjaFN0cmF0ZWd5JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmaW5kcyB0aGUgYWdlbnQgd2hvc2UgZmlyc3QgdXNlciBtZXNzYWdlIG1hdGNoZXMgdGhlIHBhcmVudCBBZ2VudC50b29sX3VzZS5pbnB1dC5wcm9tcHQ7IHJlamVjdHMgbWFsZm9ybWVkIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNkayA9IG5ldyBGYWtlU2RrU2VydmljZSgpO1xuXHRcdGNvbnN0IHBhcmVudFVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovcGFyZW50LXNpZCcpO1xuXHRcdHNkay5zdWJhZ2VudElkcy5zZXQoJ3BhcmVudC1zaWQnLCBbJ2FnZW50b3RoZXInLCAnYWdlbnR0YXJnZXQnXSk7XG5cdFx0c2RrLnN1YmFnZW50TWVzc2FnZXMuc2V0KCdwYXJlbnQtc2lkOjphZ2VudG90aGVyJywgW3tcblx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdG1lc3NhZ2U6IHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZGlmZmVyZW50IHByb21wdCcgfV0gfSxcblx0XHR9IGFzIHVua25vd24gYXMgU2Vzc2lvbk1lc3NhZ2VdKTtcblx0XHRzZGsuc3ViYWdlbnRNZXNzYWdlcy5zZXQoJ3BhcmVudC1zaWQ6OmFnZW50dGFyZ2V0JywgW3tcblx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdG1lc3NhZ2U6IHsgY29udGVudDogJ2RvIHRoZSB0aGluZycgfSxcblx0XHR9IGFzIHVua25vd24gYXMgU2Vzc2lvbk1lc3NhZ2VdKTtcblxuXHRcdGNvbnN0IHN0cmF0ID0gbmV3IFByb21wdE1hdGNoU3RyYXRlZ3koc2RrLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY3R4OiBJU3ViYWdlbnRMb29rdXBDb250ZXh0ID0ge1xuXHRcdFx0cGFyZW50VXJpLFxuXHRcdFx0cGFyZW50U2Vzc2lvbklkOiAncGFyZW50LXNpZCcsXG5cdFx0XHRwYXJlbnRUcmFuc2NyaXB0OiBbXG5cdFx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfdGFyZ2V0JywgeyBwcm9tcHQ6ICdkbyB0aGUgdGhpbmcnIH0pLFxuXHRcdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X21hbGZvcm1lZCcsIHsgcHJvbXB0OiB1bmRlZmluZWQgfSksIC8vIG1pc3NpbmcgdG9vbElucHV0XG5cdFx0XHRdLFxuXHRcdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWF0Y2hlZDogYXdhaXQgc3RyYXQubG9va3VwKCd0b29sdV90YXJnZXQnLCBjdHgpLFxuXHRcdFx0bWFsZm9ybWVkOiBhd2FpdCBzdHJhdC5sb29rdXAoJ3Rvb2x1X21hbGZvcm1lZCcsIGN0eCksXG5cdFx0XHR1bmtub3duVG9vbENhbGw6IGF3YWl0IHN0cmF0Lmxvb2t1cCgndG9vbHVfZG9lc19ub3RfZXhpc3QnLCBjdHgpLFxuXHRcdH0sIHtcblx0XHRcdG1hdGNoZWQ6ICdhZ2VudHRhcmdldCcsXG5cdFx0XHRtYWxmb3JtZWQ6IHVuZGVmaW5lZCxcblx0XHRcdHVua25vd25Ub29sQ2FsbDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2NsYXVkZVN1YmFnZW50UmVzb2x2ZXIgXHUyMDE0IFJlc3VsdE1hdGNoU3RyYXRlZ3knLCAoKSA9PiB7XG5cdFx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdFx0dGVzdCgnZmluZHMgYSBjaGlsZCB3aG9zZSBmaW5hbCBhc3Npc3RhbnQgcmVzdWx0IG1hdGNoZXMgdGhlIGNvbXBsZXRlZCBwYXJlbnQgdG9vbCByZXN1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNkayA9IG5ldyBGYWtlU2RrU2VydmljZSgpO1xuXHRcdFx0XHRzZGsuc3ViYWdlbnRJZHMuc2V0KCdwYXJlbnQtc2lkJywgWydhZ2VudG90aGVyJywgJ2FnZW50dGFyZ2V0J10pO1xuXHRcdFx0XHRzZGsuc3ViYWdlbnRNZXNzYWdlcy5zZXQoJ3BhcmVudC1zaWQ6OmFnZW50b3RoZXInLCBbe1xuXHRcdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZGlmZmVyZW50IHJlc3VsdCcgfV0gfSxcblx0XHRcdFx0fSBhcyB1bmtub3duIGFzIFNlc3Npb25NZXNzYWdlXSk7XG5cdFx0XHRcdHNkay5zdWJhZ2VudE1lc3NhZ2VzLnNldCgncGFyZW50LXNpZDo6YWdlbnR0YXJnZXQnLCBbe1xuXHRcdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgY29udGVudDogW3sgdHlwZTogJ3RoaW5raW5nJywgdGhpbmtpbmc6ICd3b3JraW5nJyB9XSB9LFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2Fzc2lzdGFudCcsXG5cdFx0XHRcdFx0bWVzc2FnZTogeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdtYXRjaGVkIHJlc3VsdCcgfV0gfSxcblx0XHRcdFx0fV0gYXMgdW5rbm93biBhcyBTZXNzaW9uTWVzc2FnZVtdKTtcblx0XHRcdFx0Y29uc3QgdHJhbnNjcmlwdCA9IFttYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X3RhcmdldCcsIHsgc3VmZml4VGV4dDogJ21hdGNoZWQgcmVzdWx0JyB9KV07XG5cdFx0XHRcdGNvbnN0IHN0cmF0ZWd5ID0gbmV3IFJlc3VsdE1hdGNoU3RyYXRlZ3koc2RrLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0ZXh0cmFjdGVkOiBleHRyYWN0Q29tcGxldGVkUmVzdWx0VGV4dEZyb21UcmFuc2NyaXB0KHRyYW5zY3JpcHQsICd0b29sdV90YXJnZXQnKSxcblx0XHRcdFx0XHRtYXRjaGVkOiBhd2FpdCBzdHJhdGVneS5sb29rdXAoJ3Rvb2x1X3RhcmdldCcsIHtcblx0XHRcdFx0XHRcdHBhcmVudFVyaTogVVJJLnBhcnNlKCdjbGF1ZGU6L3BhcmVudC1zaWQnKSxcblx0XHRcdFx0XHRcdHBhcmVudFNlc3Npb25JZDogJ3BhcmVudC1zaWQnLFxuXHRcdFx0XHRcdFx0cGFyZW50VHJhbnNjcmlwdDogdHJhbnNjcmlwdCxcblx0XHRcdFx0XHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0ZXh0cmFjdGVkOiAnbWF0Y2hlZCByZXN1bHQnLFxuXHRcdFx0XHRcdG1hdGNoZWQ6ICdhZ2VudHRhcmdldCcsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2RvZXMgbm90IGNob29zZSBiZXR3ZWVuIGNoaWxkcmVuIHdpdGggdGhlIHNhbWUgZmluYWwgYXNzaXN0YW50IHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2RrID0gbmV3IEZha2VTZGtTZXJ2aWNlKCk7XG5cdFx0XHRcdHNkay5zdWJhZ2VudElkcy5zZXQoJ3BhcmVudC1zaWQnLCBbJ2FnZW50b25lJywgJ2FnZW50dHdvJ10pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFnZW50SWQgb2YgWydhZ2VudG9uZScsICdhZ2VudHR3byddKSB7XG5cdFx0XHRcdFx0c2RrLnN1YmFnZW50TWVzc2FnZXMuc2V0KGBwYXJlbnQtc2lkOjoke2FnZW50SWR9YCwgW3tcblx0XHRcdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQnLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogeyBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdEb25lLicgfV0gfSxcblx0XHRcdFx0XHR9IGFzIHVua25vd24gYXMgU2Vzc2lvbk1lc3NhZ2VdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB0cmFuc2NyaXB0ID0gW21ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfdGFyZ2V0JywgeyBzdWZmaXhUZXh0OiAnRG9uZS4nIH0pXTtcblx0XHRcdFx0Y29uc3Qgc3RyYXRlZ3kgPSBuZXcgUmVzdWx0TWF0Y2hTdHJhdGVneShzZGssIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc3RyYXRlZ3kubG9va3VwKCd0b29sdV90YXJnZXQnLCB7XG5cdFx0XHRcdFx0cGFyZW50VXJpOiBVUkkucGFyc2UoJ2NsYXVkZTovcGFyZW50LXNpZCcpLFxuXHRcdFx0XHRcdHBhcmVudFNlc3Npb25JZDogJ3BhcmVudC1zaWQnLFxuXHRcdFx0XHRcdHBhcmVudFRyYW5zY3JpcHQ6IHRyYW5zY3JpcHQsXG5cdFx0XHRcdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHRcdH0pLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCBOYXRpdmVTdHJhdGVneScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGxhY2Vob2xkZXIgcmV0dXJucyB1bmRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RyYXQgPSBuZXcgTmF0aXZlU3RyYXRlZ3koKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc3RyYXQubG9va3VwKCksIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCBzY2FuVHJhbnNjcmlwdEZvckFnZW50SWRzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdleHRyYWN0cyBldmVyeSAodG9vbENhbGxJZCwgYWdlbnRJZCkgcGFpciBpbiBvbmUgcGFzczsgc2tpcHMgdW5yZWxhdGVkIHRvb2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zY3JpcHQ6IHJlYWRvbmx5IFR1cm5bXSA9IFtcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfYScsIHsgc3VmZml4VGV4dDogJ2FnZW50SWQ6IGFnZW50YTEnIH0pLFxuXHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV9iJywgeyBzdWZmaXhUZXh0OiAnbm8gbWFya2VyJyB9KSxcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfYycsIHsgc3VmZml4VGV4dDogJ2FnZW50SWQ6IGFnZW50YzEnLCB0b29sTmFtZTogJ0Jhc2gnIH0pLCAvLyBub24tc3ViYWdlbnQgdG9vbFxuXHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV9kJywgeyBzdWZmaXhUZXh0OiAnYWdlbnRJZDogYWdlbnRkMScsIHRvb2xOYW1lOiAnQWdlbnQnIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcGFpcnMgPSBzY2FuVHJhbnNjcmlwdEZvckFnZW50SWRzKHRyYW5zY3JpcHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnBhaXJzLmVudHJpZXMoKV0uc29ydCgpLCBbXG5cdFx0XHRbJ3Rvb2x1X2EnLCAnYWdlbnRhMSddLFxuXHRcdFx0Wyd0b29sdV9kJywgJ2FnZW50ZDEnXSxcblx0XHRdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NsYXVkZVN1YmFnZW50UmVzb2x2ZXIgXHUyMDE0IGdldFN1YmFnZW50VHJhbnNjcmlwdCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjYWNoZSBoaXQgb24gcmVnaXN0cnkgc2hvcnQtY2lyY3VpdHMgU0RLIGZldGNoOyBjYWNoZSBtaXNzIHJ1bnMgc3RyYXRlZ3kgY2hhaW4gYW5kIHdyaXRlcyByZXNvbHZlZCBhZ2VudElkIGJhY2sgdG8gdGhlIHJlZ2lzdHJ5OyBzdWJzZXF1ZW50IHJlYWRzIGhpdCB0aGUgY2FjaGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2RrID0gbmV3IEZha2VTZGtTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcGFyZW50VXJpID0gVVJJLnBhcnNlKCdjb3BpbG90Oi9wYXJlbnQtc2lkJyk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFN1YmFnZW50UmVnaXN0cnkoKSk7XG5cblx0XHQvLyBQcmltaW5nIHBvcHVsYXRlcyB0aGUgcmVnaXN0cnkgd2l0aCBvbmUgKHRvb2xDYWxsSWQsIGFnZW50SWQpIHBhaXIgdmlhIHRoZSBzdWZmaXggc2Nhbi5cblx0XHRyZWdpc3RyeS5wcmltZUZyb21UcmFuc2NyaXB0KFtcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfYScsIHsgc3VmZml4VGV4dDogJ2FnZW50SWQ6IGFnZW50cHJpbWVkYScgfSksXG5cdFx0XSk7XG5cdFx0Ly8gTGl2ZSB3cml0ZSAoY2FuVXNlVG9vbCBicmlkZ2UgZG9lcyB0aGlzIGluIHByb2R1Y3Rpb24pLlxuXHRcdHJlZ2lzdHJ5LnJlY29yZFNwYXduKCd0b29sdV9iJywgeyBhZ2VudElkOiAnYWdlbnRsaXZlYicgfSk7XG5cblx0XHRzZGsuc3ViYWdlbnRNZXNzYWdlcy5zZXQoJ3BhcmVudC1zaWQ6OmFnZW50cHJpbWVkYScsIFtdKTtcblx0XHRzZGsuc3ViYWdlbnRNZXNzYWdlcy5zZXQoJ3BhcmVudC1zaWQ6OmFnZW50bGl2ZWInLCBbXSk7XG5cblx0XHRjb25zdCBzdWJhZ2VudFVyaUEgPSBVUkkucGFyc2UoYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50VXJpLCAndG9vbHVfYScpKTtcblx0XHRjb25zdCBzdWJhZ2VudFVyaUIgPSBVUkkucGFyc2UoYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50VXJpLCAndG9vbHVfYicpKTtcblx0XHRhd2FpdCBnZXRTdWJhZ2VudFRyYW5zY3JpcHQoc3ViYWdlbnRVcmlBLCBwYXJlbnRVcmksICdwYXJlbnQtc2lkJywgJ3Rvb2x1X2EnLCByZWdpc3RyeSwgc2RrLCBsb2csIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IGdldFN1YmFnZW50VHJhbnNjcmlwdChzdWJhZ2VudFVyaUIsIHBhcmVudFVyaSwgJ3BhcmVudC1zaWQnLCAndG9vbHVfYicsIHJlZ2lzdHJ5LCBzZGssIGxvZywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZldGNoZWRBZ2VudElkczogc2RrLmdldFN1YmFnZW50TWVzc2FnZXNDYWxscy5tYXAoYyA9PiBjLmFnZW50SWQpLFxuXHRcdFx0c3Bhd25BOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfYScpPy5hZ2VudElkLFxuXHRcdFx0c3Bhd25COiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfYicpPy5hZ2VudElkLFxuXHRcdH0sIHtcblx0XHRcdGZldGNoZWRBZ2VudElkczogWydhZ2VudHByaW1lZGEnLCAnYWdlbnRsaXZlYiddLFxuXHRcdFx0c3Bhd25BOiAnYWdlbnRwcmltZWRhJyxcblx0XHRcdHNwYXduQjogJ2FnZW50bGl2ZWInLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnJlc29sdmFibGUgYWdlbnRJZCByZXR1cm5zIFtdIChubyBTREsgZmV0Y2ggYXR0ZW1wdGVkKSBhbmQgU0RLIGZldGNoIGZhaWx1cmUgcmV0dXJucyBbXSB3aXRoIHdhcm4tbG9nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNkayA9IG5ldyBGYWtlU2RrU2VydmljZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHBhcmVudFVyaSA9IFVSSS5wYXJzZSgnY29waWxvdDovcGFyZW50LXNpZCcpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCkpO1xuXG5cdFx0Ly8gTm8gcHJpbWUsIG5vIHNwYXduIHJlY29yZCBcdTIwMTQgc3RyYXRlZ2llcyBhbGwgcmV0dXJuIHVuZGVmaW5lZCBmb3IgYW4gdW5rbm93biBpZC5cblx0XHRjb25zdCBub1Jlc29sdmUgPSBhd2FpdCBnZXRTdWJhZ2VudFRyYW5zY3JpcHQoXG5cdFx0XHRVUkkucGFyc2UoYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50VXJpLCAndG9vbHVfdW5rbm93bicpKSxcblx0XHRcdHBhcmVudFVyaSwgJ3BhcmVudC1zaWQnLCAndG9vbHVfdW5rbm93bicsIHJlZ2lzdHJ5LCBzZGssIGxvZywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0Ly8gQ2FjaGVkIHNwYXduIGJ1dCBTREsgcmVqZWN0cyBcdTIwMTQgcmV0dXJucyBbXS5cblx0XHRyZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfa25vd24nLCB7IGFnZW50SWQ6ICdhZ2VudC14JyB9KTtcblx0XHRzZGsuZ2V0U3ViYWdlbnRNZXNzYWdlc1JlamVjdGlvbiA9IG5ldyBFcnJvcignYm9vbScpO1xuXHRcdGNvbnN0IG9uRXJyb3IgPSBhd2FpdCBnZXRTdWJhZ2VudFRyYW5zY3JpcHQoXG5cdFx0XHRVUkkucGFyc2UoYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50VXJpLCAndG9vbHVfa25vd24nKSksXG5cdFx0XHRwYXJlbnRVcmksICdwYXJlbnQtc2lkJywgJ3Rvb2x1X2tub3duJywgcmVnaXN0cnksIHNkaywgbG9nLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG5vUmVzb2x2ZSxcblx0XHRcdG9uRXJyb3IsXG5cdFx0XHRmZXRjaEF0dGVtcHRzOiBzZGsuZ2V0U3ViYWdlbnRNZXNzYWdlc0NhbGxzLm1hcChjID0+IGMuYWdlbnRJZCksXG5cdFx0fSwge1xuXHRcdFx0bm9SZXNvbHZlOiBbXSxcblx0XHRcdG9uRXJyb3I6IFtdLFxuXHRcdFx0ZmV0Y2hBdHRlbXB0czogWydhZ2VudC14J10sIC8vIG9ubHkgdGhlIGNhY2hlZC1oaXQgYXR0ZW1wdGVkXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCByZXNvbHZlQWdlbnRJZFZpYUNoYWluIChmcmVlIGZ1bmN0aW9uKScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gbWFrZVN0cmF0ZWd5KG5hbWU6IHN0cmluZywgcmV0dXJuczogc3RyaW5nIHwgdW5kZWZpbmVkLCBvbkNhbGw/OiAoKSA9PiB2b2lkKTogSVN1YmFnZW50TG9va3VwU3RyYXRlZ3kge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lLFxuXHRcdFx0bG9va3VwOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9uQ2FsbD8uKCk7XG5cdFx0XHRcdHJldHVybiByZXR1cm5zO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0Y29uc3QgY3R4ID0gKHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IElTdWJhZ2VudExvb2t1cENvbnRleHQgPT4gKHtcblx0XHRwYXJlbnRVcmk6IFVSSS5wYXJzZSgnY29waWxvdDovcCcpLFxuXHRcdHBhcmVudFNlc3Npb25JZDogJ3AnLFxuXHRcdHRva2VuLFxuXHR9KTtcblxuXHRmdW5jdGlvbiBtYWtlRGVwcyhzdHJhdGVnaWVzOiByZWFkb25seSBJU3ViYWdlbnRMb29rdXBTdHJhdGVneVtdKToge1xuXHRcdHN0cmF0ZWdpZXM6IHJlYWRvbmx5IElTdWJhZ2VudExvb2t1cFN0cmF0ZWd5W107XG5cdFx0Y2FjaGVHZXQ6IChpZDogc3RyaW5nKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y2FjaGVTZXQ6IChpZDogc3RyaW5nLCBhZ2VudElkOiBzdHJpbmcpID0+IHZvaWQ7XG5cdFx0Y2FjaGVSZWFkczogc3RyaW5nW107XG5cdFx0Y2FjaGVXcml0ZXM6IHsgaWQ6IHN0cmluZzsgYWdlbnRJZDogc3RyaW5nIH1bXTtcblx0XHRzZWVkQ2FjaGUoaWQ6IHN0cmluZywgYWdlbnRJZDogc3RyaW5nKTogdm9pZDtcblx0fSB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGNhY2hlUmVhZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY2FjaGVXcml0ZXM6IHsgaWQ6IHN0cmluZzsgYWdlbnRJZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdHJhdGVnaWVzLFxuXHRcdFx0Y2FjaGVSZWFkcyxcblx0XHRcdGNhY2hlV3JpdGVzLFxuXHRcdFx0Y2FjaGVHZXQ6IGlkID0+IHsgY2FjaGVSZWFkcy5wdXNoKGlkKTsgcmV0dXJuIGNhY2hlLmdldChpZCk7IH0sXG5cdFx0XHRjYWNoZVNldDogKGlkLCBhZ2VudElkKSA9PiB7IGNhY2hlV3JpdGVzLnB1c2goeyBpZCwgYWdlbnRJZCB9KTsgY2FjaGUuc2V0KGlkLCBhZ2VudElkKTsgfSxcblx0XHRcdHNlZWRDYWNoZTogKGlkLCBhZ2VudElkKSA9PiBjYWNoZS5zZXQoaWQsIGFnZW50SWQpLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdjYWNoZSBoaXQgc2hvcnQtY2lyY3VpdHMgYmVmb3JlIGFueSBzdHJhdGVneSBydW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGRlcHMgPSBtYWtlRGVwcyhbXG5cdFx0XHRtYWtlU3RyYXRlZ3koJ3MxJywgJ3Nob3VsZC1ub3QtZmlyZScsICgpID0+IGNhbGxzLnB1c2goJ3MxJykpLFxuXHRcdF0pO1xuXHRcdGRlcHMuc2VlZENhY2hlKCd0b29sdScsICdjYWNoZWQtYWdlbnQnKTtcblxuXHRcdGNvbnN0IG91dCA9IGF3YWl0IHJlc29sdmVBZ2VudElkVmlhQ2hhaW4oJ3Rvb2x1JywgY3R4KCksIGRlcHMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG91dCwgY2FsbHMsIGNhY2hlV3JpdGVzOiBkZXBzLmNhY2hlV3JpdGVzIH0sIHtcblx0XHRcdG91dDogJ2NhY2hlZC1hZ2VudCcsXG5cdFx0XHRjYWxsczogW10sXG5cdFx0XHRjYWNoZVdyaXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYWluIG9yZGVyaW5nOiBmaXJzdCBub24tdW5kZWZpbmVkIGhpdCB3aW5zLCBsYXRlciBzdHJhdGVnaWVzIHNraXBwZWQsIGNhY2hlIHBvcHVsYXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBkZXBzID0gbWFrZURlcHMoW1xuXHRcdFx0bWFrZVN0cmF0ZWd5KCdzMScsIHVuZGVmaW5lZCwgKCkgPT4gY2FsbHMucHVzaCgnczEnKSksXG5cdFx0XHRtYWtlU3RyYXRlZ3koJ3MyJywgJ2FnZW50LWZyb20tczInLCAoKSA9PiBjYWxscy5wdXNoKCdzMicpKSxcblx0XHRcdG1ha2VTdHJhdGVneSgnczMnLCAnYWdlbnQtZnJvbS1zMycsICgpID0+IGNhbGxzLnB1c2goJ3MzJykpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgcmVzb2x2ZUFnZW50SWRWaWFDaGFpbigndG9vbHUnLCBjdHgoKSwgZGVwcyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgb3V0LCBjYWxscywgY2FjaGVXcml0ZXM6IGRlcHMuY2FjaGVXcml0ZXMgfSwge1xuXHRcdFx0b3V0OiAnYWdlbnQtZnJvbS1zMicsXG5cdFx0XHRjYWxsczogWydzMScsICdzMiddLFxuXHRcdFx0Y2FjaGVXcml0ZXM6IFt7IGlkOiAndG9vbHUnLCBhZ2VudElkOiAnYWdlbnQtZnJvbS1zMicgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1bGwgbWlzcyByZXR1cm5zIHVuZGVmaW5lZCBhbmQgd3JpdGVzIG5vdGhpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGVwcyA9IG1ha2VEZXBzKFtcblx0XHRcdG1ha2VTdHJhdGVneSgnczEnLCB1bmRlZmluZWQpLFxuXHRcdFx0bWFrZVN0cmF0ZWd5KCdzMicsIHVuZGVmaW5lZCksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvdXQgPSBhd2FpdCByZXNvbHZlQWdlbnRJZFZpYUNoYWluKCd0b29sdScsIGN0eCgpLCBkZXBzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBvdXQsIGNhY2hlV3JpdGVzOiBkZXBzLmNhY2hlV3JpdGVzIH0sIHtcblx0XHRcdG91dDogdW5kZWZpbmVkLFxuXHRcdFx0Y2FjaGVXcml0ZXM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsYXRpb24gYmV0d2VlbiBzdHJhdGVnaWVzIHN0b3BzIHRoZSBjaGFpbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGRlcHMgPSBtYWtlRGVwcyhbXG5cdFx0XHRtYWtlU3RyYXRlZ3koJ3MxJywgdW5kZWZpbmVkLCAoKSA9PiB7IGNhbGxzLnB1c2goJ3MxJyk7IHRva2VuU291cmNlLmNhbmNlbCgpOyB9KSxcblx0XHRcdG1ha2VTdHJhdGVneSgnczInLCAnbmV2ZXItcmVhY2hlZCcsICgpID0+IGNhbGxzLnB1c2goJ3MyJykpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgcmVzb2x2ZUFnZW50SWRWaWFDaGFpbigndG9vbHUnLCBjdHgodG9rZW5Tb3VyY2UudG9rZW4pLCBkZXBzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBvdXQsIGNhbGxzLCBjYWNoZVdyaXRlczogZGVwcy5jYWNoZVdyaXRlcyB9LCB7XG5cdFx0XHRvdXQ6IHVuZGVmaW5lZCxcblx0XHRcdGNhbGxzOiBbJ3MxJ10sXG5cdFx0XHRjYWNoZVdyaXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFJlc29sdmVyIFx1MjAxNCBleHRyYWN0U3Bhd25pbmdQcm9tcHRGcm9tVHJhbnNjcmlwdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBwcm9tcHQgZm9yIG1hdGNoaW5nIHN1YmFnZW50IHRvb2w7IHJlamVjdHMgbWFsZm9ybWVkL3N0cmVhbWluZy93cm9uZy10b29sJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zY3JpcHQ6IHJlYWRvbmx5IFR1cm5bXSA9IFtcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfbWF0Y2gnLCB7IHByb21wdDogJ2RvIHRoZSB0aGluZycgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X3N0cmVhbWluZycsIHsgcHJvbXB0OiAndW5maW5pc2hlZCcsIHN0YXR1czogdW5kZWZpbmVkIH0pLFxuXHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV93cm9uZ190b29sJywgeyBwcm9tcHQ6ICdwJywgdG9vbE5hbWU6ICdSZWFkJyB9KSxcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfYmFkX2pzb24nLCB7fSksXG5cdFx0XTtcblx0XHQvLyBNdXRhdGUgdGhlIHN0cmVhbWluZyB0dXJuIGludG8gYWN0dWFsIHN0cmVhbWluZyBzdGF0dXMgKGhlbHBlciBkZWZhdWx0cyB0byBDb21wbGV0ZWQpLlxuXHRcdCh0cmFuc2NyaXB0WzFdLnJlc3BvbnNlUGFydHNbMF0gYXMgeyB0b29sQ2FsbDogeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzIH0gfSkudG9vbENhbGwuc3RhdHVzID0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nO1xuXHRcdC8vIE11dGF0ZSBiYWQtanNvbiB0dXJuIHRvIGhhdmUgbm9uLXN0cmluZyB0b29sSW5wdXQuXG5cdFx0KHRyYW5zY3JpcHRbM10ucmVzcG9uc2VQYXJ0c1swXSBhcyB7IHRvb2xDYWxsOiB7IHRvb2xJbnB1dDogdW5rbm93biB9IH0pLnRvb2xDYWxsLnRvb2xJbnB1dCA9ICd7bm90IGpzb24nO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtYXRjaDogZXh0cmFjdFNwYXduaW5nUHJvbXB0RnJvbVRyYW5zY3JpcHQodHJhbnNjcmlwdCwgJ3Rvb2x1X21hdGNoJyksXG5cdFx0XHRzdHJlYW1pbmc6IGV4dHJhY3RTcGF3bmluZ1Byb21wdEZyb21UcmFuc2NyaXB0KHRyYW5zY3JpcHQsICd0b29sdV9zdHJlYW1pbmcnKSxcblx0XHRcdHdyb25nVG9vbDogZXh0cmFjdFNwYXduaW5nUHJvbXB0RnJvbVRyYW5zY3JpcHQodHJhbnNjcmlwdCwgJ3Rvb2x1X3dyb25nX3Rvb2wnKSxcblx0XHRcdGJhZEpzb246IGV4dHJhY3RTcGF3bmluZ1Byb21wdEZyb21UcmFuc2NyaXB0KHRyYW5zY3JpcHQsICd0b29sdV9iYWRfanNvbicpLFxuXHRcdFx0bWlzc2luZzogZXh0cmFjdFNwYXduaW5nUHJvbXB0RnJvbVRyYW5zY3JpcHQodHJhbnNjcmlwdCwgJ3Rvb2x1X3Vua25vd24nKSxcblx0XHR9LCB7XG5cdFx0XHRtYXRjaDogJ2RvIHRoZSB0aGluZycsXG5cdFx0XHRzdHJlYW1pbmc6IHVuZGVmaW5lZCxcblx0XHRcdHdyb25nVG9vbDogdW5kZWZpbmVkLFxuXHRcdFx0YmFkSnNvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWlzc2luZzogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY2xhdWRlU3ViYWdlbnRSZXNvbHZlciBcdTIwMTQgZmV0Y2hQYXJlbnRUdXJucycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBjdHgucGFyZW50VHJhbnNjcmlwdCB3aXRob3V0IGNhbGxpbmcgU0RLOyBmYWxscyB0aHJvdWdoIHRvIFNESzsgbG9ncyBhbmQgcmV0dXJucyB1bmRlZmluZWQgb24gU0RLIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNkayA9IG5ldyBGYWtlU2RrU2VydmljZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGJhc2VDdHggPSAob3ZlcnJpZGVzOiBQYXJ0aWFsPElTdWJhZ2VudExvb2t1cENvbnRleHQ+KTogSVN1YmFnZW50TG9va3VwQ29udGV4dCA9PiAoe1xuXHRcdFx0cGFyZW50U2Vzc2lvbklkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudFVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3BhcmVudCcpLFxuXHRcdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjYWNoZWQ6IHJlYWRvbmx5IFR1cm5bXSA9IFtdO1xuXHRcdGNvbnN0IGZyb21DYWNoZSA9IGF3YWl0IGZldGNoUGFyZW50VHVybnMoc2RrLCBsb2csIGJhc2VDdHgoeyBwYXJlbnRUcmFuc2NyaXB0OiBjYWNoZWQgfSksICdMJyk7XG5cdFx0Y29uc3QgZnJvbVNkayA9IGF3YWl0IGZldGNoUGFyZW50VHVybnMoc2RrLCBsb2csIGJhc2VDdHgoe30pLCAnTCcpO1xuXHRcdHNkay5nZXRTZXNzaW9uTWVzc2FnZXNSZWplY3Rpb24gPSBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRjb25zdCBvbkVycm9yID0gYXdhaXQgZmV0Y2hQYXJlbnRUdXJucyhzZGssIGxvZywgYmFzZUN0eCh7fSksICdMJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZyb21DYWNoZUlzQ2FjaGVkOiBmcm9tQ2FjaGUgPT09IGNhY2hlZCxcblx0XHRcdGZyb21DYWNoZUNhbGxDb3VudDogMCxcblx0XHRcdGZyb21TZGtJc0FycmF5OiBBcnJheS5pc0FycmF5KGZyb21TZGspLFxuXHRcdFx0b25FcnJvcixcblx0XHRcdHRvdGFsU2RrQ2FsbHM6IHNkay5nZXRTZXNzaW9uTWVzc2FnZXNDYWxscy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0ZnJvbUNhY2hlSXNDYWNoZWQ6IHRydWUsXG5cdFx0XHRmcm9tQ2FjaGVDYWxsQ291bnQ6IDAsXG5cdFx0XHRmcm9tU2RrSXNBcnJheTogdHJ1ZSxcblx0XHRcdG9uRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHRvdGFsU2RrQ2FsbHM6IDIsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FB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
