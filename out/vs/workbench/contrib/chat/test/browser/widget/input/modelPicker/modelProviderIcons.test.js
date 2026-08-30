import assert from "assert";
import { Codicon } from "../../../../../../../../base/common/codicons.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { getModelPickerIcon, getModelProviderIcon } from "../../../../../browser/widget/input/modelPicker/modelProviderIcons.js";
function createModel(id, name, vendor = "copilot", metadata) {
  return {
    identifier: `${vendor}-${id}`,
    metadata: {
      id,
      name,
      vendor,
      version: id,
      family: vendor,
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      ...metadata
    }
  };
}
suite("ModelProviderIcons", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("uses provider-specific icons", () => {
    assert.deepStrictEqual([
      getModelProviderIcon(createModel("gpt-5.6-terra", "GPT-5.6 Terra")).id,
      getModelProviderIcon(createModel("claude-sonnet-5", "Claude Sonnet 5")).id,
      getModelProviderIcon(createModel("gemini-3.1-pro", "Gemini 3.1 Pro")).id,
      getModelProviderIcon(createModel("kimi-k2.5", "Kimi K2.5")).id,
      getModelProviderIcon(createModel("grok-4.5", "Grok 4.5")).id,
      getModelProviderIcon(createModel("grok-code-fast-1", "Grok Code Fast 1", "agent-host-copilot")).id,
      getModelProviderIcon(createModel("grok-4", "Grok 4", "xai", { isBYOK: true })).id,
      getModelProviderIcon(createModel("mai-ds-r1", "MAI-DS-R1")).id,
      getModelProviderIcon(createModel("deepseek-v4-pro", "DeepSeek V4 Pro")).id,
      getModelProviderIcon(createModel("auto", "Auto")).id,
      getModelProviderIcon(createModel("auto", "Auto", "anthropic")).id,
      getModelProviderIcon(createModel("custom", "Custom Model", "third-party")).id,
      getModelProviderIcon(createModel("claude-sonnet-5", "Claude Sonnet 5", "anthropic", { isBYOK: true })).id,
      getModelProviderIcon(createModel("gemini-3.1-pro", "Gemini 3.1 Pro", "google", { isBYOK: true })).id,
      getModelProviderIcon(createModel("auto", "Auto", "openai", { isBYOK: true })).id
    ], [
      "chat-model-provider-openai",
      "chat-model-provider-claude",
      "chat-model-provider-gemini",
      "chat-model-provider-kimi",
      "chat-model-provider-xai",
      "chat-model-provider-xai",
      "chat-model-provider-xai",
      "chat-model-provider-microsoft",
      "chat-model-provider-generic",
      "chat-model-provider-copilot",
      "chat-model-provider-copilot",
      "chat-model-provider-generic",
      "chat-model-provider-generic",
      "chat-model-provider-generic",
      "chat-model-provider-generic"
    ]);
  });
  test("status icon wins, warning text keeps provider icon", () => {
    const model = createModel("gpt-5.6-terra", "GPT-5.6 Terra");
    const modelWithStatusIcon = { ...model, metadata: { ...model.metadata, statusIcon: Codicon.info } };
    const modelWithWarningText = { ...model, metadata: { ...model.metadata, warningText: { degradation: "Degraded" } } };
    assert.deepStrictEqual([
      getModelPickerIcon(modelWithStatusIcon).id,
      getModelPickerIcon(modelWithWarningText).id
    ], [
      Codicon.info.id,
      getModelProviderIcon(model).id
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXG1vZGVsUGlja2VyXFxtb2RlbFByb3ZpZGVySWNvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldE1vZGVsUGlja2VySWNvbiwgZ2V0TW9kZWxQcm92aWRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9tb2RlbFBpY2tlci9tb2RlbFByb3ZpZGVySWNvbnMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vZGVsKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVuZG9yID0gJ2NvcGlsb3QnLCBtZXRhZGF0YT86IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyOiBgJHt2ZW5kb3J9LSR7aWR9YCxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0aWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0dmVuZG9yLFxuXHRcdFx0dmVyc2lvbjogaWQsXG5cdFx0XHRmYW1pbHk6IHZlbmRvcixcblx0XHRcdG1heElucHV0VG9rZW5zOiAxMjgwMDAsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDQwOTYsXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHQuLi5tZXRhZGF0YSxcblx0XHR9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHR9O1xufVxuXG5zdWl0ZSgnTW9kZWxQcm92aWRlckljb25zJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3VzZXMgcHJvdmlkZXItc3BlY2lmaWMgaWNvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRNb2RlbFByb3ZpZGVySWNvbihjcmVhdGVNb2RlbCgnZ3B0LTUuNi10ZXJyYScsICdHUFQtNS42IFRlcnJhJykpLmlkLFxuXHRcdFx0Z2V0TW9kZWxQcm92aWRlckljb24oY3JlYXRlTW9kZWwoJ2NsYXVkZS1zb25uZXQtNScsICdDbGF1ZGUgU29ubmV0IDUnKSkuaWQsXG5cdFx0XHRnZXRNb2RlbFByb3ZpZGVySWNvbihjcmVhdGVNb2RlbCgnZ2VtaW5pLTMuMS1wcm8nLCAnR2VtaW5pIDMuMSBQcm8nKSkuaWQsXG5cdFx0XHRnZXRNb2RlbFByb3ZpZGVySWNvbihjcmVhdGVNb2RlbCgna2ltaS1rMi41JywgJ0tpbWkgSzIuNScpKS5pZCxcblx0XHRcdGdldE1vZGVsUHJvdmlkZXJJY29uKGNyZWF0ZU1vZGVsKCdncm9rLTQuNScsICdHcm9rIDQuNScpKS5pZCxcblx0XHRcdGdldE1vZGVsUHJvdmlkZXJJY29uKGNyZWF0ZU1vZGVsKCdncm9rLWNvZGUtZmFzdC0xJywgJ0dyb2sgQ29kZSBGYXN0IDEnLCAnYWdlbnQtaG9zdC1jb3BpbG90JykpLmlkLFxuXHRcdFx0Z2V0TW9kZWxQcm92aWRlckljb24oY3JlYXRlTW9kZWwoJ2dyb2stNCcsICdHcm9rIDQnLCAneGFpJywgeyBpc0JZT0s6IHRydWUgfSkpLmlkLFxuXHRcdFx0Z2V0TW9kZWxQcm92aWRlckljb24oY3JlYXRlTW9kZWwoJ21haS1kcy1yMScsICdNQUktRFMtUjEnKSkuaWQsXG5cdFx0XHRnZXRNb2RlbFByb3ZpZGVySWNvbihjcmVhdGVNb2RlbCgnZGVlcHNlZWstdjQtcHJvJywgJ0RlZXBTZWVrIFY0IFBybycpKS5pZCxcblx0XHRcdGdldE1vZGVsUHJvdmlkZXJJY29uKGNyZWF0ZU1vZGVsKCdhdXRvJywgJ0F1dG8nKSkuaWQsXG5cdFx0XHRnZXRNb2RlbFByb3ZpZGVySWNvbihjcmVhdGVNb2RlbCgnYXV0bycsICdBdXRvJywgJ2FudGhyb3BpYycpKS5pZCxcblx0XHRcdGdldE1vZGVsUHJvdmlkZXJJY29uKGNyZWF0ZU1vZGVsKCdjdXN0b20nLCAnQ3VzdG9tIE1vZGVsJywgJ3RoaXJkLXBhcnR5JykpLmlkLFxuXHRcdFx0Z2V0TW9kZWxQcm92aWRlckljb24oY3JlYXRlTW9kZWwoJ2NsYXVkZS1zb25uZXQtNScsICdDbGF1ZGUgU29ubmV0IDUnLCAnYW50aHJvcGljJywgeyBpc0JZT0s6IHRydWUgfSkpLmlkLFxuXHRcdFx0Z2V0TW9kZWxQcm92aWRlckljb24oY3JlYXRlTW9kZWwoJ2dlbWluaS0zLjEtcHJvJywgJ0dlbWluaSAzLjEgUHJvJywgJ2dvb2dsZScsIHsgaXNCWU9LOiB0cnVlIH0pKS5pZCxcblx0XHRcdGdldE1vZGVsUHJvdmlkZXJJY29uKGNyZWF0ZU1vZGVsKCdhdXRvJywgJ0F1dG8nLCAnb3BlbmFpJywgeyBpc0JZT0s6IHRydWUgfSkpLmlkLFxuXHRcdF0sIFtcblx0XHRcdCdjaGF0LW1vZGVsLXByb3ZpZGVyLW9wZW5haScsXG5cdFx0XHQnY2hhdC1tb2RlbC1wcm92aWRlci1jbGF1ZGUnLFxuXHRcdFx0J2NoYXQtbW9kZWwtcHJvdmlkZXItZ2VtaW5pJyxcblx0XHRcdCdjaGF0LW1vZGVsLXByb3ZpZGVyLWtpbWknLFxuXHRcdFx0J2NoYXQtbW9kZWwtcHJvdmlkZXIteGFpJyxcblx0XHRcdCdjaGF0LW1vZGVsLXByb3ZpZGVyLXhhaScsXG5cdFx0XHQnY2hhdC1tb2RlbC1wcm92aWRlci14YWknLFxuXHRcdFx0J2NoYXQtbW9kZWwtcHJvdmlkZXItbWljcm9zb2Z0Jyxcblx0XHRcdCdjaGF0LW1vZGVsLXByb3ZpZGVyLWdlbmVyaWMnLFxuXHRcdFx0J2NoYXQtbW9kZWwtcHJvdmlkZXItY29waWxvdCcsXG5cdFx0XHQnY2hhdC1tb2RlbC1wcm92aWRlci1jb3BpbG90Jyxcblx0XHRcdCdjaGF0LW1vZGVsLXByb3ZpZGVyLWdlbmVyaWMnLFxuXHRcdFx0J2NoYXQtbW9kZWwtcHJvdmlkZXItZ2VuZXJpYycsXG5cdFx0XHQnY2hhdC1tb2RlbC1wcm92aWRlci1nZW5lcmljJyxcblx0XHRcdCdjaGF0LW1vZGVsLXByb3ZpZGVyLWdlbmVyaWMnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0dXMgaWNvbiB3aW5zLCB3YXJuaW5nIHRleHQga2VlcHMgcHJvdmlkZXIgaWNvbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZU1vZGVsKCdncHQtNS42LXRlcnJhJywgJ0dQVC01LjYgVGVycmEnKTtcblx0XHRjb25zdCBtb2RlbFdpdGhTdGF0dXNJY29uID0geyAuLi5tb2RlbCwgbWV0YWRhdGE6IHsgLi4ubW9kZWwubWV0YWRhdGEsIHN0YXR1c0ljb246IENvZGljb24uaW5mbyB9IH07XG5cdFx0Y29uc3QgbW9kZWxXaXRoV2FybmluZ1RleHQgPSB7IC4uLm1vZGVsLCBtZXRhZGF0YTogeyAuLi5tb2RlbC5tZXRhZGF0YSwgd2FybmluZ1RleHQ6IHsgZGVncmFkYXRpb246ICdEZWdyYWRlZCcgfSB9IH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldE1vZGVsUGlja2VySWNvbihtb2RlbFdpdGhTdGF0dXNJY29uKS5pZCxcblx0XHRcdGdldE1vZGVsUGlja2VySWNvbihtb2RlbFdpdGhXYXJuaW5nVGV4dCkuaWQsXG5cdFx0XSwgW1xuXHRcdFx0Q29kaWNvbi5pbmZvLmlkLFxuXHRcdFx0Z2V0TW9kZWxQcm92aWRlckljb24obW9kZWwpLmlkLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQiw0QkFBNEI7QUFHekQsU0FBUyxZQUFZLElBQVksTUFBYyxTQUFTLFdBQVcsVUFBeUY7QUFDM0osU0FBTztBQUFBLElBQ04sWUFBWSxHQUFHLE1BQU0sSUFBSSxFQUFFO0FBQUEsSUFDM0IsVUFBVTtBQUFBLE1BQ1Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsc0JBQXNCLENBQUM7QUFBQSxNQUN2QixHQUFHO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sc0JBQXNCLE1BQU07QUFFakMsMENBQXdDO0FBRXhDLE9BQUssZ0NBQWdDLE1BQU07QUFDMUMsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixxQkFBcUIsWUFBWSxpQkFBaUIsZUFBZSxDQUFDLEVBQUU7QUFBQSxNQUNwRSxxQkFBcUIsWUFBWSxtQkFBbUIsaUJBQWlCLENBQUMsRUFBRTtBQUFBLE1BQ3hFLHFCQUFxQixZQUFZLGtCQUFrQixnQkFBZ0IsQ0FBQyxFQUFFO0FBQUEsTUFDdEUscUJBQXFCLFlBQVksYUFBYSxXQUFXLENBQUMsRUFBRTtBQUFBLE1BQzVELHFCQUFxQixZQUFZLFlBQVksVUFBVSxDQUFDLEVBQUU7QUFBQSxNQUMxRCxxQkFBcUIsWUFBWSxvQkFBb0Isb0JBQW9CLG9CQUFvQixDQUFDLEVBQUU7QUFBQSxNQUNoRyxxQkFBcUIsWUFBWSxVQUFVLFVBQVUsT0FBTyxFQUFFLFFBQVEsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUFBLE1BQy9FLHFCQUFxQixZQUFZLGFBQWEsV0FBVyxDQUFDLEVBQUU7QUFBQSxNQUM1RCxxQkFBcUIsWUFBWSxtQkFBbUIsaUJBQWlCLENBQUMsRUFBRTtBQUFBLE1BQ3hFLHFCQUFxQixZQUFZLFFBQVEsTUFBTSxDQUFDLEVBQUU7QUFBQSxNQUNsRCxxQkFBcUIsWUFBWSxRQUFRLFFBQVEsV0FBVyxDQUFDLEVBQUU7QUFBQSxNQUMvRCxxQkFBcUIsWUFBWSxVQUFVLGdCQUFnQixhQUFhLENBQUMsRUFBRTtBQUFBLE1BQzNFLHFCQUFxQixZQUFZLG1CQUFtQixtQkFBbUIsYUFBYSxFQUFFLFFBQVEsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUFBLE1BQ3ZHLHFCQUFxQixZQUFZLGtCQUFrQixrQkFBa0IsVUFBVSxFQUFFLFFBQVEsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUFBLE1BQ2xHLHFCQUFxQixZQUFZLFFBQVEsUUFBUSxVQUFVLEVBQUUsUUFBUSxLQUFLLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDL0UsR0FBRztBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxRQUFRLFlBQVksaUJBQWlCLGVBQWU7QUFDMUQsVUFBTSxzQkFBc0IsRUFBRSxHQUFHLE9BQU8sVUFBVSxFQUFFLEdBQUcsTUFBTSxVQUFVLFlBQVksUUFBUSxLQUFLLEVBQUU7QUFDbEcsVUFBTSx1QkFBdUIsRUFBRSxHQUFHLE9BQU8sVUFBVSxFQUFFLEdBQUcsTUFBTSxVQUFVLGFBQWEsRUFBRSxhQUFhLFdBQVcsRUFBRSxFQUFFO0FBRW5ILFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsbUJBQW1CLG1CQUFtQixFQUFFO0FBQUEsTUFDeEMsbUJBQW1CLG9CQUFvQixFQUFFO0FBQUEsSUFDMUMsR0FBRztBQUFBLE1BQ0YsUUFBUSxLQUFLO0FBQUEsTUFDYixxQkFBcUIsS0FBSyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
