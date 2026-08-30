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
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import {
  CLOUD_SANDBOX_AGENT_SLUG,
  CloudSandboxAuthenticationRequiredError,
  CloudSandboxRequestError
} from "../../../../../platform/agentHost/common/cloudSandboxAgentHost.js";
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI, deriveGitHubEndpoints } from "../../../../../platform/agentHost/common/githubEndpoints.js";
import { parseTaskEventsResponse, replayTaskAhpEvents, TaskEventReplayError } from "../../../../../platform/agentHost/common/taskEventReplay.js";
import { COPILOT_INTEGRATION_ID } from "../../../../../platform/endpoint/common/licenseAgreement.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { asText, IRequestService } from "../../../../../platform/request/common/request.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { ICloudSandboxTelemetryService, requestOutcomeForStatus } from "./cloudSandboxTelemetry.js";
const LOG_PREFIX = "[CloudSandboxApi]";
const GITHUB_DOT_COM_API_BASE_URI = deriveGitHubEndpoints(void 0).apiBaseUri;
const REQUEST_TIMEOUT_MS = 1e4;
const DISCOVERY_TIMEOUT_MS = 3e4;
const DEFAULT_WAKING_RETRY_AFTER_SECONDS = 5;
const DISCOVERY_TASK_SCAN_LIMIT = 100;
const FALLBACK_SCOPES = ["read:user", "user:email", "repo", "workflow"];
let CloudSandboxApiService = class extends Disposable {
  constructor(_requestService, _authenticationService, _productService, _logService, _telemetry) {
    super();
    this._requestService = _requestService;
    this._authenticationService = _authenticationService;
    this._productService = _productService;
    this._logService = _logService;
    this._telemetry = _telemetry;
    /** Resolved (or in-flight) repository names, keyed by numeric repository id. */
    this._repositoryNames = /* @__PURE__ */ new Map();
  }
  async connect(request, token) {
    return this._connectRequest("connect", request.environmentId, token, {
      ...request.sessionId && { session_id: request.sessionId }
    });
  }
  async reconnect(request, clientId, token) {
    return this._connectRequest("reconnect", request.environmentId, token, {
      client_id: clientId,
      ...request.sessionId && { session_id: request.sessionId }
    });
  }
  async getEnvironment(environmentId, token) {
    const context = await this._sendEnvironment("get", environmentId, token);
    if (!isSuccess(context)) {
      await this._throwForStatus("get", context);
    }
    const environment = await this._readJson(context);
    if (!environment?.status) {
      throw new Error("Mission Control get returned an incomplete environment response");
    }
    this._logService.trace(`${LOG_PREFIX} Environment ${environmentId}: status=${environment.status}, ahp=${environment.capabilities?.ahp_version ?? "unknown"}`);
    return environment;
  }
  /**
   * Enumerate sandbox-backed cloud sessions by scanning recent tasks and resolving each one's
   * Mission Control environment binding.
   *
   * The result distinguishes a full scan from a partial or failed one: a caller that reconciles
   * against this list would otherwise treat a transient request failure as "these sessions no
   * longer exist" and tear down live providers.
   */
  async listSessions(token) {
    let tasks;
    try {
      const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks?per_page=${DISCOVERY_TASK_SCAN_LIMIT}`, "list", token);
      const response = await this._readJson(context);
      if (!response?.tasks) {
        return { kind: "failed", reason: `listTasks returned no 'tasks' array` };
      }
      tasks = response.tasks;
    } catch (error) {
      return { kind: "failed", reason: `listTasks failed: ${toErrorMessage(error)}` };
    }
    const sandboxTasks = tasks.filter((task) => !task.archived_at && isCloudSandboxTask(task));
    let unresolved = 0;
    const discovered = await Promise.all(sandboxTasks.map(async (task) => {
      try {
        const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(task.id)}`, "get", token);
        const full = await this._readJson(context);
        if (!full) {
          unresolved++;
          return void 0;
        }
        const binding = getTaskEnvironmentBinding(full);
        if (!binding) {
          return void 0;
        }
        const repositoryId = full.repository?.id ?? task.repository?.id;
        const repoName = repositoryId !== void 0 ? await this._resolveRepositoryName(repositoryId, token) : void 0;
        return {
          environmentId: binding.environmentId,
          sessionId: binding.sessionId,
          taskId: task.id,
          name: full.name ?? task.name ?? `Sandbox ${task.id}`,
          repoName,
          updatedAt: full.updated_at ?? task.updated_at
        };
      } catch (error) {
        this._logService.warn(`${LOG_PREFIX} Discovery getTask ${task.id} failed: ${toErrorMessage(error)}`);
        unresolved++;
        return void 0;
      }
    }));
    const sessions = discovered.filter((session) => session !== void 0);
    const unnamed = sessions.filter((session) => !session.repoName).length;
    this._logService.info(`${LOG_PREFIX} Discovery found ${sessions.length} sandbox session(s) from ${sandboxTasks.length} sandbox task(s) out of ${tasks.length} scanned${unresolved > 0 ? `; ${unresolved} unresolved` : ""}${unnamed > 0 ? `; ${unnamed} without a repository name (they group under "Unknown")` : ""}.`);
    return { kind: unresolved > 0 ? "partial" : "complete", sessions };
  }
  /**
   * Read a task's persisted AHP history and fold it into session/chat state.
   *
   * The only history path that survives the sandbox: `/events` is served by Mission Control's
   * mirror, not the environment. The `vnd.github.ahp+json` media type selects the raw relayed
   * frames rather than the cloud-task event summaries the endpoint serves by default.
   */
  async getSessionHistory(taskId, token) {
    const url = `${this._tasksBaseUrl()}/tasks/${encodeURIComponent(taskId)}/events`;
    const context = await this._request(url, "mc.taskClient.events", "getTaskEvents", {
      "Accept": "application/vnd.github.ahp+json",
      "Copilot-Integration-Id": COPILOT_INTEGRATION_ID
    }, token, DISCOVERY_TIMEOUT_MS);
    if (!isSuccess(context)) {
      await this._throwForStatus("task events", context);
    }
    const body = await this._readJson(context);
    if (body === void 0) {
      throw new TaskEventReplayError("Task AHP history response was empty or not JSON.");
    }
    return replayTaskAhpEvents(parseTaskEventsResponse(body));
  }
  /**
   * Resolve a numeric repository id to its `owner/name`, memoized for the life of the service.
   * A task names its repository nowhere — `repository` carries an id, and the session's
   * `event_url` / `base_ref` are empty for tasks created through the tasks API.
   *
   * The cached promise must never reject: every task in a pass shares it, and a rejection would
   * count each one as unresolved (forcing the scan `partial`) and drop those sessions from the
   * listing entirely. A miss is evicted so the next pass retries.
   */
  _resolveRepositoryName(repositoryId, token) {
    const cached = this._repositoryNames.get(repositoryId);
    if (cached) {
      return cached;
    }
    const pending = (async () => {
      try {
        const url = `${GITHUB_DOT_COM_API_BASE_URI}/repositories/${repositoryId}`;
        const context = await this._request(url, "mc.repositoryClient.get", "getRepository", {
          "Accept": "application/vnd.github.v3+json"
        }, token, DISCOVERY_TIMEOUT_MS);
        if (!isSuccess(context)) {
          throw new CloudSandboxRequestError(context.res.statusCode, `HTTP ${context.res.statusCode ?? "none"}`);
        }
        const body = await this._readJson(context);
        return body?.full_name;
      } catch (error) {
        this._logService.warn(`${LOG_PREFIX} Repository ${repositoryId} lookup failed: ${toErrorMessage(error)}`);
        return void 0;
      }
    })();
    this._repositoryNames.set(repositoryId, pending);
    pending.then((name) => {
      if (!name && this._repositoryNames.get(repositoryId) === pending) {
        this._repositoryNames.delete(repositoryId);
      }
    });
    return pending;
  }
  /** Shared handler for the `connect`/`reconnect` endpoints (200 token or 202 waking). */
  async _connectRequest(action, environmentId, token, searchParams) {
    const context = await this._sendEnvironment(action, environmentId, token, searchParams);
    if (context.res.statusCode === 202) {
      const retryAfterSeconds = parseRetryAfter(context.res.headers?.["retry-after"]);
      this._logService.debug(`${LOG_PREFIX} ${action}: environment waking, retry after ${retryAfterSeconds}s`);
      return { kind: "waking", waking: { retryAfterSeconds } };
    }
    if (!isSuccess(context)) {
      await this._throwForStatus(action, context);
    }
    const clientToken = await this._readJson(context);
    if (!clientToken?.access_token || !clientToken?.wps_endpoint || !clientToken?.client_id || !clientToken?.groups) {
      throw new Error(`Mission Control ${action} returned an incomplete token response`);
    }
    return { kind: "token", token: clientToken };
  }
  /**
   * Issue an agent-environment request and return the raw response. The caller owns status
   * handling, since the meaning of a status is endpoint-specific (notably HTTP 202 = "waking",
   * which is neither an error nor a result).
   */
  async _sendEnvironment(action, environmentId, token, searchParams) {
    const path = action === "get" ? "" : `/${action}`;
    const url = `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents/environments/${encodeURIComponent(environmentId)}${path}${toQuery(searchParams)}`;
    return this._request(url, `mc.environmentClient.${action}`, action === "get" ? "getEnvironment" : action, {
      "Copilot-Integration-Id": COPILOT_INTEGRATION_ID
    }, token);
  }
  /** Issue a task API request, throwing on a non-success status. */
  async _sendTask(url, action, token) {
    const context = await this._request(url, `mc.taskClient.${action}`, action === "list" ? "listTasks" : "getTask", {
      "Accept": "application/json",
      "Copilot-Integration-Id": COPILOT_INTEGRATION_ID
    }, token, DISCOVERY_TIMEOUT_MS);
    if (!isSuccess(context)) {
      await this._throwForStatus(`task ${action}`, context);
    }
    return context;
  }
  async _request(url, callSite, action, headers, token, timeout = REQUEST_TIMEOUT_MS) {
    const accessToken = await this._resolveGitHubToken();
    if (!accessToken) {
      throw new CloudSandboxAuthenticationRequiredError();
    }
    const started = Date.now();
    try {
      const context = await this._requestService.request({
        type: "GET",
        url,
        headers: { ...headers, ["Authorization"]: `Bearer ${accessToken}` },
        timeout,
        callSite
      }, token);
      this._telemetry.reportRequest(action, requestOutcomeForStatus(context.res.statusCode));
      this._logService.trace(`${LOG_PREFIX} ${action} -> HTTP ${context.res.statusCode ?? "none"} in ${Date.now() - started}ms (budget ${timeout}ms)${context.res.headers?.["retry-after"] ? `, Retry-After: ${context.res.headers["retry-after"]}` : ""}`);
      return context;
    } catch (error) {
      if (!isCancellationError(error) && !token.isCancellationRequested) {
        this._telemetry.reportRequest(action, "networkError");
      }
      this._logService.trace(`${LOG_PREFIX} ${action} -> failed after ${Date.now() - started}ms (budget ${timeout}ms)`);
      this._logService.error(`${LOG_PREFIX} GET ${url} failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
  /**
   * Mission Control task API base. Uses the Copilot API host: `api.github.com/agents/*` omits
   * CORS headers on authenticated responses, so a renderer `fetch` receives the reply and discards it.
   */
  _tasksBaseUrl() {
    return `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents`;
  }
  async _readJson(context) {
    const body = await asText(context);
    if (!body) {
      return void 0;
    }
    try {
      return JSON.parse(body);
    } catch {
      return void 0;
    }
  }
  /** Throw a diagnosable error for a non-success response, including the body when readable. */
  async _throwForStatus(action, context) {
    const body = await asText(context).catch(() => "");
    const status = context.res.statusCode;
    throw new CloudSandboxRequestError(
      status,
      `Mission Control ${action} failed: HTTP ${status ?? "unknown"} - ${(body ?? "").slice(0, 200)}`
    );
  }
  /** A GitHub session carrying at least the configured chat provider scopes. */
  async _resolveGitHubToken() {
    const providerId = this._productService.defaultChatAgent?.provider?.default?.id ?? "github";
    const scopes = this._productService.defaultChatAgent?.providerScopes?.[0] ?? FALLBACK_SCOPES;
    let exact;
    try {
      exact = await this._authenticationService.getSessions(providerId, [...scopes], void 0, true);
    } catch (error) {
      this._logService.warn(`${LOG_PREFIX} getSessions('${providerId}') failed: ${toErrorMessage(error)}`);
      return void 0;
    }
    if (exact.length > 0) {
      return exact[0].accessToken;
    }
    const all = await this._authenticationService.getSessions(providerId, void 0, void 0, true);
    const required = new Set(scopes);
    let best;
    for (const session of all) {
      const granted = new Set(session.scopes);
      if ([...required].every((scope) => granted.has(scope))) {
        const extra = granted.size - required.size;
        if (!best || extra < best.extra) {
          best = { token: session.accessToken, extra };
        }
      }
    }
    if (!best) {
      this._logService.warn(`${LOG_PREFIX} No '${providerId}' session with scopes [${scopes.join(", ")}]`);
    }
    return best?.token;
  }
};
CloudSandboxApiService = __decorateClass([
  __decorateParam(0, IRequestService),
  __decorateParam(1, IAuthenticationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ICloudSandboxTelemetryService)
], CloudSandboxApiService);
function isSuccess(context) {
  const status = context.res.statusCode ?? 0;
  return status >= 200 && status < 300;
}
function toQuery(searchParams) {
  if (!searchParams) {
    return "";
  }
  const search = new URLSearchParams(searchParams).toString();
  return search ? `?${search}` : "";
}
function parseRetryAfter(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw) {
    const seconds = Number.parseInt(raw, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return DEFAULT_WAKING_RETRY_AFTER_SECONDS;
}
function isCloudSandboxTask(task) {
  const isCloudCodingAgent = task.agent_collaborators?.some((c) => c.slug === CLOUD_SANDBOX_AGENT_SLUG) ?? false;
  return isCloudCodingAgent && task.compute?.provider === "sandboxes";
}
function getTaskEnvironmentBinding(task) {
  for (const session of task.sessions ?? []) {
    if (session.environment_id && session.environment_id.length > 0 && session.id.length > 0) {
      return { environmentId: session.environment_id, sessionId: session.id };
    }
  }
  return void 0;
}
export {
  CloudSandboxApiService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXGNsb3VkU2FuZGJveEFwaVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHtcblx0Q0xPVURfU0FOREJPWF9BR0VOVF9TTFVHLFxuXHRDbG91ZFNhbmRib3hBdXRoZW50aWNhdGlvblJlcXVpcmVkRXJyb3IsXG5cdENsb3VkU2FuZGJveENvbm5lY3RSZXN1bHQsXG5cdENsb3VkU2FuZGJveFJlcXVlc3RFcnJvcixcblx0SUNsb3VkU2FuZGJveENsaWVudFRva2VuLFxuXHRJQ2xvdWRTYW5kYm94Q29ubmVjdGlvblJlcXVlc3QsXG5cdElDbG91ZFNhbmRib3hBcGlTZXJ2aWNlLFxuXHRJQ2xvdWRTYW5kYm94RGlzY292ZXJlZFNlc3Npb24sXG5cdElDbG91ZFNhbmRib3hEaXNjb3ZlcnlSZXN1bHQsXG5cdElDbG91ZFNhbmRib3hFbnZpcm9ubWVudCxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jbG91ZFNhbmRib3hBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgR0lUSFVCX0RPVF9DT01fQ09QSUxPVF9BUElfQkFTRV9VUkksIGRlcml2ZUdpdEh1YkVuZHBvaW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vZ2l0aHViRW5kcG9pbnRzLmpzJztcbmltcG9ydCB7IElSZXBsYXllZFRhc2tIaXN0b3J5LCBwYXJzZVRhc2tFdmVudHNSZXNwb25zZSwgcmVwbGF5VGFza0FocEV2ZW50cywgVGFza0V2ZW50UmVwbGF5RXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3Rhc2tFdmVudFJlcGxheS5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0lOVEVHUkFUSU9OX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW5kcG9pbnQvY29tbW9uL2xpY2Vuc2VBZ3JlZW1lbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgYXNUZXh0LCBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNsb3VkU2FuZGJveFRlbGVtZXRyeVNlcnZpY2UsIHJlcXVlc3RPdXRjb21lRm9yU3RhdHVzLCB0eXBlIENsb3VkU2FuZGJveFJlcXVlc3RBY3Rpb24gfSBmcm9tICcuL2Nsb3VkU2FuZGJveFRlbGVtZXRyeS5qcyc7XG5cbi8qKiBUaGUgYWdlbnQtZW52aXJvbm1lbnQgZW5kcG9pbnRzIE1pc3Npb24gQ29udHJvbCBleHBvc2VzLiAqL1xudHlwZSBDbG91ZFNhbmRib3hFbnZpcm9ubWVudEFjdGlvbiA9ICdnZXQnIHwgJ2Nvbm5lY3QnIHwgJ3JlY29ubmVjdCc7XG5cbi8qKiBUaGUgc3Vic2V0IG9mIGEgTWlzc2lvbiBDb250cm9sIHRhc2sgdGhlIHNhbmRib3ggZGlzY292ZXJ5IHBhdGggcmVhZHMuICovXG5pbnRlcmZhY2UgSVRhc2tTdW1tYXJ5IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgYXJjaGl2ZWRfYXQ/OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSB1cGRhdGVkX2F0Pzogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudF9jb2xsYWJvcmF0b3JzPzogcmVhZG9ubHkgeyByZWFkb25seSBzbHVnPzogc3RyaW5nIH1bXTtcblx0cmVhZG9ubHkgY29tcHV0ZT86IHsgcmVhZG9ubHkgcHJvdmlkZXI/OiBzdHJpbmcgfTtcblx0LyoqXG5cdCAqIFRoZSBvd25pbmcgcmVwb3NpdG9yeSwgaWRlbnRpZmllZCBieSBudW1lcmljIGlkIG9ubHkgXHUyMDE0IHRoZSBwYXlsb2FkIGNhcnJpZXMgbm8gbmFtZS4gU2VlXG5cdCAqIHtAbGluayBDbG91ZFNhbmRib3hBcGlTZXJ2aWNlLl9yZXNvbHZlUmVwb3NpdG9yeU5hbWV9LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVwb3NpdG9yeT86IHsgcmVhZG9ubHkgaWQ/OiBudW1iZXIgfTtcbn1cblxuLyoqIEEgZnVsbCB0YXNrLCB3aGljaCBhZGRpdGlvbmFsbHkgY2FycmllcyB0aGUgc2Vzc2lvbnMgYm91bmQgdG8gc2FuZGJveCBlbnZpcm9ubWVudHMuICovXG5pbnRlcmZhY2UgSVRhc2tEZXRhaWwgZXh0ZW5kcyBJVGFza1N1bW1hcnkge1xuXHRyZWFkb25seSBzZXNzaW9ucz86IHJlYWRvbmx5IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkgZW52aXJvbm1lbnRfaWQ/OiBzdHJpbmcgfVtdO1xufVxuXG5jb25zdCBMT0dfUFJFRklYID0gJ1tDbG91ZFNhbmRib3hBcGldJztcblxuLyoqXG4gKiBUaGUgZ2l0aHViLmNvbSBSRVNUIEFQSSBiYXNlLCB1c2VkIGZvciB0aGUgcmVwb3NpdG9yeS1uYW1lIGxvb2t1cCBkaXNjb3ZlcnkgbmVlZHMuIFRoZSBDT1JTXG4gKiBjYXZlYXQgb24ge0BsaW5rIENsb3VkU2FuZGJveEFwaVNlcnZpY2UuX3Rhc2tzQmFzZVVybH0gaXMgc3BlY2lmaWMgdG8gYGFwaS5naXRodWIuY29tL2FnZW50cy8qYDtcbiAqIHRoZSBnZW5lcmFsIFJFU1QgQVBJIGlzIENPUlMtZW5hYmxlZCBhbmQgYWxyZWFkeSBjYWxsZWQgZnJvbSB0aGUgcmVuZGVyZXIgZWxzZXdoZXJlLlxuICovXG5jb25zdCBHSVRIVUJfRE9UX0NPTV9BUElfQkFTRV9VUkkgPSBkZXJpdmVHaXRIdWJFbmRwb2ludHModW5kZWZpbmVkKS5hcGlCYXNlVXJpO1xuXG4vKiogUGVyLXJlcXVlc3QgdGltZW91dCAobXMpIGZvciBjcmVkZW50aWFsIGFuZCBlbnZpcm9ubWVudCBjYWxscy4gKi9cbmNvbnN0IFJFUVVFU1RfVElNRU9VVF9NUyA9IDEwXzAwMDtcblxuLyoqIFBlci1yZXF1ZXN0IHRpbWVvdXQgKG1zKSBmb3IgZGlzY292ZXJ5LCB3aG9zZSB0YXNrIGxpc3QgaXMgZmFyIGxhcmdlciB0aGFuIGEgY3JlZGVudGlhbCBtaW50LiAqL1xuY29uc3QgRElTQ09WRVJZX1RJTUVPVVRfTVMgPSAzMF8wMDA7XG5cbi8qKiBEZWZhdWx0IFJldHJ5LUFmdGVyIChzZWNvbmRzKSB3aGVuIGEgMjAyIFwid2FraW5nXCIgcmVzcG9uc2Ugb21pdHMgdGhlIGhlYWRlci4gKi9cbmNvbnN0IERFRkFVTFRfV0FLSU5HX1JFVFJZX0FGVEVSX1NFQ09ORFMgPSA1O1xuXG4vKiogSG93IG1hbnkgcmVjZW50IHRhc2tzIHRvIHNjYW4gZm9yIHNhbmRib3ggc2Vzc2lvbnMgZHVyaW5nIGRpc2NvdmVyeS4gKi9cbmNvbnN0IERJU0NPVkVSWV9UQVNLX1NDQU5fTElNSVQgPSAxMDA7XG5cbi8qKiBGYWxsYmFjayBzY29wZXMgd2hlbiB0aGUgcHJvZHVjdCBkb2VzIG5vdCBjb25maWd1cmUgYGRlZmF1bHRDaGF0QWdlbnQucHJvdmlkZXJTY29wZXNgLiAqL1xuY29uc3QgRkFMTEJBQ0tfU0NPUEVTID0gWydyZWFkOnVzZXInLCAndXNlcjplbWFpbCcsICdyZXBvJywgJ3dvcmtmbG93J107XG5cbi8qKlxuICogTWlzc2lvbiBDb250cm9sIGNsaWVudCBmb3IgY2xvdWQgc2FuZGJveCBzZXNzaW9uczogbWludHMgKGBjb25uZWN0YCkgYW5kIHJlZnJlc2hlcyAoYHJlY29ubmVjdGApXG4gKiBXZWIgUHViU3ViIGNyZWRlbnRpYWxzLCByZWFkcyBlbnZpcm9ubWVudCBhbmQgdGFzayByZWNvcmRzLCBkaXNjb3ZlcnMgc2FuZGJveC1iYWNrZWQgc2Vzc2lvbnMsXG4gKiBhbmQgcmVwbGF5cyBhIHRhc2sncyBwZXJzaXN0ZWQgQUhQIGhpc3RvcnkuXG4gKlxuICogUnVucyBpbiB0aGUgcmVuZGVyZXIgc28gdGhlIHNhbmRib3ggcGF0aCB3b3JrcyBpbiBWUyBDb2RlIFdlYiwgd2hlcmUgbm8gQ29waWxvdCBleHRlbnNpb24gaG9zdCBpc1xuICogYXZhaWxhYmxlLlxuICovXG5leHBvcnQgY2xhc3MgQ2xvdWRTYW5kYm94QXBpU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2xvdWRTYW5kYm94QXBpU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKiBSZXNvbHZlZCAob3IgaW4tZmxpZ2h0KSByZXBvc2l0b3J5IG5hbWVzLCBrZXllZCBieSBudW1lcmljIHJlcG9zaXRvcnkgaWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcG9zaXRvcnlOYW1lcyA9IG5ldyBNYXA8bnVtYmVyLCBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2xvdWRTYW5kYm94VGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnk6IElDbG91ZFNhbmRib3hUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdChyZXF1ZXN0OiBJQ2xvdWRTYW5kYm94Q29ubmVjdGlvblJlcXVlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Q2xvdWRTYW5kYm94Q29ubmVjdFJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25uZWN0UmVxdWVzdCgnY29ubmVjdCcsIHJlcXVlc3QuZW52aXJvbm1lbnRJZCwgdG9rZW4sIHtcblx0XHRcdC4uLihyZXF1ZXN0LnNlc3Npb25JZCAmJiB7IHNlc3Npb25faWQ6IHJlcXVlc3Quc2Vzc2lvbklkIH0pLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcmVjb25uZWN0KHJlcXVlc3Q6IElDbG91ZFNhbmRib3hDb25uZWN0aW9uUmVxdWVzdCwgY2xpZW50SWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDbG91ZFNhbmRib3hDb25uZWN0UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Nvbm5lY3RSZXF1ZXN0KCdyZWNvbm5lY3QnLCByZXF1ZXN0LmVudmlyb25tZW50SWQsIHRva2VuLCB7XG5cdFx0XHRjbGllbnRfaWQ6IGNsaWVudElkLFxuXHRcdFx0Li4uKHJlcXVlc3Quc2Vzc2lvbklkICYmIHsgc2Vzc2lvbl9pZDogcmVxdWVzdC5zZXNzaW9uSWQgfSksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRFbnZpcm9ubWVudChlbnZpcm9ubWVudElkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNsb3VkU2FuZGJveEVudmlyb25tZW50PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3NlbmRFbnZpcm9ubWVudCgnZ2V0JywgZW52aXJvbm1lbnRJZCwgdG9rZW4pO1xuXHRcdGlmICghaXNTdWNjZXNzKGNvbnRleHQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90aHJvd0ZvclN0YXR1cygnZ2V0JywgY29udGV4dCk7XG5cdFx0fVxuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gYXdhaXQgdGhpcy5fcmVhZEpzb248SUNsb3VkU2FuZGJveEVudmlyb25tZW50Pihjb250ZXh0KTtcblx0XHRpZiAoIWVudmlyb25tZW50Py5zdGF0dXMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWlzc2lvbiBDb250cm9sIGdldCByZXR1cm5lZCBhbiBpbmNvbXBsZXRlIGVudmlyb25tZW50IHJlc3BvbnNlJyk7XG5cdFx0fVxuXHRcdC8vIGBzdGF0dXNgIGNvbWVzIGZyb20gaGVhcnRiZWF0IGFnZTogYSBzdGFsZSBvbmUgbWVhbnMgYC9jb25uZWN0YCB3aWxsIGF0dGVtcHQgYSByZXN1bWUgYW5kXG5cdFx0Ly8gY2FuIGJsb2NrIGZvciBpdHMgd2hvbGUgYnVkZ2V0LlxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gRW52aXJvbm1lbnQgJHtlbnZpcm9ubWVudElkfTogc3RhdHVzPSR7ZW52aXJvbm1lbnQuc3RhdHVzfSwgYWhwPSR7ZW52aXJvbm1lbnQuY2FwYWJpbGl0aWVzPy5haHBfdmVyc2lvbiA/PyAndW5rbm93bid9YCk7XG5cdFx0cmV0dXJuIGVudmlyb25tZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIEVudW1lcmF0ZSBzYW5kYm94LWJhY2tlZCBjbG91ZCBzZXNzaW9ucyBieSBzY2FubmluZyByZWNlbnQgdGFza3MgYW5kIHJlc29sdmluZyBlYWNoIG9uZSdzXG5cdCAqIE1pc3Npb24gQ29udHJvbCBlbnZpcm9ubWVudCBiaW5kaW5nLlxuXHQgKlxuXHQgKiBUaGUgcmVzdWx0IGRpc3Rpbmd1aXNoZXMgYSBmdWxsIHNjYW4gZnJvbSBhIHBhcnRpYWwgb3IgZmFpbGVkIG9uZTogYSBjYWxsZXIgdGhhdCByZWNvbmNpbGVzXG5cdCAqIGFnYWluc3QgdGhpcyBsaXN0IHdvdWxkIG90aGVyd2lzZSB0cmVhdCBhIHRyYW5zaWVudCByZXF1ZXN0IGZhaWx1cmUgYXMgXCJ0aGVzZSBzZXNzaW9ucyBub1xuXHQgKiBsb25nZXIgZXhpc3RcIiBhbmQgdGVhciBkb3duIGxpdmUgcHJvdmlkZXJzLlxuXHQgKi9cblx0YXN5bmMgbGlzdFNlc3Npb25zKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNsb3VkU2FuZGJveERpc2NvdmVyeVJlc3VsdD4ge1xuXHRcdGxldCB0YXNrczogcmVhZG9ubHkgSVRhc2tTdW1tYXJ5W107XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLl9zZW5kVGFzayhgJHt0aGlzLl90YXNrc0Jhc2VVcmwoKX0vdGFza3M/cGVyX3BhZ2U9JHtESVNDT1ZFUllfVEFTS19TQ0FOX0xJTUlUfWAsICdsaXN0JywgdG9rZW4pO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9yZWFkSnNvbjx7IHRhc2tzPzogcmVhZG9ubHkgSVRhc2tTdW1tYXJ5W10gfT4oY29udGV4dCk7XG5cdFx0XHRpZiAoIXJlc3BvbnNlPy50YXNrcykge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnZmFpbGVkJywgcmVhc29uOiBgbGlzdFRhc2tzIHJldHVybmVkIG5vICd0YXNrcycgYXJyYXlgIH07XG5cdFx0XHR9XG5cdFx0XHR0YXNrcyA9IHJlc3BvbnNlLnRhc2tzO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnZmFpbGVkJywgcmVhc29uOiBgbGlzdFRhc2tzIGZhaWxlZDogJHt0b0Vycm9yTWVzc2FnZShlcnJvcil9YCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhbmRib3hUYXNrcyA9IHRhc2tzLmZpbHRlcih0YXNrID0+ICF0YXNrLmFyY2hpdmVkX2F0ICYmIGlzQ2xvdWRTYW5kYm94VGFzayh0YXNrKSk7XG5cdFx0bGV0IHVucmVzb2x2ZWQgPSAwO1xuXHRcdGNvbnN0IGRpc2NvdmVyZWQgPSBhd2FpdCBQcm9taXNlLmFsbChzYW5kYm94VGFza3MubWFwKGFzeW5jICh0YXNrKTogUHJvbWlzZTxJQ2xvdWRTYW5kYm94RGlzY292ZXJlZFNlc3Npb24gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLl9zZW5kVGFzayhgJHt0aGlzLl90YXNrc0Jhc2VVcmwoKX0vdGFza3MvJHtlbmNvZGVVUklDb21wb25lbnQodGFzay5pZCl9YCwgJ2dldCcsIHRva2VuKTtcblx0XHRcdFx0Y29uc3QgZnVsbCA9IGF3YWl0IHRoaXMuX3JlYWRKc29uPElUYXNrRGV0YWlsPihjb250ZXh0KTtcblx0XHRcdFx0aWYgKCFmdWxsKSB7XG5cdFx0XHRcdFx0dW5yZXNvbHZlZCsrO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYmluZGluZyA9IGdldFRhc2tFbnZpcm9ubWVudEJpbmRpbmcoZnVsbCk7XG5cdFx0XHRcdGlmICghYmluZGluZykge1xuXHRcdFx0XHRcdC8vIE5vIGVudmlyb25tZW50IGJvdW5kIHlldCBcdTIwMTQgYSByZWFsIHN0YXRlLCBub3QgYSBmYWlsdXJlIHRvIHJlc29sdmUuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5SWQgPSBmdWxsLnJlcG9zaXRvcnk/LmlkID8/IHRhc2sucmVwb3NpdG9yeT8uaWQ7XG5cdFx0XHRcdGNvbnN0IHJlcG9OYW1lID0gcmVwb3NpdG9yeUlkICE9PSB1bmRlZmluZWQgPyBhd2FpdCB0aGlzLl9yZXNvbHZlUmVwb3NpdG9yeU5hbWUocmVwb3NpdG9yeUlkLCB0b2tlbikgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRJZDogYmluZGluZy5lbnZpcm9ubWVudElkLFxuXHRcdFx0XHRcdHNlc3Npb25JZDogYmluZGluZy5zZXNzaW9uSWQsXG5cdFx0XHRcdFx0dGFza0lkOiB0YXNrLmlkLFxuXHRcdFx0XHRcdG5hbWU6IGZ1bGwubmFtZSA/PyB0YXNrLm5hbWUgPz8gYFNhbmRib3ggJHt0YXNrLmlkfWAsXG5cdFx0XHRcdFx0cmVwb05hbWUsXG5cdFx0XHRcdFx0dXBkYXRlZEF0OiBmdWxsLnVwZGF0ZWRfYXQgPz8gdGFzay51cGRhdGVkX2F0LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IERpc2NvdmVyeSBnZXRUYXNrICR7dGFzay5pZH0gZmFpbGVkOiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdFx0dW5yZXNvbHZlZCsrO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zID0gZGlzY292ZXJlZC5maWx0ZXIoKHNlc3Npb24pOiBzZXNzaW9uIGlzIElDbG91ZFNhbmRib3hEaXNjb3ZlcmVkU2Vzc2lvbiA9PiBzZXNzaW9uICE9PSB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHVubmFtZWQgPSBzZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiAhc2Vzc2lvbi5yZXBvTmFtZSkubGVuZ3RoO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBEaXNjb3ZlcnkgZm91bmQgJHtzZXNzaW9ucy5sZW5ndGh9IHNhbmRib3ggc2Vzc2lvbihzKSBmcm9tICR7c2FuZGJveFRhc2tzLmxlbmd0aH0gc2FuZGJveCB0YXNrKHMpIG91dCBvZiAke3Rhc2tzLmxlbmd0aH0gc2Nhbm5lZCR7dW5yZXNvbHZlZCA+IDAgPyBgOyAke3VucmVzb2x2ZWR9IHVucmVzb2x2ZWRgIDogJyd9JHt1bm5hbWVkID4gMCA/IGA7ICR7dW5uYW1lZH0gd2l0aG91dCBhIHJlcG9zaXRvcnkgbmFtZSAodGhleSBncm91cCB1bmRlciBcIlVua25vd25cIilgIDogJyd9LmApO1xuXHRcdHJldHVybiB7IGtpbmQ6IHVucmVzb2x2ZWQgPiAwID8gJ3BhcnRpYWwnIDogJ2NvbXBsZXRlJywgc2Vzc2lvbnMgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkIGEgdGFzaydzIHBlcnNpc3RlZCBBSFAgaGlzdG9yeSBhbmQgZm9sZCBpdCBpbnRvIHNlc3Npb24vY2hhdCBzdGF0ZS5cblx0ICpcblx0ICogVGhlIG9ubHkgaGlzdG9yeSBwYXRoIHRoYXQgc3Vydml2ZXMgdGhlIHNhbmRib3g6IGAvZXZlbnRzYCBpcyBzZXJ2ZWQgYnkgTWlzc2lvbiBDb250cm9sJ3Ncblx0ICogbWlycm9yLCBub3QgdGhlIGVudmlyb25tZW50LiBUaGUgYHZuZC5naXRodWIuYWhwK2pzb25gIG1lZGlhIHR5cGUgc2VsZWN0cyB0aGUgcmF3IHJlbGF5ZWRcblx0ICogZnJhbWVzIHJhdGhlciB0aGFuIHRoZSBjbG91ZC10YXNrIGV2ZW50IHN1bW1hcmllcyB0aGUgZW5kcG9pbnQgc2VydmVzIGJ5IGRlZmF1bHQuXG5cdCAqL1xuXHRhc3luYyBnZXRTZXNzaW9uSGlzdG9yeSh0YXNrSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmVwbGF5ZWRUYXNrSGlzdG9yeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHVybCA9IGAke3RoaXMuX3Rhc2tzQmFzZVVybCgpfS90YXNrcy8ke2VuY29kZVVSSUNvbXBvbmVudCh0YXNrSWQpfS9ldmVudHNgO1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLl9yZXF1ZXN0KHVybCwgJ21jLnRhc2tDbGllbnQuZXZlbnRzJywgJ2dldFRhc2tFdmVudHMnLCB7XG5cdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL3ZuZC5naXRodWIuYWhwK2pzb24nLFxuXHRcdFx0J0NvcGlsb3QtSW50ZWdyYXRpb24tSWQnOiBDT1BJTE9UX0lOVEVHUkFUSU9OX0lELFxuXHRcdH0sIHRva2VuLCBESVNDT1ZFUllfVElNRU9VVF9NUyk7XG5cdFx0aWYgKCFpc1N1Y2Nlc3MoY29udGV4dCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Rocm93Rm9yU3RhdHVzKCd0YXNrIGV2ZW50cycsIGNvbnRleHQpO1xuXHRcdH1cblx0XHRjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5fcmVhZEpzb248dW5rbm93bj4oY29udGV4dCk7XG5cdFx0aWYgKGJvZHkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IFRhc2tFdmVudFJlcGxheUVycm9yKCdUYXNrIEFIUCBoaXN0b3J5IHJlc3BvbnNlIHdhcyBlbXB0eSBvciBub3QgSlNPTi4nKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcGxheVRhc2tBaHBFdmVudHMocGFyc2VUYXNrRXZlbnRzUmVzcG9uc2UoYm9keSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYSBudW1lcmljIHJlcG9zaXRvcnkgaWQgdG8gaXRzIGBvd25lci9uYW1lYCwgbWVtb2l6ZWQgZm9yIHRoZSBsaWZlIG9mIHRoZSBzZXJ2aWNlLlxuXHQgKiBBIHRhc2sgbmFtZXMgaXRzIHJlcG9zaXRvcnkgbm93aGVyZSBcdTIwMTQgYHJlcG9zaXRvcnlgIGNhcnJpZXMgYW4gaWQsIGFuZCB0aGUgc2Vzc2lvbidzXG5cdCAqIGBldmVudF91cmxgIC8gYGJhc2VfcmVmYCBhcmUgZW1wdHkgZm9yIHRhc2tzIGNyZWF0ZWQgdGhyb3VnaCB0aGUgdGFza3MgQVBJLlxuXHQgKlxuXHQgKiBUaGUgY2FjaGVkIHByb21pc2UgbXVzdCBuZXZlciByZWplY3Q6IGV2ZXJ5IHRhc2sgaW4gYSBwYXNzIHNoYXJlcyBpdCwgYW5kIGEgcmVqZWN0aW9uIHdvdWxkXG5cdCAqIGNvdW50IGVhY2ggb25lIGFzIHVucmVzb2x2ZWQgKGZvcmNpbmcgdGhlIHNjYW4gYHBhcnRpYWxgKSBhbmQgZHJvcCB0aG9zZSBzZXNzaW9ucyBmcm9tIHRoZVxuXHQgKiBsaXN0aW5nIGVudGlyZWx5LiBBIG1pc3MgaXMgZXZpY3RlZCBzbyB0aGUgbmV4dCBwYXNzIHJldHJpZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUmVwb3NpdG9yeU5hbWUocmVwb3NpdG9yeUlkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fcmVwb3NpdG9yeU5hbWVzLmdldChyZXBvc2l0b3J5SWQpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHBlbmRpbmcgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gYCR7R0lUSFVCX0RPVF9DT01fQVBJX0JBU0VfVVJJfS9yZXBvc2l0b3JpZXMvJHtyZXBvc2l0b3J5SWR9YDtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3JlcXVlc3QodXJsLCAnbWMucmVwb3NpdG9yeUNsaWVudC5nZXQnLCAnZ2V0UmVwb3NpdG9yeScsIHtcblx0XHRcdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL3ZuZC5naXRodWIudjMranNvbicsXG5cdFx0XHRcdH0sIHRva2VuLCBESVNDT1ZFUllfVElNRU9VVF9NUyk7XG5cdFx0XHRcdGlmICghaXNTdWNjZXNzKGNvbnRleHQpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENsb3VkU2FuZGJveFJlcXVlc3RFcnJvcihjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBgSFRUUCAke2NvbnRleHQucmVzLnN0YXR1c0NvZGUgPz8gJ25vbmUnfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCB0aGlzLl9yZWFkSnNvbjx7IGZ1bGxfbmFtZT86IHN0cmluZyB9Pihjb250ZXh0KTtcblx0XHRcdFx0cmV0dXJuIGJvZHk/LmZ1bGxfbmFtZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBSZXBvc2l0b3J5ICR7cmVwb3NpdG9yeUlkfSBsb29rdXAgZmFpbGVkOiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSgpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcnlOYW1lcy5zZXQocmVwb3NpdG9yeUlkLCBwZW5kaW5nKTtcblx0XHRwZW5kaW5nLnRoZW4obmFtZSA9PiB7XG5cdFx0XHRpZiAoIW5hbWUgJiYgdGhpcy5fcmVwb3NpdG9yeU5hbWVzLmdldChyZXBvc2l0b3J5SWQpID09PSBwZW5kaW5nKSB7XG5cdFx0XHRcdHRoaXMuX3JlcG9zaXRvcnlOYW1lcy5kZWxldGUocmVwb3NpdG9yeUlkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcGVuZGluZztcblx0fVxuXG5cdC8qKiBTaGFyZWQgaGFuZGxlciBmb3IgdGhlIGBjb25uZWN0YC9gcmVjb25uZWN0YCBlbmRwb2ludHMgKDIwMCB0b2tlbiBvciAyMDIgd2FraW5nKS4gKi9cblx0cHJpdmF0ZSBhc3luYyBfY29ubmVjdFJlcXVlc3QoXG5cdFx0YWN0aW9uOiBDbG91ZFNhbmRib3hFbnZpcm9ubWVudEFjdGlvbixcblx0XHRlbnZpcm9ubWVudElkOiBzdHJpbmcsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdHNlYXJjaFBhcmFtczogUmVjb3JkPHN0cmluZywgc3RyaW5nPixcblx0KTogUHJvbWlzZTxDbG91ZFNhbmRib3hDb25uZWN0UmVzdWx0PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3NlbmRFbnZpcm9ubWVudChhY3Rpb24sIGVudmlyb25tZW50SWQsIHRva2VuLCBzZWFyY2hQYXJhbXMpO1xuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDIwMikge1xuXHRcdFx0Y29uc3QgcmV0cnlBZnRlclNlY29uZHMgPSBwYXJzZVJldHJ5QWZ0ZXIoY29udGV4dC5yZXMuaGVhZGVycz8uWydyZXRyeS1hZnRlciddKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYCR7TE9HX1BSRUZJWH0gJHthY3Rpb259OiBlbnZpcm9ubWVudCB3YWtpbmcsIHJldHJ5IGFmdGVyICR7cmV0cnlBZnRlclNlY29uZHN9c2ApO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3dha2luZycsIHdha2luZzogeyByZXRyeUFmdGVyU2Vjb25kcyB9IH07XG5cdFx0fVxuXHRcdGlmICghaXNTdWNjZXNzKGNvbnRleHQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90aHJvd0ZvclN0YXR1cyhhY3Rpb24sIGNvbnRleHQpO1xuXHRcdH1cblx0XHRjb25zdCBjbGllbnRUb2tlbiA9IGF3YWl0IHRoaXMuX3JlYWRKc29uPElDbG91ZFNhbmRib3hDbGllbnRUb2tlbj4oY29udGV4dCk7XG5cdFx0aWYgKCFjbGllbnRUb2tlbj8uYWNjZXNzX3Rva2VuIHx8ICFjbGllbnRUb2tlbj8ud3BzX2VuZHBvaW50IHx8ICFjbGllbnRUb2tlbj8uY2xpZW50X2lkIHx8ICFjbGllbnRUb2tlbj8uZ3JvdXBzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3Npb24gQ29udHJvbCAke2FjdGlvbn0gcmV0dXJuZWQgYW4gaW5jb21wbGV0ZSB0b2tlbiByZXNwb25zZWApO1xuXHRcdH1cblx0XHRyZXR1cm4geyBraW5kOiAndG9rZW4nLCB0b2tlbjogY2xpZW50VG9rZW4gfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJc3N1ZSBhbiBhZ2VudC1lbnZpcm9ubWVudCByZXF1ZXN0IGFuZCByZXR1cm4gdGhlIHJhdyByZXNwb25zZS4gVGhlIGNhbGxlciBvd25zIHN0YXR1c1xuXHQgKiBoYW5kbGluZywgc2luY2UgdGhlIG1lYW5pbmcgb2YgYSBzdGF0dXMgaXMgZW5kcG9pbnQtc3BlY2lmaWMgKG5vdGFibHkgSFRUUCAyMDIgPSBcIndha2luZ1wiLFxuXHQgKiB3aGljaCBpcyBuZWl0aGVyIGFuIGVycm9yIG5vciBhIHJlc3VsdCkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zZW5kRW52aXJvbm1lbnQoXG5cdFx0YWN0aW9uOiBDbG91ZFNhbmRib3hFbnZpcm9ubWVudEFjdGlvbixcblx0XHRlbnZpcm9ubWVudElkOiBzdHJpbmcsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdHNlYXJjaFBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG5cdCk6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0Y29uc3QgcGF0aCA9IGFjdGlvbiA9PT0gJ2dldCcgPyAnJyA6IGAvJHthY3Rpb259YDtcblx0XHRjb25zdCB1cmwgPSBgJHtHSVRIVUJfRE9UX0NPTV9DT1BJTE9UX0FQSV9CQVNFX1VSSX0vYWdlbnRzL2Vudmlyb25tZW50cy8ke2VuY29kZVVSSUNvbXBvbmVudChlbnZpcm9ubWVudElkKX0ke3BhdGh9JHt0b1F1ZXJ5KHNlYXJjaFBhcmFtcyl9YDtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdCh1cmwsIGBtYy5lbnZpcm9ubWVudENsaWVudC4ke2FjdGlvbn1gLCBhY3Rpb24gPT09ICdnZXQnID8gJ2dldEVudmlyb25tZW50JyA6IGFjdGlvbiwge1xuXHRcdFx0J0NvcGlsb3QtSW50ZWdyYXRpb24tSWQnOiBDT1BJTE9UX0lOVEVHUkFUSU9OX0lELFxuXHRcdH0sIHRva2VuKTtcblx0fVxuXG5cdC8qKiBJc3N1ZSBhIHRhc2sgQVBJIHJlcXVlc3QsIHRocm93aW5nIG9uIGEgbm9uLXN1Y2Nlc3Mgc3RhdHVzLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9zZW5kVGFzayh1cmw6IHN0cmluZywgYWN0aW9uOiAnbGlzdCcgfCAnZ2V0JywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5fcmVxdWVzdCh1cmwsIGBtYy50YXNrQ2xpZW50LiR7YWN0aW9ufWAsIGFjdGlvbiA9PT0gJ2xpc3QnID8gJ2xpc3RUYXNrcycgOiAnZ2V0VGFzaycsIHtcblx0XHRcdCdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHQnQ29waWxvdC1JbnRlZ3JhdGlvbi1JZCc6IENPUElMT1RfSU5URUdSQVRJT05fSUQsXG5cdFx0fSwgdG9rZW4sIERJU0NPVkVSWV9USU1FT1VUX01TKTtcblx0XHRpZiAoIWlzU3VjY2Vzcyhjb250ZXh0KSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fdGhyb3dGb3JTdGF0dXMoYHRhc2sgJHthY3Rpb259YCwgY29udGV4dCk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVxdWVzdCh1cmw6IHN0cmluZywgY2FsbFNpdGU6IHN0cmluZywgYWN0aW9uOiBDbG91ZFNhbmRib3hSZXF1ZXN0QWN0aW9uLCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHRpbWVvdXQ6IG51bWJlciA9IFJFUVVFU1RfVElNRU9VVF9NUyk6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0Y29uc3QgYWNjZXNzVG9rZW4gPSBhd2FpdCB0aGlzLl9yZXNvbHZlR2l0SHViVG9rZW4oKTtcblx0XHRpZiAoIWFjY2Vzc1Rva2VuKSB7XG5cdFx0XHQvLyBObyByZXF1ZXN0IGlzIGlzc3VlZCwgc28gdGhlcmUgaXMgbm8gcmVxdWVzdCBvdXRjb21lIHRvIGNvdW50LlxuXHRcdFx0dGhyb3cgbmV3IENsb3VkU2FuZGJveEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRFcnJvcigpO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydGVkID0gRGF0ZS5ub3coKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3JlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdFx0dXJsLFxuXHRcdFx0XHRoZWFkZXJzOiB7IC4uLmhlYWRlcnMsIFsnQXV0aG9yaXphdGlvbiddOiBgQmVhcmVyICR7YWNjZXNzVG9rZW59YCB9LFxuXHRcdFx0XHR0aW1lb3V0LFxuXHRcdFx0XHRjYWxsU2l0ZSxcblx0XHRcdH0sIHRva2VuKTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeS5yZXBvcnRSZXF1ZXN0KGFjdGlvbiwgcmVxdWVzdE91dGNvbWVGb3JTdGF0dXMoY29udGV4dC5yZXMuc3RhdHVzQ29kZSkpO1xuXHRcdFx0Ly8gTGF0ZW5jeSBhZ2FpbnN0IGl0cyBidWRnZXQ6IGAvY29ubmVjdGAgYmxvY2tzIG9uIGEgY29tcHV0ZSByZXN1bWUsIHNvIGhvdyBjbG9zZSBhIHJlcGx5XG5cdFx0XHQvLyBjYW1lIHRvIGJlaW5nIGN1dCBvZmYgc2VwYXJhdGVzIFwiTWlzc2lvbiBDb250cm9sIGlzIHNpbGVudFwiIGZyb20gXCJ3ZSBzdG9wcGVkIGxpc3RlbmluZ1wiLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSAke2FjdGlvbn0gLT4gSFRUUCAke2NvbnRleHQucmVzLnN0YXR1c0NvZGUgPz8gJ25vbmUnfSBpbiAke0RhdGUubm93KCkgLSBzdGFydGVkfW1zIChidWRnZXQgJHt0aW1lb3V0fW1zKSR7Y29udGV4dC5yZXMuaGVhZGVycz8uWydyZXRyeS1hZnRlciddID8gYCwgUmV0cnktQWZ0ZXI6ICR7Y29udGV4dC5yZXMuaGVhZGVyc1sncmV0cnktYWZ0ZXInXX1gIDogJyd9YCk7XG5cdFx0XHRyZXR1cm4gY29udGV4dDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gQSBjYW5jZWxsZWQgcmVxdWVzdCB3YXMgbmV2ZXIgYW5zd2VyZWQsIHNvIGl0IGlzIG5vdCBhIGZhaWx1cmUgd29ydGggY291bnRpbmcuXG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnkucmVwb3J0UmVxdWVzdChhY3Rpb24sICduZXR3b3JrRXJyb3InKTtcblx0XHRcdH1cblx0XHRcdC8vIEVsYXBzZWQgYXQgdGhlIGJ1ZGdldCBtZWFucyBvdXIgb3duIHRpbWVvdXQgZmlyZWQ7IHNob3J0ZXIgbWVhbnMgc29tZXRoaW5nIGVsc2UgZGlkLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSAke2FjdGlvbn0gLT4gZmFpbGVkIGFmdGVyICR7RGF0ZS5ub3coKSAtIHN0YXJ0ZWR9bXMgKGJ1ZGdldCAke3RpbWVvdXR9bXMpYCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IEdFVCAke3VybH0gZmFpbGVkOiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNaXNzaW9uIENvbnRyb2wgdGFzayBBUEkgYmFzZS4gVXNlcyB0aGUgQ29waWxvdCBBUEkgaG9zdDogYGFwaS5naXRodWIuY29tL2FnZW50cy8qYCBvbWl0c1xuXHQgKiBDT1JTIGhlYWRlcnMgb24gYXV0aGVudGljYXRlZCByZXNwb25zZXMsIHNvIGEgcmVuZGVyZXIgYGZldGNoYCByZWNlaXZlcyB0aGUgcmVwbHkgYW5kIGRpc2NhcmRzIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfdGFza3NCYXNlVXJsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke0dJVEhVQl9ET1RfQ09NX0NPUElMT1RfQVBJX0JBU0VfVVJJfS9hZ2VudHNgO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZEpzb248VD4oY29udGV4dDogSVJlcXVlc3RDb250ZXh0KTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYm9keSA9IGF3YWl0IGFzVGV4dChjb250ZXh0KTtcblx0XHRpZiAoIWJvZHkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShib2R5KSBhcyBUO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKiogVGhyb3cgYSBkaWFnbm9zYWJsZSBlcnJvciBmb3IgYSBub24tc3VjY2VzcyByZXNwb25zZSwgaW5jbHVkaW5nIHRoZSBib2R5IHdoZW4gcmVhZGFibGUuICovXG5cdHByaXZhdGUgYXN5bmMgX3Rocm93Rm9yU3RhdHVzKGFjdGlvbjogc3RyaW5nLCBjb250ZXh0OiBJUmVxdWVzdENvbnRleHQpOiBQcm9taXNlPG5ldmVyPiB7XG5cdFx0Y29uc3QgYm9keSA9IGF3YWl0IGFzVGV4dChjb250ZXh0KS5jYXRjaCgoKSA9PiAnJyk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gY29udGV4dC5yZXMuc3RhdHVzQ29kZTtcblx0XHR0aHJvdyBuZXcgQ2xvdWRTYW5kYm94UmVxdWVzdEVycm9yKFxuXHRcdFx0c3RhdHVzLFxuXHRcdFx0YE1pc3Npb24gQ29udHJvbCAke2FjdGlvbn0gZmFpbGVkOiBIVFRQICR7c3RhdHVzID8/ICd1bmtub3duJ30gLSAkeyhib2R5ID8/ICcnKS5zbGljZSgwLCAyMDApfWAsXG5cdFx0KTtcblx0fVxuXG5cdC8qKiBBIEdpdEh1YiBzZXNzaW9uIGNhcnJ5aW5nIGF0IGxlYXN0IHRoZSBjb25maWd1cmVkIGNoYXQgcHJvdmlkZXIgc2NvcGVzLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlR2l0SHViVG9rZW4oKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXI/LmRlZmF1bHQ/LmlkID8/ICdnaXRodWInO1xuXHRcdGNvbnN0IHNjb3BlcyA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LnByb3ZpZGVyU2NvcGVzPy5bMF0gPz8gRkFMTEJBQ0tfU0NPUEVTO1xuXG5cdFx0bGV0IGV4YWN0OiByZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXTtcblx0XHR0cnkge1xuXHRcdFx0ZXhhY3QgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXJJZCwgWy4uLnNjb3Blc10sIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIFRocm93cyB3aGVuIHRoZSBhdXRoIHByb3ZpZGVyIGV4dGVuc2lvbiBoYXMgbm90IHJlZ2lzdGVyZWQgeWV0LlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IGdldFNlc3Npb25zKCcke3Byb3ZpZGVySWR9JykgZmFpbGVkOiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChleGFjdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gZXhhY3RbMF0uYWNjZXNzVG9rZW47XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbCBiYWNrIHRvIHRoZSBuYXJyb3dlc3Qgc2Vzc2lvbiB3aG9zZSBzY29wZXMgYXJlIGEgc3VwZXJzZXQgb2Ygd2hhdCB3ZSBuZWVkLlxuXHRcdGNvbnN0IGFsbCA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgcmVxdWlyZWQgPSBuZXcgU2V0KHNjb3Blcyk7XG5cdFx0bGV0IGJlc3Q6IHsgdG9rZW46IHN0cmluZzsgZXh0cmE6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBhbGwpIHtcblx0XHRcdGNvbnN0IGdyYW50ZWQgPSBuZXcgU2V0KHNlc3Npb24uc2NvcGVzKTtcblx0XHRcdGlmIChbLi4ucmVxdWlyZWRdLmV2ZXJ5KHNjb3BlID0+IGdyYW50ZWQuaGFzKHNjb3BlKSkpIHtcblx0XHRcdFx0Y29uc3QgZXh0cmEgPSBncmFudGVkLnNpemUgLSByZXF1aXJlZC5zaXplO1xuXHRcdFx0XHRpZiAoIWJlc3QgfHwgZXh0cmEgPCBiZXN0LmV4dHJhKSB7XG5cdFx0XHRcdFx0YmVzdCA9IHsgdG9rZW46IHNlc3Npb24uYWNjZXNzVG9rZW4sIGV4dHJhIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFiZXN0KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gTm8gJyR7cHJvdmlkZXJJZH0nIHNlc3Npb24gd2l0aCBzY29wZXMgWyR7c2NvcGVzLmpvaW4oJywgJyl9XWApO1xuXHRcdH1cblx0XHRyZXR1cm4gYmVzdD8udG9rZW47XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNTdWNjZXNzKGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IGJvb2xlYW4ge1xuXHRjb25zdCBzdGF0dXMgPSBjb250ZXh0LnJlcy5zdGF0dXNDb2RlID8/IDA7XG5cdHJldHVybiBzdGF0dXMgPj0gMjAwICYmIHN0YXR1cyA8IDMwMDtcbn1cblxuZnVuY3Rpb24gdG9RdWVyeShzZWFyY2hQYXJhbXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRpZiAoIXNlYXJjaFBhcmFtcykge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRjb25zdCBzZWFyY2ggPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHNlYXJjaFBhcmFtcykudG9TdHJpbmcoKTtcblx0cmV0dXJuIHNlYXJjaCA/IGA/JHtzZWFyY2h9YCA6ICcnO1xufVxuXG4vKiogUGFyc2UgYSBgUmV0cnktQWZ0ZXJgIGhlYWRlciAoZGVsdGEtc2Vjb25kcyk7IGZhbGwgYmFjayB0byBhIHNtYWxsIGRlZmF1bHQuICovXG5mdW5jdGlvbiBwYXJzZVJldHJ5QWZ0ZXIodmFsdWU6IHN0cmluZyB8IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0Y29uc3QgcmF3ID0gQXJyYXkuaXNBcnJheSh2YWx1ZSkgPyB2YWx1ZVswXSA6IHZhbHVlO1xuXHRpZiAocmF3KSB7XG5cdFx0Y29uc3Qgc2Vjb25kcyA9IE51bWJlci5wYXJzZUludChyYXcsIDEwKTtcblx0XHRpZiAoTnVtYmVyLmlzRmluaXRlKHNlY29uZHMpICYmIHNlY29uZHMgPiAwKSB7XG5cdFx0XHRyZXR1cm4gc2Vjb25kcztcblx0XHR9XG5cdH1cblx0cmV0dXJuIERFRkFVTFRfV0FLSU5HX1JFVFJZX0FGVEVSX1NFQ09ORFM7XG59XG5cbi8qKlxuICogV2hldGhlciBhIHRhc2sgaXMgYSBjbG91ZCBzYW5kYm94IHRhc2s6IG93bmVkIGJ5IHtAbGluayBDTE9VRF9TQU5EQk9YX0FHRU5UX1NMVUd9IGFuZCBydW5uaW5nIG9uXG4gKiB0aGUgYHNhbmRib3hlc2AgY29tcHV0ZSBwcm92aWRlci4gUmVhZHMgbGlzdC1sZXZlbCBmaWVsZHMgb25seS5cbiAqL1xuZnVuY3Rpb24gaXNDbG91ZFNhbmRib3hUYXNrKHRhc2s6IElUYXNrU3VtbWFyeSk6IGJvb2xlYW4ge1xuXHRjb25zdCBpc0Nsb3VkQ29kaW5nQWdlbnQgPSB0YXNrLmFnZW50X2NvbGxhYm9yYXRvcnM/LnNvbWUoYyA9PiBjLnNsdWcgPT09IENMT1VEX1NBTkRCT1hfQUdFTlRfU0xVRykgPz8gZmFsc2U7XG5cdHJldHVybiBpc0Nsb3VkQ29kaW5nQWdlbnQgJiYgdGFzay5jb21wdXRlPy5wcm92aWRlciA9PT0gJ3NhbmRib3hlcyc7XG59XG5cbi8qKlxuICogVGhlIE1pc3Npb24gQ29udHJvbCBlbnZpcm9ubWVudCBhIHNhbmRib3ggdGFzayBydW5zIGluLCByZWFkIGZyb20gdGhlIGZ1bGwgdGFzaydzIG5lc3RlZFxuICogYHNlc3Npb25zW11gLiBVbmRlZmluZWQgd2hlbiBubyBzZXNzaW9uIGlzIGJvdW5kIHRvIGFuIGVudmlyb25tZW50IHlldC5cbiAqL1xuZnVuY3Rpb24gZ2V0VGFza0Vudmlyb25tZW50QmluZGluZyh0YXNrOiBJVGFza0RldGFpbCk6IHsgZW52aXJvbm1lbnRJZDogc3RyaW5nOyBzZXNzaW9uSWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRhc2suc2Vzc2lvbnMgPz8gW10pIHtcblx0XHRpZiAoc2Vzc2lvbi5lbnZpcm9ubWVudF9pZCAmJiBzZXNzaW9uLmVudmlyb25tZW50X2lkLmxlbmd0aCA+IDAgJiYgc2Vzc2lvbi5pZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4geyBlbnZpcm9ubWVudElkOiBzZXNzaW9uLmVudmlyb25tZW50X2lkLCBzZXNzaW9uSWQ6IHNlc3Npb24uaWQgfTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0I7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBRUE7QUFBQSxPQU9NO0FBQ1AsU0FBUyxxQ0FBcUMsNkJBQTZCO0FBQzNFLFNBQStCLHlCQUF5QixxQkFBcUIsNEJBQTRCO0FBQ3pHLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsUUFBUSx1QkFBdUI7QUFDeEMsU0FBZ0MsOEJBQThCO0FBQzlELFNBQVMsK0JBQStCLCtCQUErRDtBQXlCdkcsTUFBTSxhQUFhO0FBT25CLE1BQU0sOEJBQThCLHNCQUFzQixNQUFTLEVBQUU7QUFHckUsTUFBTSxxQkFBcUI7QUFHM0IsTUFBTSx1QkFBdUI7QUFHN0IsTUFBTSxxQ0FBcUM7QUFHM0MsTUFBTSw0QkFBNEI7QUFHbEMsTUFBTSxrQkFBa0IsQ0FBQyxhQUFhLGNBQWMsUUFBUSxVQUFVO0FBVS9ELElBQU0seUJBQU4sY0FBcUMsV0FBOEM7QUFBQSxFQU16RixZQUNtQyxpQkFDTyx3QkFDUCxpQkFD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
