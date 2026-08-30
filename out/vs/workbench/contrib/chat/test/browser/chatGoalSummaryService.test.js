import * as assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { cleanGoalSummary } from "../../browser/chatGoalSummaryService.js";
suite("ChatGoalSummaryService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("cleanGoalSummary", () => {
    test("suppresses model refusals so they are never shown as a goal", () => {
      const refusals = [
        "Sorry, I can't assist with that.",
        "Sorry, I can\u2019t assist with that.",
        "I cannot help with that request.",
        "I'm sorry, but I can't help with that.",
        "I am unable to assist with this.",
        "I am not able to summarize that.",
        "Unfortunately, I can't do that.",
        "As an AI, I cannot comply.",
        "My apologies, I won't do that.",
        "I apologize, but I cannot help."
      ];
      assert.deepStrictEqual(
        refusals.map(cleanGoalSummary),
        refusals.map(() => void 0)
      );
    });
    test("keeps and normalizes legitimate summaries", () => {
      const cases = [
        ["Fix the avatar popup bug", "Fix the avatar popup bug"],
        ['"Add tests for the parser"', "Add tests for the parser"],
        ["Goal: Refactor the loader", "Refactor the loader"],
        ["  Improve   error   handling  ", "Improve error handling"],
        [`Prevent the "Sorry, I can't assist" goal-banner error`, `Prevent the "Sorry, I can't assist" goal-banner error`],
        ["Implement cannot-connect retry logic", "Implement cannot-connect retry logic"],
        ["I'll add tests for the service", "I'll add tests for the service"],
        ["", void 0],
        ["   ", void 0]
      ];
      assert.deepStrictEqual(
        cases.map(([raw]) => cleanGoalSummary(raw)),
        cases.map(([, expected]) => expected)
      );
    });
    test("truncates over-long summaries to a single ellipsized phrase", () => {
      const long = "Add comprehensive integration tests covering every permission level and autopilot continuation path across the chat widget";
      const result = cleanGoalSummary(long);
      assert.ok(result, "expected a truncated summary");
      assert.ok(result.length <= 100, `expected <= 100 chars, got ${result.length}`);
      assert.ok(result.endsWith("\u2026"), "expected a trailing ellipsis");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRHb2FsU3VtbWFyeVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjbGVhbkdvYWxTdW1tYXJ5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jaGF0R29hbFN1bW1hcnlTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0NoYXRHb2FsU3VtbWFyeVNlcnZpY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdjbGVhbkdvYWxTdW1tYXJ5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3N1cHByZXNzZXMgbW9kZWwgcmVmdXNhbHMgc28gdGhleSBhcmUgbmV2ZXIgc2hvd24gYXMgYSBnb2FsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVmdXNhbHMgPSBbXG5cdFx0XHRcdCdTb3JyeSwgSSBjYW5cXCd0IGFzc2lzdCB3aXRoIHRoYXQuJyxcblx0XHRcdFx0J1NvcnJ5LCBJIGNhblxcdTIwMTl0IGFzc2lzdCB3aXRoIHRoYXQuJyxcblx0XHRcdFx0J0kgY2Fubm90IGhlbHAgd2l0aCB0aGF0IHJlcXVlc3QuJyxcblx0XHRcdFx0J0lcXCdtIHNvcnJ5LCBidXQgSSBjYW5cXCd0IGhlbHAgd2l0aCB0aGF0LicsXG5cdFx0XHRcdCdJIGFtIHVuYWJsZSB0byBhc3Npc3Qgd2l0aCB0aGlzLicsXG5cdFx0XHRcdCdJIGFtIG5vdCBhYmxlIHRvIHN1bW1hcml6ZSB0aGF0LicsXG5cdFx0XHRcdCdVbmZvcnR1bmF0ZWx5LCBJIGNhblxcJ3QgZG8gdGhhdC4nLFxuXHRcdFx0XHQnQXMgYW4gQUksIEkgY2Fubm90IGNvbXBseS4nLFxuXHRcdFx0XHQnTXkgYXBvbG9naWVzLCBJIHdvblxcJ3QgZG8gdGhhdC4nLFxuXHRcdFx0XHQnSSBhcG9sb2dpemUsIGJ1dCBJIGNhbm5vdCBoZWxwLicsXG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWZ1c2Fscy5tYXAoY2xlYW5Hb2FsU3VtbWFyeSksXG5cdFx0XHRcdHJlZnVzYWxzLm1hcCgoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGFuZCBub3JtYWxpemVzIGxlZ2l0aW1hdGUgc3VtbWFyaWVzJywgKCkgPT4ge1xuXHRcdFx0Ly8gW3Jhd01vZGVsVGV4dCwgZXhwZWN0ZWRHb2FsXS4gSW5jbHVkZXMgdGhlIG1ldGEgY2FzZSBvZiBhIHJlcXVlc3QgdGhhdFxuXHRcdFx0Ly8gbWVudGlvbnMgYSByZWZ1c2FsIGJ1dCBpcyBpdHNlbGYgYSB2YWxpZCBnb2FsLCBwbHVzIGltcGVyYXRpdmUgcGhyYXNlc1xuXHRcdFx0Ly8gdGhhdCBiZWdpbiB3aXRoIHdvcmRzIGFwcGVhcmluZyBpbnNpZGUgdGhlIHJlZnVzYWwgcGF0dGVybi5cblx0XHRcdGNvbnN0IGNhc2VzOiBbc3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWRdW10gPSBbXG5cdFx0XHRcdFsnRml4IHRoZSBhdmF0YXIgcG9wdXAgYnVnJywgJ0ZpeCB0aGUgYXZhdGFyIHBvcHVwIGJ1ZyddLFxuXHRcdFx0XHRbJ1wiQWRkIHRlc3RzIGZvciB0aGUgcGFyc2VyXCInLCAnQWRkIHRlc3RzIGZvciB0aGUgcGFyc2VyJ10sXG5cdFx0XHRcdFsnR29hbDogUmVmYWN0b3IgdGhlIGxvYWRlcicsICdSZWZhY3RvciB0aGUgbG9hZGVyJ10sXG5cdFx0XHRcdFsnICBJbXByb3ZlICAgZXJyb3IgICBoYW5kbGluZyAgJywgJ0ltcHJvdmUgZXJyb3IgaGFuZGxpbmcnXSxcblx0XHRcdFx0WydQcmV2ZW50IHRoZSBcIlNvcnJ5LCBJIGNhblxcJ3QgYXNzaXN0XCIgZ29hbC1iYW5uZXIgZXJyb3InLCAnUHJldmVudCB0aGUgXCJTb3JyeSwgSSBjYW5cXCd0IGFzc2lzdFwiIGdvYWwtYmFubmVyIGVycm9yJ10sXG5cdFx0XHRcdFsnSW1wbGVtZW50IGNhbm5vdC1jb25uZWN0IHJldHJ5IGxvZ2ljJywgJ0ltcGxlbWVudCBjYW5ub3QtY29ubmVjdCByZXRyeSBsb2dpYyddLFxuXHRcdFx0XHRbJ0lcXCdsbCBhZGQgdGVzdHMgZm9yIHRoZSBzZXJ2aWNlJywgJ0lcXCdsbCBhZGQgdGVzdHMgZm9yIHRoZSBzZXJ2aWNlJ10sXG5cdFx0XHRcdFsnJywgdW5kZWZpbmVkXSxcblx0XHRcdFx0WycgICAnLCB1bmRlZmluZWRdLFxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Y2FzZXMubWFwKChbcmF3XSkgPT4gY2xlYW5Hb2FsU3VtbWFyeShyYXcpKSxcblx0XHRcdFx0Y2FzZXMubWFwKChbLCBleHBlY3RlZF0pID0+IGV4cGVjdGVkKSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVuY2F0ZXMgb3Zlci1sb25nIHN1bW1hcmllcyB0byBhIHNpbmdsZSBlbGxpcHNpemVkIHBocmFzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvbmcgPSAnQWRkIGNvbXByZWhlbnNpdmUgaW50ZWdyYXRpb24gdGVzdHMgY292ZXJpbmcgZXZlcnkgcGVybWlzc2lvbiBsZXZlbCBhbmQgYXV0b3BpbG90IGNvbnRpbnVhdGlvbiBwYXRoIGFjcm9zcyB0aGUgY2hhdCB3aWRnZXQnO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2xlYW5Hb2FsU3VtbWFyeShsb25nKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ2V4cGVjdGVkIGEgdHJ1bmNhdGVkIHN1bW1hcnknKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQubGVuZ3RoIDw9IDEwMCwgYGV4cGVjdGVkIDw9IDEwMCBjaGFycywgZ290ICR7cmVzdWx0Lmxlbmd0aH1gKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZW5kc1dpdGgoJ1xcdTIwMjYnKSwgJ2V4cGVjdGVkIGEgdHJhaWxpbmcgZWxsaXBzaXMnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUVqQyxNQUFNLDBCQUEwQixNQUFNO0FBQ3JDLDBDQUF3QztBQUV4QyxRQUFNLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssK0RBQStELE1BQU07QUFDekUsWUFBTSxXQUFXO0FBQUEsUUFDaEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ04sU0FBUyxJQUFJLGdCQUFnQjtBQUFBLFFBQzdCLFNBQVMsSUFBSSxNQUFNLE1BQVM7QUFBQSxNQUM3QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNkNBQTZDLE1BQU07QUFJdkQsWUFBTSxRQUF3QztBQUFBLFFBQzdDLENBQUMsNEJBQTRCLDBCQUEwQjtBQUFBLFFBQ3ZELENBQUMsOEJBQThCLDBCQUEwQjtBQUFBLFFBQ3pELENBQUMsNkJBQTZCLHFCQUFxQjtBQUFBLFFBQ25ELENBQUMsa0NBQWtDLHdCQUF3QjtBQUFBLFFBQzNELENBQUMseURBQTBELHVEQUF3RDtBQUFBLFFBQ25ILENBQUMsd0NBQXdDLHNDQUFzQztBQUFBLFFBQy9FLENBQUMsa0NBQW1DLGdDQUFpQztBQUFBLFFBQ3JFLENBQUMsSUFBSSxNQUFTO0FBQUEsUUFDZCxDQUFDLE9BQU8sTUFBUztBQUFBLE1BQ2xCO0FBRUEsYUFBTztBQUFBLFFBQ04sTUFBTSxJQUFJLENBQUMsQ0FBQyxHQUFHLE1BQU0saUJBQWlCLEdBQUcsQ0FBQztBQUFBLFFBQzFDLE1BQU0sSUFBSSxDQUFDLENBQUMsRUFBRSxRQUFRLE1BQU0sUUFBUTtBQUFBLE1BQ3JDO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywrREFBK0QsTUFBTTtBQUN6RSxZQUFNLE9BQU87QUFDYixZQUFNLFNBQVMsaUJBQWlCLElBQUk7QUFFcEMsYUFBTyxHQUFHLFFBQVEsOEJBQThCO0FBQ2hELGFBQU8sR0FBRyxPQUFPLFVBQVUsS0FBSyw4QkFBOEIsT0FBTyxNQUFNLEVBQUU7QUFDN0UsYUFBTyxHQUFHLE9BQU8sU0FBUyxRQUFRLEdBQUcsOEJBQThCO0FBQUEsSUFDcEUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
