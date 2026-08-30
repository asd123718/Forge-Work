import * as fs from "fs";
import { Sequencer, SequencerByKey } from "../../../base/common/async.js";
import { dirname } from "../../../base/common/path.js";
import { URI } from "../../../base/common/uri.js";
const sessionDatabaseMigrations = [
  {
    version: 1,
    sql: [
      `CREATE TABLE IF NOT EXISTS turns (
				id TEXT PRIMARY KEY NOT NULL
			)`,
      `CREATE TABLE IF NOT EXISTS file_edits (
				turn_id        TEXT    NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
				tool_call_id   TEXT    NOT NULL,
				file_path      TEXT    NOT NULL,
				before_content BLOB   NOT NULL,
				after_content  BLOB   NOT NULL,
				added_lines    INTEGER,
				removed_lines  INTEGER,
				PRIMARY KEY (tool_call_id, file_path)
			)`
    ].join(";\n")
  },
  {
    version: 2,
    sql: `CREATE TABLE IF NOT EXISTS session_metadata (
			key   TEXT PRIMARY KEY NOT NULL,
			value TEXT NOT NULL
		)`
  },
  {
    version: 3,
    sql: [
      // Recreate file_edits with new columns: edit_type, original_path,
      // and nullable before_content/after_content.
      `CREATE TABLE file_edits_v3 (
				turn_id        TEXT    NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
				tool_call_id   TEXT    NOT NULL,
				file_path      TEXT    NOT NULL,
				edit_type      TEXT    NOT NULL DEFAULT 'edit',
				original_path  TEXT,
				before_content BLOB,
				after_content  BLOB,
				added_lines    INTEGER,
				removed_lines  INTEGER,
				PRIMARY KEY (tool_call_id, file_path)
			)`,
      `INSERT INTO file_edits_v3 (turn_id, tool_call_id, file_path, edit_type, before_content, after_content, added_lines, removed_lines)
				SELECT turn_id, tool_call_id, file_path, 'edit', before_content, after_content, added_lines, removed_lines FROM file_edits`,
      `DROP TABLE file_edits`,
      `ALTER TABLE file_edits_v3 RENAME TO file_edits`
    ].join(";\n")
  },
  {
    version: 4,
    sql: [
      `ALTER TABLE turns ADD COLUMN event_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_turns_event_id ON turns(event_id)`
    ].join(";\n")
  },
  {
    version: 5,
    sql: `ALTER TABLE turns ADD COLUMN checkpoint_ref TEXT`
  },
  {
    version: 6,
    sql: `CREATE TABLE IF NOT EXISTS chat_drafts (
			chat_uri TEXT PRIMARY KEY NOT NULL,
			draft    TEXT NOT NULL
		)`
  },
  {
    version: 7,
    sql: `CREATE TABLE IF NOT EXISTS reviewed_files (
			uri   TEXT NOT NULL,
			nonce TEXT NOT NULL,
			PRIMARY KEY (uri, nonce)
		)`
  },
  {
    version: 8,
    sql: `CREATE TABLE IF NOT EXISTS local_turns (
			turn_id        TEXT PRIMARY KEY NOT NULL,
			chat_uri       TEXT NOT NULL,
			anchor_turn_id TEXT,
			seq            INTEGER NOT NULL,
			payload        TEXT NOT NULL
		)`
  },
  {
    version: 9,
    // `turn_usage` is a child of `turns` so every prune path (`deleteTurn`,
    // `truncateFromTurn`, `deleteTurnsAfter`, `deleteAllTurns`, and the fork
    // remap) reaches it by cascade and the table cannot grow unbounded.
    //
    // The foreign key forces `setTurnUsage` to `INSERT OR IGNORE` a parent row,
    // and rows created that way carry `event_id IS NULL`. That is safe here:
    // `getFirstTurnEventId` / `getNextTurnEventId` scan by rowid and are read
    // only by the Copilot agent (Claude resolves fork/truncate boundaries from
    // its own persisted mapping), and in a Copilot database `setTurnEventId`
    // runs on `user.message` — before any usage is reported — so the parent row
    // already exists and the insert is a no-op. Were usage ever to land first,
    // `setTurnEventId` fills the existing row in (`UPDATE … WHERE event_id IS
    // NULL`) and the position is still correct, since a turn's usage precedes
    // the next turn. Each peer chat gets its own database (see
    // `SessionDataService`), so a peer turn cannot interleave with another
    // chat's turns either.
    sql: `CREATE TABLE IF NOT EXISTS turn_usage (
			turn_id TEXT PRIMARY KEY NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
			usage   TEXT NOT NULL
		)`
  }
];
function dbExec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => err ? reject(err) : resolve());
  });
}
function dbRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        return reject(err);
      }
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
function dbGet(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
}
function dbAll(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}
function dbClose(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => err ? reject(err) : resolve());
  });
}
function dbOpen(path) {
  return new Promise((resolve, reject) => {
    import("@vscode/sqlite3").then((sqlite3) => {
      const db = new sqlite3.default.Database(path, (err) => {
        if (err) {
          return reject(err);
        }
        resolve(db);
      });
    }, reject);
  });
}
async function runMigrations(db, migrations) {
  await dbExec(db, "PRAGMA foreign_keys = ON");
  const row = await dbGet(db, "PRAGMA user_version", []);
  const currentVersion = row?.user_version ?? 0;
  const pending = migrations.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);
  if (pending.length === 0) {
    return;
  }
  await dbExec(db, "BEGIN TRANSACTION");
  try {
    for (const migration of pending) {
      await dbExec(db, migration.sql);
      await dbExec(db, `PRAGMA user_version = ${migration.version}`);
    }
    await dbExec(db, "COMMIT");
  } catch (err) {
    await dbExec(db, "ROLLBACK");
    throw err;
  }
}
class SessionDatabase {
  constructor(_path, _migrations = sessionDatabaseMigrations) {
    this._path = _path;
    this._migrations = _migrations;
    this._fileEditSequencer = new SequencerByKey();
    this._metadataSequencer = new Sequencer();
    this._transactionSequencer = new Sequencer();
    /**
     * Serializes every `turn_usage` access — writes, prunes, the fork remap, and the restore read
     * alike. `@vscode/sqlite3` runs in parallelized mode (see {@link _metadataSequencer}), so a
     * fire-and-forget `setTurnUsage` submitted before a truncation can otherwise complete *after*
     * it and resurrect a row the truncation was meant to remove, and a read can otherwise overtake
     * a write it was submitted after. Mutations must go through {@link _mutateTurnUsage} rather
     * than queueing on this directly, so they are tracked for {@link whenIdle}.
     */
    this._turnUsageSequencer = new Sequencer();
    /**
     * In-flight write operations. Tracked so {@link whenIdle} can await them
     * before the process exits — without this, a `SIGTERM` arriving between
     * a fire-and-forget mutating call (e.g. `setMetadata`) being invoked and
     * its underlying SQLite query completing would silently drop the write.
     * Every public mutating method routes its returned promise through
     * {@link _track}; reads (`getMetadata`, `getFileEdits`, ...) skip
     * tracking since shutdown does not need to wait for them.
     */
    this._pendingWrites = /* @__PURE__ */ new Set();
  }
  /**
   * Runs a mutation that touches `turn_usage`, tracked for {@link whenIdle}
   * and serialized against every other such mutation.
   */
  _mutateTurnUsage(operation) {
    return this._track(() => this._turnUsageSequencer.queue(async () => operation(await this._ensureDb())));
  }
  /**
   * Opens (or creates) a SQLite database at {@link path} and applies
   * any pending migrations. Only used in tests where synchronous
   * construction + immediate readiness is desired.
   */
  static async open(path, migrations = sessionDatabaseMigrations) {
    const inst = new SessionDatabase(path, migrations);
    await inst._ensureDb();
    return inst;
  }
  _ensureDb() {
    if (this._closed) {
      return Promise.reject(new Error("SessionDatabase has been disposed"));
    }
    if (!this._dbPromise) {
      this._dbPromise = (async () => {
        await fs.promises.mkdir(dirname(this._path), { recursive: true });
        const db = await dbOpen(this._path);
        try {
          await runMigrations(db, this._migrations);
        } catch (err) {
          await dbClose(db);
          this._dbPromise = void 0;
          throw err;
        }
        if (this._closed) {
          await dbClose(db);
          throw new Error("SessionDatabase has been disposed");
        }
        return db;
      })().catch((err) => {
        this._dbPromise = void 0;
        throw err;
      });
    }
    return this._dbPromise;
  }
  /**
   * Returns the names of all user-created tables in the database.
   * Useful for testing migration behavior.
   */
  async getAllTables() {
    const db = await this._ensureDb();
    const rows = await dbAll(db, `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, []);
    return rows.map((r) => r.name);
  }
  // ---- Turns ----------------------------------------------------------
  createTurn(turnId) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [turnId]);
    });
  }
  deleteTurn(turnId) {
    return this._mutateTurnUsage(async (db) => {
      await dbRun(db, "DELETE FROM turns WHERE id = ?", [turnId]);
    });
  }
  setTurnEventId(turnId, eventId) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [turnId]);
      await dbRun(db, "UPDATE turns SET event_id = ? WHERE id = ? AND event_id IS NULL", [eventId, turnId]);
    });
  }
  async getTurnEventId(turnId) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT event_id FROM turns WHERE id = ?1 OR event_id = ?1 LIMIT 1", [turnId]);
    return row?.event_id ?? void 0;
  }
  async getNextTurnEventId(turnId) {
    const db = await this._ensureDb();
    const row = await dbGet(
      db,
      `SELECT event_id FROM turns
				WHERE rowid > (
					SELECT rowid FROM turns WHERE id = ?1 OR event_id = ?1 LIMIT 1
				)
				ORDER BY rowid LIMIT 1`,
      [turnId]
    );
    return row?.event_id ?? void 0;
  }
  async getFirstTurnEventId() {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT event_id FROM turns ORDER BY rowid LIMIT 1", []);
    return row?.event_id ?? void 0;
  }
  setTurnUsage(turnId, usage) {
    return this._mutateTurnUsage(async (db) => {
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [turnId]);
      await dbRun(db, "INSERT OR REPLACE INTO turn_usage (turn_id, usage) VALUES (?, ?)", [turnId, usage]);
    });
  }
  async getTurnUsages() {
    return this._turnUsageSequencer.queue(async () => {
      const db = await this._ensureDb();
      const rows = await dbAll(
        db,
        `SELECT u.turn_id AS turn_id, t.event_id AS event_id, u.usage AS usage
				FROM turn_usage u LEFT JOIN turns t ON t.id = u.turn_id`,
        []
      );
      const result = /* @__PURE__ */ new Map();
      for (const row of rows) {
        const usage = row.usage;
        result.set(row.turn_id, usage);
        const eventId = row.event_id;
        if (eventId) {
          result.set(eventId, usage);
        }
      }
      return result;
    });
  }
  setTurnCheckpointRef(turnId, ref) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [turnId]);
      await dbRun(db, "UPDATE turns SET checkpoint_ref = ? WHERE id = ?", [ref, turnId]);
    });
  }
  async getTurnCheckpointRef(turnId) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT checkpoint_ref FROM turns WHERE id = ?1 OR event_id = ?1 LIMIT 1", [turnId]);
    return row?.checkpoint_ref ?? void 0;
  }
  async getPreviousCheckpointRef(turnId) {
    const db = await this._ensureDb();
    const row = await dbGet(
      db,
      `SELECT checkpoint_ref FROM turns
				WHERE rowid < (SELECT rowid FROM turns WHERE id = ?1 OR event_id = ?1 LIMIT 1)
					AND checkpoint_ref IS NOT NULL
				ORDER BY rowid DESC LIMIT 1`,
      [turnId]
    );
    return row?.checkpoint_ref ?? void 0;
  }
  async getAllCheckpointRefs() {
    const db = await this._ensureDb();
    const rows = await dbAll(db, "SELECT checkpoint_ref FROM turns WHERE checkpoint_ref IS NOT NULL ORDER BY rowid", []);
    return rows.map((r) => r.checkpoint_ref);
  }
  truncateFromTurn(turnId) {
    return this._mutateTurnUsage(async (db) => {
      await dbRun(
        db,
        `DELETE FROM turns WHERE rowid >= (SELECT rowid FROM turns WHERE id = ?)`,
        [turnId]
      );
    });
  }
  deleteTurnsAfter(turnId) {
    return this._mutateTurnUsage(async (db) => {
      await dbRun(
        db,
        `DELETE FROM turns WHERE rowid > (SELECT rowid FROM turns WHERE id = ?)`,
        [turnId]
      );
    });
  }
  deleteAllTurns() {
    return this._mutateTurnUsage(async (db) => {
      await dbExec(db, "DELETE FROM turns");
    });
  }
  // ---- Local (host-injected) turns ------------------------------------
  insertLocalTurn(record) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(
        db,
        "INSERT OR REPLACE INTO local_turns (turn_id, chat_uri, anchor_turn_id, seq, payload) VALUES (?, ?, ?, ?, ?)",
        [record.turnId, record.chatUri, record.anchorTurnId ?? null, record.seq, record.payload]
      );
    });
  }
  async getLocalTurns() {
    const db = await this._ensureDb();
    const rows = await dbAll(db, "SELECT turn_id, chat_uri, anchor_turn_id, seq, payload FROM local_turns ORDER BY seq", []);
    return rows.map((r) => ({
      turnId: r.turn_id,
      chatUri: r.chat_uri,
      anchorTurnId: r.anchor_turn_id ?? void 0,
      seq: r.seq,
      payload: r.payload
    }));
  }
  deleteLocalTurns(turnIds) {
    return this._track(async () => {
      if (turnIds.length === 0) {
        return;
      }
      const db = await this._ensureDb();
      const placeholders = turnIds.map(() => "?").join(",");
      await dbRun(db, `DELETE FROM local_turns WHERE turn_id IN (${placeholders})`, [...turnIds]);
    });
  }
  // ---- File edits -----------------------------------------------------
  storeFileEdit(edit) {
    return this._track(() => this._fileEditSequencer.queue(edit.filePath, async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [edit.turnId]);
      await dbRun(
        db,
        `INSERT OR REPLACE INTO file_edits
					(turn_id, tool_call_id, file_path, edit_type, original_path, before_content, after_content, added_lines, removed_lines)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          edit.turnId,
          edit.toolCallId,
          edit.filePath,
          edit.kind,
          edit.originalPath ?? null,
          edit.beforeContent ? Buffer.from(edit.beforeContent) : null,
          edit.afterContent ? Buffer.from(edit.afterContent) : null,
          edit.addedLines ?? null,
          edit.removedLines ?? null
        ]
      );
    }));
  }
  async getFileEdits(toolCallIds) {
    if (toolCallIds.length === 0) {
      return [];
    }
    const db = await this._ensureDb();
    const placeholders = toolCallIds.map(() => "?").join(",");
    const rows = await dbAll(
      db,
      `SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				WHERE tool_call_id IN (${placeholders})
				ORDER BY rowid`,
      toolCallIds
    );
    return rows.map((row) => ({
      turnId: row.turn_id,
      toolCallId: row.tool_call_id,
      filePath: row.file_path,
      kind: row.edit_type ?? "edit",
      originalPath: row.original_path ?? void 0,
      addedLines: row.added_lines ?? void 0,
      removedLines: row.removed_lines ?? void 0
    }));
  }
  async getAllFileEdits() {
    const db = await this._ensureDb();
    const rows = await dbAll(
      db,
      `SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				ORDER BY rowid`,
      []
    );
    return rows.map((row) => ({
      turnId: row.turn_id,
      toolCallId: row.tool_call_id,
      filePath: row.file_path,
      kind: row.edit_type ?? "edit",
      originalPath: row.original_path ?? void 0,
      addedLines: row.added_lines ?? void 0,
      removedLines: row.removed_lines ?? void 0
    }));
  }
  async getFileEditsByTurn(turnId) {
    const db = await this._ensureDb();
    const rows = await dbAll(
      db,
      `SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				WHERE turn_id = ?
				ORDER BY rowid`,
      [turnId]
    );
    return rows.map((row) => ({
      turnId: row.turn_id,
      toolCallId: row.tool_call_id,
      filePath: row.file_path,
      kind: row.edit_type ?? "edit",
      originalPath: row.original_path ?? void 0,
      addedLines: row.added_lines ?? void 0,
      removedLines: row.removed_lines ?? void 0
    }));
  }
  async readFileEditContent(toolCallId, filePath) {
    return this._fileEditSequencer.queue(filePath, async () => {
      const db = await this._ensureDb();
      const row = await dbGet(
        db,
        `SELECT before_content, after_content
					FROM file_edits
					WHERE tool_call_id = ? AND file_path = ?`,
        [toolCallId, filePath]
      );
      if (!row) {
        return void 0;
      }
      return {
        beforeContent: row.before_content ? toUint8Array(row.before_content) : void 0,
        afterContent: row.after_content ? toUint8Array(row.after_content) : void 0
      };
    });
  }
  // ---- Session metadata -----------------------------------------------
  async getMetadata(key) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT value FROM session_metadata WHERE key = ?", [key]);
    return row?.value;
  }
  async getMetadataObject(obj) {
    const keys = Object.keys(obj);
    const result = {};
    if (keys.length === 0) {
      return result;
    }
    const db = await this._ensureDb();
    const placeholders = keys.map(() => "?").join(",");
    const rows = await dbAll(db, `SELECT key, value FROM session_metadata WHERE key IN (${placeholders})`, keys);
    for (const key of keys) {
      result[key] = void 0;
    }
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
  setMetadata(key, value) {
    return this._track(() => this._metadataSequencer.queue(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR REPLACE INTO session_metadata (key, value) VALUES (?, ?)", [key, value]);
    }));
  }
  setMetadataValues(values) {
    return this._track(() => this._metadataSequencer.queue(async () => {
      const db = await this._ensureDb();
      await this._transactionSequencer.queue(async () => {
        await dbExec(db, "BEGIN TRANSACTION");
        try {
          for (const [key, value] of Object.entries(values)) {
            await dbRun(db, "INSERT OR REPLACE INTO session_metadata (key, value) VALUES (?, ?)", [key, value]);
          }
          await dbExec(db, "COMMIT");
        } catch (err) {
          await dbExec(db, "ROLLBACK");
          throw err;
        }
      });
    }));
  }
  setChatDraft(chat, draft) {
    const chatUri = chat.toString();
    return this._track(async () => {
      const db = await this._ensureDb();
      if (!draft) {
        await dbRun(db, "DELETE FROM chat_drafts WHERE chat_uri = ?", [chatUri]);
        return;
      }
      await dbRun(db, "INSERT OR REPLACE INTO chat_drafts (chat_uri, draft) VALUES (?, ?)", [chatUri, JSON.stringify(draft)]);
    });
  }
  async getChatDraft(chat) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT draft FROM chat_drafts WHERE chat_uri = ?", [chat.toString()]);
    if (typeof row?.draft !== "string") {
      return void 0;
    }
    try {
      return JSON.parse(row.draft);
    } catch {
      return void 0;
    }
  }
  // ---- Reviewed files -------------------------------------------------
  markFileReviewed(uri, nonce) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO reviewed_files (uri, nonce) VALUES (?, ?)", [uri.toString(), nonce]);
    });
  }
  unmarkFileReviewed(uri, nonce) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "DELETE FROM reviewed_files WHERE uri = ? AND nonce = ?", [uri.toString(), nonce]);
    });
  }
  async getReviewedFiles() {
    const db = await this._ensureDb();
    const rows = await dbAll(db, "SELECT uri, nonce FROM reviewed_files ORDER BY rowid", []);
    return rows.map(toReviewedFileRecord);
  }
  async getReviewedFilesForUri(uri) {
    const db = await this._ensureDb();
    const rows = await dbAll(db, "SELECT uri, nonce FROM reviewed_files WHERE uri = ? ORDER BY rowid", [uri.toString()]);
    return rows.map(toReviewedFileRecord);
  }
  async isFileReviewed(uri, nonce) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT 1 FROM reviewed_files WHERE uri = ? AND nonce = ? LIMIT 1", [uri.toString(), nonce]);
    return !!row;
  }
  remapTurnIds(mapping, eventIds) {
    return this._mutateTurnUsage(async (db) => {
      await this._transactionSequencer.queue(async () => {
        await dbExec(db, "PRAGMA defer_foreign_keys = ON");
        await dbExec(db, "BEGIN TRANSACTION");
        try {
          const oldIds = [...mapping.keys()];
          if (oldIds.length > 0) {
            const placeholders = oldIds.map(() => "?").join(",");
            await dbRun(
              db,
              `DELETE FROM turns WHERE id NOT IN (${placeholders})`,
              oldIds
            );
          }
          for (const [oldId, newId] of mapping) {
            await dbRun(db, "UPDATE turns SET id = ? WHERE id = ?", [newId, oldId]);
            await dbRun(db, "UPDATE file_edits SET turn_id = ? WHERE turn_id = ?", [newId, oldId]);
          }
          for (const [turnId, eventId] of eventIds ?? []) {
            await dbRun(db, "UPDATE turns SET event_id = ? WHERE id = ?", [eventId, turnId]);
          }
          if (oldIds.length > 0) {
            const placeholders = oldIds.map(() => "?").join(",");
            await dbRun(
              db,
              `DELETE FROM local_turns WHERE turn_id NOT IN (${placeholders})`,
              oldIds
            );
          }
          for (const [oldId, newId] of mapping) {
            await dbRun(db, "UPDATE local_turns SET turn_id = ? WHERE turn_id = ?", [newId, oldId]);
            await dbRun(db, "UPDATE local_turns SET anchor_turn_id = ? WHERE anchor_turn_id = ?", [newId, oldId]);
          }
          for (const [oldId, newId] of mapping) {
            await dbRun(db, "UPDATE turn_usage SET turn_id = ? WHERE turn_id = ?", [newId, oldId]);
          }
          await dbExec(db, "COMMIT");
        } catch (err) {
          await dbExec(db, "ROLLBACK");
          throw err;
        }
      });
    });
  }
  /**
   * Resolves once all currently in-flight write operations have settled.
   * Used by graceful shutdown to flush pending fire-and-forget writes
   * before the process exits. Should be called from a path where no
   * further writes are expected; loops until idle to also drain any
   * writes that get queued while we're awaiting.
   */
  async whenIdle() {
    while (this._pendingWrites.size > 0) {
      await Promise.allSettled([...this._pendingWrites]);
    }
  }
  async vacuumInto(targetPath) {
    const db = await this._ensureDb();
    await dbRun(db, "VACUUM INTO ?", [targetPath]);
  }
  /**
   * Wrap a mutating operation's promise so {@link whenIdle} can await it.
   * Invoke at the **outermost** layer of every public mutating method so
   * that any internal awaits (notably `_ensureDb()`) are covered too —
   * tracking only the leaf `dbRun`/`dbExec` would miss the window
   * between the method being called and the query actually being queued.
   */
  _track(fn) {
    const p = fn();
    this._pendingWrites.add(p);
    const untrack = () => {
      this._pendingWrites.delete(p);
    };
    p.then(untrack, untrack);
    return p;
  }
  async close() {
    await (this._closed ??= this._dbPromise?.then((db) => dbClose(db)).catch(() => {
    }) || true);
  }
  dispose() {
    this.close();
  }
}
function toReviewedFileRecord(row) {
  return {
    uri: URI.parse(row.uri),
    nonce: row.nonce
  };
}
function toUint8Array(value) {
  if (value instanceof Buffer) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  return new Uint8Array(0);
}
export {
  SessionDatabase,
  runMigrations,
  sessionDatabaseMigrations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzZXNzaW9uRGF0YWJhc2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIsIFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHR5cGUgeyBEYXRhYmFzZSwgUnVuUmVzdWx0IH0gZnJvbSAnQHZzY29kZS9zcWxpdGUzJztcbmltcG9ydCB0eXBlIHsgSUZpbGVFZGl0Q29udGVudCwgSUZpbGVFZGl0UmVjb3JkLCBJTG9jYWxUdXJuUmVjb3JkLCBJUmV2aWV3ZWRGaWxlUmVjb3JkLCBJU2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHR5cGUgeyBNZXNzYWdlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5cbi8qKlxuICogQSBzaW5nbGUgbnVtYmVyZWQgbWlncmF0aW9uLiBNaWdyYXRpb25zIGFyZSBhcHBsaWVkIGluIG9yZGVyIG9mXG4gKiB7QGxpbmsgdmVyc2lvbn0gYW5kIHRyYWNrZWQgdmlhIGBQUkFHTUEgdXNlcl92ZXJzaW9uYC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uIHtcblx0LyoqIE1vbm90b25pY2FsbHktaW5jcmVhc2luZyB2ZXJzaW9uIG51bWJlciAoMS1iYXNlZCkuICovXG5cdHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcblx0LyoqIFNRTCB0byBleGVjdXRlIGZvciB0aGlzIG1pZ3JhdGlvbi4gKi9cblx0cmVhZG9ubHkgc3FsOiBzdHJpbmc7XG59XG5cbi8qKlxuICogVGhlIHNldCBvZiBtaWdyYXRpb25zIHRoYXQgZGVmaW5lIHRoZSBjdXJyZW50IHNlc3Npb24gZGF0YWJhc2Ugc2NoZW1hLlxuICogTmV3IG1pZ3JhdGlvbnMgc2hvdWxkIGJlICoqYXBwZW5kZWQqKiB0byB0aGlzIGFycmF5IHdpdGggdGhlIG5leHQgdmVyc2lvblxuICogbnVtYmVyLiBOZXZlciByZW9yZGVyIG9yIG11dGF0ZSBleGlzdGluZyBlbnRyaWVzLlxuICovXG5leHBvcnQgY29uc3Qgc2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uczogcmVhZG9ubHkgSVNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbltdID0gW1xuXHR7XG5cdFx0dmVyc2lvbjogMSxcblx0XHRzcWw6IFtcblx0XHRcdGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyB0dXJucyAoXG5cdFx0XHRcdGlkIFRFWFQgUFJJTUFSWSBLRVkgTk9UIE5VTExcblx0XHRcdClgLFxuXHRcdFx0YENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIGZpbGVfZWRpdHMgKFxuXHRcdFx0XHR0dXJuX2lkICAgICAgICBURVhUICAgIE5PVCBOVUxMIFJFRkVSRU5DRVMgdHVybnMoaWQpIE9OIERFTEVURSBDQVNDQURFLFxuXHRcdFx0XHR0b29sX2NhbGxfaWQgICBURVhUICAgIE5PVCBOVUxMLFxuXHRcdFx0XHRmaWxlX3BhdGggICAgICBURVhUICAgIE5PVCBOVUxMLFxuXHRcdFx0XHRiZWZvcmVfY29udGVudCBCTE9CICAgTk9UIE5VTEwsXG5cdFx0XHRcdGFmdGVyX2NvbnRlbnQgIEJMT0IgICBOT1QgTlVMTCxcblx0XHRcdFx0YWRkZWRfbGluZXMgICAgSU5URUdFUixcblx0XHRcdFx0cmVtb3ZlZF9saW5lcyAgSU5URUdFUixcblx0XHRcdFx0UFJJTUFSWSBLRVkgKHRvb2xfY2FsbF9pZCwgZmlsZV9wYXRoKVxuXHRcdFx0KWAsXG5cdFx0XS5qb2luKCc7XFxuJyksXG5cdH0sXG5cdHtcblx0XHR2ZXJzaW9uOiAyLFxuXHRcdHNxbDogYENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHNlc3Npb25fbWV0YWRhdGEgKFxuXHRcdFx0a2V5ICAgVEVYVCBQUklNQVJZIEtFWSBOT1QgTlVMTCxcblx0XHRcdHZhbHVlIFRFWFQgTk9UIE5VTExcblx0XHQpYCxcblx0fSxcblx0e1xuXHRcdHZlcnNpb246IDMsXG5cdFx0c3FsOiBbXG5cdFx0XHQvLyBSZWNyZWF0ZSBmaWxlX2VkaXRzIHdpdGggbmV3IGNvbHVtbnM6IGVkaXRfdHlwZSwgb3JpZ2luYWxfcGF0aCxcblx0XHRcdC8vIGFuZCBudWxsYWJsZSBiZWZvcmVfY29udGVudC9hZnRlcl9jb250ZW50LlxuXHRcdFx0YENSRUFURSBUQUJMRSBmaWxlX2VkaXRzX3YzIChcblx0XHRcdFx0dHVybl9pZCAgICAgICAgVEVYVCAgICBOT1QgTlVMTCBSRUZFUkVOQ0VTIHR1cm5zKGlkKSBPTiBERUxFVEUgQ0FTQ0FERSxcblx0XHRcdFx0dG9vbF9jYWxsX2lkICAgVEVYVCAgICBOT1QgTlVMTCxcblx0XHRcdFx0ZmlsZV9wYXRoICAgICAgVEVYVCAgICBOT1QgTlVMTCxcblx0XHRcdFx0ZWRpdF90eXBlICAgICAgVEVYVCAgICBOT1QgTlVMTCBERUZBVUxUICdlZGl0Jyxcblx0XHRcdFx0b3JpZ2luYWxfcGF0aCAgVEVYVCxcblx0XHRcdFx0YmVmb3JlX2NvbnRlbnQgQkxPQixcblx0XHRcdFx0YWZ0ZXJfY29udGVudCAgQkxPQixcblx0XHRcdFx0YWRkZWRfbGluZXMgICAgSU5URUdFUixcblx0XHRcdFx0cmVtb3ZlZF9saW5lcyAgSU5URUdFUixcblx0XHRcdFx0UFJJTUFSWSBLRVkgKHRvb2xfY2FsbF9pZCwgZmlsZV9wYXRoKVxuXHRcdFx0KWAsXG5cdFx0XHRgSU5TRVJUIElOVE8gZmlsZV9lZGl0c192MyAodHVybl9pZCwgdG9vbF9jYWxsX2lkLCBmaWxlX3BhdGgsIGVkaXRfdHlwZSwgYmVmb3JlX2NvbnRlbnQsIGFmdGVyX2NvbnRlbnQsIGFkZGVkX2xpbmVzLCByZW1vdmVkX2xpbmVzKVxuXHRcdFx0XHRTRUxFQ1QgdHVybl9pZCwgdG9vbF9jYWxsX2lkLCBmaWxlX3BhdGgsICdlZGl0JywgYmVmb3JlX2NvbnRlbnQsIGFmdGVyX2NvbnRlbnQsIGFkZGVkX2xpbmVzLCByZW1vdmVkX2xpbmVzIEZST00gZmlsZV9lZGl0c2AsXG5cdFx0XHRgRFJPUCBUQUJMRSBmaWxlX2VkaXRzYCxcblx0XHRcdGBBTFRFUiBUQUJMRSBmaWxlX2VkaXRzX3YzIFJFTkFNRSBUTyBmaWxlX2VkaXRzYCxcblx0XHRdLmpvaW4oJztcXG4nKSxcblx0fSxcblx0e1xuXHRcdHZlcnNpb246IDQsXG5cdFx0c3FsOiBbXG5cdFx0XHRgQUxURVIgVEFCTEUgdHVybnMgQUREIENPTFVNTiBldmVudF9pZCBURVhUYCxcblx0XHRcdGBDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfdHVybnNfZXZlbnRfaWQgT04gdHVybnMoZXZlbnRfaWQpYCxcblx0XHRdLmpvaW4oJztcXG4nKSxcblx0fSxcblx0e1xuXHRcdHZlcnNpb246IDUsXG5cdFx0c3FsOiBgQUxURVIgVEFCTEUgdHVybnMgQUREIENPTFVNTiBjaGVja3BvaW50X3JlZiBURVhUYCxcblx0fSxcblx0e1xuXHRcdHZlcnNpb246IDYsXG5cdFx0c3FsOiBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgY2hhdF9kcmFmdHMgKFxuXHRcdFx0Y2hhdF91cmkgVEVYVCBQUklNQVJZIEtFWSBOT1QgTlVMTCxcblx0XHRcdGRyYWZ0ICAgIFRFWFQgTk9UIE5VTExcblx0XHQpYCxcblx0fSxcblx0e1xuXHRcdHZlcnNpb246IDcsXG5cdFx0c3FsOiBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgcmV2aWV3ZWRfZmlsZXMgKFxuXHRcdFx0dXJpICAgVEVYVCBOT1QgTlVMTCxcblx0XHRcdG5vbmNlIFRFWFQgTk9UIE5VTEwsXG5cdFx0XHRQUklNQVJZIEtFWSAodXJpLCBub25jZSlcblx0XHQpYCxcblx0fSxcblx0e1xuXHRcdHZlcnNpb246IDgsXG5cdFx0c3FsOiBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgbG9jYWxfdHVybnMgKFxuXHRcdFx0dHVybl9pZCAgICAgICAgVEVYVCBQUklNQVJZIEtFWSBOT1QgTlVMTCxcblx0XHRcdGNoYXRfdXJpICAgICAgIFRFWFQgTk9UIE5VTEwsXG5cdFx0XHRhbmNob3JfdHVybl9pZCBURVhULFxuXHRcdFx0c2VxICAgICAgICAgICAgSU5URUdFUiBOT1QgTlVMTCxcblx0XHRcdHBheWxvYWQgICAgICAgIFRFWFQgTk9UIE5VTExcblx0XHQpYCxcblx0fSxcblx0e1xuXHRcdHZlcnNpb246IDksXG5cdFx0Ly8gYHR1cm5fdXNhZ2VgIGlzIGEgY2hpbGQgb2YgYHR1cm5zYCBzbyBldmVyeSBwcnVuZSBwYXRoIChgZGVsZXRlVHVybmAsXG5cdFx0Ly8gYHRydW5jYXRlRnJvbVR1cm5gLCBgZGVsZXRlVHVybnNBZnRlcmAsIGBkZWxldGVBbGxUdXJuc2AsIGFuZCB0aGUgZm9ya1xuXHRcdC8vIHJlbWFwKSByZWFjaGVzIGl0IGJ5IGNhc2NhZGUgYW5kIHRoZSB0YWJsZSBjYW5ub3QgZ3JvdyB1bmJvdW5kZWQuXG5cdFx0Ly9cblx0XHQvLyBUaGUgZm9yZWlnbiBrZXkgZm9yY2VzIGBzZXRUdXJuVXNhZ2VgIHRvIGBJTlNFUlQgT1IgSUdOT1JFYCBhIHBhcmVudCByb3csXG5cdFx0Ly8gYW5kIHJvd3MgY3JlYXRlZCB0aGF0IHdheSBjYXJyeSBgZXZlbnRfaWQgSVMgTlVMTGAuIFRoYXQgaXMgc2FmZSBoZXJlOlxuXHRcdC8vIGBnZXRGaXJzdFR1cm5FdmVudElkYCAvIGBnZXROZXh0VHVybkV2ZW50SWRgIHNjYW4gYnkgcm93aWQgYW5kIGFyZSByZWFkXG5cdFx0Ly8gb25seSBieSB0aGUgQ29waWxvdCBhZ2VudCAoQ2xhdWRlIHJlc29sdmVzIGZvcmsvdHJ1bmNhdGUgYm91bmRhcmllcyBmcm9tXG5cdFx0Ly8gaXRzIG93biBwZXJzaXN0ZWQgbWFwcGluZyksIGFuZCBpbiBhIENvcGlsb3QgZGF0YWJhc2UgYHNldFR1cm5FdmVudElkYFxuXHRcdC8vIHJ1bnMgb24gYHVzZXIubWVzc2FnZWAgXHUyMDE0IGJlZm9yZSBhbnkgdXNhZ2UgaXMgcmVwb3J0ZWQgXHUyMDE0IHNvIHRoZSBwYXJlbnQgcm93XG5cdFx0Ly8gYWxyZWFkeSBleGlzdHMgYW5kIHRoZSBpbnNlcnQgaXMgYSBuby1vcC4gV2VyZSB1c2FnZSBldmVyIHRvIGxhbmQgZmlyc3QsXG5cdFx0Ly8gYHNldFR1cm5FdmVudElkYCBmaWxscyB0aGUgZXhpc3Rpbmcgcm93IGluIChgVVBEQVRFIFx1MjAyNiBXSEVSRSBldmVudF9pZCBJU1xuXHRcdC8vIE5VTExgKSBhbmQgdGhlIHBvc2l0aW9uIGlzIHN0aWxsIGNvcnJlY3QsIHNpbmNlIGEgdHVybidzIHVzYWdlIHByZWNlZGVzXG5cdFx0Ly8gdGhlIG5leHQgdHVybi4gRWFjaCBwZWVyIGNoYXQgZ2V0cyBpdHMgb3duIGRhdGFiYXNlIChzZWVcblx0XHQvLyBgU2Vzc2lvbkRhdGFTZXJ2aWNlYCksIHNvIGEgcGVlciB0dXJuIGNhbm5vdCBpbnRlcmxlYXZlIHdpdGggYW5vdGhlclxuXHRcdC8vIGNoYXQncyB0dXJucyBlaXRoZXIuXG5cdFx0c3FsOiBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgdHVybl91c2FnZSAoXG5cdFx0XHR0dXJuX2lkIFRFWFQgUFJJTUFSWSBLRVkgTk9UIE5VTEwgUkVGRVJFTkNFUyB0dXJucyhpZCkgT04gREVMRVRFIENBU0NBREUsXG5cdFx0XHR1c2FnZSAgIFRFWFQgTk9UIE5VTExcblx0XHQpYCxcblx0fSxcbl07XG5cbi8vIC0tLS0gUHJvbWlzZSB3cmFwcGVycyBhcm91bmQgY2FsbGJhY2stYmFzZWQgQHZzY29kZS9zcWxpdGUzIEFQSSAtLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBkYkV4ZWMoZGI6IERhdGFiYXNlLCBzcWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGRiLmV4ZWMoc3FsLCBlcnIgPT4gZXJyID8gcmVqZWN0KGVycikgOiByZXNvbHZlKCkpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZGJSdW4oZGI6IERhdGFiYXNlLCBzcWw6IHN0cmluZywgcGFyYW1zOiB1bmtub3duW10pOiBQcm9taXNlPHsgY2hhbmdlczogbnVtYmVyOyBsYXN0SUQ6IG51bWJlciB9PiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0ZGIucnVuKHNxbCwgcGFyYW1zLCBmdW5jdGlvbiAodGhpczogUnVuUmVzdWx0LCBlcnI6IEVycm9yIHwgbnVsbCkge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycik7XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlKHsgY2hhbmdlczogdGhpcy5jaGFuZ2VzLCBsYXN0SUQ6IHRoaXMubGFzdElEIH0pO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZGJHZXQoZGI6IERhdGFiYXNlLCBzcWw6IHN0cmluZywgcGFyYW1zOiB1bmtub3duW10pOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0ZGIuZ2V0KHNxbCwgcGFyYW1zLCAoZXJyOiBFcnJvciB8IG51bGwsIHJvdzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0cmV0dXJuIHJlamVjdChlcnIpO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZShyb3cpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZGJBbGwoZGI6IERhdGFiYXNlLCBzcWw6IHN0cmluZywgcGFyYW1zOiB1bmtub3duW10pOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+W10+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRkYi5hbGwoc3FsLCBwYXJhbXMsIChlcnI6IEVycm9yIHwgbnVsbCwgcm93czogUmVjb3JkPHN0cmluZywgdW5rbm93bj5bXSkgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycik7XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlKHJvd3MpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZGJDbG9zZShkYjogRGF0YWJhc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRkYi5jbG9zZShlcnIgPT4gZXJyID8gcmVqZWN0KGVycikgOiByZXNvbHZlKCkpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZGJPcGVuKHBhdGg6IHN0cmluZyk6IFByb21pc2U8RGF0YWJhc2U+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRpbXBvcnQoJ0B2c2NvZGUvc3FsaXRlMycpLnRoZW4oc3FsaXRlMyA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBzcWxpdGUzLmRlZmF1bHQuRGF0YWJhc2UocGF0aCwgKGVycjogRXJyb3IgfCBudWxsKSA9PiB7XG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZShkYik7XG5cdFx0XHR9KTtcblx0XHR9LCByZWplY3QpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBBcHBsaWVzIGFueSBwZW5kaW5nIHtAbGluayBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uIG1pZ3JhdGlvbnN9IHRvIGFcbiAqIGRhdGFiYXNlLiBNaWdyYXRpb25zIHdob3NlIHZlcnNpb24gaXMgZ3JlYXRlciB0aGFuIHRoZSBjdXJyZW50XG4gKiBgUFJBR01BIHVzZXJfdmVyc2lvbmAgYXJlIHJ1biBpbnNpZGUgYSBzZXJpYWxpemVkIHRyYW5zYWN0aW9uLiBBZnRlciBhbGxcbiAqIG1pZ3JhdGlvbnMgY29tcGxldGUgdGhlIHByYWdtYSBpcyB1cGRhdGVkIHRvIHRoZSBoaWdoZXN0IGFwcGxpZWQgdmVyc2lvbi5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bk1pZ3JhdGlvbnMoZGI6IERhdGFiYXNlLCBtaWdyYXRpb25zOiByZWFkb25seSBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0Ly8gRW5hYmxlIGZvcmVpZ24ga2V5IGVuZm9yY2VtZW50IFx1MjAxNCBtdXN0IGJlIHNldCBvdXRzaWRlIGEgdHJhbnNhY3Rpb25cblx0Ly8gYW5kIGV2ZXJ5IHRpbWUgYSBjb25uZWN0aW9uIGlzIG9wZW5lZC5cblx0YXdhaXQgZGJFeGVjKGRiLCAnUFJBR01BIGZvcmVpZ25fa2V5cyA9IE9OJyk7XG5cblx0Y29uc3Qgcm93ID0gYXdhaXQgZGJHZXQoZGIsICdQUkFHTUEgdXNlcl92ZXJzaW9uJywgW10pO1xuXHRjb25zdCBjdXJyZW50VmVyc2lvbiA9IChyb3c/LnVzZXJfdmVyc2lvbiBhcyBudW1iZXIgfCB1bmRlZmluZWQpID8/IDA7XG5cblx0Y29uc3QgcGVuZGluZyA9IG1pZ3JhdGlvbnNcblx0XHQuZmlsdGVyKG0gPT4gbS52ZXJzaW9uID4gY3VycmVudFZlcnNpb24pXG5cdFx0LnNvcnQoKGEsIGIpID0+IGEudmVyc2lvbiAtIGIudmVyc2lvbik7XG5cblx0aWYgKHBlbmRpbmcubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0YXdhaXQgZGJFeGVjKGRiLCAnQkVHSU4gVFJBTlNBQ1RJT04nKTtcblx0dHJ5IHtcblx0XHRmb3IgKGNvbnN0IG1pZ3JhdGlvbiBvZiBwZW5kaW5nKSB7XG5cdFx0XHRhd2FpdCBkYkV4ZWMoZGIsIG1pZ3JhdGlvbi5zcWwpO1xuXHRcdFx0Ly8gUFJBR01BIGNhbm5vdCBiZSBwYXJhbWV0ZXJpemVkOyB0aGUgdmVyc2lvbiBpcyBhIHRydXN0ZWQgbGl0ZXJhbC5cblx0XHRcdGF3YWl0IGRiRXhlYyhkYiwgYFBSQUdNQSB1c2VyX3ZlcnNpb24gPSAke21pZ3JhdGlvbi52ZXJzaW9ufWApO1xuXHRcdH1cblx0XHRhd2FpdCBkYkV4ZWMoZGIsICdDT01NSVQnKTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0YXdhaXQgZGJFeGVjKGRiLCAnUk9MTEJBQ0snKTtcblx0XHR0aHJvdyBlcnI7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHdyYXBwZXIgYXJvdW5kIGEgYEB2c2NvZGUvc3FsaXRlM2Age0BsaW5rIERhdGFiYXNlfSBpbnN0YW5jZSB3aXRoXG4gKiBsYXp5IGluaXRpYWxpc2F0aW9uLlxuICpcbiAqIFRoZSB1bmRlcmx5aW5nIGNvbm5lY3Rpb24gaXMgb3BlbmVkIG9uIHRoZSBmaXJzdCBhc3luYyBtZXRob2QgY2FsbFxuICogKG5vdCBhdCBjb25zdHJ1Y3Rpb24gdGltZSksIGFsbG93aW5nIHRoZSBvYmplY3QgdG8gYmUgY3JlYXRlZFxuICogc3luY2hyb25vdXNseSBhbmQgc2hhcmVkIHZpYSBhIHtAbGluayBSZWZlcmVuY2VDb2xsZWN0aW9ufS5cbiAqXG4gKiBDYWxsaW5nIHtAbGluayBkaXNwb3NlfSBjbG9zZXMgdGhlIGNvbm5lY3Rpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uRGF0YWJhc2UgaW1wbGVtZW50cyBJU2Vzc2lvbkRhdGFiYXNlIHtcblxuXHRwcm90ZWN0ZWQgX2RiUHJvbWlzZTogUHJvbWlzZTxEYXRhYmFzZT4gfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBfY2xvc2VkOiBQcm9taXNlPHZvaWQ+IHwgdHJ1ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZUVkaXRTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFkYXRhU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc2FjdGlvblNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblxuXHQvKipcblx0ICogU2VyaWFsaXplcyBldmVyeSBgdHVybl91c2FnZWAgYWNjZXNzIFx1MjAxNCB3cml0ZXMsIHBydW5lcywgdGhlIGZvcmsgcmVtYXAsIGFuZCB0aGUgcmVzdG9yZSByZWFkXG5cdCAqIGFsaWtlLiBgQHZzY29kZS9zcWxpdGUzYCBydW5zIGluIHBhcmFsbGVsaXplZCBtb2RlIChzZWUge0BsaW5rIF9tZXRhZGF0YVNlcXVlbmNlcn0pLCBzbyBhXG5cdCAqIGZpcmUtYW5kLWZvcmdldCBgc2V0VHVyblVzYWdlYCBzdWJtaXR0ZWQgYmVmb3JlIGEgdHJ1bmNhdGlvbiBjYW4gb3RoZXJ3aXNlIGNvbXBsZXRlICphZnRlcipcblx0ICogaXQgYW5kIHJlc3VycmVjdCBhIHJvdyB0aGUgdHJ1bmNhdGlvbiB3YXMgbWVhbnQgdG8gcmVtb3ZlLCBhbmQgYSByZWFkIGNhbiBvdGhlcndpc2Ugb3ZlcnRha2Vcblx0ICogYSB3cml0ZSBpdCB3YXMgc3VibWl0dGVkIGFmdGVyLiBNdXRhdGlvbnMgbXVzdCBnbyB0aHJvdWdoIHtAbGluayBfbXV0YXRlVHVyblVzYWdlfSByYXRoZXJcblx0ICogdGhhbiBxdWV1ZWluZyBvbiB0aGlzIGRpcmVjdGx5LCBzbyB0aGV5IGFyZSB0cmFja2VkIGZvciB7QGxpbmsgd2hlbklkbGV9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdHVyblVzYWdlU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXG5cdC8qKlxuXHQgKiBSdW5zIGEgbXV0YXRpb24gdGhhdCB0b3VjaGVzIGB0dXJuX3VzYWdlYCwgdHJhY2tlZCBmb3Ige0BsaW5rIHdoZW5JZGxlfVxuXHQgKiBhbmQgc2VyaWFsaXplZCBhZ2FpbnN0IGV2ZXJ5IG90aGVyIHN1Y2ggbXV0YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9tdXRhdGVUdXJuVXNhZ2Uob3BlcmF0aW9uOiAoZGI6IERhdGFiYXNlKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKCgpID0+IHRoaXMuX3R1cm5Vc2FnZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiBvcGVyYXRpb24oYXdhaXQgdGhpcy5fZW5zdXJlRGIoKSkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbi1mbGlnaHQgd3JpdGUgb3BlcmF0aW9ucy4gVHJhY2tlZCBzbyB7QGxpbmsgd2hlbklkbGV9IGNhbiBhd2FpdCB0aGVtXG5cdCAqIGJlZm9yZSB0aGUgcHJvY2VzcyBleGl0cyBcdTIwMTQgd2l0aG91dCB0aGlzLCBhIGBTSUdURVJNYCBhcnJpdmluZyBiZXR3ZWVuXG5cdCAqIGEgZmlyZS1hbmQtZm9yZ2V0IG11dGF0aW5nIGNhbGwgKGUuZy4gYHNldE1ldGFkYXRhYCkgYmVpbmcgaW52b2tlZCBhbmRcblx0ICogaXRzIHVuZGVybHlpbmcgU1FMaXRlIHF1ZXJ5IGNvbXBsZXRpbmcgd291bGQgc2lsZW50bHkgZHJvcCB0aGUgd3JpdGUuXG5cdCAqIEV2ZXJ5IHB1YmxpYyBtdXRhdGluZyBtZXRob2Qgcm91dGVzIGl0cyByZXR1cm5lZCBwcm9taXNlIHRocm91Z2hcblx0ICoge0BsaW5rIF90cmFja307IHJlYWRzIChgZ2V0TWV0YWRhdGFgLCBgZ2V0RmlsZUVkaXRzYCwgLi4uKSBza2lwXG5cdCAqIHRyYWNraW5nIHNpbmNlIHNodXRkb3duIGRvZXMgbm90IG5lZWQgdG8gd2FpdCBmb3IgdGhlbS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdXcml0ZXMgPSBuZXcgU2V0PFByb21pc2U8dW5rbm93bj4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGF0aDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21pZ3JhdGlvbnM6IHJlYWRvbmx5IElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25bXSA9IHNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbnMsXG5cdCkgeyB9XG5cblx0LyoqXG5cdCAqIE9wZW5zIChvciBjcmVhdGVzKSBhIFNRTGl0ZSBkYXRhYmFzZSBhdCB7QGxpbmsgcGF0aH0gYW5kIGFwcGxpZXNcblx0ICogYW55IHBlbmRpbmcgbWlncmF0aW9ucy4gT25seSB1c2VkIGluIHRlc3RzIHdoZXJlIHN5bmNocm9ub3VzXG5cdCAqIGNvbnN0cnVjdGlvbiArIGltbWVkaWF0ZSByZWFkaW5lc3MgaXMgZGVzaXJlZC5cblx0ICovXG5cdHN0YXRpYyBhc3luYyBvcGVuKHBhdGg6IHN0cmluZywgbWlncmF0aW9uczogcmVhZG9ubHkgSVNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbltdID0gc2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9ucyk6IFByb21pc2U8U2Vzc2lvbkRhdGFiYXNlPiB7XG5cdFx0Y29uc3QgaW5zdCA9IG5ldyBTZXNzaW9uRGF0YWJhc2UocGF0aCwgbWlncmF0aW9ucyk7XG5cdFx0YXdhaXQgaW5zdC5fZW5zdXJlRGIoKTtcblx0XHRyZXR1cm4gaW5zdDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZW5zdXJlRGIoKTogUHJvbWlzZTxEYXRhYmFzZT4ge1xuXHRcdGlmICh0aGlzLl9jbG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1Nlc3Npb25EYXRhYmFzZSBoYXMgYmVlbiBkaXNwb3NlZCcpKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9kYlByb21pc2UpIHtcblx0XHRcdHRoaXMuX2RiUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIEVuc3VyZSB0aGUgcGFyZW50IGRpcmVjdG9yeSBleGlzdHMgYmVmb3JlIFNRTGl0ZSB0cmllcyB0b1xuXHRcdFx0XHQvLyBjcmVhdGUgdGhlIGRhdGFiYXNlIGZpbGUuXG5cdFx0XHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGRpcm5hbWUodGhpcy5fcGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRjb25zdCBkYiA9IGF3YWl0IGRiT3Blbih0aGlzLl9wYXRoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBydW5NaWdyYXRpb25zKGRiLCB0aGlzLl9taWdyYXRpb25zKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0YXdhaXQgZGJDbG9zZShkYik7XG5cdFx0XHRcdFx0dGhpcy5fZGJQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJZiBkaXNwb3NlKCkgd2FzIGNhbGxlZCB3aGlsZSB3ZSB3ZXJlIG9wZW5pbmcsIGNsb3NlIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHRpZiAodGhpcy5fY2xvc2VkKSB7XG5cdFx0XHRcdFx0YXdhaXQgZGJDbG9zZShkYik7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTZXNzaW9uRGF0YWJhc2UgaGFzIGJlZW4gZGlzcG9zZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZGI7XG5cdFx0XHR9KSgpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2RiUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kYlByb21pc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbmFtZXMgb2YgYWxsIHVzZXItY3JlYXRlZCB0YWJsZXMgaW4gdGhlIGRhdGFiYXNlLlxuXHQgKiBVc2VmdWwgZm9yIHRlc3RpbmcgbWlncmF0aW9uIGJlaGF2aW9yLlxuXHQgKi9cblx0YXN5bmMgZ2V0QWxsVGFibGVzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93cyA9IGF3YWl0IGRiQWxsKGRiLCBgU0VMRUNUIG5hbWUgRlJPTSBzcWxpdGVfbWFzdGVyIFdIRVJFIHR5cGU9J3RhYmxlJyBPUkRFUiBCWSBuYW1lYCwgW10pO1xuXHRcdHJldHVybiByb3dzLm1hcChyID0+IHIubmFtZSBhcyBzdHJpbmcpO1xuXHR9XG5cblx0Ly8gLS0tLSBUdXJucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Y3JlYXRlVHVybih0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFjayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0lOU0VSVCBPUiBJR05PUkUgSU5UTyB0dXJucyAoaWQpIFZBTFVFUyAoPyknLCBbdHVybklkXSk7XG5cdFx0fSk7XG5cdH1cblxuXHRkZWxldGVUdXJuKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX211dGF0ZVR1cm5Vc2FnZShhc3luYyBkYiA9PiB7XG5cdFx0XHQvLyBGaWxlIGVkaXRzIGFuZCB0dXJuIHVzYWdlIGNhc2NhZGUtZGVsZXRlIHZpYSB0aGVpciBmb3JlaWduIGtleXMuXG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0RFTEVURSBGUk9NIHR1cm5zIFdIRVJFIGlkID0gPycsIFt0dXJuSWRdKTtcblx0XHR9KTtcblx0fVxuXG5cdHNldFR1cm5FdmVudElkKHR1cm5JZDogc3RyaW5nLCBldmVudElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0YXdhaXQgZGJSdW4oZGIsICdJTlNFUlQgT1IgSUdOT1JFIElOVE8gdHVybnMgKGlkKSBWQUxVRVMgKD8pJywgW3R1cm5JZF0pO1xuXHRcdFx0Ly8gT25seSBzZXQgdGhlIGV2ZW50IElEIGlmIG5vdCBhbHJlYWR5IHNldCBcdTIwMTQgc3RlZXJpbmcgbWVzc2FnZXNcblx0XHRcdC8vIHRyaWdnZXIgYWRkaXRpb25hbCB1c2VyLm1lc3NhZ2UgZXZlbnRzIHdpdGhpbiB0aGUgc2FtZSB0dXJuLFxuXHRcdFx0Ly8gYW5kIHdlIG11c3QgcHJlc2VydmUgdGhlIGZpcnN0IChib3VuZGFyeSkgZXZlbnQgSUQuXG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ1VQREFURSB0dXJucyBTRVQgZXZlbnRfaWQgPSA/IFdIRVJFIGlkID0gPyBBTkQgZXZlbnRfaWQgSVMgTlVMTCcsIFtldmVudElkLCB0dXJuSWRdKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldFR1cm5FdmVudElkKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93ID0gYXdhaXQgZGJHZXQoZGIsICdTRUxFQ1QgZXZlbnRfaWQgRlJPTSB0dXJucyBXSEVSRSBpZCA9ID8xIE9SIGV2ZW50X2lkID0gPzEgTElNSVQgMScsIFt0dXJuSWRdKTtcblx0XHRyZXR1cm4gcm93Py5ldmVudF9pZCBhcyBzdHJpbmcgfCB1bmRlZmluZWQgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0TmV4dFR1cm5FdmVudElkKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Ly8gYHR1cm5zLmlkYCBpcyB0aGUgY2Fub25pY2FsIHR1cm4ga2V5IFx1MjAxNCBlaXRoZXIgYSBsaXZlIGByZXF1ZXN0X3h4eGBcblx0XHQvLyBkaXNwYXRjaGVkIGJ5IHRoZSBjbGllbnQgb3IsIGZvciBzZXNzaW9ucyByZXN0b3JlZCBmcm9tIGRpc2ssIHRoZVxuXHRcdC8vIFNESyBlbnZlbG9wZSBpZCBzdXJmYWNlZCBieSBgbWFwU2Vzc2lvbkV2ZW50c2AuIFRoZSBgZXZlbnRfaWRgXG5cdFx0Ly8gZmFsbGJhY2sgY292ZXJzIHRoZSBjYXNlIHdoZXJlIHRoZSBjYWxsZXIgYXNrcyBhYm91dCBhIHR1cm4gdGhhdFxuXHRcdC8vIHdhcyBzZXQgdXAgbGl2ZSAoaWQ9YHJlcXVlc3RfeHh4YCkgYnV0IGlzIG5vdyBiZWluZyByZWZlcmVuY2VkXG5cdFx0Ly8gdmlhIHRoZSBTREsgZXZlbnQgaWQsIG9yIHZpY2UgdmVyc2EuXG5cdFx0Y29uc3Qgcm93ID0gYXdhaXQgZGJHZXQoXG5cdFx0XHRkYixcblx0XHRcdGBTRUxFQ1QgZXZlbnRfaWQgRlJPTSB0dXJuc1xuXHRcdFx0XHRXSEVSRSByb3dpZCA+IChcblx0XHRcdFx0XHRTRUxFQ1Qgcm93aWQgRlJPTSB0dXJucyBXSEVSRSBpZCA9ID8xIE9SIGV2ZW50X2lkID0gPzEgTElNSVQgMVxuXHRcdFx0XHQpXG5cdFx0XHRcdE9SREVSIEJZIHJvd2lkIExJTUlUIDFgLFxuXHRcdFx0W3R1cm5JZF0sXG5cdFx0KTtcblx0XHRyZXR1cm4gcm93Py5ldmVudF9pZCBhcyBzdHJpbmcgfCB1bmRlZmluZWQgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0Rmlyc3RUdXJuRXZlbnRJZCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3cgPSBhd2FpdCBkYkdldChkYiwgJ1NFTEVDVCBldmVudF9pZCBGUk9NIHR1cm5zIE9SREVSIEJZIHJvd2lkIExJTUlUIDEnLCBbXSk7XG5cdFx0cmV0dXJuIHJvdz8uZXZlbnRfaWQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldFR1cm5Vc2FnZSh0dXJuSWQ6IHN0cmluZywgdXNhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9tdXRhdGVUdXJuVXNhZ2UoYXN5bmMgZGIgPT4ge1xuXHRcdFx0Ly8gRW5zdXJlIHRoZSB0dXJuIGV4aXN0cyBcdTIwMTQgbGF6aWx5IGluc2VydCBzaW5jZSB0aGUgdHVybiByZWNvcmQgbWF5IG5vdFxuXHRcdFx0Ly8gaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYW4gZXhwbGljaXQgY3JlYXRlVHVybigpIGNhbGwuIFRoaXMgaXMgd2hhdCBtYWtlc1xuXHRcdFx0Ly8gdGhlIHJvdyByZWFjaGFibGUgYnkgdGhlIGNhc2NhZGUgb24gZXZlcnkgcHJ1bmUgcGF0aDsgc2VlIG1pZ3JhdGlvbiA5XG5cdFx0XHQvLyBmb3Igd2h5IGNyZWF0aW5nIGl0IGNhbm5vdCBwZXJ0dXJiIHR1cm4gb3JkZXJpbmcuXG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0lOU0VSVCBPUiBJR05PUkUgSU5UTyB0dXJucyAoaWQpIFZBTFVFUyAoPyknLCBbdHVybklkXSk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0lOU0VSVCBPUiBSRVBMQUNFIElOVE8gdHVybl91c2FnZSAodHVybl9pZCwgdXNhZ2UpIFZBTFVFUyAoPywgPyknLCBbdHVybklkLCB1c2FnZV0pO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0VHVyblVzYWdlcygpOiBQcm9taXNlPE1hcDxzdHJpbmcsIHN0cmluZz4+IHtcblx0XHQvLyBRdWV1ZWQgb24gdGhlIHNhbWUgc2VxdWVuY2VyIGFzIHRoZSB3cml0ZXMsIG5vdCBydW4gZGlyZWN0bHk6IGBzZXRUdXJuVXNhZ2VgIGlzXG5cdFx0Ly8gZmlyZS1hbmQtZm9yZ2V0IGFuZCBgQHZzY29kZS9zcWxpdGUzYCBpcyBwYXJhbGxlbGl6ZWQsIHNvIGEgcmVzdG9yZSB0aGF0IHJlYWRzIHN0cmFpZ2h0XG5cdFx0Ly8gdGhyb3VnaCBjYW4gbWlzcyBhIHdyaXRlIHN1Ym1pdHRlZCBiZWZvcmUgaXQgYW5kIHBlcm1hbmVudGx5IHJlYnVpbGQgdGhhdCB0dXJuIHdpdGhvdXRcblx0XHQvLyBpdHMgY29zdC4gUmVhZC1hZnRlci13cml0ZSBvcmRlcmluZyBpcyB3aGF0IG1ha2VzIHRoZSBvdmVybGF5IGRldGVybWluaXN0aWMuXG5cdFx0cmV0dXJuIHRoaXMuX3R1cm5Vc2FnZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHQvLyBMZWZ0LWpvaW4gYHR1cm5zYCBzbyBhIHVzYWdlIHJvdyByZWNvcmRlZCBhZ2FpbnN0IGEgbGl2ZSByZXF1ZXN0IGlkIGlzXG5cdFx0XHQvLyBhbHNvIHJlYWNoYWJsZSBieSB0aGUgU0RLIGV2ZW50IGlkIGEgcmVzdG9yZWQgdHVybiBpcyBrZXllZCBieS5cblx0XHRcdGNvbnN0IHJvd3MgPSBhd2FpdCBkYkFsbChcblx0XHRcdFx0ZGIsXG5cdFx0XHRcdGBTRUxFQ1QgdS50dXJuX2lkIEFTIHR1cm5faWQsIHQuZXZlbnRfaWQgQVMgZXZlbnRfaWQsIHUudXNhZ2UgQVMgdXNhZ2Vcblx0XHRcdFx0RlJPTSB0dXJuX3VzYWdlIHUgTEVGVCBKT0lOIHR1cm5zIHQgT04gdC5pZCA9IHUudHVybl9pZGAsXG5cdFx0XHRcdFtdLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG5cdFx0XHRcdGNvbnN0IHVzYWdlID0gcm93LnVzYWdlIGFzIHN0cmluZztcblx0XHRcdFx0cmVzdWx0LnNldChyb3cudHVybl9pZCBhcyBzdHJpbmcsIHVzYWdlKTtcblx0XHRcdFx0Y29uc3QgZXZlbnRJZCA9IHJvdy5ldmVudF9pZCBhcyBzdHJpbmcgfCBudWxsO1xuXHRcdFx0XHRpZiAoZXZlbnRJZCkge1xuXHRcdFx0XHRcdHJlc3VsdC5zZXQoZXZlbnRJZCwgdXNhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHR9XG5cblx0c2V0VHVybkNoZWNrcG9pbnRSZWYodHVybklkOiBzdHJpbmcsIHJlZjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnSU5TRVJUIE9SIElHTk9SRSBJTlRPIHR1cm5zIChpZCkgVkFMVUVTICg/KScsIFt0dXJuSWRdKTtcblx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnVVBEQVRFIHR1cm5zIFNFVCBjaGVja3BvaW50X3JlZiA9ID8gV0hFUkUgaWQgPSA/JywgW3JlZiwgdHVybklkXSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRUdXJuQ2hlY2twb2ludFJlZih0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHJvdyA9IGF3YWl0IGRiR2V0KGRiLCAnU0VMRUNUIGNoZWNrcG9pbnRfcmVmIEZST00gdHVybnMgV0hFUkUgaWQgPSA/MSBPUiBldmVudF9pZCA9ID8xIExJTUlUIDEnLCBbdHVybklkXSk7XG5cdFx0cmV0dXJuIHJvdz8uY2hlY2twb2ludF9yZWYgYXMgc3RyaW5nIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldFByZXZpb3VzQ2hlY2twb2ludFJlZih0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHJvdyA9IGF3YWl0IGRiR2V0KFxuXHRcdFx0ZGIsXG5cdFx0XHRgU0VMRUNUIGNoZWNrcG9pbnRfcmVmIEZST00gdHVybnNcblx0XHRcdFx0V0hFUkUgcm93aWQgPCAoU0VMRUNUIHJvd2lkIEZST00gdHVybnMgV0hFUkUgaWQgPSA/MSBPUiBldmVudF9pZCA9ID8xIExJTUlUIDEpXG5cdFx0XHRcdFx0QU5EIGNoZWNrcG9pbnRfcmVmIElTIE5PVCBOVUxMXG5cdFx0XHRcdE9SREVSIEJZIHJvd2lkIERFU0MgTElNSVQgMWAsXG5cdFx0XHRbdHVybklkXSxcblx0XHQpO1xuXHRcdHJldHVybiByb3c/LmNoZWNrcG9pbnRfcmVmIGFzIHN0cmluZyB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRBbGxDaGVja3BvaW50UmVmcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHJvd3MgPSBhd2FpdCBkYkFsbChkYiwgJ1NFTEVDVCBjaGVja3BvaW50X3JlZiBGUk9NIHR1cm5zIFdIRVJFIGNoZWNrcG9pbnRfcmVmIElTIE5PVCBOVUxMIE9SREVSIEJZIHJvd2lkJywgW10pO1xuXHRcdHJldHVybiByb3dzLm1hcChyID0+IHIuY2hlY2twb2ludF9yZWYgYXMgc3RyaW5nKTtcblx0fVxuXG5cdHRydW5jYXRlRnJvbVR1cm4odHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbXV0YXRlVHVyblVzYWdlKGFzeW5jIGRiID0+IHtcblx0XHRcdC8vIERlbGV0ZSB0aGUgdGFyZ2V0IHR1cm4gYW5kIGFsbCB0dXJucyBpbnNlcnRlZCBhZnRlciBpdCAoYnkgcm93aWQgb3JkZXIpLlxuXHRcdFx0Ly8gRmlsZSBlZGl0cyBhbmQgdHVybiB1c2FnZSBjYXNjYWRlLWRlbGV0ZSB2aWEgdGhlaXIgZm9yZWlnbiBrZXlzLlxuXHRcdFx0YXdhaXQgZGJSdW4oZGIsXG5cdFx0XHRcdGBERUxFVEUgRlJPTSB0dXJucyBXSEVSRSByb3dpZCA+PSAoU0VMRUNUIHJvd2lkIEZST00gdHVybnMgV0hFUkUgaWQgPSA/KWAsXG5cdFx0XHRcdFt0dXJuSWRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdGRlbGV0ZVR1cm5zQWZ0ZXIodHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbXV0YXRlVHVyblVzYWdlKGFzeW5jIGRiID0+IHtcblx0XHRcdC8vIERlbGV0ZSBhbGwgdHVybnMgaW5zZXJ0ZWQgYWZ0ZXIgdGhlIGdpdmVuIHR1cm4gKGJ5IHJvd2lkIG9yZGVyKSxcblx0XHRcdC8vIGtlZXBpbmcgdGhlIGdpdmVuIHR1cm4gaXRzZWxmLiBGaWxlIGVkaXRzIGFuZCB0dXJuIHVzYWdlXG5cdFx0XHQvLyBjYXNjYWRlLWRlbGV0ZSB2aWEgdGhlaXIgZm9yZWlnbiBrZXlzLlxuXHRcdFx0YXdhaXQgZGJSdW4oZGIsXG5cdFx0XHRcdGBERUxFVEUgRlJPTSB0dXJucyBXSEVSRSByb3dpZCA+IChTRUxFQ1Qgcm93aWQgRlJPTSB0dXJucyBXSEVSRSBpZCA9ID8pYCxcblx0XHRcdFx0W3R1cm5JZF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0ZGVsZXRlQWxsVHVybnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX211dGF0ZVR1cm5Vc2FnZShhc3luYyBkYiA9PiB7XG5cdFx0XHQvLyBGaWxlIGVkaXRzIGFuZCB0dXJuIHVzYWdlIGNhc2NhZGUtZGVsZXRlIHZpYSB0aGVpciBmb3JlaWduIGtleXMuXG5cdFx0XHRhd2FpdCBkYkV4ZWMoZGIsICdERUxFVEUgRlJPTSB0dXJucycpO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tLSBMb2NhbCAoaG9zdC1pbmplY3RlZCkgdHVybnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0aW5zZXJ0TG9jYWxUdXJuKHJlY29yZDogSUxvY2FsVHVyblJlY29yZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFjayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYixcblx0XHRcdFx0J0lOU0VSVCBPUiBSRVBMQUNFIElOVE8gbG9jYWxfdHVybnMgKHR1cm5faWQsIGNoYXRfdXJpLCBhbmNob3JfdHVybl9pZCwgc2VxLCBwYXlsb2FkKSBWQUxVRVMgKD8sID8sID8sID8sID8pJyxcblx0XHRcdFx0W3JlY29yZC50dXJuSWQsIHJlY29yZC5jaGF0VXJpLCByZWNvcmQuYW5jaG9yVHVybklkID8/IG51bGwsIHJlY29yZC5zZXEsIHJlY29yZC5wYXlsb2FkXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRMb2NhbFR1cm5zKCk6IFByb21pc2U8SUxvY2FsVHVyblJlY29yZFtdPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHJvd3MgPSBhd2FpdCBkYkFsbChkYiwgJ1NFTEVDVCB0dXJuX2lkLCBjaGF0X3VyaSwgYW5jaG9yX3R1cm5faWQsIHNlcSwgcGF5bG9hZCBGUk9NIGxvY2FsX3R1cm5zIE9SREVSIEJZIHNlcScsIFtdKTtcblx0XHRyZXR1cm4gcm93cy5tYXAociA9PiAoe1xuXHRcdFx0dHVybklkOiByLnR1cm5faWQgYXMgc3RyaW5nLFxuXHRcdFx0Y2hhdFVyaTogci5jaGF0X3VyaSBhcyBzdHJpbmcsXG5cdFx0XHRhbmNob3JUdXJuSWQ6IChyLmFuY2hvcl90dXJuX2lkIGFzIHN0cmluZyB8IG51bGwpID8/IHVuZGVmaW5lZCxcblx0XHRcdHNlcTogci5zZXEgYXMgbnVtYmVyLFxuXHRcdFx0cGF5bG9hZDogci5wYXlsb2FkIGFzIHN0cmluZyxcblx0XHR9KSk7XG5cdH1cblxuXHRkZWxldGVMb2NhbFR1cm5zKHR1cm5JZHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0dXJuSWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRjb25zdCBwbGFjZWhvbGRlcnMgPSB0dXJuSWRzLm1hcCgoKSA9PiAnPycpLmpvaW4oJywnKTtcblx0XHRcdGF3YWl0IGRiUnVuKGRiLCBgREVMRVRFIEZST00gbG9jYWxfdHVybnMgV0hFUkUgdHVybl9pZCBJTiAoJHtwbGFjZWhvbGRlcnN9KWAsIFsuLi50dXJuSWRzXSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0tIEZpbGUgZWRpdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdG9yZUZpbGVFZGl0KGVkaXQ6IElGaWxlRWRpdFJlY29yZCAmIElGaWxlRWRpdENvbnRlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhY2soKCkgPT4gdGhpcy5fZmlsZUVkaXRTZXF1ZW5jZXIucXVldWUoZWRpdC5maWxlUGF0aCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0Ly8gRW5zdXJlIHRoZSB0dXJuIGV4aXN0cyBcdTIwMTQgbGF6aWx5IGluc2VydCBzaW5jZSB0aGUgdHVybiByZWNvcmRcblx0XHRcdC8vIG1heSBub3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYW4gZXhwbGljaXQgY3JlYXRlVHVybigpIGNhbGwuXG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0lOU0VSVCBPUiBJR05PUkUgSU5UTyB0dXJucyAoaWQpIFZBTFVFUyAoPyknLCBbZWRpdC50dXJuSWRdKTtcblx0XHRcdGF3YWl0IGRiUnVuKFxuXHRcdFx0XHRkYixcblx0XHRcdFx0YElOU0VSVCBPUiBSRVBMQUNFIElOVE8gZmlsZV9lZGl0c1xuXHRcdFx0XHRcdCh0dXJuX2lkLCB0b29sX2NhbGxfaWQsIGZpbGVfcGF0aCwgZWRpdF90eXBlLCBvcmlnaW5hbF9wYXRoLCBiZWZvcmVfY29udGVudCwgYWZ0ZXJfY29udGVudCwgYWRkZWRfbGluZXMsIHJlbW92ZWRfbGluZXMpXG5cdFx0XHRcdFZBTFVFUyAoPywgPywgPywgPywgPywgPywgPywgPywgPylgLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0ZWRpdC50dXJuSWQsXG5cdFx0XHRcdFx0ZWRpdC50b29sQ2FsbElkLFxuXHRcdFx0XHRcdGVkaXQuZmlsZVBhdGgsXG5cdFx0XHRcdFx0ZWRpdC5raW5kLFxuXHRcdFx0XHRcdGVkaXQub3JpZ2luYWxQYXRoID8/IG51bGwsXG5cdFx0XHRcdFx0ZWRpdC5iZWZvcmVDb250ZW50ID8gQnVmZmVyLmZyb20oZWRpdC5iZWZvcmVDb250ZW50KSA6IG51bGwsXG5cdFx0XHRcdFx0ZWRpdC5hZnRlckNvbnRlbnQgPyBCdWZmZXIuZnJvbShlZGl0LmFmdGVyQ29udGVudCkgOiBudWxsLFxuXHRcdFx0XHRcdGVkaXQuYWRkZWRMaW5lcyA/PyBudWxsLFxuXHRcdFx0XHRcdGVkaXQucmVtb3ZlZExpbmVzID8/IG51bGwsXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldEZpbGVFZGl0cyh0b29sQ2FsbElkczogc3RyaW5nW10pOiBQcm9taXNlPElGaWxlRWRpdFJlY29yZFtdPiB7XG5cdFx0aWYgKHRvb2xDYWxsSWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3QgcGxhY2Vob2xkZXJzID0gdG9vbENhbGxJZHMubWFwKCgpID0+ICc/Jykuam9pbignLCcpO1xuXHRcdGNvbnN0IHJvd3MgPSBhd2FpdCBkYkFsbChcblx0XHRcdGRiLFxuXHRcdFx0YFNFTEVDVCB0dXJuX2lkLCB0b29sX2NhbGxfaWQsIGZpbGVfcGF0aCwgZWRpdF90eXBlLCBvcmlnaW5hbF9wYXRoLCBhZGRlZF9saW5lcywgcmVtb3ZlZF9saW5lc1xuXHRcdFx0XHRGUk9NIGZpbGVfZWRpdHNcblx0XHRcdFx0V0hFUkUgdG9vbF9jYWxsX2lkIElOICgke3BsYWNlaG9sZGVyc30pXG5cdFx0XHRcdE9SREVSIEJZIHJvd2lkYCxcblx0XHRcdHRvb2xDYWxsSWRzLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHJvd3MubWFwKHJvdyA9PiAoe1xuXHRcdFx0dHVybklkOiByb3cudHVybl9pZCBhcyBzdHJpbmcsXG5cdFx0XHR0b29sQ2FsbElkOiByb3cudG9vbF9jYWxsX2lkIGFzIHN0cmluZyxcblx0XHRcdGZpbGVQYXRoOiByb3cuZmlsZV9wYXRoIGFzIHN0cmluZyxcblx0XHRcdGtpbmQ6IChyb3cuZWRpdF90eXBlIGFzIElGaWxlRWRpdFJlY29yZFsna2luZCddKSA/PyAnZWRpdCcsXG5cdFx0XHRvcmlnaW5hbFBhdGg6IHJvdy5vcmlnaW5hbF9wYXRoIGFzIHN0cmluZyB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQsXG5cdFx0XHRhZGRlZExpbmVzOiByb3cuYWRkZWRfbGluZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZCxcblx0XHRcdHJlbW92ZWRMaW5lczogcm93LnJlbW92ZWRfbGluZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRBbGxGaWxlRWRpdHMoKTogUHJvbWlzZTxJRmlsZUVkaXRSZWNvcmRbXT4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3dzID0gYXdhaXQgZGJBbGwoXG5cdFx0XHRkYixcblx0XHRcdGBTRUxFQ1QgdHVybl9pZCwgdG9vbF9jYWxsX2lkLCBmaWxlX3BhdGgsIGVkaXRfdHlwZSwgb3JpZ2luYWxfcGF0aCwgYWRkZWRfbGluZXMsIHJlbW92ZWRfbGluZXNcblx0XHRcdFx0RlJPTSBmaWxlX2VkaXRzXG5cdFx0XHRcdE9SREVSIEJZIHJvd2lkYCxcblx0XHRcdFtdLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHJvd3MubWFwKHJvdyA9PiAoe1xuXHRcdFx0dHVybklkOiByb3cudHVybl9pZCBhcyBzdHJpbmcsXG5cdFx0XHR0b29sQ2FsbElkOiByb3cudG9vbF9jYWxsX2lkIGFzIHN0cmluZyxcblx0XHRcdGZpbGVQYXRoOiByb3cuZmlsZV9wYXRoIGFzIHN0cmluZyxcblx0XHRcdGtpbmQ6IChyb3cuZWRpdF90eXBlIGFzIElGaWxlRWRpdFJlY29yZFsna2luZCddKSA/PyAnZWRpdCcsXG5cdFx0XHRvcmlnaW5hbFBhdGg6IHJvdy5vcmlnaW5hbF9wYXRoIGFzIHN0cmluZyB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQsXG5cdFx0XHRhZGRlZExpbmVzOiByb3cuYWRkZWRfbGluZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZCxcblx0XHRcdHJlbW92ZWRMaW5lczogcm93LnJlbW92ZWRfbGluZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRGaWxlRWRpdHNCeVR1cm4odHVybklkOiBzdHJpbmcpOiBQcm9taXNlPElGaWxlRWRpdFJlY29yZFtdPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHJvd3MgPSBhd2FpdCBkYkFsbChcblx0XHRcdGRiLFxuXHRcdFx0YFNFTEVDVCB0dXJuX2lkLCB0b29sX2NhbGxfaWQsIGZpbGVfcGF0aCwgZWRpdF90eXBlLCBvcmlnaW5hbF9wYXRoLCBhZGRlZF9saW5lcywgcmVtb3ZlZF9saW5lc1xuXHRcdFx0XHRGUk9NIGZpbGVfZWRpdHNcblx0XHRcdFx0V0hFUkUgdHVybl9pZCA9ID9cblx0XHRcdFx0T1JERVIgQlkgcm93aWRgLFxuXHRcdFx0W3R1cm5JZF0sXG5cdFx0KTtcblx0XHRyZXR1cm4gcm93cy5tYXAocm93ID0+ICh7XG5cdFx0XHR0dXJuSWQ6IHJvdy50dXJuX2lkIGFzIHN0cmluZyxcblx0XHRcdHRvb2xDYWxsSWQ6IHJvdy50b29sX2NhbGxfaWQgYXMgc3RyaW5nLFxuXHRcdFx0ZmlsZVBhdGg6IHJvdy5maWxlX3BhdGggYXMgc3RyaW5nLFxuXHRcdFx0a2luZDogKHJvdy5lZGl0X3R5cGUgYXMgSUZpbGVFZGl0UmVjb3JkWydraW5kJ10pID8/ICdlZGl0Jyxcblx0XHRcdG9yaWdpbmFsUGF0aDogcm93Lm9yaWdpbmFsX3BhdGggYXMgc3RyaW5nIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZCxcblx0XHRcdGFkZGVkTGluZXM6IHJvdy5hZGRlZF9saW5lcyBhcyBudW1iZXIgfCB1bmRlZmluZWQgPz8gdW5kZWZpbmVkLFxuXHRcdFx0cmVtb3ZlZExpbmVzOiByb3cucmVtb3ZlZF9saW5lcyBhcyBudW1iZXIgfCB1bmRlZmluZWQgPz8gdW5kZWZpbmVkLFxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHJlYWRGaWxlRWRpdENvbnRlbnQodG9vbENhbGxJZDogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxJRmlsZUVkaXRDb250ZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGVFZGl0U2VxdWVuY2VyLnF1ZXVlKGZpbGVQYXRoLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRjb25zdCByb3cgPSBhd2FpdCBkYkdldChcblx0XHRcdFx0ZGIsXG5cdFx0XHRcdGBTRUxFQ1QgYmVmb3JlX2NvbnRlbnQsIGFmdGVyX2NvbnRlbnRcblx0XHRcdFx0XHRGUk9NIGZpbGVfZWRpdHNcblx0XHRcdFx0XHRXSEVSRSB0b29sX2NhbGxfaWQgPSA/IEFORCBmaWxlX3BhdGggPSA/YCxcblx0XHRcdFx0W3Rvb2xDYWxsSWQsIGZpbGVQYXRoXSxcblx0XHRcdCk7XG5cdFx0XHRpZiAoIXJvdykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YmVmb3JlQ29udGVudDogcm93LmJlZm9yZV9jb250ZW50ID8gdG9VaW50OEFycmF5KHJvdy5iZWZvcmVfY29udGVudCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFmdGVyQ29udGVudDogcm93LmFmdGVyX2NvbnRlbnQgPyB0b1VpbnQ4QXJyYXkocm93LmFmdGVyX2NvbnRlbnQpIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLS0gU2Vzc2lvbiBtZXRhZGF0YSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGdldE1ldGFkYXRhKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93ID0gYXdhaXQgZGJHZXQoZGIsICdTRUxFQ1QgdmFsdWUgRlJPTSBzZXNzaW9uX21ldGFkYXRhIFdIRVJFIGtleSA9ID8nLCBba2V5XSk7XG5cdFx0cmV0dXJuIHJvdz8udmFsdWUgYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWV0YWRhdGFPYmplY3Q8VCBleHRlbmRzIFJlY29yZDxzdHJpbmcsIHVua25vd24+PihvYmo6IFQpOiBQcm9taXNlPHsgW0sgaW4ga2V5b2YgVF06IHN0cmluZyB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG9iaikgYXMgKGtleW9mIFQgJiBzdHJpbmcpW107XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdGNvbnN0IHJlc3VsdCA9IHt9IGFzIHsgW0sgaW4ga2V5b2YgVF06IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHBsYWNlaG9sZGVycyA9IGtleXMubWFwKCgpID0+ICc/Jykuam9pbignLCcpO1xuXHRcdGNvbnN0IHJvd3MgPSBhd2FpdCBkYkFsbChkYiwgYFNFTEVDVCBrZXksIHZhbHVlIEZST00gc2Vzc2lvbl9tZXRhZGF0YSBXSEVSRSBrZXkgSU4gKCR7cGxhY2Vob2xkZXJzfSlgLCBrZXlzKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRyZXN1bHRba2V5XSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuXHRcdFx0cmVzdWx0W3Jvdy5rZXkgYXMga2V5b2YgVF0gPSByb3cudmFsdWUgYXMgc3RyaW5nO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0c2V0TWV0YWRhdGEoa2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhY2soKCkgPT4gdGhpcy5fbWV0YWRhdGFTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0YXdhaXQgZGJSdW4oZGIsICdJTlNFUlQgT1IgUkVQTEFDRSBJTlRPIHNlc3Npb25fbWV0YWRhdGEgKGtleSwgdmFsdWUpIFZBTFVFUyAoPywgPyknLCBba2V5LCB2YWx1ZV0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldE1ldGFkYXRhVmFsdWVzKHZhbHVlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhY2soKCkgPT4gdGhpcy5fbWV0YWRhdGFTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0YXdhaXQgdGhpcy5fdHJhbnNhY3Rpb25TZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBkYkV4ZWMoZGIsICdCRUdJTiBUUkFOU0FDVElPTicpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlcykpIHtcblx0XHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnSU5TRVJUIE9SIFJFUExBQ0UgSU5UTyBzZXNzaW9uX21ldGFkYXRhIChrZXksIHZhbHVlKSBWQUxVRVMgKD8sID8pJywgW2tleSwgdmFsdWVdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgZGJFeGVjKGRiLCAnQ09NTUlUJyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGF3YWl0IGRiRXhlYyhkYiwgJ1JPTExCQUNLJyk7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRzZXRDaGF0RHJhZnQoY2hhdDogVVJJLCBkcmFmdDogTWVzc2FnZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBjaGF0LnRvU3RyaW5nKCk7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRcdGlmICghZHJhZnQpIHtcblx0XHRcdFx0YXdhaXQgZGJSdW4oZGIsICdERUxFVEUgRlJPTSBjaGF0X2RyYWZ0cyBXSEVSRSBjaGF0X3VyaSA9ID8nLCBbY2hhdFVyaV0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0lOU0VSVCBPUiBSRVBMQUNFIElOVE8gY2hhdF9kcmFmdHMgKGNoYXRfdXJpLCBkcmFmdCkgVkFMVUVTICg/LCA/KScsIFtjaGF0VXJpLCBKU09OLnN0cmluZ2lmeShkcmFmdCldKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldENoYXREcmFmdChjaGF0OiBVUkkpOiBQcm9taXNlPE1lc3NhZ2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93ID0gYXdhaXQgZGJHZXQoZGIsICdTRUxFQ1QgZHJhZnQgRlJPTSBjaGF0X2RyYWZ0cyBXSEVSRSBjaGF0X3VyaSA9ID8nLCBbY2hhdC50b1N0cmluZygpXSk7XG5cdFx0aWYgKHR5cGVvZiByb3c/LmRyYWZ0ICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKHJvdy5kcmFmdCkgYXMgTWVzc2FnZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBSZXZpZXdlZCBmaWxlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0bWFya0ZpbGVSZXZpZXdlZCh1cmk6IFVSSSwgbm9uY2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFjayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0lOU0VSVCBPUiBJR05PUkUgSU5UTyByZXZpZXdlZF9maWxlcyAodXJpLCBub25jZSkgVkFMVUVTICg/LCA/KScsIFt1cmkudG9TdHJpbmcoKSwgbm9uY2VdKTtcblx0XHR9KTtcblx0fVxuXG5cdHVubWFya0ZpbGVSZXZpZXdlZCh1cmk6IFVSSSwgbm9uY2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFjayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0RFTEVURSBGUk9NIHJldmlld2VkX2ZpbGVzIFdIRVJFIHVyaSA9ID8gQU5EIG5vbmNlID0gPycsIFt1cmkudG9TdHJpbmcoKSwgbm9uY2VdKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldFJldmlld2VkRmlsZXMoKTogUHJvbWlzZTxJUmV2aWV3ZWRGaWxlUmVjb3JkW10+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93cyA9IGF3YWl0IGRiQWxsKGRiLCAnU0VMRUNUIHVyaSwgbm9uY2UgRlJPTSByZXZpZXdlZF9maWxlcyBPUkRFUiBCWSByb3dpZCcsIFtdKTtcblx0XHRyZXR1cm4gcm93cy5tYXAodG9SZXZpZXdlZEZpbGVSZWNvcmQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0UmV2aWV3ZWRGaWxlc0ZvclVyaSh1cmk6IFVSSSk6IFByb21pc2U8SVJldmlld2VkRmlsZVJlY29yZFtdPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHJvd3MgPSBhd2FpdCBkYkFsbChkYiwgJ1NFTEVDVCB1cmksIG5vbmNlIEZST00gcmV2aWV3ZWRfZmlsZXMgV0hFUkUgdXJpID0gPyBPUkRFUiBCWSByb3dpZCcsIFt1cmkudG9TdHJpbmcoKV0pO1xuXHRcdHJldHVybiByb3dzLm1hcCh0b1Jldmlld2VkRmlsZVJlY29yZCk7XG5cdH1cblxuXHRhc3luYyBpc0ZpbGVSZXZpZXdlZCh1cmk6IFVSSSwgbm9uY2U6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3cgPSBhd2FpdCBkYkdldChkYiwgJ1NFTEVDVCAxIEZST00gcmV2aWV3ZWRfZmlsZXMgV0hFUkUgdXJpID0gPyBBTkQgbm9uY2UgPSA/IExJTUlUIDEnLCBbdXJpLnRvU3RyaW5nKCksIG5vbmNlXSk7XG5cdFx0cmV0dXJuICEhcm93O1xuXHR9XG5cblx0cmVtYXBUdXJuSWRzKG1hcHBpbmc6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPiwgZXZlbnRJZHM/OiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNdXRhdGVzIGB0dXJuX3VzYWdlYCwgc28gaXQgbXVzdCBzZXJpYWxpemUgd2l0aCBldmVyeSBvdGhlciBzdWNoXG5cdFx0Ly8gbXV0YXRpb24gXHUyMDE0IGEgdXNhZ2Ugd3JpdGUgcmFjaW5nIHRoZSBmb3JrIHRyYW5zYWN0aW9uIHdvdWxkIG90aGVyd2lzZVxuXHRcdC8vIGxhbmQgYWdhaW5zdCBlaXRoZXIgdGhlIG9sZCBvciB0aGUgbmV3IHR1cm4gaWQgdW5wcmVkaWN0YWJseS5cblx0XHRyZXR1cm4gdGhpcy5fbXV0YXRlVHVyblVzYWdlKGFzeW5jIGRiID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuX3RyYW5zYWN0aW9uU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gRGVmZXIgRksgY2hlY2tzIHRvIGNvbW1pdCB0aW1lIHNvIHdlIGNhbiB1cGRhdGUgdHVybnMuaWQgYW5kXG5cdFx0XHRcdC8vIGZpbGVfZWRpdHMudHVybl9pZCBpbiBhbnkgb3JkZXIgd2l0aG91dCBtaWQtc3RhdGVtZW50IHZpb2xhdGlvbnMuXG5cdFx0XHRcdC8vIFRoaXMgcHJhZ21hIGF1dG8tcmVzZXRzIGFmdGVyIHRoZSB0cmFuc2FjdGlvbiBlbmRzLlxuXHRcdFx0XHRhd2FpdCBkYkV4ZWMoZGIsICdQUkFHTUEgZGVmZXJfZm9yZWlnbl9rZXlzID0gT04nKTtcblx0XHRcdFx0YXdhaXQgZGJFeGVjKGRiLCAnQkVHSU4gVFJBTlNBQ1RJT04nKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBEZWxldGUgdHVybnMgbm90IHByZXNlbnQgaW4gdGhlIG1hcHBpbmcgKGUuZy4gdHVybnMgYmV5b25kXG5cdFx0XHRcdFx0Ly8gdGhlIGZvcmsgcG9pbnQpLiBGaWxlIGVkaXRzIGNhc2NhZGUtZGVsZXRlIHZpYSBGSy5cblx0XHRcdFx0XHRjb25zdCBvbGRJZHMgPSBbLi4ubWFwcGluZy5rZXlzKCldO1xuXHRcdFx0XHRcdGlmIChvbGRJZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJzID0gb2xkSWRzLm1hcCgoKSA9PiAnPycpLmpvaW4oJywnKTtcblx0XHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLFxuXHRcdFx0XHRcdFx0XHRgREVMRVRFIEZST00gdHVybnMgV0hFUkUgaWQgTk9UIElOICgke3BsYWNlaG9sZGVyc30pYCxcblx0XHRcdFx0XHRcdFx0b2xkSWRzLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSZW1hcCB0aGUgcmVtYWluaW5nIHR1cm4gSURzIHRvIHRoZWlyIG5ldyB2YWx1ZXNcblx0XHRcdFx0XHRmb3IgKGNvbnN0IFtvbGRJZCwgbmV3SWRdIG9mIG1hcHBpbmcpIHtcblx0XHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnVVBEQVRFIHR1cm5zIFNFVCBpZCA9ID8gV0hFUkUgaWQgPSA/JywgW25ld0lkLCBvbGRJZF0pO1xuXHRcdFx0XHRcdFx0YXdhaXQgZGJSdW4oZGIsICdVUERBVEUgZmlsZV9lZGl0cyBTRVQgdHVybl9pZCA9ID8gV0hFUkUgdHVybl9pZCA9ID8nLCBbbmV3SWQsIG9sZElkXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgW3R1cm5JZCwgZXZlbnRJZF0gb2YgZXZlbnRJZHMgPz8gW10pIHtcblx0XHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnVVBEQVRFIHR1cm5zIFNFVCBldmVudF9pZCA9ID8gV0hFUkUgaWQgPSA/JywgW2V2ZW50SWQsIHR1cm5JZF0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChvbGRJZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJzID0gb2xkSWRzLm1hcCgoKSA9PiAnPycpLmpvaW4oJywnKTtcblx0XHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLFxuXHRcdFx0XHRcdFx0XHRgREVMRVRFIEZST00gbG9jYWxfdHVybnMgV0hFUkUgdHVybl9pZCBOT1QgSU4gKCR7cGxhY2Vob2xkZXJzfSlgLFxuXHRcdFx0XHRcdFx0XHRvbGRJZHMsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IFtvbGRJZCwgbmV3SWRdIG9mIG1hcHBpbmcpIHtcblx0XHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnVVBEQVRFIGxvY2FsX3R1cm5zIFNFVCB0dXJuX2lkID0gPyBXSEVSRSB0dXJuX2lkID0gPycsIFtuZXdJZCwgb2xkSWRdKTtcblx0XHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnVVBEQVRFIGxvY2FsX3R1cm5zIFNFVCBhbmNob3JfdHVybl9pZCA9ID8gV0hFUkUgYW5jaG9yX3R1cm5faWQgPSA/JywgW25ld0lkLCBvbGRJZF0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFJvd3MgcGFzdCB0aGUgZm9yayBwb2ludCB3ZXJlIGFscmVhZHkgcmVtb3ZlZCBieSB0aGUgYHR1cm5zYFxuXHRcdFx0XHRcdC8vIGRlbGV0ZSBhYm92ZSwgdmlhIHRoZSBzYW1lIGNhc2NhZGUgYXMgZmlsZSBlZGl0cy4gVGhlIHN1cnZpdmluZ1xuXHRcdFx0XHRcdC8vIGlkcyBzdGlsbCBuZWVkIHJlbWFwcGluZyAodGhlIEZLIGNhc2NhZGVzIGRlbGV0ZXMsIG5vdCB1cGRhdGVzKSxcblx0XHRcdFx0XHQvLyBvciB0aGUgZm9ya2VkIHNlc3Npb24gd291bGQgcmVzdG9yZSB3aXRoIG5vIGdhdWdlIGFuZCB6ZXJvIGNvc3QuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBbb2xkSWQsIG5ld0lkXSBvZiBtYXBwaW5nKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ1VQREFURSB0dXJuX3VzYWdlIFNFVCB0dXJuX2lkID0gPyBXSEVSRSB0dXJuX2lkID0gPycsIFtuZXdJZCwgb2xkSWRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgZGJFeGVjKGRiLCAnQ09NTUlUJyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGF3YWl0IGRiRXhlYyhkYiwgJ1JPTExCQUNLJyk7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBvbmNlIGFsbCBjdXJyZW50bHkgaW4tZmxpZ2h0IHdyaXRlIG9wZXJhdGlvbnMgaGF2ZSBzZXR0bGVkLlxuXHQgKiBVc2VkIGJ5IGdyYWNlZnVsIHNodXRkb3duIHRvIGZsdXNoIHBlbmRpbmcgZmlyZS1hbmQtZm9yZ2V0IHdyaXRlc1xuXHQgKiBiZWZvcmUgdGhlIHByb2Nlc3MgZXhpdHMuIFNob3VsZCBiZSBjYWxsZWQgZnJvbSBhIHBhdGggd2hlcmUgbm9cblx0ICogZnVydGhlciB3cml0ZXMgYXJlIGV4cGVjdGVkOyBsb29wcyB1bnRpbCBpZGxlIHRvIGFsc28gZHJhaW4gYW55XG5cdCAqIHdyaXRlcyB0aGF0IGdldCBxdWV1ZWQgd2hpbGUgd2UncmUgYXdhaXRpbmcuXG5cdCAqL1xuXHRhc3luYyB3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAodGhpcy5fcGVuZGluZ1dyaXRlcy5zaXplID4gMCkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFsuLi50aGlzLl9wZW5kaW5nV3JpdGVzXSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdmFjdXVtSW50byh0YXJnZXRQYXRoOiBzdHJpbmcpIHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0YXdhaXQgZGJSdW4oZGIsICdWQUNVVU0gSU5UTyA/JywgW3RhcmdldFBhdGhdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXcmFwIGEgbXV0YXRpbmcgb3BlcmF0aW9uJ3MgcHJvbWlzZSBzbyB7QGxpbmsgd2hlbklkbGV9IGNhbiBhd2FpdCBpdC5cblx0ICogSW52b2tlIGF0IHRoZSAqKm91dGVybW9zdCoqIGxheWVyIG9mIGV2ZXJ5IHB1YmxpYyBtdXRhdGluZyBtZXRob2Qgc29cblx0ICogdGhhdCBhbnkgaW50ZXJuYWwgYXdhaXRzIChub3RhYmx5IGBfZW5zdXJlRGIoKWApIGFyZSBjb3ZlcmVkIHRvbyBcdTIwMTRcblx0ICogdHJhY2tpbmcgb25seSB0aGUgbGVhZiBgZGJSdW5gL2BkYkV4ZWNgIHdvdWxkIG1pc3MgdGhlIHdpbmRvd1xuXHQgKiBiZXR3ZWVuIHRoZSBtZXRob2QgYmVpbmcgY2FsbGVkIGFuZCB0aGUgcXVlcnkgYWN0dWFsbHkgYmVpbmcgcXVldWVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhY2s8VD4oZm46ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBwID0gZm4oKTtcblx0XHR0aGlzLl9wZW5kaW5nV3JpdGVzLmFkZChwKTtcblx0XHRjb25zdCB1bnRyYWNrID0gKCkgPT4geyB0aGlzLl9wZW5kaW5nV3JpdGVzLmRlbGV0ZShwKTsgfTtcblx0XHRwLnRoZW4odW50cmFjaywgdW50cmFjayk7XG5cdFx0cmV0dXJuIHA7XG5cdH1cblxuXHRhc3luYyBjbG9zZSgpIHtcblx0XHRhd2FpdCAodGhpcy5fY2xvc2VkID8/PSB0aGlzLl9kYlByb21pc2U/LnRoZW4oZGIgPT4gZGJDbG9zZShkYikpLmNhdGNoKCgpID0+IHsgfSkgfHwgdHJ1ZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b1Jldmlld2VkRmlsZVJlY29yZChyb3c6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogSVJldmlld2VkRmlsZVJlY29yZCB7XG5cdHJldHVybiB7XG5cdFx0dXJpOiBVUkkucGFyc2Uocm93LnVyaSBhcyBzdHJpbmcpLFxuXHRcdG5vbmNlOiByb3cubm9uY2UgYXMgc3RyaW5nLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b1VpbnQ4QXJyYXkodmFsdWU6IHVua25vd24pOiBVaW50OEFycmF5IHtcblx0aWYgKHZhbHVlIGluc3RhbmNlb2YgQnVmZmVyKSB7XG5cdFx0cmV0dXJuIG5ldyBVaW50OEFycmF5KHZhbHVlLmJ1ZmZlciwgdmFsdWUuYnl0ZU9mZnNldCwgdmFsdWUuYnl0ZUxlbmd0aCk7XG5cdH1cblx0aWYgKHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodmFsdWUpO1xuXHR9XG5cdHJldHVybiBuZXcgVWludDhBcnJheSgwKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLFdBQVcsc0JBQXNCO0FBRzFDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFtQmIsTUFBTSw0QkFBa0U7QUFBQSxFQUM5RTtBQUFBLElBQ0MsU0FBUztBQUFBLElBQ1QsS0FBSztBQUFBLE1BQ0o7QUFBQTtBQUFBO0FBQUEsTUFHQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBVUQsRUFBRSxLQUFLLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFDQTtBQUFBLElBQ0MsU0FBUztBQUFBLElBQ1QsS0FBSztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSU47QUFBQSxFQUNBO0FBQUEsSUFDQyxTQUFTO0FBQUEsSUFDVCxLQUFLO0FBQUE7QUFBQTtBQUFBLE1BR0o7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFZQTtBQUFBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBQ0E7QUFBQSxJQUNDLFNBQVM7QUFBQSxJQUNULEtBQUs7QUFBQSxNQUNKO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFDQTtBQUFBLElBQ0MsU0FBUztBQUFBLElBQ1QsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxTQUFTO0FBQUEsSUFDVCxLQUFLO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFJTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLFNBQVM7QUFBQSxJQUNULEtBQUs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS047QUFBQSxFQUNBO0FBQUEsSUFDQyxTQUFTO0FBQUEsSUFDVCxLQUFLO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLFNBQVM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBaUJULEtBQUs7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUlOO0FBQ0Q7QUFJQSxTQUFTLE9BQU8sSUFBYyxLQUE0QjtBQUN6RCxTQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUN2QyxPQUFHLEtBQUssS0FBSyxTQUFPLE1BQU0sT0FBTyxHQUFHLElBQUksUUFBUSxDQUFDO0FBQUEsRUFDbEQsQ0FBQztBQUNGO0FBRUEsU0FBUyxNQUFNLElBQWMsS0FBYSxRQUFpRTtBQUMxRyxTQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUN2QyxPQUFHLElBQUksS0FBSyxRQUFRLFNBQTJCLEtBQW1CO0FBQ2pFLFVBQUksS0FBSztBQUNSLGVBQU8sT0FBTyxHQUFHO0FBQUEsTUFDbEI7QUFDQSxjQUFRLEVBQUUsU0FBUyxLQUFLLFNBQVMsUUFBUSxLQUFLLE9BQU8sQ0FBQztBQUFBLElBQ3ZELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRjtBQUVBLFNBQVMsTUFBTSxJQUFjLEtBQWEsUUFBaUU7QUFDMUcsU0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsT0FBRyxJQUFJLEtBQUssUUFBUSxDQUFDLEtBQW1CLFFBQTZDO0FBQ3BGLFVBQUksS0FBSztBQUNSLGVBQU8sT0FBTyxHQUFHO0FBQUEsTUFDbEI7QUFDQSxjQUFRLEdBQUc7QUFBQSxJQUNaLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRjtBQUVBLFNBQVMsTUFBTSxJQUFjLEtBQWEsUUFBdUQ7QUFDaEcsU0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsT0FBRyxJQUFJLEtBQUssUUFBUSxDQUFDLEtBQW1CLFNBQW9DO0FBQzNFLFVBQUksS0FBSztBQUNSLGVBQU8sT0FBTyxHQUFHO0FBQUEsTUFDbEI7QUFDQSxjQUFRLElBQUk7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRjtBQUVBLFNBQVMsUUFBUSxJQUE2QjtBQUM3QyxTQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUN2QyxPQUFHLE1BQU0sU0FBTyxNQUFNLE9BQU8sR0FBRyxJQUFJLFFBQVEsQ0FBQztBQUFBLEVBQzlDLENBQUM7QUFDRjtBQUVBLFNBQVMsT0FBTyxNQUFpQztBQUNoRCxTQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUN2QyxXQUFPLGlCQUFpQixFQUFFLEtBQUssYUFBVztBQUN6QyxZQUFNLEtBQUssSUFBSSxRQUFRLFFBQVEsU0FBUyxNQUFNLENBQUMsUUFBc0I7QUFDcEUsWUFBSSxLQUFLO0FBQ1IsaUJBQU8sT0FBTyxHQUFHO0FBQUEsUUFDbEI7QUFDQSxnQkFBUSxFQUFFO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRixHQUFHLE1BQU07QUFBQSxFQUNWLENBQUM7QUFDRjtBQVFBLGVBQXNCLGNBQWMsSUFBYyxZQUFpRTtBQUdsSCxRQUFNLE9BQU8sSUFBSSwwQkFBMEI7QUFFM0MsUUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJLHVCQUF1QixDQUFDLENBQUM7QUFDckQsUUFBTSxpQkFBa0IsS0FBSyxnQkFBdUM7QUFFcEUsUUFBTSxVQUFVLFdBQ2QsT0FBTyxPQUFLLEVBQUUsVUFBVSxjQUFjLEVBQ3RDLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxVQUFVLEVBQUUsT0FBTztBQUV0QyxNQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCO0FBQUEsRUFDRDtBQUVBLFFBQU0sT0FBTyxJQUFJLG1CQUFtQjtBQUNwQyxNQUFJO0FBQ0gsZUFBVyxhQUFhLFNBQVM7QUFDaEMsWUFBTSxPQUFPLElBQUksVUFBVSxHQUFHO0FBRTlCLFlBQU0sT0FBTyxJQUFJLHlCQUF5QixVQUFVLE9BQU8sRUFBRTtBQUFBLElBQzlEO0FBQ0EsVUFBTSxPQUFPLElBQUksUUFBUTtBQUFBLEVBQzFCLFNBQVMsS0FBSztBQUNiLFVBQU0sT0FBTyxJQUFJLFVBQVU7QUFDM0IsVUFBTTtBQUFBLEVBQ1A7QUFDRDtBQVlPLE1BQU0sZ0JBQTRDO0FBQUEsRUFzQ3hELFlBQ2tCLE9BQ0EsY0FBb0QsMkJBQ3BFO0FBRmdCO0FBQ0E7QUFwQ2xCLFNBQWlCLHFCQUFxQixJQUFJLGVBQXVCO0FBRWpFLFNBQWlCLHFCQUFxQixJQUFJLFVBQVU7QUFDcEQsU0FBaUIsd0JBQXdCLElBQUksVUFBVTtBQVV2RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsc0JBQXNCLElBQUksVUFBVTtBQW1CckQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsaUJBQWlCLG9CQUFJLElBQXNCO0FBQUEsRUFLeEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBbEJJLGlCQUFpQixXQUEyRDtBQUNuRixXQUFPLEtBQUssT0FBTyxNQUFNLEtBQUssb0JBQW9CLE1BQU0sWUFBWSxVQUFVLE1BQU0sS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDdkc7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUF1QkEsYUFBYSxLQUFLLE1BQWMsYUFBbUQsMkJBQXFEO0FBQ3ZJLFVBQU0sT0FBTyxJQUFJLGdCQUFnQixNQUFNLFVBQVU7QUFDakQsVUFBTSxLQUFLLFVBQVU7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVVLFlBQStCO0FBQ3hDLFFBQUksS0FBSyxTQUFTO0FBQ2pCLGFBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxtQ0FBbUMsQ0FBQztBQUFBLElBQ3JFO0FBQ0EsUUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQixXQUFLLGNBQWMsWUFBWTtBQUc5QixjQUFNLEdBQUcsU0FBUyxNQUFNLFFBQVEsS0FBSyxLQUFLLEdBQUcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUNoRSxjQUFNLEtBQUssTUFBTSxPQUFPLEtBQUssS0FBSztBQUNsQyxZQUFJO0FBQ0gsZ0JBQU0sY0FBYyxJQUFJLEtBQUssV0FBVztBQUFBLFFBQ3pDLFNBQVMsS0FBSztBQUNiLGdCQUFNLFFBQVEsRUFBRTtBQUNoQixlQUFLLGFBQWE7QUFDbEIsZ0JBQU07QUFBQSxRQUNQO0FBRUEsWUFBSSxLQUFLLFNBQVM7QUFDakIsZ0JBQU0sUUFBUSxFQUFFO0FBQ2hCLGdCQUFNLElBQUksTUFBTSxtQ0FBbUM7QUFBQSxRQUNwRDtBQUNBLGVBQU87QUFBQSxNQUNSLEdBQUcsRUFBRSxNQUFNLFNBQU87QUFDakIsYUFBSyxhQUFhO0FBQ2xCLGNBQU07QUFBQSxNQUNQLENBQUM7QUFBQSxJQUNGO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFNLGVBQWtDO0FBQ3ZDLFVBQU0sS0FBSyxNQUFNLEtBQUssVUFBVTtBQUNoQyxVQUFNLE9BQU8sTUFBTSxNQUFNLElBQUksbUVBQW1FLENBQUMsQ0FBQztBQUNsRyxXQUFPLEtBQUssSUFBSSxPQUFLLEVBQUUsSUFBYztBQUFBLEVBQ3RDO0FBQUE7QUFBQSxFQUlBLFdBQVcsUUFBK0I7QUFDekMsV0FBTyxLQUFLLE9BQU8sWUFBWTtBQUM5QixZQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsWUFBTSxNQUFNLElBQUksK0NBQStDLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDeEUsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLFdBQVcsUUFBK0I7QUFDekMsV0FBTyxLQUFLLGlCQUFpQixPQUFNLE9BQU07QUFFeEMsWUFBTSxNQUFNLElBQUksa0NBQWtDLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDM0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGVBQWUsUUFBZ0IsU0FBZ0M7QUFDOUQsV0FBTyxLQUFLLE9BQU8sWUFBWTtBQUM5QixZQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsWUFBTSxNQUFNLElBQUksK0NBQStDLENBQUMsTUFBTSxDQUFDO0FBSXZFLFlBQU0sTUFBTSxJQUFJLG1FQUFtRSxDQUFDLFNBQVMsTUFBTSxDQUFDO0FBQUEsSUFDckcsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sZUFBZSxRQUE2QztBQUNqRSxVQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsVUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJLHFFQUFxRSxDQUFDLE1BQU0sQ0FBQztBQUN6RyxXQUFPLEtBQUssWUFBa0M7QUFBQSxFQUMvQztBQUFBLEVBRUEsTUFBTSxtQkFBbUIsUUFBNkM7QUFDckUsVUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBT2hDLFVBQU0sTUFBTSxNQUFNO0FBQUEsTUFDakI7QUFBQSxNQUNBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUtBLENBQUMsTUFBTTtBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUssWUFBa0M7QUFBQSxFQUMvQztBQUFBLEVBRUEsTUFBTSxzQkFBbUQ7QUFDeEQsVUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFVBQU0sTUFBTSxNQUFNLE1BQU0sSUFBSSxxREFBcUQsQ0FBQyxDQUFDO0FBQ25GLFdBQU8sS0FBSyxZQUFrQztBQUFBLEVBQy9DO0FBQUEsRUFFQSxhQUFhLFFBQWdCLE9BQThCO0FBQzFELFdBQU8sS0FBSyxpQkFBaUIsT0FBTSxPQUFNO0FBS3hDLFlBQU0sTUFBTSxJQUFJLCtDQUErQyxDQUFDLE1BQU0sQ0FBQztBQUN2RSxZQUFNLE1BQU0sSUFBSSxvRUFBb0UsQ0FBQyxRQUFRLEtBQUssQ0FBQztBQUFBLElBQ3BHLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGdCQUE4QztBQUtuRCxXQUFPLEtBQUssb0JBQW9CLE1BQU0sWUFBWTtBQUNqRCxZQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFHaEMsWUFBTSxPQUFPLE1BQU07QUFBQSxRQUNsQjtBQUFBLFFBQ0E7QUFBQTtBQUFBLFFBRUEsQ0FBQztBQUFBLE1BQ0Y7QUFDQSxZQUFNLFNBQVMsb0JBQUksSUFBb0I7QUFDdkMsaUJBQVcsT0FBTyxNQUFNO0FBQ3ZCLGNBQU0sUUFBUSxJQUFJO0FBQ2xCLGVBQU8sSUFBSSxJQUFJLFNBQW1CLEtBQUs7QUFDdkMsY0FBTSxVQUFVLElBQUk7QUFDcEIsWUFBSSxTQUFTO0FBQ1osaUJBQU8sSUFBSSxTQUFTLEtBQUs7QUFBQSxRQUMxQjtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEscUJBQXFCLFFBQWdCLEtBQTRCO0FBQ2hFLFdBQU8sS0FBSyxPQUFPLFlBQVk7QUFDOUIsWUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFlBQU0sTUFBTSxJQUFJLCtDQUErQyxDQUFDLE1BQU0sQ0FBQztBQUN2RSxZQUFNLE1BQU0sSUFBSSxvREFBb0QsQ0FBQyxLQUFLLE1BQU0sQ0FBQztBQUFBLElBQ2xGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLHFCQUFxQixRQUE2QztBQUN2RSxVQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsVUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJLDJFQUEyRSxDQUFDLE1BQU0sQ0FBQztBQUMvRyxXQUFPLEtBQUssa0JBQXdDO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQU0seUJBQXlCLFFBQTZDO0FBQzNFLFVBQU0sS0FBSyxNQUFNLEtBQUssVUFBVTtBQUNoQyxVQUFNLE1BQU0sTUFBTTtBQUFBLE1BQ2pCO0FBQUEsTUFDQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSUEsQ0FBQyxNQUFNO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxrQkFBd0M7QUFBQSxFQUNyRDtBQUFBLEVBRUEsTUFBTSx1QkFBMEM7QUFDL0MsVUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFVBQU0sT0FBTyxNQUFNLE1BQU0sSUFBSSxvRkFBb0YsQ0FBQyxDQUFDO0FBQ25ILFdBQU8sS0FBSyxJQUFJLE9BQUssRUFBRSxjQUF3QjtBQUFBLEVBQ2hEO0FBQUEsRUFFQSxpQkFBaUIsUUFBK0I7QUFDL0MsV0FBTyxLQUFLLGlCQUFpQixPQUFNLE9BQU07QUFHeEMsWUFBTTtBQUFBLFFBQU07QUFBQSxRQUNYO0FBQUEsUUFDQSxDQUFDLE1BQU07QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsaUJBQWlCLFFBQStCO0FBQy9DLFdBQU8sS0FBSyxpQkFBaUIsT0FBTSxPQUFNO0FBSXhDLFlBQU07QUFBQSxRQUFNO0FBQUEsUUFDWDtBQUFBLFFBQ0EsQ0FBQyxNQUFNO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGlCQUFnQztBQUMvQixXQUFPLEtBQUssaUJBQWlCLE9BQU0sT0FBTTtBQUV4QyxZQUFNLE9BQU8sSUFBSSxtQkFBbUI7QUFBQSxJQUNyQyxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFJQSxnQkFBZ0IsUUFBeUM7QUFDeEQsV0FBTyxLQUFLLE9BQU8sWUFBWTtBQUM5QixZQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsWUFBTTtBQUFBLFFBQU07QUFBQSxRQUNYO0FBQUEsUUFDQSxDQUFDLE9BQU8sUUFBUSxPQUFPLFNBQVMsT0FBTyxnQkFBZ0IsTUFBTSxPQUFPLEtBQUssT0FBTyxPQUFPO0FBQUEsTUFDeEY7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGdCQUE2QztBQUNsRCxVQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsVUFBTSxPQUFPLE1BQU0sTUFBTSxJQUFJLHdGQUF3RixDQUFDLENBQUM7QUFDdkgsV0FBTyxLQUFLLElBQUksUUFBTTtBQUFBLE1BQ3JCLFFBQVEsRUFBRTtBQUFBLE1BQ1YsU0FBUyxFQUFFO0FBQUEsTUFDWCxjQUFlLEVBQUUsa0JBQW9DO0FBQUEsTUFDckQsS0FBSyxFQUFFO0FBQUEsTUFDUCxTQUFTLEVBQUU7QUFBQSxJQUNaLEVBQUU7QUFBQSxFQUNIO0FBQUEsRUFFQSxpQkFBaUIsU0FBMkM7QUFDM0QsV0FBTyxLQUFLLE9BQU8sWUFBWTtBQUM5QixVQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCO0FBQUEsTUFDRDtBQUNBLFlBQU0sS0FBSyxNQUFNLEtBQUssVUFBVTtBQUNoQyxZQUFNLGVBQWUsUUFBUSxJQUFJLE1BQU0sR0FBRyxFQUFFLEtBQUssR0FBRztBQUNwRCxZQUFNLE1BQU0sSUFBSSw2Q0FBNkMsWUFBWSxLQUFLLENBQUMsR0FBRyxPQUFPLENBQUM7QUFBQSxJQUMzRixDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFJQSxjQUFjLE1BQXlEO0FBQ3RFLFdBQU8sS0FBSyxPQUFPLE1BQU0sS0FBSyxtQkFBbUIsTUFBTSxLQUFLLFVBQVUsWUFBWTtBQUNqRixZQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFHaEMsWUFBTSxNQUFNLElBQUksK0NBQStDLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDNUUsWUFBTTtBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUE7QUFBQTtBQUFBLFFBR0E7QUFBQSxVQUNDLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUssZ0JBQWdCO0FBQUEsVUFDckIsS0FBSyxnQkFBZ0IsT0FBTyxLQUFLLEtBQUssYUFBYSxJQUFJO0FBQUEsVUFDdkQsS0FBSyxlQUFlLE9BQU8sS0FBSyxLQUFLLFlBQVksSUFBSTtBQUFBLFVBQ3JELEtBQUssY0FBYztBQUFBLFVBQ25CLEtBQUssZ0JBQWdCO0FBQUEsUUFDdEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLGFBQWEsYUFBbUQ7QUFDckUsUUFBSSxZQUFZLFdBQVcsR0FBRztBQUM3QixhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsVUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFVBQU0sZUFBZSxZQUFZLElBQUksTUFBTSxHQUFHLEVBQUUsS0FBSyxHQUFHO0FBQ3hELFVBQU0sT0FBTyxNQUFNO0FBQUEsTUFDbEI7QUFBQSxNQUNBO0FBQUE7QUFBQSw2QkFFMEIsWUFBWTtBQUFBO0FBQUEsTUFFdEM7QUFBQSxJQUNEO0FBQ0EsV0FBTyxLQUFLLElBQUksVUFBUTtBQUFBLE1BQ3ZCLFFBQVEsSUFBSTtBQUFBLE1BQ1osWUFBWSxJQUFJO0FBQUEsTUFDaEIsVUFBVSxJQUFJO0FBQUEsTUFDZCxNQUFPLElBQUksYUFBeUM7QUFBQSxNQUNwRCxjQUFjLElBQUksaUJBQXVDO0FBQUEsTUFDekQsWUFBWSxJQUFJLGVBQXFDO0FBQUEsTUFDckQsY0FBYyxJQUFJLGlCQUF1QztBQUFBLElBQzFELEVBQUU7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLGtCQUE4QztBQUNuRCxVQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsVUFBTSxPQUFPLE1BQU07QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQTtBQUFBO0FBQUEsTUFHQSxDQUFDO0FBQUEsSUFDRjtBQUNBLFdBQU8sS0FBSyxJQUFJLFVBQVE7QUFBQSxNQUN2QixRQUFRLElBQUk7QUFBQSxNQUNaLFlBQVksSUFBSTtBQUFBLE1BQ2hCLFVBQVUsSUFBSTtBQUFBLE1BQ2QsTUFBTyxJQUFJLGFBQXlDO0FBQUEsTUFDcEQsY0FBYyxJQUFJLGlCQUF1QztBQUFBLE1BQ3pELFlBQVksSUFBSSxlQUFxQztBQUFBLE1BQ3JELGNBQWMsSUFBSSxpQkFBdUM7QUFBQSxJQUMxRCxFQUFFO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsUUFBNEM7QUFDcEUsVUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFVBQU0sT0FBTyxNQUFNO0FBQUEsTUFDbEI7QUFBQSxNQUNBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFJQSxDQUFDLE1BQU07QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLElBQUksVUFBUTtBQUFBLE1BQ3ZCLFFBQVEsSUFBSTtBQUFBLE1BQ1osWUFBWSxJQUFJO0FBQUEsTUFDaEIsVUFBVSxJQUFJO0FBQUEsTUFDZCxNQUFPLElBQUksYUFBeUM7QUFBQSxNQUNwRCxjQUFjLElBQUksaUJBQXVDO0FBQUEsTUFDekQsWUFBWSxJQUFJLGVBQXFDO0FBQUEsTUFDckQsY0FBYyxJQUFJLGlCQUF1QztBQUFBLElBQzFELEVBQUU7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLG9CQUFvQixZQUFvQixVQUF5RDtBQUN0RyxXQUFPLEtBQUssbUJBQW1CLE1BQU0sVUFBVSxZQUFZO0FBQzFELFlBQU0sS0FBSyxNQUFNLEtBQUssVUFBVTtBQUNoQyxZQUFNLE1BQU0sTUFBTTtBQUFBLFFBQ2pCO0FBQUEsUUFDQTtBQUFBO0FBQUE7QUFBQSxRQUdBLENBQUMsWUFBWSxRQUFRO0FBQUEsTUFDdEI7QUFDQSxVQUFJLENBQUMsS0FBSztBQUNULGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTztBQUFBLFFBQ04sZUFBZSxJQUFJLGlCQUFpQixhQUFhLElBQUksY0FBYyxJQUFJO0FBQUEsUUFDdkUsY0FBYyxJQUFJLGdCQUFnQixhQUFhLElBQUksYUFBYSxJQUFJO0FBQUEsTUFDckU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQSxFQUlBLE1BQU0sWUFBWSxLQUEwQztBQUMzRCxVQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsVUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJLG9EQUFvRCxDQUFDLEdBQUcsQ0FBQztBQUNyRixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFNLGtCQUFxRCxLQUF5RDtBQUNuSCxVQUFNLE9BQU8sT0FBTyxLQUFLLEdBQUc7QUFFNUIsVUFBTSxTQUFTLENBQUM7QUFDaEIsUUFBSSxLQUFLLFdBQVcsR0FBRztBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sS0FBSyxNQUFNLEtBQUssVUFBVTtBQUNoQyxVQUFNLGVBQWUsS0FBSyxJQUFJLE1BQU0sR0FBRyxFQUFFLEtBQUssR0FBRztBQUNqRCxVQUFNLE9BQU8sTUFBTSxNQUFNLElBQUkseURBQXlELFlBQVksS0FBSyxJQUFJO0FBQzNHLGVBQVcsT0FBTyxNQUFNO0FBQ3ZCLGFBQU8sR0FBRyxJQUFJO0FBQUEsSUFDZjtBQUNBLGVBQVcsT0FBTyxNQUFNO0FBQ3ZCLGFBQU8sSUFBSSxHQUFjLElBQUksSUFBSTtBQUFBLElBQ2xDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFlBQVksS0FBYSxPQUE4QjtBQUN0RCxXQUFPLEtBQUssT0FBTyxNQUFNLEtBQUssbUJBQW1CLE1BQU0sWUFBWTtBQUNsRSxZQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsWUFBTSxNQUFNLElBQUksc0VBQXNFLENBQUMsS0FBSyxLQUFLLENBQUM7QUFBQSxJQUNuRyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxrQkFBa0IsUUFBeUQ7QUFDMUUsV0FBTyxLQUFLLE9BQU8sTUFBTSxLQUFLLG1CQUFtQixNQUFNLFlBQVk7QUFDbEUsWUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFlBQU0sS0FBSyxzQkFBc0IsTUFBTSxZQUFZO0FBQ2xELGNBQU0sT0FBTyxJQUFJLG1CQUFtQjtBQUNwQyxZQUFJO0FBQ0gscUJBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsTUFBTSxHQUFHO0FBQ2xELGtCQUFNLE1BQU0sSUFBSSxzRUFBc0UsQ0FBQyxLQUFLLEtBQUssQ0FBQztBQUFBLFVBQ25HO0FBQ0EsZ0JBQU0sT0FBTyxJQUFJLFFBQVE7QUFBQSxRQUMxQixTQUFTLEtBQUs7QUFDYixnQkFBTSxPQUFPLElBQUksVUFBVTtBQUMzQixnQkFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLGFBQWEsTUFBVyxPQUEyQztBQUNsRSxVQUFNLFVBQVUsS0FBSyxTQUFTO0FBQzlCLFdBQU8sS0FBSyxPQUFPLFlBQVk7QUFDOUIsWUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsY0FBTSxNQUFNLElBQUksOENBQThDLENBQUMsT0FBTyxDQUFDO0FBQ3ZFO0FBQUEsTUFDRDtBQUNBLFlBQU0sTUFBTSxJQUFJLHNFQUFzRSxDQUFDLFNBQVMsS0FBSyxVQUFVLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDdkgsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sYUFBYSxNQUF5QztBQUMzRCxVQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsVUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJLG9EQUFvRCxDQUFDLEtBQUssU0FBUyxDQUFDLENBQUM7QUFDakcsUUFBSSxPQUFPLEtBQUssVUFBVSxVQUFVO0FBQ25DLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSTtBQUNILGFBQU8sS0FBSyxNQUFNLElBQUksS0FBSztBQUFBLElBQzVCLFFBQVE7QUFDUCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBSUEsaUJBQWlCLEtBQVUsT0FBOEI7QUFDeEQsV0FBTyxLQUFLLE9BQU8sWUFBWTtBQUM5QixZQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsWUFBTSxNQUFNLElBQUksbUVBQW1FLENBQUMsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO0FBQUEsSUFDM0csQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLG1CQUFtQixLQUFVLE9BQThCO0FBQzFELFdBQU8sS0FBSyxPQUFPLFlBQVk7QUFDOUIsWUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFlBQU0sTUFBTSxJQUFJLDBEQUEwRCxDQUFDLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztBQUFBLElBQ2xHLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLG1CQUFtRDtBQUN4RCxVQUFNLEtBQUssTUFBTSxLQUFLLFVBQVU7QUFDaEMsVUFBTSxPQUFPLE1BQU0sTUFBTSxJQUFJLHdEQUF3RCxDQUFDLENBQUM7QUFDdkYsV0FBTyxLQUFLLElBQUksb0JBQW9CO0FBQUEsRUFDckM7QUFBQSxFQUVBLE1BQU0sdUJBQXVCLEtBQTBDO0FBQ3RFLFVBQU0sS0FBSyxNQUFNLEtBQUssVUFBVTtBQUNoQyxVQUFNLE9BQU8sTUFBTSxNQUFNLElBQUksc0VBQXNFLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQztBQUNuSCxXQUFPLEtBQUssSUFBSSxvQkFBb0I7QUFBQSxFQUNyQztBQUFBLEVBRUEsTUFBTSxlQUFlLEtBQVUsT0FBaUM7QUFDL0QsVUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFVBQU0sTUFBTSxNQUFNLE1BQU0sSUFBSSxvRUFBb0UsQ0FBQyxJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7QUFDdkgsV0FBTyxDQUFDLENBQUM7QUFBQSxFQUNWO0FBQUEsRUFFQSxhQUFhLFNBQXNDLFVBQXVEO0FBSXpHLFdBQU8sS0FBSyxpQkFBaUIsT0FBTSxPQUFNO0FBQ3hDLFlBQU0sS0FBSyxzQkFBc0IsTUFBTSxZQUFZO0FBSWxELGNBQU0sT0FBTyxJQUFJLGdDQUFnQztBQUNqRCxjQUFNLE9BQU8sSUFBSSxtQkFBbUI7QUFDcEMsWUFBSTtBQUdILGdCQUFNLFNBQVMsQ0FBQyxHQUFHLFFBQVEsS0FBSyxDQUFDO0FBQ2pDLGNBQUksT0FBTyxTQUFTLEdBQUc7QUFDdEIsa0JBQU0sZUFBZSxPQUFPLElBQUksTUFBTSxHQUFHLEVBQUUsS0FBSyxHQUFHO0FBQ25ELGtCQUFNO0FBQUEsY0FBTTtBQUFBLGNBQ1gsc0NBQXNDLFlBQVk7QUFBQSxjQUNsRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBR0EscUJBQVcsQ0FBQyxPQUFPLEtBQUssS0FBSyxTQUFTO0FBQ3JDLGtCQUFNLE1BQU0sSUFBSSx3Q0FBd0MsQ0FBQyxPQUFPLEtBQUssQ0FBQztBQUN0RSxrQkFBTSxNQUFNLElBQUksdURBQXVELENBQUMsT0FBTyxLQUFLLENBQUM7QUFBQSxVQUN0RjtBQUNBLHFCQUFXLENBQUMsUUFBUSxPQUFPLEtBQUssWUFBWSxDQUFDLEdBQUc7QUFDL0Msa0JBQU0sTUFBTSxJQUFJLDhDQUE4QyxDQUFDLFNBQVMsTUFBTSxDQUFDO0FBQUEsVUFDaEY7QUFFQSxjQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLGtCQUFNLGVBQWUsT0FBTyxJQUFJLE1BQU0sR0FBRyxFQUFFLEtBQUssR0FBRztBQUNuRCxrQkFBTTtBQUFBLGNBQU07QUFBQSxjQUNYLGlEQUFpRCxZQUFZO0FBQUEsY0FDN0Q7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUNBLHFCQUFXLENBQUMsT0FBTyxLQUFLLEtBQUssU0FBUztBQUNyQyxrQkFBTSxNQUFNLElBQUksd0RBQXdELENBQUMsT0FBTyxLQUFLLENBQUM7QUFDdEYsa0JBQU0sTUFBTSxJQUFJLHNFQUFzRSxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBQUEsVUFDckc7QUFNQSxxQkFBVyxDQUFDLE9BQU8sS0FBSyxLQUFLLFNBQVM7QUFDckMsa0JBQU0sTUFBTSxJQUFJLHVEQUF1RCxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBQUEsVUFDdEY7QUFDQSxnQkFBTSxPQUFPLElBQUksUUFBUTtBQUFBLFFBQzFCLFNBQVMsS0FBSztBQUNiLGdCQUFNLE9BQU8sSUFBSSxVQUFVO0FBQzNCLGdCQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU0EsTUFBTSxXQUEwQjtBQUMvQixXQUFPLEtBQUssZUFBZSxPQUFPLEdBQUc7QUFDcEMsWUFBTSxRQUFRLFdBQVcsQ0FBQyxHQUFHLEtBQUssY0FBYyxDQUFDO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFdBQVcsWUFBb0I7QUFDcEMsVUFBTSxLQUFLLE1BQU0sS0FBSyxVQUFVO0FBQ2hDLFVBQU0sTUFBTSxJQUFJLGlCQUFpQixDQUFDLFVBQVUsQ0FBQztBQUFBLEVBQzlDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNRLE9BQVUsSUFBa0M7QUFDbkQsVUFBTSxJQUFJLEdBQUc7QUFDYixTQUFLLGVBQWUsSUFBSSxDQUFDO0FBQ3pCLFVBQU0sVUFBVSxNQUFNO0FBQUUsV0FBSyxlQUFlLE9BQU8sQ0FBQztBQUFBLElBQUc7QUFDdkQsTUFBRSxLQUFLLFNBQVMsT0FBTztBQUN2QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxRQUFRO0FBQ2IsV0FBTyxLQUFLLFlBQVksS0FBSyxZQUFZLEtBQUssUUFBTSxRQUFRLEVBQUUsQ0FBQyxFQUFFLE1BQU0sTUFBTTtBQUFBLElBQUUsQ0FBQyxLQUFLO0FBQUEsRUFDdEY7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxNQUFNO0FBQUEsRUFDWjtBQUNEO0FBRUEsU0FBUyxxQkFBcUIsS0FBbUQ7QUFDaEYsU0FBTztBQUFBLElBQ04sS0FBSyxJQUFJLE1BQU0sSUFBSSxHQUFhO0FBQUEsSUFDaEMsT0FBTyxJQUFJO0FBQUEsRUFDWjtBQUNEO0FBRUEsU0FBUyxhQUFhLE9BQTRCO0FBQ2pELE1BQUksaUJBQWlCLFFBQVE7QUFDNUIsV0FBTyxJQUFJLFdBQVcsTUFBTSxRQUFRLE1BQU0sWUFBWSxNQUFNLFVBQVU7QUFBQSxFQUN2RTtBQUNBLE1BQUksaUJBQWlCLFlBQVk7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFdBQU8sSUFBSSxZQUFZLEVBQUUsT0FBTyxLQUFLO0FBQUEsRUFDdEM7QUFDQSxTQUFPLElBQUksV0FBVyxDQUFDO0FBQ3hCOyIsCiAgIm5hbWVzIjogW10KfQo=
