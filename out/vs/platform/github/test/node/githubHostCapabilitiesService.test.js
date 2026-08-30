import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { GitHubHostCapabilitiesService } from "../../common/githubHostCapabilitiesService.js";
import { GitHubTransport } from "../../common/githubTransport.js";
import { nodeFetch } from "./nodeFetch.js";
import { gitHubGraphQLResponse, gitHubGraphQLStep, ProgrammableGitHubServer } from "./programmableGitHubServer.js";
suite("GitHubHostCapabilitiesService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  async function withServer(fn) {
    const server = await ProgrammableGitHubServer.start();
    try {
      await fn(server);
    } finally {
      await server.disposeAsync();
    }
  }
  test("probes once per host and enterprise version", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubGraphQLStep({
        queryIncludes: ['__type(name: "PullRequest")', '__type(name: "Repository")', '__type(name: "RequirableByPullRequest")'],
        response: gitHubGraphQLResponse({
          pullRequest: { fields: [{ name: "mergeQueueEntry" }, { name: "reviewThreads" }] },
          repository: { fields: [{ name: "mergeQueue" }] },
          requirableByPullRequest: { fields: [{ name: "isRequired" }] }
        })
      }));
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
      const signal = new AbortController().signal;
      const credential = {
        account: { host: new URL(server.apiBaseUrl).host, accountId: "101" },
        token: "token",
        generation: 1,
        signal
      };
      const first = await service.getCapabilities(credential, "3.16", signal);
      const cached = await service.getCapabilities(credential, "3.16", signal);
      assert.deepStrictEqual({
        first,
        sameObject: first === cached,
        requestCount: server.requests.length
      }, {
        first: {
          graphql: true,
          mergeQueue: true,
          internalMergeStatus: false,
          reviewThreads: true,
          checkContextRequiredness: true
        },
        sameObject: true,
        requestCount: 1
      });
      server.assertSatisfied();
    });
  });
  test("fails closed when the schema probe returns errors", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubGraphQLStep({
        response: gitHubGraphQLResponse(void 0, [{ message: "Field does not exist", type: "VALIDATION" }])
      }));
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
      const signal = new AbortController().signal;
      const result = await service.getCapabilities({
        account: { host: new URL(server.apiBaseUrl).host, accountId: "101" },
        token: "token",
        generation: 1,
        signal
      }, void 0, signal);
      assert.deepStrictEqual(result, {
        graphql: false,
        mergeQueue: false,
        internalMergeStatus: false,
        reviewThreads: false,
        checkContextRequiredness: false
      });
      server.assertSatisfied();
    });
  });
  test("does not infer requiredness from the status-check union", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubGraphQLStep({
        response: gitHubGraphQLResponse({
          pullRequest: { fields: [{ name: "reviewThreads" }] },
          repository: { fields: [{ name: "mergeQueue" }] },
          requirableByPullRequest: null
        })
      }));
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
      const signal = new AbortController().signal;
      const result = await service.getCapabilities({
        account: { host: new URL(server.apiBaseUrl).host, accountId: "101" },
        token: "token",
        generation: 1,
        signal
      }, void 0, signal);
      assert.deepStrictEqual(result, {
        graphql: true,
        mergeQueue: false,
        internalMergeStatus: false,
        reviewThreads: true,
        checkContextRequiredness: false
      });
      server.assertSatisfied();
    });
  });
  test("retries capability probing after a transient GraphQL error", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          response: gitHubGraphQLResponse(void 0, [{ message: "Temporarily unavailable", type: "INTERNAL" }])
        }),
        gitHubGraphQLStep({
          response: gitHubGraphQLResponse({
            pullRequest: { fields: [{ name: "reviewThreads" }] },
            repository: { fields: [] },
            requirableByPullRequest: { fields: [] }
          })
        })
      );
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
      const signal = new AbortController().signal;
      const credential = {
        account: { host: new URL(server.apiBaseUrl).host, accountId: "101" },
        token: "token",
        generation: 1,
        signal
      };
      const transient = await service.getCapabilities(credential, void 0, signal);
      const recovered = await service.getCapabilities(credential, void 0, signal);
      assert.deepStrictEqual({
        transient,
        recovered,
        requestCount: server.requests.length
      }, {
        transient: {
          graphql: false,
          mergeQueue: false,
          internalMergeStatus: false,
          reviewThreads: false,
          checkContextRequiredness: false
        },
        recovered: {
          graphql: true,
          mergeQueue: false,
          internalMergeStatus: false,
          reviewThreads: true,
          checkContextRequiredness: false
        },
        requestCount: 2
      });
      server.assertSatisfied();
    });
  });
  test("cancelling one capability waiter does not cancel another", async () => {
    await withServer(async (server) => {
      const requestSeen = new DeferredPromise();
      const release = new DeferredPromise();
      server.enqueue(gitHubGraphQLStep({
        assert: async () => requestSeen.complete(),
        waitFor: release.p,
        response: gitHubGraphQLResponse({
          pullRequest: { fields: [{ name: "reviewThreads" }] },
          repository: { fields: [] },
          requirableByPullRequest: { fields: [] }
        })
      }));
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const service = disposables.add(new GitHubHostCapabilitiesService(transport, server.createEndpointService()));
      const credentialSignal = new AbortController().signal;
      const credential = {
        account: { host: new URL(server.apiBaseUrl).host, accountId: "101" },
        token: "token",
        generation: 1,
        signal: credentialSignal
      };
      const cancelled = new AbortController();
      const active = new AbortController();
      const first = service.getCapabilities(credential, void 0, cancelled.signal);
      const second = service.getCapabilities(credential, void 0, active.signal);
      await requestSeen.p;
      cancelled.abort(new Error("cancel first waiter"));
      await assert.rejects(() => first, /cancel first waiter/);
      await release.complete();
      assert.deepStrictEqual({
        second: await second,
        activeAborted: active.signal.aborted,
        requestCount: server.requests.length
      }, {
        second: {
          graphql: true,
          mergeQueue: false,
          internalMergeStatus: false,
          reviewThreads: true,
          checkContextRequiredness: false
        },
        activeAborted: false,
        requestCount: 1
      });
      server.assertSatisfied();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxnaXRodWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBHaXRIdWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJUcmFuc3BvcnQgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IG5vZGVGZXRjaCB9IGZyb20gJy4vbm9kZUZldGNoLmpzJztcbmltcG9ydCB7IGdpdEh1YkdyYXBoUUxSZXNwb25zZSwgZ2l0SHViR3JhcGhRTFN0ZXAsIFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlciB9IGZyb20gJy4vcHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyLmpzJztcblxuc3VpdGUoJ0dpdEh1Ykhvc3RDYXBhYmlsaXRpZXNTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHdpdGhTZXJ2ZXIoZm46IChzZXJ2ZXI6IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlcikgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlci5zdGFydCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmbihzZXJ2ZXIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBzZXJ2ZXIuZGlzcG9zZUFzeW5jKCk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgncHJvYmVzIG9uY2UgcGVyIGhvc3QgYW5kIGVudGVycHJpc2UgdmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6IFsnX190eXBlKG5hbWU6IFwiUHVsbFJlcXVlc3RcIiknLCAnX190eXBlKG5hbWU6IFwiUmVwb3NpdG9yeVwiKScsICdfX3R5cGUobmFtZTogXCJSZXF1aXJhYmxlQnlQdWxsUmVxdWVzdFwiKSddLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRwdWxsUmVxdWVzdDogeyBmaWVsZHM6IFt7IG5hbWU6ICdtZXJnZVF1ZXVlRW50cnknIH0sIHsgbmFtZTogJ3Jldmlld1RocmVhZHMnIH1dIH0sXG5cdFx0XHRcdFx0cmVwb3NpdG9yeTogeyBmaWVsZHM6IFt7IG5hbWU6ICdtZXJnZVF1ZXVlJyB9XSB9LFxuXHRcdFx0XHRcdHJlcXVpcmFibGVCeVB1bGxSZXF1ZXN0OiB7IGZpZWxkczogW3sgbmFtZTogJ2lzUmVxdWlyZWQnIH1dIH0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJUcmFuc3BvcnQobm9kZUZldGNoKSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZSh0cmFuc3BvcnQsIHNlcnZlci5jcmVhdGVFbmRwb2ludFNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3Qgc2lnbmFsID0gbmV3IEFib3J0Q29udHJvbGxlcigpLnNpZ25hbDtcblx0XHRcdGNvbnN0IGNyZWRlbnRpYWwgPSB7XG5cdFx0XHRcdGFjY291bnQ6IHsgaG9zdDogbmV3IFVSTChzZXJ2ZXIuYXBpQmFzZVVybCkuaG9zdCwgYWNjb3VudElkOiAnMTAxJyB9LFxuXHRcdFx0XHR0b2tlbjogJ3Rva2VuJyxcblx0XHRcdFx0Z2VuZXJhdGlvbjogMSxcblx0XHRcdFx0c2lnbmFsLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBzZXJ2aWNlLmdldENhcGFiaWxpdGllcyhjcmVkZW50aWFsLCAnMy4xNicsIHNpZ25hbCk7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSBhd2FpdCBzZXJ2aWNlLmdldENhcGFiaWxpdGllcyhjcmVkZW50aWFsLCAnMy4xNicsIHNpZ25hbCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0c2FtZU9iamVjdDogZmlyc3QgPT09IGNhY2hlZCxcblx0XHRcdFx0cmVxdWVzdENvdW50OiBzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRmaXJzdDoge1xuXHRcdFx0XHRcdGdyYXBocWw6IHRydWUsXG5cdFx0XHRcdFx0bWVyZ2VRdWV1ZTogdHJ1ZSxcblx0XHRcdFx0XHRpbnRlcm5hbE1lcmdlU3RhdHVzOiBmYWxzZSxcblx0XHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB0cnVlLFxuXHRcdFx0XHRcdGNoZWNrQ29udGV4dFJlcXVpcmVkbmVzczogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c2FtZU9iamVjdDogdHJ1ZSxcblx0XHRcdFx0cmVxdWVzdENvdW50OiAxLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGNsb3NlZCB3aGVuIHRoZSBzY2hlbWEgcHJvYmUgcmV0dXJucyBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoZ2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHVuZGVmaW5lZCwgW3sgbWVzc2FnZTogJ0ZpZWxkIGRvZXMgbm90IGV4aXN0JywgdHlwZTogJ1ZBTElEQVRJT04nIH1dKSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViVHJhbnNwb3J0KG5vZGVGZXRjaCkpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViSG9zdENhcGFiaWxpdGllc1NlcnZpY2UodHJhbnNwb3J0LCBzZXJ2ZXIuY3JlYXRlRW5kcG9pbnRTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHNpZ25hbCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWw7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0Q2FwYWJpbGl0aWVzKHtcblx0XHRcdFx0YWNjb3VudDogeyBob3N0OiBuZXcgVVJMKHNlcnZlci5hcGlCYXNlVXJsKS5ob3N0LCBhY2NvdW50SWQ6ICcxMDEnIH0sXG5cdFx0XHRcdHRva2VuOiAndG9rZW4nLFxuXHRcdFx0XHRnZW5lcmF0aW9uOiAxLFxuXHRcdFx0XHRzaWduYWwsXG5cdFx0XHR9LCB1bmRlZmluZWQsIHNpZ25hbCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdGdyYXBocWw6IGZhbHNlLFxuXHRcdFx0XHRtZXJnZVF1ZXVlOiBmYWxzZSxcblx0XHRcdFx0aW50ZXJuYWxNZXJnZVN0YXR1czogZmFsc2UsXG5cdFx0XHRcdHJldmlld1RocmVhZHM6IGZhbHNlLFxuXHRcdFx0XHRjaGVja0NvbnRleHRSZXF1aXJlZG5lc3M6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGluZmVyIHJlcXVpcmVkbmVzcyBmcm9tIHRoZSBzdGF0dXMtY2hlY2sgdW5pb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoZ2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRwdWxsUmVxdWVzdDogeyBmaWVsZHM6IFt7IG5hbWU6ICdyZXZpZXdUaHJlYWRzJyB9XSB9LFxuXHRcdFx0XHRcdHJlcG9zaXRvcnk6IHsgZmllbGRzOiBbeyBuYW1lOiAnbWVyZ2VRdWV1ZScgfV0gfSxcblx0XHRcdFx0XHRyZXF1aXJhYmxlQnlQdWxsUmVxdWVzdDogbnVsbCxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdpdEh1YlRyYW5zcG9ydChub2RlRmV0Y2gpKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdpdEh1Ykhvc3RDYXBhYmlsaXRpZXNTZXJ2aWNlKHRyYW5zcG9ydCwgc2VydmVyLmNyZWF0ZUVuZHBvaW50U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBzaWduYWwgPSBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldENhcGFiaWxpdGllcyh7XG5cdFx0XHRcdGFjY291bnQ6IHsgaG9zdDogbmV3IFVSTChzZXJ2ZXIuYXBpQmFzZVVybCkuaG9zdCwgYWNjb3VudElkOiAnMTAxJyB9LFxuXHRcdFx0XHR0b2tlbjogJ3Rva2VuJyxcblx0XHRcdFx0Z2VuZXJhdGlvbjogMSxcblx0XHRcdFx0c2lnbmFsLFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBzaWduYWwpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRncmFwaHFsOiB0cnVlLFxuXHRcdFx0XHRtZXJnZVF1ZXVlOiBmYWxzZSxcblx0XHRcdFx0aW50ZXJuYWxNZXJnZVN0YXR1czogZmFsc2UsXG5cdFx0XHRcdHJldmlld1RocmVhZHM6IHRydWUsXG5cdFx0XHRcdGNoZWNrQ29udGV4dFJlcXVpcmVkbmVzczogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0cmllcyBjYXBhYmlsaXR5IHByb2JpbmcgYWZ0ZXIgYSB0cmFuc2llbnQgR3JhcGhRTCBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2UodW5kZWZpbmVkLCBbeyBtZXNzYWdlOiAnVGVtcG9yYXJpbHkgdW5hdmFpbGFibGUnLCB0eXBlOiAnSU5URVJOQUwnIH1dKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRcdHB1bGxSZXF1ZXN0OiB7IGZpZWxkczogW3sgbmFtZTogJ3Jldmlld1RocmVhZHMnIH1dIH0sXG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5OiB7IGZpZWxkczogW10gfSxcblx0XHRcdFx0XHRcdHJlcXVpcmFibGVCeVB1bGxSZXF1ZXN0OiB7IGZpZWxkczogW10gfSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJUcmFuc3BvcnQobm9kZUZldGNoKSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZSh0cmFuc3BvcnQsIHNlcnZlci5jcmVhdGVFbmRwb2ludFNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3Qgc2lnbmFsID0gbmV3IEFib3J0Q29udHJvbGxlcigpLnNpZ25hbDtcblx0XHRcdGNvbnN0IGNyZWRlbnRpYWwgPSB7XG5cdFx0XHRcdGFjY291bnQ6IHsgaG9zdDogbmV3IFVSTChzZXJ2ZXIuYXBpQmFzZVVybCkuaG9zdCwgYWNjb3VudElkOiAnMTAxJyB9LFxuXHRcdFx0XHR0b2tlbjogJ3Rva2VuJyxcblx0XHRcdFx0Z2VuZXJhdGlvbjogMSxcblx0XHRcdFx0c2lnbmFsLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdHJhbnNpZW50ID0gYXdhaXQgc2VydmljZS5nZXRDYXBhYmlsaXRpZXMoY3JlZGVudGlhbCwgdW5kZWZpbmVkLCBzaWduYWwpO1xuXHRcdFx0Y29uc3QgcmVjb3ZlcmVkID0gYXdhaXQgc2VydmljZS5nZXRDYXBhYmlsaXRpZXMoY3JlZGVudGlhbCwgdW5kZWZpbmVkLCBzaWduYWwpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHJhbnNpZW50LFxuXHRcdFx0XHRyZWNvdmVyZWQsXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogc2VydmVyLnJlcXVlc3RzLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHJhbnNpZW50OiB7XG5cdFx0XHRcdFx0Z3JhcGhxbDogZmFsc2UsXG5cdFx0XHRcdFx0bWVyZ2VRdWV1ZTogZmFsc2UsXG5cdFx0XHRcdFx0aW50ZXJuYWxNZXJnZVN0YXR1czogZmFsc2UsXG5cdFx0XHRcdFx0cmV2aWV3VGhyZWFkczogZmFsc2UsXG5cdFx0XHRcdFx0Y2hlY2tDb250ZXh0UmVxdWlyZWRuZXNzOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVjb3ZlcmVkOiB7XG5cdFx0XHRcdFx0Z3JhcGhxbDogdHJ1ZSxcblx0XHRcdFx0XHRtZXJnZVF1ZXVlOiBmYWxzZSxcblx0XHRcdFx0XHRpbnRlcm5hbE1lcmdlU3RhdHVzOiBmYWxzZSxcblx0XHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB0cnVlLFxuXHRcdFx0XHRcdGNoZWNrQ29udGV4dFJlcXVpcmVkbmVzczogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogMixcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsaW5nIG9uZSBjYXBhYmlsaXR5IHdhaXRlciBkb2VzIG5vdCBjYW5jZWwgYW5vdGhlcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0U2VlbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IHJlbGVhc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdGFzc2VydDogYXN5bmMgKCkgPT4gcmVxdWVzdFNlZW4uY29tcGxldGUoKSxcblx0XHRcdFx0d2FpdEZvcjogcmVsZWFzZS5wLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRwdWxsUmVxdWVzdDogeyBmaWVsZHM6IFt7IG5hbWU6ICdyZXZpZXdUaHJlYWRzJyB9XSB9LFxuXHRcdFx0XHRcdHJlcG9zaXRvcnk6IHsgZmllbGRzOiBbXSB9LFxuXHRcdFx0XHRcdHJlcXVpcmFibGVCeVB1bGxSZXF1ZXN0OiB7IGZpZWxkczogW10gfSxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdpdEh1YlRyYW5zcG9ydChub2RlRmV0Y2gpKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdpdEh1Ykhvc3RDYXBhYmlsaXRpZXNTZXJ2aWNlKHRyYW5zcG9ydCwgc2VydmVyLmNyZWF0ZUVuZHBvaW50U2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBjcmVkZW50aWFsU2lnbmFsID0gbmV3IEFib3J0Q29udHJvbGxlcigpLnNpZ25hbDtcblx0XHRcdGNvbnN0IGNyZWRlbnRpYWwgPSB7XG5cdFx0XHRcdGFjY291bnQ6IHsgaG9zdDogbmV3IFVSTChzZXJ2ZXIuYXBpQmFzZVVybCkuaG9zdCwgYWNjb3VudElkOiAnMTAxJyB9LFxuXHRcdFx0XHR0b2tlbjogJ3Rva2VuJyxcblx0XHRcdFx0Z2VuZXJhdGlvbjogMSxcblx0XHRcdFx0c2lnbmFsOiBjcmVkZW50aWFsU2lnbmFsLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNhbmNlbGxlZCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gc2VydmljZS5nZXRDYXBhYmlsaXRpZXMoY3JlZGVudGlhbCwgdW5kZWZpbmVkLCBjYW5jZWxsZWQuc2lnbmFsKTtcblx0XHRcdGNvbnN0IHNlY29uZCA9IHNlcnZpY2UuZ2V0Q2FwYWJpbGl0aWVzKGNyZWRlbnRpYWwsIHVuZGVmaW5lZCwgYWN0aXZlLnNpZ25hbCk7XG5cdFx0XHRhd2FpdCByZXF1ZXN0U2Vlbi5wO1xuXG5cdFx0XHRjYW5jZWxsZWQuYWJvcnQobmV3IEVycm9yKCdjYW5jZWwgZmlyc3Qgd2FpdGVyJykpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gZmlyc3QsIC9jYW5jZWwgZmlyc3Qgd2FpdGVyLyk7XG5cdFx0XHRhd2FpdCByZWxlYXNlLmNvbXBsZXRlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZWNvbmQ6IGF3YWl0IHNlY29uZCxcblx0XHRcdFx0YWN0aXZlQWJvcnRlZDogYWN0aXZlLnNpZ25hbC5hYm9ydGVkLFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IHNlcnZlci5yZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNlY29uZDoge1xuXHRcdFx0XHRcdGdyYXBocWw6IHRydWUsXG5cdFx0XHRcdFx0bWVyZ2VRdWV1ZTogZmFsc2UsXG5cdFx0XHRcdFx0aW50ZXJuYWxNZXJnZVN0YXR1czogZmFsc2UsXG5cdFx0XHRcdFx0cmV2aWV3VGhyZWFkczogdHJ1ZSxcblx0XHRcdFx0XHRjaGVja0NvbnRleHRSZXF1aXJlZG5lc3M6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY3RpdmVBYm9ydGVkOiBmYWxzZSxcblx0XHRcdFx0cmVxdWVzdENvdW50OiAxLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNm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
