import assert from "assert";
import * as sinon from "sinon";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { URI } from "../../../../base/common/uri.js";
import { asSinonMethodStub } from "../../../../base/test/common/sinonUtils.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../platform/contextkey/browser/contextKeyService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../platform/log/common/log.js";
import { IAgentSessionsService } from "../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { ChatSessionsService } from "../../../contrib/chat/browser/chatSessions/chatSessions.contribution.js";
import { IChatService } from "../../../contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation } from "../../../contrib/chat/common/constants.js";
import { LocalChatSessionUri } from "../../../contrib/chat/common/model/chatUri.js";
import { MockChatService } from "../../../contrib/chat/test/common/chatService/mockChatService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ExtensionHostKind } from "../../../services/extensions/common/extensionHostKind.js";
import { IExtensionService, nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { mock, TestExtensionService } from "../../../test/common/workbenchTestServices.js";
import { MainThreadChatSessions, ObservableChatSession } from "../../browser/mainThreadChatSessions.js";
import { ExtHostChatSessions } from "../../common/extHostChatSessions.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { ExtHostLanguageModels } from "../../common/extHostLanguageModels.js";
import * as extHostTypes from "../../common/extHostTypes.js";
import { AnyCallRPCProtocol } from "../common/testRPCProtocol.js";
suite("ObservableChatSession", function() {
  let disposables;
  let logService;
  let dialogService;
  let proxy;
  setup(function() {
    disposables = new DisposableStore();
    logService = new NullLogService();
    dialogService = new class extends mock() {
      async confirm() {
        return { confirmed: true };
      }
    }();
    proxy = {
      $provideChatSessionContent: sinon.stub(),
      $provideChatSessionProviderOptions: sinon.stub().resolves(void 0),
      $provideHandleOptionsChange: sinon.stub(),
      $interruptChatSessionActiveResponse: sinon.stub(),
      $invokeChatSessionRequestHandler: sinon.stub(),
      $disposeChatSessionContent: sinon.stub(),
      $refreshChatSessionItems: sinon.stub(),
      $onDidChangeChatSessionItemState: sinon.stub(),
      $newChatSessionItem: sinon.stub().resolves(void 0),
      $forkChatSession: sinon.stub().resolves(void 0),
      $resolveChatSessionItem: sinon.stub().resolves(void 0),
      $provideChatSessionInputState: sinon.stub().resolves(void 0)
    };
  });
  teardown(function() {
    disposables.dispose();
    sinon.restore();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSessionContent(options = {}) {
    const id = options.id || "test-id";
    return {
      resource: LocalChatSessionUri.forSession(id),
      title: options.title,
      history: options.history || [],
      hasActiveResponseCallback: options.hasActiveResponseCallback ?? false,
      hasRequestHandler: options.hasRequestHandler ?? false,
      hasForkHandler: options.hasForkHandler ?? false,
      supportsInterruption: false
    };
  }
  async function createInitializedSession(sessionContent, sessionId = "test-id") {
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = new ObservableChatSession(resource, 1, proxy, logService, dialogService);
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await session.initialize(CancellationToken.None, { initialSessionOptions: [] });
    return session;
  }
  test("constructor creates session with proper initial state", function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    assert.strictEqual(session.providerHandle, 1);
    assert.deepStrictEqual(session.history, []);
    assert.ok(session.progressObs);
    assert.ok(session.isCompleteObs);
    assert.deepStrictEqual(session.progressObs.get(), []);
    assert.strictEqual(session.isCompleteObs.get(), false);
  });
  test("session queues progress before initialization and processes it after", async function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    const progress1 = { kind: "progressMessage", content: { value: "Hello", isTrusted: false } };
    const progress2 = { kind: "progressMessage", content: { value: "World", isTrusted: false } };
    session.handleProgressChunk("req1", [progress1]);
    session.handleProgressChunk("req1", [progress2]);
    assert.deepStrictEqual(session.progressObs.get(), []);
    const sessionContent = createSessionContent();
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await session.initialize(CancellationToken.None, { initialSessionOptions: [] });
    assert.strictEqual(session.progressObs.get().length, 2);
    assert.deepStrictEqual(session.progressObs.get(), [progress1, progress2]);
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("initialization loads session history and sets up capabilities", async function() {
    const sessionHistory = [
      { type: "request", prompt: "Previous question" },
      { type: "response", parts: [{ kind: "progressMessage", content: { value: "Previous answer", isTrusted: false } }] }
    ];
    const sessionContent = createSessionContent({
      history: sessionHistory,
      hasActiveResponseCallback: true,
      hasRequestHandler: true
    });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.history.length, 2);
    assert.strictEqual(session.history[0].type, "request");
    assert.strictEqual(session.history[0].prompt, "Previous question");
    assert.strictEqual(session.history[1].type, "response");
    assert.ok(session.interruptActiveResponseCallback);
    assert.ok(session.requestHandler);
  });
  test("initialization revives modeInstructions in history", async function() {
    const sessionContent = createSessionContent({
      history: [
        {
          type: "request",
          prompt: "Hello",
          participant: "test",
          modeInstructions: {
            uri: { $mid: MarshalledId.Uri, scheme: "file", path: "/custom-agent" },
            name: "my-agent",
            content: "instructions",
            toolReferences: [],
            isBuiltin: false
          }
        }
      ]
    });
    const session = disposables.add(await createInitializedSession(sessionContent));
    const requestItem = session.history[0];
    assert.strictEqual(requestItem.type, "request");
    if (requestItem.type === "request") {
      assert.ok(requestItem.modeInstructions);
      assert.ok(URI.isUri(requestItem.modeInstructions.uri));
      assert.strictEqual(requestItem.modeInstructions.name, "my-agent");
      assert.strictEqual(requestItem.modeInstructions.isBuiltin, false);
    }
  });
  test("toRequestDto passes modeInstructions through", async function() {
    const session = disposables.add(await createInitializedSession(createSessionContent({ hasForkHandler: true })));
    assert.ok(session.forkSession);
    const modeInstructions = {
      uri: URI.parse("file:///custom-agent"),
      name: "my-agent",
      content: "agent instructions",
      toolReferences: [],
      isBuiltin: false
    };
    const request = {
      type: "request",
      id: "req-1",
      prompt: "Hello with mode",
      participant: "participant",
      modeInstructions
    };
    const forkedItem = {
      resource: URI.file("/tmp/forked.md"),
      label: "Forked",
      changes: [],
      timing: {
        created: 123,
        lastRequestStarted: 234,
        lastRequestEnded: 345
      }
    };
    asSinonMethodStub(proxy.$forkChatSession).resolves(forkedItem);
    await session.forkSession?.(request, CancellationToken.None);
    const call = asSinonMethodStub(proxy.$forkChatSession).firstCall;
    const sentDto = call.args[2];
    assert.deepStrictEqual(sentDto.modeInstructions, modeInstructions);
  });
  test("initialization sets forkSession and revives forked items", async function() {
    const session = disposables.add(await createInitializedSession(createSessionContent({ hasForkHandler: true })));
    assert.ok(session.forkSession);
    const forkedResource = URI.file("/tmp/forked-chat.md");
    const forkedItem = {
      resource: forkedResource,
      label: "Forked Session",
      timing: {
        created: 123,
        lastRequestStarted: 234,
        lastRequestEnded: 345
      },
      changes: [{
        uri: URI.file("/tmp/changed.ts"),
        originalUri: URI.file("/tmp/original.ts"),
        insertions: 4,
        deletions: 2
      }]
    };
    asSinonMethodStub(proxy.$forkChatSession).resolves(forkedItem);
    const request = { type: "request", id: "request-1", prompt: "Previous question", participant: "participant" };
    const expectedRequestDto = {
      type: "request",
      id: "request-1",
      prompt: "Previous question",
      participant: "participant",
      command: void 0,
      variableData: void 0,
      modelId: void 0,
      modeInstructions: void 0
    };
    const result = await session.forkSession?.(request, CancellationToken.None);
    assert.ok(asSinonMethodStub(proxy.$forkChatSession).calledOnceWithExactly(1, session.sessionResource, expectedRequestDto, CancellationToken.None));
    assert.ok(result);
    assert.ok(result.resource instanceof URI);
    assert.ok(Array.isArray(result.changes));
    assert.ok(result.changes[0].uri instanceof URI);
    assert.ok(result.changes[0].originalUri instanceof URI);
    assert.deepStrictEqual(result, forkedItem);
  });
  test("initialization sets title from session content", async function() {
    const sessionContent = createSessionContent({
      title: "My Custom Title"
    });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.title, "My Custom Title");
  });
  test("title is undefined when not provided in session content", async function() {
    const sessionContent = createSessionContent();
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.title, void 0);
  });
  test("initialization is idempotent and returns same promise", async function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    const sessionContent = createSessionContent();
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const promise1 = session.initialize(CancellationToken.None, { initialSessionOptions: [] });
    const promise2 = session.initialize(CancellationToken.None, { initialSessionOptions: [] });
    assert.strictEqual(promise1, promise2);
    await promise1;
    assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnce);
  });
  test("initialization forwards initial session options context", async function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    const initialSessionOptions = [{ optionId: "model", value: "gpt-4.1" }];
    const sessionContent = createSessionContent();
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await session.initialize(CancellationToken.None, { initialSessionOptions });
    assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnceWith(
      1,
      resource,
      { initialSessionOptions },
      CancellationToken.None
    ));
  });
  test("progress handling works correctly after initialization", async function() {
    const sessionContent = createSessionContent();
    const session = disposables.add(await createInitializedSession(sessionContent));
    const progress = { kind: "progressMessage", content: { value: "New progress", isTrusted: false } };
    session.handleProgressChunk("req1", [progress]);
    assert.deepStrictEqual(session.progressObs.get(), [progress]);
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("progress completion updates session state correctly", async function() {
    const sessionContent = createSessionContent();
    const session = disposables.add(await createInitializedSession(sessionContent));
    const progress = { kind: "progressMessage", content: { value: "Processing...", isTrusted: false } };
    session.handleProgressChunk("req1", [progress]);
    assert.strictEqual(session.isCompleteObs.get(), true);
    session.handleProgressComplete("req1");
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("session with active response callback becomes active when progress is added", async function() {
    const sessionContent = createSessionContent({ hasActiveResponseCallback: true });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.isCompleteObs.get(), false);
    const progress = { kind: "progressMessage", content: { value: "Processing...", isTrusted: false } };
    session.handleProgressChunk("req1", [progress]);
    assert.strictEqual(session.isCompleteObs.get(), false);
    session.handleProgressComplete("req1");
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("request handler forwards requests to proxy", async function() {
    const sessionContent = createSessionContent({ hasRequestHandler: true });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.ok(session.requestHandler);
    const request = {
      requestId: "req1",
      sessionResource: LocalChatSessionUri.forSession("test-session"),
      agentId: "test-agent",
      message: "Test prompt",
      location: ChatAgentLocation.Chat,
      variables: { variables: [] }
    };
    const progressCallback = sinon.stub();
    await session.requestHandler(request, progressCallback, [], CancellationToken.None);
    assert.ok(asSinonMethodStub(proxy.$invokeChatSessionRequestHandler).calledOnceWith(1, session.sessionResource, request, [], CancellationToken.None));
  });
  test("request handler forwards progress updates to external callback", async function() {
    const sessionContent = createSessionContent({ hasRequestHandler: true });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.ok(session.requestHandler);
    const request = {
      requestId: "req1",
      sessionResource: LocalChatSessionUri.forSession("test-session"),
      agentId: "test-agent",
      message: "Test prompt",
      location: ChatAgentLocation.Chat,
      variables: { variables: [] }
    };
    const progressCallback = sinon.stub();
    let resolveRequest;
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    asSinonMethodStub(proxy.$invokeChatSessionRequestHandler).returns(requestPromise);
    const requestHandlerPromise = session.requestHandler(request, progressCallback, [], CancellationToken.None);
    const progress1 = { kind: "progressMessage", content: { value: "Progress 1", isTrusted: false } };
    const progress2 = { kind: "progressMessage", content: { value: "Progress 2", isTrusted: false } };
    session.handleProgressChunk("req1", [progress1]);
    session.handleProgressChunk("req1", [progress2]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(progressCallback.calledTwice);
    assert.deepStrictEqual(progressCallback.firstCall.args[0], [progress1]);
    assert.deepStrictEqual(progressCallback.secondCall.args[0], [progress2]);
    resolveRequest({});
    await requestHandlerPromise;
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("dispose properly cleans up resources and notifies listeners", function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    let disposeEventFired = false;
    const disposable = session.onWillDispose(() => {
      disposeEventFired = true;
    });
    session.dispose();
    assert.ok(disposeEventFired);
    assert.ok(asSinonMethodStub(proxy.$disposeChatSessionContent).calledOnceWith(1, resource));
    disposable.dispose();
  });
  test("session with multiple request/response pairs in history", async function() {
    const sessionHistory = [
      { type: "request", prompt: "First question" },
      { type: "response", parts: [{ kind: "progressMessage", content: { value: "First answer", isTrusted: false } }] },
      { type: "request", prompt: "Second question" },
      { type: "response", parts: [{ kind: "progressMessage", content: { value: "Second answer", isTrusted: false } }] }
    ];
    const sessionContent = createSessionContent({
      history: sessionHistory,
      hasActiveResponseCallback: false,
      hasRequestHandler: false
    });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.history.length, 4);
    assert.strictEqual(session.history[0].type, "request");
    assert.strictEqual(session.history[0].prompt, "First question");
    assert.strictEqual(session.history[1].type, "response");
    assert.strictEqual(session.history[1].parts[0].content.value, "First answer");
    assert.strictEqual(session.history[2].type, "request");
    assert.strictEqual(session.history[2].prompt, "Second question");
    assert.strictEqual(session.history[3].type, "response");
    assert.strictEqual(session.history[3].parts[0].content.value, "Second answer");
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
});
suite("MainThreadChatSessions", function() {
  let instantiationService;
  let mainThread;
  let proxy;
  let chatSessionsService;
  let disposables;
  let logService;
  setup(function() {
    disposables = new DisposableStore();
    instantiationService = new TestInstantiationService();
    proxy = {
      $provideChatSessionContent: sinon.stub(),
      $provideChatSessionProviderOptions: sinon.stub().resolves(void 0),
      $provideHandleOptionsChange: sinon.stub(),
      $interruptChatSessionActiveResponse: sinon.stub(),
      $invokeChatSessionRequestHandler: sinon.stub(),
      $disposeChatSessionContent: sinon.stub(),
      $refreshChatSessionItems: sinon.stub(),
      $onDidChangeChatSessionItemState: sinon.stub(),
      $newChatSessionItem: sinon.stub().resolves(void 0),
      $forkChatSession: sinon.stub().resolves(void 0),
      $resolveChatSessionItem: sinon.stub().resolves(void 0),
      $provideChatSessionInputState: sinon.stub().resolves(void 0)
    };
    const extHostContext = new class {
      constructor() {
        this.remoteAuthority = "";
        this.extensionHostKind = ExtensionHostKind.LocalProcess;
      }
      dispose() {
      }
      assertRegistered() {
      }
      set(v) {
        return null;
      }
      getProxy() {
        return proxy;
      }
      drain() {
        return null;
      }
    }();
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
    logService = new NullLogService();
    instantiationService.stub(ILogService, logService);
    instantiationService.stub(IEditorService, new class extends mock() {
    }());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IViewsService, new class extends mock() {
      async openView() {
        return null;
      }
    }());
    instantiationService.stub(IDialogService, new class extends mock() {
      async confirm() {
        return { confirmed: true };
      }
    }());
    instantiationService.stub(ILabelService, new class extends mock() {
      registerFormatter() {
        return {
          dispose: () => {
          }
        };
      }
    }());
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IAgentSessionsService, new class extends mock() {
      get model() {
        return new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeSessionArchivedState = Event.None;
          }
        }();
      }
    }());
    chatSessionsService = disposables.add(instantiationService.createInstance(ChatSessionsService));
    instantiationService.stub(IChatSessionsService, chatSessionsService);
    mainThread = disposables.add(instantiationService.createInstance(MainThreadChatSessions, extHostContext));
  });
  teardown(function() {
    disposables.dispose();
    instantiationService.dispose();
    sinon.restore();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("provideChatSessionContent creates and initializes session", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session1 = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.ok(session1);
    const session2 = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(session1, session2);
    assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnce);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("provideChatSessionContent propagates title", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      title: "My Session Title",
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(session.title, "My Session Title");
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("$handleProgressChunk routes to correct session", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    const progressDto = { kind: "progressMessage", content: { value: "Test", isTrusted: false } };
    await mainThread.$handleProgressChunk(1, resource, "req1", [progressDto]);
    assert.strictEqual(session.progressObs.get().length, 1);
    assert.strictEqual(session.progressObs.get()[0].kind, "progressMessage");
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("$handleProgressComplete marks session complete", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    const progressDto = { kind: "progressMessage", content: { value: "Test", isTrusted: false } };
    await mainThread.$handleProgressChunk(1, resource, "req1", [progressDto]);
    mainThread.$handleProgressComplete(1, resource, "req1");
    assert.strictEqual(session.isCompleteObs.get(), true);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("integration with multiple request/response pairs", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/multi-turn-session`);
    const sessionContent = {
      resource,
      history: [
        { type: "request", prompt: "First question", participant: "test-participant" },
        { type: "response", parts: [{ kind: "progressMessage", content: { value: "First answer", isTrusted: false } }], participant: "test-participant" },
        { type: "request", prompt: "Second question", participant: "test-participant" },
        { type: "response", parts: [{ kind: "progressMessage", content: { value: "Second answer", isTrusted: false } }], participant: "test-participant" }
      ],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.ok(session);
    assert.strictEqual(session.history.length, 4);
    assert.strictEqual(session.history[0].type, "request");
    assert.strictEqual(session.history[0].prompt, "First question");
    assert.strictEqual(session.history[1].type, "response");
    assert.strictEqual(session.history[2].type, "request");
    assert.strictEqual(session.history[2].prompt, "Second question");
    assert.strictEqual(session.history[3].type, "response");
    assert.strictEqual(session.isCompleteObs.get(), true);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("$onDidChangeChatSessionProviderOptions refreshes option groups", async function() {
    const sessionScheme = "test-session-type";
    const handle = 1;
    const optionGroups1 = [{
      id: "models",
      name: "Models",
      items: [{ id: "modelA", name: "Model A" }]
    }];
    const optionGroups2 = [{
      id: "models",
      name: "Models",
      items: [{ id: "modelB", name: "Model B" }]
    }];
    const provideOptionsStub = asSinonMethodStub(proxy.$provideChatSessionProviderOptions);
    provideOptionsStub.onFirstCall().resolves({ optionGroups: optionGroups1 });
    provideOptionsStub.onSecondCall().resolves({ optionGroups: optionGroups2 });
    mainThread.$registerChatSessionContentProvider(handle, sessionScheme);
    await new Promise((resolve) => setTimeout(resolve, 0));
    let storedGroups = chatSessionsService.getOptionGroupsForSessionType(sessionScheme);
    assert.ok(storedGroups);
    assert.strictEqual(storedGroups[0].items[0].id, "modelA");
    mainThread.$onDidChangeChatSessionProviderOptions(handle);
    await new Promise((resolve) => setTimeout(resolve, 0));
    storedGroups = chatSessionsService.getOptionGroupsForSessionType(sessionScheme);
    assert.ok(storedGroups);
    assert.strictEqual(storedGroups[0].items[0].id, "modelB");
    mainThread.$unregisterChatSessionContentProvider(handle);
  });
  test("provider option refresh only logs unexpected errors", async function() {
    const provideOptionsStub = asSinonMethodStub(proxy.$provideChatSessionProviderOptions);
    const errorSpy = sinon.spy(logService, "error");
    const unexpectedError = new Error("Unexpected");
    provideOptionsStub.onFirstCall().rejects(new CancellationError());
    provideOptionsStub.onSecondCall().rejects(unexpectedError);
    mainThread.$registerChatSessionContentProvider(1, "test-session-type");
    await new Promise((resolve) => setTimeout(resolve, 0));
    mainThread.$onDidChangeChatSessionProviderOptions(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(errorSpy.args, [["Error fetching chat session options", unexpectedError]]);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("getSessionOption returns undefined for unset options", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "models"), void 0);
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "anyOption"), void 0);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("getSessionOption returns value for explicitly set options", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false,
      options: {
        "models": "gpt-4",
        "region": { id: "us-east", name: "US East" }
      }
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "models"), "gpt-4");
    assert.deepStrictEqual(chatSessionsService.getSessionOption(resource, "region"), { id: "us-east", name: "US East" });
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "notConfigured"), void 0);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("option change notifications are sent to the extension", async function() {
    const sessionScheme = "test-session-type";
    const handle = 1;
    mainThread.$registerChatSessionContentProvider(handle, sessionScheme);
    const sessionContent = {
      resource: URI.parse(`${sessionScheme}:/test-session`),
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false,
      options: {
        "models": "gpt-4"
      }
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    asSinonMethodStub(proxy.$provideHandleOptionsChange).resetHistory();
    chatSessionsService.setSessionOption(resource, "models", "gpt-4-turbo");
    assert.ok(asSinonMethodStub(proxy.$provideHandleOptionsChange).calledOnce);
    const call = asSinonMethodStub(proxy.$provideHandleOptionsChange).firstCall;
    assert.strictEqual(call.args[0], handle);
    assert.deepStrictEqual(call.args[1], resource);
    assert.deepStrictEqual(call.args[2], { models: "gpt-4-turbo" });
    mainThread.$unregisterChatSessionContentProvider(handle);
  });
  test("option change notifications fail silently when provider not registered", async function() {
    const sessionScheme = "unregistered-session-type";
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    asSinonMethodStub(proxy.$provideHandleOptionsChange).resetHistory();
    chatSessionsService.updateSessionOptions(resource, /* @__PURE__ */ new Map([
      ["models", "gpt-4-turbo"]
    ]));
    assert.strictEqual(asSinonMethodStub(proxy.$provideHandleOptionsChange).callCount, 0);
  });
  test("setSessionOption updates option and getSessionOption reflects change", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "models"), void 0);
    chatSessionsService.setSessionOption(resource, "models", "gpt-4");
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "models"), "gpt-4");
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("$updateChatSessionInputState applies selected options only to the targeted session", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, false);
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resourceA = URI.parse(`${sessionScheme}:/session-a`);
    const resourceB = URI.parse(`${sessionScheme}:/session-b`);
    asSinonMethodStub(proxy.$provideChatSessionContent).withArgs(sinon.match.any, sinon.match((r) => r.toString() === resourceA.toString()), sinon.match.any, sinon.match.any).resolves({ resource: resourceA, history: [], hasActiveResponseCallback: false, hasRequestHandler: false, hasForkHandler: false, supportsInterruption: false });
    asSinonMethodStub(proxy.$provideChatSessionContent).withArgs(sinon.match.any, sinon.match((r) => r.toString() === resourceB.toString()), sinon.match.any, sinon.match.any).resolves({ resource: resourceB, history: [], hasActiveResponseCallback: false, hasRequestHandler: false, hasForkHandler: false, supportsInterruption: false });
    await chatSessionsService.getOrCreateChatSession(resourceA, CancellationToken.None);
    await chatSessionsService.getOrCreateChatSession(resourceB, CancellationToken.None);
    mainThread.$updateChatSessionInputState(controllerHandle, resourceA, [{
      id: "models",
      name: "Models",
      items: [{ id: "modelA", name: "Model A" }, { id: "modelB", name: "Model B" }],
      selected: { id: "modelB", name: "Model B" }
    }]);
    assert.deepStrictEqual(chatSessionsService.getSessionOption(resourceA, "models"), { id: "modelB", name: "Model B" });
    assert.strictEqual(chatSessionsService.getSessionOption(resourceB, "models"), void 0);
    mainThread.$unregisterChatSessionContentProvider(1);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("$updateChatSessionInputState updates different sessions independently", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, false);
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resourceA = URI.parse(`${sessionScheme}:/session-a`);
    const resourceB = URI.parse(`${sessionScheme}:/session-b`);
    asSinonMethodStub(proxy.$provideChatSessionContent).withArgs(sinon.match.any, sinon.match((r) => r.toString() === resourceA.toString()), sinon.match.any, sinon.match.any).resolves({ resource: resourceA, history: [], hasActiveResponseCallback: false, hasRequestHandler: false, hasForkHandler: false, supportsInterruption: false });
    asSinonMethodStub(proxy.$provideChatSessionContent).withArgs(sinon.match.any, sinon.match((r) => r.toString() === resourceB.toString()), sinon.match.any, sinon.match.any).resolves({ resource: resourceB, history: [], hasActiveResponseCallback: false, hasRequestHandler: false, hasForkHandler: false, supportsInterruption: false });
    await chatSessionsService.getOrCreateChatSession(resourceA, CancellationToken.None);
    await chatSessionsService.getOrCreateChatSession(resourceB, CancellationToken.None);
    mainThread.$updateChatSessionInputState(controllerHandle, resourceA, [{
      id: "models",
      name: "Models",
      items: [{ id: "modelX", name: "Model X" }, { id: "modelY", name: "Model Y" }],
      selected: { id: "modelX", name: "Model X" }
    }]);
    mainThread.$updateChatSessionInputState(controllerHandle, resourceB, [{
      id: "models",
      name: "Models",
      items: [{ id: "modelX", name: "Model X" }, { id: "modelY", name: "Model Y" }],
      selected: { id: "modelY", name: "Model Y" }
    }]);
    assert.deepStrictEqual(chatSessionsService.getSessionOption(resourceA, "models"), { id: "modelX", name: "Model X" });
    assert.deepStrictEqual(chatSessionsService.getSessionOption(resourceB, "models"), { id: "modelY", name: "Model Y" });
    mainThread.$unregisterChatSessionContentProvider(1);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem invokes proxy and updates item", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, true);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const initialItem = {
      resource,
      label: "Session A",
      timing: { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 }
    };
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, initialItem);
    const resolvedItem = {
      resource,
      label: "Session A",
      timing: { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 },
      badge: "resolved"
    };
    asSinonMethodStub(proxy.$resolveChatSessionItem).resolves(resolvedItem);
    const result = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.ok(asSinonMethodStub(proxy.$resolveChatSessionItem).calledOnce);
    assert.deepStrictEqual(result?.badge, "resolved");
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem returns undefined when supportsResolve is false", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, false);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const result = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.strictEqual(result, void 0);
    assert.ok(asSinonMethodStub(proxy.$resolveChatSessionItem).notCalled);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem cache is invalidated on item update", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, true);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const timing = { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 };
    const initialItem = {
      resource,
      label: "Session A",
      timing
    };
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, initialItem);
    const resolvedItem1 = { resource, label: "Session A", timing, badge: "first" };
    const resolvedItem2 = { resource, label: "Session A", timing, badge: "second" };
    const resolveStub = asSinonMethodStub(proxy.$resolveChatSessionItem);
    resolveStub.onFirstCall().resolves(resolvedItem1);
    resolveStub.onSecondCall().resolves(resolvedItem2);
    const result1 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.deepStrictEqual(result1?.badge, "first");
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, { ...initialItem, label: "Session A Updated" });
    const result2 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.deepStrictEqual(result2?.badge, "second");
    assert.strictEqual(resolveStub.callCount, 2);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem caches undefined result until item update invalidates it", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, true);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const timing = { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 };
    const initialItem = {
      resource,
      label: "Session A",
      timing
    };
    const resolveStub = asSinonMethodStub(proxy.$resolveChatSessionItem);
    resolveStub.onFirstCall().resolves(void 0);
    resolveStub.onSecondCall().resolves({ resource, label: "Session A", timing, badge: "resolved" });
    const result1 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.strictEqual(result1, void 0);
    const result2 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.strictEqual(result2, void 0);
    assert.strictEqual(resolveStub.callCount, 1);
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, initialItem);
    const result3 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.deepStrictEqual(result3?.badge, "resolved");
    assert.strictEqual(resolveStub.callCount, 2);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem ignores stale in-flight resolve result after item update", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, true);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const timing = { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 };
    const initialItem = {
      resource,
      label: "Session A",
      timing
    };
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, initialItem);
    let resolvePending;
    asSinonMethodStub(proxy.$resolveChatSessionItem).returns(new Promise((resolve) => {
      resolvePending = resolve;
    }));
    const pendingResolve = chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, {
      ...initialItem,
      label: "Session A Updated"
    });
    resolvePending?.({
      resource,
      label: "Session A",
      timing,
      badge: "stale"
    });
    const result = await pendingResolve;
    assert.strictEqual(result?.label, "Session A Updated");
    assert.strictEqual(result?.badge, void 0);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
});
suite("ExtHostChatSessions", function() {
  let disposables;
  let extHostChatSessions;
  let mainThreadChatSessionsProxy;
  setup(function() {
    disposables = new DisposableStore();
    mainThreadChatSessionsProxy = {
      $registerChatSessionItemController: sinon.stub(),
      $updateChatSessionItemControllerCapabilities: sinon.stub(),
      $unregisterChatSessionItemController: sinon.stub(),
      $updateChatSessionItems: sinon.stub().resolves(),
      $addOrUpdateChatSessionItem: sinon.stub().resolves(),
      $onDidCommitChatSessionItem: sinon.stub(),
      $registerChatSessionContentProvider: sinon.stub(),
      $unregisterChatSessionContentProvider: sinon.stub(),
      $onDidChangeChatSessionOptions: sinon.stub(),
      $onDidChangeChatSessionProviderOptions: sinon.stub(),
      $updateChatSessionInputState: sinon.stub()
    };
    const rpcProtocol = AnyCallRPCProtocol(mainThreadChatSessionsProxy);
    const commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
    }());
    const languageModels = new ExtHostLanguageModels(rpcProtocol, new NullLogService(), new class extends mock() {
    }());
    extHostChatSessions = disposables.add(new ExtHostChatSessions(commands, languageModels, rpcProtocol, new NullLogService()));
  });
  teardown(function() {
    disposables.dispose();
    sinon.restore();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createContentProvider(session) {
    return {
      provideChatSessionContent: async () => session
    };
  }
  test("controller only advertises resolve support after resolve handler is assigned", function() {
    const sessionScheme = "test-session-type";
    const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => {
    }));
    assert.ok(mainThreadChatSessionsProxy.$registerChatSessionItemController.calledOnceWithExactly(0, sessionScheme, false));
    assert.ok(mainThreadChatSessionsProxy.$updateChatSessionItemControllerCapabilities.notCalled);
    controller.resolveChatSessionItem = async () => {
    };
    assert.ok(mainThreadChatSessionsProxy.$updateChatSessionItemControllerCapabilities.calledOnceWithExactly(0, true));
    controller.resolveChatSessionItem = void 0;
    assert.ok(mainThreadChatSessionsProxy.$updateChatSessionItemControllerCapabilities.calledTwice);
    assert.ok(mainThreadChatSessionsProxy.$updateChatSessionItemControllerCapabilities.secondCall.calledWithExactly(0, false));
  });
  test("advertises controller fork support when only the controller registers a fork handler", async function() {
    const sessionScheme = "test-session-type";
    const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
    const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => {
    }));
    controller.forkHandler = async (resource) => controller.createChatSessionItem(resource.with({ path: "/forked-session" }), "Forked Session");
    disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, void 0, createContentProvider({
      history: [],
      requestHandler: void 0
    })));
    const session = await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
    assert.strictEqual(session.hasForkHandler, true);
    await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
  });
  test("prefers controller fork handler over deprecated session fork handler", async function() {
    const sessionScheme = "test-session-type";
    const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
    const requestTurn = new extHostTypes.ChatRequestTurn("prompt", void 0, [], "participant", [], void 0, "request-1");
    const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => {
    }));
    const controllerItem = controller.createChatSessionItem(URI.parse(`${sessionScheme}:/forked-by-controller`), "Forked by Controller");
    const sessionItem = {
      resource: URI.parse(`${sessionScheme}:/forked-by-session`),
      label: "Forked by Session"
    };
    const controllerForkHandler = sinon.stub().resolves(controllerItem);
    const deprecatedSessionForkHandler = sinon.stub().resolves(sessionItem);
    controller.forkHandler = controllerForkHandler;
    disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, void 0, createContentProvider({
      history: [requestTurn],
      requestHandler: void 0,
      forkHandler: deprecatedSessionForkHandler
    })));
    await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
    const result = await extHostChatSessions.$forkChatSession(0, sessionResource, {
      type: "request",
      id: "request-1",
      prompt: "prompt",
      participant: "participant"
    }, CancellationToken.None);
    assert.ok(controllerForkHandler.calledOnceWithExactly(sessionResource, requestTurn, CancellationToken.None));
    assert.strictEqual(deprecatedSessionForkHandler.callCount, 0);
    assert.strictEqual(result.resource.toString(), controllerItem.resource.toString());
    assert.strictEqual(result.label, controllerItem.label);
    await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
  });
  test("falls back to deprecated session fork handler when no controller fork handler exists", async function() {
    const sessionScheme = "test-session-type";
    const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
    const requestTurn = new extHostTypes.ChatRequestTurn("prompt", void 0, [], "participant", [], void 0, "request-1");
    const deprecatedSessionForkHandler = sinon.stub().resolves({
      resource: URI.parse(`${sessionScheme}:/forked-by-session`),
      label: "Forked by Session"
    });
    disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, void 0, createContentProvider({
      history: [requestTurn],
      requestHandler: void 0,
      forkHandler: deprecatedSessionForkHandler
    })));
    await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
    const result = await extHostChatSessions.$forkChatSession(0, sessionResource, {
      type: "request",
      id: "request-1",
      prompt: "prompt",
      participant: "participant"
    }, CancellationToken.None);
    assert.ok(deprecatedSessionForkHandler.calledOnceWithExactly(sessionResource, requestTurn, CancellationToken.None));
    assert.strictEqual(result.resource.toString(), `${sessionScheme}:/forked-by-session`);
    assert.strictEqual(result.label, "Forked by Session");
    await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcbWFpblRocmVhZENoYXRTZXNzaW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhc1Npbm9uTWV0aG9kU3R1YiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc2lub25VdGlscy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFNlc3Npb25zL2NoYXRTZXNzaW9ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRQcm9ncmVzcywgSUNoYXRQcm9ncmVzc01lc3NhZ2UsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCwgSUNoYXRTZXNzaW9uSXRlbSwgSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtLCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFJlcXVlc3QsIElDaGF0QWdlbnRSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0S2luZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RLaW5kLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IER0byB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBtb2NrLCBUZXN0RXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkQ2hhdFNlc3Npb25zLCBPYnNlcnZhYmxlQ2hhdFNlc3Npb24gfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRDaGF0U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRTZXNzaW9uc1NoYXBlLCBJQ2hhdFByb2dyZXNzRHRvLCBJQ2hhdFNlc3Npb25EdG8sIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucywgSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtRHRvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RBdXRoZW50aWNhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0QXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRTZXNzaW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0Q2hhdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdExhbmd1YWdlTW9kZWxzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RMYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFRlbGVtZXRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlcyBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IEFueUNhbGxSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuXG5zdWl0ZSgnT2JzZXJ2YWJsZUNoYXRTZXNzaW9uJywgZnVuY3Rpb24gKCkge1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRsZXQgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2U7XG5cdGxldCBwcm94eTogRXh0SG9zdENoYXRTZXNzaW9uc1NoYXBlO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cblx0XHRkaWFsb2dTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGlhbG9nU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjb25maXJtKCkge1xuXHRcdFx0XHRyZXR1cm4geyBjb25maXJtZWQ6IHRydWUgfTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cHJveHkgPSB7XG5cdFx0XHQkcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudDogc2lub24uc3R1YigpLFxuXHRcdFx0JHByb3ZpZGVDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uczogc2lub24uc3R1YjxbcHJvdmlkZXJIYW5kbGU6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuXSwgUHJvbWlzZTxJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMgfCB1bmRlZmluZWQ+PigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0XHQkcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2U6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRpbnRlcnJ1cHRDaGF0U2Vzc2lvbkFjdGl2ZVJlc3BvbnNlOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkaW52b2tlQ2hhdFNlc3Npb25SZXF1ZXN0SGFuZGxlcjogc2lub24uc3R1YigpLFxuXHRcdFx0JGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQ6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRyZWZyZXNoQ2hhdFNlc3Npb25JdGVtczogc2lub24uc3R1YigpLFxuXHRcdFx0JG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGU6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRuZXdDaGF0U2Vzc2lvbkl0ZW06IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyh1bmRlZmluZWQpLFxuXHRcdFx0JGZvcmtDaGF0U2Vzc2lvbjogc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0XHQkcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbTogc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0XHQkcHJvdmlkZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZTogc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0fTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25Db250ZW50KG9wdGlvbnM6IHtcblx0XHRpZD86IHN0cmluZztcblx0XHR0aXRsZT86IHN0cmluZztcblx0XHRoaXN0b3J5PzogYW55W107XG5cdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjaz86IGJvb2xlYW47XG5cdFx0aGFzUmVxdWVzdEhhbmRsZXI/OiBib29sZWFuO1xuXHRcdGhhc0ZvcmtIYW5kbGVyPzogYm9vbGVhbjtcblx0fSA9IHt9KTogSUNoYXRTZXNzaW9uRHRvIHtcblx0XHRjb25zdCBpZCA9IG9wdGlvbnMuaWQgfHwgJ3Rlc3QtaWQnO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKGlkKSxcblx0XHRcdHRpdGxlOiBvcHRpb25zLnRpdGxlLFxuXHRcdFx0aGlzdG9yeTogb3B0aW9ucy5oaXN0b3J5IHx8IFtdLFxuXHRcdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogb3B0aW9ucy5oYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrID8/IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IG9wdGlvbnMuaGFzUmVxdWVzdEhhbmRsZXIgPz8gZmFsc2UsXG5cdFx0XHRoYXNGb3JrSGFuZGxlcjogb3B0aW9ucy5oYXNGb3JrSGFuZGxlciA/PyBmYWxzZSxcblx0XHRcdHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25Db250ZW50OiBhbnksIHNlc3Npb25JZCA9ICd0ZXN0LWlkJyk6IFByb21pc2U8T2JzZXJ2YWJsZUNoYXRTZXNzaW9uPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE9ic2VydmFibGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgMSwgcHJveHksIGxvZ1NlcnZpY2UsIGRpYWxvZ1NlcnZpY2UpO1xuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5yZXNvbHZlcyhzZXNzaW9uQ29udGVudCk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5pbml0aWFsaXplKENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHsgaW5pdGlhbFNlc3Npb25PcHRpb25zOiBbXSB9KTtcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdHRlc3QoJ2NvbnN0cnVjdG9yIGNyZWF0ZXMgc2Vzc2lvbiB3aXRoIHByb3BlciBpbml0aWFsIHN0YXRlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LWlkJztcblx0XHRjb25zdCByZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE9ic2VydmFibGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgMSwgcHJveHksIGxvZ1NlcnZpY2UsIGRpYWxvZ1NlcnZpY2UpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnByb3ZpZGVySGFuZGxlLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeSwgW10pO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uLnByb2dyZXNzT2JzKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbi5pc0NvbXBsZXRlT2JzKTtcblxuXHRcdC8vIEluaXRpYWwgc3RhdGUgc2hvdWxkIGJlIGluYWN0aXZlIGFuZCBpbmNvbXBsZXRlXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uLnByb2dyZXNzT2JzLmdldCgpLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNDb21wbGV0ZU9icy5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIHF1ZXVlcyBwcm9ncmVzcyBiZWZvcmUgaW5pdGlhbGl6YXRpb24gYW5kIHByb2Nlc3NlcyBpdCBhZnRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1pZCc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPYnNlcnZhYmxlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIDEsIHByb3h5LCBsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBwcm9ncmVzczE6IElDaGF0UHJvZ3Jlc3MgPSB7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiB7IHZhbHVlOiAnSGVsbG8nLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblx0XHRjb25zdCBwcm9ncmVzczI6IElDaGF0UHJvZ3Jlc3MgPSB7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiB7IHZhbHVlOiAnV29ybGQnLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblxuXHRcdC8vIEFkZCBwcm9ncmVzcyBiZWZvcmUgaW5pdGlhbGl6YXRpb24gLSBzaG91bGQgYmUgcXVldWVkXG5cdFx0c2Vzc2lvbi5oYW5kbGVQcm9ncmVzc0NodW5rKCdyZXExJywgW3Byb2dyZXNzMV0pO1xuXHRcdHNlc3Npb24uaGFuZGxlUHJvZ3Jlc3NDaHVuaygncmVxMScsIFtwcm9ncmVzczJdKTtcblxuXHRcdC8vIFByb2dyZXNzIHNob3VsZCBiZSBxdWV1ZWQsIG5vdCB2aXNpYmxlIHlldFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm9ncmVzc09icy5nZXQoKSwgW10pO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgc2Vzc2lvblxuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoKTtcblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXHRcdGF3YWl0IHNlc3Npb24uaW5pdGlhbGl6ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB7IGluaXRpYWxTZXNzaW9uT3B0aW9uczogW10gfSk7XG5cblx0XHQvLyBOb3cgcHJvZ3Jlc3Mgc2hvdWxkIGJlIHZpc2libGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm9ncmVzc09icy5nZXQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm9ncmVzc09icy5nZXQoKSwgW3Byb2dyZXNzMSwgcHJvZ3Jlc3MyXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNDb21wbGV0ZU9icy5nZXQoKSwgdHJ1ZSk7IC8vIFNob3VsZCBiZSBjb21wbGV0ZSBmb3Igc2Vzc2lvbnMgd2l0aG91dCBhY3RpdmUgcmVzcG9uc2UgY2FsbGJhY2sgb3IgcmVxdWVzdCBoYW5kbGVyXG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemF0aW9uIGxvYWRzIHNlc3Npb24gaGlzdG9yeSBhbmQgc2V0cyB1cCBjYXBhYmlsaXRpZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkhpc3RvcnkgPSBbXG5cdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnUHJldmlvdXMgcXVlc3Rpb24nIH0sXG5cdFx0XHR7IHR5cGU6ICdyZXNwb25zZScsIHBhcnRzOiBbeyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ1ByZXZpb3VzIGFuc3dlcicsIGlzVHJ1c3RlZDogZmFsc2UgfSB9XSB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoe1xuXHRcdFx0aGlzdG9yeTogc2Vzc2lvbkhpc3RvcnksXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiB0cnVlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25Db250ZW50KSk7XG5cblx0XHQvLyBWZXJpZnkgaGlzdG9yeSB3YXMgbG9hZGVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMF0udHlwZSwgJ3JlcXVlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzBdLnByb21wdCwgJ1ByZXZpb3VzIHF1ZXN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVsxXS50eXBlLCAncmVzcG9uc2UnKTtcblxuXHRcdC8vIFZlcmlmeSBjYXBhYmlsaXRpZXMgd2VyZSBzZXQgdXBcblx0XHRhc3NlcnQub2soc2Vzc2lvbi5pbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbi5yZXF1ZXN0SGFuZGxlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemF0aW9uIHJldml2ZXMgbW9kZUluc3RydWN0aW9ucyBpbiBoaXN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoe1xuXHRcdFx0aGlzdG9yeTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3JlcXVlc3QnLFxuXHRcdFx0XHRcdHByb21wdDogJ0hlbGxvJyxcblx0XHRcdFx0XHRwYXJ0aWNpcGFudDogJ3Rlc3QnLFxuXHRcdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHVyaTogeyAkbWlkOiBNYXJzaGFsbGVkSWQuVXJpLCBzY2hlbWU6ICdmaWxlJywgcGF0aDogJy9jdXN0b20tYWdlbnQnIH0sXG5cdFx0XHRcdFx0XHRuYW1lOiAnbXktYWdlbnQnLFxuXHRcdFx0XHRcdFx0Y29udGVudDogJ2luc3RydWN0aW9ucycsXG5cdFx0XHRcdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRcdFx0XHRpc0J1aWx0aW46IGZhbHNlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBjcmVhdGVJbml0aWFsaXplZFNlc3Npb24oc2Vzc2lvbkNvbnRlbnQpKTtcblx0XHRjb25zdCByZXF1ZXN0SXRlbSA9IHNlc3Npb24uaGlzdG9yeVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdEl0ZW0udHlwZSwgJ3JlcXVlc3QnKTtcblx0XHRpZiAocmVxdWVzdEl0ZW0udHlwZSA9PT0gJ3JlcXVlc3QnKSB7XG5cdFx0XHRhc3NlcnQub2socmVxdWVzdEl0ZW0ubW9kZUluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKHJlcXVlc3RJdGVtLm1vZGVJbnN0cnVjdGlvbnMudXJpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdEl0ZW0ubW9kZUluc3RydWN0aW9ucy5uYW1lLCAnbXktYWdlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0SXRlbS5tb2RlSW5zdHJ1Y3Rpb25zLmlzQnVpbHRpbiwgZmFsc2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndG9SZXF1ZXN0RHRvIHBhc3NlcyBtb2RlSW5zdHJ1Y3Rpb25zIHRocm91Z2gnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBjcmVhdGVJbml0aWFsaXplZFNlc3Npb24oY3JlYXRlU2Vzc2lvbkNvbnRlbnQoeyBoYXNGb3JrSGFuZGxlcjogdHJ1ZSB9KSkpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uLmZvcmtTZXNzaW9uKTtcblxuXHRcdGNvbnN0IG1vZGVJbnN0cnVjdGlvbnMgPSB7XG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9jdXN0b20tYWdlbnQnKSxcblx0XHRcdG5hbWU6ICdteS1hZ2VudCcsXG5cdFx0XHRjb250ZW50OiAnYWdlbnQgaW5zdHJ1Y3Rpb25zJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0fTtcblx0XHRjb25zdCByZXF1ZXN0OiBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW0gPSB7XG5cdFx0XHR0eXBlOiAncmVxdWVzdCcsXG5cdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdHByb21wdDogJ0hlbGxvIHdpdGggbW9kZScsXG5cdFx0XHRwYXJ0aWNpcGFudDogJ3BhcnRpY2lwYW50Jyxcblx0XHRcdG1vZGVJbnN0cnVjdGlvbnMsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGZvcmtlZEl0ZW0gPSB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLmZpbGUoJy90bXAvZm9ya2VkLm1kJyksXG5cdFx0XHRsYWJlbDogJ0ZvcmtlZCcsXG5cdFx0XHRjaGFuZ2VzOiBbXSxcblx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRjcmVhdGVkOiAxMjMsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogMjM0LFxuXHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiAzNDUsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJGZvcmtDaGF0U2Vzc2lvbikucmVzb2x2ZXMoZm9ya2VkSXRlbSk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5mb3JrU2Vzc2lvbj8uKHJlcXVlc3QsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgY2FsbCA9IGFzU2lub25NZXRob2RTdHViKHByb3h5LiRmb3JrQ2hhdFNlc3Npb24pLmZpcnN0Q2FsbDtcblx0XHRjb25zdCBzZW50RHRvID0gY2FsbC5hcmdzWzJdIGFzIElDaGF0U2Vzc2lvblJlcXVlc3RIaXN0b3J5SXRlbUR0bztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnREdG8ubW9kZUluc3RydWN0aW9ucywgbW9kZUluc3RydWN0aW9ucyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemF0aW9uIHNldHMgZm9ya1Nlc3Npb24gYW5kIHJldml2ZXMgZm9ya2VkIGl0ZW1zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKGNyZWF0ZVNlc3Npb25Db250ZW50KHsgaGFzRm9ya0hhbmRsZXI6IHRydWUgfSkpKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbi5mb3JrU2Vzc2lvbik7XG5cblx0XHRjb25zdCBmb3JrZWRSZXNvdXJjZSA9IFVSSS5maWxlKCcvdG1wL2ZvcmtlZC1jaGF0Lm1kJyk7XG5cdFx0Y29uc3QgZm9ya2VkSXRlbSA9IHtcblx0XHRcdHJlc291cmNlOiBmb3JrZWRSZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAnRm9ya2VkIFNlc3Npb24nLFxuXHRcdFx0dGltaW5nOiB7XG5cdFx0XHRcdGNyZWF0ZWQ6IDEyMyxcblx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiAyMzQsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IDM0NSxcblx0XHRcdH0sXG5cdFx0XHRjaGFuZ2VzOiBbe1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvdG1wL2NoYW5nZWQudHMnKSxcblx0XHRcdFx0b3JpZ2luYWxVcmk6IFVSSS5maWxlKCcvdG1wL29yaWdpbmFsLnRzJyksXG5cdFx0XHRcdGluc2VydGlvbnM6IDQsXG5cdFx0XHRcdGRlbGV0aW9uczogMixcblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJGZvcmtDaGF0U2Vzc2lvbikucmVzb2x2ZXMoZm9ya2VkSXRlbSk7XG5cblx0XHRjb25zdCByZXF1ZXN0OiBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW0gPSB7IHR5cGU6ICdyZXF1ZXN0JywgaWQ6ICdyZXF1ZXN0LTEnLCBwcm9tcHQ6ICdQcmV2aW91cyBxdWVzdGlvbicsIHBhcnRpY2lwYW50OiAncGFydGljaXBhbnQnIH07XG5cdFx0Y29uc3QgZXhwZWN0ZWRSZXF1ZXN0RHRvOiBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW1EdG8gPSB7XG5cdFx0XHR0eXBlOiAncmVxdWVzdCcsXG5cdFx0XHRpZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRwcm9tcHQ6ICdQcmV2aW91cyBxdWVzdGlvbicsXG5cdFx0XHRwYXJ0aWNpcGFudDogJ3BhcnRpY2lwYW50Jyxcblx0XHRcdGNvbW1hbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHZhcmlhYmxlRGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZUluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2Vzc2lvbi5mb3JrU2Vzc2lvbj8uKHJlcXVlc3QsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGFzU2lub25NZXRob2RTdHViKHByb3h5LiRmb3JrQ2hhdFNlc3Npb24pLmNhbGxlZE9uY2VXaXRoRXhhY3RseSgxLCBzZXNzaW9uLnNlc3Npb25SZXNvdXJjZSwgZXhwZWN0ZWRSZXF1ZXN0RHRvLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXNvdXJjZSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocmVzdWx0LmNoYW5nZXMpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoYW5nZXNbMF0udXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoYW5nZXNbMF0ub3JpZ2luYWxVcmkgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBmb3JrZWRJdGVtKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6YXRpb24gc2V0cyB0aXRsZSBmcm9tIHNlc3Npb24gY29udGVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KHtcblx0XHRcdHRpdGxlOiAnTXkgQ3VzdG9tIFRpdGxlJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25Db250ZW50KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24udGl0bGUsICdNeSBDdXN0b20gVGl0bGUnKTtcblx0fSk7XG5cblx0dGVzdCgndGl0bGUgaXMgdW5kZWZpbmVkIHdoZW4gbm90IHByb3ZpZGVkIGluIHNlc3Npb24gY29udGVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnRpdGxlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXphdGlvbiBpcyBpZGVtcG90ZW50IGFuZCByZXR1cm5zIHNhbWUgcHJvbWlzZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1pZCc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPYnNlcnZhYmxlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIDEsIHByb3h5LCBsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KCk7XG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblxuXHRcdGNvbnN0IHByb21pc2UxID0gc2Vzc2lvbi5pbml0aWFsaXplKENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHsgaW5pdGlhbFNlc3Npb25PcHRpb25zOiBbXSB9KTtcblx0XHRjb25zdCBwcm9taXNlMiA9IHNlc3Npb24uaW5pdGlhbGl6ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB7IGluaXRpYWxTZXNzaW9uT3B0aW9uczogW10gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvbWlzZTEsIHByb21pc2UyKTtcblx0XHRhd2FpdCBwcm9taXNlMTtcblxuXHRcdC8vIFNob3VsZCBvbmx5IGNhbGwgcHJveHkgb25jZSBldmVuIHRob3VnaCBpbml0aWFsaXplIHdhcyBjYWxsZWQgdHdpY2Vcblx0XHRhc3NlcnQub2soYXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLmNhbGxlZE9uY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXphdGlvbiBmb3J3YXJkcyBpbml0aWFsIHNlc3Npb24gb3B0aW9ucyBjb250ZXh0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LWlkJztcblx0XHRjb25zdCByZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IE9ic2VydmFibGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgMSwgcHJveHksIGxvZ1NlcnZpY2UsIGRpYWxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBpbml0aWFsU2Vzc2lvbk9wdGlvbnMgPSBbeyBvcHRpb25JZDogJ21vZGVsJywgdmFsdWU6ICdncHQtNC4xJyB9XTtcblxuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoKTtcblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXG5cdFx0YXdhaXQgc2Vzc2lvbi5pbml0aWFsaXplKENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHsgaW5pdGlhbFNlc3Npb25PcHRpb25zIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5jYWxsZWRPbmNlV2l0aChcblx0XHRcdDEsXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHsgaW5pdGlhbFNlc3Npb25PcHRpb25zIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb2dyZXNzIGhhbmRsaW5nIHdvcmtzIGNvcnJlY3RseSBhZnRlciBpbml0aWFsaXphdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBjcmVhdGVJbml0aWFsaXplZFNlc3Npb24oc2Vzc2lvbkNvbnRlbnQpKTtcblxuXHRcdGNvbnN0IHByb2dyZXNzOiBJQ2hhdFByb2dyZXNzID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ05ldyBwcm9ncmVzcycsIGlzVHJ1c3RlZDogZmFsc2UgfSB9O1xuXG5cdFx0Ly8gQWRkIHByb2dyZXNzIGFmdGVyIGluaXRpYWxpemF0aW9uXG5cdFx0c2Vzc2lvbi5oYW5kbGVQcm9ncmVzc0NodW5rKCdyZXExJywgW3Byb2dyZXNzXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24ucHJvZ3Jlc3NPYnMuZ2V0KCksIFtwcm9ncmVzc10pO1xuXHRcdC8vIFNlc3Npb24gd2l0aCBubyBjYXBhYmlsaXRpZXMgc2hvdWxkIHJlbWFpbiBjb21wbGV0ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9ncmVzcyBjb21wbGV0aW9uIHVwZGF0ZXMgc2Vzc2lvbiBzdGF0ZSBjb3JyZWN0bHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQgPSBjcmVhdGVTZXNzaW9uQ29udGVudCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25Db250ZW50KSk7XG5cblx0XHQvLyBBZGQgc29tZSBwcm9ncmVzcyBmaXJzdFxuXHRcdGNvbnN0IHByb2dyZXNzOiBJQ2hhdFByb2dyZXNzID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ1Byb2Nlc3NpbmcuLi4nLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblx0XHRzZXNzaW9uLmhhbmRsZVByb2dyZXNzQ2h1bmsoJ3JlcTEnLCBbcHJvZ3Jlc3NdKTtcblxuXHRcdC8vIFNlc3Npb24gd2l0aCBubyBjYXBhYmlsaXRpZXMgc2hvdWxkIGFscmVhZHkgYmUgY29tcGxldGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0NvbXBsZXRlT2JzLmdldCgpLCB0cnVlKTtcblx0XHRzZXNzaW9uLmhhbmRsZVByb2dyZXNzQ29tcGxldGUoJ3JlcTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0NvbXBsZXRlT2JzLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiB3aXRoIGFjdGl2ZSByZXNwb25zZSBjYWxsYmFjayBiZWNvbWVzIGFjdGl2ZSB3aGVuIHByb2dyZXNzIGlzIGFkZGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoeyBoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25Db250ZW50KSk7XG5cblx0XHQvLyBTZXNzaW9uIHNob3VsZCBzdGFydCBpbmFjdGl2ZSBhbmQgaW5jb21wbGV0ZSAoaGFzIGNhcGFiaWxpdGllcyBidXQgbm8gYWN0aXZlIHByb2dyZXNzKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHByb2dyZXNzOiBJQ2hhdFByb2dyZXNzID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ1Byb2Nlc3NpbmcuLi4nLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblx0XHRzZXNzaW9uLmhhbmRsZVByb2dyZXNzQ2h1bmsoJ3JlcTEnLCBbcHJvZ3Jlc3NdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIGZhbHNlKTtcblx0XHRzZXNzaW9uLmhhbmRsZVByb2dyZXNzQ29tcGxldGUoJ3JlcTEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0IGhhbmRsZXIgZm9yd2FyZHMgcmVxdWVzdHMgdG8gcHJveHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQgPSBjcmVhdGVTZXNzaW9uQ29udGVudCh7IGhhc1JlcXVlc3RIYW5kbGVyOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25Db250ZW50KSk7XG5cblx0XHRhc3NlcnQub2soc2Vzc2lvbi5yZXF1ZXN0SGFuZGxlcik7XG5cblx0XHRjb25zdCByZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCA9IHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Rlc3Qtc2Vzc2lvbicpLFxuXHRcdFx0YWdlbnRJZDogJ3Rlc3QtYWdlbnQnLFxuXHRcdFx0bWVzc2FnZTogJ1Rlc3QgcHJvbXB0Jyxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0dmFyaWFibGVzOiB7IHZhcmlhYmxlczogW10gfVxuXHRcdH07XG5cdFx0Y29uc3QgcHJvZ3Jlc3NDYWxsYmFjayA9IHNpbm9uLnN0dWIoKTtcblxuXHRcdGF3YWl0IHNlc3Npb24ucmVxdWVzdEhhbmRsZXIhKHJlcXVlc3QsIHByb2dyZXNzQ2FsbGJhY2ssIFtdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5vayhhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kaW52b2tlQ2hhdFNlc3Npb25SZXF1ZXN0SGFuZGxlcikuY2FsbGVkT25jZVdpdGgoMSwgc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QsIFtdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3QgaGFuZGxlciBmb3J3YXJkcyBwcm9ncmVzcyB1cGRhdGVzIHRvIGV4dGVybmFsIGNhbGxiYWNrJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoeyBoYXNSZXF1ZXN0SGFuZGxlcjogdHJ1ZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24ucmVxdWVzdEhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QgPSB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0ZXN0LXNlc3Npb24nKSxcblx0XHRcdGFnZW50SWQ6ICd0ZXN0LWFnZW50Jyxcblx0XHRcdG1lc3NhZ2U6ICdUZXN0IHByb21wdCcsXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHZhcmlhYmxlczogeyB2YXJpYWJsZXM6IFtdIH1cblx0XHR9O1xuXHRcdGNvbnN0IHByb2dyZXNzQ2FsbGJhY2sgPSBzaW5vbi5zdHViKCk7XG5cblx0XHRsZXQgcmVzb2x2ZVJlcXVlc3Q6ICh2YWx1ZTogSUNoYXRBZ2VudFJlc3VsdCkgPT4gdm9pZDtcblx0XHRjb25zdCByZXF1ZXN0UHJvbWlzZSA9IG5ldyBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0cmVzb2x2ZVJlcXVlc3QgPSByZXNvbHZlO1xuXHRcdH0pO1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJGludm9rZUNoYXRTZXNzaW9uUmVxdWVzdEhhbmRsZXIpLnJldHVybnMocmVxdWVzdFByb21pc2UpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdEhhbmRsZXJQcm9taXNlID0gc2Vzc2lvbi5yZXF1ZXN0SGFuZGxlciEocmVxdWVzdCwgcHJvZ3Jlc3NDYWxsYmFjaywgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3MxOiBJQ2hhdFByb2dyZXNzID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ1Byb2dyZXNzIDEnLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblx0XHRjb25zdCBwcm9ncmVzczI6IElDaGF0UHJvZ3Jlc3MgPSB7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiB7IHZhbHVlOiAnUHJvZ3Jlc3MgMicsIGlzVHJ1c3RlZDogZmFsc2UgfSB9O1xuXG5cdFx0c2Vzc2lvbi5oYW5kbGVQcm9ncmVzc0NodW5rKCdyZXExJywgW3Byb2dyZXNzMV0pO1xuXHRcdHNlc3Npb24uaGFuZGxlUHJvZ3Jlc3NDaHVuaygncmVxMScsIFtwcm9ncmVzczJdKTtcblxuXHRcdC8vIFdhaXQgYSBiaXQgZm9yIGF1dG9ydW4gdG8gdHJpZ2dlclxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRhc3NlcnQub2socHJvZ3Jlc3NDYWxsYmFjay5jYWxsZWRUd2ljZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9ncmVzc0NhbGxiYWNrLmZpcnN0Q2FsbC5hcmdzWzBdLCBbcHJvZ3Jlc3MxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9ncmVzc0NhbGxiYWNrLnNlY29uZENhbGwuYXJnc1swXSwgW3Byb2dyZXNzMl0pO1xuXG5cdFx0Ly8gQ29tcGxldGUgdGhlIHJlcXVlc3Rcblx0XHRyZXNvbHZlUmVxdWVzdCEoe30pO1xuXHRcdGF3YWl0IHJlcXVlc3RIYW5kbGVyUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIHByb3Blcmx5IGNsZWFucyB1cCByZXNvdXJjZXMgYW5kIG5vdGlmaWVzIGxpc3RlbmVycycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1pZCc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPYnNlcnZhYmxlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIDEsIHByb3h5LCBsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKSk7XG5cblx0XHRsZXQgZGlzcG9zZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2Vzc2lvbi5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2VFdmVudEZpcmVkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VFdmVudEZpcmVkKTtcblx0XHRhc3NlcnQub2soYXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQpLmNhbGxlZE9uY2VXaXRoKDEsIHJlc291cmNlKSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiB3aXRoIG11bHRpcGxlIHJlcXVlc3QvcmVzcG9uc2UgcGFpcnMgaW4gaGlzdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uSGlzdG9yeSA9IFtcblx0XHRcdHsgdHlwZTogJ3JlcXVlc3QnLCBwcm9tcHQ6ICdGaXJzdCBxdWVzdGlvbicgfSxcblx0XHRcdHsgdHlwZTogJ3Jlc3BvbnNlJywgcGFydHM6IFt7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiB7IHZhbHVlOiAnRmlyc3QgYW5zd2VyJywgaXNUcnVzdGVkOiBmYWxzZSB9IH1dIH0sXG5cdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnU2Vjb25kIHF1ZXN0aW9uJyB9LFxuXHRcdFx0eyB0eXBlOiAncmVzcG9uc2UnLCBwYXJ0czogW3sga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdTZWNvbmQgYW5zd2VyJywgaXNUcnVzdGVkOiBmYWxzZSB9IH1dIH1cblx0XHRdO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQgPSBjcmVhdGVTZXNzaW9uQ29udGVudCh7XG5cdFx0XHRoaXN0b3J5OiBzZXNzaW9uSGlzdG9yeSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudCkpO1xuXG5cdFx0Ly8gVmVyaWZ5IGFsbCBoaXN0b3J5IHdhcyBsb2FkZWQgY29ycmVjdGx5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeS5sZW5ndGgsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMF0udHlwZSwgJ3JlcXVlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzBdLnByb21wdCwgJ0ZpcnN0IHF1ZXN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVsxXS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHNlc3Npb24uaGlzdG9yeVsxXS5wYXJ0c1swXSBhcyBJQ2hhdFByb2dyZXNzTWVzc2FnZSkuY29udGVudC52YWx1ZSwgJ0ZpcnN0IGFuc3dlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMl0udHlwZSwgJ3JlcXVlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzJdLnByb21wdCwgJ1NlY29uZCBxdWVzdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbM10udHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzZXNzaW9uLmhpc3RvcnlbM10ucGFydHNbMF0gYXMgSUNoYXRQcm9ncmVzc01lc3NhZ2UpLmNvbnRlbnQudmFsdWUsICdTZWNvbmQgYW5zd2VyJyk7XG5cblx0XHQvLyBTZXNzaW9uIHNob3VsZCBiZSBjb21wbGV0ZSBzaW5jZSBpdCBoYXMgbm8gY2FwYWJpbGl0aWVzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNDb21wbGV0ZU9icy5nZXQoKSwgdHJ1ZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdNYWluVGhyZWFkQ2hhdFNlc3Npb25zJywgZnVuY3Rpb24gKCkge1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IG1haW5UaHJlYWQ6IE1haW5UaHJlYWRDaGF0U2Vzc2lvbnM7XG5cdGxldCBwcm94eTogRXh0SG9zdENoYXRTZXNzaW9uc1NoYXBlO1xuXHRsZXQgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXG5cdFx0cHJveHkgPSB7XG5cdFx0XHQkcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudDogc2lub24uc3R1YigpLFxuXHRcdFx0JHByb3ZpZGVDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uczogc2lub24uc3R1YjxbcHJvdmlkZXJIYW5kbGU6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuXSwgUHJvbWlzZTxJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMgfCB1bmRlZmluZWQ+PigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0XHQkcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2U6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRpbnRlcnJ1cHRDaGF0U2Vzc2lvbkFjdGl2ZVJlc3BvbnNlOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkaW52b2tlQ2hhdFNlc3Npb25SZXF1ZXN0SGFuZGxlcjogc2lub24uc3R1YigpLFxuXHRcdFx0JGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQ6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRyZWZyZXNoQ2hhdFNlc3Npb25JdGVtczogc2lub24uc3R1YigpLFxuXHRcdFx0JG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGU6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRuZXdDaGF0U2Vzc2lvbkl0ZW06IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyh1bmRlZmluZWQpLFxuXHRcdFx0JGZvcmtDaGF0U2Vzc2lvbjogc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0XHQkcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbTogc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0XHQkcHJvdmlkZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZTogc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0fTtcblxuXHRcdGNvbnN0IGV4dEhvc3RDb250ZXh0ID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUV4dEhvc3RDb250ZXh0IHtcblx0XHRcdHJlbW90ZUF1dGhvcml0eSA9ICcnO1xuXHRcdFx0ZXh0ZW5zaW9uSG9zdEtpbmQgPSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3M7XG5cdFx0XHRkaXNwb3NlKCkgeyB9XG5cdFx0XHRhc3NlcnRSZWdpc3RlcmVkKCkgeyB9XG5cdFx0XHRzZXQodjogYW55KTogYW55IHsgcmV0dXJuIG51bGw7IH1cblx0XHRcdGdldFByb3h5KCk6IGFueSB7IHJldHVybiBwcm94eTsgfVxuXHRcdFx0ZHJhaW4oKTogYW55IHsgcmV0dXJuIG51bGw7IH1cblx0XHR9O1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0S2V5U2VydmljZSkpKTtcblx0XHRsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7IH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvblNlcnZpY2UsIG5ldyBUZXN0RXh0ZW5zaW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWaWV3c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuVmlldygpIHsgcmV0dXJuIG51bGw7IH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEaWFsb2dTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNvbmZpcm0oKSB7XG5cdFx0XHRcdHJldHVybiB7IGNvbmZpcm1lZDogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhYmVsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFiZWxTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyRm9ybWF0dGVyKCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXQgbW9kZWwoKTogSUFnZW50U2Vzc2lvbnNNb2RlbCB7XG5cdFx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zTW9kZWw+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGUgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0fSk7XG5cblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uc1NlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRtYWluVGhyZWFkID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRDaGF0U2Vzc2lvbnMsIGV4dEhvc3RDb250ZXh0KSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCBjcmVhdGVzIGFuZCBpbml0aWFsaXplcyBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgc2Vzc2lvblNjaGVtZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQ6IElDaGF0U2Vzc2lvbkR0byA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZSxcblx0XHRcdGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSxcblx0XHRcdHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSxcblx0XHR9O1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQub2soc2Vzc2lvbjEpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMSwgc2Vzc2lvbjIpO1xuXG5cdFx0YXNzZXJ0Lm9rKGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5jYWxsZWRPbmNlKTtcblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQgcHJvcGFnYXRlcyB0aXRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEsIHNlc3Npb25TY2hlbWUpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Rlc3Qtc2Vzc2lvbmApO1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50OiBJQ2hhdFNlc3Npb25EdG8gPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRpdGxlOiAnTXkgU2Vzc2lvbiBUaXRsZScsXG5cdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLFxuXHRcdFx0aGFzRm9ya0hhbmRsZXI6IGZhbHNlLFxuXHRcdFx0c3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlLFxuXHRcdH07XG5cblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24udGl0bGUsICdNeSBTZXNzaW9uIFRpdGxlJyk7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSk7XG5cdH0pO1xuXG5cdHRlc3QoJyRoYW5kbGVQcm9ncmVzc0NodW5rIHJvdXRlcyB0byBjb3JyZWN0IHNlc3Npb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEsIHNlc3Npb25TY2hlbWUpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Rlc3Qtc2Vzc2lvbmApO1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50OiBJQ2hhdFNlc3Npb25EdG8gPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogZmFsc2UsXG5cdFx0XHRoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsXG5cdFx0XHRoYXNGb3JrSGFuZGxlcjogZmFsc2UsXG5cdFx0XHRzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UsXG5cdFx0fTtcblxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5yZXNvbHZlcyhzZXNzaW9uQ29udGVudCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSBhcyBPYnNlcnZhYmxlQ2hhdFNlc3Npb247XG5cblx0XHRjb25zdCBwcm9ncmVzc0R0bzogSUNoYXRQcm9ncmVzc0R0byA9IHsga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdUZXN0JywgaXNUcnVzdGVkOiBmYWxzZSB9IH07XG5cdFx0YXdhaXQgbWFpblRocmVhZC4kaGFuZGxlUHJvZ3Jlc3NDaHVuaygxLCByZXNvdXJjZSwgJ3JlcTEnLCBbcHJvZ3Jlc3NEdG9dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnByb2dyZXNzT2JzLmdldCgpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ucHJvZ3Jlc3NPYnMuZ2V0KClbMF0ua2luZCwgJ3Byb2dyZXNzTWVzc2FnZScpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEpO1xuXHR9KTtcblxuXHR0ZXN0KCckaGFuZGxlUHJvZ3Jlc3NDb21wbGV0ZSBtYXJrcyBzZXNzaW9uIGNvbXBsZXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgc2Vzc2lvblNjaGVtZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQ6IElDaGF0U2Vzc2lvbkR0byA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZSxcblx0XHRcdGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSxcblx0XHRcdHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSxcblx0XHR9O1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpIGFzIE9ic2VydmFibGVDaGF0U2Vzc2lvbjtcblxuXHRcdGNvbnN0IHByb2dyZXNzRHRvOiBJQ2hhdFByb2dyZXNzRHRvID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ1Rlc3QnLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblx0XHRhd2FpdCBtYWluVGhyZWFkLiRoYW5kbGVQcm9ncmVzc0NodW5rKDEsIHJlc291cmNlLCAncmVxMScsIFtwcm9ncmVzc0R0b10pO1xuXHRcdG1haW5UaHJlYWQuJGhhbmRsZVByb2dyZXNzQ29tcGxldGUoMSwgcmVzb3VyY2UsICdyZXExJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0NvbXBsZXRlT2JzLmdldCgpLCB0cnVlKTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxKTtcblx0fSk7XG5cblx0dGVzdCgnaW50ZWdyYXRpb24gd2l0aCBtdWx0aXBsZSByZXF1ZXN0L3Jlc3BvbnNlIHBhaXJzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgc2Vzc2lvblNjaGVtZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovbXVsdGktdHVybi1zZXNzaW9uYCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQ6IElDaGF0U2Vzc2lvbkR0byA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0aGlzdG9yeTogW1xuXHRcdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnRmlyc3QgcXVlc3Rpb24nLCBwYXJ0aWNpcGFudDogJ3Rlc3QtcGFydGljaXBhbnQnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Jlc3BvbnNlJywgcGFydHM6IFt7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiB7IHZhbHVlOiAnRmlyc3QgYW5zd2VyJywgaXNUcnVzdGVkOiBmYWxzZSB9IH1dLCBwYXJ0aWNpcGFudDogJ3Rlc3QtcGFydGljaXBhbnQnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3JlcXVlc3QnLCBwcm9tcHQ6ICdTZWNvbmQgcXVlc3Rpb24nLCBwYXJ0aWNpcGFudDogJ3Rlc3QtcGFydGljaXBhbnQnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Jlc3BvbnNlJywgcGFydHM6IFt7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiB7IHZhbHVlOiAnU2Vjb25kIGFuc3dlcicsIGlzVHJ1c3RlZDogZmFsc2UgfSB9XSwgcGFydGljaXBhbnQ6ICd0ZXN0LXBhcnRpY2lwYW50JyB9XG5cdFx0XHRdLFxuXHRcdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogZmFsc2UsXG5cdFx0XHRoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsXG5cdFx0XHRoYXNGb3JrSGFuZGxlcjogZmFsc2UsXG5cdFx0XHRzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UsXG5cdFx0fTtcblxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5yZXNvbHZlcyhzZXNzaW9uQ29udGVudCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgYXMgT2JzZXJ2YWJsZUNoYXRTZXNzaW9uO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBzZXNzaW9uIGxvYWRlZCBjb3JyZWN0bHlcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeS5sZW5ndGgsIDQpO1xuXG5cdFx0Ly8gVmVyaWZ5IGFsbCBoaXN0b3J5IGl0ZW1zIGFyZSBjb3JyZWN0bHkgbG9hZGVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVswXS50eXBlLCAncmVxdWVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMF0ucHJvbXB0LCAnRmlyc3QgcXVlc3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzFdLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMl0udHlwZSwgJ3JlcXVlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzJdLnByb21wdCwgJ1NlY29uZCBxdWVzdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbM10udHlwZSwgJ3Jlc3BvbnNlJyk7XG5cblx0XHQvLyBTZXNzaW9uIHNob3VsZCBiZSBjb21wbGV0ZSBzaW5jZSBpdCBoYXMgbm8gYWN0aXZlIGNhcGFiaWxpdGllc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIHRydWUpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEpO1xuXHR9KTtcblxuXHR0ZXN0KCckb25EaWRDaGFuZ2VDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucyByZWZyZXNoZXMgb3B0aW9uIGdyb3VwcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRjb25zdCBoYW5kbGUgPSAxO1xuXG5cdFx0Y29uc3Qgb3B0aW9uR3JvdXBzMTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdID0gW3tcblx0XHRcdGlkOiAnbW9kZWxzJyxcblx0XHRcdG5hbWU6ICdNb2RlbHMnLFxuXHRcdFx0aXRlbXM6IFt7IGlkOiAnbW9kZWxBJywgbmFtZTogJ01vZGVsIEEnIH1dXG5cdFx0fV07XG5cdFx0Y29uc3Qgb3B0aW9uR3JvdXBzMjogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdID0gW3tcblx0XHRcdGlkOiAnbW9kZWxzJyxcblx0XHRcdG5hbWU6ICdNb2RlbHMnLFxuXHRcdFx0aXRlbXM6IFt7IGlkOiAnbW9kZWxCJywgbmFtZTogJ01vZGVsIEInIH1dXG5cdFx0fV07XG5cblx0XHRjb25zdCBwcm92aWRlT3B0aW9uc1N0dWIgPSBhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKTtcblx0XHRwcm92aWRlT3B0aW9uc1N0dWIub25GaXJzdENhbGwoKS5yZXNvbHZlcyh7IG9wdGlvbkdyb3Vwczogb3B0aW9uR3JvdXBzMSB9IGFzIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucyk7XG5cdFx0cHJvdmlkZU9wdGlvbnNTdHViLm9uU2Vjb25kQ2FsbCgpLnJlc29sdmVzKHsgb3B0aW9uR3JvdXBzOiBvcHRpb25Hcm91cHMyIH0gYXMgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKTtcblxuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoaGFuZGxlLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdC8vIFdhaXQgZm9yIGluaXRpYWwgb3B0aW9ucyBmZXRjaCB0cmlnZ2VyZWQgb24gcmVnaXN0cmF0aW9uXG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdGxldCBzdG9yZWRHcm91cHMgPSBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlKHNlc3Npb25TY2hlbWUpO1xuXHRcdGFzc2VydC5vayhzdG9yZWRHcm91cHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZWRHcm91cHMhWzBdLml0ZW1zWzBdLmlkLCAnbW9kZWxBJyk7XG5cblx0XHQvLyBTaW11bGF0ZSBleHRlbnNpb24gc2lnbmFsaW5nIHRoYXQgcHJvdmlkZXIgb3B0aW9ucyBoYXZlIGNoYW5nZWRcblx0XHRtYWluVGhyZWFkLiRvbkRpZENoYW5nZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKGhhbmRsZSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdHN0b3JlZEdyb3VwcyA9IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblNjaGVtZSk7XG5cdFx0YXNzZXJ0Lm9rKHN0b3JlZEdyb3Vwcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlZEdyb3VwcyFbMF0uaXRlbXNbMF0uaWQsICdtb2RlbEInKTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihoYW5kbGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBvcHRpb24gcmVmcmVzaCBvbmx5IGxvZ3MgdW5leHBlY3RlZCBlcnJvcnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZU9wdGlvbnNTdHViID0gYXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucyk7XG5cdFx0Y29uc3QgZXJyb3JTcHkgPSBzaW5vbi5zcHkobG9nU2VydmljZSwgJ2Vycm9yJyk7XG5cdFx0Y29uc3QgdW5leHBlY3RlZEVycm9yID0gbmV3IEVycm9yKCdVbmV4cGVjdGVkJyk7XG5cdFx0cHJvdmlkZU9wdGlvbnNTdHViLm9uRmlyc3RDYWxsKCkucmVqZWN0cyhuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0cHJvdmlkZU9wdGlvbnNTdHViLm9uU2Vjb25kQ2FsbCgpLnJlamVjdHModW5leHBlY3RlZEVycm9yKTtcblxuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgJ3Rlc3Qtc2Vzc2lvbi10eXBlJyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRtYWluVGhyZWFkLiRvbkRpZENoYW5nZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKDEpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVycm9yU3B5LmFyZ3MsIFtbJ0Vycm9yIGZldGNoaW5nIGNoYXQgc2Vzc2lvbiBvcHRpb25zJywgdW5leHBlY3RlZEVycm9yXV0pO1xuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U2Vzc2lvbk9wdGlvbiByZXR1cm5zIHVuZGVmaW5lZCBmb3IgdW5zZXQgb3B0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEsIHNlc3Npb25TY2hlbWUpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Rlc3Qtc2Vzc2lvbmApO1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50OiBJQ2hhdFNlc3Npb25EdG8gPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogZmFsc2UsXG5cdFx0XHRoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsXG5cdFx0XHRoYXNGb3JrSGFuZGxlcjogZmFsc2UsXG5cdFx0XHRzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UsXG5cdFx0fTtcblxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5yZXNvbHZlcyhzZXNzaW9uQ29udGVudCk7XG5cblx0XHRhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Ly8gZ2V0U2Vzc2lvbk9wdGlvbiBzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgdW5zZXQgb3B0aW9uc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24ocmVzb3VyY2UsICdtb2RlbHMnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlLCAnYW55T3B0aW9uJyksIHVuZGVmaW5lZCk7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25PcHRpb24gcmV0dXJucyB2YWx1ZSBmb3IgZXhwbGljaXRseSBzZXQgb3B0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEsIHNlc3Npb25TY2hlbWUpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Rlc3Qtc2Vzc2lvbmApO1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50OiBJQ2hhdFNlc3Npb25EdG8gPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogZmFsc2UsXG5cdFx0XHRoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsXG5cdFx0XHRoYXNGb3JrSGFuZGxlcjogZmFsc2UsXG5cdFx0XHRzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdCdtb2RlbHMnOiAnZ3B0LTQnLFxuXHRcdFx0XHQncmVnaW9uJzogeyBpZDogJ3VzLWVhc3QnLCBuYW1lOiAnVVMgRWFzdCcgfVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXG5cdFx0YXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIGdldFNlc3Npb25PcHRpb24gc2hvdWxkIHJldHVybiB0aGUgY29uZmlndXJlZCB2YWx1ZXNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlLCAnbW9kZWxzJyksICdncHQtNCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlLCAncmVnaW9uJyksIHsgaWQ6ICd1cy1lYXN0JywgbmFtZTogJ1VTIEVhc3QnIH0pO1xuXG5cdFx0Ly8gZ2V0U2Vzc2lvbk9wdGlvbiBzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3Igb3B0aW9ucyBub3QgaW4gdGhlIHNlc3Npb25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlLCAnbm90Q29uZmlndXJlZCcpLCB1bmRlZmluZWQpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcHRpb24gY2hhbmdlIG5vdGlmaWNhdGlvbnMgYXJlIHNlbnQgdG8gdGhlIGV4dGVuc2lvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRjb25zdCBoYW5kbGUgPSAxO1xuXG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihoYW5kbGUsIHNlc3Npb25TY2hlbWUpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQ6IElDaGF0U2Vzc2lvbkR0byA9IHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Rlc3Qtc2Vzc2lvbmApLFxuXHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZSxcblx0XHRcdGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSxcblx0XHRcdHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0J21vZGVscyc6ICdncHQtNCdcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKTtcblx0XHRhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Ly8gQ2xlYXIgdGhlIHN0dWIgY2FsbCBoaXN0b3J5XG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVIYW5kbGVPcHRpb25zQ2hhbmdlKS5yZXNldEhpc3RvcnkoKTtcblxuXHRcdC8vIFNpbXVsYXRlIGFuIG9wdGlvbiBjaGFuZ2Vcblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldFNlc3Npb25PcHRpb24ocmVzb3VyY2UsICdtb2RlbHMnLCAnZ3B0LTQtdHVyYm8nKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgZXh0ZW5zaW9uIHdhcyBub3RpZmllZFxuXHRcdGFzc2VydC5vayhhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2UpLmNhbGxlZE9uY2UpO1xuXHRcdGNvbnN0IGNhbGwgPSBhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2UpLmZpcnN0Q2FsbDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbC5hcmdzWzBdLCBoYW5kbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbC5hcmdzWzFdLCByZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxsLmFyZ3NbMl0sIHsgbW9kZWxzOiAnZ3B0LTQtdHVyYm8nIH0pO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKGhhbmRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wdGlvbiBjaGFuZ2Ugbm90aWZpY2F0aW9ucyBmYWlsIHNpbGVudGx5IHdoZW4gcHJvdmlkZXIgbm90IHJlZ2lzdGVyZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd1bnJlZ2lzdGVyZWQtc2Vzc2lvbi10eXBlJztcblxuXHRcdC8vIERvIE5PVCByZWdpc3RlciBhIGNvbnRlbnQgcHJvdmlkZXIgZm9yIHRoaXMgc2NoZW1lXG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cblx0XHQvLyBDbGVhciBhbnkgcHJldmlvdXMgY2FsbHNcblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2UpLnJlc2V0SGlzdG9yeSgpO1xuXG5cdFx0Ly8gQXR0ZW1wdCB0byBub3RpZnkgb3B0aW9uIGNoYW5nZSBmb3IgYW4gdW5yZWdpc3RlcmVkIHNjaGVtZVxuXHRcdC8vIFRoaXMgc2hvdWxkIG5vdCB0aHJvdywgYnV0IGFsc28gc2hvdWxkIG5vdCBjYWxsIHRoZSBwcm94eVxuXHRcdGNoYXRTZXNzaW9uc1NlcnZpY2UudXBkYXRlU2Vzc2lvbk9wdGlvbnMocmVzb3VyY2UsIG5ldyBNYXAoW1xuXHRcdFx0Wydtb2RlbHMnLCAnZ3B0LTQtdHVyYm8nXVxuXHRcdF0pKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgZXh0ZW5zaW9uIHdhcyBOT1Qgbm90aWZpZWQgKG5vIHByb3ZpZGVyIHJlZ2lzdGVyZWQpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlSGFuZGxlT3B0aW9uc0NoYW5nZSkuY2FsbENvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0U2Vzc2lvbk9wdGlvbiB1cGRhdGVzIG9wdGlvbiBhbmQgZ2V0U2Vzc2lvbk9wdGlvbiByZWZsZWN0cyBjaGFuZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKTtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudDogSUNoYXRTZXNzaW9uRHRvID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLFxuXHRcdFx0aGFzRm9ya0hhbmRsZXI6IGZhbHNlLFxuXHRcdFx0c3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlLFxuXHRcdH07XG5cblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXG5cdFx0YXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIEluaXRpYWxseSBubyBvcHRpb25zIHNldFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24ocmVzb3VyY2UsICdtb2RlbHMnKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFNldCBhbiBvcHRpb25cblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldFNlc3Npb25PcHRpb24ocmVzb3VyY2UsICdtb2RlbHMnLCAnZ3B0LTQnKTtcblxuXHRcdC8vIE5vdyBnZXRTZXNzaW9uT3B0aW9uIHNob3VsZCByZXR1cm4gdGhlIHZhbHVlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZSwgJ21vZGVscycpLCAnZ3B0LTQnKTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxKTtcblx0fSk7XG5cblx0dGVzdCgnJHVwZGF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZSBhcHBsaWVzIHNlbGVjdGVkIG9wdGlvbnMgb25seSB0byB0aGUgdGFyZ2V0ZWQgc2Vzc2lvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRjb25zdCBjb250cm9sbGVySGFuZGxlID0gMDtcblxuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlLCBzZXNzaW9uU2NoZW1lLCBmYWxzZSk7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdGNvbnN0IHJlc291cmNlQSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovc2Vzc2lvbi1hYCk7XG5cdFx0Y29uc3QgcmVzb3VyY2VCID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi9zZXNzaW9uLWJgKTtcblxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KVxuXHRcdFx0LndpdGhBcmdzKHNpbm9uLm1hdGNoLmFueSwgc2lub24ubWF0Y2goKHI6IFVSSSkgPT4gci50b1N0cmluZygpID09PSByZXNvdXJjZUEudG9TdHJpbmcoKSksIHNpbm9uLm1hdGNoLmFueSwgc2lub24ubWF0Y2guYW55KVxuXHRcdFx0LnJlc29sdmVzKHsgcmVzb3VyY2U6IHJlc291cmNlQSwgaGlzdG9yeTogW10sIGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLCBoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsIGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSwgc3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlIH0gc2F0aXNmaWVzIElDaGF0U2Vzc2lvbkR0byk7XG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpXG5cdFx0XHQud2l0aEFyZ3Moc2lub24ubWF0Y2guYW55LCBzaW5vbi5tYXRjaCgocjogVVJJKSA9PiByLnRvU3RyaW5nKCkgPT09IHJlc291cmNlQi50b1N0cmluZygpKSwgc2lub24ubWF0Y2guYW55LCBzaW5vbi5tYXRjaC5hbnkpXG5cdFx0XHQucmVzb2x2ZXMoeyByZXNvdXJjZTogcmVzb3VyY2VCLCBoaXN0b3J5OiBbXSwgaGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogZmFsc2UsIGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZSwgaGFzRm9ya0hhbmRsZXI6IGZhbHNlLCBzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UgfSBzYXRpc2ZpZXMgSUNoYXRTZXNzaW9uRHRvKTtcblxuXHRcdGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZUEsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZUIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Ly8gVXBkYXRlIGlucHV0IHN0YXRlIHRhcmdldGluZyBvbmx5IHNlc3Npb24gQVxuXHRcdG1haW5UaHJlYWQuJHVwZGF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZShjb250cm9sbGVySGFuZGxlLCByZXNvdXJjZUEsIFt7XG5cdFx0XHRpZDogJ21vZGVscycsXG5cdFx0XHRuYW1lOiAnTW9kZWxzJyxcblx0XHRcdGl0ZW1zOiBbeyBpZDogJ21vZGVsQScsIG5hbWU6ICdNb2RlbCBBJyB9LCB7IGlkOiAnbW9kZWxCJywgbmFtZTogJ01vZGVsIEInIH1dLFxuXHRcdFx0c2VsZWN0ZWQ6IHsgaWQ6ICdtb2RlbEInLCBuYW1lOiAnTW9kZWwgQicgfSxcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZUEsICdtb2RlbHMnKSwgeyBpZDogJ21vZGVsQicsIG5hbWU6ICdNb2RlbCBCJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlQiwgJ21vZGVscycpLCB1bmRlZmluZWQpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEpO1xuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUpO1xuXHR9KTtcblxuXHR0ZXN0KCckdXBkYXRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlIHVwZGF0ZXMgZGlmZmVyZW50IHNlc3Npb25zIGluZGVwZW5kZW50bHknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgY29udHJvbGxlckhhbmRsZSA9IDA7XG5cblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSwgc2Vzc2lvblNjaGVtZSwgZmFsc2UpO1xuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgc2Vzc2lvblNjaGVtZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Nlc3Npb24tYWApO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovc2Vzc2lvbi1iYCk7XG5cblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudClcblx0XHRcdC53aXRoQXJncyhzaW5vbi5tYXRjaC5hbnksIHNpbm9uLm1hdGNoKChyOiBVUkkpID0+IHIudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2VBLnRvU3RyaW5nKCkpLCBzaW5vbi5tYXRjaC5hbnksIHNpbm9uLm1hdGNoLmFueSlcblx0XHRcdC5yZXNvbHZlcyh7IHJlc291cmNlOiByZXNvdXJjZUEsIGhpc3Rvcnk6IFtdLCBoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSwgaGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLCBoYXNGb3JrSGFuZGxlcjogZmFsc2UsIHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSB9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25EdG8pO1xuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KVxuXHRcdFx0LndpdGhBcmdzKHNpbm9uLm1hdGNoLmFueSwgc2lub24ubWF0Y2goKHI6IFVSSSkgPT4gci50b1N0cmluZygpID09PSByZXNvdXJjZUIudG9TdHJpbmcoKSksIHNpbm9uLm1hdGNoLmFueSwgc2lub24ubWF0Y2guYW55KVxuXHRcdFx0LnJlc29sdmVzKHsgcmVzb3VyY2U6IHJlc291cmNlQiwgaGlzdG9yeTogW10sIGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLCBoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsIGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSwgc3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlIH0gc2F0aXNmaWVzIElDaGF0U2Vzc2lvbkR0byk7XG5cblx0XHRhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2VBLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2VCLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIFVwZGF0ZSBzZXNzaW9uIEEgd2l0aCBtb2RlbFhcblx0XHRtYWluVGhyZWFkLiR1cGRhdGVDaGF0U2Vzc2lvbklucHV0U3RhdGUoY29udHJvbGxlckhhbmRsZSwgcmVzb3VyY2VBLCBbe1xuXHRcdFx0aWQ6ICdtb2RlbHMnLFxuXHRcdFx0bmFtZTogJ01vZGVscycsXG5cdFx0XHRpdGVtczogW3sgaWQ6ICdtb2RlbFgnLCBuYW1lOiAnTW9kZWwgWCcgfSwgeyBpZDogJ21vZGVsWScsIG5hbWU6ICdNb2RlbCBZJyB9XSxcblx0XHRcdHNlbGVjdGVkOiB7IGlkOiAnbW9kZWxYJywgbmFtZTogJ01vZGVsIFgnIH0sXG5cdFx0fV0pO1xuXG5cdFx0Ly8gVXBkYXRlIHNlc3Npb24gQiB3aXRoIG1vZGVsWVxuXHRcdG1haW5UaHJlYWQuJHVwZGF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZShjb250cm9sbGVySGFuZGxlLCByZXNvdXJjZUIsIFt7XG5cdFx0XHRpZDogJ21vZGVscycsXG5cdFx0XHRuYW1lOiAnTW9kZWxzJyxcblx0XHRcdGl0ZW1zOiBbeyBpZDogJ21vZGVsWCcsIG5hbWU6ICdNb2RlbCBYJyB9LCB7IGlkOiAnbW9kZWxZJywgbmFtZTogJ01vZGVsIFknIH1dLFxuXHRcdFx0c2VsZWN0ZWQ6IHsgaWQ6ICdtb2RlbFknLCBuYW1lOiAnTW9kZWwgWScgfSxcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZUEsICdtb2RlbHMnKSwgeyBpZDogJ21vZGVsWCcsIG5hbWU6ICdNb2RlbCBYJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZUIsICdtb2RlbHMnKSwgeyBpZDogJ21vZGVsWScsIG5hbWU6ICdNb2RlbCBZJyB9KTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxKTtcblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSBpbnZva2VzIHByb3h5IGFuZCB1cGRhdGVzIGl0ZW0nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgY29udHJvbGxlckhhbmRsZSA9IDA7XG5cblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSwgc2Vzc2lvblNjaGVtZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovc2Vzc2lvbi1hYCk7XG5cdFx0Y29uc3QgaW5pdGlhbEl0ZW06IER0bzxJQ2hhdFNlc3Npb25JdGVtPiA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICdTZXNzaW9uIEEnLFxuXHRcdFx0dGltaW5nOiB7IGNyZWF0ZWQ6IDAsIGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLCBsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQgfSxcblx0XHR9O1xuXG5cdFx0Ly8gQWRkIGluaXRpYWwgaXRlbSB2aWEgJGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtXG5cdFx0YXdhaXQgbWFpblRocmVhZC4kYWRkT3JVcGRhdGVDaGF0U2Vzc2lvbkl0ZW0oY29udHJvbGxlckhhbmRsZSwgaW5pdGlhbEl0ZW0pO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWRJdGVtOiBEdG88SUNoYXRTZXNzaW9uSXRlbT4gPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAnU2Vzc2lvbiBBJyxcblx0XHRcdHRpbWluZzogeyBjcmVhdGVkOiAwLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCwgbGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkIH0sXG5cdFx0XHRiYWRnZTogJ3Jlc29sdmVkJyxcblx0XHR9O1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0pLnJlc29sdmVzKHJlc29sdmVkSXRlbSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oc2Vzc2lvblNjaGVtZSwgcmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGFzU2lub25NZXRob2RTdHViKHByb3h5LiRyZXNvbHZlQ2hhdFNlc3Npb25JdGVtKS5jYWxsZWRPbmNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdD8uYmFkZ2UsICdyZXNvbHZlZCcpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVDaGF0U2Vzc2lvbkl0ZW0gcmV0dXJucyB1bmRlZmluZWQgd2hlbiBzdXBwb3J0c1Jlc29sdmUgaXMgZmFsc2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgY29udHJvbGxlckhhbmRsZSA9IDA7XG5cblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSwgc2Vzc2lvblNjaGVtZSwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Nlc3Npb24tYWApO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb25TY2hlbWUsIHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGFzU2lub25NZXRob2RTdHViKHByb3h5LiRyZXNvbHZlQ2hhdFNlc3Npb25JdGVtKS5ub3RDYWxsZWQpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVDaGF0U2Vzc2lvbkl0ZW0gY2FjaGUgaXMgaW52YWxpZGF0ZWQgb24gaXRlbSB1cGRhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgY29udHJvbGxlckhhbmRsZSA9IDA7XG5cblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSwgc2Vzc2lvblNjaGVtZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovc2Vzc2lvbi1hYCk7XG5cdFx0Y29uc3QgdGltaW5nID0geyBjcmVhdGVkOiAwLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCwgbGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgaW5pdGlhbEl0ZW06IER0bzxJQ2hhdFNlc3Npb25JdGVtPiA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICdTZXNzaW9uIEEnLFxuXHRcdFx0dGltaW5nLFxuXHRcdH07XG5cblx0XHRhd2FpdCBtYWluVGhyZWFkLiRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbShjb250cm9sbGVySGFuZGxlLCBpbml0aWFsSXRlbSk7XG5cblx0XHRjb25zdCByZXNvbHZlZEl0ZW0xOiBEdG88SUNoYXRTZXNzaW9uSXRlbT4gPSB7IHJlc291cmNlLCBsYWJlbDogJ1Nlc3Npb24gQScsIHRpbWluZywgYmFkZ2U6ICdmaXJzdCcgfTtcblx0XHRjb25zdCByZXNvbHZlZEl0ZW0yOiBEdG88SUNoYXRTZXNzaW9uSXRlbT4gPSB7IHJlc291cmNlLCBsYWJlbDogJ1Nlc3Npb24gQScsIHRpbWluZywgYmFkZ2U6ICdzZWNvbmQnIH07XG5cblx0XHRjb25zdCByZXNvbHZlU3R1YiA9IGFzU2lub25NZXRob2RTdHViKHByb3h5LiRyZXNvbHZlQ2hhdFNlc3Npb25JdGVtKTtcblx0XHRyZXNvbHZlU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHJlc29sdmVkSXRlbTEpO1xuXHRcdHJlc29sdmVTdHViLm9uU2Vjb25kQ2FsbCgpLnJlc29sdmVzKHJlc29sdmVkSXRlbTIpO1xuXG5cdFx0Ly8gRmlyc3QgcmVzb2x2ZVxuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oc2Vzc2lvblNjaGVtZSwgcmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MT8uYmFkZ2UsICdmaXJzdCcpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgaXRlbSB1cGRhdGUgKHNob3VsZCBpbnZhbGlkYXRlIGNhY2hlKVxuXHRcdGF3YWl0IG1haW5UaHJlYWQuJGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtKGNvbnRyb2xsZXJIYW5kbGUsIHsgLi4uaW5pdGlhbEl0ZW0sIGxhYmVsOiAnU2Vzc2lvbiBBIFVwZGF0ZWQnIH0pO1xuXG5cdFx0Ly8gU2Vjb25kIHJlc29sdmUgYWZ0ZXIgY2FjaGUgaW52YWxpZGF0aW9uIHNob3VsZCBjYWxsIHByb3h5IGFnYWluXG5cdFx0Y29uc3QgcmVzdWx0MiA9IGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbShzZXNzaW9uU2NoZW1lLCByZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyPy5iYWRnZSwgJ3NlY29uZCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVTdHViLmNhbGxDb3VudCwgMik7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSBjYWNoZXMgdW5kZWZpbmVkIHJlc3VsdCB1bnRpbCBpdGVtIHVwZGF0ZSBpbnZhbGlkYXRlcyBpdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRjb25zdCBjb250cm9sbGVySGFuZGxlID0gMDtcblxuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlLCBzZXNzaW9uU2NoZW1lLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi9zZXNzaW9uLWFgKTtcblx0XHRjb25zdCB0aW1pbmcgPSB7IGNyZWF0ZWQ6IDAsIGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLCBsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQgfTtcblx0XHRjb25zdCBpbml0aWFsSXRlbTogRHRvPElDaGF0U2Vzc2lvbkl0ZW0+ID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogJ1Nlc3Npb24gQScsXG5cdFx0XHR0aW1pbmcsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc29sdmVTdHViID0gYXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0pO1xuXHRcdHJlc29sdmVTdHViLm9uRmlyc3RDYWxsKCkucmVzb2x2ZXModW5kZWZpbmVkKTtcblx0XHRyZXNvbHZlU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7IHJlc291cmNlLCBsYWJlbDogJ1Nlc3Npb24gQScsIHRpbWluZywgYmFkZ2U6ICdyZXNvbHZlZCcgfSBzYXRpc2ZpZXMgRHRvPElDaGF0U2Vzc2lvbkl0ZW0+KTtcblxuXHRcdC8vIEZpcnN0IHJlc29sdmUgcmV0dXJucyB1bmRlZmluZWQgYW5kIHNob3VsZCBiZSBjYWNoZWQuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbShzZXNzaW9uU2NoZW1lLCByZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBTZWNvbmQgcmVzb2x2ZSBzaG91bGQgcmV1c2UgdGhlIGNhY2hlZCB1bmRlZmluZWQgcmVzdWx0LlxuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oc2Vzc2lvblNjaGVtZSwgcmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlU3R1Yi5jYWxsQ291bnQsIDEpO1xuXG5cdFx0Ly8gVXBkYXRpbmcgdGhlIGl0ZW0gc2hvdWxkIGludmFsaWRhdGUgdGhlIGNhY2hlZCB1bmRlZmluZWQgcmVzdWx0LlxuXHRcdGF3YWl0IG1haW5UaHJlYWQuJGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtKGNvbnRyb2xsZXJIYW5kbGUsIGluaXRpYWxJdGVtKTtcblxuXHRcdGNvbnN0IHJlc3VsdDMgPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oc2Vzc2lvblNjaGVtZSwgcmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Mz8uYmFkZ2UsICdyZXNvbHZlZCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVTdHViLmNhbGxDb3VudCwgMik7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSBpZ25vcmVzIHN0YWxlIGluLWZsaWdodCByZXNvbHZlIHJlc3VsdCBhZnRlciBpdGVtIHVwZGF0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRjb25zdCBjb250cm9sbGVySGFuZGxlID0gMDtcblxuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlLCBzZXNzaW9uU2NoZW1lLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi9zZXNzaW9uLWFgKTtcblx0XHRjb25zdCB0aW1pbmcgPSB7IGNyZWF0ZWQ6IDAsIGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLCBsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQgfTtcblx0XHRjb25zdCBpbml0aWFsSXRlbTogRHRvPElDaGF0U2Vzc2lvbkl0ZW0+ID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogJ1Nlc3Npb24gQScsXG5cdFx0XHR0aW1pbmcsXG5cdFx0fTtcblxuXHRcdGF3YWl0IG1haW5UaHJlYWQuJGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtKGNvbnRyb2xsZXJIYW5kbGUsIGluaXRpYWxJdGVtKTtcblxuXHRcdGxldCByZXNvbHZlUGVuZGluZzogKCh2YWx1ZTogRHRvPElDaGF0U2Vzc2lvbkl0ZW0+KSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSkucmV0dXJucyhuZXcgUHJvbWlzZTxEdG88SUNoYXRTZXNzaW9uSXRlbT4+KHJlc29sdmUgPT4ge1xuXHRcdFx0cmVzb2x2ZVBlbmRpbmcgPSByZXNvbHZlO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBlbmRpbmdSZXNvbHZlID0gY2hhdFNlc3Npb25zU2VydmljZS5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb25TY2hlbWUsIHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGF3YWl0IG1haW5UaHJlYWQuJGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtKGNvbnRyb2xsZXJIYW5kbGUsIHtcblx0XHRcdC4uLmluaXRpYWxJdGVtLFxuXHRcdFx0bGFiZWw6ICdTZXNzaW9uIEEgVXBkYXRlZCcsXG5cdFx0fSk7XG5cblx0XHRyZXNvbHZlUGVuZGluZz8uKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICdTZXNzaW9uIEEnLFxuXHRcdFx0dGltaW5nLFxuXHRcdFx0YmFkZ2U6ICdzdGFsZScsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZW5kaW5nUmVzb2x2ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5sYWJlbCwgJ1Nlc3Npb24gQSBVcGRhdGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8uYmFkZ2UsIHVuZGVmaW5lZCk7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0V4dEhvc3RDaGF0U2Vzc2lvbnMnLCBmdW5jdGlvbiAoKSB7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgZXh0SG9zdENoYXRTZXNzaW9uczogRXh0SG9zdENoYXRTZXNzaW9ucztcblx0bGV0IG1haW5UaHJlYWRDaGF0U2Vzc2lvbnNQcm94eToge1xuXHRcdCRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXI6IHNpbm9uLlNpbm9uU3R1Yjtcblx0XHQkdXBkYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlckNhcGFiaWxpdGllczogc2lub24uU2lub25TdHViO1xuXHRcdCR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcjogc2lub24uU2lub25TdHViO1xuXHRcdCR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1zOiBzaW5vbi5TaW5vblN0dWI7XG5cdFx0JGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtOiBzaW5vbi5TaW5vblN0dWI7XG5cdFx0JG9uRGlkQ29tbWl0Q2hhdFNlc3Npb25JdGVtOiBzaW5vbi5TaW5vblN0dWI7XG5cdFx0JHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXI6IHNpbm9uLlNpbm9uU3R1Yjtcblx0XHQkdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyOiBzaW5vbi5TaW5vblN0dWI7XG5cdFx0JG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25PcHRpb25zOiBzaW5vbi5TaW5vblN0dWI7XG5cdFx0JG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnM6IHNpbm9uLlNpbm9uU3R1Yjtcblx0XHQkdXBkYXRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlOiBzaW5vbi5TaW5vblN0dWI7XG5cdH07XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdG1haW5UaHJlYWRDaGF0U2Vzc2lvbnNQcm94eSA9IHtcblx0XHRcdCRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXI6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyQ2FwYWJpbGl0aWVzOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXI6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1zOiBzaW5vbi5zdHViKCkucmVzb2x2ZXMoKSxcblx0XHRcdCRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbTogc2lub24uc3R1YigpLnJlc29sdmVzKCksXG5cdFx0XHQkb25EaWRDb21taXRDaGF0U2Vzc2lvbkl0ZW06IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbk9wdGlvbnM6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRvbkRpZENoYW5nZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkdXBkYXRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlOiBzaW5vbi5zdHViKCksXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJwY1Byb3RvY29sID0gQW55Q2FsbFJQQ1Byb3RvY29sKG1haW5UaHJlYWRDaGF0U2Vzc2lvbnNQcm94eSk7XG5cdFx0Y29uc3QgY29tbWFuZHMgPSBuZXcgRXh0SG9zdENvbW1hbmRzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFRlbGVtZXRyeT4oKSB7IH0pO1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzID0gbmV3IEV4dEhvc3RMYW5ndWFnZU1vZGVscyhycGNQcm90b2NvbCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RBdXRoZW50aWNhdGlvbj4oKSB7IH0pO1xuXG5cdFx0ZXh0SG9zdENoYXRTZXNzaW9ucyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRXh0SG9zdENoYXRTZXNzaW9ucyhjb21tYW5kcywgbGFuZ3VhZ2VNb2RlbHMsIHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ29udGVudFByb3ZpZGVyKHNlc3Npb246IHZzY29kZS5DaGF0U2Vzc2lvbik6IHZzY29kZS5DaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQ6IGFzeW5jICgpID0+IHNlc3Npb24sXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ2NvbnRyb2xsZXIgb25seSBhZHZlcnRpc2VzIHJlc29sdmUgc3VwcG9ydCBhZnRlciByZXNvbHZlIGhhbmRsZXIgaXMgYXNzaWduZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChleHRIb3N0Q2hhdFNlc3Npb25zLmNyZWF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZXNzaW9uU2NoZW1lLCBhc3luYyAoKSA9PiB7IH0pKTtcblxuXHRcdGFzc2VydC5vayhtYWluVGhyZWFkQ2hhdFNlc3Npb25zUHJveHkuJHJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlci5jYWxsZWRPbmNlV2l0aEV4YWN0bHkoMCwgc2Vzc2lvblNjaGVtZSwgZmFsc2UpKTtcblx0XHRhc3NlcnQub2sobWFpblRocmVhZENoYXRTZXNzaW9uc1Byb3h5LiR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyQ2FwYWJpbGl0aWVzLm5vdENhbGxlZCk7XG5cblx0XHRjb250cm9sbGVyLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0gPSBhc3luYyAoKSA9PiB7IH07XG5cdFx0YXNzZXJ0Lm9rKG1haW5UaHJlYWRDaGF0U2Vzc2lvbnNQcm94eS4kdXBkYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlckNhcGFiaWxpdGllcy5jYWxsZWRPbmNlV2l0aEV4YWN0bHkoMCwgdHJ1ZSkpO1xuXG5cdFx0Y29udHJvbGxlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtID0gdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5vayhtYWluVGhyZWFkQ2hhdFNlc3Npb25zUHJveHkuJHVwZGF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJDYXBhYmlsaXRpZXMuY2FsbGVkVHdpY2UpO1xuXHRcdGFzc2VydC5vayhtYWluVGhyZWFkQ2hhdFNlc3Npb25zUHJveHkuJHVwZGF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJDYXBhYmlsaXRpZXMuc2Vjb25kQ2FsbC5jYWxsZWRXaXRoRXhhY3RseSgwLCBmYWxzZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZHZlcnRpc2VzIGNvbnRyb2xsZXIgZm9yayBzdXBwb3J0IHdoZW4gb25seSB0aGUgY29udHJvbGxlciByZWdpc3RlcnMgYSBmb3JrIGhhbmRsZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3RDaGF0U2Vzc2lvbnMuY3JlYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlc3Npb25TY2hlbWUsIGFzeW5jICgpID0+IHsgfSkpO1xuXHRcdGNvbnRyb2xsZXIuZm9ya0hhbmRsZXIgPSBhc3luYyByZXNvdXJjZSA9PiBjb250cm9sbGVyLmNyZWF0ZUNoYXRTZXNzaW9uSXRlbShyZXNvdXJjZS53aXRoKHsgcGF0aDogJy9mb3JrZWQtc2Vzc2lvbicgfSksICdGb3JrZWQgU2Vzc2lvbicpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3RDaGF0U2Vzc2lvbnMucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlc3Npb25TY2hlbWUsIHVuZGVmaW5lZCEsIGNyZWF0ZUNvbnRlbnRQcm92aWRlcih7XG5cdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdHJlcXVlc3RIYW5kbGVyOiB1bmRlZmluZWQsXG5cdFx0fSkpKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBleHRIb3N0Q2hhdFNlc3Npb25zLiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KDAsIHNlc3Npb25SZXNvdXJjZSwgeyBpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IFtdIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGFzRm9ya0hhbmRsZXIsIHRydWUpO1xuXHRcdGF3YWl0IGV4dEhvc3RDaGF0U2Vzc2lvbnMuJGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQoMCwgc2Vzc2lvblJlc291cmNlKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycyBjb250cm9sbGVyIGZvcmsgaGFuZGxlciBvdmVyIGRlcHJlY2F0ZWQgc2Vzc2lvbiBmb3JrIGhhbmRsZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKTtcblx0XHRjb25zdCByZXF1ZXN0VHVybiA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlcXVlc3RUdXJuKCdwcm9tcHQnLCB1bmRlZmluZWQsIFtdLCAncGFydGljaXBhbnQnLCBbXSwgdW5kZWZpbmVkLCAncmVxdWVzdC0xJyk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChleHRIb3N0Q2hhdFNlc3Npb25zLmNyZWF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZXNzaW9uU2NoZW1lLCBhc3luYyAoKSA9PiB7IH0pKTtcblx0XHRjb25zdCBjb250cm9sbGVySXRlbSA9IGNvbnRyb2xsZXIuY3JlYXRlQ2hhdFNlc3Npb25JdGVtKFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovZm9ya2VkLWJ5LWNvbnRyb2xsZXJgKSwgJ0ZvcmtlZCBieSBDb250cm9sbGVyJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkl0ZW0gPSB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi9mb3JrZWQtYnktc2Vzc2lvbmApLFxuXHRcdFx0bGFiZWw6ICdGb3JrZWQgYnkgU2Vzc2lvbidcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29udHJvbGxlckZvcmtIYW5kbGVyID0gc2lub24uc3R1YigpLnJlc29sdmVzKGNvbnRyb2xsZXJJdGVtKTtcblx0XHRjb25zdCBkZXByZWNhdGVkU2Vzc2lvbkZvcmtIYW5kbGVyID0gc2lub24uc3R1YigpLnJlc29sdmVzKHNlc3Npb25JdGVtKTtcblx0XHRjb250cm9sbGVyLmZvcmtIYW5kbGVyID0gY29udHJvbGxlckZvcmtIYW5kbGVyO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3RDaGF0U2Vzc2lvbnMucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlc3Npb25TY2hlbWUsIHVuZGVmaW5lZCEsIGNyZWF0ZUNvbnRlbnRQcm92aWRlcih7XG5cdFx0XHRoaXN0b3J5OiBbcmVxdWVzdFR1cm5dLFxuXHRcdFx0cmVxdWVzdEhhbmRsZXI6IHVuZGVmaW5lZCxcblx0XHRcdGZvcmtIYW5kbGVyOiBkZXByZWNhdGVkU2Vzc2lvbkZvcmtIYW5kbGVyLFxuXHRcdH0pKSk7XG5cblx0XHRhd2FpdCBleHRIb3N0Q2hhdFNlc3Npb25zLiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KDAsIHNlc3Npb25SZXNvdXJjZSwgeyBpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IFtdIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dEhvc3RDaGF0U2Vzc2lvbnMuJGZvcmtDaGF0U2Vzc2lvbigwLCBzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdHR5cGU6ICdyZXF1ZXN0Jyxcblx0XHRcdGlkOiAncmVxdWVzdC0xJyxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRwYXJ0aWNpcGFudDogJ3BhcnRpY2lwYW50Jyxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5vayhjb250cm9sbGVyRm9ya0hhbmRsZXIuY2FsbGVkT25jZVdpdGhFeGFjdGx5KHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdFR1cm4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVwcmVjYXRlZFNlc3Npb25Gb3JrSGFuZGxlci5jYWxsQ291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzb3VyY2UudG9TdHJpbmcoKSwgY29udHJvbGxlckl0ZW0ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sYWJlbCwgY29udHJvbGxlckl0ZW0ubGFiZWwpO1xuXHRcdGF3YWl0IGV4dEhvc3RDaGF0U2Vzc2lvbnMuJGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQoMCwgc2Vzc2lvblJlc291cmNlKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBkZXByZWNhdGVkIHNlc3Npb24gZm9yayBoYW5kbGVyIHdoZW4gbm8gY29udHJvbGxlciBmb3JrIGhhbmRsZXIgZXhpc3RzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0Y29uc3QgcmVxdWVzdFR1cm4gPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0VHVybigncHJvbXB0JywgdW5kZWZpbmVkLCBbXSwgJ3BhcnRpY2lwYW50JywgW10sIHVuZGVmaW5lZCwgJ3JlcXVlc3QtMScpO1xuXHRcdGNvbnN0IGRlcHJlY2F0ZWRTZXNzaW9uRm9ya0hhbmRsZXIgPSBzaW5vbi5zdHViKCkucmVzb2x2ZXMoe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovZm9ya2VkLWJ5LXNlc3Npb25gKSxcblx0XHRcdGxhYmVsOiAnRm9ya2VkIGJ5IFNlc3Npb24nXG5cdFx0fSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdENoYXRTZXNzaW9ucy5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2Vzc2lvblNjaGVtZSwgdW5kZWZpbmVkISwgY3JlYXRlQ29udGVudFByb3ZpZGVyKHtcblx0XHRcdGhpc3Rvcnk6IFtyZXF1ZXN0VHVybl0sXG5cdFx0XHRyZXF1ZXN0SGFuZGxlcjogdW5kZWZpbmVkLFxuXHRcdFx0Zm9ya0hhbmRsZXI6IGRlcHJlY2F0ZWRTZXNzaW9uRm9ya0hhbmRsZXIsXG5cdFx0fSkpKTtcblxuXHRcdGF3YWl0IGV4dEhvc3RDaGF0U2Vzc2lvbnMuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoMCwgc2Vzc2lvblJlc291cmNlLCB7IGluaXRpYWxTZXNzaW9uT3B0aW9uczogW10gfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXh0SG9zdENoYXRTZXNzaW9ucy4kZm9ya0NoYXRTZXNzaW9uKDAsIHNlc3Npb25SZXNvdXJjZSwge1xuXHRcdFx0dHlwZTogJ3JlcXVlc3QnLFxuXHRcdFx0aWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0cHJvbXB0OiAncHJvbXB0Jyxcblx0XHRcdHBhcnRpY2lwYW50OiAncGFydGljaXBhbnQnLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGRlcHJlY2F0ZWRTZXNzaW9uRm9ya0hhbmRsZXIuY2FsbGVkT25jZVdpdGhFeGFjdGx5KHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdFR1cm4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCksIGAke3Nlc3Npb25TY2hlbWV9Oi9mb3JrZWQtYnktc2Vzc2lvbmApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGFiZWwsICdGb3JrZWQgYnkgU2Vzc2lvbicpO1xuXHRcdGF3YWl0IGV4dEhvc3RDaGF0U2Vzc2lvbnMuJGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQoMCwgc2Vzc2lvblJlc291cmNlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFFdkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtB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
