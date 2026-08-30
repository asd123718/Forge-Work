import assert from "assert";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { nullExtensionDescription } from "../../../../services/extensions/common/extensions.js";
import { SpeechToTextStatus } from "../../../speech/common/speechService.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { VoiceChatService } from "../../common/voiceChatService.js";
suite("VoiceChat", () => {
  class TestChatAgentCommand {
    constructor(name, description) {
      this.name = name;
      this.description = description;
    }
  }
  class TestChatAgent {
    constructor(id, slashCommands) {
      this.id = id;
      this.slashCommands = slashCommands;
      this.extensionId = nullExtensionDescription.identifier;
      this.extensionVersion = void 0;
      this.extensionPublisher = "";
      this.extensionDisplayName = "";
      this.extensionPublisherId = "";
      this.locations = [ChatAgentLocation.Chat];
      this.modes = [ChatModeKind.Ask];
      this.disambiguation = [];
      this.metadata = {};
      this.name = id;
    }
    provideFollowups(request, result, history, token) {
      throw new Error("Method not implemented.");
    }
    setRequestTools(requestId, tools) {
    }
    setYieldRequested(requestId, value) {
    }
    invoke(request, progress, history, token) {
      throw new Error("Method not implemented.");
    }
  }
  const agents = [
    new TestChatAgent("workspace", [
      new TestChatAgentCommand("fix", "fix"),
      new TestChatAgentCommand("explain", "explain")
    ]),
    new TestChatAgent("vscode", [
      new TestChatAgentCommand("search", "search")
    ])
  ];
  class TestChatAgentService {
    constructor() {
      this.onDidChangeAgents = Event.None;
      this.onWillInvokeAgent = Event.None;
      this.hasToolsAgent = false;
    }
    registerAgentImplementation(id, agent) {
      throw new Error();
    }
    registerDynamicAgent(data, agentImpl) {
      throw new Error("Method not implemented.");
    }
    invokeAgent(id, request, progress, history, token) {
      throw new Error();
    }
    setRequestTools(agent, requestId, tools) {
    }
    setYieldRequested(agent, requestId, value) {
    }
    getFollowups(id, request, result, history, token) {
      throw new Error();
    }
    getActivatedAgents() {
      return agents;
    }
    getAgents() {
      return agents;
    }
    getDefaultAgent() {
      throw new Error();
    }
    getContributedDefaultAgent() {
      throw new Error();
    }
    registerAgent(id, data) {
      throw new Error("Method not implemented.");
    }
    getAgent(id) {
      throw new Error("Method not implemented.");
    }
    getAgentsByName(name) {
      throw new Error("Method not implemented.");
    }
    updateAgent(id, updateMetadata) {
      throw new Error("Method not implemented.");
    }
    getAgentByFullyQualifiedId(id) {
      throw new Error("Method not implemented.");
    }
    registerAgentCompletionProvider(id, provider) {
      throw new Error("Method not implemented.");
    }
    getAgentCompletionItems(id, query, token) {
      throw new Error("Method not implemented.");
    }
    agentHasDupeName(id) {
      throw new Error("Method not implemented.");
    }
    getChatTitle(id, history, token) {
      throw new Error("Method not implemented.");
    }
    getChatSummary(id, history, token) {
      throw new Error("Method not implemented.");
    }
    hasChatParticipantDetectionProviders() {
      throw new Error("Method not implemented.");
    }
    registerChatParticipantDetectionProvider(handle, provider) {
      throw new Error("Method not implemented.");
    }
    detectAgentOrCommand(request, history, options, token) {
      throw new Error("Method not implemented.");
    }
  }
  class TestSpeechService {
    constructor() {
      this.onDidChangeHasSpeechProvider = Event.None;
      this.hasSpeechProvider = true;
      this.hasActiveSpeechToTextSession = false;
      this.hasActiveTextToSpeechSession = false;
      this.hasActiveKeywordRecognition = false;
      this.onDidStartSpeechToTextSession = Event.None;
      this.onDidEndSpeechToTextSession = Event.None;
      this.onDidStartTextToSpeechSession = Event.None;
      this.onDidEndTextToSpeechSession = Event.None;
      this.onDidStartKeywordRecognition = Event.None;
      this.onDidEndKeywordRecognition = Event.None;
    }
    registerSpeechProvider(identifier, provider) {
      throw new Error("Method not implemented.");
    }
    async createSpeechToTextSession(token) {
      return {
        onDidChange: emitter.event
      };
    }
    async createTextToSpeechSession(token) {
      return {
        onDidChange: Event.None,
        synthesize: async () => {
        }
      };
    }
    recognizeKeyword(token) {
      throw new Error("Method not implemented.");
    }
  }
  const disposables = new DisposableStore();
  let emitter;
  let service;
  let event;
  async function createSession(options) {
    const cts = new CancellationTokenSource();
    disposables.add(toDisposable(() => cts.dispose(true)));
    const session = await service.createVoiceChatSession(cts.token, options);
    disposables.add(session.onDidChange((e) => {
      event = e;
    }));
  }
  setup(() => {
    emitter = disposables.add(new Emitter());
    service = disposables.add(new VoiceChatService(new TestSpeechService(), new TestChatAgentService(), new MockContextKeyService()));
  });
  teardown(() => {
    disposables.clear();
  });
  test("Agent and slash command detection (useAgents: false)", async () => {
    await testAgentsAndSlashCommandsDetection({ usesAgents: false, model: {} });
  });
  test("Agent and slash command detection (useAgents: true)", async () => {
    await testAgentsAndSlashCommandsDetection({ usesAgents: true, model: {} });
  });
  async function testAgentsAndSlashCommandsDetection(options) {
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Started });
    assert.strictEqual(event?.status, SpeechToTextStatus.Started);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "Hello" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, "Hello");
    assert.strictEqual(event?.waitingForInput, void 0);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "Hello World" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, "Hello World");
    assert.strictEqual(event?.waitingForInput, void 0);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "Hello World" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, "Hello World");
    assert.strictEqual(event?.waitingForInput, void 0);
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, "At");
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At workspace" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace" : "At workspace");
    assert.strictEqual(event?.waitingForInput, options.usesAgents);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "at workspace" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace" : "at workspace");
    assert.strictEqual(event?.waitingForInput, options.usesAgents);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At workspace help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace help" : "At workspace help");
    assert.strictEqual(event?.waitingForInput, false);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At workspace help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace help" : "At workspace help");
    assert.strictEqual(event?.waitingForInput, false);
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At workspace, help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace help" : "At workspace, help");
    assert.strictEqual(event?.waitingForInput, false);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At workspace, help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace help" : "At workspace, help");
    assert.strictEqual(event?.waitingForInput, false);
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At Workspace. help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace help" : "At Workspace. help");
    assert.strictEqual(event?.waitingForInput, false);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At Workspace. help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace help" : "At Workspace. help");
    assert.strictEqual(event?.waitingForInput, false);
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "Slash fix" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace /fix" : "/fix");
    assert.strictEqual(event?.waitingForInput, true);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "Slash fix" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace /fix" : "/fix");
    assert.strictEqual(event?.waitingForInput, true);
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At code slash search help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@vscode /search help" : "At code slash search help");
    assert.strictEqual(event?.waitingForInput, false);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At code slash search help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, options.usesAgents ? "@vscode /search help" : "At code slash search help");
    assert.strictEqual(event?.waitingForInput, false);
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At code, slash search, help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@vscode /search help" : "At code, slash search, help");
    assert.strictEqual(event?.waitingForInput, false);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At code, slash search, help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, options.usesAgents ? "@vscode /search help" : "At code, slash search, help");
    assert.strictEqual(event?.waitingForInput, false);
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At code. slash, search help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@vscode /search help" : "At code. slash, search help");
    assert.strictEqual(event?.waitingForInput, false);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At code. slash search, help" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, options.usesAgents ? "@vscode /search help" : "At code. slash search, help");
    assert.strictEqual(event?.waitingForInput, false);
    await createSession(options);
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At workspace, for at workspace" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace for at workspace" : "At workspace, for at workspace");
    assert.strictEqual(event?.waitingForInput, false);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At workspace, for at workspace" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, options.usesAgents ? "@workspace for at workspace" : "At workspace, for at workspace");
    assert.strictEqual(event?.waitingForInput, false);
    if (options.usesAgents) {
      await createSession(options);
      emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At workspace" });
      assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
      assert.strictEqual(event?.text, "@workspace");
      assert.strictEqual(event?.waitingForInput, true);
      emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "slash" });
      assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
      assert.strictEqual(event?.text, "slash");
      assert.strictEqual(event?.waitingForInput, false);
      emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "slash fix" });
      assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
      assert.strictEqual(event?.text, "/fix");
      assert.strictEqual(event?.waitingForInput, true);
      emitter.fire({ status: SpeechToTextStatus.Recognized, text: "slash fix" });
      assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
      assert.strictEqual(event?.text, "/fix");
      assert.strictEqual(event?.waitingForInput, true);
      await createSession(options);
      emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At workspace" });
      assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
      assert.strictEqual(event?.text, "@workspace");
      assert.strictEqual(event?.waitingForInput, true);
      emitter.fire({ status: SpeechToTextStatus.Recognized, text: "slash fix" });
      assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
      assert.strictEqual(event?.text, "/fix");
      assert.strictEqual(event?.waitingForInput, true);
    }
  }
  test("waiting for input", async () => {
    await createSession({ usesAgents: true, model: {} });
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At workspace" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, "@workspace");
    assert.strictEqual(event.waitingForInput, true);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At workspace" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, "@workspace");
    assert.strictEqual(event.waitingForInput, true);
    await createSession({ usesAgents: true, model: {} });
    emitter.fire({ status: SpeechToTextStatus.Recognizing, text: "At workspace slash explain" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
    assert.strictEqual(event?.text, "@workspace /explain");
    assert.strictEqual(event.waitingForInput, true);
    emitter.fire({ status: SpeechToTextStatus.Recognized, text: "At workspace slash explain" });
    assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
    assert.strictEqual(event?.text, "@workspace /explain");
    assert.strictEqual(event.waitingForInput, true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcdm9pY2VDaGF0U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJU3BlZWNoUHJvdmlkZXIsIElTcGVlY2hTZXJ2aWNlLCBJU3BlZWNoVG9UZXh0RXZlbnQsIElTcGVlY2hUb1RleHRTZXNzaW9uLCBJVGV4dFRvU3BlZWNoU2Vzc2lvbiwgS2V5d29yZFJlY29nbml0aW9uU3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zcGVlY2gvY29tbW9uL3NwZWVjaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudCwgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnRDb21wbGV0aW9uSXRlbSwgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRIaXN0b3J5RW50cnksIElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiwgSUNoYXRBZ2VudE1ldGFkYXRhLCBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFJlc3VsdCwgSUNoYXRBZ2VudFNlcnZpY2UsIElDaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlciwgVXNlclNlbGVjdGVkVG9vbHMgfSBmcm9tICcuLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRGb2xsb3d1cCwgSUNoYXRQcm9ncmVzcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJVm9pY2VDaGF0U2Vzc2lvbk9wdGlvbnMsIElWb2ljZUNoYXRUZXh0RXZlbnQsIFZvaWNlQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdm9pY2VDaGF0U2VydmljZS5qcyc7XG5cbnN1aXRlKCdWb2ljZUNoYXQnLCAoKSA9PiB7XG5cblx0Y2xhc3MgVGVzdENoYXRBZ2VudENvbW1hbmQgaW1wbGVtZW50cyBJQ2hhdEFnZW50Q29tbWFuZCB7XG5cdFx0Y29uc3RydWN0b3IocmVhZG9ubHkgbmFtZTogc3RyaW5nLCByZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nKSB7IH1cblx0fVxuXG5cdGNsYXNzIFRlc3RDaGF0QWdlbnQgaW1wbGVtZW50cyBJQ2hhdEFnZW50IHtcblxuXHRcdGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyID0gbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXI7XG5cdFx0ZXh0ZW5zaW9uVmVyc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGV4dGVuc2lvblB1Ymxpc2hlciA9ICcnO1xuXHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lID0gJyc7XG5cdFx0ZXh0ZW5zaW9uUHVibGlzaGVySWQgPSAnJztcblx0XHRsb2NhdGlvbnM6IENoYXRBZ2VudExvY2F0aW9uW10gPSBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF07XG5cdFx0bW9kZXMgPSBbQ2hhdE1vZGVLaW5kLkFza107XG5cdFx0cHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRjb25zdHJ1Y3RvcihyZWFkb25seSBpZDogc3RyaW5nLCByZWFkb25seSBzbGFzaENvbW1hbmRzOiBJQ2hhdEFnZW50Q29tbWFuZFtdKSB7XG5cdFx0XHR0aGlzLm5hbWUgPSBpZDtcblx0XHR9XG5cdFx0ZnVsbE5hbWU/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0ZGVzY3JpcHRpb24/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0d2hlbj86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZT86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpc0RlZmF1bHQ/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGlzRHluYW1pYz86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0ZGlzYW1iaWd1YXRpb246IHsgY2F0ZWdvcnk6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZzsgZXhhbXBsZXM6IHN0cmluZ1tdIH1bXSA9IFtdO1xuXHRcdHByb3ZpZGVGb2xsb3d1cHM/KHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCByZXN1bHQ6IElDaGF0QWdlbnRSZXN1bHQsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEZvbGxvd3VwW10+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0XHR9XG5cdFx0c2V0UmVxdWVzdFRvb2xzKHJlcXVlc3RJZDogc3RyaW5nLCB0b29sczogVXNlclNlbGVjdGVkVG9vbHMpOiB2b2lkIHtcblx0XHR9XG5cdFx0c2V0WWllbGRSZXF1ZXN0ZWQocmVxdWVzdElkOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0fVxuXHRcdGludm9rZShyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCwgcHJvZ3Jlc3M6IChwYXJ0OiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0PiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdG1ldGFkYXRhID0ge307XG5cdH1cblxuXHRjb25zdCBhZ2VudHM6IElDaGF0QWdlbnRbXSA9IFtcblx0XHRuZXcgVGVzdENoYXRBZ2VudCgnd29ya3NwYWNlJywgW1xuXHRcdFx0bmV3IFRlc3RDaGF0QWdlbnRDb21tYW5kKCdmaXgnLCAnZml4JyksXG5cdFx0XHRuZXcgVGVzdENoYXRBZ2VudENvbW1hbmQoJ2V4cGxhaW4nLCAnZXhwbGFpbicpXG5cdFx0XSksXG5cdFx0bmV3IFRlc3RDaGF0QWdlbnQoJ3ZzY29kZScsIFtcblx0XHRcdG5ldyBUZXN0Q2hhdEFnZW50Q29tbWFuZCgnc2VhcmNoJywgJ3NlYXJjaCcpXG5cdFx0XSksXG5cdF07XG5cblx0Y2xhc3MgVGVzdENoYXRBZ2VudFNlcnZpY2UgaW1wbGVtZW50cyBJQ2hhdEFnZW50U2VydmljZSB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWdlbnRzID0gRXZlbnQuTm9uZTtcblx0XHRyZWFkb25seSBvbldpbGxJbnZva2VBZ2VudCA9IEV2ZW50Lk5vbmU7XG5cdFx0cmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKGlkOiBzdHJpbmcsIGFnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24pOiBJRGlzcG9zYWJsZSB7IHRocm93IG5ldyBFcnJvcigpOyB9XG5cdFx0cmVnaXN0ZXJEeW5hbWljQWdlbnQoZGF0YTogSUNoYXRBZ2VudERhdGEsIGFnZW50SW1wbDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uKTogSURpc3Bvc2FibGUgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRpbnZva2VBZ2VudChpZDogc3RyaW5nLCByZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCwgcHJvZ3Jlc3M6IChwYXJ0OiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0PiB7IHRocm93IG5ldyBFcnJvcigpOyB9XG5cdFx0c2V0UmVxdWVzdFRvb2xzKGFnZW50OiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nLCB0b29sczogVXNlclNlbGVjdGVkVG9vbHMpOiB2b2lkIHsgfVxuXHRcdHNldFlpZWxkUmVxdWVzdGVkKGFnZW50OiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nLCB2YWx1ZTogYm9vbGVhbik6IHZvaWQgeyB9XG5cdFx0Z2V0Rm9sbG93dXBzKGlkOiBzdHJpbmcsIHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCByZXN1bHQ6IElDaGF0QWdlbnRSZXN1bHQsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEZvbGxvd3VwW10+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH1cblx0XHRnZXRBY3RpdmF0ZWRBZ2VudHMoKTogSUNoYXRBZ2VudFtdIHsgcmV0dXJuIGFnZW50czsgfVxuXHRcdGdldEFnZW50cygpOiBJQ2hhdEFnZW50W10geyByZXR1cm4gYWdlbnRzOyB9XG5cdFx0Z2V0RGVmYXVsdEFnZW50KCk6IElDaGF0QWdlbnQgfCB1bmRlZmluZWQgeyB0aHJvdyBuZXcgRXJyb3IoKTsgfVxuXHRcdGdldENvbnRyaWJ1dGVkRGVmYXVsdEFnZW50KCk6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkIHsgdGhyb3cgbmV3IEVycm9yKCk7IH1cblx0XHRyZWdpc3RlckFnZW50KGlkOiBzdHJpbmcsIGRhdGE6IElDaGF0QWdlbnREYXRhKTogSURpc3Bvc2FibGUgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRnZXRBZ2VudChpZDogc3RyaW5nKTogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRnZXRBZ2VudHNCeU5hbWUobmFtZTogc3RyaW5nKTogSUNoYXRBZ2VudERhdGFbXSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdHVwZGF0ZUFnZW50KGlkOiBzdHJpbmcsIHVwZGF0ZU1ldGFkYXRhOiBJQ2hhdEFnZW50TWV0YWRhdGEpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0Z2V0QWdlbnRCeUZ1bGx5UXVhbGlmaWVkSWQoaWQ6IHN0cmluZyk6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0cmVnaXN0ZXJBZ2VudENvbXBsZXRpb25Qcm92aWRlcihpZDogc3RyaW5nLCBwcm92aWRlcjogKHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxJQ2hhdEFnZW50Q29tcGxldGlvbkl0ZW1bXT4pOiBJRGlzcG9zYWJsZSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdGdldEFnZW50Q29tcGxldGlvbkl0ZW1zKGlkOiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRBZ2VudENvbXBsZXRpb25JdGVtW10+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0YWdlbnRIYXNEdXBlTmFtZShpZDogc3RyaW5nKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdGdldENoYXRUaXRsZShpZDogc3RyaW5nLCBoaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5W10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdGdldENoYXRTdW1tYXJ5KGlkOiBzdHJpbmcsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0aGFzVG9vbHNBZ2VudDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdGhhc0NoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycygpOiBib29sZWFuIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0XHR9XG5cdFx0cmVnaXN0ZXJDaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcihoYW5kbGU6IG51bWJlciwgcHJvdmlkZXI6IElDaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0XHR9XG5cdFx0ZGV0ZWN0QWdlbnRPckNvbW1hbmQocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgb3B0aW9uczogeyBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24gfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGFnZW50OiBJQ2hhdEFnZW50RGF0YTsgY29tbWFuZD86IElDaGF0QWdlbnRDb21tYW5kIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBUZXN0U3BlZWNoU2VydmljZSBpbXBsZW1lbnRzIElTcGVlY2hTZXJ2aWNlIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0XHRvbkRpZENoYW5nZUhhc1NwZWVjaFByb3ZpZGVyID0gRXZlbnQuTm9uZTtcblxuXHRcdHJlYWRvbmx5IGhhc1NwZWVjaFByb3ZpZGVyID0gdHJ1ZTtcblx0XHRyZWFkb25seSBoYXNBY3RpdmVTcGVlY2hUb1RleHRTZXNzaW9uID0gZmFsc2U7XG5cdFx0cmVhZG9ubHkgaGFzQWN0aXZlVGV4dFRvU3BlZWNoU2Vzc2lvbiA9IGZhbHNlO1xuXHRcdHJlYWRvbmx5IGhhc0FjdGl2ZUtleXdvcmRSZWNvZ25pdGlvbiA9IGZhbHNlO1xuXG5cdFx0cmVnaXN0ZXJTcGVlY2hQcm92aWRlcihpZGVudGlmaWVyOiBzdHJpbmcsIHByb3ZpZGVyOiBJU3BlZWNoUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdG9uRGlkU3RhcnRTcGVlY2hUb1RleHRTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0XHRvbkRpZEVuZFNwZWVjaFRvVGV4dFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXG5cdFx0YXN5bmMgY3JlYXRlU3BlZWNoVG9UZXh0U2Vzc2lvbih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTcGVlY2hUb1RleHRTZXNzaW9uPiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRvbkRpZFN0YXJ0VGV4dFRvU3BlZWNoU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0b25EaWRFbmRUZXh0VG9TcGVlY2hTZXNzaW9uID0gRXZlbnQuTm9uZTtcblxuXHRcdGFzeW5jIGNyZWF0ZVRleHRUb1NwZWVjaFNlc3Npb24odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFRvU3BlZWNoU2Vzc2lvbj4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHN5bnRoZXNpemU6IGFzeW5jICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRvbkRpZFN0YXJ0S2V5d29yZFJlY29nbml0aW9uID0gRXZlbnQuTm9uZTtcblx0XHRvbkRpZEVuZEtleXdvcmRSZWNvZ25pdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0cmVjb2duaXplS2V5d29yZCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cz4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0fVxuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgZW1pdHRlcjogRW1pdHRlcjxJU3BlZWNoVG9UZXh0RXZlbnQ+O1xuXG5cdGxldCBzZXJ2aWNlOiBWb2ljZUNoYXRTZXJ2aWNlO1xuXHRsZXQgZXZlbnQ6IElWb2ljZUNoYXRUZXh0RXZlbnQgfCB1bmRlZmluZWQ7XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihvcHRpb25zOiBJVm9pY2VDaGF0U2Vzc2lvbk9wdGlvbnMpIHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlVm9pY2VDaGF0U2Vzc2lvbihjdHMudG9rZW4sIG9wdGlvbnMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0ZXZlbnQgPSBlO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRlbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTcGVlY2hUb1RleHRFdmVudD4oKSk7XG5cdFx0c2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVm9pY2VDaGF0U2VydmljZShuZXcgVGVzdFNwZWVjaFNlcnZpY2UoKSwgbmV3IFRlc3RDaGF0QWdlbnRTZXJ2aWNlKCksIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgYW5kIHNsYXNoIGNvbW1hbmQgZGV0ZWN0aW9uICh1c2VBZ2VudHM6IGZhbHNlKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0QWdlbnRzQW5kU2xhc2hDb21tYW5kc0RldGVjdGlvbih7IHVzZXNBZ2VudHM6IGZhbHNlLCBtb2RlbDoge30gYXMgSUNoYXRNb2RlbCB9KTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgYW5kIHNsYXNoIGNvbW1hbmQgZGV0ZWN0aW9uICh1c2VBZ2VudHM6IHRydWUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RBZ2VudHNBbmRTbGFzaENvbW1hbmRzRGV0ZWN0aW9uKHsgdXNlc0FnZW50czogdHJ1ZSwgbW9kZWw6IHt9IGFzIElDaGF0TW9kZWwgfSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RBZ2VudHNBbmRTbGFzaENvbW1hbmRzRGV0ZWN0aW9uKG9wdGlvbnM6IElWb2ljZUNoYXRTZXNzaW9uT3B0aW9ucykge1xuXG5cdFx0Ly8gTm90aGluZyB0byBkZXRlY3Rcblx0XHRhd2FpdCBjcmVhdGVTZXNzaW9uKG9wdGlvbnMpO1xuXG5cdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuU3RhcnRlZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlN0YXJ0ZWQpO1xuXG5cdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcsIHRleHQ6ICdIZWxsbycgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgdW5kZWZpbmVkKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nLCB0ZXh0OiAnSGVsbG8gV29ybGQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIHVuZGVmaW5lZCk7XG5cblx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkLCB0ZXh0OiAnSGVsbG8gV29ybGQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCAnSGVsbG8gV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEFnZW50XG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbihvcHRpb25zKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nLCB0ZXh0OiAnQXQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgJ0F0Jyk7XG5cblx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZywgdGV4dDogJ0F0IHdvcmtzcGFjZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCBvcHRpb25zLnVzZXNBZ2VudHMgPyAnQHdvcmtzcGFjZScgOiAnQXQgd29ya3NwYWNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIG9wdGlvbnMudXNlc0FnZW50cyk7XG5cblx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZywgdGV4dDogJ2F0IHdvcmtzcGFjZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCBvcHRpb25zLnVzZXNBZ2VudHMgPyAnQHdvcmtzcGFjZScgOiAnYXQgd29ya3NwYWNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIG9wdGlvbnMudXNlc0FnZW50cyk7XG5cblx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZywgdGV4dDogJ0F0IHdvcmtzcGFjZSBoZWxwJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnRleHQsIG9wdGlvbnMudXNlc0FnZW50cyA/ICdAd29ya3NwYWNlIGhlbHAnIDogJ0F0IHdvcmtzcGFjZSBoZWxwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIGZhbHNlKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQsIHRleHQ6ICdBdCB3b3Jrc3BhY2UgaGVscCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnRleHQsIG9wdGlvbnMudXNlc0FnZW50cyA/ICdAd29ya3NwYWNlIGhlbHAnIDogJ0F0IHdvcmtzcGFjZSBoZWxwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIGZhbHNlKTtcblxuXHRcdC8vIEFnZW50IHdpdGggcHVuY3R1YXRpb25cblx0XHRhd2FpdCBjcmVhdGVTZXNzaW9uKG9wdGlvbnMpO1xuXG5cdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcsIHRleHQ6ICdBdCB3b3Jrc3BhY2UsIGhlbHAnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgb3B0aW9ucy51c2VzQWdlbnRzID8gJ0B3b3Jrc3BhY2UgaGVscCcgOiAnQXQgd29ya3NwYWNlLCBoZWxwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIGZhbHNlKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQsIHRleHQ6ICdBdCB3b3Jrc3BhY2UsIGhlbHAnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCBvcHRpb25zLnVzZXNBZ2VudHMgPyAnQHdvcmtzcGFjZSBoZWxwJyA6ICdBdCB3b3Jrc3BhY2UsIGhlbHAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbihvcHRpb25zKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nLCB0ZXh0OiAnQXQgV29ya3NwYWNlLiBoZWxwJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnRleHQsIG9wdGlvbnMudXNlc0FnZW50cyA/ICdAd29ya3NwYWNlIGhlbHAnIDogJ0F0IFdvcmtzcGFjZS4gaGVscCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8ud2FpdGluZ0ZvcklucHV0LCBmYWxzZSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkLCB0ZXh0OiAnQXQgV29ya3NwYWNlLiBoZWxwJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgb3B0aW9ucy51c2VzQWdlbnRzID8gJ0B3b3Jrc3BhY2UgaGVscCcgOiAnQXQgV29ya3NwYWNlLiBoZWxwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIGZhbHNlKTtcblxuXHRcdC8vIFNsYXNoIENvbW1hbmRcblx0XHRhd2FpdCBjcmVhdGVTZXNzaW9uKG9wdGlvbnMpO1xuXG5cdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcsIHRleHQ6ICdTbGFzaCBmaXgnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgb3B0aW9ucy51c2VzQWdlbnRzID8gJ0B3b3Jrc3BhY2UgL2ZpeCcgOiAnL2ZpeCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8ud2FpdGluZ0ZvcklucHV0LCB0cnVlKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQsIHRleHQ6ICdTbGFzaCBmaXgnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCBvcHRpb25zLnVzZXNBZ2VudHMgPyAnQHdvcmtzcGFjZSAvZml4JyA6ICcvZml4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIHRydWUpO1xuXG5cdFx0Ly8gQWdlbnQgKyBTbGFzaCBDb21tYW5kXG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbihvcHRpb25zKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nLCB0ZXh0OiAnQXQgY29kZSBzbGFzaCBzZWFyY2ggaGVscCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCBvcHRpb25zLnVzZXNBZ2VudHMgPyAnQHZzY29kZSAvc2VhcmNoIGhlbHAnIDogJ0F0IGNvZGUgc2xhc2ggc2VhcmNoIGhlbHAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgZmFsc2UpO1xuXG5cdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCwgdGV4dDogJ0F0IGNvZGUgc2xhc2ggc2VhcmNoIGhlbHAnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCBvcHRpb25zLnVzZXNBZ2VudHMgPyAnQHZzY29kZSAvc2VhcmNoIGhlbHAnIDogJ0F0IGNvZGUgc2xhc2ggc2VhcmNoIGhlbHAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgZmFsc2UpO1xuXG5cdFx0Ly8gQWdlbnQgKyBTbGFzaCBDb21tYW5kIHdpdGggcHVuY3R1YXRpb25cblx0XHRhd2FpdCBjcmVhdGVTZXNzaW9uKG9wdGlvbnMpO1xuXG5cdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcsIHRleHQ6ICdBdCBjb2RlLCBzbGFzaCBzZWFyY2gsIGhlbHAnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgb3B0aW9ucy51c2VzQWdlbnRzID8gJ0B2c2NvZGUgL3NlYXJjaCBoZWxwJyA6ICdBdCBjb2RlLCBzbGFzaCBzZWFyY2gsIGhlbHAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgZmFsc2UpO1xuXG5cdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCwgdGV4dDogJ0F0IGNvZGUsIHNsYXNoIHNlYXJjaCwgaGVscCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnRleHQsIG9wdGlvbnMudXNlc0FnZW50cyA/ICdAdnNjb2RlIC9zZWFyY2ggaGVscCcgOiAnQXQgY29kZSwgc2xhc2ggc2VhcmNoLCBoZWxwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIGZhbHNlKTtcblxuXHRcdGF3YWl0IGNyZWF0ZVNlc3Npb24ob3B0aW9ucyk7XG5cblx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZywgdGV4dDogJ0F0IGNvZGUuIHNsYXNoLCBzZWFyY2ggaGVscCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCBvcHRpb25zLnVzZXNBZ2VudHMgPyAnQHZzY29kZSAvc2VhcmNoIGhlbHAnIDogJ0F0IGNvZGUuIHNsYXNoLCBzZWFyY2ggaGVscCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8ud2FpdGluZ0ZvcklucHV0LCBmYWxzZSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkLCB0ZXh0OiAnQXQgY29kZS4gc2xhc2ggc2VhcmNoLCBoZWxwJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgb3B0aW9ucy51c2VzQWdlbnRzID8gJ0B2c2NvZGUgL3NlYXJjaCBoZWxwJyA6ICdBdCBjb2RlLiBzbGFzaCBzZWFyY2gsIGhlbHAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgZmFsc2UpO1xuXG5cdFx0Ly8gQWdlbnQgbm90IGRldGVjdGVkIHR3aWNlXG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbihvcHRpb25zKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nLCB0ZXh0OiAnQXQgd29ya3NwYWNlLCBmb3IgYXQgd29ya3NwYWNlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnRleHQsIG9wdGlvbnMudXNlc0FnZW50cyA/ICdAd29ya3NwYWNlIGZvciBhdCB3b3Jrc3BhY2UnIDogJ0F0IHdvcmtzcGFjZSwgZm9yIGF0IHdvcmtzcGFjZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8ud2FpdGluZ0ZvcklucHV0LCBmYWxzZSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkLCB0ZXh0OiAnQXQgd29ya3NwYWNlLCBmb3IgYXQgd29ya3NwYWNlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgb3B0aW9ucy51c2VzQWdlbnRzID8gJ0B3b3Jrc3BhY2UgZm9yIGF0IHdvcmtzcGFjZScgOiAnQXQgd29ya3NwYWNlLCBmb3IgYXQgd29ya3NwYWNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIGZhbHNlKTtcblxuXHRcdC8vIFNsYXNoIGNvbW1hbmQgZGV0ZWN0ZWQgYWZ0ZXIgYWdlbnQgcmVjb2duaXplZFxuXHRcdGlmIChvcHRpb25zLnVzZXNBZ2VudHMpIHtcblx0XHRcdGF3YWl0IGNyZWF0ZVNlc3Npb24ob3B0aW9ucyk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQsIHRleHQ6ICdBdCB3b3Jrc3BhY2UnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgJ0B3b3Jrc3BhY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8ud2FpdGluZ0ZvcklucHV0LCB0cnVlKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcsIHRleHQ6ICdzbGFzaCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgJ3NsYXNoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgZmFsc2UpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZywgdGV4dDogJ3NsYXNoIGZpeCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgJy9maXgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8ud2FpdGluZ0ZvcklucHV0LCB0cnVlKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCwgdGV4dDogJ3NsYXNoIGZpeCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCAnL2ZpeCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py53YWl0aW5nRm9ySW5wdXQsIHRydWUpO1xuXG5cdFx0XHRhd2FpdCBjcmVhdGVTZXNzaW9uKG9wdGlvbnMpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkLCB0ZXh0OiAnQXQgd29ya3NwYWNlJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnRleHQsICdAd29ya3NwYWNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LndhaXRpbmdGb3JJbnB1dCwgdHJ1ZSk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQsIHRleHQ6ICdzbGFzaCBmaXgnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgJy9maXgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8ud2FpdGluZ0ZvcklucHV0LCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCd3YWl0aW5nIGZvciBpbnB1dCcsIGFzeW5jICgpID0+IHtcblxuXHRcdC8vIEFnZW50XG5cdFx0YXdhaXQgY3JlYXRlU2Vzc2lvbih7IHVzZXNBZ2VudHM6IHRydWUsIG1vZGVsOiB7fSBhcyBJQ2hhdE1vZGVsIH0pO1xuXG5cdFx0ZW1pdHRlci5maXJlKHsgc3RhdHVzOiBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcsIHRleHQ6ICdBdCB3b3Jrc3BhY2UnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgJ0B3b3Jrc3BhY2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQud2FpdGluZ0ZvcklucHV0LCB0cnVlKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQsIHRleHQ6ICdBdCB3b3Jrc3BhY2UnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py50ZXh0LCAnQHdvcmtzcGFjZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC53YWl0aW5nRm9ySW5wdXQsIHRydWUpO1xuXG5cdFx0Ly8gU2xhc2ggQ29tbWFuZFxuXHRcdGF3YWl0IGNyZWF0ZVNlc3Npb24oeyB1c2VzQWdlbnRzOiB0cnVlLCBtb2RlbDoge30gYXMgSUNoYXRNb2RlbCB9KTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nLCB0ZXh0OiAnQXQgd29ya3NwYWNlIHNsYXNoIGV4cGxhaW4nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8uc3RhdHVzLCBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudD8udGV4dCwgJ0B3b3Jrc3BhY2UgL2V4cGxhaW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQud2FpdGluZ0ZvcklucHV0LCB0cnVlKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSh7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQsIHRleHQ6ICdBdCB3b3Jrc3BhY2Ugc2xhc2ggZXhwbGFpbicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Py5zdGF0dXMsIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQ/LnRleHQsICdAd29ya3NwYWNlIC9leHBsYWluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LndhaXRpbmdGb3JJbnB1dCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLCtDQUErQztBQUV4RCxT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
