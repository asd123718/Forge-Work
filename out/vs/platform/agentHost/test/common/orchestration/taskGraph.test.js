import * as assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { fallbackOrchestrationPlan, parseOrchestrationPlan, readyTaskIds } from "../../../common/orchestration/taskGraph.js";
import { isOrchestrationRequest, readAssignment } from "../../../common/orchestration/orchestrationTypes.js";
suite("Forge orchestration task graph", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses a fenced leader plan and keeps parallel tasks ready", () => {
    const plan = parseOrchestrationPlan(`
Here is the DAG:

\`\`\`json
{
  "summary": "Split UI and API",
  "contract": "Match existing CSS. Keep src/api public.",
  "tasks": [
    { "id": "api", "title": "API types", "prompt": "Add types", "files": ["src/api.ts"], "dependsOn": [], "workerHint": "deepseek-harness" },
    { "id": "ui", "title": "UI", "prompt": "Add view", "files": ["src/ui.ts"], "dependsOn": [], "workerHint": "grok-build" }
  ]
}
\`\`\`
`);
    assert.ok(plan);
    assert.strictEqual(plan.tasks.length, 2);
    assert.deepStrictEqual(readyTaskIds(plan.tasks, /* @__PURE__ */ new Set()), ["api", "ui"]);
  });
  test("blocks dependents until prerequisites complete", () => {
    const plan = fallbackOrchestrationPlan("ship the feature", ["deepseek-harness", "grok-build"]);
    assert.strictEqual(plan.tasks.length, 2);
    assert.deepStrictEqual(readyTaskIds(plan.tasks, /* @__PURE__ */ new Set()), ["discover", "implement"]);
    const chained = {
      summary: "",
      contract: "",
      tasks: [
        { id: "a", title: "a", prompt: "a", files: [], dependsOn: [] },
        { id: "b", title: "b", prompt: "b", files: [], dependsOn: ["a"] }
      ]
    };
    assert.deepStrictEqual(readyTaskIds(chained.tasks, /* @__PURE__ */ new Set()), ["a"]);
    assert.deepStrictEqual(readyTaskIds(chained.tasks, /* @__PURE__ */ new Set(["a"])), ["b"]);
  });
  test("reads a user assignment without requiring hardcoded models", () => {
    const assignment = readAssignment({
      leader: { providerId: "grok-build", label: "Grok Build", model: "grok-4.6" },
      workers: [{ providerId: "codex", label: "Codex" }, { providerId: "deepseek-harness", label: "DeepSeek Harness" }]
    });
    assert.strictEqual(assignment?.leader.role, "leader");
    assert.strictEqual(assignment?.leader.providerId, "grok-build");
    assert.strictEqual(assignment?.workers[0].providerId, "codex");
    assert.strictEqual(isOrchestrationRequest({ goal: "x", workspace: "/tmp" }), true);
    assert.strictEqual(isOrchestrationRequest({ consumed: "x" }), false);
  });
  test("parses a grok json envelope without treating the wrapper as the plan", () => {
    const plan = parseOrchestrationPlan(JSON.stringify({
      text: '```json\n{"summary":"ok","contract":"small","tasks":[{"id":"t1","title":"A","prompt":"do","files":[],"dependsOn":[]}]}\n```',
      usage: { input_tokens: 1 }
    }));
    assert.ok(plan);
    assert.strictEqual(plan.summary, "ok");
    assert.strictEqual(plan.tasks[0].id, "t1");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXG9yY2hlc3RyYXRpb25cXHRhc2tHcmFwaC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXHJcbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxyXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xyXG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcclxuaW1wb3J0IHsgZmFsbGJhY2tPcmNoZXN0cmF0aW9uUGxhbiwgcGFyc2VPcmNoZXN0cmF0aW9uUGxhbiwgcmVhZHlUYXNrSWRzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL29yY2hlc3RyYXRpb24vdGFza0dyYXBoLmpzJztcclxuaW1wb3J0IHsgaXNPcmNoZXN0cmF0aW9uUmVxdWVzdCwgcmVhZEFzc2lnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vb3JjaGVzdHJhdGlvbi9vcmNoZXN0cmF0aW9uVHlwZXMuanMnO1xyXG5cclxuc3VpdGUoJ0ZvcmdlIG9yY2hlc3RyYXRpb24gdGFzayBncmFwaCcsICgpID0+IHtcclxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcclxuXHJcblx0dGVzdCgncGFyc2VzIGEgZmVuY2VkIGxlYWRlciBwbGFuIGFuZCBrZWVwcyBwYXJhbGxlbCB0YXNrcyByZWFkeScsICgpID0+IHtcclxuXHRcdGNvbnN0IHBsYW4gPSBwYXJzZU9yY2hlc3RyYXRpb25QbGFuKGBcclxuSGVyZSBpcyB0aGUgREFHOlxyXG5cclxuXFxgXFxgXFxganNvblxyXG57XHJcbiAgXCJzdW1tYXJ5XCI6IFwiU3BsaXQgVUkgYW5kIEFQSVwiLFxyXG4gIFwiY29udHJhY3RcIjogXCJNYXRjaCBleGlzdGluZyBDU1MuIEtlZXAgc3JjL2FwaSBwdWJsaWMuXCIsXHJcbiAgXCJ0YXNrc1wiOiBbXHJcbiAgICB7IFwiaWRcIjogXCJhcGlcIiwgXCJ0aXRsZVwiOiBcIkFQSSB0eXBlc1wiLCBcInByb21wdFwiOiBcIkFkZCB0eXBlc1wiLCBcImZpbGVzXCI6IFtcInNyYy9hcGkudHNcIl0sIFwiZGVwZW5kc09uXCI6IFtdLCBcIndvcmtlckhpbnRcIjogXCJkZWVwc2Vlay1oYXJuZXNzXCIgfSxcclxuICAgIHsgXCJpZFwiOiBcInVpXCIsIFwidGl0bGVcIjogXCJVSVwiLCBcInByb21wdFwiOiBcIkFkZCB2aWV3XCIsIFwiZmlsZXNcIjogW1wic3JjL3VpLnRzXCJdLCBcImRlcGVuZHNPblwiOiBbXSwgXCJ3b3JrZXJIaW50XCI6IFwiZ3Jvay1idWlsZFwiIH1cclxuICBdXHJcbn1cclxuXFxgXFxgXFxgXHJcbmApO1xyXG5cdFx0YXNzZXJ0Lm9rKHBsYW4pO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsYW4udGFza3MubGVuZ3RoLCAyKTtcclxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZHlUYXNrSWRzKHBsYW4udGFza3MsIG5ldyBTZXQoKSksIFsnYXBpJywgJ3VpJ10pO1xyXG5cdH0pO1xyXG5cclxuXHR0ZXN0KCdibG9ja3MgZGVwZW5kZW50cyB1bnRpbCBwcmVyZXF1aXNpdGVzIGNvbXBsZXRlJywgKCkgPT4ge1xyXG5cdFx0Y29uc3QgcGxhbiA9IGZhbGxiYWNrT3JjaGVzdHJhdGlvblBsYW4oJ3NoaXAgdGhlIGZlYXR1cmUnLCBbJ2RlZXBzZWVrLWhhcm5lc3MnLCAnZ3Jvay1idWlsZCddKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGFuLnRhc2tzLmxlbmd0aCwgMik7XHJcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWR5VGFza0lkcyhwbGFuLnRhc2tzLCBuZXcgU2V0KCkpLCBbJ2Rpc2NvdmVyJywgJ2ltcGxlbWVudCddKTtcclxuXHRcdGNvbnN0IGNoYWluZWQgPSB7XHJcblx0XHRcdHN1bW1hcnk6ICcnLFxyXG5cdFx0XHRjb250cmFjdDogJycsXHJcblx0XHRcdHRhc2tzOiBbXHJcblx0XHRcdFx0eyBpZDogJ2EnLCB0aXRsZTogJ2EnLCBwcm9tcHQ6ICdhJywgZmlsZXM6IFtdLCBkZXBlbmRzT246IFtdIH0sXHJcblx0XHRcdFx0eyBpZDogJ2InLCB0aXRsZTogJ2InLCBwcm9tcHQ6ICdiJywgZmlsZXM6IFtdLCBkZXBlbmRzT246IFsnYSddIH0sXHJcblx0XHRcdF0sXHJcblx0XHR9O1xyXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkeVRhc2tJZHMoY2hhaW5lZC50YXNrcywgbmV3IFNldCgpKSwgWydhJ10pO1xyXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkeVRhc2tJZHMoY2hhaW5lZC50YXNrcywgbmV3IFNldChbJ2EnXSkpLCBbJ2InXSk7XHJcblx0fSk7XHJcblxyXG5cdHRlc3QoJ3JlYWRzIGEgdXNlciBhc3NpZ25tZW50IHdpdGhvdXQgcmVxdWlyaW5nIGhhcmRjb2RlZCBtb2RlbHMnLCAoKSA9PiB7XHJcblx0XHRjb25zdCBhc3NpZ25tZW50ID0gcmVhZEFzc2lnbm1lbnQoe1xyXG5cdFx0XHRsZWFkZXI6IHsgcHJvdmlkZXJJZDogJ2dyb2stYnVpbGQnLCBsYWJlbDogJ0dyb2sgQnVpbGQnLCBtb2RlbDogJ2dyb2stNC42JyB9LFxyXG5cdFx0XHR3b3JrZXJzOiBbeyBwcm92aWRlcklkOiAnY29kZXgnLCBsYWJlbDogJ0NvZGV4JyB9LCB7IHByb3ZpZGVySWQ6ICdkZWVwc2Vlay1oYXJuZXNzJywgbGFiZWw6ICdEZWVwU2VlayBIYXJuZXNzJyB9XSxcclxuXHRcdH0pO1xyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFzc2lnbm1lbnQ/LmxlYWRlci5yb2xlLCAnbGVhZGVyJyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXNzaWdubWVudD8ubGVhZGVyLnByb3ZpZGVySWQsICdncm9rLWJ1aWxkJyk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXNzaWdubWVudD8ud29ya2Vyc1swXS5wcm92aWRlcklkLCAnY29kZXgnKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc09yY2hlc3RyYXRpb25SZXF1ZXN0KHsgZ29hbDogJ3gnLCB3b3Jrc3BhY2U6ICcvdG1wJyB9KSwgdHJ1ZSk7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNPcmNoZXN0cmF0aW9uUmVxdWVzdCh7IGNvbnN1bWVkOiAneCcgfSksIGZhbHNlKTtcclxuXHR9KTtcclxuXHJcblx0dGVzdCgncGFyc2VzIGEgZ3JvayBqc29uIGVudmVsb3BlIHdpdGhvdXQgdHJlYXRpbmcgdGhlIHdyYXBwZXIgYXMgdGhlIHBsYW4nLCAoKSA9PiB7XHJcblx0XHRjb25zdCBwbGFuID0gcGFyc2VPcmNoZXN0cmF0aW9uUGxhbihKU09OLnN0cmluZ2lmeSh7XHJcblx0XHRcdHRleHQ6ICdgYGBqc29uXFxue1wic3VtbWFyeVwiOlwib2tcIixcImNvbnRyYWN0XCI6XCJzbWFsbFwiLFwidGFza3NcIjpbe1wiaWRcIjpcInQxXCIsXCJ0aXRsZVwiOlwiQVwiLFwicHJvbXB0XCI6XCJkb1wiLFwiZmlsZXNcIjpbXSxcImRlcGVuZHNPblwiOltdfV19XFxuYGBgJyxcclxuXHRcdFx0dXNhZ2U6IHsgaW5wdXRfdG9rZW5zOiAxIH0sXHJcblx0XHR9KSk7XHJcblx0XHRhc3NlcnQub2socGxhbik7XHJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhbi5zdW1tYXJ5LCAnb2snKTtcclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGFuLnRhc2tzWzBdLmlkLCAndDEnKTtcclxuXHR9KTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQix3QkFBd0Isb0JBQW9CO0FBQ2hGLFNBQVMsd0JBQXdCLHNCQUFzQjtBQUV2RCxNQUFNLGtDQUFrQyxNQUFNO0FBQzdDLDBDQUF3QztBQUV4QyxPQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFVBQU0sT0FBTyx1QkFBdUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxDQWFyQztBQUNDLFdBQU8sR0FBRyxJQUFJO0FBQ2QsV0FBTyxZQUFZLEtBQUssTUFBTSxRQUFRLENBQUM7QUFDdkMsV0FBTyxnQkFBZ0IsYUFBYSxLQUFLLE9BQU8sb0JBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksQ0FBQztBQUFBLEVBQzFFLENBQUM7QUFFRCxPQUFLLGtEQUFrRCxNQUFNO0FBQzVELFVBQU0sT0FBTywwQkFBMEIsb0JBQW9CLENBQUMsb0JBQW9CLFlBQVksQ0FBQztBQUM3RixXQUFPLFlBQVksS0FBSyxNQUFNLFFBQVEsQ0FBQztBQUN2QyxXQUFPLGdCQUFnQixhQUFhLEtBQUssT0FBTyxvQkFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFlBQVksV0FBVyxDQUFDO0FBQ3JGLFVBQU0sVUFBVTtBQUFBLE1BQ2YsU0FBUztBQUFBLE1BQ1QsVUFBVTtBQUFBLE1BQ1YsT0FBTztBQUFBLFFBQ04sRUFBRSxJQUFJLEtBQUssT0FBTyxLQUFLLFFBQVEsS0FBSyxPQUFPLENBQUMsR0FBRyxXQUFXLENBQUMsRUFBRTtBQUFBLFFBQzdELEVBQUUsSUFBSSxLQUFLLE9BQU8sS0FBSyxRQUFRLEtBQUssT0FBTyxDQUFDLEdBQUcsV0FBVyxDQUFDLEdBQUcsRUFBRTtBQUFBLE1BQ2pFO0FBQUEsSUFDRDtBQUNBLFdBQU8sZ0JBQWdCLGFBQWEsUUFBUSxPQUFPLG9CQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQ3BFLFdBQU8sZ0JBQWdCLGFBQWEsUUFBUSxPQUFPLG9CQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQUEsRUFDMUUsQ0FBQztBQUVELE9BQUssOERBQThELE1BQU07QUFDeEUsVUFBTSxhQUFhLGVBQWU7QUFBQSxNQUNqQyxRQUFRLEVBQUUsWUFBWSxjQUFjLE9BQU8sY0FBYyxPQUFPLFdBQVc7QUFBQSxNQUMzRSxTQUFTLENBQUMsRUFBRSxZQUFZLFNBQVMsT0FBTyxRQUFRLEdBQUcsRUFBRSxZQUFZLG9CQUFvQixPQUFPLG1CQUFtQixDQUFDO0FBQUEsSUFDakgsQ0FBQztBQUNELFdBQU8sWUFBWSxZQUFZLE9BQU8sTUFBTSxRQUFRO0FBQ3BELFdBQU8sWUFBWSxZQUFZLE9BQU8sWUFBWSxZQUFZO0FBQzlELFdBQU8sWUFBWSxZQUFZLFFBQVEsQ0FBQyxFQUFFLFlBQVksT0FBTztBQUM3RCxXQUFPLFlBQVksdUJBQXVCLEVBQUUsTUFBTSxLQUFLLFdBQVcsT0FBTyxDQUFDLEdBQUcsSUFBSTtBQUNqRixXQUFPLFlBQVksdUJBQXVCLEVBQUUsVUFBVSxJQUFJLENBQUMsR0FBRyxLQUFLO0FBQUEsRUFDcEUsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFDbEYsVUFBTSxPQUFPLHVCQUF1QixLQUFLLFVBQVU7QUFBQSxNQUNsRCxNQUFNO0FBQUEsTUFDTixPQUFPLEVBQUUsY0FBYyxFQUFFO0FBQUEsSUFDMUIsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxHQUFHLElBQUk7QUFDZCxXQUFPLFlBQVksS0FBSyxTQUFTLElBQUk7QUFDckMsV0FBTyxZQUFZLEtBQUssTUFBTSxDQUFDLEVBQUUsSUFBSSxJQUFJO0FBQUEsRUFDMUMsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
