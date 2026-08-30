var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { ReferenceCollection } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { Emitter } from "../../../base/common/event.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { AgentSession } from "../common/agent.js";
import { SESSION_DB_FILENAME } from "../common/sessionDataService.js";
import { SessionDatabase } from "./sessionDatabase.js";
class SessionDatabaseCollection extends ReferenceCollection {
  constructor(_getDbPath, _logService) {
    super();
    this._getDbPath = _getDbPath;
    this._logService = _logService;
    /**
     * The set of currently-open databases. Mirrors what's held by the
     * underlying ref-counted map, but exposed so {@link SessionDataService.whenIdle}
     * can iterate without reaching into private state.
     */
    this.liveDatabases = /* @__PURE__ */ new Set();
  }
  createReferencedObject(key) {
    const dbPath = this._getDbPath(key);
    this._logService.trace(`[SessionDataService] Opening database: ${dbPath}`);
    const db = new SessionDatabase(dbPath);
    this.liveDatabases.add(db);
    return db;
  }
  destroyReferencedObject(_key, object) {
    this.liveDatabases.delete(object);
    object.dispose();
  }
}
let SessionDataService = class {
  constructor(userDataPath, _fileService, _logService, getDbPath) {
    this._fileService = _fileService;
    this._logService = _logService;
    this._onWillDeleteSessionData = new Emitter();
    this._basePath = URI.joinPath(userDataPath, "agentSessionData");
    this._databases = new SessionDatabaseCollection(
      getDbPath ?? ((key) => URI.joinPath(this._basePath, key, SESSION_DB_FILENAME).fsPath),
      this._logService
    );
  }
  get onWillDeleteSessionData() {
    return this._onWillDeleteSessionData.event;
  }
  getSessionDataDir(session) {
    return URI.joinPath(this._basePath, this._sanitizedSessionKey(session));
  }
  getSessionDataDirById(sessionId) {
    const sanitized = sessionId.replace(/[^a-zA-Z0-9_.-]/g, "-");
    return URI.joinPath(this._basePath, sanitized);
  }
  _sanitizedSessionKey(session) {
    return this._dataKey(session).replace(/[^a-zA-Z0-9_.-]/g, "-");
  }
  /**
   * Derives the per-URI storage key. Chat channel URIs
   * (`ahp-chat://<chatId>/<base64(session)>`) carry the chat id in the
   * authority while encoding the SAME owning-session URI in the path, so
   * keying only by the path (via {@link AgentSession.id}) would collapse
   * every peer chat of a session onto one data directory and database.
   * Prefixing with the authority gives each chat its own storage while
   * leaving plain session URIs (no authority) unchanged.
   */
  _dataKey(uri) {
    const id = AgentSession.id(uri);
    return uri.authority ? `${uri.authority}-${id}` : id;
  }
  openDatabase(session) {
    return this._databases.acquire(this._sanitizedSessionKey(session));
  }
  async tryOpenDatabase(session) {
    const key = this._sanitizedSessionKey(session);
    const dbPath = URI.joinPath(this._basePath, key, SESSION_DB_FILENAME);
    if (!await this._fileService.exists(dbPath)) {
      return void 0;
    }
    return this._databases.acquire(key);
  }
  async deleteSessionData(session, workingDirectories) {
    const dir = this.getSessionDataDir(session);
    const pending = [];
    try {
      this._onWillDeleteSessionData.fire({
        session,
        workingDirectories,
        waitUntil: (p) => {
          pending.push(p);
        }
      });
    } catch (err) {
      this._logService.warn(`[SessionDataService] onWillDeleteSessionData listener threw synchronously: ${dir.toString()}`, err);
    }
    if (pending.length > 0) {
      const results = await Promise.allSettled(pending);
      for (const r of results) {
        if (r.status === "rejected") {
          this._logService.warn(`[SessionDataService] onWillDeleteSessionData waitUntil rejected: ${dir.toString()}`, r.reason);
        }
      }
    }
    try {
      if (await this._fileService.exists(dir)) {
        await this._fileService.del(dir, { recursive: true });
        this._logService.trace(`[SessionDataService] Deleted session data: ${dir.toString()}`);
      }
    } catch (err) {
      this._logService.warn(`[SessionDataService] Failed to delete session data: ${dir.toString()}`, err);
    }
  }
  async cleanupOrphanedData(knownSessionIds) {
    try {
      const exists = await this._fileService.exists(this._basePath);
      if (!exists) {
        return;
      }
      const stat = await this._fileService.resolve(this._basePath);
      if (!stat.children) {
        return;
      }
      const deletions = [];
      for (const child of stat.children) {
        if (!child.isDirectory) {
          continue;
        }
        const name = child.name;
        if (!knownSessionIds.has(name)) {
          this._logService.trace(`[SessionDataService] Cleaning up orphaned session data: ${name}`);
          deletions.push(
            this._fileService.del(child.resource, { recursive: true }).catch((err) => {
              this._logService.warn(`[SessionDataService] Failed to clean up orphaned data: ${name}`, err);
            })
          );
        }
      }
      await Promise.all(deletions);
    } catch (err) {
      this._logService.warn("[SessionDataService] Failed to run orphan cleanup", err);
    }
  }
  async whenIdle() {
    while (true) {
      const dbs = [...this._databases.liveDatabases];
      if (dbs.length === 0) {
        return;
      }
      await Promise.all(dbs.map((db) => db.whenIdle()));
      const newOnes = [...this._databases.liveDatabases].filter((db) => !dbs.includes(db));
      if (newOnes.length === 0) {
        return;
      }
    }
  }
};
SessionDataService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService)
], SessionDataService);
export {
  SessionDataService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzZXNzaW9uRGF0YVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJUmVmZXJlbmNlLCBSZWZlcmVuY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFiYXNlLCBJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBJV2lsbERlbGV0ZVNlc3Npb25EYXRhRXZlbnQsIFNFU1NJT05fREJfRklMRU5BTUUgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4vc2Vzc2lvbkRhdGFiYXNlLmpzJztcblxuY2xhc3MgU2Vzc2lvbkRhdGFiYXNlQ29sbGVjdGlvbiBleHRlbmRzIFJlZmVyZW5jZUNvbGxlY3Rpb248SVNlc3Npb25EYXRhYmFzZT4ge1xuXG5cdC8qKlxuXHQgKiBUaGUgc2V0IG9mIGN1cnJlbnRseS1vcGVuIGRhdGFiYXNlcy4gTWlycm9ycyB3aGF0J3MgaGVsZCBieSB0aGVcblx0ICogdW5kZXJseWluZyByZWYtY291bnRlZCBtYXAsIGJ1dCBleHBvc2VkIHNvIHtAbGluayBTZXNzaW9uRGF0YVNlcnZpY2Uud2hlbklkbGV9XG5cdCAqIGNhbiBpdGVyYXRlIHdpdGhvdXQgcmVhY2hpbmcgaW50byBwcml2YXRlIHN0YXRlLlxuXHQgKi9cblx0cmVhZG9ubHkgbGl2ZURhdGFiYXNlcyA9IG5ldyBTZXQ8SVNlc3Npb25EYXRhYmFzZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXREYlBhdGg6IChrZXk6IHN0cmluZykgPT4gc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVJlZmVyZW5jZWRPYmplY3Qoa2V5OiBzdHJpbmcpOiBJU2Vzc2lvbkRhdGFiYXNlIHtcblx0XHRjb25zdCBkYlBhdGggPSB0aGlzLl9nZXREYlBhdGgoa2V5KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvbkRhdGFTZXJ2aWNlXSBPcGVuaW5nIGRhdGFiYXNlOiAke2RiUGF0aH1gKTtcblx0XHRjb25zdCBkYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoZGJQYXRoKTtcblx0XHR0aGlzLmxpdmVEYXRhYmFzZXMuYWRkKGRiKTtcblx0XHRyZXR1cm4gZGI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZGVzdHJveVJlZmVyZW5jZWRPYmplY3QoX2tleTogc3RyaW5nLCBvYmplY3Q6IElTZXNzaW9uRGF0YWJhc2UpOiB2b2lkIHtcblx0XHR0aGlzLmxpdmVEYXRhYmFzZXMuZGVsZXRlKG9iamVjdCk7XG5cdFx0b2JqZWN0LmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIHtAbGluayBJU2Vzc2lvbkRhdGFTZXJ2aWNlfSB0aGF0IHN0b3JlcyBwZXItc2Vzc2lvbiBkYXRhXG4gKiB1bmRlciBge3VzZXJEYXRhUGF0aH0vYWdlbnRTZXNzaW9uRGF0YS97c2Vzc2lvbklkfS9gLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbkRhdGFTZXJ2aWNlIGltcGxlbWVudHMgSVNlc3Npb25EYXRhU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jhc2VQYXRoOiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGFiYXNlczogU2Vzc2lvbkRhdGFiYXNlQ29sbGVjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRGVsZXRlU2Vzc2lvbkRhdGEgPSBuZXcgRW1pdHRlcjxJV2lsbERlbGV0ZVNlc3Npb25EYXRhRXZlbnQ+KCk7XG5cblx0Z2V0IG9uV2lsbERlbGV0ZVNlc3Npb25EYXRhKCk6IEV2ZW50PElXaWxsRGVsZXRlU2Vzc2lvbkRhdGFFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbldpbGxEZWxldGVTZXNzaW9uRGF0YS5ldmVudDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXJEYXRhUGF0aDogVVJJLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0Z2V0RGJQYXRoPzogKGtleTogc3RyaW5nKSA9PiBzdHJpbmcsIC8vIGZvciB0ZXN0aW5nXG5cdCkge1xuXHRcdHRoaXMuX2Jhc2VQYXRoID0gVVJJLmpvaW5QYXRoKHVzZXJEYXRhUGF0aCwgJ2FnZW50U2Vzc2lvbkRhdGEnKTtcblx0XHR0aGlzLl9kYXRhYmFzZXMgPSBuZXcgU2Vzc2lvbkRhdGFiYXNlQ29sbGVjdGlvbihcblx0XHRcdGdldERiUGF0aCA/PyAoa2V5ID0+IFVSSS5qb2luUGF0aCh0aGlzLl9iYXNlUGF0aCwga2V5LCBTRVNTSU9OX0RCX0ZJTEVOQU1FKS5mc1BhdGgpLFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHQpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbkRhdGFEaXIoc2Vzc2lvbjogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmpvaW5QYXRoKHRoaXMuX2Jhc2VQYXRoLCB0aGlzLl9zYW5pdGl6ZWRTZXNzaW9uS2V5KHNlc3Npb24pKTtcblx0fVxuXG5cdGdldFNlc3Npb25EYXRhRGlyQnlJZChzZXNzaW9uSWQ6IHN0cmluZyk6IFVSSSB7XG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gc2Vzc2lvbklkLnJlcGxhY2UoL1teYS16QS1aMC05Xy4tXS9nLCAnLScpO1xuXHRcdHJldHVybiBVUkkuam9pblBhdGgodGhpcy5fYmFzZVBhdGgsIHNhbml0aXplZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYW5pdGl6ZWRTZXNzaW9uS2V5KHNlc3Npb246IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGFLZXkoc2Vzc2lvbikucmVwbGFjZSgvW15hLXpBLVowLTlfLi1dL2csICctJyk7XG5cdH1cblxuXHQvKipcblx0ICogRGVyaXZlcyB0aGUgcGVyLVVSSSBzdG9yYWdlIGtleS4gQ2hhdCBjaGFubmVsIFVSSXNcblx0ICogKGBhaHAtY2hhdDovLzxjaGF0SWQ+LzxiYXNlNjQoc2Vzc2lvbik+YCkgY2FycnkgdGhlIGNoYXQgaWQgaW4gdGhlXG5cdCAqIGF1dGhvcml0eSB3aGlsZSBlbmNvZGluZyB0aGUgU0FNRSBvd25pbmctc2Vzc2lvbiBVUkkgaW4gdGhlIHBhdGgsIHNvXG5cdCAqIGtleWluZyBvbmx5IGJ5IHRoZSBwYXRoICh2aWEge0BsaW5rIEFnZW50U2Vzc2lvbi5pZH0pIHdvdWxkIGNvbGxhcHNlXG5cdCAqIGV2ZXJ5IHBlZXIgY2hhdCBvZiBhIHNlc3Npb24gb250byBvbmUgZGF0YSBkaXJlY3RvcnkgYW5kIGRhdGFiYXNlLlxuXHQgKiBQcmVmaXhpbmcgd2l0aCB0aGUgYXV0aG9yaXR5IGdpdmVzIGVhY2ggY2hhdCBpdHMgb3duIHN0b3JhZ2Ugd2hpbGVcblx0ICogbGVhdmluZyBwbGFpbiBzZXNzaW9uIFVSSXMgKG5vIGF1dGhvcml0eSkgdW5jaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGF0YUtleSh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaWQgPSBBZ2VudFNlc3Npb24uaWQodXJpKTtcblx0XHRyZXR1cm4gdXJpLmF1dGhvcml0eSA/IGAke3VyaS5hdXRob3JpdHl9LSR7aWR9YCA6IGlkO1xuXHR9XG5cblx0b3BlbkRhdGFiYXNlKHNlc3Npb246IFVSSSk6IElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4ge1xuXHRcdHJldHVybiB0aGlzLl9kYXRhYmFzZXMuYWNxdWlyZSh0aGlzLl9zYW5pdGl6ZWRTZXNzaW9uS2V5KHNlc3Npb24pKTtcblx0fVxuXG5cdGFzeW5jIHRyeU9wZW5EYXRhYmFzZShzZXNzaW9uOiBVUkkpOiBQcm9taXNlPElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9zYW5pdGl6ZWRTZXNzaW9uS2V5KHNlc3Npb24pO1xuXHRcdGNvbnN0IGRiUGF0aCA9IFVSSS5qb2luUGF0aCh0aGlzLl9iYXNlUGF0aCwga2V5LCBTRVNTSU9OX0RCX0ZJTEVOQU1FKTtcblx0XHRpZiAoIWF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhkYlBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGF0YWJhc2VzLmFjcXVpcmUoa2V5KTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVNlc3Npb25EYXRhKHNlc3Npb246IFVSSSwgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaXIgPSB0aGlzLmdldFNlc3Npb25EYXRhRGlyKHNlc3Npb24pO1xuXHRcdC8vIEZpcmUgdGhlIHdpbGwtZGVsZXRlIGV2ZW50IGZpcnN0IHNvIHN1YnNjcmliZXJzIChub3RhYmx5IHRoZVxuXHRcdC8vIGNoZWNrcG9pbnQgc2VydmljZSkgY2FuIHBlcmZvcm0gYXN5bmMgY2xlYW51cCB0aGF0IG5lZWRzIHRoZVxuXHRcdC8vIGRhdGFiYXNlIHRvIHN0aWxsIGJlIHJlYWRhYmxlLiBgd2FpdFVudGlsYCBjb2xsZWN0cyBlYWNoXG5cdFx0Ly8gc3Vic2NyaWJlcidzIHByb21pc2U7IHdlIGF3YWl0IHRoZW0gYWxsIGJlZm9yZSB0b3VjaGluZyBkaXNrLlxuXHRcdGNvbnN0IHBlbmRpbmc6IFByb21pc2U8dW5rbm93bj5bXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vbldpbGxEZWxldGVTZXNzaW9uRGF0YS5maXJlKHtcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHR3YWl0VW50aWw6IHAgPT4geyBwZW5kaW5nLnB1c2gocCk7IH0sXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Nlc3Npb25EYXRhU2VydmljZV0gb25XaWxsRGVsZXRlU2Vzc2lvbkRhdGEgbGlzdGVuZXIgdGhyZXcgc3luY2hyb25vdXNseTogJHtkaXIudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdH1cblx0XHRpZiAocGVuZGluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHBlbmRpbmcpO1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIHJlc3VsdHMpIHtcblx0XHRcdFx0aWYgKHIuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbU2Vzc2lvbkRhdGFTZXJ2aWNlXSBvbldpbGxEZWxldGVTZXNzaW9uRGF0YSB3YWl0VW50aWwgcmVqZWN0ZWQ6ICR7ZGlyLnRvU3RyaW5nKCl9YCwgci5yZWFzb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKGRpcikpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uRGF0YVNlcnZpY2VdIERlbGV0ZWQgc2Vzc2lvbiBkYXRhOiAke2Rpci50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbU2Vzc2lvbkRhdGFTZXJ2aWNlXSBGYWlsZWQgdG8gZGVsZXRlIHNlc3Npb24gZGF0YTogJHtkaXIudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNsZWFudXBPcnBoYW5lZERhdGEoa25vd25TZXNzaW9uSWRzOiBTZXQ8c3RyaW5nPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHModGhpcy5fYmFzZVBhdGgpO1xuXHRcdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZSh0aGlzLl9iYXNlUGF0aCk7XG5cdFx0XHRpZiAoIXN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWxldGlvbnM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmICghY2hpbGQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuYW1lID0gY2hpbGQubmFtZTtcblx0XHRcdFx0aWYgKCFrbm93blNlc3Npb25JZHMuaGFzKG5hbWUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25EYXRhU2VydmljZV0gQ2xlYW5pbmcgdXAgb3JwaGFuZWQgc2Vzc2lvbiBkYXRhOiAke25hbWV9YCk7XG5cdFx0XHRcdFx0ZGVsZXRpb25zLnB1c2goXG5cdFx0XHRcdFx0XHR0aGlzLl9maWxlU2VydmljZS5kZWwoY2hpbGQucmVzb3VyY2UsIHsgcmVjdXJzaXZlOiB0cnVlIH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Nlc3Npb25EYXRhU2VydmljZV0gRmFpbGVkIHRvIGNsZWFuIHVwIG9ycGhhbmVkIGRhdGE6ICR7bmFtZX1gLCBlcnIpO1xuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGRlbGV0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tTZXNzaW9uRGF0YVNlcnZpY2VdIEZhaWxlZCB0byBydW4gb3JwaGFuIGNsZWFudXAnLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHdoZW5JZGxlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEVhY2ggYFNlc3Npb25EYXRhYmFzZS53aGVuSWRsZSgpYCBhbHJlYWR5IGxvb3BzIGludGVybmFsbHkgdW50aWxcblx0XHQvLyB0aGF0IERCIGlzIHF1aWVzY2VudCwgc28gdGhlIG91dGVyIGxvb3Agb25seSBuZWVkcyB0byBoYW5kbGUgdGhlXG5cdFx0Ly8gY2FzZSB3aGVyZSBhIG5ldyBEQiB3YXMgb3BlbmVkIChhbmQgd3JpdGVzIHF1ZXVlZCBhZ2FpbnN0IGl0KVxuXHRcdC8vIHdoaWxlIHdlIHdlcmUgYXdhaXRpbmcgYW4gZWFybGllciBwYXNzLlxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBkYnMgPSBbLi4udGhpcy5fZGF0YWJhc2VzLmxpdmVEYXRhYmFzZXNdO1xuXHRcdFx0aWYgKGRicy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZGJzLm1hcChkYiA9PiBkYi53aGVuSWRsZSgpKSk7XG5cdFx0XHRjb25zdCBuZXdPbmVzID0gWy4uLnRoaXMuX2RhdGFiYXNlcy5saXZlRGF0YWJhc2VzXS5maWx0ZXIoZGIgPT4gIWRicy5pbmNsdWRlcyhkYikpO1xuXHRcdFx0aWYgKG5ld09uZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBcUIsMkJBQTJCO0FBQ2hELFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTZFLDJCQUEyQjtBQUN4RyxTQUFTLHVCQUF1QjtB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
