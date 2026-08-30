import assert from "assert";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NativePluginGitCommandService } from "../../electron-browser/pluginGitCommandService.js";
suite("NativePluginGitCommandService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createLocalGitStub(overrides) {
    return {
      _serviceBrand: void 0,
      clone: async () => {
      },
      pull: async () => false,
      checkout: async () => {
      },
      revParse: async () => "",
      fetch: async () => {
      },
      revListCount: async () => 0,
      cancel: async () => {
      },
      ...overrides
    };
  }
  test("cloneRepository delegates to ILocalGitService", async () => {
    const calls = [];
    const service = new NativePluginGitCommandService(createLocalGitStub({
      clone: async (_operationId, url, path, ref) => {
        calls.push(`clone:${url}:${path}:${ref}`);
      }
    }));
    const targetDir = URI.file("/tmp/repo");
    await service.cloneRepository("https://github.com/test/repo.git", targetDir, "main");
    assert.deepStrictEqual(calls, [`clone:https://github.com/test/repo.git:${targetDir.fsPath}:main`]);
  });
  test("pull delegates to ILocalGitService and returns result", async () => {
    let allowHardResetOnDivergence;
    const service = new NativePluginGitCommandService(createLocalGitStub({
      pull: async (_operationId, _repoPath, options) => {
        allowHardResetOnDivergence = options?.allowHardResetOnDivergence;
        return true;
      }
    }));
    const result = await service.pull(URI.file("/tmp/repo"));
    assert.strictEqual(result, true);
    assert.strictEqual(allowHardResetOnDivergence, true);
  });
  test("checkout delegates to ILocalGitService with detached flag", async () => {
    const calls = [];
    const service = new NativePluginGitCommandService(createLocalGitStub({
      checkout: async (_operationId, _path, treeish, detached) => {
        calls.push(`checkout:${treeish}:${detached}`);
      }
    }));
    await service.checkout(URI.file("/tmp/repo"), "abc123", true);
    assert.deepStrictEqual(calls, ["checkout:abc123:true"]);
  });
  test("revParse delegates to ILocalGitService", async () => {
    const service = new NativePluginGitCommandService(createLocalGitStub({
      revParse: async () => "abc123"
    }));
    const result = await service.revParse(URI.file("/tmp/repo"), "HEAD");
    assert.strictEqual(result, "abc123");
  });
  test("fetch delegates to ILocalGitService", async () => {
    const calls = [];
    const service = new NativePluginGitCommandService(createLocalGitStub({
      fetch: async (_operationId, path) => {
        calls.push(`fetch:${path}`);
      }
    }));
    const repoDir = URI.file("/tmp/repo");
    await service.fetch(repoDir);
    assert.deepStrictEqual(calls, [`fetch:${repoDir.fsPath}`]);
  });
  test("fetchRepository delegates to ILocalGitService.fetch", async () => {
    const calls = [];
    const service = new NativePluginGitCommandService(createLocalGitStub({
      fetch: async (_operationId, path) => {
        calls.push(`fetch:${path}`);
      }
    }));
    const repoDir = URI.file("/tmp/repo");
    await service.fetchRepository(repoDir);
    assert.deepStrictEqual(calls, [`fetch:${repoDir.fsPath}`]);
  });
  test("revListCount delegates to ILocalGitService", async () => {
    const service = new NativePluginGitCommandService(createLocalGitStub({
      revListCount: async () => 5
    }));
    const result = await service.revListCount(URI.file("/tmp/repo"), "HEAD", "@{u}");
    assert.strictEqual(result, 5);
  });
  test("cancellation token triggers cancel on local git service", async () => {
    const cts = store.add(new CancellationTokenSource());
    const cancelledIds = [];
    let cloneResolve;
    const service = new NativePluginGitCommandService(createLocalGitStub({
      clone: () => new Promise((resolve) => {
        cloneResolve = resolve;
      }),
      cancel: async (id) => {
        cancelledIds.push(id);
      }
    }));
    const p = service.cloneRepository("https://github.com/test/repo.git", URI.file("/tmp/repo"), void 0, cts.token);
    cts.cancel();
    assert.strictEqual(cancelledIds.length, 1);
    cloneResolve();
    await p;
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXHBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZ2l0L2NvbW1vbi9sb2NhbEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbGVjdHJvbi1icm93c2VyL3BsdWdpbkdpdENvbW1hbmRTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ05hdGl2ZVBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUxvY2FsR2l0U3R1YihvdmVycmlkZXM/OiBQYXJ0aWFsPElMb2NhbEdpdFNlcnZpY2U+KTogSUxvY2FsR2l0U2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGNsb25lOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRwdWxsOiBhc3luYyAoKSA9PiBmYWxzZSxcblx0XHRcdGNoZWNrb3V0OiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRyZXZQYXJzZTogYXN5bmMgKCkgPT4gJycsXG5cdFx0XHRmZXRjaDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cmV2TGlzdENvdW50OiBhc3luYyAoKSA9PiAwLFxuXHRcdFx0Y2FuY2VsOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fSBhcyBJTG9jYWxHaXRTZXJ2aWNlO1xuXHR9XG5cblx0dGVzdCgnY2xvbmVSZXBvc2l0b3J5IGRlbGVnYXRlcyB0byBJTG9jYWxHaXRTZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTmF0aXZlUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UoY3JlYXRlTG9jYWxHaXRTdHViKHtcblx0XHRcdGNsb25lOiBhc3luYyAoX29wZXJhdGlvbklkLCB1cmwsIHBhdGgsIHJlZikgPT4geyBjYWxscy5wdXNoKGBjbG9uZToke3VybH06JHtwYXRofToke3JlZn1gKTsgfSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCB0YXJnZXREaXIgPSBVUkkuZmlsZSgnL3RtcC9yZXBvJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS90ZXN0L3JlcG8uZ2l0JywgdGFyZ2V0RGlyLCAnbWFpbicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtgY2xvbmU6aHR0cHM6Ly9naXRodWIuY29tL3Rlc3QvcmVwby5naXQ6JHt0YXJnZXREaXIuZnNQYXRofTptYWluYF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWxsIGRlbGVnYXRlcyB0byBJTG9jYWxHaXRTZXJ2aWNlIGFuZCByZXR1cm5zIHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgYWxsb3dIYXJkUmVzZXRPbkRpdmVyZ2VuY2U6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBOYXRpdmVQbHVnaW5HaXRDb21tYW5kU2VydmljZShjcmVhdGVMb2NhbEdpdFN0dWIoe1xuXHRcdFx0cHVsbDogYXN5bmMgKF9vcGVyYXRpb25JZCwgX3JlcG9QYXRoLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGFsbG93SGFyZFJlc2V0T25EaXZlcmdlbmNlID0gb3B0aW9ucz8uYWxsb3dIYXJkUmVzZXRPbkRpdmVyZ2VuY2U7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnB1bGwoVVJJLmZpbGUoJy90bXAvcmVwbycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWxsb3dIYXJkUmVzZXRPbkRpdmVyZ2VuY2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGVja291dCBkZWxlZ2F0ZXMgdG8gSUxvY2FsR2l0U2VydmljZSB3aXRoIGRldGFjaGVkIGZsYWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBOYXRpdmVQbHVnaW5HaXRDb21tYW5kU2VydmljZShjcmVhdGVMb2NhbEdpdFN0dWIoe1xuXHRcdFx0Y2hlY2tvdXQ6IGFzeW5jIChfb3BlcmF0aW9uSWQsIF9wYXRoLCB0cmVlaXNoLCBkZXRhY2hlZCkgPT4geyBjYWxscy5wdXNoKGBjaGVja291dDoke3RyZWVpc2h9OiR7ZGV0YWNoZWR9YCk7IH0sXG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jaGVja291dChVUkkuZmlsZSgnL3RtcC9yZXBvJyksICdhYmMxMjMnLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ2NoZWNrb3V0OmFiYzEyMzp0cnVlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZQYXJzZSBkZWxlZ2F0ZXMgdG8gSUxvY2FsR2l0U2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IE5hdGl2ZVBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlKGNyZWF0ZUxvY2FsR2l0U3R1Yih7XG5cdFx0XHRyZXZQYXJzZTogYXN5bmMgKCkgPT4gJ2FiYzEyMycsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXZQYXJzZShVUkkuZmlsZSgnL3RtcC9yZXBvJyksICdIRUFEJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ2FiYzEyMycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmZXRjaCBkZWxlZ2F0ZXMgdG8gSUxvY2FsR2l0U2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IE5hdGl2ZVBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlKGNyZWF0ZUxvY2FsR2l0U3R1Yih7XG5cdFx0XHRmZXRjaDogYXN5bmMgKF9vcGVyYXRpb25JZCwgcGF0aCkgPT4geyBjYWxscy5wdXNoKGBmZXRjaDoke3BhdGh9YCk7IH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVwb0RpciA9IFVSSS5maWxlKCcvdG1wL3JlcG8nKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZldGNoKHJlcG9EaXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtgZmV0Y2g6JHtyZXBvRGlyLmZzUGF0aH1gXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZldGNoUmVwb3NpdG9yeSBkZWxlZ2F0ZXMgdG8gSUxvY2FsR2l0U2VydmljZS5mZXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IE5hdGl2ZVBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlKGNyZWF0ZUxvY2FsR2l0U3R1Yih7XG5cdFx0XHRmZXRjaDogYXN5bmMgKF9vcGVyYXRpb25JZCwgcGF0aCkgPT4geyBjYWxscy5wdXNoKGBmZXRjaDoke3BhdGh9YCk7IH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVwb0RpciA9IFVSSS5maWxlKCcvdG1wL3JlcG8nKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZldGNoUmVwb3NpdG9yeShyZXBvRGlyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbYGZldGNoOiR7cmVwb0Rpci5mc1BhdGh9YF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZMaXN0Q291bnQgZGVsZWdhdGVzIHRvIElMb2NhbEdpdFNlcnZpY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBOYXRpdmVQbHVnaW5HaXRDb21tYW5kU2VydmljZShjcmVhdGVMb2NhbEdpdFN0dWIoe1xuXHRcdFx0cmV2TGlzdENvdW50OiBhc3luYyAoKSA9PiA1LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmV2TGlzdENvdW50KFVSSS5maWxlKCcvdG1wL3JlcG8nKSwgJ0hFQUQnLCAnQHt1fScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsYXRpb24gdG9rZW4gdHJpZ2dlcnMgY2FuY2VsIG9uIGxvY2FsIGdpdCBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgY2FuY2VsbGVkSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBjbG9uZVJlc29sdmU6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IE5hdGl2ZVBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlKGNyZWF0ZUxvY2FsR2l0U3R1Yih7XG5cdFx0XHRjbG9uZTogKCkgPT4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7IGNsb25lUmVzb2x2ZSA9IHJlc29sdmU7IH0pLFxuXHRcdFx0Y2FuY2VsOiBhc3luYyAoaWQpID0+IHsgY2FuY2VsbGVkSWRzLnB1c2goaWQpOyB9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHAgPSBzZXJ2aWNlLmNsb25lUmVwb3NpdG9yeSgnaHR0cHM6Ly9naXRodWIuY29tL3Rlc3QvcmVwby5naXQnLCBVUkkuZmlsZSgnL3RtcC9yZXBvJyksIHVuZGVmaW5lZCwgY3RzLnRva2VuKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbmNlbGxlZElkcy5sZW5ndGgsIDEpO1xuXHRcdGNsb25lUmVzb2x2ZSEoKTtcblx0XHRhd2FpdCBwO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLHFDQUFxQztBQUU5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
