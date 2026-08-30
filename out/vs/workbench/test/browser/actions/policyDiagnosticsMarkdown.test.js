import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { markdownDetails, markdownJsonBlock, markdownTable } from "../../../browser/actions/policyDiagnosticsMarkdown.js";
suite("Policy diagnostics Markdown", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("renders escaped tables and collapsed details", () => {
    const output = markdownTable(
      ["Property", "Value"],
      [
        ["pipe|name", "line 1\n- line 2 <script>*"],
        ["bracket[one]", "A & B"]
      ]
    ) + markdownDetails("Raw <settings> & values", markdownJsonBlock({ value: "raw" }));
    assert.deepStrictEqual(output.split("\n"), [
      "| Property | Value |",
      "| --- | --- |",
      "| pipe\\|name | line 1<br>\\- line 2 &lt;script&gt;\\* |",
      "| bracket\\[one\\] | A &amp; B |",
      "",
      "<details>",
      "<summary>Raw &lt;settings&gt; &amp; values</summary>",
      "",
      "```json",
      "{",
      '  "value": "raw"',
      "}",
      "```",
      "",
      "</details>",
      "",
      ""
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGFjdGlvbnNcXHBvbGljeURpYWdub3N0aWNzTWFya2Rvd24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbWFya2Rvd25EZXRhaWxzLCBtYXJrZG93bkpzb25CbG9jaywgbWFya2Rvd25UYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9wb2xpY3lEaWFnbm9zdGljc01hcmtkb3duLmpzJztcblxuc3VpdGUoJ1BvbGljeSBkaWFnbm9zdGljcyBNYXJrZG93bicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVuZGVycyBlc2NhcGVkIHRhYmxlcyBhbmQgY29sbGFwc2VkIGRldGFpbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gbWFya2Rvd25UYWJsZShcblx0XHRcdFsnUHJvcGVydHknLCAnVmFsdWUnXSxcblx0XHRcdFtcblx0XHRcdFx0WydwaXBlfG5hbWUnLCAnbGluZSAxXFxuLSBsaW5lIDIgPHNjcmlwdD4qJ10sXG5cdFx0XHRcdFsnYnJhY2tldFtvbmVdJywgJ0EgJiBCJ11cblx0XHRcdF1cblx0XHQpICsgbWFya2Rvd25EZXRhaWxzKCdSYXcgPHNldHRpbmdzPiAmIHZhbHVlcycsIG1hcmtkb3duSnNvbkJsb2NrKHsgdmFsdWU6ICdyYXcnIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0cHV0LnNwbGl0KCdcXG4nKSwgW1xuXHRcdFx0J3wgUHJvcGVydHkgfCBWYWx1ZSB8Jyxcblx0XHRcdCd8IC0tLSB8IC0tLSB8Jyxcblx0XHRcdCd8IHBpcGVcXFxcfG5hbWUgfCBsaW5lIDE8YnI+XFxcXC0gbGluZSAyICZsdDtzY3JpcHQmZ3Q7XFxcXCogfCcsXG5cdFx0XHQnfCBicmFja2V0XFxcXFtvbmVcXFxcXSB8IEEgJmFtcDsgQiB8Jyxcblx0XHRcdCcnLFxuXHRcdFx0JzxkZXRhaWxzPicsXG5cdFx0XHQnPHN1bW1hcnk+UmF3ICZsdDtzZXR0aW5ncyZndDsgJmFtcDsgdmFsdWVzPC9zdW1tYXJ5PicsXG5cdFx0XHQnJyxcblx0XHRcdCdgYGBqc29uJyxcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwidmFsdWVcIjogXCJyYXdcIicsXG5cdFx0XHQnfScsXG5cdFx0XHQnYGBgJyxcblx0XHRcdCcnLFxuXHRcdFx0JzwvZGV0YWlscz4nLFxuXHRcdFx0JycsXG5cdFx0XHQnJ1xuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUJBQWlCLG1CQUFtQixxQkFBcUI7QUFFbEUsTUFBTSwrQkFBK0IsTUFBTTtBQUMxQywwQ0FBd0M7QUFFeEMsT0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxVQUFNLFNBQVM7QUFBQSxNQUNkLENBQUMsWUFBWSxPQUFPO0FBQUEsTUFDcEI7QUFBQSxRQUNDLENBQUMsYUFBYSw0QkFBNEI7QUFBQSxRQUMxQyxDQUFDLGdCQUFnQixPQUFPO0FBQUEsTUFDekI7QUFBQSxJQUNELElBQUksZ0JBQWdCLDJCQUEyQixrQkFBa0IsRUFBRSxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBRWxGLFdBQU8sZ0JBQWdCLE9BQU8sTUFBTSxJQUFJLEdBQUc7QUFBQSxNQUMxQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
