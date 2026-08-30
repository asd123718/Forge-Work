import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { buildChatErrorInfoFromCopilotSdkFields, buildForwardedChatErrorFromCopilotSdkFields } from "../../node/copilot/copilotSdkChatError.js";
suite("copilotSdkChatError", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps Copilot SDK error categories to fetch types", () => {
    const actual = [
      { errorType: "quota", message: "q" },
      { errorType: "rate_limit", message: "r" },
      { errorType: "context_limit", message: "c" },
      { errorType: "authentication", message: "a" },
      { errorType: "authorization", message: "a" }
    ].map((data) => buildForwardedChatErrorFromCopilotSdkFields(data)?.fetchError.type);
    assert.deepStrictEqual(actual, ["quotaExceeded", "rateLimited", "length", "agent_unauthorized", "agent_unauthorized"]);
  });
  test("carries code, message, and request ids for a quota error", () => {
    const forwarded = buildForwardedChatErrorFromCopilotSdkFields({
      errorType: "quota",
      errorCode: "quota_exceeded",
      message: "You have exceeded your monthly quota",
      statusCode: 402,
      providerCallId: "gh-1",
      serviceRequestId: "svc-2"
    });
    assert.deepStrictEqual(forwarded, {
      fetchError: {
        type: "quotaExceeded",
        reason: "You have exceeded your monthly quota",
        requestId: "gh-1",
        serverRequestId: "svc-2",
        capiError: { code: "quota_exceeded", message: "You have exceeded your monthly quota" }
      }
    });
  });
  test("defaults a quota error without an explicit code to quota_exceeded", () => {
    const fromType = buildForwardedChatErrorFromCopilotSdkFields({ errorType: "quota", message: "no credits" });
    const fromStatus = buildForwardedChatErrorFromCopilotSdkFields({ errorType: "unknown", message: "no credits", statusCode: 402 });
    assert.deepStrictEqual([fromType?.fetchError.capiError?.code, fromStatus?.fetchError.capiError?.code], ["quota_exceeded", "quota_exceeded"]);
  });
  test("falls back to status-code mapping for an unknown category", () => {
    assert.strictEqual(buildForwardedChatErrorFromCopilotSdkFields({ errorType: "something", message: "m", statusCode: 429 })?.fetchError.type, "rateLimited");
  });
  test("returns undefined for an unclassifiable error", () => {
    assert.strictEqual(buildForwardedChatErrorFromCopilotSdkFields({ errorType: "query", message: "bad input" }), void 0);
  });
  test("builds protocol error info with stack and structured metadata", () => {
    assert.deepStrictEqual(buildChatErrorInfoFromCopilotSdkFields({
      errorType: "quota",
      message: "no credits",
      stack: "stack"
    }), {
      errorType: "quota",
      message: "no credits",
      stack: "stack",
      _meta: {
        chatError: {
          fetchError: {
            type: "quotaExceeded",
            reason: "no credits",
            requestId: "",
            capiError: { code: "quota_exceeded", message: "no credits" }
          }
        }
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90U2RrQ2hhdEVycm9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdEVycm9ySW5mb0Zyb21Db3BpbG90U2RrRmllbGRzLCBidWlsZEZvcndhcmRlZENoYXRFcnJvckZyb21Db3BpbG90U2RrRmllbGRzIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2NvcGlsb3RTZGtDaGF0RXJyb3IuanMnO1xuaW1wb3J0IHR5cGUgeyBJRm9yd2FyZGVkQ2hhdEVycm9yIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvcHJveHlDaGF0RXJyb3IuanMnO1xuXG5zdWl0ZSgnY29waWxvdFNka0NoYXRFcnJvcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXBzIENvcGlsb3QgU0RLIGVycm9yIGNhdGVnb3JpZXMgdG8gZmV0Y2ggdHlwZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gW1xuXHRcdFx0eyBlcnJvclR5cGU6ICdxdW90YScsIG1lc3NhZ2U6ICdxJyB9LFxuXHRcdFx0eyBlcnJvclR5cGU6ICdyYXRlX2xpbWl0JywgbWVzc2FnZTogJ3InIH0sXG5cdFx0XHR7IGVycm9yVHlwZTogJ2NvbnRleHRfbGltaXQnLCBtZXNzYWdlOiAnYycgfSxcblx0XHRcdHsgZXJyb3JUeXBlOiAnYXV0aGVudGljYXRpb24nLCBtZXNzYWdlOiAnYScgfSxcblx0XHRcdHsgZXJyb3JUeXBlOiAnYXV0aG9yaXphdGlvbicsIG1lc3NhZ2U6ICdhJyB9LFxuXHRcdF0ubWFwKGRhdGEgPT4gYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3JGcm9tQ29waWxvdFNka0ZpZWxkcyhkYXRhKT8uZmV0Y2hFcnJvci50eXBlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgWydxdW90YUV4Y2VlZGVkJywgJ3JhdGVMaW1pdGVkJywgJ2xlbmd0aCcsICdhZ2VudF91bmF1dGhvcml6ZWQnLCAnYWdlbnRfdW5hdXRob3JpemVkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIGNvZGUsIG1lc3NhZ2UsIGFuZCByZXF1ZXN0IGlkcyBmb3IgYSBxdW90YSBlcnJvcicsICgpID0+IHtcblx0XHRjb25zdCBmb3J3YXJkZWQgPSBidWlsZEZvcndhcmRlZENoYXRFcnJvckZyb21Db3BpbG90U2RrRmllbGRzKHtcblx0XHRcdGVycm9yVHlwZTogJ3F1b3RhJyxcblx0XHRcdGVycm9yQ29kZTogJ3F1b3RhX2V4Y2VlZGVkJyxcblx0XHRcdG1lc3NhZ2U6ICdZb3UgaGF2ZSBleGNlZWRlZCB5b3VyIG1vbnRobHkgcXVvdGEnLFxuXHRcdFx0c3RhdHVzQ29kZTogNDAyLFxuXHRcdFx0cHJvdmlkZXJDYWxsSWQ6ICdnaC0xJyxcblx0XHRcdHNlcnZpY2VSZXF1ZXN0SWQ6ICdzdmMtMicsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmb3J3YXJkZWQsIHtcblx0XHRcdGZldGNoRXJyb3I6IHtcblx0XHRcdFx0dHlwZTogJ3F1b3RhRXhjZWVkZWQnLFxuXHRcdFx0XHRyZWFzb246ICdZb3UgaGF2ZSBleGNlZWRlZCB5b3VyIG1vbnRobHkgcXVvdGEnLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdnaC0xJyxcblx0XHRcdFx0c2VydmVyUmVxdWVzdElkOiAnc3ZjLTInLFxuXHRcdFx0XHRjYXBpRXJyb3I6IHsgY29kZTogJ3F1b3RhX2V4Y2VlZGVkJywgbWVzc2FnZTogJ1lvdSBoYXZlIGV4Y2VlZGVkIHlvdXIgbW9udGhseSBxdW90YScgfSxcblx0XHRcdH0sXG5cdFx0fSBzYXRpc2ZpZXMgSUZvcndhcmRlZENoYXRFcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZmF1bHRzIGEgcXVvdGEgZXJyb3Igd2l0aG91dCBhbiBleHBsaWNpdCBjb2RlIHRvIHF1b3RhX2V4Y2VlZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZyb21UeXBlID0gYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3JGcm9tQ29waWxvdFNka0ZpZWxkcyh7IGVycm9yVHlwZTogJ3F1b3RhJywgbWVzc2FnZTogJ25vIGNyZWRpdHMnIH0pO1xuXHRcdGNvbnN0IGZyb21TdGF0dXMgPSBidWlsZEZvcndhcmRlZENoYXRFcnJvckZyb21Db3BpbG90U2RrRmllbGRzKHsgZXJyb3JUeXBlOiAndW5rbm93bicsIG1lc3NhZ2U6ICdubyBjcmVkaXRzJywgc3RhdHVzQ29kZTogNDAyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2Zyb21UeXBlPy5mZXRjaEVycm9yLmNhcGlFcnJvcj8uY29kZSwgZnJvbVN0YXR1cz8uZmV0Y2hFcnJvci5jYXBpRXJyb3I/LmNvZGVdLCBbJ3F1b3RhX2V4Y2VlZGVkJywgJ3F1b3RhX2V4Y2VlZGVkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHN0YXR1cy1jb2RlIG1hcHBpbmcgZm9yIGFuIHVua25vd24gY2F0ZWdvcnknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yRnJvbUNvcGlsb3RTZGtGaWVsZHMoeyBlcnJvclR5cGU6ICdzb21ldGhpbmcnLCBtZXNzYWdlOiAnbScsIHN0YXR1c0NvZGU6IDQyOSB9KT8uZmV0Y2hFcnJvci50eXBlLCAncmF0ZUxpbWl0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGFuIHVuY2xhc3NpZmlhYmxlIGVycm9yJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWlsZEZvcndhcmRlZENoYXRFcnJvckZyb21Db3BpbG90U2RrRmllbGRzKHsgZXJyb3JUeXBlOiAncXVlcnknLCBtZXNzYWdlOiAnYmFkIGlucHV0JyB9KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIHByb3RvY29sIGVycm9yIGluZm8gd2l0aCBzdGFjayBhbmQgc3RydWN0dXJlZCBtZXRhZGF0YScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkQ2hhdEVycm9ySW5mb0Zyb21Db3BpbG90U2RrRmllbGRzKHtcblx0XHRcdGVycm9yVHlwZTogJ3F1b3RhJyxcblx0XHRcdG1lc3NhZ2U6ICdubyBjcmVkaXRzJyxcblx0XHRcdHN0YWNrOiAnc3RhY2snLFxuXHRcdH0pLCB7XG5cdFx0XHRlcnJvclR5cGU6ICdxdW90YScsXG5cdFx0XHRtZXNzYWdlOiAnbm8gY3JlZGl0cycsXG5cdFx0XHRzdGFjazogJ3N0YWNrJyxcblx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdGNoYXRFcnJvcjoge1xuXHRcdFx0XHRcdGZldGNoRXJyb3I6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdxdW90YUV4Y2VlZGVkJyxcblx0XHRcdFx0XHRcdHJlYXNvbjogJ25vIGNyZWRpdHMnLFxuXHRcdFx0XHRcdFx0cmVxdWVzdElkOiAnJyxcblx0XHRcdFx0XHRcdGNhcGlFcnJvcjogeyBjb2RlOiAncXVvdGFfZXhjZWVkZWQnLCBtZXNzYWdlOiAnbm8gY3JlZGl0cycgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdDQUF3QyxtREFBbUQ7QUFHcEcsTUFBTSx1QkFBdUIsTUFBTTtBQUVsQywwQ0FBd0M7QUFFeEMsT0FBSyxvREFBb0QsTUFBTTtBQUM5RCxVQUFNLFNBQVM7QUFBQSxNQUNkLEVBQUUsV0FBVyxTQUFTLFNBQVMsSUFBSTtBQUFBLE1BQ25DLEVBQUUsV0FBVyxjQUFjLFNBQVMsSUFBSTtBQUFBLE1BQ3hDLEVBQUUsV0FBVyxpQkFBaUIsU0FBUyxJQUFJO0FBQUEsTUFDM0MsRUFBRSxXQUFXLGtCQUFrQixTQUFTLElBQUk7QUFBQSxNQUM1QyxFQUFFLFdBQVcsaUJBQWlCLFNBQVMsSUFBSTtBQUFBLElBQzVDLEVBQUUsSUFBSSxVQUFRLDRDQUE0QyxJQUFJLEdBQUcsV0FBVyxJQUFJO0FBQ2hGLFdBQU8sZ0JBQWdCLFFBQVEsQ0FBQyxpQkFBaUIsZUFBZSxVQUFVLHNCQUFzQixvQkFBb0IsQ0FBQztBQUFBLEVBQ3RILENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFVBQU0sWUFBWSw0Q0FBNEM7QUFBQSxNQUM3RCxXQUFXO0FBQUEsTUFDWCxXQUFXO0FBQUEsTUFDWCxTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsTUFDWixnQkFBZ0I7QUFBQSxNQUNoQixrQkFBa0I7QUFBQSxJQUNuQixDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsV0FBVztBQUFBLE1BQ2pDLFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLFdBQVc7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLFFBQ2pCLFdBQVcsRUFBRSxNQUFNLGtCQUFrQixTQUFTLHVDQUF1QztBQUFBLE1BQ3RGO0FBQUEsSUFDRCxDQUErQjtBQUFBLEVBQ2hDLENBQUM7QUFFRCxPQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFVBQU0sV0FBVyw0Q0FBNEMsRUFBRSxXQUFXLFNBQVMsU0FBUyxhQUFhLENBQUM7QUFDMUcsVUFBTSxhQUFhLDRDQUE0QyxFQUFFLFdBQVcsV0FBVyxTQUFTLGNBQWMsWUFBWSxJQUFJLENBQUM7QUFDL0gsV0FBTyxnQkFBZ0IsQ0FBQyxVQUFVLFdBQVcsV0FBVyxNQUFNLFlBQVksV0FBVyxXQUFXLElBQUksR0FBRyxDQUFDLGtCQUFrQixnQkFBZ0IsQ0FBQztBQUFBLEVBQzVJLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFdBQU8sWUFBWSw0Q0FBNEMsRUFBRSxXQUFXLGFBQWEsU0FBUyxLQUFLLFlBQVksSUFBSSxDQUFDLEdBQUcsV0FBVyxNQUFNLGFBQWE7QUFBQSxFQUMxSixDQUFDO0FBRUQsT0FBSyxpREFBaUQsTUFBTTtBQUMzRCxXQUFPLFlBQVksNENBQTRDLEVBQUUsV0FBVyxTQUFTLFNBQVMsWUFBWSxDQUFDLEdBQUcsTUFBUztBQUFBLEVBQ3hILENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFdBQU8sZ0JBQWdCLHVDQUF1QztBQUFBLE1BQzdELFdBQVc7QUFBQSxNQUNYLFNBQVM7QUFBQSxNQUNULE9BQU87QUFBQSxJQUNSLENBQUMsR0FBRztBQUFBLE1BQ0gsV0FBVztBQUFBLE1BQ1gsU0FBUztBQUFBLE1BQ1QsT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ04sV0FBVztBQUFBLFVBQ1YsWUFBWTtBQUFBLFlBQ1gsTUFBTTtBQUFBLFlBQ04sUUFBUTtBQUFBLFlBQ1IsV0FBVztBQUFBLFlBQ1gsV0FBVyxFQUFFLE1BQU0sa0JBQWtCLFNBQVMsYUFBYTtBQUFBLFVBQzVEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
