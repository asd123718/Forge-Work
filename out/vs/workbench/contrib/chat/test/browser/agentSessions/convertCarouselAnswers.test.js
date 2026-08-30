import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ChatInputQuestionKind, SessionInputAnswerState, SessionInputAnswerValueKind } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { convertCarouselAnswers } from "../../../browser/agentSessions/agentHost/agentHostSessionHandler.js";
suite("convertCarouselAnswers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("converts string answer to text", () => {
    const result = convertCarouselAnswers({ "q1": "hello" });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Text, value: "hello" }
      }
    });
  });
  test("converts single-select answer", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValue: "opt-1" } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Selected, value: "opt-1", freeformValues: void 0 }
      }
    });
  });
  test("converts single-select answer with freeform", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValue: "opt-1", freeformValue: "custom" } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Selected, value: "opt-1", freeformValues: ["custom"] }
      }
    });
  });
  test("converts boolean single-select answer", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValue: "false" } }, [{
      kind: ChatInputQuestionKind.Boolean,
      id: "q1",
      message: "Enable the feature?"
    }]);
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Boolean, value: false }
      }
    });
  });
  test("converts multi-select answer", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValues: ["a", "b"] } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.SelectedMany, value: ["a", "b"], freeformValues: void 0 }
      }
    });
  });
  test("converts multi-select answer with freeform", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValues: ["a"], freeformValue: "extra" } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.SelectedMany, value: ["a"], freeformValues: ["extra"] }
      }
    });
  });
  test("converts freeform-only answer", () => {
    const result = convertCarouselAnswers({ "q1": { freeformValue: "something" } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Text, value: "something" }
      }
    });
  });
  test("handles multiple questions", () => {
    const result = convertCarouselAnswers({
      "q1": "text",
      "q2": { selectedValue: "opt" },
      "q3": { selectedValues: ["a"] }
    });
    assert.strictEqual(Object.keys(result).length, 3);
    assert.strictEqual(result["q1"].state, SessionInputAnswerState.Submitted);
    assert.strictEqual(result["q2"].state, SessionInputAnswerState.Submitted);
    assert.strictEqual(result["q3"].state, SessionInputAnswerState.Submitted);
  });
  test("skips empty object answers", () => {
    const result = convertCarouselAnswers({ "q1": {} });
    assert.strictEqual(Object.keys(result).length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGNvbnZlcnRDYXJvdXNlbEFuc3dlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0UXVlc3Rpb25LaW5kLCBTZXNzaW9uSW5wdXRBbnN3ZXJTdGF0ZSwgU2Vzc2lvbklucHV0QW5zd2VyVmFsdWVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgY29udmVydENhcm91c2VsQW5zd2VycyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuanMnO1xuXG5zdWl0ZSgnY29udmVydENhcm91c2VsQW5zd2VycycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBzdHJpbmcgYW5zd2VyIHRvIHRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydENhcm91c2VsQW5zd2Vycyh7ICdxMSc6ICdoZWxsbycgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdCdxMSc6IHtcblx0XHRcdFx0c3RhdGU6IFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0dmFsdWU6IHsga2luZDogU2Vzc2lvbklucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnaGVsbG8nIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgc2luZ2xlLXNlbGVjdCBhbnN3ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydENhcm91c2VsQW5zd2Vycyh7ICdxMSc6IHsgc2VsZWN0ZWRWYWx1ZTogJ29wdC0xJyB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHQncTEnOiB7XG5cdFx0XHRcdHN0YXRlOiBTZXNzaW9uSW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IFNlc3Npb25JbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZCwgdmFsdWU6ICdvcHQtMScsIGZyZWVmb3JtVmFsdWVzOiB1bmRlZmluZWQgfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBzaW5nbGUtc2VsZWN0IGFuc3dlciB3aXRoIGZyZWVmb3JtJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRDYXJvdXNlbEFuc3dlcnMoeyAncTEnOiB7IHNlbGVjdGVkVmFsdWU6ICdvcHQtMScsIGZyZWVmb3JtVmFsdWU6ICdjdXN0b20nIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdCdxMSc6IHtcblx0XHRcdFx0c3RhdGU6IFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0dmFsdWU6IHsga2luZDogU2Vzc2lvbklucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLCB2YWx1ZTogJ29wdC0xJywgZnJlZWZvcm1WYWx1ZXM6IFsnY3VzdG9tJ10gfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBib29sZWFuIHNpbmdsZS1zZWxlY3QgYW5zd2VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRDYXJvdXNlbEFuc3dlcnMoeyAncTEnOiB7IHNlbGVjdGVkVmFsdWU6ICdmYWxzZScgfSB9LCBbe1xuXHRcdFx0a2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLkJvb2xlYW4sXG5cdFx0XHRpZDogJ3ExJyxcblx0XHRcdG1lc3NhZ2U6ICdFbmFibGUgdGhlIGZlYXR1cmU/Jyxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdCdxMSc6IHtcblx0XHRcdFx0c3RhdGU6IFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0dmFsdWU6IHsga2luZDogU2Vzc2lvbklucHV0QW5zd2VyVmFsdWVLaW5kLkJvb2xlYW4sIHZhbHVlOiBmYWxzZSB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIG11bHRpLXNlbGVjdCBhbnN3ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydENhcm91c2VsQW5zd2Vycyh7ICdxMSc6IHsgc2VsZWN0ZWRWYWx1ZXM6IFsnYScsICdiJ10gfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0J3ExJzoge1xuXHRcdFx0XHRzdGF0ZTogU2Vzc2lvbklucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHR2YWx1ZTogeyBraW5kOiBTZXNzaW9uSW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LCB2YWx1ZTogWydhJywgJ2InXSwgZnJlZWZvcm1WYWx1ZXM6IHVuZGVmaW5lZCB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIG11bHRpLXNlbGVjdCBhbnN3ZXIgd2l0aCBmcmVlZm9ybScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHsgJ3ExJzogeyBzZWxlY3RlZFZhbHVlczogWydhJ10sIGZyZWVmb3JtVmFsdWU6ICdleHRyYScgfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0J3ExJzoge1xuXHRcdFx0XHRzdGF0ZTogU2Vzc2lvbklucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHR2YWx1ZTogeyBraW5kOiBTZXNzaW9uSW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LCB2YWx1ZTogWydhJ10sIGZyZWVmb3JtVmFsdWVzOiBbJ2V4dHJhJ10gfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBmcmVlZm9ybS1vbmx5IGFuc3dlcicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHsgJ3ExJzogeyBmcmVlZm9ybVZhbHVlOiAnc29tZXRoaW5nJyB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHQncTEnOiB7XG5cdFx0XHRcdHN0YXRlOiBTZXNzaW9uSW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IFNlc3Npb25JbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ3NvbWV0aGluZycgfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG11bHRpcGxlIHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHtcblx0XHRcdCdxMSc6ICd0ZXh0Jyxcblx0XHRcdCdxMic6IHsgc2VsZWN0ZWRWYWx1ZTogJ29wdCcgfSxcblx0XHRcdCdxMyc6IHsgc2VsZWN0ZWRWYWx1ZXM6IFsnYSddIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5rZXlzKHJlc3VsdCkubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WydxMSddLnN0YXRlLCBTZXNzaW9uSW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbJ3EyJ10uc3RhdGUsIFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsncTMnXS5zdGF0ZSwgU2Vzc2lvbklucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgZW1wdHkgb2JqZWN0IGFuc3dlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydENhcm91c2VsQW5zd2Vycyh7ICdxMSc6IHt9IGFzIFJlY29yZDxzdHJpbmcsIG5ldmVyPiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LmtleXMocmVzdWx0KS5sZW5ndGgsIDApO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJB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
