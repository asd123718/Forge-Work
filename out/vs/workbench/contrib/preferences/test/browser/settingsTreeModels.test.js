import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { settingKeyToDisplayFormat, parseQuery, sanitizeId } from "../../browser/settingsTreeModels.js";
suite("SettingsTree", () => {
  test("settingKeyToDisplayFormat", () => {
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo.bar"),
      {
        category: "Foo",
        label: "Bar"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo.bar.etc"),
      {
        category: "Foo \u203A Bar",
        label: "Etc"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("fooBar.etcSomething"),
      {
        category: "Foo Bar",
        label: "Etc Something"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo"),
      {
        category: "",
        label: "Foo"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo.1leading.number"),
      {
        category: "Foo \u203A 1leading",
        label: "Number"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo.1Leading.number"),
      {
        category: "Foo \u203A 1 Leading",
        label: "Number"
      }
    );
  });
  test("settingKeyToDisplayFormat - with category", () => {
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo.bar", "foo"),
      {
        category: "",
        label: "Bar"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("disableligatures.ligatures", "disableligatures"),
      {
        category: "",
        label: "Ligatures"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo.bar.etc", "foo"),
      {
        category: "Bar",
        label: "Etc"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("fooBar.etcSomething", "foo"),
      {
        category: "Foo Bar",
        label: "Etc Something"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo.bar.etc", "foo/bar"),
      {
        category: "",
        label: "Etc"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("foo.bar.etc", "something/foo"),
      {
        category: "Bar",
        label: "Etc"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("bar.etc", "something.bar"),
      {
        category: "",
        label: "Etc"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("fooBar.etc", "fooBar"),
      {
        category: "",
        label: "Etc"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("fooBar.somethingElse.etc", "fooBar"),
      {
        category: "Something Else",
        label: "Etc"
      }
    );
  });
  test("settingKeyToDisplayFormat - known acronym/term", () => {
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("css.someCssSetting"),
      {
        category: "CSS",
        label: "Some CSS Setting"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("powershell.somePowerShellSetting"),
      {
        category: "PowerShell",
        label: "Some PowerShell Setting"
      }
    );
    assert.deepStrictEqual(
      settingKeyToDisplayFormat("ocaml.server.extendedHover"),
      {
        category: "OCaml \u203A Server",
        label: "Extended Hover"
      }
    );
  });
  test("parseQuery", () => {
    function testParseQuery(input, expected) {
      assert.deepStrictEqual(
        parseQuery(input),
        expected,
        input
      );
    }
    testParseQuery(
      "",
      {
        tags: [],
        extensionFilters: [],
        query: "",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@modified",
      {
        tags: ["modified"],
        extensionFilters: [],
        query: "",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@tag:foo",
      {
        tags: ["foo"],
        extensionFilters: [],
        query: "",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@modified foo",
      {
        tags: ["modified"],
        extensionFilters: [],
        query: "foo",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@tag:foo @modified",
      {
        tags: ["foo", "modified"],
        extensionFilters: [],
        query: "",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@tag:foo @modified my query",
      {
        tags: ["foo", "modified"],
        extensionFilters: [],
        query: "my query",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "test @modified query",
      {
        tags: ["modified"],
        extensionFilters: [],
        query: "test  query",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "test @modified",
      {
        tags: ["modified"],
        extensionFilters: [],
        query: "test",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "query has @ for some reason",
      {
        tags: [],
        extensionFilters: [],
        query: "query has @ for some reason",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@ext:github.vscode-pull-request-github",
      {
        tags: [],
        extensionFilters: ["github.vscode-pull-request-github"],
        query: "",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@ext:github.vscode-pull-request-github,vscode.git",
      {
        tags: [],
        extensionFilters: ["github.vscode-pull-request-github", "vscode.git"],
        query: "",
        featureFilters: [],
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@feature:scm",
      {
        tags: [],
        extensionFilters: [],
        featureFilters: ["scm"],
        query: "",
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@feature:scm,terminal",
      {
        tags: [],
        extensionFilters: [],
        featureFilters: ["scm", "terminal"],
        query: "",
        idFilters: [],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@id:files.autoSave",
      {
        tags: [],
        extensionFilters: [],
        featureFilters: [],
        query: "",
        idFilters: ["files.autoSave"],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@id:files.autoSave,terminal.integrated.commandsToSkipShell",
      {
        tags: [],
        extensionFilters: [],
        featureFilters: [],
        query: "",
        idFilters: ["files.autoSave", "terminal.integrated.commandsToSkipShell"],
        languageFilter: void 0
      }
    );
    testParseQuery(
      "@lang:cpp",
      {
        tags: [],
        extensionFilters: [],
        featureFilters: [],
        query: "",
        idFilters: [],
        languageFilter: "cpp"
      }
    );
    testParseQuery(
      "@lang:cpp,python",
      {
        tags: [],
        extensionFilters: [],
        featureFilters: [],
        query: "",
        idFilters: [],
        languageFilter: "cpp"
      }
    );
  });
  test("sanitizeId replaces all dots and slashes", () => {
    assert.deepStrictEqual(
      [
        sanitizeId("root.editor.font.size"),
        sanitizeId("group/subgroup/setting.key"),
        sanitizeId("no-special-chars"),
        sanitizeId("single.dot")
      ],
      [
        "root_editor_font_size",
        "group_subgroup_setting_key",
        "no-special-chars",
        "single_dot"
      ]
    );
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFx0ZXN0XFxicm93c2VyXFxzZXR0aW5nc1RyZWVNb2RlbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgc2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdCwgcGFyc2VRdWVyeSwgSVBhcnNlZFF1ZXJ5LCBzYW5pdGl6ZUlkIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXR0aW5nc1RyZWVNb2RlbHMuanMnO1xuXG5zdWl0ZSgnU2V0dGluZ3NUcmVlJywgKCkgPT4ge1xuXHR0ZXN0KCdzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdmb28uYmFyJyksXG5cdFx0XHR7XG5cdFx0XHRcdGNhdGVnb3J5OiAnRm9vJyxcblx0XHRcdFx0bGFiZWw6ICdCYXInXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdmb28uYmFyLmV0YycpLFxuXHRcdFx0e1xuXHRcdFx0XHRjYXRlZ29yeTogJ0ZvbyBcdTIwM0EgQmFyJyxcblx0XHRcdFx0bGFiZWw6ICdFdGMnXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdmb29CYXIuZXRjU29tZXRoaW5nJyksXG5cdFx0XHR7XG5cdFx0XHRcdGNhdGVnb3J5OiAnRm9vIEJhcicsXG5cdFx0XHRcdGxhYmVsOiAnRXRjIFNvbWV0aGluZydcblx0XHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoJ2ZvbycpLFxuXHRcdFx0e1xuXHRcdFx0XHRjYXRlZ29yeTogJycsXG5cdFx0XHRcdGxhYmVsOiAnRm9vJ1xuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdCgnZm9vLjFsZWFkaW5nLm51bWJlcicpLFxuXHRcdFx0e1xuXHRcdFx0XHRjYXRlZ29yeTogJ0ZvbyBcdTIwM0EgMWxlYWRpbmcnLFxuXHRcdFx0XHRsYWJlbDogJ051bWJlcidcblx0XHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoJ2Zvby4xTGVhZGluZy5udW1iZXInKSxcblx0XHRcdHtcblx0XHRcdFx0Y2F0ZWdvcnk6ICdGb28gXHUyMDNBIDEgTGVhZGluZycsXG5cdFx0XHRcdGxhYmVsOiAnTnVtYmVyJ1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQgLSB3aXRoIGNhdGVnb3J5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdmb28uYmFyJywgJ2ZvbycpLFxuXHRcdFx0e1xuXHRcdFx0XHRjYXRlZ29yeTogJycsXG5cdFx0XHRcdGxhYmVsOiAnQmFyJ1xuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdCgnZGlzYWJsZWxpZ2F0dXJlcy5saWdhdHVyZXMnLCAnZGlzYWJsZWxpZ2F0dXJlcycpLFxuXHRcdFx0e1xuXHRcdFx0XHRjYXRlZ29yeTogJycsXG5cdFx0XHRcdGxhYmVsOiAnTGlnYXR1cmVzJ1xuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdCgnZm9vLmJhci5ldGMnLCAnZm9vJyksXG5cdFx0XHR7XG5cdFx0XHRcdGNhdGVnb3J5OiAnQmFyJyxcblx0XHRcdFx0bGFiZWw6ICdFdGMnXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdmb29CYXIuZXRjU29tZXRoaW5nJywgJ2ZvbycpLFxuXHRcdFx0e1xuXHRcdFx0XHRjYXRlZ29yeTogJ0ZvbyBCYXInLFxuXHRcdFx0XHRsYWJlbDogJ0V0YyBTb21ldGhpbmcnXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdmb28uYmFyLmV0YycsICdmb28vYmFyJyksXG5cdFx0XHR7XG5cdFx0XHRcdGNhdGVnb3J5OiAnJyxcblx0XHRcdFx0bGFiZWw6ICdFdGMnXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdmb28uYmFyLmV0YycsICdzb21ldGhpbmcvZm9vJyksXG5cdFx0XHR7XG5cdFx0XHRcdGNhdGVnb3J5OiAnQmFyJyxcblx0XHRcdFx0bGFiZWw6ICdFdGMnXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdiYXIuZXRjJywgJ3NvbWV0aGluZy5iYXInKSxcblx0XHRcdHtcblx0XHRcdFx0Y2F0ZWdvcnk6ICcnLFxuXHRcdFx0XHRsYWJlbDogJ0V0Yydcblx0XHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoJ2Zvb0Jhci5ldGMnLCAnZm9vQmFyJyksXG5cdFx0XHR7XG5cdFx0XHRcdGNhdGVnb3J5OiAnJyxcblx0XHRcdFx0bGFiZWw6ICdFdGMnXG5cdFx0XHR9KTtcblxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoJ2Zvb0Jhci5zb21ldGhpbmdFbHNlLmV0YycsICdmb29CYXInKSxcblx0XHRcdHtcblx0XHRcdFx0Y2F0ZWdvcnk6ICdTb21ldGhpbmcgRWxzZScsXG5cdFx0XHRcdGxhYmVsOiAnRXRjJ1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQgLSBrbm93biBhY3JvbnltL3Rlcm0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoJ2Nzcy5zb21lQ3NzU2V0dGluZycpLFxuXHRcdFx0e1xuXHRcdFx0XHRjYXRlZ29yeTogJ0NTUycsXG5cdFx0XHRcdGxhYmVsOiAnU29tZSBDU1MgU2V0dGluZydcblx0XHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNldHRpbmdLZXlUb0Rpc3BsYXlGb3JtYXQoJ3Bvd2Vyc2hlbGwuc29tZVBvd2VyU2hlbGxTZXR0aW5nJyksXG5cdFx0XHR7XG5cdFx0XHRcdGNhdGVnb3J5OiAnUG93ZXJTaGVsbCcsXG5cdFx0XHRcdGxhYmVsOiAnU29tZSBQb3dlclNoZWxsIFNldHRpbmcnXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KCdvY2FtbC5zZXJ2ZXIuZXh0ZW5kZWRIb3ZlcicpLFxuXHRcdFx0e1xuXHRcdFx0XHRjYXRlZ29yeTogJ09DYW1sIFx1MjAzQSBTZXJ2ZXInLFxuXHRcdFx0XHRsYWJlbDogJ0V4dGVuZGVkIEhvdmVyJ1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlUXVlcnknLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdGVzdFBhcnNlUXVlcnkoaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IElQYXJzZWRRdWVyeSkge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VRdWVyeShpbnB1dCksXG5cdFx0XHRcdGV4cGVjdGVkLFxuXHRcdFx0XHRpbnB1dFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0ZXN0UGFyc2VRdWVyeShcblx0XHRcdCcnLFxuXHRcdFx0PElQYXJzZWRRdWVyeT57XG5cdFx0XHRcdHRhZ3M6IFtdLFxuXHRcdFx0XHRleHRlbnNpb25GaWx0ZXJzOiBbXSxcblx0XHRcdFx0cXVlcnk6ICcnLFxuXHRcdFx0XHRmZWF0dXJlRmlsdGVyczogW10sXG5cdFx0XHRcdGlkRmlsdGVyczogW10sXG5cdFx0XHRcdGxhbmd1YWdlRmlsdGVyOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXG5cdFx0dGVzdFBhcnNlUXVlcnkoXG5cdFx0XHQnQG1vZGlmaWVkJyxcblx0XHRcdDxJUGFyc2VkUXVlcnk+e1xuXHRcdFx0XHR0YWdzOiBbJ21vZGlmaWVkJ10sXG5cdFx0XHRcdGV4dGVuc2lvbkZpbHRlcnM6IFtdLFxuXHRcdFx0XHRxdWVyeTogJycsXG5cdFx0XHRcdGZlYXR1cmVGaWx0ZXJzOiBbXSxcblx0XHRcdFx0aWRGaWx0ZXJzOiBbXSxcblx0XHRcdFx0bGFuZ3VhZ2VGaWx0ZXI6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cblx0XHR0ZXN0UGFyc2VRdWVyeShcblx0XHRcdCdAdGFnOmZvbycsXG5cdFx0XHQ8SVBhcnNlZFF1ZXJ5Pntcblx0XHRcdFx0dGFnczogWydmb28nXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAnJyxcblx0XHRcdFx0ZmVhdHVyZUZpbHRlcnM6IFtdLFxuXHRcdFx0XHRpZEZpbHRlcnM6IFtdLFxuXHRcdFx0XHRsYW5ndWFnZUZpbHRlcjogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblxuXHRcdHRlc3RQYXJzZVF1ZXJ5KFxuXHRcdFx0J0Btb2RpZmllZCBmb28nLFxuXHRcdFx0PElQYXJzZWRRdWVyeT57XG5cdFx0XHRcdHRhZ3M6IFsnbW9kaWZpZWQnXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAnZm9vJyxcblx0XHRcdFx0ZmVhdHVyZUZpbHRlcnM6IFtdLFxuXHRcdFx0XHRpZEZpbHRlcnM6IFtdLFxuXHRcdFx0XHRsYW5ndWFnZUZpbHRlcjogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblxuXHRcdHRlc3RQYXJzZVF1ZXJ5KFxuXHRcdFx0J0B0YWc6Zm9vIEBtb2RpZmllZCcsXG5cdFx0XHQ8SVBhcnNlZFF1ZXJ5Pntcblx0XHRcdFx0dGFnczogWydmb28nLCAnbW9kaWZpZWQnXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAnJyxcblx0XHRcdFx0ZmVhdHVyZUZpbHRlcnM6IFtdLFxuXHRcdFx0XHRpZEZpbHRlcnM6IFtdLFxuXHRcdFx0XHRsYW5ndWFnZUZpbHRlcjogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblxuXHRcdHRlc3RQYXJzZVF1ZXJ5KFxuXHRcdFx0J0B0YWc6Zm9vIEBtb2RpZmllZCBteSBxdWVyeScsXG5cdFx0XHQ8SVBhcnNlZFF1ZXJ5Pntcblx0XHRcdFx0dGFnczogWydmb28nLCAnbW9kaWZpZWQnXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAnbXkgcXVlcnknLFxuXHRcdFx0XHRmZWF0dXJlRmlsdGVyczogW10sXG5cdFx0XHRcdGlkRmlsdGVyczogW10sXG5cdFx0XHRcdGxhbmd1YWdlRmlsdGVyOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXG5cdFx0dGVzdFBhcnNlUXVlcnkoXG5cdFx0XHQndGVzdCBAbW9kaWZpZWQgcXVlcnknLFxuXHRcdFx0PElQYXJzZWRRdWVyeT57XG5cdFx0XHRcdHRhZ3M6IFsnbW9kaWZpZWQnXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAndGVzdCAgcXVlcnknLFxuXHRcdFx0XHRmZWF0dXJlRmlsdGVyczogW10sXG5cdFx0XHRcdGlkRmlsdGVyczogW10sXG5cdFx0XHRcdGxhbmd1YWdlRmlsdGVyOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXG5cdFx0dGVzdFBhcnNlUXVlcnkoXG5cdFx0XHQndGVzdCBAbW9kaWZpZWQnLFxuXHRcdFx0PElQYXJzZWRRdWVyeT57XG5cdFx0XHRcdHRhZ3M6IFsnbW9kaWZpZWQnXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAndGVzdCcsXG5cdFx0XHRcdGZlYXR1cmVGaWx0ZXJzOiBbXSxcblx0XHRcdFx0aWRGaWx0ZXJzOiBbXSxcblx0XHRcdFx0bGFuZ3VhZ2VGaWx0ZXI6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cblx0XHR0ZXN0UGFyc2VRdWVyeShcblx0XHRcdCdxdWVyeSBoYXMgQCBmb3Igc29tZSByZWFzb24nLFxuXHRcdFx0PElQYXJzZWRRdWVyeT57XG5cdFx0XHRcdHRhZ3M6IFtdLFxuXHRcdFx0XHRleHRlbnNpb25GaWx0ZXJzOiBbXSxcblx0XHRcdFx0cXVlcnk6ICdxdWVyeSBoYXMgQCBmb3Igc29tZSByZWFzb24nLFxuXHRcdFx0XHRmZWF0dXJlRmlsdGVyczogW10sXG5cdFx0XHRcdGlkRmlsdGVyczogW10sXG5cdFx0XHRcdGxhbmd1YWdlRmlsdGVyOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXG5cdFx0dGVzdFBhcnNlUXVlcnkoXG5cdFx0XHQnQGV4dDpnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWInLFxuXHRcdFx0PElQYXJzZWRRdWVyeT57XG5cdFx0XHRcdHRhZ3M6IFtdLFxuXHRcdFx0XHRleHRlbnNpb25GaWx0ZXJzOiBbJ2dpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1YiddLFxuXHRcdFx0XHRxdWVyeTogJycsXG5cdFx0XHRcdGZlYXR1cmVGaWx0ZXJzOiBbXSxcblx0XHRcdFx0aWRGaWx0ZXJzOiBbXSxcblx0XHRcdFx0bGFuZ3VhZ2VGaWx0ZXI6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cblx0XHR0ZXN0UGFyc2VRdWVyeShcblx0XHRcdCdAZXh0OmdpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1Yix2c2NvZGUuZ2l0Jyxcblx0XHRcdDxJUGFyc2VkUXVlcnk+e1xuXHRcdFx0XHR0YWdzOiBbXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogWydnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWInLCAndnNjb2RlLmdpdCddLFxuXHRcdFx0XHRxdWVyeTogJycsXG5cdFx0XHRcdGZlYXR1cmVGaWx0ZXJzOiBbXSxcblx0XHRcdFx0aWRGaWx0ZXJzOiBbXSxcblx0XHRcdFx0bGFuZ3VhZ2VGaWx0ZXI6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0dGVzdFBhcnNlUXVlcnkoXG5cdFx0XHQnQGZlYXR1cmU6c2NtJyxcblx0XHRcdDxJUGFyc2VkUXVlcnk+e1xuXHRcdFx0XHR0YWdzOiBbXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogW10sXG5cdFx0XHRcdGZlYXR1cmVGaWx0ZXJzOiBbJ3NjbSddLFxuXHRcdFx0XHRxdWVyeTogJycsXG5cdFx0XHRcdGlkRmlsdGVyczogW10sXG5cdFx0XHRcdGxhbmd1YWdlRmlsdGVyOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXG5cdFx0dGVzdFBhcnNlUXVlcnkoXG5cdFx0XHQnQGZlYXR1cmU6c2NtLHRlcm1pbmFsJyxcblx0XHRcdDxJUGFyc2VkUXVlcnk+e1xuXHRcdFx0XHR0YWdzOiBbXSxcblx0XHRcdFx0ZXh0ZW5zaW9uRmlsdGVyczogW10sXG5cdFx0XHRcdGZlYXR1cmVGaWx0ZXJzOiBbJ3NjbScsICd0ZXJtaW5hbCddLFxuXHRcdFx0XHRxdWVyeTogJycsXG5cdFx0XHRcdGlkRmlsdGVyczogW10sXG5cdFx0XHRcdGxhbmd1YWdlRmlsdGVyOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdHRlc3RQYXJzZVF1ZXJ5KFxuXHRcdFx0J0BpZDpmaWxlcy5hdXRvU2F2ZScsXG5cdFx0XHQ8SVBhcnNlZFF1ZXJ5Pntcblx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdGV4dGVuc2lvbkZpbHRlcnM6IFtdLFxuXHRcdFx0XHRmZWF0dXJlRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAnJyxcblx0XHRcdFx0aWRGaWx0ZXJzOiBbJ2ZpbGVzLmF1dG9TYXZlJ10sXG5cdFx0XHRcdGxhbmd1YWdlRmlsdGVyOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXG5cdFx0dGVzdFBhcnNlUXVlcnkoXG5cdFx0XHQnQGlkOmZpbGVzLmF1dG9TYXZlLHRlcm1pbmFsLmludGVncmF0ZWQuY29tbWFuZHNUb1NraXBTaGVsbCcsXG5cdFx0XHQ8SVBhcnNlZFF1ZXJ5Pntcblx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdGV4dGVuc2lvbkZpbHRlcnM6IFtdLFxuXHRcdFx0XHRmZWF0dXJlRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAnJyxcblx0XHRcdFx0aWRGaWx0ZXJzOiBbJ2ZpbGVzLmF1dG9TYXZlJywgJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29tbWFuZHNUb1NraXBTaGVsbCddLFxuXHRcdFx0XHRsYW5ndWFnZUZpbHRlcjogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblxuXHRcdHRlc3RQYXJzZVF1ZXJ5KFxuXHRcdFx0J0BsYW5nOmNwcCcsXG5cdFx0XHQ8SVBhcnNlZFF1ZXJ5Pntcblx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdGV4dGVuc2lvbkZpbHRlcnM6IFtdLFxuXHRcdFx0XHRmZWF0dXJlRmlsdGVyczogW10sXG5cdFx0XHRcdHF1ZXJ5OiAnJyxcblx0XHRcdFx0aWRGaWx0ZXJzOiBbXSxcblx0XHRcdFx0bGFuZ3VhZ2VGaWx0ZXI6ICdjcHAnXG5cdFx0XHR9KTtcblxuXHRcdHRlc3RQYXJzZVF1ZXJ5KFxuXHRcdFx0J0BsYW5nOmNwcCxweXRob24nLFxuXHRcdFx0PElQYXJzZWRRdWVyeT57XG5cdFx0XHRcdHRhZ3M6IFtdLFxuXHRcdFx0XHRleHRlbnNpb25GaWx0ZXJzOiBbXSxcblx0XHRcdFx0ZmVhdHVyZUZpbHRlcnM6IFtdLFxuXHRcdFx0XHRxdWVyeTogJycsXG5cdFx0XHRcdGlkRmlsdGVyczogW10sXG5cdFx0XHRcdGxhbmd1YWdlRmlsdGVyOiAnY3BwJ1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nhbml0aXplSWQgcmVwbGFjZXMgYWxsIGRvdHMgYW5kIHNsYXNoZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0c2FuaXRpemVJZCgncm9vdC5lZGl0b3IuZm9udC5zaXplJyksXG5cdFx0XHRcdHNhbml0aXplSWQoJ2dyb3VwL3N1Ymdyb3VwL3NldHRpbmcua2V5JyksXG5cdFx0XHRcdHNhbml0aXplSWQoJ25vLXNwZWNpYWwtY2hhcnMnKSxcblx0XHRcdFx0c2FuaXRpemVJZCgnc2luZ2xlLmRvdCcpLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3Jvb3RfZWRpdG9yX2ZvbnRfc2l6ZScsXG5cdFx0XHRcdCdncm91cF9zdWJncm91cF9zZXR0aW5nX2tleScsXG5cdFx0XHRcdCduby1zcGVjaWFsLWNoYXJzJyxcblx0XHRcdFx0J3NpbmdsZV9kb3QnLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkIsWUFBMEIsa0JBQWtCO0FBRWhGLE1BQU0sZ0JBQWdCLE1BQU07QUFDM0IsT0FBSyw2QkFBNkIsTUFBTTtBQUN2QyxXQUFPO0FBQUEsTUFDTiwwQkFBMEIsU0FBUztBQUFBLE1BQ25DO0FBQUEsUUFDQyxVQUFVO0FBQUEsUUFDVixPQUFPO0FBQUEsTUFDUjtBQUFBLElBQUM7QUFFRixXQUFPO0FBQUEsTUFDTiwwQkFBMEIsYUFBYTtBQUFBLE1BQ3ZDO0FBQUEsUUFDQyxVQUFVO0FBQUEsUUFDVixPQUFPO0FBQUEsTUFDUjtBQUFBLElBQUM7QUFFRixXQUFPO0FBQUEsTUFDTiwwQkFBMEIscUJBQXFCO0FBQUEsTUFDL0M7QUFBQSxRQUNDLFVBQVU7QUFBQSxRQUNWLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFBQztBQUVGLFdBQU87QUFBQSxNQUNOLDBCQUEwQixLQUFLO0FBQUEsTUFDL0I7QUFBQSxRQUNDLFVBQVU7QUFBQSxRQUNWLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFBQztBQUVGLFdBQU87QUFBQSxNQUNOLDBCQUEwQixxQkFBcUI7QUFBQSxNQUMvQztBQUFBLFFBQ0MsVUFBVTtBQUFBLFFBQ1YsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUFDO0FBRUYsV0FBTztBQUFBLE1BQ04sMEJBQTBCLHFCQUFxQjtBQUFBLE1BQy9DO0FBQUEsUUFDQyxVQUFVO0FBQUEsUUFDVixPQUFPO0FB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
