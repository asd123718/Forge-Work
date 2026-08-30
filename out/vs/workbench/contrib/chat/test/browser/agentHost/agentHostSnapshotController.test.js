import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { AgentHostSnapshotController } from "../../../browser/agentSessions/agentHost/agentHostSnapshotController.js";
function makeToolCall(opts) {
  return {
    status: ToolCallStatus.Completed,
    toolCallId: opts.toolCallId,
    toolName: "codeEdit",
    displayName: "Edit File",
    invocationMessage: "Editing file",
    toolInput: JSON.stringify({ path: opts.filePath }),
    success: true,
    pastTenseMessage: "Edited file",
    confirmed: ToolCallConfirmationReason.NotNeeded,
    content: [{
      type: ToolResultContentType.FileEdit,
      before: {
        uri: URI.file(opts.filePath).toString(),
        content: { uri: opts.beforeURI }
      },
      after: {
        uri: URI.file(opts.filePath).toString(),
        content: { uri: opts.afterURI }
      },
      diff: {
        added: opts.added ?? 0,
        removed: opts.removed ?? 0
      }
    }]
  };
}
function makeMockFileService(contentMap) {
  return new class extends mock() {
    async readFile(uri) {
      const data = contentMap.get(uri.toString());
      if (data === void 0) {
        throw new Error(`Content not found: ${uri.toString()}`);
      }
      return { value: VSBuffer.fromString(data) };
    }
    async writeFile(uri, content) {
      contentMap.set(uri.toString(), content.toString());
      return {};
    }
    async del(uri) {
      contentMap.delete(uri.toString());
    }
    async move(source, target) {
      const data = contentMap.get(source.toString());
      if (data !== void 0) {
        contentMap.set(target.toString(), data);
        contentMap.delete(source.toString());
      }
      return {};
    }
  }();
}
function createController(store, contentMap) {
  const sessionResource = URI.from({ scheme: "agent-host-copilot", path: "/test-session" });
  const controller = new AgentHostSnapshotController(
    sessionResource,
    "local",
    new NullLogService(),
    makeMockFileService(contentMap)
  );
  store.add(controller);
  return controller;
}
suite("AgentHostSnapshotController", () => {
  const store = new DisposableStore();
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("initial state \u2014 empty checkpoints, no disablement, no undo", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    assert.deepStrictEqual(controller.requestDisablement.get(), []);
    assert.strictEqual(controller.canUndo.get(), false);
    assert.strictEqual(controller.canRedo.get(), false);
    assert.deepStrictEqual(controller.entries.get(), []);
  });
  test("addToolCallEdits records snapshot data, enables undo", () => {
    const contentMap = /* @__PURE__ */ new Map();
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: "agenthost-content:///snap/before",
      afterURI: "agenthost-content:///snap/after"
    }));
    assert.strictEqual(controller.canUndo.get(), true);
    assert.strictEqual(controller.canRedo.get(), false);
  });
  test("addToolCallEdits is idempotent on toolCallId", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    const tc = makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: "agenthost-content:///snap/before",
      afterURI: "agenthost-content:///snap/after"
    });
    controller.addToolCallEdits("req-1", tc);
    controller.addToolCallEdits("req-1", tc);
    assert.strictEqual(controller.canUndo.get(), true);
  });
  test("restoreSnapshot to a prior checkpoint writes before-content to disk", async () => {
    const before = URI.file("/snap/before-1").toString();
    const after = URI.file("/snap/after-1").toString();
    const file = URI.file("/file.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [before, "original"],
      [after, "modified"],
      [file, "modified"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: before,
      afterURI: after
    }));
    await controller.restoreSnapshot("req-1", void 0);
    assert.strictEqual(contentMap.get(file), "original");
  });
  test("requestDisablement reports requests after a checkpoint restore", async () => {
    const before1 = URI.file("/snap/before-1").toString();
    const after1 = URI.file("/snap/after-1").toString();
    const before2 = URI.file("/snap/before-2").toString();
    const after2 = URI.file("/snap/after-2").toString();
    const file = URI.file("/file.ts").toString();
    const controller = createController(store, /* @__PURE__ */ new Map([
      [before1, "a"],
      [after1, "b"],
      [before2, "b"],
      [after2, "c"],
      [file, "c"]
    ]));
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: before1,
      afterURI: after1
    }));
    controller.addToolCallEdits("req-2", makeToolCall({
      toolCallId: "tc-2",
      filePath: "/file.ts",
      beforeURI: before2,
      afterURI: after2
    }));
    assert.deepStrictEqual(controller.requestDisablement.get(), []);
    await controller.restoreSnapshot("req-2", void 0);
    assert.deepStrictEqual(controller.requestDisablement.get().map((d) => d.requestId), ["req-2"]);
  });
  test("ensureRequestCheckpoint creates a checkpoint and is idempotent", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.ensureRequestCheckpoint("req-1");
    controller.ensureRequestCheckpoint("req-1");
    assert.strictEqual(controller.canUndo.get(), true);
    assert.strictEqual(controller.canRedo.get(), false);
  });
  test("ensureRequestCheckpoint does not mark the current request as disabled", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.ensureRequestCheckpoint("req-1");
    assert.deepStrictEqual(controller.requestDisablement.get(), []);
    controller.ensureRequestCheckpoint("req-2");
    assert.deepStrictEqual(controller.requestDisablement.get(), []);
  });
  test("restoreSnapshot of a no-edit request marks it disabled", async () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.ensureRequestCheckpoint("req-1");
    controller.ensureRequestCheckpoint("req-2");
    await controller.restoreSnapshot("req-2", void 0);
    assert.deepStrictEqual(
      controller.requestDisablement.get().map((d) => d.requestId),
      ["req-2"]
    );
  });
  test("starting a new request after restore-to-start splices stale checkpoints", () => {
    const before = URI.file("/snap/before-1").toString();
    const after = URI.file("/snap/after-1").toString();
    const controller = createController(store, /* @__PURE__ */ new Map([
      [before, "a"],
      [after, "b"],
      [URI.file("/file.ts").toString(), "a"]
    ]));
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: before,
      afterURI: after
    }));
    return controller.restoreSnapshot("req-1", void 0).then(() => {
      controller.ensureRequestCheckpoint("req-2");
      assert.deepStrictEqual(controller.requestDisablement.get(), []);
      assert.strictEqual(controller.canRedo.get(), false);
    });
  });
  test("multiple tool calls in one request share a checkpoint", async () => {
    const before1 = URI.file("/snap/before-1").toString();
    const after1 = URI.file("/snap/after-1").toString();
    const before2 = URI.file("/snap/before-2").toString();
    const after2 = URI.file("/snap/after-2").toString();
    const fileA = URI.file("/a.ts").toString();
    const fileB = URI.file("/b.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [before1, "a-original"],
      [after1, "a-modified"],
      [fileA, "a-modified"],
      [before2, "b-original"],
      [after2, "b-modified"],
      [fileB, "b-modified"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/a.ts",
      beforeURI: before1,
      afterURI: after1
    }));
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-2",
      filePath: "/b.ts",
      beforeURI: before2,
      afterURI: after2
    }));
    await controller.restoreSnapshot("req-1", void 0);
    assert.strictEqual(contentMap.get(fileA), "a-original");
    assert.strictEqual(contentMap.get(fileB), "b-original");
  });
  test("multiple tool calls editing the same file collapse to one net edit", async () => {
    const beforeA = URI.file("/snap/before-a").toString();
    const afterA = URI.file("/snap/after-a").toString();
    const beforeB = URI.file("/snap/before-b").toString();
    const afterB = URI.file("/snap/after-b").toString();
    const file = URI.file("/file.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [beforeA, "v0"],
      [afterA, "v1"],
      [beforeB, "v1"],
      [afterB, "v2"],
      [file, "v2"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: beforeA,
      afterURI: afterA
    }));
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-2",
      filePath: "/file.ts",
      beforeURI: beforeB,
      afterURI: afterB
    }));
    await controller.restoreSnapshot("req-1", void 0);
    assert.strictEqual(contentMap.get(file), "v0");
  });
  test("hasEditsInRequest reflects added tool call edits", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: "agenthost-content:///before",
      afterURI: "agenthost-content:///after"
    }));
    assert.strictEqual(controller.hasEditsInRequest("req-1"), true);
    assert.strictEqual(controller.hasEditsInRequest("req-2"), false);
  });
  test("non-completed tool calls are ignored", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.addToolCallEdits("req-1", {
      status: ToolCallStatus.Running,
      toolCallId: "tc-1",
      toolName: "codeEdit",
      displayName: "Edit File",
      invocationMessage: "Editing file",
      toolInput: "{}",
      confirmed: ToolCallConfirmationReason.NotNeeded,
      content: []
    });
    assert.strictEqual(controller.canUndo.get(), false);
  });
  test("undoInteraction steps back one checkpoint at a time", async () => {
    const beforeA = URI.file("/snap/before-a").toString();
    const afterA = URI.file("/snap/after-a").toString();
    const beforeB = URI.file("/snap/before-b").toString();
    const afterB = URI.file("/snap/after-b").toString();
    const fileA = URI.file("/a.ts").toString();
    const fileB = URI.file("/b.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [beforeA, "a0"],
      [afterA, "a1"],
      [fileA, "a1"],
      [beforeB, "b0"],
      [afterB, "b1"],
      [fileB, "b1"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({ toolCallId: "tc-1", filePath: "/a.ts", beforeURI: beforeA, afterURI: afterA }));
    controller.addToolCallEdits("req-2", makeToolCall({ toolCallId: "tc-2", filePath: "/b.ts", beforeURI: beforeB, afterURI: afterB }));
    await controller.undoInteraction();
    assert.strictEqual(contentMap.get(fileA), "a1");
    assert.strictEqual(contentMap.get(fileB), "b0");
    assert.strictEqual(controller.canUndo.get(), true);
    assert.strictEqual(controller.canRedo.get(), true);
    await controller.undoInteraction();
    assert.strictEqual(contentMap.get(fileA), "a0");
    assert.strictEqual(controller.canUndo.get(), false);
    await controller.undoInteraction();
    assert.strictEqual(contentMap.get(fileA), "a0");
  });
  test("redoInteraction steps forward and stops at HEAD (no infinite loop)", async () => {
    const beforeA = URI.file("/snap/before-a").toString();
    const afterA = URI.file("/snap/after-a").toString();
    const beforeB = URI.file("/snap/before-b").toString();
    const afterB = URI.file("/snap/after-b").toString();
    const fileA = URI.file("/a.ts").toString();
    const fileB = URI.file("/b.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [beforeA, "a0"],
      [afterA, "a1"],
      [fileA, "a1"],
      [beforeB, "b0"],
      [afterB, "b1"],
      [fileB, "b1"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({ toolCallId: "tc-1", filePath: "/a.ts", beforeURI: beforeA, afterURI: afterA }));
    controller.addToolCallEdits("req-2", makeToolCall({ toolCallId: "tc-2", filePath: "/b.ts", beforeURI: beforeB, afterURI: afterB }));
    await controller.restoreSnapshot("req-1", void 0);
    assert.strictEqual(contentMap.get(fileA), "a0");
    assert.strictEqual(contentMap.get(fileB), "b0");
    assert.strictEqual(controller.canRedo.get(), true);
    let guard = 0;
    while (controller.canRedo.get()) {
      await controller.redoInteraction();
      assert.ok(++guard <= 10, "redoInteraction failed to advance the checkpoint cursor");
    }
    assert.strictEqual(contentMap.get(fileA), "a1");
    assert.strictEqual(contentMap.get(fileB), "b1");
    assert.strictEqual(controller.canRedo.get(), false);
    assert.strictEqual(controller.canUndo.get(), true);
  });
  test("streaming-edits APIs throw \u2014 agent host owns edits server-side", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    const fakeResponseModel = {};
    assert.throws(() => controller.startStreamingEdits(URI.file("/x"), fakeResponseModel, void 0));
    assert.throws(() => controller.applyWorkspaceEdit({ kind: "workspaceEdit", edits: [] }, fakeResponseModel, "stop"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFxcYWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNuYXBzaG90Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyLmpzJztcblxuZnVuY3Rpb24gbWFrZVRvb2xDYWxsKG9wdHM6IHtcblx0dG9vbENhbGxJZDogc3RyaW5nO1xuXHRmaWxlUGF0aDogc3RyaW5nO1xuXHRiZWZvcmVVUkk6IHN0cmluZztcblx0YWZ0ZXJVUkk6IHN0cmluZztcblx0YWRkZWQ/OiBudW1iZXI7XG5cdHJlbW92ZWQ/OiBudW1iZXI7XG59KTogVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0dG9vbENhbGxJZDogb3B0cy50b29sQ2FsbElkLFxuXHRcdHRvb2xOYW1lOiAnY29kZUVkaXQnLFxuXHRcdGRpc3BsYXlOYW1lOiAnRWRpdCBGaWxlJyxcblx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0VkaXRpbmcgZmlsZScsXG5cdFx0dG9vbElucHV0OiBKU09OLnN0cmluZ2lmeSh7IHBhdGg6IG9wdHMuZmlsZVBhdGggfSksXG5cdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnRWRpdGVkIGZpbGUnLFxuXHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRiZWZvcmU6IHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZShvcHRzLmZpbGVQYXRoKS50b1N0cmluZygpLFxuXHRcdFx0XHRjb250ZW50OiB7IHVyaTogb3B0cy5iZWZvcmVVUkkgfSxcblx0XHRcdH0sXG5cdFx0XHRhZnRlcjoge1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKG9wdHMuZmlsZVBhdGgpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNvbnRlbnQ6IHsgdXJpOiBvcHRzLmFmdGVyVVJJIH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGlmZjoge1xuXHRcdFx0XHRhZGRlZDogb3B0cy5hZGRlZCA/PyAwLFxuXHRcdFx0XHRyZW1vdmVkOiBvcHRzLnJlbW92ZWQgPz8gMCxcblx0XHRcdH0sXG5cdFx0fV0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VNb2NrRmlsZVNlcnZpY2UoY29udGVudE1hcDogTWFwPHN0cmluZywgc3RyaW5nPik6IElGaWxlU2VydmljZSB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUodXJpOiBVUkkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSBjb250ZW50TWFwLmdldCh1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoZGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29udGVudCBub3QgZm91bmQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhkYXRhKSB9IGFzIElGaWxlQ29udGVudDtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgd3JpdGVGaWxlKHVyaTogVVJJLCBjb250ZW50OiBWU0J1ZmZlcik6IFByb21pc2U8YW55PiB7XG5cdFx0XHRjb250ZW50TWFwLnNldCh1cmkudG9TdHJpbmcoKSwgY29udGVudC50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZGVsKHVyaTogVVJJKSB7XG5cdFx0XHRjb250ZW50TWFwLmRlbGV0ZSh1cmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIG1vdmUoc291cmNlOiBVUkksIHRhcmdldDogVVJJKTogUHJvbWlzZTxhbnk+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBjb250ZW50TWFwLmdldChzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRlbnRNYXAuc2V0KHRhcmdldC50b1N0cmluZygpLCBkYXRhKTtcblx0XHRcdFx0Y29udGVudE1hcC5kZWxldGUoc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29udHJvbGxlcihzdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBjb250ZW50TWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyIHtcblx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3QnLCBwYXRoOiAnL3Rlc3Qtc2Vzc2lvbicgfSk7XG5cdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyKFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHQnbG9jYWwnLFxuXHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdG1ha2VNb2NrRmlsZVNlcnZpY2UoY29udGVudE1hcCksXG5cdCk7XG5cdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblx0cmV0dXJuIGNvbnRyb2xsZXI7XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXInLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaW5pdGlhbCBzdGF0ZSBcdTIwMTQgZW1wdHkgY2hlY2twb2ludHMsIG5vIGRpc2FibGVtZW50LCBubyB1bmRvJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBuZXcgTWFwKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udHJvbGxlci5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCksIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5VbmRvLmdldCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuY2FuUmVkby5nZXQoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udHJvbGxlci5lbnRyaWVzLmdldCgpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFRvb2xDYWxsRWRpdHMgcmVjb3JkcyBzbmFwc2hvdCBkYXRhLCBlbmFibGVzIHVuZG8nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIGNvbnRlbnRNYXApO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCBtYWtlVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0ZmlsZVBhdGg6ICcvZmlsZS50cycsXG5cdFx0XHRiZWZvcmVVUkk6ICdhZ2VudGhvc3QtY29udGVudDovLy9zbmFwL2JlZm9yZScsXG5cdFx0XHRhZnRlclVSSTogJ2FnZW50aG9zdC1jb250ZW50Oi8vL3NuYXAvYWZ0ZXInLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5VbmRvLmdldCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5SZWRvLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFRvb2xDYWxsRWRpdHMgaXMgaWRlbXBvdGVudCBvbiB0b29sQ2FsbElkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBuZXcgTWFwKCkpO1xuXHRcdGNvbnN0IHRjID0gbWFrZVRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGZpbGVQYXRoOiAnL2ZpbGUudHMnLFxuXHRcdFx0YmVmb3JlVVJJOiAnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vc25hcC9iZWZvcmUnLFxuXHRcdFx0YWZ0ZXJVUkk6ICdhZ2VudGhvc3QtY29udGVudDovLy9zbmFwL2FmdGVyJyxcblx0XHR9KTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgdGMpO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCB0Yyk7XG5cdFx0Ly8gUmVzdG9yZSB0byBiZWZvcmUgdGhlIHJlcXVlc3QgXHUyMDE0IG9ubHkgb25lIHVuZG8gZXhwZWN0ZWQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuY2FuVW5kby5nZXQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVTbmFwc2hvdCB0byBhIHByaW9yIGNoZWNrcG9pbnQgd3JpdGVzIGJlZm9yZS1jb250ZW50IHRvIGRpc2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmVmb3JlID0gVVJJLmZpbGUoJy9zbmFwL2JlZm9yZS0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlciA9IFVSSS5maWxlKCcvc25hcC9hZnRlci0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmaWxlID0gVVJJLmZpbGUoJy9maWxlLnRzJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjb250ZW50TWFwID0gbmV3IE1hcChbXG5cdFx0XHRbYmVmb3JlLCAnb3JpZ2luYWwnXSxcblx0XHRcdFthZnRlciwgJ21vZGlmaWVkJ10sXG5cdFx0XHRbZmlsZSwgJ21vZGlmaWVkJ10sXG5cdFx0XSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIGNvbnRlbnRNYXApO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCBtYWtlVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0ZmlsZVBhdGg6ICcvZmlsZS50cycsXG5cdFx0XHRiZWZvcmVVUkk6IGJlZm9yZSxcblx0XHRcdGFmdGVyVVJJOiBhZnRlcixcblx0XHR9KSk7XG5cdFx0Ly8gUmVzdG9yZSBiZWZvcmUgdGhlIHJlcXVlc3QgXHUyMTkyIHdyYXBzIGJhY2sgdG8gdGhlIG9yaWdpbmFsIGNvbnRlbnQuXG5cdFx0YXdhaXQgY29udHJvbGxlci5yZXN0b3JlU25hcHNob3QoJ3JlcS0xJywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZSksICdvcmlnaW5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0RGlzYWJsZW1lbnQgcmVwb3J0cyByZXF1ZXN0cyBhZnRlciBhIGNoZWNrcG9pbnQgcmVzdG9yZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiZWZvcmUxID0gVVJJLmZpbGUoJy9zbmFwL2JlZm9yZS0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlcjEgPSBVUkkuZmlsZSgnL3NuYXAvYWZ0ZXItMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYmVmb3JlMiA9IFVSSS5maWxlKCcvc25hcC9iZWZvcmUtMicpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXIyID0gVVJJLmZpbGUoJy9zbmFwL2FmdGVyLTInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGZpbGUgPSBVUkkuZmlsZSgnL2ZpbGUudHMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBuZXcgTWFwKFtcblx0XHRcdFtiZWZvcmUxLCAnYSddLFxuXHRcdFx0W2FmdGVyMSwgJ2InXSxcblx0XHRcdFtiZWZvcmUyLCAnYiddLFxuXHRcdFx0W2FmdGVyMiwgJ2MnXSxcblx0XHRcdFtmaWxlLCAnYyddLFxuXHRcdF0pKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgbWFrZVRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgZmlsZVBhdGg6ICcvZmlsZS50cycsXG5cdFx0XHRiZWZvcmVVUkk6IGJlZm9yZTEsIGFmdGVyVVJJOiBhZnRlcjEsXG5cdFx0fSkpO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTInLCBtYWtlVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTInLCBmaWxlUGF0aDogJy9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVVSSTogYmVmb3JlMiwgYWZ0ZXJVUkk6IGFmdGVyMixcblx0XHR9KSk7XG5cdFx0Ly8gQXQgSEVBRCBub3RoaW5nIGlzIGRpc2FibGVkXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKSwgW10pO1xuXG5cdFx0Ly8gUmVzdG9yZSBiZWZvcmUgcmVxLTIgXHUyMTkyIHJlcS0yIGJlY29tZXMgZGlzYWJsZWRcblx0XHRhd2FpdCBjb250cm9sbGVyLnJlc3RvcmVTbmFwc2hvdCgncmVxLTInLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udHJvbGxlci5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCkubWFwKGQgPT4gZC5yZXF1ZXN0SWQpLCBbJ3JlcS0yJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVSZXF1ZXN0Q2hlY2twb2ludCBjcmVhdGVzIGEgY2hlY2twb2ludCBhbmQgaXMgaWRlbXBvdGVudCcsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgbmV3IE1hcCgpKTtcblx0XHRjb250cm9sbGVyLmVuc3VyZVJlcXVlc3RDaGVja3BvaW50KCdyZXEtMScpO1xuXHRcdGNvbnRyb2xsZXIuZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQoJ3JlcS0xJyk7XG5cdFx0Ly8gVW5kbyBpcyByZXF1ZXN0LWxldmVsOiBhIGNoZWNrcG9pbnQgZXhpc3RzLCBzbyB3ZSBjYW4gdW5kbyBpdFxuXHRcdC8vIChldmVuIHRob3VnaCB0aGUgcmVxdWVzdCBwcm9kdWNlZCBubyBlZGl0cykuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuY2FuVW5kby5nZXQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuY2FuUmVkby5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbnN1cmVSZXF1ZXN0Q2hlY2twb2ludCBkb2VzIG5vdCBtYXJrIHRoZSBjdXJyZW50IHJlcXVlc3QgYXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoKSk7XG5cdFx0Ly8gU2ltdWxhdGVzIHRoZSBzdGFydC1vZi10dXJuIHBhdGggaW4gdGhlIHNlc3Npb24gaGFuZGxlcjogdGhlXG5cdFx0Ly8gY2hlY2twb2ludCBmb3IgdGhlIGluLWZsaWdodCByZXF1ZXN0IG11c3Qgbm90IGFwcGVhciBpblxuXHRcdC8vIHJlcXVlc3REaXNhYmxlbWVudCAob3RoZXJ3aXNlIHRoZSBjaGF0IFVJIGhpZGVzIHRoZSBsaXZlIHR1cm4pLlxuXHRcdGNvbnRyb2xsZXIuZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQoJ3JlcS0xJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKSwgW10pO1xuXHRcdGNvbnRyb2xsZXIuZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQoJ3JlcS0yJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlU25hcHNob3Qgb2YgYSBuby1lZGl0IHJlcXVlc3QgbWFya3MgaXQgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoKSk7XG5cdFx0Ly8gVHdvIHJlcXVlc3RzLCBuZWl0aGVyIHByb2R1Y2VkIGZpbGUgZWRpdHMgXHUyMDE0IG1pcnJvcnMgYSBzZXNzaW9uXG5cdFx0Ly8gaHlkcmF0ZWQgZnJvbSBoaXN0b3J5IHdoZXJlIGludGVybWVkaWF0ZSB0dXJucyBoYWQgbm8gdG9vbCBjYWxscy5cblx0XHRjb250cm9sbGVyLmVuc3VyZVJlcXVlc3RDaGVja3BvaW50KCdyZXEtMScpO1xuXHRcdGNvbnRyb2xsZXIuZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQoJ3JlcS0yJyk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5yZXN0b3JlU25hcHNob3QoJ3JlcS0yJywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Y29udHJvbGxlci5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCkubWFwKGQgPT4gZC5yZXF1ZXN0SWQpLFxuXHRcdFx0WydyZXEtMiddLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0aW5nIGEgbmV3IHJlcXVlc3QgYWZ0ZXIgcmVzdG9yZS10by1zdGFydCBzcGxpY2VzIHN0YWxlIGNoZWNrcG9pbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJlZm9yZSA9IFVSSS5maWxlKCcvc25hcC9iZWZvcmUtMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXIgPSBVUkkuZmlsZSgnL3NuYXAvYWZ0ZXItMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoW1xuXHRcdFx0W2JlZm9yZSwgJ2EnXSwgW2FmdGVyLCAnYiddLCBbVVJJLmZpbGUoJy9maWxlLnRzJykudG9TdHJpbmcoKSwgJ2EnXSxcblx0XHRdKSk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIG1ha2VUb29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIGZpbGVQYXRoOiAnL2ZpbGUudHMnLFxuXHRcdFx0YmVmb3JlVVJJOiBiZWZvcmUsIGFmdGVyVVJJOiBhZnRlcixcblx0XHR9KSk7XG5cdFx0cmV0dXJuIGNvbnRyb2xsZXIucmVzdG9yZVNuYXBzaG90KCdyZXEtMScsIHVuZGVmaW5lZCkudGhlbigoKSA9PiB7XG5cdFx0XHQvLyBBZnRlciByZXN0b3JpbmcgYmVmb3JlIHJlcS0xLCB0aGUgdXNlciBzZW5kcyBhIG5ldyByZXF1ZXN0LlxuXHRcdFx0Ly8gVGhlIHN0YWxlIGZvcndhcmQgYnJhbmNoIG11c3QgYmUgc3BsaWNlZCBvciB0aGUgbmV3IGNoZWNrcG9pbnRcblx0XHRcdC8vIHdvdWxkIGNvZXhpc3Qgd2l0aCB0aGUgZGlzY2FyZGVkIG9uZS5cblx0XHRcdGNvbnRyb2xsZXIuZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQoJ3JlcS0yJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRyb2xsZXIucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5SZWRvLmdldCgpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHRvb2wgY2FsbHMgaW4gb25lIHJlcXVlc3Qgc2hhcmUgYSBjaGVja3BvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJlZm9yZTEgPSBVUkkuZmlsZSgnL3NuYXAvYmVmb3JlLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyMSA9IFVSSS5maWxlKCcvc25hcC9hZnRlci0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBiZWZvcmUyID0gVVJJLmZpbGUoJy9zbmFwL2JlZm9yZS0yJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlcjIgPSBVUkkuZmlsZSgnL3NuYXAvYWZ0ZXItMicpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZmlsZUEgPSBVUkkuZmlsZSgnL2EudHMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGZpbGVCID0gVVJJLmZpbGUoJy9iLnRzJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjb250ZW50TWFwID0gbmV3IE1hcChbXG5cdFx0XHRbYmVmb3JlMSwgJ2Etb3JpZ2luYWwnXSwgW2FmdGVyMSwgJ2EtbW9kaWZpZWQnXSwgW2ZpbGVBLCAnYS1tb2RpZmllZCddLFxuXHRcdFx0W2JlZm9yZTIsICdiLW9yaWdpbmFsJ10sIFthZnRlcjIsICdiLW1vZGlmaWVkJ10sIFtmaWxlQiwgJ2ItbW9kaWZpZWQnXSxcblx0XHRdKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgY29udGVudE1hcCk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIG1ha2VUb29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIGZpbGVQYXRoOiAnL2EudHMnLFxuXHRcdFx0YmVmb3JlVVJJOiBiZWZvcmUxLCBhZnRlclVSSTogYWZ0ZXIxLFxuXHRcdH0pKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgbWFrZVRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0yJywgZmlsZVBhdGg6ICcvYi50cycsXG5cdFx0XHRiZWZvcmVVUkk6IGJlZm9yZTIsIGFmdGVyVVJJOiBhZnRlcjIsXG5cdFx0fSkpO1xuXHRcdC8vIFJlc3RvcmluZyBiZWZvcmUgcmVxLTEgdW5kb2VzIEJPVEggdG9vbCBjYWxscycgZWRpdHMuXG5cdFx0YXdhaXQgY29udHJvbGxlci5yZXN0b3JlU25hcHNob3QoJ3JlcS0xJywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZUEpLCAnYS1vcmlnaW5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQiksICdiLW9yaWdpbmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHRvb2wgY2FsbHMgZWRpdGluZyB0aGUgc2FtZSBmaWxlIGNvbGxhcHNlIHRvIG9uZSBuZXQgZWRpdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUd28gc2VxdWVudGlhbCBlZGl0cyB0byAvZmlsZS50cyB3aXRoaW4gdGhlIHNhbWUgcmVxdWVzdDogdGhlXG5cdFx0Ly8gc2Vjb25kIGVkaXQncyBhZnRlci1jb250ZW50IG11c3Qgd2luIG9uIHJlZG8sIGFuZCB0aGUgZmlyc3Rcblx0XHQvLyBlZGl0J3MgYmVmb3JlLWNvbnRlbnQgbXVzdCB3aW4gb24gdW5kby4gV2l0aG91dCBtZXJnaW5nLCB0aGVcblx0XHQvLyB0d28gZWRpdHMgd291bGQgcmFjZSB3aGVuIGFwcGxpZWQgaW4gcGFyYWxsZWwuXG5cdFx0Y29uc3QgYmVmb3JlQSA9IFVSSS5maWxlKCcvc25hcC9iZWZvcmUtYScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXJBID0gVVJJLmZpbGUoJy9zbmFwL2FmdGVyLWEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGJlZm9yZUIgPSBVUkkuZmlsZSgnL3NuYXAvYmVmb3JlLWInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyQiA9IFVSSS5maWxlKCcvc25hcC9hZnRlci1iJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmaWxlID0gVVJJLmZpbGUoJy9maWxlLnRzJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjb250ZW50TWFwID0gbmV3IE1hcChbXG5cdFx0XHRbYmVmb3JlQSwgJ3YwJ10sIFthZnRlckEsICd2MSddLFxuXHRcdFx0W2JlZm9yZUIsICd2MSddLCBbYWZ0ZXJCLCAndjInXSxcblx0XHRcdFtmaWxlLCAndjInXSxcblx0XHRdKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgY29udGVudE1hcCk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIG1ha2VUb29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIGZpbGVQYXRoOiAnL2ZpbGUudHMnLFxuXHRcdFx0YmVmb3JlVVJJOiBiZWZvcmVBLCBhZnRlclVSSTogYWZ0ZXJBLFxuXHRcdH0pKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgbWFrZVRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0yJywgZmlsZVBhdGg6ICcvZmlsZS50cycsXG5cdFx0XHRiZWZvcmVVUkk6IGJlZm9yZUIsIGFmdGVyVVJJOiBhZnRlckIsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIucmVzdG9yZVNuYXBzaG90KCdyZXEtMScsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRNYXAuZ2V0KGZpbGUpLCAndjAnKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzRWRpdHNJblJlcXVlc3QgcmVmbGVjdHMgYWRkZWQgdG9vbCBjYWxsIGVkaXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBuZXcgTWFwKCkpO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCBtYWtlVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLCBmaWxlUGF0aDogJy9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVVSSTogJ2FnZW50aG9zdC1jb250ZW50Oi8vL2JlZm9yZScsIGFmdGVyVVJJOiAnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vYWZ0ZXInLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5oYXNFZGl0c0luUmVxdWVzdCgncmVxLTEnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaGFzRWRpdHNJblJlcXVlc3QoJ3JlcS0yJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbm9uLWNvbXBsZXRlZCB0b29sIGNhbGxzIGFyZSBpZ25vcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBuZXcgTWFwKCkpO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCB7XG5cdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHR0b29sTmFtZTogJ2NvZGVFZGl0Jyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnRWRpdCBGaWxlJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRWRpdGluZyBmaWxlJyxcblx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0Y29udGVudDogW10sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuY2FuVW5kby5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmRvSW50ZXJhY3Rpb24gc3RlcHMgYmFjayBvbmUgY2hlY2twb2ludCBhdCBhIHRpbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmVmb3JlQSA9IFVSSS5maWxlKCcvc25hcC9iZWZvcmUtYScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXJBID0gVVJJLmZpbGUoJy9zbmFwL2FmdGVyLWEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGJlZm9yZUIgPSBVUkkuZmlsZSgnL3NuYXAvYmVmb3JlLWInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyQiA9IFVSSS5maWxlKCcvc25hcC9hZnRlci1iJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmaWxlQSA9IFVSSS5maWxlKCcvYS50cycpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZmlsZUIgPSBVUkkuZmlsZSgnL2IudHMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNvbnRlbnRNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFtiZWZvcmVBLCAnYTAnXSwgW2FmdGVyQSwgJ2ExJ10sIFtmaWxlQSwgJ2ExJ10sXG5cdFx0XHRbYmVmb3JlQiwgJ2IwJ10sIFthZnRlckIsICdiMSddLCBbZmlsZUIsICdiMSddLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBjb250ZW50TWFwKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgbWFrZVRvb2xDYWxsKHsgdG9vbENhbGxJZDogJ3RjLTEnLCBmaWxlUGF0aDogJy9hLnRzJywgYmVmb3JlVVJJOiBiZWZvcmVBLCBhZnRlclVSSTogYWZ0ZXJBIH0pKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0yJywgbWFrZVRvb2xDYWxsKHsgdG9vbENhbGxJZDogJ3RjLTInLCBmaWxlUGF0aDogJy9iLnRzJywgYmVmb3JlVVJJOiBiZWZvcmVCLCBhZnRlclVSSTogYWZ0ZXJCIH0pKTtcblxuXHRcdC8vIFVuZG8gcmVxLTIgb25seSBcdTIwMTQgcmVxLTEncyBlZGl0IHN0YXlzIGFwcGxpZWQuXG5cdFx0YXdhaXQgY29udHJvbGxlci51bmRvSW50ZXJhY3Rpb24oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZUEpLCAnYTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZUIpLCAnYjAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5VbmRvLmdldCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5SZWRvLmdldCgpLCB0cnVlKTtcblxuXHRcdC8vIFVuZG8gcmVxLTEgdG9vLlxuXHRcdGF3YWl0IGNvbnRyb2xsZXIudW5kb0ludGVyYWN0aW9uKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRNYXAuZ2V0KGZpbGVBKSwgJ2EwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuY2FuVW5kby5nZXQoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gRXh0cmEgdW5kbyBwYXN0IHRoZSBzdGFydCBpcyBhIHNhZmUgbm8tb3AuXG5cdFx0YXdhaXQgY29udHJvbGxlci51bmRvSW50ZXJhY3Rpb24oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZUEpLCAnYTAnKTtcblx0fSk7XG5cblx0dGVzdCgncmVkb0ludGVyYWN0aW9uIHN0ZXBzIGZvcndhcmQgYW5kIHN0b3BzIGF0IEhFQUQgKG5vIGluZmluaXRlIGxvb3ApJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJlZm9yZUEgPSBVUkkuZmlsZSgnL3NuYXAvYmVmb3JlLWEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyQSA9IFVSSS5maWxlKCcvc25hcC9hZnRlci1hJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBiZWZvcmVCID0gVVJJLmZpbGUoJy9zbmFwL2JlZm9yZS1iJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlckIgPSBVUkkuZmlsZSgnL3NuYXAvYWZ0ZXItYicpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZmlsZUEgPSBVUkkuZmlsZSgnL2EudHMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGZpbGVCID0gVVJJLmZpbGUoJy9iLnRzJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjb250ZW50TWFwID0gbmV3IE1hcChbXG5cdFx0XHRbYmVmb3JlQSwgJ2EwJ10sIFthZnRlckEsICdhMSddLCBbZmlsZUEsICdhMSddLFxuXHRcdFx0W2JlZm9yZUIsICdiMCddLCBbYWZ0ZXJCLCAnYjEnXSwgW2ZpbGVCLCAnYjEnXSxcblx0XHRdKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgY29udGVudE1hcCk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIG1ha2VUb29sQ2FsbCh7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgZmlsZVBhdGg6ICcvYS50cycsIGJlZm9yZVVSSTogYmVmb3JlQSwgYWZ0ZXJVUkk6IGFmdGVyQSB9KSk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMicsIG1ha2VUb29sQ2FsbCh7IHRvb2xDYWxsSWQ6ICd0Yy0yJywgZmlsZVBhdGg6ICcvYi50cycsIGJlZm9yZVVSSTogYmVmb3JlQiwgYWZ0ZXJVUkk6IGFmdGVyQiB9KSk7XG5cblx0XHQvLyBSZXN0b3JlIHRvIGJlZm9yZSByZXEtMSBzbyBib3RoIGVkaXRzIGFyZSBwZW5kaW5nIGEgcmVkby5cblx0XHRhd2FpdCBjb250cm9sbGVyLnJlc3RvcmVTbmFwc2hvdCgncmVxLTEnLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQSksICdhMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQiksICdiMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNhblJlZG8uZ2V0KCksIHRydWUpO1xuXG5cdFx0Ly8gRW11bGF0ZSB0aGUgXCJSZWRvXCIgYWN0aW9uJ3MgZHJhaW4gbG9vcC4gVGhlIGJvdW5kZWQgZ3VhcmQgdHVybnMgYVxuXHRcdC8vIHJlZ3Jlc3Npb24gKHJlZG9JbnRlcmFjdGlvbiBub3QgYWR2YW5jaW5nIHRoZSBjdXJzb3IpIGludG8gYSBjbGVhblxuXHRcdC8vIGFzc2VydGlvbiBmYWlsdXJlIGluc3RlYWQgb2YgYW4gaW5maW5pdGUgbG9vcCB0aGF0IHdvdWxkIGhhbmcgdGhlXG5cdFx0Ly8gd2luZG93IFx1MjAxNCB3aGljaCBpcyBleGFjdGx5IHRoZSBidWcgdGhpcyBndWFyZHMgYWdhaW5zdC5cblx0XHRsZXQgZ3VhcmQgPSAwO1xuXHRcdHdoaWxlIChjb250cm9sbGVyLmNhblJlZG8uZ2V0KCkpIHtcblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVkb0ludGVyYWN0aW9uKCk7XG5cdFx0XHRhc3NlcnQub2soKytndWFyZCA8PSAxMCwgJ3JlZG9JbnRlcmFjdGlvbiBmYWlsZWQgdG8gYWR2YW5jZSB0aGUgY2hlY2twb2ludCBjdXJzb3InKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZUEpLCAnYTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZUIpLCAnYjEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5SZWRvLmdldCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuY2FuVW5kby5nZXQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmVhbWluZy1lZGl0cyBBUElzIHRocm93IFx1MjAxNCBhZ2VudCBob3N0IG93bnMgZWRpdHMgc2VydmVyLXNpZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoKSk7XG5cdFx0Y29uc3QgZmFrZVJlc3BvbnNlTW9kZWwgPSB7fSBhcyBJQ2hhdFJlc3BvbnNlTW9kZWw7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBjb250cm9sbGVyLnN0YXJ0U3RyZWFtaW5nRWRpdHMoVVJJLmZpbGUoJy94JyksIGZha2VSZXNwb25zZU1vZGVsLCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbnRyb2xsZXIuYXBwbHlXb3Jrc3BhY2VFZGl0KHsga2luZDogJ3dvcmtzcGFjZUVkaXQnLCBlZGl0czogW10gfSwgZmFrZVJlc3BvbnNlTW9kZWwsICdzdG9wJykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw0QkFBNEIsZ0JBQWdCLDZCQUE2QjtBQUdsRixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLG1DQUFtQztBQUU1QyxTQUFTLGFBQWEsTUFPSztBQUMxQixTQUFPO0FBQUEsSUFDTixRQUFRLGVBQWU7QUFBQSxJQUN2QixZQUFZLEtBQUs7QUFB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
