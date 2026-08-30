import assert from "assert";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { waitForState } from "../../../../../../base/common/observable.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { assertType } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { EditOperation } from "../../../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IEditorWorkerService } from "../../../../../../editor/common/services/editorWorker.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { SyncDescriptor } from "../../../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IWorkbenchAssignmentService } from "../../../../../services/assignment/common/assignmentService.js";
import { NullWorkbenchAssignmentService } from "../../../../../services/assignment/test/common/nullAssignmentService.js";
import { nullExtensionDescription } from "../../../../../services/extensions/common/extensions.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { IWorkspaceEditingService } from "../../../../../services/workspaces/common/workspaceEditing.js";
import { TestWorkerService } from "../../../../inlineChat/test/browser/testWorkerService.js";
import { IMcpService } from "../../../../mcp/common/mcpTypes.js";
import { TestMcpService } from "../../../../mcp/test/common/testMcpService.js";
import { IMultiDiffSourceResolverService } from "../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { INotebookService } from "../../../../notebook/common/notebookService.js";
import { ChatEditingService } from "../../../browser/chatEditing/chatEditingServiceImpl.js";
import { ChatSessionsService } from "../../../browser/chatSessions/chatSessions.contribution.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatEditingSessionState, IChatEditingService, ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { ChatService } from "../../../common/chatService/chatServiceImpl.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { IChatSlashCommandService } from "../../../common/participants/chatSlashCommands.js";
import { ChatTransferService, IChatTransferService } from "../../../common/model/chatTransferService.js";
import { IChatVariablesService } from "../../../common/attachments/chatVariables.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { NullLanguageModelsService } from "../../common/languageModels.js";
import { MockChatVariablesService } from "../../common/mockChatVariables.js";
import { MockPromptsService } from "../../common/promptSyntax/service/mockPromptsService.js";
import { IChatDebugService } from "../../../common/chatDebugService.js";
import { ChatDebugServiceImpl } from "../../../common/chatDebugServiceImpl.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
function getAgentData(id) {
  return {
    name: id,
    id,
    extensionId: nullExtensionDescription.identifier,
    extensionVersion: void 0,
    extensionPublisherId: "",
    publisherDisplayName: "",
    extensionDisplayName: "",
    locations: [ChatAgentLocation.Chat],
    modes: [ChatModeKind.Ask],
    metadata: {},
    slashCommands: [],
    disambiguation: []
  };
}
suite("ChatEditingService", function() {
  const store = new DisposableStore();
  let editingService;
  let chatService;
  let textModelService;
  setup(function() {
    const collection = new ServiceCollection();
    collection.set(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
    collection.set(IChatAgentService, new SyncDescriptor(ChatAgentService));
    collection.set(IChatVariablesService, new MockChatVariablesService());
    collection.set(IChatSlashCommandService, new class extends mock() {
    }());
    collection.set(IChatTransferService, new SyncDescriptor(ChatTransferService));
    collection.set(IChatSessionsService, new SyncDescriptor(ChatSessionsService));
    collection.set(IChatEditingService, new SyncDescriptor(ChatEditingService));
    collection.set(IEditorWorkerService, new SyncDescriptor(TestWorkerService));
    collection.set(IChatService, new SyncDescriptor(ChatService));
    collection.set(IMcpService, new TestMcpService());
    collection.set(IPromptsService, new MockPromptsService());
    collection.set(ILanguageModelsService, new SyncDescriptor(NullLanguageModelsService));
    collection.set(IChatDebugService, new ChatDebugServiceImpl(new TestConfigurationService()));
    collection.set(IMultiDiffSourceResolverService, new class extends mock() {
      registerResolver(_resolver) {
        return Disposable.None;
      }
    }());
    collection.set(IWorkspaceEditingService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidEnterWorkspace = Event.None;
      }
    }());
    collection.set(INotebookService, new class extends mock() {
      getNotebookTextModel(_uri) {
        return void 0;
      }
      hasSupportedNotebooks(_resource) {
        return false;
      }
    }());
    const insta = store.add(store.add(workbenchInstantiationService(void 0, store)).createChild(collection));
    store.add(insta.get(IEditorWorkerService));
    const value = insta.get(IChatEditingService);
    assert.ok(value instanceof ChatEditingService);
    editingService = value;
    chatService = insta.get(IChatService);
    store.add(insta.get(IChatSessionsService));
    store.add(chatService);
    chatService.setSaveModelsEnabled(false);
    const chatAgentService = insta.get(IChatAgentService);
    const agent = {
      async invoke(request, progress, history, token) {
        return {};
      }
    };
    store.add(chatAgentService.registerAgent("testAgent", { ...getAgentData("testAgent"), isDefault: true }));
    store.add(chatAgentService.registerAgentImplementation("testAgent", agent));
    textModelService = insta.get(ITextModelService);
    const modelService = insta.get(IModelService);
    store.add(textModelService.registerTextModelContentProvider("test", {
      async provideTextContent(resource) {
        return store.add(modelService.createModel(resource.path.repeat(10), null, resource, false));
      }
    }));
  });
  teardown(async () => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("create session", async function() {
    assert.ok(editingService);
    const modelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
    const model = modelRef.object;
    const session = editingService.createEditingSession(model, true);
    assert.strictEqual(session.chatSessionResource.toString(), model.sessionResource.toString());
    assert.strictEqual(session.isGlobalEditingSession, true);
    await assertThrowsAsync(async () => {
      editingService.createEditingSession(model);
    });
    session.dispose();
    modelRef.dispose();
  });
  test("create session, file entry & isCurrentlyBeingModifiedBy", async function() {
    assert.ok(editingService);
    const uri = URI.from({ scheme: "test", path: "HelloWorld" });
    const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
    const model = modelRef.object;
    const session = model.editingSession;
    if (!session) {
      assert.fail("session not created");
    }
    const chatRequest = model?.addRequest({ text: "", parts: [] }, { variables: [] }, 0);
    assertType(chatRequest.response);
    chatRequest.response.updateContent({ kind: "textEdit", uri, edits: [], done: false });
    chatRequest.response.updateContent({ kind: "textEdit", uri, edits: [{ range: new Range(1, 1, 1, 1), text: "FarBoo\n" }], done: false });
    chatRequest.response.updateContent({ kind: "textEdit", uri, edits: [], done: true });
    const entry = await waitForState(session.entries.map((value) => value.find((a) => isEqual(a.modifiedURI, uri))));
    assert.ok(isEqual(entry.modifiedURI, uri));
    await waitForState(entry.isCurrentlyBeingModifiedBy.map((value) => value === chatRequest.response));
    assert.ok(entry.isCurrentlyBeingModifiedBy.get()?.responseModel === chatRequest.response);
    const unset = waitForState(entry.isCurrentlyBeingModifiedBy.map((res) => res === void 0));
    chatRequest.response.complete();
    await unset;
    await entry.reject();
  });
  async function idleAfterEdit(session, model, uri, edits) {
    const isStreaming = waitForState(session.state.map((s) => s === ChatEditingSessionState.StreamingEdits), Boolean);
    const chatRequest = model.addRequest({ text: "", parts: [] }, { variables: [] }, 0);
    assertType(chatRequest.response);
    chatRequest.response.updateContent({ kind: "textEdit", uri, edits, done: true });
    const entry = await waitForState(session.entries.map((value) => value.find((a) => isEqual(a.modifiedURI, uri))));
    assert.ok(isEqual(entry.modifiedURI, uri));
    chatRequest.response.complete();
    await isStreaming;
    const isIdle = waitForState(session.state.map((s) => s === ChatEditingSessionState.Idle), Boolean);
    await isIdle;
    return entry;
  }
  test("mirror typing outside -> accept", async function() {
    return runWithFakedTimers({}, async () => {
      assert.ok(editingService);
      const uri = URI.from({ scheme: "test", path: "abc\n" });
      const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
      const model = modelRef.object;
      const session = model.editingSession;
      assertType(session, "session not created");
      const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "FarBoo\n" }]);
      const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
      const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);
      assert.strictEqual(original.getValue(), "abc\n".repeat(10));
      assert.strictEqual(modified.getValue(), "FarBoo\n" + "abc\n".repeat(10));
      modified.pushEditOperations(null, [EditOperation.insert(new Position(3, 1), "USER_TYPE\n")], () => null);
      assert.ok(modified.getValue().includes("USER_TYPE"));
      assert.ok(original.getValue().includes("USER_TYPE"));
      await entry.accept();
      assert.strictEqual(modified.getValue(), original.getValue());
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Accepted);
      assert.ok(modified.getValue().includes("FarBoo"));
      assert.ok(original.getValue().includes("FarBoo"));
    });
  });
  test("mirror typing outside -> reject", async function() {
    return runWithFakedTimers({}, async () => {
      assert.ok(editingService);
      const uri = URI.from({ scheme: "test", path: "abc\n" });
      const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
      const model = modelRef.object;
      const session = model.editingSession;
      assertType(session, "session not created");
      const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "FarBoo\n" }]);
      const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
      const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);
      assert.strictEqual(original.getValue(), "abc\n".repeat(10));
      assert.strictEqual(modified.getValue(), "FarBoo\n" + "abc\n".repeat(10));
      modified.pushEditOperations(null, [EditOperation.insert(new Position(3, 1), "USER_TYPE\n")], () => null);
      assert.ok(modified.getValue().includes("USER_TYPE"));
      assert.ok(original.getValue().includes("USER_TYPE"));
      await entry.reject();
      assert.strictEqual(modified.getValue(), original.getValue());
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Rejected);
      assert.ok(!modified.getValue().includes("FarBoo"));
      assert.ok(!original.getValue().includes("FarBoo"));
    });
  });
  test("NO mirror typing inside -> accept", async function() {
    return runWithFakedTimers({}, async () => {
      assert.ok(editingService);
      const uri = URI.from({ scheme: "test", path: "abc\n" });
      const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
      const model = modelRef.object;
      const session = model.editingSession;
      assertType(session, "session not created");
      const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "FarBoo\n" }]);
      const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
      const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);
      assert.strictEqual(original.getValue(), "abc\n".repeat(10));
      assert.strictEqual(modified.getValue(), "FarBoo\n" + "abc\n".repeat(10));
      modified.pushEditOperations(null, [EditOperation.replace(new Range(1, 2, 1, 7), "ooBar")], () => null);
      assert.ok(modified.getValue().includes("FooBar"));
      assert.ok(!original.getValue().includes("FooBar"));
      await entry.accept();
      assert.strictEqual(modified.getValue(), original.getValue());
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Accepted);
      assert.ok(modified.getValue().includes("FooBar"));
      assert.ok(original.getValue().includes("FooBar"));
    });
  });
  test("ChatEditingService merges text edits it shouldn't merge, #272679", async function() {
    return runWithFakedTimers({}, async () => {
      assert.ok(editingService);
      const uri = URI.from({ scheme: "test", path: "abc" });
      const modified = store.add(await textModelService.createModelReference(uri)).object.textEditorModel;
      const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
      const model = modelRef.object;
      const session = model.editingSession;
      assertType(session, "session not created");
      modified.setValue("");
      await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "a" }, { range: new Range(1, 1, 1, 1), text: "b" }]);
      assert.strictEqual(modified.getValue(), "ab");
      modified.setValue("");
      await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "a" }]);
      await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "b" }]);
      assert.strictEqual(modified.getValue(), "ba");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyB3YWl0Rm9yU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUaHJvd3NBc3luYywgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvdGVzdC9jb21tb24vbnVsbEFzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUVkaXRpbmcuanMnO1xuaW1wb3J0IHsgVGVzdFdvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9pbmxpbmVDaGF0L3Rlc3QvYnJvd3Nlci90ZXN0V29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgVGVzdE1jcFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9tY3AvdGVzdC9jb21tb24vdGVzdE1jcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZlNvdXJjZVJlc29sdmVyLCBJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvbXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0U2Vzc2lvbnMvY2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRTZXJ2aWNlLCBJQ2hhdEFnZW50RGF0YSwgSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSwgSUNoYXRFZGl0aW5nU2VydmljZSwgSUNoYXRFZGl0aW5nU2Vzc2lvbiwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IENoYXRUcmFuc2ZlclNlcnZpY2UsIElDaGF0VHJhbnNmZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRUcmFuc2ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRWYXJpYWJsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFZhcmlhYmxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbW9ja0NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgTW9ja1Byb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL21vY2tQcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z1NlcnZpY2VJbXBsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcblxuZnVuY3Rpb24gZ2V0QWdlbnREYXRhKGlkOiBzdHJpbmcpOiBJQ2hhdEFnZW50RGF0YSB7XG5cdHJldHVybiB7XG5cdFx0bmFtZTogaWQsXG5cdFx0aWQ6IGlkLFxuXHRcdGV4dGVuc2lvbklkOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRleHRlbnNpb25WZXJzaW9uOiB1bmRlZmluZWQsXG5cdFx0ZXh0ZW5zaW9uUHVibGlzaGVySWQ6ICcnLFxuXHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiAnJyxcblx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogJycsXG5cdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0bW9kZXM6IFtDaGF0TW9kZUtpbmQuQXNrXSxcblx0XHRtZXRhZGF0YToge30sXG5cdFx0c2xhc2hDb21tYW5kczogW10sXG5cdFx0ZGlzYW1iaWd1YXRpb246IFtdLFxuXHR9O1xufVxuXG5zdWl0ZSgnQ2hhdEVkaXRpbmdTZXJ2aWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgZWRpdGluZ1NlcnZpY2U6IENoYXRFZGl0aW5nU2VydmljZTtcblx0bGV0IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2U7XG5cdGxldCB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZTtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgbmV3IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSgpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJQ2hhdEFnZW50U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKENoYXRBZ2VudFNlcnZpY2UpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJQ2hhdFZhcmlhYmxlc1NlcnZpY2UsIG5ldyBNb2NrQ2hhdFZhcmlhYmxlc1NlcnZpY2UoKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSB7IH0pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElDaGF0VHJhbnNmZXJTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdFRyYW5zZmVyU2VydmljZSkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdFNlc3Npb25zU2VydmljZSkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElDaGF0RWRpdGluZ1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihDaGF0RWRpdGluZ1NlcnZpY2UpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJRWRpdG9yV29ya2VyU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3RXb3JrZXJTZXJ2aWNlKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSUNoYXRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdFNlcnZpY2UpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJTWNwU2VydmljZSwgbmV3IFRlc3RNY3BTZXJ2aWNlKCkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElQcm9tcHRzU2VydmljZSwgbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTnVsbExhbmd1YWdlTW9kZWxzU2VydmljZSkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElDaGF0RGVidWdTZXJ2aWNlLCBuZXcgQ2hhdERlYnVnU2VydmljZUltcGwobmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSU11bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyUmVzb2x2ZXIoX3Jlc29sdmVyOiBJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEVudGVyV29ya3NwYWNlID0gRXZlbnQuTm9uZTtcblx0XHR9KTtcblx0XHRjb2xsZWN0aW9uLnNldChJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0Tm90ZWJvb2tUZXh0TW9kZWwoX3VyaTogVVJJKTogTm90ZWJvb2tUZXh0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgaGFzU3VwcG9ydGVkTm90ZWJvb2tzKF9yZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YSA9IHN0b3JlLmFkZChzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkpLmNyZWF0ZUNoaWxkKGNvbGxlY3Rpb24pKTtcblx0XHRzdG9yZS5hZGQoaW5zdGEuZ2V0KElFZGl0b3JXb3JrZXJTZXJ2aWNlKSBhcyBUZXN0V29ya2VyU2VydmljZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBpbnN0YS5nZXQoSUNoYXRFZGl0aW5nU2VydmljZSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlIGluc3RhbmNlb2YgQ2hhdEVkaXRpbmdTZXJ2aWNlKTtcblx0XHRlZGl0aW5nU2VydmljZSA9IHZhbHVlO1xuXG5cdFx0Y2hhdFNlcnZpY2UgPSBpbnN0YS5nZXQoSUNoYXRTZXJ2aWNlKTtcblxuXHRcdHN0b3JlLmFkZChpbnN0YS5nZXQoSUNoYXRTZXNzaW9uc1NlcnZpY2UpIGFzIENoYXRTZXNzaW9uc1NlcnZpY2UpOyAvLyBOZWVkcyB0byBiZSBkaXNwb3NlZCBpbiBiZXR3ZWVuIHRlc3QgcnVucyB0byBjbGVhciBleHRlbnNpb25Qb2ludCBjb250cmlidXRpb25cblx0XHRzdG9yZS5hZGQoY2hhdFNlcnZpY2UgYXMgQ2hhdFNlcnZpY2UpO1xuXHRcdGNoYXRTZXJ2aWNlLnNldFNhdmVNb2RlbHNFbmFibGVkKGZhbHNlKTtcblxuXHRcdGNvbnN0IGNoYXRBZ2VudFNlcnZpY2UgPSBpbnN0YS5nZXQoSUNoYXRBZ2VudFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWdlbnQ6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiA9IHtcblx0XHRcdGFzeW5jIGludm9rZShyZXF1ZXN0LCBwcm9ncmVzcywgaGlzdG9yeSwgdG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ3Rlc3RBZ2VudCcsIHsgLi4uZ2V0QWdlbnREYXRhKCd0ZXN0QWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHRzdG9yZS5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oJ3Rlc3RBZ2VudCcsIGFnZW50KSk7XG5cblx0XHR0ZXh0TW9kZWxTZXJ2aWNlID0gaW5zdGEuZ2V0KElUZXh0TW9kZWxTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGluc3RhLmdldChJTW9kZWxTZXJ2aWNlKTtcblxuXHRcdHN0b3JlLmFkZCh0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKCd0ZXN0Jywge1xuXHRcdFx0YXN5bmMgcHJvdmlkZVRleHRDb250ZW50KHJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybiBzdG9yZS5hZGQobW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKHJlc291cmNlLnBhdGgucmVwZWF0KDEwKSwgbnVsbCwgcmVzb3VyY2UsIGZhbHNlKSk7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NyZWF0ZSBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5vayhlZGl0aW5nU2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbFJlZiA9IGNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBlZGl0aW5nU2VydmljZS5jcmVhdGVFZGl0aW5nU2Vzc2lvbihtb2RlbCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5jaGF0U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIG1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0dsb2JhbEVkaXRpbmdTZXNzaW9uLCB0cnVlKTtcblxuXHRcdGF3YWl0IGFzc2VydFRocm93c0FzeW5jKGFzeW5jICgpID0+IHtcblx0XHRcdC8vIERVUEUgbm90IGFsbG93ZWRcblx0XHRcdGVkaXRpbmdTZXJ2aWNlLmNyZWF0ZUVkaXRpbmdTZXNzaW9uKG1vZGVsKTtcblx0XHR9KTtcblxuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdG1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIHNlc3Npb24sIGZpbGUgZW50cnkgJiBpc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQub2soZWRpdGluZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JywgcGF0aDogJ0hlbGxvV29ybGQnIH0pO1xuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBzdG9yZS5hZGQoY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRjb25zdCBzZXNzaW9uID0gbW9kZWwuZWRpdGluZ1Nlc3Npb247XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnc2Vzc2lvbiBub3QgY3JlYXRlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRSZXF1ZXN0ID0gbW9kZWw/LmFkZFJlcXVlc3QoeyB0ZXh0OiAnJywgcGFydHM6IFtdIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRhc3NlcnRUeXBlKGNoYXRSZXF1ZXN0LnJlc3BvbnNlKTtcblx0XHRjaGF0UmVxdWVzdC5yZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3RleHRFZGl0JywgdXJpLCBlZGl0czogW10sIGRvbmU6IGZhbHNlIH0pO1xuXHRcdGNoYXRSZXF1ZXN0LnJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAndGV4dEVkaXQnLCB1cmksIGVkaXRzOiBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnRmFyQm9vXFxuJyB9XSwgZG9uZTogZmFsc2UgfSk7XG5cdFx0Y2hhdFJlcXVlc3QucmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGtpbmQ6ICd0ZXh0RWRpdCcsIHVyaSwgZWRpdHM6IFtdLCBkb25lOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgZW50cnkgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc2Vzc2lvbi5lbnRyaWVzLm1hcCh2YWx1ZSA9PiB2YWx1ZS5maW5kKGEgPT4gaXNFcXVhbChhLm1vZGlmaWVkVVJJLCB1cmkpKSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGlzRXF1YWwoZW50cnkubW9kaWZpZWRVUkksIHVyaSkpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKGVudHJ5LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5Lm1hcCh2YWx1ZSA9PiB2YWx1ZSA9PT0gY2hhdFJlcXVlc3QucmVzcG9uc2UpKTtcblx0XHRhc3NlcnQub2soZW50cnkuaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnkuZ2V0KCk/LnJlc3BvbnNlTW9kZWwgPT09IGNoYXRSZXF1ZXN0LnJlc3BvbnNlKTtcblxuXHRcdGNvbnN0IHVuc2V0ID0gd2FpdEZvclN0YXRlKGVudHJ5LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5Lm1hcChyZXMgPT4gcmVzID09PSB1bmRlZmluZWQpKTtcblxuXHRcdGNoYXRSZXF1ZXN0LnJlc3BvbnNlLmNvbXBsZXRlKCk7XG5cblx0XHRhd2FpdCB1bnNldDtcblxuXHRcdGF3YWl0IGVudHJ5LnJlamVjdCgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBpZGxlQWZ0ZXJFZGl0KHNlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24sIG1vZGVsOiBDaGF0TW9kZWwsIHVyaTogVVJJLCBlZGl0czogVGV4dEVkaXRbXSkge1xuXHRcdGNvbnN0IGlzU3RyZWFtaW5nID0gd2FpdEZvclN0YXRlKHNlc3Npb24uc3RhdGUubWFwKHMgPT4gcyA9PT0gQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuU3RyZWFtaW5nRWRpdHMpLCBCb29sZWFuKTtcblxuXHRcdGNvbnN0IGNoYXRSZXF1ZXN0ID0gbW9kZWwuYWRkUmVxdWVzdCh7IHRleHQ6ICcnLCBwYXJ0czogW10gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdGFzc2VydFR5cGUoY2hhdFJlcXVlc3QucmVzcG9uc2UpO1xuXG5cdFx0Y2hhdFJlcXVlc3QucmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGtpbmQ6ICd0ZXh0RWRpdCcsIHVyaSwgZWRpdHMsIGRvbmU6IHRydWUgfSk7XG5cblx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHdhaXRGb3JTdGF0ZShzZXNzaW9uLmVudHJpZXMubWFwKHZhbHVlID0+IHZhbHVlLmZpbmQoYSA9PiBpc0VxdWFsKGEubW9kaWZpZWRVUkksIHVyaSkpKSk7XG5cblx0XHRhc3NlcnQub2soaXNFcXVhbChlbnRyeS5tb2RpZmllZFVSSSwgdXJpKSk7XG5cblx0XHRjaGF0UmVxdWVzdC5yZXNwb25zZS5jb21wbGV0ZSgpO1xuXG5cdFx0YXdhaXQgaXNTdHJlYW1pbmc7XG5cblx0XHRjb25zdCBpc0lkbGUgPSB3YWl0Rm9yU3RhdGUoc2Vzc2lvbi5zdGF0ZS5tYXAocyA9PiBzID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5JZGxlKSwgQm9vbGVhbik7XG5cdFx0YXdhaXQgaXNJZGxlO1xuXG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0dGVzdCgnbWlycm9yIHR5cGluZyBvdXRzaWRlIC0+IGFjY2VwdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZWRpdGluZ1NlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiAnYWJjXFxuJyB9KTtcblxuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSBzdG9yZS5hZGQoY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IG1vZGVsLmVkaXRpbmdTZXNzaW9uO1xuXHRcdFx0YXNzZXJ0VHlwZShzZXNzaW9uLCAnc2Vzc2lvbiBub3QgY3JlYXRlZCcpO1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IGlkbGVBZnRlckVkaXQoc2Vzc2lvbiwgbW9kZWwsIHVyaSwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ0ZhckJvb1xcbicgfV0pO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBzdG9yZS5hZGQoYXdhaXQgdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShlbnRyeS5vcmlnaW5hbFVSSSkpLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRjb25zdCBtb2RpZmllZCA9IHN0b3JlLmFkZChhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGVudHJ5Lm1vZGlmaWVkVVJJKSkub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnN0YXRlLmdldCgpLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9yaWdpbmFsLmdldFZhbHVlKCksICdhYmNcXG4nLnJlcGVhdCgxMCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGlmaWVkLmdldFZhbHVlKCksICdGYXJCb29cXG4nICsgJ2FiY1xcbicucmVwZWF0KDEwKSk7XG5cblx0XHRcdG1vZGlmaWVkLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDMsIDEpLCAnVVNFUl9UWVBFXFxuJyldLCAoKSA9PiBudWxsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG1vZGlmaWVkLmdldFZhbHVlKCkuaW5jbHVkZXMoJ1VTRVJfVFlQRScpKTtcblx0XHRcdGFzc2VydC5vayhvcmlnaW5hbC5nZXRWYWx1ZSgpLmluY2x1ZGVzKCdVU0VSX1RZUEUnKSk7XG5cblx0XHRcdGF3YWl0IGVudHJ5LmFjY2VwdCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGlmaWVkLmdldFZhbHVlKCksIG9yaWdpbmFsLmdldFZhbHVlKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnN0YXRlLmdldCgpLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLkFjY2VwdGVkKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG1vZGlmaWVkLmdldFZhbHVlKCkuaW5jbHVkZXMoJ0ZhckJvbycpKTtcblx0XHRcdGFzc2VydC5vayhvcmlnaW5hbC5nZXRWYWx1ZSgpLmluY2x1ZGVzKCdGYXJCb28nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pcnJvciB0eXBpbmcgb3V0c2lkZSAtPiByZWplY3QnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGVkaXRpbmdTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JywgcGF0aDogJ2FiY1xcbicgfSk7XG5cblx0XHRcdGNvbnN0IG1vZGVsUmVmID0gc3RvcmUuYWRkKGNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBtb2RlbC5lZGl0aW5nU2Vzc2lvbjtcblx0XHRcdGFzc2VydFR5cGUoc2Vzc2lvbiwgJ3Nlc3Npb24gbm90IGNyZWF0ZWQnKTtcblxuXHRcdFx0Y29uc3QgZW50cnkgPSBhd2FpdCBpZGxlQWZ0ZXJFZGl0KHNlc3Npb24sIG1vZGVsLCB1cmksIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdGYXJCb29cXG4nIH1dKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsID0gc3RvcmUuYWRkKGF3YWl0IHRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoZW50cnkub3JpZ2luYWxVUkkpKS5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWQgPSBzdG9yZS5hZGQoYXdhaXQgdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShlbnRyeS5tb2RpZmllZFVSSSkpLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5zdGF0ZS5nZXQoKSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcmlnaW5hbC5nZXRWYWx1ZSgpLCAnYWJjXFxuJy5yZXBlYXQoMTApKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RpZmllZC5nZXRWYWx1ZSgpLCAnRmFyQm9vXFxuJyArICdhYmNcXG4nLnJlcGVhdCgxMCkpO1xuXG5cdFx0XHRtb2RpZmllZC5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigzLCAxKSwgJ1VTRVJfVFlQRVxcbicpXSwgKCkgPT4gbnVsbCk7XG5cblx0XHRcdGFzc2VydC5vayhtb2RpZmllZC5nZXRWYWx1ZSgpLmluY2x1ZGVzKCdVU0VSX1RZUEUnKSk7XG5cdFx0XHRhc3NlcnQub2sob3JpZ2luYWwuZ2V0VmFsdWUoKS5pbmNsdWRlcygnVVNFUl9UWVBFJykpO1xuXG5cdFx0XHRhd2FpdCBlbnRyeS5yZWplY3QoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RpZmllZC5nZXRWYWx1ZSgpLCBvcmlnaW5hbC5nZXRWYWx1ZSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5zdGF0ZS5nZXQoKSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5SZWplY3RlZCk7XG5cblx0XHRcdGFzc2VydC5vayghbW9kaWZpZWQuZ2V0VmFsdWUoKS5pbmNsdWRlcygnRmFyQm9vJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFvcmlnaW5hbC5nZXRWYWx1ZSgpLmluY2x1ZGVzKCdGYXJCb28nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ05PIG1pcnJvciB0eXBpbmcgaW5zaWRlIC0+IGFjY2VwdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZWRpdGluZ1NlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiAnYWJjXFxuJyB9KTtcblxuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSBzdG9yZS5hZGQoY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IG1vZGVsLmVkaXRpbmdTZXNzaW9uO1xuXHRcdFx0YXNzZXJ0VHlwZShzZXNzaW9uLCAnc2Vzc2lvbiBub3QgY3JlYXRlZCcpO1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IGlkbGVBZnRlckVkaXQoc2Vzc2lvbiwgbW9kZWwsIHVyaSwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ0ZhckJvb1xcbicgfV0pO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBzdG9yZS5hZGQoYXdhaXQgdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShlbnRyeS5vcmlnaW5hbFVSSSkpLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRjb25zdCBtb2RpZmllZCA9IHN0b3JlLmFkZChhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGVudHJ5Lm1vZGlmaWVkVVJJKSkub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnN0YXRlLmdldCgpLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9yaWdpbmFsLmdldFZhbHVlKCksICdhYmNcXG4nLnJlcGVhdCgxMCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGlmaWVkLmdldFZhbHVlKCksICdGYXJCb29cXG4nICsgJ2FiY1xcbicucmVwZWF0KDEwKSk7XG5cblx0XHRcdG1vZGlmaWVkLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbRWRpdE9wZXJhdGlvbi5yZXBsYWNlKG5ldyBSYW5nZSgxLCAyLCAxLCA3KSwgJ29vQmFyJyldLCAoKSA9PiBudWxsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG1vZGlmaWVkLmdldFZhbHVlKCkuaW5jbHVkZXMoJ0Zvb0JhcicpKTtcblx0XHRcdGFzc2VydC5vayghb3JpZ2luYWwuZ2V0VmFsdWUoKS5pbmNsdWRlcygnRm9vQmFyJykpOyAvLyB0eXBlZCBpbiB0aGUgQUkgZWRpdHMsIERPIE5PVCB0cmFuc3Bvc2VcblxuXHRcdFx0YXdhaXQgZW50cnkuYWNjZXB0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kaWZpZWQuZ2V0VmFsdWUoKSwgb3JpZ2luYWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuc3RhdGUuZ2V0KCksIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQpO1xuXG5cdFx0XHRhc3NlcnQub2sobW9kaWZpZWQuZ2V0VmFsdWUoKS5pbmNsdWRlcygnRm9vQmFyJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG9yaWdpbmFsLmdldFZhbHVlKCkuaW5jbHVkZXMoJ0Zvb0JhcicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ2hhdEVkaXRpbmdTZXJ2aWNlIG1lcmdlcyB0ZXh0IGVkaXRzIGl0IHNob3VsZG5cXCd0IG1lcmdlLCAjMjcyNjc5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5vayhlZGl0aW5nU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6ICdhYmMnIH0pO1xuXG5cdFx0XHRjb25zdCBtb2RpZmllZCA9IHN0b3JlLmFkZChhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSkpLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRcdGNvbnN0IG1vZGVsUmVmID0gc3RvcmUuYWRkKGNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBtb2RlbC5lZGl0aW5nU2Vzc2lvbjtcblx0XHRcdGFzc2VydFR5cGUoc2Vzc2lvbiwgJ3Nlc3Npb24gbm90IGNyZWF0ZWQnKTtcblxuXHRcdFx0bW9kaWZpZWQuc2V0VmFsdWUoJycpO1xuXHRcdFx0YXdhaXQgaWRsZUFmdGVyRWRpdChzZXNzaW9uLCBtb2RlbCwgdXJpLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnYScgfSwgeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnYicgfV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGlmaWVkLmdldFZhbHVlKCksICdhYicpO1xuXG5cdFx0XHRtb2RpZmllZC5zZXRWYWx1ZSgnJyk7XG5cdFx0XHRhd2FpdCBpZGxlQWZ0ZXJFZGl0KHNlc3Npb24sIG1vZGVsLCB1cmksIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdhJyB9XSk7XG5cdFx0XHRhd2FpdCBpZGxlQWZ0ZXJFZGl0KHNlc3Npb24sIG1vZGVsLCB1cmksIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdiJyB9XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kaWZpZWQuZ2V0VmFsdWUoKSwgJ2JhJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJB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
