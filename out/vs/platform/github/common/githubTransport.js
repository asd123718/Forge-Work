import { LRUCache } from "../../../base/common/map.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { hasKey } from "../../../base/common/types.js";
import { GitHubRateLimitCoordinator } from "./githubRateLimitCoordinator.js";
import { GitHubRequestQueue } from "./githubRequestQueue.js";
import { schedulerDelay, systemGitHubScheduler } from "./githubScheduler.js";
class GitHubRequestError extends Error {
  constructor(message, kind, statusCode, responseBody, graphQLErrors) {
    super(message);
    this.kind = kind;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.graphQLErrors = graphQLErrors;
    this.name = "GitHubRequestError";
  }
}
const defaultApiVersion = "2022-11-28";
const maximumErrorBodyLength = 500;
const maximumRedirects = 5;
class GitHubTransport extends Disposable {
  constructor(fetchFn, _scheduler = systemGitHubScheduler, _allowInsecureLoopbackDownloads = false, _logService) {
    super();
    this._scheduler = _scheduler;
    this._allowInsecureLoopbackDownloads = _allowInsecureLoopbackDownloads;
    this._logService = _logService;
    this._restCache = new LRUCache(500);
    this._redirects = /* @__PURE__ */ new Map();
    this._inFlight = /* @__PURE__ */ new Map();
    this._graphQlInFlight = /* @__PURE__ */ new Map();
    this._fetch = fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this._queue = this._register(new GitHubRequestQueue());
    this._rateLimits = this._register(new GitHubRateLimitCoordinator(_scheduler));
  }
  get rateLimits() {
    return this._rateLimits;
  }
  async rest(account, token, request, signal) {
    const finalUrl = this._redirects.get(request.url) ?? request.url;
    const cacheKey = this._restCacheKey(account, request, finalUrl);
    if (request.method !== "GET") {
      return this._executeRest(account, token, request, signal, cacheKey);
    }
    const coalescingKey = this._restCoalescingKey(account, request, finalUrl);
    let shared = this._inFlight.get(coalescingKey);
    if (!shared) {
      const controller = new AbortController();
      const promise = this._executeRest(account, token, request, controller.signal, cacheKey);
      shared = { controller, promise, waiters: 0 };
      this._inFlight.set(coalescingKey, shared);
      const created = shared;
      void promise.then(
        () => this._deleteRestRequest(coalescingKey, created),
        () => this._deleteRestRequest(coalescingKey, created)
      );
    } else {
      this._logService?.trace(`[GitHubTransport] Reusing REST ${formatRequestUrl(finalUrl)} (waiters: ${shared.waiters + 1})`);
    }
    shared.waiters++;
    try {
      return await this._waitForShared(shared, signal);
    } finally {
      shared.waiters--;
      if (shared.waiters === 0 && this._inFlight.get(coalescingKey) === shared) {
        this._inFlight.delete(coalescingKey);
        this._logService?.trace(`[GitHubTransport] Cancelling REST ${formatRequestUrl(finalUrl)} because all waiters detached`);
        shared.controller.abort(new Error("All GitHub request waiters cancelled"));
      }
    }
  }
  async graphql(account, token, url, query, variables, signal, priority = "interactive") {
    if (/^\s*mutation\b/i.test(query)) {
      return this._executeGraphQL(account, token, url, query, variables, signal, priority);
    }
    return this._graphqlRead(account, token, url, query, variables, signal, priority);
  }
  async download(account, token, request, signal) {
    const priority = request.priority ?? "interactive";
    return this._logRequest("download", formatDownloadUrl(request.url), account, priority, signal, () => this._enqueueWithRateLimit(account, "core", priority, signal, async () => {
      const controller = new AbortController();
      const timeout = this._scheduler.schedule(
        () => controller.abort(new GitHubRequestError("GitHub download timed out", "network")),
        Math.max(0, request.timeout)
      );
      const combinedSignal = AbortSignal.any([signal, controller.signal]);
      try {
        const initialOrigin = new URL(request.url).origin;
        let url = request.url;
        let authenticated = true;
        for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount++) {
          const headers = {
            "Accept": "text/plain, application/octet-stream",
            "Cache-Control": "no-store",
            "X-GitHub-Api-Version": defaultApiVersion
          };
          if (authenticated) {
            headers["Authorization"] = `Bearer ${token}`;
          }
          let response;
          try {
            response = await this._fetch(url, {
              method: "GET",
              cache: "no-store",
              headers,
              signal: combinedSignal,
              redirect: "manual"
            });
          } catch (error) {
            if (combinedSignal.aborted) {
              throw combinedSignal.reason ?? error;
            }
            throw new GitHubRequestError(`GitHub download network request failed: ${String(error)}`, "network");
          }
          this._logService?.trace(`[GitHubTransport] Download request returned HTTP ${response.status}`);
          if (authenticated) {
            this._rateLimits.updateFromResponse(account, response);
          }
          if ([301, 302, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            if (!location) {
              throw new GitHubRequestError("GitHub download redirect was missing a Location header", "malformedResponse", response.status);
            }
            const redirected = new URL(location, url);
            validateDownloadUrl(redirected, this._allowInsecureLoopbackDownloads);
            authenticated = redirected.origin === initialOrigin;
            this._logService?.trace(`[GitHubTransport] Following download redirect to ${formatDownloadUrl(redirected.href)} (authenticated: ${authenticated})`);
            url = redirected.href;
            continue;
          }
          if (!response.ok) {
            const body2 = await response.text();
            throw this._httpError("GitHub download failed", response, body2);
          }
          const body = await readBoundedResponse(response, request.maximumBytes, combinedSignal);
          this._logService?.trace(`[GitHubTransport] Downloaded ${body.bytes.byteLength} byte(s) (truncated: ${body.truncated})`);
          return {
            text: new TextDecoder().decode(body.bytes),
            truncated: body.truncated,
            sourceUrl: url,
            contentType: response.headers.get("content-type") ?? void 0
          };
        }
        throw new GitHubRequestError("GitHub download exceeded the redirect limit", "unknown");
      } finally {
        timeout.dispose();
      }
    }));
  }
  async _graphqlRead(account, token, url, query, variables, signal, priority) {
    const key = `${GitHubRequestQueue.accountKey(account)}\0${url}\0${query}\0${canonicalJson(variables)}`;
    let shared = this._graphQlInFlight.get(key);
    if (!shared) {
      const controller = new AbortController();
      const promise = this._executeGraphQL(account, token, url, query, variables, controller.signal, priority);
      shared = { controller, promise, waiters: 0 };
      this._graphQlInFlight.set(key, shared);
      const created = shared;
      void promise.then(
        () => this._deleteGraphQLRequest(key, created),
        () => this._deleteGraphQLRequest(key, created)
      );
    } else {
      this._logService?.trace(`[GitHubTransport] Reusing GraphQL ${graphQLOperationName(query)} (waiters: ${shared.waiters + 1})`);
    }
    shared.waiters++;
    try {
      return await this._waitForSharedGraphQL(shared, signal);
    } finally {
      shared.waiters--;
      if (shared.waiters === 0 && this._graphQlInFlight.get(key) === shared) {
        this._graphQlInFlight.delete(key);
        this._logService?.trace(`[GitHubTransport] Cancelling GraphQL ${graphQLOperationName(query)} because all waiters detached`);
        shared.controller.abort(new Error("All GitHub GraphQL request waiters cancelled"));
      }
    }
  }
  async _executeGraphQL(account, token, url, query, variables, signal, priority) {
    const operation = graphQLOperationName(query);
    return this._logRequest("GraphQL", operation, account, priority, signal, () => this._enqueueWithRateLimit(account, "graphql", priority, signal, async () => {
      const response = await this._fetchWithRetry(url, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`,
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": defaultApiVersion
        },
        body: JSON.stringify({ query, variables }),
        signal,
        redirect: "manual"
      }, !/^\s*mutation\b/i.test(query));
      this._logService?.trace(`[GitHubTransport] GraphQL ${operation} returned HTTP ${response.status}`);
      const body = response.status === 204 ? "" : await response.text();
      this._rateLimits.updateFromResponse(account, response, body);
      if (!response.ok) {
        throw this._httpError("GitHub GraphQL request failed", response, body);
      }
      const json = this._parseJson(body, "GitHub GraphQL response was not valid JSON");
      const errors = Array.isArray(json.errors) ? json.errors : [];
      const rateLimit = readGraphQLRateLimit(json.data);
      this._rateLimits.updateFromGraphQL(account, rateLimit);
      if (errors.some((error) => error.type === "RATE_LIMITED")) {
        this._rateLimits.markGraphQLRateLimited(account);
      }
      this._logRateLimit(account, "graphql");
      this._logService?.trace(`[GitHubTransport] GraphQL ${operation} returned ${errors.length} error(s)`);
      return { data: json.data, errors, observedAt: this._scheduler.now() };
    }));
  }
  invalidateAccount(account, reason) {
    const accountKey = GitHubRequestQueue.accountKey(account);
    const restRequests = [...this._inFlight.keys()].filter((key) => key.startsWith(`${accountKey}\0`)).length;
    const graphQlRequests = [...this._graphQlInFlight.keys()].filter((key) => key.startsWith(`${accountKey}\0`)).length;
    this._logService?.debug(`[GitHubTransport] Invalidating state for ${account.host} (REST requests: ${restRequests}, GraphQL requests: ${graphQlRequests})`);
    this._queue.cancelAccount(account, reason);
    this._rateLimits.clearAccount(account);
    const cacheKeys = [];
    for (const [key, entry] of this._restCache) {
      if (entry.accountKey === accountKey) {
        cacheKeys.push(key);
      }
    }
    for (const key of cacheKeys) {
      this._restCache.delete(key);
    }
    for (const [key, request] of this._inFlight) {
      if (key.startsWith(`${accountKey}\0`)) {
        this._inFlight.delete(key);
        request.controller.abort(reason);
      }
    }
    for (const [key, request] of this._graphQlInFlight) {
      if (key.startsWith(`${accountKey}\0`)) {
        this._graphQlInFlight.delete(key);
        request.controller.abort(reason);
      }
    }
  }
  clear() {
    this._logService?.debug(`[GitHubTransport] Clearing transport state (cache: ${this._restCache.size}, REST requests: ${this._inFlight.size}, GraphQL requests: ${this._graphQlInFlight.size})`);
    this._restCache.clear();
    this._redirects.clear();
    for (const request of this._inFlight.values()) {
      request.controller.abort(new Error("GitHub transport state was cleared"));
    }
    this._inFlight.clear();
    for (const request of this._graphQlInFlight.values()) {
      request.controller.abort(new Error("GitHub transport state was cleared"));
    }
    this._graphQlInFlight.clear();
  }
  dispose() {
    this.clear();
    super.dispose();
  }
  async _executeRest(account, token, request, signal, cacheKey) {
    const priority = request.priority ?? (request.method === "GET" ? "interactive" : "mutation");
    const operation = `${request.method} ${formatRequestUrl(request.url)}`;
    return this._logRequest("REST", operation, account, priority, signal, () => this._enqueueWithRateLimit(account, "core", priority, signal, async () => {
      const cached = request.etag !== false && !request.unconditional ? this._restCache.get(cacheKey) : void 0;
      if (cached) {
        this._logService?.trace(`[GitHubTransport] Using cached ETag for ${operation}`);
      }
      const headers = {
        "Accept": request.accept ?? "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "Cache-Control": "no-store",
        "X-GitHub-Api-Version": request.apiVersion ?? defaultApiVersion
      };
      if (cached) {
        headers["If-None-Match"] = cached.etag;
      }
      if (request.body !== void 0) {
        headers["Content-Type"] = "application/json";
      }
      const response = await this._fetchRestWithRedirects(account, request.url, {
        method: request.method,
        cache: "no-store",
        headers,
        body: request.body === void 0 ? void 0 : JSON.stringify(request.body),
        signal,
        redirect: "manual"
      }, request.method === "GET");
      this._logService?.trace(`[GitHubTransport] REST ${operation} returned HTTP ${response.status}`);
      const finalUrl = response.url || this._redirects.get(request.url) || request.url;
      const body = response.status === 204 || response.status === 304 ? "" : await response.text();
      this._rateLimits.updateFromResponse(account, response, body);
      this._logRateLimit(account, response.headers.get("x-ratelimit-resource") ?? "core");
      if (response.status === 304) {
        if (!cached || response.headers.get("etag") !== null && response.headers.get("etag") !== cached.etag) {
          throw new GitHubRequestError("GitHub returned 304 without the exact cached representation", "malformedResponse", 304);
        }
        this._logService?.trace(`[GitHubTransport] Reused cached representation for ${operation}`);
        return {
          data: this._parseJson(cached.body, "Cached GitHub response was not valid JSON"),
          statusCode: 304,
          etag: cached.etag,
          finalUrl: cached.finalUrl,
          link: cached.link,
          observedAt: this._scheduler.now()
        };
      }
      if (!response.ok) {
        const requestUrl = new URL(request.url);
        const route = `${requestUrl.pathname.replace(/^\//, "")}${requestUrl.search}`;
        throw this._httpError(`GitHub API request failed: ${request.method} ${route}`, response, body);
      }
      const responseEtag = response.headers.get("etag") ?? void 0;
      const representationVersion = request.representationVersion ?? 1;
      const finalCacheKey = this._restCacheKey(account, request, finalUrl);
      if (request.method === "GET" && request.etag !== false) {
        if (responseEtag) {
          const entry = {
            accountKey: GitHubRequestQueue.accountKey(account),
            etag: responseEtag,
            body,
            finalUrl,
            fetchedAt: this._scheduler.now(),
            link: response.headers.get("link") ?? void 0,
            representationVersion
          };
          this._restCache.set(finalCacheKey, entry);
          this._logService?.trace(`[GitHubTransport] Cached ETag for ${operation}`);
          if (finalCacheKey !== cacheKey) {
            this._restCache.delete(cacheKey);
            this._redirects.set(request.url, finalUrl);
          }
        } else {
          this._restCache.delete(cacheKey);
          this._restCache.delete(finalCacheKey);
        }
      }
      return {
        data: body ? this._parseJson(body, "GitHub response was not valid JSON") : void 0,
        statusCode: response.status,
        etag: responseEtag,
        finalUrl,
        link: response.headers.get("link") ?? void 0,
        observedAt: this._scheduler.now()
      };
    }));
  }
  async _enqueueWithRateLimit(account, resource, priority, signal, task) {
    while (true) {
      const delay = this._rateLimits.getDelay(account, resource);
      if (delay > 0) {
        this._logService?.debug(`[GitHubTransport] Waiting ${delay}ms for ${resource} rate limit on ${account.host}`);
        await this._rateLimits.wait(account, resource, signal);
      }
      const result = await this._queue.enqueue(account, priority, signal, async () => {
        if (this._rateLimits.getDelay(account, resource) > 0) {
          this._logService?.trace(`[GitHubTransport] Requeueing ${resource} request because its rate limit changed`);
          return { blocked: true };
        }
        return { blocked: false, value: await task() };
      });
      if (!result.blocked) {
        return result.value;
      }
    }
  }
  async _fetchRestWithRedirects(account, initialUrl, init, retry) {
    let url = this._redirects.get(initialUrl) ?? initialUrl;
    const initialOrigin = new URL(url).origin;
    for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount++) {
      const response = await this._fetchWithRetry(url, init, retry);
      if (![301, 302, 307, 308].includes(response.status)) {
        if (url !== initialUrl) {
          this._redirects.set(initialUrl, url);
        }
        return response;
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new GitHubRequestError("GitHub redirect was missing a Location header", "malformedResponse", response.status);
      }
      url = new URL(location, url).href;
      if (new URL(url).origin !== initialOrigin) {
        throw new GitHubRequestError("GitHub redirect changed origin", "authorization", response.status);
      }
      this._logService?.trace(`[GitHubTransport] Following REST redirect to ${formatRequestUrl(url)}`);
    }
    throw new GitHubRequestError("GitHub API request exceeded the redirect limit", "unknown");
  }
  async _fetchWithRetry(url, init, retry) {
    let failure;
    for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
      try {
        const response = await this._fetch(url, init);
        if (retry && attempt === 0 && response.status >= 500) {
          this._logService?.debug(`[GitHubTransport] Retrying ${formatRequestUrl(url)} after HTTP ${response.status}`);
          await schedulerDelay(this._scheduler, 100 + this._scheduler.jitter(200), init.signal);
          continue;
        }
        return response;
      } catch (error) {
        if (init.signal.aborted) {
          throw error;
        }
        failure = error;
        if (attempt === 0 && retry) {
          this._logService?.debug(`[GitHubTransport] Retrying ${formatRequestUrl(url)} after a network failure`);
          await schedulerDelay(this._scheduler, 100 + this._scheduler.jitter(200), init.signal);
        }
      }
    }
    throw new GitHubRequestError(`GitHub network request failed: ${String(failure)}`, "network");
  }
  _restCacheKey(account, request, url) {
    return [
      GitHubRequestQueue.accountKey(account),
      request.method,
      url,
      request.accept ?? "application/vnd.github+json",
      request.apiVersion ?? defaultApiVersion,
      request.representationVersion ?? 1
    ].join("\0");
  }
  _restCoalescingKey(account, request, url) {
    return [
      this._restCacheKey(account, request, url),
      request.etag === false ? "etag-disabled" : "etag-enabled",
      request.unconditional === true ? "unconditional" : "conditional"
    ].join("\0");
  }
  _deleteRestRequest(key, request) {
    if (this._inFlight.get(key) === request) {
      this._inFlight.delete(key);
    }
  }
  _deleteGraphQLRequest(key, request) {
    if (this._graphQlInFlight.get(key) === request) {
      this._graphQlInFlight.delete(key);
    }
  }
  _httpError(prefix, response, body) {
    const detail = formatErrorBody(body);
    const message = `${prefix} - ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`;
    return new GitHubRequestError(message, classifyHttpError(response.status, body), response.status, body);
  }
  _parseJson(body, message) {
    try {
      return JSON.parse(body);
    } catch {
      throw new GitHubRequestError(message, "malformedResponse");
    }
  }
  async _logRequest(kind, operation, account, priority, signal, task) {
    const startedAt = this._scheduler.now();
    this._logService?.trace(`[GitHubTransport] ${kind} ${operation} started on ${account.host} (priority: ${priority})`);
    try {
      const result = await task();
      this._logService?.trace(`[GitHubTransport] ${kind} ${operation} completed in ${this._scheduler.now() - startedAt}ms`);
      return result;
    } catch (error) {
      const outcome = signal.aborted ? "cancelled" : "failed";
      this._logService?.debug(`[GitHubTransport] ${kind} ${operation} ${outcome} after ${this._scheduler.now() - startedAt}ms (${transportErrorKind(error)})`);
      throw error;
    }
  }
  _logRateLimit(account, resource) {
    const state = this._rateLimits.getState(account, resource);
    if (state) {
      this._logService?.trace(`[GitHubTransport] Rate limit ${resource} on ${account.host}: remaining=${state.remaining ?? "unknown"}, limit=${state.limit ?? "unknown"}, resetAt=${state.resetAt ?? "unknown"}, blockedUntil=${state.blockedUntil ?? "none"}`);
    }
  }
  _waitForShared(shared, signal) {
    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      void shared.promise.then(
        (response) => {
          signal.removeEventListener("abort", onAbort);
          resolve(response);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        }
      );
    });
  }
  _waitForSharedGraphQL(shared, signal) {
    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      void shared.promise.then(
        (response) => {
          signal.removeEventListener("abort", onAbort);
          resolve(response);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        }
      );
    });
  }
}
function classifyHttpError(statusCode, body) {
  switch (statusCode) {
    case 401:
      return "authentication";
    case 403:
      return body.toLowerCase().includes("rate limit") ? "rateLimit" : "authorization";
    case 404:
      return "notFound";
    case 422:
      return "validation";
    case 429:
      return "rateLimit";
    default:
      return statusCode >= 500 ? "server" : "unknown";
  }
}
function formatErrorBody(body) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return void 0;
  }
  return normalized.length > maximumErrorBodyLength ? `${normalized.substring(0, maximumErrorBodyLength)}...` : normalized;
}
function readGraphQLRateLimit(data) {
  if (!data || typeof data !== "object" || !hasKey(data, { rateLimit: true })) {
    return void 0;
  }
  const rateLimit = Reflect.get(data, "rateLimit");
  if (!rateLimit || typeof rateLimit !== "object") {
    return void 0;
  }
  return {
    limit: readNumber(rateLimit, "limit"),
    remaining: readNumber(rateLimit, "remaining"),
    used: readNumber(rateLimit, "used"),
    resetAt: readString(rateLimit, "resetAt")
  };
}
function readNumber(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "number" ? property : void 0;
}
function readString(value, key) {
  const property = Reflect.get(value, key);
  return typeof property === "string" ? property : void 0;
}
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
function formatRequestUrl(value) {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}
function formatDownloadUrl(value) {
  try {
    return new URL(value).host;
  } catch {
    return "<invalid-url>";
  }
}
function graphQLOperationName(query) {
  return /\b(?:query|mutation)\s+(?<name>[_A-Za-z][_0-9A-Za-z]*)/.exec(query)?.groups?.name ?? "<anonymous>";
}
function transportErrorKind(error) {
  if (error instanceof GitHubRequestError) {
    return `${error.kind}${error.statusCode === void 0 ? "" : `:${error.statusCode}`}`;
  }
  return error instanceof Error ? error.name : typeof error;
}
function validateDownloadUrl(url, allowInsecureLoopback) {
  if (url.protocol === "https:") {
    return;
  }
  if (allowInsecureLoopback && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")) {
    return;
  }
  throw new GitHubRequestError("GitHub download redirect used an unsafe target", "authorization");
}
async function readBoundedResponse(response, maximumBytes, signal) {
  const limit = Math.max(0, maximumBytes);
  if (!response.body) {
    return { bytes: new Uint8Array(), truncated: false };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) {
        throw signal.reason;
      }
      const result = await reader.read();
      if (result.done) {
        break;
      }
      if (length + result.value.byteLength > limit) {
        const remaining = Math.max(0, limit - length);
        if (remaining > 0) {
          chunks.push(result.value.slice(0, remaining));
          length += remaining;
        }
        await reader.cancel();
        return { bytes: concatenateBytes(chunks, length), truncated: true };
      }
      chunks.push(result.value);
      length += result.value.byteLength;
    }
    return { bytes: concatenateBytes(chunks, length), truncated: false };
  } finally {
    reader.releaseLock();
  }
}
function concatenateBytes(chunks, length) {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
export {
  GitHubRequestError,
  GitHubTransport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFxjb21tb25cXGdpdGh1YlRyYW5zcG9ydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBHaXRIdWJBY2NvdW50SGFuZGxlLCBHaXRIdWJGZXRjaCwgR2l0SHViUmVxdWVzdEVycm9yS2luZCwgR2l0SHViUmVxdWVzdFByaW9yaXR5IH0gZnJvbSAnLi9naXRodWJUeXBlcy5qcyc7XG5pbXBvcnQgeyBHaXRIdWJSYXRlTGltaXRDb29yZGluYXRvciB9IGZyb20gJy4vZ2l0aHViUmF0ZUxpbWl0Q29vcmRpbmF0b3IuanMnO1xuaW1wb3J0IHsgR2l0SHViUmVxdWVzdFF1ZXVlIH0gZnJvbSAnLi9naXRodWJSZXF1ZXN0UXVldWUuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlNjaGVkdWxlciwgc2NoZWR1bGVyRGVsYXksIHN5c3RlbUdpdEh1YlNjaGVkdWxlciB9IGZyb20gJy4vZ2l0aHViU2NoZWR1bGVyLmpzJztcblxuZXhwb3J0IHR5cGUgRmV0Y2hGdW5jdGlvbiA9IEdpdEh1YkZldGNoO1xuXG5leHBvcnQgaW50ZXJmYWNlIElHaXRIdWJUcmFuc3BvcnQge1xuXHRyZWFkb25seSByYXRlTGltaXRzOiBHaXRIdWJSYXRlTGltaXRDb29yZGluYXRvcjtcblx0cmVzdDxUPihhY2NvdW50OiBHaXRIdWJBY2NvdW50SGFuZGxlLCB0b2tlbjogc3RyaW5nLCByZXF1ZXN0OiBHaXRIdWJSZXN0UmVxdWVzdCwgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8R2l0SHViUmVzdFJlc3BvbnNlPFQ+Pjtcblx0Z3JhcGhxbDxUPihhY2NvdW50OiBHaXRIdWJBY2NvdW50SGFuZGxlLCB0b2tlbjogc3RyaW5nLCB1cmw6IHN0cmluZywgcXVlcnk6IHN0cmluZywgdmFyaWFibGVzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4sIHNpZ25hbDogQWJvcnRTaWduYWwsIHByaW9yaXR5PzogR2l0SHViUmVxdWVzdFByaW9yaXR5KTogUHJvbWlzZTxHaXRIdWJHcmFwaFFMUmVzcG9uc2U8VD4+O1xuXHRkb3dubG9hZChhY2NvdW50OiBHaXRIdWJBY2NvdW50SGFuZGxlLCB0b2tlbjogc3RyaW5nLCByZXF1ZXN0OiBHaXRIdWJEb3dubG9hZFJlcXVlc3QsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEdpdEh1YkRvd25sb2FkUmVzcG9uc2U+O1xuXHRpbnZhbGlkYXRlQWNjb3VudChhY2NvdW50OiBHaXRIdWJBY2NvdW50SGFuZGxlLCByZWFzb24/OiB1bmtub3duKTogdm9pZDtcblx0Y2xlYXIoKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHaXRIdWJHcmFwaFFMRXJyb3Ige1xuXHRyZWFkb25seSBtZXNzYWdlPzogc3RyaW5nO1xuXHRyZWFkb25seSB0eXBlPzogc3RyaW5nO1xuXHRyZWFkb25seSBwYXRoPzogcmVhZG9ubHkgKHN0cmluZyB8IG51bWJlcilbXTtcblx0cmVhZG9ubHkgZXh0ZW5zaW9ucz86IHtcblx0XHRyZWFkb25seSBjb2RlPzogc3RyaW5nO1xuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgR2l0SHViUmVxdWVzdEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1lc3NhZ2U6IHN0cmluZyxcblx0XHRyZWFkb25seSBraW5kOiBHaXRIdWJSZXF1ZXN0RXJyb3JLaW5kLFxuXHRcdHJlYWRvbmx5IHN0YXR1c0NvZGU/OiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgcmVzcG9uc2VCb2R5Pzogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGdyYXBoUUxFcnJvcnM/OiByZWFkb25seSBHaXRIdWJHcmFwaFFMRXJyb3JbXSxcblx0KSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdFx0dGhpcy5uYW1lID0gJ0dpdEh1YlJlcXVlc3RFcnJvcic7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBHaXRIdWJSZXN0UmVxdWVzdCB7XG5cdHJlYWRvbmx5IG1ldGhvZDogJ0dFVCcgfCAnUE9TVCcgfCAnUFVUJyB8ICdQQVRDSCcgfCAnREVMRVRFJztcblx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJvZHk/OiBvYmplY3Q7XG5cdHJlYWRvbmx5IGFjY2VwdD86IHN0cmluZztcblx0cmVhZG9ubHkgYXBpVmVyc2lvbj86IHN0cmluZztcblx0cmVhZG9ubHkgcmVwcmVzZW50YXRpb25WZXJzaW9uPzogbnVtYmVyO1xuXHRyZWFkb25seSBldGFnPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdW5jb25kaXRpb25hbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHByaW9yaXR5PzogR2l0SHViUmVxdWVzdFByaW9yaXR5O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdpdEh1YlJlc3RSZXNwb25zZTxUPiB7XG5cdHJlYWRvbmx5IGRhdGE6IFQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHN0YXR1c0NvZGU6IG51bWJlcjtcblx0cmVhZG9ubHkgZXRhZz86IHN0cmluZztcblx0cmVhZG9ubHkgZmluYWxVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgbGluaz86IHN0cmluZztcblx0cmVhZG9ubHkgb2JzZXJ2ZWRBdDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdpdEh1YkdyYXBoUUxSZXNwb25zZTxUPiB7XG5cdHJlYWRvbmx5IGRhdGE6IFQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGVycm9yczogcmVhZG9ubHkgR2l0SHViR3JhcGhRTEVycm9yW107XG5cdHJlYWRvbmx5IG9ic2VydmVkQXQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHaXRIdWJEb3dubG9hZFJlcXVlc3Qge1xuXHRyZWFkb25seSB1cmw6IHN0cmluZztcblx0cmVhZG9ubHkgbWF4aW11bUJ5dGVzOiBudW1iZXI7XG5cdHJlYWRvbmx5IHRpbWVvdXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgcHJpb3JpdHk/OiBHaXRIdWJSZXF1ZXN0UHJpb3JpdHk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2l0SHViRG93bmxvYWRSZXNwb25zZSB7XG5cdHJlYWRvbmx5IHRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgdHJ1bmNhdGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBzb3VyY2VVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudFR5cGU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmVzdENhY2hlRW50cnkge1xuXHRyZWFkb25seSBhY2NvdW50S2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV0YWc6IHN0cmluZztcblx0cmVhZG9ubHkgYm9keTogc3RyaW5nO1xuXHRyZWFkb25seSBmaW5hbFVybDogc3RyaW5nO1xuXHRyZWFkb25seSBmZXRjaGVkQXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbGluaz86IHN0cmluZztcblx0cmVhZG9ubHkgcmVwcmVzZW50YXRpb25WZXJzaW9uOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJU2hhcmVkUmVxdWVzdCB7XG5cdHJlYWRvbmx5IGNvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcjtcblx0cmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxHaXRIdWJSZXN0UmVzcG9uc2U8dW5rbm93bj4+O1xuXHR3YWl0ZXJzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJU2hhcmVkR3JhcGhRTFJlcXVlc3Qge1xuXHRyZWFkb25seSBjb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXI7XG5cdHJlYWRvbmx5IHByb21pc2U6IFByb21pc2U8R2l0SHViR3JhcGhRTFJlc3BvbnNlPHVua25vd24+Pjtcblx0d2FpdGVyczogbnVtYmVyO1xufVxuXG50eXBlIFJhdGVMaW1pdFF1ZXVlUmVzdWx0PFQ+ID0geyByZWFkb25seSBibG9ja2VkOiB0cnVlIH0gfCB7IHJlYWRvbmx5IGJsb2NrZWQ6IGZhbHNlOyByZWFkb25seSB2YWx1ZTogVCB9O1xuXG5jb25zdCBkZWZhdWx0QXBpVmVyc2lvbiA9ICcyMDIyLTExLTI4JztcbmNvbnN0IG1heGltdW1FcnJvckJvZHlMZW5ndGggPSA1MDA7XG5jb25zdCBtYXhpbXVtUmVkaXJlY3RzID0gNTtcblxuZXhwb3J0IGNsYXNzIEdpdEh1YlRyYW5zcG9ydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJR2l0SHViVHJhbnNwb3J0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mZXRjaDogRmV0Y2hGdW5jdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVldWU6IEdpdEh1YlJlcXVlc3RRdWV1ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmF0ZUxpbWl0czogR2l0SHViUmF0ZUxpbWl0Q29vcmRpbmF0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3RDYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIElSZXN0Q2FjaGVFbnRyeT4oNTAwKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVkaXJlY3RzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5GbGlnaHQgPSBuZXcgTWFwPHN0cmluZywgSVNoYXJlZFJlcXVlc3Q+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dyYXBoUWxJbkZsaWdodCA9IG5ldyBNYXA8c3RyaW5nLCBJU2hhcmVkR3JhcGhRTFJlcXVlc3Q+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZmV0Y2hGbjogRmV0Y2hGdW5jdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZXI6IElHaXRIdWJTY2hlZHVsZXIgPSBzeXN0ZW1HaXRIdWJTY2hlZHVsZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWxsb3dJbnNlY3VyZUxvb3BiYWNrRG93bmxvYWRzID0gZmFsc2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZT86IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2ZldGNoID0gZmV0Y2hGbiA/PyAoKGlucHV0LCBpbml0KSA9PiBnbG9iYWxUaGlzLmZldGNoKGlucHV0LCBpbml0KSk7XG5cdFx0dGhpcy5fcXVldWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgR2l0SHViUmVxdWVzdFF1ZXVlKCkpO1xuXHRcdHRoaXMuX3JhdGVMaW1pdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgR2l0SHViUmF0ZUxpbWl0Q29vcmRpbmF0b3IoX3NjaGVkdWxlcikpO1xuXHR9XG5cblx0Z2V0IHJhdGVMaW1pdHMoKTogR2l0SHViUmF0ZUxpbWl0Q29vcmRpbmF0b3Ige1xuXHRcdHJldHVybiB0aGlzLl9yYXRlTGltaXRzO1xuXHR9XG5cblx0YXN5bmMgcmVzdDxUPihhY2NvdW50OiBHaXRIdWJBY2NvdW50SGFuZGxlLCB0b2tlbjogc3RyaW5nLCByZXF1ZXN0OiBHaXRIdWJSZXN0UmVxdWVzdCwgc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8R2l0SHViUmVzdFJlc3BvbnNlPFQ+PiB7XG5cdFx0Y29uc3QgZmluYWxVcmwgPSB0aGlzLl9yZWRpcmVjdHMuZ2V0KHJlcXVlc3QudXJsKSA/PyByZXF1ZXN0LnVybDtcblx0XHRjb25zdCBjYWNoZUtleSA9IHRoaXMuX3Jlc3RDYWNoZUtleShhY2NvdW50LCByZXF1ZXN0LCBmaW5hbFVybCk7XG5cdFx0aWYgKHJlcXVlc3QubWV0aG9kICE9PSAnR0VUJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVSZXN0PFQ+KGFjY291bnQsIHRva2VuLCByZXF1ZXN0LCBzaWduYWwsIGNhY2hlS2V5KTtcblx0XHR9XG5cblx0XHRjb25zdCBjb2FsZXNjaW5nS2V5ID0gdGhpcy5fcmVzdENvYWxlc2NpbmdLZXkoYWNjb3VudCwgcmVxdWVzdCwgZmluYWxVcmwpO1xuXHRcdGxldCBzaGFyZWQgPSB0aGlzLl9pbkZsaWdodC5nZXQoY29hbGVzY2luZ0tleSk7XG5cdFx0aWYgKCFzaGFyZWQpIHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5fZXhlY3V0ZVJlc3Q8dW5rbm93bj4oYWNjb3VudCwgdG9rZW4sIHJlcXVlc3QsIGNvbnRyb2xsZXIuc2lnbmFsLCBjYWNoZUtleSk7XG5cdFx0XHRzaGFyZWQgPSB7IGNvbnRyb2xsZXIsIHByb21pc2UsIHdhaXRlcnM6IDAgfTtcblx0XHRcdHRoaXMuX2luRmxpZ2h0LnNldChjb2FsZXNjaW5nS2V5LCBzaGFyZWQpO1xuXHRcdFx0Y29uc3QgY3JlYXRlZCA9IHNoYXJlZDtcblx0XHRcdHZvaWQgcHJvbWlzZS50aGVuKFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9kZWxldGVSZXN0UmVxdWVzdChjb2FsZXNjaW5nS2V5LCBjcmVhdGVkKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fZGVsZXRlUmVzdFJlcXVlc3QoY29hbGVzY2luZ0tleSwgY3JlYXRlZCksXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlPy50cmFjZShgW0dpdEh1YlRyYW5zcG9ydF0gUmV1c2luZyBSRVNUICR7Zm9ybWF0UmVxdWVzdFVybChmaW5hbFVybCl9ICh3YWl0ZXJzOiAke3NoYXJlZC53YWl0ZXJzICsgMX0pYCk7XG5cdFx0fVxuXHRcdHNoYXJlZC53YWl0ZXJzKys7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl93YWl0Rm9yU2hhcmVkPFQ+KHNoYXJlZCwgc2lnbmFsKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2hhcmVkLndhaXRlcnMtLTtcblx0XHRcdGlmIChzaGFyZWQud2FpdGVycyA9PT0gMCAmJiB0aGlzLl9pbkZsaWdodC5nZXQoY29hbGVzY2luZ0tleSkgPT09IHNoYXJlZCkge1xuXHRcdFx0XHR0aGlzLl9pbkZsaWdodC5kZWxldGUoY29hbGVzY2luZ0tleSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSBDYW5jZWxsaW5nIFJFU1QgJHtmb3JtYXRSZXF1ZXN0VXJsKGZpbmFsVXJsKX0gYmVjYXVzZSBhbGwgd2FpdGVycyBkZXRhY2hlZGApO1xuXHRcdFx0XHRzaGFyZWQuY29udHJvbGxlci5hYm9ydChuZXcgRXJyb3IoJ0FsbCBHaXRIdWIgcmVxdWVzdCB3YWl0ZXJzIGNhbmNlbGxlZCcpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBncmFwaHFsPFQ+KFxuXHRcdGFjY291bnQ6IEdpdEh1YkFjY291bnRIYW5kbGUsXG5cdFx0dG9rZW46IHN0cmluZyxcblx0XHR1cmw6IHN0cmluZyxcblx0XHRxdWVyeTogc3RyaW5nLFxuXHRcdHZhcmlhYmxlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+LFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0cHJpb3JpdHk6IEdpdEh1YlJlcXVlc3RQcmlvcml0eSA9ICdpbnRlcmFjdGl2ZScsXG5cdCk6IFByb21pc2U8R2l0SHViR3JhcGhRTFJlc3BvbnNlPFQ+PiB7XG5cdFx0aWYgKC9eXFxzKm11dGF0aW9uXFxiL2kudGVzdChxdWVyeSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9leGVjdXRlR3JhcGhRTDxUPihhY2NvdW50LCB0b2tlbiwgdXJsLCBxdWVyeSwgdmFyaWFibGVzLCBzaWduYWwsIHByaW9yaXR5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dyYXBocWxSZWFkKGFjY291bnQsIHRva2VuLCB1cmwsIHF1ZXJ5LCB2YXJpYWJsZXMsIHNpZ25hbCwgcHJpb3JpdHkpO1xuXHR9XG5cblx0YXN5bmMgZG93bmxvYWQoXG5cdFx0YWNjb3VudDogR2l0SHViQWNjb3VudEhhbmRsZSxcblx0XHR0b2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IEdpdEh1YkRvd25sb2FkUmVxdWVzdCxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHQpOiBQcm9taXNlPEdpdEh1YkRvd25sb2FkUmVzcG9uc2U+IHtcblx0XHRjb25zdCBwcmlvcml0eSA9IHJlcXVlc3QucHJpb3JpdHkgPz8gJ2ludGVyYWN0aXZlJztcblx0XHRyZXR1cm4gdGhpcy5fbG9nUmVxdWVzdCgnZG93bmxvYWQnLCBmb3JtYXREb3dubG9hZFVybChyZXF1ZXN0LnVybCksIGFjY291bnQsIHByaW9yaXR5LCBzaWduYWwsICgpID0+IHRoaXMuX2VucXVldWVXaXRoUmF0ZUxpbWl0KGFjY291bnQsICdjb3JlJywgcHJpb3JpdHksIHNpZ25hbCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSB0aGlzLl9zY2hlZHVsZXIuc2NoZWR1bGUoXG5cdFx0XHRcdCgpID0+IGNvbnRyb2xsZXIuYWJvcnQobmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIGRvd25sb2FkIHRpbWVkIG91dCcsICduZXR3b3JrJykpLFxuXHRcdFx0XHRNYXRoLm1heCgwLCByZXF1ZXN0LnRpbWVvdXQpLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGNvbWJpbmVkU2lnbmFsID0gQWJvcnRTaWduYWwuYW55KFtzaWduYWwsIGNvbnRyb2xsZXIuc2lnbmFsXSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbml0aWFsT3JpZ2luID0gbmV3IFVSTChyZXF1ZXN0LnVybCkub3JpZ2luO1xuXHRcdFx0XHRsZXQgdXJsID0gcmVxdWVzdC51cmw7XG5cdFx0XHRcdGxldCBhdXRoZW50aWNhdGVkID0gdHJ1ZTtcblx0XHRcdFx0Zm9yIChsZXQgcmVkaXJlY3RDb3VudCA9IDA7IHJlZGlyZWN0Q291bnQgPD0gbWF4aW11bVJlZGlyZWN0czsgcmVkaXJlY3RDb3VudCsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRcdFx0XHRcdCdBY2NlcHQnOiAndGV4dC9wbGFpbiwgYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJyxcblx0XHRcdFx0XHRcdCdDYWNoZS1Db250cm9sJzogJ25vLXN0b3JlJyxcblx0XHRcdFx0XHRcdCdYLUdpdEh1Yi1BcGktVmVyc2lvbic6IGRlZmF1bHRBcGlWZXJzaW9uLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKGF1dGhlbnRpY2F0ZWQpIHtcblx0XHRcdFx0XHRcdGhlYWRlcnNbJ0F1dGhvcml6YXRpb24nXSA9IGBCZWFyZXIgJHt0b2tlbn1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgcmVzcG9uc2U6IFJlc3BvbnNlO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRyZXNwb25zZSA9IGF3YWl0IHRoaXMuX2ZldGNoKHVybCwge1xuXHRcdFx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdFx0XHRjYWNoZTogJ25vLXN0b3JlJyxcblx0XHRcdFx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0XHRcdFx0c2lnbmFsOiBjb21iaW5lZFNpZ25hbCxcblx0XHRcdFx0XHRcdFx0cmVkaXJlY3Q6ICdtYW51YWwnLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGlmIChjb21iaW5lZFNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IGNvbWJpbmVkU2lnbmFsLnJlYXNvbiA/PyBlcnJvcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoYEdpdEh1YiBkb3dubG9hZCBuZXR3b3JrIHJlcXVlc3QgZmFpbGVkOiAke1N0cmluZyhlcnJvcil9YCwgJ25ldHdvcmsnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZT8udHJhY2UoYFtHaXRIdWJUcmFuc3BvcnRdIERvd25sb2FkIHJlcXVlc3QgcmV0dXJuZWQgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c31gKTtcblx0XHRcdFx0XHRpZiAoYXV0aGVudGljYXRlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmF0ZUxpbWl0cy51cGRhdGVGcm9tUmVzcG9uc2UoYWNjb3VudCwgcmVzcG9uc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoWzMwMSwgMzAyLCAzMDcsIDMwOF0uaW5jbHVkZXMocmVzcG9uc2Uuc3RhdHVzKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSByZXNwb25zZS5oZWFkZXJzLmdldCgnbG9jYXRpb24nKTtcblx0XHRcdFx0XHRcdGlmICghbG9jYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIGRvd25sb2FkIHJlZGlyZWN0IHdhcyBtaXNzaW5nIGEgTG9jYXRpb24gaGVhZGVyJywgJ21hbGZvcm1lZFJlc3BvbnNlJywgcmVzcG9uc2Uuc3RhdHVzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHJlZGlyZWN0ZWQgPSBuZXcgVVJMKGxvY2F0aW9uLCB1cmwpO1xuXHRcdFx0XHRcdFx0dmFsaWRhdGVEb3dubG9hZFVybChyZWRpcmVjdGVkLCB0aGlzLl9hbGxvd0luc2VjdXJlTG9vcGJhY2tEb3dubG9hZHMpO1xuXHRcdFx0XHRcdFx0YXV0aGVudGljYXRlZCA9IHJlZGlyZWN0ZWQub3JpZ2luID09PSBpbml0aWFsT3JpZ2luO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZT8udHJhY2UoYFtHaXRIdWJUcmFuc3BvcnRdIEZvbGxvd2luZyBkb3dubG9hZCByZWRpcmVjdCB0byAke2Zvcm1hdERvd25sb2FkVXJsKHJlZGlyZWN0ZWQuaHJlZil9IChhdXRoZW50aWNhdGVkOiAke2F1dGhlbnRpY2F0ZWR9KWApO1xuXHRcdFx0XHRcdFx0dXJsID0gcmVkaXJlY3RlZC5ocmVmO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdFx0XHRcdFx0XHR0aHJvdyB0aGlzLl9odHRwRXJyb3IoJ0dpdEh1YiBkb3dubG9hZCBmYWlsZWQnLCByZXNwb25zZSwgYm9keSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCByZWFkQm91bmRlZFJlc3BvbnNlKHJlc3BvbnNlLCByZXF1ZXN0Lm1heGltdW1CeXRlcywgY29tYmluZWRTaWduYWwpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSBEb3dubG9hZGVkICR7Ym9keS5ieXRlcy5ieXRlTGVuZ3RofSBieXRlKHMpICh0cnVuY2F0ZWQ6ICR7Ym9keS50cnVuY2F0ZWR9KWApO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0ZXh0OiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYm9keS5ieXRlcyksXG5cdFx0XHRcdFx0XHR0cnVuY2F0ZWQ6IGJvZHkudHJ1bmNhdGVkLFxuXHRcdFx0XHRcdFx0c291cmNlVXJsOiB1cmwsXG5cdFx0XHRcdFx0XHRjb250ZW50VHlwZTogcmVzcG9uc2UuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiBkb3dubG9hZCBleGNlZWRlZCB0aGUgcmVkaXJlY3QgbGltaXQnLCAndW5rbm93bicpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGltZW91dC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgX2dyYXBocWxSZWFkPFQ+KFxuXHRcdGFjY291bnQ6IEdpdEh1YkFjY291bnRIYW5kbGUsXG5cdFx0dG9rZW46IHN0cmluZyxcblx0XHR1cmw6IHN0cmluZyxcblx0XHRxdWVyeTogc3RyaW5nLFxuXHRcdHZhcmlhYmxlczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+LFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0cHJpb3JpdHk6IEdpdEh1YlJlcXVlc3RQcmlvcml0eSxcblx0KTogUHJvbWlzZTxHaXRIdWJHcmFwaFFMUmVzcG9uc2U8VD4+IHtcblx0XHRjb25zdCBrZXkgPSBgJHtHaXRIdWJSZXF1ZXN0UXVldWUuYWNjb3VudEtleShhY2NvdW50KX1cXHgwMCR7dXJsfVxceDAwJHtxdWVyeX1cXHgwMCR7Y2Fub25pY2FsSnNvbih2YXJpYWJsZXMpfWA7XG5cdFx0bGV0IHNoYXJlZCA9IHRoaXMuX2dyYXBoUWxJbkZsaWdodC5nZXQoa2V5KTtcblx0XHRpZiAoIXNoYXJlZCkge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLl9leGVjdXRlR3JhcGhRTDx1bmtub3duPihhY2NvdW50LCB0b2tlbiwgdXJsLCBxdWVyeSwgdmFyaWFibGVzLCBjb250cm9sbGVyLnNpZ25hbCwgcHJpb3JpdHkpO1xuXHRcdFx0c2hhcmVkID0geyBjb250cm9sbGVyLCBwcm9taXNlLCB3YWl0ZXJzOiAwIH07XG5cdFx0XHR0aGlzLl9ncmFwaFFsSW5GbGlnaHQuc2V0KGtleSwgc2hhcmVkKTtcblx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBzaGFyZWQ7XG5cdFx0XHR2b2lkIHByb21pc2UudGhlbihcblx0XHRcdFx0KCkgPT4gdGhpcy5fZGVsZXRlR3JhcGhRTFJlcXVlc3Qoa2V5LCBjcmVhdGVkKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fZGVsZXRlR3JhcGhRTFJlcXVlc3Qoa2V5LCBjcmVhdGVkKSxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSBSZXVzaW5nIEdyYXBoUUwgJHtncmFwaFFMT3BlcmF0aW9uTmFtZShxdWVyeSl9ICh3YWl0ZXJzOiAke3NoYXJlZC53YWl0ZXJzICsgMX0pYCk7XG5cdFx0fVxuXHRcdHNoYXJlZC53YWl0ZXJzKys7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl93YWl0Rm9yU2hhcmVkR3JhcGhRTDxUPihzaGFyZWQsIHNpZ25hbCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNoYXJlZC53YWl0ZXJzLS07XG5cdFx0XHRpZiAoc2hhcmVkLndhaXRlcnMgPT09IDAgJiYgdGhpcy5fZ3JhcGhRbEluRmxpZ2h0LmdldChrZXkpID09PSBzaGFyZWQpIHtcblx0XHRcdFx0dGhpcy5fZ3JhcGhRbEluRmxpZ2h0LmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlPy50cmFjZShgW0dpdEh1YlRyYW5zcG9ydF0gQ2FuY2VsbGluZyBHcmFwaFFMICR7Z3JhcGhRTE9wZXJhdGlvbk5hbWUocXVlcnkpfSBiZWNhdXNlIGFsbCB3YWl0ZXJzIGRldGFjaGVkYCk7XG5cdFx0XHRcdHNoYXJlZC5jb250cm9sbGVyLmFib3J0KG5ldyBFcnJvcignQWxsIEdpdEh1YiBHcmFwaFFMIHJlcXVlc3Qgd2FpdGVycyBjYW5jZWxsZWQnKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZUdyYXBoUUw8VD4oXG5cdFx0YWNjb3VudDogR2l0SHViQWNjb3VudEhhbmRsZSxcblx0XHR0b2tlbjogc3RyaW5nLFxuXHRcdHVybDogc3RyaW5nLFxuXHRcdHF1ZXJ5OiBzdHJpbmcsXG5cdFx0dmFyaWFibGVzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4sXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0XHRwcmlvcml0eTogR2l0SHViUmVxdWVzdFByaW9yaXR5LFxuXHQpOiBQcm9taXNlPEdpdEh1YkdyYXBoUUxSZXNwb25zZTxUPj4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IGdyYXBoUUxPcGVyYXRpb25OYW1lKHF1ZXJ5KTtcblx0XHRyZXR1cm4gdGhpcy5fbG9nUmVxdWVzdCgnR3JhcGhRTCcsIG9wZXJhdGlvbiwgYWNjb3VudCwgcHJpb3JpdHksIHNpZ25hbCwgKCkgPT4gdGhpcy5fZW5xdWV1ZVdpdGhSYXRlTGltaXQoYWNjb3VudCwgJ2dyYXBocWwnLCBwcmlvcml0eSwgc2lnbmFsLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2ZldGNoV2l0aFJldHJ5KHVybCwge1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0Y2FjaGU6ICduby1zdG9yZScsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3Rva2VufWAsXG5cdFx0XHRcdFx0J0NhY2hlLUNvbnRyb2wnOiAnbm8tc3RvcmUnLFxuXHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0J1gtR2l0SHViLUFwaS1WZXJzaW9uJzogZGVmYXVsdEFwaVZlcnNpb24sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcXVlcnksIHZhcmlhYmxlcyB9KSxcblx0XHRcdFx0c2lnbmFsLFxuXHRcdFx0XHRyZWRpcmVjdDogJ21hbnVhbCcsXG5cdFx0XHR9LCAhL15cXHMqbXV0YXRpb25cXGIvaS50ZXN0KHF1ZXJ5KSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlPy50cmFjZShgW0dpdEh1YlRyYW5zcG9ydF0gR3JhcGhRTCAke29wZXJhdGlvbn0gcmV0dXJuZWQgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c31gKTtcblx0XHRcdGNvbnN0IGJvZHkgPSByZXNwb25zZS5zdGF0dXMgPT09IDIwNCA/ICcnIDogYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0dGhpcy5fcmF0ZUxpbWl0cy51cGRhdGVGcm9tUmVzcG9uc2UoYWNjb3VudCwgcmVzcG9uc2UsIGJvZHkpO1xuXHRcdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0XHR0aHJvdyB0aGlzLl9odHRwRXJyb3IoJ0dpdEh1YiBHcmFwaFFMIHJlcXVlc3QgZmFpbGVkJywgcmVzcG9uc2UsIGJvZHkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QganNvbiA9IHRoaXMuX3BhcnNlSnNvbjx7IGRhdGE/OiBUOyBlcnJvcnM/OiByZWFkb25seSBHaXRIdWJHcmFwaFFMRXJyb3JbXSB9Pihib2R5LCAnR2l0SHViIEdyYXBoUUwgcmVzcG9uc2Ugd2FzIG5vdCB2YWxpZCBKU09OJyk7XG5cdFx0XHRjb25zdCBlcnJvcnMgPSBBcnJheS5pc0FycmF5KGpzb24uZXJyb3JzKSA/IGpzb24uZXJyb3JzIDogW107XG5cdFx0XHRjb25zdCByYXRlTGltaXQgPSByZWFkR3JhcGhRTFJhdGVMaW1pdChqc29uLmRhdGEpO1xuXHRcdFx0dGhpcy5fcmF0ZUxpbWl0cy51cGRhdGVGcm9tR3JhcGhRTChhY2NvdW50LCByYXRlTGltaXQpO1xuXHRcdFx0aWYgKGVycm9ycy5zb21lKGVycm9yID0+IGVycm9yLnR5cGUgPT09ICdSQVRFX0xJTUlURUQnKSkge1xuXHRcdFx0XHR0aGlzLl9yYXRlTGltaXRzLm1hcmtHcmFwaFFMUmF0ZUxpbWl0ZWQoYWNjb3VudCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dSYXRlTGltaXQoYWNjb3VudCwgJ2dyYXBocWwnKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSBHcmFwaFFMICR7b3BlcmF0aW9ufSByZXR1cm5lZCAke2Vycm9ycy5sZW5ndGh9IGVycm9yKHMpYCk7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiBqc29uLmRhdGEsIGVycm9ycywgb2JzZXJ2ZWRBdDogdGhpcy5fc2NoZWR1bGVyLm5vdygpIH07XG5cdFx0fSkpO1xuXHR9XG5cblx0aW52YWxpZGF0ZUFjY291bnQoYWNjb3VudDogR2l0SHViQWNjb3VudEhhbmRsZSwgcmVhc29uPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGFjY291bnRLZXkgPSBHaXRIdWJSZXF1ZXN0UXVldWUuYWNjb3VudEtleShhY2NvdW50KTtcblx0XHRjb25zdCByZXN0UmVxdWVzdHMgPSBbLi4udGhpcy5faW5GbGlnaHQua2V5cygpXS5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKGAke2FjY291bnRLZXl9XFx4MDBgKSkubGVuZ3RoO1xuXHRcdGNvbnN0IGdyYXBoUWxSZXF1ZXN0cyA9IFsuLi50aGlzLl9ncmFwaFFsSW5GbGlnaHQua2V5cygpXS5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKGAke2FjY291bnRLZXl9XFx4MDBgKSkubGVuZ3RoO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2U/LmRlYnVnKGBbR2l0SHViVHJhbnNwb3J0XSBJbnZhbGlkYXRpbmcgc3RhdGUgZm9yICR7YWNjb3VudC5ob3N0fSAoUkVTVCByZXF1ZXN0czogJHtyZXN0UmVxdWVzdHN9LCBHcmFwaFFMIHJlcXVlc3RzOiAke2dyYXBoUWxSZXF1ZXN0c30pYCk7XG5cdFx0dGhpcy5fcXVldWUuY2FuY2VsQWNjb3VudChhY2NvdW50LCByZWFzb24pO1xuXHRcdHRoaXMuX3JhdGVMaW1pdHMuY2xlYXJBY2NvdW50KGFjY291bnQpO1xuXHRcdGNvbnN0IGNhY2hlS2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIGVudHJ5XSBvZiB0aGlzLl9yZXN0Q2FjaGUpIHtcblx0XHRcdGlmIChlbnRyeS5hY2NvdW50S2V5ID09PSBhY2NvdW50S2V5KSB7XG5cdFx0XHRcdGNhY2hlS2V5cy5wdXNoKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIGNhY2hlS2V5cykge1xuXHRcdFx0dGhpcy5fcmVzdENhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFtrZXksIHJlcXVlc3RdIG9mIHRoaXMuX2luRmxpZ2h0KSB7XG5cdFx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgoYCR7YWNjb3VudEtleX1cXHgwMGApKSB7XG5cdFx0XHRcdHRoaXMuX2luRmxpZ2h0LmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRyZXF1ZXN0LmNvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBba2V5LCByZXF1ZXN0XSBvZiB0aGlzLl9ncmFwaFFsSW5GbGlnaHQpIHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChgJHthY2NvdW50S2V5fVxceDAwYCkpIHtcblx0XHRcdFx0dGhpcy5fZ3JhcGhRbEluRmxpZ2h0LmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRyZXF1ZXN0LmNvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlPy5kZWJ1ZyhgW0dpdEh1YlRyYW5zcG9ydF0gQ2xlYXJpbmcgdHJhbnNwb3J0IHN0YXRlIChjYWNoZTogJHt0aGlzLl9yZXN0Q2FjaGUuc2l6ZX0sIFJFU1QgcmVxdWVzdHM6ICR7dGhpcy5faW5GbGlnaHQuc2l6ZX0sIEdyYXBoUUwgcmVxdWVzdHM6ICR7dGhpcy5fZ3JhcGhRbEluRmxpZ2h0LnNpemV9KWApO1xuXHRcdHRoaXMuX3Jlc3RDYWNoZS5jbGVhcigpO1xuXHRcdHRoaXMuX3JlZGlyZWN0cy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiB0aGlzLl9pbkZsaWdodC52YWx1ZXMoKSkge1xuXHRcdFx0cmVxdWVzdC5jb250cm9sbGVyLmFib3J0KG5ldyBFcnJvcignR2l0SHViIHRyYW5zcG9ydCBzdGF0ZSB3YXMgY2xlYXJlZCcpKTtcblx0XHR9XG5cdFx0dGhpcy5faW5GbGlnaHQuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgdGhpcy5fZ3JhcGhRbEluRmxpZ2h0LnZhbHVlcygpKSB7XG5cdFx0XHRyZXF1ZXN0LmNvbnRyb2xsZXIuYWJvcnQobmV3IEVycm9yKCdHaXRIdWIgdHJhbnNwb3J0IHN0YXRlIHdhcyBjbGVhcmVkJykpO1xuXHRcdH1cblx0XHR0aGlzLl9ncmFwaFFsSW5GbGlnaHQuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4ZWN1dGVSZXN0PFQ+KFxuXHRcdGFjY291bnQ6IEdpdEh1YkFjY291bnRIYW5kbGUsXG5cdFx0dG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBHaXRIdWJSZXN0UmVxdWVzdCxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHRcdGNhY2hlS2V5OiBzdHJpbmcsXG5cdCk6IFByb21pc2U8R2l0SHViUmVzdFJlc3BvbnNlPFQ+PiB7XG5cdFx0Y29uc3QgcHJpb3JpdHkgPSByZXF1ZXN0LnByaW9yaXR5ID8/IChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ0dFVCcgPyAnaW50ZXJhY3RpdmUnIDogJ211dGF0aW9uJyk7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gYCR7cmVxdWVzdC5tZXRob2R9ICR7Zm9ybWF0UmVxdWVzdFVybChyZXF1ZXN0LnVybCl9YDtcblx0XHRyZXR1cm4gdGhpcy5fbG9nUmVxdWVzdCgnUkVTVCcsIG9wZXJhdGlvbiwgYWNjb3VudCwgcHJpb3JpdHksIHNpZ25hbCwgKCkgPT4gdGhpcy5fZW5xdWV1ZVdpdGhSYXRlTGltaXQoYWNjb3VudCwgJ2NvcmUnLCBwcmlvcml0eSwgc2lnbmFsLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSByZXF1ZXN0LmV0YWcgIT09IGZhbHNlICYmICFyZXF1ZXN0LnVuY29uZGl0aW9uYWwgPyB0aGlzLl9yZXN0Q2FjaGUuZ2V0KGNhY2hlS2V5KSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZT8udHJhY2UoYFtHaXRIdWJUcmFuc3BvcnRdIFVzaW5nIGNhY2hlZCBFVGFnIGZvciAke29wZXJhdGlvbn1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHRcdCdBY2NlcHQnOiByZXF1ZXN0LmFjY2VwdCA/PyAnYXBwbGljYXRpb24vdm5kLmdpdGh1Yitqc29uJyxcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7dG9rZW59YCxcblx0XHRcdFx0J0NhY2hlLUNvbnRyb2wnOiAnbm8tc3RvcmUnLFxuXHRcdFx0XHQnWC1HaXRIdWItQXBpLVZlcnNpb24nOiByZXF1ZXN0LmFwaVZlcnNpb24gPz8gZGVmYXVsdEFwaVZlcnNpb24sXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0XHRoZWFkZXJzWydJZi1Ob25lLU1hdGNoJ10gPSBjYWNoZWQuZXRhZztcblx0XHRcdH1cblx0XHRcdGlmIChyZXF1ZXN0LmJvZHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRoZWFkZXJzWydDb250ZW50LVR5cGUnXSA9ICdhcHBsaWNhdGlvbi9qc29uJztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fZmV0Y2hSZXN0V2l0aFJlZGlyZWN0cyhhY2NvdW50LCByZXF1ZXN0LnVybCwge1xuXHRcdFx0XHRtZXRob2Q6IHJlcXVlc3QubWV0aG9kLFxuXHRcdFx0XHRjYWNoZTogJ25vLXN0b3JlJyxcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0Ym9keTogcmVxdWVzdC5ib2R5ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0LmJvZHkpLFxuXHRcdFx0XHRzaWduYWwsXG5cdFx0XHRcdHJlZGlyZWN0OiAnbWFudWFsJyxcblx0XHRcdH0sIHJlcXVlc3QubWV0aG9kID09PSAnR0VUJyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlPy50cmFjZShgW0dpdEh1YlRyYW5zcG9ydF0gUkVTVCAke29wZXJhdGlvbn0gcmV0dXJuZWQgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c31gKTtcblx0XHRcdGNvbnN0IGZpbmFsVXJsID0gcmVzcG9uc2UudXJsIHx8IHRoaXMuX3JlZGlyZWN0cy5nZXQocmVxdWVzdC51cmwpIHx8IHJlcXVlc3QudXJsO1xuXHRcdFx0Y29uc3QgYm9keSA9IHJlc3BvbnNlLnN0YXR1cyA9PT0gMjA0IHx8IHJlc3BvbnNlLnN0YXR1cyA9PT0gMzA0ID8gJycgOiBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdFx0XHR0aGlzLl9yYXRlTGltaXRzLnVwZGF0ZUZyb21SZXNwb25zZShhY2NvdW50LCByZXNwb25zZSwgYm9keSk7XG5cdFx0XHR0aGlzLl9sb2dSYXRlTGltaXQoYWNjb3VudCwgcmVzcG9uc2UuaGVhZGVycy5nZXQoJ3gtcmF0ZWxpbWl0LXJlc291cmNlJykgPz8gJ2NvcmUnKTtcblx0XHRcdGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDMwNCkge1xuXHRcdFx0XHRpZiAoIWNhY2hlZCB8fCByZXNwb25zZS5oZWFkZXJzLmdldCgnZXRhZycpICE9PSBudWxsICYmIHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdldGFnJykgIT09IGNhY2hlZC5ldGFnKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIHJldHVybmVkIDMwNCB3aXRob3V0IHRoZSBleGFjdCBjYWNoZWQgcmVwcmVzZW50YXRpb24nLCAnbWFsZm9ybWVkUmVzcG9uc2UnLCAzMDQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSBSZXVzZWQgY2FjaGVkIHJlcHJlc2VudGF0aW9uIGZvciAke29wZXJhdGlvbn1gKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRkYXRhOiB0aGlzLl9wYXJzZUpzb248VD4oY2FjaGVkLmJvZHksICdDYWNoZWQgR2l0SHViIHJlc3BvbnNlIHdhcyBub3QgdmFsaWQgSlNPTicpLFxuXHRcdFx0XHRcdHN0YXR1c0NvZGU6IDMwNCxcblx0XHRcdFx0XHRldGFnOiBjYWNoZWQuZXRhZyxcblx0XHRcdFx0XHRmaW5hbFVybDogY2FjaGVkLmZpbmFsVXJsLFxuXHRcdFx0XHRcdGxpbms6IGNhY2hlZC5saW5rLFxuXHRcdFx0XHRcdG9ic2VydmVkQXQ6IHRoaXMuX3NjaGVkdWxlci5ub3coKSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdFVybCA9IG5ldyBVUkwocmVxdWVzdC51cmwpO1xuXHRcdFx0XHRjb25zdCByb3V0ZSA9IGAke3JlcXVlc3RVcmwucGF0aG5hbWUucmVwbGFjZSgvXlxcLy8sICcnKX0ke3JlcXVlc3RVcmwuc2VhcmNofWA7XG5cdFx0XHRcdHRocm93IHRoaXMuX2h0dHBFcnJvcihgR2l0SHViIEFQSSByZXF1ZXN0IGZhaWxlZDogJHtyZXF1ZXN0Lm1ldGhvZH0gJHtyb3V0ZX1gLCByZXNwb25zZSwgYm9keSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNwb25zZUV0YWcgPSByZXNwb25zZS5oZWFkZXJzLmdldCgnZXRhZycpID8/IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlcHJlc2VudGF0aW9uVmVyc2lvbiA9IHJlcXVlc3QucmVwcmVzZW50YXRpb25WZXJzaW9uID8/IDE7XG5cdFx0XHRjb25zdCBmaW5hbENhY2hlS2V5ID0gdGhpcy5fcmVzdENhY2hlS2V5KGFjY291bnQsIHJlcXVlc3QsIGZpbmFsVXJsKTtcblx0XHRcdGlmIChyZXF1ZXN0Lm1ldGhvZCA9PT0gJ0dFVCcgJiYgcmVxdWVzdC5ldGFnICE9PSBmYWxzZSkge1xuXHRcdFx0XHRpZiAocmVzcG9uc2VFdGFnKSB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnk6IElSZXN0Q2FjaGVFbnRyeSA9IHtcblx0XHRcdFx0XHRcdGFjY291bnRLZXk6IEdpdEh1YlJlcXVlc3RRdWV1ZS5hY2NvdW50S2V5KGFjY291bnQpLFxuXHRcdFx0XHRcdFx0ZXRhZzogcmVzcG9uc2VFdGFnLFxuXHRcdFx0XHRcdFx0Ym9keSxcblx0XHRcdFx0XHRcdGZpbmFsVXJsLFxuXHRcdFx0XHRcdFx0ZmV0Y2hlZEF0OiB0aGlzLl9zY2hlZHVsZXIubm93KCksXG5cdFx0XHRcdFx0XHRsaW5rOiByZXNwb25zZS5oZWFkZXJzLmdldCgnbGluaycpID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHJlcHJlc2VudGF0aW9uVmVyc2lvbixcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuX3Jlc3RDYWNoZS5zZXQoZmluYWxDYWNoZUtleSwgZW50cnkpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSBDYWNoZWQgRVRhZyBmb3IgJHtvcGVyYXRpb259YCk7XG5cdFx0XHRcdFx0aWYgKGZpbmFsQ2FjaGVLZXkgIT09IGNhY2hlS2V5KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXN0Q2FjaGUuZGVsZXRlKGNhY2hlS2V5KTtcblx0XHRcdFx0XHRcdHRoaXMuX3JlZGlyZWN0cy5zZXQocmVxdWVzdC51cmwsIGZpbmFsVXJsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzdENhY2hlLmRlbGV0ZShjYWNoZUtleSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVzdENhY2hlLmRlbGV0ZShmaW5hbENhY2hlS2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGF0YTogYm9keSA/IHRoaXMuX3BhcnNlSnNvbjxUPihib2R5LCAnR2l0SHViIHJlc3BvbnNlIHdhcyBub3QgdmFsaWQgSlNPTicpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGF0dXNDb2RlOiByZXNwb25zZS5zdGF0dXMsXG5cdFx0XHRcdGV0YWc6IHJlc3BvbnNlRXRhZyxcblx0XHRcdFx0ZmluYWxVcmwsXG5cdFx0XHRcdGxpbms6IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdsaW5rJykgPz8gdW5kZWZpbmVkLFxuXHRcdFx0XHRvYnNlcnZlZEF0OiB0aGlzLl9zY2hlZHVsZXIubm93KCksXG5cdFx0XHR9O1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2VucXVldWVXaXRoUmF0ZUxpbWl0PFQ+KFxuXHRcdGFjY291bnQ6IEdpdEh1YkFjY291bnRIYW5kbGUsXG5cdFx0cmVzb3VyY2U6IHN0cmluZyxcblx0XHRwcmlvcml0eTogR2l0SHViUmVxdWVzdFByaW9yaXR5LFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0dGFzazogKCkgPT4gUHJvbWlzZTxUPixcblx0KTogUHJvbWlzZTxUPiB7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IGRlbGF5ID0gdGhpcy5fcmF0ZUxpbWl0cy5nZXREZWxheShhY2NvdW50LCByZXNvdXJjZSk7XG5cdFx0XHRpZiAoZGVsYXkgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LmRlYnVnKGBbR2l0SHViVHJhbnNwb3J0XSBXYWl0aW5nICR7ZGVsYXl9bXMgZm9yICR7cmVzb3VyY2V9IHJhdGUgbGltaXQgb24gJHthY2NvdW50Lmhvc3R9YCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JhdGVMaW1pdHMud2FpdChhY2NvdW50LCByZXNvdXJjZSwgc2lnbmFsKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3F1ZXVlLmVucXVldWU8UmF0ZUxpbWl0UXVldWVSZXN1bHQ8VD4+KGFjY291bnQsIHByaW9yaXR5LCBzaWduYWwsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3JhdGVMaW1pdHMuZ2V0RGVsYXkoYWNjb3VudCwgcmVzb3VyY2UpID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSBSZXF1ZXVlaW5nICR7cmVzb3VyY2V9IHJlcXVlc3QgYmVjYXVzZSBpdHMgcmF0ZSBsaW1pdCBjaGFuZ2VkYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgYmxvY2tlZDogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGJsb2NrZWQ6IGZhbHNlLCB2YWx1ZTogYXdhaXQgdGFzaygpIH07XG5cdFx0XHR9KTtcblx0XHRcdGlmICghcmVzdWx0LmJsb2NrZWQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdC52YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaFJlc3RXaXRoUmVkaXJlY3RzKGFjY291bnQ6IEdpdEh1YkFjY291bnRIYW5kbGUsIGluaXRpYWxVcmw6IHN0cmluZywgaW5pdDogUmVxdWVzdEluaXQsIHJldHJ5OiBib29sZWFuKTogUHJvbWlzZTxSZXNwb25zZT4ge1xuXHRcdGxldCB1cmwgPSB0aGlzLl9yZWRpcmVjdHMuZ2V0KGluaXRpYWxVcmwpID8/IGluaXRpYWxVcmw7XG5cdFx0Y29uc3QgaW5pdGlhbE9yaWdpbiA9IG5ldyBVUkwodXJsKS5vcmlnaW47XG5cdFx0Zm9yIChsZXQgcmVkaXJlY3RDb3VudCA9IDA7IHJlZGlyZWN0Q291bnQgPD0gbWF4aW11bVJlZGlyZWN0czsgcmVkaXJlY3RDb3VudCsrKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2ZldGNoV2l0aFJldHJ5KHVybCwgaW5pdCwgcmV0cnkpO1xuXHRcdFx0aWYgKCFbMzAxLCAzMDIsIDMwNywgMzA4XS5pbmNsdWRlcyhyZXNwb25zZS5zdGF0dXMpKSB7XG5cdFx0XHRcdGlmICh1cmwgIT09IGluaXRpYWxVcmwpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWRpcmVjdHMuc2V0KGluaXRpYWxVcmwsIHVybCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbG9jYXRpb24gPSByZXNwb25zZS5oZWFkZXJzLmdldCgnbG9jYXRpb24nKTtcblx0XHRcdGlmICghbG9jYXRpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIHJlZGlyZWN0IHdhcyBtaXNzaW5nIGEgTG9jYXRpb24gaGVhZGVyJywgJ21hbGZvcm1lZFJlc3BvbnNlJywgcmVzcG9uc2Uuc3RhdHVzKTtcblx0XHRcdH1cblx0XHRcdHVybCA9IG5ldyBVUkwobG9jYXRpb24sIHVybCkuaHJlZjtcblx0XHRcdGlmIChuZXcgVVJMKHVybCkub3JpZ2luICE9PSBpbml0aWFsT3JpZ2luKSB7XG5cdFx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IoJ0dpdEh1YiByZWRpcmVjdCBjaGFuZ2VkIG9yaWdpbicsICdhdXRob3JpemF0aW9uJywgcmVzcG9uc2Uuc3RhdHVzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSBGb2xsb3dpbmcgUkVTVCByZWRpcmVjdCB0byAke2Zvcm1hdFJlcXVlc3RVcmwodXJsKX1gKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIEFQSSByZXF1ZXN0IGV4Y2VlZGVkIHRoZSByZWRpcmVjdCBsaW1pdCcsICd1bmtub3duJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaFdpdGhSZXRyeSh1cmw6IHN0cmluZywgaW5pdDogUmVxdWVzdEluaXQsIHJldHJ5OiBib29sZWFuKTogUHJvbWlzZTxSZXNwb25zZT4ge1xuXHRcdGxldCBmYWlsdXJlOiB1bmtub3duO1xuXHRcdGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgKHJldHJ5ID8gMiA6IDEpOyBhdHRlbXB0KyspIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fZmV0Y2godXJsLCBpbml0KTtcblx0XHRcdFx0aWYgKHJldHJ5ICYmIGF0dGVtcHQgPT09IDAgJiYgcmVzcG9uc2Uuc3RhdHVzID49IDUwMCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2U/LmRlYnVnKGBbR2l0SHViVHJhbnNwb3J0XSBSZXRyeWluZyAke2Zvcm1hdFJlcXVlc3RVcmwodXJsKX0gYWZ0ZXIgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c31gKTtcblx0XHRcdFx0XHRhd2FpdCBzY2hlZHVsZXJEZWxheSh0aGlzLl9zY2hlZHVsZXIsIDEwMCArIHRoaXMuX3NjaGVkdWxlci5qaXR0ZXIoMjAwKSwgaW5pdC5zaWduYWwgYXMgQWJvcnRTaWduYWwpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICgoaW5pdC5zaWduYWwgYXMgQWJvcnRTaWduYWwpLmFib3J0ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRmYWlsdXJlID0gZXJyb3I7XG5cdFx0XHRcdGlmIChhdHRlbXB0ID09PSAwICYmIHJldHJ5KSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZT8uZGVidWcoYFtHaXRIdWJUcmFuc3BvcnRdIFJldHJ5aW5nICR7Zm9ybWF0UmVxdWVzdFVybCh1cmwpfSBhZnRlciBhIG5ldHdvcmsgZmFpbHVyZWApO1xuXHRcdFx0XHRcdGF3YWl0IHNjaGVkdWxlckRlbGF5KHRoaXMuX3NjaGVkdWxlciwgMTAwICsgdGhpcy5fc2NoZWR1bGVyLmppdHRlcigyMDApLCBpbml0LnNpZ25hbCBhcyBBYm9ydFNpZ25hbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihgR2l0SHViIG5ldHdvcmsgcmVxdWVzdCBmYWlsZWQ6ICR7U3RyaW5nKGZhaWx1cmUpfWAsICduZXR3b3JrJyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0Q2FjaGVLZXkoYWNjb3VudDogR2l0SHViQWNjb3VudEhhbmRsZSwgcmVxdWVzdDogR2l0SHViUmVzdFJlcXVlc3QsIHVybDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0R2l0SHViUmVxdWVzdFF1ZXVlLmFjY291bnRLZXkoYWNjb3VudCksXG5cdFx0XHRyZXF1ZXN0Lm1ldGhvZCxcblx0XHRcdHVybCxcblx0XHRcdHJlcXVlc3QuYWNjZXB0ID8/ICdhcHBsaWNhdGlvbi92bmQuZ2l0aHViK2pzb24nLFxuXHRcdFx0cmVxdWVzdC5hcGlWZXJzaW9uID8/IGRlZmF1bHRBcGlWZXJzaW9uLFxuXHRcdFx0cmVxdWVzdC5yZXByZXNlbnRhdGlvblZlcnNpb24gPz8gMSxcblx0XHRdLmpvaW4oJ1xceDAwJyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0Q29hbGVzY2luZ0tleShhY2NvdW50OiBHaXRIdWJBY2NvdW50SGFuZGxlLCByZXF1ZXN0OiBHaXRIdWJSZXN0UmVxdWVzdCwgdXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBbXG5cdFx0XHR0aGlzLl9yZXN0Q2FjaGVLZXkoYWNjb3VudCwgcmVxdWVzdCwgdXJsKSxcblx0XHRcdHJlcXVlc3QuZXRhZyA9PT0gZmFsc2UgPyAnZXRhZy1kaXNhYmxlZCcgOiAnZXRhZy1lbmFibGVkJyxcblx0XHRcdHJlcXVlc3QudW5jb25kaXRpb25hbCA9PT0gdHJ1ZSA/ICd1bmNvbmRpdGlvbmFsJyA6ICdjb25kaXRpb25hbCcsXG5cdFx0XS5qb2luKCdcXHgwMCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVsZXRlUmVzdFJlcXVlc3Qoa2V5OiBzdHJpbmcsIHJlcXVlc3Q6IElTaGFyZWRSZXF1ZXN0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luRmxpZ2h0LmdldChrZXkpID09PSByZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLl9pbkZsaWdodC5kZWxldGUoa2V5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kZWxldGVHcmFwaFFMUmVxdWVzdChrZXk6IHN0cmluZywgcmVxdWVzdDogSVNoYXJlZEdyYXBoUUxSZXF1ZXN0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2dyYXBoUWxJbkZsaWdodC5nZXQoa2V5KSA9PT0gcmVxdWVzdCkge1xuXHRcdFx0dGhpcy5fZ3JhcGhRbEluRmxpZ2h0LmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2h0dHBFcnJvcihwcmVmaXg6IHN0cmluZywgcmVzcG9uc2U6IFJlc3BvbnNlLCBib2R5OiBzdHJpbmcpOiBHaXRIdWJSZXF1ZXN0RXJyb3Ige1xuXHRcdGNvbnN0IGRldGFpbCA9IGZvcm1hdEVycm9yQm9keShib2R5KTtcblx0XHRjb25zdCBtZXNzYWdlID0gYCR7cHJlZml4fSAtICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9JHtkZXRhaWwgPyBgIC0gJHtkZXRhaWx9YCA6ICcnfWA7XG5cdFx0cmV0dXJuIG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IobWVzc2FnZSwgY2xhc3NpZnlIdHRwRXJyb3IocmVzcG9uc2Uuc3RhdHVzLCBib2R5KSwgcmVzcG9uc2Uuc3RhdHVzLCBib2R5KTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlSnNvbjxUPihib2R5OiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyk6IFQge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShib2R5KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IobWVzc2FnZSwgJ21hbGZvcm1lZFJlc3BvbnNlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9nUmVxdWVzdDxUPihcblx0XHRraW5kOiBzdHJpbmcsXG5cdFx0b3BlcmF0aW9uOiBzdHJpbmcsXG5cdFx0YWNjb3VudDogR2l0SHViQWNjb3VudEhhbmRsZSxcblx0XHRwcmlvcml0eTogR2l0SHViUmVxdWVzdFByaW9yaXR5LFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0dGFzazogKCkgPT4gUHJvbWlzZTxUPixcblx0KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3Qgc3RhcnRlZEF0ID0gdGhpcy5fc2NoZWR1bGVyLm5vdygpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2U/LnRyYWNlKGBbR2l0SHViVHJhbnNwb3J0XSAke2tpbmR9ICR7b3BlcmF0aW9ufSBzdGFydGVkIG9uICR7YWNjb3VudC5ob3N0fSAocHJpb3JpdHk6ICR7cHJpb3JpdHl9KWApO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0YXNrKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlPy50cmFjZShgW0dpdEh1YlRyYW5zcG9ydF0gJHtraW5kfSAke29wZXJhdGlvbn0gY29tcGxldGVkIGluICR7dGhpcy5fc2NoZWR1bGVyLm5vdygpIC0gc3RhcnRlZEF0fW1zYCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBvdXRjb21lID0gc2lnbmFsLmFib3J0ZWQgPyAnY2FuY2VsbGVkJyA6ICdmYWlsZWQnO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZT8uZGVidWcoYFtHaXRIdWJUcmFuc3BvcnRdICR7a2luZH0gJHtvcGVyYXRpb259ICR7b3V0Y29tZX0gYWZ0ZXIgJHt0aGlzLl9zY2hlZHVsZXIubm93KCkgLSBzdGFydGVkQXR9bXMgKCR7dHJhbnNwb3J0RXJyb3JLaW5kKGVycm9yKX0pYCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2dSYXRlTGltaXQoYWNjb3VudDogR2l0SHViQWNjb3VudEhhbmRsZSwgcmVzb3VyY2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fcmF0ZUxpbWl0cy5nZXRTdGF0ZShhY2NvdW50LCByZXNvdXJjZSk7XG5cdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlPy50cmFjZShgW0dpdEh1YlRyYW5zcG9ydF0gUmF0ZSBsaW1pdCAke3Jlc291cmNlfSBvbiAke2FjY291bnQuaG9zdH06IHJlbWFpbmluZz0ke3N0YXRlLnJlbWFpbmluZyA/PyAndW5rbm93bid9LCBsaW1pdD0ke3N0YXRlLmxpbWl0ID8/ICd1bmtub3duJ30sIHJlc2V0QXQ9JHtzdGF0ZS5yZXNldEF0ID8/ICd1bmtub3duJ30sIGJsb2NrZWRVbnRpbD0ke3N0YXRlLmJsb2NrZWRVbnRpbCA/PyAnbm9uZSd9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfd2FpdEZvclNoYXJlZDxUPihzaGFyZWQ6IElTaGFyZWRSZXF1ZXN0LCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxHaXRIdWJSZXN0UmVzcG9uc2U8VD4+IHtcblx0XHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChzaWduYWwucmVhc29uKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IG9uQWJvcnQgPSAoKSA9PiByZWplY3Qoc2lnbmFsLnJlYXNvbik7XG5cdFx0XHRzaWduYWwuYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0LCB7IG9uY2U6IHRydWUgfSk7XG5cdFx0XHR2b2lkIHNoYXJlZC5wcm9taXNlLnRoZW4oXG5cdFx0XHRcdHJlc3BvbnNlID0+IHtcblx0XHRcdFx0XHRzaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0KTtcblx0XHRcdFx0XHRyZXNvbHZlKHJlc3BvbnNlIGFzIEdpdEh1YlJlc3RSZXNwb25zZTxUPik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVycm9yID0+IHtcblx0XHRcdFx0XHRzaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0KTtcblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3dhaXRGb3JTaGFyZWRHcmFwaFFMPFQ+KHNoYXJlZDogSVNoYXJlZEdyYXBoUUxSZXF1ZXN0LCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxHaXRIdWJHcmFwaFFMUmVzcG9uc2U8VD4+IHtcblx0XHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChzaWduYWwucmVhc29uKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IG9uQWJvcnQgPSAoKSA9PiByZWplY3Qoc2lnbmFsLnJlYXNvbik7XG5cdFx0XHRzaWduYWwuYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0LCB7IG9uY2U6IHRydWUgfSk7XG5cdFx0XHR2b2lkIHNoYXJlZC5wcm9taXNlLnRoZW4oXG5cdFx0XHRcdHJlc3BvbnNlID0+IHtcblx0XHRcdFx0XHRzaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0KTtcblx0XHRcdFx0XHRyZXNvbHZlKHJlc3BvbnNlIGFzIEdpdEh1YkdyYXBoUUxSZXNwb25zZTxUPik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVycm9yID0+IHtcblx0XHRcdFx0XHRzaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0KTtcblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjbGFzc2lmeUh0dHBFcnJvcihzdGF0dXNDb2RlOiBudW1iZXIsIGJvZHk6IHN0cmluZyk6IEdpdEh1YlJlcXVlc3RFcnJvcktpbmQge1xuXHRzd2l0Y2ggKHN0YXR1c0NvZGUpIHtcblx0XHRjYXNlIDQwMTogcmV0dXJuICdhdXRoZW50aWNhdGlvbic7XG5cdFx0Y2FzZSA0MDM6IHJldHVybiBib2R5LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3JhdGUgbGltaXQnKSA/ICdyYXRlTGltaXQnIDogJ2F1dGhvcml6YXRpb24nO1xuXHRcdGNhc2UgNDA0OiByZXR1cm4gJ25vdEZvdW5kJztcblx0XHRjYXNlIDQyMjogcmV0dXJuICd2YWxpZGF0aW9uJztcblx0XHRjYXNlIDQyOTogcmV0dXJuICdyYXRlTGltaXQnO1xuXHRcdGRlZmF1bHQ6IHJldHVybiBzdGF0dXNDb2RlID49IDUwMCA/ICdzZXJ2ZXInIDogJ3Vua25vd24nO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yQm9keShib2R5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBub3JtYWxpemVkID0gYm9keS5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuXHRpZiAoIW5vcm1hbGl6ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBub3JtYWxpemVkLmxlbmd0aCA+IG1heGltdW1FcnJvckJvZHlMZW5ndGhcblx0XHQ/IGAke25vcm1hbGl6ZWQuc3Vic3RyaW5nKDAsIG1heGltdW1FcnJvckJvZHlMZW5ndGgpfS4uLmBcblx0XHQ6IG5vcm1hbGl6ZWQ7XG59XG5cbmZ1bmN0aW9uIHJlYWRHcmFwaFFMUmF0ZUxpbWl0KGRhdGE6IHVua25vd24pOiB7IGxpbWl0PzogbnVtYmVyOyByZW1haW5pbmc/OiBudW1iZXI7IHVzZWQ/OiBudW1iZXI7IHJlc2V0QXQ/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGlmICghZGF0YSB8fCB0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcgfHwgIWhhc0tleShkYXRhLCB7IHJhdGVMaW1pdDogdHJ1ZSB9KSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmF0ZUxpbWl0ID0gUmVmbGVjdC5nZXQoZGF0YSwgJ3JhdGVMaW1pdCcpO1xuXHRpZiAoIXJhdGVMaW1pdCB8fCB0eXBlb2YgcmF0ZUxpbWl0ICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRsaW1pdDogcmVhZE51bWJlcihyYXRlTGltaXQsICdsaW1pdCcpLFxuXHRcdHJlbWFpbmluZzogcmVhZE51bWJlcihyYXRlTGltaXQsICdyZW1haW5pbmcnKSxcblx0XHR1c2VkOiByZWFkTnVtYmVyKHJhdGVMaW1pdCwgJ3VzZWQnKSxcblx0XHRyZXNldEF0OiByZWFkU3RyaW5nKHJhdGVMaW1pdCwgJ3Jlc2V0QXQnKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVhZE51bWJlcih2YWx1ZTogb2JqZWN0LCBrZXk6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByb3BlcnR5ID0gUmVmbGVjdC5nZXQodmFsdWUsIGtleSk7XG5cdHJldHVybiB0eXBlb2YgcHJvcGVydHkgPT09ICdudW1iZXInID8gcHJvcGVydHkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHJlYWRTdHJpbmcodmFsdWU6IG9iamVjdCwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm9wZXJ0eSA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuXHRyZXR1cm4gdHlwZW9mIHByb3BlcnR5ID09PSAnc3RyaW5nJyA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjYW5vbmljYWxKc29uKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcblx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIGBbJHt2YWx1ZS5tYXAoY2Fub25pY2FsSnNvbikuam9pbignLCcpfV1gO1xuXHR9XG5cdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIGB7JHtPYmplY3Qua2V5cyh2YWx1ZSkuc29ydCgpLm1hcChrZXkgPT4gYCR7SlNPTi5zdHJpbmdpZnkoa2V5KX06JHtjYW5vbmljYWxKc29uKFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpKX1gKS5qb2luKCcsJyl9fWA7XG5cdH1cblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKSA/PyAndW5kZWZpbmVkJztcbn1cblxuZnVuY3Rpb24gZm9ybWF0UmVxdWVzdFVybCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRjb25zdCB1cmwgPSBuZXcgVVJMKHZhbHVlKTtcblx0XHRyZXR1cm4gYCR7dXJsLmhvc3R9JHt1cmwucGF0aG5hbWV9YDtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuICc8aW52YWxpZC11cmw+Jztcblx0fVxufVxuXG5mdW5jdGlvbiBmb3JtYXREb3dubG9hZFVybCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gbmV3IFVSTCh2YWx1ZSkuaG9zdDtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuICc8aW52YWxpZC11cmw+Jztcblx0fVxufVxuXG5mdW5jdGlvbiBncmFwaFFMT3BlcmF0aW9uTmFtZShxdWVyeTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIC9cXGIoPzpxdWVyeXxtdXRhdGlvbilcXHMrKD88bmFtZT5bX0EtWmEtel1bXzAtOUEtWmEtel0qKS8uZXhlYyhxdWVyeSk/Lmdyb3Vwcz8ubmFtZSA/PyAnPGFub255bW91cz4nO1xufVxuXG5mdW5jdGlvbiB0cmFuc3BvcnRFcnJvcktpbmQoZXJyb3I6IHVua25vd24pOiBzdHJpbmcge1xuXHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IpIHtcblx0XHRyZXR1cm4gYCR7ZXJyb3Iua2luZH0ke2Vycm9yLnN0YXR1c0NvZGUgPT09IHVuZGVmaW5lZCA/ICcnIDogYDoke2Vycm9yLnN0YXR1c0NvZGV9YH1gO1xuXHR9XG5cdHJldHVybiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubmFtZSA6IHR5cGVvZiBlcnJvcjtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVEb3dubG9hZFVybCh1cmw6IFVSTCwgYWxsb3dJbnNlY3VyZUxvb3BiYWNrOiBib29sZWFuKTogdm9pZCB7XG5cdGlmICh1cmwucHJvdG9jb2wgPT09ICdodHRwczonKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmIChhbGxvd0luc2VjdXJlTG9vcGJhY2tcblx0XHQmJiB1cmwucHJvdG9jb2wgPT09ICdodHRwOidcblx0XHQmJiAodXJsLmhvc3RuYW1lID09PSAnMTI3LjAuMC4xJyB8fCB1cmwuaG9zdG5hbWUgPT09ICdsb2NhbGhvc3QnIHx8IHVybC5ob3N0bmFtZSA9PT0gJ1s6OjFdJykpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcignR2l0SHViIGRvd25sb2FkIHJlZGlyZWN0IHVzZWQgYW4gdW5zYWZlIHRhcmdldCcsICdhdXRob3JpemF0aW9uJyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRCb3VuZGVkUmVzcG9uc2UoXG5cdHJlc3BvbnNlOiBSZXNwb25zZSxcblx0bWF4aW11bUJ5dGVzOiBudW1iZXIsXG5cdHNpZ25hbDogQWJvcnRTaWduYWwsXG4pOiBQcm9taXNlPHsgcmVhZG9ubHkgYnl0ZXM6IFVpbnQ4QXJyYXk7IHJlYWRvbmx5IHRydW5jYXRlZDogYm9vbGVhbiB9PiB7XG5cdGNvbnN0IGxpbWl0ID0gTWF0aC5tYXgoMCwgbWF4aW11bUJ5dGVzKTtcblx0aWYgKCFyZXNwb25zZS5ib2R5KSB7XG5cdFx0cmV0dXJuIHsgYnl0ZXM6IG5ldyBVaW50OEFycmF5KCksIHRydW5jYXRlZDogZmFsc2UgfTtcblx0fVxuXHRjb25zdCByZWFkZXIgPSByZXNwb25zZS5ib2R5LmdldFJlYWRlcigpO1xuXHRjb25zdCBjaHVua3M6IFVpbnQ4QXJyYXlbXSA9IFtdO1xuXHRsZXQgbGVuZ3RoID0gMDtcblx0dHJ5IHtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKHNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdHRocm93IHNpZ25hbC5yZWFzb247XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkZXIucmVhZCgpO1xuXHRcdFx0aWYgKHJlc3VsdC5kb25lKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxlbmd0aCArIHJlc3VsdC52YWx1ZS5ieXRlTGVuZ3RoID4gbGltaXQpIHtcblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nID0gTWF0aC5tYXgoMCwgbGltaXQgLSBsZW5ndGgpO1xuXHRcdFx0XHRpZiAocmVtYWluaW5nID4gMCkge1xuXHRcdFx0XHRcdGNodW5rcy5wdXNoKHJlc3VsdC52YWx1ZS5zbGljZSgwLCByZW1haW5pbmcpKTtcblx0XHRcdFx0XHRsZW5ndGggKz0gcmVtYWluaW5nO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHJlYWRlci5jYW5jZWwoKTtcblx0XHRcdFx0cmV0dXJuIHsgYnl0ZXM6IGNvbmNhdGVuYXRlQnl0ZXMoY2h1bmtzLCBsZW5ndGgpLCB0cnVuY2F0ZWQ6IHRydWUgfTtcblx0XHRcdH1cblx0XHRcdGNodW5rcy5wdXNoKHJlc3VsdC52YWx1ZSk7XG5cdFx0XHRsZW5ndGggKz0gcmVzdWx0LnZhbHVlLmJ5dGVMZW5ndGg7XG5cdFx0fVxuXHRcdHJldHVybiB7IGJ5dGVzOiBjb25jYXRlbmF0ZUJ5dGVzKGNodW5rcywgbGVuZ3RoKSwgdHJ1bmNhdGVkOiBmYWxzZSB9O1xuXHR9IGZpbmFsbHkge1xuXHRcdHJlYWRlci5yZWxlYXNlTG9jaygpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbmNhdGVuYXRlQnl0ZXMoY2h1bmtzOiByZWFkb25seSBVaW50OEFycmF5W10sIGxlbmd0aDogbnVtYmVyKTogVWludDhBcnJheSB7XG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGxlbmd0aCk7XG5cdGxldCBvZmZzZXQgPSAwO1xuXHRmb3IgKGNvbnN0IGNodW5rIG9mIGNodW5rcykge1xuXHRcdHJlc3VsdC5zZXQoY2h1bmssIG9mZnNldCk7XG5cdFx0b2Zmc2V0ICs9IGNodW5rLmJ5dGVMZW5ndGg7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsY0FBYztBQUd2QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUEyQixnQkFBZ0IsNkJBQTZCO0FBc0JqRSxNQUFNLDJCQUEyQixNQUFNO0FBQUEsRUFFN0MsWUFDQyxTQUNTLE1BQ0EsWUFDQSxjQUNBLGVBQ1I7QUFDRCxVQUFNLE9BQU87QUFMSjtBQUNBO0FBQ0E7QUFDQTtBQUdULFNBQUssT0FBTztBQUFBLEVBQ2I7QUFDRDtBQW1FQSxNQUFNLG9CQUFvQjtBQUMxQixNQUFNLHlCQUF5QjtBQUMvQixNQUFNLG1CQUFtQjtBQUVsQixN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
