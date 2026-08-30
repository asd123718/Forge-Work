import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { shellQuotePluginRootInCommand } from "../../../common/plugins/agentPluginServiceImpl.js";
suite("shellQuotePluginRootInCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const TOKEN = "${PLUGIN_ROOT}";
  test("returns command unchanged when token is not present", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("echo hello", "/safe/path", TOKEN),
      "echo hello"
    );
  });
  test("plain replacement when path has no special characters", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", "/safe/path", TOKEN),
      "/safe/path/run.sh"
    );
  });
  test("plain replacement for multiple occurrences with safe path", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/a && ${PLUGIN_ROOT}/b", "/safe", TOKEN),
      "/safe/a && /safe/b"
    );
  });
  test("quotes path with spaces", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", "/path with spaces", TOKEN),
      '"/path with spaces/run.sh"'
    );
  });
  test("quotes path with ampersand", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", "/path&dir", TOKEN),
      '"/path&dir/run.sh"'
    );
  });
  test("quotes multiple occurrences with unsafe path", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/a && ${PLUGIN_ROOT}/b", "/my dir", TOKEN),
      '"/my dir/a" && "/my dir/b"'
    );
  });
  test("does not double-quote when already in double quotes", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand('"${PLUGIN_ROOT}/run.sh"', "/my dir", TOKEN),
      '"/my dir/run.sh"'
    );
  });
  test("does not double-quote when already in single quotes", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand(`'\${PLUGIN_ROOT}/run.sh'`, "/my dir", TOKEN),
      `'/my dir/run.sh'`
    );
  });
  test("escapes embedded double-quote characters in path", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", '/path"with"quotes', TOKEN),
      '"/path\\"with\\"quotes/run.sh"'
    );
  });
  test("handles token without trailing path suffix", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("cd ${PLUGIN_ROOT} && run", "/my dir", TOKEN),
      'cd "/my dir" && run'
    );
  });
  test("does not consume shell operators adjacent to token", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("cd ${PLUGIN_ROOT}&& echo ok", "/my dir", TOKEN),
      'cd "/my dir"&& echo ok'
    );
  });
  test("handles token at start, middle and end of command", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/a ${PLUGIN_ROOT}/b ${PLUGIN_ROOT}/c", "/sp ace", TOKEN),
      '"/sp ace/a" "/sp ace/b" "/sp ace/c"'
    );
  });
  test("uses default CLAUDE_PLUGIN_ROOT token when not specified", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${CLAUDE_PLUGIN_ROOT}/run.sh", "/safe/path", "${CLAUDE_PLUGIN_ROOT}"),
      "/safe/path/run.sh"
    );
  });
  test("uses default CLAUDE_PLUGIN_ROOT token with quoting", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${CLAUDE_PLUGIN_ROOT}/run.sh", "/my dir", "${CLAUDE_PLUGIN_ROOT}"),
      '"/my dir/run.sh"'
    );
  });
  test("handles Windows-style paths with spaces", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}\\scripts\\run.bat", "C:\\Program Files\\plugin", TOKEN),
      '"C:\\Program Files\\plugin\\scripts\\run.bat"'
    );
  });
  test("handles path with parentheses", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", "/path(1)", TOKEN),
      '"/path(1)/run.sh"'
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccGx1Z2luc1xcc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2VJbXBsLmpzJztcblxuc3VpdGUoJ3NoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBUT0tFTiA9ICcke1BMVUdJTl9ST09UfSc7XG5cblx0dGVzdCgncmV0dXJucyBjb21tYW5kIHVuY2hhbmdlZCB3aGVuIHRva2VuIGlzIG5vdCBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCdlY2hvIGhlbGxvJywgJy9zYWZlL3BhdGgnLCBUT0tFTiksXG5cdFx0XHQnZWNobyBoZWxsbycsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncGxhaW4gcmVwbGFjZW1lbnQgd2hlbiBwYXRoIGhhcyBubyBzcGVjaWFsIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7UExVR0lOX1JPT1R9L3J1bi5zaCcsICcvc2FmZS9wYXRoJywgVE9LRU4pLFxuXHRcdFx0Jy9zYWZlL3BhdGgvcnVuLnNoJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwbGFpbiByZXBsYWNlbWVudCBmb3IgbXVsdGlwbGUgb2NjdXJyZW5jZXMgd2l0aCBzYWZlIHBhdGgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7UExVR0lOX1JPT1R9L2EgJiYgJHtQTFVHSU5fUk9PVH0vYicsICcvc2FmZScsIFRPS0VOKSxcblx0XHRcdCcvc2FmZS9hICYmIC9zYWZlL2InLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1b3RlcyBwYXRoIHdpdGggc3BhY2VzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCcke1BMVUdJTl9ST09UfS9ydW4uc2gnLCAnL3BhdGggd2l0aCBzcGFjZXMnLCBUT0tFTiksXG5cdFx0XHQnXCIvcGF0aCB3aXRoIHNwYWNlcy9ydW4uc2hcIicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncXVvdGVzIHBhdGggd2l0aCBhbXBlcnNhbmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7UExVR0lOX1JPT1R9L3J1bi5zaCcsICcvcGF0aCZkaXInLCBUT0tFTiksXG5cdFx0XHQnXCIvcGF0aCZkaXIvcnVuLnNoXCInLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1b3RlcyBtdWx0aXBsZSBvY2N1cnJlbmNlcyB3aXRoIHVuc2FmZSBwYXRoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCcke1BMVUdJTl9ST09UfS9hICYmICR7UExVR0lOX1JPT1R9L2InLCAnL215IGRpcicsIFRPS0VOKSxcblx0XHRcdCdcIi9teSBkaXIvYVwiICYmIFwiL215IGRpci9iXCInLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRvdWJsZS1xdW90ZSB3aGVuIGFscmVhZHkgaW4gZG91YmxlIHF1b3RlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCgnXCIke1BMVUdJTl9ST09UfS9ydW4uc2hcIicsICcvbXkgZGlyJywgVE9LRU4pLFxuXHRcdFx0J1wiL215IGRpci9ydW4uc2hcIicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZG91YmxlLXF1b3RlIHdoZW4gYWxyZWFkeSBpbiBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKGAnXFwke1BMVUdJTl9ST09UfS9ydW4uc2gnYCwgJy9teSBkaXInLCBUT0tFTiksXG5cdFx0XHRgJy9teSBkaXIvcnVuLnNoJ2AsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXNjYXBlcyBlbWJlZGRlZCBkb3VibGUtcXVvdGUgY2hhcmFjdGVycyBpbiBwYXRoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCcke1BMVUdJTl9ST09UfS9ydW4uc2gnLCAnL3BhdGhcIndpdGhcInF1b3RlcycsIFRPS0VOKSxcblx0XHRcdCdcIi9wYXRoXFxcXFwid2l0aFxcXFxcInF1b3Rlcy9ydW4uc2hcIicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyB0b2tlbiB3aXRob3V0IHRyYWlsaW5nIHBhdGggc3VmZml4JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCdjZCAke1BMVUdJTl9ST09UfSAmJiBydW4nLCAnL215IGRpcicsIFRPS0VOKSxcblx0XHRcdCdjZCBcIi9teSBkaXJcIiAmJiBydW4nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGNvbnN1bWUgc2hlbGwgb3BlcmF0b3JzIGFkamFjZW50IHRvIHRva2VuJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCdjZCAke1BMVUdJTl9ST09UfSYmIGVjaG8gb2snLCAnL215IGRpcicsIFRPS0VOKSxcblx0XHRcdCdjZCBcIi9teSBkaXJcIiYmIGVjaG8gb2snLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgdG9rZW4gYXQgc3RhcnQsIG1pZGRsZSBhbmQgZW5kIG9mIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7UExVR0lOX1JPT1R9L2EgJHtQTFVHSU5fUk9PVH0vYiAke1BMVUdJTl9ST09UfS9jJywgJy9zcCBhY2UnLCBUT0tFTiksXG5cdFx0XHQnXCIvc3AgYWNlL2FcIiBcIi9zcCBhY2UvYlwiIFwiL3NwIGFjZS9jXCInLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgZGVmYXVsdCBDTEFVREVfUExVR0lOX1JPT1QgdG9rZW4gd2hlbiBub3Qgc3BlY2lmaWVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCcke0NMQVVERV9QTFVHSU5fUk9PVH0vcnVuLnNoJywgJy9zYWZlL3BhdGgnLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9JyksXG5cdFx0XHQnL3NhZmUvcGF0aC9ydW4uc2gnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgZGVmYXVsdCBDTEFVREVfUExVR0lOX1JPT1QgdG9rZW4gd2l0aCBxdW90aW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCcke0NMQVVERV9QTFVHSU5fUk9PVH0vcnVuLnNoJywgJy9teSBkaXInLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9JyksXG5cdFx0XHQnXCIvbXkgZGlyL3J1bi5zaFwiJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIFdpbmRvd3Mtc3R5bGUgcGF0aHMgd2l0aCBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7UExVR0lOX1JPT1R9XFxcXHNjcmlwdHNcXFxccnVuLmJhdCcsICdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXHBsdWdpbicsIFRPS0VOKSxcblx0XHRcdCdcIkM6XFxcXFByb2dyYW0gRmlsZXNcXFxccGx1Z2luXFxcXHNjcmlwdHNcXFxccnVuLmJhdFwiJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHBhdGggd2l0aCBwYXJlbnRoZXNlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCgnJHtQTFVHSU5fUk9PVH0vcnVuLnNoJywgJy9wYXRoKDEpJywgVE9LRU4pLFxuXHRcdFx0J1wiL3BhdGgoMSkvcnVuLnNoXCInLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQ0FBcUM7QUFFOUMsTUFBTSxpQ0FBaUMsTUFBTTtBQUM1QywwQ0FBd0M7QUFFeEMsUUFBTSxRQUFRO0FBRWQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxXQUFPO0FBQUEsTUFDTiw4QkFBOEIsY0FBYyxjQUFjLEtBQUs7QUFBQSxNQUMvRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFdBQU87QUFBQSxNQUNOLDhCQUE4Qix5QkFBeUIsY0FBYyxLQUFLO0FBQUEsTUFDMUU7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxXQUFPO0FBQUEsTUFDTiw4QkFBOEIsd0NBQXdDLFNBQVMsS0FBSztBQUFBLE1BQ3BGO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMkJBQTJCLE1BQU07QUFDckMsV0FBTztBQUFBLE1BQ04sOEJBQThCLHlCQUF5QixxQkFBcUIsS0FBSztBQUFBLE1BQ2pGO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssOEJBQThCLE1BQU07QUFDeEMsV0FBTztBQUFBLE1BQ04sOEJBQThCLHlCQUF5QixhQUFhLEtBQUs7QUFBQSxNQUN6RTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGdEQUFnRCxNQUFNO0FBQzFELFdBQU87QUFBQSxNQUNOLDhCQUE4Qix3Q0FBd0MsV0FBVyxLQUFLO0FBQUEsTUFDdEY7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxXQUFPO0FBQUEsTUFDTiw4QkFBOEIsMkJBQTJCLFdBQVcsS0FBSztBQUFBLE1BQ3pFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFDakUsV0FBTztBQUFBLE1BQ04sOEJBQThCLDRCQUE0QixXQUFXLEtBQUs7QUFBQSxNQUMxRTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELFdBQU87QUFBQSxNQUNOLDhCQUE4Qix5QkFBeUIscUJBQXFCLEtBQUs7QUFBQSxNQUNqRjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELFdBQU87QUFBQSxNQUNOLDhCQUE4Qiw0QkFBNEIsV0FBVyxLQUFLO0FBQUEsTUFDMUU7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzREFBc0QsTUFBTTtBQUNoRSxXQUFPO0FBQUEsTUFDTiw4QkFBOEIsK0JBQStCLFdBQVcsS0FBSztBQUFBLE1BQzdFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0QsV0FBTztBQUFBLE1BQ04sOEJBQThCLHNEQUFzRCxXQUFXLEtBQUs7QUFBQSxNQUNwRztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFdBQU87QUFBQSxNQUNOLDhCQUE4QixnQ0FBZ0MsY0FBYyx1QkFBdUI7QUFBQSxNQUNuRztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFdBQU87QUFBQSxNQUNOLDhCQUE4QixnQ0FBZ0MsV0FBVyx1QkFBdUI7QUFBQSxNQUNoRztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFdBQU87QUFBQSxNQUNOLDhCQUE4QixvQ0FBb0MsNkJBQTZCLEtBQUs7QUFBQSxNQUNwRztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlDQUFpQyxNQUFNO0FBQzNDLFdBQU87QUFBQSxNQUNOLDhCQUE4Qix5QkFBeUIsWUFBWSxLQUFLO0FBQUEsTUFDeEU7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
