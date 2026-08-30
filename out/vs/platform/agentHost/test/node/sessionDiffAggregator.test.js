import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileEditKind } from "../../common/state/sessionState.js";
import { encodeString, TestDiffComputeService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
import { computeSessionDiffs, computeTurnDiffs, computeUnionedDiffs } from "../../node/sessionDiffAggregator.js";
import { parseSessionDbUri } from "../../common/sessionDbUri.js";
const TEST_SESSION_URI = "session://test-session";
const createTestDiffService = () => new TestDiffComputeService();
function fileDiff(path, added, removed) {
  const uri = URI.file(path).toString();
  return { after: { uri, content: { uri } }, diff: { added, removed } };
}
function getDiffUri(diff) {
  return diff.after?.uri ?? diff.before?.uri;
}
function simplify(diff) {
  return {
    uri: getDiffUri(diff),
    added: diff.diff?.added ?? 0,
    removed: diff.diff?.removed ?? 0
  };
}
function simpleDiff(path, added, removed) {
  return { uri: URI.file(path).toString(), added, removed };
}
suite("computeSessionDiffs", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns empty array for no edits", async () => {
    const db = new TestSessionDatabase();
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.deepStrictEqual(result, []);
  });
  test("computes diffs for a single edited file", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("line1\nline2"),
      afterContent: encodeString("line1\nline2\nline3")
    });
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/a.txt", 1, 0)]);
    assert.strictEqual(diffService.callCount, 1);
  });
  test("populates before/after with session-db content URIs for edits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("v1"),
      afterContent: encodeString("v2")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("v2"),
      afterContent: encodeString("v3")
    });
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, createTestDiffService());
    assert.strictEqual(result.length, 1);
    const [diff] = result;
    const fileUri = URI.file("/a.txt").toString();
    assert.strictEqual(diff.before?.uri, fileUri);
    assert.strictEqual(diff.after?.uri, fileUri);
    const beforeFields = parseSessionDbUri(diff.before.content.uri);
    assert.deepStrictEqual(beforeFields, {
      sessionUri: TEST_SESSION_URI,
      toolCallId: "tc1",
      filePath: "/a.txt",
      part: "before"
    });
    const afterFields = parseSessionDbUri(diff.after.content.uri);
    assert.deepStrictEqual(afterFields, {
      sessionUri: TEST_SESSION_URI,
      toolCallId: "tc2",
      filePath: "/a.txt",
      part: "after"
    });
  });
  test("omits before for creates and after for deletes", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/created.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("new")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/deleted.txt",
      kind: FileEditKind.Delete,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("bye")
    });
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, createTestDiffService());
    result.sort((a, b) => (getDiffUri(a) ?? "").localeCompare(getDiffUri(b) ?? ""));
    assert.strictEqual(result.length, 2);
    const [created, deleted] = result;
    assert.strictEqual(created.before, void 0, "create has no before");
    assert.ok(created.after, "create has after");
    assert.ok(deleted.before, "delete has before");
    assert.strictEqual(deleted.after, void 0, "delete has no after");
  });
  test("skips files with no net change", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("same"),
      afterContent: encodeString("different")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("different"),
      afterContent: encodeString("same")
    });
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.deepStrictEqual(result, []);
    assert.strictEqual(diffService.callCount, 0, "no diff computation needed for zero net change");
  });
  test("tracks rename chains correctly", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("hello")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/b.txt",
      kind: FileEditKind.Rename,
      originalPath: "/a.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("hello"),
      afterContent: encodeString("hello world")
    });
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(getDiffUri(result[0]), URI.file("/b.txt").toString(), "uses terminal path after rename");
  });
  test("incremental: reuses previousDiffs for untouched files", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a-before"),
      afterContent: encodeString("a-after")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/b.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("b-before"),
      afterContent: encodeString("b-after\nnew")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 42, 7)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    result.sort((a, b) => (getDiffUri(a) ?? "").localeCompare(getDiffUri(b) ?? ""));
    assert.deepStrictEqual(result.map(simplify), [
      simpleDiff("/a.txt", 42, 7),
      // carried over
      simpleDiff("/b.txt", 1, 0)
      // recomputed
    ]);
    assert.strictEqual(diffService.callCount, 1, "only touched file should be diffed");
  });
  test("incremental: recomputes file edited in current turn", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("original"),
      afterContent: encodeString("after-turn1")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("after-turn1"),
      afterContent: encodeString("after-turn2\nextra")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 100, 100)
      // stale
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/a.txt", 1, 0)]);
    assert.strictEqual(diffService.callCount, 1);
  });
  test("incremental: rename in current turn drops old URI from previousDiffs", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/old.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("content")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/new.txt",
      kind: FileEditKind.Rename,
      originalPath: "/old.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("content"),
      afterContent: encodeString("content")
    });
    const previousDiffs = [
      fileDiff("/old.txt", 5, 0)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(getDiffUri(result[0]), URI.file("/new.txt").toString(), "uses new URI after rename");
  });
  test("incremental: file with zero net change in current turn is excluded even if in previousDiffs", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("original"),
      afterContent: encodeString("modified")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("modified"),
      afterContent: encodeString("original")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 10, 5)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.deepStrictEqual(result, []);
  });
  test("incremental: previousDiffs entry for file not in current identities is dropped (slow path)", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("before"),
      afterContent: encodeString("after")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("after"),
      afterContent: encodeString("latest\nline")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 1, 0),
      fileDiff("/orphan.txt", 99, 99)
      // no longer in DB
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(getDiffUri(result[0]), URI.file("/a.txt").toString());
  });
  test("full mode recomputes all files (no incremental options)", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a"),
      afterContent: encodeString("a\nb")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/b.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("new")
    });
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(diffService.callCount, 2, "both files should be diffed in full mode");
  });
  test("incremental fast path: new files only uses getFileEditsByTurn, not getAllFileEdits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/old.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("old-before"),
      afterContent: encodeString("old-after")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/new.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("brand new")
    });
    const previousDiffs = [
      fileDiff("/old.txt", 3, 1)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(db.getFileEditsByTurnCalls, 1);
    assert.strictEqual(db.getAllFileEditsCalls, 0, "fast path should not call getAllFileEdits");
    result.sort((a, b) => (getDiffUri(a) ?? "").localeCompare(getDiffUri(b) ?? ""));
    assert.deepStrictEqual(result.map(simplify), [
      simpleDiff("/new.txt", 1, 0),
      simpleDiff("/old.txt", 3, 1)
      // carried over
    ]);
  });
  test("incremental slow path: re-edit of existing file falls back to getAllFileEdits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("original"),
      afterContent: encodeString("turn1")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("turn1"),
      afterContent: encodeString("turn2\nextra")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 5, 0)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(db.getFileEditsByTurnCalls, 1, "should try turn-scoped query first");
    assert.strictEqual(db.getAllFileEditsCalls, 1, "should fall back to getAllFileEdits");
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/a.txt", 1, 0)]);
  });
  test("incremental slow path: rename in current turn falls back to getAllFileEdits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("content")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/b.txt",
      kind: FileEditKind.Rename,
      originalPath: "/a.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("content"),
      afterContent: encodeString("content")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 1, 0)
    ];
    const diffService = createTestDiffService();
    await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(db.getAllFileEditsCalls, 1, "should fall back for renames");
  });
  test("incremental: no edits in turn returns previousDiffs unchanged", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("before"),
      afterContent: encodeString("after")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 5, 2)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(db.getAllFileEditsCalls, 0, "no computation needed");
    assert.deepStrictEqual(result, previousDiffs);
  });
  test("throws when a folderScope is combined with incremental mode (unsupported combination)", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("before"),
      afterContent: encodeString("after")
    });
    await assert.rejects(
      () => computeSessionDiffs(
        TEST_SESSION_URI,
        db,
        createTestDiffService(),
        { changedTurnId: "t1", previousDiffs: [] },
        [URI.file("/a")]
      ),
      /folderScope` is not supported in incremental mode/
    );
  });
});
suite("computeUnionedDiffs", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const PEER_CHAT_URI = "ahp-chat://peer/encoded";
  test("returns empty array when no source has edits", async () => {
    const result = await computeUnionedDiffs(
      [{ sessionUri: TEST_SESSION_URI, db: new TestSessionDatabase() }],
      createTestDiffService()
    );
    assert.deepStrictEqual(result, []);
  });
  test("unions edits from the session DB and a peer chat DB", async () => {
    const sessionDb = new TestSessionDatabase();
    sessionDb.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a1"),
      afterContent: encodeString("a1\na2")
    });
    const peerDb = new TestSessionDatabase();
    peerDb.addEdit({
      turnId: "pt1",
      toolCallId: "ptc1",
      filePath: "/b.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: void 0,
      afterContent: encodeString("b1\nb2\nb3")
    });
    const result = await computeUnionedDiffs(
      [
        { sessionUri: TEST_SESSION_URI, db: sessionDb },
        { sessionUri: PEER_CHAT_URI, db: peerDb }
      ],
      createTestDiffService()
    );
    assert.deepStrictEqual(
      result.map(simplify).sort((x, y) => (x.uri ?? "").localeCompare(y.uri ?? "")),
      [simpleDiff("/a.txt", 1, 0), simpleDiff("/b.txt", 3, 0)]
    );
    const peerDiff = result.find((d) => getDiffUri(d) === URI.file("/b.txt").toString());
    const afterFields = parseSessionDbUri(peerDiff.after.content.uri);
    assert.deepStrictEqual(afterFields, {
      sessionUri: PEER_CHAT_URI,
      toolCallId: "ptc1",
      filePath: "/b.txt",
      part: "after"
    });
  });
  test("a file edited by multiple sources takes before from the first and after from the last source", async () => {
    const sessionDb = new TestSessionDatabase();
    sessionDb.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/shared.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("v1"),
      afterContent: encodeString("v2")
    });
    const peerDb = new TestSessionDatabase();
    peerDb.addEdit({
      turnId: "pt1",
      toolCallId: "ptc1",
      filePath: "/shared.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("v2"),
      afterContent: encodeString("v3")
    });
    const result = await computeUnionedDiffs(
      [
        { sessionUri: TEST_SESSION_URI, db: sessionDb },
        { sessionUri: PEER_CHAT_URI, db: peerDb }
      ],
      createTestDiffService()
    );
    assert.strictEqual(result.length, 1);
    const [diff] = result;
    assert.deepStrictEqual(parseSessionDbUri(diff.before.content.uri), {
      sessionUri: TEST_SESSION_URI,
      toolCallId: "tc1",
      filePath: "/shared.txt",
      part: "before"
    });
    assert.deepStrictEqual(parseSessionDbUri(diff.after.content.uri), {
      sessionUri: PEER_CHAT_URI,
      toolCallId: "ptc1",
      filePath: "/shared.txt",
      part: "after"
    });
  });
});
suite("computeTurnDiffs", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("no folderScope returns all of the turn's edits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/repo/a/x.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("1"),
      afterContent: encodeString("1\n2")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/repo/b/y.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("new")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc3",
      filePath: "/repo/a/z.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a"),
      afterContent: encodeString("a\nb")
    });
    const result = await computeTurnDiffs(TEST_SESSION_URI, db, createTestDiffService(), "t1");
    assert.deepStrictEqual(
      result.map(simplify).sort((x, y) => (x.uri ?? "").localeCompare(y.uri ?? "")),
      [simpleDiff("/repo/a/x.txt", 1, 0), simpleDiff("/repo/b/y.txt", 1, 0)]
    );
  });
  test("folderScope [A] includes only edits under A (B excluded)", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/repo/a/x.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("1"),
      afterContent: encodeString("1\n2")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/repo/b/y.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("b"),
      afterContent: encodeString("b\nc")
    });
    const result = await computeTurnDiffs(
      TEST_SESSION_URI,
      db,
      createTestDiffService(),
      "t1",
      [URI.file("/repo/a")]
    );
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/repo/a/x.txt", 1, 0)]);
  });
  test("folderScope: rename and delete within scope are kept; edits/renames out of scope are excluded", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/repo/a/new.txt",
      kind: FileEditKind.Rename,
      originalPath: "/repo/a/old.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("hello"),
      afterContent: encodeString("hello\nworld")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/repo/a/gone.txt",
      kind: FileEditKind.Delete,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("bye")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc3",
      filePath: "/repo/b/keep.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("k"),
      afterContent: encodeString("k\nk2")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc4",
      filePath: "/repo/b/moved.txt",
      kind: FileEditKind.Rename,
      originalPath: "/repo/a/moving.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("m"),
      afterContent: encodeString("m\nm2")
    });
    const result = await computeTurnDiffs(
      TEST_SESSION_URI,
      db,
      createTestDiffService(),
      "t1",
      [URI.file("/repo/a")]
    );
    const uris = new Set(result.map(getDiffUri));
    assert.strictEqual(result.length, 2, "exactly the two in-scope files are reported");
    assert.ok(uris.has(URI.file("/repo/a/new.txt").toString()), "in-scope rename kept at terminal path");
    assert.ok(uris.has(URI.file("/repo/a/gone.txt").toString()), "in-scope delete kept");
    assert.ok(!uris.has(URI.file("/repo/b/keep.txt").toString()), "out-of-scope edit excluded");
    assert.ok(!uris.has(URI.file("/repo/b/moved.txt").toString()), "rename moving a file out of scope excluded");
    const rename = result.find((d) => getDiffUri(d) === URI.file("/repo/a/new.txt").toString());
    assert.ok(rename.before, "rename keeps a before snapshot");
    assert.ok(rename.after, "rename keeps an after snapshot");
    const del = result.find((d) => getDiffUri(d) === URI.file("/repo/a/gone.txt").toString());
    assert.ok(del.before, "delete has a before");
    assert.strictEqual(del.after, void 0, "delete has no after");
  });
  test("folderScope: rename chains are followed before scoping \u2014 in-scope edit then rename OUT of scope reports nothing (no stale path)", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/repo/a/x.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("1"),
      afterContent: encodeString("1\n2")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/repo/b/x.txt",
      kind: FileEditKind.Rename,
      originalPath: "/repo/a/x.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("1\n2"),
      afterContent: encodeString("1\n2\n3")
    });
    const result = await computeTurnDiffs(
      TEST_SESSION_URI,
      db,
      createTestDiffService(),
      "t1",
      [URI.file("/repo/a")]
    );
    assert.deepStrictEqual(result.map(simplify), []);
  });
  test("folderScope: rename chains are followed before scoping \u2014 edit OUT of scope then rename INTO scope keeps the full before/after chain", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/repo/b/y.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("1"),
      afterContent: encodeString("1\n2")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/repo/a/y.txt",
      kind: FileEditKind.Rename,
      originalPath: "/repo/b/y.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("1\n2"),
      afterContent: encodeString("1\n2\n3")
    });
    const result = await computeTurnDiffs(
      TEST_SESSION_URI,
      db,
      createTestDiffService(),
      "t1",
      [URI.file("/repo/a")]
    );
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/repo/a/y.txt", 2, 0)]);
  });
  test("folderScope: a file path exactly at a folder root is kept", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/repo/a/x.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a"),
      afterContent: encodeString("a\nb")
    });
    const result = await computeTurnDiffs(
      TEST_SESSION_URI,
      db,
      createTestDiffService(),
      "t1",
      [URI.file("/repo/a/x.txt")]
    );
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/repo/a/x.txt", 1, 0)]);
  });
  test("folderScope: an empty scope excludes every edit", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/repo/a/x.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a"),
      afterContent: encodeString("a\nb")
    });
    const result = await computeTurnDiffs(
      TEST_SESSION_URI,
      db,
      createTestDiffService(),
      "t1",
      []
    );
    assert.deepStrictEqual(result, []);
  });
  test("G1: Edit A \u2192 Rename A\u2192B \u2192 Create A yields two identities (moved B and new A), not one merged entry", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/repo/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a1"),
      afterContent: encodeString("a1\na2")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/repo/b.txt",
      kind: FileEditKind.Rename,
      originalPath: "/repo/a.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a1\na2"),
      afterContent: encodeString("a1\na2\na3")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc3",
      filePath: "/repo/a.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("brand new a")
    });
    const result = await computeTurnDiffs(TEST_SESSION_URI, db, createTestDiffService(), "t1");
    const uris = new Set(result.map(getDiffUri));
    assert.strictEqual(result.length, 2, "the moved file (B) and the recreated file (A) are distinct identities");
    assert.ok(uris.has(URI.file("/repo/b.txt").toString()), "the renamed file appears at its destination path B");
    assert.ok(uris.has(URI.file("/repo/a.txt").toString()), "the recreated file A is a fresh identity");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzZXNzaW9uRGlmZkFnZ3JlZ2F0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0S2luZCwgdHlwZSBJU2Vzc2lvbkZpbGVEaWZmIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBlbmNvZGVTdHJpbmcsIFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UsIFRlc3RTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IGNvbXB1dGVTZXNzaW9uRGlmZnMsIGNvbXB1dGVUdXJuRGlmZnMsIGNvbXB1dGVVbmlvbmVkRGlmZnMgfSBmcm9tICcuLi8uLi9ub2RlL3Nlc3Npb25EaWZmQWdncmVnYXRvci5qcyc7XG5pbXBvcnQgeyBwYXJzZVNlc3Npb25EYlVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGJVcmkuanMnO1xuXG5jb25zdCBURVNUX1NFU1NJT05fVVJJID0gJ3Nlc3Npb246Ly90ZXN0LXNlc3Npb24nO1xuXG5jb25zdCBjcmVhdGVUZXN0RGlmZlNlcnZpY2UgPSAoKSA9PiBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpO1xuXG5mdW5jdGlvbiBmaWxlRGlmZihwYXRoOiBzdHJpbmcsIGFkZGVkOiBudW1iZXIsIHJlbW92ZWQ6IG51bWJlcik6IElTZXNzaW9uRmlsZURpZmYge1xuXHRjb25zdCB1cmkgPSBVUkkuZmlsZShwYXRoKS50b1N0cmluZygpO1xuXHRyZXR1cm4geyBhZnRlcjogeyB1cmksIGNvbnRlbnQ6IHsgdXJpIH0gfSwgZGlmZjogeyBhZGRlZCwgcmVtb3ZlZCB9IH07XG59XG5cbmZ1bmN0aW9uIGdldERpZmZVcmkoZGlmZjogSVNlc3Npb25GaWxlRGlmZik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBkaWZmLmFmdGVyPy51cmkgPz8gZGlmZi5iZWZvcmU/LnVyaTtcbn1cblxuaW50ZXJmYWNlIElTaW1wbGVEaWZmIHtcblx0dXJpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGFkZGVkOiBudW1iZXI7XG5cdHJlbW92ZWQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gc2ltcGxpZnkoZGlmZjogSVNlc3Npb25GaWxlRGlmZik6IElTaW1wbGVEaWZmIHtcblx0cmV0dXJuIHtcblx0XHR1cmk6IGdldERpZmZVcmkoZGlmZiksXG5cdFx0YWRkZWQ6IGRpZmYuZGlmZj8uYWRkZWQgPz8gMCxcblx0XHRyZW1vdmVkOiBkaWZmLmRpZmY/LnJlbW92ZWQgPz8gMCxcblx0fTtcbn1cblxuZnVuY3Rpb24gc2ltcGxlRGlmZihwYXRoOiBzdHJpbmcsIGFkZGVkOiBudW1iZXIsIHJlbW92ZWQ6IG51bWJlcik6IElTaW1wbGVEaWZmIHtcblx0cmV0dXJuIHsgdXJpOiBVUkkuZmlsZShwYXRoKS50b1N0cmluZygpLCBhZGRlZCwgcmVtb3ZlZCB9O1xufVxuXG5zdWl0ZSgnY29tcHV0ZVNlc3Npb25EaWZmcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIEZ1bGwtbW9kZSB0ZXN0cyAobm8gaW5jcmVtZW50YWwgb3B0aW9ucykgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBhcnJheSBmb3Igbm8gZWRpdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhURVNUX1NFU1NJT05fVVJJLCBkYiwgZGlmZlNlcnZpY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXB1dGVzIGRpZmZzIGZvciBhIHNpbmdsZSBlZGl0ZWQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnbGluZTFcXG5saW5lMicpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnbGluZTFcXG5saW5lMlxcbmxpbmUzJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoVEVTVF9TRVNTSU9OX1VSSSwgZGIsIGRpZmZTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChzaW1wbGlmeSksIFtzaW1wbGVEaWZmKCcvYS50eHQnLCAxLCAwKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmU2VydmljZS5jYWxsQ291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3B1bGF0ZXMgYmVmb3JlL2FmdGVyIHdpdGggc2Vzc2lvbi1kYiBjb250ZW50IFVSSXMgZm9yIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCd2MScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygndjInKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QyJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCd2MicpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygndjMnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoVEVTVF9TRVNTSU9OX1VSSSwgZGIsIGNyZWF0ZVRlc3REaWZmU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZGlmZl0gPSByZXN1bHQ7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvYS50eHQnKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmLmJlZm9yZT8udXJpLCBmaWxlVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5hZnRlcj8udXJpLCBmaWxlVXJpKTtcblxuXHRcdC8vIGJlZm9yZSBjb250ZW50IHBvaW50cyB0byB0aGUgRklSU1Qgc25hcHNob3QgKHRjMSlcblx0XHRjb25zdCBiZWZvcmVGaWVsZHMgPSBwYXJzZVNlc3Npb25EYlVyaShkaWZmLmJlZm9yZSEuY29udGVudC51cmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmVmb3JlRmllbGRzLCB7XG5cdFx0XHRzZXNzaW9uVXJpOiBURVNUX1NFU1NJT05fVVJJLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjMScsXG5cdFx0XHRmaWxlUGF0aDogJy9hLnR4dCcsXG5cdFx0XHRwYXJ0OiAnYmVmb3JlJyxcblx0XHR9KTtcblxuXHRcdC8vIGFmdGVyIGNvbnRlbnQgcG9pbnRzIHRvIHRoZSBMQVNUIHNuYXBzaG90ICh0YzIpXG5cdFx0Y29uc3QgYWZ0ZXJGaWVsZHMgPSBwYXJzZVNlc3Npb25EYlVyaShkaWZmLmFmdGVyIS5jb250ZW50LnVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZnRlckZpZWxkcywge1xuXHRcdFx0c2Vzc2lvblVyaTogVEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0YzInLFxuXHRcdFx0ZmlsZVBhdGg6ICcvYS50eHQnLFxuXHRcdFx0cGFydDogJ2FmdGVyJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb21pdHMgYmVmb3JlIGZvciBjcmVhdGVzIGFuZCBhZnRlciBmb3IgZGVsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9jcmVhdGVkLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5DcmVhdGUsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ25ldycpLFxuXHRcdH0pO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMyJywgZmlsZVBhdGg6ICcvZGVsZXRlZC50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRGVsZXRlLFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYnllJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFRFU1RfU0VTU0lPTl9VUkksIGRiLCBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKSk7XG5cdFx0cmVzdWx0LnNvcnQoKGEsIGIpID0+IChnZXREaWZmVXJpKGEpID8/ICcnKS5sb2NhbGVDb21wYXJlKGdldERpZmZVcmkoYikgPz8gJycpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRjb25zdCBbY3JlYXRlZCwgZGVsZXRlZF0gPSByZXN1bHQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQuYmVmb3JlLCB1bmRlZmluZWQsICdjcmVhdGUgaGFzIG5vIGJlZm9yZScpO1xuXHRcdGFzc2VydC5vayhjcmVhdGVkLmFmdGVyLCAnY3JlYXRlIGhhcyBhZnRlcicpO1xuXHRcdGFzc2VydC5vayhkZWxldGVkLmJlZm9yZSwgJ2RlbGV0ZSBoYXMgYmVmb3JlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZWQuYWZ0ZXIsIHVuZGVmaW5lZCwgJ2RlbGV0ZSBoYXMgbm8gYWZ0ZXInKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgZmlsZXMgd2l0aCBubyBuZXQgY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdzYW1lJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdkaWZmZXJlbnQnKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QyJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdkaWZmZXJlbnQnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ3NhbWUnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhURVNUX1NFU1NJT05fVVJJLCBkYiwgZGlmZlNlcnZpY2UpO1xuXG5cdFx0Ly8gQmVmb3JlID0gdGMxLmJlZm9yZSA9ICdzYW1lJywgQWZ0ZXIgPSB0YzIuYWZ0ZXIgPSAnc2FtZScgXHUyMTkyIHplcm8gbmV0IGNoYW5nZVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZTZXJ2aWNlLmNhbGxDb3VudCwgMCwgJ25vIGRpZmYgY29tcHV0YXRpb24gbmVlZGVkIGZvciB6ZXJvIG5ldCBjaGFuZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIHJlbmFtZSBjaGFpbnMgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkNyZWF0ZSxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnaGVsbG8nKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QyJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL2IudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLlJlbmFtZSwgb3JpZ2luYWxQYXRoOiAnL2EudHh0Jyxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2hlbGxvJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdoZWxsbyB3b3JsZCcpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFRFU1RfU0VTU0lPTl9VUkksIGRiLCBkaWZmU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldERpZmZVcmkocmVzdWx0WzBdKSwgVVJJLmZpbGUoJy9iLnR4dCcpLnRvU3RyaW5nKCksICd1c2VzIHRlcm1pbmFsIHBhdGggYWZ0ZXIgcmVuYW1lJyk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gSW5jcmVtZW50YWwtbW9kZSB0ZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdpbmNyZW1lbnRhbDogcmV1c2VzIHByZXZpb3VzRGlmZnMgZm9yIHVudG91Y2hlZCBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0Ly8gRmlsZSBBIGVkaXRlZCBpbiB0dXJuIDEgb25seVxuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2EtYmVmb3JlJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdhLWFmdGVyJyksXG5cdFx0fSk7XG5cdFx0Ly8gRmlsZSBCIGVkaXRlZCBpbiB0dXJuIDJcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QyJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL2IudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdiLWJlZm9yZScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYi1hZnRlclxcbm5ldycpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNEaWZmczogSVNlc3Npb25GaWxlRGlmZltdID0gW1xuXHRcdFx0ZmlsZURpZmYoJy9hLnR4dCcsIDQyLCA3KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFxuXHRcdFx0VEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdGRiLFxuXHRcdFx0ZGlmZlNlcnZpY2UsXG5cdFx0XHR7IGNoYW5nZWRUdXJuSWQ6ICd0MicsIHByZXZpb3VzRGlmZnMgfSxcblx0XHQpO1xuXG5cdFx0Ly8gU29ydCB0byBlbnN1cmUgc3RhYmxlIGNvbXBhcmlzb25cblx0XHRyZXN1bHQuc29ydCgoYSwgYikgPT4gKGdldERpZmZVcmkoYSkgPz8gJycpLmxvY2FsZUNvbXBhcmUoZ2V0RGlmZlVyaShiKSA/PyAnJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKHNpbXBsaWZ5KSwgW1xuXHRcdFx0c2ltcGxlRGlmZignL2EudHh0JywgNDIsIDcpLCAvLyBjYXJyaWVkIG92ZXJcblx0XHRcdHNpbXBsZURpZmYoJy9iLnR4dCcsIDEsIDApLCAgLy8gcmVjb21wdXRlZFxuXHRcdF0pO1xuXHRcdC8vIE9ubHkgZmlsZSBCIHNob3VsZCBoYXZlIHRyaWdnZXJlZCBhIGRpZmYgY29tcHV0YXRpb25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlNlcnZpY2UuY2FsbENvdW50LCAxLCAnb25seSB0b3VjaGVkIGZpbGUgc2hvdWxkIGJlIGRpZmZlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNyZW1lbnRhbDogcmVjb21wdXRlcyBmaWxlIGVkaXRlZCBpbiBjdXJyZW50IHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIEZpbGUgQSBlZGl0ZWQgaW4gdHVybiAxIGFuZCB0dXJuIDJcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdvcmlnaW5hbCcpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYWZ0ZXItdHVybjEnKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QyJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdhZnRlci10dXJuMScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYWZ0ZXItdHVybjJcXG5leHRyYScpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNEaWZmczogSVNlc3Npb25GaWxlRGlmZltdID0gW1xuXHRcdFx0ZmlsZURpZmYoJy9hLnR4dCcsIDEwMCwgMTAwKSwgLy8gc3RhbGVcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFxuXHRcdFx0VEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdGRiLFxuXHRcdFx0ZGlmZlNlcnZpY2UsXG5cdFx0XHR7IGNoYW5nZWRUdXJuSWQ6ICd0MicsIHByZXZpb3VzRGlmZnMgfSxcblx0XHQpO1xuXG5cdFx0Ly8gU2hvdWxkIGNvbXBhcmUgdGMxLmJlZm9yZT0nb3JpZ2luYWwnIHZzIHRjMi5hZnRlcj0nYWZ0ZXItdHVybjJcXG5leHRyYSdcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoc2ltcGxpZnkpLCBbc2ltcGxlRGlmZignL2EudHh0JywgMSwgMCldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlNlcnZpY2UuY2FsbENvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jcmVtZW50YWw6IHJlbmFtZSBpbiBjdXJyZW50IHR1cm4gZHJvcHMgb2xkIFVSSSBmcm9tIHByZXZpb3VzRGlmZnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIEZpbGUgY3JlYXRlZCBpbiB0dXJuIDFcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL29sZC50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuQ3JlYXRlLFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdjb250ZW50JyksXG5cdFx0fSk7XG5cdFx0Ly8gUmVuYW1lZCBpbiB0dXJuIDJcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QyJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL25ldy50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuUmVuYW1lLFxuXHRcdFx0b3JpZ2luYWxQYXRoOiAnL29sZC50eHQnLFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnY29udGVudCcpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnY29udGVudCcpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNEaWZmczogSVNlc3Npb25GaWxlRGlmZltdID0gW1xuXHRcdFx0ZmlsZURpZmYoJy9vbGQudHh0JywgNSwgMCksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhcblx0XHRcdFRFU1RfU0VTU0lPTl9VUkksXG5cdFx0XHRkYixcblx0XHRcdGRpZmZTZXJ2aWNlLFxuXHRcdFx0eyBjaGFuZ2VkVHVybklkOiAndDInLCBwcmV2aW91c0RpZmZzIH0sXG5cdFx0KTtcblxuXHRcdC8vIENyZWF0ZSBcdTIxOTIgUmVuYW1lIHdpdGggc2FtZSBjb250ZW50OiBiZWZvcmU9JycgKGNyZWF0ZSksIGFmdGVyPSdjb250ZW50JyAocmVuYW1lKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0RGlmZlVyaShyZXN1bHRbMF0pLCBVUkkuZmlsZSgnL25ldy50eHQnKS50b1N0cmluZygpLCAndXNlcyBuZXcgVVJJIGFmdGVyIHJlbmFtZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNyZW1lbnRhbDogZmlsZSB3aXRoIHplcm8gbmV0IGNoYW5nZSBpbiBjdXJyZW50IHR1cm4gaXMgZXhjbHVkZWQgZXZlbiBpZiBpbiBwcmV2aW91c0RpZmZzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdvcmlnaW5hbCcpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnbW9kaWZpZWQnKSxcblx0XHR9KTtcblx0XHQvLyBUdXJuIDIgcmV2ZXJ0cyB0aGUgY2hhbmdlXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnbW9kaWZpZWQnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ29yaWdpbmFsJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcmV2aW91c0RpZmZzOiBJU2Vzc2lvbkZpbGVEaWZmW10gPSBbXG5cdFx0XHRmaWxlRGlmZignL2EudHh0JywgMTAsIDUpLFxuXHRcdF07XG5cblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLFxuXHRcdFx0ZGIsXG5cdFx0XHRkaWZmU2VydmljZSxcblx0XHRcdHsgY2hhbmdlZFR1cm5JZDogJ3QyJywgcHJldmlvdXNEaWZmcyB9LFxuXHRcdCk7XG5cblx0XHQvLyBOZXQgY2hhbmdlIGlzIHplcm8gKHJldmVydGVkKSwgc28gZmlsZSBzaG91bGQgYmUgZXhjbHVkZWRcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNyZW1lbnRhbDogcHJldmlvdXNEaWZmcyBlbnRyeSBmb3IgZmlsZSBub3QgaW4gY3VycmVudCBpZGVudGl0aWVzIGlzIGRyb3BwZWQgKHNsb3cgcGF0aCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIEZpbGUgQSB3YXMgZWRpdGVkIGluIHR1cm4gMSBhbmQgaXMgaW4gcHJldmlvdXNEaWZmc1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2JlZm9yZScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYWZ0ZXInKSxcblx0XHR9KTtcblx0XHQvLyBGaWxlIEEgaXMgZWRpdGVkIGFnYWluIGluIHR1cm4gMiBcdTIxOTIgdHJpZ2dlcnMgc2xvdyBwYXRoIChyZS1lZGl0IG9mIGV4aXN0aW5nIGZpbGUpXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYWZ0ZXInKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2xhdGVzdFxcbmxpbmUnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHByZXZpb3VzRGlmZnM6IElTZXNzaW9uRmlsZURpZmZbXSA9IFtcblx0XHRcdGZpbGVEaWZmKCcvYS50eHQnLCAxLCAwKSxcblx0XHRcdGZpbGVEaWZmKCcvb3JwaGFuLnR4dCcsIDk5LCA5OSksIC8vIG5vIGxvbmdlciBpbiBEQlxuXHRcdF07XG5cblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLFxuXHRcdFx0ZGIsXG5cdFx0XHRkaWZmU2VydmljZSxcblx0XHRcdHsgY2hhbmdlZFR1cm5JZDogJ3QyJywgcHJldmlvdXNEaWZmcyB9LFxuXHRcdCk7XG5cblx0XHQvLyBTbG93IHBhdGg6IG9ycGhhbiBpcyBkcm9wcGVkIGJlY2F1c2UgaXQgaGFzIG5vIGlkZW50aXR5IGluIHRoZSBmdWxsIGdyYXBoXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXREaWZmVXJpKHJlc3VsdFswXSksIFVSSS5maWxlKCcvYS50eHQnKS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnZnVsbCBtb2RlIHJlY29tcHV0ZXMgYWxsIGZpbGVzIChubyBpbmNyZW1lbnRhbCBvcHRpb25zKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYVxcbmInKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL2IudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkNyZWF0ZSxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnbmV3JyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoVEVTVF9TRVNTSU9OX1VSSSwgZGIsIGRpZmZTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlNlcnZpY2UuY2FsbENvdW50LCAyLCAnYm90aCBmaWxlcyBzaG91bGQgYmUgZGlmZmVkIGluIGZ1bGwgbW9kZScpO1xuXHR9KTtcblxuXHQvLyAtLS0tIEZhc3QtcGF0aCB0ZXN0cyAodHVybi1zY29wZWQgcXVlcnkgb3B0aW1pemF0aW9uKSAtLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnaW5jcmVtZW50YWwgZmFzdCBwYXRoOiBuZXcgZmlsZXMgb25seSB1c2VzIGdldEZpbGVFZGl0c0J5VHVybiwgbm90IGdldEFsbEZpbGVFZGl0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0Ly8gVHVybiAxOiBleGlzdGluZyBmaWxlIHVudG91Y2hlZCBpbiB0dXJuIDJcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL29sZC50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ29sZC1iZWZvcmUnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ29sZC1hZnRlcicpLFxuXHRcdH0pO1xuXHRcdC8vIFR1cm4gMjogY3JlYXRlcyBhIG5ldyBmaWxlXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9uZXcudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkNyZWF0ZSxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYnJhbmQgbmV3JyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcmV2aW91c0RpZmZzOiBJU2Vzc2lvbkZpbGVEaWZmW10gPSBbXG5cdFx0XHRmaWxlRGlmZignL29sZC50eHQnLCAzLCAxKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFxuXHRcdFx0VEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdGRiLFxuXHRcdFx0ZGlmZlNlcnZpY2UsXG5cdFx0XHR7IGNoYW5nZWRUdXJuSWQ6ICd0MicsIHByZXZpb3VzRGlmZnMgfSxcblx0XHQpO1xuXG5cdFx0Ly8gRmFzdCBwYXRoOiBvbmx5IGdldEZpbGVFZGl0c0J5VHVybiBjYWxsZWQsIG5vdCBnZXRBbGxGaWxlRWRpdHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGIuZ2V0RmlsZUVkaXRzQnlUdXJuQ2FsbHMsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYi5nZXRBbGxGaWxlRWRpdHNDYWxscywgMCwgJ2Zhc3QgcGF0aCBzaG91bGQgbm90IGNhbGwgZ2V0QWxsRmlsZUVkaXRzJyk7XG5cblx0XHRyZXN1bHQuc29ydCgoYSwgYikgPT4gKGdldERpZmZVcmkoYSkgPz8gJycpLmxvY2FsZUNvbXBhcmUoZ2V0RGlmZlVyaShiKSA/PyAnJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChzaW1wbGlmeSksIFtcblx0XHRcdHNpbXBsZURpZmYoJy9uZXcudHh0JywgMSwgMCksXG5cdFx0XHRzaW1wbGVEaWZmKCcvb2xkLnR4dCcsIDMsIDEpLCAvLyBjYXJyaWVkIG92ZXJcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jcmVtZW50YWwgc2xvdyBwYXRoOiByZS1lZGl0IG9mIGV4aXN0aW5nIGZpbGUgZmFsbHMgYmFjayB0byBnZXRBbGxGaWxlRWRpdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIFR1cm4gMTogZWRpdCBmaWxlIEFcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdvcmlnaW5hbCcpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygndHVybjEnKSxcblx0XHR9KTtcblx0XHQvLyBUdXJuIDI6IGVkaXQgZmlsZSBBIGFnYWluXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygndHVybjEnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ3R1cm4yXFxuZXh0cmEnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHByZXZpb3VzRGlmZnM6IElTZXNzaW9uRmlsZURpZmZbXSA9IFtcblx0XHRcdGZpbGVEaWZmKCcvYS50eHQnLCA1LCAwKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFxuXHRcdFx0VEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdGRiLFxuXHRcdFx0ZGlmZlNlcnZpY2UsXG5cdFx0XHR7IGNoYW5nZWRUdXJuSWQ6ICd0MicsIHByZXZpb3VzRGlmZnMgfSxcblx0XHQpO1xuXG5cdFx0Ly8gU2xvdyBwYXRoOiBmYWxscyBiYWNrIHRvIGdldEFsbEZpbGVFZGl0cyBiZWNhdXNlIC9hLnR4dCBpcyBpbiBwcmV2aW91c0RpZmZzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRiLmdldEZpbGVFZGl0c0J5VHVybkNhbGxzLCAxLCAnc2hvdWxkIHRyeSB0dXJuLXNjb3BlZCBxdWVyeSBmaXJzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYi5nZXRBbGxGaWxlRWRpdHNDYWxscywgMSwgJ3Nob3VsZCBmYWxsIGJhY2sgdG8gZ2V0QWxsRmlsZUVkaXRzJyk7XG5cblx0XHQvLyBDdW11bGF0aXZlIGRpZmY6IG9yaWdpbmFsIFx1MjE5MiB0dXJuMlxcbmV4dHJhXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKHNpbXBsaWZ5KSwgW3NpbXBsZURpZmYoJy9hLnR4dCcsIDEsIDApXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY3JlbWVudGFsIHNsb3cgcGF0aDogcmVuYW1lIGluIGN1cnJlbnQgdHVybiBmYWxscyBiYWNrIHRvIGdldEFsbEZpbGVFZGl0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5DcmVhdGUsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2NvbnRlbnQnKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QyJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL2IudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLlJlbmFtZSxcblx0XHRcdG9yaWdpbmFsUGF0aDogJy9hLnR4dCcsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdjb250ZW50JyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdjb250ZW50JyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcmV2aW91c0RpZmZzOiBJU2Vzc2lvbkZpbGVEaWZmW10gPSBbXG5cdFx0XHRmaWxlRGlmZignL2EudHh0JywgMSwgMCksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhcblx0XHRcdFRFU1RfU0VTU0lPTl9VUkksXG5cdFx0XHRkYixcblx0XHRcdGRpZmZTZXJ2aWNlLFxuXHRcdFx0eyBjaGFuZ2VkVHVybklkOiAndDInLCBwcmV2aW91c0RpZmZzIH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYi5nZXRBbGxGaWxlRWRpdHNDYWxscywgMSwgJ3Nob3VsZCBmYWxsIGJhY2sgZm9yIHJlbmFtZXMnKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jcmVtZW50YWw6IG5vIGVkaXRzIGluIHR1cm4gcmV0dXJucyBwcmV2aW91c0RpZmZzIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYmVmb3JlJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdhZnRlcicpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNEaWZmczogSVNlc3Npb25GaWxlRGlmZltdID0gW1xuXHRcdFx0ZmlsZURpZmYoJy9hLnR4dCcsIDUsIDIpLFxuXHRcdF07XG5cblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLFxuXHRcdFx0ZGIsXG5cdFx0XHRkaWZmU2VydmljZSxcblx0XHRcdHsgY2hhbmdlZFR1cm5JZDogJ3QyJywgcHJldmlvdXNEaWZmcyB9LFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGIuZ2V0QWxsRmlsZUVkaXRzQ2FsbHMsIDAsICdubyBjb21wdXRhdGlvbiBuZWVkZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgcHJldmlvdXNEaWZmcyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rocm93cyB3aGVuIGEgZm9sZGVyU2NvcGUgaXMgY29tYmluZWQgd2l0aCBpbmNyZW1lbnRhbCBtb2RlICh1bnN1cHBvcnRlZCBjb21iaW5hdGlvbiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2JlZm9yZScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYWZ0ZXInKSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gY29tcHV0ZVNlc3Npb25EaWZmcyhcblx0XHRcdFx0VEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdFx0ZGIsXG5cdFx0XHRcdGNyZWF0ZVRlc3REaWZmU2VydmljZSgpLFxuXHRcdFx0XHR7IGNoYW5nZWRUdXJuSWQ6ICd0MScsIHByZXZpb3VzRGlmZnM6IFtdIH0sXG5cdFx0XHRcdFtVUkkuZmlsZSgnL2EnKV0sXG5cdFx0XHQpLFxuXHRcdFx0L2ZvbGRlclNjb3BlYCBpcyBub3Qgc3VwcG9ydGVkIGluIGluY3JlbWVudGFsIG1vZGUvLFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjb21wdXRlVW5pb25lZERpZmZzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IFBFRVJfQ0hBVF9VUkkgPSAnYWhwLWNoYXQ6Ly9wZWVyL2VuY29kZWQnO1xuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgd2hlbiBubyBzb3VyY2UgaGFzIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVVbmlvbmVkRGlmZnMoXG5cdFx0XHRbeyBzZXNzaW9uVXJpOiBURVNUX1NFU1NJT05fVVJJLCBkYjogbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKSB9XSxcblx0XHRcdGNyZWF0ZVRlc3REaWZmU2VydmljZSgpLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndW5pb25zIGVkaXRzIGZyb20gdGhlIHNlc3Npb24gREIgYW5kIGEgcGVlciBjaGF0IERCJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0c2Vzc2lvbkRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2ExJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdhMVxcbmEyJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwZWVyRGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdHBlZXJEYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3B0MScsIHRvb2xDYWxsSWQ6ICdwdGMxJywgZmlsZVBhdGg6ICcvYi50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuQ3JlYXRlLFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IHVuZGVmaW5lZCwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2IxXFxuYjJcXG5iMycpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVVuaW9uZWREaWZmcyhcblx0XHRcdFtcblx0XHRcdFx0eyBzZXNzaW9uVXJpOiBURVNUX1NFU1NJT05fVVJJLCBkYjogc2Vzc2lvbkRiIH0sXG5cdFx0XHRcdHsgc2Vzc2lvblVyaTogUEVFUl9DSEFUX1VSSSwgZGI6IHBlZXJEYiB9LFxuXHRcdFx0XSxcblx0XHRcdGNyZWF0ZVRlc3REaWZmU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVzdWx0Lm1hcChzaW1wbGlmeSkuc29ydCgoeCwgeSkgPT4gKHgudXJpID8/ICcnKS5sb2NhbGVDb21wYXJlKHkudXJpID8/ICcnKSksXG5cdFx0XHRbc2ltcGxlRGlmZignL2EudHh0JywgMSwgMCksIHNpbXBsZURpZmYoJy9iLnR4dCcsIDMsIDApXSxcblx0XHQpO1xuXG5cdFx0Ly8gVGhlIHBlZXIgZmlsZSdzIGNvbnRlbnQgVVJJIG11c3QgZW5jb2RlIHRoZSBwZWVyIGNoYXQgVVJJIHNvIHRoZVxuXHRcdC8vIHJlc291cmNlIHJlc29sdmVyIG9wZW5zIHRoZSBwZWVyIERCLCBub3QgdGhlIHNlc3Npb24gREIuXG5cdFx0Y29uc3QgcGVlckRpZmYgPSByZXN1bHQuZmluZChkID0+IGdldERpZmZVcmkoZCkgPT09IFVSSS5maWxlKCcvYi50eHQnKS50b1N0cmluZygpKSE7XG5cdFx0Y29uc3QgYWZ0ZXJGaWVsZHMgPSBwYXJzZVNlc3Npb25EYlVyaShwZWVyRGlmZi5hZnRlciEuY29udGVudC51cmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWZ0ZXJGaWVsZHMsIHtcblx0XHRcdHNlc3Npb25Vcmk6IFBFRVJfQ0hBVF9VUkksXG5cdFx0XHR0b29sQ2FsbElkOiAncHRjMScsXG5cdFx0XHRmaWxlUGF0aDogJy9iLnR4dCcsXG5cdFx0XHRwYXJ0OiAnYWZ0ZXInLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGZpbGUgZWRpdGVkIGJ5IG11bHRpcGxlIHNvdXJjZXMgdGFrZXMgYmVmb3JlIGZyb20gdGhlIGZpcnN0IGFuZCBhZnRlciBmcm9tIHRoZSBsYXN0IHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uRGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdHNlc3Npb25EYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL3NoYXJlZC50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ3YxJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCd2MicpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGVlckRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRwZWVyRGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICdwdDEnLCB0b29sQ2FsbElkOiAncHRjMScsIGZpbGVQYXRoOiAnL3NoYXJlZC50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ3YyJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCd2MycpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVVuaW9uZWREaWZmcyhcblx0XHRcdFtcblx0XHRcdFx0eyBzZXNzaW9uVXJpOiBURVNUX1NFU1NJT05fVVJJLCBkYjogc2Vzc2lvbkRiIH0sXG5cdFx0XHRcdHsgc2Vzc2lvblVyaTogUEVFUl9DSEFUX1VSSSwgZGI6IHBlZXJEYiB9LFxuXHRcdFx0XSxcblx0XHRcdGNyZWF0ZVRlc3REaWZmU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2RpZmZdID0gcmVzdWx0O1xuXG5cdFx0Ly8gYmVmb3JlIHNuYXBzaG90IGZyb20gdGhlIHNlc3Npb24gREIgKGZpcnN0IHNvdXJjZSlcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU2Vzc2lvbkRiVXJpKGRpZmYuYmVmb3JlIS5jb250ZW50LnVyaSksIHtcblx0XHRcdHNlc3Npb25Vcmk6IFRFU1RfU0VTU0lPTl9VUkksXG5cdFx0XHR0b29sQ2FsbElkOiAndGMxJyxcblx0XHRcdGZpbGVQYXRoOiAnL3NoYXJlZC50eHQnLFxuXHRcdFx0cGFydDogJ2JlZm9yZScsXG5cdFx0fSk7XG5cdFx0Ly8gYWZ0ZXIgc25hcHNob3QgZnJvbSB0aGUgcGVlciBjaGF0IERCIChsYXN0IHNvdXJjZSlcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU2Vzc2lvbkRiVXJpKGRpZmYuYWZ0ZXIhLmNvbnRlbnQudXJpKSwge1xuXHRcdFx0c2Vzc2lvblVyaTogUEVFUl9DSEFUX1VSSSxcblx0XHRcdHRvb2xDYWxsSWQ6ICdwdGMxJyxcblx0XHRcdGZpbGVQYXRoOiAnL3NoYXJlZC50eHQnLFxuXHRcdFx0cGFydDogJ2FmdGVyJyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NvbXB1dGVUdXJuRGlmZnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLSBObyBmb2xkZXIgc2NvcGUgKGNoYXJhY3Rlcml6YXRpb24gXHUyMDE0IHNhbWUgYmVoYXZpb3IgYXMgdG9kYXkpIC0tLS0tLS0tXG5cblx0dGVzdCgnbm8gZm9sZGVyU2NvcGUgcmV0dXJucyBhbGwgb2YgdGhlIHR1cm5cXCdzIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL3JlcG8vYS94LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnMScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnMVxcbjInKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL3JlcG8vYi95LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5DcmVhdGUsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ25ldycpLFxuXHRcdH0pO1xuXHRcdC8vIEFuIGVkaXQgaW4gYSBkaWZmZXJlbnQgdHVybiBtdXN0IG5ldmVyIGNvbnRyaWJ1dGUuXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzMnLCBmaWxlUGF0aDogJy9yZXBvL2Evei50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2EnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FcXG5iJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlVHVybkRpZmZzKFRFU1RfU0VTU0lPTl9VUkksIGRiLCBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKSwgJ3QxJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cmVzdWx0Lm1hcChzaW1wbGlmeSkuc29ydCgoeCwgeSkgPT4gKHgudXJpID8/ICcnKS5sb2NhbGVDb21wYXJlKHkudXJpID8/ICcnKSksXG5cdFx0XHRbc2ltcGxlRGlmZignL3JlcG8vYS94LnR4dCcsIDEsIDApLCBzaW1wbGVEaWZmKCcvcmVwby9iL3kudHh0JywgMSwgMCldLFxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gRm9sZGVyLXNjb3BlIGZpbHRlcmluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2ZvbGRlclNjb3BlIFtBXSBpbmNsdWRlcyBvbmx5IGVkaXRzIHVuZGVyIEEgKEIgZXhjbHVkZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL3JlcG8vYS94LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnMScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnMVxcbjInKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL3JlcG8vYi95LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYicpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYlxcbmMnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVUdXJuRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLCBkYiwgY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCksICd0MScsIFtVUkkuZmlsZSgnL3JlcG8vYScpXSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKHNpbXBsaWZ5KSwgW3NpbXBsZURpZmYoJy9yZXBvL2EveC50eHQnLCAxLCAwKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xkZXJTY29wZTogcmVuYW1lIGFuZCBkZWxldGUgd2l0aGluIHNjb3BlIGFyZSBrZXB0OyBlZGl0cy9yZW5hbWVzIG91dCBvZiBzY29wZSBhcmUgZXhjbHVkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIFJlbmFtZSB3aXRoaW4gc2NvcGUgQToganVkZ2VkIGJ5IGFmdGVyLXBhdGggKGtlcHQpLlxuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvcmVwby9hL25ldy50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuUmVuYW1lLFxuXHRcdFx0b3JpZ2luYWxQYXRoOiAnL3JlcG8vYS9vbGQudHh0Jyxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2hlbGxvJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdoZWxsb1xcbndvcmxkJyksXG5cdFx0fSk7XG5cdFx0Ly8gRGVsZXRlIHdpdGhpbiBzY29wZSBBIChrZXB0KS5cblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL3JlcG8vYS9nb25lLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5EZWxldGUsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdieWUnKSxcblx0XHR9KTtcblx0XHQvLyBQbGFpbiBlZGl0IG91dHNpZGUgc2NvcGUgKGV4Y2x1ZGVkKS5cblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMycsIGZpbGVQYXRoOiAnL3JlcG8vYi9rZWVwLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnaycpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygna1xcbmsyJyksXG5cdFx0fSk7XG5cdFx0Ly8gUmVuYW1lIHRoYXQgbW92ZXMgYSBmaWxlIE9VVCBvZiBzY29wZTogYWZ0ZXItcGF0aCBpcyB1bmRlciBCIChleGNsdWRlZCkuXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzQnLCBmaWxlUGF0aDogJy9yZXBvL2IvbW92ZWQudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLlJlbmFtZSxcblx0XHRcdG9yaWdpbmFsUGF0aDogJy9yZXBvL2EvbW92aW5nLnR4dCcsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdtJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdtXFxubTInKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVUdXJuRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLCBkYiwgY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCksICd0MScsIFtVUkkuZmlsZSgnL3JlcG8vYScpXSxcblx0XHQpO1xuXG5cdFx0Ly8gRmlsdGVyaW5nIHNlbWFudGljczogb25seSB0aGUgaW4tc2NvcGUgcmVuYW1lIChyZXBvcnRlZCBhdCBpdHMgdGVybWluYWxcblx0XHQvLyBwYXRoIC9yZXBvL2EvbmV3LnR4dCkgYW5kIHRoZSBpbi1zY29wZSBkZWxldGUgKC9yZXBvL2EvZ29uZS50eHQpIHN1cnZpdmU7XG5cdFx0Ly8gdGhlIG91dC1vZi1zY29wZSBlZGl0IGFuZCB0aGUgcmVuYW1lIHRoYXQgbW92ZXMgYSBmaWxlIG91dCBvZiBzY29wZSBhcmVcblx0XHQvLyBkcm9wcGVkLiBBc3NlcnQgb24gdGhlIHJlcG9ydGVkIFVSSXMgcmF0aGVyIHRoYW4gZXhhY3QgZGlmZiBjb3VudHMgc28gdGhlXG5cdFx0Ly8gdGVzdCB0YXJnZXRzIHRoZSBzY29wZSBmaWx0ZXIsIG5vdCB0aGUgZmFrZSBkaWZmIHNlcnZpY2UncyBsaW5lIG1hdGguXG5cdFx0Y29uc3QgdXJpcyA9IG5ldyBTZXQocmVzdWx0Lm1hcChnZXREaWZmVXJpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdleGFjdGx5IHRoZSB0d28gaW4tc2NvcGUgZmlsZXMgYXJlIHJlcG9ydGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHVyaXMuaGFzKFVSSS5maWxlKCcvcmVwby9hL25ldy50eHQnKS50b1N0cmluZygpKSwgJ2luLXNjb3BlIHJlbmFtZSBrZXB0IGF0IHRlcm1pbmFsIHBhdGgnKTtcblx0XHRhc3NlcnQub2sodXJpcy5oYXMoVVJJLmZpbGUoJy9yZXBvL2EvZ29uZS50eHQnKS50b1N0cmluZygpKSwgJ2luLXNjb3BlIGRlbGV0ZSBrZXB0Jyk7XG5cdFx0YXNzZXJ0Lm9rKCF1cmlzLmhhcyhVUkkuZmlsZSgnL3JlcG8vYi9rZWVwLnR4dCcpLnRvU3RyaW5nKCkpLCAnb3V0LW9mLXNjb3BlIGVkaXQgZXhjbHVkZWQnKTtcblx0XHRhc3NlcnQub2soIXVyaXMuaGFzKFVSSS5maWxlKCcvcmVwby9iL21vdmVkLnR4dCcpLnRvU3RyaW5nKCkpLCAncmVuYW1lIG1vdmluZyBhIGZpbGUgb3V0IG9mIHNjb3BlIGV4Y2x1ZGVkJyk7XG5cblx0XHQvLyBUaGUgcmVuYW1lIHJlc3VsdCByZXBvcnRzIGl0cyB0ZXJtaW5hbCAoaW4tc2NvcGUpIHBhdGggd2l0aCBiZWZvcmUvYWZ0ZXIuXG5cdFx0Y29uc3QgcmVuYW1lID0gcmVzdWx0LmZpbmQoZCA9PiBnZXREaWZmVXJpKGQpID09PSBVUkkuZmlsZSgnL3JlcG8vYS9uZXcudHh0JykudG9TdHJpbmcoKSkhO1xuXHRcdGFzc2VydC5vayhyZW5hbWUuYmVmb3JlLCAncmVuYW1lIGtlZXBzIGEgYmVmb3JlIHNuYXBzaG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlbmFtZS5hZnRlciwgJ3JlbmFtZSBrZWVwcyBhbiBhZnRlciBzbmFwc2hvdCcpO1xuXHRcdC8vIFRoZSBkZWxldGUgcmVzdWx0IHJlcG9ydHMgaXRzIGJlZm9yZSBwYXRoIGFuZCBoYXMgbm8gYWZ0ZXIuXG5cdFx0Y29uc3QgZGVsID0gcmVzdWx0LmZpbmQoZCA9PiBnZXREaWZmVXJpKGQpID09PSBVUkkuZmlsZSgnL3JlcG8vYS9nb25lLnR4dCcpLnRvU3RyaW5nKCkpITtcblx0XHRhc3NlcnQub2soZGVsLmJlZm9yZSwgJ2RlbGV0ZSBoYXMgYSBiZWZvcmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsLmFmdGVyLCB1bmRlZmluZWQsICdkZWxldGUgaGFzIG5vIGFmdGVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlclNjb3BlOiByZW5hbWUgY2hhaW5zIGFyZSBmb2xsb3dlZCBiZWZvcmUgc2NvcGluZyBcdTIwMTQgaW4tc2NvcGUgZWRpdCB0aGVuIHJlbmFtZSBPVVQgb2Ygc2NvcGUgcmVwb3J0cyBub3RoaW5nIChubyBzdGFsZSBwYXRoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0Ly8gU2FtZSBsb2dpY2FsIGZpbGU6IGVkaXRlZCB3aGlsZSBpbiBzY29wZSBBLCB0aGVuIHJlbmFtZWQgb3V0IHRvIEIuXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9yZXBvL2EveC50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJzEnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJzFcXG4yJyksXG5cdFx0fSk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9yZXBvL2IveC50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuUmVuYW1lLFxuXHRcdFx0b3JpZ2luYWxQYXRoOiAnL3JlcG8vYS94LnR4dCcsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCcxXFxuMicpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnMVxcbjJcXG4zJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlVHVybkRpZmZzKFxuXHRcdFx0VEVTVF9TRVNTSU9OX1VSSSwgZGIsIGNyZWF0ZVRlc3REaWZmU2VydmljZSgpLCAndDEnLCBbVVJJLmZpbGUoJy9yZXBvL2EnKV0sXG5cdFx0KTtcblxuXHRcdC8vIFRoZSBpZGVudGl0eSdzIGZpbmFsIHBhdGggaXMgL3JlcG8vYi94LnR4dCAob3V0IG9mIHNjb3BlKSwgc28gdGhlIGZpbGVcblx0XHQvLyBpcyBkcm9wcGVkIGVudGlyZWx5LiBQcmUtZmlsdGVyaW5nIHJhdyByZWNvcmRzICh0aGUgcHJldmlvdXMgYnVnKSB3b3VsZFxuXHRcdC8vIGhhdmUga2VwdCB0aGUgaW4tc2NvcGUgZWRpdCByZWNvcmQgYW5kIHJlcG9ydGVkIGEgc3RhbGUgL3JlcG8vYS94LnR4dC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoc2ltcGxpZnkpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlclNjb3BlOiByZW5hbWUgY2hhaW5zIGFyZSBmb2xsb3dlZCBiZWZvcmUgc2NvcGluZyBcdTIwMTQgZWRpdCBPVVQgb2Ygc2NvcGUgdGhlbiByZW5hbWUgSU5UTyBzY29wZSBrZWVwcyB0aGUgZnVsbCBiZWZvcmUvYWZ0ZXIgY2hhaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIFNhbWUgbG9naWNhbCBmaWxlOiBlZGl0ZWQgd2hpbGUgb3V0IG9mIHNjb3BlIChCKSwgdGhlbiByZW5hbWVkIGludG8gQS5cblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL3JlcG8vYi95LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnMScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnMVxcbjInKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL3JlcG8vYS95LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5SZW5hbWUsXG5cdFx0XHRvcmlnaW5hbFBhdGg6ICcvcmVwby9iL3kudHh0Jyxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJzFcXG4yJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCcxXFxuMlxcbjMnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVUdXJuRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLCBkYiwgY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCksICd0MScsIFtVUkkuZmlsZSgnL3JlcG8vYScpXSxcblx0XHQpO1xuXG5cdFx0Ly8gUmVwb3J0ZWQgYXQgaXRzIGluLXNjb3BlIHRlcm1pbmFsIHBhdGggL3JlcG8vYS95LnR4dCB3aXRoIGBiZWZvcmVgIHRha2VuXG5cdFx0Ly8gZnJvbSB0aGUgcHJlLXJlbmFtZSBlZGl0IChjb250ZW50ICcxJywgb25lIGxpbmUpIC0+IGBhZGRlZGAgaXMgMi4gUHJlLVxuXHRcdC8vIGZpbHRlcmluZyAodGhlIHByZXZpb3VzIGJ1ZykgZHJvcHBlZCB0aGUgb3V0LW9mLXNjb3BlIGVkaXQsIGxvc2luZyB0aGVcblx0XHQvLyBiZWZvcmUgc25hcHNob3QgKGVtcHR5KSwgd2hpY2ggd291bGQgaGF2ZSByZXBvcnRlZCBgYWRkZWRgIDMuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKHNpbXBsaWZ5KSwgW3NpbXBsZURpZmYoJy9yZXBvL2EveS50eHQnLCAyLCAwKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xkZXJTY29wZTogYSBmaWxlIHBhdGggZXhhY3RseSBhdCBhIGZvbGRlciByb290IGlzIGtlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvcmVwby9hL3gudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdhJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdhXFxuYicpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVR1cm5EaWZmcyhcblx0XHRcdFRFU1RfU0VTU0lPTl9VUkksIGRiLCBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKSwgJ3QxJywgW1VSSS5maWxlKCcvcmVwby9hL3gudHh0JyldLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoc2ltcGxpZnkpLCBbc2ltcGxlRGlmZignL3JlcG8vYS94LnR4dCcsIDEsIDApXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlclNjb3BlOiBhbiBlbXB0eSBzY29wZSBleGNsdWRlcyBldmVyeSBlZGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL3JlcG8vYS94LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYVxcbmInKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVUdXJuRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLCBkYiwgY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCksICd0MScsIFtdLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFJlbmFtZS1jaGFpbiBjb3JyZWN0bmVzcyAoRzEpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdHMTogRWRpdCBBIFx1MjE5MiBSZW5hbWUgQVx1MjE5MkIgXHUyMTkyIENyZWF0ZSBBIHlpZWxkcyB0d28gaWRlbnRpdGllcyAobW92ZWQgQiBhbmQgbmV3IEEpLCBub3Qgb25lIG1lcmdlZCBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9yZXBvL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdhMScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYTFcXG5hMicpLFxuXHRcdH0pO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMyJywgZmlsZVBhdGg6ICcvcmVwby9iLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5SZW5hbWUsXG5cdFx0XHRvcmlnaW5hbFBhdGg6ICcvcmVwby9hLnR4dCcsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdhMVxcbmEyJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdhMVxcbmEyXFxuYTMnKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMycsIGZpbGVQYXRoOiAnL3JlcG8vYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuQ3JlYXRlLFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdicmFuZCBuZXcgYScpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVR1cm5EaWZmcyhURVNUX1NFU1NJT05fVVJJLCBkYiwgY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCksICd0MScpO1xuXG5cdFx0Y29uc3QgdXJpcyA9IG5ldyBTZXQocmVzdWx0Lm1hcChnZXREaWZmVXJpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICd0aGUgbW92ZWQgZmlsZSAoQikgYW5kIHRoZSByZWNyZWF0ZWQgZmlsZSAoQSkgYXJlIGRpc3RpbmN0IGlkZW50aXRpZXMnKTtcblx0XHRhc3NlcnQub2sodXJpcy5oYXMoVVJJLmZpbGUoJy9yZXBvL2IudHh0JykudG9TdHJpbmcoKSksICd0aGUgcmVuYW1lZCBmaWxlIGFwcGVhcnMgYXQgaXRzIGRlc3RpbmF0aW9uIHBhdGggQicpO1xuXHRcdGFzc2VydC5vayh1cmlzLmhhcyhVUkkuZmlsZSgnL3JlcG8vYS50eHQnKS50b1N0cmluZygpKSwgJ3RoZSByZWNyZWF0ZWQgZmlsZSBBIGlzIGEgZnJlc2ggaWRlbnRpdHknKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBMkM7QUFDcEQsU0FBUyxjQUFjLHdCQUF3QiwyQkFBMkI7QUFDMUUsU0FBUyxxQkFBcUIsa0JBQWtCLDJCQUEy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
