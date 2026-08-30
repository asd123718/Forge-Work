import assert from "assert";
import { $ } from "../../../../../../../base/browser/dom.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { isResourceMultiDiffEditorInput } from "../../../../../../common/editor.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ChatCollapsibleContentPart } from "../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js";
import { ChatThinkingContentPart, getToolInvocationIcon, maybePickFunWorkingMessage } from "../../../../browser/widget/chatContentParts/chatThinkingContentPart.js";
import { IChatToolInvocation } from "../../../../common/chatService/chatService.js";
import { IChatMarkdownAnchorService } from "../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js";
import { ChatConfiguration, ThinkingDisplayMode } from "../../../../common/constants.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { ILanguageModelsService } from "../../../../common/languageModels.js";
import { ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../../platform/storage/common/storage.js";
import { chatSessionResourceToId } from "../../../../common/model/chatUri.js";
import { mock } from "../../../../../../../base/test/common/mock.js";
suite("ChatThinkingContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let mockConfigurationService;
  let mockMarkdownRenderer;
  let mockAnchorService;
  let mockHoverService;
  let mockLanguageModelsService;
  function createMockRenderContext(isComplete = false) {
    const mockElement = {
      isComplete,
      id: "test-response-id",
      sessionResource: URI.parse("chat-session://test/session1"),
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
      editorPool: {},
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: {},
      currentWidth: observableValue("currentWidth", 500),
      onDidChangeVisibility: Event.None
    };
  }
  function createThinkingPart(value, id) {
    return {
      kind: "thinking",
      value: value ?? "",
      id: id ?? "test-thinking-id"
    };
  }
  function createDiffData(added, removed, resourceName = "file.ts", version = "1") {
    return {
      added,
      removed,
      resources: [{
        resource: URI.file(`/workspace/${resourceName}`),
        originalURI: URI.file(`/snapshots/${version}/before/${resourceName}`),
        modifiedURI: URI.file(`/snapshots/${version}/after/${resourceName}`)
      }]
    };
  }
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, store);
    mockConfigurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, mockConfigurationService);
    mockMarkdownRenderer = {
      render: (_markdown, options, outElement) => {
        const element = outElement ?? mainWindow.document.createElement("div");
        const content = typeof _markdown === "string" ? _markdown : _markdown.value ?? "";
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
      register: () => toDisposable(() => {
      }),
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
      setupDelayedHover: () => toDisposable(() => {
      }),
      setupManagedHover: () => ({ dispose: () => {
      }, show: () => {
      }, hide: () => {
      }, update: () => {
      } }),
      showManagedHover: () => void 0,
      isHovered: () => false
    };
    instantiationService.stub(IHoverService, mockHoverService);
    mockLanguageModelsService = {
      _serviceBrand: void 0,
      onDidChangeLanguageModels: Event.None,
      getLanguageModelIds: () => [],
      lookupLanguageModel: () => void 0,
      selectLanguageModels: async () => [],
      registerLanguageModelChat: () => toDisposable(() => {
      }),
      sendChatRequest: async () => ({ stream: (async function* () {
      })(), result: Promise.resolve({}) }),
      computeTokenLength: async () => 0
    };
    instantiationService.stub(ILanguageModelsService, mockLanguageModelsService);
  });
  teardown(() => {
    disposables.dispose();
  });
  test("replace thinking phrases suppresses fun default phrases", () => {
    mockConfigurationService.setUserConfiguration(ChatConfiguration.ThinkingPhrases, {
      mode: "replace",
      phrases: ["Custom phrase"]
    });
    assert.strictEqual(maybePickFunWorkingMessage(mockConfigurationService, () => 0), void 0);
  });
  test("uses a search icon only when no problems were found", () => {
    assert.deepStrictEqual({
      referenceName: getToolInvocationIcon("problems", Codicon.error, "Checked files, no problems found"),
      internalTool: getToolInvocationIcon("get_errors", Codicon.error, "Checked files, no problems found"),
      contributedTool: getToolInvocationIcon("copilot_getErrors", Codicon.error, "Checked files, no problems found"),
      problemsFound: getToolInvocationIcon("problems", Codicon.error, "Checked files, 2 problems found"),
      unrelatedTool: getToolInvocationIcon("terminal", Codicon.terminal, "No problems found")
    }, {
      referenceName: Codicon.search,
      internalTool: Codicon.search,
      contributedTool: Codicon.search,
      problemsFound: Codicon.error,
      unrelatedTool: Codicon.terminal
    });
  });
  test("uses a comment icon for comment tools", () => {
    assert.deepStrictEqual({
      addComment: getToolInvocationIcon("addComment"),
      listComments: getToolInvocationIcon("listComments"),
      deleteComments: getToolInvocationIcon("deleteComments"),
      resolveComments: getToolInvocationIcon("resolveComments"),
      viewUnreviewedComments: getToolInvocationIcon("viewUnreviewedComments"),
      prefixedComment: getToolInvocationIcon("mcp__host__addComment")
    }, {
      addComment: Codicon.comment,
      listComments: Codicon.comment,
      deleteComments: Codicon.comment,
      resolveComments: Codicon.comment,
      viewUnreviewedComments: Codicon.comment,
      prefixedComment: Codicon.comment
    });
  });
  suite("ThinkingDisplayMode.Collapsed", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("should start collapsed", () => {
      const content = createThinkingPart("**Analyzing code**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      const animationContent = part.domNode.querySelector(".chat-collapsible-content-animation-inner");
      assert.deepStrictEqual({
        collapsed: part.domNode.classList.contains("chat-used-context-collapsed"),
        hasAnimationContainer: !!animationContainer,
        animationEnabled: part.domNode.classList.contains("chat-collapsible-content-animated"),
        contentIsInert: animationContent?.inert
      }, {
        collapsed: true,
        hasAnimationContainer: true,
        animationEnabled: true,
        contentIsInert: true
      });
    });
    test("should have chat-thinking-box class", () => {
      const content = createThinkingPart("**Processing**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      assert.ok(part.domNode.classList.contains("chat-thinking-box"), "Should have chat-thinking-box class");
    });
    test("should extract title from bold markdown", () => {
      const content = createThinkingPart("**Reading configuration files**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".chat-used-context-label .monaco-button");
      assert.ok(button, "Should have collapse button");
      const labelElement = button.querySelector(".icon-label");
      assert.ok(
        labelElement?.textContent?.includes("Reading configuration files") || button.textContent?.includes("Reading configuration files"),
        "Title should contain extracted text"
      );
    });
    test("lazy rendering - should not render content until expanded", () => {
      const content = createThinkingPart("**Initial thinking content**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const contentList = part.domNode.querySelector(".chat-used-context-list");
      assert.strictEqual(contentList, null, "Content should not be rendered when collapsed");
    });
    test("lazy rendering - should render content when expanded", () => {
      const content = createThinkingPart("**Thinking content to render**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      assert.ok(button, "Should have expand button");
      button.click();
      const contentList = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(contentList, "Content should be rendered after expanding");
    });
    test("user toggle event bubbles before expansion changes", () => {
      const content = createThinkingPart("**Thinking content to render**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const ancestor = mainWindow.document.createElement("div");
      ancestor.appendChild(part.domNode);
      mainWindow.document.body.appendChild(ancestor);
      disposables.add(toDisposable(() => ancestor.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      assert.ok(button);
      let toggleCount = 0;
      let expandedDuringToggle;
      const listener = () => {
        toggleCount++;
        expandedDuringToggle = button.ariaExpanded;
      };
      ancestor.addEventListener(ChatCollapsibleContentPart.userToggleEvent, listener);
      disposables.add(toDisposable(() => ancestor.removeEventListener(ChatCollapsibleContentPart.userToggleEvent, listener)));
      button.click();
      assert.deepStrictEqual({
        toggleCount,
        expandedDuringToggle,
        expandedAfterToggle: button.ariaExpanded
      }, {
        toggleCount: 1,
        expandedDuringToggle: "false",
        expandedAfterToggle: "true"
      });
    });
  });
  suite("ThinkingDisplayMode.CollapsedPreview", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.CollapsedPreview);
    });
    test("should start expanded when streaming (not complete)", () => {
      const content = createThinkingPart("**Analyzing**\nSome detailed reasoning about the code structure");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should be expanded during streaming in CollapsedPreview mode"
      );
    });
    test("should be collapsed when complete", () => {
      const content = createThinkingPart("**Completed task**");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
        // streamingCompleted
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        true,
        "Should be collapsed when complete"
      );
    });
    test("should be collapsed when streamingCompleted is true even if element.isComplete is false (look-ahead completion)", () => {
      const content = createThinkingPart("**Finished analyzing**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
        // streamingCompleted = true (look-ahead detected this thinking is done)
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        true,
        "Should be collapsed when streamingCompleted is true, even if element.isComplete is false"
      );
    });
    test("should use lazy rendering when streamingCompleted is true even if element.isComplete is false", () => {
      const content = createThinkingPart("**Looking ahead completed**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
        // streamingCompleted = true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const contentList = part.domNode.querySelector(".chat-used-context-list");
      assert.strictEqual(contentList, null, "Content should not be rendered when streamingCompleted=true (collapsed = lazy)");
    });
  });
  suite("ThinkingDisplayMode.FixedScrolling", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.FixedScrolling);
    });
    test("should have fixed mode class", () => {
      const content = createThinkingPart("**Scrolling content**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      assert.ok(
        part.domNode.classList.contains("chat-thinking-fixed-mode"),
        "Should have fixed mode class"
      );
      assert.strictEqual(
        part.domNode.querySelector(".chat-collapsible-content-animation"),
        null,
        "Fixed scrolling mode should not animate its content container"
      );
    });
    test("should init content early (eager rendering)", () => {
      const content = createThinkingPart("**Fixed scrolling content**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const scrollableContent = part.domNode.querySelector(".monaco-scrollable-element");
      assert.ok(scrollableContent, "Should have scrollable element in fixed mode (eager rendering)");
    });
    test("should create scrollable container", () => {
      const content = createThinkingPart("**Content with scrolling**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const scrollable = part.domNode.querySelector(".monaco-scrollable-element");
      assert.ok(scrollable, "Should have scrollable container");
    });
    test("should collapse without animation when streaming completes", async () => {
      const content = createThinkingPart("**Content with scrolling**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.appendItem(() => {
        const tool = $("div.test-completed-tool");
        tool.textContent = "Completed tool";
        return { domNode: tool };
      }, "test-tool");
      const contentList = part.domNode.querySelector(".chat-thinking-collapsible");
      assert.ok(contentList);
      Object.defineProperty(contentList, "scrollHeight", { configurable: true, value: 400 });
      part.finalizeTitleIfDefault();
      const button = part.domNode.querySelector(".monaco-button");
      assert.ok(button);
      const scrollable = part.domNode.querySelector(".monaco-scrollable-element");
      const completedHeight = scrollable?.style.maxHeight;
      const completionAnimationEnabled = part.domNode.classList.contains("chat-thinking-fixed-mode-animated");
      button.click();
      await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
      const verticalScrollbar = part.domNode.querySelector(".scrollbar.vertical");
      assert.deepStrictEqual({
        completedHeight,
        completionAnimationEnabled,
        userAnimationEnabled: part.domNode.classList.contains("chat-thinking-fixed-mode-animated"),
        expandedHeight: scrollable?.style.maxHeight,
        scrollbarIsInvisible: verticalScrollbar?.classList.contains("invisible"),
        toolIsVisible: !!part.domNode.querySelector(".test-completed-tool")
      }, {
        completedHeight: "0px",
        completionAnimationEnabled: false,
        userAnimationEnabled: true,
        expandedHeight: "400px",
        scrollbarIsInvisible: true,
        toolIsVisible: true
      });
    });
    test("should animate the first expansion and subsequent collapse of restored content", async () => {
      const content = createThinkingPart("**Restored content**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.appendItem(() => {
        const tool = $("div.test-restored-tool");
        tool.textContent = "Restored tool";
        return { domNode: tool };
      }, "restored-tool");
      const button = part.domNode.querySelector(".monaco-button");
      assert.ok(button);
      button.click();
      const contentList = part.domNode.querySelector(".chat-thinking-collapsible");
      const scrollable = part.domNode.querySelector(".monaco-scrollable-element");
      assert.ok(contentList);
      assert.ok(scrollable);
      Object.defineProperty(contentList, "scrollHeight", { configurable: true, value: 400 });
      const initialExpandedHeight = scrollable.style.maxHeight;
      await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
      const expandedHeight = scrollable.style.maxHeight;
      button.click();
      assert.deepStrictEqual({
        initialExpandedHeight,
        expandedHeight,
        collapsedHeight: scrollable.style.maxHeight,
        collapsedInert: scrollable.inert
      }, {
        initialExpandedHeight: "0px",
        expandedHeight: "400px",
        collapsedHeight: "0px",
        collapsedInert: true
      });
    });
  });
  suite("Thinking content updates", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("updateThinking should update content", () => {
      const content = createThinkingPart("**Initial**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      const updatedContent = createThinkingPart("**Updated thinking**", content.id);
      part.updateThinking(updatedContent);
      const thinkingItem = part.domNode.querySelector(".chat-thinking-item");
      assert.ok(thinkingItem, "Should have thinking item");
    });
    test("should track multiple title extractions", () => {
      const content = createThinkingPart("**First title**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      part.updateThinking(createThinkingPart("**Second title**", content.id));
      part.updateThinking(createThinkingPart("**Third title**", content.id));
      assert.ok(part.domNode, "Part should still be valid");
    });
    test("should restore the descriptive title after expand and collapse", () => {
      const content = createThinkingPart("**Read chatListRenderer.ts, lines 2230 to 2270**\nInspect grouping logic");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      assert.ok(button);
      button.click();
      part.updateThinking(createThinkingPart("**Read**\nInspect grouping logic", content.id));
      button.click();
      assert.strictEqual(button.textContent, "Thinking: Read chatListRenderer.ts, lines 2230 to 2270");
    });
  });
  suite("Thinking group identity", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("distinguishes reasoning from grouped tool content", () => {
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        createThinkingPart("**Reviewed the implementation**"),
        createMockRenderContext(false),
        mockMarkdownRenderer,
        false
      ));
      assert.deepStrictEqual({
        hasReasoning: part.hasReasoningContent(),
        hasGroupedItems: part.hasGroupedItems()
      }, {
        hasReasoning: true,
        hasGroupedItems: false
      });
      part.appendItem(() => ({ domNode: $("div.test-tool-item") }), "test-tool");
      assert.strictEqual(part.hasGroupedItems(), true);
    });
    test("adds elapsed time to finalized reasoning-only headers", () => {
      const content = createThinkingPart("**Reviewed the implementation**");
      content.reasoningDurationMs = 1200;
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        createMockRenderContext(false),
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.finalizeTitleIfDefault();
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      button?.click();
      assert.deepStrictEqual({
        generatedTitle: content.generatedTitle,
        labelHasDuration: /^Reviewed the implementation - \d+s$/.test(part.domNode.querySelector(".monaco-button")?.textContent ?? ""),
        ariaLabelHasDuration: /^Reviewed the implementation - \d+s$/.test(button?.ariaLabel ?? "")
      }, {
        generatedTitle: "Reviewed the implementation",
        labelHasDuration: true,
        ariaLabelHasDuration: true
      });
    });
    test("restores the persisted duration when reasoning content is rehydrated", () => {
      const content = createThinkingPart("**Reviewed the implementation**");
      content.reasoningDurationMs = 2300;
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        createMockRenderContext(false),
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.finalizeTitleIfDefault();
      assert.strictEqual(part.domNode.querySelector(".monaco-button")?.textContent, "Reviewed the implementation - 3s");
    });
    test("does not show zero or unknown reasoning duration", () => {
      const titles = [void 0, 0].map((reasoningDurationMs) => {
        const content = createThinkingPart("**Reviewed the implementation**");
        content.reasoningDurationMs = reasoningDurationMs;
        const part = store.add(instantiationService.createInstance(
          ChatThinkingContentPart,
          content,
          createMockRenderContext(false),
          mockMarkdownRenderer,
          true
        ));
        part.finalizeTitleIfDefault();
        return part.domNode.querySelector(".monaco-button")?.textContent;
      });
      assert.deepStrictEqual(titles, ["Reviewed the implementation", "Reviewed the implementation"]);
    });
  });
  suite("Tool invocation appending", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("appendItem should use lazy rendering when collapsed", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      let factoryCalled = false;
      const factory = () => {
        factoryCalled = true;
        return {
          domNode: $("div.test-tool-item"),
          disposable: void 0
        };
      };
      part.appendItem(factory, "test-tool-id");
      assert.strictEqual(factoryCalled, false, "Factory should not be called when collapsed (lazy rendering)");
    });
    test("appendItem should render immediately when expanded", () => {
      const content = createThinkingPart("**Working**\nSome detailed analysis of the problem");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      let factoryCalled = false;
      const factory = () => {
        factoryCalled = true;
        const div = $("div.test-tool-item");
        div.textContent = "Test tool content";
        return { domNode: div };
      };
      part.appendItem(factory, "test-tool-id");
      assert.strictEqual(factoryCalled, true, "Factory should be called immediately when expanded");
    });
    test("lazy items should materialize when first expanded", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      let factoryCalled = false;
      const factory = () => {
        factoryCalled = true;
        const div = $("div.test-tool-item");
        div.textContent = "Lazy content";
        return { domNode: div };
      };
      part.appendItem(factory, "test-tool-id");
      assert.strictEqual(factoryCalled, false, "Factory should not be called yet");
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      assert.strictEqual(factoryCalled, true, "Factory should be called after expanding");
    });
    test("removeLazyItem should remove pending lazy items", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      let factoryCalled = false;
      const factory = () => {
        factoryCalled = true;
        return { domNode: $("div.test-tool-item") };
      };
      part.appendItem(factory, "test-tool-to-remove");
      const removed = part.removeLazyItem("test-tool-to-remove");
      assert.strictEqual(removed, true, "Should successfully remove the lazy item");
      assert.strictEqual(factoryCalled, false, "Factory should never have been called");
    });
    test("lazy items should preserve append order when mixing tool and markdown items", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const appendOrder = [];
      part.appendItem(() => {
        appendOrder.push("tool1");
        const div = $("div.test-item");
        div.setAttribute("data-order", "tool1");
        div.textContent = "Tool 1";
        return { domNode: div };
      }, "tool-1");
      const markdownItem = {
        kind: "markdownContent",
        content: { value: "test markdown" }
      };
      part.appendItem(() => {
        appendOrder.push("markdown");
        const div = $("div.test-item");
        div.setAttribute("data-order", "markdown");
        div.textContent = "Markdown content";
        return { domNode: div };
      }, void 0, markdownItem);
      part.appendItem(() => {
        appendOrder.push("tool2");
        const div = $("div.test-item");
        div.setAttribute("data-order", "tool2");
        div.textContent = "Tool 2";
        return { domNode: div };
      }, "tool-2");
      assert.strictEqual(appendOrder.length, 0, "No items should be rendered while collapsed");
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      assert.strictEqual(appendOrder.length, 3, "All 3 items should be rendered after expanding");
      assert.deepStrictEqual(
        appendOrder,
        ["tool1", "markdown", "tool2"],
        "Items should render in the same order they were appended (tool1, markdown, tool2)"
      );
      const wrapper = part.domNode.querySelector(".chat-used-context-list");
      const toolWrappers = wrapper?.querySelectorAll(".chat-thinking-tool-wrapper");
      assert.ok(toolWrappers, "Should have tool wrappers");
      assert.strictEqual(toolWrappers?.length, 3, "Should have 3 tool wrappers");
      const domOrder = Array.from(toolWrappers).map((el) => {
        const testItem = el.querySelector(".test-item");
        return testItem?.getAttribute("data-order");
      });
      assert.deepStrictEqual(
        domOrder,
        ["tool1", "markdown", "tool2"],
        "DOM order should match append order (tool1, markdown, tool2)"
      );
    });
    test("setupThinkingContainer should preserve order with lazy tool items", () => {
      const initialContent = createThinkingPart("**Initial thinking**", "thinking-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        initialContent,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      let tool1Rendered = false;
      part.appendItem(() => {
        tool1Rendered = true;
        const div = $("div.test-item");
        div.setAttribute("data-test-id", "tool1");
        div.textContent = "Tool 1";
        return { domNode: div };
      }, "tool-1");
      const newThinkingContent = createThinkingPart("**Second thinking section**", "thinking-2");
      part.setupThinkingContainer(newThinkingContent);
      let tool2Rendered = false;
      part.appendItem(() => {
        tool2Rendered = true;
        const div = $("div.test-item");
        div.setAttribute("data-test-id", "tool2");
        div.textContent = "Tool 2";
        return { domNode: div };
      }, "tool-2");
      assert.strictEqual(tool1Rendered, false, "Tool 1 should not render while collapsed");
      assert.strictEqual(tool2Rendered, false, "Tool 2 should not render while collapsed");
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      assert.strictEqual(tool1Rendered, true, "Tool 1 should render after expand");
      assert.strictEqual(tool2Rendered, true, "Tool 2 should render after expand");
      const wrapper = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(wrapper, "Should have wrapper");
      const children = Array.from(wrapper.children);
      const tool1Index = children.findIndex(
        (el) => el.classList.contains("chat-thinking-tool-wrapper") && el.querySelector('[data-test-id="tool1"]')
      );
      const tool2Index = children.findIndex(
        (el) => el.classList.contains("chat-thinking-tool-wrapper") && el.querySelector('[data-test-id="tool2"]')
      );
      const thinkingItems = children.filter((el) => el.classList.contains("chat-thinking-item"));
      assert.ok(thinkingItems.length >= 1, "Should have at least one thinking item");
      assert.ok(tool1Index >= 0, "Should find tool1");
      assert.ok(tool2Index >= 0, "Should find tool2");
      assert.ok(
        tool1Index < tool2Index,
        `Tool1 (index ${tool1Index}) should come before Tool2 (index ${tool2Index}) in DOM order`
      );
    });
    test("markdown via updateThinking should preserve order with lazy tool items (BUG: markdown renders before tools)", () => {
      const initialContent = createThinkingPart("", "thinking-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        initialContent,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.appendItem(() => {
        const div = $("div.test-item");
        div.setAttribute("data-test-id", "tool1");
        div.setAttribute("data-order", "1");
        div.textContent = "Tool 1";
        return { domNode: div };
      }, "tool-1");
      const thinkingContent = createThinkingPart("**Analyzing the codebase**", "thinking-2");
      part.setupThinkingContainer(thinkingContent);
      part.appendItem(() => {
        const div = $("div.test-item");
        div.setAttribute("data-test-id", "tool2");
        div.setAttribute("data-order", "3");
        div.textContent = "Tool 2";
        return { domNode: div };
      }, "tool-2");
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      const wrapper = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(wrapper, "Should have wrapper after expanding");
      const children = Array.from(wrapper.children);
      const tool1Index = children.findIndex(
        (el) => el.querySelector('[data-test-id="tool1"]')
      );
      const tool2Index = children.findIndex(
        (el) => el.querySelector('[data-test-id="tool2"]')
      );
      const markdownIndex = children.findIndex(
        (el) => el.classList.contains("chat-thinking-item") && el.classList.contains("markdown-content")
      );
      assert.ok(tool1Index >= 0, `Should find tool1 in DOM (found at index ${tool1Index})`);
      assert.ok(tool2Index >= 0, `Should find tool2 in DOM (found at index ${tool2Index})`);
      assert.ok(markdownIndex >= 0, `Should find markdown in DOM (found at index ${markdownIndex})`);
      assert.ok(
        tool1Index < markdownIndex,
        `BUG: Tool1 (index ${tool1Index}) should come BEFORE markdown (index ${markdownIndex}) because tool1 was appended first. Current DOM order indicates markdown is eagerly placed first regardless of arrival order.`
      );
      assert.ok(
        markdownIndex < tool2Index,
        `Markdown (index ${markdownIndex}) should come before Tool2 (index ${tool2Index})`
      );
    });
    test("lazy thinking items should show updated content after streaming updates", () => {
      const initialContent = createThinkingPart("", "thinking-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        initialContent,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const thinkingContent1 = createThinkingPart("**Starting analysis**", "thinking-2");
      part.setupThinkingContainer(thinkingContent1);
      const thinkingContent2 = createThinkingPart("**Starting analysis** Looking at the code structure...", "thinking-2");
      part.updateThinking(thinkingContent2);
      const thinkingContent3 = createThinkingPart("**Starting analysis** Looking at the code structure... Found the issue in the parser module.", "thinking-2");
      part.updateThinking(thinkingContent3);
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      const wrapper = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(wrapper, "Should have wrapper after expanding");
      const thinkingItems = wrapper.querySelectorAll(".chat-thinking-item.markdown-content");
      assert.strictEqual(
        thinkingItems.length,
        1,
        `BUG: Should have exactly 1 thinking item, but got ${thinkingItems.length}. materializeLazyItem creates a duplicate container from the lazy item. Items: ${Array.from(thinkingItems).map((i) => `"${i.textContent}"`).join(", ")}`
      );
      if (thinkingItems.length === 1) {
        const renderedText = thinkingItems[0].textContent || "";
        assert.ok(
          renderedText.includes("Found the issue in the parser module"),
          `Content should show latest streaming update. Got: "${renderedText}"`
        );
      }
    });
    test("lazy thinking items should work without streaming updates after setupThinkingContainer", () => {
      const initialContent = createThinkingPart("", "thinking-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        initialContent,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const thinkingContent = createThinkingPart("**Analyzing files**", "thinking-2");
      part.setupThinkingContainer(thinkingContent);
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      const wrapper = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(wrapper, "Should have wrapper after expanding");
      const thinkingItems = wrapper.querySelectorAll(".chat-thinking-item.markdown-content");
      assert.strictEqual(thinkingItems.length, 1, "Should have exactly 1 thinking item");
      const renderedText = thinkingItems[0].textContent || "";
      assert.ok(
        renderedText.includes("Analyzing files"),
        `Content should show setupThinkingContainer content. Got: "${renderedText}"`
      );
    });
  });
  suite("State management", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("markAsInactive should update isActive state", () => {
      const content = createThinkingPart("**Active thinking**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      assert.strictEqual(part.getIsActive(), true, "Should start as active");
      part.markAsInactive();
      assert.strictEqual(part.getIsActive(), false, "Should be inactive after markAsInactive");
    });
    test("dispose should set isActive to false", () => {
      const content = createThinkingPart("**Active thinking**");
      const context = createMockRenderContext(false);
      const part = instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      );
      assert.strictEqual(part.getIsActive(), true, "Should start as active");
      part.dispose();
      assert.strictEqual(part.getIsActive(), false, "Should be inactive after dispose");
    });
    test("collapseContent should collapse the part", () => {
      const content = createThinkingPart("**Content**\nSome detailed reasoning that differs from the title");
      const context = createMockRenderContext(false);
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.CollapsedPreview);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false);
      part.collapseContent();
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        true,
        "Should be collapsed after collapseContent"
      );
    });
    test("finalizeTitleIfDefault should update button icon to check", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.finalizeTitleIfDefault();
      const iconElement = part.domNode.querySelector(".codicon-check");
      assert.ok(iconElement, "Should have check icon after finalization");
      assert.ok(part.domNode.classList.contains("chat-collapsible-content-animated"), "Should enable content animation after finalization");
    });
    test("finalizeTitleIfDefault should retain initial thinking title", () => {
      const content = createThinkingPart("**Reviewed renderer state**\nChecked completed response rendering");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.finalizeTitleIfDefault();
      const button = part.domNode.querySelector(".monaco-button");
      assert.deepStrictEqual({
        generatedTitle: content.generatedTitle,
        label: button.textContent,
        ariaLabel: button.ariaLabel
      }, {
        generatedTitle: "Reviewed renderer state",
        label: "Reviewed renderer state",
        ariaLabel: "Reviewed renderer state"
      });
    });
    test("finalizeTitleIfDefault should retain restored terminal title", () => {
      const content = createThinkingPart("");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const terminalTool = {
        kind: "toolInvocationSerialized",
        toolId: "run_in_terminal",
        toolCallId: "terminal-call-1",
        invocationMessage: "Running npm test",
        originMessage: void 0,
        pastTenseMessage: void 0,
        presentation: void 0,
        isConfirmed: { type: 0 },
        isComplete: true,
        source: ToolDataSource.Internal,
        generatedTitle: "Ran npm test",
        isAttachedToThinking: false,
        toolSpecificData: {
          kind: "terminal",
          commandLine: { original: "npm test" },
          language: "shellscript"
        }
      };
      part.appendItem(() => ({ domNode: $("div.test-terminal-tool") }), terminalTool.toolId, terminalTool);
      part.finalizeTitleIfDefault();
      const button = part.domNode.querySelector(".monaco-button");
      assert.deepStrictEqual({
        contentGeneratedTitle: content.generatedTitle,
        toolGeneratedTitle: terminalTool.generatedTitle,
        label: button.textContent,
        ariaLabel: button.ariaLabel
      }, {
        contentGeneratedTitle: "Ran npm test",
        toolGeneratedTitle: "Ran npm test",
        label: "Ran npm test",
        ariaLabel: "Ran npm test"
      });
    });
    test("finalizeTitleIfDefault should restore cached title for a reasoning-only block keyed by thinking part id", () => {
      const context = createMockRenderContext(true);
      const thinkingId = "reasoning-part-1";
      const storageService = instantiationService.get(IStorageService);
      const cacheKey = `${chatSessionResourceToId(context.element.sessionResource)}:${thinkingId}`;
      storageService.store(
        "chat.thinkingTitleCache",
        JSON.stringify({ [cacheKey]: { title: "Analyzed authentication flow", storedAt: Date.now() } }),
        StorageScope.PROFILE,
        StorageTarget.MACHINE
      );
      const content = createThinkingPart("", thinkingId);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.finalizeTitleIfDefault();
      const button = part.domNode.querySelector(".monaco-button");
      assert.deepStrictEqual({
        generatedTitle: content.generatedTitle,
        label: button.textContent,
        ariaLabel: button.ariaLabel
      }, {
        generatedTitle: "Analyzed authentication flow",
        label: "Analyzed authentication flow",
        ariaLabel: "Analyzed authentication flow"
      });
    });
  });
  suite("hasSameContent", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("should return true for tool invocations", () => {
      const content = createThinkingPart("**Working**", "id-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const toolInvocation = {
        kind: "toolInvocation",
        toolId: "test-tool",
        invocationMessage: "Testing",
        resultDetails: [],
        isConfirmed: void 0,
        pastTenseMessage: void 0,
        isComplete: true,
        isCanceled: false
      };
      const result = part.hasSameContent(toolInvocation, [], context.element);
      assert.strictEqual(result, true, "Should accept tool invocations as same content");
    });
    test("should return false when a tool becomes a parent subagent", () => {
      const content = createThinkingPart("**Working**", "id-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const toolInvocation = {
        kind: "toolInvocation",
        toolSpecificData: { kind: "subagent" },
        subAgentInvocationId: void 0
      };
      assert.strictEqual(part.hasSameContent(toolInvocation, [], context.element), false);
    });
    test("should return true for markdown content", () => {
      const content = createThinkingPart("**Working**", "id-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const markdownContent = {
        kind: "markdownContent",
        content: { value: "test" }
      };
      const result = part.hasSameContent(markdownContent, [], context.element);
      assert.strictEqual(result, true, "Should accept markdown content as same content");
    });
    test("should return false for different thinking part with same id", () => {
      const content = createThinkingPart("**Working**", "id-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const otherThinking = createThinkingPart("**Different**", "id-1");
      const result = part.hasSameContent(otherThinking, [], context.element);
      assert.strictEqual(result, false, "Should return false for thinking part with same id");
    });
    test("should return true for thinking part with different id", () => {
      const content = createThinkingPart("**Working**", "id-1");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const otherThinking = createThinkingPart("**Different**", "id-2");
      const result = part.hasSameContent(otherThinking, [], context.element);
      assert.strictEqual(result, true, "Should return true for thinking part with different id");
    });
  });
  suite("DOM structure", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("should have proper aria-expanded attribute", () => {
      const content = createThinkingPart("**Content**\nSome detailed reasoning that differs from the title");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      assert.ok(button, "Button should exist");
      assert.strictEqual(button.getAttribute("aria-expanded"), "false", 'Should have aria-expanded="false" when collapsed');
      button.click();
      assert.strictEqual(button.getAttribute("aria-expanded"), "true", 'Should have aria-expanded="true" when expanded');
    });
    test("should show loading spinner while streaming", () => {
      const content = createThinkingPart("**Streaming content**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
        // not streaming completed
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const circleIcon = part.domNode.querySelector(".codicon-circle-filled");
      assert.ok(circleIcon, "Should have circle-filled icon while streaming");
    });
    function createMockStreamingToolInvocation(toolId, invocationMessage, toolCallId) {
      return {
        kind: "toolInvocation",
        toolId,
        toolCallId,
        invocationMessage,
        originMessage: void 0,
        pastTenseMessage: void 0,
        presentation: void 0,
        source: ToolDataSource.Internal,
        isAttachedToThinking: false,
        generatedTitle: void 0,
        state: observableValue("state", {
          type: IChatToolInvocation.StateKind.Streaming,
          partialInput: observableValue("partialInput", void 0),
          streamingMessage: observableValue("streamingMessage", void 0)
        }),
        toolSpecificDataKind: observableValue("test", void 0),
        toJSON: () => ({})
      };
    }
    function createMockExecutingToolInvocation(toolId, invocationMessage, toolCallId) {
      return {
        kind: "toolInvocation",
        toolId,
        toolCallId,
        invocationMessage,
        originMessage: void 0,
        pastTenseMessage: void 0,
        presentation: void 0,
        source: ToolDataSource.Internal,
        isAttachedToThinking: false,
        generatedTitle: void 0,
        state: observableValue("state", {
          type: IChatToolInvocation.StateKind.Executing,
          confirmed: { type: 0 },
          progress: observableValue("progress", { progress: 0 }),
          parameters: {},
          confirmationMessages: void 0
        }),
        toolSpecificDataKind: observableValue("test", void 0),
        toJSON: () => ({})
      };
    }
    function createMockSerializedImageToolInvocation(toolId, invocationMessage, toolCallId) {
      return {
        kind: "toolInvocationSerialized",
        toolId,
        toolCallId,
        invocationMessage,
        originMessage: void 0,
        pastTenseMessage: void 0,
        presentation: void 0,
        resultDetails: {
          output: {
            type: "data",
            mimeType: "image/png",
            base64Data: "AQID"
          }
        },
        isConfirmed: { type: 0 },
        isComplete: true,
        source: ToolDataSource.Internal,
        generatedTitle: void 0,
        isAttachedToThinking: false
      };
    }
    test("finalizeTitleIfDefault should promote a single tool out of thinking even when it is not complete", () => {
      const content = createThinkingPart("");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.domNode.querySelector(".monaco-button")?.click();
      const originalParent = $("div.original-parent");
      mainWindow.document.body.appendChild(originalParent);
      disposables.add(toDisposable(() => originalParent.remove()));
      const executingTool = createMockExecutingToolInvocation("copilot_readFile", "Reading file", "call-1");
      assert.strictEqual(IChatToolInvocation.isComplete(executingTool), false, "precondition: tool is not complete");
      const toolDom = $("div.chat-tool-invocation-part");
      const toolHeader = $("div.tool-header");
      toolHeader.textContent = "Reading file";
      const toolBody = $("div.tool-body");
      toolBody.textContent = "AGENTS.md";
      toolDom.append(toolHeader, toolBody);
      part.appendItem(() => ({ domNode: toolDom }), executingTool.toolId, executingTool, originalParent);
      const usedContextList = part.domNode.querySelector(".chat-used-context-list");
      const thinkingWrapper = toolDom.parentElement;
      const thinkingItemCountBeforeFinalize = usedContextList?.childElementCount;
      part.finalizeTitleIfDefault();
      assert.deepStrictEqual({
        thinkingItemCountBeforeFinalize,
        thinkingItemCountAfterFinalize: usedContextList?.childElementCount,
        toolChildCount: toolDom.childElementCount,
        toolParent: toolDom.parentElement === originalParent,
        thinkingWrapperRemoved: !thinkingWrapper?.parentElement,
        isAttachedToThinking: executingTool.isAttachedToThinking
      }, {
        thinkingItemCountBeforeFinalize: 2,
        thinkingItemCountAfterFinalize: 0,
        toolChildCount: 2,
        toolParent: true,
        thinkingWrapperRemoved: true,
        isAttachedToThinking: false
      });
    });
    test("finalizeTitleIfDefault should promote a lazy single tool without its thinking icon", () => {
      const content = createThinkingPart("");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const originalParent = $("div.original-parent");
      mainWindow.document.body.appendChild(originalParent);
      disposables.add(toDisposable(() => originalParent.remove()));
      const executingTool = createMockExecutingToolInvocation("copilot_readFile", "Reading file", "call-1");
      const toolDom = $("div.chat-tool-invocation-part");
      toolDom.textContent = "Reading file";
      part.appendItem(() => ({ domNode: toolDom }), executingTool.toolId, executingTool, originalParent);
      part.finalizeTitleIfDefault();
      assert.deepStrictEqual({
        toolParent: toolDom.parentElement === originalParent,
        topLevelChildCount: originalParent.childElementCount,
        topLevelChild: originalParent.firstElementChild === toolDom,
        isAttachedToThinking: executingTool.isAttachedToThinking
      }, {
        toolParent: true,
        topLevelChildCount: 1,
        topLevelChild: true,
        isAttachedToThinking: false
      });
    });
    test("finalizeTitleIfDefault should keep a related item inside the preceding tool invocation part", () => {
      const content = createThinkingPart("");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const originalParent = $("div.original-parent");
      const toolInvocationPart = $("div.chat-tool-invocation-part");
      originalParent.append(toolInvocationPart, part.domNode);
      mainWindow.document.body.appendChild(originalParent);
      disposables.add(toDisposable(() => originalParent.remove()));
      part.domNode.querySelector(".monaco-button")?.click();
      const editPill = $("div.chat-codeblock-pill-container");
      editPill.textContent = "Edited AGENTS.md";
      const markdown = { kind: "markdownContent", content: { value: "" } };
      part.appendItem(() => ({ domNode: editPill }), "edit-pill", markdown, originalParent);
      const thinkingWrapper = editPill.parentElement;
      part.finalizeTitleIfDefault();
      assert.deepStrictEqual({
        editPillParent: editPill.parentElement === toolInvocationPart,
        thinkingWrapperRemoved: !thinkingWrapper?.parentElement
      }, {
        editPillParent: true,
        thinkingWrapperRemoved: true
      });
    });
    test("finalizeTitleIfDefault should promote an external edit beside a hidden tool invocation", () => {
      const content = createThinkingPart("");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const originalParent = $("div.original-parent");
      const hiddenToolInvocationPart = $("div.chat-tool-invocation-part");
      hiddenToolInvocationPart.style.display = "none";
      originalParent.append(hiddenToolInvocationPart, part.domNode);
      mainWindow.document.body.appendChild(originalParent);
      disposables.add(toDisposable(() => originalParent.remove()));
      part.domNode.querySelector(".monaco-button")?.click();
      const editPill = $("div.chat-codeblock-pill-container");
      editPill.textContent = "Edited package.json";
      const externalEdit = {
        kind: "externalEdit",
        uri: URI.file("/workspace/package.json"),
        editKind: "edit"
      };
      part.appendItem(() => ({ domNode: editPill }), "external-edit", externalEdit, originalParent);
      const thinkingWrapper = editPill.parentElement;
      part.finalizeTitleIfDefault();
      assert.deepStrictEqual({
        editPillParent: editPill.parentElement === originalParent,
        hiddenToolChildCount: hiddenToolInvocationPart.childElementCount,
        thinkingWrapperRemoved: !thinkingWrapper?.parentElement
      }, {
        editPillParent: true,
        hiddenToolChildCount: 0,
        thinkingWrapperRemoved: true
      });
    });
    test("finalizeTitleIfDefault should use the original parent when finding a preceding tool invocation part", () => {
      const content = createThinkingPart("");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      const originalParent = $("div.original-parent");
      const originalToolInvocationPart = $("div.chat-tool-invocation-part");
      originalParent.append(originalToolInvocationPart, part.domNode);
      mainWindow.document.body.appendChild(originalParent);
      disposables.add(toDisposable(() => originalParent.remove()));
      part.domNode.querySelector(".monaco-button")?.click();
      const editPill = $("div.chat-codeblock-pill-container");
      editPill.textContent = "Edited AGENTS.md";
      const markdown = { kind: "markdownContent", content: { value: "" } };
      part.appendItem(() => ({ domNode: editPill }), "edit-pill", markdown, originalParent);
      const unrelatedParent = $("div.unrelated-parent");
      const unrelatedToolInvocationPart = $("div.chat-tool-invocation-part");
      unrelatedParent.append(unrelatedToolInvocationPart, part.domNode);
      mainWindow.document.body.appendChild(unrelatedParent);
      disposables.add(toDisposable(() => unrelatedParent.remove()));
      part.finalizeTitleIfDefault();
      assert.deepStrictEqual({
        editPillParentIsOriginalTool: editPill.parentElement === originalToolInvocationPart,
        unrelatedToolChildCount: unrelatedToolInvocationPart.childElementCount
      }, {
        editPillParentIsOriginalTool: true,
        unrelatedToolChildCount: 0
      });
    });
    test('should show "Editing files" for streaming edit tools instead of generic display name', () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const streamingReplaceTool = createMockStreamingToolInvocation(
        "copilot_replaceString",
        "Replace String in File",
        "call-1"
      );
      part.appendItem(() => {
        const div = $("div.test-item");
        div.textContent = "Replace tool";
        return { domNode: div };
      }, streamingReplaceTool.toolId, streamingReplaceTool);
      const button = part.domNode.querySelector(".chat-used-context-label .monaco-button");
      assert.ok(button, "Should have collapse button");
      const labelText = button.querySelector(".icon-label")?.textContent ?? button.textContent ?? "";
      assert.ok(labelText.includes("Editing files"), `Title should contain "Editing files" but got "${labelText}"`);
    });
    test("should show original message for non-edit streaming tools", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const streamingReadTool = createMockStreamingToolInvocation(
        "copilot_readFile",
        "Reading file.ts",
        "call-2"
      );
      part.appendItem(() => {
        const div = $("div.test-item");
        div.textContent = "Read tool";
        return { domNode: div };
      }, streamingReadTool.toolId, streamingReadTool);
      const button = part.domNode.querySelector(".chat-used-context-label .monaco-button");
      assert.ok(button, "Should have collapse button");
      const labelText = button.querySelector(".icon-label")?.textContent ?? button.textContent ?? "";
      assert.ok(labelText.includes("Reading file.ts"), `Title should contain "Reading file.ts" but got "${labelText}"`);
    });
    test("should show original message for non-streaming edit tools", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const executingReplaceTool = createMockExecutingToolInvocation(
        "copilot_replaceString",
        "Replacing 5 lines in file.ts",
        "call-3"
      );
      part.appendItem(() => {
        const div = $("div.test-item");
        div.textContent = "Replace tool";
        return { domNode: div };
      }, executingReplaceTool.toolId, executingReplaceTool);
      const button = part.domNode.querySelector(".chat-used-context-label .monaco-button");
      assert.ok(button, "Should have collapse button");
      const labelText = button.querySelector(".icon-label")?.textContent ?? button.textContent ?? "";
      assert.ok(labelText.includes("Replacing 5 lines in file.ts"), `Title should contain "Replacing 5 lines in file.ts" but got "${labelText}"`);
    });
    test("should keep original message for create_file tool even when streaming", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const streamingCreateTool = createMockStreamingToolInvocation(
        "copilot_createFile",
        "Creating newFile.ts",
        "call-4"
      );
      part.appendItem(() => {
        const div = $("div.test-item");
        div.textContent = "Create tool";
        return { domNode: div };
      }, streamingCreateTool.toolId, streamingCreateTool);
      const button = part.domNode.querySelector(".chat-used-context-label .monaco-button");
      assert.ok(button, "Should have collapse button");
      const labelText = button.querySelector(".icon-label")?.textContent ?? button.textContent ?? "";
      assert.ok(labelText.includes("Creating newFile.ts"), `Title should contain "Creating newFile.ts" but got "${labelText}"`);
    });
    test("should show external resources for serialized image tools when initially collapsed and hide them when expanded", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const serializedImageTool = createMockSerializedImageToolInvocation(
        "chat_screenshot",
        "Captured screenshot",
        "image-call-1"
      );
      part.appendItem(() => {
        const div = $("div.test-item");
        div.textContent = "Image tool";
        return { domNode: div };
      }, serializedImageTool.toolId, serializedImageTool);
      const externalResources = part.domNode.querySelector(".chat-thinking-external-resources");
      assert.ok(externalResources, "Should render external resources container");
      assert.notStrictEqual(externalResources.style.display, "none", "Should show external resources while initially collapsed");
      const button = part.domNode.querySelector(".monaco-button");
      assert.ok(button, "Should have expand button");
      button.click();
      assert.strictEqual(externalResources.style.display, "none", "Should hide external resources when expanded");
      button.click();
      assert.notStrictEqual(externalResources.style.display, "none", "Should show external resources again after collapsing");
    });
    test("should not show external resources for terminal tools that render their own image pills", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const serializedTerminalImageTool = {
        ...createMockSerializedImageToolInvocation("run_in_terminal", "Ran command", "terminal-image-call-1"),
        toolSpecificData: {
          kind: "terminal",
          commandLine: { original: "download image" },
          language: "shellscript"
        }
      };
      part.appendItem(() => ({ domNode: $("div.test-terminal-tool") }), serializedTerminalImageTool.toolId, serializedTerminalImageTool);
      const externalResources = part.domNode.querySelector(".chat-thinking-external-resources");
      assert.deepStrictEqual({
        display: externalResources.style.display,
        attachmentCount: externalResources.querySelectorAll(".chat-attached-context-attachment").length
      }, {
        display: "none",
        attachmentCount: 0
      });
    });
  });
  suite("Diff aggregation in thinking header", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("should show diff stats in finalized title when onDidChangeDiff fires", () => {
      const content = createThinkingPart("**Editing files**");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const diffEmitter = store.add(new Emitter());
      part.appendItem(
        () => ({ domNode: $("div.test-edit-pill") }),
        "edit-part-1",
        void 0,
        void 0,
        diffEmitter.event
      );
      part.finalizeTitleIfDefault();
      diffEmitter.fire(createDiffData(10, 3));
      const addedEl = part.domNode.querySelector(".label-added");
      const removedEl = part.domNode.querySelector(".label-removed");
      const label = part.domNode.querySelector(".chat-used-context-label");
      const titleButton = label?.querySelector(".monaco-icon-button");
      const chevron = label?.querySelector(".chat-collapsible-hover-chevron");
      const initialExpanded = titleButton?.ariaExpanded;
      chevron?.click();
      assert.deepStrictEqual({
        added: addedEl?.textContent,
        removed: removedEl?.textContent,
        childClasses: [...label.children].map((child) => child.className),
        initialExpanded,
        expandedAfterChevronClick: titleButton?.ariaExpanded
      }, {
        added: "+10",
        removed: "-3",
        childClasses: [
          "monaco-button monaco-icon-button monaco-text-button chat-thinking-title-with-diff",
          "monaco-button chat-thinking-title-diff",
          "chat-collapsible-hover-chevron codicon codicon-chevron-right expanded"
        ],
        initialExpanded: "false",
        expandedAfterChevronClick: "true"
      });
    });
    test("should aggregate diffs from multiple edit parts", () => {
      const content = createThinkingPart("**Editing files**");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const diffEmitter1 = store.add(new Emitter());
      const diffEmitter2 = store.add(new Emitter());
      part.appendItem(
        () => ({ domNode: $("div.test-edit-pill-1") }),
        "edit-part-1",
        void 0,
        void 0,
        diffEmitter1.event
      );
      part.appendItem(
        () => ({ domNode: $("div.test-edit-pill-2") }),
        "edit-part-2",
        void 0,
        void 0,
        diffEmitter2.event
      );
      part.finalizeTitleIfDefault();
      diffEmitter1.fire(createDiffData(5, 2, "first.ts"));
      diffEmitter2.fire(createDiffData(8, 1, "second.ts"));
      const addedEl = part.domNode.querySelector(".label-added");
      const removedEl = part.domNode.querySelector(".label-removed");
      assert.strictEqual(addedEl?.textContent, "+13");
      assert.strictEqual(removedEl?.textContent, "-3");
    });
    test("should not show diff stats when diff parts exist but have no changes", () => {
      const content = createThinkingPart("**Editing files**");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const diffEmitter = store.add(new Emitter());
      part.appendItem(
        () => ({ domNode: $("div.test-edit-pill") }),
        "edit-part-1",
        void 0,
        void 0,
        diffEmitter.event
      );
      part.finalizeTitleIfDefault();
      diffEmitter.fire(createDiffData(0, 0));
      const addedEl = part.domNode.querySelector(".label-added");
      const removedEl = part.domNode.querySelector(".label-removed");
      assert.strictEqual(addedEl, null);
      assert.strictEqual(removedEl, null);
    });
    test("should include diff stats in aria-label", () => {
      const content = createThinkingPart("**Editing files**");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const diffEmitter = store.add(new Emitter());
      part.appendItem(
        () => ({ domNode: $("div.test-edit-pill") }),
        "edit-part-1",
        void 0,
        void 0,
        diffEmitter.event
      );
      part.finalizeTitleIfDefault();
      diffEmitter.fire(createDiffData(7, 2));
      const button = part.domNode.querySelector(".monaco-button");
      assert.ok(button?.ariaLabel?.includes("7"), "aria-label should include added count");
      assert.ok(button?.ariaLabel?.includes("2"), "aria-label should include removed count");
    });
    test("should not show diff stats when no diff events fired", () => {
      const content = createThinkingPart("**Analyzing code**");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      part.finalizeTitleIfDefault();
      const diffContainer = part.domNode.querySelector(".chat-thinking-title-diff");
      assert.strictEqual(diffContainer, null, "Should not render diff container when no diffs exist");
    });
    test("opens each file from its first original to its last modified snapshot", () => {
      let opened;
      instantiationService.stub(IEditorService, new class extends mock() {
        async openEditor(...args) {
          opened = args[0];
          return void 0;
        }
      }());
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        createThinkingPart("**Editing files**"),
        createMockRenderContext(true),
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const firstAppEdit = store.add(new Emitter());
      const utilEdit = store.add(new Emitter());
      const lastAppEdit = store.add(new Emitter());
      part.appendItem(() => ({ domNode: $("div") }), "app-edit-1", void 0, void 0, firstAppEdit.event);
      part.appendItem(() => ({ domNode: $("div") }), "util-edit", void 0, void 0, utilEdit.event);
      part.appendItem(() => ({ domNode: $("div") }), "app-edit-2", void 0, void 0, lastAppEdit.event);
      part.finalizeTitleIfDefault();
      lastAppEdit.fire(createDiffData(4, 1, "app.ts", "last"));
      utilEdit.fire(createDiffData(2, 3, "util.ts", "only"));
      firstAppEdit.fire(createDiffData(5, 0, "app.ts", "first"));
      part.domNode.querySelector(".chat-thinking-title-diff")?.click();
      assert.ok(isResourceMultiDiffEditorInput(opened));
      assert.deepStrictEqual({
        label: opened.label,
        resources: opened.resources?.map((resource) => ({
          original: resource.original.resource?.toString(),
          modified: resource.modified.resource?.toString(),
          goToFileResource: resource.goToFileResource?.toString()
        }))
      }, {
        label: "Section File Changes",
        resources: [{
          original: "file:///snapshots/first/before/app.ts",
          modified: "file:///snapshots/last/after/app.ts",
          goToFileResource: "file:///workspace/app.ts"
        }, {
          original: "file:///snapshots/only/before/util.ts",
          modified: "file:///snapshots/only/after/util.ts",
          goToFileResource: "file:///workspace/util.ts"
        }]
      });
    });
    test("removeEditPillByPartId cleans up lazy item and diff stats", () => {
      const content = createThinkingPart("**Editing files**");
      const context = createMockRenderContext(true);
      const part = store.add(instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        true
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode.remove()));
      const diffEmitter1 = store.add(new Emitter());
      const diffEmitter2 = store.add(new Emitter());
      part.appendItem(
        () => ({ domNode: $("div.test-edit-pill-1") }),
        "edit-part-1",
        void 0,
        void 0,
        diffEmitter1.event
      );
      part.appendItem(
        () => ({ domNode: $("div.test-edit-pill-2") }),
        "edit-part-2",
        void 0,
        void 0,
        diffEmitter2.event
      );
      part.finalizeTitleIfDefault();
      diffEmitter1.fire(createDiffData(5, 2, "first.ts"));
      diffEmitter2.fire(createDiffData(8, 1, "second.ts"));
      part.removeEditPillByPartId("edit-part-1");
      const addedEl = part.domNode.querySelector(".label-added");
      const removedEl = part.domNode.querySelector(".label-removed");
      assert.strictEqual(addedEl?.textContent, "+8");
      assert.strictEqual(removedEl?.textContent, "-1");
    });
  });
  suite("eagerDisposable lifecycle", () => {
    setup(() => {
      mockConfigurationService.setUserConfiguration("chat.agent.thinkingStyle", ThinkingDisplayMode.Collapsed);
    });
    test("eagerDisposable is disposed when thinking part is disposed even if factory was never called", () => {
      const content = createThinkingPart("**Working**");
      const context = createMockRenderContext(false);
      const part = instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      );
      mainWindow.document.body.appendChild(part.domNode);
      let disposed = false;
      const eagerDisposable = toDisposable(() => {
        disposed = true;
      });
      const factory = () => ({
        domNode: $("div.test-item"),
        disposable: eagerDisposable
      });
      part.appendItem(factory, "test-tool", void 0, void 0, void 0, eagerDisposable);
      assert.strictEqual(disposed, false, "Should not be disposed yet");
      part.domNode.remove();
      part.dispose();
      assert.strictEqual(disposed, true, "eagerDisposable should be disposed with the thinking part");
    });
    test("eagerDisposable is disposed when thinking part is disposed after factory was called", () => {
      const content = createThinkingPart("**Working**\nSome detailed analysis");
      const context = createMockRenderContext(false);
      const part = instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      );
      mainWindow.document.body.appendChild(part.domNode);
      let disposed = false;
      const eagerDisposable = toDisposable(() => {
        disposed = true;
      });
      const factory = () => ({
        domNode: $("div.test-item"),
        disposable: eagerDisposable
      });
      part.appendItem(factory, "test-tool", void 0, void 0, void 0, eagerDisposable);
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      assert.strictEqual(disposed, false, "Should not be disposed yet");
      part.domNode.remove();
      part.dispose();
      assert.strictEqual(disposed, true, "eagerDisposable should be disposed even after being materialized");
    });
    test("appendItem without eagerDisposable disposes factory result on thinking part disposal", () => {
      const content = createThinkingPart("**Working**\nSome detailed analysis");
      const context = createMockRenderContext(false);
      const part = instantiationService.createInstance(
        ChatThinkingContentPart,
        content,
        context,
        mockMarkdownRenderer,
        false
      );
      mainWindow.document.body.appendChild(part.domNode);
      const button = part.domNode.querySelector(".monaco-button");
      button?.click();
      let disposed = false;
      const factory = () => ({
        domNode: $("div.test-item"),
        disposable: toDisposable(() => {
          disposed = true;
        })
      });
      part.appendItem(factory, "test-tool");
      assert.strictEqual(disposed, false, "Should not be disposed yet");
      part.domNode.remove();
      part.dispose();
      assert.strictEqual(disposed, true, "Factory disposable should be disposed with thinking part");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRoaW5raW5nQ29udGVudFBhcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7ICQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgaXNSZXNvdXJjZU11bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VGhpbmtpbmdDb250ZW50UGFydCwgZ2V0VG9vbEludm9jYXRpb25JY29uLCBtYXliZVBpY2tGdW5Xb3JraW5nTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFRoaW5raW5nQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRFeHRlcm5hbEVkaXQsIElDaGF0TWFya2Rvd25Db250ZW50LCBJQ2hhdFRoaW5raW5nUGFydCwgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydERpZmZEYXRhLCBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElSZW5kZXJlZE1hcmtkb3duLCBNYXJrZG93blJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgVGhpbmtpbmdEaXNwbGF5TW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUG9vbCwgRGlmZkVkaXRvclBvb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5cbnN1aXRlKCdDaGF0VGhpbmtpbmdDb250ZW50UGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBSZXR1cm5UeXBlPHR5cGVvZiB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZT47XG5cdGxldCBtb2NrQ29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IG1vY2tNYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcjtcblx0bGV0IG1vY2tBbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZTtcblx0bGV0IG1vY2tIb3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2U7XG5cdGxldCBtb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGlzQ29tcGxldGU6IGJvb2xlYW4gPSBmYWxzZSk6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IHtcblx0XHRjb25zdCBtb2NrRWxlbWVudDogUGFydGlhbDxJQ2hhdFJlc3BvbnNlVmlld01vZGVsPiA9IHtcblx0XHRcdGlzQ29tcGxldGUsXG5cdFx0XHRpZDogJ3Rlc3QtcmVzcG9uc2UtaWQnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbjEnKSxcblx0XHRcdGdldCBtb2RlbCgpIHsgcmV0dXJuIHt9IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWxbJ21vZGVsJ107IH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IG1vY2tFbGVtZW50IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsXG5cdFx0XHRpbmxpbmVUZXh0TW9kZWxzOiB7fSBhcyBJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uLFxuXHRcdFx0ZWxlbWVudEluZGV4OiAwLFxuXHRcdFx0Y29udGFpbmVyOiBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0Y29udGVudDogW10sXG5cdFx0XHRjb250ZW50SW5kZXg6IDAsXG5cdFx0XHRlZGl0b3JQb29sOiB7fSBhcyBFZGl0b3JQb29sLFxuXHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleDogMCxcblx0XHRcdHRyZWVTdGFydEluZGV4OiAwLFxuXHRcdFx0ZGlmZkVkaXRvclBvb2w6IHt9IGFzIERpZmZFZGl0b3JQb29sLFxuXHRcdFx0Y3VycmVudFdpZHRoOiBvYnNlcnZhYmxlVmFsdWUoJ2N1cnJlbnRXaWR0aCcsIDUwMCksXG5cdFx0XHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50Lk5vbmVcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVGhpbmtpbmdQYXJ0KHZhbHVlPzogc3RyaW5nLCBpZD86IHN0cmluZyk6IElDaGF0VGhpbmtpbmdQYXJ0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3RoaW5raW5nJyxcblx0XHRcdHZhbHVlOiB2YWx1ZSA/PyAnJyxcblx0XHRcdGlkOiBpZCA/PyAndGVzdC10aGlua2luZy1pZCdcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRGlmZkRhdGEoYWRkZWQ6IG51bWJlciwgcmVtb3ZlZDogbnVtYmVyLCByZXNvdXJjZU5hbWUgPSAnZmlsZS50cycsIHZlcnNpb24gPSAnMScpOiBJQ2hhdENvbnRlbnRQYXJ0RGlmZkRhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRhZGRlZCxcblx0XHRcdHJlbW92ZWQsXG5cdFx0XHRyZXNvdXJjZXM6IFt7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkuZmlsZShgL3dvcmtzcGFjZS8ke3Jlc291cmNlTmFtZX1gKSxcblx0XHRcdFx0b3JpZ2luYWxVUkk6IFVSSS5maWxlKGAvc25hcHNob3RzLyR7dmVyc2lvbn0vYmVmb3JlLyR7cmVzb3VyY2VOYW1lfWApLFxuXHRcdFx0XHRtb2RpZmllZFVSSTogVVJJLmZpbGUoYC9zbmFwc2hvdHMvJHt2ZXJzaW9ufS9hZnRlci8ke3Jlc291cmNlTmFtZX1gKSxcblx0XHRcdH1dLFxuXHRcdH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXG5cdFx0bW9ja0NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2NrQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgbW9jayBtYXJrZG93biByZW5kZXJlclxuXHRcdG1vY2tNYXJrZG93blJlbmRlcmVyID0ge1xuXHRcdFx0cmVuZGVyOiAoX21hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIG9wdGlvbnM/OiBNYXJrZG93blJlbmRlck9wdGlvbnMsIG91dEVsZW1lbnQ/OiBIVE1MRWxlbWVudCk6IElSZW5kZXJlZE1hcmtkb3duID0+IHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IG91dEVsZW1lbnQgPz8gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHR5cGVvZiBfbWFya2Rvd24gPT09ICdzdHJpbmcnID8gX21hcmtkb3duIDogKF9tYXJrZG93bi52YWx1ZSA/PyAnJyk7XG5cdFx0XHRcdGVsZW1lbnQudGV4dENvbnRlbnQgPSBjb250ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIE1vY2sgdGhlIGFuY2hvciBzZXJ2aWNlXG5cdFx0bW9ja0FuY2hvclNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRyZWdpc3RlcjogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRsYXN0Rm9jdXNlZEFuY2hvcjogdW5kZWZpbmVkXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCBtb2NrQW5jaG9yU2VydmljZSk7XG5cblx0XHQvLyBNb2NrIGhvdmVyIHNlcnZpY2Vcblx0XHRtb2NrSG92ZXJTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c2hvd0hvdmVyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzaG93RGVsYXllZEhvdmVyOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzaG93QW5kRm9jdXNMYXN0SG92ZXI6ICgpID0+IHsgfSxcblx0XHRcdGhpZGVIb3ZlcjogKCkgPT4geyB9LFxuXHRcdFx0c2V0dXBEZWxheWVkSG92ZXI6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0c2V0dXBNYW5hZ2VkSG92ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSwgc2hvdzogKCkgPT4geyB9LCBoaWRlOiAoKSA9PiB7IH0sIHVwZGF0ZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0c2hvd01hbmFnZWRIb3ZlcjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNIb3ZlcmVkOiAoKSA9PiBmYWxzZSxcblx0XHR9IGFzIHVua25vd24gYXMgSUhvdmVyU2VydmljZTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3ZlclNlcnZpY2UsIG1vY2tIb3ZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gTW9jayBsYW5ndWFnZSBtb2RlbHMgc2VydmljZVxuXHRcdG1vY2tMYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzOiBFdmVudC5Ob25lLFxuXHRcdFx0Z2V0TGFuZ3VhZ2VNb2RlbElkczogKCkgPT4gW10sXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzZWxlY3RMYW5ndWFnZU1vZGVsczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRyZWdpc3Rlckxhbmd1YWdlTW9kZWxDaGF0OiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdHNlbmRDaGF0UmVxdWVzdDogYXN5bmMgKCkgPT4gKHsgc3RyZWFtOiAoYXN5bmMgZnVuY3Rpb24qICgpIHsgfSkoKSwgcmVzdWx0OiBQcm9taXNlLnJlc29sdmUoe30pIH0pLFxuXHRcdFx0Y29tcHV0ZVRva2VuTGVuZ3RoOiBhc3luYyAoKSA9PiAwXG5cdFx0fSBhcyB1bmtub3duIGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2U7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBtb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZSB0aGlua2luZyBwaHJhc2VzIHN1cHByZXNzZXMgZnVuIGRlZmF1bHQgcGhyYXNlcycsICgpID0+IHtcblx0XHRtb2NrQ29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdQaHJhc2VzLCB7XG5cdFx0XHRtb2RlOiAncmVwbGFjZScsXG5cdFx0XHRwaHJhc2VzOiBbJ0N1c3RvbSBwaHJhc2UnXSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXliZVBpY2tGdW5Xb3JraW5nTWVzc2FnZShtb2NrQ29uZmlndXJhdGlvblNlcnZpY2UsICgpID0+IDApLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGEgc2VhcmNoIGljb24gb25seSB3aGVuIG5vIHByb2JsZW1zIHdlcmUgZm91bmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWZlcmVuY2VOYW1lOiBnZXRUb29sSW52b2NhdGlvbkljb24oJ3Byb2JsZW1zJywgQ29kaWNvbi5lcnJvciwgJ0NoZWNrZWQgZmlsZXMsIG5vIHByb2JsZW1zIGZvdW5kJyksXG5cdFx0XHRpbnRlcm5hbFRvb2w6IGdldFRvb2xJbnZvY2F0aW9uSWNvbignZ2V0X2Vycm9ycycsIENvZGljb24uZXJyb3IsICdDaGVja2VkIGZpbGVzLCBubyBwcm9ibGVtcyBmb3VuZCcpLFxuXHRcdFx0Y29udHJpYnV0ZWRUb29sOiBnZXRUb29sSW52b2NhdGlvbkljb24oJ2NvcGlsb3RfZ2V0RXJyb3JzJywgQ29kaWNvbi5lcnJvciwgJ0NoZWNrZWQgZmlsZXMsIG5vIHByb2JsZW1zIGZvdW5kJyksXG5cdFx0XHRwcm9ibGVtc0ZvdW5kOiBnZXRUb29sSW52b2NhdGlvbkljb24oJ3Byb2JsZW1zJywgQ29kaWNvbi5lcnJvciwgJ0NoZWNrZWQgZmlsZXMsIDIgcHJvYmxlbXMgZm91bmQnKSxcblx0XHRcdHVucmVsYXRlZFRvb2w6IGdldFRvb2xJbnZvY2F0aW9uSWNvbigndGVybWluYWwnLCBDb2RpY29uLnRlcm1pbmFsLCAnTm8gcHJvYmxlbXMgZm91bmQnKSxcblx0XHR9LCB7XG5cdFx0XHRyZWZlcmVuY2VOYW1lOiBDb2RpY29uLnNlYXJjaCxcblx0XHRcdGludGVybmFsVG9vbDogQ29kaWNvbi5zZWFyY2gsXG5cdFx0XHRjb250cmlidXRlZFRvb2w6IENvZGljb24uc2VhcmNoLFxuXHRcdFx0cHJvYmxlbXNGb3VuZDogQ29kaWNvbi5lcnJvcixcblx0XHRcdHVucmVsYXRlZFRvb2w6IENvZGljb24udGVybWluYWwsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgYSBjb21tZW50IGljb24gZm9yIGNvbW1lbnQgdG9vbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZGRDb21tZW50OiBnZXRUb29sSW52b2NhdGlvbkljb24oJ2FkZENvbW1lbnQnKSxcblx0XHRcdGxpc3RDb21tZW50czogZ2V0VG9vbEludm9jYXRpb25JY29uKCdsaXN0Q29tbWVudHMnKSxcblx0XHRcdGRlbGV0ZUNvbW1lbnRzOiBnZXRUb29sSW52b2NhdGlvbkljb24oJ2RlbGV0ZUNvbW1lbnRzJyksXG5cdFx0XHRyZXNvbHZlQ29tbWVudHM6IGdldFRvb2xJbnZvY2F0aW9uSWNvbigncmVzb2x2ZUNvbW1lbnRzJyksXG5cdFx0XHR2aWV3VW5yZXZpZXdlZENvbW1lbnRzOiBnZXRUb29sSW52b2NhdGlvbkljb24oJ3ZpZXdVbnJldmlld2VkQ29tbWVudHMnKSxcblx0XHRcdHByZWZpeGVkQ29tbWVudDogZ2V0VG9vbEludm9jYXRpb25JY29uKCdtY3BfX2hvc3RfX2FkZENvbW1lbnQnKSxcblx0XHR9LCB7XG5cdFx0XHRhZGRDb21tZW50OiBDb2RpY29uLmNvbW1lbnQsXG5cdFx0XHRsaXN0Q29tbWVudHM6IENvZGljb24uY29tbWVudCxcblx0XHRcdGRlbGV0ZUNvbW1lbnRzOiBDb2RpY29uLmNvbW1lbnQsXG5cdFx0XHRyZXNvbHZlQ29tbWVudHM6IENvZGljb24uY29tbWVudCxcblx0XHRcdHZpZXdVbnJldmlld2VkQ29tbWVudHM6IENvZGljb24uY29tbWVudCxcblx0XHRcdHByZWZpeGVkQ29tbWVudDogQ29kaWNvbi5jb21tZW50LFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmFnZW50LnRoaW5raW5nU3R5bGUnLCBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3RhcnQgY29sbGFwc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipBbmFseXppbmcgY29kZSoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBhbmltYXRpb25Db250YWluZXIgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24nKTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRlbnQgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0aW9uLWlubmVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29sbGFwc2VkOiBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSxcblx0XHRcdFx0aGFzQW5pbWF0aW9uQ29udGFpbmVyOiAhIWFuaW1hdGlvbkNvbnRhaW5lcixcblx0XHRcdFx0YW5pbWF0aW9uRW5hYmxlZDogcGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGVkJyksXG5cdFx0XHRcdGNvbnRlbnRJc0luZXJ0OiBhbmltYXRpb25Db250ZW50Py5pbmVydCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRoYXNBbmltYXRpb25Db250YWluZXI6IHRydWUsXG5cdFx0XHRcdGFuaW1hdGlvbkVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNvbnRlbnRJc0luZXJ0OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGF2ZSBjaGF0LXRoaW5raW5nLWJveCBjbGFzcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqUHJvY2Vzc2luZyoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC10aGlua2luZy1ib3gnKSwgJ1Nob3VsZCBoYXZlIGNoYXQtdGhpbmtpbmctYm94IGNsYXNzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCB0aXRsZSBmcm9tIGJvbGQgbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKlJlYWRpbmcgY29uZmlndXJhdGlvbiBmaWxlcyoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdXNlZC1jb250ZXh0LWxhYmVsIC5tb25hY28tYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnU2hvdWxkIGhhdmUgY29sbGFwc2UgYnV0dG9uJyk7XG5cdFx0XHQvLyBUaGUgdGl0bGUgc2hvdWxkIGNvbnRhaW4gdGhlIGV4dHJhY3RlZCB0ZXh0XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBidXR0b24ucXVlcnlTZWxlY3RvcignLmljb24tbGFiZWwnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50Py5pbmNsdWRlcygnUmVhZGluZyBjb25maWd1cmF0aW9uIGZpbGVzJykgfHwgYnV0dG9uLnRleHRDb250ZW50Py5pbmNsdWRlcygnUmVhZGluZyBjb25maWd1cmF0aW9uIGZpbGVzJyksXG5cdFx0XHRcdCdUaXRsZSBzaG91bGQgY29udGFpbiBleHRyYWN0ZWQgdGV4dCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGF6eSByZW5kZXJpbmcgLSBzaG91bGQgbm90IHJlbmRlciBjb250ZW50IHVudGlsIGV4cGFuZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipJbml0aWFsIHRoaW5raW5nIGNvbnRlbnQqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gSW4gY29sbGFwc2VkIG1vZGUsIGNvbnRlbnQgd3JhcHBlciBzaG91bGQgbm90IGJlIGluaXRpYWxpemVkXG5cdFx0XHRjb25zdCBjb250ZW50TGlzdCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRMaXN0LCBudWxsLCAnQ29udGVudCBzaG91bGQgbm90IGJlIHJlbmRlcmVkIHdoZW4gY29sbGFwc2VkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXp5IHJlbmRlcmluZyAtIHNob3VsZCByZW5kZXIgY29udGVudCB3aGVuIGV4cGFuZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipUaGlua2luZyBjb250ZW50IHRvIHJlbmRlcioqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBDbGljayB0aGUgYnV0dG9uIHRvIGV4cGFuZFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnU2hvdWxkIGhhdmUgZXhwYW5kIGJ1dHRvbicpO1xuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdC8vIE5vdyBjb250ZW50IHNob3VsZCBiZSByZW5kZXJlZFxuXHRcdFx0Y29uc3QgY29udGVudExpc3QgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdXNlZC1jb250ZXh0LWxpc3QnKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50TGlzdCwgJ0NvbnRlbnQgc2hvdWxkIGJlIHJlbmRlcmVkIGFmdGVyIGV4cGFuZGluZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlciB0b2dnbGUgZXZlbnQgYnViYmxlcyBiZWZvcmUgZXhwYW5zaW9uIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKlRoaW5raW5nIGNvbnRlbnQgdG8gcmVuZGVyKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IGFuY2VzdG9yID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGFuY2VzdG9yLmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYW5jZXN0b3IpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhbmNlc3Rvci5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uKTtcblx0XHRcdGxldCB0b2dnbGVDb3VudCA9IDA7XG5cdFx0XHRsZXQgZXhwYW5kZWREdXJpbmdUb2dnbGU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdFx0dG9nZ2xlQ291bnQrKztcblx0XHRcdFx0ZXhwYW5kZWREdXJpbmdUb2dnbGUgPSBidXR0b24uYXJpYUV4cGFuZGVkO1xuXHRcdFx0fTtcblx0XHRcdGFuY2VzdG9yLmFkZEV2ZW50TGlzdGVuZXIoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCBsaXN0ZW5lcik7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFuY2VzdG9yLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCBsaXN0ZW5lcikpKTtcblxuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0b2dnbGVDb3VudCxcblx0XHRcdFx0ZXhwYW5kZWREdXJpbmdUb2dnbGUsXG5cdFx0XHRcdGV4cGFuZGVkQWZ0ZXJUb2dnbGU6IGJ1dHRvbi5hcmlhRXhwYW5kZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRvZ2dsZUNvdW50OiAxLFxuXHRcdFx0XHRleHBhbmRlZER1cmluZ1RvZ2dsZTogJ2ZhbHNlJyxcblx0XHRcdFx0ZXhwYW5kZWRBZnRlclRvZ2dsZTogJ3RydWUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZFByZXZpZXcnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmFnZW50LnRoaW5raW5nU3R5bGUnLCBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZFByZXZpZXcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0YXJ0IGV4cGFuZGVkIHdoZW4gc3RyZWFtaW5nIChub3QgY29tcGxldGUpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipBbmFseXppbmcqKlxcblNvbWUgZGV0YWlsZWQgcmVhc29uaW5nIGFib3V0IHRoZSBjb2RlIHN0cnVjdHVyZScpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gSW4gQ29sbGFwc2VkUHJldmlldyBtb2RlLCBzaG91bGQgYmUgZXhwYW5kZWQgd2hpbGUgc3RyZWFtaW5nXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIGJlIGV4cGFuZGVkIGR1cmluZyBzdHJlYW1pbmcgaW4gQ29sbGFwc2VkUHJldmlldyBtb2RlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYmUgY29sbGFwc2VkIHdoZW4gY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKkNvbXBsZXRlZCB0YXNrKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTsgLy8gaXNDb21wbGV0ZSA9IHRydWVcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHR0cnVlIC8vIHN0cmVhbWluZ0NvbXBsZXRlZFxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gV2hlbiBjb21wbGV0ZSwgc2hvdWxkIGJlIGNvbGxhcHNlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCB0cnVlLFxuXHRcdFx0XHQnU2hvdWxkIGJlIGNvbGxhcHNlZCB3aGVuIGNvbXBsZXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYmUgY29sbGFwc2VkIHdoZW4gc3RyZWFtaW5nQ29tcGxldGVkIGlzIHRydWUgZXZlbiBpZiBlbGVtZW50LmlzQ29tcGxldGUgaXMgZmFsc2UgKGxvb2stYWhlYWQgY29tcGxldGlvbiknLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHRlc3RzIHRoZSBzY2VuYXJpbyB3aGVyZSB3ZSBrbm93IHRoZSB0aGlua2luZyBwYXJ0IGlzIGNvbXBsZXRlXG5cdFx0XHQvLyBiYXNlZCBvbiBsb29rLWFoZWFkIChzdWJzZXF1ZW50IG5vbi1waW5uYWJsZSBwYXJ0cyBleGlzdCksIGJ1dCB0aGVcblx0XHRcdC8vIG92ZXJhbGwgcmVzcG9uc2UgaXMgc3RpbGwgaW4gcHJvZ3Jlc3Ncblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqRmluaXNoZWQgYW5hbHl6aW5nKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7IC8vIGVsZW1lbnQuaXNDb21wbGV0ZSA9IGZhbHNlXG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0dHJ1ZSAvLyBzdHJlYW1pbmdDb21wbGV0ZWQgPSB0cnVlIChsb29rLWFoZWFkIGRldGVjdGVkIHRoaXMgdGhpbmtpbmcgaXMgZG9uZSlcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdC8vIEV2ZW4gdGhvdWdoIGVsZW1lbnQuaXNDb21wbGV0ZSBpcyBmYWxzZSwgdGhpcyB0aGlua2luZyBwYXJ0IHNob3VsZCBiZVxuXHRcdFx0Ly8gY29sbGFwc2VkIGJlY2F1c2Ugc3RyZWFtaW5nQ29tcGxldGVkIGlzIHRydWUgKGRldGVybWluZWQgYnkgbG9vay1haGVhZClcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgdHJ1ZSxcblx0XHRcdFx0J1Nob3VsZCBiZSBjb2xsYXBzZWQgd2hlbiBzdHJlYW1pbmdDb21wbGV0ZWQgaXMgdHJ1ZSwgZXZlbiBpZiBlbGVtZW50LmlzQ29tcGxldGUgaXMgZmFsc2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgbGF6eSByZW5kZXJpbmcgd2hlbiBzdHJlYW1pbmdDb21wbGV0ZWQgaXMgdHJ1ZSBldmVuIGlmIGVsZW1lbnQuaXNDb21wbGV0ZSBpcyBmYWxzZScsICgpID0+IHtcblx0XHRcdC8vIFZlcmlmeSBsYXp5IHJlbmRlcmluZyBpcyB0cmlnZ2VyZWQgd2hlbiBzdHJlYW1pbmdDb21wbGV0ZWQ9dHJ1ZSBhbmQgZWxlbWVudC5pc0NvbXBsZXRlPWZhbHNlXG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKkxvb2tpbmcgYWhlYWQgY29tcGxldGVkKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7IC8vIGVsZW1lbnQuaXNDb21wbGV0ZSA9IGZhbHNlXG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0dHJ1ZSAvLyBzdHJlYW1pbmdDb21wbGV0ZWQgPSB0cnVlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBDb250ZW50IHNob3VsZCBub3QgYmUgcmVuZGVyZWQgYmVjYXVzZSBpdCdzIGNvbGxhcHNlZCAobGF6eSByZW5kZXJpbmcpXG5cdFx0XHRjb25zdCBjb250ZW50TGlzdCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRMaXN0LCBudWxsLCAnQ29udGVudCBzaG91bGQgbm90IGJlIHJlbmRlcmVkIHdoZW4gc3RyZWFtaW5nQ29tcGxldGVkPXRydWUgKGNvbGxhcHNlZCA9IGxhenkpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUaGlua2luZ0Rpc3BsYXlNb2RlLkZpeGVkU2Nyb2xsaW5nJywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5hZ2VudC50aGlua2luZ1N0eWxlJywgVGhpbmtpbmdEaXNwbGF5TW9kZS5GaXhlZFNjcm9sbGluZyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGF2ZSBmaXhlZCBtb2RlIGNsYXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipTY3JvbGxpbmcgY29udGVudCoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC10aGlua2luZy1maXhlZC1tb2RlJyksXG5cdFx0XHRcdCdTaG91bGQgaGF2ZSBmaXhlZCBtb2RlIGNsYXNzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0aW9uJyksIG51bGwsXG5cdFx0XHRcdCdGaXhlZCBzY3JvbGxpbmcgbW9kZSBzaG91bGQgbm90IGFuaW1hdGUgaXRzIGNvbnRlbnQgY29udGFpbmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5pdCBjb250ZW50IGVhcmx5IChlYWdlciByZW5kZXJpbmcpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipGaXhlZCBzY3JvbGxpbmcgY29udGVudCoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBGaXhlZCBtb2RlIHNob3VsZCBpbml0aWFsaXplIGNvbnRlbnQgaW1tZWRpYXRlbHkgKGVhZ2VyIHJlbmRlcmluZylcblx0XHRcdC8vIFRoZSBzY3JvbGxhYmxlIGVsZW1lbnQgc2hvdWxkIGJlIHByZXNlbnRcblx0XHRcdGNvbnN0IHNjcm9sbGFibGVDb250ZW50ID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soc2Nyb2xsYWJsZUNvbnRlbnQsICdTaG91bGQgaGF2ZSBzY3JvbGxhYmxlIGVsZW1lbnQgaW4gZml4ZWQgbW9kZSAoZWFnZXIgcmVuZGVyaW5nKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNyZWF0ZSBzY3JvbGxhYmxlIGNvbnRhaW5lcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqQ29udGVudCB3aXRoIHNjcm9sbGluZyoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBzY3JvbGxhYmxlID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soc2Nyb2xsYWJsZSwgJ1Nob3VsZCBoYXZlIHNjcm9sbGFibGUgY29udGFpbmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29sbGFwc2Ugd2l0aG91dCBhbmltYXRpb24gd2hlbiBzdHJlYW1pbmcgY29tcGxldGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipDb250ZW50IHdpdGggc2Nyb2xsaW5nKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRvb2wgPSAkKCdkaXYudGVzdC1jb21wbGV0ZWQtdG9vbCcpO1xuXHRcdFx0XHR0b29sLnRleHRDb250ZW50ID0gJ0NvbXBsZXRlZCB0b29sJztcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogdG9vbCB9O1xuXHRcdFx0fSwgJ3Rlc3QtdG9vbCcpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50TGlzdCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtdGhpbmtpbmctY29sbGFwc2libGUnKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50TGlzdCk7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoY29udGVudExpc3QsICdzY3JvbGxIZWlnaHQnLCB7IGNvbmZpZ3VyYWJsZTogdHJ1ZSwgdmFsdWU6IDQwMCB9KTtcblxuXHRcdFx0cGFydC5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uKTtcblx0XHRcdGNvbnN0IHNjcm9sbGFibGUgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50Jyk7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRIZWlnaHQgPSBzY3JvbGxhYmxlPy5zdHlsZS5tYXhIZWlnaHQ7XG5cdFx0XHRjb25zdCBjb21wbGV0aW9uQW5pbWF0aW9uRW5hYmxlZCA9IHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdGhpbmtpbmctZml4ZWQtbW9kZS1hbmltYXRlZCcpO1xuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IG1haW5XaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpO1xuXG5cdFx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuc2Nyb2xsYmFyLnZlcnRpY2FsJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29tcGxldGVkSGVpZ2h0LFxuXHRcdFx0XHRjb21wbGV0aW9uQW5pbWF0aW9uRW5hYmxlZCxcblx0XHRcdFx0dXNlckFuaW1hdGlvbkVuYWJsZWQ6IHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdGhpbmtpbmctZml4ZWQtbW9kZS1hbmltYXRlZCcpLFxuXHRcdFx0XHRleHBhbmRlZEhlaWdodDogc2Nyb2xsYWJsZT8uc3R5bGUubWF4SGVpZ2h0LFxuXHRcdFx0XHRzY3JvbGxiYXJJc0ludmlzaWJsZTogdmVydGljYWxTY3JvbGxiYXI/LmNsYXNzTGlzdC5jb250YWlucygnaW52aXNpYmxlJyksXG5cdFx0XHRcdHRvb2xJc1Zpc2libGU6ICEhcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy50ZXN0LWNvbXBsZXRlZC10b29sJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbXBsZXRlZEhlaWdodDogJzBweCcsXG5cdFx0XHRcdGNvbXBsZXRpb25BbmltYXRpb25FbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0dXNlckFuaW1hdGlvbkVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGV4cGFuZGVkSGVpZ2h0OiAnNDAwcHgnLFxuXHRcdFx0XHRzY3JvbGxiYXJJc0ludmlzaWJsZTogdHJ1ZSxcblx0XHRcdFx0dG9vbElzVmlzaWJsZTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFuaW1hdGUgdGhlIGZpcnN0IGV4cGFuc2lvbiBhbmQgc3Vic2VxdWVudCBjb2xsYXBzZSBvZiByZXN0b3JlZCBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipSZXN0b3JlZCBjb250ZW50KionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdHRydWVcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0b29sID0gJCgnZGl2LnRlc3QtcmVzdG9yZWQtdG9vbCcpO1xuXHRcdFx0XHR0b29sLnRleHRDb250ZW50ID0gJ1Jlc3RvcmVkIHRvb2wnO1xuXHRcdFx0XHRyZXR1cm4geyBkb21Ob2RlOiB0b29sIH07XG5cdFx0XHR9LCAncmVzdG9yZWQtdG9vbCcpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uKTtcblx0XHRcdGJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50TGlzdCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtdGhpbmtpbmctY29sbGFwc2libGUnKTtcblx0XHRcdGNvbnN0IHNjcm9sbGFibGUgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soY29udGVudExpc3QpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNjcm9sbGFibGUpO1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGNvbnRlbnRMaXN0LCAnc2Nyb2xsSGVpZ2h0JywgeyBjb25maWd1cmFibGU6IHRydWUsIHZhbHVlOiA0MDAgfSk7XG5cdFx0XHRjb25zdCBpbml0aWFsRXhwYW5kZWRIZWlnaHQgPSBzY3JvbGxhYmxlLnN0eWxlLm1heEhlaWdodDtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IG1haW5XaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpO1xuXHRcdFx0Y29uc3QgZXhwYW5kZWRIZWlnaHQgPSBzY3JvbGxhYmxlLnN0eWxlLm1heEhlaWdodDtcblxuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpbml0aWFsRXhwYW5kZWRIZWlnaHQsXG5cdFx0XHRcdGV4cGFuZGVkSGVpZ2h0LFxuXHRcdFx0XHRjb2xsYXBzZWRIZWlnaHQ6IHNjcm9sbGFibGUuc3R5bGUubWF4SGVpZ2h0LFxuXHRcdFx0XHRjb2xsYXBzZWRJbmVydDogc2Nyb2xsYWJsZS5pbmVydCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aW5pdGlhbEV4cGFuZGVkSGVpZ2h0OiAnMHB4Jyxcblx0XHRcdFx0ZXhwYW5kZWRIZWlnaHQ6ICc0MDBweCcsXG5cdFx0XHRcdGNvbGxhcHNlZEhlaWdodDogJzBweCcsXG5cdFx0XHRcdGNvbGxhcHNlZEluZXJ0OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUaGlua2luZyBjb250ZW50IHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmFnZW50LnRoaW5raW5nU3R5bGUnLCBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVUaGlua2luZyBzaG91bGQgdXBkYXRlIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKkluaXRpYWwqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gRmlyc3QgZXhwYW5kIHRvIHJlbmRlciBjb250ZW50XG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24nKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGJ1dHRvbj8uY2xpY2soKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHRoZSB0aGlua2luZyBjb250ZW50XG5cdFx0XHRjb25zdCB1cGRhdGVkQ29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipVcGRhdGVkIHRoaW5raW5nKionLCBjb250ZW50LmlkKTtcblx0XHRcdHBhcnQudXBkYXRlVGhpbmtpbmcodXBkYXRlZENvbnRlbnQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIGNvbnRlbnQgd2FzIHVwZGF0ZWRcblx0XHRcdGNvbnN0IHRoaW5raW5nSXRlbSA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC10aGlua2luZy1pdGVtJyk7XG5cdFx0XHRhc3NlcnQub2sodGhpbmtpbmdJdGVtLCAnU2hvdWxkIGhhdmUgdGhpbmtpbmcgaXRlbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRyYWNrIG11bHRpcGxlIHRpdGxlIGV4dHJhY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipGaXJzdCB0aXRsZSoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBFeHBhbmQgZmlyc3Rcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXG5cdFx0XHQvLyBVcGRhdGUgd2l0aCBuZXcgdGl0bGVcblx0XHRcdHBhcnQudXBkYXRlVGhpbmtpbmcoY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKlNlY29uZCB0aXRsZSoqJywgY29udGVudC5pZCkpO1xuXHRcdFx0cGFydC51cGRhdGVUaGlua2luZyhjcmVhdGVUaGlua2luZ1BhcnQoJyoqVGhpcmQgdGl0bGUqKicsIGNvbnRlbnQuaWQpKTtcblxuXHRcdFx0Ly8gVGhlIHBhcnQgc2hvdWxkIHRyYWNrIHRoZXNlIHRpdGxlcyBmb3IgZmluYWxpemF0aW9uXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLCAnUGFydCBzaG91bGQgc3RpbGwgYmUgdmFsaWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXN0b3JlIHRoZSBkZXNjcmlwdGl2ZSB0aXRsZSBhZnRlciBleHBhbmQgYW5kIGNvbGxhcHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipSZWFkIGNoYXRMaXN0UmVuZGVyZXIudHMsIGxpbmVzIDIyMzAgdG8gMjI3MCoqXFxuSW5zcGVjdCBncm91cGluZyBsb2dpYycpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uKTtcblxuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRwYXJ0LnVwZGF0ZVRoaW5raW5nKGNyZWF0ZVRoaW5raW5nUGFydCgnKipSZWFkKipcXG5JbnNwZWN0IGdyb3VwaW5nIGxvZ2ljJywgY29udGVudC5pZCkpO1xuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidXR0b24udGV4dENvbnRlbnQsICdUaGlua2luZzogUmVhZCBjaGF0TGlzdFJlbmRlcmVyLnRzLCBsaW5lcyAyMjMwIHRvIDIyNzAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1RoaW5raW5nIGdyb3VwIGlkZW50aXR5JywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5hZ2VudC50aGlua2luZ1N0eWxlJywgVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzdGluZ3Vpc2hlcyByZWFzb25pbmcgZnJvbSBncm91cGVkIHRvb2wgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjcmVhdGVUaGlua2luZ1BhcnQoJyoqUmV2aWV3ZWQgdGhlIGltcGxlbWVudGF0aW9uKionKSxcblx0XHRcdFx0Y3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpLFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aGFzUmVhc29uaW5nOiBwYXJ0Lmhhc1JlYXNvbmluZ0NvbnRlbnQoKSxcblx0XHRcdFx0aGFzR3JvdXBlZEl0ZW1zOiBwYXJ0Lmhhc0dyb3VwZWRJdGVtcygpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRoYXNSZWFzb25pbmc6IHRydWUsXG5cdFx0XHRcdGhhc0dyb3VwZWRJdGVtczogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+ICh7IGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LXRvb2wtaXRlbScpIH0pLCAndGVzdC10b29sJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmhhc0dyb3VwZWRJdGVtcygpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgZWxhcHNlZCB0aW1lIHRvIGZpbmFsaXplZCByZWFzb25pbmctb25seSBoZWFkZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipSZXZpZXdlZCB0aGUgaW1wbGVtZW50YXRpb24qKicpO1xuXHRcdFx0Y29udGVudC5yZWFzb25pbmdEdXJhdGlvbk1zID0gMTIwMDtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblx0XHRcdHBhcnQuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcubW9uYWNvLWJ1dHRvbicpO1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Z2VuZXJhdGVkVGl0bGU6IGNvbnRlbnQuZ2VuZXJhdGVkVGl0bGUsXG5cdFx0XHRcdGxhYmVsSGFzRHVyYXRpb246IC9eUmV2aWV3ZWQgdGhlIGltcGxlbWVudGF0aW9uIC0gXFxkK3MkLy50ZXN0KHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWJ1dHRvbicpPy50ZXh0Q29udGVudCA/PyAnJyksXG5cdFx0XHRcdGFyaWFMYWJlbEhhc0R1cmF0aW9uOiAvXlJldmlld2VkIHRoZSBpbXBsZW1lbnRhdGlvbiAtIFxcZCtzJC8udGVzdChidXR0b24/LmFyaWFMYWJlbCA/PyAnJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGdlbmVyYXRlZFRpdGxlOiAnUmV2aWV3ZWQgdGhlIGltcGxlbWVudGF0aW9uJyxcblx0XHRcdFx0bGFiZWxIYXNEdXJhdGlvbjogdHJ1ZSxcblx0XHRcdFx0YXJpYUxhYmVsSGFzRHVyYXRpb246IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIHRoZSBwZXJzaXN0ZWQgZHVyYXRpb24gd2hlbiByZWFzb25pbmcgY29udGVudCBpcyByZWh5ZHJhdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipSZXZpZXdlZCB0aGUgaW1wbGVtZW50YXRpb24qKicpO1xuXHRcdFx0Y29udGVudC5yZWFzb25pbmdEdXJhdGlvbk1zID0gMjMwMDtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXHRcdFx0cGFydC5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24nKT8udGV4dENvbnRlbnQsICdSZXZpZXdlZCB0aGUgaW1wbGVtZW50YXRpb24gLSAzcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgc2hvdyB6ZXJvIG9yIHVua25vd24gcmVhc29uaW5nIGR1cmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGVzID0gW3VuZGVmaW5lZCwgMF0ubWFwKHJlYXNvbmluZ0R1cmF0aW9uTXMgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKlJldmlld2VkIHRoZSBpbXBsZW1lbnRhdGlvbioqJyk7XG5cdFx0XHRcdGNvbnRlbnQucmVhc29uaW5nRHVyYXRpb25NcyA9IHJlYXNvbmluZ0R1cmF0aW9uTXM7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHRjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSksXG5cdFx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdFx0dHJ1ZVxuXHRcdFx0XHQpKTtcblx0XHRcdFx0cGFydC5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybiBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24nKT8udGV4dENvbnRlbnQ7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aXRsZXMsIFsnUmV2aWV3ZWQgdGhlIGltcGxlbWVudGF0aW9uJywgJ1Jldmlld2VkIHRoZSBpbXBsZW1lbnRhdGlvbiddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Rvb2wgaW52b2NhdGlvbiBhcHBlbmRpbmcnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmFnZW50LnRoaW5raW5nU3R5bGUnLCBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBlbmRJdGVtIHNob3VsZCB1c2UgbGF6eSByZW5kZXJpbmcgd2hlbiBjb2xsYXBzZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0bGV0IGZhY3RvcnlDYWxsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGZhY3RvcnkgPSAoKSA9PiB7XG5cdFx0XHRcdGZhY3RvcnlDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LXRvb2wtaXRlbScpLFxuXHRcdFx0XHRcdGRpc3Bvc2FibGU6IHVuZGVmaW5lZFxuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQXBwZW5kIGl0ZW0gd2hpbGUgY29sbGFwc2VkXG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oZmFjdG9yeSwgJ3Rlc3QtdG9vbC1pZCcpO1xuXG5cdFx0XHQvLyBGYWN0b3J5IHNob3VsZCBOT1QgYmUgY2FsbGVkIHlldCBkdWUgdG8gbGF6eSByZW5kZXJpbmdcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWN0b3J5Q2FsbGVkLCBmYWxzZSwgJ0ZhY3Rvcnkgc2hvdWxkIG5vdCBiZSBjYWxsZWQgd2hlbiBjb2xsYXBzZWQgKGxhenkgcmVuZGVyaW5nKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwZW5kSXRlbSBzaG91bGQgcmVuZGVyIGltbWVkaWF0ZWx5IHdoZW4gZXhwYW5kZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKlxcblNvbWUgZGV0YWlsZWQgYW5hbHlzaXMgb2YgdGhlIHByb2JsZW0nKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdC8vIEV4cGFuZCBmaXJzdFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdGxldCBmYWN0b3J5Q2FsbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gKCkgPT4ge1xuXHRcdFx0XHRmYWN0b3J5Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2LnRlc3QtdG9vbC1pdGVtJyk7XG5cdFx0XHRcdGRpdi50ZXh0Q29udGVudCA9ICdUZXN0IHRvb2wgY29udGVudCc7XG5cdFx0XHRcdHJldHVybiB7IGRvbU5vZGU6IGRpdiB9O1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQXBwZW5kIGl0ZW0gd2hpbGUgZXhwYW5kZWRcblx0XHRcdHBhcnQuYXBwZW5kSXRlbShmYWN0b3J5LCAndGVzdC10b29sLWlkJyk7XG5cblx0XHRcdC8vIEZhY3Rvcnkgc2hvdWxkIGJlIGNhbGxlZCBpbW1lZGlhdGVseSB3aGVuIGV4cGFuZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFjdG9yeUNhbGxlZCwgdHJ1ZSwgJ0ZhY3Rvcnkgc2hvdWxkIGJlIGNhbGxlZCBpbW1lZGlhdGVseSB3aGVuIGV4cGFuZGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXp5IGl0ZW1zIHNob3VsZCBtYXRlcmlhbGl6ZSB3aGVuIGZpcnN0IGV4cGFuZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipXb3JraW5nKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdGxldCBmYWN0b3J5Q2FsbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gKCkgPT4ge1xuXHRcdFx0XHRmYWN0b3J5Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2LnRlc3QtdG9vbC1pdGVtJyk7XG5cdFx0XHRcdGRpdi50ZXh0Q29udGVudCA9ICdMYXp5IGNvbnRlbnQnO1xuXHRcdFx0XHRyZXR1cm4geyBkb21Ob2RlOiBkaXYgfTtcblx0XHRcdH07XG5cblx0XHRcdC8vIEFwcGVuZCBpdGVtIHdoaWxlIGNvbGxhcHNlZFxuXHRcdFx0cGFydC5hcHBlbmRJdGVtKGZhY3RvcnksICd0ZXN0LXRvb2wtaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWN0b3J5Q2FsbGVkLCBmYWxzZSwgJ0ZhY3Rvcnkgc2hvdWxkIG5vdCBiZSBjYWxsZWQgeWV0Jyk7XG5cblx0XHRcdC8vIE5vdyBleHBhbmRcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXG5cdFx0XHQvLyBGYWN0b3J5IHNob3VsZCBub3cgYmUgY2FsbGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFjdG9yeUNhbGxlZCwgdHJ1ZSwgJ0ZhY3Rvcnkgc2hvdWxkIGJlIGNhbGxlZCBhZnRlciBleHBhbmRpbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZUxhenlJdGVtIHNob3VsZCByZW1vdmUgcGVuZGluZyBsYXp5IGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipXb3JraW5nKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdGxldCBmYWN0b3J5Q2FsbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gKCkgPT4ge1xuXHRcdFx0XHRmYWN0b3J5Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogJCgnZGl2LnRlc3QtdG9vbC1pdGVtJykgfTtcblx0XHRcdH07XG5cblx0XHRcdC8vIEFwcGVuZCBhbmQgdGhlbiByZW1vdmVcblx0XHRcdHBhcnQuYXBwZW5kSXRlbShmYWN0b3J5LCAndGVzdC10b29sLXRvLXJlbW92ZScpO1xuXHRcdFx0Y29uc3QgcmVtb3ZlZCA9IHBhcnQucmVtb3ZlTGF6eUl0ZW0oJ3Rlc3QtdG9vbC10by1yZW1vdmUnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZWQsIHRydWUsICdTaG91bGQgc3VjY2Vzc2Z1bGx5IHJlbW92ZSB0aGUgbGF6eSBpdGVtJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFjdG9yeUNhbGxlZCwgZmFsc2UsICdGYWN0b3J5IHNob3VsZCBuZXZlciBoYXZlIGJlZW4gY2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXp5IGl0ZW1zIHNob3VsZCBwcmVzZXJ2ZSBhcHBlbmQgb3JkZXIgd2hlbiBtaXhpbmcgdG9vbCBhbmQgbWFya2Rvd24gaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHRlc3QgdmVyaWZpZXMgdGhhdCB3aGVuIHRvb2wgaW52b2NhdGlvbnMgYW5kIG1hcmtkb3duIGl0ZW1zIGFyZSBhcHBlbmRlZFxuXHRcdFx0Ly8gaW4gYSBzcGVjaWZpYyBvcmRlciB3aGlsZSBjb2xsYXBzZWQsIHRoZSBET00gb3JkZXIgbWF0Y2hlcyB0aGUgYXBwZW5kIG9yZGVyXG5cdFx0XHQvLyB3aGVuIGV4cGFuZGVkLiBUaGlzIGNhdGNoZXMgdGhlIGJ1ZyB3aGVyZSBtYXJrZG93biBpdGVtcyByZW5kZXIgYmVmb3JlXG5cdFx0XHQvLyB0b29sIGl0ZW1zIGJlY2F1c2UgbWFya2Rvd24gaXNuJ3QgbGF6eS5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqV29ya2luZyoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBhcHBlbmRPcmRlcjogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Ly8gQXBwZW5kIGluIG9yZGVyOiB0b29sMSwgbWFya2Rvd24sIHRvb2wyXG5cdFx0XHQvLyBUb29sIDFcblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdGFwcGVuZE9yZGVyLnB1c2goJ3Rvb2wxJyk7XG5cdFx0XHRcdGNvbnN0IGRpdiA9ICQoJ2Rpdi50ZXN0LWl0ZW0nKTtcblx0XHRcdFx0ZGl2LnNldEF0dHJpYnV0ZSgnZGF0YS1vcmRlcicsICd0b29sMScpO1xuXHRcdFx0XHRkaXYudGV4dENvbnRlbnQgPSAnVG9vbCAxJztcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogZGl2IH07XG5cdFx0XHR9LCAndG9vbC0xJyk7XG5cblx0XHRcdC8vIE1hcmtkb3duIGNvbnRlbnQgKHNpbXVsYXRlZCAtIG5vIHRvb2xJbnZvY2F0aW9uSWQgbWVhbnMgaXQncyBtYXJrZG93bi1saWtlKVxuXHRcdFx0Y29uc3QgbWFya2Rvd25JdGVtOiBJQ2hhdE1hcmtkb3duQ29udGVudCA9IHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IHsgdmFsdWU6ICd0ZXN0IG1hcmtkb3duJyB9XG5cdFx0XHR9O1xuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+IHtcblx0XHRcdFx0YXBwZW5kT3JkZXIucHVzaCgnbWFya2Rvd24nKTtcblx0XHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2LnRlc3QtaXRlbScpO1xuXHRcdFx0XHRkaXYuc2V0QXR0cmlidXRlKCdkYXRhLW9yZGVyJywgJ21hcmtkb3duJyk7XG5cdFx0XHRcdGRpdi50ZXh0Q29udGVudCA9ICdNYXJrZG93biBjb250ZW50Jztcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogZGl2IH07XG5cdFx0XHR9LCB1bmRlZmluZWQsIG1hcmtkb3duSXRlbSk7XG5cblx0XHRcdC8vIFRvb2wgMlxuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+IHtcblx0XHRcdFx0YXBwZW5kT3JkZXIucHVzaCgndG9vbDInKTtcblx0XHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2LnRlc3QtaXRlbScpO1xuXHRcdFx0XHRkaXYuc2V0QXR0cmlidXRlKCdkYXRhLW9yZGVyJywgJ3Rvb2wyJyk7XG5cdFx0XHRcdGRpdi50ZXh0Q29udGVudCA9ICdUb29sIDInO1xuXHRcdFx0XHRyZXR1cm4geyBkb21Ob2RlOiBkaXYgfTtcblx0XHRcdH0sICd0b29sLTInKTtcblxuXHRcdFx0Ly8gTm90aGluZyBzaG91bGQgaGF2ZSByZW5kZXJlZCB5ZXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRPcmRlci5sZW5ndGgsIDAsICdObyBpdGVtcyBzaG91bGQgYmUgcmVuZGVyZWQgd2hpbGUgY29sbGFwc2VkJyk7XG5cblx0XHRcdC8vIE5vdyBleHBhbmQgdG8gdHJpZ2dlciBsYXp5IHJlbmRlcmluZ1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdC8vIEFsbCBpdGVtcyBzaG91bGQgbm93IGJlIHJlbmRlcmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kT3JkZXIubGVuZ3RoLCAzLCAnQWxsIDMgaXRlbXMgc2hvdWxkIGJlIHJlbmRlcmVkIGFmdGVyIGV4cGFuZGluZycpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIHJlbmRlciBvcmRlciBtYXRjaGVzIGFwcGVuZCBvcmRlclxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBlbmRPcmRlciwgWyd0b29sMScsICdtYXJrZG93bicsICd0b29sMiddLFxuXHRcdFx0XHQnSXRlbXMgc2hvdWxkIHJlbmRlciBpbiB0aGUgc2FtZSBvcmRlciB0aGV5IHdlcmUgYXBwZW5kZWQgKHRvb2wxLCBtYXJrZG93biwgdG9vbDIpJyk7XG5cblx0XHRcdC8vIEFsc28gdmVyaWZ5IHRoZSBET00gb3JkZXJcblx0XHRcdGNvbnN0IHdyYXBwZXIgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdXNlZC1jb250ZXh0LWxpc3QnKTtcblx0XHRcdGNvbnN0IHRvb2xXcmFwcGVycyA9IHdyYXBwZXI/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXRoaW5raW5nLXRvb2wtd3JhcHBlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xXcmFwcGVycywgJ1Nob3VsZCBoYXZlIHRvb2wgd3JhcHBlcnMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sV3JhcHBlcnM/Lmxlbmd0aCwgMywgJ1Nob3VsZCBoYXZlIDMgdG9vbCB3cmFwcGVycycpO1xuXG5cdFx0XHRjb25zdCBkb21PcmRlciA9IEFycmF5LmZyb20odG9vbFdyYXBwZXJzISkubWFwKGVsID0+IHtcblx0XHRcdFx0Y29uc3QgdGVzdEl0ZW0gPSBlbC5xdWVyeVNlbGVjdG9yKCcudGVzdC1pdGVtJyk7XG5cdFx0XHRcdHJldHVybiB0ZXN0SXRlbT8uZ2V0QXR0cmlidXRlKCdkYXRhLW9yZGVyJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkb21PcmRlciwgWyd0b29sMScsICdtYXJrZG93bicsICd0b29sMiddLFxuXHRcdFx0XHQnRE9NIG9yZGVyIHNob3VsZCBtYXRjaCBhcHBlbmQgb3JkZXIgKHRvb2wxLCBtYXJrZG93biwgdG9vbDIpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXR1cFRoaW5raW5nQ29udGFpbmVyIHNob3VsZCBwcmVzZXJ2ZSBvcmRlciB3aXRoIGxhenkgdG9vbCBpdGVtcycsICgpID0+IHtcblx0XHRcdC8vIFRoaXMgdGVzdCByZXByb2R1Y2VzIHRoZSBidWcgd2hlcmUgbWFya2Rvd24gcGFydHMgYWRkZWQgdmlhIHNldHVwVGhpbmtpbmdDb250YWluZXJcblx0XHRcdC8vIHJlbmRlciBiZWZvcmUgdG9vbCBwYXJ0cyBiZWNhdXNlIHNldHVwVGhpbmtpbmdDb250YWluZXIgZG9lc24ndCB1c2UgbGF6eSByZW5kZXJpbmcuXG5cdFx0XHQvLyBFeHBlY3RlZCBiZWhhdmlvcjogdG9vbDEsIHRoaW5raW5nMiwgdG9vbDIgaW4gRE9NIG9yZGVyXG5cdFx0XHQvLyBCdWcgYmVoYXZpb3I6IHRoaW5raW5nMiByZW5kZXJzIGJlZm9yZSB0b29sMSBiZWNhdXNlIGl0cyBub3QgbGF6eVxuXHRcdFx0Y29uc3QgaW5pdGlhbENvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqSW5pdGlhbCB0aGlua2luZyoqJywgJ3RoaW5raW5nLTEnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRpbml0aWFsQ29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBBcHBlbmQgdG9vbDEgd2hpbGUgY29sbGFwc2VkIChsYXp5KVxuXHRcdFx0bGV0IHRvb2wxUmVuZGVyZWQgPSBmYWxzZTtcblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdHRvb2wxUmVuZGVyZWQgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBkaXYgPSAkKCdkaXYudGVzdC1pdGVtJyk7XG5cdFx0XHRcdGRpdi5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGVzdC1pZCcsICd0b29sMScpO1xuXHRcdFx0XHRkaXYudGV4dENvbnRlbnQgPSAnVG9vbCAxJztcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogZGl2IH07XG5cdFx0XHR9LCAndG9vbC0xJyk7XG5cblx0XHRcdC8vIE5vdyBzZXR1cFRoaW5raW5nQ29udGFpbmVyIGlzIGNhbGxlZCBmb3IgYSBuZXcgdGhpbmtpbmcgc2VjdGlvblxuXHRcdFx0Ly8gVGhpcyBzaW11bGF0ZXMgd2hhdCBoYXBwZW5zIHdoZW4gYSBuZXcgdGhpbmtpbmcgcGFydCBhcnJpdmVzIGR1cmluZyBzdHJlYW1pbmdcblx0XHRcdGNvbnN0IG5ld1RoaW5raW5nQ29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipTZWNvbmQgdGhpbmtpbmcgc2VjdGlvbioqJywgJ3RoaW5raW5nLTInKTtcblx0XHRcdHBhcnQuc2V0dXBUaGlua2luZ0NvbnRhaW5lcihuZXdUaGlua2luZ0NvbnRlbnQpO1xuXG5cdFx0XHQvLyBBcHBlbmQgdG9vbDIgd2hpbGUgY29sbGFwc2VkIChsYXp5KVxuXHRcdFx0bGV0IHRvb2wyUmVuZGVyZWQgPSBmYWxzZTtcblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdHRvb2wyUmVuZGVyZWQgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBkaXYgPSAkKCdkaXYudGVzdC1pdGVtJyk7XG5cdFx0XHRcdGRpdi5zZXRBdHRyaWJ1dGUoJ2RhdGEtdGVzdC1pZCcsICd0b29sMicpO1xuXHRcdFx0XHRkaXYudGV4dENvbnRlbnQgPSAnVG9vbCAyJztcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogZGl2IH07XG5cdFx0XHR9LCAndG9vbC0yJyk7XG5cblx0XHRcdC8vIFRvb2xzIHNob3VsZCBub3QgaGF2ZSByZW5kZXJlZCB5ZXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sMVJlbmRlcmVkLCBmYWxzZSwgJ1Rvb2wgMSBzaG91bGQgbm90IHJlbmRlciB3aGlsZSBjb2xsYXBzZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sMlJlbmRlcmVkLCBmYWxzZSwgJ1Rvb2wgMiBzaG91bGQgbm90IHJlbmRlciB3aGlsZSBjb2xsYXBzZWQnKTtcblxuXHRcdFx0Ly8gTm93IGV4cGFuZFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdC8vIEV2ZXJ5dGhpbmcgc2hvdWxkIHJlbmRlciBub3dcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sMVJlbmRlcmVkLCB0cnVlLCAnVG9vbCAxIHNob3VsZCByZW5kZXIgYWZ0ZXIgZXhwYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbDJSZW5kZXJlZCwgdHJ1ZSwgJ1Rvb2wgMiBzaG91bGQgcmVuZGVyIGFmdGVyIGV4cGFuZCcpO1xuXG5cdFx0XHQvLyBHZXQgYWxsIHJlbmRlcmVkIGl0ZW1zIGFuZCBjaGVjayB0aGVpciBvcmRlclxuXHRcdFx0Y29uc3Qgd3JhcHBlciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXIsICdTaG91bGQgaGF2ZSB3cmFwcGVyJyk7XG5cblx0XHRcdC8vIFRoZSBjaGlsZHJlbiBzaG91bGQgYmUgaW4gb3JkZXI6IGluaXRpYWwtdGhpbmtpbmcsIHRvb2wxLXdyYXBwZXIsIHRoaW5raW5nMiwgdG9vbDItd3JhcHBlclxuXHRcdFx0Ly8gR2V0IGFsbCBkaXJlY3QgY2hpbGRyZW4gdG8gY2hlY2sgb3JkZXJcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbSh3cmFwcGVyIS5jaGlsZHJlbik7XG5cblx0XHRcdC8vIEZpbmQgaW5kaWNlcyBvZiBvdXIgaXRlbXNcblx0XHRcdGNvbnN0IHRvb2wxSW5kZXggPSBjaGlsZHJlbi5maW5kSW5kZXgoZWwgPT5cblx0XHRcdFx0ZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXRoaW5raW5nLXRvb2wtd3JhcHBlcicpICYmXG5cdFx0XHRcdGVsLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRlc3QtaWQ9XCJ0b29sMVwiXScpXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdG9vbDJJbmRleCA9IGNoaWxkcmVuLmZpbmRJbmRleChlbCA9PlxuXHRcdFx0XHRlbC5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdGhpbmtpbmctdG9vbC13cmFwcGVyJykgJiZcblx0XHRcdFx0ZWwucXVlcnlTZWxlY3RvcignW2RhdGEtdGVzdC1pZD1cInRvb2wyXCJdJylcblx0XHRcdCk7XG5cblx0XHRcdC8vIEZpbmQgdGhpbmtpbmcgY29udGFpbmVycyAodGhleSBoYXZlIGNsYXNzIGNoYXQtdGhpbmtpbmctaXRlbSlcblx0XHRcdGNvbnN0IHRoaW5raW5nSXRlbXMgPSBjaGlsZHJlbi5maWx0ZXIoZWwgPT4gZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXRoaW5raW5nLWl0ZW0nKSk7XG5cblx0XHRcdC8vIFdlIHNob3VsZCBoYXZlIDIgdGhpbmtpbmcgaXRlbXMgKGluaXRpYWwgYW5kIHRoZSBvbmUgZnJvbSBzZXR1cFRoaW5raW5nQ29udGFpbmVyKVxuXHRcdFx0Ly8gYW5kIDIgdG9vbCB3cmFwcGVyc1xuXHRcdFx0YXNzZXJ0Lm9rKHRoaW5raW5nSXRlbXMubGVuZ3RoID49IDEsICdTaG91bGQgaGF2ZSBhdCBsZWFzdCBvbmUgdGhpbmtpbmcgaXRlbScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvb2wxSW5kZXggPj0gMCwgJ1Nob3VsZCBmaW5kIHRvb2wxJyk7XG5cdFx0XHRhc3NlcnQub2sodG9vbDJJbmRleCA+PSAwLCAnU2hvdWxkIGZpbmQgdG9vbDInKTtcblxuXHRcdFx0Ly8gVGhlIGtleSBhc3NlcnRpb246IHRvb2wxIHNob3VsZCBjb21lIGJlZm9yZSB0b29sMiBpbiBET00gb3JkZXJcblx0XHRcdC8vIGFuZCBhbnkgdGhpbmtpbmcgY29udGVudCBiZXR3ZWVuIHRoZW0gc2hvdWxkIGFsc28gYmUgaW4gb3JkZXJcblx0XHRcdGFzc2VydC5vayh0b29sMUluZGV4IDwgdG9vbDJJbmRleCxcblx0XHRcdFx0YFRvb2wxIChpbmRleCAke3Rvb2wxSW5kZXh9KSBzaG91bGQgY29tZSBiZWZvcmUgVG9vbDIgKGluZGV4ICR7dG9vbDJJbmRleH0pIGluIERPTSBvcmRlcmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya2Rvd24gdmlhIHVwZGF0ZVRoaW5raW5nIHNob3VsZCBwcmVzZXJ2ZSBvcmRlciB3aXRoIGxhenkgdG9vbCBpdGVtcyAoQlVHOiBtYXJrZG93biByZW5kZXJzIGJlZm9yZSB0b29scyknLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHRlc3QgZXhwb3NlcyB0aGUgbGF6eSByZW5kZXJpbmcgYnVnIHdoZXJlIG1hcmtkb3duIGNvbnRlbnQgZnJvbSB1cGRhdGVUaGlua2luZy9cblx0XHRcdC8vIHNldHVwVGhpbmtpbmdDb250YWluZXIgZ2V0cyByZW5kZXJlZCBpbW1lZGlhdGVseSBhbmQgcGxhY2VkIGluIERPTSBiZWZvcmUgdG9vbCBpdGVtcy5cblx0XHRcdC8vXG5cdFx0XHQvLyBUaGUgYnVnIGZsb3c6XG5cdFx0XHQvLyAxLiBUb29sMSBhcnJpdmVzIFx1MjE5MiBhcHBlbmRJdGVtKCkgXHUyMTkyIHN0b3JlZCBpbiBsYXp5SXRlbXMgKG5vdCByZW5kZXJlZCB5ZXQpXG5cdFx0XHQvLyAyLiBUaGlua2luZy9tYXJrZG93biBhcnJpdmVzIFx1MjE5MiBzZXR1cFRoaW5raW5nQ29udGFpbmVyKCkgXHUyMTkyIHRleHRDb250YWluZXIgY3JlYXRlZCxcblx0XHRcdC8vICAgIHVwZGF0ZVRoaW5raW5nKCkgXHUyMTkyIHJlbmRlck1hcmtkb3duKCkgcmVuZGVycyBJTU1FRElBVEVMWSBpbnRvIHRleHRDb250YWluZXJcblx0XHRcdC8vIDMuIFRvb2wyIGFycml2ZXMgXHUyMTkyIGFwcGVuZEl0ZW0oKSBcdTIxOTIgc3RvcmVkIGluIGxhenlJdGVtcyAobm90IHJlbmRlcmVkIHlldClcblx0XHRcdC8vIDQuIFVzZXIgZXhwYW5kcyBcdTIxOTIgaW5pdENvbnRlbnQoKSBjcmVhdGVzIHdyYXBwZXIsIGFkZHMgdGV4dENvbnRhaW5lciBGSVJTVCxcblx0XHRcdC8vICAgIHRoZW4gbWF0ZXJpYWxpemVzIGxhenlJdGVtcyAodG9vbHMpXG5cdFx0XHQvL1xuXHRcdFx0Ly8gUmVzdWx0OiBET00gb3JkZXIgaXMgW21hcmtkb3duLCB0b29sMSwgdG9vbDJdIGluc3RlYWQgb2YgW3Rvb2wxLCBtYXJrZG93biwgdG9vbDJdXG5cdFx0XHRjb25zdCBpbml0aWFsQ29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnJywgJ3RoaW5raW5nLTEnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRpbml0aWFsQ29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBTdGVwIDE6IFRvb2wxIGFycml2ZXMgd2hpbGUgY29sbGFwc2VkIC0gc2hvdWxkIGJlIGxhenlcblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpdiA9ICQoJ2Rpdi50ZXN0LWl0ZW0nKTtcblx0XHRcdFx0ZGl2LnNldEF0dHJpYnV0ZSgnZGF0YS10ZXN0LWlkJywgJ3Rvb2wxJyk7XG5cdFx0XHRcdGRpdi5zZXRBdHRyaWJ1dGUoJ2RhdGEtb3JkZXInLCAnMScpO1xuXHRcdFx0XHRkaXYudGV4dENvbnRlbnQgPSAnVG9vbCAxJztcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogZGl2IH07XG5cdFx0XHR9LCAndG9vbC0xJyk7XG5cblx0XHRcdC8vIFN0ZXAgMjogTmV3IHRoaW5raW5nIHNlY3Rpb24gYXJyaXZlcyAtIHRoaXMgdXNlcyBzZXR1cFRoaW5raW5nQ29udGFpbmVyICsgdXBkYXRlVGhpbmtpbmdcblx0XHRcdC8vIEluIHRoZSBidWcsIHRoaXMgY3JlYXRlcyB0ZXh0Q29udGFpbmVyIGFuZCByZW5kZXJzIG1hcmtkb3duIGltbWVkaWF0ZWx5XG5cdFx0XHRjb25zdCB0aGlua2luZ0NvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqQW5hbHl6aW5nIHRoZSBjb2RlYmFzZSoqJywgJ3RoaW5raW5nLTInKTtcblx0XHRcdHBhcnQuc2V0dXBUaGlua2luZ0NvbnRhaW5lcih0aGlua2luZ0NvbnRlbnQpO1xuXG5cdFx0XHQvLyBTdGVwIDM6IFRvb2wyIGFycml2ZXMgd2hpbGUgY29sbGFwc2VkIC0gc2hvdWxkIGJlIGxhenlcblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpdiA9ICQoJ2Rpdi50ZXN0LWl0ZW0nKTtcblx0XHRcdFx0ZGl2LnNldEF0dHJpYnV0ZSgnZGF0YS10ZXN0LWlkJywgJ3Rvb2wyJyk7XG5cdFx0XHRcdGRpdi5zZXRBdHRyaWJ1dGUoJ2RhdGEtb3JkZXInLCAnMycpO1xuXHRcdFx0XHRkaXYudGV4dENvbnRlbnQgPSAnVG9vbCAyJztcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogZGl2IH07XG5cdFx0XHR9LCAndG9vbC0yJyk7XG5cblx0XHRcdC8vIE5vdyBleHBhbmQgdG8gdHJpZ2dlciBsYXp5IHJlbmRlcmluZ1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdC8vIEdldCB0aGUgd3JhcHBlciBhbmQgY2hlY2sgRE9NIG9yZGVyXG5cdFx0XHRjb25zdCB3cmFwcGVyID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1saXN0Jyk7XG5cdFx0XHRhc3NlcnQub2sod3JhcHBlciwgJ1Nob3VsZCBoYXZlIHdyYXBwZXIgYWZ0ZXIgZXhwYW5kaW5nJyk7XG5cblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbSh3cmFwcGVyIS5jaGlsZHJlbik7XG5cblx0XHRcdC8vIEZpbmQgaW5kaWNlc1xuXHRcdFx0Y29uc3QgdG9vbDFJbmRleCA9IGNoaWxkcmVuLmZpbmRJbmRleChlbCA9PlxuXHRcdFx0XHRlbC5xdWVyeVNlbGVjdG9yKCdbZGF0YS10ZXN0LWlkPVwidG9vbDFcIl0nKVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHRvb2wySW5kZXggPSBjaGlsZHJlbi5maW5kSW5kZXgoZWwgPT5cblx0XHRcdFx0ZWwucXVlcnlTZWxlY3RvcignW2RhdGEtdGVzdC1pZD1cInRvb2wyXCJdJylcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBtYXJrZG93bkluZGV4ID0gY2hpbGRyZW4uZmluZEluZGV4KGVsID0+XG5cdFx0XHRcdGVsLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC10aGlua2luZy1pdGVtJykgJiYgZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdtYXJrZG93bi1jb250ZW50Jylcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayh0b29sMUluZGV4ID49IDAsIGBTaG91bGQgZmluZCB0b29sMSBpbiBET00gKGZvdW5kIGF0IGluZGV4ICR7dG9vbDFJbmRleH0pYCk7XG5cdFx0XHRhc3NlcnQub2sodG9vbDJJbmRleCA+PSAwLCBgU2hvdWxkIGZpbmQgdG9vbDIgaW4gRE9NIChmb3VuZCBhdCBpbmRleCAke3Rvb2wySW5kZXh9KWApO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtkb3duSW5kZXggPj0gMCwgYFNob3VsZCBmaW5kIG1hcmtkb3duIGluIERPTSAoZm91bmQgYXQgaW5kZXggJHttYXJrZG93bkluZGV4fSlgKTtcblxuXHRcdFx0Ly8gVGhlIGtleSBhc3NlcnRpb246IG9yZGVyIHNob3VsZCBtYXRjaCBhcnJpdmFsIG9yZGVyICh0b29sMSwgbWFya2Rvd24sIHRvb2wyKVxuXHRcdFx0Ly8gQlVHOiBDdXJyZW50bHkgbWFya2Rvd24gaXMgYWx3YXlzIGZpcnN0IGJlY2F1c2UgaXQncyBub3QgbGF6eVxuXHRcdFx0YXNzZXJ0Lm9rKHRvb2wxSW5kZXggPCBtYXJrZG93bkluZGV4LFxuXHRcdFx0XHRgQlVHOiBUb29sMSAoaW5kZXggJHt0b29sMUluZGV4fSkgc2hvdWxkIGNvbWUgQkVGT1JFIG1hcmtkb3duIChpbmRleCAke21hcmtkb3duSW5kZXh9KSBgICtcblx0XHRcdFx0YGJlY2F1c2UgdG9vbDEgd2FzIGFwcGVuZGVkIGZpcnN0LiBDdXJyZW50IERPTSBvcmRlciBpbmRpY2F0ZXMgbWFya2Rvd24gaXMgZWFnZXJseSBgICtcblx0XHRcdFx0YHBsYWNlZCBmaXJzdCByZWdhcmRsZXNzIG9mIGFycml2YWwgb3JkZXIuYCk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Rvd25JbmRleCA8IHRvb2wySW5kZXgsXG5cdFx0XHRcdGBNYXJrZG93biAoaW5kZXggJHttYXJrZG93bkluZGV4fSkgc2hvdWxkIGNvbWUgYmVmb3JlIFRvb2wyIChpbmRleCAke3Rvb2wySW5kZXh9KWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGF6eSB0aGlua2luZyBpdGVtcyBzaG91bGQgc2hvdyB1cGRhdGVkIGNvbnRlbnQgYWZ0ZXIgc3RyZWFtaW5nIHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHRlc3QgZXhwb3NlcyB0aGUgYnVnIHdoZXJlIHN0cmVhbWluZyB1cGRhdGVzIHRvIHRoaW5raW5nIGNvbnRlbnQgYXJlIGxvc3Rcblx0XHRcdC8vIHdoZW4gdGhlIHRoaW5raW5nIHBhcnQgaXMgY29sbGFwc2VkLlxuXHRcdFx0Ly9cblx0XHRcdC8vIEJ1ZyBmbG93OlxuXHRcdFx0Ly8gMS4gc2V0dXBUaGlua2luZ0NvbnRhaW5lcihjb250ZW50MSkgY3JlYXRlcyBsYXp5IGl0ZW0gd2l0aCBjb250ZW50MVxuXHRcdFx0Ly8gMi4gdXBkYXRlVGhpbmtpbmcoY29udGVudDIpIGlzIGNhbGxlZCB3aXRoIHVwZGF0ZWQgc3RyZWFtaW5nIGNvbnRlbnRcblx0XHRcdC8vICAgIC0gdGhpcy5jb250ZW50IGlzIHVwZGF0ZWQgdG8gY29udGVudDJcblx0XHRcdC8vICAgIC0gdGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZSBpcyB1cGRhdGVkXG5cdFx0XHQvLyAgICAtIGJ1dCB0aGUgbGF6eSBpdGVtIHN0aWxsIHN0b3JlcyBjb250ZW50MVxuXHRcdFx0Ly8gMy4gVXNlciBleHBhbmRzOlxuXHRcdFx0Ly8gICAgLSBpbml0Q29udGVudCBjcmVhdGVzIGEgTkVXIHRleHRDb250YWluZXIgd2l0aCBjdXJyZW50VGhpbmtpbmdWYWx1ZSAobGF0ZXN0KVxuXHRcdFx0Ly8gICAgLSBtYXRlcmlhbGl6ZUxhenlJdGVtIGFwcGVuZHMgQU5PVEhFUiBjb250YWluZXIgZnJvbSBsYXp5IGl0ZW0gd2l0aCBzdGFsZSBjb250ZW50XG5cdFx0XHQvL1xuXHRcdFx0Ly8gUmVzdWx0OiBEdXBsaWNhdGUgdGhpbmtpbmcgY29udGFpbmVycywgb25lIHdpdGggY29ycmVjdCBjb250ZW50LCBvbmUgd2l0aCBzdGFsZVxuXHRcdFx0Y29uc3QgaW5pdGlhbENvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJycsICd0aGlua2luZy0xJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0aW5pdGlhbENvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gU3RlcCAxOiBOZXcgdGhpbmtpbmcgc2VjdGlvbiBhcnJpdmVzIHdoaWxlIGNvbGxhcHNlZFxuXHRcdFx0Y29uc3QgdGhpbmtpbmdDb250ZW50MSA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipTdGFydGluZyBhbmFseXNpcyoqJywgJ3RoaW5raW5nLTInKTtcblx0XHRcdHBhcnQuc2V0dXBUaGlua2luZ0NvbnRhaW5lcih0aGlua2luZ0NvbnRlbnQxKTtcblxuXHRcdFx0Ly8gU3RlcCAyOiBTdHJlYW1pbmcgY29udGludWVzIC0gbW9yZSBjb250ZW50IGFycml2ZXMgdmlhIHVwZGF0ZVRoaW5raW5nXG5cdFx0XHRjb25zdCB0aGlua2luZ0NvbnRlbnQyID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKlN0YXJ0aW5nIGFuYWx5c2lzKiogTG9va2luZyBhdCB0aGUgY29kZSBzdHJ1Y3R1cmUuLi4nLCAndGhpbmtpbmctMicpO1xuXHRcdFx0cGFydC51cGRhdGVUaGlua2luZyh0aGlua2luZ0NvbnRlbnQyKTtcblxuXHRcdFx0Ly8gU3RlcCAzOiBFdmVuIG1vcmUgc3RyZWFtaW5nIGNvbnRlbnRcblx0XHRcdGNvbnN0IHRoaW5raW5nQ29udGVudDMgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqU3RhcnRpbmcgYW5hbHlzaXMqKiBMb29raW5nIGF0IHRoZSBjb2RlIHN0cnVjdHVyZS4uLiBGb3VuZCB0aGUgaXNzdWUgaW4gdGhlIHBhcnNlciBtb2R1bGUuJywgJ3RoaW5raW5nLTInKTtcblx0XHRcdHBhcnQudXBkYXRlVGhpbmtpbmcodGhpbmtpbmdDb250ZW50Myk7XG5cblx0XHRcdC8vIE5vdyBleHBhbmQgdG8gdHJpZ2dlciBsYXp5IHJlbmRlcmluZ1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdC8vIEdldCB0aGUgcmVuZGVyZWQgY29udGVudFxuXHRcdFx0Y29uc3Qgd3JhcHBlciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXIsICdTaG91bGQgaGF2ZSB3cmFwcGVyIGFmdGVyIGV4cGFuZGluZycpO1xuXG5cdFx0XHQvLyBHZXQgQUxMIHRoaW5raW5nIGl0ZW1zIC0gdGhlIGJ1ZyBjcmVhdGVzIGR1cGxpY2F0ZSBjb250YWluZXJzXG5cdFx0XHRjb25zdCB0aGlua2luZ0l0ZW1zID0gd3JhcHBlciEucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtdGhpbmtpbmctaXRlbS5tYXJrZG93bi1jb250ZW50Jyk7XG5cblx0XHRcdC8vIEJVRzogVGhlcmUgc2hvdWxkIG9ubHkgYmUgT05FIHRoaW5raW5nIGl0ZW0sIGJ1dCB0aGUgYnVnIGNhdXNlcyBUV086XG5cdFx0XHQvLyAxLiBPbmUgZnJvbSBpbml0Q29udGVudCB3aXRoIGNvcnJlY3QgY3VycmVudCBjb250ZW50XG5cdFx0XHQvLyAyLiBPbmUgZnJvbSBtYXRlcmlhbGl6ZUxhenlJdGVtIHdpdGggc3RhbGUgY29udGVudFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaW5raW5nSXRlbXMubGVuZ3RoLCAxLFxuXHRcdFx0XHRgQlVHOiBTaG91bGQgaGF2ZSBleGFjdGx5IDEgdGhpbmtpbmcgaXRlbSwgYnV0IGdvdCAke3RoaW5raW5nSXRlbXMubGVuZ3RofS4gYCArXG5cdFx0XHRcdGBtYXRlcmlhbGl6ZUxhenlJdGVtIGNyZWF0ZXMgYSBkdXBsaWNhdGUgY29udGFpbmVyIGZyb20gdGhlIGxhenkgaXRlbS4gYCArXG5cdFx0XHRcdGBJdGVtczogJHtBcnJheS5mcm9tKHRoaW5raW5nSXRlbXMpLm1hcChpID0+IGBcIiR7aS50ZXh0Q29udGVudH1cImApLmpvaW4oJywgJyl9YCk7XG5cblx0XHRcdC8vIEFsc28gdmVyaWZ5IHRoZSBzaW5nbGUgaXRlbSBoYXMgdGhlIGxhdGVzdCBjb250ZW50XG5cdFx0XHRpZiAodGhpbmtpbmdJdGVtcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZWRUZXh0ID0gdGhpbmtpbmdJdGVtc1swXS50ZXh0Q29udGVudCB8fCAnJztcblx0XHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRcdHJlbmRlcmVkVGV4dC5pbmNsdWRlcygnRm91bmQgdGhlIGlzc3VlIGluIHRoZSBwYXJzZXIgbW9kdWxlJyksXG5cdFx0XHRcdFx0YENvbnRlbnQgc2hvdWxkIHNob3cgbGF0ZXN0IHN0cmVhbWluZyB1cGRhdGUuIEdvdDogXCIke3JlbmRlcmVkVGV4dH1cImBcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xhenkgdGhpbmtpbmcgaXRlbXMgc2hvdWxkIHdvcmsgd2l0aG91dCBzdHJlYW1pbmcgdXBkYXRlcyBhZnRlciBzZXR1cFRoaW5raW5nQ29udGFpbmVyJywgKCkgPT4ge1xuXHRcdFx0Ly8gRWRnZSBjYXNlOiBzZXR1cFRoaW5raW5nQ29udGFpbmVyIGlzIGNhbGxlZCBidXQgbm8gc3Vic2VxdWVudCB1cGRhdGVUaGlua2luZyBhcnJpdmVzXG5cdFx0XHQvLyBJbiB0aGlzIGNhc2UsIHRoZSBsYXp5IGl0ZW0ncyBjb250ZW50IHNob3VsZCBiZSB1c2VkIHdoZW4gbWF0ZXJpYWxpemluZ1xuXHRcdFx0Y29uc3QgaW5pdGlhbENvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJycsICd0aGlua2luZy0xJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0aW5pdGlhbENvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gT25seSBjYWxsIHNldHVwVGhpbmtpbmdDb250YWluZXIsIG5vIHN1YnNlcXVlbnQgdXBkYXRlVGhpbmtpbmdcblx0XHRcdGNvbnN0IHRoaW5raW5nQ29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipBbmFseXppbmcgZmlsZXMqKicsICd0aGlua2luZy0yJyk7XG5cdFx0XHRwYXJ0LnNldHVwVGhpbmtpbmdDb250YWluZXIodGhpbmtpbmdDb250ZW50KTtcblxuXHRcdFx0Ly8gRXhwYW5kIHRvIHRyaWdnZXIgbGF6eSByZW5kZXJpbmdcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXG5cdFx0XHQvLyBHZXQgdGhlIHJlbmRlcmVkIGNvbnRlbnRcblx0XHRcdGNvbnN0IHdyYXBwZXIgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdXNlZC1jb250ZXh0LWxpc3QnKTtcblx0XHRcdGFzc2VydC5vayh3cmFwcGVyLCAnU2hvdWxkIGhhdmUgd3JhcHBlciBhZnRlciBleHBhbmRpbmcnKTtcblxuXHRcdFx0Y29uc3QgdGhpbmtpbmdJdGVtcyA9IHdyYXBwZXIhLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXRoaW5raW5nLWl0ZW0ubWFya2Rvd24tY29udGVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaW5raW5nSXRlbXMubGVuZ3RoLCAxLCAnU2hvdWxkIGhhdmUgZXhhY3RseSAxIHRoaW5raW5nIGl0ZW0nKTtcblxuXHRcdFx0Ly8gVGhlIGNvbnRlbnQgc2hvdWxkIGJlIHRoZSBvbmUgZnJvbSBzZXR1cFRoaW5raW5nQ29udGFpbmVyXG5cdFx0XHRjb25zdCByZW5kZXJlZFRleHQgPSB0aGlua2luZ0l0ZW1zWzBdLnRleHRDb250ZW50IHx8ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRyZW5kZXJlZFRleHQuaW5jbHVkZXMoJ0FuYWx5emluZyBmaWxlcycpLFxuXHRcdFx0XHRgQ29udGVudCBzaG91bGQgc2hvdyBzZXR1cFRoaW5raW5nQ29udGFpbmVyIGNvbnRlbnQuIEdvdDogXCIke3JlbmRlcmVkVGV4dH1cImBcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTdGF0ZSBtYW5hZ2VtZW50JywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5hZ2VudC50aGlua2luZ1N0eWxlJywgVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya0FzSW5hY3RpdmUgc2hvdWxkIHVwZGF0ZSBpc0FjdGl2ZSBzdGF0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqQWN0aXZlIHRoaW5raW5nKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5nZXRJc0FjdGl2ZSgpLCB0cnVlLCAnU2hvdWxkIHN0YXJ0IGFzIGFjdGl2ZScpO1xuXG5cdFx0XHRwYXJ0Lm1hcmtBc0luYWN0aXZlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmdldElzQWN0aXZlKCksIGZhbHNlLCAnU2hvdWxkIGJlIGluYWN0aXZlIGFmdGVyIG1hcmtBc0luYWN0aXZlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlIHNob3VsZCBzZXQgaXNBY3RpdmUgdG8gZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKkFjdGl2ZSB0aGlua2luZyoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmdldElzQWN0aXZlKCksIHRydWUsICdTaG91bGQgc3RhcnQgYXMgYWN0aXZlJyk7XG5cblx0XHRcdHBhcnQuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5nZXRJc0FjdGl2ZSgpLCBmYWxzZSwgJ1Nob3VsZCBiZSBpbmFjdGl2ZSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb2xsYXBzZUNvbnRlbnQgc2hvdWxkIGNvbGxhcHNlIHRoZSBwYXJ0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipDb250ZW50KipcXG5Tb21lIGRldGFpbGVkIHJlYXNvbmluZyB0aGF0IGRpZmZlcnMgZnJvbSB0aGUgdGl0bGUnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdC8vIFVzZSBDb2xsYXBzZWRQcmV2aWV3IHRvIHN0YXJ0IGV4cGFuZGVkXG5cdFx0XHRtb2NrQ29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuYWdlbnQudGhpbmtpbmdTdHlsZScsIFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkUHJldmlldyk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBleHBhbmRlZCBpbml0aWFsbHlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UpO1xuXG5cdFx0XHRwYXJ0LmNvbGxhcHNlQ29udGVudCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIHRydWUsXG5cdFx0XHRcdCdTaG91bGQgYmUgY29sbGFwc2VkIGFmdGVyIGNvbGxhcHNlQ29udGVudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluYWxpemVUaXRsZUlmRGVmYXVsdCBzaG91bGQgdXBkYXRlIGJ1dHRvbiBpY29uIHRvIGNoZWNrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipXb3JraW5nKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdHBhcnQuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXG5cdFx0XHQvLyBUaGUgYnV0dG9uIHNob3VsZCBub3cgc2hvdyBhIGNoZWNrIGljb25cblx0XHRcdGNvbnN0IGljb25FbGVtZW50ID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jb2RpY29uLWNoZWNrJyk7XG5cdFx0XHRhc3NlcnQub2soaWNvbkVsZW1lbnQsICdTaG91bGQgaGF2ZSBjaGVjayBpY29uIGFmdGVyIGZpbmFsaXphdGlvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRlZCcpLCAnU2hvdWxkIGVuYWJsZSBjb250ZW50IGFuaW1hdGlvbiBhZnRlciBmaW5hbGl6YXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplVGl0bGVJZkRlZmF1bHQgc2hvdWxkIHJldGFpbiBpbml0aWFsIHRoaW5raW5nIHRpdGxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipSZXZpZXdlZCByZW5kZXJlciBzdGF0ZSoqXFxuQ2hlY2tlZCBjb21wbGV0ZWQgcmVzcG9uc2UgcmVuZGVyaW5nJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQodHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0cGFydC5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGdlbmVyYXRlZFRpdGxlOiBjb250ZW50LmdlbmVyYXRlZFRpdGxlLFxuXHRcdFx0XHRsYWJlbDogYnV0dG9uLnRleHRDb250ZW50LFxuXHRcdFx0XHRhcmlhTGFiZWw6IGJ1dHRvbi5hcmlhTGFiZWwsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGdlbmVyYXRlZFRpdGxlOiAnUmV2aWV3ZWQgcmVuZGVyZXIgc3RhdGUnLFxuXHRcdFx0XHRsYWJlbDogJ1Jldmlld2VkIHJlbmRlcmVyIHN0YXRlJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnUmV2aWV3ZWQgcmVuZGVyZXIgc3RhdGUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5hbGl6ZVRpdGxlSWZEZWZhdWx0IHNob3VsZCByZXRhaW4gcmVzdG9yZWQgdGVybWluYWwgdGl0bGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCB0ZXJtaW5hbFRvb2w6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0ge1xuXHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyxcblx0XHRcdFx0dG9vbElkOiAncnVuX2luX3Rlcm1pbmFsJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rlcm1pbmFsLWNhbGwtMScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBucG0gdGVzdCcsXG5cdFx0XHRcdG9yaWdpbk1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNDb25maXJtZWQ6IHsgdHlwZTogMCB9LFxuXHRcdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHRnZW5lcmF0ZWRUaXRsZTogJ1JhbiBucG0gdGVzdCcsXG5cdFx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gdGVzdCcgfSxcblx0XHRcdFx0XHRsYW5ndWFnZTogJ3NoZWxsc2NyaXB0Jyxcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+ICh7IGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LXRlcm1pbmFsLXRvb2wnKSB9KSwgdGVybWluYWxUb29sLnRvb2xJZCwgdGVybWluYWxUb29sKTtcblx0XHRcdHBhcnQuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24nKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb250ZW50R2VuZXJhdGVkVGl0bGU6IGNvbnRlbnQuZ2VuZXJhdGVkVGl0bGUsXG5cdFx0XHRcdHRvb2xHZW5lcmF0ZWRUaXRsZTogdGVybWluYWxUb29sLmdlbmVyYXRlZFRpdGxlLFxuXHRcdFx0XHRsYWJlbDogYnV0dG9uLnRleHRDb250ZW50LFxuXHRcdFx0XHRhcmlhTGFiZWw6IGJ1dHRvbi5hcmlhTGFiZWwsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbnRlbnRHZW5lcmF0ZWRUaXRsZTogJ1JhbiBucG0gdGVzdCcsXG5cdFx0XHRcdHRvb2xHZW5lcmF0ZWRUaXRsZTogJ1JhbiBucG0gdGVzdCcsXG5cdFx0XHRcdGxhYmVsOiAnUmFuIG5wbSB0ZXN0Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnUmFuIG5wbSB0ZXN0Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluYWxpemVUaXRsZUlmRGVmYXVsdCBzaG91bGQgcmVzdG9yZSBjYWNoZWQgdGl0bGUgZm9yIGEgcmVhc29uaW5nLW9ubHkgYmxvY2sga2V5ZWQgYnkgdGhpbmtpbmcgcGFydCBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTtcblx0XHRcdGNvbnN0IHRoaW5raW5nSWQgPSAncmVhc29uaW5nLXBhcnQtMSc7XG5cblx0XHRcdC8vIFNlZWQgdGhlIHBlcnNpc3RlZCB0aXRsZSBjYWNoZSBhcyBpZiBhIHByZXZpb3VzIHNlc3Npb24gcmVuZGVyIGhhZFxuXHRcdFx0Ly8gZ2VuZXJhdGVkIGFuZCBzdG9yZWQgYSBoZWFkZXIgZm9yIHRoaXMgcmVhc29uaW5nLW9ubHkgYmxvY2suXG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2FjaGVLZXkgPSBgJHtjaGF0U2Vzc2lvblJlc291cmNlVG9JZChjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlKX06JHt0aGlua2luZ0lkfWA7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFx0J2NoYXQudGhpbmtpbmdUaXRsZUNhY2hlJyxcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoeyBbY2FjaGVLZXldOiB7IHRpdGxlOiAnQW5hbHl6ZWQgYXV0aGVudGljYXRpb24gZmxvdycsIHN0b3JlZEF0OiBEYXRlLm5vdygpIH0gfSksXG5cdFx0XHRcdFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0XHRTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkVcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJycsIHRoaW5raW5nSWQpO1xuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRwYXJ0LmZpbmFsaXplVGl0bGVJZkRlZmF1bHQoKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Z2VuZXJhdGVkVGl0bGU6IGNvbnRlbnQuZ2VuZXJhdGVkVGl0bGUsXG5cdFx0XHRcdGxhYmVsOiBidXR0b24udGV4dENvbnRlbnQsXG5cdFx0XHRcdGFyaWFMYWJlbDogYnV0dG9uLmFyaWFMYWJlbCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Z2VuZXJhdGVkVGl0bGU6ICdBbmFseXplZCBhdXRoZW50aWNhdGlvbiBmbG93Jyxcblx0XHRcdFx0bGFiZWw6ICdBbmFseXplZCBhdXRoZW50aWNhdGlvbiBmbG93Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQW5hbHl6ZWQgYXV0aGVudGljYXRpb24gZmxvdycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2hhc1NhbWVDb250ZW50JywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5hZ2VudC50aGlua2luZ1N0eWxlJywgVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciB0b29sIGludm9jYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipXb3JraW5nKionLCAnaWQtMScpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nIGFzIGNvbnN0LFxuXHRcdFx0XHR0b29sSWQ6ICd0ZXN0LXRvb2wnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1Rlc3RpbmcnLFxuXHRcdFx0XHRyZXN1bHREZXRhaWxzOiBbXSxcblx0XHRcdFx0aXNDb25maXJtZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRpc0NhbmNlbGVkOiBmYWxzZVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0UmVuZGVyZXJDb250ZW50O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJ0Lmhhc1NhbWVDb250ZW50KHRvb2xJbnZvY2F0aW9uLCBbXSwgY29udGV4dC5lbGVtZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUsICdTaG91bGQgYWNjZXB0IHRvb2wgaW52b2NhdGlvbnMgYXMgc2FtZSBjb250ZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gYSB0b29sIGJlY29tZXMgYSBwYXJlbnQgc3ViYWdlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKicsICdpZC0xJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uJyBhcyBjb25zdCxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRSZW5kZXJlckNvbnRlbnQ7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmhhc1NhbWVDb250ZW50KHRvb2xJbnZvY2F0aW9uLCBbXSwgY29udGV4dC5lbGVtZW50KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciBtYXJrZG93biBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipXb3JraW5nKionLCAnaWQtMScpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duQ29udGVudCA9IHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcgYXMgY29uc3QsXG5cdFx0XHRcdGNvbnRlbnQ6IHsgdmFsdWU6ICd0ZXN0JyB9XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRSZW5kZXJlckNvbnRlbnQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnQuaGFzU2FtZUNvbnRlbnQobWFya2Rvd25Db250ZW50LCBbXSwgY29udGV4dC5lbGVtZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUsICdTaG91bGQgYWNjZXB0IG1hcmtkb3duIGNvbnRlbnQgYXMgc2FtZSBjb250ZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIGZvciBkaWZmZXJlbnQgdGhpbmtpbmcgcGFydCB3aXRoIHNhbWUgaWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKicsICdpZC0xJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3Qgb3RoZXJUaGlua2luZzogSUNoYXRSZW5kZXJlckNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqRGlmZmVyZW50KionLCAnaWQtMScpO1xuXG5cdFx0XHQvLyBXaGVuIHRoZSBpZCBpcyB0aGUgc2FtZSwgaGFzU2FtZUNvbnRlbnQgcmV0dXJucyB0cnVlIChvdGhlci5pZCAhPT0gdGhpcy5pZCBpcyBmYWxzZSlcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnQuaGFzU2FtZUNvbnRlbnQob3RoZXJUaGlua2luZywgW10sIGNvbnRleHQuZWxlbWVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSwgJ1Nob3VsZCByZXR1cm4gZmFsc2UgZm9yIHRoaW5raW5nIHBhcnQgd2l0aCBzYW1lIGlkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRydWUgZm9yIHRoaW5raW5nIHBhcnQgd2l0aCBkaWZmZXJlbnQgaWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKicsICdpZC0xJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3Qgb3RoZXJUaGlua2luZzogSUNoYXRSZW5kZXJlckNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqRGlmZmVyZW50KionLCAnaWQtMicpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJ0Lmhhc1NhbWVDb250ZW50KG90aGVyVGhpbmtpbmcsIFtdLCBjb250ZXh0LmVsZW1lbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSwgJ1Nob3VsZCByZXR1cm4gdHJ1ZSBmb3IgdGhpbmtpbmcgcGFydCB3aXRoIGRpZmZlcmVudCBpZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRE9NIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRtb2NrQ29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuYWdlbnQudGhpbmtpbmdTdHlsZScsIFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYXZlIHByb3BlciBhcmlhLWV4cGFuZGVkIGF0dHJpYnV0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqQ29udGVudCoqXFxuU29tZSBkZXRhaWxlZCByZWFzb25pbmcgdGhhdCBkaWZmZXJzIGZyb20gdGhlIHRpdGxlJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24nKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdCdXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAnZmFsc2UnLCAnU2hvdWxkIGhhdmUgYXJpYS1leHBhbmRlZD1cImZhbHNlXCIgd2hlbiBjb2xsYXBzZWQnKTtcblxuXHRcdFx0Ly8gRXhwYW5kXG5cdFx0XHRidXR0b24uY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ3RydWUnLCAnU2hvdWxkIGhhdmUgYXJpYS1leHBhbmRlZD1cInRydWVcIiB3aGVuIGV4cGFuZGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2hvdyBsb2FkaW5nIHNwaW5uZXIgd2hpbGUgc3RyZWFtaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipTdHJlYW1pbmcgY29udGVudCoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlIC8vIG5vdCBzdHJlYW1pbmcgY29tcGxldGVkXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSBjaXJjbGUtZmlsbGVkIGljb24gKG5vdCBsb2FkaW5nIHNwaW5uZXIpIHdoaWxlIHN0cmVhbWluZ1xuXHRcdFx0Y29uc3QgY2lyY2xlSWNvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY29kaWNvbi1jaXJjbGUtZmlsbGVkJyk7XG5cdFx0XHRhc3NlcnQub2soY2lyY2xlSWNvbiwgJ1Nob3VsZCBoYXZlIGNpcmNsZS1maWxsZWQgaWNvbiB3aGlsZSBzdHJlYW1pbmcnKTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vY2tTdHJlYW1pbmdUb29sSW52b2NhdGlvbih0b29sSWQ6IHN0cmluZywgaW52b2NhdGlvbk1lc3NhZ2U6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nKTogSUNoYXRUb29sSW52b2NhdGlvbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0XHR0b29sSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdFx0Z2VuZXJhdGVkVGl0bGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhdGU6IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCB7XG5cdFx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nLFxuXHRcdFx0XHRcdHBhcnRpYWxJbnB1dDogb2JzZXJ2YWJsZVZhbHVlKCdwYXJ0aWFsSW5wdXQnLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdHN0cmVhbWluZ01lc3NhZ2U6IG9ic2VydmFibGVWYWx1ZSgnc3RyZWFtaW5nTWVzc2FnZScsIHVuZGVmaW5lZCksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhS2luZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgdW5kZWZpbmVkKSxcblx0XHRcdFx0dG9KU09OOiAoKSA9PiAoe30gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpLFxuXHRcdFx0fSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vY2tFeGVjdXRpbmdUb29sSW52b2NhdGlvbih0b29sSWQ6IHN0cmluZywgaW52b2NhdGlvbk1lc3NhZ2U6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nKTogSUNoYXRUb29sSW52b2NhdGlvbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0XHR0b29sSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdFx0Z2VuZXJhdGVkVGl0bGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhdGU6IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCB7XG5cdFx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogeyB0eXBlOiAwIH0sXG5cdFx0XHRcdFx0cHJvZ3Jlc3M6IG9ic2VydmFibGVWYWx1ZSgncHJvZ3Jlc3MnLCB7IHByb2dyZXNzOiAwIH0pLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHt9LFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhS2luZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgdW5kZWZpbmVkKSxcblx0XHRcdFx0dG9KU09OOiAoKSA9PiAoe30gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpLFxuXHRcdFx0fSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vY2tTZXJpYWxpemVkSW1hZ2VUb29sSW52b2NhdGlvbih0b29sSWQ6IHN0cmluZywgaW52b2NhdGlvbk1lc3NhZ2U6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nKTogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHRcdHRvb2xJZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdG9yaWdpbk1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzdWx0RGV0YWlsczoge1xuXHRcdFx0XHRcdG91dHB1dDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2RhdGEnLFxuXHRcdFx0XHRcdFx0bWltZVR5cGU6ICdpbWFnZS9wbmcnLFxuXHRcdFx0XHRcdFx0YmFzZTY0RGF0YTogJ0FRSUQnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpc0NvbmZpcm1lZDogeyB0eXBlOiAwIH0sXG5cdFx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRcdGdlbmVyYXRlZFRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnZmluYWxpemVUaXRsZUlmRGVmYXVsdCBzaG91bGQgcHJvbW90ZSBhIHNpbmdsZSB0b29sIG91dCBvZiB0aGlua2luZyBldmVuIHdoZW4gaXQgaXMgbm90IGNvbXBsZXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQpPy5jbGljaygpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbFBhcmVudCA9ICQoJ2Rpdi5vcmlnaW5hbC1wYXJlbnQnKTtcblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvcmlnaW5hbFBhcmVudCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG9yaWdpbmFsUGFyZW50LnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IGV4ZWN1dGluZ1Rvb2wgPSBjcmVhdGVNb2NrRXhlY3V0aW5nVG9vbEludm9jYXRpb24oJ2NvcGlsb3RfcmVhZEZpbGUnLCAnUmVhZGluZyBmaWxlJywgJ2NhbGwtMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShleGVjdXRpbmdUb29sKSwgZmFsc2UsICdwcmVjb25kaXRpb246IHRvb2wgaXMgbm90IGNvbXBsZXRlJyk7XG5cblx0XHRcdGNvbnN0IHRvb2xEb20gPSAkKCdkaXYuY2hhdC10b29sLWludm9jYXRpb24tcGFydCcpO1xuXHRcdFx0Y29uc3QgdG9vbEhlYWRlciA9ICQoJ2Rpdi50b29sLWhlYWRlcicpO1xuXHRcdFx0dG9vbEhlYWRlci50ZXh0Q29udGVudCA9ICdSZWFkaW5nIGZpbGUnO1xuXHRcdFx0Y29uc3QgdG9vbEJvZHkgPSAkKCdkaXYudG9vbC1ib2R5Jyk7XG5cdFx0XHR0b29sQm9keS50ZXh0Q29udGVudCA9ICdBR0VOVFMubWQnO1xuXHRcdFx0dG9vbERvbS5hcHBlbmQodG9vbEhlYWRlciwgdG9vbEJvZHkpO1xuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+ICh7IGRvbU5vZGU6IHRvb2xEb20gfSksIGV4ZWN1dGluZ1Rvb2wudG9vbElkLCBleGVjdXRpbmdUb29sLCBvcmlnaW5hbFBhcmVudCk7XG5cblx0XHRcdGNvbnN0IHVzZWRDb250ZXh0TGlzdCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdCcpO1xuXHRcdFx0Y29uc3QgdGhpbmtpbmdXcmFwcGVyID0gdG9vbERvbS5wYXJlbnRFbGVtZW50O1xuXHRcdFx0Y29uc3QgdGhpbmtpbmdJdGVtQ291bnRCZWZvcmVGaW5hbGl6ZSA9IHVzZWRDb250ZXh0TGlzdD8uY2hpbGRFbGVtZW50Q291bnQ7XG5cdFx0XHRwYXJ0LmZpbmFsaXplVGl0bGVJZkRlZmF1bHQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRoaW5raW5nSXRlbUNvdW50QmVmb3JlRmluYWxpemUsXG5cdFx0XHRcdHRoaW5raW5nSXRlbUNvdW50QWZ0ZXJGaW5hbGl6ZTogdXNlZENvbnRleHRMaXN0Py5jaGlsZEVsZW1lbnRDb3VudCxcblx0XHRcdFx0dG9vbENoaWxkQ291bnQ6IHRvb2xEb20uY2hpbGRFbGVtZW50Q291bnQsXG5cdFx0XHRcdHRvb2xQYXJlbnQ6IHRvb2xEb20ucGFyZW50RWxlbWVudCA9PT0gb3JpZ2luYWxQYXJlbnQsXG5cdFx0XHRcdHRoaW5raW5nV3JhcHBlclJlbW92ZWQ6ICF0aGlua2luZ1dyYXBwZXI/LnBhcmVudEVsZW1lbnQsXG5cdFx0XHRcdGlzQXR0YWNoZWRUb1RoaW5raW5nOiBleGVjdXRpbmdUb29sLmlzQXR0YWNoZWRUb1RoaW5raW5nLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0aGlua2luZ0l0ZW1Db3VudEJlZm9yZUZpbmFsaXplOiAyLFxuXHRcdFx0XHR0aGlua2luZ0l0ZW1Db3VudEFmdGVyRmluYWxpemU6IDAsXG5cdFx0XHRcdHRvb2xDaGlsZENvdW50OiAyLFxuXHRcdFx0XHR0b29sUGFyZW50OiB0cnVlLFxuXHRcdFx0XHR0aGlua2luZ1dyYXBwZXJSZW1vdmVkOiB0cnVlLFxuXHRcdFx0XHRpc0F0dGFjaGVkVG9UaGlua2luZzogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplVGl0bGVJZkRlZmF1bHQgc2hvdWxkIHByb21vdGUgYSBsYXp5IHNpbmdsZSB0b29sIHdpdGhvdXQgaXRzIHRoaW5raW5nIGljb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsUGFyZW50ID0gJCgnZGl2Lm9yaWdpbmFsLXBhcmVudCcpO1xuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG9yaWdpbmFsUGFyZW50KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gb3JpZ2luYWxQYXJlbnQucmVtb3ZlKCkpKTtcblxuXHRcdFx0Y29uc3QgZXhlY3V0aW5nVG9vbCA9IGNyZWF0ZU1vY2tFeGVjdXRpbmdUb29sSW52b2NhdGlvbignY29waWxvdF9yZWFkRmlsZScsICdSZWFkaW5nIGZpbGUnLCAnY2FsbC0xJyk7XG5cdFx0XHRjb25zdCB0b29sRG9tID0gJCgnZGl2LmNoYXQtdG9vbC1pbnZvY2F0aW9uLXBhcnQnKTtcblx0XHRcdHRvb2xEb20udGV4dENvbnRlbnQgPSAnUmVhZGluZyBmaWxlJztcblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiAoeyBkb21Ob2RlOiB0b29sRG9tIH0pLCBleGVjdXRpbmdUb29sLnRvb2xJZCwgZXhlY3V0aW5nVG9vbCwgb3JpZ2luYWxQYXJlbnQpO1xuXG5cdFx0XHRwYXJ0LmZpbmFsaXplVGl0bGVJZkRlZmF1bHQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRvb2xQYXJlbnQ6IHRvb2xEb20ucGFyZW50RWxlbWVudCA9PT0gb3JpZ2luYWxQYXJlbnQsXG5cdFx0XHRcdHRvcExldmVsQ2hpbGRDb3VudDogb3JpZ2luYWxQYXJlbnQuY2hpbGRFbGVtZW50Q291bnQsXG5cdFx0XHRcdHRvcExldmVsQ2hpbGQ6IG9yaWdpbmFsUGFyZW50LmZpcnN0RWxlbWVudENoaWxkID09PSB0b29sRG9tLFxuXHRcdFx0XHRpc0F0dGFjaGVkVG9UaGlua2luZzogZXhlY3V0aW5nVG9vbC5pc0F0dGFjaGVkVG9UaGlua2luZyxcblx0XHRcdH0sIHtcblx0XHRcdFx0dG9vbFBhcmVudDogdHJ1ZSxcblx0XHRcdFx0dG9wTGV2ZWxDaGlsZENvdW50OiAxLFxuXHRcdFx0XHR0b3BMZXZlbENoaWxkOiB0cnVlLFxuXHRcdFx0XHRpc0F0dGFjaGVkVG9UaGlua2luZzogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplVGl0bGVJZkRlZmF1bHQgc2hvdWxkIGtlZXAgYSByZWxhdGVkIGl0ZW0gaW5zaWRlIHRoZSBwcmVjZWRpbmcgdG9vbCBpbnZvY2F0aW9uIHBhcnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbFBhcmVudCA9ICQoJ2Rpdi5vcmlnaW5hbC1wYXJlbnQnKTtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uUGFydCA9ICQoJ2Rpdi5jaGF0LXRvb2wtaW52b2NhdGlvbi1wYXJ0Jyk7XG5cdFx0XHRvcmlnaW5hbFBhcmVudC5hcHBlbmQodG9vbEludm9jYXRpb25QYXJ0LCBwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG9yaWdpbmFsUGFyZW50KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gb3JpZ2luYWxQYXJlbnQucmVtb3ZlKCkpKTtcblxuXHRcdFx0KHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50KT8uY2xpY2soKTtcblxuXHRcdFx0Y29uc3QgZWRpdFBpbGwgPSAkKCdkaXYuY2hhdC1jb2RlYmxvY2stcGlsbC1jb250YWluZXInKTtcblx0XHRcdGVkaXRQaWxsLnRleHRDb250ZW50ID0gJ0VkaXRlZCBBR0VOVFMubWQnO1xuXHRcdFx0Y29uc3QgbWFya2Rvd246IElDaGF0TWFya2Rvd25Db250ZW50ID0geyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogeyB2YWx1ZTogJycgfSB9O1xuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+ICh7IGRvbU5vZGU6IGVkaXRQaWxsIH0pLCAnZWRpdC1waWxsJywgbWFya2Rvd24sIG9yaWdpbmFsUGFyZW50KTtcblxuXHRcdFx0Y29uc3QgdGhpbmtpbmdXcmFwcGVyID0gZWRpdFBpbGwucGFyZW50RWxlbWVudDtcblx0XHRcdHBhcnQuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZWRpdFBpbGxQYXJlbnQ6IGVkaXRQaWxsLnBhcmVudEVsZW1lbnQgPT09IHRvb2xJbnZvY2F0aW9uUGFydCxcblx0XHRcdFx0dGhpbmtpbmdXcmFwcGVyUmVtb3ZlZDogIXRoaW5raW5nV3JhcHBlcj8ucGFyZW50RWxlbWVudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZWRpdFBpbGxQYXJlbnQ6IHRydWUsXG5cdFx0XHRcdHRoaW5raW5nV3JhcHBlclJlbW92ZWQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplVGl0bGVJZkRlZmF1bHQgc2hvdWxkIHByb21vdGUgYW4gZXh0ZXJuYWwgZWRpdCBiZXNpZGUgYSBoaWRkZW4gdG9vbCBpbnZvY2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxQYXJlbnQgPSAkKCdkaXYub3JpZ2luYWwtcGFyZW50Jyk7XG5cdFx0XHRjb25zdCBoaWRkZW5Ub29sSW52b2NhdGlvblBhcnQgPSAkKCdkaXYuY2hhdC10b29sLWludm9jYXRpb24tcGFydCcpO1xuXHRcdFx0aGlkZGVuVG9vbEludm9jYXRpb25QYXJ0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRvcmlnaW5hbFBhcmVudC5hcHBlbmQoaGlkZGVuVG9vbEludm9jYXRpb25QYXJ0LCBwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG9yaWdpbmFsUGFyZW50KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gb3JpZ2luYWxQYXJlbnQucmVtb3ZlKCkpKTtcblxuXHRcdFx0KHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWJ1dHRvbicpIGFzIEhUTUxFbGVtZW50KT8uY2xpY2soKTtcblxuXHRcdFx0Y29uc3QgZWRpdFBpbGwgPSAkKCdkaXYuY2hhdC1jb2RlYmxvY2stcGlsbC1jb250YWluZXInKTtcblx0XHRcdGVkaXRQaWxsLnRleHRDb250ZW50ID0gJ0VkaXRlZCBwYWNrYWdlLmpzb24nO1xuXHRcdFx0Y29uc3QgZXh0ZXJuYWxFZGl0OiBJQ2hhdEV4dGVybmFsRWRpdCA9IHtcblx0XHRcdFx0a2luZDogJ2V4dGVybmFsRWRpdCcsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvcGFja2FnZS5qc29uJyksXG5cdFx0XHRcdGVkaXRLaW5kOiAnZWRpdCcsXG5cdFx0XHR9O1xuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+ICh7IGRvbU5vZGU6IGVkaXRQaWxsIH0pLCAnZXh0ZXJuYWwtZWRpdCcsIGV4dGVybmFsRWRpdCwgb3JpZ2luYWxQYXJlbnQpO1xuXG5cdFx0XHRjb25zdCB0aGlua2luZ1dyYXBwZXIgPSBlZGl0UGlsbC5wYXJlbnRFbGVtZW50O1xuXHRcdFx0cGFydC5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRlZGl0UGlsbFBhcmVudDogZWRpdFBpbGwucGFyZW50RWxlbWVudCA9PT0gb3JpZ2luYWxQYXJlbnQsXG5cdFx0XHRcdGhpZGRlblRvb2xDaGlsZENvdW50OiBoaWRkZW5Ub29sSW52b2NhdGlvblBhcnQuY2hpbGRFbGVtZW50Q291bnQsXG5cdFx0XHRcdHRoaW5raW5nV3JhcHBlclJlbW92ZWQ6ICF0aGlua2luZ1dyYXBwZXI/LnBhcmVudEVsZW1lbnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVkaXRQaWxsUGFyZW50OiB0cnVlLFxuXHRcdFx0XHRoaWRkZW5Ub29sQ2hpbGRDb3VudDogMCxcblx0XHRcdFx0dGhpbmtpbmdXcmFwcGVyUmVtb3ZlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluYWxpemVUaXRsZUlmRGVmYXVsdCBzaG91bGQgdXNlIHRoZSBvcmlnaW5hbCBwYXJlbnQgd2hlbiBmaW5kaW5nIGEgcHJlY2VkaW5nIHRvb2wgaW52b2NhdGlvbiBwYXJ0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxQYXJlbnQgPSAkKCdkaXYub3JpZ2luYWwtcGFyZW50Jyk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFRvb2xJbnZvY2F0aW9uUGFydCA9ICQoJ2Rpdi5jaGF0LXRvb2wtaW52b2NhdGlvbi1wYXJ0Jyk7XG5cdFx0XHRvcmlnaW5hbFBhcmVudC5hcHBlbmQob3JpZ2luYWxUb29sSW52b2NhdGlvblBhcnQsIHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3JpZ2luYWxQYXJlbnQpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBvcmlnaW5hbFBhcmVudC5yZW1vdmUoKSkpO1xuXG5cdFx0XHQocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQpPy5jbGljaygpO1xuXG5cdFx0XHRjb25zdCBlZGl0UGlsbCA9ICQoJ2Rpdi5jaGF0LWNvZGVibG9jay1waWxsLWNvbnRhaW5lcicpO1xuXHRcdFx0ZWRpdFBpbGwudGV4dENvbnRlbnQgPSAnRWRpdGVkIEFHRU5UUy5tZCc7XG5cdFx0XHRjb25zdCBtYXJrZG93bjogSUNoYXRNYXJrZG93bkNvbnRlbnQgPSB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiB7IHZhbHVlOiAnJyB9IH07XG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oKCkgPT4gKHsgZG9tTm9kZTogZWRpdFBpbGwgfSksICdlZGl0LXBpbGwnLCBtYXJrZG93biwgb3JpZ2luYWxQYXJlbnQpO1xuXG5cdFx0XHRjb25zdCB1bnJlbGF0ZWRQYXJlbnQgPSAkKCdkaXYudW5yZWxhdGVkLXBhcmVudCcpO1xuXHRcdFx0Y29uc3QgdW5yZWxhdGVkVG9vbEludm9jYXRpb25QYXJ0ID0gJCgnZGl2LmNoYXQtdG9vbC1pbnZvY2F0aW9uLXBhcnQnKTtcblx0XHRcdHVucmVsYXRlZFBhcmVudC5hcHBlbmQodW5yZWxhdGVkVG9vbEludm9jYXRpb25QYXJ0LCBwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHVucmVsYXRlZFBhcmVudCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHVucmVsYXRlZFBhcmVudC5yZW1vdmUoKSkpO1xuXG5cdFx0XHRwYXJ0LmZpbmFsaXplVGl0bGVJZkRlZmF1bHQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGVkaXRQaWxsUGFyZW50SXNPcmlnaW5hbFRvb2w6IGVkaXRQaWxsLnBhcmVudEVsZW1lbnQgPT09IG9yaWdpbmFsVG9vbEludm9jYXRpb25QYXJ0LFxuXHRcdFx0XHR1bnJlbGF0ZWRUb29sQ2hpbGRDb3VudDogdW5yZWxhdGVkVG9vbEludm9jYXRpb25QYXJ0LmNoaWxkRWxlbWVudENvdW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRlZGl0UGlsbFBhcmVudElzT3JpZ2luYWxUb29sOiB0cnVlLFxuXHRcdFx0XHR1bnJlbGF0ZWRUb29sQ2hpbGRDb3VudDogMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgXCJFZGl0aW5nIGZpbGVzXCIgZm9yIHN0cmVhbWluZyBlZGl0IHRvb2xzIGluc3RlYWQgb2YgZ2VuZXJpYyBkaXNwbGF5IG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nUmVwbGFjZVRvb2wgPSBjcmVhdGVNb2NrU3RyZWFtaW5nVG9vbEludm9jYXRpb24oXG5cdFx0XHRcdCdjb3BpbG90X3JlcGxhY2VTdHJpbmcnLCAnUmVwbGFjZSBTdHJpbmcgaW4gRmlsZScsICdjYWxsLTEnXG5cdFx0XHQpO1xuXG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXYgPSAkKCdkaXYudGVzdC1pdGVtJyk7XG5cdFx0XHRcdGRpdi50ZXh0Q29udGVudCA9ICdSZXBsYWNlIHRvb2wnO1xuXHRcdFx0XHRyZXR1cm4geyBkb21Ob2RlOiBkaXYgfTtcblx0XHRcdH0sIHN0cmVhbWluZ1JlcGxhY2VUb29sLnRvb2xJZCwgc3RyZWFtaW5nUmVwbGFjZVRvb2wpO1xuXG5cdFx0XHQvLyBUaGUgdGl0bGUgc2hvdWxkIHNob3cgXCJFZGl0aW5nIGZpbGVzXCIgaW5zdGVhZCBvZiBcIlJlcGxhY2UgU3RyaW5nIGluIEZpbGVcIlxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1sYWJlbCAubW9uYWNvLWJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgbGFiZWxUZXh0ID0gYnV0dG9uLnF1ZXJ5U2VsZWN0b3IoJy5pY29uLWxhYmVsJyk/LnRleHRDb250ZW50ID8/IGJ1dHRvbi50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhsYWJlbFRleHQuaW5jbHVkZXMoJ0VkaXRpbmcgZmlsZXMnKSwgYFRpdGxlIHNob3VsZCBjb250YWluIFwiRWRpdGluZyBmaWxlc1wiIGJ1dCBnb3QgXCIke2xhYmVsVGV4dH1cImApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgb3JpZ2luYWwgbWVzc2FnZSBmb3Igbm9uLWVkaXQgc3RyZWFtaW5nIHRvb2xzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipXb3JraW5nKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IHN0cmVhbWluZ1JlYWRUb29sID0gY3JlYXRlTW9ja1N0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uKFxuXHRcdFx0XHQnY29waWxvdF9yZWFkRmlsZScsICdSZWFkaW5nIGZpbGUudHMnLCAnY2FsbC0yJ1xuXHRcdFx0KTtcblxuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2LnRlc3QtaXRlbScpO1xuXHRcdFx0XHRkaXYudGV4dENvbnRlbnQgPSAnUmVhZCB0b29sJztcblx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogZGl2IH07XG5cdFx0XHR9LCBzdHJlYW1pbmdSZWFkVG9vbC50b29sSWQsIHN0cmVhbWluZ1JlYWRUb29sKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1sYWJlbCAubW9uYWNvLWJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgbGFiZWxUZXh0ID0gYnV0dG9uLnF1ZXJ5U2VsZWN0b3IoJy5pY29uLWxhYmVsJyk/LnRleHRDb250ZW50ID8/IGJ1dHRvbi50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhsYWJlbFRleHQuaW5jbHVkZXMoJ1JlYWRpbmcgZmlsZS50cycpLCBgVGl0bGUgc2hvdWxkIGNvbnRhaW4gXCJSZWFkaW5nIGZpbGUudHNcIiBidXQgZ290IFwiJHtsYWJlbFRleHR9XCJgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IG9yaWdpbmFsIG1lc3NhZ2UgZm9yIG5vbi1zdHJlYW1pbmcgZWRpdCB0b29scycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqV29ya2luZyoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHQvLyBOb24tc3RyZWFtaW5nIChleGVjdXRpbmcpIGVkaXQgdG9vbCBzaG91bGQgc2hvdyBpdHMgaW52b2NhdGlvbiBtZXNzYWdlXG5cdFx0XHRjb25zdCBleGVjdXRpbmdSZXBsYWNlVG9vbCA9IGNyZWF0ZU1vY2tFeGVjdXRpbmdUb29sSW52b2NhdGlvbihcblx0XHRcdFx0J2NvcGlsb3RfcmVwbGFjZVN0cmluZycsICdSZXBsYWNpbmcgNSBsaW5lcyBpbiBmaWxlLnRzJywgJ2NhbGwtMydcblx0XHRcdCk7XG5cblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpdiA9ICQoJ2Rpdi50ZXN0LWl0ZW0nKTtcblx0XHRcdFx0ZGl2LnRleHRDb250ZW50ID0gJ1JlcGxhY2UgdG9vbCc7XG5cdFx0XHRcdHJldHVybiB7IGRvbU5vZGU6IGRpdiB9O1xuXHRcdFx0fSwgZXhlY3V0aW5nUmVwbGFjZVRvb2wudG9vbElkLCBleGVjdXRpbmdSZXBsYWNlVG9vbCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC11c2VkLWNvbnRleHQtbGFiZWwgLm1vbmFjby1idXR0b24nKTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBjb2xsYXBzZSBidXR0b24nKTtcblx0XHRcdGNvbnN0IGxhYmVsVGV4dCA9IGJ1dHRvbi5xdWVyeVNlbGVjdG9yKCcuaWNvbi1sYWJlbCcpPy50ZXh0Q29udGVudCA/PyBidXR0b24udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxUZXh0LmluY2x1ZGVzKCdSZXBsYWNpbmcgNSBsaW5lcyBpbiBmaWxlLnRzJyksIGBUaXRsZSBzaG91bGQgY29udGFpbiBcIlJlcGxhY2luZyA1IGxpbmVzIGluIGZpbGUudHNcIiBidXQgZ290IFwiJHtsYWJlbFRleHR9XCJgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBrZWVwIG9yaWdpbmFsIG1lc3NhZ2UgZm9yIGNyZWF0ZV9maWxlIHRvb2wgZXZlbiB3aGVuIHN0cmVhbWluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqV29ya2luZyoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBzdHJlYW1pbmdDcmVhdGVUb29sID0gY3JlYXRlTW9ja1N0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uKFxuXHRcdFx0XHQnY29waWxvdF9jcmVhdGVGaWxlJywgJ0NyZWF0aW5nIG5ld0ZpbGUudHMnLCAnY2FsbC00J1xuXHRcdFx0KTtcblxuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2LnRlc3QtaXRlbScpO1xuXHRcdFx0XHRkaXYudGV4dENvbnRlbnQgPSAnQ3JlYXRlIHRvb2wnO1xuXHRcdFx0XHRyZXR1cm4geyBkb21Ob2RlOiBkaXYgfTtcblx0XHRcdH0sIHN0cmVhbWluZ0NyZWF0ZVRvb2wudG9vbElkLCBzdHJlYW1pbmdDcmVhdGVUb29sKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1sYWJlbCAubW9uYWNvLWJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgbGFiZWxUZXh0ID0gYnV0dG9uLnF1ZXJ5U2VsZWN0b3IoJy5pY29uLWxhYmVsJyk/LnRleHRDb250ZW50ID8/IGJ1dHRvbi50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhsYWJlbFRleHQuaW5jbHVkZXMoJ0NyZWF0aW5nIG5ld0ZpbGUudHMnKSwgYFRpdGxlIHNob3VsZCBjb250YWluIFwiQ3JlYXRpbmcgbmV3RmlsZS50c1wiIGJ1dCBnb3QgXCIke2xhYmVsVGV4dH1cImApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgZXh0ZXJuYWwgcmVzb3VyY2VzIGZvciBzZXJpYWxpemVkIGltYWdlIHRvb2xzIHdoZW4gaW5pdGlhbGx5IGNvbGxhcHNlZCBhbmQgaGlkZSB0aGVtIHdoZW4gZXhwYW5kZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZEltYWdlVG9vbCA9IGNyZWF0ZU1vY2tTZXJpYWxpemVkSW1hZ2VUb29sSW52b2NhdGlvbihcblx0XHRcdFx0J2NoYXRfc2NyZWVuc2hvdCcsICdDYXB0dXJlZCBzY3JlZW5zaG90JywgJ2ltYWdlLWNhbGwtMSdcblx0XHRcdCk7XG5cblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpdiA9ICQoJ2Rpdi50ZXN0LWl0ZW0nKTtcblx0XHRcdFx0ZGl2LnRleHRDb250ZW50ID0gJ0ltYWdlIHRvb2wnO1xuXHRcdFx0XHRyZXR1cm4geyBkb21Ob2RlOiBkaXYgfTtcblx0XHRcdH0sIHNlcmlhbGl6ZWRJbWFnZVRvb2wudG9vbElkLCBzZXJpYWxpemVkSW1hZ2VUb29sKTtcblxuXHRcdFx0Y29uc3QgZXh0ZXJuYWxSZXNvdXJjZXMgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdGhpbmtpbmctZXh0ZXJuYWwtcmVzb3VyY2VzJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soZXh0ZXJuYWxSZXNvdXJjZXMsICdTaG91bGQgcmVuZGVyIGV4dGVybmFsIHJlc291cmNlcyBjb250YWluZXInKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChleHRlcm5hbFJlc291cmNlcy5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdTaG91bGQgc2hvdyBleHRlcm5hbCByZXNvdXJjZXMgd2hpbGUgaW5pdGlhbGx5IGNvbGxhcHNlZCcpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24nKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBleHBhbmQgYnV0dG9uJyk7XG5cdFx0XHRidXR0b24uY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dGVybmFsUmVzb3VyY2VzLnN0eWxlLmRpc3BsYXksICdub25lJywgJ1Nob3VsZCBoaWRlIGV4dGVybmFsIHJlc291cmNlcyB3aGVuIGV4cGFuZGVkJyk7XG5cblx0XHRcdGJ1dHRvbi5jbGljaygpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGV4dGVybmFsUmVzb3VyY2VzLnN0eWxlLmRpc3BsYXksICdub25lJywgJ1Nob3VsZCBzaG93IGV4dGVybmFsIHJlc291cmNlcyBhZ2FpbiBhZnRlciBjb2xsYXBzaW5nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHNob3cgZXh0ZXJuYWwgcmVzb3VyY2VzIGZvciB0ZXJtaW5hbCB0b29scyB0aGF0IHJlbmRlciB0aGVpciBvd24gaW1hZ2UgcGlsbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRUZXJtaW5hbEltYWdlVG9vbDogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tTZXJpYWxpemVkSW1hZ2VUb29sSW52b2NhdGlvbigncnVuX2luX3Rlcm1pbmFsJywgJ1JhbiBjb21tYW5kJywgJ3Rlcm1pbmFsLWltYWdlLWNhbGwtMScpLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ2Rvd25sb2FkIGltYWdlJyB9LFxuXHRcdFx0XHRcdGxhbmd1YWdlOiAnc2hlbGxzY3JpcHQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0cGFydC5hcHBlbmRJdGVtKCgpID0+ICh7IGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LXRlcm1pbmFsLXRvb2wnKSB9KSwgc2VyaWFsaXplZFRlcm1pbmFsSW1hZ2VUb29sLnRvb2xJZCwgc2VyaWFsaXplZFRlcm1pbmFsSW1hZ2VUb29sKTtcblxuXHRcdFx0Y29uc3QgZXh0ZXJuYWxSZXNvdXJjZXMgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdGhpbmtpbmctZXh0ZXJuYWwtcmVzb3VyY2VzJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZGlzcGxheTogZXh0ZXJuYWxSZXNvdXJjZXMuc3R5bGUuZGlzcGxheSxcblx0XHRcdFx0YXR0YWNobWVudENvdW50OiBleHRlcm5hbFJlc291cmNlcy5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWF0dGFjaG1lbnQnKS5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGRpc3BsYXk6ICdub25lJyxcblx0XHRcdFx0YXR0YWNobWVudENvdW50OiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdEaWZmIGFnZ3JlZ2F0aW9uIGluIHRoaW5raW5nIGhlYWRlcicsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRtb2NrQ29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuYWdlbnQudGhpbmtpbmdTdHlsZScsIFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IGRpZmYgc3RhdHMgaW4gZmluYWxpemVkIHRpdGxlIHdoZW4gb25EaWRDaGFuZ2VEaWZmIGZpcmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipFZGl0aW5nIGZpbGVzKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBkaWZmRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQ2hhdENvbnRlbnRQYXJ0RGlmZkRhdGE+KCkpO1xuXG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oXG5cdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LWVkaXQtcGlsbCcpIH0pLFxuXHRcdFx0XHQnZWRpdC1wYXJ0LTEnLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0ZGlmZkVtaXR0ZXIuZXZlbnRcblx0XHRcdCk7XG5cblx0XHRcdHBhcnQuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXG5cdFx0XHQvLyBGaXJlIGRpZmYgZXZlbnRcblx0XHRcdGRpZmZFbWl0dGVyLmZpcmUoY3JlYXRlRGlmZkRhdGEoMTAsIDMpKTtcblxuXHRcdFx0Y29uc3QgYWRkZWRFbCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubGFiZWwtYWRkZWQnKTtcblx0XHRcdGNvbnN0IHJlbW92ZWRFbCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubGFiZWwtcmVtb3ZlZCcpO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdXNlZC1jb250ZXh0LWxhYmVsJyk7XG5cdFx0XHRjb25zdCB0aXRsZUJ1dHRvbiA9IGxhYmVsPy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLm1vbmFjby1pY29uLWJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgY2hldnJvbiA9IGxhYmVsPy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtaG92ZXItY2hldnJvbicpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbEV4cGFuZGVkID0gdGl0bGVCdXR0b24/LmFyaWFFeHBhbmRlZDtcblx0XHRcdGNoZXZyb24/LmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWRkZWQ6IGFkZGVkRWw/LnRleHRDb250ZW50LFxuXHRcdFx0XHRyZW1vdmVkOiByZW1vdmVkRWw/LnRleHRDb250ZW50LFxuXHRcdFx0XHRjaGlsZENsYXNzZXM6IFsuLi5sYWJlbCEuY2hpbGRyZW5dLm1hcChjaGlsZCA9PiBjaGlsZC5jbGFzc05hbWUpLFxuXHRcdFx0XHRpbml0aWFsRXhwYW5kZWQsXG5cdFx0XHRcdGV4cGFuZGVkQWZ0ZXJDaGV2cm9uQ2xpY2s6IHRpdGxlQnV0dG9uPy5hcmlhRXhwYW5kZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGFkZGVkOiAnKzEwJyxcblx0XHRcdFx0cmVtb3ZlZDogJy0zJyxcblx0XHRcdFx0Y2hpbGRDbGFzc2VzOiBbXG5cdFx0XHRcdFx0J21vbmFjby1idXR0b24gbW9uYWNvLWljb24tYnV0dG9uIG1vbmFjby10ZXh0LWJ1dHRvbiBjaGF0LXRoaW5raW5nLXRpdGxlLXdpdGgtZGlmZicsXG5cdFx0XHRcdFx0J21vbmFjby1idXR0b24gY2hhdC10aGlua2luZy10aXRsZS1kaWZmJyxcblx0XHRcdFx0XHQnY2hhdC1jb2xsYXBzaWJsZS1ob3Zlci1jaGV2cm9uIGNvZGljb24gY29kaWNvbi1jaGV2cm9uLXJpZ2h0IGV4cGFuZGVkJyxcblx0XHRcdFx0XSxcblx0XHRcdFx0aW5pdGlhbEV4cGFuZGVkOiAnZmFsc2UnLFxuXHRcdFx0XHRleHBhbmRlZEFmdGVyQ2hldnJvbkNsaWNrOiAndHJ1ZScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhZ2dyZWdhdGUgZGlmZnMgZnJvbSBtdWx0aXBsZSBlZGl0IHBhcnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNyZWF0ZVRoaW5raW5nUGFydCgnKipFZGl0aW5nIGZpbGVzKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBkaWZmRW1pdHRlcjEgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUNoYXRDb250ZW50UGFydERpZmZEYXRhPigpKTtcblx0XHRcdGNvbnN0IGRpZmZFbWl0dGVyMiA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQ2hhdENvbnRlbnRQYXJ0RGlmZkRhdGE+KCkpO1xuXG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oXG5cdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LWVkaXQtcGlsbC0xJykgfSksXG5cdFx0XHRcdCdlZGl0LXBhcnQtMScsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRkaWZmRW1pdHRlcjEuZXZlbnRcblx0XHRcdCk7XG5cblx0XHRcdHBhcnQuYXBwZW5kSXRlbShcblx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogJCgnZGl2LnRlc3QtZWRpdC1waWxsLTInKSB9KSxcblx0XHRcdFx0J2VkaXQtcGFydC0yJyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGRpZmZFbWl0dGVyMi5ldmVudFxuXHRcdFx0KTtcblxuXHRcdFx0cGFydC5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cblx0XHRcdGRpZmZFbWl0dGVyMS5maXJlKGNyZWF0ZURpZmZEYXRhKDUsIDIsICdmaXJzdC50cycpKTtcblx0XHRcdGRpZmZFbWl0dGVyMi5maXJlKGNyZWF0ZURpZmZEYXRhKDgsIDEsICdzZWNvbmQudHMnKSk7XG5cblx0XHRcdGNvbnN0IGFkZGVkRWwgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmxhYmVsLWFkZGVkJyk7XG5cdFx0XHRjb25zdCByZW1vdmVkRWwgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmxhYmVsLXJlbW92ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRlZEVsPy50ZXh0Q29udGVudCwgJysxMycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZWRFbD8udGV4dENvbnRlbnQsICctMycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzaG93IGRpZmYgc3RhdHMgd2hlbiBkaWZmIHBhcnRzIGV4aXN0IGJ1dCBoYXZlIG5vIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKkVkaXRpbmcgZmlsZXMqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KHRydWUpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdHRydWVcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IGRpZmZFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElDaGF0Q29udGVudFBhcnREaWZmRGF0YT4oKSk7XG5cblx0XHRcdHBhcnQuYXBwZW5kSXRlbShcblx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogJCgnZGl2LnRlc3QtZWRpdC1waWxsJykgfSksXG5cdFx0XHRcdCdlZGl0LXBhcnQtMScsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRkaWZmRW1pdHRlci5ldmVudFxuXHRcdFx0KTtcblxuXHRcdFx0cGFydC5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cdFx0XHRkaWZmRW1pdHRlci5maXJlKGNyZWF0ZURpZmZEYXRhKDAsIDApKTtcblxuXHRcdFx0Y29uc3QgYWRkZWRFbCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubGFiZWwtYWRkZWQnKTtcblx0XHRcdGNvbnN0IHJlbW92ZWRFbCA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcubGFiZWwtcmVtb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZGVkRWwsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZWRFbCwgbnVsbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBkaWZmIHN0YXRzIGluIGFyaWEtbGFiZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKkVkaXRpbmcgZmlsZXMqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KHRydWUpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdHRydWVcblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IGRpZmZFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElDaGF0Q29udGVudFBhcnREaWZmRGF0YT4oKSk7XG5cblx0XHRcdHBhcnQuYXBwZW5kSXRlbShcblx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogJCgnZGl2LnRlc3QtZWRpdC1waWxsJykgfSksXG5cdFx0XHRcdCdlZGl0LXBhcnQtMScsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRkaWZmRW1pdHRlci5ldmVudFxuXHRcdFx0KTtcblxuXHRcdFx0cGFydC5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cdFx0XHRkaWZmRW1pdHRlci5maXJlKGNyZWF0ZURpZmZEYXRhKDcsIDIpKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uPy5hcmlhTGFiZWw/LmluY2x1ZGVzKCc3JyksICdhcmlhLWxhYmVsIHNob3VsZCBpbmNsdWRlIGFkZGVkIGNvdW50Jyk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uPy5hcmlhTGFiZWw/LmluY2x1ZGVzKCcyJyksICdhcmlhLWxhYmVsIHNob3VsZCBpbmNsdWRlIHJlbW92ZWQgY291bnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3Qgc2hvdyBkaWZmIHN0YXRzIHdoZW4gbm8gZGlmZiBldmVudHMgZmlyZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKkFuYWx5emluZyBjb2RlKionKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSkpO1xuXG5cdFx0XHRwYXJ0LmZpbmFsaXplVGl0bGVJZkRlZmF1bHQoKTtcblxuXHRcdFx0Y29uc3QgZGlmZkNvbnRhaW5lciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC10aGlua2luZy10aXRsZS1kaWZmJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZkNvbnRhaW5lciwgbnVsbCwgJ1Nob3VsZCBub3QgcmVuZGVyIGRpZmYgY29udGFpbmVyIHdoZW4gbm8gZGlmZnMgZXhpc3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29wZW5zIGVhY2ggZmlsZSBmcm9tIGl0cyBmaXJzdCBvcmlnaW5hbCB0byBpdHMgbGFzdCBtb2RpZmllZCBzbmFwc2hvdCcsICgpID0+IHtcblx0XHRcdGxldCBvcGVuZWQ6IHVua25vd247XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlbkVkaXRvciguLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRcdG9wZW5lZCA9IGFyZ3NbMF07XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSgpKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNyZWF0ZVRoaW5raW5nUGFydCgnKipFZGl0aW5nIGZpbGVzKionKSxcblx0XHRcdFx0Y3JlYXRlTW9ja1JlbmRlckNvbnRleHQodHJ1ZSksXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpKTtcblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Y29uc3QgZmlyc3RBcHBFZGl0ID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElDaGF0Q29udGVudFBhcnREaWZmRGF0YT4oKSk7XG5cdFx0XHRjb25zdCB1dGlsRWRpdCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQ2hhdENvbnRlbnRQYXJ0RGlmZkRhdGE+KCkpO1xuXHRcdFx0Y29uc3QgbGFzdEFwcEVkaXQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUNoYXRDb250ZW50UGFydERpZmZEYXRhPigpKTtcblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiAoeyBkb21Ob2RlOiAkKCdkaXYnKSB9KSwgJ2FwcC1lZGl0LTEnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmlyc3RBcHBFZGl0LmV2ZW50KTtcblx0XHRcdHBhcnQuYXBwZW5kSXRlbSgoKSA9PiAoeyBkb21Ob2RlOiAkKCdkaXYnKSB9KSwgJ3V0aWwtZWRpdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1dGlsRWRpdC5ldmVudCk7XG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oKCkgPT4gKHsgZG9tTm9kZTogJCgnZGl2JykgfSksICdhcHAtZWRpdC0yJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGxhc3RBcHBFZGl0LmV2ZW50KTtcblx0XHRcdHBhcnQuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXG5cdFx0XHRsYXN0QXBwRWRpdC5maXJlKGNyZWF0ZURpZmZEYXRhKDQsIDEsICdhcHAudHMnLCAnbGFzdCcpKTtcblx0XHRcdHV0aWxFZGl0LmZpcmUoY3JlYXRlRGlmZkRhdGEoMiwgMywgJ3V0aWwudHMnLCAnb25seScpKTtcblx0XHRcdGZpcnN0QXBwRWRpdC5maXJlKGNyZWF0ZURpZmZEYXRhKDUsIDAsICdhcHAudHMnLCAnZmlyc3QnKSk7XG5cblx0XHRcdHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtdGhpbmtpbmctdGl0bGUtZGlmZicpPy5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQub2soaXNSZXNvdXJjZU11bHRpRGlmZkVkaXRvcklucHV0KG9wZW5lZCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxhYmVsOiBvcGVuZWQubGFiZWwsXG5cdFx0XHRcdHJlc291cmNlczogb3BlbmVkLnJlc291cmNlcz8ubWFwKHJlc291cmNlID0+ICh7XG5cdFx0XHRcdFx0b3JpZ2luYWw6IHJlc291cmNlLm9yaWdpbmFsLnJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0XHRcdG1vZGlmaWVkOiByZXNvdXJjZS5tb2RpZmllZC5yZXNvdXJjZT8udG9TdHJpbmcoKSxcblx0XHRcdFx0XHRnb1RvRmlsZVJlc291cmNlOiByZXNvdXJjZS5nb1RvRmlsZVJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0XHR9KSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiAnU2VjdGlvbiBGaWxlIENoYW5nZXMnLFxuXHRcdFx0XHRyZXNvdXJjZXM6IFt7XG5cdFx0XHRcdFx0b3JpZ2luYWw6ICdmaWxlOi8vL3NuYXBzaG90cy9maXJzdC9iZWZvcmUvYXBwLnRzJyxcblx0XHRcdFx0XHRtb2RpZmllZDogJ2ZpbGU6Ly8vc25hcHNob3RzL2xhc3QvYWZ0ZXIvYXBwLnRzJyxcblx0XHRcdFx0XHRnb1RvRmlsZVJlc291cmNlOiAnZmlsZTovLy93b3Jrc3BhY2UvYXBwLnRzJyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdG9yaWdpbmFsOiAnZmlsZTovLy9zbmFwc2hvdHMvb25seS9iZWZvcmUvdXRpbC50cycsXG5cdFx0XHRcdFx0bW9kaWZpZWQ6ICdmaWxlOi8vL3NuYXBzaG90cy9vbmx5L2FmdGVyL3V0aWwudHMnLFxuXHRcdFx0XHRcdGdvVG9GaWxlUmVzb3VyY2U6ICdmaWxlOi8vL3dvcmtzcGFjZS91dGlsLnRzJyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZUVkaXRQaWxsQnlQYXJ0SWQgY2xlYW5zIHVwIGxhenkgaXRlbSBhbmQgZGlmZiBzdGF0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqRWRpdGluZyBmaWxlcyoqJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQodHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRtb2NrTWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdFx0Y29uc3QgZGlmZkVtaXR0ZXIxID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElDaGF0Q29udGVudFBhcnREaWZmRGF0YT4oKSk7XG5cdFx0XHRjb25zdCBkaWZmRW1pdHRlcjIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUNoYXRDb250ZW50UGFydERpZmZEYXRhPigpKTtcblxuXHRcdFx0Ly8gQXBwZW5kIHR3byBlZGl0IHBpbGxzXG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oXG5cdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LWVkaXQtcGlsbC0xJykgfSksXG5cdFx0XHRcdCdlZGl0LXBhcnQtMScsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRkaWZmRW1pdHRlcjEuZXZlbnRcblx0XHRcdCk7XG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oXG5cdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LWVkaXQtcGlsbC0yJykgfSksXG5cdFx0XHRcdCdlZGl0LXBhcnQtMicsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRkaWZmRW1pdHRlcjIuZXZlbnRcblx0XHRcdCk7XG5cblx0XHRcdHBhcnQuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXG5cdFx0XHQvLyBGaXJlIGRpZmYgZXZlbnRzIGZvciBib3RoXG5cdFx0XHRkaWZmRW1pdHRlcjEuZmlyZShjcmVhdGVEaWZmRGF0YSg1LCAyLCAnZmlyc3QudHMnKSk7XG5cdFx0XHRkaWZmRW1pdHRlcjIuZmlyZShjcmVhdGVEaWZmRGF0YSg4LCAxLCAnc2Vjb25kLnRzJykpO1xuXG5cdFx0XHQvLyBSZW1vdmUgdGhlIGZpcnN0IGVkaXQgcGlsbFxuXHRcdFx0cGFydC5yZW1vdmVFZGl0UGlsbEJ5UGFydElkKCdlZGl0LXBhcnQtMScpO1xuXG5cdFx0XHQvLyBBZ2dyZWdhdGVkIGRpZmYgc2hvdWxkIG9ubHkgcmVmbGVjdCB0aGUgc2Vjb25kIHBpbGwgbm93XG5cdFx0XHRjb25zdCBhZGRlZEVsID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5sYWJlbC1hZGRlZCcpO1xuXHRcdFx0Y29uc3QgcmVtb3ZlZEVsID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5sYWJlbC1yZW1vdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkZWRFbD8udGV4dENvbnRlbnQsICcrOCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZWRFbD8udGV4dENvbnRlbnQsICctMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZWFnZXJEaXNwb3NhYmxlIGxpZmVjeWNsZScsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRtb2NrQ29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuYWdlbnQudGhpbmtpbmdTdHlsZScsIFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VhZ2VyRGlzcG9zYWJsZSBpcyBkaXNwb3NlZCB3aGVuIHRoaW5raW5nIHBhcnQgaXMgZGlzcG9zZWQgZXZlbiBpZiBmYWN0b3J5IHdhcyBuZXZlciBjYWxsZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKicpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblxuXHRcdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBlYWdlckRpc3Bvc2FibGUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZCA9IHRydWU7IH0pO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+ICh7XG5cdFx0XHRcdGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LWl0ZW0nKSxcblx0XHRcdFx0ZGlzcG9zYWJsZTogZWFnZXJEaXNwb3NhYmxlLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFwcGVuZCB3aGlsZSBjb2xsYXBzZWQgXHUyMDE0IGZhY3RvcnkgaXMgTk9UIGNhbGxlZFxuXHRcdFx0cGFydC5hcHBlbmRJdGVtKGZhY3RvcnksICd0ZXN0LXRvb2wnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBlYWdlckRpc3Bvc2FibGUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWQsIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBkaXNwb3NlZCB5ZXQnKTtcblxuXHRcdFx0Ly8gRGlzcG9zZSB0aGUgdGhpbmtpbmcgcGFydCB3aXRob3V0IGV2ZXIgZXhwYW5kaW5nXG5cdFx0XHRwYXJ0LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHRwYXJ0LmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkLCB0cnVlLCAnZWFnZXJEaXNwb3NhYmxlIHNob3VsZCBiZSBkaXNwb3NlZCB3aXRoIHRoZSB0aGlua2luZyBwYXJ0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlYWdlckRpc3Bvc2FibGUgaXMgZGlzcG9zZWQgd2hlbiB0aGlua2luZyBwYXJ0IGlzIGRpc3Bvc2VkIGFmdGVyIGZhY3Rvcnkgd2FzIGNhbGxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjcmVhdGVUaGlua2luZ1BhcnQoJyoqV29ya2luZyoqXFxuU29tZSBkZXRhaWxlZCBhbmFseXNpcycpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGhpbmtpbmdDb250ZW50UGFydCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblxuXHRcdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBlYWdlckRpc3Bvc2FibGUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZCA9IHRydWU7IH0pO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+ICh7XG5cdFx0XHRcdGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LWl0ZW0nKSxcblx0XHRcdFx0ZGlzcG9zYWJsZTogZWFnZXJEaXNwb3NhYmxlLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEFwcGVuZCB3aGlsZSBjb2xsYXBzZWRcblx0XHRcdHBhcnQuYXBwZW5kSXRlbShmYWN0b3J5LCAndGVzdC10b29sJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZWFnZXJEaXNwb3NhYmxlKTtcblxuXHRcdFx0Ly8gRXhwYW5kIHRvIHRyaWdnZXIgZmFjdG9yeSBjYWxsXG5cdFx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24nKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGJ1dHRvbj8uY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkLCBmYWxzZSwgJ1Nob3VsZCBub3QgYmUgZGlzcG9zZWQgeWV0Jyk7XG5cblx0XHRcdC8vIERpc3Bvc2Vcblx0XHRcdHBhcnQuZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdHBhcnQuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWQsIHRydWUsICdlYWdlckRpc3Bvc2FibGUgc2hvdWxkIGJlIGRpc3Bvc2VkIGV2ZW4gYWZ0ZXIgYmVpbmcgbWF0ZXJpYWxpemVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBlbmRJdGVtIHdpdGhvdXQgZWFnZXJEaXNwb3NhYmxlIGRpc3Bvc2VzIGZhY3RvcnkgcmVzdWx0IG9uIHRoaW5raW5nIHBhcnQgZGlzcG9zYWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY3JlYXRlVGhpbmtpbmdQYXJ0KCcqKldvcmtpbmcqKlxcblNvbWUgZGV0YWlsZWQgYW5hbHlzaXMnKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdG1vY2tNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG5cblx0XHRcdC8vIEV4cGFuZCBmaXJzdCBzbyBmYWN0b3J5IGlzIGNhbGxlZCBpbW1lZGlhdGVseVxuXHRcdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+ICh7XG5cdFx0XHRcdGRvbU5vZGU6ICQoJ2Rpdi50ZXN0LWl0ZW0nKSxcblx0XHRcdFx0ZGlzcG9zYWJsZTogdG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWQgPSB0cnVlOyB9KSxcblx0XHRcdH0pO1xuXG5cdFx0XHRwYXJ0LmFwcGVuZEl0ZW0oZmFjdG9yeSwgJ3Rlc3QtdG9vbCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWQsIGZhbHNlLCAnU2hvdWxkIG5vdCBiZSBkaXNwb3NlZCB5ZXQnKTtcblxuXHRcdFx0cGFydC5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0cGFydC5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZCwgdHJ1ZSwgJ0ZhY3RvcnkgZGlzcG9zYWJsZSBzaG91bGQgYmUgZGlzcG9zZWQgd2l0aCB0aGlua2luZyBwYXJ0Jyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlB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
