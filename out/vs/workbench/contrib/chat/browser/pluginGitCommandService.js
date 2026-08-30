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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { getComparisonKey } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRequestService } from "../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import {
  GitHubAuthRequiredError,
  GitHubRateLimitError,
  fetchAndExtractGitHubRepo,
  parseGitHubCloneUrl,
  resolveGitHubRefToSha
} from "./githubRepoFetcher.js";
const BROWSER_CACHE_STORAGE_KEY = "chat.plugins.browserCache.v1";
let BrowserPluginGitCommandService = class {
  constructor(_fileService, _logService, _requestService, _storageService, _authenticationService) {
    this._fileService = _fileService;
    this._logService = _logService;
    this._requestService = _requestService;
    this._storageService = _storageService;
    this._authenticationService = _authenticationService;
  }
  async cloneRepository(cloneUrl, targetDir, ref, token) {
    const repo = this._parseOrThrow(cloneUrl);
    const cancel = token ?? CancellationToken.None;
    const cloneWithToken = async (authToken) => {
      const sha = await resolveGitHubRefToSha(this._requestService, repo, ref, authToken, cancel);
      await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, sha, targetDir, authToken, cancel);
      this._setCacheEntry(targetDir, { owner: repo.owner, repo: repo.repo, ref, sha, fetchedAt: Date.now() });
    };
    const initialAuthToken = await this._lookupGitHubToken();
    const attempts = [
      async () => initialAuthToken
    ];
    if (initialAuthToken) {
      attempts.push(async () => void 0);
    }
    attempts.push(() => this._requestGitHubToken(repo));
    let lastErr;
    for (const getToken of attempts) {
      if (cancel.isCancellationRequested) {
        throw new CancellationError();
      }
      try {
        await cloneWithToken(await getToken());
        return;
      } catch (err) {
        lastErr = err;
        this._maybeLogTransientError(err, repo);
        if (!(err instanceof GitHubAuthRequiredError)) {
          throw err;
        }
      }
    }
    if (lastErr instanceof GitHubAuthRequiredError) {
      throw new Error(localize(
        "pluginsBrowserGitHubAccessRequired",
        "GitHub authentication is required to install '{0}'. Sign in with an account that has access to this repository, then try again.",
        `${repo.owner}/${repo.repo}`
      ));
    }
    throw lastErr;
  }
  async pull(repoDir, token) {
    const entry = this._getCacheEntry(repoDir);
    if (!entry) {
      throw new Error(`Cannot pull plugin: no cached metadata for ${repoDir.toString()}`);
    }
    const cancel = token ?? CancellationToken.None;
    const authToken = await this._lookupGitHubToken();
    const repo = { owner: entry.owner, repo: entry.repo };
    try {
      const newSha = await resolveGitHubRefToSha(this._requestService, repo, entry.ref, authToken, cancel);
      if (newSha === entry.sha) {
        return false;
      }
      await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, newSha, repoDir, authToken, cancel);
      this._setCacheEntry(repoDir, { ...entry, sha: newSha, fetchedAt: Date.now() });
      return true;
    } catch (err) {
      this._maybeLogTransientError(err, repo);
      throw err;
    }
  }
  async checkout(repoDir, treeish, _detached, token) {
    const entry = this._getCacheEntry(repoDir);
    if (!entry) {
      throw new Error(`Cannot checkout plugin: no cached metadata for ${repoDir.toString()}`);
    }
    const cancel = token ?? CancellationToken.None;
    const authToken = await this._lookupGitHubToken();
    const repo = { owner: entry.owner, repo: entry.repo };
    const requestedRef = treeish.trim();
    const isFullSha = /^[0-9a-f]{40}$/i.test(requestedRef);
    const requestedSha = isFullSha ? requestedRef.toLowerCase() : await resolveGitHubRefToSha(this._requestService, repo, requestedRef, authToken, cancel);
    if (requestedSha === entry.sha.toLowerCase()) {
      return;
    }
    try {
      await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, requestedSha, repoDir, authToken, cancel);
      this._setCacheEntry(repoDir, {
        ...entry,
        ref: isFullSha ? entry.ref : requestedRef,
        sha: requestedSha,
        fetchedAt: Date.now()
      });
    } catch (err) {
      this._maybeLogTransientError(err, repo);
      throw err;
    }
  }
  async revParse(repoDir, ref) {
    const entry = this._getCacheEntry(repoDir);
    if (!entry) {
      throw new Error(`Cannot resolve ref: no cached metadata for ${repoDir.toString()}`);
    }
    const trimmed = ref.trim();
    const isFullSha = /^[0-9a-f]{40}$/i.test(trimmed);
    if (isFullSha && trimmed.toLowerCase() !== entry.sha.toLowerCase()) {
      throw new Error(`Cannot resolve ref '${ref}' in tree-cached plugin: only HEAD/${entry.sha} is materialised`);
    }
    return entry.sha;
  }
  async fetch(_repoDir, _token) {
  }
  async fetchRepository(_repoDir, _token) {
  }
  async revListCount(_repoDir, _fromRef, _toRef) {
    return 0;
  }
  // -- helpers --------------------------------------------------------------
  _parseOrThrow(cloneUrl) {
    const parsed = parseGitHubCloneUrl(cloneUrl);
    if (!parsed) {
      throw new Error(localize(
        "pluginsBrowserUnsupportedHost",
        "Agent plugins in the browser can only be installed from GitHub HTTPS URLs. To install '{0}', use the desktop application or connect to a remote agent host.",
        cloneUrl
      ));
    }
    return parsed;
  }
  _maybeLogTransientError(err, repo) {
    if (err instanceof GitHubAuthRequiredError) {
      this._logService.warn(`[BrowserPluginGitCommandService] GitHub auth required for ${repo.owner}/${repo.repo}: ${err.message}`);
    } else if (err instanceof GitHubRateLimitError) {
      const wait = err.retryAfterSeconds !== void 0 ? ` (retry after ${err.retryAfterSeconds}s)` : "";
      this._logService.warn(`[BrowserPluginGitCommandService] GitHub rate limit hit for ${repo.owner}/${repo.repo}${wait}: ${err.message}`);
    } else if (err instanceof Error) {
      const cause = err.cause instanceof Error ? ` (cause: ${err.cause.name}: ${err.cause.message})` : "";
      this._logService.error(`[BrowserPluginGitCommandService] Clone failed for ${repo.owner}/${repo.repo}: ${err.message}${cause}`);
    }
  }
  /**
   * Best-effort silent lookup of an existing GitHub session token. Returns
   * `undefined` when no session is available; callers fall back to anonymous,
   * which still works for public repos. Prefers a `repo`-scoped session when
   * multiple are present (e.g. EMU + personal).
   */
  async _lookupGitHubToken() {
    try {
      const sessions = await this._authenticationService.getSessions("github", [], { silent: true });
      if (sessions.length === 0) {
        return void 0;
      }
      const repoScopeSession = sessions.find((session) => session.scopes.includes("repo"));
      return repoScopeSession?.accessToken ?? sessions[0].accessToken;
    } catch (err) {
      this._logService.trace("[BrowserPluginGitCommandService] Silent GitHub session lookup failed:", err);
      return void 0;
    }
  }
  async _requestGitHubToken(repo) {
    try {
      const session = await this._authenticationService.createSession("github", ["repo"], { activateImmediate: true });
      return session.accessToken;
    } catch (err) {
      this._logService.trace("[BrowserPluginGitCommandService] GitHub session request failed:", err);
      throw new Error(localize(
        "pluginsBrowserGitHubSignInRequired",
        "Sign in to GitHub with an account that has access to '{0}' to install this plugin.",
        `${repo.owner}/${repo.repo}`
      ));
    }
  }
  // -- metadata cache (IStorageService) -------------------------------------
  _cacheKey(targetDir) {
    return getComparisonKey(targetDir, true);
  }
  async _pruneStaleEntries(cache, knownDirs) {
    const removed = [];
    await Promise.all(Array.from(knownDirs, async ([key, uri]) => {
      try {
        if (!await this._fileService.exists(uri)) {
          removed.push(key);
        }
      } catch {
      }
    }));
    if (removed.length === 0) {
      return;
    }
    for (const key of removed) {
      cache.delete(key);
    }
    this._logService.trace(`[BrowserPluginGitCommandService] Pruned ${removed.length} stale cache entries`);
    this._persistCache();
  }
  _ensureCacheLoaded() {
    if (this._cache) {
      return this._cache;
    }
    const cache = /* @__PURE__ */ new Map();
    const stored = this._storageService.getObject(BROWSER_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
    const knownDirs = /* @__PURE__ */ new Map();
    if (stored) {
      for (const [key, entry] of Object.entries(stored)) {
        if (entry && typeof entry.sha === "string" && typeof entry.owner === "string" && typeof entry.repo === "string") {
          cache.set(key, {
            owner: entry.owner,
            repo: entry.repo,
            ref: typeof entry.ref === "string" ? entry.ref : void 0,
            sha: entry.sha,
            fetchedAt: typeof entry.fetchedAt === "number" ? entry.fetchedAt : 0
          });
          try {
            knownDirs.set(key, URI.parse(key));
          } catch {
            cache.delete(key);
          }
        }
      }
    }
    this._cache = cache;
    if (knownDirs.size > 0) {
      this._pruneStaleEntries(cache, knownDirs).catch((err) => {
        this._logService.trace("[BrowserPluginGitCommandService] Cache prune failed:", err);
      });
    }
    return cache;
  }
  _getCacheEntry(targetDir) {
    return this._ensureCacheLoaded().get(this._cacheKey(targetDir));
  }
  _setCacheEntry(targetDir, entry) {
    const cache = this._ensureCacheLoaded();
    cache.set(this._cacheKey(targetDir), entry);
    this._persistCache();
  }
  _persistCache() {
    if (!this._cache) {
      return;
    }
    const serialized = {};
    for (const [key, entry] of this._cache) {
      serialized[key] = entry;
    }
    if (Object.keys(serialized).length === 0) {
      this._storageService.remove(BROWSER_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
      return;
    }
    this._storageService.store(BROWSER_CACHE_STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
};
BrowserPluginGitCommandService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IAuthenticationService)
], BrowserPluginGitCommandService);
export {
  BrowserPluginGitCommandService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgZ2V0Q29tcGFyaXNvbktleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luR2l0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0R2l0SHViQXV0aFJlcXVpcmVkRXJyb3IsXG5cdEdpdEh1YlJhdGVMaW1pdEVycm9yLFxuXHRJR2l0SHViUmVwb1JlZixcblx0ZmV0Y2hBbmRFeHRyYWN0R2l0SHViUmVwbyxcblx0cGFyc2VHaXRIdWJDbG9uZVVybCxcblx0cmVzb2x2ZUdpdEh1YlJlZlRvU2hhLFxufSBmcm9tICcuL2dpdGh1YlJlcG9GZXRjaGVyLmpzJztcblxuLyoqIFN0b3JhZ2Uga2V5IGZvciB0aGUgcGVyLXRhcmdldCBtZXRhZGF0YSBpbmRleCB1c2VkIGJ5IHRoaXMgc2VydmljZS4gKi9cbmNvbnN0IEJST1dTRVJfQ0FDSEVfU1RPUkFHRV9LRVkgPSAnY2hhdC5wbHVnaW5zLmJyb3dzZXJDYWNoZS52MSc7XG5cbi8qKlxuICogUGVyLXRhcmdldCBtZXRhZGF0YSBwZXJzaXN0ZWQgdmlhIHtAbGluayBJU3RvcmFnZVNlcnZpY2V9LiBLZXllZCBieSB0aGVcbiAqIGB0YXJnZXREaXIudG9TdHJpbmcoKWAgb2YgdGhlIGNsb25lZCByZXBvc2l0b3J5IHNvIHdlIGNhbiBhbnN3ZXJcbiAqIGByZXZQYXJzZSgnSEVBRCcpYCBhbmQgZGV0ZWN0IFwiaXMgdGhlIGNhY2hlZCBzbmFwc2hvdCBzdGlsbCBjdXJyZW50P1wiIG9uXG4gKiBgcHVsbCgpYCB3aXRob3V0IGFuIGV4dHJhIEdpdEh1YiByb3VuZC10cmlwLlxuICovXG5pbnRlcmZhY2UgSUJyb3dzZXJQbHVnaW5DYWNoZUVudHJ5IHtcblx0cmVhZG9ubHkgb3duZXI6IHN0cmluZztcblx0cmVhZG9ubHkgcmVwbzogc3RyaW5nO1xuXHRyZWFkb25seSByZWY/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNoYTogc3RyaW5nO1xuXHRyZWFkb25seSBmZXRjaGVkQXQ6IG51bWJlcjtcbn1cblxudHlwZSBJU3RvcmVkQnJvd3NlclBsdWdpbkNhY2hlID0gUmVjb3JkPHN0cmluZywgSUJyb3dzZXJQbHVnaW5DYWNoZUVudHJ5PjtcblxuLyoqXG4gKiBCcm93c2VyIGltcGxlbWVudGF0aW9uIG9mIHtAbGluayBJUGx1Z2luR2l0U2VydmljZX0uXG4gKlxuICogYGdpdGAgaXMgbm90IGF2YWlsYWJsZSBpbiB0aGUgYnJvd3Nlciwgc28gcGx1Z2luIGNvbnRlbnRzIGFyZSByZWNvbnN0cnVjdGVkXG4gKiBmcm9tIHRoZSBHaXRIdWIgUkVTVCBBUEk6IGAvZ2l0L3RyZWVzL3tzaGF9P3JlY3Vyc2l2ZT0xYCBmb3IgdGhlIGxpc3RpbmcgYW5kXG4gKiBgL2dpdC9ibG9icy97YmxvYl9zaGF9YCBmb3IgZWFjaCBmaWxlJ3MgYnl0ZXMuIEJvdGggbGl2ZSBvbiBgYXBpLmdpdGh1Yi5jb21gLFxuICogd2hpY2ggaXMgdGhlIG9ubHkgR2l0SHViIGhvc3QgdGhhdCBoYW5kbGVzIENPUlMgd2l0aCBhdXRoIGhlYWRlcnMgXHUyMDE0IHRoZVxuICogYC90YXJiYWxsL2AgZW5kcG9pbnQgcmVkaXJlY3RzIHRvIGBjb2RlbG9hZC5naXRodWIuY29tYCAobm8gQ09SUykgYW5kXG4gKiBgcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbWAgcmVqZWN0cyB0aGUgT1BUSU9OUyBwcmVmbGlnaHQgZm9yY2VkIGJ5XG4gKiBgQXV0aG9yaXphdGlvbjogQmVhcmVyYC5cbiAqXG4gKiBPbmx5IEhUVFBTIEdpdEh1YiBjbG9uZSBVUkxzIGFyZSBzdXBwb3J0ZWQ7IGV2ZXJ5dGhpbmcgZWxzZSB0aHJvd3MgYW5cbiAqIGFjdGlvbmFibGUgbG9jYWxpemVkIGVycm9yIHBvaW50aW5nIGF0IGRlc2t0b3Agb3IgYSByZW1vdGUgYWdlbnQgaG9zdC5cbiAqXG4gKiBQZXItdGFyZ2V0IG1ldGFkYXRhIGlzIHBlcnNpc3RlZCB2aWEge0BsaW5rIElTdG9yYWdlU2VydmljZX0gc28gYHJldlBhcnNlYFxuICogYW5zd2VycyBsb2NhbGx5LCBgcHVsbCgpYCBza2lwcyB0aGUgcmUtZG93bmxvYWQgd2hlbiB0aGUgdXBzdHJlYW0gU0hBIGhhc1xuICogbm90IG1vdmVkLCBhbmQgdGhlIHBlcnNpc3RlZCBTSEEgZmVlZHMgYEN1c3RvbWl6YXRpb25SZWYubm9uY2VgIGZvciBBSFBcbiAqIGRlZHVwZS5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJQbHVnaW5HaXRDb21tYW5kU2VydmljZSBpbXBsZW1lbnRzIElQbHVnaW5HaXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY2FjaGU6IE1hcDxzdHJpbmcsIElCcm93c2VyUGx1Z2luQ2FjaGVFbnRyeT4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBjbG9uZVJlcG9zaXRvcnkoY2xvbmVVcmw6IHN0cmluZywgdGFyZ2V0RGlyOiBVUkksIHJlZj86IHN0cmluZywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlcG8gPSB0aGlzLl9wYXJzZU9yVGhyb3coY2xvbmVVcmwpO1xuXHRcdGNvbnN0IGNhbmNlbCA9IHRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmU7XG5cdFx0Y29uc3QgY2xvbmVXaXRoVG9rZW4gPSBhc3luYyAoYXV0aFRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGNvbnN0IHNoYSA9IGF3YWl0IHJlc29sdmVHaXRIdWJSZWZUb1NoYSh0aGlzLl9yZXF1ZXN0U2VydmljZSwgcmVwbywgcmVmLCBhdXRoVG9rZW4sIGNhbmNlbCk7XG5cdFx0XHRhd2FpdCBmZXRjaEFuZEV4dHJhY3RHaXRIdWJSZXBvKHRoaXMuX3JlcXVlc3RTZXJ2aWNlLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgcmVwbywgc2hhLCB0YXJnZXREaXIsIGF1dGhUb2tlbiwgY2FuY2VsKTtcblx0XHRcdHRoaXMuX3NldENhY2hlRW50cnkodGFyZ2V0RGlyLCB7IG93bmVyOiByZXBvLm93bmVyLCByZXBvOiByZXBvLnJlcG8sIHJlZiwgc2hhLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfSk7XG5cdFx0fTtcblxuXHRcdC8vIEF1dGggbGFkZGVyOiBzaWduZWQtaW4gdG9rZW4gXHUyMTkyIGFub255bW91cyBcdTIxOTIgZnJlc2hseS1yZXF1ZXN0ZWQgcmVwbyBzZXNzaW9uLlxuXHRcdC8vIEVhY2ggcnVuZyBvbmx5IHJ1bnMgd2hlbiB0aGUgcHJldmlvdXMgb25lIGZhaWxlZCB3aXRoIGEgNDAxLzQwMyAodGhlXG5cdFx0Ly8gYEdpdEh1YkF1dGhSZXF1aXJlZEVycm9yYCk7IG90aGVyIGVycm9ycyBwcm9wYWdhdGUgaW1tZWRpYXRlbHkuXG5cdFx0Y29uc3QgaW5pdGlhbEF1dGhUb2tlbiA9IGF3YWl0IHRoaXMuX2xvb2t1cEdpdEh1YlRva2VuKCk7XG5cdFx0Y29uc3QgYXR0ZW1wdHM6IEFycmF5PCgpID0+IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPj4gPSBbXG5cdFx0XHRhc3luYyAoKSA9PiBpbml0aWFsQXV0aFRva2VuLFxuXHRcdF07XG5cdFx0aWYgKGluaXRpYWxBdXRoVG9rZW4pIHtcblx0XHRcdGF0dGVtcHRzLnB1c2goYXN5bmMgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0YXR0ZW1wdHMucHVzaCgoKSA9PiB0aGlzLl9yZXF1ZXN0R2l0SHViVG9rZW4ocmVwbykpO1xuXG5cdFx0bGV0IGxhc3RFcnI6IHVua25vd247XG5cdFx0Zm9yIChjb25zdCBnZXRUb2tlbiBvZiBhdHRlbXB0cykge1xuXHRcdFx0aWYgKGNhbmNlbC5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNsb25lV2l0aFRva2VuKGF3YWl0IGdldFRva2VuKCkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0bGFzdEVyciA9IGVycjtcblx0XHRcdFx0dGhpcy5fbWF5YmVMb2dUcmFuc2llbnRFcnJvcihlcnIsIHJlcG8pO1xuXHRcdFx0XHRpZiAoIShlcnIgaW5zdGFuY2VvZiBHaXRIdWJBdXRoUmVxdWlyZWRFcnJvcikpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobGFzdEVyciBpbnN0YW5jZW9mIEdpdEh1YkF1dGhSZXF1aXJlZEVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoXG5cdFx0XHRcdCdwbHVnaW5zQnJvd3NlckdpdEh1YkFjY2Vzc1JlcXVpcmVkJyxcblx0XHRcdFx0XCJHaXRIdWIgYXV0aGVudGljYXRpb24gaXMgcmVxdWlyZWQgdG8gaW5zdGFsbCAnezB9Jy4gU2lnbiBpbiB3aXRoIGFuIGFjY291bnQgdGhhdCBoYXMgYWNjZXNzIHRvIHRoaXMgcmVwb3NpdG9yeSwgdGhlbiB0cnkgYWdhaW4uXCIsXG5cdFx0XHRcdGAke3JlcG8ub3duZXJ9LyR7cmVwby5yZXBvfWAsXG5cdFx0XHQpKTtcblx0XHR9XG5cdFx0dGhyb3cgbGFzdEVycjtcblx0fVxuXG5cdGFzeW5jIHB1bGwocmVwb0RpcjogVVJJLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9nZXRDYWNoZUVudHJ5KHJlcG9EaXIpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHB1bGwgcGx1Z2luOiBubyBjYWNoZWQgbWV0YWRhdGEgZm9yICR7cmVwb0Rpci50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRjb25zdCBjYW5jZWwgPSB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lO1xuXHRcdGNvbnN0IGF1dGhUb2tlbiA9IGF3YWl0IHRoaXMuX2xvb2t1cEdpdEh1YlRva2VuKCk7XG5cdFx0Y29uc3QgcmVwbzogSUdpdEh1YlJlcG9SZWYgPSB7IG93bmVyOiBlbnRyeS5vd25lciwgcmVwbzogZW50cnkucmVwbyB9O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBuZXdTaGEgPSBhd2FpdCByZXNvbHZlR2l0SHViUmVmVG9TaGEodGhpcy5fcmVxdWVzdFNlcnZpY2UsIHJlcG8sIGVudHJ5LnJlZiwgYXV0aFRva2VuLCBjYW5jZWwpO1xuXHRcdFx0aWYgKG5ld1NoYSA9PT0gZW50cnkuc2hhKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IGZldGNoQW5kRXh0cmFjdEdpdEh1YlJlcG8odGhpcy5fcmVxdWVzdFNlcnZpY2UsIHRoaXMuX2ZpbGVTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCByZXBvLCBuZXdTaGEsIHJlcG9EaXIsIGF1dGhUb2tlbiwgY2FuY2VsKTtcblx0XHRcdHRoaXMuX3NldENhY2hlRW50cnkocmVwb0RpciwgeyAuLi5lbnRyeSwgc2hhOiBuZXdTaGEsIGZldGNoZWRBdDogRGF0ZS5ub3coKSB9KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbWF5YmVMb2dUcmFuc2llbnRFcnJvcihlcnIsIHJlcG8pO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNoZWNrb3V0KHJlcG9EaXI6IFVSSSwgdHJlZWlzaDogc3RyaW5nLCBfZGV0YWNoZWQ/OiBib29sZWFuLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9nZXRDYWNoZUVudHJ5KHJlcG9EaXIpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNoZWNrb3V0IHBsdWdpbjogbm8gY2FjaGVkIG1ldGFkYXRhIGZvciAke3JlcG9EaXIudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBjYW5jZWwgPSB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lO1xuXHRcdGNvbnN0IGF1dGhUb2tlbiA9IGF3YWl0IHRoaXMuX2xvb2t1cEdpdEh1YlRva2VuKCk7XG5cdFx0Y29uc3QgcmVwbzogSUdpdEh1YlJlcG9SZWYgPSB7IG93bmVyOiBlbnRyeS5vd25lciwgcmVwbzogZW50cnkucmVwbyB9O1xuXHRcdGNvbnN0IHJlcXVlc3RlZFJlZiA9IHRyZWVpc2gudHJpbSgpO1xuXG5cdFx0Ly8gNDAtaGV4IFNIQSByZWZzIHNraXAgdGhlIHJlc29sdmVTaGEgcm91bmQtdHJpcCAoY2xvbmUgcGlucyB0byB0aGUgU0hBIGFscmVhZHkpLlxuXHRcdGNvbnN0IGlzRnVsbFNoYSA9IC9eWzAtOWEtZl17NDB9JC9pLnRlc3QocmVxdWVzdGVkUmVmKTtcblx0XHRjb25zdCByZXF1ZXN0ZWRTaGEgPSBpc0Z1bGxTaGFcblx0XHRcdD8gcmVxdWVzdGVkUmVmLnRvTG93ZXJDYXNlKClcblx0XHRcdDogYXdhaXQgcmVzb2x2ZUdpdEh1YlJlZlRvU2hhKHRoaXMuX3JlcXVlc3RTZXJ2aWNlLCByZXBvLCByZXF1ZXN0ZWRSZWYsIGF1dGhUb2tlbiwgY2FuY2VsKTtcblxuXHRcdGlmIChyZXF1ZXN0ZWRTaGEgPT09IGVudHJ5LnNoYS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZldGNoQW5kRXh0cmFjdEdpdEh1YlJlcG8odGhpcy5fcmVxdWVzdFNlcnZpY2UsIHRoaXMuX2ZpbGVTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCByZXBvLCByZXF1ZXN0ZWRTaGEsIHJlcG9EaXIsIGF1dGhUb2tlbiwgY2FuY2VsKTtcblx0XHRcdHRoaXMuX3NldENhY2hlRW50cnkocmVwb0Rpciwge1xuXHRcdFx0XHQuLi5lbnRyeSxcblx0XHRcdFx0cmVmOiBpc0Z1bGxTaGEgPyBlbnRyeS5yZWYgOiByZXF1ZXN0ZWRSZWYsXG5cdFx0XHRcdHNoYTogcmVxdWVzdGVkU2hhLFxuXHRcdFx0XHRmZXRjaGVkQXQ6IERhdGUubm93KCksXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX21heWJlTG9nVHJhbnNpZW50RXJyb3IoZXJyLCByZXBvKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXZQYXJzZShyZXBvRGlyOiBVUkksIHJlZjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2dldENhY2hlRW50cnkocmVwb0Rpcik7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVzb2x2ZSByZWY6IG5vIGNhY2hlZCBtZXRhZGF0YSBmb3IgJHtyZXBvRGlyLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdC8vIFJlamVjdCB1bnJlbGF0ZWQgU0hBcyBzbyBjYWxsZXJzIG5vdGljZSB0aGV5IGdvdCBhIGNhY2hlIGhpdCBpbnN0ZWFkIG9mIGBnaXQgcmV2LXBhcnNlYC5cblx0XHRjb25zdCB0cmltbWVkID0gcmVmLnRyaW0oKTtcblx0XHRjb25zdCBpc0Z1bGxTaGEgPSAvXlswLTlhLWZdezQwfSQvaS50ZXN0KHRyaW1tZWQpO1xuXHRcdGlmIChpc0Z1bGxTaGEgJiYgdHJpbW1lZC50b0xvd2VyQ2FzZSgpICE9PSBlbnRyeS5zaGEudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVzb2x2ZSByZWYgJyR7cmVmfScgaW4gdHJlZS1jYWNoZWQgcGx1Z2luOiBvbmx5IEhFQUQvJHtlbnRyeS5zaGF9IGlzIG1hdGVyaWFsaXNlZGApO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cnkuc2hhO1xuXHR9XG5cblx0YXN5bmMgZmV0Y2goX3JlcG9EaXI6IFVSSSwgX3Rva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBOby1vcDogdGhlcmUgaXMgbm8gbG9jYWwgZ2l0IGRhdGFiYXNlLiBgcHVsbCgpYCByZS1mZXRjaGVzIHdoZW4gbmVlZGVkLlxuXHR9XG5cblx0YXN5bmMgZmV0Y2hSZXBvc2l0b3J5KF9yZXBvRGlyOiBVUkksIF90b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTm8tb3AgZm9yIHRoZSBzYW1lIHJlYXNvbiBhcyBgZmV0Y2goKWAuXG5cdH1cblxuXHRhc3luYyByZXZMaXN0Q291bnQoX3JlcG9EaXI6IFVSSSwgX2Zyb21SZWY6IHN0cmluZywgX3RvUmVmOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdC8vIE5vIGNvbW1pdCBoaXN0b3J5IGF2YWlsYWJsZSBpbiB0aGUgY2FjaGU7IDAgbWVhbnMgXCJ1cCB0byBkYXRlXCIgdG9cblx0XHQvLyB0aGUgc2lsZW50LWZldGNoIGNhbGxlciBpbiBgQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS5mZXRjaFJlcG9zaXRvcnlgLlxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0Ly8gLS0gaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3BhcnNlT3JUaHJvdyhjbG9uZVVybDogc3RyaW5nKTogSUdpdEh1YlJlcG9SZWYge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlR2l0SHViQ2xvbmVVcmwoY2xvbmVVcmwpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoXG5cdFx0XHRcdCdwbHVnaW5zQnJvd3NlclVuc3VwcG9ydGVkSG9zdCcsXG5cdFx0XHRcdFwiQWdlbnQgcGx1Z2lucyBpbiB0aGUgYnJvd3NlciBjYW4gb25seSBiZSBpbnN0YWxsZWQgZnJvbSBHaXRIdWIgSFRUUFMgVVJMcy4gVG8gaW5zdGFsbCAnezB9JywgdXNlIHRoZSBkZXNrdG9wIGFwcGxpY2F0aW9uIG9yIGNvbm5lY3QgdG8gYSByZW1vdGUgYWdlbnQgaG9zdC5cIixcblx0XHRcdFx0Y2xvbmVVcmwsXG5cdFx0XHQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnNlZDtcblx0fVxuXG5cdHByaXZhdGUgX21heWJlTG9nVHJhbnNpZW50RXJyb3IoZXJyOiB1bmtub3duLCByZXBvOiBJR2l0SHViUmVwb1JlZik6IHZvaWQge1xuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBHaXRIdWJBdXRoUmVxdWlyZWRFcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQnJvd3NlclBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlXSBHaXRIdWIgYXV0aCByZXF1aXJlZCBmb3IgJHtyZXBvLm93bmVyfS8ke3JlcG8ucmVwb306ICR7ZXJyLm1lc3NhZ2V9YCk7XG5cdFx0fSBlbHNlIGlmIChlcnIgaW5zdGFuY2VvZiBHaXRIdWJSYXRlTGltaXRFcnJvcikge1xuXHRcdFx0Y29uc3Qgd2FpdCA9IGVyci5yZXRyeUFmdGVyU2Vjb25kcyAhPT0gdW5kZWZpbmVkID8gYCAocmV0cnkgYWZ0ZXIgJHtlcnIucmV0cnlBZnRlclNlY29uZHN9cylgIDogJyc7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2VdIEdpdEh1YiByYXRlIGxpbWl0IGhpdCBmb3IgJHtyZXBvLm93bmVyfS8ke3JlcG8ucmVwb30ke3dhaXR9OiAke2Vyci5tZXNzYWdlfWApO1xuXHRcdH0gZWxzZSBpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdC8vIFN1cmZhY2UgdGhlIFVSTCArIGNhdXNlIHNvIG9wYXF1ZSBgVHlwZUVycm9yOiBGYWlsZWQgdG8gZmV0Y2hgIGVycm9yc1xuXHRcdFx0Ly8gKENPUlMsIEROUywgb2ZmbGluZSkgZG9uJ3QgcmVhY2ggdGhlIHVzZXIgd2l0aG91dCBjb250ZXh0LlxuXHRcdFx0Y29uc3QgY2F1c2UgPSBlcnIuY2F1c2UgaW5zdGFuY2VvZiBFcnJvciA/IGAgKGNhdXNlOiAke2Vyci5jYXVzZS5uYW1lfTogJHtlcnIuY2F1c2UubWVzc2FnZX0pYCA6ICcnO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0Jyb3dzZXJQbHVnaW5HaXRDb21tYW5kU2VydmljZV0gQ2xvbmUgZmFpbGVkIGZvciAke3JlcG8ub3duZXJ9LyR7cmVwby5yZXBvfTogJHtlcnIubWVzc2FnZX0ke2NhdXNlfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCZXN0LWVmZm9ydCBzaWxlbnQgbG9va3VwIG9mIGFuIGV4aXN0aW5nIEdpdEh1YiBzZXNzaW9uIHRva2VuLiBSZXR1cm5zXG5cdCAqIGB1bmRlZmluZWRgIHdoZW4gbm8gc2Vzc2lvbiBpcyBhdmFpbGFibGU7IGNhbGxlcnMgZmFsbCBiYWNrIHRvIGFub255bW91cyxcblx0ICogd2hpY2ggc3RpbGwgd29ya3MgZm9yIHB1YmxpYyByZXBvcy4gUHJlZmVycyBhIGByZXBvYC1zY29wZWQgc2Vzc2lvbiB3aGVuXG5cdCAqIG11bHRpcGxlIGFyZSBwcmVzZW50IChlLmcuIEVNVSArIHBlcnNvbmFsKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2xvb2t1cEdpdEh1YlRva2VuKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKCdnaXRodWInLCBbXSwgeyBzaWxlbnQ6IHRydWUgfSk7XG5cdFx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXBvU2NvcGVTZXNzaW9uID0gc2Vzc2lvbnMuZmluZChzZXNzaW9uID0+IHNlc3Npb24uc2NvcGVzLmluY2x1ZGVzKCdyZXBvJykpO1xuXHRcdFx0cmV0dXJuIHJlcG9TY29wZVNlc3Npb24/LmFjY2Vzc1Rva2VuID8/IHNlc3Npb25zWzBdLmFjY2Vzc1Rva2VuO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0Jyb3dzZXJQbHVnaW5HaXRDb21tYW5kU2VydmljZV0gU2lsZW50IEdpdEh1YiBzZXNzaW9uIGxvb2t1cCBmYWlsZWQ6JywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVxdWVzdEdpdEh1YlRva2VuKHJlcG86IElHaXRIdWJSZXBvUmVmKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKCdnaXRodWInLCBbJ3JlcG8nXSwgeyBhY3RpdmF0ZUltbWVkaWF0ZTogdHJ1ZSB9KTtcblx0XHRcdHJldHVybiBzZXNzaW9uLmFjY2Vzc1Rva2VuO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0Jyb3dzZXJQbHVnaW5HaXRDb21tYW5kU2VydmljZV0gR2l0SHViIHNlc3Npb24gcmVxdWVzdCBmYWlsZWQ6JywgZXJyKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0J3BsdWdpbnNCcm93c2VyR2l0SHViU2lnbkluUmVxdWlyZWQnLFxuXHRcdFx0XHRcIlNpZ24gaW4gdG8gR2l0SHViIHdpdGggYW4gYWNjb3VudCB0aGF0IGhhcyBhY2Nlc3MgdG8gJ3swfScgdG8gaW5zdGFsbCB0aGlzIHBsdWdpbi5cIixcblx0XHRcdFx0YCR7cmVwby5vd25lcn0vJHtyZXBvLnJlcG99YCxcblx0XHRcdCkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIG1ldGFkYXRhIGNhY2hlIChJU3RvcmFnZVNlcnZpY2UpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9jYWNoZUtleSh0YXJnZXREaXI6IFVSSSk6IHN0cmluZyB7XG5cdFx0Ly8gTm9ybWFsaXNlIHRyYWlsaW5nIHNsYXNoZXMgLyBwZXJjZW50LWVuY29kaW5nIGNhc2Ugc28gc2VtYW50aWNhbGx5LWVxdWl2YWxlbnQgVVJJcyBoaXQgdGhlIHNhbWUgZW50cnkuXG5cdFx0cmV0dXJuIGdldENvbXBhcmlzb25LZXkodGFyZ2V0RGlyLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BydW5lU3RhbGVFbnRyaWVzKGNhY2hlOiBNYXA8c3RyaW5nLCBJQnJvd3NlclBsdWdpbkNhY2hlRW50cnk+LCBrbm93bkRpcnM6IFJlYWRvbmx5TWFwPHN0cmluZywgVVJJPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEJlc3QtZWZmb3J0IGJhY2tncm91bmQgc3dlZXAgb2YgY2FjaGUgZW50cmllcyB3aG9zZSB0YXJnZXQgZGlyIG5vXG5cdFx0Ly8gbG9uZ2VyIGV4aXN0czsgdGhlIG5leHQgcmVhZCBmb3IgYSByZW1vdmVkIGtleSB3b3VsZCByZS1jbG9uZSBhbnl3YXkuXG5cdFx0Y29uc3QgcmVtb3ZlZDogc3RyaW5nW10gPSBbXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChBcnJheS5mcm9tKGtub3duRGlycywgYXN5bmMgKFtrZXksIHVyaV0pID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmICghKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpKSkge1xuXHRcdFx0XHRcdHJlbW92ZWQucHVzaChrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIC0tIHRyZWF0IGFzIHN0aWxsLXByZXNlbnQgcmF0aGVyIHRoYW4gcmlzayBhIGZhbHNlLXBvc2l0aXZlIHJlbW92YWxcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKHJlbW92ZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIHJlbW92ZWQpIHtcblx0XHRcdGNhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQnJvd3NlclBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlXSBQcnVuZWQgJHtyZW1vdmVkLmxlbmd0aH0gc3RhbGUgY2FjaGUgZW50cmllc2ApO1xuXHRcdHRoaXMuX3BlcnNpc3RDYWNoZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQ2FjaGVMb2FkZWQoKTogTWFwPHN0cmluZywgSUJyb3dzZXJQbHVnaW5DYWNoZUVudHJ5PiB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FjaGU7XG5cdFx0fVxuXHRcdGNvbnN0IGNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIElCcm93c2VyUGx1Z2luQ2FjaGVFbnRyeT4oKTtcblx0XHRjb25zdCBzdG9yZWQgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8SVN0b3JlZEJyb3dzZXJQbHVnaW5DYWNoZT4oQlJPV1NFUl9DQUNIRV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRjb25zdCBrbm93bkRpcnMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRcdGlmIChzdG9yZWQpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgZW50cnldIG9mIE9iamVjdC5lbnRyaWVzKHN0b3JlZCkpIHtcblx0XHRcdFx0aWYgKGVudHJ5ICYmIHR5cGVvZiBlbnRyeS5zaGEgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBlbnRyeS5vd25lciA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGVudHJ5LnJlcG8gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y2FjaGUuc2V0KGtleSwge1xuXHRcdFx0XHRcdFx0b3duZXI6IGVudHJ5Lm93bmVyLFxuXHRcdFx0XHRcdFx0cmVwbzogZW50cnkucmVwbyxcblx0XHRcdFx0XHRcdHJlZjogdHlwZW9mIGVudHJ5LnJlZiA9PT0gJ3N0cmluZycgPyBlbnRyeS5yZWYgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzaGE6IGVudHJ5LnNoYSxcblx0XHRcdFx0XHRcdGZldGNoZWRBdDogdHlwZW9mIGVudHJ5LmZldGNoZWRBdCA9PT0gJ251bWJlcicgPyBlbnRyeS5mZXRjaGVkQXQgOiAwLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRrbm93bkRpcnMuc2V0KGtleSwgVVJJLnBhcnNlKGtleSkpO1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Ly8gaW52YWxpZCBzdG9yZWQga2V5IC0tIGRyb3AgaXQgb24gdGhlIGZsb29yIGF0IG5leHQgcGVyc2lzdFxuXHRcdFx0XHRcdFx0Y2FjaGUuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NhY2hlID0gY2FjaGU7XG5cdFx0Ly8gRmlyZS1hbmQtZm9yZ2V0IHBydW5lIG9mIGRpcnMgdGhhdCBubyBsb25nZXIgZXhpc3Qgb24gZGlzay5cblx0XHRpZiAoa25vd25EaXJzLnNpemUgPiAwKSB7XG5cdFx0XHR0aGlzLl9wcnVuZVN0YWxlRW50cmllcyhjYWNoZSwga25vd25EaXJzKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbQnJvd3NlclBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlXSBDYWNoZSBwcnVuZSBmYWlsZWQ6JywgZXJyKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gY2FjaGU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDYWNoZUVudHJ5KHRhcmdldERpcjogVVJJKTogSUJyb3dzZXJQbHVnaW5DYWNoZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlQ2FjaGVMb2FkZWQoKS5nZXQodGhpcy5fY2FjaGVLZXkodGFyZ2V0RGlyKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDYWNoZUVudHJ5KHRhcmdldERpcjogVVJJLCBlbnRyeTogSUJyb3dzZXJQbHVnaW5DYWNoZUVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgY2FjaGUgPSB0aGlzLl9lbnN1cmVDYWNoZUxvYWRlZCgpO1xuXHRcdGNhY2hlLnNldCh0aGlzLl9jYWNoZUtleSh0YXJnZXREaXIpLCBlbnRyeSk7XG5cdFx0dGhpcy5fcGVyc2lzdENhY2hlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9wZXJzaXN0Q2FjaGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jYWNoZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJpYWxpemVkOiBJU3RvcmVkQnJvd3NlclBsdWdpbkNhY2hlID0ge307XG5cdFx0Zm9yIChjb25zdCBba2V5LCBlbnRyeV0gb2YgdGhpcy5fY2FjaGUpIHtcblx0XHRcdHNlcmlhbGl6ZWRba2V5XSA9IGVudHJ5O1xuXHRcdH1cblx0XHRpZiAoT2JqZWN0LmtleXMoc2VyaWFsaXplZCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoQlJPV1NFUl9DQUNIRV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQlJPV1NFUl9DQUNIRV9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZCksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyw4QkFBOEI7QUFFdkM7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBRUE7QUFBQSxFQUNBO0FBQUEsRUFD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
