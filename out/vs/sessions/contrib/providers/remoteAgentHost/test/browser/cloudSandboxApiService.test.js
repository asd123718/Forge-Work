import assert from "assert";
import { bufferToStream, VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Event } from "../../../../../../base/common/event.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CLOUD_SANDBOX_AGENT_SLUG } from "../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { IRequestService } from "../../../../../../platform/request/common/request.js";
import { IAuthenticationService } from "../../../../../../workbench/services/authentication/common/authentication.js";
import { CloudSandboxApiService } from "../../browser/cloudSandboxApiService.js";
import { ICloudSandboxTelemetryService } from "../../browser/cloudSandboxTelemetry.js";
function jsonResponse(body, statusCode = 200) {
  return {
    res: { headers: {}, statusCode },
    stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body)))
  };
}
function task(id, name, repositoryId, sessionId, environmentId) {
  return {
    id,
    name,
    agent_collaborators: [{ slug: CLOUD_SANDBOX_AGENT_SLUG }],
    compute: { provider: "sandboxes" },
    ...repositoryId !== void 0 ? { repository: { id: repositoryId } } : {},
    sessions: [{ id: sessionId, environment_id: environmentId }]
  };
}
function createService(store, options) {
  const requestedUrls = [];
  const instantiationService = store.add(new TestInstantiationService());
  instantiationService.stub(IRequestService, new class extends mock() {
    async request(opts) {
      const url = opts.url ?? "";
      requestedUrls.push(url);
      const repoMatch = url.match(/\/repositories\/(\d+)$/);
      if (repoMatch) {
        const entry = options.repositories.get(Number(repoMatch[1]));
        if (entry === "error") {
          return jsonResponse({ message: "Not Found" }, 404);
        }
        return jsonResponse(entry ?? {});
      }
      if (/\/tasks\/[^/]+$/.test(url)) {
        const id = url.split("/").pop();
        return jsonResponse(options.tasks.find((t) => t.id === decodeURIComponent(id)));
      }
      return jsonResponse({ tasks: options.tasks });
    }
  }());
  instantiationService.stub(IAuthenticationService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeSessions = Event.None;
    }
    async getSessions() {
      return [{ accessToken: "tok", id: "s", account: { id: "a", label: "a" }, scopes: [] }];
    }
  }());
  instantiationService.stub(IProductService, { defaultChatAgent: void 0 });
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(ICloudSandboxTelemetryService, new class extends mock() {
    reportRequest() {
    }
  }());
  return { service: store.add(instantiationService.createInstance(CloudSandboxApiService)), requestedUrls };
}
suite("CloudSandboxApiService repository resolution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("resolves the repository name from its numeric id", async () => {
    const { service } = createService(store, {
      tasks: [task("task-1", "Change port to 5555", 290012776, "sess-1", "env-1")],
      repositories: /* @__PURE__ */ new Map([[290012776, { full_name: "osortega/simple-server" }]])
    });
    const result = await service.listSessions(CancellationToken.None);
    assert.deepStrictEqual(result, {
      kind: "complete",
      sessions: [{
        environmentId: "env-1",
        sessionId: "sess-1",
        taskId: "task-1",
        name: "Change port to 5555",
        repoName: "osortega/simple-server",
        updatedAt: void 0
      }]
    });
  });
  test("resolves each repository once across a whole discovery pass", async () => {
    const { service, requestedUrls } = createService(store, {
      tasks: [
        task("task-1", "a", 290012776, "sess-1", "env-1"),
        task("task-2", "b", 290012776, "sess-2", "env-2"),
        task("task-3", "c", 999, "sess-3", "env-3")
      ],
      repositories: /* @__PURE__ */ new Map([
        [290012776, { full_name: "osortega/simple-server" }],
        [999, { full_name: "osortega/other" }]
      ])
    });
    const result = await service.listSessions(CancellationToken.None);
    assert.deepStrictEqual({
      names: result.kind === "failed" ? [] : result.sessions.map((s) => s.repoName),
      repoLookups: requestedUrls.filter((u) => /\/repositories\//.test(u)).length
    }, {
      names: ["osortega/simple-server", "osortega/simple-server", "osortega/other"],
      repoLookups: 2
    });
  });
  test("a failed lookup leaves every sharing session discoverable and is retried next pass", async () => {
    const repositories = /* @__PURE__ */ new Map([[290012776, "error"]]);
    const { service, requestedUrls } = createService(store, {
      tasks: [
        task("task-1", "Change port to 5555", 290012776, "sess-1", "env-1"),
        task("task-2", "hi", 290012776, "sess-2", "env-2")
      ],
      repositories
    });
    const first = await service.listSessions(CancellationToken.None);
    repositories.set(290012776, { full_name: "osortega/simple-server" });
    const second = await service.listSessions(CancellationToken.None);
    assert.deepStrictEqual({
      // `complete`, not `partial`: the sessions resolved fine, only their label did not.
      firstKind: first.kind,
      firstSessions: first.kind === "failed" ? [] : first.sessions.map((s) => s.sessionId),
      firstNames: first.kind === "failed" ? [] : first.sessions.map((s) => s.repoName),
      secondNames: second.kind === "failed" ? [] : second.sessions.map((s) => s.repoName),
      repoLookups: requestedUrls.filter((u) => /\/repositories\//.test(u)).length
    }, {
      firstKind: "complete",
      firstSessions: ["sess-1", "sess-2"],
      firstNames: [void 0, void 0],
      secondNames: ["osortega/simple-server", "osortega/simple-server"],
      // One per pass: the failure is evicted so the second pass retries, but neither pass
      // issues a second lookup for the task that shares the repository.
      repoLookups: 2
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXGNsb3VkU2FuZGJveEFwaVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGJ1ZmZlclRvU3RyZWFtLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgQ0xPVURfU0FOREJPWF9BR0VOVF9TTFVHIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jbG91ZFNhbmRib3hBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDbG91ZFNhbmRib3hBcGlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jbG91ZFNhbmRib3hBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDbG91ZFNhbmRib3hUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jbG91ZFNhbmRib3hUZWxlbWV0cnkuanMnO1xuXG5mdW5jdGlvbiBqc29uUmVzcG9uc2UoYm9keTogdW5rbm93biwgc3RhdHVzQ29kZSA9IDIwMCk6IElSZXF1ZXN0Q29udGV4dCB7XG5cdHJldHVybiB7XG5cdFx0cmVzOiB7IGhlYWRlcnM6IHt9LCBzdGF0dXNDb2RlIH0sXG5cdFx0c3RyZWFtOiBidWZmZXJUb1N0cmVhbShWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGJvZHkpKSksXG5cdH07XG59XG5cbi8qKiBBIHRhc2sgYXMgTWlzc2lvbiBDb250cm9sIGFjdHVhbGx5IHJldHVybnMgaXQ6IHRoZSByZXBvc2l0b3J5IGlzIGEgYmFyZSBudW1lcmljIGlkLiAqL1xuZnVuY3Rpb24gdGFzayhpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHJlcG9zaXRvcnlJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBzZXNzaW9uSWQ6IHN0cmluZywgZW52aXJvbm1lbnRJZDogc3RyaW5nKSB7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0bmFtZSxcblx0XHRhZ2VudF9jb2xsYWJvcmF0b3JzOiBbeyBzbHVnOiBDTE9VRF9TQU5EQk9YX0FHRU5UX1NMVUcgfV0sXG5cdFx0Y29tcHV0ZTogeyBwcm92aWRlcjogJ3NhbmRib3hlcycgfSxcblx0XHQuLi4ocmVwb3NpdG9yeUlkICE9PSB1bmRlZmluZWQgPyB7IHJlcG9zaXRvcnk6IHsgaWQ6IHJlcG9zaXRvcnlJZCB9IH0gOiB7fSksXG5cdFx0c2Vzc2lvbnM6IFt7IGlkOiBzZXNzaW9uSWQsIGVudmlyb25tZW50X2lkOiBlbnZpcm9ubWVudElkIH1dLFxuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVRlc3RTZXR1cCB7XG5cdHJlYWRvbmx5IHNlcnZpY2U6IENsb3VkU2FuZGJveEFwaVNlcnZpY2U7XG5cdHJlYWRvbmx5IHJlcXVlc3RlZFVybHM6IHN0cmluZ1tdO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHN0b3JlOiBQaWNrPHsgYWRkPFQgZXh0ZW5kcyB7IGRpc3Bvc2UoKTogdm9pZCB9Pih0OiBUKTogVCB9LCAnYWRkJz4sIG9wdGlvbnM6IHtcblx0cmVhZG9ubHkgdGFza3M6IHJlYWRvbmx5IHVua25vd25bXTtcblx0LyoqIFJlcG9zaXRvcnkgaWQgLT4gcmVzcG9uc2UsIG9yICdlcnJvcicgdG8gZmFpbCB0aGUgbG9va3VwLiAqL1xuXHRyZWFkb25seSByZXBvc2l0b3JpZXM6IFJlYWRvbmx5TWFwPG51bWJlciwgeyBmdWxsX25hbWU/OiBzdHJpbmcgfSB8ICdlcnJvcic+O1xufSk6IElUZXN0U2V0dXAge1xuXHRjb25zdCByZXF1ZXN0ZWRVcmxzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlcXVlc3RTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXF1ZXN0U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmVxdWVzdChvcHRzOiB7IHVybD86IHN0cmluZyB9KTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRcdGNvbnN0IHVybCA9IG9wdHMudXJsID8/ICcnO1xuXHRcdFx0cmVxdWVzdGVkVXJscy5wdXNoKHVybCk7XG5cdFx0XHRjb25zdCByZXBvTWF0Y2ggPSB1cmwubWF0Y2goL1xcL3JlcG9zaXRvcmllc1xcLyhcXGQrKSQvKTtcblx0XHRcdGlmIChyZXBvTWF0Y2gpIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBvcHRpb25zLnJlcG9zaXRvcmllcy5nZXQoTnVtYmVyKHJlcG9NYXRjaFsxXSkpO1xuXHRcdFx0XHRpZiAoZW50cnkgPT09ICdlcnJvcicpIHtcblx0XHRcdFx0XHRyZXR1cm4ganNvblJlc3BvbnNlKHsgbWVzc2FnZTogJ05vdCBGb3VuZCcgfSwgNDA0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ganNvblJlc3BvbnNlKGVudHJ5ID8/IHt9KTtcblx0XHRcdH1cblx0XHRcdGlmICgvXFwvdGFza3NcXC9bXi9dKyQvLnRlc3QodXJsKSkge1xuXHRcdFx0XHRjb25zdCBpZCA9IHVybC5zcGxpdCgnLycpLnBvcCgpITtcblx0XHRcdFx0cmV0dXJuIGpzb25SZXNwb25zZShvcHRpb25zLnRhc2tzLmZpbmQodCA9PiAodCBhcyB7IGlkOiBzdHJpbmcgfSkuaWQgPT09IGRlY29kZVVSSUNvbXBvbmVudChpZCkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBqc29uUmVzcG9uc2UoeyB0YXNrczogb3B0aW9ucy50YXNrcyB9KTtcblx0XHR9XG5cdH0oKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBhc3luYyBnZXRTZXNzaW9ucygpIHsgcmV0dXJuIFt7IGFjY2Vzc1Rva2VuOiAndG9rJywgaWQ6ICdzJywgYWNjb3VudDogeyBpZDogJ2EnLCBsYWJlbDogJ2EnIH0sIHNjb3BlczogW10gfV07IH1cblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gRXZlbnQuTm9uZTtcblx0fSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZHVjdFNlcnZpY2UsIHsgZGVmYXVsdENoYXRBZ2VudDogdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJUHJvZHVjdFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNsb3VkU2FuZGJveFRlbGVtZXRyeVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNsb3VkU2FuZGJveFRlbGVtZXRyeVNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlcG9ydFJlcXVlc3QoKTogdm9pZCB7IH1cblx0fSgpKTtcblxuXHRyZXR1cm4geyBzZXJ2aWNlOiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xvdWRTYW5kYm94QXBpU2VydmljZSkpLCByZXF1ZXN0ZWRVcmxzIH07XG59XG5cbnN1aXRlKCdDbG91ZFNhbmRib3hBcGlTZXJ2aWNlIHJlcG9zaXRvcnkgcmVzb2x1dGlvbicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHRoZSByZXBvc2l0b3J5IG5hbWUgZnJvbSBpdHMgbnVtZXJpYyBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoc3RvcmUsIHtcblx0XHRcdHRhc2tzOiBbdGFzaygndGFzay0xJywgJ0NoYW5nZSBwb3J0IHRvIDU1NTUnLCAyOTAwMTI3NzYsICdzZXNzLTEnLCAnZW52LTEnKV0sXG5cdFx0XHRyZXBvc2l0b3JpZXM6IG5ldyBNYXAoW1syOTAwMTI3NzYsIHsgZnVsbF9uYW1lOiAnb3NvcnRlZ2Evc2ltcGxlLXNlcnZlcicgfV1dKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubGlzdFNlc3Npb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdGtpbmQ6ICdjb21wbGV0ZScsXG5cdFx0XHRzZXNzaW9uczogW3tcblx0XHRcdFx0ZW52aXJvbm1lbnRJZDogJ2Vudi0xJyxcblx0XHRcdFx0c2Vzc2lvbklkOiAnc2Vzcy0xJyxcblx0XHRcdFx0dGFza0lkOiAndGFzay0xJyxcblx0XHRcdFx0bmFtZTogJ0NoYW5nZSBwb3J0IHRvIDU1NTUnLFxuXHRcdFx0XHRyZXBvTmFtZTogJ29zb3J0ZWdhL3NpbXBsZS1zZXJ2ZXInLFxuXHRcdFx0XHR1cGRhdGVkQXQ6IHVuZGVmaW5lZCxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBlYWNoIHJlcG9zaXRvcnkgb25jZSBhY3Jvc3MgYSB3aG9sZSBkaXNjb3ZlcnkgcGFzcycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUYXNrcyByZXNvbHZlIGNvbmN1cnJlbnRseSwgc28gdGhlIGluLWZsaWdodCBwcm9taXNlIG11c3QgYmUgc2hhcmVkLCBub3QganVzdCB0aGUgcmVzdWx0LlxuXHRcdGNvbnN0IHsgc2VydmljZSwgcmVxdWVzdGVkVXJscyB9ID0gY3JlYXRlU2VydmljZShzdG9yZSwge1xuXHRcdFx0dGFza3M6IFtcblx0XHRcdFx0dGFzaygndGFzay0xJywgJ2EnLCAyOTAwMTI3NzYsICdzZXNzLTEnLCAnZW52LTEnKSxcblx0XHRcdFx0dGFzaygndGFzay0yJywgJ2InLCAyOTAwMTI3NzYsICdzZXNzLTInLCAnZW52LTInKSxcblx0XHRcdFx0dGFzaygndGFzay0zJywgJ2MnLCA5OTksICdzZXNzLTMnLCAnZW52LTMnKSxcblx0XHRcdF0sXG5cdFx0XHRyZXBvc2l0b3JpZXM6IG5ldyBNYXA8bnVtYmVyLCB7IGZ1bGxfbmFtZT86IHN0cmluZyB9PihbXG5cdFx0XHRcdFsyOTAwMTI3NzYsIHsgZnVsbF9uYW1lOiAnb3NvcnRlZ2Evc2ltcGxlLXNlcnZlcicgfV0sXG5cdFx0XHRcdFs5OTksIHsgZnVsbF9uYW1lOiAnb3NvcnRlZ2Evb3RoZXInIH1dLFxuXHRcdFx0XSksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RTZXNzaW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bmFtZXM6IHJlc3VsdC5raW5kID09PSAnZmFpbGVkJyA/IFtdIDogcmVzdWx0LnNlc3Npb25zLm1hcChzID0+IHMucmVwb05hbWUpLFxuXHRcdFx0cmVwb0xvb2t1cHM6IHJlcXVlc3RlZFVybHMuZmlsdGVyKHUgPT4gL1xcL3JlcG9zaXRvcmllc1xcLy8udGVzdCh1KSkubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdG5hbWVzOiBbJ29zb3J0ZWdhL3NpbXBsZS1zZXJ2ZXInLCAnb3NvcnRlZ2Evc2ltcGxlLXNlcnZlcicsICdvc29ydGVnYS9vdGhlciddLFxuXHRcdFx0cmVwb0xvb2t1cHM6IDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgZmFpbGVkIGxvb2t1cCBsZWF2ZXMgZXZlcnkgc2hhcmluZyBzZXNzaW9uIGRpc2NvdmVyYWJsZSBhbmQgaXMgcmV0cmllZCBuZXh0IHBhc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVHdvIHRhc2tzIG9uIHRoZSBzYW1lIGZhaWxpbmcgcmVwb3NpdG9yeTogdGhleSBzaGFyZSBvbmUgbWVtb2l6ZWQgcHJvbWlzZSwgYW5kIGlmIGl0XG5cdFx0Ly8gcmVqZWN0cyB0aGUgY2FsbGVycyB0aGF0IHJlY2VpdmUgaXQgZHJvcCB0aGVpciBzZXNzaW9ucyBmcm9tIHRoZSBsaXN0aW5nIGVudGlyZWx5LlxuXHRcdGNvbnN0IHJlcG9zaXRvcmllcyA9IG5ldyBNYXA8bnVtYmVyLCB7IGZ1bGxfbmFtZT86IHN0cmluZyB9IHwgJ2Vycm9yJz4oW1syOTAwMTI3NzYsICdlcnJvciddXSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCByZXF1ZXN0ZWRVcmxzIH0gPSBjcmVhdGVTZXJ2aWNlKHN0b3JlLCB7XG5cdFx0XHR0YXNrczogW1xuXHRcdFx0XHR0YXNrKCd0YXNrLTEnLCAnQ2hhbmdlIHBvcnQgdG8gNTU1NScsIDI5MDAxMjc3NiwgJ3Nlc3MtMScsICdlbnYtMScpLFxuXHRcdFx0XHR0YXNrKCd0YXNrLTInLCAnaGknLCAyOTAwMTI3NzYsICdzZXNzLTInLCAnZW52LTInKSxcblx0XHRcdF0sXG5cdFx0XHRyZXBvc2l0b3JpZXMsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IHNlcnZpY2UubGlzdFNlc3Npb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJlcG9zaXRvcmllcy5zZXQoMjkwMDEyNzc2LCB7IGZ1bGxfbmFtZTogJ29zb3J0ZWdhL3NpbXBsZS1zZXJ2ZXInIH0pO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IHNlcnZpY2UubGlzdFNlc3Npb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHQvLyBgY29tcGxldGVgLCBub3QgYHBhcnRpYWxgOiB0aGUgc2Vzc2lvbnMgcmVzb2x2ZWQgZmluZSwgb25seSB0aGVpciBsYWJlbCBkaWQgbm90LlxuXHRcdFx0Zmlyc3RLaW5kOiBmaXJzdC5raW5kLFxuXHRcdFx0Zmlyc3RTZXNzaW9uczogZmlyc3Qua2luZCA9PT0gJ2ZhaWxlZCcgPyBbXSA6IGZpcnN0LnNlc3Npb25zLm1hcChzID0+IHMuc2Vzc2lvbklkKSxcblx0XHRcdGZpcnN0TmFtZXM6IGZpcnN0LmtpbmQgPT09ICdmYWlsZWQnID8gW10gOiBmaXJzdC5zZXNzaW9ucy5tYXAocyA9PiBzLnJlcG9OYW1lKSxcblx0XHRcdHNlY29uZE5hbWVzOiBzZWNvbmQua2luZCA9PT0gJ2ZhaWxlZCcgPyBbXSA6IHNlY29uZC5zZXNzaW9ucy5tYXAocyA9PiBzLnJlcG9OYW1lKSxcblx0XHRcdHJlcG9Mb29rdXBzOiByZXF1ZXN0ZWRVcmxzLmZpbHRlcih1ID0+IC9cXC9yZXBvc2l0b3JpZXNcXC8vLnRlc3QodSkpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdEtpbmQ6ICdjb21wbGV0ZScsXG5cdFx0XHRmaXJzdFNlc3Npb25zOiBbJ3Nlc3MtMScsICdzZXNzLTInXSxcblx0XHRcdGZpcnN0TmFtZXM6IFt1bmRlZmluZWQsIHVuZGVmaW5lZF0sXG5cdFx0XHRzZWNvbmROYW1lczogWydvc29ydGVnYS9zaW1wbGUtc2VydmVyJywgJ29zb3J0ZWdhL3NpbXBsZS1zZXJ2ZXInXSxcblx0XHRcdC8vIE9uZSBwZXIgcGFzczogdGhlIGZhaWx1cmUgaXMgZXZpY3RlZCBzbyB0aGUgc2Vjb25kIHBhc3MgcmV0cmllcywgYnV0IG5laXRoZXIgcGFzc1xuXHRcdFx0Ly8gaXNzdWVzIGEgc2Vjb25kIGxvb2t1cCBmb3IgdGhlIHRhc2sgdGhhdCBzaGFyZXMgdGhlIHJlcG9zaXRvcnkuXG5cdFx0XHRyZXBvTG9va3VwczogMixcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQixnQkFBZ0I7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsYUFBYSxNQUFlLGFBQWEsS0FBc0I7QUFDdkUsU0FBTztBQUFBLElBQ04sS0FBSyxFQUFFLFNBQVMsQ0FBQyxHQUFHLFdBQVc7QUFBQSxJQUMvQixRQUFRLGVBQWUsU0FBUyxXQUFXLEtBQUssVUFBVSxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQ2pFO0FBQ0Q7QUFHQSxTQUFTLEtBQUssSUFBWSxNQUFjLGNBQWtDLFdBQW1CLGVBQXVCO0FBQ25ILFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQTtBQUFBLElBQ0EscUJBQXFCLENBQUMsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQUEsSUFDeEQsU0FBUyxFQUFFLFVBQVUsWUFBWTtBQUFBLElBQ2pDLEdBQUksaUJBQWlCLFNB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
