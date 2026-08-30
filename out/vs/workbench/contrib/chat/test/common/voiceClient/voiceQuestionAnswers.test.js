import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { resolveQuestionAnswers } from "../../../common/voiceClient/voiceQuestionAnswers.js";
suite("VoiceQuestionAnswers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const single = {
    id: "q_single",
    type: "singleSelect",
    title: "Which region?",
    required: true,
    options: [
      { id: "o1", label: "West US", value: "westus" },
      { id: "o2", label: "East US", value: "eastus" }
    ]
  };
  const multi = {
    id: "q_multi",
    type: "multiSelect",
    title: "Which features?",
    allowFreeformInput: true,
    options: [
      { id: "o1", label: "Auth", value: "auth" },
      { id: "o2", label: "Search", value: "search" },
      { id: "o3", label: "Billing", value: "billing" }
    ]
  };
  const text = { id: "q_text", type: "text", title: "Anything else?" };
  suite("resolveQuestionAnswers", () => {
    test("accepts freeform when the question omits allowFreeformInput", () => {
      const { allowFreeformInput, ...omitted } = multi;
      assert.deepStrictEqual(
        resolveQuestionAnswers([omitted], [{ question_id: "q_multi", values: ["auth"], freeform: "telemetry" }]),
        { q_multi: { selectedValues: ["auth"], freeformValue: "telemetry" } }
      );
    });
    test("refuses a freeform value the form would reject on submit", () => {
      const validated = { ...text, validation: { minLength: 5 } };
      assert.strictEqual(
        resolveQuestionAnswers([validated], [{ question_id: "q_text", freeform: "no" }]),
        void 0
      );
      assert.deepStrictEqual(
        resolveQuestionAnswers([validated], [{ question_id: "q_text", freeform: "long enough" }]),
        { q_text: "long enough" }
      );
    });
    test("maps an exact single-select value", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single", value: "eastus" }]),
        { q_single: { selectedValue: "eastus" } }
      );
    });
    test("maps exact multi-select values with freeform", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers(
          [multi],
          [{ question_id: "q_multi", values: ["billing", "auth"], freeform: "telemetry" }]
        ),
        { q_multi: { selectedValues: ["billing", "auth"], freeformValue: "telemetry" } }
      );
    });
    test("maps a text answer", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers([text], [{ question_id: "q_text", freeform: "ship it" }]),
        { q_text: "ship it" }
      );
    });
    test("maps a freeform fallback on a select", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers(
          [{ ...single, allowFreeformInput: true }],
          [{ question_id: "q_single", freeform: "Central US" }]
        ),
        { q_single: { freeformValue: "Central US" } }
      );
    });
    test("maps several questions at once", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers(
          [single, text],
          [
            { question_id: "q_single", value: "westus" },
            { question_id: "q_text", freeform: "no" }
          ]
        ),
        { q_single: { selectedValue: "westus" }, q_text: "no" }
      );
    });
    test("rejects a value that is a label rather than an option value", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single", value: "West US" }]),
        void 0
      );
    });
    test("rejects a value that is an option id rather than an option value", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single", value: "o1" }]),
        void 0
      );
    });
    test("rejects an unknown question id", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "nope", value: "westus" }]),
        void 0
      );
    });
    test("rejects the whole set when one multi-select value is unknown", () => {
      assert.strictEqual(
        resolveQuestionAnswers([multi], [{ question_id: "q_multi", values: ["auth", "nope"] }]),
        void 0
      );
    });
    test("rejects freeform on a question that forbids it", () => {
      assert.strictEqual(
        resolveQuestionAnswers(
          [{ ...single, allowFreeformInput: false }],
          [{ question_id: "q_single", freeform: "Central US" }]
        ),
        void 0
      );
    });
    test("rejects an empty answer list", () => {
      assert.strictEqual(resolveQuestionAnswers([single], []), void 0);
    });
    test("rejects an answer that carries nothing", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single" }]),
        void 0
      );
    });
    test("rejects whitespace-only freeform on a text question", () => {
      assert.strictEqual(
        resolveQuestionAnswers([text], [{ question_id: "q_text", freeform: "   " }]),
        void 0
      );
    });
    test("rejects a selection on a text question", () => {
      assert.strictEqual(
        resolveQuestionAnswers([text], [{ question_id: "q_text", value: "anything" }]),
        void 0
      );
    });
    test("rejects a multi-select shape on a single-select question", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single", values: ["westus"] }]),
        void 0
      );
    });
    test("rejects a single-select shape on a multi-select question", () => {
      assert.strictEqual(
        resolveQuestionAnswers([multi], [{ question_id: "q_multi", value: "auth" }]),
        void 0
      );
    });
    test("rejects two answers to the same question", () => {
      assert.strictEqual(
        resolveQuestionAnswers(
          [single],
          [
            { question_id: "q_single", value: "westus" },
            { question_id: "q_single", value: "eastus" }
          ]
        ),
        void 0
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcdm9pY2VDbGllbnRcXHZvaWNlUXVlc3Rpb25BbnN3ZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDaGF0UXVlc3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZVF1ZXN0aW9uQW5zd2VycyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92b2ljZUNsaWVudC92b2ljZVF1ZXN0aW9uQW5zd2Vycy5qcyc7XG5cbnN1aXRlKCdWb2ljZVF1ZXN0aW9uQW5zd2VycycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2luZ2xlOiBJQ2hhdFF1ZXN0aW9uID0ge1xuXHRcdGlkOiAncV9zaW5nbGUnLFxuXHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdHRpdGxlOiAnV2hpY2ggcmVnaW9uPycsXG5cdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0b3B0aW9uczogW1xuXHRcdFx0eyBpZDogJ28xJywgbGFiZWw6ICdXZXN0IFVTJywgdmFsdWU6ICd3ZXN0dXMnIH0sXG5cdFx0XHR7IGlkOiAnbzInLCBsYWJlbDogJ0Vhc3QgVVMnLCB2YWx1ZTogJ2Vhc3R1cycgfSxcblx0XHRdLFxuXHR9O1xuXG5cdGNvbnN0IG11bHRpOiBJQ2hhdFF1ZXN0aW9uID0ge1xuXHRcdGlkOiAncV9tdWx0aScsXG5cdFx0dHlwZTogJ211bHRpU2VsZWN0Jyxcblx0XHR0aXRsZTogJ1doaWNoIGZlYXR1cmVzPycsXG5cdFx0YWxsb3dGcmVlZm9ybUlucHV0OiB0cnVlLFxuXHRcdG9wdGlvbnM6IFtcblx0XHRcdHsgaWQ6ICdvMScsIGxhYmVsOiAnQXV0aCcsIHZhbHVlOiAnYXV0aCcgfSxcblx0XHRcdHsgaWQ6ICdvMicsIGxhYmVsOiAnU2VhcmNoJywgdmFsdWU6ICdzZWFyY2gnIH0sXG5cdFx0XHR7IGlkOiAnbzMnLCBsYWJlbDogJ0JpbGxpbmcnLCB2YWx1ZTogJ2JpbGxpbmcnIH0sXG5cdFx0XSxcblx0fTtcblxuXHRjb25zdCB0ZXh0OiBJQ2hhdFF1ZXN0aW9uID0geyBpZDogJ3FfdGV4dCcsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdBbnl0aGluZyBlbHNlPycgfTtcblxuXHRzdWl0ZSgncmVzb2x2ZVF1ZXN0aW9uQW5zd2VycycsICgpID0+IHtcblx0XHR0ZXN0KCdhY2NlcHRzIGZyZWVmb3JtIHdoZW4gdGhlIHF1ZXN0aW9uIG9taXRzIGFsbG93RnJlZWZvcm1JbnB1dCcsICgpID0+IHtcblx0XHRcdC8vIFRoZSB3aWRnZXQgYW5kIHRoZSBwZW5kaW5nIHBheWxvYWQgYm90aCByZWFkIGFuIG9taXR0ZWQgZmxhZyBhc1xuXHRcdFx0Ly8gZW5hYmxlZCwgc28gcmVqZWN0aW5nIGhlcmUgd291bGQgcmVmdXNlIGFuIGFuc3dlciB0aGUgdXNlciB3YXNcblx0XHRcdC8vIGludml0ZWQgdG8gZ2l2ZS5cblx0XHRcdGNvbnN0IHsgYWxsb3dGcmVlZm9ybUlucHV0LCAuLi5vbWl0dGVkIH0gPSBtdWx0aTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW29taXR0ZWRdLCBbeyBxdWVzdGlvbl9pZDogJ3FfbXVsdGknLCB2YWx1ZXM6IFsnYXV0aCddLCBmcmVlZm9ybTogJ3RlbGVtZXRyeScgfV0pLFxuXHRcdFx0XHR7IHFfbXVsdGk6IHsgc2VsZWN0ZWRWYWx1ZXM6IFsnYXV0aCddLCBmcmVlZm9ybVZhbHVlOiAndGVsZW1ldHJ5JyB9IH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVmdXNlcyBhIGZyZWVmb3JtIHZhbHVlIHRoZSBmb3JtIHdvdWxkIHJlamVjdCBvbiBzdWJtaXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWxpZGF0ZWQgPSB7IC4uLnRleHQsIHZhbGlkYXRpb246IHsgbWluTGVuZ3RoOiA1IH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2VycyhbdmFsaWRhdGVkXSwgW3sgcXVlc3Rpb25faWQ6ICdxX3RleHQnLCBmcmVlZm9ybTogJ25vJyB9XSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFt2YWxpZGF0ZWRdLCBbeyBxdWVzdGlvbl9pZDogJ3FfdGV4dCcsIGZyZWVmb3JtOiAnbG9uZyBlbm91Z2gnIH1dKSxcblx0XHRcdFx0eyBxX3RleHQ6ICdsb25nIGVub3VnaCcgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIGFuIGV4YWN0IHNpbmdsZS1zZWxlY3QgdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFtzaW5nbGVdLCBbeyBxdWVzdGlvbl9pZDogJ3Ffc2luZ2xlJywgdmFsdWU6ICdlYXN0dXMnIH1dKSxcblx0XHRcdFx0eyBxX3NpbmdsZTogeyBzZWxlY3RlZFZhbHVlOiAnZWFzdHVzJyB9IH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFwcyBleGFjdCBtdWx0aS1zZWxlY3QgdmFsdWVzIHdpdGggZnJlZWZvcm0nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFxuXHRcdFx0XHRcdFttdWx0aV0sXG5cdFx0XHRcdFx0W3sgcXVlc3Rpb25faWQ6ICdxX211bHRpJywgdmFsdWVzOiBbJ2JpbGxpbmcnLCAnYXV0aCddLCBmcmVlZm9ybTogJ3RlbGVtZXRyeScgfV0sXG5cdFx0XHRcdCksXG5cdFx0XHRcdHsgcV9tdWx0aTogeyBzZWxlY3RlZFZhbHVlczogWydiaWxsaW5nJywgJ2F1dGgnXSwgZnJlZWZvcm1WYWx1ZTogJ3RlbGVtZXRyeScgfSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcHMgYSB0ZXh0IGFuc3dlcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW3RleHRdLCBbeyBxdWVzdGlvbl9pZDogJ3FfdGV4dCcsIGZyZWVmb3JtOiAnc2hpcCBpdCcgfV0pLFxuXHRcdFx0XHR7IHFfdGV4dDogJ3NoaXAgaXQnIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFwcyBhIGZyZWVmb3JtIGZhbGxiYWNrIG9uIGEgc2VsZWN0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhcblx0XHRcdFx0XHRbeyAuLi5zaW5nbGUsIGFsbG93RnJlZWZvcm1JbnB1dDogdHJ1ZSB9XSxcblx0XHRcdFx0XHRbeyBxdWVzdGlvbl9pZDogJ3Ffc2luZ2xlJywgZnJlZWZvcm06ICdDZW50cmFsIFVTJyB9XSxcblx0XHRcdFx0KSxcblx0XHRcdFx0eyBxX3NpbmdsZTogeyBmcmVlZm9ybVZhbHVlOiAnQ2VudHJhbCBVUycgfSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcHMgc2V2ZXJhbCBxdWVzdGlvbnMgYXQgb25jZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoXG5cdFx0XHRcdFx0W3NpbmdsZSwgdGV4dF0sXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0eyBxdWVzdGlvbl9pZDogJ3Ffc2luZ2xlJywgdmFsdWU6ICd3ZXN0dXMnIH0sXG5cdFx0XHRcdFx0XHR7IHF1ZXN0aW9uX2lkOiAncV90ZXh0JywgZnJlZWZvcm06ICdubycgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHR7IHFfc2luZ2xlOiB7IHNlbGVjdGVkVmFsdWU6ICd3ZXN0dXMnIH0sIHFfdGV4dDogJ25vJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdC8vIEEgdmFsdWUgb3V0c2lkZSB0aGUgc2NoZW1hIG1lYW5zIHRoZSBiYWNrZW5kIHJlc29sdmVkIGFnYWluc3QgYSBzdGFsZVxuXHRcdC8vIG1pcnJvciwgc28gb25lIGJhZCBlbnRyeSByZWplY3RzIHRoZSB3aG9sZSBzZXQgcmF0aGVyIHRoYW4gZ3Vlc3NpbmcuXG5cdFx0dGVzdCgncmVqZWN0cyBhIHZhbHVlIHRoYXQgaXMgYSBsYWJlbCByYXRoZXIgdGhhbiBhbiBvcHRpb24gdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW3NpbmdsZV0sIFt7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnLCB2YWx1ZTogJ1dlc3QgVVMnIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYSB2YWx1ZSB0aGF0IGlzIGFuIG9wdGlvbiBpZCByYXRoZXIgdGhhbiBhbiBvcHRpb24gdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW3NpbmdsZV0sIFt7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnLCB2YWx1ZTogJ28xJyB9XSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGFuIHVua25vd24gcXVlc3Rpb24gaWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW3NpbmdsZV0sIFt7IHF1ZXN0aW9uX2lkOiAnbm9wZScsIHZhbHVlOiAnd2VzdHVzJyB9XSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHRoZSB3aG9sZSBzZXQgd2hlbiBvbmUgbXVsdGktc2VsZWN0IHZhbHVlIGlzIHVua25vd24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW211bHRpXSwgW3sgcXVlc3Rpb25faWQ6ICdxX211bHRpJywgdmFsdWVzOiBbJ2F1dGgnLCAnbm9wZSddIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgZnJlZWZvcm0gb24gYSBxdWVzdGlvbiB0aGF0IGZvcmJpZHMgaXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoXG5cdFx0XHRcdFx0W3sgLi4uc2luZ2xlLCBhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlIH1dLFxuXHRcdFx0XHRcdFt7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnLCBmcmVlZm9ybTogJ0NlbnRyYWwgVVMnIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYW4gZW1wdHkgYW5zd2VyIGxpc3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhbc2luZ2xlXSwgW10pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBhbiBhbnN3ZXIgdGhhdCBjYXJyaWVzIG5vdGhpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW3NpbmdsZV0sIFt7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgd2hpdGVzcGFjZS1vbmx5IGZyZWVmb3JtIG9uIGEgdGV4dCBxdWVzdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2VycyhbdGV4dF0sIFt7IHF1ZXN0aW9uX2lkOiAncV90ZXh0JywgZnJlZWZvcm06ICcgICAnIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYSBzZWxlY3Rpb24gb24gYSB0ZXh0IHF1ZXN0aW9uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFt0ZXh0XSwgW3sgcXVlc3Rpb25faWQ6ICdxX3RleHQnLCB2YWx1ZTogJ2FueXRoaW5nJyB9XSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGEgbXVsdGktc2VsZWN0IHNoYXBlIG9uIGEgc2luZ2xlLXNlbGVjdCBxdWVzdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhbc2luZ2xlXSwgW3sgcXVlc3Rpb25faWQ6ICdxX3NpbmdsZScsIHZhbHVlczogWyd3ZXN0dXMnXSB9XSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGEgc2luZ2xlLXNlbGVjdCBzaGFwZSBvbiBhIG11bHRpLXNlbGVjdCBxdWVzdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2VycyhbbXVsdGldLCBbeyBxdWVzdGlvbl9pZDogJ3FfbXVsdGknLCB2YWx1ZTogJ2F1dGgnIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdHdvIGFuc3dlcnMgdG8gdGhlIHNhbWUgcXVlc3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoXG5cdFx0XHRcdFx0W3NpbmdsZV0sXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0eyBxdWVzdGlvbl9pZDogJ3Ffc2luZ2xlJywgdmFsdWU6ICd3ZXN0dXMnIH0sXG5cdFx0XHRcdFx0XHR7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnLCB2YWx1ZTogJ2Vhc3R1cycgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsOEJBQThCO0FBRXZDLE1BQU0sd0JBQXdCLE1BQU07QUFDbkMsMENBQXdDO0FBRXhDLFFBQU0sU0FBd0I7QUFBQSxJQUM3QixJQUFJO0FBQUEsSUFDSixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxVQUFVO0FBQUEsSUFDVixTQUFTO0FBQUEsTUFDUixFQUFFLElBQUksTUFBTSxPQUFPLFdBQVcsT0FBTyxTQUFTO0FBQUEsTUFDOUMsRUFBRSxJQUFJLE1BQU0sT0FBTyxXQUFXLE9BQU8sU0FBUztBQUFBLElBQy9DO0FBQUEsRUFDRDtBQUVBLFFBQU0sUUFBdUI7QUFBQSxJQUM1QixJQUFJO0FBQUEsSUFDSixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxvQkFBb0I7QUFBQSxJQUNwQixTQUFTO0FBQUEsTUFDUixFQUFFLElBQUksTUFBTSxPQUFPLFFBQVEsT0FBTyxPQUFPO0FBQUEsTUFDekMsRUFBRSxJQUFJLE1BQU0sT0FBTyxVQUFVLE9BQU8sU0FBUztBQUFBLE1BQzdDLEVBQUUsSUFBSSxNQUFNLE9BQU8sV0FBVyxPQUFPLFVBQVU7QUFBQSxJQUNoRDtBQUFBLEVBQ0Q7QUFFQSxRQUFNLE9BQXNCLEVBQUUsSUFBSSxVQUFVLE1BQU0sUUFBUSxPQUFPLGlCQUFpQjtBQUVsRixRQUFNLDBCQUEwQixNQUFNO0FBQ3JDLFNBQUssK0RBQStELE1BQU07QUFJekUsWUFBTSxFQUFFLG9CQUFvQixHQUFHLFFBQVEsSUFBSTtBQUMzQyxhQUFPO0FBQUEsUUFDTix1QkFBdUIsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxFQUFFLGFBQWEsV0FBVyxRQUFRLENBQUMsTUFBTSxHQUFHLFVBQVUsWUFBWSxDQUFDLENBQUM7QUFBQSxRQUN2RyxFQUFFLFNBQVMsRUFBRSxnQkFB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
