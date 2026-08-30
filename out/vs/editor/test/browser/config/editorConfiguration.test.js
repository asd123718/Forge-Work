import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { migrateOptions } from "../../../browser/config/migrateOptions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EditorZoom } from "../../../common/config/editorZoom.js";
import { TestConfiguration } from "./testConfiguration.js";
import { AccessibilitySupport } from "../../../../platform/accessibility/common/accessibility.js";
suite("Common Editor Config", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Zoom Level", () => {
    const zoom = EditorZoom;
    zoom.setZoomLevel(0);
    assert.strictEqual(zoom.getZoomLevel(), 0);
    zoom.setZoomLevel(-0);
    assert.strictEqual(zoom.getZoomLevel(), 0);
    zoom.setZoomLevel(5);
    assert.strictEqual(zoom.getZoomLevel(), 5);
    zoom.setZoomLevel(-1);
    assert.strictEqual(zoom.getZoomLevel(), -1);
    zoom.setZoomLevel(9);
    assert.strictEqual(zoom.getZoomLevel(), 9);
    zoom.setZoomLevel(-9);
    assert.strictEqual(zoom.getZoomLevel(), -5);
    zoom.setZoomLevel(20);
    assert.strictEqual(zoom.getZoomLevel(), 20);
    zoom.setZoomLevel(-10);
    assert.strictEqual(zoom.getZoomLevel(), -5);
    zoom.setZoomLevel(9.1);
    assert.strictEqual(zoom.getZoomLevel(), 9.1);
    zoom.setZoomLevel(-9.1);
    assert.strictEqual(zoom.getZoomLevel(), -5);
    zoom.setZoomLevel(Infinity);
    assert.strictEqual(zoom.getZoomLevel(), 20);
    zoom.setZoomLevel(Number.NEGATIVE_INFINITY);
    assert.strictEqual(zoom.getZoomLevel(), -5);
  });
  class TestWrappingConfiguration extends TestConfiguration {
    _readEnvConfiguration() {
      return {
        extraEditorClassName: "",
        outerWidth: 1e3,
        outerHeight: 100,
        emptySelectionClipboard: true,
        pixelRatio: 1,
        accessibilitySupport: AccessibilitySupport.Unknown,
        editContextSupported: true
      };
    }
  }
  function assertWrapping(config, isViewportWrapping, wrappingColumn) {
    const options = config.options;
    const wrappingInfo = options.get(EditorOption.wrappingInfo);
    assert.strictEqual(wrappingInfo.isViewportWrapping, isViewportWrapping);
    assert.strictEqual(wrappingInfo.wrappingColumn, wrappingColumn);
  }
  test("wordWrap default", () => {
    const config = new TestWrappingConfiguration({});
    assertWrapping(config, false, -1);
    config.dispose();
  });
  test("wordWrap compat false", () => {
    const config = new TestWrappingConfiguration({
      // eslint-disable-next-line local/code-no-any-casts
      wordWrap: false
    });
    assertWrapping(config, false, -1);
    config.dispose();
  });
  test("wordWrap compat true", () => {
    const config = new TestWrappingConfiguration({
      // eslint-disable-next-line local/code-no-any-casts
      wordWrap: true
    });
    assertWrapping(config, true, 80);
    config.dispose();
  });
  test("wordWrap on", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "on"
    });
    assertWrapping(config, true, 80);
    config.dispose();
  });
  test("wordWrap on without minimap", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "on",
      minimap: {
        enabled: false
      }
    });
    assertWrapping(config, true, 88);
    config.dispose();
  });
  test("wordWrap on does not use wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "on",
      wordWrapColumn: 10
    });
    assertWrapping(config, true, 80);
    config.dispose();
  });
  test("wordWrap off", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "off"
    });
    assertWrapping(config, false, -1);
    config.dispose();
  });
  test("wordWrap off does not use wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "off",
      wordWrapColumn: 10
    });
    assertWrapping(config, false, -1);
    config.dispose();
  });
  test("wordWrap wordWrapColumn uses default wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "wordWrapColumn"
    });
    assertWrapping(config, false, 80);
    config.dispose();
  });
  test("wordWrap wordWrapColumn uses wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "wordWrapColumn",
      wordWrapColumn: 100
    });
    assertWrapping(config, false, 100);
    config.dispose();
  });
  test("wordWrap wordWrapColumn validates wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "wordWrapColumn",
      wordWrapColumn: -1
    });
    assertWrapping(config, false, 1);
    config.dispose();
  });
  test("wordWrap bounded uses default wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "bounded"
    });
    assertWrapping(config, true, 80);
    config.dispose();
  });
  test("wordWrap bounded uses wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "bounded",
      wordWrapColumn: 40
    });
    assertWrapping(config, true, 40);
    config.dispose();
  });
  test("wordWrap bounded validates wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "bounded",
      wordWrapColumn: -1
    });
    assertWrapping(config, true, 1);
    config.dispose();
  });
  test("issue #53152: Cannot assign to read only property 'enabled' of object", () => {
    const hoverOptions = {};
    Object.defineProperty(hoverOptions, "enabled", {
      writable: false,
      value: "on"
    });
    const config = new TestConfiguration({ hover: hoverOptions });
    assert.strictEqual(config.options.get(EditorOption.hover).enabled, "on");
    config.updateOptions({ hover: { enabled: "off" } });
    assert.strictEqual(config.options.get(EditorOption.hover).enabled, "off");
    config.dispose();
  });
  test("does not emit event when nothing changes", () => {
    const config = new TestConfiguration({ glyphMargin: true, roundedSelection: false });
    let event = null;
    const disposable = config.onDidChange((e) => event = e);
    assert.strictEqual(config.options.get(EditorOption.glyphMargin), true);
    config.updateOptions({ glyphMargin: true });
    config.updateOptions({ roundedSelection: false });
    assert.strictEqual(event, null);
    config.dispose();
    disposable.dispose();
  });
  test("issue #94931: Unable to open source file", () => {
    const config = new TestConfiguration({ quickSuggestions: null });
    const actual = config.options.get(EditorOption.quickSuggestions);
    assert.deepStrictEqual(actual, {
      other: "offWhenInlineCompletions",
      comments: "off",
      strings: "off"
    });
    config.dispose();
  });
  test("issue #102920: Can't snap or split view with JSON files", () => {
    const config = new TestConfiguration({ quickSuggestions: null });
    config.updateOptions({ quickSuggestions: { strings: true } });
    const actual = config.options.get(EditorOption.quickSuggestions);
    assert.deepStrictEqual(actual, {
      other: "offWhenInlineCompletions",
      comments: "off",
      strings: "on"
    });
    config.dispose();
  });
  test("issue #151926: Untyped editor options apply", () => {
    const config = new TestConfiguration({});
    config.updateOptions({ unicodeHighlight: { allowedCharacters: { "x": true } } });
    const actual = config.options.get(EditorOption.unicodeHighlighting);
    assert.deepStrictEqual(
      actual,
      {
        nonBasicASCII: "inUntrustedWorkspace",
        invisibleCharacters: true,
        ambiguousCharacters: true,
        includeComments: "inUntrustedWorkspace",
        includeStrings: "inUntrustedWorkspace",
        allowedCharacters: { "x": true },
        allowedLocales: { "_os": true, "_vscode": true }
      }
    );
    config.dispose();
  });
});
suite("migrateOptions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function migrate(options) {
    migrateOptions(options);
    return options;
  }
  test("wordWrap", () => {
    assert.deepStrictEqual(migrate({ wordWrap: true }), { wordWrap: "on" });
    assert.deepStrictEqual(migrate({ wordWrap: false }), { wordWrap: "off" });
  });
  test("lineNumbers", () => {
    assert.deepStrictEqual(migrate({ lineNumbers: true }), { lineNumbers: "on" });
    assert.deepStrictEqual(migrate({ lineNumbers: false }), { lineNumbers: "off" });
  });
  test("autoClosingBrackets", () => {
    assert.deepStrictEqual(migrate({ autoClosingBrackets: false }), { autoClosingBrackets: "never", autoClosingQuotes: "never", autoSurround: "never" });
  });
  test("cursorBlinking", () => {
    assert.deepStrictEqual(migrate({ cursorBlinking: "visible" }), { cursorBlinking: "solid" });
  });
  test("renderWhitespace", () => {
    assert.deepStrictEqual(migrate({ renderWhitespace: true }), { renderWhitespace: "boundary" });
    assert.deepStrictEqual(migrate({ renderWhitespace: false }), { renderWhitespace: "none" });
  });
  test("renderLineHighlight", () => {
    assert.deepStrictEqual(migrate({ renderLineHighlight: true }), { renderLineHighlight: "line" });
    assert.deepStrictEqual(migrate({ renderLineHighlight: false }), { renderLineHighlight: "none" });
  });
  test("acceptSuggestionOnEnter", () => {
    assert.deepStrictEqual(migrate({ acceptSuggestionOnEnter: true }), { acceptSuggestionOnEnter: "on" });
    assert.deepStrictEqual(migrate({ acceptSuggestionOnEnter: false }), { acceptSuggestionOnEnter: "off" });
  });
  test("tabCompletion", () => {
    assert.deepStrictEqual(migrate({ tabCompletion: true }), { tabCompletion: "onlySnippets" });
    assert.deepStrictEqual(migrate({ tabCompletion: false }), { tabCompletion: "off" });
  });
  test("suggest.filteredTypes", () => {
    assert.deepStrictEqual(
      migrate({
        suggest: {
          filteredTypes: {
            method: false,
            function: false,
            constructor: false,
            deprecated: false,
            field: false,
            variable: false,
            class: false,
            struct: false,
            interface: false,
            module: false,
            property: false,
            event: false,
            operator: false,
            unit: false,
            value: false,
            constant: false,
            enum: false,
            enumMember: false,
            keyword: false,
            text: false,
            color: false,
            file: false,
            reference: false,
            folder: false,
            typeParameter: false,
            snippet: false
          }
        }
      }),
      {
        suggest: {
          filteredTypes: void 0,
          showMethods: false,
          showFunctions: false,
          showConstructors: false,
          showDeprecated: false,
          showFields: false,
          showVariables: false,
          showClasses: false,
          showStructs: false,
          showInterfaces: false,
          showModules: false,
          showProperties: false,
          showEvents: false,
          showOperators: false,
          showUnits: false,
          showValues: false,
          showConstants: false,
          showEnums: false,
          showEnumMembers: false,
          showKeywords: false,
          showWords: false,
          showColors: false,
          showFiles: false,
          showReferences: false,
          showFolders: false,
          showTypeParameters: false,
          showSnippets: false
        }
      }
    );
  });
  test("quickSuggestions", () => {
    assert.deepStrictEqual(migrate({ quickSuggestions: true }), { quickSuggestions: { comments: "on", strings: "on", other: "on" } });
    assert.deepStrictEqual(migrate({ quickSuggestions: false }), { quickSuggestions: { comments: "off", strings: "off", other: "off" } });
    assert.deepStrictEqual(migrate({ quickSuggestions: { comments: "on", strings: "off" } }), { quickSuggestions: { comments: "on", strings: "off" } });
  });
  test("hover", () => {
    assert.deepStrictEqual(migrate({ hover: true }), { hover: { enabled: "on" } });
    assert.deepStrictEqual(migrate({ hover: false }), { hover: { enabled: "off" } });
  });
  test("parameterHints", () => {
    assert.deepStrictEqual(migrate({ parameterHints: true }), { parameterHints: { enabled: true } });
    assert.deepStrictEqual(migrate({ parameterHints: false }), { parameterHints: { enabled: false } });
  });
  test("autoIndent", () => {
    assert.deepStrictEqual(migrate({ autoIndent: true }), { autoIndent: "full" });
    assert.deepStrictEqual(migrate({ autoIndent: false }), { autoIndent: "advanced" });
  });
  test("matchBrackets", () => {
    assert.deepStrictEqual(migrate({ matchBrackets: true }), { matchBrackets: "always" });
    assert.deepStrictEqual(migrate({ matchBrackets: false }), { matchBrackets: "never" });
  });
  test("renderIndentGuides, highlightActiveIndentGuide", () => {
    assert.deepStrictEqual(migrate({ renderIndentGuides: true }), { renderIndentGuides: void 0, guides: { indentation: true } });
    assert.deepStrictEqual(migrate({ renderIndentGuides: false }), { renderIndentGuides: void 0, guides: { indentation: false } });
    assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: true }), { highlightActiveIndentGuide: void 0, guides: { highlightActiveIndentation: true } });
    assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: false }), { highlightActiveIndentGuide: void 0, guides: { highlightActiveIndentation: false } });
  });
  test("migration does not overwrite new setting", () => {
    assert.deepStrictEqual(migrate({ renderIndentGuides: true, guides: { indentation: false } }), { renderIndentGuides: void 0, guides: { indentation: false } });
    assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: true, guides: { highlightActiveIndentation: false } }), { highlightActiveIndentGuide: void 0, guides: { highlightActiveIndentation: false } });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGNvbmZpZ1xcZWRpdG9yQ29uZmlndXJhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRW52Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbWlncmF0ZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvbmZpZy9taWdyYXRlT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBFZGl0b3JPcHRpb24sIElFZGl0b3JIb3Zlck9wdGlvbnMsIElRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3Jab29tIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3Jab29tLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi90ZXN0Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U3VwcG9ydCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuXG5zdWl0ZSgnQ29tbW9uIEVkaXRvciBDb25maWcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnWm9vbSBMZXZlbCcsICgpID0+IHtcblxuXHRcdC8vWm9vbSBsZXZlbHMgYXJlIGRlZmluZWQgdG8gZ28gYmV0d2VlbiAtNSwgMjAgaW5jbHVzaXZlXG5cdFx0Y29uc3Qgem9vbSA9IEVkaXRvclpvb207XG5cblx0XHR6b29tLnNldFpvb21MZXZlbCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoem9vbS5nZXRab29tTGV2ZWwoKSwgMCk7XG5cblx0XHR6b29tLnNldFpvb21MZXZlbCgtMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIDApO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIDUpO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6b29tLmdldFpvb21MZXZlbCgpLCAtMSk7XG5cblx0XHR6b29tLnNldFpvb21MZXZlbCg5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoem9vbS5nZXRab29tTGV2ZWwoKSwgOSk7XG5cblx0XHR6b29tLnNldFpvb21MZXZlbCgtOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIC01KTtcblxuXHRcdHpvb20uc2V0Wm9vbUxldmVsKDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoem9vbS5nZXRab29tTGV2ZWwoKSwgMjApO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoLTEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoem9vbS5nZXRab29tTGV2ZWwoKSwgLTUpO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoOS4xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoem9vbS5nZXRab29tTGV2ZWwoKSwgOS4xKTtcblxuXHRcdHpvb20uc2V0Wm9vbUxldmVsKC05LjEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6b29tLmdldFpvb21MZXZlbCgpLCAtNSk7XG5cblx0XHR6b29tLnNldFpvb21MZXZlbChJbmZpbml0eSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIDIwKTtcblxuXHRcdHpvb20uc2V0Wm9vbUxldmVsKE51bWJlci5ORUdBVElWRV9JTkZJTklUWSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIC01KTtcblx0fSk7XG5cblx0Y2xhc3MgVGVzdFdyYXBwaW5nQ29uZmlndXJhdGlvbiBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uIHtcblx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3JlYWRFbnZDb25maWd1cmF0aW9uKCk6IElFbnZDb25maWd1cmF0aW9uIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGV4dHJhRWRpdG9yQ2xhc3NOYW1lOiAnJyxcblx0XHRcdFx0b3V0ZXJXaWR0aDogMTAwMCxcblx0XHRcdFx0b3V0ZXJIZWlnaHQ6IDEwMCxcblx0XHRcdFx0ZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQ6IHRydWUsXG5cdFx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlTdXBwb3J0OiBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5Vbmtub3duLFxuXHRcdFx0XHRlZGl0Q29udGV4dFN1cHBvcnRlZDogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0V3JhcHBpbmcoY29uZmlnOiBUZXN0Q29uZmlndXJhdGlvbiwgaXNWaWV3cG9ydFdyYXBwaW5nOiBib29sZWFuLCB3cmFwcGluZ0NvbHVtbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGNvbmZpZy5vcHRpb25zO1xuXHRcdGNvbnN0IHdyYXBwaW5nSW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cmFwcGluZ0luZm8uaXNWaWV3cG9ydFdyYXBwaW5nLCBpc1ZpZXdwb3J0V3JhcHBpbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cmFwcGluZ0luZm8ud3JhcHBpbmdDb2x1bW4sIHdyYXBwaW5nQ29sdW1uKTtcblx0fVxuXG5cdHRlc3QoJ3dvcmRXcmFwIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe30pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgZmFsc2UsIC0xKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCBjb21wYXQgZmFsc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHR3b3JkV3JhcDogPGFueT5mYWxzZVxuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgZmFsc2UsIC0xKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCBjb21wYXQgdHJ1ZScsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdFdyYXBwaW5nQ29uZmlndXJhdGlvbih7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHdvcmRXcmFwOiA8YW55PnRydWVcblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIHRydWUsIDgwKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCBvbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdFdyYXBwaW5nQ29uZmlndXJhdGlvbih7XG5cdFx0XHR3b3JkV3JhcDogJ29uJ1xuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgdHJ1ZSwgODApO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmRXcmFwIG9uIHdpdGhvdXQgbWluaW1hcCcsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdFdyYXBwaW5nQ29uZmlndXJhdGlvbih7XG5cdFx0XHR3b3JkV3JhcDogJ29uJyxcblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2Vcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIHRydWUsIDg4KTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCBvbiBkb2VzIG5vdCB1c2Ugd29yZFdyYXBDb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICdvbicsXG5cdFx0XHR3b3JkV3JhcENvbHVtbjogMTBcblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIHRydWUsIDgwKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCBvZmYnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICdvZmYnXG5cdFx0fSk7XG5cdFx0YXNzZXJ0V3JhcHBpbmcoY29uZmlnLCBmYWxzZSwgLTEpO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmRXcmFwIG9mZiBkb2VzIG5vdCB1c2Ugd29yZFdyYXBDb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICdvZmYnLFxuXHRcdFx0d29yZFdyYXBDb2x1bW46IDEwXG5cdFx0fSk7XG5cdFx0YXNzZXJ0V3JhcHBpbmcoY29uZmlnLCBmYWxzZSwgLTEpO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmRXcmFwIHdvcmRXcmFwQ29sdW1uIHVzZXMgZGVmYXVsdCB3b3JkV3JhcENvbHVtbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdFdyYXBwaW5nQ29uZmlndXJhdGlvbih7XG5cdFx0XHR3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJ1xuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgZmFsc2UsIDgwKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCB3b3JkV3JhcENvbHVtbiB1c2VzIHdvcmRXcmFwQ29sdW1uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHtcblx0XHRcdHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLFxuXHRcdFx0d29yZFdyYXBDb2x1bW46IDEwMFxuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgZmFsc2UsIDEwMCk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgd29yZFdyYXBDb2x1bW4gdmFsaWRhdGVzIHdvcmRXcmFwQ29sdW1uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHtcblx0XHRcdHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLFxuXHRcdFx0d29yZFdyYXBDb2x1bW46IC0xXG5cdFx0fSk7XG5cdFx0YXNzZXJ0V3JhcHBpbmcoY29uZmlnLCBmYWxzZSwgMSk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgYm91bmRlZCB1c2VzIGRlZmF1bHQgd29yZFdyYXBDb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICdib3VuZGVkJ1xuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgdHJ1ZSwgODApO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmRXcmFwIGJvdW5kZWQgdXNlcyB3b3JkV3JhcENvbHVtbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdFdyYXBwaW5nQ29uZmlndXJhdGlvbih7XG5cdFx0XHR3b3JkV3JhcDogJ2JvdW5kZWQnLFxuXHRcdFx0d29yZFdyYXBDb2x1bW46IDQwXG5cdFx0fSk7XG5cdFx0YXNzZXJ0V3JhcHBpbmcoY29uZmlnLCB0cnVlLCA0MCk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgYm91bmRlZCB2YWxpZGF0ZXMgd29yZFdyYXBDb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICdib3VuZGVkJyxcblx0XHRcdHdvcmRXcmFwQ29sdW1uOiAtMVxuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgdHJ1ZSwgMSk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzUzMTUyOiBDYW5ub3QgYXNzaWduIHRvIHJlYWQgb25seSBwcm9wZXJ0eSBcXCdlbmFibGVkXFwnIG9mIG9iamVjdCcsICgpID0+IHtcblx0XHRjb25zdCBob3Zlck9wdGlvbnM6IElFZGl0b3JIb3Zlck9wdGlvbnMgPSB7fTtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoaG92ZXJPcHRpb25zLCAnZW5hYmxlZCcsIHtcblx0XHRcdHdyaXRhYmxlOiBmYWxzZSxcblx0XHRcdHZhbHVlOiAnb24nXG5cdFx0fSk7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uKHsgaG92ZXI6IGhvdmVyT3B0aW9ucyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmhvdmVyKS5lbmFibGVkLCAnb24nKTtcblx0XHRjb25maWcudXBkYXRlT3B0aW9ucyh7IGhvdmVyOiB7IGVuYWJsZWQ6ICdvZmYnIH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uaG92ZXIpLmVuYWJsZWQsICdvZmYnKTtcblxuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGVtaXQgZXZlbnQgd2hlbiBub3RoaW5nIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uKHsgZ2x5cGhNYXJnaW46IHRydWUsIHJvdW5kZWRTZWxlY3Rpb246IGZhbHNlIH0pO1xuXHRcdGxldCBldmVudDogQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBjb25maWcub25EaWRDaGFuZ2UoZSA9PiBldmVudCA9IGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmdseXBoTWFyZ2luKSwgdHJ1ZSk7XG5cblx0XHRjb25maWcudXBkYXRlT3B0aW9ucyh7IGdseXBoTWFyZ2luOiB0cnVlIH0pO1xuXHRcdGNvbmZpZy51cGRhdGVPcHRpb25zKHsgcm91bmRlZFNlbGVjdGlvbjogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LCBudWxsKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTQ5MzE6IFVuYWJsZSB0byBvcGVuIHNvdXJjZSBmaWxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvbih7IHF1aWNrU3VnZ2VzdGlvbnM6IG51bGwhIH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IDxSZWFkb25seTxSZXF1aXJlZDxJUXVpY2tTdWdnZXN0aW9uc09wdGlvbnM+Pj5jb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnF1aWNrU3VnZ2VzdGlvbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7XG5cdFx0XHRvdGhlcjogJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucycsXG5cdFx0XHRjb21tZW50czogJ29mZicsXG5cdFx0XHRzdHJpbmdzOiAnb2ZmJ1xuXHRcdH0pO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMDI5MjA6IENhblxcJ3Qgc25hcCBvciBzcGxpdCB2aWV3IHdpdGggSlNPTiBmaWxlcycsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb24oeyBxdWlja1N1Z2dlc3Rpb25zOiBudWxsISB9KTtcblx0XHRjb25maWcudXBkYXRlT3B0aW9ucyh7IHF1aWNrU3VnZ2VzdGlvbnM6IHsgc3RyaW5nczogdHJ1ZSB9IH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IDxSZWFkb25seTxSZXF1aXJlZDxJUXVpY2tTdWdnZXN0aW9uc09wdGlvbnM+Pj5jb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnF1aWNrU3VnZ2VzdGlvbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7XG5cdFx0XHRvdGhlcjogJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucycsXG5cdFx0XHRjb21tZW50czogJ29mZicsXG5cdFx0XHRzdHJpbmdzOiAnb24nXG5cdFx0fSk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1MTkyNjogVW50eXBlZCBlZGl0b3Igb3B0aW9ucyBhcHBseScsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb24oe30pO1xuXHRcdGNvbmZpZy51cGRhdGVPcHRpb25zKHsgdW5pY29kZUhpZ2hsaWdodDogeyBhbGxvd2VkQ2hhcmFjdGVyczogeyAneCc6IHRydWUgfSB9IH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGNvbmZpZy5vcHRpb25zLmdldChFZGl0b3JPcHRpb24udW5pY29kZUhpZ2hsaWdodGluZyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsXG5cdFx0XHR7XG5cdFx0XHRcdG5vbkJhc2ljQVNDSUk6ICdpblVudHJ1c3RlZFdvcmtzcGFjZScsXG5cdFx0XHRcdGludmlzaWJsZUNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRcdGFtYmlndW91c0NoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRcdGluY2x1ZGVDb21tZW50czogJ2luVW50cnVzdGVkV29ya3NwYWNlJyxcblx0XHRcdFx0aW5jbHVkZVN0cmluZ3M6ICdpblVudHJ1c3RlZFdvcmtzcGFjZScsXG5cdFx0XHRcdGFsbG93ZWRDaGFyYWN0ZXJzOiB7ICd4JzogdHJ1ZSB9LFxuXHRcdFx0XHRhbGxvd2VkTG9jYWxlczogeyAnX29zJzogdHJ1ZSwgJ192c2NvZGUnOiB0cnVlIH1cblx0XHRcdH1cblx0XHQpO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdtaWdyYXRlT3B0aW9ucycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBtaWdyYXRlKG9wdGlvbnM6IGFueSk6IGFueSB7XG5cdFx0bWlncmF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cblxuXHR0ZXN0KCd3b3JkV3JhcCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyB3b3JkV3JhcDogdHJ1ZSB9KSwgeyB3b3JkV3JhcDogJ29uJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyB3b3JkV3JhcDogZmFsc2UgfSksIHsgd29yZFdyYXA6ICdvZmYnIH0pO1xuXHR9KTtcblx0dGVzdCgnbGluZU51bWJlcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgbGluZU51bWJlcnM6IHRydWUgfSksIHsgbGluZU51bWJlcnM6ICdvbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgbGluZU51bWJlcnM6IGZhbHNlIH0pLCB7IGxpbmVOdW1iZXJzOiAnb2ZmJyB9KTtcblx0fSk7XG5cdHRlc3QoJ2F1dG9DbG9zaW5nQnJhY2tldHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgYXV0b0Nsb3NpbmdCcmFja2V0czogZmFsc2UgfSksIHsgYXV0b0Nsb3NpbmdCcmFja2V0czogJ25ldmVyJywgYXV0b0Nsb3NpbmdRdW90ZXM6ICduZXZlcicsIGF1dG9TdXJyb3VuZDogJ25ldmVyJyB9KTtcblx0fSk7XG5cdHRlc3QoJ2N1cnNvckJsaW5raW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGN1cnNvckJsaW5raW5nOiAndmlzaWJsZScgfSksIHsgY3Vyc29yQmxpbmtpbmc6ICdzb2xpZCcgfSk7XG5cdH0pO1xuXHR0ZXN0KCdyZW5kZXJXaGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IHJlbmRlcldoaXRlc3BhY2U6IHRydWUgfSksIHsgcmVuZGVyV2hpdGVzcGFjZTogJ2JvdW5kYXJ5JyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyByZW5kZXJXaGl0ZXNwYWNlOiBmYWxzZSB9KSwgeyByZW5kZXJXaGl0ZXNwYWNlOiAnbm9uZScgfSk7XG5cdH0pO1xuXHR0ZXN0KCdyZW5kZXJMaW5lSGlnaGxpZ2h0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IHJlbmRlckxpbmVIaWdobGlnaHQ6IHRydWUgfSksIHsgcmVuZGVyTGluZUhpZ2hsaWdodDogJ2xpbmUnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IHJlbmRlckxpbmVIaWdobGlnaHQ6IGZhbHNlIH0pLCB7IHJlbmRlckxpbmVIaWdobGlnaHQ6ICdub25lJyB9KTtcblx0fSk7XG5cdHRlc3QoJ2FjY2VwdFN1Z2dlc3Rpb25PbkVudGVyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyOiB0cnVlIH0pLCB7IGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyOiAnb24nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyOiBmYWxzZSB9KSwgeyBhY2NlcHRTdWdnZXN0aW9uT25FbnRlcjogJ29mZicgfSk7XG5cdH0pO1xuXHR0ZXN0KCd0YWJDb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IHRhYkNvbXBsZXRpb246IHRydWUgfSksIHsgdGFiQ29tcGxldGlvbjogJ29ubHlTbmlwcGV0cycgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgdGFiQ29tcGxldGlvbjogZmFsc2UgfSksIHsgdGFiQ29tcGxldGlvbjogJ29mZicgfSk7XG5cdH0pO1xuXHR0ZXN0KCdzdWdnZXN0LmZpbHRlcmVkVHlwZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG1pZ3JhdGUoe1xuXHRcdFx0XHRzdWdnZXN0OiB7XG5cdFx0XHRcdFx0ZmlsdGVyZWRUeXBlczoge1xuXHRcdFx0XHRcdFx0bWV0aG9kOiBmYWxzZSxcblx0XHRcdFx0XHRcdGZ1bmN0aW9uOiBmYWxzZSxcblx0XHRcdFx0XHRcdGNvbnN0cnVjdG9yOiBmYWxzZSxcblx0XHRcdFx0XHRcdGRlcHJlY2F0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZmllbGQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dmFyaWFibGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Y2xhc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0c3RydWN0OiBmYWxzZSxcblx0XHRcdFx0XHRcdGludGVyZmFjZTogZmFsc2UsXG5cdFx0XHRcdFx0XHRtb2R1bGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cHJvcGVydHk6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXZlbnQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0b3BlcmF0b3I6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dW5pdDogZmFsc2UsXG5cdFx0XHRcdFx0XHR2YWx1ZTogZmFsc2UsXG5cdFx0XHRcdFx0XHRjb25zdGFudDogZmFsc2UsXG5cdFx0XHRcdFx0XHRlbnVtOiBmYWxzZSxcblx0XHRcdFx0XHRcdGVudW1NZW1iZXI6IGZhbHNlLFxuXHRcdFx0XHRcdFx0a2V5d29yZDogZmFsc2UsXG5cdFx0XHRcdFx0XHR0ZXh0OiBmYWxzZSxcblx0XHRcdFx0XHRcdGNvbG9yOiBmYWxzZSxcblx0XHRcdFx0XHRcdGZpbGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cmVmZXJlbmNlOiBmYWxzZSxcblx0XHRcdFx0XHRcdGZvbGRlcjogZmFsc2UsXG5cdFx0XHRcdFx0XHR0eXBlUGFyYW1ldGVyOiBmYWxzZSxcblx0XHRcdFx0XHRcdHNuaXBwZXQ6IGZhbHNlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSksIHtcblx0XHRcdHN1Z2dlc3Q6IHtcblx0XHRcdFx0ZmlsdGVyZWRUeXBlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRzaG93TWV0aG9kczogZmFsc2UsXG5cdFx0XHRcdHNob3dGdW5jdGlvbnM6IGZhbHNlLFxuXHRcdFx0XHRzaG93Q29uc3RydWN0b3JzOiBmYWxzZSxcblx0XHRcdFx0c2hvd0RlcHJlY2F0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRzaG93RmllbGRzOiBmYWxzZSxcblx0XHRcdFx0c2hvd1ZhcmlhYmxlczogZmFsc2UsXG5cdFx0XHRcdHNob3dDbGFzc2VzOiBmYWxzZSxcblx0XHRcdFx0c2hvd1N0cnVjdHM6IGZhbHNlLFxuXHRcdFx0XHRzaG93SW50ZXJmYWNlczogZmFsc2UsXG5cdFx0XHRcdHNob3dNb2R1bGVzOiBmYWxzZSxcblx0XHRcdFx0c2hvd1Byb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRzaG93RXZlbnRzOiBmYWxzZSxcblx0XHRcdFx0c2hvd09wZXJhdG9yczogZmFsc2UsXG5cdFx0XHRcdHNob3dVbml0czogZmFsc2UsXG5cdFx0XHRcdHNob3dWYWx1ZXM6IGZhbHNlLFxuXHRcdFx0XHRzaG93Q29uc3RhbnRzOiBmYWxzZSxcblx0XHRcdFx0c2hvd0VudW1zOiBmYWxzZSxcblx0XHRcdFx0c2hvd0VudW1NZW1iZXJzOiBmYWxzZSxcblx0XHRcdFx0c2hvd0tleXdvcmRzOiBmYWxzZSxcblx0XHRcdFx0c2hvd1dvcmRzOiBmYWxzZSxcblx0XHRcdFx0c2hvd0NvbG9yczogZmFsc2UsXG5cdFx0XHRcdHNob3dGaWxlczogZmFsc2UsXG5cdFx0XHRcdHNob3dSZWZlcmVuY2VzOiBmYWxzZSxcblx0XHRcdFx0c2hvd0ZvbGRlcnM6IGZhbHNlLFxuXHRcdFx0XHRzaG93VHlwZVBhcmFtZXRlcnM6IGZhbHNlLFxuXHRcdFx0XHRzaG93U25pcHBldHM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgncXVpY2tTdWdnZXN0aW9ucycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBxdWlja1N1Z2dlc3Rpb25zOiB0cnVlIH0pLCB7IHF1aWNrU3VnZ2VzdGlvbnM6IHsgY29tbWVudHM6ICdvbicsIHN0cmluZ3M6ICdvbicsIG90aGVyOiAnb24nIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcXVpY2tTdWdnZXN0aW9uczogZmFsc2UgfSksIHsgcXVpY2tTdWdnZXN0aW9uczogeyBjb21tZW50czogJ29mZicsIHN0cmluZ3M6ICdvZmYnLCBvdGhlcjogJ29mZicgfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBxdWlja1N1Z2dlc3Rpb25zOiB7IGNvbW1lbnRzOiAnb24nLCBzdHJpbmdzOiAnb2ZmJyB9IH0pLCB7IHF1aWNrU3VnZ2VzdGlvbnM6IHsgY29tbWVudHM6ICdvbicsIHN0cmluZ3M6ICdvZmYnIH0gfSk7XG5cdH0pO1xuXHR0ZXN0KCdob3ZlcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBob3ZlcjogdHJ1ZSB9KSwgeyBob3ZlcjogeyBlbmFibGVkOiAnb24nIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgaG92ZXI6IGZhbHNlIH0pLCB7IGhvdmVyOiB7IGVuYWJsZWQ6ICdvZmYnIH0gfSk7XG5cdH0pO1xuXHR0ZXN0KCdwYXJhbWV0ZXJIaW50cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBwYXJhbWV0ZXJIaW50czogdHJ1ZSB9KSwgeyBwYXJhbWV0ZXJIaW50czogeyBlbmFibGVkOiB0cnVlIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcGFyYW1ldGVySGludHM6IGZhbHNlIH0pLCB7IHBhcmFtZXRlckhpbnRzOiB7IGVuYWJsZWQ6IGZhbHNlIH0gfSk7XG5cdH0pO1xuXHR0ZXN0KCdhdXRvSW5kZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGF1dG9JbmRlbnQ6IHRydWUgfSksIHsgYXV0b0luZGVudDogJ2Z1bGwnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGF1dG9JbmRlbnQ6IGZhbHNlIH0pLCB7IGF1dG9JbmRlbnQ6ICdhZHZhbmNlZCcgfSk7XG5cdH0pO1xuXHR0ZXN0KCdtYXRjaEJyYWNrZXRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IG1hdGNoQnJhY2tldHM6IHRydWUgfSksIHsgbWF0Y2hCcmFja2V0czogJ2Fsd2F5cycgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgbWF0Y2hCcmFja2V0czogZmFsc2UgfSksIHsgbWF0Y2hCcmFja2V0czogJ25ldmVyJyB9KTtcblx0fSk7XG5cdHRlc3QoJ3JlbmRlckluZGVudEd1aWRlcywgaGlnaGxpZ2h0QWN0aXZlSW5kZW50R3VpZGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcmVuZGVySW5kZW50R3VpZGVzOiB0cnVlIH0pLCB7IHJlbmRlckluZGVudEd1aWRlczogdW5kZWZpbmVkLCBndWlkZXM6IHsgaW5kZW50YXRpb246IHRydWUgfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyByZW5kZXJJbmRlbnRHdWlkZXM6IGZhbHNlIH0pLCB7IHJlbmRlckluZGVudEd1aWRlczogdW5kZWZpbmVkLCBndWlkZXM6IHsgaW5kZW50YXRpb246IGZhbHNlIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgaGlnaGxpZ2h0QWN0aXZlSW5kZW50R3VpZGU6IHRydWUgfSksIHsgaGlnaGxpZ2h0QWN0aXZlSW5kZW50R3VpZGU6IHVuZGVmaW5lZCwgZ3VpZGVzOiB7IGhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uOiB0cnVlIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgaGlnaGxpZ2h0QWN0aXZlSW5kZW50R3VpZGU6IGZhbHNlIH0pLCB7IGhpZ2hsaWdodEFjdGl2ZUluZGVudEd1aWRlOiB1bmRlZmluZWQsIGd1aWRlczogeyBoaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbjogZmFsc2UgfSB9KTtcblx0fSk7XG5cblx0dGVzdCgnbWlncmF0aW9uIGRvZXMgbm90IG92ZXJ3cml0ZSBuZXcgc2V0dGluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyByZW5kZXJJbmRlbnRHdWlkZXM6IHRydWUsIGd1aWRlczogeyBpbmRlbnRhdGlvbjogZmFsc2UgfSB9KSwgeyByZW5kZXJJbmRlbnRHdWlkZXM6IHVuZGVmaW5lZCwgZ3VpZGVzOiB7IGluZGVudGF0aW9uOiBmYWxzZSB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGhpZ2hsaWdodEFjdGl2ZUluZGVudEd1aWRlOiB0cnVlLCBndWlkZXM6IHsgaGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb246IGZhbHNlIH0gfSksIHsgaGlnaGxpZ2h0QWN0aXZlSW5kZW50R3VpZGU6IHVuZGVmaW5lZCwgZ3VpZGVzOiB7IGhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uOiBmYWxzZSB9IH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsc0JBQXNCO0FBQy9CLFNBQW9DLG9CQUFtRTtBQUN2RyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLHdCQUF3QixNQUFNO0FBRW5DLDBDQUF3QztBQUV4QyxPQUFLLGNBQWMsTUFBTTtBQUd4QixVQUFNLE9BQU87QUFFYixTQUFLLGFBQWEsQ0FBQztBQUNuQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsQ0FBQztBQUV6QyxTQUFLLGFBQWEsRUFBRTtBQUNwQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsQ0FBQztBQUV6QyxTQUFLLGFBQWEsQ0FBQztBQUNuQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsQ0FBQztBQUV6QyxTQUFLLGFBQWEsRUFBRTtBQUNwQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsRUFBRTtBQUUxQyxTQUFLLGFBQWEsQ0FBQztBQUNuQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsQ0FBQztBQUV6QyxTQUFLLGFBQWEsRUFBRTtBQUNwQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsRUFBRTtBQUUxQyxTQUFLLGFBQWEsRUFBRTtBQUNwQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsRUFBRTtBQUUxQyxTQUFLLGFBQWEsR0FBRztBQUNyQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsRUFBRTtBQUUxQyxTQUFLLGFBQWEsR0FBRztBQUNyQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsR0FBRztBQUUzQyxTQUFLLGFBQWEsSUFBSTtBQUN0QixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcsRUFBRTtBQUUxQyxTQUFLLGFBQWEsUUFBUTtBQUMxQixXQUFPLFlBQVksS0FBSyxhQUFhLEdBQUcs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
