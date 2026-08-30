import * as fs from "fs";
import { timeout } from "../../../common/async.js";
import { Event } from "../../../common/event.js";
import { mapToString, setToString } from "../../../common/map.js";
import { basename } from "../../../common/path.js";
import { Promises } from "../../../node/pfs.js";
const _SQLiteStorageDatabase = class _SQLiteStorageDatabase {
  constructor(path, options = /* @__PURE__ */ Object.create(null)) {
    this.path = path;
    this.name = basename(this.path);
    this.logger = new SQLiteStorageDatabaseLogger(options.logging);
    this.useWAL = !!options.useWAL;
    this.busyTimeout = options.busyTimeout;
    this.whenConnected = this.connect(this.path);
  }
  get onDidChangeItemsExternal() {
    return Event.None;
  }
  async getItems() {
    const connection = await this.whenConnected;
    const items = /* @__PURE__ */ new Map();
    const rows = await this.all(connection, "SELECT * FROM ItemTable");
    rows.forEach((row) => items.set(row.key, row.value));
    if (this.logger.isTracing) {
      this.logger.trace(`[storage ${this.name}] getItems(): ${items.size} rows`);
    }
    return items;
  }
  async updateItems(request) {
    const connection = await this.whenConnected;
    return this.doUpdateItems(connection, request);
  }
  doUpdateItems(connection, request) {
    if (this.logger.isTracing) {
      this.logger.trace(`[storage ${this.name}] updateItems(): insert(${request.insert ? mapToString(request.insert) : "0"}), delete(${request.delete ? setToString(request.delete) : "0"})`);
    }
    return this.transaction(connection, () => {
      const toInsert = request.insert;
      const toDelete = request.delete;
      if (toInsert && toInsert.size > 0) {
        const keysValuesChunks = [];
        keysValuesChunks.push([]);
        let currentChunkIndex = 0;
        toInsert.forEach((value, key) => {
          let keyValueChunk = keysValuesChunks[currentChunkIndex];
          if (keyValueChunk.length > _SQLiteStorageDatabase.MAX_HOST_PARAMETERS) {
            currentChunkIndex++;
            keyValueChunk = [];
            keysValuesChunks.push(keyValueChunk);
          }
          keyValueChunk.push(key, value);
        });
        keysValuesChunks.forEach((keysValuesChunk) => {
          this.prepare(connection, `INSERT INTO ItemTable VALUES ${new Array(keysValuesChunk.length / 2).fill("(?,?)").join(",")} ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE value != excluded.value`, (stmt) => stmt.run(keysValuesChunk), () => {
            const keys = [];
            let length = 0;
            toInsert.forEach((value, key) => {
              keys.push(key);
              length += value.length;
            });
            return `Keys: ${keys.join(", ")} Length: ${length}`;
          });
        });
      }
      if (toDelete?.size) {
        const keysChunks = [];
        keysChunks.push([]);
        let currentChunkIndex = 0;
        toDelete.forEach((key) => {
          let keyChunk = keysChunks[currentChunkIndex];
          if (keyChunk.length > _SQLiteStorageDatabase.MAX_HOST_PARAMETERS) {
            currentChunkIndex++;
            keyChunk = [];
            keysChunks.push(keyChunk);
          }
          keyChunk.push(key);
        });
        keysChunks.forEach((keysChunk) => {
          this.prepare(connection, `DELETE FROM ItemTable WHERE key IN (${new Array(keysChunk.length).fill("?").join(",")})`, (stmt) => stmt.run(keysChunk), () => {
            const keys = [];
            toDelete.forEach((key) => {
              keys.push(key);
            });
            return `Keys: ${keys.join(", ")}`;
          });
        });
      }
    });
  }
  async optimize() {
    this.logger.trace(`[storage ${this.name}] vacuum()`);
    const connection = await this.whenConnected;
    return this.exec(connection, "VACUUM");
  }
  async close(recovery) {
    this.logger.trace(`[storage ${this.name}] close()`);
    const connection = await this.whenConnected;
    return this.doClose(connection, recovery);
  }
  doClose(connection, recovery) {
    return new Promise((resolve, reject) => {
      connection.db.close((closeError) => {
        if (closeError) {
          this.handleSQLiteError(connection, `[storage ${this.name}] close(): ${closeError}`);
        }
        if (this.path === _SQLiteStorageDatabase.IN_MEMORY_PATH) {
          return resolve();
        }
        if (!connection.isErroneous && !connection.isInMemory) {
          return this.backup().then(resolve, (error) => {
            this.logger.error(`[storage ${this.name}] backup(): ${error}`);
            return resolve();
          });
        }
        if (typeof recovery === "function") {
          return fs.promises.unlink(this.path).then(() => {
            return this.doConnect(this.path).then((recoveryConnection) => {
              const closeRecoveryConnection = () => {
                return this.doClose(
                  recoveryConnection,
                  void 0
                  /* do not attempt to recover again */
                );
              };
              return this.doUpdateItems(recoveryConnection, { insert: recovery() }).then(() => closeRecoveryConnection(), (error) => {
                closeRecoveryConnection();
                return Promise.reject(error);
              });
            });
          }).then(resolve, reject);
        }
        return reject(closeError || new Error("Database has errors or is in-memory without recovery option"));
      });
    });
  }
  backup() {
    const backupPath = this.toBackupPath(this.path);
    return Promises.copy(this.path, backupPath, { preserveSymlinks: false });
  }
  toBackupPath(path) {
    return `${path}.backup`;
  }
  async checkIntegrity(full) {
    this.logger.trace(`[storage ${this.name}] checkIntegrity(full: ${full})`);
    const connection = await this.whenConnected;
    const row = await this.get(connection, full ? "PRAGMA integrity_check" : "PRAGMA quick_check");
    const integrity = full ? row.integrity_check : row.quick_check;
    if (connection.isErroneous) {
      return `${integrity} (last error: ${connection.lastError})`;
    }
    if (connection.isInMemory) {
      return `${integrity} (in-memory!)`;
    }
    return integrity;
  }
  async connect(path, retryOnBusy = true) {
    this.logger.trace(`[storage ${this.name}] open(${path}, retryOnBusy: ${retryOnBusy})`);
    try {
      return await this.doConnect(path);
    } catch (error) {
      this.logger.error(`[storage ${this.name}] open(): Unable to open DB due to ${error}`);
      if (error.code === "SQLITE_BUSY" && retryOnBusy) {
        await timeout(_SQLiteStorageDatabase.BUSY_OPEN_TIMEOUT);
        return this.connect(
          path,
          false
          /* not another retry */
        );
      }
      try {
        await fs.promises.unlink(path);
        try {
          await Promises.rename(
            this.toBackupPath(path),
            path,
            false
            /* no retry */
          );
        } catch {
        }
        return await this.doConnect(path);
      } catch (error2) {
        this.logger.error(`[storage ${this.name}] open(): Unable to use backup due to ${error2}`);
        return this.doConnect(_SQLiteStorageDatabase.IN_MEMORY_PATH);
      }
    }
  }
  handleSQLiteError(connection, msg) {
    connection.isErroneous = true;
    connection.lastError = msg;
    this.logger.error(msg);
  }
  doConnect(path) {
    return new Promise((resolve, reject) => {
      import("@vscode/sqlite3").then((sqlite3) => {
        const ctor = this.logger.isTracing ? sqlite3.default.verbose().Database : sqlite3.default.Database;
        const connection = {
          db: new ctor(path, (error) => {
            if (error) {
              return connection.db && error.code !== "SQLITE_CANTOPEN" ? connection.db.close(() => reject(error)) : reject(error);
            }
            const pragmas = [
              "PRAGMA user_version = 1;",
              "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);"
            ];
            if (this.useWAL) {
              pragmas.push("PRAGMA journal_mode=WAL;");
            }
            if (this.busyTimeout) {
              pragmas.push(`PRAGMA busy_timeout=${this.busyTimeout};`);
            }
            return this.exec(connection, pragmas.join("")).then(() => {
              return resolve(connection);
            }, (error2) => {
              return connection.db.close(() => reject(error2));
            });
          }),
          isInMemory: path === _SQLiteStorageDatabase.IN_MEMORY_PATH
        };
        connection.db.on("error", (error) => this.handleSQLiteError(connection, `[storage ${this.name}] Error (event): ${error}`));
        if (this.logger.isTracing) {
          connection.db.on("trace", (sql) => this.logger.trace(`[storage ${this.name}] Trace (event): ${sql}`));
        }
      }, reject);
    });
  }
  exec(connection, sql) {
    return new Promise((resolve, reject) => {
      connection.db.exec(sql, (error) => {
        if (error) {
          this.handleSQLiteError(connection, `[storage ${this.name}] exec(): ${error}`);
          return reject(error);
        }
        return resolve();
      });
    });
  }
  get(connection, sql) {
    return new Promise((resolve, reject) => {
      connection.db.get(sql, (error, row) => {
        if (error) {
          this.handleSQLiteError(connection, `[storage ${this.name}] get(): ${error}`);
          return reject(error);
        }
        return resolve(row);
      });
    });
  }
  all(connection, sql) {
    return new Promise((resolve, reject) => {
      connection.db.all(sql, (error, rows) => {
        if (error) {
          this.handleSQLiteError(connection, `[storage ${this.name}] all(): ${error}`);
          return reject(error);
        }
        return resolve(rows);
      });
    });
  }
  transaction(connection, transactions) {
    return new Promise((resolve, reject) => {
      connection.db.serialize(() => {
        connection.db.run("BEGIN TRANSACTION");
        transactions();
        connection.db.run("END TRANSACTION", (error) => {
          if (error) {
            this.handleSQLiteError(connection, `[storage ${this.name}] transaction(): ${error}`);
            return reject(error);
          }
          return resolve();
        });
      });
    });
  }
  prepare(connection, sql, runCallback, errorDetails) {
    const stmt = connection.db.prepare(sql);
    const statementErrorListener = (error) => {
      this.handleSQLiteError(connection, `[storage ${this.name}] prepare(): ${error} (${sql}). Details: ${errorDetails()}`);
    };
    stmt.on("error", statementErrorListener);
    runCallback(stmt);
    stmt.finalize((error) => {
      if (error) {
        statementErrorListener(error);
      }
      stmt.removeListener("error", statementErrorListener);
    });
  }
};
_SQLiteStorageDatabase.IN_MEMORY_PATH = ":memory:";
// since we are the only client, there can be no external changes
_SQLiteStorageDatabase.BUSY_OPEN_TIMEOUT = 2e3;
// timeout in ms to retry when opening DB fails with SQLITE_BUSY
_SQLiteStorageDatabase.MAX_HOST_PARAMETERS = 256;
let SQLiteStorageDatabase = _SQLiteStorageDatabase;
const _SQLiteStorageDatabaseLogger = class _SQLiteStorageDatabaseLogger {
  constructor(options) {
    if (options && typeof options.logTrace === "function" && process.env[_SQLiteStorageDatabaseLogger.VSCODE_TRACE_STORAGE]) {
      this.logTrace = options.logTrace;
    }
    if (options && typeof options.logError === "function") {
      this.logError = options.logError;
    }
  }
  get isTracing() {
    return !!this.logTrace;
  }
  trace(msg) {
    this.logTrace?.(msg);
  }
  error(error) {
    this.logError?.(error);
  }
};
// to reduce lots of output, require an environment variable to enable tracing
// this helps when running with --verbose normally where the storage tracing
// might hide useful output to look at
_SQLiteStorageDatabaseLogger.VSCODE_TRACE_STORAGE = "VSCODE_TRACE_STORAGE";
let SQLiteStorageDatabaseLogger = _SQLiteStorageDatabaseLogger;
export {
  SQLiteStorageDatabase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxwYXJ0c1xcc3RvcmFnZVxcbm9kZVxcc3RvcmFnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbWFwVG9TdHJpbmcsIHNldFRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VEYXRhYmFzZSwgSVN0b3JhZ2VJdGVtc0NoYW5nZUV2ZW50LCBJVXBkYXRlUmVxdWVzdCB9IGZyb20gJy4uL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB0eXBlIHsgRGF0YWJhc2UsIFN0YXRlbWVudCB9IGZyb20gJ0B2c2NvZGUvc3FsaXRlMyc7XG5cbmludGVyZmFjZSBJRGF0YWJhc2VDb25uZWN0aW9uIHtcblx0cmVhZG9ubHkgZGI6IERhdGFiYXNlO1xuXHRyZWFkb25seSBpc0luTWVtb3J5OiBib29sZWFuO1xuXG5cdGlzRXJyb25lb3VzPzogYm9vbGVhbjtcblx0bGFzdEVycm9yPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTUUxpdGVTdG9yYWdlRGF0YWJhc2VPcHRpb25zIHtcblx0cmVhZG9ubHkgbG9nZ2luZz86IElTUUxpdGVTdG9yYWdlRGF0YWJhc2VMb2dnaW5nT3B0aW9ucztcblx0cmVhZG9ubHkgdXNlV0FMPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogSWYgc2V0LCBjb25maWd1cmVzIFNRTGl0ZSdzIGJ1c3kgdGltZW91dCBpbiBtaWxsaXNlY29uZHMuXG5cdCAqIFdoZW4gYW5vdGhlciBwcm9jZXNzIGhvbGRzIGEgd3JpdGUgbG9jaywgU1FMaXRlIHdpbGwgcmV0cnlcblx0ICogZm9yIHRoaXMgZHVyYXRpb24gYmVmb3JlIHJldHVybmluZyBTUUxJVEVfQlVTWS5cblx0ICovXG5cdHJlYWRvbmx5IGJ1c3lUaW1lb3V0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTUUxpdGVTdG9yYWdlRGF0YWJhc2VMb2dnaW5nT3B0aW9ucyB7XG5cdGxvZ0Vycm9yPzogKGVycm9yOiBzdHJpbmcgfCBFcnJvcikgPT4gdm9pZDtcblx0bG9nVHJhY2U/OiAobXNnOiBzdHJpbmcpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBTUUxpdGVTdG9yYWdlRGF0YWJhc2UgaW1wbGVtZW50cyBJU3RvcmFnZURhdGFiYXNlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSU5fTUVNT1JZX1BBVEggPSAnOm1lbW9yeTonO1xuXG5cdGdldCBvbkRpZENoYW5nZUl0ZW1zRXh0ZXJuYWwoKTogRXZlbnQ8SVN0b3JhZ2VJdGVtc0NoYW5nZUV2ZW50PiB7IHJldHVybiBFdmVudC5Ob25lOyB9IC8vIHNpbmNlIHdlIGFyZSB0aGUgb25seSBjbGllbnQsIHRoZXJlIGNhbiBiZSBubyBleHRlcm5hbCBjaGFuZ2VzXG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQlVTWV9PUEVOX1RJTUVPVVQgPSAyMDAwOyAvLyB0aW1lb3V0IGluIG1zIHRvIHJldHJ5IHdoZW4gb3BlbmluZyBEQiBmYWlscyB3aXRoIFNRTElURV9CVVNZXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9IT1NUX1BBUkFNRVRFUlMgPSAyNTY7IC8vIG1heGltdW0gbnVtYmVyIG9mIHBhcmFtZXRlcnMgd2l0aGluIGEgc3RhdGVtZW50XG5cblx0cHJpdmF0ZSByZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IFNRTGl0ZVN0b3JhZ2VEYXRhYmFzZUxvZ2dlcjtcblx0cHJpdmF0ZSByZWFkb25seSB1c2VXQUw6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgYnVzeVRpbWVvdXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdoZW5Db25uZWN0ZWQ6IFByb21pc2U8SURhdGFiYXNlQ29ubmVjdGlvbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXRoOiBzdHJpbmcsXG5cdFx0b3B0aW9uczogSVNRTGl0ZVN0b3JhZ2VEYXRhYmFzZU9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG5cdCkge1xuXHRcdHRoaXMubmFtZSA9IGJhc2VuYW1lKHRoaXMucGF0aCk7XG5cdFx0dGhpcy5sb2dnZXIgPSBuZXcgU1FMaXRlU3RvcmFnZURhdGFiYXNlTG9nZ2VyKG9wdGlvbnMubG9nZ2luZyk7XG5cdFx0dGhpcy51c2VXQUwgPSAhIW9wdGlvbnMudXNlV0FMO1xuXHRcdHRoaXMuYnVzeVRpbWVvdXQgPSBvcHRpb25zLmJ1c3lUaW1lb3V0O1xuXHRcdHRoaXMud2hlbkNvbm5lY3RlZCA9IHRoaXMuY29ubmVjdCh0aGlzLnBhdGgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0SXRlbXMoKTogUHJvbWlzZTxNYXA8c3RyaW5nLCBzdHJpbmc+PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMud2hlbkNvbm5lY3RlZDtcblxuXHRcdGNvbnN0IGl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IHJvd3MgPSBhd2FpdCB0aGlzLmFsbChjb25uZWN0aW9uLCAnU0VMRUNUICogRlJPTSBJdGVtVGFibGUnKTtcblx0XHRyb3dzLmZvckVhY2gocm93ID0+IGl0ZW1zLnNldChyb3cua2V5LCByb3cudmFsdWUpKTtcblxuXHRcdGlmICh0aGlzLmxvZ2dlci5pc1RyYWNpbmcpIHtcblx0XHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIGdldEl0ZW1zKCk6ICR7aXRlbXMuc2l6ZX0gcm93c2ApO1xuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUl0ZW1zKHJlcXVlc3Q6IElVcGRhdGVSZXF1ZXN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMud2hlbkNvbm5lY3RlZDtcblxuXHRcdHJldHVybiB0aGlzLmRvVXBkYXRlSXRlbXMoY29ubmVjdGlvbiwgcmVxdWVzdCk7XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlSXRlbXMoY29ubmVjdGlvbjogSURhdGFiYXNlQ29ubmVjdGlvbiwgcmVxdWVzdDogSVVwZGF0ZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5sb2dnZXIuaXNUcmFjaW5nKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci50cmFjZShgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSB1cGRhdGVJdGVtcygpOiBpbnNlcnQoJHtyZXF1ZXN0Lmluc2VydCA/IG1hcFRvU3RyaW5nKHJlcXVlc3QuaW5zZXJ0KSA6ICcwJ30pLCBkZWxldGUoJHtyZXF1ZXN0LmRlbGV0ZSA/IHNldFRvU3RyaW5nKHJlcXVlc3QuZGVsZXRlKSA6ICcwJ30pYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudHJhbnNhY3Rpb24oY29ubmVjdGlvbiwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9JbnNlcnQgPSByZXF1ZXN0Lmluc2VydDtcblx0XHRcdGNvbnN0IHRvRGVsZXRlID0gcmVxdWVzdC5kZWxldGU7XG5cblx0XHRcdC8vIElOU0VSVFxuXHRcdFx0aWYgKHRvSW5zZXJ0ICYmIHRvSW5zZXJ0LnNpemUgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGtleXNWYWx1ZXNDaHVua3M6IChzdHJpbmdbXSlbXSA9IFtdO1xuXHRcdFx0XHRrZXlzVmFsdWVzQ2h1bmtzLnB1c2goW10pOyAvLyBzZWVkIHdpdGggaW5pdGlhbCBlbXB0eSBjaHVua1xuXG5cdFx0XHRcdC8vIFNwbGl0IGtleS92YWx1ZXMgaW50byBjaHVua3Mgb2YgU1FMaXRlU3RvcmFnZURhdGFiYXNlLk1BWF9IT1NUX1BBUkFNRVRFUlNcblx0XHRcdFx0Ly8gc28gdGhhdCB3ZSBjYW4gZWZmaWNpZW50bHkgcnVuIHRoZSBJTlNFUlQgd2l0aCBhcyBtYW55IEhPU1QgcGFyYW1ldGVycyBhcyBwb3NzaWJsZVxuXHRcdFx0XHRsZXQgY3VycmVudENodW5rSW5kZXggPSAwO1xuXHRcdFx0XHR0b0luc2VydC5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRcdFx0bGV0IGtleVZhbHVlQ2h1bmsgPSBrZXlzVmFsdWVzQ2h1bmtzW2N1cnJlbnRDaHVua0luZGV4XTtcblxuXHRcdFx0XHRcdGlmIChrZXlWYWx1ZUNodW5rLmxlbmd0aCA+IFNRTGl0ZVN0b3JhZ2VEYXRhYmFzZS5NQVhfSE9TVF9QQVJBTUVURVJTKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50Q2h1bmtJbmRleCsrO1xuXHRcdFx0XHRcdFx0a2V5VmFsdWVDaHVuayA9IFtdO1xuXHRcdFx0XHRcdFx0a2V5c1ZhbHVlc0NodW5rcy5wdXNoKGtleVZhbHVlQ2h1bmspO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGtleVZhbHVlQ2h1bmsucHVzaChrZXksIHZhbHVlKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0a2V5c1ZhbHVlc0NodW5rcy5mb3JFYWNoKGtleXNWYWx1ZXNDaHVuayA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wcmVwYXJlKGNvbm5lY3Rpb24sIGBJTlNFUlQgSU5UTyBJdGVtVGFibGUgVkFMVUVTICR7bmV3IEFycmF5KGtleXNWYWx1ZXNDaHVuay5sZW5ndGggLyAyKS5maWxsKCcoPyw/KScpLmpvaW4oJywnKX0gT04gQ09ORkxJQ1QgKGtleSkgRE8gVVBEQVRFIFNFVCB2YWx1ZSA9IGV4Y2x1ZGVkLnZhbHVlIFdIRVJFIHZhbHVlICE9IGV4Y2x1ZGVkLnZhbHVlYCwgc3RtdCA9PiBzdG10LnJ1bihrZXlzVmFsdWVzQ2h1bmspLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdFx0bGV0IGxlbmd0aCA9IDA7XG5cdFx0XHRcdFx0XHR0b0luc2VydC5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGtleXMucHVzaChrZXkpO1xuXHRcdFx0XHRcdFx0XHRsZW5ndGggKz0gdmFsdWUubGVuZ3RoO1xuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBgS2V5czogJHtrZXlzLmpvaW4oJywgJyl9IExlbmd0aDogJHtsZW5ndGh9YDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERFTEVURVxuXHRcdFx0aWYgKHRvRGVsZXRlPy5zaXplKSB7XG5cdFx0XHRcdGNvbnN0IGtleXNDaHVua3M6IChzdHJpbmdbXSlbXSA9IFtdO1xuXHRcdFx0XHRrZXlzQ2h1bmtzLnB1c2goW10pOyAvLyBzZWVkIHdpdGggaW5pdGlhbCBlbXB0eSBjaHVua1xuXG5cdFx0XHRcdC8vIFNwbGl0IGtleXMgaW50byBjaHVua3Mgb2YgU1FMaXRlU3RvcmFnZURhdGFiYXNlLk1BWF9IT1NUX1BBUkFNRVRFUlNcblx0XHRcdFx0Ly8gc28gdGhhdCB3ZSBjYW4gZWZmaWNpZW50bHkgcnVuIHRoZSBERUxFVEUgd2l0aCBhcyBtYW55IEhPU1QgcGFyYW1ldGVyc1xuXHRcdFx0XHQvLyBhcyBwb3NzaWJsZVxuXHRcdFx0XHRsZXQgY3VycmVudENodW5rSW5kZXggPSAwO1xuXHRcdFx0XHR0b0RlbGV0ZS5mb3JFYWNoKGtleSA9PiB7XG5cdFx0XHRcdFx0bGV0IGtleUNodW5rID0ga2V5c0NodW5rc1tjdXJyZW50Q2h1bmtJbmRleF07XG5cblx0XHRcdFx0XHRpZiAoa2V5Q2h1bmsubGVuZ3RoID4gU1FMaXRlU3RvcmFnZURhdGFiYXNlLk1BWF9IT1NUX1BBUkFNRVRFUlMpIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRDaHVua0luZGV4Kys7XG5cdFx0XHRcdFx0XHRrZXlDaHVuayA9IFtdO1xuXHRcdFx0XHRcdFx0a2V5c0NodW5rcy5wdXNoKGtleUNodW5rKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRrZXlDaHVuay5wdXNoKGtleSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGtleXNDaHVua3MuZm9yRWFjaChrZXlzQ2h1bmsgPT4ge1xuXHRcdFx0XHRcdHRoaXMucHJlcGFyZShjb25uZWN0aW9uLCBgREVMRVRFIEZST00gSXRlbVRhYmxlIFdIRVJFIGtleSBJTiAoJHtuZXcgQXJyYXkoa2V5c0NodW5rLmxlbmd0aCkuZmlsbCgnPycpLmpvaW4oJywnKX0pYCwgc3RtdCA9PiBzdG10LnJ1bihrZXlzQ2h1bmspLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdFx0dG9EZWxldGUuZm9yRWFjaChrZXkgPT4ge1xuXHRcdFx0XHRcdFx0XHRrZXlzLnB1c2goa2V5KTtcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gYEtleXM6ICR7a2V5cy5qb2luKCcsICcpfWA7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgb3B0aW1pemUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dnZXIudHJhY2UoYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gdmFjdXVtKClgKTtcblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLndoZW5Db25uZWN0ZWQ7XG5cblx0XHRyZXR1cm4gdGhpcy5leGVjKGNvbm5lY3Rpb24sICdWQUNVVU0nKTtcblx0fVxuXG5cdGFzeW5jIGNsb3NlKHJlY292ZXJ5PzogKCkgPT4gTWFwPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIGNsb3NlKClgKTtcblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLndoZW5Db25uZWN0ZWQ7XG5cblx0XHRyZXR1cm4gdGhpcy5kb0Nsb3NlKGNvbm5lY3Rpb24sIHJlY292ZXJ5KTtcblx0fVxuXG5cdHByaXZhdGUgZG9DbG9zZShjb25uZWN0aW9uOiBJRGF0YWJhc2VDb25uZWN0aW9uLCByZWNvdmVyeT86ICgpID0+IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29ubmVjdGlvbi5kYi5jbG9zZShjbG9zZUVycm9yID0+IHtcblx0XHRcdFx0aWYgKGNsb3NlRXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZVNRTGl0ZUVycm9yKGNvbm5lY3Rpb24sIGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIGNsb3NlKCk6ICR7Y2xvc2VFcnJvcn1gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJldHVybiBlYXJseSBpZiB0aGlzIHN0b3JhZ2Ugd2FzIGNyZWF0ZWQgb25seSBpbi1tZW1vcnlcblx0XHRcdFx0Ly8gZS5nLiB3aGVuIHJ1bm5pbmcgdGVzdHMgd2UgZG8gbm90IG5lZWQgdG8gYmFja3VwLlxuXHRcdFx0XHRpZiAodGhpcy5wYXRoID09PSBTUUxpdGVTdG9yYWdlRGF0YWJhc2UuSU5fTUVNT1JZX1BBVEgpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIERCIGNsb3NlZCBzdWNjZXNzZnVsbHkgYW5kIHdlIGFyZSBub3QgcnVubmluZyBpbi1tZW1vcnlcblx0XHRcdFx0Ly8gYW5kIHRoZSBEQiBkaWQgbm90IGdldCBlcnJvcnMgZHVyaW5nIHJ1bnRpbWUsIG1ha2UgYSBiYWNrdXBcblx0XHRcdFx0Ly8gb2YgdGhlIERCIHNvIHRoYXQgd2UgY2FuIHVzZSBpdCBhcyBmYWxsYmFjayBpbiBjYXNlIHRoZSBhY3R1YWxcblx0XHRcdFx0Ly8gREIgYmVjb21lcyBjb3JydXB0IGluIHRoZSBmdXR1cmUuXG5cdFx0XHRcdGlmICghY29ubmVjdGlvbi5pc0Vycm9uZW91cyAmJiAhY29ubmVjdGlvbi5pc0luTWVtb3J5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuYmFja3VwKCkudGhlbihyZXNvbHZlLCBlcnJvciA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBiYWNrdXAoKTogJHtlcnJvcn1gKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoKTsgLy8gaWdub3JlIGZhaWxpbmcgYmFja3VwXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZWNvdmVyeTogaWYgd2UgZGV0ZWN0ZWQgZXJyb3JzIHdoaWxlIHVzaW5nIHRoZSBEQiBvciB3ZSBhcmUgdXNpbmdcblx0XHRcdFx0Ly8gYW4gaW5tZW1vcnkgREIgKGFzIGEgZmFsbGJhY2sgdG8gbm90IGJlaW5nIGFibGUgdG8gb3BlbiB0aGUgREIgaW5pdGlhbGx5KVxuXHRcdFx0XHQvLyBhbmQgd2UgaGF2ZSBhIHJlY292ZXJ5IGZ1bmN0aW9uIHByb3ZpZGVkLCB3ZSByZWNyZWF0ZSB0aGUgREIgd2l0aCB0aGlzXG5cdFx0XHRcdC8vIGRhdGEgdG8gcmVjb3ZlciBhbGwga25vd24gZGF0YSB3aXRob3V0IGxvc3MgaWYgcG9zc2libGUuXG5cdFx0XHRcdGlmICh0eXBlb2YgcmVjb3ZlcnkgPT09ICdmdW5jdGlvbicpIHtcblxuXHRcdFx0XHRcdC8vIERlbGV0ZSB0aGUgZXhpc3RpbmcgREIuIElmIHRoZSBwYXRoIGRvZXMgbm90IGV4aXN0IG9yIGZhaWxzIHRvXG5cdFx0XHRcdFx0Ly8gYmUgZGVsZXRlZCwgd2UgZG8gbm90IHRyeSB0byByZWNvdmVyIGFueW1vcmUgYmVjYXVzZSB3ZSBhc3N1bWVcblx0XHRcdFx0XHQvLyB0aGF0IHRoZSBwYXRoIGlzIG5vIGxvbmdlciB3cml0ZWFibGUgZm9yIHVzLlxuXHRcdFx0XHRcdHJldHVybiBmcy5wcm9taXNlcy51bmxpbmsodGhpcy5wYXRoKS50aGVuKCgpID0+IHtcblxuXHRcdFx0XHRcdFx0Ly8gUmUtb3BlbiB0aGUgREIgZnJlc2hcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmRvQ29ubmVjdCh0aGlzLnBhdGgpLnRoZW4ocmVjb3ZlcnlDb25uZWN0aW9uID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2xvc2VSZWNvdmVyeUNvbm5lY3Rpb24gPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZG9DbG9zZShyZWNvdmVyeUNvbm5lY3Rpb24sIHVuZGVmaW5lZCAvKiBkbyBub3QgYXR0ZW1wdCB0byByZWNvdmVyIGFnYWluICovKTtcblx0XHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0XHQvLyBTdG9yZSBpdGVtc1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb1VwZGF0ZUl0ZW1zKHJlY292ZXJ5Q29ubmVjdGlvbiwgeyBpbnNlcnQ6IHJlY292ZXJ5KCkgfSkudGhlbigoKSA9PiBjbG9zZVJlY292ZXJ5Q29ubmVjdGlvbigpLCBlcnJvciA9PiB7XG5cblx0XHRcdFx0XHRcdFx0XHQvLyBJbiBjYXNlIG9mIGFuIGVycm9yIHVwZGF0aW5nIGl0ZW1zLCBzdGlsbCBlbnN1cmUgdG8gY2xvc2UgdGhlIGNvbm5lY3Rpb25cblx0XHRcdFx0XHRcdFx0XHQvLyB0byBwcmV2ZW50IFNRTElURV9CVVNZIGVycm9ycyB3aGVuIHRoZSBjb25uZWN0aW9uIGlzIHJlZXN0YWJsaXNoZWRcblx0XHRcdFx0XHRcdFx0XHRjbG9zZVJlY292ZXJ5Q29ubmVjdGlvbigpO1xuXG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGaW5hbGx5IHdpdGhvdXQgcmVjb3Zlcnkgd2UganVzdCByZWplY3Rcblx0XHRcdFx0cmV0dXJuIHJlamVjdChjbG9zZUVycm9yIHx8IG5ldyBFcnJvcignRGF0YWJhc2UgaGFzIGVycm9ycyBvciBpcyBpbi1tZW1vcnkgd2l0aG91dCByZWNvdmVyeSBvcHRpb24nKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYmFja3VwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJhY2t1cFBhdGggPSB0aGlzLnRvQmFja3VwUGF0aCh0aGlzLnBhdGgpO1xuXG5cdFx0cmV0dXJuIFByb21pc2VzLmNvcHkodGhpcy5wYXRoLCBiYWNrdXBQYXRoLCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0JhY2t1cFBhdGgocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7cGF0aH0uYmFja3VwYDtcblx0fVxuXG5cdGFzeW5jIGNoZWNrSW50ZWdyaXR5KGZ1bGw6IGJvb2xlYW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIGNoZWNrSW50ZWdyaXR5KGZ1bGw6ICR7ZnVsbH0pYCk7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy53aGVuQ29ubmVjdGVkO1xuXHRcdGNvbnN0IHJvdyA9IGF3YWl0IHRoaXMuZ2V0KGNvbm5lY3Rpb24sIGZ1bGwgPyAnUFJBR01BIGludGVncml0eV9jaGVjaycgOiAnUFJBR01BIHF1aWNrX2NoZWNrJyk7XG5cblx0XHRjb25zdCBpbnRlZ3JpdHkgPSBmdWxsID8gKHJvdyBhcyB7IGludGVncml0eV9jaGVjazogc3RyaW5nIH0pLmludGVncml0eV9jaGVjayA6IChyb3cgYXMgeyBxdWlja19jaGVjazogc3RyaW5nIH0pLnF1aWNrX2NoZWNrO1xuXG5cdFx0aWYgKGNvbm5lY3Rpb24uaXNFcnJvbmVvdXMpIHtcblx0XHRcdHJldHVybiBgJHtpbnRlZ3JpdHl9IChsYXN0IGVycm9yOiAke2Nvbm5lY3Rpb24ubGFzdEVycm9yfSlgO1xuXHRcdH1cblxuXHRcdGlmIChjb25uZWN0aW9uLmlzSW5NZW1vcnkpIHtcblx0XHRcdHJldHVybiBgJHtpbnRlZ3JpdHl9IChpbi1tZW1vcnkhKWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGludGVncml0eTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29ubmVjdChwYXRoOiBzdHJpbmcsIHJldHJ5T25CdXN5ID0gdHJ1ZSk6IFByb21pc2U8SURhdGFiYXNlQ29ubmVjdGlvbj4ge1xuXHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIG9wZW4oJHtwYXRofSwgcmV0cnlPbkJ1c3k6ICR7cmV0cnlPbkJ1c3l9KWApO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmRvQ29ubmVjdChwYXRoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IoYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gb3BlbigpOiBVbmFibGUgdG8gb3BlbiBEQiBkdWUgdG8gJHtlcnJvcn1gKTtcblxuXHRcdFx0Ly8gU1FMSVRFX0JVU1kgc2hvdWxkIG9ubHkgYXJpc2UgaWYgYW5vdGhlciBwcm9jZXNzIGlzIGxvY2tpbmcgdGhlIHNhbWUgREIgd2Ugd2FudFxuXHRcdFx0Ly8gdG8gb3BlbiBhdCB0aGF0IHRpbWUuIFRoaXMgdHlwaWNhbGx5IG5ldmVyIGhhcHBlbnMgYmVjYXVzZSBhIERCIGNvbm5lY3Rpb24gaXNcblx0XHRcdC8vIGxpbWl0ZWQgcGVyIHdpbmRvdy4gSG93ZXZlciwgaW4gdGhlIGV2ZW50IG9mIGEgd2luZG93IHJlbG9hZCwgaXQgbWF5IGJlIHBvc3NpYmxlXG5cdFx0XHQvLyB0aGF0IHRoZSBwcmV2aW91cyBjb25uZWN0aW9uIHdhcyBub3QgcHJvcGVybHkgY2xvc2VkIHdoaWxlIHRoZSBuZXcgY29ubmVjdGlvbiBpc1xuXHRcdFx0Ly8gYWxyZWFkeSBlc3RhYmxpc2hlZC5cblx0XHRcdC8vXG5cdFx0XHQvLyBJbiB0aGlzIGNhc2Ugd2Ugc2ltcGx5IHdhaXQgZm9yIHNvbWUgdGltZSBhbmQgcmV0cnkgb25jZSB0byBlc3RhYmxpc2ggdGhlIGNvbm5lY3Rpb24uXG5cdFx0XHQvL1xuXHRcdFx0aWYgKGVycm9yLmNvZGUgPT09ICdTUUxJVEVfQlVTWScgJiYgcmV0cnlPbkJ1c3kpIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dChTUUxpdGVTdG9yYWdlRGF0YWJhc2UuQlVTWV9PUEVOX1RJTUVPVVQpO1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLmNvbm5lY3QocGF0aCwgZmFsc2UgLyogbm90IGFub3RoZXIgcmV0cnkgKi8pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UsIGJlc3Qgd2UgY2FuIGRvIGlzIHRvIHJlY292ZXIgZnJvbSBhIGJhY2t1cCBpZiB0aGF0IGV4aXN0cywgYXMgc3VjaCB3ZVxuXHRcdFx0Ly8gbW92ZSB0aGUgREIgdG8gYSBkaWZmZXJlbnQgZmlsZW5hbWUgYW5kIHRyeSB0byBsb2FkIGZyb20gYmFja3VwLiBJZiB0aGF0IGZhaWxzLFxuXHRcdFx0Ly8gYSBuZXcgZW1wdHkgREIgaXMgYmVpbmcgY3JlYXRlZCBhdXRvbWF0aWNhbGx5LlxuXHRcdFx0Ly9cblx0XHRcdC8vIFRoZSBmaW5hbCBmYWxsYmFjayBpcyB0byB1c2UgYW4gaW4tbWVtb3J5IERCIHdoaWNoIHNob3VsZCBvbmx5IGhhcHBlbiBpZiB0aGUgdGFyZ2V0XG5cdFx0XHQvLyBmb2xkZXIgaXMgcmVhbGx5IG5vdCB3cml0ZWFibGUgZm9yIHVzLlxuXHRcdFx0Ly9cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhwYXRoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUodGhpcy50b0JhY2t1cFBhdGgocGF0aCksIHBhdGgsIGZhbHNlIC8qIG5vIHJldHJ5ICovKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5kb0Nvbm5lY3QocGF0aCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBvcGVuKCk6IFVuYWJsZSB0byB1c2UgYmFja3VwIGR1ZSB0byAke2Vycm9yfWApO1xuXG5cdFx0XHRcdC8vIEluIGNhc2Ugb2YgYW55IGVycm9yIHRvIG9wZW4gdGhlIERCLCB1c2UgYW4gaW4tbWVtb3J5XG5cdFx0XHRcdC8vIERCIHNvIHRoYXQgd2UgYWx3YXlzIGhhdmUgYSB2YWxpZCBEQiB0byB0YWxrIHRvLlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5kb0Nvbm5lY3QoU1FMaXRlU3RvcmFnZURhdGFiYXNlLklOX01FTU9SWV9QQVRIKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVNRTGl0ZUVycm9yKGNvbm5lY3Rpb246IElEYXRhYmFzZUNvbm5lY3Rpb24sIG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29ubmVjdGlvbi5pc0Vycm9uZW91cyA9IHRydWU7XG5cdFx0Y29ubmVjdGlvbi5sYXN0RXJyb3IgPSBtc2c7XG5cblx0XHR0aGlzLmxvZ2dlci5lcnJvcihtc2cpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0Nvbm5lY3QocGF0aDogc3RyaW5nKTogUHJvbWlzZTxJRGF0YWJhc2VDb25uZWN0aW9uPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGltcG9ydCgnQHZzY29kZS9zcWxpdGUzJykudGhlbihzcWxpdGUzID0+IHtcblx0XHRcdFx0Y29uc3QgY3RvciA9ICh0aGlzLmxvZ2dlci5pc1RyYWNpbmcgPyBzcWxpdGUzLmRlZmF1bHQudmVyYm9zZSgpLkRhdGFiYXNlIDogc3FsaXRlMy5kZWZhdWx0LkRhdGFiYXNlKTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbjogSURhdGFiYXNlQ29ubmVjdGlvbiA9IHtcblx0XHRcdFx0XHRkYjogbmV3IGN0b3IocGF0aCwgKGVycm9yOiAoRXJyb3IgJiB7IGNvZGU/OiBzdHJpbmcgfSkgfCBudWxsKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIChjb25uZWN0aW9uLmRiICYmIGVycm9yLmNvZGUgIT09ICdTUUxJVEVfQ0FOVE9QRU4nIC8qIGh0dHBzOi8vZ2l0aHViLmNvbS9UcnlHaG9zdC9ub2RlLXNxbGl0ZTMvaXNzdWVzLzE2MTcgKi8pID8gY29ubmVjdGlvbi5kYi5jbG9zZSgoKSA9PiByZWplY3QoZXJyb3IpKSA6IHJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFRoZSBmb2xsb3dpbmcgZXhlYygpIHN0YXRlbWVudCBzZXJ2ZXMgdHdvIHB1cnBvc2VzOlxuXHRcdFx0XHRcdFx0Ly8gLSBjcmVhdGUgdGhlIERCIGlmIGl0IGRvZXMgbm90IGV4aXN0IHlldFxuXHRcdFx0XHRcdFx0Ly8gLSB2YWxpZGF0ZSB0aGF0IHRoZSBEQiBpcyBub3QgY29ycnVwdCAodGhlIG9wZW4oKSBjYWxsIGRvZXMgbm90IHRocm93IG90aGVyd2lzZSlcblx0XHRcdFx0XHRcdGNvbnN0IHByYWdtYXM6IHN0cmluZ1tdID0gW1xuXHRcdFx0XHRcdFx0XHQnUFJBR01BIHVzZXJfdmVyc2lvbiA9IDE7Jyxcblx0XHRcdFx0XHRcdFx0J0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIEl0ZW1UYWJsZSAoa2V5IFRFWFQgVU5JUVVFIE9OIENPTkZMSUNUIFJFUExBQ0UsIHZhbHVlIEJMT0IpOydcblx0XHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0XHRpZiAodGhpcy51c2VXQUwpIHtcblx0XHRcdFx0XHRcdFx0cHJhZ21hcy5wdXNoKCdQUkFHTUEgam91cm5hbF9tb2RlPVdBTDsnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICh0aGlzLmJ1c3lUaW1lb3V0KSB7XG5cdFx0XHRcdFx0XHRcdHByYWdtYXMucHVzaChgUFJBR01BIGJ1c3lfdGltZW91dD0ke3RoaXMuYnVzeVRpbWVvdXR9O2ApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZXhlYyhjb25uZWN0aW9uLCBwcmFnbWFzLmpvaW4oJycpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoY29ubmVjdGlvbik7XG5cdFx0XHRcdFx0XHR9LCBlcnJvciA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjb25uZWN0aW9uLmRiLmNsb3NlKCgpID0+IHJlamVjdChlcnJvcikpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0aXNJbk1lbW9yeTogcGF0aCA9PT0gU1FMaXRlU3RvcmFnZURhdGFiYXNlLklOX01FTU9SWV9QQVRIXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gRXJyb3JzXG5cdFx0XHRcdGNvbm5lY3Rpb24uZGIub24oJ2Vycm9yJywgZXJyb3IgPT4gdGhpcy5oYW5kbGVTUUxpdGVFcnJvcihjb25uZWN0aW9uLCBgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBFcnJvciAoZXZlbnQpOiAke2Vycm9yfWApKTtcblxuXHRcdFx0XHQvLyBUcmFjaW5nXG5cdFx0XHRcdGlmICh0aGlzLmxvZ2dlci5pc1RyYWNpbmcpIHtcblx0XHRcdFx0XHRjb25uZWN0aW9uLmRiLm9uKCd0cmFjZScsIHNxbCA9PiB0aGlzLmxvZ2dlci50cmFjZShgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBUcmFjZSAoZXZlbnQpOiAke3NxbH1gKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHJlamVjdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGV4ZWMoY29ubmVjdGlvbjogSURhdGFiYXNlQ29ubmVjdGlvbiwgc3FsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29ubmVjdGlvbi5kYi5leGVjKHNxbCwgZXJyb3IgPT4ge1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZVNRTGl0ZUVycm9yKGNvbm5lY3Rpb24sIGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIGV4ZWMoKTogJHtlcnJvcn1gKTtcblxuXHRcdFx0XHRcdHJldHVybiByZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQoY29ubmVjdGlvbjogSURhdGFiYXNlQ29ubmVjdGlvbiwgc3FsOiBzdHJpbmcpOiBQcm9taXNlPG9iamVjdD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25uZWN0aW9uLmRiLmdldChzcWwsIChlcnJvciwgcm93KSA9PiB7XG5cdFx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlU1FMaXRlRXJyb3IoY29ubmVjdGlvbiwgYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gZ2V0KCk6ICR7ZXJyb3J9YCk7XG5cblx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKHJvdyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYWxsKGNvbm5lY3Rpb246IElEYXRhYmFzZUNvbm5lY3Rpb24sIHNxbDogc3RyaW5nKTogUHJvbWlzZTx7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXT4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25uZWN0aW9uLmRiLmFsbChzcWwsIChlcnJvciwgcm93cykgPT4ge1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZVNRTGl0ZUVycm9yKGNvbm5lY3Rpb24sIGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIGFsbCgpOiAke2Vycm9yfWApO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHJlamVjdChlcnJvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShyb3dzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmFuc2FjdGlvbihjb25uZWN0aW9uOiBJRGF0YWJhc2VDb25uZWN0aW9uLCB0cmFuc2FjdGlvbnM6ICgpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29ubmVjdGlvbi5kYi5zZXJpYWxpemUoKCkgPT4ge1xuXHRcdFx0XHRjb25uZWN0aW9uLmRiLnJ1bignQkVHSU4gVFJBTlNBQ1RJT04nKTtcblxuXHRcdFx0XHR0cmFuc2FjdGlvbnMoKTtcblxuXHRcdFx0XHRjb25uZWN0aW9uLmRiLnJ1bignRU5EIFRSQU5TQUNUSU9OJywgZXJyb3IgPT4ge1xuXHRcdFx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVTUUxpdGVFcnJvcihjb25uZWN0aW9uLCBgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSB0cmFuc2FjdGlvbigpOiAke2Vycm9yfWApO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBwcmVwYXJlKGNvbm5lY3Rpb246IElEYXRhYmFzZUNvbm5lY3Rpb24sIHNxbDogc3RyaW5nLCBydW5DYWxsYmFjazogKHN0bXQ6IFN0YXRlbWVudCkgPT4gdm9pZCwgZXJyb3JEZXRhaWxzOiAoKSA9PiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdG10ID0gY29ubmVjdGlvbi5kYi5wcmVwYXJlKHNxbCk7XG5cblx0XHRjb25zdCBzdGF0ZW1lbnRFcnJvckxpc3RlbmVyID0gKGVycm9yOiBFcnJvcikgPT4ge1xuXHRcdFx0dGhpcy5oYW5kbGVTUUxpdGVFcnJvcihjb25uZWN0aW9uLCBgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBwcmVwYXJlKCk6ICR7ZXJyb3J9ICgke3NxbH0pLiBEZXRhaWxzOiAke2Vycm9yRGV0YWlscygpfWApO1xuXHRcdH07XG5cblx0XHRzdG10Lm9uKCdlcnJvcicsIHN0YXRlbWVudEVycm9yTGlzdGVuZXIpO1xuXG5cdFx0cnVuQ2FsbGJhY2soc3RtdCk7XG5cblx0XHRzdG10LmZpbmFsaXplKGVycm9yID0+IHtcblx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRzdGF0ZW1lbnRFcnJvckxpc3RlbmVyKGVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0c3RtdC5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBzdGF0ZW1lbnRFcnJvckxpc3RlbmVyKTtcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBTUUxpdGVTdG9yYWdlRGF0YWJhc2VMb2dnZXIge1xuXG5cdC8vIHRvIHJlZHVjZSBsb3RzIG9mIG91dHB1dCwgcmVxdWlyZSBhbiBlbnZpcm9ubWVudCB2YXJpYWJsZSB0byBlbmFibGUgdHJhY2luZ1xuXHQvLyB0aGlzIGhlbHBzIHdoZW4gcnVubmluZyB3aXRoIC0tdmVyYm9zZSBub3JtYWxseSB3aGVyZSB0aGUgc3RvcmFnZSB0cmFjaW5nXG5cdC8vIG1pZ2h0IGhpZGUgdXNlZnVsIG91dHB1dCB0byBsb29rIGF0XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFZTQ09ERV9UUkFDRV9TVE9SQUdFID0gJ1ZTQ09ERV9UUkFDRV9TVE9SQUdFJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxvZ1RyYWNlOiAoKG1zZzogc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBsb2dFcnJvcjogKChlcnJvcjogc3RyaW5nIHwgRXJyb3IpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM/OiBJU1FMaXRlU3RvcmFnZURhdGFiYXNlTG9nZ2luZ09wdGlvbnMpIHtcblx0XHRpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5sb2dUcmFjZSA9PT0gJ2Z1bmN0aW9uJyAmJiBwcm9jZXNzLmVudltTUUxpdGVTdG9yYWdlRGF0YWJhc2VMb2dnZXIuVlNDT0RFX1RSQUNFX1NUT1JBR0VdKSB7XG5cdFx0XHR0aGlzLmxvZ1RyYWNlID0gb3B0aW9ucy5sb2dUcmFjZTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5sb2dFcnJvciA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dGhpcy5sb2dFcnJvciA9IG9wdGlvbnMubG9nRXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGlzVHJhY2luZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmxvZ1RyYWNlO1xuXHR9XG5cblx0dHJhY2UobXNnOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1RyYWNlPy4obXNnKTtcblx0fVxuXG5cdGVycm9yKGVycm9yOiBzdHJpbmcgfCBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMubG9nRXJyb3I/LihlcnJvcik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUE2QmxCLE1BQU0seUJBQU4sTUFBTSx1QkFBa0Q7QUFBQSxFQWlCOUQsWUFDa0IsTUFDakIsVUFBeUMsdUJBQU8sT0FBTyxJQUFJLEdBQzFEO0FBRmdCO0FBR2pCLFNBQUssT0FBTyxTQUFTLEtBQUssSUFBSTtBQUM5QixTQUFLLFNBQVMsSUFBSSw0QkFBNEIsUUFBUSxPQUFPO0FBQzdELFNBQUssU0FBUyxDQUFDLENBQUMsUUFBUTtBQUN4QixTQUFLLGNBQWMsUUFBUTtBQUMzQixTQUFLLGdCQUFnQixLQUFLLFFBQVEsS0FBSyxJQUFJO0FBQUEsRUFDNUM7QUFBQSxFQXRCQSxJQUFJLDJCQUE0RDtBQUFFLFdBQU8sTUFBTTtBQUFBLEVBQU07QUFBQSxFQXdCckYsTUFBTSxXQUF5QztBQUM5QyxVQUFNLGFBQWEsTUFBTSxLQUFLO0FBRTlCLFVBQU0sUUFBUSxvQkFBSSxJQUFvQjtBQUV0QyxVQUFNLE9BQU8sTUFBTSxLQUFLLElBQUksWUFBWSx5QkFBeUI7QUFDakUsU0FBSyxRQUFRLFNBQU8sTUFBTSxJQUFJLElBQUksS0FBSyxJQUFJLEtBQUssQ0FBQztBQUVqRCxRQUFJLEtBQUssT0FBTyxXQUFXO0FBQzFCLFdBQUssT0FBTyxNQUFNLFlBQVksS0FBSyxJQUFJLGlCQUFpQixNQUFNLElBQUks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
