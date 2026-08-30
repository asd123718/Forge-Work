import assert from "assert";
import { ProviderId } from "../../../../../editor/common/languages.js";
import { EditSources } from "../../../../../editor/common/textModelEditSource.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { EditSourceBase } from "../../browser/helpers/documentWithAnnotatedEdits.js";
import { getEditTelemetryCategory } from "../../browser/telemetry/editSourceTrackingImpl.js";
suite("Edit Telemetry Source Categories", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps every edit source category", () => {
    const sources = {
      chat: EditSources.chatApplyEdits({
        modelId: void 0,
        sessionId: void 0,
        requestId: void 0,
        languageId: "typescript",
        mode: "agent",
        extensionId: void 0,
        codeBlockSuggestionId: void 0
      }),
      copilotCompletion: EditSources.inlineCompletionAccept({
        nes: false,
        requestUuid: "request-1",
        languageId: "typescript",
        providerId: new ProviderId("github.copilot", "1.0.0", "completions"),
        correlationId: void 0
      }),
      copilotChatCompletion: EditSources.inlineCompletionAccept({
        nes: false,
        requestUuid: "request-2",
        languageId: "typescript",
        providerId: new ProviderId("github.copilot-chat", "1.0.0", "completions"),
        correlationId: void 0
      }),
      nes: EditSources.inlineCompletionAccept({
        nes: true,
        requestUuid: "request-3",
        languageId: "typescript",
        providerId: new ProviderId("github.copilot-chat", "1.0.0", "nes"),
        correlationId: void 0
      }),
      inlineNesProvider: EditSources.inlineCompletionAccept({
        nes: false,
        requestUuid: "request-4",
        languageId: "typescript",
        providerId: new ProviderId("github.copilot-chat", "1.0.0", "nes"),
        correlationId: void 0
      }),
      otherCompletion: EditSources.inlineCompletionAccept({
        nes: false,
        requestUuid: "request-5",
        languageId: "typescript",
        providerId: new ProviderId("other.extension", "1.0.0", "other"),
        correlationId: void 0
      }),
      user: EditSources.cursor({ kind: "type" }),
      snippet: EditSources.snippet(),
      format: EditSources.unknown({ name: "formatEditsCommand" }),
      external: EditSources.reloadFromDisk(),
      unknown: EditSources.unknown({})
    };
    assert.deepStrictEqual(Object.fromEntries(Object.entries(sources).map(([key, source]) => [
      key,
      getEditTelemetryCategory(EditSourceBase.create(source))
    ])), {
      chat: "otherAI",
      copilotCompletion: "inlineCompletionsCopilot",
      copilotChatCompletion: "inlineCompletionsCopilot",
      nes: "nes",
      inlineNesProvider: "inlineCompletionsNES",
      otherCompletion: "inlineCompletionsOther",
      user: "user",
      snippet: "ide",
      format: "ide",
      external: "external",
      unknown: "unknown"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRUZWxlbWV0cnlcXHRlc3RcXGJyb3dzZXJcXGVkaXRTb3VyY2VDYXRlZ29yaWVzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlQmFzZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9kb2N1bWVudFdpdGhBbm5vdGF0ZWRFZGl0cy5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0VGVsZW1ldHJ5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi9icm93c2VyL3RlbGVtZXRyeS9lZGl0U291cmNlVHJhY2tpbmdJbXBsLmpzJztcblxuc3VpdGUoJ0VkaXQgVGVsZW1ldHJ5IFNvdXJjZSBDYXRlZ29yaWVzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXBzIGV2ZXJ5IGVkaXQgc291cmNlIGNhdGVnb3J5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZXMgPSB7XG5cdFx0XHRjaGF0OiBFZGl0U291cmNlcy5jaGF0QXBwbHlFZGl0cyh7XG5cdFx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Vzc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0fSksXG5cdFx0XHRjb3BpbG90Q29tcGxldGlvbjogRWRpdFNvdXJjZXMuaW5saW5lQ29tcGxldGlvbkFjY2VwdCh7XG5cdFx0XHRcdG5lczogZmFsc2UsXG5cdFx0XHRcdHJlcXVlc3RVdWlkOiAncmVxdWVzdC0xJyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdFx0XHRwcm92aWRlcklkOiBuZXcgUHJvdmlkZXJJZCgnZ2l0aHViLmNvcGlsb3QnLCAnMS4wLjAnLCAnY29tcGxldGlvbnMnKSxcblx0XHRcdFx0Y29ycmVsYXRpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0fSksXG5cdFx0XHRjb3BpbG90Q2hhdENvbXBsZXRpb246IEVkaXRTb3VyY2VzLmlubGluZUNvbXBsZXRpb25BY2NlcHQoe1xuXHRcdFx0XHRuZXM6IGZhbHNlLFxuXHRcdFx0XHRyZXF1ZXN0VXVpZDogJ3JlcXVlc3QtMicsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHRcdFx0cHJvdmlkZXJJZDogbmV3IFByb3ZpZGVySWQoJ2dpdGh1Yi5jb3BpbG90LWNoYXQnLCAnMS4wLjAnLCAnY29tcGxldGlvbnMnKSxcblx0XHRcdFx0Y29ycmVsYXRpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0fSksXG5cdFx0XHRuZXM6IEVkaXRTb3VyY2VzLmlubGluZUNvbXBsZXRpb25BY2NlcHQoe1xuXHRcdFx0XHRuZXM6IHRydWUsXG5cdFx0XHRcdHJlcXVlc3RVdWlkOiAncmVxdWVzdC0zJyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdFx0XHRwcm92aWRlcklkOiBuZXcgUHJvdmlkZXJJZCgnZ2l0aHViLmNvcGlsb3QtY2hhdCcsICcxLjAuMCcsICduZXMnKSxcblx0XHRcdFx0Y29ycmVsYXRpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0fSksXG5cdFx0XHRpbmxpbmVOZXNQcm92aWRlcjogRWRpdFNvdXJjZXMuaW5saW5lQ29tcGxldGlvbkFjY2VwdCh7XG5cdFx0XHRcdG5lczogZmFsc2UsXG5cdFx0XHRcdHJlcXVlc3RVdWlkOiAncmVxdWVzdC00Jyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdFx0XHRwcm92aWRlcklkOiBuZXcgUHJvdmlkZXJJZCgnZ2l0aHViLmNvcGlsb3QtY2hhdCcsICcxLjAuMCcsICduZXMnKSxcblx0XHRcdFx0Y29ycmVsYXRpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0fSksXG5cdFx0XHRvdGhlckNvbXBsZXRpb246IEVkaXRTb3VyY2VzLmlubGluZUNvbXBsZXRpb25BY2NlcHQoe1xuXHRcdFx0XHRuZXM6IGZhbHNlLFxuXHRcdFx0XHRyZXF1ZXN0VXVpZDogJ3JlcXVlc3QtNScsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHRcdFx0cHJvdmlkZXJJZDogbmV3IFByb3ZpZGVySWQoJ290aGVyLmV4dGVuc2lvbicsICcxLjAuMCcsICdvdGhlcicpLFxuXHRcdFx0XHRjb3JyZWxhdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHR9KSxcblx0XHRcdHVzZXI6IEVkaXRTb3VyY2VzLmN1cnNvcih7IGtpbmQ6ICd0eXBlJyB9KSxcblx0XHRcdHNuaXBwZXQ6IEVkaXRTb3VyY2VzLnNuaXBwZXQoKSxcblx0XHRcdGZvcm1hdDogRWRpdFNvdXJjZXMudW5rbm93bih7IG5hbWU6ICdmb3JtYXRFZGl0c0NvbW1hbmQnIH0pLFxuXHRcdFx0ZXh0ZXJuYWw6IEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCksXG5cdFx0XHR1bmtub3duOiBFZGl0U291cmNlcy51bmtub3duKHt9KSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMoc291cmNlcykubWFwKChba2V5LCBzb3VyY2VdKSA9PiBbXG5cdFx0XHRrZXksXG5cdFx0XHRnZXRFZGl0VGVsZW1ldHJ5Q2F0ZWdvcnkoRWRpdFNvdXJjZUJhc2UuY3JlYXRlKHNvdXJjZSkpLFxuXHRcdF0pKSwge1xuXHRcdFx0Y2hhdDogJ290aGVyQUknLFxuXHRcdFx0Y29waWxvdENvbXBsZXRpb246ICdpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3QnLFxuXHRcdFx0Y29waWxvdENoYXRDb21wbGV0aW9uOiAnaW5saW5lQ29tcGxldGlvbnNDb3BpbG90Jyxcblx0XHRcdG5lczogJ25lcycsXG5cdFx0XHRpbmxpbmVOZXNQcm92aWRlcjogJ2lubGluZUNvbXBsZXRpb25zTkVTJyxcblx0XHRcdG90aGVyQ29tcGxldGlvbjogJ2lubGluZUNvbXBsZXRpb25zT3RoZXInLFxuXHRcdFx0dXNlcjogJ3VzZXInLFxuXHRcdFx0c25pcHBldDogJ2lkZScsXG5cdFx0XHRmb3JtYXQ6ICdpZGUnLFxuXHRcdFx0ZXh0ZXJuYWw6ICdleHRlcm5hbCcsXG5cdFx0XHR1bmtub3duOiAndW5rbm93bicsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFFekMsTUFBTSxvQ0FBb0MsTUFBTTtBQUMvQywwQ0FBd0M7QUFFeEMsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxVQUFNLFVBQVU7QUFBQSxNQUNmLE1BQU0sWUFBWSxlQUFlO0FBQUEsUUFDaEMsU0FBUztBQUFBLFFBQ1QsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLFFBQ1osTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsdUJBQXVCO0FBQUEsTUFDeEIsQ0FBQztBQUFBLE1BQ0QsbUJBQW1CLFlBQVksdUJBQXVCO0FBQUEsUUFDckQsS0FBSztBQUFBLFFBQ0wsYUFBYTtBQUFBLFFBQ2IsWUFBWTtBQUFBLFFBQ1osWUFBWSxJQUFJLFdBQVcsa0JBQWtCLFNBQVMsYUFBYTtBQUFBLFFBQ25FLGVBQWU7QUFBQSxNQUNoQixDQUFDO0FBQUEsTUFDRCx1QkFBdUIsWUFBWSx1QkFBdUI7QUFBQSxRQUN6RCxLQUFLO0FBQUEsUUFDTCxhQUFhO0FBQUEsUUFDYixZQUFZO0FBQUEsUUFDWixZQUFZLElBQUksV0FBVyx1QkFBdUIsU0FBUyxhQUFhO0FBQUEsUUFDeEUsZUFBZTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxNQUNELEtBQUssWUFBWSx1QkFBdUI7QUFBQSxRQUN2QyxLQUFLO0FBQUEsUUFDTCxhQUFhO0FBQUEsUUFDYixZQUFZO0FBQUEsUUFDWixZQUFZLElBQUksV0FBVyx1QkFBdUIsU0FBUyxLQUFLO0FBQUEsUUFDaEUsZUFBZTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxNQUNELG1CQUFtQixZQUFZLHVCQUF1QjtBQUFBLFFBQ3JELEtBQUs7QUFBQSxRQUNMLGFBQWE7QUFBQSxRQUNiLFlBQVk7QUFBQSxRQUNaLFlBQVksSUFBSSxXQUFXLHVCQUF1QixTQUFTLEtBQUs7QUFBQSxRQUNoRSxlQUFlO0FBQUEsTUFDaEIsQ0FBQztBQUFBLE1BQ0QsaUJBQWlCLFlBQVksdUJBQXVCO0FBQUEsUUFDbkQsS0FBSztBQUFBLFFBQ0wsYUFBYTtBQUFBLFFBQ2IsWUFBWTtBQUFBLFFBQ1osWUFBWSxJQUFJLFdBQVcsbUJBQW1CLFNBQVMsT0FBTztBQUFBLFFBQzlELGVBQWU7QUFBQSxNQUNoQixDQUFDO0FBQUEsTUFDRCxNQUFNLFlBQVksT0FBTyxFQUFFLE1BQU0sT0FBTyxDQUFDO0FBQUEsTUFDekMsU0FBUyxZQUFZLFFBQVE7QUFBQSxNQUM3QixRQUFRLFlBQVksUUFBUSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFBQSxNQUMxRCxVQUFVLFlBQVksZUFBZTtBQUFBLE1BQ3JDLFNBQVMsWUFBWSxRQUFRLENBQUMsQ0FBQztBQUFBLElBQ2hDO0FBRUEsV0FBTyxnQkFBZ0IsT0FBTyxZQUFZLE9BQU8sUUFBUSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsS0FBSyxNQUFNLE1BQU07QUFBQSxNQUN4RjtBQUFBLE1BQ0EseUJBQXlCLGVBQWUsT0FBTyxNQUFNLENBQUM7QUFBQSxJQUN2RCxDQUFDLENBQUMsR0FBRztBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sbUJBQW1CO0FBQUEsTUFDbkIsdUJBQXVCO0FBQUEsTUFDdkIsS0FBSztBQUFBLE1BQ0wsbUJBQW1CO0FBQUEsTUFDbkIsaUJBQWlCO0FBQUEsTUFDakIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsU0FBUztBQUFBLElBQ1YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
