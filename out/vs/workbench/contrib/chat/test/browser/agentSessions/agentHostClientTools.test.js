import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../../base/common/async.js";
import { encodeBase64, VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import { URI } from "../../../../../../base/common/uri.js";
import { constObservable, observableValue, autorun } from "../../../../../../base/common/observable.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { AgentSession } from "../../../../../../platform/agentHost/common/agentService.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from "../../../../../../platform/agentHost/common/toolSearchConstants.js";
import { isChatAction, isSessionAction } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, createChatState, createDefaultChatSummary, ChatInputResponseKind, MessageKind, SessionLifecycle, SessionStatus, createSessionState, StateComponents, parseDefaultChatUri, ToolCallCancellationReason } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { chatReducer, sessionReducer } from "../../../../../../platform/agentHost/common/state/sessionReducers.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { ContentEncoding } from "../../../../../../platform/agentHost/common/state/protocol/commands.js";
import { ConfirmationOptionKind, McpAuthRequiredReason, SessionInputRequestKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { IChatEditingService } from "../../../common/editing/chatEditingService.js";
import { IChatResponseFileChangesService } from "../../../browser/chatResponseFileChangesService.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { PieceCtorKind, PromptNodeType } from "../../../common/tools/promptTsxTypes.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IConfigurationResolverService } from "../../../../../services/configurationResolver/common/configurationResolver.js";
import { AgentHostSessionHandler, toolDataToDefinition, toolResultToProtocol, UNOBSERVED_CLIENT_TOOL_GRACE_MS } from "../../../browser/agentSessions/agentHost/agentHostSessionHandler.js";
import { AgentHostActiveClientService, IAgentHostActiveClientService } from "../../../browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from "../../../browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IAgentHostToolSetEnablementService } from "../../../browser/agentSessions/agentHost/agentHostToolSetEnablementService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestFileService } from "../../../../../test/common/workbenchTestServices.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { MockLabelService } from "../../../../../services/label/test/common/mockLabelService.js";
import { IAgentHostFileSystemService } from "../../../../../services/agentHost/common/agentHostFileSystemService.js";
import { IAgentHostImportConversationStore } from "../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js";
import { IStorageService, InMemoryStorageService } from "../../../../../../platform/storage/common/storage.js";
import { ITerminalChatService } from "../../../../terminal/browser/terminal.js";
import { IAgentHostTerminalService } from "../../../../terminal/browser/agentHostTerminalService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostSessionWorkingDirectorySynchronizer } from "../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectorySynchronizer.js";
import { IAgentHostUntitledProvisionalSessionService } from "../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { ILanguageModelToolsService, ToolAndToolSetEnablementMap, ToolDataSource, ToolInvocationPresentation } from "../../../common/tools/languageModelToolsService.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { ICustomizationHarnessService } from "../../../common/customizationHarnessService.js";
import { IAgentPluginService } from "../../../common/plugins/agentPluginService.js";
import { IOutputService } from "../../../../../services/output/common/output.js";
import { IDefaultAccountService } from "../../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IAuthenticationService } from "../../../../../services/authentication/common/authentication.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { IMcpService } from "../../../../mcp/common/mcpTypes.js";
suite("AgentHostClientTools", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("shares a customization scope for equivalent root sets", async () => {
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, TestFileService);
    instantiationService.stub(IAgentHostFileSystemService, {
      ensureSyncedCustomizationProvider: () => {
      }
    });
    instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
    instantiationService.stub(IConfigurationService, {
      getValue: () => false,
      onDidChangeConfiguration: Event.None
    });
    instantiationService.stub(IConfigurationResolverService, {});
    instantiationService.stub(IPromptsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeCustomAgents = Event.None;
        this.onDidChangeSlashCommands = Event.None;
        this.onDidChangeSkills = Event.None;
        this.onDidChangeInstructions = Event.None;
      }
      getDisabledPromptFiles() {
        return new ResourceSet();
      }
      async listPromptFilesForStorage() {
        return [];
      }
    }());
    instantiationService.stub(IAgentPluginService, {
      plugins: observableValue("plugins", [])
    });
    instantiationService.stub(IMcpService, {
      servers: observableValue("mcpServers", [])
    });
    instantiationService.stub(ILanguageModelToolsService, {
      observeTools: () => constObservable([]),
      toolSets: constObservable([])
    });
    instantiationService.stub(IAgentHostToolSetEnablementService, {
      observe: () => constObservable({ toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() }),
      getState: () => ({ toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() }),
      setToolSetEnabled: () => {
      },
      setToolEnabled: () => {
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentHostActiveClientService));
    const registration = disposables.add(service.registerForAgent("agent-host-claude"));
    const rootA = URI.file("/Workspace-A");
    const rootB = URI.file("/Workspace-B");
    const unregisteredScope = service.acquireScope("unregistered-agent", []);
    const unresolvedScope = registration.acquireScope([URI.file("/unresolved-workspace")]);
    const unresolved = unresolvedScope.whenResolved();
    unresolvedScope.dispose();
    assert.strictEqual(await unresolved, void 0);
    const first = registration.acquireScope([rootB, rootA, rootA]);
    const second = registration.acquireScope([rootA, rootB]);
    await first.whenResolved();
    const sharedScopeState = {
      customizations: first.customizations === second.customizations,
      customAgents: first.customAgents === second.customAgents
    };
    first.dispose();
    second.dispose();
    registration.dispose();
    assert.deepStrictEqual({
      unregisteredScope,
      sharedScopeState,
      scopeAfterRegistrationDisposal: service.acquireScope("agent-host-claude", [])
    }, {
      unregisteredScope: void 0,
      sharedScopeState: {
        customizations: true,
        customAgents: true
      },
      scopeAfterRegistrationDisposal: void 0
    });
  });
  suite("toolDataToDefinition", () => {
    test("maps toolReferenceName, displayName, modelDescription, and inputSchema", () => {
      const tool = {
        id: "vscode.runTests",
        toolReferenceName: "runTests",
        displayName: "Run Tests",
        modelDescription: "Runs unit tests in files",
        userDescription: "Run tests",
        source: ToolDataSource.Internal,
        inputSchema: {
          type: "object",
          properties: {
            files: { type: "array", items: { type: "string" } }
          }
        }
      };
      const def = toolDataToDefinition(tool);
      assert.deepStrictEqual(def, {
        name: "runTests",
        title: "Run Tests",
        description: "Runs unit tests in files",
        inputSchema: {
          type: "object",
          properties: {
            files: { type: "array", items: { type: "string" } }
          }
        }
      });
    });
    test("falls back to id when toolReferenceName is undefined", () => {
      const tool = {
        id: "vscode.runTests",
        displayName: "Run Tests",
        modelDescription: "Runs unit tests",
        source: ToolDataSource.Internal
      };
      const def = toolDataToDefinition(tool);
      assert.strictEqual(def.name, "vscode.runTests");
    });
    test("omits inputSchema when schema type is not object", () => {
      const tool = {
        id: "myTool",
        toolReferenceName: "myTool",
        displayName: "My Tool",
        modelDescription: "A tool",
        source: ToolDataSource.Internal,
        inputSchema: { type: "string" }
      };
      const def = toolDataToDefinition(tool);
      assert.strictEqual(def.inputSchema, void 0);
    });
    test("omits inputSchema when not provided", () => {
      const tool = {
        id: "myTool",
        toolReferenceName: "myTool",
        displayName: "My Tool",
        modelDescription: "A tool",
        source: ToolDataSource.Internal
      };
      const def = toolDataToDefinition(tool);
      assert.strictEqual(def.inputSchema, void 0);
    });
  });
  suite("toolResultToProtocol", () => {
    test("converts successful result with text content", () => {
      const result = {
        content: [
          { kind: "text", value: "All 5 tests passed" }
        ],
        toolResultMessage: "Ran 5 tests"
      };
      const proto = toolResultToProtocol(result, "runTests");
      assert.deepStrictEqual(proto, {
        success: true,
        pastTenseMessage: "Ran 5 tests",
        content: [{ type: ToolResultContentType.Text, text: "All 5 tests passed" }],
        error: void 0
      });
    });
    test("converts prompt TSX results to text content", () => {
      const result = {
        content: [{
          kind: "promptTsx",
          value: {
            node: {
              type: PromptNodeType.Piece,
              ctor: PieceCtorKind.Other,
              children: [
                { type: PromptNodeType.Text, text: "<diagnostics>", lineBreakBefore: void 0 },
                { type: PromptNodeType.Text, text: "1 problem found", lineBreakBefore: true },
                { type: PromptNodeType.Text, text: "</diagnostics>", lineBreakBefore: true }
              ]
            }
          }
        }],
        toolResultMessage: "Checked math.js, 1 problem found"
      };
      assert.deepStrictEqual(toolResultToProtocol(result, "problems"), {
        success: true,
        pastTenseMessage: "Checked math.js, 1 problem found",
        content: [{
          type: ToolResultContentType.Text,
          text: "<diagnostics>\n1 problem found\n</diagnostics>"
        }],
        error: void 0
      });
    });
    test("converts failed result with error", () => {
      const result = {
        content: [{ kind: "text", value: "Build failed" }],
        toolResultError: "Compilation error in file.ts"
      };
      const proto = toolResultToProtocol(result, "runTask");
      assert.deepStrictEqual(proto, {
        success: false,
        pastTenseMessage: "runTask failed",
        content: [{ type: ToolResultContentType.Text, text: "Build failed" }],
        error: { message: "Compilation error in file.ts" }
      });
    });
    test("uses default past tense message when toolResultMessage is absent", () => {
      const result = {
        content: [{ kind: "text", value: "done" }]
      };
      const proto = toolResultToProtocol(result, "myTool");
      assert.strictEqual(proto.pastTenseMessage, "Ran myTool");
    });
    test("preserves markdown tool result messages", () => {
      const result = {
        content: [],
        toolResultMessage: new MarkdownString("Opened [Browser](vscode-browser:/page-1?vscodeLinkType=browser)")
      };
      assert.deepStrictEqual(toolResultToProtocol(result, "open_browser_page").pastTenseMessage, {
        markdown: "Opened [Browser](vscode-browser:/page-1?vscodeLinkType=browser)"
      });
    });
    test("converts text and data content parts", () => {
      const binaryData = VSBuffer.fromString("hello binary");
      const result = {
        content: [
          { kind: "text", value: "hello" },
          { kind: "data", value: { mimeType: "image/png", data: binaryData } },
          { kind: "text", value: "world" }
        ]
      };
      const proto = toolResultToProtocol(result, "tool");
      assert.strictEqual(proto.content?.length, 3);
      assert.deepStrictEqual(proto.content[0], { type: ToolResultContentType.Text, text: "hello" });
      assert.strictEqual(proto.content[1].type, ToolResultContentType.EmbeddedResource);
      assert.strictEqual(proto.content[1].contentType, "image/png");
      const embeddedData = proto.content[1].data;
      assert.ok(embeddedData.length > 0);
      assert.notStrictEqual(embeddedData, "hello binary");
      assert.deepStrictEqual(proto.content[2], { type: ToolResultContentType.Text, text: "world" });
    });
    test("converts data parts to EmbeddedResource with base64 encoding", () => {
      const binaryData = VSBuffer.fromString("test data");
      const result = {
        content: [
          { kind: "data", value: { mimeType: "image/png", data: binaryData } }
        ]
      };
      const proto = toolResultToProtocol(result, "tool");
      assert.strictEqual(proto.content?.length, 1);
      assert.strictEqual(proto.content[0].type, ToolResultContentType.EmbeddedResource);
      const embedded = proto.content[0];
      assert.strictEqual(embedded.contentType, "image/png");
      assert.ok(embedded.data.length > 0);
      assert.notStrictEqual(embedded.data, "test data");
    });
    test("uses boolean toolResultError as generic error message", () => {
      const result = {
        content: [],
        toolResultError: true
      };
      const proto = toolResultToProtocol(result, "myTool");
      assert.strictEqual(proto.success, false);
      assert.strictEqual(proto.error?.message, "myTool encountered an error");
    });
  });
  suite("client tools registration", () => {
    function createMockToolsService(disposables2, tools, options) {
      const onDidChangeTools = disposables2.add(new Emitter());
      const pendingToolCalls = /* @__PURE__ */ new Map();
      const begunToolCalls = [];
      const invokedToolCalls = [];
      const executedToolCalls = [];
      const invocationTokens = [];
      const recordedStateKinds = /* @__PURE__ */ new Map();
      return {
        onDidChangeTools: onDidChangeTools.event,
        getToolByName: (name) => tools.find((t) => t.toolReferenceName === name),
        observeTools: () => observableValue("tools", tools),
        registerToolData: () => toDisposable(() => {
        }),
        registerToolImplementation: () => toDisposable(() => {
        }),
        registerTool: () => toDisposable(() => {
        }),
        getTools: () => tools,
        getAllToolsIncludingDisabled: () => tools,
        getTool: (id) => tools.find((t) => t.id === id),
        invokeTool: async (invocation, _countTokens, token) => {
          invokedToolCalls.push(invocation);
          invocationTokens.push(token ?? CancellationToken.None);
          const toolInvocation = pendingToolCalls.get(invocation.chatStreamToolCallId ?? invocation.callId);
          pendingToolCalls.delete(invocation.chatStreamToolCallId ?? invocation.callId);
          if (options?.throwBeforeConfirmation) {
            throw options.throwBeforeConfirmation;
          }
          if (options?.requireConfirmation && toolInvocation) {
            const prepared = {
              invocationMessage: `Run ${invocation.parameters.task}`,
              confirmationMessages: {
                title: "Confirm tool execution",
                message: "Run the task?",
                approveCombination: {
                  label: `Approve ${invocation.parameters.task}`,
                  key: JSON.stringify(invocation.parameters),
                  arguments: JSON.stringify(invocation.parameters)
                }
              },
              presentation: ToolInvocationPresentation.HiddenAfterComplete,
              toolSpecificData: {
                kind: "simpleToolInvocation",
                input: JSON.stringify(invocation.parameters),
                output: ""
              }
            };
            if (toolInvocation.state.get().type === IChatToolInvocation.StateKind.Streaming) {
              toolInvocation.transitionFromStreaming(prepared, invocation.parameters, invocation.preApproved);
            } else {
              toolInvocation.updatePreparedInvocation(prepared, invocation.parameters);
            }
            const confirmed = await IChatToolInvocation.awaitConfirmation(toolInvocation, token ?? CancellationToken.None);
            if (confirmed.type === ToolConfirmKind.Denied || confirmed.type === ToolConfirmKind.Skipped) {
              const state = toolInvocation.state.get();
              if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
                state.confirm(confirmed);
              }
              throw new CancellationError();
            }
          } else {
            const prepared = toolInvocation?.toolSpecificData?.kind === "subagent" ? {
              invocationMessage: "Delegating task",
              toolSpecificData: {
                kind: "subagent",
                description: "Prepared delegated task"
              }
            } : void 0;
            toolInvocation?.transitionFromStreaming(prepared, invocation.parameters, { type: ToolConfirmKind.ConfirmationNotNeeded });
          }
          executedToolCalls.push(invocation);
          const result = options?.invokeResult ? await options.invokeResult.p : { content: [{ kind: "text", value: "done" }] };
          await toolInvocation?.didExecuteTool(result);
          return result;
        },
        beginToolCall: (options2) => {
          const toolData = tools.find((t) => t.id === options2.toolId);
          if (!toolData) {
            return void 0;
          }
          const invocation = ChatToolInvocation.createStreaming({
            toolCallId: options2.toolCallId,
            toolId: options2.toolId,
            toolData,
            subagentInvocationId: options2.subagentInvocationId
          });
          pendingToolCalls.set(options2.toolCallId, invocation);
          begunToolCalls.push(invocation);
          const stateKinds = [];
          recordedStateKinds.set(options2.toolCallId, stateKinds);
          disposables2.add(autorun((reader) => {
            stateKinds.push(invocation.state.read(reader).type);
          }));
          return invocation;
        },
        updateToolStream: async () => {
        },
        cancelToolCallsForRequest: () => {
        },
        flushToolUpdates: () => {
        },
        toolSets: observableValue("sets", []),
        getToolSetsForModel: () => [],
        getToolSet: () => void 0,
        getToolSetByName: () => void 0,
        createToolSet: () => {
          throw new Error("not impl");
        },
        getFullReferenceNames: () => [],
        getFullReferenceName: () => "",
        getFullReferenceNameMap: () => /* @__PURE__ */ new Map(),
        getToolByFullReferenceName: () => void 0,
        getDeprecatedFullReferenceNames: () => /* @__PURE__ */ new Map(),
        toToolAndToolSetEnablementMap: () => ToolAndToolSetEnablementMap.fromEntries([]),
        toFullReferenceNames: () => [],
        toToolReferences: () => [],
        vscodeToolSet: void 0,
        executeToolSet: void 0,
        readToolSet: void 0,
        agentToolSet: void 0,
        onDidPrepareToolCallBecomeUnresponsive: Event.None,
        onDidInvokeTool: Event.None,
        _serviceBrand: void 0,
        fireOnDidChangeTools: () => onDidChangeTools.fire(),
        begunToolCalls,
        invokedToolCalls,
        executedToolCalls,
        invocationTokens,
        recordedStateKinds
      };
    }
    class MockAgentHostConnection extends mock() {
      constructor() {
        super(...arguments);
        this.clientId = "test-client";
        this._onDidAction = disposables.add(new Emitter());
        this.onDidAction = this._onDidAction.event;
        this._onDidNotification = disposables.add(new Emitter());
        this.onDidNotification = this._onDidNotification.event;
        this.onAgentHostExit = Event.None;
        this.onAgentHostStart = Event.None;
        this.initializeResult = constObservable(void 0);
        this._liveSubscriptions = /* @__PURE__ */ new Map();
        this.dispatchedActions = [];
        this.resourceReadUris = [];
        this.resourceReadData = '{"task":"build"}';
        this.resourceReadEncoding = ContentEncoding.Utf8;
        this.resourceReadResponses = /* @__PURE__ */ new Map();
        this.rootState = {
          value: void 0,
          verifiedValue: void 0,
          onDidChange: Event.None,
          onWillApplyAction: Event.None,
          onDidApplyAction: Event.None
        };
      }
      async resourceRead(uri) {
        this.resourceReadUris.push(uri);
        return this.resourceReadResponses.get(uri.toString()) ?? { data: this.resourceReadData, encoding: this.resourceReadEncoding };
      }
      dispatch(channel, action) {
        this.dispatchedActions.push({ channel, action });
        if (isSessionAction(action) || isChatAction(action)) {
          this.applySessionAction(channel, action);
        }
      }
      applySessionAction(channel, action) {
        const channelStr = typeof channel === "string" ? channel : channel.toString();
        if (isChatAction(action)) {
          const chatChannel = parseDefaultChatUri(channelStr) !== void 0 ? channelStr : void 0;
          assert.ok(chatChannel, `chat actions must be dispatched on an ahp-chat channel: ${action.type}`);
          const entry2 = this._ensureLiveSubscription(StateComponents.Chat, chatChannel);
          entry2.state = chatReducer(entry2.state, action, () => {
          });
          entry2.emitter.fire(entry2.state);
          return;
        }
        const entry = this._ensureLiveSubscription(StateComponents.Session, channelStr);
        entry.state = sessionReducer(entry.state, action, () => {
        });
        entry.emitter.fire(entry.state);
      }
      getSubscription(kind, resource) {
        const resourceStr = resource.toString();
        this._ensureLiveSubscription(kind, resourceStr);
        const entry = this._liveSubscriptions.get(resourceStr);
        const emitter = entry.emitter;
        const self = this;
        const sub = {
          get value() {
            return self._liveSubscriptions.get(resourceStr)?.state;
          },
          get verifiedValue() {
            return self._liveSubscriptions.get(resourceStr)?.state;
          },
          onDidChange: emitter.event,
          onWillApplyAction: Event.None,
          onDidApplyAction: Event.None
        };
        return {
          object: sub,
          dispose: () => {
            this._liveSubscriptions.delete(resourceStr);
          }
        };
      }
      _ensureLiveSubscription(kind, resourceStr) {
        let entry = this._liveSubscriptions.get(resourceStr);
        if (entry) {
          return entry;
        }
        const emitter = disposables.add(new Emitter());
        const sessionResource = kind === StateComponents.Chat ? parseDefaultChatUri(resourceStr) : resourceStr;
        assert.ok(sessionResource, `chat subscriptions must use an ahp-chat channel: ${resourceStr}`);
        const summary = {
          resource: sessionResource,
          provider: "copilot",
          title: "Test",
          status: SessionStatus.Idle,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const defaultChat = buildDefaultChatUri(sessionResource);
        const initialState = kind === StateComponents.Chat ? createChatState(createDefaultChatSummary(summary, resourceStr)) : {
          ...createSessionState(summary),
          lifecycle: SessionLifecycle.Ready,
          defaultChat,
          chats: [createDefaultChatSummary(summary, defaultChat)]
        };
        entry = { state: initialState, emitter };
        this._liveSubscriptions.set(resourceStr, entry);
        return entry;
      }
    }
    function createHandlerWithMocks(disposables2, tools, toolServiceOptions) {
      const instantiationService = disposables2.add(new TestInstantiationService());
      const connection = new MockAgentHostConnection();
      const toolsService = createMockToolsService(disposables2, tools, toolServiceOptions);
      const configValues = {};
      const onDidChangeConfig = disposables2.add(new Emitter());
      const configService = {
        getValue: (key) => configValues[key],
        onDidChangeConfiguration: onDidChangeConfig.event
      };
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IProductService, { quality: "insider" });
      instantiationService.stub(IChatEntitlementService, { entitlement: ChatEntitlement.Free, quotas: {} });
      instantiationService.stub(IChatAgentService, {
        registerDynamicAgent: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IFileService, TestFileService);
      instantiationService.stub(ILabelService, MockLabelService);
      instantiationService.stub(IChatSessionsService, {
        registerChatSessionItemController: () => toDisposable(() => {
        }),
        registerChatSessionContentProvider: () => toDisposable(() => {
        }),
        registerChatSessionContribution: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IChatWidgetService, {
        getWidgetBySessionResource: () => void 0
      });
      instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
      instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
      instantiationService.stub(ILanguageModelsService, {
        deltaLanguageModelChatProviderDescriptors: () => {
        },
        registerLanguageModelProvider: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IConfigurationService, configService);
      instantiationService.stub(IOutputService, { getChannel: () => void 0 });
      instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: "", folders: [] }), getWorkspaceFolder: () => null });
      instantiationService.stub(IChatEditingService, {
        registerEditingSessionProvider: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IChatResponseFileChangesService, {
        registerProvider: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IChatService, {
        getSession: () => void 0,
        onDidCreateModel: Event.None,
        removePendingRequest: () => {
        }
      });
      instantiationService.stub(IAgentHostFileSystemService, {
        registerAuthority: () => toDisposable(() => {
        }),
        ensureSyncedCustomizationProvider: () => {
        }
      });
      instantiationService.stub(IAgentHostCustomizationService, new NullAgentHostCustomizationService());
      instantiationService.stub(IStorageService, disposables2.add(new InMemoryStorageService()));
      instantiationService.stub(IAgentHostImportConversationStore, {
        set: () => {
        },
        take: () => void 0,
        rename: () => {
        }
      });
      instantiationService.stub(ICustomizationHarnessService, {
        registerExternalHarness: () => toDisposable(() => {
        })
      });
      instantiationService.stub(IAgentPluginService, {
        plugins: observableValue("plugins", [])
      });
      instantiationService.stub(IPromptsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeCustomAgents = Event.None;
          this.onDidChangeSlashCommands = Event.None;
          this.onDidChangeSkills = Event.None;
          this.onDidChangeInstructions = Event.None;
          this.onDidChangeAgentInstructions = Event.None;
        }
        async listPromptFilesForStorage() {
          return [];
        }
      }());
      instantiationService.stub(ITerminalChatService, {
        onDidContinueInBackground: Event.None,
        registerTerminalInstanceWithToolSession: () => {
        },
        getAhpCommandSource: () => void 0
      });
      instantiationService.stub(IAgentHostTerminalService, {
        reviveTerminal: async () => void 0,
        createTerminalForEntry: async () => void 0,
        profiles: observableValue("test", []),
        getProfileForConnection: () => void 0,
        registerEntry: () => ({ dispose() {
        } })
      });
      instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, {
        registerResolver: () => toDisposable(() => {
        }),
        resolve: () => void 0,
        isNewSession: () => false
      });
      instantiationService.stub(IAgentHostSessionWorkingDirectorySynchronizer, {
        register: () => toDisposable(() => {
        }),
        reconcile: async () => {
        }
      });
      instantiationService.stub(IAgentHostUntitledProvisionalSessionService, {
        onDidChange: Event.None,
        get: () => void 0,
        getInitialSessionConfig: () => void 0,
        waitForPending: async () => void 0,
        getOrCreate: async () => void 0,
        applyConfigChange: async () => void 0,
        tryRebind: async () => void 0,
        disposeSession: async () => {
        },
        getResolvedConfig: () => void 0,
        refreshResolvedConfig: async () => {
        }
      });
      instantiationService.stub(ILanguageModelToolsService, toolsService);
      instantiationService.stub(IAgentHostToolSetEnablementService, {
        observe: () => constObservable({ toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() }),
        getState: () => ({ toolSets: /* @__PURE__ */ new Map(), tools: /* @__PURE__ */ new Map() }),
        setToolSetEnabled: () => {
        },
        setToolEnabled: () => {
        }
      });
      const activeClientService = disposables2.add(instantiationService.createInstance(AgentHostActiveClientService));
      instantiationService.stub(IAgentHostActiveClientService, activeClientService);
      const handler = disposables2.add(instantiationService.createInstance(AgentHostSessionHandler, {
        provider: "copilot",
        agentId: "agent-host-copilot",
        sessionType: "agent-host-copilot",
        fullName: "Test",
        description: "Test",
        connection,
        connectionAuthority: "local"
      }));
      return { handler, connection, toolsService, configValues, onDidChangeConfig };
    }
    const testRunTestsTool = {
      id: "vscode.runTests",
      toolReferenceName: "runTests",
      displayName: "Run Tests",
      modelDescription: "Runs unit tests",
      source: ToolDataSource.Internal,
      inputSchema: { type: "object", properties: { files: { type: "array" } } }
    };
    const testRunTaskTool = {
      id: "vscode.runTask",
      toolReferenceName: "runTask",
      displayName: "Run Task",
      modelDescription: "Runs a VS Code task",
      source: ToolDataSource.Internal,
      inputSchema: { type: "object", properties: { task: { type: "string" } } }
    };
    const testSubagentTool = {
      id: "runSubagent",
      toolReferenceName: "task",
      displayName: "Run Subagent",
      modelDescription: "Runs a delegated task",
      source: ToolDataSource.Internal,
      inputSchema: { type: "object", properties: {} }
    };
    const testUnlistedTool = {
      id: "vscode.readFile",
      toolReferenceName: "readFile",
      displayName: "Read File",
      modelDescription: "Reads a file",
      source: ToolDataSource.Internal
    };
    const testToolSearchTool = {
      id: "vscode.toolSearch",
      toolReferenceName: CLIENT_TOOL_SEARCH_REFERENCE_NAME,
      displayName: "Search Tools",
      modelDescription: "Searches for tools",
      source: ToolDataSource.Internal,
      inputSchema: { type: "object", properties: { query: { type: "string" } } }
    };
    const testConfirmTool = {
      id: "vscode.deleteAll",
      toolReferenceName: "deleteAll",
      displayName: "Delete Everything",
      modelDescription: "A destructive action that needs confirmation",
      source: ToolDataSource.Internal,
      canRequestPreApproval: true,
      inputSchema: { type: "object", properties: {} }
    };
    async function provideSessionWithReadyRunTaskTool(handler, connection) {
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Run Task"
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}'
      });
      await timeout(0);
      await timeout(0);
    }
    function getToolCallConfirmationAndCompletionActions(connection) {
      return connection.dispatchedActions.filter((entry) => isChatAction(entry.action) && (entry.action.type === ActionType.ChatToolCallConfirmed || entry.action.type === ActionType.ChatToolCallComplete) && entry.action.toolCallId === "tool-call-1").map((entry) => {
        if (entry.action.type === ActionType.ChatToolCallConfirmed) {
          return {
            type: entry.action.type,
            approved: entry.action.approved,
            success: void 0,
            error: void 0
          };
        }
        if (entry.action.type === ActionType.ChatToolCallComplete) {
          return {
            type: entry.action.type,
            approved: void 0,
            success: entry.action.result.success,
            error: entry.action.result.error?.message
          };
        }
        throw new Error(`Unexpected action type: ${entry.action.type}`);
      });
    }
    function applyRunningClientExecution(connection, chat, turnId, toolCall) {
      connection.applySessionAction(URI.parse(AgentSession.uri("copilot", "session-1").toString()), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: `exec-${toolCall.toolCallId}`,
          kind: SessionInputRequestKind.ToolClientExecution,
          clientId: connection.clientId,
          chat,
          turnId,
          toolCall: {
            status: ToolCallStatus.Running,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            displayName: toolCall.displayName,
            invocationMessage: toolCall.invocationMessage,
            toolInput: toolCall.toolInput,
            confirmed: toolCall.confirmed ?? ToolCallConfirmationReason.NotNeeded,
            contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
            ...toolCall._meta ? { _meta: toolCall._meta } : {}
          }
        }
      });
    }
    function applyReferencedRunTask(connection, chatURI, toolInput, confirmed) {
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput,
        ...confirmed === void 0 ? { confirmationTitle: "Run Task" } : { confirmed }
      });
    }
    test("maps tool data to protocol definitions", async () => {
      const { connection } = createHandlerWithMocks(disposables, [testRunTestsTool, testRunTaskTool, testUnlistedTool]);
      assert.ok(connection);
      const runTestsDef = toolDataToDefinition(testRunTestsTool);
      assert.strictEqual(runTestsDef.name, "runTests");
      assert.strictEqual(runTestsDef.title, "Run Tests");
      assert.strictEqual(runTestsDef.description, "Runs unit tests");
    });
    test("handles tools with when clauses via observeTools filtering", () => {
      const def = toolDataToDefinition(testRunTestsTool);
      assert.strictEqual(def.name, "runTests");
    });
    test("invokes an owned client tool when reconnecting to an active turn", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}'
      });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual(toolsService.invokedToolCalls.map((call) => ({
        callId: call.callId,
        toolId: call.toolId,
        parameters: call.parameters,
        chatStreamToolCallId: call.chatStreamToolCallId
      })), [{
        callId: "tool-call-1",
        toolId: "vscode.runTask",
        parameters: { task: "build" },
        chatStreamToolCallId: "tool-call-1"
      }]);
      assert.ok(connection.dispatchedActions.some((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-call-1"));
    });
    test("resolves base64 referenced input before invoking an owned client tool", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      const toolInputURI = URI.parse("session-db:/tool-input");
      const toolInput = { uri: toolInputURI.toString(), contentType: "application/json" };
      connection.resourceReadData = encodeBase64(VSBuffer.fromString('{"task":"build"}'));
      connection.resourceReadEncoding = ContentEncoding.Base64;
      applyReferencedRunTask(connection, chatURI, toolInput, ToolCallConfirmationReason.NotNeeded);
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput
      });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual({
        resourceReadUris: connection.resourceReadUris.map((uri) => uri.toString()),
        parameters: toolsService.invokedToolCalls[0]?.parameters
      }, {
        resourceReadUris: [toolInputURI.toString()],
        parameters: { task: "build" }
      });
    });
    test("waits until referenced input is running before reading it", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      const toolInputURI = URI.parse("session-db:/tool-input");
      const toolInput = { uri: toolInputURI.toString(), contentType: "application/json" };
      applyReferencedRunTask(connection, chatURI, toolInput);
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      assert.strictEqual(connection.resourceReadUris.length, 0);
      IChatToolInvocation.confirmWith(
        toolsService.begunToolCalls.find((invocation) => invocation.toolCallId === "tool-call-1"),
        { type: ToolConfirmKind.UserAction }
      );
      await timeout(0);
      connection.resourceReadData = '{"task":"confirmed"}';
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput,
        confirmed: ToolCallConfirmationReason.UserAction
      });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual({
        resourceReadUris: connection.resourceReadUris.map((uri) => uri.toString()),
        parameters: toolsService.invokedToolCalls[0]?.parameters
      }, {
        resourceReadUris: [toolInputURI.toString()],
        parameters: { task: "confirmed" }
      });
    });
    test("supersedes a hung referenced input read when the request changes", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      const firstInputURI = URI.parse("session-db:/tool-input-1");
      const secondInputURI = URI.parse("session-db:/tool-input-2");
      const firstInput = { uri: firstInputURI.toString(), contentType: "application/json" };
      const secondInput = { uri: secondInputURI.toString(), contentType: "application/json" };
      connection.resourceReadResponses.set(firstInputURI.toString(), new DeferredPromise().p);
      connection.resourceReadResponses.set(secondInputURI.toString(), Promise.resolve({
        data: '{"task":"latest"}',
        encoding: ContentEncoding.Utf8
      }));
      applyReferencedRunTask(connection, chatURI, firstInput, ToolCallConfirmationReason.NotNeeded);
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: firstInput
      });
      await timeout(0);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: secondInput
      });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual({
        resourceReadUris: connection.resourceReadUris.map((uri) => uri.toString()),
        parameters: toolsService.invokedToolCalls[0]?.parameters
      }, {
        resourceReadUris: [firstInputURI.toString(), secondInputURI.toString()],
        parameters: { task: "latest" }
      });
    });
    test("does not re-execute when the request changes after invocation starts", async () => {
      const invokeResult = new DeferredPromise();
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { invokeResult });
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      applyReferencedRunTask(connection, chatURI, '{"task":"first"}', ToolCallConfirmationReason.NotNeeded);
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"first"}'
      });
      await timeout(0);
      assert.strictEqual(toolsService.invokedToolCalls.length, 1);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"second"}'
      });
      await timeout(0);
      assert.strictEqual(toolsService.invokedToolCalls.length, 1);
      invokeResult.complete({ content: [{ kind: "text", value: "done" }] });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual({
        invocations: toolsService.invokedToolCalls.map((call) => call.parameters),
        completions: connection.dispatchedActions.filter((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-call-1").length
      }, {
        invocations: [{ task: "first" }],
        completions: 1
      });
    });
    test("settles local and protocol state when referenced input cannot be read", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      const toolInputURI = URI.parse("session-db:/tool-input");
      const toolInput = { uri: toolInputURI.toString(), contentType: "application/json" };
      const read = new DeferredPromise();
      connection.resourceReadResponses.set(toolInputURI.toString(), read.p);
      applyReferencedRunTask(connection, chatURI, toolInput, ToolCallConfirmationReason.NotNeeded);
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput
      });
      await timeout(0);
      await read.error(new Error("read failed"));
      await timeout(0);
      const completion = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-call-1");
      assert.deepStrictEqual({
        invocationState: toolsService.begunToolCalls[0]?.state.get().type,
        completionError: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error?.message : void 0
      }, {
        invocationState: IChatToolInvocation.StateKind.Completed,
        completionError: "read failed"
      });
    });
    test("settles local and protocol state when referenced input resolves to invalid JSON", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      const toolInput = { uri: "session-db:/tool-input", contentType: "application/json" };
      connection.resourceReadData = "not json";
      applyReferencedRunTask(connection, chatURI, toolInput, ToolCallConfirmationReason.NotNeeded);
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput
      });
      await timeout(0);
      await timeout(0);
      const completion = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-call-1");
      assert.deepStrictEqual({
        invocationState: toolsService.begunToolCalls[0]?.state.get().type,
        completionError: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error?.message : void 0
      }, {
        invocationState: IChatToolInvocation.StateKind.Completed,
        completionError: 'Invalid tool input for "runTask": expected JSON object parameters.'
      });
    });
    test("waits for tool-search candidates and drops them from completion metadata", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testToolSearchTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      const toolSearchCandidates = [{ name: "calculator", description: "Adds numbers" }];
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "find a calculator", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-search-call-1",
        toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
        displayName: "Search Tools",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-search-call-1",
        invocationMessage: "Search Tools",
        toolInput: '{"query":"calculator"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: {
          futureMetadata: { preserve: true }
        }
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-search-call-1",
        toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
        displayName: "Search Tools",
        invocationMessage: "Search Tools",
        toolInput: '{"query":"calculator"}',
        _meta: {
          futureMetadata: { preserve: true }
        }
      });
      await timeout(0);
      assert.strictEqual(toolsService.invokedToolCalls.length, 0);
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-search-call-1",
        invocationMessage: "Search Tools",
        toolInput: '{"query":"calculator"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: {
          toolSearchCandidates,
          futureMetadata: { preserve: true }
        }
      });
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-search-call-1",
        toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
        displayName: "Search Tools",
        invocationMessage: "Search Tools",
        toolInput: '{"query":"calculator"}',
        _meta: {
          toolSearchCandidates,
          futureMetadata: { preserve: true }
        }
      });
      await timeout(0);
      await timeout(0);
      const completion = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-search-call-1");
      assert.ok(completion && isChatAction(completion.action) && completion.action.type === ActionType.ChatToolCallComplete);
      assert.deepStrictEqual({
        parameters: toolsService.invokedToolCalls[0]?.parameters,
        meta: completion.action._meta
      }, {
        parameters: {
          query: "calculator",
          candidateTools: toolSearchCandidates
        },
        meta: { futureMetadata: { preserve: true } }
      });
    });
    test("invalid tool-search input drops candidates while preserving unknown metadata", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testToolSearchTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "find a calculator", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-search-call-invalid",
        toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
        displayName: "Search Tools",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-search-call-invalid",
        invocationMessage: "Search Tools",
        toolInput: "{invalid",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: {
          toolSearchCandidates: [{ name: "calculator", description: "Adds numbers" }],
          futureMetadata: { preserve: true }
        }
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-search-call-invalid",
        toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
        displayName: "Search Tools",
        invocationMessage: "Search Tools",
        toolInput: "{invalid",
        _meta: {
          toolSearchCandidates: [{ name: "calculator", description: "Adds numbers" }],
          futureMetadata: { preserve: true }
        }
      });
      await timeout(0);
      await timeout(0);
      const completion = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-search-call-invalid");
      assert.ok(completion && isChatAction(completion.action) && completion.action.type === ActionType.ChatToolCallComplete);
      assert.deepStrictEqual({
        invokedToolCalls: toolsService.invokedToolCalls.length,
        success: completion.action.result.success,
        meta: completion.action._meta
      }, {
        invokedToolCalls: 0,
        success: false,
        meta: { futureMetadata: { preserve: true } }
      });
    });
    test("shows another client tool as cancellable progress without invoking or confirming it", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "owner-client" }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Allow Run Task?"
      });
      const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      await timeout(0);
      const invocation = session.progressObs.get().find((part) => part instanceof ChatToolInvocation && part.toolCallId === "tool-call-1");
      assert.ok(invocation);
      const actionsBeforeSkip = getToolCallConfirmationAndCompletionActions(connection);
      const stateBeforeSkip = invocation.state.get().type;
      const messageBeforeSkip = invocation.invocationMessage;
      invocation.otherClientToolCall?.cancel();
      await timeout(0);
      assert.deepStrictEqual({
        messageBeforeSkip,
        messageAfterSkip: invocation.invocationMessage,
        stateBeforeSkip,
        stateAfterSkip: invocation.state.get().type,
        invokedToolCallCount: toolsService.invokedToolCalls.length,
        actionsBeforeSkip,
        actionsAfterSkip: getToolCallConfirmationAndCompletionActions(connection)
      }, {
        messageBeforeSkip: "Running Run Task on another client...",
        messageAfterSkip: "Run Task",
        stateBeforeSkip: IChatToolInvocation.StateKind.Executing,
        stateAfterSkip: IChatToolInvocation.StateKind.Completed,
        invokedToolCallCount: 0,
        actionsBeforeSkip: [],
        actionsAfterSkip: [{
          type: ActionType.ChatToolCallConfirmed,
          approved: false,
          success: void 0,
          error: void 0
        }]
      });
    });
    test("reports client tool prepare failures before confirmation as failed completion", async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { throwBeforeConfirmation: new Error("prepare failed") });
      await provideSessionWithReadyRunTaskTool(handler, connection);
      assert.deepStrictEqual(getToolCallConfirmationAndCompletionActions(connection), [{
        type: ActionType.ChatToolCallComplete,
        approved: void 0,
        success: false,
        error: "prepare failed"
      }]);
    });
    test("reports client tool cancellation before confirmation as failed completion when protocol call is not terminal", async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { throwBeforeConfirmation: new CancellationError() });
      await provideSessionWithReadyRunTaskTool(handler, connection);
      assert.deepStrictEqual(getToolCallConfirmationAndCompletionActions(connection), [{
        type: ActionType.ChatToolCallComplete,
        approved: void 0,
        success: false,
        error: "Canceled"
      }]);
    });
    test("auto-approves client tool confirmation as a setting when the agent host marks the call", async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Run Task",
        _meta: { autoApproveBySetting: true }
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.Setting,
        _meta: { autoApproveBySetting: true }
      });
      await timeout(0);
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual(connection.dispatchedActions.filter((entry) => isChatAction(entry.action) && (entry.action.type === ActionType.ChatToolCallConfirmed || entry.action.type === ActionType.ChatToolCallComplete) && entry.action.toolCallId === "tool-call-1").map((entry) => {
        if (entry.action.type === ActionType.ChatToolCallConfirmed) {
          return {
            type: entry.action.type,
            approved: entry.action.approved,
            confirmed: entry.action.approved ? entry.action.confirmed : void 0,
            success: void 0
          };
        }
        if (entry.action.type === ActionType.ChatToolCallComplete) {
          return {
            type: entry.action.type,
            approved: void 0,
            confirmed: void 0,
            success: entry.action.result.success
          };
        }
        throw new Error(`Unexpected action type: ${entry.action.type}`);
      }), [
        {
          type: ActionType.ChatToolCallConfirmed,
          approved: true,
          confirmed: ToolCallConfirmationReason.Setting,
          success: void 0
        },
        {
          type: ActionType.ChatToolCallComplete,
          approved: void 0,
          confirmed: void 0,
          success: true
        }
      ]);
    });
    test("protocol-confirmed client tool never enters WaitingForConfirmation (no needs-input flicker)", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(0);
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual(
        {
          preApprovedKind: toolsService.invokedToolCalls[0]?.preApproved?.type,
          sawWaitingForConfirmation: (toolsService.recordedStateKinds.get("tool-call-1") ?? []).includes(IChatToolInvocation.StateKind.WaitingForConfirmation)
        },
        {
          preApprovedKind: ToolConfirmKind.ConfirmationNotNeeded,
          sawWaitingForConfirmation: false
        }
      );
    });
    async function provideSessionWithPendingConfirmationClientTool(handler, connection) {
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = URI.parse(buildDefaultChatUri(backendSession));
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Run Task",
        options: [
          { id: "allow-once", label: "Allow Once", kind: ConfirmationOptionKind.Approve },
          { id: "skip", label: "Skip", kind: ConfirmationOptionKind.Deny }
        ]
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      connection.applySessionAction(AgentSession.uri("copilot", "session-1"), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "confirmation-tool-call-1",
          kind: SessionInputRequestKind.ToolConfirmation,
          chat: chatURI.toString(),
          turnId: "turn-1",
          toolCall: {
            status: ToolCallStatus.PendingConfirmation,
            toolCallId: "tool-call-1",
            toolName: "runTask",
            displayName: "Run Task",
            invocationMessage: "Run Task",
            toolInput: '{"task":"build"}',
            confirmationTitle: "Run Task",
            contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
          }
        }
      });
      await timeout(0);
      await timeout(0);
      return chatURI;
    }
    test("invokes a ready client tool and reflects its local confirmation", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      await provideSessionWithPendingConfirmationClientTool(handler, connection);
      const invocation = toolsService.begunToolCalls.find((invocation2) => invocation2.toolCallId === "tool-call-1");
      const stateBeforeApproval = invocation?.state.get().type;
      const parametersBeforeExecution = invocation?.parameters;
      const hydratedInvocation = invocation && {
        state: invocation.state.get().type,
        parameters: invocation.parameters,
        invocationMessage: invocation.invocationMessage,
        confirmationTitle: invocation.confirmationMessages?.title,
        approveCombination: invocation.confirmationMessages?.approveCombination,
        presentation: invocation.presentation,
        toolSpecificData: invocation.toolSpecificData
      };
      const confirmationAccepted = IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual({
        stateBeforeApproval,
        parametersBeforeExecution,
        hydratedInvocation,
        confirmationAccepted,
        invocationsAfterClientExecution: toolsService.invokedToolCalls.length,
        actions: connection.dispatchedActions.filter((entry) => isChatAction(entry.action) && (entry.action.type === ActionType.ChatToolCallConfirmed || entry.action.type === ActionType.ChatToolCallComplete) && entry.action.toolCallId === "tool-call-1").map((entry) => {
          if (entry.action.type === ActionType.ChatToolCallConfirmed) {
            return { type: entry.action.type, approved: entry.action.approved, confirmed: entry.action.approved ? entry.action.confirmed : void 0 };
          }
          if (entry.action.type === ActionType.ChatToolCallComplete) {
            return { type: entry.action.type, success: entry.action.result.success };
          }
          throw new Error(`Unexpected action type: ${entry.action.type}`);
        })
      }, {
        stateBeforeApproval: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parametersBeforeExecution: { task: "build" },
        hydratedInvocation: {
          state: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters: { task: "build" },
          invocationMessage: "Run build",
          confirmationTitle: "Confirm tool execution",
          approveCombination: {
            label: "Approve build",
            key: '{"task":"build"}',
            arguments: '{"task":"build"}'
          },
          presentation: ToolInvocationPresentation.HiddenAfterComplete,
          toolSpecificData: {
            kind: "simpleToolInvocation",
            input: '{"task":"build"}',
            output: ""
          }
        },
        confirmationAccepted: true,
        invocationsAfterClientExecution: 1,
        actions: [
          { type: ActionType.ChatToolCallConfirmed, approved: true, confirmed: ToolCallConfirmationReason.UserAction },
          { type: ActionType.ChatToolCallComplete, success: true }
        ]
      });
    });
    test("ignores protocol confirmation when the client tool does not require it", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      await provideSessionWithPendingConfirmationClientTool(handler, connection);
      await timeout(0);
      const invocation = toolsService.begunToolCalls[0];
      const confirmation = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallConfirmed && entry.action.toolCallId === "tool-call-1");
      assert.deepStrictEqual({
        invocations: toolsService.invokedToolCalls.length,
        preApproved: toolsService.invokedToolCalls[0]?.preApproved,
        sawWaitingForConfirmation: (toolsService.recordedStateKinds.get("tool-call-1") ?? []).includes(IChatToolInvocation.StateKind.WaitingForConfirmation),
        confirmationMessages: invocation.confirmationMessages,
        confirmation: confirmation?.action
      }, {
        invocations: 1,
        preApproved: void 0,
        sawWaitingForConfirmation: false,
        confirmationMessages: void 0,
        confirmation: {
          type: ActionType.ChatToolCallConfirmed,
          turnId: "turn-1",
          toolCallId: "tool-call-1",
          approved: true,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
    });
    test("preserves the client tool confirmation reason through execution", async () => {
      const reasons = [
        ToolCallConfirmationReason.NotNeeded,
        ToolCallConfirmationReason.Setting,
        ToolCallConfirmationReason.UserAction
      ];
      const results = [];
      for (const reason of reasons) {
        const local = disposables.add(new DisposableStore());
        const { handler, connection, toolsService } = createHandlerWithMocks(local, [testRunTaskTool], { requireConfirmation: true });
        await provideSessionWithPendingConfirmationClientTool(handler, connection);
        const confirmedReason = reason === ToolCallConfirmationReason.NotNeeded ? { type: ToolConfirmKind.ConfirmationNotNeeded } : reason === ToolCallConfirmationReason.Setting ? { type: ToolConfirmKind.Setting, id: "test-setting" } : { type: ToolConfirmKind.UserAction };
        IChatToolInvocation.confirmWith(
          toolsService.begunToolCalls.find((invocation) => invocation.toolCallId === "tool-call-1"),
          confirmedReason
        );
        await timeout(0);
        await timeout(0);
        const confirmedAction = connection.dispatchedActions.find((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallConfirmed && entry.action.toolCallId === "tool-call-1");
        results.push({
          reason,
          dispatchedConfirmed: confirmedAction && confirmedAction.action.type === ActionType.ChatToolCallConfirmed && confirmedAction.action.approved ? confirmedAction.action.confirmed : void 0,
          completed: connection.dispatchedActions.some((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-call-1" && entry.action.result.success === true)
        });
        disposables.delete(local);
      }
      assert.deepStrictEqual(results, reasons.map((reason) => ({
        reason,
        dispatchedConfirmed: reason,
        completed: true
      })));
    });
    test("does not execute again when the protocol advances the locally invoked tool to running", async () => {
      const invokeResult = new DeferredPromise();
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { invokeResult });
      const chatURI = await provideSessionWithPendingConfirmationClientTool(handler, connection);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(0);
      assert.deepStrictEqual({
        invoked: toolsService.invokedToolCalls.filter((invocation) => invocation.chatStreamToolCallId === "tool-call-1").length,
        dispatchedApproval: connection.dispatchedActions.some((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallConfirmed && entry.action.toolCallId === "tool-call-1" && entry.action.approved === true)
      }, {
        invoked: 1,
        dispatchedApproval: true
      });
      invokeResult.complete({ content: [{ kind: "text", value: "done" }] });
      await timeout(0);
    });
    test("cancels a confirming client tool when its confirmation request disappears", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      await provideSessionWithPendingConfirmationClientTool(handler, connection);
      connection.applySessionAction(AgentSession.uri("copilot", "session-1"), {
        type: ActionType.SessionInputNeededRemoved,
        id: "confirmation-tool-call-1"
      });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual({
        cancelled: toolsService.invocationTokens[0]?.isCancellationRequested,
        state: toolsService.begunToolCalls[0]?.state.get().type
      }, {
        cancelled: true,
        state: IChatToolInvocation.StateKind.Cancelled
      });
    });
    test("does not execute a client tool skipped from another client while confirming", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
      const chatURI = await provideSessionWithPendingConfirmationClientTool(handler, connection);
      connection.applySessionAction(chatURI, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        approved: false,
        reason: ToolCallCancellationReason.Skipped,
        reasonMessage: "Run Task was skipped from another client"
      });
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual({
        executed: toolsService.executedToolCalls.length,
        state: toolsService.begunToolCalls[0]?.state.get().type,
        completions: connection.dispatchedActions.filter((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "tool-call-1").length
      }, {
        executed: 0,
        state: IChatToolInvocation.StateKind.Cancelled,
        completions: 0
      });
    });
    test("transfers cancellation authority from confirmation to execution", async () => {
      const invokeResult = new DeferredPromise();
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true, invokeResult });
      const chatURI = await provideSessionWithPendingConfirmationClientTool(handler, connection);
      const invocation = toolsService.begunToolCalls[0];
      IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
      connection.applySessionAction(AgentSession.uri("copilot", "session-1"), {
        type: ActionType.SessionInputNeededRemoved,
        id: "confirmation-tool-call-1"
      });
      await timeout(0);
      assert.strictEqual(toolsService.invocationTokens[0]?.isCancellationRequested, false);
      applyRunningClientExecution(connection, chatURI.toString(), "turn-1", {
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.UserAction
      });
      await timeout(0);
      connection.applySessionAction(AgentSession.uri("copilot", "session-1"), {
        type: ActionType.SessionInputNeededRemoved,
        id: "exec-tool-call-1"
      });
      await timeout(0);
      assert.deepStrictEqual({
        cancelled: toolsService.invocationTokens[0]?.isCancellationRequested,
        confirmations: connection.dispatchedActions.filter((entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallConfirmed && entry.action.toolCallId === "tool-call-1").length
      }, {
        cancelled: true,
        confirmations: 1
      });
      invokeResult.complete({ content: [{ kind: "text", value: "done" }] });
      await timeout(0);
    });
    test("reconnecting to an active turn with owned client tool completes the initial snapshot invocation", async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      const snapshotInvocation = session.progressObs.get().find((p) => p instanceof ChatToolInvocation && p.toolCallId === "tool-call-1");
      assert.ok(snapshotInvocation, "activeTurnToProgress should have created a snapshot invocation");
      await timeout(0);
      await timeout(0);
      assert.ok(
        IChatToolInvocation.isComplete(snapshotInvocation),
        "the initial snapshot invocation should be completed, not orphaned"
      );
    });
    test("auto-denies an unclaimed session confirmation after the grace period", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, []);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const subagentChat = buildSubagentChatUri(backendSession, "task-call-1");
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "approval-1",
          kind: SessionInputRequestKind.ToolConfirmation,
          chat: subagentChat,
          turnId: "subagent-turn-1",
          toolCall: {
            status: ToolCallStatus.PendingConfirmation,
            toolCallId: "powershell-call-1",
            toolName: "powershell",
            displayName: "PowerShell",
            invocationMessage: "Run PowerShell"
          }
        }
      });
      await timeout(UNOBSERVED_CLIENT_TOOL_GRACE_MS + 1);
      assert.deepStrictEqual(
        connection.dispatchedActions.filter((entry) => entry.action.type === ActionType.ChatToolCallConfirmed && entry.action.toolCallId === "powershell-call-1").map((entry) => ({ channel: entry.channel, action: entry.action })),
        [{
          channel: subagentChat,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId: "subagent-turn-1",
            toolCallId: "powershell-call-1",
            approved: false,
            reason: ToolCallCancellationReason.Denied
          }
        }]
      );
    }));
    test("cancels an unclaimed chat input request after the grace period", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, []);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const subagentChat = buildSubagentChatUri(backendSession, "task-call-1");
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "input-1",
          kind: SessionInputRequestKind.ChatInput,
          chat: subagentChat,
          request: { id: "elicit-1", message: "Pick one", questions: [] }
        }
      });
      await timeout(5001);
      assert.deepStrictEqual(
        connection.dispatchedActions.filter((entry) => entry.action.type === ActionType.ChatInputCompleted).map((entry) => ({ channel: entry.channel, action: entry.action })),
        [{
          channel: subagentChat,
          action: {
            type: ActionType.ChatInputCompleted,
            requestId: "elicit-1",
            response: ChatInputResponseKind.Cancel
          }
        }]
      );
    }));
    test("does not cancel a chat input request a turn observer is rendering", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, []);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = buildDefaultChatUri(backendSession);
      connection.applySessionAction(URI.parse(chatURI), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "ask me", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(chatURI), {
        type: ActionType.ChatInputRequested,
        request: { id: "elicit-1", message: "Pick one", questions: [] }
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "input-1",
          kind: SessionInputRequestKind.ChatInput,
          chat: chatURI,
          request: { id: "elicit-1", message: "Pick one", questions: [] }
        }
      });
      await timeout(5001);
      assert.strictEqual(connection.dispatchedActions.some((entry) => entry.action.type === ActionType.ChatInputCompleted), false);
      connection.applySessionAction(URI.parse(chatURI), {
        type: ActionType.ChatInputCompleted,
        requestId: "elicit-1",
        response: ChatInputResponseKind.Cancel
      });
      await timeout(0);
    }));
    test("cancels an unclaimed MCP authentication tool call after the grace period", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, []);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const subagentChat = buildSubagentChatUri(backendSession, "task-call-1");
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "auth-1",
          kind: SessionInputRequestKind.ToolAuthentication,
          chat: subagentChat,
          turnId: "subagent-turn-1",
          toolCall: {
            status: ToolCallStatus.AuthRequired,
            toolCallId: "mcp-call-1",
            toolName: "notionSearch",
            displayName: "Notion Search",
            invocationMessage: "Search Notion",
            confirmed: ToolCallConfirmationReason.UserAction,
            contributor: { kind: ToolCallContributorKind.MCP, customizationId: "notion-mcp" },
            auth: { reason: McpAuthRequiredReason.Required, resource: { resource: "https://mcp.notion.com/mcp", authorization_servers: [] } }
          }
        }
      });
      await timeout(5001);
      assert.deepStrictEqual(
        connection.dispatchedActions.filter((entry) => entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "mcp-call-1").map((entry) => ({ channel: entry.channel, action: entry.action })),
        [{
          channel: subagentChat,
          action: {
            type: ActionType.ChatToolCallComplete,
            turnId: "subagent-turn-1",
            toolCallId: "mcp-call-1",
            result: {
              success: false,
              pastTenseMessage: "Cancelled tool call",
              error: { message: "MCP authentication was cancelled", code: "cancelled" }
            }
          }
        }]
      );
    }));
    test("does not cancel an MCP authentication tool call a turn observer is rendering", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, []);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chatURI = buildDefaultChatUri(backendSession);
      connection.applySessionAction(URI.parse(chatURI), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "search notion", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(chatURI), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "mcp-call-1",
        toolName: "notionSearch",
        displayName: "Notion Search",
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "notion-mcp" }
      });
      connection.applySessionAction(URI.parse(chatURI), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "mcp-call-1",
        invocationMessage: "Search Notion",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      connection.applySessionAction(URI.parse(chatURI), {
        type: ActionType.ChatToolCallAuthRequired,
        turnId: "turn-1",
        toolCallId: "mcp-call-1",
        auth: { reason: McpAuthRequiredReason.Required, resource: { resource: "https://mcp.notion.com/mcp", authorization_servers: [] } }
      });
      await timeout(0);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "auth-1",
          kind: SessionInputRequestKind.ToolAuthentication,
          chat: chatURI,
          turnId: "turn-1",
          toolCall: {
            status: ToolCallStatus.AuthRequired,
            toolCallId: "mcp-call-1",
            toolName: "notionSearch",
            displayName: "Notion Search",
            invocationMessage: "Search Notion",
            confirmed: ToolCallConfirmationReason.UserAction,
            contributor: { kind: ToolCallContributorKind.MCP, customizationId: "notion-mcp" },
            auth: { reason: McpAuthRequiredReason.Required, resource: { resource: "https://mcp.notion.com/mcp", authorization_servers: [] } }
          }
        }
      });
      await timeout(5001);
      assert.strictEqual(connection.dispatchedActions.some((entry) => entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "mcp-call-1"), false);
    }));
    test("renders a subagent client tool as the same invocation the watcher executes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testSubagentTool, testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const parentToolCallId = "client-task-1";
      const subagentChat = buildSubagentChatUri(backendSession, parentToolCallId);
      const parentChat = URI.parse(buildDefaultChatUri(backendSession));
      connection.applySessionAction(parentChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "delegate work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(parentChat, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        toolName: "task",
        displayName: "Delegated Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
        _meta: { toolKind: "subagent", subagentChatUri: subagentChat }
      });
      const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      connection.applySessionAction(parentChat, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        invocationMessage: "Delegating task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: "runTask-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: "runTask-call-1",
        invocationMessage: "Run Task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(0);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "exec-1",
          kind: SessionInputRequestKind.ToolClientExecution,
          clientId: connection.clientId,
          chat: subagentChat,
          turnId: "sub-turn-1",
          toolCall: {
            status: ToolCallStatus.Running,
            toolCallId: "runTask-call-1",
            toolName: "runTask",
            displayName: "Run Task",
            invocationMessage: "Run Task",
            toolInput: "{}",
            confirmed: ToolCallConfirmationReason.NotNeeded
          }
        }
      });
      await timeout(0);
      const rendered = session.progressObs.get().find((part) => part instanceof ChatToolInvocation && part.toolCallId === "runTask-call-1");
      assert.deepStrictEqual({
        renderedInSubagentGroup: rendered?.subAgentInvocationId,
        renderedIsTheBegunInvocation: rendered === toolsService.begunToolCalls.find((inv) => inv.toolCallId === "runTask-call-1"),
        begun: toolsService.begunToolCalls.filter((inv) => inv.toolCallId === "runTask-call-1").length,
        invoked: toolsService.invokedToolCalls.filter((inv) => inv.chatStreamToolCallId === "runTask-call-1").length
      }, {
        renderedInSubagentGroup: parentToolCallId,
        renderedIsTheBegunInvocation: true,
        begun: 1,
        invoked: 1
      });
    }));
    test("runs an unclaimed non-confirmable client tool headlessly without waiting for the grace window", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const subagentChat = buildSubagentChatUri(backendSession, "task-call-1");
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "execution-1",
          kind: SessionInputRequestKind.ToolClientExecution,
          chat: subagentChat,
          turnId: "subagent-turn-1",
          clientId: connection.clientId,
          toolCall: {
            status: ToolCallStatus.Running,
            toolCallId: "client-tool-1",
            toolName: "runTask",
            displayName: "Run Task",
            invocationMessage: "Run Task",
            toolInput: '{"task":"build"}',
            confirmed: ToolCallConfirmationReason.NotNeeded,
            contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
          }
        }
      });
      await timeout(0);
      assert.deepStrictEqual({
        // Executed headlessly: no chat `context`, so the invocation does
        // not depend on the owning turn still being live.
        invocation: toolsService.invokedToolCalls.map((call) => ({
          callId: call.callId,
          parameters: call.parameters,
          hasContext: call.context !== void 0,
          preApprovedKind: call.preApproved?.type
        })),
        completion: connection.dispatchedActions.find((entry) => entry.channel === subagentChat && entry.action.type === ActionType.ChatToolCallComplete)
      }, {
        invocation: [{
          callId: "client-tool-1",
          parameters: { task: "build" },
          hasContext: false,
          preApprovedKind: ToolConfirmKind.ConfirmationNotNeeded
        }],
        completion: {
          channel: subagentChat,
          action: {
            type: ActionType.ChatToolCallComplete,
            turnId: "subagent-turn-1",
            toolCallId: "client-tool-1",
            result: {
              success: true,
              pastTenseMessage: "Ran runTask",
              content: [{ type: "text", text: "done" }],
              error: void 0
            }
          }
        }
      });
    }));
    test("executes a claimed client tool exactly once, with chat context", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chat = buildDefaultChatUri(backendSession);
      connection.applySessionAction(URI.parse(chat), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(chat), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "client-tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(chat), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "client-tool-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "execution-1",
          kind: SessionInputRequestKind.ToolClientExecution,
          chat,
          turnId: "turn-1",
          clientId: connection.clientId,
          toolCall: {
            status: ToolCallStatus.Running,
            toolCallId: "client-tool-1",
            toolName: "runTask",
            displayName: "Run Task",
            invocationMessage: "Run Task",
            toolInput: '{"task":"build"}',
            confirmed: ToolCallConfirmationReason.NotNeeded,
            contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
          }
        }
      });
      await timeout(5001);
      assert.deepStrictEqual({
        // A live turn observer renders the call, so the watcher runs it
        // once with chat context (not per-observer, not headless).
        invocations: toolsService.invokedToolCalls.filter((invocation) => invocation.chatStreamToolCallId === "client-tool-1").map((invocation) => invocation.context !== void 0),
        declines: connection.dispatchedActions.filter((entry) => entry.action.type === ActionType.ChatToolCallComplete && entry.action.result.error?.code === "clientUnavailable").length
      }, {
        invocations: [true],
        declines: 0
      });
    }));
    async function openSiblingResourcesWithClaimedClientTool(handler, connection) {
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const peerResource = URI.from({ scheme: "agent-host-copilot", path: "/session-1", fragment: "peer-1" });
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const chat = buildDefaultChatUri(backendSession);
      const peerChat = buildChatUri(backendSession, "peer-1");
      const summary = {
        resource: backendSession,
        provider: "copilot",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: "2025-01-01T00:00:00.000Z",
        modifiedAt: "2025-01-01T00:00:00.000Z"
      };
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionChatAdded,
        summary: createDefaultChatSummary(summary, peerChat)
      });
      connection.applySessionAction(URI.parse(chat), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "run the task", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(chat), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "client-tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(chat), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "client-tool-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await handler.provideChatSessionContent(peerResource, CancellationToken.None);
      applyRunningClientExecution(connection, chat, "turn-1", {
        toolCallId: "client-tool-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}'
      });
      await timeout(5001);
      return { sessionResource, peerResource, chat };
    }
    test("two sibling resources on one backend session execute a client tool exactly once", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      await openSiblingResourcesWithClaimedClientTool(handler, connection);
      assert.deepStrictEqual({
        invocations: toolsService.invokedToolCalls.filter((invocation) => invocation.chatStreamToolCallId === "client-tool-1").length
      }, {
        invocations: 1
      });
    }));
    test("a claimed client tool executes with the claiming observer's session resource as context", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const { sessionResource } = await openSiblingResourcesWithClaimedClientTool(handler, connection);
      assert.deepStrictEqual(
        toolsService.invokedToolCalls.filter((invocation) => invocation.chatStreamToolCallId === "client-tool-1").map((invocation) => invocation.context?.sessionResource.toString()),
        [sessionResource.toString()]
      );
    }));
    test("denies an unclaimed confirmable client tool after the grace window without executing it", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testConfirmTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const subagentChat = buildSubagentChatUri(backendSession, "task-call-1");
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: {
          id: "execution-1",
          kind: SessionInputRequestKind.ToolClientExecution,
          chat: subagentChat,
          turnId: "subagent-turn-1",
          clientId: connection.clientId,
          toolCall: {
            status: ToolCallStatus.Running,
            toolCallId: "client-tool-1",
            toolName: "deleteAll",
            displayName: "Delete Everything",
            invocationMessage: "Delete everything",
            toolInput: "{}",
            confirmed: ToolCallConfirmationReason.UserAction,
            contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
          }
        }
      });
      await timeout(5001);
      assert.deepStrictEqual({
        invocations: toolsService.invokedToolCalls.filter((invocation) => invocation.chatStreamToolCallId === "client-tool-1").length,
        denial: connection.dispatchedActions.find((entry) => entry.channel === subagentChat && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "client-tool-1")?.action
      }, {
        invocations: 0,
        denial: {
          type: ActionType.ChatToolCallComplete,
          turnId: "subagent-turn-1",
          toolCallId: "client-tool-1",
          result: {
            success: false,
            pastTenseMessage: "Couldn't run Delete Everything",
            error: {
              message: "Delete Everything needs confirmation but no session was available to answer it.",
              code: "clientUnavailable"
            }
          }
        }
      });
    }));
    test("does not run foreign or already-resolved client tools", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const subagentChat = buildSubagentChatUri(backendSession, "task-call-1");
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      const request = {
        id: "execution-1",
        kind: SessionInputRequestKind.ToolClientExecution,
        chat: subagentChat,
        turnId: "subagent-turn-1",
        clientId: "other-client",
        toolCall: {
          status: ToolCallStatus.Running,
          toolCallId: "client-tool-1",
          toolName: "runTask",
          displayName: "Run Task",
          invocationMessage: "Run Task",
          toolInput: '{"task":"build"}',
          confirmed: ToolCallConfirmationReason.NotNeeded,
          contributor: { kind: ToolCallContributorKind.Client, clientId: "other-client" }
        }
      };
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request
      });
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededSet,
        request: { ...request, id: "execution-2", clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(backendSession), {
        type: ActionType.SessionInputNeededRemoved,
        id: "execution-2"
      });
      await timeout(5001);
      assert.strictEqual(connection.dispatchedActions.some((entry) => entry.action.type === ActionType.ChatToolCallComplete), false);
    }));
    test("invokes a client tool inside a subagent session and dispatches completion against the subagent URI", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const parentToolCallId = "tc-parent-task";
      const subagentChat = buildSubagentChatUri(backendSession, parentToolCallId);
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "do work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        invocationMessage: "Spawning subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallContentChanged,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        content: [{ type: ToolResultContentType.Subagent, resource: subagentChat, title: "Subagent" }]
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: "inner-tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: "inner-tool-call-1",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, subagentChat, "sub-turn-1", {
        toolCallId: "inner-tool-call-1",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(0);
      await timeout(0);
      const innerInvocation = toolsService.invokedToolCalls.find((call) => call.callId === "inner-tool-call-1");
      assert.ok(innerInvocation, "inner client tool inside the subagent should be invoked locally");
      assert.strictEqual(innerInvocation.toolId, "vscode.runTask");
      assert.deepStrictEqual(innerInvocation.parameters, { task: "build" });
      const completionEntry = connection.dispatchedActions.find(
        (entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "inner-tool-call-1"
      );
      assert.ok(completionEntry, "completion for the inner client tool should be dispatched");
      assert.strictEqual(
        completionEntry.channel.toString(),
        subagentChat,
        "completion should target the subagent default chat URI"
      );
    });
    test("observes child tools from a client-provided delegated task", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testSubagentTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const parentToolCallId = "client-task-1";
      const subagentChat = buildSubagentChatUri(backendSession, parentToolCallId);
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "delegate work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        toolName: "task",
        displayName: "Delegated Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
        _meta: { toolKind: "subagent", subagentChatUri: subagentChat }
      });
      const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      await timeout(0);
      const parentInvocation = toolsService.begunToolCalls.find((part) => part.toolCallId === parentToolCallId);
      assert.strictEqual(parentInvocation?.toolSpecificData?.kind, "subagent");
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: parentToolCallId,
        invocationMessage: "Delegating task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), "turn-1", {
        toolCallId: parentToolCallId,
        toolName: "task",
        displayName: "Delegated Task",
        invocationMessage: "Delegating task",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(0);
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: "child-tool-1",
        toolName: "bash",
        displayName: "Bash"
      });
      connection.applySessionAction(URI.parse(subagentChat), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: "child-tool-1",
        invocationMessage: "Inspecting changes",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(0);
      await timeout(0);
      const progress = session.progressObs.get();
      const childInvocations = progress.filter((part) => part instanceof ChatToolInvocation && part.toolCallId === "child-tool-1");
      assert.deepStrictEqual({
        parent: parentInvocation?.toolSpecificData,
        childCount: childInvocations.length,
        childSubAgentInvocationId: childInvocations[0]?.subAgentInvocationId
      }, {
        parent: {
          kind: "subagent",
          description: "Prepared delegated task",
          agentName: void 0,
          chatResource: subagentChat,
          isActive: true,
          startedAt: Date.parse("2025-01-01T00:00:00.000Z"),
          duration: void 0
        },
        childCount: 1,
        childSubAgentInvocationId: parentToolCallId
      });
    });
    test("invokes a client tool inside a nested (level-2) subagent and groups it under the root", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const rootToolCallId = "tc-l1-task";
      const nestedToolCallId = "tc-l2-task";
      const subagentChat1 = buildSubagentChatUri(backendSession, rootToolCallId);
      const subagentChat2 = buildSubagentChatUri(backendSession, nestedToolCallId);
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "do work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        invocationMessage: "Spawning subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallContentChanged,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        content: [{ type: ToolResultContentType.Subagent, resource: subagentChat1, title: "Subagent L1" }]
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        invocationMessage: "Spawning nested subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallContentChanged,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        content: [{ type: ToolResultContentType.Subagent, resource: subagentChat2, title: "Subagent L2" }]
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-2",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-2",
        toolCallId: "deep-tool-call",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-2",
        toolCallId: "deep-tool-call",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, subagentChat2, "sub-turn-2", {
        toolCallId: "deep-tool-call",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      for (let i = 0; i < 200 && !connection.dispatchedActions.some((e) => isChatAction(e.action) && e.action.type === ActionType.ChatToolCallComplete && e.action.toolCallId === "deep-tool-call"); i++) {
        await timeout(1);
      }
      const deepInvocation = toolsService.invokedToolCalls.find((call) => call.callId === "deep-tool-call");
      assert.ok(deepInvocation, "client tool inside a nested subagent should be invoked locally");
      assert.deepStrictEqual(deepInvocation.parameters, { task: "build" });
      const completionEntry = connection.dispatchedActions.find(
        (entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "deep-tool-call"
      );
      assert.ok(completionEntry, "completion for the nested client tool should be dispatched");
      assert.strictEqual(completionEntry.channel.toString(), subagentChat2, "completion should target the level-2 subagent chat URI");
      const deepBegun = toolsService.begunToolCalls.find((c) => c.toolCallId === "deep-tool-call");
      assert.strictEqual(deepBegun?.subAgentInvocationId, rootToolCallId, "descendant tools should be grouped under the root subagent invocation");
    });
    test("observes a nested subagent without a discovery content block (agent-host misroutes it)", async () => {
      const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
      const sessionResource = URI.parse("agent-host-copilot:/session-1");
      const backendSession = AgentSession.uri("copilot", "session-1").toString();
      const rootToolCallId = "tc-l1-task";
      const nestedToolCallId = "tc-l2-task";
      const subagentChat1 = buildSubagentChatUri(backendSession, rootToolCallId);
      const subagentChat2 = buildSubagentChatUri(backendSession, nestedToolCallId);
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "do work", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: rootToolCallId,
        invocationMessage: "Spawning subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        toolName: "task",
        displayName: "Task",
        _meta: { toolKind: "subagent" }
      });
      connection.applySessionAction(URI.parse(subagentChat1), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-1",
        toolCallId: nestedToolCallId,
        invocationMessage: "Spawning nested subagent",
        toolInput: "{}",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatTurnStarted,
        turnId: "sub-turn-2",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "", origin: { kind: MessageKind.User } }
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatToolCallStart,
        turnId: "sub-turn-2",
        toolCallId: "deep-tool-call",
        toolName: "runTask",
        displayName: "Run Task",
        contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId }
      });
      connection.applySessionAction(URI.parse(subagentChat2), {
        type: ActionType.ChatToolCallReady,
        turnId: "sub-turn-2",
        toolCallId: "deep-tool-call",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
      applyRunningClientExecution(connection, subagentChat2, "sub-turn-2", {
        toolCallId: "deep-tool-call",
        toolName: "runTask",
        displayName: "Run Task",
        invocationMessage: "Run Task",
        toolInput: '{"task":"build"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      for (let i = 0; i < 200 && !connection.dispatchedActions.some((e) => isChatAction(e.action) && e.action.type === ActionType.ChatToolCallComplete && e.action.toolCallId === "deep-tool-call"); i++) {
        await timeout(1);
      }
      const deepInvocation = toolsService.invokedToolCalls.find((call) => call.callId === "deep-tool-call");
      assert.ok(deepInvocation, "client tool inside a content-block-less nested subagent should still be invoked locally");
      assert.deepStrictEqual(deepInvocation.parameters, { task: "build" });
      const completionEntry = connection.dispatchedActions.find(
        (entry) => isChatAction(entry.action) && entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === "deep-tool-call"
      );
      assert.ok(completionEntry, "completion for the nested client tool should be dispatched");
      assert.strictEqual(completionEntry.channel.toString(), subagentChat2, "completion should target the level-2 subagent chat URI");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdENsaWVudFRvb2xzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FLCBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdG9vbFNlYXJjaENvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBpc0NoYXRBY3Rpb24sIGlzU2Vzc2lvbkFjdGlvbiwgdHlwZSBBY3Rpb25FbnZlbG9wZSwgdHlwZSBDaGF0QWN0aW9uLCB0eXBlIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgdHlwZSBTZXNzaW9uQWN0aW9uLCB0eXBlIFRlcm1pbmFsQWN0aW9uLCB0eXBlIElOb3RpZmljYXRpb24sIHR5cGUgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgYnVpbGRTdWJhZ2VudENoYXRVcmksIGNyZWF0ZUNoYXRTdGF0ZSwgY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5LCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIE1lc3NhZ2VLaW5kLCBTZXNzaW9uTGlmZWN5Y2xlLCBTZXNzaW9uU3RhdHVzLCBjcmVhdGVTZXNzaW9uU3RhdGUsIFN0YXRlQ29tcG9uZW50cywgcGFyc2VEZWZhdWx0Q2hhdFVyaSwgVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24sIHR5cGUgQ2hhdFN0YXRlLCB0eXBlIFNlc3Npb25TdGF0ZSwgdHlwZSBTZXNzaW9uU3VtbWFyeSwgdHlwZSBSb290U3RhdGUsIHR5cGUgVG9vbElucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgY2hhdFJlZHVjZXIsIHNlc3Npb25SZWR1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uUmVkdWNlcnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZW50RW5jb2RpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQsIE1jcEF1dGhSZXF1aXJlZFJlYXNvbiwgU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRQcm9ncmVzcywgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFRvb2xJbnZvY2F0aW9uLmpzJztcbmltcG9ydCB7IFBpZWNlQ3RvcktpbmQsIFByb21wdE5vZGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL3Byb21wdFRzeFR5cGVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIsIHRvb2xEYXRhVG9EZWZpbml0aW9uLCB0b29sUmVzdWx0VG9Qcm90b2NvbCwgVU5PQlNFUlZFRF9DTElFTlRfVE9PTF9HUkFDRV9NUyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSwgSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBOdWxsQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UsIElUb29sRW5hYmxlbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFRlc3RGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IE1vY2tMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYWJlbC90ZXN0L2NvbW1vbi9tb2NrTGFiZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL2FnZW50SG9zdFRlcm1pbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTeW5jaHJvbml6ZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U3luY2hyb25pemVyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBJVG9vbEludm9jYXRpb24sIElUb29sUmVzdWx0LCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAsIFRvb2xEYXRhU291cmNlLCBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBVbml0IHRlc3RzIGZvciB0b29sRGF0YVRvRGVmaW5pdGlvbiBhbmQgdG9vbFJlc3VsdFRvUHJvdG9jb2xcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbnN1aXRlKCdBZ2VudEhvc3RDbGllbnRUb29scycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2hhcmVzIGEgY3VzdG9taXphdGlvbiBzY29wZSBmb3IgZXF1aXZhbGVudCByb290IHNldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgVGVzdEZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZSwge1xuXHRcdFx0ZW5zdXJlU3luY2VkQ3VzdG9taXphdGlvblByb3ZpZGVyOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIHtcblx0XHRcdGdldFZhbHVlOiAoKSA9PiBmYWxzZSxcblx0XHRcdG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRXZlbnQuTm9uZSxcblx0XHR9IGFzIFBhcnRpYWw8SUNvbmZpZ3VyYXRpb25TZXJ2aWNlPiBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsIHt9IGFzIFBhcnRpYWw8SUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvbXB0c1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2tpbGxzID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIGdldERpc2FibGVkUHJvbXB0RmlsZXMoKSB7IHJldHVybiBuZXcgUmVzb3VyY2VTZXQoKTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgbGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZSgpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH0oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5TZXJ2aWNlLCB7XG5cdFx0XHRwbHVnaW5zOiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbnMnLCBbXSksXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWNwU2VydmljZSwge1xuXHRcdFx0c2VydmVyczogb2JzZXJ2YWJsZVZhbHVlKCdtY3BTZXJ2ZXJzJywgW10pLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHtcblx0XHRcdG9ic2VydmVUb29sczogKCkgPT4gY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRcdHRvb2xTZXRzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdH0gYXMgUGFydGlhbDxJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZT4gYXMgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFRvb2xTZXRFbmFibGVtZW50U2VydmljZSwge1xuXHRcdFx0b2JzZXJ2ZTogKCkgPT4gY29uc3RPYnNlcnZhYmxlPElUb29sRW5hYmxlbWVudFN0YXRlPih7IHRvb2xTZXRzOiBuZXcgTWFwKCksIHRvb2xzOiBuZXcgTWFwKCkgfSksXG5cdFx0XHRnZXRTdGF0ZTogKCkgPT4gKHsgdG9vbFNldHM6IG5ldyBNYXAoKSwgdG9vbHM6IG5ldyBNYXAoKSB9KSxcblx0XHRcdHNldFRvb2xTZXRFbmFibGVkOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXRUb29sRW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJGb3JBZ2VudCgnYWdlbnQtaG9zdC1jbGF1ZGUnKSk7XG5cdFx0Y29uc3Qgcm9vdEEgPSBVUkkuZmlsZSgnL1dvcmtzcGFjZS1BJyk7XG5cdFx0Y29uc3Qgcm9vdEIgPSBVUkkuZmlsZSgnL1dvcmtzcGFjZS1CJyk7XG5cdFx0Y29uc3QgdW5yZWdpc3RlcmVkU2NvcGUgPSBzZXJ2aWNlLmFjcXVpcmVTY29wZSgndW5yZWdpc3RlcmVkLWFnZW50JywgW10pO1xuXHRcdGNvbnN0IHVucmVzb2x2ZWRTY29wZSA9IHJlZ2lzdHJhdGlvbi5hY3F1aXJlU2NvcGUoW1VSSS5maWxlKCcvdW5yZXNvbHZlZC13b3Jrc3BhY2UnKV0pO1xuXHRcdGNvbnN0IHVucmVzb2x2ZWQgPSB1bnJlc29sdmVkU2NvcGUud2hlblJlc29sdmVkKCk7XG5cdFx0dW5yZXNvbHZlZFNjb3BlLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgdW5yZXNvbHZlZCwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBmaXJzdCA9IHJlZ2lzdHJhdGlvbi5hY3F1aXJlU2NvcGUoW3Jvb3RCLCByb290QSwgcm9vdEFdKTtcblx0XHRjb25zdCBzZWNvbmQgPSByZWdpc3RyYXRpb24uYWNxdWlyZVNjb3BlKFtyb290QSwgcm9vdEJdKTtcblx0XHRhd2FpdCBmaXJzdC53aGVuUmVzb2x2ZWQoKTtcblxuXHRcdGNvbnN0IHNoYXJlZFNjb3BlU3RhdGUgPSB7XG5cdFx0XHRjdXN0b21pemF0aW9uczogZmlyc3QuY3VzdG9taXphdGlvbnMgPT09IHNlY29uZC5jdXN0b21pemF0aW9ucyxcblx0XHRcdGN1c3RvbUFnZW50czogZmlyc3QuY3VzdG9tQWdlbnRzID09PSBzZWNvbmQuY3VzdG9tQWdlbnRzLFxuXHRcdH07XG5cdFx0Zmlyc3QuZGlzcG9zZSgpO1xuXHRcdHNlY29uZC5kaXNwb3NlKCk7XG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dW5yZWdpc3RlcmVkU2NvcGUsXG5cdFx0XHRzaGFyZWRTY29wZVN0YXRlLFxuXHRcdFx0c2NvcGVBZnRlclJlZ2lzdHJhdGlvbkRpc3Bvc2FsOiBzZXJ2aWNlLmFjcXVpcmVTY29wZSgnYWdlbnQtaG9zdC1jbGF1ZGUnLCBbXSksXG5cdFx0fSwge1xuXHRcdFx0dW5yZWdpc3RlcmVkU2NvcGU6IHVuZGVmaW5lZCxcblx0XHRcdHNoYXJlZFNjb3BlU3RhdGU6IHtcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IHRydWUsXG5cdFx0XHRcdGN1c3RvbUFnZW50czogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRzY29wZUFmdGVyUmVnaXN0cmF0aW9uRGlzcG9zYWw6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gXHUyNTAwXHUyNTAwIHRvb2xEYXRhVG9EZWZpbml0aW9uIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdHN1aXRlKCd0b29sRGF0YVRvRGVmaW5pdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hcHMgdG9vbFJlZmVyZW5jZU5hbWUsIGRpc3BsYXlOYW1lLCBtb2RlbERlc2NyaXB0aW9uLCBhbmQgaW5wdXRTY2hlbWEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAndnNjb2RlLnJ1blRlc3RzJyxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdydW5UZXN0cycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRlc3RzJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1J1bnMgdW5pdCB0ZXN0cyBpbiBmaWxlcycsXG5cdFx0XHRcdHVzZXJEZXNjcmlwdGlvbjogJ1J1biB0ZXN0cycsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0ZmlsZXM6IHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBkZWYgPSB0b29sRGF0YVRvRGVmaW5pdGlvbih0b29sKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWYsIHtcblx0XHRcdFx0bmFtZTogJ3J1blRlc3RzJyxcblx0XHRcdFx0dGl0bGU6ICdSdW4gVGVzdHMnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1J1bnMgdW5pdCB0ZXN0cyBpbiBmaWxlcycsXG5cdFx0XHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0ZmlsZXM6IHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gaWQgd2hlbiB0b29sUmVmZXJlbmNlTmFtZSBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAndnNjb2RlLnJ1blRlc3RzJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGVzdHMnLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUnVucyB1bml0IHRlc3RzJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlZiA9IHRvb2xEYXRhVG9EZWZpbml0aW9uKHRvb2wpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZi5uYW1lLCAndnNjb2RlLnJ1blRlc3RzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyBpbnB1dFNjaGVtYSB3aGVuIHNjaGVtYSB0eXBlIGlzIG5vdCBvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdGlkOiAnbXlUb29sJyxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdteVRvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ015IFRvb2wnLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQSB0b29sJyxcblx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlZiA9IHRvb2xEYXRhVG9EZWZpbml0aW9uKHRvb2wpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZi5pbnB1dFNjaGVtYSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIGlucHV0U2NoZW1hIHdoZW4gbm90IHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0XHRpZDogJ215VG9vbCcsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnbXlUb29sJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdNeSBUb29sJyxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0EgdG9vbCcsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBkZWYgPSB0b29sRGF0YVRvRGVmaW5pdGlvbih0b29sKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWYuaW5wdXRTY2hlbWEsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFx1MjUwMFx1MjUwMCB0b29sUmVzdWx0VG9Qcm90b2NvbCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXHRzdWl0ZSgndG9vbFJlc3VsdFRvUHJvdG9jb2wnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBzdWNjZXNzZnVsIHJlc3VsdCB3aXRoIHRleHQgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdBbGwgNSB0ZXN0cyBwYXNzZWQnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlOiAnUmFuIDUgdGVzdHMnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJvdG8gPSB0b29sUmVzdWx0VG9Qcm90b2NvbChyZXN1bHQsICdydW5UZXN0cycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3RvLCB7XG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gNSB0ZXN0cycsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnQWxsIDUgdGVzdHMgcGFzc2VkJyB9XSxcblx0XHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgcHJvbXB0IFRTWCByZXN1bHRzIHRvIHRleHQgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3Byb21wdFRzeCcsXG5cdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdG5vZGU6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0Tm9kZVR5cGUuUGllY2UsXG5cdFx0XHRcdFx0XHRcdGN0b3I6IFBpZWNlQ3RvcktpbmQuT3RoZXIsXG5cdFx0XHRcdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiBQcm9tcHROb2RlVHlwZS5UZXh0LCB0ZXh0OiAnPGRpYWdub3N0aWNzPicsIGxpbmVCcmVha0JlZm9yZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiBQcm9tcHROb2RlVHlwZS5UZXh0LCB0ZXh0OiAnMSBwcm9ibGVtIGZvdW5kJywgbGluZUJyZWFrQmVmb3JlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiBQcm9tcHROb2RlVHlwZS5UZXh0LCB0ZXh0OiAnPC9kaWFnbm9zdGljcz4nLCBsaW5lQnJlYWtCZWZvcmU6IHRydWUgfSxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlOiAnQ2hlY2tlZCBtYXRoLmpzLCAxIHByb2JsZW0gZm91bmQnLFxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sUmVzdWx0VG9Qcm90b2NvbChyZXN1bHQsICdwcm9ibGVtcycpLCB7XG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdDaGVja2VkIG1hdGguanMsIDEgcHJvYmxlbSBmb3VuZCcsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsXG5cdFx0XHRcdFx0dGV4dDogJzxkaWFnbm9zdGljcz5cXG4xIHByb2JsZW0gZm91bmRcXG48L2RpYWdub3N0aWNzPicsXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBmYWlsZWQgcmVzdWx0IHdpdGggZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUb29sUmVzdWx0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnQnVpbGQgZmFpbGVkJyB9XSxcblx0XHRcdFx0dG9vbFJlc3VsdEVycm9yOiAnQ29tcGlsYXRpb24gZXJyb3IgaW4gZmlsZS50cycsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcm90byA9IHRvb2xSZXN1bHRUb1Byb3RvY29sKHJlc3VsdCwgJ3J1blRhc2snKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm90bywge1xuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ3J1blRhc2sgZmFpbGVkJyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdCdWlsZCBmYWlsZWQnIH1dLFxuXHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiAnQ29tcGlsYXRpb24gZXJyb3IgaW4gZmlsZS50cycgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBkZWZhdWx0IHBhc3QgdGVuc2UgbWVzc2FnZSB3aGVuIHRvb2xSZXN1bHRNZXNzYWdlIGlzIGFic2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdkb25lJyB9XSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb3RvID0gdG9vbFJlc3VsdFRvUHJvdG9jb2wocmVzdWx0LCAnbXlUb29sJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdG8ucGFzdFRlbnNlTWVzc2FnZSwgJ1JhbiBteVRvb2wnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBtYXJrZG93biB0b29sIHJlc3VsdCBtZXNzYWdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKCdPcGVuZWQgW0Jyb3dzZXJdKHZzY29kZS1icm93c2VyOi9wYWdlLTE/dnNjb2RlTGlua1R5cGU9YnJvd3NlciknKSxcblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbFJlc3VsdFRvUHJvdG9jb2wocmVzdWx0LCAnb3Blbl9icm93c2VyX3BhZ2UnKS5wYXN0VGVuc2VNZXNzYWdlLCB7XG5cdFx0XHRcdG1hcmtkb3duOiAnT3BlbmVkIFtCcm93c2VyXSh2c2NvZGUtYnJvd3NlcjovcGFnZS0xP3ZzY29kZUxpbmtUeXBlPWJyb3dzZXIpJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgdGV4dCBhbmQgZGF0YSBjb250ZW50IHBhcnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmluYXJ5RGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbGxvIGJpbmFyeScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJVG9vbFJlc3VsdCA9IHtcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsga2luZDogJ3RleHQnLCB2YWx1ZTogJ2hlbGxvJyB9LFxuXHRcdFx0XHRcdHsga2luZDogJ2RhdGEnLCB2YWx1ZTogeyBtaW1lVHlwZTogJ2ltYWdlL3BuZycsIGRhdGE6IGJpbmFyeURhdGEgfSB9LFxuXHRcdFx0XHRcdHsga2luZDogJ3RleHQnLCB2YWx1ZTogJ3dvcmxkJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcHJvdG8gPSB0b29sUmVzdWx0VG9Qcm90b2NvbChyZXN1bHQsICd0b29sJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdG8uY29udGVudD8ubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdG8uY29udGVudCFbMF0sIHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdoZWxsbycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdG8uY29udGVudCFbMV0udHlwZSwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChwcm90by5jb250ZW50IVsxXSBhcyB7IGNvbnRlbnRUeXBlOiBzdHJpbmcgfSkuY29udGVudFR5cGUsICdpbWFnZS9wbmcnKTtcblx0XHRcdC8vIFZlcmlmeSBkYXRhIGlzIGJhc2U2NC1lbmNvZGVkLCBub3QgcmF3IFVURi04XG5cdFx0XHRjb25zdCBlbWJlZGRlZERhdGEgPSAocHJvdG8uY29udGVudCFbMV0gYXMgeyBkYXRhOiBzdHJpbmcgfSkuZGF0YTtcblx0XHRcdGFzc2VydC5vayhlbWJlZGRlZERhdGEubGVuZ3RoID4gMCk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZW1iZWRkZWREYXRhLCAnaGVsbG8gYmluYXJ5Jyk7IC8vIHNob3VsZCBiZSBiYXNlNjQsIG5vdCByYXcgdGV4dFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm90by5jb250ZW50IVsyXSwgeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ3dvcmxkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnZlcnRzIGRhdGEgcGFydHMgdG8gRW1iZWRkZWRSZXNvdXJjZSB3aXRoIGJhc2U2NCBlbmNvZGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJpbmFyeURhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCd0ZXN0IGRhdGEnKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IGtpbmQ6ICdkYXRhJywgdmFsdWU6IHsgbWltZVR5cGU6ICdpbWFnZS9wbmcnLCBkYXRhOiBiaW5hcnlEYXRhIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb3RvID0gdG9vbFJlc3VsdFRvUHJvdG9jb2wocmVzdWx0LCAndG9vbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3RvLmNvbnRlbnQ/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdG8uY29udGVudCFbMF0udHlwZSwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgZW1iZWRkZWQgPSBwcm90by5jb250ZW50IVswXSBhcyB7IGRhdGE6IHN0cmluZzsgY29udGVudFR5cGU6IHN0cmluZyB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVtYmVkZGVkLmNvbnRlbnRUeXBlLCAnaW1hZ2UvcG5nJyk7XG5cdFx0XHRhc3NlcnQub2soZW1iZWRkZWQuZGF0YS5sZW5ndGggPiAwKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChlbWJlZGRlZC5kYXRhLCAndGVzdCBkYXRhJyk7IC8vIGJhc2U2NCBlbmNvZGVkXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGJvb2xlYW4gdG9vbFJlc3VsdEVycm9yIGFzIGdlbmVyaWMgZXJyb3IgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0XHR0b29sUmVzdWx0RXJyb3I6IHRydWUsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcm90byA9IHRvb2xSZXN1bHRUb1Byb3RvY29sKHJlc3VsdCwgJ215VG9vbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3RvLnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm90by5lcnJvcj8ubWVzc2FnZSwgJ215VG9vbCBlbmNvdW50ZXJlZCBhbiBlcnJvcicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBcdTI1MDBcdTI1MDAgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIgY2xpZW50IHRvb2xzIGludGVncmF0aW9uIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdHN1aXRlKCdjbGllbnQgdG9vbHMgcmVnaXN0cmF0aW9uJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9ja1Rvb2xzU2VydmljZShkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b29sczogSVRvb2xEYXRhW10sIG9wdGlvbnM/OiB7IHJlcXVpcmVDb25maXJtYXRpb24/OiBib29sZWFuOyB0aHJvd0JlZm9yZUNvbmZpcm1hdGlvbj86IEVycm9yOyBpbnZva2VSZXN1bHQ/OiBEZWZlcnJlZFByb21pc2U8SVRvb2xSZXN1bHQ+IH0pIHtcblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlVG9vbHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRjb25zdCBwZW5kaW5nVG9vbENhbGxzID0gbmV3IE1hcDxzdHJpbmcsIENoYXRUb29sSW52b2NhdGlvbj4oKTtcblx0XHRcdGNvbnN0IGJlZ3VuVG9vbENhbGxzOiBDaGF0VG9vbEludm9jYXRpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgaW52b2tlZFRvb2xDYWxsczogSVRvb2xJbnZvY2F0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IGV4ZWN1dGVkVG9vbENhbGxzOiBJVG9vbEludm9jYXRpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvblRva2VuczogQ2FuY2VsbGF0aW9uVG9rZW5bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVjb3JkZWRTdGF0ZUtpbmRzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kW10+KCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvbkRpZENoYW5nZVRvb2xzOiBvbkRpZENoYW5nZVRvb2xzLmV2ZW50LFxuXHRcdFx0XHRnZXRUb29sQnlOYW1lOiAobmFtZTogc3RyaW5nKSA9PiB0b29scy5maW5kKHQgPT4gdC50b29sUmVmZXJlbmNlTmFtZSA9PT0gbmFtZSksXG5cdFx0XHRcdG9ic2VydmVUb29sczogKCkgPT4gb2JzZXJ2YWJsZVZhbHVlKCd0b29scycsIHRvb2xzKSxcblx0XHRcdFx0cmVnaXN0ZXJUb29sRGF0YTogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdHJlZ2lzdGVyVG9vbEltcGxlbWVudGF0aW9uOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0cmVnaXN0ZXJUb29sOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0Z2V0VG9vbHM6ICgpID0+IHRvb2xzLFxuXHRcdFx0XHRnZXRBbGxUb29sc0luY2x1ZGluZ0Rpc2FibGVkOiAoKSA9PiB0b29scyxcblx0XHRcdFx0Z2V0VG9vbDogKGlkOiBzdHJpbmcpID0+IHRvb2xzLmZpbmQodCA9PiB0LmlkID09PSBpZCksXG5cdFx0XHRcdGludm9rZVRvb2w6IGFzeW5jIChpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRcdGludm9rZWRUb29sQ2FsbHMucHVzaChpbnZvY2F0aW9uKTtcblx0XHRcdFx0XHRpbnZvY2F0aW9uVG9rZW5zLnB1c2godG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBwZW5kaW5nVG9vbENhbGxzLmdldChpbnZvY2F0aW9uLmNoYXRTdHJlYW1Ub29sQ2FsbElkID8/IGludm9jYXRpb24uY2FsbElkKTtcblx0XHRcdFx0XHRwZW5kaW5nVG9vbENhbGxzLmRlbGV0ZShpbnZvY2F0aW9uLmNoYXRTdHJlYW1Ub29sQ2FsbElkID8/IGludm9jYXRpb24uY2FsbElkKTtcblx0XHRcdFx0XHRpZiAob3B0aW9ucz8udGhyb3dCZWZvcmVDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHRcdHRocm93IG9wdGlvbnMudGhyb3dCZWZvcmVDb25maXJtYXRpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChvcHRpb25zPy5yZXF1aXJlQ29uZmlybWF0aW9uICYmIHRvb2xJbnZvY2F0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcmVwYXJlZCA9IHtcblx0XHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGBSdW4gJHsoaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIHsgdGFzaz86IHN0cmluZyB9KS50YXNrfWAsXG5cdFx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdFx0XHRcdFx0dGl0bGU6ICdDb25maXJtIHRvb2wgZXhlY3V0aW9uJyxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAnUnVuIHRoZSB0YXNrPycsXG5cdFx0XHRcdFx0XHRcdFx0YXBwcm92ZUNvbWJpbmF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogYEFwcHJvdmUgJHsoaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIHsgdGFzaz86IHN0cmluZyB9KS50YXNrfWAsXG5cdFx0XHRcdFx0XHRcdFx0XHRrZXk6IEpTT04uc3RyaW5naWZ5KGludm9jYXRpb24ucGFyYW1ldGVycyksXG5cdFx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IEpTT04uc3RyaW5naWZ5KGludm9jYXRpb24ucGFyYW1ldGVycyksXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cHJlc2VudGF0aW9uOiBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlLFxuXHRcdFx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0XHRcdFx0a2luZDogJ3NpbXBsZVRvb2xJbnZvY2F0aW9uJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdFx0XHRpbnB1dDogSlNPTi5zdHJpbmdpZnkoaW52b2NhdGlvbi5wYXJhbWV0ZXJzKSxcblx0XHRcdFx0XHRcdFx0XHRvdXRwdXQ6ICcnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdGlmICh0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdFx0XHRcdFx0dG9vbEludm9jYXRpb24udHJhbnNpdGlvbkZyb21TdHJlYW1pbmcocHJlcGFyZWQsIGludm9jYXRpb24ucGFyYW1ldGVycywgaW52b2NhdGlvbi5wcmVBcHByb3ZlZCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0b29sSW52b2NhdGlvbi51cGRhdGVQcmVwYXJlZEludm9jYXRpb24ocHJlcGFyZWQsIGludm9jYXRpb24ucGFyYW1ldGVycyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCBJQ2hhdFRvb2xJbnZvY2F0aW9uLmF3YWl0Q29uZmlybWF0aW9uKHRvb2xJbnZvY2F0aW9uLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRcdC8vIE1pcnJvciB0aGUgcmVhbCBzZXJ2aWNlOiBhIGNhbmNlbGxlZC9kZW5pZWQgY29uZmlybWF0aW9uXG5cdFx0XHRcdFx0XHQvLyBhYm9ydHMgZXhlY3V0aW9uIGluc3RlYWQgb2YgcHJvZHVjaW5nIGEgcmVzdWx0LiBBIHRva2VuXG5cdFx0XHRcdFx0XHQvLyBjYW5jZWxsYXRpb24gcmVzb2x2ZXMgYXMgYERlbmllZGAsIHNvIG1vdmUgdGhlIHN0aWxsLXdhaXRpbmdcblx0XHRcdFx0XHRcdC8vIGludm9jYXRpb24gdG8gYSB0ZXJtaW5hbCBzdGF0ZSBhbmQgcmVqZWN0LlxuXHRcdFx0XHRcdFx0aWYgKGNvbmZpcm1lZC50eXBlID09PSBUb29sQ29uZmlybUtpbmQuRGVuaWVkIHx8IGNvbmZpcm1lZC50eXBlID09PSBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdFx0XHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdFx0XHRcdHN0YXRlLmNvbmZpcm0oY29uZmlybWVkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJlcGFyZWQgPSB0b29sSW52b2NhdGlvbj8udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50J1xuXHRcdFx0XHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcgdGFzaycsXG5cdFx0XHRcdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50JyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUHJlcGFyZWQgZGVsZWdhdGVkIHRhc2snLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR0b29sSW52b2NhdGlvbj8udHJhbnNpdGlvbkZyb21TdHJlYW1pbmcocHJlcGFyZWQsIGludm9jYXRpb24ucGFyYW1ldGVycywgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRleGVjdXRlZFRvb2xDYWxscy5wdXNoKGludm9jYXRpb24pO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSBvcHRpb25zPy5pbnZva2VSZXN1bHRcblx0XHRcdFx0XHRcdD8gYXdhaXQgb3B0aW9ucy5pbnZva2VSZXN1bHQucFxuXHRcdFx0XHRcdFx0OiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdkb25lJyB9XSB9O1xuXHRcdFx0XHRcdGF3YWl0IHRvb2xJbnZvY2F0aW9uPy5kaWRFeGVjdXRlVG9vbChyZXN1bHQpO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJlZ2luVG9vbENhbGw6IG9wdGlvbnMgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2xEYXRhID0gdG9vbHMuZmluZCh0ID0+IHQuaWQgPT09IG9wdGlvbnMudG9vbElkKTtcblx0XHRcdFx0XHRpZiAoIXRvb2xEYXRhKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gQ2hhdFRvb2xJbnZvY2F0aW9uLmNyZWF0ZVN0cmVhbWluZyh7XG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBvcHRpb25zLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHR0b29sSWQ6IG9wdGlvbnMudG9vbElkLFxuXHRcdFx0XHRcdFx0dG9vbERhdGEsXG5cdFx0XHRcdFx0XHRzdWJhZ2VudEludm9jYXRpb25JZDogb3B0aW9ucy5zdWJhZ2VudEludm9jYXRpb25JZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRwZW5kaW5nVG9vbENhbGxzLnNldChvcHRpb25zLnRvb2xDYWxsSWQsIGludm9jYXRpb24pO1xuXHRcdFx0XHRcdGJlZ3VuVG9vbENhbGxzLnB1c2goaW52b2NhdGlvbik7XG5cdFx0XHRcdFx0Ly8gUmVjb3JkIGV2ZXJ5IHN0YXRlIHRoZSBpbnZvY2F0aW9uIHBhc3NlcyB0aHJvdWdoIHNvIHRlc3RzIGNhblxuXHRcdFx0XHRcdC8vIGFzc2VydCBpdCBuZXZlciBmbGlja2VycyBpbnRvIGBXYWl0aW5nRm9yQ29uZmlybWF0aW9uYCB3aGVuXG5cdFx0XHRcdFx0Ly8gdGhlIGNhbGwgaXMgYXV0by1hcHByb3ZlZC5cblx0XHRcdFx0XHRjb25zdCBzdGF0ZUtpbmRzOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZFtdID0gW107XG5cdFx0XHRcdFx0cmVjb3JkZWRTdGF0ZUtpbmRzLnNldChvcHRpb25zLnRvb2xDYWxsSWQsIHN0YXRlS2luZHMpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRzdGF0ZUtpbmRzLnB1c2goaW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcikudHlwZSk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdHJldHVybiBpbnZvY2F0aW9uO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cGRhdGVUb29sU3RyZWFtOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGNhbmNlbFRvb2xDYWxsc0ZvclJlcXVlc3Q6ICgpID0+IHsgfSxcblx0XHRcdFx0Zmx1c2hUb29sVXBkYXRlczogKCkgPT4geyB9LFxuXHRcdFx0XHR0b29sU2V0czogb2JzZXJ2YWJsZVZhbHVlKCdzZXRzJywgW10pLFxuXHRcdFx0XHRnZXRUb29sU2V0c0Zvck1vZGVsOiAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0VG9vbFNldDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRnZXRUb29sU2V0QnlOYW1lOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGNyZWF0ZVRvb2xTZXQ6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbCcpOyB9LFxuXHRcdFx0XHRnZXRGdWxsUmVmZXJlbmNlTmFtZXM6ICgpID0+IFtdLFxuXHRcdFx0XHRnZXRGdWxsUmVmZXJlbmNlTmFtZTogKCkgPT4gJycsXG5cdFx0XHRcdGdldEZ1bGxSZWZlcmVuY2VOYW1lTWFwOiAoKSA9PiBuZXcgTWFwKCksXG5cdFx0XHRcdGdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldERlcHJlY2F0ZWRGdWxsUmVmZXJlbmNlTmFtZXM6ICgpID0+IG5ldyBNYXAoKSxcblx0XHRcdFx0dG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXA6ICgpID0+IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbXSksXG5cdFx0XHRcdHRvRnVsbFJlZmVyZW5jZU5hbWVzOiAoKSA9PiBbXSxcblx0XHRcdFx0dG9Ub29sUmVmZXJlbmNlczogKCkgPT4gW10sXG5cdFx0XHRcdHZzY29kZVRvb2xTZXQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdGV4ZWN1dGVUb29sU2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRyZWFkVG9vbFNldDogdW5kZWZpbmVkISxcblx0XHRcdFx0YWdlbnRUb29sU2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRvbkRpZFByZXBhcmVUb29sQ2FsbEJlY29tZVVucmVzcG9uc2l2ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZva2VUb29sOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGZpcmVPbkRpZENoYW5nZVRvb2xzOiAoKSA9PiBvbkRpZENoYW5nZVRvb2xzLmZpcmUoKSxcblx0XHRcdFx0YmVndW5Ub29sQ2FsbHMsXG5cdFx0XHRcdGludm9rZWRUb29sQ2FsbHMsXG5cdFx0XHRcdGV4ZWN1dGVkVG9vbENhbGxzLFxuXHRcdFx0XHRpbnZvY2F0aW9uVG9rZW5zLFxuXHRcdFx0XHRyZWNvcmRlZFN0YXRlS2luZHMsXG5cdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSAmIHsgZmlyZU9uRGlkQ2hhbmdlVG9vbHM6ICgpID0+IHZvaWQ7IGJlZ3VuVG9vbENhbGxzOiBDaGF0VG9vbEludm9jYXRpb25bXTsgaW52b2tlZFRvb2xDYWxsczogSVRvb2xJbnZvY2F0aW9uW107IGV4ZWN1dGVkVG9vbENhbGxzOiBJVG9vbEludm9jYXRpb25bXTsgaW52b2NhdGlvblRva2VuczogQ2FuY2VsbGF0aW9uVG9rZW5bXTsgcmVjb3JkZWRTdGF0ZUtpbmRzOiBNYXA8c3RyaW5nLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZFtdPiB9O1xuXHRcdH1cblxuXHRcdGNsYXNzIE1vY2tBZ2VudEhvc3RDb25uZWN0aW9uIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNsaWVudElkID0gJ3Rlc3QtY2xpZW50Jztcblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpKTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gdGhpcy5fb25EaWRBY3Rpb24uZXZlbnQ7XG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5vdGlmaWNhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJTm90aWZpY2F0aW9uPigpKTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uID0gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkFnZW50SG9zdEV4aXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25BZ2VudEhvc3RTdGFydCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpbml0aWFsaXplUmVzdWx0ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX2xpdmVTdWJzY3JpcHRpb25zID0gbmV3IE1hcDxzdHJpbmcsIHsgc3RhdGU6IFNlc3Npb25TdGF0ZSB8IENoYXRTdGF0ZTsgZW1pdHRlcjogRW1pdHRlcjxTZXNzaW9uU3RhdGUgfCBDaGF0U3RhdGU+IH0+KCk7XG5cdFx0XHRwdWJsaWMgZGlzcGF0Y2hlZEFjdGlvbnM6IHsgY2hhbm5lbDogc3RyaW5nOyBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiB9W10gPSBbXTtcblx0XHRcdHB1YmxpYyByZWFkb25seSByZXNvdXJjZVJlYWRVcmlzOiBVUklbXSA9IFtdO1xuXHRcdFx0cHVibGljIHJlc291cmNlUmVhZERhdGEgPSAne1widGFza1wiOlwiYnVpbGRcIn0nO1xuXHRcdFx0cHVibGljIHJlc291cmNlUmVhZEVuY29kaW5nID0gQ29udGVudEVuY29kaW5nLlV0Zjg7XG5cdFx0XHRwdWJsaWMgcmVhZG9ubHkgcmVzb3VyY2VSZWFkUmVzcG9uc2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8eyBkYXRhOiBzdHJpbmc7IGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcgfT4+KCk7XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlc291cmNlUmVhZCh1cmk6IFVSSSkge1xuXHRcdFx0XHR0aGlzLnJlc291cmNlUmVhZFVyaXMucHVzaCh1cmkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZXNvdXJjZVJlYWRSZXNwb25zZXMuZ2V0KHVyaS50b1N0cmluZygpKVxuXHRcdFx0XHRcdD8/IHsgZGF0YTogdGhpcy5yZXNvdXJjZVJlYWREYXRhLCBlbmNvZGluZzogdGhpcy5yZXNvdXJjZVJlYWRFbmNvZGluZyB9O1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuZGlzcGF0Y2hlZEFjdGlvbnMucHVzaCh7IGNoYW5uZWwsIGFjdGlvbiB9KTtcblx0XHRcdFx0aWYgKGlzU2Vzc2lvbkFjdGlvbihhY3Rpb24pIHx8IGlzQ2hhdEFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy5hcHBseVNlc3Npb25BY3Rpb24oY2hhbm5lbCwgYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhcHBseVNlc3Npb25BY3Rpb24oY2hhbm5lbDogc3RyaW5nIHwgVVJJLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IGNoYW5uZWxTdHIgPSB0eXBlb2YgY2hhbm5lbCA9PT0gJ3N0cmluZycgPyBjaGFubmVsIDogY2hhbm5lbC50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAoaXNDaGF0QWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdFx0XHRjb25zdCBjaGF0Q2hhbm5lbCA9IHBhcnNlRGVmYXVsdENoYXRVcmkoY2hhbm5lbFN0cikgIT09IHVuZGVmaW5lZCA/IGNoYW5uZWxTdHIgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGNoYXRDaGFubmVsLCBgY2hhdCBhY3Rpb25zIG11c3QgYmUgZGlzcGF0Y2hlZCBvbiBhbiBhaHAtY2hhdCBjaGFubmVsOiAke2FjdGlvbi50eXBlfWApO1xuXHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW5zdXJlTGl2ZVN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuQ2hhdCwgY2hhdENoYW5uZWwpO1xuXHRcdFx0XHRcdGVudHJ5LnN0YXRlID0gY2hhdFJlZHVjZXIoZW50cnkuc3RhdGUgYXMgQ2hhdFN0YXRlLCBhY3Rpb24gYXMgUGFyYW1ldGVyczx0eXBlb2YgY2hhdFJlZHVjZXI+WzFdLCAoKSA9PiB7IH0pO1xuXHRcdFx0XHRcdGVudHJ5LmVtaXR0ZXIuZmlyZShlbnRyeS5zdGF0ZSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW5zdXJlTGl2ZVN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgY2hhbm5lbFN0cik7XG5cdFx0XHRcdGVudHJ5LnN0YXRlID0gc2Vzc2lvblJlZHVjZXIoZW50cnkuc3RhdGUgYXMgU2Vzc2lvblN0YXRlLCBhY3Rpb24gYXMgUGFyYW1ldGVyczx0eXBlb2Ygc2Vzc2lvblJlZHVjZXI+WzFdLCAoKSA9PiB7IH0pO1xuXHRcdFx0XHRlbnRyeS5lbWl0dGVyLmZpcmUoZW50cnkuc3RhdGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSByZWFkb25seSByb290U3RhdGU6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+ID0ge1xuXHRcdFx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR2ZXJpZmllZFZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdH07XG5cblx0XHRcdG92ZXJyaWRlIGdldFN1YnNjcmlwdGlvbjxUPihraW5kOiBTdGF0ZUNvbXBvbmVudHMsIHJlc291cmNlOiBVUkkpOiBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxUPj4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZVN0ciA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdHRoaXMuX2Vuc3VyZUxpdmVTdWJzY3JpcHRpb24oa2luZCwgcmVzb3VyY2VTdHIpO1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2xpdmVTdWJzY3JpcHRpb25zLmdldChyZXNvdXJjZVN0cikhO1xuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZW50cnkuZW1pdHRlciBhcyB1bmtub3duIGFzIEVtaXR0ZXI8VD47XG5cblx0XHRcdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0XHRcdGNvbnN0IHN1YjogSUFnZW50U3Vic2NyaXB0aW9uPFQ+ID0ge1xuXHRcdFx0XHRcdGdldCB2YWx1ZSgpIHsgcmV0dXJuIHNlbGYuX2xpdmVTdWJzY3JpcHRpb25zLmdldChyZXNvdXJjZVN0cik/LnN0YXRlIGFzIHVua25vd24gYXMgVDsgfSxcblx0XHRcdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX2xpdmVTdWJzY3JpcHRpb25zLmdldChyZXNvdXJjZVN0cik/LnN0YXRlIGFzIHVua25vd24gYXMgVDsgfSxcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9iamVjdDogc3ViLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xpdmVTdWJzY3JpcHRpb25zLmRlbGV0ZShyZXNvdXJjZVN0cik7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cHJpdmF0ZSBfZW5zdXJlTGl2ZVN1YnNjcmlwdGlvbihraW5kOiBTdGF0ZUNvbXBvbmVudHMsIHJlc291cmNlU3RyOiBzdHJpbmcpOiB7IHN0YXRlOiBTZXNzaW9uU3RhdGUgfCBDaGF0U3RhdGU7IGVtaXR0ZXI6IEVtaXR0ZXI8U2Vzc2lvblN0YXRlIHwgQ2hhdFN0YXRlPiB9IHtcblx0XHRcdFx0bGV0IGVudHJ5ID0gdGhpcy5fbGl2ZVN1YnNjcmlwdGlvbnMuZ2V0KHJlc291cmNlU3RyKTtcblx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGVudHJ5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8U2Vzc2lvblN0YXRlIHwgQ2hhdFN0YXRlPigpKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0ga2luZCA9PT0gU3RhdGVDb21wb25lbnRzLkNoYXQgPyBwYXJzZURlZmF1bHRDaGF0VXJpKHJlc291cmNlU3RyKSA6IHJlc291cmNlU3RyO1xuXHRcdFx0XHRhc3NlcnQub2soc2Vzc2lvblJlc291cmNlLCBgY2hhdCBzdWJzY3JpcHRpb25zIG11c3QgdXNlIGFuIGFocC1jaGF0IGNoYW5uZWw6ICR7cmVzb3VyY2VTdHJ9YCk7XG5cdFx0XHRcdGNvbnN0IHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5ID0ge1xuXHRcdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxTdGF0ZSA9IGtpbmQgPT09IFN0YXRlQ29tcG9uZW50cy5DaGF0XG5cdFx0XHRcdFx0PyBjcmVhdGVDaGF0U3RhdGUoY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5KHN1bW1hcnksIHJlc291cmNlU3RyKSlcblx0XHRcdFx0XHQ6IHtcblx0XHRcdFx0XHRcdC4uLmNyZWF0ZVNlc3Npb25TdGF0ZShzdW1tYXJ5KSxcblx0XHRcdFx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdFx0XHRcdGRlZmF1bHRDaGF0LFxuXHRcdFx0XHRcdFx0Y2hhdHM6IFtjcmVhdGVEZWZhdWx0Q2hhdFN1bW1hcnkoc3VtbWFyeSwgZGVmYXVsdENoYXQpXSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRlbnRyeSA9IHsgc3RhdGU6IGluaXRpYWxTdGF0ZSwgZW1pdHRlciB9O1xuXHRcdFx0XHR0aGlzLl9saXZlU3Vic2NyaXB0aW9ucy5zZXQocmVzb3VyY2VTdHIsIGVudHJ5KTtcblx0XHRcdFx0cmV0dXJuIGVudHJ5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoXG5cdFx0XHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdFx0dG9vbHM6IElUb29sRGF0YVtdLFxuXHRcdFx0dG9vbFNlcnZpY2VPcHRpb25zPzogeyByZXF1aXJlQ29uZmlybWF0aW9uPzogYm9vbGVhbjsgdGhyb3dCZWZvcmVDb25maXJtYXRpb24/OiBFcnJvcjsgaW52b2tlUmVzdWx0PzogRGVmZXJyZWRQcm9taXNlPElUb29sUmVzdWx0PiB9LFxuXHRcdCkge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBuZXcgTW9ja0FnZW50SG9zdENvbm5lY3Rpb24oKTtcblxuXHRcdFx0Y29uc3QgdG9vbHNTZXJ2aWNlID0gY3JlYXRlTW9ja1Rvb2xzU2VydmljZShkaXNwb3NhYmxlcywgdG9vbHMsIHRvb2xTZXJ2aWNlT3B0aW9ucyk7XG5cdFx0XHRjb25zdCBjb25maWdWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZUNvbmZpZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpKTtcblx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2U6IFBhcnRpYWw8SUNvbmZpZ3VyYXRpb25TZXJ2aWNlPiA9IHtcblx0XHRcdFx0Z2V0VmFsdWU6IChrZXk6IHN0cmluZykgPT4gY29uZmlnVmFsdWVzW2tleV0sXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogb25EaWRDaGFuZ2VDb25maWcuZXZlbnQsXG5cdFx0XHR9IGFzIFBhcnRpYWw8SUNvbmZpZ3VyYXRpb25TZXJ2aWNlPjtcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZHVjdFNlcnZpY2UsIHsgcXVhbGl0eTogJ2luc2lkZXInIH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgeyBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LkZyZWUsIHF1b3Rhczoge30gfSBhcyBQYXJ0aWFsPElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlPiBhcyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0QWdlbnRTZXJ2aWNlLCB7XG5cdFx0XHRcdHJlZ2lzdGVyRHluYW1pY0FnZW50OiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIFRlc3RGaWxlU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIE1vY2tMYWJlbFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwge1xuXHRcdFx0XHRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXI6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbjogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB7XG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURlZmF1bHRBY2NvdW50U2VydmljZSwgeyBvbkRpZENoYW5nZURlZmF1bHRBY2NvdW50OiBFdmVudC5Ob25lLCBnZXREZWZhdWx0QWNjb3VudDogYXN5bmMgKCkgPT4gbnVsbCB9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgeyBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudC5Ob25lIH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB7XG5cdFx0XHRcdGRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJT3V0cHV0U2VydmljZSwgeyBnZXRDaGFubmVsOiAoKSA9PiB1bmRlZmluZWQgfSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgeyBnZXRXb3Jrc3BhY2U6ICgpID0+ICh7IGlkOiAnJywgZm9sZGVyczogW10gfSksIGdldFdvcmtzcGFjZUZvbGRlcjogKCkgPT4gbnVsbCB9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRFZGl0aW5nU2VydmljZSwge1xuXHRcdFx0XHRyZWdpc3RlckVkaXRpbmdTZXNzaW9uUHJvdmlkZXI6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsIHtcblx0XHRcdFx0cmVnaXN0ZXJQcm92aWRlcjogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCB7XG5cdFx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0b25EaWRDcmVhdGVNb2RlbDogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVtb3ZlUGVuZGluZ1JlcXVlc3Q6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UsIHtcblx0XHRcdFx0cmVnaXN0ZXJBdXRob3JpdHk6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHRlbnN1cmVTeW5jZWRDdXN0b21pemF0aW9uUHJvdmlkZXI6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIG5ldyBOdWxsQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlLCB7XG5cdFx0XHRcdHNldDogKCkgPT4geyB9LFxuXHRcdFx0XHR0YWtlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbmFtZTogKCkgPT4geyB9LFxuXHRcdFx0fSBhcyBQYXJ0aWFsPElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZT4gYXMgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwge1xuXHRcdFx0XHRyZWdpc3RlckV4dGVybmFsSGFybmVzczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luU2VydmljZSwge1xuXHRcdFx0XHRwbHVnaW5zOiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbnMnLCBbXSksXG5cdFx0XHR9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9tcHRzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTa2lsbHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUluc3RydWN0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWdlbnRJbnN0cnVjdGlvbnMgPSBFdmVudC5Ob25lO1xuXG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxDaGF0U2VydmljZSwge1xuXHRcdFx0XHRvbkRpZENvbnRpbnVlSW5CYWNrZ3JvdW5kOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlclRlcm1pbmFsSW5zdGFuY2VXaXRoVG9vbFNlc3Npb246ICgpID0+IHsgfSxcblx0XHRcdFx0Z2V0QWhwQ29tbWFuZFNvdXJjZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UsIHtcblx0XHRcdFx0cmV2aXZlVGVybWluYWw6IGFzeW5jICgpID0+IHVuZGVmaW5lZCEsXG5cdFx0XHRcdGNyZWF0ZVRlcm1pbmFsRm9yRW50cnk6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvZmlsZXM6IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIFtdKSxcblx0XHRcdFx0Z2V0UHJvZmlsZUZvckNvbm5lY3Rpb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVnaXN0ZXJFbnRyeTogKCkgPT4gKHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciwge1xuXHRcdFx0XHRyZWdpc3RlclJlc29sdmVyOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0cmVzb2x2ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRpc05ld1Nlc3Npb246ICgpID0+IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVN5bmNocm9uaXplciwge1xuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdHJlY29uY2lsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0fSBhcyBQYXJ0aWFsPElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVN5bmNocm9uaXplcj4gYXMgSUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U3luY2hyb25pemVyKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSwge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0Z2V0OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldEluaXRpYWxTZXNzaW9uQ29uZmlnOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHdhaXRGb3JQZW5kaW5nOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldE9yQ3JlYXRlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGFwcGx5Q29uZmlnQ2hhbmdlOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHRyeVJlYmluZDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRkaXNwb3NlU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRnZXRSZXNvbHZlZENvbmZpZzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWZyZXNoUmVzb2x2ZWRDb25maWc6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdH0gYXMgUGFydGlhbDxJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlPiBhcyBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHRvb2xzU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UsIHtcblx0XHRcdFx0b2JzZXJ2ZTogKCkgPT4gY29uc3RPYnNlcnZhYmxlPElUb29sRW5hYmxlbWVudFN0YXRlPih7IHRvb2xTZXRzOiBuZXcgTWFwKCksIHRvb2xzOiBuZXcgTWFwKCkgfSksXG5cdFx0XHRcdGdldFN0YXRlOiAoKSA9PiAoeyB0b29sU2V0czogbmV3IE1hcCgpLCB0b29sczogbmV3IE1hcCgpIH0pLFxuXHRcdFx0XHRzZXRUb29sU2V0RW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdFx0XHRzZXRUb29sRW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFVzZSB0aGUgcmVhbCBhY3RpdmUtY2xpZW50IHNlcnZpY2Ugc28gdGhlIGhhbmRsZXIncyB0b29scyBhdXRvcnVuXG5cdFx0XHQvLyBvYnNlcnZlcyB0aGUgbW9ja2VkIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHRvb2wgc2V0cy5cblx0XHRcdGNvbnN0IGFjdGl2ZUNsaWVudFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSwgYWN0aXZlQ2xpZW50U2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGhhbmRsZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIsIHtcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90JyBhcyBjb25zdCxcblx0XHRcdFx0YWdlbnRJZDogJ2FnZW50LWhvc3QtY29waWxvdCcsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiAnYWdlbnQtaG9zdC1jb3BpbG90Jyxcblx0XHRcdFx0ZnVsbE5hbWU6ICdUZXN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0Jyxcblx0XHRcdFx0Y29ubmVjdGlvbixcblx0XHRcdFx0Y29ubmVjdGlvbkF1dGhvcml0eTogJ2xvY2FsJyxcblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlLCBjb25maWdWYWx1ZXMsIG9uRGlkQ2hhbmdlQ29uZmlnIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVzdFJ1blRlc3RzVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd2c2NvZGUucnVuVGVzdHMnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdydW5UZXN0cycsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUZXN0cycsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUnVucyB1bml0IHRlc3RzJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBmaWxlczogeyB0eXBlOiAnYXJyYXknIH0gfSB9LFxuXHRcdH07XG5cblx0XHRjb25zdCB0ZXN0UnVuVGFza1Rvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndnNjb2RlLnJ1blRhc2snLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdydW5UYXNrJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1J1bnMgYSBWUyBDb2RlIHRhc2snLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IHRhc2s6IHsgdHlwZTogJ3N0cmluZycgfSB9IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRlc3RTdWJhZ2VudFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAncnVuU3ViYWdlbnQnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0YXNrJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFN1YmFnZW50Jyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdSdW5zIGEgZGVsZWdhdGVkIHRhc2snLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdH07XG5cblx0XHRjb25zdCB0ZXN0VW5saXN0ZWRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3ZzY29kZS5yZWFkRmlsZScsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3JlYWRGaWxlJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZCBGaWxlJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdSZWFkcyBhIGZpbGUnLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdGVzdFRvb2xTZWFyY2hUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3ZzY29kZS50b29sU2VhcmNoJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ1NlYXJjaCBUb29scycsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnU2VhcmNoZXMgZm9yIHRvb2xzJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBxdWVyeTogeyB0eXBlOiAnc3RyaW5nJyB9IH0gfSxcblx0XHR9O1xuXG5cdFx0Ly8gQSB0b29sIHRoYXQgbWlnaHQgYXNrIGZvciBwcmUtYXBwcm92YWw6IHRoZSBoYW5kbGVyIHRyZWF0cyBpdCBhc1xuXHRcdC8vIHJlcXVpcmluZyBjb25maXJtYXRpb24sIHNvIGFuIHVuY2xhaW1lZCBjYWxsIHdhaXRzIGZvciBhbiBvYnNlcnZlci5cblx0XHRjb25zdCB0ZXN0Q29uZmlybVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAndnNjb2RlLmRlbGV0ZUFsbCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2RlbGV0ZUFsbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0RlbGV0ZSBFdmVyeXRoaW5nJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdBIGRlc3RydWN0aXZlIGFjdGlvbiB0aGF0IG5lZWRzIGNvbmZpcm1hdGlvbicsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0Y2FuUmVxdWVzdFByZUFwcHJvdmFsOiB0cnVlLFxuXHRcdFx0aW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0fTtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHByb3ZpZGVTZXNzaW9uV2l0aFJlYWR5UnVuVGFza1Rvb2woaGFuZGxlcjogQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIsIGNvbm5lY3Rpb246IE1vY2tBZ2VudEhvc3RDb25uZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIHRoZSB0YXNrJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIFRhc2snLFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhcHBseVJ1bm5pbmdDbGllbnRFeGVjdXRpb24oY29ubmVjdGlvbiwgYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbiksICd0dXJuLTEnLCB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRUb29sQ2FsbENvbmZpcm1hdGlvbkFuZENvbXBsZXRpb25BY3Rpb25zKGNvbm5lY3Rpb246IE1vY2tBZ2VudEhvc3RDb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9uc1xuXHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdFx0JiYgKGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCB8fCBlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSlcblx0XHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ3Rvb2wtY2FsbC0xJylcblx0XHRcdFx0Lm1hcChlbnRyeSA9PiB7XG5cdFx0XHRcdFx0aWYgKGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogZW50cnkuYWN0aW9uLnR5cGUsXG5cdFx0XHRcdFx0XHRcdGFwcHJvdmVkOiBlbnRyeS5hY3Rpb24uYXBwcm92ZWQsXG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogZW50cnkuYWN0aW9uLnR5cGUsXG5cdFx0XHRcdFx0XHRcdGFwcHJvdmVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGVudHJ5LmFjdGlvbi5yZXN1bHQuc3VjY2Vzcyxcblx0XHRcdFx0XHRcdFx0ZXJyb3I6IGVudHJ5LmFjdGlvbi5yZXN1bHQuZXJyb3I/Lm1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgYWN0aW9uIHR5cGU6ICR7ZW50cnkuYWN0aW9uLnR5cGV9YCk7XG5cdFx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFRoZSB3YXRjaGVyIGlzIHRoZSBzaW5nbGUgcG9pbnQgb2YgdHJ1dGggZm9yIGNsaWVudC10b29sIGV4ZWN1dGlvbjpcblx0XHQvLyBpdCBvbmx5IGFjdHMgb24gYSBgVG9vbENsaWVudEV4ZWN1dGlvbmAgYmxvY2tlci4gVGVzdHMgdGhhdCBkcml2ZSBhXG5cdFx0Ly8gY2xpZW50IHRvb2wgdGhyb3VnaCBhIGNoYXQgdHVybiBtdXN0IHRoZXJlZm9yZSBhbHNvIHN1cmZhY2UgdGhlXG5cdFx0Ly8gbWF0Y2hpbmcgcnVubmluZyByZWNvcmQgc28gdGhlIHRvb2wgYWN0dWFsbHkgcnVucy5cblx0XHRmdW5jdGlvbiBhcHBseVJ1bm5pbmdDbGllbnRFeGVjdXRpb24oXG5cdFx0XHRjb25uZWN0aW9uOiBNb2NrQWdlbnRIb3N0Q29ubmVjdGlvbixcblx0XHRcdGNoYXQ6IHN0cmluZyxcblx0XHRcdHR1cm5JZDogc3RyaW5nLFxuXHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0dG9vbENhbGxJZDogc3RyaW5nO1xuXHRcdFx0XHR0b29sTmFtZTogc3RyaW5nO1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogc3RyaW5nO1xuXHRcdFx0XHR0b29sSW5wdXQ6IFRvb2xJbnB1dDtcblx0XHRcdFx0Y29uZmlybWVkPzogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb247XG5cdFx0XHRcdF9tZXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHR9LFxuXHRcdCk6IHZvaWQge1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRTZXQsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRpZDogYGV4ZWMtJHt0b29sQ2FsbC50b29sQ2FsbElkfWAsXG5cdFx0XHRcdFx0a2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENsaWVudEV4ZWN1dGlvbixcblx0XHRcdFx0XHRjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCxcblx0XHRcdFx0XHRjaGF0LFxuXHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogdG9vbENhbGwudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiB0b29sQ2FsbC50b29sTmFtZSxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiB0b29sQ2FsbC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB0b29sQ2FsbC5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogdG9vbENhbGwudG9vbElucHV0LFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiB0b29sQ2FsbC5jb25maXJtZWQgPz8gVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0XHRcdFx0Li4uKHRvb2xDYWxsLl9tZXRhID8geyBfbWV0YTogdG9vbENhbGwuX21ldGEgfSA6IHt9KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gYXBwbHlSZWZlcmVuY2VkUnVuVGFzayhcblx0XHRcdGNvbm5lY3Rpb246IE1vY2tBZ2VudEhvc3RDb25uZWN0aW9uLFxuXHRcdFx0Y2hhdFVSSTogVVJJLFxuXHRcdFx0dG9vbElucHV0OiBUb29sSW5wdXQsXG5cdFx0XHRjb25maXJtZWQ/OiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbixcblx0XHQpOiB2b2lkIHtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biB0aGUgdGFzaycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQsXG5cdFx0XHRcdC4uLihjb25maXJtZWQgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8geyBjb25maXJtYXRpb25UaXRsZTogJ1J1biBUYXNrJyB9XG5cdFx0XHRcdFx0OiB7IGNvbmZpcm1lZCB9KSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ21hcHMgdG9vbCBkYXRhIHRvIHByb3RvY29sIGRlZmluaXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBjb25uZWN0aW9uIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRlc3RzVG9vbCwgdGVzdFJ1blRhc2tUb29sLCB0ZXN0VW5saXN0ZWRUb29sXSk7XG5cblx0XHRcdC8vIFRoZSBoYW5kbGVyIGRpc3BhdGNoZXMgYWN0aXZlQ2xpZW50U2V0IGluIHRoZSBjb25zdHJ1Y3RvciB3aGVuXG5cdFx0XHQvLyBjdXN0b21pemF0aW9ucyBvYnNlcnZhYmxlIGZpcmVzLCBidXQgaGVyZSBpdCBmaXJlcyBkdXJpbmcgcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudC5cblx0XHRcdC8vIFZlcmlmeSB0b29scyBhcmUgYnVpbHQgY29ycmVjdGx5IGJ5IGNoZWNraW5nIHdoYXQgd291bGQgYmUgZGlzcGF0Y2hlZC5cblx0XHRcdGFzc2VydC5vayhjb25uZWN0aW9uKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoYXQgdGhlIHRvb2wgY29udmVyc2lvbiB3b3JrcyBjb3JyZWN0bHkuXG5cdFx0XHRjb25zdCBydW5UZXN0c0RlZiA9IHRvb2xEYXRhVG9EZWZpbml0aW9uKHRlc3RSdW5UZXN0c1Rvb2wpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1blRlc3RzRGVmLm5hbWUsICdydW5UZXN0cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1blRlc3RzRGVmLnRpdGxlLCAnUnVuIFRlc3RzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuVGVzdHNEZWYuZGVzY3JpcHRpb24sICdSdW5zIHVuaXQgdGVzdHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgdG9vbHMgd2l0aCB3aGVuIGNsYXVzZXMgdmlhIG9ic2VydmVUb29scyBmaWx0ZXJpbmcnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgb2JzZXJ2ZVRvb2xzIG1ldGhvZCBhbHJlYWR5IGZpbHRlcnMgYnkgYHdoZW5gIGNsYXVzZXMuXG5cdFx0XHQvLyBXaGVuIGEgdG9vbCBoYXMgYSBgd2hlbmAgY2xhdXNlIHRoYXQgZG9lc24ndCBtYXRjaCwgaXQgd29uJ3Rcblx0XHRcdC8vIGFwcGVhciBpbiB0aGUgb2JzZXJ2YWJsZSwgYW5kIHRodXMgd29uJ3QgYmUgaW5jbHVkZWQuXG5cdFx0XHQvLyBPdXIgbW9jayBvYnNlcnZlVG9vbHMgcmV0dXJucyBhbGwgdG9vbHMgZGlyZWN0bHksIGJ1dCBpblxuXHRcdFx0Ly8gcHJvZHVjdGlvbiwgdG9vbHMgd2l0aCBub24tbWF0Y2hpbmcgd2hlbiBjbGF1c2VzIGFyZSBleGNsdWRlZFxuXHRcdFx0Ly8gYmVmb3JlIHJlYWNoaW5nIGdldENsaWVudFRvb2xzLlxuXHRcdFx0Y29uc3QgZGVmID0gdG9vbERhdGFUb0RlZmluaXRpb24odGVzdFJ1blRlc3RzVG9vbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmLm5hbWUsICdydW5UZXN0cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW52b2tlcyBhbiBvd25lZCBjbGllbnQgdG9vbCB3aGVuIHJlY29ubmVjdGluZyB0byBhbiBhY3RpdmUgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIHRoZSB0YXNrJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhcHBseVJ1bm5pbmdDbGllbnRFeGVjdXRpb24oY29ubmVjdGlvbiwgYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbiksICd0dXJuLTEnLCB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxscy5tYXAoY2FsbCA9PiAoe1xuXHRcdFx0XHRjYWxsSWQ6IGNhbGwuY2FsbElkLFxuXHRcdFx0XHR0b29sSWQ6IGNhbGwudG9vbElkLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiBjYWxsLnBhcmFtZXRlcnMsXG5cdFx0XHRcdGNoYXRTdHJlYW1Ub29sQ2FsbElkOiBjYWxsLmNoYXRTdHJlYW1Ub29sQ2FsbElkLFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRjYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xJZDogJ3ZzY29kZS5ydW5UYXNrJyxcblx0XHRcdFx0cGFyYW1ldGVyczogeyB0YXNrOiAnYnVpbGQnIH0sXG5cdFx0XHRcdGNoYXRTdHJlYW1Ub29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0fV0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMuc29tZShlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZVxuXHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ3Rvb2wtY2FsbC0xJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgYmFzZTY0IHJlZmVyZW5jZWQgaW5wdXQgYmVmb3JlIGludm9raW5nIGFuIG93bmVkIGNsaWVudCB0b29sJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgY2hhdFVSSSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSk7XG5cdFx0XHRjb25zdCB0b29sSW5wdXRVUkkgPSBVUkkucGFyc2UoJ3Nlc3Npb24tZGI6L3Rvb2wtaW5wdXQnKTtcblx0XHRcdGNvbnN0IHRvb2xJbnB1dCA9IHsgdXJpOiB0b29sSW5wdXRVUkkudG9TdHJpbmcoKSwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9O1xuXHRcdFx0Y29ubmVjdGlvbi5yZXNvdXJjZVJlYWREYXRhID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoJ3tcInRhc2tcIjpcImJ1aWxkXCJ9JykpO1xuXHRcdFx0Y29ubmVjdGlvbi5yZXNvdXJjZVJlYWRFbmNvZGluZyA9IENvbnRlbnRFbmNvZGluZy5CYXNlNjQ7XG5cblx0XHRcdGFwcGx5UmVmZXJlbmNlZFJ1blRhc2soY29ubmVjdGlvbiwgY2hhdFVSSSwgdG9vbElucHV0LCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQpO1xuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhcHBseVJ1bm5pbmdDbGllbnRFeGVjdXRpb24oY29ubmVjdGlvbiwgY2hhdFVSSS50b1N0cmluZygpLCAndHVybi0xJywge1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXNvdXJjZVJlYWRVcmlzOiBjb25uZWN0aW9uLnJlc291cmNlUmVhZFVyaXMubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRvb2xzU2VydmljZS5pbnZva2VkVG9vbENhbGxzWzBdPy5wYXJhbWV0ZXJzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNvdXJjZVJlYWRVcmlzOiBbdG9vbElucHV0VVJJLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHRhc2s6ICdidWlsZCcgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2FpdHMgdW50aWwgcmVmZXJlbmNlZCBpbnB1dCBpcyBydW5uaW5nIGJlZm9yZSByZWFkaW5nIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IHJlcXVpcmVDb25maXJtYXRpb246IHRydWUgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpO1xuXHRcdFx0Y29uc3QgdG9vbElucHV0VVJJID0gVVJJLnBhcnNlKCdzZXNzaW9uLWRiOi90b29sLWlucHV0Jyk7XG5cdFx0XHRjb25zdCB0b29sSW5wdXQgPSB7IHVyaTogdG9vbElucHV0VVJJLnRvU3RyaW5nKCksIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicgfTtcblxuXHRcdFx0YXBwbHlSZWZlcmVuY2VkUnVuVGFzayhjb25uZWN0aW9uLCBjaGF0VVJJLCB0b29sSW5wdXQpO1xuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24ucmVzb3VyY2VSZWFkVXJpcy5sZW5ndGgsIDApO1xuXG5cdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKFxuXHRcdFx0XHR0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHMuZmluZChpbnZvY2F0aW9uID0+IGludm9jYXRpb24udG9vbENhbGxJZCA9PT0gJ3Rvb2wtY2FsbC0xJyksXG5cdFx0XHRcdHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSxcblx0XHRcdCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Y29ubmVjdGlvbi5yZXNvdXJjZVJlYWREYXRhID0gJ3tcInRhc2tcIjpcImNvbmZpcm1lZFwifSc7XG5cdFx0XHRhcHBseVJ1bm5pbmdDbGllbnRFeGVjdXRpb24oY29ubmVjdGlvbiwgY2hhdFVSSS50b1N0cmluZygpLCAndHVybi0xJywge1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dCxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc291cmNlUmVhZFVyaXM6IGNvbm5lY3Rpb24ucmVzb3VyY2VSZWFkVXJpcy5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0cGFyYW1ldGVyczogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHNbMF0/LnBhcmFtZXRlcnMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc291cmNlUmVhZFVyaXM6IFt0b29sSW5wdXRVUkkudG9TdHJpbmcoKV0sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgdGFzazogJ2NvbmZpcm1lZCcgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3VwZXJzZWRlcyBhIGh1bmcgcmVmZXJlbmNlZCBpbnB1dCByZWFkIHdoZW4gdGhlIHJlcXVlc3QgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpO1xuXHRcdFx0Y29uc3QgZmlyc3RJbnB1dFVSSSA9IFVSSS5wYXJzZSgnc2Vzc2lvbi1kYjovdG9vbC1pbnB1dC0xJyk7XG5cdFx0XHRjb25zdCBzZWNvbmRJbnB1dFVSSSA9IFVSSS5wYXJzZSgnc2Vzc2lvbi1kYjovdG9vbC1pbnB1dC0yJyk7XG5cdFx0XHRjb25zdCBmaXJzdElucHV0ID0geyB1cmk6IGZpcnN0SW5wdXRVUkkudG9TdHJpbmcoKSwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9O1xuXHRcdFx0Y29uc3Qgc2Vjb25kSW5wdXQgPSB7IHVyaTogc2Vjb25kSW5wdXRVUkkudG9TdHJpbmcoKSwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9O1xuXHRcdFx0Y29ubmVjdGlvbi5yZXNvdXJjZVJlYWRSZXNwb25zZXMuc2V0KGZpcnN0SW5wdXRVUkkudG9TdHJpbmcoKSwgbmV3IERlZmVycmVkUHJvbWlzZTx7IGRhdGE6IHN0cmluZzsgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZyB9PigpLnApO1xuXHRcdFx0Y29ubmVjdGlvbi5yZXNvdXJjZVJlYWRSZXNwb25zZXMuc2V0KHNlY29uZElucHV0VVJJLnRvU3RyaW5nKCksIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdGRhdGE6ICd7XCJ0YXNrXCI6XCJsYXRlc3RcIn0nLFxuXHRcdFx0XHRlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0XHR9KSk7XG5cblx0XHRcdGFwcGx5UmVmZXJlbmNlZFJ1blRhc2soY29ubmVjdGlvbiwgY2hhdFVSSSwgZmlyc3RJbnB1dCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkKTtcblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXBwbHlSdW5uaW5nQ2xpZW50RXhlY3V0aW9uKGNvbm5lY3Rpb24sIGNoYXRVUkkudG9TdHJpbmcoKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6IGZpcnN0SW5wdXQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhcHBseVJ1bm5pbmdDbGllbnRFeGVjdXRpb24oY29ubmVjdGlvbiwgY2hhdFVSSS50b1N0cmluZygpLCAndHVybi0xJywge1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogc2Vjb25kSW5wdXQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzb3VyY2VSZWFkVXJpczogY29ubmVjdGlvbi5yZXNvdXJjZVJlYWRVcmlzLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxsc1swXT8ucGFyYW1ldGVycyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzb3VyY2VSZWFkVXJpczogW2ZpcnN0SW5wdXRVUkkudG9TdHJpbmcoKSwgc2Vjb25kSW5wdXRVUkkudG9TdHJpbmcoKV0sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgdGFzazogJ2xhdGVzdCcgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcmUtZXhlY3V0ZSB3aGVuIHRoZSByZXF1ZXN0IGNoYW5nZXMgYWZ0ZXIgaW52b2NhdGlvbiBzdGFydHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZva2VSZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElUb29sUmVzdWx0PigpO1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IGludm9rZVJlc3VsdCB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgY2hhdFVSSSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSk7XG5cblx0XHRcdGFwcGx5UmVmZXJlbmNlZFJ1blRhc2soY29ubmVjdGlvbiwgY2hhdFVSSSwgJ3tcInRhc2tcIjpcImZpcnN0XCJ9JywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkKTtcblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXBwbHlSdW5uaW5nQ2xpZW50RXhlY3V0aW9uKGNvbm5lY3Rpb24sIGNoYXRVUkkudG9TdHJpbmcoKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJmaXJzdFwifScsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMubGVuZ3RoLCAxKTtcblxuXHRcdFx0YXBwbHlSdW5uaW5nQ2xpZW50RXhlY3V0aW9uKGNvbm5lY3Rpb24sIGNoYXRVUkkudG9TdHJpbmcoKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJzZWNvbmRcIn0nLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzU2VydmljZS5pbnZva2VkVG9vbENhbGxzLmxlbmd0aCwgMSk7XG5cblx0XHRcdGludm9rZVJlc3VsdC5jb21wbGV0ZSh7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdkb25lJyB9XSB9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aW52b2NhdGlvbnM6IHRvb2xzU2VydmljZS5pbnZva2VkVG9vbENhbGxzLm1hcChjYWxsID0+IGNhbGwucGFyYW1ldGVycyksXG5cdFx0XHRcdGNvbXBsZXRpb25zOiBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbHRlcihlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aW52b2NhdGlvbnM6IFt7IHRhc2s6ICdmaXJzdCcgfV0sXG5cdFx0XHRcdGNvbXBsZXRpb25zOiAxLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXR0bGVzIGxvY2FsIGFuZCBwcm90b2NvbCBzdGF0ZSB3aGVuIHJlZmVyZW5jZWQgaW5wdXQgY2Fubm90IGJlIHJlYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBjaGF0VVJJID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKTtcblx0XHRcdGNvbnN0IHRvb2xJbnB1dFVSSSA9IFVSSS5wYXJzZSgnc2Vzc2lvbi1kYjovdG9vbC1pbnB1dCcpO1xuXHRcdFx0Y29uc3QgdG9vbElucHV0ID0geyB1cmk6IHRvb2xJbnB1dFVSSS50b1N0cmluZygpLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH07XG5cdFx0XHRjb25zdCByZWFkID0gbmV3IERlZmVycmVkUHJvbWlzZTx7IGRhdGE6IHN0cmluZzsgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZyB9PigpO1xuXHRcdFx0Y29ubmVjdGlvbi5yZXNvdXJjZVJlYWRSZXNwb25zZXMuc2V0KHRvb2xJbnB1dFVSSS50b1N0cmluZygpLCByZWFkLnApO1xuXG5cdFx0XHRhcHBseVJlZmVyZW5jZWRSdW5UYXNrKGNvbm5lY3Rpb24sIGNoYXRVUkksIHRvb2xJbnB1dCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkKTtcblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXBwbHlSdW5uaW5nQ2xpZW50RXhlY3V0aW9uKGNvbm5lY3Rpb24sIGNoYXRVUkkudG9TdHJpbmcoKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCByZWFkLmVycm9yKG5ldyBFcnJvcigncmVhZCBmYWlsZWQnKSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9uID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+IGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpbnZvY2F0aW9uU3RhdGU6IHRvb2xzU2VydmljZS5iZWd1blRvb2xDYWxsc1swXT8uc3RhdGUuZ2V0KCkudHlwZSxcblx0XHRcdFx0Y29tcGxldGlvbkVycm9yOiBjb21wbGV0aW9uPy5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSA/IGNvbXBsZXRpb24uYWN0aW9uLnJlc3VsdC5lcnJvcj8ubWVzc2FnZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aW52b2NhdGlvblN0YXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQsXG5cdFx0XHRcdGNvbXBsZXRpb25FcnJvcjogJ3JlYWQgZmFpbGVkJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0dGxlcyBsb2NhbCBhbmQgcHJvdG9jb2wgc3RhdGUgd2hlbiByZWZlcmVuY2VkIGlucHV0IHJlc29sdmVzIHRvIGludmFsaWQgSlNPTicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpO1xuXHRcdFx0Y29uc3QgdG9vbElucHV0ID0geyB1cmk6ICdzZXNzaW9uLWRiOi90b29sLWlucHV0JywgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyB9O1xuXHRcdFx0Y29ubmVjdGlvbi5yZXNvdXJjZVJlYWREYXRhID0gJ25vdCBqc29uJztcblxuXHRcdFx0YXBwbHlSZWZlcmVuY2VkUnVuVGFzayhjb25uZWN0aW9uLCBjaGF0VVJJLCB0b29sSW5wdXQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCk7XG5cdFx0XHRhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFwcGx5UnVubmluZ0NsaWVudEV4ZWN1dGlvbihjb25uZWN0aW9uLCBjaGF0VVJJLnRvU3RyaW5nKCksICd0dXJuLTEnLCB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbiA9IGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMuZmluZChlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZVxuXHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ3Rvb2wtY2FsbC0xJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aW52b2NhdGlvblN0YXRlOiB0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHNbMF0/LnN0YXRlLmdldCgpLnR5cGUsXG5cdFx0XHRcdGNvbXBsZXRpb25FcnJvcjogY29tcGxldGlvbj8uYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUgPyBjb21wbGV0aW9uLmFjdGlvbi5yZXN1bHQuZXJyb3I/Lm1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGludm9jYXRpb25TdGF0ZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkLFxuXHRcdFx0XHRjb21wbGV0aW9uRXJyb3I6ICdJbnZhbGlkIHRvb2wgaW5wdXQgZm9yIFwicnVuVGFza1wiOiBleHBlY3RlZCBKU09OIG9iamVjdCBwYXJhbWV0ZXJzLicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dhaXRzIGZvciB0b29sLXNlYXJjaCBjYW5kaWRhdGVzIGFuZCBkcm9wcyB0aGVtIGZyb20gY29tcGxldGlvbiBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFRvb2xTZWFyY2hUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpO1xuXHRcdFx0Y29uc3QgdG9vbFNlYXJjaENhbmRpZGF0ZXMgPSBbeyBuYW1lOiAnY2FsY3VsYXRvcicsIGRlc2NyaXB0aW9uOiAnQWRkcyBudW1iZXJzJyB9XTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnZmluZCBhIGNhbGN1bGF0b3InLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1zZWFyY2gtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6IFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1NlYXJjaCBUb29scycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLXNlYXJjaC1jYWxsLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaCBUb29scycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInF1ZXJ5XCI6XCJjYWxjdWxhdG9yXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0ZnV0dXJlTWV0YWRhdGE6IHsgcHJlc2VydmU6IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXBwbHlSdW5uaW5nQ2xpZW50RXhlY3V0aW9uKGNvbm5lY3Rpb24sIGNoYXRVUkkudG9TdHJpbmcoKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtc2VhcmNoLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdTZWFyY2ggVG9vbHMnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaCBUb29scycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInF1ZXJ5XCI6XCJjYWxjdWxhdG9yXCJ9Jyxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRmdXR1cmVNZXRhZGF0YTogeyBwcmVzZXJ2ZTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xzU2VydmljZS5pbnZva2VkVG9vbENhbGxzLmxlbmd0aCwgMCk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtc2VhcmNoLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoIFRvb2xzJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1wicXVlcnlcIjpcImNhbGN1bGF0b3JcIn0nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR0b29sU2VhcmNoQ2FuZGlkYXRlcyxcblx0XHRcdFx0XHRmdXR1cmVNZXRhZGF0YTogeyBwcmVzZXJ2ZTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGFwcGx5UnVubmluZ0NsaWVudEV4ZWN1dGlvbihjb25uZWN0aW9uLCBjaGF0VVJJLnRvU3RyaW5nKCksICd0dXJuLTEnLCB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLXNlYXJjaC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogUlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUUsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnU2VhcmNoIFRvb2xzJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2ggVG9vbHMnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJxdWVyeVwiOlwiY2FsY3VsYXRvclwifScsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0dG9vbFNlYXJjaENhbmRpZGF0ZXMsXG5cdFx0XHRcdFx0ZnV0dXJlTWV0YWRhdGE6IHsgcHJlc2VydmU6IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbmQoZW50cnkgPT4gaXNDaGF0QWN0aW9uKGVudHJ5LmFjdGlvbilcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGVcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLXNlYXJjaC1jYWxsLTEnKTtcblx0XHRcdGFzc2VydC5vayhjb21wbGV0aW9uICYmIGlzQ2hhdEFjdGlvbihjb21wbGV0aW9uLmFjdGlvbikgJiYgY29tcGxldGlvbi5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cGFyYW1ldGVyczogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHNbMF0/LnBhcmFtZXRlcnMsXG5cdFx0XHRcdG1ldGE6IGNvbXBsZXRpb24uYWN0aW9uLl9tZXRhLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdFx0cXVlcnk6ICdjYWxjdWxhdG9yJyxcblx0XHRcdFx0XHRjYW5kaWRhdGVUb29sczogdG9vbFNlYXJjaENhbmRpZGF0ZXMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1ldGE6IHsgZnV0dXJlTWV0YWRhdGE6IHsgcHJlc2VydmU6IHRydWUgfSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnZhbGlkIHRvb2wtc2VhcmNoIGlucHV0IGRyb3BzIGNhbmRpZGF0ZXMgd2hpbGUgcHJlc2VydmluZyB1bmtub3duIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0VG9vbFNlYXJjaFRvb2xdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgY2hhdFVSSSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2ZpbmQgYSBjYWxjdWxhdG9yJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtc2VhcmNoLWNhbGwtaW52YWxpZCcsXG5cdFx0XHRcdHRvb2xOYW1lOiBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdTZWFyY2ggVG9vbHMnLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1zZWFyY2gtY2FsbC1pbnZhbGlkJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2ggVG9vbHMnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7aW52YWxpZCcsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdHRvb2xTZWFyY2hDYW5kaWRhdGVzOiBbeyBuYW1lOiAnY2FsY3VsYXRvcicsIGRlc2NyaXB0aW9uOiAnQWRkcyBudW1iZXJzJyB9XSxcblx0XHRcdFx0XHRmdXR1cmVNZXRhZGF0YTogeyBwcmVzZXJ2ZTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhcHBseVJ1bm5pbmdDbGllbnRFeGVjdXRpb24oY29ubmVjdGlvbiwgY2hhdFVSSS50b1N0cmluZygpLCAndHVybi0xJywge1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1zZWFyY2gtY2FsbC1pbnZhbGlkJyxcblx0XHRcdFx0dG9vbE5hbWU6IFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1NlYXJjaCBUb29scycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoIFRvb2xzJyxcblx0XHRcdFx0dG9vbElucHV0OiAne2ludmFsaWQnLFxuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdHRvb2xTZWFyY2hDYW5kaWRhdGVzOiBbeyBuYW1lOiAnY2FsY3VsYXRvcicsIGRlc2NyaXB0aW9uOiAnQWRkcyBudW1iZXJzJyB9XSxcblx0XHRcdFx0XHRmdXR1cmVNZXRhZGF0YTogeyBwcmVzZXJ2ZTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbiA9IGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMuZmluZChlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZVxuXHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ3Rvb2wtc2VhcmNoLWNhbGwtaW52YWxpZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbXBsZXRpb24gJiYgaXNDaGF0QWN0aW9uKGNvbXBsZXRpb24uYWN0aW9uKSAmJiBjb21wbGV0aW9uLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpbnZva2VkVG9vbENhbGxzOiB0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxscy5sZW5ndGgsXG5cdFx0XHRcdHN1Y2Nlc3M6IGNvbXBsZXRpb24uYWN0aW9uLnJlc3VsdC5zdWNjZXNzLFxuXHRcdFx0XHRtZXRhOiBjb21wbGV0aW9uLmFjdGlvbi5fbWV0YSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aW52b2tlZFRvb2xDYWxsczogMCxcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdG1ldGE6IHsgZnV0dXJlTWV0YWRhdGE6IHsgcHJlc2VydmU6IHRydWUgfSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG93cyBhbm90aGVyIGNsaWVudCB0b29sIGFzIGNhbmNlbGxhYmxlIHByb2dyZXNzIHdpdGhvdXQgaW52b2tpbmcgb3IgY29uZmlybWluZyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gdGhlIHRhc2snLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ293bmVyLWNsaWVudCcgfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnQWxsb3cgUnVuIFRhc2s/Jyxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IChzZXNzaW9uIGFzIHVua25vd24gYXMgeyBwcm9ncmVzc09iczogeyBnZXQoKTogSUNoYXRQcm9ncmVzc1tdIH0gfSlcblx0XHRcdFx0LnByb2dyZXNzT2JzLmdldCgpXG5cdFx0XHRcdC5maW5kKChwYXJ0KTogcGFydCBpcyBDaGF0VG9vbEludm9jYXRpb24gPT4gcGFydCBpbnN0YW5jZW9mIENoYXRUb29sSW52b2NhdGlvbiAmJiBwYXJ0LnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24pO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zQmVmb3JlU2tpcCA9IGdldFRvb2xDYWxsQ29uZmlybWF0aW9uQW5kQ29tcGxldGlvbkFjdGlvbnMoY29ubmVjdGlvbik7XG5cdFx0XHRjb25zdCBzdGF0ZUJlZm9yZVNraXAgPSBpbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGU7XG5cdFx0XHRjb25zdCBtZXNzYWdlQmVmb3JlU2tpcCA9IGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdFx0XHRpbnZvY2F0aW9uLm90aGVyQ2xpZW50VG9vbENhbGw/LmNhbmNlbCgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG1lc3NhZ2VCZWZvcmVTa2lwLFxuXHRcdFx0XHRtZXNzYWdlQWZ0ZXJTa2lwOiBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRzdGF0ZUJlZm9yZVNraXAsXG5cdFx0XHRcdHN0YXRlQWZ0ZXJTa2lwOiBpbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGUsXG5cdFx0XHRcdGludm9rZWRUb29sQ2FsbENvdW50OiB0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxscy5sZW5ndGgsXG5cdFx0XHRcdGFjdGlvbnNCZWZvcmVTa2lwLFxuXHRcdFx0XHRhY3Rpb25zQWZ0ZXJTa2lwOiBnZXRUb29sQ2FsbENvbmZpcm1hdGlvbkFuZENvbXBsZXRpb25BY3Rpb25zKGNvbm5lY3Rpb24pLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtZXNzYWdlQmVmb3JlU2tpcDogJ1J1bm5pbmcgUnVuIFRhc2sgb24gYW5vdGhlciBjbGllbnQuLi4nLFxuXHRcdFx0XHRtZXNzYWdlQWZ0ZXJTa2lwOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRzdGF0ZUJlZm9yZVNraXA6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdFx0c3RhdGVBZnRlclNraXA6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCxcblx0XHRcdFx0aW52b2tlZFRvb2xDYWxsQ291bnQ6IDAsXG5cdFx0XHRcdGFjdGlvbnNCZWZvcmVTa2lwOiBbXSxcblx0XHRcdFx0YWN0aW9uc0FmdGVyU2tpcDogW3tcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRhcHByb3ZlZDogZmFsc2UsXG5cdFx0XHRcdFx0c3VjY2VzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIGNsaWVudCB0b29sIHByZXBhcmUgZmFpbHVyZXMgYmVmb3JlIGNvbmZpcm1hdGlvbiBhcyBmYWlsZWQgY29tcGxldGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0sIHsgdGhyb3dCZWZvcmVDb25maXJtYXRpb246IG5ldyBFcnJvcigncHJlcGFyZSBmYWlsZWQnKSB9KTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZVNlc3Npb25XaXRoUmVhZHlSdW5UYXNrVG9vbChoYW5kbGVyLCBjb25uZWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRUb29sQ2FsbENvbmZpcm1hdGlvbkFuZENvbXBsZXRpb25BY3Rpb25zKGNvbm5lY3Rpb24pLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRhcHByb3ZlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZXJyb3I6ICdwcmVwYXJlIGZhaWxlZCcsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIGNsaWVudCB0b29sIGNhbmNlbGxhdGlvbiBiZWZvcmUgY29uZmlybWF0aW9uIGFzIGZhaWxlZCBjb21wbGV0aW9uIHdoZW4gcHJvdG9jb2wgY2FsbCBpcyBub3QgdGVybWluYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24gfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IHRocm93QmVmb3JlQ29uZmlybWF0aW9uOiBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSB9KTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZVNlc3Npb25XaXRoUmVhZHlSdW5UYXNrVG9vbChoYW5kbGVyLCBjb25uZWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRUb29sQ2FsbENvbmZpcm1hdGlvbkFuZENvbXBsZXRpb25BY3Rpb25zKGNvbm5lY3Rpb24pLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRhcHByb3ZlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZXJyb3I6ICdDYW5jZWxlZCcsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvLWFwcHJvdmVzIGNsaWVudCB0b29sIGNvbmZpcm1hdGlvbiBhcyBhIHNldHRpbmcgd2hlbiB0aGUgYWdlbnQgaG9zdCBtYXJrcyB0aGUgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0sIHsgcmVxdWlyZUNvbmZpcm1hdGlvbjogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gdGhlIHRhc2snLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdF9tZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFwcGx5UnVubmluZ0NsaWVudEV4ZWN1dGlvbihjb25uZWN0aW9uLCBidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uU2V0dGluZyxcblx0XHRcdFx0X21ldGE6IHsgYXV0b0FwcHJvdmVCeVNldHRpbmc6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnNcblx0XHRcdFx0LmZpbHRlcihlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHRcdCYmIChlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQgfHwgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpXG5cdFx0XHRcdC5tYXAoZW50cnkgPT4ge1xuXHRcdFx0XHRcdGlmIChlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IGVudHJ5LmFjdGlvbi50eXBlLFxuXHRcdFx0XHRcdFx0XHRhcHByb3ZlZDogZW50cnkuYWN0aW9uLmFwcHJvdmVkLFxuXHRcdFx0XHRcdFx0XHRjb25maXJtZWQ6IGVudHJ5LmFjdGlvbi5hcHByb3ZlZCA/IGVudHJ5LmFjdGlvbi5jb25maXJtZWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogZW50cnkuYWN0aW9uLnR5cGUsXG5cdFx0XHRcdFx0XHRcdGFwcHJvdmVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbmZpcm1lZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiBlbnRyeS5hY3Rpb24ucmVzdWx0LnN1Y2Nlc3MsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgYWN0aW9uIHR5cGU6ICR7ZW50cnkuYWN0aW9uLnR5cGV9YCk7XG5cdFx0XHRcdH0pLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmcsXG5cdFx0XHRcdFx0c3VjY2VzczogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0XHRhcHByb3ZlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3RvY29sLWNvbmZpcm1lZCBjbGllbnQgdG9vbCBuZXZlciBlbnRlcnMgV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAobm8gbmVlZHMtaW5wdXQgZmxpY2tlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0sIHsgcmVxdWlyZUNvbmZpcm1hdGlvbjogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gdGhlIHRhc2snLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFwcGx5UnVubmluZ0NsaWVudEV4ZWN1dGlvbihjb25uZWN0aW9uLCBidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdC8vIFRoZSBpbnZvY2F0aW9uIGNhcnJpZXMgdGhlIHByZS1yZXNvbHZlZCBhcHByb3ZhbCwgYW5kIGl0IHRyYW5zaXRpb25zXG5cdFx0XHQvLyBzdHJhaWdodCBmcm9tIHN0cmVhbWluZyB0byBleGVjdXRpbmcgd2l0aG91dCBldmVyIHN1cmZhY2luZyBhIHBlbmRpbmdcblx0XHRcdC8vIGNvbmZpcm1hdGlvbiAod2hpY2ggd291bGQgZmxpY2tlciBcIm5lZWRzIGlucHV0XCIgaW4gdGhlIHNlc3Npb25zIGxpc3QpLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByZUFwcHJvdmVkS2luZDogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHNbMF0/LnByZUFwcHJvdmVkPy50eXBlLFxuXHRcdFx0XHRcdHNhd1dhaXRpbmdGb3JDb25maXJtYXRpb246ICh0b29sc1NlcnZpY2UucmVjb3JkZWRTdGF0ZUtpbmRzLmdldCgndG9vbC1jYWxsLTEnKSA/PyBbXSkuaW5jbHVkZXMoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwcmVBcHByb3ZlZEtpbmQ6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQsXG5cdFx0XHRcdFx0c2F3V2FpdGluZ0ZvckNvbmZpcm1hdGlvbjogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gcHJvdmlkZVNlc3Npb25XaXRoUGVuZGluZ0NvbmZpcm1hdGlvbkNsaWVudFRvb2woaGFuZGxlcjogQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIsIGNvbm5lY3Rpb246IE1vY2tBZ2VudEhvc3RDb25uZWN0aW9uKTogUHJvbWlzZTxVUkk+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgY2hhdFVSSSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biB0aGUgdGFzaycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihjaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oY2hhdFVSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdhbGxvdy1vbmNlJywgbGFiZWw6ICdBbGxvdyBPbmNlJywga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5BcHByb3ZlIH0sXG5cdFx0XHRcdFx0eyBpZDogJ3NraXAnLCBsYWJlbDogJ1NraXAnLCBraW5kOiBDb25maXJtYXRpb25PcHRpb25LaW5kLkRlbnkgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAnY29uZmlybWF0aW9uLXRvb2wtY2FsbC0xJyxcblx0XHRcdFx0XHRraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdGNoYXQ6IGNoYXRVUkkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdHJldHVybiBjaGF0VVJJO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2ludm9rZXMgYSByZWFkeSBjbGllbnQgdG9vbCBhbmQgcmVmbGVjdHMgaXRzIGxvY2FsIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSwgeyByZXF1aXJlQ29uZmlybWF0aW9uOiB0cnVlIH0pO1xuXHRcdFx0YXdhaXQgcHJvdmlkZVNlc3Npb25XaXRoUGVuZGluZ0NvbmZpcm1hdGlvbkNsaWVudFRvb2woaGFuZGxlciwgY29ubmVjdGlvbik7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHMuZmluZChpbnZvY2F0aW9uID0+IGludm9jYXRpb24udG9vbENhbGxJZCA9PT0gJ3Rvb2wtY2FsbC0xJyk7XG5cdFx0XHRjb25zdCBzdGF0ZUJlZm9yZUFwcHJvdmFsID0gaW52b2NhdGlvbj8uc3RhdGUuZ2V0KCkudHlwZTtcblx0XHRcdGNvbnN0IHBhcmFtZXRlcnNCZWZvcmVFeGVjdXRpb24gPSBpbnZvY2F0aW9uPy5wYXJhbWV0ZXJzO1xuXG5cdFx0XHRjb25zdCBoeWRyYXRlZEludm9jYXRpb24gPSBpbnZvY2F0aW9uICYmIHtcblx0XHRcdFx0c3RhdGU6IGludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSxcblx0XHRcdFx0cGFyYW1ldGVyczogaW52b2NhdGlvbi5wYXJhbWV0ZXJzLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogaW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IGludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLFxuXHRcdFx0XHRhcHByb3ZlQ29tYmluYXRpb246IGludm9jYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmVDb21iaW5hdGlvbixcblx0XHRcdFx0cHJlc2VudGF0aW9uOiBpbnZvY2F0aW9uLnByZXNlbnRhdGlvbixcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbkFjY2VwdGVkID0gSUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChpbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0ZUJlZm9yZUFwcHJvdmFsLFxuXHRcdFx0XHRwYXJhbWV0ZXJzQmVmb3JlRXhlY3V0aW9uLFxuXHRcdFx0XHRoeWRyYXRlZEludm9jYXRpb24sXG5cdFx0XHRcdGNvbmZpcm1hdGlvbkFjY2VwdGVkLFxuXHRcdFx0XHRpbnZvY2F0aW9uc0FmdGVyQ2xpZW50RXhlY3V0aW9uOiB0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxscy5sZW5ndGgsXG5cdFx0XHRcdGFjdGlvbnM6IGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnNcblx0XHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdFx0XHQmJiAoZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkIHx8IGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKVxuXHRcdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpXG5cdFx0XHRcdFx0Lm1hcChlbnRyeSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHR5cGU6IGVudHJ5LmFjdGlvbi50eXBlLCBhcHByb3ZlZDogZW50cnkuYWN0aW9uLmFwcHJvdmVkLCBjb25maXJtZWQ6IGVudHJ5LmFjdGlvbi5hcHByb3ZlZCA/IGVudHJ5LmFjdGlvbi5jb25maXJtZWQgOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiBlbnRyeS5hY3Rpb24udHlwZSwgc3VjY2VzczogZW50cnkuYWN0aW9uLnJlc3VsdC5zdWNjZXNzIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgYWN0aW9uIHR5cGU6ICR7ZW50cnkuYWN0aW9uLnR5cGV9YCk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXRlQmVmb3JlQXBwcm92YWw6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnNCZWZvcmVFeGVjdXRpb246IHsgdGFzazogJ2J1aWxkJyB9LFxuXHRcdFx0XHRoeWRyYXRlZEludm9jYXRpb246IHtcblx0XHRcdFx0XHRzdGF0ZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHRhc2s6ICdidWlsZCcgfSxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBidWlsZCcsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdDb25maXJtIHRvb2wgZXhlY3V0aW9uJyxcblx0XHRcdFx0XHRhcHByb3ZlQ29tYmluYXRpb246IHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnQXBwcm92ZSBidWlsZCcsXG5cdFx0XHRcdFx0XHRrZXk6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwcmVzZW50YXRpb246IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGUsXG5cdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdFx0a2luZDogJ3NpbXBsZVRvb2xJbnZvY2F0aW9uJyxcblx0XHRcdFx0XHRcdGlucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRcdFx0b3V0cHV0OiAnJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb25maXJtYXRpb25BY2NlcHRlZDogdHJ1ZSxcblx0XHRcdFx0aW52b2NhdGlvbnNBZnRlckNsaWVudEV4ZWN1dGlvbjogMSxcblx0XHRcdFx0YWN0aW9uczogW1xuXHRcdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsIGFwcHJvdmVkOiB0cnVlLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24gfSxcblx0XHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHN1Y2Nlc3M6IHRydWUgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBwcm90b2NvbCBjb25maXJtYXRpb24gd2hlbiB0aGUgY2xpZW50IHRvb2wgZG9lcyBub3QgcmVxdWlyZSBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSk7XG5cdFx0XHRhd2FpdCBwcm92aWRlU2Vzc2lvbldpdGhQZW5kaW5nQ29uZmlybWF0aW9uQ2xpZW50VG9vbChoYW5kbGVyLCBjb25uZWN0aW9uKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHNbMF07XG5cdFx0XHRjb25zdCBjb25maXJtYXRpb24gPSBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbmQoZW50cnkgPT4gaXNDaGF0QWN0aW9uKGVudHJ5LmFjdGlvbilcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpbnZvY2F0aW9uczogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMubGVuZ3RoLFxuXHRcdFx0XHRwcmVBcHByb3ZlZDogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHNbMF0/LnByZUFwcHJvdmVkLFxuXHRcdFx0XHRzYXdXYWl0aW5nRm9yQ29uZmlybWF0aW9uOiAodG9vbHNTZXJ2aWNlLnJlY29yZGVkU3RhdGVLaW5kcy5nZXQoJ3Rvb2wtY2FsbC0xJykgPz8gW10pLmluY2x1ZGVzKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogaW52b2NhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRcdFx0Y29uZmlybWF0aW9uOiBjb25maXJtYXRpb24/LmFjdGlvbixcblx0XHRcdH0sIHtcblx0XHRcdFx0aW52b2NhdGlvbnM6IDEsXG5cdFx0XHRcdHByZUFwcHJvdmVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNhd1dhaXRpbmdGb3JDb25maXJtYXRpb246IGZhbHNlLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyB0aGUgY2xpZW50IHRvb2wgY29uZmlybWF0aW9uIHJlYXNvbiB0aHJvdWdoIGV4ZWN1dGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYXNvbnMgPSBbXG5cdFx0XHRcdFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0VG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uU2V0dGluZyxcblx0XHRcdFx0VG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdHM6IHVua25vd25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByZWFzb24gb2YgcmVhc29ucykge1xuXHRcdFx0XHRjb25zdCBsb2NhbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2Nrcyhsb2NhbCwgW3Rlc3RSdW5UYXNrVG9vbF0sIHsgcmVxdWlyZUNvbmZpcm1hdGlvbjogdHJ1ZSB9KTtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZVNlc3Npb25XaXRoUGVuZGluZ0NvbmZpcm1hdGlvbkNsaWVudFRvb2woaGFuZGxlciwgY29ubmVjdGlvbik7XG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1lZFJlYXNvbiA9IHJlYXNvbiA9PT0gVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkXG5cdFx0XHRcdFx0PyB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgYXMgY29uc3QgfVxuXHRcdFx0XHRcdDogcmVhc29uID09PSBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5TZXR0aW5nXG5cdFx0XHRcdFx0XHQ/IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNldHRpbmcgYXMgY29uc3QsIGlkOiAndGVzdC1zZXR0aW5nJyB9XG5cdFx0XHRcdFx0XHQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gYXMgY29uc3QgfTtcblxuXHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKFxuXHRcdFx0XHRcdHRvb2xzU2VydmljZS5iZWd1blRvb2xDYWxscy5maW5kKGludm9jYXRpb24gPT4gaW52b2NhdGlvbi50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnKSxcblx0XHRcdFx0XHRjb25maXJtZWRSZWFzb24sXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdFx0Y29uc3QgY29uZmlybWVkQWN0aW9uID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+IGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpO1xuXHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdHJlYXNvbixcblx0XHRcdFx0XHRkaXNwYXRjaGVkQ29uZmlybWVkOiBjb25maXJtZWRBY3Rpb24gJiYgY29uZmlybWVkQWN0aW9uLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCAmJiBjb25maXJtZWRBY3Rpb24uYWN0aW9uLmFwcHJvdmVkXG5cdFx0XHRcdFx0XHQ/IGNvbmZpcm1lZEFjdGlvbi5hY3Rpb24uY29uZmlybWVkXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb21wbGV0ZWQ6IGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMuc29tZShlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGVcblx0XHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnXG5cdFx0XHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24ucmVzdWx0LnN1Y2Nlc3MgPT09IHRydWUpLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5kZWxldGUobG9jYWwpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMsIHJlYXNvbnMubWFwKHJlYXNvbiA9PiAoe1xuXHRcdFx0XHRyZWFzb24sXG5cdFx0XHRcdGRpc3BhdGNoZWRDb25maXJtZWQ6IHJlYXNvbixcblx0XHRcdFx0Y29tcGxldGVkOiB0cnVlLFxuXHRcdFx0fSkpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGV4ZWN1dGUgYWdhaW4gd2hlbiB0aGUgcHJvdG9jb2wgYWR2YW5jZXMgdGhlIGxvY2FsbHkgaW52b2tlZCB0b29sIHRvIHJ1bm5pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZva2VSZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElUb29sUmVzdWx0PigpO1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IGludm9rZVJlc3VsdCB9KTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBhd2FpdCBwcm92aWRlU2Vzc2lvbldpdGhQZW5kaW5nQ29uZmlybWF0aW9uQ2xpZW50VG9vbChoYW5kbGVyLCBjb25uZWN0aW9uKTtcblxuXHRcdFx0YXBwbHlSdW5uaW5nQ2xpZW50RXhlY3V0aW9uKGNvbm5lY3Rpb24sIGNoYXRVUkkudG9TdHJpbmcoKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aW52b2tlZDogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMuZmlsdGVyKGludm9jYXRpb24gPT4gaW52b2NhdGlvbi5jaGF0U3RyZWFtVG9vbENhbGxJZCA9PT0gJ3Rvb2wtY2FsbC0xJykubGVuZ3RoLFxuXHRcdFx0XHRkaXNwYXRjaGVkQXBwcm92YWw6IGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMuc29tZShlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZFxuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLmFwcHJvdmVkID09PSB0cnVlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aW52b2tlZDogMSxcblx0XHRcdFx0ZGlzcGF0Y2hlZEFwcHJvdmFsOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnZva2VSZXN1bHQuY29tcGxldGUoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnZG9uZScgfV0gfSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VscyBhIGNvbmZpcm1pbmcgY2xpZW50IHRvb2wgd2hlbiBpdHMgY29uZmlybWF0aW9uIHJlcXVlc3QgZGlzYXBwZWFycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSwgeyByZXF1aXJlQ29uZmlybWF0aW9uOiB0cnVlIH0pO1xuXHRcdFx0YXdhaXQgcHJvdmlkZVNlc3Npb25XaXRoUGVuZGluZ0NvbmZpcm1hdGlvbkNsaWVudFRvb2woaGFuZGxlciwgY29ubmVjdGlvbik7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJyksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRSZW1vdmVkLFxuXHRcdFx0XHRpZDogJ2NvbmZpcm1hdGlvbi10b29sLWNhbGwtMScsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2FuY2VsbGVkOiB0b29sc1NlcnZpY2UuaW52b2NhdGlvblRva2Vuc1swXT8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsXG5cdFx0XHRcdHN0YXRlOiB0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHNbMF0/LnN0YXRlLmdldCgpLnR5cGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNhbmNlbGxlZDogdHJ1ZSxcblx0XHRcdFx0c3RhdGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZXhlY3V0ZSBhIGNsaWVudCB0b29sIHNraXBwZWQgZnJvbSBhbm90aGVyIGNsaWVudCB3aGlsZSBjb25maXJtaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IHJlcXVpcmVDb25maXJtYXRpb246IHRydWUgfSk7XG5cdFx0XHRjb25zdCBjaGF0VVJJID0gYXdhaXQgcHJvdmlkZVNlc3Npb25XaXRoUGVuZGluZ0NvbmZpcm1hdGlvbkNsaWVudFRvb2woaGFuZGxlciwgY29ubmVjdGlvbik7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKGNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdGFwcHJvdmVkOiBmYWxzZSxcblx0XHRcdFx0cmVhc29uOiBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5Ta2lwcGVkLFxuXHRcdFx0XHRyZWFzb25NZXNzYWdlOiAnUnVuIFRhc2sgd2FzIHNraXBwZWQgZnJvbSBhbm90aGVyIGNsaWVudCcsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZXhlY3V0ZWQ6IHRvb2xzU2VydmljZS5leGVjdXRlZFRvb2xDYWxscy5sZW5ndGgsXG5cdFx0XHRcdHN0YXRlOiB0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHNbMF0/LnN0YXRlLmdldCgpLnR5cGUsXG5cdFx0XHRcdGNvbXBsZXRpb25zOiBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbHRlcihlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlXG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZXhlY3V0ZWQ6IDAsXG5cdFx0XHRcdHN0YXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQsXG5cdFx0XHRcdGNvbXBsZXRpb25zOiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFuc2ZlcnMgY2FuY2VsbGF0aW9uIGF1dGhvcml0eSBmcm9tIGNvbmZpcm1hdGlvbiB0byBleGVjdXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZva2VSZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElUb29sUmVzdWx0PigpO1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdLCB7IHJlcXVpcmVDb25maXJtYXRpb246IHRydWUsIGludm9rZVJlc3VsdCB9KTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBhd2FpdCBwcm92aWRlU2Vzc2lvbldpdGhQZW5kaW5nQ29uZmlybWF0aW9uQ2xpZW50VG9vbChoYW5kbGVyLCBjb25uZWN0aW9uKTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHNbMF07XG5cblx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgoaW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJyksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRSZW1vdmVkLFxuXHRcdFx0XHRpZDogJ2NvbmZpcm1hdGlvbi10b29sLWNhbGwtMScsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbHNTZXJ2aWNlLmludm9jYXRpb25Ub2tlbnNbMF0/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCBmYWxzZSk7XG5cblx0XHRcdGFwcGx5UnVubmluZ0NsaWVudEV4ZWN1dGlvbihjb25uZWN0aW9uLCBjaGF0VVJJLnRvU3RyaW5nKCksICd0dXJuLTEnLCB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkUmVtb3ZlZCxcblx0XHRcdFx0aWQ6ICdleGVjLXRvb2wtY2FsbC0xJyxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNhbmNlbGxlZDogdG9vbHNTZXJ2aWNlLmludm9jYXRpb25Ub2tlbnNbMF0/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLFxuXHRcdFx0XHRjb25maXJtYXRpb25zOiBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbHRlcihlbnRyeSA9PiBpc0NoYXRBY3Rpb24oZW50cnkuYWN0aW9uKVxuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZFxuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAndG9vbC1jYWxsLTEnKS5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNhbmNlbGxlZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlybWF0aW9uczogMSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnZva2VSZXN1bHQuY29tcGxldGUoeyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnZG9uZScgfV0gfSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb25uZWN0aW5nIHRvIGFuIGFjdGl2ZSB0dXJuIHdpdGggb3duZWQgY2xpZW50IHRvb2wgY29tcGxldGVzIHRoZSBpbml0aWFsIHNuYXBzaG90IGludm9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24gfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gdGhlIHRhc2snLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY2FsbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdC8vIGFjdGl2ZVR1cm5Ub1Byb2dyZXNzIGNyZWF0ZXMgYSBnZW5lcmljIENoYXRUb29sSW52b2NhdGlvbiBmb3Jcblx0XHRcdC8vIHRoZSBydW5uaW5nIGNsaWVudCB0b29sIHdoaWNoIGFwcGVhcnMgaW4gdGhlIHNlc3Npb24ncyBwcm9ncmVzc1xuXHRcdFx0Ly8gb2JzZXJ2YWJsZS4gR3JhYiBpdCBiZWZvcmUgX3JlY29ubmVjdFRvQWN0aXZlVHVybiByZXBsYWNlcyBpdC5cblx0XHRcdGNvbnN0IHNuYXBzaG90SW52b2NhdGlvbiA9IChzZXNzaW9uIGFzIHVua25vd24gYXMgeyBwcm9ncmVzc09iczogeyBnZXQoKTogSUNoYXRQcm9ncmVzc1tdIH0gfSlcblx0XHRcdFx0LnByb2dyZXNzT2JzLmdldCgpXG5cdFx0XHRcdC5maW5kKChwKTogcCBpcyBDaGF0VG9vbEludm9jYXRpb24gPT4gcCBpbnN0YW5jZW9mIENoYXRUb29sSW52b2NhdGlvbiAmJiBwLnRvb2xDYWxsSWQgPT09ICd0b29sLWNhbGwtMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNuYXBzaG90SW52b2NhdGlvbiwgJ2FjdGl2ZVR1cm5Ub1Byb2dyZXNzIHNob3VsZCBoYXZlIGNyZWF0ZWQgYSBzbmFwc2hvdCBpbnZvY2F0aW9uJyk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHQvLyBUaGUgc25hcHNob3QgaW52b2NhdGlvbiBmcm9tIGFjdGl2ZVR1cm5Ub1Byb2dyZXNzIHNob3VsZCBoYXZlXG5cdFx0XHQvLyBiZWVuIGNvbXBsZXRlZCAodmlhIGRpZEV4ZWN1dGVUb29sKSBzbyBpdCBkb2VzIG5vdCByZW1haW5cblx0XHRcdC8vIG9ycGhhbmVkIGluIHRoZSBVSSB3aGlsZSB0aGUgcmVwbGFjZW1lbnQgZnJvbVxuXHRcdFx0Ly8gX2JlZ2luQ2xpZW50VG9vbEludm9jYXRpb24gdGFrZXMgb3Zlci5cblx0XHRcdGFzc2VydC5vayhJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoc25hcHNob3RJbnZvY2F0aW9uKSxcblx0XHRcdFx0J3RoZSBpbml0aWFsIHNuYXBzaG90IGludm9jYXRpb24gc2hvdWxkIGJlIGNvbXBsZXRlZCwgbm90IG9ycGhhbmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvLWRlbmllcyBhbiB1bmNsYWltZWQgc2Vzc2lvbiBjb25maXJtYXRpb24gYWZ0ZXIgdGhlIGdyYWNlIHBlcmlvZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50Q2hhdCA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uLCAndGFzay1jYWxsLTEnKTtcblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBObyB0dXJuIG9ic2VydmVyIGV2ZXIgcmVuZGVycyB0aGlzIGNvbmZpcm1hdGlvbiwgc28gbm90aGluZyBjYW5cblx0XHRcdC8vIGFuc3dlciBpdDsgdGhlIHdhdGNoZXIgZGVuaWVzIGl0IG9uY2UgdGhlIGdyYWNlIHdpbmRvdyBleHBpcmVzLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAnYXBwcm92YWwtMScsXG5cdFx0XHRcdFx0a2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRjaGF0OiBzdWJhZ2VudENoYXQsXG5cdFx0XHRcdFx0dHVybklkOiAnc3ViYWdlbnQtdHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3Bvd2Vyc2hlbGwtY2FsbC0xJyxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAncG93ZXJzaGVsbCcsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Bvd2VyU2hlbGwnLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gUG93ZXJTaGVsbCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dChVTk9CU0VSVkVEX0NMSUVOVF9UT09MX0dSQUNFX01TICsgMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnNcblx0XHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCAmJiBlbnRyeS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ3Bvd2Vyc2hlbGwtY2FsbC0xJylcblx0XHRcdFx0XHQubWFwKGVudHJ5ID0+ICh7IGNoYW5uZWw6IGVudHJ5LmNoYW5uZWwsIGFjdGlvbjogZW50cnkuYWN0aW9uIH0pKSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRjaGFubmVsOiBzdWJhZ2VudENoYXQsXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRcdHR1cm5JZDogJ3N1YmFnZW50LXR1cm4tMScsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAncG93ZXJzaGVsbC1jYWxsLTEnLFxuXHRcdFx0XHRcdFx0YXBwcm92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cmVhc29uOiBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5EZW5pZWQsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHQpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ2NhbmNlbHMgYW4gdW5jbGFpbWVkIGNoYXQgaW5wdXQgcmVxdWVzdCBhZnRlciB0aGUgZ3JhY2UgcGVyaW9kJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24gfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFtdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0ID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sICd0YXNrLWNhbGwtMScpO1xuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdC8vIE5vIHR1cm4gb2JzZXJ2ZXIgcmVuZGVycyB0aGlzIGVsaWNpdGF0aW9uLCBzbyBub3RoaW5nIGNhbiBhbnN3ZXJcblx0XHRcdC8vIGl0OyB0aGUgd2F0Y2hlciBjYW5jZWxzIGl0IG9uY2UgdGhlIGdyYWNlIHdpbmRvdyBleHBpcmVzLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAnaW5wdXQtMScsXG5cdFx0XHRcdFx0a2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuQ2hhdElucHV0LFxuXHRcdFx0XHRcdGNoYXQ6IHN1YmFnZW50Q2hhdCxcblx0XHRcdFx0XHRyZXF1ZXN0OiB7IGlkOiAnZWxpY2l0LTEnLCBtZXNzYWdlOiAnUGljayBvbmUnLCBxdWVzdGlvbnM6IFtdIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnNcblx0XHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZClcblx0XHRcdFx0XHQubWFwKGVudHJ5ID0+ICh7IGNoYW5uZWw6IGVudHJ5LmNoYW5uZWwsIGFjdGlvbjogZW50cnkuYWN0aW9uIH0pKSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRjaGFubmVsOiBzdWJhZ2VudENoYXQsXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0XHRcdHJlcXVlc3RJZDogJ2VsaWNpdC0xJyxcblx0XHRcdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0KTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBjYW5jZWwgYSBjaGF0IGlucHV0IHJlcXVlc3QgYSB0dXJuIG9ic2VydmVyIGlzIHJlbmRlcmluZycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKTtcblxuXHRcdFx0Ly8gVGhlIGRlZmF1bHQtY2hhdCB0dXJuIG9ic2VydmVyIHJlbmRlcnMgdGhlIGVsaWNpdGF0aW9uLCBzbyBpdFxuXHRcdFx0Ly8gY2xhaW1zIHRoZSByZXF1ZXN0IGFuZCB0aGUgd2F0Y2hlciBtdXN0IGxlYXZlIGl0IGFsb25lLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGNoYXRVUkkpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhc2sgbWUnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGNoYXRVUkkpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0XHRyZXF1ZXN0OiB7IGlkOiAnZWxpY2l0LTEnLCBtZXNzYWdlOiAnUGljayBvbmUnLCBxdWVzdGlvbnM6IFtdIH0sXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYmFja2VuZFNlc3Npb24pLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkU2V0LFxuXHRcdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdFx0aWQ6ICdpbnB1dC0xJyxcblx0XHRcdFx0XHRraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5DaGF0SW5wdXQsXG5cdFx0XHRcdFx0Y2hhdDogY2hhdFVSSSxcblx0XHRcdFx0XHRyZXF1ZXN0OiB7IGlkOiAnZWxpY2l0LTEnLCBtZXNzYWdlOiAnUGljayBvbmUnLCBxdWVzdGlvbnM6IFtdIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwMSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLnNvbWUoZW50cnkgPT4gZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBTZXR0bGUgdGhlIGVsaWNpdGF0aW9uIHNvIHRoZSByZW5kZXJlZCBjYXJvdXNlbCdzIGNhbmNlbGxhdGlvblxuXHRcdFx0Ly8gbGlzdGVuZXIgaXMgZGlzcG9zZWQgYmVmb3JlIHRlYXJkb3duLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGNoYXRVUkkpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdlbGljaXQtMScsXG5cdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsLFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnY2FuY2VscyBhbiB1bmNsYWltZWQgTUNQIGF1dGhlbnRpY2F0aW9uIHRvb2wgY2FsbCBhZnRlciB0aGUgZ3JhY2UgcGVyaW9kJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24gfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFtdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0ID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sICd0YXNrLWNhbGwtMScpO1xuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdC8vIE5vIHR1cm4gb2JzZXJ2ZXIgcmVuZGVycyB0aGlzIGF1dGgtcmVxdWlyZWQgTUNQIHRvb2wgY2FsbCwgc29cblx0XHRcdC8vIG5vYm9keSBjYW4gZHJpdmUgYXV0aGVudGljYXRpb247IHRoZSB3YXRjaGVyIGNhbmNlbHMgaXQgb25jZSB0aGVcblx0XHRcdC8vIGdyYWNlIHdpbmRvdyBleHBpcmVzLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAnYXV0aC0xJyxcblx0XHRcdFx0XHRraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQXV0aGVudGljYXRpb24sXG5cdFx0XHRcdFx0Y2hhdDogc3ViYWdlbnRDaGF0LFxuXHRcdFx0XHRcdHR1cm5JZDogJ3N1YmFnZW50LXR1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQXV0aFJlcXVpcmVkLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ21jcC1jYWxsLTEnLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICdub3Rpb25TZWFyY2gnLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdOb3Rpb24gU2VhcmNoJyxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoIE5vdGlvbicsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ25vdGlvbi1tY3AnIH0sXG5cdFx0XHRcdFx0XHRhdXRoOiB7IHJlYXNvbjogTWNwQXV0aFJlcXVpcmVkUmVhc29uLlJlcXVpcmVkLCByZXNvdXJjZTogeyByZXNvdXJjZTogJ2h0dHBzOi8vbWNwLm5vdGlvbi5jb20vbWNwJywgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbXSB9IH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCg1MDAxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Y29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9uc1xuXHRcdFx0XHRcdC5maWx0ZXIoZW50cnkgPT4gZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUgJiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICdtY3AtY2FsbC0xJylcblx0XHRcdFx0XHQubWFwKGVudHJ5ID0+ICh7IGNoYW5uZWw6IGVudHJ5LmNoYW5uZWwsIGFjdGlvbjogZW50cnkuYWN0aW9uIH0pKSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRjaGFubmVsOiBzdWJhZ2VudENoYXQsXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdFx0dHVybklkOiAnc3ViYWdlbnQtdHVybi0xJyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdtY3AtY2FsbC0xJyxcblx0XHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0NhbmNlbGxlZCB0b29sIGNhbGwnLFxuXHRcdFx0XHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiAnTUNQIGF1dGhlbnRpY2F0aW9uIHdhcyBjYW5jZWxsZWQnLCBjb2RlOiAnY2FuY2VsbGVkJyB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XSxcblx0XHRcdCk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY2FuY2VsIGFuIE1DUCBhdXRoZW50aWNhdGlvbiB0b29sIGNhbGwgYSB0dXJuIG9ic2VydmVyIGlzIHJlbmRlcmluZycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXRVUkkgPSBidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKTtcblxuXHRcdFx0Ly8gVGhlIGRlZmF1bHQtY2hhdCBvYnNlcnZlciByZW5kZXJzIHRoZSBNQ1AgdG9vbCBjYWxsIGFzIGl0IHBhdXNlc1xuXHRcdFx0Ly8gZm9yIGF1dGhlbnRpY2F0aW9uLCBzbyBpdCBjbGFpbXMgdGhlIGNhbGwgYW5kIHRoZSB3YXRjaGVyIG11c3Rcblx0XHRcdC8vIGxlYXZlIGl0IGFsb25lLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGNoYXRVUkkpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdzZWFyY2ggbm90aW9uJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShjaGF0VVJJKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnbWNwLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnbm90aW9uU2VhcmNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdOb3Rpb24gU2VhcmNoJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6ICdub3Rpb24tbWNwJyB9LFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShjaGF0VVJJKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnbWNwLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoIE5vdGlvbicsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGNoYXRVUkkpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQXV0aFJlcXVpcmVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnbWNwLWNhbGwtMScsXG5cdFx0XHRcdGF1dGg6IHsgcmVhc29uOiBNY3BBdXRoUmVxdWlyZWRSZWFzb24uUmVxdWlyZWQsIHJlc291cmNlOiB7IHJlc291cmNlOiAnaHR0cHM6Ly9tY3Aubm90aW9uLmNvbS9tY3AnLCBhdXRob3JpemF0aW9uX3NlcnZlcnM6IFtdIH0gfSxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYmFja2VuZFNlc3Npb24pLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkU2V0LFxuXHRcdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdFx0aWQ6ICdhdXRoLTEnLFxuXHRcdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xBdXRoZW50aWNhdGlvbixcblx0XHRcdFx0XHRjaGF0OiBjaGF0VVJJLFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQXV0aFJlcXVpcmVkLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ21jcC1jYWxsLTEnLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICdub3Rpb25TZWFyY2gnLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdOb3Rpb24gU2VhcmNoJyxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoIE5vdGlvbicsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ25vdGlvbi1tY3AnIH0sXG5cdFx0XHRcdFx0XHRhdXRoOiB7IHJlYXNvbjogTWNwQXV0aFJlcXVpcmVkUmVhc29uLlJlcXVpcmVkLCByZXNvdXJjZTogeyByZXNvdXJjZTogJ2h0dHBzOi8vbWNwLm5vdGlvbi5jb20vbWNwJywgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbXSB9IH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCg1MDAxKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMuc29tZShlbnRyeSA9PiBlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSAmJiBlbnRyeS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ21jcC1jYWxsLTEnKSwgZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgYSBzdWJhZ2VudCBjbGllbnQgdG9vbCBhcyB0aGUgc2FtZSBpbnZvY2F0aW9uIHRoZSB3YXRjaGVyIGV4ZWN1dGVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgc3ViYWdlbnQgb2JzZXJ2ZXIgcmVuZGVycyB0aGUgc2hhcmVkIGludm9jYXRpb24gYW5kIHRoZVxuXHRcdFx0Ly8gd2F0Y2hlciBleGVjdXRlcyBpdDogYm90aCBhY3Qgb24gb25lIG9iamVjdCwgaW52b2tlZCBleGFjdGx5IG9uY2UsXG5cdFx0XHQvLyBhbmQgdGhlIGNhcmQgcmVuZGVycyBpbiB0aGUgc3ViYWdlbnQncyBvd24gZ3JvdXAuXG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RTdWJhZ2VudFRvb2wsIHRlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gJ2NsaWVudC10YXNrLTEnO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0ID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0Y29uc3QgcGFyZW50Q2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKHBhcmVudENoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2RlbGVnYXRlIHdvcmsnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKHBhcmVudENoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcGFyZW50VG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6ICd0YXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdEZWxlZ2F0ZWQgVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcsIHN1YmFnZW50Q2hhdFVyaTogc3ViYWdlbnRDaGF0IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihwYXJlbnRDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZyB0YXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgc3ViYWdlbnQgcnVucyBhIGNsaWVudCB0b29sLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3N1Yi10dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3N1Yi10dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAncnVuVGFzay1jYWxsLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0KSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3J1blRhc2stY2FsbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdC8vIFRoZSBob3N0IHJlcG9ydHMgaXQgYXMgYSBydW5uaW5nIGNsaWVudC1leGVjdXRpb24gb2JsaWdhdGlvbi5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShiYWNrZW5kU2Vzc2lvbiksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRTZXQsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRpZDogJ2V4ZWMtMScsXG5cdFx0XHRcdFx0a2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENsaWVudEV4ZWN1dGlvbixcblx0XHRcdFx0XHRjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCxcblx0XHRcdFx0XHRjaGF0OiBzdWJhZ2VudENoYXQsXG5cdFx0XHRcdFx0dHVybklkOiAnc3ViLXR1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdydW5UYXNrLWNhbGwtMScsXG5cdFx0XHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gKHNlc3Npb24gYXMgdW5rbm93biBhcyB7IHByb2dyZXNzT2JzOiB7IGdldCgpOiBJQ2hhdFByb2dyZXNzW10gfSB9KS5wcm9ncmVzc09icy5nZXQoKVxuXHRcdFx0XHQuZmluZCgocGFydCk6IHBhcnQgaXMgQ2hhdFRvb2xJbnZvY2F0aW9uID0+IHBhcnQgaW5zdGFuY2VvZiBDaGF0VG9vbEludm9jYXRpb24gJiYgcGFydC50b29sQ2FsbElkID09PSAncnVuVGFzay1jYWxsLTEnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlbmRlcmVkSW5TdWJhZ2VudEdyb3VwOiByZW5kZXJlZD8uc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRcdHJlbmRlcmVkSXNUaGVCZWd1bkludm9jYXRpb246IHJlbmRlcmVkID09PSB0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHMuZmluZChpbnYgPT4gaW52LnRvb2xDYWxsSWQgPT09ICdydW5UYXNrLWNhbGwtMScpLFxuXHRcdFx0XHRiZWd1bjogdG9vbHNTZXJ2aWNlLmJlZ3VuVG9vbENhbGxzLmZpbHRlcihpbnYgPT4gaW52LnRvb2xDYWxsSWQgPT09ICdydW5UYXNrLWNhbGwtMScpLmxlbmd0aCxcblx0XHRcdFx0aW52b2tlZDogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMuZmlsdGVyKGludiA9PiBpbnYuY2hhdFN0cmVhbVRvb2xDYWxsSWQgPT09ICdydW5UYXNrLWNhbGwtMScpLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVuZGVyZWRJblN1YmFnZW50R3JvdXA6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlbmRlcmVkSXNUaGVCZWd1bkludm9jYXRpb246IHRydWUsXG5cdFx0XHRcdGJlZ3VuOiAxLFxuXHRcdFx0XHRpbnZva2VkOiAxLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgncnVucyBhbiB1bmNsYWltZWQgbm9uLWNvbmZpcm1hYmxlIGNsaWVudCB0b29sIGhlYWRsZXNzbHkgd2l0aG91dCB3YWl0aW5nIGZvciB0aGUgZ3JhY2Ugd2luZG93JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbiwgJ3Rhc2stY2FsbC0xJyk7XG5cdFx0XHRhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAnZXhlY3V0aW9uLTEnLFxuXHRcdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sXG5cdFx0XHRcdFx0Y2hhdDogc3ViYWdlbnRDaGF0LFxuXHRcdFx0XHRcdHR1cm5JZDogJ3N1YmFnZW50LXR1cm4tMScsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQsXG5cdFx0XHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdjbGllbnQtdG9vbC0xJyxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gTm8gZ3JhY2Ugd2FpdDogYSBub24tY29uZmlybWFibGUgdG9vbCB0aGF0IG5vYm9keSBpcyByZW5kZXJpbmdcblx0XHRcdC8vIHJ1bnMgaW1tZWRpYXRlbHkgYW5kIGhlYWRsZXNzbHkuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Ly8gRXhlY3V0ZWQgaGVhZGxlc3NseTogbm8gY2hhdCBgY29udGV4dGAsIHNvIHRoZSBpbnZvY2F0aW9uIGRvZXNcblx0XHRcdFx0Ly8gbm90IGRlcGVuZCBvbiB0aGUgb3duaW5nIHR1cm4gc3RpbGwgYmVpbmcgbGl2ZS5cblx0XHRcdFx0aW52b2NhdGlvbjogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMubWFwKGNhbGwgPT4gKHtcblx0XHRcdFx0XHRjYWxsSWQ6IGNhbGwuY2FsbElkLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IGNhbGwucGFyYW1ldGVycyxcblx0XHRcdFx0XHRoYXNDb250ZXh0OiBjYWxsLmNvbnRleHQgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwcmVBcHByb3ZlZEtpbmQ6IGNhbGwucHJlQXBwcm92ZWQ/LnR5cGUsXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0Y29tcGxldGlvbjogY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+XG5cdFx0XHRcdFx0ZW50cnkuY2hhbm5lbCA9PT0gc3ViYWdlbnRDaGF0XG5cdFx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpbnZvY2F0aW9uOiBbe1xuXHRcdFx0XHRcdGNhbGxJZDogJ2NsaWVudC10b29sLTEnLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHsgdGFzazogJ2J1aWxkJyB9LFxuXHRcdFx0XHRcdGhhc0NvbnRleHQ6IGZhbHNlLFxuXHRcdFx0XHRcdHByZUFwcHJvdmVkS2luZDogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGNvbXBsZXRpb246IHtcblx0XHRcdFx0XHRjaGFubmVsOiBzdWJhZ2VudENoYXQsXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdFx0dHVybklkOiAnc3ViYWdlbnQtdHVybi0xJyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdjbGllbnQtdG9vbC0xJyxcblx0XHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIHJ1blRhc2snLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdkb25lJyB9XSxcblx0XHRcdFx0XHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ2V4ZWN1dGVzIGEgY2xhaW1lZCBjbGllbnQgdG9vbCBleGFjdGx5IG9uY2UsIHdpdGggY2hhdCBjb250ZXh0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbik7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoY2hhdCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biB0aGUgdGFzaycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGNoYXQpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjbGllbnQtdG9vbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGNoYXQpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjbGllbnQtdG9vbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAnZXhlY3V0aW9uLTEnLFxuXHRcdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sXG5cdFx0XHRcdFx0Y2hhdCxcblx0XHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAnY2xpZW50LXRvb2wtMScsXG5cdFx0XHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHQvLyBBIGxpdmUgdHVybiBvYnNlcnZlciByZW5kZXJzIHRoZSBjYWxsLCBzbyB0aGUgd2F0Y2hlciBydW5zIGl0XG5cdFx0XHRcdC8vIG9uY2Ugd2l0aCBjaGF0IGNvbnRleHQgKG5vdCBwZXItb2JzZXJ2ZXIsIG5vdCBoZWFkbGVzcykuXG5cdFx0XHRcdGludm9jYXRpb25zOiB0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxsc1xuXHRcdFx0XHRcdC5maWx0ZXIoaW52b2NhdGlvbiA9PiBpbnZvY2F0aW9uLmNoYXRTdHJlYW1Ub29sQ2FsbElkID09PSAnY2xpZW50LXRvb2wtMScpXG5cdFx0XHRcdFx0Lm1hcChpbnZvY2F0aW9uID0+IGludm9jYXRpb24uY29udGV4dCAhPT0gdW5kZWZpbmVkKSxcblx0XHRcdFx0ZGVjbGluZXM6IGNvbm5lY3Rpb24uZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGVudHJ5ID0+XG5cdFx0XHRcdFx0ZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGVcblx0XHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24ucmVzdWx0LmVycm9yPy5jb2RlID09PSAnY2xpZW50VW5hdmFpbGFibGUnKS5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGludm9jYXRpb25zOiBbdHJ1ZV0sXG5cdFx0XHRcdGRlY2xpbmVzOiAwLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHdvIHNpYmxpbmcgcmVzb3VyY2VzIChkZWZhdWx0IGNoYXQgKyBwZWVyIGNoYXQpIHNoYXJlIG9uZSBiYWNrZW5kXG5cdFx0Ly8gc2Vzc2lvbiBhbmQgdGhlcmVmb3JlIG9uZSBzZXNzaW9uLWxldmVsIGBpbnB1dE5lZWRlZGAgcXVldWUuIE9wZW5pbmdcblx0XHQvLyBlYWNoIHVzZWQgdG8gaW5zdGFsbCBpdHMgb3duIHdhdGNoZXIsIHNvIGEgc2luZ2xlIGNsaWVudC10b29sIHJlcXVlc3Rcblx0XHQvLyB3YXMgaW52b2tlZCBvbmNlIHBlciBvcGVuIHJlc291cmNlIFx1MjAxNCBydW5uaW5nIHJlYWwgc2lkZSBlZmZlY3RzIE5cblx0XHQvLyB0aW1lcy4gVGhlIHdhdGNoZXIgaXMgbm93IHJlZi1jb3VudGVkIHBlciBiYWNrZW5kIHNlc3Npb24sIHNvIGl0XG5cdFx0Ly8gZXhlY3V0ZXMgZXhhY3RseSBvbmNlIG5vIG1hdHRlciBob3cgbWFueSBzaWJsaW5ncyBhcmUgb3Blbi5cblx0XHRhc3luYyBmdW5jdGlvbiBvcGVuU2libGluZ1Jlc291cmNlc1dpdGhDbGFpbWVkQ2xpZW50VG9vbChcblx0XHRcdGhhbmRsZXI6IEFnZW50SG9zdFNlc3Npb25IYW5kbGVyLFxuXHRcdFx0Y29ubmVjdGlvbjogTW9ja0FnZW50SG9zdENvbm5lY3Rpb24sXG5cdFx0KTogUHJvbWlzZTx7IHNlc3Npb25SZXNvdXJjZTogVVJJOyBwZWVyUmVzb3VyY2U6IFVSSTsgY2hhdDogc3RyaW5nIH0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IHBlZXJSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90JywgcGF0aDogJy9zZXNzaW9uLTEnLCBmcmFnbWVudDogJ3BlZXItMScgfSk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gYnVpbGRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uLCAncGVlci0xJyk7XG5cdFx0XHRjb25zdCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6IGJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bW9kaWZpZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBBZHZlcnRpc2UgdGhlIHBlZXIgY2hhdCBzbyB0aGUgc2libGluZyByZXNvdXJjZSByZXNvbHZlcyBhbmRcblx0XHRcdC8vIGluc3RhbGxzIGl0cyBvd24gdHVybi9pbnB1dE5lZWRlZCB3YXRjaGVycyBhZ2FpbnN0IHRoZSBzaGFyZWRcblx0XHRcdC8vIGJhY2tlbmQgc2Vzc2lvbi5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShiYWNrZW5kU2Vzc2lvbiksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ2hhdEFkZGVkLFxuXHRcdFx0XHRzdW1tYXJ5OiBjcmVhdGVEZWZhdWx0Q2hhdFN1bW1hcnkoc3VtbWFyeSwgcGVlckNoYXQpLFxuXHRcdFx0fSBhcyBTZXNzaW9uQWN0aW9uKTtcblxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGNoYXQpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdydW4gdGhlIHRhc2snLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShjaGF0KSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2xpZW50LXRvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShjaGF0KSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2xpZW50LXRvb2wtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE9ubHkgdGhlIGRlZmF1bHQgY2hhdCBjYXJyaWVzIHRoZSB0b29sIGNhbGwsIHNvIG9ubHkgaXRzIG9ic2VydmVyXG5cdFx0XHQvLyBjbGFpbXMgaXQgXHUyMDE0IHRoZSBwZWVyIG9ic2VydmVyIHJlbmRlcnMgYW4gZW1wdHkgY2hhdC5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHBlZXJSZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFwcGx5UnVubmluZ0NsaWVudEV4ZWN1dGlvbihjb25uZWN0aW9uLCBjaGF0LCAndHVybi0xJywge1xuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2xpZW50LXRvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUwMDEpO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvblJlc291cmNlLCBwZWVyUmVzb3VyY2UsIGNoYXQgfTtcblx0XHR9XG5cblx0XHR0ZXN0KCd0d28gc2libGluZyByZXNvdXJjZXMgb24gb25lIGJhY2tlbmQgc2Vzc2lvbiBleGVjdXRlIGEgY2xpZW50IHRvb2wgZXhhY3RseSBvbmNlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0YXdhaXQgb3BlblNpYmxpbmdSZXNvdXJjZXNXaXRoQ2xhaW1lZENsaWVudFRvb2woaGFuZGxlciwgY29ubmVjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpbnZvY2F0aW9uczogdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMuZmlsdGVyKGludm9jYXRpb24gPT4gaW52b2NhdGlvbi5jaGF0U3RyZWFtVG9vbENhbGxJZCA9PT0gJ2NsaWVudC10b29sLTEnKS5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGludm9jYXRpb25zOiAxLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnYSBjbGFpbWVkIGNsaWVudCB0b29sIGV4ZWN1dGVzIHdpdGggdGhlIGNsYWltaW5nIG9ic2VydmVyXFwncyBzZXNzaW9uIHJlc291cmNlIGFzIGNvbnRleHQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25SZXNvdXJjZSB9ID0gYXdhaXQgb3BlblNpYmxpbmdSZXNvdXJjZXNXaXRoQ2xhaW1lZENsaWVudFRvb2woaGFuZGxlciwgY29ubmVjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRvb2xzU2VydmljZS5pbnZva2VkVG9vbENhbGxzXG5cdFx0XHRcdFx0LmZpbHRlcihpbnZvY2F0aW9uID0+IGludm9jYXRpb24uY2hhdFN0cmVhbVRvb2xDYWxsSWQgPT09ICdjbGllbnQtdG9vbC0xJylcblx0XHRcdFx0XHQubWFwKGludm9jYXRpb24gPT4gaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdFtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKV0sXG5cdFx0XHQpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ2RlbmllcyBhbiB1bmNsYWltZWQgY29uZmlybWFibGUgY2xpZW50IHRvb2wgYWZ0ZXIgdGhlIGdyYWNlIHdpbmRvdyB3aXRob3V0IGV4ZWN1dGluZyBpdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0Q29uZmlybVRvb2xdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0ID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sICd0YXNrLWNhbGwtMScpO1xuXHRcdFx0YXdhaXQgaGFuZGxlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdC8vIEEgdG9vbCB0aGF0IG1pZ2h0IGFzayBmb3IgY29uZmlybWF0aW9uLCB3aXRoIG5vIG9ic2VydmVyIHRvIHJlbmRlclxuXHRcdFx0Ly8gaXQ6IHJ1bm5pbmcgaGVhZGxlc3NseSB3b3VsZCBwb3AgYSBtb2RhbCBub2JvZHkgY291bGQgYW5zd2VyLCBzb1xuXHRcdFx0Ly8gdGhlIHdhdGNoZXIgd2FpdHMgYW5kIHRoZW4gZGVuaWVzIG9uY2UgdGhlIGdyYWNlIHdpbmRvdyBleHBpcmVzLlxuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAnZXhlY3V0aW9uLTEnLFxuXHRcdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sXG5cdFx0XHRcdFx0Y2hhdDogc3ViYWdlbnRDaGF0LFxuXHRcdFx0XHRcdHR1cm5JZDogJ3N1YmFnZW50LXR1cm4tMScsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQsXG5cdFx0XHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdjbGllbnQtdG9vbC0xJyxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAnZGVsZXRlQWxsJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnRGVsZXRlIEV2ZXJ5dGhpbmcnLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxldGUgZXZlcnl0aGluZycsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6ICd7fScsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBjb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCg1MDAxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGludm9jYXRpb25zOiB0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxscy5maWx0ZXIoaW52b2NhdGlvbiA9PiBpbnZvY2F0aW9uLmNoYXRTdHJlYW1Ub29sQ2FsbElkID09PSAnY2xpZW50LXRvb2wtMScpLmxlbmd0aCxcblx0XHRcdFx0ZGVuaWFsOiBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbmQoZW50cnkgPT5cblx0XHRcdFx0XHRlbnRyeS5jaGFubmVsID09PSBzdWJhZ2VudENoYXRcblx0XHRcdFx0XHQmJiBlbnRyeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZVxuXHRcdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAnY2xpZW50LXRvb2wtMScpPy5hY3Rpb24sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGludm9jYXRpb25zOiAwLFxuXHRcdFx0XHRkZW5pYWw6IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdHR1cm5JZDogJ3N1YmFnZW50LXR1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2NsaWVudC10b29sLTEnLFxuXHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnQ291bGRuXFwndCBydW4gRGVsZXRlIEV2ZXJ5dGhpbmcnLFxuXHRcdFx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogJ0RlbGV0ZSBFdmVyeXRoaW5nIG5lZWRzIGNvbmZpcm1hdGlvbiBidXQgbm8gc2Vzc2lvbiB3YXMgYXZhaWxhYmxlIHRvIGFuc3dlciBpdC4nLFxuXHRcdFx0XHRcdFx0XHRjb2RlOiAnY2xpZW50VW5hdmFpbGFibGUnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcnVuIGZvcmVpZ24gb3IgYWxyZWFkeS1yZXNvbHZlZCBjbGllbnQgdG9vbHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbiwgJ3Rhc2stY2FsbC0xJyk7XG5cdFx0XHRhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSB7XG5cdFx0XHRcdGlkOiAnZXhlY3V0aW9uLTEnLFxuXHRcdFx0XHRraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ2xpZW50RXhlY3V0aW9uLFxuXHRcdFx0XHRjaGF0OiBzdWJhZ2VudENoYXQsXG5cdFx0XHRcdHR1cm5JZDogJ3N1YmFnZW50LXR1cm4tMScsXG5cdFx0XHRcdGNsaWVudElkOiAnb3RoZXItY2xpZW50Jyxcblx0XHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2NsaWVudC10b29sLTEnLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdvdGhlci1jbGllbnQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9IGFzIGNvbnN0O1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdCxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFNldCxcblx0XHRcdFx0cmVxdWVzdDogeyAuLi5yZXF1ZXN0LCBpZDogJ2V4ZWN1dGlvbi0yJywgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJhY2tlbmRTZXNzaW9uKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFJlbW92ZWQsXG5cdFx0XHRcdGlkOiAnZXhlY3V0aW9uLTInLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUwMDEpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5zb21lKGVudHJ5ID0+IGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKSwgZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ2ludm9rZXMgYSBjbGllbnQgdG9vbCBpbnNpZGUgYSBzdWJhZ2VudCBzZXNzaW9uIGFuZCBkaXNwYXRjaGVzIGNvbXBsZXRpb24gYWdhaW5zdCB0aGUgc3ViYWdlbnQgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmVncmVzc2lvbjogYSBjbGllbnQtcHJvdmlkZWQgdG9vbCBydW5uaW5nIGluc2lkZSBhIHN1YmFnZW50XG5cdFx0XHQvLyBtdXN0IGJlIGludm9rZWQgbG9jYWxseSAodGhlIHJlbmRlcmVyIG93bnMgdGhlIHRvb2xcblx0XHRcdC8vIGltcGxlbWVudGF0aW9uLCBub3QgdGhlIGFnZW50IGhvc3QpLiBCZWZvcmUgdGhlIGZpeCwgdGhlXG5cdFx0XHQvLyByZW5kZXJlciBza2lwcGVkIGxvY2FsIGludm9jYXRpb24gZm9yIHN1YmFnZW50IHRvb2wgY2FsbHMsXG5cdFx0XHQvLyBsZWF2aW5nIHRoZSBzdWJhZ2VudCdzIGRlZmVycmVkIHVucmVzb2x2ZWQuIEFmdGVyIHRoZSBmaXggdGhlXG5cdFx0XHQvLyB0b29sIGlzIGludm9rZWQgbG9jYWxseSBhbmQgdGhlIENoYXRUb29sQ2FsbENvbXBsZXRlIGlzXG5cdFx0XHQvLyBkaXNwYXRjaGVkIGFnYWluc3QgdGhlIHN1YmFnZW50IHNlc3Npb24gVVJJIFx1MjAxNCB0aGUgYWdlbnQgdGhlblxuXHRcdFx0Ly8gcmVzb2x2ZXMgaXQgYmFjayB0byB0aGUgcGFyZW50IHNlc3Npb24gdGhhdCBvd25zIHRoZSBkZWZlcnJlZC5cblx0XHRcdGNvbnN0IHsgaGFuZGxlciwgY29ubmVjdGlvbiwgdG9vbHNTZXJ2aWNlIH0gPSBjcmVhdGVIYW5kbGVyV2l0aE1vY2tzKGRpc3Bvc2FibGVzLCBbdGVzdFJ1blRhc2tUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSAndGMtcGFyZW50LXRhc2snO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0ID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sIHBhcmVudFRvb2xDYWxsSWQpO1xuXG5cdFx0XHQvLyBQYXJlbnQgdHVybiB3aXRoIGEgYHRhc2tgIHRvb2wgdGhhdCBzcGF3bnMgYSBzdWJhZ2VudC5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2RvIHdvcmsnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcGFyZW50VG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6ICd0YXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUYXNrJyxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBwYXJlbnRUb29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NwYXduaW5nIHN1YmFnZW50Jyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBwYXJlbnRUb29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsIHJlc291cmNlOiBzdWJhZ2VudENoYXQsIHRpdGxlOiAnU3ViYWdlbnQnIH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFN1YmFnZW50IHR1cm4gY2FycnlpbmcgYSBjbGllbnQtcHJvdmlkZWQgdG9vbCBjYWxsICh0b29sQ2xpZW50SWRcblx0XHRcdC8vIG1hdGNoZXMgdGhlIHJlbmRlcmVyJ3MgY2xpZW50SWQgc28gdGhlIHJlbmRlcmVyIG93bnMgdGhlXG5cdFx0XHQvLyBpbnZvY2F0aW9uKS5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0KSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXRvb2wtY2FsbC0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAnc3ViLXR1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci10b29sLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXBwbHlSdW5uaW5nQ2xpZW50RXhlY3V0aW9uKGNvbm5lY3Rpb24sIHN1YmFnZW50Q2hhdCwgJ3N1Yi10dXJuLTEnLCB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci10b29sLWNhbGwtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdC8vIFRoZSBpbm5lciBjbGllbnQgdG9vbCBtdXN0IGhhdmUgYmVlbiBpbnZva2VkIGxvY2FsbHkgXHUyMDE0IHdpdGhvdXRcblx0XHRcdC8vIHRoZSBmaXggdGhlIHJlbmRlcmVyIHdvdWxkIHNraXAgc3ViYWdlbnQgY2xpZW50LXRvb2wgc2V0dXAgYW5kXG5cdFx0XHQvLyBgaW52b2tlZFRvb2xDYWxsc2Agd291bGQgYmUgZW1wdHkgZm9yIHRoZSBpbm5lciBjYWxsLlxuXHRcdFx0Y29uc3QgaW5uZXJJbnZvY2F0aW9uID0gdG9vbHNTZXJ2aWNlLmludm9rZWRUb29sQ2FsbHMuZmluZChjYWxsID0+IGNhbGwuY2FsbElkID09PSAnaW5uZXItdG9vbC1jYWxsLTEnKTtcblx0XHRcdGFzc2VydC5vayhpbm5lckludm9jYXRpb24sICdpbm5lciBjbGllbnQgdG9vbCBpbnNpZGUgdGhlIHN1YmFnZW50IHNob3VsZCBiZSBpbnZva2VkIGxvY2FsbHknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbm5lckludm9jYXRpb24hLnRvb2xJZCwgJ3ZzY29kZS5ydW5UYXNrJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGlubmVySW52b2NhdGlvbiEucGFyYW1ldGVycywgeyB0YXNrOiAnYnVpbGQnIH0pO1xuXG5cdFx0XHQvLyBUaGUgY29tcGxldGlvbiBtdXN0IGJlIGRpc3BhdGNoZWQgYWdhaW5zdCB0aGUgc3ViYWdlbnQgc2Vzc2lvblxuXHRcdFx0Ly8gVVJJICh0aGUgYWdlbnQgd2lsbCB0aGVuIHJlc29sdmUgaXQgdG8gdGhlIHBhcmVudCBzZXNzaW9uIHRoYXRcblx0XHRcdC8vIG93bnMgdGhlIFNESyBkZWZlcnJlZCkuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9uRW50cnkgPSBjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLmZpbmQoZW50cnkgPT5cblx0XHRcdFx0aXNDaGF0QWN0aW9uKGVudHJ5LmFjdGlvbilcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGVcblx0XHRcdFx0JiYgZW50cnkuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICdpbm5lci10b29sLWNhbGwtMSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soY29tcGxldGlvbkVudHJ5LCAnY29tcGxldGlvbiBmb3IgdGhlIGlubmVyIGNsaWVudCB0b29sIHNob3VsZCBiZSBkaXNwYXRjaGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNvbXBsZXRpb25FbnRyeS5jaGFubmVsLnRvU3RyaW5nKCksXG5cdFx0XHRcdHN1YmFnZW50Q2hhdCxcblx0XHRcdFx0J2NvbXBsZXRpb24gc2hvdWxkIHRhcmdldCB0aGUgc3ViYWdlbnQgZGVmYXVsdCBjaGF0IFVSSSdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvYnNlcnZlcyBjaGlsZCB0b29scyBmcm9tIGEgY2xpZW50LXByb3ZpZGVkIGRlbGVnYXRlZCB0YXNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0U3ViYWdlbnRUb29sXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSAnY2xpZW50LXRhc2stMSc7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbiwgcGFyZW50VG9vbENhbGxJZCk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2RlbGVnYXRlIHdvcmsnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcGFyZW50VG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6ICd0YXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdEZWxlZ2F0ZWQgVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcsIHN1YmFnZW50Q2hhdFVyaTogc3ViYWdlbnRDaGF0IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGNvbnN0IHBhcmVudEludm9jYXRpb24gPSB0b29sc1NlcnZpY2UuYmVndW5Ub29sQ2FsbHMuZmluZChwYXJ0ID0+IHBhcnQudG9vbENhbGxJZCA9PT0gcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyZW50SW52b2NhdGlvbj8udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcGFyZW50VG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nIHRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7fScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBUaGUgZGVsZWdhdGVkIGB0YXNrYCB0b29sIGlzIGNsaWVudC1jb250cmlidXRlZCwgc28gdGhlIHdhdGNoZXJcblx0XHRcdC8vIHJ1bnMgaXQgbG9jYWxseTsgaW52b2tpbmcgaXQgaXMgd2hhdCBwcmVwYXJlcyB0aGUgc3ViYWdlbnRcblx0XHRcdC8vIGNvbnRhaW5lciAobW9jayBzZXRzIHRoZSBgUHJlcGFyZWQgZGVsZWdhdGVkIHRhc2tgIGRlc2NyaXB0aW9uKS5cblx0XHRcdGFwcGx5UnVubmluZ0NsaWVudEV4ZWN1dGlvbihjb25uZWN0aW9uLCBidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSwgJ3R1cm4tMScsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogcGFyZW50VG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6ICd0YXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdEZWxlZ2F0ZWQgVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZyB0YXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0KSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NoaWxkLXRvb2wtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnQmFzaCcsXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3N1Yi10dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2hpbGQtdG9vbC0xJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdJbnNwZWN0aW5nIGNoYW5nZXMnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7fScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRjb25zdCBwcm9ncmVzcyA9IChzZXNzaW9uIGFzIHVua25vd24gYXMgeyBwcm9ncmVzc09iczogeyBnZXQoKTogSUNoYXRQcm9ncmVzc1tdIH0gfSkucHJvZ3Jlc3NPYnMuZ2V0KCk7XG5cdFx0XHRjb25zdCBjaGlsZEludm9jYXRpb25zID0gcHJvZ3Jlc3MuZmlsdGVyKChwYXJ0KTogcGFydCBpcyBDaGF0VG9vbEludm9jYXRpb24gPT5cblx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIENoYXRUb29sSW52b2NhdGlvbiAmJiBwYXJ0LnRvb2xDYWxsSWQgPT09ICdjaGlsZC10b29sLTEnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwYXJlbnQ6IHBhcmVudEludm9jYXRpb24/LnRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRcdGNoaWxkQ291bnQ6IGNoaWxkSW52b2NhdGlvbnMubGVuZ3RoLFxuXHRcdFx0XHRjaGlsZFN1YkFnZW50SW52b2NhdGlvbklkOiBjaGlsZEludm9jYXRpb25zWzBdPy5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cGFyZW50OiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1ByZXBhcmVkIGRlbGVnYXRlZCB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6IHN1YmFnZW50Q2hhdCxcblx0XHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRzdGFydGVkQXQ6IERhdGUucGFyc2UoJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicpLFxuXHRcdFx0XHRcdGR1cmF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNoaWxkQ291bnQ6IDEsXG5cdFx0XHRcdGNoaWxkU3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ludm9rZXMgYSBjbGllbnQgdG9vbCBpbnNpZGUgYSBuZXN0ZWQgKGxldmVsLTIpIHN1YmFnZW50IGFuZCBncm91cHMgaXQgdW5kZXIgdGhlIHJvb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uOiBhIHN1YmFnZW50IHNwYXduZWQgYnkgYW5vdGhlciBzdWJhZ2VudCB3YXMgbm90XG5cdFx0XHQvLyBvYnNlcnZlZCAob2JzZXJ2YXRpb24gc3RvcHBlZCBhdCB0aGUgZmlyc3QgbGV2ZWwpLCBzbyBhIGNsaWVudFxuXHRcdFx0Ly8gdG9vbCBkZWVwIGluIHRoZSB0cmVlIG5ldmVyIHJhbi4gV2l0aCByZWN1cnNpdmUgb2JzZXJ2YXRpb24gdGhlXG5cdFx0XHQvLyBsZXZlbC0yIGNsaWVudCB0b29sIGlzIGludm9rZWQgbG9jYWxseSwgaXRzIGNvbXBsZXRpb24gaXNcblx0XHRcdC8vIGRpc3BhdGNoZWQgYWdhaW5zdCB0aGUgbGV2ZWwtMiBzdWJhZ2VudCBjaGF0LCBhbmQgaXQgaXMgZ3JvdXBlZFxuXHRcdFx0Ly8gdW5kZXIgdGhlIFJPT1Qgc3ViYWdlbnQgaW52b2NhdGlvbiBzbyB0aGUgcmVuZGVyZXIgbmVzdHMgdGhlXG5cdFx0XHQvLyB3aG9sZSB0cmVlIHVuZGVyIG9uZSBjb250YWluZXIuXG5cdFx0XHRjb25zdCB7IGhhbmRsZXIsIGNvbm5lY3Rpb24sIHRvb2xzU2VydmljZSB9ID0gY3JlYXRlSGFuZGxlcldpdGhNb2NrcyhkaXNwb3NhYmxlcywgW3Rlc3RSdW5UYXNrVG9vbF0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCByb290VG9vbENhbGxJZCA9ICd0Yy1sMS10YXNrJztcblx0XHRcdGNvbnN0IG5lc3RlZFRvb2xDYWxsSWQgPSAndGMtbDItdGFzayc7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQxID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sIHJvb3RUb29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50Q2hhdDIgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbiwgbmVzdGVkVG9vbENhbGxJZCk7XG5cblx0XHRcdC8vIERlZmF1bHQgdHVybiBzcGF3bnMgdGhlIGxldmVsLTEgc3ViYWdlbnQuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQ6ICd0dXJuLTEnLCBzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdkbyB3b3JrJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHJvb3RUb29sQ2FsbElkLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbikpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHJvb3RUb29sQ2FsbElkLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1NwYXduaW5nIHN1YmFnZW50JywgdG9vbElucHV0OiAne30nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoYmFja2VuZFNlc3Npb24pKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiByb290VG9vbENhbGxJZCwgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50LCByZXNvdXJjZTogc3ViYWdlbnRDaGF0MSwgdGl0bGU6ICdTdWJhZ2VudCBMMScgfV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTGV2ZWwtMSBzdWJhZ2VudCBzcGF3bnMgdGhlIGxldmVsLTIgc3ViYWdlbnQuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3N1Yi10dXJuLTEnLCBzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQxKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogbmVzdGVkVG9vbENhbGxJZCwgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgX21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdDEpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3N1Yi10dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBuZXN0ZWRUb29sQ2FsbElkLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1NwYXduaW5nIG5lc3RlZCBzdWJhZ2VudCcsIHRvb2xJbnB1dDogJ3t9JywgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQxKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICdzdWItdHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogbmVzdGVkVG9vbENhbGxJZCwgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50LCByZXNvdXJjZTogc3ViYWdlbnRDaGF0MiwgdGl0bGU6ICdTdWJhZ2VudCBMMicgfV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTGV2ZWwtMiBzdWJhZ2VudCBydW5zIGEgY2xpZW50LXByb3ZpZGVkIHRvb2wuXG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MiksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3N1Yi10dXJuLTInLCBzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQyKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICdzdWItdHVybi0yJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2RlZXAtdG9vbC1jYWxsJywgdG9vbE5hbWU6ICdydW5UYXNrJywgZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IGNvbm5lY3Rpb24uY2xpZW50SWQgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdDIpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3N1Yi10dXJuLTInLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnZGVlcC10b29sLWNhbGwnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBUYXNrJywgdG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBoYW5kbGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFwcGx5UnVubmluZ0NsaWVudEV4ZWN1dGlvbihjb25uZWN0aW9uLCBzdWJhZ2VudENoYXQyLCAnc3ViLXR1cm4tMicsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ2RlZXAtdG9vbC1jYWxsJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5UYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwMCAmJiAhY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5zb21lKGUgPT4gaXNDaGF0QWN0aW9uKGUuYWN0aW9uKSAmJiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlICYmIGUuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICdkZWVwLXRvb2wtY2FsbCcpOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVlcEludm9jYXRpb24gPSB0b29sc1NlcnZpY2UuaW52b2tlZFRvb2xDYWxscy5maW5kKGNhbGwgPT4gY2FsbC5jYWxsSWQgPT09ICdkZWVwLXRvb2wtY2FsbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlZXBJbnZvY2F0aW9uLCAnY2xpZW50IHRvb2wgaW5zaWRlIGEgbmVzdGVkIHN1YmFnZW50IHNob3VsZCBiZSBpbnZva2VkIGxvY2FsbHknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVlcEludm9jYXRpb24hLnBhcmFtZXRlcnMsIHsgdGFzazogJ2J1aWxkJyB9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbkVudHJ5ID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+XG5cdFx0XHRcdGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAnZGVlcC10b29sLWNhbGwnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbXBsZXRpb25FbnRyeSwgJ2NvbXBsZXRpb24gZm9yIHRoZSBuZXN0ZWQgY2xpZW50IHRvb2wgc2hvdWxkIGJlIGRpc3BhdGNoZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9uRW50cnkuY2hhbm5lbC50b1N0cmluZygpLCBzdWJhZ2VudENoYXQyLCAnY29tcGxldGlvbiBzaG91bGQgdGFyZ2V0IHRoZSBsZXZlbC0yIHN1YmFnZW50IGNoYXQgVVJJJyk7XG5cblx0XHRcdGNvbnN0IGRlZXBCZWd1biA9IHRvb2xzU2VydmljZS5iZWd1blRvb2xDYWxscy5maW5kKGMgPT4gYy50b29sQ2FsbElkID09PSAnZGVlcC10b29sLWNhbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWVwQmVndW4/LnN1YkFnZW50SW52b2NhdGlvbklkLCByb290VG9vbENhbGxJZCwgJ2Rlc2NlbmRhbnQgdG9vbHMgc2hvdWxkIGJlIGdyb3VwZWQgdW5kZXIgdGhlIHJvb3Qgc3ViYWdlbnQgaW52b2NhdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2JzZXJ2ZXMgYSBuZXN0ZWQgc3ViYWdlbnQgd2l0aG91dCBhIGRpc2NvdmVyeSBjb250ZW50IGJsb2NrIChhZ2VudC1ob3N0IG1pc3JvdXRlcyBpdCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uIGZvciB0aGUgbG9nZ2VkIHN0YWxsOiB0aGUgYWdlbnQgaG9zdCBlbWl0cyB0aGVcblx0XHRcdC8vIHN1YmFnZW50LWRpc2NvdmVyeSBgQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWRgIGJsb2NrIG9uIHRoZVxuXHRcdFx0Ly8gdG9wLWxldmVsIGNoYXQgcmF0aGVyIHRoYW4gdGhlIGltbWVkaWF0ZSBwYXJlbnQgc3ViYWdlbnQgY2hhdFxuXHRcdFx0Ly8gKHRoZSBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsIGNhcnJpZXMgbm8gcGFyZW50IHRvb2wgY2FsbCBpZCksXG5cdFx0XHQvLyBzbyBhIG5lc3RlZCBzdWJhZ2VudCdzIHBhcmVudCBjaGF0IG9ubHkgZXZlciBzZWVzXG5cdFx0XHQvLyBzdGFydCArIHJlYWR5IChSdW5uaW5nKSB3aXRoIGBfbWV0YS50b29sS2luZCA9PT0gJ3N1YmFnZW50J2AuXG5cdFx0XHQvLyBPYnNlcnZhdGlvbiBtdXN0IHRoZXJlZm9yZSBwcm9jZWVkIGZyb20gYF9tZXRhYCBhbG9uZSBcdTIwMTQgd2l0aG91dFxuXHRcdFx0Ly8gaXQgdGhlIGxldmVsLTIgc3ViYWdlbnQgKGFuZCBpdHMgY2xpZW50IHRvb2wpIGlzIG5ldmVyIG9ic2VydmVkXG5cdFx0XHQvLyBhbmQgdGhlIHNlc3Npb24gaGFuZ3MgaW4gXCJJbnB1dCBOZWVkZWRcIiB3aXRoIG5vdGhpbmcgdG8gYWN0IG9uLlxuXHRcdFx0Y29uc3QgeyBoYW5kbGVyLCBjb25uZWN0aW9uLCB0b29sc1NlcnZpY2UgfSA9IGNyZWF0ZUhhbmRsZXJXaXRoTW9ja3MoZGlzcG9zYWJsZXMsIFt0ZXN0UnVuVGFza1Rvb2xdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgcm9vdFRvb2xDYWxsSWQgPSAndGMtbDEtdGFzayc7XG5cdFx0XHRjb25zdCBuZXN0ZWRUb29sQ2FsbElkID0gJ3RjLWwyLXRhc2snO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0MSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uLCByb290VG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQyID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoYmFja2VuZFNlc3Npb24sIG5lc3RlZFRvb2xDYWxsSWQpO1xuXG5cdFx0XHQvLyBEZWZhdWx0IHR1cm4gc3Bhd25zIHRoZSBsZXZlbC0xIHN1YmFnZW50IChubyBjb250ZW50IGJsb2NrKS5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsIHR1cm5JZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2RvIHdvcmsnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcm9vdFRvb2xDYWxsSWQsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uKSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogcm9vdFRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnU3Bhd25pbmcgc3ViYWdlbnQnLCB0b29sSW5wdXQ6ICd7fScsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIExldmVsLTEgc3ViYWdlbnQgc3Bhd25zIHRoZSBsZXZlbC0yIHN1YmFnZW50IChubyBjb250ZW50IGJsb2NrKS5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQxKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiAnc3ViLXR1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdDEpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3N1Yi10dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBuZXN0ZWRUb29sQ2FsbElkLCB0b29sTmFtZTogJ3Rhc2snLCBkaXNwbGF5TmFtZTogJ1Rhc2snLCBfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MSksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAnc3ViLXR1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IG5lc3RlZFRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnU3Bhd25pbmcgbmVzdGVkIHN1YmFnZW50JywgdG9vbElucHV0OiAne30nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBMZXZlbC0yIHN1YmFnZW50IHJ1bnMgYSBjbGllbnQtcHJvdmlkZWQgdG9vbC5cblx0XHRcdGNvbm5lY3Rpb24uYXBwbHlTZXNzaW9uQWN0aW9uKFVSSS5wYXJzZShzdWJhZ2VudENoYXQyKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiAnc3ViLXR1cm4tMicsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29ubmVjdGlvbi5hcHBseVNlc3Npb25BY3Rpb24oVVJJLnBhcnNlKHN1YmFnZW50Q2hhdDIpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3N1Yi10dXJuLTInLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnZGVlcC10b29sLWNhbGwnLCB0b29sTmFtZTogJ3J1blRhc2snLCBkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25uZWN0aW9uLmFwcGx5U2Vzc2lvbkFjdGlvbihVUkkucGFyc2Uoc3ViYWdlbnRDaGF0MiksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAnc3ViLXR1cm4tMicsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdkZWVwLXRvb2wtY2FsbCcsIGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLCB0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXBwbHlSdW5uaW5nQ2xpZW50RXhlY3V0aW9uKGNvbm5lY3Rpb24sIHN1YmFnZW50Q2hhdDIsICdzdWItdHVybi0yJywge1xuXHRcdFx0XHR0b29sQ2FsbElkOiAnZGVlcC10b29sLWNhbGwnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1blRhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjAwICYmICFjb25uZWN0aW9uLmRpc3BhdGNoZWRBY3Rpb25zLnNvbWUoZSA9PiBpc0NoYXRBY3Rpb24oZS5hY3Rpb24pICYmIGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUgJiYgZS5hY3Rpb24udG9vbENhbGxJZCA9PT0gJ2RlZXAtdG9vbC1jYWxsJyk7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWVwSW52b2NhdGlvbiA9IHRvb2xzU2VydmljZS5pbnZva2VkVG9vbENhbGxzLmZpbmQoY2FsbCA9PiBjYWxsLmNhbGxJZCA9PT0gJ2RlZXAtdG9vbC1jYWxsJyk7XG5cdFx0XHRhc3NlcnQub2soZGVlcEludm9jYXRpb24sICdjbGllbnQgdG9vbCBpbnNpZGUgYSBjb250ZW50LWJsb2NrLWxlc3MgbmVzdGVkIHN1YmFnZW50IHNob3VsZCBzdGlsbCBiZSBpbnZva2VkIGxvY2FsbHknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVlcEludm9jYXRpb24hLnBhcmFtZXRlcnMsIHsgdGFzazogJ2J1aWxkJyB9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbkVudHJ5ID0gY29ubmVjdGlvbi5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGVudHJ5ID0+XG5cdFx0XHRcdGlzQ2hhdEFjdGlvbihlbnRyeS5hY3Rpb24pXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlXG5cdFx0XHRcdCYmIGVudHJ5LmFjdGlvbi50b29sQ2FsbElkID09PSAnZGVlcC10b29sLWNhbGwnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbXBsZXRpb25FbnRyeSwgJ2NvbXBsZXRpb24gZm9yIHRoZSBuZXN0ZWQgY2xpZW50IHRvb2wgc2hvdWxkIGJlIGRpc3BhdGNoZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0aW9uRW50cnkuY2hhbm5lbC50b1N0cmluZygpLCBzdWJhZ2VudENoYXQyLCAnY29tcGxldGlvbiBzaG91bGQgdGFyZ2V0IHRoZSBsZXZlbC0yIHN1YmFnZW50IGNoYXQgVVJJJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUIsZUFBZTtBQUN6QyxTQUFTLGNBQWMsZ0JBQWdCO0FBQ3ZDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQTZCLG9CQUFvQjtBQUMxRCxTQUFT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LE9BQUssYUFBYSxFQUFFLE1BQU0sS0FBSyxFQUFFLE9BQU8sU0FBUyxXQUFXLHdCQUF3QixFQUFFLE9BQU8sZUFBZSxnQkFBZ0IsR0FBRyxLQUFLO0FBQ2pNLGNBQU0sUUFBUSxDQUFDO0FBQUEsTUFDaEI7QUFFQSxZQUFNLGlCQUFpQixhQUFhLGlCQUFpQixLQUFLLFVBQVEsS0FBSyxXQUFXLGdCQUFnQjtBQUNsRyxhQUFPLEdBQUcsZ0JBQWdCLHlGQUF5RjtBQUNuSCxhQUFPLGdCQUFnQixlQUFnQixZQUFZLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFFcEUsWUFBTSxrQkFBa0IsV0FBVyxrQkFBa0I7QUFBQSxRQUFLLFdBQ3pELGFBQWEsTUFBTSxNQUFNLEtBQ3RCLE1BQU0sT0FBTyxTQUFTLFdBQVcsd0JBQ2pDLE1BQU0sT0FBTyxlQUFlO0FBQUEsTUFDaEM7QUFDQSxhQUFPLEdBQUcsaUJBQWlCLDREQUE0RDtBQUN2RixhQUFPLFlBQVksZ0JBQWdCLFFBQVEsU0FBUyxHQUFHLGVBQWUsd0RBQXdEO0FBQUEsSUFDL0gsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImRpc3Bvc2FibGVzIiwgIm9wdGlvbnMiLCAiZW50cnkiLCAiaW52b2NhdGlvbiJdCn0K
