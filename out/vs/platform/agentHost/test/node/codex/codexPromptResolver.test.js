import assert from "assert";
import * as fs from "fs";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MessageAttachmentKind } from "../../../common/state/sessionState.js";
import { resolveCodexInput } from "../../../node/codex/codexPromptResolver.js";
suite("codexPromptResolver", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("plain prompt becomes a single text input", () => {
    const { input, cleanupPaths } = resolveCodexInput("hello world", void 0);
    assert.strictEqual(input.length, 1);
    assert.strictEqual(input[0].type, "text");
    assert.strictEqual(input[0].text, "hello world");
    assert.strictEqual(cleanupPaths.length, 0);
  });
  test("Resource (file:) attachment becomes @<path> mention", () => {
    const uri = URI.file("/tmp/foo.txt");
    const att = {
      type: MessageAttachmentKind.Resource,
      label: "foo.txt",
      uri: uri.toString()
    };
    const { input } = resolveCodexInput("look at this", [att]);
    assert.strictEqual(input.length, 1);
    const text = input[0].text;
    assert.ok(text.includes(`@${uri.fsPath}`), `text: ${text}`);
    assert.ok(text.includes("look at this"));
  });
  test("Simple attachment with modelRepresentation is appended", () => {
    const att = {
      type: MessageAttachmentKind.Simple,
      label: "meta",
      modelRepresentation: "extra context"
    };
    const { input } = resolveCodexInput("top", [att]);
    const text = input[0].text;
    assert.ok(text.includes("top"));
    assert.ok(text.includes("extra context"));
  });
  test("EmbeddedResource image becomes localImage and tracks cleanup", () => {
    const att = {
      type: MessageAttachmentKind.EmbeddedResource,
      label: "pic",
      data: Buffer.from("fake-png-bytes").toString("base64"),
      contentType: "image/png"
    };
    const { input, cleanupPaths } = resolveCodexInput("see image", [att]);
    assert.strictEqual(cleanupPaths.length, 1);
    const imageItem = input.find((i) => i.type === "localImage");
    assert.ok(imageItem, "expected localImage item");
    assert.ok(imageItem.path.endsWith(".png"));
    try {
      fs.unlinkSync(cleanupPaths[0]);
    } catch {
    }
  });
  test("non-image EmbeddedResource is dropped silently", () => {
    const att = {
      type: MessageAttachmentKind.EmbeddedResource,
      label: "pdf",
      data: "ZmFrZQ==",
      contentType: "application/pdf"
    };
    const { input, cleanupPaths } = resolveCodexInput("", [att]);
    assert.strictEqual(cleanupPaths.length, 0);
    assert.strictEqual(input.length, 1);
    assert.strictEqual(input[0].type, "text");
  });
  test("textual EmbeddedResource (unsaved document) is inlined with label", () => {
    const body = 'console.log("draft")';
    const att = {
      type: MessageAttachmentKind.EmbeddedResource,
      label: "Untitled-1",
      displayKind: "document",
      data: Buffer.from(body).toString("base64"),
      contentType: "text/plain"
    };
    const { input, cleanupPaths } = resolveCodexInput("review this", [att]);
    assert.strictEqual(cleanupPaths.length, 0);
    assert.strictEqual(input.length, 1);
    const text = input[0].text;
    assert.ok(text.includes("review this"), `text: ${text}`);
    assert.ok(text.includes("Untitled-1"), `text: ${text}`);
    assert.ok(text.includes(body), `text: ${text}`);
  });
  test("textual EmbeddedResource selection annotates a one-based line range", () => {
    const body = "second line\nthird line";
    const att = {
      type: MessageAttachmentKind.EmbeddedResource,
      label: "foo.ts",
      displayKind: "selection",
      data: Buffer.from(body).toString("base64"),
      contentType: "text/plain",
      selection: { range: { start: { line: 1, character: 0 }, end: { line: 2, character: 9 } } }
    };
    const { input } = resolveCodexInput("explain", [att]);
    const text = input[0].text;
    assert.ok(text.includes("foo.ts (lines 2-3)"), `text: ${text}`);
    assert.ok(text.includes(body), `text: ${text}`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhQcm9tcHRSZXNvbHZlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlQ29kZXhJbnB1dCB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhQcm9tcHRSZXNvbHZlci5qcyc7XG5cbnN1aXRlKCdjb2RleFByb21wdFJlc29sdmVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3BsYWluIHByb21wdCBiZWNvbWVzIGEgc2luZ2xlIHRleHQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnB1dCwgY2xlYW51cFBhdGhzIH0gPSByZXNvbHZlQ29kZXhJbnB1dCgnaGVsbG8gd29ybGQnLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFswXS50eXBlLCAndGV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoaW5wdXRbMF0gYXMgeyB0ZXh0OiBzdHJpbmcgfSkudGV4dCwgJ2hlbGxvIHdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFudXBQYXRocy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvdXJjZSAoZmlsZTopIGF0dGFjaG1lbnQgYmVjb21lcyBAPHBhdGg+IG1lbnRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy90bXAvZm9vLnR4dCcpO1xuXHRcdGNvbnN0IGF0dDogTWVzc2FnZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogJ2Zvby50eHQnLFxuXHRcdFx0dXJpOiB1cmkudG9TdHJpbmcoKSxcblx0XHR9IGFzIE1lc3NhZ2VBdHRhY2htZW50O1xuXHRcdGNvbnN0IHsgaW5wdXQgfSA9IHJlc29sdmVDb2RleElucHV0KCdsb29rIGF0IHRoaXMnLCBbYXR0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0Lmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgdGV4dCA9IChpbnB1dFswXSBhcyB7IHRleHQ6IHN0cmluZyB9KS50ZXh0O1xuXHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKGBAJHt1cmkuZnNQYXRofWApLCBgdGV4dDogJHt0ZXh0fWApO1xuXHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdsb29rIGF0IHRoaXMnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NpbXBsZSBhdHRhY2htZW50IHdpdGggbW9kZWxSZXByZXNlbnRhdGlvbiBpcyBhcHBlbmRlZCcsICgpID0+IHtcblx0XHRjb25zdCBhdHQ6IE1lc3NhZ2VBdHRhY2htZW50ID0ge1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdGxhYmVsOiAnbWV0YScsXG5cdFx0XHRtb2RlbFJlcHJlc2VudGF0aW9uOiAnZXh0cmEgY29udGV4dCcsXG5cdFx0fSBhcyBNZXNzYWdlQXR0YWNobWVudDtcblx0XHRjb25zdCB7IGlucHV0IH0gPSByZXNvbHZlQ29kZXhJbnB1dCgndG9wJywgW2F0dF0pO1xuXHRcdGNvbnN0IHRleHQgPSAoaW5wdXRbMF0gYXMgeyB0ZXh0OiBzdHJpbmcgfSkudGV4dDtcblx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygndG9wJykpO1xuXHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdleHRyYSBjb250ZXh0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdFbWJlZGRlZFJlc291cmNlIGltYWdlIGJlY29tZXMgbG9jYWxJbWFnZSBhbmQgdHJhY2tzIGNsZWFudXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0OiBNZXNzYWdlQXR0YWNobWVudCA9IHtcblx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5FbWJlZGRlZFJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICdwaWMnLFxuXHRcdFx0ZGF0YTogQnVmZmVyLmZyb20oJ2Zha2UtcG5nLWJ5dGVzJykudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuXHRcdFx0Y29udGVudFR5cGU6ICdpbWFnZS9wbmcnLFxuXHRcdH0gYXMgTWVzc2FnZUF0dGFjaG1lbnQ7XG5cdFx0Y29uc3QgeyBpbnB1dCwgY2xlYW51cFBhdGhzIH0gPSByZXNvbHZlQ29kZXhJbnB1dCgnc2VlIGltYWdlJywgW2F0dF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhbnVwUGF0aHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBpbWFnZUl0ZW0gPSBpbnB1dC5maW5kKGkgPT4gaS50eXBlID09PSAnbG9jYWxJbWFnZScpIGFzIHsgdHlwZTogJ2xvY2FsSW1hZ2UnOyBwYXRoOiBzdHJpbmcgfTtcblx0XHRhc3NlcnQub2soaW1hZ2VJdGVtLCAnZXhwZWN0ZWQgbG9jYWxJbWFnZSBpdGVtJyk7XG5cdFx0YXNzZXJ0Lm9rKGltYWdlSXRlbS5wYXRoLmVuZHNXaXRoKCcucG5nJykpO1xuXHRcdC8vIENsZWFudXAgc28gdGhlIHRlc3QgZG9lc24ndCBsZWFrIHRoZSB0bXAgZmlsZS5cblx0XHR0cnkgeyBmcy51bmxpbmtTeW5jKGNsZWFudXBQYXRoc1swXSk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHR9KTtcblxuXHR0ZXN0KCdub24taW1hZ2UgRW1iZWRkZWRSZXNvdXJjZSBpcyBkcm9wcGVkIHNpbGVudGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF0dDogTWVzc2FnZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAncGRmJyxcblx0XHRcdGRhdGE6ICdabUZyWlE9PScsXG5cdFx0XHRjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL3BkZicsXG5cdFx0fSBhcyBNZXNzYWdlQXR0YWNobWVudDtcblx0XHRjb25zdCB7IGlucHV0LCBjbGVhbnVwUGF0aHMgfSA9IHJlc29sdmVDb2RleElucHV0KCcnLCBbYXR0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFudXBQYXRocy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnB1dFswXS50eXBlLCAndGV4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXh0dWFsIEVtYmVkZGVkUmVzb3VyY2UgKHVuc2F2ZWQgZG9jdW1lbnQpIGlzIGlubGluZWQgd2l0aCBsYWJlbCcsICgpID0+IHtcblx0XHRjb25zdCBib2R5ID0gJ2NvbnNvbGUubG9nKFwiZHJhZnRcIiknO1xuXHRcdGNvbnN0IGF0dDogTWVzc2FnZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAnVW50aXRsZWQtMScsXG5cdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHRcdGRhdGE6IEJ1ZmZlci5mcm9tKGJvZHkpLnRvU3RyaW5nKCdiYXNlNjQnKSxcblx0XHRcdGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsXG5cdFx0fSBhcyBNZXNzYWdlQXR0YWNobWVudDtcblx0XHRjb25zdCB7IGlucHV0LCBjbGVhbnVwUGF0aHMgfSA9IHJlc29sdmVDb2RleElucHV0KCdyZXZpZXcgdGhpcycsIFthdHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW51cFBhdGhzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlucHV0Lmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgdGV4dCA9IChpbnB1dFswXSBhcyB7IHRleHQ6IHN0cmluZyB9KS50ZXh0O1xuXHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdyZXZpZXcgdGhpcycpLCBgdGV4dDogJHt0ZXh0fWApO1xuXHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdVbnRpdGxlZC0xJyksIGB0ZXh0OiAke3RleHR9YCk7XG5cdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoYm9keSksIGB0ZXh0OiAke3RleHR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RleHR1YWwgRW1iZWRkZWRSZXNvdXJjZSBzZWxlY3Rpb24gYW5ub3RhdGVzIGEgb25lLWJhc2VkIGxpbmUgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYm9keSA9ICdzZWNvbmQgbGluZVxcbnRoaXJkIGxpbmUnO1xuXHRcdGNvbnN0IGF0dDogTWVzc2FnZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAnZm9vLnRzJyxcblx0XHRcdGRpc3BsYXlLaW5kOiAnc2VsZWN0aW9uJyxcblx0XHRcdGRhdGE6IEJ1ZmZlci5mcm9tKGJvZHkpLnRvU3RyaW5nKCdiYXNlNjQnKSxcblx0XHRcdGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsXG5cdFx0XHRzZWxlY3Rpb246IHsgcmFuZ2U6IHsgc3RhcnQ6IHsgbGluZTogMSwgY2hhcmFjdGVyOiAwIH0sIGVuZDogeyBsaW5lOiAyLCBjaGFyYWN0ZXI6IDkgfSB9IH0sXG5cdFx0fSBhcyBNZXNzYWdlQXR0YWNobWVudDtcblx0XHRjb25zdCB7IGlucHV0IH0gPSByZXNvbHZlQ29kZXhJbnB1dCgnZXhwbGFpbicsIFthdHRdKTtcblx0XHRjb25zdCB0ZXh0ID0gKGlucHV0WzBdIGFzIHsgdGV4dDogc3RyaW5nIH0pLnRleHQ7XG5cdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ2Zvby50cyAobGluZXMgMi0zKScpLCBgdGV4dDogJHt0ZXh0fWApO1xuXHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKGJvZHkpLCBgdGV4dDogJHt0ZXh0fWApO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksUUFBUTtBQUNwQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBcUQ7QUFDOUQsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSx1QkFBdUIsTUFBTTtBQUVsQywwQ0FBd0M7QUFFeEMsT0FBSyw0Q0FB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
