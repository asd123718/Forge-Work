import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import {
  ChatFetchResponseType,
  FilterReason,
  getChatErrorDetailsFromFetchError,
  getChatErrorDetailsFromMeta,
  getCopilotPlanFromEntitlement,
  getQuotaMessageForPlan
} from "../../common/chatErrorMessages.js";
import { ChatEntitlement } from "../../../../services/chat/common/chatEntitlementService.js";
import { ChatErrorLevel } from "../../common/chatService/chatService.js";
function errorInfo(meta) {
  return { errorType: "e", message: "m", _meta: meta };
}
suite("ChatErrorMessages", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getChatErrorDetailsFromMeta", () => {
    test("returns undefined when no meta or no chatError", () => {
      assert.strictEqual(getChatErrorDetailsFromMeta(void 0), void 0);
      assert.strictEqual(getChatErrorDetailsFromMeta(errorInfo(void 0)), void 0);
      assert.strictEqual(getChatErrorDetailsFromMeta(errorInfo({ chatError: {} })), void 0);
      assert.strictEqual(getChatErrorDetailsFromMeta(errorInfo({ chatError: { fetchError: {} } })), void 0);
    });
    test("formats a forwarded rate-limit error", () => {
      const details = getChatErrorDetailsFromMeta(errorInfo({
        chatError: {
          fetchError: {
            type: ChatFetchResponseType.RateLimited,
            retryAfter: 60,
            capiError: { code: "user_global_rate_limited", message: "slow down" }
          },
          copilotPlan: "free"
        }
      }));
      assert.deepStrictEqual(details, {
        code: ChatFetchResponseType.RateLimited,
        message: "You've hit your session rate limit. Please upgrade your plan or wait 60 seconds for your limit to reset. [Learn More](https://aka.ms/github-copilot-rate-limit-error)",
        level: ChatErrorLevel.Info,
        isRateLimited: true
      });
    });
    test("context overrides the forwarded plan (free user)", () => {
      const details = getChatErrorDetailsFromMeta(errorInfo({
        chatError: {
          fetchError: { type: ChatFetchResponseType.QuotaExceeded, capiError: { code: "quota_exceeded" } },
          copilotPlan: "business"
        }
      }), { copilotPlan: "free" });
      assert.strictEqual(details?.message, "You've reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.");
    });
    test("accepts the payload shape and every type the node layer emits", () => {
      const nodeTypes = ["quotaExceeded", "rateLimited", "canceled", "badRequest", "agent_unauthorized", "notFound", "failed", "length"];
      const resolved = nodeTypes.map((type) => getChatErrorDetailsFromMeta(errorInfo({
        chatError: {
          fetchError: {
            type,
            reason: "upstream reason",
            requestId: "req-1",
            serverRequestId: "gh-1",
            capiError: { code: "some_code", message: "some message" }
          },
          copilotPlan: "free",
          isUsageBasedBilling: false
        }
      }))?.code);
      assert.deepStrictEqual(resolved, ["some_code", "rateLimited", "canceled", "badRequest", "agent_unauthorized", "notFound", "failed", "length"]);
    });
  });
  suite("getChatErrorDetailsFromFetchError", () => {
    test("off topic", () => {
      const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.OffTopic }, void 0);
      assert.deepStrictEqual(details, {
        code: ChatFetchResponseType.OffTopic,
        message: "Sorry, but I can only assist with programming related questions."
      });
    });
    test("failed with and without server request id", () => {
      const withServer = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Failed, requestId: "rid", serverRequestId: "gh", reason: "boom" }, void 0);
      assert.deepStrictEqual(withServer, {
        code: ChatFetchResponseType.Failed,
        message: "Sorry, your request failed. Please try again.\n\nClient Request Id: rid\n\nGH Request Id: gh\n\nReason: boom"
      });
      const withoutServer = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Failed, requestId: "rid", reason: "boom" }, void 0);
      assert.deepStrictEqual(withoutServer, {
        code: ChatFetchResponseType.Failed,
        message: "Sorry, your request failed. Please try again.\n\nClient Request Id: rid\n\nReason: boom"
      });
    });
    test("quota exceeded uses plan-specific message and quota code", () => {
      const fetchError = {
        type: ChatFetchResponseType.QuotaExceeded,
        capiError: { code: "quota_exceeded" }
      };
      const details = getChatErrorDetailsFromFetchError(fetchError, "free");
      assert.deepStrictEqual(details, {
        code: "quota_exceeded",
        message: "You've reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew.",
        isQuotaExceeded: true
      });
    });
    test("filtered response is marked filtered", () => {
      const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.Filtered, category: FilterReason.Copyright }, void 0);
      assert.deepStrictEqual(details, {
        code: ChatFetchResponseType.Filtered,
        message: "Sorry, the response matched public code so it was blocked. Please rephrase your prompt. [Learn more](https://aka.ms/copilot-chat-filtered-docs).",
        responseIsFiltered: true,
        level: ChatErrorLevel.Info
      });
    });
    test("simple error types produce their static messages", () => {
      const types = [
        ChatFetchResponseType.Canceled,
        ChatFetchResponseType.Length,
        ChatFetchResponseType.NotFound,
        ChatFetchResponseType.Unknown,
        ChatFetchResponseType.ExtensionBlocked,
        ChatFetchResponseType.AgentUnauthorized,
        ChatFetchResponseType.InvalidStatefulMarker
      ];
      const actual = types.map((type) => getChatErrorDetailsFromFetchError({ type }, void 0));
      assert.deepStrictEqual(actual, [
        { code: ChatFetchResponseType.Canceled, message: "Canceled" },
        { code: ChatFetchResponseType.Length, message: "Sorry, the response hit the length limit. Please rephrase your prompt." },
        { code: ChatFetchResponseType.NotFound, message: "Sorry, the resource was not found." },
        { code: ChatFetchResponseType.Unknown, message: "Sorry, no response was returned." },
        { code: ChatFetchResponseType.ExtensionBlocked, message: "Sorry, something went wrong." },
        { code: ChatFetchResponseType.AgentUnauthorized, message: "Sorry, something went wrong." },
        { code: ChatFetchResponseType.InvalidStatefulMarker, message: "Your chat session state is invalid, please start a new chat." }
      ]);
    });
    test("network error includes request id and reason", () => {
      const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.NetworkError, requestId: "rid", reason: "offline" }, void 0);
      assert.deepStrictEqual(details, {
        code: ChatFetchResponseType.NetworkError,
        message: "Sorry, there was a network error. Please try again later. Request id: rid\n\nReason: offline"
      });
    });
    test("agent failed dependency surfaces the raw reason", () => {
      const details = getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.AgentFailedDependency, reason: "timed out" }, void 0);
      assert.deepStrictEqual(details, { code: ChatFetchResponseType.AgentFailedDependency, message: "timed out" });
    });
    test("rate-limit messages vary by capi code and auto flag", () => {
      const messages = [
        getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.RateLimited, retryAfter: 30, capiError: { code: "agent_mode_limit_exceeded" } }, void 0).message,
        getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.RateLimited, retryAfter: 30, isAuto: true, capiError: { code: "model_overloaded" } }, void 0).message,
        getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.RateLimited, retryAfter: 30, capiError: { code: "integration_rate_limited" } }, void 0).message,
        getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.RateLimited, retryAfter: 30 }, void 0).message
      ];
      assert.deepStrictEqual(messages, [
        "Sorry, you have exceeded the agent mode rate limit. Please switch to ask mode and try again in 30 seconds. [Learn More](https://aka.ms/github-copilot-rate-limit-error)",
        "Sorry, the upstream model provider is currently experiencing high demand. Please try again in 30 seconds. [Learn More](https://aka.ms/github-copilot-rate-limit-error)",
        "Sorry, GitHub Copilot Chat is currently experiencing high demand. Please try again in 30 seconds. [Learn More](https://aka.ms/github-copilot-rate-limit-error)",
        "Sorry, your request was rate-limited. Please wait 30 seconds before trying again or consider switching to Auto. [Learn More](https://aka.ms/github-copilot-rate-limit-error)"
      ]);
    });
    test("quota sub-codes map to specific messages", () => {
      const messages = [
        getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.QuotaExceeded, capiError: { code: "overage_limit_reached" } }, void 0).message,
        getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.QuotaExceeded, capiError: { code: "additional_spend_limit_reached" } }, void 0).message,
        getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.QuotaExceeded, capiError: { code: "billing_not_configured", message: "set up billing" } }, void 0).message,
        getChatErrorDetailsFromFetchError({ type: ChatFetchResponseType.QuotaExceeded }, void 0).message
      ];
      assert.deepStrictEqual(messages, [
        "You cannot accrue additional premium requests at this time. Please contact [GitHub Support](https://support.github.com/contact) to continue using Copilot.",
        "You've reached your additional usage limit for your plan. Upgrade your plan to keep going.",
        "set up billing",
        "Quota Exceeded"
      ]);
    });
  });
  suite("getQuotaMessageForPlan", () => {
    test("usage-based billing business plan with reset date", () => {
      const message = getQuotaMessageForPlan("business", true, "2030-01-15T00:00:00.000Z");
      assert.ok(message.startsWith("You've reached your credit limit. To continue working, please contact your organization's Copilot admin or wait until your credits reset on"));
    });
    test("default plan, no usage-based billing", () => {
      assert.strictEqual(
        getQuotaMessageForPlan(void 0),
        "You've exhausted your premium model quota. For additional paid premium requests, please reach out to your organization's Copilot admin or wait for your allowance to renew."
      );
    });
    test("edu plan with usage-based billing", () => {
      assert.deepStrictEqual(
        [getQuotaMessageForPlan("edu", true, "2030-01-15T00:00:00.000Z"), getQuotaMessageForPlan("edu", true)],
        [
          `You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro, or wait until your credits reset on ${(/* @__PURE__ */ new Date("2030-01-15T00:00:00.000Z")).toLocaleString(void 0, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}.`,
          "You've reached your monthly credit limit. Please enable additional paid credits, upgrade to Copilot Pro, or wait for your credits to reset."
        ]
      );
    });
    test("edu plan without usage-based billing", () => {
      assert.strictEqual(
        getQuotaMessageForPlan("edu"),
        "You've exhausted your premium model quota. Please enable additional paid premium requests, upgrade to Copilot Pro, or wait for your allowance to renew."
      );
    });
  });
  suite("getCopilotPlanFromEntitlement", () => {
    test("maps entitlements to Copilot plan strings", () => {
      const actual = [
        ChatEntitlement.Free,
        ChatEntitlement.Pro,
        ChatEntitlement.ProPlus,
        ChatEntitlement.Max,
        ChatEntitlement.Business,
        ChatEntitlement.Enterprise,
        ChatEntitlement.EDU,
        ChatEntitlement.Unknown
      ].map(getCopilotPlanFromEntitlement);
      assert.deepStrictEqual(actual, ["free", "individual", "individual_pro", "individual_max", "business", "enterprise", "edu", void 0]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY2hhdEVycm9yTWVzc2FnZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0Q2hhdEZldGNoUmVzcG9uc2VUeXBlLFxuXHRGaWx0ZXJSZWFzb24sXG5cdGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcixcblx0Z2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21NZXRhLFxuXHRnZXRDb3BpbG90UGxhbkZyb21FbnRpdGxlbWVudCxcblx0Z2V0UXVvdGFNZXNzYWdlRm9yUGxhbixcblx0SUNoYXRGZXRjaEVycm9yUGF5bG9hZCxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRFcnJvck1lc3NhZ2VzLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVycm9yTGV2ZWwgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBFcnJvckluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcblxuLyoqIFdyYXBzIGEgYF9tZXRhYCBiYWcgaW4gYSBtaW5pbWFsIHtAbGluayBFcnJvckluZm99IHNvIHRoZSByZWFkZXIgc2VlcyB0aGUgcmlnaHQgc291cmNlIHR5cGUuICovXG5mdW5jdGlvbiBlcnJvckluZm8obWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBFcnJvckluZm8ge1xuXHRyZXR1cm4geyBlcnJvclR5cGU6ICdlJywgbWVzc2FnZTogJ20nLCBfbWV0YTogbWV0YSB9O1xufVxuXG5zdWl0ZSgnQ2hhdEVycm9yTWVzc2FnZXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldENoYXRFcnJvckRldGFpbHNGcm9tTWV0YScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gbWV0YSBvciBubyBjaGF0RXJyb3InLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21NZXRhKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21NZXRhKGVycm9ySW5mbyh1bmRlZmluZWQpKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbU1ldGEoZXJyb3JJbmZvKHsgY2hhdEVycm9yOiB7fSB9KSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21NZXRhKGVycm9ySW5mbyh7IGNoYXRFcnJvcjogeyBmZXRjaEVycm9yOiB7fSB9IH0pKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zvcm1hdHMgYSBmb3J3YXJkZWQgcmF0ZS1saW1pdCBlcnJvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbU1ldGEoZXJyb3JJbmZvKHtcblx0XHRcdFx0Y2hhdEVycm9yOiB7XG5cdFx0XHRcdFx0ZmV0Y2hFcnJvcjoge1xuXHRcdFx0XHRcdFx0dHlwZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLlJhdGVMaW1pdGVkLFxuXHRcdFx0XHRcdFx0cmV0cnlBZnRlcjogNjAsXG5cdFx0XHRcdFx0XHRjYXBpRXJyb3I6IHsgY29kZTogJ3VzZXJfZ2xvYmFsX3JhdGVfbGltaXRlZCcsIG1lc3NhZ2U6ICdzbG93IGRvd24nIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjb3BpbG90UGxhbjogJ2ZyZWUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXRhaWxzLCB7XG5cdFx0XHRcdGNvZGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5SYXRlTGltaXRlZCxcblx0XHRcdFx0bWVzc2FnZTogJ1lvdVxcJ3ZlIGhpdCB5b3VyIHNlc3Npb24gcmF0ZSBsaW1pdC4gUGxlYXNlIHVwZ3JhZGUgeW91ciBwbGFuIG9yIHdhaXQgNjAgc2Vjb25kcyBmb3IgeW91ciBsaW1pdCB0byByZXNldC4gW0xlYXJuIE1vcmVdKGh0dHBzOi8vYWthLm1zL2dpdGh1Yi1jb3BpbG90LXJhdGUtbGltaXQtZXJyb3IpJyxcblx0XHRcdFx0bGV2ZWw6IENoYXRFcnJvckxldmVsLkluZm8sXG5cdFx0XHRcdGlzUmF0ZUxpbWl0ZWQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnRleHQgb3ZlcnJpZGVzIHRoZSBmb3J3YXJkZWQgcGxhbiAoZnJlZSB1c2VyKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbU1ldGEoZXJyb3JJbmZvKHtcblx0XHRcdFx0Y2hhdEVycm9yOiB7XG5cdFx0XHRcdFx0ZmV0Y2hFcnJvcjogeyB0eXBlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuUXVvdGFFeGNlZWRlZCwgY2FwaUVycm9yOiB7IGNvZGU6ICdxdW90YV9leGNlZWRlZCcgfSB9LFxuXHRcdFx0XHRcdGNvcGlsb3RQbGFuOiAnYnVzaW5lc3MnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksIHsgY29waWxvdFBsYW46ICdmcmVlJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzPy5tZXNzYWdlLCAnWW91XFwndmUgcmVhY2hlZCB5b3VyIG1vbnRobHkgY2hhdCBtZXNzYWdlcyBxdW90YS4gVXBncmFkZSB0byBDb3BpbG90IFBybyBvciB3YWl0IGZvciB5b3VyIGFsbG93YW5jZSB0byByZW5ldy4nKTtcblx0XHR9KTtcblxuXHRcdC8vIERyaWZ0IGd1YXJkOiB0aGUgbm9kZSBsYXllciAocGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvc2hhcmVkL2ZvcndhcmRlZENoYXRFcnJvci50cylcblx0XHQvLyBlbmNvZGVzIElGb3J3YXJkZWRDaGF0RXJyb3IgaW5kZXBlbmRlbnRseSBvZiB0aGlzIGNvbnN1bWVyICh0aGUgbGF5ZXJzIGNhbm5vdFxuXHRcdC8vIHNoYXJlIHR5cGVzKS4gVGhpcyBwaW5zIHRoZSBleGFjdCBwYXlsb2FkIHNoYXBlIHRoZSBub2RlIHNpZGUgZW1pdHMgXHUyMDE0IGluY2x1ZGluZ1xuXHRcdC8vIGV2ZXJ5IGZldGNoRXJyb3IudHlwZSBpdHMgY2xhc3NpZmllcnMgY2FuIHByb2R1Y2UgXHUyMDE0IHNvIGEgc2hhcGUgY2hhbmdlIG9uIGVpdGhlclxuXHRcdC8vIHNpZGUgaXMgY2F1Z2h0IGhlcmUgaW5zdGVhZCBvZiBzaWxlbnRseSBmYWlsaW5nIHRvIHJlbmRlci5cblx0XHR0ZXN0KCdhY2NlcHRzIHRoZSBwYXlsb2FkIHNoYXBlIGFuZCBldmVyeSB0eXBlIHRoZSBub2RlIGxheWVyIGVtaXRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9kZVR5cGVzID0gWydxdW90YUV4Y2VlZGVkJywgJ3JhdGVMaW1pdGVkJywgJ2NhbmNlbGVkJywgJ2JhZFJlcXVlc3QnLCAnYWdlbnRfdW5hdXRob3JpemVkJywgJ25vdEZvdW5kJywgJ2ZhaWxlZCcsICdsZW5ndGgnXTtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gbm9kZVR5cGVzLm1hcCh0eXBlID0+IGdldENoYXRFcnJvckRldGFpbHNGcm9tTWV0YShlcnJvckluZm8oe1xuXHRcdFx0XHRjaGF0RXJyb3I6IHtcblx0XHRcdFx0XHRmZXRjaEVycm9yOiB7XG5cdFx0XHRcdFx0XHR0eXBlLFxuXHRcdFx0XHRcdFx0cmVhc29uOiAndXBzdHJlYW0gcmVhc29uJyxcblx0XHRcdFx0XHRcdHJlcXVlc3RJZDogJ3JlcS0xJyxcblx0XHRcdFx0XHRcdHNlcnZlclJlcXVlc3RJZDogJ2doLTEnLFxuXHRcdFx0XHRcdFx0Y2FwaUVycm9yOiB7IGNvZGU6ICdzb21lX2NvZGUnLCBtZXNzYWdlOiAnc29tZSBtZXNzYWdlJyB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29waWxvdFBsYW46ICdmcmVlJyxcblx0XHRcdFx0XHRpc1VzYWdlQmFzZWRCaWxsaW5nOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKT8uY29kZSk7XG5cdFx0XHQvLyBFdmVyeSBub2RlLWVtaXR0ZWQgdHlwZSByZXNvbHZlcyB0byBhIGRlZmluZWQgZGV0YWlscyBvYmplY3Qgd2hvc2UgY29kZSBpc1xuXHRcdFx0Ly8gdGhlIGZldGNoIHR5cGUgKG9yLCBmb3IgcXVvdGEsIHRoZSBtb3JlIHNwZWNpZmljIGNhcGlFcnJvciBjb2RlKS5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZWQsIFsnc29tZV9jb2RlJywgJ3JhdGVMaW1pdGVkJywgJ2NhbmNlbGVkJywgJ2JhZFJlcXVlc3QnLCAnYWdlbnRfdW5hdXRob3JpemVkJywgJ25vdEZvdW5kJywgJ2ZhaWxlZCcsICdsZW5ndGgnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbUZldGNoRXJyb3InLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdvZmYgdG9waWMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21GZXRjaEVycm9yKHsgdHlwZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLk9mZlRvcGljIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRldGFpbHMsIHtcblx0XHRcdFx0Y29kZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLk9mZlRvcGljLFxuXHRcdFx0XHRtZXNzYWdlOiAnU29ycnksIGJ1dCBJIGNhbiBvbmx5IGFzc2lzdCB3aXRoIHByb2dyYW1taW5nIHJlbGF0ZWQgcXVlc3Rpb25zLicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhaWxlZCB3aXRoIGFuZCB3aXRob3V0IHNlcnZlciByZXF1ZXN0IGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2l0aFNlcnZlciA9IGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcih7IHR5cGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5GYWlsZWQsIHJlcXVlc3RJZDogJ3JpZCcsIHNlcnZlclJlcXVlc3RJZDogJ2doJywgcmVhc29uOiAnYm9vbScgfSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2l0aFNlcnZlciwge1xuXHRcdFx0XHRjb2RlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuRmFpbGVkLFxuXHRcdFx0XHRtZXNzYWdlOiAnU29ycnksIHlvdXIgcmVxdWVzdCBmYWlsZWQuIFBsZWFzZSB0cnkgYWdhaW4uXFxuXFxuQ2xpZW50IFJlcXVlc3QgSWQ6IHJpZFxcblxcbkdIIFJlcXVlc3QgSWQ6IGdoXFxuXFxuUmVhc29uOiBib29tJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3aXRob3V0U2VydmVyID0gZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21GZXRjaEVycm9yKHsgdHlwZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLkZhaWxlZCwgcmVxdWVzdElkOiAncmlkJywgcmVhc29uOiAnYm9vbScgfSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2l0aG91dFNlcnZlciwge1xuXHRcdFx0XHRjb2RlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuRmFpbGVkLFxuXHRcdFx0XHRtZXNzYWdlOiAnU29ycnksIHlvdXIgcmVxdWVzdCBmYWlsZWQuIFBsZWFzZSB0cnkgYWdhaW4uXFxuXFxuQ2xpZW50IFJlcXVlc3QgSWQ6IHJpZFxcblxcblJlYXNvbjogYm9vbScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3F1b3RhIGV4Y2VlZGVkIHVzZXMgcGxhbi1zcGVjaWZpYyBtZXNzYWdlIGFuZCBxdW90YSBjb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmV0Y2hFcnJvcjogSUNoYXRGZXRjaEVycm9yUGF5bG9hZCA9IHtcblx0XHRcdFx0dHlwZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLlF1b3RhRXhjZWVkZWQsXG5cdFx0XHRcdGNhcGlFcnJvcjogeyBjb2RlOiAncXVvdGFfZXhjZWVkZWQnIH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcihmZXRjaEVycm9yLCAnZnJlZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXRhaWxzLCB7XG5cdFx0XHRcdGNvZGU6ICdxdW90YV9leGNlZWRlZCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdZb3VcXCd2ZSByZWFjaGVkIHlvdXIgbW9udGhseSBjaGF0IG1lc3NhZ2VzIHF1b3RhLiBVcGdyYWRlIHRvIENvcGlsb3QgUHJvIG9yIHdhaXQgZm9yIHlvdXIgYWxsb3dhbmNlIHRvIHJlbmV3LicsXG5cdFx0XHRcdGlzUXVvdGFFeGNlZWRlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVyZWQgcmVzcG9uc2UgaXMgbWFya2VkIGZpbHRlcmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcih7IHR5cGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5GaWx0ZXJlZCwgY2F0ZWdvcnk6IEZpbHRlclJlYXNvbi5Db3B5cmlnaHQgfSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGV0YWlscywge1xuXHRcdFx0XHRjb2RlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuRmlsdGVyZWQsXG5cdFx0XHRcdG1lc3NhZ2U6ICdTb3JyeSwgdGhlIHJlc3BvbnNlIG1hdGNoZWQgcHVibGljIGNvZGUgc28gaXQgd2FzIGJsb2NrZWQuIFBsZWFzZSByZXBocmFzZSB5b3VyIHByb21wdC4gW0xlYXJuIG1vcmVdKGh0dHBzOi8vYWthLm1zL2NvcGlsb3QtY2hhdC1maWx0ZXJlZC1kb2NzKS4nLFxuXHRcdFx0XHRyZXNwb25zZUlzRmlsdGVyZWQ6IHRydWUsXG5cdFx0XHRcdGxldmVsOiBDaGF0RXJyb3JMZXZlbC5JbmZvLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW1wbGUgZXJyb3IgdHlwZXMgcHJvZHVjZSB0aGVpciBzdGF0aWMgbWVzc2FnZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0eXBlcyA9IFtcblx0XHRcdFx0Q2hhdEZldGNoUmVzcG9uc2VUeXBlLkNhbmNlbGVkLFxuXHRcdFx0XHRDaGF0RmV0Y2hSZXNwb25zZVR5cGUuTGVuZ3RoLFxuXHRcdFx0XHRDaGF0RmV0Y2hSZXNwb25zZVR5cGUuTm90Rm91bmQsXG5cdFx0XHRcdENoYXRGZXRjaFJlc3BvbnNlVHlwZS5Vbmtub3duLFxuXHRcdFx0XHRDaGF0RmV0Y2hSZXNwb25zZVR5cGUuRXh0ZW5zaW9uQmxvY2tlZCxcblx0XHRcdFx0Q2hhdEZldGNoUmVzcG9uc2VUeXBlLkFnZW50VW5hdXRob3JpemVkLFxuXHRcdFx0XHRDaGF0RmV0Y2hSZXNwb25zZVR5cGUuSW52YWxpZFN0YXRlZnVsTWFya2VyLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IHR5cGVzLm1hcCh0eXBlID0+IGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcih7IHR5cGUgfSwgdW5kZWZpbmVkKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHR7IGNvZGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5DYW5jZWxlZCwgbWVzc2FnZTogJ0NhbmNlbGVkJyB9LFxuXHRcdFx0XHR7IGNvZGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5MZW5ndGgsIG1lc3NhZ2U6ICdTb3JyeSwgdGhlIHJlc3BvbnNlIGhpdCB0aGUgbGVuZ3RoIGxpbWl0LiBQbGVhc2UgcmVwaHJhc2UgeW91ciBwcm9tcHQuJyB9LFxuXHRcdFx0XHR7IGNvZGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5Ob3RGb3VuZCwgbWVzc2FnZTogJ1NvcnJ5LCB0aGUgcmVzb3VyY2Ugd2FzIG5vdCBmb3VuZC4nIH0sXG5cdFx0XHRcdHsgY29kZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLlVua25vd24sIG1lc3NhZ2U6ICdTb3JyeSwgbm8gcmVzcG9uc2Ugd2FzIHJldHVybmVkLicgfSxcblx0XHRcdFx0eyBjb2RlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuRXh0ZW5zaW9uQmxvY2tlZCwgbWVzc2FnZTogJ1NvcnJ5LCBzb21ldGhpbmcgd2VudCB3cm9uZy4nIH0sXG5cdFx0XHRcdHsgY29kZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLkFnZW50VW5hdXRob3JpemVkLCBtZXNzYWdlOiAnU29ycnksIHNvbWV0aGluZyB3ZW50IHdyb25nLicgfSxcblx0XHRcdFx0eyBjb2RlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuSW52YWxpZFN0YXRlZnVsTWFya2VyLCBtZXNzYWdlOiAnWW91ciBjaGF0IHNlc3Npb24gc3RhdGUgaXMgaW52YWxpZCwgcGxlYXNlIHN0YXJ0IGEgbmV3IGNoYXQuJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXR3b3JrIGVycm9yIGluY2x1ZGVzIHJlcXVlc3QgaWQgYW5kIHJlYXNvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbUZldGNoRXJyb3IoeyB0eXBlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuTmV0d29ya0Vycm9yLCByZXF1ZXN0SWQ6ICdyaWQnLCByZWFzb246ICdvZmZsaW5lJyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXRhaWxzLCB7XG5cdFx0XHRcdGNvZGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5OZXR3b3JrRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6ICdTb3JyeSwgdGhlcmUgd2FzIGEgbmV0d29yayBlcnJvci4gUGxlYXNlIHRyeSBhZ2FpbiBsYXRlci4gUmVxdWVzdCBpZDogcmlkXFxuXFxuUmVhc29uOiBvZmZsaW5lJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnQgZmFpbGVkIGRlcGVuZGVuY3kgc3VyZmFjZXMgdGhlIHJhdyByZWFzb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21GZXRjaEVycm9yKHsgdHlwZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLkFnZW50RmFpbGVkRGVwZW5kZW5jeSwgcmVhc29uOiAndGltZWQgb3V0JyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXRhaWxzLCB7IGNvZGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5BZ2VudEZhaWxlZERlcGVuZGVuY3ksIG1lc3NhZ2U6ICd0aW1lZCBvdXQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmF0ZS1saW1pdCBtZXNzYWdlcyB2YXJ5IGJ5IGNhcGkgY29kZSBhbmQgYXV0byBmbGFnJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSBbXG5cdFx0XHRcdGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcih7IHR5cGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5SYXRlTGltaXRlZCwgcmV0cnlBZnRlcjogMzAsIGNhcGlFcnJvcjogeyBjb2RlOiAnYWdlbnRfbW9kZV9saW1pdF9leGNlZWRlZCcgfSB9LCB1bmRlZmluZWQpLm1lc3NhZ2UsXG5cdFx0XHRcdGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcih7IHR5cGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5SYXRlTGltaXRlZCwgcmV0cnlBZnRlcjogMzAsIGlzQXV0bzogdHJ1ZSwgY2FwaUVycm9yOiB7IGNvZGU6ICdtb2RlbF9vdmVybG9hZGVkJyB9IH0sIHVuZGVmaW5lZCkubWVzc2FnZSxcblx0XHRcdFx0Z2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21GZXRjaEVycm9yKHsgdHlwZTogQ2hhdEZldGNoUmVzcG9uc2VUeXBlLlJhdGVMaW1pdGVkLCByZXRyeUFmdGVyOiAzMCwgY2FwaUVycm9yOiB7IGNvZGU6ICdpbnRlZ3JhdGlvbl9yYXRlX2xpbWl0ZWQnIH0gfSwgdW5kZWZpbmVkKS5tZXNzYWdlLFxuXHRcdFx0XHRnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbUZldGNoRXJyb3IoeyB0eXBlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuUmF0ZUxpbWl0ZWQsIHJldHJ5QWZ0ZXI6IDMwIH0sIHVuZGVmaW5lZCkubWVzc2FnZSxcblx0XHRcdF07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbXG5cdFx0XHRcdCdTb3JyeSwgeW91IGhhdmUgZXhjZWVkZWQgdGhlIGFnZW50IG1vZGUgcmF0ZSBsaW1pdC4gUGxlYXNlIHN3aXRjaCB0byBhc2sgbW9kZSBhbmQgdHJ5IGFnYWluIGluIDMwIHNlY29uZHMuIFtMZWFybiBNb3JlXShodHRwczovL2FrYS5tcy9naXRodWItY29waWxvdC1yYXRlLWxpbWl0LWVycm9yKScsXG5cdFx0XHRcdCdTb3JyeSwgdGhlIHVwc3RyZWFtIG1vZGVsIHByb3ZpZGVyIGlzIGN1cnJlbnRseSBleHBlcmllbmNpbmcgaGlnaCBkZW1hbmQuIFBsZWFzZSB0cnkgYWdhaW4gaW4gMzAgc2Vjb25kcy4gW0xlYXJuIE1vcmVdKGh0dHBzOi8vYWthLm1zL2dpdGh1Yi1jb3BpbG90LXJhdGUtbGltaXQtZXJyb3IpJyxcblx0XHRcdFx0J1NvcnJ5LCBHaXRIdWIgQ29waWxvdCBDaGF0IGlzIGN1cnJlbnRseSBleHBlcmllbmNpbmcgaGlnaCBkZW1hbmQuIFBsZWFzZSB0cnkgYWdhaW4gaW4gMzAgc2Vjb25kcy4gW0xlYXJuIE1vcmVdKGh0dHBzOi8vYWthLm1zL2dpdGh1Yi1jb3BpbG90LXJhdGUtbGltaXQtZXJyb3IpJyxcblx0XHRcdFx0J1NvcnJ5LCB5b3VyIHJlcXVlc3Qgd2FzIHJhdGUtbGltaXRlZC4gUGxlYXNlIHdhaXQgMzAgc2Vjb25kcyBiZWZvcmUgdHJ5aW5nIGFnYWluIG9yIGNvbnNpZGVyIHN3aXRjaGluZyB0byBBdXRvLiBbTGVhcm4gTW9yZV0oaHR0cHM6Ly9ha2EubXMvZ2l0aHViLWNvcGlsb3QtcmF0ZS1saW1pdC1lcnJvciknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdxdW90YSBzdWItY29kZXMgbWFwIHRvIHNwZWNpZmljIG1lc3NhZ2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSBbXG5cdFx0XHRcdGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcih7IHR5cGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5RdW90YUV4Y2VlZGVkLCBjYXBpRXJyb3I6IHsgY29kZTogJ292ZXJhZ2VfbGltaXRfcmVhY2hlZCcgfSB9LCB1bmRlZmluZWQpLm1lc3NhZ2UsXG5cdFx0XHRcdGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcih7IHR5cGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5RdW90YUV4Y2VlZGVkLCBjYXBpRXJyb3I6IHsgY29kZTogJ2FkZGl0aW9uYWxfc3BlbmRfbGltaXRfcmVhY2hlZCcgfSB9LCB1bmRlZmluZWQpLm1lc3NhZ2UsXG5cdFx0XHRcdGdldENoYXRFcnJvckRldGFpbHNGcm9tRmV0Y2hFcnJvcih7IHR5cGU6IENoYXRGZXRjaFJlc3BvbnNlVHlwZS5RdW90YUV4Y2VlZGVkLCBjYXBpRXJyb3I6IHsgY29kZTogJ2JpbGxpbmdfbm90X2NvbmZpZ3VyZWQnLCBtZXNzYWdlOiAnc2V0IHVwIGJpbGxpbmcnIH0gfSwgdW5kZWZpbmVkKS5tZXNzYWdlLFxuXHRcdFx0XHRnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbUZldGNoRXJyb3IoeyB0eXBlOiBDaGF0RmV0Y2hSZXNwb25zZVR5cGUuUXVvdGFFeGNlZWRlZCB9LCB1bmRlZmluZWQpLm1lc3NhZ2UsXG5cdFx0XHRdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgW1xuXHRcdFx0XHQnWW91IGNhbm5vdCBhY2NydWUgYWRkaXRpb25hbCBwcmVtaXVtIHJlcXVlc3RzIGF0IHRoaXMgdGltZS4gUGxlYXNlIGNvbnRhY3QgW0dpdEh1YiBTdXBwb3J0XShodHRwczovL3N1cHBvcnQuZ2l0aHViLmNvbS9jb250YWN0KSB0byBjb250aW51ZSB1c2luZyBDb3BpbG90LicsXG5cdFx0XHRcdCdZb3VcXCd2ZSByZWFjaGVkIHlvdXIgYWRkaXRpb25hbCB1c2FnZSBsaW1pdCBmb3IgeW91ciBwbGFuLiBVcGdyYWRlIHlvdXIgcGxhbiB0byBrZWVwIGdvaW5nLicsXG5cdFx0XHRcdCdzZXQgdXAgYmlsbGluZycsXG5cdFx0XHRcdCdRdW90YSBFeGNlZWRlZCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFF1b3RhTWVzc2FnZUZvclBsYW4nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd1c2FnZS1iYXNlZCBiaWxsaW5nIGJ1c2luZXNzIHBsYW4gd2l0aCByZXNldCBkYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGdldFF1b3RhTWVzc2FnZUZvclBsYW4oJ2J1c2luZXNzJywgdHJ1ZSwgJzIwMzAtMDEtMTVUMDA6MDA6MDAuMDAwWicpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1lc3NhZ2Uuc3RhcnRzV2l0aCgnWW91XFwndmUgcmVhY2hlZCB5b3VyIGNyZWRpdCBsaW1pdC4gVG8gY29udGludWUgd29ya2luZywgcGxlYXNlIGNvbnRhY3QgeW91ciBvcmdhbml6YXRpb25cXCdzIENvcGlsb3QgYWRtaW4gb3Igd2FpdCB1bnRpbCB5b3VyIGNyZWRpdHMgcmVzZXQgb24nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWZhdWx0IHBsYW4sIG5vIHVzYWdlLWJhc2VkIGJpbGxpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFF1b3RhTWVzc2FnZUZvclBsYW4odW5kZWZpbmVkKSxcblx0XHRcdFx0J1lvdVxcJ3ZlIGV4aGF1c3RlZCB5b3VyIHByZW1pdW0gbW9kZWwgcXVvdGEuIEZvciBhZGRpdGlvbmFsIHBhaWQgcHJlbWl1bSByZXF1ZXN0cywgcGxlYXNlIHJlYWNoIG91dCB0byB5b3VyIG9yZ2FuaXphdGlvblxcJ3MgQ29waWxvdCBhZG1pbiBvciB3YWl0IGZvciB5b3VyIGFsbG93YW5jZSB0byByZW5ldy4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VkdSBwbGFuIHdpdGggdXNhZ2UtYmFzZWQgYmlsbGluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtnZXRRdW90YU1lc3NhZ2VGb3JQbGFuKCdlZHUnLCB0cnVlLCAnMjAzMC0wMS0xNVQwMDowMDowMC4wMDBaJyksIGdldFF1b3RhTWVzc2FnZUZvclBsYW4oJ2VkdScsIHRydWUpXSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGBZb3UndmUgcmVhY2hlZCB5b3VyIG1vbnRobHkgY3JlZGl0IGxpbWl0LiBQbGVhc2UgZW5hYmxlIGFkZGl0aW9uYWwgcGFpZCBjcmVkaXRzLCB1cGdyYWRlIHRvIENvcGlsb3QgUHJvLCBvciB3YWl0IHVudGlsIHlvdXIgY3JlZGl0cyByZXNldCBvbiAke25ldyBEYXRlKCcyMDMwLTAxLTE1VDAwOjAwOjAwLjAwMFonKS50b0xvY2FsZVN0cmluZyh1bmRlZmluZWQsIHsgeWVhcjogJ251bWVyaWMnLCBtb250aDogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgaG91cjogJ251bWVyaWMnLCBtaW51dGU6ICcyLWRpZ2l0JyB9KX0uYCxcblx0XHRcdFx0XHQnWW91XFwndmUgcmVhY2hlZCB5b3VyIG1vbnRobHkgY3JlZGl0IGxpbWl0LiBQbGVhc2UgZW5hYmxlIGFkZGl0aW9uYWwgcGFpZCBjcmVkaXRzLCB1cGdyYWRlIHRvIENvcGlsb3QgUHJvLCBvciB3YWl0IGZvciB5b3VyIGNyZWRpdHMgdG8gcmVzZXQuJyxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlZHUgcGxhbiB3aXRob3V0IHVzYWdlLWJhc2VkIGJpbGxpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFF1b3RhTWVzc2FnZUZvclBsYW4oJ2VkdScpLFxuXHRcdFx0XHQnWW91XFwndmUgZXhoYXVzdGVkIHlvdXIgcHJlbWl1bSBtb2RlbCBxdW90YS4gUGxlYXNlIGVuYWJsZSBhZGRpdGlvbmFsIHBhaWQgcHJlbWl1bSByZXF1ZXN0cywgdXBncmFkZSB0byBDb3BpbG90IFBybywgb3Igd2FpdCBmb3IgeW91ciBhbGxvd2FuY2UgdG8gcmVuZXcuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRDb3BpbG90UGxhbkZyb21FbnRpdGxlbWVudCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hcHMgZW50aXRsZW1lbnRzIHRvIENvcGlsb3QgcGxhbiBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gW1xuXHRcdFx0XHRDaGF0RW50aXRsZW1lbnQuRnJlZSxcblx0XHRcdFx0Q2hhdEVudGl0bGVtZW50LlBybyxcblx0XHRcdFx0Q2hhdEVudGl0bGVtZW50LlByb1BsdXMsXG5cdFx0XHRcdENoYXRFbnRpdGxlbWVudC5NYXgsXG5cdFx0XHRcdENoYXRFbnRpdGxlbWVudC5CdXNpbmVzcyxcblx0XHRcdFx0Q2hhdEVudGl0bGVtZW50LkVudGVycHJpc2UsXG5cdFx0XHRcdENoYXRFbnRpdGxlbWVudC5FRFUsXG5cdFx0XHRcdENoYXRFbnRpdGxlbWVudC5Vbmtub3duLFxuXHRcdFx0XS5tYXAoZ2V0Q29waWxvdFBsYW5Gcm9tRW50aXRsZW1lbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFsnZnJlZScsICdpbmRpdmlkdWFsJywgJ2luZGl2aWR1YWxfcHJvJywgJ2luZGl2aWR1YWxfbWF4JywgJ2J1c2luZXNzJywgJ2VudGVycHJpc2UnLCAnZWR1JywgdW5kZWZpbmVkXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUVNO0FBQ1AsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxz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
