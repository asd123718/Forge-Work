import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { formatQuestionPrompt } from "../../../common/voiceClient/voicePendingNarration.js";
suite("formatQuestionPrompt", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const single = {
    id: "q_single",
    type: "singleSelect",
    title: "Which region?",
    allow_freeform: false,
    options: [
      { label: "West US", value: "westus" },
      { label: "East US", value: "eastus" }
    ]
  };
  const multi = {
    id: "q_multi",
    type: "multiSelect",
    title: "Which features?",
    allow_freeform: true,
    options: [
      { label: "Auth", value: "auth" },
      { label: "Search", value: "search" },
      { label: "Billing", value: "billing" }
    ]
  };
  const text = {
    id: "q_text",
    type: "text",
    title: "Anything else?",
    allow_freeform: true,
    options: []
  };
  test("single select", () => {
    assert.strictEqual(
      formatQuestionPrompt(single, false),
      "Which region? Options: 1, West US. 2, East US."
    );
  });
  test("appends the skip hint when the form allows skipping", () => {
    assert.strictEqual(
      formatQuestionPrompt(single, true),
      "Which region? Options: 1, West US. 2, East US. Or say skip."
    );
  });
  test("mentions freeform when the question allows it", () => {
    assert.strictEqual(
      formatQuestionPrompt(multi, false),
      "Which features? Options: 1, Auth. 2, Search. 3, Billing. You can also give your own answer."
    );
  });
  test("a text question is just its title", () => {
    assert.strictEqual(formatQuestionPrompt(text, false), "Anything else?");
  });
  test("a text question with skip", () => {
    assert.strictEqual(formatQuestionPrompt(text, true), "Anything else? Or say skip.");
  });
  test("tolerates an empty title", () => {
    assert.strictEqual(
      formatQuestionPrompt({ ...single, title: "" }, false),
      "Options: 1, West US. 2, East US."
    );
  });
  test("reads the ordinals it was given rather than renumbering", () => {
    assert.strictEqual(
      formatQuestionPrompt(
        {
          ...single,
          options: [
            { label: "East US", value: "eastus" },
            { label: "West US", value: "westus" }
          ]
        },
        false
      ),
      "Which region? Options: 1, East US. 2, West US."
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcdm9pY2VDbGllbnRcXHZvaWNlUGVuZGluZ05hcnJhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVm9pY2VQZW5kaW5nUXVlc3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGZvcm1hdFF1ZXN0aW9uUHJvbXB0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlUGVuZGluZ05hcnJhdGlvbi5qcyc7XG5cbnN1aXRlKCdmb3JtYXRRdWVzdGlvblByb21wdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gRXZlcnkgZXhwZWN0YXRpb24gYmVsb3cgaXMgYnl0ZS1pZGVudGljYWwgdG8gdGhlIFB5dGhvbiBmaXh0dXJlcyBpblxuXHQvLyBhcHBzL3ZvaWNlX2NvZGUvdGVzdHMvdGVzdF9zZXNzaW9uX3BlbmRpbmcucHk6OnRlc3RfZm9ybWF0XyouIFRoZSBjbGllbnRcblx0Ly8gc3BlYWtzIHF1ZXN0aW9uIDEgb2YgYSBmb3JtIGFuZCB0aGUgYmFja2VuZCBzcGVha3MgMi4uTiBhcyBpdCByZXBsaWVzIHRvXG5cdC8vIGVhY2ggYW5zd2VyLCBzbyBhIGRpdmVyZ2VuY2UgaXMgYXVkaWJsZSBhcyB0aGUgYXNzaXN0YW50IGNoYW5naW5nIHJlZ2lzdGVyXG5cdC8vIHBhcnR3YXkgdGhyb3VnaCBvbmUgZm9ybS5cblxuXHRjb25zdCBzaW5nbGU6IElWb2ljZVBlbmRpbmdRdWVzdGlvbiA9IHtcblx0XHRpZDogJ3Ffc2luZ2xlJyxcblx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHR0aXRsZTogJ1doaWNoIHJlZ2lvbj8nLFxuXHRcdGFsbG93X2ZyZWVmb3JtOiBmYWxzZSxcblx0XHRvcHRpb25zOiBbXG5cdFx0XHR7IGxhYmVsOiAnV2VzdCBVUycsIHZhbHVlOiAnd2VzdHVzJyB9LFxuXHRcdFx0eyBsYWJlbDogJ0Vhc3QgVVMnLCB2YWx1ZTogJ2Vhc3R1cycgfSxcblx0XHRdLFxuXHR9O1xuXG5cdGNvbnN0IG11bHRpOiBJVm9pY2VQZW5kaW5nUXVlc3Rpb24gPSB7XG5cdFx0aWQ6ICdxX211bHRpJyxcblx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdHRpdGxlOiAnV2hpY2ggZmVhdHVyZXM/Jyxcblx0XHRhbGxvd19mcmVlZm9ybTogdHJ1ZSxcblx0XHRvcHRpb25zOiBbXG5cdFx0XHR7IGxhYmVsOiAnQXV0aCcsIHZhbHVlOiAnYXV0aCcgfSxcblx0XHRcdHsgbGFiZWw6ICdTZWFyY2gnLCB2YWx1ZTogJ3NlYXJjaCcgfSxcblx0XHRcdHsgbGFiZWw6ICdCaWxsaW5nJywgdmFsdWU6ICdiaWxsaW5nJyB9LFxuXHRcdF0sXG5cdH07XG5cblx0Y29uc3QgdGV4dDogSVZvaWNlUGVuZGluZ1F1ZXN0aW9uID0ge1xuXHRcdGlkOiAncV90ZXh0Jyxcblx0XHR0eXBlOiAndGV4dCcsXG5cdFx0dGl0bGU6ICdBbnl0aGluZyBlbHNlPycsXG5cdFx0YWxsb3dfZnJlZWZvcm06IHRydWUsXG5cdFx0b3B0aW9uczogW10sXG5cdH07XG5cblx0dGVzdCgnc2luZ2xlIHNlbGVjdCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRmb3JtYXRRdWVzdGlvblByb21wdChzaW5nbGUsIGZhbHNlKSxcblx0XHRcdCdXaGljaCByZWdpb24/IE9wdGlvbnM6IDEsIFdlc3QgVVMuIDIsIEVhc3QgVVMuJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRzIHRoZSBza2lwIGhpbnQgd2hlbiB0aGUgZm9ybSBhbGxvd3Mgc2tpcHBpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Zm9ybWF0UXVlc3Rpb25Qcm9tcHQoc2luZ2xlLCB0cnVlKSxcblx0XHRcdCdXaGljaCByZWdpb24/IE9wdGlvbnM6IDEsIFdlc3QgVVMuIDIsIEVhc3QgVVMuIE9yIHNheSBza2lwLicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWVudGlvbnMgZnJlZWZvcm0gd2hlbiB0aGUgcXVlc3Rpb24gYWxsb3dzIGl0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGZvcm1hdFF1ZXN0aW9uUHJvbXB0KG11bHRpLCBmYWxzZSksXG5cdFx0XHQnV2hpY2ggZmVhdHVyZXM/IE9wdGlvbnM6IDEsIEF1dGguIDIsIFNlYXJjaC4gMywgQmlsbGluZy4gWW91IGNhbiBhbHNvIGdpdmUgeW91ciBvd24gYW5zd2VyLicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYSB0ZXh0IHF1ZXN0aW9uIGlzIGp1c3QgaXRzIHRpdGxlJywgKCkgPT4ge1xuXHRcdC8vIEZyZWVmb3JtLWNhcGFibGUsIGJ1dCB0aGUgaGludCBpcyBzdXBwcmVzc2VkOiBpdCBvbmx5IG1lYW5zIHNvbWV0aGluZ1xuXHRcdC8vIHdoZW4gdGhlcmUgaXMgYSBsaXN0IG9mIG9wdGlvbnMgdG8gYW5zd2VyICppbnN0ZWFkIG9mKi5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0UXVlc3Rpb25Qcm9tcHQodGV4dCwgZmFsc2UpLCAnQW55dGhpbmcgZWxzZT8nKTtcblx0fSk7XG5cblx0dGVzdCgnYSB0ZXh0IHF1ZXN0aW9uIHdpdGggc2tpcCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0UXVlc3Rpb25Qcm9tcHQodGV4dCwgdHJ1ZSksICdBbnl0aGluZyBlbHNlPyBPciBzYXkgc2tpcC4nKTtcblx0fSk7XG5cblx0dGVzdCgndG9sZXJhdGVzIGFuIGVtcHR5IHRpdGxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGZvcm1hdFF1ZXN0aW9uUHJvbXB0KHsgLi4uc2luZ2xlLCB0aXRsZTogJycgfSwgZmFsc2UpLFxuXHRcdFx0J09wdGlvbnM6IDEsIFdlc3QgVVMuIDIsIEVhc3QgVVMuJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkcyB0aGUgb3JkaW5hbHMgaXQgd2FzIGdpdmVuIHJhdGhlciB0aGFuIHJlbnVtYmVyaW5nJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBvcmRpbmFscyBjb21lIGZyb20gYF9idWlsZFBlbmRpbmdQYXlsb2FkYCwgd2hpY2ggYXNzaWducyB0aGVtIGZyb21cblx0XHQvLyB0aGUgd2lkZ2V0J3MgZGlzcGxheWVkIG9yZGVyLiBSZW51bWJlcmluZyBoZXJlIHdvdWxkIGJlIGEgc2Vjb25kLFxuXHRcdC8vIGluZGVwZW5kZW50IHNvdXJjZSBvZiB0cnV0aCBmb3IgdGhlIG51bWJlciB0aGUgdXNlciBzYXlzIGJhY2suXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Zm9ybWF0UXVlc3Rpb25Qcm9tcHQoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQuLi5zaW5nbGUsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ0Vhc3QgVVMnLCB2YWx1ZTogJ2Vhc3R1cycgfSxcblx0XHRcdFx0XHRcdHsgbGFiZWw6ICdXZXN0IFVTJywgdmFsdWU6ICd3ZXN0dXMnIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpLFxuXHRcdFx0J1doaWNoIHJlZ2lvbj8gT3B0aW9uczogMSwgRWFzdCBVUy4gMiwgV2VzdCBVUy4nLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyw0QkFBNEI7QUFFckMsTUFBTSx3QkFBd0IsTUFBTTtBQUNuQywwQ0FBd0M7QUFReEMsUUFBTSxTQUFnQztBQUFBLElBQ3JDLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLGdCQUFnQjtBQUFBLElBQ2hCLFNBQVM7QUFBQSxNQUNSLEVBQUUsT0FBTyxXQUFXLE9BQU8sU0FBUztBQUFBLE1BQ3BDLEVBQUUsT0FBTyxXQUFXLE9BQU8sU0FBUztBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQUVBLFFBQU0sUUFBK0I7QUFBQSxJQUNwQyxJQUFJO0FBQUEsSUFDSixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxnQkFBZ0I7QUFBQSxJQUNoQixTQUFTO0FBQUEsTUFDUixFQUFFLE9BQU8sUUFBUSxPQUFPLE9BQU87QUFBQSxNQUMvQixFQUFFLE9BQU8sVUFBVSxPQUFPLFNBQVM7QUFBQSxNQUNuQyxFQUFFLE9BQU8sV0FBVyxPQUFPLFVBQVU7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFFQSxRQUFNLE9BQThCO0FBQUEsSUFDbkMsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLElBQ1AsZ0JBQWdCO0FBQUEsSUFDaEIsU0FBUyxDQUFDO0FBQUEsRUFDWDtBQUVBLE9BQUssaUJBQWlCLE1BQU07QUFDM0IsV0FBTztBQUFBLE1BQ04scUJBQXFCLFFBQVEsS0FBSztBQUFBLE1BQ2xDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFDakUsV0FBTztBQUFBLE1BQ04scUJBQXFCLFFBQVEsSUFBSTtBQUFBLE1BQ2pDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssaURBQWlELE1BQU07QUFDM0QsV0FBTztBQUFBLE1BQ04scUJBQXFCLE9BQU8sS0FBSztBQUFBLE1BQ2pDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscUNBQXFDLE1BQU07QUFHL0MsV0FBTyxZQUFZLHFCQUFxQixNQUFNLEtBQUssR0FBRyxnQkFBZ0I7QUFBQSxFQUN2RSxDQUFDO0FBRUQsT0FBSyw2QkFBNkIsTUFBTTtBQUN2QyxXQUFPLFlBQVkscUJBQXFCLE1BQU0sSUFBSSxHQUFHLDZCQUE2QjtBQUFBLEVBQ25GLENBQUM7QUFFRCxPQUFLLDRCQUE0QixNQUFNO0FBQ3RDLFdBQU87QUFBQSxNQUNOLHFCQUFxQixFQUFFLEdBQUcsUUFBUSxPQUFPLEdBQUcsR0FBRyxLQUFLO0FBQUEsTUFDcEQ7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUlyRSxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0M7QUFBQSxVQUNDLEdBQUc7QUFBQSxVQUNILFNBQVM7QUFBQSxZQUNSLEVBQUUsT0FBTyxXQUFXLE9BQU8sU0FBUztBQUFBLFlBQ3BDLEVBQUUsT0FBTyxXQUFXLE9BQU8sU0FBUztBQUFBLFVBQ3JDO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
