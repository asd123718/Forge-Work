import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { extractAiChunks } from "../../../node/shared/editChunkExtractor.js";
suite("agentHost editChunkExtractor", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Write returns [content]", () => {
    const chunks = extractAiChunks("Write", { file_path: "/x.ts", content: "hello world\n" });
    assert.deepStrictEqual(chunks, ["hello world\n"]);
  });
  test("Edit returns [new_string]", () => {
    const chunks = extractAiChunks("Edit", { file_path: "/x.ts", old_string: "a", new_string: "b" });
    assert.deepStrictEqual(chunks, ["b"]);
  });
  test("MultiEdit returns one chunk per edit", () => {
    const chunks = extractAiChunks("MultiEdit", {
      file_path: "/x.ts",
      edits: [
        { old_string: "a", new_string: "1" },
        { old_string: "b", new_string: "2" },
        { old_string: "c", new_string: "3" }
      ]
    });
    assert.deepStrictEqual(chunks, ["1", "2", "3"]);
  });
  test("MultiEdit silently drops malformed entries", () => {
    const chunks = extractAiChunks("MultiEdit", {
      file_path: "/x.ts",
      edits: [
        { old_string: "a", new_string: "1" },
        { old_string: "b" },
        // missing new_string
        null,
        // not an object
        { old_string: "c", new_string: 42 },
        // wrong type
        { old_string: "d", new_string: "4" }
      ]
    });
    assert.deepStrictEqual(chunks, ["1", "4"]);
  });
  test("unknown tool returns []", () => {
    assert.deepStrictEqual(extractAiChunks("Bash", { command: "ls" }), []);
    assert.deepStrictEqual(extractAiChunks("NotebookEdit", { notebook_path: "/x.ipynb" }), []);
    assert.deepStrictEqual(extractAiChunks("mcp__foo__bar", { x: "y" }), []);
  });
  test("malformed input returns []", () => {
    assert.deepStrictEqual(extractAiChunks("Edit", null), []);
    assert.deepStrictEqual(extractAiChunks("Edit", void 0), []);
    assert.deepStrictEqual(extractAiChunks("Edit", "string"), []);
    assert.deepStrictEqual(extractAiChunks("Edit", 42), []);
    assert.deepStrictEqual(extractAiChunks("Edit", { file_path: "/x.ts" }), []);
    assert.deepStrictEqual(extractAiChunks("Edit", { new_string: 42 }), []);
    assert.deepStrictEqual(extractAiChunks("MultiEdit", { edits: "not an array" }), []);
    assert.deepStrictEqual(extractAiChunks("Write", { file_path: "/x.ts" }), []);
  });
  test("empty chunks are preserved (caller decides how to score)", () => {
    assert.deepStrictEqual(extractAiChunks("Edit", { old_string: "a", new_string: "" }), [""]);
  });
  suite("Copilot CLI tools", () => {
    test("create returns [file_text]", () => {
      const chunks = extractAiChunks("create", { path: "/x.ts", file_text: "hello world\n" });
      assert.deepStrictEqual(chunks, ["hello world\n"]);
    });
    test("edit / str_replace / insert return [new_str]", () => {
      assert.deepStrictEqual(
        extractAiChunks("edit", { path: "/x.ts", old_str: "a", new_str: "b" }),
        ["b"]
      );
      assert.deepStrictEqual(
        extractAiChunks("str_replace", { path: "/x.ts", old_str: "a", new_str: "c" }),
        ["c"]
      );
      assert.deepStrictEqual(
        extractAiChunks("insert", { path: "/x.ts", insert_line: 3, new_str: "d" }),
        ["d"]
      );
    });
    test("Copilot snake_case tools reject malformed input", () => {
      assert.deepStrictEqual(extractAiChunks("create", null), []);
      assert.deepStrictEqual(extractAiChunks("create", { path: "/x.ts" }), []);
      assert.deepStrictEqual(extractAiChunks("create", { file_text: 42 }), []);
      assert.deepStrictEqual(extractAiChunks("edit", { path: "/x.ts" }), []);
      assert.deepStrictEqual(extractAiChunks("str_replace", { new_str: null }), []);
      assert.deepStrictEqual(extractAiChunks("insert", { new_str: 7 }), []);
    });
    test("str_replace_editor dispatches on command", () => {
      assert.deepStrictEqual(
        extractAiChunks("str_replace_editor", { command: "create", path: "/x.ts", file_text: "hi" }),
        ["hi"]
      );
      assert.deepStrictEqual(
        extractAiChunks("str_replace_editor", { command: "str_replace", path: "/x.ts", old_str: "a", new_str: "b" }),
        ["b"]
      );
      assert.deepStrictEqual(
        extractAiChunks("str_replace_editor", { command: "insert", path: "/x.ts", insert_line: 1, new_str: "c" }),
        ["c"]
      );
    });
    test("str_replace_editor non-edit commands return []", () => {
      assert.deepStrictEqual(extractAiChunks("str_replace_editor", { command: "view", path: "/x.ts" }), []);
      assert.deepStrictEqual(extractAiChunks("str_replace_editor", { command: "undo_edit", path: "/x.ts" }), []);
      assert.deepStrictEqual(extractAiChunks("str_replace_editor", { command: "unknown" }), []);
      assert.deepStrictEqual(extractAiChunks("str_replace_editor", { path: "/x.ts" }), []);
    });
    test("apply_patch accepts a bare patch string", () => {
      const patch = [
        "*** Begin Patch",
        "*** Update File: /workspace/a.ts",
        "@@",
        " context",
        "+added line 1",
        "+added line 2",
        "-removed",
        "*** End Patch"
      ].join("\n");
      assert.deepStrictEqual(extractAiChunks("apply_patch", patch), ["added line 1\nadded line 2\n"]);
    });
    test("apply_patch accepts {input} and {patch} object wrappers", () => {
      const patch = "*** Update File: /a.ts\n+x\n";
      assert.deepStrictEqual(extractAiChunks("apply_patch", { input: patch }), ["x\n"]);
      assert.deepStrictEqual(extractAiChunks("apply_patch", { patch }), ["x\n"]);
    });
    test("apply_patch with forFilePath filters to one file", () => {
      const patch = [
        "*** Update File: /workspace/a.ts",
        "+a-line-1",
        "+a-line-2",
        "*** Add File: /workspace/b.ts",
        "+b-line-1",
        "*** Delete File: /workspace/c.ts",
        "-only-removed"
      ].join("\n");
      assert.deepStrictEqual(
        extractAiChunks("apply_patch", patch, "/workspace/a.ts"),
        ["a-line-1\na-line-2\n"]
      );
      assert.deepStrictEqual(
        extractAiChunks("apply_patch", patch, "/workspace/b.ts"),
        ["b-line-1\n"]
      );
      assert.deepStrictEqual(extractAiChunks("apply_patch", patch, "/workspace/c.ts"), []);
      assert.deepStrictEqual(extractAiChunks("apply_patch", patch, "/workspace/missing.ts"), []);
    });
    test("apply_patch without forFilePath returns chunks for every touched file in order", () => {
      const patch = [
        "*** Update File: /a.ts",
        "+a",
        "*** Add File: /b.ts",
        "+b1",
        "+b2"
      ].join("\n");
      assert.deepStrictEqual(extractAiChunks("apply_patch", patch), ["a\n", "b1\nb2\n"]);
    });
    test("apply_patch Move-to header is honored", () => {
      const patch = [
        "*** Move to: /new/place.ts",
        "+moved-and-changed"
      ].join("\n");
      assert.deepStrictEqual(extractAiChunks("apply_patch", patch, "/new/place.ts"), ["moved-and-changed\n"]);
    });
    test("apply_patch ignores +++ unified-diff marker", () => {
      const patch = [
        "*** Update File: /a.ts",
        "+++ /a.ts",
        // unified-diff header, must be ignored
        "+real addition"
      ].join("\n");
      assert.deepStrictEqual(extractAiChunks("apply_patch", patch), ["real addition\n"]);
    });
    test("apply_patch handles malformed input", () => {
      assert.deepStrictEqual(extractAiChunks("apply_patch", null), []);
      assert.deepStrictEqual(extractAiChunks("apply_patch", 42), []);
      assert.deepStrictEqual(extractAiChunks("apply_patch", {}), []);
      assert.deepStrictEqual(extractAiChunks("apply_patch", { input: 42 }), []);
      assert.deepStrictEqual(extractAiChunks("apply_patch", ""), []);
      assert.deepStrictEqual(extractAiChunks("apply_patch", "+orphan addition\n"), []);
    });
    test("git_apply_patch shares the apply_patch parser", () => {
      const patch = "*** Update File: /a.ts\n+gp\n";
      assert.deepStrictEqual(extractAiChunks("git_apply_patch", patch), ["gp\n"]);
    });
    test("write_file returns the complete contents field", () => {
      assert.deepStrictEqual(extractAiChunks("write_file", { path: "/workspace/game.js", contents: "full file\n" }), ["full file\n"]);
      assert.deepStrictEqual(extractAiChunks("write_file", { path: "/workspace/game.js", content: "alias\n" }), ["alias\n"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXGVkaXRDaHVua0V4dHJhY3Rvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBleHRyYWN0QWlDaHVua3MgfSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC9lZGl0Q2h1bmtFeHRyYWN0b3IuanMnO1xuXG5zdWl0ZSgnYWdlbnRIb3N0IGVkaXRDaHVua0V4dHJhY3RvcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdXcml0ZSByZXR1cm5zIFtjb250ZW50XScsICgpID0+IHtcblx0XHRjb25zdCBjaHVua3MgPSBleHRyYWN0QWlDaHVua3MoJ1dyaXRlJywgeyBmaWxlX3BhdGg6ICcveC50cycsIGNvbnRlbnQ6ICdoZWxsbyB3b3JsZFxcbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaHVua3MsIFsnaGVsbG8gd29ybGRcXG4nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXQgcmV0dXJucyBbbmV3X3N0cmluZ10nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2h1bmtzID0gZXh0cmFjdEFpQ2h1bmtzKCdFZGl0JywgeyBmaWxlX3BhdGg6ICcveC50cycsIG9sZF9zdHJpbmc6ICdhJywgbmV3X3N0cmluZzogJ2InIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2h1bmtzLCBbJ2InXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpRWRpdCByZXR1cm5zIG9uZSBjaHVuayBwZXIgZWRpdCcsICgpID0+IHtcblx0XHRjb25zdCBjaHVua3MgPSBleHRyYWN0QWlDaHVua3MoJ011bHRpRWRpdCcsIHtcblx0XHRcdGZpbGVfcGF0aDogJy94LnRzJyxcblx0XHRcdGVkaXRzOiBbXG5cdFx0XHRcdHsgb2xkX3N0cmluZzogJ2EnLCBuZXdfc3RyaW5nOiAnMScgfSxcblx0XHRcdFx0eyBvbGRfc3RyaW5nOiAnYicsIG5ld19zdHJpbmc6ICcyJyB9LFxuXHRcdFx0XHR7IG9sZF9zdHJpbmc6ICdjJywgbmV3X3N0cmluZzogJzMnIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2h1bmtzLCBbJzEnLCAnMicsICczJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aUVkaXQgc2lsZW50bHkgZHJvcHMgbWFsZm9ybWVkIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2h1bmtzID0gZXh0cmFjdEFpQ2h1bmtzKCdNdWx0aUVkaXQnLCB7XG5cdFx0XHRmaWxlX3BhdGg6ICcveC50cycsXG5cdFx0XHRlZGl0czogW1xuXHRcdFx0XHR7IG9sZF9zdHJpbmc6ICdhJywgbmV3X3N0cmluZzogJzEnIH0sXG5cdFx0XHRcdHsgb2xkX3N0cmluZzogJ2InIH0sICAgICAgICAgICAgICAgICAvLyBtaXNzaW5nIG5ld19zdHJpbmdcblx0XHRcdFx0bnVsbCwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5vdCBhbiBvYmplY3Rcblx0XHRcdFx0eyBvbGRfc3RyaW5nOiAnYycsIG5ld19zdHJpbmc6IDQyIH0sIC8vIHdyb25nIHR5cGVcblx0XHRcdFx0eyBvbGRfc3RyaW5nOiAnZCcsIG5ld19zdHJpbmc6ICc0JyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNodW5rcywgWycxJywgJzQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vua25vd24gdG9vbCByZXR1cm5zIFtdJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdCYXNoJywgeyBjb21tYW5kOiAnbHMnIH0pLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ05vdGVib29rRWRpdCcsIHsgbm90ZWJvb2tfcGF0aDogJy94LmlweW5iJyB9KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdtY3BfX2Zvb19fYmFyJywgeyB4OiAneScgfSksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWFsZm9ybWVkIGlucHV0IHJldHVybnMgW10nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ0VkaXQnLCBudWxsKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdFZGl0JywgdW5kZWZpbmVkKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdFZGl0JywgJ3N0cmluZycpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ0VkaXQnLCA0MiksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnRWRpdCcsIHsgZmlsZV9wYXRoOiAnL3gudHMnIH0pLCBbXSk7IC8vIG1pc3NpbmcgbmV3X3N0cmluZ1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdFZGl0JywgeyBuZXdfc3RyaW5nOiA0MiB9KSwgW10pOyAgICAgLy8gd3JvbmcgdHlwZVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdNdWx0aUVkaXQnLCB7IGVkaXRzOiAnbm90IGFuIGFycmF5JyB9KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdXcml0ZScsIHsgZmlsZV9wYXRoOiAnL3gudHMnIH0pLCBbXSk7IC8vIG1pc3NpbmcgY29udGVudFxuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBjaHVua3MgYXJlIHByZXNlcnZlZCAoY2FsbGVyIGRlY2lkZXMgaG93IHRvIHNjb3JlKScsICgpID0+IHtcblx0XHQvLyBBbiBFZGl0IHdob3NlIG5ld19zdHJpbmcgaXMgXCJcIiAocHVyZSBkZWxldGlvbikgc3RpbGwgcHJvZHVjZXNcblx0XHQvLyBvbmUgY2h1bmsuIFRoZSByZXBvcnRlcidzIGNodW5rZWQgc2NvcmluZyB0cmVhdHMgYW4gZW1wdHlcblx0XHQvLyBjaHVuayBhcyBmcmFjdGlvbi1wcmVzZW50ID0gMSwgd2hpY2ggaXMgY29ycmVjdDogdGhlcmUgaXNcblx0XHQvLyBub3RoaW5nIHRvIGZpbmQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ0VkaXQnLCB7IG9sZF9zdHJpbmc6ICdhJywgbmV3X3N0cmluZzogJycgfSksIFsnJ10pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ29waWxvdCBDTEkgdG9vbHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjcmVhdGUgcmV0dXJucyBbZmlsZV90ZXh0XScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNodW5rcyA9IGV4dHJhY3RBaUNodW5rcygnY3JlYXRlJywgeyBwYXRoOiAnL3gudHMnLCBmaWxlX3RleHQ6ICdoZWxsbyB3b3JsZFxcbicgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNodW5rcywgWydoZWxsbyB3b3JsZFxcbiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VkaXQgLyBzdHJfcmVwbGFjZSAvIGluc2VydCByZXR1cm4gW25ld19zdHJdJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEFpQ2h1bmtzKCdlZGl0JywgeyBwYXRoOiAnL3gudHMnLCBvbGRfc3RyOiAnYScsIG5ld19zdHI6ICdiJyB9KSxcblx0XHRcdFx0WydiJ10sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEFpQ2h1bmtzKCdzdHJfcmVwbGFjZScsIHsgcGF0aDogJy94LnRzJywgb2xkX3N0cjogJ2EnLCBuZXdfc3RyOiAnYycgfSksXG5cdFx0XHRcdFsnYyddLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RBaUNodW5rcygnaW5zZXJ0JywgeyBwYXRoOiAnL3gudHMnLCBpbnNlcnRfbGluZTogMywgbmV3X3N0cjogJ2QnIH0pLFxuXHRcdFx0XHRbJ2QnXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDb3BpbG90IHNuYWtlX2Nhc2UgdG9vbHMgcmVqZWN0IG1hbGZvcm1lZCBpbnB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdjcmVhdGUnLCBudWxsKSwgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ2NyZWF0ZScsIHsgcGF0aDogJy94LnRzJyB9KSwgW10pOyAgICAgLy8gbWlzc2luZyBmaWxlX3RleHRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdjcmVhdGUnLCB7IGZpbGVfdGV4dDogNDIgfSksIFtdKTsgICAgIC8vIHdyb25nIHR5cGVcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdlZGl0JywgeyBwYXRoOiAnL3gudHMnIH0pLCBbXSk7ICAgICAgIC8vIG1pc3NpbmcgbmV3X3N0clxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ3N0cl9yZXBsYWNlJywgeyBuZXdfc3RyOiBudWxsIH0pLCBbXSk7Ly8gd3JvbmcgdHlwZVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ2luc2VydCcsIHsgbmV3X3N0cjogNyB9KSwgW10pOyAgICAgICAgLy8gd3JvbmcgdHlwZVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyX3JlcGxhY2VfZWRpdG9yIGRpc3BhdGNoZXMgb24gY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RBaUNodW5rcygnc3RyX3JlcGxhY2VfZWRpdG9yJywgeyBjb21tYW5kOiAnY3JlYXRlJywgcGF0aDogJy94LnRzJywgZmlsZV90ZXh0OiAnaGknIH0pLFxuXHRcdFx0XHRbJ2hpJ10sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEFpQ2h1bmtzKCdzdHJfcmVwbGFjZV9lZGl0b3InLCB7IGNvbW1hbmQ6ICdzdHJfcmVwbGFjZScsIHBhdGg6ICcveC50cycsIG9sZF9zdHI6ICdhJywgbmV3X3N0cjogJ2InIH0pLFxuXHRcdFx0XHRbJ2InXSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRleHRyYWN0QWlDaHVua3MoJ3N0cl9yZXBsYWNlX2VkaXRvcicsIHsgY29tbWFuZDogJ2luc2VydCcsIHBhdGg6ICcveC50cycsIGluc2VydF9saW5lOiAxLCBuZXdfc3RyOiAnYycgfSksXG5cdFx0XHRcdFsnYyddLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cl9yZXBsYWNlX2VkaXRvciBub24tZWRpdCBjb21tYW5kcyByZXR1cm4gW10nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnc3RyX3JlcGxhY2VfZWRpdG9yJywgeyBjb21tYW5kOiAndmlldycsIHBhdGg6ICcveC50cycgfSksIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdzdHJfcmVwbGFjZV9lZGl0b3InLCB7IGNvbW1hbmQ6ICd1bmRvX2VkaXQnLCBwYXRoOiAnL3gudHMnIH0pLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnc3RyX3JlcGxhY2VfZWRpdG9yJywgeyBjb21tYW5kOiAndW5rbm93bicgfSksIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdzdHJfcmVwbGFjZV9lZGl0b3InLCB7IHBhdGg6ICcveC50cycgfSksIFtdKTsgLy8gbWlzc2luZyBjb21tYW5kXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBseV9wYXRjaCBhY2NlcHRzIGEgYmFyZSBwYXRjaCBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRjaCA9IFtcblx0XHRcdFx0JyoqKiBCZWdpbiBQYXRjaCcsXG5cdFx0XHRcdCcqKiogVXBkYXRlIEZpbGU6IC93b3Jrc3BhY2UvYS50cycsXG5cdFx0XHRcdCdAQCcsXG5cdFx0XHRcdCcgY29udGV4dCcsXG5cdFx0XHRcdCcrYWRkZWQgbGluZSAxJyxcblx0XHRcdFx0JythZGRlZCBsaW5lIDInLFxuXHRcdFx0XHQnLXJlbW92ZWQnLFxuXHRcdFx0XHQnKioqIEVuZCBQYXRjaCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ2FwcGx5X3BhdGNoJywgcGF0Y2gpLCBbJ2FkZGVkIGxpbmUgMVxcbmFkZGVkIGxpbmUgMlxcbiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGx5X3BhdGNoIGFjY2VwdHMge2lucHV0fSBhbmQge3BhdGNofSBvYmplY3Qgd3JhcHBlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRjaCA9ICcqKiogVXBkYXRlIEZpbGU6IC9hLnRzXFxuK3hcXG4nO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ2FwcGx5X3BhdGNoJywgeyBpbnB1dDogcGF0Y2ggfSksIFsneFxcbiddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdhcHBseV9wYXRjaCcsIHsgcGF0Y2ggfSksIFsneFxcbiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGx5X3BhdGNoIHdpdGggZm9yRmlsZVBhdGggZmlsdGVycyB0byBvbmUgZmlsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGNoID0gW1xuXHRcdFx0XHQnKioqIFVwZGF0ZSBGaWxlOiAvd29ya3NwYWNlL2EudHMnLFxuXHRcdFx0XHQnK2EtbGluZS0xJyxcblx0XHRcdFx0JythLWxpbmUtMicsXG5cdFx0XHRcdCcqKiogQWRkIEZpbGU6IC93b3Jrc3BhY2UvYi50cycsXG5cdFx0XHRcdCcrYi1saW5lLTEnLFxuXHRcdFx0XHQnKioqIERlbGV0ZSBGaWxlOiAvd29ya3NwYWNlL2MudHMnLFxuXHRcdFx0XHQnLW9ubHktcmVtb3ZlZCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZXh0cmFjdEFpQ2h1bmtzKCdhcHBseV9wYXRjaCcsIHBhdGNoLCAnL3dvcmtzcGFjZS9hLnRzJyksXG5cdFx0XHRcdFsnYS1saW5lLTFcXG5hLWxpbmUtMlxcbiddLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGV4dHJhY3RBaUNodW5rcygnYXBwbHlfcGF0Y2gnLCBwYXRjaCwgJy93b3Jrc3BhY2UvYi50cycpLFxuXHRcdFx0XHRbJ2ItbGluZS0xXFxuJ10sXG5cdFx0XHQpO1xuXHRcdFx0Ly8gRGVsZXRlLW9ubHkgZmlsZSBoYXMgbm8gJysnIGxpbmVzLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ2FwcGx5X3BhdGNoJywgcGF0Y2gsICcvd29ya3NwYWNlL2MudHMnKSwgW10pO1xuXHRcdFx0Ly8gRmlsZSBub3QgaW4gcGF0Y2guXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnYXBwbHlfcGF0Y2gnLCBwYXRjaCwgJy93b3Jrc3BhY2UvbWlzc2luZy50cycpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBseV9wYXRjaCB3aXRob3V0IGZvckZpbGVQYXRoIHJldHVybnMgY2h1bmtzIGZvciBldmVyeSB0b3VjaGVkIGZpbGUgaW4gb3JkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRjaCA9IFtcblx0XHRcdFx0JyoqKiBVcGRhdGUgRmlsZTogL2EudHMnLFxuXHRcdFx0XHQnK2EnLFxuXHRcdFx0XHQnKioqIEFkZCBGaWxlOiAvYi50cycsXG5cdFx0XHRcdCcrYjEnLFxuXHRcdFx0XHQnK2IyJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnYXBwbHlfcGF0Y2gnLCBwYXRjaCksIFsnYVxcbicsICdiMVxcbmIyXFxuJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwbHlfcGF0Y2ggTW92ZS10byBoZWFkZXIgaXMgaG9ub3JlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGNoID0gW1xuXHRcdFx0XHQnKioqIE1vdmUgdG86IC9uZXcvcGxhY2UudHMnLFxuXHRcdFx0XHQnK21vdmVkLWFuZC1jaGFuZ2VkJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnYXBwbHlfcGF0Y2gnLCBwYXRjaCwgJy9uZXcvcGxhY2UudHMnKSwgWydtb3ZlZC1hbmQtY2hhbmdlZFxcbiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGx5X3BhdGNoIGlnbm9yZXMgKysrIHVuaWZpZWQtZGlmZiBtYXJrZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRjaCA9IFtcblx0XHRcdFx0JyoqKiBVcGRhdGUgRmlsZTogL2EudHMnLFxuXHRcdFx0XHQnKysrIC9hLnRzJywgICAgICAgICAgIC8vIHVuaWZpZWQtZGlmZiBoZWFkZXIsIG11c3QgYmUgaWdub3JlZFxuXHRcdFx0XHQnK3JlYWwgYWRkaXRpb24nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdhcHBseV9wYXRjaCcsIHBhdGNoKSwgWydyZWFsIGFkZGl0aW9uXFxuJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwbHlfcGF0Y2ggaGFuZGxlcyBtYWxmb3JtZWQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnYXBwbHlfcGF0Y2gnLCBudWxsKSwgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ2FwcGx5X3BhdGNoJywgNDIpLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnYXBwbHlfcGF0Y2gnLCB7fSksIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCdhcHBseV9wYXRjaCcsIHsgaW5wdXQ6IDQyIH0pLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnYXBwbHlfcGF0Y2gnLCAnJyksIFtdKTtcblx0XHRcdC8vICcrJyBsaW5lcyBiZWZvcmUgYW55IGZpbGUgaGVhZGVyIGFyZSBkcm9wcGVkLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QWlDaHVua3MoJ2FwcGx5X3BhdGNoJywgJytvcnBoYW4gYWRkaXRpb25cXG4nKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0X2FwcGx5X3BhdGNoIHNoYXJlcyB0aGUgYXBwbHlfcGF0Y2ggcGFyc2VyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0Y2ggPSAnKioqIFVwZGF0ZSBGaWxlOiAvYS50c1xcbitncFxcbic7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBaUNodW5rcygnZ2l0X2FwcGx5X3BhdGNoJywgcGF0Y2gpLCBbJ2dwXFxuJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGVfZmlsZSByZXR1cm5zIHRoZSBjb21wbGV0ZSBjb250ZW50cyBmaWVsZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCd3cml0ZV9maWxlJywgeyBwYXRoOiAnL3dvcmtzcGFjZS9nYW1lLmpzJywgY29udGVudHM6ICdmdWxsIGZpbGVcXG4nIH0pLCBbJ2Z1bGwgZmlsZVxcbiddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEFpQ2h1bmtzKCd3cml0ZV9maWxlJywgeyBwYXRoOiAnL3dvcmtzcGFjZS9nYW1lLmpzJywgY29udGVudDogJ2FsaWFzXFxuJyB9KSwgWydhbGlhc1xcbiddKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6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
