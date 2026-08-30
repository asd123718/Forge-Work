import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { buildRouterMessages, heuristicScore, isHighConfidenceSessionRoute, parseRouterResponse, ROUTER_FIELD_CLIP_LENGTH } from "../../common/sessionRouter.js";
suite("SessionRouter helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const request = {
    utterance: "fix the flaky voice reconnect test",
    sessions: [
      { sessionId: "s1", label: "voice narration", repo: "meganrogge/momentum-map", status: "idle" },
      { sessionId: "s2", label: "docs cleanup", repo: "microsoft/vscode-docs" }
    ]
  };
  test("buildRouterMessages embeds utterance and every session id", () => {
    const messages = buildRouterMessages(request);
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].role, "system");
    assert.strictEqual(messages[1].role, "user");
    assert.ok(messages[1].content.includes("fix the flaky voice reconnect test"));
    assert.ok(messages[1].content.includes("id=s1"));
    assert.ok(messages[1].content.includes("id=s2"));
    assert.ok(messages[0].content.includes("whether it warrants a new session"));
    assert.ok(messages[0].content.includes("prefer a new session for a distinct task"));
  });
  test("buildRouterMessages embeds enriched conversation content", () => {
    const messages = buildRouterMessages({
      utterance: "ship it",
      sessions: [{
        sessionId: "s1",
        label: "voice narration",
        description: "Adds dictation onboarding",
        firstRequest: "add a voice onboarding dialog",
        lastRequest: "tweak the countdown copy",
        lastResponse: 'Updated the countdown to read "sending in Ns".'
      }]
    });
    const user = messages[1].content;
    assert.ok(user.includes("summary="));
    assert.ok(user.includes("firstRequest="));
    assert.ok(user.includes("lastRequest="));
    assert.ok(user.includes("lastResponse="));
  });
  test("parseRouterResponse extracts, clamps, filters and sorts", () => {
    const raw = '```json\n[{"sessionId":"s2","confidence":0.2},{"sessionId":"s1","confidence":1.7,"reason":"voice"},{"sessionId":"ghost","confidence":0.9}]\n```';
    const result = parseRouterResponse(raw, /* @__PURE__ */ new Set(["s1", "s2"]));
    assert.deepStrictEqual(result, [
      { sessionId: "s1", confidence: 1, reason: "voice" },
      { sessionId: "s2", confidence: 0.2, reason: void 0 }
    ]);
  });
  test("parseRouterResponse returns undefined when nothing usable", () => {
    assert.strictEqual(parseRouterResponse("no json here", /* @__PURE__ */ new Set(["s1"])), void 0);
    assert.strictEqual(parseRouterResponse('[{"sessionId":"unknown","confidence":0.5}]', /* @__PURE__ */ new Set(["s1"])), void 0);
    assert.strictEqual(parseRouterResponse('[{"sessionId":"s1","confidence":"high"}]', /* @__PURE__ */ new Set(["s1"])), void 0);
  });
  test("parseRouterResponse skips malformed confidences in an otherwise valid response", () => {
    assert.deepStrictEqual(
      parseRouterResponse('[{"sessionId":"s1"},{"sessionId":"s2","confidence":0.7}]', /* @__PURE__ */ new Set(["s1", "s2"])),
      [{ sessionId: "s2", confidence: 0.7, reason: void 0 }]
    );
  });
  test("high-confidence routes must exceed 80 percent", () => {
    assert.deepStrictEqual([
      isHighConfidenceSessionRoute({ sessionId: "below", confidence: 0.79 }),
      isHighConfidenceSessionRoute({ sessionId: "boundary", confidence: 0.8 }),
      isHighConfidenceSessionRoute({ sessionId: "above", confidence: 0.81 })
    ], [false, false, true]);
  });
  test("heuristicScore ranks the token-overlapping session first", () => {
    const ranked = heuristicScore(request);
    assert.strictEqual(ranked[0].sessionId, "s1");
    assert.ok(ranked[0].confidence > ranked[1].confidence);
  });
  test("heuristicScore matches on enriched content, not just the label", () => {
    const ranked = heuristicScore({
      utterance: "update the authentication token refresh logic",
      sessions: [
        { sessionId: "s1", label: "session one", lastRequest: "fix the authentication token refresh logic" },
        { sessionId: "s2", label: "session two", lastRequest: "restyle the settings page" }
      ]
    });
    assert.strictEqual(ranked[0].sessionId, "s1");
    assert.ok(ranked[0].confidence > ranked[1].confidence);
  });
  test("heuristicScore ignores generic shared words", () => {
    const ranked = heuristicScore({
      utterance: "work on this with the agent",
      sessions: [{ sessionId: "s1", label: "the agent for this work" }]
    });
    assert.strictEqual(ranked[0].confidence, 0);
  });
  test("buildRouterMessages clips overlong content fields", () => {
    const longResponse = "x ".repeat(400);
    const user = buildRouterMessages({
      utterance: "hi",
      sessions: [{ sessionId: "s1", label: "l", lastResponse: longResponse }]
    })[1].content;
    const match = /lastResponse=("(?:[^"\\]|\\.)*")/.exec(user);
    assert.ok(match, "expected a lastResponse field");
    const value = JSON.parse(match[1]);
    assert.ok(value.length <= ROUTER_FIELD_CLIP_LENGTH + 3, `expected clipped, got length ${value.length}`);
    assert.ok(value.endsWith("..."));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcc2Vzc2lvblJvdXRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBidWlsZFJvdXRlck1lc3NhZ2VzLCBoZXVyaXN0aWNTY29yZSwgaXNIaWdoQ29uZmlkZW5jZVNlc3Npb25Sb3V0ZSwgSVNlc3Npb25Sb3V0ZVJlcXVlc3QsIHBhcnNlUm91dGVyUmVzcG9uc2UsIFJPVVRFUl9GSUVMRF9DTElQX0xFTkdUSCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uUm91dGVyLmpzJztcblxuc3VpdGUoJ1Nlc3Npb25Sb3V0ZXIgaGVscGVycycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCByZXF1ZXN0OiBJU2Vzc2lvblJvdXRlUmVxdWVzdCA9IHtcblx0XHR1dHRlcmFuY2U6ICdmaXggdGhlIGZsYWt5IHZvaWNlIHJlY29ubmVjdCB0ZXN0Jyxcblx0XHRzZXNzaW9uczogW1xuXHRcdFx0eyBzZXNzaW9uSWQ6ICdzMScsIGxhYmVsOiAndm9pY2UgbmFycmF0aW9uJywgcmVwbzogJ21lZ2Fucm9nZ2UvbW9tZW50dW0tbWFwJywgc3RhdHVzOiAnaWRsZScgfSxcblx0XHRcdHsgc2Vzc2lvbklkOiAnczInLCBsYWJlbDogJ2RvY3MgY2xlYW51cCcsIHJlcG86ICdtaWNyb3NvZnQvdnNjb2RlLWRvY3MnIH1cblx0XHRdXG5cdH07XG5cblx0dGVzdCgnYnVpbGRSb3V0ZXJNZXNzYWdlcyBlbWJlZHMgdXR0ZXJhbmNlIGFuZCBldmVyeSBzZXNzaW9uIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzID0gYnVpbGRSb3V0ZXJNZXNzYWdlcyhyZXF1ZXN0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVzc2FnZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVzc2FnZXNbMF0ucm9sZSwgJ3N5c3RlbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXNzYWdlc1sxXS5yb2xlLCAndXNlcicpO1xuXHRcdGFzc2VydC5vayhtZXNzYWdlc1sxXS5jb250ZW50LmluY2x1ZGVzKCdmaXggdGhlIGZsYWt5IHZvaWNlIHJlY29ubmVjdCB0ZXN0JykpO1xuXHRcdGFzc2VydC5vayhtZXNzYWdlc1sxXS5jb250ZW50LmluY2x1ZGVzKCdpZD1zMScpKTtcblx0XHRhc3NlcnQub2sobWVzc2FnZXNbMV0uY29udGVudC5pbmNsdWRlcygnaWQ9czInKSk7XG5cdFx0YXNzZXJ0Lm9rKG1lc3NhZ2VzWzBdLmNvbnRlbnQuaW5jbHVkZXMoJ3doZXRoZXIgaXQgd2FycmFudHMgYSBuZXcgc2Vzc2lvbicpKTtcblx0XHRhc3NlcnQub2sobWVzc2FnZXNbMF0uY29udGVudC5pbmNsdWRlcygncHJlZmVyIGEgbmV3IHNlc3Npb24gZm9yIGEgZGlzdGluY3QgdGFzaycpKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRSb3V0ZXJNZXNzYWdlcyBlbWJlZHMgZW5yaWNoZWQgY29udmVyc2F0aW9uIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBidWlsZFJvdXRlck1lc3NhZ2VzKHtcblx0XHRcdHV0dGVyYW5jZTogJ3NoaXAgaXQnLFxuXHRcdFx0c2Vzc2lvbnM6IFt7XG5cdFx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdFx0bGFiZWw6ICd2b2ljZSBuYXJyYXRpb24nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FkZHMgZGljdGF0aW9uIG9uYm9hcmRpbmcnLFxuXHRcdFx0XHRmaXJzdFJlcXVlc3Q6ICdhZGQgYSB2b2ljZSBvbmJvYXJkaW5nIGRpYWxvZycsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0OiAndHdlYWsgdGhlIGNvdW50ZG93biBjb3B5Jyxcblx0XHRcdFx0bGFzdFJlc3BvbnNlOiAnVXBkYXRlZCB0aGUgY291bnRkb3duIHRvIHJlYWQgXCJzZW5kaW5nIGluIE5zXCIuJ1xuXHRcdFx0fV1cblx0XHR9KTtcblx0XHRjb25zdCB1c2VyID0gbWVzc2FnZXNbMV0uY29udGVudDtcblx0XHRhc3NlcnQub2sodXNlci5pbmNsdWRlcygnc3VtbWFyeT0nKSk7XG5cdFx0YXNzZXJ0Lm9rKHVzZXIuaW5jbHVkZXMoJ2ZpcnN0UmVxdWVzdD0nKSk7XG5cdFx0YXNzZXJ0Lm9rKHVzZXIuaW5jbHVkZXMoJ2xhc3RSZXF1ZXN0PScpKTtcblx0XHRhc3NlcnQub2sodXNlci5pbmNsdWRlcygnbGFzdFJlc3BvbnNlPScpKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VSb3V0ZXJSZXNwb25zZSBleHRyYWN0cywgY2xhbXBzLCBmaWx0ZXJzIGFuZCBzb3J0cycsICgpID0+IHtcblx0XHRjb25zdCByYXcgPSAnYGBganNvblxcblt7XCJzZXNzaW9uSWRcIjpcInMyXCIsXCJjb25maWRlbmNlXCI6MC4yfSx7XCJzZXNzaW9uSWRcIjpcInMxXCIsXCJjb25maWRlbmNlXCI6MS43LFwicmVhc29uXCI6XCJ2b2ljZVwifSx7XCJzZXNzaW9uSWRcIjpcImdob3N0XCIsXCJjb25maWRlbmNlXCI6MC45fV1cXG5gYGAnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlUm91dGVyUmVzcG9uc2UocmF3LCBuZXcgU2V0KFsnczEnLCAnczInXSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHR7IHNlc3Npb25JZDogJ3MxJywgY29uZmlkZW5jZTogMSwgcmVhc29uOiAndm9pY2UnIH0sXG5cdFx0XHR7IHNlc3Npb25JZDogJ3MyJywgY29uZmlkZW5jZTogMC4yLCByZWFzb246IHVuZGVmaW5lZCB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlUm91dGVyUmVzcG9uc2UgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBub3RoaW5nIHVzYWJsZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VSb3V0ZXJSZXNwb25zZSgnbm8ganNvbiBoZXJlJywgbmV3IFNldChbJ3MxJ10pKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VSb3V0ZXJSZXNwb25zZSgnW3tcInNlc3Npb25JZFwiOlwidW5rbm93blwiLFwiY29uZmlkZW5jZVwiOjAuNX1dJywgbmV3IFNldChbJ3MxJ10pKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VSb3V0ZXJSZXNwb25zZSgnW3tcInNlc3Npb25JZFwiOlwiczFcIixcImNvbmZpZGVuY2VcIjpcImhpZ2hcIn1dJywgbmV3IFNldChbJ3MxJ10pKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VSb3V0ZXJSZXNwb25zZSBza2lwcyBtYWxmb3JtZWQgY29uZmlkZW5jZXMgaW4gYW4gb3RoZXJ3aXNlIHZhbGlkIHJlc3BvbnNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwYXJzZVJvdXRlclJlc3BvbnNlKCdbe1wic2Vzc2lvbklkXCI6XCJzMVwifSx7XCJzZXNzaW9uSWRcIjpcInMyXCIsXCJjb25maWRlbmNlXCI6MC43fV0nLCBuZXcgU2V0KFsnczEnLCAnczInXSkpLFxuXHRcdFx0W3sgc2Vzc2lvbklkOiAnczInLCBjb25maWRlbmNlOiAwLjcsIHJlYXNvbjogdW5kZWZpbmVkIH1dLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZ2gtY29uZmlkZW5jZSByb3V0ZXMgbXVzdCBleGNlZWQgODAgcGVyY2VudCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGlzSGlnaENvbmZpZGVuY2VTZXNzaW9uUm91dGUoeyBzZXNzaW9uSWQ6ICdiZWxvdycsIGNvbmZpZGVuY2U6IDAuNzkgfSksXG5cdFx0XHRpc0hpZ2hDb25maWRlbmNlU2Vzc2lvblJvdXRlKHsgc2Vzc2lvbklkOiAnYm91bmRhcnknLCBjb25maWRlbmNlOiAwLjggfSksXG5cdFx0XHRpc0hpZ2hDb25maWRlbmNlU2Vzc2lvblJvdXRlKHsgc2Vzc2lvbklkOiAnYWJvdmUnLCBjb25maWRlbmNlOiAwLjgxIH0pLFxuXHRcdF0sIFtmYWxzZSwgZmFsc2UsIHRydWVdKTtcblx0fSk7XG5cblx0dGVzdCgnaGV1cmlzdGljU2NvcmUgcmFua3MgdGhlIHRva2VuLW92ZXJsYXBwaW5nIHNlc3Npb24gZmlyc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFua2VkID0gaGV1cmlzdGljU2NvcmUocmVxdWVzdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmtlZFswXS5zZXNzaW9uSWQsICdzMScpO1xuXHRcdGFzc2VydC5vayhyYW5rZWRbMF0uY29uZmlkZW5jZSA+IHJhbmtlZFsxXS5jb25maWRlbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnaGV1cmlzdGljU2NvcmUgbWF0Y2hlcyBvbiBlbnJpY2hlZCBjb250ZW50LCBub3QganVzdCB0aGUgbGFiZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFua2VkID0gaGV1cmlzdGljU2NvcmUoe1xuXHRcdFx0dXR0ZXJhbmNlOiAndXBkYXRlIHRoZSBhdXRoZW50aWNhdGlvbiB0b2tlbiByZWZyZXNoIGxvZ2ljJyxcblx0XHRcdHNlc3Npb25zOiBbXG5cdFx0XHRcdHsgc2Vzc2lvbklkOiAnczEnLCBsYWJlbDogJ3Nlc3Npb24gb25lJywgbGFzdFJlcXVlc3Q6ICdmaXggdGhlIGF1dGhlbnRpY2F0aW9uIHRva2VuIHJlZnJlc2ggbG9naWMnIH0sXG5cdFx0XHRcdHsgc2Vzc2lvbklkOiAnczInLCBsYWJlbDogJ3Nlc3Npb24gdHdvJywgbGFzdFJlcXVlc3Q6ICdyZXN0eWxlIHRoZSBzZXR0aW5ncyBwYWdlJyB9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmtlZFswXS5zZXNzaW9uSWQsICdzMScpO1xuXHRcdGFzc2VydC5vayhyYW5rZWRbMF0uY29uZmlkZW5jZSA+IHJhbmtlZFsxXS5jb25maWRlbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnaGV1cmlzdGljU2NvcmUgaWdub3JlcyBnZW5lcmljIHNoYXJlZCB3b3JkcycsICgpID0+IHtcblx0XHRjb25zdCByYW5rZWQgPSBoZXVyaXN0aWNTY29yZSh7XG5cdFx0XHR1dHRlcmFuY2U6ICd3b3JrIG9uIHRoaXMgd2l0aCB0aGUgYWdlbnQnLFxuXHRcdFx0c2Vzc2lvbnM6IFt7IHNlc3Npb25JZDogJ3MxJywgbGFiZWw6ICd0aGUgYWdlbnQgZm9yIHRoaXMgd29yaycgfV1cblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFua2VkWzBdLmNvbmZpZGVuY2UsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZFJvdXRlck1lc3NhZ2VzIGNsaXBzIG92ZXJsb25nIGNvbnRlbnQgZmllbGRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvbmdSZXNwb25zZSA9ICd4ICcucmVwZWF0KDQwMCk7XG5cdFx0Y29uc3QgdXNlciA9IGJ1aWxkUm91dGVyTWVzc2FnZXMoe1xuXHRcdFx0dXR0ZXJhbmNlOiAnaGknLFxuXHRcdFx0c2Vzc2lvbnM6IFt7IHNlc3Npb25JZDogJ3MxJywgbGFiZWw6ICdsJywgbGFzdFJlc3BvbnNlOiBsb25nUmVzcG9uc2UgfV1cblx0XHR9KVsxXS5jb250ZW50O1xuXHRcdGNvbnN0IG1hdGNoID0gL2xhc3RSZXNwb25zZT0oXCIoPzpbXlwiXFxcXF18XFxcXC4pKlwiKS8uZXhlYyh1c2VyKTtcblx0XHRhc3NlcnQub2sobWF0Y2gsICdleHBlY3RlZCBhIGxhc3RSZXNwb25zZSBmaWVsZCcpO1xuXHRcdGNvbnN0IHZhbHVlOiBzdHJpbmcgPSBKU09OLnBhcnNlKG1hdGNoIVsxXSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmxlbmd0aCA8PSBST1VURVJfRklFTERfQ0xJUF9MRU5HVEggKyAzLCBgZXhwZWN0ZWQgY2xpcHBlZCwgZ290IGxlbmd0aCAke3ZhbHVlLmxlbmd0aH1gKTtcblx0XHRhc3NlcnQub2sodmFsdWUuZW5kc1dpdGgoJy4uLicpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFCQUFxQixnQkFBZ0IsOEJBQW9ELHFCQUFxQixnQ0FBZ0M7QUFFdkosTUFBTSx5QkFBeUIsTUFBTTtBQUVwQywwQ0FBd0M7QUFFeEMsUUFBTSxVQUFnQztBQUFBLElBQ3JDLFdBQVc7QUFBQSxJQUNYLFVBQVU7QUFBQSxNQUNULEVBQUUsV0FBVyxNQUFNLE9BQU8sbUJBQW1CLE1BQU0sMkJBQTJCLFFBQVEsT0FBTztBQUFBLE1BQzdGLEVBQUUsV0FBVyxNQUFNLE9BQU8sZ0JBQWdCLE1BQU0sd0JBQXdCO0FBQUEsSUFDekU7QUFBQSxFQUNEO0FBRUEsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFN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
