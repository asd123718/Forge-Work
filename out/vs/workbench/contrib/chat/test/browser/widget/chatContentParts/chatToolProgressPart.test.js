import assert from "assert";
import * as sinon from "sinon";
import { Event } from "../../../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { renderAsPlaintext, renderMarkdown } from "../../../../../../../base/browser/markdownRenderer.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { IChatMarkdownAnchorService } from "../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js";
import { ChatAutomationConfiguredResultSubPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatAutomationConfiguredResultSubPart.js";
import { ChatToolInvocationPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js";
import { ChatToolConfirmationCarouselPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolConfirmationCarouselPart.js";
import { BaseChatToolInvocationSubPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationSubPart.js";
import { ChatToolProgressSubPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolProgressPart.js";
import { ChatToolStreamingSubPart } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolStreamingSubPart.js";
import { isAskQuestionsToolInvocation, isMcpToolInvocation } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolPartUtilities.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
class TestToolInvocationSubPart extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, terminalData) {
    super(toolInvocation);
    this.domNode = mainWindow.document.createElement("div");
    this.codeblocks = [];
    this.domNode.dataset.terminalToolSessionId = terminalData.terminalToolSessionId ?? "";
  }
}
suite("ChatToolProgressSubPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let mockMarkdownRenderer;
  let mockAnchorService;
  let mockHoverService;
  let mockConfigurationService;
  let mockEditorPool;
  function createRenderContext(isComplete = false) {
    const mockElement = {
      isComplete,
      id: "test-response-id",
      sessionResource: URI.parse("chat-session://test/session1"),
      setVote: () => {
      },
      get model() {
        return {};
      }
    };
    return {
      element: mockElement,
      inlineTextModels: {},
      elementIndex: 0,
      container: mainWindow.document.createElement("div"),
      content: [],
      contentIndex: 0,
      editorPool: mockEditorPool,
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: {},
      currentWidth: observableValue("currentWidth", 500),
      onDidChangeVisibility: Event.None
    };
  }
  function createStreamingToolInvocation(streamingMessage, isAttachedToThinking = false) {
    const state = observableValue("state", {
      type: IChatToolInvocation.StateKind.Streaming,
      partialInput: observableValue("partialInput", {}),
      streamingMessage: observableValue("streamingMessage", streamingMessage)
    });
    return {
      ...createToolInvocation({ invocationMessage: streamingMessage }),
      isAttachedToThinking,
      state
    };
  }
  function createSerializedToolInvocation(options = {}) {
    return {
      presentation: void 0,
      toolSpecificData: void 0,
      originMessage: void 0,
      invocationMessage: options.invocationMessage ?? "Running tool...",
      pastTenseMessage: void 0,
      resultDetails: void 0,
      isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      isComplete: options.isComplete ?? false,
      toolCallId: "tool-call-id",
      toolId: options.toolId ?? "test_tool",
      source: options.source,
      kind: "toolInvocationSerialized"
    };
  }
  function createToolInvocation(options = {}) {
    const source = options.source ?? ToolDataSource.Internal;
    const toolId = options.toolId ?? "test_tool";
    return {
      presentation: void 0,
      toolSpecificData: void 0,
      originMessage: void 0,
      invocationMessage: options.invocationMessage ?? "Running tool...",
      pastTenseMessage: void 0,
      source,
      toolId,
      toolCallId: "live-tool-call-id",
      state: observableValue("state", {
        type: IChatToolInvocation.StateKind.Executing,
        parameters: void 0,
        confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
        progress: observableValue("progress", { message: options.progressMessage, progress: void 0 })
      }),
      toolSpecificDataKind: observableValue("test", void 0),
      isAttachedToThinking: false,
      kind: "toolInvocation",
      toJSON: () => createSerializedToolInvocation({ source, toolId, invocationMessage: options.invocationMessage })
    };
  }
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, store);
    mockConfigurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, mockConfigurationService);
    mockMarkdownRenderer = {
      render: (markdown, _options, outElement) => {
        const element = outElement ?? mainWindow.document.createElement("div");
        const content = typeof markdown === "string" ? markdown : renderAsPlaintext(markdown);
        element.textContent = content;
        return {
          element,
          dispose: () => {
          }
        };
      }
    };
    mockAnchorService = {
      _serviceBrand: void 0,
      register: () => ({ dispose: () => {
      } }),
      lastFocusedAnchor: void 0
    };
    instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);
    mockHoverService = {
      _serviceBrand: void 0,
      showHover: () => void 0,
      showDelayedHover: () => void 0,
      showAndFocusLastHover: () => {
      },
      hideHover: () => {
      },
      setupDelayedHover: () => ({ dispose: () => {
      } }),
      setupManagedHover: () => ({ dispose: () => {
      }, show: () => {
      }, hide: () => {
      }, update: () => {
      } }),
      showManagedHover: () => void 0,
      isHovered: () => false
    };
    instantiationService.stub(IHoverService, mockHoverService);
    mockEditorPool = {};
  });
  teardown(() => {
    disposables.dispose();
  });
  function renderToolInvocation(toolInvocation, renderer = mockMarkdownRenderer) {
    return disposables.add(new ChatToolInvocationPart(
      toolInvocation,
      createRenderContext(),
      renderer,
      {},
      mockEditorPool,
      () => 500,
      void 0,
      0,
      instantiationService,
      {
        _serviceBrand: void 0,
        onDidUpdateTodos: Event.None,
        getTodos: () => [],
        setTodos() {
        },
        migrateTodos() {
        }
      }
    ));
  }
  test("does not retain an ordinary tool part when it becomes a parent subagent", () => {
    const invocation = createToolInvocation();
    const part = renderToolInvocation(invocation);
    invocation.toolSpecificData = { kind: "subagent" };
    assert.strictEqual(part.hasSameContent(invocation, [], {}), false);
  });
  test("confirmation carousel reports the active subagent and invokes its reference action", () => {
    const createPendingInvocation = (toolCallId) => ({
      ...createToolInvocation(),
      toolCallId,
      state: observableValue(`state-${toolCallId}`, {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: void 0,
        confirmationMessages: { title: "Run command?", message: "Run command?" },
        confirm: () => {
        }
      })
    });
    const createExternalPart = () => {
      const domNode = mainWindow.document.createElement("div");
      domNode.className = "chat-tool-invocation-part";
      return {
        domNode,
        addDisposable: (disposable) => disposables.add(disposable)
      };
    };
    const revealed = [];
    const active = [];
    const carousel = disposables.add(new ChatToolConfirmationCarouselPart(() => {
      throw new Error("External tool parts should be reused");
    }, []));
    disposables.add(carousel.onDidChangeActiveSubagent((id) => active.push(id)));
    carousel.addToolInvocation(createPendingInvocation("first"), "subagent-one", "one", (id) => revealed.push(id), "Open one Chat", createExternalPart());
    carousel.addToolInvocation(createPendingInvocation("second"), "subagent-two", "two", (id) => revealed.push(id), "Open two Chat", createExternalPart());
    carousel.activateFirstToolForSubagent("subagent-two");
    const agentLabel = carousel.domNode.querySelector(".chat-tool-carousel-agent-label");
    agentLabel?.click();
    assert.deepStrictEqual({
      active,
      revealed,
      label: agentLabel?.title
    }, {
      active: ["subagent-one", "subagent-two"],
      revealed: ["subagent-two"],
      label: "Open two Chat"
    });
  });
  test("detects MCP tool invocations for live and serialized rows", () => {
    const mcpSource = {
      type: "mcp",
      label: "Weather MCP",
      serverLabel: "Weather",
      instructions: void 0,
      collectionId: "collection",
      definitionId: "definition"
    };
    const cases = [
      isMcpToolInvocation(createToolInvocation({ source: mcpSource })),
      isMcpToolInvocation(createSerializedToolInvocation({ source: void 0, toolId: "mcp__weather" })),
      isMcpToolInvocation(createSerializedToolInvocation({ source: ToolDataSource.Internal, toolId: "fetch_webpage" }))
    ];
    assert.deepStrictEqual(cases, [true, true, false]);
  });
  test("detects all ask-question tool names for top-level rendering", () => {
    const toolNames = ["copilot_askQuestions", "vscode_askQuestions", "ask_user", "AskUserQuestion", "request_user_input"];
    assert.deepStrictEqual(toolNames.map((toolId) => isAskQuestionsToolInvocation(createToolInvocation({ toolId }))), [true, true, true, true, true]);
  });
  test("renders the automation result subpart for configured automation data", () => {
    const invocation = {
      ...createSerializedToolInvocation({ isComplete: true }),
      toolSpecificData: {
        kind: "automationConfigured",
        automationId: "automation-1",
        automationName: "Morning review",
        operation: "created"
      }
    };
    const createInstanceStub = sinon.stub(instantiationService, "createInstance").callsFake((_ctor, ...args) => {
      return new TestToolInvocationSubPart(args[0], {
        kind: "terminal",
        commandLine: { original: "" },
        language: "shellscript"
      });
    });
    disposables.add(toDisposable(() => createInstanceStub.restore()));
    renderToolInvocation(invocation);
    assert.strictEqual(createInstanceStub.firstCall.args[0], ChatAutomationConfiguredResultSubPart);
  });
  test("renders codicon syntax in an automation name as literal text", () => {
    const render = (automationName) => {
      const part = disposables.add(instantiationService.createInstance(
        ChatAutomationConfiguredResultSubPart,
        createSerializedToolInvocation({ isComplete: true }),
        { kind: "automationConfigured", automationId: "automation-1", automationName, operation: "created" },
        createRenderContext(),
        mockMarkdownRenderer
      ));
      const button = part.domNode.querySelector(".chat-open-session-button");
      return {
        text: button?.textContent,
        ariaLabel: button?.getAttribute("aria-label"),
        tabIndex: button?.tabIndex,
        watchIconIsChild: !!button?.querySelector(".codicon-watch"),
        // `codicon-*` on the root would restyle the label text.
        rootCarriesCodiconClass: button?.classList.contains("codicon"),
        injectedIcons: [...button?.querySelectorAll(".codicon") ?? []].flatMap((el) => [...el.classList]).filter((c) => c.startsWith("codicon-"))
      };
    };
    assert.deepStrictEqual([render("$(error)"), render("a \\$(error) b")], [
      {
        text: "Created an automation: $(error)",
        ariaLabel: "Open automation $(error)",
        tabIndex: 0,
        watchIconIsChild: true,
        rootCarriesCodiconClass: false,
        injectedIcons: ["codicon-watch"]
      },
      {
        text: "Created an automation: a \\$(error) b",
        ariaLabel: "Open automation a \\$(error) b",
        tabIndex: 0,
        watchIconIsChild: true,
        rootCarriesCodiconClass: false,
        injectedIcons: ["codicon-watch"]
      }
    ]);
  });
  test("rerenders when terminal metadata changes without changing data kind", () => {
    const state = observableValue("state", {
      type: IChatToolInvocation.StateKind.Executing,
      parameters: void 0,
      confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      progress: observableValue("progress", { progress: void 0 })
    });
    let terminalData = {
      kind: "terminal",
      commandLine: { original: "echo test" },
      language: "shellscript"
    };
    const invocation = {
      ...createToolInvocation(),
      get toolSpecificData() {
        return terminalData;
      },
      state,
      toolSpecificDataKind: observableValue("kind", "terminal")
    };
    const createInstanceStub = sinon.stub(instantiationService, "createInstance").callsFake((_ctor, ...args) => {
      return new TestToolInvocationSubPart(args[0], args[1]);
    });
    disposables.add(toDisposable(() => createInstanceStub.restore()));
    const part = disposables.add(new ChatToolInvocationPart(
      invocation,
      createRenderContext(),
      mockMarkdownRenderer,
      {},
      mockEditorPool,
      () => 500,
      void 0,
      0,
      instantiationService,
      {
        _serviceBrand: void 0,
        onDidUpdateTodos: Event.None,
        getTodos: () => [],
        setTodos() {
        },
        migrateTodos() {
        }
      }
    ));
    const sessionIdBeforeUpdate = part.domNode.firstElementChild?.getAttribute("data-terminal-tool-session-id");
    terminalData = { ...terminalData, terminalToolSessionId: "terminal-session" };
    state.set({ ...state.get() }, void 0);
    assert.deepStrictEqual({
      renderCount: createInstanceStub.callCount,
      sessionIdBeforeUpdate,
      sessionIdAfterUpdate: part.domNode.firstElementChild?.getAttribute("data-terminal-tool-session-id")
    }, {
      renderCount: 2,
      sessionIdBeforeUpdate: "",
      sessionIdAfterUpdate: "terminal-session"
    });
  });
  test("does not add shimmer styling for active MCP tool progress", () => {
    const mcpTool = createToolInvocation({
      source: {
        type: "mcp",
        label: "Weather MCP",
        serverLabel: "Weather",
        instructions: void 0,
        collectionId: "collection",
        definitionId: "definition"
      },
      toolId: "weather_lookup"
    });
    const part = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      mcpTool,
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.strictEqual(part.domNode.querySelector(".shimmer-progress"), null);
  });
  test("shimmers only the leading verb of standalone streaming progress, but not inside a thinking part", () => {
    const patchPart = disposables.add(instantiationService.createInstance(
      ChatToolStreamingSubPart,
      createStreamingToolInvocation("Generating patch (282 lines)"),
      createRenderContext(false),
      mockMarkdownRenderer
    ));
    const editPart = disposables.add(instantiationService.createInstance(
      ChatToolStreamingSubPart,
      createStreamingToolInvocation("Editing 5 lines"),
      createRenderContext(false),
      mockMarkdownRenderer
    ));
    const thinkingPart = disposables.add(instantiationService.createInstance(
      ChatToolStreamingSubPart,
      createStreamingToolInvocation(
        "Generating patch (282 lines)",
        /* isAttachedToThinking */
        true
      ),
      createRenderContext(false),
      mockMarkdownRenderer
    ));
    const inspect = (part) => {
      const shimmerText = part.domNode.querySelector(".chat-progress-shimmer-text");
      return {
        shimmer: !!part.domNode.querySelector(".shimmer-progress"),
        spinner: !!part.domNode.querySelector(".codicon-loading"),
        shimmerText: shimmerText?.textContent,
        // A negative animation-delay keeps the sweep continuous across streaming rerenders.
        shimmerPhaseSynced: (shimmerText?.style.animationDelay ?? "").endsWith("ms"),
        text: part.domNode.textContent
      };
    };
    assert.deepStrictEqual({
      patch: inspect(patchPart),
      edit: inspect(editPart),
      thinking: inspect(thinkingPart)
    }, {
      patch: { shimmer: true, spinner: false, shimmerText: "Generating patch", shimmerPhaseSynced: true, text: "Generating patch (282 lines)" },
      edit: { shimmer: true, spinner: false, shimmerText: "Editing", shimmerPhaseSynced: true, text: "Editing 5 lines" },
      thinking: { shimmer: false, spinner: false, shimmerText: void 0, shimmerPhaseSynced: false, text: "Generating patch (282 lines)" }
    });
  });
  test("adds shimmer styling only for active ask questions invocation progress", () => {
    const askQuestionsTool = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      createToolInvocation({
        toolId: "vscode_askQuestions",
        invocationMessage: "Asking a question (Target)"
      }),
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    const askMultipleQuestionsTool = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      createToolInvocation({
        toolId: "vscode_askQuestions",
        invocationMessage: "Asking 3 questions (What should we work on?, Preferred area, How hands-on?)"
      }),
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    const analyzingAnswersTool = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      createToolInvocation({
        toolId: "vscode_askQuestions",
        invocationMessage: "Asking a question (Target)",
        progressMessage: "Analyzing your answers..."
      }),
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    const waitingForAnswerTool = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      createToolInvocation({
        toolId: "ask_user",
        invocationMessage: "Waiting for answer..."
      }),
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.deepStrictEqual([
      !!askQuestionsTool.domNode.querySelector(".shimmer-progress"),
      askQuestionsTool.domNode.querySelector(".chat-progress-shimmer-text")?.textContent,
      askQuestionsTool.domNode.textContent,
      askMultipleQuestionsTool.domNode.querySelector(".chat-progress-shimmer-text")?.textContent,
      askMultipleQuestionsTool.domNode.textContent,
      !!analyzingAnswersTool.domNode.querySelector(".shimmer-progress"),
      analyzingAnswersTool.domNode.querySelector(".chat-progress-shimmer-text")?.textContent,
      !!waitingForAnswerTool.domNode.querySelector(".shimmer-progress")
    ], [true, "Asking a question", "Asking a question (Target)", "Asking 3 questions", "Asking 3 questions (What should we work on?, Preferred area, How hands-on?)", false, void 0, true]);
  });
  test("does not render a loading icon for run playwright code progress", () => {
    const tool = createToolInvocation({
      toolId: "run_playwright_code",
      invocationMessage: "Running Playwright code..."
    });
    const part = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      tool,
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.strictEqual(part.domNode.querySelector(".codicon-loading"), null);
  });
  test("does not add shimmer styling for non-MCP tool progress", () => {
    const tool = createSerializedToolInvocation({
      source: ToolDataSource.Internal,
      toolId: "fetch_webpage"
    });
    const part = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      tool,
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.strictEqual(part.domNode.querySelector(".shimmer-progress"), null);
  });
  test("renders another client tool with an accessible inline skip action", () => {
    let cancelCount = 0;
    const state = observableValue("state", {
      type: IChatToolInvocation.StateKind.Executing,
      parameters: void 0,
      confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      progress: observableValue("progress", { progress: void 0 })
    });
    const invocation = {
      ...createToolInvocation({ invocationMessage: "Running Run Task on another client..." }),
      pastTenseMessage: "Ran Task",
      state,
      otherClientToolCall: {
        cancel: () => {
          cancelCount++;
          state.set({
            type: IChatToolInvocation.StateKind.Completed,
            parameters: void 0,
            confirmationMessages: void 0,
            confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
            postConfirmed: void 0,
            resultDetails: void 0,
            contentForModel: []
          }, void 0);
        }
      }
    };
    const markdownRenderer = {
      render: (markdown, options) => renderMarkdown(markdown, options)
    };
    const part = renderToolInvocation(invocation, markdownRenderer);
    const skipLink = part.domNode.querySelector('a[data-href="#skip"]');
    const progressText = part.domNode.querySelector(".progress-step")?.textContent?.replaceAll("\xA0", " ");
    const linkParagraphText = skipLink?.closest("p")?.textContent?.replaceAll("\xA0", " ");
    const linkLabel = skipLink?.textContent;
    const linkRole = skipLink?.getAttribute("role");
    const linkHref = skipLink?.getAttribute("href");
    const tabIndex = skipLink?.tabIndex;
    skipLink?.click();
    assert.deepStrictEqual({
      progressText,
      linkParagraphText,
      textAfterSkip: part.domNode.textContent?.replaceAll("\xA0", " "),
      linkAfterSkip: part.domNode.querySelector('a[data-href="#skip"]'),
      linkLabel,
      linkRole,
      linkHref,
      tabIndex,
      cancelCount
    }, {
      progressText: "Running Run Task on another client... Skip?",
      linkParagraphText: "Running Run Task on another client... Skip?",
      textAfterSkip: "Ran Task",
      linkAfterSkip: null,
      linkLabel: "Skip?",
      linkRole: "button",
      linkHref: "",
      tabIndex: 0,
      cancelCount: 1
    });
  });
  test("does not add shimmer styling for completed MCP tool progress", () => {
    const mcpTool = createSerializedToolInvocation({
      source: {
        type: "mcp",
        label: "Weather MCP",
        serverLabel: "Weather",
        instructions: void 0,
        collectionId: "collection",
        definitionId: "definition"
      },
      toolId: "weather_lookup"
    });
    const part = disposables.add(instantiationService.createInstance(
      ChatToolProgressSubPart,
      mcpTool,
      createRenderContext(false),
      mockMarkdownRenderer,
      /* @__PURE__ */ new Set()
    ));
    assert.strictEqual(part.domNode.querySelector(".shimmer-progress"), null);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRvb2xQcm9ncmVzc1BhcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJUmVuZGVyZWRNYXJrZG93biwgTWFya2Rvd25SZW5kZXJPcHRpb25zLCByZW5kZXJBc1BsYWludGV4dCwgcmVuZGVyTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWRSZXN1bHRTdWJQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRBdXRvbWF0aW9uQ29uZmlndXJlZFJlc3VsdFN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbEludm9jYXRpb25QYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0LmpzJztcbmltcG9ydCB7IEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sSW52b2NhdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xQcm9ncmVzc1N1YlBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xQcm9ncmVzc1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xTdHJlYW1pbmdTdWJQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sU3RyZWFtaW5nU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBpc0Fza1F1ZXN0aW9uc1Rvb2xJbnZvY2F0aW9uLCBpc01jcFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sUGFydFV0aWxpdGllcy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yUG9vbCwgRWRpdG9yUG9vbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGEsIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IFRvb2xEYXRhU291cmNlLCB0eXBlIFRvb2xEYXRhU291cmNlIGFzIFRvb2xEYXRhU291cmNlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbGxhcHNpYmxlTGlzdFBvb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRSZWZlcmVuY2VzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRUb2RvTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvY2hhdFRvZG9MaXN0U2VydmljZS5qcyc7XG5cbmNsYXNzIFRlc3RUb29sSW52b2NhdGlvblN1YlBhcnQgZXh0ZW5kcyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB7XG5cdHJlYWRvbmx5IGRvbU5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRjb2RlYmxvY2tzID0gW107XG5cblx0Y29uc3RydWN0b3IodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24sIHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSkge1xuXHRcdHN1cGVyKHRvb2xJbnZvY2F0aW9uKTtcblx0XHR0aGlzLmRvbU5vZGUuZGF0YXNldC50ZXJtaW5hbFRvb2xTZXNzaW9uSWQgPSB0ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkID8/ICcnO1xuXHR9XG59XG5cbnN1aXRlKCdDaGF0VG9vbFByb2dyZXNzU3ViUGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBSZXR1cm5UeXBlPHR5cGVvZiB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZT47XG5cdGxldCBtb2NrTWFya2Rvd25SZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXI7XG5cdGxldCBtb2NrQW5jaG9yU2VydmljZTogSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2U7XG5cdGxldCBtb2NrSG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlO1xuXHRsZXQgbW9ja0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBtb2NrRWRpdG9yUG9vbDogRWRpdG9yUG9vbDtcblxuXHRmdW5jdGlvbiBjcmVhdGVSZW5kZXJDb250ZXh0KGlzQ29tcGxldGU6IGJvb2xlYW4gPSBmYWxzZSk6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IHtcblx0XHRjb25zdCBtb2NrRWxlbWVudDogUGFydGlhbDxJQ2hhdFJlc3BvbnNlVmlld01vZGVsPiA9IHtcblx0XHRcdGlzQ29tcGxldGUsXG5cdFx0XHRpZDogJ3Rlc3QtcmVzcG9uc2UtaWQnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbjEnKSxcblx0XHRcdHNldFZvdGU6ICgpID0+IHsgfSxcblx0XHRcdGdldCBtb2RlbCgpIHsgcmV0dXJuIHt9IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWxbJ21vZGVsJ107IH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IG1vY2tFbGVtZW50IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsXG5cdFx0XHRpbmxpbmVUZXh0TW9kZWxzOiB7fSBhcyBJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uLFxuXHRcdFx0ZWxlbWVudEluZGV4OiAwLFxuXHRcdFx0Y29udGFpbmVyOiBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0Y29udGVudDogW10sXG5cdFx0XHRjb250ZW50SW5kZXg6IDAsXG5cdFx0XHRlZGl0b3JQb29sOiBtb2NrRWRpdG9yUG9vbCxcblx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IDAsXG5cdFx0XHR0cmVlU3RhcnRJbmRleDogMCxcblx0XHRcdGRpZmZFZGl0b3JQb29sOiB7fSBhcyBEaWZmRWRpdG9yUG9vbCxcblx0XHRcdGN1cnJlbnRXaWR0aDogb2JzZXJ2YWJsZVZhbHVlKCdjdXJyZW50V2lkdGgnLCA1MDApLFxuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudC5Ob25lXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uKHN0cmVhbWluZ01lc3NhZ2U6IHN0cmluZywgaXNBdHRhY2hlZFRvVGhpbmtpbmc6IGJvb2xlYW4gPSBmYWxzZSk6IElDaGF0VG9vbEludm9jYXRpb24ge1xuXHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+KCdzdGF0ZScsIHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZyxcblx0XHRcdHBhcnRpYWxJbnB1dDogb2JzZXJ2YWJsZVZhbHVlKCdwYXJ0aWFsSW5wdXQnLCB7fSksXG5cdFx0XHRzdHJlYW1pbmdNZXNzYWdlOiBvYnNlcnZhYmxlVmFsdWUoJ3N0cmVhbWluZ01lc3NhZ2UnLCBzdHJlYW1pbmdNZXNzYWdlKVxuXHRcdH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jcmVhdGVUb29sSW52b2NhdGlvbih7IGludm9jYXRpb25NZXNzYWdlOiBzdHJlYW1pbmdNZXNzYWdlIH0pLFxuXHRcdFx0aXNBdHRhY2hlZFRvVGhpbmtpbmcsXG5cdFx0XHRzdGF0ZSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKG9wdGlvbnM6IHtcblx0XHRzb3VyY2U/OiBUb29sRGF0YVNvdXJjZVR5cGU7XG5cdFx0dG9vbElkPzogc3RyaW5nO1xuXHRcdGlzQ29tcGxldGU/OiBib29sZWFuO1xuXHRcdGludm9jYXRpb25NZXNzYWdlPzogc3RyaW5nO1xuXHR9ID0ge30pOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG9wdGlvbnMuaW52b2NhdGlvbk1lc3NhZ2UgPz8gJ1J1bm5pbmcgdG9vbC4uLicsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRyZXN1bHREZXRhaWxzOiB1bmRlZmluZWQsXG5cdFx0XHRpc0NvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRpc0NvbXBsZXRlOiBvcHRpb25zLmlzQ29tcGxldGUgPz8gZmFsc2UsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1jYWxsLWlkJyxcblx0XHRcdHRvb2xJZDogb3B0aW9ucy50b29sSWQgPz8gJ3Rlc3RfdG9vbCcsXG5cdFx0XHRzb3VyY2U6IG9wdGlvbnMuc291cmNlLFxuXHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCdcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVG9vbEludm9jYXRpb24ob3B0aW9uczoge1xuXHRcdHNvdXJjZT86IFRvb2xEYXRhU291cmNlVHlwZTtcblx0XHR0b29sSWQ/OiBzdHJpbmc7XG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U/OiBzdHJpbmc7XG5cdFx0cHJvZ3Jlc3NNZXNzYWdlPzogc3RyaW5nO1xuXHR9ID0ge30pOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHtcblx0XHRjb25zdCBzb3VyY2UgPSBvcHRpb25zLnNvdXJjZSA/PyBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbDtcblx0XHRjb25zdCB0b29sSWQgPSBvcHRpb25zLnRvb2xJZCA/PyAndGVzdF90b29sJztcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogb3B0aW9ucy5pbnZvY2F0aW9uTWVzc2FnZSA/PyAnUnVubmluZyB0b29sLi4uJyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHNvdXJjZSxcblx0XHRcdHRvb2xJZCxcblx0XHRcdHRvb2xDYWxsSWQ6ICdsaXZlLXRvb2wtY2FsbC1pZCcsXG5cdFx0XHRzdGF0ZTogb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdHByb2dyZXNzOiBvYnNlcnZhYmxlVmFsdWUoJ3Byb2dyZXNzJywgeyBtZXNzYWdlOiBvcHRpb25zLnByb2dyZXNzTWVzc2FnZSwgcHJvZ3Jlc3M6IHVuZGVmaW5lZCB9KVxuXHRcdFx0fSksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhS2luZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgdW5kZWZpbmVkKSxcblx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicsXG5cdFx0XHR0b0pTT046ICgpID0+IGNyZWF0ZVNlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7IHNvdXJjZSwgdG9vbElkLCBpbnZvY2F0aW9uTWVzc2FnZTogb3B0aW9ucy5pbnZvY2F0aW9uTWVzc2FnZSB9KVxuXHRcdH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXG5cdFx0bW9ja0NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2NrQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0bW9ja01hcmtkb3duUmVuZGVyZXIgPSB7XG5cdFx0XHRyZW5kZXI6IChtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nLCBfb3B0aW9ucz86IE1hcmtkb3duUmVuZGVyT3B0aW9ucywgb3V0RWxlbWVudD86IEhUTUxFbGVtZW50KTogSVJlbmRlcmVkTWFya2Rvd24gPT4ge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gb3V0RWxlbWVudCA/PyBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gdHlwZW9mIG1hcmtkb3duID09PSAnc3RyaW5nJyA/IG1hcmtkb3duIDogcmVuZGVyQXNQbGFpbnRleHQobWFya2Rvd24pO1xuXHRcdFx0XHRlbGVtZW50LnRleHRDb250ZW50ID0gY29udGVudDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRtb2NrQW5jaG9yU2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRsYXN0Rm9jdXNlZEFuY2hvcjogdW5kZWZpbmVkXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCBtb2NrQW5jaG9yU2VydmljZSk7XG5cblx0XHRtb2NrSG92ZXJTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c2hvd0hvdmVyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzaG93RGVsYXllZEhvdmVyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzaG93QW5kRm9jdXNMYXN0SG92ZXI6ICgpID0+IHsgfSxcblx0XHRcdGhpZGVIb3ZlcjogKCkgPT4geyB9LFxuXHRcdFx0c2V0dXBEZWxheWVkSG92ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNldHVwTWFuYWdlZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0sIHNob3c6ICgpID0+IHsgfSwgaGlkZTogKCkgPT4geyB9LCB1cGRhdGU6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNob3dNYW5hZ2VkSG92ZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzSG92ZXJlZDogKCkgPT4gZmFsc2UsXG5cdFx0fSBhcyB1bmtub3duIGFzIElIb3ZlclNlcnZpY2U7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSG92ZXJTZXJ2aWNlLCBtb2NrSG92ZXJTZXJ2aWNlKTtcblxuXHRcdG1vY2tFZGl0b3JQb29sID0ge30gYXMgRWRpdG9yUG9vbDtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gcmVuZGVyVG9vbEludm9jYXRpb24odG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgcmVuZGVyZXIgPSBtb2NrTWFya2Rvd25SZW5kZXJlcik6IENoYXRUb29sSW52b2NhdGlvblBhcnQge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRUb29sSW52b2NhdGlvblBhcnQoXG5cdFx0XHR0b29sSW52b2NhdGlvbixcblx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoKSxcblx0XHRcdHJlbmRlcmVyLFxuXHRcdFx0e30gYXMgQ29sbGFwc2libGVMaXN0UG9vbCxcblx0XHRcdG1vY2tFZGl0b3JQb29sLFxuXHRcdFx0KCkgPT4gNTAwLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0MCxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkVXBkYXRlVG9kb3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGdldFRvZG9zOiAoKSA9PiBbXSxcblx0XHRcdFx0c2V0VG9kb3MoKSB7IH0sXG5cdFx0XHRcdG1pZ3JhdGVUb2RvcygpIHsgfSxcblx0XHRcdH0gc2F0aXNmaWVzIElDaGF0VG9kb0xpc3RTZXJ2aWNlLFxuXHRcdCkpO1xuXHR9XG5cblx0dGVzdCgnZG9lcyBub3QgcmV0YWluIGFuIG9yZGluYXJ5IHRvb2wgcGFydCB3aGVuIGl0IGJlY29tZXMgYSBwYXJlbnQgc3ViYWdlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IGNyZWF0ZVRvb2xJbnZvY2F0aW9uKCk7XG5cdFx0Y29uc3QgcGFydCA9IHJlbmRlclRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24pO1xuXHRcdChpbnZvY2F0aW9uIGFzIHsgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUb29sSW52b2NhdGlvblsndG9vbFNwZWNpZmljRGF0YSddIH0pLnRvb2xTcGVjaWZpY0RhdGEgPSB7IGtpbmQ6ICdzdWJhZ2VudCcgfTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmhhc1NhbWVDb250ZW50KGludm9jYXRpb24sIFtdLCB7fSBhcyBuZXZlciksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlybWF0aW9uIGNhcm91c2VsIHJlcG9ydHMgdGhlIGFjdGl2ZSBzdWJhZ2VudCBhbmQgaW52b2tlcyBpdHMgcmVmZXJlbmNlIGFjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBjcmVhdGVQZW5kaW5nSW52b2NhdGlvbiA9ICh0b29sQ2FsbElkOiBzdHJpbmcpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0+ICh7XG5cdFx0XHQuLi5jcmVhdGVUb29sSW52b2NhdGlvbigpLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHN0YXRlOiBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oYHN0YXRlLSR7dG9vbENhbGxJZH1gLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6ICdSdW4gY29tbWFuZD8nLCBtZXNzYWdlOiAnUnVuIGNvbW1hbmQ/JyB9LFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRjb25zdCBjcmVhdGVFeHRlcm5hbFBhcnQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBkb21Ob2RlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGRvbU5vZGUuY2xhc3NOYW1lID0gJ2NoYXQtdG9vbC1pbnZvY2F0aW9uLXBhcnQnO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZG9tTm9kZSxcblx0XHRcdFx0YWRkRGlzcG9zYWJsZTogKGRpc3Bvc2FibGU6IHsgZGlzcG9zZSgpOiB2b2lkIH0pID0+IGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBDaGF0VG9vbEludm9jYXRpb25QYXJ0O1xuXHRcdH07XG5cdFx0Y29uc3QgcmV2ZWFsZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgYWN0aXZlOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gW107XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0KCgpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXh0ZXJuYWwgdG9vbCBwYXJ0cyBzaG91bGQgYmUgcmV1c2VkJyk7XG5cdFx0fSwgW10pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY2Fyb3VzZWwub25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudChpZCA9PiBhY3RpdmUucHVzaChpZCkpKTtcblx0XHRjYXJvdXNlbC5hZGRUb29sSW52b2NhdGlvbihjcmVhdGVQZW5kaW5nSW52b2NhdGlvbignZmlyc3QnKSwgJ3N1YmFnZW50LW9uZScsICdvbmUnLCBpZCA9PiByZXZlYWxlZC5wdXNoKGlkKSwgJ09wZW4gb25lIENoYXQnLCBjcmVhdGVFeHRlcm5hbFBhcnQoKSk7XG5cdFx0Y2Fyb3VzZWwuYWRkVG9vbEludm9jYXRpb24oY3JlYXRlUGVuZGluZ0ludm9jYXRpb24oJ3NlY29uZCcpLCAnc3ViYWdlbnQtdHdvJywgJ3R3bycsIGlkID0+IHJldmVhbGVkLnB1c2goaWQpLCAnT3BlbiB0d28gQ2hhdCcsIGNyZWF0ZUV4dGVybmFsUGFydCgpKTtcblxuXHRcdGNhcm91c2VsLmFjdGl2YXRlRmlyc3RUb29sRm9yU3ViYWdlbnQoJ3N1YmFnZW50LXR3bycpO1xuXHRcdGNvbnN0IGFnZW50TGFiZWwgPSBjYXJvdXNlbC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuY2hhdC10b29sLWNhcm91c2VsLWFnZW50LWxhYmVsJyk7XG5cdFx0YWdlbnRMYWJlbD8uY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aXZlLFxuXHRcdFx0cmV2ZWFsZWQsXG5cdFx0XHRsYWJlbDogYWdlbnRMYWJlbD8udGl0bGUsXG5cdFx0fSwge1xuXHRcdFx0YWN0aXZlOiBbJ3N1YmFnZW50LW9uZScsICdzdWJhZ2VudC10d28nXSxcblx0XHRcdHJldmVhbGVkOiBbJ3N1YmFnZW50LXR3byddLFxuXHRcdFx0bGFiZWw6ICdPcGVuIHR3byBDaGF0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBNQ1AgdG9vbCBpbnZvY2F0aW9ucyBmb3IgbGl2ZSBhbmQgc2VyaWFsaXplZCByb3dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1jcFNvdXJjZTogVG9vbERhdGFTb3VyY2VUeXBlID0ge1xuXHRcdFx0dHlwZTogJ21jcCcsXG5cdFx0XHRsYWJlbDogJ1dlYXRoZXIgTUNQJyxcblx0XHRcdHNlcnZlckxhYmVsOiAnV2VhdGhlcicsXG5cdFx0XHRpbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdGNvbGxlY3Rpb25JZDogJ2NvbGxlY3Rpb24nLFxuXHRcdFx0ZGVmaW5pdGlvbklkOiAnZGVmaW5pdGlvbidcblx0XHR9O1xuXG5cdFx0Y29uc3QgY2FzZXMgPSBbXG5cdFx0XHRpc01jcFRvb2xJbnZvY2F0aW9uKGNyZWF0ZVRvb2xJbnZvY2F0aW9uKHsgc291cmNlOiBtY3BTb3VyY2UgfSkpLFxuXHRcdFx0aXNNY3BUb29sSW52b2NhdGlvbihjcmVhdGVTZXJpYWxpemVkVG9vbEludm9jYXRpb24oeyBzb3VyY2U6IHVuZGVmaW5lZCwgdG9vbElkOiAnbWNwX193ZWF0aGVyJyB9KSksXG5cdFx0XHRpc01jcFRvb2xJbnZvY2F0aW9uKGNyZWF0ZVNlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7IHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsIHRvb2xJZDogJ2ZldGNoX3dlYnBhZ2UnIH0pKVxuXHRcdF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhc2VzLCBbdHJ1ZSwgdHJ1ZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBhbGwgYXNrLXF1ZXN0aW9uIHRvb2wgbmFtZXMgZm9yIHRvcC1sZXZlbCByZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbE5hbWVzID0gWydjb3BpbG90X2Fza1F1ZXN0aW9ucycsICd2c2NvZGVfYXNrUXVlc3Rpb25zJywgJ2Fza191c2VyJywgJ0Fza1VzZXJRdWVzdGlvbicsICdyZXF1ZXN0X3VzZXJfaW5wdXQnXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xOYW1lcy5tYXAodG9vbElkID0+IGlzQXNrUXVlc3Rpb25zVG9vbEludm9jYXRpb24oY3JlYXRlVG9vbEludm9jYXRpb24oeyB0b29sSWQgfSkpKSwgW3RydWUsIHRydWUsIHRydWUsIHRydWUsIHRydWVdKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyB0aGUgYXV0b21hdGlvbiByZXN1bHQgc3VicGFydCBmb3IgY29uZmlndXJlZCBhdXRvbWF0aW9uIGRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgPSB7XG5cdFx0XHQuLi5jcmVhdGVTZXJpYWxpemVkVG9vbEludm9jYXRpb24oeyBpc0NvbXBsZXRlOiB0cnVlIH0pLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRraW5kOiAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnLFxuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRhdXRvbWF0aW9uTmFtZTogJ01vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdFx0b3BlcmF0aW9uOiAnY3JlYXRlZCcsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY3JlYXRlSW5zdGFuY2VTdHViID0gc2lub24uc3R1YihpbnN0YW50aWF0aW9uU2VydmljZSwgJ2NyZWF0ZUluc3RhbmNlJykuY2FsbHNGYWtlKChfY3RvciwgLi4uYXJncykgPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBUZXN0VG9vbEludm9jYXRpb25TdWJQYXJ0KGFyZ3NbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvbiwge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJycgfSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdzaGVsbHNjcmlwdCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNyZWF0ZUluc3RhbmNlU3R1Yi5yZXN0b3JlKCkpKTtcblxuXHRcdHJlbmRlclRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZUluc3RhbmNlU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkUmVzdWx0U3ViUGFydCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgY29kaWNvbiBzeW50YXggaW4gYW4gYXV0b21hdGlvbiBuYW1lIGFzIGxpdGVyYWwgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCByZW5kZXIgPSAoYXV0b21hdGlvbk5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF1dG9tYXRpb25Db25maWd1cmVkUmVzdWx0U3ViUGFydCxcblx0XHRcdFx0Y3JlYXRlU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHsgaXNDb21wbGV0ZTogdHJ1ZSB9KSxcblx0XHRcdFx0eyBraW5kOiAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnLCBhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLCBhdXRvbWF0aW9uTmFtZSwgb3BlcmF0aW9uOiAnY3JlYXRlZCcgfSBzYXRpc2ZpZXMgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGEsXG5cdFx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoKSxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtb3Blbi1zZXNzaW9uLWJ1dHRvbicpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGV4dDogYnV0dG9uPy50ZXh0Q29udGVudCxcblx0XHRcdFx0YXJpYUxhYmVsOiBidXR0b24/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdFx0XHR0YWJJbmRleDogYnV0dG9uPy50YWJJbmRleCxcblx0XHRcdFx0d2F0Y2hJY29uSXNDaGlsZDogISFidXR0b24/LnF1ZXJ5U2VsZWN0b3IoJy5jb2RpY29uLXdhdGNoJyksXG5cdFx0XHRcdC8vIGBjb2RpY29uLSpgIG9uIHRoZSByb290IHdvdWxkIHJlc3R5bGUgdGhlIGxhYmVsIHRleHQuXG5cdFx0XHRcdHJvb3RDYXJyaWVzQ29kaWNvbkNsYXNzOiBidXR0b24/LmNsYXNzTGlzdC5jb250YWlucygnY29kaWNvbicpLFxuXHRcdFx0XHRpbmplY3RlZEljb25zOiBbLi4uYnV0dG9uPy5xdWVyeVNlbGVjdG9yQWxsKCcuY29kaWNvbicpID8/IFtdXVxuXHRcdFx0XHRcdC5mbGF0TWFwKGVsID0+IFsuLi5lbC5jbGFzc0xpc3RdKS5maWx0ZXIoYyA9PiBjLnN0YXJ0c1dpdGgoJ2NvZGljb24tJykpLFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbcmVuZGVyKCckKGVycm9yKScpLCByZW5kZXIoJ2EgXFxcXCQoZXJyb3IpIGInKV0sIFtcblx0XHRcdHtcblx0XHRcdFx0dGV4dDogJ0NyZWF0ZWQgYW4gYXV0b21hdGlvbjogJChlcnJvciknLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdPcGVuIGF1dG9tYXRpb24gJChlcnJvciknLFxuXHRcdFx0XHR0YWJJbmRleDogMCxcblx0XHRcdFx0d2F0Y2hJY29uSXNDaGlsZDogdHJ1ZSxcblx0XHRcdFx0cm9vdENhcnJpZXNDb2RpY29uQ2xhc3M6IGZhbHNlLFxuXHRcdFx0XHRpbmplY3RlZEljb25zOiBbJ2NvZGljb24td2F0Y2gnXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRleHQ6ICdDcmVhdGVkIGFuIGF1dG9tYXRpb246IGEgXFxcXCQoZXJyb3IpIGInLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdPcGVuIGF1dG9tYXRpb24gYSBcXFxcJChlcnJvcikgYicsXG5cdFx0XHRcdHRhYkluZGV4OiAwLFxuXHRcdFx0XHR3YXRjaEljb25Jc0NoaWxkOiB0cnVlLFxuXHRcdFx0XHRyb290Q2Fycmllc0NvZGljb25DbGFzczogZmFsc2UsXG5cdFx0XHRcdGluamVjdGVkSWNvbnM6IFsnY29kaWNvbi13YXRjaCddLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVyZW5kZXJzIHdoZW4gdGVybWluYWwgbWV0YWRhdGEgY2hhbmdlcyB3aXRob3V0IGNoYW5naW5nIGRhdGEga2luZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPignc3RhdGUnLCB7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRwYXJhbWV0ZXJzOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0cHJvZ3Jlc3M6IG9ic2VydmFibGVWYWx1ZSgncHJvZ3Jlc3MnLCB7IHByb2dyZXNzOiB1bmRlZmluZWQgfSksXG5cdFx0fSk7XG5cdFx0bGV0IHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ2VjaG8gdGVzdCcgfSxcblx0XHRcdGxhbmd1YWdlOiAnc2hlbGxzY3JpcHQnLFxuXHRcdH07XG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IHtcblx0XHRcdC4uLmNyZWF0ZVRvb2xJbnZvY2F0aW9uKCksXG5cdFx0XHRnZXQgdG9vbFNwZWNpZmljRGF0YSgpIHsgcmV0dXJuIHRlcm1pbmFsRGF0YTsgfSxcblx0XHRcdHN0YXRlLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YUtpbmQ6IG9ic2VydmFibGVWYWx1ZSgna2luZCcsICd0ZXJtaW5hbCcpLFxuXHRcdH0gYXMgSUNoYXRUb29sSW52b2NhdGlvbjtcblx0XHRjb25zdCBjcmVhdGVJbnN0YW5jZVN0dWIgPSBzaW5vbi5zdHViKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnY3JlYXRlSW5zdGFuY2UnKS5jYWxsc0Zha2UoKF9jdG9yLCAuLi5hcmdzKSA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IFRlc3RUb29sSW52b2NhdGlvblN1YlBhcnQoYXJnc1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBhcmdzWzFdIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEpO1xuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3JlYXRlSW5zdGFuY2VTdHViLnJlc3RvcmUoKSkpO1xuXHRcdGNvbnN0IHBhcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRUb29sSW52b2NhdGlvblBhcnQoXG5cdFx0XHRpbnZvY2F0aW9uLFxuXHRcdFx0Y3JlYXRlUmVuZGVyQ29udGV4dCgpLFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHR7fSBhcyBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdFx0bW9ja0VkaXRvclBvb2wsXG5cdFx0XHQoKSA9PiA1MDAsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQwLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0b25EaWRVcGRhdGVUb2RvczogRXZlbnQuTm9uZSxcblx0XHRcdFx0Z2V0VG9kb3M6ICgpID0+IFtdLFxuXHRcdFx0XHRzZXRUb2RvcygpIHsgfSxcblx0XHRcdFx0bWlncmF0ZVRvZG9zKCkgeyB9LFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRUb2RvTGlzdFNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkQmVmb3JlVXBkYXRlID0gcGFydC5kb21Ob2RlLmZpcnN0RWxlbWVudENoaWxkPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtdGVybWluYWwtdG9vbC1zZXNzaW9uLWlkJyk7XG5cblx0XHR0ZXJtaW5hbERhdGEgPSB7IC4uLnRlcm1pbmFsRGF0YSwgdGVybWluYWxUb29sU2Vzc2lvbklkOiAndGVybWluYWwtc2Vzc2lvbicgfTtcblx0XHRzdGF0ZS5zZXQoeyAuLi5zdGF0ZS5nZXQoKSB9LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW5kZXJDb3VudDogY3JlYXRlSW5zdGFuY2VTdHViLmNhbGxDb3VudCxcblx0XHRcdHNlc3Npb25JZEJlZm9yZVVwZGF0ZSxcblx0XHRcdHNlc3Npb25JZEFmdGVyVXBkYXRlOiBwYXJ0LmRvbU5vZGUuZmlyc3RFbGVtZW50Q2hpbGQ/LmdldEF0dHJpYnV0ZSgnZGF0YS10ZXJtaW5hbC10b29sLXNlc3Npb24taWQnKSxcblx0XHR9LCB7XG5cdFx0XHRyZW5kZXJDb3VudDogMixcblx0XHRcdHNlc3Npb25JZEJlZm9yZVVwZGF0ZTogJycsXG5cdFx0XHRzZXNzaW9uSWRBZnRlclVwZGF0ZTogJ3Rlcm1pbmFsLXNlc3Npb24nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBhZGQgc2hpbW1lciBzdHlsaW5nIGZvciBhY3RpdmUgTUNQIHRvb2wgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWNwVG9vbCA9IGNyZWF0ZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHR0eXBlOiAnbWNwJyxcblx0XHRcdFx0bGFiZWw6ICdXZWF0aGVyIE1DUCcsXG5cdFx0XHRcdHNlcnZlckxhYmVsOiAnV2VhdGhlcicsXG5cdFx0XHRcdGluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb2xsZWN0aW9uSWQ6ICdjb2xsZWN0aW9uJyxcblx0XHRcdFx0ZGVmaW5pdGlvbklkOiAnZGVmaW5pdGlvbidcblx0XHRcdH0sXG5cdFx0XHR0b29sSWQ6ICd3ZWF0aGVyX2xvb2t1cCdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBhcnQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbFByb2dyZXNzU3ViUGFydCxcblx0XHRcdG1jcFRvb2wsXG5cdFx0XHRjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKSxcblx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0bmV3IFNldDxzdHJpbmc+KClcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLnNoaW1tZXItcHJvZ3Jlc3MnKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoaW1tZXJzIG9ubHkgdGhlIGxlYWRpbmcgdmVyYiBvZiBzdGFuZGFsb25lIHN0cmVhbWluZyBwcm9ncmVzcywgYnV0IG5vdCBpbnNpZGUgYSB0aGlua2luZyBwYXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhdGNoUGFydCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUb29sU3RyZWFtaW5nU3ViUGFydCxcblx0XHRcdGNyZWF0ZVN0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uKCdHZW5lcmF0aW5nIHBhdGNoICgyODIgbGluZXMpJyksXG5cdFx0XHRjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKSxcblx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyXG5cdFx0KSk7XG5cdFx0Y29uc3QgZWRpdFBhcnQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbFN0cmVhbWluZ1N1YlBhcnQsXG5cdFx0XHRjcmVhdGVTdHJlYW1pbmdUb29sSW52b2NhdGlvbignRWRpdGluZyA1IGxpbmVzJyksXG5cdFx0XHRjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKSxcblx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyXG5cdFx0KSk7XG5cdFx0Y29uc3QgdGhpbmtpbmdQYXJ0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRvb2xTdHJlYW1pbmdTdWJQYXJ0LFxuXHRcdFx0Y3JlYXRlU3RyZWFtaW5nVG9vbEludm9jYXRpb24oJ0dlbmVyYXRpbmcgcGF0Y2ggKDI4MiBsaW5lcyknLCAvKiBpc0F0dGFjaGVkVG9UaGlua2luZyAqLyB0cnVlKSxcblx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpLFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXJcblx0XHQpKTtcblxuXHRcdGNvbnN0IGluc3BlY3QgPSAocGFydDogQ2hhdFRvb2xTdHJlYW1pbmdTdWJQYXJ0KSA9PiB7XG5cdFx0XHRjb25zdCBzaGltbWVyVGV4dCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtcHJvZ3Jlc3Mtc2hpbW1lci10ZXh0Jyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzaGltbWVyOiAhIXBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuc2hpbW1lci1wcm9ncmVzcycpLFxuXHRcdFx0XHRzcGlubmVyOiAhIXBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY29kaWNvbi1sb2FkaW5nJyksXG5cdFx0XHRcdHNoaW1tZXJUZXh0OiBzaGltbWVyVGV4dD8udGV4dENvbnRlbnQsXG5cdFx0XHRcdC8vIEEgbmVnYXRpdmUgYW5pbWF0aW9uLWRlbGF5IGtlZXBzIHRoZSBzd2VlcCBjb250aW51b3VzIGFjcm9zcyBzdHJlYW1pbmcgcmVyZW5kZXJzLlxuXHRcdFx0XHRzaGltbWVyUGhhc2VTeW5jZWQ6IChzaGltbWVyVGV4dD8uc3R5bGUuYW5pbWF0aW9uRGVsYXkgPz8gJycpLmVuZHNXaXRoKCdtcycpLFxuXHRcdFx0XHR0ZXh0OiBwYXJ0LmRvbU5vZGUudGV4dENvbnRlbnQsXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhdGNoOiBpbnNwZWN0KHBhdGNoUGFydCksXG5cdFx0XHRlZGl0OiBpbnNwZWN0KGVkaXRQYXJ0KSxcblx0XHRcdHRoaW5raW5nOiBpbnNwZWN0KHRoaW5raW5nUGFydCksXG5cdFx0fSwge1xuXHRcdFx0cGF0Y2g6IHsgc2hpbW1lcjogdHJ1ZSwgc3Bpbm5lcjogZmFsc2UsIHNoaW1tZXJUZXh0OiAnR2VuZXJhdGluZyBwYXRjaCcsIHNoaW1tZXJQaGFzZVN5bmNlZDogdHJ1ZSwgdGV4dDogJ0dlbmVyYXRpbmcgcGF0Y2ggKDI4MiBsaW5lcyknIH0sXG5cdFx0XHRlZGl0OiB7IHNoaW1tZXI6IHRydWUsIHNwaW5uZXI6IGZhbHNlLCBzaGltbWVyVGV4dDogJ0VkaXRpbmcnLCBzaGltbWVyUGhhc2VTeW5jZWQ6IHRydWUsIHRleHQ6ICdFZGl0aW5nIDUgbGluZXMnIH0sXG5cdFx0XHR0aGlua2luZzogeyBzaGltbWVyOiBmYWxzZSwgc3Bpbm5lcjogZmFsc2UsIHNoaW1tZXJUZXh0OiB1bmRlZmluZWQsIHNoaW1tZXJQaGFzZVN5bmNlZDogZmFsc2UsIHRleHQ6ICdHZW5lcmF0aW5nIHBhdGNoICgyODIgbGluZXMpJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRzIHNoaW1tZXIgc3R5bGluZyBvbmx5IGZvciBhY3RpdmUgYXNrIHF1ZXN0aW9ucyBpbnZvY2F0aW9uIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFza1F1ZXN0aW9uc1Rvb2wgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbFByb2dyZXNzU3ViUGFydCxcblx0XHRcdGNyZWF0ZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiAndnNjb2RlX2Fza1F1ZXN0aW9ucycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQXNraW5nIGEgcXVlc3Rpb24gKFRhcmdldCknXG5cdFx0XHR9KSxcblx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpLFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRuZXcgU2V0PHN0cmluZz4oKVxuXHRcdCkpO1xuXHRcdGNvbnN0IGFza011bHRpcGxlUXVlc3Rpb25zVG9vbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0LFxuXHRcdFx0Y3JlYXRlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sSWQ6ICd2c2NvZGVfYXNrUXVlc3Rpb25zJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdBc2tpbmcgMyBxdWVzdGlvbnMgKFdoYXQgc2hvdWxkIHdlIHdvcmsgb24/LCBQcmVmZXJyZWQgYXJlYSwgSG93IGhhbmRzLW9uPyknXG5cdFx0XHR9KSxcblx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpLFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRuZXcgU2V0PHN0cmluZz4oKVxuXHRcdCkpO1xuXHRcdGNvbnN0IGFuYWx5emluZ0Fuc3dlcnNUb29sID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRvb2xQcm9ncmVzc1N1YlBhcnQsXG5cdFx0XHRjcmVhdGVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xJZDogJ3ZzY29kZV9hc2tRdWVzdGlvbnMnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0Fza2luZyBhIHF1ZXN0aW9uIChUYXJnZXQpJyxcblx0XHRcdFx0cHJvZ3Jlc3NNZXNzYWdlOiAnQW5hbHl6aW5nIHlvdXIgYW5zd2Vycy4uLidcblx0XHRcdH0pLFxuXHRcdFx0Y3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdG5ldyBTZXQ8c3RyaW5nPigpXG5cdFx0KSk7XG5cdFx0Y29uc3Qgd2FpdGluZ0ZvckFuc3dlclRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbFByb2dyZXNzU3ViUGFydCxcblx0XHRcdGNyZWF0ZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiAnYXNrX3VzZXInLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dhaXRpbmcgZm9yIGFuc3dlci4uLidcblx0XHRcdH0pLFxuXHRcdFx0Y3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdG5ldyBTZXQ8c3RyaW5nPigpXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdCEhYXNrUXVlc3Rpb25zVG9vbC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5zaGltbWVyLXByb2dyZXNzJyksXG5cdFx0XHRhc2tRdWVzdGlvbnNUb29sLmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcHJvZ3Jlc3Mtc2hpbW1lci10ZXh0Jyk/LnRleHRDb250ZW50LFxuXHRcdFx0YXNrUXVlc3Rpb25zVG9vbC5kb21Ob2RlLnRleHRDb250ZW50LFxuXHRcdFx0YXNrTXVsdGlwbGVRdWVzdGlvbnNUb29sLmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcHJvZ3Jlc3Mtc2hpbW1lci10ZXh0Jyk/LnRleHRDb250ZW50LFxuXHRcdFx0YXNrTXVsdGlwbGVRdWVzdGlvbnNUb29sLmRvbU5vZGUudGV4dENvbnRlbnQsXG5cdFx0XHQhIWFuYWx5emluZ0Fuc3dlcnNUb29sLmRvbU5vZGUucXVlcnlTZWxlY3RvcignLnNoaW1tZXItcHJvZ3Jlc3MnKSxcblx0XHRcdGFuYWx5emluZ0Fuc3dlcnNUb29sLmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcHJvZ3Jlc3Mtc2hpbW1lci10ZXh0Jyk/LnRleHRDb250ZW50LFxuXHRcdFx0ISF3YWl0aW5nRm9yQW5zd2VyVG9vbC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5zaGltbWVyLXByb2dyZXNzJylcblx0XHRdLCBbdHJ1ZSwgJ0Fza2luZyBhIHF1ZXN0aW9uJywgJ0Fza2luZyBhIHF1ZXN0aW9uIChUYXJnZXQpJywgJ0Fza2luZyAzIHF1ZXN0aW9ucycsICdBc2tpbmcgMyBxdWVzdGlvbnMgKFdoYXQgc2hvdWxkIHdlIHdvcmsgb24/LCBQcmVmZXJyZWQgYXJlYSwgSG93IGhhbmRzLW9uPyknLCBmYWxzZSwgdW5kZWZpbmVkLCB0cnVlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlbmRlciBhIGxvYWRpbmcgaWNvbiBmb3IgcnVuIHBsYXl3cmlnaHQgY29kZSBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0dG9vbElkOiAncnVuX3BsYXl3cmlnaHRfY29kZScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgUGxheXdyaWdodCBjb2RlLi4uJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGFydCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0LFxuXHRcdFx0dG9vbCxcblx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpLFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRuZXcgU2V0PHN0cmluZz4oKVxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY29kaWNvbi1sb2FkaW5nJyksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBhZGQgc2hpbW1lciBzdHlsaW5nIGZvciBub24tTUNQIHRvb2wgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVNlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0dG9vbElkOiAnZmV0Y2hfd2VicGFnZSdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBhcnQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbFByb2dyZXNzU3ViUGFydCxcblx0XHRcdHRvb2wsXG5cdFx0XHRjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKSxcblx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0bmV3IFNldDxzdHJpbmc+KClcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLnNoaW1tZXItcHJvZ3Jlc3MnKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgYW5vdGhlciBjbGllbnQgdG9vbCB3aXRoIGFuIGFjY2Vzc2libGUgaW5saW5lIHNraXAgYWN0aW9uJywgKCkgPT4ge1xuXHRcdGxldCBjYW5jZWxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ3N0YXRlJywge1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0cGFyYW1ldGVyczogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSxcblx0XHRcdHByb2dyZXNzOiBvYnNlcnZhYmxlVmFsdWUoJ3Byb2dyZXNzJywgeyBwcm9ncmVzczogdW5kZWZpbmVkIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHQuLi5jcmVhdGVUb29sSW52b2NhdGlvbih7IGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBSdW4gVGFzayBvbiBhbm90aGVyIGNsaWVudC4uLicgfSksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIFRhc2snLFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRvdGhlckNsaWVudFRvb2xDYWxsOiB7XG5cdFx0XHRcdGNhbmNlbDogKCkgPT4ge1xuXHRcdFx0XHRcdGNhbmNlbENvdW50Kys7XG5cdFx0XHRcdFx0c3RhdGUuc2V0KHtcblx0XHRcdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRcdHBhcmFtZXRlcnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0XHRcdFx0cG9zdENvbmZpcm1lZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cmVzdWx0RGV0YWlsczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y29udGVudEZvck1vZGVsOiBbXSxcblx0XHRcdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgbWFya2Rvd25SZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIgPSB7XG5cdFx0XHRyZW5kZXI6IChtYXJrZG93biwgb3B0aW9ucykgPT4gcmVuZGVyTWFya2Rvd24obWFya2Rvd24sIG9wdGlvbnMpLFxuXHRcdH07XG5cdFx0Y29uc3QgcGFydCA9IHJlbmRlclRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIG1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdGNvbnN0IHNraXBMaW5rID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhW2RhdGEtaHJlZj1cIiNza2lwXCJdJyk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NUZXh0ID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5wcm9ncmVzcy1zdGVwJyk/LnRleHRDb250ZW50Py5yZXBsYWNlQWxsKCdcXHUwMGEwJywgJyAnKTtcblx0XHRjb25zdCBsaW5rUGFyYWdyYXBoVGV4dCA9IHNraXBMaW5rPy5jbG9zZXN0KCdwJyk/LnRleHRDb250ZW50Py5yZXBsYWNlQWxsKCdcXHUwMGEwJywgJyAnKTtcblx0XHRjb25zdCBsaW5rTGFiZWwgPSBza2lwTGluaz8udGV4dENvbnRlbnQ7XG5cdFx0Y29uc3QgbGlua1JvbGUgPSBza2lwTGluaz8uZ2V0QXR0cmlidXRlKCdyb2xlJyk7XG5cdFx0Y29uc3QgbGlua0hyZWYgPSBza2lwTGluaz8uZ2V0QXR0cmlidXRlKCdocmVmJyk7XG5cdFx0Y29uc3QgdGFiSW5kZXggPSBza2lwTGluaz8udGFiSW5kZXg7XG5cblx0XHRza2lwTGluaz8uY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvZ3Jlc3NUZXh0LFxuXHRcdFx0bGlua1BhcmFncmFwaFRleHQsXG5cdFx0XHR0ZXh0QWZ0ZXJTa2lwOiBwYXJ0LmRvbU5vZGUudGV4dENvbnRlbnQ/LnJlcGxhY2VBbGwoJ1xcdTAwYTAnLCAnICcpLFxuXHRcdFx0bGlua0FmdGVyU2tpcDogcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ2FbZGF0YS1ocmVmPVwiI3NraXBcIl0nKSxcblx0XHRcdGxpbmtMYWJlbCxcblx0XHRcdGxpbmtSb2xlLFxuXHRcdFx0bGlua0hyZWYsXG5cdFx0XHR0YWJJbmRleCxcblx0XHRcdGNhbmNlbENvdW50LFxuXHRcdH0sIHtcblx0XHRcdHByb2dyZXNzVGV4dDogJ1J1bm5pbmcgUnVuIFRhc2sgb24gYW5vdGhlciBjbGllbnQuLi4gU2tpcD8nLFxuXHRcdFx0bGlua1BhcmFncmFwaFRleHQ6ICdSdW5uaW5nIFJ1biBUYXNrIG9uIGFub3RoZXIgY2xpZW50Li4uIFNraXA/Jyxcblx0XHRcdHRleHRBZnRlclNraXA6ICdSYW4gVGFzaycsXG5cdFx0XHRsaW5rQWZ0ZXJTa2lwOiBudWxsLFxuXHRcdFx0bGlua0xhYmVsOiAnU2tpcD8nLFxuXHRcdFx0bGlua1JvbGU6ICdidXR0b24nLFxuXHRcdFx0bGlua0hyZWY6ICcnLFxuXHRcdFx0dGFiSW5kZXg6IDAsXG5cdFx0XHRjYW5jZWxDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYWRkIHNoaW1tZXIgc3R5bGluZyBmb3IgY29tcGxldGVkIE1DUCB0b29sIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1jcFRvb2wgPSBjcmVhdGVTZXJpYWxpemVkVG9vbEludm9jYXRpb24oe1xuXHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdHR5cGU6ICdtY3AnLFxuXHRcdFx0XHRsYWJlbDogJ1dlYXRoZXIgTUNQJyxcblx0XHRcdFx0c2VydmVyTGFiZWw6ICdXZWF0aGVyJyxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbGxlY3Rpb25JZDogJ2NvbGxlY3Rpb24nLFxuXHRcdFx0XHRkZWZpbml0aW9uSWQ6ICdkZWZpbml0aW9uJ1xuXHRcdFx0fSxcblx0XHRcdHRvb2xJZDogJ3dlYXRoZXJfbG9va3VwJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGFydCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0LFxuXHRcdFx0bWNwVG9vbCxcblx0XHRcdGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpLFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRuZXcgU2V0PHN0cmluZz4oKVxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuc2hpbW1lci1wcm9ncmVzcycpLCBudWxsKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFtRCxtQkFBbUIsc0JBQXNCO0FBRTVGLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLDZDQUE2QztBQUN0RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDhCQUE4QiwyQkFBMkI7QUFFbEUsU0FBeUUscUJBQW9ELHVCQUF1QjtBQUVwSixTQUFTLHNCQUFpRTtBQUkxRSxNQUFNLGtDQUFrQyw4QkFBOEI7QUFBQSxFQUlyRSxZQUFZLGdCQUFxQyxjQUErQztBQUMvRixVQUFNLGNBQWM7QUFKckIsU0FBUyxVQUFVLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDMUQsc0JBQWEsQ0FBQztBQUliLFNBQUssUUFBUSxRQUFRLHdCQUF3QixhQUFhLHlCQUF5QjtBQUFBLEVBQ3BGO0FBQ0Q7QUFFQSxNQUFNLDJCQUEyQixNQUFNO0FBQ3RDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFdBQVMsb0JBQW9CLGFBQXNCLE9BQXNDO0FBQ3hGLFVBQU0sY0FBK0M7QUFBQSxNQUNwRDtBQUFBLE1BQ0EsSUFBSTtBQUFBLE1BQ0osaUJBQWlCLElBQUksTUFBTSw4QkFBOEI7QUFBQSxNQUN6RCxTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDakIsSUFBSSxRQUFRO0FBQUUsZUFBTyxDQUFDO0FBQUEsTUFBc0M7QUFBQSxJQUM3RDtBQUVBLFdBQU87QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULGtCQUFrQixDQUFDO0FBQUEsTUFDbkIsY0FBYztBQUFBLE1BQ2QsV0FBVyxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQUEsTUFDbEQsU0FBUyxDQUFDO0FBQUEsTUFDVixjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsTUFDWixxQkFBcUI7QUFBQSxNQUNyQixnQkFBZ0I7QUFBQSxNQUNoQixnQkFBZ0IsQ0FBQztBQUFBLE1BQ2pCLGNBQWMsZ0JBQWdCLGdCQUFnQixHQUFHO0FBQUEsTUFDakQsdUJBQXVCLE1BQU07QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFFQSxXQUFTLDhCQUE4QixrQkFBMEIsdUJBQWdDLE9BQTRCO0FBQzVILFVBQU0sUUFBUSxnQkFBMkMsU0FBUztBQUFBLE1BQ2pFLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxNQUNwQyxjQUFjLGdCQUFnQixnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsTUFDaEQsa0JBQWtCLGdCQUFnQixvQkFBb0IsZ0JBQWdCO0FBQUEsSUFDdkUsQ0FBQztBQUNELFdBQU87QUFBQSxNQUNOLEdBQUcscUJBQXFCLEVBQUUsbUJBQW1CLGlCQUFpQixDQUFDO0FBQUEsTUFDL0Q7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxXQUFTLCtCQUErQixVQUtwQyxDQUFDLEdBQWtDO0FBQ3RDLFdBQU87QUFBQSxNQUNOLGNBQWM7QUFBQSxNQUNkLGtCQUFrQjtBQUFBLE1BQ2xCLGVBQWU7QUFBQSxNQUNmLG1CQUFtQixRQUFRLHFCQUFxQjtBQUFBLE1BQ2hELGtCQUFrQjtBQUFBLE1BQ2xCLGVBQWU7QUFBQSxNQUNmLGFBQWEsRUFBRSxNQUFNLGdCQUFnQixzQkFBc0I7QUFBQSxNQUMzRCxZQUFZLFFBQVEsY0FBYztBQUFBLE1BQ2xDLFlBQVk7QUFBQSxNQUNaLFFBQVEsUUFBUSxVQUFVO0FBQUEsTUFDMUIsUUFBUSxRQUFRO0FBQUEsTUFDaEIsTUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBRUEsV0FBUyxxQkFBcUIsVUFLMUIsQ0FBQyxHQUF3QjtBQUM1QixVQUFNLFNBQVMsUUFBUSxVQUFVLGVBQWU7QUFDaEQsVUFBTSxTQUFTLFFBQVEsVUFBVTtBQUNqQyxXQUFPO0FBQUEsTUFDTixjQUFjO0FBQUEsTUFDZCxrQkFBa0I7QUFBQSxNQUNsQixlQUFlO0FBQUEsTUFDZixtQkFBbUIsUUFBUSxxQkFBcUI7QUFBQSxNQUNoRCxrQkFBa0I7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLFlBQVk7QUFBQSxNQUNaLE9BQU8sZ0JBQWdCLFNBQVM7QUFBQSxRQUMvQixNQUFNLG9CQUFvQixVQUFVO0FBQUEsUUFDcEMsWUFBWTtBQUFBLFFBQ1osV0FBVyxFQUFFLE1BQU0sZ0JBQWdCLHNCQUFzQjtBQUFBLFFBQ3pELFVBQVUsZ0JBQWdCLFlBQVksRUFBRSxTQUFTLFFBQVEsaUJBQWlCLFVBQVUsT0FBVSxDQUFDO0FBQUEsTUFDaEcsQ0FBQztBQUFBLE1BQ0Qsc0JBQXNCLGdCQUFnQixRQUFRLE1BQVM7QUFBQSxNQUN2RCxzQkFBc0I7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixRQUFRLE1BQU0sK0JBQStCLEVBQUUsUUFBUSxRQUFRLG1CQUFtQixRQUFRLGtCQUFrQixDQUFDO0FBQUEsSUFDOUc7QUFBQSxFQUNEO0FBRUEsUUFBTSxNQUFNO0FBQ1gsa0JBQWMsTUFBTSxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDN0MsMkJBQXVCLDhCQUE4QixRQUFXLEtBQUs7QUFFckUsK0JBQTJCLElBQUkseUJBQXlCO0FBQ3hELHlCQUFxQixLQUFLLHVCQUF1Qix3QkFBd0I7QUFFekUsMkJBQXVCO0FBQUEsTUFDdEIsUUFBUSxDQUFDLFVBQTJCLFVBQWtDLGVBQWdEO0FBQ3JILGNBQU0sVUFBVSxjQUFjLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDckUsY0FBTSxVQUFVLE9BQU8sYUFBYSxXQUFXLFdBQVcsa0JBQWtCLFFBQVE7QUFDcEYsZ0JBQVEsY0FBYztBQUN0QixlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0EsU0FBUyxNQUFNO0FBQUEsVUFBRTtBQUFBLFFBQ2xCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSx3QkFBb0I7QUFBQSxNQUNuQixlQUFlO0FBQUEsTUFDZixVQUFVLE9BQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUN0QyxtQkFBbUI7QUFBQSxJQUNwQjtBQUNBLHlCQUFxQixLQUFLLDRCQUE0QixpQkFBaUI7QUFFdkUsdUJBQW1CO0FBQUEsTUFDbEIsZUFBZTtBQUFBLE1BQ2YsV0FBVyxNQUFNO0FBQUEsTUFDakIsa0JBQWtCLE1BQU07QUFBQSxNQUN4Qix1QkFBdUIsTUFBTTtBQUFBLE1BQUU7QUFBQSxNQUMvQixXQUFXLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDbkIsbUJBQW1CLE9BQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUMvQyxtQkFBbUIsT0FBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQUUsR0FBRyxNQUFNLE1BQU07QUFBQSxNQUFFLEdBQUcsTUFBTSxNQUFNO0FBQUEsTUFBRSxHQUFHLFFBQVEsTUFBTTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQ3BHLGtCQUFrQixNQUFNO0FBQUEsTUFDeEIsV0FBVyxNQUFNO0FBQUEsSUFDbEI7QUFDQSx5QkFBcUIsS0FBSyxlQUFlLGdCQUFnQjtBQUV6RCxxQkFBaUIsQ0FBQztBQUFBLEVBQ25CLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxnQkFBWSxRQUFRO0FBQUEsRUFDckIsQ0FBQztBQUVELFdBQVMscUJBQXFCLGdCQUFxRSxXQUFXLHNCQUE4QztBQUMzSixXQUFPLFlBQVksSUFBSSxJQUFJO0FBQUEsTUFDMUI7QUFBQSxNQUNBLG9CQUFvQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxDQUFDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxRQUNDLGVBQWU7QUFBQSxRQUNmLGtCQUFrQixNQUFNO0FBQUEsUUFDeEIsVUFBVSxNQUFNLENBQUM7QUFBQSxRQUNqQixXQUFXO0FBQUEsUUFBRTtBQUFBLFFBQ2IsZUFBZTtBQUFBLFFBQUU7QUFBQSxNQUNsQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxPQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLFVBQU0sYUFBYSxxQkFBcUI7QUFDeEMsVUFBTSxPQUFPLHFCQUFxQixVQUFVO0FBQzVDLElBQUMsV0FBNkUsbUJBQW1CLEVBQUUsTUFBTSxXQUFXO0FBRXBILFdBQU8sWUFBWSxLQUFLLGVBQWUsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFVLEdBQUcsS0FBSztBQUFBLEVBQzNFLENBQUM7QUFFRCxPQUFLLHNGQUFzRixNQUFNO0FBQ2hHLFVBQU0sMEJBQTBCLENBQUMsZ0JBQTZDO0FBQUEsTUFDN0UsR0FBRyxxQkFBcUI7QUFBQSxNQUN4QjtBQUFBLE1BQ0EsT0FBTyxnQkFBMkMsU0FBUyxVQUFVLElBQUk7QUFBQSxRQUN4RSxNQUFNLG9CQUFvQixVQUFVO0FBQUEsUUFDcEMsWUFBWTtBQUFBLFFBQ1osc0JBQXNCLEVBQUUsT0FBTyxnQkFBZ0IsU0FBUyxlQUFlO0FBQUEsUUFDdkUsU0FBUyxNQUFNO0FBQUEsUUFBRTtBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGO0FBQ0EsVUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxZQUFNLFVBQVUsV0FBVyxTQUFTLGNBQWMsS0FBSztBQUN2RCxjQUFRLFlBQVk7QUFDcEIsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLGVBQWUsQ0FBQyxlQUFvQyxZQUFZLElBQUksVUFBVTtBQUFBLE1BQy9FO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBcUIsQ0FBQztBQUM1QixVQUFNLFNBQW9DLENBQUM7QUFDM0MsVUFBTSxXQUFXLFlBQVksSUFBSSxJQUFJLGlDQUFpQyxNQUFNO0FBQzNFLFlBQU0sSUFBSSxNQUFNLHNDQUFzQztBQUFBLElBQ3ZELEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDTixnQkFBWSxJQUFJLFNBQVMsMEJBQTBCLFFBQU0sT0FBTyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQ3pFLGFBQVMsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsZ0JBQWdCLE9BQU8sUUFBTSxTQUFTLEtBQUssRUFBRSxHQUFHLGlCQUFpQixtQkFBbUIsQ0FBQztBQUNsSixhQUFTLGtCQUFrQix3QkFBd0IsUUFBUSxHQUFHLGdCQUFnQixPQUFPLFFBQU0sU0FBUyxLQUFLLEVBQUUsR0FBRyxpQkFBaUIsbUJBQW1CLENBQUM7QUFFbkosYUFBUyw2QkFBNkIsY0FBYztBQUNwRCxVQUFNLGFBQWEsU0FBUyxRQUFRLGNBQWlDLGlDQUFpQztBQUN0RyxnQkFBWSxNQUFNO0FBRWxCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsTUFDQSxPQUFPLFlBQVk7QUFBQSxJQUNwQixHQUFHO0FBQUEsTUFDRixRQUFRLENBQUMsZ0JBQWdCLGNBQWM7QUFBQSxNQUN2QyxVQUFVLENBQUMsY0FBYztBQUFBLE1BQ3pCLE9BQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFVBQU0sWUFBZ0M7QUFBQSxNQUNyQyxNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsTUFDUCxhQUFhO0FBQUEsTUFDYixjQUFjO0FBQUEsTUFDZCxjQUFjO0FBQUEsTUFDZCxjQUFjO0FBQUEsSUFDZjtBQUVBLFVBQU0sUUFBUTtBQUFBLE1BQ2Isb0JBQW9CLHFCQUFxQixFQUFFLFFBQVEsVUFBVSxDQUFDLENBQUM7QUFBQSxNQUMvRCxvQkFBb0IsK0JBQStCLEVBQUUsUUFBUSxRQUFXLFFBQVEsZUFBZSxDQUFDLENBQUM7QUFBQSxNQUNqRyxvQkFBb0IsK0JBQStCLEVBQUUsUUFBUSxlQUFlLFVBQVUsUUFBUSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsSUFDakg7QUFFQSxXQUFPLGdCQUFnQixPQUFPLENBQUMsTUFBTSxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFVBQU0sWUFBWSxDQUFDLHdCQUF3Qix1QkFBdUIsWUFBWSxtQkFBbUIsb0JBQW9CO0FBQ3JILFdBQU8sZ0JBQWdCLFVBQVUsSUFBSSxZQUFVLDZCQUE2QixxQkFBcUIsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLE1BQU0sTUFBTSxNQUFNLElBQUksQ0FBQztBQUFBLEVBQy9JLENBQUM7QUFFRCxPQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLFVBQU0sYUFBNEM7QUFBQSxNQUNqRCxHQUFHLCtCQUErQixFQUFFLFlBQVksS0FBSyxDQUFDO0FBQUEsTUFDdEQsa0JBQWtCO0FBQUEsUUFDakIsTUFBTTtBQUFBLFFBQ04sY0FBYztBQUFBLFFBQ2QsZ0JBQWdCO0FBQUEsUUFDaEIsV0FBVztBQUFBLE1BQ1o7QUFBQSxJQUNEO0FBQ0EsVUFBTSxxQkFBcUIsTUFBTSxLQUFLLHNCQUFzQixnQkFBZ0IsRUFBRSxVQUFVLENBQUMsVUFBVSxTQUFTO0FBQzNHLGFBQU8sSUFBSSwwQkFBMEIsS0FBSyxDQUFDLEdBQTBCO0FBQUEsUUFDcEUsTUFBTTtBQUFBLFFBQ04sYUFBYSxFQUFFLFVBQVUsR0FBRztBQUFBLFFBQzVCLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxnQkFBWSxJQUFJLGFBQWEsTUFBTSxtQkFBbUIsUUFBUSxDQUFDLENBQUM7QUFFaEUseUJBQXFCLFVBQVU7QUFFL0IsV0FBTyxZQUFZLG1CQUFtQixVQUFVLEtBQUssQ0FBQyxHQUFHLHFDQUFxQztBQUFBLEVBQy9GLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLFVBQU0sU0FBUyxDQUFDLG1CQUEyQjtBQUMxQyxZQUFNLE9BQU8sWUFBWSxJQUFJLHFCQUFxQjtBQUFBLFFBQ2pEO0FBQUEsUUFDQSwrQkFBK0IsRUFBRSxZQUFZLEtBQUssQ0FBQztBQUFBLFFBQ25ELEVBQUUsTUFBTSx3QkFBd0IsY0FBYyxnQkFBZ0IsZ0JBQWdCLFdBQVcsVUFBVTtBQUFBLFFBQ25HLG9CQUFvQjtBQUFBLFFBQ3BCO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxTQUFTLEtBQUssUUFBUSxjQUEyQiwyQkFBMkI7QUFDbEYsYUFBTztBQUFBLFFBQ04sTUFBTSxRQUFRO0FBQUEsUUFDZCxXQUFXLFFBQVEsYUFBYSxZQUFZO0FBQUEsUUFDNUMsVUFBVSxRQUFRO0FBQUEsUUFDbEIsa0JBQWtCLENBQUMsQ0FBQyxRQUFRLGNBQWMsZ0JBQWdCO0FBQUE7QUFBQSxRQUUxRCx5QkFBeUIsUUFBUSxVQUFVLFNBQVMsU0FBUztBQUFBLFFBQzdELGVBQWUsQ0FBQyxHQUFHLFFBQVEsaUJBQWlCLFVBQVUsS0FBSyxDQUFDLENBQUMsRUFDM0QsUUFBUSxRQUFNLENBQUMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxFQUFFLE9BQU8sT0FBSyxFQUFFLFdBQVcsVUFBVSxDQUFDO0FBQUEsTUFDeEU7QUFBQSxJQUNEO0FBRUEsV0FBTyxnQkFBZ0IsQ0FBQyxPQUFPLFVBQVUsR0FBRyxPQUFPLGdCQUFnQixDQUFDLEdBQUc7QUFBQSxNQUN0RTtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sV0FBVztBQUFBLFFBQ1gsVUFBVTtBQUFBLFFBQ1Ysa0JBQWtCO0FBQUEsUUFDbEIseUJBQXlCO0FBQUEsUUFDekIsZUFBZSxDQUFDLGVBQWU7QUFBQSxNQUNoQztBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxRQUNWLGtCQUFrQjtBQUFBLFFBQ2xCLHlCQUF5QjtBQUFBLFFBQ3pCLGVBQWUsQ0FBQyxlQUFlO0FBQUEsTUFDaEM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFVBQU0sUUFBUSxnQkFBMkMsU0FBUztBQUFBLE1BQ2pFLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxNQUNwQyxZQUFZO0FBQUEsTUFDWixXQUFXLEVBQUUsTUFBTSxnQkFBZ0Isc0JBQXNCO0FBQUEsTUFDekQsVUFBVSxnQkFBZ0IsWUFBWSxFQUFFLFVBQVUsT0FBVSxDQUFDO0FBQUEsSUFDOUQsQ0FBQztBQUNELFFBQUksZUFBZ0Q7QUFBQSxNQUNuRCxNQUFNO0FBQUEsTUFDTixhQUFhLEVBQUUsVUFBVSxZQUFZO0FBQUEsTUFDckMsVUFBVTtBQUFBLElBQ1g7QUFDQSxVQUFNLGFBQWE7QUFBQSxNQUNsQixHQUFHLHFCQUFxQjtBQUFBLE1BQ3hCLElBQUksbUJBQW1CO0FBQUUsZUFBTztBQUFBLE1BQWM7QUFBQSxNQUM5QztBQUFBLE1BQ0Esc0JBQXNCLGdCQUFnQixRQUFRLFVBQVU7QUFBQSxJQUN6RDtBQUNBLFVBQU0scUJBQXFCLE1BQU0sS0FBSyxzQkFBc0IsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLFVBQVUsU0FBUztBQUMzRyxhQUFPLElBQUksMEJBQTBCLEtBQUssQ0FBQyxHQUEwQixLQUFLLENBQUMsQ0FBb0M7QUFBQSxJQUNoSCxDQUFDO0FBQ0QsZ0JBQVksSUFBSSxhQUFhLE1BQU0sbUJBQW1CLFFBQVEsQ0FBQyxDQUFDO0FBQ2hFLFVBQU0sT0FBTyxZQUFZLElBQUksSUFBSTtBQUFBLE1BQ2hDO0FBQUEsTUFDQSxvQkFBb0I7QUFBQSxNQUNwQjtBQUFBLE1BQ0EsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsUUFDQyxlQUFlO0FBQUEsUUFDZixrQkFBa0IsTUFBTTtBQUFBLFFBQ3hCLFVBQVUsTUFBTSxDQUFDO0FBQUEsUUFDakIsV0FBVztBQUFBLFFBQUU7QUFBQSxRQUNiLGVBQWU7QUFBQSxRQUFFO0FBQUEsTUFDbEI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLHdCQUF3QixLQUFLLFFBQVEsbUJBQW1CLGFBQWEsK0JBQStCO0FBRTFHLG1CQUFlLEVBQUUsR0FBRyxjQUFjLHVCQUF1QixtQkFBbUI7QUFDNUUsVUFBTSxJQUFJLEVBQUUsR0FBRyxNQUFNLElBQUksRUFBRSxHQUFHLE1BQVM7QUFFdkMsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixhQUFhLG1CQUFtQjtBQUFBLE1BQ2hDO0FBQUEsTUFDQSxzQkFBc0IsS0FBSyxRQUFRLG1CQUFtQixhQUFhLCtCQUErQjtBQUFBLElBQ25HLEdBQUc7QUFBQSxNQUNGLGFBQWE7QUFBQSxNQUNiLHVCQUF1QjtBQUFBLE1BQ3ZCLHNCQUFzQjtBQUFBLElBQ3ZCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFVBQU0sVUFBVSxxQkFBcUI7QUFBQSxNQUNwQyxRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxhQUFhO0FBQUEsUUFDYixjQUFjO0FBQUEsUUFDZCxjQUFjO0FBQUEsUUFDZCxjQUFjO0FBQUEsTUFDZjtBQUFBLE1BQ0EsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUVELFVBQU0sT0FBTyxZQUFZLElBQUkscUJBQXFCO0FBQUEsTUFDakQ7QUFBQSxNQUNBO0FBQUEsTUFDQSxvQkFBb0IsS0FBSztBQUFBLE1BQ3pCO0FBQUEsTUFDQSxvQkFBSSxJQUFZO0FBQUEsSUFDakIsQ0FBQztBQUVELFdBQU8sWUFBWSxLQUFLLFFBQVEsY0FBYyxtQkFBbUIsR0FBRyxJQUFJO0FBQUEsRUFDekUsQ0FBQztBQUVELE9BQUssbUdBQW1HLE1BQU07QUFDN0csVUFBTSxZQUFZLFlBQVksSUFBSSxxQkFBcUI7QUFBQSxNQUN0RDtBQUFBLE1BQ0EsOEJBQThCLDhCQUE4QjtBQUFBLE1BQzVELG9CQUFvQixLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFdBQVcsWUFBWSxJQUFJLHFCQUFxQjtBQUFBLE1BQ3JEO0FBQUEsTUFDQSw4QkFBOEIsaUJBQWlCO0FBQUEsTUFDL0Msb0JBQW9CLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sZUFBZSxZQUFZLElBQUkscUJBQXFCO0FBQUEsTUFDekQ7QUFBQSxNQUNBO0FBQUEsUUFBOEI7QUFBQTtBQUFBLFFBQTJEO0FBQUEsTUFBSTtBQUFBLE1BQzdGLG9CQUFvQixLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFVBQVUsQ0FBQyxTQUFtQztBQUNuRCxZQUFNLGNBQWMsS0FBSyxRQUFRLGNBQTJCLDZCQUE2QjtBQUN6RixhQUFPO0FBQUEsUUFDTixTQUFTLENBQUMsQ0FBQyxLQUFLLFFBQVEsY0FBYyxtQkFBbUI7QUFBQSxRQUN6RCxTQUFTLENBQUMsQ0FBQyxLQUFLLFFBQVEsY0FBYyxrQkFBa0I7QUFBQSxRQUN4RCxhQUFhLGFBQWE7QUFBQTtBQUFBLFFBRTFCLHFCQUFxQixhQUFhLE1BQU0sa0JBQWtCLElBQUksU0FBUyxJQUFJO0FBQUEsUUFDM0UsTUFBTSxLQUFLLFFBQVE7QUFBQSxNQUNwQjtBQUFBLElBQ0Q7QUFFQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE9BQU8sUUFBUSxTQUFTO0FBQUEsTUFDeEIsTUFBTSxRQUFRLFFBQVE7QUFBQSxNQUN0QixVQUFVLFFBQVEsWUFBWTtBQUFBLElBQy9CLEdBQUc7QUFBQSxNQUNGLE9BQU8sRUFBRSxTQUFTLE1BQU0sU0FBUyxPQUFPLGFBQWEsb0JBQW9CLG9CQUFvQixNQUFNLE1BQU0sK0JBQStCO0FBQUEsTUFDeEksTUFBTSxFQUFFLFNBQVMsTUFBTSxTQUFTLE9BQU8sYUFBYSxXQUFXLG9CQUFvQixNQUFNLE1BQU0sa0JBQWtCO0FBQUEsTUFDakgsVUFBVSxFQUFFLFNBQVMsT0FBTyxTQUFTLE9BQU8sYUFBYSxRQUFXLG9CQUFvQixPQUFPLE1BQU0sK0JBQStCO0FBQUEsSUFDckksQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEVBQTBFLE1BQU07QUFDcEYsVUFBTSxtQkFBbUIsWUFBWSxJQUFJLHFCQUFxQjtBQUFBLE1BQzdEO0FBQUEsTUFDQSxxQkFBcUI7QUFBQSxRQUNwQixRQUFRO0FBQUEsUUFDUixtQkFBbUI7QUFBQSxNQUNwQixDQUFDO0FBQUEsTUFDRCxvQkFBb0IsS0FBSztBQUFBLE1BQ3pCO0FBQUEsTUFDQSxvQkFBSSxJQUFZO0FBQUEsSUFDakIsQ0FBQztBQUNELFVBQU0sMkJBQTJCLFlBQVksSUFBSSxxQkFBcUI7QUFBQSxNQUNyRTtBQUFBLE1BQ0EscUJBQXFCO0FBQUEsUUFDcEIsUUFBUTtBQUFBLFFBQ1IsbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQztBQUFBLE1BQ0Qsb0JBQW9CLEtBQUs7QUFBQSxNQUN6QjtBQUFBLE1BQ0Esb0JBQUksSUFBWTtBQUFBLElBQ2pCLENBQUM7QUFDRCxVQUFNLHVCQUF1QixZQUFZLElBQUkscUJBQXFCO0FBQUEsTUFDakU7QUFBQSxNQUNBLHFCQUFxQjtBQUFBLFFBQ3BCLFFBQVE7QUFBQSxRQUNSLG1CQUFtQjtBQUFBLFFBQ25CLGlCQUFpQjtBQUFBLE1BQ2xCLENBQUM7QUFBQSxNQUNELG9CQUFvQixLQUFLO0FBQUEsTUFDekI7QUFBQSxNQUNBLG9CQUFJLElBQVk7QUFBQSxJQUNqQixDQUFDO0FBQ0QsVUFBTSx1QkFBdUIsWUFBWSxJQUFJLHFCQUFxQjtBQUFBLE1BQ2pFO0FBQUEsTUFDQSxxQkFBcUI7QUFBQSxRQUNwQixRQUFRO0FBQUEsUUFDUixtQkFBbUI7QUFBQSxNQUNwQixDQUFDO0FBQUEsTUFDRCxvQkFBb0IsS0FBSztBQUFBLE1BQ3pCO0FBQUEsTUFDQSxvQkFBSSxJQUFZO0FBQUEsSUFDakIsQ0FBQztBQUVELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsQ0FBQyxDQUFDLGlCQUFpQixRQUFRLGNBQWMsbUJBQW1CO0FBQUEsTUFDNUQsaUJBQWlCLFFBQVEsY0FBYyw2QkFBNkIsR0FBRztBQUFBLE1BQ3ZFLGlCQUFpQixRQUFRO0FBQUEsTUFDekIseUJBQXlCLFFBQVEsY0FBYyw2QkFBNkIsR0FBRztBQUFBLE1BQy9FLHlCQUF5QixRQUFRO0FBQUEsTUFDakMsQ0FBQyxDQUFDLHFCQUFxQixRQUFRLGNBQWMsbUJBQW1CO0FBQUEsTUFDaEUscUJBQXFCLFFBQVEsY0FBYyw2QkFBNkIsR0FBRztBQUFBLE1BQzNFLENBQUMsQ0FBQyxxQkFBcUIsUUFBUSxjQUFjLG1CQUFtQjtBQUFBLElBQ2pFLEdBQUcsQ0FBQyxNQUFNLHFCQUFxQiw4QkFBOEIsc0JBQXNCLCtFQUErRSxPQUFPLFFBQVcsSUFBSSxDQUFDO0FBQUEsRUFDMUwsQ0FBQztBQUVELE9BQUssbUVBQW1FLE1BQU07QUFDN0UsVUFBTSxPQUFPLHFCQUFxQjtBQUFBLE1BQ2pDLFFBQVE7QUFBQSxNQUNSLG1CQUFtQjtBQUFBLElBQ3BCLENBQUM7QUFFRCxVQUFNLE9BQU8sWUFBWSxJQUFJLHFCQUFxQjtBQUFBLE1BQ2pEO0FBQUEsTUFDQTtBQUFBLE1BQ0Esb0JBQW9CLEtBQUs7QUFBQSxNQUN6QjtBQUFBLE1BQ0Esb0JBQUksSUFBWTtBQUFBLElBQ2pCLENBQUM7QUFFRCxXQUFPLFlBQVksS0FBSyxRQUFRLGNBQWMsa0JBQWtCLEdBQUcsSUFBSTtBQUFBLEVBQ3hFLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFVBQU0sT0FBTywrQkFBK0I7QUFBQSxNQUMzQyxRQUFRLGVBQWU7QUFBQSxNQUN2QixRQUFRO0FBQUEsSUFDVCxDQUFDO0FBRUQsVUFBTSxPQUFPLFlBQVksSUFBSSxxQkFBcUI7QUFBQSxNQUNqRDtBQUFBLE1BQ0E7QUFBQSxNQUNBLG9CQUFvQixLQUFLO0FBQUEsTUFDekI7QUFBQSxNQUNBLG9CQUFJLElBQVk7QUFBQSxJQUNqQixDQUFDO0FBRUQsV0FBTyxZQUFZLEtBQUssUUFBUSxjQUFjLG1CQUFtQixHQUFHLElBQUk7QUFBQSxFQUN6RSxDQUFDO0FBRUQsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxRQUFJLGNBQWM7QUFDbEIsVUFBTSxRQUFRLGdCQUEyQyxTQUFTO0FBQUEsTUFDakUsTUFBTSxvQkFBb0IsVUFBVTtBQUFBLE1BQ3BDLFlBQVk7QUFBQSxNQUNaLFdBQVcsRUFBRSxNQUFNLGdCQUFnQixzQkFBc0I7QUFBQSxNQUN6RCxVQUFVLGdCQUFnQixZQUFZLEVBQUUsVUFBVSxPQUFVLENBQUM7QUFBQSxJQUM5RCxDQUFDO0FBQ0QsVUFBTSxhQUFrQztBQUFBLE1BQ3ZDLEdBQUcscUJBQXFCLEVBQUUsbUJBQW1CLHdDQUF3QyxDQUFDO0FBQUEsTUFDdEYsa0JBQWtCO0FBQUEsTUFDbEI7QUFBQSxNQUNBLHFCQUFxQjtBQUFBLFFBQ3BCLFFBQVEsTUFBTTtBQUNiO0FBQ0EsZ0JBQU0sSUFBSTtBQUFBLFlBQ1QsTUFBTSxvQkFBb0IsVUFBVTtBQUFBLFlBQ3BDLFlBQVk7QUFBQSxZQUNaLHNCQUFzQjtBQUFBLFlBQ3RCLFdBQVcsRUFBRSxNQUFNLGdCQUFnQixzQkFBc0I7QUFBQSxZQUN6RCxlQUFlO0FBQUEsWUFDZixlQUFlO0FBQUEsWUFDZixpQkFBaUIsQ0FBQztBQUFBLFVBQ25CLEdBQUcsTUFBUztBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFVBQU0sbUJBQXNDO0FBQUEsTUFDM0MsUUFBUSxDQUFDLFVBQVUsWUFBWSxlQUFlLFVBQVUsT0FBTztBQUFBLElBQ2hFO0FBQ0EsVUFBTSxPQUFPLHFCQUFxQixZQUFZLGdCQUFnQjtBQUM5RCxVQUFNLFdBQVcsS0FBSyxRQUFRLGNBQWlDLHNCQUFzQjtBQUNyRixVQUFNLGVBQWUsS0FBSyxRQUFRLGNBQWMsZ0JBQWdCLEdBQUcsYUFBYSxXQUFXLFFBQVUsR0FBRztBQUN4RyxVQUFNLG9CQUFvQixVQUFVLFFBQVEsR0FBRyxHQUFHLGFBQWEsV0FBVyxRQUFVLEdBQUc7QUFDdkYsVUFBTSxZQUFZLFVBQVU7QUFDNUIsVUFBTSxXQUFXLFVBQVUsYUFBYSxNQUFNO0FBQzlDLFVBQU0sV0FBVyxVQUFVLGFBQWEsTUFBTTtBQUM5QyxVQUFNLFdBQVcsVUFBVTtBQUUzQixjQUFVLE1BQU07QUFFaEIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0E7QUFBQSxNQUNBLGVBQWUsS0FBSyxRQUFRLGFBQWEsV0FBVyxRQUFVLEdBQUc7QUFBQSxNQUNqRSxlQUFlLEtBQUssUUFBUSxjQUFjLHNCQUFzQjtBQUFBLE1BQ2hFO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsY0FBYztBQUFBLE1BQ2QsbUJBQW1CO0FBQUEsTUFDbkIsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsV0FBVztBQUFBLE1BQ1gsVUFBVTtBQUFBLE1BQ1YsVUFBVTtBQUFBLE1BQ1YsVUFBVTtBQUFBLE1BQ1YsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsVUFBTSxVQUFVLCtCQUErQjtBQUFBLE1BQzlDLFFBQVE7QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLGFBQWE7QUFBQSxRQUNiLGNBQWM7QUFBQSxRQUNkLGNBQWM7QUFBQSxRQUNkLGNBQWM7QUFBQSxNQUNmO0FBQUEsTUFDQSxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBRUQsVUFBTSxPQUFPLFlBQVksSUFBSSxxQkFBcUI7QUFBQSxNQUNqRDtBQUFBLE1BQ0E7QUFBQSxNQUNBLG9CQUFvQixLQUFLO0FBQUEsTUFDekI7QUFBQSxNQUNBLG9CQUFJLElBQVk7QUFBQSxJQUNqQixDQUFDO0FBRUQsV0FBTyxZQUFZLEtBQUssUUFBUSxjQUFjLG1CQUFtQixHQUFHLElBQUk7QUFBQSxFQUN6RSxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
