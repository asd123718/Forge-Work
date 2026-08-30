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
import { CancellationError } from "../../../base/common/errors.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILogService } from "../../log/common/log.js";
let LocalGitService = class {
  constructor(_logService, _execFile = cp.execFile) {
    this._logService = _logService;
    this._execFile = _execFile;
    this._runningProcesses = /* @__PURE__ */ new Map();
  }
  _exec(operationId, args, cwd) {
    return new Promise((resolve, reject) => {
      this._logService.trace(`[LocalGitService] git ${args.join(" ")}${cwd ? ` (cwd: ${cwd})` : ""}`);
      const proc = this._execFile("git", args, { cwd, encoding: "utf8" }, (err, stdout, stderr) => {
        if (!this._runningProcesses.delete(operationId)) {
          reject(new CancellationError());
          return;
        }
        if (err) {
          this._logService.error(`[LocalGitService] git ${args[0]} failed:`, err.message, stderr);
          reject(err);
          return;
        }
        resolve(stdout);
      });
      this._runningProcesses.set(operationId, proc);
    });
  }
  async clone(operationId, cloneUrl, targetPath, ref) {
    const args = ["clone"];
    if (ref) {
      args.push("--branch", ref);
    }
    args.push("--", cloneUrl, targetPath);
    await this._exec(operationId, args);
  }
  async pull(operationId, repoPath, options) {
    const before = (await this._exec(operationId, ["rev-parse", "HEAD"], repoPath)).trim();
    try {
      await this._exec(operationId, ["pull", "--ff-only"], repoPath);
    } catch (err) {
      if (!this._isFastForwardPullFailure(err)) {
        throw err;
      }
      const error = err;
      this._logService.warn(`[LocalGitService] Fast-forward pull failed for ${repoPath}: ${error?.message ?? String(err)}. Retrying after fetch.`);
      await this._exec(operationId, ["fetch", "--prune"], repoPath);
      try {
        await this._exec(operationId, ["pull", "--ff-only"], repoPath);
      } catch (retryErr) {
        if (!this._isFastForwardPullFailure(retryErr)) {
          throw retryErr;
        }
        if (!options?.allowHardResetOnDivergence) {
          throw retryErr;
        }
        const upstream = await this._getSafeHardResetTarget(operationId, repoPath);
        if (!upstream) {
          throw retryErr;
        }
        this._logService.warn(`[LocalGitService] Pull retries exhausted for ${repoPath}. Performing hard reset to ${upstream}.`);
        await this._exec(operationId, ["reset", "--hard", upstream], repoPath);
      }
    }
    const after = (await this._exec(operationId, ["rev-parse", "HEAD"], repoPath)).trim();
    return before !== after;
  }
  _isFastForwardPullFailure(err) {
    const error = err;
    if (error?.code !== 128) {
      return false;
    }
    const details = `${error.stderr ?? ""}
${error.message ?? ""}`;
    return /not possible to fast-forward|non-fast-forward/i.test(details);
  }
  async _getSafeHardResetTarget(operationId, repoPath) {
    const status = (await this._exec(operationId, ["status", "--porcelain"], repoPath)).trim();
    if (status.length > 0) {
      return void 0;
    }
    let upstream;
    try {
      upstream = (await this._exec(operationId, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], repoPath)).trim();
    } catch {
      return void 0;
    }
    const behind = await this._revListCount(operationId, repoPath, "HEAD", "@{u}");
    const ahead = await this._revListCount(operationId, repoPath, "@{u}", "HEAD");
    if (ahead === void 0 || behind === void 0 || ahead <= 0 || behind <= 0) {
      return void 0;
    }
    return upstream;
  }
  async _revListCount(operationId, repoPath, fromRef, toRef) {
    const result = await this._exec(operationId, ["rev-list", "--count", `${fromRef}..${toRef}`], repoPath);
    const parsed = Number(result.trim());
    if (!Number.isFinite(parsed)) {
      this._logService.warn(`[LocalGitService] Failed to parse rev-list count for ${fromRef}..${toRef} in ${repoPath}: ${result}`);
      return void 0;
    }
    return parsed;
  }
  async checkout(operationId, repoPath, treeish, detached) {
    const args = detached ? ["checkout", "--detach", treeish] : ["checkout", treeish];
    await this._exec(operationId, args, repoPath);
  }
  async revParse(repoPath, ref) {
    return (await this._exec(generateUuid(), ["rev-parse", ref], repoPath)).trim();
  }
  async fetch(operationId, repoPath) {
    await this._exec(operationId, ["fetch"], repoPath);
  }
  async revListCount(repoPath, fromRef, toRef) {
    const result = await this._exec(generateUuid(), ["rev-list", "--count", `${fromRef}..${toRef}`], repoPath);
    return Number(result.trim()) || 0;
  }
  async cancel(operationId) {
    const proc = this._runningProcesses.get(operationId);
    if (proc) {
      this._runningProcesses.delete(operationId);
      proc.kill();
    }
  }
};
LocalGitService = __decorateClass([
  __decorateParam(0, ILogService)
], LocalGitService);
export {
  LocalGitService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0XFxub2RlXFxsb2NhbEdpdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUdpdFB1bGxPcHRpb25zLCBJTG9jYWxHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2xvY2FsR2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGNsYXNzIExvY2FsR2l0U2VydmljZSBpbXBsZW1lbnRzIElMb2NhbEdpdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9ydW5uaW5nUHJvY2Vzc2VzID0gbmV3IE1hcDxzdHJpbmcsIGNwLkNoaWxkUHJvY2Vzcz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXhlY0ZpbGU6IHR5cGVvZiBjcC5leGVjRmlsZSA9IGNwLmV4ZWNGaWxlLFxuXHQpIHsgfVxuXG5cdHByaXZhdGUgX2V4ZWMob3BlcmF0aW9uSWQ6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGN3ZD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtMb2NhbEdpdFNlcnZpY2VdIGdpdCAke2FyZ3Muam9pbignICcpfSR7Y3dkID8gYCAoY3dkOiAke2N3ZH0pYCA6ICcnfWApO1xuXHRcdFx0Y29uc3QgcHJvYyA9IHRoaXMuX2V4ZWNGaWxlKCdnaXQnLCBhcmdzLCB7IGN3ZCwgZW5jb2Rpbmc6ICd1dGY4JyB9LCAoZXJyLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3J1bm5pbmdQcm9jZXNzZXMuZGVsZXRlKG9wZXJhdGlvbklkKSkge1xuXHRcdFx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbTG9jYWxHaXRTZXJ2aWNlXSBnaXQgJHthcmdzWzBdfSBmYWlsZWQ6YCwgZXJyLm1lc3NhZ2UsIHN0ZGVycik7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmUoc3Rkb3V0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9ydW5uaW5nUHJvY2Vzc2VzLnNldChvcGVyYXRpb25JZCwgcHJvYyk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBjbG9uZShvcGVyYXRpb25JZDogc3RyaW5nLCBjbG9uZVVybDogc3RyaW5nLCB0YXJnZXRQYXRoOiBzdHJpbmcsIHJlZj86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBbJ2Nsb25lJ107XG5cdFx0aWYgKHJlZikge1xuXHRcdFx0YXJncy5wdXNoKCctLWJyYW5jaCcsIHJlZik7XG5cdFx0fVxuXHRcdGFyZ3MucHVzaCgnLS0nLCBjbG9uZVVybCwgdGFyZ2V0UGF0aCk7XG5cdFx0YXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgYXJncyk7XG5cdH1cblxuXHRhc3luYyBwdWxsKG9wZXJhdGlvbklkOiBzdHJpbmcsIHJlcG9QYXRoOiBzdHJpbmcsIG9wdGlvbnM/OiBJR2l0UHVsbE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBiZWZvcmUgPSAoYXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgWydyZXYtcGFyc2UnLCAnSEVBRCddLCByZXBvUGF0aCkpLnRyaW0oKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIHJlcG9QYXRoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICghdGhpcy5faXNGYXN0Rm9yd2FyZFB1bGxGYWlsdXJlKGVycikpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlcnJvciA9IGVyciBhcyB7IG1lc3NhZ2U/OiBzdHJpbmcgfTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0xvY2FsR2l0U2VydmljZV0gRmFzdC1mb3J3YXJkIHB1bGwgZmFpbGVkIGZvciAke3JlcG9QYXRofTogJHtlcnJvcj8ubWVzc2FnZSA/PyBTdHJpbmcoZXJyKX0uIFJldHJ5aW5nIGFmdGVyIGZldGNoLmApO1xuXHRcdFx0YXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgWydmZXRjaCcsICctLXBydW5lJ10sIHJlcG9QYXRoKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgWydwdWxsJywgJy0tZmYtb25seSddLCByZXBvUGF0aCk7XG5cdFx0XHR9IGNhdGNoIChyZXRyeUVycikge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2lzRmFzdEZvcndhcmRQdWxsRmFpbHVyZShyZXRyeUVycikpIHtcblx0XHRcdFx0XHR0aHJvdyByZXRyeUVycjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghb3B0aW9ucz8uYWxsb3dIYXJkUmVzZXRPbkRpdmVyZ2VuY2UpIHtcblx0XHRcdFx0XHR0aHJvdyByZXRyeUVycjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHVwc3RyZWFtID0gYXdhaXQgdGhpcy5fZ2V0U2FmZUhhcmRSZXNldFRhcmdldChvcGVyYXRpb25JZCwgcmVwb1BhdGgpO1xuXHRcdFx0XHRpZiAoIXVwc3RyZWFtKSB7XG5cdFx0XHRcdFx0dGhyb3cgcmV0cnlFcnI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMb2NhbEdpdFNlcnZpY2VdIFB1bGwgcmV0cmllcyBleGhhdXN0ZWQgZm9yICR7cmVwb1BhdGh9LiBQZXJmb3JtaW5nIGhhcmQgcmVzZXQgdG8gJHt1cHN0cmVhbX0uYCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2V4ZWMob3BlcmF0aW9uSWQsIFsncmVzZXQnLCAnLS1oYXJkJywgdXBzdHJlYW1dLCByZXBvUGF0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWZ0ZXIgPSAoYXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgWydyZXYtcGFyc2UnLCAnSEVBRCddLCByZXBvUGF0aCkpLnRyaW0oKTtcblx0XHRyZXR1cm4gYmVmb3JlICE9PSBhZnRlcjtcblx0fVxuXG5cdHByaXZhdGUgX2lzRmFzdEZvcndhcmRQdWxsRmFpbHVyZShlcnI6IHVua25vd24pOiBlcnIgaXMgY3AuRXhlY0ZpbGVFeGNlcHRpb24gJiB7IHN0ZGVycj86IHN0cmluZyB9IHtcblx0XHRjb25zdCBlcnJvciA9IGVyciBhcyAoY3AuRXhlY0ZpbGVFeGNlcHRpb24gJiB7IHN0ZGVycj86IHN0cmluZzsgbWVzc2FnZT86IHN0cmluZyB9KSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZXJyb3I/LmNvZGUgIT09IDEyOCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRldGFpbHMgPSBgJHtlcnJvci5zdGRlcnIgPz8gJyd9XFxuJHtlcnJvci5tZXNzYWdlID8/ICcnfWA7XG5cdFx0cmV0dXJuIC9ub3QgcG9zc2libGUgdG8gZmFzdC1mb3J3YXJkfG5vbi1mYXN0LWZvcndhcmQvaS50ZXN0KGRldGFpbHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U2FmZUhhcmRSZXNldFRhcmdldChvcGVyYXRpb25JZDogc3RyaW5nLCByZXBvUGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzdGF0dXMgPSAoYXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgWydzdGF0dXMnLCAnLS1wb3JjZWxhaW4nXSwgcmVwb1BhdGgpKS50cmltKCk7XG5cdFx0aWYgKHN0YXR1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCB1cHN0cmVhbTogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHR1cHN0cmVhbSA9IChhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ3Jldi1wYXJzZScsICctLWFiYnJldi1yZWYnLCAnLS1zeW1ib2xpYy1mdWxsLW5hbWUnLCAnQHt1fSddLCByZXBvUGF0aCkpLnRyaW0oKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmVoaW5kID0gYXdhaXQgdGhpcy5fcmV2TGlzdENvdW50KG9wZXJhdGlvbklkLCByZXBvUGF0aCwgJ0hFQUQnLCAnQHt1fScpO1xuXHRcdGNvbnN0IGFoZWFkID0gYXdhaXQgdGhpcy5fcmV2TGlzdENvdW50KG9wZXJhdGlvbklkLCByZXBvUGF0aCwgJ0B7dX0nLCAnSEVBRCcpO1xuXHRcdGlmIChhaGVhZCA9PT0gdW5kZWZpbmVkIHx8IGJlaGluZCA9PT0gdW5kZWZpbmVkIHx8IGFoZWFkIDw9IDAgfHwgYmVoaW5kIDw9IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVwc3RyZWFtO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmV2TGlzdENvdW50KG9wZXJhdGlvbklkOiBzdHJpbmcsIHJlcG9QYXRoOiBzdHJpbmcsIGZyb21SZWY6IHN0cmluZywgdG9SZWY6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgWydyZXYtbGlzdCcsICctLWNvdW50JywgYCR7ZnJvbVJlZn0uLiR7dG9SZWZ9YF0sIHJlcG9QYXRoKTtcblx0XHRjb25zdCBwYXJzZWQgPSBOdW1iZXIocmVzdWx0LnRyaW0oKSk7XG5cdFx0aWYgKCFOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbTG9jYWxHaXRTZXJ2aWNlXSBGYWlsZWQgdG8gcGFyc2UgcmV2LWxpc3QgY291bnQgZm9yICR7ZnJvbVJlZn0uLiR7dG9SZWZ9IGluICR7cmVwb1BhdGh9OiAke3Jlc3VsdH1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhcnNlZDtcblx0fVxuXG5cdGFzeW5jIGNoZWNrb3V0KG9wZXJhdGlvbklkOiBzdHJpbmcsIHJlcG9QYXRoOiBzdHJpbmcsIHRyZWVpc2g6IHN0cmluZywgZGV0YWNoZWQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXJncyA9IGRldGFjaGVkXG5cdFx0XHQ/IFsnY2hlY2tvdXQnLCAnLS1kZXRhY2gnLCB0cmVlaXNoXVxuXHRcdFx0OiBbJ2NoZWNrb3V0JywgdHJlZWlzaF07XG5cdFx0YXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgYXJncywgcmVwb1BhdGgpO1xuXHR9XG5cblx0YXN5bmMgcmV2UGFyc2UocmVwb1BhdGg6IHN0cmluZywgcmVmOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fZXhlYyhnZW5lcmF0ZVV1aWQoKSwgWydyZXYtcGFyc2UnLCByZWZdLCByZXBvUGF0aCkpLnRyaW0oKTtcblx0fVxuXG5cdGFzeW5jIGZldGNoKG9wZXJhdGlvbklkOiBzdHJpbmcsIHJlcG9QYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ2ZldGNoJ10sIHJlcG9QYXRoKTtcblx0fVxuXG5cdGFzeW5jIHJldkxpc3RDb3VudChyZXBvUGF0aDogc3RyaW5nLCBmcm9tUmVmOiBzdHJpbmcsIHRvUmVmOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2V4ZWMoZ2VuZXJhdGVVdWlkKCksIFsncmV2LWxpc3QnLCAnLS1jb3VudCcsIGAke2Zyb21SZWZ9Li4ke3RvUmVmfWBdLCByZXBvUGF0aCk7XG5cdFx0cmV0dXJuIE51bWJlcihyZXN1bHQudHJpbSgpKSB8fCAwO1xuXHR9XG5cblx0YXN5bmMgY2FuY2VsKG9wZXJhdGlvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9jID0gdGhpcy5fcnVubmluZ1Byb2Nlc3Nlcy5nZXQob3BlcmF0aW9uSWQpO1xuXHRcdGlmIChwcm9jKSB7XG5cdFx0XHR0aGlzLl9ydW5uaW5nUHJvY2Vzc2VzLmRlbGV0ZShvcGVyYXRpb25JZCk7XG5cdFx0XHRwcm9jLmtpbGwoKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsbUJBQW1CO0FBRXJCLElBQU0sa0JBQU4sTUFBa0Q7QUFBQSxFQUt4RCxZQUMrQixhQUNiLFlBQWdDLEdBQUcsVUFDbkQ7QUFGNkI7QUFDYjtBQUpsQixTQUFRLG9CQUFvQixvQkFBSSxJQUE2QjtBQUFBLEVBS3pEO0FBQUEsRUFFSSxNQUFNLGFBQXFCLE1BQWdCLEtBQStCO0FBQ2pGLFdBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3ZDLFdBQUssWUFBWSxNQUFNLHlCQUF5QixLQUFLLEtBQUssR0FBRyxDQUFDLEdBQUcsTUFBTSxVQUFVLEdBQUcsTUFBTSxFQUFFLEVBQUU7QUFDOUYsWUFBTSxPQUFPLEtBQUssVUFBVSxPQUFPLE1BQU0sRUFBRSxLQUFLLFVBQVUsT0FBTyxHQUFHLENBQUMsS0FBSyxRQUFRLFdBQVc7QUFDNUYsWUFBSSxDQUFDLEtBQUssa0JBQWtCLE9BQU8sV0FBVyxHQUFHO0FBQ2hELGlCQUFPLElBQUksa0JBQWtCLENBQUM7QUFDOUI7QUFBQSxRQUNEO0FBQ0EsWUFBSSxLQUFLO0FBQ1IsZUFBSyxZQUFZLE1BQU0seUJBQXlCLEtBQUssQ0FBQyxDQUFDLFlBQVksSUFBSSxTQUFTLE1BQU07QUFDdEYsaUJBQU8sR0FBRztBQUNWO0FBQUEsUUFDRDtBQUNBLGdCQUFRLE1BQU07QUFBQSxNQUNmLENBQUM7QUFFRCxXQUFLLGtCQUFrQixJQUFJLGFBQWEsSUFBSTtBQUFBLElBQzdDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLE1BQU0sYUFBcUIsVUFBa0IsWUFB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
