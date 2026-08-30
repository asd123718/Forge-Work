import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import {
  findQuestionValidationFailure,
  getDisplayedQuestionText,
  getOptionsWithDefaultsFirst
} from "../../common/chatService/chatQuestionCarouselHelpers.js";
suite("ChatQuestionCarouselHelpers", () => {
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
  suite("getOptionsWithDefaultsFirst", () => {
    test("preserves declared order when there is no default", () => {
      assert.deepStrictEqual(
        getOptionsWithDefaultsFirst(single).map((o) => o.option.value),
        ["westus", "eastus"]
      );
    });
    test("hoists a single default to the front", () => {
      assert.deepStrictEqual(
        getOptionsWithDefaultsFirst({ ...single, defaultValue: "o2" }).map((o) => o.option.value),
        ["eastus", "westus"]
      );
    });
    test("hoists several defaults, keeping their relative order", () => {
      assert.deepStrictEqual(
        getOptionsWithDefaultsFirst({ ...multi, defaultValue: ["o3", "o1"] }).map((o) => o.option.value),
        ["auth", "billing", "search"]
      );
    });
    test("matches defaults by option id, not by option value", () => {
      assert.deepStrictEqual(
        getOptionsWithDefaultsFirst({ ...single, defaultValue: "eastus" }).map((o) => o.option.value),
        ["westus", "eastus"]
      );
    });
    test("returns an empty list for a question with no options", () => {
      assert.deepStrictEqual(getOptionsWithDefaultsFirst(text), []);
    });
    test("keeps originalIndex pointing at the declared position", () => {
      assert.deepStrictEqual(
        getOptionsWithDefaultsFirst({ ...single, defaultValue: "o2" }).map((o) => o.originalIndex),
        [1, 0]
      );
    });
  });
  suite("getDisplayedQuestionText", () => {
    test("prefers message, which is where the built-in tool puts the question", () => {
      assert.strictEqual(
        getDisplayedQuestionText({ ...single, message: "Which region should this deploy to?" }),
        "Which region should this deploy to?"
      );
    });
    test("falls back to title when there is no message", () => {
      assert.strictEqual(getDisplayedQuestionText(single), "Which region?");
    });
    test("passes a markdown message through untouched", () => {
      const message = { value: "**Which** region?" };
      assert.strictEqual(getDisplayedQuestionText({ ...single, message }), message);
    });
  });
  suite("findQuestionValidationFailure", () => {
    test("accepts a value inside every bound", () => {
      assert.strictEqual(
        findQuestionValidationFailure("42", { minLength: 1, maxLength: 3, minimum: 0, maximum: 99, isInteger: true }),
        void 0
      );
    });
    test("reports the bound that was broken", () => {
      assert.deepStrictEqual(findQuestionValidationFailure("ab", { minLength: 3 }), { kind: "minLength", limit: 3 });
      assert.deepStrictEqual(findQuestionValidationFailure("abcd", { maxLength: 3 }), { kind: "maxLength", limit: 3 });
      assert.deepStrictEqual(findQuestionValidationFailure("1", { minimum: 5 }), { kind: "minimum", limit: 5 });
      assert.deepStrictEqual(findQuestionValidationFailure("9", { maximum: 5 }), { kind: "maximum", limit: 5 });
    });
    test("reports a malformed value by format", () => {
      assert.deepStrictEqual(findQuestionValidationFailure("nope", { format: "email" }), { kind: "email" });
      assert.deepStrictEqual(findQuestionValidationFailure("nope", { format: "uri" }), { kind: "uri" });
      assert.deepStrictEqual(findQuestionValidationFailure("01-02-2026", { format: "date" }), { kind: "date" });
      assert.deepStrictEqual(findQuestionValidationFailure("nope", { format: "date-time" }), { kind: "dateTime" });
      assert.deepStrictEqual(findQuestionValidationFailure("nope", { minimum: 1 }), { kind: "number" });
      assert.deepStrictEqual(findQuestionValidationFailure("1.5", { isInteger: true }), { kind: "integer" });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxIZWxwZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElDaGF0UXVlc3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0ZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUsXG5cdGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dCxcblx0Z2V0T3B0aW9uc1dpdGhEZWZhdWx0c0ZpcnN0LFxufSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxIZWxwZXJzLmpzJztcblxuc3VpdGUoJ0NoYXRRdWVzdGlvbkNhcm91c2VsSGVscGVycycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2luZ2xlOiBJQ2hhdFF1ZXN0aW9uID0ge1xuXHRcdGlkOiAncV9zaW5nbGUnLFxuXHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdHRpdGxlOiAnV2hpY2ggcmVnaW9uPycsXG5cdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0b3B0aW9uczogW1xuXHRcdFx0eyBpZDogJ28xJywgbGFiZWw6ICdXZXN0IFVTJywgdmFsdWU6ICd3ZXN0dXMnIH0sXG5cdFx0XHR7IGlkOiAnbzInLCBsYWJlbDogJ0Vhc3QgVVMnLCB2YWx1ZTogJ2Vhc3R1cycgfSxcblx0XHRdLFxuXHR9O1xuXG5cdGNvbnN0IG11bHRpOiBJQ2hhdFF1ZXN0aW9uID0ge1xuXHRcdGlkOiAncV9tdWx0aScsXG5cdFx0dHlwZTogJ211bHRpU2VsZWN0Jyxcblx0XHR0aXRsZTogJ1doaWNoIGZlYXR1cmVzPycsXG5cdFx0YWxsb3dGcmVlZm9ybUlucHV0OiB0cnVlLFxuXHRcdG9wdGlvbnM6IFtcblx0XHRcdHsgaWQ6ICdvMScsIGxhYmVsOiAnQXV0aCcsIHZhbHVlOiAnYXV0aCcgfSxcblx0XHRcdHsgaWQ6ICdvMicsIGxhYmVsOiAnU2VhcmNoJywgdmFsdWU6ICdzZWFyY2gnIH0sXG5cdFx0XHR7IGlkOiAnbzMnLCBsYWJlbDogJ0JpbGxpbmcnLCB2YWx1ZTogJ2JpbGxpbmcnIH0sXG5cdFx0XSxcblx0fTtcblxuXHRjb25zdCB0ZXh0OiBJQ2hhdFF1ZXN0aW9uID0geyBpZDogJ3FfdGV4dCcsIHR5cGU6ICd0ZXh0JywgdGl0bGU6ICdBbnl0aGluZyBlbHNlPycgfTtcblxuXHRzdWl0ZSgnZ2V0T3B0aW9uc1dpdGhEZWZhdWx0c0ZpcnN0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3ByZXNlcnZlcyBkZWNsYXJlZCBvcmRlciB3aGVuIHRoZXJlIGlzIG5vIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRPcHRpb25zV2l0aERlZmF1bHRzRmlyc3Qoc2luZ2xlKS5tYXAobyA9PiBvLm9wdGlvbi52YWx1ZSksXG5cdFx0XHRcdFsnd2VzdHVzJywgJ2Vhc3R1cyddLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvaXN0cyBhIHNpbmdsZSBkZWZhdWx0IHRvIHRoZSBmcm9udCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldE9wdGlvbnNXaXRoRGVmYXVsdHNGaXJzdCh7IC4uLnNpbmdsZSwgZGVmYXVsdFZhbHVlOiAnbzInIH0pLm1hcChvID0+IG8ub3B0aW9uLnZhbHVlKSxcblx0XHRcdFx0WydlYXN0dXMnLCAnd2VzdHVzJ10sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9pc3RzIHNldmVyYWwgZGVmYXVsdHMsIGtlZXBpbmcgdGhlaXIgcmVsYXRpdmUgb3JkZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRPcHRpb25zV2l0aERlZmF1bHRzRmlyc3QoeyAuLi5tdWx0aSwgZGVmYXVsdFZhbHVlOiBbJ28zJywgJ28xJ10gfSkubWFwKG8gPT4gby5vcHRpb24udmFsdWUpLFxuXHRcdFx0XHRbJ2F1dGgnLCAnYmlsbGluZycsICdzZWFyY2gnXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGRlZmF1bHRzIGJ5IG9wdGlvbiBpZCwgbm90IGJ5IG9wdGlvbiB2YWx1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldE9wdGlvbnNXaXRoRGVmYXVsdHNGaXJzdCh7IC4uLnNpbmdsZSwgZGVmYXVsdFZhbHVlOiAnZWFzdHVzJyB9KS5tYXAobyA9PiBvLm9wdGlvbi52YWx1ZSksXG5cdFx0XHRcdFsnd2VzdHVzJywgJ2Vhc3R1cyddLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYW4gZW1wdHkgbGlzdCBmb3IgYSBxdWVzdGlvbiB3aXRoIG5vIG9wdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE9wdGlvbnNXaXRoRGVmYXVsdHNGaXJzdCh0ZXh0KSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgb3JpZ2luYWxJbmRleCBwb2ludGluZyBhdCB0aGUgZGVjbGFyZWQgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRPcHRpb25zV2l0aERlZmF1bHRzRmlyc3QoeyAuLi5zaW5nbGUsIGRlZmF1bHRWYWx1ZTogJ28yJyB9KS5tYXAobyA9PiBvLm9yaWdpbmFsSW5kZXgpLFxuXHRcdFx0XHRbMSwgMF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0RGlzcGxheWVkUXVlc3Rpb25UZXh0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3ByZWZlcnMgbWVzc2FnZSwgd2hpY2ggaXMgd2hlcmUgdGhlIGJ1aWx0LWluIHRvb2wgcHV0cyB0aGUgcXVlc3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dCh7IC4uLnNpbmdsZSwgbWVzc2FnZTogJ1doaWNoIHJlZ2lvbiBzaG91bGQgdGhpcyBkZXBsb3kgdG8/JyB9KSxcblx0XHRcdFx0J1doaWNoIHJlZ2lvbiBzaG91bGQgdGhpcyBkZXBsb3kgdG8/Jyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRpdGxlIHdoZW4gdGhlcmUgaXMgbm8gbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXREaXNwbGF5ZWRRdWVzdGlvblRleHQoc2luZ2xlKSwgJ1doaWNoIHJlZ2lvbj8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bhc3NlcyBhIG1hcmtkb3duIG1lc3NhZ2UgdGhyb3VnaCB1bnRvdWNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0geyB2YWx1ZTogJyoqV2hpY2gqKiByZWdpb24/JyB9IGFzIElNYXJrZG93blN0cmluZztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXREaXNwbGF5ZWRRdWVzdGlvblRleHQoeyAuLi5zaW5nbGUsIG1lc3NhZ2UgfSksIG1lc3NhZ2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnYWNjZXB0cyBhIHZhbHVlIGluc2lkZSBldmVyeSBib3VuZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUoJzQyJywgeyBtaW5MZW5ndGg6IDEsIG1heExlbmd0aDogMywgbWluaW11bTogMCwgbWF4aW11bTogOTksIGlzSW50ZWdlcjogdHJ1ZSB9KSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcG9ydHMgdGhlIGJvdW5kIHRoYXQgd2FzIGJyb2tlbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUoJ2FiJywgeyBtaW5MZW5ndGg6IDMgfSksIHsga2luZDogJ21pbkxlbmd0aCcsIGxpbWl0OiAzIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kUXVlc3Rpb25WYWxpZGF0aW9uRmFpbHVyZSgnYWJjZCcsIHsgbWF4TGVuZ3RoOiAzIH0pLCB7IGtpbmQ6ICdtYXhMZW5ndGgnLCBsaW1pdDogMyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUoJzEnLCB7IG1pbmltdW06IDUgfSksIHsga2luZDogJ21pbmltdW0nLCBsaW1pdDogNSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUoJzknLCB7IG1heGltdW06IDUgfSksIHsga2luZDogJ21heGltdW0nLCBsaW1pdDogNSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcG9ydHMgYSBtYWxmb3JtZWQgdmFsdWUgYnkgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kUXVlc3Rpb25WYWxpZGF0aW9uRmFpbHVyZSgnbm9wZScsIHsgZm9ybWF0OiAnZW1haWwnIH0pLCB7IGtpbmQ6ICdlbWFpbCcgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbmRRdWVzdGlvblZhbGlkYXRpb25GYWlsdXJlKCdub3BlJywgeyBmb3JtYXQ6ICd1cmknIH0pLCB7IGtpbmQ6ICd1cmknIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kUXVlc3Rpb25WYWxpZGF0aW9uRmFpbHVyZSgnMDEtMDItMjAyNicsIHsgZm9ybWF0OiAnZGF0ZScgfSksIHsga2luZDogJ2RhdGUnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kUXVlc3Rpb25WYWxpZGF0aW9uRmFpbHVyZSgnbm9wZScsIHsgZm9ybWF0OiAnZGF0ZS10aW1lJyB9KSwgeyBraW5kOiAnZGF0ZVRpbWUnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kUXVlc3Rpb25WYWxpZGF0aW9uRmFpbHVyZSgnbm9wZScsIHsgbWluaW11bTogMSB9KSwgeyBraW5kOiAnbnVtYmVyJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUoJzEuNScsIHsgaXNJbnRlZ2VyOiB0cnVlIH0pLCB7IGtpbmQ6ICdpbnRlZ2VyJyB9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUd4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFFUCxNQUFNLCtCQUErQixNQUFNO0FBQzFDLDBDQUF3QztBQUV4QyxRQUFNLFNBQXdCO0FBQUEsSUFDN0IsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLElBQ1AsVUFBVTtBQUFBLElBQ1YsU0FBUztBQUFBLE1BQ1IsRUFBRSxJQUFJLE1BQU0sT0FBTyxXQUFXLE9BQU8sU0FBUztBQUFBLE1BQzlDLEVBQUUsSUFBSSxNQUFNLE9BQU8sV0FBVyxPQUFPLFNBQVM7QUFBQSxJQUMvQztBQUFBLEVBQ0Q7QUFFQSxRQUFNLFFBQXVCO0FBQUEsSUFDNUIsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLElBQ1Asb0JBQW9CO0FBQUEsSUFDcEIsU0FBUztBQUFBLE1BQ1IsRUFBRSxJQUFJLE1BQU0sT0FBTyxRQUFRLE9BQU8sT0FBTztBQUFBLE1BQ3pDLEVBQUUsSUFBSSxNQUFNLE9BQU8sVUFBVSxPQUFPLFNBQVM7QUFBQSxNQUM3QyxFQUFFLElBQUksTUFBTSxPQUFPLFdBQVcsT0FBTyxVQUFVO0FBQUEsSUFDaEQ7QUFBQSxFQUNEO0FBRUEsUUFBTSxPQUFzQixFQUFFLElBQUksVUFBVSxNQUFNLFFBQVEsT0FBTyxpQkFBaUI7QUFFbEYsUUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxTQUFLLHFEQUFxRCxNQUFNO0FBQy9ELGFBQU87QUFBQSxRQUNOLDRCQUE0QixNQUFNLEVBQUUsSUFBSSxPQUFLLEVBQUUsT0FBTyxLQUFLO0FBQUEsUUFDM0QsQ0FBQyxVQUFVLFFBQVE7QUFBQSxNQUNwQjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssd0NBQXdDLE1BQU07QUFDbEQsYUFBTztBQUFBLFFBQ04sNEJBQTRCLEVBQUUsR0FBRyxRQUFRLGNBQWMsS0FBSyxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsT0FBTyxLQUFLO0FBQUEsUUFDdEYsQ0FBQyxVQUFVLFFBQVE7QUFBQSxNQUNwQjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUsseURBQXlELE1BQU07QUFDbkUsYUFBTztBQUFBLFFBQ04sNEJBQTRCLEVBQUUsR0FBRyxPQUFPLGNBQWMsQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsT0FBTyxLQUFLO0FBQUEsUUFDN0YsQ0FBQyxRQUFRLFdBQVcsUUFBUTtBQUFBLE1BQzdCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxzREFBc0QsTUFBTTtBQUNoRSxhQUFPO0FBQUEsUUFDTiw0QkFBNEIsRUFBRSxHQUFHLFFBQVEsY0FBYyxTQUFTLENBQUMsRUFBRSxJQUFJLE9BQUssRUFBRSxPQUFPLEtBQUs7QUFBQSxRQUMxRixDQUFDLFVBQVUsUUFBUTtBQUFBLE1BQ3BCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx3REFBd0QsTUFBTTtBQUNsRSxhQUFPLGdCQUFnQiw0QkFBNEIsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzdELENBQUM7QUFFRCxTQUFLLHlEQUF5RCxNQUFNO0FBQ25FLGFBQU87QUFBQSxRQUNOLDRCQUE0QixFQUFFLEdBQUcsUUFBUSxjQUFjLEtBQUssQ0FBQyxFQUFFLElBQUksT0FBSyxFQUFFLGFBQWE7QUFBQSxRQUN2RixDQUFDLEdBQUcsQ0FBQztBQUFBLE1BQ047QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLFNBQUssdUVBQXVFLE1BQU07QUFDakYsYUFBTztBQUFBLFFBQ04seUJBQXlCLEVBQUUsR0FBRyxRQUFRLFNBQVMsc0NBQXNDLENBQUM7QUFBQSxRQUN0RjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGdEQUFnRCxNQUFNO0FBQzFELGFBQU8sWUFBWSx5QkFBeUIsTUFBTSxHQUFHLGVBQWU7QUFBQSxJQUNyRSxDQUFDO0FBRUQsU0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxZQUFNLFVBQVUsRUFBRSxPQUFPLG9CQUFvQjtBQUM3QyxhQUFPLFlBQVkseUJBQXlCLEVBQUUsR0FBRyxRQUFRLFFBQVEsQ0FBQyxHQUFHLE9BQU87QUFBQSxJQUM3RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxpQ0FBaUMsTUFBTTtBQUM1QyxTQUFLLHNDQUFzQyxNQUFNO0FBQ2hELGFBQU87QUFBQSxRQUNOLDhCQUE4QixNQUFNLEVBQUUsV0FBVyxHQUFHLFdBQVcsR0FBRyxTQUFTLEdBQUcsU0FBUyxJQUFJLFdBQVcsS0FBSyxDQUFDO0FBQUEsUUFDNUc7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxhQUFPLGdCQUFnQiw4QkFBOEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDLEdBQUcsRUFBRSxNQUFNLGFBQWEsT0FBTyxFQUFFLENBQUM7QUFDN0csYUFBTyxnQkFBZ0IsOEJBQThCLFFBQVEsRUFBRSxXQUFXLEVBQUUsQ0FBQyxHQUFHLEVBQUUsTUFBTSxhQUFhLE9BQU8sRUFBRSxDQUFDO0FBQy9HLGFBQU8sZ0JBQWdCLDhCQUE4QixLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsR0FBRyxFQUFFLE1BQU0sV0FBVyxPQUFPLEVBQUUsQ0FBQztBQUN4RyxhQUFPLGdCQUFnQiw4QkFBOEIsS0FBSyxFQUFFLFNBQVMsRUFBRSxDQUFDLEdBQUcsRUFBRSxNQUFNLFdBQVcsT0FBTyxFQUFFLENBQUM7QUFBQSxJQUN6RyxDQUFDO0FBRUQsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxhQUFPLGdCQUFnQiw4QkFBOEIsUUFBUSxFQUFFLFFBQVEsUUFBUSxDQUFDLEdBQUcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNwRyxhQUFPLGdCQUFnQiw4QkFBOEIsUUFBUSxFQUFFLFFBQVEsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLE1BQU0sQ0FBQztBQUNoRyxhQUFPLGdCQUFnQiw4QkFBOEIsY0FBYyxFQUFFLFFBQVEsT0FBTyxDQUFDLEdBQUcsRUFBRSxNQUFNLE9BQU8sQ0FBQztBQUN4RyxhQUFPLGdCQUFnQiw4QkFBOEIsUUFBUSxFQUFFLFFBQVEsWUFBWSxDQUFDLEdBQUcsRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUMzRyxhQUFPLGdCQUFnQiw4QkFBOEIsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLEdBQUcsRUFBRSxNQUFNLFNBQVMsQ0FBQztBQUNoRyxhQUFPLGdCQUFnQiw4QkFBOEIsT0FBTyxFQUFFLFdBQVcsS0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUFBLElBQ3RHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
