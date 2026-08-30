import assert from "assert";
import { assertSnapshot } from "../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ContextMenuService } from "../../../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { SimpleSettingRenderer } from "../../../markdown/browser/markdownSettingRenderer.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { processConditionalBlocks, renderReleaseNotesMarkdown } from "../../browser/releaseNotesEditor.js";
import { URI } from "../../../../../base/common/uri.js";
import { Emitter } from "../../../../../base/common/event.js";
suite("Release notes renderer", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let extensionService;
  let languageService;
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
    extensionService = instantiationService.get(IExtensionService);
    languageService = instantiationService.get(ILanguageService);
    instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
  });
  test("Should render TOC", async () => {
    const content = `<table class="highlights-table">
	<tr>
		<th>a</th>
	</tr>
</table>

<br>

> text

<!-- TOC
<div class="toc-nav-layout">
	<nav id="toc-nav">
		<div>In this update</div>
		<ul>
			<li><a href="#chat">test</a></li>
		</ul>
	</nav>
	<div class="notes-main">
Navigation End -->

## Test`;
    const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
    await assertSnapshot(result.toString());
  });
  test("Should render code settings", async () => {
    const testSettingId = "editor.wordWrap";
    instantiationService.stub(IPreferencesService, {
      _serviceBrand: void 0,
      onDidDefaultSettingsContentChanged: new Emitter().event,
      userSettingsResource: URI.parse("test://test"),
      workspaceSettingsResource: null,
      getFolderSettingsResource: () => null,
      createPreferencesEditorModel: async () => null,
      getDefaultSettingsContent: () => void 0,
      hasDefaultSettingsContent: () => false,
      createSettings2EditorModel: () => {
        throw new Error("not needed");
      },
      openPreferences: async () => void 0,
      openRawDefaultSettings: async () => void 0,
      openSettings: async () => void 0,
      openApplicationSettings: async () => void 0,
      openUserSettings: async () => void 0,
      openRemoteSettings: async () => void 0,
      openWorkspaceSettings: async () => void 0,
      openFolderSettings: async () => void 0,
      openGlobalKeybindingSettings: async () => void 0,
      openDefaultKeybindingsFile: async () => void 0,
      openLanguageSpecificSettings: async () => void 0,
      getEditableSettingsURI: async () => null,
      getSetting: (id) => {
        if (id === testSettingId) {
          return {
            key: testSettingId,
            value: "off",
            type: "string"
          };
        }
        return void 0;
      },
      createSplitJsonEditorInput: () => {
        throw new Error("not needed");
      }
    });
    const content = `Here is a setting: \`setting(${testSettingId}:on)\` and another \`setting(${testSettingId}:off)\``;
    const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
    await assertSnapshot(result.toString());
  });
});
suite("Conditional blocks", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("IN_PRODUCT block is revealed when IN_PRODUCT is active", () => {
    const text = "before\n<!-- %IF IN_PRODUCT %\nin-product content\n%ENDIF % -->\nafter";
    const result = processConditionalBlocks(text, /* @__PURE__ */ new Set(["IN_PRODUCT"]));
    assert.ok(result.includes("in-product content"));
    assert.ok(!result.includes("%IF"));
    assert.ok(result.includes("before"));
    assert.ok(result.includes("after"));
  });
  test("WEB block is removed when only IN_PRODUCT is active", () => {
    const text = "before\n<!-- %IF WEB %\nweb-only content\n%ENDIF % -->\nafter";
    const result = processConditionalBlocks(text, /* @__PURE__ */ new Set(["IN_PRODUCT"]));
    assert.ok(!result.includes("web-only content"));
    assert.ok(result.includes("before"));
    assert.ok(result.includes("after"));
  });
  test("STABLE block is revealed when STABLE is active", () => {
    const text = "before\n<!-- %IF STABLE %\nstable content\n%ENDIF % -->\nafter";
    const result = processConditionalBlocks(text, /* @__PURE__ */ new Set(["IN_PRODUCT", "STABLE"]));
    assert.ok(result.includes("stable content"));
    assert.ok(!result.includes("%IF"));
  });
  test("STABLE block is removed when INSIDERS is active", () => {
    const text = "before\n<!-- %IF STABLE %\nstable content\n%ENDIF % -->\nafter";
    const result = processConditionalBlocks(text, /* @__PURE__ */ new Set(["IN_PRODUCT", "INSIDERS"]));
    assert.ok(!result.includes("stable content"));
    assert.ok(result.includes("before"));
    assert.ok(result.includes("after"));
  });
  test("INSIDERS block is revealed when INSIDERS is active", () => {
    const text = "before\n<!-- %IF INSIDERS %\ninsiders content\n%ENDIF % -->\nafter";
    const result = processConditionalBlocks(text, /* @__PURE__ */ new Set(["IN_PRODUCT", "INSIDERS"]));
    assert.ok(result.includes("insiders content"));
    assert.ok(!result.includes("%IF"));
  });
  test("INSIDERS block is removed when STABLE is active", () => {
    const text = "before\n<!-- %IF INSIDERS %\ninsiders content\n%ENDIF % -->\nafter";
    const result = processConditionalBlocks(text, /* @__PURE__ */ new Set(["IN_PRODUCT", "STABLE"]));
    assert.ok(!result.includes("insiders content"));
  });
  test("Conditions are case-insensitive", () => {
    const text = "<!-- %IF in_product %\ncontent\n%endif % -->";
    const result = processConditionalBlocks(text, /* @__PURE__ */ new Set(["IN_PRODUCT"]));
    assert.ok(result.includes("content"));
    assert.ok(!result.includes("%IF"));
  });
  test("Multiple conditional blocks in same document", () => {
    const text = [
      "shared content",
      "<!-- %IF IN_PRODUCT %",
      "in-product only",
      "%ENDIF % -->",
      "<!-- %IF WEB %",
      "web only",
      "%ENDIF % -->",
      "<!-- %IF STABLE %",
      "stable only",
      "%ENDIF % -->",
      "<!-- %IF INSIDERS %",
      "insiders only",
      "%ENDIF % -->",
      "more shared content"
    ].join("\n");
    const result = processConditionalBlocks(text, /* @__PURE__ */ new Set(["IN_PRODUCT", "STABLE"]));
    assert.ok(result.includes("shared content"));
    assert.ok(result.includes("in-product only"));
    assert.ok(!result.includes("web only"));
    assert.ok(result.includes("stable only"));
    assert.ok(!result.includes("insiders only"));
    assert.ok(result.includes("more shared content"));
  });
  test("renderReleaseNotesMarkdown passes stable quality correctly", async function() {
    const instantiationService = store.add(new TestInstantiationService());
    const extensionService = instantiationService.get(IExtensionService);
    const languageService = instantiationService.get(ILanguageService);
    instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
    const content = [
      "## Title",
      "<!-- %IF STABLE %",
      "stable content",
      "%ENDIF % -->",
      "<!-- %IF INSIDERS %",
      "insiders content",
      "%ENDIF % -->"
    ].join("\n");
    const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), "stable");
    const html = result.toString();
    assert.ok(html.includes("stable content"));
    assert.ok(!html.includes("insiders content"));
  });
  test("renderReleaseNotesMarkdown passes insider quality correctly", async function() {
    const instantiationService = store.add(new TestInstantiationService());
    const extensionService = instantiationService.get(IExtensionService);
    const languageService = instantiationService.get(ILanguageService);
    instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
    const content = [
      "## Title",
      "<!-- %IF STABLE %",
      "stable content",
      "%ENDIF % -->",
      "<!-- %IF INSIDERS %",
      "insiders content",
      "%ENDIF % -->"
    ].join("\n");
    const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), "insider");
    const html = result.toString();
    assert.ok(!html.includes("stable content"));
    assert.ok(html.includes("insiders content"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcdGVzdFxcYnJvd3NlclxccmVsZWFzZU5vdGVzUmVuZGVyZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0TWVudVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNpbXBsZVNldHRpbmdSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25TZXR0aW5nUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBwcm9jZXNzQ29uZGl0aW9uYWxCbG9ja3MsIHJlbmRlclJlbGVhc2VOb3Rlc01hcmtkb3duIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9yZWxlYXNlTm90ZXNFZGl0b3IuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5cblxuc3VpdGUoJ1JlbGVhc2Ugbm90ZXMgcmVuZGVyZXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRleHRlbnNpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElFeHRlbnNpb25TZXJ2aWNlKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0TWVudVNlcnZpY2UsIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0TWVudVNlcnZpY2UpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCByZW5kZXIgVE9DJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgPHRhYmxlIGNsYXNzPVwiaGlnaGxpZ2h0cy10YWJsZVwiPlxuXHQ8dHI+XG5cdFx0PHRoPmE8L3RoPlxuXHQ8L3RyPlxuPC90YWJsZT5cblxuPGJyPlxuXG4+IHRleHRcblxuPCEtLSBUT0NcbjxkaXYgY2xhc3M9XCJ0b2MtbmF2LWxheW91dFwiPlxuXHQ8bmF2IGlkPVwidG9jLW5hdlwiPlxuXHRcdDxkaXY+SW4gdGhpcyB1cGRhdGU8L2Rpdj5cblx0XHQ8dWw+XG5cdFx0XHQ8bGk+PGEgaHJlZj1cIiNjaGF0XCI+dGVzdDwvYT48L2xpPlxuXHRcdDwvdWw+XG5cdDwvbmF2PlxuXHQ8ZGl2IGNsYXNzPVwibm90ZXMtbWFpblwiPlxuTmF2aWdhdGlvbiBFbmQgLS0+XG5cbiMjIFRlc3RgO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVuZGVyUmVsZWFzZU5vdGVzTWFya2Rvd24oY29udGVudCwgZXh0ZW5zaW9uU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW1wbGVTZXR0aW5nUmVuZGVyZXIpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCByZW5kZXIgY29kZSBzZXR0aW5ncycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTdHViIHByZWZlcmVuY2VzIHNlcnZpY2Ugd2l0aCBhIGtub3duIHNldHRpbmcgc28gdGhlIFNpbXBsZVNldHRpbmdSZW5kZXJlciB0cmVhdHMgaXQgYXMgdmFsaWRcblx0XHRjb25zdCB0ZXN0U2V0dGluZ0lkID0gJ2VkaXRvci53b3JkV3JhcCc7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJlZmVyZW5jZXNTZXJ2aWNlLCA8UGFydGlhbDxJUHJlZmVyZW5jZXNTZXJ2aWNlPj57XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZERlZmF1bHRTZXR0aW5nc0NvbnRlbnRDaGFuZ2VkOiBuZXcgRW1pdHRlcjxVUkk+KCkuZXZlbnQsXG5cdFx0XHR1c2VyU2V0dGluZ3NSZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vdGVzdCcpLFxuXHRcdFx0d29ya3NwYWNlU2V0dGluZ3NSZXNvdXJjZTogbnVsbCxcblx0XHRcdGdldEZvbGRlclNldHRpbmdzUmVzb3VyY2U6ICgpID0+IG51bGwsXG5cdFx0XHRjcmVhdGVQcmVmZXJlbmNlc0VkaXRvck1vZGVsOiBhc3luYyAoKSA9PiBudWxsLFxuXHRcdFx0Z2V0RGVmYXVsdFNldHRpbmdzQ29udGVudDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aGFzRGVmYXVsdFNldHRpbmdzQ29udGVudDogKCkgPT4gZmFsc2UsXG5cdFx0XHRjcmVhdGVTZXR0aW5nczJFZGl0b3JNb2RlbDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBuZWVkZWQnKTsgfSxcblx0XHRcdG9wZW5QcmVmZXJlbmNlczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b3BlblJhd0RlZmF1bHRTZXR0aW5nczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b3BlblNldHRpbmdzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRvcGVuQXBwbGljYXRpb25TZXR0aW5nczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b3BlblVzZXJTZXR0aW5nczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b3BlblJlbW90ZVNldHRpbmdzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRvcGVuV29ya3NwYWNlU2V0dGluZ3M6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdG9wZW5Gb2xkZXJTZXR0aW5nczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b3Blbkdsb2JhbEtleWJpbmRpbmdTZXR0aW5nczogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b3BlbkRlZmF1bHRLZXliaW5kaW5nc0ZpbGU6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdG9wZW5MYW5ndWFnZVNwZWNpZmljU2V0dGluZ3M6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGdldEVkaXRhYmxlU2V0dGluZ3NVUkk6IGFzeW5jICgpID0+IG51bGwsXG5cdFx0XHRnZXRTZXR0aW5nOiAoaWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAoaWQgPT09IHRlc3RTZXR0aW5nSWQpIHtcblx0XHRcdFx0XHQvLyBQcm92aWRlIHRoZSBtaW5pbWFsIGZpZWxkcyBhY2Nlc3NlZCBieSBTaW1wbGVTZXR0aW5nUmVuZGVyZXJcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0a2V5OiB0ZXN0U2V0dGluZ0lkLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdvZmYnLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlU3BsaXRKc29uRWRpdG9ySW5wdXQ6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbmVlZGVkJyk7IH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBgSGVyZSBpcyBhIHNldHRpbmc6IFxcYHNldHRpbmcoJHt0ZXN0U2V0dGluZ0lkfTpvbilcXGAgYW5kIGFub3RoZXIgXFxgc2V0dGluZygke3Rlc3RTZXR0aW5nSWR9Om9mZilcXGBgO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlbmRlclJlbGVhc2VOb3Rlc01hcmtkb3duKGNvbnRlbnQsIGV4dGVuc2lvblNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2ltcGxlU2V0dGluZ1JlbmRlcmVyKSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0LnRvU3RyaW5nKCkpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ29uZGl0aW9uYWwgYmxvY2tzJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnSU5fUFJPRFVDVCBibG9jayBpcyByZXZlYWxlZCB3aGVuIElOX1BST0RVQ1QgaXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnYmVmb3JlXFxuPCEtLSAlSUYgSU5fUFJPRFVDVCAlXFxuaW4tcHJvZHVjdCBjb250ZW50XFxuJUVORElGICUgLS0+XFxuYWZ0ZXInO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByb2Nlc3NDb25kaXRpb25hbEJsb2Nrcyh0ZXh0LCBuZXcgU2V0KFsnSU5fUFJPRFVDVCddKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnaW4tcHJvZHVjdCBjb250ZW50JykpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCclSUYnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnYmVmb3JlJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2FmdGVyJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdXRUIgYmxvY2sgaXMgcmVtb3ZlZCB3aGVuIG9ubHkgSU5fUFJPRFVDVCBpcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdiZWZvcmVcXG48IS0tICVJRiBXRUIgJVxcbndlYi1vbmx5IGNvbnRlbnRcXG4lRU5ESUYgJSAtLT5cXG5hZnRlcic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvY2Vzc0NvbmRpdGlvbmFsQmxvY2tzKHRleHQsIG5ldyBTZXQoWydJTl9QUk9EVUNUJ10pKTtcblx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcygnd2ViLW9ubHkgY29udGVudCcpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdiZWZvcmUnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnYWZ0ZXInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NUQUJMRSBibG9jayBpcyByZXZlYWxlZCB3aGVuIFNUQUJMRSBpcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICdiZWZvcmVcXG48IS0tICVJRiBTVEFCTEUgJVxcbnN0YWJsZSBjb250ZW50XFxuJUVORElGICUgLS0+XFxuYWZ0ZXInO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByb2Nlc3NDb25kaXRpb25hbEJsb2Nrcyh0ZXh0LCBuZXcgU2V0KFsnSU5fUFJPRFVDVCcsICdTVEFCTEUnXSkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ3N0YWJsZSBjb250ZW50JykpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCclSUYnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NUQUJMRSBibG9jayBpcyByZW1vdmVkIHdoZW4gSU5TSURFUlMgaXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnYmVmb3JlXFxuPCEtLSAlSUYgU1RBQkxFICVcXG5zdGFibGUgY29udGVudFxcbiVFTkRJRiAlIC0tPlxcbmFmdGVyJztcblx0XHRjb25zdCByZXN1bHQgPSBwcm9jZXNzQ29uZGl0aW9uYWxCbG9ja3ModGV4dCwgbmV3IFNldChbJ0lOX1BST0RVQ1QnLCAnSU5TSURFUlMnXSkpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCdzdGFibGUgY29udGVudCcpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdiZWZvcmUnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnYWZ0ZXInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0lOU0lERVJTIGJsb2NrIGlzIHJldmVhbGVkIHdoZW4gSU5TSURFUlMgaXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnYmVmb3JlXFxuPCEtLSAlSUYgSU5TSURFUlMgJVxcbmluc2lkZXJzIGNvbnRlbnRcXG4lRU5ESUYgJSAtLT5cXG5hZnRlcic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvY2Vzc0NvbmRpdGlvbmFsQmxvY2tzKHRleHQsIG5ldyBTZXQoWydJTl9QUk9EVUNUJywgJ0lOU0lERVJTJ10pKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdpbnNpZGVycyBjb250ZW50JykpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCclSUYnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0lOU0lERVJTIGJsb2NrIGlzIHJlbW92ZWQgd2hlbiBTVEFCTEUgaXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnYmVmb3JlXFxuPCEtLSAlSUYgSU5TSURFUlMgJVxcbmluc2lkZXJzIGNvbnRlbnRcXG4lRU5ESUYgJSAtLT5cXG5hZnRlcic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvY2Vzc0NvbmRpdGlvbmFsQmxvY2tzKHRleHQsIG5ldyBTZXQoWydJTl9QUk9EVUNUJywgJ1NUQUJMRSddKSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXMoJ2luc2lkZXJzIGNvbnRlbnQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvbmRpdGlvbnMgYXJlIGNhc2UtaW5zZW5zaXRpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICc8IS0tICVJRiBpbl9wcm9kdWN0ICVcXG5jb250ZW50XFxuJWVuZGlmICUgLS0+Jztcblx0XHRjb25zdCByZXN1bHQgPSBwcm9jZXNzQ29uZGl0aW9uYWxCbG9ja3ModGV4dCwgbmV3IFNldChbJ0lOX1BST0RVQ1QnXSkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2NvbnRlbnQnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXMoJyVJRicpKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgY29uZGl0aW9uYWwgYmxvY2tzIGluIHNhbWUgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdzaGFyZWQgY29udGVudCcsXG5cdFx0XHQnPCEtLSAlSUYgSU5fUFJPRFVDVCAlJyxcblx0XHRcdCdpbi1wcm9kdWN0IG9ubHknLFxuXHRcdFx0JyVFTkRJRiAlIC0tPicsXG5cdFx0XHQnPCEtLSAlSUYgV0VCICUnLFxuXHRcdFx0J3dlYiBvbmx5Jyxcblx0XHRcdCclRU5ESUYgJSAtLT4nLFxuXHRcdFx0JzwhLS0gJUlGIFNUQUJMRSAlJyxcblx0XHRcdCdzdGFibGUgb25seScsXG5cdFx0XHQnJUVORElGICUgLS0+Jyxcblx0XHRcdCc8IS0tICVJRiBJTlNJREVSUyAlJyxcblx0XHRcdCdpbnNpZGVycyBvbmx5Jyxcblx0XHRcdCclRU5ESUYgJSAtLT4nLFxuXHRcdFx0J21vcmUgc2hhcmVkIGNvbnRlbnQnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvY2Vzc0NvbmRpdGlvbmFsQmxvY2tzKHRleHQsIG5ldyBTZXQoWydJTl9QUk9EVUNUJywgJ1NUQUJMRSddKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnc2hhcmVkIGNvbnRlbnQnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnaW4tcHJvZHVjdCBvbmx5JykpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCd3ZWIgb25seScpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdzdGFibGUgb25seScpKTtcblx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcygnaW5zaWRlcnMgb25seScpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdtb3JlIHNoYXJlZCBjb250ZW50JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJSZWxlYXNlTm90ZXNNYXJrZG93biBwYXNzZXMgc3RhYmxlIHF1YWxpdHkgY29ycmVjdGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRXh0ZW5zaW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRNZW51U2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbnRleHRNZW51U2VydmljZSkpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnIyMgVGl0bGUnLFxuXHRcdFx0JzwhLS0gJUlGIFNUQUJMRSAlJyxcblx0XHRcdCdzdGFibGUgY29udGVudCcsXG5cdFx0XHQnJUVORElGICUgLS0+Jyxcblx0XHRcdCc8IS0tICVJRiBJTlNJREVSUyAlJyxcblx0XHRcdCdpbnNpZGVycyBjb250ZW50Jyxcblx0XHRcdCclRU5ESUYgJSAtLT4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVuZGVyUmVsZWFzZU5vdGVzTWFya2Rvd24oY29udGVudCwgZXh0ZW5zaW9uU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW1wbGVTZXR0aW5nUmVuZGVyZXIpLCAnc3RhYmxlJyk7XG5cdFx0Y29uc3QgaHRtbCA9IHJlc3VsdC50b1N0cmluZygpO1xuXHRcdGFzc2VydC5vayhodG1sLmluY2x1ZGVzKCdzdGFibGUgY29udGVudCcpKTtcblx0XHRhc3NlcnQub2soIWh0bWwuaW5jbHVkZXMoJ2luc2lkZXJzIGNvbnRlbnQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlclJlbGVhc2VOb3Rlc01hcmtkb3duIHBhc3NlcyBpbnNpZGVyIHF1YWxpdHkgY29ycmVjdGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRXh0ZW5zaW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRNZW51U2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbnRleHRNZW51U2VydmljZSkpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnIyMgVGl0bGUnLFxuXHRcdFx0JzwhLS0gJUlGIFNUQUJMRSAlJyxcblx0XHRcdCdzdGFibGUgY29udGVudCcsXG5cdFx0XHQnJUVORElGICUgLS0+Jyxcblx0XHRcdCc8IS0tICVJRiBJTlNJREVSUyAlJyxcblx0XHRcdCdpbnNpZGVycyBjb250ZW50Jyxcblx0XHRcdCclRU5ESUYgJSAtLT4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVuZGVyUmVsZWFzZU5vdGVzTWFya2Rvd24oY29udGVudCwgZXh0ZW5zaW9uU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW1wbGVTZXR0aW5nUmVuZGVyZXIpLCAnaW5zaWRlcicpO1xuXHRcdGNvbnN0IGh0bWwgPSByZXN1bHQudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQub2soIWh0bWwuaW5jbHVkZXMoJ3N0YWJsZSBjb250ZW50JykpO1xuXHRcdGFzc2VydC5vayhodG1sLmluY2x1ZGVzKCdpbnNpZGVycyBjb250ZW50JykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCLGtDQUFrQztBQUNyRSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxlQUFlO0FBR3hCLE1BQU0sMEJBQTBCLE1BQU07QUFDckMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCwyQkFBdUIsTUFBTSxJQUFJ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
