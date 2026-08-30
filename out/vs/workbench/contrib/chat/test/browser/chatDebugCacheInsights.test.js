import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { diffPromptSignature } from "../../browser/chatDebug/chatDebugCacheDiff.js";
import { analyzeStringDivergence, analyzeToolCatalog, buildSessionCacheReport, CacheBreakCategory, CacheInsightSeverity, categorizeCacheBreak, computeCacheInsights, detectVolatileValue, maxInsightSeverity, primaryInsight, StringDivergenceShape, VolatileValueKind } from "../../browser/chatDebug/chatDebugCacheInsights.js";
function msg(role, text) {
  return { role, text, charLength: text.length };
}
function makeInput(overrides) {
  const aMessages = overrides.aMessages ?? [];
  const bMessages = overrides.bMessages ?? [];
  return {
    aModel: "gpt-test",
    bModel: "gpt-test",
    aSystem: "system prompt",
    bSystem: "system prompt",
    aTools: void 0,
    bTools: void 0,
    diff: diffPromptSignature(aMessages, bMessages),
    optionsDiff: [],
    hitPct: 50,
    inputTokens: 5e4,
    minutesSincePrevious: 0.5,
    isContinuation: false,
    previousIsContinuation: false,
    compareInputMessages: true,
    ...overrides,
    aMessages,
    bMessages
  };
}
function shape(insights) {
  return insights.map((i) => ({ severity: i.severity, component: i.component }));
}
suite("chatDebugCacheInsights", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("analyzeStringDivergence", () => {
    test("classifies every shape and reports common spans", () => {
      assert.deepStrictEqual(
        [
          analyzeStringDivergence("same", "same"),
          analyzeStringDivergence("hello world", "hello world!!")?.shape,
          analyzeStringDivergence("hello world!!", "hello world")?.shape,
          analyzeStringDivergence("PREFIX hello", "hello")?.shape,
          analyzeStringDivergence("hello", "PREFIX hello")?.shape,
          analyzeStringDivergence("aaa MIDDLE zzz", "aaa OTHER zzz")?.shape
        ],
        [
          void 0,
          StringDivergenceShape.TrailingAdded,
          StringDivergenceShape.TrailingRemoved,
          StringDivergenceShape.LeadingRemoved,
          StringDivergenceShape.LeadingAdded,
          StringDivergenceShape.InnerEdit
        ]
      );
    });
    test("inner edit reports first-difference offset and disjoint common spans", () => {
      const d = analyzeStringDivergence("aaa MIDDLE zzz", "aaa OTHER zzz");
      assert.deepStrictEqual(
        { commonPrefix: d.commonPrefix, commonSuffix: d.commonSuffix, aChanged: d.aChanged, bChanged: d.bChanged },
        { commonPrefix: 4, commonSuffix: 4, aChanged: "MIDDLE", bChanged: "OTHER" }
      );
    });
  });
  suite("detectVolatileValue", () => {
    test("detects matching volatile kinds with differing values", () => {
      assert.deepStrictEqual(
        [
          detectVolatileValue("at 2026-06-10 09:15", "at 2026-06-10 09:21"),
          detectVolatileValue("id 6e9c0a4e-1f2b-4c3d-8e5f-aa0011223344", "id 0e9c0a4e-1f2b-4c3d-8e5f-aa0011223344"),
          detectVolatileValue("seq 1718000000123", "seq 1718000000456"),
          detectVolatileValue("same 2026-06-10", "same 2026-06-10"),
          detectVolatileValue("plain text", "other text")
        ],
        [VolatileValueKind.Timestamp, VolatileValueKind.Uuid, VolatileValueKind.Counter, void 0, void 0]
      );
    });
  });
  suite("analyzeToolCatalog", () => {
    test("classifies reorder, add/remove, and modify", () => {
      const toolA = JSON.stringify([{ name: "read" }, { name: "edit" }]);
      const toolAReordered = JSON.stringify([{ name: "edit" }, { name: "read" }]);
      const toolAPlus = JSON.stringify([{ name: "read" }, { name: "edit" }, { name: "grep" }]);
      const toolAModified = JSON.stringify([{ name: "read", description: "v2" }, { name: "edit" }]);
      assert.deepStrictEqual(
        [
          analyzeToolCatalog(toolA, toolAReordered),
          analyzeToolCatalog(toolA, toolAPlus),
          analyzeToolCatalog(toolA, toolAModified),
          analyzeToolCatalog("not json", toolA)
        ],
        [
          { added: [], removed: [], modified: [], reorderedOnly: true, aCount: 2, bCount: 2 },
          { added: ["grep"], removed: [], modified: [], reorderedOnly: false, aCount: 2, bCount: 3 },
          { added: [], removed: [], modified: ["read"], reorderedOnly: false, aCount: 2, bCount: 2 },
          void 0
        ]
      );
    });
  });
  suite("computeCacheInsights", () => {
    test("pure append is a single OK finding pointing at the first new message", () => {
      const shared = [msg("user", "question"), msg("assistant", "answer")];
      const insights = computeCacheInsights(makeInput({
        aMessages: shared,
        bMessages: [...shared, msg("user", "follow-up")]
      }));
      assert.deepStrictEqual(shape(insights), [
        { severity: CacheInsightSeverity.Ok, component: "messages[2]" }
      ]);
    });
    test("in-place history rewrite is critical and reported before later changes", () => {
      const insights = computeCacheInsights(makeInput({
        aMessages: [msg("user", "question"), msg("assistant", "PREAMBLE answer"), msg("user", "next")],
        bMessages: [msg("user", "question"), msg("assistant", "answer"), msg("user", "changed next")]
      }));
      assert.deepStrictEqual(shape(insights), [
        { severity: CacheInsightSeverity.Critical, component: "messages[1]" },
        { severity: CacheInsightSeverity.Info, component: void 0 }
      ]);
    });
    test("cache-key order: tools and system findings precede the message finding", () => {
      const insights = computeCacheInsights(makeInput({
        aModel: "model-a",
        bModel: "model-b",
        aTools: JSON.stringify([{ name: "read" }]),
        bTools: JSON.stringify([{ name: "read" }, { name: "edit" }]),
        aSystem: "system v1",
        bSystem: "system v2",
        aMessages: [msg("user", "hi")],
        bMessages: [msg("user", "hi"), msg("assistant", "reply")]
      }));
      assert.deepStrictEqual(shape(insights), [
        { severity: CacheInsightSeverity.Critical, component: void 0 },
        { severity: CacheInsightSeverity.Critical, component: "tools" },
        { severity: CacheInsightSeverity.Critical, component: "system" },
        { severity: CacheInsightSeverity.Info, component: "messages[1]" }
      ]);
    });
    test("byte-identical prompt with ~0% hit reads as likely expiration", () => {
      const shared = [msg("user", "question")];
      const insights = computeCacheInsights(makeInput({
        aMessages: shared,
        bMessages: shared,
        hitPct: 0,
        minutesSincePrevious: 7
      }));
      assert.deepStrictEqual(
        insights.map((i) => i.severity),
        [CacheInsightSeverity.Warning]
      );
    });
    test("byte-identical prompt with a high hit is OK", () => {
      const shared = [msg("user", "question")];
      const insights = computeCacheInsights(makeInput({
        aMessages: shared,
        bMessages: shared,
        hitPct: 99.5
      }));
      assert.deepStrictEqual(
        insights.map((i) => i.severity),
        [CacheInsightSeverity.Ok]
      );
    });
    test("history truncation is critical at the cut position", () => {
      const insights = computeCacheInsights(makeInput({
        aMessages: [msg("user", "q"), msg("assistant", "a"), msg("user", "old tail")],
        bMessages: [msg("user", "q"), msg("assistant", "a")]
      }));
      assert.deepStrictEqual(shape(insights), [
        { severity: CacheInsightSeverity.Critical, component: "messages[2]" }
      ]);
    });
    test("continuation suppresses message analysis and adds the continuation note", () => {
      const insights = computeCacheInsights(makeInput({
        aMessages: [msg("user", "full history")],
        bMessages: [msg("tool", "delta only")],
        diff: diffPromptSignature([], []),
        isContinuation: true,
        compareInputMessages: false
      }));
      assert.deepStrictEqual(
        insights.map((i) => i.severity),
        [CacheInsightSeverity.Info]
      );
    });
    test("volatile timestamp in the system prompt is called out in the hint", () => {
      const insights = computeCacheInsights(makeInput({
        aSystem: "You are helpful. Current time: 2026-06-10 09:15:00. Stay safe.",
        bSystem: "You are helpful. Current time: 2026-06-10 09:21:42. Stay safe."
      }));
      const system = insights.find((i) => i.component === "system");
      assert.deepStrictEqual(
        { severity: system?.severity, mentionsTimestamp: system?.hint?.includes("timestamp") },
        { severity: CacheInsightSeverity.Critical, mentionsTimestamp: true }
      );
    });
    test("tiny prompt with a miss reads as below-minimum-cacheable, not expiration", () => {
      const shared = [msg("user", "short utility prompt")];
      const insights = computeCacheInsights(makeInput({
        aMessages: shared,
        bMessages: shared,
        hitPct: 0,
        inputTokens: 800
      }));
      assert.deepStrictEqual(
        { severities: insights.map((i) => i.severity), mentionsMinimum: insights[0].title.includes("minimum") },
        { severities: [CacheInsightSeverity.Warning], mentionsMinimum: true }
      );
    });
    test("appending more blocks than the lookback window adds a warning", () => {
      const shared = [msg("user", "q")];
      const appended = Array.from({ length: 25 }, (_, i) => msg("tool", `result ${i}`));
      const insights = computeCacheInsights(makeInput({
        aMessages: shared,
        bMessages: [...shared, ...appended]
      }));
      assert.deepStrictEqual(
        insights.map((i) => i.severity),
        [CacheInsightSeverity.Ok, CacheInsightSeverity.Warning]
      );
    });
    test("helpers: maxInsightSeverity and primaryInsight pick the worst / first actionable finding", () => {
      const insights = computeCacheInsights(makeInput({
        aSystem: "v1",
        bSystem: "v2",
        aMessages: [msg("user", "q")],
        bMessages: [msg("user", "q"), msg("assistant", "a")]
      }));
      assert.deepStrictEqual(
        { max: maxInsightSeverity(insights), primaryComponent: primaryInsight(insights)?.component },
        { max: CacheInsightSeverity.Critical, primaryComponent: "system" }
      );
    });
  });
  suite("categorizeCacheBreak", () => {
    test("classifies pairs by their primary finding", () => {
      const shared = [msg("user", "q"), msg("assistant", "a")];
      assert.deepStrictEqual(
        [
          categorizeCacheBreak(computeCacheInsights(makeInput({ aMessages: shared, bMessages: [...shared, msg("user", "next")] }))),
          categorizeCacheBreak(computeCacheInsights(makeInput({ aSystem: "v1", bSystem: "v2", aMessages: shared, bMessages: shared }))),
          categorizeCacheBreak(computeCacheInsights(makeInput({ aMessages: shared, bMessages: shared, hitPct: 0 }))),
          categorizeCacheBreak(computeCacheInsights(makeInput({
            aMessages: [msg("user", "q"), msg("assistant", "OLD a")],
            bMessages: [msg("user", "q"), msg("assistant", "NEW a")]
          })))
        ],
        [CacheBreakCategory.Healthy, CacheBreakCategory.System, CacheBreakCategory.Expiration, CacheBreakCategory.History]
      );
    });
  });
  suite("buildSessionCacheReport", () => {
    test("flags recurring avoidable categories and sums wasted tokens", () => {
      const report = buildSessionCacheReport([
        { turnIndex: 1, category: CacheBreakCategory.Healthy, lostTokens: 2e3 },
        { turnIndex: 2, category: CacheBreakCategory.Tools, lostTokens: 6e4 },
        { turnIndex: 3, category: CacheBreakCategory.Tools, lostTokens: 55e3 },
        { turnIndex: 4, category: CacheBreakCategory.Expiration, lostTokens: 4e4 },
        { turnIndex: 5, category: CacheBreakCategory.System, lostTokens: 1e4 }
      ]);
      assert.deepStrictEqual(
        {
          pairCount: report.pairCount,
          healthyCount: report.healthyCount,
          avoidableLostTokens: report.avoidableLostTokens,
          byCategory: report.byCategory,
          findingSeverities: report.findings.map((f) => ({ severity: f.severity, category: f.category })),
          cause3: report.causeByTurnIndex.get(3)
        },
        {
          pairCount: 5,
          healthyCount: 1,
          avoidableLostTokens: 125e3,
          byCategory: [
            { category: CacheBreakCategory.Tools, count: 2, lostTokens: 115e3 },
            { category: CacheBreakCategory.Expiration, count: 1, lostTokens: 4e4 },
            { category: CacheBreakCategory.System, count: 1, lostTokens: 1e4 }
          ],
          findingSeverities: [{ severity: CacheInsightSeverity.Critical, category: CacheBreakCategory.Tools }],
          cause3: CacheBreakCategory.Tools
        }
      );
    });
    test("all-healthy session yields a single OK finding", () => {
      const report = buildSessionCacheReport([
        { turnIndex: 1, category: CacheBreakCategory.Healthy, lostTokens: 1e3 },
        { turnIndex: 2, category: CacheBreakCategory.Healthy, lostTokens: 1500 }
      ]);
      assert.deepStrictEqual(
        { healthyCount: report.healthyCount, findings: report.findings.map((f) => f.severity), avoidable: report.avoidableLostTokens },
        { healthyCount: 2, findings: [CacheInsightSeverity.Ok], avoidable: 0 }
      );
    });
    test("overall hit rate is token-weighted across all turns", () => {
      const report = buildSessionCacheReport(
        [{ turnIndex: 1, category: CacheBreakCategory.Expiration, lostTokens: 1e3 }],
        [
          { inputTokens: 99e3, cachedTokens: 99e3 },
          { inputTokens: 1e3, cachedTokens: 0 },
          { inputTokens: 0, cachedTokens: 0 }
          // no usage reported — excluded
        ]
      );
      assert.deepStrictEqual(report.overall, {
        inputTokens: 1e5,
        cachedTokens: 99e3,
        hitPct: 99,
        turnCount: 2
      });
    });
    test("overall is undefined when no turn reported token usage", () => {
      const report = buildSessionCacheReport(
        [{ turnIndex: 1, category: CacheBreakCategory.Healthy, lostTokens: 0 }],
        [{ inputTokens: 0, cachedTokens: 0 }]
      );
      assert.strictEqual(report.overall, void 0);
    });
    test("recurring expiration yields a warning finding", () => {
      const report = buildSessionCacheReport([
        { turnIndex: 1, category: CacheBreakCategory.Expiration, lostTokens: 3e4 },
        { turnIndex: 2, category: CacheBreakCategory.Expiration, lostTokens: 35e3 },
        { turnIndex: 3, category: CacheBreakCategory.Healthy, lostTokens: 500 }
      ]);
      assert.deepStrictEqual(
        report.findings.map((f) => ({ severity: f.severity, category: f.category })),
        [{ severity: CacheInsightSeverity.Warning, category: CacheBreakCategory.Expiration }]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXREZWJ1Z0NhY2hlSW5zaWdodHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZGlmZlByb21wdFNpZ25hdHVyZSwgSU5vcm1hbGl6ZWRNZXNzYWdlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnQ2FjaGVEaWZmLmpzJztcbmltcG9ydCB7IGFuYWx5emVTdHJpbmdEaXZlcmdlbmNlLCBhbmFseXplVG9vbENhdGFsb2csIGJ1aWxkU2Vzc2lvbkNhY2hlUmVwb3J0LCBDYWNoZUJyZWFrQ2F0ZWdvcnksIENhY2hlSW5zaWdodFNldmVyaXR5LCBjYXRlZ29yaXplQ2FjaGVCcmVhaywgY29tcHV0ZUNhY2hlSW5zaWdodHMsIGRldGVjdFZvbGF0aWxlVmFsdWUsIElDYWNoZUluc2lnaHQsIElDYWNoZUluc2lnaHRzSW5wdXQsIG1heEluc2lnaHRTZXZlcml0eSwgcHJpbWFyeUluc2lnaHQsIFN0cmluZ0RpdmVyZ2VuY2VTaGFwZSwgVm9sYXRpbGVWYWx1ZUtpbmQgfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXREZWJ1Zy9jaGF0RGVidWdDYWNoZUluc2lnaHRzLmpzJztcblxuZnVuY3Rpb24gbXNnKHJvbGU6IHN0cmluZywgdGV4dDogc3RyaW5nKTogSU5vcm1hbGl6ZWRNZXNzYWdlIHtcblx0cmV0dXJuIHsgcm9sZSwgdGV4dCwgY2hhckxlbmd0aDogdGV4dC5sZW5ndGggfTtcbn1cblxuZnVuY3Rpb24gbWFrZUlucHV0KG92ZXJyaWRlczogUGFydGlhbDxJQ2FjaGVJbnNpZ2h0c0lucHV0PiAmIHsgYU1lc3NhZ2VzPzogcmVhZG9ubHkgSU5vcm1hbGl6ZWRNZXNzYWdlW107IGJNZXNzYWdlcz86IHJlYWRvbmx5IElOb3JtYWxpemVkTWVzc2FnZVtdIH0pOiBJQ2FjaGVJbnNpZ2h0c0lucHV0IHtcblx0Y29uc3QgYU1lc3NhZ2VzID0gb3ZlcnJpZGVzLmFNZXNzYWdlcyA/PyBbXTtcblx0Y29uc3QgYk1lc3NhZ2VzID0gb3ZlcnJpZGVzLmJNZXNzYWdlcyA/PyBbXTtcblx0cmV0dXJuIHtcblx0XHRhTW9kZWw6ICdncHQtdGVzdCcsXG5cdFx0Yk1vZGVsOiAnZ3B0LXRlc3QnLFxuXHRcdGFTeXN0ZW06ICdzeXN0ZW0gcHJvbXB0Jyxcblx0XHRiU3lzdGVtOiAnc3lzdGVtIHByb21wdCcsXG5cdFx0YVRvb2xzOiB1bmRlZmluZWQsXG5cdFx0YlRvb2xzOiB1bmRlZmluZWQsXG5cdFx0ZGlmZjogZGlmZlByb21wdFNpZ25hdHVyZShhTWVzc2FnZXMsIGJNZXNzYWdlcyksXG5cdFx0b3B0aW9uc0RpZmY6IFtdLFxuXHRcdGhpdFBjdDogNTAsXG5cdFx0aW5wdXRUb2tlbnM6IDUwXzAwMCxcblx0XHRtaW51dGVzU2luY2VQcmV2aW91czogMC41LFxuXHRcdGlzQ29udGludWF0aW9uOiBmYWxzZSxcblx0XHRwcmV2aW91c0lzQ29udGludWF0aW9uOiBmYWxzZSxcblx0XHRjb21wYXJlSW5wdXRNZXNzYWdlczogdHJ1ZSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdFx0YU1lc3NhZ2VzLFxuXHRcdGJNZXNzYWdlcyxcblx0fTtcbn1cblxuLyoqIFByb2plY3QgaW5zaWdodHMgZG93biB0byB0aGUgZmllbGRzIHRoYXQgbWF0dGVyIGZvciBzY2VuYXJpbyBhc3NlcnRpb25zLiAqL1xuZnVuY3Rpb24gc2hhcGUoaW5zaWdodHM6IHJlYWRvbmx5IElDYWNoZUluc2lnaHRbXSk6IHsgc2V2ZXJpdHk6IHN0cmluZzsgY29tcG9uZW50OiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdIHtcblx0cmV0dXJuIGluc2lnaHRzLm1hcChpID0+ICh7IHNldmVyaXR5OiBpLnNldmVyaXR5LCBjb21wb25lbnQ6IGkuY29tcG9uZW50IH0pKTtcbn1cblxuc3VpdGUoJ2NoYXREZWJ1Z0NhY2hlSW5zaWdodHMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdhbmFseXplU3RyaW5nRGl2ZXJnZW5jZScsICgpID0+IHtcblx0XHR0ZXN0KCdjbGFzc2lmaWVzIGV2ZXJ5IHNoYXBlIGFuZCByZXBvcnRzIGNvbW1vbiBzcGFucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRhbmFseXplU3RyaW5nRGl2ZXJnZW5jZSgnc2FtZScsICdzYW1lJyksXG5cdFx0XHRcdFx0YW5hbHl6ZVN0cmluZ0RpdmVyZ2VuY2UoJ2hlbGxvIHdvcmxkJywgJ2hlbGxvIHdvcmxkISEnKT8uc2hhcGUsXG5cdFx0XHRcdFx0YW5hbHl6ZVN0cmluZ0RpdmVyZ2VuY2UoJ2hlbGxvIHdvcmxkISEnLCAnaGVsbG8gd29ybGQnKT8uc2hhcGUsXG5cdFx0XHRcdFx0YW5hbHl6ZVN0cmluZ0RpdmVyZ2VuY2UoJ1BSRUZJWCBoZWxsbycsICdoZWxsbycpPy5zaGFwZSxcblx0XHRcdFx0XHRhbmFseXplU3RyaW5nRGl2ZXJnZW5jZSgnaGVsbG8nLCAnUFJFRklYIGhlbGxvJyk/LnNoYXBlLFxuXHRcdFx0XHRcdGFuYWx5emVTdHJpbmdEaXZlcmdlbmNlKCdhYWEgTUlERExFIHp6eicsICdhYWEgT1RIRVIgenp6Jyk/LnNoYXBlLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFN0cmluZ0RpdmVyZ2VuY2VTaGFwZS5UcmFpbGluZ0FkZGVkLFxuXHRcdFx0XHRcdFN0cmluZ0RpdmVyZ2VuY2VTaGFwZS5UcmFpbGluZ1JlbW92ZWQsXG5cdFx0XHRcdFx0U3RyaW5nRGl2ZXJnZW5jZVNoYXBlLkxlYWRpbmdSZW1vdmVkLFxuXHRcdFx0XHRcdFN0cmluZ0RpdmVyZ2VuY2VTaGFwZS5MZWFkaW5nQWRkZWQsXG5cdFx0XHRcdFx0U3RyaW5nRGl2ZXJnZW5jZVNoYXBlLklubmVyRWRpdCxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbm5lciBlZGl0IHJlcG9ydHMgZmlyc3QtZGlmZmVyZW5jZSBvZmZzZXQgYW5kIGRpc2pvaW50IGNvbW1vbiBzcGFucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGQgPSBhbmFseXplU3RyaW5nRGl2ZXJnZW5jZSgnYWFhIE1JRERMRSB6enonLCAnYWFhIE9USEVSIHp6eicpITtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgY29tbW9uUHJlZml4OiBkLmNvbW1vblByZWZpeCwgY29tbW9uU3VmZml4OiBkLmNvbW1vblN1ZmZpeCwgYUNoYW5nZWQ6IGQuYUNoYW5nZWQsIGJDaGFuZ2VkOiBkLmJDaGFuZ2VkIH0sXG5cdFx0XHRcdHsgY29tbW9uUHJlZml4OiA0LCBjb21tb25TdWZmaXg6IDQsIGFDaGFuZ2VkOiAnTUlERExFJywgYkNoYW5nZWQ6ICdPVEhFUicgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkZXRlY3RWb2xhdGlsZVZhbHVlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2RldGVjdHMgbWF0Y2hpbmcgdm9sYXRpbGUga2luZHMgd2l0aCBkaWZmZXJpbmcgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGRldGVjdFZvbGF0aWxlVmFsdWUoJ2F0IDIwMjYtMDYtMTAgMDk6MTUnLCAnYXQgMjAyNi0wNi0xMCAwOToyMScpLFxuXHRcdFx0XHRcdGRldGVjdFZvbGF0aWxlVmFsdWUoJ2lkIDZlOWMwYTRlLTFmMmItNGMzZC04ZTVmLWFhMDAxMTIyMzM0NCcsICdpZCAwZTljMGE0ZS0xZjJiLTRjM2QtOGU1Zi1hYTAwMTEyMjMzNDQnKSxcblx0XHRcdFx0XHRkZXRlY3RWb2xhdGlsZVZhbHVlKCdzZXEgMTcxODAwMDAwMDEyMycsICdzZXEgMTcxODAwMDAwMDQ1NicpLFxuXHRcdFx0XHRcdGRldGVjdFZvbGF0aWxlVmFsdWUoJ3NhbWUgMjAyNi0wNi0xMCcsICdzYW1lIDIwMjYtMDYtMTAnKSxcblx0XHRcdFx0XHRkZXRlY3RWb2xhdGlsZVZhbHVlKCdwbGFpbiB0ZXh0JywgJ290aGVyIHRleHQnKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1ZvbGF0aWxlVmFsdWVLaW5kLlRpbWVzdGFtcCwgVm9sYXRpbGVWYWx1ZUtpbmQuVXVpZCwgVm9sYXRpbGVWYWx1ZUtpbmQuQ291bnRlciwgdW5kZWZpbmVkLCB1bmRlZmluZWRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FuYWx5emVUb29sQ2F0YWxvZycsICgpID0+IHtcblx0XHR0ZXN0KCdjbGFzc2lmaWVzIHJlb3JkZXIsIGFkZC9yZW1vdmUsIGFuZCBtb2RpZnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sQSA9IEpTT04uc3RyaW5naWZ5KFt7IG5hbWU6ICdyZWFkJyB9LCB7IG5hbWU6ICdlZGl0JyB9XSk7XG5cdFx0XHRjb25zdCB0b29sQVJlb3JkZXJlZCA9IEpTT04uc3RyaW5naWZ5KFt7IG5hbWU6ICdlZGl0JyB9LCB7IG5hbWU6ICdyZWFkJyB9XSk7XG5cdFx0XHRjb25zdCB0b29sQVBsdXMgPSBKU09OLnN0cmluZ2lmeShbeyBuYW1lOiAncmVhZCcgfSwgeyBuYW1lOiAnZWRpdCcgfSwgeyBuYW1lOiAnZ3JlcCcgfV0pO1xuXHRcdFx0Y29uc3QgdG9vbEFNb2RpZmllZCA9IEpTT04uc3RyaW5naWZ5KFt7IG5hbWU6ICdyZWFkJywgZGVzY3JpcHRpb246ICd2MicgfSwgeyBuYW1lOiAnZWRpdCcgfV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGFuYWx5emVUb29sQ2F0YWxvZyh0b29sQSwgdG9vbEFSZW9yZGVyZWQpLFxuXHRcdFx0XHRcdGFuYWx5emVUb29sQ2F0YWxvZyh0b29sQSwgdG9vbEFQbHVzKSxcblx0XHRcdFx0XHRhbmFseXplVG9vbENhdGFsb2codG9vbEEsIHRvb2xBTW9kaWZpZWQpLFxuXHRcdFx0XHRcdGFuYWx5emVUb29sQ2F0YWxvZygnbm90IGpzb24nLCB0b29sQSksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIG1vZGlmaWVkOiBbXSwgcmVvcmRlcmVkT25seTogdHJ1ZSwgYUNvdW50OiAyLCBiQ291bnQ6IDIgfSxcblx0XHRcdFx0XHR7IGFkZGVkOiBbJ2dyZXAnXSwgcmVtb3ZlZDogW10sIG1vZGlmaWVkOiBbXSwgcmVvcmRlcmVkT25seTogZmFsc2UsIGFDb3VudDogMiwgYkNvdW50OiAzIH0sXG5cdFx0XHRcdFx0eyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBtb2RpZmllZDogWydyZWFkJ10sIHJlb3JkZXJlZE9ubHk6IGZhbHNlLCBhQ291bnQ6IDIsIGJDb3VudDogMiB9LFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21wdXRlQ2FjaGVJbnNpZ2h0cycsICgpID0+IHtcblx0XHR0ZXN0KCdwdXJlIGFwcGVuZCBpcyBhIHNpbmdsZSBPSyBmaW5kaW5nIHBvaW50aW5nIGF0IHRoZSBmaXJzdCBuZXcgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNoYXJlZCA9IFttc2coJ3VzZXInLCAncXVlc3Rpb24nKSwgbXNnKCdhc3Npc3RhbnQnLCAnYW5zd2VyJyldO1xuXHRcdFx0Y29uc3QgaW5zaWdodHMgPSBjb21wdXRlQ2FjaGVJbnNpZ2h0cyhtYWtlSW5wdXQoe1xuXHRcdFx0XHRhTWVzc2FnZXM6IHNoYXJlZCxcblx0XHRcdFx0Yk1lc3NhZ2VzOiBbLi4uc2hhcmVkLCBtc2coJ3VzZXInLCAnZm9sbG93LXVwJyldLFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaGFwZShpbnNpZ2h0cyksIFtcblx0XHRcdFx0eyBzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuT2ssIGNvbXBvbmVudDogJ21lc3NhZ2VzWzJdJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbi1wbGFjZSBoaXN0b3J5IHJld3JpdGUgaXMgY3JpdGljYWwgYW5kIHJlcG9ydGVkIGJlZm9yZSBsYXRlciBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zaWdodHMgPSBjb21wdXRlQ2FjaGVJbnNpZ2h0cyhtYWtlSW5wdXQoe1xuXHRcdFx0XHRhTWVzc2FnZXM6IFttc2coJ3VzZXInLCAncXVlc3Rpb24nKSwgbXNnKCdhc3Npc3RhbnQnLCAnUFJFQU1CTEUgYW5zd2VyJyksIG1zZygndXNlcicsICduZXh0JyldLFxuXHRcdFx0XHRiTWVzc2FnZXM6IFttc2coJ3VzZXInLCAncXVlc3Rpb24nKSwgbXNnKCdhc3Npc3RhbnQnLCAnYW5zd2VyJyksIG1zZygndXNlcicsICdjaGFuZ2VkIG5leHQnKV0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNoYXBlKGluc2lnaHRzKSwgW1xuXHRcdFx0XHR7IHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eS5Dcml0aWNhbCwgY29tcG9uZW50OiAnbWVzc2FnZXNbMV0nIH0sXG5cdFx0XHRcdHsgc2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkluZm8sIGNvbXBvbmVudDogdW5kZWZpbmVkIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhY2hlLWtleSBvcmRlcjogdG9vbHMgYW5kIHN5c3RlbSBmaW5kaW5ncyBwcmVjZWRlIHRoZSBtZXNzYWdlIGZpbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnNpZ2h0cyA9IGNvbXB1dGVDYWNoZUluc2lnaHRzKG1ha2VJbnB1dCh7XG5cdFx0XHRcdGFNb2RlbDogJ21vZGVsLWEnLFxuXHRcdFx0XHRiTW9kZWw6ICdtb2RlbC1iJyxcblx0XHRcdFx0YVRvb2xzOiBKU09OLnN0cmluZ2lmeShbeyBuYW1lOiAncmVhZCcgfV0pLFxuXHRcdFx0XHRiVG9vbHM6IEpTT04uc3RyaW5naWZ5KFt7IG5hbWU6ICdyZWFkJyB9LCB7IG5hbWU6ICdlZGl0JyB9XSksXG5cdFx0XHRcdGFTeXN0ZW06ICdzeXN0ZW0gdjEnLFxuXHRcdFx0XHRiU3lzdGVtOiAnc3lzdGVtIHYyJyxcblx0XHRcdFx0YU1lc3NhZ2VzOiBbbXNnKCd1c2VyJywgJ2hpJyldLFxuXHRcdFx0XHRiTWVzc2FnZXM6IFttc2coJ3VzZXInLCAnaGknKSwgbXNnKCdhc3Npc3RhbnQnLCAncmVwbHknKV0sXG5cdFx0XHR9KSk7XG5cdFx0XHQvLyBtb2RlbCwgdG9vbHMsIHN5c3RlbSBhcmUgY3JpdGljYWw7IHRoZSBhcHBlbmQgZG93bmdyYWRlcyB0byBpbmZvXG5cdFx0XHQvLyBiZWNhdXNlIGFuIGVhcmxpZXIgdGllciBhbHJlYWR5IGJyb2tlIHRoZSBjYWNoZS5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hhcGUoaW5zaWdodHMpLCBbXG5cdFx0XHRcdHsgc2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkNyaXRpY2FsLCBjb21wb25lbnQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eS5Dcml0aWNhbCwgY29tcG9uZW50OiAndG9vbHMnIH0sXG5cdFx0XHRcdHsgc2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkNyaXRpY2FsLCBjb21wb25lbnQ6ICdzeXN0ZW0nIH0sXG5cdFx0XHRcdHsgc2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkluZm8sIGNvbXBvbmVudDogJ21lc3NhZ2VzWzFdJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdieXRlLWlkZW50aWNhbCBwcm9tcHQgd2l0aCB+MCUgaGl0IHJlYWRzIGFzIGxpa2VseSBleHBpcmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2hhcmVkID0gW21zZygndXNlcicsICdxdWVzdGlvbicpXTtcblx0XHRcdGNvbnN0IGluc2lnaHRzID0gY29tcHV0ZUNhY2hlSW5zaWdodHMobWFrZUlucHV0KHtcblx0XHRcdFx0YU1lc3NhZ2VzOiBzaGFyZWQsXG5cdFx0XHRcdGJNZXNzYWdlczogc2hhcmVkLFxuXHRcdFx0XHRoaXRQY3Q6IDAsXG5cdFx0XHRcdG1pbnV0ZXNTaW5jZVByZXZpb3VzOiA3LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0aW5zaWdodHMubWFwKGkgPT4gaS5zZXZlcml0eSksXG5cdFx0XHRcdFtDYWNoZUluc2lnaHRTZXZlcml0eS5XYXJuaW5nXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdieXRlLWlkZW50aWNhbCBwcm9tcHQgd2l0aCBhIGhpZ2ggaGl0IGlzIE9LJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2hhcmVkID0gW21zZygndXNlcicsICdxdWVzdGlvbicpXTtcblx0XHRcdGNvbnN0IGluc2lnaHRzID0gY29tcHV0ZUNhY2hlSW5zaWdodHMobWFrZUlucHV0KHtcblx0XHRcdFx0YU1lc3NhZ2VzOiBzaGFyZWQsXG5cdFx0XHRcdGJNZXNzYWdlczogc2hhcmVkLFxuXHRcdFx0XHRoaXRQY3Q6IDk5LjUsXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRpbnNpZ2h0cy5tYXAoaSA9PiBpLnNldmVyaXR5KSxcblx0XHRcdFx0W0NhY2hlSW5zaWdodFNldmVyaXR5Lk9rXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoaXN0b3J5IHRydW5jYXRpb24gaXMgY3JpdGljYWwgYXQgdGhlIGN1dCBwb3NpdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc2lnaHRzID0gY29tcHV0ZUNhY2hlSW5zaWdodHMobWFrZUlucHV0KHtcblx0XHRcdFx0YU1lc3NhZ2VzOiBbbXNnKCd1c2VyJywgJ3EnKSwgbXNnKCdhc3Npc3RhbnQnLCAnYScpLCBtc2coJ3VzZXInLCAnb2xkIHRhaWwnKV0sXG5cdFx0XHRcdGJNZXNzYWdlczogW21zZygndXNlcicsICdxJyksIG1zZygnYXNzaXN0YW50JywgJ2EnKV0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNoYXBlKGluc2lnaHRzKSwgW1xuXHRcdFx0XHR7IHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eS5Dcml0aWNhbCwgY29tcG9uZW50OiAnbWVzc2FnZXNbMl0nIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnRpbnVhdGlvbiBzdXBwcmVzc2VzIG1lc3NhZ2UgYW5hbHlzaXMgYW5kIGFkZHMgdGhlIGNvbnRpbnVhdGlvbiBub3RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zaWdodHMgPSBjb21wdXRlQ2FjaGVJbnNpZ2h0cyhtYWtlSW5wdXQoe1xuXHRcdFx0XHRhTWVzc2FnZXM6IFttc2coJ3VzZXInLCAnZnVsbCBoaXN0b3J5JyldLFxuXHRcdFx0XHRiTWVzc2FnZXM6IFttc2coJ3Rvb2wnLCAnZGVsdGEgb25seScpXSxcblx0XHRcdFx0ZGlmZjogZGlmZlByb21wdFNpZ25hdHVyZShbXSwgW10pLFxuXHRcdFx0XHRpc0NvbnRpbnVhdGlvbjogdHJ1ZSxcblx0XHRcdFx0Y29tcGFyZUlucHV0TWVzc2FnZXM6IGZhbHNlLFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0aW5zaWdodHMubWFwKGkgPT4gaS5zZXZlcml0eSksXG5cdFx0XHRcdFtDYWNoZUluc2lnaHRTZXZlcml0eS5JbmZvXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2b2xhdGlsZSB0aW1lc3RhbXAgaW4gdGhlIHN5c3RlbSBwcm9tcHQgaXMgY2FsbGVkIG91dCBpbiB0aGUgaGludCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc2lnaHRzID0gY29tcHV0ZUNhY2hlSW5zaWdodHMobWFrZUlucHV0KHtcblx0XHRcdFx0YVN5c3RlbTogJ1lvdSBhcmUgaGVscGZ1bC4gQ3VycmVudCB0aW1lOiAyMDI2LTA2LTEwIDA5OjE1OjAwLiBTdGF5IHNhZmUuJyxcblx0XHRcdFx0YlN5c3RlbTogJ1lvdSBhcmUgaGVscGZ1bC4gQ3VycmVudCB0aW1lOiAyMDI2LTA2LTEwIDA5OjIxOjQyLiBTdGF5IHNhZmUuJyxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHN5c3RlbSA9IGluc2lnaHRzLmZpbmQoaSA9PiBpLmNvbXBvbmVudCA9PT0gJ3N5c3RlbScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBzZXZlcml0eTogc3lzdGVtPy5zZXZlcml0eSwgbWVudGlvbnNUaW1lc3RhbXA6IHN5c3RlbT8uaGludD8uaW5jbHVkZXMoJ3RpbWVzdGFtcCcpIH0sXG5cdFx0XHRcdHsgc2V2ZXJpdHk6IENhY2hlSW5zaWdodFNldmVyaXR5LkNyaXRpY2FsLCBtZW50aW9uc1RpbWVzdGFtcDogdHJ1ZSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RpbnkgcHJvbXB0IHdpdGggYSBtaXNzIHJlYWRzIGFzIGJlbG93LW1pbmltdW0tY2FjaGVhYmxlLCBub3QgZXhwaXJhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNoYXJlZCA9IFttc2coJ3VzZXInLCAnc2hvcnQgdXRpbGl0eSBwcm9tcHQnKV07XG5cdFx0XHRjb25zdCBpbnNpZ2h0cyA9IGNvbXB1dGVDYWNoZUluc2lnaHRzKG1ha2VJbnB1dCh7XG5cdFx0XHRcdGFNZXNzYWdlczogc2hhcmVkLFxuXHRcdFx0XHRiTWVzc2FnZXM6IHNoYXJlZCxcblx0XHRcdFx0aGl0UGN0OiAwLFxuXHRcdFx0XHRpbnB1dFRva2VuczogODAwLFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBzZXZlcml0aWVzOiBpbnNpZ2h0cy5tYXAoaSA9PiBpLnNldmVyaXR5KSwgbWVudGlvbnNNaW5pbXVtOiBpbnNpZ2h0c1swXS50aXRsZS5pbmNsdWRlcygnbWluaW11bScpIH0sXG5cdFx0XHRcdHsgc2V2ZXJpdGllczogW0NhY2hlSW5zaWdodFNldmVyaXR5Lldhcm5pbmddLCBtZW50aW9uc01pbmltdW06IHRydWUgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBlbmRpbmcgbW9yZSBibG9ja3MgdGhhbiB0aGUgbG9va2JhY2sgd2luZG93IGFkZHMgYSB3YXJuaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2hhcmVkID0gW21zZygndXNlcicsICdxJyldO1xuXHRcdFx0Y29uc3QgYXBwZW5kZWQgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyNSB9LCAoXywgaSkgPT4gbXNnKCd0b29sJywgYHJlc3VsdCAke2l9YCkpO1xuXHRcdFx0Y29uc3QgaW5zaWdodHMgPSBjb21wdXRlQ2FjaGVJbnNpZ2h0cyhtYWtlSW5wdXQoe1xuXHRcdFx0XHRhTWVzc2FnZXM6IHNoYXJlZCxcblx0XHRcdFx0Yk1lc3NhZ2VzOiBbLi4uc2hhcmVkLCAuLi5hcHBlbmRlZF0sXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRpbnNpZ2h0cy5tYXAoaSA9PiBpLnNldmVyaXR5KSxcblx0XHRcdFx0W0NhY2hlSW5zaWdodFNldmVyaXR5Lk9rLCBDYWNoZUluc2lnaHRTZXZlcml0eS5XYXJuaW5nXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoZWxwZXJzOiBtYXhJbnNpZ2h0U2V2ZXJpdHkgYW5kIHByaW1hcnlJbnNpZ2h0IHBpY2sgdGhlIHdvcnN0IC8gZmlyc3QgYWN0aW9uYWJsZSBmaW5kaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zaWdodHMgPSBjb21wdXRlQ2FjaGVJbnNpZ2h0cyhtYWtlSW5wdXQoe1xuXHRcdFx0XHRhU3lzdGVtOiAndjEnLFxuXHRcdFx0XHRiU3lzdGVtOiAndjInLFxuXHRcdFx0XHRhTWVzc2FnZXM6IFttc2coJ3VzZXInLCAncScpXSxcblx0XHRcdFx0Yk1lc3NhZ2VzOiBbbXNnKCd1c2VyJywgJ3EnKSwgbXNnKCdhc3Npc3RhbnQnLCAnYScpXSxcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbWF4OiBtYXhJbnNpZ2h0U2V2ZXJpdHkoaW5zaWdodHMpLCBwcmltYXJ5Q29tcG9uZW50OiBwcmltYXJ5SW5zaWdodChpbnNpZ2h0cyk/LmNvbXBvbmVudCB9LFxuXHRcdFx0XHR7IG1heDogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuQ3JpdGljYWwsIHByaW1hcnlDb21wb25lbnQ6ICdzeXN0ZW0nIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2F0ZWdvcml6ZUNhY2hlQnJlYWsnLCAoKSA9PiB7XG5cdFx0dGVzdCgnY2xhc3NpZmllcyBwYWlycyBieSB0aGVpciBwcmltYXJ5IGZpbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzaGFyZWQgPSBbbXNnKCd1c2VyJywgJ3EnKSwgbXNnKCdhc3Npc3RhbnQnLCAnYScpXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRjYXRlZ29yaXplQ2FjaGVCcmVhayhjb21wdXRlQ2FjaGVJbnNpZ2h0cyhtYWtlSW5wdXQoeyBhTWVzc2FnZXM6IHNoYXJlZCwgYk1lc3NhZ2VzOiBbLi4uc2hhcmVkLCBtc2coJ3VzZXInLCAnbmV4dCcpXSB9KSkpLFxuXHRcdFx0XHRcdGNhdGVnb3JpemVDYWNoZUJyZWFrKGNvbXB1dGVDYWNoZUluc2lnaHRzKG1ha2VJbnB1dCh7IGFTeXN0ZW06ICd2MScsIGJTeXN0ZW06ICd2MicsIGFNZXNzYWdlczogc2hhcmVkLCBiTWVzc2FnZXM6IHNoYXJlZCB9KSkpLFxuXHRcdFx0XHRcdGNhdGVnb3JpemVDYWNoZUJyZWFrKGNvbXB1dGVDYWNoZUluc2lnaHRzKG1ha2VJbnB1dCh7IGFNZXNzYWdlczogc2hhcmVkLCBiTWVzc2FnZXM6IHNoYXJlZCwgaGl0UGN0OiAwIH0pKSksXG5cdFx0XHRcdFx0Y2F0ZWdvcml6ZUNhY2hlQnJlYWsoY29tcHV0ZUNhY2hlSW5zaWdodHMobWFrZUlucHV0KHtcblx0XHRcdFx0XHRcdGFNZXNzYWdlczogW21zZygndXNlcicsICdxJyksIG1zZygnYXNzaXN0YW50JywgJ09MRCBhJyldLFxuXHRcdFx0XHRcdFx0Yk1lc3NhZ2VzOiBbbXNnKCd1c2VyJywgJ3EnKSwgbXNnKCdhc3Npc3RhbnQnLCAnTkVXIGEnKV0sXG5cdFx0XHRcdFx0fSkpKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W0NhY2hlQnJlYWtDYXRlZ29yeS5IZWFsdGh5LCBDYWNoZUJyZWFrQ2F0ZWdvcnkuU3lzdGVtLCBDYWNoZUJyZWFrQ2F0ZWdvcnkuRXhwaXJhdGlvbiwgQ2FjaGVCcmVha0NhdGVnb3J5Lkhpc3RvcnldLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1aWxkU2Vzc2lvbkNhY2hlUmVwb3J0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2ZsYWdzIHJlY3VycmluZyBhdm9pZGFibGUgY2F0ZWdvcmllcyBhbmQgc3VtcyB3YXN0ZWQgdG9rZW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb3J0ID0gYnVpbGRTZXNzaW9uQ2FjaGVSZXBvcnQoW1xuXHRcdFx0XHR7IHR1cm5JbmRleDogMSwgY2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5IZWFsdGh5LCBsb3N0VG9rZW5zOiAyXzAwMCB9LFxuXHRcdFx0XHR7IHR1cm5JbmRleDogMiwgY2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5Ub29scywgbG9zdFRva2VuczogNjBfMDAwIH0sXG5cdFx0XHRcdHsgdHVybkluZGV4OiAzLCBjYXRlZ29yeTogQ2FjaGVCcmVha0NhdGVnb3J5LlRvb2xzLCBsb3N0VG9rZW5zOiA1NV8wMDAgfSxcblx0XHRcdFx0eyB0dXJuSW5kZXg6IDQsIGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuRXhwaXJhdGlvbiwgbG9zdFRva2VuczogNDBfMDAwIH0sXG5cdFx0XHRcdHsgdHVybkluZGV4OiA1LCBjYXRlZ29yeTogQ2FjaGVCcmVha0NhdGVnb3J5LlN5c3RlbSwgbG9zdFRva2VuczogMTBfMDAwIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYWlyQ291bnQ6IHJlcG9ydC5wYWlyQ291bnQsXG5cdFx0XHRcdFx0aGVhbHRoeUNvdW50OiByZXBvcnQuaGVhbHRoeUNvdW50LFxuXHRcdFx0XHRcdGF2b2lkYWJsZUxvc3RUb2tlbnM6IHJlcG9ydC5hdm9pZGFibGVMb3N0VG9rZW5zLFxuXHRcdFx0XHRcdGJ5Q2F0ZWdvcnk6IHJlcG9ydC5ieUNhdGVnb3J5LFxuXHRcdFx0XHRcdGZpbmRpbmdTZXZlcml0aWVzOiByZXBvcnQuZmluZGluZ3MubWFwKGYgPT4gKHsgc2V2ZXJpdHk6IGYuc2V2ZXJpdHksIGNhdGVnb3J5OiBmLmNhdGVnb3J5IH0pKSxcblx0XHRcdFx0XHRjYXVzZTM6IHJlcG9ydC5jYXVzZUJ5VHVybkluZGV4LmdldCgzKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhaXJDb3VudDogNSxcblx0XHRcdFx0XHRoZWFsdGh5Q291bnQ6IDEsXG5cdFx0XHRcdFx0YXZvaWRhYmxlTG9zdFRva2VuczogMTI1XzAwMCxcblx0XHRcdFx0XHRieUNhdGVnb3J5OiBbXG5cdFx0XHRcdFx0XHR7IGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuVG9vbHMsIGNvdW50OiAyLCBsb3N0VG9rZW5zOiAxMTVfMDAwIH0sXG5cdFx0XHRcdFx0XHR7IGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuRXhwaXJhdGlvbiwgY291bnQ6IDEsIGxvc3RUb2tlbnM6IDQwXzAwMCB9LFxuXHRcdFx0XHRcdFx0eyBjYXRlZ29yeTogQ2FjaGVCcmVha0NhdGVnb3J5LlN5c3RlbSwgY291bnQ6IDEsIGxvc3RUb2tlbnM6IDEwXzAwMCB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZmluZGluZ1NldmVyaXRpZXM6IFt7IHNldmVyaXR5OiBDYWNoZUluc2lnaHRTZXZlcml0eS5Dcml0aWNhbCwgY2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5Ub29scyB9XSxcblx0XHRcdFx0XHRjYXVzZTM6IENhY2hlQnJlYWtDYXRlZ29yeS5Ub29scyxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGwtaGVhbHRoeSBzZXNzaW9uIHlpZWxkcyBhIHNpbmdsZSBPSyBmaW5kaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb3J0ID0gYnVpbGRTZXNzaW9uQ2FjaGVSZXBvcnQoW1xuXHRcdFx0XHR7IHR1cm5JbmRleDogMSwgY2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5IZWFsdGh5LCBsb3N0VG9rZW5zOiAxXzAwMCB9LFxuXHRcdFx0XHR7IHR1cm5JbmRleDogMiwgY2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5IZWFsdGh5LCBsb3N0VG9rZW5zOiAxXzUwMCB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IGhlYWx0aHlDb3VudDogcmVwb3J0LmhlYWx0aHlDb3VudCwgZmluZGluZ3M6IHJlcG9ydC5maW5kaW5ncy5tYXAoZiA9PiBmLnNldmVyaXR5KSwgYXZvaWRhYmxlOiByZXBvcnQuYXZvaWRhYmxlTG9zdFRva2VucyB9LFxuXHRcdFx0XHR7IGhlYWx0aHlDb3VudDogMiwgZmluZGluZ3M6IFtDYWNoZUluc2lnaHRTZXZlcml0eS5Pa10sIGF2b2lkYWJsZTogMCB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ292ZXJhbGwgaGl0IHJhdGUgaXMgdG9rZW4td2VpZ2h0ZWQgYWNyb3NzIGFsbCB0dXJucycsICgpID0+IHtcblx0XHRcdC8vIE9uZSBodWdlIGhlYWx0aHkgcmVxdWVzdCBhbmQgb25lIHRpbnkgZnVsbCBtaXNzOiBwYWlyLWNvdW50aW5nXG5cdFx0XHQvLyB3b3VsZCByZWFkIFwiNTAlIG9mIHJlcXVlc3RzIG1pc3NlZFwiLCB0b2tlbi13ZWlnaHRpbmcgc2hvd3MgdGhlXG5cdFx0XHQvLyB0cnV0aCBcdTIwMTQgbmVhcmx5IGV2ZXJ5dGhpbmcgd2FzIHNlcnZlZCBmcm9tIGNhY2hlLlxuXHRcdFx0Y29uc3QgcmVwb3J0ID0gYnVpbGRTZXNzaW9uQ2FjaGVSZXBvcnQoXG5cdFx0XHRcdFt7IHR1cm5JbmRleDogMSwgY2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5FeHBpcmF0aW9uLCBsb3N0VG9rZW5zOiAxXzAwMCB9XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgaW5wdXRUb2tlbnM6IDk5XzAwMCwgY2FjaGVkVG9rZW5zOiA5OV8wMDAgfSxcblx0XHRcdFx0XHR7IGlucHV0VG9rZW5zOiAxXzAwMCwgY2FjaGVkVG9rZW5zOiAwIH0sXG5cdFx0XHRcdFx0eyBpbnB1dFRva2VuczogMCwgY2FjaGVkVG9rZW5zOiAwIH0sIC8vIG5vIHVzYWdlIHJlcG9ydGVkIFx1MjAxNCBleGNsdWRlZFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwb3J0Lm92ZXJhbGwsIHtcblx0XHRcdFx0aW5wdXRUb2tlbnM6IDEwMF8wMDAsXG5cdFx0XHRcdGNhY2hlZFRva2VuczogOTlfMDAwLFxuXHRcdFx0XHRoaXRQY3Q6IDk5LFxuXHRcdFx0XHR0dXJuQ291bnQ6IDIsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ292ZXJhbGwgaXMgdW5kZWZpbmVkIHdoZW4gbm8gdHVybiByZXBvcnRlZCB0b2tlbiB1c2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcG9ydCA9IGJ1aWxkU2Vzc2lvbkNhY2hlUmVwb3J0KFxuXHRcdFx0XHRbeyB0dXJuSW5kZXg6IDEsIGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuSGVhbHRoeSwgbG9zdFRva2VuczogMCB9XSxcblx0XHRcdFx0W3sgaW5wdXRUb2tlbnM6IDAsIGNhY2hlZFRva2VuczogMCB9XSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVwb3J0Lm92ZXJhbGwsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWN1cnJpbmcgZXhwaXJhdGlvbiB5aWVsZHMgYSB3YXJuaW5nIGZpbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnQgPSBidWlsZFNlc3Npb25DYWNoZVJlcG9ydChbXG5cdFx0XHRcdHsgdHVybkluZGV4OiAxLCBjYXRlZ29yeTogQ2FjaGVCcmVha0NhdGVnb3J5LkV4cGlyYXRpb24sIGxvc3RUb2tlbnM6IDMwXzAwMCB9LFxuXHRcdFx0XHR7IHR1cm5JbmRleDogMiwgY2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5FeHBpcmF0aW9uLCBsb3N0VG9rZW5zOiAzNV8wMDAgfSxcblx0XHRcdFx0eyB0dXJuSW5kZXg6IDMsIGNhdGVnb3J5OiBDYWNoZUJyZWFrQ2F0ZWdvcnkuSGVhbHRoeSwgbG9zdFRva2VuczogNTAwIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlcG9ydC5maW5kaW5ncy5tYXAoZiA9PiAoeyBzZXZlcml0eTogZi5zZXZlcml0eSwgY2F0ZWdvcnk6IGYuY2F0ZWdvcnkgfSkpLFxuXHRcdFx0XHRbeyBzZXZlcml0eTogQ2FjaGVJbnNpZ2h0U2V2ZXJpdHkuV2FybmluZywgY2F0ZWdvcnk6IENhY2hlQnJlYWtDYXRlZ29yeS5FeHBpcmF0aW9uIH1dLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUErQztBQUN4RCxTQUFTLHlCQUF5QixvQkFBb0IseUJBQXlCLG9CQUFvQixzQkFBc0Isc0JBQXNCLHNCQUFzQixxQkFBeUQsb0JBQW9CLGdCQUFnQix1QkFBdUIseUJBQXlCO0FBRWxULFNBQVMsSUFBSSxNQUFjLE1BQWtDO0FBQzVELFNBQU8sRUFBRSxNQUFNLE1BQU0sWUFBWSxLQUFLLE9BQU87QUFDOUM7QUFFQSxTQUFTLFVBQVUsV0FBeUo7QUFDM0ssUUFBTSxZQUFZLFVBQVUsYUFBYSxDQUFDO0FBQzFDLFFBQU0sWUFBWSxVQUFVLGFBQWEsQ0FBQztBQUMxQyxTQUFPO0FBQUEsSUFDTixRQUFRO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsSUFDVCxRQUFRO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNLG9CQUFvQixXQUFXLFNBQVM7QUFBQSxJQUM5QyxhQUFhLENBQUM7QUFBQSxJQUNkLFFBQVE7QUFBQSxJQUNSLGFBQWE7QUFBQSxJQUNiLHNCQUFzQjtBQUFBLElBQ3RCLGdCQUFnQjtBQUFBLElBQ2hCLHdCQUF3QjtBQUFBLElBQ3hCLHNCQUFzQjtBQUFBLElBQ3RCLEdBQUc7QUFBQSxJQUNIO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFDRDtBQUdBLFNBQVMsTUFBTSxVQUEyRjtBQUN6RyxTQUFPLFNBQVMsSUFBSSxRQUFNLEVBQUUsVUFBVSxFQUFFLFVBQVUsV0FBVyxFQUFFLFVBQVUsRUFBRTtBQUM1RTtBQUVBLE1BQU0sMEJBQTBCLE1BQU07QUFDckMsMENBQXdDO0FBRXhDLFFBQU0sMkJBQTJCLE1BQU07QUFDdEMsU0FBSyxtREFBbUQsTUFBTTtBQUM3RCxhQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0Msd0JBQXdCLFFBQVEsTUFBTTtBQUFBLFVBQ3RDLHdCQUF3QixlQUFlLGVBQWUsR0FBRztBQUFBLFVBQ3pELHdCQUF3QixpQkFBaUIsYUFBYSxHQUFHO0FBQUEsVUFDekQsd0JBQXdCLGdCQUFnQixPQUFPLEdBQUc7QUFBQSxVQUNsRCx3QkFBd0IsU0FBUyxjQUFjLEdBQUc7QUFBQSxVQUNsRCx3QkFBd0Isa0JBQWtCLGVBQWUsR0FBRztBQUFBLFFBQzdEO0FBQUEsUUFDQTtBQUFBLFVBQ0M7QUFBQSxVQUNBLHNCQUFzQjtBQUFBLFVBQ3RCLHNCQUFzQjtBQUFBLFVBQ3RCLHNCQUFzQjtBQUFBLFVBQ3RCLHNCQUFzQjtBQUFBLFVBQ3RCLHNCQUFzQjtBQUFBLFFBQ3ZCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssd0VBQXdFLE1BQU07QUFDbEYsWUFBTSxJQUFJLHdCQUF3QixrQkFBa0IsZUFBZTtBQUNuRSxhQUFPO0FBQUEsUUFDTixFQUFFLGNBQWMsRUFBRSxjQUFjLGNBQWMsRUFBRSxjQUFjLFVBQVUsRUFBRSxVQUFVLFVBQVUsRUFBRSxTQUFTO0FBQUEsUUFDekcsRUFBRSxjQUFjLEdBQUcsY0FBYyxHQUFHLFVBQVUsVUFBVSxVQUFVLFFBQVE7QUFBQSxNQUMzRTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sdUJBQXVCLE1BQU07QUFDbEMsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxhQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0Msb0JBQW9CLHVCQUF1QixxQkFBcUI7QUFBQSxVQUNoRSxvQkFBb0IsMkNBQTJDLHlDQUF5QztBQUFBLFVBQ3hHLG9CQUFvQixxQkFBcUIsbUJBQW1CO0FBQUEsVUFDNUQsb0JBQW9CLG1CQUFtQixpQkFBaUI7QUFBQSxVQUN4RCxvQkFBb0IsY0FBYyxZQUFZO0FBQUEsUUFDL0M7QUFBQSxRQUNBLENBQUMsa0JBQWtCLFdBQVcsa0JBQWtCLE1BQU0sa0JBQWtCLFNBQVMsUUFBVyxNQUFTO0FBQUEsTUFDdEc7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUssOENBQThDLE1BQU07QUFDeEQsWUFBTSxRQUFRLEtBQUssVUFBVSxDQUFDLEVBQUUsTUFBTSxPQUFPLEdBQUcsRUFBRSxNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQ2pFLFlBQU0saUJBQWlCLEtBQUssVUFBVSxDQUFDLEVBQUUsTUFBTSxPQUFPLEdBQUcsRUFBRSxNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQzFFLFlBQU0sWUFBWSxLQUFLLFVBQVUsQ0FBQyxFQUFFLE1BQU0sT0FBTyxHQUFHLEVBQUUsTUFBTSxPQUFPLEdBQUcsRUFBRSxNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQ3ZGLFlBQU0sZ0JBQWdCLEtBQUssVUFBVSxDQUFDLEVBQUUsTUFBTSxRQUFRLGFBQWEsS0FBSyxHQUFHLEVBQUUsTUFBTSxPQUFPLENBQUMsQ0FBQztBQUM1RixhQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MsbUJBQW1CLE9BQU8sY0FBYztBQUFBLFVBQ3hDLG1CQUFtQixPQUFPLFNBQVM7QUFBQSxVQUNuQyxtQkFBbUIsT0FBTyxhQUFhO0FBQUEsVUFDdkMsbUJBQW1CLFlBQVksS0FBSztBQUFBLFFBQ3JDO0FBQUEsUUFDQTtBQUFBLFVBQ0MsRUFBRSxPQUFPLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxVQUFVLENBQUMsR0FBRyxlQUFlLE1BQU0sUUFBUSxHQUFHLFFBQVEsRUFBRTtBQUFBLFVBQ2xGLEVBQUUsT0FBTyxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUMsR0FBRyxVQUFVLENBQUMsR0FBRyxlQUFlLE9BQU8sUUFBUSxHQUFHLFFBQVEsRUFBRTtBQUFBLFVBQ3pGLEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsVUFBVSxDQUFDLE1BQU0sR0FBRyxlQUFlLE9BQU8sUUFBUSxHQUFHLFFBQVEsRUFBRTtBQUFBLFVBQ3pGO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHdCQUF3QixNQUFNO0FBQ25DLFNBQUssd0VBQXdFLE1BQU07QUFDbEYsWUFBTSxTQUFTLENBQUMsSUFBSSxRQUFRLFVBQVUsR0FBRyxJQUFJLGFBQWEsUUFBUSxDQUFDO0FBQ25FLFlBQU0sV0FBVyxxQkFBcUIsVUFBVTtBQUFBLFFBQy9DLFdBQVc7QUFBQSxRQUNYLFdBQVcsQ0FBQyxHQUFHLFFBQVEsSUFBSSxRQUFRLFdBQVcsQ0FBQztBQUFBLE1BQ2hELENBQUMsQ0FBQztBQUNGLGFBQU8sZ0JBQWdCLE1BQU0sUUFBUSxHQUFHO0FBQUEsUUFDdkMsRUFBRSxVQUFVLHFCQUFxQixJQUFJLFdBQVcsY0FBYztBQUFBLE1BQy9ELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFlBQU0sV0FBVyxxQkFBcUIsVUFBVTtBQUFBLFFBQy9DLFdBQVcsQ0FBQyxJQUFJLFFBQVEsVUFBVSxHQUFHLElBQUksYUFBYSxpQkFBaUIsR0FBRyxJQUFJLFFBQVEsTUFBTSxDQUFDO0FBQUEsUUFDN0YsV0FBVyxDQUFDLElBQUksUUFBUSxVQUFVLEdBQUcsSUFBSSxhQUFhLFFBQVEsR0FBRyxJQUFJLFFBQVEsY0FBYyxDQUFDO0FBQUEsTUFDN0YsQ0FBQyxDQUFDO0FBQ0YsYUFBTyxnQkFBZ0IsTUFBTSxRQUFRLEdBQUc7QUFBQSxRQUN2QyxFQUFFLFVBQVUscUJBQXFCLFVBQVUsV0FBVyxjQUFjO0FBQUEsUUFDcEUsRUFBRSxVQUFVLHFCQUFxQixNQUFNLFdBQVcsT0FBVTtBQUFBLE1BQzdELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFlBQU0sV0FBVyxxQkFBcUIsVUFBVTtBQUFBLFFBQy9DLFFBQVE7QUFBQSxRQUNSLFFBQVE7QUFBQSxRQUNSLFFBQVEsS0FBSyxVQUFVLENBQUMsRUFBRSxNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQUEsUUFDekMsUUFBUSxLQUFLLFVBQVUsQ0FBQyxFQUFFLE1BQU0sT0FBTyxHQUFHLEVBQUUsTUFBTSxPQUFPLENBQUMsQ0FBQztBQUFBLFFBQzNELFNBQVM7QUFBQSxRQUNULFNBQVM7QUFBQSxRQUNULFdBQVcsQ0FBQyxJQUFJLFFBQVEsSUFBSSxDQUFDO0FBQUEsUUFDN0IsV0FBVyxDQUFDLElBQUksUUFBUSxJQUFJLEdBQUcsSUFBSSxhQUFhLE9BQU8sQ0FBQztBQUFBLE1BQ3pELENBQUMsQ0FBQztBQUdGLGFBQU8sZ0JBQWdCLE1BQU0sUUFBUSxHQUFHO0FBQUEsUUFDdkMsRUFBRSxVQUFVLHFCQUFxQixVQUFVLFdBQVcsT0FBVTtBQUFBLFFBQ2hFLEVBQUUsVUFBVSxxQkFBcUIsVUFBVSxXQUFXLFFBQVE7QUFBQSxRQUM5RCxFQUFFLFVBQVUscUJBQXFCLFVBQVUsV0FBVyxTQUFTO0FBQUEsUUFDL0QsRUFBRSxVQUFVLHFCQUFxQixNQUFNLFdBQVcsY0FBYztBQUFBLE1BQ2pFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFlBQU0sU0FBUyxDQUFDLElBQUksUUFBUSxVQUFVLENBQUM7QUFDdkMsWUFBTSxXQUFXLHFCQUFxQixVQUFVO0FBQUEsUUFDL0MsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1Isc0JBQXNCO0FBQUEsTUFDdkIsQ0FBQyxDQUFDO0FBQ0YsYUFBTztBQUFBLFFBQ04sU0FBUyxJQUFJLE9BQUssRUFBRSxRQUFRO0FBQUEsUUFDNUIsQ0FBQyxxQkFBcUIsT0FBTztBQUFBLE1BQzlCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxZQUFNLFNBQVMsQ0FBQyxJQUFJLFFBQVEsVUFBVSxDQUFDO0FBQ3ZDLFlBQU0sV0FBVyxxQkFBcUIsVUFBVTtBQUFBLFFBQy9DLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxNQUNULENBQUMsQ0FBQztBQUNGLGFBQU87QUFBQSxRQUNOLFNBQVMsSUFBSSxPQUFLLEVBQUUsUUFBUTtBQUFBLFFBQzVCLENBQUMscUJBQXFCLEVBQUU7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssc0RBQXNELE1BQU07QUFDaEUsWUFBTSxXQUFXLHFCQUFxQixVQUFVO0FBQUEsUUFDL0MsV0FBVyxDQUFDLElBQUksUUFBUSxHQUFHLEdBQUcsSUFBSSxhQUFhLEdBQUcsR0FBRyxJQUFJLFFBQVEsVUFBVSxDQUFDO0FBQUEsUUFDNUUsV0FBVyxDQUFDLElBQUksUUFBUSxHQUFHLEdBQUcsSUFBSSxhQUFhLEdBQUcsQ0FBQztBQUFBLE1BQ3BELENBQUMsQ0FBQztBQUNGLGFBQU8sZ0JBQWdCLE1BQU0sUUFBUSxHQUFHO0FBQUEsUUFDdkMsRUFBRSxVQUFVLHFCQUFxQixVQUFVLFdBQVcsY0FBYztBQUFBLE1BQ3JFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLFlBQU0sV0FBVyxxQkFBcUIsVUFBVTtBQUFBLFFBQy9DLFdBQVcsQ0FBQyxJQUFJLFFBQVEsY0FBYyxDQUFDO0FBQUEsUUFDdkMsV0FBVyxDQUFDLElBQUksUUFBUSxZQUFZLENBQUM7QUFBQSxRQUNyQyxNQUFNLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDaEMsZ0JBQWdCO0FBQUEsUUFDaEIsc0JBQXNCO0FBQUEsTUFDdkIsQ0FBQyxDQUFDO0FBQ0YsYUFBTztBQUFBLFFBQ04sU0FBUyxJQUFJLE9BQUssRUFBRSxRQUFRO0FBQUEsUUFDNUIsQ0FBQyxxQkFBcUIsSUFBSTtBQUFBLE1BQzNCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxZQUFNLFdBQVcscUJBQXFCLFVBQVU7QUFBQSxRQUMvQyxTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsTUFDVixDQUFDLENBQUM7QUFDRixZQUFNLFNBQVMsU0FBUyxLQUFLLE9BQUssRUFBRSxjQUFjLFFBQVE7QUFDMUQsYUFBTztBQUFBLFFBQ04sRUFBRSxVQUFVLFFBQVEsVUFBVSxtQkFBbUIsUUFBUSxNQUFNLFNBQVMsV0FBVyxFQUFFO0FBQUEsUUFDckYsRUFBRSxVQUFVLHFCQUFxQixVQUFVLG1CQUFtQixLQUFLO0FBQUEsTUFDcEU7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFlBQU0sU0FBUyxDQUFDLElBQUksUUFBUSxzQkFBc0IsQ0FBQztBQUNuRCxZQUFNLFdBQVcscUJBQXFCLFVBQVU7QUFBQSxRQUMvQyxXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixhQUFhO0FBQUEsTUFDZCxDQUFDLENBQUM7QUFDRixhQUFPO0FBQUEsUUFDTixFQUFFLFlBQVksU0FBUyxJQUFJLE9BQUssRUFBRSxRQUFRLEdBQUcsaUJBQWlCLFNBQVMsQ0FBQyxFQUFFLE1BQU0sU0FBUyxTQUFTLEVBQUU7QUFBQSxRQUNwRyxFQUFFLFlBQVksQ0FBQyxxQkFBcUIsT0FBTyxHQUFHLGlCQUFpQixLQUFLO0FBQUEsTUFDckU7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFlBQU0sU0FBUyxDQUFDLElBQUksUUFBUSxHQUFHLENBQUM7QUFDaEMsWUFBTSxXQUFXLE1BQU0sS0FBSyxFQUFFLFFBQVEsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLElBQUksUUFBUSxVQUFVLENBQUMsRUFBRSxDQUFDO0FBQ2hGLFlBQU0sV0FBVyxxQkFBcUIsVUFBVTtBQUFBLFFBQy9DLFdBQVc7QUFBQSxRQUNYLFdBQVcsQ0FBQyxHQUFHLFFBQVEsR0FBRyxRQUFRO0FBQUEsTUFDbkMsQ0FBQyxDQUFDO0FBQ0YsYUFBTztBQUFBLFFBQ04sU0FBUyxJQUFJLE9BQUssRUFBRSxRQUFRO0FBQUEsUUFDNUIsQ0FBQyxxQkFBcUIsSUFBSSxxQkFBcUIsT0FBTztBQUFBLE1BQ3ZEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw0RkFBNEYsTUFBTTtBQUN0RyxZQUFNLFdBQVcscUJBQXFCLFVBQVU7QUFBQSxRQUMvQyxTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsUUFDVCxXQUFXLENBQUMsSUFBSSxRQUFRLEdBQUcsQ0FBQztBQUFBLFFBQzVCLFdBQVcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxHQUFHLElBQUksYUFBYSxHQUFHLENBQUM7QUFBQSxNQUNwRCxDQUFDLENBQUM7QUFDRixhQUFPO0FBQUEsUUFDTixFQUFFLEtBQUssbUJBQW1CLFFBQVEsR0FBRyxrQkFBa0IsZUFBZSxRQUFRLEdBQUcsVUFBVTtBQUFBLFFBQzNGLEVBQUUsS0FBSyxxQkFBcUIsVUFBVSxrQkFBa0IsU0FBUztBQUFBLE1BQ2xFO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxTQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELFlBQU0sU0FBUyxDQUFDLElBQUksUUFBUSxHQUFHLEdBQUcsSUFBSSxhQUFhLEdBQUcsQ0FBQztBQUN2RCxhQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MscUJBQXFCLHFCQUFxQixVQUFVLEVBQUUsV0FBVyxRQUFRLFdBQVcsQ0FBQyxHQUFHLFFBQVEsSUFBSSxRQUFRLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQUEsVUFDeEgscUJBQXFCLHFCQUFxQixVQUFVLEVBQUUsU0FBUyxNQUFNLFNBQVMsTUFBTSxXQUFXLFFBQVEsV0FBVyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQUEsVUFDNUgscUJBQXFCLHFCQUFxQixVQUFVLEVBQUUsV0FBVyxRQUFRLFdBQVcsUUFBUSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFBQSxVQUN6RyxxQkFBcUIscUJBQXFCLFVBQVU7QUFBQSxZQUNuRCxXQUFXLENBQUMsSUFBSSxRQUFRLEdBQUcsR0FBRyxJQUFJLGFBQWEsT0FBTyxDQUFDO0FBQUEsWUFDdkQsV0FBVyxDQUFDLElBQUksUUFBUSxHQUFHLEdBQUcsSUFBSSxhQUFhLE9BQU8sQ0FBQztBQUFBLFVBQ3hELENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDSjtBQUFBLFFBQ0EsQ0FBQyxtQkFBbUIsU0FBUyxtQkFBbUIsUUFBUSxtQkFBbUIsWUFBWSxtQkFBbUIsT0FBTztBQUFBLE1BQ2xIO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxTQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFlBQU0sU0FBUyx3QkFBd0I7QUFBQSxRQUN0QyxFQUFFLFdBQVcsR0FBRyxVQUFVLG1CQUFtQixTQUFTLFlBQVksSUFBTTtBQUFBLFFBQ3hFLEVBQUUsV0FBVyxHQUFHLFVBQVUsbUJBQW1CLE9BQU8sWUFBWSxJQUFPO0FBQUEsUUFDdkUsRUFBRSxXQUFXLEdBQUcsVUFBVSxtQkFBbUIsT0FBTyxZQUFZLEtBQU87QUFBQSxRQUN2RSxFQUFFLFdBQVcsR0FBRyxVQUFVLG1CQUFtQixZQUFZLFlBQVksSUFBTztBQUFBLFFBQzVFLEVBQUUsV0FBVyxHQUFHLFVBQVUsbUJBQW1CLFFBQVEsWUFBWSxJQUFPO0FBQUEsTUFDekUsQ0FBQztBQUNELGFBQU87QUFBQSxRQUNOO0FBQUEsVUFDQyxXQUFXLE9BQU87QUFBQSxVQUNsQixjQUFjLE9BQU87QUFBQSxVQUNyQixxQkFBcUIsT0FBTztBQUFBLFVBQzVCLFlBQVksT0FBTztBQUFBLFVBQ25CLG1CQUFtQixPQUFPLFNBQVMsSUFBSSxRQUFNLEVBQUUsVUFBVSxFQUFFLFVBQVUsVUFBVSxFQUFFLFNBQVMsRUFBRTtBQUFBLFVBQzVGLFFBQVEsT0FBTyxpQkFBaUIsSUFBSSxDQUFDO0FBQUEsUUFDdEM7QUFBQSxRQUNBO0FBQUEsVUFDQyxXQUFXO0FBQUEsVUFDWCxjQUFjO0FBQUEsVUFDZCxxQkFBcUI7QUFBQSxVQUNyQixZQUFZO0FBQUEsWUFDWCxFQUFFLFVBQVUsbUJBQW1CLE9BQU8sT0FBTyxHQUFHLFlBQVksTUFBUTtBQUFBLFlBQ3BFLEVBQUUsVUFBVSxtQkFBbUIsWUFBWSxPQUFPLEdBQUcsWUFBWSxJQUFPO0FBQUEsWUFDeEUsRUFBRSxVQUFVLG1CQUFtQixRQUFRLE9BQU8sR0FBRyxZQUFZLElBQU87QUFBQSxVQUNyRTtBQUFBLFVBQ0EsbUJBQW1CLENBQUMsRUFBRSxVQUFVLHFCQUFxQixVQUFVLFVBQVUsbUJBQW1CLE1BQU0sQ0FBQztBQUFBLFVBQ25HLFFBQVEsbUJBQW1CO0FBQUEsUUFDNUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxrREFBa0QsTUFBTTtBQUM1RCxZQUFNLFNBQVMsd0JBQXdCO0FBQUEsUUFDdEMsRUFBRSxXQUFXLEdBQUcsVUFBVSxtQkFBbUIsU0FBUyxZQUFZLElBQU07QUFBQSxRQUN4RSxFQUFFLFdBQVcsR0FBRyxVQUFVLG1CQUFtQixTQUFTLFlBQVksS0FBTTtBQUFBLE1BQ3pFLENBQUM7QUFDRCxhQUFPO0FBQUEsUUFDTixFQUFFLGNBQWMsT0FBTyxjQUFjLFVBQVUsT0FBTyxTQUFTLElBQUksT0FBSyxFQUFFLFFBQVEsR0FBRyxXQUFXLE9BQU8sb0JBQW9CO0FBQUEsUUFDM0gsRUFBRSxjQUFjLEdBQUcsVUFBVSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsV0FBVyxFQUFFO0FBQUEsTUFDdEU7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHVEQUF1RCxNQUFNO0FBSWpFLFlBQU0sU0FBUztBQUFBLFFBQ2QsQ0FBQyxFQUFFLFdBQVcsR0FBRyxVQUFVLG1CQUFtQixZQUFZLFlBQVksSUFBTSxDQUFDO0FBQUEsUUFDN0U7QUFBQSxVQUNDLEVBQUUsYUFBYSxNQUFRLGNBQWMsS0FBTztBQUFBLFVBQzVDLEVBQUUsYUFBYSxLQUFPLGNBQWMsRUFBRTtBQUFBLFVBQ3RDLEVBQUUsYUFBYSxHQUFHLGNBQWMsRUFBRTtBQUFBO0FBQUEsUUFDbkM7QUFBQSxNQUNEO0FBQ0EsYUFBTyxnQkFBZ0IsT0FBTyxTQUFTO0FBQUEsUUFDdEMsYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLFFBQ2QsUUFBUTtBQUFBLFFBQ1IsV0FBVztBQUFBLE1BQ1osQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssMERBQTBELE1BQU07QUFDcEUsWUFBTSxTQUFTO0FBQUEsUUFDZCxDQUFDLEVBQUUsV0FBVyxHQUFHLFVBQVUsbUJBQW1CLFNBQVMsWUFBWSxFQUFFLENBQUM7QUFBQSxRQUN0RSxDQUFDLEVBQUUsYUFBYSxHQUFHLGNBQWMsRUFBRSxDQUFDO0FBQUEsTUFDckM7QUFDQSxhQUFPLFlBQVksT0FBTyxTQUFTLE1BQVM7QUFBQSxJQUM3QyxDQUFDO0FBRUQsU0FBSyxpREFBaUQsTUFBTTtBQUMzRCxZQUFNLFNBQVMsd0JBQXdCO0FBQUEsUUFDdEMsRUFBRSxXQUFXLEdBQUcsVUFBVSxtQkFBbUIsWUFBWSxZQUFZLElBQU87QUFBQSxRQUM1RSxFQUFFLFdBQVcsR0FBRyxVQUFVLG1CQUFtQixZQUFZLFlBQVksS0FBTztBQUFBLFFBQzVFLEVBQUUsV0FBVyxHQUFHLFVBQVUsbUJBQW1CLFNBQVMsWUFBWSxJQUFJO0FBQUEsTUFDdkUsQ0FBQztBQUNELGFBQU87QUFBQSxRQUNOLE9BQU8sU0FBUyxJQUFJLFFBQU0sRUFBRSxVQUFVLEVBQUUsVUFBVSxVQUFVLEVBQUUsU0FBUyxFQUFFO0FBQUEsUUFDekUsQ0FBQyxFQUFFLFVBQVUscUJBQXFCLFNBQVMsVUFBVSxtQkFBbUIsV0FBVyxDQUFDO0FBQUEsTUFDckY7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
