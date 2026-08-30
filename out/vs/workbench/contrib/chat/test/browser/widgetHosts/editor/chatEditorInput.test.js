import assert from "assert";
import { Event } from "../../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { constObservable } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { isResourceEditorInput } from "../../../../../../common/editor.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { clearChatEditor } from "../../../../browser/actions/chatClear.js";
import { ChatEditorInput } from "../../../../browser/widgetHosts/editor/chatEditorInput.js";
import { IAgentHostEnablementService } from "../../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IChatService } from "../../../../common/chatService/chatService.js";
import { IChatSessionsService, localChatSessionType, SessionType } from "../../../../common/chatSessionsService.js";
import { ChatAgentLocation } from "../../../../common/constants.js";
import { getChatSessionType, LocalChatSessionUri } from "../../../../common/model/chatUri.js";
import { MockChatSessionsService } from "../../../common/mockChatSessionsService.js";
import { TestContextService, TestStorageService } from "../../../../../../test/common/workbenchTestServices.js";
suite("ChatEditorInput", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("explicit local session type starts local session for generic editor URI", async () => {
    const sessionResource = LocalChatSessionUri.forSession("explicit-local");
    const model = {
      onDidDispose: Event.None,
      onDidChange: Event.None,
      sessionResource
    };
    let startCall;
    let didTryDefaultLoad = false;
    const chatService = {
      startNewLocalSession(location, options) {
        startCall = { location, options };
        return { object: model, dispose: () => {
        } };
      },
      async acquireOrLoadSession() {
        didTryDefaultLoad = true;
        return void 0;
      }
    };
    const input = new ChatEditorInput(
      ChatEditorInput.getNewEditorUri(),
      { explicitSessionType: localChatSessionType },
      chatService,
      {},
      {},
      {},
      {},
      {},
      new NullLogService(),
      new TestContextService(),
      { _serviceBrand: void 0, enabled: constObservable(false) }
    );
    try {
      const resolved = await input.resolve();
      assert.deepStrictEqual({
        model: resolved?.model,
        sessionResource: input.sessionResource,
        startLocation: startCall?.location,
        debugOwner: startCall?.options?.debugOwner,
        didTryDefaultLoad
      }, {
        model,
        sessionResource,
        startLocation: ChatAgentLocation.Chat,
        debugOwner: "ChatEditorInput#resolveExplicitLocal",
        didTryDefaultLoad: false
      });
    } finally {
      input.dispose();
    }
  });
  test("explicit local session type preserves empty local session resource", async () => {
    const sessionResource = LocalChatSessionUri.forSession("explicit-empty-local");
    const model = {
      hasRequests: false,
      onDidDispose: Event.None,
      onDidChange: Event.None,
      sessionResource
    };
    const loadedResources = [];
    const chatService = {
      async acquireOrLoadSession(resource) {
        loadedResources.push(resource.toString());
        return { object: model, dispose: () => {
        } };
      },
      startNewLocalSession() {
        throw new Error("Should not create a new local session when the local session resource resolves");
      }
    };
    const input = new ChatEditorInput(
      sessionResource,
      { explicitSessionType: localChatSessionType },
      chatService,
      {},
      {},
      {},
      {},
      {},
      new NullLogService(),
      new TestContextService(),
      { _serviceBrand: void 0, enabled: constObservable(false) }
    );
    try {
      const resolved = await input.resolve();
      assert.deepStrictEqual({
        model: resolved?.model,
        sessionResource: input.sessionResource,
        loadedResources
      }, {
        model,
        sessionResource,
        loadedResources: [sessionResource.toString()]
      });
    } finally {
      input.dispose();
    }
  });
  test("new chat replaces a current extension host Copilot CLI harness", async () => {
    const store = disposables.add(new DisposableStore());
    const instantiationService = store.add(new TestInstantiationService());
    const configurationService = new TestConfigurationService();
    const chatSessionsService = new MockChatSessionsService();
    chatSessionsService.setContributions([{
      type: SessionType.CopilotCLI,
      name: "Copilot CLI",
      displayName: "Copilot CLI",
      description: "Copilot CLI"
    }]);
    const storageService = store.add(new TestStorageService());
    const workspaceContextService = new TestContextService();
    const agentHostEnablementService = { _serviceBrand: void 0, enabled: constObservable(true) };
    instantiationService.stub(IChatService, {});
    instantiationService.stub(IDialogService, {});
    instantiationService.set(IConfigurationService, configurationService);
    instantiationService.set(IChatSessionsService, chatSessionsService);
    instantiationService.set(IStorageService, storageService);
    instantiationService.set(ILogService, new NullLogService());
    instantiationService.set(IWorkspaceContextService, workspaceContextService);
    instantiationService.set(IAgentHostEnablementService, agentHostEnablementService);
    const input = store.add(instantiationService.createInstance(
      ChatEditorInput,
      URI.from({ scheme: SessionType.CopilotCLI, path: "/session" }),
      {}
    ));
    let replacementResource;
    instantiationService.stub(IEditorService, {
      findEditors: () => [{ editor: input, groupId: 1 }],
      replaceEditors: async (replacements) => {
        const replacement = replacements[0].replacement;
        replacementResource = isResourceEditorInput(replacement) ? replacement.resource : void 0;
      }
    });
    try {
      await instantiationService.invokeFunction(clearChatEditor, input);
      assert.deepStrictEqual({
        currentSessionType: input.sessionResource ? getChatSessionType(input.sessionResource) : void 0,
        replacementSessionType: replacementResource ? getChatSessionType(replacementResource) : void 0
      }, {
        currentSessionType: SessionType.CopilotCLI,
        replacementSessionType: localChatSessionType
      });
    } finally {
      store.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldEhvc3RzXFxlZGl0b3JcXGNoYXRFZGl0b3JJbnB1dC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgaXNSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjbGVhckNoYXRFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvY2hhdENsZWFyLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSwgSUNoYXRTZXNzaW9uU3RhcnRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbENoYXRTZXNzaW9uVHlwZSwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5zdWl0ZSgnQ2hhdEVkaXRvcklucHV0JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZXhwbGljaXQgbG9jYWwgc2Vzc2lvbiB0eXBlIHN0YXJ0cyBsb2NhbCBzZXNzaW9uIGZvciBnZW5lcmljIGVkaXRvciBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdleHBsaWNpdC1sb2NhbCcpO1xuXHRcdGNvbnN0IG1vZGVsID0ge1xuXHRcdFx0b25EaWREaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0fSBhcyBQYXJ0aWFsPElDaGF0TW9kZWw+IGFzIElDaGF0TW9kZWw7XG5cblx0XHRsZXQgc3RhcnRDYWxsOiB7IGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbjsgb3B0aW9uczogSUNoYXRTZXNzaW9uU3RhcnRPcHRpb25zIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRpZFRyeURlZmF1bHRMb2FkID0gZmFsc2U7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSB7XG5cdFx0XHRzdGFydE5ld0xvY2FsU2Vzc2lvbihsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIG9wdGlvbnM/OiBJQ2hhdFNlc3Npb25TdGFydE9wdGlvbnMpIHtcblx0XHRcdFx0c3RhcnRDYWxsID0geyBsb2NhdGlvbiwgb3B0aW9ucyB9O1xuXHRcdFx0XHRyZXR1cm4geyBvYmplY3Q6IG1vZGVsLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBhY3F1aXJlT3JMb2FkU2Vzc2lvbigpIHtcblx0XHRcdFx0ZGlkVHJ5RGVmYXVsdExvYWQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRTZXJ2aWNlPiBhcyBJQ2hhdFNlcnZpY2U7XG5cblx0XHRjb25zdCBpbnB1dCA9IG5ldyBDaGF0RWRpdG9ySW5wdXQoXG5cdFx0XHRDaGF0RWRpdG9ySW5wdXQuZ2V0TmV3RWRpdG9yVXJpKCksXG5cdFx0XHR7IGV4cGxpY2l0U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0sXG5cdFx0XHRjaGF0U2VydmljZSxcblx0XHRcdHt9IGFzIElEaWFsb2dTZXJ2aWNlLFxuXHRcdFx0e30gYXMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0e30gYXMgSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHR7fSBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHR7fSBhcyBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBlbmFibGVkOiBjb25zdE9ic2VydmFibGUoZmFsc2UpIH0sXG5cdFx0KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG1vZGVsOiByZXNvbHZlZD8ubW9kZWwsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogaW5wdXQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRzdGFydExvY2F0aW9uOiBzdGFydENhbGw/LmxvY2F0aW9uLFxuXHRcdFx0XHRkZWJ1Z093bmVyOiBzdGFydENhbGw/Lm9wdGlvbnM/LmRlYnVnT3duZXIsXG5cdFx0XHRcdGRpZFRyeURlZmF1bHRMb2FkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRzdGFydExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0XHRkZWJ1Z093bmVyOiAnQ2hhdEVkaXRvcklucHV0I3Jlc29sdmVFeHBsaWNpdExvY2FsJyxcblx0XHRcdFx0ZGlkVHJ5RGVmYXVsdExvYWQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlucHV0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IGxvY2FsIHNlc3Npb24gdHlwZSBwcmVzZXJ2ZXMgZW1wdHkgbG9jYWwgc2Vzc2lvbiByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2V4cGxpY2l0LWVtcHR5LWxvY2FsJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSB7XG5cdFx0XHRoYXNSZXF1ZXN0czogZmFsc2UsXG5cdFx0XHRvbkRpZERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRNb2RlbD4gYXMgSUNoYXRNb2RlbDtcblxuXHRcdGNvbnN0IGxvYWRlZFJlc291cmNlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IHtcblx0XHRcdGFzeW5jIGFjcXVpcmVPckxvYWRTZXNzaW9uKHJlc291cmNlOiBVUkkpIHtcblx0XHRcdFx0bG9hZGVkUmVzb3VyY2VzLnB1c2gocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHJldHVybiB7IG9iamVjdDogbW9kZWwsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fSxcblx0XHRcdHN0YXJ0TmV3TG9jYWxTZXNzaW9uKCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZCBub3QgY3JlYXRlIGEgbmV3IGxvY2FsIHNlc3Npb24gd2hlbiB0aGUgbG9jYWwgc2Vzc2lvbiByZXNvdXJjZSByZXNvbHZlcycpO1xuXHRcdFx0fSxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRTZXJ2aWNlPiBhcyBJQ2hhdFNlcnZpY2U7XG5cblx0XHRjb25zdCBpbnB1dCA9IG5ldyBDaGF0RWRpdG9ySW5wdXQoXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR7IGV4cGxpY2l0U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0sXG5cdFx0XHRjaGF0U2VydmljZSxcblx0XHRcdHt9IGFzIElEaWFsb2dTZXJ2aWNlLFxuXHRcdFx0e30gYXMgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0e30gYXMgSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHR7fSBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHR7fSBhcyBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBlbmFibGVkOiBjb25zdE9ic2VydmFibGUoZmFsc2UpIH0sXG5cdFx0KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG1vZGVsOiByZXNvbHZlZD8ubW9kZWwsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogaW5wdXQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRsb2FkZWRSZXNvdXJjZXMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGxvYWRlZFJlc291cmNlczogW3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpXSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpbnB1dC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCduZXcgY2hhdCByZXBsYWNlcyBhIGN1cnJlbnQgZXh0ZW5zaW9uIGhvc3QgQ29waWxvdCBDTEkgaGFybmVzcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdGNoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0Q29udHJpYnV0aW9ucyhbe1xuXHRcdFx0dHlwZTogU2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdG5hbWU6ICdDb3BpbG90IENMSScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0NvcGlsb3QgQ0xJJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQ29waWxvdCBDTEknLFxuXHRcdH1dKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSgpO1xuXHRcdGNvbnN0IGFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGVuYWJsZWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSB9IHNhdGlzZmllcyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2U7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UsIGFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdEVkaXRvcklucHV0LFxuXHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNlc3Npb25UeXBlLkNvcGlsb3RDTEksIHBhdGg6ICcvc2Vzc2lvbicgfSksXG5cdFx0XHR7fSxcblx0XHQpKTtcblx0XHRsZXQgcmVwbGFjZW1lbnRSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIHtcblx0XHRcdGZpbmRFZGl0b3JzOiAoKSA9PiBbeyBlZGl0b3I6IGlucHV0LCBncm91cElkOiAxIH1dLFxuXHRcdFx0cmVwbGFjZUVkaXRvcnM6IGFzeW5jIHJlcGxhY2VtZW50cyA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gcmVwbGFjZW1lbnRzWzBdLnJlcGxhY2VtZW50O1xuXHRcdFx0XHRyZXBsYWNlbWVudFJlc291cmNlID0gaXNSZXNvdXJjZUVkaXRvcklucHV0KHJlcGxhY2VtZW50KSA/IHJlcGxhY2VtZW50LnJlc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjbGVhckNoYXRFZGl0b3IsIGlucHV0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGN1cnJlbnRTZXNzaW9uVHlwZTogaW5wdXQuc2Vzc2lvblJlc291cmNlID8gZ2V0Q2hhdFNlc3Npb25UeXBlKGlucHV0LnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlcGxhY2VtZW50U2Vzc2lvblR5cGU6IHJlcGxhY2VtZW50UmVzb3VyY2UgPyBnZXRDaGF0U2Vzc2lvblR5cGUocmVwbGFjZW1lbnRSZXNvdXJjZSkgOiB1bmRlZmluZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGN1cnJlbnRTZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQ29waWxvdENMSSxcblx0XHRcdFx0cmVwbGFjZW1lbnRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxvQkFBOEM7QUFDdkQsU0FBUyxzQkFBc0Isc0JBQXNCLG1CQUFtQjtBQUN4RSxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLG9CQUFvQiwyQkFBMkI7QUFDeEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQkFBb0IsMEJBQTBCO0FBRXZELE1BQU0sbUJBQW1CLE1BQU07QUFFOUIsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLDJFQUEyRSxZQUFZO0FBQzNGLFVBQU0sa0JBQWtCLG9CQUFvQixXQUFXLGdCQUFnQjtBQUN2RSxVQUFNLFFBQVE7QUFBQSxNQUNiLGNBQWMsTUFBTTtBQUFBLE1BQ3BCLGFBQWEsTUFBTTtBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSixRQUFJLG9CQUFvQjtBQUN4QixVQUFNLGNBQWM7QUFBQSxNQUNuQixxQkFBcUIsVUFBNkIsU0FBb0M7QUFDckYsb0JBQVksRUFBRSxVQUFVLFFBQVE7QUFDaEMsZUFBTyxFQUFFLFFBQVEsT0FBTyxTQUFTLE1BQU07QUFBQSxRQUFFLEVBQUU7QUFBQSxNQUM1QztBQUFBLE1BQ0EsTUFBTSx1QkFBdUI7QUFDNUIsNEJBQW9CO0FBQ3BCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxJQUFJO0FBQUEsTUFDakIsZ0JBQWdCLGdCQUFnQjtBQUFBLE1BQ2hDLEVBQUUscUJBQXFCLHFCQUFxQjtBQUFBLE1BQzVDO0FBQUEsTUFDQSxDQUFDO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxJQUFJLGVBQWU7QUFBQSxNQUNuQixJQUFJLG1CQUFtQjtBQUFBLE1BQ3ZCLEVBQUUsZUFBZSxRQUFXLFNBQVMsZ0JBQWdCLEtBQUssRUFBRTtBQUFBLElBQzdEO0FBRUEsUUFBSTtBQUNILFlBQU0sV0FBVyxNQUFNLE1BQU0sUUFBUTtBQUVyQyxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLE9BQU8sVUFBVTtBQUFBLFFBQ2pCLGlCQUFpQixNQUFNO0FBQUEsUUFDdkIsZUFBZSxXQUFXO0FBQUEsUUFDMUIsWUFBWSxXQUFXLFNBQVM7QUFBQSxRQUNoQztBQUFBLE1BQ0QsR0FBRztBQUFBLFFBQ0Y7QUFBQSxRQUNBO0FBQUEsUUFDQSxlQUFlLGtCQUFrQjtBQUFBLFFBQ2pDLFlBQVk7QUFBQSxRQUNaLG1CQUFtQjtBQUFBLE1BQ3BCLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxZQUFNLFFBQVE7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLGtCQUFrQixvQkFBb0IsV0FBVyxzQkFBc0I7QUFDN0UsVUFBTSxRQUFRO0FBQUEsTUFDYixhQUFhO0FBQUEsTUFDYixjQUFjLE1BQU07QUFBQSxNQUNwQixhQUFhLE1BQU07QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGtCQUE0QixDQUFDO0FBQ25DLFVBQU0sY0FBYztBQUFBLE1BQ25CLE1BQU0scUJBQXFCLFVBQWU7QUFDekMsd0JBQWdCLEtBQUssU0FBUyxTQUFTLENBQUM7QUFDeEMsZUFBTyxFQUFFLFFBQVEsT0FBTyxTQUFTLE1BQU07QUFBQSxRQUFFLEVBQUU7QUFBQSxNQUM1QztBQUFBLE1BQ0EsdUJBQXVCO0FBQ3RCLGNBQU0sSUFBSSxNQUFNLGdGQUFnRjtBQUFBLE1BQ2pHO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxJQUFJO0FBQUEsTUFDakI7QUFBQSxNQUNBLEVBQUUscUJBQXFCLHFCQUFxQjtBQUFBLE1BQzVDO0FBQUEsTUFDQSxDQUFDO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxJQUFJLGVBQWU7QUFBQSxNQUNuQixJQUFJLG1CQUFtQjtBQUFBLE1BQ3ZCLEVBQUUsZUFBZSxRQUFXLFNBQVMsZ0JBQWdCLEtBQUssRUFBRTtBQUFBLElBQzdEO0FBRUEsUUFBSTtBQUNILFlBQU0sV0FBVyxNQUFNLE1BQU0sUUFBUTtBQUVyQyxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLE9BQU8sVUFBVTtBQUFBLFFBQ2pCLGlCQUFpQixNQUFNO0FBQUEsUUFDdkI7QUFBQSxNQUNELEdBQUc7QUFBQSxRQUNGO0FBQUEsUUFDQTtBQUFBLFFBQ0EsaUJBQWlCLENBQUMsZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQzdDLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxZQUFNLFFBQVE7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxrRUFBa0UsWUFBWTtBQUNsRixVQUFNLFFBQVEsWUFBWSxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDbkQsVUFBTSx1QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDckUsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFDMUQsVUFBTSxzQkFBc0IsSUFBSSx3QkFBd0I7QUFDeEQsd0JBQW9CLGlCQUFpQixDQUFDO0FBQUEsTUFDckMsTUFBTSxZQUFZO0FBQUEsTUFDbEIsTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLElBQ2QsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxpQkFBaUIsTUFBTSxJQUFJLElBQUksbUJBQW1CLENBQUM7QUFDekQsVUFBTSwwQkFBMEIsSUFBSSxtQkFBbUI7QUFDdkQsVUFBTSw2QkFBNkIsRUFBRSxlQUFlLFFBQVcsU0FBUyxnQkFBZ0IsSUFBSSxFQUFFO0FBRTlGLHlCQUFxQixLQUFLLGNBQWMsQ0FBQyxDQUFDO0FBQzFDLHlCQUFxQixLQUFLLGdCQUFnQixDQUFDLENBQUM7QUFDNUMseUJBQXFCLElBQUksdUJBQXVCLG9CQUFvQjtBQUNwRSx5QkFBcUIsSUFBSSxzQkFBc0IsbUJBQW1CO0FBQ2xFLHlCQUFxQixJQUFJLGlCQUFpQixjQUFjO0FBQ3hELHlCQUFxQixJQUFJLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDMUQseUJBQXFCLElBQUksMEJBQTBCLHVCQUF1QjtBQUMxRSx5QkFBcUIsSUFBSSw2QkFBNkIsMEJBQTBCO0FBRWhGLFVBQU0sUUFBUSxNQUFNLElBQUkscUJBQXFCO0FBQUEsTUFDNUM7QUFBQSxNQUNBLElBQUksS0FBSyxFQUFFLFFBQVEsWUFBWSxZQUFZLE1BQU0sV0FBVyxDQUFDO0FBQUEsTUFDN0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFFBQUk7QUFDSix5QkFBcUIsS0FBSyxnQkFBZ0I7QUFBQSxNQUN6QyxhQUFhLE1BQU0sQ0FBQyxFQUFFLFFBQVEsT0FBTyxTQUFTLEVBQUUsQ0FBQztBQUFBLE1BQ2pELGdCQUFnQixPQUFNLGlCQUFnQjtBQUNyQyxjQUFNLGNBQWMsYUFBYSxDQUFDLEVBQUU7QUFDcEMsOEJBQXNCLHNCQUFzQixXQUFXLElBQUksWUFBWSxXQUFXO0FBQUEsTUFDbkY7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJO0FBQ0gsWUFBTSxxQkFBcUIsZUFBZSxpQkFBaUIsS0FBSztBQUVoRSxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLG9CQUFvQixNQUFNLGtCQUFrQixtQkFBbUIsTUFBTSxlQUFlLElBQUk7QUFBQSxRQUN4Rix3QkFBd0Isc0JBQXNCLG1CQUFtQixtQkFBbUIsSUFBSTtBQUFBLE1BQ3pGLEdBQUc7QUFBQSxRQUNGLG9CQUFvQixZQUFZO0FBQUEsUUFDaEMsd0JBQXdCO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sUUFBUTtBQUFBLElBQ2Y7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
