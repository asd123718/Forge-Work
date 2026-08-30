import { DeferredPromise } from "../../../../base/common/async.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
const restBasePath = "/api/v3";
const graphQlPath = "/api/graphql";
function gitHubRestStep(step) {
  return { kind: "rest", ...step };
}
function gitHubGraphQLStep(step) {
  return { kind: "graphql", ...step };
}
function gitHubJsonResponse(body, options = {}) {
  return { kind: "json", body, ...options };
}
function gitHubTextResponse(body, options = {}) {
  return { kind: "text", body, ...options };
}
function gitHubRawResponse(body, options = {}) {
  return { kind: "raw", body, ...options };
}
function gitHubNotModifiedResponse(options = {}) {
  return { kind: "notModified", ...options };
}
function gitHubRedirectResponse(location, options = {}) {
  return { kind: "redirect", location, ...options };
}
function gitHubDisconnectResponse() {
  return { kind: "disconnect" };
}
function gitHubAbortResponse() {
  return gitHubDisconnectResponse();
}
function gitHubMalformedJsonResponse(options = {}) {
  return {
    kind: "malformedJson",
    body: options.body ?? '{"malformed": true',
    ...options
  };
}
function gitHubRateLimitResponse(options = {}) {
  return { kind: "rateLimit", ...options };
}
function gitHubGraphQLResponse(data, errors = [], options = {}) {
  return gitHubJsonResponse({
    data,
    ...errors.length > 0 ? { errors } : {}
  }, options);
}
class ProgrammableGitHubServer extends Disposable {
  constructor(createServer) {
    super();
    this._closeComplete = new DeferredPromise();
    this._disposeRequested = new DeferredPromise();
    this._sockets = /* @__PURE__ */ new Set();
    this._steps = [];
    this._requests = [];
    this._failures = [];
    this._origin = "";
    this._disposed = false;
    this._server = createServer((request, response) => {
      void this._handle(request, response);
    });
    this._server.on("clientError", (_error, socket) => socket.destroy());
    this._server.on("connection", (socket) => {
      this._sockets.add(socket);
      socket.on("close", () => this._sockets.delete(socket));
    });
    this._server.on("close", () => {
      void this._closeComplete.complete();
    });
  }
  static async start() {
    const http = await import("http");
    const server = new ProgrammableGitHubServer(http.createServer);
    await server._start();
    return server;
  }
  get origin() {
    return this._origin;
  }
  get enterpriseUri() {
    return this._origin;
  }
  get apiBaseUrl() {
    return `${this._origin}${restBasePath}`;
  }
  get graphQlUrl() {
    return `${this._origin}${graphQlPath}`;
  }
  get requests() {
    return this._requests;
  }
  get remainingStepCount() {
    return this._steps.length;
  }
  createEndpointService() {
    return {
      onDidChange: Event.None,
      getApiBaseUri: () => this.apiBaseUrl,
      getGraphQlUri: () => this.graphQlUrl
    };
  }
  enqueue(...steps) {
    this._steps.push(...steps);
    return this;
  }
  assertSatisfied() {
    if (this._failures.length === 1 && this._steps.length === 0) {
      throw this._failures[0];
    }
    const messages = [];
    if (this._failures.length > 0) {
      messages.push(...this._failures.map((error) => `GitHub server failure: ${error.message}`));
    }
    if (this._steps.length > 0) {
      messages.push(`Unconsumed GitHub steps: ${this._steps.map(describeStep).join(", ")}`);
    }
    if (messages.length > 0) {
      throw new Error(messages.join("\n"));
    }
  }
  async disposeAsync() {
    this.dispose();
    await this._closeComplete.p;
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    void this._disposeRequested.complete();
    for (const socket of this._sockets) {
      socket.destroy();
    }
    if (this._server.listening) {
      this._server.close();
    } else {
      void this._closeComplete.complete();
    }
    super.dispose();
  }
  async _start() {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this._server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this._server.off("error", onError);
        const address = this._server.address();
        if (!address || typeof address === "string") {
          reject(new Error("GitHub test server did not expose a TCP address"));
          return;
        }
        this._origin = `http://127.0.0.1:${address.port}`;
        resolve();
      };
      this._server.once("error", onError);
      this._server.once("listening", onListening);
      this._server.listen(0, "127.0.0.1");
    });
  }
  async _handle(request, response) {
    const step = this._steps.shift();
    if (!step) {
      this._recordFailure(new Error(`Unexpected GitHub request: ${request.method ?? "GET"} ${request.url ?? "/"}`));
      this._writeFailure(response, new Error("Unexpected GitHub request"));
      return;
    }
    try {
      const captured = await this._captureRequest(request);
      this._requests.push(captured);
      await this._assertStep(step, captured);
      if (step.waitFor) {
        await this._waitForRelease(step.waitFor);
      }
      if (!this._disposed) {
        this._writeResponse(step.response, response);
      }
    } catch (error) {
      if (this._disposed) {
        return;
      }
      const normalized = asError(error);
      this._recordFailure(normalized);
      if (response.headersSent) {
        response.destroy(normalized);
      } else {
        this._writeFailure(response, normalized);
      }
    }
  }
  async _captureRequest(request) {
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      request.on("end", () => resolve(Buffer.concat(chunks)));
      request.on("error", reject);
      request.on("aborted", () => reject(new Error("GitHub request aborted before the body completed")));
    });
    const bodyText = body.toString("utf8");
    let bodyJson = void 0;
    let bodyJsonError;
    if (bodyText.length > 0) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch (error) {
        bodyJsonError = asError(error).message;
      }
    }
    const url = new URL(request.url ?? "/", this._origin || "http://127.0.0.1");
    const { service, servicePath } = classifyRequestPath(url.pathname);
    return {
      service,
      method: request.method ?? "GET",
      url: url.toString(),
      pathname: url.pathname,
      servicePath,
      search: url.search,
      headers: normalizeHeaders(request.headers),
      bodyText,
      bodyJson,
      bodyJsonError,
      graphQl: readGraphQlRequest(bodyJson)
    };
  }
  async _assertStep(step, request) {
    const expectedMethod = step.kind === "graphql" ? "POST" : step.method;
    if (expectedMethod && request.method !== expectedMethod) {
      throw new Error(`Expected ${expectedMethod} for ${describeStep(step)}, got ${request.method}`);
    }
    if (step.kind === "rest") {
      if (request.service !== "rest") {
        throw new Error(`Expected REST request for ${describeStep(step)}, got ${request.pathname}`);
      }
      if (request.servicePath !== normalizePath(step.path)) {
        throw new Error(`Expected REST path ${normalizePath(step.path)}, got ${request.servicePath}`);
      }
      if (step.query !== void 0 && !queryMatches(step.query, request.search)) {
        throw new Error(`Expected query ${formatExpectedQuery(step.query)}, got ${request.search || "?"}`);
      }
    } else {
      if (request.service !== "graphql") {
        throw new Error(`Expected GraphQL request for ${describeStep(step)}, got ${request.pathname}`);
      }
      if (step.operationName !== void 0 && request.graphQl?.operationName !== step.operationName) {
        throw new Error(`Expected GraphQL operation ${step.operationName}, got ${request.graphQl?.operationName ?? "<none>"}`);
      }
      const queryFragments = Array.isArray(step.queryIncludes) ? step.queryIncludes : step.queryIncludes ? [step.queryIncludes] : [];
      for (const fragment of queryFragments) {
        if (!request.graphQl?.query?.includes(fragment)) {
          throw new Error(`Expected GraphQL query to include ${JSON.stringify(fragment)}`);
        }
      }
    }
    await step.assert?.(request);
  }
  async _waitForRelease(waitFor) {
    await Promise.race([
      Promise.resolve(waitFor),
      this._disposeRequested.p.then(() => Promise.reject(new Error("GitHub server was disposed before the response was released")))
    ]);
  }
  _writeResponse(step, response) {
    switch (step.kind) {
      case "json":
        this._writeBodyResponse(response, step.status ?? 200, JSON.stringify(step.body), "application/json", step);
        return;
      case "text":
        this._writeBodyResponse(response, step.status ?? 200, step.body, step.contentType ?? "text/plain; charset=utf-8", step);
        return;
      case "raw":
        this._writeBodyResponse(response, step.status ?? 200, step.body, step.contentType ?? "application/octet-stream", step);
        return;
      case "notModified":
        this._applyHeaders(response, step);
        response.writeHead(304);
        response.end();
        return;
      case "redirect":
        response.writeHead(step.status ?? 302, {
          ...step.headers,
          Location: step.location
        });
        response.end();
        return;
      case "disconnect":
        response.destroy(new Error("GitHub scripted disconnect"));
        return;
      case "malformedJson":
        this._writeBodyResponse(response, step.status ?? 200, step.body ?? '{"malformed": true', "application/json", step);
        return;
      case "rateLimit": {
        const headers = {};
        if (step.limit !== void 0) {
          headers["x-ratelimit-limit"] = String(step.limit);
        }
        if (step.remaining !== void 0) {
          headers["x-ratelimit-remaining"] = String(step.remaining);
        }
        if (step.used !== void 0) {
          headers["x-ratelimit-used"] = String(step.used);
        }
        if (step.resetAt !== void 0) {
          headers["x-ratelimit-reset"] = String(Math.floor(step.resetAt / 1e3));
        }
        if (step.retryAfterSeconds !== void 0) {
          headers["retry-after"] = String(step.retryAfterSeconds);
        }
        if (step.resource) {
          headers["x-ratelimit-resource"] = step.resource;
        }
        this._writeBodyResponse(response, step.status ?? 403, JSON.stringify({
          message: step.message ?? "You have exceeded a secondary rate limit."
        }), "application/json", { ...step, headers: { ...headers, ...step.headers } });
        return;
      }
    }
  }
  _writeBodyResponse(response, status, body, contentType, metadata) {
    const rawBody = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
    this._applyHeaders(response, {
      ...metadata,
      headers: {
        "Content-Length": String(rawBody.byteLength),
        "Content-Type": contentType,
        ...metadata.headers
      }
    });
    response.writeHead(status);
    response.end(rawBody);
  }
  _applyHeaders(response, metadata) {
    const headers = {
      ...metadata.headers,
      ...metadata.etag ? { ETag: metadata.etag } : void 0,
      ...metadata.link ? { Link: metadata.link } : void 0
    };
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
  }
  _writeFailure(response, error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error.message);
  }
  _recordFailure(error) {
    this._failures.push(error);
  }
}
function normalizeHeaders(headers) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[name] = value;
    } else if (Array.isArray(value)) {
      normalized[name] = value.slice();
    }
  }
  return normalized;
}
function readGraphQlRequest(bodyJson) {
  if (!bodyJson || typeof bodyJson !== "object") {
    return void 0;
  }
  const query = Reflect.get(bodyJson, "query");
  const variables = Reflect.get(bodyJson, "variables");
  const operationName = Reflect.get(bodyJson, "operationName");
  return {
    query: typeof query === "string" ? query : void 0,
    variables,
    operationName: typeof operationName === "string" ? operationName : void 0
  };
}
function classifyRequestPath(pathname) {
  if (pathname === graphQlPath) {
    return { service: "graphql", servicePath: "/" };
  }
  if (pathname.startsWith(restBasePath)) {
    const servicePath = pathname.substring(restBasePath.length) || "/";
    return { service: "rest", servicePath: normalizePath(servicePath) };
  }
  return { service: "unknown", servicePath: pathname || "/" };
}
function normalizePath(path) {
  if (!path || path === "/") {
    return "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}
function queryMatches(expected, actualSearch) {
  return JSON.stringify(normalizeQueryEntries(expected)) === JSON.stringify(normalizeQueryEntries(actualSearch));
}
function normalizeQueryEntries(query) {
  if (typeof query === "string") {
    const search = query.startsWith("?") ? query.substring(1) : query;
    return Array.from(new URLSearchParams(search).entries()).sort(compareEntries);
  }
  const entries = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === void 0) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const element of value) {
        entries.push([key, String(element)]);
      }
    } else {
      entries.push([key, String(value)]);
    }
  }
  return entries.sort(compareEntries);
}
function compareEntries(left, right) {
  return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]);
}
function formatExpectedQuery(query) {
  if (typeof query === "string") {
    return query.startsWith("?") ? query : `?${query}`;
  }
  const params = new URLSearchParams();
  for (const [key, value] of normalizeQueryEntries(query)) {
    params.append(key, value);
  }
  return `?${params.toString()}`;
}
function describeStep(step) {
  const label = step.label ? ` (${step.label})` : "";
  return step.kind === "rest" ? `REST ${step.method ?? "ANY"} ${normalizePath(step.path)}${label}` : `GraphQL ${step.operationName ?? "<anonymous>"}${label}`;
}
function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
export {
  ProgrammableGitHubServer,
  gitHubAbortResponse,
  gitHubDisconnectResponse,
  gitHubGraphQLResponse,
  gitHubGraphQLStep,
  gitHubJsonResponse,
  gitHubMalformedJsonResponse,
  gitHubNotModifiedResponse,
  gitHubRateLimitResponse,
  gitHubRawResponse,
  gitHubRedirectResponse,
  gitHubRestStep,
  gitHubTextResponse
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxwcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgdHlwZSAqIGFzIG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB0eXBlIHsgSUdpdEh1YkVuZHBvaW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViVHlwZXMuanMnO1xuXG5leHBvcnQgdHlwZSBHaXRIdWJNZXRob2QgPSAnR0VUJyB8ICdQT1NUJyB8ICdQVVQnIHwgJ1BBVENIJyB8ICdERUxFVEUnO1xudHlwZSBHaXRIdWJRdWVyeVByaW1pdGl2ZSA9IHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW47XG5leHBvcnQgdHlwZSBHaXRIdWJRdWVyeVZhbHVlID0gR2l0SHViUXVlcnlQcmltaXRpdmUgfCByZWFkb25seSBHaXRIdWJRdWVyeVByaW1pdGl2ZVtdO1xuZXhwb3J0IHR5cGUgR2l0SHViUXVlcnkgPSBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBHaXRIdWJRdWVyeVZhbHVlIHwgdW5kZWZpbmVkPj47XG5leHBvcnQgdHlwZSBDYXB0dXJlZEdpdEh1YkhlYWRlclZhbHVlID0gc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW107XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlY29yZGVkR3JhcGhRTFJlcXVlc3Qge1xuXHRyZWFkb25seSBxdWVyeT86IHN0cmluZztcblx0cmVhZG9ubHkgdmFyaWFibGVzPzogdW5rbm93bjtcblx0cmVhZG9ubHkgb3BlcmF0aW9uTmFtZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVjb3JkZWRHaXRIdWJSZXF1ZXN0IHtcblx0cmVhZG9ubHkgc2VydmljZTogJ3Jlc3QnIHwgJ2dyYXBocWwnIHwgJ3Vua25vd24nO1xuXHRyZWFkb25seSBtZXRob2Q6IHN0cmluZztcblx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhdGhuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlcnZpY2VQYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlYXJjaDogc3RyaW5nO1xuXHRyZWFkb25seSBoZWFkZXJzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBDYXB0dXJlZEdpdEh1YkhlYWRlclZhbHVlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGJvZHlUZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJvZHlKc29uOiB1bmtub3duO1xuXHRyZWFkb25seSBib2R5SnNvbkVycm9yPzogc3RyaW5nO1xuXHRyZWFkb25seSBncmFwaFFsPzogSVJlY29yZGVkR3JhcGhRTFJlcXVlc3Q7XG59XG5cbmludGVyZmFjZSBJR2l0SHViUmVzcG9uc2VCYXNlIHtcblx0cmVhZG9ubHkgc3RhdHVzPzogbnVtYmVyO1xuXHRyZWFkb25seSBoZWFkZXJzPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj47XG5cdHJlYWRvbmx5IGV0YWc/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxpbms/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUpzb25HaXRIdWJSZXNwb25zZSBleHRlbmRzIElHaXRIdWJSZXNwb25zZUJhc2Uge1xuXHRyZWFkb25seSBraW5kOiAnanNvbic7XG5cdHJlYWRvbmx5IGJvZHk6IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRHaXRIdWJSZXNwb25zZSBleHRlbmRzIElHaXRIdWJSZXNwb25zZUJhc2Uge1xuXHRyZWFkb25seSBraW5kOiAndGV4dCc7XG5cdHJlYWRvbmx5IGJvZHk6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudFR5cGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhd0dpdEh1YlJlc3BvbnNlIGV4dGVuZHMgSUdpdEh1YlJlc3BvbnNlQmFzZSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdyYXcnO1xuXHRyZWFkb25seSBib2R5OiBzdHJpbmcgfCBVaW50OEFycmF5O1xuXHRyZWFkb25seSBjb250ZW50VHlwZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90TW9kaWZpZWRHaXRIdWJSZXNwb25zZSBleHRlbmRzIE9taXQ8SUdpdEh1YlJlc3BvbnNlQmFzZSwgJ3N0YXR1cyc+IHtcblx0cmVhZG9ubHkga2luZDogJ25vdE1vZGlmaWVkJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVkaXJlY3RHaXRIdWJSZXNwb25zZSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdyZWRpcmVjdCc7XG5cdHJlYWRvbmx5IGxvY2F0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXR1cz86IDMwMSB8IDMwMiB8IDMwNyB8IDMwODtcblx0cmVhZG9ubHkgaGVhZGVycz86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHN0cmluZz4+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaXNjb25uZWN0R2l0SHViUmVzcG9uc2Uge1xuXHRyZWFkb25seSBraW5kOiAnZGlzY29ubmVjdCc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1hbGZvcm1lZEpzb25HaXRIdWJSZXNwb25zZSBleHRlbmRzIE9taXQ8SUdpdEh1YlJlc3BvbnNlQmFzZSwgJ3N0YXR1cyc+IHtcblx0cmVhZG9ubHkga2luZDogJ21hbGZvcm1lZEpzb24nO1xuXHRyZWFkb25seSBzdGF0dXM/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGJvZHk/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhdGVMaW1pdEdpdEh1YlJlc3BvbnNlIGV4dGVuZHMgSUdpdEh1YlJlc3BvbnNlQmFzZSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdyYXRlTGltaXQnO1xuXHRyZWFkb25seSBzdGF0dXM/OiA0MDMgfCA0Mjk7XG5cdHJlYWRvbmx5IHJlc291cmNlPzogc3RyaW5nO1xuXHRyZWFkb25seSBsaW1pdD86IG51bWJlcjtcblx0cmVhZG9ubHkgcmVtYWluaW5nPzogbnVtYmVyO1xuXHRyZWFkb25seSB1c2VkPzogbnVtYmVyO1xuXHRyZWFkb25seSByZXNldEF0PzogbnVtYmVyO1xuXHRyZWFkb25seSByZXRyeUFmdGVyU2Vjb25kcz86IG51bWJlcjtcblx0cmVhZG9ubHkgbWVzc2FnZT86IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgR2l0SHViU2VydmVyUmVzcG9uc2UgPVxuXHR8IElKc29uR2l0SHViUmVzcG9uc2Vcblx0fCBJVGV4dEdpdEh1YlJlc3BvbnNlXG5cdHwgSVJhd0dpdEh1YlJlc3BvbnNlXG5cdHwgSU5vdE1vZGlmaWVkR2l0SHViUmVzcG9uc2Vcblx0fCBJUmVkaXJlY3RHaXRIdWJSZXNwb25zZVxuXHR8IElEaXNjb25uZWN0R2l0SHViUmVzcG9uc2Vcblx0fCBJTWFsZm9ybWVkSnNvbkdpdEh1YlJlc3BvbnNlXG5cdHwgSVJhdGVMaW1pdEdpdEh1YlJlc3BvbnNlO1xuXG5leHBvcnQgaW50ZXJmYWNlIElHaXRIdWJHcmFwaFFMRXJyb3Ige1xuXHRyZWFkb25seSBtZXNzYWdlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhdGg/OiByZWFkb25seSAoc3RyaW5nIHwgbnVtYmVyKVtdO1xuXHRyZWFkb25seSBleHRlbnNpb25zPzoge1xuXHRcdHJlYWRvbmx5IGNvZGU/OiBzdHJpbmc7XG5cdH07XG59XG5cbmludGVyZmFjZSBJR2l0SHViU2VydmVyU3RlcEJhc2Uge1xuXHRyZWFkb25seSBsYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgd2FpdEZvcj86IFByb21pc2VMaWtlPHZvaWQ+O1xuXHRyZWFkb25seSBhc3NlcnQ/OiAocmVxdWVzdDogSVJlY29yZGVkR2l0SHViUmVxdWVzdCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc3RHaXRIdWJTZXJ2ZXJTdGVwIGV4dGVuZHMgSUdpdEh1YlNlcnZlclN0ZXBCYXNlIHtcblx0cmVhZG9ubHkga2luZDogJ3Jlc3QnO1xuXHRyZWFkb25seSBtZXRob2Q/OiBHaXRIdWJNZXRob2Q7XG5cdHJlYWRvbmx5IHBhdGg6IHN0cmluZztcblx0cmVhZG9ubHkgcXVlcnk/OiBzdHJpbmcgfCBHaXRIdWJRdWVyeTtcblx0cmVhZG9ubHkgcmVzcG9uc2U6IEdpdEh1YlNlcnZlclJlc3BvbnNlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHcmFwaFFMR2l0SHViU2VydmVyU3RlcCBleHRlbmRzIElHaXRIdWJTZXJ2ZXJTdGVwQmFzZSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdncmFwaHFsJztcblx0cmVhZG9ubHkgb3BlcmF0aW9uTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgcXVlcnlJbmNsdWRlcz86IHN0cmluZyB8IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSByZXNwb25zZTogR2l0SHViU2VydmVyUmVzcG9uc2U7XG59XG5cbmV4cG9ydCB0eXBlIEdpdEh1YlNlcnZlclN0ZXAgPSBJUmVzdEdpdEh1YlNlcnZlclN0ZXAgfCBJR3JhcGhRTEdpdEh1YlNlcnZlclN0ZXA7XG5cbmNvbnN0IHJlc3RCYXNlUGF0aCA9ICcvYXBpL3YzJztcbmNvbnN0IGdyYXBoUWxQYXRoID0gJy9hcGkvZ3JhcGhxbCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnaXRIdWJSZXN0U3RlcChzdGVwOiBPbWl0PElSZXN0R2l0SHViU2VydmVyU3RlcCwgJ2tpbmQnPik6IElSZXN0R2l0SHViU2VydmVyU3RlcCB7XG5cdHJldHVybiB7IGtpbmQ6ICdyZXN0JywgLi4uc3RlcCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2l0SHViR3JhcGhRTFN0ZXAoc3RlcDogT21pdDxJR3JhcGhRTEdpdEh1YlNlcnZlclN0ZXAsICdraW5kJz4pOiBJR3JhcGhRTEdpdEh1YlNlcnZlclN0ZXAge1xuXHRyZXR1cm4geyBraW5kOiAnZ3JhcGhxbCcsIC4uLnN0ZXAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdpdEh1Ykpzb25SZXNwb25zZShib2R5OiB1bmtub3duLCBvcHRpb25zOiBPbWl0PElKc29uR2l0SHViUmVzcG9uc2UsICdraW5kJyB8ICdib2R5Jz4gPSB7fSk6IElKc29uR2l0SHViUmVzcG9uc2Uge1xuXHRyZXR1cm4geyBraW5kOiAnanNvbicsIGJvZHksIC4uLm9wdGlvbnMgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdpdEh1YlRleHRSZXNwb25zZShib2R5OiBzdHJpbmcsIG9wdGlvbnM6IE9taXQ8SVRleHRHaXRIdWJSZXNwb25zZSwgJ2tpbmQnIHwgJ2JvZHknPiA9IHt9KTogSVRleHRHaXRIdWJSZXNwb25zZSB7XG5cdHJldHVybiB7IGtpbmQ6ICd0ZXh0JywgYm9keSwgLi4ub3B0aW9ucyB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2l0SHViUmF3UmVzcG9uc2UoYm9keTogc3RyaW5nIHwgVWludDhBcnJheSwgb3B0aW9uczogT21pdDxJUmF3R2l0SHViUmVzcG9uc2UsICdraW5kJyB8ICdib2R5Jz4gPSB7fSk6IElSYXdHaXRIdWJSZXNwb25zZSB7XG5cdHJldHVybiB7IGtpbmQ6ICdyYXcnLCBib2R5LCAuLi5vcHRpb25zIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnaXRIdWJOb3RNb2RpZmllZFJlc3BvbnNlKG9wdGlvbnM6IE9taXQ8SU5vdE1vZGlmaWVkR2l0SHViUmVzcG9uc2UsICdraW5kJz4gPSB7fSk6IElOb3RNb2RpZmllZEdpdEh1YlJlc3BvbnNlIHtcblx0cmV0dXJuIHsga2luZDogJ25vdE1vZGlmaWVkJywgLi4ub3B0aW9ucyB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2l0SHViUmVkaXJlY3RSZXNwb25zZShsb2NhdGlvbjogc3RyaW5nLCBvcHRpb25zOiBPbWl0PElSZWRpcmVjdEdpdEh1YlJlc3BvbnNlLCAna2luZCcgfCAnbG9jYXRpb24nPiA9IHt9KTogSVJlZGlyZWN0R2l0SHViUmVzcG9uc2Uge1xuXHRyZXR1cm4geyBraW5kOiAncmVkaXJlY3QnLCBsb2NhdGlvbiwgLi4ub3B0aW9ucyB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2l0SHViRGlzY29ubmVjdFJlc3BvbnNlKCk6IElEaXNjb25uZWN0R2l0SHViUmVzcG9uc2Uge1xuXHRyZXR1cm4geyBraW5kOiAnZGlzY29ubmVjdCcgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdpdEh1YkFib3J0UmVzcG9uc2UoKTogSURpc2Nvbm5lY3RHaXRIdWJSZXNwb25zZSB7XG5cdHJldHVybiBnaXRIdWJEaXNjb25uZWN0UmVzcG9uc2UoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdpdEh1Yk1hbGZvcm1lZEpzb25SZXNwb25zZShvcHRpb25zOiBPbWl0PElNYWxmb3JtZWRKc29uR2l0SHViUmVzcG9uc2UsICdraW5kJz4gPSB7fSk6IElNYWxmb3JtZWRKc29uR2l0SHViUmVzcG9uc2Uge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdtYWxmb3JtZWRKc29uJyxcblx0XHRib2R5OiBvcHRpb25zLmJvZHkgPz8gJ3tcIm1hbGZvcm1lZFwiOiB0cnVlJyxcblx0XHQuLi5vcHRpb25zLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2l0SHViUmF0ZUxpbWl0UmVzcG9uc2Uob3B0aW9uczogT21pdDxJUmF0ZUxpbWl0R2l0SHViUmVzcG9uc2UsICdraW5kJz4gPSB7fSk6IElSYXRlTGltaXRHaXRIdWJSZXNwb25zZSB7XG5cdHJldHVybiB7IGtpbmQ6ICdyYXRlTGltaXQnLCAuLi5vcHRpb25zIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnaXRIdWJHcmFwaFFMUmVzcG9uc2U8VD4oXG5cdGRhdGE6IFQgfCB1bmRlZmluZWQsXG5cdGVycm9yczogcmVhZG9ubHkgSUdpdEh1YkdyYXBoUUxFcnJvcltdID0gW10sXG5cdG9wdGlvbnM6IE9taXQ8SUpzb25HaXRIdWJSZXNwb25zZSwgJ2tpbmQnIHwgJ2JvZHknPiA9IHt9LFxuKTogSUpzb25HaXRIdWJSZXNwb25zZSB7XG5cdHJldHVybiBnaXRIdWJKc29uUmVzcG9uc2Uoe1xuXHRcdGRhdGEsXG5cdFx0Li4uKGVycm9ycy5sZW5ndGggPiAwID8geyBlcnJvcnMgfSA6IHt9KSxcblx0fSwgb3B0aW9ucyk7XG59XG5cbi8qKlxuICogQSBsb29wYmFjay1vbmx5IEdpdEh1YiB0ZXN0IHNlcnZlciB3aXRoIGFuIG9yZGVyZWQgcmVxdWVzdCBzY3JpcHQuXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTxQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXI+IHtcblx0XHRjb25zdCBodHRwID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdFx0Y29uc3Qgc2VydmVyID0gbmV3IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlcihodHRwLmNyZWF0ZVNlcnZlcik7XG5cdFx0YXdhaXQgc2VydmVyLl9zdGFydCgpO1xuXHRcdHJldHVybiBzZXJ2ZXI7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXI6IGh0dHAuU2VydmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZUNvbXBsZXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NlUmVxdWVzdGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zb2NrZXRzID0gbmV3IFNldDxuZXQuU29ja2V0PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGVwczogR2l0SHViU2VydmVyU3RlcFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3RzOiBJUmVjb3JkZWRHaXRIdWJSZXF1ZXN0W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmFpbHVyZXM6IEVycm9yW10gPSBbXTtcblx0cHJpdmF0ZSBfb3JpZ2luID0gJyc7XG5cdHByaXZhdGUgX2Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcihjcmVhdGVTZXJ2ZXI6IHR5cGVvZiBodHRwLmNyZWF0ZVNlcnZlcikge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoKHJlcXVlc3QsIHJlc3BvbnNlKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuX2hhbmRsZShyZXF1ZXN0LCByZXNwb25zZSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fc2VydmVyLm9uKCdjbGllbnRFcnJvcicsIChfZXJyb3IsIHNvY2tldCkgPT4gc29ja2V0LmRlc3Ryb3koKSk7XG5cdFx0dGhpcy5fc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcblx0XHRcdHRoaXMuX3NvY2tldHMuYWRkKHNvY2tldCk7XG5cdFx0XHRzb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4gdGhpcy5fc29ja2V0cy5kZWxldGUoc29ja2V0KSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fc2VydmVyLm9uKCdjbG9zZScsICgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5fY2xvc2VDb21wbGV0ZS5jb21wbGV0ZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0IG9yaWdpbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9vcmlnaW47XG5cdH1cblxuXHRnZXQgZW50ZXJwcmlzZVVyaSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9vcmlnaW47XG5cdH1cblxuXHRnZXQgYXBpQmFzZVVybCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLl9vcmlnaW59JHtyZXN0QmFzZVBhdGh9YDtcblx0fVxuXG5cdGdldCBncmFwaFFsVXJsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuX29yaWdpbn0ke2dyYXBoUWxQYXRofWA7XG5cdH1cblxuXHRnZXQgcmVxdWVzdHMoKTogcmVhZG9ubHkgSVJlY29yZGVkR2l0SHViUmVxdWVzdFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdHM7XG5cdH1cblxuXHRnZXQgcmVtYWluaW5nU3RlcENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0ZXBzLmxlbmd0aDtcblx0fVxuXG5cdGNyZWF0ZUVuZHBvaW50U2VydmljZSgpOiBJR2l0SHViRW5kcG9pbnRQcm92aWRlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0Z2V0QXBpQmFzZVVyaTogKCkgPT4gdGhpcy5hcGlCYXNlVXJsLFxuXHRcdFx0Z2V0R3JhcGhRbFVyaTogKCkgPT4gdGhpcy5ncmFwaFFsVXJsLFxuXHRcdH07XG5cdH1cblxuXHRlbnF1ZXVlKC4uLnN0ZXBzOiByZWFkb25seSBHaXRIdWJTZXJ2ZXJTdGVwW10pOiB0aGlzIHtcblx0XHR0aGlzLl9zdGVwcy5wdXNoKC4uLnN0ZXBzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGFzc2VydFNhdGlzZmllZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZmFpbHVyZXMubGVuZ3RoID09PSAxICYmIHRoaXMuX3N0ZXBzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgdGhpcy5fZmFpbHVyZXNbMF07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHRoaXMuX2ZhaWx1cmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2goLi4udGhpcy5fZmFpbHVyZXMubWFwKGVycm9yID0+IGBHaXRIdWIgc2VydmVyIGZhaWx1cmU6ICR7ZXJyb3IubWVzc2FnZX1gKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGVwcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKGBVbmNvbnN1bWVkIEdpdEh1YiBzdGVwczogJHt0aGlzLl9zdGVwcy5tYXAoZGVzY3JpYmVTdGVwKS5qb2luKCcsICcpfWApO1xuXHRcdH1cblxuXHRcdGlmIChtZXNzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobWVzc2FnZXMuam9pbignXFxuJykpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRpc3Bvc2VBc3luYygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0aGlzLl9jbG9zZUNvbXBsZXRlLnA7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR2b2lkIHRoaXMuX2Rpc3Bvc2VSZXF1ZXN0ZWQuY29tcGxldGUoKTtcblx0XHRmb3IgKGNvbnN0IHNvY2tldCBvZiB0aGlzLl9zb2NrZXRzKSB7XG5cdFx0XHRzb2NrZXQuZGVzdHJveSgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zZXJ2ZXIubGlzdGVuaW5nKSB7XG5cdFx0XHR0aGlzLl9zZXJ2ZXIuY2xvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dm9pZCB0aGlzLl9jbG9zZUNvbXBsZXRlLmNvbXBsZXRlKCk7XG5cdFx0fVxuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3Qgb25FcnJvciA9IChlcnJvcjogRXJyb3IpID0+IHtcblx0XHRcdFx0dGhpcy5fc2VydmVyLm9mZignbGlzdGVuaW5nJywgb25MaXN0ZW5pbmcpO1xuXHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG9uTGlzdGVuaW5nID0gKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZXJ2ZXIub2ZmKCdlcnJvcicsIG9uRXJyb3IpO1xuXHRcdFx0XHRjb25zdCBhZGRyZXNzID0gdGhpcy5fc2VydmVyLmFkZHJlc3MoKTtcblx0XHRcdFx0aWYgKCFhZGRyZXNzIHx8IHR5cGVvZiBhZGRyZXNzID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ0dpdEh1YiB0ZXN0IHNlcnZlciBkaWQgbm90IGV4cG9zZSBhIFRDUCBhZGRyZXNzJykpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vcmlnaW4gPSBgaHR0cDovLzEyNy4wLjAuMToke2FkZHJlc3MucG9ydH1gO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9zZXJ2ZXIub25jZSgnZXJyb3InLCBvbkVycm9yKTtcblx0XHRcdHRoaXMuX3NlcnZlci5vbmNlKCdsaXN0ZW5pbmcnLCBvbkxpc3RlbmluZyk7XG5cdFx0XHR0aGlzLl9zZXJ2ZXIubGlzdGVuKDAsICcxMjcuMC4wLjEnKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZShyZXF1ZXN0OiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzcG9uc2U6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdGVwID0gdGhpcy5fc3RlcHMuc2hpZnQoKTtcblx0XHRpZiAoIXN0ZXApIHtcblx0XHRcdHRoaXMuX3JlY29yZEZhaWx1cmUobmV3IEVycm9yKGBVbmV4cGVjdGVkIEdpdEh1YiByZXF1ZXN0OiAke3JlcXVlc3QubWV0aG9kID8/ICdHRVQnfSAke3JlcXVlc3QudXJsID8/ICcvJ31gKSk7XG5cdFx0XHR0aGlzLl93cml0ZUZhaWx1cmUocmVzcG9uc2UsIG5ldyBFcnJvcignVW5leHBlY3RlZCBHaXRIdWIgcmVxdWVzdCcpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FwdHVyZWQgPSBhd2FpdCB0aGlzLl9jYXB0dXJlUmVxdWVzdChyZXF1ZXN0KTtcblx0XHRcdHRoaXMuX3JlcXVlc3RzLnB1c2goY2FwdHVyZWQpO1xuXHRcdFx0YXdhaXQgdGhpcy5fYXNzZXJ0U3RlcChzdGVwLCBjYXB0dXJlZCk7XG5cdFx0XHRpZiAoc3RlcC53YWl0Rm9yKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JSZWxlYXNlKHN0ZXAud2FpdEZvcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRoaXMuX3dyaXRlUmVzcG9uc2Uoc3RlcC5yZXNwb25zZSwgcmVzcG9uc2UpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZCA9IGFzRXJyb3IoZXJyb3IpO1xuXHRcdFx0dGhpcy5fcmVjb3JkRmFpbHVyZShub3JtYWxpemVkKTtcblx0XHRcdGlmIChyZXNwb25zZS5oZWFkZXJzU2VudCkge1xuXHRcdFx0XHRyZXNwb25zZS5kZXN0cm95KG5vcm1hbGl6ZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fd3JpdGVGYWlsdXJlKHJlc3BvbnNlLCBub3JtYWxpemVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYXB0dXJlUmVxdWVzdChyZXF1ZXN0OiBodHRwLkluY29taW5nTWVzc2FnZSk6IFByb21pc2U8SVJlY29yZGVkR2l0SHViUmVxdWVzdD4ge1xuXHRcdGNvbnN0IGJvZHkgPSBhd2FpdCBuZXcgUHJvbWlzZTxCdWZmZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHJlcXVlc3Qub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChCdWZmZXIuaXNCdWZmZXIoY2h1bmspID8gY2h1bmsgOiBCdWZmZXIuZnJvbShjaHVuaykpKTtcblx0XHRcdHJlcXVlc3Qub24oJ2VuZCcsICgpID0+IHJlc29sdmUoQnVmZmVyLmNvbmNhdChjaHVua3MpKSk7XG5cdFx0XHRyZXF1ZXN0Lm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRyZXF1ZXN0Lm9uKCdhYm9ydGVkJywgKCkgPT4gcmVqZWN0KG5ldyBFcnJvcignR2l0SHViIHJlcXVlc3QgYWJvcnRlZCBiZWZvcmUgdGhlIGJvZHkgY29tcGxldGVkJykpKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGJvZHlUZXh0ID0gYm9keS50b1N0cmluZygndXRmOCcpO1xuXHRcdGxldCBib2R5SnNvbjogdW5rbm93biA9IHVuZGVmaW5lZDtcblx0XHRsZXQgYm9keUpzb25FcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChib2R5VGV4dC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRib2R5SnNvbiA9IEpTT04ucGFyc2UoYm9keVRleHQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ym9keUpzb25FcnJvciA9IGFzRXJyb3IoZXJyb3IpLm1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTChyZXF1ZXN0LnVybCA/PyAnLycsIHRoaXMuX29yaWdpbiB8fCAnaHR0cDovLzEyNy4wLjAuMScpO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2VydmljZVBhdGggfSA9IGNsYXNzaWZ5UmVxdWVzdFBhdGgodXJsLnBhdGhuYW1lKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VydmljZSxcblx0XHRcdG1ldGhvZDogcmVxdWVzdC5tZXRob2QgPz8gJ0dFVCcsXG5cdFx0XHR1cmw6IHVybC50b1N0cmluZygpLFxuXHRcdFx0cGF0aG5hbWU6IHVybC5wYXRobmFtZSxcblx0XHRcdHNlcnZpY2VQYXRoLFxuXHRcdFx0c2VhcmNoOiB1cmwuc2VhcmNoLFxuXHRcdFx0aGVhZGVyczogbm9ybWFsaXplSGVhZGVycyhyZXF1ZXN0LmhlYWRlcnMpLFxuXHRcdFx0Ym9keVRleHQsXG5cdFx0XHRib2R5SnNvbixcblx0XHRcdGJvZHlKc29uRXJyb3IsXG5cdFx0XHRncmFwaFFsOiByZWFkR3JhcGhRbFJlcXVlc3QoYm9keUpzb24pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hc3NlcnRTdGVwKHN0ZXA6IEdpdEh1YlNlcnZlclN0ZXAsIHJlcXVlc3Q6IElSZWNvcmRlZEdpdEh1YlJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHBlY3RlZE1ldGhvZCA9IHN0ZXAua2luZCA9PT0gJ2dyYXBocWwnID8gJ1BPU1QnIDogc3RlcC5tZXRob2Q7XG5cdFx0aWYgKGV4cGVjdGVkTWV0aG9kICYmIHJlcXVlc3QubWV0aG9kICE9PSBleHBlY3RlZE1ldGhvZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCAke2V4cGVjdGVkTWV0aG9kfSBmb3IgJHtkZXNjcmliZVN0ZXAoc3RlcCl9LCBnb3QgJHtyZXF1ZXN0Lm1ldGhvZH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3RlcC5raW5kID09PSAncmVzdCcpIHtcblx0XHRcdGlmIChyZXF1ZXN0LnNlcnZpY2UgIT09ICdyZXN0Jykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIFJFU1QgcmVxdWVzdCBmb3IgJHtkZXNjcmliZVN0ZXAoc3RlcCl9LCBnb3QgJHtyZXF1ZXN0LnBhdGhuYW1lfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlcXVlc3Quc2VydmljZVBhdGggIT09IG5vcm1hbGl6ZVBhdGgoc3RlcC5wYXRoKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIFJFU1QgcGF0aCAke25vcm1hbGl6ZVBhdGgoc3RlcC5wYXRoKX0sIGdvdCAke3JlcXVlc3Quc2VydmljZVBhdGh9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RlcC5xdWVyeSAhPT0gdW5kZWZpbmVkICYmICFxdWVyeU1hdGNoZXMoc3RlcC5xdWVyeSwgcmVxdWVzdC5zZWFyY2gpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgcXVlcnkgJHtmb3JtYXRFeHBlY3RlZFF1ZXJ5KHN0ZXAucXVlcnkpfSwgZ290ICR7cmVxdWVzdC5zZWFyY2ggfHwgJz8nfWApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAocmVxdWVzdC5zZXJ2aWNlICE9PSAnZ3JhcGhxbCcpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBHcmFwaFFMIHJlcXVlc3QgZm9yICR7ZGVzY3JpYmVTdGVwKHN0ZXApfSwgZ290ICR7cmVxdWVzdC5wYXRobmFtZX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGVwLm9wZXJhdGlvbk5hbWUgIT09IHVuZGVmaW5lZCAmJiByZXF1ZXN0LmdyYXBoUWw/Lm9wZXJhdGlvbk5hbWUgIT09IHN0ZXAub3BlcmF0aW9uTmFtZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIEdyYXBoUUwgb3BlcmF0aW9uICR7c3RlcC5vcGVyYXRpb25OYW1lfSwgZ290ICR7cmVxdWVzdC5ncmFwaFFsPy5vcGVyYXRpb25OYW1lID8/ICc8bm9uZT4nfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcXVlcnlGcmFnbWVudHMgPSBBcnJheS5pc0FycmF5KHN0ZXAucXVlcnlJbmNsdWRlcykgPyBzdGVwLnF1ZXJ5SW5jbHVkZXMgOiBzdGVwLnF1ZXJ5SW5jbHVkZXMgPyBbc3RlcC5xdWVyeUluY2x1ZGVzXSA6IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBmcmFnbWVudCBvZiBxdWVyeUZyYWdtZW50cykge1xuXHRcdFx0XHRpZiAoIXJlcXVlc3QuZ3JhcGhRbD8ucXVlcnk/LmluY2x1ZGVzKGZyYWdtZW50KSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgR3JhcGhRTCBxdWVyeSB0byBpbmNsdWRlICR7SlNPTi5zdHJpbmdpZnkoZnJhZ21lbnQpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgc3RlcC5hc3NlcnQ/LihyZXF1ZXN0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JSZWxlYXNlKHdhaXRGb3I6IFByb21pc2VMaWtlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFByb21pc2UucmVzb2x2ZSh3YWl0Rm9yKSxcblx0XHRcdHRoaXMuX2Rpc3Bvc2VSZXF1ZXN0ZWQucC50aGVuKCgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignR2l0SHViIHNlcnZlciB3YXMgZGlzcG9zZWQgYmVmb3JlIHRoZSByZXNwb25zZSB3YXMgcmVsZWFzZWQnKSkpLFxuXHRcdF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfd3JpdGVSZXNwb25zZShzdGVwOiBHaXRIdWJTZXJ2ZXJSZXNwb25zZSwgcmVzcG9uc2U6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHN0ZXAua2luZCkge1xuXHRcdFx0Y2FzZSAnanNvbic6XG5cdFx0XHRcdHRoaXMuX3dyaXRlQm9keVJlc3BvbnNlKHJlc3BvbnNlLCBzdGVwLnN0YXR1cyA/PyAyMDAsIEpTT04uc3RyaW5naWZ5KHN0ZXAuYm9keSksICdhcHBsaWNhdGlvbi9qc29uJywgc3RlcCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHR0aGlzLl93cml0ZUJvZHlSZXNwb25zZShyZXNwb25zZSwgc3RlcC5zdGF0dXMgPz8gMjAwLCBzdGVwLmJvZHksIHN0ZXAuY29udGVudFR5cGUgPz8gJ3RleHQvcGxhaW47IGNoYXJzZXQ9dXRmLTgnLCBzdGVwKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0Y2FzZSAncmF3Jzpcblx0XHRcdFx0dGhpcy5fd3JpdGVCb2R5UmVzcG9uc2UocmVzcG9uc2UsIHN0ZXAuc3RhdHVzID8/IDIwMCwgc3RlcC5ib2R5LCBzdGVwLmNvbnRlbnRUeXBlID8/ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nLCBzdGVwKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0Y2FzZSAnbm90TW9kaWZpZWQnOlxuXHRcdFx0XHR0aGlzLl9hcHBseUhlYWRlcnMocmVzcG9uc2UsIHN0ZXApO1xuXHRcdFx0XHRyZXNwb25zZS53cml0ZUhlYWQoMzA0KTtcblx0XHRcdFx0cmVzcG9uc2UuZW5kKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgJ3JlZGlyZWN0Jzpcblx0XHRcdFx0cmVzcG9uc2Uud3JpdGVIZWFkKHN0ZXAuc3RhdHVzID8/IDMwMiwge1xuXHRcdFx0XHRcdC4uLnN0ZXAuaGVhZGVycyxcblx0XHRcdFx0XHRMb2NhdGlvbjogc3RlcC5sb2NhdGlvbixcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlc3BvbnNlLmVuZCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlICdkaXNjb25uZWN0Jzpcblx0XHRcdFx0cmVzcG9uc2UuZGVzdHJveShuZXcgRXJyb3IoJ0dpdEh1YiBzY3JpcHRlZCBkaXNjb25uZWN0JykpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlICdtYWxmb3JtZWRKc29uJzpcblx0XHRcdFx0dGhpcy5fd3JpdGVCb2R5UmVzcG9uc2UocmVzcG9uc2UsIHN0ZXAuc3RhdHVzID8/IDIwMCwgc3RlcC5ib2R5ID8/ICd7XCJtYWxmb3JtZWRcIjogdHJ1ZScsICdhcHBsaWNhdGlvbi9qc29uJywgc3RlcCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgJ3JhdGVMaW1pdCc6IHtcblx0XHRcdFx0Y29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdFx0XHRpZiAoc3RlcC5saW1pdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aGVhZGVyc1sneC1yYXRlbGltaXQtbGltaXQnXSA9IFN0cmluZyhzdGVwLmxpbWl0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RlcC5yZW1haW5pbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGhlYWRlcnNbJ3gtcmF0ZWxpbWl0LXJlbWFpbmluZyddID0gU3RyaW5nKHN0ZXAucmVtYWluaW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RlcC51c2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRoZWFkZXJzWyd4LXJhdGVsaW1pdC11c2VkJ10gPSBTdHJpbmcoc3RlcC51c2VkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RlcC5yZXNldEF0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRoZWFkZXJzWyd4LXJhdGVsaW1pdC1yZXNldCddID0gU3RyaW5nKE1hdGguZmxvb3Ioc3RlcC5yZXNldEF0IC8gMTAwMCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdGVwLnJldHJ5QWZ0ZXJTZWNvbmRzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRoZWFkZXJzWydyZXRyeS1hZnRlciddID0gU3RyaW5nKHN0ZXAucmV0cnlBZnRlclNlY29uZHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdGVwLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0aGVhZGVyc1sneC1yYXRlbGltaXQtcmVzb3VyY2UnXSA9IHN0ZXAucmVzb3VyY2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fd3JpdGVCb2R5UmVzcG9uc2UocmVzcG9uc2UsIHN0ZXAuc3RhdHVzID8/IDQwMywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IHN0ZXAubWVzc2FnZSA/PyAnWW91IGhhdmUgZXhjZWVkZWQgYSBzZWNvbmRhcnkgcmF0ZSBsaW1pdC4nLFxuXHRcdFx0XHR9KSwgJ2FwcGxpY2F0aW9uL2pzb24nLCB7IC4uLnN0ZXAsIGhlYWRlcnM6IHsgLi4uaGVhZGVycywgLi4uc3RlcC5oZWFkZXJzIH0gfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZUJvZHlSZXNwb25zZShcblx0XHRyZXNwb25zZTogaHR0cC5TZXJ2ZXJSZXNwb25zZSxcblx0XHRzdGF0dXM6IG51bWJlcixcblx0XHRib2R5OiBzdHJpbmcgfCBVaW50OEFycmF5LFxuXHRcdGNvbnRlbnRUeXBlOiBzdHJpbmcsXG5cdFx0bWV0YWRhdGE6IElHaXRIdWJSZXNwb25zZUJhc2UsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0JvZHkgPSB0eXBlb2YgYm9keSA9PT0gJ3N0cmluZycgPyBCdWZmZXIuZnJvbShib2R5LCAndXRmOCcpIDogQnVmZmVyLmZyb20oYm9keSk7XG5cdFx0dGhpcy5fYXBwbHlIZWFkZXJzKHJlc3BvbnNlLCB7XG5cdFx0XHQuLi5tZXRhZGF0YSxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J0NvbnRlbnQtTGVuZ3RoJzogU3RyaW5nKHJhd0JvZHkuYnl0ZUxlbmd0aCksXG5cdFx0XHRcdCdDb250ZW50LVR5cGUnOiBjb250ZW50VHlwZSxcblx0XHRcdFx0Li4ubWV0YWRhdGEuaGVhZGVycyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0cmVzcG9uc2Uud3JpdGVIZWFkKHN0YXR1cyk7XG5cdFx0cmVzcG9uc2UuZW5kKHJhd0JvZHkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlIZWFkZXJzKHJlc3BvbnNlOiBodHRwLlNlcnZlclJlc3BvbnNlLCBtZXRhZGF0YTogSUdpdEh1YlJlc3BvbnNlQmFzZSk6IHZvaWQge1xuXHRcdGNvbnN0IGhlYWRlcnMgPSB7XG5cdFx0XHQuLi5tZXRhZGF0YS5oZWFkZXJzLFxuXHRcdFx0Li4uKG1ldGFkYXRhLmV0YWcgPyB7IEVUYWc6IG1ldGFkYXRhLmV0YWcgfSA6IHVuZGVmaW5lZCksXG5cdFx0XHQuLi4obWV0YWRhdGEubGluayA/IHsgTGluazogbWV0YWRhdGEubGluayB9IDogdW5kZWZpbmVkKSxcblx0XHR9O1xuXHRcdGZvciAoY29uc3QgW25hbWUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhoZWFkZXJzKSkge1xuXHRcdFx0cmVzcG9uc2Uuc2V0SGVhZGVyKG5hbWUsIHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZUZhaWx1cmUocmVzcG9uc2U6IGh0dHAuU2VydmVyUmVzcG9uc2UsIGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdHJlc3BvbnNlLndyaXRlSGVhZCg1MDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04JyB9KTtcblx0XHRyZXNwb25zZS5lbmQoZXJyb3IubWVzc2FnZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvcmRGYWlsdXJlKGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX2ZhaWx1cmVzLnB1c2goZXJyb3IpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUhlYWRlcnMoaGVhZGVyczogaHR0cC5JbmNvbWluZ0h0dHBIZWFkZXJzKTogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgQ2FwdHVyZWRHaXRIdWJIZWFkZXJWYWx1ZSB8IHVuZGVmaW5lZD4+IHtcblx0Y29uc3Qgbm9ybWFsaXplZDogUmVjb3JkPHN0cmluZywgQ2FwdHVyZWRHaXRIdWJIZWFkZXJWYWx1ZSB8IHVuZGVmaW5lZD4gPSB7fTtcblx0Zm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGhlYWRlcnMpKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG5vcm1hbGl6ZWRbbmFtZV0gPSB2YWx1ZTtcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRub3JtYWxpemVkW25hbWVdID0gdmFsdWUuc2xpY2UoKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG5vcm1hbGl6ZWQ7XG59XG5cbmZ1bmN0aW9uIHJlYWRHcmFwaFFsUmVxdWVzdChib2R5SnNvbjogdW5rbm93bik6IElSZWNvcmRlZEdyYXBoUUxSZXF1ZXN0IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFib2R5SnNvbiB8fCB0eXBlb2YgYm9keUpzb24gIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBxdWVyeSA9IFJlZmxlY3QuZ2V0KGJvZHlKc29uLCAncXVlcnknKTtcblx0Y29uc3QgdmFyaWFibGVzID0gUmVmbGVjdC5nZXQoYm9keUpzb24sICd2YXJpYWJsZXMnKTtcblx0Y29uc3Qgb3BlcmF0aW9uTmFtZSA9IFJlZmxlY3QuZ2V0KGJvZHlKc29uLCAnb3BlcmF0aW9uTmFtZScpO1xuXHRyZXR1cm4ge1xuXHRcdHF1ZXJ5OiB0eXBlb2YgcXVlcnkgPT09ICdzdHJpbmcnID8gcXVlcnkgOiB1bmRlZmluZWQsXG5cdFx0dmFyaWFibGVzLFxuXHRcdG9wZXJhdGlvbk5hbWU6IHR5cGVvZiBvcGVyYXRpb25OYW1lID09PSAnc3RyaW5nJyA/IG9wZXJhdGlvbk5hbWUgOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNsYXNzaWZ5UmVxdWVzdFBhdGgocGF0aG5hbWU6IHN0cmluZyk6IFBpY2s8SVJlY29yZGVkR2l0SHViUmVxdWVzdCwgJ3NlcnZpY2UnIHwgJ3NlcnZpY2VQYXRoJz4ge1xuXHRpZiAocGF0aG5hbWUgPT09IGdyYXBoUWxQYXRoKSB7XG5cdFx0cmV0dXJuIHsgc2VydmljZTogJ2dyYXBocWwnLCBzZXJ2aWNlUGF0aDogJy8nIH07XG5cdH1cblx0aWYgKHBhdGhuYW1lLnN0YXJ0c1dpdGgocmVzdEJhc2VQYXRoKSkge1xuXHRcdGNvbnN0IHNlcnZpY2VQYXRoID0gcGF0aG5hbWUuc3Vic3RyaW5nKHJlc3RCYXNlUGF0aC5sZW5ndGgpIHx8ICcvJztcblx0XHRyZXR1cm4geyBzZXJ2aWNlOiAncmVzdCcsIHNlcnZpY2VQYXRoOiBub3JtYWxpemVQYXRoKHNlcnZpY2VQYXRoKSB9O1xuXHR9XG5cdHJldHVybiB7IHNlcnZpY2U6ICd1bmtub3duJywgc2VydmljZVBhdGg6IHBhdGhuYW1lIHx8ICcvJyB9O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghcGF0aCB8fCBwYXRoID09PSAnLycpIHtcblx0XHRyZXR1cm4gJy8nO1xuXHR9XG5cdHJldHVybiBwYXRoLnN0YXJ0c1dpdGgoJy8nKSA/IHBhdGggOiBgLyR7cGF0aH1gO1xufVxuXG5mdW5jdGlvbiBxdWVyeU1hdGNoZXMoZXhwZWN0ZWQ6IHN0cmluZyB8IEdpdEh1YlF1ZXJ5LCBhY3R1YWxTZWFyY2g6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkobm9ybWFsaXplUXVlcnlFbnRyaWVzKGV4cGVjdGVkKSkgPT09IEpTT04uc3RyaW5naWZ5KG5vcm1hbGl6ZVF1ZXJ5RW50cmllcyhhY3R1YWxTZWFyY2gpKTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUXVlcnlFbnRyaWVzKHF1ZXJ5OiBzdHJpbmcgfCBHaXRIdWJRdWVyeSk6IHJlYWRvbmx5IFtzdHJpbmcsIHN0cmluZ11bXSB7XG5cdGlmICh0eXBlb2YgcXVlcnkgPT09ICdzdHJpbmcnKSB7XG5cdFx0Y29uc3Qgc2VhcmNoID0gcXVlcnkuc3RhcnRzV2l0aCgnPycpID8gcXVlcnkuc3Vic3RyaW5nKDEpIDogcXVlcnk7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20obmV3IFVSTFNlYXJjaFBhcmFtcyhzZWFyY2gpLmVudHJpZXMoKSkuc29ydChjb21wYXJlRW50cmllcyk7XG5cdH1cblxuXHRjb25zdCBlbnRyaWVzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocXVlcnkpKSB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB2YWx1ZSkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goW2tleSwgU3RyaW5nKGVsZW1lbnQpXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVudHJpZXMucHVzaChba2V5LCBTdHJpbmcodmFsdWUpXSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBlbnRyaWVzLnNvcnQoY29tcGFyZUVudHJpZXMpO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlRW50cmllcyhsZWZ0OiByZWFkb25seSBbc3RyaW5nLCBzdHJpbmddLCByaWdodDogcmVhZG9ubHkgW3N0cmluZywgc3RyaW5nXSk6IG51bWJlciB7XG5cdHJldHVybiBsZWZ0WzBdLmxvY2FsZUNvbXBhcmUocmlnaHRbMF0pIHx8IGxlZnRbMV0ubG9jYWxlQ29tcGFyZShyaWdodFsxXSk7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdEV4cGVjdGVkUXVlcnkocXVlcnk6IHN0cmluZyB8IEdpdEh1YlF1ZXJ5KTogc3RyaW5nIHtcblx0aWYgKHR5cGVvZiBxdWVyeSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gcXVlcnkuc3RhcnRzV2l0aCgnPycpID8gcXVlcnkgOiBgPyR7cXVlcnl9YDtcblx0fVxuXHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIG5vcm1hbGl6ZVF1ZXJ5RW50cmllcyhxdWVyeSkpIHtcblx0XHRwYXJhbXMuYXBwZW5kKGtleSwgdmFsdWUpO1xuXHR9XG5cdHJldHVybiBgPyR7cGFyYW1zLnRvU3RyaW5nKCl9YDtcbn1cblxuZnVuY3Rpb24gZGVzY3JpYmVTdGVwKHN0ZXA6IEdpdEh1YlNlcnZlclN0ZXApOiBzdHJpbmcge1xuXHRjb25zdCBsYWJlbCA9IHN0ZXAubGFiZWwgPyBgICgke3N0ZXAubGFiZWx9KWAgOiAnJztcblx0cmV0dXJuIHN0ZXAua2luZCA9PT0gJ3Jlc3QnXG5cdFx0PyBgUkVTVCAke3N0ZXAubWV0aG9kID8/ICdBTlknfSAke25vcm1hbGl6ZVBhdGgoc3RlcC5wYXRoKX0ke2xhYmVsfWBcblx0XHQ6IGBHcmFwaFFMICR7c3RlcC5vcGVyYXRpb25OYW1lID8/ICc8YW5vbnltb3VzPid9JHtsYWJlbH1gO1xufVxuXG5mdW5jdGlvbiBhc0Vycm9yKGVycm9yOiB1bmtub3duKTogRXJyb3Ige1xuXHRyZXR1cm4gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBZ0kzQixNQUFNLGVBQWU7QUFDckIsTUFBTSxjQUFjO0FBRWIsU0FBUyxlQUFlLE1BQWtFO0FBQ2hHLFNBQU8sRUFBRSxNQUFNLFFBQVEsR0FBRyxLQUFLO0FBQ2hDO0FBRU8sU0FBUyxrQkFBa0Is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
