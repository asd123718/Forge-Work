import assert from "assert";
import { basename, dirname, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { AhpJsonlLogger, getAhpLogByteLength, stringifyAhpLogEntry } from "../../common/ahpJsonlLogger.js";
suite("AhpJsonlLogger", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("writes canonical JSON-RPC JSONL with metadata at the root", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    store.add(fileService.registerProvider("file", store.add(new InMemoryFileSystemProvider())));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "conn:1", transport: "websocket" },
      fileService,
      new NullLogService()
    ));
    const requestText = '{"jsonrpc":"2.0","id":"request-1","method":"initialize","params":{"protocolVersion":1}}';
    const uri = URI.parse("ahp-session:/session-1");
    logger.log(JSON.parse(requestText), "c2s", getAhpLogByteLength(requestText));
    logger.log({ jsonrpc: "2.0", id: 2, result: { ok: true } }, "s2c");
    logger.log({ jsonrpc: "2.0", id: null, error: { code: -32e3, message: "Nope" } }, "s2c");
    logger.log({ jsonrpc: "2.0", method: "notification", params: { uri } }, "s2c");
    await logger.flush();
    const content = (await fileService.readFile(logger.resource)).value.toString();
    const lines = content.split("\n").filter(Boolean);
    const parsed = lines.map((line) => JSON.parse(line));
    assert.deepStrictEqual(parsed.map((entry) => ({
      jsonrpc: entry.jsonrpc,
      id: entry.id,
      method: entry.method,
      hasResult: Object.hasOwn(entry, "result"),
      hasError: Object.hasOwn(entry, "error"),
      params: entry.params,
      log: entry._ahpLog
    })), [
      {
        jsonrpc: "2.0",
        id: "request-1",
        method: "initialize",
        hasResult: false,
        hasError: false,
        params: { protocolVersion: 1 },
        log: {
          ts: parsed[0]._ahpLog.ts,
          dir: "c2s",
          connectionId: "conn:1",
          transport: "websocket",
          byteLength: getAhpLogByteLength(requestText)
        }
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: void 0,
        hasResult: true,
        hasError: false,
        params: void 0,
        log: {
          ts: parsed[1]._ahpLog.ts,
          dir: "s2c",
          connectionId: "conn:1",
          transport: "websocket"
        }
      },
      {
        jsonrpc: "2.0",
        id: null,
        method: void 0,
        hasResult: false,
        hasError: true,
        params: void 0,
        log: {
          ts: parsed[2]._ahpLog.ts,
          dir: "s2c",
          connectionId: "conn:1",
          transport: "websocket"
        }
      },
      {
        jsonrpc: "2.0",
        id: void 0,
        method: "notification",
        hasResult: false,
        hasError: false,
        params: { uri: uri.toString() },
        log: {
          ts: parsed[3]._ahpLog.ts,
          dir: "s2c",
          connectionId: "conn:1",
          transport: "websocket"
        }
      }
    ]);
    for (const entry of parsed) {
      assert.strictEqual(entry.jsonrpc, "2.0");
      assert.ok(entry.method !== void 0 || entry.id !== void 0 && (Object.hasOwn(entry, "result") || Object.hasOwn(entry, "error")));
    }
  });
  test("rotates JSONL files and keeps bounded history", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    store.add(fileService.registerProvider("file", store.add(new InMemoryFileSystemProvider())));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "rotating", transport: "websocket", maxFileSizeBytes: 1, maxFiles: 2 },
      fileService,
      new NullLogService()
    ));
    const firstResource = logger.resource;
    const currentBaseName = basename(firstResource, ".jsonl");
    const rotated1 = joinPath(dirname(firstResource), `${currentBaseName}.1.jsonl`);
    const rotated2 = joinPath(dirname(firstResource), `${currentBaseName}.2.jsonl`);
    logger.log({ jsonrpc: "2.0", id: 1, result: "one" }, "s2c");
    logger.log({ jsonrpc: "2.0", id: 2, result: "two" }, "s2c");
    logger.log({ jsonrpc: "2.0", id: 3, result: "three" }, "s2c");
    await logger.flush();
    const lines = [
      ...(await fileService.readFile(rotated1)).value.toString().split("\n").filter(Boolean),
      ...(await fileService.readFile(rotated2)).value.toString().split("\n").filter(Boolean)
    ];
    const parsed = lines.map((line) => JSON.parse(line));
    assert.deepStrictEqual({
      firstFileExists: await fileService.exists(firstResource),
      ids: parsed.map((entry) => entry.id),
      rootsAreJsonRpc: parsed.every((entry) => entry.jsonrpc === "2.0" && (entry.method !== void 0 || entry.id !== void 0 && (Object.hasOwn(entry, "result") || Object.hasOwn(entry, "error"))))
    }, {
      firstFileExists: false,
      ids: [2, 3],
      rootsAreJsonRpc: true
    });
  });
  test("coalesces synchronously queued log calls into a single write", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    const provider = store.add(new RecordingInMemoryFileSystemProvider());
    store.add(fileService.registerProvider("file", provider));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "batched", transport: "websocket" },
      fileService,
      new NullLogService()
    ));
    const messageCount = 50;
    for (let i = 0; i < messageCount; i++) {
      logger.log({ jsonrpc: "2.0", id: i, result: { ok: true } }, "s2c");
    }
    await logger.flush();
    const content = (await fileService.readFile(logger.resource)).value.toString();
    const lines = content.split("\n").filter(Boolean);
    const ids = lines.map((line) => JSON.parse(line).id);
    assert.deepStrictEqual({
      lineCount: lines.length,
      idsInOrder: ids,
      writeCount: provider.writeCount
    }, {
      lineCount: messageCount,
      idsInOrder: Array.from({ length: messageCount }, (_, i) => i),
      writeCount: 1
    });
  });
  test("flush waits for batched writes and ordering is preserved across drains", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    store.add(fileService.registerProvider("file", store.add(new InMemoryFileSystemProvider())));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "flush-order", transport: "websocket" },
      fileService,
      new NullLogService()
    ));
    logger.log({ jsonrpc: "2.0", id: 1, result: "a" }, "s2c");
    logger.log({ jsonrpc: "2.0", id: 2, result: "b" }, "s2c");
    const firstFlush = logger.flush();
    logger.log({ jsonrpc: "2.0", id: 3, result: "c" }, "s2c");
    await firstFlush;
    logger.log({ jsonrpc: "2.0", id: 4, result: "d" }, "s2c");
    await logger.flush();
    const content = (await fileService.readFile(logger.resource)).value.toString();
    const ids = content.split("\n").filter(Boolean).map((line) => JSON.parse(line).id);
    assert.deepStrictEqual(ids, [1, 2, 3, 4]);
  });
  test("elides oversized string payloads while keeping the line valid JSONL", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    store.add(fileService.registerProvider("file", store.add(new InMemoryFileSystemProvider())));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "conn:1", transport: "websocket" },
      fileService,
      new NullLogService()
    ));
    logger.log({ jsonrpc: "2.0", id: 1, method: "ping" }, "c2s");
    const huge = "x".repeat(4 * 1024 * 1024);
    logger.log({ jsonrpc: "2.0", id: 2, result: { data: huge } }, "s2c");
    await logger.flush();
    const content = (await fileService.readFile(logger.resource)).value.toString();
    const lines = content.split("\n").filter(Boolean);
    const parsed = lines.map((line) => JSON.parse(line));
    assert.strictEqual(parsed[0]._ahpLog.truncated, void 0);
    assert.strictEqual(parsed[1]._ahpLog.truncated, true);
    assert.ok(parsed[1].result.data.length < huge.length);
    assert.ok(parsed[1].result.data.includes("chars elided"));
    assert.ok(lines[1].length < 1024 * 1024);
  });
  suite("stringifyAhpLogEntry", () => {
    test("serialises a top-level URI as its string form", () => {
      const uri = URI.parse("file:///tmp/example.txt");
      const result = JSON.parse(stringifyAhpLogEntry({ uri }));
      assert.strictEqual(result.uri, uri.toString());
    });
    test("serialises URIs nested in arrays and objects", () => {
      const a = URI.parse("file:///a");
      const b = URI.parse("https://example.com/b?x=1");
      const c = URI.parse("untitled:Untitled-1");
      const payload = {
        items: [a, { nested: b }, [c]]
      };
      const result = JSON.parse(stringifyAhpLogEntry(payload));
      assert.deepStrictEqual(result, {
        items: [a.toString(), { nested: b.toString() }, [c.toString()]]
      });
    });
    test("round-trips raw UriComponents marked with $mid", () => {
      const uri = URI.parse("vscode://example/path");
      const components = uri.toJSON();
      const result = JSON.parse(stringifyAhpLogEntry({ uri: components }));
      assert.strictEqual(result.uri, uri.toString());
    });
    test("leaves URI-shaped objects without $mid as plain objects", () => {
      const payload = {
        scheme: "not-a-uri",
        path: "/something"
      };
      const result = JSON.parse(stringifyAhpLogEntry(payload));
      assert.deepStrictEqual(result, payload);
    });
    test("does not misidentify non-URI objects that carry $mid: 1", () => {
      const payload = { $mid: 1, label: "not a uri" };
      const result = JSON.parse(stringifyAhpLogEntry(payload));
      assert.deepStrictEqual(result, payload);
    });
  });
});
class RecordingInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
  constructor() {
    super(...arguments);
    this.writeCount = 0;
  }
  async writeFile(resource, content, opts) {
    this.writeCount++;
    return super.writeFile(resource, content, opts);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGFocEpzb25sTG9nZ2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVXcml0ZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBaHBKc29ubExvZ2dlciwgZ2V0QWhwTG9nQnl0ZUxlbmd0aCwgc3RyaW5naWZ5QWhwTG9nRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYWhwSnNvbmxMb2dnZXIuanMnO1xuXG5zdWl0ZSgnQWhwSnNvbmxMb2dnZXInLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd3cml0ZXMgY2Fub25pY2FsIEpTT04tUlBDIEpTT05MIHdpdGggbWV0YWRhdGEgYXQgdGhlIHJvb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0c3RvcmUuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cblx0XHRjb25zdCBsb2dnZXIgPSBzdG9yZS5hZGQobmV3IEFocEpzb25sTG9nZ2VyKFxuXHRcdFx0eyBsb2dzSG9tZTogVVJJLmZpbGUoJy9sb2dzJyksIGNvbm5lY3Rpb25JZDogJ2Nvbm46MScsIHRyYW5zcG9ydDogJ3dlYnNvY2tldCcgfSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXF1ZXN0VGV4dCA9ICd7XCJqc29ucnBjXCI6XCIyLjBcIixcImlkXCI6XCJyZXF1ZXN0LTFcIixcIm1ldGhvZFwiOlwiaW5pdGlhbGl6ZVwiLFwicGFyYW1zXCI6e1wicHJvdG9jb2xWZXJzaW9uXCI6MX19Jztcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2FocC1zZXNzaW9uOi9zZXNzaW9uLTEnKTtcblx0XHRsb2dnZXIubG9nKEpTT04ucGFyc2UocmVxdWVzdFRleHQpLCAnYzJzJywgZ2V0QWhwTG9nQnl0ZUxlbmd0aChyZXF1ZXN0VGV4dCkpO1xuXHRcdGxvZ2dlci5sb2coeyBqc29ucnBjOiAnMi4wJywgaWQ6IDIsIHJlc3VsdDogeyBvazogdHJ1ZSB9IH0sICdzMmMnKTtcblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiBudWxsLCBlcnJvcjogeyBjb2RlOiAtMzIwMDAsIG1lc3NhZ2U6ICdOb3BlJyB9IH0sICdzMmMnKTtcblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ25vdGlmaWNhdGlvbicsIHBhcmFtczogeyB1cmkgfSB9LCAnczJjJyk7XG5cdFx0YXdhaXQgbG9nZ2VyLmZsdXNoKCk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGxvZ2dlci5yZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKS5maWx0ZXIoQm9vbGVhbik7XG5cdFx0Y29uc3QgcGFyc2VkID0gbGluZXMubWFwKGxpbmUgPT4gSlNPTi5wYXJzZShsaW5lKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5tYXAoZW50cnkgPT4gKHtcblx0XHRcdGpzb25ycGM6IGVudHJ5Lmpzb25ycGMsXG5cdFx0XHRpZDogZW50cnkuaWQsXG5cdFx0XHRtZXRob2Q6IGVudHJ5Lm1ldGhvZCxcblx0XHRcdGhhc1Jlc3VsdDogT2JqZWN0Lmhhc093bihlbnRyeSwgJ3Jlc3VsdCcpLFxuXHRcdFx0aGFzRXJyb3I6IE9iamVjdC5oYXNPd24oZW50cnksICdlcnJvcicpLFxuXHRcdFx0cGFyYW1zOiBlbnRyeS5wYXJhbXMsXG5cdFx0XHRsb2c6IGVudHJ5Ll9haHBMb2csXG5cdFx0fSkpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRcdG1ldGhvZDogJ2luaXRpYWxpemUnLFxuXHRcdFx0XHRoYXNSZXN1bHQ6IGZhbHNlLFxuXHRcdFx0XHRoYXNFcnJvcjogZmFsc2UsXG5cdFx0XHRcdHBhcmFtczogeyBwcm90b2NvbFZlcnNpb246IDEgfSxcblx0XHRcdFx0bG9nOiB7XG5cdFx0XHRcdFx0dHM6IHBhcnNlZFswXS5fYWhwTG9nLnRzLFxuXHRcdFx0XHRcdGRpcjogJ2MycycsXG5cdFx0XHRcdFx0Y29ubmVjdGlvbklkOiAnY29ubjoxJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6ICd3ZWJzb2NrZXQnLFxuXHRcdFx0XHRcdGJ5dGVMZW5ndGg6IGdldEFocExvZ0J5dGVMZW5ndGgocmVxdWVzdFRleHQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiAyLFxuXHRcdFx0XHRtZXRob2Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0aGFzUmVzdWx0OiB0cnVlLFxuXHRcdFx0XHRoYXNFcnJvcjogZmFsc2UsXG5cdFx0XHRcdHBhcmFtczogdW5kZWZpbmVkLFxuXHRcdFx0XHRsb2c6IHtcblx0XHRcdFx0XHR0czogcGFyc2VkWzFdLl9haHBMb2cudHMsXG5cdFx0XHRcdFx0ZGlyOiAnczJjJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uSWQ6ICdjb25uOjEnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogJ3dlYnNvY2tldCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IG51bGwsXG5cdFx0XHRcdG1ldGhvZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRoYXNSZXN1bHQ6IGZhbHNlLFxuXHRcdFx0XHRoYXNFcnJvcjogdHJ1ZSxcblx0XHRcdFx0cGFyYW1zOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxvZzoge1xuXHRcdFx0XHRcdHRzOiBwYXJzZWRbMl0uX2FocExvZy50cyxcblx0XHRcdFx0XHRkaXI6ICdzMmMnLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb25JZDogJ2Nvbm46MScsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiAnd2Vic29ja2V0Jyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtZXRob2Q6ICdub3RpZmljYXRpb24nLFxuXHRcdFx0XHRoYXNSZXN1bHQ6IGZhbHNlLFxuXHRcdFx0XHRoYXNFcnJvcjogZmFsc2UsXG5cdFx0XHRcdHBhcmFtczogeyB1cmk6IHVyaS50b1N0cmluZygpIH0sXG5cdFx0XHRcdGxvZzoge1xuXHRcdFx0XHRcdHRzOiBwYXJzZWRbM10uX2FocExvZy50cyxcblx0XHRcdFx0XHRkaXI6ICdzMmMnLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb25JZDogJ2Nvbm46MScsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiAnd2Vic29ja2V0Jyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHBhcnNlZCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmpzb25ycGMsICcyLjAnKTtcblx0XHRcdGFzc2VydC5vayhlbnRyeS5tZXRob2QgIT09IHVuZGVmaW5lZCB8fCAoZW50cnkuaWQgIT09IHVuZGVmaW5lZCAmJiAoT2JqZWN0Lmhhc093bihlbnRyeSwgJ3Jlc3VsdCcpIHx8IE9iamVjdC5oYXNPd24oZW50cnksICdlcnJvcicpKSkpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncm90YXRlcyBKU09OTCBmaWxlcyBhbmQga2VlcHMgYm91bmRlZCBoaXN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0Y29uc3QgbG9nZ2VyID0gc3RvcmUuYWRkKG5ldyBBaHBKc29ubExvZ2dlcihcblx0XHRcdHsgbG9nc0hvbWU6IFVSSS5maWxlKCcvbG9ncycpLCBjb25uZWN0aW9uSWQ6ICdyb3RhdGluZycsIHRyYW5zcG9ydDogJ3dlYnNvY2tldCcsIG1heEZpbGVTaXplQnl0ZXM6IDEsIG1heEZpbGVzOiAyIH0sXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXHRcdGNvbnN0IGZpcnN0UmVzb3VyY2UgPSBsb2dnZXIucmVzb3VyY2U7XG5cdFx0Y29uc3QgY3VycmVudEJhc2VOYW1lID0gYmFzZW5hbWUoZmlyc3RSZXNvdXJjZSwgJy5qc29ubCcpO1xuXHRcdGNvbnN0IHJvdGF0ZWQxID0gam9pblBhdGgoZGlybmFtZShmaXJzdFJlc291cmNlKSwgYCR7Y3VycmVudEJhc2VOYW1lfS4xLmpzb25sYCk7XG5cdFx0Y29uc3Qgcm90YXRlZDIgPSBqb2luUGF0aChkaXJuYW1lKGZpcnN0UmVzb3VyY2UpLCBgJHtjdXJyZW50QmFzZU5hbWV9LjIuanNvbmxgKTtcblxuXHRcdGxvZ2dlci5sb2coeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogJ29uZScgfSwgJ3MyYycpO1xuXHRcdGxvZ2dlci5sb2coeyBqc29ucnBjOiAnMi4wJywgaWQ6IDIsIHJlc3VsdDogJ3R3bycgfSwgJ3MyYycpO1xuXHRcdGxvZ2dlci5sb2coeyBqc29ucnBjOiAnMi4wJywgaWQ6IDMsIHJlc3VsdDogJ3RocmVlJyB9LCAnczJjJyk7XG5cdFx0YXdhaXQgbG9nZ2VyLmZsdXNoKCk7XG5cblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHRcdC4uLihhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShyb3RhdGVkMSkpLnZhbHVlLnRvU3RyaW5nKCkuc3BsaXQoJ1xcbicpLmZpbHRlcihCb29sZWFuKSxcblx0XHRcdC4uLihhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShyb3RhdGVkMikpLnZhbHVlLnRvU3RyaW5nKCkuc3BsaXQoJ1xcbicpLmZpbHRlcihCb29sZWFuKSxcblx0XHRdO1xuXHRcdGNvbnN0IHBhcnNlZCA9IGxpbmVzLm1hcChsaW5lID0+IEpTT04ucGFyc2UobGluZSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaXJzdEZpbGVFeGlzdHM6IGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhmaXJzdFJlc291cmNlKSxcblx0XHRcdGlkczogcGFyc2VkLm1hcChlbnRyeSA9PiBlbnRyeS5pZCksXG5cdFx0XHRyb290c0FyZUpzb25ScGM6IHBhcnNlZC5ldmVyeShlbnRyeSA9PiBlbnRyeS5qc29ucnBjID09PSAnMi4wJyAmJiAoZW50cnkubWV0aG9kICE9PSB1bmRlZmluZWQgfHwgKGVudHJ5LmlkICE9PSB1bmRlZmluZWQgJiYgKE9iamVjdC5oYXNPd24oZW50cnksICdyZXN1bHQnKSB8fCBPYmplY3QuaGFzT3duKGVudHJ5LCAnZXJyb3InKSkpKSksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3RGaWxlRXhpc3RzOiBmYWxzZSxcblx0XHRcdGlkczogWzIsIDNdLFxuXHRcdFx0cm9vdHNBcmVKc29uUnBjOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2FsZXNjZXMgc3luY2hyb25vdXNseSBxdWV1ZWQgbG9nIGNhbGxzIGludG8gYSBzaW5nbGUgd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IFJlY29yZGluZ0luTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgcHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IGxvZ2dlciA9IHN0b3JlLmFkZChuZXcgQWhwSnNvbmxMb2dnZXIoXG5cdFx0XHR7IGxvZ3NIb21lOiBVUkkuZmlsZSgnL2xvZ3MnKSwgY29ubmVjdGlvbklkOiAnYmF0Y2hlZCcsIHRyYW5zcG9ydDogJ3dlYnNvY2tldCcgfSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBtZXNzYWdlQ291bnQgPSA1MDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1lc3NhZ2VDb3VudDsgaSsrKSB7XG5cdFx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiBpLCByZXN1bHQ6IHsgb2s6IHRydWUgfSB9LCAnczJjJyk7XG5cdFx0fVxuXHRcdGF3YWl0IGxvZ2dlci5mbHVzaCgpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShsb2dnZXIucmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdGNvbnN0IGlkcyA9IGxpbmVzLm1hcChsaW5lID0+IEpTT04ucGFyc2UobGluZSkuaWQpO1xuXG5cdFx0Ly8gQWxsIDUwIGxvZygpIGNhbGxzIGFyZSBxdWV1ZWQgc3luY2hyb25vdXNseSwgc28gdGhleSBhbGwgbGFuZCBpbiB0aGVcblx0XHQvLyBmaXJzdCBkcmFpbiBhbmQgbXVzdCBiZSBjb2FsZXNjZWQgaW50byBleGFjdGx5IG9uZSB3cml0ZUZpbGUuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsaW5lQ291bnQ6IGxpbmVzLmxlbmd0aCxcblx0XHRcdGlkc0luT3JkZXI6IGlkcyxcblx0XHRcdHdyaXRlQ291bnQ6IHByb3ZpZGVyLndyaXRlQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0bGluZUNvdW50OiBtZXNzYWdlQ291bnQsXG5cdFx0XHRpZHNJbk9yZGVyOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiBtZXNzYWdlQ291bnQgfSwgKF8sIGkpID0+IGkpLFxuXHRcdFx0d3JpdGVDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmx1c2ggd2FpdHMgZm9yIGJhdGNoZWQgd3JpdGVzIGFuZCBvcmRlcmluZyBpcyBwcmVzZXJ2ZWQgYWNyb3NzIGRyYWlucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblxuXHRcdGNvbnN0IGxvZ2dlciA9IHN0b3JlLmFkZChuZXcgQWhwSnNvbmxMb2dnZXIoXG5cdFx0XHR7IGxvZ3NIb21lOiBVUkkuZmlsZSgnL2xvZ3MnKSwgY29ubmVjdGlvbklkOiAnZmx1c2gtb3JkZXInLCB0cmFuc3BvcnQ6ICd3ZWJzb2NrZXQnIH0sXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gU3VibWl0IGEgYmF0Y2gsIHBhcnRpYWxseSBmbHVzaCwgdGhlbiBzdWJtaXQgYW5vdGhlciBiYXRjaCBpbnRlcmxlYXZlZFxuXHRcdC8vIHdpdGggdGhlIGZsdXNoIFx1MjAxNCBvcmRlcmluZyBtdXN0IGJlIHByZXNlcnZlZC5cblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6ICdhJyB9LCAnczJjJyk7XG5cdFx0bG9nZ2VyLmxvZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMiwgcmVzdWx0OiAnYicgfSwgJ3MyYycpO1xuXHRcdGNvbnN0IGZpcnN0Rmx1c2ggPSBsb2dnZXIuZmx1c2goKTtcblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiAzLCByZXN1bHQ6ICdjJyB9LCAnczJjJyk7XG5cdFx0YXdhaXQgZmlyc3RGbHVzaDtcblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiA0LCByZXN1bHQ6ICdkJyB9LCAnczJjJyk7XG5cdFx0YXdhaXQgbG9nZ2VyLmZsdXNoKCk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGxvZ2dlci5yZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgaWRzID0gY29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKEJvb2xlYW4pLm1hcChsaW5lID0+IEpTT04ucGFyc2UobGluZSkuaWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaWRzLCBbMSwgMiwgMywgNF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGlkZXMgb3ZlcnNpemVkIHN0cmluZyBwYXlsb2FkcyB3aGlsZSBrZWVwaW5nIHRoZSBsaW5lIHZhbGlkIEpTT05MJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0Y29uc3QgbG9nZ2VyID0gc3RvcmUuYWRkKG5ldyBBaHBKc29ubExvZ2dlcihcblx0XHRcdHsgbG9nc0hvbWU6IFVSSS5maWxlKCcvbG9ncycpLCBjb25uZWN0aW9uSWQ6ICdjb25uOjEnLCB0cmFuc3BvcnQ6ICd3ZWJzb2NrZXQnIH0sXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gQSBub3JtYWwgc21hbGwgbWVzc2FnZSBpcyB3cml0dGVuIHZlcmJhdGltIGFuZCBpcyBub3QgbWFya2VkIHRydW5jYXRlZC5cblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBtZXRob2Q6ICdwaW5nJyB9LCAnYzJzJyk7XG5cdFx0Ly8gQSBtZXNzYWdlIGNhcnJ5aW5nIGEgbXVsdGktTUIgc3RyaW5nIChlLmcuIGEgYmFzZTY0IHJlc291cmNlUmVhZCkgaXMgdHJpbW1lZC5cblx0XHRjb25zdCBodWdlID0gJ3gnLnJlcGVhdCg0ICogMTAyNCAqIDEwMjQpO1xuXHRcdGxvZ2dlci5sb2coeyBqc29ucnBjOiAnMi4wJywgaWQ6IDIsIHJlc3VsdDogeyBkYXRhOiBodWdlIH0gfSwgJ3MyYycpO1xuXHRcdGF3YWl0IGxvZ2dlci5mbHVzaCgpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShsb2dnZXIucmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdC8vIEJvdGggbGluZXMgbXVzdCBiZSB2YWxpZCBKU09OICh0aGUgdHJpbW1lZCBsaW5lIHN0YXlzIHdlbGwtZm9ybWVkIEpTT05MKS5cblx0XHRjb25zdCBwYXJzZWQgPSBsaW5lcy5tYXAobGluZSA9PiBKU09OLnBhcnNlKGxpbmUpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRbMF0uX2FocExvZy50cnVuY2F0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFsxXS5fYWhwTG9nLnRydW5jYXRlZCwgdHJ1ZSk7XG5cdFx0Ly8gVGhlIGh1Z2Ugc3RyaW5nIHdhcyBlbGlkZWQgcmF0aGVyIHRoYW4gd3JpdHRlbiBpbiBmdWxsLlxuXHRcdGFzc2VydC5vayhwYXJzZWRbMV0ucmVzdWx0LmRhdGEubGVuZ3RoIDwgaHVnZS5sZW5ndGgpO1xuXHRcdGFzc2VydC5vayhwYXJzZWRbMV0ucmVzdWx0LmRhdGEuaW5jbHVkZXMoJ2NoYXJzIGVsaWRlZCcpKTtcblx0XHQvLyBUaGUgd2hvbGUgc2VyaWFsaXplZCBsaW5lIHN0YXlzIG1vZGVzdCBpbiBzaXplLlxuXHRcdGFzc2VydC5vayhsaW5lc1sxXS5sZW5ndGggPCAxMDI0ICogMTAyNCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzdHJpbmdpZnlBaHBMb2dFbnRyeScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NlcmlhbGlzZXMgYSB0b3AtbGV2ZWwgVVJJIGFzIGl0cyBzdHJpbmcgZm9ybScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90bXAvZXhhbXBsZS50eHQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2Uoc3RyaW5naWZ5QWhwTG9nRW50cnkoeyB1cmkgfSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC51cmksIHVyaS50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcmlhbGlzZXMgVVJJcyBuZXN0ZWQgaW4gYXJyYXlzIGFuZCBvYmplY3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9IFVSSS5wYXJzZSgnZmlsZTovLy9hJyk7XG5cdFx0XHRjb25zdCBiID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL2I/eD0xJyk7XG5cdFx0XHRjb25zdCBjID0gVVJJLnBhcnNlKCd1bnRpdGxlZDpVbnRpdGxlZC0xJyk7XG5cdFx0XHRjb25zdCBwYXlsb2FkID0ge1xuXHRcdFx0XHRpdGVtczogW2EsIHsgbmVzdGVkOiBiIH0sIFtjXV0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZShzdHJpbmdpZnlBaHBMb2dFbnRyeShwYXlsb2FkKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRpdGVtczogW2EudG9TdHJpbmcoKSwgeyBuZXN0ZWQ6IGIudG9TdHJpbmcoKSB9LCBbYy50b1N0cmluZygpXV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvdW5kLXRyaXBzIHJhdyBVcmlDb21wb25lbnRzIG1hcmtlZCB3aXRoICRtaWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3ZzY29kZTovL2V4YW1wbGUvcGF0aCcpO1xuXHRcdFx0Y29uc3QgY29tcG9uZW50cyA9IHVyaS50b0pTT04oKTtcblx0XHRcdC8vIFNpbXVsYXRlIGEgdmFsdWUgdGhhdCBjYW1lIGJhY2sgb3ZlciBJUEMgYW5kIHdhcyBuZXZlciByZXZpdmVkXG5cdFx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHN0cmluZ2lmeUFocExvZ0VudHJ5KHsgdXJpOiBjb21wb25lbnRzIH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudXJpLCB1cmkudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgVVJJLXNoYXBlZCBvYmplY3RzIHdpdGhvdXQgJG1pZCBhcyBwbGFpbiBvYmplY3RzJywgKCkgPT4ge1xuXHRcdFx0Ly8gQSB1c2VyIHBheWxvYWQgdGhhdCBoYXBwZW5zIHRvIGhhdmUgVVJJLWxpa2UgZmllbGRzIGJ1dCBpcyBub3QgYVxuXHRcdFx0Ly8gVVJJIG11c3Qgbm90IGJlIHNpbGVudGx5IHJld3JpdHRlbi5cblx0XHRcdGNvbnN0IHBheWxvYWQgPSB7XG5cdFx0XHRcdHNjaGVtZTogJ25vdC1hLXVyaScsXG5cdFx0XHRcdHBhdGg6ICcvc29tZXRoaW5nJyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHN0cmluZ2lmeUFocExvZ0VudHJ5KHBheWxvYWQpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBwYXlsb2FkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG1pc2lkZW50aWZ5IG5vbi1VUkkgb2JqZWN0cyB0aGF0IGNhcnJ5ICRtaWQ6IDEnLCAoKSA9PiB7XG5cdFx0XHQvLyAkbWlkIGlzIG9ubHkgc2FmZWx5IGEgVVJJIG1hcmtlciB3aGVuIHRoZSBvYmplY3QgYWxzbyBoYXMgdGhlXG5cdFx0XHQvLyBVcmlDb21wb25lbnRzIHNoYXBlIChzY2hlbWU6IHN0cmluZykuIE5vbi1jb25mb3JtaW5nIHBheWxvYWRzXG5cdFx0XHQvLyBtdXN0IHBhc3MgdGhyb3VnaCB1bmNoYW5nZWQuXG5cdFx0XHRjb25zdCBwYXlsb2FkID0geyAkbWlkOiAxLCBsYWJlbDogJ25vdCBhIHVyaScgfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2Uoc3RyaW5naWZ5QWhwTG9nRW50cnkocGF5bG9hZCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHBheWxvYWQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBSZWNvcmRpbmdJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciBleHRlbmRzIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0d3JpdGVDb3VudCA9IDA7XG5cdG92ZXJyaWRlIGFzeW5jIHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBjb250ZW50OiBVaW50OEFycmF5LCBvcHRzOiBJRmlsZVdyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMud3JpdGVDb3VudCsrO1xuXHRcdHJldHVybiBzdXBlci53cml0ZUZpbGUocmVzb3VyY2UsIGNvbnRlbnQsIG9wdHMpO1xuXHR9XG59XG4iXSwKICAibWFwcGlu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QU8sS0FBSyxJQUFJLFNBQVMsQ0FBQztBQUFBLElBQzlDLENBQUM7QUFFRCxTQUFLLGdEQUFnRCxNQUFNO0FBQzFELFlBQU0sSUFBSSxJQUFJLE1BQU0sV0FBVztBQUMvQixZQUFNLElBQUksSUFBSSxNQUFNLDJCQUEyQjtBQUMvQyxZQUFNLElBQUksSUFBSSxNQUFNLHFCQUFxQjtBQUN6QyxZQUFNLFVBQVU7QUFBQSxRQUNmLE9BQU8sQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUM5QjtBQUNBLFlBQU0sU0FBUyxLQUFLLE1BQU0scUJBQXFCLE9BQU8sQ0FBQztBQUN2RCxhQUFPLGdCQUFnQixRQUFRO0FBQUEsUUFDOUIsT0FBTyxDQUFDLEVBQUUsU0FBUyxHQUFHLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxHQUFHLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUFBLE1BQy9ELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGtEQUFrRCxNQUFNO0FBQzVELFlBQU0sTUFBTSxJQUFJLE1BQU0sdUJBQXVCO0FBQzdDLFlBQU0sYUFBYSxJQUFJLE9BQU87QUFFOUIsWUFBTSxTQUFTLEtBQUssTUFBTSxxQkFBcUIsRUFBRSxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQ25FLGFBQU8sWUFBWSxPQUFPLEtBQUssSUFBSSxTQUFTLENBQUM7QUFBQSxJQUM5QyxDQUFDO0FBRUQsU0FBSywyREFBMkQsTUFBTTtBQUdyRSxZQUFNLFVBQVU7QUFBQSxRQUNmLFFBQVE7QUFBQSxRQUNSLE1BQU07QUFBQSxNQUNQO0FBQ0EsWUFBTSxTQUFTLEtBQUssTUFBTSxxQkFBcUIsT0FBTyxDQUFDO0FBQ3ZELGFBQU8sZ0JBQWdCLFFBQVEsT0FBTztBQUFBLElBQ3ZDLENBQUM7QUFFRCxTQUFLLDJEQUEyRCxNQUFNO0FBSXJFLFlBQU0sVUFBVSxFQUFFLE1BQU0sR0FBRyxPQUFPLFlBQVk7QUFDOUMsWUFBTSxTQUFTLEtBQUssTUFBTSxxQkFBcUIsT0FBTyxDQUFDO0FBQ3ZELGFBQU8sZ0JBQWdCLFFBQVEsT0FBTztBQUFBLElBQ3ZDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSw0Q0FBNEMsMkJBQTJCO0FBQUEsRUFBN0U7QUFBQTtBQUNDLHNCQUFhO0FBQUE7QUFBQSxFQUNiLE1BQWUsVUFBVSxVQUFlLFNBQXFCLE1BQXdDO0FBQ3BHLFNBQUs7QUFDTCxXQUFPLE1BQU0sVUFBVSxVQUFVLFNBQVMsSUFBSTtBQUFBLEVBQy9DO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
