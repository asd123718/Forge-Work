import assert from "assert";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { annotateSpecialMarkdownContent, extractCodeblockUrisFromText, extractSubAgentInvocationIdFromText, extractVulnerabilitiesFromText, hasEditCodeblockUriTag, isInsideCodeContext } from "../../../common/widget/annotations.js";
function content(str) {
  return { kind: "markdownContent", content: new MarkdownString(str) };
}
suite("Annotations", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("voice progress is not renderable", () => {
    assert.deepStrictEqual(
      annotateSpecialMarkdownContent([
        { kind: "voiceProgress", id: "investigating", value: "Investigating the relevant code." },
        content("Visible response")
      ]),
      [content("Visible response")]
    );
  });
  suite("extractVulnerabilitiesFromText", () => {
    test("single line", async () => {
      const before = "some code ";
      const vulnContent = "content with vuln";
      const after = " after";
      const annotatedResult = annotateSpecialMarkdownContent([content(before), { kind: "markdownVuln", content: new MarkdownString(vulnContent), vulnerabilities: [{ title: "title", description: "vuln" }] }, content(after)]);
      await assertSnapshot(annotatedResult);
      const markdown = annotatedResult[0];
      const result = extractVulnerabilitiesFromText(markdown.content.value);
      await assertSnapshot(result);
    });
    test("multiline", async () => {
      const before = "some code\nover\nmultiple lines ";
      const vulnContent = "content with vuln\nand\nnewlines";
      const after = "more code\nwith newline";
      const annotatedResult = annotateSpecialMarkdownContent([content(before), { kind: "markdownVuln", content: new MarkdownString(vulnContent), vulnerabilities: [{ title: "title", description: "vuln" }] }, content(after)]);
      await assertSnapshot(annotatedResult);
      const markdown = annotatedResult[0];
      const result = extractVulnerabilitiesFromText(markdown.content.value);
      await assertSnapshot(result);
    });
    test("multiple vulns", async () => {
      const before = "some code\nover\nmultiple lines ";
      const vulnContent = "content with vuln\nand\nnewlines";
      const after = "more code\nwith newline";
      const annotatedResult = annotateSpecialMarkdownContent([
        content(before),
        { kind: "markdownVuln", content: new MarkdownString(vulnContent), vulnerabilities: [{ title: "title", description: "vuln" }] },
        content(after),
        { kind: "markdownVuln", content: new MarkdownString(vulnContent), vulnerabilities: [{ title: "title", description: "vuln" }] }
      ]);
      await assertSnapshot(annotatedResult);
      const markdown = annotatedResult[0];
      const result = extractVulnerabilitiesFromText(markdown.content.value);
      await assertSnapshot(result);
    });
  });
  suite("extractSubAgentInvocationIdFromText", () => {
    test("extracts subAgentInvocationId from codeblock uri tag", () => {
      const subAgentId = "test-agent-123";
      const uri = URI.parse("file:///test.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true,
        subAgentInvocationId: subAgentId
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const result = extractSubAgentInvocationIdFromText(markdown.content.value);
      assert.strictEqual(result, subAgentId);
    });
    test("returns undefined when no subAgentInvocationId", () => {
      const uri = URI.parse("file:///test.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const result = extractSubAgentInvocationIdFromText(markdown.content.value);
      assert.strictEqual(result, void 0);
    });
    test("returns undefined for text without codeblock uri tag", () => {
      const result = extractSubAgentInvocationIdFromText("some random text");
      assert.strictEqual(result, void 0);
    });
    test("handles special characters in subAgentInvocationId via URL encoding", () => {
      const subAgentId = "agent-with-special&chars=value";
      const uri = URI.parse("file:///test.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true,
        subAgentInvocationId: subAgentId
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const result = extractSubAgentInvocationIdFromText(markdown.content.value);
      assert.strictEqual(result, subAgentId);
    });
    test("handles malformed URL encoding gracefully", () => {
      const malformedTag = '<vscode_codeblock_uri isEdit subAgentInvocationId="%ZZ">file:///test.ts</vscode_codeblock_uri>';
      const result = extractSubAgentInvocationIdFromText(malformedTag);
      assert.strictEqual(result, "%ZZ");
    });
  });
  suite("extractCodeblockUrisFromText with subAgentInvocationId", () => {
    test("extracts subAgentInvocationId from codeblock uri", () => {
      const subAgentId = "test-subagent-456";
      const uri = URI.parse("file:///example.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true,
        subAgentInvocationId: subAgentId
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const result = extractCodeblockUrisFromText(markdown.content.value);
      assert.ok(result);
      assert.strictEqual(result.subAgentInvocationId, subAgentId);
      assert.strictEqual(result.uri.toString(), uri.toString());
      assert.strictEqual(result.isEdit, true);
    });
    test("returns undefined for invalid URI content inside codeblock uri tag", () => {
      const invalidTag = "<vscode_codeblock_uri>```typescript\nconst uri: string\n```</vscode_codeblock_uri>";
      const result = extractCodeblockUrisFromText(invalidTag);
      assert.strictEqual(result, void 0);
    });
    test("round-trip encoding/decoding with special characters", () => {
      const subAgentId = "agent/with spaces&special=chars?more";
      const uri = URI.parse("file:///path/to/file.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true,
        subAgentInvocationId: subAgentId
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const extracted = extractCodeblockUrisFromText(markdown.content.value);
      assert.ok(extracted);
      assert.strictEqual(extracted.subAgentInvocationId, subAgentId);
    });
  });
  suite("isInsideCodeContext", () => {
    test("not inside code for plain text", () => {
      assert.strictEqual(isInsideCodeContext("hello world"), false);
    });
    test("not inside code after closed inline code", () => {
      assert.strictEqual(isInsideCodeContext("run `code` and"), false);
    });
    test("inside unclosed single backtick", () => {
      assert.strictEqual(isInsideCodeContext("run `npx tsx "), true);
    });
    test("inside unclosed double backtick", () => {
      assert.strictEqual(isInsideCodeContext("run ``npx tsx "), true);
    });
    test("not inside code after closed double backtick", () => {
      assert.strictEqual(isInsideCodeContext("run ``code`` and"), false);
    });
    test("inside fenced code block", () => {
      assert.strictEqual(isInsideCodeContext("text\n```bash\nnpx tsx "), true);
    });
    test("not inside closed fenced code block", () => {
      assert.strictEqual(isInsideCodeContext("text\n```bash\ncode\n```\nafter"), false);
    });
    test("inside fenced code block with tildes", () => {
      assert.strictEqual(isInsideCodeContext("text\n~~~\ncode"), true);
    });
    test("empty string", () => {
      assert.strictEqual(isInsideCodeContext(""), false);
    });
  });
  suite("annotateSpecialMarkdownContent - inline references in code blocks", () => {
    test("inline reference inside backtick code span uses plain text", () => {
      const result = annotateSpecialMarkdownContent([
        content("Run `npx tsx "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" },
        content(" eval "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///primer.eval.json"), name: "primer.eval.json" },
        content(" --repo .`")
      ]);
      assert.strictEqual(result.length, 1);
      const md = result[0];
      assert.strictEqual(md.content.value, "Run `npx tsx index.ts eval primer.eval.json --repo .`");
      assert.strictEqual(md.inlineReferences, void 0);
    });
    test("inline reference outside code span uses content ref link", () => {
      const result = annotateSpecialMarkdownContent([
        content("See "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" },
        content(" for details")
      ]);
      assert.strictEqual(result.length, 1);
      const md = result[0];
      assert.ok(md.content.value.includes("[index.ts]"));
      assert.ok(md.content.value.includes("_vscodecontentref_"));
      assert.ok(md.inlineReferences);
    });
    test("inline reference inside fenced code block uses plain text", () => {
      const result = annotateSpecialMarkdownContent([
        content("Example:\n```bash\nnpx tsx "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" }
      ]);
      assert.strictEqual(result.length, 1);
      const md = result[0];
      assert.ok(!md.content.value.includes("_vscodecontentref_"));
      assert.ok(md.content.value.endsWith("index.ts"));
    });
    test("inline reference at start of block merges with following markdown", () => {
      const result = annotateSpecialMarkdownContent([
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" },
        { kind: "markdownContent", content: new MarkdownString(" is the entry point", { isTrusted: true, supportThemeIcons: true }) }
      ]);
      assert.strictEqual(result.length, 1);
      const md = result[0];
      assert.ok(md.content.value.includes("[index.ts]"));
      assert.ok(md.content.value.includes("_vscodecontentref_"));
      assert.ok(md.content.value.endsWith(" is the entry point"));
      assert.ok(md.inlineReferences);
      assert.strictEqual(md.content.isTrusted, true);
      assert.strictEqual(md.content.supportThemeIcons, true);
    });
    test("inline reference after regular text does not force-merge incompatible markdown", () => {
      const result = annotateSpecialMarkdownContent([
        content("See "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" },
        { kind: "markdownContent", content: new MarkdownString(" more info", { isTrusted: true, supportThemeIcons: true }) }
      ]);
      assert.strictEqual(result.length, 2);
      const first = result[0];
      assert.ok(first.content.value.startsWith("See "));
      assert.ok(first.inlineReferences);
      const second = result[1];
      assert.strictEqual(second.content.value, " more info");
      assert.strictEqual(second.content.isTrusted, true);
    });
  });
  suite("hasEditCodeblockUriTag", () => {
    test("returns true for edit codeblock URI tags", () => {
      const editTag = "<vscode_codeblock_uri isEdit>file:///test.ts</vscode_codeblock_uri>";
      assert.strictEqual(hasEditCodeblockUriTag(editTag), true);
    });
    test("returns false for non-edit codeblock URI tags", () => {
      const nonEditTag = "<vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri>";
      assert.strictEqual(hasEditCodeblockUriTag(nonEditTag), false);
    });
    test("returns true for edit codeblock URI tags with subAgentInvocationId", () => {
      const editTagWithSubAgent = '<vscode_codeblock_uri isEdit subAgentInvocationId="agent-123">file:///test.ts</vscode_codeblock_uri>';
      assert.strictEqual(hasEditCodeblockUriTag(editTagWithSubAgent), true);
    });
    test("returns false for non-edit codeblock URI tags with subAgentInvocationId", () => {
      const nonEditTagWithSubAgent = '<vscode_codeblock_uri subAgentInvocationId="agent-123">file:///test.ts</vscode_codeblock_uri>';
      assert.strictEqual(hasEditCodeblockUriTag(nonEditTagWithSubAgent), false);
    });
    test("returns false for text without codeblock URI tags", () => {
      assert.strictEqual(hasEditCodeblockUriTag("some plain text"), false);
    });
    test("returns false for text with only partial tag prefix", () => {
      assert.strictEqual(hasEditCodeblockUriTag("<vscode_codebloc"), false);
    });
    test("returns true for text containing multiple edit codeblock URI tags", () => {
      const multipleEditTags = "some text <vscode_codeblock_uri isEdit>file:///test.ts</vscode_codeblock_uri> more <vscode_codeblock_uri isEdit>file:///other.ts</vscode_codeblock_uri>";
      assert.strictEqual(hasEditCodeblockUriTag(multipleEditTags), true);
    });
    test("returns false for text containing only non-edit codeblock URI tags", () => {
      const multipleNonEditTags = "some text <vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri> more <vscode_codeblock_uri>file:///other.ts</vscode_codeblock_uri>";
      assert.strictEqual(hasEditCodeblockUriTag(multipleNonEditTags), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcd2lkZ2V0XFxhbm5vdGF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYXNzZXJ0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3NuYXBzaG90LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNYXJrZG93bkNvbnRlbnQsIElDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudCwgZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dCwgZXh0cmFjdFN1YkFnZW50SW52b2NhdGlvbklkRnJvbVRleHQsIGV4dHJhY3RWdWxuZXJhYmlsaXRpZXNGcm9tVGV4dCwgaGFzRWRpdENvZGVibG9ja1VyaVRhZywgaXNJbnNpZGVDb2RlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93aWRnZXQvYW5ub3RhdGlvbnMuanMnO1xuXG5mdW5jdGlvbiBjb250ZW50KHN0cjogc3RyaW5nKTogSUNoYXRNYXJrZG93bkNvbnRlbnQge1xuXHRyZXR1cm4geyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHN0cikgfTtcbn1cblxuc3VpdGUoJ0Fubm90YXRpb25zJywgZnVuY3Rpb24gKCkge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd2b2ljZSBwcm9ncmVzcyBpcyBub3QgcmVuZGVyYWJsZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtcblx0XHRcdFx0eyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAnaW52ZXN0aWdhdGluZycsIHZhbHVlOiAnSW52ZXN0aWdhdGluZyB0aGUgcmVsZXZhbnQgY29kZS4nIH0sXG5cdFx0XHRcdGNvbnRlbnQoJ1Zpc2libGUgcmVzcG9uc2UnKSxcblx0XHRcdF0pLFxuXHRcdFx0W2NvbnRlbnQoJ1Zpc2libGUgcmVzcG9uc2UnKV1cblx0XHQpO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXh0cmFjdFZ1bG5lcmFiaWxpdGllc0Zyb21UZXh0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbmdsZSBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gJ3NvbWUgY29kZSAnO1xuXHRcdFx0Y29uc3QgdnVsbkNvbnRlbnQgPSAnY29udGVudCB3aXRoIHZ1bG4nO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSAnIGFmdGVyJztcblx0XHRcdGNvbnN0IGFubm90YXRlZFJlc3VsdCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbY29udGVudChiZWZvcmUpLCB7IGtpbmQ6ICdtYXJrZG93blZ1bG4nLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcodnVsbkNvbnRlbnQpLCB2dWxuZXJhYmlsaXRpZXM6IFt7IHRpdGxlOiAndGl0bGUnLCBkZXNjcmlwdGlvbjogJ3Z1bG4nIH1dIH0sIGNvbnRlbnQoYWZ0ZXIpXSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhbm5vdGF0ZWRSZXN1bHQpO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGFubm90YXRlZFJlc3VsdFswXSBhcyBJQ2hhdE1hcmtkb3duQ29udGVudDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RWdWxuZXJhYmlsaXRpZXNGcm9tVGV4dChtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aWxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSAnc29tZSBjb2RlXFxub3Zlclxcbm11bHRpcGxlIGxpbmVzICc7XG5cdFx0XHRjb25zdCB2dWxuQ29udGVudCA9ICdjb250ZW50IHdpdGggdnVsblxcbmFuZFxcbm5ld2xpbmVzJztcblx0XHRcdGNvbnN0IGFmdGVyID0gJ21vcmUgY29kZVxcbndpdGggbmV3bGluZSc7XG5cdFx0XHRjb25zdCBhbm5vdGF0ZWRSZXN1bHQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW2NvbnRlbnQoYmVmb3JlKSwgeyBraW5kOiAnbWFya2Rvd25WdWxuJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHZ1bG5Db250ZW50KSwgdnVsbmVyYWJpbGl0aWVzOiBbeyB0aXRsZTogJ3RpdGxlJywgZGVzY3JpcHRpb246ICd2dWxuJyB9XSB9LCBjb250ZW50KGFmdGVyKV0pO1xuXHRcdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYW5ub3RhdGVkUmVzdWx0KTtcblxuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBhbm5vdGF0ZWRSZXN1bHRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0VnVsbmVyYWJpbGl0aWVzRnJvbVRleHQobWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgdnVsbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSAnc29tZSBjb2RlXFxub3Zlclxcbm11bHRpcGxlIGxpbmVzICc7XG5cdFx0XHRjb25zdCB2dWxuQ29udGVudCA9ICdjb250ZW50IHdpdGggdnVsblxcbmFuZFxcbm5ld2xpbmVzJztcblx0XHRcdGNvbnN0IGFmdGVyID0gJ21vcmUgY29kZVxcbndpdGggbmV3bGluZSc7XG5cdFx0XHRjb25zdCBhbm5vdGF0ZWRSZXN1bHQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW1xuXHRcdFx0XHRjb250ZW50KGJlZm9yZSksXG5cdFx0XHRcdHsga2luZDogJ21hcmtkb3duVnVsbicsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyh2dWxuQ29udGVudCksIHZ1bG5lcmFiaWxpdGllczogW3sgdGl0bGU6ICd0aXRsZScsIGRlc2NyaXB0aW9uOiAndnVsbicgfV0gfSxcblx0XHRcdFx0Y29udGVudChhZnRlciksXG5cdFx0XHRcdHsga2luZDogJ21hcmtkb3duVnVsbicsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyh2dWxuQ29udGVudCksIHZ1bG5lcmFiaWxpdGllczogW3sgdGl0bGU6ICd0aXRsZScsIGRlc2NyaXB0aW9uOiAndnVsbicgfV0gfSxcblx0XHRcdF0pO1xuXHRcdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYW5ub3RhdGVkUmVzdWx0KTtcblxuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBhbm5vdGF0ZWRSZXN1bHRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0VnVsbmVyYWJpbGl0aWVzRnJvbVRleHQobWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXh0cmFjdFN1YkFnZW50SW52b2NhdGlvbklkRnJvbVRleHQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZXh0cmFjdHMgc3ViQWdlbnRJbnZvY2F0aW9uSWQgZnJvbSBjb2RlYmxvY2sgdXJpIHRhZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHN1YkFnZW50SWQgPSAndGVzdC1hZ2VudC0xMjMnO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHMnKTtcblx0XHRcdGNvbnN0IGNvZGVibG9ja1VyaVBhcnQ6IElDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0ID0ge1xuXHRcdFx0XHRraW5kOiAnY29kZWJsb2NrVXJpJyxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRpc0VkaXQ6IHRydWUsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiBzdWJBZ2VudElkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYW5ub3RhdGVkID0gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtjb250ZW50KCdjb2RlJyksIGNvZGVibG9ja1VyaVBhcnRdKTtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gYW5ub3RhdGVkWzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dChtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHN1YkFnZW50SWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBzdWJBZ2VudEludm9jYXRpb25JZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnRzJyk7XG5cdFx0XHRjb25zdCBjb2RlYmxvY2tVcmlQYXJ0OiBJQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCA9IHtcblx0XHRcdFx0a2luZDogJ2NvZGVibG9ja1VyaScsXG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0aXNFZGl0OiB0cnVlXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYW5ub3RhdGVkID0gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtjb250ZW50KCdjb2RlJyksIGNvZGVibG9ja1VyaVBhcnRdKTtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gYW5ub3RhdGVkWzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dChtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgdGV4dCB3aXRob3V0IGNvZGVibG9jayB1cmkgdGFnJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFN1YkFnZW50SW52b2NhdGlvbklkRnJvbVRleHQoJ3NvbWUgcmFuZG9tIHRleHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHNwZWNpYWwgY2hhcmFjdGVycyBpbiBzdWJBZ2VudEludm9jYXRpb25JZCB2aWEgVVJMIGVuY29kaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViQWdlbnRJZCA9ICdhZ2VudC13aXRoLXNwZWNpYWwmY2hhcnM9dmFsdWUnO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHMnKTtcblx0XHRcdGNvbnN0IGNvZGVibG9ja1VyaVBhcnQ6IElDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0ID0ge1xuXHRcdFx0XHRraW5kOiAnY29kZWJsb2NrVXJpJyxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRpc0VkaXQ6IHRydWUsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiBzdWJBZ2VudElkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYW5ub3RhdGVkID0gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtjb250ZW50KCdjb2RlJyksIGNvZGVibG9ja1VyaVBhcnRdKTtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gYW5ub3RhdGVkWzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dChtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHN1YkFnZW50SWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBtYWxmb3JtZWQgVVJMIGVuY29kaW5nIGdyYWNlZnVsbHknLCAoKSA9PiB7XG5cdFx0XHQvLyBNYW51YWxseSBjb25zdHJ1Y3QgYSBtYWxmb3JtZWQgdGFnIHdpdGggaW52YWxpZCBVUkwgZW5jb2Rpbmdcblx0XHRcdGNvbnN0IG1hbGZvcm1lZFRhZyA9ICc8dnNjb2RlX2NvZGVibG9ja191cmkgaXNFZGl0IHN1YkFnZW50SW52b2NhdGlvbklkPVwiJVpaXCI+ZmlsZTovLy90ZXN0LnRzPC92c2NvZGVfY29kZWJsb2NrX3VyaT4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFN1YkFnZW50SW52b2NhdGlvbklkRnJvbVRleHQobWFsZm9ybWVkVGFnKTtcblx0XHRcdC8vIFNob3VsZCByZXR1cm4gdGhlIHJhdyB2YWx1ZSB3aGVuIGRlY29kaW5nIGZhaWxzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnJVpaJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0Q29kZWJsb2NrVXJpc0Zyb21UZXh0IHdpdGggc3ViQWdlbnRJbnZvY2F0aW9uSWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZXh0cmFjdHMgc3ViQWdlbnRJbnZvY2F0aW9uSWQgZnJvbSBjb2RlYmxvY2sgdXJpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViQWdlbnRJZCA9ICd0ZXN0LXN1YmFnZW50LTQ1Nic7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vZXhhbXBsZS50cycpO1xuXHRcdFx0Y29uc3QgY29kZWJsb2NrVXJpUGFydDogSUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdjb2RlYmxvY2tVcmknLFxuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGlzRWRpdDogdHJ1ZSxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN1YkFnZW50SWRcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhbm5vdGF0ZWQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW2NvbnRlbnQoJ2NvZGUnKSwgY29kZWJsb2NrVXJpUGFydF0pO1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBhbm5vdGF0ZWRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RDb2RlYmxvY2tVcmlzRnJvbVRleHQobWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3ViQWdlbnRJbnZvY2F0aW9uSWQsIHN1YkFnZW50SWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC51cmkudG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pc0VkaXQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGludmFsaWQgVVJJIGNvbnRlbnQgaW5zaWRlIGNvZGVibG9jayB1cmkgdGFnJywgKCkgPT4ge1xuXHRcdFx0Ly8gV2hlbiBjb250ZW50IGNvbnRhaW5zIGJhY2t0aWNrcyBhbmQgYSBjb2xvbiwgVVJJLnBhcnNlIGV4dHJhY3RzXG5cdFx0XHQvLyB0aGUgdGV4dCBiZWZvcmUgdGhlIGNvbG9uIGFzIHRoZSBzY2hlbWUuIEJhY2t0aWNrcyBhcmUgaWxsZWdhbFxuXHRcdFx0Ly8gc2NoZW1lIGNoYXJhY3RlcnMsIGNhdXNpbmcgVVJJLnBhcnNlIHRvIHRocm93LlxuXHRcdFx0Y29uc3QgaW52YWxpZFRhZyA9ICc8dnNjb2RlX2NvZGVibG9ja191cmk+YGBgdHlwZXNjcmlwdFxcbmNvbnN0IHVyaTogc3RyaW5nXFxuYGBgPC92c2NvZGVfY29kZWJsb2NrX3VyaT4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dChpbnZhbGlkVGFnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb3VuZC10cmlwIGVuY29kaW5nL2RlY29kaW5nIHdpdGggc3BlY2lhbCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViQWdlbnRJZCA9ICdhZ2VudC93aXRoIHNwYWNlcyZzcGVjaWFsPWNoYXJzP21vcmUnO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvdG8vZmlsZS50cycpO1xuXHRcdFx0Y29uc3QgY29kZWJsb2NrVXJpUGFydDogSUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdjb2RlYmxvY2tVcmknLFxuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGlzRWRpdDogdHJ1ZSxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN1YkFnZW50SWRcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhbm5vdGF0ZWQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW2NvbnRlbnQoJ2NvZGUnKSwgY29kZWJsb2NrVXJpUGFydF0pO1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBhbm5vdGF0ZWRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cblx0XHRcdGNvbnN0IGV4dHJhY3RlZCA9IGV4dHJhY3RDb2RlYmxvY2tVcmlzRnJvbVRleHQobWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cmFjdGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0ZWQuc3ViQWdlbnRJbnZvY2F0aW9uSWQsIHN1YkFnZW50SWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNJbnNpZGVDb2RlQ29udGV4dCcsICgpID0+IHtcblx0XHR0ZXN0KCdub3QgaW5zaWRlIGNvZGUgZm9yIHBsYWluIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNJbnNpZGVDb2RlQ29udGV4dCgnaGVsbG8gd29ybGQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90IGluc2lkZSBjb2RlIGFmdGVyIGNsb3NlZCBpbmxpbmUgY29kZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0luc2lkZUNvZGVDb250ZXh0KCdydW4gYGNvZGVgIGFuZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNpZGUgdW5jbG9zZWQgc2luZ2xlIGJhY2t0aWNrJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzSW5zaWRlQ29kZUNvbnRleHQoJ3J1biBgbnB4IHRzeCAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNpZGUgdW5jbG9zZWQgZG91YmxlIGJhY2t0aWNrJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzSW5zaWRlQ29kZUNvbnRleHQoJ3J1biBgYG5weCB0c3ggJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90IGluc2lkZSBjb2RlIGFmdGVyIGNsb3NlZCBkb3VibGUgYmFja3RpY2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNJbnNpZGVDb2RlQ29udGV4dCgncnVuIGBgY29kZWBgIGFuZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNpZGUgZmVuY2VkIGNvZGUgYmxvY2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNJbnNpZGVDb2RlQ29udGV4dCgndGV4dFxcbmBgYGJhc2hcXG5ucHggdHN4ICcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vdCBpbnNpZGUgY2xvc2VkIGZlbmNlZCBjb2RlIGJsb2NrJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzSW5zaWRlQ29kZUNvbnRleHQoJ3RleHRcXG5gYGBiYXNoXFxuY29kZVxcbmBgYFxcbmFmdGVyJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2lkZSBmZW5jZWQgY29kZSBibG9jayB3aXRoIHRpbGRlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0luc2lkZUNvZGVDb250ZXh0KCd0ZXh0XFxufn5+XFxuY29kZScpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IHN0cmluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0luc2lkZUNvZGVDb250ZXh0KCcnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50IC0gaW5saW5lIHJlZmVyZW5jZXMgaW4gY29kZSBibG9ja3MnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaW5saW5lIHJlZmVyZW5jZSBpbnNpZGUgYmFja3RpY2sgY29kZSBzcGFuIHVzZXMgcGxhaW4gdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbXG5cdFx0XHRcdGNvbnRlbnQoJ1J1biBgbnB4IHRzeCAnKSxcblx0XHRcdFx0eyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaW5kZXgudHMnKSwgbmFtZTogJ2luZGV4LnRzJyB9LFxuXHRcdFx0XHRjb250ZW50KCcgZXZhbCAnKSxcblx0XHRcdFx0eyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vcHJpbWVyLmV2YWwuanNvbicpLCBuYW1lOiAncHJpbWVyLmV2YWwuanNvbicgfSxcblx0XHRcdFx0Y29udGVudCgnIC0tcmVwbyAuYCcpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IG1kID0gcmVzdWx0WzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kLmNvbnRlbnQudmFsdWUsICdSdW4gYG5weCB0c3ggaW5kZXgudHMgZXZhbCBwcmltZXIuZXZhbC5qc29uIC0tcmVwbyAuYCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kLmlubGluZVJlZmVyZW5jZXMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmxpbmUgcmVmZXJlbmNlIG91dHNpZGUgY29kZSBzcGFuIHVzZXMgY29udGVudCByZWYgbGluaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbXG5cdFx0XHRcdGNvbnRlbnQoJ1NlZSAnKSxcblx0XHRcdFx0eyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaW5kZXgudHMnKSwgbmFtZTogJ2luZGV4LnRzJyB9LFxuXHRcdFx0XHRjb250ZW50KCcgZm9yIGRldGFpbHMnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBtZCA9IHJlc3VsdFswXSBhcyBJQ2hhdE1hcmtkb3duQ29udGVudDtcblx0XHRcdGFzc2VydC5vayhtZC5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCdbaW5kZXgudHNdJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1kLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ192c2NvZGVjb250ZW50cmVmXycpKTtcblx0XHRcdGFzc2VydC5vayhtZC5pbmxpbmVSZWZlcmVuY2VzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lubGluZSByZWZlcmVuY2UgaW5zaWRlIGZlbmNlZCBjb2RlIGJsb2NrIHVzZXMgcGxhaW4gdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbXG5cdFx0XHRcdGNvbnRlbnQoJ0V4YW1wbGU6XFxuYGBgYmFzaFxcbm5weCB0c3ggJyksXG5cdFx0XHRcdHsga2luZDogJ2lubGluZVJlZmVyZW5jZScsIGlubGluZVJlZmVyZW5jZTogVVJJLnBhcnNlKCdmaWxlOi8vL2luZGV4LnRzJyksIG5hbWU6ICdpbmRleC50cycgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBtZCA9IHJlc3VsdFswXSBhcyBJQ2hhdE1hcmtkb3duQ29udGVudDtcblx0XHRcdGFzc2VydC5vayghbWQuY29udGVudC52YWx1ZS5pbmNsdWRlcygnX3ZzY29kZWNvbnRlbnRyZWZfJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1kLmNvbnRlbnQudmFsdWUuZW5kc1dpdGgoJ2luZGV4LnRzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5saW5lIHJlZmVyZW5jZSBhdCBzdGFydCBvZiBibG9jayBtZXJnZXMgd2l0aCBmb2xsb3dpbmcgbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW1xuXHRcdFx0XHR7IGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLCBpbmxpbmVSZWZlcmVuY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9pbmRleC50cycpLCBuYW1lOiAnaW5kZXgudHMnIH0sXG5cdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnIGlzIHRoZSBlbnRyeSBwb2ludCcsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IG1kID0gcmVzdWx0WzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXHRcdFx0YXNzZXJ0Lm9rKG1kLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ1tpbmRleC50c10nKSk7XG5cdFx0XHRhc3NlcnQub2sobWQuY29udGVudC52YWx1ZS5pbmNsdWRlcygnX3ZzY29kZWNvbnRlbnRyZWZfJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1kLmNvbnRlbnQudmFsdWUuZW5kc1dpdGgoJyBpcyB0aGUgZW50cnkgcG9pbnQnKSk7XG5cdFx0XHRhc3NlcnQub2sobWQuaW5saW5lUmVmZXJlbmNlcyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWQuY29udGVudC5pc1RydXN0ZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kLmNvbnRlbnQuc3VwcG9ydFRoZW1lSWNvbnMsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5saW5lIHJlZmVyZW5jZSBhZnRlciByZWd1bGFyIHRleHQgZG9lcyBub3QgZm9yY2UtbWVyZ2UgaW5jb21wYXRpYmxlIG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtcblx0XHRcdFx0Y29udGVudCgnU2VlICcpLFxuXHRcdFx0XHR7IGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLCBpbmxpbmVSZWZlcmVuY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9pbmRleC50cycpLCBuYW1lOiAnaW5kZXgudHMnIH0sXG5cdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnIG1vcmUgaW5mbycsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIFRoZSBmaXJzdCBpdGVtIGhhcyBcIlNlZSBbaW5kZXgudHNdKC4uLilcIiB3aXRoIGRlZmF1bHQgbWFya2Rvd24gcHJvcGVydGllcyxcblx0XHRcdC8vIHRoZSBzZWNvbmQgaXRlbSBoYXMgZGlmZmVyZW50IHByb3BlcnRpZXMgLSB0aGV5IG11c3Qgc3RheSBzZXBhcmF0ZS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gcmVzdWx0WzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXHRcdFx0YXNzZXJ0Lm9rKGZpcnN0LmNvbnRlbnQudmFsdWUuc3RhcnRzV2l0aCgnU2VlICcpKTtcblx0XHRcdGFzc2VydC5vayhmaXJzdC5pbmxpbmVSZWZlcmVuY2VzKTtcblx0XHRcdGNvbnN0IHNlY29uZCA9IHJlc3VsdFsxXSBhcyBJQ2hhdE1hcmtkb3duQ29udGVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuY29udGVudC52YWx1ZSwgJyBtb3JlIGluZm8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuY29udGVudC5pc1RydXN0ZWQsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaGFzRWRpdENvZGVibG9ja1VyaVRhZycsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIGVkaXQgY29kZWJsb2NrIFVSSSB0YWdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdFRhZyA9ICc8dnNjb2RlX2NvZGVibG9ja191cmkgaXNFZGl0PmZpbGU6Ly8vdGVzdC50czwvdnNjb2RlX2NvZGVibG9ja191cmk+Jztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNFZGl0Q29kZWJsb2NrVXJpVGFnKGVkaXRUYWcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIG5vbi1lZGl0IGNvZGVibG9jayBVUkkgdGFncycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vbkVkaXRUYWcgPSAnPHZzY29kZV9jb2RlYmxvY2tfdXJpPmZpbGU6Ly8vdGVzdC50czwvdnNjb2RlX2NvZGVibG9ja191cmk+Jztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNFZGl0Q29kZWJsb2NrVXJpVGFnKG5vbkVkaXRUYWcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIGVkaXQgY29kZWJsb2NrIFVSSSB0YWdzIHdpdGggc3ViQWdlbnRJbnZvY2F0aW9uSWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0VGFnV2l0aFN1YkFnZW50ID0gJzx2c2NvZGVfY29kZWJsb2NrX3VyaSBpc0VkaXQgc3ViQWdlbnRJbnZvY2F0aW9uSWQ9XCJhZ2VudC0xMjNcIj5maWxlOi8vL3Rlc3QudHM8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPic7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRWRpdENvZGVibG9ja1VyaVRhZyhlZGl0VGFnV2l0aFN1YkFnZW50KSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIGZvciBub24tZWRpdCBjb2RlYmxvY2sgVVJJIHRhZ3Mgd2l0aCBzdWJBZ2VudEludm9jYXRpb25JZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vbkVkaXRUYWdXaXRoU3ViQWdlbnQgPSAnPHZzY29kZV9jb2RlYmxvY2tfdXJpIHN1YkFnZW50SW52b2NhdGlvbklkPVwiYWdlbnQtMTIzXCI+ZmlsZTovLy90ZXN0LnRzPC92c2NvZGVfY29kZWJsb2NrX3VyaT4nO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0VkaXRDb2RlYmxvY2tVcmlUYWcobm9uRWRpdFRhZ1dpdGhTdWJBZ2VudCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIHRleHQgd2l0aG91dCBjb2RlYmxvY2sgVVJJIHRhZ3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRWRpdENvZGVibG9ja1VyaVRhZygnc29tZSBwbGFpbiB0ZXh0JyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIHRleHQgd2l0aCBvbmx5IHBhcnRpYWwgdGFnIHByZWZpeCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNFZGl0Q29kZWJsb2NrVXJpVGFnKCc8dnNjb2RlX2NvZGVibG9jJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgdGV4dCBjb250YWluaW5nIG11bHRpcGxlIGVkaXQgY29kZWJsb2NrIFVSSSB0YWdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXVsdGlwbGVFZGl0VGFncyA9ICdzb21lIHRleHQgPHZzY29kZV9jb2RlYmxvY2tfdXJpIGlzRWRpdD5maWxlOi8vL3Rlc3QudHM8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPiBtb3JlIDx2c2NvZGVfY29kZWJsb2NrX3VyaSBpc0VkaXQ+ZmlsZTovLy9vdGhlci50czwvdnNjb2RlX2NvZGVibG9ja191cmk+Jztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNFZGl0Q29kZWJsb2NrVXJpVGFnKG11bHRpcGxlRWRpdFRhZ3MpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIHRleHQgY29udGFpbmluZyBvbmx5IG5vbi1lZGl0IGNvZGVibG9jayBVUkkgdGFncycsICgpID0+IHtcblx0XHRcdGNvbnN0IG11bHRpcGxlTm9uRWRpdFRhZ3MgPSAnc29tZSB0ZXh0IDx2c2NvZGVfY29kZWJsb2NrX3VyaT5maWxlOi8vL3Rlc3QudHM8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPiBtb3JlIDx2c2NvZGVfY29kZWJsb2NrX3VyaT5maWxlOi8vL290aGVyLnRzPC92c2NvZGVfY29kZWJsb2NrX3VyaT4nO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0VkaXRDb2RlYmxvY2tVcmlUYWcobXVsdGlwbGVOb25FZGl0VGFncyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdDQUFnQyw4QkFBOEIscUNBQXFDLGdDQUFnQyx3QkFBd0IsMkJBQTJCO0FBRS9MLFNBQVMsUUFBUSxLQUFtQztBQUNuRCxTQUFPLEVBQUUsTUFBTSxtQkFBbUIsU0FBUyxJQUFJLGVBQWUsR0FBRyxFQUFFO0FBQ3BFO0FBRUEsTUFBTSxlQUFlLFdBQVk7QUFDaEMsMENBQXdDO0FBRXhDLE9BQUssb0NBQW9DLE1BQU07QUFDOUMsV0FBTztBQUFBLE1BQ04sK0JBQStCO0FBQUEsUUFDOUIsRUFBRSxNQUFNLGlCQUFpQixJQUFJLGlCQUFpQixPQUFPLG1DQUFtQztBQUFBLFFBQ3hGLFFBQVEsa0JBQWtCO0FBQUEsTUFDM0IsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxRQUFRLGtCQUFrQixDQUFDO0FBQUEsSUFDN0I7QUFBQSxFQUNELENBQUM7QUFFRCxRQUFNLGtDQUFrQyxNQUFNO0FBQzdDLFNBQUssZUFBZSxZQUFZO0FBQy9CLFlBQU0sU0FBUztBQUNmLFlBQU0sY0FBYztBQUNwQixZQUFNLFFBQVE7QUFDZCxZQUFNLGtCQUFrQiwrQkFBK0IsQ0FBQyxRQUFRLE1BQU0sR0FBRyxFQUFFLE1BQU0sZ0JBQWdCLFNBQVMsSUFBSSxlQUFlLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxFQUFFLE9BQU8sU0FBUyxhQUFhLE9BQU8sQ0FBQyxFQUFFLEdBQUcsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUN4TixZQUFNLGVBQWUsZUFBZTtBQUVwQyxZQUFNLFdBQVcsZ0JBQWdCLENBQUM7QUFDbEMsWUFBTSxTQUFTLCtCQUErQixTQUFTLFFBQVEsS0FBSztBQUNwRSxZQUFNLGVBQWUsTUFBTTtBQUFBLElBQzVCLENBQUM7QUFFRCxTQUFLLGFBQWEsWUFBWTtBQUM3QixZQUFNLFNBQVM7QUFDZixZQUFNLGNBQWM7QUFDcEIsWUFBTSxRQUFRO0FBQ2QsWUFBTSxrQkFBa0IsK0JBQStCLENBQUMsUUFBUSxNQUFNLEdBQUcsRUFBRSxNQUFNLGdCQUFnQixTQUFTLElBQUksZUFBZSxXQUFXLEdBQUcsaUJBQWlCLENBQUMsRUFBRSxPQUFPLFNBQVMsYUFBYSxPQUFPLENBQUMsRUFBRSxHQUFHLFFBQVEsS0FBSyxDQUFDLENBQUM7QUFDeE4sWUFBTSxlQUFlLGVBQWU7QUFFcEMsWUFBTSxXQUFXLGdCQUFnQixDQUFDO0FBQ2xDLFlBQU0sU0FBUywrQkFBK0IsU0FBUyxRQUFRLEtBQUs7QUFDcEUsWUFBTSxlQUFlLE1BQU07QUFBQSxJQUM1QixDQUFDO0FBRUQsU0FBSyxrQkFBa0IsWUFBWTtBQUNsQyxZQUFNLFNBQVM7QUFDZixZQUFNLGNBQWM7QUFDcEIsWUFBTSxRQUFRO0FBQ2QsWUFBTSxrQkFBa0IsK0JBQStCO0FBQUEsUUFDdEQsUUFBUSxNQUFNO0FBQUEsUUFDZCxFQUFFLE1BQU0sZ0JBQWdCLFNBQVMsSUFBSSxlQUFlLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxFQUFFLE9BQU8sU0FBUyxhQUFhLE9BQU8sQ0FBQyxFQUFFO0FBQUEsUUFDN0gsUUFBUSxLQUFLO0FBQUEsUUFDYixFQUFFLE1BQU0sZ0JBQWdCLFNBQVMsSUFBSSxlQUFlLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxFQUFFLE9BQU8sU0FBUyxhQUFhLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDOUgsQ0FBQztBQUNELFlBQU0sZUFBZSxlQUFlO0FBRXBDLFlBQU0sV0FBVyxnQkFBZ0IsQ0FBQztBQUNsQyxZQUFNLFNBQVMsK0JBQStCLFNBQVMsUUFBUSxLQUFLO0FBQ3BFLFlBQU0sZUFBZSxNQUFNO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sdUNBQXVDLE1BQU07QUFDbEQsU0FBSyx3REFBd0QsTUFBTTtBQUNsRSxZQUFNLGFBQWE7QUFDbkIsWUFBTSxNQUFNLElBQUksTUFBTSxpQkFBaUI7QUFDdkMsWUFBTSxtQkFBa0Q7QUFBQSxRQUN2RCxNQUFNO0FBQUEsUUFDTjtBQUFBLFFBQ0EsUUFBUTtBQUFBLFFBQ1Isc0JBQXNCO0FBQUEsTUFDdkI7QUFDQSxZQUFNLFlBQVksK0JBQStCLENBQUMsUUFBUSxNQUFNLEdBQUcsZ0JBQWdCLENBQUM7QUFDcEYsWUFBTSxXQUFXLFVBQVUsQ0FBQztBQUU1QixZQUFNLFNBQVMsb0NBQW9DLFNBQVMsUUFBUSxLQUFLO0FBQ3pFLGFBQU8sWUFBWSxRQUFRLFVBQVU7QUFBQSxJQUN0QyxDQUFDO0FBRUQsU0FBSyxrREFBa0QsTUFBTTtBQUM1RCxZQUFNLE1BQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUN2QyxZQUFNLG1CQUFrRDtBQUFBLFFBQ3ZELE1BQU07QUFBQSxRQUNOO0FBQUEsUUFDQSxRQUFRO0FBQUEsTUFDVDtBQUNBLFlBQU0sWUFBWSwrQkFBK0IsQ0FBQyxRQUFRLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQztBQUNwRixZQUFNLFdBQVcsVUFBVSxDQUFDO0FBRTVCLFlBQU0sU0FBUyxvQ0FBb0MsU0FBUyxRQUFRLEtBQUs7QUFDekUsYUFBTyxZQUFZLFFBQVEsTUFBUztBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLFlBQU0sU0FBUyxvQ0FBb0Msa0JBQWtCO0FBQ3JFLGFBQU8sWUFBWSxRQUFRLE1BQVM7QUFBQSxJQUNyQyxDQUFDO0FBRUQsU0FBSyx1RUFBdUUsTUFBTTtBQUNqRixZQUFNLGFBQWE7QUFDbkIsWUFBTSxNQUFNLElBQUksTUFBTSxpQkFBaUI7QUFDdkMsWUFBTSxtQkFBa0Q7QUFBQSxRQUN2RCxNQUFNO0FBQUEsUUFDTjtBQUFBLFFBQ0EsUUFBUTtBQUFBLFFBQ1Isc0JBQXNCO0FBQUEsTUFDdkI7QUFDQSxZQUFNLFlBQVksK0JBQStCLENBQUMsUUFBUSxNQUFNLEdBQUcsZ0JBQWdCLENBQUM7QUFDcEYsWUFBTSxXQUFXLFVBQVUsQ0FBQztBQUU1QixZQUFNLFNBQVMsb0NBQW9DLFNBQVMsUUFBUSxLQUFLO0FBQ3pFLGFBQU8sWUFBWSxRQUFRLFVBQVU7QUFBQSxJQUN0QyxDQUFDO0FBRUQsU0FBSyw2Q0FBNkMsTUFBTTtBQUV2RCxZQUFNLGVBQWU7QUFDckIsWUFBTSxTQUFTLG9DQUFvQyxZQUFZO0FBRS9ELGFBQU8sWUFBWSxRQUFRLEtBQUs7QUFBQSxJQUNqQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwwREFBMEQsTUFBTTtBQUNyRSxTQUFLLG9EQUFvRCxNQUFNO0FBQzlELFlBQU0sYUFBYTtBQUNuQixZQUFNLE1BQU0sSUFBSSxNQUFNLG9CQUFvQjtBQUMxQyxZQUFNLG1CQUFrRDtBQUFBLFFBQ3ZELE1BQU07QUFBQSxRQUNOO0FBQUEsUUFDQSxRQUFRO0FBQUEsUUFDUixzQkFBc0I7QUFBQSxNQUN2QjtBQUNBLFlBQU0sWUFBWSwrQkFBK0IsQ0FBQyxRQUFRLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQztBQUNwRixZQUFNLFdBQVcsVUFBVSxDQUFDO0FBRTVCLFlBQU0sU0FBUyw2QkFBNkIsU0FBUyxRQUFRLEtBQUs7QUFDbEUsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQU8sc0JBQXNCLFVBQVU7QUFDMUQsYUFBTyxZQUFZLE9BQU8sSUFBSSxTQUFTLEdBQUcsSUFBSSxTQUFTLENBQUM7QUFDeEQsYUFBTyxZQUFZLE9BQU8sUUFBUSxJQUFJO0FBQUEsSUFDdkMsQ0FBQztBQUVELFNBQUssc0VBQXNFLE1BQU07QUFJaEYsWUFBTSxhQUFhO0FBQ25CLFlBQU0sU0FBUyw2QkFBNkIsVUFBVTtBQUN0RCxhQUFPLFlBQVksUUFBUSxNQUFTO0FBQUEsSUFDckMsQ0FBQztBQUVELFNBQUssd0RBQXdELE1BQU07QUFDbEUsWUFBTSxhQUFhO0FBQ25CLFlBQU0sTUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQy9DLFlBQU0sbUJBQWtEO0FBQUEsUUFDdkQsTUFBTTtBQUFBLFFBQ047QUFBQSxRQUNBLFFBQVE7QUFBQSxRQUNSLHNCQUFzQjtBQUFBLE1BQ3ZCO0FBQ0EsWUFBTSxZQUFZLCtCQUErQixDQUFDLFFBQVEsTUFBTSxHQUFHLGdCQUFnQixDQUFDO0FBQ3BGLFlBQU0sV0FBVyxVQUFVLENBQUM7QUFFNUIsWUFBTSxZQUFZLDZCQUE2QixTQUFTLFFBQVEsS0FBSztBQUNyRSxhQUFPLEdBQUcsU0FBUztBQUNuQixhQUFPLFlBQVksVUFBVSxzQkFBc0IsVUFBVTtBQUFBLElBQzlELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHVCQUF1QixNQUFNO0FBQ2xDLFNBQUssa0NBQWtDLE1BQU07QUFDNUMsYUFBTyxZQUFZLG9CQUFvQixhQUFhLEdBQUcsS0FBSztBQUFBLElBQzdELENBQUM7QUFFRCxTQUFLLDRDQUE0QyxNQUFNO0FBQ3RELGFBQU8sWUFBWSxvQkFBb0IsZ0JBQWdCLEdBQUcsS0FBSztBQUFBLElBQ2hFLENBQUM7QUFFRCxTQUFLLG1DQUFtQyxNQUFNO0FBQzdDLGFBQU8sWUFBWSxvQkFBb0IsZUFBZSxHQUFHLElBQUk7QUFBQSxJQUM5RCxDQUFDO0FBRUQsU0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxhQUFPLFlBQVksb0JBQW9CLGdCQUFnQixHQUFHLElBQUk7QUFBQSxJQUMvRCxDQUFDO0FBRUQsU0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxhQUFPLFlBQVksb0JBQW9CLGtCQUFrQixHQUFHLEtBQUs7QUFBQSxJQUNsRSxDQUFDO0FBRUQsU0FBSyw0QkFBNEIsTUFBTTtBQUN0QyxhQUFPLFlBQVksb0JBQW9CLHlCQUF5QixHQUFHLElBQUk7QUFBQSxJQUN4RSxDQUFDO0FBRUQsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxhQUFPLFlBQVksb0JBQW9CLGlDQUFpQyxHQUFHLEtBQUs7QUFBQSxJQUNqRixDQUFDO0FBRUQsU0FBSyx3Q0FBd0MsTUFBTTtBQUNsRCxhQUFPLFlBQVksb0JBQW9CLGlCQUFpQixHQUFHLElBQUk7QUFBQSxJQUNoRSxDQUFDO0FBRUQsU0FBSyxnQkFBZ0IsTUFBTTtBQUMxQixhQUFPLFlBQVksb0JBQW9CLEVBQUUsR0FBRyxLQUFLO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0scUVBQXFFLE1BQU07QUFDaEYsU0FBSyw4REFBOEQsTUFBTTtBQUN4RSxZQUFNLFNBQVMsK0JBQStCO0FBQUEsUUFDN0MsUUFBUSxlQUFlO0FBQUEsUUFDdkIsRUFBRSxNQUFNLG1CQUFtQixpQkFBaUIsSUFBSSxNQUFNLGtCQUFrQixHQUFHLE1BQU0sV0FBVztBQUFBLFFBQzVGLFFBQVEsUUFBUTtBQUFBLFFBQ2hCLEVBQUUsTUFBTSxtQkFBbUIsaUJBQWlCLElBQUksTUFBTSwwQkFBMEIsR0FBRyxNQUFNLG1CQUFtQjtBQUFBLFFBQzVHLFFBQVEsWUFBWTtBQUFBLE1BQ3JCLENBQUM7QUFFRCxhQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsWUFBTSxLQUFLLE9BQU8sQ0FBQztBQUNuQixhQUFPLFlBQVksR0FBRyxRQUFRLE9BQU8sdURBQXVEO0FBQzVGLGFBQU8sWUFBWSxHQUFHLGtCQUFrQixNQUFTO0FBQUEsSUFDbEQsQ0FBQztBQUVELFNBQUssNERBQTRELE1BQU07QUFDdEUsWUFBTSxTQUFTLCtCQUErQjtBQUFBLFFBQzdDLFFBQVEsTUFBTTtBQUFBLFFBQ2QsRUFBRSxNQUFNLG1CQUFtQixpQkFBaUIsSUFBSSxNQUFNLGtCQUFrQixHQUFHLE1BQU0sV0FBVztBQUFBLFFBQzVGLFFBQVEsY0FBYztBQUFBLE1BQ3ZCLENBQUM7QUFFRCxhQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsWUFBTSxLQUFLLE9BQU8sQ0FBQztBQUNuQixhQUFPLEdBQUcsR0FBRyxRQUFRLE1BQU0sU0FBUyxZQUFZLENBQUM7QUFDakQsYUFBTyxHQUFHLEdBQUcsUUFBUSxNQUFNLFNBQVMsb0JBQW9CLENBQUM7QUFDekQsYUFBTyxHQUFHLEdBQUcsZ0JBQWdCO0FBQUEsSUFDOUIsQ0FBQztBQUVELFNBQUssNkRBQTZELE1BQU07QUFDdkUsWUFBTSxTQUFTLCtCQUErQjtBQUFBLFFBQzdDLFFBQVEsNkJBQTZCO0FBQUEsUUFDckMsRUFBRSxNQUFNLG1CQUFtQixpQkFBaUIsSUFBSSxNQUFNLGtCQUFrQixHQUFHLE1BQU0sV0FBVztBQUFBLE1BQzdGLENBQUM7QUFFRCxhQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsWUFBTSxLQUFLLE9BQU8sQ0FBQztBQUNuQixhQUFPLEdBQUcsQ0FBQyxHQUFHLFFBQVEsTUFBTSxTQUFTLG9CQUFvQixDQUFDO0FBQzFELGFBQU8sR0FBRyxHQUFHLFFBQVEsTUFBTSxTQUFTLFVBQVUsQ0FBQztBQUFBLElBQ2hELENBQUM7QUFFRCxTQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFlBQU0sU0FBUywrQkFBK0I7QUFBQSxRQUM3QyxFQUFFLE1BQU0sbUJBQW1CLGlCQUFpQixJQUFJLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxXQUFXO0FBQUEsUUFDNUYsRUFBRSxNQUFNLG1CQUFtQixTQUFTLElBQUksZUFBZSx1QkFBdUIsRUFBRSxXQUFXLE1BQU0sbUJBQW1CLEtBQUssQ0FBQyxFQUFFO0FBQUEsTUFDN0gsQ0FBQztBQUVELGFBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxZQUFNLEtBQUssT0FBTyxDQUFDO0FBQ25CLGFBQU8sR0FBRyxHQUFHLFFBQVEsTUFBTSxTQUFTLFlBQVksQ0FBQztBQUNqRCxhQUFPLEdBQUcsR0FBRyxRQUFRLE1BQU0sU0FBUyxvQkFBb0IsQ0FBQztBQUN6RCxhQUFPLEdBQUcsR0FBRyxRQUFRLE1BQU0sU0FBUyxxQkFBcUIsQ0FBQztBQUMxRCxhQUFPLEdBQUcsR0FBRyxnQkFBZ0I7QUFDN0IsYUFBTyxZQUFZLEdBQUcsUUFBUSxXQUFXLElBQUk7QUFDN0MsYUFBTyxZQUFZLEdBQUcsUUFBUSxtQkFBbUIsSUFBSTtBQUFBLElBQ3RELENBQUM7QUFFRCxTQUFLLGtGQUFrRixNQUFNO0FBQzVGLFlBQU0sU0FBUywrQkFBK0I7QUFBQSxRQUM3QyxRQUFRLE1BQU07QUFBQSxRQUNkLEVBQUUsTUFBTSxtQkFBbUIsaUJBQWlCLElBQUksTUFBTSxrQkFBa0IsR0FBRyxNQUFNLFdBQVc7QUFBQSxRQUM1RixFQUFFLE1BQU0sbUJBQW1CLFNBQVMsSUFBSSxlQUFlLGNBQWMsRUFBRSxXQUFXLE1BQU0sbUJBQW1CLEtBQUssQ0FBQyxFQUFFO0FBQUEsTUFDcEgsQ0FBQztBQUlELGFBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxZQUFNLFFBQVEsT0FBTyxDQUFDO0FBQ3RCLGFBQU8sR0FBRyxNQUFNLFFBQVEsTUFBTSxXQUFXLE1BQU0sQ0FBQztBQUNoRCxhQUFPLEdBQUcsTUFBTSxnQkFBZ0I7QUFDaEMsWUFBTSxTQUFTLE9BQU8sQ0FBQztBQUN2QixhQUFPLFlBQVksT0FBTyxRQUFRLE9BQU8sWUFBWTtBQUNyRCxhQUFPLFlBQVksT0FBTyxRQUFRLFdBQVcsSUFBSTtBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDBCQUEwQixNQUFNO0FBQ3JDLFNBQUssNENBQTRDLE1BQU07QUFDdEQsWUFBTSxVQUFVO0FBQ2hCLGFBQU8sWUFBWSx1QkFBdUIsT0FBTyxHQUFHLElBQUk7QUFBQSxJQUN6RCxDQUFDO0FBRUQsU0FBSyxpREFBaUQsTUFBTTtBQUMzRCxZQUFNLGFBQWE7QUFDbkIsYUFBTyxZQUFZLHVCQUF1QixVQUFVLEdBQUcsS0FBSztBQUFBLElBQzdELENBQUM7QUFFRCxTQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFlBQU0sc0JBQXNCO0FBQzVCLGFBQU8sWUFBWSx1QkFBdUIsbUJBQW1CLEdBQUcsSUFBSTtBQUFBLElBQ3JFLENBQUM7QUFFRCxTQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLFlBQU0seUJBQXlCO0FBQy9CLGFBQU8sWUFBWSx1QkFBdUIsc0JBQXNCLEdBQUcsS0FBSztBQUFBLElBQ3pFLENBQUM7QUFFRCxTQUFLLHFEQUFxRCxNQUFNO0FBQy9ELGFBQU8sWUFBWSx1QkFBdUIsaUJBQWlCLEdBQUcsS0FBSztBQUFBLElBQ3BFLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLGFBQU8sWUFBWSx1QkFBdUIsa0JBQWtCLEdBQUcsS0FBSztBQUFBLElBQ3JFLENBQUM7QUFFRCxTQUFLLHFFQUFxRSxNQUFNO0FBQy9FLFlBQU0sbUJBQW1CO0FBQ3pCLGFBQU8sWUFBWSx1QkFBdUIsZ0JBQWdCLEdBQUcsSUFBSTtBQUFBLElBQ2xFLENBQUM7QUFFRCxTQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFlBQU0sc0JBQXNCO0FBQzVCLGFBQU8sWUFBWSx1QkFBdUIsbUJBQW1CLEdBQUcsS0FBSztBQUFBLElBQ3RFLENBQUM7QUFBQSxFQUVGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
