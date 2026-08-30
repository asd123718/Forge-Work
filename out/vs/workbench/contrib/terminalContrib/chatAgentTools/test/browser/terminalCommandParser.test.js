import { deepStrictEqual, ok, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { parseCommand, parseCommandHead, segmentHasFlag, segmentHead, tokenize } from "../../browser/tools/terminalCommandParser.js";
suite("terminalCommandParser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("tokenize", () => {
    test("splits on whitespace", () => {
      deepStrictEqual(tokenize("git diff HEAD~1 src/foo.ts"), ["git", "diff", "HEAD~1", "src/foo.ts"]);
    });
    test("respects single quotes", () => {
      deepStrictEqual(tokenize(`grep 'a b c' file`), ["grep", "a b c", "file"]);
    });
    test("respects double quotes with escapes", () => {
      deepStrictEqual(tokenize(`echo "a \\"b\\" c"`), ["echo", 'a "b" c']);
    });
    test("respects backslash escapes outside quotes", () => {
      deepStrictEqual(tokenize("cat foo\\ bar.txt"), ["cat", "foo bar.txt"]);
    });
    test("handles unterminated quotes gracefully", () => {
      deepStrictEqual(tokenize(`echo "unterminated`), ["echo", "unterminated"]);
    });
    test("preserves empty quoted strings", () => {
      deepStrictEqual(tokenize(`grep "" file`), ["grep", "", "file"]);
    });
  });
  suite("parseCommand composition", () => {
    test("returns undefined for empty input", () => {
      strictEqual(parseCommand(void 0), void 0);
      strictEqual(parseCommand(""), void 0);
      strictEqual(parseCommand("   "), void 0);
    });
    test("splits pipelines", () => {
      const parsed = parseCommand("git diff | cat");
      strictEqual(parsed?.segments.length, 2);
      strictEqual(parsed?.segments[0].trailingSeparator, "|");
      deepStrictEqual(parsed?.segments[0].tokens, ["git", "diff"]);
      deepStrictEqual(parsed?.segments[1].tokens, ["cat"]);
    });
    test("splits on && and ||", () => {
      const parsed = parseCommand("npm install && npm test || echo fail");
      strictEqual(parsed?.segments.length, 3);
      strictEqual(parsed?.segments[0].trailingSeparator, "&&");
      strictEqual(parsed?.segments[1].trailingSeparator, "||");
    });
    test("does not split on separators inside quotes", () => {
      const parsed = parseCommand(`echo "a;b" | wc -l`);
      strictEqual(parsed?.segments.length, 2);
      deepStrictEqual(parsed?.segments[0].tokens, ["echo", "a;b"]);
    });
    test("strips leading env assignments", () => {
      const parsed = parseCommand("CI=1 NODE_ENV=test npm install");
      strictEqual(parsed?.segments.length, 1);
      deepStrictEqual(parsed?.segments[0].envPrefixes, ["CI=1", "NODE_ENV=test"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["npm", "install"]);
    });
    test("strips sudo wrapper", () => {
      const parsed = parseCommand("sudo apt-get install -y vim");
      deepStrictEqual(parsed?.segments[0].wrappers, ["sudo"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["apt-get", "install", "-y", "vim"]);
    });
    test("strips time wrapper", () => {
      const parsed = parseCommand("time cargo build");
      deepStrictEqual(parsed?.segments[0].wrappers, ["time"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["cargo", "build"]);
    });
    test("strips timeout wrapper with numeric arg", () => {
      const parsed = parseCommand("timeout 30 npm test");
      deepStrictEqual(parsed?.segments[0].wrappers, ["timeout"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["npm", "test"]);
    });
    test("strips env wrapper with inner env vars", () => {
      const parsed = parseCommand("env -i PATH=/usr/bin make all");
      deepStrictEqual(parsed?.segments[0].wrappers, ["env"]);
      deepStrictEqual(parsed?.segments[0].envPrefixes, ["PATH=/usr/bin"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["make", "all"]);
    });
    test("strips combined env + wrapper", () => {
      const parsed = parseCommand("FOO=bar sudo time git diff");
      deepStrictEqual(parsed?.segments[0].envPrefixes, ["FOO=bar"]);
      deepStrictEqual(parsed?.segments[0].wrappers, ["sudo", "time"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["git", "diff"]);
    });
  });
  suite("segmentHead", () => {
    test("handles plain command", () => {
      const seg = parseCommand("git diff HEAD~1").segments[0];
      deepStrictEqual(segmentHead(seg), { head: "git", sub: "diff" });
    });
    test("skips long flags before subcommand", () => {
      const seg = parseCommand("git --no-pager diff src/foo.ts").segments[0];
      deepStrictEqual(segmentHead(seg), { head: "git", sub: "diff" });
    });
    test("does not skip short flags", () => {
      const seg = parseCommand("git -C /tmp/repo diff").segments[0];
      deepStrictEqual(segmentHead(seg), { head: "git", sub: "-C" });
    });
  });
  suite("parseCommandHead", () => {
    test("returns undefined for empty input", () => {
      strictEqual(parseCommandHead(void 0), void 0);
      strictEqual(parseCommandHead(""), void 0);
    });
    test("parses simple commands", () => {
      deepStrictEqual(parseCommandHead("git diff HEAD~5"), { head: "git", sub: "diff" });
    });
    test("uses first segment of pipeline", () => {
      deepStrictEqual(parseCommandHead("git diff | cat"), { head: "git", sub: "diff" });
    });
    test("strips env / wrappers", () => {
      deepStrictEqual(parseCommandHead("CI=1 sudo time git status"), { head: "git", sub: "status" });
    });
  });
  suite("segmentHasFlag", () => {
    test("detects bundled short flags", () => {
      const seg = parseCommand("ls -la").segments[0];
      ok(segmentHasFlag(seg, ["l"]));
      ok(segmentHasFlag(seg, ["a"]));
      ok(!segmentHasFlag(seg, ["r"]));
    });
    test("detects long flags", () => {
      const seg = parseCommand("git --no-pager log").segments[0];
      ok(segmentHasFlag(seg, ["no-pager"]));
      ok(!segmentHasFlag(seg, ["pager"]));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHRlcm1pbmFsQ29tbWFuZFBhcnNlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBwYXJzZUNvbW1hbmQsIHBhcnNlQ29tbWFuZEhlYWQsIHNlZ21lbnRIYXNGbGFnLCBzZWdtZW50SGVhZCwgdG9rZW5pemUgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL3Rlcm1pbmFsQ29tbWFuZFBhcnNlci5qcyc7XG5cbnN1aXRlKCd0ZXJtaW5hbENvbW1hbmRQYXJzZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCd0b2tlbml6ZScsICgpID0+IHtcblx0XHR0ZXN0KCdzcGxpdHMgb24gd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh0b2tlbml6ZSgnZ2l0IGRpZmYgSEVBRH4xIHNyYy9mb28udHMnKSwgWydnaXQnLCAnZGlmZicsICdIRUFEfjEnLCAnc3JjL2Zvby50cyddKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdyZXNwZWN0cyBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRva2VuaXplKGBncmVwICdhIGIgYycgZmlsZWApLCBbJ2dyZXAnLCAnYSBiIGMnLCAnZmlsZSddKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdyZXNwZWN0cyBkb3VibGUgcXVvdGVzIHdpdGggZXNjYXBlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh0b2tlbml6ZShgZWNobyBcImEgXFxcXFwiYlxcXFxcIiBjXCJgKSwgWydlY2hvJywgJ2EgXCJiXCIgYyddKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdyZXNwZWN0cyBiYWNrc2xhc2ggZXNjYXBlcyBvdXRzaWRlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh0b2tlbml6ZSgnY2F0IGZvb1xcXFwgYmFyLnR4dCcpLCBbJ2NhdCcsICdmb28gYmFyLnR4dCddKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdoYW5kbGVzIHVudGVybWluYXRlZCBxdW90ZXMgZ3JhY2VmdWxseScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh0b2tlbml6ZShgZWNobyBcInVudGVybWluYXRlZGApLCBbJ2VjaG8nLCAndW50ZXJtaW5hdGVkJ10pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3ByZXNlcnZlcyBlbXB0eSBxdW90ZWQgc3RyaW5ncycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh0b2tlbml6ZShgZ3JlcCBcIlwiIGZpbGVgKSwgWydncmVwJywgJycsICdmaWxlJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VDb21tYW5kIGNvbXBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZCh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VDb21tYW5kKCcnKSwgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZCgnICAgJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzcGxpdHMgcGlwZWxpbmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKCdnaXQgZGlmZiB8IGNhdCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50cy5sZW5ndGgsIDIpO1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50cmFpbGluZ1NlcGFyYXRvciwgJ3wnKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLnRva2VucywgWydnaXQnLCAnZGlmZiddKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzFdLnRva2VucywgWydjYXQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzcGxpdHMgb24gJiYgYW5kIHx8JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKCducG0gaW5zdGFsbCAmJiBucG0gdGVzdCB8fCBlY2hvIGZhaWwnKTtcblx0XHRcdHN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHMubGVuZ3RoLCAzKTtcblx0XHRcdHN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0udHJhaWxpbmdTZXBhcmF0b3IsICcmJicpO1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1sxXS50cmFpbGluZ1NlcGFyYXRvciwgJ3x8Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzcGxpdCBvbiBzZXBhcmF0b3JzIGluc2lkZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoYGVjaG8gXCJhO2JcIiB8IHdjIC1sYCk7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzLmxlbmd0aCwgMik7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50b2tlbnMsIFsnZWNobycsICdhO2InXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgbGVhZGluZyBlbnYgYXNzaWdubWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoJ0NJPTEgTk9ERV9FTlY9dGVzdCBucG0gaW5zdGFsbCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0uZW52UHJlZml4ZXMsIFsnQ0k9MScsICdOT0RFX0VOVj10ZXN0J10pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0udG9rZW5zLCBbJ25wbScsICdpbnN0YWxsJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIHN1ZG8gd3JhcHBlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZCgnc3VkbyBhcHQtZ2V0IGluc3RhbGwgLXkgdmltJyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS53cmFwcGVycywgWydzdWRvJ10pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0udG9rZW5zLCBbJ2FwdC1nZXQnLCAnaW5zdGFsbCcsICcteScsICd2aW0nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgdGltZSB3cmFwcGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKCd0aW1lIGNhcmdvIGJ1aWxkJyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS53cmFwcGVycywgWyd0aW1lJ10pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0udG9rZW5zLCBbJ2NhcmdvJywgJ2J1aWxkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIHRpbWVvdXQgd3JhcHBlciB3aXRoIG51bWVyaWMgYXJnJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKCd0aW1lb3V0IDMwIG5wbSB0ZXN0Jyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS53cmFwcGVycywgWyd0aW1lb3V0J10pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0udG9rZW5zLCBbJ25wbScsICd0ZXN0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIGVudiB3cmFwcGVyIHdpdGggaW5uZXIgZW52IHZhcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoJ2VudiAtaSBQQVRIPS91c3IvYmluIG1ha2UgYWxsJyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS53cmFwcGVycywgWydlbnYnXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS5lbnZQcmVmaXhlcywgWydQQVRIPS91c3IvYmluJ10pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0udG9rZW5zLCBbJ21ha2UnLCAnYWxsJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIGNvbWJpbmVkIGVudiArIHdyYXBwZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoJ0ZPTz1iYXIgc3VkbyB0aW1lIGdpdCBkaWZmJyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS5lbnZQcmVmaXhlcywgWydGT089YmFyJ10pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0ud3JhcHBlcnMsIFsnc3VkbycsICd0aW1lJ10pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0udG9rZW5zLCBbJ2dpdCcsICdkaWZmJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2VnbWVudEhlYWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaGFuZGxlcyBwbGFpbiBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VnID0gcGFyc2VDb21tYW5kKCdnaXQgZGlmZiBIRUFEfjEnKSEuc2VnbWVudHNbMF07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2VnbWVudEhlYWQoc2VnKSwgeyBoZWFkOiAnZ2l0Jywgc3ViOiAnZGlmZicgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBsb25nIGZsYWdzIGJlZm9yZSBzdWJjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VnID0gcGFyc2VDb21tYW5kKCdnaXQgLS1uby1wYWdlciBkaWZmIHNyYy9mb28udHMnKSEuc2VnbWVudHNbMF07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2VnbWVudEhlYWQoc2VnKSwgeyBoZWFkOiAnZ2l0Jywgc3ViOiAnZGlmZicgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBza2lwIHNob3J0IGZsYWdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VnID0gcGFyc2VDb21tYW5kKCdnaXQgLUMgL3RtcC9yZXBvIGRpZmYnKSEuc2VnbWVudHNbMF07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2VnbWVudEhlYWQoc2VnKSwgeyBoZWFkOiAnZ2l0Jywgc3ViOiAnLUMnIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VDb21tYW5kSGVhZCcsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKCcnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdwYXJzZXMgc2ltcGxlIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZEhlYWQoJ2dpdCBkaWZmIEhFQUR+NScpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICdkaWZmJyB9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCd1c2VzIGZpcnN0IHNlZ21lbnQgb2YgcGlwZWxpbmUnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnZ2l0IGRpZmYgfCBjYXQnKSwgeyBoZWFkOiAnZ2l0Jywgc3ViOiAnZGlmZicgfSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc3RyaXBzIGVudiAvIHdyYXBwZXJzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZEhlYWQoJ0NJPTEgc3VkbyB0aW1lIGdpdCBzdGF0dXMnKSwgeyBoZWFkOiAnZ2l0Jywgc3ViOiAnc3RhdHVzJyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NlZ21lbnRIYXNGbGFnJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2RldGVjdHMgYnVuZGxlZCBzaG9ydCBmbGFncycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlZyA9IHBhcnNlQ29tbWFuZCgnbHMgLWxhJykhLnNlZ21lbnRzWzBdO1xuXHRcdFx0b2soc2VnbWVudEhhc0ZsYWcoc2VnLCBbJ2wnXSkpO1xuXHRcdFx0b2soc2VnbWVudEhhc0ZsYWcoc2VnLCBbJ2EnXSkpO1xuXHRcdFx0b2soIXNlZ21lbnRIYXNGbGFnKHNlZywgWydyJ10pKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdkZXRlY3RzIGxvbmcgZmxhZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWcgPSBwYXJzZUNvbW1hbmQoJ2dpdCAtLW5vLXBhZ2VyIGxvZycpIS5zZWdtZW50c1swXTtcblx0XHRcdG9rKHNlZ21lbnRIYXNGbGFnKHNlZywgWyduby1wYWdlciddKSk7XG5cdFx0XHRvayghc2VnbWVudEhhc0ZsYWcoc2VnLCBbJ3BhZ2VyJ10pKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLElBQUksbUJBQW1CO0FBQ2pELFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsY0FBYyxrQkFBa0IsZ0JBQWdCLGFBQWEsZ0JBQWdCO0FBRXRGLE1BQU0seUJBQXlCLE1BQU07QUFDcEMsMENBQXdDO0FBRXhDLFFBQU0sWUFBWSxNQUFNO0FBQ3ZCLFNBQUssd0JBQXdCLE1BQU07QUFDbEMsc0JBQWdCLFNBQVMsNEJBQTRCLEdBQUcsQ0FBQyxPQUFPLFFBQVEsVUFBVSxZQUFZLENBQUM7QUFBQSxJQUNoRyxDQUFDO0FBQ0QsU0FBSywwQkFBMEIsTUFBTTtBQUNwQyxzQkFBZ0IsU0FBUyxtQkFBbUIsR0FBRyxDQUFDLFFBQVEsU0FBUyxNQUFNLENBQUM7QUFBQSxJQUN6RSxDQUFDO0FBQ0QsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxzQkFBZ0IsU0FBUyxvQkFBb0IsR0FBRyxDQUFDLFFBQVEsU0FBUyxDQUFDO0FBQUEsSUFDcEUsQ0FBQztBQUNELFNBQUssNkNBQTZDLE1BQU07QUFDdkQsc0JBQWdCLFNBQVMsbUJBQW1CLEdBQUcsQ0FBQyxPQUFPLGFBQWEsQ0FBQztBQUFBLElBQ3RFLENBQUM7QUFD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
