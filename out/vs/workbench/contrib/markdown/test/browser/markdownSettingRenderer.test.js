import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ConfigurationScope, Extensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { SimpleSettingRenderer } from "../../browser/markdownSettingRenderer.js";
const configuration = {
  "id": "examples",
  "title": "Examples",
  "type": "object",
  "properties": {
    "example.booleanSetting": {
      "type": "boolean",
      "default": false,
      "scope": ConfigurationScope.APPLICATION
    },
    "example.booleanSetting2": {
      "type": "boolean",
      "default": true,
      "scope": ConfigurationScope.APPLICATION
    },
    "example.stringSetting": {
      "type": "string",
      "default": "one",
      "scope": ConfigurationScope.APPLICATION
    },
    "example.numberSetting": {
      "type": "number",
      "default": 3,
      "scope": ConfigurationScope.APPLICATION
    }
  }
};
class MarkdownConfigurationService extends TestConfigurationService {
  async updateValue(key, value) {
    const [section, setting] = key.split(".");
    return this.setUserConfiguration(section, { [setting]: value });
  }
}
suite("Markdown Setting Renderer Test", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let configurationService;
  let preferencesService;
  let contextMenuService;
  let settingRenderer;
  suiteSetup(() => {
    configurationService = new MarkdownConfigurationService();
    preferencesService = {
      getSetting: (setting) => {
        let type = "boolean";
        if (setting.includes("string")) {
          type = "string";
        }
        return { type, key: setting };
      }
    };
    contextMenuService = {};
    Registry.as(Extensions.Configuration).registerConfiguration(configuration);
    settingRenderer = new SimpleSettingRenderer(configurationService, contextMenuService, preferencesService, { publicLog2: () => {
    } }, { writeText: async () => {
    } });
  });
  suiteTeardown(() => {
    Registry.as(Extensions.Configuration).deregisterConfigurations([configuration]);
  });
  test("render code setting button with value", () => {
    const htmlRenderer = settingRenderer.getHtmlRenderer();
    const htmlNoValue = '<a href="code-oss://settings/example.booleanSetting" codesetting="true">';
    const renderedHtmlNoValue = htmlRenderer({ block: false, raw: htmlNoValue, pre: false, text: "", type: "html" });
    assert.strictEqual(
      renderedHtmlNoValue,
      `<code tabindex="0"><a href="code-setting://example.booleanSetting/true" class="codesetting" title="View or change setting" aria-role="button"><svg width="14" height="14" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z"/></svg>
			<span class="separator"></span>
			<span class="setting-name">example.booleanSetting</span>
		</a></code>`
    );
  });
  test("actions with no value", () => {
    const uri = URI.parse(settingRenderer.settingToUriString("example.booleanSetting"));
    const actions = settingRenderer.getActions(uri);
    assert.strictEqual(actions?.length, 2);
    assert.strictEqual(actions[0].label, 'View "Example: Boolean Setting" in Settings');
  });
  test("actions with value + updating and restoring", async () => {
    await configurationService.setUserConfiguration("example", { stringSetting: "two" });
    const uri = URI.parse(settingRenderer.settingToUriString("example.stringSetting", "three"));
    const verifyOriginalState = (actions2) => {
      assert.strictEqual(actions2?.length, 3);
      assert.strictEqual(actions2[0].label, 'Set "Example: String Setting" to "three"');
      assert.strictEqual(actions2[1].label, "View in Settings");
      assert.strictEqual(configurationService.getValue("example.stringSetting"), "two");
      return true;
    };
    const actions = settingRenderer.getActions(uri);
    if (verifyOriginalState(actions)) {
      await actions[0].run();
      assert.strictEqual(configurationService.getValue("example.stringSetting"), "three");
      const actionsUpdated = settingRenderer.getActions(uri);
      assert.strictEqual(actionsUpdated?.length, 3);
      assert.strictEqual(actionsUpdated[0].label, 'Restore value of "Example: String Setting"');
      assert.strictEqual(actions[1].label, "View in Settings");
      assert.strictEqual(actions[2].label, "Copy Setting ID");
      assert.strictEqual(configurationService.getValue("example.stringSetting"), "three");
      await actionsUpdated[0].run();
      verifyOriginalState(settingRenderer.getActions(uri));
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtkb3duXFx0ZXN0XFxicm93c2VyXFxtYXJrZG93blNldHRpbmdSZW5kZXJlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFNpbXBsZVNldHRpbmdSZW5kZXJlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFya2Rvd25TZXR0aW5nUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0J2lkJzogJ2V4YW1wbGVzJyxcblx0J3RpdGxlJzogJ0V4YW1wbGVzJyxcblx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0J2V4YW1wbGUuYm9vbGVhblNldHRpbmcnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05cblx0XHR9LFxuXHRcdCdleGFtcGxlLmJvb2xlYW5TZXR0aW5nMic6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OXG5cdFx0fSxcblx0XHQnZXhhbXBsZS5zdHJpbmdTZXR0aW5nJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdkZWZhdWx0JzogJ29uZScsXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05cblx0XHR9LFxuXHRcdCdleGFtcGxlLm51bWJlclNldHRpbmcnOiB7XG5cdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0J2RlZmF1bHQnOiAzLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OXG5cdFx0fVxuXHR9XG59O1xuXG5jbGFzcyBNYXJrZG93bkNvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBbc2VjdGlvbiwgc2V0dGluZ10gPSBrZXkuc3BsaXQoJy4nKTtcblx0XHRyZXR1cm4gdGhpcy5zZXRVc2VyQ29uZmlndXJhdGlvbihzZWN0aW9uLCB7IFtzZXR0aW5nXTogdmFsdWUgfSk7XG5cdH1cbn1cblxuc3VpdGUoJ01hcmtkb3duIFNldHRpbmcgUmVuZGVyZXIgVGVzdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2U7XG5cdGxldCBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2U7XG5cdGxldCBzZXR0aW5nUmVuZGVyZXI6IFNpbXBsZVNldHRpbmdSZW5kZXJlcjtcblxuXHRzdWl0ZVNldHVwKCgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBNYXJrZG93bkNvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0cHJlZmVyZW5jZXNTZXJ2aWNlID0gPElQcmVmZXJlbmNlc1NlcnZpY2U+e1xuXHRcdFx0Z2V0U2V0dGluZzogKHNldHRpbmcpID0+IHtcblx0XHRcdFx0bGV0IHR5cGUgPSAnYm9vbGVhbic7XG5cdFx0XHRcdGlmIChzZXR0aW5nLmluY2x1ZGVzKCdzdHJpbmcnKSkge1xuXHRcdFx0XHRcdHR5cGUgPSAnc3RyaW5nJztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyB0eXBlLCBrZXk6IHNldHRpbmcgfTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnRleHRNZW51U2VydmljZSA9IDxJQ29udGV4dE1lbnVTZXJ2aWNlPnt9O1xuXHRcdFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb24pO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHNldHRpbmdSZW5kZXJlciA9IG5ldyBTaW1wbGVTZXR0aW5nUmVuZGVyZXIoY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgcHJlZmVyZW5jZXNTZXJ2aWNlLCB7IHB1YmxpY0xvZzI6ICgpID0+IHsgfSB9IGFzIGFueSwgeyB3cml0ZVRleHQ6IGFzeW5jICgpID0+IHsgfSB9IGFzIGFueSk7XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oKCkgPT4ge1xuXHRcdFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtjb25maWd1cmF0aW9uXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlciBjb2RlIHNldHRpbmcgYnV0dG9uIHdpdGggdmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbFJlbmRlcmVyID0gc2V0dGluZ1JlbmRlcmVyLmdldEh0bWxSZW5kZXJlcigpO1xuXHRcdGNvbnN0IGh0bWxOb1ZhbHVlID0gJzxhIGhyZWY9XCJjb2RlLW9zczovL3NldHRpbmdzL2V4YW1wbGUuYm9vbGVhblNldHRpbmdcIiBjb2Rlc2V0dGluZz1cInRydWVcIj4nO1xuXHRcdGNvbnN0IHJlbmRlcmVkSHRtbE5vVmFsdWUgPSBodG1sUmVuZGVyZXIoeyBibG9jazogZmFsc2UsIHJhdzogaHRtbE5vVmFsdWUsIHByZTogZmFsc2UsIHRleHQ6ICcnLCB0eXBlOiAnaHRtbCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkSHRtbE5vVmFsdWUsXG5cdFx0XHRgPGNvZGUgdGFiaW5kZXg9XCIwXCI+PGEgaHJlZj1cImNvZGUtc2V0dGluZzovL2V4YW1wbGUuYm9vbGVhblNldHRpbmcvdHJ1ZVwiIGNsYXNzPVwiY29kZXNldHRpbmdcIiB0aXRsZT1cIlZpZXcgb3IgY2hhbmdlIHNldHRpbmdcIiBhcmlhLXJvbGU9XCJidXR0b25cIj48c3ZnIHdpZHRoPVwiMTRcIiBoZWlnaHQ9XCIxNFwiIHZpZXdCb3g9XCIwIDAgMTUgMTVcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgZmlsbD1cImN1cnJlbnRDb2xvclwiPjxwYXRoIGQ9XCJNOS4xIDQuNEw4LjYgMkg3LjRsLS41IDIuNC0uNy4zLTItMS4zLS45LjggMS4zIDItLjIuNy0yLjQuNXYxLjJsMi40LjUuMy44LTEuMyAyIC44LjggMi0xLjMuOC4zLjQgMi4zaDEuMmwuNS0yLjQuOC0uMyAyIDEuMy44LS44LTEuMy0yIC4zLS44IDIuMy0uNFY3LjRsLTIuNC0uNS0uMy0uOCAxLjMtMi0uOC0uOC0yIDEuMy0uNy0uMnpNOS40IDFsLjUgMi40TDEyIDIuMWwyIDItMS40IDIuMSAyLjQuNHYyLjhsLTIuNC41TDE0IDEybC0yIDItMi4xLTEuNC0uNSAyLjRINi42bC0uNS0yLjRMNCAxMy45bC0yLTIgMS40LTIuMUwxIDkuNFY2LjZsMi40LS41TDIuMSA0bDItMiAyLjEgMS40LjQtMi40aDIuOHptLjYgN2MwIDEuMS0uOSAyLTIgMnMtMi0uOS0yLTIgLjktMiAyLTIgMiAuOSAyIDJ6TTggOWMuNiAwIDEtLjQgMS0xcy0uNC0xLTEtMS0xIC40LTEgMSAuNCAxIDEgMXpcIi8+PC9zdmc+XG5cdFx0XHQ8c3BhbiBjbGFzcz1cInNlcGFyYXRvclwiPjwvc3Bhbj5cblx0XHRcdDxzcGFuIGNsYXNzPVwic2V0dGluZy1uYW1lXCI+ZXhhbXBsZS5ib29sZWFuU2V0dGluZzwvc3Bhbj5cblx0XHQ8L2E+PC9jb2RlPmApO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3Rpb25zIHdpdGggbm8gdmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHNldHRpbmdSZW5kZXJlci5zZXR0aW5nVG9VcmlTdHJpbmcoJ2V4YW1wbGUuYm9vbGVhblNldHRpbmcnKSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNldHRpbmdSZW5kZXJlci5nZXRBY3Rpb25zKHVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnM/Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0ubGFiZWwsICdWaWV3IFwiRXhhbXBsZTogQm9vbGVhbiBTZXR0aW5nXCIgaW4gU2V0dGluZ3MnKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aW9ucyB3aXRoIHZhbHVlICsgdXBkYXRpbmcgYW5kIHJlc3RvcmluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignZXhhbXBsZScsIHsgc3RyaW5nU2V0dGluZzogJ3R3bycgfSk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHNldHRpbmdSZW5kZXJlci5zZXR0aW5nVG9VcmlTdHJpbmcoJ2V4YW1wbGUuc3RyaW5nU2V0dGluZycsICd0aHJlZScpKTtcblxuXHRcdGNvbnN0IHZlcmlmeU9yaWdpbmFsU3RhdGUgPSAoYWN0aW9uczogSUFjdGlvbltdIHwgdW5kZWZpbmVkKTogYWN0aW9ucyBpcyBJQWN0aW9uW10gPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnM/Lmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ1NldCBcIkV4YW1wbGU6IFN0cmluZyBTZXR0aW5nXCIgdG8gXCJ0aHJlZVwiJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1sxXS5sYWJlbCwgJ1ZpZXcgaW4gU2V0dGluZ3MnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZXhhbXBsZS5zdHJpbmdTZXR0aW5nJyksICd0d28nKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gc2V0dGluZ1JlbmRlcmVyLmdldEFjdGlvbnModXJpKTtcblx0XHRpZiAodmVyaWZ5T3JpZ2luYWxTdGF0ZShhY3Rpb25zKSkge1xuXHRcdFx0Ly8gVXBkYXRlIHRoZSB2YWx1ZVxuXHRcdFx0YXdhaXQgYWN0aW9uc1swXS5ydW4oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZXhhbXBsZS5zdHJpbmdTZXR0aW5nJyksICd0aHJlZScpO1xuXHRcdFx0Y29uc3QgYWN0aW9uc1VwZGF0ZWQgPSBzZXR0aW5nUmVuZGVyZXIuZ2V0QWN0aW9ucyh1cmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNVcGRhdGVkPy5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNVcGRhdGVkWzBdLmxhYmVsLCAnUmVzdG9yZSB2YWx1ZSBvZiBcIkV4YW1wbGU6IFN0cmluZyBTZXR0aW5nXCInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzFdLmxhYmVsLCAnVmlldyBpbiBTZXR0aW5ncycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMl0ubGFiZWwsICdDb3B5IFNldHRpbmcgSUQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZXhhbXBsZS5zdHJpbmdTZXR0aW5nJyksICd0aHJlZScpO1xuXG5cdFx0XHQvLyBSZXN0b3JlIHRoZSB2YWx1ZVxuXHRcdFx0YXdhaXQgYWN0aW9uc1VwZGF0ZWRbMF0ucnVuKCk7XG5cdFx0XHR2ZXJpZnlPcmlnaW5hbFN0YXRlKHNldHRpbmdSZW5kZXJlci5nZXRBY3Rpb25zKHVyaSkpO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUVuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0Isa0JBQThEO0FBQzNGLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBR3RDLE1BQU0sZ0JBQW9DO0FBQUEsRUFDekMsTUFBTTtBQUFBLEVBQ04sU0FBUztBQUFBLEVBQ1QsUUFBUTtBQUFBLEVBQ1IsY0FBYztBQUFBLElBQ2IsMEJBQTBCO0FBQUEsTUFDekIsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsU0FBUyxtQkFBbUI7QUFBQSxJQUM3QjtBQUFBLElBQ0EsMkJBQTJCO0FBQUEsTUFDMUIsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsU0FBUyxtQkFBbUI7QUFBQSxJQUM3QjtBQUFBLElBQ0EseUJBQXlCO0FBQUEsTUFDeEIsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsU0FBUyxtQkFBbUI7QUFBQSxJQUM3QjtBQUFBLElBQ0EseUJBQXlCO0FBQUEsTUFDeEIsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsU0FBUyxtQkFBbUI7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0scUNBQXFDLHlCQUF5QjtBQUFBLEVBQ25FLE1BQWUsWUFBWSxLQUFhLE9BQTJCO0FBQ2xFLFVBQU0sQ0FBQyxTQUFTLE9BQU8sSUFBSSxJQUFJLE1BQU0sR0FBRztBQUN4QyxXQUFPLEtBQUsscUJBQXFCLFNBQVMsRUFBRSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7QUFBQSxFQUMvRDtBQUNEO0FBRUEsTUFBTSxrQ0FBa0MsTUFBTTtBQUM3QywwQ0FBd0M7QUFFeEMsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLGFBQVcsTUFBTTtBQUNoQiwyQkFBdUIsSUFBSSw2QkFBNkI7QUFDeEQseUJBQTBDO0FBQUEsTUFDekMsWUFBWSxDQUFDLFlBQVk7QUFDeEIsWUFBSSxPQUFPO0FBQ1gsWUFBSSxRQUFRLFNBQVMsUUFBUSxHQUFHO0FBQy9CLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU8sRUFBRSxNQUFNLEtBQUssUUFBUTtBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUNBLHlCQUEwQyxDQUFDO0FBQzNDLGFBQVMsR0FBMkIsV0FBVyxhQUFhLEVBQUUsc0JBQXNCLGFBQWE7QUFFakcsc0JBQWtCLElBQUksc0JBQXNCLHNCQUFzQixvQkFBb0Isb0JBQW9CLEVBQUUsWUFBWSxNQUFNO0FBQUEsSUFBRSxFQUFFLEdBQVUsRUFBRSxXQUFXLFlBQVk7QUFBQSxJQUFFLEVBQUUsQ0FBUTtBQUFBLEVBQ2xMLENBQUM7QUFFRCxnQkFBYyxNQUFNO0FBQ25CLGFBQVMsR0FBMkIsV0FBVyxhQUFhLEVBQUUseUJBQXlCLENBQUMsYUFBYSxDQUFDO0FBQUEsRUFDdkcsQ0FBQztBQUVELE9BQUsseUNBQXlDLE1BQU07QUFDbkQsVUFBTSxlQUFlLGdCQUFnQixnQkFBZ0I7QUFDckQsVUFBTSxjQUFjO0FBQ3BCLFVBQU0sc0JBQXNCLGFBQWEsRUFBRSxPQUFPLE9BQU8sS0FBSyxhQUFhLEtBQUssT0FBTyxNQUFNLElBQUksTUFBTSxPQUFPLENBQUM7QUFDL0csV0FBTztBQUFBLE1BQVk7QUFBQSxNQUNsQjtBQUFBO0FBQUE7QUFBQTtBQUFBLElBR1c7QUFBQSxFQUNiLENBQUM7QUFFRCxPQUFLLHlCQUF5QixNQUFNO0FBQ25DLFVBQU0sTUFBTSxJQUFJLE1BQU0sZ0JBQWdCLG1CQUFtQix3QkFBd0IsQ0FBQztBQUNsRixVQUFNLFVBQVUsZ0JBQWdCLFdBQVcsR0FBRztBQUM5QyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFDckMsV0FBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLE9BQU8sNkNBQTZDO0FBQUEsRUFDbkYsQ0FBQztBQUVELE9BQUssK0NBQStDLFlBQVk7QUFDL0QsVUFBTSxxQkFBcUIscUJBQXFCLFdBQVcsRUFBRSxlQUFlLE1BQU0sQ0FBQztBQUNuRixVQUFNLE1BQU0sSUFBSSxNQUFNLGdCQUFnQixtQkFBbUIseUJBQXlCLE9BQU8sQ0FBQztBQUUxRixVQUFNLHNCQUFzQixDQUFDQSxhQUF5RDtBQUNyRixhQUFPLFlBQVlBLFVBQVMsUUFBUSxDQUFDO0FBQ3JDLGFBQU8sWUFBWUEsU0FBUSxDQUFDLEVBQUUsT0FBTywwQ0FBMEM7QUFDL0UsYUFBTyxZQUFZQSxTQUFRLENBQUMsRUFBRSxPQUFPLGtCQUFrQjtBQUN2RCxhQUFPLFlBQVkscUJBQXFCLFNBQVMsdUJBQXVCLEdBQUcsS0FBSztBQUNoRixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sVUFBVSxnQkFBZ0IsV0FBVyxHQUFHO0FBQzlDLFFBQUksb0JBQW9CLE9BQU8sR0FBRztBQUVqQyxZQUFNLFFBQVEsQ0FBQyxFQUFFLElBQUk7QUFDckIsYUFBTyxZQUFZLHFCQUFxQixTQUFTLHVCQUF1QixHQUFHLE9BQU87QUFDbEYsWUFBTSxpQkFBaUIsZ0JBQWdCLFdBQVcsR0FBRztBQUNyRCxhQUFPLFlBQVksZ0JBQWdCLFFBQVEsQ0FBQztBQUM1QyxhQUFPLFlBQVksZUFBZSxDQUFDLEVBQUUsT0FBTyw0Q0FBNEM7QUFDeEYsYUFBTyxZQUFZLFFBQVEsQ0FBQyxFQUFFLE9BQU8sa0JBQWtCO0FBQ3ZELGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxPQUFPLGlCQUFpQjtBQUN0RCxhQUFPLFlBQVkscUJBQXFCLFNBQVMsdUJBQXVCLEdBQUcsT0FBTztBQUdsRixZQUFNLGVBQWUsQ0FBQyxFQUFFLElBQUk7QUFDNUIsMEJBQW9CLGdCQUFnQixXQUFXLEdBQUcsQ0FBQztBQUFBLElBQ3BEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiYWN0aW9ucyJdCn0K
