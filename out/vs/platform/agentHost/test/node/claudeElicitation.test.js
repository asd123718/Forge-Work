import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputRequestPurpose, ChatInputResponseKind } from "../../common/state/sessionState.js";
import { buildElicitationRequest, cancelledElicitationResult, elicitationResultFromAnswers } from "../../node/claude/claudeElicitation.js";
import { handleElicitation } from "../../node/claude/claudeElicitationBridge.js";
suite("claudeElicitation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const formRequest = {
    serverName: "srv",
    message: "Please configure",
    mode: "form",
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
  const urlRequest = {
    serverName: "srv",
    message: "Authorize",
    mode: "url",
    url: "https://example.com/auth",
    elicitationId: "e1"
  };
  test("buildElicitationRequest (form) projects every primitive field kind", () => {
    assert.deepStrictEqual(buildElicitationRequest("req-1", formRequest), {
      id: "req-1",
      purpose: ChatInputRequestPurpose.Elicitation,
      message: "Please configure",
      questions: [
        { kind: ChatInputQuestionKind.Text, id: "name", title: "Name", message: "Your name", required: true, format: void 0, min: 1, max: void 0, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Integer, id: "count", title: "Count", message: "Count", required: true, min: 0, max: 9, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Boolean, id: "enabled", title: "Enabled", message: "Enabled", required: false, defaultValue: true },
        { kind: ChatInputQuestionKind.SingleSelect, id: "color", title: "Color", message: "Color", required: false, allowFreeformInput: false, options: [{ id: "red", label: "Red" }, { id: "green", label: "Green" }] },
        { kind: ChatInputQuestionKind.SingleSelect, id: "size", title: "Size", message: "Size", required: false, allowFreeformInput: false, options: [{ id: "s", label: "Small" }, { id: "l", label: "Large" }] },
        { kind: ChatInputQuestionKind.MultiSelect, id: "tags", title: "Tags", message: "Tags", required: false, allowFreeformInput: false, options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], min: void 0, max: void 0 }
      ]
    });
  });
  test("buildElicitationRequest (url) surfaces the url with no questions", () => {
    assert.deepStrictEqual(buildElicitationRequest("req-2", urlRequest), {
      id: "req-2",
      purpose: ChatInputRequestPurpose.Elicitation,
      message: "Authorize",
      url: "https://example.com/auth"
    });
  });
  test("buildElicitationRequest degrades a malformed schema to a message-only request", () => {
    const malformed = {
      serverName: "srv",
      message: "Broken",
      mode: "form",
      requestedSchema: { type: "object", properties: "not-an-object" }
    };
    assert.deepStrictEqual(buildElicitationRequest("req-3", malformed), { id: "req-3", purpose: ChatInputRequestPurpose.Elicitation, message: "Broken" });
  });
  test("buildElicitationRequest drops a field that fails validation but keeps valid siblings", () => {
    const mixed = {
      serverName: "srv",
      message: "Mixed",
      mode: "form",
      requestedSchema: {
        type: "object",
        properties: {
          // `enum` must be a string array — a bare string is malformed and would
          // otherwise reach `.map` and throw. It is dropped by validation.
          broken: { type: "string", title: "Broken", enum: "red" },
          ok: { type: "string", title: "Ok" }
        }
      }
    };
    assert.deepStrictEqual(buildElicitationRequest("req-4", mixed), {
      id: "req-4",
      purpose: ChatInputRequestPurpose.Elicitation,
      message: "Mixed",
      questions: [
        { kind: ChatInputQuestionKind.Text, id: "ok", title: "Ok", message: "Ok", required: false, format: void 0, min: void 0, max: void 0, defaultValue: void 0 }
      ]
    });
  });
  test("buildElicitationRequest (form) projects the remaining field variants", () => {
    const variants = {
      serverName: "srv",
      message: "Variants",
      mode: "form",
      requestedSchema: {
        type: "object",
        properties: {
          ratio: { type: "number", title: "Ratio", minimum: 0, maximum: 1, default: 0.5 },
          langs: { type: "array", title: "Langs", items: { anyOf: [{ const: "ts", title: "TypeScript" }, { const: "go", title: "Go" }] }, minItems: 1, maxItems: 2 },
          plain: { type: "string", title: "Plain", enum: ["a", "b"] },
          email: { type: "string", title: "Email", description: "Your email", format: "email", maxLength: 50, default: "x@y.z" },
          mystery: { type: "widget", title: "Mystery" },
          freeText: { title: "Free" }
        }
      }
    };
    assert.deepStrictEqual(buildElicitationRequest("req-5", variants), {
      id: "req-5",
      purpose: ChatInputRequestPurpose.Elicitation,
      message: "Variants",
      questions: [
        { kind: ChatInputQuestionKind.Number, id: "ratio", title: "Ratio", message: "Ratio", required: false, min: 0, max: 1, defaultValue: 0.5 },
        { kind: ChatInputQuestionKind.MultiSelect, id: "langs", title: "Langs", message: "Langs", required: false, allowFreeformInput: false, options: [{ id: "ts", label: "TypeScript" }, { id: "go", label: "Go" }], min: 1, max: 2 },
        { kind: ChatInputQuestionKind.SingleSelect, id: "plain", title: "Plain", message: "Plain", required: false, allowFreeformInput: false, options: [{ id: "a", label: "a" }, { id: "b", label: "b" }] },
        { kind: ChatInputQuestionKind.Text, id: "email", title: "Email", message: "Your email", required: false, format: "email", min: void 0, max: 50, defaultValue: "x@y.z" },
        { kind: ChatInputQuestionKind.Text, id: "mystery", title: "Mystery", message: "Mystery", required: false, format: void 0, min: void 0, max: void 0, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Text, id: "freeText", title: "Free", message: "Free", required: false, format: void 0, min: void 0, max: void 0, defaultValue: void 0 }
      ]
    });
  });
  test("buildElicitationRequest degrades every empty/broken form to a message-only request", () => {
    const cases = {
      // `url` mode without a url field
      urlNoUrl: buildElicitationRequest("a", { serverName: "srv", message: "NoUrl", mode: "url" }),
      // `form` mode with no requestedSchema at all
      formNoSchema: buildElicitationRequest("b", { serverName: "srv", message: "NoSchema", mode: "form" }),
      // `form` mode with an empty properties object
      formEmptyProps: buildElicitationRequest("c", { serverName: "srv", message: "Empty", mode: "form", requestedSchema: { type: "object", properties: {} } }),
      // `form` mode where every field fails validation and is dropped
      formAllInvalid: buildElicitationRequest("d", { serverName: "srv", message: "AllBad", mode: "form", requestedSchema: { type: "object", properties: { a: { type: "string", enum: 123 }, b: { minimum: "nope" } } } })
    };
    assert.deepStrictEqual(cases, {
      urlNoUrl: { id: "a", purpose: ChatInputRequestPurpose.Elicitation, message: "NoUrl" },
      formNoSchema: { id: "b", purpose: ChatInputRequestPurpose.Elicitation, message: "NoSchema" },
      formEmptyProps: { id: "c", purpose: ChatInputRequestPurpose.Elicitation, message: "Empty" },
      formAllInvalid: { id: "d", purpose: ChatInputRequestPurpose.Elicitation, message: "AllBad" }
    });
  });
  test("elicitationResultFromAnswers maps decline/cancel/accept", () => {
    const accepted = {
      name: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "Ada" } },
      count: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 3 } },
      enabled: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: false } },
      color: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: "red" } },
      tags: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ["a", "b"] } },
      size: { state: ChatInputAnswerState.Skipped }
    };
    assert.deepStrictEqual({
      decline: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Decline, void 0),
      cancel: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Cancel, void 0),
      accept: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Accept, accepted)
    }, {
      decline: { action: "decline" },
      cancel: { action: "cancel" },
      accept: { action: "accept", content: { name: "Ada", count: 3, enabled: false, color: "red", tags: ["a", "b"] } }
    });
  });
  test("elicitationResultFromAnswers (url accept) carries no content", () => {
    assert.deepStrictEqual(
      elicitationResultFromAnswers(urlRequest, ChatInputResponseKind.Accept, void 0),
      { action: "accept" }
    );
  });
  test("elicitationResultFromAnswers accept edge cases: broken form omits content, empty answers yield empty content", () => {
    const brokenForm = { serverName: "srv", message: "x", mode: "form", requestedSchema: { properties: "nope" } };
    assert.deepStrictEqual({
      // Accepting a form whose schema can't be parsed → no content object.
      brokenAccept: elicitationResultFromAnswers(brokenForm, ChatInputResponseKind.Accept, void 0),
      // Accepting a valid form with no answers → an empty content object.
      emptyAnswers: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Accept, void 0)
    }, {
      brokenAccept: { action: "accept" },
      emptyAnswers: { action: "accept", content: {} }
    });
  });
  test("elicitationResultFromAnswers coerces text answers to the field schema type", () => {
    const request = {
      serverName: "srv",
      message: "Coerce",
      mode: "form",
      requestedSchema: {
        type: "object",
        properties: {
          count: { type: "integer" },
          ratio: { type: "number" },
          flag: { type: "boolean" },
          pick: { type: "string", enum: ["a", "b"] },
          bad: { type: "integer" }
        }
      }
    };
    const answers = {
      count: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "3" } },
      ratio: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "0.5" } },
      flag: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "false" } },
      pick: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: "a" } },
      bad: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "not-a-number" } }
    };
    assert.deepStrictEqual(
      elicitationResultFromAnswers(request, ChatInputResponseKind.Accept, answers),
      { action: "accept", content: { count: 3, ratio: 0.5, flag: false, pick: "a" } }
    );
  });
  test("elicitationResultFromAnswers is safe against prototype-polluting field names", () => {
    const properties = JSON.parse('{"__proto__":{"type":"string"},"constructor":{"type":"string"},"ok":{"type":"string"}}');
    const request = { serverName: "srv", message: "x", mode: "form", requestedSchema: { type: "object", properties } };
    const answers = { ok: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "yes" } } };
    assert.deepStrictEqual(
      elicitationResultFromAnswers(request, ChatInputResponseKind.Accept, answers),
      { action: "accept", content: { ok: "yes" } }
    );
  });
  test("cancelledElicitationResult is a plain cancel", () => {
    assert.deepStrictEqual(cancelledElicitationResult(), { action: "cancel" });
  });
  test("handleElicitation cancels when the session lookup misses", async () => {
    const result = await handleElicitation(
      { getSession: () => void 0 },
      "missing-session",
      { serverName: "srv", message: "q", mode: "form", requestedSchema: { type: "object", properties: { side: { type: "string" } } } },
      { signal: new AbortController().signal }
    );
    assert.deepStrictEqual(result, { action: "cancel" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVFbGljaXRhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBFbGljaXRhdGlvblJlcXVlc3QgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIHR5cGUgQ2hhdElucHV0QW5zd2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCwgY2FuY2VsbGVkRWxpY2l0YXRpb25SZXN1bHQsIGVsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVFbGljaXRhdGlvbi5qcyc7XG5pbXBvcnQgeyBoYW5kbGVFbGljaXRhdGlvbiB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZUVsaWNpdGF0aW9uQnJpZGdlLmpzJztcblxuc3VpdGUoJ2NsYXVkZUVsaWNpdGF0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGZvcm1SZXF1ZXN0OiBFbGljaXRhdGlvblJlcXVlc3QgPSB7XG5cdFx0c2VydmVyTmFtZTogJ3NydicsXG5cdFx0bWVzc2FnZTogJ1BsZWFzZSBjb25maWd1cmUnLFxuXHRcdG1vZGU6ICdmb3JtJyxcblx0XHRyZXF1ZXN0ZWRTY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cmVxdWlyZWQ6IFsnbmFtZScsICdjb3VudCddLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ05hbWUnLCBkZXNjcmlwdGlvbjogJ1lvdXIgbmFtZScsIG1pbkxlbmd0aDogMSB9LFxuXHRcdFx0XHRjb3VudDogeyB0eXBlOiAnaW50ZWdlcicsIHRpdGxlOiAnQ291bnQnLCBtaW5pbXVtOiAwLCBtYXhpbXVtOiA5IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHsgdHlwZTogJ2Jvb2xlYW4nLCB0aXRsZTogJ0VuYWJsZWQnLCBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdGNvbG9yOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0NvbG9yJywgZW51bTogWydyZWQnLCAnZ3JlZW4nXSwgZW51bU5hbWVzOiBbJ1JlZCcsICdHcmVlbiddIH0sXG5cdFx0XHRcdHNpemU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnU2l6ZScsIG9uZU9mOiBbeyBjb25zdDogJ3MnLCB0aXRsZTogJ1NtYWxsJyB9LCB7IGNvbnN0OiAnbCcsIHRpdGxlOiAnTGFyZ2UnIH1dIH0sXG5cdFx0XHRcdHRhZ3M6IHsgdHlwZTogJ2FycmF5JywgdGl0bGU6ICdUYWdzJywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIGVudW06IFsnYScsICdiJ10gfSB9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHR9O1xuXG5cdGNvbnN0IHVybFJlcXVlc3Q6IEVsaWNpdGF0aW9uUmVxdWVzdCA9IHtcblx0XHRzZXJ2ZXJOYW1lOiAnc3J2Jyxcblx0XHRtZXNzYWdlOiAnQXV0aG9yaXplJyxcblx0XHRtb2RlOiAndXJsJyxcblx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2F1dGgnLFxuXHRcdGVsaWNpdGF0aW9uSWQ6ICdlMScsXG5cdH07XG5cblx0dGVzdCgnYnVpbGRFbGljaXRhdGlvblJlcXVlc3QgKGZvcm0pIHByb2plY3RzIGV2ZXJ5IHByaW1pdGl2ZSBmaWVsZCBraW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ3JlcS0xJywgZm9ybVJlcXVlc3QpLCB7XG5cdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkVsaWNpdGF0aW9uLFxuXHRcdFx0bWVzc2FnZTogJ1BsZWFzZSBjb25maWd1cmUnLFxuXHRcdFx0cXVlc3Rpb25zOiBbXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsIGlkOiAnbmFtZScsIHRpdGxlOiAnTmFtZScsIG1lc3NhZ2U6ICdZb3VyIG5hbWUnLCByZXF1aXJlZDogdHJ1ZSwgZm9ybWF0OiB1bmRlZmluZWQsIG1pbjogMSwgbWF4OiB1bmRlZmluZWQsIGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLkludGVnZXIsIGlkOiAnY291bnQnLCB0aXRsZTogJ0NvdW50JywgbWVzc2FnZTogJ0NvdW50JywgcmVxdWlyZWQ6IHRydWUsIG1pbjogMCwgbWF4OiA5LCBkZWZhdWx0VmFsdWU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5Cb29sZWFuLCBpZDogJ2VuYWJsZWQnLCB0aXRsZTogJ0VuYWJsZWQnLCBtZXNzYWdlOiAnRW5hYmxlZCcsIHJlcXVpcmVkOiBmYWxzZSwgZGVmYXVsdFZhbHVlOiB0cnVlIH0sXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdCwgaWQ6ICdjb2xvcicsIHRpdGxlOiAnQ29sb3InLCBtZXNzYWdlOiAnQ29sb3InLCByZXF1aXJlZDogZmFsc2UsIGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsIG9wdGlvbnM6IFt7IGlkOiAncmVkJywgbGFiZWw6ICdSZWQnIH0sIHsgaWQ6ICdncmVlbicsIGxhYmVsOiAnR3JlZW4nIH1dIH0sXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdCwgaWQ6ICdzaXplJywgdGl0bGU6ICdTaXplJywgbWVzc2FnZTogJ1NpemUnLCByZXF1aXJlZDogZmFsc2UsIGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsIG9wdGlvbnM6IFt7IGlkOiAncycsIGxhYmVsOiAnU21hbGwnIH0sIHsgaWQ6ICdsJywgbGFiZWw6ICdMYXJnZScgfV0gfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTXVsdGlTZWxlY3QsIGlkOiAndGFncycsIHRpdGxlOiAnVGFncycsIG1lc3NhZ2U6ICdUYWdzJywgcmVxdWlyZWQ6IGZhbHNlLCBhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLCBvcHRpb25zOiBbeyBpZDogJ2EnLCBsYWJlbDogJ2EnIH0sIHsgaWQ6ICdiJywgbGFiZWw6ICdiJyB9XSwgbWluOiB1bmRlZmluZWQsIG1heDogdW5kZWZpbmVkIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCAodXJsKSBzdXJmYWNlcyB0aGUgdXJsIHdpdGggbm8gcXVlc3Rpb25zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ3JlcS0yJywgdXJsUmVxdWVzdCksIHtcblx0XHRcdGlkOiAncmVxLTInLFxuXHRcdFx0cHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuRWxpY2l0YXRpb24sXG5cdFx0XHRtZXNzYWdlOiAnQXV0aG9yaXplJyxcblx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXV0aCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkRWxpY2l0YXRpb25SZXF1ZXN0IGRlZ3JhZGVzIGEgbWFsZm9ybWVkIHNjaGVtYSB0byBhIG1lc3NhZ2Utb25seSByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbGZvcm1lZDogRWxpY2l0YXRpb25SZXF1ZXN0ID0ge1xuXHRcdFx0c2VydmVyTmFtZTogJ3NydicsXG5cdFx0XHRtZXNzYWdlOiAnQnJva2VuJyxcblx0XHRcdG1vZGU6ICdmb3JtJyxcblx0XHRcdHJlcXVlc3RlZFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogJ25vdC1hbi1vYmplY3QnIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ3JlcS0zJywgbWFsZm9ybWVkKSwgeyBpZDogJ3JlcS0zJywgcHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuRWxpY2l0YXRpb24sIG1lc3NhZ2U6ICdCcm9rZW4nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCBkcm9wcyBhIGZpZWxkIHRoYXQgZmFpbHMgdmFsaWRhdGlvbiBidXQga2VlcHMgdmFsaWQgc2libGluZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWl4ZWQ6IEVsaWNpdGF0aW9uUmVxdWVzdCA9IHtcblx0XHRcdHNlcnZlck5hbWU6ICdzcnYnLFxuXHRcdFx0bWVzc2FnZTogJ01peGVkJyxcblx0XHRcdG1vZGU6ICdmb3JtJyxcblx0XHRcdHJlcXVlc3RlZFNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdC8vIGBlbnVtYCBtdXN0IGJlIGEgc3RyaW5nIGFycmF5IFx1MjAxNCBhIGJhcmUgc3RyaW5nIGlzIG1hbGZvcm1lZCBhbmQgd291bGRcblx0XHRcdFx0XHQvLyBvdGhlcndpc2UgcmVhY2ggYC5tYXBgIGFuZCB0aHJvdy4gSXQgaXMgZHJvcHBlZCBieSB2YWxpZGF0aW9uLlxuXHRcdFx0XHRcdGJyb2tlbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdCcm9rZW4nLCBlbnVtOiAncmVkJyB9LFxuXHRcdFx0XHRcdG9rOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ09rJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ3JlcS00JywgbWl4ZWQpLCB7XG5cdFx0XHRpZDogJ3JlcS00Jyxcblx0XHRcdHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkVsaWNpdGF0aW9uLFxuXHRcdFx0bWVzc2FnZTogJ01peGVkJyxcblx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0LCBpZDogJ29rJywgdGl0bGU6ICdPaycsIG1lc3NhZ2U6ICdPaycsIHJlcXVpcmVkOiBmYWxzZSwgZm9ybWF0OiB1bmRlZmluZWQsIG1pbjogdW5kZWZpbmVkLCBtYXg6IHVuZGVmaW5lZCwgZGVmYXVsdFZhbHVlOiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkRWxpY2l0YXRpb25SZXF1ZXN0IChmb3JtKSBwcm9qZWN0cyB0aGUgcmVtYWluaW5nIGZpZWxkIHZhcmlhbnRzJywgKCkgPT4ge1xuXHRcdC8vIENvbXBsZW1lbnRzIHRoZSBjYW5vbmljYWwgZml4dHVyZSBhYm92ZTogbnVtYmVyIChub24taW50ZWdlciksIHRpdGxlZFxuXHRcdC8vIG11bHRpLXNlbGVjdCAoYGl0ZW1zLmFueU9mYCArIG1pbi9tYXhJdGVtcyksIHBsYWluIGVudW0gKG5vIGVudW1OYW1lcyksXG5cdFx0Ly8gcmljaCB0ZXh0IChmb3JtYXQvbWF4TGVuZ3RoL3N0cmluZyBkZWZhdWx0KSwgYW4gdW5rbm93biBgdHlwZWAsIGFuZCBhXG5cdFx0Ly8gbWlzc2luZyBgdHlwZWAgXHUyMDE0IHRoZSBsYXN0IHR3byBmYWxsIGJhY2sgdG8gYSBwbGFpbiB0ZXh0IGZpZWxkLlxuXHRcdGNvbnN0IHZhcmlhbnRzOiBFbGljaXRhdGlvblJlcXVlc3QgPSB7XG5cdFx0XHRzZXJ2ZXJOYW1lOiAnc3J2Jyxcblx0XHRcdG1lc3NhZ2U6ICdWYXJpYW50cycsXG5cdFx0XHRtb2RlOiAnZm9ybScsXG5cdFx0XHRyZXF1ZXN0ZWRTY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRyYXRpbzogeyB0eXBlOiAnbnVtYmVyJywgdGl0bGU6ICdSYXRpbycsIG1pbmltdW06IDAsIG1heGltdW06IDEsIGRlZmF1bHQ6IDAuNSB9LFxuXHRcdFx0XHRcdGxhbmdzOiB7IHR5cGU6ICdhcnJheScsIHRpdGxlOiAnTGFuZ3MnLCBpdGVtczogeyBhbnlPZjogW3sgY29uc3Q6ICd0cycsIHRpdGxlOiAnVHlwZVNjcmlwdCcgfSwgeyBjb25zdDogJ2dvJywgdGl0bGU6ICdHbycgfV0gfSwgbWluSXRlbXM6IDEsIG1heEl0ZW1zOiAyIH0sXG5cdFx0XHRcdFx0cGxhaW46IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnUGxhaW4nLCBlbnVtOiBbJ2EnLCAnYiddIH0sXG5cdFx0XHRcdFx0ZW1haWw6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnRW1haWwnLCBkZXNjcmlwdGlvbjogJ1lvdXIgZW1haWwnLCBmb3JtYXQ6ICdlbWFpbCcsIG1heExlbmd0aDogNTAsIGRlZmF1bHQ6ICd4QHkueicgfSxcblx0XHRcdFx0XHRteXN0ZXJ5OiB7IHR5cGU6ICd3aWRnZXQnLCB0aXRsZTogJ015c3RlcnknIH0sXG5cdFx0XHRcdFx0ZnJlZVRleHQ6IHsgdGl0bGU6ICdGcmVlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ3JlcS01JywgdmFyaWFudHMpLCB7XG5cdFx0XHRpZDogJ3JlcS01Jyxcblx0XHRcdHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkVsaWNpdGF0aW9uLFxuXHRcdFx0bWVzc2FnZTogJ1ZhcmlhbnRzJyxcblx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5OdW1iZXIsIGlkOiAncmF0aW8nLCB0aXRsZTogJ1JhdGlvJywgbWVzc2FnZTogJ1JhdGlvJywgcmVxdWlyZWQ6IGZhbHNlLCBtaW46IDAsIG1heDogMSwgZGVmYXVsdFZhbHVlOiAwLjUgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTXVsdGlTZWxlY3QsIGlkOiAnbGFuZ3MnLCB0aXRsZTogJ0xhbmdzJywgbWVzc2FnZTogJ0xhbmdzJywgcmVxdWlyZWQ6IGZhbHNlLCBhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLCBvcHRpb25zOiBbeyBpZDogJ3RzJywgbGFiZWw6ICdUeXBlU2NyaXB0JyB9LCB7IGlkOiAnZ28nLCBsYWJlbDogJ0dvJyB9XSwgbWluOiAxLCBtYXg6IDIgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LCBpZDogJ3BsYWluJywgdGl0bGU6ICdQbGFpbicsIG1lc3NhZ2U6ICdQbGFpbicsIHJlcXVpcmVkOiBmYWxzZSwgYWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSwgb3B0aW9uczogW3sgaWQ6ICdhJywgbGFiZWw6ICdhJyB9LCB7IGlkOiAnYicsIGxhYmVsOiAnYicgfV0gfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCwgaWQ6ICdlbWFpbCcsIHRpdGxlOiAnRW1haWwnLCBtZXNzYWdlOiAnWW91ciBlbWFpbCcsIHJlcXVpcmVkOiBmYWxzZSwgZm9ybWF0OiAnZW1haWwnLCBtaW46IHVuZGVmaW5lZCwgbWF4OiA1MCwgZGVmYXVsdFZhbHVlOiAneEB5LnonIH0sXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsIGlkOiAnbXlzdGVyeScsIHRpdGxlOiAnTXlzdGVyeScsIG1lc3NhZ2U6ICdNeXN0ZXJ5JywgcmVxdWlyZWQ6IGZhbHNlLCBmb3JtYXQ6IHVuZGVmaW5lZCwgbWluOiB1bmRlZmluZWQsIG1heDogdW5kZWZpbmVkLCBkZWZhdWx0VmFsdWU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0LCBpZDogJ2ZyZWVUZXh0JywgdGl0bGU6ICdGcmVlJywgbWVzc2FnZTogJ0ZyZWUnLCByZXF1aXJlZDogZmFsc2UsIGZvcm1hdDogdW5kZWZpbmVkLCBtaW46IHVuZGVmaW5lZCwgbWF4OiB1bmRlZmluZWQsIGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCBkZWdyYWRlcyBldmVyeSBlbXB0eS9icm9rZW4gZm9ybSB0byBhIG1lc3NhZ2Utb25seSByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhc2VzID0ge1xuXHRcdFx0Ly8gYHVybGAgbW9kZSB3aXRob3V0IGEgdXJsIGZpZWxkXG5cdFx0XHR1cmxOb1VybDogYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ2EnLCB7IHNlcnZlck5hbWU6ICdzcnYnLCBtZXNzYWdlOiAnTm9VcmwnLCBtb2RlOiAndXJsJyB9KSxcblx0XHRcdC8vIGBmb3JtYCBtb2RlIHdpdGggbm8gcmVxdWVzdGVkU2NoZW1hIGF0IGFsbFxuXHRcdFx0Zm9ybU5vU2NoZW1hOiBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgnYicsIHsgc2VydmVyTmFtZTogJ3NydicsIG1lc3NhZ2U6ICdOb1NjaGVtYScsIG1vZGU6ICdmb3JtJyB9KSxcblx0XHRcdC8vIGBmb3JtYCBtb2RlIHdpdGggYW4gZW1wdHkgcHJvcGVydGllcyBvYmplY3Rcblx0XHRcdGZvcm1FbXB0eVByb3BzOiBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgnYycsIHsgc2VydmVyTmFtZTogJ3NydicsIG1lc3NhZ2U6ICdFbXB0eScsIG1vZGU6ICdmb3JtJywgcmVxdWVzdGVkU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9IH0pLFxuXHRcdFx0Ly8gYGZvcm1gIG1vZGUgd2hlcmUgZXZlcnkgZmllbGQgZmFpbHMgdmFsaWRhdGlvbiBhbmQgaXMgZHJvcHBlZFxuXHRcdFx0Zm9ybUFsbEludmFsaWQ6IGJ1aWxkRWxpY2l0YXRpb25SZXF1ZXN0KCdkJywgeyBzZXJ2ZXJOYW1lOiAnc3J2JywgbWVzc2FnZTogJ0FsbEJhZCcsIG1vZGU6ICdmb3JtJywgcmVxdWVzdGVkU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IGE6IHsgdHlwZTogJ3N0cmluZycsIGVudW06IDEyMyB9LCBiOiB7IG1pbmltdW06ICdub3BlJyB9IH0gfSB9KSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FzZXMsIHtcblx0XHRcdHVybE5vVXJsOiB7IGlkOiAnYScsIHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkVsaWNpdGF0aW9uLCBtZXNzYWdlOiAnTm9VcmwnIH0sXG5cdFx0XHRmb3JtTm9TY2hlbWE6IHsgaWQ6ICdiJywgcHVycG9zZTogQ2hhdElucHV0UmVxdWVzdFB1cnBvc2UuRWxpY2l0YXRpb24sIG1lc3NhZ2U6ICdOb1NjaGVtYScgfSxcblx0XHRcdGZvcm1FbXB0eVByb3BzOiB7IGlkOiAnYycsIHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkVsaWNpdGF0aW9uLCBtZXNzYWdlOiAnRW1wdHknIH0sXG5cdFx0XHRmb3JtQWxsSW52YWxpZDogeyBpZDogJ2QnLCBwdXJwb3NlOiBDaGF0SW5wdXRSZXF1ZXN0UHVycG9zZS5FbGljaXRhdGlvbiwgbWVzc2FnZTogJ0FsbEJhZCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2VycyBtYXBzIGRlY2xpbmUvY2FuY2VsL2FjY2VwdCcsICgpID0+IHtcblx0XHRjb25zdCBhY2NlcHRlZDogUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPiA9IHtcblx0XHRcdG5hbWU6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnQWRhJyB9IH0sXG5cdFx0XHRjb3VudDogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuTnVtYmVyLCB2YWx1ZTogMyB9IH0sXG5cdFx0XHRlbmFibGVkOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5Cb29sZWFuLCB2YWx1ZTogZmFsc2UgfSB9LFxuXHRcdFx0Y29sb3I6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLCB2YWx1ZTogJ3JlZCcgfSB9LFxuXHRcdFx0dGFnczogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LCB2YWx1ZTogWydhJywgJ2InXSB9IH0sXG5cdFx0XHRzaXplOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5Ta2lwcGVkIH0sXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlY2xpbmU6IGVsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMoZm9ybVJlcXVlc3QsIENoYXRJbnB1dFJlc3BvbnNlS2luZC5EZWNsaW5lLCB1bmRlZmluZWQpLFxuXHRcdFx0Y2FuY2VsOiBlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzKGZvcm1SZXF1ZXN0LCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsLCB1bmRlZmluZWQpLFxuXHRcdFx0YWNjZXB0OiBlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzKGZvcm1SZXF1ZXN0LCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LCBhY2NlcHRlZCksXG5cdFx0fSwge1xuXHRcdFx0ZGVjbGluZTogeyBhY3Rpb246ICdkZWNsaW5lJyB9LFxuXHRcdFx0Y2FuY2VsOiB7IGFjdGlvbjogJ2NhbmNlbCcgfSxcblx0XHRcdGFjY2VwdDogeyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50OiB7IG5hbWU6ICdBZGEnLCBjb3VudDogMywgZW5hYmxlZDogZmFsc2UsIGNvbG9yOiAncmVkJywgdGFnczogWydhJywgJ2InXSB9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMgKHVybCBhY2NlcHQpIGNhcnJpZXMgbm8gY29udGVudCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0ZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2Vycyh1cmxSZXF1ZXN0LCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LCB1bmRlZmluZWQpLFxuXHRcdFx0eyBhY3Rpb246ICdhY2NlcHQnIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2VycyBhY2NlcHQgZWRnZSBjYXNlczogYnJva2VuIGZvcm0gb21pdHMgY29udGVudCwgZW1wdHkgYW5zd2VycyB5aWVsZCBlbXB0eSBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGJyb2tlbkZvcm06IEVsaWNpdGF0aW9uUmVxdWVzdCA9IHsgc2VydmVyTmFtZTogJ3NydicsIG1lc3NhZ2U6ICd4JywgbW9kZTogJ2Zvcm0nLCByZXF1ZXN0ZWRTY2hlbWE6IHsgcHJvcGVydGllczogJ25vcGUnIH0gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdC8vIEFjY2VwdGluZyBhIGZvcm0gd2hvc2Ugc2NoZW1hIGNhbid0IGJlIHBhcnNlZCBcdTIxOTIgbm8gY29udGVudCBvYmplY3QuXG5cdFx0XHRicm9rZW5BY2NlcHQ6IGVsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMoYnJva2VuRm9ybSwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwgdW5kZWZpbmVkKSxcblx0XHRcdC8vIEFjY2VwdGluZyBhIHZhbGlkIGZvcm0gd2l0aCBubyBhbnN3ZXJzIFx1MjE5MiBhbiBlbXB0eSBjb250ZW50IG9iamVjdC5cblx0XHRcdGVtcHR5QW5zd2VyczogZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2Vycyhmb3JtUmVxdWVzdCwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwgdW5kZWZpbmVkKSxcblx0XHR9LCB7XG5cdFx0XHRicm9rZW5BY2NlcHQ6IHsgYWN0aW9uOiAnYWNjZXB0JyB9LFxuXHRcdFx0ZW1wdHlBbnN3ZXJzOiB7IGFjdGlvbjogJ2FjY2VwdCcsIGNvbnRlbnQ6IHt9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMgY29lcmNlcyB0ZXh0IGFuc3dlcnMgdG8gdGhlIGZpZWxkIHNjaGVtYSB0eXBlJywgKCkgPT4ge1xuXHRcdC8vIFRoZSB3b3JrYmVuY2ggcmVuZGVycyBudW1iZXIvaW50ZWdlci9ib29sZWFuIHF1ZXN0aW9ucyBhcyB0ZXh0IGlucHV0c1xuXHRcdC8vIGFuZCByZXR1cm5zIHRoZW0gYXMgdGV4dCBhbnN3ZXJzLCBzbyBgXCIzXCJgIC8gYFwiMC41XCJgIC8gYFwiZmFsc2VcImAgbXVzdCBiZVxuXHRcdC8vIGNvZXJjZWQgYmFjayB0byB0aGUgc2NoZW1hIHR5cGU7IGFuIHVuY29lcmNpYmxlIHZhbHVlIGlzIGRyb3BwZWQuXG5cdFx0Y29uc3QgcmVxdWVzdDogRWxpY2l0YXRpb25SZXF1ZXN0ID0ge1xuXHRcdFx0c2VydmVyTmFtZTogJ3NydicsIG1lc3NhZ2U6ICdDb2VyY2UnLCBtb2RlOiAnZm9ybScsXG5cdFx0XHRyZXF1ZXN0ZWRTY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRjb3VudDogeyB0eXBlOiAnaW50ZWdlcicgfSxcblx0XHRcdFx0XHRyYXRpbzogeyB0eXBlOiAnbnVtYmVyJyB9LFxuXHRcdFx0XHRcdGZsYWc6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdFx0cGljazogeyB0eXBlOiAnc3RyaW5nJywgZW51bTogWydhJywgJ2InXSB9LFxuXHRcdFx0XHRcdGJhZDogeyB0eXBlOiAnaW50ZWdlcicgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBhbnN3ZXJzOiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+ID0ge1xuXHRcdFx0Y291bnQ6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnMycgfSB9LFxuXHRcdFx0cmF0aW86IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnMC41JyB9IH0sXG5cdFx0XHRmbGFnOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ2ZhbHNlJyB9IH0sXG5cdFx0XHRwaWNrOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZCwgdmFsdWU6ICdhJyB9IH0sXG5cdFx0XHRiYWQ6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnbm90LWEtbnVtYmVyJyB9IH0sXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0ZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2VycyhyZXF1ZXN0LCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LCBhbnN3ZXJzKSxcblx0XHRcdHsgYWN0aW9uOiAnYWNjZXB0JywgY29udGVudDogeyBjb3VudDogMywgcmF0aW86IDAuNSwgZmxhZzogZmFsc2UsIHBpY2s6ICdhJyB9IH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2VycyBpcyBzYWZlIGFnYWluc3QgcHJvdG90eXBlLXBvbGx1dGluZyBmaWVsZCBuYW1lcycsICgpID0+IHtcblx0XHQvLyBKU09OLnBhcnNlIHByb2R1Y2VzIG93biBgX19wcm90b19fYCAvIGBjb25zdHJ1Y3RvcmAga2V5cyAodW5saWtlIGFuIG9iamVjdFxuXHRcdC8vIGxpdGVyYWwpLiBSZWFkaW5nIGFuc3dlcnMgYnkgdGhvc2UgbmFtZXMgbXVzdCB1c2Ugb3duLXByb3BlcnR5IGxvb2t1cCBzbyBhblxuXHRcdC8vIGluaGVyaXRlZCBtZW1iZXIgaXMgbmV2ZXIgcmVhZCAod2hpY2ggd291bGQgY3Jhc2gpLCBhbmQgY29udGVudCBtdXN0IGJlXG5cdFx0Ly8gYnVpbHQgd2l0aG91dCBwcm90b3R5cGUgc2V0dGVycy5cblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gSlNPTi5wYXJzZSgne1wiX19wcm90b19fXCI6e1widHlwZVwiOlwic3RyaW5nXCJ9LFwiY29uc3RydWN0b3JcIjp7XCJ0eXBlXCI6XCJzdHJpbmdcIn0sXCJva1wiOntcInR5cGVcIjpcInN0cmluZ1wifX0nKTtcblx0XHRjb25zdCByZXF1ZXN0OiBFbGljaXRhdGlvblJlcXVlc3QgPSB7IHNlcnZlck5hbWU6ICdzcnYnLCBtZXNzYWdlOiAneCcsIG1vZGU6ICdmb3JtJywgcmVxdWVzdGVkU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzIH0gfTtcblx0XHRjb25zdCBhbnN3ZXJzOiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+ID0geyBvazogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICd5ZXMnIH0gfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzKHJlcXVlc3QsIENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsIGFuc3dlcnMpLFxuXHRcdFx0eyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50OiB7IG9rOiAneWVzJyB9IH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY2FuY2VsbGVkRWxpY2l0YXRpb25SZXN1bHQgaXMgYSBwbGFpbiBjYW5jZWwnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYW5jZWxsZWRFbGljaXRhdGlvblJlc3VsdCgpLCB7IGFjdGlvbjogJ2NhbmNlbCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZUVsaWNpdGF0aW9uIGNhbmNlbHMgd2hlbiB0aGUgc2Vzc2lvbiBsb29rdXAgbWlzc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBTREsgY2FuIGZpcmUgYW4gZWxpY2l0YXRpb24gZm9yIGEgc2Vzc2lvbiB0aGF0IGlzIGFscmVhZHkgZ29uZVxuXHRcdC8vICh0ZWFyZG93biByYWNlKS4gVGhlIGJyaWRnZSByZXR1cm5zIGJlZm9yZSB0b3VjaGluZyBhbnkgc2Vzc2lvbiwgc29cblx0XHQvLyB0aGlzIG5lZWRzIG5vIHNlc3Npb24gXHUyMDE0IGp1c3QgYSBsb29rdXAgdGhhdCBtaXNzZXMuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlRWxpY2l0YXRpb24oXG5cdFx0XHR7IGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCB9LFxuXHRcdFx0J21pc3Npbmctc2Vzc2lvbicsXG5cdFx0XHR7IHNlcnZlck5hbWU6ICdzcnYnLCBtZXNzYWdlOiAncScsIG1vZGU6ICdmb3JtJywgcmVxdWVzdGVkU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IHNpZGU6IHsgdHlwZTogJ3N0cmluZycgfSB9IH0gfSxcblx0XHRcdHsgc2lnbmFsOiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsIH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBh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
