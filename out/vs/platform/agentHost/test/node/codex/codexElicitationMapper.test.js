import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputRequestPurpose, ChatInputResponseKind } from "../../../common/state/sessionState.js";
import { buildElicitationRequest, elicitationResponseFromAnswers } from "../../../node/codex/codexElicitationMapper.js";
suite("codexElicitationMapper", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const formParams = {
    threadId: "t1",
    turnId: null,
    serverName: "srv",
    mode: "form",
    _meta: null,
    message: "Please configure",
    requestedSchema: {
      type: "object",
      required: ["name", "count"],
      properties: {
        name: { type: "string", title: "Name", description: "Your name", minLength: 1 },
        count: { type: "integer", title: "Count", minimum: 0, maximum: 9 },
        enabled: { type: "boolean", title: "Enabled", default: true },
        color: { type: "string", title: "Color", enum: ["red", "green"], enumNames: ["Red", "Green"] },
        size: { type: "string", title: "Size", oneOf: [{ const: "s", title: "Small" }, { const: "l", title: "Large" }] },
        tags: { type: "array", title: "Tags", items: { type: "string", enum: ["a", "b"] } }
      }
    }
  };
  const urlParams = {
    threadId: "t1",
    turnId: null,
    serverName: "srv",
    mode: "url",
    _meta: null,
    message: "Authorize",
    url: "https://example.com/auth",
    elicitationId: "e1"
  };
  test("buildElicitationRequest (form) projects every primitive field kind", () => {
    assert.deepStrictEqual(buildElicitationRequest("req-1", formParams), {
      id: "req-1",
      purpose: ChatInputRequestPurpose.Elicitation,
      message: "Please configure",
      questions: [
        { kind: ChatInputQuestionKind.Text, id: "name", title: "Name", message: "Your name", required: true, format: void 0, min: 1, max: void 0, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Integer, id: "count", title: "Count", message: "Count", required: true, min: 0, max: 9, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Boolean, id: "enabled", title: "Enabled", message: "Enabled", required: false, defaultValue: true },
        { kind: ChatInputQuestionKind.SingleSelect, id: "color", title: "Color", message: "Color", required: false, options: [{ id: "red", label: "Red" }, { id: "green", label: "Green" }] },
        { kind: ChatInputQuestionKind.SingleSelect, id: "size", title: "Size", message: "Size", required: false, options: [{ id: "s", label: "Small" }, { id: "l", label: "Large" }] },
        { kind: ChatInputQuestionKind.MultiSelect, id: "tags", title: "Tags", message: "Tags", required: false, options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], min: void 0, max: void 0 }
      ]
    });
  });
  test("buildElicitationRequest (url) surfaces the url with no questions", () => {
    assert.deepStrictEqual(buildElicitationRequest("req-2", urlParams), {
      id: "req-2",
      purpose: ChatInputRequestPurpose.Elicitation,
      message: "Authorize",
      url: "https://example.com/auth"
    });
  });
  test("elicitationResponseFromAnswers maps decline/cancel/accept", () => {
    const accepted = {
      name: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "Ada" } },
      count: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 3 } },
      enabled: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: false } },
      color: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: "red" } },
      tags: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ["a", "b"] } },
      size: { state: ChatInputAnswerState.Skipped }
    };
    assert.deepStrictEqual({
      decline: elicitationResponseFromAnswers(formParams, ChatInputResponseKind.Decline, void 0),
      cancel: elicitationResponseFromAnswers(formParams, ChatInputResponseKind.Cancel, void 0),
      accept: elicitationResponseFromAnswers(formParams, ChatInputResponseKind.Accept, accepted)
    }, {
      decline: { action: "decline", content: null, _meta: null },
      cancel: { action: "cancel", content: null, _meta: null },
      accept: { action: "accept", _meta: null, content: { name: "Ada", count: 3, enabled: false, color: "red", tags: ["a", "b"] } }
    });
  });
  test("elicitationResponseFromAnswers (url accept) carries no content", () => {
    assert.deepStrictEqual(
      elicitationResponseFromAnswers(urlParams, ChatInputResponseKind.Accept, void 0),
      { action: "accept", content: null, _meta: null }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhFbGljaXRhdGlvbk1hcHBlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIHR5cGUgQ2hhdElucHV0QW5zd2VyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCwgZWxpY2l0YXRpb25SZXNwb25zZUZyb21BbnN3ZXJzIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEVsaWNpdGF0aW9uTWFwcGVyLmpzJztcbmltcG9ydCB0eXBlIHsgTWNwU2VydmVyRWxpY2l0YXRpb25SZXF1ZXN0UGFyYW1zIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwU2VydmVyRWxpY2l0YXRpb25SZXF1ZXN0UGFyYW1zLmpzJztcblxuc3VpdGUoJ2NvZGV4RWxpY2l0YXRpb25NYXBwZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgZm9ybVBhcmFtczogTWNwU2VydmVyRWxpY2l0YXRpb25SZXF1ZXN0UGFyYW1zID0ge1xuXHRcdHRocmVhZElkOiAndDEnLCB0dXJuSWQ6IG51bGwsIHNlcnZlck5hbWU6ICdzcnYnLCBtb2RlOiAnZm9ybScsIF9tZXRhOiBudWxsLFxuXHRcdG1lc3NhZ2U6ICdQbGVhc2UgY29uZmlndXJlJyxcblx0XHRyZXF1ZXN0ZWRTY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cmVxdWlyZWQ6IFsnbmFtZScsICdjb3VudCddLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ05hbWUnLCBkZXNjcmlwdGlvbjogJ1lvdXIgbmFtZScsIG1pbkxlbmd0aDogMSB9LFxuXHRcdFx0XHRjb3VudDogeyB0eXBlOiAnaW50ZWdlcicsIHRpdGxlOiAnQ291bnQnLCBtaW5pbXVtOiAwLCBtYXhpbXVtOiA5IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHsgdHlwZTogJ2Jvb2xlYW4nLCB0aXRsZTogJ0VuYWJsZWQnLCBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdGNvbG9yOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0NvbG9yJywgZW51bTogWydyZWQnLCAnZ3JlZW4nXSwgZW51bU5hbWVzOiBbJ1JlZCcsICdHcmVlbiddIH0sXG5cdFx0XHRcdHNpemU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnU2l6ZScsIG9uZU9mOiBbeyBjb25zdDogJ3MnLCB0aXRsZTogJ1NtYWxsJyB9LCB7IGNvbnN0OiAnbCcsIHRpdGxlOiAnTGFyZ2UnIH1dIH0sXG5cdFx0XHRcdHRhZ3M6IHsgdHlwZTogJ2FycmF5JywgdGl0bGU6ICdUYWdzJywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIGVudW06IFsnYScsICdiJ10gfSB9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHR9O1xuXG5cdGNvbnN0IHVybFBhcmFtczogTWNwU2VydmVyRWxpY2l0YXRpb25SZXF1ZXN0UGFyYW1zID0ge1xuXHRcdHRocmVhZElkOiAndDEnLCB0dXJuSWQ6IG51bGwsIHNlcnZlck5hbWU6ICdzcnYnLCBtb2RlOiAndXJsJywgX21ldGE6IG51bGwsXG5cdFx0bWVzc2FnZTogJ0F1dGhvcml6ZScsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXV0aCcsIGVsaWNpdGF0aW9uSWQ6ICdlMScsXG5cdH07XG5cblx0dGVzdCgnYnVpbGRFbGljaXRhdGlvblJlcXVlc3QgKGZvcm0pIHByb2plY3RzIGV2ZXJ5IHByaW1pdGl2ZSBmaWVsZCBraW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ3JlcS0xJywgZm9ybVBhcmFtcyksIHtcblx0XHRcdGlkOiAncmVxLTEnLFxuXHRcdFx0cHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuRWxpY2l0YXRpb24sXG5cdFx0XHRtZXNzYWdlOiAnUGxlYXNlIGNvbmZpZ3VyZScsXG5cdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCwgaWQ6ICduYW1lJywgdGl0bGU6ICdOYW1lJywgbWVzc2FnZTogJ1lvdXIgbmFtZScsIHJlcXVpcmVkOiB0cnVlLCBmb3JtYXQ6IHVuZGVmaW5lZCwgbWluOiAxLCBtYXg6IHVuZGVmaW5lZCwgZGVmYXVsdFZhbHVlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuSW50ZWdlciwgaWQ6ICdjb3VudCcsIHRpdGxlOiAnQ291bnQnLCBtZXNzYWdlOiAnQ291bnQnLCByZXF1aXJlZDogdHJ1ZSwgbWluOiAwLCBtYXg6IDksIGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLkJvb2xlYW4sIGlkOiAnZW5hYmxlZCcsIHRpdGxlOiAnRW5hYmxlZCcsIG1lc3NhZ2U6ICdFbmFibGVkJywgcmVxdWlyZWQ6IGZhbHNlLCBkZWZhdWx0VmFsdWU6IHRydWUgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LCBpZDogJ2NvbG9yJywgdGl0bGU6ICdDb2xvcicsIG1lc3NhZ2U6ICdDb2xvcicsIHJlcXVpcmVkOiBmYWxzZSwgb3B0aW9uczogW3sgaWQ6ICdyZWQnLCBsYWJlbDogJ1JlZCcgfSwgeyBpZDogJ2dyZWVuJywgbGFiZWw6ICdHcmVlbicgfV0gfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LCBpZDogJ3NpemUnLCB0aXRsZTogJ1NpemUnLCBtZXNzYWdlOiAnU2l6ZScsIHJlcXVpcmVkOiBmYWxzZSwgb3B0aW9uczogW3sgaWQ6ICdzJywgbGFiZWw6ICdTbWFsbCcgfSwgeyBpZDogJ2wnLCBsYWJlbDogJ0xhcmdlJyB9XSB9LFxuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5NdWx0aVNlbGVjdCwgaWQ6ICd0YWdzJywgdGl0bGU6ICdUYWdzJywgbWVzc2FnZTogJ1RhZ3MnLCByZXF1aXJlZDogZmFsc2UsIG9wdGlvbnM6IFt7IGlkOiAnYScsIGxhYmVsOiAnYScgfSwgeyBpZDogJ2InLCBsYWJlbDogJ2InIH1dLCBtaW46IHVuZGVmaW5lZCwgbWF4OiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkRWxpY2l0YXRpb25SZXF1ZXN0ICh1cmwpIHN1cmZhY2VzIHRoZSB1cmwgd2l0aCBubyBxdWVzdGlvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgncmVxLTInLCB1cmxQYXJhbXMpLCB7XG5cdFx0XHRpZDogJ3JlcS0yJywgcHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuRWxpY2l0YXRpb24sIG1lc3NhZ2U6ICdBdXRob3JpemUnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2F1dGgnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnMgbWFwcyBkZWNsaW5lL2NhbmNlbC9hY2NlcHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWNjZXB0ZWQ6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gPSB7XG5cdFx0XHRuYW1lOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ0FkYScgfSB9LFxuXHRcdFx0Y291bnQ6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLk51bWJlciwgdmFsdWU6IDMgfSB9LFxuXHRcdFx0ZW5hYmxlZDogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuQm9vbGVhbiwgdmFsdWU6IGZhbHNlIH0gfSxcblx0XHRcdGNvbG9yOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZCwgdmFsdWU6ICdyZWQnIH0gfSxcblx0XHRcdHRhZ3M6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkTWFueSwgdmFsdWU6IFsnYScsICdiJ10gfSB9LFxuXHRcdFx0c2l6ZTogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU2tpcHBlZCB9LFxuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZWNsaW5lOiBlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnMoZm9ybVBhcmFtcywgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkRlY2xpbmUsIHVuZGVmaW5lZCksXG5cdFx0XHRjYW5jZWw6IGVsaWNpdGF0aW9uUmVzcG9uc2VGcm9tQW5zd2Vycyhmb3JtUGFyYW1zLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsLCB1bmRlZmluZWQpLFxuXHRcdFx0YWNjZXB0OiBlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnMoZm9ybVBhcmFtcywgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwgYWNjZXB0ZWQpLFxuXHRcdH0sIHtcblx0XHRcdGRlY2xpbmU6IHsgYWN0aW9uOiAnZGVjbGluZScsIGNvbnRlbnQ6IG51bGwsIF9tZXRhOiBudWxsIH0sXG5cdFx0XHRjYW5jZWw6IHsgYWN0aW9uOiAnY2FuY2VsJywgY29udGVudDogbnVsbCwgX21ldGE6IG51bGwgfSxcblx0XHRcdGFjY2VwdDogeyBhY3Rpb246ICdhY2NlcHQnLCBfbWV0YTogbnVsbCwgY29udGVudDogeyBuYW1lOiAnQWRhJywgY291bnQ6IDMsIGVuYWJsZWQ6IGZhbHNlLCBjb2xvcjogJ3JlZCcsIHRhZ3M6IFsnYScsICdiJ10gfSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnMgKHVybCBhY2NlcHQpIGNhcnJpZXMgbm8gY29udGVudCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0ZWxpY2l0YXRpb25SZXNwb25zZUZyb21BbnN3ZXJzKHVybFBhcmFtcywgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwgdW5kZWZpbmVkKSxcblx0XHRcdHsgYWN0aW9uOiAnYWNjZXB0JywgY29udGVudDogbnVsbCwgX21ldGE6IG51bGwgfSxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCLDBCQUEwQix1QkFBdUIseUJBQXlCLDZCQUFtRDtBQUM1SixTQUFTLHlCQUF5QixzQ0FBc0M7QUFHeEUsTUFBTSwwQkFBMEIsTUFBTTtBQUVyQywwQ0FBd0M7QUFFeEMsUUFBTSxhQUFnRDtBQUFBLElBQ3JELFVBQVU7QUFBQSxJQUFNLFFBQVE7QUFBQSxJQUFNLFlBQVk7QUFBQSxJQUFPLE1BQU07QUFBQSxJQUFRLE9BQU87QUFBQSxJQUN0RSxTQUFTO0FBQUEsSUFDVCxpQkFBaUI7QUFBQSxNQUNoQixNQUFNO0FBQUEsTUFDTixVQUFVLENBQUMsUUFBUSxPQUFPO0FBQUEsTUFDMUIsWUFBWTtBQUFBLFFBQ1gsTUFBTSxFQUFFLE1BQU0sVUFBVSxPQUFPLFFBQVEsYUFBYSxhQUFhLFdBQVcsRUFBRTtBQUFBLFFBQzlFLE9BQU8sRUFBRSxNQUFNLFdBQVcsT0FBTyxTQUFTLFNBQVMsR0FBRyxTQUFTLEVBQUU7QUFBQSxRQUNqRSxTQUFTLEVBQUUsTUFBTSxXQUFXLE9BQU8sV0FBVyxTQUFTLEtBQUs7QUFBQSxRQUM1RCxPQUFPLEVBQUUsTUFBTSxVQUFVLE9BQU8sU0FBUyxNQUFNLENBQUMsT0FBTyxPQUFPLEdBQUcsV0FBVyxDQUFDLE9BQU8sT0FB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
