import * as assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { allocateCodexProviderId, codexProviderSecretResource, codexProviderStoredApiKeyEnv, discoversCodexLocalModels, enabledCodexPickerModels, isEmptyCodexModelsConfig, listCodexModelCatalog, normalizeCodexModelsConfig, preferCodexModelsConfig } from "../../common/codexModelsConfig.js";
suite("Codex models configuration", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("normalizes provider authentication without retaining plaintext keys", () => {
    assert.deepStrictEqual(normalizeCodexModelsConfig({
      model: "qwen3-coder",
      modelProvider: "local-ollama",
      providers: [{
        id: " local-ollama ",
        name: "Local Ollama",
        baseUrl: "http://localhost:11434/v1",
        envKey: codexProviderStoredApiKeyEnv("local-ollama"),
        kind: "ollama",
        wireApi: "responses"
      }]
    }), {
      model: "qwen3-coder",
      modelProvider: "local-ollama",
      activeProviderId: "local-ollama",
      providers: [{
        id: "local-ollama",
        catalogId: "ollama",
        name: "Local Ollama",
        baseUrl: "http://localhost:11434/v1",
        envKey: "FORGE_CODEX_PROVIDER_LOCAL_OLLAMA_API_KEY",
        kind: "ollama",
        authMode: "none",
        wireApi: "responses",
        enabled: true,
        models: [],
        selectedModel: ""
      }]
    });
  });
  test("uses stable secret resource and environment names", () => {
    assert.strictEqual(codexProviderSecretResource("my provider"), "https://forge.local/codex/model-provider/my%20provider");
    assert.strictEqual(codexProviderStoredApiKeyEnv("open-router"), "FORGE_CODEX_PROVIDER_OPEN_ROUTER_API_KEY");
  });
  test("ignores empty model snapshots so toml can fill them in", () => {
    assert.strictEqual(isEmptyCodexModelsConfig({ model: "", modelProvider: "", providers: [] }), true);
    assert.deepStrictEqual(preferCodexModelsConfig(
      { model: "", modelProvider: "", providers: [] },
      {
        model: "",
        modelProvider: "forge-ollama",
        providers: [{ id: "forge-ollama", catalogId: "ollama", name: "Ollama", kind: "ollama" }]
      }
    )?.modelProvider, "forge-ollama");
  });
  test("keeps saved models and enabled flags when switching providers", () => {
    const config = normalizeCodexModelsConfig({
      providers: [{
        id: "openai",
        catalogId: "openai",
        selectedModel: "gpt-5.6",
        enabled: true,
        models: [{ name: "gpt-5.6", enabled: true }, { name: "gpt-4.1", enabled: false }]
      }, {
        id: "ollama",
        catalogId: "ollama",
        enabled: false,
        models: [{ name: "qwen3-coder", enabled: true }]
      }]
    });
    assert.deepStrictEqual(enabledCodexPickerModels(config), [{ providerId: "openai", name: "gpt-5.6" }]);
    assert.strictEqual(allocateCodexProviderId("openai", config.providers.map((provider) => provider.id)), "openai-2");
  });
  test("lists model providers alphabetically by display name", () => {
    const labels = listCodexModelCatalog().map((entry) => entry.label);
    assert.deepStrictEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true })));
    assert.ok(labels.indexOf("Anthropic") < labels.indexOf("OpenAI"));
    assert.ok(labels.indexOf("DeepSeek") < labels.indexOf("Ollama"));
  });
  test("auto-detects local models only for Ollama", () => {
    assert.strictEqual(discoversCodexLocalModels("ollama"), true);
    assert.strictEqual(discoversCodexLocalModels("lmstudio"), false);
    assert.strictEqual(discoversCodexLocalModels("vllm"), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGNvZGV4TW9kZWxzQ29uZmlnLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgYWxsb2NhdGVDb2RleFByb3ZpZGVySWQsIGNvZGV4UHJvdmlkZXJTZWNyZXRSZXNvdXJjZSwgY29kZXhQcm92aWRlclN0b3JlZEFwaUtleUVudiwgZGlzY292ZXJzQ29kZXhMb2NhbE1vZGVscywgZW5hYmxlZENvZGV4UGlja2VyTW9kZWxzLCBpc0VtcHR5Q29kZXhNb2RlbHNDb25maWcsIGxpc3RDb2RleE1vZGVsQ2F0YWxvZywgbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcsIHByZWZlckNvZGV4TW9kZWxzQ29uZmlnIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvZGV4TW9kZWxzQ29uZmlnLmpzJztcblxuc3VpdGUoJ0NvZGV4IG1vZGVscyBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdub3JtYWxpemVzIHByb3ZpZGVyIGF1dGhlbnRpY2F0aW9uIHdpdGhvdXQgcmV0YWluaW5nIHBsYWludGV4dCBrZXlzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcoe1xuXHRcdFx0bW9kZWw6ICdxd2VuMy1jb2RlcicsXG5cdFx0XHRtb2RlbFByb3ZpZGVyOiAnbG9jYWwtb2xsYW1hJyxcblx0XHRcdHByb3ZpZGVyczogW3tcblx0XHRcdFx0aWQ6ICcgbG9jYWwtb2xsYW1hICcsXG5cdFx0XHRcdG5hbWU6ICdMb2NhbCBPbGxhbWEnLFxuXHRcdFx0XHRiYXNlVXJsOiAnaHR0cDovL2xvY2FsaG9zdDoxMTQzNC92MScsXG5cdFx0XHRcdGVudktleTogY29kZXhQcm92aWRlclN0b3JlZEFwaUtleUVudignbG9jYWwtb2xsYW1hJyksXG5cdFx0XHRcdGtpbmQ6ICdvbGxhbWEnLFxuXHRcdFx0XHR3aXJlQXBpOiAncmVzcG9uc2VzJyxcblx0XHRcdH1dLFxuXHRcdH0pLCB7XG5cdFx0XHRtb2RlbDogJ3F3ZW4zLWNvZGVyJyxcblx0XHRcdG1vZGVsUHJvdmlkZXI6ICdsb2NhbC1vbGxhbWEnLFxuXHRcdFx0YWN0aXZlUHJvdmlkZXJJZDogJ2xvY2FsLW9sbGFtYScsXG5cdFx0XHRwcm92aWRlcnM6IFt7XG5cdFx0XHRcdGlkOiAnbG9jYWwtb2xsYW1hJyxcblx0XHRcdFx0Y2F0YWxvZ0lkOiAnb2xsYW1hJyxcblx0XHRcdFx0bmFtZTogJ0xvY2FsIE9sbGFtYScsXG5cdFx0XHRcdGJhc2VVcmw6ICdodHRwOi8vbG9jYWxob3N0OjExNDM0L3YxJyxcblx0XHRcdFx0ZW52S2V5OiAnRk9SR0VfQ09ERVhfUFJPVklERVJfTE9DQUxfT0xMQU1BX0FQSV9LRVknLFxuXHRcdFx0XHRraW5kOiAnb2xsYW1hJyxcblx0XHRcdFx0YXV0aE1vZGU6ICdub25lJyxcblx0XHRcdFx0d2lyZUFwaTogJ3Jlc3BvbnNlcycsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRcdHNlbGVjdGVkTW9kZWw6ICcnLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgc3RhYmxlIHNlY3JldCByZXNvdXJjZSBhbmQgZW52aXJvbm1lbnQgbmFtZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGV4UHJvdmlkZXJTZWNyZXRSZXNvdXJjZSgnbXkgcHJvdmlkZXInKSwgJ2h0dHBzOi8vZm9yZ2UubG9jYWwvY29kZXgvbW9kZWwtcHJvdmlkZXIvbXklMjBwcm92aWRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RleFByb3ZpZGVyU3RvcmVkQXBpS2V5RW52KCdvcGVuLXJvdXRlcicpLCAnRk9SR0VfQ09ERVhfUFJPVklERVJfT1BFTl9ST1VURVJfQVBJX0tFWScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGVtcHR5IG1vZGVsIHNuYXBzaG90cyBzbyB0b21sIGNhbiBmaWxsIHRoZW0gaW4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRW1wdHlDb2RleE1vZGVsc0NvbmZpZyh7IG1vZGVsOiAnJywgbW9kZWxQcm92aWRlcjogJycsIHByb3ZpZGVyczogW10gfSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJlZmVyQ29kZXhNb2RlbHNDb25maWcoXG5cdFx0XHR7IG1vZGVsOiAnJywgbW9kZWxQcm92aWRlcjogJycsIHByb3ZpZGVyczogW10gfSxcblx0XHRcdHtcblx0XHRcdFx0bW9kZWw6ICcnLFxuXHRcdFx0XHRtb2RlbFByb3ZpZGVyOiAnZm9yZ2Utb2xsYW1hJyxcblx0XHRcdFx0cHJvdmlkZXJzOiBbeyBpZDogJ2ZvcmdlLW9sbGFtYScsIGNhdGFsb2dJZDogJ29sbGFtYScsIG5hbWU6ICdPbGxhbWEnLCBraW5kOiAnb2xsYW1hJyB9XSxcblx0XHRcdH0sXG5cdFx0KT8ubW9kZWxQcm92aWRlciwgJ2ZvcmdlLW9sbGFtYScpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBzYXZlZCBtb2RlbHMgYW5kIGVuYWJsZWQgZmxhZ3Mgd2hlbiBzd2l0Y2hpbmcgcHJvdmlkZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKHtcblx0XHRcdHByb3ZpZGVyczogW3tcblx0XHRcdFx0aWQ6ICdvcGVuYWknLFxuXHRcdFx0XHRjYXRhbG9nSWQ6ICdvcGVuYWknLFxuXHRcdFx0XHRzZWxlY3RlZE1vZGVsOiAnZ3B0LTUuNicsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdG1vZGVsczogW3sgbmFtZTogJ2dwdC01LjYnLCBlbmFibGVkOiB0cnVlIH0sIHsgbmFtZTogJ2dwdC00LjEnLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6ICdvbGxhbWEnLFxuXHRcdFx0XHRjYXRhbG9nSWQ6ICdvbGxhbWEnLFxuXHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0bW9kZWxzOiBbeyBuYW1lOiAncXdlbjMtY29kZXInLCBlbmFibGVkOiB0cnVlIH1dLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbmFibGVkQ29kZXhQaWNrZXJNb2RlbHMoY29uZmlnKSwgW3sgcHJvdmlkZXJJZDogJ29wZW5haScsIG5hbWU6ICdncHQtNS42JyB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFsbG9jYXRlQ29kZXhQcm92aWRlcklkKCdvcGVuYWknLCBjb25maWcucHJvdmlkZXJzLm1hcChwcm92aWRlciA9PiBwcm92aWRlci5pZCkpLCAnb3BlbmFpLTInKTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdHMgbW9kZWwgcHJvdmlkZXJzIGFscGhhYmV0aWNhbGx5IGJ5IGRpc3BsYXkgbmFtZScsICgpID0+IHtcblx0XHRjb25zdCBsYWJlbHMgPSBsaXN0Q29kZXhNb2RlbENhdGFsb2coKS5tYXAoZW50cnkgPT4gZW50cnkubGFiZWwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFiZWxzLCBbLi4ubGFiZWxzXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYiwgJ2VuJywgeyBzZW5zaXRpdml0eTogJ2Jhc2UnLCBudW1lcmljOiB0cnVlIH0pKSk7XG5cdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmRleE9mKCdBbnRocm9waWMnKSA8IGxhYmVscy5pbmRleE9mKCdPcGVuQUknKSk7XG5cdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmRleE9mKCdEZWVwU2VlaycpIDwgbGFiZWxzLmluZGV4T2YoJ09sbGFtYScpKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0by1kZXRlY3RzIGxvY2FsIG1vZGVscyBvbmx5IGZvciBPbGxhbWEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2NvdmVyc0NvZGV4TG9jYWxNb2RlbHMoJ29sbGFtYScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY292ZXJzQ29kZXhMb2NhbE1vZGVscygnbG1zdHVkaW8nKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcnNDb2RleExvY2FsTW9kZWxzKCd2bGxtJyksIGZhbHNlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHlCQUF5Qiw2QkFBNkIsOEJBQThCLDJCQUEyQiwwQkFBMEIsMEJBQTBCLHVCQUF1Qiw0QkFBNEIsK0JBQStCO0FBRTlQLE1BQU0sOEJBQThCLE1BQU07QUFDekMsMENBQXdDO0FBRXhDLE9BQUssdUVBQXVFLE1BQU07QUFDakYsV0FBTyxnQkFBZ0IsMkJBQTJCO0FBQUEsTUFDakQsT0FBTztBQUFBLE1BQ1AsZUFBZTtBQUFBLE1BQ2YsV0FBVyxDQUFDO0FBQUEsUUFDWCxJQUFJO0FBQUEsUUFDSixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsUUFDVCxRQUFRLDZCQUE2QixjQUFjO0FBQUEsUUFDbkQsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLE1BQ1YsQ0FBQztBQUFBLElBQ0YsQ0FBQyxHQUFHO0FBQUEsTUFDSCxPQUFPO0FBQUEsTUFDUCxlQUFlO0FBQUEsTUFDZixrQkFBa0I7QUFBQSxNQUNsQixXQUFXLENBQUM7QUFBQSxRQUNYLElBQUk7QUFBQSxRQUNKLFdBQVc7QUFBQSxRQUNYLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLFNBQVM7QUFBQSxRQUNULFNBQVM7QUFBQSxRQUNULFFBQVEsQ0FBQztBQUFBLFFBQ1QsZUFBZTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFdBQU8sWUFBWSw0QkFBNEIsYUFBYSxHQUFHLHdEQUF3RDtBQUN2SCxXQUFPLFlBQVksNkJBQTZCLGFBQWEsR0FBRywwQ0FBMEM7QUFBQSxFQUMzRyxDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxXQUFPLFlBQVkseUJBQXlCLEVBQUUsT0FBTyxJQUFJLGVBQWUsSUFBSSxXQUFXLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSTtBQUNsRyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLEVBQUUsT0FBTyxJQUFJLGVBQWUsSUFBSSxXQUFXLENBQUMsRUFBRTtBQUFBLE1BQzlDO0FBQUEsUUFDQyxPQUFPO0FBQUEsUUFDUCxlQUFlO0FBQUEsUUFDZixXQUFXLENBQUMsRUFBRSxJQUFJLGdCQUFnQixXQUFXLFVBQVUsTUFBTSxVQUFVLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDeEY7QUFBQSxJQUNELEdBQUcsZUFBZSxjQUFjO0FBQUEsRUFDakMsQ0FBQztBQUVELE9BQUssaUVBQWlFLE1BQU07QUFDM0UsVUFBTSxTQUFTLDJCQUEyQjtBQUFBLE1BQ3pDLFdBQVcsQ0FBQztBQUFBLFFBQ1gsSUFBSTtBQUFBLFFBQ0osV0FBVztBQUFBLFFBQ1gsZUFBZTtBQUFBLFFBQ2YsU0FBUztBQUFBLFFBQ1QsUUFBUSxDQUFDLEVBQUUsTUFBTSxXQUFXLFNBQVMsS0FBSyxHQUFHLEVBQUUsTUFBTSxXQUFXLFNBQVMsTUFBTSxDQUFDO0FBQUEsTUFDakYsR0FBRztBQUFBLFFBQ0YsSUFBSTtBQUFBLFFBQ0osV0FBVztBQUFBLFFBQ1gsU0FBUztBQUFBLFFBQ1QsUUFBUSxDQUFDLEVBQUUsTUFBTSxlQUFlLFNBQVMsS0FBSyxDQUFDO0FBQUEsTUFDaEQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFdBQU8sZ0JBQWdCLHlCQUF5QixNQUFNLEdBQUcsQ0FBQyxFQUFFLFlBQVksVUFBVSxNQUFNLFVBQVUsQ0FBQyxDQUFDO0FBQ3BHLFdBQU8sWUFBWSx3QkFBd0IsVUFBVSxPQUFPLFVBQVUsSUFBSSxjQUFZLFNBQVMsRUFBRSxDQUFDLEdBQUcsVUFBVTtBQUFBLEVBQ2hILENBQUM7QUFFRCxPQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLFVBQU0sU0FBUyxzQkFBc0IsRUFBRSxJQUFJLFdBQVMsTUFBTSxLQUFLO0FBQy9ELFdBQU8sZ0JBQWdCLFFBQVEsQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxHQUFHLE1BQU0sRUFBRSxhQUFhLFFBQVEsU0FBUyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzNILFdBQU8sR0FBRyxPQUFPLFFBQVEsV0FBVyxJQUFJLE9BQU8sUUFBUSxRQUFRLENBQUM7QUFDaEUsV0FBTyxHQUFHLE9BQU8sUUFBUSxVQUFVLElBQUksT0FBTyxRQUFRLFFBQVEsQ0FBQztBQUFBLEVBQ2hFLENBQUM7QUFFRCxPQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELFdBQU8sWUFBWSwwQkFBMEIsUUFBUSxHQUFHLElBQUk7QUFDNUQsV0FBTyxZQUFZLDBCQUEwQixVQUFVLEdBQUcsS0FBSztBQUMvRCxXQUFPLFlBQVksMEJBQTBCLE1BQU0sR0FBRyxLQUFLO0FBQUEsRUFDNUQsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
