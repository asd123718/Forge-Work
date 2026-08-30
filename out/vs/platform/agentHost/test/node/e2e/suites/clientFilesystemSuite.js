import assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { raceTimeout } from "../../../../../../base/common/async.js";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { PROTOCOL_VERSION } from "../../../../common/state/protocol/version/registry.js";
import { ContentEncoding, ResourceType, ResourceWriteMode } from "../../../../common/state/protocol/common/commands.js";
import { ResourceChangeType } from "../../../../common/state/protocol/channels-resource-watch/state.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { AhpErrorCodes } from "../../../../common/state/sessionProtocol.js";
import { CustomizationLoadStatus, CustomizationType, ROOT_STATE_URI } from "../../../../common/state/sessionState.js";
import { createRealSession } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest } from "./e2eTestContext.js";
function defineClientFilesystemTests(context) {
  const { config, createdSessions, tempDirs, isWindows } = context;
  function createWorkspace(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(workspace);
    return workspace;
  }
  function fileUri(root, ...segments) {
    return URI.file(join(root, ...segments)).toString();
  }
  async function initializeClient(purpose) {
    await context.client.call("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [PROTOCOL_VERSION],
      clientId: `${purpose}-${config.provider}`
    });
  }
  async function writeText(uri, data, options = {}) {
    await context.client.call("resourceWrite", {
      channel: ROOT_STATE_URI,
      uri,
      data,
      encoding: ContentEncoding.Utf8,
      ...options
    });
  }
  conformanceTest(context, "resource commands round-trip a file through the host filesystem", async function() {
    await initializeClient("resource-roundtrip");
    const root = createWorkspace("ahp-resource-rw-");
    const directory = fileUri(root, "nested", "inner");
    const file = fileUri(root, "nested", "inner", "note.txt");
    await context.client.call("resourceRequest", {
      channel: ROOT_STATE_URI,
      uri: URI.file(root).toString(),
      read: true,
      write: true
    });
    await context.client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    await context.client.call("resourceMkdir", { channel: ROOT_STATE_URI, uri: directory });
    await context.client.call("resourceWrite", {
      channel: ROOT_STATE_URI,
      uri: file,
      data: "RESOURCE_ROUNDTRIP",
      encoding: ContentEncoding.Utf8
    });
    const read = await context.client.call("resourceRead", {
      channel: ROOT_STATE_URI,
      uri: file,
      encoding: ContentEncoding.Utf8
    });
    const resolvedDirectory = await context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: directory
    });
    const resolvedFile = await context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: file
    });
    assert.deepStrictEqual({
      data: read.data,
      encoding: read.encoding,
      directoryType: resolvedDirectory.type,
      fileType: resolvedFile.type,
      size: resolvedFile.size
    }, {
      data: "RESOURCE_ROUNDTRIP",
      encoding: ContentEncoding.Utf8,
      directoryType: ResourceType.Directory,
      fileType: ResourceType.File,
      size: "RESOURCE_ROUNDTRIP".length
    });
  });
  conformanceTest(context, "resourceList reports directory entries and their types", async function() {
    await initializeClient("resource-list");
    const root = createWorkspace("ahp-resource-list-");
    mkdirSync(join(root, "child-dir"));
    writeFileSync(join(root, "child-file.txt"), "CHILD");
    const listed = await context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: URI.file(root).toString()
    });
    assert.deepStrictEqual([...listed.entries].sort((a, b) => a.name.localeCompare(b.name)), [
      { name: "child-dir", type: "directory" },
      { name: "child-file.txt", type: "file" }
    ]);
  });
  conformanceTest(context, "resourceList returns an empty collection for an empty directory", async function() {
    await initializeClient("resource-list-empty");
    const root = createWorkspace("ahp-resource-list-empty-");
    const result = await context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: URI.file(root).toString()
    });
    assert.deepStrictEqual(result.entries, []);
  });
  conformanceTest(context, "resourceWrite truncates an existing file by default", async function() {
    await initializeClient("resource-write-default-truncate");
    const root = createWorkspace("ahp-resource-write-default-truncate-");
    const file = fileUri(root, "replace.txt");
    writeFileSync(join(root, "replace.txt"), "LONGER_ORIGINAL");
    await writeText(file, "short");
    assert.strictEqual(readFileSync(join(root, "replace.txt"), "utf8"), "short");
  });
  conformanceTest(context, "resourceDelete removes an empty directory without recursive mode", async function() {
    await initializeClient("resource-delete-empty-directory");
    const root = createWorkspace("ahp-resource-delete-empty-directory-");
    const directory = join(root, "empty");
    mkdirSync(directory);
    await context.client.call("resourceDelete", {
      channel: ROOT_STATE_URI,
      uri: URI.file(directory).toString()
    });
    assert.strictEqual(existsSync(directory), false);
  });
  conformanceTest(context, "resourceCopy, resourceMove, and resourceDelete mutate the tree", async function() {
    await initializeClient("resource-mutate");
    const root = createWorkspace("ahp-resource-mutate-");
    writeFileSync(join(root, "origin.txt"), "MUTATE");
    await context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "origin.txt"),
      destination: fileUri(root, "copy.txt")
    });
    await context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "copy.txt"),
      destination: fileUri(root, "moved.txt")
    });
    await context.client.call("resourceDelete", { channel: ROOT_STATE_URI, uri: fileUri(root, "origin.txt") });
    const listed = await context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: URI.file(root).toString()
    });
    const moved = await context.client.call("resourceRead", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "moved.txt"),
      encoding: ContentEncoding.Utf8
    });
    assert.deepStrictEqual({
      remaining: listed.entries.map((entry) => entry.name).sort(),
      movedContents: moved.data
    }, {
      remaining: ["moved.txt"],
      movedContents: "MUTATE"
    });
  });
  conformanceTest(context, "resource watch reports changes on its subscribed channel", async function() {
    await initializeClient("resource-watch");
    const root = createWorkspace("ahp-resource-watch-");
    const rootUri = URI.file(root).toString();
    const watchedFile = fileUri(root, "watched.txt");
    const watch = await context.client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: rootUri,
      recursive: false
    });
    let subscribed = false;
    try {
      const subscribedWatch = await context.client.call("subscribe", { channel: watch.channel });
      subscribed = true;
      const descriptor = subscribedWatch.snapshot.state;
      context.client.clearReceived();
      const changed = context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "resourceWatch/changed") || getActionEnvelope(n).channel !== watch.channel) {
          return false;
        }
        const action2 = getActionEnvelope(n).action;
        return action2.changes.items.some(
          (change) => change.uri === watchedFile && (change.type === ResourceChangeType.Added || change.type === ResourceChangeType.Updated)
        );
      }, 3e4);
      let changedNotification;
      for (let attempt = 1; attempt <= 30 && !changedNotification; attempt++) {
        await context.client.call("resourceWrite", {
          channel: ROOT_STATE_URI,
          uri: watchedFile,
          data: `WATCHED-${attempt}`,
          encoding: ContentEncoding.Utf8
        });
        changedNotification = await raceTimeout(changed, 1e3);
      }
      const action = getActionEnvelope(changedNotification ?? await changed).action;
      const observed = action.changes.items.find((change) => change.uri === watchedFile);
      assert.deepStrictEqual({
        scheme: URI.parse(watch.channel).scheme,
        descriptor,
        observedUri: observed?.uri,
        observedMutation: observed?.type === ResourceChangeType.Added || observed?.type === ResourceChangeType.Updated
      }, {
        scheme: "ahp-resource-watch",
        descriptor: {
          root: rootUri,
          recursive: false
        },
        observedUri: watchedFile,
        observedMutation: true
      });
    } finally {
      if (subscribed) {
        context.client.notify("unsubscribe", { channel: watch.channel });
      }
    }
  }, !isWindows);
  conformanceTest(context, "resource watch subscription preserves its descriptor", async function() {
    await initializeClient("resource-watch-descriptor");
    const root = createWorkspace("ahp-resource-watch-descriptor-");
    const rootUri = URI.file(root).toString();
    const watch = await context.client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: rootUri,
      recursive: true,
      excludes: { items: ["**/*.tmp"] },
      includes: { items: ["**/*.txt"] }
    });
    const subscribed = await context.client.call("subscribe", { channel: watch.channel });
    assert.deepStrictEqual(subscribed.snapshot.state, {
      root: rootUri,
      recursive: true,
      excludes: { items: ["**/*.tmp"] },
      includes: { items: ["**/*.txt"] }
    });
  });
  conformanceTest(context, "creating a resource watch for a missing root is rejected", async function() {
    await initializeClient("resource-watch-missing");
    const root = createWorkspace("ahp-resource-watch-missing-");
    await assert.rejects(context.client.call("createResourceWatch", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing"),
      recursive: true
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceWrite appends at the end of a file", async function() {
    await initializeClient("resource-append");
    const root = createWorkspace("ahp-resource-append-");
    const file = fileUri(root, "append.txt");
    writeFileSync(join(root, "append.txt"), "BEGIN");
    await writeText(file, "-END", { mode: ResourceWriteMode.Append });
    assert.strictEqual(readFileSync(join(root, "append.txt"), "utf8"), "BEGIN-END");
  });
  conformanceTest(context, "resourceWrite append position counts backwards from EOF", async function() {
    await initializeClient("resource-append-offset");
    const root = createWorkspace("ahp-resource-append-offset-");
    const file = fileUri(root, "append-offset.txt");
    writeFileSync(join(root, "append-offset.txt"), "BEGIN-END");
    await writeText(file, "-MIDDLE", { mode: ResourceWriteMode.Append, position: 4 });
    assert.strictEqual(readFileSync(join(root, "append-offset.txt"), "utf8"), "BEGIN-MIDDLE-END");
  });
  conformanceTest(context, "resourceWrite inserts without replacing existing bytes", async function() {
    await initializeClient("resource-insert");
    const root = createWorkspace("ahp-resource-insert-");
    const file = fileUri(root, "insert.txt");
    writeFileSync(join(root, "insert.txt"), "ABCD");
    await writeText(file, "12", { mode: ResourceWriteMode.Insert, position: 2 });
    assert.strictEqual(readFileSync(join(root, "insert.txt"), "utf8"), "AB12CD");
  });
  conformanceTest(context, "resourceWrite truncates from the requested position", async function() {
    await initializeClient("resource-truncate");
    const root = createWorkspace("ahp-resource-truncate-");
    const file = fileUri(root, "truncate.txt");
    writeFileSync(join(root, "truncate.txt"), "PREFIX-OLD-SUFFIX");
    await writeText(file, "NEW", { mode: ResourceWriteMode.Truncate, position: 7 });
    assert.strictEqual(readFileSync(join(root, "truncate.txt"), "utf8"), "PREFIX-NEW");
  });
  conformanceTest(context, "resourceWrite createOnly rejects an existing file", async function() {
    await initializeClient("resource-create-only");
    const root = createWorkspace("ahp-resource-create-only-");
    const file = fileUri(root, "existing.txt");
    writeFileSync(join(root, "existing.txt"), "original");
    await assert.rejects(writeText(file, "replacement", { createOnly: true }), { code: AhpErrorCodes.AlreadyExists });
    assert.strictEqual(readFileSync(join(root, "existing.txt"), "utf8"), "original");
  });
  conformanceTest(context, "resourceWrite ifMatch rejects a stale etag", async function() {
    await initializeClient("resource-if-match");
    const root = createWorkspace("ahp-resource-if-match-");
    const file = fileUri(root, "etag.txt");
    writeFileSync(join(root, "etag.txt"), "before");
    const resolved = await context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: file
    });
    if (resolved.etag === void 0) {
      this.skip();
    }
    await writeText(file, "first", { ifMatch: resolved.etag });
    await assert.rejects(writeText(file, "stale", { ifMatch: resolved.etag }), { code: AhpErrorCodes.Conflict });
    assert.strictEqual(readFileSync(join(root, "etag.txt"), "utf8"), "first");
  });
  conformanceTest(context, "resourceCopy failIfExists preserves the destination", async function() {
    await initializeClient("resource-copy-conflict");
    const root = createWorkspace("ahp-resource-copy-conflict-");
    writeFileSync(join(root, "source.txt"), "source");
    writeFileSync(join(root, "destination.txt"), "destination");
    await assert.rejects(context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source.txt"),
      destination: fileUri(root, "destination.txt"),
      failIfExists: true
    }), { code: AhpErrorCodes.AlreadyExists });
    assert.strictEqual(readFileSync(join(root, "destination.txt"), "utf8"), "destination");
  });
  conformanceTest(context, "resourceMove failIfExists preserves both files", async function() {
    await initializeClient("resource-move-conflict");
    const root = createWorkspace("ahp-resource-move-conflict-");
    writeFileSync(join(root, "source.txt"), "source");
    writeFileSync(join(root, "destination.txt"), "destination");
    await assert.rejects(context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source.txt"),
      destination: fileUri(root, "destination.txt"),
      failIfExists: true
    }), { code: AhpErrorCodes.AlreadyExists });
    assert.deepStrictEqual({
      source: readFileSync(join(root, "source.txt"), "utf8"),
      destination: readFileSync(join(root, "destination.txt"), "utf8")
    }, {
      source: "source",
      destination: "destination"
    });
  });
  conformanceTest(context, "resourceMkdir rejects a path occupied by a file", async function() {
    await initializeClient("resource-mkdir-file");
    const root = createWorkspace("ahp-resource-mkdir-file-");
    const file = fileUri(root, "occupied");
    writeFileSync(join(root, "occupied"), "file");
    await assert.rejects(context.client.call("resourceMkdir", {
      channel: ROOT_STATE_URI,
      uri: file
    }), { code: AhpErrorCodes.AlreadyExists });
  });
  conformanceTest(context, "resourceDelete recursively removes a directory tree", async function() {
    await initializeClient("resource-delete-tree");
    const root = createWorkspace("ahp-resource-delete-tree-");
    const tree = join(root, "tree");
    mkdirSync(join(tree, "nested"), { recursive: true });
    writeFileSync(join(tree, "nested", "file.txt"), "delete");
    await context.client.call("resourceDelete", {
      channel: ROOT_STATE_URI,
      uri: URI.file(tree).toString(),
      recursive: true
    });
    assert.strictEqual(existsSync(tree), false);
  });
  conformanceTest(context, "resourceWrite decodes base64 content", async function() {
    await initializeClient("resource-base64");
    const root = createWorkspace("ahp-resource-base64-");
    const file = fileUri(root, "base64.txt");
    await context.client.call("resourceWrite", {
      channel: ROOT_STATE_URI,
      uri: file,
      data: Buffer.from("BASE64_CONTENT").toString("base64"),
      encoding: ContentEncoding.Base64
    });
    assert.strictEqual(readFileSync(join(root, "base64.txt"), "utf8"), "BASE64_CONTENT");
  });
  conformanceTest(context, "resourceWrite append creates a missing file", async function() {
    await initializeClient("resource-append-create");
    const root = createWorkspace("ahp-resource-append-create-");
    const file = fileUri(root, "created.txt");
    await writeText(file, "created", { mode: ResourceWriteMode.Append });
    assert.strictEqual(readFileSync(join(root, "created.txt"), "utf8"), "created");
  });
  conformanceTest(context, "resourceWrite insert creates a missing file", async function() {
    await initializeClient("resource-insert-create");
    const root = createWorkspace("ahp-resource-insert-create-");
    const file = fileUri(root, "created.txt");
    await writeText(file, "created", { mode: ResourceWriteMode.Insert, position: 0 });
    assert.strictEqual(readFileSync(join(root, "created.txt"), "utf8"), "created");
  });
  conformanceTest(context, "resourceWrite accepts the current etag", async function() {
    await initializeClient("resource-if-match-current");
    const root = createWorkspace("ahp-resource-if-match-current-");
    const file = fileUri(root, "etag.txt");
    writeFileSync(join(root, "etag.txt"), "before");
    const resolved = await context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: file
    });
    if (resolved.etag === void 0) {
      this.skip();
    }
    await writeText(file, "after", { ifMatch: resolved.etag });
    assert.strictEqual(readFileSync(join(root, "etag.txt"), "utf8"), "after");
  });
  conformanceTest(context, "resourceWrite ifMatch rejects a missing file", async function() {
    await initializeClient("resource-if-match-missing");
    const root = createWorkspace("ahp-resource-if-match-missing-");
    await assert.rejects(writeText(fileUri(root, "missing.txt"), "content", { ifMatch: "missing-etag" }), {
      code: AhpErrorCodes.Conflict
    });
  });
  conformanceTest(context, "resourceCopy recursively copies a directory", async function() {
    await initializeClient("resource-copy-directory");
    const root = createWorkspace("ahp-resource-copy-directory-");
    mkdirSync(join(root, "source", "nested"), { recursive: true });
    writeFileSync(join(root, "source", "nested", "file.txt"), "copied");
    await context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source"),
      destination: fileUri(root, "destination")
    });
    assert.strictEqual(readFileSync(join(root, "destination", "nested", "file.txt"), "utf8"), "copied");
  });
  conformanceTest(context, "resourceCopy overwrites an existing destination by default", async function() {
    await initializeClient("resource-copy-overwrite");
    const root = createWorkspace("ahp-resource-copy-overwrite-");
    writeFileSync(join(root, "source.txt"), "source");
    writeFileSync(join(root, "destination.txt"), "destination");
    await context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source.txt"),
      destination: fileUri(root, "destination.txt")
    });
    assert.strictEqual(readFileSync(join(root, "destination.txt"), "utf8"), "source");
  });
  conformanceTest(context, "resourceCopy reports a missing source", async function() {
    await initializeClient("resource-copy-missing");
    const root = createWorkspace("ahp-resource-copy-missing-");
    await assert.rejects(context.client.call("resourceCopy", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "missing.txt"),
      destination: fileUri(root, "destination.txt")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceMove relocates a directory tree", async function() {
    await initializeClient("resource-move-directory");
    const root = createWorkspace("ahp-resource-move-directory-");
    mkdirSync(join(root, "source", "nested"), { recursive: true });
    writeFileSync(join(root, "source", "nested", "file.txt"), "moved");
    await context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source"),
      destination: fileUri(root, "destination")
    });
    assert.deepStrictEqual({
      sourceExists: existsSync(join(root, "source")),
      contents: readFileSync(join(root, "destination", "nested", "file.txt"), "utf8")
    }, {
      sourceExists: false,
      contents: "moved"
    });
  });
  conformanceTest(context, "resourceMove overwrites an existing destination by default", async function() {
    await initializeClient("resource-move-overwrite");
    const root = createWorkspace("ahp-resource-move-overwrite-");
    writeFileSync(join(root, "source.txt"), "source");
    writeFileSync(join(root, "destination.txt"), "destination");
    await context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "source.txt"),
      destination: fileUri(root, "destination.txt")
    });
    assert.deepStrictEqual({
      sourceExists: existsSync(join(root, "source.txt")),
      contents: readFileSync(join(root, "destination.txt"), "utf8")
    }, {
      sourceExists: false,
      contents: "source"
    });
  });
  conformanceTest(context, "resourceMove reports a missing source", async function() {
    await initializeClient("resource-move-missing");
    const root = createWorkspace("ahp-resource-move-missing-");
    await assert.rejects(context.client.call("resourceMove", {
      channel: ROOT_STATE_URI,
      source: fileUri(root, "missing.txt"),
      destination: fileUri(root, "destination.txt")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceDelete requires recursive mode for a non-empty directory", async function() {
    await initializeClient("resource-delete-non-recursive");
    const root = createWorkspace("ahp-resource-delete-non-recursive-");
    const directory = join(root, "directory");
    mkdirSync(directory);
    writeFileSync(join(directory, "file.txt"), "preserved");
    await assert.rejects(context.client.call("resourceDelete", {
      channel: ROOT_STATE_URI,
      uri: URI.file(directory).toString()
    }));
    assert.strictEqual(readFileSync(join(directory, "file.txt"), "utf8"), "preserved");
  });
  conformanceTest(context, "resourceDelete reports a missing resource", async function() {
    await initializeClient("resource-delete-missing");
    const root = createWorkspace("ahp-resource-delete-missing-");
    await assert.rejects(context.client.call("resourceDelete", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing.txt")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceRead reports a missing file", async function() {
    await initializeClient("resource-read-missing");
    const root = createWorkspace("ahp-resource-read-missing-");
    await assert.rejects(context.client.call("resourceRead", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing.txt")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceList reports a missing directory", async function() {
    await initializeClient("resource-list-missing");
    const root = createWorkspace("ahp-resource-list-missing-");
    await assert.rejects(context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "resourceList rejects a file resource", async function() {
    await initializeClient("resource-list-file");
    const root = createWorkspace("ahp-resource-list-file-");
    const file = fileUri(root, "file.txt");
    writeFileSync(join(root, "file.txt"), "content");
    await assert.rejects(context.client.call("resourceList", {
      channel: ROOT_STATE_URI,
      uri: file
    }));
  });
  conformanceTest(context, "resourceWrite reports a missing parent directory", async function() {
    await initializeClient("resource-write-missing-parent");
    const root = createWorkspace("ahp-resource-write-missing-parent-");
    await assert.rejects(writeText(fileUri(root, "missing", "file.txt"), "content"), {
      code: AhpErrorCodes.NotFound
    });
  });
  conformanceTest(context, "resourceResolve reports a missing resource", async function() {
    await initializeClient("resource-resolve-missing");
    const root = createWorkspace("ahp-resource-resolve-missing-");
    await assert.rejects(context.client.call("resourceResolve", {
      channel: ROOT_STATE_URI,
      uri: fileUri(root, "missing")
    }), { code: AhpErrorCodes.NotFound });
  });
  conformanceTest(context, "host reads a client-hosted plugin through reverse resource requests", async function() {
    const pluginRoot = createWorkspace("ahp-client-plugin-");
    writeFileSync(join(pluginRoot, "plugin.json"), JSON.stringify({ name: "e2e-client-plugin", version: "1.0.0" }));
    const sessionUri = await createRealSession(context.client, config, `client-fs-${config.provider}`, createdSessions, URI.file(createWorkspace("ahp-client-fs-ws-")));
    context.client.clearReceived();
    context.client.dispatch({
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: `client-fs-${config.provider}`,
          displayName: "Test Client",
          tools: [],
          customizations: [{
            id: generateUuid(),
            uri: URI.file(pluginRoot).toString(),
            name: "e2e-client-plugin",
            type: CustomizationType.Plugin,
            nonce: "nonce-1"
          }]
        }
      }
    });
    const updated = await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "session/customizationUpdated")) {
        return false;
      }
      const customization = getActionEnvelope(n).action.customization;
      return customization?.uri === URI.file(pluginRoot).toString() && customization?.load?.kind !== void 0;
    }, 6e4);
    const loadKind = getActionEnvelope(updated).action.customization?.load?.kind;
    const pluginRootPaths = [pluginRoot, realpathSync(pluginRoot)].map((path) => URI.file(path).fsPath);
    const servedForPlugin = context.client.servedReverseRequests.filter((request) => {
      const uri = request.uri;
      if (uri === void 0) {
        return false;
      }
      const requested = URI.parse(uri).fsPath;
      return pluginRootPaths.some((root) => requested.startsWith(root));
    });
    assert.deepStrictEqual({
      loadKind,
      reachedBackToClient: servedForPlugin.length > 0,
      readThePluginFile: servedForPlugin.some((request) => request.method === "resourceRead")
    }, {
      loadKind: CustomizationLoadStatus.Loaded,
      reachedBackToClient: true,
      readThePluginFile: true
    }, `served reverse requests: ${JSON.stringify(context.client.servedReverseRequests)}`);
  });
}
export {
  defineClientFilesystemTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcY2xpZW50RmlsZXN5c3RlbVN1aXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBUaGUgZmlsZXN5c3RlbSBoYWxmIG9mIHRoZSBBZ2VudCBIb3N0IFByb3RvY29sLCBpbiBib3RoIGRpcmVjdGlvbnMuXG4gKlxuICogKipDbGllbnQgdG8gc2VydmVyKiogXHUyMDE0IHRoZSBgcmVzb3VyY2UqYCBjb21tYW5kIHN1cmZhY2UsIGV4ZWN1dGVkIGJ5IHRoZSBob3N0XG4gKiBhZ2FpbnN0IHRoZSBmaWxlc3lzdGVtIGl0IHJ1bnMgb24uXG4gKlxuICogKipTZXJ2ZXIgdG8gY2xpZW50KiogXHUyMDE0IHRoZSBzYW1lIHN1cmZhY2UgdHJhdmVsbGluZyB0aGUgb3RoZXIgd2F5LiBUaGUgaG9zdFxuICogYWRkcmVzc2VzIGNsaWVudC1zaWRlIGZpbGVzIHRocm91Z2ggdGhlIGB2c2NvZGUtYWdlbnQtY2xpZW50YCBzY2hlbWUgYW5kXG4gKiBzZXJ2ZXMgdGhlbSBieSBzZW5kaW5nIHJldmVyc2UgcmVxdWVzdHMgYmFjayBkb3duIHRoZSBjb25uZWN0aW9uLCBzbyBhIGZpbGVcbiAqIHRoYXQgZXhpc3RzIG9ubHkgb24gdGhlIGNsaWVudCBpcyBzdGlsbCByZWFjaGFibGUuIE5vdGhpbmcgZWxzZSBpbiB0aGUgRTJFXG4gKiBzdWl0ZSBwdXRzIHRoZSBob3N0IGluIHRoYXQgY29uZmlndXJhdGlvbi5cbiAqXG4gKiBCb3RoIGFyZSBob3N0LW93bmVkIGFuZCBwcm92aWRlci1pbnZhcmlhbnQsIHNvIHRoZXkgbGl2ZSBpbiB0aGUgY29uZm9ybWFuY2VcbiAqIHRpZXIgYW5kIG5ldmVyIGNyb3NzIHRoZSBtb2RlbCBib3VuZGFyeS5cbiAqL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIG1rZHRlbXBTeW5jLCByZWFkRmlsZVN5bmMsIHJlYWxwYXRoU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC92ZXJzaW9uL3JlZ2lzdHJ5LmpzJztcbmltcG9ydCB0eXBlIHtcblx0Q3JlYXRlUmVzb3VyY2VXYXRjaFJlc3VsdCxcblx0UmVzb3VyY2VMaXN0UmVzdWx0LFxuXHRSZXNvdXJjZVJlYWRSZXN1bHQsXG5cdFJlc291cmNlUmVzb2x2ZVJlc3VsdCxcblx0U3Vic2NyaWJlUmVzdWx0LFxufSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGVudEVuY29kaW5nLCBSZXNvdXJjZVR5cGUsIFJlc291cmNlV3JpdGVNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNoYW5nZVR5cGUsIHR5cGUgUmVzb3VyY2VDaGFuZ2UsIHR5cGUgUmVzb3VyY2VXYXRjaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLXJlc291cmNlLXdhdGNoL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWhwRXJyb3JDb2RlcywgdHlwZSBBaHBOb3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBDdXN0b21pemF0aW9uVHlwZSwgUk9PVF9TVEFURV9VUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlYWxTZXNzaW9uIH0gZnJvbSAnLi4vaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25FbnZlbG9wZSwgaXNBY3Rpb25Ob3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi9zZXJ2ZXJJbnRlZ3JhdGlvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IGNvbmZvcm1hbmNlVGVzdCwgdHlwZSBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQgfSBmcm9tICcuL2UyZVRlc3RDb250ZXh0LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNsaWVudEZpbGVzeXN0ZW1UZXN0cyhjb250ZXh0OiBJQWdlbnRIb3N0RTJFVGVzdENvbnRleHQpOiB2b2lkIHtcblx0Y29uc3QgeyBjb25maWcsIGNyZWF0ZWRTZXNzaW9ucywgdGVtcERpcnMsIGlzV2luZG93cyB9ID0gY29udGV4dDtcblxuXHRmdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2UocHJlZml4OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksIHByZWZpeCkpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRyZXR1cm4gd29ya3NwYWNlO1xuXHR9XG5cblx0LyoqIEEgYGZpbGU6YCBVUkkgc3RyaW5nIHVuZGVyIGByb290YCwgYXMgdGhlIHByb3RvY29sIGNhcnJpZXMgdGhlbS4gKi9cblx0ZnVuY3Rpb24gZmlsZVVyaShyb290OiBzdHJpbmcsIC4uLnNlZ21lbnRzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFVSSS5maWxlKGpvaW4ocm9vdCwgLi4uc2VnbWVudHMpKS50b1N0cmluZygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXBsZXRlcyB0aGUgaGFuZHNoYWtlLiBSZXNvdXJjZSBjb21tYW5kcyBhcmUgb25seSByb3V0ZWQgb25jZSB0aGVcblx0ICogY29ubmVjdGlvbiBoYXMgYSByZWdpc3RlcmVkIGNsaWVudDsgYmVmb3JlIHRoYXQgdGhlIHNlcnZlciBhbnN3ZXJzXG5cdCAqIGBNZXRob2Qgbm90IGZvdW5kYC5cblx0ICovXG5cdGFzeW5jIGZ1bmN0aW9uIGluaXRpYWxpemVDbGllbnQocHVycG9zZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uczogW1BST1RPQ09MX1ZFUlNJT05dLFxuXHRcdFx0Y2xpZW50SWQ6IGAke3B1cnBvc2V9LSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3cml0ZVRleHQodXJpOiBzdHJpbmcsIGRhdGE6IHN0cmluZywgb3B0aW9uczoge1xuXHRcdHJlYWRvbmx5IGNyZWF0ZU9ubHk/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGlmTWF0Y2g/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgbW9kZT86IFJlc291cmNlV3JpdGVNb2RlO1xuXHRcdHJlYWRvbmx5IHBvc2l0aW9uPzogbnVtYmVyO1xuXHR9ID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZVdyaXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmksXG5cdFx0XHRkYXRhLFxuXHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHR9KTtcblx0fVxuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2UgY29tbWFuZHMgcm91bmQtdHJpcCBhIGZpbGUgdGhyb3VnaCB0aGUgaG9zdCBmaWxlc3lzdGVtJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLXJvdW5kdHJpcCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1ydy0nKTtcblx0XHRjb25zdCBkaXJlY3RvcnkgPSBmaWxlVXJpKHJvb3QsICduZXN0ZWQnLCAnaW5uZXInKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAnbmVzdGVkJywgJ2lubmVyJywgJ25vdGUudHh0Jyk7XG5cblx0XHQvLyBOZWdvdGlhdGluZyBhY2Nlc3MgaXMgdGhlIGRvY3VtZW50ZWQgcHJlYW1ibGUgdG8gdXNpbmcgdGhlIHJlc291cmNlXG5cdFx0Ly8gY29tbWFuZHMsIHNvIHRoZSByb3VuZC10cmlwIHN0YXJ0cyB3aGVyZSBhIHJlYWwgY2FsbGVyIHdvdWxkLlxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlUmVxdWVzdCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IFVSSS5maWxlKHJvb3QpLnRvU3RyaW5nKCksIHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Ly8gYG1rZGlyIC1wYCBzZW1hbnRpY3MsIGFuZCBpZGVtcG90ZW50IGZvciBhIGRpcmVjdG9yeSB0aGF0IGV4aXN0cy5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZU1rZGlyJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkaXJlY3RvcnkgfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNa2RpcicsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZGlyZWN0b3J5IH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlV3JpdGUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBmaWxlLCBkYXRhOiAnUkVTT1VSQ0VfUk9VTkRUUklQJywgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVhZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VSZWFkUmVzdWx0PigncmVzb3VyY2VSZWFkJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZmlsZSwgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc29sdmVkRGlyZWN0b3J5ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+KCdyZXNvdXJjZVJlc29sdmUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBkaXJlY3RvcnksXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRGaWxlID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+KCdyZXNvdXJjZVJlc29sdmUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBmaWxlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkYXRhOiByZWFkLmRhdGEsXG5cdFx0XHRlbmNvZGluZzogcmVhZC5lbmNvZGluZyxcblx0XHRcdGRpcmVjdG9yeVR5cGU6IHJlc29sdmVkRGlyZWN0b3J5LnR5cGUsXG5cdFx0XHRmaWxlVHlwZTogcmVzb2x2ZWRGaWxlLnR5cGUsXG5cdFx0XHRzaXplOiByZXNvbHZlZEZpbGUuc2l6ZSxcblx0XHR9LCB7XG5cdFx0XHRkYXRhOiAnUkVTT1VSQ0VfUk9VTkRUUklQJyxcblx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdGRpcmVjdG9yeVR5cGU6IFJlc291cmNlVHlwZS5EaXJlY3RvcnksXG5cdFx0XHRmaWxlVHlwZTogUmVzb3VyY2VUeXBlLkZpbGUsXG5cdFx0XHRzaXplOiAnUkVTT1VSQ0VfUk9VTkRUUklQJy5sZW5ndGgsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VMaXN0IHJlcG9ydHMgZGlyZWN0b3J5IGVudHJpZXMgYW5kIHRoZWlyIHR5cGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWxpc3QnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbGlzdC0nKTtcblx0XHRta2RpclN5bmMoam9pbihyb290LCAnY2hpbGQtZGlyJykpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnY2hpbGQtZmlsZS50eHQnKSwgJ0NISUxEJyk7XG5cblx0XHRjb25zdCBsaXN0ZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFJlc291cmNlTGlzdFJlc3VsdD4oJ3Jlc291cmNlTGlzdCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IFVSSS5maWxlKHJvb3QpLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5saXN0ZWQuZW50cmllc10uc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSksIFtcblx0XHRcdHsgbmFtZTogJ2NoaWxkLWRpcicsIHR5cGU6ICdkaXJlY3RvcnknIH0sXG5cdFx0XHR7IG5hbWU6ICdjaGlsZC1maWxlLnR4dCcsIHR5cGU6ICdmaWxlJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlTGlzdCByZXR1cm5zIGFuIGVtcHR5IGNvbGxlY3Rpb24gZm9yIGFuIGVtcHR5IGRpcmVjdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1saXN0LWVtcHR5Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWxpc3QtZW1wdHktJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFJlc291cmNlTGlzdFJlc3VsdD4oJ3Jlc291cmNlTGlzdCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBVUkkuZmlsZShyb290KS50b1N0cmluZygpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZW50cmllcywgW10pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgdHJ1bmNhdGVzIGFuIGV4aXN0aW5nIGZpbGUgYnkgZGVmYXVsdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS13cml0ZS1kZWZhdWx0LXRydW5jYXRlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLXdyaXRlLWRlZmF1bHQtdHJ1bmNhdGUtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ3JlcGxhY2UudHh0Jyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdyZXBsYWNlLnR4dCcpLCAnTE9OR0VSX09SSUdJTkFMJyk7XG5cblx0XHRhd2FpdCB3cml0ZVRleHQoZmlsZSwgJ3Nob3J0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ3JlcGxhY2UudHh0JyksICd1dGY4JyksICdzaG9ydCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlRGVsZXRlIHJlbW92ZXMgYW4gZW1wdHkgZGlyZWN0b3J5IHdpdGhvdXQgcmVjdXJzaXZlIG1vZGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtZGVsZXRlLWVtcHR5LWRpcmVjdG9yeScpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1kZWxldGUtZW1wdHktZGlyZWN0b3J5LScpO1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IGpvaW4ocm9vdCwgJ2VtcHR5Jyk7XG5cdFx0bWtkaXJTeW5jKGRpcmVjdG9yeSk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZURlbGV0ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBVUkkuZmlsZShkaXJlY3RvcnkpLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhkaXJlY3RvcnkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VDb3B5LCByZXNvdXJjZU1vdmUsIGFuZCByZXNvdXJjZURlbGV0ZSBtdXRhdGUgdGhlIHRyZWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtbXV0YXRlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLW11dGF0ZS0nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ29yaWdpbi50eHQnKSwgJ01VVEFURScpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VDb3B5Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHNvdXJjZTogZmlsZVVyaShyb290LCAnb3JpZ2luLnR4dCcpLCBkZXN0aW5hdGlvbjogZmlsZVVyaShyb290LCAnY29weS50eHQnKSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZU1vdmUnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgc291cmNlOiBmaWxlVXJpKHJvb3QsICdjb3B5LnR4dCcpLCBkZXN0aW5hdGlvbjogZmlsZVVyaShyb290LCAnbW92ZWQudHh0JyksXG5cdFx0fSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VEZWxldGUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IGZpbGVVcmkocm9vdCwgJ29yaWdpbi50eHQnKSB9KTtcblxuXHRcdGNvbnN0IGxpc3RlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VMaXN0UmVzdWx0PigncmVzb3VyY2VMaXN0Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogVVJJLmZpbGUocm9vdCkudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0XHRjb25zdCBtb3ZlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VSZWFkUmVzdWx0PigncmVzb3VyY2VSZWFkJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogZmlsZVVyaShyb290LCAnbW92ZWQudHh0JyksIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtYWluaW5nOiBsaXN0ZWQuZW50cmllcy5tYXAoZW50cnkgPT4gZW50cnkubmFtZSkuc29ydCgpLFxuXHRcdFx0bW92ZWRDb250ZW50czogbW92ZWQuZGF0YSxcblx0XHR9LCB7XG5cdFx0XHRyZW1haW5pbmc6IFsnbW92ZWQudHh0J10sXG5cdFx0XHRtb3ZlZENvbnRlbnRzOiAnTVVUQVRFJyxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZSB3YXRjaCByZXBvcnRzIGNoYW5nZXMgb24gaXRzIHN1YnNjcmliZWQgY2hhbm5lbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS13YXRjaCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS13YXRjaC0nKTtcblx0XHRjb25zdCByb290VXJpID0gVVJJLmZpbGUocm9vdCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCB3YXRjaGVkRmlsZSA9IGZpbGVVcmkocm9vdCwgJ3dhdGNoZWQudHh0Jyk7XG5cblx0XHRjb25zdCB3YXRjaCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8Q3JlYXRlUmVzb3VyY2VXYXRjaFJlc3VsdD4oJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiByb290VXJpLCByZWN1cnNpdmU6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdGxldCBzdWJzY3JpYmVkID0gZmFsc2U7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaWJlZFdhdGNoID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHdhdGNoLmNoYW5uZWwgfSk7XG5cdFx0XHRzdWJzY3JpYmVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBzdWJzY3JpYmVkV2F0Y2guc25hcHNob3QhLnN0YXRlIGFzIFJlc291cmNlV2F0Y2hTdGF0ZTtcblx0XHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Jlc291cmNlV2F0Y2gvY2hhbmdlZCcpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IHdhdGNoLmNoYW5uZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVhZG9ubHkgY2hhbmdlczogeyByZWFkb25seSBpdGVtczogcmVhZG9ubHkgUmVzb3VyY2VDaGFuZ2VbXSB9IH07XG5cdFx0XHRcdHJldHVybiBhY3Rpb24uY2hhbmdlcy5pdGVtcy5zb21lKGNoYW5nZSA9PlxuXHRcdFx0XHRcdGNoYW5nZS51cmkgPT09IHdhdGNoZWRGaWxlXG5cdFx0XHRcdFx0JiYgKGNoYW5nZS50eXBlID09PSBSZXNvdXJjZUNoYW5nZVR5cGUuQWRkZWQgfHwgY2hhbmdlLnR5cGUgPT09IFJlc291cmNlQ2hhbmdlVHlwZS5VcGRhdGVkKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSwgMzBfMDAwKTtcblxuXHRcdFx0bGV0IGNoYW5nZWROb3RpZmljYXRpb246IEFocE5vdGlmaWNhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdC8vIFRoZSBPUyB3YXRjaGVyIGF0dGFjaGVzIGFzeW5jaHJvbm91c2x5LCBzbyBrZWVwIHByb2R1Y2luZyBjaGFuZ2UgZWRnZXMgdW50aWwgaXQgaXMgcmVhZHkuXG5cdFx0XHRmb3IgKGxldCBhdHRlbXB0ID0gMTsgYXR0ZW1wdCA8PSAzMCAmJiAhY2hhbmdlZE5vdGlmaWNhdGlvbjsgYXR0ZW1wdCsrKSB7XG5cdFx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlV3JpdGUnLCB7XG5cdFx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogd2F0Y2hlZEZpbGUsIGRhdGE6IGBXQVRDSEVELSR7YXR0ZW1wdH1gLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjaGFuZ2VkTm90aWZpY2F0aW9uID0gYXdhaXQgcmFjZVRpbWVvdXQoY2hhbmdlZCwgMV8wMDApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShjaGFuZ2VkTm90aWZpY2F0aW9uID8/IGF3YWl0IGNoYW5nZWQpLmFjdGlvbiBhcyB7IHJlYWRvbmx5IGNoYW5nZXM6IHsgcmVhZG9ubHkgaXRlbXM6IHJlYWRvbmx5IFJlc291cmNlQ2hhbmdlW10gfSB9O1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZWQgPSBhY3Rpb24uY2hhbmdlcy5pdGVtcy5maW5kKGNoYW5nZSA9PiBjaGFuZ2UudXJpID09PSB3YXRjaGVkRmlsZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2NoZW1lOiBVUkkucGFyc2Uod2F0Y2guY2hhbm5lbCkuc2NoZW1lLFxuXHRcdFx0XHRkZXNjcmlwdG9yLFxuXHRcdFx0XHRvYnNlcnZlZFVyaTogb2JzZXJ2ZWQ/LnVyaSxcblx0XHRcdFx0b2JzZXJ2ZWRNdXRhdGlvbjogb2JzZXJ2ZWQ/LnR5cGUgPT09IFJlc291cmNlQ2hhbmdlVHlwZS5BZGRlZCB8fCBvYnNlcnZlZD8udHlwZSA9PT0gUmVzb3VyY2VDaGFuZ2VUeXBlLlVwZGF0ZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNjaGVtZTogJ2FocC1yZXNvdXJjZS13YXRjaCcsXG5cdFx0XHRcdGRlc2NyaXB0b3I6IHtcblx0XHRcdFx0XHRyb290OiByb290VXJpLFxuXHRcdFx0XHRcdHJlY3Vyc2l2ZTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9ic2VydmVkVXJpOiB3YXRjaGVkRmlsZSxcblx0XHRcdFx0b2JzZXJ2ZWRNdXRhdGlvbjogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoc3Vic2NyaWJlZCkge1xuXHRcdFx0XHRjb250ZXh0LmNsaWVudC5ub3RpZnkoJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiB3YXRjaC5jaGFubmVsIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSwgIWlzV2luZG93cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZSB3YXRjaCBzdWJzY3JpcHRpb24gcHJlc2VydmVzIGl0cyBkZXNjcmlwdG9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLXdhdGNoLWRlc2NyaXB0b3InKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2Utd2F0Y2gtZGVzY3JpcHRvci0nKTtcblx0XHRjb25zdCByb290VXJpID0gVVJJLmZpbGUocm9vdCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCB3YXRjaCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8eyBjaGFubmVsOiBzdHJpbmcgfT4oJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHVyaTogcm9vdFVyaSxcblx0XHRcdHJlY3Vyc2l2ZTogdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVzOiB7IGl0ZW1zOiBbJyoqLyoudG1wJ10gfSxcblx0XHRcdGluY2x1ZGVzOiB7IGl0ZW1zOiBbJyoqLyoudHh0J10gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogd2F0Y2guY2hhbm5lbCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3Vic2NyaWJlZC5zbmFwc2hvdCEuc3RhdGUgYXMgUmVzb3VyY2VXYXRjaFN0YXRlLCB7XG5cdFx0XHRyb290OiByb290VXJpLFxuXHRcdFx0cmVjdXJzaXZlOiB0cnVlLFxuXHRcdFx0ZXhjbHVkZXM6IHsgaXRlbXM6IFsnKiovKi50bXAnXSB9LFxuXHRcdFx0aW5jbHVkZXM6IHsgaXRlbXM6IFsnKiovKi50eHQnXSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NyZWF0aW5nIGEgcmVzb3VyY2Ugd2F0Y2ggZm9yIGEgbWlzc2luZyByb290IGlzIHJlamVjdGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLXdhdGNoLW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2Utd2F0Y2gtbWlzc2luZy0nKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ2NyZWF0ZVJlc291cmNlV2F0Y2gnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHVyaTogZmlsZVVyaShyb290LCAnbWlzc2luZycpLFxuXHRcdFx0cmVjdXJzaXZlOiB0cnVlLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VXcml0ZSBhcHBlbmRzIGF0IHRoZSBlbmQgb2YgYSBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWFwcGVuZCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1hcHBlbmQtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ2FwcGVuZC50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2FwcGVuZC50eHQnKSwgJ0JFR0lOJyk7XG5cblx0XHRhd2FpdCB3cml0ZVRleHQoZmlsZSwgJy1FTkQnLCB7IG1vZGU6IFJlc291cmNlV3JpdGVNb2RlLkFwcGVuZCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnYXBwZW5kLnR4dCcpLCAndXRmOCcpLCAnQkVHSU4tRU5EJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VXcml0ZSBhcHBlbmQgcG9zaXRpb24gY291bnRzIGJhY2t3YXJkcyBmcm9tIEVPRicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1hcHBlbmQtb2Zmc2V0Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWFwcGVuZC1vZmZzZXQtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ2FwcGVuZC1vZmZzZXQudHh0Jyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdhcHBlbmQtb2Zmc2V0LnR4dCcpLCAnQkVHSU4tRU5EJyk7XG5cblx0XHRhd2FpdCB3cml0ZVRleHQoZmlsZSwgJy1NSURETEUnLCB7IG1vZGU6IFJlc291cmNlV3JpdGVNb2RlLkFwcGVuZCwgcG9zaXRpb246IDQgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2FwcGVuZC1vZmZzZXQudHh0JyksICd1dGY4JyksICdCRUdJTi1NSURETEUtRU5EJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VXcml0ZSBpbnNlcnRzIHdpdGhvdXQgcmVwbGFjaW5nIGV4aXN0aW5nIGJ5dGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWluc2VydCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1pbnNlcnQtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ2luc2VydC50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2luc2VydC50eHQnKSwgJ0FCQ0QnKTtcblxuXHRcdGF3YWl0IHdyaXRlVGV4dChmaWxlLCAnMTInLCB7IG1vZGU6IFJlc291cmNlV3JpdGVNb2RlLkluc2VydCwgcG9zaXRpb246IDIgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2luc2VydC50eHQnKSwgJ3V0ZjgnKSwgJ0FCMTJDRCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgdHJ1bmNhdGVzIGZyb20gdGhlIHJlcXVlc3RlZCBwb3NpdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS10cnVuY2F0ZScpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS10cnVuY2F0ZS0nKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAndHJ1bmNhdGUudHh0Jyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICd0cnVuY2F0ZS50eHQnKSwgJ1BSRUZJWC1PTEQtU1VGRklYJyk7XG5cblx0XHRhd2FpdCB3cml0ZVRleHQoZmlsZSwgJ05FVycsIHsgbW9kZTogUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGUsIHBvc2l0aW9uOiA3IH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICd0cnVuY2F0ZS50eHQnKSwgJ3V0ZjgnKSwgJ1BSRUZJWC1ORVcnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZVdyaXRlIGNyZWF0ZU9ubHkgcmVqZWN0cyBhbiBleGlzdGluZyBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWNyZWF0ZS1vbmx5Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWNyZWF0ZS1vbmx5LScpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICdleGlzdGluZy50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2V4aXN0aW5nLnR4dCcpLCAnb3JpZ2luYWwnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHdyaXRlVGV4dChmaWxlLCAncmVwbGFjZW1lbnQnLCB7IGNyZWF0ZU9ubHk6IHRydWUgfSksIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5BbHJlYWR5RXhpc3RzIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnZXhpc3RpbmcudHh0JyksICd1dGY4JyksICdvcmlnaW5hbCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgaWZNYXRjaCByZWplY3RzIGEgc3RhbGUgZXRhZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1pZi1tYXRjaCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1pZi1tYXRjaC0nKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAnZXRhZy50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2V0YWcudHh0JyksICdiZWZvcmUnKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PigncmVzb3VyY2VSZXNvbHZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGUsXG5cdFx0fSk7XG5cdFx0aWYgKHJlc29sdmVkLmV0YWcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5za2lwKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHdyaXRlVGV4dChmaWxlLCAnZmlyc3QnLCB7IGlmTWF0Y2g6IHJlc29sdmVkLmV0YWcgfSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyh3cml0ZVRleHQoZmlsZSwgJ3N0YWxlJywgeyBpZk1hdGNoOiByZXNvbHZlZC5ldGFnIH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuQ29uZmxpY3QgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdldGFnLnR4dCcpLCAndXRmOCcpLCAnZmlyc3QnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZUNvcHkgZmFpbElmRXhpc3RzIHByZXNlcnZlcyB0aGUgZGVzdGluYXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtY29weS1jb25mbGljdCcpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1jb3B5LWNvbmZsaWN0LScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnc291cmNlLnR4dCcpLCAnc291cmNlJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSwgJ2Rlc3RpbmF0aW9uJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZUNvcHknLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHNvdXJjZTogZmlsZVVyaShyb290LCAnc291cmNlLnR4dCcpLFxuXHRcdFx0ZGVzdGluYXRpb246IGZpbGVVcmkocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLFxuXHRcdFx0ZmFpbElmRXhpc3RzOiB0cnVlLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuQWxyZWFkeUV4aXN0cyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLCAndXRmOCcpLCAnZGVzdGluYXRpb24nKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZU1vdmUgZmFpbElmRXhpc3RzIHByZXNlcnZlcyBib3RoIGZpbGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLW1vdmUtY29uZmxpY3QnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbW92ZS1jb25mbGljdC0nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ3NvdXJjZS50eHQnKSwgJ3NvdXJjZScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnZGVzdGluYXRpb24udHh0JyksICdkZXN0aW5hdGlvbicpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNb3ZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzb3VyY2U6IGZpbGVVcmkocm9vdCwgJ3NvdXJjZS50eHQnKSxcblx0XHRcdGRlc3RpbmF0aW9uOiBmaWxlVXJpKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSxcblx0XHRcdGZhaWxJZkV4aXN0czogdHJ1ZSxcblx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2U6IHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdzb3VyY2UudHh0JyksICd1dGY4JyksXG5cdFx0XHRkZXN0aW5hdGlvbjogcmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLCAndXRmOCcpLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZTogJ3NvdXJjZScsXG5cdFx0XHRkZXN0aW5hdGlvbjogJ2Rlc3RpbmF0aW9uJyxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZU1rZGlyIHJlamVjdHMgYSBwYXRoIG9jY3VwaWVkIGJ5IGEgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1ta2Rpci1maWxlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLW1rZGlyLWZpbGUtJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGZpbGVVcmkocm9vdCwgJ29jY3VwaWVkJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdvY2N1cGllZCcpLCAnZmlsZScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNa2RpcicsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuQWxyZWFkeUV4aXN0cyB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZURlbGV0ZSByZWN1cnNpdmVseSByZW1vdmVzIGEgZGlyZWN0b3J5IHRyZWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtZGVsZXRlLXRyZWUnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtZGVsZXRlLXRyZWUtJyk7XG5cdFx0Y29uc3QgdHJlZSA9IGpvaW4ocm9vdCwgJ3RyZWUnKTtcblx0XHRta2RpclN5bmMoam9pbih0cmVlLCAnbmVzdGVkJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbih0cmVlLCAnbmVzdGVkJywgJ2ZpbGUudHh0JyksICdkZWxldGUnKTtcblxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlRGVsZXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IFVSSS5maWxlKHRyZWUpLnRvU3RyaW5nKCksXG5cdFx0XHRyZWN1cnNpdmU6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyh0cmVlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgZGVjb2RlcyBiYXNlNjQgY29udGVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1iYXNlNjQnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtYmFzZTY0LScpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICdiYXNlNjQudHh0Jyk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZVdyaXRlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGUsXG5cdFx0XHRkYXRhOiBCdWZmZXIuZnJvbSgnQkFTRTY0X0NPTlRFTlQnKS50b1N0cmluZygnYmFzZTY0JyksXG5cdFx0XHRlbmNvZGluZzogQ29udGVudEVuY29kaW5nLkJhc2U2NCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnYmFzZTY0LnR4dCcpLCAndXRmOCcpLCAnQkFTRTY0X0NPTlRFTlQnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZVdyaXRlIGFwcGVuZCBjcmVhdGVzIGEgbWlzc2luZyBmaWxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWFwcGVuZC1jcmVhdGUnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtYXBwZW5kLWNyZWF0ZS0nKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAnY3JlYXRlZC50eHQnKTtcblxuXHRcdGF3YWl0IHdyaXRlVGV4dChmaWxlLCAnY3JlYXRlZCcsIHsgbW9kZTogUmVzb3VyY2VXcml0ZU1vZGUuQXBwZW5kIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdjcmVhdGVkLnR4dCcpLCAndXRmOCcpLCAnY3JlYXRlZCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgaW5zZXJ0IGNyZWF0ZXMgYSBtaXNzaW5nIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtaW5zZXJ0LWNyZWF0ZScpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1pbnNlcnQtY3JlYXRlLScpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICdjcmVhdGVkLnR4dCcpO1xuXG5cdFx0YXdhaXQgd3JpdGVUZXh0KGZpbGUsICdjcmVhdGVkJywgeyBtb2RlOiBSZXNvdXJjZVdyaXRlTW9kZS5JbnNlcnQsIHBvc2l0aW9uOiAwIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdjcmVhdGVkLnR4dCcpLCAndXRmOCcpLCAnY3JlYXRlZCcpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlV3JpdGUgYWNjZXB0cyB0aGUgY3VycmVudCBldGFnJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWlmLW1hdGNoLWN1cnJlbnQnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtaWYtbWF0Y2gtY3VycmVudC0nKTtcblx0XHRjb25zdCBmaWxlID0gZmlsZVVyaShyb290LCAnZXRhZy50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ2V0YWcudHh0JyksICdiZWZvcmUnKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PigncmVzb3VyY2VSZXNvbHZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGUsXG5cdFx0fSk7XG5cdFx0aWYgKHJlc29sdmVkLmV0YWcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5za2lwKCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgd3JpdGVUZXh0KGZpbGUsICdhZnRlcicsIHsgaWZNYXRjaDogcmVzb2x2ZWQuZXRhZyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnZXRhZy50eHQnKSwgJ3V0ZjgnKSwgJ2FmdGVyJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VXcml0ZSBpZk1hdGNoIHJlamVjdHMgYSBtaXNzaW5nIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtaWYtbWF0Y2gtbWlzc2luZycpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1pZi1tYXRjaC1taXNzaW5nLScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMod3JpdGVUZXh0KGZpbGVVcmkocm9vdCwgJ21pc3NpbmcudHh0JyksICdjb250ZW50JywgeyBpZk1hdGNoOiAnbWlzc2luZy1ldGFnJyB9KSwge1xuXHRcdFx0Y29kZTogQWhwRXJyb3JDb2Rlcy5Db25mbGljdCxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZUNvcHkgcmVjdXJzaXZlbHkgY29waWVzIGEgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWNvcHktZGlyZWN0b3J5Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWNvcHktZGlyZWN0b3J5LScpO1xuXHRcdG1rZGlyU3luYyhqb2luKHJvb3QsICdzb3VyY2UnLCAnbmVzdGVkJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnc291cmNlJywgJ25lc3RlZCcsICdmaWxlLnR4dCcpLCAnY29waWVkJyk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZUNvcHknLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHNvdXJjZTogZmlsZVVyaShyb290LCAnc291cmNlJyksXG5cdFx0XHRkZXN0aW5hdGlvbjogZmlsZVVyaShyb290LCAnZGVzdGluYXRpb24nKSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihyb290LCAnZGVzdGluYXRpb24nLCAnbmVzdGVkJywgJ2ZpbGUudHh0JyksICd1dGY4JyksICdjb3BpZWQnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZUNvcHkgb3ZlcndyaXRlcyBhbiBleGlzdGluZyBkZXN0aW5hdGlvbiBieSBkZWZhdWx0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWNvcHktb3ZlcndyaXRlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWNvcHktb3ZlcndyaXRlLScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnc291cmNlLnR4dCcpLCAnc291cmNlJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSwgJ2Rlc3RpbmF0aW9uJyk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZUNvcHknLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHNvdXJjZTogZmlsZVVyaShyb290LCAnc291cmNlLnR4dCcpLFxuXHRcdFx0ZGVzdGluYXRpb246IGZpbGVVcmkocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSwgJ3V0ZjgnKSwgJ3NvdXJjZScpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlQ29weSByZXBvcnRzIGEgbWlzc2luZyBzb3VyY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtY29weS1taXNzaW5nJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWNvcHktbWlzc2luZy0nKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlQ29weScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0c291cmNlOiBmaWxlVXJpKHJvb3QsICdtaXNzaW5nLnR4dCcpLFxuXHRcdFx0ZGVzdGluYXRpb246IGZpbGVVcmkocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VNb3ZlIHJlbG9jYXRlcyBhIGRpcmVjdG9yeSB0cmVlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLW1vdmUtZGlyZWN0b3J5Jyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLW1vdmUtZGlyZWN0b3J5LScpO1xuXHRcdG1rZGlyU3luYyhqb2luKHJvb3QsICdzb3VyY2UnLCAnbmVzdGVkJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnc291cmNlJywgJ25lc3RlZCcsICdmaWxlLnR4dCcpLCAnbW92ZWQnKTtcblxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlTW92ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0c291cmNlOiBmaWxlVXJpKHJvb3QsICdzb3VyY2UnKSxcblx0XHRcdGRlc3RpbmF0aW9uOiBmaWxlVXJpKHJvb3QsICdkZXN0aW5hdGlvbicpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzb3VyY2VFeGlzdHM6IGV4aXN0c1N5bmMoam9pbihyb290LCAnc291cmNlJykpLFxuXHRcdFx0Y29udGVudHM6IHJlYWRGaWxlU3luYyhqb2luKHJvb3QsICdkZXN0aW5hdGlvbicsICduZXN0ZWQnLCAnZmlsZS50eHQnKSwgJ3V0ZjgnKSxcblx0XHR9LCB7XG5cdFx0XHRzb3VyY2VFeGlzdHM6IGZhbHNlLFxuXHRcdFx0Y29udGVudHM6ICdtb3ZlZCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VNb3ZlIG92ZXJ3cml0ZXMgYW4gZXhpc3RpbmcgZGVzdGluYXRpb24gYnkgZGVmYXVsdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1tb3ZlLW92ZXJ3cml0ZScpO1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1yZXNvdXJjZS1tb3ZlLW92ZXJ3cml0ZS0nKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4ocm9vdCwgJ3NvdXJjZS50eHQnKSwgJ3NvdXJjZScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnZGVzdGluYXRpb24udHh0JyksICdkZXN0aW5hdGlvbicpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNb3ZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzb3VyY2U6IGZpbGVVcmkocm9vdCwgJ3NvdXJjZS50eHQnKSxcblx0XHRcdGRlc3RpbmF0aW9uOiBmaWxlVXJpKHJvb3QsICdkZXN0aW5hdGlvbi50eHQnKSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c291cmNlRXhpc3RzOiBleGlzdHNTeW5jKGpvaW4ocm9vdCwgJ3NvdXJjZS50eHQnKSksXG5cdFx0XHRjb250ZW50czogcmVhZEZpbGVTeW5jKGpvaW4ocm9vdCwgJ2Rlc3RpbmF0aW9uLnR4dCcpLCAndXRmOCcpLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZUV4aXN0czogZmFsc2UsXG5cdFx0XHRjb250ZW50czogJ3NvdXJjZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VNb3ZlIHJlcG9ydHMgYSBtaXNzaW5nIHNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1tb3ZlLW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbW92ZS1taXNzaW5nLScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VNb3ZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzb3VyY2U6IGZpbGVVcmkocm9vdCwgJ21pc3NpbmcudHh0JyksXG5cdFx0XHRkZXN0aW5hdGlvbjogZmlsZVVyaShyb290LCAnZGVzdGluYXRpb24udHh0JyksXG5cdFx0fSksIHsgY29kZTogQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCB9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZURlbGV0ZSByZXF1aXJlcyByZWN1cnNpdmUgbW9kZSBmb3IgYSBub24tZW1wdHkgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGluaXRpYWxpemVDbGllbnQoJ3Jlc291cmNlLWRlbGV0ZS1ub24tcmVjdXJzaXZlJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLWRlbGV0ZS1ub24tcmVjdXJzaXZlLScpO1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IGpvaW4ocm9vdCwgJ2RpcmVjdG9yeScpO1xuXHRcdG1rZGlyU3luYyhkaXJlY3RvcnkpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihkaXJlY3RvcnksICdmaWxlLnR4dCcpLCAncHJlc2VydmVkJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZURlbGV0ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBVUkkuZmlsZShkaXJlY3RvcnkpLnRvU3RyaW5nKCksXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoam9pbihkaXJlY3RvcnksICdmaWxlLnR4dCcpLCAndXRmOCcpLCAncHJlc2VydmVkJyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VEZWxldGUgcmVwb3J0cyBhIG1pc3NpbmcgcmVzb3VyY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtZGVsZXRlLW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtZGVsZXRlLW1pc3NpbmctJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsKCdyZXNvdXJjZURlbGV0ZScsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlVXJpKHJvb3QsICdtaXNzaW5nLnR4dCcpLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VSZWFkIHJlcG9ydHMgYSBtaXNzaW5nIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2UtcmVhZC1taXNzaW5nJyk7XG5cdFx0Y29uc3Qgcm9vdCA9IGNyZWF0ZVdvcmtzcGFjZSgnYWhwLXJlc291cmNlLXJlYWQtbWlzc2luZy0nKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlUmVhZCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlVXJpKHJvb3QsICdtaXNzaW5nLnR4dCcpLFxuXHRcdH0pLCB7IGNvZGU6IEFocEVycm9yQ29kZXMuTm90Rm91bmQgfSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVzb3VyY2VMaXN0IHJlcG9ydHMgYSBtaXNzaW5nIGRpcmVjdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1saXN0LW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbGlzdC1taXNzaW5nLScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VMaXN0Jywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGVVcmkocm9vdCwgJ21pc3NpbmcnKSxcblx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kIH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlTGlzdCByZWplY3RzIGEgZmlsZSByZXNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1saXN0LWZpbGUnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtbGlzdC1maWxlLScpO1xuXHRcdGNvbnN0IGZpbGUgPSBmaWxlVXJpKHJvb3QsICdmaWxlLnR4dCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihyb290LCAnZmlsZS50eHQnKSwgJ2NvbnRlbnQnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ3Jlc291cmNlTGlzdCcsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0dXJpOiBmaWxlLFxuXHRcdH0pKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZXNvdXJjZVdyaXRlIHJlcG9ydHMgYSBtaXNzaW5nIHBhcmVudCBkaXJlY3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgaW5pdGlhbGl6ZUNsaWVudCgncmVzb3VyY2Utd3JpdGUtbWlzc2luZy1wYXJlbnQnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2Utd3JpdGUtbWlzc2luZy1wYXJlbnQtJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyh3cml0ZVRleHQoZmlsZVVyaShyb290LCAnbWlzc2luZycsICdmaWxlLnR4dCcpLCAnY29udGVudCcpLCB7XG5cdFx0XHRjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Jlc291cmNlUmVzb2x2ZSByZXBvcnRzIGEgbWlzc2luZyByZXNvdXJjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBpbml0aWFsaXplQ2xpZW50KCdyZXNvdXJjZS1yZXNvbHZlLW1pc3NpbmcnKTtcblx0XHRjb25zdCByb290ID0gY3JlYXRlV29ya3NwYWNlKCdhaHAtcmVzb3VyY2UtcmVzb2x2ZS1taXNzaW5nLScpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgncmVzb3VyY2VSZXNvbHZlJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHR1cmk6IGZpbGVVcmkocm9vdCwgJ21pc3NpbmcnKSxcblx0XHR9KSwgeyBjb2RlOiBBaHBFcnJvckNvZGVzLk5vdEZvdW5kIH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2hvc3QgcmVhZHMgYSBjbGllbnQtaG9zdGVkIHBsdWdpbiB0aHJvdWdoIHJldmVyc2UgcmVzb3VyY2UgcmVxdWVzdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gVGhlIHBsdWdpbiBpcyBwdWJsaXNoZWQgYXMgYmVsb25naW5nIHRvIHRoaXMgY2xpZW50LCBzbyB0aGUgaG9zdFxuXHRcdC8vIGFkZHJlc3NlcyBpdCB0aHJvdWdoIHRoZSBgdnNjb2RlLWFnZW50LWNsaWVudGAgc2NoZW1lIGFuZCBmZXRjaGVzIGl0XG5cdFx0Ly8gb3ZlciB0aGUgY29ubmVjdGlvbi4gQm90aCBwcm9jZXNzZXMgc2hhcmUgYSBmaWxlc3lzdGVtIGhlcmUsIHNvIGl0IGlzXG5cdFx0Ly8gdGhlIGFzc2VydGlvbiBvbiBgc2VydmVkUmV2ZXJzZVJlcXVlc3RzYCBcdTIwMTQgbm90IHdoZXJlIHRoZSBkaXJlY3Rvcnlcblx0XHQvLyBzaXRzIFx1MjAxNCB0aGF0IHByb3ZlcyB0aGUgcmV2ZXJzZSBwYXRoIHdhcyBhY3R1YWxseSB1c2VkLlxuXHRcdGNvbnN0IHBsdWdpblJvb3QgPSBjcmVhdGVXb3Jrc3BhY2UoJ2FocC1jbGllbnQtcGx1Z2luLScpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihwbHVnaW5Sb290LCAncGx1Z2luLmpzb24nKSwgSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAnZTJlLWNsaWVudC1wbHVnaW4nLCB2ZXJzaW9uOiAnMS4wLjAnIH0pKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBgY2xpZW50LWZzLSR7Y29uZmlnLnByb3ZpZGVyfWAsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUoY3JlYXRlV29ya3NwYWNlKCdhaHAtY2xpZW50LWZzLXdzLScpKSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiBgY2xpZW50LWZzLSR7Y29uZmlnLnByb3ZpZGVyfWAsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IENsaWVudCcsXG5cdFx0XHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0dXJpOiBVUkkuZmlsZShwbHVnaW5Sb290KS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0bmFtZTogJ2UyZS1jbGllbnQtcGx1Z2luJyxcblx0XHRcdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0XHRcdG5vbmNlOiAnbm9uY2UtMScsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gYHNlc3Npb24vY3VzdG9taXphdGlvblVwZGF0ZWRgIGlzIGVtaXR0ZWQgb24gYm90aCB0aGUgc3VjY2VzcyBhbmQgdGhlXG5cdFx0Ly8gZmFpbHVyZSBwYXRoIHdpdGggdGhlIHNhbWUgYHVyaWAsIHNvIHRoZSBsb2FkIHN0YXRlIGlzIHdoYXQgc2VwYXJhdGVzXG5cdFx0Ly8gXCJtYXRlcmlhbGl6ZWQgZnJvbSB0aGUgY2xpZW50XCIgZnJvbSBcInRyaWVkIGFuZCBmYWlsZWRcIi5cblx0XHRjb25zdCB1cGRhdGVkID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vY3VzdG9taXphdGlvblVwZGF0ZWQnKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9uID0gKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IGN1c3RvbWl6YXRpb24/OiB7IHVyaT86IHN0cmluZzsgbG9hZD86IHsga2luZD86IHN0cmluZyB9IH0gfSkuY3VzdG9taXphdGlvbjtcblx0XHRcdHJldHVybiBjdXN0b21pemF0aW9uPy51cmkgPT09IFVSSS5maWxlKHBsdWdpblJvb3QpLnRvU3RyaW5nKCkgJiYgY3VzdG9taXphdGlvbj8ubG9hZD8ua2luZCAhPT0gdW5kZWZpbmVkO1xuXHRcdH0sIDYwXzAwMCk7XG5cblx0XHRjb25zdCBsb2FkS2luZCA9IChnZXRBY3Rpb25FbnZlbG9wZSh1cGRhdGVkKS5hY3Rpb24gYXMgeyBjdXN0b21pemF0aW9uPzogeyBsb2FkPzogeyBraW5kPzogc3RyaW5nIH0gfSB9KS5jdXN0b21pemF0aW9uPy5sb2FkPy5raW5kO1xuXHRcdC8vIENvbXBhcmUgYm90aCBzaWRlcyB0aHJvdWdoIGBVUklgLCBuZXZlciBhIHJhdyBmaWxlc3lzdGVtIHBhdGg6IGBmc1BhdGhgXG5cdFx0Ly8gbG93ZXItY2FzZXMgdGhlIFdpbmRvd3MgZHJpdmUgbGV0dGVyLCBzbyBhIHNlcnZlZFxuXHRcdC8vIGBmaWxlOi8vL2MlM0EvLi4uYCBhbmQgYSBgcGx1Z2luUm9vdGAgb2YgYEM6XFwuLi5gIGRlc2NyaWJlIHRoZSBzYW1lXG5cdFx0Ly8gZGlyZWN0b3J5IGJ1dCBkbyBub3QgbWF0Y2ggYXMgc3RyaW5ncy4gYHRtcGRpcigpYCBhbmQgaXRzIGNhbm9uaWNhbFxuXHRcdC8vIGZvcm0gYWxzbyBkaWZmZXIgb24gbWFjT1MgKGAvdmFyYCB2cyBgL3ByaXZhdGUvdmFyYCksIHNvIGJvdGhcblx0XHQvLyBzcGVsbGluZ3Mgb2YgdGhlIHJvb3QgYXJlIGFjY2VwdGVkLlxuXHRcdGNvbnN0IHBsdWdpblJvb3RQYXRocyA9IFtwbHVnaW5Sb290LCByZWFscGF0aFN5bmMocGx1Z2luUm9vdCldLm1hcChwYXRoID0+IFVSSS5maWxlKHBhdGgpLmZzUGF0aCk7XG5cdFx0Y29uc3Qgc2VydmVkRm9yUGx1Z2luID0gY29udGV4dC5jbGllbnQuc2VydmVkUmV2ZXJzZVJlcXVlc3RzLmZpbHRlcihyZXF1ZXN0ID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IHJlcXVlc3QudXJpO1xuXHRcdFx0aWYgKHVyaSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcXVlc3RlZCA9IFVSSS5wYXJzZSh1cmkpLmZzUGF0aDtcblx0XHRcdHJldHVybiBwbHVnaW5Sb290UGF0aHMuc29tZShyb290ID0+IHJlcXVlc3RlZC5zdGFydHNXaXRoKHJvb3QpKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9hZEtpbmQsXG5cdFx0XHRyZWFjaGVkQmFja1RvQ2xpZW50OiBzZXJ2ZWRGb3JQbHVnaW4ubGVuZ3RoID4gMCxcblx0XHRcdHJlYWRUaGVQbHVnaW5GaWxlOiBzZXJ2ZWRGb3JQbHVnaW4uc29tZShyZXF1ZXN0ID0+IHJlcXVlc3QubWV0aG9kID09PSAncmVzb3VyY2VSZWFkJyksXG5cdFx0fSwge1xuXHRcdFx0bG9hZEtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCxcblx0XHRcdHJlYWNoZWRCYWNrVG9DbGllbnQ6IHRydWUsXG5cdFx0XHRyZWFkVGhlUGx1Z2luRmlsZTogdHJ1ZSxcblx0XHR9LCBgc2VydmVkIHJldmVyc2UgcmVxdWVzdHM6ICR7SlNPTi5zdHJpbmdpZnkoY29udGV4dC5jbGllbnQuc2VydmVkUmV2ZXJzZVJlcXVlc3RzKX1gKTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFxQkEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWSxXQUFXLGFBQWEsY0FBYyxjQUFjLHFCQUFxQjtBQUM5RixTQUFTLGNBQWM7QUFDdkIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHdCQUF3QjtBQVFqQyxTQUFTLGlCQUFpQixjQUFjLHlCQUF5QjtBQUNqRSxTQUFTLDBCQUF3RTtBQUNqRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHFCQUEyQztBQUNwRCxTQUFTLHlCQUF5QixtQkFBbUIsc0JBQXNCO0FBQzNFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLDRCQUE0QjtBQUN4RCxTQUFTLHVCQUFzRDtBQUV4RCxTQUFTLDRCQUE0QixTQUF5QztBQUNwRixRQUFNLEVBQUUsUUFBUSxpQkFBaUIsVUFBVSxVQUFVLElBQUk7QUFFekQsV0FBUyxnQkFBZ0IsUUFBd0I7QUFDaEQsVUFBTSxZQUFZLFlBQVksS0FBSyxPQUFPLEdBQUcsTUFBTSxDQUFDO0FBQ3BELGFBQVMsS0FBSyxTQUFTO0FBQ3ZCLFdBQU87QUFBQSxFQUNSO0FBR0EsV0FBUyxRQUFRLFNBQWlCLFVBQTRCO0FBQzdELFdBQU8sSUFBSSxLQUFLLEtBQUssTUFBTSxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVM7QUFBQSxFQUNuRDtBQU9BLGlCQUFlLGlCQUFpQixTQUFnQztB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QVc7QUFBQSxRQUNqQixjQUFjO0FBQUEsVUFDYixVQUFVLGFBQWEsT0FBTyxRQUFRO0FBQUEsVUFDdEMsYUFBYTtBQUFBLFVBQ2IsT0FBTyxDQUFDO0FBQUEsVUFDUixnQkFBZ0IsQ0FBQztBQUFBLFlBQ2hCLElBQUksYUFBYTtBQUFBLFlBQ2pCLEtBQUssSUFBSSxLQUFLLFVBQVUsRUFBRSxTQUFTO0FBQUEsWUFDbkMsTUFBTTtBQUFBLFlBQ04sTUFBTSxrQkFBa0I7QUFBQSxZQUN4QixPQUFPO0FBQUEsVUFDUixDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFLRCxVQUFNLFVBQVUsTUFBTSxRQUFRLE9BQU8sb0JBQW9CLE9BQUs7QUFDN0QsVUFBSSxDQUFDLHFCQUFxQixHQUFHLDhCQUE4QixHQUFHO0FBQzdELGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxnQkFBaUIsa0JBQWtCLENBQUMsRUFBRSxPQUEwRTtBQUN0SCxhQUFPLGVBQWUsUUFBUSxJQUFJLEtBQUssVUFBVSxFQUFFLFNBQVMsS0FBSyxlQUFlLE1BQU0sU0FBUztBQUFBLElBQ2hHLEdBQUcsR0FBTTtBQUVULFVBQU0sV0FBWSxrQkFBa0IsT0FBTyxFQUFFLE9BQTRELGVBQWUsTUFBTTtBQU85SCxVQUFNLGtCQUFrQixDQUFDLFlBQVksYUFBYSxVQUFVLENBQUMsRUFBRSxJQUFJLFVBQVEsSUFBSSxLQUFLLElBQUksRUFBRSxNQUFNO0FBQ2hHLFVBQU0sa0JBQWtCLFFBQVEsT0FBTyxzQkFBc0IsT0FBTyxhQUFXO0FBQzlFLFlBQU0sTUFBTSxRQUFRO0FBQ3BCLFVBQUksUUFBUSxRQUFXO0FBQ3RCLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxZQUFZLElBQUksTUFBTSxHQUFHLEVBQUU7QUFDakMsYUFBTyxnQkFBZ0IsS0FBSyxVQUFRLFVBQVUsV0FBVyxJQUFJLENBQUM7QUFBQSxJQUMvRCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EscUJBQXFCLGdCQUFnQixTQUFTO0FBQUEsTUFDOUMsbUJBQW1CLGdCQUFnQixLQUFLLGFBQVcsUUFBUSxXQUFXLGNBQWM7QUFBQSxJQUNyRixHQUFHO0FBQUEsTUFDRixVQUFVLHdCQUF3QjtBQUFBLE1BQ2xDLHFCQUFxQjtBQUFBLE1BQ3JCLG1CQUFtQjtBQUFBLElBQ3BCLEdBQUcsNEJBQTRCLEtBQUssVUFBVSxRQUFRLE9BQU8scUJBQXFCLENBQUMsRUFBRTtBQUFBLEVBQ3RGLENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFsiYWN0aW9uIl0KfQo=
