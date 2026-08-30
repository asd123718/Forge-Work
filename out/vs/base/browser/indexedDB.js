import { toErrorMessage } from "../common/errorMessage.js";
import { ErrorNoTelemetry, getErrorMessage } from "../common/errors.js";
import { mark } from "../common/performance.js";
class MissingStoresError extends Error {
  constructor(db) {
    super("Missing stores");
    this.db = db;
  }
}
class DBClosedError extends Error {
  constructor(dbName) {
    super(`IndexedDB database '${dbName}' is closed.`);
    this.code = "DBClosed";
  }
}
class IndexedDB {
  constructor(database, name) {
    this.name = name;
    this.database = null;
    this.pendingTransactions = [];
    this.database = database;
  }
  static async create(name, version, stores) {
    const database = await IndexedDB.openDatabase(name, version, stores);
    return new IndexedDB(database, name);
  }
  static async openDatabase(name, version, stores) {
    mark(`code/willOpenDatabase/${name}`);
    try {
      return await IndexedDB.doOpenDatabase(name, version, stores);
    } catch (err) {
      if (err instanceof MissingStoresError) {
        console.info(`Attempting to recreate the IndexedDB once.`, name);
        try {
          await IndexedDB.deleteDatabase(err.db);
        } catch (error) {
          console.error(`Error while deleting the IndexedDB`, getErrorMessage(error));
          throw error;
        }
        return await IndexedDB.doOpenDatabase(name, version, stores);
      }
      throw err;
    } finally {
      mark(`code/didOpenDatabase/${name}`);
    }
  }
  static doOpenDatabase(name, version, stores) {
    return new Promise((c, e) => {
      const request = indexedDB.open(name, version);
      request.onerror = () => e(request.error);
      request.onsuccess = () => {
        const db = request.result;
        for (const store of stores) {
          if (!db.objectStoreNames.contains(store)) {
            console.error(`Error while opening IndexedDB. Could not find '${store}'' object store`);
            e(new MissingStoresError(db));
            return;
          }
        }
        c(db);
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of stores) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        }
      };
    });
  }
  static deleteDatabase(database) {
    return new Promise((c, e) => {
      database.close();
      const deleteRequest = indexedDB.deleteDatabase(database.name);
      deleteRequest.onerror = (err) => e(deleteRequest.error);
      deleteRequest.onsuccess = () => c();
    });
  }
  hasPendingTransactions() {
    return this.pendingTransactions.length > 0;
  }
  close() {
    if (this.pendingTransactions.length) {
      this.pendingTransactions.splice(0, this.pendingTransactions.length).forEach((transaction) => transaction.abort());
    }
    this.database?.close();
    this.database = null;
  }
  async runInTransaction(store, transactionMode, dbRequestFn) {
    if (!this.database) {
      throw new DBClosedError(this.name);
    }
    const transaction = this.database.transaction(store, transactionMode);
    this.pendingTransactions.push(transaction);
    return new Promise((c, e) => {
      transaction.oncomplete = () => {
        if (Array.isArray(request)) {
          c(request.map((r) => r.result));
        } else {
          c(request.result);
        }
      };
      transaction.onerror = () => e(transaction.error ? ErrorNoTelemetry.fromError(transaction.error) : new ErrorNoTelemetry("unknown error"));
      transaction.onabort = () => e(transaction.error ? ErrorNoTelemetry.fromError(transaction.error) : new ErrorNoTelemetry("unknown error"));
      const request = dbRequestFn(transaction.objectStore(store));
    }).finally(() => this.pendingTransactions.splice(this.pendingTransactions.indexOf(transaction), 1));
  }
  /**
   * Atomically stores `newValue` when the current valid value strictly equals `expectedValue`.
   * Values rejected by `isValid` are treated as `undefined`; transaction failures reject without committing.
   */
  async compareAndSwap(store, key, expectedValue, newValue, isValid) {
    if (!this.database) {
      throw new DBClosedError(this.name);
    }
    const transaction = this.database.transaction(store, "readwrite");
    this.pendingTransactions.push(transaction);
    return new Promise((resolve, reject) => {
      let currentValue;
      let swapped = false;
      transaction.oncomplete = () => resolve({
        swapped,
        currentValue: swapped ? newValue : currentValue
      });
      transaction.onerror = () => reject(transaction.error ? ErrorNoTelemetry.fromError(transaction.error) : new ErrorNoTelemetry("unknown error"));
      transaction.onabort = () => reject(transaction.error ? ErrorNoTelemetry.fromError(transaction.error) : new ErrorNoTelemetry("unknown error"));
      const objectStore = transaction.objectStore(store);
      const request = objectStore.get(key);
      request.onsuccess = () => {
        currentValue = isValid(request.result) ? request.result : void 0;
        if (currentValue === expectedValue) {
          swapped = true;
          objectStore.put(newValue, key);
        }
      };
    }).finally(() => this.pendingTransactions.splice(this.pendingTransactions.indexOf(transaction), 1));
  }
  async getKeyValues(store, isValid) {
    if (!this.database) {
      throw new DBClosedError(this.name);
    }
    const transaction = this.database.transaction(store, "readonly");
    this.pendingTransactions.push(transaction);
    return new Promise((resolve) => {
      const items = /* @__PURE__ */ new Map();
      const objectStore = transaction.objectStore(store);
      const cursor = objectStore.openCursor();
      if (!cursor) {
        return resolve(items);
      }
      cursor.onsuccess = () => {
        if (cursor.result) {
          if (isValid(cursor.result.value)) {
            items.set(cursor.result.key.toString(), cursor.result.value);
          }
          cursor.result.continue();
        } else {
          resolve(items);
        }
      };
      const onError = (error) => {
        console.error(`IndexedDB getKeyValues(): ${toErrorMessage(error, true)}`);
        resolve(items);
      };
      cursor.onerror = () => onError(cursor.error);
      transaction.onerror = () => onError(transaction.error);
    }).finally(() => this.pendingTransactions.splice(this.pendingTransactions.indexOf(transaction), 1));
  }
}
export {
  DBClosedError,
  IndexedDB
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFxpbmRleGVkREIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRXJyb3JOb1RlbGVtZXRyeSwgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBtYXJrIH0gZnJvbSAnLi4vY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcblxuY2xhc3MgTWlzc2luZ1N0b3Jlc0Vycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBkYjogSURCRGF0YWJhc2UpIHtcblx0XHRzdXBlcignTWlzc2luZyBzdG9yZXMnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgREJDbG9zZWRFcnJvciBleHRlbmRzIEVycm9yIHtcblx0cmVhZG9ubHkgY29kZSA9ICdEQkNsb3NlZCc7XG5cdGNvbnN0cnVjdG9yKGRiTmFtZTogc3RyaW5nKSB7XG5cdFx0c3VwZXIoYEluZGV4ZWREQiBkYXRhYmFzZSAnJHtkYk5hbWV9JyBpcyBjbG9zZWQuYCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluZGV4ZWREQiB7XG5cblx0c3RhdGljIGFzeW5jIGNyZWF0ZShuYW1lOiBzdHJpbmcsIHZlcnNpb246IG51bWJlciB8IHVuZGVmaW5lZCwgc3RvcmVzOiBzdHJpbmdbXSk6IFByb21pc2U8SW5kZXhlZERCPiB7XG5cdFx0Y29uc3QgZGF0YWJhc2UgPSBhd2FpdCBJbmRleGVkREIub3BlbkRhdGFiYXNlKG5hbWUsIHZlcnNpb24sIHN0b3Jlcyk7XG5cdFx0cmV0dXJuIG5ldyBJbmRleGVkREIoZGF0YWJhc2UsIG5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgYXN5bmMgb3BlbkRhdGFiYXNlKG5hbWU6IHN0cmluZywgdmVyc2lvbjogbnVtYmVyIHwgdW5kZWZpbmVkLCBzdG9yZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxJREJEYXRhYmFzZT4ge1xuXHRcdG1hcmsoYGNvZGUvd2lsbE9wZW5EYXRhYmFzZS8ke25hbWV9YCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBJbmRleGVkREIuZG9PcGVuRGF0YWJhc2UobmFtZSwgdmVyc2lvbiwgc3RvcmVzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBNaXNzaW5nU3RvcmVzRXJyb3IpIHtcblx0XHRcdFx0Y29uc29sZS5pbmZvKGBBdHRlbXB0aW5nIHRvIHJlY3JlYXRlIHRoZSBJbmRleGVkREIgb25jZS5gLCBuYW1lKTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIFRyeSB0byBkZWxldGUgdGhlIGRiXG5cdFx0XHRcdFx0YXdhaXQgSW5kZXhlZERCLmRlbGV0ZURhdGFiYXNlKGVyci5kYik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcihgRXJyb3Igd2hpbGUgZGVsZXRpbmcgdGhlIEluZGV4ZWREQmAsIGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGF3YWl0IEluZGV4ZWREQi5kb09wZW5EYXRhYmFzZShuYW1lLCB2ZXJzaW9uLCBzdG9yZXMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1hcmsoYGNvZGUvZGlkT3BlbkRhdGFiYXNlLyR7bmFtZX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBkb09wZW5EYXRhYmFzZShuYW1lOiBzdHJpbmcsIHZlcnNpb246IG51bWJlciB8IHVuZGVmaW5lZCwgc3RvcmVzOiBzdHJpbmdbXSk6IFByb21pc2U8SURCRGF0YWJhc2U+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBpbmRleGVkREIub3BlbihuYW1lLCB2ZXJzaW9uKTtcblx0XHRcdHJlcXVlc3Qub25lcnJvciA9ICgpID0+IGUocmVxdWVzdC5lcnJvcik7XG5cdFx0XHRyZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGIgPSByZXF1ZXN0LnJlc3VsdDtcblx0XHRcdFx0Zm9yIChjb25zdCBzdG9yZSBvZiBzdG9yZXMpIHtcblx0XHRcdFx0XHRpZiAoIWRiLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoc3RvcmUpKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBFcnJvciB3aGlsZSBvcGVuaW5nIEluZGV4ZWREQi4gQ291bGQgbm90IGZpbmQgJyR7c3RvcmV9Jycgb2JqZWN0IHN0b3JlYCk7XG5cdFx0XHRcdFx0XHRlKG5ldyBNaXNzaW5nU3RvcmVzRXJyb3IoZGIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YyhkYik7XG5cdFx0XHR9O1xuXHRcdFx0cmVxdWVzdC5vbnVwZ3JhZGVuZWVkZWQgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRiID0gcmVxdWVzdC5yZXN1bHQ7XG5cdFx0XHRcdGZvciAoY29uc3Qgc3RvcmUgb2Ygc3RvcmVzKSB7XG5cdFx0XHRcdFx0aWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKHN0b3JlKSkge1xuXHRcdFx0XHRcdFx0ZGIuY3JlYXRlT2JqZWN0U3RvcmUoc3RvcmUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGRlbGV0ZURhdGFiYXNlKGRhdGFiYXNlOiBJREJEYXRhYmFzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoYywgZSkgPT4ge1xuXHRcdFx0Ly8gQ2xvc2UgYW55IG9wZW5lZCBjb25uZWN0aW9uc1xuXHRcdFx0ZGF0YWJhc2UuY2xvc2UoKTtcblxuXHRcdFx0Ly8gRGVsZXRlIHRoZSBkYlxuXHRcdFx0Y29uc3QgZGVsZXRlUmVxdWVzdCA9IGluZGV4ZWREQi5kZWxldGVEYXRhYmFzZShkYXRhYmFzZS5uYW1lKTtcblx0XHRcdGRlbGV0ZVJlcXVlc3Qub25lcnJvciA9IChlcnIpID0+IGUoZGVsZXRlUmVxdWVzdC5lcnJvcik7XG5cdFx0XHRkZWxldGVSZXF1ZXN0Lm9uc3VjY2VzcyA9ICgpID0+IGMoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZGF0YWJhc2U6IElEQkRhdGFiYXNlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgcGVuZGluZ1RyYW5zYWN0aW9uczogSURCVHJhbnNhY3Rpb25bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKGRhdGFiYXNlOiBJREJEYXRhYmFzZSwgcHJpdmF0ZSByZWFkb25seSBuYW1lOiBzdHJpbmcpIHtcblx0XHR0aGlzLmRhdGFiYXNlID0gZGF0YWJhc2U7XG5cdH1cblxuXHRoYXNQZW5kaW5nVHJhbnNhY3Rpb25zKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnBlbmRpbmdUcmFuc2FjdGlvbnMubGVuZ3RoID4gMDtcblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBlbmRpbmdUcmFuc2FjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdUcmFuc2FjdGlvbnMuc3BsaWNlKDAsIHRoaXMucGVuZGluZ1RyYW5zYWN0aW9ucy5sZW5ndGgpLmZvckVhY2godHJhbnNhY3Rpb24gPT4gdHJhbnNhY3Rpb24uYWJvcnQoKSk7XG5cdFx0fVxuXHRcdHRoaXMuZGF0YWJhc2U/LmNsb3NlKCk7XG5cdFx0dGhpcy5kYXRhYmFzZSA9IG51bGw7XG5cdH1cblxuXHRydW5JblRyYW5zYWN0aW9uPFQ+KHN0b3JlOiBzdHJpbmcsIHRyYW5zYWN0aW9uTW9kZTogSURCVHJhbnNhY3Rpb25Nb2RlLCBkYlJlcXVlc3RGbjogKHN0b3JlOiBJREJPYmplY3RTdG9yZSkgPT4gSURCUmVxdWVzdDxUPltdKTogUHJvbWlzZTxUW10+O1xuXHRydW5JblRyYW5zYWN0aW9uPFQ+KHN0b3JlOiBzdHJpbmcsIHRyYW5zYWN0aW9uTW9kZTogSURCVHJhbnNhY3Rpb25Nb2RlLCBkYlJlcXVlc3RGbjogKHN0b3JlOiBJREJPYmplY3RTdG9yZSkgPT4gSURCUmVxdWVzdDxUPik6IFByb21pc2U8VD47XG5cdGFzeW5jIHJ1bkluVHJhbnNhY3Rpb248VD4oc3RvcmU6IHN0cmluZywgdHJhbnNhY3Rpb25Nb2RlOiBJREJUcmFuc2FjdGlvbk1vZGUsIGRiUmVxdWVzdEZuOiAoc3RvcmU6IElEQk9iamVjdFN0b3JlKSA9PiBJREJSZXF1ZXN0PFQ+IHwgSURCUmVxdWVzdDxUPltdKTogUHJvbWlzZTxUIHwgVFtdPiB7XG5cdFx0aWYgKCF0aGlzLmRhdGFiYXNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgREJDbG9zZWRFcnJvcih0aGlzLm5hbWUpO1xuXHRcdH1cblx0XHRjb25zdCB0cmFuc2FjdGlvbiA9IHRoaXMuZGF0YWJhc2UudHJhbnNhY3Rpb24oc3RvcmUsIHRyYW5zYWN0aW9uTW9kZSk7XG5cdFx0dGhpcy5wZW5kaW5nVHJhbnNhY3Rpb25zLnB1c2godHJhbnNhY3Rpb24pO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxUIHwgVFtdPigoYywgZSkgPT4ge1xuXHRcdFx0dHJhbnNhY3Rpb24ub25jb21wbGV0ZSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocmVxdWVzdCkpIHtcblx0XHRcdFx0XHRjKHJlcXVlc3QubWFwKHIgPT4gci5yZXN1bHQpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjKHJlcXVlc3QucmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRyYW5zYWN0aW9uLm9uZXJyb3IgPSAoKSA9PiBlKHRyYW5zYWN0aW9uLmVycm9yID8gRXJyb3JOb1RlbGVtZXRyeS5mcm9tRXJyb3IodHJhbnNhY3Rpb24uZXJyb3IpIDogbmV3IEVycm9yTm9UZWxlbWV0cnkoJ3Vua25vd24gZXJyb3InKSk7XG5cdFx0XHR0cmFuc2FjdGlvbi5vbmFib3J0ID0gKCkgPT4gZSh0cmFuc2FjdGlvbi5lcnJvciA/IEVycm9yTm9UZWxlbWV0cnkuZnJvbUVycm9yKHRyYW5zYWN0aW9uLmVycm9yKSA6IG5ldyBFcnJvck5vVGVsZW1ldHJ5KCd1bmtub3duIGVycm9yJykpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGRiUmVxdWVzdEZuKHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHN0b3JlKSk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB0aGlzLnBlbmRpbmdUcmFuc2FjdGlvbnMuc3BsaWNlKHRoaXMucGVuZGluZ1RyYW5zYWN0aW9ucy5pbmRleE9mKHRyYW5zYWN0aW9uKSwgMSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF0b21pY2FsbHkgc3RvcmVzIGBuZXdWYWx1ZWAgd2hlbiB0aGUgY3VycmVudCB2YWxpZCB2YWx1ZSBzdHJpY3RseSBlcXVhbHMgYGV4cGVjdGVkVmFsdWVgLlxuXHQgKiBWYWx1ZXMgcmVqZWN0ZWQgYnkgYGlzVmFsaWRgIGFyZSB0cmVhdGVkIGFzIGB1bmRlZmluZWRgOyB0cmFuc2FjdGlvbiBmYWlsdXJlcyByZWplY3Qgd2l0aG91dCBjb21taXR0aW5nLlxuXHQgKi9cblx0YXN5bmMgY29tcGFyZUFuZFN3YXA8VD4oXG5cdFx0c3RvcmU6IHN0cmluZyxcblx0XHRrZXk6IElEQlZhbGlkS2V5LFxuXHRcdGV4cGVjdGVkVmFsdWU6IFQgfCB1bmRlZmluZWQsXG5cdFx0bmV3VmFsdWU6IFQsXG5cdFx0aXNWYWxpZDogKHZhbHVlOiB1bmtub3duKSA9PiB2YWx1ZSBpcyBULFxuXHQpOiBQcm9taXNlPHsgcmVhZG9ubHkgc3dhcHBlZDogYm9vbGVhbjsgcmVhZG9ubHkgY3VycmVudFZhbHVlOiBUIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRpZiAoIXRoaXMuZGF0YWJhc2UpIHtcblx0XHRcdHRocm93IG5ldyBEQkNsb3NlZEVycm9yKHRoaXMubmFtZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJhbnNhY3Rpb24gPSB0aGlzLmRhdGFiYXNlLnRyYW5zYWN0aW9uKHN0b3JlLCAncmVhZHdyaXRlJyk7XG5cdFx0dGhpcy5wZW5kaW5nVHJhbnNhY3Rpb25zLnB1c2godHJhbnNhY3Rpb24pO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx7IHJlYWRvbmx5IHN3YXBwZWQ6IGJvb2xlYW47IHJlYWRvbmx5IGN1cnJlbnRWYWx1ZTogVCB8IHVuZGVmaW5lZCB9PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRsZXQgY3VycmVudFZhbHVlOiBUIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHN3YXBwZWQgPSBmYWxzZTtcblxuXHRcdFx0dHJhbnNhY3Rpb24ub25jb21wbGV0ZSA9ICgpID0+IHJlc29sdmUoe1xuXHRcdFx0XHRzd2FwcGVkLFxuXHRcdFx0XHRjdXJyZW50VmFsdWU6IHN3YXBwZWQgPyBuZXdWYWx1ZSA6IGN1cnJlbnRWYWx1ZSxcblx0XHRcdH0pO1xuXHRcdFx0dHJhbnNhY3Rpb24ub25lcnJvciA9ICgpID0+IHJlamVjdCh0cmFuc2FjdGlvbi5lcnJvciA/IEVycm9yTm9UZWxlbWV0cnkuZnJvbUVycm9yKHRyYW5zYWN0aW9uLmVycm9yKSA6IG5ldyBFcnJvck5vVGVsZW1ldHJ5KCd1bmtub3duIGVycm9yJykpO1xuXHRcdFx0dHJhbnNhY3Rpb24ub25hYm9ydCA9ICgpID0+IHJlamVjdCh0cmFuc2FjdGlvbi5lcnJvciA/IEVycm9yTm9UZWxlbWV0cnkuZnJvbUVycm9yKHRyYW5zYWN0aW9uLmVycm9yKSA6IG5ldyBFcnJvck5vVGVsZW1ldHJ5KCd1bmtub3duIGVycm9yJykpO1xuXG5cdFx0XHRjb25zdCBvYmplY3RTdG9yZSA9IHRyYW5zYWN0aW9uLm9iamVjdFN0b3JlKHN0b3JlKTtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBvYmplY3RTdG9yZS5nZXQoa2V5KTtcblx0XHRcdHJlcXVlc3Qub25zdWNjZXNzID0gKCkgPT4ge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUgPSBpc1ZhbGlkKHJlcXVlc3QucmVzdWx0KSA/IHJlcXVlc3QucmVzdWx0IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID09PSBleHBlY3RlZFZhbHVlKSB7XG5cdFx0XHRcdFx0c3dhcHBlZCA9IHRydWU7XG5cdFx0XHRcdFx0b2JqZWN0U3RvcmUucHV0KG5ld1ZhbHVlLCBrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4gdGhpcy5wZW5kaW5nVHJhbnNhY3Rpb25zLnNwbGljZSh0aGlzLnBlbmRpbmdUcmFuc2FjdGlvbnMuaW5kZXhPZih0cmFuc2FjdGlvbiksIDEpKTtcblx0fVxuXG5cdGFzeW5jIGdldEtleVZhbHVlczxWPihzdG9yZTogc3RyaW5nLCBpc1ZhbGlkOiAodmFsdWU6IHVua25vd24pID0+IHZhbHVlIGlzIFYpOiBQcm9taXNlPE1hcDxzdHJpbmcsIFY+PiB7XG5cdFx0aWYgKCF0aGlzLmRhdGFiYXNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgREJDbG9zZWRFcnJvcih0aGlzLm5hbWUpO1xuXHRcdH1cblx0XHRjb25zdCB0cmFuc2FjdGlvbiA9IHRoaXMuZGF0YWJhc2UudHJhbnNhY3Rpb24oc3RvcmUsICdyZWFkb25seScpO1xuXHRcdHRoaXMucGVuZGluZ1RyYW5zYWN0aW9ucy5wdXNoKHRyYW5zYWN0aW9uKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8TWFwPHN0cmluZywgVj4+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBuZXcgTWFwPHN0cmluZywgVj4oKTtcblxuXHRcdFx0Y29uc3Qgb2JqZWN0U3RvcmUgPSB0cmFuc2FjdGlvbi5vYmplY3RTdG9yZShzdG9yZSk7XG5cblx0XHRcdC8vIE9wZW4gYSBJbmRleGVkREIgQ3Vyc29yIHRvIGl0ZXJhdGUgb3ZlciBrZXkvdmFsdWVzXG5cdFx0XHRjb25zdCBjdXJzb3IgPSBvYmplY3RTdG9yZS5vcGVuQ3Vyc29yKCk7XG5cdFx0XHRpZiAoIWN1cnNvcikge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShpdGVtcyk7IC8vIHRoaXMgbWVhbnMgdGhlIGBJdGVtVGFibGVgIHdhcyBlbXB0eVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJdGVyYXRlIG92ZXIgcm93cyBvZiBgSXRlbVRhYmxlYCB1bnRpbCB0aGUgZW5kXG5cdFx0XHRjdXJzb3Iub25zdWNjZXNzID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoY3Vyc29yLnJlc3VsdCkge1xuXG5cdFx0XHRcdFx0Ly8gS2VlcCBjdXJzb3Iga2V5L3ZhbHVlIGluIG91ciBtYXBcblx0XHRcdFx0XHRpZiAoaXNWYWxpZChjdXJzb3IucmVzdWx0LnZhbHVlKSkge1xuXHRcdFx0XHRcdFx0aXRlbXMuc2V0KGN1cnNvci5yZXN1bHQua2V5LnRvU3RyaW5nKCksIGN1cnNvci5yZXN1bHQudmFsdWUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEFkdmFuY2UgY3Vyc29yIHRvIG5leHQgcm93XG5cdFx0XHRcdFx0Y3Vyc29yLnJlc3VsdC5jb250aW51ZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUoaXRlbXMpOyAvLyByZWFjaGVkIGVuZCBvZiB0YWJsZVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBFcnJvciBoYW5kbGVyc1xuXHRcdFx0Y29uc3Qgb25FcnJvciA9IChlcnJvcjogRXJyb3IgfCBudWxsKSA9PiB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYEluZGV4ZWREQiBnZXRLZXlWYWx1ZXMoKTogJHt0b0Vycm9yTWVzc2FnZShlcnJvciwgdHJ1ZSl9YCk7XG5cblx0XHRcdFx0cmVzb2x2ZShpdGVtcyk7XG5cdFx0XHR9O1xuXHRcdFx0Y3Vyc29yLm9uZXJyb3IgPSAoKSA9PiBvbkVycm9yKGN1cnNvci5lcnJvcik7XG5cdFx0XHR0cmFuc2FjdGlvbi5vbmVycm9yID0gKCkgPT4gb25FcnJvcih0cmFuc2FjdGlvbi5lcnJvcik7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB0aGlzLnBlbmRpbmdUcmFuc2FjdGlvbnMuc3BsaWNlKHRoaXMucGVuZGluZ1RyYW5zYWN0aW9ucy5pbmRleE9mKHRyYW5zYWN0aW9uKSwgMSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQix1QkFBdUI7QUFDbEQsU0FBUyxZQUFZO0FBRXJCLE1BQU0sMkJBQTJCLE1BQU07QUFBQSxFQUN0QyxZQUFxQixJQUFpQjtBQUNyQyxVQUFNLGdCQUFnQjtBQURGO0FBQUEsRUFFckI7QUFDRDtBQUVPLE1BQU0sc0JBQXNCLE1BQU07QUFBQSxFQUV4QyxZQUFZLFFBQWdCO0FBQzNCLFVBQU0sdUJBQXVCLE1BQU0sY0FBYztBQUZsRCxTQUFTLE9BQU87QUFBQSxFQUdoQjtBQUNEO0FBRU8sTUFBTSxVQUFVO0FBQUEsRUF5RXRCLFlBQVksVUFBd0MsTUFBYztBQUFkO0FBSHBELFNBQVEsV0FBK0I7QUFDdkMsU0FBaUIsc0JBQXdDLENBQUM7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
