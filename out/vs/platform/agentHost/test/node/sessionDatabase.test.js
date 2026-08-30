import assert from "assert";
import { tmpdir } from "os";
import * as fs from "fs/promises";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { SessionDatabase, runMigrations, sessionDatabaseMigrations } from "../../node/sessionDatabase.js";
import { FileEditKind, MessageKind } from "../../common/state/sessionState.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
suite("SessionDatabase", () => {
  const disposables = new DisposableStore();
  let db;
  let db2;
  teardown(async () => {
    disposables.clear();
    await Promise.all([db?.close(), db2?.close()]);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("initialization", () => {
    test("retries after a transient initialization failure", async () => {
      const tempRoot = await fs.mkdtemp(join(tmpdir(), "session-db-retry-" + generateUuid()));
      try {
        const databaseDir = join(tempRoot, "blocked");
        const databasePath = join(databaseDir, "session.db");
        await fs.writeFile(databaseDir, "");
        const database = new SessionDatabase(databasePath);
        try {
          await assert.rejects(() => database.setMetadata("key", "first"), { code: "EEXIST" });
          await fs.rm(databaseDir);
          await database.setMetadata("key", "second");
          assert.strictEqual(await database.getMetadata("key"), "second");
        } finally {
          await database.close();
        }
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    }).timeout(1e4);
  });
  class TestableSessionDatabase extends SessionDatabase {
    static async open(path, migrations = sessionDatabaseMigrations) {
      const inst = new TestableSessionDatabase(path, migrations);
      await inst._ensureDb();
      return inst;
    }
    async setRawChatDraft(chat, draft) {
      const rawDb = await this._ensureDb();
      await new Promise((resolve, reject) => {
        rawDb.run("INSERT OR REPLACE INTO chat_drafts (chat_uri, draft) VALUES (?, ?)", [chat.toString(), draft], (err) => err ? reject(err) : resolve());
      });
    }
    async runRaw(sql) {
      const rawDb = await this._ensureDb();
      await new Promise((resolve, reject) => {
        rawDb.exec(sql, (err) => err ? reject(err) : resolve());
      });
    }
    /** Extract the raw db connection; this instance becomes inert. */
    async ejectDb() {
      const rawDb = await this._ensureDb();
      this._dbPromise = void 0;
      this._closed = true;
      return rawDb;
    }
    /** Create a TestableSessionDatabase wrapping an existing raw db. */
    static async fromDb(rawDb, migrations = sessionDatabaseMigrations) {
      await runMigrations(rawDb, migrations);
      const inst = new TestableSessionDatabase(":memory:", migrations);
      inst._dbPromise = Promise.resolve(rawDb);
      return inst;
    }
  }
  suite("migrations", () => {
    test("applies all migrations on a fresh database", async () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "CREATE TABLE t2 (id INTEGER PRIMARY KEY)" }
      ];
      db = disposables.add(await SessionDatabase.open(":memory:", migrations));
      const tables = (await db.getAllTables()).sort();
      assert.deepStrictEqual(tables, ["t1", "t2"]);
    });
    test("reopening with same migrations is a no-op", async () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" }
      ];
      const db1 = await TestableSessionDatabase.open(":memory:", migrations);
      const rawDb = await db1.ejectDb();
      db2 = disposables.add(await TestableSessionDatabase.fromDb(rawDb, migrations));
      assert.deepStrictEqual(await db2.getAllTables(), ["t1"]);
    });
    test("only applies new migrations on reopen", async () => {
      const v1 = [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" }
      ];
      const db1 = await TestableSessionDatabase.open(":memory:", v1);
      const rawDb = await db1.ejectDb();
      const v2 = [
        ...v1,
        { version: 2, sql: "CREATE TABLE t2 (id INTEGER PRIMARY KEY)" }
      ];
      db2 = disposables.add(await TestableSessionDatabase.fromDb(rawDb, v2));
      const tables = (await db2.getAllTables()).sort();
      assert.deepStrictEqual(tables, ["t1", "t2"]);
    });
    test("rolls back on migration failure", async () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "THIS IS INVALID SQL" }
      ];
      await assert.rejects(() => SessionDatabase.open(":memory:", migrations));
      db = disposables.add(await SessionDatabase.open(":memory:", [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" }
      ]));
      assert.deepStrictEqual(await db.getAllTables(), ["t1"]);
    });
  });
  suite("file edits", () => {
    test("store and retrieve a file edit", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        beforeContent: new TextEncoder().encode("before"),
        afterContent: new TextEncoder().encode("after"),
        addedLines: 5,
        removedLines: 2
      });
      const edits = await db.getFileEdits(["tc-1"]);
      assert.deepStrictEqual(edits, [{
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        originalPath: void 0,
        addedLines: 5,
        removedLines: 2
      }]);
    });
    test("retrieve multiple edits for a single tool call", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/a.ts",
        beforeContent: new TextEncoder().encode("a-before"),
        afterContent: new TextEncoder().encode("a-after"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/b.ts",
        beforeContent: new TextEncoder().encode("b-before"),
        afterContent: new TextEncoder().encode("b-after"),
        addedLines: 1,
        removedLines: 0
      });
      const edits = await db.getFileEdits(["tc-1"]);
      assert.strictEqual(edits.length, 2);
      assert.strictEqual(edits[0].filePath, "/workspace/a.ts");
      assert.strictEqual(edits[1].filePath, "/workspace/b.ts");
    });
    test("retrieve edits across multiple tool calls", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/a.ts",
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("hello"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-2",
        kind: FileEditKind.Edit,
        filePath: "/workspace/b.ts",
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("world"),
        addedLines: void 0,
        removedLines: void 0
      });
      const edits = await db.getFileEdits(["tc-1", "tc-2"]);
      assert.strictEqual(edits.length, 2);
      const edits2 = await db.getFileEdits(["tc-2"]);
      assert.strictEqual(edits2.length, 1);
      assert.strictEqual(edits2[0].toolCallId, "tc-2");
    });
    test("returns empty array for unknown tool call IDs", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const edits = await db.getFileEdits(["nonexistent"]);
      assert.deepStrictEqual(edits, []);
    });
    test("returns empty array when given empty array", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const edits = await db.getFileEdits([]);
      assert.deepStrictEqual(edits, []);
    });
    test("replace on conflict (same toolCallId + filePath)", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        beforeContent: new TextEncoder().encode("v1"),
        afterContent: new TextEncoder().encode("v1-after"),
        addedLines: 1,
        removedLines: 0
      });
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        beforeContent: new TextEncoder().encode("v2"),
        afterContent: new TextEncoder().encode("v2-after"),
        addedLines: 3,
        removedLines: 1
      });
      const edits = await db.getFileEdits(["tc-1"]);
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].addedLines, 3);
      const content = await db.readFileEditContent("tc-1", "/workspace/file.ts");
      assert.ok(content);
      assert.deepStrictEqual(new TextDecoder().decode(content.beforeContent), "v2");
    });
    test("readFileEditContent returns content on demand", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        beforeContent: new TextEncoder().encode("before"),
        afterContent: new TextEncoder().encode("after"),
        addedLines: void 0,
        removedLines: void 0
      });
      const content = await db.readFileEditContent("tc-1", "/workspace/file.ts");
      assert.ok(content);
      assert.deepStrictEqual(content.beforeContent, new TextEncoder().encode("before"));
      assert.deepStrictEqual(content.afterContent, new TextEncoder().encode("after"));
    });
    test("readFileEditContent returns undefined for missing edit", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const content = await db.readFileEditContent("tc-missing", "/no/such/file");
      assert.strictEqual(content, void 0);
    });
    test("persists binary content correctly", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const binary = new Uint8Array([0, 1, 2, 255, 128, 64]);
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-bin",
        kind: FileEditKind.Edit,
        filePath: "/workspace/image.png",
        beforeContent: new Uint8Array(0),
        afterContent: binary,
        addedLines: void 0,
        removedLines: void 0
      });
      const content = await db.readFileEditContent("tc-bin", "/workspace/image.png");
      assert.ok(content);
      assert.deepStrictEqual(content.afterContent, binary);
    });
    test("auto-creates turn if it does not exist", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.storeFileEdit({
        turnId: "auto-turn",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/x",
        beforeContent: new Uint8Array(0),
        afterContent: new Uint8Array(0),
        addedLines: void 0,
        removedLines: void 0
      });
      const edits = await db.getFileEdits(["tc-1"]);
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].turnId, "auto-turn");
    });
  });
  suite("turns", () => {
    test("createTurn is idempotent", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.createTurn("turn-1");
    });
    test("deleteTurn cascades to file edits", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/a.ts",
        beforeContent: new TextEncoder().encode("before"),
        afterContent: new TextEncoder().encode("after"),
        addedLines: void 0,
        removedLines: void 0
      });
      assert.strictEqual((await db.getFileEdits(["tc-1"])).length, 1);
      await db.deleteTurn("turn-1");
      assert.deepStrictEqual(await db.getFileEdits(["tc-1"]), []);
    });
    test("deleteTurn only removes its own edits", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.createTurn("turn-2");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/a.ts",
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("a"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.storeFileEdit({
        turnId: "turn-2",
        toolCallId: "tc-2",
        kind: FileEditKind.Edit,
        filePath: "/workspace/b.ts",
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("b"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.deleteTurn("turn-1");
      assert.deepStrictEqual(await db.getFileEdits(["tc-1"]), []);
      assert.strictEqual((await db.getFileEdits(["tc-2"])).length, 1);
    });
    test("deleteTurn is a no-op for unknown turn", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.deleteTurn("nonexistent");
    });
  });
  suite("turn event ids", () => {
    test("getTurnEventId resolves protocol and restored SDK turn IDs", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      assert.deepStrictEqual({
        protocol: await db.getTurnEventId("turn-1"),
        restored: await db.getTurnEventId("evt-1")
      }, {
        protocol: "evt-1",
        restored: "evt-1"
      });
    });
    test("getNextTurnEventId returns the next turn's event id by `turns.id`", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.createTurn("turn-2");
      await db.setTurnEventId("turn-1", "evt-1");
      await db.setTurnEventId("turn-2", "evt-2");
      assert.strictEqual(await db.getNextTurnEventId("turn-1"), "evt-2");
    });
    test("getNextTurnEventId falls back to `event_id` when the key is the SDK event id", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("request_aaa");
      await db.createTurn("request_bbb");
      await db.setTurnEventId("request_aaa", "sdk-evt-1");
      await db.setTurnEventId("request_bbb", "sdk-evt-2");
      assert.strictEqual(await db.getNextTurnEventId("sdk-evt-1"), "sdk-evt-2");
    });
    test("getNextTurnEventId returns undefined for the last turn", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      assert.strictEqual(await db.getNextTurnEventId("turn-1"), void 0);
      assert.strictEqual(await db.getNextTurnEventId("evt-1"), void 0);
    });
    test("getNextTurnEventId returns undefined for an unknown key", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      assert.strictEqual(await db.getNextTurnEventId("does-not-exist"), void 0);
    });
  });
  suite("turn usage", () => {
    test("getTurnUsages indexes the last usage by both turn id and SDK event id", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("request_aaa");
      await db.createTurn("request_bbb");
      await db.setTurnEventId("request_aaa", "sdk-evt-1");
      await db.setTurnUsage("request_aaa", '{"inputTokens":1}');
      await db.setTurnUsage("request_aaa", '{"inputTokens":2}');
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [
        ["request_aaa", '{"inputTokens":2}'],
        ["sdk-evt-1", '{"inputTokens":2}']
      ]);
    });
    test("records usage for a turn with no `turns` row, creating one so it can be pruned", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      await db.createTurn("turn-2");
      await db.setTurnEventId("turn-2", "evt-2");
      await db.setTurnUsage("usage-only-turn", '{"inputTokens":9}');
      assert.deepStrictEqual({
        usage: (await db.getTurnUsages()).get("usage-only-turn"),
        // Ordering is untouched: turn-1's successor is still turn-2.
        next: await db.getNextTurnEventId("turn-1"),
        first: await db.getFirstTurnEventId()
      }, {
        usage: '{"inputTokens":9}',
        next: "evt-2",
        first: "evt-1"
      });
    });
    test("truncation prunes usage for turns that have no other DB rows", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnUsage("turn-1", '{"inputTokens":1}');
      await db.setTurnUsage("usage-only-2", '{"inputTokens":2}');
      await db.setTurnUsage("usage-only-3", '{"inputTokens":3}');
      await db.deleteTurnsAfter("turn-1");
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [["turn-1", '{"inputTokens":1}']]);
    });
    test("deleting a session's turns leaves no usage behind", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setTurnUsage("usage-only-1", '{"inputTokens":1}');
      await db.setTurnUsage("usage-only-2", '{"inputTokens":2}');
      await db.deleteAllTurns();
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], []);
    });
    test("reads see a fire-and-forget write submitted before them", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      const write = db.setTurnUsage("turn-1", '{"inputTokens":7}');
      const usages = await db.getTurnUsages();
      await write;
      assert.deepStrictEqual([...usages.entries()], [["turn-1", '{"inputTokens":7}']]);
    });
    test("truncation prunes the usage of removed turns", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.createTurn("turn-2");
      await db.setTurnUsage("turn-1", '{"inputTokens":1}');
      await db.setTurnUsage("turn-2", '{"inputTokens":2}');
      await db.deleteTurnsAfter("turn-1");
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [["turn-1", '{"inputTokens":1}']]);
    });
    test("remapTurnIds carries usage and replaces event IDs on imported forks", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("old-1");
      await db.createTurn("old-2");
      await db.setTurnEventId("old-1", "old-event-1");
      await db.setTurnEventId("old-2", "old-event-2");
      await db.setTurnUsage("old-1", '{"inputTokens":1}');
      await db.setTurnUsage("old-2", '{"inputTokens":2}');
      await db.remapTurnIds(
        /* @__PURE__ */ new Map([["old-1", "new-1"]]),
        /* @__PURE__ */ new Map([["new-1", "new-event-1"]])
      );
      assert.deepStrictEqual({
        usages: [...(await db.getTurnUsages()).entries()],
        eventId: await db.getTurnEventId("new-1")
      }, {
        usages: [
          ["new-1", '{"inputTokens":1}'],
          ["new-event-1", '{"inputTokens":1}']
        ],
        eventId: "new-event-1"
      });
    });
  });
  suite("turn checkpoint refs", () => {
    test("getTurnCheckpointRef falls back to `event_id` when the key is the SDK event id", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("request_aaa");
      await db.setTurnEventId("request_aaa", "sdk-evt-1");
      await db.setTurnCheckpointRef("request_aaa", "ref-1");
      assert.strictEqual(await db.getTurnCheckpointRef("sdk-evt-1"), "ref-1");
    });
    test("getPreviousCheckpointRef falls back to `event_id` when the key is the SDK event id", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("request_aaa");
      await db.createTurn("request_bbb");
      await db.setTurnEventId("request_aaa", "sdk-evt-1");
      await db.setTurnEventId("request_bbb", "sdk-evt-2");
      await db.setTurnCheckpointRef("request_aaa", "ref-1");
      await db.setTurnCheckpointRef("request_bbb", "ref-2");
      assert.strictEqual(await db.getPreviousCheckpointRef("sdk-evt-2"), "ref-1");
    });
  });
  suite("dispose", () => {
    test("methods throw after dispose", async () => {
      db = await SessionDatabase.open(":memory:");
      db.close();
      await assert.rejects(
        () => db.createTurn("turn-1"),
        /disposed/
      );
    });
    test("double dispose is safe", async () => {
      db = await SessionDatabase.open(":memory:");
      await db.close();
      await db.close();
    });
  });
  suite("lazy open", () => {
    test("constructor does not open the database", () => {
      db = new SessionDatabase(":memory:");
      disposables.add(db);
    });
    test("first async call opens and migrates the database", async () => {
      db = disposables.add(new SessionDatabase(":memory:"));
      await db.createTurn("turn-1");
      const edits = await db.getFileEdits(["nonexistent"]);
      assert.deepStrictEqual(edits, []);
    });
    test("multiple concurrent calls share the same open promise", async () => {
      db = disposables.add(new SessionDatabase(":memory:"));
      await Promise.all([
        db.createTurn("turn-1"),
        db.createTurn("turn-2"),
        db.getFileEdits([])
      ]);
    });
    test("dispose during open rejects subsequent calls", async () => {
      db = new SessionDatabase(":memory:");
      await db.close();
      await assert.rejects(() => db.createTurn("turn-1"), /disposed/);
    });
  });
  suite("session metadata", () => {
    test("getMetadata returns undefined for missing key", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      assert.strictEqual(await db.getMetadata("nonexistent"), void 0);
    });
    test("setMetadata and getMetadata round-trip", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setMetadata("customTitle", "My Session");
      assert.strictEqual(await db.getMetadata("customTitle"), "My Session");
    });
    test("setMetadata overwrites existing value", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setMetadata("customTitle", "First");
      await db.setMetadata("customTitle", "Second");
      assert.strictEqual(await db.getMetadata("customTitle"), "Second");
    });
    test("setMetadataValues rolls back every key when one write fails", async () => {
      const database = disposables.add(await TestableSessionDatabase.open(":memory:"));
      db = database;
      await database.setMetadata("customTitle", "Original title");
      await database.setMetadata("customTitleSource", "user");
      await database.runRaw(`CREATE TRIGGER fail_title_source BEFORE INSERT ON session_metadata
				WHEN NEW.key = 'customTitleSource' BEGIN SELECT RAISE(ABORT, 'source write failed'); END`);
      await assert.rejects(() => database.setMetadataValues({
        customTitle: "Replacement title",
        customTitleSource: "agent"
      }), /source write failed/);
      assert.deepStrictEqual(await database.getMetadataObject({
        customTitle: true,
        customTitleSource: true
      }), {
        customTitle: "Original title",
        customTitleSource: "user"
      });
    });
    test("setMetadataValues serializes with turn ID remapping transactions", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("old-1");
      await db.setTurnUsage("old-1", '{"inputTokens":1}');
      await Promise.all([
        db.setMetadataValues({
          customTitle: "Concurrent title",
          customTitleSource: "agent"
        }),
        db.remapTurnIds(/* @__PURE__ */ new Map([["old-1", "new-1"]]))
      ]);
      assert.deepStrictEqual({
        metadata: await db.getMetadataObject({ customTitle: true, customTitleSource: true }),
        usages: [...(await db.getTurnUsages()).entries()]
      }, {
        metadata: { customTitle: "Concurrent title", customTitleSource: "agent" },
        usages: [["new-1", '{"inputTokens":1}']]
      });
    });
    test("metadata persists across reopen", async () => {
      const db1 = disposables.add(await TestableSessionDatabase.open(":memory:"));
      await db1.setMetadata("customTitle", "Persistent Title");
      const rawDb = await db1.ejectDb();
      db = disposables.add(await TestableSessionDatabase.fromDb(rawDb));
      assert.strictEqual(await db.getMetadata("customTitle"), "Persistent Title");
    });
    test("migration v2 creates session_metadata table", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const tables = await db.getAllTables();
      assert.ok(tables.includes("session_metadata"));
    });
  });
  suite("chat drafts", () => {
    const chat = URI.parse("ahp-chat://default/Y29waWxvdDovLy9zZXNzaW9uLTE");
    test("setChatDraft and getChatDraft round-trip", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const draft = {
        text: "draft",
        origin: { kind: MessageKind.User },
        model: { id: "opus" },
        agent: { uri: "agent://reviewer" }
      };
      await db.setChatDraft(chat, draft);
      assert.deepStrictEqual(await db.getChatDraft(chat), draft);
    });
    test("setChatDraft undefined clears a draft", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const draft = { text: "draft", origin: { kind: MessageKind.User } };
      await db.setChatDraft(chat, draft);
      await db.setChatDraft(chat, void 0);
      assert.strictEqual(await db.getChatDraft(chat), void 0);
    });
    test("getChatDraft returns undefined for corrupt draft rows", async () => {
      const testDb = disposables.add(await TestableSessionDatabase.open(":memory:"));
      db = testDb;
      await testDb.setRawChatDraft(chat, "{");
      assert.strictEqual(await db.getChatDraft(chat), void 0);
    });
    test("migration v6 creates chat draft tables", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const tables = await db.getAllTables();
      assert.ok(tables.includes("chat_drafts"));
    });
  });
  suite("reviewed files", () => {
    const uriA = URI.parse("file:///workspace/a.ts");
    const uriB = URI.parse("file:///workspace/b.ts");
    const normalize = (records) => records.map((r) => ({ uri: r.uri.toString(), nonce: r.nonce }));
    test("markFileReviewed and isFileReviewed discriminate by uri and nonce", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      assert.deepStrictEqual(
        await Promise.all([
          db.isFileReviewed(uriA, "n1"),
          db.isFileReviewed(uriA, "n2"),
          db.isFileReviewed(uriB, "n1")
        ]),
        [true, false, false]
      );
    });
    test("getReviewedFiles returns all entries in insertion order", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      await db.markFileReviewed(uriB, "n2");
      await db.markFileReviewed(uriA, "n3");
      assert.deepStrictEqual(normalize(await db.getReviewedFiles()), [
        { uri: uriA.toString(), nonce: "n1" },
        { uri: uriB.toString(), nonce: "n2" },
        { uri: uriA.toString(), nonce: "n3" }
      ]);
    });
    test("getReviewedFilesForUri returns only the given uri", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      await db.markFileReviewed(uriB, "n2");
      await db.markFileReviewed(uriA, "n3");
      assert.deepStrictEqual(normalize(await db.getReviewedFilesForUri(uriA)), [
        { uri: uriA.toString(), nonce: "n1" },
        { uri: uriA.toString(), nonce: "n3" }
      ]);
    });
    test("unmarkFileReviewed removes an entry and is a no-op when absent", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      await db.unmarkFileReviewed(uriA, "n1");
      await db.unmarkFileReviewed(uriA, "n1");
      assert.deepStrictEqual(
        await Promise.all([db.isFileReviewed(uriA, "n1"), db.getReviewedFiles()]),
        [false, []]
      );
    });
    test("marking the same (uri, nonce) twice keeps a single entry", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      await db.markFileReviewed(uriA, "n1");
      assert.deepStrictEqual(normalize(await db.getReviewedFiles()), [{ uri: uriA.toString(), nonce: "n1" }]);
    });
    test("migration v7 creates the reviewed_files table", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const tables = await db.getAllTables();
      assert.ok(tables.includes("reviewed_files"));
    });
  });
  suite("vacuumInto", () => {
    let tmpDir;
    setup(async () => {
      tmpDir = await fs.mkdtemp(join(tmpdir(), "session-db-test-" + generateUuid()));
    });
    teardown(async () => {
      await Promise.all([db?.close(), db2?.close()]);
      db = db2 = void 0;
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
    test("produces a copy with the same data", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      await db.setMetadata("key", "value");
      const targetPath = join(tmpDir, "copy.db");
      await db.vacuumInto(targetPath);
      db2 = disposables.add(await SessionDatabase.open(targetPath));
      assert.strictEqual(await db2.getTurnEventId("turn-1"), "evt-1");
      assert.strictEqual(await db2.getMetadata("key"), "value");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzZXNzaW9uRGF0YWJhc2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNlc3Npb25EYXRhYmFzZSwgcnVuTWlncmF0aW9ucywgc2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9ucywgdHlwZSBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uIH0gZnJvbSAnLi4vLi4vbm9kZS9zZXNzaW9uRGF0YWJhc2UuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRLaW5kLCBNZXNzYWdlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJUmV2aWV3ZWRGaWxlUmVjb3JkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IERhdGFiYXNlIH0gZnJvbSAnQHZzY29kZS9zcWxpdGUzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuc3VpdGUoJ1Nlc3Npb25EYXRhYmFzZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGRiOiBTZXNzaW9uRGF0YWJhc2UgfCB1bmRlZmluZWQ7XG5cdGxldCBkYjI6IFNlc3Npb25EYXRhYmFzZSB8IHVuZGVmaW5lZDtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbZGI/LmNsb3NlKCksIGRiMj8uY2xvc2UoKV0pO1xuXHR9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2luaXRpYWxpemF0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0cmllcyBhZnRlciBhIHRyYW5zaWVudCBpbml0aWFsaXphdGlvbiBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVtcFJvb3QgPSBhd2FpdCBmcy5ta2R0ZW1wKGpvaW4odG1wZGlyKCksICdzZXNzaW9uLWRiLXJldHJ5LScgKyBnZW5lcmF0ZVV1aWQoKSkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGF0YWJhc2VEaXIgPSBqb2luKHRlbXBSb290LCAnYmxvY2tlZCcpO1xuXHRcdFx0XHRjb25zdCBkYXRhYmFzZVBhdGggPSBqb2luKGRhdGFiYXNlRGlyLCAnc2Vzc2lvbi5kYicpO1xuXHRcdFx0XHRhd2FpdCBmcy53cml0ZUZpbGUoZGF0YWJhc2VEaXIsICcnKTtcblx0XHRcdFx0Y29uc3QgZGF0YWJhc2UgPSBuZXcgU2Vzc2lvbkRhdGFiYXNlKGRhdGFiYXNlUGF0aCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gZGF0YWJhc2Uuc2V0TWV0YWRhdGEoJ2tleScsICdmaXJzdCcpLCB7IGNvZGU6ICdFRVhJU1QnIH0pO1xuXHRcdFx0XHRcdGF3YWl0IGZzLnJtKGRhdGFiYXNlRGlyKTtcblxuXHRcdFx0XHRcdGF3YWl0IGRhdGFiYXNlLnNldE1ldGFkYXRhKCdrZXknLCAnc2Vjb25kJyk7XG5cblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGF0YWJhc2UuZ2V0TWV0YWRhdGEoJ2tleScpLCAnc2Vjb25kJyk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0YXdhaXQgZGF0YWJhc2UuY2xvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZnMucm0odGVtcFJvb3QsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KS50aW1lb3V0KDEwXzAwMCk7XG5cdH0pO1xuXG5cdC8qKlxuXHQgKiBFeHRlbmRzIFNlc3Npb25EYXRhYmFzZSB0byBhbGxvdyBlamVjdGluZy9pbmplY3RpbmcgdGhlIHJhdyBzcWxpdGUzXG5cdCAqIERhdGFiYXNlIGluc3RhbmNlLCBlbmFibGluZyByZW9wZW4gdGVzdHMgd2l0aCA6bWVtb3J5OiBkYXRhYmFzZXMuXG5cdCAqL1xuXHRjbGFzcyBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZSBleHRlbmRzIFNlc3Npb25EYXRhYmFzZSB7XG5cdFx0c3RhdGljIG92ZXJyaWRlIGFzeW5jIG9wZW4ocGF0aDogc3RyaW5nLCBtaWdyYXRpb25zOiByZWFkb25seSBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uW10gPSBzZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25zKTogUHJvbWlzZTxUZXN0YWJsZVNlc3Npb25EYXRhYmFzZT4ge1xuXHRcdFx0Y29uc3QgaW5zdCA9IG5ldyBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZShwYXRoLCBtaWdyYXRpb25zKTtcblx0XHRcdGF3YWl0IGluc3QuX2Vuc3VyZURiKCk7XG5cdFx0XHRyZXR1cm4gaW5zdDtcblx0XHR9XG5cblx0XHRhc3luYyBzZXRSYXdDaGF0RHJhZnQoY2hhdDogVVJJLCBkcmFmdDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCByYXdEYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHJhd0RiLnJ1bignSU5TRVJUIE9SIFJFUExBQ0UgSU5UTyBjaGF0X2RyYWZ0cyAoY2hhdF91cmksIGRyYWZ0KSBWQUxVRVMgKD8sID8pJywgW2NoYXQudG9TdHJpbmcoKSwgZHJhZnRdLCBlcnIgPT4gZXJyID8gcmVqZWN0KGVycikgOiByZXNvbHZlKCkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuUmF3KHNxbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCByYXdEYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHJhd0RiLmV4ZWMoc3FsLCBlcnIgPT4gZXJyID8gcmVqZWN0KGVycikgOiByZXNvbHZlKCkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyoqIEV4dHJhY3QgdGhlIHJhdyBkYiBjb25uZWN0aW9uOyB0aGlzIGluc3RhbmNlIGJlY29tZXMgaW5lcnQuICovXG5cdFx0YXN5bmMgZWplY3REYigpOiBQcm9taXNlPERhdGFiYXNlPiB7XG5cdFx0XHRjb25zdCByYXdEYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHR0aGlzLl9kYlByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jbG9zZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHJhd0RiO1xuXHRcdH1cblxuXHRcdC8qKiBDcmVhdGUgYSBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZSB3cmFwcGluZyBhbiBleGlzdGluZyByYXcgZGIuICovXG5cdFx0c3RhdGljIGFzeW5jIGZyb21EYihcblx0XHRcdHJhd0RiOiBEYXRhYmFzZSxcblx0XHRcdG1pZ3JhdGlvbnM6IHJlYWRvbmx5IElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25bXSA9IHNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbnMsXG5cdFx0KTogUHJvbWlzZTxUZXN0YWJsZVNlc3Npb25EYXRhYmFzZT4ge1xuXHRcdFx0YXdhaXQgcnVuTWlncmF0aW9ucyhyYXdEYiwgbWlncmF0aW9ucyk7XG5cdFx0XHRjb25zdCBpbnN0ID0gbmV3IFRlc3RhYmxlU2Vzc2lvbkRhdGFiYXNlKCc6bWVtb3J5OicsIG1pZ3JhdGlvbnMpO1xuXHRcdFx0aW5zdC5fZGJQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHJhd0RiKTtcblx0XHRcdHJldHVybiBpbnN0O1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gTWlncmF0aW9uIHN5c3RlbSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdtaWdyYXRpb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYXBwbGllcyBhbGwgbWlncmF0aW9ucyBvbiBhIGZyZXNoIGRhdGFiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWlncmF0aW9uczogSVNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbltdID0gW1xuXHRcdFx0XHR7IHZlcnNpb246IDEsIHNxbDogJ0NSRUFURSBUQUJMRSB0MSAoaWQgSU5URUdFUiBQUklNQVJZIEtFWSknIH0sXG5cdFx0XHRcdHsgdmVyc2lvbjogMiwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQyIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdF07XG5cblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicsIG1pZ3JhdGlvbnMpKTtcblxuXHRcdFx0Y29uc3QgdGFibGVzID0gKGF3YWl0IGRiLmdldEFsbFRhYmxlcygpKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhYmxlcywgWyd0MScsICd0MiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlb3BlbmluZyB3aXRoIHNhbWUgbWlncmF0aW9ucyBpcyBhIG5vLW9wJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWlncmF0aW9uczogSVNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbltdID0gW1xuXHRcdFx0XHR7IHZlcnNpb246IDEsIHNxbDogJ0NSRUFURSBUQUJMRSB0MSAoaWQgSU5URUdFUiBQUklNQVJZIEtFWSknIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBkYjEgPSBhd2FpdCBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicsIG1pZ3JhdGlvbnMpO1xuXHRcdFx0Y29uc3QgcmF3RGIgPSBhd2FpdCBkYjEuZWplY3REYigpO1xuXG5cdFx0XHQvLyBSZW9wZW4gXHUyMDE0IHNob3VsZCBub3QgdGhyb3cgKHRhYmxlIGFscmVhZHkgZXhpc3RzLCBtaWdyYXRpb24gc2tpcHBlZClcblx0XHRcdGRiMiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZS5mcm9tRGIocmF3RGIsIG1pZ3JhdGlvbnMpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZGIyLmdldEFsbFRhYmxlcygpLCBbJ3QxJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25seSBhcHBsaWVzIG5ldyBtaWdyYXRpb25zIG9uIHJlb3BlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHYxOiBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uW10gPSBbXG5cdFx0XHRcdHsgdmVyc2lvbjogMSwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQxIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBkYjEgPSBhd2FpdCBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicsIHYxKTtcblx0XHRcdGNvbnN0IHJhd0RiID0gYXdhaXQgZGIxLmVqZWN0RGIoKTtcblxuXHRcdFx0Y29uc3QgdjI6IElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25bXSA9IFtcblx0XHRcdFx0Li4udjEsXG5cdFx0XHRcdHsgdmVyc2lvbjogMiwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQyIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdF07XG5cdFx0XHRkYjIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgVGVzdGFibGVTZXNzaW9uRGF0YWJhc2UuZnJvbURiKHJhd0RiLCB2MikpO1xuXG5cdFx0XHRjb25zdCB0YWJsZXMgPSAoYXdhaXQgZGIyLmdldEFsbFRhYmxlcygpKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhYmxlcywgWyd0MScsICd0MiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvbGxzIGJhY2sgb24gbWlncmF0aW9uIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaWdyYXRpb25zOiBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uW10gPSBbXG5cdFx0XHRcdHsgdmVyc2lvbjogMSwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQxIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdFx0eyB2ZXJzaW9uOiAyLCBzcWw6ICdUSElTIElTIElOVkFMSUQgU1FMJyB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JywgbWlncmF0aW9ucykpO1xuXG5cdFx0XHQvLyBBIGZyZXNoIDptZW1vcnk6IG9wZW4gd2l0aCB2YWxpZCBtaWdyYXRpb25zIHN1Y2NlZWRzXG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonLCBbXG5cdFx0XHRcdHsgdmVyc2lvbjogMSwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQxIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdF0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0QWxsVGFibGVzKCksIFsndDEnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gRmlsZSBlZGl0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdmaWxlIGVkaXRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RvcmUgYW5kIHJldHJpZXZlIGEgZmlsZSBlZGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYmVmb3JlJyksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhZnRlcicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiA1LFxuXHRcdFx0XHRyZW1vdmVkTGluZXM6IDIsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZWRpdHMgPSBhd2FpdCBkYi5nZXRGaWxlRWRpdHMoWyd0Yy0xJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW3tcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2ZpbGUudHMnLFxuXHRcdFx0XHRvcmlnaW5hbFBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdFx0YWRkZWRMaW5lczogNSxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiAyLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0cmlldmUgbXVsdGlwbGUgZWRpdHMgZm9yIGEgc2luZ2xlIHRvb2wgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblxuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zdG9yZUZpbGVFZGl0KHtcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2EudHMnLFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2EtYmVmb3JlJyksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhLWFmdGVyJyksXG5cdFx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYi50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYi1iZWZvcmUnKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2ItYWZ0ZXInKSxcblx0XHRcdFx0YWRkZWRMaW5lczogMSxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiAwLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMSddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzWzBdLmZpbGVQYXRoLCAnL3dvcmtzcGFjZS9hLnRzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdHNbMV0uZmlsZVBhdGgsICcvd29ya3NwYWNlL2IudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHJpZXZlIGVkaXRzIGFjcm9zcyBtdWx0aXBsZSB0b29sIGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBVaW50OEFycmF5KDApLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnaGVsbG8nKSxcblx0XHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0yJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9iLnRzJyxcblx0XHRcdFx0YmVmb3JlQ29udGVudDogbmV3IFVpbnQ4QXJyYXkoMCksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCd3b3JsZCcpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMScsICd0Yy0yJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzLmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIE9ubHkgdGMtMlxuXHRcdFx0Y29uc3QgZWRpdHMyID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMiddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0czIubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0czJbMF0udG9vbENhbGxJZCwgJ3RjLTInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgZm9yIHVua25vd24gdG9vbCBjYWxsIElEcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsnbm9uZXhpc3RlbnQnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGFycmF5IHdoZW4gZ2l2ZW4gZW1wdHkgYXJyYXknIC8qIFJlZ3Jlc3Npb24gdGVzdCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMwNjA1NyAqLywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBhd2FpdCBkYi5nZXRGaWxlRWRpdHMoW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwbGFjZSBvbiBjb25mbGljdCAoc2FtZSB0b29sQ2FsbElkICsgZmlsZVBhdGgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgndjEnKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ3YxLWFmdGVyJyksXG5cdFx0XHRcdGFkZGVkTGluZXM6IDEsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogMCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdFx0YmVmb3JlQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCd2MicpLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgndjItYWZ0ZXInKSxcblx0XHRcdFx0YWRkZWRMaW5lczogMyxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiAxLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMSddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzWzBdLmFkZGVkTGluZXMsIDMpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZGIucmVhZEZpbGVFZGl0Q29udGVudCgndGMtMScsICcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQuYmVmb3JlQ29udGVudCksICd2MicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZEZpbGVFZGl0Q29udGVudCByZXR1cm5zIGNvbnRlbnQgb24gZGVtYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYmVmb3JlJyksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhZnRlcicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBkYi5yZWFkRmlsZUVkaXRDb250ZW50KCd0Yy0xJywgJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZW50LmJlZm9yZUNvbnRlbnQsIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYmVmb3JlJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZW50LmFmdGVyQ29udGVudCwgbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhZnRlcicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRGaWxlRWRpdENvbnRlbnQgcmV0dXJucyB1bmRlZmluZWQgZm9yIG1pc3NpbmcgZWRpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBkYi5yZWFkRmlsZUVkaXRDb250ZW50KCd0Yy1taXNzaW5nJywgJy9uby9zdWNoL2ZpbGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVyc2lzdHMgYmluYXJ5IGNvbnRlbnQgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgYmluYXJ5ID0gbmV3IFVpbnQ4QXJyYXkoWzAsIDEsIDIsIDI1NSwgMTI4LCA2NF0pO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYmluJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9pbWFnZS5wbmcnLFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVWludDhBcnJheSgwKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBiaW5hcnksXG5cdFx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGRiLnJlYWRGaWxlRWRpdENvbnRlbnQoJ3RjLWJpbicsICcvd29ya3NwYWNlL2ltYWdlLnBuZycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZW50LmFmdGVyQ29udGVudCwgYmluYXJ5KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dG8tY3JlYXRlcyB0dXJuIGlmIGl0IGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHQvLyBzdG9yZUZpbGVFZGl0IHNob3VsZCBzdWNjZWVkIGV2ZW4gd2l0aG91dCBhIHByaW9yIGNyZWF0ZVR1cm4gY2FsbFxuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ2F1dG8tdHVybicsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3gnLFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVWludDhBcnJheSgwKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVWludDhBcnJheSgwKSxcblx0XHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IGRiLmdldEZpbGVFZGl0cyhbJ3RjLTEnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0c1swXS50dXJuSWQsICdhdXRvLXR1cm4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBUdXJucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3R1cm5zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY3JlYXRlVHVybiBpcyBpZGVtcG90ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTsgLy8gc2hvdWxkIG5vdCB0aHJvd1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlVHVybiBjYXNjYWRlcyB0byBmaWxlIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYmVmb3JlJyksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhZnRlcicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEVkaXRzIGV4aXN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGRiLmdldEZpbGVFZGl0cyhbJ3RjLTEnXSkpLmxlbmd0aCwgMSk7XG5cblx0XHRcdC8vIERlbGV0ZSB0aGUgdHVybiBcdTIwMTQgZWRpdHMgc2hvdWxkIGJlIGdvbmVcblx0XHRcdGF3YWl0IGRiLmRlbGV0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRGaWxlRWRpdHMoWyd0Yy0xJ10pLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGVUdXJuIG9ubHkgcmVtb3ZlcyBpdHMgb3duIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMicpO1xuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9hLnRzJyxcblx0XHRcdFx0YmVmb3JlQ29udGVudDogbmV3IFVpbnQ4QXJyYXkoMCksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhJyksXG5cdFx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMicsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYi50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBVaW50OEFycmF5KDApLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGRiLmRlbGV0ZVR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGRiLmdldEZpbGVFZGl0cyhbJ3RjLTEnXSksIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMiddKSkubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0ZVR1cm4gaXMgYSBuby1vcCBmb3IgdW5rbm93biB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuZGVsZXRlVHVybignbm9uZXhpc3RlbnQnKTsgLy8gc2hvdWxkIG5vdCB0aHJvd1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFR1cm4gZXZlbnQgaWRzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndHVybiBldmVudCBpZHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdnZXRUdXJuRXZlbnRJZCByZXNvbHZlcyBwcm90b2NvbCBhbmQgcmVzdG9yZWQgU0RLIHR1cm4gSURzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgndHVybi0xJywgJ2V2dC0xJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwcm90b2NvbDogYXdhaXQgZGIuZ2V0VHVybkV2ZW50SWQoJ3R1cm4tMScpLFxuXHRcdFx0XHRyZXN0b3JlZDogYXdhaXQgZGIuZ2V0VHVybkV2ZW50SWQoJ2V2dC0xJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHByb3RvY29sOiAnZXZ0LTEnLFxuXHRcdFx0XHRyZXN0b3JlZDogJ2V2dC0xJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0TmV4dFR1cm5FdmVudElkIHJldHVybnMgdGhlIG5leHQgdHVyblxcJ3MgZXZlbnQgaWQgYnkgYHR1cm5zLmlkYCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0yJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgndHVybi0xJywgJ2V2dC0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgndHVybi0yJywgJ2V2dC0yJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXROZXh0VHVybkV2ZW50SWQoJ3R1cm4tMScpLCAnZXZ0LTInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldE5leHRUdXJuRXZlbnRJZCBmYWxscyBiYWNrIHRvIGBldmVudF9pZGAgd2hlbiB0aGUga2V5IGlzIHRoZSBTREsgZXZlbnQgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTZXNzaW9ucyByZXN0b3JlZCBmcm9tIGRpc2sgc3VyZmFjZSBTREsgZW52ZWxvcGUgaWRzIGFzIHRoZVxuXHRcdFx0Ly8gcHJvdG9jb2wgdHVybiBpZCAoc2VlIG1hcFNlc3Npb25FdmVudHMudHMpLCBidXQgYHR1cm5zLmlkYFxuXHRcdFx0Ly8gd2FzIHBvcHVsYXRlZCBsaXZlIHdpdGggdGhlIGNsaWVudC1zaWRlIGByZXF1ZXN0X3h4eGAgaWQuXG5cdFx0XHQvLyBUaGUgZmFsbGJhY2sgbGV0cyBmb3JrIC8gdHJ1bmNhdGUgcmVzb2x2ZSB0aGUgYm91bmRhcnlcblx0XHRcdC8vIHdpdGhvdXQgZm9yY2luZyBldmVyeSBjYWxsZXIgdG8gdHJhbnNsYXRlLlxuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigncmVxdWVzdF9hYWEnKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3JlcXVlc3RfYmJiJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgncmVxdWVzdF9hYWEnLCAnc2RrLWV2dC0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgncmVxdWVzdF9iYmInLCAnc2RrLWV2dC0yJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXROZXh0VHVybkV2ZW50SWQoJ3Nkay1ldnQtMScpLCAnc2RrLWV2dC0yJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXROZXh0VHVybkV2ZW50SWQgcmV0dXJucyB1bmRlZmluZWQgZm9yIHRoZSBsYXN0IHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCd0dXJuLTEnLCAnZXZ0LTEnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldE5leHRUdXJuRXZlbnRJZCgndHVybi0xJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0TmV4dFR1cm5FdmVudElkKCdldnQtMScpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0TmV4dFR1cm5FdmVudElkIHJldHVybnMgdW5kZWZpbmVkIGZvciBhbiB1bmtub3duIGtleScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ3R1cm4tMScsICdldnQtMScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0TmV4dFR1cm5FdmVudElkKCdkb2VzLW5vdC1leGlzdCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFR1cm4gdXNhZ2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3R1cm4gdXNhZ2UnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdnZXRUdXJuVXNhZ2VzIGluZGV4ZXMgdGhlIGxhc3QgdXNhZ2UgYnkgYm90aCB0dXJuIGlkIGFuZCBTREsgZXZlbnQgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCdyZXF1ZXN0X2FhYScpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigncmVxdWVzdF9iYmInKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCdyZXF1ZXN0X2FhYScsICdzZGstZXZ0LTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgncmVxdWVzdF9hYWEnLCAne1wiaW5wdXRUb2tlbnNcIjoxfScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCdyZXF1ZXN0X2FhYScsICd7XCJpbnB1dFRva2Vuc1wiOjJ9Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLihhd2FpdCBkYi5nZXRUdXJuVXNhZ2VzKCkpLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydyZXF1ZXN0X2FhYScsICd7XCJpbnB1dFRva2Vuc1wiOjJ9J10sXG5cdFx0XHRcdFsnc2RrLWV2dC0xJywgJ3tcImlucHV0VG9rZW5zXCI6Mn0nXSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb3JkcyB1c2FnZSBmb3IgYSB0dXJuIHdpdGggbm8gYHR1cm5zYCByb3csIGNyZWF0aW5nIG9uZSBzbyBpdCBjYW4gYmUgcHJ1bmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQSB0dXJuIGNhbiByZXBvcnQgdXNhZ2Ugd2l0aG91dCBvdGhlcndpc2UgdG91Y2hpbmcgdGhlIERCIChlLmcuIGFcblx0XHRcdC8vIENsYXVkZSB0dXJuIHRoYXQgZWRpdHMgbm8gZmlsZXMpLiBUaGUgcGFyZW50IHJvdyBpcyBjcmVhdGVkIHNvIHRoZVxuXHRcdFx0Ly8gdXNhZ2UgaXMgcmVhY2hhYmxlIGJ5IHRoZSBjYXNjYWRlOyB3aXRob3V0IGl0IHRoZSByb3cgd291bGQgc3Vydml2ZVxuXHRcdFx0Ly8gZXZlcnkgcHJ1bmUgcGF0aCBhbmQgdGhlIHRhYmxlIHdvdWxkIGdyb3cgZm9yIHRoZSBsaWZlIG9mIHRoZVxuXHRcdFx0Ly8gc2Vzc2lvbi4gQ3JlYXRpbmcgaXQgY2Fubm90IGRpc3R1cmIgdGhlIHR1cm4gb3JkZXJpbmcgdGhhdFxuXHRcdFx0Ly8gYGdldE5leHRUdXJuRXZlbnRJZGAgLyBjaGVja3BvaW50IHJlc29sdXRpb24gcmVseSBvbiwgYmVjYXVzZSBhXG5cdFx0XHQvLyB0dXJuJ3MgdXNhZ2UgaXMgYWx3YXlzIHJlcG9ydGVkIGJlZm9yZSB0aGUgbmV4dCB0dXJuIGJlZ2lucy5cblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ3R1cm4tMScsICdldnQtMScpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0yJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgndHVybi0yJywgJ2V2dC0yJyk7XG5cblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgndXNhZ2Utb25seS10dXJuJywgJ3tcImlucHV0VG9rZW5zXCI6OX0nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHVzYWdlOiAoYXdhaXQgZGIuZ2V0VHVyblVzYWdlcygpKS5nZXQoJ3VzYWdlLW9ubHktdHVybicpLFxuXHRcdFx0XHQvLyBPcmRlcmluZyBpcyB1bnRvdWNoZWQ6IHR1cm4tMSdzIHN1Y2Nlc3NvciBpcyBzdGlsbCB0dXJuLTIuXG5cdFx0XHRcdG5leHQ6IGF3YWl0IGRiLmdldE5leHRUdXJuRXZlbnRJZCgndHVybi0xJyksXG5cdFx0XHRcdGZpcnN0OiBhd2FpdCBkYi5nZXRGaXJzdFR1cm5FdmVudElkKCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHVzYWdlOiAne1wiaW5wdXRUb2tlbnNcIjo5fScsXG5cdFx0XHRcdG5leHQ6ICdldnQtMicsXG5cdFx0XHRcdGZpcnN0OiAnZXZ0LTEnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVuY2F0aW9uIHBydW5lcyB1c2FnZSBmb3IgdHVybnMgdGhhdCBoYXZlIG5vIG90aGVyIERCIHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgdW5ib3VuZGVkLWdyb3d0aCBjYXNlOiB0dXJucyB3aG9zZSBvbmx5IERCIGZvb3RwcmludCBpcyB0aGVpclxuXHRcdFx0Ly8gdXNhZ2Ugcm93LiBUaGV5IG11c3QgYmUgcHJ1bmVkIGJ5IGEgcmV3aW5kIGxpa2UgYW55IG90aGVyIHR1cm4uXG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgndHVybi0xJywgJ3tcImlucHV0VG9rZW5zXCI6MX0nKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgndXNhZ2Utb25seS0yJywgJ3tcImlucHV0VG9rZW5zXCI6Mn0nKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgndXNhZ2Utb25seS0zJywgJ3tcImlucHV0VG9rZW5zXCI6M30nKTtcblxuXHRcdFx0YXdhaXQgZGIuZGVsZXRlVHVybnNBZnRlcigndHVybi0xJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLihhd2FpdCBkYi5nZXRUdXJuVXNhZ2VzKCkpLmVudHJpZXMoKV0sIFtbJ3R1cm4tMScsICd7XCJpbnB1dFRva2Vuc1wiOjF9J11dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0aW5nIGEgc2Vzc2lvblxcJ3MgdHVybnMgbGVhdmVzIG5vIHVzYWdlIGJlaGluZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgndXNhZ2Utb25seS0xJywgJ3tcImlucHV0VG9rZW5zXCI6MX0nKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgndXNhZ2Utb25seS0yJywgJ3tcImlucHV0VG9rZW5zXCI6Mn0nKTtcblxuXHRcdFx0YXdhaXQgZGIuZGVsZXRlQWxsVHVybnMoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uKGF3YWl0IGRiLmdldFR1cm5Vc2FnZXMoKSkuZW50cmllcygpXSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZHMgc2VlIGEgZmlyZS1hbmQtZm9yZ2V0IHdyaXRlIHN1Ym1pdHRlZCBiZWZvcmUgdGhlbScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIGBzZXRUdXJuVXNhZ2VgIGlzIGRlbGliZXJhdGVseSBmaXJlLWFuZC1mb3JnZXQgYW5kIHNxbGl0ZTMgcnVucyBwYXJhbGxlbGl6ZWQsIHNvIHRoZVxuXHRcdFx0Ly8gcmVzdG9yZSByZWFkIG11c3QgcXVldWUgYmVoaW5kIHByaW9yIHdyaXRlcy4gV2l0aG91dCB0aGF0IG9yZGVyaW5nIGEgcmVjb25uZWN0IGNhblxuXHRcdFx0Ly8gcmVhZCBmaXJzdCBhbmQgcGVybWFuZW50bHkgcmVidWlsZCB0aGUgdHVybiB3aXRob3V0IGl0cyBjb3N0LlxuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IHdyaXRlID0gZGIuc2V0VHVyblVzYWdlKCd0dXJuLTEnLCAne1wiaW5wdXRUb2tlbnNcIjo3fScpO1xuXHRcdFx0Y29uc3QgdXNhZ2VzID0gYXdhaXQgZGIuZ2V0VHVyblVzYWdlcygpO1xuXHRcdFx0YXdhaXQgd3JpdGU7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnVzYWdlcy5lbnRyaWVzKCldLCBbWyd0dXJuLTEnLCAne1wiaW5wdXRUb2tlbnNcIjo3fSddXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVuY2F0aW9uIHBydW5lcyB0aGUgdXNhZ2Ugb2YgcmVtb3ZlZCB0dXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0yJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuVXNhZ2UoJ3R1cm4tMScsICd7XCJpbnB1dFRva2Vuc1wiOjF9Jyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuVXNhZ2UoJ3R1cm4tMicsICd7XCJpbnB1dFRva2Vuc1wiOjJ9Jyk7XG5cblx0XHRcdGF3YWl0IGRiLmRlbGV0ZVR1cm5zQWZ0ZXIoJ3R1cm4tMScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi4oYXdhaXQgZGIuZ2V0VHVyblVzYWdlcygpKS5lbnRyaWVzKCldLCBbWyd0dXJuLTEnLCAne1wiaW5wdXRUb2tlbnNcIjoxfSddXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1hcFR1cm5JZHMgY2FycmllcyB1c2FnZSBhbmQgcmVwbGFjZXMgZXZlbnQgSURzIG9uIGltcG9ydGVkIGZvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRm9yayBmaWxlLWNvcGllcyB0aGUgc291cmNlIGRhdGFiYXNlIHRoZW4gcmVtYXBzIHR1cm4gaWRzLiBXaXRob3V0XG5cdFx0XHQvLyByZW1hcHBpbmcgYHR1cm5fdXNhZ2VgIHRoZSBmb3JrZWQgc2Vzc2lvbiByZXN0b3JlcyB3aXRoIG5vIGdhdWdlXG5cdFx0XHQvLyBhbmQgemVybyBjb3N0LCBhbmQgcm93cyBwYXN0IHRoZSBmb3JrIHBvaW50IGxlYWsgcGVybWFuZW50bHlcblx0XHRcdC8vIChldmVyeSBwcnVuZSBwYXRoIGpvaW5zIHRocm91Z2ggYHR1cm5zYCkuXG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCdvbGQtMScpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybignb2xkLTInKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCdvbGQtMScsICdvbGQtZXZlbnQtMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ29sZC0yJywgJ29sZC1ldmVudC0yJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuVXNhZ2UoJ29sZC0xJywgJ3tcImlucHV0VG9rZW5zXCI6MX0nKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgnb2xkLTInLCAne1wiaW5wdXRUb2tlbnNcIjoyfScpO1xuXG5cdFx0XHQvLyBGb3JrIGtlZXBpbmcgb25seSBgb2xkLTFgLCByZW1hcHBlZCB0byBhIGZyZXNoIGlkLlxuXHRcdFx0YXdhaXQgZGIucmVtYXBUdXJuSWRzKFxuXHRcdFx0XHRuZXcgTWFwKFtbJ29sZC0xJywgJ25ldy0xJ11dKSxcblx0XHRcdFx0bmV3IE1hcChbWyduZXctMScsICduZXctZXZlbnQtMSddXSksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dXNhZ2VzOiBbLi4uKGF3YWl0IGRiLmdldFR1cm5Vc2FnZXMoKSkuZW50cmllcygpXSxcblx0XHRcdFx0ZXZlbnRJZDogYXdhaXQgZGIuZ2V0VHVybkV2ZW50SWQoJ25ldy0xJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHVzYWdlczogW1xuXHRcdFx0XHRcdFsnbmV3LTEnLCAne1wiaW5wdXRUb2tlbnNcIjoxfSddLFxuXHRcdFx0XHRcdFsnbmV3LWV2ZW50LTEnLCAne1wiaW5wdXRUb2tlbnNcIjoxfSddLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRldmVudElkOiAnbmV3LWV2ZW50LTEnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gVHVybiBjaGVja3BvaW50IHJlZnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCd0dXJuIGNoZWNrcG9pbnQgcmVmcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2dldFR1cm5DaGVja3BvaW50UmVmIGZhbGxzIGJhY2sgdG8gYGV2ZW50X2lkYCB3aGVuIHRoZSBrZXkgaXMgdGhlIFNESyBldmVudCBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3JlcXVlc3RfYWFhJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgncmVxdWVzdF9hYWEnLCAnc2RrLWV2dC0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuQ2hlY2twb2ludFJlZigncmVxdWVzdF9hYWEnLCAncmVmLTEnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldFR1cm5DaGVja3BvaW50UmVmKCdzZGstZXZ0LTEnKSwgJ3JlZi0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRQcmV2aW91c0NoZWNrcG9pbnRSZWYgZmFsbHMgYmFjayB0byBgZXZlbnRfaWRgIHdoZW4gdGhlIGtleSBpcyB0aGUgU0RLIGV2ZW50IGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigncmVxdWVzdF9hYWEnKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3JlcXVlc3RfYmJiJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgncmVxdWVzdF9hYWEnLCAnc2RrLWV2dC0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgncmVxdWVzdF9iYmInLCAnc2RrLWV2dC0yJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuQ2hlY2twb2ludFJlZigncmVxdWVzdF9hYWEnLCAncmVmLTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5DaGVja3BvaW50UmVmKCdyZXF1ZXN0X2JiYicsICdyZWYtMicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0UHJldmlvdXNDaGVja3BvaW50UmVmKCdzZGstZXZ0LTInKSwgJ3JlZi0xJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gRGlzcG9zZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdkaXNwb3NlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbWV0aG9kcyB0aHJvdyBhZnRlciBkaXNwb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKTtcblx0XHRcdGRiLmNsb3NlKCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBkYiEuY3JlYXRlVHVybigndHVybi0xJyksXG5cdFx0XHRcdC9kaXNwb3NlZC8sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlIGRpc3Bvc2UgaXMgc2FmZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6Jyk7XG5cdFx0XHRhd2FpdCBkYi5jbG9zZSgpO1xuXHRcdFx0YXdhaXQgZGIuY2xvc2UoKTsgLy8gc2hvdWxkIG5vdCB0aHJvd1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIExhenkgb3BlbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnbGF6eSBvcGVuJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY29uc3RydWN0b3IgZG9lcyBub3Qgb3BlbiB0aGUgZGF0YWJhc2UnLCAoKSA9PiB7XG5cdFx0XHRkYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZGIpO1xuXHRcdFx0Ly8gTm8gZXJyb3IgXHUyMDE0IHRoZSBkYXRhYmFzZSBpcyBub3Qgb3BlbmVkIHVudGlsIGZpcnN0IHVzZVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlyc3QgYXN5bmMgY2FsbCBvcGVucyBhbmQgbWlncmF0ZXMgdGhlIGRhdGFiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25EYXRhYmFzZSgnOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsnbm9uZXhpc3RlbnQnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBjb25jdXJyZW50IGNhbGxzIHNoYXJlIHRoZSBzYW1lIG9wZW4gcHJvbWlzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6JykpO1xuXHRcdFx0Ly8gRmlyZSBtdWx0aXBsZSBjYWxscyBjb25jdXJyZW50bHkgXHUyMDE0IGFsbCBzaG91bGQgc3VjY2VlZFxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKSxcblx0XHRcdFx0ZGIuY3JlYXRlVHVybigndHVybi0yJyksXG5cdFx0XHRcdGRiLmdldEZpbGVFZGl0cyhbXSksXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2UgZHVyaW5nIG9wZW4gcmVqZWN0cyBzdWJzZXF1ZW50IGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBuZXcgU2Vzc2lvbkRhdGFiYXNlKCc6bWVtb3J5OicpO1xuXHRcdFx0YXdhaXQgZGIuY2xvc2UoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGRiIS5jcmVhdGVUdXJuKCd0dXJuLTEnKSwgL2Rpc3Bvc2VkLyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiBtZXRhZGF0YSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdzZXNzaW9uIG1ldGFkYXRhJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZ2V0TWV0YWRhdGEgcmV0dXJucyB1bmRlZmluZWQgZm9yIG1pc3Npbmcga2V5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldE1ldGFkYXRhKCdub25leGlzdGVudCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0TWV0YWRhdGEgYW5kIGdldE1ldGFkYXRhIHJvdW5kLXRyaXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5zZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnLCAnTXkgU2Vzc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLCAnTXkgU2Vzc2lvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0TWV0YWRhdGEgb3ZlcndyaXRlcyBleGlzdGluZyB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLnNldE1ldGFkYXRhKCdjdXN0b21UaXRsZScsICdGaXJzdCcpO1xuXHRcdFx0YXdhaXQgZGIuc2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJywgJ1NlY29uZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjdXN0b21UaXRsZScpLCAnU2Vjb25kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRNZXRhZGF0YVZhbHVlcyByb2xscyBiYWNrIGV2ZXJ5IGtleSB3aGVuIG9uZSB3cml0ZSBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRhdGFiYXNlID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFRlc3RhYmxlU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0ZGIgPSBkYXRhYmFzZTtcblx0XHRcdGF3YWl0IGRhdGFiYXNlLnNldE1ldGFkYXRhKCdjdXN0b21UaXRsZScsICdPcmlnaW5hbCB0aXRsZScpO1xuXHRcdFx0YXdhaXQgZGF0YWJhc2Uuc2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlU291cmNlJywgJ3VzZXInKTtcblx0XHRcdGF3YWl0IGRhdGFiYXNlLnJ1blJhdyhgQ1JFQVRFIFRSSUdHRVIgZmFpbF90aXRsZV9zb3VyY2UgQkVGT1JFIElOU0VSVCBPTiBzZXNzaW9uX21ldGFkYXRhXG5cdFx0XHRcdFdIRU4gTkVXLmtleSA9ICdjdXN0b21UaXRsZVNvdXJjZScgQkVHSU4gU0VMRUNUIFJBSVNFKEFCT1JULCAnc291cmNlIHdyaXRlIGZhaWxlZCcpOyBFTkRgKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gZGF0YWJhc2Uuc2V0TWV0YWRhdGFWYWx1ZXMoe1xuXHRcdFx0XHRjdXN0b21UaXRsZTogJ1JlcGxhY2VtZW50IHRpdGxlJyxcblx0XHRcdFx0Y3VzdG9tVGl0bGVTb3VyY2U6ICdhZ2VudCcsXG5cdFx0XHR9KSwgL3NvdXJjZSB3cml0ZSBmYWlsZWQvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBkYXRhYmFzZS5nZXRNZXRhZGF0YU9iamVjdCh7XG5cdFx0XHRcdGN1c3RvbVRpdGxlOiB0cnVlLFxuXHRcdFx0XHRjdXN0b21UaXRsZVNvdXJjZTogdHJ1ZSxcblx0XHRcdH0pLCB7XG5cdFx0XHRcdGN1c3RvbVRpdGxlOiAnT3JpZ2luYWwgdGl0bGUnLFxuXHRcdFx0XHRjdXN0b21UaXRsZVNvdXJjZTogJ3VzZXInLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRNZXRhZGF0YVZhbHVlcyBzZXJpYWxpemVzIHdpdGggdHVybiBJRCByZW1hcHBpbmcgdHJhbnNhY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybignb2xkLTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgnb2xkLTEnLCAne1wiaW5wdXRUb2tlbnNcIjoxfScpO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdGRiLnNldE1ldGFkYXRhVmFsdWVzKHtcblx0XHRcdFx0XHRjdXN0b21UaXRsZTogJ0NvbmN1cnJlbnQgdGl0bGUnLFxuXHRcdFx0XHRcdGN1c3RvbVRpdGxlU291cmNlOiAnYWdlbnQnLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0ZGIucmVtYXBUdXJuSWRzKG5ldyBNYXAoW1snb2xkLTEnLCAnbmV3LTEnXV0pKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bWV0YWRhdGE6IGF3YWl0IGRiLmdldE1ldGFkYXRhT2JqZWN0KHsgY3VzdG9tVGl0bGU6IHRydWUsIGN1c3RvbVRpdGxlU291cmNlOiB0cnVlIH0pLFxuXHRcdFx0XHR1c2FnZXM6IFsuLi4oYXdhaXQgZGIuZ2V0VHVyblVzYWdlcygpKS5lbnRyaWVzKCldLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtZXRhZGF0YTogeyBjdXN0b21UaXRsZTogJ0NvbmN1cnJlbnQgdGl0bGUnLCBjdXN0b21UaXRsZVNvdXJjZTogJ2FnZW50JyB9LFxuXHRcdFx0XHR1c2FnZXM6IFtbJ25ldy0xJywgJ3tcImlucHV0VG9rZW5zXCI6MX0nXV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21ldGFkYXRhIHBlcnNpc3RzIGFjcm9zcyByZW9wZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYjEgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgVGVzdGFibGVTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYjEuc2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJywgJ1BlcnNpc3RlbnQgVGl0bGUnKTtcblx0XHRcdGNvbnN0IHJhd0RiID0gYXdhaXQgZGIxLmVqZWN0RGIoKTtcblxuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgVGVzdGFibGVTZXNzaW9uRGF0YWJhc2UuZnJvbURiKHJhd0RiKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksICdQZXJzaXN0ZW50IFRpdGxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRpb24gdjIgY3JlYXRlcyBzZXNzaW9uX21ldGFkYXRhIHRhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgdGFibGVzID0gYXdhaXQgZGIuZ2V0QWxsVGFibGVzKCk7XG5cdFx0XHRhc3NlcnQub2sodGFibGVzLmluY2x1ZGVzKCdzZXNzaW9uX21ldGFkYXRhJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2hhdCBkcmFmdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZSgnYWhwLWNoYXQ6Ly9kZWZhdWx0L1kyOXdhV3h2ZERvdkx5OXpaWE56YVc5dUxURScpO1xuXG5cdFx0dGVzdCgnc2V0Q2hhdERyYWZ0IGFuZCBnZXRDaGF0RHJhZnQgcm91bmQtdHJpcCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IGRyYWZ0ID0ge1xuXHRcdFx0XHR0ZXh0OiAnZHJhZnQnLFxuXHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRtb2RlbDogeyBpZDogJ29wdXMnIH0sXG5cdFx0XHRcdGFnZW50OiB7IHVyaTogJ2FnZW50Oi8vcmV2aWV3ZXInIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBkYi5zZXRDaGF0RHJhZnQoY2hhdCwgZHJhZnQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGRiLmdldENoYXREcmFmdChjaGF0KSwgZHJhZnQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0Q2hhdERyYWZ0IHVuZGVmaW5lZCBjbGVhcnMgYSBkcmFmdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IGRyYWZ0ID0geyB0ZXh0OiAnZHJhZnQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH07XG5cblx0XHRcdGF3YWl0IGRiLnNldENoYXREcmFmdChjaGF0LCBkcmFmdCk7XG5cdFx0XHRhd2FpdCBkYi5zZXRDaGF0RHJhZnQoY2hhdCwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldENoYXREcmFmdChjaGF0KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldENoYXREcmFmdCByZXR1cm5zIHVuZGVmaW5lZCBmb3IgY29ycnVwdCBkcmFmdCByb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdERiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFRlc3RhYmxlU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0ZGIgPSB0ZXN0RGI7XG5cblx0XHRcdGF3YWl0IHRlc3REYi5zZXRSYXdDaGF0RHJhZnQoY2hhdCwgJ3snKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldENoYXREcmFmdChjaGF0KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZ3JhdGlvbiB2NiBjcmVhdGVzIGNoYXQgZHJhZnQgdGFibGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgdGFibGVzID0gYXdhaXQgZGIuZ2V0QWxsVGFibGVzKCk7XG5cdFx0XHRhc3NlcnQub2sodGFibGVzLmluY2x1ZGVzKCdjaGF0X2RyYWZ0cycpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSByZXZpZXdlZCBmaWxlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3Jldmlld2VkIGZpbGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaUEgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL2EudHMnKTtcblx0XHRjb25zdCB1cmlCID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS9iLnRzJyk7XG5cblx0XHRjb25zdCBub3JtYWxpemUgPSAocmVjb3JkczogcmVhZG9ubHkgSVJldmlld2VkRmlsZVJlY29yZFtdKSA9PiByZWNvcmRzLm1hcChyID0+ICh7IHVyaTogci51cmkudG9TdHJpbmcoKSwgbm9uY2U6IHIubm9uY2UgfSkpO1xuXG5cdFx0dGVzdCgnbWFya0ZpbGVSZXZpZXdlZCBhbmQgaXNGaWxlUmV2aWV3ZWQgZGlzY3JpbWluYXRlIGJ5IHVyaSBhbmQgbm9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cblx0XHRcdGF3YWl0IGRiLm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRkYi5pc0ZpbGVSZXZpZXdlZCh1cmlBLCAnbjEnKSxcblx0XHRcdFx0XHRkYi5pc0ZpbGVSZXZpZXdlZCh1cmlBLCAnbjInKSxcblx0XHRcdFx0XHRkYi5pc0ZpbGVSZXZpZXdlZCh1cmlCLCAnbjEnKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdFt0cnVlLCBmYWxzZSwgZmFsc2VdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFJldmlld2VkRmlsZXMgcmV0dXJucyBhbGwgZW50cmllcyBpbiBpbnNlcnRpb24gb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cblx0XHRcdGF3YWl0IGRiLm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyk7XG5cdFx0XHRhd2FpdCBkYi5tYXJrRmlsZVJldmlld2VkKHVyaUIsICduMicpO1xuXHRcdFx0YXdhaXQgZGIubWFya0ZpbGVSZXZpZXdlZCh1cmlBLCAnbjMnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub3JtYWxpemUoYXdhaXQgZGIuZ2V0UmV2aWV3ZWRGaWxlcygpKSwgW1xuXHRcdFx0XHR7IHVyaTogdXJpQS50b1N0cmluZygpLCBub25jZTogJ24xJyB9LFxuXHRcdFx0XHR7IHVyaTogdXJpQi50b1N0cmluZygpLCBub25jZTogJ24yJyB9LFxuXHRcdFx0XHR7IHVyaTogdXJpQS50b1N0cmluZygpLCBub25jZTogJ24zJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRSZXZpZXdlZEZpbGVzRm9yVXJpIHJldHVybnMgb25seSB0aGUgZ2l2ZW4gdXJpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5tYXJrRmlsZVJldmlld2VkKHVyaUEsICduMScpO1xuXHRcdFx0YXdhaXQgZGIubWFya0ZpbGVSZXZpZXdlZCh1cmlCLCAnbjInKTtcblx0XHRcdGF3YWl0IGRiLm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24zJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9ybWFsaXplKGF3YWl0IGRiLmdldFJldmlld2VkRmlsZXNGb3JVcmkodXJpQSkpLCBbXG5cdFx0XHRcdHsgdXJpOiB1cmlBLnRvU3RyaW5nKCksIG5vbmNlOiAnbjEnIH0sXG5cdFx0XHRcdHsgdXJpOiB1cmlBLnRvU3RyaW5nKCksIG5vbmNlOiAnbjMnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VubWFya0ZpbGVSZXZpZXdlZCByZW1vdmVzIGFuIGVudHJ5IGFuZCBpcyBhIG5vLW9wIHdoZW4gYWJzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5tYXJrRmlsZVJldmlld2VkKHVyaUEsICduMScpO1xuXHRcdFx0YXdhaXQgZGIudW5tYXJrRmlsZVJldmlld2VkKHVyaUEsICduMScpO1xuXHRcdFx0YXdhaXQgZGIudW5tYXJrRmlsZVJldmlld2VkKHVyaUEsICduMScpOyAvLyBuby1vcCwgbXVzdCBub3QgdGhyb3dcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2RiLmlzRmlsZVJldmlld2VkKHVyaUEsICduMScpLCBkYi5nZXRSZXZpZXdlZEZpbGVzKCldKSxcblx0XHRcdFx0W2ZhbHNlLCBbXV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya2luZyB0aGUgc2FtZSAodXJpLCBub25jZSkgdHdpY2Uga2VlcHMgYSBzaW5nbGUgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cblx0XHRcdGF3YWl0IGRiLm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyk7XG5cdFx0XHRhd2FpdCBkYi5tYXJrRmlsZVJldmlld2VkKHVyaUEsICduMScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vcm1hbGl6ZShhd2FpdCBkYi5nZXRSZXZpZXdlZEZpbGVzKCkpLCBbeyB1cmk6IHVyaUEudG9TdHJpbmcoKSwgbm9uY2U6ICduMScgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWlncmF0aW9uIHY3IGNyZWF0ZXMgdGhlIHJldmlld2VkX2ZpbGVzIHRhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgdGFibGVzID0gYXdhaXQgZGIuZ2V0QWxsVGFibGVzKCk7XG5cdFx0XHRhc3NlcnQub2sodGFibGVzLmluY2x1ZGVzKCdyZXZpZXdlZF9maWxlcycpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSB2YWN1dW1JbnRvIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3ZhY3V1bUludG8nLCAoKSA9PiB7XG5cblx0XHRsZXQgdG1wRGlyOiBzdHJpbmc7XG5cblx0XHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0XHR0bXBEaXIgPSBhd2FpdCBmcy5ta2R0ZW1wKGpvaW4odG1wZGlyKCksICdzZXNzaW9uLWRiLXRlc3QtJyArIGdlbmVyYXRlVXVpZCgpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbZGI/LmNsb3NlKCksIGRiMj8uY2xvc2UoKV0pO1xuXHRcdFx0ZGIgPSBkYjIgPSB1bmRlZmluZWQ7XG5cdFx0XHRhd2FpdCBmcy5ybSh0bXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2R1Y2VzIGEgY29weSB3aXRoIHRoZSBzYW1lIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCd0dXJuLTEnLCAnZXZ0LTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldE1ldGFkYXRhKCdrZXknLCAndmFsdWUnKTtcblxuXHRcdFx0Y29uc3QgdGFyZ2V0UGF0aCA9IGpvaW4odG1wRGlyLCAnY29weS5kYicpO1xuXHRcdFx0YXdhaXQgZGIudmFjdXVtSW50byh0YXJnZXRQYXRoKTtcblxuXHRcdFx0ZGIyID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKHRhcmdldFBhdGgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYjIuZ2V0VHVybkV2ZW50SWQoJ3R1cm4tMScpLCAnZXZ0LTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYjIuZ2V0TWV0YWRhdGEoJ2tleScpLCAndmFsdWUnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGNBQWM7QUFDdkIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLGVBQWUsaUNBQWlFO0FBQzFHLFNBQVMsY0FBYyxtQkFBbUI7QUFHMUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUVwQixNQUFNLG1CQUFtQixNQUFNO0FBRTlCLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxNQUFJO0FBQ0osTUFBSTtBQUVKLFdBQVMsWUFBWTtBQUNwQixnQkFBWSxNQUFNO0FBQ2xCLFVBQU0sUUFBUSxJQUFJLENBQUMsSUFBSSxNQUFNLEdBQUcsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUFBLEVBQzlDLENBQUM7QUFDRCwwQ0FBd0M7QUFFeEMsUUFBTSxrQkFBa0IsTUFBTTtBQUU3QixTQUFLLG9EQUFvRCxZQUFZO0FBQ3BFLFlBQU0sV0FBVyxNQUFNLEdBQUcsUUFBUSxLQUFLLE9BQU8sR0FBRyxzQkFBc0IsYUFBYSxDQUFDLENBQUM7QUFDdEYsVUFBSTtBQUNILGNBQU0sY0FBYyxLQUFLLFVBQVUsU0FBUztBQUM1QyxjQUFNLGVBQWUsS0FBSyxhQUFhLFlBQVk7QUFDbkQsY0FBTSxHQUFHLFVBQVUsYUFBYSxFQUFFO0FBQ2xDLGNBQU0sV0FBVyxJQUFJLGdCQUFnQixZQUFZO0FBQ2pELFlBQUk7QUFDSCxnQkFBTSxPQUFPLFFBQVEsTUFBTSxTQUFTLFlBQVksT0FBTyxPQUFPLEdBQUcsRUFBRSxNQUFNLFNBQVMsQ0FBQztBQUNuRixnQkFBTSxHQUFHLEdBQUcsV0FBVztBQUV2QixnQkFBTSxTQUFTLFlBQVksT0FBTyxRQUFRO0FBRTFDLGlCQUFPLFlBQVksTUFBTSxT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
