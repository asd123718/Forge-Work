import { mkdirSync } from "fs";
import { createRequire } from "module";
import { dirname } from "../../../../base/common/path.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { CopilotChatAttr, GenAiAttr } from "../../common/genAiAttributes.js";
const nodeRequire = createRequire(import.meta.url);
function loadSqlite() {
  return nodeRequire("node:sqlite");
}
const SCHEMA_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
const DEFAULT_MAX_SESSIONS = 100;
const DENORMALIZED_ATTRS = {
  operation_name: GenAiAttr.OPERATION_NAME,
  provider_name: GenAiAttr.PROVIDER_NAME,
  agent_name: GenAiAttr.AGENT_NAME,
  conversation_id: GenAiAttr.CONVERSATION_ID,
  request_model: GenAiAttr.REQUEST_MODEL,
  response_model: GenAiAttr.RESPONSE_MODEL,
  input_tokens: GenAiAttr.USAGE_INPUT_TOKENS,
  output_tokens: GenAiAttr.USAGE_OUTPUT_TOKENS,
  cached_tokens: GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS,
  reasoning_tokens: GenAiAttr.USAGE_REASONING_TOKENS,
  tool_name: GenAiAttr.TOOL_NAME,
  tool_call_id: GenAiAttr.TOOL_CALL_ID,
  tool_type: GenAiAttr.TOOL_TYPE,
  chat_session_id: CopilotChatAttr.CHAT_SESSION_ID,
  turn_index: CopilotChatAttr.TURN_INDEX,
  ttft_ms: CopilotChatAttr.TIME_TO_FIRST_TOKEN
};
const IOTelSqliteStore = createDecorator("otelSqliteStore");
class OTelSqliteStore {
  constructor(dbPath) {
    this._db = null;
    // Cached prepared statements (created once per DB connection in _ensureDb)
    this._insertSpanStmt = null;
    this._insertAttrStmt = null;
    this._insertEventStmt = null;
    this._beginTx = null;
    this._commitTx = null;
    this._rollbackTx = null;
    this._dbPath = dbPath;
  }
  get dbPath() {
    return this._dbPath;
  }
  /**
   * Insert a completed span and its attributes/events into the database.
   */
  insertSpan(span) {
    this._ensureDb();
    try {
      this._beginTx.run();
      this._insertSpanStmt.run(
        span.spanId,
        span.traceId,
        span.parentSpanId ?? null,
        span.name,
        span.startTime,
        span.endTime,
        span.status.code,
        span.status.message ?? null,
        this._attr(span, DENORMALIZED_ATTRS.operation_name),
        this._attr(span, DENORMALIZED_ATTRS.provider_name),
        this._attr(span, DENORMALIZED_ATTRS.agent_name),
        this._attr(span, DENORMALIZED_ATTRS.conversation_id),
        this._attr(span, DENORMALIZED_ATTRS.request_model),
        this._attr(span, DENORMALIZED_ATTRS.response_model),
        this._attr(span, DENORMALIZED_ATTRS.input_tokens),
        this._attr(span, DENORMALIZED_ATTRS.output_tokens),
        this._attr(span, DENORMALIZED_ATTRS.cached_tokens),
        this._attr(span, DENORMALIZED_ATTRS.reasoning_tokens),
        this._attr(span, DENORMALIZED_ATTRS.tool_name),
        this._attr(span, DENORMALIZED_ATTRS.tool_call_id),
        this._attr(span, DENORMALIZED_ATTRS.tool_type),
        this._attr(span, DENORMALIZED_ATTRS.chat_session_id),
        this._attr(span, DENORMALIZED_ATTRS.turn_index),
        this._ttftMs(span)
      );
      for (const [key, value] of Object.entries(span.attributes)) {
        const serialized = Array.isArray(value) ? JSON.stringify(value) : String(value);
        this._insertAttrStmt.run(span.spanId, key, serialized);
      }
      for (const event of span.events) {
        const eventAttrs = event.attributes ? JSON.stringify(event.attributes) : null;
        this._insertEventStmt.run(span.spanId, event.name, event.timestamp, eventAttrs);
      }
      this._commitTx.run();
    } catch (err) {
      try {
        this._rollbackTx.run();
      } catch {
      }
      throw err;
    }
  }
  getSpansByTraceId(traceId) {
    return this._ensureDb().prepare("SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time_ms").all(traceId);
  }
  getSpansByConversationId(conversationId) {
    return this._ensureDb().prepare("SELECT * FROM spans WHERE conversation_id = ? OR chat_session_id = ? ORDER BY start_time_ms").all(conversationId, conversationId);
  }
  getSpanAttributes(spanId) {
    return this._ensureDb().prepare("SELECT key, value FROM span_attributes WHERE span_id = ?").all(spanId);
  }
  getSpanAttribute(spanId, key) {
    const row = this._ensureDb().prepare("SELECT value FROM span_attributes WHERE span_id = ? AND key = ?").get(spanId, key);
    return row?.value ?? null;
  }
  getSpanEvents(spanId) {
    return this._ensureDb().prepare("SELECT * FROM span_events WHERE span_id = ? ORDER BY timestamp_ms").all(spanId);
  }
  getTraceIds(conversationId) {
    const db = this._ensureDb();
    if (conversationId) {
      const rows = db.prepare(
        "SELECT DISTINCT trace_id FROM spans WHERE conversation_id = ? OR chat_session_id = ?"
      ).all(conversationId, conversationId);
      return rows.map((r) => r.trace_id);
    }
    return db.prepare("SELECT DISTINCT trace_id FROM spans").all().map((r) => r.trace_id);
  }
  /**
   * List all sessions with aggregated metrics, ordered by most recent first.
   * Uses the `sessions` SQL view over the spans table.
   */
  getSessions(limit) {
    const sql = limit ? "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?" : "SELECT * FROM sessions ORDER BY started_at DESC";
    return limit ? this._ensureDb().prepare(sql).all(limit) : this._ensureDb().prepare(sql).all();
  }
  /**
   * List sessions within a time window (chronicle-style).
   * @param sinceMs Epoch ms — only return sessions that started after this time
   */
  getSessionsSince(sinceMs) {
    return this._ensureDb().prepare(
      "SELECT * FROM sessions WHERE started_at >= ? ORDER BY started_at DESC"
    ).all(sinceMs);
  }
  cleanup(maxAgeMs = DEFAULT_MAX_AGE_MS) {
    const cutoffMs = Date.now() - maxAgeMs;
    const result = this._ensureDb().prepare("DELETE FROM spans WHERE start_time_ms < ?").run(cutoffMs);
    return Number(result.changes);
  }
  /**
   * Checkpoint WAL to flush all pending writes into the main .db file.
   * This must be called before copying the .db file, otherwise the copy
   * will be missing data that lives only in the -wal file.
   */
  checkpoint() {
    this._ensureDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
      this._insertSpanStmt = null;
      this._insertAttrStmt = null;
      this._insertEventStmt = null;
      this._beginTx = null;
      this._commitTx = null;
      this._rollbackTx = null;
    }
  }
  // -- Private ------------------------------------------------------------
  _attr(span, attrKey) {
    const val = span.attributes[attrKey];
    if (val === void 0) {
      return null;
    }
    if (Array.isArray(val)) {
      return JSON.stringify(val);
    }
    if (typeof val === "boolean") {
      return val ? 1 : 0;
    }
    return val;
  }
  /**
   * Coalesce TTFT from foreground extension (`copilot_chat.time_to_first_token`, ms)
   * and CLI runtime. The CLI runtime historically emitted `github.copilot.time_to_first_chunk`
   * (seconds) but is migrating to the OTel GenAI semconv attribute
   * `gen_ai.response.time_to_first_chunk` (also seconds). Accept both for forward/backward
   * compatibility while the runtime rollout completes.
   *
   * @see https://github.com/open-telemetry/semantic-conventions/pull/3607 (semconv addition)
   */
  _ttftMs(span) {
    const foreground = this._attr(span, CopilotChatAttr.TIME_TO_FIRST_TOKEN);
    if (foreground !== null) {
      return foreground;
    }
    const cli = span.attributes["gen_ai.response.time_to_first_chunk"] ?? span.attributes["github.copilot.time_to_first_chunk"];
    if (cli === void 0) {
      return null;
    }
    const sec = typeof cli === "number" ? cli : parseFloat(String(cli));
    return isNaN(sec) ? null : Math.round(sec * 1e3);
  }
  _ensureDb() {
    if (this._db) {
      return this._db;
    }
    if (this._dbPath !== ":memory:") {
      mkdirSync(dirname(this._dbPath), { recursive: true });
    }
    const { DatabaseSync: DatabaseSyncCtor } = loadSqlite();
    const db = new DatabaseSyncCtor(this._dbPath);
    try {
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA busy_timeout = 3000");
      db.exec("PRAGMA foreign_keys = ON");
      this._db = db;
      this._ensureSchema();
      this._prepareStatements(db);
      this._cleanupOnStartup(db);
    } catch (err) {
      db.close();
      this._db = null;
      throw err;
    }
    return this._db;
  }
  _prepareStatements(db) {
    this._insertSpanStmt = db.prepare(`
			INSERT OR REPLACE INTO spans (
				span_id, trace_id, parent_span_id, name,
				start_time_ms, end_time_ms, status_code, status_message,
				operation_name, provider_name, agent_name, conversation_id,
				request_model, response_model,
				input_tokens, output_tokens, cached_tokens, reasoning_tokens,
				tool_name, tool_call_id, tool_type,
				chat_session_id, turn_index, ttft_ms
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
    this._insertAttrStmt = db.prepare(
      "INSERT OR REPLACE INTO span_attributes (span_id, key, value) VALUES (?, ?, ?)"
    );
    this._insertEventStmt = db.prepare(
      "INSERT INTO span_events (span_id, name, timestamp_ms, attributes) VALUES (?, ?, ?, ?)"
    );
    this._beginTx = db.prepare("BEGIN");
    this._commitTx = db.prepare("COMMIT");
    this._rollbackTx = db.prepare("ROLLBACK");
  }
  _ensureSchema() {
    const db = this._db;
    const versionRow = (() => {
      try {
        return db.prepare("SELECT version FROM schema_version LIMIT 1").get();
      } catch {
        return void 0;
      }
    })();
    if ((versionRow?.version ?? 0) >= SCHEMA_VERSION) {
      return;
    }
    db.exec(`
			CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
			INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION});

			CREATE TABLE IF NOT EXISTS spans (
				span_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_span_id TEXT,
				name TEXT NOT NULL, start_time_ms INTEGER NOT NULL, end_time_ms INTEGER NOT NULL,
				status_code INTEGER NOT NULL DEFAULT 0, status_message TEXT,
				operation_name TEXT, provider_name TEXT, agent_name TEXT, conversation_id TEXT,
				request_model TEXT, response_model TEXT,
				input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, reasoning_tokens INTEGER,
				tool_name TEXT, tool_call_id TEXT, tool_type TEXT,
				chat_session_id TEXT, turn_index INTEGER, ttft_ms REAL
			);

			CREATE TABLE IF NOT EXISTS span_attributes (
				span_id TEXT NOT NULL REFERENCES spans(span_id) ON DELETE CASCADE,
				key TEXT NOT NULL, value TEXT,
				PRIMARY KEY (span_id, key)
			);

			CREATE TABLE IF NOT EXISTS span_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				span_id TEXT NOT NULL REFERENCES spans(span_id) ON DELETE CASCADE,
				name TEXT NOT NULL, timestamp_ms INTEGER NOT NULL, attributes TEXT
			);

			CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
			CREATE INDEX IF NOT EXISTS idx_spans_conversation ON spans(conversation_id);
			CREATE INDEX IF NOT EXISTS idx_spans_chat_session ON spans(chat_session_id);
			CREATE INDEX IF NOT EXISTS idx_spans_operation ON spans(operation_name);
			CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time_ms);
			CREATE INDEX IF NOT EXISTS idx_span_events_span ON span_events(span_id);

			-- Session view: derives session boundaries from span data.
			-- No separate sessions table needed \u2014 invoke_agent spans define session lifecycle.
			CREATE VIEW IF NOT EXISTS sessions AS
			SELECT
				COALESCE(conversation_id, chat_session_id) AS session_id,
				agent_name,
				response_model AS model,
				MIN(start_time_ms) AS started_at,
				MAX(end_time_ms) AS ended_at,
				MAX(end_time_ms) - MIN(start_time_ms) AS duration_ms,
				COUNT(*) AS span_count,
				SUM(CASE WHEN operation_name = 'chat' THEN 1 ELSE 0 END) AS llm_calls,
				SUM(CASE WHEN operation_name = 'execute_tool' THEN 1 ELSE 0 END) AS tool_calls,
				SUM(CASE WHEN operation_name = 'chat' THEN input_tokens ELSE 0 END) AS total_input_tokens,
				SUM(CASE WHEN operation_name = 'chat' THEN output_tokens ELSE 0 END) AS total_output_tokens,
				SUM(CASE WHEN operation_name = 'chat' THEN cached_tokens ELSE 0 END) AS total_cached_tokens
			FROM spans
			WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
			GROUP BY COALESCE(conversation_id, chat_session_id);
		`);
  }
  _cleanupOnStartup(db) {
    const cutoffMs = Date.now() - DEFAULT_MAX_AGE_MS;
    db.prepare("DELETE FROM spans WHERE start_time_ms < ?").run(cutoffMs);
    const sessionCutoff = db.prepare(`
			SELECT MIN(max_start) AS cutoff_ms FROM (
				SELECT MAX(start_time_ms) AS max_start
				FROM spans
				WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
				GROUP BY COALESCE(conversation_id, chat_session_id)
				ORDER BY max_start DESC
				LIMIT ?
			)
		`).get(DEFAULT_MAX_SESSIONS);
    if (sessionCutoff?.cutoff_ms) {
      db.prepare(`
				DELETE FROM spans
				WHERE start_time_ms < ?
				AND COALESCE(conversation_id, chat_session_id) NOT IN (
					SELECT COALESCE(conversation_id, chat_session_id)
					FROM spans
					WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
					GROUP BY COALESCE(conversation_id, chat_session_id)
					ORDER BY MAX(start_time_ms) DESC
					LIMIT ?
				)
			`).run(sessionCutoff.cutoff_ms, DEFAULT_MAX_SESSIONS);
    }
  }
}
export {
  IOTelSqliteStore,
  OTelSqliteStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcb3RlbFxcbm9kZVxcc3FsaXRlXFxvdGVsU3FsaXRlU3RvcmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBta2RpclN5bmMgfSBmcm9tICdmcyc7XG4vLyBUaGUgJ25vZGU6bW9kdWxlJyBzcGVjaWZpZXIgaXMgdW5yZXNvbHZhYmxlIGJ5IHRoZSBFbGVjdHJvbiByZW5kZXJlclxuLy8gRVNNIGxvYWRlciAodXNlZCBieSB0aGUgdW5pdCB0ZXN0IGhhcm5lc3MpLCBzbyB1c2UgdGhlIGJhcmUgZm9ybS5cbmltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tICdtb2R1bGUnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgdHlwZSB7IERhdGFiYXNlU3luYywgU3RhdGVtZW50U3luYyB9IGZyb20gJ25vZGU6c3FsaXRlJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ29waWxvdENoYXRBdHRyLCBHZW5BaUF0dHIgfSBmcm9tICcuLi8uLi9jb21tb24vZ2VuQWlBdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbXBsZXRlZFNwYW5EYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NwYW5EYXRhLmpzJztcblxuLy8gYG5vZGU6c3FsaXRlYCBpcyBjdXJyZW50bHkgYW4gZXhwZXJpbWVudGFsIE5vZGUgbW9kdWxlIGFuZCBpcyBub3Rcbi8vIHJlYWNoYWJsZSB2aWEgYSBzdGF0aWMgYGltcG9ydGAgdW5kZXIgb3VyIGxheWVyIHJ1bGVzIChpdCB3b3VsZCBhbHNvXG4vLyBsb2FkIHN5bmNocm9ub3VzbHkgb24gc3RhcnR1cCkuIFVzZSBjcmVhdGVSZXF1aXJlIHNvIHRoZSBiaW5kaW5nIGlzXG4vLyBvbmx5IHJlc29sdmVkIHdoZW4gdGhlIHN0b3JlIGlzIGFjdHVhbGx5IG9wZW5lZC5cbmNvbnN0IG5vZGVSZXF1aXJlID0gY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuZnVuY3Rpb24gbG9hZFNxbGl0ZSgpOiB0eXBlb2YgaW1wb3J0KCdub2RlOnNxbGl0ZScpIHtcblx0cmV0dXJuIG5vZGVSZXF1aXJlKCdub2RlOnNxbGl0ZScpIGFzIHR5cGVvZiBpbXBvcnQoJ25vZGU6c3FsaXRlJyk7XG59XG5cbi8qKiBTY2hlbWEgdmVyc2lvbiBcdTIwMTQgYnVtcCB3aGVuIGFsdGVyaW5nIHRhYmxlcyBzbyBleGlzdGluZyBEQnMgZ2V0IG1pZ3JhdGVkLiAqL1xuY29uc3QgU0NIRU1BX1ZFUlNJT04gPSAxO1xuXG4vLyAtLSBSZXRlbnRpb24gY29uc3RhbnRzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogTWF4IGFnZSBmb3Igc3BhbiBkYXRhIGJlZm9yZSBjbGVhbnVwLiAqL1xuY29uc3QgREVGQVVMVF9NQVhfQUdFX01TID0gNyAqIDI0ICogNjAgKiA2MCAqIDEwMDA7IC8vIDcgZGF5c1xuXG4vKiogTWF4IG51bWJlciBvZiBzZXNzaW9ucyAoYnkgY29udmVyc2F0aW9uX2lkKSB0byByZXRhaW4uICovXG5jb25zdCBERUZBVUxUX01BWF9TRVNTSU9OUyA9IDEwMDtcblxuLyoqXG4gKiBLZXlzIGV4dHJhY3RlZCBmcm9tIElDb21wbGV0ZWRTcGFuRGF0YS5hdHRyaWJ1dGVzIGFuZCBkZW5vcm1hbGl6ZWQgaW50byB0aGUgc3BhbnMgdGFibGVcbiAqIGZvciBpbmRleGVkIHF1ZXJ5IGFjY2Vzcy4gVGhlIGtleSBpcyB0aGUgU1FMIGNvbHVtbiBuYW1lLCB0aGUgdmFsdWUgaXMgdGhlIE9UZWwgYXR0cmlidXRlIGtleS5cbiAqL1xuY29uc3QgREVOT1JNQUxJWkVEX0FUVFJTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRvcGVyYXRpb25fbmFtZTogR2VuQWlBdHRyLk9QRVJBVElPTl9OQU1FLFxuXHRwcm92aWRlcl9uYW1lOiBHZW5BaUF0dHIuUFJPVklERVJfTkFNRSxcblx0YWdlbnRfbmFtZTogR2VuQWlBdHRyLkFHRU5UX05BTUUsXG5cdGNvbnZlcnNhdGlvbl9pZDogR2VuQWlBdHRyLkNPTlZFUlNBVElPTl9JRCxcblx0cmVxdWVzdF9tb2RlbDogR2VuQWlBdHRyLlJFUVVFU1RfTU9ERUwsXG5cdHJlc3BvbnNlX21vZGVsOiBHZW5BaUF0dHIuUkVTUE9OU0VfTU9ERUwsXG5cdGlucHV0X3Rva2VuczogR2VuQWlBdHRyLlVTQUdFX0lOUFVUX1RPS0VOUyxcblx0b3V0cHV0X3Rva2VuczogR2VuQWlBdHRyLlVTQUdFX09VVFBVVF9UT0tFTlMsXG5cdGNhY2hlZF90b2tlbnM6IEdlbkFpQXR0ci5VU0FHRV9DQUNIRV9SRUFEX0lOUFVUX1RPS0VOUyxcblx0cmVhc29uaW5nX3Rva2VuczogR2VuQWlBdHRyLlVTQUdFX1JFQVNPTklOR19UT0tFTlMsXG5cdHRvb2xfbmFtZTogR2VuQWlBdHRyLlRPT0xfTkFNRSxcblx0dG9vbF9jYWxsX2lkOiBHZW5BaUF0dHIuVE9PTF9DQUxMX0lELFxuXHR0b29sX3R5cGU6IEdlbkFpQXR0ci5UT09MX1RZUEUsXG5cdGNoYXRfc2Vzc2lvbl9pZDogQ29waWxvdENoYXRBdHRyLkNIQVRfU0VTU0lPTl9JRCxcblx0dHVybl9pbmRleDogQ29waWxvdENoYXRBdHRyLlRVUk5fSU5ERVgsXG5cdHR0ZnRfbXM6IENvcGlsb3RDaGF0QXR0ci5USU1FX1RPX0ZJUlNUX1RPS0VOLFxufTtcblxuLy8gLS0gU2VydmljZSBpZGVudGlmaWVyIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IElPVGVsU3FsaXRlU3RvcmUgPSBjcmVhdGVEZWNvcmF0b3I8T1RlbFNxbGl0ZVN0b3JlPignb3RlbFNxbGl0ZVN0b3JlJyk7XG5cbi8vIC0tIFJvdyB0eXBlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBpbnRlcmZhY2UgU3BhblJvdyB7XG5cdHNwYW5faWQ6IHN0cmluZztcblx0dHJhY2VfaWQ6IHN0cmluZztcblx0cGFyZW50X3NwYW5faWQ6IHN0cmluZyB8IG51bGw7XG5cdG5hbWU6IHN0cmluZztcblx0c3RhcnRfdGltZV9tczogbnVtYmVyO1xuXHRlbmRfdGltZV9tczogbnVtYmVyO1xuXHRzdGF0dXNfY29kZTogbnVtYmVyO1xuXHRzdGF0dXNfbWVzc2FnZTogc3RyaW5nIHwgbnVsbDtcblx0b3BlcmF0aW9uX25hbWU6IHN0cmluZyB8IG51bGw7XG5cdHByb3ZpZGVyX25hbWU6IHN0cmluZyB8IG51bGw7XG5cdGFnZW50X25hbWU6IHN0cmluZyB8IG51bGw7XG5cdGNvbnZlcnNhdGlvbl9pZDogc3RyaW5nIHwgbnVsbDtcblx0cmVxdWVzdF9tb2RlbDogc3RyaW5nIHwgbnVsbDtcblx0cmVzcG9uc2VfbW9kZWw6IHN0cmluZyB8IG51bGw7XG5cdGlucHV0X3Rva2VuczogbnVtYmVyIHwgbnVsbDtcblx0b3V0cHV0X3Rva2VuczogbnVtYmVyIHwgbnVsbDtcblx0Y2FjaGVkX3Rva2VuczogbnVtYmVyIHwgbnVsbDtcblx0cmVhc29uaW5nX3Rva2VuczogbnVtYmVyIHwgbnVsbDtcblx0dG9vbF9uYW1lOiBzdHJpbmcgfCBudWxsO1xuXHR0b29sX2NhbGxfaWQ6IHN0cmluZyB8IG51bGw7XG5cdHRvb2xfdHlwZTogc3RyaW5nIHwgbnVsbDtcblx0Y2hhdF9zZXNzaW9uX2lkOiBzdHJpbmcgfCBudWxsO1xuXHR0dXJuX2luZGV4OiBudW1iZXIgfCBudWxsO1xuXHR0dGZ0X21zOiBudW1iZXIgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNwYW5FdmVudFJvdyB7XG5cdGlkOiBudW1iZXI7XG5cdHNwYW5faWQ6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHR0aW1lc3RhbXBfbXM6IG51bWJlcjtcblx0YXR0cmlidXRlczogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZXNzaW9uUm93IHtcblx0c2Vzc2lvbl9pZDogc3RyaW5nO1xuXHRhZ2VudF9uYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRtb2RlbDogc3RyaW5nIHwgbnVsbDtcblx0c3RhcnRlZF9hdDogbnVtYmVyO1xuXHRlbmRlZF9hdDogbnVtYmVyO1xuXHRkdXJhdGlvbl9tczogbnVtYmVyO1xuXHRzcGFuX2NvdW50OiBudW1iZXI7XG5cdGxsbV9jYWxsczogbnVtYmVyO1xuXHR0b29sX2NhbGxzOiBudW1iZXI7XG5cdHRvdGFsX2lucHV0X3Rva2VuczogbnVtYmVyO1xuXHR0b3RhbF9vdXRwdXRfdG9rZW5zOiBudW1iZXI7XG5cdHRvdGFsX2NhY2hlZF90b2tlbnM6IG51bWJlcjtcbn1cblxuLy8gLS0gU3RvcmUgaW1wbGVtZW50YXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBBbHdheXMtb24gU1FMaXRlIHN0b3JlIGZvciBPVGVsIHNwYW4gZGF0YSB1c2luZyBub2RlOnNxbGl0ZSBEYXRhYmFzZVN5bmMuXG4gKlxuICogQ29uc3VtZXJzIGNhbGwge0BsaW5rIGluc2VydFNwYW59IHdpdGggYSBzZXJpYWxpemVkIGNvbXBsZXRlZCBzcGFuOyB0aGUgc3RvcmVcbiAqIHBlcnNpc3RzIHNwYW4gYXR0cmlidXRlcyBhbmQgZXZlbnRzIHdpdGggZGVub3JtYWxpemVkIGNvbHVtbnMgZm9yIHRoZSBtb3N0XG4gKiBjb21tb24gR2VuQUkgc2VtY29udiBhdHRyaWJ1dGVzIChzbyB0aGUgZXZhbCBoYXJuZXNzIGNhbiBxdWVyeSB3aXRob3V0IGpvaW5pbmcpLlxuICpcbiAqIC0gV0FMIG1vZGUgKyBidXN5X3RpbWVvdXQgZm9yIGNvbmN1cnJlbnQgcmVhZC93cml0ZSBzYWZldHlcbiAqIC0gU2NoZW1hIHZlcnNpb25pbmcgd2l0aCBtaWdyYXRpb24gdGFibGVcbiAqIC0gTGF6eSBpbml0aWFsaXphdGlvbiAoREIgY3JlYXRlZCBvbiBmaXJzdCB3cml0ZSlcbiAqIC0gU3luY2hyb25vdXMgRGF0YWJhc2VTeW5jIEFQSVxuICovXG5leHBvcnQgY2xhc3MgT1RlbFNxbGl0ZVN0b3JlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RiOiBEYXRhYmFzZVN5bmMgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGJQYXRoOiBzdHJpbmc7XG5cblx0Ly8gQ2FjaGVkIHByZXBhcmVkIHN0YXRlbWVudHMgKGNyZWF0ZWQgb25jZSBwZXIgREIgY29ubmVjdGlvbiBpbiBfZW5zdXJlRGIpXG5cdHByaXZhdGUgX2luc2VydFNwYW5TdG10OiBTdGF0ZW1lbnRTeW5jIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2luc2VydEF0dHJTdG10OiBTdGF0ZW1lbnRTeW5jIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2luc2VydEV2ZW50U3RtdDogU3RhdGVtZW50U3luYyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9iZWdpblR4OiBTdGF0ZW1lbnRTeW5jIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbW1pdFR4OiBTdGF0ZW1lbnRTeW5jIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3JvbGxiYWNrVHg6IFN0YXRlbWVudFN5bmMgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihkYlBhdGg6IHN0cmluZykge1xuXHRcdHRoaXMuX2RiUGF0aCA9IGRiUGF0aDtcblx0fVxuXG5cdGdldCBkYlBhdGgoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZGJQYXRoO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluc2VydCBhIGNvbXBsZXRlZCBzcGFuIGFuZCBpdHMgYXR0cmlidXRlcy9ldmVudHMgaW50byB0aGUgZGF0YWJhc2UuXG5cdCAqL1xuXHRpbnNlcnRTcGFuKHNwYW46IElDb21wbGV0ZWRTcGFuRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX2Vuc3VyZURiKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fYmVnaW5UeCEucnVuKCk7XG5cblx0XHRcdHRoaXMuX2luc2VydFNwYW5TdG10IS5ydW4oXG5cdFx0XHRcdHNwYW4uc3BhbklkLCBzcGFuLnRyYWNlSWQsIHNwYW4ucGFyZW50U3BhbklkID8/IG51bGwsIHNwYW4ubmFtZSxcblx0XHRcdFx0c3Bhbi5zdGFydFRpbWUsIHNwYW4uZW5kVGltZSwgc3Bhbi5zdGF0dXMuY29kZSwgc3Bhbi5zdGF0dXMubWVzc2FnZSA/PyBudWxsLFxuXHRcdFx0XHR0aGlzLl9hdHRyKHNwYW4sIERFTk9STUFMSVpFRF9BVFRSUy5vcGVyYXRpb25fbmFtZSksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLnByb3ZpZGVyX25hbWUpLFxuXHRcdFx0XHR0aGlzLl9hdHRyKHNwYW4sIERFTk9STUFMSVpFRF9BVFRSUy5hZ2VudF9uYW1lKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMuY29udmVyc2F0aW9uX2lkKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMucmVxdWVzdF9tb2RlbCksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLnJlc3BvbnNlX21vZGVsKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMuaW5wdXRfdG9rZW5zKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMub3V0cHV0X3Rva2VucyksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLmNhY2hlZF90b2tlbnMpLFxuXHRcdFx0XHR0aGlzLl9hdHRyKHNwYW4sIERFTk9STUFMSVpFRF9BVFRSUy5yZWFzb25pbmdfdG9rZW5zKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMudG9vbF9uYW1lKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMudG9vbF9jYWxsX2lkKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMudG9vbF90eXBlKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMuY2hhdF9zZXNzaW9uX2lkKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMudHVybl9pbmRleCksXG5cdFx0XHRcdHRoaXMuX3R0ZnRNcyhzcGFuKSxcblx0XHRcdCk7XG5cblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHNwYW4uYXR0cmlidXRlcykpIHtcblx0XHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IEFycmF5LmlzQXJyYXkodmFsdWUpID8gSlNPTi5zdHJpbmdpZnkodmFsdWUpIDogU3RyaW5nKHZhbHVlKTtcblx0XHRcdFx0dGhpcy5faW5zZXJ0QXR0clN0bXQhLnJ1bihzcGFuLnNwYW5JZCwga2V5LCBzZXJpYWxpemVkKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBldmVudCBvZiBzcGFuLmV2ZW50cykge1xuXHRcdFx0XHRjb25zdCBldmVudEF0dHJzID0gZXZlbnQuYXR0cmlidXRlcyA/IEpTT04uc3RyaW5naWZ5KGV2ZW50LmF0dHJpYnV0ZXMpIDogbnVsbDtcblx0XHRcdFx0dGhpcy5faW5zZXJ0RXZlbnRTdG10IS5ydW4oc3Bhbi5zcGFuSWQsIGV2ZW50Lm5hbWUsIGV2ZW50LnRpbWVzdGFtcCwgZXZlbnRBdHRycyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2NvbW1pdFR4IS5ydW4oKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRyeSB7IHRoaXMuX3JvbGxiYWNrVHghLnJ1bigpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRnZXRTcGFuc0J5VHJhY2VJZCh0cmFjZUlkOiBzdHJpbmcpOiBTcGFuUm93W10ge1xuXHRcdHJldHVybiB0aGlzLl9lbnN1cmVEYigpXG5cdFx0XHQucHJlcGFyZSgnU0VMRUNUICogRlJPTSBzcGFucyBXSEVSRSB0cmFjZV9pZCA9ID8gT1JERVIgQlkgc3RhcnRfdGltZV9tcycpXG5cdFx0XHQuYWxsKHRyYWNlSWQpIGFzIHVua25vd24gYXMgU3BhblJvd1tdO1xuXHR9XG5cblx0Z2V0U3BhbnNCeUNvbnZlcnNhdGlvbklkKGNvbnZlcnNhdGlvbklkOiBzdHJpbmcpOiBTcGFuUm93W10ge1xuXHRcdHJldHVybiB0aGlzLl9lbnN1cmVEYigpXG5cdFx0XHQucHJlcGFyZSgnU0VMRUNUICogRlJPTSBzcGFucyBXSEVSRSBjb252ZXJzYXRpb25faWQgPSA/IE9SIGNoYXRfc2Vzc2lvbl9pZCA9ID8gT1JERVIgQlkgc3RhcnRfdGltZV9tcycpXG5cdFx0XHQuYWxsKGNvbnZlcnNhdGlvbklkLCBjb252ZXJzYXRpb25JZCkgYXMgdW5rbm93biBhcyBTcGFuUm93W107XG5cdH1cblxuXHRnZXRTcGFuQXR0cmlidXRlcyhzcGFuSWQ6IHN0cmluZyk6IEFycmF5PHsga2V5OiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfCBudWxsIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlRGIoKVxuXHRcdFx0LnByZXBhcmUoJ1NFTEVDVCBrZXksIHZhbHVlIEZST00gc3Bhbl9hdHRyaWJ1dGVzIFdIRVJFIHNwYW5faWQgPSA/Jylcblx0XHRcdC5hbGwoc3BhbklkKSBhcyB1bmtub3duIGFzIEFycmF5PHsga2V5OiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfCBudWxsIH0+O1xuXHR9XG5cblx0Z2V0U3BhbkF0dHJpYnV0ZShzcGFuSWQ6IHN0cmluZywga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCByb3cgPSB0aGlzLl9lbnN1cmVEYigpXG5cdFx0XHQucHJlcGFyZSgnU0VMRUNUIHZhbHVlIEZST00gc3Bhbl9hdHRyaWJ1dGVzIFdIRVJFIHNwYW5faWQgPSA/IEFORCBrZXkgPSA/Jylcblx0XHRcdC5nZXQoc3BhbklkLCBrZXkpIGFzIHVua25vd24gYXMgeyB2YWx1ZTogc3RyaW5nIHwgbnVsbCB9IHwgdW5kZWZpbmVkO1xuXHRcdHJldHVybiByb3c/LnZhbHVlID8/IG51bGw7XG5cdH1cblxuXHRnZXRTcGFuRXZlbnRzKHNwYW5JZDogc3RyaW5nKTogU3BhbkV2ZW50Um93W10ge1xuXHRcdHJldHVybiB0aGlzLl9lbnN1cmVEYigpXG5cdFx0XHQucHJlcGFyZSgnU0VMRUNUICogRlJPTSBzcGFuX2V2ZW50cyBXSEVSRSBzcGFuX2lkID0gPyBPUkRFUiBCWSB0aW1lc3RhbXBfbXMnKVxuXHRcdFx0LmFsbChzcGFuSWQpIGFzIHVua25vd24gYXMgU3BhbkV2ZW50Um93W107XG5cdH1cblxuXHRnZXRUcmFjZUlkcyhjb252ZXJzYXRpb25JZD86IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBkYiA9IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0aWYgKGNvbnZlcnNhdGlvbklkKSB7XG5cdFx0XHRjb25zdCByb3dzID0gZGIucHJlcGFyZShcblx0XHRcdFx0J1NFTEVDVCBESVNUSU5DVCB0cmFjZV9pZCBGUk9NIHNwYW5zIFdIRVJFIGNvbnZlcnNhdGlvbl9pZCA9ID8gT1IgY2hhdF9zZXNzaW9uX2lkID0gPydcblx0XHRcdCkuYWxsKGNvbnZlcnNhdGlvbklkLCBjb252ZXJzYXRpb25JZCkgYXMgdW5rbm93biBhcyBBcnJheTx7IHRyYWNlX2lkOiBzdHJpbmcgfT47XG5cdFx0XHRyZXR1cm4gcm93cy5tYXAociA9PiByLnRyYWNlX2lkKTtcblx0XHR9XG5cdFx0cmV0dXJuIChkYi5wcmVwYXJlKCdTRUxFQ1QgRElTVElOQ1QgdHJhY2VfaWQgRlJPTSBzcGFucycpLmFsbCgpIGFzIHVua25vd24gYXMgQXJyYXk8eyB0cmFjZV9pZDogc3RyaW5nIH0+KVxuXHRcdFx0Lm1hcChyID0+IHIudHJhY2VfaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgYWxsIHNlc3Npb25zIHdpdGggYWdncmVnYXRlZCBtZXRyaWNzLCBvcmRlcmVkIGJ5IG1vc3QgcmVjZW50IGZpcnN0LlxuXHQgKiBVc2VzIHRoZSBgc2Vzc2lvbnNgIFNRTCB2aWV3IG92ZXIgdGhlIHNwYW5zIHRhYmxlLlxuXHQgKi9cblx0Z2V0U2Vzc2lvbnMobGltaXQ/OiBudW1iZXIpOiBTZXNzaW9uUm93W10ge1xuXHRcdGNvbnN0IHNxbCA9IGxpbWl0XG5cdFx0XHQ/ICdTRUxFQ1QgKiBGUk9NIHNlc3Npb25zIE9SREVSIEJZIHN0YXJ0ZWRfYXQgREVTQyBMSU1JVCA/J1xuXHRcdFx0OiAnU0VMRUNUICogRlJPTSBzZXNzaW9ucyBPUkRFUiBCWSBzdGFydGVkX2F0IERFU0MnO1xuXHRcdHJldHVybiBsaW1pdFxuXHRcdFx0PyB0aGlzLl9lbnN1cmVEYigpLnByZXBhcmUoc3FsKS5hbGwobGltaXQpIGFzIHVua25vd24gYXMgU2Vzc2lvblJvd1tdXG5cdFx0XHQ6IHRoaXMuX2Vuc3VyZURiKCkucHJlcGFyZShzcWwpLmFsbCgpIGFzIHVua25vd24gYXMgU2Vzc2lvblJvd1tdO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3Qgc2Vzc2lvbnMgd2l0aGluIGEgdGltZSB3aW5kb3cgKGNocm9uaWNsZS1zdHlsZSkuXG5cdCAqIEBwYXJhbSBzaW5jZU1zIEVwb2NoIG1zIFx1MjAxNCBvbmx5IHJldHVybiBzZXNzaW9ucyB0aGF0IHN0YXJ0ZWQgYWZ0ZXIgdGhpcyB0aW1lXG5cdCAqL1xuXHRnZXRTZXNzaW9uc1NpbmNlKHNpbmNlTXM6IG51bWJlcik6IFNlc3Npb25Sb3dbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZURiKCkucHJlcGFyZShcblx0XHRcdCdTRUxFQ1QgKiBGUk9NIHNlc3Npb25zIFdIRVJFIHN0YXJ0ZWRfYXQgPj0gPyBPUkRFUiBCWSBzdGFydGVkX2F0IERFU0MnXG5cdFx0KS5hbGwoc2luY2VNcykgYXMgdW5rbm93biBhcyBTZXNzaW9uUm93W107XG5cdH1cblxuXHRjbGVhbnVwKG1heEFnZU1zOiBudW1iZXIgPSBERUZBVUxUX01BWF9BR0VfTVMpOiBudW1iZXIge1xuXHRcdGNvbnN0IGN1dG9mZk1zID0gRGF0ZS5ub3coKSAtIG1heEFnZU1zO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2Vuc3VyZURiKCkucHJlcGFyZSgnREVMRVRFIEZST00gc3BhbnMgV0hFUkUgc3RhcnRfdGltZV9tcyA8ID8nKS5ydW4oY3V0b2ZmTXMpO1xuXHRcdHJldHVybiBOdW1iZXIocmVzdWx0LmNoYW5nZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcG9pbnQgV0FMIHRvIGZsdXNoIGFsbCBwZW5kaW5nIHdyaXRlcyBpbnRvIHRoZSBtYWluIC5kYiBmaWxlLlxuXHQgKiBUaGlzIG11c3QgYmUgY2FsbGVkIGJlZm9yZSBjb3B5aW5nIHRoZSAuZGIgZmlsZSwgb3RoZXJ3aXNlIHRoZSBjb3B5XG5cdCAqIHdpbGwgYmUgbWlzc2luZyBkYXRhIHRoYXQgbGl2ZXMgb25seSBpbiB0aGUgLXdhbCBmaWxlLlxuXHQgKi9cblx0Y2hlY2twb2ludCgpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVEYigpLmV4ZWMoJ1BSQUdNQSB3YWxfY2hlY2twb2ludChUUlVOQ0FURSknKTtcblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kYikge1xuXHRcdFx0dGhpcy5fZGIuY2xvc2UoKTtcblx0XHRcdHRoaXMuX2RiID0gbnVsbDtcblx0XHRcdHRoaXMuX2luc2VydFNwYW5TdG10ID0gbnVsbDtcblx0XHRcdHRoaXMuX2luc2VydEF0dHJTdG10ID0gbnVsbDtcblx0XHRcdHRoaXMuX2luc2VydEV2ZW50U3RtdCA9IG51bGw7XG5cdFx0XHR0aGlzLl9iZWdpblR4ID0gbnVsbDtcblx0XHRcdHRoaXMuX2NvbW1pdFR4ID0gbnVsbDtcblx0XHRcdHRoaXMuX3JvbGxiYWNrVHggPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIFByaXZhdGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfYXR0cihzcGFuOiBJQ29tcGxldGVkU3BhbkRhdGEsIGF0dHJLZXk6IHN0cmluZyk6IHN0cmluZyB8IG51bWJlciB8IG51bGwge1xuXHRcdGNvbnN0IHZhbCA9IHNwYW4uYXR0cmlidXRlc1thdHRyS2V5XTtcblx0XHRpZiAodmFsID09PSB1bmRlZmluZWQpIHsgcmV0dXJuIG51bGw7IH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWwpKSB7IHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWwpOyB9XG5cdFx0aWYgKHR5cGVvZiB2YWwgPT09ICdib29sZWFuJykgeyByZXR1cm4gdmFsID8gMSA6IDA7IH1cblx0XHRyZXR1cm4gdmFsIGFzIHN0cmluZyB8IG51bWJlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2FsZXNjZSBUVEZUIGZyb20gZm9yZWdyb3VuZCBleHRlbnNpb24gKGBjb3BpbG90X2NoYXQudGltZV90b19maXJzdF90b2tlbmAsIG1zKVxuXHQgKiBhbmQgQ0xJIHJ1bnRpbWUuIFRoZSBDTEkgcnVudGltZSBoaXN0b3JpY2FsbHkgZW1pdHRlZCBgZ2l0aHViLmNvcGlsb3QudGltZV90b19maXJzdF9jaHVua2Bcblx0ICogKHNlY29uZHMpIGJ1dCBpcyBtaWdyYXRpbmcgdG8gdGhlIE9UZWwgR2VuQUkgc2VtY29udiBhdHRyaWJ1dGVcblx0ICogYGdlbl9haS5yZXNwb25zZS50aW1lX3RvX2ZpcnN0X2NodW5rYCAoYWxzbyBzZWNvbmRzKS4gQWNjZXB0IGJvdGggZm9yIGZvcndhcmQvYmFja3dhcmRcblx0ICogY29tcGF0aWJpbGl0eSB3aGlsZSB0aGUgcnVudGltZSByb2xsb3V0IGNvbXBsZXRlcy5cblx0ICpcblx0ICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20vb3Blbi10ZWxlbWV0cnkvc2VtYW50aWMtY29udmVudGlvbnMvcHVsbC8zNjA3IChzZW1jb252IGFkZGl0aW9uKVxuXHQgKi9cblx0cHJpdmF0ZSBfdHRmdE1zKHNwYW46IElDb21wbGV0ZWRTcGFuRGF0YSk6IG51bWJlciB8IG51bGwge1xuXHRcdGNvbnN0IGZvcmVncm91bmQgPSB0aGlzLl9hdHRyKHNwYW4sIENvcGlsb3RDaGF0QXR0ci5USU1FX1RPX0ZJUlNUX1RPS0VOKTtcblx0XHRpZiAoZm9yZWdyb3VuZCAhPT0gbnVsbCkgeyByZXR1cm4gZm9yZWdyb3VuZCBhcyBudW1iZXI7IH1cblx0XHRjb25zdCBjbGkgPSBzcGFuLmF0dHJpYnV0ZXNbJ2dlbl9haS5yZXNwb25zZS50aW1lX3RvX2ZpcnN0X2NodW5rJ11cblx0XHRcdD8/IHNwYW4uYXR0cmlidXRlc1snZ2l0aHViLmNvcGlsb3QudGltZV90b19maXJzdF9jaHVuayddO1xuXHRcdGlmIChjbGkgPT09IHVuZGVmaW5lZCkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdGNvbnN0IHNlYyA9IHR5cGVvZiBjbGkgPT09ICdudW1iZXInID8gY2xpIDogcGFyc2VGbG9hdChTdHJpbmcoY2xpKSk7XG5cdFx0cmV0dXJuIGlzTmFOKHNlYykgPyBudWxsIDogTWF0aC5yb3VuZChzZWMgKiAxMDAwKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZURiKCk6IERhdGFiYXNlU3luYyB7XG5cdFx0aWYgKHRoaXMuX2RiKSB7IHJldHVybiB0aGlzLl9kYjsgfVxuXG5cdFx0aWYgKHRoaXMuX2RiUGF0aCAhPT0gJzptZW1vcnk6Jykge1xuXHRcdFx0bWtkaXJTeW5jKGRpcm5hbWUodGhpcy5fZGJQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBEYXRhYmFzZVN5bmM6IERhdGFiYXNlU3luY0N0b3IgfSA9IGxvYWRTcWxpdGUoKTtcblx0XHRjb25zdCBkYiA9IG5ldyBEYXRhYmFzZVN5bmNDdG9yKHRoaXMuX2RiUGF0aCk7XG5cdFx0dHJ5IHtcblx0XHRcdGRiLmV4ZWMoJ1BSQUdNQSBqb3VybmFsX21vZGUgPSBXQUwnKTtcblx0XHRcdGRiLmV4ZWMoJ1BSQUdNQSBidXN5X3RpbWVvdXQgPSAzMDAwJyk7XG5cdFx0XHRkYi5leGVjKCdQUkFHTUEgZm9yZWlnbl9rZXlzID0gT04nKTtcblx0XHRcdHRoaXMuX2RiID0gZGI7XG5cdFx0XHR0aGlzLl9lbnN1cmVTY2hlbWEoKTtcblx0XHRcdHRoaXMuX3ByZXBhcmVTdGF0ZW1lbnRzKGRiKTtcblxuXHRcdFx0Ly8gQXV0by1jbGVhbnVwIG9uIHN0YXJ0dXA6IHJlbW92ZSBzcGFucyBvbGRlciB0aGFuIDcgZGF5cyxcblx0XHRcdC8vIHRoZW4gY2FwIHRvIHRoZSBtb3N0IHJlY2VudCBERUZBVUxUX01BWF9TRVNTSU9OUyBzZXNzaW9ucyBieSBjb252ZXJzYXRpb25faWQuXG5cdFx0XHR0aGlzLl9jbGVhbnVwT25TdGFydHVwKGRiKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGRiLmNsb3NlKCk7XG5cdFx0XHR0aGlzLl9kYiA9IG51bGw7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kYjtcblx0fVxuXG5cdHByaXZhdGUgX3ByZXBhcmVTdGF0ZW1lbnRzKGRiOiBEYXRhYmFzZVN5bmMpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnNlcnRTcGFuU3RtdCA9IGRiLnByZXBhcmUoYFxuXHRcdFx0SU5TRVJUIE9SIFJFUExBQ0UgSU5UTyBzcGFucyAoXG5cdFx0XHRcdHNwYW5faWQsIHRyYWNlX2lkLCBwYXJlbnRfc3Bhbl9pZCwgbmFtZSxcblx0XHRcdFx0c3RhcnRfdGltZV9tcywgZW5kX3RpbWVfbXMsIHN0YXR1c19jb2RlLCBzdGF0dXNfbWVzc2FnZSxcblx0XHRcdFx0b3BlcmF0aW9uX25hbWUsIHByb3ZpZGVyX25hbWUsIGFnZW50X25hbWUsIGNvbnZlcnNhdGlvbl9pZCxcblx0XHRcdFx0cmVxdWVzdF9tb2RlbCwgcmVzcG9uc2VfbW9kZWwsXG5cdFx0XHRcdGlucHV0X3Rva2Vucywgb3V0cHV0X3Rva2VucywgY2FjaGVkX3Rva2VucywgcmVhc29uaW5nX3Rva2Vucyxcblx0XHRcdFx0dG9vbF9uYW1lLCB0b29sX2NhbGxfaWQsIHRvb2xfdHlwZSxcblx0XHRcdFx0Y2hhdF9zZXNzaW9uX2lkLCB0dXJuX2luZGV4LCB0dGZ0X21zXG5cdFx0XHQpIFZBTFVFUyAoPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPywgPylcblx0XHRgKTtcblx0XHR0aGlzLl9pbnNlcnRBdHRyU3RtdCA9IGRiLnByZXBhcmUoXG5cdFx0XHQnSU5TRVJUIE9SIFJFUExBQ0UgSU5UTyBzcGFuX2F0dHJpYnV0ZXMgKHNwYW5faWQsIGtleSwgdmFsdWUpIFZBTFVFUyAoPywgPywgPyknXG5cdFx0KTtcblx0XHR0aGlzLl9pbnNlcnRFdmVudFN0bXQgPSBkYi5wcmVwYXJlKFxuXHRcdFx0J0lOU0VSVCBJTlRPIHNwYW5fZXZlbnRzIChzcGFuX2lkLCBuYW1lLCB0aW1lc3RhbXBfbXMsIGF0dHJpYnV0ZXMpIFZBTFVFUyAoPywgPywgPywgPyknXG5cdFx0KTtcblx0XHR0aGlzLl9iZWdpblR4ID0gZGIucHJlcGFyZSgnQkVHSU4nKTtcblx0XHR0aGlzLl9jb21taXRUeCA9IGRiLnByZXBhcmUoJ0NPTU1JVCcpO1xuXHRcdHRoaXMuX3JvbGxiYWNrVHggPSBkYi5wcmVwYXJlKCdST0xMQkFDSycpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlU2NoZW1hKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRiID0gdGhpcy5fZGIhO1xuXHRcdGNvbnN0IHZlcnNpb25Sb3cgPSAoKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGRiLnByZXBhcmUoJ1NFTEVDVCB2ZXJzaW9uIEZST00gc2NoZW1hX3ZlcnNpb24gTElNSVQgMScpLmdldCgpIGFzIHsgdmVyc2lvbjogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHR9IGNhdGNoIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdH0pKCk7XG5cblx0XHRpZiAoKHZlcnNpb25Sb3c/LnZlcnNpb24gPz8gMCkgPj0gU0NIRU1BX1ZFUlNJT04pIHsgcmV0dXJuOyB9XG5cblx0XHRkYi5leGVjKGBcblx0XHRcdENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHNjaGVtYV92ZXJzaW9uICh2ZXJzaW9uIElOVEVHRVIgUFJJTUFSWSBLRVkpO1xuXHRcdFx0SU5TRVJUIE9SIFJFUExBQ0UgSU5UTyBzY2hlbWFfdmVyc2lvbiAodmVyc2lvbikgVkFMVUVTICgke1NDSEVNQV9WRVJTSU9OfSk7XG5cblx0XHRcdENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHNwYW5zIChcblx0XHRcdFx0c3Bhbl9pZCBURVhUIFBSSU1BUlkgS0VZLCB0cmFjZV9pZCBURVhUIE5PVCBOVUxMLCBwYXJlbnRfc3Bhbl9pZCBURVhULFxuXHRcdFx0XHRuYW1lIFRFWFQgTk9UIE5VTEwsIHN0YXJ0X3RpbWVfbXMgSU5URUdFUiBOT1QgTlVMTCwgZW5kX3RpbWVfbXMgSU5URUdFUiBOT1QgTlVMTCxcblx0XHRcdFx0c3RhdHVzX2NvZGUgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsIHN0YXR1c19tZXNzYWdlIFRFWFQsXG5cdFx0XHRcdG9wZXJhdGlvbl9uYW1lIFRFWFQsIHByb3ZpZGVyX25hbWUgVEVYVCwgYWdlbnRfbmFtZSBURVhULCBjb252ZXJzYXRpb25faWQgVEVYVCxcblx0XHRcdFx0cmVxdWVzdF9tb2RlbCBURVhULCByZXNwb25zZV9tb2RlbCBURVhULFxuXHRcdFx0XHRpbnB1dF90b2tlbnMgSU5URUdFUiwgb3V0cHV0X3Rva2VucyBJTlRFR0VSLCBjYWNoZWRfdG9rZW5zIElOVEVHRVIsIHJlYXNvbmluZ190b2tlbnMgSU5URUdFUixcblx0XHRcdFx0dG9vbF9uYW1lIFRFWFQsIHRvb2xfY2FsbF9pZCBURVhULCB0b29sX3R5cGUgVEVYVCxcblx0XHRcdFx0Y2hhdF9zZXNzaW9uX2lkIFRFWFQsIHR1cm5faW5kZXggSU5URUdFUiwgdHRmdF9tcyBSRUFMXG5cdFx0XHQpO1xuXG5cdFx0XHRDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzcGFuX2F0dHJpYnV0ZXMgKFxuXHRcdFx0XHRzcGFuX2lkIFRFWFQgTk9UIE5VTEwgUkVGRVJFTkNFUyBzcGFucyhzcGFuX2lkKSBPTiBERUxFVEUgQ0FTQ0FERSxcblx0XHRcdFx0a2V5IFRFWFQgTk9UIE5VTEwsIHZhbHVlIFRFWFQsXG5cdFx0XHRcdFBSSU1BUlkgS0VZIChzcGFuX2lkLCBrZXkpXG5cdFx0XHQpO1xuXG5cdFx0XHRDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzcGFuX2V2ZW50cyAoXG5cdFx0XHRcdGlkIElOVEVHRVIgUFJJTUFSWSBLRVkgQVVUT0lOQ1JFTUVOVCxcblx0XHRcdFx0c3Bhbl9pZCBURVhUIE5PVCBOVUxMIFJFRkVSRU5DRVMgc3BhbnMoc3Bhbl9pZCkgT04gREVMRVRFIENBU0NBREUsXG5cdFx0XHRcdG5hbWUgVEVYVCBOT1QgTlVMTCwgdGltZXN0YW1wX21zIElOVEVHRVIgTk9UIE5VTEwsIGF0dHJpYnV0ZXMgVEVYVFxuXHRcdFx0KTtcblxuXHRcdFx0Q1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X3NwYW5zX3RyYWNlIE9OIHNwYW5zKHRyYWNlX2lkKTtcblx0XHRcdENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9zcGFuc19jb252ZXJzYXRpb24gT04gc3BhbnMoY29udmVyc2F0aW9uX2lkKTtcblx0XHRcdENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9zcGFuc19jaGF0X3Nlc3Npb24gT04gc3BhbnMoY2hhdF9zZXNzaW9uX2lkKTtcblx0XHRcdENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9zcGFuc19vcGVyYXRpb24gT04gc3BhbnMob3BlcmF0aW9uX25hbWUpO1xuXHRcdFx0Q1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X3NwYW5zX3N0YXJ0X3RpbWUgT04gc3BhbnMoc3RhcnRfdGltZV9tcyk7XG5cdFx0XHRDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfc3Bhbl9ldmVudHNfc3BhbiBPTiBzcGFuX2V2ZW50cyhzcGFuX2lkKTtcblxuXHRcdFx0LS0gU2Vzc2lvbiB2aWV3OiBkZXJpdmVzIHNlc3Npb24gYm91bmRhcmllcyBmcm9tIHNwYW4gZGF0YS5cblx0XHRcdC0tIE5vIHNlcGFyYXRlIHNlc3Npb25zIHRhYmxlIG5lZWRlZCBcdTIwMTQgaW52b2tlX2FnZW50IHNwYW5zIGRlZmluZSBzZXNzaW9uIGxpZmVjeWNsZS5cblx0XHRcdENSRUFURSBWSUVXIElGIE5PVCBFWElTVFMgc2Vzc2lvbnMgQVNcblx0XHRcdFNFTEVDVFxuXHRcdFx0XHRDT0FMRVNDRShjb252ZXJzYXRpb25faWQsIGNoYXRfc2Vzc2lvbl9pZCkgQVMgc2Vzc2lvbl9pZCxcblx0XHRcdFx0YWdlbnRfbmFtZSxcblx0XHRcdFx0cmVzcG9uc2VfbW9kZWwgQVMgbW9kZWwsXG5cdFx0XHRcdE1JTihzdGFydF90aW1lX21zKSBBUyBzdGFydGVkX2F0LFxuXHRcdFx0XHRNQVgoZW5kX3RpbWVfbXMpIEFTIGVuZGVkX2F0LFxuXHRcdFx0XHRNQVgoZW5kX3RpbWVfbXMpIC0gTUlOKHN0YXJ0X3RpbWVfbXMpIEFTIGR1cmF0aW9uX21zLFxuXHRcdFx0XHRDT1VOVCgqKSBBUyBzcGFuX2NvdW50LFxuXHRcdFx0XHRTVU0oQ0FTRSBXSEVOIG9wZXJhdGlvbl9uYW1lID0gJ2NoYXQnIFRIRU4gMSBFTFNFIDAgRU5EKSBBUyBsbG1fY2FsbHMsXG5cdFx0XHRcdFNVTShDQVNFIFdIRU4gb3BlcmF0aW9uX25hbWUgPSAnZXhlY3V0ZV90b29sJyBUSEVOIDEgRUxTRSAwIEVORCkgQVMgdG9vbF9jYWxscyxcblx0XHRcdFx0U1VNKENBU0UgV0hFTiBvcGVyYXRpb25fbmFtZSA9ICdjaGF0JyBUSEVOIGlucHV0X3Rva2VucyBFTFNFIDAgRU5EKSBBUyB0b3RhbF9pbnB1dF90b2tlbnMsXG5cdFx0XHRcdFNVTShDQVNFIFdIRU4gb3BlcmF0aW9uX25hbWUgPSAnY2hhdCcgVEhFTiBvdXRwdXRfdG9rZW5zIEVMU0UgMCBFTkQpIEFTIHRvdGFsX291dHB1dF90b2tlbnMsXG5cdFx0XHRcdFNVTShDQVNFIFdIRU4gb3BlcmF0aW9uX25hbWUgPSAnY2hhdCcgVEhFTiBjYWNoZWRfdG9rZW5zIEVMU0UgMCBFTkQpIEFTIHRvdGFsX2NhY2hlZF90b2tlbnNcblx0XHRcdEZST00gc3BhbnNcblx0XHRcdFdIRVJFIENPQUxFU0NFKGNvbnZlcnNhdGlvbl9pZCwgY2hhdF9zZXNzaW9uX2lkKSBJUyBOT1QgTlVMTFxuXHRcdFx0R1JPVVAgQlkgQ09BTEVTQ0UoY29udmVyc2F0aW9uX2lkLCBjaGF0X3Nlc3Npb25faWQpO1xuXHRcdGApO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW51cE9uU3RhcnR1cChkYjogRGF0YWJhc2VTeW5jKTogdm9pZCB7XG5cdFx0Ly8gMS4gVGltZS1iYXNlZDogZGVsZXRlIHNwYW5zIG9sZGVyIHRoYW4gREVGQVVMVF9NQVhfQUdFX01TXG5cdFx0Y29uc3QgY3V0b2ZmTXMgPSBEYXRlLm5vdygpIC0gREVGQVVMVF9NQVhfQUdFX01TO1xuXHRcdGRiLnByZXBhcmUoJ0RFTEVURSBGUk9NIHNwYW5zIFdIRVJFIHN0YXJ0X3RpbWVfbXMgPCA/JykucnVuKGN1dG9mZk1zKTtcblxuXHRcdC8vIDIuIFNlc3Npb24tY291bnQgY2FwOiBrZWVwIG9ubHkgdGhlIG1vc3QgcmVjZW50IERFRkFVTFRfTUFYX1NFU1NJT05TIHNlc3Npb25zLlxuXHRcdC8vIEEgXCJzZXNzaW9uXCIgaXMgaWRlbnRpZmllZCBieSBjb252ZXJzYXRpb25faWQgKG9yIGNoYXRfc2Vzc2lvbl9pZCBhcyBmYWxsYmFjaykuXG5cdFx0Ly8gV2UgZmluZCB0aGUgTnRoLW5ld2VzdCBzZXNzaW9uJ3MgbWF4IHN0YXJ0X3RpbWVfbXMgYW5kIGRlbGV0ZSBldmVyeXRoaW5nIG9sZGVyLlxuXHRcdGNvbnN0IHNlc3Npb25DdXRvZmYgPSBkYi5wcmVwYXJlKGBcblx0XHRcdFNFTEVDVCBNSU4obWF4X3N0YXJ0KSBBUyBjdXRvZmZfbXMgRlJPTSAoXG5cdFx0XHRcdFNFTEVDVCBNQVgoc3RhcnRfdGltZV9tcykgQVMgbWF4X3N0YXJ0XG5cdFx0XHRcdEZST00gc3BhbnNcblx0XHRcdFx0V0hFUkUgQ09BTEVTQ0UoY29udmVyc2F0aW9uX2lkLCBjaGF0X3Nlc3Npb25faWQpIElTIE5PVCBOVUxMXG5cdFx0XHRcdEdST1VQIEJZIENPQUxFU0NFKGNvbnZlcnNhdGlvbl9pZCwgY2hhdF9zZXNzaW9uX2lkKVxuXHRcdFx0XHRPUkRFUiBCWSBtYXhfc3RhcnQgREVTQ1xuXHRcdFx0XHRMSU1JVCA/XG5cdFx0XHQpXG5cdFx0YCkuZ2V0KERFRkFVTFRfTUFYX1NFU1NJT05TKSBhcyB1bmtub3duIGFzIHsgY3V0b2ZmX21zOiBudW1iZXIgfCBudWxsIH0gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoc2Vzc2lvbkN1dG9mZj8uY3V0b2ZmX21zKSB7XG5cdFx0XHRkYi5wcmVwYXJlKGBcblx0XHRcdFx0REVMRVRFIEZST00gc3BhbnNcblx0XHRcdFx0V0hFUkUgc3RhcnRfdGltZV9tcyA8ID9cblx0XHRcdFx0QU5EIENPQUxFU0NFKGNvbnZlcnNhdGlvbl9pZCwgY2hhdF9zZXNzaW9uX2lkKSBOT1QgSU4gKFxuXHRcdFx0XHRcdFNFTEVDVCBDT0FMRVNDRShjb252ZXJzYXRpb25faWQsIGNoYXRfc2Vzc2lvbl9pZClcblx0XHRcdFx0XHRGUk9NIHNwYW5zXG5cdFx0XHRcdFx0V0hFUkUgQ09BTEVTQ0UoY29udmVyc2F0aW9uX2lkLCBjaGF0X3Nlc3Npb25faWQpIElTIE5PVCBOVUxMXG5cdFx0XHRcdFx0R1JPVVAgQlkgQ09BTEVTQ0UoY29udmVyc2F0aW9uX2lkLCBjaGF0X3Nlc3Npb25faWQpXG5cdFx0XHRcdFx0T1JERVIgQlkgTUFYKHN0YXJ0X3RpbWVfbXMpIERFU0Ncblx0XHRcdFx0XHRMSU1JVCA/XG5cdFx0XHRcdClcblx0XHRcdGApLnJ1bihzZXNzaW9uQ3V0b2ZmLmN1dG9mZl9tcywgREVGQVVMVF9NQVhfU0VTU0lPTlMpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUI7QUFHMUIsU0FBUyxxQkFBcUI7QUFHOUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLGlCQUFpQjtBQU8zQyxNQUFNLGNBQWMsY0FBYyxZQUFZLEdBQUc7QUFDakQsU0FBUyxhQUEyQztBQUNuRCxTQUFPLFlBQVksYUFBYTtBQUNqQztBQUdBLE1BQU0saUJBQWlCO0FBS3ZCLE1BQU0scUJBQXFCLElBQUksS0FBSyxLQUFLLEtBQUs7QUFHOUMsTUFBTSx1QkFBdUI7QUFNN0IsTUFBTSxxQkFB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
