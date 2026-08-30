import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { getReasoningEffortDescription, getReasoningEffortLabel, reasoningEffortLevels, resolveDefaultReasoningEffort } from "../../common/reasoningEffort.js";
suite("reasoningEffort", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("every level has a localized label and description", () => {
    assert.deepStrictEqual(
      reasoningEffortLevels.map((level) => [level, getReasoningEffortLabel(level), getReasoningEffortDescription(level)]),
      [
        ["none", "None", "No reasoning applied"],
        ["minimal", "Minimal", "Minimal reasoning for fastest responses"],
        ["low", "Low", "Faster responses with less reasoning"],
        ["medium", "Medium", "Balanced reasoning and speed"],
        ["high", "High", "Greater reasoning depth but slower"],
        ["xhigh", "Extra High", "Highest reasoning depth but slowest"],
        ["max", "Max", "Absolute maximum capability with no constraints"],
        ["ultra", "Ultra", "Maximum reasoning with automatic task delegation"]
      ]
    );
  });
  test("resolves a default so the picker never renders an undefined selection", () => {
    assert.deepStrictEqual([
      resolveDefaultReasoningEffort(["low", "medium", "high"], "high", "gpt-5"),
      resolveDefaultReasoningEffort(["low", "medium", "high"], void 0, "gpt-5"),
      resolveDefaultReasoningEffort(["low", "medium", "high"], "nonsense", "gpt-5"),
      resolveDefaultReasoningEffort(["low", "medium", "high"], void 0, "claude-opus-5"),
      resolveDefaultReasoningEffort(["minimal", "max"], void 0, "gpt-5"),
      resolveDefaultReasoningEffort([], void 0, "gpt-5"),
      resolveDefaultReasoningEffort(void 0, void 0, "gpt-5")
    ], [
      "high",
      "medium",
      "medium",
      "high",
      "minimal",
      void 0,
      void 0
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHJlYXNvbmluZ0VmZm9ydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBnZXRSZWFzb25pbmdFZmZvcnREZXNjcmlwdGlvbiwgZ2V0UmVhc29uaW5nRWZmb3J0TGFiZWwsIHJlYXNvbmluZ0VmZm9ydExldmVscywgcmVzb2x2ZURlZmF1bHRSZWFzb25pbmdFZmZvcnQgfSBmcm9tICcuLi8uLi9jb21tb24vcmVhc29uaW5nRWZmb3J0LmpzJztcblxuc3VpdGUoJ3JlYXNvbmluZ0VmZm9ydCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBBIG5ld2x5LWludHJvZHVjZWQgdGllciB0aGF0IG5vYm9keSBhZGRzIGEgc3RyaW5nIGZvciB3b3VsZCBvdGhlcndpc2UgcmVhY2hcblx0Ly8gdGhlIHBpY2tlciBhcyBhIHJhdywgdW5sb2NhbGl6ZWQgdmFsdWUgd2l0aCBubyBkZXNjcmlwdGlvbi5cblx0dGVzdCgnZXZlcnkgbGV2ZWwgaGFzIGEgbG9jYWxpemVkIGxhYmVsIGFuZCBkZXNjcmlwdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVhc29uaW5nRWZmb3J0TGV2ZWxzLm1hcChsZXZlbCA9PiBbbGV2ZWwsIGdldFJlYXNvbmluZ0VmZm9ydExhYmVsKGxldmVsKSwgZ2V0UmVhc29uaW5nRWZmb3J0RGVzY3JpcHRpb24obGV2ZWwpXSksXG5cdFx0XHRbXG5cdFx0XHRcdFsnbm9uZScsICdOb25lJywgJ05vIHJlYXNvbmluZyBhcHBsaWVkJ10sXG5cdFx0XHRcdFsnbWluaW1hbCcsICdNaW5pbWFsJywgJ01pbmltYWwgcmVhc29uaW5nIGZvciBmYXN0ZXN0IHJlc3BvbnNlcyddLFxuXHRcdFx0XHRbJ2xvdycsICdMb3cnLCAnRmFzdGVyIHJlc3BvbnNlcyB3aXRoIGxlc3MgcmVhc29uaW5nJ10sXG5cdFx0XHRcdFsnbWVkaXVtJywgJ01lZGl1bScsICdCYWxhbmNlZCByZWFzb25pbmcgYW5kIHNwZWVkJ10sXG5cdFx0XHRcdFsnaGlnaCcsICdIaWdoJywgJ0dyZWF0ZXIgcmVhc29uaW5nIGRlcHRoIGJ1dCBzbG93ZXInXSxcblx0XHRcdFx0Wyd4aGlnaCcsICdFeHRyYSBIaWdoJywgJ0hpZ2hlc3QgcmVhc29uaW5nIGRlcHRoIGJ1dCBzbG93ZXN0J10sXG5cdFx0XHRcdFsnbWF4JywgJ01heCcsICdBYnNvbHV0ZSBtYXhpbXVtIGNhcGFiaWxpdHkgd2l0aCBubyBjb25zdHJhaW50cyddLFxuXHRcdFx0XHRbJ3VsdHJhJywgJ1VsdHJhJywgJ01heGltdW0gcmVhc29uaW5nIHdpdGggYXV0b21hdGljIHRhc2sgZGVsZWdhdGlvbiddLFxuXHRcdFx0XSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBhIGRlZmF1bHQgc28gdGhlIHBpY2tlciBuZXZlciByZW5kZXJzIGFuIHVuZGVmaW5lZCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRyZXNvbHZlRGVmYXVsdFJlYXNvbmluZ0VmZm9ydChbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCddLCAnaGlnaCcsICdncHQtNScpLFxuXHRcdFx0cmVzb2x2ZURlZmF1bHRSZWFzb25pbmdFZmZvcnQoWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnXSwgdW5kZWZpbmVkLCAnZ3B0LTUnKSxcblx0XHRcdHJlc29sdmVEZWZhdWx0UmVhc29uaW5nRWZmb3J0KFsnbG93JywgJ21lZGl1bScsICdoaWdoJ10sICdub25zZW5zZScsICdncHQtNScpLFxuXHRcdFx0cmVzb2x2ZURlZmF1bHRSZWFzb25pbmdFZmZvcnQoWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnXSwgdW5kZWZpbmVkLCAnY2xhdWRlLW9wdXMtNScpLFxuXHRcdFx0cmVzb2x2ZURlZmF1bHRSZWFzb25pbmdFZmZvcnQoWydtaW5pbWFsJywgJ21heCddLCB1bmRlZmluZWQsICdncHQtNScpLFxuXHRcdFx0cmVzb2x2ZURlZmF1bHRSZWFzb25pbmdFZmZvcnQoW10sIHVuZGVmaW5lZCwgJ2dwdC01JyksXG5cdFx0XHRyZXNvbHZlRGVmYXVsdFJlYXNvbmluZ0VmZm9ydCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ2dwdC01JyksXG5cdFx0XSwgW1xuXHRcdFx0J2hpZ2gnLFxuXHRcdFx0J21lZGl1bScsXG5cdFx0XHQnbWVkaXVtJyxcblx0XHRcdCdoaWdoJyxcblx0XHRcdCdtaW5pbWFsJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLCtCQUErQix5QkFBeUIsdUJBQXVCLHFDQUFxQztBQUU3SCxNQUFNLG1CQUFtQixNQUFNO0FBRTlCLDBDQUF3QztBQUl4QyxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFdBQU87QUFBQSxNQUNOLHNCQUFzQixJQUFJLFdBQVMsQ0FBQyxPQUFPLHdCQUF3QixLQUFLLEdBQUcsOEJBQThCLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDaEg7QUFBQSxRQUNDLENBQUMsUUFBUSxRQUFRLHNCQUFzQjtBQUFBLFFBQ3ZDLENBQUMsV0FBVyxXQUFXLHlDQUF5QztBQUFBLFFBQ2hFLENBQUMsT0FBTyxPQUFPLHNDQUFzQztBQUFBLFFBQ3JELENBQUMsVUFBVSxVQUFVLDhCQUE4QjtBQUFBLFFBQ25ELENBQUMsUUFBUSxRQUFRLG9DQUFvQztBQUFBLFFBQ3JELENBQUMsU0FBUyxjQUFjLHFDQUFxQztBQUFBLFFBQzdELENBQUMsT0FBTyxPQUFPLGlEQUFpRDtBQUFBLFFBQ2hFLENBQUMsU0FBUyxTQUFTLGtEQUFrRDtBQUFBLE1BQ3RFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseUVBQXlFLE1BQU07QUFDbkYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0Qiw4QkFBOEIsQ0FBQyxPQUFPLFVBQVUsTUFBTSxHQUFHLFFBQVEsT0FBTztBQUFBLE1BQ3hFLDhCQUE4QixDQUFDLE9BQU8sVUFBVSxNQUFNLEdBQUcsUUFBVyxPQUFPO0FBQUEsTUFDM0UsOEJBQThCLENBQUMsT0FBTyxVQUFVLE1BQU0sR0FBRyxZQUFZLE9BQU87QUFBQSxNQUM1RSw4QkFBOEIsQ0FBQyxPQUFPLFVBQVUsTUFBTSxHQUFHLFFBQVcsZUFBZTtBQUFBLE1BQ25GLDhCQUE4QixDQUFDLFdBQVcsS0FBSyxHQUFHLFFBQVcsT0FBTztBQUFBLE1BQ3BFLDhCQUE4QixDQUFDLEdBQUcsUUFBVyxPQUFPO0FBQUEsTUFDcEQsOEJBQThCLFFBQVcsUUFBVyxPQUFPO0FBQUEsSUFDNUQsR0FBRztBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
