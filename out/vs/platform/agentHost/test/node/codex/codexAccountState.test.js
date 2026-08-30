import * as assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { codexAccountRateLimitFromResponse, codexAccountStateFromResponse } from "../../../node/codex/codexAccountState.js";
suite("CodexAccountState", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps ChatGPT identities as human accounts", () => {
    assert.deepStrictEqual(
      codexAccountStateFromResponse({ account: { type: "chatgpt", email: "private@example.com", planType: "plus" }, requiresOpenaiAuth: true }),
      { usageSource: "openai", status: "signedIn", authType: "chatgpt", email: "private@example.com", planType: "plus", requiresOpenaiAuth: true }
    );
    assert.deepStrictEqual(
      codexAccountStateFromResponse({ account: { type: "chatgpt", email: null, planType: "team" }, requiresOpenaiAuth: true }),
      { usageSource: "openai", status: "signedIn", authType: "chatgpt", email: void 0, planType: "team", requiresOpenaiAuth: true }
    );
  });
  test("distinguishes required sign-in from providers without OpenAI auth", () => {
    assert.deepStrictEqual(
      codexAccountStateFromResponse({ account: null, requiresOpenaiAuth: true }),
      { usageSource: "openai", status: "signedOut", requiresOpenaiAuth: true }
    );
    assert.deepStrictEqual(
      codexAccountStateFromResponse({ account: null, requiresOpenaiAuth: false }),
      { usageSource: "openai", status: "unavailable", requiresOpenaiAuth: false }
    );
  });
  test("does not classify API key or Bedrock credentials as human accounts", () => {
    assert.deepStrictEqual(
      codexAccountStateFromResponse({ account: { type: "apiKey" }, requiresOpenaiAuth: true }),
      { usageSource: "openai", status: "unavailable", authType: "apiKey", requiresOpenaiAuth: true }
    );
    assert.deepStrictEqual(
      codexAccountStateFromResponse({ account: { type: "amazonBedrock", usesCodexManagedCredentials: true }, requiresOpenaiAuth: false }),
      { usageSource: "openai", status: "unavailable", authType: "other", requiresOpenaiAuth: false }
    );
  });
  test("prefers the Codex weekly rate-limit window", () => {
    assert.deepStrictEqual(codexAccountRateLimitFromResponse({
      rateLimits: {
        limitId: null,
        limitName: null,
        primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 100 },
        secondary: null,
        credits: null,
        individualLimit: null,
        spendControlReached: null,
        planType: null,
        rateLimitReachedType: null
      },
      rateLimitsByLimitId: {
        codex: {
          limitId: "codex",
          limitName: "Codex",
          primary: { usedPercent: 21, windowDurationMins: 300, resetsAt: 200 },
          secondary: { usedPercent: 42.4, windowDurationMins: 7 * 24 * 60, resetsAt: 300 },
          credits: null,
          individualLimit: null,
          spendControlReached: null,
          planType: null,
          rateLimitReachedType: null
        }
      },
      rateLimitResetCredits: null
    }), {
      usedPercent: 42.4,
      windowDurationMins: 7 * 24 * 60,
      resetsAt: 300
    });
  });
  test("falls back to available rate-limit data and clamps percentages", () => {
    assert.deepStrictEqual(codexAccountRateLimitFromResponse({
      rateLimits: {
        limitId: null,
        limitName: null,
        primary: { usedPercent: 125, windowDurationMins: null, resetsAt: null },
        secondary: null,
        credits: null,
        individualLimit: null,
        spendControlReached: null,
        planType: null,
        rateLimitReachedType: null
      },
      rateLimitsByLimitId: null,
      rateLimitResetCredits: null
    }), { usedPercent: 100, windowDurationMins: void 0, resetsAt: void 0 });
  });
  test("falls back when the Codex bucket has no windows", () => {
    assert.deepStrictEqual(codexAccountRateLimitFromResponse({
      rateLimits: {
        limitId: null,
        limitName: null,
        primary: { usedPercent: 30, windowDurationMins: 10080, resetsAt: 400 },
        secondary: null,
        credits: null,
        individualLimit: null,
        spendControlReached: null,
        planType: null,
        rateLimitReachedType: null
      },
      rateLimitsByLimitId: {
        codex: {
          limitId: "codex",
          limitName: "Codex",
          primary: null,
          secondary: null,
          credits: null,
          individualLimit: null,
          spendControlReached: null,
          planType: null,
          rateLimitReachedType: null
        }
      },
      rateLimitResetCredits: null
    }), { usedPercent: 30, windowDurationMins: 10080, resetsAt: 400 });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhBY2NvdW50U3RhdGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjb2RleEFjY291bnRSYXRlTGltaXRGcm9tUmVzcG9uc2UsIGNvZGV4QWNjb3VudFN0YXRlRnJvbVJlc3BvbnNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEFjY291bnRTdGF0ZS5qcyc7XG5cbnN1aXRlKCdDb2RleEFjY291bnRTdGF0ZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWFwcyBDaGF0R1BUIGlkZW50aXRpZXMgYXMgaHVtYW4gYWNjb3VudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvZGV4QWNjb3VudFN0YXRlRnJvbVJlc3BvbnNlKHsgYWNjb3VudDogeyB0eXBlOiAnY2hhdGdwdCcsIGVtYWlsOiAncHJpdmF0ZUBleGFtcGxlLmNvbScsIHBsYW5UeXBlOiAncGx1cycgfSwgcmVxdWlyZXNPcGVuYWlBdXRoOiB0cnVlIH0pLFxuXHRcdFx0eyB1c2FnZVNvdXJjZTogJ29wZW5haScsIHN0YXR1czogJ3NpZ25lZEluJywgYXV0aFR5cGU6ICdjaGF0Z3B0JywgZW1haWw6ICdwcml2YXRlQGV4YW1wbGUuY29tJywgcGxhblR5cGU6ICdwbHVzJywgcmVxdWlyZXNPcGVuYWlBdXRoOiB0cnVlIH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Y29kZXhBY2NvdW50U3RhdGVGcm9tUmVzcG9uc2UoeyBhY2NvdW50OiB7IHR5cGU6ICdjaGF0Z3B0JywgZW1haWw6IG51bGwsIHBsYW5UeXBlOiAndGVhbScgfSwgcmVxdWlyZXNPcGVuYWlBdXRoOiB0cnVlIH0pLFxuXHRcdFx0eyB1c2FnZVNvdXJjZTogJ29wZW5haScsIHN0YXR1czogJ3NpZ25lZEluJywgYXV0aFR5cGU6ICdjaGF0Z3B0JywgZW1haWw6IHVuZGVmaW5lZCwgcGxhblR5cGU6ICd0ZWFtJywgcmVxdWlyZXNPcGVuYWlBdXRoOiB0cnVlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzdGluZ3Vpc2hlcyByZXF1aXJlZCBzaWduLWluIGZyb20gcHJvdmlkZXJzIHdpdGhvdXQgT3BlbkFJIGF1dGgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvZGV4QWNjb3VudFN0YXRlRnJvbVJlc3BvbnNlKHsgYWNjb3VudDogbnVsbCwgcmVxdWlyZXNPcGVuYWlBdXRoOiB0cnVlIH0pLFxuXHRcdFx0eyB1c2FnZVNvdXJjZTogJ29wZW5haScsIHN0YXR1czogJ3NpZ25lZE91dCcsIHJlcXVpcmVzT3BlbmFpQXV0aDogdHJ1ZSB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvZGV4QWNjb3VudFN0YXRlRnJvbVJlc3BvbnNlKHsgYWNjb3VudDogbnVsbCwgcmVxdWlyZXNPcGVuYWlBdXRoOiBmYWxzZSB9KSxcblx0XHRcdHsgdXNhZ2VTb3VyY2U6ICdvcGVuYWknLCBzdGF0dXM6ICd1bmF2YWlsYWJsZScsIHJlcXVpcmVzT3BlbmFpQXV0aDogZmFsc2UgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjbGFzc2lmeSBBUEkga2V5IG9yIEJlZHJvY2sgY3JlZGVudGlhbHMgYXMgaHVtYW4gYWNjb3VudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvZGV4QWNjb3VudFN0YXRlRnJvbVJlc3BvbnNlKHsgYWNjb3VudDogeyB0eXBlOiAnYXBpS2V5JyB9LCByZXF1aXJlc09wZW5haUF1dGg6IHRydWUgfSksXG5cdFx0XHR7IHVzYWdlU291cmNlOiAnb3BlbmFpJywgc3RhdHVzOiAndW5hdmFpbGFibGUnLCBhdXRoVHlwZTogJ2FwaUtleScsIHJlcXVpcmVzT3BlbmFpQXV0aDogdHJ1ZSB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvZGV4QWNjb3VudFN0YXRlRnJvbVJlc3BvbnNlKHsgYWNjb3VudDogeyB0eXBlOiAnYW1hem9uQmVkcm9jaycsIHVzZXNDb2RleE1hbmFnZWRDcmVkZW50aWFsczogdHJ1ZSB9LCByZXF1aXJlc09wZW5haUF1dGg6IGZhbHNlIH0pLFxuXHRcdFx0eyB1c2FnZVNvdXJjZTogJ29wZW5haScsIHN0YXR1czogJ3VuYXZhaWxhYmxlJywgYXV0aFR5cGU6ICdvdGhlcicsIHJlcXVpcmVzT3BlbmFpQXV0aDogZmFsc2UgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmZXJzIHRoZSBDb2RleCB3ZWVrbHkgcmF0ZS1saW1pdCB3aW5kb3cnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleEFjY291bnRSYXRlTGltaXRGcm9tUmVzcG9uc2Uoe1xuXHRcdFx0cmF0ZUxpbWl0czoge1xuXHRcdFx0XHRsaW1pdElkOiBudWxsLFxuXHRcdFx0XHRsaW1pdE5hbWU6IG51bGwsXG5cdFx0XHRcdHByaW1hcnk6IHsgdXNlZFBlcmNlbnQ6IDEyLCB3aW5kb3dEdXJhdGlvbk1pbnM6IDMwMCwgcmVzZXRzQXQ6IDEwMCB9LFxuXHRcdFx0XHRzZWNvbmRhcnk6IG51bGwsXG5cdFx0XHRcdGNyZWRpdHM6IG51bGwsXG5cdFx0XHRcdGluZGl2aWR1YWxMaW1pdDogbnVsbCxcblx0XHRcdFx0c3BlbmRDb250cm9sUmVhY2hlZDogbnVsbCxcblx0XHRcdFx0cGxhblR5cGU6IG51bGwsXG5cdFx0XHRcdHJhdGVMaW1pdFJlYWNoZWRUeXBlOiBudWxsLFxuXHRcdFx0fSxcblx0XHRcdHJhdGVMaW1pdHNCeUxpbWl0SWQ6IHtcblx0XHRcdFx0Y29kZXg6IHtcblx0XHRcdFx0XHRsaW1pdElkOiAnY29kZXgnLFxuXHRcdFx0XHRcdGxpbWl0TmFtZTogJ0NvZGV4Jyxcblx0XHRcdFx0XHRwcmltYXJ5OiB7IHVzZWRQZXJjZW50OiAyMSwgd2luZG93RHVyYXRpb25NaW5zOiAzMDAsIHJlc2V0c0F0OiAyMDAgfSxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IHsgdXNlZFBlcmNlbnQ6IDQyLjQsIHdpbmRvd0R1cmF0aW9uTWluczogNyAqIDI0ICogNjAsIHJlc2V0c0F0OiAzMDAgfSxcblx0XHRcdFx0XHRjcmVkaXRzOiBudWxsLFxuXHRcdFx0XHRcdGluZGl2aWR1YWxMaW1pdDogbnVsbCxcblx0XHRcdFx0XHRzcGVuZENvbnRyb2xSZWFjaGVkOiBudWxsLFxuXHRcdFx0XHRcdHBsYW5UeXBlOiBudWxsLFxuXHRcdFx0XHRcdHJhdGVMaW1pdFJlYWNoZWRUeXBlOiBudWxsLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHJhdGVMaW1pdFJlc2V0Q3JlZGl0czogbnVsbCxcblx0XHR9KSwge1xuXHRcdFx0dXNlZFBlcmNlbnQ6IDQyLjQsXG5cdFx0XHR3aW5kb3dEdXJhdGlvbk1pbnM6IDcgKiAyNCAqIDYwLFxuXHRcdFx0cmVzZXRzQXQ6IDMwMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBhdmFpbGFibGUgcmF0ZS1saW1pdCBkYXRhIGFuZCBjbGFtcHMgcGVyY2VudGFnZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleEFjY291bnRSYXRlTGltaXRGcm9tUmVzcG9uc2Uoe1xuXHRcdFx0cmF0ZUxpbWl0czoge1xuXHRcdFx0XHRsaW1pdElkOiBudWxsLFxuXHRcdFx0XHRsaW1pdE5hbWU6IG51bGwsXG5cdFx0XHRcdHByaW1hcnk6IHsgdXNlZFBlcmNlbnQ6IDEyNSwgd2luZG93RHVyYXRpb25NaW5zOiBudWxsLCByZXNldHNBdDogbnVsbCB9LFxuXHRcdFx0XHRzZWNvbmRhcnk6IG51bGwsXG5cdFx0XHRcdGNyZWRpdHM6IG51bGwsXG5cdFx0XHRcdGluZGl2aWR1YWxMaW1pdDogbnVsbCxcblx0XHRcdFx0c3BlbmRDb250cm9sUmVhY2hlZDogbnVsbCxcblx0XHRcdFx0cGxhblR5cGU6IG51bGwsXG5cdFx0XHRcdHJhdGVMaW1pdFJlYWNoZWRUeXBlOiBudWxsLFxuXHRcdFx0fSxcblx0XHRcdHJhdGVMaW1pdHNCeUxpbWl0SWQ6IG51bGwsXG5cdFx0XHRyYXRlTGltaXRSZXNldENyZWRpdHM6IG51bGwsXG5cdFx0fSksIHsgdXNlZFBlcmNlbnQ6IDEwMCwgd2luZG93RHVyYXRpb25NaW5zOiB1bmRlZmluZWQsIHJlc2V0c0F0OiB1bmRlZmluZWQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgd2hlbiB0aGUgQ29kZXggYnVja2V0IGhhcyBubyB3aW5kb3dzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29kZXhBY2NvdW50UmF0ZUxpbWl0RnJvbVJlc3BvbnNlKHtcblx0XHRcdHJhdGVMaW1pdHM6IHtcblx0XHRcdFx0bGltaXRJZDogbnVsbCxcblx0XHRcdFx0bGltaXROYW1lOiBudWxsLFxuXHRcdFx0XHRwcmltYXJ5OiB7IHVzZWRQZXJjZW50OiAzMCwgd2luZG93RHVyYXRpb25NaW5zOiAxMDA4MCwgcmVzZXRzQXQ6IDQwMCB9LFxuXHRcdFx0XHRzZWNvbmRhcnk6IG51bGwsXG5cdFx0XHRcdGNyZWRpdHM6IG51bGwsXG5cdFx0XHRcdGluZGl2aWR1YWxMaW1pdDogbnVsbCxcblx0XHRcdFx0c3BlbmRDb250cm9sUmVhY2hlZDogbnVsbCxcblx0XHRcdFx0cGxhblR5cGU6IG51bGwsXG5cdFx0XHRcdHJhdGVMaW1pdFJlYWNoZWRUeXBlOiBudWxsLFxuXHRcdFx0fSxcblx0XHRcdHJhdGVMaW1pdHNCeUxpbWl0SWQ6IHtcblx0XHRcdFx0Y29kZXg6IHtcblx0XHRcdFx0XHRsaW1pdElkOiAnY29kZXgnLFxuXHRcdFx0XHRcdGxpbWl0TmFtZTogJ0NvZGV4Jyxcblx0XHRcdFx0XHRwcmltYXJ5OiBudWxsLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogbnVsbCxcblx0XHRcdFx0XHRjcmVkaXRzOiBudWxsLFxuXHRcdFx0XHRcdGluZGl2aWR1YWxMaW1pdDogbnVsbCxcblx0XHRcdFx0XHRzcGVuZENvbnRyb2xSZWFjaGVkOiBudWxsLFxuXHRcdFx0XHRcdHBsYW5UeXBlOiBudWxsLFxuXHRcdFx0XHRcdHJhdGVMaW1pdFJlYWNoZWRUeXBlOiBudWxsLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHJhdGVMaW1pdFJlc2V0Q3JlZGl0czogbnVsbCxcblx0XHR9KSwgeyB1c2VkUGVyY2VudDogMzAsIHdpbmRvd0R1cmF0aW9uTWluczogMTAwODAsIHJlc2V0c0F0OiA0MDAgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZ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
