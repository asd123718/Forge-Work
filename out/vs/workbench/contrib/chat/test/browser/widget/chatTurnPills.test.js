import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { BrowserViewEditorId } from "../../../../browserView/common/browserView.js";
import { openChatTurnFile, previewKind } from "../../../browser/widget/chatTurnPills.js";
import { ChatConfiguration } from "../../../common/constants.js";
suite("ChatTurnPills", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("opens a markdown resource with its configured chat editor association", async () => {
    const resource = URI.file("/workspace/README.md");
    let opened;
    const openerService = new class extends mock() {
      async open(resource2, options) {
        opened = { resource: resource2.toString(), options };
        return true;
      }
    }();
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorAssociations]: {
        "*.md": "vscode.markdown.editor"
      }
    });
    await openChatTurnFile({ uri: resource, kind: "markdown", created: true }, openerService, configurationService);
    assert.deepStrictEqual(opened, {
      resource: resource.toString(),
      options: {
        fromUserGesture: true,
        editorOptions: {
          override: "vscode.markdown.editor"
        }
      }
    });
  });
  test("classifies supported preview resources", () => {
    assert.deepStrictEqual([
      previewKind(URI.file("/workspace/README.md"), true),
      previewKind(URI.file("/workspace/index.html"), true),
      previewKind(URI.file("/workspace/index.HTM"), true),
      previewKind(URI.parse("vscode-remote://authority/workspace/index.html"), true),
      previewKind(URI.file("/workspace/index.ts"), true)
    ], [
      "markdown",
      "html",
      "html",
      void 0,
      void 0
    ]);
  });
  test("does not classify HTML when its preview is unavailable", () => {
    assert.strictEqual(previewKind(URI.file("/workspace/index.html"), false), void 0);
  });
  test("opens an HTML resource in the Integrated Browser", async () => {
    const resource = URI.file("/workspace/index.html");
    let opened;
    const openerService = new class extends mock() {
      async open(resource2, options) {
        opened = { resource: resource2.toString(), options };
        return true;
      }
    }();
    await openChatTurnFile({ uri: resource, kind: "html", created: true }, openerService, new TestConfigurationService());
    assert.deepStrictEqual(opened, {
      resource: resource.toString(),
      options: {
        fromUserGesture: true,
        editorOptions: {
          override: BrowserViewEditorId
        }
      }
    });
  });
  test("prefers a configured chat editor association over the Integrated Browser", async () => {
    const resource = URI.file("/workspace/index.html");
    let opened;
    const openerService = new class extends mock() {
      async open(resource2, options) {
        opened = { resource: resource2.toString(), options };
        return true;
      }
    }();
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.EditorAssociations]: {
        "*.html": "default"
      }
    });
    await openChatTurnFile({ uri: resource, kind: "html", created: true }, openerService, configurationService);
    assert.deepStrictEqual(opened, {
      resource: resource.toString(),
      options: {
        fromUserGesture: true,
        editorOptions: {
          override: "default"
        }
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdFR1cm5QaWxscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSwgT3BlbkV4dGVybmFsT3B0aW9ucywgT3BlbkludGVybmFsT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3RWRpdG9ySWQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgb3BlbkNoYXRUdXJuRmlsZSwgcHJldmlld0tpbmQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0VHVyblBpbGxzLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5cbnN1aXRlKCdDaGF0VHVyblBpbGxzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdvcGVucyBhIG1hcmtkb3duIHJlc291cmNlIHdpdGggaXRzIGNvbmZpZ3VyZWQgY2hhdCBlZGl0b3IgYXNzb2NpYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9SRUFETUUubWQnKTtcblx0XHRsZXQgb3BlbmVkOiB7IHJlc291cmNlOiBzdHJpbmc7IG9wdGlvbnM6IE9wZW5JbnRlcm5hbE9wdGlvbnMgfCBPcGVuRXh0ZXJuYWxPcHRpb25zIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU9wZW5lclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlbihyZXNvdXJjZTogc3RyaW5nIHwgVVJJLCBvcHRpb25zPzogT3BlbkludGVybmFsT3B0aW9ucyB8IE9wZW5FeHRlcm5hbE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdFx0b3BlbmVkID0geyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgb3B0aW9ucyB9O1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yQXNzb2NpYXRpb25zXToge1xuXHRcdFx0XHQnKi5tZCc6ICd2c2NvZGUubWFya2Rvd24uZWRpdG9yJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBvcGVuQ2hhdFR1cm5GaWxlKHsgdXJpOiByZXNvdXJjZSwga2luZDogJ21hcmtkb3duJywgY3JlYXRlZDogdHJ1ZSB9LCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZW5lZCwge1xuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSxcblx0XHRcdFx0ZWRpdG9yT3B0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJyaWRlOiAndnNjb2RlLm1hcmtkb3duLmVkaXRvcicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGFzc2lmaWVzIHN1cHBvcnRlZCBwcmV2aWV3IHJlc291cmNlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHByZXZpZXdLaW5kKFVSSS5maWxlKCcvd29ya3NwYWNlL1JFQURNRS5tZCcpLCB0cnVlKSxcblx0XHRcdHByZXZpZXdLaW5kKFVSSS5maWxlKCcvd29ya3NwYWNlL2luZGV4Lmh0bWwnKSwgdHJ1ZSksXG5cdFx0XHRwcmV2aWV3S2luZChVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbmRleC5IVE0nKSwgdHJ1ZSksXG5cdFx0XHRwcmV2aWV3S2luZChVUkkucGFyc2UoJ3ZzY29kZS1yZW1vdGU6Ly9hdXRob3JpdHkvd29ya3NwYWNlL2luZGV4Lmh0bWwnKSwgdHJ1ZSksXG5cdFx0XHRwcmV2aWV3S2luZChVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbmRleC50cycpLCB0cnVlKSxcblx0XHRdLCBbXG5cdFx0XHQnbWFya2Rvd24nLFxuXHRcdFx0J2h0bWwnLFxuXHRcdFx0J2h0bWwnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjbGFzc2lmeSBIVE1MIHdoZW4gaXRzIHByZXZpZXcgaXMgdW5hdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXZpZXdLaW5kKFVSSS5maWxlKCcvd29ya3NwYWNlL2luZGV4Lmh0bWwnKSwgZmFsc2UpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVucyBhbiBIVE1MIHJlc291cmNlIGluIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbmRleC5odG1sJyk7XG5cdFx0bGV0IG9wZW5lZDogeyByZXNvdXJjZTogc3RyaW5nOyBvcHRpb25zOiBPcGVuSW50ZXJuYWxPcHRpb25zIHwgT3BlbkV4dGVybmFsT3B0aW9ucyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElPcGVuZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW4ocmVzb3VyY2U6IHN0cmluZyB8IFVSSSwgb3B0aW9ucz86IE9wZW5JbnRlcm5hbE9wdGlvbnMgfCBPcGVuRXh0ZXJuYWxPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0XHRcdG9wZW5lZCA9IHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIG9wdGlvbnMgfTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGF3YWl0IG9wZW5DaGF0VHVybkZpbGUoeyB1cmk6IHJlc291cmNlLCBraW5kOiAnaHRtbCcsIGNyZWF0ZWQ6IHRydWUgfSwgb3BlbmVyU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCB7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZnJvbVVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcnJpZGU6IEJyb3dzZXJWaWV3RWRpdG9ySWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmZXJzIGEgY29uZmlndXJlZCBjaGF0IGVkaXRvciBhc3NvY2lhdGlvbiBvdmVyIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9pbmRleC5odG1sJyk7XG5cdFx0bGV0IG9wZW5lZDogeyByZXNvdXJjZTogc3RyaW5nOyBvcHRpb25zOiBPcGVuSW50ZXJuYWxPcHRpb25zIHwgT3BlbkV4dGVybmFsT3B0aW9ucyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElPcGVuZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW4ocmVzb3VyY2U6IHN0cmluZyB8IFVSSSwgb3B0aW9ucz86IE9wZW5JbnRlcm5hbE9wdGlvbnMgfCBPcGVuRXh0ZXJuYWxPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0XHRcdG9wZW5lZCA9IHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIG9wdGlvbnMgfTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVkaXRvckFzc29jaWF0aW9uc106IHtcblx0XHRcdFx0JyouaHRtbCc6ICdkZWZhdWx0Jyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBvcGVuQ2hhdFR1cm5GaWxlKHsgdXJpOiByZXNvdXJjZSwga2luZDogJ2h0bWwnLCBjcmVhdGVkOiB0cnVlIH0sIG9wZW5lclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCB7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZnJvbVVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdFx0b3ZlcnJpZGU6ICdkZWZhdWx0Jyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQixtQkFBbUI7QUFDOUMsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSxpQkFBaUIsTUFBTTtBQUM1QiwwQ0FBd0M7QUFFeEMsT0FBSyx5RUFBeUUsWUFBWTtBQUN6RixVQUFNLFdBQVcsSUFBSSxLQUFLLHNCQUFzQjtBQUNoRCxRQUFJO0FBQ0osVUFBTSxnQkFBZ0IsSUFBSSxjQUFjLEtBQXFCLEVBQUU7QUFBQSxNQUM5RCxNQUFlLEtBQUtBLFdBQXdCLFNBQXVFO0FBQ2xILGlCQUFTLEVBQUUsVUFBVUEsVUFBUyxTQUFTLEdBQUcsUUFBUTtBQUNsRCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxVQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUFBLE1BQ3pELENBQUMsa0JBQWtCLGtCQUFrQixHQUFHO0FBQUEsUUFDdkMsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLGlCQUFpQixFQUFFLEtBQUssVUFBVSxNQUFNLFlBQVksU0FBUyxLQUFLLEdBQUcsZUFBZSxvQkFBb0I7QUFFOUcsV0FBTyxnQkFBZ0IsUUFBUTtBQUFBLE1BQzlCLFVBQVUsU0FBUyxTQUFTO0FBQUEsTUFDNUIsU0FBUztBQUFBLFFBQ1IsaUJBQWlCO0FBQUEsUUFDakIsZUFBZTtBQUFBLFVBQ2QsVUFBVTtBQUFBLFFBQ1g7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwQ0FBMEMsTUFBTTtBQUNwRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFlBQVksSUFBSSxLQUFLLHNCQUFzQixHQUFHLElBQUk7QUFBQSxNQUNsRCxZQUFZLElBQUksS0FBSyx1QkFBdUIsR0FBRyxJQUFJO0FBQUEsTUFDbkQsWUFBWSxJQUFJLEtBQUssc0JBQXNCLEdBQUcsSUFBSTtBQUFBLE1BQ2xELFlBQVksSUFBSSxNQUFNLGdEQUFnRCxHQUFHLElBQUk7QUFBQSxNQUM3RSxZQUFZLElBQUksS0FBSyxxQkFBcUIsR0FBRyxJQUFJO0FBQUEsSUFDbEQsR0FBRztBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxXQUFPLFlBQVksWUFBWSxJQUFJLEtBQUssdUJBQXVCLEdBQUcsS0FBSyxHQUFHLE1BQVM7QUFBQSxFQUNwRixDQUFDO0FBRUQsT0FBSyxvREFBb0QsWUFBWTtBQUNwRSxVQUFNLFdBQVcsSUFBSSxLQUFLLHVCQUF1QjtBQUNqRCxRQUFJO0FBQ0osVUFBTSxnQkFBZ0IsSUFBSSxjQUFjLEtBQXFCLEVBQUU7QUFBQSxNQUM5RCxNQUFlLEtBQUtBLFdBQXdCLFNBQXVFO0FBQ2xILGlCQUFTLEVBQUUsVUFBVUEsVUFBUyxTQUFTLEdBQUcsUUFBUTtBQUNsRCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGlCQUFpQixFQUFFLEtBQUssVUFBVSxNQUFNLFFBQVEsU0FBUyxLQUFLLEdBQUcsZUFBZSxJQUFJLHlCQUF5QixDQUFDO0FBRXBILFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixVQUFVLFNBQVMsU0FBUztBQUFBLE1BQzVCLFNBQVM7QUFBQSxRQUNSLGlCQUFpQjtBQUFBLFFBQ2pCLGVBQWU7QUFBQSxVQUNkLFVBQVU7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNEVBQTRFLFlBQVk7QUFDNUYsVUFBTSxXQUFXLElBQUksS0FBSyx1QkFBdUI7QUFDakQsUUFBSTtBQUNKLFVBQU0sZ0JBQWdCLElBQUksY0FBYyxLQUFxQixFQUFFO0FBQUEsTUFDOUQsTUFBZSxLQUFLQSxXQUF3QixTQUF1RTtBQUNsSCxpQkFBUyxFQUFFLFVBQVVBLFVBQVMsU0FBUyxHQUFHLFFBQVE7QUFDbEQsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFBQSxNQUN6RCxDQUFDLGtCQUFrQixrQkFBa0IsR0FBRztBQUFBLFFBQ3ZDLFVBQVU7QUFBQSxNQUNYO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxpQkFBaUIsRUFBRSxLQUFLLFVBQVUsTUFBTSxRQUFRLFNBQVMsS0FBSyxHQUFHLGVBQWUsb0JBQW9CO0FBRTFHLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixVQUFVLFNBQVMsU0FBUztBQUFBLE1BQzVCLFNBQVM7QUFBQSxRQUNSLGlCQUFpQjtBQUFBLFFBQ2pCLGVBQWU7QUFBQSxVQUNkLFVBQVU7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInJlc291cmNlIl0KfQo=
