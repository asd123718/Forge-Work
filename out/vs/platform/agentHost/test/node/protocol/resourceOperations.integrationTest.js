import assert from "assert";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
import { ContentEncoding, ResourceType, ResourceWriteMode } from "../../../common/state/protocol/common/commands.js";
import { PROTOCOL_VERSION } from "../../../common/state/protocol/version/registry.js";
import { ROOT_STATE_URI } from "../../../common/state/sessionState.js";
import { getActionEnvelope, getAgentHostE2ETestTimeout, isActionNotification, startServer, stopServer, TestProtocolClient } from "../serverIntegrationTestHelpers.js";
suite("Protocol WebSocket - Resource Operations", function() {
  let server;
  let client;
  const secondaryClients = [];
  let testDirectory;
  let clientCounter = 0;
  suiteSetup(async function() {
    this.timeout(getAgentHostE2ETestTimeout(35e3, 6e4));
    server = await startServer({ startupTimeoutMs: getAgentHostE2ETestTimeout(3e4, 5e4) });
  });
  suiteTeardown(async function() {
    this.timeout(getAgentHostE2ETestTimeout(2e4, 5e4));
    await stopServer(server);
  });
  setup(async function() {
    this.timeout(getAgentHostE2ETestTimeout(1e4, 3e4));
    testDirectory = mkdtempSync(join(tmpdir(), "agent-host-resource-"));
    client = new TestProtocolClient(server.port);
    await client.connect();
    await client.call("initialize", { protocolVersions: [PROTOCOL_VERSION], clientId: `resource-client-${++clientCounter}` });
  });
  teardown(function() {
    client.close();
    for (const secondaryClient of secondaryClients.splice(0)) {
      secondaryClient.close();
    }
    rmSync(testDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  function resource(name) {
    return URI.file(join(testDirectory, name)).toString();
  }
  async function write(uri, data, options) {
    await client.call("resourceWrite", {
      channel: ROOT_STATE_URI,
      uri,
      data,
      encoding: options?.encoding ?? ContentEncoding.Utf8,
      mode: options?.mode,
      position: options?.position,
      createOnly: options?.createOnly,
      ifMatch: options?.ifMatch
    });
  }
  async function read(uri) {
    const result = await client.call("resourceRead", { channel: ROOT_STATE_URI, uri });
    return result.data;
  }
  function isResourceWatchChangeFor(uri, notification) {
    if (!isActionNotification(notification, "resourceWatch/changed")) {
      return false;
    }
    const action = getActionEnvelope(notification).action;
    return action.changes.items.some((change) => change.uri === uri);
  }
  test("resourceMkdir creates nested directories and is idempotent", async function() {
    const directory = resource("one/two/three");
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    const resolved = await client.call("resourceResolve", { channel: ROOT_STATE_URI, uri: directory });
    assert.strictEqual(resolved.type, ResourceType.Directory);
  });
  test("resourceList returns file and directory entries", async function() {
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: resource("folder") });
    await write(resource("file.txt"), "content");
    const result = await client.call("resourceList", { channel: ROOT_STATE_URI, uri: URI.file(testDirectory).toString() });
    assert.deepStrictEqual(result.entries.sort((a, b) => a.name.localeCompare(b.name)), [
      { name: "file.txt", type: "file" },
      { name: "folder", type: "directory" }
    ]);
  });
  test("resourceWrite and resourceRead round-trip UTF-8 text", async function() {
    const file = resource("utf8.txt");
    await write(file, "hello world");
    assert.strictEqual(await read(file), "hello world");
  });
  test("resourceWrite decodes base64 input", async function() {
    const file = resource("base64.txt");
    await write(file, Buffer.from("base64 content").toString("base64"), { encoding: ContentEncoding.Base64 });
    assert.strictEqual(await read(file), "base64 content");
  });
  test("resourceWrite append adds data at EOF", async function() {
    const file = resource("append.txt");
    await write(file, "abc");
    await write(file, "def", { mode: ResourceWriteMode.Append });
    assert.strictEqual(await read(file), "abcdef");
  });
  test("resourceWrite append position inserts before trailing bytes", async function() {
    const file = resource("append-position.txt");
    await write(file, "abcdef");
    await write(file, "X", { mode: ResourceWriteMode.Append, position: 2 });
    assert.strictEqual(await read(file), "abcdXef");
  });
  test("resourceWrite insert splices data at a byte offset", async function() {
    const file = resource("insert.txt");
    await write(file, "abcdef");
    await write(file, "X", { mode: ResourceWriteMode.Insert, position: 3 });
    assert.strictEqual(await read(file), "abcXdef");
  });
  test("resourceWrite insert beyond EOF appends data", async function() {
    const file = resource("insert-beyond.txt");
    await write(file, "abc");
    await write(file, "X", { mode: ResourceWriteMode.Insert, position: 100 });
    assert.strictEqual(await read(file), "abcX");
  });
  test("resourceWrite append creates a missing file", async function() {
    const file = resource("append-create.txt");
    await write(file, "created", { mode: ResourceWriteMode.Append });
    assert.strictEqual(await read(file), "created");
  });
  test("resourceWrite insert creates a missing file", async function() {
    const file = resource("insert-create.txt");
    await write(file, "created", { mode: ResourceWriteMode.Insert, position: 3 });
    assert.strictEqual(await read(file), "created");
  });
  test("resourceWrite truncate position preserves the prefix", async function() {
    const file = resource("truncate-position.txt");
    await write(file, "abcdef");
    await write(file, "X", { mode: ResourceWriteMode.Truncate, position: 2 });
    assert.strictEqual(await read(file), "abX");
  });
  test("resourceWrite createOnly rejects an existing file", async function() {
    const file = resource("create-only.txt");
    await write(file, "first");
    await assert.rejects(() => write(file, "second", { createOnly: true }), /already exists/i);
    await assert.rejects(() => write(file, "second", { createOnly: true, mode: ResourceWriteMode.Append }), /already exists/i);
    await assert.rejects(() => write(file, "second", { createOnly: true, mode: ResourceWriteMode.Insert }), /already exists/i);
    assert.strictEqual(await read(file), "first");
    const concurrentFile = resource("create-only-concurrent.txt");
    const results = await Promise.allSettled([
      write(concurrentFile, "append", { createOnly: true, mode: ResourceWriteMode.Append }),
      write(concurrentFile, "insert", { createOnly: true, mode: ResourceWriteMode.Insert })
    ]);
    assert.deepStrictEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
    assert.ok(["append", "insert"].includes(await read(concurrentFile)));
  });
  test("resourceResolve returns file metadata and an etag", async function() {
    const file = resource("resolve-file.txt");
    await write(file, "hello");
    const result = await client.call("resourceResolve", { channel: ROOT_STATE_URI, uri: file });
    assert.deepStrictEqual({
      uri: result.uri,
      type: result.type,
      size: result.size,
      hasMtime: typeof result.mtime === "string",
      hasEtag: typeof result.etag === "string"
    }, {
      uri: file,
      type: ResourceType.File,
      size: 5,
      hasMtime: true,
      hasEtag: true
    });
  });
  test("resourceResolve returns directory metadata", async function() {
    const directory = resource("resolve-directory");
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    const result = await client.call("resourceResolve", { channel: ROOT_STATE_URI, uri: directory });
    assert.strictEqual(result.type, ResourceType.Directory);
  });
  test("resourceWrite accepts the current ifMatch etag", async function() {
    const file = resource("if-match.txt");
    await write(file, "first");
    const resolved = await client.call("resourceResolve", { channel: ROOT_STATE_URI, uri: file });
    assert.ok(resolved.etag);
    await write(file, "second", { ifMatch: resolved.etag });
    assert.strictEqual(await read(file), "second");
  });
  test("resourceWrite rejects a stale ifMatch etag", async function() {
    const file = resource("if-match-stale.txt");
    await write(file, "first");
    await assert.rejects(() => write(file, "second", { ifMatch: "stale-etag" }), /ifMatch precondition failed/i);
    assert.strictEqual(await read(file), "first");
  });
  test("resourceWrite rejects ifMatch for a missing file", async function() {
    const file = resource("if-match-missing.txt");
    await assert.rejects(() => write(file, "content", { ifMatch: "missing-etag" }), /ifMatch precondition failed/i);
  });
  test("resourceCopy copies a file", async function() {
    const source = resource("copy-source.txt");
    const destination = resource("copy-destination.txt");
    await write(source, "copied");
    await client.call("resourceCopy", { channel: ROOT_STATE_URI, source, destination });
    assert.strictEqual(await read(destination), "copied");
  });
  test("resourceCopy copies a directory recursively", async function() {
    const source = resource("copy-source-directory");
    const destination = resource("copy-destination-directory");
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: source });
    await write(URI.file(join(testDirectory, "copy-source-directory", "file.txt")).toString(), "copied");
    await client.call("resourceCopy", { channel: ROOT_STATE_URI, source, destination });
    assert.strictEqual(await read(URI.file(join(testDirectory, "copy-destination-directory", "file.txt")).toString()), "copied");
  });
  test("resourceCopy failIfExists preserves the destination", async function() {
    const source = resource("copy-existing-source.txt");
    const destination = resource("copy-existing-destination.txt");
    await write(source, "source");
    await write(destination, "destination");
    await assert.rejects(() => client.call("resourceCopy", { channel: ROOT_STATE_URI, source, destination, failIfExists: true }), /already exists/i);
    assert.strictEqual(await read(destination), "destination");
  });
  test("resourceCopy reports a missing source", async function() {
    await assert.rejects(() => client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: resource("missing-copy-source.txt"),
      destination: resource("copy-target.txt")
    }), /source not found/i);
  });
  test("resourceMove moves a file", async function() {
    const source = resource("move-source.txt");
    const destination = resource("move-destination.txt");
    await write(source, "moved");
    await client.call("resourceMove", { channel: ROOT_STATE_URI, source, destination });
    assert.strictEqual(await read(destination), "moved");
    await assert.rejects(() => read(source), /content not found/i);
  });
  test("resourceMove moves a directory recursively", async function() {
    const source = resource("move-source-directory");
    const destination = resource("move-destination-directory");
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: source });
    await write(URI.file(join(testDirectory, "move-source-directory", "file.txt")).toString(), "moved");
    await client.call("resourceMove", { channel: ROOT_STATE_URI, source, destination });
    assert.strictEqual(await read(URI.file(join(testDirectory, "move-destination-directory", "file.txt")).toString()), "moved");
  });
  test("resourceMove failIfExists preserves both files", async function() {
    const source = resource("move-existing-source.txt");
    const destination = resource("move-existing-destination.txt");
    await write(source, "source");
    await write(destination, "destination");
    await assert.rejects(() => client.call("resourceMove", { channel: ROOT_STATE_URI, source, destination, failIfExists: true }), /already exists/i);
    assert.deepStrictEqual([await read(source), await read(destination)], ["source", "destination"]);
  });
  test("resourceMove reports a missing source", async function() {
    await assert.rejects(() => client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: resource("missing-move-source.txt"),
      destination: resource("move-target.txt")
    }), /source not found/i);
  });
  test("resourceDelete removes a file", async function() {
    const file = resource("delete.txt");
    await write(file, "delete me");
    await client.call("resourceDelete", { channel: ROOT_STATE_URI, uri: file });
    await assert.rejects(() => read(file), /content not found/i);
  });
  test("resourceDelete removes an empty directory", async function() {
    const directory = resource("delete-empty-directory");
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    await client.call("resourceDelete", { channel: ROOT_STATE_URI, uri: directory });
    await assert.rejects(() => client.call("resourceResolve", { channel: ROOT_STATE_URI, uri: directory }), /resource not found/i);
  });
  test("resourceDelete requires recursive for a non-empty directory", async function() {
    const directory = resource("delete-directory");
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    await write(URI.file(join(testDirectory, "delete-directory", "file.txt")).toString(), "content");
    await assert.rejects(() => client.call("resourceDelete", { channel: ROOT_STATE_URI, uri: directory }), /resource not found/i);
    await client.call("resourceDelete", { channel: ROOT_STATE_URI, uri: directory, recursive: true });
    await assert.rejects(() => client.call("resourceResolve", { channel: ROOT_STATE_URI, uri: directory }), /resource not found/i);
  });
  test("resourceDelete reports a missing resource", async function() {
    await assert.rejects(() => client.call("resourceDelete", { channel: ROOT_STATE_URI, uri: resource("missing-delete.txt") }), /resource not found/i);
  });
  test("resourceRead reports a missing file", async function() {
    await assert.rejects(() => read(resource("missing-read.txt")), /content not found/i);
  });
  test("resourceList reports a missing directory", async function() {
    await assert.rejects(() => client.call("resourceList", { channel: ROOT_STATE_URI, uri: resource("missing-list") }), /directory not found/i);
  });
  test("resourceList rejects a file", async function() {
    const file = resource("not-a-directory.txt");
    await write(file, "content");
    await assert.rejects(() => client.call("resourceList", { channel: ROOT_STATE_URI, uri: file }), /not a directory/i);
  });
  test("resourceMkdir rejects an existing file", async function() {
    const file = resource("mkdir-file.txt");
    await write(file, "content");
    await assert.rejects(() => client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: file }), /not a directory/i);
  });
  test("resourceWrite reports a missing parent directory", async function() {
    await assert.rejects(() => write(resource("missing-parent/file.txt"), "content"), /parent directory not found/i);
  });
  test("resourceResolve reports a missing resource", async function() {
    await assert.rejects(() => client.call("resourceResolve", { channel: ROOT_STATE_URI, uri: resource("missing-resolve") }), /resource not found/i);
  });
  test("resourceRequest grants local access", async function() {
    const result = await client.call("resourceRequest", {
      channel: ROOT_STATE_URI,
      uri: URI.file(testDirectory).toString(),
      read: true,
      write: true
    });
    assert.deepStrictEqual(result, {});
  });
  test("createResourceWatch reports a missing root", async function() {
    await assert.rejects(() => client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: resource("missing-watch-root")
    }), /resource not found/i);
  });
  (isLinux || isWindows || isMacintosh ? test.skip : test)("non-recursive resource watch emits a change action", async function() {
    const watch = await client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: URI.file(testDirectory).toString()
    });
    await client.call("subscribe", { channel: watch.channel });
    const file = resource("watched.txt");
    const changed = client.waitForNotification((n) => isResourceWatchChangeFor(file, n), 1e4);
    await write(file, "content");
    assert.ok(await changed);
  });
  test("recursive resource watch subscription returns its descriptor", async function() {
    const nested = resource("nested");
    await client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: nested });
    const watch = await client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: URI.file(testDirectory).toString(),
      recursive: true,
      excludes: { items: ["**/.git/**"] },
      includes: { items: ["**/*.ts"] }
    });
    const result = await client.call("subscribe", { channel: watch.channel });
    assert.deepStrictEqual(result.snapshot.state, {
      root: URI.file(testDirectory).toString(),
      recursive: true,
      excludes: { items: ["**/.git/**"] },
      includes: { items: ["**/*.ts"] }
    });
  });
  test("resource watch supports multiple subscribers", async function() {
    const watch = await client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: URI.file(testDirectory).toString()
    });
    const first = await client.call("subscribe", { channel: watch.channel });
    const secondClient = new TestProtocolClient(server.port);
    secondaryClients.push(secondClient);
    await secondClient.connect();
    await secondClient.call("initialize", { protocolVersions: [PROTOCOL_VERSION], clientId: `resource-client-${++clientCounter}` });
    const second = await secondClient.call("subscribe", { channel: watch.channel });
    assert.deepStrictEqual([first.snapshot.state.root, second.snapshot.state.root], [
      URI.file(testDirectory).toString(),
      URI.file(testDirectory).toString()
    ]);
    client.notify("unsubscribe", { channel: watch.channel });
    secondClient.notify("unsubscribe", { channel: watch.channel });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxwcm90b2NvbFxccmVzb3VyY2VPcGVyYXRpb25zLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZHRlbXBTeW5jLCBybVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbnRlbnRFbmNvZGluZywgUmVzb3VyY2VUeXBlLCBSZXNvdXJjZVdyaXRlTW9kZSwgdHlwZSBSZXNvdXJjZUxpc3RSZXN1bHQsIHR5cGUgUmVzb3VyY2VSZWFkUmVzdWx0LCB0eXBlIFJlc291cmNlUmVzb2x2ZVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJPT1RfU1RBVEVfVVJJIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25FbnZlbG9wZSwgZ2V0QWdlbnRIb3N0RTJFVGVzdFRpbWVvdXQsIGlzQWN0aW9uTm90aWZpY2F0aW9uLCB0eXBlIElTZXJ2ZXJIYW5kbGUsIHN0YXJ0U2VydmVyLCBzdG9wU2VydmVyLCBUZXN0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi9zZXJ2ZXJJbnRlZ3JhdGlvblRlc3RIZWxwZXJzLmpzJztcblxuc3VpdGUoJ1Byb3RvY29sIFdlYlNvY2tldCAtIFJlc291cmNlIE9wZXJhdGlvbnMnLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IHNlcnZlcjogSVNlcnZlckhhbmRsZTtcblx0bGV0IGNsaWVudDogVGVzdFByb3RvY29sQ2xpZW50O1xuXHRjb25zdCBzZWNvbmRhcnlDbGllbnRzOiBUZXN0UHJvdG9jb2xDbGllbnRbXSA9IFtdO1xuXHRsZXQgdGVzdERpcmVjdG9yeTogc3RyaW5nO1xuXHRsZXQgY2xpZW50Q291bnRlciA9IDA7XG5cblx0c3VpdGVTZXR1cChhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KGdldEFnZW50SG9zdEUyRVRlc3RUaW1lb3V0KDM1XzAwMCwgNjBfMDAwKSk7XG5cdFx0c2VydmVyID0gYXdhaXQgc3RhcnRTZXJ2ZXIoeyBzdGFydHVwVGltZW91dE1zOiBnZXRBZ2VudEhvc3RFMkVUZXN0VGltZW91dCgzMF8wMDAsIDUwXzAwMCkgfSk7XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dChnZXRBZ2VudEhvc3RFMkVUZXN0VGltZW91dCgyMF8wMDAsIDUwXzAwMCkpO1xuXHRcdGF3YWl0IHN0b3BTZXJ2ZXIoc2VydmVyKTtcblx0fSk7XG5cblx0c2V0dXAoYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dChnZXRBZ2VudEhvc3RFMkVUZXN0VGltZW91dCgxMF8wMDAsIDMwXzAwMCkpO1xuXHRcdHRlc3REaXJlY3RvcnkgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1yZXNvdXJjZS0nKSk7XG5cdFx0Y2xpZW50ID0gbmV3IFRlc3RQcm90b2NvbENsaWVudChzZXJ2ZXIucG9ydCk7XG5cdFx0YXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHsgcHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLCBjbGllbnRJZDogYHJlc291cmNlLWNsaWVudC0keysrY2xpZW50Q291bnRlcn1gIH0pO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0Zm9yIChjb25zdCBzZWNvbmRhcnlDbGllbnQgb2Ygc2Vjb25kYXJ5Q2xpZW50cy5zcGxpY2UoMCkpIHtcblx0XHRcdHNlY29uZGFyeUNsaWVudC5jbG9zZSgpO1xuXHRcdH1cblx0XHRybVN5bmModGVzdERpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlLCBtYXhSZXRyaWVzOiA1LCByZXRyeURlbGF5OiAxMDAgfSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHJlc291cmNlKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFVSSS5maWxlKGpvaW4odGVzdERpcmVjdG9yeSwgbmFtZSkpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3cml0ZSh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nLCBvcHRpb25zPzogeyBlbmNvZGluZz86IENvbnRlbnRFbmNvZGluZzsgbW9kZT86IFJlc291cmNlV3JpdGVNb2RlOyBwb3NpdGlvbj86IG51bWJlcjsgY3JlYXRlT25seT86IGJvb2xlYW47IGlmTWF0Y2g/OiBzdHJpbmcgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZVdyaXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmksXG5cdFx0XHRkYXRhLFxuXHRcdFx0ZW5jb2Rpbmc6IG9wdGlvbnM/LmVuY29kaW5nID8/IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0bW9kZTogb3B0aW9ucz8ubW9kZSxcblx0XHRcdHBvc2l0aW9uOiBvcHRpb25zPy5wb3NpdGlvbixcblx0XHRcdGNyZWF0ZU9ubHk6IG9wdGlvbnM/LmNyZWF0ZU9ubHksXG5cdFx0XHRpZk1hdGNoOiBvcHRpb25zPy5pZk1hdGNoLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVhZCh1cmk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2xpZW50LmNhbGw8UmVzb3VyY2VSZWFkUmVzdWx0PigncmVzb3VyY2VSZWFkJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpIH0pO1xuXHRcdHJldHVybiByZXN1bHQuZGF0YTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzUmVzb3VyY2VXYXRjaENoYW5nZUZvcih1cmk6IHN0cmluZywgbm90aWZpY2F0aW9uOiBQYXJhbWV0ZXJzPHR5cGVvZiBpc0FjdGlvbk5vdGlmaWNhdGlvbj5bMF0pOiBib29sZWFuIHtcblx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbiwgJ3Jlc291cmNlV2F0Y2gvY2hhbmdlZCcpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIHsgY2hhbmdlczogeyBpdGVtczogeyB1cmk6IHN0cmluZyB9W10gfSB9O1xuXHRcdHJldHVybiBhY3Rpb24uY2hhbmdlcy5pdGVtcy5zb21lKGNoYW5nZSA9PiBjaGFuZ2UudXJpID09PSB1cmkpO1xuXHR9XG5cblx0dGVzdCgncmVzb3VyY2VNa2RpciBjcmVhdGVzIG5lc3RlZCBkaXJlY3RvcmllcyBhbmQgaXMgaWRlbXBvdGVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkaXJlY3RvcnkgPSByZXNvdXJjZSgnb25lL3R3by90aHJlZScpO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZU1rZGlyJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkaXJlY3RvcnkgfSk7XG5cdFx0YXdhaXQgY2xpZW50LmNhbGwoJ3Jlc291cmNlTWtkaXInLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSB9KTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgY2xpZW50LmNhbGw8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PigncmVzb3VyY2VSZXNvbHZlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkaXJlY3RvcnkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLnR5cGUsIFJlc291cmNlVHlwZS5EaXJlY3RvcnkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZUxpc3QgcmV0dXJucyBmaWxlIGFuZCBkaXJlY3RvcnkgZW50cmllcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgncmVzb3VyY2VNa2RpcicsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogcmVzb3VyY2UoJ2ZvbGRlcicpIH0pO1xuXHRcdGF3YWl0IHdyaXRlKHJlc291cmNlKCdmaWxlLnR4dCcpLCAnY29udGVudCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2xpZW50LmNhbGw8UmVzb3VyY2VMaXN0UmVzdWx0PigncmVzb3VyY2VMaXN0JywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBVUkkuZmlsZSh0ZXN0RGlyZWN0b3J5KS50b1N0cmluZygpIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVudHJpZXMuc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSksIFtcblx0XHRcdHsgbmFtZTogJ2ZpbGUudHh0JywgdHlwZTogJ2ZpbGUnIH0sXG5cdFx0XHR7IG5hbWU6ICdmb2xkZXInLCB0eXBlOiAnZGlyZWN0b3J5JyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZVdyaXRlIGFuZCByZXNvdXJjZVJlYWQgcm91bmQtdHJpcCBVVEYtOCB0ZXh0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSByZXNvdXJjZSgndXRmOC50eHQnKTtcblx0XHRhd2FpdCB3cml0ZShmaWxlLCAnaGVsbG8gd29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZChmaWxlKSwgJ2hlbGxvIHdvcmxkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlV3JpdGUgZGVjb2RlcyBiYXNlNjQgaW5wdXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IHJlc291cmNlKCdiYXNlNjQudHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgQnVmZmVyLmZyb20oJ2Jhc2U2NCBjb250ZW50JykudG9TdHJpbmcoJ2Jhc2U2NCcpLCB7IGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuQmFzZTY0IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKGZpbGUpLCAnYmFzZTY0IGNvbnRlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VXcml0ZSBhcHBlbmQgYWRkcyBkYXRhIGF0IEVPRicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gcmVzb3VyY2UoJ2FwcGVuZC50eHQnKTtcblx0XHRhd2FpdCB3cml0ZShmaWxlLCAnYWJjJyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgJ2RlZicsIHsgbW9kZTogUmVzb3VyY2VXcml0ZU1vZGUuQXBwZW5kIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKGZpbGUpLCAnYWJjZGVmJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlV3JpdGUgYXBwZW5kIHBvc2l0aW9uIGluc2VydHMgYmVmb3JlIHRyYWlsaW5nIGJ5dGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSByZXNvdXJjZSgnYXBwZW5kLXBvc2l0aW9uLnR4dCcpO1xuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdhYmNkZWYnKTtcblx0XHRhd2FpdCB3cml0ZShmaWxlLCAnWCcsIHsgbW9kZTogUmVzb3VyY2VXcml0ZU1vZGUuQXBwZW5kLCBwb3NpdGlvbjogMiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZChmaWxlKSwgJ2FiY2RYZWYnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VXcml0ZSBpbnNlcnQgc3BsaWNlcyBkYXRhIGF0IGEgYnl0ZSBvZmZzZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IHJlc291cmNlKCdpbnNlcnQudHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgJ2FiY2RlZicpO1xuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdYJywgeyBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5JbnNlcnQsIHBvc2l0aW9uOiAzIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKGZpbGUpLCAnYWJjWGRlZicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZVdyaXRlIGluc2VydCBiZXlvbmQgRU9GIGFwcGVuZHMgZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gcmVzb3VyY2UoJ2luc2VydC1iZXlvbmQudHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgJ2FiYycpO1xuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdYJywgeyBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5JbnNlcnQsIHBvc2l0aW9uOiAxMDAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWQoZmlsZSksICdhYmNYJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlV3JpdGUgYXBwZW5kIGNyZWF0ZXMgYSBtaXNzaW5nIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IHJlc291cmNlKCdhcHBlbmQtY3JlYXRlLnR4dCcpO1xuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdjcmVhdGVkJywgeyBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5BcHBlbmQgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWQoZmlsZSksICdjcmVhdGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlV3JpdGUgaW5zZXJ0IGNyZWF0ZXMgYSBtaXNzaW5nIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IHJlc291cmNlKCdpbnNlcnQtY3JlYXRlLnR4dCcpO1xuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdjcmVhdGVkJywgeyBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5JbnNlcnQsIHBvc2l0aW9uOiAzIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKGZpbGUpLCAnY3JlYXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZVdyaXRlIHRydW5jYXRlIHBvc2l0aW9uIHByZXNlcnZlcyB0aGUgcHJlZml4JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSByZXNvdXJjZSgndHJ1bmNhdGUtcG9zaXRpb24udHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgJ2FiY2RlZicpO1xuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdYJywgeyBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5UcnVuY2F0ZSwgcG9zaXRpb246IDIgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWQoZmlsZSksICdhYlgnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VXcml0ZSBjcmVhdGVPbmx5IHJlamVjdHMgYW4gZXhpc3RpbmcgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gcmVzb3VyY2UoJ2NyZWF0ZS1vbmx5LnR4dCcpO1xuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdmaXJzdCcpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHdyaXRlKGZpbGUsICdzZWNvbmQnLCB7IGNyZWF0ZU9ubHk6IHRydWUgfSksIC9hbHJlYWR5IGV4aXN0cy9pKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiB3cml0ZShmaWxlLCAnc2Vjb25kJywgeyBjcmVhdGVPbmx5OiB0cnVlLCBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5BcHBlbmQgfSksIC9hbHJlYWR5IGV4aXN0cy9pKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiB3cml0ZShmaWxlLCAnc2Vjb25kJywgeyBjcmVhdGVPbmx5OiB0cnVlLCBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5JbnNlcnQgfSksIC9hbHJlYWR5IGV4aXN0cy9pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZChmaWxlKSwgJ2ZpcnN0Jyk7XG5cblx0XHRjb25zdCBjb25jdXJyZW50RmlsZSA9IHJlc291cmNlKCdjcmVhdGUtb25seS1jb25jdXJyZW50LnR4dCcpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoW1xuXHRcdFx0d3JpdGUoY29uY3VycmVudEZpbGUsICdhcHBlbmQnLCB7IGNyZWF0ZU9ubHk6IHRydWUsIG1vZGU6IFJlc291cmNlV3JpdGVNb2RlLkFwcGVuZCB9KSxcblx0XHRcdHdyaXRlKGNvbmN1cnJlbnRGaWxlLCAnaW5zZXJ0JywgeyBjcmVhdGVPbmx5OiB0cnVlLCBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5JbnNlcnQgfSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnN0YXR1cykuc29ydCgpLCBbJ2Z1bGZpbGxlZCcsICdyZWplY3RlZCddKTtcblx0XHRhc3NlcnQub2soWydhcHBlbmQnLCAnaW5zZXJ0J10uaW5jbHVkZXMoYXdhaXQgcmVhZChjb25jdXJyZW50RmlsZSkpKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VSZXNvbHZlIHJldHVybnMgZmlsZSBtZXRhZGF0YSBhbmQgYW4gZXRhZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gcmVzb3VyY2UoJ3Jlc29sdmUtZmlsZS50eHQnKTtcblx0XHRhd2FpdCB3cml0ZShmaWxlLCAnaGVsbG8nKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5jYWxsPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4oJ3Jlc291cmNlUmVzb2x2ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZmlsZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVyaTogcmVzdWx0LnVyaSxcblx0XHRcdHR5cGU6IHJlc3VsdC50eXBlLFxuXHRcdFx0c2l6ZTogcmVzdWx0LnNpemUsXG5cdFx0XHRoYXNNdGltZTogdHlwZW9mIHJlc3VsdC5tdGltZSA9PT0gJ3N0cmluZycsXG5cdFx0XHRoYXNFdGFnOiB0eXBlb2YgcmVzdWx0LmV0YWcgPT09ICdzdHJpbmcnLFxuXHRcdH0sIHtcblx0XHRcdHVyaTogZmlsZSxcblx0XHRcdHR5cGU6IFJlc291cmNlVHlwZS5GaWxlLFxuXHRcdFx0c2l6ZTogNSxcblx0XHRcdGhhc010aW1lOiB0cnVlLFxuXHRcdFx0aGFzRXRhZzogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VSZXNvbHZlIHJldHVybnMgZGlyZWN0b3J5IG1ldGFkYXRhJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IHJlc291cmNlKCdyZXNvbHZlLWRpcmVjdG9yeScpO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZU1rZGlyJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkaXJlY3RvcnkgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2xpZW50LmNhbGw8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PigncmVzb3VyY2VSZXNvbHZlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkaXJlY3RvcnkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50eXBlLCBSZXNvdXJjZVR5cGUuRGlyZWN0b3J5KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VXcml0ZSBhY2NlcHRzIHRoZSBjdXJyZW50IGlmTWF0Y2ggZXRhZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gcmVzb3VyY2UoJ2lmLW1hdGNoLnR4dCcpO1xuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdmaXJzdCcpO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgY2xpZW50LmNhbGw8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PigncmVzb3VyY2VSZXNvbHZlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBmaWxlIH0pO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZC5ldGFnKTtcblxuXHRcdGF3YWl0IHdyaXRlKGZpbGUsICdzZWNvbmQnLCB7IGlmTWF0Y2g6IHJlc29sdmVkLmV0YWcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWQoZmlsZSksICdzZWNvbmQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VXcml0ZSByZWplY3RzIGEgc3RhbGUgaWZNYXRjaCBldGFnJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSByZXNvdXJjZSgnaWYtbWF0Y2gtc3RhbGUudHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgJ2ZpcnN0Jyk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gd3JpdGUoZmlsZSwgJ3NlY29uZCcsIHsgaWZNYXRjaDogJ3N0YWxlLWV0YWcnIH0pLCAvaWZNYXRjaCBwcmVjb25kaXRpb24gZmFpbGVkL2kpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKGZpbGUpLCAnZmlyc3QnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VXcml0ZSByZWplY3RzIGlmTWF0Y2ggZm9yIGEgbWlzc2luZyBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGUgPSByZXNvdXJjZSgnaWYtbWF0Y2gtbWlzc2luZy50eHQnKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiB3cml0ZShmaWxlLCAnY29udGVudCcsIHsgaWZNYXRjaDogJ21pc3NpbmctZXRhZycgfSksIC9pZk1hdGNoIHByZWNvbmRpdGlvbiBmYWlsZWQvaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlQ29weSBjb3BpZXMgYSBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHJlc291cmNlKCdjb3B5LXNvdXJjZS50eHQnKTtcblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IHJlc291cmNlKCdjb3B5LWRlc3RpbmF0aW9uLnR4dCcpO1xuXHRcdGF3YWl0IHdyaXRlKHNvdXJjZSwgJ2NvcGllZCcpO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZUNvcHknLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCBzb3VyY2UsIGRlc3RpbmF0aW9uIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKGRlc3RpbmF0aW9uKSwgJ2NvcGllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZUNvcHkgY29waWVzIGEgZGlyZWN0b3J5IHJlY3Vyc2l2ZWx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHJlc291cmNlKCdjb3B5LXNvdXJjZS1kaXJlY3RvcnknKTtcblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IHJlc291cmNlKCdjb3B5LWRlc3RpbmF0aW9uLWRpcmVjdG9yeScpO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZU1rZGlyJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBzb3VyY2UgfSk7XG5cdFx0YXdhaXQgd3JpdGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyZWN0b3J5LCAnY29weS1zb3VyY2UtZGlyZWN0b3J5JywgJ2ZpbGUudHh0JykpLnRvU3RyaW5nKCksICdjb3BpZWQnKTtcblxuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZUNvcHknLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCBzb3VyY2UsIGRlc3RpbmF0aW9uIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKFVSSS5maWxlKGpvaW4odGVzdERpcmVjdG9yeSwgJ2NvcHktZGVzdGluYXRpb24tZGlyZWN0b3J5JywgJ2ZpbGUudHh0JykpLnRvU3RyaW5nKCkpLCAnY29waWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlQ29weSBmYWlsSWZFeGlzdHMgcHJlc2VydmVzIHRoZSBkZXN0aW5hdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzb3VyY2UgPSByZXNvdXJjZSgnY29weS1leGlzdGluZy1zb3VyY2UudHh0Jyk7XG5cdFx0Y29uc3QgZGVzdGluYXRpb24gPSByZXNvdXJjZSgnY29weS1leGlzdGluZy1kZXN0aW5hdGlvbi50eHQnKTtcblx0XHRhd2FpdCB3cml0ZShzb3VyY2UsICdzb3VyY2UnKTtcblx0XHRhd2FpdCB3cml0ZShkZXN0aW5hdGlvbiwgJ2Rlc3RpbmF0aW9uJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VDb3B5JywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgc291cmNlLCBkZXN0aW5hdGlvbiwgZmFpbElmRXhpc3RzOiB0cnVlIH0pLCAvYWxyZWFkeSBleGlzdHMvaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWQoZGVzdGluYXRpb24pLCAnZGVzdGluYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VDb3B5IHJlcG9ydHMgYSBtaXNzaW5nIHNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VDb3B5Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzb3VyY2U6IHJlc291cmNlKCdtaXNzaW5nLWNvcHktc291cmNlLnR4dCcpLFxuXHRcdFx0ZGVzdGluYXRpb246IHJlc291cmNlKCdjb3B5LXRhcmdldC50eHQnKSxcblx0XHR9KSwgL3NvdXJjZSBub3QgZm91bmQvaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlTW92ZSBtb3ZlcyBhIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc291cmNlID0gcmVzb3VyY2UoJ21vdmUtc291cmNlLnR4dCcpO1xuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gcmVzb3VyY2UoJ21vdmUtZGVzdGluYXRpb24udHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoc291cmNlLCAnbW92ZWQnKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgncmVzb3VyY2VNb3ZlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgc291cmNlLCBkZXN0aW5hdGlvbiB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKGRlc3RpbmF0aW9uKSwgJ21vdmVkJyk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gcmVhZChzb3VyY2UpLCAvY29udGVudCBub3QgZm91bmQvaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlTW92ZSBtb3ZlcyBhIGRpcmVjdG9yeSByZWN1cnNpdmVseScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzb3VyY2UgPSByZXNvdXJjZSgnbW92ZS1zb3VyY2UtZGlyZWN0b3J5Jyk7XG5cdFx0Y29uc3QgZGVzdGluYXRpb24gPSByZXNvdXJjZSgnbW92ZS1kZXN0aW5hdGlvbi1kaXJlY3RvcnknKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgncmVzb3VyY2VNa2RpcicsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogc291cmNlIH0pO1xuXHRcdGF3YWl0IHdyaXRlKFVSSS5maWxlKGpvaW4odGVzdERpcmVjdG9yeSwgJ21vdmUtc291cmNlLWRpcmVjdG9yeScsICdmaWxlLnR4dCcpKS50b1N0cmluZygpLCAnbW92ZWQnKTtcblxuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZU1vdmUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCBzb3VyY2UsIGRlc3RpbmF0aW9uIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkKFVSSS5maWxlKGpvaW4odGVzdERpcmVjdG9yeSwgJ21vdmUtZGVzdGluYXRpb24tZGlyZWN0b3J5JywgJ2ZpbGUudHh0JykpLnRvU3RyaW5nKCkpLCAnbW92ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VNb3ZlIGZhaWxJZkV4aXN0cyBwcmVzZXJ2ZXMgYm90aCBmaWxlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzb3VyY2UgPSByZXNvdXJjZSgnbW92ZS1leGlzdGluZy1zb3VyY2UudHh0Jyk7XG5cdFx0Y29uc3QgZGVzdGluYXRpb24gPSByZXNvdXJjZSgnbW92ZS1leGlzdGluZy1kZXN0aW5hdGlvbi50eHQnKTtcblx0XHRhd2FpdCB3cml0ZShzb3VyY2UsICdzb3VyY2UnKTtcblx0XHRhd2FpdCB3cml0ZShkZXN0aW5hdGlvbiwgJ2Rlc3RpbmF0aW9uJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VNb3ZlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgc291cmNlLCBkZXN0aW5hdGlvbiwgZmFpbElmRXhpc3RzOiB0cnVlIH0pLCAvYWxyZWFkeSBleGlzdHMvaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbYXdhaXQgcmVhZChzb3VyY2UpLCBhd2FpdCByZWFkKGRlc3RpbmF0aW9uKV0sIFsnc291cmNlJywgJ2Rlc3RpbmF0aW9uJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZU1vdmUgcmVwb3J0cyBhIG1pc3Npbmcgc291cmNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGNsaWVudC5jYWxsKCdyZXNvdXJjZU1vdmUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHNvdXJjZTogcmVzb3VyY2UoJ21pc3NpbmctbW92ZS1zb3VyY2UudHh0JyksXG5cdFx0XHRkZXN0aW5hdGlvbjogcmVzb3VyY2UoJ21vdmUtdGFyZ2V0LnR4dCcpLFxuXHRcdH0pLCAvc291cmNlIG5vdCBmb3VuZC9pKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VEZWxldGUgcmVtb3ZlcyBhIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IHJlc291cmNlKCdkZWxldGUudHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgJ2RlbGV0ZSBtZScpO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZURlbGV0ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZmlsZSB9KTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiByZWFkKGZpbGUpLCAvY29udGVudCBub3QgZm91bmQvaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlRGVsZXRlIHJlbW92ZXMgYW4gZW1wdHkgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IHJlc291cmNlKCdkZWxldGUtZW1wdHktZGlyZWN0b3J5Jyk7XG5cdFx0YXdhaXQgY2xpZW50LmNhbGwoJ3Jlc291cmNlTWtkaXInLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSB9KTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgncmVzb3VyY2VEZWxldGUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSB9KTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VSZXNvbHZlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkaXJlY3RvcnkgfSksIC9yZXNvdXJjZSBub3QgZm91bmQvaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlRGVsZXRlIHJlcXVpcmVzIHJlY3Vyc2l2ZSBmb3IgYSBub24tZW1wdHkgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IHJlc291cmNlKCdkZWxldGUtZGlyZWN0b3J5Jyk7XG5cdFx0YXdhaXQgY2xpZW50LmNhbGwoJ3Jlc291cmNlTWtkaXInLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSB9KTtcblx0XHRhd2FpdCB3cml0ZShVUkkuZmlsZShqb2luKHRlc3REaXJlY3RvcnksICdkZWxldGUtZGlyZWN0b3J5JywgJ2ZpbGUudHh0JykpLnRvU3RyaW5nKCksICdjb250ZW50Jyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VEZWxldGUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSB9KSwgL3Jlc291cmNlIG5vdCBmb3VuZC9pKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgncmVzb3VyY2VEZWxldGUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSwgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGNsaWVudC5jYWxsKCdyZXNvdXJjZVJlc29sdmUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGRpcmVjdG9yeSB9KSwgL3Jlc291cmNlIG5vdCBmb3VuZC9pKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VEZWxldGUgcmVwb3J0cyBhIG1pc3NpbmcgcmVzb3VyY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gY2xpZW50LmNhbGwoJ3Jlc291cmNlRGVsZXRlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiByZXNvdXJjZSgnbWlzc2luZy1kZWxldGUudHh0JykgfSksIC9yZXNvdXJjZSBub3QgZm91bmQvaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlUmVhZCByZXBvcnRzIGEgbWlzc2luZyBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHJlYWQocmVzb3VyY2UoJ21pc3NpbmctcmVhZC50eHQnKSksIC9jb250ZW50IG5vdCBmb3VuZC9pKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VMaXN0IHJlcG9ydHMgYSBtaXNzaW5nIGRpcmVjdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VMaXN0JywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiByZXNvdXJjZSgnbWlzc2luZy1saXN0JykgfSksIC9kaXJlY3Rvcnkgbm90IGZvdW5kL2kpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZUxpc3QgcmVqZWN0cyBhIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZSA9IHJlc291cmNlKCdub3QtYS1kaXJlY3RvcnkudHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgJ2NvbnRlbnQnKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VMaXN0JywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBmaWxlIH0pLCAvbm90IGEgZGlyZWN0b3J5L2kpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZU1rZGlyIHJlamVjdHMgYW4gZXhpc3RpbmcgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlID0gcmVzb3VyY2UoJ21rZGlyLWZpbGUudHh0Jyk7XG5cdFx0YXdhaXQgd3JpdGUoZmlsZSwgJ2NvbnRlbnQnKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VNa2RpcicsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZmlsZSB9KSwgL25vdCBhIGRpcmVjdG9yeS9pKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb3VyY2VXcml0ZSByZXBvcnRzIGEgbWlzc2luZyBwYXJlbnQgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHdyaXRlKHJlc291cmNlKCdtaXNzaW5nLXBhcmVudC9maWxlLnR4dCcpLCAnY29udGVudCcpLCAvcGFyZW50IGRpcmVjdG9yeSBub3QgZm91bmQvaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlUmVzb2x2ZSByZXBvcnRzIGEgbWlzc2luZyByZXNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBjbGllbnQuY2FsbCgncmVzb3VyY2VSZXNvbHZlJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiByZXNvdXJjZSgnbWlzc2luZy1yZXNvbHZlJykgfSksIC9yZXNvdXJjZSBub3QgZm91bmQvaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc291cmNlUmVxdWVzdCBncmFudHMgbG9jYWwgYWNjZXNzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5jYWxsKCdyZXNvdXJjZVJlcXVlc3QnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHVyaTogVVJJLmZpbGUodGVzdERpcmVjdG9yeSkudG9TdHJpbmcoKSxcblx0XHRcdHJlYWQ6IHRydWUsXG5cdFx0XHR3cml0ZTogdHJ1ZSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVSZXNvdXJjZVdhdGNoIHJlcG9ydHMgYSBtaXNzaW5nIHJvb3QnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gY2xpZW50LmNhbGwoJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHVyaTogcmVzb3VyY2UoJ21pc3Npbmctd2F0Y2gtcm9vdCcpLFxuXHRcdH0pLCAvcmVzb3VyY2Ugbm90IGZvdW5kL2kpO1xuXHR9KTtcblxuXHQvLyBGaWxlIHdhdGNoZXIgZGVsaXZlcnkgaXMgdW5yZWxpYWJsZSBpbiBhbGwgZW52aXJvbm1lbnRzLlxuXHQoaXNMaW51eCB8fCBpc1dpbmRvd3MgfHwgaXNNYWNpbnRvc2ggPyB0ZXN0LnNraXAgOiB0ZXN0KSgnbm9uLXJlY3Vyc2l2ZSByZXNvdXJjZSB3YXRjaCBlbWl0cyBhIGNoYW5nZSBhY3Rpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBhd2FpdCBjbGllbnQuY2FsbDx7IGNoYW5uZWw6IHN0cmluZyB9PignY3JlYXRlUmVzb3VyY2VXYXRjaCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBVUkkuZmlsZSh0ZXN0RGlyZWN0b3J5KS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoLmNoYW5uZWwgfSk7XG5cdFx0Y29uc3QgZmlsZSA9IHJlc291cmNlKCd3YXRjaGVkLnR4dCcpO1xuXHRcdGNvbnN0IGNoYW5nZWQgPSBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzUmVzb3VyY2VXYXRjaENoYW5nZUZvcihmaWxlLCBuKSwgMTBfMDAwKTtcblx0XHRhd2FpdCB3cml0ZShmaWxlLCAnY29udGVudCcpO1xuXHRcdGFzc2VydC5vayhhd2FpdCBjaGFuZ2VkKTtcblx0fSk7XG5cblx0dGVzdCgncmVjdXJzaXZlIHJlc291cmNlIHdhdGNoIHN1YnNjcmlwdGlvbiByZXR1cm5zIGl0cyBkZXNjcmlwdG9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5lc3RlZCA9IHJlc291cmNlKCduZXN0ZWQnKTtcblx0XHRhd2FpdCBjbGllbnQuY2FsbCgncmVzb3VyY2VNa2RpcicsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogbmVzdGVkIH0pO1xuXHRcdGNvbnN0IHdhdGNoID0gYXdhaXQgY2xpZW50LmNhbGw8eyBjaGFubmVsOiBzdHJpbmcgfT4oJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHVyaTogVVJJLmZpbGUodGVzdERpcmVjdG9yeSkudG9TdHJpbmcoKSxcblx0XHRcdHJlY3Vyc2l2ZTogdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVzOiB7IGl0ZW1zOiBbJyoqLy5naXQvKionXSB9LFxuXHRcdFx0aW5jbHVkZXM6IHsgaXRlbXM6IFsnKiovKi50cyddIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2xpZW50LmNhbGw8eyBzbmFwc2hvdDogeyBzdGF0ZTogeyByb290OiBzdHJpbmc7IHJlY3Vyc2l2ZTogYm9vbGVhbjsgZXhjbHVkZXM/OiB7IGl0ZW1zOiBzdHJpbmdbXSB9OyBpbmNsdWRlcz86IHsgaXRlbXM6IHN0cmluZ1tdIH0gfSB9IH0+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoLmNoYW5uZWwgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuc25hcHNob3Quc3RhdGUsIHtcblx0XHRcdHJvb3Q6IFVSSS5maWxlKHRlc3REaXJlY3RvcnkpLnRvU3RyaW5nKCksXG5cdFx0XHRyZWN1cnNpdmU6IHRydWUsXG5cdFx0XHRleGNsdWRlczogeyBpdGVtczogWycqKi8uZ2l0LyoqJ10gfSxcblx0XHRcdGluY2x1ZGVzOiB7IGl0ZW1zOiBbJyoqLyoudHMnXSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZSB3YXRjaCBzdXBwb3J0cyBtdWx0aXBsZSBzdWJzY3JpYmVycycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3YXRjaCA9IGF3YWl0IGNsaWVudC5jYWxsPHsgY2hhbm5lbDogc3RyaW5nIH0+KCdjcmVhdGVSZXNvdXJjZVdhdGNoJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IFVSSS5maWxlKHRlc3REaXJlY3RvcnkpLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjbGllbnQuY2FsbDx7IHNuYXBzaG90OiB7IHN0YXRlOiB7IHJvb3Q6IHN0cmluZyB9IH0gfT4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogd2F0Y2guY2hhbm5lbCB9KTtcblxuXHRcdGNvbnN0IHNlY29uZENsaWVudCA9IG5ldyBUZXN0UHJvdG9jb2xDbGllbnQoc2VydmVyLnBvcnQpO1xuXHRcdHNlY29uZGFyeUNsaWVudHMucHVzaChzZWNvbmRDbGllbnQpO1xuXHRcdGF3YWl0IHNlY29uZENsaWVudC5jb25uZWN0KCk7XG5cdFx0YXdhaXQgc2Vjb25kQ2xpZW50LmNhbGwoJ2luaXRpYWxpemUnLCB7IHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSwgY2xpZW50SWQ6IGByZXNvdXJjZS1jbGllbnQtJHsrK2NsaWVudENvdW50ZXJ9YCB9KTtcblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBzZWNvbmRDbGllbnQuY2FsbDx7IHNuYXBzaG90OiB7IHN0YXRlOiB7IHJvb3Q6IHN0cmluZyB9IH0gfT4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogd2F0Y2guY2hhbm5lbCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2ZpcnN0LnNuYXBzaG90LnN0YXRlLnJvb3QsIHNlY29uZC5zbmFwc2hvdC5zdGF0ZS5yb290XSwgW1xuXHRcdFx0VVJJLmZpbGUodGVzdERpcmVjdG9yeSkudG9TdHJpbmcoKSxcblx0XHRcdFVSSS5maWxlKHRlc3REaXJlY3RvcnkpLnRvU3RyaW5nKCksXG5cdFx0XSk7XG5cdFx0Y2xpZW50Lm5vdGlmeSgndW5zdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoLmNoYW5uZWwgfSk7XG5cdFx0c2Vjb25kQ2xpZW50Lm5vdGlmeSgndW5zdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoLmNoYW5uZWwgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhLGNBQWM7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
