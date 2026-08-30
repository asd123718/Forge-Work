"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension/chatSessions/copilotcli/node/copilotCLITodoWorker.ts
var copilotCLITodoWorker_exports = {};
module.exports = __toCommonJS(copilotCLITodoWorker_exports);
var import_node_fs = require("node:fs");
var import_node_sqlite = require("node:sqlite");
var import_worker_threads = require("worker_threads");

// src/util/node/worker.ts
var RcpResponseHandler = class {
  constructor() {
    this.nextId = 1;
    this.handlers = /* @__PURE__ */ new Map();
  }
  createHandler() {
    const id = this.nextId++;
    let resolve;
    let reject;
    const result = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.handlers.set(id, { resolve, reject });
    return { id, result };
  }
  handleResponse(response) {
    const handler = this.handlers.get(response.id);
    if (!handler) {
      return;
    }
    this.handlers.delete(response.id);
    if (response.err) {
      handler.reject(response.err);
    } else {
      handler.resolve(response.res);
    }
  }
  /**
   * Handle an unexpected error by logging it and rejecting all handlers.
   */
  handleError(err) {
    for (const handler of this.handlers.values()) {
      handler.reject(err);
    }
    this.handlers.clear();
  }
  clear() {
    this.handlers.clear();
  }
};

// src/extension/chatSessions/copilotcli/node/copilotCLITodoWorker.ts
var responseHandler = new RcpResponseHandler();
import_worker_threads.parentPort.on("message", (msg) => {
  if ("fn" in msg) {
    try {
      const result = handleRequest(msg.fn, msg.args);
      import_worker_threads.parentPort.postMessage({ id: msg.id, res: result });
    } catch (err) {
      import_worker_threads.parentPort.postMessage({ id: msg.id, err });
    }
  } else {
    responseHandler.handleResponse(msg);
  }
});
function handleRequest(fn, args) {
  switch (fn) {
    case "queryTodos":
      return queryTodos(args[0]);
    default:
      throw new Error(`Unknown function: ${fn}`);
  }
}
function queryTodos(dbPath) {
  if (!(0, import_node_fs.existsSync)(dbPath)) {
    return [];
  }
  let db;
  try {
    db = new import_node_sqlite.DatabaseSync(dbPath, { open: true });
    db.exec("PRAGMA busy_timeout = 2000");
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='todos'"
    );
    const tables = tableCheck.all();
    if (tables.length === 0) {
      return [];
    }
    const stmt = db.prepare("SELECT id, title, description, status FROM todos ORDER BY created_at ASC");
    const rows = stmt.all();
    return rows.map((row) => ({
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      status: String(row.status ?? "pending")
    }));
  } finally {
    db?.close();
  }
}
//# sourceMappingURL=copilotCLITodoWorker.js.map
