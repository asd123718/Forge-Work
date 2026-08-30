import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { createFileEditContentDigest, getFileEditAttributionMarker, IAgentEditAttributionService, NullAgentEditAttributionService } from "../../common/fileEditAttribution.js";
import { parseSessionDbUri } from "../../common/sessionDbUri.js";
import { ToolResultContentType } from "../../common/state/sessionState.js";
import { TestDiffComputeService } from "../common/sessionTestHelpers.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { IEditSurvivalReporterFactory, NullEditSurvivalReporterFactory } from "../../node/shared/editSurvivalReporter.js";
import { FileEditTracker } from "../../node/shared/fileEditTracker.js";
import { IEditArcReporterService, NullEditArcReporterService } from "../../node/shared/editArcReporter.js";
suite("FileEditTracker", () => {
  const disposables = new DisposableStore();
  let fileService;
  let db;
  let tracker;
  let diffComputeService;
  setup(async () => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const sourceFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("file", sourceFs));
    db = disposables.add(await SessionDatabase.open(":memory:"));
    await db.createTurn("turn-1");
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    diffComputeService = new TestDiffComputeService();
    services.set(IDiffComputeService, diffComputeService);
    services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, new NullEditArcReporterService());
    const instantiationService = disposables.add(new InstantiationService(services));
    tracker = instantiationService.createInstance(FileEditTracker, "copilot:/test-session", db);
  });
  teardown(async () => {
    disposables.clear();
    await db.close();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("tracks edit start and complete for existing file", async () => {
    await fileService.writeFile(URI.file("/workspace/test.txt"), VSBuffer.fromString("original content\nline 2"));
    await tracker.trackEditStart("/workspace/test.txt");
    await fileService.writeFile(URI.file("/workspace/test.txt"), VSBuffer.fromString("modified content\nline 2\nline 3"));
    await tracker.completeEdit("/workspace/test.txt");
    const fileEdit = await tracker.takeCompletedEdit("turn-1", "tc-1", "/workspace/test.txt", "", void 0, void 0);
    assert.ok(fileEdit);
    assert.strictEqual(fileEdit.type, ToolResultContentType.FileEdit);
    assert.strictEqual(diffComputeService.callCount, 1);
    const beforeFields = parseSessionDbUri(fileEdit.before.content.uri);
    assert.ok(beforeFields);
    assert.strictEqual(beforeFields.sessionUri, "copilot:/test-session");
    assert.strictEqual(beforeFields.toolCallId, "tc-1");
    assert.strictEqual(beforeFields.filePath, "/workspace/test.txt");
    assert.strictEqual(beforeFields.part, "before");
    const afterFields = parseSessionDbUri(fileEdit.after.content.uri);
    assert.ok(afterFields);
    assert.strictEqual(afterFields.part, "after");
    await new Promise((r) => setTimeout(r, 50));
    const content = await db.readFileEditContent("tc-1", "/workspace/test.txt");
    assert.ok(content);
    assert.strictEqual(new TextDecoder().decode(content.beforeContent), "original content\nline 2");
    assert.strictEqual(new TextDecoder().decode(content.afterContent), "modified content\nline 2\nline 3");
  });
  test("tracks edit for newly created file (no before content)", async () => {
    await tracker.trackEditStart("/workspace/new-file.txt");
    await fileService.writeFile(URI.file("/workspace/new-file.txt"), VSBuffer.fromString("new file\ncontent"));
    await tracker.completeEdit("/workspace/new-file.txt");
    const fileEdit = await tracker.takeCompletedEdit("turn-1", "tc-2", "/workspace/new-file.txt", "", void 0, void 0);
    assert.ok(fileEdit);
    await new Promise((r) => setTimeout(r, 50));
    const content = await db.readFileEditContent("tc-2", "/workspace/new-file.txt");
    assert.ok(content);
    assert.strictEqual(new TextDecoder().decode(content.beforeContent), "");
    assert.strictEqual(new TextDecoder().decode(content.afterContent), "new file\ncontent");
  });
  test("streaming snapshots retain the original before content and refresh the after content", async () => {
    const resource = URI.file("/workspace/streaming.txt");
    await fileService.writeFile(resource, VSBuffer.fromString("before"));
    await tracker.trackEditStart(resource.fsPath);
    await fileService.writeFile(resource, VSBuffer.fromString("first update"));
    const first = await tracker.snapshotEdit("turn-1", "tc-stream", resource.fsPath);
    const firstContent = await db.readFileEditContent("tc-stream", resource.fsPath);
    await fileService.writeFile(resource, VSBuffer.fromString("second update"));
    const second = await tracker.snapshotEdit("turn-1", "tc-stream", resource.fsPath);
    const secondContent = await db.readFileEditContent("tc-stream", resource.fsPath);
    assert.deepStrictEqual({
      firstType: first?.type,
      firstBefore: firstContent && new TextDecoder().decode(firstContent.beforeContent),
      firstAfter: firstContent && new TextDecoder().decode(firstContent.afterContent),
      secondType: second?.type,
      secondBefore: secondContent && new TextDecoder().decode(secondContent.beforeContent),
      secondAfter: secondContent && new TextDecoder().decode(secondContent.afterContent)
    }, {
      firstType: ToolResultContentType.FileEdit,
      firstBefore: "before",
      firstAfter: "first update",
      secondType: ToolResultContentType.FileEdit,
      secondBefore: "before",
      secondAfter: "second update"
    });
  });
  test("streaming snapshots can persist patch content before it reaches disk", async () => {
    const resource = URI.file("/workspace/pre-apply.txt");
    await fileService.writeFile(resource, VSBuffer.fromString("before"));
    await tracker.trackEditStart(resource.fsPath);
    const edit = await tracker.snapshotEditContent("turn-1", "tc-pre-apply", resource.fsPath, "preview");
    const secondEdit = await tracker.snapshotEditContent("turn-1", "tc-pre-apply", resource.fsPath, "preview 2");
    const content = await db.readFileEditContent("tc-pre-apply", resource.fsPath);
    assert.strictEqual(edit?.type, ToolResultContentType.FileEdit);
    assert.strictEqual(parseSessionDbUri(edit?.after?.content.uri ?? "")?.revision, 1);
    assert.strictEqual(parseSessionDbUri(secondEdit?.after?.content.uri ?? "")?.revision, 2);
    assert.strictEqual(content && new TextDecoder().decode(content.beforeContent), "before");
    assert.strictEqual(content && new TextDecoder().decode(content.afterContent), "preview 2");
    assert.strictEqual((await fileService.readFile(resource)).value.toString(), "before");
  });
  test("preview-before-write then complete keeps the original before snapshot", async () => {
    const resource = URI.file("/workspace/write-file.txt");
    await tracker.trackEditStart(resource.fsPath);
    const preview = await tracker.snapshotEditContent("turn-1", "tc-write", resource.fsPath, "complete file\n");
    await fileService.writeFile(resource, VSBuffer.fromString("complete file\n"));
    await tracker.completeEdit(resource.fsPath);
    const completed = await tracker.takeCompletedEdit("turn-1", "tc-write", resource.fsPath, "write_file", { path: resource.fsPath, contents: "complete file\n" }, "model");
    const stored = await db.readFileEditContent("tc-write", resource.fsPath);
    assert.strictEqual(preview?.type, ToolResultContentType.FileEdit);
    assert.strictEqual(completed?.type, ToolResultContentType.FileEdit);
    assert.strictEqual(stored && new TextDecoder().decode(stored.beforeContent), "");
    assert.strictEqual(stored && new TextDecoder().decode(stored.afterContent), "complete file\n");
  });
  test("abandonEdit drops a pending snapshot so takeCompletedEdit returns nothing", async () => {
    const resource = URI.file("/workspace/abandoned.txt");
    await fileService.writeFile(resource, VSBuffer.fromString("before"));
    await tracker.trackEditStart(resource.fsPath);
    await tracker.snapshotEditContent("turn-1", "tc-abandon", resource.fsPath, "preview");
    tracker.abandonEdit(resource.fsPath);
    await fileService.writeFile(resource, VSBuffer.fromString("after"));
    await tracker.completeEdit(resource.fsPath);
    const result = await tracker.takeCompletedEdit("turn-1", "tc-abandon", resource.fsPath, "write_file", { path: resource.fsPath, contents: "after" }, "model");
    assert.strictEqual(result, void 0);
  });
  test("takeCompletedEdit returns undefined for unknown file path", async () => {
    const result = await tracker.takeCompletedEdit("turn-1", "tc-x", "/nonexistent", "", void 0, void 0);
    assert.strictEqual(result, void 0);
  });
  test("attaches Agent attribution marker to the file edit result", async () => {
    const services = new ServiceCollection();
    let arcReportCount = 0;
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    services.set(IDiffComputeService, new TestDiffComputeService());
    services.set(IAgentEditAttributionService, {
      _serviceBrand: void 0,
      setEnabled: () => {
      },
      recordEdit: async (edit) => ({
        version: 1,
        editId: "edit-1",
        sequence: 1,
        beforeDigest: createFileEditContentDigest(edit.beforeText),
        afterDigest: createFileEditContentDigest(edit.afterText)
      }),
      flushSession: async () => {
      },
      prepareFlush: async () => void 0,
      commitFlush: async () => ({ outcome: "missing", agentModifiedCount: 0 }),
      cancelFlush: async () => ({ outcome: "missing", agentModifiedCount: 0 })
    });
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, {
      _serviceBrand: void 0,
      reportEdit: async () => {
        arcReportCount++;
      }
    });
    const instantiationService = disposables.add(new InstantiationService(services));
    const localTracker = instantiationService.createInstance(FileEditTracker, "copilot:/test-session", db);
    await fileService.writeFile(URI.file("/workspace/marker.txt"), VSBuffer.fromString("before"));
    await localTracker.trackEditStart("/workspace/marker.txt");
    await fileService.writeFile(URI.file("/workspace/marker.txt"), VSBuffer.fromString("after"));
    await localTracker.completeEdit("/workspace/marker.txt");
    const result = await localTracker.takeCompletedEdit("turn-1", "tc-marker", "/workspace/marker.txt", "edit", void 0, "model");
    assert.deepStrictEqual(result && getFileEditAttributionMarker(result), {
      version: 1,
      editId: "edit-1",
      sequence: 1,
      beforeDigest: createFileEditContentDigest("before"),
      afterDigest: createFileEditContentDigest("after")
    });
    assert.strictEqual(arcReportCount, 1);
  });
  test("returns the file edit result when attribution fails", async () => {
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    services.set(IDiffComputeService, new TestDiffComputeService());
    services.set(IAgentEditAttributionService, {
      _serviceBrand: void 0,
      setEnabled: () => {
      },
      recordEdit: async () => {
        throw new Error("Attribution failed");
      },
      flushSession: async () => {
      },
      prepareFlush: async () => void 0,
      commitFlush: async () => ({ outcome: "missing", agentModifiedCount: 0 }),
      cancelFlush: async () => ({ outcome: "missing", agentModifiedCount: 0 })
    });
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, new NullEditArcReporterService());
    const instantiationService = disposables.add(new InstantiationService(services));
    const localTracker = instantiationService.createInstance(FileEditTracker, "copilot:/test-session", db);
    await fileService.writeFile(URI.file("/workspace/fallback.txt"), VSBuffer.fromString("before"));
    await localTracker.trackEditStart("/workspace/fallback.txt");
    await fileService.writeFile(URI.file("/workspace/fallback.txt"), VSBuffer.fromString("after"));
    await localTracker.completeEdit("/workspace/fallback.txt");
    const result = await localTracker.takeCompletedEdit("turn-1", "tc-fallback", "/workspace/fallback.txt", "edit", void 0, "model");
    assert.deepStrictEqual({
      type: result?.type,
      marker: result && getFileEditAttributionMarker(result)
    }, {
      type: ToolResultContentType.FileEdit,
      marker: void 0
    });
  });
  test("reuses the existing diff and does not wait for ARC reporting", async () => {
    const reportStarted = new DeferredPromise();
    const releaseReport = new DeferredPromise();
    const services = new ServiceCollection();
    const localDiffComputeService = new TestDiffComputeService();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    services.set(IDiffComputeService, localDiffComputeService);
    services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, {
      _serviceBrand: void 0,
      reportEdit: async (params) => {
        reportStarted.complete(params);
        await releaseReport.p;
      }
    });
    const instantiationService = disposables.add(new InstantiationService(services));
    const localTracker = instantiationService.createInstance(FileEditTracker, "copilot:/test-session", db);
    await fileService.writeFile(URI.file("/workspace/non-blocking.txt"), VSBuffer.fromString("before"));
    await localTracker.trackEditStart("/workspace/non-blocking.txt", "plan");
    await fileService.writeFile(URI.file("/workspace/non-blocking.txt"), VSBuffer.fromString("after"));
    await localTracker.completeEdit("/workspace/non-blocking.txt");
    const resultPromise = localTracker.takeCompletedEdit("turn-1", "tc-non-blocking", "/workspace/non-blocking.txt", "apply_patch", void 0, "model");
    const report = await reportStarted.p;
    let timeoutHandle;
    const completion = await Promise.race([
      resultPromise.then(() => "complete"),
      new Promise((resolve) => {
        timeoutHandle = setTimeout(() => resolve("timeout"), 100);
      })
    ]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    releaseReport.complete();
    const result = await resultPromise;
    assert.deepStrictEqual({
      completion,
      resultType: result?.type,
      diffCallCount: localDiffComputeService.callCount,
      detailedDiffCallCount: localDiffComputeService.detailedCallCount,
      initialEdit: report.initialEdit,
      mode: report.mode
    }, {
      completion: "complete",
      resultType: ToolResultContentType.FileEdit,
      diffCallCount: 1,
      detailedDiffCallCount: 0,
      initialEdit: {
        replacements: [{ start: 0, endExclusive: 6, text: "after" }]
      },
      mode: "plan"
    });
  });
  test("Write to non-existent file records kind=create with removed=0", async () => {
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    services.set(IDiffComputeService, new TestDiffComputeService({ added: 1, removed: 1, changes: [] }));
    services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, new NullEditArcReporterService());
    const inst = disposables.add(new InstantiationService(services));
    const localTracker = inst.createInstance(FileEditTracker, "copilot:/test-session", db);
    await localTracker.trackEditStart("/workspace/brand-new.txt");
    await fileService.writeFile(URI.file("/workspace/brand-new.txt"), VSBuffer.fromString("fresh"));
    await localTracker.completeEdit("/workspace/brand-new.txt");
    const fileEdit = await localTracker.takeCompletedEdit("turn-1", "tc-create", "/workspace/brand-new.txt", "", void 0, void 0);
    assert.ok(fileEdit);
    const records = await db.getAllFileEdits();
    const created = records.find((r) => r.toolCallId === "tc-create");
    assert.deepStrictEqual({
      diff: fileEdit.diff,
      kind: created?.kind,
      addedLines: created?.addedLines,
      removedLines: created?.removedLines
    }, {
      diff: { added: 1, removed: 0 },
      kind: "create",
      addedLines: 1,
      removedLines: 0
    });
  });
  test("before and after content can be read from database", async () => {
    await fileService.writeFile(URI.file("/workspace/file.ts"), VSBuffer.fromString("original"));
    await tracker.trackEditStart("/workspace/file.ts");
    await fileService.writeFile(URI.file("/workspace/file.ts"), VSBuffer.fromString("modified"));
    await tracker.completeEdit("/workspace/file.ts");
    await tracker.takeCompletedEdit("turn-1", "tc-3", "/workspace/file.ts", "", void 0, void 0);
    const content = await db.readFileEditContent("tc-3", "/workspace/file.ts");
    assert.ok(content);
    assert.strictEqual(new TextDecoder().decode(content.beforeContent), "original");
    assert.strictEqual(new TextDecoder().decode(content.afterContent), "modified");
  });
  test("omits before URI for creates, after URI for deletes, and uses distinct URIs for moves", async () => {
    await tracker.trackEditStart("/workspace/created.txt");
    const created = await tracker.snapshotEditContent("turn-1", "tc-identity-create", "/workspace/created.txt", "new\n", { omitBefore: true });
    assert.strictEqual(created?.before, void 0);
    assert.strictEqual(created?.after?.uri, URI.file("/workspace/created.txt").toString());
    await fileService.writeFile(URI.file("/workspace/deleted.txt"), VSBuffer.fromString("gone\n"));
    await tracker.trackEditStart("/workspace/deleted.txt");
    const deleted = await tracker.snapshotEditContent("turn-1", "tc-identity-delete", "/workspace/deleted.txt", "", { omitAfter: true });
    assert.ok(deleted?.before);
    assert.strictEqual(deleted?.after, void 0);
    await fileService.writeFile(URI.file("/workspace/from.ts"), VSBuffer.fromString("move me\n"));
    await tracker.trackEditStart("/workspace/from.ts");
    const moved = await tracker.snapshotEditContent("turn-1", "tc-identity-move", "/workspace/from.ts", "moved\n", { afterPath: "/workspace/to.ts" });
    assert.strictEqual(moved?.before?.uri, URI.file("/workspace/from.ts").toString());
    assert.strictEqual(moved?.after?.uri, URI.file("/workspace/to.ts").toString());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxmaWxlRWRpdFRyYWNrZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSURpZmZDb21wdXRlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaWZmQ29tcHV0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0LCBnZXRGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyLCBJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBOdWxsQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVFZGl0QXR0cmlidXRpb24uanMnO1xuaW1wb3J0IHsgcGFyc2VTZXNzaW9uRGJVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRiVXJpLmpzJztcbmltcG9ydCB7IFRvb2xSZXN1bHRDb250ZW50VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgVGVzdERpZmZDb21wdXRlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zZXNzaW9uRGF0YWJhc2UuanMnO1xuaW1wb3J0IHsgSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSwgTnVsbEVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2VkaXRTdXJ2aXZhbFJlcG9ydGVyLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0VHJhY2tlciB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2ZpbGVFZGl0VHJhY2tlci5qcyc7XG5pbXBvcnQgeyBJRWRpdEFyY1JlcG9ydGVyTGF1bmNoUGFyYW1zLCBJRWRpdEFyY1JlcG9ydGVyU2VydmljZSwgTnVsbEVkaXRBcmNSZXBvcnRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9lZGl0QXJjUmVwb3J0ZXIuanMnO1xuXG5zdWl0ZSgnRmlsZUVkaXRUcmFja2VyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXHRsZXQgZGI6IFNlc3Npb25EYXRhYmFzZTtcblx0bGV0IHRyYWNrZXI6IEZpbGVFZGl0VHJhY2tlcjtcblx0bGV0IGRpZmZDb21wdXRlU2VydmljZTogVGVzdERpZmZDb21wdXRlU2VydmljZTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3Qgc291cmNlRnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgc291cmNlRnMpKTtcblxuXHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblxuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGRpZmZDb21wdXRlU2VydmljZSA9IG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCk7XG5cdFx0c2VydmljZXMuc2V0KElEaWZmQ29tcHV0ZVNlcnZpY2UsIGRpZmZDb21wdXRlU2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIG5ldyBOdWxsQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5LCBuZXcgTnVsbEVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVkaXRBcmNSZXBvcnRlclNlcnZpY2UsIG5ldyBOdWxsRWRpdEFyY1JlcG9ydGVyU2VydmljZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdHRyYWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlRWRpdFRyYWNrZXIsICdjb3BpbG90Oi90ZXN0LXNlc3Npb24nLCBkYik7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGF3YWl0IGRiLmNsb3NlKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd0cmFja3MgZWRpdCBzdGFydCBhbmQgY29tcGxldGUgZm9yIGV4aXN0aW5nIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL3Rlc3QudHh0JyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ29yaWdpbmFsIGNvbnRlbnRcXG5saW5lIDInKSk7XG5cblx0XHRhd2FpdCB0cmFja2VyLnRyYWNrRWRpdFN0YXJ0KCcvd29ya3NwYWNlL3Rlc3QudHh0Jyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL3Rlc3QudHh0JyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ21vZGlmaWVkIGNvbnRlbnRcXG5saW5lIDJcXG5saW5lIDMnKSk7XG5cdFx0YXdhaXQgdHJhY2tlci5jb21wbGV0ZUVkaXQoJy93b3Jrc3BhY2UvdGVzdC50eHQnKTtcblxuXHRcdGNvbnN0IGZpbGVFZGl0ID0gYXdhaXQgdHJhY2tlci50YWtlQ29tcGxldGVkRWRpdCgndHVybi0xJywgJ3RjLTEnLCAnL3dvcmtzcGFjZS90ZXN0LnR4dCcsICcnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGZpbGVFZGl0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXQudHlwZSwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkNvbXB1dGVTZXJ2aWNlLmNhbGxDb3VudCwgMSk7XG5cblx0XHQvLyBVUklzIGFyZSBwYXJzZWFibGUgc2Vzc2lvbi1kYjogVVJJc1xuXHRcdGNvbnN0IGJlZm9yZUZpZWxkcyA9IHBhcnNlU2Vzc2lvbkRiVXJpKGZpbGVFZGl0LmJlZm9yZSEuY29udGVudC51cmkpO1xuXHRcdGFzc2VydC5vayhiZWZvcmVGaWVsZHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWZvcmVGaWVsZHMuc2Vzc2lvblVyaSwgJ2NvcGlsb3Q6L3Rlc3Qtc2Vzc2lvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWZvcmVGaWVsZHMudG9vbENhbGxJZCwgJ3RjLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVmb3JlRmllbGRzLmZpbGVQYXRoLCAnL3dvcmtzcGFjZS90ZXN0LnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWZvcmVGaWVsZHMucGFydCwgJ2JlZm9yZScpO1xuXG5cdFx0Y29uc3QgYWZ0ZXJGaWVsZHMgPSBwYXJzZVNlc3Npb25EYlVyaShmaWxlRWRpdC5hZnRlciEuY29udGVudC51cmkpO1xuXHRcdGFzc2VydC5vayhhZnRlckZpZWxkcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFmdGVyRmllbGRzLnBhcnQsICdhZnRlcicpO1xuXG5cdFx0Ly8gQ29udGVudCBpcyBwZXJzaXN0ZWQgaW4gdGhlIGRhdGFiYXNlICh3YWl0IGZvciBmaXJlLWFuZC1mb3JnZXQgd3JpdGUpXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZGIucmVhZEZpbGVFZGl0Q29udGVudCgndGMtMScsICcvd29ya3NwYWNlL3Rlc3QudHh0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoY29udGVudC5iZWZvcmVDb250ZW50KSwgJ29yaWdpbmFsIGNvbnRlbnRcXG5saW5lIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQuYWZ0ZXJDb250ZW50KSwgJ21vZGlmaWVkIGNvbnRlbnRcXG5saW5lIDJcXG5saW5lIDMnKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIGVkaXQgZm9yIG5ld2x5IGNyZWF0ZWQgZmlsZSAobm8gYmVmb3JlIGNvbnRlbnQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRyYWNrZXIudHJhY2tFZGl0U3RhcnQoJy93b3Jrc3BhY2UvbmV3LWZpbGUudHh0Jyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL25ldy1maWxlLnR4dCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCduZXcgZmlsZVxcbmNvbnRlbnQnKSk7XG5cdFx0YXdhaXQgdHJhY2tlci5jb21wbGV0ZUVkaXQoJy93b3Jrc3BhY2UvbmV3LWZpbGUudHh0Jyk7XG5cblx0XHRjb25zdCBmaWxlRWRpdCA9IGF3YWl0IHRyYWNrZXIudGFrZUNvbXBsZXRlZEVkaXQoJ3R1cm4tMScsICd0Yy0yJywgJy93b3Jrc3BhY2UvbmV3LWZpbGUudHh0JywgJycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soZmlsZUVkaXQpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGZpcmUtYW5kLWZvcmdldCBEQiB3cml0ZSB0byBjb21wbGV0ZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGRiLnJlYWRGaWxlRWRpdENvbnRlbnQoJ3RjLTInLCAnL3dvcmtzcGFjZS9uZXctZmlsZS50eHQnKTtcblx0XHRhc3NlcnQub2soY29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShjb250ZW50LmJlZm9yZUNvbnRlbnQpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShjb250ZW50LmFmdGVyQ29udGVudCksICduZXcgZmlsZVxcbmNvbnRlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyZWFtaW5nIHNuYXBzaG90cyByZXRhaW4gdGhlIG9yaWdpbmFsIGJlZm9yZSBjb250ZW50IGFuZCByZWZyZXNoIHRoZSBhZnRlciBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3RyZWFtaW5nLnR4dCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYmVmb3JlJykpO1xuXHRcdGF3YWl0IHRyYWNrZXIudHJhY2tFZGl0U3RhcnQocmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnZmlyc3QgdXBkYXRlJykpO1xuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgdHJhY2tlci5zbmFwc2hvdEVkaXQoJ3R1cm4tMScsICd0Yy1zdHJlYW0nLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGNvbnN0IGZpcnN0Q29udGVudCA9IGF3YWl0IGRiLnJlYWRGaWxlRWRpdENvbnRlbnQoJ3RjLXN0cmVhbScsIHJlc291cmNlLmZzUGF0aCk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3NlY29uZCB1cGRhdGUnKSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgdHJhY2tlci5zbmFwc2hvdEVkaXQoJ3R1cm4tMScsICd0Yy1zdHJlYW0nLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGNvbnN0IHNlY29uZENvbnRlbnQgPSBhd2FpdCBkYi5yZWFkRmlsZUVkaXRDb250ZW50KCd0Yy1zdHJlYW0nLCByZXNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaXJzdFR5cGU6IGZpcnN0Py50eXBlLFxuXHRcdFx0Zmlyc3RCZWZvcmU6IGZpcnN0Q29udGVudCAmJiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoZmlyc3RDb250ZW50LmJlZm9yZUNvbnRlbnQpLFxuXHRcdFx0Zmlyc3RBZnRlcjogZmlyc3RDb250ZW50ICYmIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShmaXJzdENvbnRlbnQuYWZ0ZXJDb250ZW50KSxcblx0XHRcdHNlY29uZFR5cGU6IHNlY29uZD8udHlwZSxcblx0XHRcdHNlY29uZEJlZm9yZTogc2Vjb25kQ29udGVudCAmJiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoc2Vjb25kQ29udGVudC5iZWZvcmVDb250ZW50KSxcblx0XHRcdHNlY29uZEFmdGVyOiBzZWNvbmRDb250ZW50ICYmIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShzZWNvbmRDb250ZW50LmFmdGVyQ29udGVudCksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3RUeXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRmaXJzdEJlZm9yZTogJ2JlZm9yZScsXG5cdFx0XHRmaXJzdEFmdGVyOiAnZmlyc3QgdXBkYXRlJyxcblx0XHRcdHNlY29uZFR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdHNlY29uZEJlZm9yZTogJ2JlZm9yZScsXG5cdFx0XHRzZWNvbmRBZnRlcjogJ3NlY29uZCB1cGRhdGUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJlYW1pbmcgc25hcHNob3RzIGNhbiBwZXJzaXN0IHBhdGNoIGNvbnRlbnQgYmVmb3JlIGl0IHJlYWNoZXMgZGlzaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3ByZS1hcHBseS50eHQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JlZm9yZScpKTtcblx0XHRhd2FpdCB0cmFja2VyLnRyYWNrRWRpdFN0YXJ0KHJlc291cmNlLmZzUGF0aCk7XG5cblx0XHRjb25zdCBlZGl0ID0gYXdhaXQgdHJhY2tlci5zbmFwc2hvdEVkaXRDb250ZW50KCd0dXJuLTEnLCAndGMtcHJlLWFwcGx5JywgcmVzb3VyY2UuZnNQYXRoLCAncHJldmlldycpO1xuXHRcdGNvbnN0IHNlY29uZEVkaXQgPSBhd2FpdCB0cmFja2VyLnNuYXBzaG90RWRpdENvbnRlbnQoJ3R1cm4tMScsICd0Yy1wcmUtYXBwbHknLCByZXNvdXJjZS5mc1BhdGgsICdwcmV2aWV3IDInKTtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZGIucmVhZEZpbGVFZGl0Q29udGVudCgndGMtcHJlLWFwcGx5JywgcmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0Py50eXBlLCBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVNlc3Npb25EYlVyaShlZGl0Py5hZnRlcj8uY29udGVudC51cmkgPz8gJycpPy5yZXZpc2lvbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU2Vzc2lvbkRiVXJpKHNlY29uZEVkaXQ/LmFmdGVyPy5jb250ZW50LnVyaSA/PyAnJyk/LnJldmlzaW9uLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCAmJiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoY29udGVudC5iZWZvcmVDb250ZW50KSwgJ2JlZm9yZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50ICYmIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShjb250ZW50LmFmdGVyQ29udGVudCksICdwcmV2aWV3IDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKSwgJ2JlZm9yZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aWV3LWJlZm9yZS13cml0ZSB0aGVuIGNvbXBsZXRlIGtlZXBzIHRoZSBvcmlnaW5hbCBiZWZvcmUgc25hcHNob3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS93cml0ZS1maWxlLnR4dCcpO1xuXHRcdGF3YWl0IHRyYWNrZXIudHJhY2tFZGl0U3RhcnQocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRjb25zdCBwcmV2aWV3ID0gYXdhaXQgdHJhY2tlci5zbmFwc2hvdEVkaXRDb250ZW50KCd0dXJuLTEnLCAndGMtd3JpdGUnLCByZXNvdXJjZS5mc1BhdGgsICdjb21wbGV0ZSBmaWxlXFxuJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdjb21wbGV0ZSBmaWxlXFxuJykpO1xuXHRcdGF3YWl0IHRyYWNrZXIuY29tcGxldGVFZGl0KHJlc291cmNlLmZzUGF0aCk7XG5cdFx0Y29uc3QgY29tcGxldGVkID0gYXdhaXQgdHJhY2tlci50YWtlQ29tcGxldGVkRWRpdCgndHVybi0xJywgJ3RjLXdyaXRlJywgcmVzb3VyY2UuZnNQYXRoLCAnd3JpdGVfZmlsZScsIHsgcGF0aDogcmVzb3VyY2UuZnNQYXRoLCBjb250ZW50czogJ2NvbXBsZXRlIGZpbGVcXG4nIH0sICdtb2RlbCcpO1xuXHRcdGNvbnN0IHN0b3JlZCA9IGF3YWl0IGRiLnJlYWRGaWxlRWRpdENvbnRlbnQoJ3RjLXdyaXRlJywgcmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlldz8udHlwZSwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkPy50eXBlLCBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZWQgJiYgbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKHN0b3JlZC5iZWZvcmVDb250ZW50KSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZWQgJiYgbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKHN0b3JlZC5hZnRlckNvbnRlbnQpLCAnY29tcGxldGUgZmlsZVxcbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdhYmFuZG9uRWRpdCBkcm9wcyBhIHBlbmRpbmcgc25hcHNob3Qgc28gdGFrZUNvbXBsZXRlZEVkaXQgcmV0dXJucyBub3RoaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYWJhbmRvbmVkLnR4dCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYmVmb3JlJykpO1xuXHRcdGF3YWl0IHRyYWNrZXIudHJhY2tFZGl0U3RhcnQocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhd2FpdCB0cmFja2VyLnNuYXBzaG90RWRpdENvbnRlbnQoJ3R1cm4tMScsICd0Yy1hYmFuZG9uJywgcmVzb3VyY2UuZnNQYXRoLCAncHJldmlldycpO1xuXHRcdHRyYWNrZXIuYWJhbmRvbkVkaXQocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FmdGVyJykpO1xuXHRcdGF3YWl0IHRyYWNrZXIuY29tcGxldGVFZGl0KHJlc291cmNlLmZzUGF0aCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdHJhY2tlci50YWtlQ29tcGxldGVkRWRpdCgndHVybi0xJywgJ3RjLWFiYW5kb24nLCByZXNvdXJjZS5mc1BhdGgsICd3cml0ZV9maWxlJywgeyBwYXRoOiByZXNvdXJjZS5mc1BhdGgsIGNvbnRlbnRzOiAnYWZ0ZXInIH0sICdtb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rha2VDb21wbGV0ZWRFZGl0IHJldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIGZpbGUgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0cmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KCd0dXJuLTEnLCAndGMteCcsICcvbm9uZXhpc3RlbnQnLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dGFjaGVzIEFnZW50IGF0dHJpYnV0aW9uIG1hcmtlciB0byB0aGUgZmlsZSBlZGl0IHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGxldCBhcmNSZXBvcnRDb3VudCA9IDA7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c2V0RW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdFx0cmVjb3JkRWRpdDogYXN5bmMgZWRpdCA9PiAoe1xuXHRcdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0XHRlZGl0SWQ6ICdlZGl0LTEnLFxuXHRcdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdFx0YmVmb3JlRGlnZXN0OiBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QoZWRpdC5iZWZvcmVUZXh0KSxcblx0XHRcdFx0YWZ0ZXJEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChlZGl0LmFmdGVyVGV4dCksXG5cdFx0XHR9KSxcblx0XHRcdGZsdXNoU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRjb21taXRGbHVzaDogYXN5bmMgKCkgPT4gKHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSksXG5cdFx0XHRjYW5jZWxGbHVzaDogYXN5bmMgKCkgPT4gKHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSksXG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnksIG5ldyBOdWxsRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5KCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRWRpdEFyY1JlcG9ydGVyU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVwb3J0RWRpdDogYXN5bmMgKCkgPT4geyBhcmNSZXBvcnRDb3VudCsrOyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKSk7XG5cdFx0Y29uc3QgbG9jYWxUcmFja2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRUcmFja2VyLCAnY29waWxvdDovdGVzdC1zZXNzaW9uJywgZGIpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9tYXJrZXIudHh0JyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JlZm9yZScpKTtcblxuXHRcdGF3YWl0IGxvY2FsVHJhY2tlci50cmFja0VkaXRTdGFydCgnL3dvcmtzcGFjZS9tYXJrZXIudHh0Jyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL21hcmtlci50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWZ0ZXInKSk7XG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLmNvbXBsZXRlRWRpdCgnL3dvcmtzcGFjZS9tYXJrZXIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9jYWxUcmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KCd0dXJuLTEnLCAndGMtbWFya2VyJywgJy93b3Jrc3BhY2UvbWFya2VyLnR4dCcsICdlZGl0JywgdW5kZWZpbmVkLCAnbW9kZWwnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0ICYmIGdldEZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIocmVzdWx0KSwge1xuXHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdGVkaXRJZDogJ2VkaXQtMScsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdGJlZm9yZURpZ2VzdDogY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0KCdiZWZvcmUnKSxcblx0XHRcdGFmdGVyRGlnZXN0OiBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QoJ2FmdGVyJyksXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFyY1JlcG9ydENvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB0aGUgZmlsZSBlZGl0IHJlc3VsdCB3aGVuIGF0dHJpYnV0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c2V0RW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdFx0cmVjb3JkRWRpdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0F0dHJpYnV0aW9uIGZhaWxlZCcpO1xuXHRcdFx0fSxcblx0XHRcdGZsdXNoU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRjb21taXRGbHVzaDogYXN5bmMgKCkgPT4gKHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSksXG5cdFx0XHRjYW5jZWxGbHVzaDogYXN5bmMgKCkgPT4gKHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSksXG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnksIG5ldyBOdWxsRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5KCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRWRpdEFyY1JlcG9ydGVyU2VydmljZSwgbmV3IE51bGxFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKSk7XG5cdFx0Y29uc3QgbG9jYWxUcmFja2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRUcmFja2VyLCAnY29waWxvdDovdGVzdC1zZXNzaW9uJywgZGIpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9mYWxsYmFjay50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYmVmb3JlJykpO1xuXG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLnRyYWNrRWRpdFN0YXJ0KCcvd29ya3NwYWNlL2ZhbGxiYWNrLnR4dCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9mYWxsYmFjay50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWZ0ZXInKSk7XG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLmNvbXBsZXRlRWRpdCgnL3dvcmtzcGFjZS9mYWxsYmFjay50eHQnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2NhbFRyYWNrZXIudGFrZUNvbXBsZXRlZEVkaXQoJ3R1cm4tMScsICd0Yy1mYWxsYmFjaycsICcvd29ya3NwYWNlL2ZhbGxiYWNrLnR4dCcsICdlZGl0JywgdW5kZWZpbmVkLCAnbW9kZWwnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHlwZTogcmVzdWx0Py50eXBlLFxuXHRcdFx0bWFya2VyOiByZXN1bHQgJiYgZ2V0RmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlcihyZXN1bHQpLFxuXHRcdH0sIHtcblx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdG1hcmtlcjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXVzZXMgdGhlIGV4aXN0aW5nIGRpZmYgYW5kIGRvZXMgbm90IHdhaXQgZm9yIEFSQyByZXBvcnRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb3J0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SUVkaXRBcmNSZXBvcnRlckxhdW5jaFBhcmFtcz4oKTtcblx0XHRjb25zdCByZWxlYXNlUmVwb3J0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3QgbG9jYWxEaWZmQ29tcHV0ZVNlcnZpY2UgPSBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSURpZmZDb21wdXRlU2VydmljZSwgbG9jYWxEaWZmQ29tcHV0ZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBuZXcgTnVsbEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSwgbmV3IE51bGxFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkoKSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlLCB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRyZXBvcnRFZGl0OiBhc3luYyBwYXJhbXMgPT4ge1xuXHRcdFx0XHRyZXBvcnRTdGFydGVkLmNvbXBsZXRlKHBhcmFtcyk7XG5cdFx0XHRcdGF3YWl0IHJlbGVhc2VSZXBvcnQucDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRjb25zdCBsb2NhbFRyYWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlRWRpdFRyYWNrZXIsICdjb3BpbG90Oi90ZXN0LXNlc3Npb24nLCBkYik7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL25vbi1ibG9ja2luZy50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYmVmb3JlJykpO1xuXG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLnRyYWNrRWRpdFN0YXJ0KCcvd29ya3NwYWNlL25vbi1ibG9ja2luZy50eHQnLCAncGxhbicpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9ub24tYmxvY2tpbmcudHh0JyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FmdGVyJykpO1xuXHRcdGF3YWl0IGxvY2FsVHJhY2tlci5jb21wbGV0ZUVkaXQoJy93b3Jrc3BhY2Uvbm9uLWJsb2NraW5nLnR4dCcpO1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBsb2NhbFRyYWNrZXIudGFrZUNvbXBsZXRlZEVkaXQoJ3R1cm4tMScsICd0Yy1ub24tYmxvY2tpbmcnLCAnL3dvcmtzcGFjZS9ub24tYmxvY2tpbmcudHh0JywgJ2FwcGx5X3BhdGNoJywgdW5kZWZpbmVkLCAnbW9kZWwnKTtcblx0XHRjb25zdCByZXBvcnQgPSBhd2FpdCByZXBvcnRTdGFydGVkLnA7XG5cdFx0bGV0IHRpbWVvdXRIYW5kbGU6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbXBsZXRpb24gPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0cmVzdWx0UHJvbWlzZS50aGVuKCgpID0+ICdjb21wbGV0ZScgYXMgY29uc3QpLFxuXHRcdFx0bmV3IFByb21pc2U8J3RpbWVvdXQnPihyZXNvbHZlID0+IHtcblx0XHRcdFx0dGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSgndGltZW91dCcpLCAxMDApO1xuXHRcdFx0fSksXG5cdFx0XSk7XG5cdFx0aWYgKHRpbWVvdXRIYW5kbGUpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcblx0XHR9XG5cdFx0cmVsZWFzZVJlcG9ydC5jb21wbGV0ZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXBsZXRpb24sXG5cdFx0XHRyZXN1bHRUeXBlOiByZXN1bHQ/LnR5cGUsXG5cdFx0XHRkaWZmQ2FsbENvdW50OiBsb2NhbERpZmZDb21wdXRlU2VydmljZS5jYWxsQ291bnQsXG5cdFx0XHRkZXRhaWxlZERpZmZDYWxsQ291bnQ6IGxvY2FsRGlmZkNvbXB1dGVTZXJ2aWNlLmRldGFpbGVkQ2FsbENvdW50LFxuXHRcdFx0aW5pdGlhbEVkaXQ6IHJlcG9ydC5pbml0aWFsRWRpdCxcblx0XHRcdG1vZGU6IHJlcG9ydC5tb2RlLFxuXHRcdH0sIHtcblx0XHRcdGNvbXBsZXRpb246ICdjb21wbGV0ZScsXG5cdFx0XHRyZXN1bHRUeXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRkaWZmQ2FsbENvdW50OiAxLFxuXHRcdFx0ZGV0YWlsZWREaWZmQ2FsbENvdW50OiAwLFxuXHRcdFx0aW5pdGlhbEVkaXQ6IHtcblx0XHRcdFx0cmVwbGFjZW1lbnRzOiBbeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiA2LCB0ZXh0OiAnYWZ0ZXInIH1dXG5cdFx0XHR9LFxuXHRcdFx0bW9kZTogJ3BsYW4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdXcml0ZSB0byBub24tZXhpc3RlbnQgZmlsZSByZWNvcmRzIGtpbmQ9Y3JlYXRlIHdpdGggcmVtb3ZlZD0wJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFdoZW4gYSBmaWxlIGRpZCBub3QgZXhpc3QgYmVmb3JlIHRoZSBlZGl0LCB0aGUgdHJhY2tlciBjbGFtcHNcblx0XHQvLyBgcmVtb3ZlZGAgdG8gMCAodGhlIGRpZmZlciBvdGhlcndpc2UgcmVwb3J0cyAxIGZvciBhbiBlbXB0eVxuXHRcdC8vIGJlZm9yZS1jb250ZW50IHZzLiBhIG9uZS1saW5lIGFmdGVyLWNvbnRlbnQpIGFuZCByZWNvcmRzXG5cdFx0Ly8gYGtpbmQ9Y3JlYXRlYCBpbnN0ZWFkIG9mIGBlZGl0YC4gYGFkZGVkYCBpcyBwYXNzZWQgdGhyb3VnaFxuXHRcdC8vIGZyb20gdGhlIGRpZmYgc2VydmljZSB1bmNoYW5nZWQuXG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDEsIGNoYW5nZXM6IFtdIH0pKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgbmV3IE51bGxBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnksIG5ldyBOdWxsRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5KCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRWRpdEFyY1JlcG9ydGVyU2VydmljZSwgbmV3IE51bGxFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGluc3Q6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRjb25zdCBsb2NhbFRyYWNrZXIgPSBpbnN0LmNyZWF0ZUluc3RhbmNlKEZpbGVFZGl0VHJhY2tlciwgJ2NvcGlsb3Q6L3Rlc3Qtc2Vzc2lvbicsIGRiKTtcblxuXHRcdGF3YWl0IGxvY2FsVHJhY2tlci50cmFja0VkaXRTdGFydCgnL3dvcmtzcGFjZS9icmFuZC1uZXcudHh0Jyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL2JyYW5kLW5ldy50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnZnJlc2gnKSk7XG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLmNvbXBsZXRlRWRpdCgnL3dvcmtzcGFjZS9icmFuZC1uZXcudHh0Jyk7XG5cblx0XHRjb25zdCBmaWxlRWRpdCA9IGF3YWl0IGxvY2FsVHJhY2tlci50YWtlQ29tcGxldGVkRWRpdCgndHVybi0xJywgJ3RjLWNyZWF0ZScsICcvd29ya3NwYWNlL2JyYW5kLW5ldy50eHQnLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhmaWxlRWRpdCk7XG5cblx0XHRjb25zdCByZWNvcmRzID0gYXdhaXQgZGIuZ2V0QWxsRmlsZUVkaXRzKCk7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IHJlY29yZHMuZmluZChyID0+IHIudG9vbENhbGxJZCA9PT0gJ3RjLWNyZWF0ZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlmZjogZmlsZUVkaXQuZGlmZixcblx0XHRcdGtpbmQ6IGNyZWF0ZWQ/LmtpbmQsXG5cdFx0XHRhZGRlZExpbmVzOiBjcmVhdGVkPy5hZGRlZExpbmVzLFxuXHRcdFx0cmVtb3ZlZExpbmVzOiBjcmVhdGVkPy5yZW1vdmVkTGluZXMsXG5cdFx0fSwge1xuXHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0a2luZDogJ2NyZWF0ZScsXG5cdFx0XHRhZGRlZExpbmVzOiAxLFxuXHRcdFx0cmVtb3ZlZExpbmVzOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdiZWZvcmUgYW5kIGFmdGVyIGNvbnRlbnQgY2FuIGJlIHJlYWQgZnJvbSBkYXRhYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdvcmlnaW5hbCcpKTtcblxuXHRcdGF3YWl0IHRyYWNrZXIudHJhY2tFZGl0U3RhcnQoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ21vZGlmaWVkJykpO1xuXHRcdGF3YWl0IHRyYWNrZXIuY29tcGxldGVFZGl0KCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblxuXHRcdGF3YWl0IHRyYWNrZXIudGFrZUNvbXBsZXRlZEVkaXQoJ3R1cm4tMScsICd0Yy0zJywgJy93b3Jrc3BhY2UvZmlsZS50cycsICcnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZGIucmVhZEZpbGVFZGl0Q29udGVudCgndGMtMycsICcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhc3NlcnQub2soY29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShjb250ZW50LmJlZm9yZUNvbnRlbnQpLCAnb3JpZ2luYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQuYWZ0ZXJDb250ZW50KSwgJ21vZGlmaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIGJlZm9yZSBVUkkgZm9yIGNyZWF0ZXMsIGFmdGVyIFVSSSBmb3IgZGVsZXRlcywgYW5kIHVzZXMgZGlzdGluY3QgVVJJcyBmb3IgbW92ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdHJhY2tlci50cmFja0VkaXRTdGFydCgnL3dvcmtzcGFjZS9jcmVhdGVkLnR4dCcpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCB0cmFja2VyLnNuYXBzaG90RWRpdENvbnRlbnQoJ3R1cm4tMScsICd0Yy1pZGVudGl0eS1jcmVhdGUnLCAnL3dvcmtzcGFjZS9jcmVhdGVkLnR4dCcsICduZXdcXG4nLCB7IG9taXRCZWZvcmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQ/LmJlZm9yZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZD8uYWZ0ZXI/LnVyaSwgVVJJLmZpbGUoJy93b3Jrc3BhY2UvY3JlYXRlZC50eHQnKS50b1N0cmluZygpKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9kZWxldGVkLnR4dCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdnb25lXFxuJykpO1xuXHRcdGF3YWl0IHRyYWNrZXIudHJhY2tFZGl0U3RhcnQoJy93b3Jrc3BhY2UvZGVsZXRlZC50eHQnKTtcblx0XHRjb25zdCBkZWxldGVkID0gYXdhaXQgdHJhY2tlci5zbmFwc2hvdEVkaXRDb250ZW50KCd0dXJuLTEnLCAndGMtaWRlbnRpdHktZGVsZXRlJywgJy93b3Jrc3BhY2UvZGVsZXRlZC50eHQnLCAnJywgeyBvbWl0QWZ0ZXI6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKGRlbGV0ZWQ/LmJlZm9yZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZWQ/LmFmdGVyLCB1bmRlZmluZWQpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL2Zyb20udHMnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnbW92ZSBtZVxcbicpKTtcblx0XHRhd2FpdCB0cmFja2VyLnRyYWNrRWRpdFN0YXJ0KCcvd29ya3NwYWNlL2Zyb20udHMnKTtcblx0XHRjb25zdCBtb3ZlZCA9IGF3YWl0IHRyYWNrZXIuc25hcHNob3RFZGl0Q29udGVudCgndHVybi0xJywgJ3RjLWlkZW50aXR5LW1vdmUnLCAnL3dvcmtzcGFjZS9mcm9tLnRzJywgJ21vdmVkXFxuJywgeyBhZnRlclBhdGg6ICcvd29ya3NwYWNlL3RvLnRzJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZWQ/LmJlZm9yZT8udXJpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS9mcm9tLnRzJykudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdmVkPy5hZnRlcj8udXJpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS90by50cycpLnRvU3RyaW5nKCkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGFBQWEsc0JBQXNCO0FBRTVDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCLDhCQUE4Qiw4QkFBOEIsdUNBQXVDO0FBQ3pJLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsOEJBQThCLHVDQUF1QztBQUM5RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUF1Qyx5QkFBeUIsa0NBQWtDO0FBRWxHLE1BQU0sbUJBQW1CLE1BQU07QUFFOUIsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLFlBQVk7QUFDakIsa0JBQWMsWUFBWSxJQUFJLElBQUksWUFBWSxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ25FLFVBQU0sV0FBVyxZ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
