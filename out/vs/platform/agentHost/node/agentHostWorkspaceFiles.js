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
import * as cp from "child_process";
import { Limiter } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import { rgDiskPath } from "../../../base/node/ripgrep.js";
const MAX_FILES = 5e4;
const CACHE_TTL_MS = 3e4;
const MAX_CONCURRENT_ENUMERATIONS = 4;
const enumerationLimiter = new Limiter(MAX_CONCURRENT_ENUMERATIONS);
let AgentHostWorkspaceFiles = class extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._cache = /* @__PURE__ */ new Map();
    /** Active ripgrep child processes, killed on dispose. */
    this._activeChildren = /* @__PURE__ */ new Set();
    this._isDisposed = false;
  }
  dispose() {
    this._isDisposed = true;
    for (const child of this._activeChildren) {
      try {
        child.kill();
      } catch {
      }
    }
    this._activeChildren.clear();
    this._cache.clear();
    super.dispose();
  }
  /**
   * Return the list of files under `workingDirectory`. Concurrent calls
   * with the same working directory share an in-flight enumeration.
   *
   * Only `file://` URIs are supported. Other schemes return an empty list.
   */
  async getFiles(workingDirectory, token) {
    if (workingDirectory.scheme !== Schemas.file) {
      return { files: [], isTruncated: false };
    }
    const key = workingDirectory.toString();
    const now = Date.now();
    const existing = this._cache.get(key);
    let shared;
    if (existing && (existing.expiresAt === void 0 || existing.expiresAt > now)) {
      shared = existing.promise;
    } else {
      shared = enumerationLimiter.queue(() => this._isDisposed ? Promise.resolve({ files: [], isTruncated: false }) : this._enumerate(workingDirectory));
      const entry = { promise: shared };
      this._cache.set(key, entry);
      shared.then(() => {
        if (this._cache.get(key) === entry) {
          entry.expiresAt = Date.now() + CACHE_TTL_MS;
        }
      }, () => {
        if (this._cache.get(key) === entry) {
          this._cache.delete(key);
        }
      });
    }
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (token === CancellationToken.None) {
      return shared;
    }
    return new Promise((resolve, reject) => {
      const cancelListener = token.onCancellationRequested(() => {
        cancelListener.dispose();
        reject(new CancellationError());
      });
      shared.then((value) => {
        cancelListener.dispose();
        resolve(value);
      }, (err) => {
        cancelListener.dispose();
        reject(err);
      });
    });
  }
  async _enumerate(workingDirectory) {
    const resolvedRgDiskPath = await rgDiskPath();
    return new Promise((resolve, reject) => {
      const cwd = workingDirectory.fsPath;
      const args = ["--files", "--hidden", "--no-require-git", "--follow", "--no-config", "--glob", "!.git"];
      let child;
      try {
        child = cp.spawn(resolvedRgDiskPath, args, { cwd });
      } catch (err) {
        this._logService.warn(`[AgentHostWorkspaceFiles] Failed to spawn ripgrep: ${err}`);
        reject(err);
        return;
      }
      this._activeChildren.add(child);
      const results = [];
      let buffer = "";
      let limitHit = false;
      let settled = false;
      const finish = (files, error) => {
        if (settled) {
          return;
        }
        settled = true;
        this._activeChildren.delete(child);
        if (error) {
          reject(error);
        } else {
          resolve({ files, isTruncated: limitHit });
        }
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (limitHit) {
          return;
        }
        buffer += chunk;
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) {
            continue;
          }
          results.push(URI.joinPath(workingDirectory, line));
          if (results.length >= MAX_FILES) {
            limitHit = true;
            this._logService.trace(`[AgentHostWorkspaceFiles] File limit reached while enumerating ${workingDirectory.toString()}`);
            try {
              child.kill();
            } catch {
            }
            break;
          }
        }
      });
      child.stderr.setEncoding("utf8");
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (err) => {
        if (this._isDisposed) {
          finish([]);
          return;
        }
        this._logService.warn(`[AgentHostWorkspaceFiles] ripgrep error: ${err}`);
        finish([], err);
      });
      child.on("close", (code) => {
        if (this._isDisposed) {
          finish([]);
          return;
        }
        if (!limitHit && buffer.length > 0) {
          const line = buffer.replace(/\r$/, "");
          if (line) {
            results.push(URI.joinPath(workingDirectory, line));
          }
          buffer = "";
        }
        if (stderr) {
          this._logService.trace(`[AgentHostWorkspaceFiles] ripgrep stderr: ${stderr}`);
        }
        if (!limitHit && code !== 0 && code !== 1) {
          const error = new Error(`ripgrep exited with code ${code ?? "unknown"} while enumerating ${workingDirectory.toString()}`);
          this._logService.warn(`[AgentHostWorkspaceFiles] ${error.message}`);
          finish([], error);
          return;
        }
        finish(results);
      });
    });
  }
};
AgentHostWorkspaceFiles = __decorateClass([
  __decorateParam(0, ILogService)
], AgentHostWorkspaceFiles);
export {
  AgentHostWorkspaceFiles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGNwIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgTGltaXRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgcmdEaXNrUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9yaXBncmVwLmpzJztcblxuLyoqIE1heGltdW0gbnVtYmVyIG9mIGZpbGVzIGNhY2hlZCBwZXIgd29ya2luZyBkaXJlY3RvcnkuICovXG5jb25zdCBNQVhfRklMRVMgPSA1MF8wMDA7XG5cbi8qKiBUVEwgZm9yIGEgY2FjaGVkIGZpbGUgbGlzdCBiZWZvcmUgd2UgcmUtZW51bWVyYXRlLiAqL1xuY29uc3QgQ0FDSEVfVFRMX01TID0gMzBfMDAwO1xuXG4vKiogTWF4aW11bSBudW1iZXIgb2YgY29uY3VycmVudCByaXBncmVwIGVudW1lcmF0aW9ucyBhY3Jvc3MgYWxsIGNhbGxlcnMuICovXG5jb25zdCBNQVhfQ09OQ1VSUkVOVF9FTlVNRVJBVElPTlMgPSA0O1xuXG5jb25zdCBlbnVtZXJhdGlvbkxpbWl0ZXIgPSBuZXcgTGltaXRlcjxJQWdlbnRIb3N0V29ya3NwYWNlRmlsZXNSZXN1bHQ+KE1BWF9DT05DVVJSRU5UX0VOVU1FUkFUSU9OUyk7XG5cbmludGVyZmFjZSBJQ2FjaGVFbnRyeSB7XG5cdHJlYWRvbmx5IHByb21pc2U6IFByb21pc2U8SUFnZW50SG9zdFdvcmtzcGFjZUZpbGVzUmVzdWx0Pjtcblx0ZXhwaXJlc0F0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlc1Jlc3VsdCB7XG5cdHJlYWRvbmx5IGZpbGVzOiByZWFkb25seSBVUklbXTtcblx0cmVhZG9ubHkgaXNUcnVuY2F0ZWQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogRW51bWVyYXRlcyBmaWxlcyB1bmRlciBhIHdvcmtpbmcgZGlyZWN0b3J5IHVzaW5nIHJpcGdyZXAsIHdpdGggcmVzdWx0c1xuICogY2FjaGVkIHBlciB3b3JraW5nIGRpcmVjdG9yeSBmb3IgYSBzaG9ydCBUVEwuXG4gKlxuICogTWlycm9ycyB0aGUgd29ya2JlbmNoJ3MgZmlsZS1zZWFyY2ggaW52b2NhdGlvbiBwYXR0ZXJuIChzZWVcbiAqIGByaXBncmVwRmlsZVNlYXJjaC50c2AgaW4gYHZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvbm9kZS9gKSBidXQgZG9lc1xuICogbm90IGRlcGVuZCBvbiB0aGUgd29ya2JlbmNoIGxheWVyIFx1MjAxNCB0aGUgYWdlbnQgaG9zdCBydW5zIGluIGEgc2VwYXJhdGVcbiAqIG5vZGUgcHJvY2VzcyB0aGF0IG1heSBub3QgaW1wb3J0IGZyb20gYHZzL3dvcmtiZW5jaC9gLlxuICpcbiAqIEZpbGVzIGFyZSByZXR1cm5lZCBhcyBhYnNvbHV0ZSB7QGxpbmsgVVJJfXMgcmVsYXRpdmUgdG8gdGhlIHdvcmtpbmdcbiAqIGRpcmVjdG9yeS4gYC5naXRpZ25vcmVgIGFuZCBvdGhlciBgLmlnbm9yZWAgZmlsZXMgYXJlIGhvbm91cmVkIGJ5XG4gKiByaXBncmVwLiBTeW1saW5rcyBhcmUgZm9sbG93ZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIElDYWNoZUVudHJ5PigpO1xuXHQvKiogQWN0aXZlIHJpcGdyZXAgY2hpbGQgcHJvY2Vzc2VzLCBraWxsZWQgb24gZGlzcG9zZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2hpbGRyZW4gPSBuZXcgU2V0PGNwLkNoaWxkUHJvY2Vzc1dpdGhvdXROdWxsU3RyZWFtcz4oKTtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLl9hY3RpdmVDaGlsZHJlbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2hpbGQua2lsbCgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVDaGlsZHJlbi5jbGVhcigpO1xuXHRcdHRoaXMuX2NhY2hlLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgbGlzdCBvZiBmaWxlcyB1bmRlciBgd29ya2luZ0RpcmVjdG9yeWAuIENvbmN1cnJlbnQgY2FsbHNcblx0ICogd2l0aCB0aGUgc2FtZSB3b3JraW5nIGRpcmVjdG9yeSBzaGFyZSBhbiBpbi1mbGlnaHQgZW51bWVyYXRpb24uXG5cdCAqXG5cdCAqIE9ubHkgYGZpbGU6Ly9gIFVSSXMgYXJlIHN1cHBvcnRlZC4gT3RoZXIgc2NoZW1lcyByZXR1cm4gYW4gZW1wdHkgbGlzdC5cblx0ICovXG5cdGFzeW5jIGdldEZpbGVzKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWdlbnRIb3N0V29ya3NwYWNlRmlsZXNSZXN1bHQ+IHtcblx0XHRpZiAod29ya2luZ0RpcmVjdG9yeS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0cmV0dXJuIHsgZmlsZXM6IFtdLCBpc1RydW5jYXRlZDogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSB3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NhY2hlLmdldChrZXkpO1xuXHRcdGxldCBzaGFyZWQ6IFByb21pc2U8SUFnZW50SG9zdFdvcmtzcGFjZUZpbGVzUmVzdWx0Pjtcblx0XHRpZiAoZXhpc3RpbmcgJiYgKGV4aXN0aW5nLmV4cGlyZXNBdCA9PT0gdW5kZWZpbmVkIHx8IGV4aXN0aW5nLmV4cGlyZXNBdCA+IG5vdykpIHtcblx0XHRcdHNoYXJlZCA9IGV4aXN0aW5nLnByb21pc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNoYXJlZCA9IGVudW1lcmF0aW9uTGltaXRlci5xdWV1ZSgoKSA9PiB0aGlzLl9pc0Rpc3Bvc2VkID8gUHJvbWlzZS5yZXNvbHZlKHsgZmlsZXM6IFtdLCBpc1RydW5jYXRlZDogZmFsc2UgfSkgOiB0aGlzLl9lbnVtZXJhdGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdFx0Y29uc3QgZW50cnk6IElDYWNoZUVudHJ5ID0geyBwcm9taXNlOiBzaGFyZWQgfTtcblx0XHRcdHRoaXMuX2NhY2hlLnNldChrZXksIGVudHJ5KTtcblx0XHRcdHNoYXJlZC50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2NhY2hlLmdldChrZXkpID09PSBlbnRyeSkge1xuXHRcdFx0XHRcdGVudHJ5LmV4cGlyZXNBdCA9IERhdGUubm93KCkgKyBDQUNIRV9UVExfTVM7XG5cdFx0XHRcdH1cblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2NhY2hlLmdldChrZXkpID09PSBlbnRyeSkge1xuXHRcdFx0XHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBSYWNlIHRoZSBzaGFyZWQgZW51bWVyYXRpb24gYWdhaW5zdCB0aGUgY2FsbGVyJ3MgY2FuY2VsbGF0aW9uXG5cdFx0Ly8gdG9rZW4uIE9ubHkgdGhlIGNhbGxlcidzIHByb21pc2UgcmVqZWN0cyBvbiBjYW5jZWxsYXRpb247IHRoZVxuXHRcdC8vIHNoYXJlZCBlbnVtZXJhdGlvbiBydW5zIHRvIGNvbXBsZXRpb24gc28gY29uY3VycmVudCBjYWxsZXJzIChhbmRcblx0XHQvLyBmdXR1cmUgY2FjaGUgaGl0cyB3aXRoaW4gdGhlIFRUTCkgc3RpbGwgc2VlIHRoZSByZXN1bHQuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuID09PSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSB7XG5cdFx0XHRyZXR1cm4gc2hhcmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SUFnZW50SG9zdFdvcmtzcGFjZUZpbGVzUmVzdWx0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBjYW5jZWxMaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0Y2FuY2VsTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0fSk7XG5cdFx0XHRzaGFyZWQudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdGNhbmNlbExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSh2YWx1ZSk7XG5cdFx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0XHRjYW5jZWxMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnVtZXJhdGUod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxJQWdlbnRIb3N0V29ya3NwYWNlRmlsZXNSZXN1bHQ+IHtcblx0XHRjb25zdCByZXNvbHZlZFJnRGlza1BhdGggPSBhd2FpdCByZ0Rpc2tQYXRoKCk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlc1Jlc3VsdD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgY3dkID0gd29ya2luZ0RpcmVjdG9yeS5mc1BhdGg7XG5cdFx0XHQvLyBNaXJyb3IgdGhlIHdvcmtiZW5jaCdzIGByaXBncmVwRmlsZVNlYXJjaC50c2AgaW52b2NhdGlvbjogcGFzc1xuXHRcdFx0Ly8gYC0tbm8tY29uZmlnYCBzbyBhIHVzZXIncyBnbG9iYWwgYH4vLnJpcGdyZXByY2AgY2Fubm90IGNoYW5nZVxuXHRcdFx0Ly8gZW51bWVyYXRpb24gcmVzdWx0cyAob3IgZW5hYmxlIHByZXByb2Nlc3NvcnMgZXRjLikuXG5cdFx0XHRjb25zdCBhcmdzID0gWyctLWZpbGVzJywgJy0taGlkZGVuJywgJy0tbm8tcmVxdWlyZS1naXQnLCAnLS1mb2xsb3cnLCAnLS1uby1jb25maWcnLCAnLS1nbG9iJywgJyEuZ2l0J107XG5cblx0XHRcdGxldCBjaGlsZDogY3AuQ2hpbGRQcm9jZXNzV2l0aG91dE51bGxTdHJlYW1zO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2hpbGQgPSBjcC5zcGF3bihyZXNvbHZlZFJnRGlza1BhdGgsIGFyZ3MsIHsgY3dkIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFdvcmtzcGFjZUZpbGVzXSBGYWlsZWQgdG8gc3Bhd24gcmlwZ3JlcDogJHtlcnJ9YCk7XG5cdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY3RpdmVDaGlsZHJlbi5hZGQoY2hpbGQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHRzOiBVUklbXSA9IFtdO1xuXHRcdFx0bGV0IGJ1ZmZlciA9ICcnO1xuXHRcdFx0bGV0IGxpbWl0SGl0ID0gZmFsc2U7XG5cdFx0XHRsZXQgc2V0dGxlZCA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBmaW5pc2ggPSAoZmlsZXM6IHJlYWRvbmx5IFVSSVtdLCBlcnJvcj86IEVycm9yKSA9PiB7XG5cdFx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVDaGlsZHJlbi5kZWxldGUoY2hpbGQpO1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUoeyBmaWxlcywgaXNUcnVuY2F0ZWQ6IGxpbWl0SGl0IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjaGlsZC5zdGRvdXQuc2V0RW5jb2RpbmcoJ3V0ZjgnKTtcblx0XHRcdGNoaWxkLnN0ZG91dC5vbignZGF0YScsIChjaHVuazogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmIChsaW1pdEhpdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRidWZmZXIgKz0gY2h1bms7XG5cdFx0XHRcdGxldCBuZXdsaW5lSW5kZXg6IG51bWJlcjtcblx0XHRcdFx0d2hpbGUgKChuZXdsaW5lSW5kZXggPSBidWZmZXIuaW5kZXhPZignXFxuJykpID49IDApIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lID0gYnVmZmVyLnNsaWNlKDAsIG5ld2xpbmVJbmRleCkucmVwbGFjZSgvXFxyJC8sICcnKTtcblx0XHRcdFx0XHRidWZmZXIgPSBidWZmZXIuc2xpY2UobmV3bGluZUluZGV4ICsgMSk7XG5cdFx0XHRcdFx0aWYgKCFsaW5lKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKFVSSS5qb2luUGF0aCh3b3JraW5nRGlyZWN0b3J5LCBsaW5lKSk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdHMubGVuZ3RoID49IE1BWF9GSUxFUykge1xuXHRcdFx0XHRcdFx0bGltaXRIaXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdFdvcmtzcGFjZUZpbGVzXSBGaWxlIGxpbWl0IHJlYWNoZWQgd2hpbGUgZW51bWVyYXRpbmcgJHt3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjaGlsZC5raWxsKCk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjaGlsZC5zdGRlcnIuc2V0RW5jb2RpbmcoJ3V0ZjgnKTtcblx0XHRcdGxldCBzdGRlcnIgPSAnJztcblx0XHRcdGNoaWxkLnN0ZGVyci5vbignZGF0YScsIChjaHVuazogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHN0ZGVyciArPSBjaHVuaztcblx0XHRcdH0pO1xuXG5cdFx0XHRjaGlsZC5vbignZXJyb3InLCBlcnIgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdGZpbmlzaChbXSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFdvcmtzcGFjZUZpbGVzXSByaXBncmVwIGVycm9yOiAke2Vycn1gKTtcblx0XHRcdFx0ZmluaXNoKFtdLCBlcnIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNoaWxkLm9uKCdjbG9zZScsIGNvZGUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdGZpbmlzaChbXSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEZsdXNoIGFueSB0cmFpbGluZyBsaW5lIHN0aWxsIGluIHRoZSBidWZmZXIuXG5cdFx0XHRcdGlmICghbGltaXRIaXQgJiYgYnVmZmVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lID0gYnVmZmVyLnJlcGxhY2UoL1xcciQvLCAnJyk7XG5cdFx0XHRcdFx0aWYgKGxpbmUpIHtcblx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaChVUkkuam9pblBhdGgod29ya2luZ0RpcmVjdG9yeSwgbGluZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRidWZmZXIgPSAnJztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RkZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdFdvcmtzcGFjZUZpbGVzXSByaXBncmVwIHN0ZGVycjogJHtzdGRlcnJ9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFsaW1pdEhpdCAmJiBjb2RlICE9PSAwICYmIGNvZGUgIT09IDEpIHtcblx0XHRcdFx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgcmlwZ3JlcCBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZSA/PyAndW5rbm93bid9IHdoaWxlIGVudW1lcmF0aW5nICR7d29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFdvcmtzcGFjZUZpbGVzXSAke2Vycm9yLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdFx0ZmluaXNoKFtdLCBlcnJvcik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZpbmlzaChyZXN1bHRzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQjtBQUczQixNQUFNLFlBQVk7QUFHbEIsTUFBTSxlQUFlO0FBR3JCLE1BQU0sOEJBQThCO0FBRXBDLE1BQU0scUJBQXFCLElBQUksUUFB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
