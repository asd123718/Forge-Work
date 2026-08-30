import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { transaction } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { SyncDescriptor } from "../../../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { INotebookService } from "../../../../notebook/common/notebookService.js";
import { ChatEditingCheckpointTimelineImpl } from "../../../browser/chatEditing/chatEditingCheckpointTimelineImpl.js";
import { FileOperationType } from "../../../browser/chatEditing/chatEditingOperations.js";
suite("ChatEditingCheckpointTimeline", function() {
  const store = new DisposableStore();
  let timeline;
  let fileContents;
  let fileDelegate;
  const DEFAULT_TELEMETRY_INFO = upcastPartial({
    agentId: "testAgent",
    command: void 0,
    sessionResource: URI.parse("chat://test-session"),
    requestId: "test-request",
    result: void 0,
    modelId: void 0,
    modeId: void 0,
    applyCodeBlockSuggestionId: void 0,
    feature: void 0
  });
  function createTextEditOperation(uri, requestId, epoch, edits) {
    return upcastPartial({
      type: FileOperationType.TextEdit,
      uri,
      requestId,
      epoch,
      edits
    });
  }
  function createFileCreateOperation(uri, requestId, epoch, initialContent) {
    return upcastPartial({
      type: FileOperationType.Create,
      uri,
      requestId,
      epoch,
      initialContent
    });
  }
  function createFileDeleteOperation(uri, requestId, epoch, finalContent) {
    return upcastPartial({
      type: FileOperationType.Delete,
      uri,
      requestId,
      epoch,
      finalContent
    });
  }
  function createFileRenameOperation(oldUri, newUri, requestId, epoch) {
    return upcastPartial({
      type: FileOperationType.Rename,
      uri: newUri,
      requestId,
      epoch,
      oldUri,
      newUri
    });
  }
  setup(function() {
    fileContents = new ResourceMap();
    fileDelegate = {
      createFile: async (uri, initialContent) => {
        fileContents.set(uri, initialContent);
      },
      deleteFile: async (uri) => {
        fileContents.delete(uri);
      },
      renameFile: async (fromUri, toUri) => {
        const content = fileContents.get(fromUri);
        if (content !== void 0) {
          fileContents.set(toUri, content);
          fileContents.delete(fromUri);
        }
      },
      setContents: async (uri, content) => {
        fileContents.set(uri, content);
      }
    };
    const collection = new ServiceCollection();
    collection.set(INotebookService, new SyncDescriptor(TestNotebookService));
    const insta = store.add(workbenchInstantiationService(void 0, store).createChild(collection));
    timeline = insta.createInstance(ChatEditingCheckpointTimelineImpl, URI.parse("chat://test-session"), fileDelegate);
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("creates initial checkpoint on construction", function() {
    const checkpoints = timeline.getStateForPersistence().checkpoints;
    assert.strictEqual(checkpoints.length, 1);
    assert.strictEqual(checkpoints[0].requestId, void 0);
    assert.strictEqual(checkpoints[0].label, "Initial State");
  });
  test("canUndo and canRedo are initially false", function() {
    assert.strictEqual(timeline.canUndo.get(), false);
    assert.strictEqual(timeline.canRedo.get(), false);
  });
  test("createCheckpoint increments epoch and creates checkpoint", function() {
    const initialEpoch = timeline.getStateForPersistence().epochCounter;
    timeline.createCheckpoint("req1", "stop1", "Checkpoint 1");
    const state = timeline.getStateForPersistence();
    assert.strictEqual(state.checkpoints.length, 2);
    assert.strictEqual(state.checkpoints[1].requestId, "req1");
    assert.strictEqual(state.checkpoints[1].undoStopId, "stop1");
    assert.strictEqual(state.checkpoints[1].label, "Checkpoint 1");
    assert.strictEqual(state.epochCounter, initialEpoch + 1);
  });
  test("createCheckpoint does not create duplicate checkpoints", function() {
    timeline.createCheckpoint("req1", "stop1", "Checkpoint 1");
    timeline.createCheckpoint("req1", "stop1", "Checkpoint 1 Duplicate");
    const checkpoints = timeline.getStateForPersistence().checkpoints;
    assert.strictEqual(checkpoints.length, 2);
    assert.strictEqual(checkpoints[1].label, "Checkpoint 1");
  });
  test("incrementEpoch increases epoch counter", function() {
    const initialEpoch = timeline.getStateForPersistence().epochCounter;
    const epoch1 = timeline.incrementEpoch();
    const epoch2 = timeline.incrementEpoch();
    assert.strictEqual(epoch1, initialEpoch);
    assert.strictEqual(epoch2, initialEpoch + 1);
    assert.strictEqual(timeline.getStateForPersistence().epochCounter, initialEpoch + 2);
  });
  test("recordFileBaseline stores baseline", function() {
    const uri = URI.parse("file:///test.txt");
    const baseline = upcastPartial({
      uri,
      requestId: "req1",
      content: "initial content",
      epoch: 1,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    });
    timeline.recordFileBaseline(baseline);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req2"), false);
  });
  test("recordFileOperation stores operation", function() {
    const uri = URI.parse("file:///test.txt");
    const operation = createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 1), text: "hello" }]
    );
    timeline.recordFileOperation(operation);
    const state = timeline.getStateForPersistence();
    assert.strictEqual(state.operations.length, 1);
    assert.strictEqual(state.operations[0].type, FileOperationType.TextEdit);
    assert.strictEqual(state.operations[0].requestId, "req1");
  });
  test("basic undo/redo with text edits", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "hello",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start of Request");
    const editEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      editEpoch,
      [{ range: new Range(1, 1, 1, 6), text: "goodbye" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "After Edit");
    assert.strictEqual(timeline.canUndo.get(), true);
    assert.strictEqual(timeline.canRedo.get(), false);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(timeline.canUndo.get(), false);
    assert.strictEqual(timeline.canRedo.get(), true);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(timeline.canUndo.get(), true);
  });
  test("file creation and deletion operations", async function() {
    const uri = URI.parse("file:///new.txt");
    const createEpoch = timeline.incrementEpoch();
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "new file content",
      epoch: createEpoch,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      createEpoch,
      "new file content"
    ));
    timeline.createCheckpoint("req1", "created", "File Created");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    assert.strictEqual(fileContents.has(uri), false);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "created"));
    assert.strictEqual(fileContents.get(uri), "new file content");
    const deleteEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createFileDeleteOperation(
      uri,
      "req1",
      deleteEpoch,
      "new file content"
    ));
    timeline.createCheckpoint("req1", "deleted", "File Deleted");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "deleted"));
    assert.strictEqual(fileContents.has(uri), false);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(uri), "new file content");
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.has(uri), false);
  });
  test("file rename operations", async function() {
    const oldUri = URI.parse("file:///old.txt");
    const newUri = URI.parse("file:///new.txt");
    const createEpoch = timeline.incrementEpoch();
    timeline.recordFileBaseline(upcastPartial({
      uri: oldUri,
      requestId: "req1",
      content: "content",
      epoch: createEpoch,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      oldUri,
      "req1",
      createEpoch,
      "content"
    ));
    timeline.createCheckpoint("req1", "created", "File Created");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "created"));
    assert.strictEqual(fileContents.get(oldUri), "content");
    const renameEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createFileRenameOperation(
      oldUri,
      newUri,
      "req1",
      renameEpoch
    ));
    timeline.createCheckpoint("req1", "renamed", "File Renamed");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "renamed"));
    assert.strictEqual(fileContents.has(oldUri), false);
    assert.strictEqual(fileContents.get(newUri), "content");
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(oldUri), "content");
    assert.strictEqual(fileContents.has(newUri), false);
  });
  test("multiple sequential edits to same file", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "line1\nline2\nline3",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 6), text: "LINE1" }]
    ));
    timeline.createCheckpoint("req1", "edit1", "Edit 1");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(2, 1, 2, 6), text: "LINE2" }]
    ));
    timeline.createCheckpoint("req1", "edit2", "Edit 2");
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "edit1"));
    assert.strictEqual(fileContents.get(uri), "LINE1\nline2\nline3");
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "edit2"));
    assert.strictEqual(fileContents.get(uri), "LINE1\nLINE2\nline3");
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", void 0));
    assert.strictEqual(fileContents.get(uri), "line1\nline2\nline3");
  });
  test("getCheckpointIdForRequest returns correct checkpoint", function() {
    timeline.createCheckpoint("req1", void 0, "Start of req1");
    timeline.createCheckpoint("req1", "stop1", "Stop 1");
    timeline.createCheckpoint("req2", void 0, "Start of req2");
    const req1Start = timeline.getCheckpointIdForRequest("req1", void 0);
    const req1Stop = timeline.getCheckpointIdForRequest("req1", "stop1");
    const req2Start = timeline.getCheckpointIdForRequest("req2", void 0);
    assert.ok(req1Start);
    assert.ok(req1Stop);
    assert.ok(req2Start);
    assert.notStrictEqual(req1Start, req1Stop);
    assert.notStrictEqual(req1Start, req2Start);
  });
  test("getCheckpointIdForRequest returns undefined for non-existent checkpoint", function() {
    const checkpoint = timeline.getCheckpointIdForRequest("nonexistent", "stop1");
    assert.strictEqual(checkpoint, void 0);
  });
  test("requestDisablement tracks disabled requests", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.createCheckpoint("req1", void 0, "Start req1");
    timeline.recordFileOperation(createFileCreateOperation(uri, "req1", timeline.incrementEpoch(), "a"));
    timeline.createCheckpoint("req1", "stop1", "Stop req1");
    timeline.recordFileOperation(createTextEditOperation(uri, "req1", timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 2), text: "b" }]));
    timeline.createCheckpoint("req2", void 0, "Start req2");
    timeline.recordFileOperation(createTextEditOperation(uri, "req2", timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 2), text: "c" }]));
    assert.deepStrictEqual(timeline.requestDisablement.get(), []);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(uri), "b");
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 }
    ]);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(uri), "a");
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 },
      { requestId: "req1", afterUndoStop: "stop1" }
    ]);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(uri), void 0);
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 },
      { requestId: "req1", afterUndoStop: void 0 }
    ]);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(fileContents.get(uri), "a");
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 },
      { requestId: "req1", afterUndoStop: "stop1" }
    ]);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(fileContents.get(uri), "b");
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 }
    ]);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(fileContents.get(uri), "c");
  });
  test("persistence - save and restore state", function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "modified" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Edit Complete");
    const savedState = timeline.getStateForPersistence();
    const collection = new ServiceCollection();
    collection.set(INotebookService, new SyncDescriptor(TestNotebookService));
    const insta = store.add(workbenchInstantiationService(void 0, store).createChild(collection));
    const newTimeline = insta.createInstance(
      ChatEditingCheckpointTimelineImpl,
      URI.parse("chat://test-session-2"),
      fileDelegate
    );
    transaction((tx) => {
      newTimeline.restoreFromState(savedState, tx);
    });
    const restoredState = newTimeline.getStateForPersistence();
    assert.strictEqual(restoredState.checkpoints.length, savedState.checkpoints.length);
    assert.strictEqual(restoredState.operations.length, savedState.operations.length);
    assert.strictEqual(restoredState.currentEpoch, savedState.currentEpoch);
    assert.strictEqual(restoredState.epochCounter, savedState.epochCounter);
  });
  test("navigating between multiple requests", async function() {
    const uri1 = URI.parse("file:///file1.txt");
    const uri2 = URI.parse("file:///file2.txt");
    timeline.createCheckpoint("req1", void 0, "Start req1");
    const create1Epoch = timeline.incrementEpoch();
    timeline.recordFileBaseline(upcastPartial({
      uri: uri1,
      requestId: "req1",
      content: "file1 modified",
      epoch: create1Epoch,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      uri1,
      "req1",
      create1Epoch,
      "file1 modified"
    ));
    timeline.createCheckpoint("req1", "stop1", "Req1 complete");
    timeline.createCheckpoint("req2", void 0, "Start req2");
    const create2Epoch = timeline.incrementEpoch();
    timeline.recordFileBaseline(upcastPartial({
      uri: uri2,
      requestId: "req2",
      content: "file2 modified",
      epoch: create2Epoch,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      uri2,
      "req2",
      create2Epoch,
      "file2 modified"
    ));
    timeline.createCheckpoint("req2", "stop1", "Req2 complete");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "stop1"));
    assert.strictEqual(fileContents.get(uri1), "file1 modified");
    assert.strictEqual(fileContents.has(uri2), false);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req2", "stop1"));
    assert.strictEqual(fileContents.get(uri1), "file1 modified");
    assert.strictEqual(fileContents.get(uri2), "file2 modified");
    const initialCheckpoint = timeline.getStateForPersistence().checkpoints[0];
    await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
    assert.strictEqual(fileContents.has(uri1), false);
    assert.strictEqual(fileContents.has(uri2), false);
  });
  test("getContentURIAtStop returns snapshot URI", function() {
    const fileUri = URI.parse("file:///test.txt");
    const snapshotUri = timeline.getContentURIAtStop("req1", fileUri, "stop1");
    assert.ok(snapshotUri);
    assert.notStrictEqual(snapshotUri.toString(), fileUri.toString());
    assert.ok(snapshotUri.toString().includes("req1"));
  });
  test("undoing entire request when appropriate", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start req1");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "modified" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Edit complete");
    assert.strictEqual(timeline.canUndo.get(), true);
    await timeline.undoToLastCheckpoint();
    const state = timeline.getStateForPersistence();
    assert.strictEqual(state.currentEpoch, 2);
  });
  test("operations use incrementing epochs", function() {
    const uri = URI.parse("file:///test.txt");
    const epoch1 = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      epoch1,
      [{ range: new Range(1, 1, 1, 1), text: "edit1" }]
    ));
    const epoch2 = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      epoch2,
      [{ range: new Range(2, 1, 2, 1), text: "edit2" }]
    ));
    const operations = timeline.getStateForPersistence().operations;
    assert.strictEqual(operations.length, 2);
    assert.strictEqual(operations[0].epoch, epoch1);
    assert.strictEqual(operations[1].epoch, epoch2);
  });
  test("navigateToCheckpoint throws error for invalid checkpoint ID", async function() {
    let errorThrown = false;
    try {
      await timeline.navigateToCheckpoint("invalid-checkpoint-id");
    } catch (error) {
      errorThrown = true;
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes("not found"));
    }
    assert.ok(errorThrown, "Expected error to be thrown");
  });
  test("navigateToCheckpoint does nothing when already at target epoch", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    const createEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      createEpoch,
      [{ range: new Range(1, 1, 1, 8), text: "modified" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Checkpoint");
    const checkpointId = timeline.getCheckpointIdForRequest("req1", "stop1");
    await timeline.navigateToCheckpoint(checkpointId);
    const stateBefore = timeline.getStateForPersistence();
    await timeline.navigateToCheckpoint(checkpointId);
    const stateAfter = timeline.getStateForPersistence();
    assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
  });
  test("recording operation after undo truncates future history", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "edit1" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Edit 1");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 6), text: "edit2" }]
    ));
    timeline.createCheckpoint("req1", "stop2", "Edit 2");
    const stateWithTwoEdits = timeline.getStateForPersistence();
    assert.strictEqual(stateWithTwoEdits.operations.length, 2);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "stop1"));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 6), text: "edit3" }]
    ));
    const stateAfterNewEdit = timeline.getStateForPersistence();
    assert.strictEqual(stateAfterNewEdit.operations.length, 2);
    assert.strictEqual(stateAfterNewEdit.operations[1].type, FileOperationType.TextEdit);
  });
  test("redo after recording new operation should work", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "edit1" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Edit 1");
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(timeline.canRedo.get(), true);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(timeline.canUndo.get(), true);
  });
  test("redo when there is no checkpoint after operation", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "edit1" }]
    ));
    const startCheckpoint = timeline.getCheckpointIdForRequest("req1", void 0);
    await timeline.navigateToCheckpoint(startCheckpoint);
    assert.strictEqual(timeline.canRedo.get(), true);
    await timeline.redoToNextCheckpoint();
    const state = timeline.getStateForPersistence();
    assert.ok(state.currentEpoch > 1);
  });
  test("getContentAtStop returns empty for non-existent file", async function() {
    const uri = URI.parse("file:///nonexistent.txt");
    const content = await timeline.getContentAtStop("req1", uri, "stop1");
    assert.strictEqual(content, "");
  });
  test("getContentAtStop with epoch-based stopId", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    const editEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      editEpoch,
      [{ range: new Range(1, 1, 1, 8), text: "modified" }]
    ));
    const content = await timeline.getContentAtStop("req1", uri, `__epoch_${editEpoch + 1}`);
    assert.ok(content);
    assert.strictEqual(content, "modified");
  });
  test("hasFileBaseline correctly reports baseline existence", function() {
    const uri = URI.parse("file:///test.txt");
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), false);
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req2"), false);
  });
  test("hasFileBaseline returns true for files with create operations", function() {
    const uri = URI.parse("file:///created.txt");
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), false);
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      "created content"
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req2"), false);
  });
  test("hasFileBaseline distinguishes between different request IDs for create operations", function() {
    const uri = URI.parse("file:///created.txt");
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      "content from req1"
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req2"), false);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req3"), false);
  });
  test("hasFileBaseline returns true when both baseline and create operation exist", function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "baseline content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      "created content"
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
  });
  test("hasFileBaseline with create operation followed by edit", function() {
    const uri = URI.parse("file:///created-and-edited.txt");
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      "initial content"
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 16), text: "edited content" }]
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
  });
  test("multiple text edits to same file are properly replayed", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "line1\nline2\nline3",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 6), text: "LINE1" }]
    ));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(2, 1, 2, 6), text: "LINE2" }]
    ));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(3, 1, 3, 6), text: "LINE3" }]
    ));
    timeline.createCheckpoint("req1", "all-edits", "All edits");
    const initialCheckpoint = timeline.getStateForPersistence().checkpoints[0];
    await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "all-edits"));
    assert.strictEqual(fileContents.get(uri), "LINE1\nLINE2\nLINE3");
  });
  test("checkpoint with same requestId and undoStopId is not duplicated", function() {
    timeline.createCheckpoint("req1", "stop1", "First");
    timeline.createCheckpoint("req1", "stop1", "Second");
    const checkpoints = timeline.getStateForPersistence().checkpoints;
    const req1Stop1Checkpoints = checkpoints.filter((c) => c.requestId === "req1" && c.undoStopId === "stop1");
    assert.strictEqual(req1Stop1Checkpoints.length, 1);
    assert.strictEqual(req1Stop1Checkpoints[0].label, "First");
  });
  test("finding baseline after file rename operation", async function() {
    const oldUri = URI.parse("file:///old.txt");
    const newUri = URI.parse("file:///new.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri: oldUri,
      requestId: "req1",
      content: "initial content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createTextEditOperation(
      oldUri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 16), text: "modified content" }]
    ));
    timeline.recordFileOperation(createFileRenameOperation(
      oldUri,
      newUri,
      "req1",
      timeline.incrementEpoch()
    ));
    timeline.createCheckpoint("req1", "renamed", "After rename");
    const content = await timeline.getContentAtStop("req1", newUri, "renamed");
    assert.strictEqual(content, "modified content");
  });
  test("baseline lookup across different request IDs", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "req1 content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 13), text: "req1 modified" }]
    ));
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req2",
      content: "req2 content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req2",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 13), text: "req2 modified" }]
    ));
    timeline.createCheckpoint("req2", "stop1", "Req2 checkpoint");
    const content = await timeline.getContentAtStop("req2", uri, "stop1");
    assert.strictEqual(content, "req2 modified");
  });
  test("getContentAtStop with file that does not exist in operations", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", "stop1", "Checkpoint");
    const differentUri = URI.parse("file:///different.txt");
    const content = await timeline.getContentAtStop("req1", differentUri, "stop1");
    assert.strictEqual(content, "");
  });
  test("undoToLastCheckpoint when canUndo is false does nothing", async function() {
    assert.strictEqual(timeline.canUndo.get(), false);
    const stateBefore = timeline.getStateForPersistence();
    await timeline.undoToLastCheckpoint();
    const stateAfter = timeline.getStateForPersistence();
    assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
  });
  test("redoToNextCheckpoint when canRedo is false does nothing", async function() {
    assert.strictEqual(timeline.canRedo.get(), false);
    const stateBefore = timeline.getStateForPersistence();
    await timeline.redoToNextCheckpoint();
    const stateAfter = timeline.getStateForPersistence();
    assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
  });
  test("orphaned operations and checkpoints are removed after undo and new changes", async function() {
    const uri = URI.parse("file:///test.txt");
    const createEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      createEpoch,
      "initial content"
    ));
    timeline.createCheckpoint("req1", void 0, "Start req1");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 16), text: "first edit" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "First Edit");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 11), text: "second edit" }]
    ));
    timeline.createCheckpoint("req1", "stop2", "Second Edit");
    let state = timeline.getStateForPersistence();
    assert.strictEqual(state.operations.length, 3);
    assert.strictEqual(state.checkpoints.length, 4);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "stop1"));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 11), text: "replacement edit" }]
    ));
    timeline.createCheckpoint("req1", "stop2-new", "Replacement Edit");
    state = timeline.getStateForPersistence();
    assert.strictEqual(state.operations.length, 3, "Should still have 3 operations (create + first + replacement)");
    assert.strictEqual(state.checkpoints.length, 4, "Should have 4 checkpoints (initial, start, stop1, stop2-new)");
    const thirdOp = state.operations[2];
    assert.strictEqual(thirdOp.type, FileOperationType.TextEdit);
    if (thirdOp.type === FileOperationType.TextEdit) {
      assert.strictEqual(thirdOp.edits[0].text, "replacement edit");
    }
    const stop2NewCheckpoint = timeline.getCheckpointIdForRequest("req1", "stop2-new");
    const stop2OldCheckpoint = timeline.getCheckpointIdForRequest("req1", "stop2");
    assert.ok(stop2NewCheckpoint, "New checkpoint should exist");
    assert.strictEqual(stop2OldCheckpoint, void 0, "Old orphaned checkpoint should be removed");
    const initialCheckpoint = state.checkpoints[0];
    const startCheckpoint = timeline.getCheckpointIdForRequest("req1", void 0);
    const stop1Checkpoint = timeline.getCheckpointIdForRequest("req1", "stop1");
    const stop2NewCheckpointId = timeline.getCheckpointIdForRequest("req1", "stop2-new");
    await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
    assert.strictEqual(fileContents.has(uri), false);
    await timeline.navigateToCheckpoint(startCheckpoint);
    assert.strictEqual(fileContents.get(uri), "initial content");
    await timeline.navigateToCheckpoint(stop1Checkpoint);
    assert.strictEqual(fileContents.get(uri), "first edit");
    await timeline.navigateToCheckpoint(stop2NewCheckpointId);
    assert.strictEqual(fileContents.get(uri), "replacement edit");
    await timeline.navigateToCheckpoint(startCheckpoint);
    assert.strictEqual(fileContents.get(uri), "initial content");
    await timeline.navigateToCheckpoint(stop1Checkpoint);
    assert.strictEqual(fileContents.get(uri), "first edit");
    await timeline.navigateToCheckpoint(stop2NewCheckpointId);
    assert.strictEqual(fileContents.get(uri), "replacement edit", "Orphaned edit should never reappear");
    await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
    await timeline.navigateToCheckpoint(stop2NewCheckpointId);
    assert.strictEqual(fileContents.get(uri), "replacement edit", "Content should still be correct after full timeline traversal");
  });
  test("undo/redo with multiple no-edit requests advances one request at a time", async function() {
    timeline.createCheckpoint("req1", void 0, "Start req1");
    timeline.createCheckpoint("req2", void 0, "Start req2");
    timeline.createCheckpoint("req3", void 0, "Start req3");
    timeline.createCheckpoint("req4", void 0, "Start req4");
    assert.strictEqual(timeline.canUndo.get(), true);
    await timeline.undoToLastCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4"]);
    await timeline.undoToLastCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3"]);
    await timeline.undoToLastCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3", "req2"]);
    await timeline.undoToLastCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3", "req2", "req1"]);
    assert.strictEqual(timeline.canUndo.get(), false);
    assert.strictEqual(timeline.canRedo.get(), true);
    await timeline.redoToNextCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3", "req2"]);
    await timeline.redoToNextCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3"]);
    await timeline.redoToNextCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4"]);
    await timeline.redoToNextCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), []);
    assert.strictEqual(timeline.canRedo.get(), false);
  });
});
class TestNotebookService {
  getNotebookTextModel() {
    return void 0;
  }
  hasSupportedNotebooks() {
    return false;
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmVJbXBsLCBJQ2hhdEVkaXRpbmdUaW1lbGluZUZzRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbC5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IElNb2RpZmllZEVudHJ5VGVsZW1ldHJ5SW5mbyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5cbnN1aXRlKCdDaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZScsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHRpbWVsaW5lOiBDaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZUltcGw7XG5cdGxldCBmaWxlQ29udGVudHM6IFJlc291cmNlTWFwPHN0cmluZz47XG5cdGxldCBmaWxlRGVsZWdhdGU6IElDaGF0RWRpdGluZ1RpbWVsaW5lRnNEZWxlZ2F0ZTtcblxuXHRjb25zdCBERUZBVUxUX1RFTEVNRVRSWV9JTkZPOiBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8gPSB1cGNhc3RQYXJ0aWFsKHtcblx0XHRhZ2VudElkOiAndGVzdEFnZW50Jyxcblx0XHRjb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQ6Ly90ZXN0LXNlc3Npb24nKSxcblx0XHRyZXF1ZXN0SWQ6ICd0ZXN0LXJlcXVlc3QnLFxuXHRcdHJlc3VsdDogdW5kZWZpbmVkLFxuXHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRtb2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdGZlYXR1cmU6IHVuZGVmaW5lZCxcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24odXJpOiBVUkksIHJlcXVlc3RJZDogc3RyaW5nLCBlcG9jaDogbnVtYmVyLCBlZGl0czogeyByYW5nZTogUmFuZ2U7IHRleHQ6IHN0cmluZyB9W10pOiBGaWxlT3BlcmF0aW9uIHtcblx0XHRyZXR1cm4gdXBjYXN0UGFydGlhbDxGaWxlT3BlcmF0aW9uPih7XG5cdFx0XHR0eXBlOiBGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdCxcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdGVwb2NoLFxuXHRcdFx0ZWRpdHNcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUZpbGVDcmVhdGVPcGVyYXRpb24odXJpOiBVUkksIHJlcXVlc3RJZDogc3RyaW5nLCBlcG9jaDogbnVtYmVyLCBpbml0aWFsQ29udGVudDogc3RyaW5nKTogRmlsZU9wZXJhdGlvbiB7XG5cdFx0cmV0dXJuIHVwY2FzdFBhcnRpYWw8RmlsZU9wZXJhdGlvbj4oe1xuXHRcdFx0dHlwZTogRmlsZU9wZXJhdGlvblR5cGUuQ3JlYXRlLFxuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0ZXBvY2gsXG5cdFx0XHRpbml0aWFsQ29udGVudFxuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRmlsZURlbGV0ZU9wZXJhdGlvbih1cmk6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcsIGVwb2NoOiBudW1iZXIsIGZpbmFsQ29udGVudDogc3RyaW5nKTogRmlsZU9wZXJhdGlvbiB7XG5cdFx0cmV0dXJuIHVwY2FzdFBhcnRpYWw8RmlsZU9wZXJhdGlvbj4oe1xuXHRcdFx0dHlwZTogRmlsZU9wZXJhdGlvblR5cGUuRGVsZXRlLFxuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0ZXBvY2gsXG5cdFx0XHRmaW5hbENvbnRlbnRcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUZpbGVSZW5hbWVPcGVyYXRpb24ob2xkVXJpOiBVUkksIG5ld1VyaTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZywgZXBvY2g6IG51bWJlcik6IEZpbGVPcGVyYXRpb24ge1xuXHRcdHJldHVybiB1cGNhc3RQYXJ0aWFsPEZpbGVPcGVyYXRpb24+KHtcblx0XHRcdHR5cGU6IEZpbGVPcGVyYXRpb25UeXBlLlJlbmFtZSxcblx0XHRcdHVyaTogbmV3VXJpLFxuXHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0ZXBvY2gsXG5cdFx0XHRvbGRVcmksXG5cdFx0XHRuZXdVcmlcblx0XHR9KTtcblx0fVxuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRmaWxlQ29udGVudHMgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpO1xuXG5cdFx0ZmlsZURlbGVnYXRlID0ge1xuXHRcdFx0Y3JlYXRlRmlsZTogYXN5bmMgKHVyaTogVVJJLCBpbml0aWFsQ29udGVudDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGZpbGVDb250ZW50cy5zZXQodXJpLCBpbml0aWFsQ29udGVudCk7XG5cdFx0XHR9LFxuXHRcdFx0ZGVsZXRlRmlsZTogYXN5bmMgKHVyaTogVVJJKSA9PiB7XG5cdFx0XHRcdGZpbGVDb250ZW50cy5kZWxldGUodXJpKTtcblx0XHRcdH0sXG5cdFx0XHRyZW5hbWVGaWxlOiBhc3luYyAoZnJvbVVyaTogVVJJLCB0b1VyaTogVVJJKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBmaWxlQ29udGVudHMuZ2V0KGZyb21VcmkpO1xuXHRcdFx0XHRpZiAoY29udGVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZmlsZUNvbnRlbnRzLnNldCh0b1VyaSwgY29udGVudCk7XG5cdFx0XHRcdFx0ZmlsZUNvbnRlbnRzLmRlbGV0ZShmcm9tVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHNldENvbnRlbnRzOiBhc3luYyAodXJpOiBVUkksIGNvbnRlbnQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRmaWxlQ29udGVudHMuc2V0KHVyaSwgY29udGVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRjb2xsZWN0aW9uLnNldChJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdE5vdGVib29rU2VydmljZSkpO1xuXHRcdGNvbnN0IGluc3RhID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpLmNyZWF0ZUNoaWxkKGNvbGxlY3Rpb24pKTtcblxuXHRcdHRpbWVsaW5lID0gaW5zdGEuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmVJbXBsLCBVUkkucGFyc2UoJ2NoYXQ6Ly90ZXN0LXNlc3Npb24nKSwgZmlsZURlbGVnYXRlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgaW5pdGlhbCBjaGVja3BvaW50IG9uIGNvbnN0cnVjdGlvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjaGVja3BvaW50cyA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5jaGVja3BvaW50cztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2twb2ludHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2twb2ludHNbMF0ucmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja3BvaW50c1swXS5sYWJlbCwgJ0luaXRpYWwgU3RhdGUnKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuVW5kbyBhbmQgY2FuUmVkbyBhcmUgaW5pdGlhbGx5IGZhbHNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5VbmRvLmdldCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblJlZG8uZ2V0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQ2hlY2twb2ludCBpbmNyZW1lbnRzIGVwb2NoIGFuZCBjcmVhdGVzIGNoZWNrcG9pbnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5pdGlhbEVwb2NoID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLmVwb2NoQ291bnRlcjtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnQ2hlY2twb2ludCAxJyk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY2hlY2twb2ludHMubGVuZ3RoLCAyKTsgLy8gSW5pdGlhbCArIG5ldyBjaGVja3BvaW50XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmNoZWNrcG9pbnRzWzFdLnJlcXVlc3RJZCwgJ3JlcTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY2hlY2twb2ludHNbMV0udW5kb1N0b3BJZCwgJ3N0b3AxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmNoZWNrcG9pbnRzWzFdLmxhYmVsLCAnQ2hlY2twb2ludCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmVwb2NoQ291bnRlciwgaW5pdGlhbEVwb2NoICsgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUNoZWNrcG9pbnQgZG9lcyBub3QgY3JlYXRlIGR1cGxpY2F0ZSBjaGVja3BvaW50cycsIGZ1bmN0aW9uICgpIHtcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AxJywgJ0NoZWNrcG9pbnQgMScpO1xuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnQ2hlY2twb2ludCAxIER1cGxpY2F0ZScpO1xuXG5cdFx0Y29uc3QgY2hlY2twb2ludHMgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuY2hlY2twb2ludHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrcG9pbnRzLmxlbmd0aCwgMik7IC8vIE9ubHkgaW5pdGlhbCArIGZpcnN0IGNoZWNrcG9pbnRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2twb2ludHNbMV0ubGFiZWwsICdDaGVja3BvaW50IDEnKTsgLy8gT3JpZ2luYWwgbGFiZWwgcHJlc2VydmVkXG5cdH0pO1xuXG5cdHRlc3QoJ2luY3JlbWVudEVwb2NoIGluY3JlYXNlcyBlcG9jaCBjb3VudGVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGluaXRpYWxFcG9jaCA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5lcG9jaENvdW50ZXI7XG5cblx0XHRjb25zdCBlcG9jaDEgPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdGNvbnN0IGVwb2NoMiA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXBvY2gxLCBpbml0aWFsRXBvY2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcG9jaDIsIGluaXRpYWxFcG9jaCArIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuZXBvY2hDb3VudGVyLCBpbml0aWFsRXBvY2ggKyAyKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkRmlsZUJhc2VsaW5lIHN0b3JlcyBiYXNlbGluZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblx0XHRjb25zdCBiYXNlbGluZSA9IHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRjb250ZW50OiAnaW5pdGlhbCBjb250ZW50Jyxcblx0XHRcdGVwb2NoOiAxLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKGJhc2VsaW5lKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHVyaSwgJ3JlcTInKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRGaWxlT3BlcmF0aW9uIHN0b3JlcyBvcGVyYXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2hlbGxvJyB9XVxuXHRcdCk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKG9wZXJhdGlvbik7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlcmF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVyYXRpb25zWzBdLnR5cGUsIEZpbGVPcGVyYXRpb25UeXBlLlRleHRFZGl0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlcmF0aW9uc1swXS5yZXF1ZXN0SWQsICdyZXExJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jhc2ljIHVuZG8vcmVkbyB3aXRoIHRleHQgZWRpdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHQvLyBSZWNvcmQgYmFzZWxpbmVcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdoZWxsbycsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHQvLyBDcmVhdGUgY2hlY2twb2ludCBiZWZvcmUgZWRpdCAtIG1hcmtzIHN0YXRlIHdpdGggYmFzZWxpbmVcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQgb2YgUmVxdWVzdCcpO1xuXG5cdFx0Ly8gUmVjb3JkIGVkaXQgYXQgYSBuZXcgZXBvY2hcblx0XHRjb25zdCBlZGl0RXBvY2ggPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHRlZGl0RXBvY2gsXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDYpLCB0ZXh0OiAnZ29vZGJ5ZScgfV1cblx0XHQpKTtcblxuXHRcdC8vIENyZWF0ZSBjaGVja3BvaW50IGFmdGVyIGVkaXQgLSBtYXJrcyBzdGF0ZSB3aXRoIGVkaXQgYXBwbGllZFxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnQWZ0ZXIgRWRpdCcpO1xuXG5cdFx0Ly8gY2FuVW5kbyBhbmQgY2FuUmVkbyBhcmUgYmFzZWQgb24gY2hlY2twb2ludCBwb3NpdGlvbnMsIG5vdCBkZWxlZ2F0ZSBzdGF0ZVxuXHRcdC8vIFdlIGhhdmU6IEluaXRpYWwsIFN0YXJ0IG9mIFJlcXVlc3QsIEFmdGVyIEVkaXRcblx0XHQvLyBDdXJyZW50IGVwb2NoIGlzIGFmdGVyICdBZnRlciBFZGl0Jywgc28gd2UgY2FuIHVuZG8gYnV0IG5vdCByZWRvXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblVuZG8uZ2V0KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5SZWRvLmdldCgpLCBmYWxzZSk7XG5cblx0XHQvLyBVbmRvIChnb2VzIHRvIHN0YXJ0IG9mIHJlcXVlc3QpXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblxuXHRcdC8vIEFmdGVyIHVuZG9pbmcgdG8gc3RhcnQgb2YgcmVxdWVzdCwgd2UgY2FuJ3QgdW5kbyB3aXRoaW4gdGhpcyByZXF1ZXN0IGFueW1vcmVcblx0XHQvLyBidXQgd2UgY2FuIHJlZG8gdG8gdGhlICdzdG9wMScgY2hlY2twb2ludFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5VbmRvLmdldCgpLCBmYWxzZSk7IC8vIE5vIG1vcmUgdW5kbyBzdG9wcyBpbiByZXExIGJlZm9yZSB0aGlzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblJlZG8uZ2V0KCksIHRydWUpOyAvLyBDYW4gcmVkbyB0byAnc3RvcDEnXG5cblx0XHQvLyBSZWRvXG5cdFx0YXdhaXQgdGltZWxpbmUucmVkb1RvTmV4dENoZWNrcG9pbnQoKTtcblxuXHRcdC8vIEFmdGVyIHJlZG8gdG8gJ3N0b3AxJywgd2UgY2FuIHVuZG8gYWdhaW5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuVW5kby5nZXQoKSwgdHJ1ZSk7XG5cdFx0Ly8gY2FuUmVkbyBtaWdodCBzdGlsbCBiZSB0cnVlIGlmIGN1cnJlbnRFcG9jaCBpcyBsZXNzIHRoYW4gdGhlIG1heCBlcG9jaFxuXHRcdC8vIFRoaXMgaXMgYmVjYXVzZSBjaGVja3BvaW50cyBhcmUgY3JlYXRlZCB3aXRoIGluY3JlbWVudEVwb2NoLCBzbyB0aGVyZSBhcmUgZXBvY2hzIGFmdGVyIHRoZW1cblx0fSk7XG5cblx0dGVzdCgnZmlsZSBjcmVhdGlvbiBhbmQgZGVsZXRpb24gb3BlcmF0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbmV3LnR4dCcpO1xuXG5cdFx0Ly8gQ3JlYXRlIGZpbGVcblx0XHRjb25zdCBjcmVhdGVFcG9jaCA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cblx0XHQvLyBSZWNvcmQgYmFzZWxpbmUgZm9yIHRoZSBjcmVhdGVkIGZpbGVcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICduZXcgZmlsZSBjb250ZW50Jyxcblx0XHRcdGVwb2NoOiBjcmVhdGVFcG9jaCxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZUZpbGVDcmVhdGVPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHRjcmVhdGVFcG9jaCxcblx0XHRcdCduZXcgZmlsZSBjb250ZW50J1xuXHRcdCkpO1xuXG5cdFx0Ly8gQ2hlY2twb2ludCBtYXJrcyBzdGF0ZSBhZnRlciBmaWxlIGNyZWF0aW9uXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdjcmVhdGVkJywgJ0ZpbGUgQ3JlYXRlZCcpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gaW5pdGlhbCB0byBzeW5jIGRlbGVnYXRlLCB0aGVuIHRvIGNyZWF0ZWRcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuY2hlY2twb2ludHNbMF0uY2hlY2twb2ludElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmhhcyh1cmkpLCBmYWxzZSk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBjcmVhdGVkIGNoZWNrcG9pbnRcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ2NyZWF0ZWQnKSEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICduZXcgZmlsZSBjb250ZW50Jyk7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNvbnN0IGRlbGV0ZUVwb2NoID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZUZpbGVEZWxldGVPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHRkZWxldGVFcG9jaCxcblx0XHRcdCduZXcgZmlsZSBjb250ZW50J1xuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdkZWxldGVkJywgJ0ZpbGUgRGVsZXRlZCcpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgYmFjayB0byBpbml0aWFsLCB0aGVuIHRvIGRlbGV0ZWQgdG8gcHJvcGVybHkgYXBwbHkgb3BlcmF0aW9uc1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5jaGVja3BvaW50c1swXS5jaGVja3BvaW50SWQpO1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnZGVsZXRlZCcpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5oYXModXJpKSwgZmFsc2UpO1xuXG5cdFx0Ly8gVW5kbyBkZWxldGlvbiAtIGdvZXMgYmFjayB0byAnY3JlYXRlZCcgY2hlY2twb2ludFxuXHRcdGF3YWl0IHRpbWVsaW5lLnVuZG9Ub0xhc3RDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ25ldyBmaWxlIGNvbnRlbnQnKTtcblxuXHRcdC8vIFVuZG8gY3JlYXRpb24gLSBnb2VzIGJhY2sgdG8gaW5pdGlhbCBzdGF0ZVxuXHRcdGF3YWl0IHRpbWVsaW5lLnVuZG9Ub0xhc3RDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5oYXModXJpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIHJlbmFtZSBvcGVyYXRpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG9sZFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9vbGQudHh0Jyk7XG5cdFx0Y29uc3QgbmV3VXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL25ldy50eHQnKTtcblxuXHRcdC8vIENyZWF0ZSBpbml0aWFsIGZpbGVcblx0XHRjb25zdCBjcmVhdGVFcG9jaCA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cblx0XHQvLyBSZWNvcmQgYmFzZWxpbmUgZm9yIHRoZSBjcmVhdGVkIGZpbGVcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmk6IG9sZFVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2NvbnRlbnQnLFxuXHRcdFx0ZXBvY2g6IGNyZWF0ZUVwb2NoLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbihcblx0XHRcdG9sZFVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGNyZWF0ZUVwb2NoLFxuXHRcdFx0J2NvbnRlbnQnXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ2NyZWF0ZWQnLCAnRmlsZSBDcmVhdGVkJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBpbml0aWFsLCB0aGVuIHRvIGNyZWF0ZWQgdG8gYXBwbHkgY3JlYXRlIG9wZXJhdGlvblxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5jaGVja3BvaW50c1swXS5jaGVja3BvaW50SWQpO1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnY3JlYXRlZCcpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQob2xkVXJpKSwgJ2NvbnRlbnQnKTtcblxuXHRcdC8vIFJlbmFtZSBmaWxlXG5cdFx0Y29uc3QgcmVuYW1lRXBvY2ggPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZVJlbmFtZU9wZXJhdGlvbihcblx0XHRcdG9sZFVyaSxcblx0XHRcdG5ld1VyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHJlbmFtZUVwb2NoXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3JlbmFtZWQnLCAnRmlsZSBSZW5hbWVkJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSBiYWNrIHRvIGluaXRpYWwsIHRoZW4gdG8gcmVuYW1lZCB0byBwcm9wZXJseSBhcHBseSBvcGVyYXRpb25zXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLmNoZWNrcG9pbnRzWzBdLmNoZWNrcG9pbnRJZCk7XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdyZW5hbWVkJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmhhcyhvbGRVcmkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQobmV3VXJpKSwgJ2NvbnRlbnQnKTtcblxuXHRcdC8vIFVuZG8gcmVuYW1lIC0gZ29lcyBiYWNrIHRvICdjcmVhdGVkJyBjaGVja3BvaW50XG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldChvbGRVcmkpLCAnY29udGVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuaGFzKG5ld1VyaSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgc2VxdWVudGlhbCBlZGl0cyB0byBzYW1lIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHQvLyBSZWNvcmQgYmFzZWxpbmVcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdsaW5lMVxcbmxpbmUyXFxubGluZTMnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0Jyk7XG5cblx0XHQvLyBGaXJzdCBlZGl0XG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDYpLCB0ZXh0OiAnTElORTEnIH1dXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ2VkaXQxJywgJ0VkaXQgMScpO1xuXG5cdFx0Ly8gU2Vjb25kIGVkaXRcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgNiksIHRleHQ6ICdMSU5FMicgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnZWRpdDInLCAnRWRpdCAyJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBmaXJzdCBlZGl0XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdlZGl0MScpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ0xJTkUxXFxubGluZTJcXG5saW5lMycpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gc2Vjb25kIGVkaXRcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ2VkaXQyJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnTElORTFcXG5MSU5FMlxcbmxpbmUzJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSBiYWNrIHRvIHN0YXJ0XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsIHVuZGVmaW5lZCkhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnbGluZTFcXG5saW5lMlxcbmxpbmUzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENoZWNrcG9pbnRJZEZvclJlcXVlc3QgcmV0dXJucyBjb3JyZWN0IGNoZWNrcG9pbnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0IG9mIHJlcTEnKTtcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AxJywgJ1N0b3AgMScpO1xuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTInLCB1bmRlZmluZWQsICdTdGFydCBvZiByZXEyJyk7XG5cblx0XHRjb25zdCByZXExU3RhcnQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCByZXExU3RvcCA9IHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnc3RvcDEnKTtcblx0XHRjb25zdCByZXEyU3RhcnQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXEyJywgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhyZXExU3RhcnQpO1xuXHRcdGFzc2VydC5vayhyZXExU3RvcCk7XG5cdFx0YXNzZXJ0Lm9rKHJlcTJTdGFydCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlcTFTdGFydCwgcmVxMVN0b3ApO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXExU3RhcnQsIHJlcTJTdGFydCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENoZWNrcG9pbnRJZEZvclJlcXVlc3QgcmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1leGlzdGVudCBjaGVja3BvaW50JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNoZWNrcG9pbnQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdub25leGlzdGVudCcsICdzdG9wMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja3BvaW50LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0RGlzYWJsZW1lbnQgdHJhY2tzIGRpc2FibGVkIHJlcXVlc3RzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0IHJlcTEnKTtcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZUZpbGVDcmVhdGVPcGVyYXRpb24odXJpLCAncmVxMScsIHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksICdhJykpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdTdG9wIHJlcTEnKTtcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKHVyaSwgJ3JlcTEnLCB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDIpLCB0ZXh0OiAnYicgfV0pKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTInLCB1bmRlZmluZWQsICdTdGFydCByZXEyJyk7XG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbih1cmksICdyZXEyJywgdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAyKSwgdGV4dDogJ2MnIH1dKSk7XG5cblx0XHQvLyBVbmRvIHNlcXVlbmNlOlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXSk7XG5cblx0XHRhd2FpdCB0aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCksIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxMicsIGFmdGVyVW5kb1N0b3A6IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcTInLCBhZnRlclVuZG9TdG9wOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxMScsIGFmdGVyVW5kb1N0b3A6ICdzdG9wMScgfSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnVuZG9Ub0xhc3RDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKSwgW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXEyJywgYWZ0ZXJVbmRvU3RvcDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcTEnLCBhZnRlclVuZG9TdG9wOiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblxuXHRcdC8vIFJlZG8gc2VxdWVuY2U6XG5cdFx0YXdhaXQgdGltZWxpbmUucmVkb1RvTmV4dENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcTInLCBhZnRlclVuZG9TdG9wOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxMScsIGFmdGVyVW5kb1N0b3A6ICdzdG9wMScgfSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKSwgW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXEyJywgYWZ0ZXJVbmRvU3RvcDogdW5kZWZpbmVkIH0sXG5cdFx0XSk7XG5cblx0XHRhd2FpdCB0aW1lbGluZS5yZWRvVG9OZXh0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RlbmNlIC0gc2F2ZSBhbmQgcmVzdG9yZSBzdGF0ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdC8vIFNldHVwIHNvbWUgc3RhdGVcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdpbml0aWFsJyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCB1bmRlZmluZWQsICdTdGFydCcpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDgpLCB0ZXh0OiAnbW9kaWZpZWQnIH1dXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AxJywgJ0VkaXQgQ29tcGxldGUnKTtcblxuXHRcdC8vIFNhdmUgc3RhdGVcblx0XHRjb25zdCBzYXZlZFN0YXRlID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIG5ldyB0aW1lbGluZSBhbmQgcmVzdG9yZVxuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRjb2xsZWN0aW9uLnNldChJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdE5vdGVib29rU2VydmljZSkpO1xuXHRcdGNvbnN0IGluc3RhID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpLmNyZWF0ZUNoaWxkKGNvbGxlY3Rpb24pKTtcblxuXHRcdGNvbnN0IG5ld1RpbWVsaW5lID0gaW5zdGEuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZUltcGwsXG5cdFx0XHRVUkkucGFyc2UoJ2NoYXQ6Ly90ZXN0LXNlc3Npb24tMicpLFxuXHRcdFx0ZmlsZURlbGVnYXRlXG5cdFx0KTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdG5ld1RpbWVsaW5lLnJlc3RvcmVGcm9tU3RhdGUoc2F2ZWRTdGF0ZSwgdHgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVmVyaWZ5IHN0YXRlIHdhcyByZXN0b3JlZFxuXHRcdGNvbnN0IHJlc3RvcmVkU3RhdGUgPSBuZXdUaW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkU3RhdGUuY2hlY2twb2ludHMubGVuZ3RoLCBzYXZlZFN0YXRlLmNoZWNrcG9pbnRzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkU3RhdGUub3BlcmF0aW9ucy5sZW5ndGgsIHNhdmVkU3RhdGUub3BlcmF0aW9ucy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0b3JlZFN0YXRlLmN1cnJlbnRFcG9jaCwgc2F2ZWRTdGF0ZS5jdXJyZW50RXBvY2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN0b3JlZFN0YXRlLmVwb2NoQ291bnRlciwgc2F2ZWRTdGF0ZS5lcG9jaENvdW50ZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW5nIGJldHdlZW4gbXVsdGlwbGUgcmVxdWVzdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpMSA9IFVSSS5wYXJzZSgnZmlsZTovLy9maWxlMS50eHQnKTtcblx0XHRjb25zdCB1cmkyID0gVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUyLnR4dCcpO1xuXG5cdFx0Ly8gUmVxdWVzdCAxIC0gY3JlYXRlIGZpbGVcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQgcmVxMScpO1xuXG5cdFx0Y29uc3QgY3JlYXRlMUVwb2NoID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmk6IHVyaTEsXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdmaWxlMSBtb2RpZmllZCcsXG5cdFx0XHRlcG9jaDogY3JlYXRlMUVwb2NoLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbihcblx0XHRcdHVyaTEsXG5cdFx0XHQncmVxMScsXG5cdFx0XHRjcmVhdGUxRXBvY2gsXG5cdFx0XHQnZmlsZTEgbW9kaWZpZWQnXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AxJywgJ1JlcTEgY29tcGxldGUnKTtcblxuXHRcdC8vIFJlcXVlc3QgMiAtIGNyZWF0ZSBhbm90aGVyIGZpbGVcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXEyJywgdW5kZWZpbmVkLCAnU3RhcnQgcmVxMicpO1xuXG5cdFx0Y29uc3QgY3JlYXRlMkVwb2NoID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmk6IHVyaTIsXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXEyJyxcblx0XHRcdGNvbnRlbnQ6ICdmaWxlMiBtb2RpZmllZCcsXG5cdFx0XHRlcG9jaDogY3JlYXRlMkVwb2NoLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbihcblx0XHRcdHVyaTIsXG5cdFx0XHQncmVxMicsXG5cdFx0XHRjcmVhdGUyRXBvY2gsXG5cdFx0XHQnZmlsZTIgbW9kaWZpZWQnXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXEyJywgJ3N0b3AxJywgJ1JlcTIgY29tcGxldGUnKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIGluaXRpYWwsIHRoZW4gdG8gcmVxMSBjb21wbGV0aW9uIHRvIGFwcGx5IGl0cyBvcGVyYXRpb25zXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLmNoZWNrcG9pbnRzWzBdLmNoZWNrcG9pbnRJZCk7XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdzdG9wMScpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpMSksICdmaWxlMSBtb2RpZmllZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuaGFzKHVyaTIpLCBmYWxzZSk7IC8vIHJlcTIgaGFzbid0IGhhcHBlbmVkIHlldFxuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gcmVxMiBjb21wbGV0aW9uXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMicsICdzdG9wMScpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpMSksICdmaWxlMSBtb2RpZmllZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaTIpLCAnZmlsZTIgbW9kaWZpZWQnKTtcblxuXHRcdC8vIE5hdmlnYXRlIGJhY2sgdG8gaW5pdGlhbCBzdGF0ZSBieSBnZXR0aW5nIHRoZSBmaXJzdCBjaGVja3BvaW50XG5cdFx0Y29uc3QgaW5pdGlhbENoZWNrcG9pbnQgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuY2hlY2twb2ludHNbMF07XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoaW5pdGlhbENoZWNrcG9pbnQuY2hlY2twb2ludElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmhhcyh1cmkxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuaGFzKHVyaTIpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbnRlbnRVUklBdFN0b3AgcmV0dXJucyBzbmFwc2hvdCBVUkknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXHRcdGNvbnN0IHNuYXBzaG90VXJpID0gdGltZWxpbmUuZ2V0Q29udGVudFVSSUF0U3RvcCgncmVxMScsIGZpbGVVcmksICdzdG9wMScpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNuYXBzaG90VXJpKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc25hcHNob3RVcmkudG9TdHJpbmcoKSwgZmlsZVVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQub2soc25hcHNob3RVcmkudG9TdHJpbmcoKS5pbmNsdWRlcygncmVxMScpKTtcblx0fSk7XG5cblx0dGVzdCgndW5kb2luZyBlbnRpcmUgcmVxdWVzdCB3aGVuIGFwcHJvcHJpYXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0Ly8gQ3JlYXRlIGluaXRpYWwgYmFzZWxpbmUgYW5kIGNoZWNrcG9pbnRcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdpbml0aWFsJyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCB1bmRlZmluZWQsICdTdGFydCByZXExJyk7XG5cblx0XHQvLyBTaW5nbGUgZWRpdCB3aXRoIGNoZWNrcG9pbnRcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIHRleHQ6ICdtb2RpZmllZCcgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnRWRpdCBjb21wbGV0ZScpO1xuXG5cdFx0Ly8gU2hvdWxkIGJlIGFibGUgdG8gdW5kb1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5VbmRvLmdldCgpLCB0cnVlKTtcblxuXHRcdC8vIFVuZG8gc2hvdWxkIGdvIGJhY2sgdG8gc3RhcnQgb2YgcmVxdWVzdCwgbm90IGp1c3QgcHJldmlvdXMgY2hlY2twb2ludFxuXHRcdGF3YWl0IHRpbWVsaW5lLnVuZG9Ub0xhc3RDaGVja3BvaW50KCk7XG5cblx0XHQvLyBWZXJpZnkgd2UncmUgYXQgdGhlIHN0YXJ0IG9mIHJlcTEsIHdoaWNoIGhhcyBlcG9jaCAyICgwID0gaW5pdGlhbCwgMSA9IGJhc2VsaW5lLCAyID0gc3RhcnQgY2hlY2twb2ludClcblx0XHRjb25zdCBzdGF0ZSA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY3VycmVudEVwb2NoLCAyKTsgLy8gU2hvdWxkIGJlIGF0IHRoZSBcIlN0YXJ0IHJlcTFcIiBjaGVja3BvaW50IGVwb2NoXG5cdH0pO1xuXG5cdHRlc3QoJ29wZXJhdGlvbnMgdXNlIGluY3JlbWVudGluZyBlcG9jaHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHRjb25zdCBlcG9jaDEgPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHRlcG9jaDEsXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnZWRpdDEnIH1dXG5cdFx0KSk7XG5cblx0XHRjb25zdCBlcG9jaDIgPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHRlcG9jaDIsXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDEpLCB0ZXh0OiAnZWRpdDInIH1dXG5cdFx0KSk7XG5cblx0XHQvLyBCb3RoIG9wZXJhdGlvbnMgc2hvdWxkIGJlIHJlY29yZGVkXG5cdFx0Y29uc3Qgb3BlcmF0aW9ucyA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5vcGVyYXRpb25zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVyYXRpb25zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZXJhdGlvbnNbMF0uZXBvY2gsIGVwb2NoMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZXJhdGlvbnNbMV0uZXBvY2gsIGVwb2NoMik7XG5cdH0pO1xuXG5cdHRlc3QoJ25hdmlnYXRlVG9DaGVja3BvaW50IHRocm93cyBlcnJvciBmb3IgaW52YWxpZCBjaGVja3BvaW50IElEJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBlcnJvclRocm93biA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCgnaW52YWxpZC1jaGVja3BvaW50LWlkJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGVycm9yVGhyb3duID0gdHJ1ZTtcblx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEVycm9yKTtcblx0XHRcdGFzc2VydC5vaygoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UuaW5jbHVkZXMoJ25vdCBmb3VuZCcpKTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGVycm9yVGhyb3duLCAnRXhwZWN0ZWQgZXJyb3IgdG8gYmUgdGhyb3duJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hdmlnYXRlVG9DaGVja3BvaW50IGRvZXMgbm90aGluZyB3aGVuIGFscmVhZHkgYXQgdGFyZ2V0IGVwb2NoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0Ly8gUmVjb3JkIGJhc2VsaW5lIGFuZCBvcGVyYXRpb25cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdpbml0aWFsJyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNyZWF0ZUVwb2NoID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0Y3JlYXRlRXBvY2gsXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDgpLCB0ZXh0OiAnbW9kaWZpZWQnIH1dXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AxJywgJ0NoZWNrcG9pbnQnKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIGNoZWNrcG9pbnRcblx0XHRjb25zdCBjaGVja3BvaW50SWQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ3N0b3AxJykhO1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KGNoZWNrcG9pbnRJZCk7XG5cblx0XHQvLyBOYXZpZ2F0ZSBhZ2FpbiB0byBzYW1lIGNoZWNrcG9pbnQgLSBzaG91bGQgYmUgYSBuby1vcFxuXHRcdGNvbnN0IHN0YXRlQmVmb3JlID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KGNoZWNrcG9pbnRJZCk7XG5cdFx0Y29uc3Qgc3RhdGVBZnRlciA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZUJlZm9yZS5jdXJyZW50RXBvY2gsIHN0YXRlQWZ0ZXIuY3VycmVudEVwb2NoKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkaW5nIG9wZXJhdGlvbiBhZnRlciB1bmRvIHRydW5jYXRlcyBmdXR1cmUgaGlzdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdC8vIFNldHVwIGluaXRpYWwgb3BlcmF0aW9uc1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2luaXRpYWwnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0Jyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIHRleHQ6ICdlZGl0MScgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnRWRpdCAxJyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHRleHQ6ICdlZGl0MicgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDInLCAnRWRpdCAyJyk7XG5cblx0XHRjb25zdCBzdGF0ZVdpdGhUd29FZGl0cyA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVXaXRoVHdvRWRpdHMub3BlcmF0aW9ucy5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gVW5kbyB0byBzdG9wMVxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnc3RvcDEnKSEpO1xuXG5cdFx0Ly8gUmVjb3JkIG5ldyBvcGVyYXRpb24gLSB0aGlzIHNob3VsZCB0cnVuY2F0ZSB0aGUgc2Vjb25kIGVkaXRcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHRleHQ6ICdlZGl0MycgfV1cblx0XHQpKTtcblxuXHRcdGNvbnN0IHN0YXRlQWZ0ZXJOZXdFZGl0ID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZUFmdGVyTmV3RWRpdC5vcGVyYXRpb25zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlQWZ0ZXJOZXdFZGl0Lm9wZXJhdGlvbnNbMV0udHlwZSwgRmlsZU9wZXJhdGlvblR5cGUuVGV4dEVkaXQpO1xuXHRcdC8vIFRoZSBzZWNvbmQgb3BlcmF0aW9uIHNob3VsZCBiZSB0aGUgbmV3IGVkaXQzLCBub3QgZWRpdDJcblx0fSk7XG5cblx0dGVzdCgncmVkbyBhZnRlciByZWNvcmRpbmcgbmV3IG9wZXJhdGlvbiBzaG91bGQgd29yaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2luaXRpYWwnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0Jyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIHRleHQ6ICdlZGl0MScgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnRWRpdCAxJyk7XG5cblx0XHQvLyBVbmRvXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuUmVkby5nZXQoKSwgdHJ1ZSk7XG5cblx0XHQvLyBSZWRvXG5cdFx0YXdhaXQgdGltZWxpbmUucmVkb1RvTmV4dENoZWNrcG9pbnQoKTtcblxuXHRcdC8vIEFmdGVyIHJlZG8sIGNhblJlZG8gZGVwZW5kcyBvbiB3aGV0aGVyIHdlJ3JlIGF0IHRoZSBsYXRlc3QgZXBvY2hcblx0XHQvLyBTaW5jZSB3ZSBjcmVhdGVkIGEgY2hlY2twb2ludCBhZnRlciB0aGUgb3BlcmF0aW9uLCBjdXJyZW50RXBvY2ggaXMgYWhlYWRcblx0XHQvLyBvZiB0aGUgY2hlY2twb2ludCBlcG9jaCwgc28gY2FuUmVkbyBtYXkgc3RpbGwgYmUgdHJ1ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5VbmRvLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVkbyB3aGVuIHRoZXJlIGlzIG5vIGNoZWNrcG9pbnQgYWZ0ZXIgb3BlcmF0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRjb250ZW50OiAnaW5pdGlhbCcsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQnKTtcblxuXHRcdC8vIFJlY29yZCBvcGVyYXRpb24gYnV0IGRvbid0IGNyZWF0ZSBjaGVja3BvaW50IGFmdGVyIGl0XG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDgpLCB0ZXh0OiAnZWRpdDEnIH1dXG5cdFx0KSk7XG5cblx0XHQvLyBVbmRvIHRvIHN0YXJ0XG5cdFx0Y29uc3Qgc3RhcnRDaGVja3BvaW50ID0gdGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsIHVuZGVmaW5lZCkhO1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHN0YXJ0Q2hlY2twb2ludCk7XG5cblx0XHQvLyBTaG91bGQgYmUgYWJsZSB0byByZWRvIGV2ZW4gd2l0aG91dCBhIGNoZWNrcG9pbnQgYWZ0ZXIgdGhlIG9wZXJhdGlvblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5SZWRvLmdldCgpLCB0cnVlKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdFx0Ly8gQWZ0ZXIgcmVkbywgd2Ugc2hvdWxkIGJlIGF0IHRoZSBvcGVyYXRpb24ncyBlcG9jaCArIDFcblx0XHRjb25zdCBzdGF0ZSA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhc3NlcnQub2soc3RhdGUuY3VycmVudEVwb2NoID4gMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbnRlbnRBdFN0b3AgcmV0dXJucyBlbXB0eSBmb3Igbm9uLWV4aXN0ZW50IGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL25vbmV4aXN0ZW50LnR4dCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aW1lbGluZS5nZXRDb250ZW50QXRTdG9wKCdyZXExJywgdXJpLCAnc3RvcDEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbnRlbnRBdFN0b3Agd2l0aCBlcG9jaC1iYXNlZCBzdG9wSWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdpbml0aWFsJyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGVkaXRFcG9jaCA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGVkaXRFcG9jaCxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIHRleHQ6ICdtb2RpZmllZCcgfV1cblx0XHQpKTtcblxuXHRcdC8vIFVzZSBlcG9jaC1iYXNlZCBzdG9wIElEXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRpbWVsaW5lLmdldENvbnRlbnRBdFN0b3AoJ3JlcTEnLCB1cmksIGBfX2Vwb2NoXyR7ZWRpdEVwb2NoICsgMX1gKTtcblxuXHRcdGFzc2VydC5vayhjb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ21vZGlmaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhc0ZpbGVCYXNlbGluZSBjb3JyZWN0bHkgcmVwb3J0cyBiYXNlbGluZSBleGlzdGVuY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHVyaSwgJ3JlcTEnKSwgZmFsc2UpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRjb250ZW50OiAnaW5pdGlhbCcsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHVyaSwgJ3JlcTEnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmhhc0ZpbGVCYXNlbGluZSh1cmksICdyZXEyJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzRmlsZUJhc2VsaW5lIHJldHVybnMgdHJ1ZSBmb3IgZmlsZXMgd2l0aCBjcmVhdGUgb3BlcmF0aW9ucycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3JlYXRlZC50eHQnKTtcblxuXHRcdC8vIEluaXRpYWxseSwgbm8gYmFzZWxpbmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHVyaSwgJ3JlcTEnKSwgZmFsc2UpO1xuXG5cdFx0Ly8gUmVjb3JkIGEgY3JlYXRlIG9wZXJhdGlvbiB3aXRob3V0IHJlY29yZGluZyBhbiBleHBsaWNpdCBiYXNlbGluZVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHQnY3JlYXRlZCBjb250ZW50J1xuXHRcdCkpO1xuXG5cdFx0Ly8gaGFzRmlsZUJhc2VsaW5lIHNob3VsZCBub3cgcmV0dXJuIHRydWUgYmVjYXVzZSBvZiB0aGUgY3JlYXRlIG9wZXJhdGlvblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHVyaSwgJ3JlcTInKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNGaWxlQmFzZWxpbmUgZGlzdGluZ3Vpc2hlcyBiZXR3ZWVuIGRpZmZlcmVudCByZXF1ZXN0IElEcyBmb3IgY3JlYXRlIG9wZXJhdGlvbnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL2NyZWF0ZWQudHh0Jyk7XG5cblx0XHQvLyBSZWNvcmQgYSBjcmVhdGUgb3BlcmF0aW9uIGZvciByZXExXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVGaWxlQ3JlYXRlT3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdCdjb250ZW50IGZyb20gcmVxMSdcblx0XHQpKTtcblxuXHRcdC8vIGhhc0ZpbGVCYXNlbGluZSBzaG91bGQgb25seSByZXR1cm4gdHJ1ZSBmb3IgcmVxMVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHVyaSwgJ3JlcTInKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhc0ZpbGVCYXNlbGluZSByZXR1cm5zIHRydWUgd2hlbiBib3RoIGJhc2VsaW5lIGFuZCBjcmVhdGUgb3BlcmF0aW9uIGV4aXN0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0Ly8gUmVjb3JkIGJvdGggYSBiYXNlbGluZSBhbmQgYSBjcmVhdGUgb3BlcmF0aW9uXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRjb250ZW50OiAnYmFzZWxpbmUgY29udGVudCcsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZUZpbGVDcmVhdGVPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0J2NyZWF0ZWQgY29udGVudCdcblx0XHQpKTtcblxuXHRcdC8vIFNob3VsZCByZXR1cm4gdHJ1ZSAoY2hlY2tpbmcgZWl0aGVyIHNvdXJjZSlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHVyaSwgJ3JlcTEnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhc0ZpbGVCYXNlbGluZSB3aXRoIGNyZWF0ZSBvcGVyYXRpb24gZm9sbG93ZWQgYnkgZWRpdCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3JlYXRlZC1hbmQtZWRpdGVkLnR4dCcpO1xuXG5cdFx0Ly8gUmVjb3JkIGEgY3JlYXRlIG9wZXJhdGlvblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHQnaW5pdGlhbCBjb250ZW50J1xuXHRcdCkpO1xuXG5cdFx0Ly8gaGFzRmlsZUJhc2VsaW5lIHNob3VsZCByZXR1cm4gdHJ1ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCB0cnVlKTtcblxuXHRcdC8vIFJlY29yZCBhbiBlZGl0IG9wZXJhdGlvbiBvbiB0aGUgY3JlYXRlZCBmaWxlXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDE2KSwgdGV4dDogJ2VkaXRlZCBjb250ZW50JyB9XVxuXHRcdCkpO1xuXG5cdFx0Ly8gaGFzRmlsZUJhc2VsaW5lIHNob3VsZCBzdGlsbCByZXR1cm4gdHJ1ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgdGV4dCBlZGl0cyB0byBzYW1lIGZpbGUgYXJlIHByb3Blcmx5IHJlcGxheWVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRjb250ZW50OiAnbGluZTFcXG5saW5lMlxcbmxpbmUzJyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCB1bmRlZmluZWQsICdTdGFydCcpO1xuXG5cdFx0Ly8gRmlyc3QgZWRpdCAtIHVwcGVyY2FzZSBsaW5lIDFcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHRleHQ6ICdMSU5FMScgfV1cblx0XHQpKTtcblxuXHRcdC8vIFNlY29uZCBlZGl0IC0gdXBwZXJjYXNlIGxpbmUgMlxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCA2KSwgdGV4dDogJ0xJTkUyJyB9XVxuXHRcdCkpO1xuXG5cdFx0Ly8gVGhpcmQgZWRpdCAtIHVwcGVyY2FzZSBsaW5lIDNcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMywgMSwgMywgNiksIHRleHQ6ICdMSU5FMycgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnYWxsLWVkaXRzJywgJ0FsbCBlZGl0cycpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gc2VlIGFsbCBlZGl0cyBhcHBsaWVkXG5cdFx0Y29uc3QgaW5pdGlhbENoZWNrcG9pbnQgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuY2hlY2twb2ludHNbMF07XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoaW5pdGlhbENoZWNrcG9pbnQuY2hlY2twb2ludElkKTtcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ2FsbC1lZGl0cycpISk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnTElORTFcXG5MSU5FMlxcbkxJTkUzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrcG9pbnQgd2l0aCBzYW1lIHJlcXVlc3RJZCBhbmQgdW5kb1N0b3BJZCBpcyBub3QgZHVwbGljYXRlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AxJywgJ0ZpcnN0Jyk7XG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdTZWNvbmQnKTsgLy8gU2hvdWxkIGJlIGlnbm9yZWRcblxuXHRcdGNvbnN0IGNoZWNrcG9pbnRzID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLmNoZWNrcG9pbnRzO1xuXHRcdGNvbnN0IHJlcTFTdG9wMUNoZWNrcG9pbnRzID0gY2hlY2twb2ludHMuZmlsdGVyKGMgPT4gYy5yZXF1ZXN0SWQgPT09ICdyZXExJyAmJiBjLnVuZG9TdG9wSWQgPT09ICdzdG9wMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcTFTdG9wMUNoZWNrcG9pbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcTFTdG9wMUNoZWNrcG9pbnRzWzBdLmxhYmVsLCAnRmlyc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZGluZyBiYXNlbGluZSBhZnRlciBmaWxlIHJlbmFtZSBvcGVyYXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgb2xkVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL29sZC50eHQnKTtcblx0XHRjb25zdCBuZXdVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbmV3LnR4dCcpO1xuXG5cdFx0Ly8gQ3JlYXRlIGJhc2VsaW5lIGZvciBvbGQgVVJJXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpOiBvbGRVcmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdpbml0aWFsIGNvbnRlbnQnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0Ly8gRWRpdCB0aGUgZmlsZSBiZWZvcmUgcmVuYW1lIChyZXBsYWNlIGVudGlyZSBjb250ZW50KVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHRvbGRVcmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxNiksIHRleHQ6ICdtb2RpZmllZCBjb250ZW50JyB9XVxuXHRcdCkpO1xuXG5cdFx0Ly8gUmVuYW1lIG9wZXJhdGlvblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZVJlbmFtZU9wZXJhdGlvbihcblx0XHRcdG9sZFVyaSxcblx0XHRcdG5ld1VyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKClcblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAncmVuYW1lZCcsICdBZnRlciByZW5hbWUnKTtcblxuXHRcdC8vIEdldCBjb250ZW50IGF0IHRoZSByZW5hbWVkIFVSSSAtIHNob3VsZCBmaW5kIHRoZSBiYXNlbGluZSB0aHJvdWdoIHJlbmFtZSBjaGFpblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aW1lbGluZS5nZXRDb250ZW50QXRTdG9wKCdyZXExJywgbmV3VXJpLCAncmVuYW1lZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnbW9kaWZpZWQgY29udGVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXNlbGluZSBsb29rdXAgYWNyb3NzIGRpZmZlcmVudCByZXF1ZXN0IElEcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdC8vIEZpcnN0IHJlcXVlc3QgYmFzZWxpbmVcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdyZXExIGNvbnRlbnQnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEzKSwgdGV4dDogJ3JlcTEgbW9kaWZpZWQnIH1dXG5cdFx0KSk7XG5cblx0XHQvLyBTZWNvbmQgcmVxdWVzdCBiYXNlbGluZVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTInLFxuXHRcdFx0Y29udGVudDogJ3JlcTIgY29udGVudCcsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTInLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTMpLCB0ZXh0OiAncmVxMiBtb2RpZmllZCcgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTInLCAnc3RvcDEnLCAnUmVxMiBjaGVja3BvaW50Jyk7XG5cblx0XHQvLyBHZXR0aW5nIGNvbnRlbnQgc2hvdWxkIHVzZSByZXEyIGJhc2VsaW5lXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRpbWVsaW5lLmdldENvbnRlbnRBdFN0b3AoJ3JlcTInLCB1cmksICdzdG9wMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAncmVxMiBtb2RpZmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb250ZW50QXRTdG9wIHdpdGggZmlsZSB0aGF0IGRvZXMgbm90IGV4aXN0IGluIG9wZXJhdGlvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdjb250ZW50Jyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnQ2hlY2twb2ludCcpO1xuXG5cdFx0Ly8gVHJ5IHRvIGdldCBjb250ZW50IGZvciBhIGRpZmZlcmVudCBVUkkgdGhhdCBkb2Vzbid0IGhhdmUgYW55IG9wZXJhdGlvbnNcblx0XHRjb25zdCBkaWZmZXJlbnRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vZGlmZmVyZW50LnR4dCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aW1lbGluZS5nZXRDb250ZW50QXRTdG9wKCdyZXExJywgZGlmZmVyZW50VXJpLCAnc3RvcDEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuZG9Ub0xhc3RDaGVja3BvaW50IHdoZW4gY2FuVW5kbyBpcyBmYWxzZSBkb2VzIG5vdGhpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gQXQgaW5pdGlhbCBzdGF0ZSwgY2FuVW5kbyBzaG91bGQgYmUgZmFsc2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuVW5kby5nZXQoKSwgZmFsc2UpO1xuXG5cdFx0Y29uc3Qgc3RhdGVCZWZvcmUgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRjb25zdCBzdGF0ZUFmdGVyID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXG5cdFx0Ly8gU2hvdWxkIG5vdCBoYXZlIGNoYW5nZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVCZWZvcmUuY3VycmVudEVwb2NoLCBzdGF0ZUFmdGVyLmN1cnJlbnRFcG9jaCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZG9Ub05leHRDaGVja3BvaW50IHdoZW4gY2FuUmVkbyBpcyBmYWxzZSBkb2VzIG5vdGhpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gQXQgaW5pdGlhbCBzdGF0ZSB3aXRoIG5vIGZ1dHVyZSBvcGVyYXRpb25zLCBjYW5SZWRvIHNob3VsZCBiZSBmYWxzZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5SZWRvLmdldCgpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBzdGF0ZUJlZm9yZSA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhd2FpdCB0aW1lbGluZS5yZWRvVG9OZXh0Q2hlY2twb2ludCgpO1xuXHRcdGNvbnN0IHN0YXRlQWZ0ZXIgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cblx0XHQvLyBTaG91bGQgbm90IGhhdmUgY2hhbmdlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZUJlZm9yZS5jdXJyZW50RXBvY2gsIHN0YXRlQWZ0ZXIuY3VycmVudEVwb2NoKTtcblx0fSk7XG5cblx0dGVzdCgnb3JwaGFuZWQgb3BlcmF0aW9ucyBhbmQgY2hlY2twb2ludHMgYXJlIHJlbW92ZWQgYWZ0ZXIgdW5kbyBhbmQgbmV3IGNoYW5nZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHQvLyBDcmVhdGUgdGhlIGZpbGUgZmlyc3Rcblx0XHRjb25zdCBjcmVhdGVFcG9jaCA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZUZpbGVDcmVhdGVPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHRjcmVhdGVFcG9jaCxcblx0XHRcdCdpbml0aWFsIGNvbnRlbnQnXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQgcmVxMScpO1xuXG5cdFx0Ly8gRmlyc3Qgc2V0IG9mIGNoYW5nZXNcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTYpLCB0ZXh0OiAnZmlyc3QgZWRpdCcgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnRmlyc3QgRWRpdCcpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDExKSwgdGV4dDogJ3NlY29uZCBlZGl0JyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMicsICdTZWNvbmQgRWRpdCcpO1xuXG5cdFx0Ly8gVmVyaWZ5IHdlIGhhdmUgMyBvcGVyYXRpb25zIChjcmVhdGUgKyAyIGVkaXRzKSBhbmQgNCBjaGVja3BvaW50cyAoaW5pdGlhbCwgc3RhcnQsIHN0b3AxLCBzdG9wMilcblx0XHRsZXQgc3RhdGUgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZXJhdGlvbnMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY2hlY2twb2ludHMubGVuZ3RoLCA0KTtcblxuXHRcdC8vIFVuZG8gdG8gc3RvcDEgKGJlZm9yZSBzZWNvbmQgZWRpdClcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ3N0b3AxJykhKTtcblxuXHRcdC8vIFJlY29yZCBhIG5ldyBvcGVyYXRpb24gLSB0aGlzIHNob3VsZCB0cnVuY2F0ZSB0aGUgXCJzZWNvbmQgZWRpdFwiIG9wZXJhdGlvblxuXHRcdC8vIGFuZCByZW1vdmUgdGhlIHN0b3AyIGNoZWNrcG9pbnRcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTEpLCB0ZXh0OiAncmVwbGFjZW1lbnQgZWRpdCcgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDItbmV3JywgJ1JlcGxhY2VtZW50IEVkaXQnKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgb3JwaGFuZWQgb3BlcmF0aW9uIGFuZCBjaGVja3BvaW50IGFyZSBnb25lXG5cdFx0c3RhdGUgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZXJhdGlvbnMubGVuZ3RoLCAzLCAnU2hvdWxkIHN0aWxsIGhhdmUgMyBvcGVyYXRpb25zIChjcmVhdGUgKyBmaXJzdCArIHJlcGxhY2VtZW50KScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jaGVja3BvaW50cy5sZW5ndGgsIDQsICdTaG91bGQgaGF2ZSA0IGNoZWNrcG9pbnRzIChpbml0aWFsLCBzdGFydCwgc3RvcDEsIHN0b3AyLW5ldyknKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgdGhpcmQgb3BlcmF0aW9uIGlzIHRoZSByZXBsYWNlbWVudCwgbm90IHRoZSBvcmlnaW5hbCBzZWNvbmQgZWRpdFxuXHRcdGNvbnN0IHRoaXJkT3AgPSBzdGF0ZS5vcGVyYXRpb25zWzJdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlyZE9wLnR5cGUsIEZpbGVPcGVyYXRpb25UeXBlLlRleHRFZGl0KTtcblx0XHRpZiAodGhpcmRPcC50eXBlID09PSBGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXJkT3AuZWRpdHNbMF0udGV4dCwgJ3JlcGxhY2VtZW50IGVkaXQnKTtcblx0XHR9XG5cblx0XHQvLyBWZXJpZnkgdGhlIHN0b3AyLW5ldyBjaGVja3BvaW50IGV4aXN0cywgbm90IHN0b3AyXG5cdFx0Y29uc3Qgc3RvcDJOZXdDaGVja3BvaW50ID0gdGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdzdG9wMi1uZXcnKTtcblx0XHRjb25zdCBzdG9wMk9sZENoZWNrcG9pbnQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ3N0b3AyJyk7XG5cdFx0YXNzZXJ0Lm9rKHN0b3AyTmV3Q2hlY2twb2ludCwgJ05ldyBjaGVja3BvaW50IHNob3VsZCBleGlzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9wMk9sZENoZWNrcG9pbnQsIHVuZGVmaW5lZCwgJ09sZCBvcnBoYW5lZCBjaGVja3BvaW50IHNob3VsZCBiZSByZW1vdmVkJyk7XG5cblx0XHQvLyBOb3cgbmF2aWdhdGUgdGhyb3VnaCB0aGUgZW50aXJlIHRpbWVsaW5lIHRvIHZlcmlmeSBjb25zaXN0ZW5jeVxuXHRcdGNvbnN0IGluaXRpYWxDaGVja3BvaW50ID0gc3RhdGUuY2hlY2twb2ludHNbMF07XG5cdFx0Y29uc3Qgc3RhcnRDaGVja3BvaW50ID0gdGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsIHVuZGVmaW5lZCkhO1xuXHRcdGNvbnN0IHN0b3AxQ2hlY2twb2ludCA9IHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnc3RvcDEnKSE7XG5cdFx0Y29uc3Qgc3RvcDJOZXdDaGVja3BvaW50SWQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ3N0b3AyLW5ldycpITtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIGluaXRpYWwgdG8gY2xlYXIgZXZlcnl0aGluZ1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KGluaXRpYWxDaGVja3BvaW50LmNoZWNrcG9pbnRJZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5oYXModXJpKSwgZmFsc2UpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gc3RhcnQgLSBmaWxlIHNob3VsZCBiZSBjcmVhdGVkXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoc3RhcnRDaGVja3BvaW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnaW5pdGlhbCBjb250ZW50Jyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBzdG9wMSAtIGZpcnN0IGVkaXQgc2hvdWxkIGJlIGFwcGxpZWRcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludChzdG9wMUNoZWNrcG9pbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdmaXJzdCBlZGl0Jyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBzdG9wMi1uZXcgLSByZXBsYWNlbWVudCBlZGl0IHNob3VsZCBiZSBhcHBsaWVkLCBOT1QgdGhlIG9ycGhhbmVkIFwic2Vjb25kIGVkaXRcIlxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHN0b3AyTmV3Q2hlY2twb2ludElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAncmVwbGFjZW1lbnQgZWRpdCcpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgYmFjayB0byBzdGFydFxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHN0YXJ0Q2hlY2twb2ludCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ2luaXRpYWwgY29udGVudCcpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgZm9yd2FyZCB0aHJvdWdoIGFsbCBjaGVja3BvaW50cyBhZ2FpbiB0byBlbnN1cmUgcmVkbyB3b3JrcyBjb3JyZWN0bHlcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludChzdG9wMUNoZWNrcG9pbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdmaXJzdCBlZGl0Jyk7XG5cblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludChzdG9wMk5ld0NoZWNrcG9pbnRJZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ3JlcGxhY2VtZW50IGVkaXQnLCAnT3JwaGFuZWQgZWRpdCBzaG91bGQgbmV2ZXIgcmVhcHBlYXInKTtcblxuXHRcdC8vIEdvIGJhY2sgdG8gaW5pdGlhbCBhbmQgZm9yd2FyZCBhZ2FpbiB0byB0aG9yb3VnaGx5IHRlc3Rcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludChpbml0aWFsQ2hlY2twb2ludC5jaGVja3BvaW50SWQpO1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHN0b3AyTmV3Q2hlY2twb2ludElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAncmVwbGFjZW1lbnQgZWRpdCcsICdDb250ZW50IHNob3VsZCBzdGlsbCBiZSBjb3JyZWN0IGFmdGVyIGZ1bGwgdGltZWxpbmUgdHJhdmVyc2FsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuZG8vcmVkbyB3aXRoIG11bHRpcGxlIG5vLWVkaXQgcmVxdWVzdHMgYWR2YW5jZXMgb25lIHJlcXVlc3QgYXQgYSB0aW1lJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdC8vIHJlcTE6IG5vIGVkaXRzXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0IHJlcTEnKTtcblxuXHRcdC8vIHJlcTI6IG5vIGVkaXRzXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMicsIHVuZGVmaW5lZCwgJ1N0YXJ0IHJlcTInKTtcblxuXHRcdC8vIHJlcTM6IG5vIGVkaXRzXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMycsIHVuZGVmaW5lZCwgJ1N0YXJ0IHJlcTMnKTtcblxuXHRcdC8vIHJlcTQ6IG5vIGVkaXRzXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxNCcsIHVuZGVmaW5lZCwgJ1N0YXJ0IHJlcTQnKTtcblxuXHRcdC8vIFVuZG8gc2hvdWxkIHN0ZXAgb25lIHJlcXVlc3QgYXQgYSB0aW1lXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblVuZG8uZ2V0KCksIHRydWUpO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKS5tYXAoZCA9PiBkLnJlcXVlc3RJZCksIFsncmVxNCddKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnVuZG9Ub0xhc3RDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCkubWFwKGQgPT4gZC5yZXF1ZXN0SWQpLCBbJ3JlcTQnLCAncmVxMyddKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnVuZG9Ub0xhc3RDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCkubWFwKGQgPT4gZC5yZXF1ZXN0SWQpLCBbJ3JlcTQnLCAncmVxMycsICdyZXEyJ10pO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKS5tYXAoZCA9PiBkLnJlcXVlc3RJZCksIFsncmVxNCcsICdyZXEzJywgJ3JlcTInLCAncmVxMSddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5VbmRvLmdldCgpLCBmYWxzZSk7XG5cblx0XHQvLyBSZWRvIHNob3VsZCBhbHNvIHN0ZXAgb25lIHJlcXVlc3QgYXQgYSB0aW1lIChub3Qgc2tpcCBhbGwgYXQgb25jZSlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuUmVkby5nZXQoKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCB0aW1lbGluZS5yZWRvVG9OZXh0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLm1hcChkID0+IGQucmVxdWVzdElkKSwgWydyZXE0JywgJ3JlcTMnLCAncmVxMiddKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCkubWFwKGQgPT4gZC5yZXF1ZXN0SWQpLCBbJ3JlcTQnLCAncmVxMyddKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCkubWFwKGQgPT4gZC5yZXF1ZXN0SWQpLCBbJ3JlcTQnXSk7XG5cblx0XHRhd2FpdCB0aW1lbGluZS5yZWRvVG9OZXh0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLm1hcChkID0+IGQucmVxdWVzdElkKSwgW10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblJlZG8uZ2V0KCksIGZhbHNlKTtcblx0fSk7XG59KTtcblxuLy8gTW9jayBub3RlYm9vayBzZXJ2aWNlIGZvciB0ZXN0cyB0aGF0IGRvbid0IG5lZWQgbm90ZWJvb2sgZnVuY3Rpb25hbGl0eVxuY2xhc3MgVGVzdE5vdGVib29rU2VydmljZSB7XG5cdGdldE5vdGVib29rVGV4dE1vZGVsKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGhhc1N1cHBvcnRlZE5vdGVib29rcygpIHsgcmV0dXJuIGZhbHNlOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlDQUF5RTtBQUNsRixTQUF3Qix5QkFBeUI7QUFHakQsTUFBTSxpQ0FBaUMsV0FBWTtBQUVsRCxRQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSx5QkFBc0QsY0FBYztBQUFBLElBQ3pFLFNBQVM7QUFBQSxJQUNULFNBQVM7QUFBQSxJQUNULGlCQUFpQixJQUFJLE1BQU0scUJBQXFCO0FBQUEsSUFDaEQsV0FBVztBQUFBLElBQ1gsUUFBUTtBQUFBLElBQ1IsU0FBUztBQUFBLElBQ1QsUUFBUTtBQUFBLElBQ1IsNEJBQTRCO0FBQUEsSUFDNUIsU0FBUztBQUFBLEVBQ1YsQ0FBQztBQUVELFdBQVMsd0JBQXdCLEtBQVUsV0FBbUIsT0FBZSxPQUF3RDtBQUNwSSxXQUFPLGNBQTZCO0FBQUEsTUFDbkMsTUFBTSxrQkFBa0I7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxXQUFTLDBCQUEwQixLQUFVLFdBQW1CLE9BQWUsZ0JBQXVDO0FBQ3JILFdBQU8sY0FBNkI7QUFBQSxNQUNuQyxNQUFNLGtCQUFrQjtBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxN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
