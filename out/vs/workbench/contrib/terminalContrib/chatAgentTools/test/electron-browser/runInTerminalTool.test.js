import { ok, strictEqual } from "assert";
import { Separator } from "../../../../../../base/common/actions.js";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { constObservable } from "../../../../../../base/common/observable.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isLinux, isWindows, OperatingSystem } from "../../../../../../base/common/platform.js";
import { count } from "../../../../../../base/common/strings.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ITreeSitterLibraryService } from "../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { IWorkspaceContextService, toWorkspaceFolder } from "../../../../../../platform/workspace/common/workspace.js";
import { Workspace } from "../../../../../../platform/workspace/test/common/testWorkspace.js";
import { IHistoryService } from "../../../../../services/history/common/history.js";
import { TreeSitterLibraryService } from "../../../../../services/treeSitter/browser/treeSitterLibraryService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { TestIPCFileSystemProvider } from "../../../../../test/electron-browser/workbenchTestServices.js";
import { TerminalToolConfirmationStorageKeys } from "../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js";
import { IChatService } from "../../../../chat/common/chatService/chatService.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from "../../../../chat/common/constants.js";
import { ChatModel } from "../../../../chat/common/model/chatModel.js";
import { LocalChatSessionUri } from "../../../../chat/common/model/chatUri.js";
import { ChatRequestTextPart } from "../../../../chat/common/requestParser/chatParserTypes.js";
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from "../../common/terminalSandboxService.js";
import { ILanguageModelToolsService, ToolDataSource, ToolSet } from "../../../../chat/common/tools/languageModelToolsService.js";
import { IToolResultCompressor } from "../../../../chat/common/tools/toolResultCompressor.js";
import { ITerminalChatService, ITerminalService } from "../../../../terminal/browser/terminal.js";
import { ITerminalProfileResolverService } from "../../../../terminal/common/terminal.js";
import { createRunInTerminalToolData, outputLooksBubblewrapHostRestricted, RunInTerminalTool, shouldAutomaticallyRetryAllowNetworkInSandboxed, shouldAutomaticallyRetryUnsandboxed } from "../../browser/tools/runInTerminalTool.js";
import { ShellIntegrationQuality } from "../../browser/toolTerminalCreator.js";
import { terminalChatAgentToolsConfiguration, TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
import { AgentNetworkDomainSettingId } from "../../../../../../platform/networkFilter/common/settings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../../../../../platform/sandbox/common/settings.js";
import { TerminalChatService } from "../../../chat/browser/terminalChatService.js";
import { IAgentSessionsService } from "../../../../chat/browser/agentSessions/agentSessionsService.js";
import { isDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ChatAgentToolsContribution } from "../../browser/terminal.chatAgentTools.contribution.js";
import { TerminalToolId } from "../../browser/tools/toolIds.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ILanguageModelsService } from "../../../../chat/common/languageModels.js";
import { IChatSessionsService } from "../../../../chat/common/chatSessionsService.js";
class TestRunInTerminalTool extends RunInTerminalTool {
  constructor() {
    super(...arguments);
    this._osBackend = Promise.resolve(OperatingSystem.Windows);
  }
  get sessionTerminalAssociations() {
    return this._sessionTerminalAssociations;
  }
  get sessionTerminalInstances() {
    return this._sessionTerminalInstances;
  }
  get profileFetcher() {
    return this._profileFetcher;
  }
  get commandLinePresenters() {
    return this["_commandLinePresenters"];
  }
  getBubblewrapHostRestrictedResult() {
    return this["_getBubblewrapHostRestrictedResult"]();
  }
  disableProcessIdAssociation() {
    this["_setupProcessIdAssociation"] = async () => {
    };
  }
  setBackendOs(os) {
    this._osBackend = Promise.resolve(os);
  }
}
suite("RunInTerminalTool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let fileService;
  let storageService;
  let workspaceContextService;
  let terminalServiceDisposeEmitter;
  let chatServiceDisposeEmitter;
  let chatSessionArchivedEmitter;
  let capturedSteeringRequests;
  let sandboxEnabled;
  let sandboxPrereqResult;
  let terminalSandboxService;
  let createdTerminalInstance;
  let createTerminalCallCount;
  let chatSessions;
  let chatSessionContribution;
  let runInTerminalTool;
  function isDefaultChatPermissionSandboxPrecheckInputs(precheckInputs) {
    return precheckInputs?.isDefaultApprovalPermissionEnabled !== false;
  }
  setup(() => {
    configurationService = new TestConfigurationService();
    workspaceContextService = new TestContextService();
    const logService = new NullLogService();
    fileService = store.add(new FileService(logService));
    const fileSystemProvider = new TestIPCFileSystemProvider();
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
    setConfig(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, "outsideWorkspace");
    setConfig(TerminalChatAgentToolsSettingId.TerminalProfileLinux, Object.freeze({ path: "bash" }));
    setConfig(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
    setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
    setConfig(AgentSandboxSettingId.AgentSandboxAllowAutoApprove, false);
    sandboxEnabled = false;
    sandboxPrereqResult = {
      enabled: false,
      sandboxConfigPath: void 0,
      failedCheck: void 0
    };
    const commandFinishedEmitter = new Emitter();
    const onDisposedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const onDidAddCapabilityEmitter = new Emitter();
    const onDidInputDataEmitter = new Emitter();
    const onDataEmitter = new Emitter();
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      getContentsAsText: () => "",
      raw: {
        onData: onDataEmitter.event,
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: Event.None
        }
      }
    };
    createTerminalCallCount = 0;
    createdTerminalInstance = {
      instanceId: 1,
      processId: 1,
      processReady: Promise.resolve(),
      xtermReadyPromise: Promise.resolve(xterm),
      onData: onDataEmitter.event,
      onExit: onExitEmitter.event,
      sendText: async (_text) => {
        queueMicrotask(() => {
          onDataEmitter.fire("\x1B]633;C\x07\x1B]633;A\x07");
          commandFinishedEmitter.fire({ exitCode: 0, getOutput: () => "" });
        });
      },
      focus: () => {
      },
      capabilities: {
        get: (cap) => {
          if (cap === TerminalCapability.CommandDetection) {
            return {
              commands: [],
              onCommandFinished: commandFinishedEmitter.event
            };
          }
          return void 0;
        },
        onDidAddCapability: onDidAddCapabilityEmitter.event
      },
      onDidInputData: onDidInputDataEmitter.event,
      onDisposed: onDisposedEmitter.event,
      dispose: () => {
        onExitEmitter.fire(0);
        onDisposedEmitter.fire(createdTerminalInstance);
      },
      getCwdResource: async () => void 0,
      isDisposed: false
    };
    terminalServiceDisposeEmitter = new Emitter();
    chatServiceDisposeEmitter = new Emitter();
    chatSessionArchivedEmitter = new Emitter();
    capturedSteeringRequests = [];
    chatSessions = /* @__PURE__ */ new Map();
    chatSessionContribution = void 0;
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService,
      fileService: () => fileService
    }, store);
    const chatServiceStub = {
      onDidDisposeSession: chatServiceDisposeEmitter.event,
      getSession: (sessionResource) => chatSessions.get(sessionResource.toString()),
      sendRequest: async (sessionResource, message, options) => {
        capturedSteeringRequests.push({ sessionResource, message, options });
        return { kind: "rejected", reason: "test" };
      },
      acquireExistingSession: () => ({
        object: {
          lastRequest: void 0,
          lastRequestObs: constObservable(void 0),
          onDidChange: Event.None
        },
        dispose: () => {
        }
      })
    };
    instantiationService.stub(IChatService, chatServiceStub);
    instantiationService.stub(IAgentSessionsService, {
      onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
      model: {
        onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event
      }
    });
    instantiationService.stub(IChatSessionsService, {
      getChatSessionContribution: () => chatSessionContribution
    });
    instantiationService.stub(ITerminalService, {
      createTerminal: async () => {
        createTerminalCallCount++;
        return createdTerminalInstance;
      },
      foregroundInstances: [],
      createOnInstanceCapabilityEvent: () => ({ event: Event.None, dispose: () => {
      } }),
      onDidDisposeInstance: terminalServiceDisposeEmitter.event,
      onDidChangeInstances: Event.None,
      revealTerminal: async () => {
      },
      setActiveInstance: () => {
      },
      setNextCommandId: async () => {
      }
    });
    instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
    instantiationService.stub(IWorkspaceContextService, workspaceContextService);
    instantiationService.stub(IHistoryService, {
      getLastActiveWorkspaceRoot: () => void 0
    });
    terminalSandboxService = {
      _serviceBrand: void 0,
      isEnabled: async (precheckInputs) => sandboxEnabled && isDefaultChatPermissionSandboxPrecheckInputs(precheckInputs),
      isSandboxAllowNetworkEnabled: async () => false,
      wrapCommand: async (command, requestUnsandboxedExecution) => ({
        command: requestUnsandboxedExecution ? `unsandboxed:${command}` : `sandbox:${command}`,
        isSandboxWrapped: !requestUnsandboxedExecution
      }),
      checkFileAccess: async () => ({ allowed: true, denied: [] }),
      getSandboxConfigPath: async () => sandboxEnabled ? "/tmp/sandbox.json" : void 0,
      checkForSandboxingPrereqs: async (_forceRefresh, precheckInputs) => isDefaultChatPermissionSandboxPrecheckInputs(precheckInputs) ? sandboxPrereqResult : { enabled: false, sandboxConfigPath: void 0, failedCheck: void 0 },
      getTempDir: () => void 0,
      setNeedsForceUpdateConfigFile: () => {
      },
      getOS: async () => OperatingSystem.Linux,
      getResolvedNetworkDomains: () => ({ allowedDomains: [], deniedDomains: [] }),
      getMissingSandboxDependencies: async () => [],
      installMissingSandboxDependencies: async (missingDependencies, _sessionResource, _token, options) => {
        const terminal = await options.createTerminal();
        await options.focusTerminal(terminal);
        await terminal.sendText(`sudo apt install -y ${missingDependencies.join(" ")}`, true);
        return { exitCode: 0 };
      },
      runSandboxRemediation: async () => ({ exitCode: 0 })
    };
    instantiationService.stub(ITerminalSandboxService, terminalSandboxService);
    const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
    treeSitterLibraryService.isTest = true;
    instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);
    instantiationService.stub(ILanguageModelToolsService, {
      getTools() {
        return [];
      }
    });
    instantiationService.stub(ILanguageModelsService, {
      selectLanguageModels: async () => ["copilot/copilot-utility-small"]
    });
    instantiationService.stub(ITerminalProfileResolverService, {
      getDefaultProfile: async () => ({ path: "bash" })
    });
    storageService = instantiationService.get(IStorageService);
    storageService.store(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, true, StorageScope.APPLICATION, StorageTarget.USER);
    runInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
  });
  function setAutoApprove(value) {
    setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
  }
  function setConfig(key, value) {
    configurationService.setUserConfiguration(key, value);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: () => true,
      affectedKeys: /* @__PURE__ */ new Set([key]),
      source: ConfigurationTarget.USER,
      change: null
    });
  }
  function clearAutoApproveWarningAcceptedState() {
    storageService.remove(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION);
  }
  async function executeToolTest(params) {
    const context = {
      parameters: {
        command: "echo hello",
        explanation: "Print hello to the console",
        goal: "Print hello",
        ...params
      }
    };
    const result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
    return result;
  }
  async function invokeToolTest(params, selectedCustomButton) {
    const parameters = {
      command: "echo hello",
      explanation: "Print hello to the console",
      goal: "Print hello",
      ...params
    };
    const preparedInvocation = await runInTerminalTool.prepareToolInvocation({ parameters }, CancellationToken.None);
    ok(preparedInvocation?.toolSpecificData, "Expected toolSpecificData to be defined");
    const countTokens = async () => 0;
    const noProgress = { report() {
    } };
    return runInTerminalTool.invoke({
      callId: "test-call",
      toolId: TerminalToolId.RunInTerminal,
      parameters,
      context: { sessionResource: LocalChatSessionUri.forSession("run-in-terminal-test") },
      toolSpecificData: preparedInvocation.toolSpecificData,
      selectedCustomButton
    }, countTokens, noProgress, CancellationToken.None);
  }
  function isSeparator(action) {
    return action instanceof Separator;
  }
  function assertAutoApproved(preparedInvocation) {
    ok(preparedInvocation, "Expected prepared invocation to be defined");
    ok(!preparedInvocation.confirmationMessages, "Expected no confirmation messages for auto-approved command");
  }
  function assertConfirmationRequired(preparedInvocation, expectedTitle) {
    ok(preparedInvocation, "Expected prepared invocation to be defined");
    ok(preparedInvocation.confirmationMessages, "Expected confirmation messages for non-approved command");
    if (expectedTitle) {
      strictEqual(preparedInvocation.confirmationMessages.title, expectedTitle);
    }
  }
  function createChatModeInfo(permissionLevel) {
    return {
      kind: void 0,
      isBuiltin: true,
      modeInstructions: void 0,
      telemetryModeId: "agent",
      applyCodeBlockSuggestionId: void 0,
      permissionLevel
    };
  }
  function createChatModelWithRequest(sessionResource, modeInfo, requestId) {
    const model = store.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const text = "retry";
    model.addRequest({ text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, text.length, 1, text.length), text)] }, { variables: [] }, 0, modeInfo, void 0, void 0, void 0, void 0, void 0, void 0, void 0, void 0, requestId);
    chatSessions.set(sessionResource.toString(), model);
    return model;
  }
  function confirmAutomaticSandboxRetry(tool, retryKind, sessionResource, command, shell, blockedDomains) {
    return tool["_confirmAutomaticSandboxRetry"](retryKind, sessionResource, command, shell, blockedDomains, void 0, CancellationToken.None);
  }
  function confirmAutomaticUnsandboxRetry(tool, sessionResource, command, shell, blockedDomains) {
    return confirmAutomaticSandboxRetry(tool, "unsandboxed", sessionResource, command, shell, blockedDomains);
  }
  function confirmAutomaticAllowNetworkRetry(tool, sessionResource, command, shell, blockedDomains) {
    return confirmAutomaticSandboxRetry(tool, "allowNetwork", sessionResource, command, shell, blockedDomains);
  }
  async function assertAutomaticUnsandboxRetryElicitation(tool, sessionResource, command, shell, blockedDomains) {
    const model = createChatModelWithRequest(sessionResource);
    const shouldRetry = confirmAutomaticUnsandboxRetry(tool, sessionResource, command, shell, blockedDomains);
    const request = model.getRequests().at(-1);
    const response = request?.response;
    ok(response, "Expected chat request with response");
    const elicitation = response.response.value.find((part) => part.kind === "elicitation2");
    ok(elicitation?.kind === "elicitation2", "Expected automatic unsandbox retry elicitation");
    const reject = elicitation.reject;
    ok(reject, "Expected automatic unsandbox retry elicitation to have a reject action");
    await reject();
    strictEqual(await shouldRetry, false);
  }
  async function assertAutomaticAllowNetworkRetryElicitation(tool, sessionResource, command, shell, blockedDomains, expectedTitle) {
    const model = createChatModelWithRequest(sessionResource);
    const shouldRetry = confirmAutomaticAllowNetworkRetry(tool, sessionResource, command, shell, blockedDomains);
    const request = model.getRequests().at(-1);
    const response = request?.response;
    ok(response, "Expected chat request with response");
    const elicitation = response.response.value.find((part) => part.kind === "elicitation2");
    ok(elicitation?.kind === "elicitation2", "Expected automatic allow-network retry elicitation");
    const title = elicitation.title;
    ok(typeof title !== "string", "Expected automatic allow-network retry title to be markdown");
    strictEqual(title.value, expectedTitle);
    const reject = elicitation.reject;
    ok(reject, "Expected automatic allow-network retry elicitation to have a reject action");
    await reject();
    strictEqual(await shouldRetry, false);
  }
  function getAutomaticSandboxRetryTitle(tool, retryKind, shellType, blockedDomains) {
    return tool["_getAutomaticSandboxRetryTitle"](retryKind, shellType, blockedDomains);
  }
  function getAutomaticUnsandboxRetryTitle(tool, shellType, blockedDomains) {
    return getAutomaticSandboxRetryTitle(tool, "unsandboxed", shellType, blockedDomains);
  }
  function getAutomaticAllowNetworkRetryTitle(tool, shellType, blockedDomains) {
    return getAutomaticSandboxRetryTitle(tool, "allowNetwork", shellType, blockedDomains);
  }
  suite("sandbox invocation messaging", () => {
    test("should instruct models to use $TMPDIR instead of /tmp when sandboxed", async () => {
      sandboxEnabled = true;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      ok(toolData.modelDescription?.includes("Use $TMPDIR for temporary files"), "Expected sandboxed tool description to require $TMPDIR usage");
      ok(toolData.modelDescription?.includes("/tmp may not be writable"), "Expected sandboxed tool description to discourage /tmp usage");
    });
    test("should include sandbox escalation requests in schema when sandbox is enabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const properties = toolData.inputSchema?.properties;
      const requestUnsandboxedExecutionProperty = properties?.["requestUnsandboxedExecution"];
      const requestUnsandboxedExecutionReasonProperty = properties?.["requestUnsandboxedExecutionReason"];
      const requestAllowNetworkProperty = properties?.["requestAllowNetwork"];
      const requestAllowNetworkReasonProperty = properties?.["requestAllowNetworkReason"];
      const requestFileValidationCheckProperty = properties?.["requestFileValidationCheck"];
      const requestFileValidationCheckReasonProperty = properties?.["requestFileValidationCheckReason"];
      ok(properties?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution in schema when sandbox is enabled");
      ok(properties?.["requestUnsandboxedExecutionReason"], "Expected requestUnsandboxedExecutionReason in schema when sandbox is enabled");
      ok(properties?.["requestAllowNetwork"], "Expected requestAllowNetwork in schema when sandbox is enabled");
      ok(properties?.["requestAllowNetworkReason"], "Expected requestAllowNetworkReason in schema when sandbox is enabled");
      ok(properties?.["requestFileValidationCheck"], "Expected requestFileValidationCheck in schema when sandbox is enabled");
      ok(properties?.["requestFileValidationCheckReason"], "Expected requestFileValidationCheckReason in schema when sandbox is enabled");
      ok(requestUnsandboxedExecutionProperty?.description?.includes("Only set this when the command clearly needs unsandboxed access"), "Expected schema description to require a clear need for unsandboxed access");
      ok(requestUnsandboxedExecutionReasonProperty?.description?.includes("why this command must run outside the terminal sandbox"), "Expected reason schema description to require concrete sandbox justification");
      ok(requestAllowNetworkProperty?.description?.includes("remain in the terminal sandbox but run with unrestricted network access"), "Expected network schema description to retain sandboxing");
      ok(requestAllowNetworkReasonProperty?.description?.includes("needs unrestricted network access"), "Expected network reason schema description to request justification");
      strictEqual(requestFileValidationCheckProperty?.type, "array", "Expected file validation schema to accept file paths");
      strictEqual(requestFileValidationCheckProperty?.items?.type, "string", "Expected file validation paths to be strings");
      ok(requestFileValidationCheckProperty?.description?.includes("before running the command"), "Expected file validation schema description to describe pre-execution access checks");
      ok(requestFileValidationCheckReasonProperty?.description?.includes("these file paths"), "Expected file validation reason schema description to request justification");
    });
    test("should omit unsandboxed execution requests from schema when unsandboxed commands are disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, false);
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const properties = toolData.inputSchema?.properties;
      ok(!properties?.["requestUnsandboxedExecution"], "Expected no requestUnsandboxedExecution in schema when unsandboxed commands are disabled");
      ok(!properties?.["requestUnsandboxedExecutionReason"], "Expected no requestUnsandboxedExecutionReason in schema when unsandboxed commands are disabled");
      ok(properties?.["requestAllowNetwork"], "Expected requestAllowNetwork to remain in schema when per-command network access is enabled");
      ok(properties?.["requestAllowNetworkReason"], "Expected requestAllowNetworkReason to remain in schema when per-command network access is enabled");
      ok(toolData.modelDescription?.includes("Running commands outside the sandbox is disabled"), "Expected model description to explain that unsandboxed commands are disabled");
    });
    test("should not recommend allow-network requests in model description when per-command network access is disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);
      sandboxEnabled = true;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const properties = toolData.inputSchema?.properties;
      ok(!properties?.["requestAllowNetwork"], "Expected no requestAllowNetwork in schema when per-command network access is disabled");
      ok(!properties?.["requestAllowNetworkReason"], "Expected no requestAllowNetworkReason in schema when per-command network access is disabled");
      ok(!toolData.modelDescription?.includes("requestAllowNetwork=true"), "Expected model description not to recommend allow-network requests when per-command network access is disabled");
    });
    test("should not include requestUnsandboxedExecution in schema when sandbox is disabled", async () => {
      sandboxEnabled = false;
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const properties = toolData.inputSchema?.properties;
      ok(!properties?.["allowToRunUnsandboxedCommands"], "Expected no allowToRunUnsandboxedCommands when sandbox is disabled");
      ok(!properties?.["requestUnsandboxedExecution"], "Expected no requestUnsandboxedExecution in schema when sandbox is disabled");
      ok(!properties?.["requestUnsandboxedExecutionReason"], "Expected no requestUnsandboxedExecutionReason in schema when sandbox is disabled");
      ok(!properties?.["requestAllowNetwork"], "Expected no requestAllowNetwork in schema when sandbox is disabled");
      ok(!properties?.["requestAllowNetworkReason"], "Expected no requestAllowNetworkReason in schema when sandbox is disabled");
      ok(!properties?.["requestFileValidationCheck"], "Expected no requestFileValidationCheck when sandbox is disabled");
      ok(!properties?.["requestFileValidationCheckReason"], "Expected no requestFileValidationCheckReason when sandbox is disabled");
    });
    test("should reflect sandbox setting changes in tool data", async () => {
      sandboxEnabled = false;
      const toolDataBefore = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const propertiesBefore = toolDataBefore.inputSchema?.properties;
      ok(!propertiesBefore?.["requestUnsandboxedExecution"], "Expected no requestUnsandboxedExecution before enabling sandbox");
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      const toolDataAfter = await instantiationService.invokeFunction(createRunInTerminalToolData);
      const propertiesAfter = toolDataAfter.inputSchema?.properties;
      ok(propertiesAfter?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution after enabling sandbox");
      ok(toolDataAfter.modelDescription?.includes("Sandboxing:"), "Expected sandbox instructions in description after enabling sandbox");
    });
    test("should show confirmation to install missing sandbox dependencies when prereq check fails", async () => {
      sandboxEnabled = false;
      sandboxPrereqResult = {
        enabled: false,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
        missingDependencies: ["bubblewrap"],
        canInstallMissingDependencies: true
      };
      const result = await executeToolTest({
        command: "echo hello",
        explanation: "Print hello",
        goal: "Print hello"
      });
      ok(result, "Expected prepared invocation to be defined");
      ok(result?.confirmationMessages, "Expected confirmationMessages when deps are missing");
      ok(result?.confirmationMessages?.customOptions?.length === 2, "Expected two custom options");
      strictEqual(result?.toolSpecificData?.missingSandboxDependencies?.length, 1);
    });
    test("should request manual installation when no supported package manager is available", async () => {
      sandboxEnabled = false;
      sandboxPrereqResult = {
        enabled: false,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
        missingDependencies: ["bubblewrap"],
        canInstallMissingDependencies: false
      };
      const prepared = await executeToolTest({ command: "echo hello" });
      const result = await invokeToolTest({ command: "echo hello" });
      strictEqual(prepared?.confirmationMessages?.customOptions, void 0);
      ok(result.content[0].value?.includes("system package manager"));
      strictEqual(createTerminalCallCount, 0);
    });
    test("should automatically schedule AppArmor remediation without a repair prompt", async () => {
      setAutoApprove({ echo: true });
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
        remediations: [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]
      };
      const result = await executeToolTest({ command: "echo hello" });
      const terminalData = result?.toolSpecificData;
      strictEqual(result?.confirmationMessages, void 0, "Expected no repair confirmation");
      strictEqual(terminalData?.sandboxRemediations?.length, 1, "Expected one repair option in terminal invocation data");
      strictEqual(terminalData?.missingSandboxDependencies, void 0, "Should not classify unusable bubblewrap as missing");
    });
    test("should recheck bubblewrap after dependency installation and not execute when it remains unavailable", async () => {
      let forceRefreshCalled = false;
      terminalSandboxService.checkForSandboxingPrereqs = async (forceRefresh) => {
        if (forceRefresh) {
          forceRefreshCalled = true;
          return {
            enabled: true,
            sandboxConfigPath: "/tmp/sandbox.json",
            failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
            remediations: [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]
          };
        }
        return {
          enabled: true,
          sandboxConfigPath: "/tmp/sandbox.json",
          failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
          missingDependencies: ["bubblewrap"],
          canInstallMissingDependencies: true
        };
      };
      const result = await invokeToolTest({ command: "echo hello" }, "install");
      strictEqual(forceRefreshCalled, true, "Expected dependency installation to force a new prerequisite check");
      strictEqual(createTerminalCallCount, 1, "Expected only the installation terminal, not original command execution");
      ok(result.content[0].value?.includes("bubblewrap"), "Expected result to identify the failed bubblewrap verification");
    });
    test("should suggest reloading and retrying if the issue persists after sandbox dependency installation", async () => {
      terminalSandboxService.checkForSandboxingPrereqs = async (forceRefresh) => forceRefresh ? {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      } : {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
        missingDependencies: ["bubblewrap", "socat"],
        canInstallMissingDependencies: true
      };
      const result = await invokeToolTest({ command: "echo hello" }, "install");
      strictEqual(createTerminalCallCount, 1, "Expected only the installation terminal, not original command execution");
      ok(result.content[0].value?.includes("If the issue persists, reload the window and try running the command again"), "Expected conditional reload and retry guidance");
    });
    test("should automatically repair AppArmor, probe again, and execute", async () => {
      runInTerminalTool.disableProcessIdAssociation();
      let forceRefreshCalled = false;
      terminalSandboxService.checkForSandboxingPrereqs = async (forceRefresh) => {
        forceRefreshCalled ||= forceRefresh === true;
        return forceRefresh ? {
          enabled: true,
          sandboxConfigPath: "/tmp/sandbox.json",
          failedCheck: void 0
        } : {
          enabled: true,
          sandboxConfigPath: "/tmp/sandbox.json",
          failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
          remediations: [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]
        };
      };
      let remediationCalled = false;
      terminalSandboxService.runSandboxRemediation = async () => {
        remediationCalled = true;
        return { exitCode: 0 };
      };
      const result = await invokeToolTest({ command: "echo hello" });
      createdTerminalInstance.dispose();
      strictEqual(remediationCalled, true);
      strictEqual(forceRefreshCalled, true, "Expected a probe after AppArmor remediation");
      strictEqual(createTerminalCallCount, 1, "Expected the original command to execute");
      ok(result.content.length > 0);
    });
    test("should report sandboxing unsupported when bubblewrap repair execution fails or is indeterminate", async () => {
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
        remediations: [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]
      };
      let previousMessage;
      for (const exitCode of [1, void 0]) {
        terminalSandboxService.runSandboxRemediation = async () => ({ exitCode });
        const result = await invokeToolTest({ command: "echo hello" });
        strictEqual(createTerminalCallCount, 0, "Expected the original command not to execute");
        const message = result.content[0].value ?? "";
        ok(message.includes("Sandboxing is not supported in this environment"), "Expected unsupported environment guidance after repair execution failure");
        ok(message.includes("chat.agent.sandbox.enabled"), "Expected guidance to identify the sandbox setting");
        if (previousMessage !== void 0) {
          strictEqual(message, previousMessage, "Expected the same message irrespective of the remediation exit code");
        }
        previousMessage = message;
        ok(typeof result.toolResultMessage !== "string" && result.toolResultMessage?.value.includes("command:workbench.action.openSettings"), "Expected a settings command link in the user-facing message");
      }
    });
    test("should not execute when bubblewrap is unusable and no supported remediation is available", async () => {
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap
      };
      const result = await invokeToolTest({ command: "echo hello" });
      strictEqual(createTerminalCallCount, 0, "Expected no terminal execution for unusable bubblewrap");
      ok(result.content[0].value?.includes("Bubblewrap"), "Expected a bubblewrap capability failure message");
    });
    test("should include allowed and denied network domains in model description", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      terminalSandboxService.getResolvedNetworkDomains = () => ({
        allowedDomains: ["github.com", "npmjs.org"],
        deniedDomains: ["evil.com"]
      });
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      ok(toolData.modelDescription?.includes("github.com, npmjs.org"), "Expected allowed domains in description");
      ok(toolData.modelDescription?.includes("evil.com"), "Expected denied domains in description");
      ok(toolData.modelDescription?.includes("requestAllowNetwork=true"), "Expected model description to recommend network-enabled sandbox execution first");
      ok(toolData.modelDescription?.includes("reactively after a network failure"), "Expected model description to allow reactive allow-network requests after a sandbox network failure");
      ok(toolData.modelDescription?.includes("HTTP code 403"), "Expected model description to contain HTTP code 403 as evidence of blocked network access");
    });
    test("should exclude denied domains from effective allowed list", async () => {
      sandboxEnabled = true;
      terminalSandboxService.getResolvedNetworkDomains = () => ({
        allowedDomains: ["github.com", "evil.com", "npmjs.org"],
        deniedDomains: ["evil.com"]
      });
      const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
      ok(toolData.modelDescription?.includes("github.com, npmjs.org"), "Expected effective allowed list without denied domain");
      ok(!toolData.modelDescription?.includes("accessible in the sandbox (all other network access is blocked): github.com, evil.com"), "Expected denied domain removed from allowed list");
    });
    test("should use sandbox labels when command is sandbox wrapped", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      terminalSandboxService.wrapCommand = async (command) => ({
        command: `sandbox-runtime ${command}`,
        isSandboxWrapped: true
      });
      const preparedInvocation = await executeToolTest({ command: "echo hello" });
      ok(preparedInvocation, "Expected prepared invocation to be defined");
      strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello` in sandbox");
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
    });
    test("should enable sandboxing when chat permission level is default", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      const sessionResource = LocalChatSessionUri.forSession("sandbox-default-permission-session");
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.Default } } })),
        lastFocusedWidget: void 0
      });
      const defaultPermissionTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const preparedInvocation = await defaultPermissionTool.prepareToolInvocation({
        parameters: {
          command: "echo hello",
          explanation: "Print hello",
          goal: "Print hello",
          mode: "sync"
        },
        chatSessionResource: sessionResource
      }, CancellationToken.None);
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
      strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello` in sandbox");
    });
    test("should disable sandboxing when chat permission level is elevated", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      const originalWrapCommand = terminalSandboxService.wrapCommand.bind(terminalSandboxService);
      for (const permissionLevel of [ChatPermissionLevel.AutoApprove, ChatPermissionLevel.Autopilot]) {
        let wrapCalls = 0;
        terminalSandboxService.wrapCommand = async (...args) => {
          wrapCalls++;
          return originalWrapCommand(...args);
        };
        const sessionResource = LocalChatSessionUri.forSession(`sandbox-${permissionLevel}-permission-session`);
        instantiationService.stub(IChatWidgetService, {
          getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel } } })),
          lastFocusedWidget: void 0
        });
        const elevatedPermissionTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
        const preparedInvocation = await elevatedPermissionTool.prepareToolInvocation({
          parameters: {
            command: "echo hello",
            explanation: "Print hello",
            goal: "Print hello",
            mode: "sync"
          },
          chatSessionResource: sessionResource
        }, CancellationToken.None);
        const terminalData = preparedInvocation.toolSpecificData;
        strictEqual(terminalData.commandLine.isSandboxWrapped, false, `Expected no sandbox wrapping for ${permissionLevel}`);
        strictEqual(terminalData.requestUnsandboxedExecution, false, `Expected no unsandbox confirmation for ${permissionLevel}`);
        strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello`");
        strictEqual(wrapCalls, 0, `Expected sandbox wrapping to be skipped for ${permissionLevel}`);
        terminalSandboxService.wrapCommand = originalWrapCommand;
      }
    });
    test("should use request permission level before current widget permission level", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      const sessionResource = LocalChatSessionUri.forSession("sandbox-request-permission-session");
      const requestId = "sandbox-request-permission-request";
      createChatModelWithRequest(sessionResource, createChatModeInfo(ChatPermissionLevel.AutoApprove), requestId);
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.Default } } })),
        lastFocusedWidget: void 0
      });
      const requestPermissionTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const preparedInvocation = await requestPermissionTool.prepareToolInvocation({
        parameters: {
          command: "echo hello",
          explanation: "Print hello",
          goal: "Print hello",
          mode: "sync"
        },
        chatSessionResource: sessionResource,
        chatRequestId: requestId
      }, CancellationToken.None);
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, false);
      strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello`");
    });
    test("should not show sandbox wrapper in chat when sandboxed async command is detached", async () => {
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      setConfig(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, true);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      terminalSandboxService.wrapCommand = async (command) => ({
        command: `sandbox-runtime ${command}`,
        isSandboxWrapped: true
      });
      const preparedInvocation = await executeToolTest({ command: "echo hello", mode: "async" });
      ok(preparedInvocation, "Expected prepared invocation to be defined");
      strictEqual(preparedInvocation.invocationMessage.value, "Running `echo hello` in sandbox");
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.forDisplay, "echo hello");
      strictEqual(terminalData.commandLine.toolEdited, "nohup sandbox-runtime echo hello & disown");
    });
  });
  suite("automatic sandbox retry", () => {
    const baseRetryOptions = {
      allowUnsandboxedCommands: true,
      didSandboxWrapCommand: true,
      requestUnsandboxedExecution: false,
      isPersistentSession: false,
      isBackgroundExecution: false,
      didTimeout: false,
      exitCode: 1,
      output: "/bin/bash: /workspace/out.txt: Operation not permitted"
    };
    const baseAllowNetworkRetryOptions = {
      retryWithAllowNetworkRequests: true,
      didSandboxWrapCommand: true,
      requestUnsandboxedExecution: false,
      requestAllowNetwork: false,
      isPersistentSession: false,
      isBackgroundExecution: false,
      didTimeout: false,
      exitCode: 1,
      output: "connect: Operation not permitted"
    };
    test("should retry completed foreground sandbox commands when output indicates sandbox block", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed(baseRetryOptions), true);
    });
    test("should detect bubblewrap host restrictions across wrapped output lines", () => {
      strictEqual(outputLooksBubblewrapHostRestricted("bwrap: No permissions to create new\nnamespace"), true);
      strictEqual(outputLooksBubblewrapHostRestricted("bwrap: failed to bind mount"), false);
    });
    test("should direct the user to disable sandboxing when bubblewrap is restricted by the host", () => {
      const result = runInTerminalTool.getBubblewrapHostRestrictedResult();
      const message = result.content[0].value;
      ok(message?.includes(AgentSandboxSettingId.AgentSandboxEnabled));
      ok(message?.includes("Sandboxing can be disabled by setting"));
      strictEqual(result.toolResultMessage, message);
    });
    test("should not retry when unsandboxed commands are disabled", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        allowUnsandboxedCommands: false
      }), false);
    });
    test("should not retry when the command is already unsandboxed", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        requestUnsandboxedExecution: true
      }), false);
    });
    test("should not automatically retry outside the sandbox for apparent network failures", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        output: "connect: Operation not permitted"
      }), false);
    });
    test("should retry in the sandbox by allowing network for apparent network failures", () => {
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed(baseAllowNetworkRetryOptions), true);
    });
    test("should not retry with allow-network when disabled or already requested", () => {
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed({
        ...baseAllowNetworkRetryOptions,
        retryWithAllowNetworkRequests: false
      }), false);
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed({
        ...baseAllowNetworkRetryOptions,
        requestAllowNetwork: true
      }), false);
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed({
        ...baseAllowNetworkRetryOptions,
        requestUnsandboxedExecution: true
      }), false);
      strictEqual(shouldAutomaticallyRetryAllowNetworkInSandboxed({
        ...baseAllowNetworkRetryOptions,
        output: "regular command failure"
      }), false);
    });
    test("should not retry background, timed-out, successful, or non-sandbox-blocked results", () => {
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        isBackgroundExecution: true
      }), false);
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        didTimeout: true
      }), false);
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        exitCode: 0
      }), false);
      strictEqual(shouldAutomaticallyRetryUnsandboxed({
        ...baseRetryOptions,
        output: "regular command failure"
      }), false);
    });
    test("should show retry elicitation when prepared invocation was auto-approved", async () => {
      setAutoApprove({ echo: true });
      const sessionResource = LocalChatSessionUri.forSession("auto-retry-auto-approved-session");
      const preparedInvocation = await executeToolTest({ command: "echo hello" });
      assertAutoApproved(preparedInvocation);
      await assertAutomaticUnsandboxRetryElicitation(runInTerminalTool, sessionResource, "echo hello", "bash", void 0);
    });
    test("should auto-retry without elicitation when session is in auto-approve permission level", async () => {
      const sessionResource = LocalChatSessionUri.forSession("auto-retry-approval-session");
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } } })),
        lastFocusedWidget: void 0
      });
      const autoApproveRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const preparedInvocation = await autoApproveRunInTerminalTool.prepareToolInvocation({
        parameters: {
          command: "rm dangerous-file.txt",
          explanation: "Remove a file",
          goal: "Remove a file",
          mode: "sync",
          timeout: 3e4
        },
        chatSessionResource: sessionResource
      }, CancellationToken.None);
      assertAutoApproved(preparedInvocation);
      const model = createChatModelWithRequest(sessionResource);
      const shouldRetry = await confirmAutomaticUnsandboxRetry(autoApproveRunInTerminalTool, sessionResource, "rm dangerous-file.txt", "bash", void 0);
      strictEqual(shouldRetry, true, "Expected auto-approve session to retry without prompting");
      const elicitation = model.getRequests().at(-1)?.response?.response.value.find((part) => part.kind === "elicitation2");
      ok(!elicitation, "Expected no elicitation in auto-approve session");
    });
    test("should show retry elicitation when prepared invocation required confirmation", async () => {
      setAutoApprove({});
      const preparedInvocation = await executeToolTest({ command: "rm dangerous-file.txt" });
      assertConfirmationRequired(preparedInvocation);
      await assertAutomaticUnsandboxRetryElicitation(runInTerminalTool, LocalChatSessionUri.forSession("auto-retry-confirmation-required-session"), "rm dangerous-file.txt", "bash", void 0);
    });
    test("should use retry confirmation title without sandbox link", () => {
      const title = getAutomaticUnsandboxRetryTitle(runInTerminalTool, "bash", void 0);
      strictEqual(title.value, "Run `bash` command outside the sandbox?");
    });
    test("should use retry confirmation title without sandbox link for blocked domains", () => {
      const title = getAutomaticUnsandboxRetryTitle(runInTerminalTool, "bash", ["example.com"]);
      strictEqual(title.value, "Run `bash` command outside the sandbox to access `example.com`?");
    });
    test("should use allow-network retry confirmation title without sandbox link", () => {
      const title = getAutomaticAllowNetworkRetryTitle(runInTerminalTool, "bash", void 0);
      strictEqual(title.value, "Retry `bash` command in the sandbox by allowing network access?");
    });
    test("should use allow-network retry confirmation title without sandbox link for blocked domains", () => {
      const title = getAutomaticAllowNetworkRetryTitle(runInTerminalTool, "bash", ["example.com"]);
      strictEqual(title.value, "Retry `bash` command in the sandbox by allowing network access to `example.com`?");
    });
    test("should show allow-network retry elicitation with sandbox-preserving title", async () => {
      await assertAutomaticAllowNetworkRetryElicitation(
        runInTerminalTool,
        LocalChatSessionUri.forSession("auto-retry-allow-network-session"),
        "curl https://example.com",
        "bash",
        void 0,
        "Retry `bash` command in the sandbox by allowing network access?"
      );
    });
    test("should show retry elicitation when sandbox force-approved command would otherwise require confirmation", async () => {
      setAutoApprove({});
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/vscode-sandbox-settings.json",
        failedCheck: void 0
      };
      const preparedInvocation = await executeToolTest({ command: "rm dangerous-file.txt" });
      assertAutoApproved(preparedInvocation);
      const terminalData = preparedInvocation.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
      await assertAutomaticUnsandboxRetryElicitation(runInTerminalTool, LocalChatSessionUri.forSession("auto-retry-sandbox-force-approved-session"), "rm dangerous-file.txt", "bash", void 0);
    });
  });
  suite("default auto-approve rules", () => {
    const defaults = terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.AutoApprove].default;
    suiteSetup(() => {
      ok(Object.keys(defaults).length > 50);
    });
    setup(() => {
      setAutoApprove(defaults);
    });
    const autoApprovedTestCases = [
      // Safe commands
      "echo abc",
      'echo "abc"',
      "echo 'abc'",
      "ls -la",
      "dir",
      "pwd",
      "cat file.txt",
      "head -n 10 file.txt",
      "tail -f log.txt",
      "findstr pattern file.txt",
      "wc -l file.txt",
      "tr a-z A-Z",
      "cut -d: -f1",
      "cmp file1 file2",
      "which node",
      "basename /path/to/file",
      "dirname /path/to/file",
      "realpath .",
      "readlink symlink",
      "stat file.txt",
      "file document.pdf",
      "du -sh folder",
      "df -h",
      "sleep 5",
      "cd /home/user",
      "nl -ba path/to/file.txt",
      // Safe git sub-commands
      "git status",
      "git log --oneline",
      "git show HEAD",
      "git show --format=%B HEAD",
      "git show --output-format=text HEAD",
      "git diff main",
      'git grep "TODO"',
      // PowerShell commands
      "Get-ChildItem",
      "Get-Date",
      "Get-Random",
      "Get-Location",
      "Set-Location C:\\Users\\test",
      'Write-Host "Hello"',
      'Write-Output "Test"',
      "Out-String",
      "Split-Path C:\\Users\\test",
      "Join-Path C:\\Users test",
      "Start-Sleep 2",
      // Explicit PowerShell cmdlets
      "Select-Object Name",
      "Measure-Object Length",
      "Compare-Object $a $b",
      "Format-Table",
      "Sort-Object Name",
      // Commands with acceptable arguments
      "column data.txt",
      "date +%Y-%m-%d",
      'find . -name "*.txt"',
      "grep pattern file.txt",
      "rg pattern file.txt",
      "rg --json pattern .",
      'rg -i --color=never "TODO" src/',
      'sed "s/foo/bar/g"',
      'sed -n "1,10p" file.txt',
      "sed -n '45,80p' /foo/bar/Example.java",
      "sed -n '45,80p' extensions/markdown-language-features/src/test/copyFile.test.ts",
      "sort file.txt",
      "tree directory",
      // od
      "od somefile",
      "od -A x somefile",
      // xxd
      "xxd",
      "xxd somefile",
      "xxd -l100 somefile",
      "xxd -r somefile",
      "xxd -rp somefile",
      // docker readonly sub-commands
      "docker ps",
      "docker ps -a",
      "docker images",
      "docker info",
      "docker version",
      "docker inspect mycontainer",
      "docker logs mycontainer",
      "docker top mycontainer",
      "docker stats",
      "docker port mycontainer",
      "docker diff mycontainer",
      "docker search nginx",
      "docker events",
      "docker container ls",
      "docker container ps",
      "docker container inspect mycontainer",
      "docker image ls",
      "docker image history myimage",
      "docker image inspect myimage",
      "docker network ls",
      "docker network inspect mynetwork",
      "docker volume ls",
      "docker volume inspect myvolume",
      "docker context ls",
      "docker context inspect mycontext",
      "docker context show",
      "docker system df",
      "docker system info",
      "docker compose ps",
      "docker compose ls",
      "docker compose top",
      "docker compose logs",
      "docker compose images",
      "docker compose config",
      "docker compose version",
      "docker compose port",
      "docker compose events"
    ];
    const confirmationRequiredTestCases = [
      // git log file output
      "git log --output=log.txt",
      // git show file output
      "git show --format=%B --output=message.txt HEAD",
      "git show --output message.txt HEAD",
      // Dangerous file operations
      "rm README.md",
      "rmdir folder",
      "del file.txt",
      "Remove-Item file.txt",
      "ri file.txt",
      "rd folder",
      "erase file.txt",
      "dd if=/dev/zero of=file",
      // Process management
      "kill 1234",
      "ps aux",
      "top",
      "Stop-Process -Id 1234",
      "spps notepad",
      "taskkill /f /im notepad.exe",
      "taskkill.exe /f /im cmd.exe",
      // Web requests
      "curl https://example.com",
      "wget https://example.com/file",
      "Invoke-RestMethod https://api.example.com",
      "Invoke-WebRequest https://example.com",
      "irm https://example.com",
      "iwr https://example.com",
      // File permissions
      "chmod 755 file.sh",
      "chown user:group file.txt",
      "Set-ItemProperty file.txt IsReadOnly $true",
      "sp file.txt IsReadOnly $true",
      "Set-Acl file.txt $acl",
      // Command execution
      "jq '.name' file.json",
      "xargs rm",
      'eval "echo hello"',
      'Invoke-Expression "Get-Date"',
      'iex "Write-Host test"',
      // Arbitrary PowerShell cmdlets must not be approved by verb alone
      "Select-Custom",
      "Measure-Command",
      "Compare-Custom",
      "Format-Hex",
      "Sort-Custom",
      // Commands with dangerous arguments
      "column -c 10000 file.txt",
      'date --set="2023-01-01"',
      "find . -delete",
      "find . -exec rm {} \\;",
      "find . -execdir rm {} \\;",
      "find . -fprint output.txt",
      "rg --pre cat pattern .",
      "rg --hostname-bin hostname pattern .",
      'sed --in-place "s/foo/bar/" file.txt',
      'sed -e "s/a/b/" file.txt',
      "sed -f script.sed file.txt",
      'sed --expression "s/a/b/" file.txt',
      "sed --file script.sed file.txt",
      'sed "s/foo/bar/e" file.txt',
      'sed "s/foo/bar/w output.txt" file.txt',
      'sed ";W output.txt" file.txt',
      "sort -o /etc/passwd file.txt",
      "sort -S 100G file.txt",
      "tree -o output.txt",
      // Transient environment variables
      'ls="test" curl https://api.example.com',
      "API_KEY=secret curl https://api.example.com",
      "HTTP_PROXY=proxy:8080 wget https://example.com",
      "VAR1=value1 VAR2=value2 echo test",
      "A=1 B=2 C=3 ./script.sh",
      // xxd with outfile or ambiguous args
      "xxd infile outfile",
      "xxd -l 100 somefile",
      // docker write/execute sub-commands
      "docker run nginx",
      "docker exec mycontainer bash",
      "docker rm mycontainer",
      "docker rmi myimage",
      "docker build .",
      "docker push myimage",
      "docker pull nginx",
      "docker compose up",
      "docker compose down"
    ];
    suite.skip("auto approved", () => {
      for (const command of autoApprovedTestCases) {
        test(command.replaceAll("\n", "\\n"), async () => {
          assertAutoApproved(await executeToolTest({ command }));
        });
      }
    });
    suite("confirmation required", () => {
      for (const command of confirmationRequiredTestCases) {
        test(command.replaceAll("\n", "\\n"), async () => {
          assertConfirmationRequired(await executeToolTest({ command }));
        });
      }
    });
  });
  suite("retry outside sandbox", () => {
    test("should mention denied domains when sandbox denies network access explicitly", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      terminalSandboxService.wrapCommand = async (command) => ({
        command: `unsandboxed:${command}`,
        isSandboxWrapped: false,
        requiresUnsandboxConfirmation: true,
        blockedDomains: ["evil.com"],
        deniedDomains: ["evil.com"]
      });
      const result = await executeToolTest({ command: "curl https://evil.com" });
      assertConfirmationRequired(result, "Run `bash` command outside the [sandbox](https://aka.ms/vscode-sandboxing) to access `evil.com`?");
      const confirmationMessage = result?.confirmationMessages?.message;
      ok(confirmationMessage && typeof confirmationMessage !== "string");
      if (!confirmationMessage || typeof confirmationMessage === "string") {
        throw new Error("Expected markdown confirmation message");
      }
      ok(confirmationMessage.value.includes("Reason for leaving the sandbox: This command accesses evil.com, which is blocked by chat.agent.deniedNetworkDomains."));
    });
    test("should force confirmation for explicit sandboxed allow-network requests", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      terminalSandboxService.wrapCommand = async (command, _requestUnsandboxedExecution, _shell, _cwd, _details, requestAllowNetwork) => ({
        command: requestAllowNetwork ? `network-sandbox:${command}` : `sandbox:${command}`,
        isSandboxWrapped: true,
        requiresAllowNetworkConfirmation: requestAllowNetwork ? true : void 0
      });
      const result = await executeToolTest({
        requestAllowNetwork: true,
        requestAllowNetworkReason: "Needs registry access while remaining sandboxed"
      });
      assertConfirmationRequired(result, "Allow bash command to access the network?");
      const terminalData = result?.toolSpecificData;
      strictEqual(terminalData.requestAllowNetwork, true);
      strictEqual(terminalData.requestAllowNetworkReason, "Needs registry access while remaining sandboxed");
      strictEqual(terminalData.commandLine.toolEdited, "network-sandbox:echo hello");
      const confirmationMessage = result?.confirmationMessages?.message;
      ok(confirmationMessage && typeof confirmationMessage !== "string");
      if (!confirmationMessage || typeof confirmationMessage === "string") {
        throw new Error("Expected markdown confirmation message");
      }
      ok(confirmationMessage.value.includes("Reason for allowing unrestricted network access in the sandbox: Needs registry access while remaining sandboxed"));
    });
    test("should use allow-network confirmation for blocked domains selected before execution", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      terminalSandboxService.wrapCommand = async (command) => ({
        command: `network-sandbox:${command}`,
        isSandboxWrapped: true,
        requiresAllowNetworkConfirmation: true,
        blockedDomains: ["evil.com"],
        deniedDomains: ["evil.com"]
      });
      const result = await executeToolTest({ command: "curl https://evil.com" });
      assertConfirmationRequired(result, "Allow bash command to access the network?");
      const terminalData = result?.toolSpecificData;
      strictEqual(terminalData.requestAllowNetwork, true);
      strictEqual(terminalData.requestUnsandboxedExecution, false);
      const confirmationMessage = result?.confirmationMessages?.message;
      ok(confirmationMessage && typeof confirmationMessage !== "string");
      if (!confirmationMessage || typeof confirmationMessage === "string") {
        throw new Error("Expected markdown confirmation message");
      }
      ok(confirmationMessage.value.includes("Reason for allowing unrestricted network access in the sandbox: This command accesses evil.com, which is blocked by chat.agent.deniedNetworkDomains."));
    });
    test("should reject explicit allow-network requests when per-command network access is disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      const prepared = await executeToolTest({ requestAllowNetwork: true, requestAllowNetworkReason: "Needs registry access" });
      ok(prepared, "Expected prepared invocation to be defined");
      ok(!prepared.confirmationMessages, "Expected no confirmation because the command will not run");
      ok(prepared.invocationMessage.value.includes("unrestricted network access in the sandbox is disabled"));
      const result = await invokeToolTest({ requestAllowNetwork: true, requestAllowNetworkReason: "Needs registry access" });
      strictEqual(createTerminalCallCount, 0, "Expected no terminal to be created");
      ok(result.toolResultError, "Expected the rejected request to be returned as a tool error");
      ok(result.content[0].kind === "text" && result.content[0].value.includes("chat.agent.sandbox.retryWithAllowNetworkRequests"));
    });
    test("should not create a terminal when sandbox file access is denied", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      terminalSandboxService.checkFileAccess = async (permission, paths) => {
        strictEqual(permission, "write", "Expected file validation to check write access");
        return { allowed: false, denied: [...paths] };
      };
      const result = await invokeToolTest({
        requestFileValidationCheck: ["/home/user/outside-workspace-file"],
        requestFileValidationCheckReason: "The command writes an outside-workspace file"
      });
      strictEqual(createTerminalCallCount, 0, "Expected no terminal to be created");
      ok(result.toolResultError, "Expected denied file access to be returned as a tool error");
      ok(result.content[0].kind === "text" && result.content[0].value.includes("Access Denied"));
      ok(result.content[0].kind === "text" && result.content[0].value.includes("write: /home/user/outside-workspace-file"));
    });
    test("should force confirmation for explicit unsandboxed execution requests", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "Needs network access outside the sandbox"
      });
      assertConfirmationRequired(result, "Run `bash` command outside the [sandbox](https://aka.ms/vscode-sandboxing)?");
      strictEqual(result?.confirmationMessages?.allowAutoConfirm, void 0);
      const terminalData = result?.toolSpecificData;
      strictEqual(terminalData.requestUnsandboxedExecution, true);
      strictEqual(terminalData.requestUnsandboxedExecutionReason, "Needs network access outside the sandbox");
      strictEqual(terminalData.commandLine.toolEdited, "unsandboxed:echo hello");
      const confirmationMessage = result?.confirmationMessages?.message;
      ok(confirmationMessage && typeof confirmationMessage !== "string");
      if (!confirmationMessage || typeof confirmationMessage === "string") {
        throw new Error("Expected markdown confirmation message");
      }
      ok(confirmationMessage.value.includes("Reason for leaving the sandbox: Needs network access outside the sandbox"));
      strictEqual(result?.confirmationMessages?.disclaimer, void 0);
      const actions = result?.confirmationMessages?.terminalCustomActions;
      ok(actions, "Expected custom actions to be defined");
      strictEqual(actions.length, 11);
      ok(!isSeparator(actions[0]));
      strictEqual(actions[0].label, "Allow `echo \u2026` in this Session");
      ok(!isSeparator(actions[4]));
      strictEqual(actions[4].label, "Allow Exact Command Line in this Session");
      ok(!isSeparator(actions[10]));
      strictEqual(actions[10].label, "Configure Auto Approve...");
    });
    test("should reject explicit unsandboxed execution requests when unsandboxed commands are disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "Needs network access outside the sandbox"
      });
      ok(result, "Expected prepared invocation to be defined");
      ok(!result.confirmationMessages, "Expected no confirmation because the command will not run");
      ok(result.invocationMessage.value.includes("Not running `echo hello` because unsandboxed execution is disabled"));
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.requestUnsandboxedExecution, false);
      strictEqual(terminalData.requestUnsandboxedExecutionReason, void 0);
      strictEqual(terminalData.commandLine.toolEdited, void 0);
    });
    test("should reject explicit unsandboxed execution requests when allow argument is false", async () => {
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({
        allowToRunUnsandboxedCommands: false,
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "Needs network access outside the sandbox"
      });
      ok(result, "Expected prepared invocation to be defined");
      ok(!result.confirmationMessages, "Expected no confirmation because the command will not run");
      ok(result.invocationMessage.value.includes("Not running `echo hello` because unsandboxed execution is disabled"));
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.requestUnsandboxedExecution, false);
      strictEqual(terminalData.requestUnsandboxedExecutionReason, void 0);
      strictEqual(terminalData.commandLine.toolEdited, void 0);
    });
    test("should not create a terminal for rejected explicit unsandboxed execution requests", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await invokeToolTest({
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "Needs network access outside the sandbox"
      });
      strictEqual(createTerminalCallCount, 0, "Expected no terminal to be created");
      ok(result.toolResultError, "Expected the rejected request to be returned as a tool error");
      ok(result.content[0].kind === "text" && result.content[0].value.includes("The command was not executed"));
      ok(result.content[0].kind === "text" && result.content[0].value.includes("chat.agent.sandbox.allowUnsandboxedCommands"));
    });
    test("should auto-approve sandboxed commands when sandbox auto approve is enabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowAutoApprove, true);
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({ command: "rm dangerous-file.txt" });
      assertAutoApproved(result);
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
    });
    test("should use existing approval flow for sandboxed commands when sandbox auto approve is disabled", async () => {
      setConfig(AgentSandboxSettingId.AgentSandboxAllowAutoApprove, false);
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
      sandboxEnabled = true;
      sandboxPrereqResult = {
        enabled: true,
        sandboxConfigPath: "/tmp/sandbox.json",
        failedCheck: void 0
      };
      runInTerminalTool.setBackendOs(OperatingSystem.Linux);
      const result = await executeToolTest({ command: "rm dangerous-file.txt" });
      assertConfirmationRequired(result);
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.commandLine.isSandboxWrapped, true);
    });
  });
  suite("prepareToolInvocation - auto approval behavior", () => {
    test("should auto-approve commands in allow list", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({ command: "echo hello world" });
      assertAutoApproved(result);
    });
    test("should require confirmation for commands not in allow list", async () => {
      setAutoApprove({
        ls: true
      });
      const result = await executeToolTest({
        command: "rm file.txt",
        explanation: "Remove a file",
        goal: "Remove a file"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
    test("should require confirmation for commands in deny list even if in allow list", async () => {
      setAutoApprove({
        rm: false,
        echo: true
      });
      const result = await executeToolTest({
        command: "rm dangerous-file.txt",
        explanation: "Remove a dangerous file",
        goal: "Remove a dangerous file"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
    test("should handle background commands with confirmation", async () => {
      setAutoApprove({
        ls: true
      });
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching for file changes",
        goal: "Start watching for file changes",
        mode: "async"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
    test("should support legacy isBackground input as async mode", async () => {
      setAutoApprove({
        ls: true
      });
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching for file changes",
        goal: "Start watching for file changes",
        isBackground: true
      });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
    test("should auto-approve background commands in allow list", async () => {
      setAutoApprove({
        npm: true
      });
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching for file changes",
        goal: "Start watching for file changes",
        mode: "async"
      });
      assertAutoApproved(result);
    });
    test("should include auto-approve info for background commands", async () => {
      setAutoApprove({
        npm: true
      });
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching for file changes",
        goal: "Start watching for file changes",
        mode: "async"
      });
      assertAutoApproved(result);
      ok(result?.toolSpecificData, "Expected toolSpecificData to be defined");
      const terminalData = result.toolSpecificData;
      ok(terminalData.autoApproveInfo, "Expected autoApproveInfo to be defined for auto-approved background command");
      ok(terminalData.autoApproveInfo.value, "Expected autoApproveInfo to have a value");
      ok(terminalData.autoApproveInfo.value.includes("npm"), "Expected autoApproveInfo to mention the approved rule");
    });
    test("should handle regex patterns in allow list", async () => {
      setAutoApprove({
        "/^git (status|log)/": true
      });
      const result = await executeToolTest({ command: "git status --porcelain" });
      assertAutoApproved(result);
    });
    test("should handle complex command chains with sub-commands", async () => {
      setAutoApprove({
        echo: true,
        ls: true
      });
      const result = await executeToolTest({ command: 'echo "hello" && ls -la' });
      assertAutoApproved(result);
    });
    test("should require confirmation when one sub-command is not approved", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({ command: 'echo "hello" && rm file.txt' });
      assertConfirmationRequired(result);
    });
    test("should handle empty command strings", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({
        command: "",
        explanation: "Empty command",
        goal: "Empty command"
      });
      assertAutoApproved(result);
    });
    test("should handle matchCommandLine: true patterns", async () => {
      setAutoApprove({
        "/dangerous/": { approve: false, matchCommandLine: true },
        "echo": { approve: true, matchCommandLine: true }
      });
      const result1 = await executeToolTest({ command: "echo hello world" });
      assertAutoApproved(result1);
      const result2 = await executeToolTest({ command: "echo this is a dangerous command" });
      assertConfirmationRequired(result2);
    });
    test("should only approve when neither sub-commands or command lines are denied", async () => {
      setAutoApprove({
        "foo": true,
        "/^foo$/": { approve: false, matchCommandLine: true }
      });
      const result1 = await executeToolTest({ command: "foo" });
      assertConfirmationRequired(result1);
      const result2 = await executeToolTest({ command: "foo bar" });
      assertAutoApproved(result2);
    });
  });
  suite("confirmation title with presentation overrides", () => {
    function injectMockPresenter(tool, languageDisplayName) {
      tool.commandLinePresenters.unshift({
        present: (options) => ({
          commandLine: options.commandLine.forDisplay,
          processOtherPresenters: false,
          languageDisplayName
        })
      });
    }
    test("should use withoutLanguage title when presenter returns no languageDisplayName", async () => {
      injectMockPresenter(runInTerminalTool);
      const result = await executeToolTest({
        command: "rm file.txt",
        explanation: "Remove a file",
        goal: "Remove a file"
      });
      assertConfirmationRequired(result, "Run command in `bash`?");
    });
    test("should use withoutLanguage background title when presenter returns no languageDisplayName", async () => {
      injectMockPresenter(runInTerminalTool);
      const result = await executeToolTest({
        command: "npm run watch",
        explanation: "Start watching",
        goal: "Start watching",
        mode: "async"
      });
      assertConfirmationRequired(result, "Run command in `bash`?");
    });
    test("should use withLanguage title when presenter returns languageDisplayName", async () => {
      const result = await executeToolTest({
        command: 'node -e "console.log(1)"',
        explanation: "Run node command",
        goal: "Run node command"
      });
      assertConfirmationRequired(result, "Run `Node.js` command in `bash`?");
    });
    test("should use withLanguage background title when presenter returns languageDisplayName", async () => {
      const result = await executeToolTest({
        command: 'node -e "console.log(1)"',
        explanation: "Run node command",
        goal: "Run node command",
        mode: "async"
      });
      assertConfirmationRequired(result, "Run `Node.js` command in `bash`?");
    });
    test("should use withoutLanguage inDirectory title when presenter returns no languageDisplayName with cd prefix", async () => {
      const workspaceFolder = URI.file(isWindows ? "C:\\workspace\\project" : "/workspace/project");
      const workspace = new Workspace("test", [toWorkspaceFolder(workspaceFolder)]);
      workspaceContextService.setWorkspace(workspace);
      instantiationService.stub(IHistoryService, {
        getLastActiveWorkspaceRoot: () => workspaceFolder
      });
      const toolWithWorkspace = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      injectMockPresenter(toolWithWorkspace);
      const context = {
        parameters: {
          command: "cd /tmp && rm file.txt",
          explanation: "Remove a file in /tmp",
          goal: "Remove a file in /tmp",
          mode: "sync",
          timeout: 3e4
        }
      };
      const result = await toolWithWorkspace.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result, `Run command in \`bash\` within \`${isWindows ? "\\tmp" : "~/tmp"}\`?`);
    });
    test("should not show undefined in confirmation message when explanation and goal are missing", async () => {
      const params = {
        command: "rm file.txt"
      };
      delete params.explanation;
      delete params.goal;
      const result = await executeToolTest(params);
      assertConfirmationRequired(result);
      const message = result?.confirmationMessages?.message;
      ok(message, "Expected confirmation message to be defined");
      const messageText = typeof message === "string" ? message : message.value;
      ok(!messageText.includes("undefined"), `Confirmation message should not contain "undefined", got: ${messageText}`);
    });
    test("should use withLanguage inDirectory title when presenter returns languageDisplayName with cd prefix", async () => {
      const workspaceFolder = URI.file(isWindows ? "C:\\workspace\\project" : "/workspace/project");
      const workspace = new Workspace("test", [toWorkspaceFolder(workspaceFolder)]);
      workspaceContextService.setWorkspace(workspace);
      instantiationService.stub(IHistoryService, {
        getLastActiveWorkspaceRoot: () => workspaceFolder
      });
      const toolWithWorkspace = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const context = {
        parameters: {
          command: 'cd /tmp && node -e "console.log(1)"',
          explanation: "Run node command in /tmp",
          goal: "Run node command in /tmp",
          mode: "sync",
          timeout: 3e4
        }
      };
      const result = await toolWithWorkspace.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result, `Run \`Node.js\` command in \`bash\` within \`${isWindows ? "\\tmp" : "~/tmp"}\`?`);
    });
  });
  suite("prepareToolInvocation - custom actions for dropdown", () => {
    function assertDropdownActions(result, items) {
      const actions = result?.confirmationMessages?.terminalCustomActions;
      ok(actions, "Expected custom actions to be defined");
      strictEqual(actions.length, items.length);
      for (const [i, item] of items.entries()) {
        const action = actions[i];
        if (item === "---") {
          ok(isSeparator(action));
        } else {
          ok(!isSeparator(action));
          if (item === "configure") {
            strictEqual(action.label, "Configure Auto Approve...");
            strictEqual(action.data.type, "configure");
          } else if (item === "sessionApproval") {
            strictEqual(action.label, "Allow All Commands in this Session");
            strictEqual(action.data.type, "sessionApproval");
          } else if (hasKey(item, { commandLine: true })) {
            const expectedLabel = item.scope === "session" ? "Allow Exact Command Line in this Session" : item.scope === "workspace" ? "Allow Exact Command Line in this Workspace" : "Always Allow Exact Command Line";
            strictEqual(action.label, expectedLabel);
            strictEqual(action.data.type, "newRule");
            ok(!Array.isArray(action.data.rule), "Expected rule to be an object");
          } else {
            const subCommandLabel = Array.isArray(item.subCommand) ? `Commands ${item.subCommand.map((e) => `\`${e} \u2026\``).join(", ")}` : `\`${item.subCommand} \u2026\``;
            const expectedLabel = item.scope === "session" ? `Allow ${subCommandLabel} in this Session` : item.scope === "workspace" ? `Allow ${subCommandLabel} in this Workspace` : `Always Allow ${subCommandLabel}`;
            strictEqual(action.label, expectedLabel);
            strictEqual(action.data.type, "newRule");
            ok(Array.isArray(action.data.rule), "Expected rule to be an array");
          }
        }
      }
    }
    test("should generate custom actions for non-auto-approved commands", async () => {
      setAutoApprove({
        ls: true
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        { subCommand: "npm run build", scope: "session" },
        { subCommand: "npm run build", scope: "workspace" },
        { subCommand: "npm run build", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should generate custom actions for single word commands", async () => {
      const result = await executeToolTest({
        command: "foo",
        explanation: "Run foo command",
        goal: "Run foo command"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not generate custom actions for auto-approved commands", async () => {
      setAutoApprove({
        npm: true
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertAutoApproved(result);
    });
    test("should only generate configure action for explicitly denied commands", async () => {
      setAutoApprove({
        npm: { approve: false }
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should handle && in command line labels with proper mnemonic escaping", async () => {
      const result = await executeToolTest({
        command: "npm install && npm run build",
        explanation: "Install dependencies and build",
        goal: "Install dependencies and build"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        { subCommand: ["npm install", "npm run build"], scope: "session" },
        { subCommand: ["npm install", "npm run build"], scope: "workspace" },
        { subCommand: ["npm install", "npm run build"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not show approved commands in custom actions dropdown", async () => {
      setAutoApprove({
        head: true
        // head is approved by default in real scenario
      });
      const result = await executeToolTest({
        command: "foo | head -20",
        explanation: "Run foo command and show first 20 lines",
        goal: "Run foo command and show first 20 lines"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not show any command-specific actions when all sub-commands are approved", async () => {
      setAutoApprove({
        foo: true,
        head: true
      });
      const result = await executeToolTest({
        command: "foo | head -20",
        explanation: "Run foo command and show first 20 lines",
        goal: "Run foo command and show first 20 lines"
      });
      assertAutoApproved(result);
    });
    test("should handle mixed approved and unapproved commands correctly", async () => {
      setAutoApprove({
        head: true,
        tail: true
      });
      const result = await executeToolTest({
        command: "foo | head -20 && bar | tail -10",
        explanation: "Run multiple piped commands",
        goal: "Run multiple piped commands"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      assertDropdownActions(result, [
        { subCommand: ["foo", "bar"], scope: "session" },
        { subCommand: ["foo", "bar"], scope: "workspace" },
        { subCommand: ["foo", "bar"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest subcommand for git commands", async () => {
      const result = await executeToolTest({
        command: "git status",
        explanation: "Check git status",
        goal: "Check git status"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "git status", scope: "session" },
        { subCommand: "git status", scope: "workspace" },
        { subCommand: "git status", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest subcommand for npm commands", async () => {
      const result = await executeToolTest({
        command: "npm test",
        explanation: "Run npm tests",
        goal: "Run npm tests"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "npm test", scope: "session" },
        { subCommand: "npm test", scope: "workspace" },
        { subCommand: "npm test", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest 3-part subcommand for npm run commands", async () => {
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Run build script",
        goal: "Run build script"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "npm run build", scope: "session" },
        { subCommand: "npm run build", scope: "workspace" },
        { subCommand: "npm run build", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest 3-part subcommand for yarn run commands", async () => {
      const result = await executeToolTest({
        command: "yarn run test",
        explanation: "Run test script",
        goal: "Run test script"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "yarn run test", scope: "session" },
        { subCommand: "yarn run test", scope: "workspace" },
        { subCommand: "yarn run test", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not suggest subcommand for commands with flags", async () => {
      const result = await executeToolTest({
        command: "foo --foo --bar",
        explanation: "Run foo with flags",
        goal: "Run foo with flags"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not suggest subcommand for npm run with flags", async () => {
      const result = await executeToolTest({
        command: "npm run abc --some-flag",
        explanation: "Run npm run abc with flags",
        goal: "Run npm run abc with flags"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "npm run abc", scope: "session" },
        { subCommand: "npm run abc", scope: "workspace" },
        { subCommand: "npm run abc", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should handle mixed npm run and other commands", async () => {
      const result = await executeToolTest({
        command: "npm run build && git status",
        explanation: "Build and check status",
        goal: "Build and check status"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: ["npm run build", "git status"], scope: "session" },
        { subCommand: ["npm run build", "git status"], scope: "workspace" },
        { subCommand: ["npm run build", "git status"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest mixed subcommands and base commands", async () => {
      const result = await executeToolTest({
        command: 'git push && echo "done"',
        explanation: "Push and print done",
        goal: "Push and print done"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: ["git push", "echo"], scope: "session" },
        { subCommand: ["git push", "echo"], scope: "workspace" },
        { subCommand: ["git push", "echo"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest subcommands for multiple git commands", async () => {
      const result = await executeToolTest({
        command: "git status && git log --oneline",
        explanation: "Check status and log",
        goal: "Check status and log"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: ["git status", "git log"], scope: "session" },
        { subCommand: ["git status", "git log"], scope: "workspace" },
        { subCommand: ["git status", "git log"], scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should suggest base command for non-subcommand tools", async () => {
      const result = await executeToolTest({
        command: "foo bar",
        explanation: "Download from example.com",
        goal: "Download from example.com"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should handle single word commands from subcommand-aware tools", async () => {
      const result = await executeToolTest({
        command: "git",
        explanation: "Run git command",
        goal: "Run git command"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should deduplicate identical subcommand suggestions", async () => {
      const result = await executeToolTest({
        command: "npm test && npm test --verbose",
        explanation: "Run tests twice",
        goal: "Run tests twice"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "npm test", scope: "session" },
        { subCommand: "npm test", scope: "workspace" },
        { subCommand: "npm test", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should handle flags differently than subcommands for suggestion logic", async () => {
      const result = await executeToolTest({
        command: "foo --version",
        explanation: "Check foo version",
        goal: "Check foo version"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { subCommand: "foo", scope: "session" },
        { subCommand: "foo", scope: "workspace" },
        { subCommand: "foo", scope: "user" },
        "---",
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not suggest overly permissive subcommand rules", async () => {
      const result = await executeToolTest({
        command: 'bash -c "echo hello"',
        explanation: "Run bash command",
        goal: "Run bash command"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        { commandLine: true, scope: "session" },
        { commandLine: true, scope: "workspace" },
        { commandLine: true, scope: "user" },
        "---",
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should not show command line option when it's rejected", async () => {
      setAutoApprove({
        echo: true,
        "/\\(.+\\)/s": { approve: false, matchCommandLine: true }
      });
      const result = await executeToolTest({
        command: "echo (abc)"
      });
      assertConfirmationRequired(result);
      assertDropdownActions(result, [
        "sessionApproval",
        "---",
        "configure"
      ]);
    });
    test("should prevent auto approval when writing to a file outside the workspace", async () => {
      setConfig(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, "outsideWorkspace");
      setAutoApprove({});
      const workspaceFolder = URI.file(isWindows ? "C:/workspace/project" : "/workspace/project");
      const workspace = new Workspace("test", [toWorkspaceFolder(workspaceFolder)]);
      workspaceContextService.setWorkspace(workspace);
      instantiationService.stub(IHistoryService, {
        getLastActiveWorkspaceRoot: () => workspaceFolder
      });
      const result = await executeToolTest({
        command: 'echo "abc" > ../file.txt'
      });
      assertConfirmationRequired(result);
      strictEqual(result?.confirmationMessages?.terminalCustomActions, void 0, "Expected no custom actions when file write is blocked");
    });
  });
  suite("chat session disposal cleanup", () => {
    const createMockTerminal = (processId) => ({
      dispose: () => {
      },
      processId
    });
    test("should restore all terminals into the session terminal map and dispose them when archived", () => {
      const sessionId = "test-session-restored-archive";
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      const terminal1DisposedEmitter = new Emitter();
      const terminal2DisposedEmitter = new Emitter();
      const mockTerminal1 = {
        dispose: () => {
          terminal1Disposed = true;
          terminal1DisposedEmitter.fire();
        },
        onDisposed: terminal1DisposedEmitter.event,
        processId: 55555
      };
      const mockTerminal2 = {
        dispose: () => {
          terminal2Disposed = true;
          terminal2DisposedEmitter.fire();
        },
        onDisposed: terminal2DisposedEmitter.event,
        processId: 66666
      };
      storageService.store("chat.terminalSessions", JSON.stringify({
        [mockTerminal1.processId]: {
          sessionId,
          id: "restored-1",
          shellIntegrationQuality: ShellIntegrationQuality.None,
          isBackground: true
        },
        [mockTerminal2.processId]: {
          sessionId,
          id: "restored-2",
          shellIntegrationQuality: ShellIntegrationQuality.None,
          isBackground: false
        }
      }), StorageScope.WORKSPACE, StorageTarget.USER);
      instantiationService.stub(ITerminalService, {
        onDidDisposeInstance: terminalServiceDisposeEmitter.event,
        instances: [mockTerminal1, mockTerminal2],
        foregroundInstances: [],
        setNextCommandId: async () => {
        }
      });
      const restoredRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const restoredSessionTerminals = restoredRunInTerminalTool.sessionTerminalInstances.get(sessionResource);
      strictEqual(restoredSessionTerminals?.size, 2, "Both restored terminals should be tracked for the session");
      chatSessionArchivedEmitter.fire({
        resource: sessionResource,
        isArchived: () => true
      });
      strictEqual(terminal1Disposed, true, "Restored background terminal should have been disposed");
      strictEqual(terminal2Disposed, true, "Restored foreground terminal should have been disposed");
      ok(!restoredRunInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Foreground terminal association should be removed after archive");
      ok(!restoredRunInTerminalTool.sessionTerminalInstances.has(sessionResource), "All restored terminals for the session should be removed after archive");
    });
    test("should dispose all terminals associated with a single chat session when archived", () => {
      const sessionId = "test-session-archive";
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      const mockTerminal1 = { dispose: () => {
      }, processId: 33333 };
      const mockTerminal2 = { dispose: () => {
      }, processId: 44444 };
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
        instance: mockTerminal2,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      runInTerminalTool.sessionTerminalInstances.set(sessionResource, /* @__PURE__ */ new Set([mockTerminal1, mockTerminal2]));
      const ensureArchivedSessionListener = runInTerminalTool["_ensureArchivedSessionListener"];
      ensureArchivedSessionListener.call(runInTerminalTool);
      chatSessionArchivedEmitter.fire({
        resource: sessionResource,
        isArchived: () => true
      });
      strictEqual(terminal1Disposed, true, "Terminal 1 should have been disposed");
      strictEqual(terminal2Disposed, true, "Terminal 2 should have been disposed");
      ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Terminal association should be removed after archive");
      ok(!runInTerminalTool.sessionTerminalInstances.has(sessionResource), "All tracked terminals for the session should be removed after archive");
    });
    test("should not access agent sessions model when initializing archive listener", () => {
      let modelAccessed = false;
      instantiationService.stub(IAgentSessionsService, {
        onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
        get model() {
          modelAccessed = true;
          throw new Error("model should not be accessed when wiring archive listener");
        }
      });
      const noModelAccessRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const ensureArchivedSessionListener = noModelAccessRunInTerminalTool["_ensureArchivedSessionListener"];
      ensureArchivedSessionListener.call(noModelAccessRunInTerminalTool);
      strictEqual(modelAccessed, false, "Agent sessions model should not be accessed when initializing archive listener");
    });
    test("should dispose all terminals associated with a single chat session", () => {
      const sessionId = "test-session-multiple-terminals";
      const mockTerminal1 = createMockTerminal(11111);
      const mockTerminal2 = createMockTerminal(22222);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
        instance: mockTerminal2,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      runInTerminalTool.sessionTerminalInstances.set(sessionResource, /* @__PURE__ */ new Set([mockTerminal1, mockTerminal2]));
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: "cleared" });
      strictEqual(terminal1Disposed, true, "Terminal 1 should have been disposed");
      strictEqual(terminal2Disposed, true, "Terminal 2 should have been disposed");
      ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Terminal association should be removed after disposal");
      ok(!runInTerminalTool.sessionTerminalInstances.has(sessionResource), "All tracked terminals for the session should be removed after disposal");
    });
    test("should dispose associated terminals when chat session is disposed", () => {
      const sessionId = "test-session-123";
      const mockTerminal = createMockTerminal(12345);
      let terminalDisposed = false;
      mockTerminal.dispose = () => {
        terminalDisposed = true;
      };
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
        instance: mockTerminal,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Terminal association should exist before disposal");
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: "cleared" });
      strictEqual(terminalDisposed, true, "Terminal should have been disposed");
      ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Terminal association should be removed after disposal");
    });
    test("should not affect other sessions when one session is disposed", () => {
      const sessionId1 = "test-session-1";
      const sessionId2 = "test-session-2";
      const mockTerminal1 = createMockTerminal(12345);
      const mockTerminal2 = createMockTerminal(67890);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      const sessionResource1 = LocalChatSessionUri.forSession(sessionId1);
      const sessionResource2 = LocalChatSessionUri.forSession(sessionId2);
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource1, {
        instance: mockTerminal1,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource2, {
        instance: mockTerminal2,
        shellIntegrationQuality: ShellIntegrationQuality.None
      });
      ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource1), "Session 1 terminal association should exist");
      ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource2), "Session 2 terminal association should exist");
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource1], reason: "cleared" });
      strictEqual(terminal1Disposed, true, "Terminal 1 should have been disposed");
      strictEqual(terminal2Disposed, false, "Terminal 2 should NOT have been disposed");
      ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource1), "Session 1 terminal association should be removed");
      ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource2), "Session 2 terminal association should remain");
    });
    test("should not dispose user-revealed terminals when chat session is disposed", () => {
      const sessionId = "test-session-revealed";
      const mockTerminal1 = createMockTerminal(11111);
      const mockTerminal2 = createMockTerminal(22222);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      runInTerminalTool.sessionTerminalInstances.set(sessionResource, /* @__PURE__ */ new Set([mockTerminal1, mockTerminal2]));
      instantiationService.get(ITerminalService).foregroundInstances.push(mockTerminal2);
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: "cleared" });
      strictEqual(terminal1Disposed, true, "Hidden terminal should have been disposed");
      strictEqual(terminal2Disposed, false, "User-revealed terminal should NOT have been disposed");
      instantiationService.get(ITerminalService).foregroundInstances.length = 0;
    });
    test("should preserve terminals when output location is terminal", () => {
      setConfig(TerminalChatAgentToolsSettingId.OutputLocation, "terminal");
      const sessionId = "test-session-output-location-terminal";
      const mockTerminal1 = createMockTerminal(33333);
      const mockTerminal2 = createMockTerminal(44444);
      let terminal1Disposed = false;
      let terminal2Disposed = false;
      mockTerminal1.dispose = () => {
        terminal1Disposed = true;
      };
      mockTerminal2.dispose = () => {
        terminal2Disposed = true;
      };
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      runInTerminalTool.sessionTerminalInstances.set(sessionResource, /* @__PURE__ */ new Set([mockTerminal1, mockTerminal2]));
      chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: "cleared" });
      strictEqual(terminal1Disposed, false, "Terminal should persist when output location is terminal");
      strictEqual(terminal2Disposed, false, "Terminal should persist when output location is terminal");
    });
    test("should handle disposal of non-existent session gracefully", () => {
      strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, "No associations should exist initially");
      chatServiceDisposeEmitter.fire({ sessionResources: [LocalChatSessionUri.forSession("non-existent-session")], reason: "cleared" });
      strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, "No associations should exist after handling non-existent session");
    });
    test("should not reuse a disposed cached terminal", () => {
      const sessionResource = LocalChatSessionUri.forSession("disposed-terminal-session");
      const disposedTerminal = {
        isDisposed: true,
        dispose: () => {
        },
        processId: 99999
      };
      runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
        instance: disposedTerminal,
        shellIntegrationQuality: ShellIntegrationQuality.None,
        isBackground: false
      });
      const cachedTerminal = runInTerminalTool.sessionTerminalAssociations.get(sessionResource);
      ok(cachedTerminal, "Cached terminal should exist in the map");
      strictEqual(cachedTerminal.instance.isDisposed, true, "Cached terminal should be disposed");
      const wouldReuse = cachedTerminal !== void 0 && !cachedTerminal.isBackground && !cachedTerminal.instance.isDisposed;
      strictEqual(wouldReuse, false, "Should not reuse a disposed cached terminal");
    });
  });
  async function sendBackgroundCompletionNotification(previousAgentId) {
    const termId = `test-completion-model-term-${previousAgentId}`;
    const sessionResource = LocalChatSessionUri.forSession(`test-completion-model-session-${previousAgentId}`);
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      dispose: () => {
      },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event
    };
    const previousModelId = "claude-opus-4-8";
    const previousTools = { tool1: true };
    const previousModeInfo = {
      kind: ChatModeKind.Agent,
      isBuiltin: true,
      modeInstructions: void 0,
      telemetryModeId: "agent",
      applyCodeBlockSuggestionId: void 0
    };
    const previousRequest = { modelId: previousModelId, modeInfo: previousModeInfo, userSelectedTools: previousTools, response: { agent: { id: previousAgentId }, isCanceled: false, onDidChange: Event.None } };
    const chatService = instantiationService.get(IChatService);
    chatService.acquireExistingSession = () => ({
      object: {
        lastRequest: previousRequest,
        lastRequestObs: constObservable(previousRequest),
        onDidChange: Event.None
      },
      dispose: () => {
      }
    });
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => "done",
      dispose: () => {
      },
      instance: terminalInstance
    });
    const toolSpecificData = { kind: "terminal", commandLine: { original: "npm test" }, language: "bash" };
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "npm test", toolSpecificData);
    await new Promise((resolve) => setTimeout(resolve, 0));
    commandFinishedEmitter.fire({ exitCode: 0 });
    strictEqual(capturedSteeringRequests.length, 1, "Expected a completion steering notification");
    return capturedSteeringRequests[0].options;
  }
  test("should preserve conversation context for background completion notifications", async () => {
    const options = await sendBackgroundCompletionNotification("local-agent");
    strictEqual(options?.userSelectedModelId, "claude-opus-4-8", "Completion notification should use the conversation model");
    strictEqual(options?.agentIdSilent, "local-agent", "Completion notification should continue with the previous request agent");
    strictEqual(options?.instructionContext?.modeKind, ChatModeKind.Agent, "Completion notification should collect instructions for the previous mode");
    strictEqual(options?.instructionContext?.enabledTools?.tool1, true, "Completion notification should collect instructions for the previous tools");
  });
  test("should preserve contributed session auto-attach opt-out for background completion notifications", async () => {
    chatSessionContribution = { autoAttachReferences: false };
    const options = await sendBackgroundCompletionNotification("contributed-agent");
    strictEqual(options?.instructionContext, void 0, "Completion notification should not collect instructions for an opted-out contributed session");
  });
  test("should dedupe rapid repeated background input-needed notifications", () => {
    const termId = "test-input-needed-term";
    const sessionResource = LocalChatSessionUri.forSession("test-input-needed-session");
    let output = "Enter value:";
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputNeededEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event
    };
    const outputMonitor = {
      onDidDetectInputNeeded: inputNeededEmitter.event,
      onDidDetectSensitiveInputNeeded: Event.None,
      continueMonitoringAsync: () => {
      },
      dispose: () => {
      }
    };
    const toolSpecificData = { kind: "terminal", commandLine: { original: "npm init" }, language: "bash" };
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => output
    });
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "npm init", toolSpecificData, outputMonitor);
    inputNeededEmitter.fire();
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 1, "Expected duplicate rapid input-needed events to be suppressed");
    output = "Confirm (y/N):";
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 2, "Expected a changed prompt to trigger a new notification");
  });
  test("should suppress input-needed after disposal and omit successful exit code from terminal-exited notice", () => {
    const termId = "test-input-needed-disposed-term";
    const sessionResource = LocalChatSessionUri.forSession("test-input-needed-disposed-session");
    const output = "Press ENTER or type command to continue";
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputNeededEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    let isDisposed = false;
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event,
      exitCode: 0,
      get isDisposed() {
        return isDisposed;
      }
    };
    const outputMonitor = {
      onDidDetectInputNeeded: inputNeededEmitter.event,
      onDidDetectSensitiveInputNeeded: Event.None,
      continueMonitoringAsync: () => {
      },
      dispose: () => {
      }
    };
    const toolSpecificData = { kind: "terminal", commandLine: { original: "git --no-pager diff -- foo.ts" }, language: "bash" };
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => output
    });
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "git --no-pager diff -- foo.ts", toolSpecificData, outputMonitor);
    isDisposed = true;
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 0, "Closing the terminal should not produce a spurious input-needed chat turn");
    terminalDisposedEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 1, "Closing the terminal should send one terminal-exited notification");
    ok(capturedSteeringRequests[0].message.includes("terminal exited."), "Successful terminal exit should be reported without qualification");
    ok(!capturedSteeringRequests[0].message.includes("exit code 0"), "Successful terminal exit should not print exit code 0 to chat");
  });
  test("should suppress redundant input-needed notification for output already returned via foreground inputNeeded", () => {
    const termId = "test-input-needed-already-notified-term";
    const sessionResource = LocalChatSessionUri.forSession("test-input-needed-already-notified-session");
    let output = "package name: (test_npm_init) ";
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputNeededEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event
    };
    const outputMonitor = {
      onDidDetectInputNeeded: inputNeededEmitter.event,
      onDidDetectSensitiveInputNeeded: Event.None,
      continueMonitoringAsync: () => {
      },
      dispose: () => {
      }
    };
    const toolSpecificData = { kind: "terminal", commandLine: { original: "mkdir -p foo && cd foo && npm init" }, language: "bash" };
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => output
    });
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "mkdir -p foo && cd foo && npm init", toolSpecificData, outputMonitor, output);
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 0, "Should not re-notify for output the agent already received via the foreground inputNeeded race");
    output = "version: (1.0.0) ";
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 1, "Expected a new notification once the prompt output changes");
  });
  test("should preserve session terminal association after inputNeeded so fg terminal is reused", () => {
    const termId = "test-input-cleanup-term";
    const sessionResource = LocalChatSessionUri.forSession("test-input-cleanup-session");
    const commandFinishedEmitter = new Emitter();
    const terminalDisposedEmitter = new Emitter();
    const inputNeededEmitter = new Emitter();
    const inputDataEmitter = new Emitter();
    const terminalInstance = {
      capabilities: {
        get: (cap) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : void 0
      },
      shellLaunchConfig: { hideFromUser: false },
      onDisposed: terminalDisposedEmitter.event,
      onDidInputData: inputDataEmitter.event
    };
    const outputMonitor = {
      onDidDetectInputNeeded: inputNeededEmitter.event,
      onDidDetectSensitiveInputNeeded: Event.None,
      continueMonitoringAsync: () => {
      },
      dispose: () => {
      }
    };
    const toolSpecificData = { kind: "terminal", commandLine: { original: "ssh host" }, language: "bash" };
    instantiationService.get(ITerminalService).foregroundInstances.push(terminalInstance);
    runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
      instance: terminalInstance,
      shellIntegrationQuality: ShellIntegrationQuality.Rich,
      isBackground: false
    });
    runInTerminalTool.constructor._activeExecutions.set(termId, {
      getOutput: () => "Password:",
      dispose: () => {
      }
    });
    runInTerminalTool._registerCompletionNotification(terminalInstance, termId, sessionResource, "ssh host", toolSpecificData, outputMonitor);
    inputNeededEmitter.fire();
    strictEqual(capturedSteeringRequests.length, 1, "Should send steering request for input needed");
    ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Session terminal association should be preserved for fg reuse");
    strictEqual(runInTerminalTool.sessionTerminalAssociations.get(sessionResource).isBackground, false, "Terminal should remain foreground");
    commandFinishedEmitter.fire({ exitCode: 0 });
    strictEqual(capturedSteeringRequests.length, 2, "Should send a completion steering request");
    ok(capturedSteeringRequests[1].message.includes("command completed."), "Successful completion should be reported without qualification");
    ok(!capturedSteeringRequests[1].message.includes("exit code 0"), "Successful completion should not print exit code 0 to chat");
    ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource), "Session terminal association should still be preserved after command finishes");
    strictEqual(runInTerminalTool.sessionTerminalAssociations.get(sessionResource).isBackground, false, "Terminal should still be foreground after command finishes");
  });
  suite("auto approve warning acceptance mechanism", () => {
    test("should require confirmation for auto-approvable commands when warning not accepted", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
      setAutoApprove({
        echo: true
      });
      clearAutoApproveWarningAcceptedState();
      assertConfirmationRequired(await executeToolTest({ command: "echo hello world" }), "Run `bash` command?");
    });
    test("should include autoApproveInfo when command would be auto-approved but warning not accepted", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
      setAutoApprove({
        echo: true
      });
      clearAutoApproveWarningAcceptedState();
      const result = await executeToolTest({ command: "echo hello world" });
      assertConfirmationRequired(result, "Run `bash` command?");
      const terminalData = result.toolSpecificData;
      ok(terminalData.autoApproveInfo, "autoApproveInfo should be set for commands that would be auto-approved");
    });
    test("should auto-approve commands when both auto-approve enabled and warning accepted", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
      setAutoApprove({
        echo: true
      });
      assertAutoApproved(await executeToolTest({ command: "echo hello world" }));
    });
    test("should require confirmation when auto-approve disabled regardless of warning acceptance", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({ command: "echo hello world" });
      assertConfirmationRequired(result, "Run `bash` command?");
    });
  });
  suite("input-needed steering text", () => {
    function buildSteeringText(hungHint) {
      const sessionResource = LocalChatSessionUri.forSession("input-needed-steering-session");
      return runInTerminalTool._buildInputNeededSteeringText(sessionResource, "test-term-id", hungHint);
    }
    test("none mode does not mention timeout, idle silence, or kill_terminal", () => {
      const text = buildSteeringText("none");
      ok(!text.toLowerCase().includes("timeout"), "Expected no mention of timeout in the input-needed (none) hint");
      ok(!text.toLowerCase().includes("no output"), "Expected no mention of idle silence in the input-needed (none) hint");
      ok(!text.includes(TerminalToolId.KillTerminal), "Expected kill_terminal not to be advertised in the input-needed (none) hint");
    });
    test("timeout mode advertises kill_terminal and mentions timeout", () => {
      const text = buildSteeringText("timeout");
      ok(text.toLowerCase().includes("timeout"), 'Expected timeout hint to mention "timeout"');
      ok(text.includes(TerminalToolId.KillTerminal), "Expected timeout hint to advertise kill_terminal");
    });
    test('idleSilence mode advertises kill_terminal without saying "timeout"', () => {
      const text = buildSteeringText("idleSilence");
      ok(!text.toLowerCase().includes("timeout"), "Idle-silence hint must not refer to a timeout");
      ok(text.toLowerCase().includes("no output"), "Expected idle-silence hint to describe the no-output condition");
      ok(text.includes(TerminalToolId.KillTerminal), "Expected idle-silence hint to advertise kill_terminal");
    });
  });
  suite("unique rules deduplication", () => {
    test("should properly deduplicate rules with same sourceText in auto-approve info", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({ command: "echo hello && echo world" });
      assertAutoApproved(result);
      const autoApproveInfo = result.toolSpecificData.autoApproveInfo;
      ok(autoApproveInfo);
      ok(autoApproveInfo.value.includes("Auto approved by rule "), 'should contain singular "rule", not plural');
      strictEqual(count(autoApproveInfo.value, "echo"), 1);
    });
  });
  suite("session auto approval", () => {
    test("should auto approve all commands when session has auto approval enabled", async () => {
      const sessionId = "test-session-123";
      const sessionResource = LocalChatSessionUri.forSession(sessionId);
      const terminalChatService = instantiationService.get(ITerminalChatService);
      const context = {
        parameters: {
          command: "rm dangerous-file.txt",
          explanation: "Remove a file",
          goal: "Remove a file",
          mode: "sync",
          timeout: 3e4
        },
        chatSessionResource: sessionResource
      };
      let result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result);
      terminalChatService.setChatSessionAutoApproval(sessionResource, true);
      result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
      assertAutoApproved(result);
      const terminalData = result.toolSpecificData;
      ok(terminalData.autoApproveInfo, "Expected autoApproveInfo to be defined");
      ok(terminalData.autoApproveInfo.value.includes("Auto approved for this session"), "Expected session approval message");
    });
    test("should bypass terminal auto-approve feature in Autopilot mode", async () => {
      setAutoApprove({
        curl: false
      });
      const sessionResource = LocalChatSessionUri.forSession("autopilot-session");
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.Autopilot } } })),
        lastFocusedWidget: void 0
      });
      const autopilotRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const result = await autopilotRunInTerminalTool.prepareToolInvocation({
        parameters: {
          command: "curl https://example.com",
          explanation: "Fetch a URL",
          goal: "Download content",
          mode: "sync",
          timeout: 3e4
        },
        chatSessionResource: sessionResource
      }, CancellationToken.None);
      assertAutoApproved(result);
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.autoApproveInfo, void 0, "Expected no terminal auto-approve info in Autopilot mode");
    });
    test("should bypass terminal auto-approve feature in Bypass Approvals mode", async () => {
      setAutoApprove({
        curl: false
      });
      const sessionResource = LocalChatSessionUri.forSession("bypass-session");
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } } })),
        lastFocusedWidget: void 0
      });
      const bypassRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
      const result = await bypassRunInTerminalTool.prepareToolInvocation({
        parameters: {
          command: "curl https://example.com",
          explanation: "Fetch a URL",
          goal: "Download content",
          mode: "sync",
          timeout: 3e4
        },
        chatSessionResource: sessionResource
      }, CancellationToken.None);
      assertAutoApproved(result);
      const terminalData = result.toolSpecificData;
      strictEqual(terminalData.autoApproveInfo, void 0, "Expected no terminal auto-approve info in Bypass Approvals mode");
    });
  });
  suite("TerminalProfileFetcher", () => {
    suite("getCopilotProfile", () => {
      (isWindows ? test : test.skip)("should return custom profile when configured", async () => {
        runInTerminalTool.setBackendOs(OperatingSystem.Windows);
        const customProfile = Object.freeze({ path: "C:\\Windows\\System32\\cmd.exe", args: ["/V:ON"] });
        setConfig(TerminalChatAgentToolsSettingId.TerminalProfileWindows, customProfile);
        const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
        strictEqual(result, customProfile);
      });
      (isLinux ? test : test.skip)("should fall back to default shell when no custom profile is configured", async () => {
        runInTerminalTool.setBackendOs(OperatingSystem.Linux);
        setConfig(TerminalChatAgentToolsSettingId.TerminalProfileLinux, null);
        const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
        strictEqual(typeof result, "object");
        strictEqual(result.path, "bash");
      });
    });
  });
  suite("denial info in disclaimers", () => {
    function getDisclaimerValue(disclaimer) {
      if (!disclaimer) {
        return void 0;
      }
      return typeof disclaimer === "string" ? disclaimer : disclaimer.value;
    }
    test("should include denial reason in disclaimer when command is denied by rule", async () => {
      setAutoApprove({
        npm: { approve: false }
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
      ok(disclaimerValue, "Expected disclaimer to be defined");
      ok(disclaimerValue.includes("denied"), "Expected disclaimer to mention denial");
      ok(disclaimerValue.includes("npm"), "Expected disclaimer to mention the denied rule");
    });
    test("should include link to settings in denial disclaimer", async () => {
      setAutoApprove({
        rm: { approve: false }
      });
      const result = await executeToolTest({
        command: "rm -rf temp",
        explanation: "Remove temp folder",
        goal: "Remove temp folder"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      ok(result?.confirmationMessages?.disclaimer, "Expected disclaimer to be defined");
      const disclaimer = result.confirmationMessages.disclaimer;
      ok(typeof disclaimer !== "string" && disclaimer.isTrusted, "Expected disclaimer to be trusted for command links");
    });
    test("should include denial reason for multiple denied sub-commands", async () => {
      setAutoApprove({
        rm: { approve: false },
        sudo: { approve: false }
      });
      const result = await executeToolTest({
        command: "sudo rm -rf /",
        explanation: "Dangerous command",
        goal: "Dangerous command"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
      ok(disclaimerValue, "Expected disclaimer to be defined");
      ok(disclaimerValue.includes("denied"), "Expected disclaimer to mention denial");
    });
    test("should not include denial info when auto-approve is disabled", async () => {
      setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
      setAutoApprove({
        npm: { approve: false }
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
      if (disclaimerValue) {
        ok(!disclaimerValue.includes("denied"), "Should not mention denial when auto-approve is disabled");
      }
    });
    test("should not include denial info for commands that are simply not approved", async () => {
      setAutoApprove({
        echo: true
      });
      const result = await executeToolTest({
        command: "npm run build",
        explanation: "Build the project",
        goal: "Build the project"
      });
      assertConfirmationRequired(result, "Run `bash` command?");
      const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
      if (disclaimerValue) {
        ok(!disclaimerValue.includes("denied"), "Should not mention denial for non-denied commands");
      }
    });
  });
  suite("ConfirmTerminalCommandTool", () => {
    test("should require confirmation when sandbox is enabled but sandbox rewriting is disabled", async () => {
      sandboxEnabled = true;
      const { ConfirmTerminalCommandTool } = await import("../../browser/tools/runInTerminalConfirmationTool.js");
      const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
      const context = {
        parameters: {
          command: "ping google.com",
          explanation: "Ping google.com",
          goal: "Ping google.com",
          mode: "sync",
          timeout: 3e4
        }
      };
      const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result);
    });
    test("should require confirmation when sandbox is disabled", async () => {
      sandboxEnabled = false;
      setAutoApprove({});
      const { ConfirmTerminalCommandTool } = await import("../../browser/tools/runInTerminalConfirmationTool.js");
      const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
      const context = {
        parameters: {
          command: "echo hello",
          explanation: "Print hello",
          goal: "Print hello",
          mode: "sync",
          timeout: 3e4
        }
      };
      const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result);
    });
    test("should surface a sandbox-bypass title and reason when sandboxBypass is set, even with sandbox disabled", async () => {
      sandboxEnabled = false;
      setAutoApprove({});
      const { ConfirmTerminalCommandTool } = await import("../../browser/tools/runInTerminalConfirmationTool.js");
      const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
      const context = {
        parameters: {
          command: "cat ~/secret",
          explanation: "Read secret",
          goal: "Read secret",
          mode: "sync",
          timeout: 3e4,
          sandboxBypass: true,
          sandboxBypassReason: "Needs access outside the workspace"
        }
      };
      const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result, "Run in terminal outside the sandbox?");
      const message = result.confirmationMessages.message;
      const messageText = typeof message === "string" ? message : message?.value ?? "";
      ok(/outside the sandbox/i.test(messageText), `expected message to mention the sandbox, got: ${messageText}`);
      ok(messageText.includes("Needs access outside the workspace"), `expected message to include the reason, got: ${messageText}`);
    });
    test("should force a sandbox-bypass confirmation even when the command would be auto-approved", async () => {
      sandboxEnabled = false;
      setAutoApprove({ cat: true });
      const { ConfirmTerminalCommandTool } = await import("../../browser/tools/runInTerminalConfirmationTool.js");
      const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));
      const context = {
        parameters: {
          command: "cat ~/secret",
          explanation: "Read secret",
          goal: "Read secret",
          mode: "sync",
          timeout: 3e4,
          sandboxBypass: true
        }
      };
      const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
      assertConfirmationRequired(result, "Run in terminal outside the sandbox?");
    });
  });
});
suite("ChatAgentToolsContribution - tool registration refresh", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let registeredToolData;
  let pendingToolDataRegistration;
  let sandboxEnabled;
  setup(() => {
    configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
    registeredToolData = /* @__PURE__ */ new Map();
    pendingToolDataRegistration = void 0;
    sandboxEnabled = false;
    const logService = new NullLogService();
    const fileService = store.add(new FileService(logService));
    const fileSystemProvider = new TestIPCFileSystemProvider();
    store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    const terminalServiceDisposeEmitter = store.add(new Emitter());
    const chatServiceDisposeEmitter = store.add(new Emitter());
    const chatSessionArchivedEmitter = store.add(new Emitter());
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService,
      fileService: () => fileService
    }, store);
    instantiationService.stub(IChatService, {
      onDidDisposeSession: chatServiceDisposeEmitter.event,
      getSession: () => void 0
    });
    instantiationService.stub(IAgentSessionsService, {
      onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
      model: {
        onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event
      }
    });
    const terminalInstancesChangedEmitter = store.add(new Emitter());
    instantiationService.stub(ITerminalService, {
      onDidDisposeInstance: terminalServiceDisposeEmitter.event,
      onDidChangeInstances: terminalInstancesChangedEmitter.event,
      foregroundInstances: [],
      setNextCommandId: async () => {
      }
    });
    instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
    instantiationService.stub(IHistoryService, {
      getLastActiveWorkspaceRoot: () => void 0
    });
    const terminalSandboxService = {
      _serviceBrand: void 0,
      isEnabled: async () => sandboxEnabled,
      isSandboxAllowNetworkEnabled: async () => false,
      wrapCommand: async (command) => ({
        command: `sandbox:${command}`,
        isSandboxWrapped: true
      }),
      checkFileAccess: async () => ({ allowed: true, denied: [] }),
      getSandboxConfigPath: async () => sandboxEnabled ? "/tmp/sandbox.json" : void 0,
      checkForSandboxingPrereqs: async () => ({ enabled: sandboxEnabled, sandboxConfigPath: sandboxEnabled ? "/tmp/sandbox.json" : void 0, failedCheck: void 0 }),
      getTempDir: () => void 0,
      setNeedsForceUpdateConfigFile: () => {
      },
      getOS: async () => OperatingSystem.Linux,
      getResolvedNetworkDomains: () => ({ allowedDomains: [], deniedDomains: [] }),
      getMissingSandboxDependencies: async () => [],
      installMissingSandboxDependencies: async () => ({ exitCode: 0 }),
      runSandboxRemediation: async () => ({ exitCode: 0 })
    };
    instantiationService.stub(ITerminalSandboxService, terminalSandboxService);
    const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
    treeSitterLibraryService.isTest = true;
    instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);
    instantiationService.stub(ITerminalProfileResolverService, {
      getDefaultProfile: async () => ({ path: "bash" })
    });
    const contextKeyService = instantiationService.get(IContextKeyService);
    const registeredToolImpls = /* @__PURE__ */ new Map();
    const mockToolsService = {
      _serviceBrand: void 0,
      onDidChangeTools: Event.None,
      registerToolData(toolData) {
        registeredToolData.set(toolData.id, toolData);
        pendingToolDataRegistration?.complete();
        return toDisposable(() => registeredToolData.delete(toolData.id));
      },
      registerToolImplementation(id, tool) {
        registeredToolImpls.set(id, tool);
        return toDisposable(() => registeredToolImpls.delete(id));
      },
      registerTool(toolData, tool) {
        registeredToolData.set(toolData.id, toolData);
        registeredToolImpls.set(toolData.id, tool);
        return toDisposable(() => {
          registeredToolData.delete(toolData.id);
          registeredToolImpls.delete(toolData.id);
          if (isDisposable(tool)) {
            tool.dispose();
          }
        });
      },
      getTools() {
        return registeredToolData.values();
      },
      executeToolSet: new ToolSet("execute", "execute", Codicon.play, ToolDataSource.Internal, void 0, void 0, void 0, void 0, void 0, contextKeyService),
      readToolSet: new ToolSet("read", "read", Codicon.book, ToolDataSource.Internal, void 0, void 0, void 0, void 0, void 0, contextKeyService)
    };
    instantiationService.stub(ILanguageModelToolsService, mockToolsService);
    instantiationService.stub(IToolResultCompressor, {
      _serviceBrand: void 0,
      registerFilter: () => {
      },
      registerCache: () => {
      },
      maybeCompress: () => void 0
    });
  });
  async function waitForToolDataRegistration(trigger) {
    const registration = new DeferredPromise();
    pendingToolDataRegistration = registration;
    try {
      trigger();
      await registration.p;
    } finally {
      pendingToolDataRegistration = void 0;
    }
  }
  async function createContribution() {
    let contribution;
    await waitForToolDataRegistration(() => {
      contribution = store.add(instantiationService.createInstance(ChatAgentToolsContribution));
    });
    ok(contribution);
    return contribution;
  }
  test("should register run_in_terminal tool on construction", async () => {
    await createContribution();
    ok(registeredToolData.has(TerminalToolId.RunInTerminal), "Expected run_in_terminal tool to be registered");
  });
  test("should refresh run_in_terminal tool data when sandbox setting changes", async () => {
    await createContribution();
    const toolDataBefore = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataBefore, "Expected run_in_terminal tool to be registered");
    const propertiesBefore = toolDataBefore.inputSchema?.properties;
    ok(!propertiesBefore?.["requestUnsandboxedExecution"], "Expected no requestUnsandboxedExecution before enabling sandbox");
    await waitForToolDataRegistration(() => {
      sandboxEnabled = true;
      configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxEnabled,
        affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxEnabled]),
        source: ConfigurationTarget.USER,
        change: null
      });
    });
    const toolDataAfter = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataAfter, "Expected run_in_terminal tool to still be registered");
    const propertiesAfter = toolDataAfter.inputSchema?.properties;
    ok(propertiesAfter?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution after enabling sandbox");
  });
  test("should refresh run_in_terminal tool data when unsandboxed command allowance changes", async () => {
    sandboxEnabled = true;
    await createContribution();
    const toolDataBefore = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataBefore, "Expected run_in_terminal tool to be registered");
    const propertiesBefore = toolDataBefore.inputSchema?.properties;
    ok(propertiesBefore?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution before disabling unsandboxed commands");
    await waitForToolDataRegistration(() => {
      configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, false);
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (key) => key === AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands,
        affectedKeys: /* @__PURE__ */ new Set([AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]),
        source: ConfigurationTarget.USER,
        change: null
      });
    });
    const toolDataAfter = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataAfter, "Expected run_in_terminal tool to still be registered");
    const propertiesAfter = toolDataAfter.inputSchema?.properties;
    ok(!propertiesAfter?.["requestUnsandboxedExecution"], "Expected requestUnsandboxedExecution to be removed after disabling unsandboxed commands");
  });
  test("should refresh run_in_terminal tool data when sandbox network setting changes", async () => {
    sandboxEnabled = true;
    await createContribution();
    const toolDataBefore = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataBefore, "Expected run_in_terminal tool to be registered");
    await waitForToolDataRegistration(() => {
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: (key) => key === AgentNetworkDomainSettingId.AllowedNetworkDomains,
        affectedKeys: /* @__PURE__ */ new Set([AgentNetworkDomainSettingId.AllowedNetworkDomains]),
        source: ConfigurationTarget.USER,
        change: null
      });
    });
    const toolDataAfter = registeredToolData.get(TerminalToolId.RunInTerminal);
    ok(toolDataAfter, "Expected run_in_terminal tool to still be registered after network setting change");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXHJ1bkluVGVybWluYWxUb29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBjb3VudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCB0eXBlIFNpbmdsZU9yTWFueSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgdG9Xb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvYnJvd3Nlci90cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SVBDRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9lbGVjdHJvbi1icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSwgdHlwZSBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgdHlwZSBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwsIHR5cGUgSUNoYXRSZXF1ZXN0TW9kZUluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RUZXh0UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNhbmRib3hTZXJ2aWNlLCBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjaywgVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbiwgdHlwZSBJVGVybWluYWxTYW5kYm94Q29tbWFuZCwgdHlwZSBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMsIHR5cGUgSVRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbFByb2dyZXNzLCBUb29sU2V0LCB0eXBlIFRvb2xDb25maXJtYXRpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUb29sUmVzdWx0Q29tcHJlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL3Rvb2xSZXN1bHRDb21wcmVzc29yLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENoYXRTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlLCB0eXBlIElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbW1hbmRMaW5lUHJlc2VudGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9jb21tYW5kTGluZVByZXNlbnRlci9jb21tYW5kTGluZVByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSdW5JblRlcm1pbmFsVG9vbERhdGEsIG91dHB1dExvb2tzQnViYmxld3JhcEhvc3RSZXN0cmljdGVkLCBSdW5JblRlcm1pbmFsVG9vbCwgc2hvdWxkQXV0b21hdGljYWxseVJldHJ5QWxsb3dOZXR3b3JrSW5TYW5kYm94ZWQsIHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeVVuc2FuZGJveGVkLCB0eXBlIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL3J1bkluVGVybWluYWxUb29sLmpzJztcbmltcG9ydCB7IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29sVGVybWluYWxDcmVhdG9yLmpzJztcbmltcG9ydCB7IHRlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLCBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25ldHdvcmtGaWx0ZXIvY29tbW9uL3NldHRpbmdzLmpzJztcbmltcG9ydCB7IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSwgQWdlbnRTYW5kYm94U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2FuZGJveC9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci90ZXJtaW5hbENoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBpc0Rpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRUb29sc0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWwuY2hhdEFnZW50VG9vbHMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVG9vbElkIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy90b29sSWRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuXG5jbGFzcyBUZXN0UnVuSW5UZXJtaW5hbFRvb2wgZXh0ZW5kcyBSdW5JblRlcm1pbmFsVG9vbCB7XG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb3NCYWNrZW5kOiBQcm9taXNlPE9wZXJhdGluZ1N5c3RlbT4gPSBQcm9taXNlLnJlc29sdmUoT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXG5cdGdldCBzZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMoKSB7IHJldHVybiB0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnM7IH1cblx0Z2V0IHNlc3Npb25UZXJtaW5hbEluc3RhbmNlcygpIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlczsgfVxuXHRnZXQgcHJvZmlsZUZldGNoZXIoKSB7IHJldHVybiB0aGlzLl9wcm9maWxlRmV0Y2hlcjsgfVxuXHRnZXQgY29tbWFuZExpbmVQcmVzZW50ZXJzKCk6IElDb21tYW5kTGluZVByZXNlbnRlcltdIHsgcmV0dXJuICh0aGlzIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgSUNvbW1hbmRMaW5lUHJlc2VudGVyW10+KVsnX2NvbW1hbmRMaW5lUHJlc2VudGVycyddOyB9XG5cdGdldEJ1YmJsZXdyYXBIb3N0UmVzdHJpY3RlZFJlc3VsdCgpOiBJVG9vbFJlc3VsdCB7XG5cdFx0cmV0dXJuICh0aGlzIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgKCkgPT4gSVRvb2xSZXN1bHQ+KVsnX2dldEJ1YmJsZXdyYXBIb3N0UmVzdHJpY3RlZFJlc3VsdCddKCk7XG5cdH1cblx0ZGlzYWJsZVByb2Nlc3NJZEFzc29jaWF0aW9uKCk6IHZvaWQge1xuXHRcdCh0aGlzIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgKCkgPT4gUHJvbWlzZTx2b2lkPj4pWydfc2V0dXBQcm9jZXNzSWRBc3NvY2lhdGlvbiddID0gYXN5bmMgKCkgPT4geyB9O1xuXHR9XG5cblx0c2V0QmFja2VuZE9zKG9zOiBPcGVyYXRpbmdTeXN0ZW0pIHtcblx0XHR0aGlzLl9vc0JhY2tlbmQgPSBQcm9taXNlLnJlc29sdmUob3MpO1xuXHR9XG59XG5cbnN1aXRlKCdSdW5JblRlcm1pbmFsVG9vbCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRsZXQgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZTtcblx0bGV0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBUZXN0Q29udGV4dFNlcnZpY2U7XG5cdGxldCB0ZXJtaW5hbFNlcnZpY2VEaXNwb3NlRW1pdHRlcjogRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT47XG5cdGxldCBjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyOiBFbWl0dGVyPHsgc2Vzc2lvblJlc291cmNlczogVVJJW107IHJlYXNvbjogJ2NsZWFyZWQnIH0+O1xuXHRsZXQgY2hhdFNlc3Npb25BcmNoaXZlZEVtaXR0ZXI6IEVtaXR0ZXI8SUFnZW50U2Vzc2lvbj47XG5cdGxldCBjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHM6IHsgc2Vzc2lvblJlc291cmNlOiBVUkk7IG1lc3NhZ2U6IHN0cmluZzsgb3B0aW9ucz86IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zIH1bXTtcblx0bGV0IHNhbmRib3hFbmFibGVkOiBib29sZWFuO1xuXHRsZXQgc2FuZGJveFByZXJlcVJlc3VsdDogSVRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrUmVzdWx0O1xuXHRsZXQgdGVybWluYWxTYW5kYm94U2VydmljZTogSVRlcm1pbmFsU2FuZGJveFNlcnZpY2U7XG5cdGxldCBjcmVhdGVkVGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7XG5cdGxldCBjcmVhdGVUZXJtaW5hbENhbGxDb3VudDogbnVtYmVyO1xuXHRsZXQgY2hhdFNlc3Npb25zOiBNYXA8c3RyaW5nLCBDaGF0TW9kZWw+O1xuXHRsZXQgY2hhdFNlc3Npb25Db250cmlidXRpb246IFJldHVyblR5cGU8SUNoYXRTZXNzaW9uc1NlcnZpY2VbJ2dldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uJ10+O1xuXG5cdGxldCBydW5JblRlcm1pbmFsVG9vbDogVGVzdFJ1bkluVGVybWluYWxUb29sO1xuXG5cdGZ1bmN0aW9uIGlzRGVmYXVsdENoYXRQZXJtaXNzaW9uU2FuZGJveFByZWNoZWNrSW5wdXRzKHByZWNoZWNrSW5wdXRzOiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcHJlY2hlY2tJbnB1dHM/LmlzRGVmYXVsdEFwcHJvdmFsUGVybWlzc2lvbkVuYWJsZWQgIT09IGZhbHNlO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gbmV3IFRlc3RJUENGaWxlU3lzdGVtUHJvdmlkZXIoKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXG5cdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUsIHRydWUpO1xuXHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkJsb2NrRGV0ZWN0ZWRGaWxlV3JpdGVzLCAnb3V0c2lkZVdvcmtzcGFjZScpO1xuXHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLlRlcm1pbmFsUHJvZmlsZUxpbnV4LCBPYmplY3QuZnJlZXplKHsgcGF0aDogJ2Jhc2gnIH0pKTtcblx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcywgdHJ1ZSk7XG5cdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd0F1dG9BcHByb3ZlLCBmYWxzZSk7XG5cdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29tbWFuZEZpbmlzaGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZDsgZ2V0T3V0cHV0KCk6IHN0cmluZyB9PigpO1xuXHRcdGNvbnN0IG9uRGlzcG9zZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCk7XG5cdFx0Y29uc3Qgb25FeGl0RW1pdHRlciA9IG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblx0XHRjb25zdCBvbkRpZEFkZENhcGFiaWxpdHlFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBpZDogVGVybWluYWxDYXBhYmlsaXR5IH0+KCk7XG5cdFx0Y29uc3Qgb25EaWRJbnB1dERhdGFFbWl0dGVyID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRcdGNvbnN0IG9uRGF0YUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgbWFya2VyID0ge1xuXHRcdFx0bGluZTogMCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdG9uRGlzcG9zZTogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHRcdGNvbnN0IHh0ZXJtID0ge1xuXHRcdFx0Z2V0Q29udGVudHNBc1RleHQ6ICgpID0+ICcnLFxuXHRcdFx0cmF3OiB7XG5cdFx0XHRcdG9uRGF0YTogb25EYXRhRW1pdHRlci5ldmVudCxcblx0XHRcdFx0cmVnaXN0ZXJNYXJrZXI6ICgpID0+IG1hcmtlcixcblx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0YWN0aXZlOiB7fSxcblx0XHRcdFx0XHRhbHRlcm5hdGU6IHt9LFxuXHRcdFx0XHRcdG9uQnVmZmVyQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNyZWF0ZVRlcm1pbmFsQ2FsbENvdW50ID0gMDtcblx0XHRjcmVhdGVkVGVybWluYWxJbnN0YW5jZSA9IHtcblx0XHRcdGluc3RhbmNlSWQ6IDEsXG5cdFx0XHRwcm9jZXNzSWQ6IDEsXG5cdFx0XHRwcm9jZXNzUmVhZHk6IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZSh4dGVybSksXG5cdFx0XHRvbkRhdGE6IG9uRGF0YUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkV4aXQ6IG9uRXhpdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRzZW5kVGV4dDogYXN5bmMgKF90ZXh0OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Ly8gU2ltdWxhdGUgc3VjY2Vzc2Z1bCBjb21tYW5kIGNvbXBsZXRpb24gYWZ0ZXIgc2VuZFRleHRcblx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdG9uRGF0YUVtaXR0ZXIuZmlyZSgnXFx4MWJdNjMzO0NcXHgwN1xceDFiXTYzMztBXFx4MDcnKTtcblx0XHRcdFx0XHRjb21tYW5kRmluaXNoZWRFbWl0dGVyLmZpcmUoeyBleGl0Q29kZTogMCwgZ2V0T3V0cHV0OiAoKSA9PiAnJyB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXM6ICgpID0+IHsgfSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRnZXQ6IChjYXA6IFRlcm1pbmFsQ2FwYWJpbGl0eSkgPT4ge1xuXHRcdFx0XHRcdGlmIChjYXAgPT09IFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRjb21tYW5kczogW10sXG5cdFx0XHRcdFx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkOiBjb21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25EaWRBZGRDYXBhYmlsaXR5OiBvbkRpZEFkZENhcGFiaWxpdHlFbWl0dGVyLmV2ZW50LFxuXHRcdFx0fSxcblx0XHRcdG9uRGlkSW5wdXREYXRhOiBvbkRpZElucHV0RGF0YUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpc3Bvc2VkOiBvbkRpc3Bvc2VkRW1pdHRlci5ldmVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0b25FeGl0RW1pdHRlci5maXJlKDApO1xuXHRcdFx0XHRvbkRpc3Bvc2VkRW1pdHRlci5maXJlKGNyZWF0ZWRUZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRDd2RSZXNvdXJjZTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNEaXNwb3NlZDogZmFsc2UsXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdHRlcm1pbmFsU2VydmljZURpc3Bvc2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCk7XG5cdFx0Y2hhdFNlcnZpY2VEaXNwb3NlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgc2Vzc2lvblJlc291cmNlczogVVJJW107IHJlYXNvbjogJ2NsZWFyZWQnIH0+KCk7XG5cdFx0Y2hhdFNlc3Npb25BcmNoaXZlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJQWdlbnRTZXNzaW9uPigpO1xuXHRcdGNhcHR1cmVkU3RlZXJpbmdSZXF1ZXN0cyA9IFtdO1xuXHRcdGNoYXRTZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBDaGF0TW9kZWw+KCk7XG5cdFx0Y2hhdFNlc3Npb25Db250cmlidXRpb24gPSB1bmRlZmluZWQ7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlOiAoKSA9PiBmaWxlU2VydmljZSxcblx0XHR9LCBzdG9yZSk7XG5cblx0XHRjb25zdCBjaGF0U2VydmljZVN0dWIgPSB7XG5cdFx0XHRvbkRpZERpc3Bvc2VTZXNzaW9uOiBjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyLmV2ZW50LFxuXHRcdFx0Z2V0U2Vzc2lvbjogKHNlc3Npb25SZXNvdXJjZTogVVJJKSA9PiBjaGF0U2Vzc2lvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdHNlbmRSZXF1ZXN0OiBhc3luYyAoc2Vzc2lvblJlc291cmNlOiBVUkksIG1lc3NhZ2U6IHN0cmluZywgb3B0aW9ucz86IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zKSA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkU3RlZXJpbmdSZXF1ZXN0cy5wdXNoKHsgc2Vzc2lvblJlc291cmNlLCBtZXNzYWdlLCBvcHRpb25zIH0pO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb246ICd0ZXN0JyB9O1xuXHRcdFx0fSxcblx0XHRcdGFjcXVpcmVFeGlzdGluZ1Nlc3Npb246ICgpID0+ICh7XG5cdFx0XHRcdG9iamVjdDoge1xuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RPYnM6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSBhcyB1bmtub3duIGFzIE5vbk51bGxhYmxlPFJldHVyblR5cGU8SUNoYXRTZXJ2aWNlWydhY3F1aXJlRXhpc3RpbmdTZXNzaW9uJ10+Pixcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRTZXJ2aWNlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBjaGF0U2VydmljZVN0dWIpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlOiBjaGF0U2Vzc2lvbkFyY2hpdmVkRW1pdHRlci5ldmVudCxcblx0XHRcdG1vZGVsOiB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGU6IGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0fSBhcyBJQWdlbnRTZXNzaW9uc1NlcnZpY2VbJ21vZGVsJ11cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0XHRnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbjogKCkgPT4gY2hhdFNlc3Npb25Db250cmlidXRpb24sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRjcmVhdGVUZXJtaW5hbDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjcmVhdGVUZXJtaW5hbENhbGxDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlZFRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0XHR9LFxuXHRcdFx0Zm9yZWdyb3VuZEluc3RhbmNlczogW10sXG5cdFx0XHRjcmVhdGVPbkluc3RhbmNlQ2FwYWJpbGl0eUV2ZW50OiAoKSA9PiAoeyBldmVudDogRXZlbnQuTm9uZSwgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0b25EaWREaXNwb3NlSW5zdGFuY2U6IHRlcm1pbmFsU2VydmljZURpc3Bvc2VFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWRDaGFuZ2VJbnN0YW5jZXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRyZXZlYWxUZXJtaW5hbDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0c2V0QWN0aXZlSW5zdGFuY2U6ICgpID0+IHsgfSxcblx0XHRcdHNldE5leHRDb21tYW5kSWQ6IGFzeW5jICgpID0+IHsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbENoYXRTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSGlzdG9yeVNlcnZpY2UsIHtcblx0XHRcdGdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290OiAoKSA9PiB1bmRlZmluZWRcblx0XHR9KTtcblx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0aXNFbmFibGVkOiBhc3luYyAocHJlY2hlY2tJbnB1dHMpID0+IHNhbmRib3hFbmFibGVkICYmIGlzRGVmYXVsdENoYXRQZXJtaXNzaW9uU2FuZGJveFByZWNoZWNrSW5wdXRzKHByZWNoZWNrSW5wdXRzKSxcblx0XHRcdGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQ6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0d3JhcENvbW1hbmQ6IGFzeW5jIChjb21tYW5kOiBzdHJpbmcsIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj86IGJvb2xlYW4pID0+ICh7XG5cdFx0XHRcdGNvbW1hbmQ6IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiA/IGB1bnNhbmRib3hlZDoke2NvbW1hbmR9YCA6IGBzYW5kYm94OiR7Y29tbWFuZH1gLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiAhcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLFxuXHRcdFx0fSksXG5cdFx0XHRjaGVja0ZpbGVBY2Nlc3M6IGFzeW5jICgpID0+ICh7IGFsbG93ZWQ6IHRydWUsIGRlbmllZDogW10gfSksXG5cdFx0XHRnZXRTYW5kYm94Q29uZmlnUGF0aDogYXN5bmMgKCkgPT4gc2FuZGJveEVuYWJsZWQgPyAnL3RtcC9zYW5kYm94Lmpzb24nIDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxczogYXN5bmMgKF9mb3JjZVJlZnJlc2g/OiBib29sZWFuLCBwcmVjaGVja0lucHV0cz86IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cykgPT4gaXNEZWZhdWx0Q2hhdFBlcm1pc3Npb25TYW5kYm94UHJlY2hlY2tJbnB1dHMocHJlY2hlY2tJbnB1dHMpXG5cdFx0XHRcdD8gc2FuZGJveFByZXJlcVJlc3VsdFxuXHRcdFx0XHQ6IHsgZW5hYmxlZDogZmFsc2UsIHNhbmRib3hDb25maWdQYXRoOiB1bmRlZmluZWQsIGZhaWxlZENoZWNrOiB1bmRlZmluZWQgfSxcblx0XHRcdGdldFRlbXBEaXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHNldE5lZWRzRm9yY2VVcGRhdGVDb25maWdGaWxlOiAoKSA9PiB7IH0sXG5cdFx0XHRnZXRPUzogYXN5bmMgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLkxpbnV4LFxuXHRcdFx0Z2V0UmVzb2x2ZWROZXR3b3JrRG9tYWluczogKCkgPT4gKHsgYWxsb3dlZERvbWFpbnM6IFtdLCBkZW5pZWREb21haW5zOiBbXSB9KSxcblx0XHRcdGdldE1pc3NpbmdTYW5kYm94RGVwZW5kZW5jaWVzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdGluc3RhbGxNaXNzaW5nU2FuZGJveERlcGVuZGVuY2llczogYXN5bmMgKG1pc3NpbmdEZXBlbmRlbmNpZXMsIF9zZXNzaW9uUmVzb3VyY2UsIF90b2tlbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXJtaW5hbCA9IGF3YWl0IG9wdGlvbnMuY3JlYXRlVGVybWluYWwoKTtcblx0XHRcdFx0YXdhaXQgb3B0aW9ucy5mb2N1c1Rlcm1pbmFsKHRlcm1pbmFsKTtcblx0XHRcdFx0YXdhaXQgdGVybWluYWwuc2VuZFRleHQoYHN1ZG8gYXB0IGluc3RhbGwgLXkgJHttaXNzaW5nRGVwZW5kZW5jaWVzLmpvaW4oJyAnKX1gLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuIHsgZXhpdENvZGU6IDAgfTtcblx0XHRcdH0sXG5cdFx0XHRydW5TYW5kYm94UmVtZWRpYXRpb246IGFzeW5jICgpID0+ICh7IGV4aXRDb2RlOiAwIH0pLFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTYW5kYm94U2VydmljZSwgdGVybWluYWxTYW5kYm94U2VydmljZSk7XG5cblx0XHRjb25zdCB0cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlKSk7XG5cdFx0dHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmlzVGVzdCA9IHRydWU7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLCB0cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwge1xuXHRcdFx0Z2V0VG9vbHMoKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB7XG5cdFx0XHRzZWxlY3RMYW5ndWFnZU1vZGVsczogYXN5bmMgKCkgPT4gWydjb3BpbG90L2NvcGlsb3QtdXRpbGl0eS1zbWFsbCddLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIHtcblx0XHRcdGdldERlZmF1bHRQcm9maWxlOiBhc3luYyAoKSA9PiAoeyBwYXRoOiAnYmFzaCcgfSBhcyBJVGVybWluYWxQcm9maWxlKVxuXHRcdH0pO1xuXG5cdFx0c3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cy5UZXJtaW5hbEF1dG9BcHByb3ZlV2FybmluZ0FjY2VwdGVkLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRydW5JblRlcm1pbmFsVG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UnVuSW5UZXJtaW5hbFRvb2wpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gc2V0QXV0b0FwcHJvdmUodmFsdWU6IHsgW2tleTogc3RyaW5nXTogeyBhcHByb3ZlOiBib29sZWFuOyBtYXRjaENvbW1hbmRMaW5lPzogYm9vbGVhbiB9IHwgYm9vbGVhbiB9KSB7XG5cdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUsIHZhbHVlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldENvbmZpZyhrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihrZXksIHZhbHVlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUsXG5cdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW2tleV0pLFxuXHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRjaGFuZ2U6IG51bGwhLFxuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gY2xlYXJBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZFN0YXRlKCkge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cy5UZXJtaW5hbEF1dG9BcHByb3ZlV2FybmluZ0FjY2VwdGVkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4ZWN1dGVzIGEgdGVzdCBzY2VuYXJpbyBmb3IgdGhlIFJ1bkluVGVybWluYWxUb29sXG5cdCAqL1xuXHRhc3luYyBmdW5jdGlvbiBleGVjdXRlVG9vbFRlc3QoXG5cdFx0cGFyYW1zOiBQYXJ0aWFsPElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXM+XG5cdCk6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQgPSB7XG5cdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdQcmludCBoZWxsbyB0byB0aGUgY29uc29sZScsXG5cdFx0XHRcdGdvYWw6ICdQcmludCBoZWxsbycsXG5cdFx0XHRcdC4uLnBhcmFtc1xuXHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zXG5cdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5JblRlcm1pbmFsVG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGludm9rZVRvb2xUZXN0KFxuXHRcdHBhcmFtczogUGFydGlhbDxJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zPixcblx0XHRzZWxlY3RlZEN1c3RvbUJ1dHRvbj86IHN0cmluZyxcblx0KTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSB7XG5cdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRleHBsYW5hdGlvbjogJ1ByaW50IGhlbGxvIHRvIHRoZSBjb25zb2xlJyxcblx0XHRcdGdvYWw6ICdQcmludCBoZWxsbycsXG5cdFx0XHQuLi5wYXJhbXNcblx0XHR9IGFzIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXM7XG5cdFx0Y29uc3QgcHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgcnVuSW5UZXJtaW5hbFRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHsgcGFyYW1ldGVycyB9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0b2socHJlcGFyZWRJbnZvY2F0aW9uPy50b29sU3BlY2lmaWNEYXRhLCAnRXhwZWN0ZWQgdG9vbFNwZWNpZmljRGF0YSB0byBiZSBkZWZpbmVkJyk7XG5cblx0XHRjb25zdCBjb3VudFRva2VucyA9IGFzeW5jICgpID0+IDA7XG5cdFx0Y29uc3Qgbm9Qcm9ncmVzczogVG9vbFByb2dyZXNzID0geyByZXBvcnQoKSB7IH0gfTtcblx0XHRyZXR1cm4gcnVuSW5UZXJtaW5hbFRvb2wuaW52b2tlKHtcblx0XHRcdGNhbGxJZDogJ3Rlc3QtY2FsbCcsXG5cdFx0XHR0b29sSWQ6IFRlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWwsXG5cdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0Y29udGV4dDogeyBzZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigncnVuLWluLXRlcm1pbmFsLXRlc3QnKSB9LFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogcHJlcGFyZWRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRzZWxlY3RlZEN1c3RvbUJ1dHRvbixcblx0XHR9IGFzIElUb29sSW52b2NhdGlvbiwgY291bnRUb2tlbnMsIG5vUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNTZXBhcmF0b3IoYWN0aW9uOiBUb29sQ29uZmlybWF0aW9uQWN0aW9uKTogYWN0aW9uIGlzIFNlcGFyYXRvciB7XG5cdFx0cmV0dXJuIGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBIZWxwZXIgdG8gYXNzZXJ0IHRoYXQgYSBjb21tYW5kIHNob3VsZCBiZSBhdXRvLWFwcHJvdmVkIChubyBjb25maXJtYXRpb24gcmVxdWlyZWQpXG5cdCAqL1xuXHRmdW5jdGlvbiBhc3NlcnRBdXRvQXBwcm92ZWQocHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCkge1xuXHRcdG9rKHByZXBhcmVkSW52b2NhdGlvbiwgJ0V4cGVjdGVkIHByZXBhcmVkIGludm9jYXRpb24gdG8gYmUgZGVmaW5lZCcpO1xuXHRcdG9rKCFwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMsICdFeHBlY3RlZCBubyBjb25maXJtYXRpb24gbWVzc2FnZXMgZm9yIGF1dG8tYXBwcm92ZWQgY29tbWFuZCcpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhlbHBlciB0byBhc3NlcnQgdGhhdCBhIGNvbW1hbmQgcmVxdWlyZXMgY29uZmlybWF0aW9uXG5cdCAqL1xuXHRmdW5jdGlvbiBhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChwcmVwYXJlZEludm9jYXRpb246IElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkLCBleHBlY3RlZFRpdGxlPzogc3RyaW5nKSB7XG5cdFx0b2socHJlcGFyZWRJbnZvY2F0aW9uLCAnRXhwZWN0ZWQgcHJlcGFyZWQgaW52b2NhdGlvbiB0byBiZSBkZWZpbmVkJyk7XG5cdFx0b2socHJlcGFyZWRJbnZvY2F0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAnRXhwZWN0ZWQgY29uZmlybWF0aW9uIG1lc3NhZ2VzIGZvciBub24tYXBwcm92ZWQgY29tbWFuZCcpO1xuXHRcdGlmIChleHBlY3RlZFRpdGxlKSB7XG5cdFx0XHRzdHJpY3RFcXVhbChwcmVwYXJlZEludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXMhLnRpdGxlLCBleHBlY3RlZFRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDaGF0TW9kZUluZm8ocGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogSUNoYXRSZXF1ZXN0TW9kZUluZm8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiB1bmRlZmluZWQsXG5cdFx0XHRpc0J1aWx0aW46IHRydWUsXG5cdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDaGF0TW9kZWxXaXRoUmVxdWVzdChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbW9kZUluZm8/OiBJQ2hhdFJlcXVlc3RNb2RlSW5mbywgcmVxdWVzdElkPzogc3RyaW5nKTogQ2hhdE1vZGVsIHtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCB0ZXh0ID0gJ3JldHJ5Jztcblx0XHRtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dCwgcGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgdGV4dC5sZW5ndGgsIDEsIHRleHQubGVuZ3RoKSwgdGV4dCldIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwLCBtb2RlSW5mbywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHJlcXVlc3RJZCk7XG5cdFx0Y2hhdFNlc3Npb25zLnNldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgbW9kZWwpO1xuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHR5cGUgQXV0b21hdGljU2FuZGJveFJldHJ5S2luZEZvclRlc3QgPSAndW5zYW5kYm94ZWQnIHwgJ2FsbG93TmV0d29yayc7XG5cblx0ZnVuY3Rpb24gY29uZmlybUF1dG9tYXRpY1NhbmRib3hSZXRyeSh0b29sOiBSdW5JblRlcm1pbmFsVG9vbCwgcmV0cnlLaW5kOiBBdXRvbWF0aWNTYW5kYm94UmV0cnlLaW5kRm9yVGVzdCwgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGNvbW1hbmQ6IHN0cmluZywgc2hlbGw6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuICh0b29sIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgKHJldHJ5S2luZDogQXV0b21hdGljU2FuZGJveFJldHJ5S2luZEZvclRlc3QsIHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjb21tYW5kOiBzdHJpbmcsIHNoZWxsOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgcmlza0Fzc2Vzc21lbnQ6IHsgdG9vbElkOiBzdHJpbmc7IHBhcmFtZXRlcnM6IHVua25vd24gfSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPGJvb2xlYW4+PilbJ19jb25maXJtQXV0b21hdGljU2FuZGJveFJldHJ5J10ocmV0cnlLaW5kLCBzZXNzaW9uUmVzb3VyY2UsIGNvbW1hbmQsIHNoZWxsLCBibG9ja2VkRG9tYWlucywgdW5kZWZpbmVkLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbmZpcm1BdXRvbWF0aWNVbnNhbmRib3hSZXRyeSh0b29sOiBSdW5JblRlcm1pbmFsVG9vbCwgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGNvbW1hbmQ6IHN0cmluZywgc2hlbGw6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIGNvbmZpcm1BdXRvbWF0aWNTYW5kYm94UmV0cnkodG9vbCwgJ3Vuc2FuZGJveGVkJywgc2Vzc2lvblJlc291cmNlLCBjb21tYW5kLCBzaGVsbCwgYmxvY2tlZERvbWFpbnMpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY29uZmlybUF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5KHRvb2w6IFJ1bkluVGVybWluYWxUb29sLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgY29tbWFuZDogc3RyaW5nLCBzaGVsbDogc3RyaW5nLCBibG9ja2VkRG9tYWluczogc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gY29uZmlybUF1dG9tYXRpY1NhbmRib3hSZXRyeSh0b29sLCAnYWxsb3dOZXR3b3JrJywgc2Vzc2lvblJlc291cmNlLCBjb21tYW5kLCBzaGVsbCwgYmxvY2tlZERvbWFpbnMpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0QXV0b21hdGljVW5zYW5kYm94UmV0cnlFbGljaXRhdGlvbih0b29sOiBSdW5JblRlcm1pbmFsVG9vbCwgc2Vzc2lvblJlc291cmNlOiBVUkksIGNvbW1hbmQ6IHN0cmluZywgc2hlbGw6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVDaGF0TW9kZWxXaXRoUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNob3VsZFJldHJ5ID0gY29uZmlybUF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5KHRvb2wsIHNlc3Npb25SZXNvdXJjZSwgY29tbWFuZCwgc2hlbGwsIGJsb2NrZWREb21haW5zKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXF1ZXN0Py5yZXNwb25zZTtcblx0XHRvayhyZXNwb25zZSwgJ0V4cGVjdGVkIGNoYXQgcmVxdWVzdCB3aXRoIHJlc3BvbnNlJyk7XG5cdFx0Y29uc3QgZWxpY2l0YXRpb24gPSByZXNwb25zZS5yZXNwb25zZS52YWx1ZS5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSAnZWxpY2l0YXRpb24yJyk7XG5cdFx0b2soZWxpY2l0YXRpb24/LmtpbmQgPT09ICdlbGljaXRhdGlvbjInLCAnRXhwZWN0ZWQgYXV0b21hdGljIHVuc2FuZGJveCByZXRyeSBlbGljaXRhdGlvbicpO1xuXHRcdGNvbnN0IHJlamVjdCA9IGVsaWNpdGF0aW9uLnJlamVjdDtcblx0XHRvayhyZWplY3QsICdFeHBlY3RlZCBhdXRvbWF0aWMgdW5zYW5kYm94IHJldHJ5IGVsaWNpdGF0aW9uIHRvIGhhdmUgYSByZWplY3QgYWN0aW9uJyk7XG5cblx0XHRhd2FpdCByZWplY3QoKTtcblx0XHRzdHJpY3RFcXVhbChhd2FpdCBzaG91bGRSZXRyeSwgZmFsc2UpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0QXV0b21hdGljQWxsb3dOZXR3b3JrUmV0cnlFbGljaXRhdGlvbih0b29sOiBSdW5JblRlcm1pbmFsVG9vbCwgc2Vzc2lvblJlc291cmNlOiBVUkksIGNvbW1hbmQ6IHN0cmluZywgc2hlbGw6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBleHBlY3RlZFRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZUNoYXRNb2RlbFdpdGhSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgc2hvdWxkUmV0cnkgPSBjb25maXJtQXV0b21hdGljQWxsb3dOZXR3b3JrUmV0cnkodG9vbCwgc2Vzc2lvblJlc291cmNlLCBjb21tYW5kLCBzaGVsbCwgYmxvY2tlZERvbWFpbnMpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3Q/LnJlc3BvbnNlO1xuXHRcdG9rKHJlc3BvbnNlLCAnRXhwZWN0ZWQgY2hhdCByZXF1ZXN0IHdpdGggcmVzcG9uc2UnKTtcblx0XHRjb25zdCBlbGljaXRhdGlvbiA9IHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdlbGljaXRhdGlvbjInKTtcblx0XHRvayhlbGljaXRhdGlvbj8ua2luZCA9PT0gJ2VsaWNpdGF0aW9uMicsICdFeHBlY3RlZCBhdXRvbWF0aWMgYWxsb3ctbmV0d29yayByZXRyeSBlbGljaXRhdGlvbicpO1xuXHRcdGNvbnN0IHRpdGxlID0gZWxpY2l0YXRpb24udGl0bGU7XG5cdFx0b2sodHlwZW9mIHRpdGxlICE9PSAnc3RyaW5nJywgJ0V4cGVjdGVkIGF1dG9tYXRpYyBhbGxvdy1uZXR3b3JrIHJldHJ5IHRpdGxlIHRvIGJlIG1hcmtkb3duJyk7XG5cdFx0c3RyaWN0RXF1YWwodGl0bGUudmFsdWUsIGV4cGVjdGVkVGl0bGUpO1xuXHRcdGNvbnN0IHJlamVjdCA9IGVsaWNpdGF0aW9uLnJlamVjdDtcblx0XHRvayhyZWplY3QsICdFeHBlY3RlZCBhdXRvbWF0aWMgYWxsb3ctbmV0d29yayByZXRyeSBlbGljaXRhdGlvbiB0byBoYXZlIGEgcmVqZWN0IGFjdGlvbicpO1xuXG5cdFx0YXdhaXQgcmVqZWN0KCk7XG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgc2hvdWxkUmV0cnksIGZhbHNlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldEF1dG9tYXRpY1NhbmRib3hSZXRyeVRpdGxlKHRvb2w6IFJ1bkluVGVybWluYWxUb29sLCByZXRyeUtpbmQ6IEF1dG9tYXRpY1NhbmRib3hSZXRyeUtpbmRGb3JUZXN0LCBzaGVsbFR5cGU6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogSU1hcmtkb3duU3RyaW5nIHtcblx0XHRyZXR1cm4gKHRvb2wgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCAocmV0cnlLaW5kOiBBdXRvbWF0aWNTYW5kYm94UmV0cnlLaW5kRm9yVGVzdCwgc2hlbGxUeXBlOiBzdHJpbmcsIGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCkgPT4gSU1hcmtkb3duU3RyaW5nPilbJ19nZXRBdXRvbWF0aWNTYW5kYm94UmV0cnlUaXRsZSddKHJldHJ5S2luZCwgc2hlbGxUeXBlLCBibG9ja2VkRG9tYWlucyk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRBdXRvbWF0aWNVbnNhbmRib3hSZXRyeVRpdGxlKHRvb2w6IFJ1bkluVGVybWluYWxUb29sLCBzaGVsbFR5cGU6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogSU1hcmtkb3duU3RyaW5nIHtcblx0XHRyZXR1cm4gZ2V0QXV0b21hdGljU2FuZGJveFJldHJ5VGl0bGUodG9vbCwgJ3Vuc2FuZGJveGVkJywgc2hlbGxUeXBlLCBibG9ja2VkRG9tYWlucyk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRBdXRvbWF0aWNBbGxvd05ldHdvcmtSZXRyeVRpdGxlKHRvb2w6IFJ1bkluVGVybWluYWxUb29sLCBzaGVsbFR5cGU6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogSU1hcmtkb3duU3RyaW5nIHtcblx0XHRyZXR1cm4gZ2V0QXV0b21hdGljU2FuZGJveFJldHJ5VGl0bGUodG9vbCwgJ2FsbG93TmV0d29yaycsIHNoZWxsVHlwZSwgYmxvY2tlZERvbWFpbnMpO1xuXHR9XG5cblx0c3VpdGUoJ3NhbmRib3ggaW52b2NhdGlvbiBtZXNzYWdpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGluc3RydWN0IG1vZGVscyB0byB1c2UgJFRNUERJUiBpbnN0ZWFkIG9mIC90bXAgd2hlbiBzYW5kYm94ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY3JlYXRlUnVuSW5UZXJtaW5hbFRvb2xEYXRhKTtcblxuXHRcdFx0b2sodG9vbERhdGEubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ1VzZSAkVE1QRElSIGZvciB0ZW1wb3JhcnkgZmlsZXMnKSwgJ0V4cGVjdGVkIHNhbmRib3hlZCB0b29sIGRlc2NyaXB0aW9uIHRvIHJlcXVpcmUgJFRNUERJUiB1c2FnZScpO1xuXHRcdFx0b2sodG9vbERhdGEubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJy90bXAgbWF5IG5vdCBiZSB3cml0YWJsZScpLCAnRXhwZWN0ZWQgc2FuZGJveGVkIHRvb2wgZGVzY3JpcHRpb24gdG8gZGlzY291cmFnZSAvdG1wIHVzYWdlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBzYW5kYm94IGVzY2FsYXRpb24gcmVxdWVzdHMgaW4gc2NoZW1hIHdoZW4gc2FuZGJveCBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY3JlYXRlUnVuSW5UZXJtaW5hbFRvb2xEYXRhKTtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXMgPSB0b29sRGF0YS5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+IHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUHJvcGVydHkgPSBwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddIGFzIHsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvblByb3BlcnR5ID0gcHJvcGVydGllcz8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24nXSBhcyB7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0QWxsb3dOZXR3b3JrUHJvcGVydHkgPSBwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmsnXSBhcyB7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uUHJvcGVydHkgPSBwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24nXSBhcyB7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1Byb3BlcnR5ID0gcHJvcGVydGllcz8uWydyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjayddIGFzIHsgZGVzY3JpcHRpb24/OiBzdHJpbmc7IHR5cGU/OiBzdHJpbmc7IGl0ZW1zPzogeyB0eXBlPzogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUmVhc29uUHJvcGVydHkgPSBwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUmVhc29uJ10gYXMgeyBkZXNjcmlwdGlvbj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRvayhwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddLCAnRXhwZWN0ZWQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGluIHNjaGVtYSB3aGVuIHNhbmRib3ggaXMgZW5hYmxlZCcpO1xuXHRcdFx0b2socHJvcGVydGllcz8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24nXSwgJ0V4cGVjdGVkIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGVuYWJsZWQnKTtcblx0XHRcdG9rKHByb3BlcnRpZXM/LlsncmVxdWVzdEFsbG93TmV0d29yayddLCAnRXhwZWN0ZWQgcmVxdWVzdEFsbG93TmV0d29yayBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGVuYWJsZWQnKTtcblx0XHRcdG9rKHByb3BlcnRpZXM/LlsncmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiddLCAnRXhwZWN0ZWQgcmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGVuYWJsZWQnKTtcblx0XHRcdG9rKHByb3BlcnRpZXM/LlsncmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2snXSwgJ0V4cGVjdGVkIHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrIGluIHNjaGVtYSB3aGVuIHNhbmRib3ggaXMgZW5hYmxlZCcpO1xuXHRcdFx0b2socHJvcGVydGllcz8uWydyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1JlYXNvbiddLCAnRXhwZWN0ZWQgcmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2tSZWFzb24gaW4gc2NoZW1hIHdoZW4gc2FuZGJveCBpcyBlbmFibGVkJyk7XG5cdFx0XHRvayhyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25Qcm9wZXJ0eT8uZGVzY3JpcHRpb24/LmluY2x1ZGVzKCdPbmx5IHNldCB0aGlzIHdoZW4gdGhlIGNvbW1hbmQgY2xlYXJseSBuZWVkcyB1bnNhbmRib3hlZCBhY2Nlc3MnKSwgJ0V4cGVjdGVkIHNjaGVtYSBkZXNjcmlwdGlvbiB0byByZXF1aXJlIGEgY2xlYXIgbmVlZCBmb3IgdW5zYW5kYm94ZWQgYWNjZXNzJyk7XG5cdFx0XHRvayhyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb25Qcm9wZXJ0eT8uZGVzY3JpcHRpb24/LmluY2x1ZGVzKCd3aHkgdGhpcyBjb21tYW5kIG11c3QgcnVuIG91dHNpZGUgdGhlIHRlcm1pbmFsIHNhbmRib3gnKSwgJ0V4cGVjdGVkIHJlYXNvbiBzY2hlbWEgZGVzY3JpcHRpb24gdG8gcmVxdWlyZSBjb25jcmV0ZSBzYW5kYm94IGp1c3RpZmljYXRpb24nKTtcblx0XHRcdG9rKHJlcXVlc3RBbGxvd05ldHdvcmtQcm9wZXJ0eT8uZGVzY3JpcHRpb24/LmluY2x1ZGVzKCdyZW1haW4gaW4gdGhlIHRlcm1pbmFsIHNhbmRib3ggYnV0IHJ1biB3aXRoIHVucmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcycpLCAnRXhwZWN0ZWQgbmV0d29yayBzY2hlbWEgZGVzY3JpcHRpb24gdG8gcmV0YWluIHNhbmRib3hpbmcnKTtcblx0XHRcdG9rKHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb25Qcm9wZXJ0eT8uZGVzY3JpcHRpb24/LmluY2x1ZGVzKCduZWVkcyB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MnKSwgJ0V4cGVjdGVkIG5ldHdvcmsgcmVhc29uIHNjaGVtYSBkZXNjcmlwdGlvbiB0byByZXF1ZXN0IGp1c3RpZmljYXRpb24nKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUHJvcGVydHk/LnR5cGUsICdhcnJheScsICdFeHBlY3RlZCBmaWxlIHZhbGlkYXRpb24gc2NoZW1hIHRvIGFjY2VwdCBmaWxlIHBhdGhzJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1Byb3BlcnR5Py5pdGVtcz8udHlwZSwgJ3N0cmluZycsICdFeHBlY3RlZCBmaWxlIHZhbGlkYXRpb24gcGF0aHMgdG8gYmUgc3RyaW5ncycpO1xuXHRcdFx0b2socmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2tQcm9wZXJ0eT8uZGVzY3JpcHRpb24/LmluY2x1ZGVzKCdiZWZvcmUgcnVubmluZyB0aGUgY29tbWFuZCcpLCAnRXhwZWN0ZWQgZmlsZSB2YWxpZGF0aW9uIHNjaGVtYSBkZXNjcmlwdGlvbiB0byBkZXNjcmliZSBwcmUtZXhlY3V0aW9uIGFjY2VzcyBjaGVja3MnKTtcblx0XHRcdG9rKHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUmVhc29uUHJvcGVydHk/LmRlc2NyaXB0aW9uPy5pbmNsdWRlcygndGhlc2UgZmlsZSBwYXRocycpLCAnRXhwZWN0ZWQgZmlsZSB2YWxpZGF0aW9uIHJlYXNvbiBzY2hlbWEgZGVzY3JpcHRpb24gdG8gcmVxdWVzdCBqdXN0aWZpY2F0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgb21pdCB1bnNhbmRib3hlZCBleGVjdXRpb24gcmVxdWVzdHMgZnJvbSBzY2hlbWEgd2hlbiB1bnNhbmRib3hlZCBjb21tYW5kcyBhcmUgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcywgZmFsc2UpO1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHRvb2xEYXRhID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY3JlYXRlUnVuSW5UZXJtaW5hbFRvb2xEYXRhKTtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXMgPSB0b29sRGF0YS5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBpbiBzY2hlbWEgd2hlbiB1bnNhbmRib3hlZCBjb21tYW5kcyBhcmUgZGlzYWJsZWQnKTtcblx0XHRcdG9rKCFwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiddLCAnRXhwZWN0ZWQgbm8gcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uIGluIHNjaGVtYSB3aGVuIHVuc2FuZGJveGVkIGNvbW1hbmRzIGFyZSBkaXNhYmxlZCcpO1xuXHRcdFx0b2socHJvcGVydGllcz8uWydyZXF1ZXN0QWxsb3dOZXR3b3JrJ10sICdFeHBlY3RlZCByZXF1ZXN0QWxsb3dOZXR3b3JrIHRvIHJlbWFpbiBpbiBzY2hlbWEgd2hlbiBwZXItY29tbWFuZCBuZXR3b3JrIGFjY2VzcyBpcyBlbmFibGVkJyk7XG5cdFx0XHRvayhwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24nXSwgJ0V4cGVjdGVkIHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gdG8gcmVtYWluIGluIHNjaGVtYSB3aGVuIHBlci1jb21tYW5kIG5ldHdvcmsgYWNjZXNzIGlzIGVuYWJsZWQnKTtcblx0XHRcdG9rKHRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCdSdW5uaW5nIGNvbW1hbmRzIG91dHNpZGUgdGhlIHNhbmRib3ggaXMgZGlzYWJsZWQnKSwgJ0V4cGVjdGVkIG1vZGVsIGRlc2NyaXB0aW9uIHRvIGV4cGxhaW4gdGhhdCB1bnNhbmRib3hlZCBjb21tYW5kcyBhcmUgZGlzYWJsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmVjb21tZW5kIGFsbG93LW5ldHdvcmsgcmVxdWVzdHMgaW4gbW9kZWwgZGVzY3JpcHRpb24gd2hlbiBwZXItY29tbWFuZCBuZXR3b3JrIGFjY2VzcyBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsIGZhbHNlKTtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGEgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjcmVhdGVSdW5JblRlcm1pbmFsVG9vbERhdGEpO1xuXHRcdFx0Y29uc3QgcHJvcGVydGllcyA9IHRvb2xEYXRhLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIGFzIFJlY29yZDxzdHJpbmcsIG9iamVjdD4gfCB1bmRlZmluZWQ7XG5cblx0XHRcdG9rKCFwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmsnXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RBbGxvd05ldHdvcmsgaW4gc2NoZW1hIHdoZW4gcGVyLWNvbW1hbmQgbmV0d29yayBhY2Nlc3MgaXMgZGlzYWJsZWQnKTtcblx0XHRcdG9rKCFwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gaW4gc2NoZW1hIHdoZW4gcGVyLWNvbW1hbmQgbmV0d29yayBhY2Nlc3MgaXMgZGlzYWJsZWQnKTtcblx0XHRcdG9rKCF0b29sRGF0YS5tb2RlbERlc2NyaXB0aW9uPy5pbmNsdWRlcygncmVxdWVzdEFsbG93TmV0d29yaz10cnVlJyksICdFeHBlY3RlZCBtb2RlbCBkZXNjcmlwdGlvbiBub3QgdG8gcmVjb21tZW5kIGFsbG93LW5ldHdvcmsgcmVxdWVzdHMgd2hlbiBwZXItY29tbWFuZCBuZXR3b3JrIGFjY2VzcyBpcyBkaXNhYmxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBpbmNsdWRlIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGEgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjcmVhdGVSdW5JblRlcm1pbmFsVG9vbERhdGEpO1xuXHRcdFx0Y29uc3QgcHJvcGVydGllcyA9IHRvb2xEYXRhLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIGFzIFJlY29yZDxzdHJpbmcsIG9iamVjdD4gfCB1bmRlZmluZWQ7XG5cblx0XHRcdG9rKCFwcm9wZXJ0aWVzPy5bJ2FsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzJ10sICdFeHBlY3RlZCBubyBhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyB3aGVuIHNhbmRib3ggaXMgZGlzYWJsZWQnKTtcblx0XHRcdG9rKCFwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddLCAnRXhwZWN0ZWQgbm8gcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGluIHNjaGVtYSB3aGVuIHNhbmRib3ggaXMgZGlzYWJsZWQnKTtcblx0XHRcdG9rKCFwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiddLCAnRXhwZWN0ZWQgbm8gcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uIGluIHNjaGVtYSB3aGVuIHNhbmRib3ggaXMgZGlzYWJsZWQnKTtcblx0XHRcdG9rKCFwcm9wZXJ0aWVzPy5bJ3JlcXVlc3RBbGxvd05ldHdvcmsnXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RBbGxvd05ldHdvcmsgaW4gc2NoZW1hIHdoZW4gc2FuZGJveCBpcyBkaXNhYmxlZCcpO1xuXHRcdFx0b2soIXByb3BlcnRpZXM/LlsncmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiddLCAnRXhwZWN0ZWQgbm8gcmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiBpbiBzY2hlbWEgd2hlbiBzYW5kYm94IGlzIGRpc2FibGVkJyk7XG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjayddLCAnRXhwZWN0ZWQgbm8gcmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2sgd2hlbiBzYW5kYm94IGlzIGRpc2FibGVkJyk7XG5cdFx0XHRvayghcHJvcGVydGllcz8uWydyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1JlYXNvbiddLCAnRXhwZWN0ZWQgbm8gcmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2tSZWFzb24gd2hlbiBzYW5kYm94IGlzIGRpc2FibGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVmbGVjdCBzYW5kYm94IHNldHRpbmcgY2hhbmdlcyBpbiB0b29sIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCB0b29sRGF0YUJlZm9yZSA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNyZWF0ZVJ1bkluVGVybWluYWxUb29sRGF0YSk7XG5cdFx0XHRjb25zdCBwcm9wZXJ0aWVzQmVmb3JlID0gdG9vbERhdGFCZWZvcmUuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgb2JqZWN0PiB8IHVuZGVmaW5lZDtcblx0XHRcdG9rKCFwcm9wZXJ0aWVzQmVmb3JlPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddLCAnRXhwZWN0ZWQgbm8gcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGJlZm9yZSBlbmFibGluZyBzYW5kYm94Jyk7XG5cblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGFBZnRlciA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNyZWF0ZVJ1bkluVGVybWluYWxUb29sRGF0YSk7XG5cdFx0XHRjb25zdCBwcm9wZXJ0aWVzQWZ0ZXIgPSB0b29sRGF0YUFmdGVyLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIGFzIFJlY29yZDxzdHJpbmcsIG9iamVjdD4gfCB1bmRlZmluZWQ7XG5cdFx0XHRvayhwcm9wZXJ0aWVzQWZ0ZXI/LlsncmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uJ10sICdFeHBlY3RlZCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gYWZ0ZXIgZW5hYmxpbmcgc2FuZGJveCcpO1xuXHRcdFx0b2sodG9vbERhdGFBZnRlci5tb2RlbERlc2NyaXB0aW9uPy5pbmNsdWRlcygnU2FuZGJveGluZzonKSwgJ0V4cGVjdGVkIHNhbmRib3ggaW5zdHJ1Y3Rpb25zIGluIGRlc2NyaXB0aW9uIGFmdGVyIGVuYWJsaW5nIHNhbmRib3gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IGNvbmZpcm1hdGlvbiB0byBpbnN0YWxsIG1pc3Npbmcgc2FuZGJveCBkZXBlbmRlbmNpZXMgd2hlbiBwcmVyZXEgY2hlY2sgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suRGVwZW5kZW5jaWVzLFxuXHRcdFx0XHRtaXNzaW5nRGVwZW5kZW5jaWVzOiBbJ2J1YmJsZXdyYXAnXSxcblx0XHRcdFx0Y2FuSW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXM6IHRydWUsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0XHRnb2FsOiAnUHJpbnQgaGVsbG8nXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGhlIHRvb2wgc2hvdWxkIHJldHVybiBjb25maXJtYXRpb24gbWVzc2FnZXMgZm9yIHRoZSB1c2VyXG5cdFx0XHRvayhyZXN1bHQsICdFeHBlY3RlZCBwcmVwYXJlZCBpbnZvY2F0aW9uIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdG9rKHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXMsICdFeHBlY3RlZCBjb25maXJtYXRpb25NZXNzYWdlcyB3aGVuIGRlcHMgYXJlIG1pc3NpbmcnKTtcblx0XHRcdG9rKHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LmN1c3RvbU9wdGlvbnM/Lmxlbmd0aCA9PT0gMiwgJ0V4cGVjdGVkIHR3byBjdXN0b20gb3B0aW9ucycpO1xuXHRcdFx0Ly8gbWlzc2luZ0RlcGVuZGVuY2llcyBzaG91bGQgYmUgaW4gdG9vbFNwZWNpZmljRGF0YSBzbyBpbnZva2UgY2FuIGhhbmRsZSBpdFxuXHRcdFx0c3RyaWN0RXF1YWwoKHJlc3VsdD8udG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgdW5kZWZpbmVkKT8ubWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXM/Lmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVxdWVzdCBtYW51YWwgaW5zdGFsbGF0aW9uIHdoZW4gbm8gc3VwcG9ydGVkIHBhY2thZ2UgbWFuYWdlciBpcyBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suRGVwZW5kZW5jaWVzLFxuXHRcdFx0XHRtaXNzaW5nRGVwZW5kZW5jaWVzOiBbJ2J1YmJsZXdyYXAnXSxcblx0XHRcdFx0Y2FuSW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXM6IGZhbHNlLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnZWNobyBoZWxsbycgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2VUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwocHJlcGFyZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jdXN0b21PcHRpb25zLCB1bmRlZmluZWQpO1xuXHRcdFx0b2soKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU/OiBzdHJpbmcgfSkudmFsdWU/LmluY2x1ZGVzKCdzeXN0ZW0gcGFja2FnZSBtYW5hZ2VyJykpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY3JlYXRlVGVybWluYWxDYWxsQ291bnQsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGF1dG9tYXRpY2FsbHkgc2NoZWR1bGUgQXBwQXJtb3IgcmVtZWRpYXRpb24gd2l0aG91dCBhIHJlcGFpciBwcm9tcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7IGVjaG86IHRydWUgfSk7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkJ1YmJsZXdyYXAsXG5cdFx0XHRcdHJlbWVkaWF0aW9uczogW1Rlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24uRGlzYWJsZVVucHJpdmlsYWdlZHVzZXJuYW1lc3BhY2VSZXN0cmljdGlvbl0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnZWNobyBoZWxsbycgfSk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSByZXN1bHQ/LnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcywgdW5kZWZpbmVkLCAnRXhwZWN0ZWQgbm8gcmVwYWlyIGNvbmZpcm1hdGlvbicpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhPy5zYW5kYm94UmVtZWRpYXRpb25zPy5sZW5ndGgsIDEsICdFeHBlY3RlZCBvbmUgcmVwYWlyIG9wdGlvbiBpbiB0ZXJtaW5hbCBpbnZvY2F0aW9uIGRhdGEnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YT8ubWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXMsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3QgY2xhc3NpZnkgdW51c2FibGUgYnViYmxld3JhcCBhcyBtaXNzaW5nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVjaGVjayBidWJibGV3cmFwIGFmdGVyIGRlcGVuZGVuY3kgaW5zdGFsbGF0aW9uIGFuZCBub3QgZXhlY3V0ZSB3aGVuIGl0IHJlbWFpbnMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgZm9yY2VSZWZyZXNoQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMgPSBhc3luYyBmb3JjZVJlZnJlc2ggPT4ge1xuXHRcdFx0XHRpZiAoZm9yY2VSZWZyZXNoKSB7XG5cdFx0XHRcdFx0Zm9yY2VSZWZyZXNoQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRcdFx0ZmFpbGVkQ2hlY2s6IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkJ1YmJsZXdyYXAsXG5cdFx0XHRcdFx0XHRyZW1lZGlhdGlvbnM6IFtUZXJtaW5hbFNhbmRib3hQcmVDaGVja1JlbWVkaWF0aW9uLkRpc2FibGVVbnByaXZpbGFnZWR1c2VybmFtZXNwYWNlUmVzdHJpY3Rpb25dLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRcdGZhaWxlZENoZWNrOiBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5EZXBlbmRlbmNpZXMsXG5cdFx0XHRcdFx0bWlzc2luZ0RlcGVuZGVuY2llczogWydidWJibGV3cmFwJ10sXG5cdFx0XHRcdFx0Y2FuSW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXM6IHRydWUsXG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2VUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9LCAnaW5zdGFsbCcpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChmb3JjZVJlZnJlc2hDYWxsZWQsIHRydWUsICdFeHBlY3RlZCBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbiB0byBmb3JjZSBhIG5ldyBwcmVyZXF1aXNpdGUgY2hlY2snKTtcblx0XHRcdHN0cmljdEVxdWFsKGNyZWF0ZVRlcm1pbmFsQ2FsbENvdW50LCAxLCAnRXhwZWN0ZWQgb25seSB0aGUgaW5zdGFsbGF0aW9uIHRlcm1pbmFsLCBub3Qgb3JpZ2luYWwgY29tbWFuZCBleGVjdXRpb24nKTtcblx0XHRcdG9rKChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlPzogc3RyaW5nIH0pLnZhbHVlPy5pbmNsdWRlcygnYnViYmxld3JhcCcpLCAnRXhwZWN0ZWQgcmVzdWx0IHRvIGlkZW50aWZ5IHRoZSBmYWlsZWQgYnViYmxld3JhcCB2ZXJpZmljYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdWdnZXN0IHJlbG9hZGluZyBhbmQgcmV0cnlpbmcgaWYgdGhlIGlzc3VlIHBlcnNpc3RzIGFmdGVyIHNhbmRib3ggZGVwZW5kZW5jeSBpbnN0YWxsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMgPSBhc3luYyBmb3JjZVJlZnJlc2ggPT4gZm9yY2VSZWZyZXNoXG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRcdGZhaWxlZENoZWNrOiBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5EZXBlbmRlbmNpZXMsXG5cdFx0XHRcdFx0bWlzc2luZ0RlcGVuZGVuY2llczogWydidWJibGV3cmFwJywgJ3NvY2F0J10sXG5cdFx0XHRcdFx0Y2FuSW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXM6IHRydWUsXG5cdFx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0sICdpbnN0YWxsJyk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGNyZWF0ZVRlcm1pbmFsQ2FsbENvdW50LCAxLCAnRXhwZWN0ZWQgb25seSB0aGUgaW5zdGFsbGF0aW9uIHRlcm1pbmFsLCBub3Qgb3JpZ2luYWwgY29tbWFuZCBleGVjdXRpb24nKTtcblx0XHRcdG9rKChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlPzogc3RyaW5nIH0pLnZhbHVlPy5pbmNsdWRlcygnSWYgdGhlIGlzc3VlIHBlcnNpc3RzLCByZWxvYWQgdGhlIHdpbmRvdyBhbmQgdHJ5IHJ1bm5pbmcgdGhlIGNvbW1hbmQgYWdhaW4nKSwgJ0V4cGVjdGVkIGNvbmRpdGlvbmFsIHJlbG9hZCBhbmQgcmV0cnkgZ3VpZGFuY2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvbWF0aWNhbGx5IHJlcGFpciBBcHBBcm1vciwgcHJvYmUgYWdhaW4sIGFuZCBleGVjdXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuZGlzYWJsZVByb2Nlc3NJZEFzc29jaWF0aW9uKCk7XG5cdFx0XHRsZXQgZm9yY2VSZWZyZXNoQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMgPSBhc3luYyBmb3JjZVJlZnJlc2ggPT4ge1xuXHRcdFx0XHRmb3JjZVJlZnJlc2hDYWxsZWQgfHw9IGZvcmNlUmVmcmVzaCA9PT0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIGZvcmNlUmVmcmVzaCA/IHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0gOiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0XHRmYWlsZWRDaGVjazogVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suQnViYmxld3JhcCxcblx0XHRcdFx0XHRyZW1lZGlhdGlvbnM6IFtUZXJtaW5hbFNhbmRib3hQcmVDaGVja1JlbWVkaWF0aW9uLkRpc2FibGVVbnByaXZpbGFnZWR1c2VybmFtZXNwYWNlUmVzdHJpY3Rpb25dLFxuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHRcdGxldCByZW1lZGlhdGlvbkNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS5ydW5TYW5kYm94UmVtZWRpYXRpb24gPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlbWVkaWF0aW9uQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHsgZXhpdENvZGU6IDAgfTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0pO1xuXHRcdFx0Y3JlYXRlZFRlcm1pbmFsSW5zdGFuY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChyZW1lZGlhdGlvbkNhbGxlZCwgdHJ1ZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChmb3JjZVJlZnJlc2hDYWxsZWQsIHRydWUsICdFeHBlY3RlZCBhIHByb2JlIGFmdGVyIEFwcEFybW9yIHJlbWVkaWF0aW9uJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjcmVhdGVUZXJtaW5hbENhbGxDb3VudCwgMSwgJ0V4cGVjdGVkIHRoZSBvcmlnaW5hbCBjb21tYW5kIHRvIGV4ZWN1dGUnKTtcblx0XHRcdG9rKHJlc3VsdC5jb250ZW50Lmxlbmd0aCA+IDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlcG9ydCBzYW5kYm94aW5nIHVuc3VwcG9ydGVkIHdoZW4gYnViYmxld3JhcCByZXBhaXIgZXhlY3V0aW9uIGZhaWxzIG9yIGlzIGluZGV0ZXJtaW5hdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkJ1YmJsZXdyYXAsXG5cdFx0XHRcdHJlbWVkaWF0aW9uczogW1Rlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24uRGlzYWJsZVVucHJpdmlsYWdlZHVzZXJuYW1lc3BhY2VSZXN0cmljdGlvbl0sXG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgcHJldmlvdXNNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGV4aXRDb2RlIG9mIFsxLCB1bmRlZmluZWRdIGFzIGNvbnN0KSB7XG5cdFx0XHRcdHRlcm1pbmFsU2FuZGJveFNlcnZpY2UucnVuU2FuZGJveFJlbWVkaWF0aW9uID0gYXN5bmMgKCkgPT4gKHsgZXhpdENvZGUgfSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0pO1xuXG5cdFx0XHRcdHN0cmljdEVxdWFsKGNyZWF0ZVRlcm1pbmFsQ2FsbENvdW50LCAwLCAnRXhwZWN0ZWQgdGhlIG9yaWdpbmFsIGNvbW1hbmQgbm90IHRvIGV4ZWN1dGUnKTtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlPzogc3RyaW5nIH0pLnZhbHVlID8/ICcnO1xuXHRcdFx0XHRvayhtZXNzYWdlLmluY2x1ZGVzKCdTYW5kYm94aW5nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBlbnZpcm9ubWVudCcpLCAnRXhwZWN0ZWQgdW5zdXBwb3J0ZWQgZW52aXJvbm1lbnQgZ3VpZGFuY2UgYWZ0ZXIgcmVwYWlyIGV4ZWN1dGlvbiBmYWlsdXJlJyk7XG5cdFx0XHRcdG9rKG1lc3NhZ2UuaW5jbHVkZXMoJ2NoYXQuYWdlbnQuc2FuZGJveC5lbmFibGVkJyksICdFeHBlY3RlZCBndWlkYW5jZSB0byBpZGVudGlmeSB0aGUgc2FuZGJveCBzZXR0aW5nJyk7XG5cdFx0XHRcdGlmIChwcmV2aW91c01lc3NhZ2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKG1lc3NhZ2UsIHByZXZpb3VzTWVzc2FnZSwgJ0V4cGVjdGVkIHRoZSBzYW1lIG1lc3NhZ2UgaXJyZXNwZWN0aXZlIG9mIHRoZSByZW1lZGlhdGlvbiBleGl0IGNvZGUnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcmV2aW91c01lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdFx0XHRvayh0eXBlb2YgcmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlICE9PSAnc3RyaW5nJyAmJiByZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2U/LnZhbHVlLmluY2x1ZGVzKCdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJyksICdFeHBlY3RlZCBhIHNldHRpbmdzIGNvbW1hbmQgbGluayBpbiB0aGUgdXNlci1mYWNpbmcgbWVzc2FnZScpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBleGVjdXRlIHdoZW4gYnViYmxld3JhcCBpcyB1bnVzYWJsZSBhbmQgbm8gc3VwcG9ydGVkIHJlbWVkaWF0aW9uIGlzIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suQnViYmxld3JhcCxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChjcmVhdGVUZXJtaW5hbENhbGxDb3VudCwgMCwgJ0V4cGVjdGVkIG5vIHRlcm1pbmFsIGV4ZWN1dGlvbiBmb3IgdW51c2FibGUgYnViYmxld3JhcCcpO1xuXHRcdFx0b2soKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU/OiBzdHJpbmcgfSkudmFsdWU/LmluY2x1ZGVzKCdCdWJibGV3cmFwJyksICdFeHBlY3RlZCBhIGJ1YmJsZXdyYXAgY2FwYWJpbGl0eSBmYWlsdXJlIG1lc3NhZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGFsbG93ZWQgYW5kIGRlbmllZCBuZXR3b3JrIGRvbWFpbnMgaW4gbW9kZWwgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzLCB0cnVlKTtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHRlcm1pbmFsU2FuZGJveFNlcnZpY2UuZ2V0UmVzb2x2ZWROZXR3b3JrRG9tYWlucyA9ICgpID0+ICh7XG5cdFx0XHRcdGFsbG93ZWREb21haW5zOiBbJ2dpdGh1Yi5jb20nLCAnbnBtanMub3JnJ10sXG5cdFx0XHRcdGRlbmllZERvbWFpbnM6IFsnZXZpbC5jb20nXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0b29sRGF0YSA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNyZWF0ZVJ1bkluVGVybWluYWxUb29sRGF0YSk7XG5cblx0XHRcdG9rKHRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCdnaXRodWIuY29tLCBucG1qcy5vcmcnKSwgJ0V4cGVjdGVkIGFsbG93ZWQgZG9tYWlucyBpbiBkZXNjcmlwdGlvbicpO1xuXHRcdFx0b2sodG9vbERhdGEubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ2V2aWwuY29tJyksICdFeHBlY3RlZCBkZW5pZWQgZG9tYWlucyBpbiBkZXNjcmlwdGlvbicpO1xuXHRcdFx0b2sodG9vbERhdGEubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ3JlcXVlc3RBbGxvd05ldHdvcms9dHJ1ZScpLCAnRXhwZWN0ZWQgbW9kZWwgZGVzY3JpcHRpb24gdG8gcmVjb21tZW5kIG5ldHdvcmstZW5hYmxlZCBzYW5kYm94IGV4ZWN1dGlvbiBmaXJzdCcpO1xuXHRcdFx0b2sodG9vbERhdGEubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ3JlYWN0aXZlbHkgYWZ0ZXIgYSBuZXR3b3JrIGZhaWx1cmUnKSwgJ0V4cGVjdGVkIG1vZGVsIGRlc2NyaXB0aW9uIHRvIGFsbG93IHJlYWN0aXZlIGFsbG93LW5ldHdvcmsgcmVxdWVzdHMgYWZ0ZXIgYSBzYW5kYm94IG5ldHdvcmsgZmFpbHVyZScpO1xuXHRcdFx0b2sodG9vbERhdGEubW9kZWxEZXNjcmlwdGlvbj8uaW5jbHVkZXMoJ0hUVFAgY29kZSA0MDMnKSwgJ0V4cGVjdGVkIG1vZGVsIGRlc2NyaXB0aW9uIHRvIGNvbnRhaW4gSFRUUCBjb2RlIDQwMyBhcyBldmlkZW5jZSBvZiBibG9ja2VkIG5ldHdvcmsgYWNjZXNzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXhjbHVkZSBkZW5pZWQgZG9tYWlucyBmcm9tIGVmZmVjdGl2ZSBhbGxvd2VkIGxpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmdldFJlc29sdmVkTmV0d29ya0RvbWFpbnMgPSAoKSA9PiAoe1xuXHRcdFx0XHRhbGxvd2VkRG9tYWluczogWydnaXRodWIuY29tJywgJ2V2aWwuY29tJywgJ25wbWpzLm9yZyddLFxuXHRcdFx0XHRkZW5pZWREb21haW5zOiBbJ2V2aWwuY29tJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdG9vbERhdGEgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjcmVhdGVSdW5JblRlcm1pbmFsVG9vbERhdGEpO1xuXG5cdFx0XHRvayh0b29sRGF0YS5tb2RlbERlc2NyaXB0aW9uPy5pbmNsdWRlcygnZ2l0aHViLmNvbSwgbnBtanMub3JnJyksICdFeHBlY3RlZCBlZmZlY3RpdmUgYWxsb3dlZCBsaXN0IHdpdGhvdXQgZGVuaWVkIGRvbWFpbicpO1xuXHRcdFx0b2soIXRvb2xEYXRhLm1vZGVsRGVzY3JpcHRpb24/LmluY2x1ZGVzKCdhY2Nlc3NpYmxlIGluIHRoZSBzYW5kYm94IChhbGwgb3RoZXIgbmV0d29yayBhY2Nlc3MgaXMgYmxvY2tlZCk6IGdpdGh1Yi5jb20sIGV2aWwuY29tJyksICdFeHBlY3RlZCBkZW5pZWQgZG9tYWluIHJlbW92ZWQgZnJvbSBhbGxvd2VkIGxpc3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugc2FuZGJveCBsYWJlbHMgd2hlbiBjb21tYW5kIGlzIHNhbmRib3ggd3JhcHBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC92c2NvZGUtc2FuZGJveC1zZXR0aW5ncy5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLndyYXBDb21tYW5kID0gYXN5bmMgKGNvbW1hbmQ6IHN0cmluZykgPT4gKHtcblx0XHRcdFx0Y29tbWFuZDogYHNhbmRib3gtcnVudGltZSAke2NvbW1hbmR9YCxcblx0XHRcdFx0aXNTYW5kYm94V3JhcHBlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwcmVwYXJlZEludm9jYXRpb24gPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnZWNobyBoZWxsbycgfSk7XG5cblx0XHRcdG9rKHByZXBhcmVkSW52b2NhdGlvbiwgJ0V4cGVjdGVkIHByZXBhcmVkIGludm9jYXRpb24gdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoKHByZXBhcmVkSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmcpLnZhbHVlLCAnUnVubmluZyBgZWNobyBoZWxsb2AgaW4gc2FuZGJveCcpO1xuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSBwcmVwYXJlZEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGVuYWJsZSBzYW5kYm94aW5nIHdoZW4gY2hhdCBwZXJtaXNzaW9uIGxldmVsIGlzIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzYW5kYm94LWRlZmF1bHQtcGVybWlzc2lvbi1zZXNzaW9uJyk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwge1xuXHRcdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZTogKCgpID0+ICh7IGlucHV0OiB7IGN1cnJlbnRNb2RlSW5mbzogeyBwZXJtaXNzaW9uTGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCB9IH0gfSkpIGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlWydnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSddLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0UGVybWlzc2lvblRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFJ1bkluVGVybWluYWxUb29sKSk7XG5cblx0XHRcdGNvbnN0IHByZXBhcmVkSW52b2NhdGlvbiA9IGF3YWl0IGRlZmF1bHRQZXJtaXNzaW9uVG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0XHRcdGdvYWw6ICdQcmludCBoZWxsbycsXG5cdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHR9IGFzIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdH0gYXMgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcHJlcGFyZWRJbnZvY2F0aW9uIS50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0XHRzdHJpY3RFcXVhbCgocHJlcGFyZWRJbnZvY2F0aW9uIS5pbnZvY2F0aW9uTWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmcpLnZhbHVlLCAnUnVubmluZyBgZWNobyBoZWxsb2AgaW4gc2FuZGJveCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc2FibGUgc2FuZGJveGluZyB3aGVuIGNoYXQgcGVybWlzc2lvbiBsZXZlbCBpcyBlbGV2YXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC92c2NvZGUtc2FuZGJveC1zZXR0aW5ncy5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsV3JhcENvbW1hbmQgPSB0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLndyYXBDb21tYW5kLmJpbmQodGVybWluYWxTYW5kYm94U2VydmljZSk7XG5cdFx0XHRmb3IgKGNvbnN0IHBlcm1pc3Npb25MZXZlbCBvZiBbQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3RdKSB7XG5cdFx0XHRcdGxldCB3cmFwQ2FsbHMgPSAwO1xuXHRcdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLndyYXBDb21tYW5kID0gYXN5bmMgKC4uLmFyZ3MpID0+IHtcblx0XHRcdFx0XHR3cmFwQ2FsbHMrKztcblx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxXcmFwQ29tbWFuZCguLi5hcmdzKTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oYHNhbmRib3gtJHtwZXJtaXNzaW9uTGV2ZWx9LXBlcm1pc3Npb24tc2Vzc2lvbmApO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwge1xuXHRcdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKCkgPT4gKHsgaW5wdXQ6IHsgY3VycmVudE1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbCB9IH0gfSkpIGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlWydnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSddLFxuXHRcdFx0XHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBlbGV2YXRlZFBlcm1pc3Npb25Ub29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXG5cdFx0XHRcdGNvbnN0IHByZXBhcmVkSW52b2NhdGlvbiA9IGF3YWl0IGVsZXZhdGVkUGVybWlzc2lvblRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0XHRleHBsYW5hdGlvbjogJ1ByaW50IGhlbGxvJyxcblx0XHRcdFx0XHRcdGdvYWw6ICdQcmludCBoZWxsbycsXG5cdFx0XHRcdFx0XHRtb2RlOiAnc3luYycsXG5cdFx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zLFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHByZXBhcmVkSW52b2NhdGlvbiEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCwgZmFsc2UsIGBFeHBlY3RlZCBubyBzYW5kYm94IHdyYXBwaW5nIGZvciAke3Blcm1pc3Npb25MZXZlbH1gKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiwgZmFsc2UsIGBFeHBlY3RlZCBubyB1bnNhbmRib3ggY29uZmlybWF0aW9uIGZvciAke3Blcm1pc3Npb25MZXZlbH1gKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoKHByZXBhcmVkSW52b2NhdGlvbiEuaW52b2NhdGlvbk1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nKS52YWx1ZSwgJ1J1bm5pbmcgYGVjaG8gaGVsbG9gJyk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHdyYXBDYWxscywgMCwgYEV4cGVjdGVkIHNhbmRib3ggd3JhcHBpbmcgdG8gYmUgc2tpcHBlZCBmb3IgJHtwZXJtaXNzaW9uTGV2ZWx9YCk7XG5cdFx0XHRcdHRlcm1pbmFsU2FuZGJveFNlcnZpY2Uud3JhcENvbW1hbmQgPSBvcmlnaW5hbFdyYXBDb21tYW5kO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSByZXF1ZXN0IHBlcm1pc3Npb24gbGV2ZWwgYmVmb3JlIGN1cnJlbnQgd2lkZ2V0IHBlcm1pc3Npb24gbGV2ZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3NhbmRib3gtcmVxdWVzdC1wZXJtaXNzaW9uLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9ICdzYW5kYm94LXJlcXVlc3QtcGVybWlzc2lvbi1yZXF1ZXN0Jztcblx0XHRcdGNyZWF0ZUNoYXRNb2RlbFdpdGhSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgY3JlYXRlQ2hhdE1vZGVJbmZvKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpLCByZXF1ZXN0SWQpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRcdFx0Z2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2U6ICgoKSA9PiAoeyBpbnB1dDogeyBjdXJyZW50TW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQgfSB9IH0pKSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZVsnZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UnXSxcblx0XHRcdFx0bGFzdEZvY3VzZWRXaWRnZXQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVxdWVzdFBlcm1pc3Npb25Ub29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXG5cdFx0XHRjb25zdCBwcmVwYXJlZEludm9jYXRpb24gPSBhd2FpdCByZXF1ZXN0UGVybWlzc2lvblRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRleHBsYW5hdGlvbjogJ1ByaW50IGhlbGxvJyxcblx0XHRcdFx0XHRnb2FsOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGNoYXRSZXF1ZXN0SWQ6IHJlcXVlc3RJZCxcblx0XHRcdH0gYXMgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcHJlcGFyZWRJbnZvY2F0aW9uIS50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCwgZmFsc2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwoKHByZXBhcmVkSW52b2NhdGlvbiEuaW52b2NhdGlvbk1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nKS52YWx1ZSwgJ1J1bm5pbmcgYGVjaG8gaGVsbG9gJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHNob3cgc2FuZGJveCB3cmFwcGVyIGluIGNoYXQgd2hlbiBzYW5kYm94ZWQgYXN5bmMgY29tbWFuZCBpcyBkZXRhY2hlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNldEJhY2tlbmRPcyhPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRGV0YWNoQmFja2dyb3VuZFByb2Nlc3NlcywgdHJ1ZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS53cmFwQ29tbWFuZCA9IGFzeW5jIChjb21tYW5kOiBzdHJpbmcpID0+ICh7XG5cdFx0XHRcdGNvbW1hbmQ6IGBzYW5kYm94LXJ1bnRpbWUgJHtjb21tYW5kfWAsXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nLCBtb2RlOiAnYXN5bmMnIH0pO1xuXG5cdFx0XHRvayhwcmVwYXJlZEludm9jYXRpb24sICdFeHBlY3RlZCBwcmVwYXJlZCBpbnZvY2F0aW9uIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdHN0cmljdEVxdWFsKChwcmVwYXJlZEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nKS52YWx1ZSwgJ1J1bm5pbmcgYGVjaG8gaGVsbG9gIGluIHNhbmRib3gnKTtcblxuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcHJlcGFyZWRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5mb3JEaXNwbGF5LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQsICdub2h1cCBzYW5kYm94LXJ1bnRpbWUgZWNobyBoZWxsbyAmIGRpc293bicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXV0b21hdGljIHNhbmRib3ggcmV0cnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZVJldHJ5T3B0aW9ucyA9IHtcblx0XHRcdGFsbG93VW5zYW5kYm94ZWRDb21tYW5kczogdHJ1ZSxcblx0XHRcdGRpZFNhbmRib3hXcmFwQ29tbWFuZDogdHJ1ZSxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogZmFsc2UsXG5cdFx0XHRpc1BlcnNpc3RlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdGlzQmFja2dyb3VuZEV4ZWN1dGlvbjogZmFsc2UsXG5cdFx0XHRkaWRUaW1lb3V0OiBmYWxzZSxcblx0XHRcdGV4aXRDb2RlOiAxLFxuXHRcdFx0b3V0cHV0OiAnL2Jpbi9iYXNoOiAvd29ya3NwYWNlL291dC50eHQ6IE9wZXJhdGlvbiBub3QgcGVybWl0dGVkJyxcblx0XHR9O1xuXHRcdGNvbnN0IGJhc2VBbGxvd05ldHdvcmtSZXRyeU9wdGlvbnMgPSB7XG5cdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdGRpZFNhbmRib3hXcmFwQ29tbWFuZDogdHJ1ZSxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogZmFsc2UsXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrOiBmYWxzZSxcblx0XHRcdGlzUGVyc2lzdGVudFNlc3Npb246IGZhbHNlLFxuXHRcdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiBmYWxzZSxcblx0XHRcdGRpZFRpbWVvdXQ6IGZhbHNlLFxuXHRcdFx0ZXhpdENvZGU6IDEsXG5cdFx0XHRvdXRwdXQ6ICdjb25uZWN0OiBPcGVyYXRpb24gbm90IHBlcm1pdHRlZCcsXG5cdFx0fTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXRyeSBjb21wbGV0ZWQgZm9yZWdyb3VuZCBzYW5kYm94IGNvbW1hbmRzIHdoZW4gb3V0cHV0IGluZGljYXRlcyBzYW5kYm94IGJsb2NrJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5VW5zYW5kYm94ZWQoYmFzZVJldHJ5T3B0aW9ucyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBidWJibGV3cmFwIGhvc3QgcmVzdHJpY3Rpb25zIGFjcm9zcyB3cmFwcGVkIG91dHB1dCBsaW5lcycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKG91dHB1dExvb2tzQnViYmxld3JhcEhvc3RSZXN0cmljdGVkKCdid3JhcDogTm8gcGVybWlzc2lvbnMgdG8gY3JlYXRlIG5ld1xcbm5hbWVzcGFjZScpLCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKG91dHB1dExvb2tzQnViYmxld3JhcEhvc3RSZXN0cmljdGVkKCdid3JhcDogZmFpbGVkIHRvIGJpbmQgbW91bnQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpcmVjdCB0aGUgdXNlciB0byBkaXNhYmxlIHNhbmRib3hpbmcgd2hlbiBidWJibGV3cmFwIGlzIHJlc3RyaWN0ZWQgYnkgdGhlIGhvc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBydW5JblRlcm1pbmFsVG9vbC5nZXRCdWJibGV3cmFwSG9zdFJlc3RyaWN0ZWRSZXN1bHQoKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZT86IHN0cmluZyB9KS52YWx1ZTtcblxuXHRcdFx0b2sobWVzc2FnZT8uaW5jbHVkZXMoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQpKTtcblx0XHRcdG9rKG1lc3NhZ2U/LmluY2x1ZGVzKCdTYW5kYm94aW5nIGNhbiBiZSBkaXNhYmxlZCBieSBzZXR0aW5nJykpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlLCBtZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmV0cnkgd2hlbiB1bnNhbmRib3hlZCBjb21tYW5kcyBhcmUgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlVbnNhbmRib3hlZCh7XG5cdFx0XHRcdC4uLmJhc2VSZXRyeU9wdGlvbnMsXG5cdFx0XHRcdGFsbG93VW5zYW5kYm94ZWRDb21tYW5kczogZmFsc2UsXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCByZXRyeSB3aGVuIHRoZSBjb21tYW5kIGlzIGFscmVhZHkgdW5zYW5kYm94ZWQnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlVbnNhbmRib3hlZCh7XG5cdFx0XHRcdC4uLmJhc2VSZXRyeU9wdGlvbnMsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHRcdH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGF1dG9tYXRpY2FsbHkgcmV0cnkgb3V0c2lkZSB0aGUgc2FuZGJveCBmb3IgYXBwYXJlbnQgbmV0d29yayBmYWlsdXJlcycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeVVuc2FuZGJveGVkKHtcblx0XHRcdFx0Li4uYmFzZVJldHJ5T3B0aW9ucyxcblx0XHRcdFx0b3V0cHV0OiAnY29ubmVjdDogT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQnLFxuXHRcdFx0fSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXRyeSBpbiB0aGUgc2FuZGJveCBieSBhbGxvd2luZyBuZXR3b3JrIGZvciBhcHBhcmVudCBuZXR3b3JrIGZhaWx1cmVzJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5QWxsb3dOZXR3b3JrSW5TYW5kYm94ZWQoYmFzZUFsbG93TmV0d29ya1JldHJ5T3B0aW9ucyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCByZXRyeSB3aXRoIGFsbG93LW5ldHdvcmsgd2hlbiBkaXNhYmxlZCBvciBhbHJlYWR5IHJlcXVlc3RlZCcsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeUFsbG93TmV0d29ya0luU2FuZGJveGVkKHtcblx0XHRcdFx0Li4uYmFzZUFsbG93TmV0d29ya1JldHJ5T3B0aW9ucyxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IGZhbHNlLFxuXHRcdFx0fSksIGZhbHNlKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeUFsbG93TmV0d29ya0luU2FuZGJveGVkKHtcblx0XHRcdFx0Li4uYmFzZUFsbG93TmV0d29ya1JldHJ5T3B0aW9ucyxcblx0XHRcdFx0cmVxdWVzdEFsbG93TmV0d29yazogdHJ1ZSxcblx0XHRcdH0pLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlBbGxvd05ldHdvcmtJblNhbmRib3hlZCh7XG5cdFx0XHRcdC4uLmJhc2VBbGxvd05ldHdvcmtSZXRyeU9wdGlvbnMsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHRcdH0pLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlBbGxvd05ldHdvcmtJblNhbmRib3hlZCh7XG5cdFx0XHRcdC4uLmJhc2VBbGxvd05ldHdvcmtSZXRyeU9wdGlvbnMsXG5cdFx0XHRcdG91dHB1dDogJ3JlZ3VsYXIgY29tbWFuZCBmYWlsdXJlJyxcblx0XHRcdH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJldHJ5IGJhY2tncm91bmQsIHRpbWVkLW91dCwgc3VjY2Vzc2Z1bCwgb3Igbm9uLXNhbmRib3gtYmxvY2tlZCByZXN1bHRzJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5VW5zYW5kYm94ZWQoe1xuXHRcdFx0XHQuLi5iYXNlUmV0cnlPcHRpb25zLFxuXHRcdFx0XHRpc0JhY2tncm91bmRFeGVjdXRpb246IHRydWUsXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5VW5zYW5kYm94ZWQoe1xuXHRcdFx0XHQuLi5iYXNlUmV0cnlPcHRpb25zLFxuXHRcdFx0XHRkaWRUaW1lb3V0OiB0cnVlLFxuXHRcdFx0fSksIGZhbHNlKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeVVuc2FuZGJveGVkKHtcblx0XHRcdFx0Li4uYmFzZVJldHJ5T3B0aW9ucyxcblx0XHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkQXV0b21hdGljYWxseVJldHJ5VW5zYW5kYm94ZWQoe1xuXHRcdFx0XHQuLi5iYXNlUmV0cnlPcHRpb25zLFxuXHRcdFx0XHRvdXRwdXQ6ICdyZWd1bGFyIGNvbW1hbmQgZmFpbHVyZScsXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgcmV0cnkgZWxpY2l0YXRpb24gd2hlbiBwcmVwYXJlZCBpbnZvY2F0aW9uIHdhcyBhdXRvLWFwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoeyBlY2hvOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhdXRvLXJldHJ5LWF1dG8tYXBwcm92ZWQtc2Vzc2lvbicpO1xuXG5cdFx0XHRjb25zdCBwcmVwYXJlZEludm9jYXRpb24gPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnZWNobyBoZWxsbycgfSk7XG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocHJlcGFyZWRJbnZvY2F0aW9uKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0QXV0b21hdGljVW5zYW5kYm94UmV0cnlFbGljaXRhdGlvbihydW5JblRlcm1pbmFsVG9vbCwgc2Vzc2lvblJlc291cmNlLCAnZWNobyBoZWxsbycsICdiYXNoJywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvLXJldHJ5IHdpdGhvdXQgZWxpY2l0YXRpb24gd2hlbiBzZXNzaW9uIGlzIGluIGF1dG8tYXBwcm92ZSBwZXJtaXNzaW9uIGxldmVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhdXRvLXJldHJ5LWFwcHJvdmFsLXNlc3Npb24nKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB7XG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKCkgPT4gKHsgaW5wdXQ6IHsgY3VycmVudE1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSB9IH0gfSkpIGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlWydnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSddLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhdXRvQXBwcm92ZVJ1bkluVGVybWluYWxUb29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdFx0Y29uc3QgcHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgYXV0b0FwcHJvdmVSdW5JblRlcm1pbmFsVG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdSZW1vdmUgYSBmaWxlJyxcblx0XHRcdFx0XHRnb2FsOiAnUmVtb3ZlIGEgZmlsZScsXG5cdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwMDAwLFxuXHRcdFx0XHR9IGFzIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdH0gYXMgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHByZXBhcmVkSW52b2NhdGlvbik7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlQ2hhdE1vZGVsV2l0aFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IHNob3VsZFJldHJ5ID0gYXdhaXQgY29uZmlybUF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5KGF1dG9BcHByb3ZlUnVuSW5UZXJtaW5hbFRvb2wsIHNlc3Npb25SZXNvdXJjZSwgJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcsICdiYXNoJywgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZFJldHJ5LCB0cnVlLCAnRXhwZWN0ZWQgYXV0by1hcHByb3ZlIHNlc3Npb24gdG8gcmV0cnkgd2l0aG91dCBwcm9tcHRpbmcnKTtcblx0XHRcdGNvbnN0IGVsaWNpdGF0aW9uID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk/LnJlc3BvbnNlPy5yZXNwb25zZS52YWx1ZS5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSAnZWxpY2l0YXRpb24yJyk7XG5cdFx0XHRvayghZWxpY2l0YXRpb24sICdFeHBlY3RlZCBubyBlbGljaXRhdGlvbiBpbiBhdXRvLWFwcHJvdmUgc2Vzc2lvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgcmV0cnkgZWxpY2l0YXRpb24gd2hlbiBwcmVwYXJlZCBpbnZvY2F0aW9uIHJlcXVpcmVkIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHt9KTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWRJbnZvY2F0aW9uID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcgfSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChwcmVwYXJlZEludm9jYXRpb24pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnRBdXRvbWF0aWNVbnNhbmRib3hSZXRyeUVsaWNpdGF0aW9uKHJ1bkluVGVybWluYWxUb29sLCBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2F1dG8tcmV0cnktY29uZmlybWF0aW9uLXJlcXVpcmVkLXNlc3Npb24nKSwgJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcsICdiYXNoJywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgcmV0cnkgY29uZmlybWF0aW9uIHRpdGxlIHdpdGhvdXQgc2FuZGJveCBsaW5rJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBnZXRBdXRvbWF0aWNVbnNhbmRib3hSZXRyeVRpdGxlKHJ1bkluVGVybWluYWxUb29sLCAnYmFzaCcsIHVuZGVmaW5lZCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRpdGxlLnZhbHVlLCAnUnVuIGBiYXNoYCBjb21tYW5kIG91dHNpZGUgdGhlIHNhbmRib3g/Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHJldHJ5IGNvbmZpcm1hdGlvbiB0aXRsZSB3aXRob3V0IHNhbmRib3ggbGluayBmb3IgYmxvY2tlZCBkb21haW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBnZXRBdXRvbWF0aWNVbnNhbmRib3hSZXRyeVRpdGxlKHJ1bkluVGVybWluYWxUb29sLCAnYmFzaCcsIFsnZXhhbXBsZS5jb20nXSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRpdGxlLnZhbHVlLCAnUnVuIGBiYXNoYCBjb21tYW5kIG91dHNpZGUgdGhlIHNhbmRib3ggdG8gYWNjZXNzIGBleGFtcGxlLmNvbWA/Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGFsbG93LW5ldHdvcmsgcmV0cnkgY29uZmlybWF0aW9uIHRpdGxlIHdpdGhvdXQgc2FuZGJveCBsaW5rJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBnZXRBdXRvbWF0aWNBbGxvd05ldHdvcmtSZXRyeVRpdGxlKHJ1bkluVGVybWluYWxUb29sLCAnYmFzaCcsIHVuZGVmaW5lZCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRpdGxlLnZhbHVlLCAnUmV0cnkgYGJhc2hgIGNvbW1hbmQgaW4gdGhlIHNhbmRib3ggYnkgYWxsb3dpbmcgbmV0d29yayBhY2Nlc3M/Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGFsbG93LW5ldHdvcmsgcmV0cnkgY29uZmlybWF0aW9uIHRpdGxlIHdpdGhvdXQgc2FuZGJveCBsaW5rIGZvciBibG9ja2VkIGRvbWFpbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IGdldEF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5VGl0bGUocnVuSW5UZXJtaW5hbFRvb2wsICdiYXNoJywgWydleGFtcGxlLmNvbSddKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwodGl0bGUudmFsdWUsICdSZXRyeSBgYmFzaGAgY29tbWFuZCBpbiB0aGUgc2FuZGJveCBieSBhbGxvd2luZyBuZXR3b3JrIGFjY2VzcyB0byBgZXhhbXBsZS5jb21gPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgYWxsb3ctbmV0d29yayByZXRyeSBlbGljaXRhdGlvbiB3aXRoIHNhbmRib3gtcHJlc2VydmluZyB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydEF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5RWxpY2l0YXRpb24oXG5cdFx0XHRcdHJ1bkluVGVybWluYWxUb29sLFxuXHRcdFx0XHRMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2F1dG8tcmV0cnktYWxsb3ctbmV0d29yay1zZXNzaW9uJyksXG5cdFx0XHRcdCdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQnYmFzaCcsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0J1JldHJ5IGBiYXNoYCBjb21tYW5kIGluIHRoZSBzYW5kYm94IGJ5IGFsbG93aW5nIG5ldHdvcmsgYWNjZXNzPydcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2hvdyByZXRyeSBlbGljaXRhdGlvbiB3aGVuIHNhbmRib3ggZm9yY2UtYXBwcm92ZWQgY29tbWFuZCB3b3VsZCBvdGhlcndpc2UgcmVxdWlyZSBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7fSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MuanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcmVwYXJlZEludm9jYXRpb24gPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAncm0gZGFuZ2Vyb3VzLWZpbGUudHh0JyB9KTtcblxuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHByZXBhcmVkSW52b2NhdGlvbik7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSBwcmVwYXJlZEludm9jYXRpb24hLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5pc1NhbmRib3hXcmFwcGVkLCB0cnVlKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0QXV0b21hdGljVW5zYW5kYm94UmV0cnlFbGljaXRhdGlvbihydW5JblRlcm1pbmFsVG9vbCwgTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhdXRvLXJldHJ5LXNhbmRib3gtZm9yY2UtYXBwcm92ZWQtc2Vzc2lvbicpLCAncm0gZGFuZ2Vyb3VzLWZpbGUudHh0JywgJ2Jhc2gnLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHN1aXRlKCdkZWZhdWx0IGF1dG8tYXBwcm92ZSBydWxlcycsICgpID0+IHtcblx0XHRjb25zdCBkZWZhdWx0cyA9IHRlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uW1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmVdLmRlZmF1bHQgYXMgUmVjb3JkPHN0cmluZywgYm9vbGVhbiB8IHsgYXBwcm92ZTogYm9vbGVhbjsgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW4gfT47XG5cblx0XHRzdWl0ZVNldHVwKCgpID0+IHtcblx0XHRcdC8vIFNhbml0eSBjaGVjayBvbiBlbnRyaWVzIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBkZWZhdWx0cyBhcmUgYWN0dWFsbHkgcHVsbGVkIGluXG5cdFx0XHRvayhPYmplY3Qua2V5cyhkZWZhdWx0cykubGVuZ3RoID4gNTApO1xuXHRcdH0pO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKGRlZmF1bHRzKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGF1dG9BcHByb3ZlZFRlc3RDYXNlcyA9IFtcblx0XHRcdC8vIFNhZmUgY29tbWFuZHNcblx0XHRcdCdlY2hvIGFiYycsXG5cdFx0XHQnZWNobyBcImFiY1wiJyxcblx0XHRcdCdlY2hvIFxcJ2FiY1xcJycsXG5cdFx0XHQnbHMgLWxhJyxcblx0XHRcdCdkaXInLFxuXHRcdFx0J3B3ZCcsXG5cdFx0XHQnY2F0IGZpbGUudHh0Jyxcblx0XHRcdCdoZWFkIC1uIDEwIGZpbGUudHh0Jyxcblx0XHRcdCd0YWlsIC1mIGxvZy50eHQnLFxuXHRcdFx0J2ZpbmRzdHIgcGF0dGVybiBmaWxlLnR4dCcsXG5cdFx0XHQnd2MgLWwgZmlsZS50eHQnLFxuXHRcdFx0J3RyIGEteiBBLVonLFxuXHRcdFx0J2N1dCAtZDogLWYxJyxcblx0XHRcdCdjbXAgZmlsZTEgZmlsZTInLFxuXHRcdFx0J3doaWNoIG5vZGUnLFxuXHRcdFx0J2Jhc2VuYW1lIC9wYXRoL3RvL2ZpbGUnLFxuXHRcdFx0J2Rpcm5hbWUgL3BhdGgvdG8vZmlsZScsXG5cdFx0XHQncmVhbHBhdGggLicsXG5cdFx0XHQncmVhZGxpbmsgc3ltbGluaycsXG5cdFx0XHQnc3RhdCBmaWxlLnR4dCcsXG5cdFx0XHQnZmlsZSBkb2N1bWVudC5wZGYnLFxuXHRcdFx0J2R1IC1zaCBmb2xkZXInLFxuXHRcdFx0J2RmIC1oJyxcblx0XHRcdCdzbGVlcCA1Jyxcblx0XHRcdCdjZCAvaG9tZS91c2VyJyxcblx0XHRcdCdubCAtYmEgcGF0aC90by9maWxlLnR4dCcsXG5cblx0XHRcdC8vIFNhZmUgZ2l0IHN1Yi1jb21tYW5kc1xuXHRcdFx0J2dpdCBzdGF0dXMnLFxuXHRcdFx0J2dpdCBsb2cgLS1vbmVsaW5lJyxcblx0XHRcdCdnaXQgc2hvdyBIRUFEJyxcblx0XHRcdCdnaXQgc2hvdyAtLWZvcm1hdD0lQiBIRUFEJyxcblx0XHRcdCdnaXQgc2hvdyAtLW91dHB1dC1mb3JtYXQ9dGV4dCBIRUFEJyxcblx0XHRcdCdnaXQgZGlmZiBtYWluJyxcblx0XHRcdCdnaXQgZ3JlcCBcIlRPRE9cIicsXG5cblx0XHRcdC8vIFBvd2VyU2hlbGwgY29tbWFuZHNcblx0XHRcdCdHZXQtQ2hpbGRJdGVtJyxcblx0XHRcdCdHZXQtRGF0ZScsXG5cdFx0XHQnR2V0LVJhbmRvbScsXG5cdFx0XHQnR2V0LUxvY2F0aW9uJyxcblx0XHRcdCdTZXQtTG9jYXRpb24gQzpcXFxcVXNlcnNcXFxcdGVzdCcsXG5cdFx0XHQnV3JpdGUtSG9zdCBcIkhlbGxvXCInLFxuXHRcdFx0J1dyaXRlLU91dHB1dCBcIlRlc3RcIicsXG5cdFx0XHQnT3V0LVN0cmluZycsXG5cdFx0XHQnU3BsaXQtUGF0aCBDOlxcXFxVc2Vyc1xcXFx0ZXN0Jyxcblx0XHRcdCdKb2luLVBhdGggQzpcXFxcVXNlcnMgdGVzdCcsXG5cdFx0XHQnU3RhcnQtU2xlZXAgMicsXG5cblx0XHRcdC8vIEV4cGxpY2l0IFBvd2VyU2hlbGwgY21kbGV0c1xuXHRcdFx0J1NlbGVjdC1PYmplY3QgTmFtZScsXG5cdFx0XHQnTWVhc3VyZS1PYmplY3QgTGVuZ3RoJyxcblx0XHRcdCdDb21wYXJlLU9iamVjdCAkYSAkYicsXG5cdFx0XHQnRm9ybWF0LVRhYmxlJyxcblx0XHRcdCdTb3J0LU9iamVjdCBOYW1lJyxcblxuXHRcdFx0Ly8gQ29tbWFuZHMgd2l0aCBhY2NlcHRhYmxlIGFyZ3VtZW50c1xuXHRcdFx0J2NvbHVtbiBkYXRhLnR4dCcsXG5cdFx0XHQnZGF0ZSArJVktJW0tJWQnLFxuXHRcdFx0J2ZpbmQgLiAtbmFtZSBcIioudHh0XCInLFxuXHRcdFx0J2dyZXAgcGF0dGVybiBmaWxlLnR4dCcsXG5cdFx0XHQncmcgcGF0dGVybiBmaWxlLnR4dCcsXG5cdFx0XHQncmcgLS1qc29uIHBhdHRlcm4gLicsXG5cdFx0XHQncmcgLWkgLS1jb2xvcj1uZXZlciBcIlRPRE9cIiBzcmMvJyxcblx0XHRcdCdzZWQgXCJzL2Zvby9iYXIvZ1wiJyxcblx0XHRcdCdzZWQgLW4gXCIxLDEwcFwiIGZpbGUudHh0Jyxcblx0XHRcdCdzZWQgLW4gXFwnNDUsODBwXFwnIC9mb28vYmFyL0V4YW1wbGUuamF2YScsXG5cdFx0XHQnc2VkIC1uIFxcJzQ1LDgwcFxcJyBleHRlbnNpb25zL21hcmtkb3duLWxhbmd1YWdlLWZlYXR1cmVzL3NyYy90ZXN0L2NvcHlGaWxlLnRlc3QudHMnLFxuXHRcdFx0J3NvcnQgZmlsZS50eHQnLFxuXHRcdFx0J3RyZWUgZGlyZWN0b3J5JyxcblxuXHRcdFx0Ly8gb2Rcblx0XHRcdCdvZCBzb21lZmlsZScsXG5cdFx0XHQnb2QgLUEgeCBzb21lZmlsZScsXG5cblx0XHRcdC8vIHh4ZFxuXHRcdFx0J3h4ZCcsXG5cdFx0XHQneHhkIHNvbWVmaWxlJyxcblx0XHRcdCd4eGQgLWwxMDAgc29tZWZpbGUnLFxuXHRcdFx0J3h4ZCAtciBzb21lZmlsZScsXG5cdFx0XHQneHhkIC1ycCBzb21lZmlsZScsXG5cblx0XHRcdC8vIGRvY2tlciByZWFkb25seSBzdWItY29tbWFuZHNcblx0XHRcdCdkb2NrZXIgcHMnLFxuXHRcdFx0J2RvY2tlciBwcyAtYScsXG5cdFx0XHQnZG9ja2VyIGltYWdlcycsXG5cdFx0XHQnZG9ja2VyIGluZm8nLFxuXHRcdFx0J2RvY2tlciB2ZXJzaW9uJyxcblx0XHRcdCdkb2NrZXIgaW5zcGVjdCBteWNvbnRhaW5lcicsXG5cdFx0XHQnZG9ja2VyIGxvZ3MgbXljb250YWluZXInLFxuXHRcdFx0J2RvY2tlciB0b3AgbXljb250YWluZXInLFxuXHRcdFx0J2RvY2tlciBzdGF0cycsXG5cdFx0XHQnZG9ja2VyIHBvcnQgbXljb250YWluZXInLFxuXHRcdFx0J2RvY2tlciBkaWZmIG15Y29udGFpbmVyJyxcblx0XHRcdCdkb2NrZXIgc2VhcmNoIG5naW54Jyxcblx0XHRcdCdkb2NrZXIgZXZlbnRzJyxcblx0XHRcdCdkb2NrZXIgY29udGFpbmVyIGxzJyxcblx0XHRcdCdkb2NrZXIgY29udGFpbmVyIHBzJyxcblx0XHRcdCdkb2NrZXIgY29udGFpbmVyIGluc3BlY3QgbXljb250YWluZXInLFxuXHRcdFx0J2RvY2tlciBpbWFnZSBscycsXG5cdFx0XHQnZG9ja2VyIGltYWdlIGhpc3RvcnkgbXlpbWFnZScsXG5cdFx0XHQnZG9ja2VyIGltYWdlIGluc3BlY3QgbXlpbWFnZScsXG5cdFx0XHQnZG9ja2VyIG5ldHdvcmsgbHMnLFxuXHRcdFx0J2RvY2tlciBuZXR3b3JrIGluc3BlY3QgbXluZXR3b3JrJyxcblx0XHRcdCdkb2NrZXIgdm9sdW1lIGxzJyxcblx0XHRcdCdkb2NrZXIgdm9sdW1lIGluc3BlY3QgbXl2b2x1bWUnLFxuXHRcdFx0J2RvY2tlciBjb250ZXh0IGxzJyxcblx0XHRcdCdkb2NrZXIgY29udGV4dCBpbnNwZWN0IG15Y29udGV4dCcsXG5cdFx0XHQnZG9ja2VyIGNvbnRleHQgc2hvdycsXG5cdFx0XHQnZG9ja2VyIHN5c3RlbSBkZicsXG5cdFx0XHQnZG9ja2VyIHN5c3RlbSBpbmZvJyxcblx0XHRcdCdkb2NrZXIgY29tcG9zZSBwcycsXG5cdFx0XHQnZG9ja2VyIGNvbXBvc2UgbHMnLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIHRvcCcsXG5cdFx0XHQnZG9ja2VyIGNvbXBvc2UgbG9ncycsXG5cdFx0XHQnZG9ja2VyIGNvbXBvc2UgaW1hZ2VzJyxcblx0XHRcdCdkb2NrZXIgY29tcG9zZSBjb25maWcnLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIHZlcnNpb24nLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIHBvcnQnLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIGV2ZW50cycsXG5cdFx0XTtcblx0XHRjb25zdCBjb25maXJtYXRpb25SZXF1aXJlZFRlc3RDYXNlcyA9IFtcblx0XHRcdC8vIGdpdCBsb2cgZmlsZSBvdXRwdXRcblx0XHRcdCdnaXQgbG9nIC0tb3V0cHV0PWxvZy50eHQnLFxuXG5cdFx0XHQvLyBnaXQgc2hvdyBmaWxlIG91dHB1dFxuXHRcdFx0J2dpdCBzaG93IC0tZm9ybWF0PSVCIC0tb3V0cHV0PW1lc3NhZ2UudHh0IEhFQUQnLFxuXHRcdFx0J2dpdCBzaG93IC0tb3V0cHV0IG1lc3NhZ2UudHh0IEhFQUQnLFxuXG5cdFx0XHQvLyBEYW5nZXJvdXMgZmlsZSBvcGVyYXRpb25zXG5cdFx0XHQncm0gUkVBRE1FLm1kJyxcblx0XHRcdCdybWRpciBmb2xkZXInLFxuXHRcdFx0J2RlbCBmaWxlLnR4dCcsXG5cdFx0XHQnUmVtb3ZlLUl0ZW0gZmlsZS50eHQnLFxuXHRcdFx0J3JpIGZpbGUudHh0Jyxcblx0XHRcdCdyZCBmb2xkZXInLFxuXHRcdFx0J2VyYXNlIGZpbGUudHh0Jyxcblx0XHRcdCdkZCBpZj0vZGV2L3plcm8gb2Y9ZmlsZScsXG5cblx0XHRcdC8vIFByb2Nlc3MgbWFuYWdlbWVudFxuXHRcdFx0J2tpbGwgMTIzNCcsXG5cdFx0XHQncHMgYXV4Jyxcblx0XHRcdCd0b3AnLFxuXHRcdFx0J1N0b3AtUHJvY2VzcyAtSWQgMTIzNCcsXG5cdFx0XHQnc3BwcyBub3RlcGFkJyxcblx0XHRcdCd0YXNra2lsbCAvZiAvaW0gbm90ZXBhZC5leGUnLFxuXHRcdFx0J3Rhc2traWxsLmV4ZSAvZiAvaW0gY21kLmV4ZScsXG5cblx0XHRcdC8vIFdlYiByZXF1ZXN0c1xuXHRcdFx0J2N1cmwgaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHQnd2dldCBodHRwczovL2V4YW1wbGUuY29tL2ZpbGUnLFxuXHRcdFx0J0ludm9rZS1SZXN0TWV0aG9kIGh0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyxcblx0XHRcdCdJbnZva2UtV2ViUmVxdWVzdCBodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdCdpcm0gaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHQnaXdyIGh0dHBzOi8vZXhhbXBsZS5jb20nLFxuXG5cdFx0XHQvLyBGaWxlIHBlcm1pc3Npb25zXG5cdFx0XHQnY2htb2QgNzU1IGZpbGUuc2gnLFxuXHRcdFx0J2Nob3duIHVzZXI6Z3JvdXAgZmlsZS50eHQnLFxuXHRcdFx0J1NldC1JdGVtUHJvcGVydHkgZmlsZS50eHQgSXNSZWFkT25seSAkdHJ1ZScsXG5cdFx0XHQnc3AgZmlsZS50eHQgSXNSZWFkT25seSAkdHJ1ZScsXG5cdFx0XHQnU2V0LUFjbCBmaWxlLnR4dCAkYWNsJyxcblxuXHRcdFx0Ly8gQ29tbWFuZCBleGVjdXRpb25cblx0XHRcdCdqcSBcXCcubmFtZVxcJyBmaWxlLmpzb24nLFxuXHRcdFx0J3hhcmdzIHJtJyxcblx0XHRcdCdldmFsIFwiZWNobyBoZWxsb1wiJyxcblx0XHRcdCdJbnZva2UtRXhwcmVzc2lvbiBcIkdldC1EYXRlXCInLFxuXHRcdFx0J2lleCBcIldyaXRlLUhvc3QgdGVzdFwiJyxcblxuXHRcdFx0Ly8gQXJiaXRyYXJ5IFBvd2VyU2hlbGwgY21kbGV0cyBtdXN0IG5vdCBiZSBhcHByb3ZlZCBieSB2ZXJiIGFsb25lXG5cdFx0XHQnU2VsZWN0LUN1c3RvbScsXG5cdFx0XHQnTWVhc3VyZS1Db21tYW5kJyxcblx0XHRcdCdDb21wYXJlLUN1c3RvbScsXG5cdFx0XHQnRm9ybWF0LUhleCcsXG5cdFx0XHQnU29ydC1DdXN0b20nLFxuXG5cdFx0XHQvLyBDb21tYW5kcyB3aXRoIGRhbmdlcm91cyBhcmd1bWVudHNcblx0XHRcdCdjb2x1bW4gLWMgMTAwMDAgZmlsZS50eHQnLFxuXHRcdFx0J2RhdGUgLS1zZXQ9XCIyMDIzLTAxLTAxXCInLFxuXHRcdFx0J2ZpbmQgLiAtZGVsZXRlJyxcblx0XHRcdCdmaW5kIC4gLWV4ZWMgcm0ge30gXFxcXDsnLFxuXHRcdFx0J2ZpbmQgLiAtZXhlY2RpciBybSB7fSBcXFxcOycsXG5cdFx0XHQnZmluZCAuIC1mcHJpbnQgb3V0cHV0LnR4dCcsXG5cdFx0XHQncmcgLS1wcmUgY2F0IHBhdHRlcm4gLicsXG5cdFx0XHQncmcgLS1ob3N0bmFtZS1iaW4gaG9zdG5hbWUgcGF0dGVybiAuJyxcblx0XHRcdCdzZWQgLS1pbi1wbGFjZSBcInMvZm9vL2Jhci9cIiBmaWxlLnR4dCcsXG5cdFx0XHQnc2VkIC1lIFwicy9hL2IvXCIgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCAtZiBzY3JpcHQuc2VkIGZpbGUudHh0Jyxcblx0XHRcdCdzZWQgLS1leHByZXNzaW9uIFwicy9hL2IvXCIgZmlsZS50eHQnLFxuXHRcdFx0J3NlZCAtLWZpbGUgc2NyaXB0LnNlZCBmaWxlLnR4dCcsXG5cdFx0XHQnc2VkIFwicy9mb28vYmFyL2VcIiBmaWxlLnR4dCcsXG5cdFx0XHQnc2VkIFwicy9mb28vYmFyL3cgb3V0cHV0LnR4dFwiIGZpbGUudHh0Jyxcblx0XHRcdCdzZWQgXCI7VyBvdXRwdXQudHh0XCIgZmlsZS50eHQnLFxuXHRcdFx0J3NvcnQgLW8gL2V0Yy9wYXNzd2QgZmlsZS50eHQnLFxuXHRcdFx0J3NvcnQgLVMgMTAwRyBmaWxlLnR4dCcsXG5cdFx0XHQndHJlZSAtbyBvdXRwdXQudHh0JyxcblxuXHRcdFx0Ly8gVHJhbnNpZW50IGVudmlyb25tZW50IHZhcmlhYmxlc1xuXHRcdFx0J2xzPVwidGVzdFwiIGN1cmwgaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLFxuXHRcdFx0J0FQSV9LRVk9c2VjcmV0IGN1cmwgaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLFxuXHRcdFx0J0hUVFBfUFJPWFk9cHJveHk6ODA4MCB3Z2V0IGh0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0J1ZBUjE9dmFsdWUxIFZBUjI9dmFsdWUyIGVjaG8gdGVzdCcsXG5cdFx0XHQnQT0xIEI9MiBDPTMgLi9zY3JpcHQuc2gnLFxuXG5cdFx0XHQvLyB4eGQgd2l0aCBvdXRmaWxlIG9yIGFtYmlndW91cyBhcmdzXG5cdFx0XHQneHhkIGluZmlsZSBvdXRmaWxlJyxcblx0XHRcdCd4eGQgLWwgMTAwIHNvbWVmaWxlJyxcblxuXHRcdFx0Ly8gZG9ja2VyIHdyaXRlL2V4ZWN1dGUgc3ViLWNvbW1hbmRzXG5cdFx0XHQnZG9ja2VyIHJ1biBuZ2lueCcsXG5cdFx0XHQnZG9ja2VyIGV4ZWMgbXljb250YWluZXIgYmFzaCcsXG5cdFx0XHQnZG9ja2VyIHJtIG15Y29udGFpbmVyJyxcblx0XHRcdCdkb2NrZXIgcm1pIG15aW1hZ2UnLFxuXHRcdFx0J2RvY2tlciBidWlsZCAuJyxcblx0XHRcdCdkb2NrZXIgcHVzaCBteWltYWdlJyxcblx0XHRcdCdkb2NrZXIgcHVsbCBuZ2lueCcsXG5cdFx0XHQnZG9ja2VyIGNvbXBvc2UgdXAnLFxuXHRcdFx0J2RvY2tlciBjb21wb3NlIGRvd24nLFxuXHRcdF07XG5cblx0XHRzdWl0ZS5za2lwKCdhdXRvIGFwcHJvdmVkJywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGF1dG9BcHByb3ZlZFRlc3RDYXNlcykge1xuXHRcdFx0XHR0ZXN0KGNvbW1hbmQucmVwbGFjZUFsbCgnXFxuJywgJ1xcXFxuJyksIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQoYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZCB9KSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHN1aXRlKCdjb25maXJtYXRpb24gcmVxdWlyZWQnLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29uZmlybWF0aW9uUmVxdWlyZWRUZXN0Q2FzZXMpIHtcblx0XHRcdFx0dGVzdChjb21tYW5kLnJlcGxhY2VBbGwoJ1xcbicsICdcXFxcbicpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQoYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZCB9KSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmV0cnkgb3V0c2lkZSBzYW5kYm94JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBtZW50aW9uIGRlbmllZCBkb21haW5zIHdoZW4gc2FuZGJveCBkZW5pZXMgbmV0d29yayBhY2Nlc3MgZXhwbGljaXRseScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNldEJhY2tlbmRPcyhPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0dGVybWluYWxTYW5kYm94U2VydmljZS53cmFwQ29tbWFuZCA9IGFzeW5jIChjb21tYW5kOiBzdHJpbmcpID0+ICh7XG5cdFx0XHRcdGNvbW1hbmQ6IGB1bnNhbmRib3hlZDoke2NvbW1hbmR9YCxcblx0XHRcdFx0aXNTYW5kYm94V3JhcHBlZDogZmFsc2UsXG5cdFx0XHRcdHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uOiB0cnVlLFxuXHRcdFx0XHRibG9ja2VkRG9tYWluczogWydldmlsLmNvbSddLFxuXHRcdFx0XHRkZW5pZWREb21haW5zOiBbJ2V2aWwuY29tJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2N1cmwgaHR0cHM6Ly9ldmlsLmNvbScgfSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZCBvdXRzaWRlIHRoZSBbc2FuZGJveF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXNhbmRib3hpbmcpIHRvIGFjY2VzcyBgZXZpbC5jb21gPycpO1xuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZSA9IHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U7XG5cdFx0XHRvayhjb25maXJtYXRpb25NZXNzYWdlICYmIHR5cGVvZiBjb25maXJtYXRpb25NZXNzYWdlICE9PSAnc3RyaW5nJyk7XG5cdFx0XHRpZiAoIWNvbmZpcm1hdGlvbk1lc3NhZ2UgfHwgdHlwZW9mIGNvbmZpcm1hdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgbWFya2Rvd24gY29uZmlybWF0aW9uIG1lc3NhZ2UnKTtcblx0XHRcdH1cblx0XHRcdG9rKGNvbmZpcm1hdGlvbk1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ1JlYXNvbiBmb3IgbGVhdmluZyB0aGUgc2FuZGJveDogVGhpcyBjb21tYW5kIGFjY2Vzc2VzIGV2aWwuY29tLCB3aGljaCBpcyBibG9ja2VkIGJ5IGNoYXQuYWdlbnQuZGVuaWVkTmV0d29ya0RvbWFpbnMuJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZvcmNlIGNvbmZpcm1hdGlvbiBmb3IgZXhwbGljaXQgc2FuZGJveGVkIGFsbG93LW5ldHdvcmsgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzLCB0cnVlKTtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHRlcm1pbmFsU2FuZGJveFNlcnZpY2Uud3JhcENvbW1hbmQgPSBhc3luYyAoY29tbWFuZDogc3RyaW5nLCBfcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPzogYm9vbGVhbiwgX3NoZWxsPzogc3RyaW5nLCBfY3dkPzogVVJJLCBfZGV0YWlscz86IHJlYWRvbmx5IElUZXJtaW5hbFNhbmRib3hDb21tYW5kW10sIHJlcXVlc3RBbGxvd05ldHdvcms/OiBib29sZWFuKSA9PiAoe1xuXHRcdFx0XHRjb21tYW5kOiByZXF1ZXN0QWxsb3dOZXR3b3JrID8gYG5ldHdvcmstc2FuZGJveDoke2NvbW1hbmR9YCA6IGBzYW5kYm94OiR7Y29tbWFuZH1gLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0cnVlLFxuXHRcdFx0XHRyZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbjogcmVxdWVzdEFsbG93TmV0d29yayA/IHRydWUgOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0cmVxdWVzdEFsbG93TmV0d29yazogdHJ1ZSxcblx0XHRcdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbjogJ05lZWRzIHJlZ2lzdHJ5IGFjY2VzcyB3aGlsZSByZW1haW5pbmcgc2FuZGJveGVkJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdBbGxvdyBiYXNoIGNvbW1hbmQgdG8gYWNjZXNzIHRoZSBuZXR3b3JrPycpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcmVzdWx0Py50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdEFsbG93TmV0d29yaywgdHJ1ZSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiwgJ05lZWRzIHJlZ2lzdHJ5IGFjY2VzcyB3aGlsZSByZW1haW5pbmcgc2FuZGJveGVkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCwgJ25ldHdvcmstc2FuZGJveDplY2hvIGhlbGxvJyk7XG5cdFx0XHRjb25zdCBjb25maXJtYXRpb25NZXNzYWdlID0gcmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZTtcblx0XHRcdG9rKGNvbmZpcm1hdGlvbk1lc3NhZ2UgJiYgdHlwZW9mIGNvbmZpcm1hdGlvbk1lc3NhZ2UgIT09ICdzdHJpbmcnKTtcblx0XHRcdGlmICghY29uZmlybWF0aW9uTWVzc2FnZSB8fCB0eXBlb2YgY29uZmlybWF0aW9uTWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBtYXJrZG93biBjb25maXJtYXRpb24gbWVzc2FnZScpO1xuXHRcdFx0fVxuXHRcdFx0b2soY29uZmlybWF0aW9uTWVzc2FnZS52YWx1ZS5pbmNsdWRlcygnUmVhc29uIGZvciBhbGxvd2luZyB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MgaW4gdGhlIHNhbmRib3g6IE5lZWRzIHJlZ2lzdHJ5IGFjY2VzcyB3aGlsZSByZW1haW5pbmcgc2FuZGJveGVkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBhbGxvdy1uZXR3b3JrIGNvbmZpcm1hdGlvbiBmb3IgYmxvY2tlZCBkb21haW5zIHNlbGVjdGVkIGJlZm9yZSBleGVjdXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzLCB0cnVlKTtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHNhbmRib3hQcmVyZXFSZXN1bHQgPSB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoOiAnL3RtcC9zYW5kYm94Lmpzb24nLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHRlcm1pbmFsU2FuZGJveFNlcnZpY2Uud3JhcENvbW1hbmQgPSBhc3luYyAoY29tbWFuZDogc3RyaW5nKSA9PiAoe1xuXHRcdFx0XHRjb21tYW5kOiBgbmV0d29yay1zYW5kYm94OiR7Y29tbWFuZH1gLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0cnVlLFxuXHRcdFx0XHRyZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbjogdHJ1ZSxcblx0XHRcdFx0YmxvY2tlZERvbWFpbnM6IFsnZXZpbC5jb20nXSxcblx0XHRcdFx0ZGVuaWVkRG9tYWluczogWydldmlsLmNvbSddLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXZpbC5jb20nIH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdBbGxvdyBiYXNoIGNvbW1hbmQgdG8gYWNjZXNzIHRoZSBuZXR3b3JrPycpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcmVzdWx0Py50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdEFsbG93TmV0d29yaywgdHJ1ZSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLCBmYWxzZSk7XG5cdFx0XHRjb25zdCBjb25maXJtYXRpb25NZXNzYWdlID0gcmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZTtcblx0XHRcdG9rKGNvbmZpcm1hdGlvbk1lc3NhZ2UgJiYgdHlwZW9mIGNvbmZpcm1hdGlvbk1lc3NhZ2UgIT09ICdzdHJpbmcnKTtcblx0XHRcdGlmICghY29uZmlybWF0aW9uTWVzc2FnZSB8fCB0eXBlb2YgY29uZmlybWF0aW9uTWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBtYXJrZG93biBjb25maXJtYXRpb24gbWVzc2FnZScpO1xuXHRcdFx0fVxuXHRcdFx0b2soY29uZmlybWF0aW9uTWVzc2FnZS52YWx1ZS5pbmNsdWRlcygnUmVhc29uIGZvciBhbGxvd2luZyB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MgaW4gdGhlIHNhbmRib3g6IFRoaXMgY29tbWFuZCBhY2Nlc3NlcyBldmlsLmNvbSwgd2hpY2ggaXMgYmxvY2tlZCBieSBjaGF0LmFnZW50LmRlbmllZE5ldHdvcmtEb21haW5zLicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZWplY3QgZXhwbGljaXQgYWxsb3ctbmV0d29yayByZXF1ZXN0cyB3aGVuIHBlci1jb21tYW5kIG5ldHdvcmsgYWNjZXNzIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgZmFsc2UpO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IHJlcXVlc3RBbGxvd05ldHdvcms6IHRydWUsIHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb246ICdOZWVkcyByZWdpc3RyeSBhY2Nlc3MnIH0pO1xuXHRcdFx0b2socHJlcGFyZWQsICdFeHBlY3RlZCBwcmVwYXJlZCBpbnZvY2F0aW9uIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdG9rKCFwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcywgJ0V4cGVjdGVkIG5vIGNvbmZpcm1hdGlvbiBiZWNhdXNlIHRoZSBjb21tYW5kIHdpbGwgbm90IHJ1bicpO1xuXHRcdFx0b2soKHByZXBhcmVkLmludm9jYXRpb25NZXNzYWdlIGFzIElNYXJrZG93blN0cmluZykudmFsdWUuaW5jbHVkZXMoJ3VucmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcyBpbiB0aGUgc2FuZGJveCBpcyBkaXNhYmxlZCcpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlVG9vbFRlc3QoeyByZXF1ZXN0QWxsb3dOZXR3b3JrOiB0cnVlLCByZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uOiAnTmVlZHMgcmVnaXN0cnkgYWNjZXNzJyB9KTtcblx0XHRcdHN0cmljdEVxdWFsKGNyZWF0ZVRlcm1pbmFsQ2FsbENvdW50LCAwLCAnRXhwZWN0ZWQgbm8gdGVybWluYWwgdG8gYmUgY3JlYXRlZCcpO1xuXHRcdFx0b2socmVzdWx0LnRvb2xSZXN1bHRFcnJvciwgJ0V4cGVjdGVkIHRoZSByZWplY3RlZCByZXF1ZXN0IHRvIGJlIHJldHVybmVkIGFzIGEgdG9vbCBlcnJvcicpO1xuXHRcdFx0b2socmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnICYmIHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmluY2x1ZGVzKCdjaGF0LmFnZW50LnNhbmRib3gucmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGNyZWF0ZSBhIHRlcm1pbmFsIHdoZW4gc2FuZGJveCBmaWxlIGFjY2VzcyBpcyBkZW5pZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmNoZWNrRmlsZUFjY2VzcyA9IGFzeW5jIChwZXJtaXNzaW9uLCBwYXRocykgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChwZXJtaXNzaW9uLCAnd3JpdGUnLCAnRXhwZWN0ZWQgZmlsZSB2YWxpZGF0aW9uIHRvIGNoZWNrIHdyaXRlIGFjY2VzcycpO1xuXHRcdFx0XHRyZXR1cm4geyBhbGxvd2VkOiBmYWxzZSwgZGVuaWVkOiBbLi4ucGF0aHNdIH07XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2VUb29sVGVzdCh7XG5cdFx0XHRcdHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrOiBbJy9ob21lL3VzZXIvb3V0c2lkZS13b3Jrc3BhY2UtZmlsZSddLFxuXHRcdFx0XHRyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1JlYXNvbjogJ1RoZSBjb21tYW5kIHdyaXRlcyBhbiBvdXRzaWRlLXdvcmtzcGFjZSBmaWxlJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChjcmVhdGVUZXJtaW5hbENhbGxDb3VudCwgMCwgJ0V4cGVjdGVkIG5vIHRlcm1pbmFsIHRvIGJlIGNyZWF0ZWQnKTtcblx0XHRcdG9rKHJlc3VsdC50b29sUmVzdWx0RXJyb3IsICdFeHBlY3RlZCBkZW5pZWQgZmlsZSBhY2Nlc3MgdG8gYmUgcmV0dXJuZWQgYXMgYSB0b29sIGVycm9yJyk7XG5cdFx0XHRvayhyZXN1bHQuY29udGVudFswXS5raW5kID09PSAndGV4dCcgJiYgcmVzdWx0LmNvbnRlbnRbMF0udmFsdWUuaW5jbHVkZXMoJ0FjY2VzcyBEZW5pZWQnKSk7XG5cdFx0XHRvayhyZXN1bHQuY29udGVudFswXS5raW5kID09PSAndGV4dCcgJiYgcmVzdWx0LmNvbnRlbnRbMF0udmFsdWUuaW5jbHVkZXMoJ3dyaXRlOiAvaG9tZS91c2VyL291dHNpZGUtd29ya3NwYWNlLWZpbGUnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZm9yY2UgY29uZmlybWF0aW9uIGZvciBleHBsaWNpdCB1bnNhbmRib3hlZCBleGVjdXRpb24gcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXRCYWNrZW5kT3MoT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiB0cnVlLFxuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246ICdOZWVkcyBuZXR3b3JrIGFjY2VzcyBvdXRzaWRlIHRoZSBzYW5kYm94Jyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQgb3V0c2lkZSB0aGUgW3NhbmRib3hdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1zYW5kYm94aW5nKT8nKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LmFsbG93QXV0b0NvbmZpcm0sIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSByZXN1bHQ/LnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24sIHRydWUpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiwgJ05lZWRzIG5ldHdvcmsgYWNjZXNzIG91dHNpZGUgdGhlIHNhbmRib3gnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkLCAndW5zYW5kYm94ZWQ6ZWNobyBoZWxsbycpO1xuXG5cdFx0XHRjb25zdCBjb25maXJtYXRpb25NZXNzYWdlID0gcmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZTtcblx0XHRcdG9rKGNvbmZpcm1hdGlvbk1lc3NhZ2UgJiYgdHlwZW9mIGNvbmZpcm1hdGlvbk1lc3NhZ2UgIT09ICdzdHJpbmcnKTtcblx0XHRcdGlmICghY29uZmlybWF0aW9uTWVzc2FnZSB8fCB0eXBlb2YgY29uZmlybWF0aW9uTWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBtYXJrZG93biBjb25maXJtYXRpb24gbWVzc2FnZScpO1xuXHRcdFx0fVxuXHRcdFx0b2soY29uZmlybWF0aW9uTWVzc2FnZS52YWx1ZS5pbmNsdWRlcygnUmVhc29uIGZvciBsZWF2aW5nIHRoZSBzYW5kYm94OiBOZWVkcyBuZXR3b3JrIGFjY2VzcyBvdXRzaWRlIHRoZSBzYW5kYm94JykpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5kaXNjbGFpbWVyLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRlcm1pbmFsQ3VzdG9tQWN0aW9ucztcblx0XHRcdG9rKGFjdGlvbnMsICdFeHBlY3RlZCBjdXN0b20gYWN0aW9ucyB0byBiZSBkZWZpbmVkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMTEpO1xuXHRcdFx0b2soIWlzU2VwYXJhdG9yKGFjdGlvbnNbMF0pKTtcblx0XHRcdHN0cmljdEVxdWFsKGFjdGlvbnNbMF0ubGFiZWwsICdBbGxvdyBgZWNobyBcdTIwMjZgIGluIHRoaXMgU2Vzc2lvbicpO1xuXHRcdFx0b2soIWlzU2VwYXJhdG9yKGFjdGlvbnNbNF0pKTtcblx0XHRcdHN0cmljdEVxdWFsKGFjdGlvbnNbNF0ubGFiZWwsICdBbGxvdyBFeGFjdCBDb21tYW5kIExpbmUgaW4gdGhpcyBTZXNzaW9uJyk7XG5cdFx0XHRvayghaXNTZXBhcmF0b3IoYWN0aW9uc1sxMF0pKTtcblx0XHRcdHN0cmljdEVxdWFsKGFjdGlvbnNbMTBdLmxhYmVsLCAnQ29uZmlndXJlIEF1dG8gQXBwcm92ZS4uLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlamVjdCBleHBsaWNpdCB1bnNhbmRib3hlZCBleGVjdXRpb24gcmVxdWVzdHMgd2hlbiB1bnNhbmRib3hlZCBjb21tYW5kcyBhcmUgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcywgZmFsc2UpO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2V0QmFja2VuZE9zKE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiAnTmVlZHMgbmV0d29yayBhY2Nlc3Mgb3V0c2lkZSB0aGUgc2FuZGJveCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0b2socmVzdWx0LCAnRXhwZWN0ZWQgcHJlcGFyZWQgaW52b2NhdGlvbiB0byBiZSBkZWZpbmVkJyk7XG5cdFx0XHRvayghcmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAnRXhwZWN0ZWQgbm8gY29uZmlybWF0aW9uIGJlY2F1c2UgdGhlIGNvbW1hbmQgd2lsbCBub3QgcnVuJyk7XG5cdFx0XHRvaygocmVzdWx0Lmludm9jYXRpb25NZXNzYWdlIGFzIElNYXJrZG93blN0cmluZykudmFsdWUuaW5jbHVkZXMoJ05vdCBydW5uaW5nIGBlY2hvIGhlbGxvYCBiZWNhdXNlIHVuc2FuZGJveGVkIGV4ZWN1dGlvbiBpcyBkaXNhYmxlZCcpKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdC50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVqZWN0IGV4cGxpY2l0IHVuc2FuZGJveGVkIGV4ZWN1dGlvbiByZXF1ZXN0cyB3aGVuIGFsbG93IGFyZ3VtZW50IGlzIGZhbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2V0QmFja2VuZE9zKE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiBmYWxzZSxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiB0cnVlLFxuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246ICdOZWVkcyBuZXR3b3JrIGFjY2VzcyBvdXRzaWRlIHRoZSBzYW5kYm94Jyxcblx0XHRcdH0pO1xuXG5cdFx0XHRvayhyZXN1bHQsICdFeHBlY3RlZCBwcmVwYXJlZCBpbnZvY2F0aW9uIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdG9rKCFyZXN1bHQuY29uZmlybWF0aW9uTWVzc2FnZXMsICdFeHBlY3RlZCBubyBjb25maXJtYXRpb24gYmVjYXVzZSB0aGUgY29tbWFuZCB3aWxsIG5vdCBydW4nKTtcblx0XHRcdG9rKChyZXN1bHQuaW52b2NhdGlvbk1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nKS52YWx1ZS5pbmNsdWRlcygnTm90IHJ1bm5pbmcgYGVjaG8gaGVsbG9gIGJlY2F1c2UgdW5zYW5kYm94ZWQgZXhlY3V0aW9uIGlzIGRpc2FibGVkJykpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24sIGZhbHNlKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGF0YS5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgY3JlYXRlIGEgdGVybWluYWwgZm9yIHJlamVjdGVkIGV4cGxpY2l0IHVuc2FuZGJveGVkIGV4ZWN1dGlvbiByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLCBmYWxzZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXRCYWNrZW5kT3MoT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlVG9vbFRlc3Qoe1xuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHRydWUsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogJ05lZWRzIG5ldHdvcmsgYWNjZXNzIG91dHNpZGUgdGhlIHNhbmRib3gnLFxuXHRcdFx0fSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGNyZWF0ZVRlcm1pbmFsQ2FsbENvdW50LCAwLCAnRXhwZWN0ZWQgbm8gdGVybWluYWwgdG8gYmUgY3JlYXRlZCcpO1xuXHRcdFx0b2socmVzdWx0LnRvb2xSZXN1bHRFcnJvciwgJ0V4cGVjdGVkIHRoZSByZWplY3RlZCByZXF1ZXN0IHRvIGJlIHJldHVybmVkIGFzIGEgdG9vbCBlcnJvcicpO1xuXHRcdFx0b2socmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnICYmIHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmluY2x1ZGVzKCdUaGUgY29tbWFuZCB3YXMgbm90IGV4ZWN1dGVkJykpO1xuXHRcdFx0b2socmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnICYmIHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmluY2x1ZGVzKCdjaGF0LmFnZW50LnNhbmRib3guYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGF1dG8tYXBwcm92ZSBzYW5kYm94ZWQgY29tbWFuZHMgd2hlbiBzYW5kYm94IGF1dG8gYXBwcm92ZSBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd0F1dG9BcHByb3ZlLCB0cnVlKTtcblx0XHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlLCBmYWxzZSk7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cdFx0XHRzYW5kYm94UHJlcmVxUmVzdWx0ID0ge1xuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogJy90bXAvc2FuZGJveC5qc29uJyxcblx0XHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXRCYWNrZW5kT3MoT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcgfSk7XG5cblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcmVzdWx0IS50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGV4aXN0aW5nIGFwcHJvdmFsIGZsb3cgZm9yIHNhbmRib3hlZCBjb21tYW5kcyB3aGVuIHNhbmRib3ggYXV0byBhcHByb3ZlIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd0F1dG9BcHByb3ZlLCBmYWxzZSk7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSwgZmFsc2UpO1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0c2FuZGJveFByZXJlcVJlc3VsdCA9IHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6ICcvdG1wL3NhbmRib3guanNvbicsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2V0QmFja2VuZE9zKE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdybSBkYW5nZXJvdXMtZmlsZS50eHQnIH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcmVzdWx0IS50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwcmVwYXJlVG9vbEludm9jYXRpb24gLSBhdXRvIGFwcHJvdmFsIGJlaGF2aW9yJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc2hvdWxkIGF1dG8tYXBwcm92ZSBjb21tYW5kcyBpbiBhbGxvdyBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8gd29ybGQnIH0pO1xuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHJlc3VsdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gZm9yIGNvbW1hbmRzIG5vdCBpbiBhbGxvdyBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRsczogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdybSBmaWxlLnR4dCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUmVtb3ZlIGEgZmlsZScsXG5cdFx0XHRcdGdvYWw6ICdSZW1vdmUgYSBmaWxlJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gZm9yIGNvbW1hbmRzIGluIGRlbnkgbGlzdCBldmVuIGlmIGluIGFsbG93IGxpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdHJtOiBmYWxzZSxcblx0XHRcdFx0ZWNobzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdybSBkYW5nZXJvdXMtZmlsZS50eHQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1JlbW92ZSBhIGRhbmdlcm91cyBmaWxlJyxcblx0XHRcdFx0Z29hbDogJ1JlbW92ZSBhIGRhbmdlcm91cyBmaWxlJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGJhY2tncm91bmQgY29tbWFuZHMgd2l0aCBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGxzOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSBydW4gd2F0Y2gnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1N0YXJ0IHdhdGNoaW5nIGZvciBmaWxlIGNoYW5nZXMnLFxuXHRcdFx0XHRnb2FsOiAnU3RhcnQgd2F0Y2hpbmcgZm9yIGZpbGUgY2hhbmdlcycsXG5cdFx0XHRcdG1vZGU6ICdhc3luYydcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1cHBvcnQgbGVnYWN5IGlzQmFja2dyb3VuZCBpbnB1dCBhcyBhc3luYyBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRsczogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIHdhdGNoJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdTdGFydCB3YXRjaGluZyBmb3IgZmlsZSBjaGFuZ2VzJyxcblx0XHRcdFx0Z29hbDogJ1N0YXJ0IHdhdGNoaW5nIGZvciBmaWxlIGNoYW5nZXMnLFxuXHRcdFx0XHRpc0JhY2tncm91bmQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGF1dG8tYXBwcm92ZSBiYWNrZ3JvdW5kIGNvbW1hbmRzIGluIGFsbG93IGxpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdG5wbTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIHdhdGNoJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdTdGFydCB3YXRjaGluZyBmb3IgZmlsZSBjaGFuZ2VzJyxcblx0XHRcdFx0Z29hbDogJ1N0YXJ0IHdhdGNoaW5nIGZvciBmaWxlIGNoYW5nZXMnLFxuXHRcdFx0XHRtb2RlOiAnYXN5bmMnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgYXV0by1hcHByb3ZlIGluZm8gZm9yIGJhY2tncm91bmQgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdG5wbTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIHdhdGNoJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdTdGFydCB3YXRjaGluZyBmb3IgZmlsZSBjaGFuZ2VzJyxcblx0XHRcdFx0Z29hbDogJ1N0YXJ0IHdhdGNoaW5nIGZvciBmaWxlIGNoYW5nZXMnLFxuXHRcdFx0XHRtb2RlOiAnYXN5bmMnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhhdCBhdXRvLWFwcHJvdmUgaW5mb3JtYXRpb24gaXMgaW5jbHVkZWRcblx0XHRcdG9rKHJlc3VsdD8udG9vbFNwZWNpZmljRGF0YSwgJ0V4cGVjdGVkIHRvb2xTcGVjaWZpY0RhdGEgdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gcmVzdWx0IS50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0XHRvayh0ZXJtaW5hbERhdGEuYXV0b0FwcHJvdmVJbmZvLCAnRXhwZWN0ZWQgYXV0b0FwcHJvdmVJbmZvIHRvIGJlIGRlZmluZWQgZm9yIGF1dG8tYXBwcm92ZWQgYmFja2dyb3VuZCBjb21tYW5kJyk7XG5cdFx0XHRvayh0ZXJtaW5hbERhdGEuYXV0b0FwcHJvdmVJbmZvLnZhbHVlLCAnRXhwZWN0ZWQgYXV0b0FwcHJvdmVJbmZvIHRvIGhhdmUgYSB2YWx1ZScpO1xuXHRcdFx0b2sodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mby52YWx1ZS5pbmNsdWRlcygnbnBtJyksICdFeHBlY3RlZCBhdXRvQXBwcm92ZUluZm8gdG8gbWVudGlvbiB0aGUgYXBwcm92ZWQgcnVsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZWdleCBwYXR0ZXJucyBpbiBhbGxvdyBsaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnL15naXQgKHN0YXR1c3xsb2cpLyc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnZ2l0IHN0YXR1cyAtLXBvcmNlbGFpbicgfSk7XG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29tcGxleCBjb21tYW5kIGNoYWlucyB3aXRoIHN1Yi1jb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0ZWNobzogdHJ1ZSxcblx0XHRcdFx0bHM6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnZWNobyBcImhlbGxvXCIgJiYgbHMgLWxhJyB9KTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uIHdoZW4gb25lIHN1Yi1jb21tYW5kIGlzIG5vdCBhcHByb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0ZWNobzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIFwiaGVsbG9cIiAmJiBybSBmaWxlLnR4dCcgfSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBjb21tYW5kIHN0cmluZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGVjaG86IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdFbXB0eSBjb21tYW5kJyxcblx0XHRcdFx0Z29hbDogJ0VtcHR5IGNvbW1hbmQnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIHBhdHRlcm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnL2Rhbmdlcm91cy8nOiB7IGFwcHJvdmU6IGZhbHNlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHRcdCdlY2hvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8gd29ybGQnIH0pO1xuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHJlc3VsdDEpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gdGhpcyBpcyBhIGRhbmdlcm91cyBjb21tYW5kJyB9KTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG9ubHkgYXBwcm92ZSB3aGVuIG5laXRoZXIgc3ViLWNvbW1hbmRzIG9yIGNvbW1hbmQgbGluZXMgYXJlIGRlbmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2Zvbyc6IHRydWUsXG5cdFx0XHRcdCcvXmZvbyQvJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3QoeyBjb21tYW5kOiAnZm9vJyB9KTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdDEpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2ZvbyBiYXInIH0pO1xuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHJlc3VsdDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29uZmlybWF0aW9uIHRpdGxlIHdpdGggcHJlc2VudGF0aW9uIG92ZXJyaWRlcycsICgpID0+IHtcblx0XHRmdW5jdGlvbiBpbmplY3RNb2NrUHJlc2VudGVyKHRvb2w6IFRlc3RSdW5JblRlcm1pbmFsVG9vbCwgbGFuZ3VhZ2VEaXNwbGF5TmFtZT86IHN0cmluZykge1xuXHRcdFx0Ly8gSW5qZWN0IGEgbW9jayBwcmVzZW50ZXIgYXQgdGhlIHN0YXJ0IHRoYXQgYWx3YXlzIHJldHVybnMgYSByZXN1bHRcblx0XHRcdHRvb2wuY29tbWFuZExpbmVQcmVzZW50ZXJzLnVuc2hpZnQoe1xuXHRcdFx0XHRwcmVzZW50OiAob3B0aW9ucykgPT4gKHtcblx0XHRcdFx0XHRjb21tYW5kTGluZTogb3B0aW9ucy5jb21tYW5kTGluZS5mb3JEaXNwbGF5LFxuXHRcdFx0XHRcdHByb2Nlc3NPdGhlclByZXNlbnRlcnM6IGZhbHNlLFxuXHRcdFx0XHRcdGxhbmd1YWdlRGlzcGxheU5hbWUsXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSB3aXRob3V0TGFuZ3VhZ2UgdGl0bGUgd2hlbiBwcmVzZW50ZXIgcmV0dXJucyBubyBsYW5ndWFnZURpc3BsYXlOYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aW5qZWN0TW9ja1ByZXNlbnRlcihydW5JblRlcm1pbmFsVG9vbCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdybSBmaWxlLnR4dCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUmVtb3ZlIGEgZmlsZScsXG5cdFx0XHRcdGdvYWw6ICdSZW1vdmUgYSBmaWxlJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gY29tbWFuZCBpbiBgYmFzaGA/Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHdpdGhvdXRMYW5ndWFnZSBiYWNrZ3JvdW5kIHRpdGxlIHdoZW4gcHJlc2VudGVyIHJldHVybnMgbm8gbGFuZ3VhZ2VEaXNwbGF5TmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGluamVjdE1vY2tQcmVzZW50ZXIocnVuSW5UZXJtaW5hbFRvb2wpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbnBtIHJ1biB3YXRjaCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnU3RhcnQgd2F0Y2hpbmcnLFxuXHRcdFx0XHRnb2FsOiAnU3RhcnQgd2F0Y2hpbmcnLFxuXHRcdFx0XHRtb2RlOiAnYXN5bmMnXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBjb21tYW5kIGluIGBiYXNoYD8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugd2l0aExhbmd1YWdlIHRpdGxlIHdoZW4gcHJlc2VudGVyIHJldHVybnMgbGFuZ3VhZ2VEaXNwbGF5TmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdub2RlIC1lIFwiY29uc29sZS5sb2coMSlcIicsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUnVuIG5vZGUgY29tbWFuZCcsXG5cdFx0XHRcdGdvYWw6ICdSdW4gbm9kZSBjb21tYW5kJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYE5vZGUuanNgIGNvbW1hbmQgaW4gYGJhc2hgPycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSB3aXRoTGFuZ3VhZ2UgYmFja2dyb3VuZCB0aXRsZSB3aGVuIHByZXNlbnRlciByZXR1cm5zIGxhbmd1YWdlRGlzcGxheU5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbm9kZSAtZSBcImNvbnNvbGUubG9nKDEpXCInLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBub2RlIGNvbW1hbmQnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIG5vZGUgY29tbWFuZCcsXG5cdFx0XHRcdG1vZGU6ICdhc3luYydcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBOb2RlLmpzYCBjb21tYW5kIGluIGBiYXNoYD8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugd2l0aG91dExhbmd1YWdlIGluRGlyZWN0b3J5IHRpdGxlIHdoZW4gcHJlc2VudGVyIHJldHVybnMgbm8gbGFuZ3VhZ2VEaXNwbGF5TmFtZSB3aXRoIGNkIHByZWZpeCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IFVSSS5maWxlKGlzV2luZG93cyA/ICdDOlxcXFx3b3Jrc3BhY2VcXFxccHJvamVjdCcgOiAnL3dvcmtzcGFjZS9wcm9qZWN0Jyk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBuZXcgV29ya3NwYWNlKCd0ZXN0JywgW3RvV29ya3NwYWNlRm9sZGVyKHdvcmtzcGFjZUZvbGRlcildKTtcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLnNldFdvcmtzcGFjZSh3b3Jrc3BhY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSGlzdG9yeVNlcnZpY2UsIHtcblx0XHRcdFx0Z2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3Q6ICgpID0+IHdvcmtzcGFjZUZvbGRlclxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRvb2xXaXRoV29ya3NwYWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdFx0aW5qZWN0TW9ja1ByZXNlbnRlcih0b29sV2l0aFdvcmtzcGFjZSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCA9IHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjZCAvdG1wICYmIHJtIGZpbGUudHh0Jyxcblx0XHRcdFx0XHRleHBsYW5hdGlvbjogJ1JlbW92ZSBhIGZpbGUgaW4gL3RtcCcsXG5cdFx0XHRcdFx0Z29hbDogJ1JlbW92ZSBhIGZpbGUgaW4gL3RtcCcsXG5cdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwMDAwLFxuXHRcdFx0XHR9IGFzIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXNcblx0XHRcdH0gYXMgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbFdpdGhXb3Jrc3BhY2UucHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCBgUnVuIGNvbW1hbmQgaW4gXFxgYmFzaFxcYCB3aXRoaW4gXFxgJHtpc1dpbmRvd3MgPyAnXFxcXHRtcCcgOiAnfi90bXAnfVxcYD9gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3Qgc2hvdyB1bmRlZmluZWQgaW4gY29uZmlybWF0aW9uIG1lc3NhZ2Ugd2hlbiBleHBsYW5hdGlvbiBhbmQgZ29hbCBhcmUgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcmFtczogUGFydGlhbDxJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zPiA9IHtcblx0XHRcdFx0Y29tbWFuZDogJ3JtIGZpbGUudHh0Jyxcblx0XHRcdH07XG5cdFx0XHRkZWxldGUgcGFyYW1zLmV4cGxhbmF0aW9uO1xuXHRcdFx0ZGVsZXRlIHBhcmFtcy5nb2FsO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHBhcmFtcyk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U7XG5cdFx0XHRvayhtZXNzYWdlLCAnRXhwZWN0ZWQgY29uZmlybWF0aW9uIG1lc3NhZ2UgdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZVRleHQgPSB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZS52YWx1ZTtcblx0XHRcdG9rKCFtZXNzYWdlVGV4dC5pbmNsdWRlcygndW5kZWZpbmVkJyksIGBDb25maXJtYXRpb24gbWVzc2FnZSBzaG91bGQgbm90IGNvbnRhaW4gXCJ1bmRlZmluZWRcIiwgZ290OiAke21lc3NhZ2VUZXh0fWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSB3aXRoTGFuZ3VhZ2UgaW5EaXJlY3RvcnkgdGl0bGUgd2hlbiBwcmVzZW50ZXIgcmV0dXJucyBsYW5ndWFnZURpc3BsYXlOYW1lIHdpdGggY2QgcHJlZml4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gVVJJLmZpbGUoaXNXaW5kb3dzID8gJ0M6XFxcXHdvcmtzcGFjZVxcXFxwcm9qZWN0JyA6ICcvd29ya3NwYWNlL3Byb2plY3QnKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IG5ldyBXb3Jrc3BhY2UoJ3Rlc3QnLCBbdG9Xb3Jrc3BhY2VGb2xkZXIod29ya3NwYWNlRm9sZGVyKV0pO1xuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2Uuc2V0V29ya3NwYWNlKHdvcmtzcGFjZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIaXN0b3J5U2VydmljZSwge1xuXHRcdFx0XHRnZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdDogKCkgPT4gd29ya3NwYWNlRm9sZGVyXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdG9vbFdpdGhXb3Jrc3BhY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFJ1bkluVGVybWluYWxUb29sKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCA9IHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjZCAvdG1wICYmIG5vZGUgLWUgXCJjb25zb2xlLmxvZygxKVwiJyxcblx0XHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBub2RlIGNvbW1hbmQgaW4gL3RtcCcsXG5cdFx0XHRcdFx0Z29hbDogJ1J1biBub2RlIGNvbW1hbmQgaW4gL3RtcCcsXG5cdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwMDAwLFxuXHRcdFx0XHR9IGFzIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXNcblx0XHRcdH0gYXMgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbFdpdGhXb3Jrc3BhY2UucHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCBgUnVuIFxcYE5vZGUuanNcXGAgY29tbWFuZCBpbiBcXGBiYXNoXFxgIHdpdGhpbiBcXGAke2lzV2luZG93cyA/ICdcXFxcdG1wJyA6ICd+L3RtcCd9XFxgP2ApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJlcGFyZVRvb2xJbnZvY2F0aW9uIC0gY3VzdG9tIGFjdGlvbnMgZm9yIGRyb3Bkb3duJywgKCkgPT4ge1xuXG5cdFx0dHlwZSBBY3Rpb25JdGVtVHlwZSA9IHsgc3ViQ29tbWFuZDogU2luZ2xlT3JNYW55PHN0cmluZz47IHNjb3BlOiAnc2Vzc2lvbicgfCAnd29ya3NwYWNlJyB8ICd1c2VyJyB9IHwgeyBjb21tYW5kTGluZTogdHJ1ZTsgc2NvcGU6ICdzZXNzaW9uJyB8ICd3b3Jrc3BhY2UnIHwgJ3VzZXInIH0gfCAnLS0tJyB8ICdjb25maWd1cmUnIHwgJ3Nlc3Npb25BcHByb3ZhbCc7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0OiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCwgaXRlbXM6IEFjdGlvbkl0ZW1UeXBlW10pIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSByZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50ZXJtaW5hbEN1c3RvbUFjdGlvbnMhO1xuXHRcdFx0b2soYWN0aW9ucywgJ0V4cGVjdGVkIGN1c3RvbSBhY3Rpb25zIHRvIGJlIGRlZmluZWQnKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIGl0ZW1zLmxlbmd0aCk7XG5cblx0XHRcdGZvciAoY29uc3QgW2ksIGl0ZW1dIG9mIGl0ZW1zLmVudHJpZXMoKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBhY3Rpb25zW2ldO1xuXHRcdFx0XHRpZiAoaXRlbSA9PT0gJy0tLScpIHtcblx0XHRcdFx0XHRvayhpc1NlcGFyYXRvcihhY3Rpb24pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvayghaXNTZXBhcmF0b3IoYWN0aW9uKSk7XG5cdFx0XHRcdFx0aWYgKGl0ZW0gPT09ICdjb25maWd1cmUnKSB7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChhY3Rpb24ubGFiZWwsICdDb25maWd1cmUgQXV0byBBcHByb3ZlLi4uJyk7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChhY3Rpb24uZGF0YS50eXBlLCAnY29uZmlndXJlJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpdGVtID09PSAnc2Vzc2lvbkFwcHJvdmFsJykge1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9uLmxhYmVsLCAnQWxsb3cgQWxsIENvbW1hbmRzIGluIHRoaXMgU2Vzc2lvbicpO1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9uLmRhdGEudHlwZSwgJ3Nlc3Npb25BcHByb3ZhbCcpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaGFzS2V5KGl0ZW0sIHsgY29tbWFuZExpbmU6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkTGFiZWwgPSBpdGVtLnNjb3BlID09PSAnc2Vzc2lvbicgPyAnQWxsb3cgRXhhY3QgQ29tbWFuZCBMaW5lIGluIHRoaXMgU2Vzc2lvbidcblx0XHRcdFx0XHRcdFx0OiBpdGVtLnNjb3BlID09PSAnd29ya3NwYWNlJyA/ICdBbGxvdyBFeGFjdCBDb21tYW5kIExpbmUgaW4gdGhpcyBXb3Jrc3BhY2UnXG5cdFx0XHRcdFx0XHRcdFx0OiAnQWx3YXlzIEFsbG93IEV4YWN0IENvbW1hbmQgTGluZSc7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChhY3Rpb24ubGFiZWwsIGV4cGVjdGVkTGFiZWwpO1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoYWN0aW9uLmRhdGEudHlwZSwgJ25ld1J1bGUnKTtcblx0XHRcdFx0XHRcdG9rKCFBcnJheS5pc0FycmF5KGFjdGlvbi5kYXRhLnJ1bGUpLCAnRXhwZWN0ZWQgcnVsZSB0byBiZSBhbiBvYmplY3QnKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3ViQ29tbWFuZExhYmVsID0gQXJyYXkuaXNBcnJheShpdGVtLnN1YkNvbW1hbmQpXG5cdFx0XHRcdFx0XHRcdD8gYENvbW1hbmRzICR7aXRlbS5zdWJDb21tYW5kLm1hcChlID0+IGBcXGAke2V9IFxcdTIwMjZcXGBgKS5qb2luKCcsICcpfWBcblx0XHRcdFx0XHRcdFx0OiBgXFxgJHtpdGVtLnN1YkNvbW1hbmR9IFxcdTIwMjZcXGBgO1xuXHRcdFx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRMYWJlbCA9IGl0ZW0uc2NvcGUgPT09ICdzZXNzaW9uJyA/IGBBbGxvdyAke3N1YkNvbW1hbmRMYWJlbH0gaW4gdGhpcyBTZXNzaW9uYFxuXHRcdFx0XHRcdFx0XHQ6IGl0ZW0uc2NvcGUgPT09ICd3b3Jrc3BhY2UnID8gYEFsbG93ICR7c3ViQ29tbWFuZExhYmVsfSBpbiB0aGlzIFdvcmtzcGFjZWBcblx0XHRcdFx0XHRcdFx0XHQ6IGBBbHdheXMgQWxsb3cgJHtzdWJDb21tYW5kTGFiZWx9YDtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKGFjdGlvbi5sYWJlbCwgZXhwZWN0ZWRMYWJlbCk7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChhY3Rpb24uZGF0YS50eXBlLCAnbmV3UnVsZScpO1xuXHRcdFx0XHRcdFx0b2soQXJyYXkuaXNBcnJheShhY3Rpb24uZGF0YS5ydWxlKSwgJ0V4cGVjdGVkIHJ1bGUgdG8gYmUgYW4gYXJyYXknKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgZ2VuZXJhdGUgY3VzdG9tIGFjdGlvbnMgZm9yIG5vbi1hdXRvLWFwcHJvdmVkIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRsczogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSBydW4gYnVpbGQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0J1aWxkIHRoZSBwcm9qZWN0Jyxcblx0XHRcdFx0Z29hbDogJ0J1aWxkIHRoZSBwcm9qZWN0J1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHJ1biBidWlsZCcsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHJ1biBidWlsZCcsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGdlbmVyYXRlIGN1c3RvbSBhY3Rpb25zIGZvciBzaW5nbGUgd29yZCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdmb28nLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBmb28gY29tbWFuZCcsXG5cdFx0XHRcdGdvYWw6ICdSdW4gZm9vIGNvbW1hbmQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdmb28nLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZ2VuZXJhdGUgY3VzdG9tIGFjdGlvbnMgZm9yIGF1dG8tYXBwcm92ZWQgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdG5wbTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnbnBtIHJ1biBidWlsZCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnQnVpbGQgdGhlIHByb2plY3QnLFxuXHRcdFx0XHRnb2FsOiAnQnVpbGQgdGhlIHByb2plY3QnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHJlc3VsdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgb25seSBnZW5lcmF0ZSBjb25maWd1cmUgYWN0aW9uIGZvciBleHBsaWNpdGx5IGRlbmllZCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0bnBtOiB7IGFwcHJvdmU6IGZhbHNlIH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSBydW4gYnVpbGQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0J1aWxkIHRoZSBwcm9qZWN0Jyxcblx0XHRcdFx0Z29hbDogJ0J1aWxkIHRoZSBwcm9qZWN0J1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSAmJiBpbiBjb21tYW5kIGxpbmUgbGFiZWxzIHdpdGggcHJvcGVyIG1uZW1vbmljIGVzY2FwaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSBpbnN0YWxsICYmIG5wbSBydW4gYnVpbGQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0luc3RhbGwgZGVwZW5kZW5jaWVzIGFuZCBidWlsZCcsXG5cdFx0XHRcdGdvYWw6ICdJbnN0YWxsIGRlcGVuZGVuY2llcyBhbmQgYnVpbGQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnbnBtIGluc3RhbGwnLCAnbnBtIHJ1biBidWlsZCddLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogWyducG0gaW5zdGFsbCcsICducG0gcnVuIGJ1aWxkJ10sIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnbnBtIGluc3RhbGwnLCAnbnBtIHJ1biBidWlsZCddLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHNob3cgYXBwcm92ZWQgY29tbWFuZHMgaW4gY3VzdG9tIGFjdGlvbnMgZHJvcGRvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGhlYWQ6IHRydWUgIC8vIGhlYWQgaXMgYXBwcm92ZWQgYnkgZGVmYXVsdCBpbiByZWFsIHNjZW5hcmlvXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdmb28gfCBoZWFkIC0yMCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUnVuIGZvbyBjb21tYW5kIGFuZCBzaG93IGZpcnN0IDIwIGxpbmVzJyxcblx0XHRcdFx0Z29hbDogJ1J1biBmb28gY29tbWFuZCBhbmQgc2hvdyBmaXJzdCAyMCBsaW5lcydcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3Qgc2hvdyBhbnkgY29tbWFuZC1zcGVjaWZpYyBhY3Rpb25zIHdoZW4gYWxsIHN1Yi1jb21tYW5kcyBhcmUgYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGZvbzogdHJ1ZSxcblx0XHRcdFx0aGVhZDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZm9vIHwgaGVhZCAtMjAnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBmb28gY29tbWFuZCBhbmQgc2hvdyBmaXJzdCAyMCBsaW5lcycsXG5cdFx0XHRcdGdvYWw6ICdSdW4gZm9vIGNvbW1hbmQgYW5kIHNob3cgZmlyc3QgMjAgbGluZXMnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHJlc3VsdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1peGVkIGFwcHJvdmVkIGFuZCB1bmFwcHJvdmVkIGNvbW1hbmRzIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0aGVhZDogdHJ1ZSxcblx0XHRcdFx0dGFpbDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZm9vIHwgaGVhZCAtMjAgJiYgYmFyIHwgdGFpbCAtMTAnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBtdWx0aXBsZSBwaXBlZCBjb21tYW5kcycsXG5cdFx0XHRcdGdvYWw6ICdSdW4gbXVsdGlwbGUgcGlwZWQgY29tbWFuZHMnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnZm9vJywgJ2JhciddLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogWydmb28nLCAnYmFyJ10sIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnZm9vJywgJ2JhciddLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBzdWJjb21tYW5kIGZvciBnaXQgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZ2l0IHN0YXR1cycsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnQ2hlY2sgZ2l0IHN0YXR1cycsXG5cdFx0XHRcdGdvYWw6ICdDaGVjayBnaXQgc3RhdHVzJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2dpdCBzdGF0dXMnLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2dpdCBzdGF0dXMnLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZ2l0IHN0YXR1cycsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdWdnZXN0IHN1YmNvbW1hbmQgZm9yIG5wbSBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gdGVzdCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUnVuIG5wbSB0ZXN0cycsXG5cdFx0XHRcdGdvYWw6ICdSdW4gbnBtIHRlc3RzJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSB0ZXN0Jywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gdGVzdCcsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gdGVzdCcsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdWdnZXN0IDMtcGFydCBzdWJjb21tYW5kIGZvciBucG0gcnVuIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSBydW4gYnVpbGQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBidWlsZCBzY3JpcHQnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIGJ1aWxkIHNjcmlwdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSBydW4gYnVpbGQnLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCAzLXBhcnQgc3ViY29tbWFuZCBmb3IgeWFybiBydW4gY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAneWFybiBydW4gdGVzdCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUnVuIHRlc3Qgc2NyaXB0Jyxcblx0XHRcdFx0Z29hbDogJ1J1biB0ZXN0IHNjcmlwdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICd5YXJuIHJ1biB0ZXN0Jywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICd5YXJuIHJ1biB0ZXN0Jywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ3lhcm4gcnVuIHRlc3QnLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHN1Z2dlc3Qgc3ViY29tbWFuZCBmb3IgY29tbWFuZHMgd2l0aCBmbGFncycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdmb28gLS1mb28gLS1iYXInLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBmb28gd2l0aCBmbGFncycsXG5cdFx0XHRcdGdvYWw6ICdSdW4gZm9vIHdpdGggZmxhZ3MnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdmb28nLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzdWdnZXN0IHN1YmNvbW1hbmQgZm9yIG5wbSBydW4gd2l0aCBmbGFncycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGFiYyAtLXNvbWUtZmxhZycsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUnVuIG5wbSBydW4gYWJjIHdpdGggZmxhZ3MnLFxuXHRcdFx0XHRnb2FsOiAnUnVuIG5wbSBydW4gYWJjIHdpdGggZmxhZ3MnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHJ1biBhYmMnLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSBydW4gYWJjJywgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ25wbSBydW4gYWJjJywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCBucG0gcnVuIGFuZCBvdGhlciBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkICYmIGdpdCBzdGF0dXMnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0J1aWxkIGFuZCBjaGVjayBzdGF0dXMnLFxuXHRcdFx0XHRnb2FsOiAnQnVpbGQgYW5kIGNoZWNrIHN0YXR1cydcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnbnBtIHJ1biBidWlsZCcsICdnaXQgc3RhdHVzJ10sIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ25wbSBydW4gYnVpbGQnLCAnZ2l0IHN0YXR1cyddLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ25wbSBydW4gYnVpbGQnLCAnZ2l0IHN0YXR1cyddLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBtaXhlZCBzdWJjb21tYW5kcyBhbmQgYmFzZSBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdnaXQgcHVzaCAmJiBlY2hvIFwiZG9uZVwiJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdQdXNoIGFuZCBwcmludCBkb25lJyxcblx0XHRcdFx0Z29hbDogJ1B1c2ggYW5kIHByaW50IGRvbmUnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ2dpdCBwdXNoJywgJ2VjaG8nXSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnZ2l0IHB1c2gnLCAnZWNobyddLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ2dpdCBwdXNoJywgJ2VjaG8nXSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1Z2dlc3Qgc3ViY29tbWFuZHMgZm9yIG11bHRpcGxlIGdpdCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdnaXQgc3RhdHVzICYmIGdpdCBsb2cgLS1vbmVsaW5lJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdDaGVjayBzdGF0dXMgYW5kIGxvZycsXG5cdFx0XHRcdGdvYWw6ICdDaGVjayBzdGF0dXMgYW5kIGxvZydcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6IFsnZ2l0IHN0YXR1cycsICdnaXQgbG9nJ10sIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ2dpdCBzdGF0dXMnLCAnZ2l0IGxvZyddLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiBbJ2dpdCBzdGF0dXMnLCAnZ2l0IGxvZyddLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBiYXNlIGNvbW1hbmQgZm9yIG5vbi1zdWJjb21tYW5kIHRvb2xzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2ZvbyBiYXInLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0Rvd25sb2FkIGZyb20gZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRnb2FsOiAnRG93bmxvYWQgZnJvbSBleGFtcGxlLmNvbSdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdmb28nLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgc3ViQ29tbWFuZDogJ2ZvbycsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdmb28nLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNpbmdsZSB3b3JkIGNvbW1hbmRzIGZyb20gc3ViY29tbWFuZC1hd2FyZSB0b29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdnaXQnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1J1biBnaXQgY29tbWFuZCcsXG5cdFx0XHRcdGdvYWw6ICdSdW4gZ2l0IGNvbW1hbmQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRlZHVwbGljYXRlIGlkZW50aWNhbCBzdWJjb21tYW5kIHN1Z2dlc3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSB0ZXN0ICYmIG5wbSB0ZXN0IC0tdmVyYm9zZScsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUnVuIHRlc3RzIHR3aWNlJyxcblx0XHRcdFx0Z29hbDogJ1J1biB0ZXN0cyB0d2ljZSdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0RHJvcGRvd25BY3Rpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICducG0gdGVzdCcsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHRlc3QnLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnbnBtIHRlc3QnLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3Nlc3Npb24nIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3VzZXInIH0sXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnc2Vzc2lvbkFwcHJvdmFsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdjb25maWd1cmUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGZsYWdzIGRpZmZlcmVudGx5IHRoYW4gc3ViY29tbWFuZHMgZm9yIHN1Z2dlc3Rpb24gbG9naWMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZm9vIC0tdmVyc2lvbicsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnQ2hlY2sgZm9vIHZlcnNpb24nLFxuXHRcdFx0XHRnb2FsOiAnQ2hlY2sgZm9vIHZlcnNpb24nXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IHN1YkNvbW1hbmQ6ICdmb28nLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBzdWJDb21tYW5kOiAnZm9vJywgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICdzZXNzaW9uJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiB0cnVlLCBzY29wZTogJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd1c2VyJyB9LFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzdWdnZXN0IG92ZXJseSBwZXJtaXNzaXZlIHN1YmNvbW1hbmQgcnVsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnYmFzaCAtYyBcImVjaG8gaGVsbG9cIicsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnUnVuIGJhc2ggY29tbWFuZCcsXG5cdFx0XHRcdGdvYWw6ICdSdW4gYmFzaCBjb21tYW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnREcm9wZG93bkFjdGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAnc2Vzc2lvbicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZTogdHJ1ZSwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6IHRydWUsIHNjb3BlOiAndXNlcicgfSxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdzZXNzaW9uQXBwcm92YWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2NvbmZpZ3VyZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3Qgc2hvdyBjb21tYW5kIGxpbmUgb3B0aW9uIHdoZW4gaXRcXCdzIHJlamVjdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlLFxuXHRcdFx0XHQnL1xcXFwoLitcXFxcKS9zJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gKGFiYyknXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdGFzc2VydERyb3Bkb3duQWN0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0J3Nlc3Npb25BcHByb3ZhbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnY29uZmlndXJlJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZXZlbnQgYXV0byBhcHByb3ZhbCB3aGVuIHdyaXRpbmcgdG8gYSBmaWxlIG91dHNpZGUgdGhlIHdvcmtzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkJsb2NrRGV0ZWN0ZWRGaWxlV3JpdGVzLCAnb3V0c2lkZVdvcmtzcGFjZScpO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe30pO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBVUkkuZmlsZShpc1dpbmRvd3MgPyAnQzovd29ya3NwYWNlL3Byb2plY3QnIDogJy93b3Jrc3BhY2UvcHJvamVjdCcpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IFdvcmtzcGFjZSgndGVzdCcsIFt0b1dvcmtzcGFjZUZvbGRlcih3b3Jrc3BhY2VGb2xkZXIpXSk7XG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2Uod29ya3NwYWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhpc3RvcnlTZXJ2aWNlLCB7XG5cdFx0XHRcdGdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290OiAoKSA9PiB3b3Jrc3BhY2VGb2xkZXJcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBcImFiY1wiID4gLi4vZmlsZS50eHQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRlcm1pbmFsQ3VzdG9tQWN0aW9ucywgdW5kZWZpbmVkLCAnRXhwZWN0ZWQgbm8gY3VzdG9tIGFjdGlvbnMgd2hlbiBmaWxlIHdyaXRlIGlzIGJsb2NrZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NoYXQgc2Vzc2lvbiBkaXNwb3NhbCBjbGVhbnVwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZU1vY2tUZXJtaW5hbCA9IChwcm9jZXNzSWQ6IG51bWJlcik6IElUZXJtaW5hbEluc3RhbmNlID0+ICh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IC8qIE1vY2sgZGlzcG9zZSAqLyB9LFxuXHRcdFx0cHJvY2Vzc0lkXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlKTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXN0b3JlIGFsbCB0ZXJtaW5hbHMgaW50byB0aGUgc2Vzc2lvbiB0ZXJtaW5hbCBtYXAgYW5kIGRpc3Bvc2UgdGhlbSB3aGVuIGFyY2hpdmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3Qtc2Vzc2lvbi1yZXN0b3JlZC1hcmNoaXZlJztcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQpO1xuXG5cdFx0XHRsZXQgdGVybWluYWwxRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdGxldCB0ZXJtaW5hbDJEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgdGVybWluYWwxRGlzcG9zZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsMkRpc3Bvc2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwxID0ge1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGVybWluYWwxRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRlcm1pbmFsMURpc3Bvc2VkRW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRGlzcG9zZWQ6IHRlcm1pbmFsMURpc3Bvc2VkRW1pdHRlci5ldmVudCxcblx0XHRcdFx0cHJvY2Vzc0lkOiA1NTU1NSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbDIgPSB7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHR0ZXJtaW5hbDJEaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGVybWluYWwyRGlzcG9zZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25EaXNwb3NlZDogdGVybWluYWwyRGlzcG9zZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRwcm9jZXNzSWQ6IDY2NjY2LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC50ZXJtaW5hbFNlc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRbbW9ja1Rlcm1pbmFsMS5wcm9jZXNzSWQhXToge1xuXHRcdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0XHRpZDogJ3Jlc3RvcmVkLTEnLFxuXHRcdFx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5Ob25lLFxuXHRcdFx0XHRcdGlzQmFja2dyb3VuZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0W21vY2tUZXJtaW5hbDIucHJvY2Vzc0lkIV06IHtcblx0XHRcdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRcdFx0aWQ6ICdyZXN0b3JlZC0yJyxcblx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuTm9uZSxcblx0XHRcdFx0XHRpc0JhY2tncm91bmQ6IGZhbHNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRcdG9uRGlkRGlzcG9zZUluc3RhbmNlOiB0ZXJtaW5hbFNlcnZpY2VEaXNwb3NlRW1pdHRlci5ldmVudCxcblx0XHRcdFx0aW5zdGFuY2VzOiBbbW9ja1Rlcm1pbmFsMSwgbW9ja1Rlcm1pbmFsMl0sXG5cdFx0XHRcdGZvcmVncm91bmRJbnN0YW5jZXM6IFtdLFxuXHRcdFx0XHRzZXROZXh0Q29tbWFuZElkOiBhc3luYyAoKSA9PiB7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN0b3JlZFJ1bkluVGVybWluYWxUb29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWRTZXNzaW9uVGVybWluYWxzID0gcmVzdG9yZWRSdW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN0b3JlZFNlc3Npb25UZXJtaW5hbHM/LnNpemUsIDIsICdCb3RoIHJlc3RvcmVkIHRlcm1pbmFscyBzaG91bGQgYmUgdHJhY2tlZCBmb3IgdGhlIHNlc3Npb24nKTtcblxuXHRcdFx0Y2hhdFNlc3Npb25BcmNoaXZlZEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IHRydWUsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUFnZW50U2Vzc2lvbik7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMURpc3Bvc2VkLCB0cnVlLCAnUmVzdG9yZWQgYmFja2dyb3VuZCB0ZXJtaW5hbCBzaG91bGQgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDJEaXNwb3NlZCwgdHJ1ZSwgJ1Jlc3RvcmVkIGZvcmVncm91bmQgdGVybWluYWwgc2hvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0b2soIXJlc3RvcmVkUnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnRm9yZWdyb3VuZCB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBhcmNoaXZlJyk7XG5cdFx0XHRvayghcmVzdG9yZWRSdW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuaGFzKHNlc3Npb25SZXNvdXJjZSksICdBbGwgcmVzdG9yZWQgdGVybWluYWxzIGZvciB0aGUgc2Vzc2lvbiBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBhcmNoaXZlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzcG9zZSBhbGwgdGVybWluYWxzIGFzc29jaWF0ZWQgd2l0aCBhIHNpbmdsZSBjaGF0IHNlc3Npb24gd2hlbiBhcmNoaXZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24tYXJjaGl2ZSc7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbDEgPSB7IGRpc3Bvc2U6ICgpID0+IHsgLyogTW9jayBkaXNwb3NlICovIH0sIHByb2Nlc3NJZDogMzMzMzMgfSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdFx0Y29uc3QgbW9ja1Rlcm1pbmFsMiA9IHsgZGlzcG9zZTogKCkgPT4geyAvKiBNb2NrIGRpc3Bvc2UgKi8gfSwgcHJvY2Vzc0lkOiA0NDQ0NCB9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHRcdGxldCB0ZXJtaW5hbDFEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IHRlcm1pbmFsMkRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRtb2NrVGVybWluYWwxLmRpc3Bvc2UgPSAoKSA9PiB7IHRlcm1pbmFsMURpc3Bvc2VkID0gdHJ1ZTsgfTtcblx0XHRcdG1vY2tUZXJtaW5hbDIuZGlzcG9zZSA9ICgpID0+IHsgdGVybWluYWwyRGlzcG9zZWQgPSB0cnVlOyB9O1xuXG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwge1xuXHRcdFx0XHRpbnN0YW5jZTogbW9ja1Rlcm1pbmFsMixcblx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5Lk5vbmVcblx0XHRcdH0pO1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLnNldChzZXNzaW9uUmVzb3VyY2UsIG5ldyBTZXQoW21vY2tUZXJtaW5hbDEsIG1vY2tUZXJtaW5hbDJdKSk7XG5cblx0XHRcdC8vIEluaXRpYWxpemUgbGF6eSBhcmNoaXZlIGxpc3RlbmVyIGJlZm9yZSBmaXJpbmcgdGhlIGFyY2hpdmUgZXZlbnQuXG5cdFx0XHRjb25zdCBlbnN1cmVBcmNoaXZlZFNlc3Npb25MaXN0ZW5lciA9IChydW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsICgpID0+IHZvaWQ+KVsnX2Vuc3VyZUFyY2hpdmVkU2Vzc2lvbkxpc3RlbmVyJ107XG5cdFx0XHRlbnN1cmVBcmNoaXZlZFNlc3Npb25MaXN0ZW5lci5jYWxsKHJ1bkluVGVybWluYWxUb29sKTtcblxuXHRcdFx0Y2hhdFNlc3Npb25BcmNoaXZlZEVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IHRydWUsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUFnZW50U2Vzc2lvbik7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMURpc3Bvc2VkLCB0cnVlLCAnVGVybWluYWwgMSBzaG91bGQgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDJEaXNwb3NlZCwgdHJ1ZSwgJ1Rlcm1pbmFsIDIgc2hvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0b2soIXJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlKSwgJ1Rlcm1pbmFsIGFzc29jaWF0aW9uIHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGFyY2hpdmUnKTtcblx0XHRcdG9rKCFydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuaGFzKHNlc3Npb25SZXNvdXJjZSksICdBbGwgdHJhY2tlZCB0ZXJtaW5hbHMgZm9yIHRoZSBzZXNzaW9uIHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGFyY2hpdmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgYWNjZXNzIGFnZW50IHNlc3Npb25zIG1vZGVsIHdoZW4gaW5pdGlhbGl6aW5nIGFyY2hpdmUgbGlzdGVuZXInLCAoKSA9PiB7XG5cdFx0XHRsZXQgbW9kZWxBY2Nlc3NlZCA9IGZhbHNlO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZTogY2hhdFNlc3Npb25BcmNoaXZlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdGdldCBtb2RlbCgpIHtcblx0XHRcdFx0XHRtb2RlbEFjY2Vzc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ21vZGVsIHNob3VsZCBub3QgYmUgYWNjZXNzZWQgd2hlbiB3aXJpbmcgYXJjaGl2ZSBsaXN0ZW5lcicpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudFNlc3Npb25zU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IG5vTW9kZWxBY2Nlc3NSdW5JblRlcm1pbmFsVG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UnVuSW5UZXJtaW5hbFRvb2wpKTtcblx0XHRcdGNvbnN0IGVuc3VyZUFyY2hpdmVkU2Vzc2lvbkxpc3RlbmVyID0gKG5vTW9kZWxBY2Nlc3NSdW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsICgpID0+IHZvaWQ+KVsnX2Vuc3VyZUFyY2hpdmVkU2Vzc2lvbkxpc3RlbmVyJ107XG5cdFx0XHRlbnN1cmVBcmNoaXZlZFNlc3Npb25MaXN0ZW5lci5jYWxsKG5vTW9kZWxBY2Nlc3NSdW5JblRlcm1pbmFsVG9vbCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKG1vZGVsQWNjZXNzZWQsIGZhbHNlLCAnQWdlbnQgc2Vzc2lvbnMgbW9kZWwgc2hvdWxkIG5vdCBiZSBhY2Nlc3NlZCB3aGVuIGluaXRpYWxpemluZyBhcmNoaXZlIGxpc3RlbmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzcG9zZSBhbGwgdGVybWluYWxzIGFzc29jaWF0ZWQgd2l0aCBhIHNpbmdsZSBjaGF0IHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uLW11bHRpcGxlLXRlcm1pbmFscyc7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwxID0gY3JlYXRlTW9ja1Rlcm1pbmFsKDExMTExKTtcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbDIgPSBjcmVhdGVNb2NrVGVybWluYWwoMjIyMjIpO1xuXG5cdFx0XHRsZXQgdGVybWluYWwxRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdGxldCB0ZXJtaW5hbDJEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0bW9ja1Rlcm1pbmFsMS5kaXNwb3NlID0gKCkgPT4geyB0ZXJtaW5hbDFEaXNwb3NlZCA9IHRydWU7IH07XG5cdFx0XHRtb2NrVGVybWluYWwyLmRpc3Bvc2UgPSAoKSA9PiB7IHRlcm1pbmFsMkRpc3Bvc2VkID0gdHJ1ZTsgfTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwge1xuXHRcdFx0XHRpbnN0YW5jZTogbW9ja1Rlcm1pbmFsMixcblx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5Lk5vbmVcblx0XHRcdH0pO1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLnNldChzZXNzaW9uUmVzb3VyY2UsIG5ldyBTZXQoW21vY2tUZXJtaW5hbDEsIG1vY2tUZXJtaW5hbDJdKSk7XG5cblx0XHRcdGNoYXRTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZmlyZSh7IHNlc3Npb25SZXNvdXJjZXM6IFtzZXNzaW9uUmVzb3VyY2VdLCByZWFzb246ICdjbGVhcmVkJyB9KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWwxRGlzcG9zZWQsIHRydWUsICdUZXJtaW5hbCAxIHNob3VsZCBoYXZlIGJlZW4gZGlzcG9zZWQnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMkRpc3Bvc2VkLCB0cnVlLCAnVGVybWluYWwgMiBzaG91bGQgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRvayghcnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnVGVybWluYWwgYXNzb2NpYXRpb24gc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgZGlzcG9zYWwnKTtcblx0XHRcdG9rKCFydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuaGFzKHNlc3Npb25SZXNvdXJjZSksICdBbGwgdHJhY2tlZCB0ZXJtaW5hbHMgZm9yIHRoZSBzZXNzaW9uIHNob3VsZCBiZSByZW1vdmVkIGFmdGVyIGRpc3Bvc2FsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzcG9zZSBhc3NvY2lhdGVkIHRlcm1pbmFscyB3aGVuIGNoYXQgc2Vzc2lvbiBpcyBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24tMTIzJztcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbCA9IGNyZWF0ZU1vY2tUZXJtaW5hbCgxMjM0NSk7XG5cdFx0XHRsZXQgdGVybWluYWxEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0bW9ja1Rlcm1pbmFsLmRpc3Bvc2UgPSAoKSA9PiB7IHRlcm1pbmFsRGlzcG9zZWQgPSB0cnVlOyB9O1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLCB7XG5cdFx0XHRcdGluc3RhbmNlOiBtb2NrVGVybWluYWwsXG5cdFx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5Ob25lXG5cdFx0XHR9KTtcblxuXHRcdFx0b2socnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnVGVybWluYWwgYXNzb2NpYXRpb24gc2hvdWxkIGV4aXN0IGJlZm9yZSBkaXNwb3NhbCcpO1xuXG5cdFx0XHRjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2VzOiBbc2Vzc2lvblJlc291cmNlXSwgcmVhc29uOiAnY2xlYXJlZCcgfSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsRGlzcG9zZWQsIHRydWUsICdUZXJtaW5hbCBzaG91bGQgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRvayghcnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnVGVybWluYWwgYXNzb2NpYXRpb24gc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgZGlzcG9zYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgYWZmZWN0IG90aGVyIHNlc3Npb25zIHdoZW4gb25lIHNlc3Npb24gaXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQxID0gJ3Rlc3Qtc2Vzc2lvbi0xJztcblx0XHRcdGNvbnN0IHNlc3Npb25JZDIgPSAndGVzdC1zZXNzaW9uLTInO1xuXHRcdFx0Y29uc3QgbW9ja1Rlcm1pbmFsMSA9IGNyZWF0ZU1vY2tUZXJtaW5hbCgxMjM0NSk7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwyID0gY3JlYXRlTW9ja1Rlcm1pbmFsKDY3ODkwKTtcblxuXHRcdFx0bGV0IHRlcm1pbmFsMURpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRsZXQgdGVybWluYWwyRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdG1vY2tUZXJtaW5hbDEuZGlzcG9zZSA9ICgpID0+IHsgdGVybWluYWwxRGlzcG9zZWQgPSB0cnVlOyB9O1xuXHRcdFx0bW9ja1Rlcm1pbmFsMi5kaXNwb3NlID0gKCkgPT4geyB0ZXJtaW5hbDJEaXNwb3NlZCA9IHRydWU7IH07XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZTEgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkMSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UyID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZDIpO1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLnNldChzZXNzaW9uUmVzb3VyY2UxLCB7XG5cdFx0XHRcdGluc3RhbmNlOiBtb2NrVGVybWluYWwxLFxuXHRcdFx0XHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuTm9uZVxuXHRcdFx0fSk7XG5cdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuc2V0KHNlc3Npb25SZXNvdXJjZTIsIHtcblx0XHRcdFx0aW5zdGFuY2U6IG1vY2tUZXJtaW5hbDIsXG5cdFx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5Ob25lXG5cdFx0XHR9KTtcblxuXHRcdFx0b2socnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UxKSwgJ1Nlc3Npb24gMSB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdG9rKHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlMiksICdTZXNzaW9uIDIgdGVybWluYWwgYXNzb2NpYXRpb24gc2hvdWxkIGV4aXN0Jyk7XG5cblx0XHRcdGNoYXRTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZmlyZSh7IHNlc3Npb25SZXNvdXJjZXM6IFtzZXNzaW9uUmVzb3VyY2UxXSwgcmVhc29uOiAnY2xlYXJlZCcgfSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMURpc3Bvc2VkLCB0cnVlLCAnVGVybWluYWwgMSBzaG91bGQgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbDJEaXNwb3NlZCwgZmFsc2UsICdUZXJtaW5hbCAyIHNob3VsZCBOT1QgaGF2ZSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRvayghcnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UxKSwgJ1Nlc3Npb24gMSB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgYmUgcmVtb3ZlZCcpO1xuXHRcdFx0b2socnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UyKSwgJ1Nlc3Npb24gMiB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgcmVtYWluJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGRpc3Bvc2UgdXNlci1yZXZlYWxlZCB0ZXJtaW5hbHMgd2hlbiBjaGF0IHNlc3Npb24gaXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uLXJldmVhbGVkJztcblx0XHRcdGNvbnN0IG1vY2tUZXJtaW5hbDEgPSBjcmVhdGVNb2NrVGVybWluYWwoMTExMTEpO1xuXHRcdFx0Y29uc3QgbW9ja1Rlcm1pbmFsMiA9IGNyZWF0ZU1vY2tUZXJtaW5hbCgyMjIyMik7XG5cblx0XHRcdGxldCB0ZXJtaW5hbDFEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IHRlcm1pbmFsMkRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRtb2NrVGVybWluYWwxLmRpc3Bvc2UgPSAoKSA9PiB7IHRlcm1pbmFsMURpc3Bvc2VkID0gdHJ1ZTsgfTtcblx0XHRcdG1vY2tUZXJtaW5hbDIuZGlzcG9zZSA9ICgpID0+IHsgdGVybWluYWwyRGlzcG9zZWQgPSB0cnVlOyB9O1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEluc3RhbmNlcy5zZXQoc2Vzc2lvblJlc291cmNlLCBuZXcgU2V0KFttb2NrVGVybWluYWwxLCBtb2NrVGVybWluYWwyXSkpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB0aGF0IHRlcm1pbmFsMiB3YXMgcmV2ZWFsZWQgYnkgdGhlIHVzZXIgKGl0J3MgaW4gZm9yZWdyb3VuZEluc3RhbmNlcylcblx0XHRcdChpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVRlcm1pbmFsU2VydmljZSkuZm9yZWdyb3VuZEluc3RhbmNlcyBhcyBJVGVybWluYWxJbnN0YW5jZVtdKS5wdXNoKG1vY2tUZXJtaW5hbDIpO1xuXG5cdFx0XHRjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2VzOiBbc2Vzc2lvblJlc291cmNlXSwgcmVhc29uOiAnY2xlYXJlZCcgfSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMURpc3Bvc2VkLCB0cnVlLCAnSGlkZGVuIHRlcm1pbmFsIHNob3VsZCBoYXZlIGJlZW4gZGlzcG9zZWQnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMkRpc3Bvc2VkLCBmYWxzZSwgJ1VzZXItcmV2ZWFsZWQgdGVybWluYWwgc2hvdWxkIE5PVCBoYXZlIGJlZW4gZGlzcG9zZWQnKTtcblxuXHRcdFx0Ly8gQ2xlYW4gdXBcblx0XHRcdChpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVRlcm1pbmFsU2VydmljZSkuZm9yZWdyb3VuZEluc3RhbmNlcyBhcyBJVGVybWluYWxJbnN0YW5jZVtdKS5sZW5ndGggPSAwO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIHRlcm1pbmFscyB3aGVuIG91dHB1dCBsb2NhdGlvbiBpcyB0ZXJtaW5hbCcsICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dExvY2F0aW9uLCAndGVybWluYWwnKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3Qtc2Vzc2lvbi1vdXRwdXQtbG9jYXRpb24tdGVybWluYWwnO1xuXHRcdFx0Y29uc3QgbW9ja1Rlcm1pbmFsMSA9IGNyZWF0ZU1vY2tUZXJtaW5hbCgzMzMzMyk7XG5cdFx0XHRjb25zdCBtb2NrVGVybWluYWwyID0gY3JlYXRlTW9ja1Rlcm1pbmFsKDQ0NDQ0KTtcblxuXHRcdFx0bGV0IHRlcm1pbmFsMURpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRsZXQgdGVybWluYWwyRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdG1vY2tUZXJtaW5hbDEuZGlzcG9zZSA9ICgpID0+IHsgdGVybWluYWwxRGlzcG9zZWQgPSB0cnVlOyB9O1xuXHRcdFx0bW9ja1Rlcm1pbmFsMi5kaXNwb3NlID0gKCkgPT4geyB0ZXJtaW5hbDJEaXNwb3NlZCA9IHRydWU7IH07XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0cnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLnNldChzZXNzaW9uUmVzb3VyY2UsIG5ldyBTZXQoW21vY2tUZXJtaW5hbDEsIG1vY2tUZXJtaW5hbDJdKSk7XG5cblx0XHRcdGNoYXRTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZmlyZSh7IHNlc3Npb25SZXNvdXJjZXM6IFtzZXNzaW9uUmVzb3VyY2VdLCByZWFzb246ICdjbGVhcmVkJyB9KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWwxRGlzcG9zZWQsIGZhbHNlLCAnVGVybWluYWwgc2hvdWxkIHBlcnNpc3Qgd2hlbiBvdXRwdXQgbG9jYXRpb24gaXMgdGVybWluYWwnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsMkRpc3Bvc2VkLCBmYWxzZSwgJ1Rlcm1pbmFsIHNob3VsZCBwZXJzaXN0IHdoZW4gb3V0cHV0IGxvY2F0aW9uIGlzIHRlcm1pbmFsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGRpc3Bvc2FsIG9mIG5vbi1leGlzdGVudCBzZXNzaW9uIGdyYWNlZnVsbHknLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuc2l6ZSwgMCwgJ05vIGFzc29jaWF0aW9ucyBzaG91bGQgZXhpc3QgaW5pdGlhbGx5Jyk7XG5cdFx0XHRjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2VzOiBbTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdub24tZXhpc3RlbnQtc2Vzc2lvbicpXSwgcmVhc29uOiAnY2xlYXJlZCcgfSk7XG5cdFx0XHRzdHJpY3RFcXVhbChydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuc2l6ZSwgMCwgJ05vIGFzc29jaWF0aW9ucyBzaG91bGQgZXhpc3QgYWZ0ZXIgaGFuZGxpbmcgbm9uLWV4aXN0ZW50IHNlc3Npb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmV1c2UgYSBkaXNwb3NlZCBjYWNoZWQgdGVybWluYWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2Rpc3Bvc2VkLXRlcm1pbmFsLXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2VkVGVybWluYWwgPSB7XG5cdFx0XHRcdGlzRGlzcG9zZWQ6IHRydWUsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0cHJvY2Vzc0lkOiA5OTk5OSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLCB7XG5cdFx0XHRcdGluc3RhbmNlOiBkaXNwb3NlZFRlcm1pbmFsLFxuXHRcdFx0XHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuTm9uZSxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kOiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBBIGRpc3Bvc2VkIGNhY2hlZCB0ZXJtaW5hbCBzaG91bGQgbm90IGJlIHJldHVybmVkIGJ5IHRoZSBhc3NvY2lhdGlvbiBsb29rdXBcblx0XHRcdGNvbnN0IGNhY2hlZFRlcm1pbmFsID0gcnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0b2soY2FjaGVkVGVybWluYWwsICdDYWNoZWQgdGVybWluYWwgc2hvdWxkIGV4aXN0IGluIHRoZSBtYXAnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhY2hlZFRlcm1pbmFsIS5pbnN0YW5jZS5pc0Rpc3Bvc2VkLCB0cnVlLCAnQ2FjaGVkIHRlcm1pbmFsIHNob3VsZCBiZSBkaXNwb3NlZCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIGd1YXJkIGNvbmRpdGlvbiB0aGF0IF9pbml0VGVybWluYWwgdXNlczpcblx0XHRcdC8vIGNhY2hlZFRlcm1pbmFsICYmICFjYWNoZWRUZXJtaW5hbC5pc0JhY2tncm91bmQgJiYgIWNhY2hlZFRlcm1pbmFsLmluc3RhbmNlLmlzRGlzcG9zZWRcblx0XHRcdGNvbnN0IHdvdWxkUmV1c2UgPSBjYWNoZWRUZXJtaW5hbCAhPT0gdW5kZWZpbmVkICYmICFjYWNoZWRUZXJtaW5hbC5pc0JhY2tncm91bmQgJiYgIWNhY2hlZFRlcm1pbmFsLmluc3RhbmNlLmlzRGlzcG9zZWQ7XG5cdFx0XHRzdHJpY3RFcXVhbCh3b3VsZFJldXNlLCBmYWxzZSwgJ1Nob3VsZCBub3QgcmV1c2UgYSBkaXNwb3NlZCBjYWNoZWQgdGVybWluYWwnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gc2VuZEJhY2tncm91bmRDb21wbGV0aW9uTm90aWZpY2F0aW9uKHByZXZpb3VzQWdlbnRJZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRlcm1JZCA9IGB0ZXN0LWNvbXBsZXRpb24tbW9kZWwtdGVybS0ke3ByZXZpb3VzQWdlbnRJZH1gO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihgdGVzdC1jb21wbGV0aW9uLW1vZGVsLXNlc3Npb24tJHtwcmV2aW91c0FnZW50SWR9YCk7XG5cdFx0Y29uc3QgY29tbWFuZEZpbmlzaGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCB9PigpO1xuXHRcdGNvbnN0IHRlcm1pbmFsRGlzcG9zZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRjb25zdCBpbnB1dERhdGFFbWl0dGVyID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZSA9IHtcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRnZXQ6IChjYXA6IFRlcm1pbmFsQ2FwYWJpbGl0eSkgPT4gY2FwID09PSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiA/IHsgb25Db21tYW5kRmluaXNoZWQ6IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRvbkRpc3Bvc2VkOiB0ZXJtaW5hbERpc3Bvc2VkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkSW5wdXREYXRhOiBpbnB1dERhdGFFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblxuXHRcdGNvbnN0IHByZXZpb3VzTW9kZWxJZCA9ICdjbGF1ZGUtb3B1cy00LTgnO1xuXHRcdGNvbnN0IHByZXZpb3VzVG9vbHMgPSB7IHRvb2wxOiB0cnVlIH07XG5cdFx0Y29uc3QgcHJldmlvdXNNb2RlSW5mbzogSUNoYXRSZXF1ZXN0TW9kZUluZm8gPSB7XG5cdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRpc0J1aWx0aW46IHRydWUsXG5cdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgcHJldmlvdXNSZXF1ZXN0ID0geyBtb2RlbElkOiBwcmV2aW91c01vZGVsSWQsIG1vZGVJbmZvOiBwcmV2aW91c01vZGVJbmZvLCB1c2VyU2VsZWN0ZWRUb29sczogcHJldmlvdXNUb29scywgcmVzcG9uc2U6IHsgYWdlbnQ6IHsgaWQ6IHByZXZpb3VzQWdlbnRJZCB9LCBpc0NhbmNlbGVkOiBmYWxzZSwgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUgfSB9O1xuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDaGF0U2VydmljZSkgYXMgdW5rbm93biBhcyB7XG5cdFx0XHRhY3F1aXJlRXhpc3RpbmdTZXNzaW9uOiAoKSA9PiBOb25OdWxsYWJsZTxSZXR1cm5UeXBlPElDaGF0U2VydmljZVsnYWNxdWlyZUV4aXN0aW5nU2Vzc2lvbiddPj47XG5cdFx0fTtcblx0XHRjaGF0U2VydmljZS5hY3F1aXJlRXhpc3RpbmdTZXNzaW9uID0gKCkgPT4gKHtcblx0XHRcdG9iamVjdDoge1xuXHRcdFx0XHRsYXN0UmVxdWVzdDogcHJldmlvdXNSZXF1ZXN0LFxuXHRcdFx0XHRsYXN0UmVxdWVzdE9iczogY29uc3RPYnNlcnZhYmxlKHByZXZpb3VzUmVxdWVzdCksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9KSBhcyB1bmtub3duIGFzIE5vbk51bGxhYmxlPFJldHVyblR5cGU8SUNoYXRTZXJ2aWNlWydhY3F1aXJlRXhpc3RpbmdTZXNzaW9uJ10+PjtcblxuXHRcdChydW5JblRlcm1pbmFsVG9vbC5jb25zdHJ1Y3RvciBhcyB1bmtub3duIGFzIHsgX2FjdGl2ZUV4ZWN1dGlvbnM6IE1hcDxzdHJpbmcsIHsgZ2V0T3V0cHV0KCk6IHN0cmluZzsgZGlzcG9zZSgpOiB2b2lkOyBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfT4gfSkuX2FjdGl2ZUV4ZWN1dGlvbnMuc2V0KHRlcm1JZCwge1xuXHRcdFx0Z2V0T3V0cHV0OiAoKSA9PiAnZG9uZScsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRpbnN0YW5jZTogdGVybWluYWxJbnN0YW5jZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGEgPSB7IGtpbmQ6ICd0ZXJtaW5hbCcsIGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnbnBtIHRlc3QnIH0sIGxhbmd1YWdlOiAnYmFzaCcgfSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0XHQocnVuSW5UZXJtaW5hbFRvb2wgYXMgdW5rbm93biBhcyB7IF9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb246ICh0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UsIHRlcm1JZDogc3RyaW5nLCBzZXNzaW9uOiBVUkksIGNvbW1hbmROYW1lOiBzdHJpbmcsIHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEpID0+IHZvaWQgfSlcblx0XHRcdC5fcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uKHRlcm1pbmFsSW5zdGFuY2UsIHRlcm1JZCwgc2Vzc2lvblJlc291cmNlLCAnbnBtIHRlc3QnLCB0b29sU3BlY2lmaWNEYXRhKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0Y29tbWFuZEZpbmlzaGVkRW1pdHRlci5maXJlKHsgZXhpdENvZGU6IDAgfSk7XG5cblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAxLCAnRXhwZWN0ZWQgYSBjb21wbGV0aW9uIHN0ZWVyaW5nIG5vdGlmaWNhdGlvbicpO1xuXHRcdHJldHVybiBjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHNbMF0ub3B0aW9ucztcblx0fVxuXG5cdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSBjb252ZXJzYXRpb24gY29udGV4dCBmb3IgYmFja2dyb3VuZCBjb21wbGV0aW9uIG5vdGlmaWNhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGF3YWl0IHNlbmRCYWNrZ3JvdW5kQ29tcGxldGlvbk5vdGlmaWNhdGlvbignbG9jYWwtYWdlbnQnKTtcblxuXHRcdHN0cmljdEVxdWFsKG9wdGlvbnM/LnVzZXJTZWxlY3RlZE1vZGVsSWQsICdjbGF1ZGUtb3B1cy00LTgnLCAnQ29tcGxldGlvbiBub3RpZmljYXRpb24gc2hvdWxkIHVzZSB0aGUgY29udmVyc2F0aW9uIG1vZGVsJyk7XG5cdFx0c3RyaWN0RXF1YWwob3B0aW9ucz8uYWdlbnRJZFNpbGVudCwgJ2xvY2FsLWFnZW50JywgJ0NvbXBsZXRpb24gbm90aWZpY2F0aW9uIHNob3VsZCBjb250aW51ZSB3aXRoIHRoZSBwcmV2aW91cyByZXF1ZXN0IGFnZW50Jyk7XG5cdFx0c3RyaWN0RXF1YWwob3B0aW9ucz8uaW5zdHJ1Y3Rpb25Db250ZXh0Py5tb2RlS2luZCwgQ2hhdE1vZGVLaW5kLkFnZW50LCAnQ29tcGxldGlvbiBub3RpZmljYXRpb24gc2hvdWxkIGNvbGxlY3QgaW5zdHJ1Y3Rpb25zIGZvciB0aGUgcHJldmlvdXMgbW9kZScpO1xuXHRcdHN0cmljdEVxdWFsKG9wdGlvbnM/Lmluc3RydWN0aW9uQ29udGV4dD8uZW5hYmxlZFRvb2xzPy50b29sMSwgdHJ1ZSwgJ0NvbXBsZXRpb24gbm90aWZpY2F0aW9uIHNob3VsZCBjb2xsZWN0IGluc3RydWN0aW9ucyBmb3IgdGhlIHByZXZpb3VzIHRvb2xzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSBjb250cmlidXRlZCBzZXNzaW9uIGF1dG8tYXR0YWNoIG9wdC1vdXQgZm9yIGJhY2tncm91bmQgY29tcGxldGlvbiBub3RpZmljYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNoYXRTZXNzaW9uQ29udHJpYnV0aW9uID0geyBhdXRvQXR0YWNoUmVmZXJlbmNlczogZmFsc2UgfSBhcyBSZXR1cm5UeXBlPElDaGF0U2Vzc2lvbnNTZXJ2aWNlWydnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbiddPjtcblx0XHRjb25zdCBvcHRpb25zID0gYXdhaXQgc2VuZEJhY2tncm91bmRDb21wbGV0aW9uTm90aWZpY2F0aW9uKCdjb250cmlidXRlZC1hZ2VudCcpO1xuXG5cdFx0c3RyaWN0RXF1YWwob3B0aW9ucz8uaW5zdHJ1Y3Rpb25Db250ZXh0LCB1bmRlZmluZWQsICdDb21wbGV0aW9uIG5vdGlmaWNhdGlvbiBzaG91bGQgbm90IGNvbGxlY3QgaW5zdHJ1Y3Rpb25zIGZvciBhbiBvcHRlZC1vdXQgY29udHJpYnV0ZWQgc2Vzc2lvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZGVkdXBlIHJhcGlkIHJlcGVhdGVkIGJhY2tncm91bmQgaW5wdXQtbmVlZGVkIG5vdGlmaWNhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVybUlkID0gJ3Rlc3QtaW5wdXQtbmVlZGVkLXRlcm0nO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndGVzdC1pbnB1dC1uZWVkZWQtc2Vzc2lvbicpO1xuXHRcdGxldCBvdXRwdXQgPSAnRW50ZXIgdmFsdWU6JztcblxuXHRcdGNvbnN0IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQgfT4oKTtcblx0XHRjb25zdCB0ZXJtaW5hbERpc3Bvc2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXROZWVkZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRjb25zdCBpbnB1dERhdGFFbWl0dGVyID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZSA9IHtcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRnZXQ6IChjYXA6IFRlcm1pbmFsQ2FwYWJpbGl0eSkgPT4gY2FwID09PSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiA/IHsgb25Db21tYW5kRmluaXNoZWQ6IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRvbkRpc3Bvc2VkOiB0ZXJtaW5hbERpc3Bvc2VkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkSW5wdXREYXRhOiBpbnB1dERhdGFFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblxuXHRcdGNvbnN0IG91dHB1dE1vbml0b3IgPSB7XG5cdFx0XHRvbkRpZERldGVjdElucHV0TmVlZGVkOiBpbnB1dE5lZWRlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkOiBFdmVudC5Ob25lLFxuXHRcdFx0Y29udGludWVNb25pdG9yaW5nQXN5bmM6ICgpID0+IHsgfSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgeyBvbkRpZERldGVjdElucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB2b2lkOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH07XG5cblx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhID0geyBraW5kOiAndGVybWluYWwnLCBjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ25wbSBpbml0JyB9LCBsYW5ndWFnZTogJ2Jhc2gnIH0gYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblxuXHRcdChydW5JblRlcm1pbmFsVG9vbC5jb25zdHJ1Y3RvciBhcyB1bmtub3duIGFzIHsgX2FjdGl2ZUV4ZWN1dGlvbnM6IE1hcDxzdHJpbmcsIHsgZ2V0T3V0cHV0KCk6IHN0cmluZyB9PiB9KS5fYWN0aXZlRXhlY3V0aW9ucy5zZXQodGVybUlkLCB7XG5cdFx0XHRnZXRPdXRwdXQ6ICgpID0+IG91dHB1dCxcblx0XHR9KTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbmFtaW5nLWNvbnZlbnRpb25cblx0XHQocnVuSW5UZXJtaW5hbFRvb2wgYXMgdW5rbm93biBhcyB7IF9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb246ICh0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UsIHRlcm1JZDogc3RyaW5nLCBzZXNzaW9uOiBVUkksIGNvbW1hbmROYW1lOiBzdHJpbmcsIHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIG91dHB1dE1vbml0b3I6IHsgb25EaWREZXRlY3RJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBjb250aW51ZU1vbml0b3JpbmdBc3luYzogKCkgPT4gdm9pZDsgZGlzcG9zZTogKCkgPT4gdm9pZCB9KSA9PiB2b2lkIH0pXG5cdFx0XHQuX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbih0ZXJtaW5hbEluc3RhbmNlLCB0ZXJtSWQsIHNlc3Npb25SZXNvdXJjZSwgJ25wbSBpbml0JywgdG9vbFNwZWNpZmljRGF0YSwgb3V0cHV0TW9uaXRvcik7XG5cblx0XHRpbnB1dE5lZWRlZEVtaXR0ZXIuZmlyZSgpO1xuXHRcdGlucHV0TmVlZGVkRW1pdHRlci5maXJlKCk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCwgMSwgJ0V4cGVjdGVkIGR1cGxpY2F0ZSByYXBpZCBpbnB1dC1uZWVkZWQgZXZlbnRzIHRvIGJlIHN1cHByZXNzZWQnKTtcblxuXHRcdG91dHB1dCA9ICdDb25maXJtICh5L04pOic7XG5cdFx0aW5wdXROZWVkZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAyLCAnRXhwZWN0ZWQgYSBjaGFuZ2VkIHByb21wdCB0byB0cmlnZ2VyIGEgbmV3IG5vdGlmaWNhdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VwcHJlc3MgaW5wdXQtbmVlZGVkIGFmdGVyIGRpc3Bvc2FsIGFuZCBvbWl0IHN1Y2Nlc3NmdWwgZXhpdCBjb2RlIGZyb20gdGVybWluYWwtZXhpdGVkIG5vdGljZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXJtSWQgPSAndGVzdC1pbnB1dC1uZWVkZWQtZGlzcG9zZWQtdGVybSc7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0ZXN0LWlucHV0LW5lZWRlZC1kaXNwb3NlZC1zZXNzaW9uJyk7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gJ1ByZXNzIEVOVEVSIG9yIHR5cGUgY29tbWFuZCB0byBjb250aW51ZSc7XG5cblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCk7XG5cdFx0Y29uc3QgdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IGlucHV0TmVlZGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXREYXRhRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZSA9IHtcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRnZXQ6IChjYXA6IFRlcm1pbmFsQ2FwYWJpbGl0eSkgPT4gY2FwID09PSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiA/IHsgb25Db21tYW5kRmluaXNoZWQ6IGNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRvbkRpc3Bvc2VkOiB0ZXJtaW5hbERpc3Bvc2VkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkSW5wdXREYXRhOiBpbnB1dERhdGFFbWl0dGVyLmV2ZW50LFxuXHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRnZXQgaXNEaXNwb3NlZCgpIHsgcmV0dXJuIGlzRGlzcG9zZWQ7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXG5cdFx0Y29uc3Qgb3V0cHV0TW9uaXRvciA9IHtcblx0XHRcdG9uRGlkRGV0ZWN0SW5wdXROZWVkZWQ6IGlucHV0TmVlZGVkRW1pdHRlci5ldmVudCxcblx0XHRcdG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRjb250aW51ZU1vbml0b3JpbmdBc3luYzogKCkgPT4geyB9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyB7IG9uRGlkRGV0ZWN0SW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBvbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgY29udGludWVNb25pdG9yaW5nQXN5bmM6ICgpID0+IHZvaWQ7IGRpc3Bvc2U6ICgpID0+IHZvaWQgfTtcblxuXHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGEgPSB7IGtpbmQ6ICd0ZXJtaW5hbCcsIGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnZ2l0IC0tbm8tcGFnZXIgZGlmZiAtLSBmb28udHMnIH0sIGxhbmd1YWdlOiAnYmFzaCcgfSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXG5cdFx0KHJ1bkluVGVybWluYWxUb29sLmNvbnN0cnVjdG9yIGFzIHVua25vd24gYXMgeyBfYWN0aXZlRXhlY3V0aW9uczogTWFwPHN0cmluZywgeyBnZXRPdXRwdXQoKTogc3RyaW5nIH0+IH0pLl9hY3RpdmVFeGVjdXRpb25zLnNldCh0ZXJtSWQsIHtcblx0XHRcdGdldE91dHB1dDogKCkgPT4gb3V0cHV0LFxuXHRcdH0pO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRcdChydW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIHsgX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbjogKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSwgdGVybUlkOiBzdHJpbmcsIHNlc3Npb246IFVSSSwgY29tbWFuZE5hbWU6IHN0cmluZywgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgb3V0cHV0TW9uaXRvcjogeyBvbkRpZERldGVjdElucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB2b2lkOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH0pID0+IHZvaWQgfSlcblx0XHRcdC5fcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uKHRlcm1pbmFsSW5zdGFuY2UsIHRlcm1JZCwgc2Vzc2lvblJlc291cmNlLCAnZ2l0IC0tbm8tcGFnZXIgZGlmZiAtLSBmb28udHMnLCB0b29sU3BlY2lmaWNEYXRhLCBvdXRwdXRNb25pdG9yKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSB1c2VyIGNsb3NpbmcgdGhlIHRlcm1pbmFsLiBUaGUgb3V0cHV0IG1vbml0b3IgbWF5IHN0aWxsXG5cdFx0Ly8gZmlyZSBgaW5wdXROZWVkZWRgIGJlY2F1c2UgdGhlIGJ1ZmZlcmVkIG91dHB1dCBsb29rcyBsaWtlIGEgcGFnZXJcblx0XHQvLyBwcm9tcHQsIGJ1dCBubyBzdGVlcmluZyBjaGF0IHR1cm4gc2hvdWxkIGJlIGNyZWF0ZWQgYmVjYXVzZSB0aGVcblx0XHQvLyB0ZXJtaW5hbCBpcyBnb25lLlxuXHRcdGlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdGlucHV0TmVlZGVkRW1pdHRlci5maXJlKCk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCwgMCwgJ0Nsb3NpbmcgdGhlIHRlcm1pbmFsIHNob3VsZCBub3QgcHJvZHVjZSBhIHNwdXJpb3VzIGlucHV0LW5lZWRlZCBjaGF0IHR1cm4nKTtcblxuXHRcdHRlcm1pbmFsRGlzcG9zZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAxLCAnQ2xvc2luZyB0aGUgdGVybWluYWwgc2hvdWxkIHNlbmQgb25lIHRlcm1pbmFsLWV4aXRlZCBub3RpZmljYXRpb24nKTtcblx0XHRvayhjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHNbMF0ubWVzc2FnZS5pbmNsdWRlcygndGVybWluYWwgZXhpdGVkLicpLCAnU3VjY2Vzc2Z1bCB0ZXJtaW5hbCBleGl0IHNob3VsZCBiZSByZXBvcnRlZCB3aXRob3V0IHF1YWxpZmljYXRpb24nKTtcblx0XHRvayghY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ2V4aXQgY29kZSAwJyksICdTdWNjZXNzZnVsIHRlcm1pbmFsIGV4aXQgc2hvdWxkIG5vdCBwcmludCBleGl0IGNvZGUgMCB0byBjaGF0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdXBwcmVzcyByZWR1bmRhbnQgaW5wdXQtbmVlZGVkIG5vdGlmaWNhdGlvbiBmb3Igb3V0cHV0IGFscmVhZHkgcmV0dXJuZWQgdmlhIGZvcmVncm91bmQgaW5wdXROZWVkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVybUlkID0gJ3Rlc3QtaW5wdXQtbmVlZGVkLWFscmVhZHktbm90aWZpZWQtdGVybSc7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0ZXN0LWlucHV0LW5lZWRlZC1hbHJlYWR5LW5vdGlmaWVkLXNlc3Npb24nKTtcblx0XHRsZXQgb3V0cHV0ID0gJ3BhY2thZ2UgbmFtZTogKHRlc3RfbnBtX2luaXQpICc7XG5cblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCk7XG5cdFx0Y29uc3QgdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IGlucHV0TmVlZGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXREYXRhRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2UgPSB7XG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0Z2V0OiAoY2FwOiBUZXJtaW5hbENhcGFiaWxpdHkpID0+IGNhcCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24gPyB7IG9uQ29tbWFuZEZpbmlzaGVkOiBjb21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0b25EaXNwb3NlZDogdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZElucHV0RGF0YTogaW5wdXREYXRhRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHRjb25zdCBvdXRwdXRNb25pdG9yID0ge1xuXHRcdFx0b25EaWREZXRlY3RJbnB1dE5lZWRlZDogaW5wdXROZWVkZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQuTm9uZSxcblx0XHRcdGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB7IH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIHsgb25EaWREZXRlY3RJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBjb250aW51ZU1vbml0b3JpbmdBc3luYzogKCkgPT4gdm9pZDsgZGlzcG9zZTogKCkgPT4gdm9pZCB9O1xuXG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YSA9IHsga2luZDogJ3Rlcm1pbmFsJywgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICdta2RpciAtcCBmb28gJiYgY2QgZm9vICYmIG5wbSBpbml0JyB9LCBsYW5ndWFnZTogJ2Jhc2gnIH0gYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblxuXHRcdChydW5JblRlcm1pbmFsVG9vbC5jb25zdHJ1Y3RvciBhcyB1bmtub3duIGFzIHsgX2FjdGl2ZUV4ZWN1dGlvbnM6IE1hcDxzdHJpbmcsIHsgZ2V0T3V0cHV0KCk6IHN0cmluZyB9PiB9KS5fYWN0aXZlRXhlY3V0aW9ucy5zZXQodGVybUlkLCB7XG5cdFx0XHRnZXRPdXRwdXQ6ICgpID0+IG91dHB1dCxcblx0XHR9KTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBmb3JlZ3JvdW5kIHRvb2wganVzdCByZXR1cm5pbmcgdmlhIHRoZSBgaW5wdXROZWVkZWRgIHJhY2UgXHUyMDE0XG5cdFx0Ly8gdGhlIGFnZW50IGhhcyBhbHJlYWR5IHJlY2VpdmVkIGBvdXRwdXRgIGFzIHRoZSB0b29sIHJlc3VsdCwgc28gdGhlIEJHXG5cdFx0Ly8gbW9uaXRvcidzIGZpcnN0IHJlLWRldGVjdGlvbiBvZiB0aGUgc2FtZSBwcm9tcHQgbXVzdCBub3QgZmlyZSBhIHN0ZWVyaW5nXG5cdFx0Ly8gbWVzc2FnZSB0aGF0IHdvdWxkIHlpZWxkIHRoZSBhZ2VudCdzIGluLWZsaWdodCBgc2VuZF90b190ZXJtaW5hbGAgcmVwbHkuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRcdChydW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIHsgX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbjogKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSwgdGVybUlkOiBzdHJpbmcsIHNlc3Npb246IFVSSSwgY29tbWFuZE5hbWU6IHN0cmluZywgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgb3V0cHV0TW9uaXRvcjogeyBvbkRpZERldGVjdElucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB2b2lkOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH0sIGFscmVhZHlOb3RpZmllZElucHV0TmVlZGVkT3V0cHV0Pzogc3RyaW5nKSA9PiB2b2lkIH0pXG5cdFx0XHQuX3JlZ2lzdGVyQ29tcGxldGlvbk5vdGlmaWNhdGlvbih0ZXJtaW5hbEluc3RhbmNlLCB0ZXJtSWQsIHNlc3Npb25SZXNvdXJjZSwgJ21rZGlyIC1wIGZvbyAmJiBjZCBmb28gJiYgbnBtIGluaXQnLCB0b29sU3BlY2lmaWNEYXRhLCBvdXRwdXRNb25pdG9yLCBvdXRwdXQpO1xuXG5cdFx0aW5wdXROZWVkZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAwLCAnU2hvdWxkIG5vdCByZS1ub3RpZnkgZm9yIG91dHB1dCB0aGUgYWdlbnQgYWxyZWFkeSByZWNlaXZlZCB2aWEgdGhlIGZvcmVncm91bmQgaW5wdXROZWVkZWQgcmFjZScpO1xuXG5cdFx0Ly8gT25jZSB0aGUgcHJvbXB0IGFjdHVhbGx5IGNoYW5nZXMgKG5ldyBkYXRhIGhhcyBhcnJpdmVkKSwgYSBmcmVzaCBub3RpZmljYXRpb25cblx0XHQvLyBzaG91bGQgYmUgc2VudCBzbyB0aGUgYWdlbnQgbGVhcm5zIGFib3V0IHRoZSBuZXcgcHJvbXB0IHN0YXRlLlxuXHRcdG91dHB1dCA9ICd2ZXJzaW9uOiAoMS4wLjApICc7XG5cdFx0aW5wdXROZWVkZWRFbWl0dGVyLmZpcmUoKTtcblx0XHRzdHJpY3RFcXVhbChjYXB0dXJlZFN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoLCAxLCAnRXhwZWN0ZWQgYSBuZXcgbm90aWZpY2F0aW9uIG9uY2UgdGhlIHByb21wdCBvdXRwdXQgY2hhbmdlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgc2Vzc2lvbiB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBhZnRlciBpbnB1dE5lZWRlZCBzbyBmZyB0ZXJtaW5hbCBpcyByZXVzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVybUlkID0gJ3Rlc3QtaW5wdXQtY2xlYW51cC10ZXJtJztcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Rlc3QtaW5wdXQtY2xlYW51cC1zZXNzaW9uJyk7XG5cblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCk7XG5cdFx0Y29uc3QgdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IGlucHV0TmVlZGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW5wdXREYXRhRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2UgPSB7XG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0Z2V0OiAoY2FwOiBUZXJtaW5hbENhcGFiaWxpdHkpID0+IGNhcCA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24gPyB7IG9uQ29tbWFuZEZpbmlzaGVkOiBjb21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0c2hlbGxMYXVuY2hDb25maWc6IHsgaGlkZUZyb21Vc2VyOiBmYWxzZSB9LFxuXHRcdFx0b25EaXNwb3NlZDogdGVybWluYWxEaXNwb3NlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZElucHV0RGF0YTogaW5wdXREYXRhRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHRjb25zdCBvdXRwdXRNb25pdG9yID0ge1xuXHRcdFx0b25EaWREZXRlY3RJbnB1dE5lZWRlZDogaW5wdXROZWVkZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQuTm9uZSxcblx0XHRcdGNvbnRpbnVlTW9uaXRvcmluZ0FzeW5jOiAoKSA9PiB7IH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIHsgb25EaWREZXRlY3RJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD47IG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBjb250aW51ZU1vbml0b3JpbmdBc3luYzogKCkgPT4gdm9pZDsgZGlzcG9zZTogKCkgPT4gdm9pZCB9O1xuXG5cdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YSA9IHsga2luZDogJ3Rlcm1pbmFsJywgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICdzc2ggaG9zdCcgfSwgbGFuZ3VhZ2U6ICdiYXNoJyB9IGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cblx0XHQvLyBUaGlzIGlzIGEgZm9yZWdyb3VuZCB0ZXJtaW5hbCwgc28gaXQgc2hvdWxkIGJlIGluIGZvcmVncm91bmRJbnN0YW5jZXNcblx0XHQoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElUZXJtaW5hbFNlcnZpY2UpLmZvcmVncm91bmRJbnN0YW5jZXMgYXMgSVRlcm1pbmFsSW5zdGFuY2VbXSkucHVzaCh0ZXJtaW5hbEluc3RhbmNlKTtcblxuXHRcdC8vIFNldCB1cCBmZyB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBhbmQgYWN0aXZlIGV4ZWN1dGlvblxuXHRcdHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLCB7XG5cdFx0XHRpbnN0YW5jZTogdGVybWluYWxJbnN0YW5jZSxcblx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5OiBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5SaWNoLFxuXHRcdFx0aXNCYWNrZ3JvdW5kOiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdChydW5JblRlcm1pbmFsVG9vbC5jb25zdHJ1Y3RvciBhcyB1bmtub3duIGFzIHsgX2FjdGl2ZUV4ZWN1dGlvbnM6IE1hcDxzdHJpbmcsIHsgZ2V0T3V0cHV0KCk6IHN0cmluZzsgZGlzcG9zZSgpOiB2b2lkIH0+IH0pLl9hY3RpdmVFeGVjdXRpb25zLnNldCh0ZXJtSWQsIHtcblx0XHRcdGdldE91dHB1dDogKCkgPT4gJ1Bhc3N3b3JkOicsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25hbWluZy1jb252ZW50aW9uXG5cdFx0KHJ1bkluVGVybWluYWxUb29sIGFzIHVua25vd24gYXMgeyBfcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uOiAodGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlLCB0ZXJtSWQ6IHN0cmluZywgc2Vzc2lvbjogVVJJLCBjb21tYW5kTmFtZTogc3RyaW5nLCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCBvdXRwdXRNb25pdG9yOiB7IG9uRGlkRGV0ZWN0SW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+OyBvbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkOiBFdmVudDx2b2lkPjsgY29udGludWVNb25pdG9yaW5nQXN5bmM6ICgpID0+IHZvaWQ7IGRpc3Bvc2U6ICgpID0+IHZvaWQgfSkgPT4gdm9pZCB9KVxuXHRcdFx0Ll9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb24odGVybWluYWxJbnN0YW5jZSwgdGVybUlkLCBzZXNzaW9uUmVzb3VyY2UsICdzc2ggaG9zdCcsIHRvb2xTcGVjaWZpY0RhdGEsIG91dHB1dE1vbml0b3IpO1xuXG5cdFx0Ly8gRmlyZSBpbnB1dE5lZWRlZCBcdTIwMTQgdGhpcyBzaW11bGF0ZXMgdGhlIG91dHB1dCBtb25pdG9yIGRldGVjdGluZyBhIHByb21wdFxuXHRcdGlucHV0TmVlZGVkRW1pdHRlci5maXJlKCk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCwgMSwgJ1Nob3VsZCBzZW5kIHN0ZWVyaW5nIHJlcXVlc3QgZm9yIGlucHV0IG5lZWRlZCcpO1xuXG5cdFx0Ly8gVGhlIGtleSBhc3NlcnRpb246IGZnIHRlcm1pbmFsIGFzc29jaWF0aW9uIGlzIHByZXNlcnZlZCAobm90IGRlbGV0ZWQpXG5cdFx0b2socnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnU2Vzc2lvbiB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgYmUgcHJlc2VydmVkIGZvciBmZyByZXVzZScpO1xuXHRcdHN0cmljdEVxdWFsKHJ1bkluVGVybWluYWxUb29sLnNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKSEuaXNCYWNrZ3JvdW5kLCBmYWxzZSwgJ1Rlcm1pbmFsIHNob3VsZCByZW1haW4gZm9yZWdyb3VuZCcpO1xuXG5cdFx0Ly8gQWZ0ZXIgY29tbWFuZCBmaW5pc2hlcywgdGhlIGZnIGFzc29jaWF0aW9uIHN0aWxsIHBlcnNpc3RzXG5cdFx0Y29tbWFuZEZpbmlzaGVkRW1pdHRlci5maXJlKHsgZXhpdENvZGU6IDAgfSk7XG5cdFx0c3RyaWN0RXF1YWwoY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCwgMiwgJ1Nob3VsZCBzZW5kIGEgY29tcGxldGlvbiBzdGVlcmluZyByZXF1ZXN0Jyk7XG5cdFx0b2soY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzWzFdLm1lc3NhZ2UuaW5jbHVkZXMoJ2NvbW1hbmQgY29tcGxldGVkLicpLCAnU3VjY2Vzc2Z1bCBjb21wbGV0aW9uIHNob3VsZCBiZSByZXBvcnRlZCB3aXRob3V0IHF1YWxpZmljYXRpb24nKTtcblx0XHRvayghY2FwdHVyZWRTdGVlcmluZ1JlcXVlc3RzWzFdLm1lc3NhZ2UuaW5jbHVkZXMoJ2V4aXQgY29kZSAwJyksICdTdWNjZXNzZnVsIGNvbXBsZXRpb24gc2hvdWxkIG5vdCBwcmludCBleGl0IGNvZGUgMCB0byBjaGF0Jyk7XG5cdFx0b2socnVuSW5UZXJtaW5hbFRvb2wuc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpLCAnU2Vzc2lvbiB0ZXJtaW5hbCBhc3NvY2lhdGlvbiBzaG91bGQgc3RpbGwgYmUgcHJlc2VydmVkIGFmdGVyIGNvbW1hbmQgZmluaXNoZXMnKTtcblx0XHRzdHJpY3RFcXVhbChydW5JblRlcm1pbmFsVG9vbC5zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZSkhLmlzQmFja2dyb3VuZCwgZmFsc2UsICdUZXJtaW5hbCBzaG91bGQgc3RpbGwgYmUgZm9yZWdyb3VuZCBhZnRlciBjb21tYW5kIGZpbmlzaGVzJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhdXRvIGFwcHJvdmUgd2FybmluZyBhY2NlcHRhbmNlIG1lY2hhbmlzbScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gZm9yIGF1dG8tYXBwcm92YWJsZSBjb21tYW5kcyB3aGVuIHdhcm5pbmcgbm90IGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUsIHRydWUpO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y2xlYXJBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZFN0YXRlKCk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvIHdvcmxkJyB9KSwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGF1dG9BcHByb3ZlSW5mbyB3aGVuIGNvbW1hbmQgd291bGQgYmUgYXV0by1hcHByb3ZlZCBidXQgd2FybmluZyBub3QgYWNjZXB0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSwgdHJ1ZSk7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGVjaG86IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjbGVhckF1dG9BcHByb3ZlV2FybmluZ0FjY2VwdGVkU3RhdGUoKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8gd29ybGQnIH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXG5cdFx0XHQvLyBhdXRvQXBwcm92ZUluZm8gc2hvdWxkIGJlIHNldCBzbyB0aGUgY29uZmlybWF0aW9uIHdpZGdldCBrbm93cyB0byBhdXRvLWFwcHJvdmVcblx0XHRcdC8vIGFmdGVyIHRoZSB1c2VyIGFjY2VwdHMgdGhlIHdhcm5pbmcgbW9kYWxcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0b2sodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbywgJ2F1dG9BcHByb3ZlSW5mbyBzaG91bGQgYmUgc2V0IGZvciBjb21tYW5kcyB0aGF0IHdvdWxkIGJlIGF1dG8tYXBwcm92ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvLWFwcHJvdmUgY29tbWFuZHMgd2hlbiBib3RoIGF1dG8tYXBwcm92ZSBlbmFibGVkIGFuZCB3YXJuaW5nIGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUsIHRydWUpO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvIHdvcmxkJyB9KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gd2hlbiBhdXRvLWFwcHJvdmUgZGlzYWJsZWQgcmVnYXJkbGVzcyBvZiB3YXJuaW5nIGFjY2VwdGFuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSwgZmFsc2UpO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHsgY29tbWFuZDogJ2VjaG8gaGVsbG8gd29ybGQnIH0pO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW5wdXQtbmVlZGVkIHN0ZWVyaW5nIHRleHQnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gYnVpbGRTdGVlcmluZ1RleHQoaHVuZ0hpbnQ6ICdub25lJyB8ICd0aW1lb3V0JyB8ICdpZGxlU2lsZW5jZScpOiBzdHJpbmcge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdpbnB1dC1uZWVkZWQtc3RlZXJpbmctc2Vzc2lvbicpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRcdFx0cmV0dXJuIChydW5JblRlcm1pbmFsVG9vbCBhcyB1bmtub3duIGFzIHsgX2J1aWxkSW5wdXROZWVkZWRTdGVlcmluZ1RleHQoczogVVJJLCB0OiBzdHJpbmcsIGg6ICdub25lJyB8ICd0aW1lb3V0JyB8ICdpZGxlU2lsZW5jZScpOiBzdHJpbmcgfSlcblx0XHRcdFx0Ll9idWlsZElucHV0TmVlZGVkU3RlZXJpbmdUZXh0KHNlc3Npb25SZXNvdXJjZSwgJ3Rlc3QtdGVybS1pZCcsIGh1bmdIaW50KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdub25lIG1vZGUgZG9lcyBub3QgbWVudGlvbiB0aW1lb3V0LCBpZGxlIHNpbGVuY2UsIG9yIGtpbGxfdGVybWluYWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYnVpbGRTdGVlcmluZ1RleHQoJ25vbmUnKTtcblx0XHRcdG9rKCF0ZXh0LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3RpbWVvdXQnKSwgJ0V4cGVjdGVkIG5vIG1lbnRpb24gb2YgdGltZW91dCBpbiB0aGUgaW5wdXQtbmVlZGVkIChub25lKSBoaW50Jyk7XG5cdFx0XHRvayghdGV4dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdubyBvdXRwdXQnKSwgJ0V4cGVjdGVkIG5vIG1lbnRpb24gb2YgaWRsZSBzaWxlbmNlIGluIHRoZSBpbnB1dC1uZWVkZWQgKG5vbmUpIGhpbnQnKTtcblx0XHRcdG9rKCF0ZXh0LmluY2x1ZGVzKFRlcm1pbmFsVG9vbElkLktpbGxUZXJtaW5hbCksICdFeHBlY3RlZCBraWxsX3Rlcm1pbmFsIG5vdCB0byBiZSBhZHZlcnRpc2VkIGluIHRoZSBpbnB1dC1uZWVkZWQgKG5vbmUpIGhpbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RpbWVvdXQgbW9kZSBhZHZlcnRpc2VzIGtpbGxfdGVybWluYWwgYW5kIG1lbnRpb25zIHRpbWVvdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYnVpbGRTdGVlcmluZ1RleHQoJ3RpbWVvdXQnKTtcblx0XHRcdG9rKHRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygndGltZW91dCcpLCAnRXhwZWN0ZWQgdGltZW91dCBoaW50IHRvIG1lbnRpb24gXCJ0aW1lb3V0XCInKTtcblx0XHRcdG9rKHRleHQuaW5jbHVkZXMoVGVybWluYWxUb29sSWQuS2lsbFRlcm1pbmFsKSwgJ0V4cGVjdGVkIHRpbWVvdXQgaGludCB0byBhZHZlcnRpc2Uga2lsbF90ZXJtaW5hbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWRsZVNpbGVuY2UgbW9kZSBhZHZlcnRpc2VzIGtpbGxfdGVybWluYWwgd2l0aG91dCBzYXlpbmcgXCJ0aW1lb3V0XCInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYnVpbGRTdGVlcmluZ1RleHQoJ2lkbGVTaWxlbmNlJyk7XG5cdFx0XHRvayghdGV4dC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd0aW1lb3V0JyksICdJZGxlLXNpbGVuY2UgaGludCBtdXN0IG5vdCByZWZlciB0byBhIHRpbWVvdXQnKTtcblx0XHRcdG9rKHRleHQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbm8gb3V0cHV0JyksICdFeHBlY3RlZCBpZGxlLXNpbGVuY2UgaGludCB0byBkZXNjcmliZSB0aGUgbm8tb3V0cHV0IGNvbmRpdGlvbicpO1xuXHRcdFx0b2sodGV4dC5pbmNsdWRlcyhUZXJtaW5hbFRvb2xJZC5LaWxsVGVybWluYWwpLCAnRXhwZWN0ZWQgaWRsZS1zaWxlbmNlIGhpbnQgdG8gYWR2ZXJ0aXNlIGtpbGxfdGVybWluYWwnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3VuaXF1ZSBydWxlcyBkZWR1cGxpY2F0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBwcm9wZXJseSBkZWR1cGxpY2F0ZSBydWxlcyB3aXRoIHNhbWUgc291cmNlVGV4dCBpbiBhdXRvLWFwcHJvdmUgaW5mbycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0ZWNobzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvICYmIGVjaG8gd29ybGQnIH0pO1xuXHRcdFx0YXNzZXJ0QXV0b0FwcHJvdmVkKHJlc3VsdCk7XG5cblx0XHRcdGNvbnN0IGF1dG9BcHByb3ZlSW5mbyA9IChyZXN1bHQhLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSkuYXV0b0FwcHJvdmVJbmZvITtcblx0XHRcdG9rKGF1dG9BcHByb3ZlSW5mbyk7XG5cdFx0XHRvayhhdXRvQXBwcm92ZUluZm8udmFsdWUuaW5jbHVkZXMoJ0F1dG8gYXBwcm92ZWQgYnkgcnVsZSAnKSwgJ3Nob3VsZCBjb250YWluIHNpbmd1bGFyIFwicnVsZVwiLCBub3QgcGx1cmFsJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb3VudChhdXRvQXBwcm92ZUluZm8udmFsdWUsICdlY2hvJyksIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2Vzc2lvbiBhdXRvIGFwcHJvdmFsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvIGFwcHJvdmUgYWxsIGNvbW1hbmRzIHdoZW4gc2Vzc2lvbiBoYXMgYXV0byBhcHByb3ZhbCBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3Qtc2Vzc2lvbi0xMjMnO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbENoYXRTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElUZXJtaW5hbENoYXRTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ3JtIGRhbmdlcm91cy1maWxlLnR4dCcsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdSZW1vdmUgYSBmaWxlJyxcblx0XHRcdFx0XHRnb2FsOiAnUmVtb3ZlIGEgZmlsZScsXG5cdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwMDAwLFxuXHRcdFx0XHR9IGFzIElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZVxuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ7XG5cblx0XHRcdGxldCByZXN1bHQgPSBhd2FpdCBydW5JblRlcm1pbmFsVG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQpO1xuXG5cdFx0XHR0ZXJtaW5hbENoYXRTZXJ2aWNlLnNldENoYXRTZXNzaW9uQXV0b0FwcHJvdmFsKHNlc3Npb25SZXNvdXJjZSwgdHJ1ZSk7XG5cblx0XHRcdHJlc3VsdCA9IGF3YWl0IHJ1bkluVGVybWluYWxUb29sLnByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydEF1dG9BcHByb3ZlZChyZXN1bHQpO1xuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSByZXN1bHQhLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblx0XHRcdG9rKHRlcm1pbmFsRGF0YS5hdXRvQXBwcm92ZUluZm8sICdFeHBlY3RlZCBhdXRvQXBwcm92ZUluZm8gdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0b2sodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mby52YWx1ZS5pbmNsdWRlcygnQXV0byBhcHByb3ZlZCBmb3IgdGhpcyBzZXNzaW9uJyksICdFeHBlY3RlZCBzZXNzaW9uIGFwcHJvdmFsIG1lc3NhZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBieXBhc3MgdGVybWluYWwgYXV0by1hcHByb3ZlIGZlYXR1cmUgaW4gQXV0b3BpbG90IG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdGN1cmw6IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdhdXRvcGlsb3Qtc2Vzc2lvbicpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRcdFx0Z2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2U6ICgoKSA9PiAoeyBpbnB1dDogeyBjdXJyZW50TW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCB9IH0gfSkpIGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlWydnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSddLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGF1dG9waWxvdFJ1bkluVGVybWluYWxUb29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXV0b3BpbG90UnVuSW5UZXJtaW5hbFRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnRmV0Y2ggYSBVUkwnLFxuXHRcdFx0XHRcdGdvYWw6ICdEb3dubG9hZCBjb250ZW50Jyxcblx0XHRcdFx0XHRtb2RlOiAnc3luYycsXG5cdFx0XHRcdFx0dGltZW91dDogMzAwMDAsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbywgdW5kZWZpbmVkLCAnRXhwZWN0ZWQgbm8gdGVybWluYWwgYXV0by1hcHByb3ZlIGluZm8gaW4gQXV0b3BpbG90IG1vZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBieXBhc3MgdGVybWluYWwgYXV0by1hcHByb3ZlIGZlYXR1cmUgaW4gQnlwYXNzIEFwcHJvdmFscyBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRjdXJsOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYnlwYXNzLXNlc3Npb24nKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB7XG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKCkgPT4gKHsgaW5wdXQ6IHsgY3VycmVudE1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSB9IH0gfSkpIGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlWydnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSddLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGJ5cGFzc1J1bkluVGVybWluYWxUb29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RSdW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnlwYXNzUnVuSW5UZXJtaW5hbFRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnRmV0Y2ggYSBVUkwnLFxuXHRcdFx0XHRcdGdvYWw6ICdEb3dubG9hZCBjb250ZW50Jyxcblx0XHRcdFx0XHRtb2RlOiAnc3luYycsXG5cdFx0XHRcdFx0dGltZW91dDogMzAwMDAsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnRBdXRvQXBwcm92ZWQocmVzdWx0KTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHJlc3VsdCEudG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbywgdW5kZWZpbmVkLCAnRXhwZWN0ZWQgbm8gdGVybWluYWwgYXV0by1hcHByb3ZlIGluZm8gaW4gQnlwYXNzIEFwcHJvdmFscyBtb2RlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUZXJtaW5hbFByb2ZpbGVGZXRjaGVyJywgKCkgPT4ge1xuXHRcdHN1aXRlKCdnZXRDb3BpbG90UHJvZmlsZScsICgpID0+IHtcblx0XHRcdChpc1dpbmRvd3MgPyB0ZXN0IDogdGVzdC5za2lwKSgnc2hvdWxkIHJldHVybiBjdXN0b20gcHJvZmlsZSB3aGVuIGNvbmZpZ3VyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJ1bkluVGVybWluYWxUb29sLnNldEJhY2tlbmRPcyhPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbVByb2ZpbGUgPSBPYmplY3QuZnJlZXplKHsgcGF0aDogJ0M6XFxcXFdpbmRvd3NcXFxcU3lzdGVtMzJcXFxcY21kLmV4ZScsIGFyZ3M6IFsnL1Y6T04nXSB9KTtcblx0XHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuVGVybWluYWxQcm9maWxlV2luZG93cywgY3VzdG9tUHJvZmlsZSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuSW5UZXJtaW5hbFRvb2wucHJvZmlsZUZldGNoZXIuZ2V0Q29waWxvdFByb2ZpbGUoKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCBjdXN0b21Qcm9maWxlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQoaXNMaW51eCA/IHRlc3QgOiB0ZXN0LnNraXApKCdzaG91bGQgZmFsbCBiYWNrIHRvIGRlZmF1bHQgc2hlbGwgd2hlbiBubyBjdXN0b20gcHJvZmlsZSBpcyBjb25maWd1cmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRydW5JblRlcm1pbmFsVG9vbC5zZXRCYWNrZW5kT3MoT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuVGVybWluYWxQcm9maWxlTGludXgsIG51bGwpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkluVGVybWluYWxUb29sLnByb2ZpbGVGZXRjaGVyLmdldENvcGlsb3RQcm9maWxlKCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQsICdvYmplY3QnKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoKHJlc3VsdCBhcyBJVGVybWluYWxQcm9maWxlKS5wYXRoLCAnYmFzaCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkZW5pYWwgaW5mbyBpbiBkaXNjbGFpbWVycycsICgpID0+IHtcblx0XHRmdW5jdGlvbiBnZXREaXNjbGFpbWVyVmFsdWUoZGlzY2xhaW1lcjogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICghZGlzY2xhaW1lcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHR5cGVvZiBkaXNjbGFpbWVyID09PSAnc3RyaW5nJyA/IGRpc2NsYWltZXIgOiBkaXNjbGFpbWVyLnZhbHVlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGRlbmlhbCByZWFzb24gaW4gZGlzY2xhaW1lciB3aGVuIGNvbW1hbmQgaXMgZGVuaWVkIGJ5IHJ1bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdG5wbTogeyBhcHByb3ZlOiBmYWxzZSB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCB0aGUgcHJvamVjdCcsXG5cdFx0XHRcdGdvYWw6ICdCdWlsZCB0aGUgcHJvamVjdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHRjb25zdCBkaXNjbGFpbWVyVmFsdWUgPSBnZXREaXNjbGFpbWVyVmFsdWUocmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8uZGlzY2xhaW1lcik7XG5cdFx0XHRvayhkaXNjbGFpbWVyVmFsdWUsICdFeHBlY3RlZCBkaXNjbGFpbWVyIHRvIGJlIGRlZmluZWQnKTtcblx0XHRcdG9rKGRpc2NsYWltZXJWYWx1ZS5pbmNsdWRlcygnZGVuaWVkJyksICdFeHBlY3RlZCBkaXNjbGFpbWVyIHRvIG1lbnRpb24gZGVuaWFsJyk7XG5cdFx0XHRvayhkaXNjbGFpbWVyVmFsdWUuaW5jbHVkZXMoJ25wbScpLCAnRXhwZWN0ZWQgZGlzY2xhaW1lciB0byBtZW50aW9uIHRoZSBkZW5pZWQgcnVsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgbGluayB0byBzZXR0aW5ncyBpbiBkZW5pYWwgZGlzY2xhaW1lcicsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0cm06IHsgYXBwcm92ZTogZmFsc2UgfVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlVG9vbFRlc3Qoe1xuXHRcdFx0XHRjb21tYW5kOiAncm0gLXJmIHRlbXAnLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ1JlbW92ZSB0ZW1wIGZvbGRlcicsXG5cdFx0XHRcdGdvYWw6ICdSZW1vdmUgdGVtcCBmb2xkZXInXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0LCAnUnVuIGBiYXNoYCBjb21tYW5kPycpO1xuXHRcdFx0b2socmVzdWx0Py5jb25maXJtYXRpb25NZXNzYWdlcz8uZGlzY2xhaW1lciwgJ0V4cGVjdGVkIGRpc2NsYWltZXIgdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0Ly8gVGhlIGRpc2NsYWltZXIgc2hvdWxkIGhhdmUgdHJ1c3RlZCBjb21tYW5kcyBlbmFibGVkIGZvciBzZXR0aW5ncyBsaW5rc1xuXHRcdFx0Y29uc3QgZGlzY2xhaW1lciA9IHJlc3VsdC5jb25maXJtYXRpb25NZXNzYWdlcy5kaXNjbGFpbWVyO1xuXHRcdFx0b2sodHlwZW9mIGRpc2NsYWltZXIgIT09ICdzdHJpbmcnICYmIGRpc2NsYWltZXIuaXNUcnVzdGVkLCAnRXhwZWN0ZWQgZGlzY2xhaW1lciB0byBiZSB0cnVzdGVkIGZvciBjb21tYW5kIGxpbmtzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBkZW5pYWwgcmVhc29uIGZvciBtdWx0aXBsZSBkZW5pZWQgc3ViLWNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRybTogeyBhcHByb3ZlOiBmYWxzZSB9LFxuXHRcdFx0XHRzdWRvOiB7IGFwcHJvdmU6IGZhbHNlIH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2xUZXN0KHtcblx0XHRcdFx0Y29tbWFuZDogJ3N1ZG8gcm0gLXJmIC8nLFxuXHRcdFx0XHRleHBsYW5hdGlvbjogJ0Rhbmdlcm91cyBjb21tYW5kJyxcblx0XHRcdFx0Z29hbDogJ0Rhbmdlcm91cyBjb21tYW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBgYmFzaGAgY29tbWFuZD8nKTtcblx0XHRcdGNvbnN0IGRpc2NsYWltZXJWYWx1ZSA9IGdldERpc2NsYWltZXJWYWx1ZShyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5kaXNjbGFpbWVyKTtcblx0XHRcdG9rKGRpc2NsYWltZXJWYWx1ZSwgJ0V4cGVjdGVkIGRpc2NsYWltZXIgdG8gYmUgZGVmaW5lZCcpO1xuXHRcdFx0b2soZGlzY2xhaW1lclZhbHVlLmluY2x1ZGVzKCdkZW5pZWQnKSwgJ0V4cGVjdGVkIGRpc2NsYWltZXIgdG8gbWVudGlvbiBkZW5pYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgaW5jbHVkZSBkZW5pYWwgaW5mbyB3aGVuIGF1dG8tYXBwcm92ZSBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlLCBmYWxzZSk7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdG5wbTogeyBhcHByb3ZlOiBmYWxzZSB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCB0aGUgcHJvamVjdCcsXG5cdFx0XHRcdGdvYWw6ICdCdWlsZCB0aGUgcHJvamVjdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHQvLyBXaGVuIGF1dG8tYXBwcm92ZSBpcyBkaXNhYmxlZCwgdGhlcmUgc2hvdWxkIGJlIG5vIGRlbmlhbC1yZWxhdGVkIGRpc2NsYWltZXJcblx0XHRcdGNvbnN0IGRpc2NsYWltZXJWYWx1ZSA9IGdldERpc2NsYWltZXJWYWx1ZShyZXN1bHQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5kaXNjbGFpbWVyKTtcblx0XHRcdGlmIChkaXNjbGFpbWVyVmFsdWUpIHtcblx0XHRcdFx0b2soIWRpc2NsYWltZXJWYWx1ZS5pbmNsdWRlcygnZGVuaWVkJyksICdTaG91bGQgbm90IG1lbnRpb24gZGVuaWFsIHdoZW4gYXV0by1hcHByb3ZlIGlzIGRpc2FibGVkJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGluY2x1ZGUgZGVuaWFsIGluZm8gZm9yIGNvbW1hbmRzIHRoYXQgYXJlIHNpbXBseSBub3QgYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBDb21tYW5kIGlzIG5vdCBpbiBhdXRvLWFwcHJvdmUgbGlzdCwgYnV0IG5vdCBleHBsaWNpdGx5IGRlbmllZFxuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRlY2hvOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVUb29sVGVzdCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICducG0gcnVuIGJ1aWxkJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdCdWlsZCB0aGUgcHJvamVjdCcsXG5cdFx0XHRcdGdvYWw6ICdCdWlsZCB0aGUgcHJvamVjdCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnRDb25maXJtYXRpb25SZXF1aXJlZChyZXN1bHQsICdSdW4gYGJhc2hgIGNvbW1hbmQ/Jyk7XG5cdFx0XHQvLyBUaGVyZSBzaG91bGQgYmUgbm8gZGVuaWFsIGRpc2NsYWltZXIgc2luY2UgbnBtIGlzIG5vdCBleHBsaWNpdGx5IGRlbmllZFxuXHRcdFx0Y29uc3QgZGlzY2xhaW1lclZhbHVlID0gZ2V0RGlzY2xhaW1lclZhbHVlKHJlc3VsdD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LmRpc2NsYWltZXIpO1xuXHRcdFx0aWYgKGRpc2NsYWltZXJWYWx1ZSkge1xuXHRcdFx0XHRvayghZGlzY2xhaW1lclZhbHVlLmluY2x1ZGVzKCdkZW5pZWQnKSwgJ1Nob3VsZCBub3QgbWVudGlvbiBkZW5pYWwgZm9yIG5vbi1kZW5pZWQgY29tbWFuZHMnKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbiB3aGVuIHNhbmRib3ggaXMgZW5hYmxlZCBidXQgc2FuZGJveCByZXdyaXRpbmcgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IHsgQ29uZmlybVRlcm1pbmFsQ29tbWFuZFRvb2wgfSA9IGF3YWl0IGltcG9ydCgnLi4vLi4vYnJvd3Nlci90b29scy9ydW5JblRlcm1pbmFsQ29uZmlybWF0aW9uVG9vbC5qcycpO1xuXHRcdFx0Y29uc3QgY29uZmlybVRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlybVRlcm1pbmFsQ29tbWFuZFRvb2wpKTtcblxuXHRcdFx0Y29uc3QgY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ3BpbmcgZ29vZ2xlLmNvbScsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdQaW5nIGdvb2dsZS5jb20nLFxuXHRcdFx0XHRcdGdvYWw6ICdQaW5nIGdvb2dsZS5jb20nLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0XHR0aW1lb3V0OiAzMDAwMCxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dDtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29uZmlybVRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbiB3aGVuIHNhbmRib3ggaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzYW5kYm94RW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe30pO1xuXG5cdFx0XHRjb25zdCB7IENvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sIH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uL2Jyb3dzZXIvdG9vbHMvcnVuSW5UZXJtaW5hbENvbmZpcm1hdGlvblRvb2wuanMnKTtcblx0XHRcdGNvbnN0IGNvbmZpcm1Ub29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCA9IHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRleHBsYW5hdGlvbjogJ1ByaW50IGhlbGxvJyxcblx0XHRcdFx0XHRnb2FsOiAnUHJpbnQgaGVsbG8nLFxuXHRcdFx0XHRcdG1vZGU6ICdzeW5jJyxcblx0XHRcdFx0XHR0aW1lb3V0OiAzMDAwMCxcblx0XHRcdFx0fSBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dDtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29uZmlybVRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Q29uZmlybWF0aW9uUmVxdWlyZWQocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdXJmYWNlIGEgc2FuZGJveC1ieXBhc3MgdGl0bGUgYW5kIHJlYXNvbiB3aGVuIHNhbmRib3hCeXBhc3MgaXMgc2V0LCBldmVuIHdpdGggc2FuZGJveCBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNhbmRib3hFbmFibGVkID0gZmFsc2U7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7fSk7XG5cblx0XHRcdGNvbnN0IHsgQ29uZmlybVRlcm1pbmFsQ29tbWFuZFRvb2wgfSA9IGF3YWl0IGltcG9ydCgnLi4vLi4vYnJvd3Nlci90b29scy9ydW5JblRlcm1pbmFsQ29uZmlybWF0aW9uVG9vbC5qcycpO1xuXHRcdFx0Y29uc3QgY29uZmlybVRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlybVRlcm1pbmFsQ29tbWFuZFRvb2wpKTtcblxuXHRcdFx0Y29uc3QgY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ2NhdCB+L3NlY3JldCcsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdSZWFkIHNlY3JldCcsXG5cdFx0XHRcdFx0Z29hbDogJ1JlYWQgc2VjcmV0Jyxcblx0XHRcdFx0XHRtb2RlOiAnc3luYycsXG5cdFx0XHRcdFx0dGltZW91dDogMzAwMDAsXG5cdFx0XHRcdFx0c2FuZGJveEJ5cGFzczogdHJ1ZSxcblx0XHRcdFx0XHRzYW5kYm94QnlwYXNzUmVhc29uOiAnTmVlZHMgYWNjZXNzIG91dHNpZGUgdGhlIHdvcmtzcGFjZScsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtc1xuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbmZpcm1Ub29sLnByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBpbiB0ZXJtaW5hbCBvdXRzaWRlIHRoZSBzYW5kYm94PycpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHJlc3VsdCEuY29uZmlybWF0aW9uTWVzc2FnZXMhLm1lc3NhZ2U7XG5cdFx0XHRjb25zdCBtZXNzYWdlVGV4dCA9IHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyA/IG1lc3NhZ2UgOiBtZXNzYWdlPy52YWx1ZSA/PyAnJztcblx0XHRcdG9rKC9vdXRzaWRlIHRoZSBzYW5kYm94L2kudGVzdChtZXNzYWdlVGV4dCksIGBleHBlY3RlZCBtZXNzYWdlIHRvIG1lbnRpb24gdGhlIHNhbmRib3gsIGdvdDogJHttZXNzYWdlVGV4dH1gKTtcblx0XHRcdG9rKG1lc3NhZ2VUZXh0LmluY2x1ZGVzKCdOZWVkcyBhY2Nlc3Mgb3V0c2lkZSB0aGUgd29ya3NwYWNlJyksIGBleHBlY3RlZCBtZXNzYWdlIHRvIGluY2x1ZGUgdGhlIHJlYXNvbiwgZ290OiAke21lc3NhZ2VUZXh0fWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZvcmNlIGEgc2FuZGJveC1ieXBhc3MgY29uZmlybWF0aW9uIGV2ZW4gd2hlbiB0aGUgY29tbWFuZCB3b3VsZCBiZSBhdXRvLWFwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHsgY2F0OiB0cnVlIH0pO1xuXG5cdFx0XHRjb25zdCB7IENvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sIH0gPSBhd2FpdCBpbXBvcnQoJy4uLy4uL2Jyb3dzZXIvdG9vbHMvcnVuSW5UZXJtaW5hbENvbmZpcm1hdGlvblRvb2wuanMnKTtcblx0XHRcdGNvbnN0IGNvbmZpcm1Ub29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpcm1UZXJtaW5hbENvbW1hbmRUb29sKSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCA9IHtcblx0XHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdjYXQgfi9zZWNyZXQnLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnUmVhZCBzZWNyZXQnLFxuXHRcdFx0XHRcdGdvYWw6ICdSZWFkIHNlY3JldCcsXG5cdFx0XHRcdFx0bW9kZTogJ3N5bmMnLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwMDAwLFxuXHRcdFx0XHRcdHNhbmRib3hCeXBhc3M6IHRydWUsXG5cdFx0XHRcdH0gYXMgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtc1xuXHRcdFx0fSBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbmZpcm1Ub29sLnByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydENvbmZpcm1hdGlvblJlcXVpcmVkKHJlc3VsdCwgJ1J1biBpbiB0ZXJtaW5hbCBvdXRzaWRlIHRoZSBzYW5kYm94PycpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdEFnZW50VG9vbHNDb250cmlidXRpb24gLSB0b29sIHJlZ2lzdHJhdGlvbiByZWZyZXNoJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IHJlZ2lzdGVyZWRUb29sRGF0YTogTWFwPHN0cmluZywgSVRvb2xEYXRhPjtcblx0bGV0IHBlbmRpbmdUb29sRGF0YVJlZ2lzdHJhdGlvbjogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRsZXQgc2FuZGJveEVuYWJsZWQ6IGJvb2xlYW47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIHRydWUpO1xuXHRcdHJlZ2lzdGVyZWRUb29sRGF0YSA9IG5ldyBNYXAoKTtcblx0XHRwZW5kaW5nVG9vbERhdGFSZWdpc3RyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0c2FuZGJveEVuYWJsZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IG5ldyBUZXN0SVBDRmlsZVN5c3RlbVByb3ZpZGVyKCk7XG5cdFx0c3RvcmUuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBmaWxlU3lzdGVtUHJvdmlkZXIpKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsU2VydmljZURpc3Bvc2VFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0XHRjb25zdCBjaGF0U2VydmljZURpc3Bvc2VFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgc2Vzc2lvblJlc291cmNlczogVVJJW107IHJlYXNvbjogJ2NsZWFyZWQnIH0+KCkpO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElBZ2VudFNlc3Npb24+KCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRmaWxlU2VydmljZTogKCkgPT4gZmlsZVNlcnZpY2UsXG5cdFx0fSwgc3RvcmUpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkRGlzcG9zZVNlc3Npb246IGNoYXRTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGU6IGNoYXRTZXNzaW9uQXJjaGl2ZWRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0bW9kZWw6IHtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZTogY2hhdFNlc3Npb25BcmNoaXZlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHR9IGFzIElBZ2VudFNlc3Npb25zU2VydmljZVsnbW9kZWwnXVxuXHRcdH0pO1xuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2VzQ2hhbmdlZEVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZERpc3Bvc2VJbnN0YW5jZTogdGVybWluYWxTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZENoYW5nZUluc3RhbmNlczogdGVybWluYWxJbnN0YW5jZXNDaGFuZ2VkRW1pdHRlci5ldmVudCxcblx0XHRcdGZvcmVncm91bmRJbnN0YW5jZXM6IFtdLFxuXHRcdFx0c2V0TmV4dENvbW1hbmRJZDogYXN5bmMgKCkgPT4geyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxDaGF0U2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsQ2hhdFNlcnZpY2UpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSGlzdG9yeVNlcnZpY2UsIHtcblx0XHRcdGdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290OiAoKSA9PiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsU2FuZGJveFNlcnZpY2U6IElUZXJtaW5hbFNhbmRib3hTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0aXNFbmFibGVkOiBhc3luYyAoKSA9PiBzYW5kYm94RW5hYmxlZCxcblx0XHRcdGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQ6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0d3JhcENvbW1hbmQ6IGFzeW5jIChjb21tYW5kOiBzdHJpbmcpID0+ICh7XG5cdFx0XHRcdGNvbW1hbmQ6IGBzYW5kYm94OiR7Y29tbWFuZH1gLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0cnVlLFxuXHRcdFx0fSksXG5cdFx0XHRjaGVja0ZpbGVBY2Nlc3M6IGFzeW5jICgpID0+ICh7IGFsbG93ZWQ6IHRydWUsIGRlbmllZDogW10gfSksXG5cdFx0XHRnZXRTYW5kYm94Q29uZmlnUGF0aDogYXN5bmMgKCkgPT4gc2FuZGJveEVuYWJsZWQgPyAnL3RtcC9zYW5kYm94Lmpzb24nIDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxczogYXN5bmMgKCkgPT4gKHsgZW5hYmxlZDogc2FuZGJveEVuYWJsZWQsIHNhbmRib3hDb25maWdQYXRoOiBzYW5kYm94RW5hYmxlZCA/ICcvdG1wL3NhbmRib3guanNvbicgOiB1bmRlZmluZWQsIGZhaWxlZENoZWNrOiB1bmRlZmluZWQgfSksXG5cdFx0XHRnZXRUZW1wRGlyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzZXROZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZTogKCkgPT4geyB9LFxuXHRcdFx0Z2V0T1M6IGFzeW5jICgpID0+IE9wZXJhdGluZ1N5c3RlbS5MaW51eCxcblx0XHRcdGdldFJlc29sdmVkTmV0d29ya0RvbWFpbnM6ICgpID0+ICh7IGFsbG93ZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogW10gfSksXG5cdFx0XHRnZXRNaXNzaW5nU2FuZGJveERlcGVuZGVuY2llczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRpbnN0YWxsTWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXM6IGFzeW5jICgpID0+ICh7IGV4aXRDb2RlOiAwIH0pLFxuXHRcdFx0cnVuU2FuZGJveFJlbWVkaWF0aW9uOiBhc3luYyAoKSA9PiAoeyBleGl0Q29kZTogMCB9KSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsIHRlcm1pbmFsU2FuZGJveFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSkpO1xuXHRcdHRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5pc1Rlc3QgPSB0cnVlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwge1xuXHRcdFx0Z2V0RGVmYXVsdFByb2ZpbGU6IGFzeW5jICgpID0+ICh7IHBhdGg6ICdiYXNoJyB9IGFzIElUZXJtaW5hbFByb2ZpbGUpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRUb29sSW1wbHMgPSBuZXcgTWFwPHN0cmluZywgSVRvb2xJbXBsPigpO1xuXHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2U6IFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U+ID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2VUb29sczogRXZlbnQuTm9uZSxcblx0XHRcdHJlZ2lzdGVyVG9vbERhdGEodG9vbERhdGE6IElUb29sRGF0YSkge1xuXHRcdFx0XHRyZWdpc3RlcmVkVG9vbERhdGEuc2V0KHRvb2xEYXRhLmlkLCB0b29sRGF0YSk7XG5cdFx0XHRcdHBlbmRpbmdUb29sRGF0YVJlZ2lzdHJhdGlvbj8uY29tcGxldGUoKTtcblx0XHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiByZWdpc3RlcmVkVG9vbERhdGEuZGVsZXRlKHRvb2xEYXRhLmlkKSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVnaXN0ZXJUb29sSW1wbGVtZW50YXRpb24oaWQ6IHN0cmluZywgdG9vbDogSVRvb2xJbXBsKSB7XG5cdFx0XHRcdHJlZ2lzdGVyZWRUb29sSW1wbHMuc2V0KGlkLCB0b29sKTtcblx0XHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiByZWdpc3RlcmVkVG9vbEltcGxzLmRlbGV0ZShpZCkpO1xuXHRcdFx0fSxcblx0XHRcdHJlZ2lzdGVyVG9vbCh0b29sRGF0YTogSVRvb2xEYXRhLCB0b29sOiBJVG9vbEltcGwpIHtcblx0XHRcdFx0cmVnaXN0ZXJlZFRvb2xEYXRhLnNldCh0b29sRGF0YS5pZCwgdG9vbERhdGEpO1xuXHRcdFx0XHRyZWdpc3RlcmVkVG9vbEltcGxzLnNldCh0b29sRGF0YS5pZCwgdG9vbCk7XG5cdFx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdHJlZ2lzdGVyZWRUb29sRGF0YS5kZWxldGUodG9vbERhdGEuaWQpO1xuXHRcdFx0XHRcdHJlZ2lzdGVyZWRUb29sSW1wbHMuZGVsZXRlKHRvb2xEYXRhLmlkKTtcblx0XHRcdFx0XHRpZiAoaXNEaXNwb3NhYmxlKHRvb2wpKSB7XG5cdFx0XHRcdFx0XHR0b29sLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldFRvb2xzKCkge1xuXHRcdFx0XHRyZXR1cm4gcmVnaXN0ZXJlZFRvb2xEYXRhLnZhbHVlcygpO1xuXHRcdFx0fSxcblx0XHRcdGV4ZWN1dGVUb29sU2V0OiBuZXcgVG9vbFNldCgnZXhlY3V0ZScsICdleGVjdXRlJywgQ29kaWNvbi5wbGF5LCBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHRcdHJlYWRUb29sU2V0OiBuZXcgVG9vbFNldCgncmVhZCcsICdyZWFkJywgQ29kaWNvbi5ib29rLCBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIG1vY2tUb29sc1NlcnZpY2UgYXMgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVG9vbFJlc3VsdENvbXByZXNzb3IsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHJlZ2lzdGVyRmlsdGVyOiAoKSA9PiB7IH0sXG5cdFx0XHRyZWdpc3RlckNhY2hlOiAoKSA9PiB7IH0sXG5cdFx0XHRtYXliZUNvbXByZXNzOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JUb29sRGF0YVJlZ2lzdHJhdGlvbih0cmlnZ2VyOiAoKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdHBlbmRpbmdUb29sRGF0YVJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJhdGlvbjtcblx0XHR0cnkge1xuXHRcdFx0dHJpZ2dlcigpO1xuXHRcdFx0YXdhaXQgcmVnaXN0cmF0aW9uLnA7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlbmRpbmdUb29sRGF0YVJlZ2lzdHJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVDb250cmlidXRpb24oKTogUHJvbWlzZTxDaGF0QWdlbnRUb29sc0NvbnRyaWJ1dGlvbj4ge1xuXHRcdGxldCBjb250cmlidXRpb246IENoYXRBZ2VudFRvb2xzQ29udHJpYnV0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHdhaXRGb3JUb29sRGF0YVJlZ2lzdHJhdGlvbigoKSA9PiB7XG5cdFx0XHRjb250cmlidXRpb24gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50VG9vbHNDb250cmlidXRpb24pKTtcblx0XHR9KTtcblx0XHRvayhjb250cmlidXRpb24pO1xuXHRcdHJldHVybiBjb250cmlidXRpb247XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgcmVnaXN0ZXIgcnVuX2luX3Rlcm1pbmFsIHRvb2wgb24gY29uc3RydWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXHRcdG9rKHJlZ2lzdGVyZWRUb29sRGF0YS5oYXMoVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbCksICdFeHBlY3RlZCBydW5faW5fdGVybWluYWwgdG9vbCB0byBiZSByZWdpc3RlcmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZWZyZXNoIHJ1bl9pbl90ZXJtaW5hbCB0b29sIGRhdGEgd2hlbiBzYW5kYm94IHNldHRpbmcgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjcmVhdGVDb250cmlidXRpb24oKTtcblxuXHRcdGNvbnN0IHRvb2xEYXRhQmVmb3JlID0gcmVnaXN0ZXJlZFRvb2xEYXRhLmdldChUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsKTtcblx0XHRvayh0b29sRGF0YUJlZm9yZSwgJ0V4cGVjdGVkIHJ1bl9pbl90ZXJtaW5hbCB0b29sIHRvIGJlIHJlZ2lzdGVyZWQnKTtcblx0XHRjb25zdCBwcm9wZXJ0aWVzQmVmb3JlID0gdG9vbERhdGFCZWZvcmUuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgb2JqZWN0PiB8IHVuZGVmaW5lZDtcblx0XHRvayghcHJvcGVydGllc0JlZm9yZT8uWydyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nXSwgJ0V4cGVjdGVkIG5vIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBiZWZvcmUgZW5hYmxpbmcgc2FuZGJveCcpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclRvb2xEYXRhUmVnaXN0cmF0aW9uKCgpID0+IHtcblx0XHRcdC8vIEVuYWJsZSBzYW5kYm94IGFuZCBmaXJlIGNvbmZpZyBjaGFuZ2Vcblx0XHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24pO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZCxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZF0pLFxuXHRcdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0Y2hhbmdlOiBudWxsISxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdG9vbERhdGFBZnRlciA9IHJlZ2lzdGVyZWRUb29sRGF0YS5nZXQoVGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbCk7XG5cdFx0b2sodG9vbERhdGFBZnRlciwgJ0V4cGVjdGVkIHJ1bl9pbl90ZXJtaW5hbCB0b29sIHRvIHN0aWxsIGJlIHJlZ2lzdGVyZWQnKTtcblx0XHRjb25zdCBwcm9wZXJ0aWVzQWZ0ZXIgPSB0b29sRGF0YUFmdGVyLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzIGFzIFJlY29yZDxzdHJpbmcsIG9iamVjdD4gfCB1bmRlZmluZWQ7XG5cdFx0b2socHJvcGVydGllc0FmdGVyPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddLCAnRXhwZWN0ZWQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGFmdGVyIGVuYWJsaW5nIHNhbmRib3gnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJlZnJlc2ggcnVuX2luX3Rlcm1pbmFsIHRvb2wgZGF0YSB3aGVuIHVuc2FuZGJveGVkIGNvbW1hbmQgYWxsb3dhbmNlIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2FuZGJveEVuYWJsZWQgPSB0cnVlO1xuXHRcdGF3YWl0IGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXG5cdFx0Y29uc3QgdG9vbERhdGFCZWZvcmUgPSByZWdpc3RlcmVkVG9vbERhdGEuZ2V0KFRlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWwpO1xuXHRcdG9rKHRvb2xEYXRhQmVmb3JlLCAnRXhwZWN0ZWQgcnVuX2luX3Rlcm1pbmFsIHRvb2wgdG8gYmUgcmVnaXN0ZXJlZCcpO1xuXHRcdGNvbnN0IHByb3BlcnRpZXNCZWZvcmUgPSB0b29sRGF0YUJlZm9yZS5pbnB1dFNjaGVtYT8ucHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+IHwgdW5kZWZpbmVkO1xuXHRcdG9rKHByb3BlcnRpZXNCZWZvcmU/LlsncmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uJ10sICdFeHBlY3RlZCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gYmVmb3JlIGRpc2FibGluZyB1bnNhbmRib3hlZCBjb21tYW5kcycpO1xuXG5cdFx0YXdhaXQgd2FpdEZvclRvb2xEYXRhUmVnaXN0cmF0aW9uKCgpID0+IHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIGZhbHNlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoa2V5OiBzdHJpbmcpID0+IGtleSA9PT0gQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzXSksXG5cdFx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRjaGFuZ2U6IG51bGwhLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0b29sRGF0YUFmdGVyID0gcmVnaXN0ZXJlZFRvb2xEYXRhLmdldChUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsKTtcblx0XHRvayh0b29sRGF0YUFmdGVyLCAnRXhwZWN0ZWQgcnVuX2luX3Rlcm1pbmFsIHRvb2wgdG8gc3RpbGwgYmUgcmVnaXN0ZXJlZCcpO1xuXHRcdGNvbnN0IHByb3BlcnRpZXNBZnRlciA9IHRvb2xEYXRhQWZ0ZXIuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgb2JqZWN0PiB8IHVuZGVmaW5lZDtcblx0XHRvayghcHJvcGVydGllc0FmdGVyPy5bJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiddLCAnRXhwZWN0ZWQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIHRvIGJlIHJlbW92ZWQgYWZ0ZXIgZGlzYWJsaW5nIHVuc2FuZGJveGVkIGNvbW1hbmRzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZWZyZXNoIHJ1bl9pbl90ZXJtaW5hbCB0b29sIGRhdGEgd2hlbiBzYW5kYm94IG5ldHdvcmsgc2V0dGluZyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNhbmRib3hFbmFibGVkID0gdHJ1ZTtcblx0XHRhd2FpdCBjcmVhdGVDb250cmlidXRpb24oKTtcblxuXHRcdGNvbnN0IHRvb2xEYXRhQmVmb3JlID0gcmVnaXN0ZXJlZFRvb2xEYXRhLmdldChUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsKTtcblx0XHRvayh0b29sRGF0YUJlZm9yZSwgJ0V4cGVjdGVkIHJ1bl9pbl90ZXJtaW5hbCB0b29sIHRvIGJlIHJlZ2lzdGVyZWQnKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JUb29sRGF0YVJlZ2lzdHJhdGlvbigoKSA9PiB7XG5cdFx0XHQvLyBGaXJlIG5ldHdvcmsgY29uZmlnIGNoYW5nZVxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuQWxsb3dlZE5ldHdvcmtEb21haW5zLFxuXHRcdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnNdKSxcblx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRcdGNoYW5nZTogbnVsbCEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvb2xEYXRhQWZ0ZXIgPSByZWdpc3RlcmVkVG9vbERhdGEuZ2V0KFRlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWwpO1xuXHRcdG9rKHRvb2xEYXRhQWZ0ZXIsICdFeHBlY3RlZCBydW5faW5fdGVybWluYWwgdG9vbCB0byBzdGlsbCBiZSByZWdpc3RlcmVkIGFmdGVyIG5ldHdvcmsgc2V0dGluZyBjaGFuZ2UnKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxJQUFJLG1CQUFtQjtBQUNoQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLFdBQVcsdUJBQXVCO0FBQ3BELFNBQVMsYUFBYTtBQUN0QixTQUFTLGNBQWlDO0FBQzFDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFDdEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxtQkFBbUI7QUFFNUIs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QTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUdBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUdBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sZ0NBQWdDO0FBQUE7QUFBQSxNQUVyQztBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUdBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUdBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUdBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUdBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEs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
