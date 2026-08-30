import assert from "assert";
import { isHTMLElement } from "../../../../../../../base/browser/dom.js";
import { ActionViewItem } from "../../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Action } from "../../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { upcastPartial } from "../../../../../../../base/test/common/mock.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { TestMenuService, workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { IChatWidgetService } from "../../../../browser/chat.js";
import { ChatCollapsibleContentPart } from "../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js";
import { ChatSubagentContentPart } from "../../../../browser/widget/chatContentParts/chatSubagentContentPart.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { IChatMarkdownAnchorService } from "../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js";
import { isMarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { AccessibilityWorkbenchSettingId } from "../../../../../accessibility/browser/accessibilityConfiguration.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { RunSubagentTool } from "../../../../common/tools/builtinTools/runSubagentTool.js";
import { ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { IAccessibilityService } from "../../../../../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { IActionViewItemService } from "../../../../../../../platform/actions/browser/actionViewItemService.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, ChatConfiguration } from "../../../../common/constants.js";
import { formatCompactSubagentDuration, getSubagentEditorResource, OpenSubagentChatActionViewItem, shouldAnimateSubagentToolTransition } from "../../../../browser/widget/chatContentParts/chatSubagentOpenChat.js";
class TestOpenChatActionViewItem extends ActionViewItem {
  constructor(sourceAction, options) {
    super(void 0, new Action(sourceAction.id, sourceAction.label, sourceAction.class, true, (context) => sourceAction.run(context)), options);
    if (this.action instanceof Action) {
      this._register(this.action);
    }
  }
}
class TestActionViewItemService {
  constructor() {
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._providerAvailable = true;
  }
  get hasChangeListeners() {
    return this._onDidChange.hasListeners();
  }
  setProviderAvailable(available) {
    this._providerAvailable = available;
  }
  fireDidChange(menuId) {
    this._onDidChange.fire(menuId);
  }
  register(_menu, _commandId, _provider) {
    return { dispose: () => {
    } };
  }
  lookUp(menu, commandId) {
    if (!this._providerAvailable || menu !== MenuId.ChatSubagentContent || commandId !== CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID) {
      return void 0;
    }
    return (action, options) => new TestOpenChatActionViewItem(action, options);
  }
}
class TestSubagentMenuService extends TestMenuService {
  constructor(openChatAction) {
    super();
    this.openChatAction = openChatAction;
    this.createMenuCalls = 0;
    this.getMenuActionsCalls = 0;
  }
  createMenu(id, contextKeyService) {
    this.createMenuCalls++;
    return super.createMenu(id, contextKeyService);
  }
  getMenuActions(id, contextKeyService, options) {
    this.getMenuActionsCalls++;
    if (id === MenuId.ChatSubagentContent) {
      return [["navigation", [this.openChatAction]]];
    }
    return super.getMenuActions(id, contextKeyService, options);
  }
}
suite("ChatSubagentContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let mockMarkdownRenderer;
  let mockAnchorService;
  let mockHoverService;
  let mockListPool;
  let mockEditorPool;
  let announcedToolProgressKeys;
  let actionViewItemService;
  let menuService;
  let markdownRenderCount;
  function createMockRenderContext(isComplete = false, sessionResource = URI.parse("chat-session://test/session1")) {
    const mockElement = {
      isComplete,
      id: "test-response-id",
      sessionResource,
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
  function createState(stateType, parameters) {
    switch (stateType) {
      case IChatToolInvocation.StateKind.Streaming:
        return {
          type: IChatToolInvocation.StateKind.Streaming,
          partialInput: observableValue("partialInput", {}),
          streamingMessage: observableValue("streamingMessage", void 0)
        };
      case IChatToolInvocation.StateKind.Completed:
        return {
          type: IChatToolInvocation.StateKind.Completed,
          parameters,
          confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          resultDetails: void 0,
          postConfirmed: void 0,
          contentForModel: [{ kind: "text", value: "test result" }]
        };
      case IChatToolInvocation.StateKind.Executing:
        return {
          type: IChatToolInvocation.StateKind.Executing,
          parameters,
          confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          progress: observableValue("progress", { message: void 0, progress: void 0 })
        };
      case IChatToolInvocation.StateKind.WaitingForAuthentication:
        return {
          type: IChatToolInvocation.StateKind.WaitingForAuthentication,
          parameters,
          confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          server: {
            id: "server",
            name: "MCP server",
            resource: "https://mcp.example.com"
          },
          cancel: () => {
          }
        };
      case IChatToolInvocation.StateKind.WaitingForConfirmation:
        return {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters,
          confirmationMessages: {
            title: "Confirm action",
            message: "Are you sure you want to proceed?"
          },
          confirm: () => {
          }
        };
      case IChatToolInvocation.StateKind.WaitingForPostApproval:
        return {
          type: IChatToolInvocation.StateKind.WaitingForPostApproval,
          parameters,
          confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          resultDetails: void 0,
          contentForModel: [{ kind: "text", value: "test result" }],
          confirm: () => {
          }
        };
      case IChatToolInvocation.StateKind.Cancelled:
        return {
          type: IChatToolInvocation.StateKind.Cancelled,
          parameters,
          reason: ToolConfirmKind.Denied
        };
    }
  }
  function createMockToolInvocation(options = {}) {
    const stateType = options.stateType ?? IChatToolInvocation.StateKind.Streaming;
    const stateValue = createState(stateType, options.parameters);
    const toolCallId = options.toolCallId ?? "tool-call-" + Math.random().toString(36).substring(7);
    const toolInvocation = {
      presentation: void 0,
      toolSpecificData: options.toolSpecificData ?? {
        kind: "subagent",
        description: "Test subagent description",
        agentName: "TestAgent",
        prompt: "Test prompt"
      },
      originMessage: void 0,
      invocationMessage: options.invocationMessage ?? "Running subagent",
      pastTenseMessage: void 0,
      source: ToolDataSource.Internal,
      toolId: options.toolId ?? RunSubagentTool.Id,
      toolCallId,
      subAgentInvocationId: options.subAgentInvocationId,
      state: observableValue("state", stateValue),
      toolSpecificDataKind: observableValue("test", (options.toolSpecificData ?? { kind: "subagent" }).kind),
      isAttachedToThinking: false,
      kind: "toolInvocation",
      toJSON: () => createMockSerializedToolInvocation({
        toolId: options.toolId ?? RunSubagentTool.Id,
        subAgentInvocationId: options.subAgentInvocationId,
        toolSpecificData: options.toolSpecificData,
        isComplete: stateType === IChatToolInvocation.StateKind.Completed
      })
    };
    return toolInvocation;
  }
  function createMockSerializedToolInvocation(options = {}) {
    return {
      presentation: void 0,
      toolSpecificData: options.toolSpecificData ?? {
        kind: "subagent",
        description: "Test subagent description",
        agentName: "TestAgent",
        prompt: "Test prompt",
        result: "Test result text"
      },
      originMessage: void 0,
      invocationMessage: "Running subagent",
      pastTenseMessage: void 0,
      resultDetails: void 0,
      isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      isComplete: options.isComplete ?? true,
      toolCallId: options.subAgentInvocationId ?? "test-tool-call-id",
      toolId: options.toolId ?? RunSubagentTool.Id,
      source: ToolDataSource.Internal,
      subAgentInvocationId: options.subAgentInvocationId,
      kind: "toolInvocationSerialized"
    };
  }
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, store);
    markdownRenderCount = 0;
    mockMarkdownRenderer = {
      render: (_markdown, _options, outElement) => {
        markdownRenderCount++;
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
      register: () => ({ dispose: () => {
      } }),
      lastFocusedAnchor: void 0
    };
    instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);
    mockHoverService = {
      _serviceBrand: void 0,
      showDelayedHover: () => void 0,
      setupDelayedHover: () => ({ dispose: () => {
      } }),
      setupDelayedHoverAtMouse: () => ({ dispose: () => {
      } }),
      showInstantHover: () => void 0,
      hideHover: () => {
      },
      showAndFocusLastHover: () => {
      },
      setupManagedHover: () => ({ dispose: () => {
      }, show: () => {
      }, hide: () => {
      }, update: () => {
      } }),
      showManagedHover: () => {
      }
    };
    instantiationService.stub(IHoverService, mockHoverService);
    instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
      isMotionReduced() {
        return false;
      }
    }());
    actionViewItemService = new TestActionViewItemService();
    instantiationService.stub(IActionViewItemService, actionViewItemService);
    menuService = new TestSubagentMenuService(new MenuItemAction(
      { id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: "Open Subagent" },
      void 0,
      { shouldForwardArgs: true },
      void 0,
      void 0,
      instantiationService.get(IContextKeyService),
      instantiationService.get(ICommandService)
    ));
    instantiationService.stub(IMenuService, menuService);
    instantiationService.get(IConfigurationService).setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, true);
    mockListPool = {};
    mockEditorPool = {};
    announcedToolProgressKeys = /* @__PURE__ */ new Set();
  });
  teardown(() => {
    disposables.dispose();
  });
  function createPart(toolInvocation, context, idOverride) {
    const part = store.add(instantiationService.createInstance(
      ChatSubagentContentPart,
      idOverride ?? toolInvocation.subAgentInvocationId ?? toolInvocation.toolCallId,
      toolInvocation,
      context,
      mockMarkdownRenderer,
      mockListPool,
      mockEditorPool,
      () => 500,
      announcedToolProgressKeys
    ));
    mainWindow.document.body.appendChild(part.domNode);
    disposables.add({ dispose: () => part.domNode.remove() });
    return part;
  }
  function getCollapseButton(part) {
    const button = part.domNode.querySelector(".chat-used-context-label > .monaco-button");
    return isHTMLElement(button) ? button : void 0;
  }
  function getCollapseButtonLabel(button) {
    const label = button.querySelector(".monaco-button-mdlabel");
    return isHTMLElement(label) ? label : void 0;
  }
  function getCollapseButtonIcon(button) {
    const icon = button.firstElementChild;
    return isHTMLElement(icon) ? icon : void 0;
  }
  function getWrapperElement(part) {
    const wrapper = part.domNode.querySelector(".chat-thinking-collapsible");
    return isHTMLElement(wrapper) ? wrapper : void 0;
  }
  function getOpenChatContext(part) {
    return part._openChatToolbar?.actionBar?.context;
  }
  function setOpenChatOnlyMode(part, enabled) {
    const toolbar = part._openChatToolbar;
    assert.ok(toolbar);
    const action = store.add(new Action("openSubagent", "Open Subagent", "", enabled));
    toolbar.getItemsLength = () => 1;
    toolbar.getItemAction = () => action;
    part._updateOpenChatOnlyMode();
  }
  suite("Basic rendering", () => {
    test("should create subagent part with correct classes", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-thinking-box"), "Should have chat-thinking-box class");
      assert.ok(part.domNode.classList.contains("chat-subagent-part"), "Should have chat-subagent-part class");
      assert.ok(part.domNode.classList.contains("chat-thinking-fixed-mode"), "Should have chat-thinking-fixed-mode class");
      assert.ok(part.domNode.classList.contains("chat-collapsible-content-animatable"), "Should prepare expandable content for animation");
      assert.strictEqual(part.domNode.classList.contains("chat-collapsible-content-animated"), false, "Should preserve the collapsed streaming preview at rest");
    });
    test("should render the open-chat toolbar beside the collapse button", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const header = part.domNode.querySelector(".chat-used-context-label");
      const toolbar = header?.querySelector(".chat-subagent-open-chat-toolbar");
      const collapseButton = getCollapseButton(part);
      assert.deepStrictEqual({
        hasChatClass: part.domNode.classList.contains("chat-subagent-has-chat"),
        toolbarParentIsHeader: toolbar?.parentElement === header,
        toolbarPrecedesCollapseButton: toolbar?.nextElementSibling === collapseButton
      }, {
        hasChatClass: true,
        toolbarParentIsHeader: true,
        toolbarPrecedesCollapseButton: true
      });
    });
    test("should preserve inline rendering when rich subagent rendering is disabled", () => {
      const configService = instantiationService.get(IConfigurationService);
      configService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, false);
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      assert.deepStrictEqual({
        hasChatClass: part.domNode.classList.contains("chat-subagent-has-chat"),
        hasToolbar: !!part.domNode.querySelector(".chat-subagent-open-chat-toolbar"),
        collapseButtonVisible: getCollapseButton(part)?.style.display !== "none"
      }, {
        hasChatClass: false,
        hasToolbar: false,
        collapseButtonVisible: true
      });
    });
    test("should derive the editor resource from the parent session and subagent chat id", () => {
      const resource = getSubagentEditorResource({
        chatResource: "ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call",
        parentSessionResource: "agent-host-copilotcli:/session"
      });
      assert.deepStrictEqual(resource && {
        scheme: resource.scheme,
        path: resource.path,
        fragment: resource.fragment,
        chatResource: new URLSearchParams(resource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM)
      }, {
        scheme: "agent-host-copilotcli",
        path: "/session",
        fragment: "subagent/tool-call",
        chatResource: "ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call"
      });
    });
    test("should show compact elapsed time without worked-for copy", () => {
      assert.deepStrictEqual({
        running: formatCompactSubagentDuration(1e3, void 0, 66e3),
        completed: formatCompactSubagentDuration(1e3, 65e3)
      }, {
        running: "1m 5s",
        completed: "1m 5s"
      });
    });
    test("should animate only when the active tool call changes", () => {
      assert.deepStrictEqual({
        workingToWorking: shouldAnimateSubagentToolTransition(void 0, false, void 0, false),
        workingToTool: shouldAnimateSubagentToolTransition(void 0, false, "tool-1", true),
        sameTool: shouldAnimateSubagentToolTransition("tool-1", true, "tool-1", true),
        differentTool: shouldAnimateSubagentToolTransition("tool-1", true, "tool-2", true),
        toolToWorking: shouldAnimateSubagentToolTransition("tool-1", true, void 0, false)
      }, {
        workingToWorking: false,
        workingToTool: true,
        sameTool: false,
        differentTool: true,
        toolToWorking: true
      });
    });
    test("should settle a queued same-tool label update without starting another transition", () => {
      const action = store.add(new Action("openSubagent", "Open Subagent"));
      const viewItem = store.add(instantiationService.createInstance(
        OpenSubagentChatActionViewItem,
        void 0,
        action,
        {},
        false
      ));
      viewItem.render(mainWindow.document.createElement("div"));
      const internals = viewItem;
      internals._displayedToolCallId = "tool-1";
      internals._displayedToolLabel = "Read";
      internals._targetToolCallId = "tool-1";
      internals._targetToolLabel = "Reading package.json";
      internals._toolTransitionPhase = "idle";
      internals._runToolTransition();
      assert.deepStrictEqual({
        displayedLabel: internals._displayedToolLabel,
        transitionPhase: internals._toolTransitionPhase
      }, {
        displayedLabel: "Reading package.json",
        transitionPhase: "idle"
      });
    });
    test("should reserve an activity row before the first tool call", () => {
      const action = store.add(new Action("openSubagent", "Open Subagent"));
      const viewItem = store.add(instantiationService.createInstance(
        OpenSubagentChatActionViewItem,
        {
          chatResource: "ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call",
          parentSessionResource: "agent-host-copilotcli:/session",
          isActive: true
        },
        action,
        {},
        false
      ));
      const container = mainWindow.document.createElement("div");
      viewItem.render(container);
      const activity = container.querySelector(".chat-subagent-pill-active-tool");
      assert.deepStrictEqual({
        hidden: activity?.classList.contains("hidden"),
        label: activity?.querySelector(".chat-subagent-pill-active-tool-label")?.textContent,
        hasWorkingIcon: activity?.querySelector(".chat-subagent-pill-active-tool-icon")?.classList.contains("codicon-comment"),
        ariaLabel: container.getAttribute("aria-label")
      }, {
        hidden: false,
        label: "Working on it...",
        hasWorkingIcon: true,
        ariaLabel: "Open Subagent. Subagent is working"
      });
    });
    test("should sanitize agent-provided markdown in active tool labels", () => {
      const action = store.add(new Action("openSubagent", "Open Subagent"));
      const viewItem = store.add(instantiationService.createInstance(
        OpenSubagentChatActionViewItem,
        {
          chatResource: "ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call",
          parentSessionResource: "agent-host-copilotcli:/session",
          isActive: true,
          activeToolCallId: "tool-1",
          activeToolLabel: "![remote](https://example.com/image.png)",
          activeToolIcon: Codicon.search
        },
        action,
        {},
        false
      ));
      const container = mainWindow.document.createElement("div");
      viewItem.render(container);
      assert.strictEqual(container.querySelectorAll(".chat-subagent-pill-active-tool-label img").length, 0);
    });
    test("should transition between generic and tool activity semantics", () => {
      const baseContext = {
        chatResource: "ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call",
        parentSessionResource: "agent-host-copilotcli:/session",
        isActive: true
      };
      const action = store.add(new Action("openSubagent", "Open Subagent"));
      const viewItem = store.add(instantiationService.createInstance(
        OpenSubagentChatActionViewItem,
        baseContext,
        action,
        {},
        false
      ));
      const container = mainWindow.document.createElement("div");
      viewItem.render(container);
      const internals = viewItem;
      viewItem.setActionContext({
        ...baseContext,
        activeToolCallId: "tool-1",
        activeToolLabel: "Search Tools",
        activeToolIcon: Codicon.search
      });
      internals._finishToolTransition();
      const toolState = {
        label: container.querySelector(".chat-subagent-pill-active-tool-label")?.textContent,
        ariaLabel: container.getAttribute("aria-label")
      };
      viewItem.setActionContext(baseContext);
      internals._finishToolTransition();
      assert.deepStrictEqual({
        toolState,
        workingLabel: container.querySelector(".chat-subagent-pill-active-tool-label")?.textContent,
        workingAriaLabel: container.getAttribute("aria-label")
      }, {
        toolState: {
          label: "Search Tools",
          ariaLabel: "Open Subagent. Subagent is working. Active tool Search Tools"
        },
        workingLabel: "Working on it...",
        workingAriaLabel: "Open Subagent. Subagent is working"
      });
    });
    test("should open the subagent chat directly in an editor", async () => {
      let openedResource;
      instantiationService.stub(IChatWidgetService, upcastPartial({
        openSession: async (resource) => {
          openedResource = resource;
          return void 0;
        }
      }));
      const action = store.add(new Action("openSubagent", "Open Subagent"));
      const viewItem = store.add(instantiationService.createInstance(
        OpenSubagentChatActionViewItem,
        {
          chatResource: "ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call",
          parentSessionResource: "agent-host-copilotcli:/session",
          title: "Review correctness risks"
        },
        action,
        {},
        true
      ));
      await viewItem.action.run({
        chatResource: "ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call",
        parentSessionResource: "agent-host-copilotcli:/session",
        title: "Review correctness risks"
      });
      assert.deepStrictEqual(openedResource && {
        scheme: openedResource.scheme,
        path: openedResource.path,
        fragment: openedResource.fragment
      }, {
        scheme: "agent-host-copilotcli",
        path: "/session",
        fragment: "subagent/tool-call"
      });
    });
    test("should trigger pointer activation only from the bordered pill", () => {
      let runCount = 0;
      const action = store.add(new Action("openSubagent", "Open Subagent", void 0, true, () => {
        runCount++;
      }));
      const viewItem = store.add(instantiationService.createInstance(
        OpenSubagentChatActionViewItem,
        {
          chatResource: "ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/tool-call",
          parentSessionResource: "agent-host-copilotcli:/session"
        },
        action,
        {},
        false
      ));
      const container = mainWindow.document.createElement("div");
      viewItem.render(container);
      const activeTool = container.querySelector(".chat-subagent-pill-active-tool");
      const pill = container.querySelector(".chat-subagent-pill-content");
      assert.ok(activeTool);
      assert.ok(pill);
      activeTool.dispatchEvent(new mainWindow.MouseEvent("click", { bubbles: true }));
      const outsideRunCount = runCount;
      pill.dispatchEvent(new mainWindow.MouseEvent("click", { bubbles: true }));
      assert.deepStrictEqual({
        outsideRunCount,
        pillRunCount: runCount
      }, {
        outsideRunCount: 0,
        pillRunCount: 1
      });
    });
    test("should use a menu snapshot without persistent menu or action-view listeners", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      assert.deepStrictEqual({
        hasToolbar: !!part._openChatToolbar,
        createMenuCalls: menuService.createMenuCalls,
        getMenuActionsCalls: menuService.getMenuActionsCalls,
        hasActionViewListeners: actionViewItemService.hasChangeListeners
      }, {
        hasToolbar: true,
        createMenuCalls: 0,
        getMenuActionsCalls: 1,
        hasActionViewListeners: false
      });
    });
    test("should hide the complete collapsible surface when the open-chat action is available", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      setOpenChatOnlyMode(part, true);
      const collapseButton = getCollapseButton(part);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      assert.ok(collapseButton);
      assert.ok(animationContainer);
      assert.deepStrictEqual({
        openChatOnlyClass: part.domNode.classList.contains("chat-subagent-open-chat-only"),
        collapseButtonDisplay: collapseButton.style.display,
        animationDisplay: animationContainer.style.display
      }, {
        openChatOnlyClass: true,
        collapseButtonDisplay: "none",
        animationDisplay: "none"
      });
    });
    test("should hydrate open-chat-only mode when the action view registers after rendering", () => {
      actionViewItemService.setProviderAvailable(false);
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const listeningBeforeRegistration = actionViewItemService.hasChangeListeners;
      actionViewItemService.setProviderAvailable(true);
      actionViewItemService.fireDidChange(MenuId.ChatSubagentContent);
      const collapseButton = getCollapseButton(part);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      assert.deepStrictEqual({
        listeningBeforeRegistration,
        listeningAfterRegistration: actionViewItemService.hasChangeListeners,
        openChatOnlyClass: part.domNode.classList.contains("chat-subagent-open-chat-only"),
        collapseButtonDisplay: collapseButton?.style.display,
        animationDisplay: animationContainer?.style.display
      }, {
        listeningBeforeRegistration: true,
        listeningAfterRegistration: false,
        openChatOnlyClass: true,
        collapseButtonDisplay: "none",
        animationDisplay: "none"
      });
    });
    test("should reserve the pill presentation while an Agent Host child chat hydrates", () => {
      actionViewItemService.setProviderAvailable(false);
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description"
        }
      }), createMockRenderContext(false, URI.parse("agent-host-copilotcli:/session")));
      const collapseButton = getCollapseButton(part);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      assert.deepStrictEqual({
        hasToolbar: !!part.domNode.querySelector(".chat-subagent-open-chat-toolbar"),
        collapseButtonDisplay: collapseButton?.style.display,
        animationDisplay: animationContainer?.style.display
      }, {
        hasToolbar: false,
        collapseButtonDisplay: "none",
        animationDisplay: "none"
      });
    });
    test("should preserve the collapsible surface when the open-chat action is unavailable", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      setOpenChatOnlyMode(part, false);
      const collapseButton = getCollapseButton(part);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      assert.ok(collapseButton);
      assert.ok(animationContainer);
      assert.deepStrictEqual({
        openChatOnlyClass: part.domNode.classList.contains("chat-subagent-open-chat-only"),
        collapseButtonDisplay: collapseButton.style.display,
        animationDisplay: animationContainer.style.display
      }, {
        openChatOnlyClass: false,
        collapseButtonDisplay: "",
        animationDisplay: ""
      });
    });
    test("should publish the model and newest child tool intent to the open-chat pill", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Test subagent description",
          chatResource: "ahp-chat://subagent/test/tool-call",
          modelName: "Claude Sonnet 4"
        }
      }), createMockRenderContext(false));
      part.trackToolState(createMockToolInvocation({
        toolCallId: "child-tool-1",
        toolId: "search",
        invocationMessage: "  Search\n  the codebase  ",
        stateType: IChatToolInvocation.StateKind.Executing
      }));
      const first = getOpenChatContext(part);
      part.trackToolState(createMockToolInvocation({
        toolCallId: "child-tool-2",
        toolId: "read_file",
        invocationMessage: "Read package.json",
        stateType: IChatToolInvocation.StateKind.Executing
      }));
      const second = getOpenChatContext(part);
      part.markAsInactive();
      assert.deepStrictEqual({
        firstModel: first?.modelName,
        firstToolCallId: first?.activeToolCallId,
        firstTool: first?.activeToolLabel,
        firstToolIcon: first?.activeToolIcon?.id,
        secondTool: second?.activeToolLabel,
        secondToolCallId: second?.activeToolCallId,
        secondToolIcon: second?.activeToolIcon?.id,
        completedTool: getOpenChatContext(part)?.activeToolLabel,
        completedToolIcon: getOpenChatContext(part)?.activeToolIcon
      }, {
        firstModel: "Claude Sonnet 4",
        firstToolCallId: "child-tool-1",
        firstTool: "Search the codebase",
        firstToolIcon: "search",
        secondTool: "Read package.json",
        secondToolCallId: "child-tool-2",
        secondToolIcon: "book",
        completedTool: void 0,
        completedToolIcon: void 0
      });
    });
    test("should retain the most recent child tool after it completes", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const state = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolCallId: "child-tool",
          toolId: "search",
          invocationMessage: "Search the codebase"
        }),
        state
      };
      part.trackToolState(childTool);
      const executing = getOpenChatContext(part);
      state.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      const completed = getOpenChatContext(part);
      assert.deepStrictEqual({
        executingToolCallId: executing?.activeToolCallId,
        executingToolLabel: executing?.activeToolLabel,
        completedToolCallId: completed?.activeToolCallId,
        completedToolLabel: completed?.activeToolLabel
      }, {
        executingToolCallId: "child-tool",
        executingToolLabel: "Search the codebase",
        completedToolCallId: "child-tool",
        completedToolLabel: "Search the codebase"
      });
    });
    test("should restore an older active tool when the newest tool completes first", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const firstState = observableValue("firstState", createState(IChatToolInvocation.StateKind.Executing));
      const secondState = observableValue("secondState", createState(IChatToolInvocation.StateKind.Executing));
      part.trackToolState({
        ...createMockToolInvocation({
          toolCallId: "first-tool",
          toolId: "search",
          invocationMessage: "Search the codebase"
        }),
        state: firstState
      });
      part.trackToolState({
        ...createMockToolInvocation({
          toolCallId: "second-tool",
          toolId: "read_file",
          invocationMessage: "Read package.json"
        }),
        state: secondState
      });
      secondState.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      assert.deepStrictEqual(getOpenChatContext(part) && {
        activeToolCallId: getOpenChatContext(part)?.activeToolCallId,
        activeToolLabel: getOpenChatContext(part)?.activeToolLabel
      }, {
        activeToolCallId: "first-tool",
        activeToolLabel: "Search the codebase"
      });
    });
    test("should show working for markdown and preserve the most recent tool for reasoning", () => {
      const parentData = {
        kind: "subagent",
        chatResource: "ahp-chat://subagent/test/tool-call",
        isActive: true
      };
      const parentState = observableValue("parentState", createState(IChatToolInvocation.StateKind.Executing));
      const parentTool = {
        ...createMockToolInvocation({ toolSpecificData: parentData }),
        state: parentState
      };
      const part = createPart(parentTool, createMockRenderContext(false));
      const childState = observableValue("childState", createState(IChatToolInvocation.StateKind.Executing));
      part.trackToolState({
        ...createMockToolInvocation({
          toolCallId: "child-tool",
          toolId: "search",
          invocationMessage: "Search the codebase"
        }),
        state: childState
      });
      childState.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      const afterTool = getOpenChatContext(part);
      parentData.activity = "reasoning";
      parentState.set({ ...parentState.get() }, void 0);
      const duringReasoning = getOpenChatContext(part);
      parentData.activity = "markdown";
      parentState.set({ ...parentState.get() }, void 0);
      const duringMarkdown = getOpenChatContext(part);
      assert.deepStrictEqual({
        afterTool: afterTool?.activeToolLabel,
        duringReasoning: duringReasoning?.activeToolLabel,
        duringMarkdown: duringMarkdown?.activeToolLabel
      }, {
        afterTool: "Search the codebase",
        duringReasoning: "Search the codebase",
        duringMarkdown: void 0
      });
    });
    test("should prefer terminal intention over the raw command invocation message", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const terminalTool = createMockToolInvocation({
        toolCallId: "terminal-tool",
        invocationMessage: "Running `grep -rn activeToolLabel src/vs/sessions`",
        stateType: IChatToolInvocation.StateKind.Executing
      });
      terminalTool.toolSpecificData = {
        kind: "terminal",
        commandLine: {
          original: "grep -rn activeToolLabel src/vs/sessions",
          toolEdited: void 0,
          userEdited: void 0
        },
        intention: "Find active tool rendering",
        language: "bash"
      };
      part.trackToolState(terminalTool);
      assert.strictEqual(getOpenChatContext(part)?.activeToolLabel, "Find active tool rendering");
    });
    test("should wait for a provisional tool label to gain invocation detail", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const state = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolCallId: "read-tool",
          toolId: "read_file",
          invocationMessage: "Read"
        }),
        state
      };
      part.trackToolState(childTool);
      const provisional = getOpenChatContext(part)?.activeToolLabel;
      childTool.invocationMessage = "Reading package.json";
      state.set({ ...state.get() }, void 0);
      assert.deepStrictEqual({
        provisional,
        formed: getOpenChatContext(part)?.activeToolLabel
      }, {
        provisional: void 0,
        formed: "Reading package.json"
      });
    });
    test("should keep the previous tool visible until the streaming tool is formed", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      part.trackToolState(createMockToolInvocation({
        toolCallId: "previous-tool",
        toolId: "search",
        invocationMessage: "Searching the workspace",
        stateType: IChatToolInvocation.StateKind.Executing
      }));
      const state = observableValue("state", createState(IChatToolInvocation.StateKind.Streaming));
      const childTool = {
        ...createMockToolInvocation({
          toolCallId: "streaming-tool",
          toolId: "read_file",
          invocationMessage: "Reading package.json"
        }),
        state
      };
      part.trackToolState(childTool);
      const streaming = getOpenChatContext(part);
      state.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.deepStrictEqual({
        streamingToolCallId: streaming?.activeToolCallId,
        streamingLabel: streaming?.activeToolLabel,
        formedToolCallId: getOpenChatContext(part)?.activeToolCallId,
        formedLabel: getOpenChatContext(part)?.activeToolLabel
      }, {
        streamingToolCallId: "previous-tool",
        streamingLabel: "Searching the workspace",
        formedToolCallId: "streaming-tool",
        formedLabel: "Reading package.json"
      });
    });
    test("should keep collapsed animated content out of keyboard navigation", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      const animationContent = part.domNode.querySelector(".chat-collapsible-content-animation-inner");
      const chevron = part.domNode.querySelector(".chat-collapsible-hover-chevron");
      const button = getCollapseButton(part);
      assert.ok(animationContainer);
      assert.ok(animationContent);
      assert.ok(chevron);
      assert.ok(button);
      const collapsedInert = animationContent.inert;
      const collapsedChevronExpanded = chevron.classList.contains("expanded");
      button.click();
      const animationEnabledDuringToggle = part.domNode.classList.contains("chat-collapsible-content-animated");
      const transitionEnd = new mainWindow.Event("transitionend");
      Object.defineProperty(transitionEnd, "propertyName", { value: "grid-template-rows" });
      animationContainer.dispatchEvent(transitionEnd);
      const animationEnabledAfterToggle = part.domNode.classList.contains("chat-collapsible-content-animated");
      animationContent.dispatchEvent(new mainWindow.CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
      assert.deepStrictEqual({
        collapsedInert,
        collapsedChevronExpanded,
        animationEnabledDuringToggle,
        animationEnabledAfterToggle,
        nestedToggleIgnored: !part.domNode.classList.contains("chat-collapsible-content-animated"),
        expandedInert: animationContent.inert,
        expandedChevronExpanded: chevron.classList.contains("expanded")
      }, {
        collapsedInert: true,
        collapsedChevronExpanded: false,
        animationEnabledDuringToggle: true,
        animationEnabledAfterToggle: false,
        nestedToggleIgnored: true,
        expandedInert: false,
        expandedChevronExpanded: true
      });
    });
    test("should restore the streaming preview when an animation is canceled", async () => {
      const part = createPart(createMockToolInvocation(), createMockRenderContext(false));
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      const button = getCollapseButton(part);
      assert.ok(animationContainer);
      assert.ok(button);
      button.click();
      animationContainer.getAnimations = () => [];
      const transitionCancel = new mainWindow.Event("transitioncancel");
      Object.defineProperty(transitionCancel, "propertyName", { value: "grid-template-rows" });
      animationContainer.dispatchEvent(transitionCancel);
      await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
      assert.strictEqual(part.domNode.classList.contains("chat-collapsible-content-animated"), false);
    });
    test("should shimmer for an in-progress subagent even when the response is complete", () => {
      const toolInvocation = createMockToolInvocation({ stateType: IChatToolInvocation.StateKind.Executing });
      const context = createMockRenderContext(true);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.querySelector(".chat-thinking-title-shimmer"));
    });
    test("should not shimmer for a completed subagent while the response is in progress", () => {
      const toolInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.deepStrictEqual({
        isActive: part.getIsActive(),
        hasShimmer: !!part.domNode.querySelector(".chat-thinking-title-shimmer")
      }, {
        isActive: false,
        hasShimmer: false
      });
    });
    test("should shimmer while Agent Host reports an active child chat after tool completion", () => {
      const toolInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          isActive: true,
          description: "Running child chat"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.deepStrictEqual({
        isActive: part.getIsActive(),
        hasShimmer: !!part.domNode.querySelector(".chat-thinking-title-shimmer")
      }, {
        isActive: true,
        hasShimmer: true
      });
    });
    test("should start collapsed", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed by default");
    });
  });
  suite("Title extraction", () => {
    test("should extract title with agent name from toolSpecificData", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Searching the codebase",
          agentName: "CodeSearchAgent",
          prompt: "Search for authentication"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      const buttonText = labelElement?.textContent ?? button.textContent ?? "";
      assert.ok(buttonText.includes("CodeSearchAgent"), "Title should include agent name");
      assert.ok(buttonText.includes("Searching the codebase"), "Title should include description");
    });
    test("should use default prefix when no agent name is provided", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task"
          // no agentName
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      const buttonText = labelElement?.textContent ?? button.textContent ?? "";
      assert.ok(buttonText.includes("Subagent:"), "Title should use default Subagent prefix");
    });
  });
  suite("Late metadata updates", () => {
    function getTitleText(part) {
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      return labelElement?.textContent ?? button.textContent ?? "";
    }
    function getSettableState(toolInvocation) {
      return toolInvocation.state;
    }
    function setToolSpecificData(toolInvocation, data) {
      toolInvocation.toolSpecificData = data;
    }
    test("updateTitle clears previous title file widget disposables", () => {
      const toolInvocation = createMockToolInvocation({ invocationMessage: "first" });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      let disposed = false;
      part._titleFileWidgetStore.add({ dispose: () => {
        disposed = true;
      } });
      part.trackToolState(createMockToolInvocation({ invocationMessage: "second", stateType: IChatToolInvocation.StateKind.Executing }));
      assert.strictEqual(disposed, true, "Previous title file widget disposable should be cleared");
    });
    test("default description with no agentName \u2192 real description arrives later \u2192 title updates", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
        toolSpecificData: {
          kind: "subagent"
          /* no description, no agentName */
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(getTitleText(part).includes("Subagent:"), "Title should start with default prefix");
      setToolSpecificData(toolInvocation, { kind: "subagent", description: "Searching the codebase" });
      getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(getTitleText(part).includes("Searching the codebase"), "Title should reflect the new description");
    });
    test("real description already set \u2192 agentName arrives later \u2192 title updates (regression)", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
        toolSpecificData: {
          kind: "subagent",
          description: "Searching the codebase"
          /* no agentName */
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(getTitleText(part).includes("Searching the codebase"), "Title should start with the real description");
      assert.ok(!getTitleText(part).includes("CodeSearchAgent"), "Title should not yet have agent name");
      setToolSpecificData(toolInvocation, { kind: "subagent", description: "Searching the codebase", agentName: "CodeSearchAgent" });
      getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(getTitleText(part).includes("CodeSearchAgent"), "Title should reflect the new agent name");
    });
    test("agentName already set \u2192 empty agentName arrives \u2192 title NOT cleared", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
        toolSpecificData: { kind: "subagent", description: "Searching the codebase", agentName: "CodeSearchAgent" }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(getTitleText(part).includes("CodeSearchAgent"), "Title should start with the agent name");
      setToolSpecificData(toolInvocation, { kind: "subagent", description: "Searching the codebase" });
      getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(getTitleText(part).includes("CodeSearchAgent"), "Title should still have the agent name");
    });
    test("real description already set \u2192 no further changes \u2192 title preserved", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.WaitingForConfirmation,
        toolSpecificData: { kind: "subagent", description: "Searching the codebase", agentName: "CodeSearchAgent" }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const before = getTitleText(part);
      getSettableState(toolInvocation).set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.strictEqual(getTitleText(part), before, "Title should be unchanged when no metadata changed");
    });
  });
  suite("State management", () => {
    test("should start as active", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.strictEqual(part.getIsActive(), true, "Should start as active");
    });
    test("markAsInactive should update isActive state", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      part.markAsInactive();
      assert.deepStrictEqual({
        isActive: part.getIsActive(),
        animationEnabled: part.domNode.classList.contains("chat-collapsible-content-animated")
      }, {
        isActive: false,
        animationEnabled: true
      });
    });
    test("forced inactive state freezes timing for a terminal parent response", () => {
      const toolSpecificData = {
        kind: "subagent",
        isActive: true,
        description: "Working on task",
        chatResource: "ahp-chat://subagent/test/tool-call",
        startedAt: Date.now() - 5e3
      };
      const part = createPart(createMockToolInvocation({ toolSpecificData }), createMockRenderContext(false));
      part.markAsInactive(true);
      assert.deepStrictEqual({
        isActive: toolSpecificData.isActive,
        hasDuration: typeof toolSpecificData.duration === "number" && toolSpecificData.duration >= 5e3,
        contextDuration: getOpenChatContext(part)?.duration
      }, {
        isActive: false,
        hasDuration: true,
        contextDuration: toolSpecificData.duration
      });
    });
    test("forced inactive state freezes serialized subagent timing", () => {
      const toolSpecificData = {
        kind: "subagent",
        isActive: true,
        description: "Restored task",
        chatResource: "ahp-chat://subagent/test/restored",
        startedAt: Date.now() - 5e3
      };
      const part = createPart(createMockSerializedToolInvocation({
        toolSpecificData,
        isComplete: true
      }), createMockRenderContext(true));
      part.markAsInactive(true);
      assert.deepStrictEqual({
        isActive: toolSpecificData.isActive,
        hasDuration: typeof toolSpecificData.duration === "number" && toolSpecificData.duration >= 5e3,
        contextDuration: getOpenChatContext(part)?.duration
      }, {
        isActive: false,
        hasDuration: true,
        contextDuration: toolSpecificData.duration
      });
    });
    test("stops immediately when the parent response becomes terminal", () => {
      const onDidChange = disposables.add(new Emitter());
      let isComplete = false;
      const baseContext = createMockRenderContext(false);
      const baseElement = baseContext.element;
      const context = {
        ...baseContext,
        element: {
          ...baseElement,
          model: {
            ...baseElement.model,
            onDidChange: onDidChange.event
          },
          get isComplete() {
            return isComplete;
          },
          get isCanceled() {
            return false;
          },
          setVote: () => {
          }
        }
      };
      const toolSpecificData = {
        kind: "subagent",
        isActive: true,
        description: "Working on task",
        chatResource: "ahp-chat://subagent/test/tool-call",
        startedAt: Date.now() - 5e3
      };
      const part = createPart(createMockToolInvocation({ toolSpecificData }), context);
      isComplete = true;
      onDidChange.fire({ reason: "completedRequest" });
      assert.deepStrictEqual({
        isActive: part.getIsActive(),
        toolIsActive: toolSpecificData.isActive,
        hasDuration: typeof toolSpecificData.duration === "number" && toolSpecificData.duration >= 5e3
      }, {
        isActive: false,
        toolIsActive: false,
        hasDuration: true
      });
    });
    test("markAsInactive should remove streaming class", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      part.markAsInactive();
      const wrapper = getWrapperElement(part);
      if (wrapper) {
        assert.strictEqual(
          wrapper.classList.contains("chat-thinking-streaming"),
          false,
          "Streaming class should be removed after markAsInactive"
        );
      }
    });
    test("markAsInactive should collapse the part", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false);
      part.markAsInactive();
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed after markAsInactive");
    });
    test("markAsInactive should change default description to past tense", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent"
          // no description — should use the default "Running subagent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelBefore = getCollapseButtonLabel(button);
      const textBefore = labelBefore?.textContent ?? button.textContent ?? "";
      assert.ok(textBefore.includes("Running subagent"), 'Title should show "Running subagent" before completion');
      part.markAsInactive();
      const labelAfter = getCollapseButtonLabel(button);
      const textAfter = labelAfter?.textContent ?? button.textContent ?? "";
      assert.ok(textAfter.includes("Ran subagent"), 'Title should show "Ran subagent" after completion');
      assert.ok(!textAfter.includes("Running subagent"), 'Title should no longer show "Running subagent"');
    });
    test("markAsInactive should keep custom description unchanged", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Searching the codebase",
          agentName: "Explorer"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      part.markAsInactive();
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const label = getCollapseButtonLabel(button);
      const text = label?.textContent ?? button.textContent ?? "";
      assert.ok(text.includes("Searching the codebase"), "Title should keep custom description after completion");
    });
    test("finalizeTitle should update button icon to check", () => {
      const configService = instantiationService.get(IConfigurationService);
      configService.setUserConfiguration(AccessibilityWorkbenchSettingId.ShowChatCheckmarks, true);
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      part.finalizeTitle();
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const iconElement = getCollapseButtonIcon(button);
      assert.ok(iconElement?.classList.contains("codicon-check"), "Should have check icon after finalization");
    });
  });
  suite("Serialized invocation", () => {
    test("should handle serialized tool invocation", () => {
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "FinishedAgent",
          prompt: "Original prompt",
          result: "Task completed successfully"
        }
      });
      const context = createMockRenderContext(true);
      const part = createPart(serializedInvocation, context);
      assert.strictEqual(part.getIsActive(), false, "Serialized invocation should be inactive");
    });
  });
  suite("hasSameContent", () => {
    test("should not reuse the visual part for a child tool invocation", () => {
      const toolInvocation = createMockToolInvocation({ subAgentInvocationId: "subagent-123" });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const otherInvocation = createMockToolInvocation({
        toolId: "some-tool",
        subAgentInvocationId: "subagent-123"
      });
      const result = part.hasSameContent(otherInvocation, [], context.element);
      assert.strictEqual(result, false);
    });
    test("should return false for tool invocation with different subAgentInvocationId", () => {
      const toolInvocation = createMockToolInvocation({ subAgentInvocationId: "subagent-123" });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const otherInvocation = createMockToolInvocation({
        toolId: "some-tool",
        subAgentInvocationId: "subagent-456"
      });
      const result = part.hasSameContent(otherInvocation, [], context.element);
      assert.strictEqual(result, false, "Should not match tool invocation with different subAgentInvocationId");
    });
    test("should return true for runSubagent tool using toolCallId as effective ID", () => {
      const sharedToolCallId = "shared-tool-call-id";
      const toolInvocation = createMockToolInvocation({
        toolId: RunSubagentTool.Id,
        toolCallId: sharedToolCallId
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context, toolInvocation.toolCallId);
      const otherInvocation = createMockToolInvocation({
        toolId: RunSubagentTool.Id,
        toolCallId: sharedToolCallId
      });
      const result = part.hasSameContent(otherInvocation, [], context.element);
      assert.strictEqual(result, true, "Should match runSubagent tool using toolCallId as effective ID");
    });
    test("should not reuse the visual part for grouped markdown", () => {
      const toolInvocation = createMockToolInvocation({ toolCallId: "subagent-123" });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const markdownContent = {
        kind: "markdownContent",
        content: { value: '<vscode_codeblock_uri subAgentInvocationId="subagent-123">file:///test.txt</vscode_codeblock_uri>' }
      };
      const result = part.hasSameContent(markdownContent, [], context.element);
      assert.strictEqual(result, false);
    });
  });
  suite("Streaming behavior", () => {
    test("should show loading spinner while streaming", () => {
      const toolInvocation = createMockToolInvocation({
        stateType: IChatToolInvocation.StateKind.Streaming
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const loadingIcon = getCollapseButtonIcon(button);
      assert.ok(loadingIcon?.classList.contains("codicon-circle-filled"), "Should have circle-filled icon while streaming");
    });
  });
  suite("Expand/collapse", () => {
    test("should toggle expansion when button is clicked", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"));
      const button = getCollapseButton(part);
      assert.ok(button, "Should have expand button");
      button.click();
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should be expanded after clicking button"
      );
      button.click();
      assert.ok(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        "Should be collapsed after clicking button again"
      );
    });
    test("should have proper aria-expanded attribute", () => {
      const toolInvocation = createMockToolInvocation();
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      assert.strictEqual(button.getAttribute("aria-expanded"), "false", 'Should have aria-expanded="false" when collapsed');
      button.click();
      assert.strictEqual(button.getAttribute("aria-expanded"), "true", 'Should have aria-expanded="true" when expanded');
    });
  });
  suite("Lazy rendering", () => {
    test("should defer prompt/result rendering until expanded when initially complete", () => {
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "FinishedAgent",
          prompt: "Original prompt for the task",
          result: "Task completed successfully"
        }
      });
      const context = createMockRenderContext(true);
      const part = createPart(serializedInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed initially");
      const button = getCollapseButton(part);
      assert.ok(button, "Expand button should exist");
      button.click();
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false, "Should be expanded");
      const wrapperContent = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(wrapperContent, "Wrapper content should exist after expand");
      const sections = wrapperContent.querySelectorAll(".chat-subagent-section");
      assert.ok(sections.length >= 2, "Should have prompt and result sections after expand");
    });
    test("should not render wrapper content while subagent is running (truly collapsed)", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Running task",
          agentName: "RunningAgent",
          prompt: "Prompt text"
        },
        stateType: IChatToolInvocation.StateKind.Streaming
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed while running");
      const wrapperContent = part.domNode.querySelector(".chat-used-context-list");
      assert.strictEqual(wrapperContent, null, "Wrapper content should not be rendered while running and collapsed");
    });
    test("should show prompt on expand when no tool items yet", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Starting task",
          agentName: "RunningAgent",
          prompt: "This is the prompt to execute"
        },
        stateType: IChatToolInvocation.StateKind.Streaming
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should be collapsed initially");
      let wrapperContent = part.domNode.querySelector(".chat-used-context-list");
      assert.strictEqual(wrapperContent, null, "Wrapper should not exist initially");
      const button = getCollapseButton(part);
      assert.ok(button, "Expand button should exist");
      button.click();
      wrapperContent = part.domNode.querySelector(".chat-used-context-list");
      assert.ok(wrapperContent, "Wrapper should exist after expand");
      const promptSection = wrapperContent.querySelector(".chat-subagent-section");
      assert.ok(promptSection, "Prompt section should be visible after expand");
    });
  });
  suite("Current running tool in title", () => {
    test("batches presentation while reconstructing terminal tool history", () => {
      const parentTool = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const part = createPart(parentTool, createMockRenderContext(false));
      markdownRenderCount = 0;
      part.beginToolPresentationBatch();
      for (let index = 0; index < 128; index++) {
        const tool = createMockToolInvocation({
          toolId: "readFile",
          toolCallId: `child-${index}`,
          subAgentInvocationId: parentTool.toolCallId,
          stateType: IChatToolInvocation.StateKind.Completed,
          invocationMessage: `Completed tool ${index}`
        });
        part.appendToolInvocation(tool, index);
      }
      const rendersDuringBatch = markdownRenderCount;
      part.endToolPresentationBatch();
      const rendersAfterBatch = markdownRenderCount;
      const button = getCollapseButton(part);
      assert.ok(button);
      const titleAfterBatch = getCollapseButtonLabel(button)?.textContent ?? button.textContent ?? "";
      const toolStateTracking = part._toolStateTracking;
      const trackedTerminalToolCount = toolStateTracking._toDispose.size;
      const liveTool = createMockToolInvocation({
        toolId: "searchFiles",
        toolCallId: "live-child",
        subAgentInvocationId: parentTool.toolCallId,
        stateType: IChatToolInvocation.StateKind.Executing,
        invocationMessage: "Searching live files"
      });
      part.appendToolInvocation(liveTool, 128);
      const titleAfterLiveTool = getCollapseButtonLabel(button)?.textContent ?? button.textContent ?? "";
      assert.deepStrictEqual({
        rendersDuringBatch,
        rendersAfterBatch,
        trackedTerminalToolCount,
        rendersAfterLiveTool: markdownRenderCount,
        titleAfterBatchIncludesLatestTool: titleAfterBatch.includes("Completed tool 127"),
        titleAfterLiveToolIncludesLatestTool: titleAfterLiveTool.includes("Searching live files")
      }, {
        rendersDuringBatch: 0,
        rendersAfterBatch: 1,
        trackedTerminalToolCount: 0,
        rendersAfterLiveTool: 2,
        titleAfterBatchIncludesLatestTool: true,
        titleAfterLiveToolIncludesLatestTool: true
      });
    });
    test("batches grouped hook presentation updates", () => {
      const parentTool = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const part = createPart(parentTool, createMockRenderContext(false));
      const hookPart = {
        kind: "hook",
        hookType: "PreToolUse",
        systemMessage: "Warning",
        toolDisplayName: "Search",
        subAgentInvocationId: parentTool.toolCallId
      };
      markdownRenderCount = 0;
      part.beginToolPresentationBatch();
      for (let index = 0; index < 32; index++) {
        part.appendHookItem(() => ({ domNode: mainWindow.document.createElement("div") }), hookPart);
      }
      const rendersDuringBatch = markdownRenderCount;
      part.endToolPresentationBatch();
      assert.deepStrictEqual({
        rendersDuringBatch,
        rendersAfterBatch: markdownRenderCount
      }, {
        rendersDuringBatch: 0,
        rendersAfterBatch: 1
      });
    });
    test("should update title with current running tool invocation message", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const childTool = createMockToolInvocation({
        toolId: "readFile",
        subAgentInvocationId: toolInvocation.subAgentInvocationId,
        stateType: IChatToolInvocation.StateKind.Executing,
        invocationMessage: "Reading config.ts"
      });
      part.appendToolInvocation(childTool, 0);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      const buttonText = labelElement?.textContent ?? button.textContent ?? "";
      assert.ok(buttonText.includes("Reading config.ts"), "Title should include current running tool message");
    });
    test("should show latest tool when multiple tools are added", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const firstTool = createMockToolInvocation({
        toolId: "readFile",
        subAgentInvocationId: toolInvocation.subAgentInvocationId,
        stateType: IChatToolInvocation.StateKind.Executing,
        invocationMessage: "Reading file1.ts"
      });
      part.appendToolInvocation(firstTool, 0);
      const secondTool = createMockToolInvocation({
        toolId: "searchFiles",
        subAgentInvocationId: toolInvocation.subAgentInvocationId,
        stateType: IChatToolInvocation.StateKind.Executing,
        invocationMessage: "Searching for patterns"
      });
      part.appendToolInvocation(secondTool, 1);
      const button = getCollapseButton(part);
      assert.ok(button, "Should have collapse button");
      const labelElement = getCollapseButtonLabel(button);
      const buttonText = labelElement?.textContent ?? button.textContent ?? "";
      assert.ok(buttonText.includes("Searching for patterns"), "Title should include latest tool message");
    });
    test("should keep showing running tool when another tool completes", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const firstToolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const firstTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: firstToolState,
        invocationMessage: "Reading file1.ts"
      };
      part.trackToolState(firstTool);
      const secondToolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const secondTool = {
        ...createMockToolInvocation({
          toolId: "searchFiles",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: secondToolState,
        invocationMessage: "Searching for patterns"
      };
      part.trackToolState(secondTool);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      const labelElement = getCollapseButtonLabel(button);
      let buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Searching for patterns"), "Title should show second tool");
      firstToolState.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Searching for patterns"), "Title should still show second tool after first completes");
    });
    test("should keep title when tool is cancelled", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const toolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: toolState,
        invocationMessage: "Reading file.ts"
      };
      part.trackToolState(childTool);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      const labelElement = getCollapseButtonLabel(button);
      let buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Reading file.ts"), "Title should include tool message while running");
      toolState.set(createState(IChatToolInvocation.StateKind.Cancelled), void 0);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(
        buttonText.includes("Reading file.ts"),
        "Title should still include tool message after cancellation"
      );
    });
    test("should keep showing last tool message when that tool completes", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const firstToolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const firstTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: firstToolState,
        invocationMessage: "Reading file1.ts"
      };
      part.trackToolState(firstTool);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      const labelElement = getCollapseButtonLabel(button);
      let buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Reading file1.ts"), "Title should show first tool");
      const secondToolState = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const secondTool = {
        ...createMockToolInvocation({
          toolId: "searchFiles",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: secondToolState,
        invocationMessage: "Searching for patterns"
      };
      part.trackToolState(secondTool);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Searching for patterns"), "Title should show second tool");
      secondToolState.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(
        buttonText.includes("Searching for patterns"),
        "Title should still show last tool message after completion"
      );
    });
  });
  suite("appendMarkdownItem", () => {
    test("should append markdown item to expanded subagent part", () => {
      const toolInvocation = createMockToolInvocation({
        subAgentInvocationId: "test-subagent-id",
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false, "Should be expanded");
      const markdownContent = {
        kind: "markdownContent",
        content: { value: "Edited file.ts" }
      };
      const markdownDomNode = mainWindow.document.createElement("div");
      markdownDomNode.className = "chat-codeblock-button";
      markdownDomNode.textContent = "file.ts";
      let disposeCallCount = 0;
      const mockDisposable = { dispose: () => {
        disposeCallCount++;
      } };
      part.appendMarkdownItem(
        () => ({ domNode: markdownDomNode, disposable: mockDisposable }),
        "codeblock-123",
        markdownContent,
        void 0
      );
      const wrapper = getWrapperElement(part);
      assert.ok(wrapper, "Wrapper should exist");
      const appendedElement = wrapper.querySelector(".chat-codeblock-button");
      assert.ok(appendedElement, "Appended markdown element should exist in wrapper");
      assert.strictEqual(appendedElement.textContent, "file.ts", "Should have correct content");
    });
    test("should not render markdown item when part is collapsed", () => {
      const toolInvocation = createMockToolInvocation({
        subAgentInvocationId: "test-subagent-defer",
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should start collapsed");
      const markdownContent = {
        kind: "markdownContent",
        content: { value: "Deferred edit" }
      };
      let factoryCalled = false;
      const markdownDomNode = mainWindow.document.createElement("div");
      markdownDomNode.className = "deferred-edit";
      markdownDomNode.textContent = "deferred.ts";
      const mockDisposable = { dispose: () => {
      } };
      part.appendMarkdownItem(
        () => {
          factoryCalled = true;
          return { domNode: markdownDomNode, disposable: mockDisposable };
        },
        "codeblock-deferred",
        markdownContent,
        void 0
      );
      assert.strictEqual(factoryCalled, false, "Factory should not be called when collapsed");
    });
    test("should append multiple markdown items with same codeblock ID", () => {
      const toolInvocation = createMockToolInvocation({
        subAgentInvocationId: "test-subagent-dedup",
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      const markdownContent = {
        kind: "markdownContent",
        content: { value: "Same codeblock" }
      };
      const sharedCodeblockId = "codeblock-same-id";
      const firstNode = mainWindow.document.createElement("div");
      firstNode.className = "first-item";
      firstNode.textContent = "first item content";
      part.appendMarkdownItem(
        () => ({ domNode: firstNode, disposable: { dispose: () => {
        } } }),
        sharedCodeblockId,
        markdownContent,
        void 0
      );
      const secondNode = mainWindow.document.createElement("div");
      secondNode.className = "second-item";
      secondNode.textContent = "second item content";
      part.appendMarkdownItem(
        () => ({ domNode: secondNode, disposable: { dispose: () => {
        } } }),
        sharedCodeblockId,
        markdownContent,
        void 0
      );
      const wrapper = getWrapperElement(part);
      assert.ok(wrapper, "Wrapper should exist");
      const firstItems = wrapper.querySelectorAll(".first-item");
      const secondItems = wrapper.querySelectorAll(".second-item");
      assert.strictEqual(firstItems.length, 1, "First item should exist");
      assert.strictEqual(secondItems.length, 1, "Second item should exist");
    });
    test("should handle multiple different codeblock IDs", () => {
      const toolInvocation = createMockToolInvocation({
        subAgentInvocationId: "test-subagent-multi",
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      const firstNode = mainWindow.document.createElement("div");
      firstNode.className = "item-one";
      firstNode.textContent = "first item content";
      part.appendMarkdownItem(
        () => ({ domNode: firstNode, disposable: { dispose: () => {
        } } }),
        "codeblock-1",
        { kind: "markdownContent", content: { value: "First" } },
        void 0
      );
      const secondNode = mainWindow.document.createElement("div");
      secondNode.className = "item-two";
      secondNode.textContent = "second item content";
      part.appendMarkdownItem(
        () => ({ domNode: secondNode, disposable: { dispose: () => {
        } } }),
        "codeblock-2",
        { kind: "markdownContent", content: { value: "Second" } },
        void 0
      );
      const wrapper = getWrapperElement(part);
      assert.ok(wrapper, "Wrapper should exist");
      assert.ok(wrapper.querySelector(".item-one"), "First item should exist");
      assert.ok(wrapper.querySelector(".item-two"), "Second item should exist");
    });
  });
  suite("Auto-expand on confirmation", () => {
    test("should auto-expand when tool state becomes WaitingForConfirmation", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should start collapsed");
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Reading file"
      };
      part.trackToolState(childTool);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should still be collapsed when tool is executing");
      stateObservable.set(createState(IChatToolInvocation.StateKind.WaitingForConfirmation), void 0);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should auto-expand when tool needs confirmation"
      );
    });
    test("should publish the pending confirmation count to the open-chat pill", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      const state = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = { ...createMockToolInvocation({ toolId: "first" }), state };
      part.enableCarouselMode(() => {
      }, () => {
      }, (_tool, currentState) => currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation);
      part.trackToolState(childTool);
      state.set(createState(IChatToolInvocation.StateKind.WaitingForConfirmation), void 0);
      const pending = getOpenChatContext(part)?.confirmationCount;
      state.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.deepStrictEqual({
        pending,
        afterConfirmation: getOpenChatContext(part)?.confirmationCount
      }, {
        pending: 1,
        afterConfirmation: 0
      });
    });
    test("should distinguish the active confirmation from pending confirmations", () => {
      const part = createPart(createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          chatResource: "ahp-chat://subagent/test/tool-call"
        }
      }), createMockRenderContext(false));
      part.setConfirmationActive(true);
      const active = getOpenChatContext(part)?.confirmationActive;
      part.setConfirmationActive(false);
      assert.deepStrictEqual({
        active,
        inactive: getOpenChatContext(part)?.confirmationActive
      }, {
        active: true,
        inactive: false
      });
    });
    test("should refresh the open-chat timing when the subagent stops", () => {
      const toolSpecificData = {
        kind: "subagent",
        description: "Working on task",
        chatResource: "ahp-chat://subagent/test/tool-call",
        isActive: true,
        startedAt: 1e3
      };
      const toolInvocation = createMockToolInvocation({
        toolSpecificData,
        stateType: IChatToolInvocation.StateKind.Executing
      });
      const state = observableValue("state", toolInvocation.state.get());
      toolInvocation.state = state;
      const part = createPart(toolInvocation, createMockRenderContext(false));
      toolSpecificData.isActive = false;
      toolSpecificData.duration = 5e3;
      state.set({ ...state.get() }, void 0);
      assert.deepStrictEqual(getOpenChatContext(part), {
        chatResource: "ahp-chat://subagent/test/tool-call",
        parentSessionResource: "chat-session://test/session1",
        title: "Working on task",
        confirmationCount: 0,
        confirmationActive: false,
        startedAt: 1e3,
        duration: 5e3,
        isActive: false
      });
    });
    test("should stop tracking a tool invocation once it reaches a terminal state", async () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Reading file"
      };
      part.trackToolState(childTool);
      const observerCount = () => stateObservable.debugGetObservers().size;
      assert.strictEqual(observerCount(), 1, "Tracking autorun should observe the tool state");
      stateObservable.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      await Promise.resolve();
      assert.strictEqual(observerCount(), 0, "Tracking autorun should be disposed once the tool reaches a terminal state");
    });
    test("should auto-collapse when confirmation is addressed", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Run npm install"
      };
      part.trackToolState(childTool);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should be expanded when waiting for confirmation"
      );
      stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        "Should auto-collapse after confirmation is addressed"
      );
    });
    test("should not auto-collapse if user manually expanded", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const button = getCollapseButton(part);
      button?.click();
      assert.strictEqual(part.domNode.classList.contains("chat-used-context-collapsed"), false, "Should be expanded after user click");
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Run npm install"
      };
      part.trackToolState(childTool);
      stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should stay expanded when user manually expanded"
      );
    });
    test("should respect manual expansion after auto-expand", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should start collapsed");
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Run npm install"
      };
      part.trackToolState(childTool);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should auto-expand for confirmation"
      );
      const button = getCollapseButton(part);
      button?.click();
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should collapse after user click");
      button?.click();
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should expand after second user click"
      );
      stateObservable.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should stay expanded when user manually re-expanded after auto-expand"
      );
    });
    test("should resume auto-collapse after user manually expands then collapses", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const stateObservable1 = observableValue("state1", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool1 = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          toolCallId: "tool1",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable1,
        invocationMessage: "First tool"
      };
      part.trackToolState(childTool1);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should auto-expand for first confirmation"
      );
      const button = getCollapseButton(part);
      button?.click();
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should collapse after user click");
      button?.click();
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should expand after user re-expands"
      );
      stateObservable1.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should stay expanded after first tool completes (user manually expanded)"
      );
      button?.click();
      assert.ok(part.domNode.classList.contains("chat-used-context-collapsed"), "Should collapse after user manually collapses");
      const stateObservable2 = observableValue("state2", createState(IChatToolInvocation.StateKind.WaitingForConfirmation));
      const childTool2 = {
        ...createMockToolInvocation({
          toolId: "runInTerminal",
          toolCallId: "tool2",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable2,
        invocationMessage: "Second tool"
      };
      part.trackToolState(childTool2);
      assert.strictEqual(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        false,
        "Should auto-expand for second confirmation"
      );
      stateObservable2.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      assert.ok(
        part.domNode.classList.contains("chat-used-context-collapsed"),
        "Should auto-collapse after second confirmation is addressed (userManuallyExpanded was reset)"
      );
    });
    test("should clear current running tool message when tool completes", () => {
      const toolInvocation = createMockToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Working on task",
          agentName: "TestAgent"
        }
      });
      const context = createMockRenderContext(false);
      const part = createPart(toolInvocation, context);
      const stateObservable = observableValue("state", createState(IChatToolInvocation.StateKind.Executing));
      const childTool = {
        ...createMockToolInvocation({
          toolId: "readFile",
          subAgentInvocationId: toolInvocation.subAgentInvocationId
        }),
        state: stateObservable,
        invocationMessage: "Reading config.ts"
      };
      part.trackToolState(childTool);
      const button = getCollapseButton(part);
      assert.ok(button, "Button should exist");
      const labelElement = getCollapseButtonLabel(button);
      let buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(buttonText.includes("Reading config.ts"), "Title should include tool message while running");
      stateObservable.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      buttonText = labelElement?.textContent ?? button?.textContent ?? "";
      assert.ok(
        buttonText.includes("Reading config.ts"),
        "Title should still include tool message after completion"
      );
    });
  });
  suite("Model name tooltip", () => {
    const hoverText = (content) => {
      if (typeof content === "string") {
        return content;
      }
      if (isMarkdownString(content)) {
        return content.value;
      }
      return "";
    };
    test("should set up hover with model name from serialized toolSpecificData", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "TestAgent",
          prompt: "Do the thing",
          result: "Done",
          modelName: "GPT-4o"
        }
      });
      const context = createMockRenderContext(true);
      createPart(serializedInvocation, context);
      const modelHover = setupDelayedHoverCalls.find((c) => c.content.includes("GPT-4o"));
      assert.ok(modelHover, "Should set up hover with model name");
    });
    test("should not set up hover when no model name is available", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "TestAgent",
          prompt: "Do the thing",
          result: "Done"
          // no modelName
        }
      });
      const context = createMockRenderContext(true);
      createPart(serializedInvocation, context);
      const modelHover = setupDelayedHoverCalls.find((c) => c.content.includes("Model:"));
      assert.strictEqual(modelHover, void 0, "Should not set up model hover when no model name");
    });
    test("should set up hover when tool completes and toolSpecificData has modelName", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const toolSpecificData = {
        kind: "subagent",
        description: "Working on task",
        agentName: "TestAgent",
        prompt: "Do stuff"
      };
      const toolInvocation = createMockToolInvocation({
        toolSpecificData,
        stateType: IChatToolInvocation.StateKind.Executing
      });
      const context = createMockRenderContext(false);
      createPart(toolInvocation, context);
      const initialHover = setupDelayedHoverCalls.find((c) => c.content.includes("Model:"));
      assert.strictEqual(initialHover, void 0, "Should not have model hover initially");
      toolSpecificData.modelName = "Claude Sonnet 4";
      const state = toolInvocation.state;
      state.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      const modelHover = setupDelayedHoverCalls.find((c) => c.content.includes("Claude Sonnet 4"));
      assert.ok(modelHover, "Should set up hover with model name after completion");
    });
    test("should set up hover with credits from serialized toolSpecificData", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const serializedInvocation = createMockSerializedToolInvocation({
        toolSpecificData: {
          kind: "subagent",
          description: "Completed task",
          agentName: "TestAgent",
          prompt: "Do the thing",
          result: "Done",
          modelName: "GPT-4o",
          credits: 1.5
        }
      });
      const context = createMockRenderContext(true);
      createPart(serializedInvocation, context);
      const hover = setupDelayedHoverCalls.find((c) => c.content.includes("1.5") && c.content.includes("credits"));
      assert.ok(hover, "Should set up hover with credits");
      assert.ok(hover.content.includes("GPT-4o"), "Hover should still include model name");
    });
    test("should update hover with credits when they arrive after completion", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const toolSpecificData = {
        kind: "subagent",
        description: "Working on task",
        agentName: "TestAgent",
        prompt: "Do stuff",
        modelName: "GPT-4o"
      };
      const toolInvocation = createMockToolInvocation({
        toolSpecificData,
        stateType: IChatToolInvocation.StateKind.Executing
      });
      const context = createMockRenderContext(false);
      createPart(toolInvocation, context);
      assert.strictEqual(setupDelayedHoverCalls.find((c) => c.content.includes("credit")), void 0, "Should not show credits before they are reported");
      toolSpecificData.credits = 2;
      const state = toolInvocation.state;
      state.set(createState(IChatToolInvocation.StateKind.Completed), void 0);
      const creditHover = setupDelayedHoverCalls.find((c) => c.content.includes("2") && c.content.includes("credits"));
      assert.ok(creditHover, "Should set up hover with credits after completion");
    });
    test("should update hover with model name when it arrives after initial render", () => {
      const setupDelayedHoverCalls = [];
      mockHoverService.setupDelayedHover = (element, options) => {
        setupDelayedHoverCalls.push({ element, content: hoverText(options.content) });
        return { dispose: () => {
        } };
      };
      const toolSpecificData = {
        kind: "subagent",
        description: "Working on task",
        agentName: "TestAgent"
      };
      const toolInvocation = createMockToolInvocation({
        toolSpecificData,
        stateType: IChatToolInvocation.StateKind.Executing
      });
      const context = createMockRenderContext(false);
      createPart(toolInvocation, context);
      assert.strictEqual(setupDelayedHoverCalls.find((c) => c.content.includes("Model")), void 0, "Should not show a model before one is reported");
      toolSpecificData.modelName = "Claude Sonnet 4";
      const state = toolInvocation.state;
      state.set(createState(IChatToolInvocation.StateKind.Executing), void 0);
      const modelHover = setupDelayedHoverCalls.find((c) => c.content.includes("Claude Sonnet 4"));
      assert.ok(modelHover, "Should set up hover with model name after it arrives");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFN1YmFnZW50Q29udGVudFBhcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGlzSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGVlcC1pbXBvcnQtb2YtaW50ZXJuYWxcbmltcG9ydCB7IEJhc2VPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZUludGVybmFsL29ic2VydmFibGVzL2Jhc2VPYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBUZXN0TWVudVNlcnZpY2UsIHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0U3ViYWdlbnRDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEhvb2tQYXJ0LCBJQ2hhdE1hcmtkb3duQ29udGVudCwgSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElSZW5kZXJlZE1hcmtkb3duLCBNYXJrZG93blJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQb29sLCBEaWZmRWRpdG9yUG9vbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSdW5TdWJhZ2VudFRvb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL3J1blN1YmFnZW50VG9vbC5qcyc7XG5pbXBvcnQgeyBDb2xsYXBzaWJsZUxpc3RQb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UmVmZXJlbmNlc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L3Rlc3QvY29tbW9uL3Rlc3RBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1GYWN0b3J5LCBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWVudUFjdGlvbk9wdGlvbnMsIElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lELCBDSEFUX1NVQkFHRU5UX1JFU09VUkNFX1FVRVJZX1BBUkFNLCBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZm9ybWF0Q29tcGFjdFN1YmFnZW50RHVyYXRpb24sIGdldFN1YmFnZW50RWRpdG9yUmVzb3VyY2UsIE9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbSwgc2hvdWxkQW5pbWF0ZVN1YmFnZW50VG9vbFRyYW5zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRTdWJhZ2VudE9wZW5DaGF0LmpzJztcblxuY2xhc3MgVGVzdE9wZW5DaGF0QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKHNvdXJjZUFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgbmV3IEFjdGlvbihzb3VyY2VBY3Rpb24uaWQsIHNvdXJjZUFjdGlvbi5sYWJlbCwgc291cmNlQWN0aW9uLmNsYXNzLCB0cnVlLCBjb250ZXh0ID0+IHNvdXJjZUFjdGlvbi5ydW4oY29udGV4dCkpLCBvcHRpb25zKTtcblx0XHRpZiAodGhpcy5hY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWN0aW9uKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVGVzdEFjdGlvblZpZXdJdGVtU2VydmljZSBpbXBsZW1lbnRzIElBY3Rpb25WaWV3SXRlbVNlcnZpY2Uge1xuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxNZW51SWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cdHByaXZhdGUgX3Byb3ZpZGVyQXZhaWxhYmxlID0gdHJ1ZTtcblxuXHRnZXQgaGFzQ2hhbmdlTGlzdGVuZXJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5oYXNMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHNldFByb3ZpZGVyQXZhaWxhYmxlKGF2YWlsYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3ZpZGVyQXZhaWxhYmxlID0gYXZhaWxhYmxlO1xuXHR9XG5cblx0ZmlyZURpZENoYW5nZShtZW51SWQ6IE1lbnVJZCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUobWVudUlkKTtcblx0fVxuXG5cdHJlZ2lzdGVyKF9tZW51OiBNZW51SWQsIF9jb21tYW5kSWQ6IHN0cmluZyB8IE1lbnVJZCwgX3Byb3ZpZGVyOiBJQWN0aW9uVmlld0l0ZW1GYWN0b3J5KTogeyBkaXNwb3NlKCk6IHZvaWQgfSB7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdH1cblxuXHRsb29rVXAobWVudTogTWVudUlkLCBjb21tYW5kSWQ6IHN0cmluZyB8IE1lbnVJZCk6IElBY3Rpb25WaWV3SXRlbUZhY3RvcnkgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fcHJvdmlkZXJBdmFpbGFibGUgfHwgbWVudSAhPT0gTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnQgfHwgY29tbWFuZElkICE9PSBDSEFUX09QRU5fQUdFTlRfSE9TVF9DSEFUX0NPTU1BTkRfSUQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiAoYWN0aW9uLCBvcHRpb25zKSA9PiBuZXcgVGVzdE9wZW5DaGF0QWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0U3ViYWdlbnRNZW51U2VydmljZSBleHRlbmRzIFRlc3RNZW51U2VydmljZSB7XG5cdGNyZWF0ZU1lbnVDYWxscyA9IDA7XG5cdGdldE1lbnVBY3Rpb25zQ2FsbHMgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgb3BlbkNoYXRBY3Rpb246IE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZU1lbnUoaWQ6IE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdHRoaXMuY3JlYXRlTWVudUNhbGxzKys7XG5cdFx0cmV0dXJuIHN1cGVyLmNyZWF0ZU1lbnUoaWQsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE1lbnVBY3Rpb25zKGlkOiBNZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIG9wdGlvbnM/OiBJTWVudUFjdGlvbk9wdGlvbnMpOiBSZXR1cm5UeXBlPElNZW51U2VydmljZVsnZ2V0TWVudUFjdGlvbnMnXT4ge1xuXHRcdHRoaXMuZ2V0TWVudUFjdGlvbnNDYWxscysrO1xuXHRcdGlmIChpZCA9PT0gTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnQpIHtcblx0XHRcdHJldHVybiBbWyduYXZpZ2F0aW9uJywgW3RoaXMub3BlbkNoYXRBY3Rpb25dXV07XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5nZXRNZW51QWN0aW9ucyhpZCwgY29udGV4dEtleVNlcnZpY2UsIG9wdGlvbnMpO1xuXHR9XG59XG5cbnN1aXRlKCdDaGF0U3ViYWdlbnRDb250ZW50UGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0eXBlIFRvb2xJbnZvY2F0aW9uUGFyYW1ldGVycyA9IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUgZXh0ZW5kcyB7IHBhcmFtZXRlcnM6IGluZmVyIFAgfSA/IFAgOiBuZXZlcjtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBSZXR1cm5UeXBlPHR5cGVvZiB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZT47XG5cdGxldCBtb2NrTWFya2Rvd25SZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXI7XG5cdGxldCBtb2NrQW5jaG9yU2VydmljZTogSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2U7XG5cdGxldCBtb2NrSG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlO1xuXHRsZXQgbW9ja0xpc3RQb29sOiBDb2xsYXBzaWJsZUxpc3RQb29sO1xuXHRsZXQgbW9ja0VkaXRvclBvb2w6IEVkaXRvclBvb2w7XG5cdGxldCBhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzOiBTZXQ8c3RyaW5nPjtcblx0bGV0IGFjdGlvblZpZXdJdGVtU2VydmljZTogVGVzdEFjdGlvblZpZXdJdGVtU2VydmljZTtcblx0bGV0IG1lbnVTZXJ2aWNlOiBUZXN0U3ViYWdlbnRNZW51U2VydmljZTtcblx0bGV0IG1hcmtkb3duUmVuZGVyQ291bnQ6IG51bWJlcjtcblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChpc0NvbXBsZXRlOiBib29sZWFuID0gZmFsc2UsIHNlc3Npb25SZXNvdXJjZTogVVJJID0gVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24xJykpOiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB7XG5cdFx0Y29uc3QgbW9ja0VsZW1lbnQ6IFBhcnRpYWw8SUNoYXRSZXNwb25zZVZpZXdNb2RlbD4gPSB7XG5cdFx0XHRpc0NvbXBsZXRlLFxuXHRcdFx0aWQ6ICd0ZXN0LXJlc3BvbnNlLWlkJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGdldCBtb2RlbCgpIHsgcmV0dXJuIHt9IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWxbJ21vZGVsJ107IH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IG1vY2tFbGVtZW50IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsXG5cdFx0XHRpbmxpbmVUZXh0TW9kZWxzOiB7fSBhcyBJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uLFxuXHRcdFx0ZWxlbWVudEluZGV4OiAwLFxuXHRcdFx0Y29udGFpbmVyOiBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0Y29udGVudDogW10sXG5cdFx0XHRjb250ZW50SW5kZXg6IDAsXG5cdFx0XHRlZGl0b3JQb29sOiBtb2NrRWRpdG9yUG9vbCxcblx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IDAsXG5cdFx0XHR0cmVlU3RhcnRJbmRleDogMCxcblx0XHRcdGRpZmZFZGl0b3JQb29sOiB7fSBhcyBEaWZmRWRpdG9yUG9vbCxcblx0XHRcdGN1cnJlbnRXaWR0aDogb2JzZXJ2YWJsZVZhbHVlKCdjdXJyZW50V2lkdGgnLCA1MDApLFxuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudC5Ob25lXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVN0YXRlKHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQsIHBhcmFtZXRlcnM/OiBUb29sSW52b2NhdGlvblBhcmFtZXRlcnMpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlIHtcblx0XHRzd2l0Y2ggKHN0YXRlVHlwZSkge1xuXHRcdFx0Y2FzZSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nLFxuXHRcdFx0XHRcdHBhcnRpYWxJbnB1dDogb2JzZXJ2YWJsZVZhbHVlKCdwYXJ0aWFsSW5wdXQnLCB7fSksXG5cdFx0XHRcdFx0c3RyZWFtaW5nTWVzc2FnZTogb2JzZXJ2YWJsZVZhbHVlKCdzdHJlYW1pbmdNZXNzYWdlJywgdW5kZWZpbmVkKVxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQ6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnMsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSxcblx0XHRcdFx0XHRyZXN1bHREZXRhaWxzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cG9zdENvbmZpcm1lZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbnRlbnRGb3JNb2RlbDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ3Rlc3QgcmVzdWx0JyB9XVxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnMsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSxcblx0XHRcdFx0XHRwcm9ncmVzczogb2JzZXJ2YWJsZVZhbHVlKCdwcm9ncmVzcycsIHsgbWVzc2FnZTogdW5kZWZpbmVkLCBwcm9ncmVzczogdW5kZWZpbmVkIH0pXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbjpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb24sXG5cdFx0XHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0XHRcdHNlcnZlcjoge1xuXHRcdFx0XHRcdFx0aWQ6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdFx0bmFtZTogJ01DUCBzZXJ2ZXInLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjYW5jZWw6ICgpID0+IHsgfSxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbjpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnMsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0XHRcdHRpdGxlOiAnQ29uZmlybSBhY3Rpb24nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogJ0FyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBwcm9jZWVkPydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbmZpcm06ICgpID0+IHsgfVxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWwsXG5cdFx0XHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0XHRcdHJlc3VsdERldGFpbHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb250ZW50Rm9yTW9kZWw6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICd0ZXN0IHJlc3VsdCcgfV0sXG5cdFx0XHRcdFx0Y29uZmlybTogKCkgPT4geyB9XG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZDpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQsXG5cdFx0XHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdFx0XHRyZWFzb246IFRvb2xDb25maXJtS2luZC5EZW5pZWRcblx0XHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24ob3B0aW9uczoge1xuXHRcdHRvb2xJZD86IHN0cmluZztcblx0XHR0b29sQ2FsbElkPzogc3RyaW5nO1xuXHRcdHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nO1xuXHRcdHRvb2xTcGVjaWZpY0RhdGE/OiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhO1xuXHRcdHN0YXRlVHlwZT86IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kO1xuXHRcdHBhcmFtZXRlcnM/OiBUb29sSW52b2NhdGlvblBhcmFtZXRlcnM7XG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U/OiBzdHJpbmc7XG5cdH0gPSB7fSk6IElDaGF0VG9vbEludm9jYXRpb24ge1xuXHRcdGNvbnN0IHN0YXRlVHlwZSA9IG9wdGlvbnMuc3RhdGVUeXBlID8/IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZztcblx0XHRjb25zdCBzdGF0ZVZhbHVlID0gY3JlYXRlU3RhdGUoc3RhdGVUeXBlLCBvcHRpb25zLnBhcmFtZXRlcnMpO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBvcHRpb25zLnRvb2xDYWxsSWQgPz8gJ3Rvb2wtY2FsbC0nICsgTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDcpO1xuXG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IG9wdGlvbnMudG9vbFNwZWNpZmljRGF0YSA/PyB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBzdWJhZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ1Rlc3QgcHJvbXB0J1xuXHRcdFx0fSxcblx0XHRcdG9yaWdpbk1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBvcHRpb25zLmludm9jYXRpb25NZXNzYWdlID8/ICdSdW5uaW5nIHN1YmFnZW50Jyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR0b29sSWQ6IG9wdGlvbnMudG9vbElkID8/IFJ1blN1YmFnZW50VG9vbC5JZCxcblx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xDYWxsSWQsXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogb3B0aW9ucy5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdHN0YXRlOiBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgc3RhdGVWYWx1ZSksXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhS2luZDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgKG9wdGlvbnMudG9vbFNwZWNpZmljRGF0YSA/PyB7IGtpbmQ6ICdzdWJhZ2VudCcgfSkua2luZCksXG5cdFx0XHRpc0F0dGFjaGVkVG9UaGlua2luZzogZmFsc2UsXG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0dG9KU09OOiAoKSA9PiBjcmVhdGVNb2NrU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiBvcHRpb25zLnRvb2xJZCA/PyBSdW5TdWJhZ2VudFRvb2wuSWQsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiBvcHRpb25zLnN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBvcHRpb25zLnRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRcdGlzQ29tcGxldGU6IHN0YXRlVHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkXG5cdFx0XHR9KVxuXHRcdH07XG5cblx0XHRyZXR1cm4gdG9vbEludm9jYXRpb247XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKG9wdGlvbnM6IHtcblx0XHR0b29sSWQ/OiBzdHJpbmc7XG5cdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmc7XG5cdFx0dG9vbFNwZWNpZmljRGF0YT86IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGE7XG5cdFx0aXNDb21wbGV0ZT86IGJvb2xlYW47XG5cdH0gPSB7fSk6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBvcHRpb25zLnRvb2xTcGVjaWZpY0RhdGEgPz8ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3Qgc3ViYWdlbnQgZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnLFxuXHRcdFx0XHRwcm9tcHQ6ICdUZXN0IHByb21wdCcsXG5cdFx0XHRcdHJlc3VsdDogJ1Rlc3QgcmVzdWx0IHRleHQnXG5cdFx0XHR9LFxuXHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHN1YmFnZW50Jyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3VsdERldGFpbHM6IHVuZGVmaW5lZCxcblx0XHRcdGlzQ29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSxcblx0XHRcdGlzQ29tcGxldGU6IG9wdGlvbnMuaXNDb21wbGV0ZSA/PyB0cnVlLFxuXHRcdFx0dG9vbENhbGxJZDogb3B0aW9ucy5zdWJBZ2VudEludm9jYXRpb25JZCA/PyAndGVzdC10b29sLWNhbGwtaWQnLFxuXHRcdFx0dG9vbElkOiBvcHRpb25zLnRvb2xJZCA/PyBSdW5TdWJhZ2VudFRvb2wuSWQsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IG9wdGlvbnMuc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJ1xuXHRcdH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdG1hcmtkb3duUmVuZGVyQ291bnQgPSAwO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgbW9jayBtYXJrZG93biByZW5kZXJlclxuXHRcdG1vY2tNYXJrZG93blJlbmRlcmVyID0ge1xuXHRcdFx0cmVuZGVyOiAoX21hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIF9vcHRpb25zPzogTWFya2Rvd25SZW5kZXJPcHRpb25zLCBvdXRFbGVtZW50PzogSFRNTEVsZW1lbnQpOiBJUmVuZGVyZWRNYXJrZG93biA9PiB7XG5cdFx0XHRcdG1hcmtkb3duUmVuZGVyQ291bnQrKztcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IG91dEVsZW1lbnQgPz8gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHR5cGVvZiBfbWFya2Rvd24gPT09ICdzdHJpbmcnID8gX21hcmtkb3duIDogKF9tYXJrZG93bi52YWx1ZSA/PyAnJyk7XG5cdFx0XHRcdGVsZW1lbnQudGV4dENvbnRlbnQgPSBjb250ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIE1vY2sgdGhlIGFuY2hvciBzZXJ2aWNlXG5cdFx0bW9ja0FuY2hvclNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRyZWdpc3RlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0bGFzdEZvY3VzZWRBbmNob3I6IHVuZGVmaW5lZFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSwgbW9ja0FuY2hvclNlcnZpY2UpO1xuXG5cdFx0Ly8gTW9jayBob3ZlciBzZXJ2aWNlXG5cdFx0bW9ja0hvdmVyU2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHNob3dEZWxheWVkSG92ZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHNldHVwRGVsYXllZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRzZXR1cERlbGF5ZWRIb3ZlckF0TW91c2U6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNob3dJbnN0YW50SG92ZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGhpZGVIb3ZlcjogKCkgPT4geyB9LFxuXHRcdFx0c2hvd0FuZEZvY3VzTGFzdEhvdmVyOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXR1cE1hbmFnZWRIb3ZlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9LCBzaG93OiAoKSA9PiB7IH0sIGhpZGU6ICgpID0+IHsgfSwgdXBkYXRlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRzaG93TWFuYWdlZEhvdmVyOiAoKSA9PiB7IH1cblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwgbW9ja0hvdmVyU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBpc01vdGlvblJlZHVjZWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRcdH0oKSk7XG5cdFx0YWN0aW9uVmlld0l0ZW1TZXJ2aWNlID0gbmV3IFRlc3RBY3Rpb25WaWV3SXRlbVNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsIGFjdGlvblZpZXdJdGVtU2VydmljZSk7XG5cdFx0bWVudVNlcnZpY2UgPSBuZXcgVGVzdFN1YmFnZW50TWVudVNlcnZpY2UobmV3IE1lbnVJdGVtQWN0aW9uKFxuXHRcdFx0eyBpZDogQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lELCB0aXRsZTogJ09wZW4gU3ViYWdlbnQnIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29tbWFuZFNlcnZpY2UpLFxuXHRcdCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1lbnVTZXJ2aWNlLCBtZW51U2VydmljZSk7XG5cdFx0KGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSkuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uU3ViYWdlbnRzVXNlUmljaFJlbmRlcmluZywgdHJ1ZSk7XG5cblx0XHQvLyBNb2NrIGxpc3QgcG9vbCBhbmQgZWRpdG9yIHBvb2xcblx0XHRtb2NrTGlzdFBvb2wgPSB7fSBhcyBDb2xsYXBzaWJsZUxpc3RQb29sO1xuXHRcdG1vY2tFZGl0b3JQb29sID0ge30gYXMgRWRpdG9yUG9vbDtcblx0XHRhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzID0gbmV3IFNldCgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVQYXJ0KFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0aWRPdmVycmlkZT86IHN0cmluZ1xuXHQpOiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCB7XG5cdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LFxuXHRcdFx0aWRPdmVycmlkZSA/PyB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZCA/PyB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0dG9vbEludm9jYXRpb24sXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0bW9ja01hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHRtb2NrTGlzdFBvb2wsXG5cdFx0XHRtb2NrRWRpdG9yUG9vbCxcblx0XHRcdCgpID0+IDUwMCxcblx0XHRcdGFubm91bmNlZFRvb2xQcm9ncmVzc0tleXNcblx0XHQpKTtcblxuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHBhcnQuZG9tTm9kZS5yZW1vdmUoKSB9KTtcblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0Q29sbGFwc2VCdXR0b24ocGFydDogQ2hhdFN1YmFnZW50Q29udGVudFBhcnQpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYnV0dG9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1sYWJlbCA+IC5tb25hY28tYnV0dG9uJyk7XG5cdFx0cmV0dXJuIGlzSFRNTEVsZW1lbnQoYnV0dG9uKSA/IGJ1dHRvbiA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYWJlbCA9IGJ1dHRvbi5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWJ1dHRvbi1tZGxhYmVsJyk7XG5cdFx0cmV0dXJuIGlzSFRNTEVsZW1lbnQobGFiZWwpID8gbGFiZWwgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRDb2xsYXBzZUJ1dHRvbkljb24oYnV0dG9uOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpY29uID0gYnV0dG9uLmZpcnN0RWxlbWVudENoaWxkO1xuXHRcdHJldHVybiBpc0hUTUxFbGVtZW50KGljb24pID8gaWNvbiA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldFdyYXBwZXJFbGVtZW50KHBhcnQ6IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0KTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHdyYXBwZXIgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdGhpbmtpbmctY29sbGFwc2libGUnKTtcblx0XHRyZXR1cm4gaXNIVE1MRWxlbWVudCh3cmFwcGVyKSA/IHdyYXBwZXIgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRPcGVuQ2hhdENvbnRleHQocGFydDogQ2hhdFN1YmFnZW50Q29udGVudFBhcnQpOiB7IGNoYXRSZXNvdXJjZTogc3RyaW5nOyBjb25maXJtYXRpb25Db3VudDogbnVtYmVyOyBjb25maXJtYXRpb25BY3RpdmU/OiBib29sZWFuOyBzdGFydGVkQXQ/OiBudW1iZXI7IGR1cmF0aW9uPzogbnVtYmVyOyBtb2RlbE5hbWU/OiBzdHJpbmc7IGFjdGl2ZVRvb2xDYWxsSWQ/OiBzdHJpbmc7IGFjdGl2ZVRvb2xMYWJlbD86IHN0cmluZzsgYWN0aXZlVG9vbEljb24/OiBUaGVtZUljb24gfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIChwYXJ0IGFzIHVua25vd24gYXMgeyBfb3BlbkNoYXRUb29sYmFyPzogeyBhY3Rpb25CYXI/OiB7IGNvbnRleHQ/OiB7IGNoYXRSZXNvdXJjZTogc3RyaW5nOyBjb25maXJtYXRpb25Db3VudDogbnVtYmVyOyBjb25maXJtYXRpb25BY3RpdmU/OiBib29sZWFuOyBzdGFydGVkQXQ/OiBudW1iZXI7IGR1cmF0aW9uPzogbnVtYmVyOyBtb2RlbE5hbWU/OiBzdHJpbmc7IGFjdGl2ZVRvb2xDYWxsSWQ/OiBzdHJpbmc7IGFjdGl2ZVRvb2xMYWJlbD86IHN0cmluZzsgYWN0aXZlVG9vbEljb24/OiBUaGVtZUljb24gfSB9IH0gfSkuX29wZW5DaGF0VG9vbGJhcj8uYWN0aW9uQmFyPy5jb250ZXh0O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0T3BlbkNoYXRPbmx5TW9kZShwYXJ0OiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCwgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHRvb2xiYXIgPSAocGFydCBhcyB1bmtub3duIGFzIHsgX29wZW5DaGF0VG9vbGJhcj86IHsgZ2V0SXRlbXNMZW5ndGgoKTogbnVtYmVyOyBnZXRJdGVtQWN0aW9uKGluZGV4OiBudW1iZXIpOiBBY3Rpb24gfCB1bmRlZmluZWQgfSB9KS5fb3BlbkNoYXRUb29sYmFyO1xuXHRcdGFzc2VydC5vayh0b29sYmFyKTtcblx0XHRjb25zdCBhY3Rpb24gPSBzdG9yZS5hZGQobmV3IEFjdGlvbignb3BlblN1YmFnZW50JywgJ09wZW4gU3ViYWdlbnQnLCAnJywgZW5hYmxlZCkpO1xuXHRcdHRvb2xiYXIuZ2V0SXRlbXNMZW5ndGggPSAoKSA9PiAxO1xuXHRcdHRvb2xiYXIuZ2V0SXRlbUFjdGlvbiA9ICgpID0+IGFjdGlvbjtcblx0XHQocGFydCBhcyB1bmtub3duIGFzIHsgX3VwZGF0ZU9wZW5DaGF0T25seU1vZGUoKTogdm9pZCB9KS5fdXBkYXRlT3BlbkNoYXRPbmx5TW9kZSgpO1xuXHR9XG5cblx0c3VpdGUoJ0Jhc2ljIHJlbmRlcmluZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgY3JlYXRlIHN1YmFnZW50IHBhcnQgd2l0aCBjb3JyZWN0IGNsYXNzZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC10aGlua2luZy1ib3gnKSwgJ1Nob3VsZCBoYXZlIGNoYXQtdGhpbmtpbmctYm94IGNsYXNzJyk7XG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zdWJhZ2VudC1wYXJ0JyksICdTaG91bGQgaGF2ZSBjaGF0LXN1YmFnZW50LXBhcnQgY2xhc3MnKTtcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXRoaW5raW5nLWZpeGVkLW1vZGUnKSwgJ1Nob3VsZCBoYXZlIGNoYXQtdGhpbmtpbmctZml4ZWQtbW9kZSBjbGFzcycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRhYmxlJyksICdTaG91bGQgcHJlcGFyZSBleHBhbmRhYmxlIGNvbnRlbnQgZm9yIGFuaW1hdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRlZCcpLCBmYWxzZSwgJ1Nob3VsZCBwcmVzZXJ2ZSB0aGUgY29sbGFwc2VkIHN0cmVhbWluZyBwcmV2aWV3IGF0IHJlc3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZW5kZXIgdGhlIG9wZW4tY2hhdCB0b29sYmFyIGJlc2lkZSB0aGUgY29sbGFwc2UgYnV0dG9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHN1YmFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0fVxuXHRcdFx0fSksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdXNlZC1jb250ZXh0LWxhYmVsJyk7XG5cdFx0XHRjb25zdCB0b29sYmFyID0gaGVhZGVyPy5xdWVyeVNlbGVjdG9yKCcuY2hhdC1zdWJhZ2VudC1vcGVuLWNoYXQtdG9vbGJhcicpO1xuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc0NoYXRDbGFzczogcGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zdWJhZ2VudC1oYXMtY2hhdCcpLFxuXHRcdFx0XHR0b29sYmFyUGFyZW50SXNIZWFkZXI6IHRvb2xiYXI/LnBhcmVudEVsZW1lbnQgPT09IGhlYWRlcixcblx0XHRcdFx0dG9vbGJhclByZWNlZGVzQ29sbGFwc2VCdXR0b246IHRvb2xiYXI/Lm5leHRFbGVtZW50U2libGluZyA9PT0gY29sbGFwc2VCdXR0b24sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGhhc0NoYXRDbGFzczogdHJ1ZSxcblx0XHRcdFx0dG9vbGJhclBhcmVudElzSGVhZGVyOiB0cnVlLFxuXHRcdFx0XHR0b29sYmFyUHJlY2VkZXNDb2xsYXBzZUJ1dHRvbjogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIGlubGluZSByZW5kZXJpbmcgd2hlbiByaWNoIHN1YmFnZW50IHJlbmRlcmluZyBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSBhcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlN1YmFnZW50c1VzZVJpY2hSZW5kZXJpbmcsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBzdWJhZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aGFzQ2hhdENsYXNzOiBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXN1YmFnZW50LWhhcy1jaGF0JyksXG5cdFx0XHRcdGhhc1Rvb2xiYXI6ICEhcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXN1YmFnZW50LW9wZW4tY2hhdC10b29sYmFyJyksXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uVmlzaWJsZTogZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk/LnN0eWxlLmRpc3BsYXkgIT09ICdub25lJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzQ2hhdENsYXNzOiBmYWxzZSxcblx0XHRcdFx0aGFzVG9vbGJhcjogZmFsc2UsXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uVmlzaWJsZTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRlcml2ZSB0aGUgZWRpdG9yIHJlc291cmNlIGZyb20gdGhlIHBhcmVudCBzZXNzaW9uIGFuZCBzdWJhZ2VudCBjaGF0IGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBnZXRTdWJhZ2VudEVkaXRvclJlc291cmNlKHtcblx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC9ZMjl3YVd4dmRHTnNhVG92YzJWemMybHZiZy90b29sLWNhbGwnLFxuXHRcdFx0XHRwYXJlbnRTZXNzaW9uUmVzb3VyY2U6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L3Nlc3Npb24nLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb3VyY2UgJiYge1xuXHRcdFx0XHRzY2hlbWU6IHJlc291cmNlLnNjaGVtZSxcblx0XHRcdFx0cGF0aDogcmVzb3VyY2UucGF0aCxcblx0XHRcdFx0ZnJhZ21lbnQ6IHJlc291cmNlLmZyYWdtZW50LFxuXHRcdFx0XHRjaGF0UmVzb3VyY2U6IG5ldyBVUkxTZWFyY2hQYXJhbXMocmVzb3VyY2UucXVlcnkpLmdldChDSEFUX1NVQkFHRU5UX1JFU09VUkNFX1FVRVJZX1BBUkFNKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyxcblx0XHRcdFx0cGF0aDogJy9zZXNzaW9uJyxcblx0XHRcdFx0ZnJhZ21lbnQ6ICdzdWJhZ2VudC90b29sLWNhbGwnLFxuXHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L1kyOXdhV3h2ZEdOc2FUb3ZjMlZ6YzJsdmJnL3Rvb2wtY2FsbCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IGNvbXBhY3QgZWxhcHNlZCB0aW1lIHdpdGhvdXQgd29ya2VkLWZvciBjb3B5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJ1bm5pbmc6IGZvcm1hdENvbXBhY3RTdWJhZ2VudER1cmF0aW9uKDFfMDAwLCB1bmRlZmluZWQsIDY2XzAwMCksXG5cdFx0XHRcdGNvbXBsZXRlZDogZm9ybWF0Q29tcGFjdFN1YmFnZW50RHVyYXRpb24oMV8wMDAsIDY1XzAwMCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJ1bm5pbmc6ICcxbSA1cycsXG5cdFx0XHRcdGNvbXBsZXRlZDogJzFtIDVzJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFuaW1hdGUgb25seSB3aGVuIHRoZSBhY3RpdmUgdG9vbCBjYWxsIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0d29ya2luZ1RvV29ya2luZzogc2hvdWxkQW5pbWF0ZVN1YmFnZW50VG9vbFRyYW5zaXRpb24odW5kZWZpbmVkLCBmYWxzZSwgdW5kZWZpbmVkLCBmYWxzZSksXG5cdFx0XHRcdHdvcmtpbmdUb1Rvb2w6IHNob3VsZEFuaW1hdGVTdWJhZ2VudFRvb2xUcmFuc2l0aW9uKHVuZGVmaW5lZCwgZmFsc2UsICd0b29sLTEnLCB0cnVlKSxcblx0XHRcdFx0c2FtZVRvb2w6IHNob3VsZEFuaW1hdGVTdWJhZ2VudFRvb2xUcmFuc2l0aW9uKCd0b29sLTEnLCB0cnVlLCAndG9vbC0xJywgdHJ1ZSksXG5cdFx0XHRcdGRpZmZlcmVudFRvb2w6IHNob3VsZEFuaW1hdGVTdWJhZ2VudFRvb2xUcmFuc2l0aW9uKCd0b29sLTEnLCB0cnVlLCAndG9vbC0yJywgdHJ1ZSksXG5cdFx0XHRcdHRvb2xUb1dvcmtpbmc6IHNob3VsZEFuaW1hdGVTdWJhZ2VudFRvb2xUcmFuc2l0aW9uKCd0b29sLTEnLCB0cnVlLCB1bmRlZmluZWQsIGZhbHNlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0d29ya2luZ1RvV29ya2luZzogZmFsc2UsXG5cdFx0XHRcdHdvcmtpbmdUb1Rvb2w6IHRydWUsXG5cdFx0XHRcdHNhbWVUb29sOiBmYWxzZSxcblx0XHRcdFx0ZGlmZmVyZW50VG9vbDogdHJ1ZSxcblx0XHRcdFx0dG9vbFRvV29ya2luZzogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNldHRsZSBhIHF1ZXVlZCBzYW1lLXRvb2wgbGFiZWwgdXBkYXRlIHdpdGhvdXQgc3RhcnRpbmcgYW5vdGhlciB0cmFuc2l0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gc3RvcmUuYWRkKG5ldyBBY3Rpb24oJ29wZW5TdWJhZ2VudCcsICdPcGVuIFN1YmFnZW50JykpO1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdE9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdHt9LFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCkpO1xuXHRcdFx0dmlld0l0ZW0ucmVuZGVyKG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdFx0Y29uc3QgaW50ZXJuYWxzID0gdmlld0l0ZW0gYXMgdW5rbm93biBhcyB7XG5cdFx0XHRcdF9kaXNwbGF5ZWRUb29sQ2FsbElkOiBzdHJpbmc7XG5cdFx0XHRcdF9kaXNwbGF5ZWRUb29sTGFiZWw6IHN0cmluZztcblx0XHRcdFx0X3RhcmdldFRvb2xDYWxsSWQ6IHN0cmluZztcblx0XHRcdFx0X3RhcmdldFRvb2xMYWJlbDogc3RyaW5nO1xuXHRcdFx0XHRfdG9vbFRyYW5zaXRpb25QaGFzZTogJ2lkbGUnIHwgJ291dCcgfCAnaW4nO1xuXHRcdFx0XHRfcnVuVG9vbFRyYW5zaXRpb24oKTogdm9pZDtcblx0XHRcdH07XG5cdFx0XHRpbnRlcm5hbHMuX2Rpc3BsYXllZFRvb2xDYWxsSWQgPSAndG9vbC0xJztcblx0XHRcdGludGVybmFscy5fZGlzcGxheWVkVG9vbExhYmVsID0gJ1JlYWQnO1xuXHRcdFx0aW50ZXJuYWxzLl90YXJnZXRUb29sQ2FsbElkID0gJ3Rvb2wtMSc7XG5cdFx0XHRpbnRlcm5hbHMuX3RhcmdldFRvb2xMYWJlbCA9ICdSZWFkaW5nIHBhY2thZ2UuanNvbic7XG5cdFx0XHRpbnRlcm5hbHMuX3Rvb2xUcmFuc2l0aW9uUGhhc2UgPSAnaWRsZSc7XG5cblx0XHRcdGludGVybmFscy5fcnVuVG9vbFRyYW5zaXRpb24oKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGRpc3BsYXllZExhYmVsOiBpbnRlcm5hbHMuX2Rpc3BsYXllZFRvb2xMYWJlbCxcblx0XHRcdFx0dHJhbnNpdGlvblBoYXNlOiBpbnRlcm5hbHMuX3Rvb2xUcmFuc2l0aW9uUGhhc2UsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGRpc3BsYXllZExhYmVsOiAnUmVhZGluZyBwYWNrYWdlLmpzb24nLFxuXHRcdFx0XHR0cmFuc2l0aW9uUGhhc2U6ICdpZGxlJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc2VydmUgYW4gYWN0aXZpdHkgcm93IGJlZm9yZSB0aGUgZmlyc3QgdG9vbCBjYWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gc3RvcmUuYWRkKG5ldyBBY3Rpb24oJ29wZW5TdWJhZ2VudCcsICdPcGVuIFN1YmFnZW50JykpO1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdE9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvWTI5d2FXeHZkR05zYVRvdmMyVnpjMmx2YmcvdG9vbC1jYWxsJyxcblx0XHRcdFx0XHRwYXJlbnRTZXNzaW9uUmVzb3VyY2U6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L3Nlc3Npb24nLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdHt9LFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCkpO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHZpZXdJdGVtLnJlbmRlcihjb250YWluZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZpdHkgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LXN1YmFnZW50LXBpbGwtYWN0aXZlLXRvb2wnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhpZGRlbjogYWN0aXZpdHk/LmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJyksXG5cdFx0XHRcdGxhYmVsOiBhY3Rpdml0eT8ucXVlcnlTZWxlY3RvcignLmNoYXQtc3ViYWdlbnQtcGlsbC1hY3RpdmUtdG9vbC1sYWJlbCcpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0aGFzV29ya2luZ0ljb246IGFjdGl2aXR5Py5xdWVyeVNlbGVjdG9yKCcuY2hhdC1zdWJhZ2VudC1waWxsLWFjdGl2ZS10b29sLWljb24nKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uLWNvbW1lbnQnKSxcblx0XHRcdFx0YXJpYUxhYmVsOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGhpZGRlbjogZmFsc2UsXG5cdFx0XHRcdGxhYmVsOiAnV29ya2luZyBvbiBpdC4uLicsXG5cdFx0XHRcdGhhc1dvcmtpbmdJY29uOiB0cnVlLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdPcGVuIFN1YmFnZW50LiBTdWJhZ2VudCBpcyB3b3JraW5nJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNhbml0aXplIGFnZW50LXByb3ZpZGVkIG1hcmtkb3duIGluIGFjdGl2ZSB0b29sIGxhYmVscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHN0b3JlLmFkZChuZXcgQWN0aW9uKCdvcGVuU3ViYWdlbnQnLCAnT3BlbiBTdWJhZ2VudCcpKTtcblx0XHRcdGNvbnN0IHZpZXdJdGVtID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L1kyOXdhV3h2ZEdOc2FUb3ZjMlZ6YzJsdmJnL3Rvb2wtY2FsbCcsXG5cdFx0XHRcdFx0cGFyZW50U2Vzc2lvblJlc291cmNlOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9zZXNzaW9uJyxcblx0XHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRhY3RpdmVUb29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0XHRhY3RpdmVUb29sTGFiZWw6ICchW3JlbW90ZV0oaHR0cHM6Ly9leGFtcGxlLmNvbS9pbWFnZS5wbmcpJyxcblx0XHRcdFx0XHRhY3RpdmVUb29sSWNvbjogQ29kaWNvbi5zZWFyY2gsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0e30sXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KSk7XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dmlld0l0ZW0ucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtc3ViYWdlbnQtcGlsbC1hY3RpdmUtdG9vbC1sYWJlbCBpbWcnKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRyYW5zaXRpb24gYmV0d2VlbiBnZW5lcmljIGFuZCB0b29sIGFjdGl2aXR5IHNlbWFudGljcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJhc2VDb250ZXh0ID0ge1xuXHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L1kyOXdhV3h2ZEdOc2FUb3ZjMlZ6YzJsdmJnL3Rvb2wtY2FsbCcsXG5cdFx0XHRcdHBhcmVudFNlc3Npb25SZXNvdXJjZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaTovc2Vzc2lvbicsXG5cdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHN0b3JlLmFkZChuZXcgQWN0aW9uKCdvcGVuU3ViYWdlbnQnLCAnT3BlbiBTdWJhZ2VudCcpKTtcblx0XHRcdGNvbnN0IHZpZXdJdGVtID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdGJhc2VDb250ZXh0LFxuXHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdHt9LFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCkpO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHZpZXdJdGVtLnJlbmRlcihjb250YWluZXIpO1xuXHRcdFx0Y29uc3QgaW50ZXJuYWxzID0gdmlld0l0ZW0gYXMgdW5rbm93biBhcyB7IF9maW5pc2hUb29sVHJhbnNpdGlvbigpOiB2b2lkIH07XG5cblx0XHRcdHZpZXdJdGVtLnNldEFjdGlvbkNvbnRleHQoe1xuXHRcdFx0XHQuLi5iYXNlQ29udGV4dCxcblx0XHRcdFx0YWN0aXZlVG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRcdGFjdGl2ZVRvb2xMYWJlbDogJ1NlYXJjaCBUb29scycsXG5cdFx0XHRcdGFjdGl2ZVRvb2xJY29uOiBDb2RpY29uLnNlYXJjaCxcblx0XHRcdH0pO1xuXHRcdFx0aW50ZXJuYWxzLl9maW5pc2hUb29sVHJhbnNpdGlvbigpO1xuXHRcdFx0Y29uc3QgdG9vbFN0YXRlID0ge1xuXHRcdFx0XHRsYWJlbDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXN1YmFnZW50LXBpbGwtYWN0aXZlLXRvb2wtbGFiZWwnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGFyaWFMYWJlbDogY29udGFpbmVyLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdFx0fTtcblx0XHRcdHZpZXdJdGVtLnNldEFjdGlvbkNvbnRleHQoYmFzZUNvbnRleHQpO1xuXHRcdFx0aW50ZXJuYWxzLl9maW5pc2hUb29sVHJhbnNpdGlvbigpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dG9vbFN0YXRlLFxuXHRcdFx0XHR3b3JraW5nTGFiZWw6IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1zdWJhZ2VudC1waWxsLWFjdGl2ZS10b29sLWxhYmVsJyk/LnRleHRDb250ZW50LFxuXHRcdFx0XHR3b3JraW5nQXJpYUxhYmVsOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRvb2xTdGF0ZToge1xuXHRcdFx0XHRcdGxhYmVsOiAnU2VhcmNoIFRvb2xzJyxcblx0XHRcdFx0XHRhcmlhTGFiZWw6ICdPcGVuIFN1YmFnZW50LiBTdWJhZ2VudCBpcyB3b3JraW5nLiBBY3RpdmUgdG9vbCBTZWFyY2ggVG9vbHMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3b3JraW5nTGFiZWw6ICdXb3JraW5nIG9uIGl0Li4uJyxcblx0XHRcdFx0d29ya2luZ0FyaWFMYWJlbDogJ09wZW4gU3ViYWdlbnQuIFN1YmFnZW50IGlzIHdvcmtpbmcnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgb3BlbiB0aGUgc3ViYWdlbnQgY2hhdCBkaXJlY3RseSBpbiBhbiBlZGl0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgb3BlbmVkUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB1cGNhc3RQYXJ0aWFsPElDaGF0V2lkZ2V0U2VydmljZT4oe1xuXHRcdFx0XHRvcGVuU2Vzc2lvbjogYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRcdG9wZW5lZFJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHN0b3JlLmFkZChuZXcgQWN0aW9uKCdvcGVuU3ViYWdlbnQnLCAnT3BlbiBTdWJhZ2VudCcpKTtcblx0XHRcdGNvbnN0IHZpZXdJdGVtID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L1kyOXdhV3h2ZEdOc2FUb3ZjMlZ6YzJsdmJnL3Rvb2wtY2FsbCcsXG5cdFx0XHRcdFx0cGFyZW50U2Vzc2lvblJlc291cmNlOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9zZXNzaW9uJyxcblx0XHRcdFx0XHR0aXRsZTogJ1JldmlldyBjb3JyZWN0bmVzcyByaXNrcycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0e30sXG5cdFx0XHRcdHRydWUsXG5cdFx0XHQpKTtcblxuXHRcdFx0YXdhaXQgdmlld0l0ZW0uYWN0aW9uLnJ1bih7XG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvWTI5d2FXeHZkR05zYVRvdmMyVnpjMmx2YmcvdG9vbC1jYWxsJyxcblx0XHRcdFx0cGFyZW50U2Vzc2lvblJlc291cmNlOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9zZXNzaW9uJyxcblx0XHRcdFx0dGl0bGU6ICdSZXZpZXcgY29ycmVjdG5lc3Mgcmlza3MnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkUmVzb3VyY2UgJiYge1xuXHRcdFx0XHRzY2hlbWU6IG9wZW5lZFJlc291cmNlLnNjaGVtZSxcblx0XHRcdFx0cGF0aDogb3BlbmVkUmVzb3VyY2UucGF0aCxcblx0XHRcdFx0ZnJhZ21lbnQ6IG9wZW5lZFJlc291cmNlLmZyYWdtZW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLFxuXHRcdFx0XHRwYXRoOiAnL3Nlc3Npb24nLFxuXHRcdFx0XHRmcmFnbWVudDogJ3N1YmFnZW50L3Rvb2wtY2FsbCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0cmlnZ2VyIHBvaW50ZXIgYWN0aXZhdGlvbiBvbmx5IGZyb20gdGhlIGJvcmRlcmVkIHBpbGwnLCAoKSA9PiB7XG5cdFx0XHRsZXQgcnVuQ291bnQgPSAwO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gc3RvcmUuYWRkKG5ldyBBY3Rpb24oJ29wZW5TdWJhZ2VudCcsICdPcGVuIFN1YmFnZW50JywgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7IHJ1bkNvdW50Kys7IH0pKTtcblx0XHRcdGNvbnN0IHZpZXdJdGVtID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L1kyOXdhV3h2ZEdOc2FUb3ZjMlZ6YzJsdmJnL3Rvb2wtY2FsbCcsXG5cdFx0XHRcdFx0cGFyZW50U2Vzc2lvblJlc291cmNlOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9zZXNzaW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHR7fSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR2aWV3SXRlbS5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVRvb2wgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LXN1YmFnZW50LXBpbGwtYWN0aXZlLXRvb2wnKTtcblx0XHRcdGNvbnN0IHBpbGwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LXN1YmFnZW50LXBpbGwtY29udGVudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGl2ZVRvb2wpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBpbGwpO1xuXG5cdFx0XHRhY3RpdmVUb29sLmRpc3BhdGNoRXZlbnQobmV3IG1haW5XaW5kb3cuTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdFx0Y29uc3Qgb3V0c2lkZVJ1bkNvdW50ID0gcnVuQ291bnQ7XG5cdFx0XHRwaWxsLmRpc3BhdGNoRXZlbnQobmV3IG1haW5XaW5kb3cuTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0b3V0c2lkZVJ1bkNvdW50LFxuXHRcdFx0XHRwaWxsUnVuQ291bnQ6IHJ1bkNvdW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvdXRzaWRlUnVuQ291bnQ6IDAsXG5cdFx0XHRcdHBpbGxSdW5Db3VudDogMSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBhIG1lbnUgc25hcHNob3Qgd2l0aG91dCBwZXJzaXN0ZW50IG1lbnUgb3IgYWN0aW9uLXZpZXcgbGlzdGVuZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHN1YmFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0fVxuXHRcdFx0fSksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRoYXNUb29sYmFyOiAhIShwYXJ0IGFzIHVua25vd24gYXMgeyBfb3BlbkNoYXRUb29sYmFyPzogb2JqZWN0IH0pLl9vcGVuQ2hhdFRvb2xiYXIsXG5cdFx0XHRcdGNyZWF0ZU1lbnVDYWxsczogbWVudVNlcnZpY2UuY3JlYXRlTWVudUNhbGxzLFxuXHRcdFx0XHRnZXRNZW51QWN0aW9uc0NhbGxzOiBtZW51U2VydmljZS5nZXRNZW51QWN0aW9uc0NhbGxzLFxuXHRcdFx0XHRoYXNBY3Rpb25WaWV3TGlzdGVuZXJzOiBhY3Rpb25WaWV3SXRlbVNlcnZpY2UuaGFzQ2hhbmdlTGlzdGVuZXJzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRoYXNUb29sYmFyOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVNZW51Q2FsbHM6IDAsXG5cdFx0XHRcdGdldE1lbnVBY3Rpb25zQ2FsbHM6IDEsXG5cdFx0XHRcdGhhc0FjdGlvblZpZXdMaXN0ZW5lcnM6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGlkZSB0aGUgY29tcGxldGUgY29sbGFwc2libGUgc3VyZmFjZSB3aGVuIHRoZSBvcGVuLWNoYXQgYWN0aW9uIGlzIGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBzdWJhZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXHRcdFx0c2V0T3BlbkNoYXRPbmx5TW9kZShwYXJ0LCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRhaW5lciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24nKTtcblx0XHRcdGFzc2VydC5vayhjb2xsYXBzZUJ1dHRvbik7XG5cdFx0XHRhc3NlcnQub2soYW5pbWF0aW9uQ29udGFpbmVyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcGVuQ2hhdE9ubHlDbGFzczogcGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zdWJhZ2VudC1vcGVuLWNoYXQtb25seScpLFxuXHRcdFx0XHRjb2xsYXBzZUJ1dHRvbkRpc3BsYXk6IGNvbGxhcHNlQnV0dG9uLnN0eWxlLmRpc3BsYXksXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6IGFuaW1hdGlvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcGVuQ2hhdE9ubHlDbGFzczogdHJ1ZSxcblx0XHRcdFx0Y29sbGFwc2VCdXR0b25EaXNwbGF5OiAnbm9uZScsXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6ICdub25lJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGh5ZHJhdGUgb3Blbi1jaGF0LW9ubHkgbW9kZSB3aGVuIHRoZSBhY3Rpb24gdmlldyByZWdpc3RlcnMgYWZ0ZXIgcmVuZGVyaW5nJywgKCkgPT4ge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnNldFByb3ZpZGVyQXZhaWxhYmxlKGZhbHNlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBzdWJhZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXHRcdFx0Y29uc3QgbGlzdGVuaW5nQmVmb3JlUmVnaXN0cmF0aW9uID0gYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmhhc0NoYW5nZUxpc3RlbmVycztcblxuXHRcdFx0YWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnNldFByb3ZpZGVyQXZhaWxhYmxlKHRydWUpO1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmZpcmVEaWRDaGFuZ2UoTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnQpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uQ29udGFpbmVyID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGlvbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxpc3RlbmluZ0JlZm9yZVJlZ2lzdHJhdGlvbixcblx0XHRcdFx0bGlzdGVuaW5nQWZ0ZXJSZWdpc3RyYXRpb246IGFjdGlvblZpZXdJdGVtU2VydmljZS5oYXNDaGFuZ2VMaXN0ZW5lcnMsXG5cdFx0XHRcdG9wZW5DaGF0T25seUNsYXNzOiBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXN1YmFnZW50LW9wZW4tY2hhdC1vbmx5JyksXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uRGlzcGxheTogY29sbGFwc2VCdXR0b24/LnN0eWxlLmRpc3BsYXksXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6IGFuaW1hdGlvbkNvbnRhaW5lcj8uc3R5bGUuZGlzcGxheSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bGlzdGVuaW5nQmVmb3JlUmVnaXN0cmF0aW9uOiB0cnVlLFxuXHRcdFx0XHRsaXN0ZW5pbmdBZnRlclJlZ2lzdHJhdGlvbjogZmFsc2UsXG5cdFx0XHRcdG9wZW5DaGF0T25seUNsYXNzOiB0cnVlLFxuXHRcdFx0XHRjb2xsYXBzZUJ1dHRvbkRpc3BsYXk6ICdub25lJyxcblx0XHRcdFx0YW5pbWF0aW9uRGlzcGxheTogJ25vbmUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzZXJ2ZSB0aGUgcGlsbCBwcmVzZW50YXRpb24gd2hpbGUgYW4gQWdlbnQgSG9zdCBjaGlsZCBjaGF0IGh5ZHJhdGVzJywgKCkgPT4ge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnNldFByb3ZpZGVyQXZhaWxhYmxlKGZhbHNlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCBzdWJhZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSwgVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L3Nlc3Npb24nKSkpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uQ29udGFpbmVyID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGlvbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc1Rvb2xiYXI6ICEhcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXN1YmFnZW50LW9wZW4tY2hhdC10b29sYmFyJyksXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uRGlzcGxheTogY29sbGFwc2VCdXR0b24/LnN0eWxlLmRpc3BsYXksXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6IGFuaW1hdGlvbkNvbnRhaW5lcj8uc3R5bGUuZGlzcGxheSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzVG9vbGJhcjogZmFsc2UsXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uRGlzcGxheTogJ25vbmUnLFxuXHRcdFx0XHRhbmltYXRpb25EaXNwbGF5OiAnbm9uZScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSB0aGUgY29sbGFwc2libGUgc3VyZmFjZSB3aGVuIHRoZSBvcGVuLWNoYXQgYWN0aW9uIGlzIHVuYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHN1YmFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0fVxuXHRcdFx0fSksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cdFx0XHRzZXRPcGVuQ2hhdE9ubHlNb2RlKHBhcnQsIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRhaW5lciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24nKTtcblx0XHRcdGFzc2VydC5vayhjb2xsYXBzZUJ1dHRvbik7XG5cdFx0XHRhc3NlcnQub2soYW5pbWF0aW9uQ29udGFpbmVyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcGVuQ2hhdE9ubHlDbGFzczogcGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1zdWJhZ2VudC1vcGVuLWNoYXQtb25seScpLFxuXHRcdFx0XHRjb2xsYXBzZUJ1dHRvbkRpc3BsYXk6IGNvbGxhcHNlQnV0dG9uLnN0eWxlLmRpc3BsYXksXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6IGFuaW1hdGlvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcGVuQ2hhdE9ubHlDbGFzczogZmFsc2UsXG5cdFx0XHRcdGNvbGxhcHNlQnV0dG9uRGlzcGxheTogJycsXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6ICcnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHVibGlzaCB0aGUgbW9kZWwgYW5kIG5ld2VzdCBjaGlsZCB0b29sIGludGVudCB0byB0aGUgb3Blbi1jaGF0IHBpbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlc3Qgc3ViYWdlbnQgZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHRcdG1vZGVsTmFtZTogJ0NsYXVkZSBTb25uZXQgNCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjaGlsZC10b29sLTEnLFxuXHRcdFx0XHR0b29sSWQ6ICdzZWFyY2gnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJyAgU2VhcmNoXFxuICB0aGUgY29kZWJhc2UgICcsXG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk7XG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjaGlsZC10b29sLTInLFxuXHRcdFx0XHR0b29sSWQ6ICdyZWFkX2ZpbGUnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWQgcGFja2FnZS5qc29uJyxcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBzZWNvbmQgPSBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk7XG5cdFx0XHRwYXJ0Lm1hcmtBc0luYWN0aXZlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmaXJzdE1vZGVsOiBmaXJzdD8ubW9kZWxOYW1lLFxuXHRcdFx0XHRmaXJzdFRvb2xDYWxsSWQ6IGZpcnN0Py5hY3RpdmVUb29sQ2FsbElkLFxuXHRcdFx0XHRmaXJzdFRvb2w6IGZpcnN0Py5hY3RpdmVUb29sTGFiZWwsXG5cdFx0XHRcdGZpcnN0VG9vbEljb246IGZpcnN0Py5hY3RpdmVUb29sSWNvbj8uaWQsXG5cdFx0XHRcdHNlY29uZFRvb2w6IHNlY29uZD8uYWN0aXZlVG9vbExhYmVsLFxuXHRcdFx0XHRzZWNvbmRUb29sQ2FsbElkOiBzZWNvbmQ/LmFjdGl2ZVRvb2xDYWxsSWQsXG5cdFx0XHRcdHNlY29uZFRvb2xJY29uOiBzZWNvbmQ/LmFjdGl2ZVRvb2xJY29uPy5pZCxcblx0XHRcdFx0Y29tcGxldGVkVG9vbDogZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpPy5hY3RpdmVUb29sTGFiZWwsXG5cdFx0XHRcdGNvbXBsZXRlZFRvb2xJY29uOiBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk/LmFjdGl2ZVRvb2xJY29uLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRmaXJzdE1vZGVsOiAnQ2xhdWRlIFNvbm5ldCA0Jyxcblx0XHRcdFx0Zmlyc3RUb29sQ2FsbElkOiAnY2hpbGQtdG9vbC0xJyxcblx0XHRcdFx0Zmlyc3RUb29sOiAnU2VhcmNoIHRoZSBjb2RlYmFzZScsXG5cdFx0XHRcdGZpcnN0VG9vbEljb246ICdzZWFyY2gnLFxuXHRcdFx0XHRzZWNvbmRUb29sOiAnUmVhZCBwYWNrYWdlLmpzb24nLFxuXHRcdFx0XHRzZWNvbmRUb29sQ2FsbElkOiAnY2hpbGQtdG9vbC0yJyxcblx0XHRcdFx0c2Vjb25kVG9vbEljb246ICdib29rJyxcblx0XHRcdFx0Y29tcGxldGVkVG9vbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21wbGV0ZWRUb29sSWNvbjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0YWluIHRoZSBtb3N0IHJlY2VudCBjaGlsZCB0b29sIGFmdGVyIGl0IGNvbXBsZXRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykpO1xuXHRcdFx0Y29uc3QgY2hpbGRUb29sID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdjaGlsZC10b29sJyxcblx0XHRcdFx0XHR0b29sSWQ6ICdzZWFyY2gnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoIHRoZSBjb2RlYmFzZScsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZSxcblx0XHRcdH07XG5cblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY2hpbGRUb29sKTtcblx0XHRcdGNvbnN0IGV4ZWN1dGluZyA9IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KTtcblx0XHRcdHN0YXRlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgY29tcGxldGVkID0gZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZXhlY3V0aW5nVG9vbENhbGxJZDogZXhlY3V0aW5nPy5hY3RpdmVUb29sQ2FsbElkLFxuXHRcdFx0XHRleGVjdXRpbmdUb29sTGFiZWw6IGV4ZWN1dGluZz8uYWN0aXZlVG9vbExhYmVsLFxuXHRcdFx0XHRjb21wbGV0ZWRUb29sQ2FsbElkOiBjb21wbGV0ZWQ/LmFjdGl2ZVRvb2xDYWxsSWQsXG5cdFx0XHRcdGNvbXBsZXRlZFRvb2xMYWJlbDogY29tcGxldGVkPy5hY3RpdmVUb29sTGFiZWwsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGV4ZWN1dGluZ1Rvb2xDYWxsSWQ6ICdjaGlsZC10b29sJyxcblx0XHRcdFx0ZXhlY3V0aW5nVG9vbExhYmVsOiAnU2VhcmNoIHRoZSBjb2RlYmFzZScsXG5cdFx0XHRcdGNvbXBsZXRlZFRvb2xDYWxsSWQ6ICdjaGlsZC10b29sJyxcblx0XHRcdFx0Y29tcGxldGVkVG9vbExhYmVsOiAnU2VhcmNoIHRoZSBjb2RlYmFzZScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXN0b3JlIGFuIG9sZGVyIGFjdGl2ZSB0b29sIHdoZW4gdGhlIG5ld2VzdCB0b29sIGNvbXBsZXRlcyBmaXJzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblx0XHRcdGNvbnN0IGZpcnN0U3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ2ZpcnN0U3RhdGUnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpKTtcblx0XHRcdGNvbnN0IHNlY29uZFN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKCdzZWNvbmRTdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykpO1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZSh7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2ZpcnN0LXRvb2wnLFxuXHRcdFx0XHRcdHRvb2xJZDogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2ggdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBmaXJzdFN0YXRlLFxuXHRcdFx0fSk7XG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnc2Vjb25kLXRvb2wnLFxuXHRcdFx0XHRcdHRvb2xJZDogJ3JlYWRfZmlsZScsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIHBhY2thZ2UuanNvbicsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogc2Vjb25kU3RhdGUsXG5cdFx0XHR9KTtcblxuXHRcdFx0c2Vjb25kU3RhdGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCksIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpICYmIHtcblx0XHRcdFx0YWN0aXZlVG9vbENhbGxJZDogZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpPy5hY3RpdmVUb29sQ2FsbElkLFxuXHRcdFx0XHRhY3RpdmVUb29sTGFiZWw6IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uYWN0aXZlVG9vbExhYmVsLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhY3RpdmVUb29sQ2FsbElkOiAnZmlyc3QtdG9vbCcsXG5cdFx0XHRcdGFjdGl2ZVRvb2xMYWJlbDogJ1NlYXJjaCB0aGUgY29kZWJhc2UnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2hvdyB3b3JraW5nIGZvciBtYXJrZG93biBhbmQgcHJlc2VydmUgdGhlIG1vc3QgcmVjZW50IHRvb2wgZm9yIHJlYXNvbmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudERhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogJ2FocC1jaGF0Oi8vc3ViYWdlbnQvdGVzdC90b29sLWNhbGwnLFxuXHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwYXJlbnRTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSgncGFyZW50U3RhdGUnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpKTtcblx0XHRcdGNvbnN0IHBhcmVudFRvb2wgPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7IHRvb2xTcGVjaWZpY0RhdGE6IHBhcmVudERhdGEgfSksXG5cdFx0XHRcdHN0YXRlOiBwYXJlbnRTdGF0ZSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChwYXJlbnRUb29sLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXHRcdFx0Y29uc3QgY2hpbGRTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSgnY2hpbGRTdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykpO1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZSh7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2NoaWxkLXRvb2wnLFxuXHRcdFx0XHRcdHRvb2xJZDogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2ggdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBjaGlsZFN0YXRlLFxuXHRcdFx0fSk7XG5cdFx0XHRjaGlsZFN0YXRlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJUb29sID0gZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpO1xuXG5cdFx0XHRwYXJlbnREYXRhLmFjdGl2aXR5ID0gJ3JlYXNvbmluZyc7XG5cdFx0XHRwYXJlbnRTdGF0ZS5zZXQoeyAuLi5wYXJlbnRTdGF0ZS5nZXQoKSB9LCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgZHVyaW5nUmVhc29uaW5nID0gZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpO1xuXHRcdFx0cGFyZW50RGF0YS5hY3Rpdml0eSA9ICdtYXJrZG93bic7XG5cdFx0XHRwYXJlbnRTdGF0ZS5zZXQoeyAuLi5wYXJlbnRTdGF0ZS5nZXQoKSB9LCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgZHVyaW5nTWFya2Rvd24gPSBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRhZnRlclRvb2w6IGFmdGVyVG9vbD8uYWN0aXZlVG9vbExhYmVsLFxuXHRcdFx0XHRkdXJpbmdSZWFzb25pbmc6IGR1cmluZ1JlYXNvbmluZz8uYWN0aXZlVG9vbExhYmVsLFxuXHRcdFx0XHRkdXJpbmdNYXJrZG93bjogZHVyaW5nTWFya2Rvd24/LmFjdGl2ZVRvb2xMYWJlbCxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWZ0ZXJUb29sOiAnU2VhcmNoIHRoZSBjb2RlYmFzZScsXG5cdFx0XHRcdGR1cmluZ1JlYXNvbmluZzogJ1NlYXJjaCB0aGUgY29kZWJhc2UnLFxuXHRcdFx0XHRkdXJpbmdNYXJrZG93bjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJlZmVyIHRlcm1pbmFsIGludGVudGlvbiBvdmVyIHRoZSByYXcgY29tbWFuZCBpbnZvY2F0aW9uIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0fVxuXHRcdFx0fSksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cblx0XHRcdGNvbnN0IHRlcm1pbmFsVG9vbCA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0ZXJtaW5hbC10b29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGBncmVwIC1ybiBhY3RpdmVUb29sTGFiZWwgc3JjL3ZzL3Nlc3Npb25zYCcsXG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0fSk7XG5cdFx0XHQodGVybWluYWxUb29sIGFzIHsgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUb29sSW52b2NhdGlvblsndG9vbFNwZWNpZmljRGF0YSddIH0pLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7XG5cdFx0XHRcdFx0b3JpZ2luYWw6ICdncmVwIC1ybiBhY3RpdmVUb29sTGFiZWwgc3JjL3ZzL3Nlc3Npb25zJyxcblx0XHRcdFx0XHR0b29sRWRpdGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXNlckVkaXRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnRlbnRpb246ICdGaW5kIGFjdGl2ZSB0b29sIHJlbmRlcmluZycsXG5cdFx0XHRcdGxhbmd1YWdlOiAnYmFzaCcsXG5cdFx0XHR9O1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZSh0ZXJtaW5hbFRvb2wpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpPy5hY3RpdmVUb29sTGFiZWwsICdGaW5kIGFjdGl2ZSB0b29sIHJlbmRlcmluZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHdhaXQgZm9yIGEgcHJvdmlzaW9uYWwgdG9vbCBsYWJlbCB0byBnYWluIGludm9jYXRpb24gZGV0YWlsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2wgPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3JlYWQtdG9vbCcsXG5cdFx0XHRcdFx0dG9vbElkOiAncmVhZF9maWxlJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWQnLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGUsXG5cdFx0XHR9O1xuXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNoaWxkVG9vbCk7XG5cdFx0XHRjb25zdCBwcm92aXNpb25hbCA9IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uYWN0aXZlVG9vbExhYmVsO1xuXHRcdFx0Y2hpbGRUb29sLmludm9jYXRpb25NZXNzYWdlID0gJ1JlYWRpbmcgcGFja2FnZS5qc29uJztcblx0XHRcdHN0YXRlLnNldCh7IC4uLnN0YXRlLmdldCgpIH0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwcm92aXNpb25hbCxcblx0XHRcdFx0Zm9ybWVkOiBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk/LmFjdGl2ZVRvb2xMYWJlbCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHJvdmlzaW9uYWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0Zm9ybWVkOiAnUmVhZGluZyBwYWNrYWdlLmpzb24nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQga2VlcCB0aGUgcHJldmlvdXMgdG9vbCB2aXNpYmxlIHVudGlsIHRoZSBzdHJlYW1pbmcgdG9vbCBpcyBmb3JtZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0fVxuXHRcdFx0fSksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdwcmV2aW91cy10b29sJyxcblx0XHRcdFx0dG9vbElkOiAnc2VhcmNoJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2hpbmcgdGhlIHdvcmtzcGFjZScsXG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2wgPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3N0cmVhbWluZy10b29sJyxcblx0XHRcdFx0XHR0b29sSWQ6ICdyZWFkX2ZpbGUnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBwYWNrYWdlLmpzb24nLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGUsXG5cdFx0XHR9O1xuXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNoaWxkVG9vbCk7XG5cdFx0XHRjb25zdCBzdHJlYW1pbmcgPSBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk7XG5cdFx0XHRzdGF0ZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0cmVhbWluZ1Rvb2xDYWxsSWQ6IHN0cmVhbWluZz8uYWN0aXZlVG9vbENhbGxJZCxcblx0XHRcdFx0c3RyZWFtaW5nTGFiZWw6IHN0cmVhbWluZz8uYWN0aXZlVG9vbExhYmVsLFxuXHRcdFx0XHRmb3JtZWRUb29sQ2FsbElkOiBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk/LmFjdGl2ZVRvb2xDYWxsSWQsXG5cdFx0XHRcdGZvcm1lZExhYmVsOiBnZXRPcGVuQ2hhdENvbnRleHQocGFydCk/LmFjdGl2ZVRvb2xMYWJlbCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RyZWFtaW5nVG9vbENhbGxJZDogJ3ByZXZpb3VzLXRvb2wnLFxuXHRcdFx0XHRzdHJlYW1pbmdMYWJlbDogJ1NlYXJjaGluZyB0aGUgd29ya3NwYWNlJyxcblx0XHRcdFx0Zm9ybWVkVG9vbENhbGxJZDogJ3N0cmVhbWluZy10b29sJyxcblx0XHRcdFx0Zm9ybWVkTGFiZWw6ICdSZWFkaW5nIHBhY2thZ2UuanNvbicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBrZWVwIGNvbGxhcHNlZCBhbmltYXRlZCBjb250ZW50IG91dCBvZiBrZXlib2FyZCBuYXZpZ2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRhaW5lciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24nKTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRlbnQgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0aW9uLWlubmVyJyk7XG5cdFx0XHRjb25zdCBjaGV2cm9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWNvbGxhcHNpYmxlLWhvdmVyLWNoZXZyb24nKTtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuaW1hdGlvbkNvbnRhaW5lcik7XG5cdFx0XHRhc3NlcnQub2soYW5pbWF0aW9uQ29udGVudCk7XG5cdFx0XHRhc3NlcnQub2soY2hldnJvbik7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uKTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VkSW5lcnQgPSBhbmltYXRpb25Db250ZW50LmluZXJ0O1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkQ2hldnJvbkV4cGFuZGVkID0gY2hldnJvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJyk7XG5cdFx0XHRidXR0b24uY2xpY2soKTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkVuYWJsZWREdXJpbmdUb2dnbGUgPSBwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0ZWQnKTtcblx0XHRcdGNvbnN0IHRyYW5zaXRpb25FbmQgPSBuZXcgbWFpbldpbmRvdy5FdmVudCgndHJhbnNpdGlvbmVuZCcpO1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRyYW5zaXRpb25FbmQsICdwcm9wZXJ0eU5hbWUnLCB7IHZhbHVlOiAnZ3JpZC10ZW1wbGF0ZS1yb3dzJyB9KTtcblx0XHRcdGFuaW1hdGlvbkNvbnRhaW5lci5kaXNwYXRjaEV2ZW50KHRyYW5zaXRpb25FbmQpO1xuXHRcdFx0Y29uc3QgYW5pbWF0aW9uRW5hYmxlZEFmdGVyVG9nZ2xlID0gcGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGVkJyk7XG5cdFx0XHRhbmltYXRpb25Db250ZW50LmRpc3BhdGNoRXZlbnQobmV3IG1haW5XaW5kb3cuQ3VzdG9tRXZlbnQoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29sbGFwc2VkSW5lcnQsXG5cdFx0XHRcdGNvbGxhcHNlZENoZXZyb25FeHBhbmRlZCxcblx0XHRcdFx0YW5pbWF0aW9uRW5hYmxlZER1cmluZ1RvZ2dsZSxcblx0XHRcdFx0YW5pbWF0aW9uRW5hYmxlZEFmdGVyVG9nZ2xlLFxuXHRcdFx0XHRuZXN0ZWRUb2dnbGVJZ25vcmVkOiAhcGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGVkJyksXG5cdFx0XHRcdGV4cGFuZGVkSW5lcnQ6IGFuaW1hdGlvbkNvbnRlbnQuaW5lcnQsXG5cdFx0XHRcdGV4cGFuZGVkQ2hldnJvbkV4cGFuZGVkOiBjaGV2cm9uLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kZWQnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29sbGFwc2VkSW5lcnQ6IHRydWUsXG5cdFx0XHRcdGNvbGxhcHNlZENoZXZyb25FeHBhbmRlZDogZmFsc2UsXG5cdFx0XHRcdGFuaW1hdGlvbkVuYWJsZWREdXJpbmdUb2dnbGU6IHRydWUsXG5cdFx0XHRcdGFuaW1hdGlvbkVuYWJsZWRBZnRlclRvZ2dsZTogZmFsc2UsXG5cdFx0XHRcdG5lc3RlZFRvZ2dsZUlnbm9yZWQ6IHRydWUsXG5cdFx0XHRcdGV4cGFuZGVkSW5lcnQ6IGZhbHNlLFxuXHRcdFx0XHRleHBhbmRlZENoZXZyb25FeHBhbmRlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3RvcmUgdGhlIHN0cmVhbWluZyBwcmV2aWV3IHdoZW4gYW4gYW5pbWF0aW9uIGlzIGNhbmNlbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKCksIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cdFx0XHRjb25zdCBhbmltYXRpb25Db250YWluZXIgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0aW9uJyk7XG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhhbmltYXRpb25Db250YWluZXIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbik7XG5cblx0XHRcdGJ1dHRvbi5jbGljaygpO1xuXHRcdFx0YW5pbWF0aW9uQ29udGFpbmVyLmdldEFuaW1hdGlvbnMgPSAoKSA9PiBbXTtcblx0XHRcdGNvbnN0IHRyYW5zaXRpb25DYW5jZWwgPSBuZXcgbWFpbldpbmRvdy5FdmVudCgndHJhbnNpdGlvbmNhbmNlbCcpO1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRyYW5zaXRpb25DYW5jZWwsICdwcm9wZXJ0eU5hbWUnLCB7IHZhbHVlOiAnZ3JpZC10ZW1wbGF0ZS1yb3dzJyB9KTtcblx0XHRcdGFuaW1hdGlvbkNvbnRhaW5lci5kaXNwYXRjaEV2ZW50KHRyYW5zaXRpb25DYW5jZWwpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBtYWluV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXNvbHZlKCkpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRlZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2hpbW1lciBmb3IgYW4gaW4tcHJvZ3Jlc3Mgc3ViYWdlbnQgZXZlbiB3aGVuIHRoZSByZXNwb25zZSBpcyBjb21wbGV0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHsgc3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcgfSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQodHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC10aGlua2luZy10aXRsZS1zaGltbWVyJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzaGltbWVyIGZvciBhIGNvbXBsZXRlZCBzdWJhZ2VudCB3aGlsZSB0aGUgcmVzcG9uc2UgaXMgaW4gcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tTZXJpYWxpemVkVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbXBsZXRlZCB0YXNrJyxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpc0FjdGl2ZTogcGFydC5nZXRJc0FjdGl2ZSgpLFxuXHRcdFx0XHRoYXNTaGltbWVyOiAhIXBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC10aGlua2luZy10aXRsZS1zaGltbWVyJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0aGFzU2hpbW1lcjogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaGltbWVyIHdoaWxlIEFnZW50IEhvc3QgcmVwb3J0cyBhbiBhY3RpdmUgY2hpbGQgY2hhdCBhZnRlciB0b29sIGNvbXBsZXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tTZXJpYWxpemVkVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1J1bm5pbmcgY2hpbGQgY2hhdCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aXNBY3RpdmU6IHBhcnQuZ2V0SXNBY3RpdmUoKSxcblx0XHRcdFx0aGFzU2hpbW1lcjogISFwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdGhpbmtpbmctdGl0bGUtc2hpbW1lcicpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0aGFzU2hpbW1lcjogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0YXJ0IGNvbGxhcHNlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKCk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgJ1Nob3VsZCBiZSBjb2xsYXBzZWQgYnkgZGVmYXVsdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGl0bGUgZXh0cmFjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCB0aXRsZSB3aXRoIGFnZW50IG5hbWUgZnJvbSB0b29sU3BlY2lmaWNEYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ0NvZGVTZWFyY2hBZ2VudCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAnU2VhcmNoIGZvciBhdXRoZW50aWNhdGlvbidcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0Y29uc3QgYnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ0NvZGVTZWFyY2hBZ2VudCcpLCAnVGl0bGUgc2hvdWxkIGluY2x1ZGUgYWdlbnQgbmFtZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnKSwgJ1RpdGxlIHNob3VsZCBpbmNsdWRlIGRlc2NyaXB0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGRlZmF1bHQgcHJlZml4IHdoZW4gbm8gYWdlbnQgbmFtZSBpcyBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snXG5cdFx0XHRcdFx0Ly8gbm8gYWdlbnROYW1lXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBjb2xsYXBzZSBidXR0b24nKTtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdGNvbnN0IGJ1dHRvblRleHQgPSBsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IGJ1dHRvbi50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhidXR0b25UZXh0LmluY2x1ZGVzKCdTdWJhZ2VudDonKSwgJ1RpdGxlIHNob3VsZCB1c2UgZGVmYXVsdCBTdWJhZ2VudCBwcmVmaXgnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0xhdGUgbWV0YWRhdGEgdXBkYXRlcycsICgpID0+IHtcblx0XHQvLyBUaGUgcGFyZW50IHN1YmFnZW50IHRvb2wgaXMgb2Z0ZW4gY29uc3RydWN0ZWQgYmVmb3JlXG5cdFx0Ly8gYHN1YmFnZW50X3N0YXJ0ZWRgICh3aGljaCBjYXJyaWVzIHRoZSByZWFsIGFnZW50TmFtZSkgYXJyaXZlcy5cblx0XHQvLyBUaGUgYXV0b3J1biBpbiBgd2F0Y2hUb29sQ29tcGxldGlvbmAgcmUtcmVhZHMgbWV0YWRhdGEgd2hlbiBzdGF0ZVxuXHRcdC8vIGNoYW5nZXMgYW5kIHVwZGF0ZXMgdGhlIHRpdGxlIGlmIHRoZSBkZXNjcmlwdGlvbiB0cmFuc2l0aW9uZWQgZnJvbVxuXHRcdC8vIHRoZSBkZWZhdWx0IHBsYWNlaG9sZGVyIHRvIGEgcmVhbCB2YWx1ZSwgb3IgaWYgdGhlIGFnZW50TmFtZVxuXHRcdC8vIGNoYW5nZWQgdG8gYSByZWFsIHZhbHVlLiBUaGVzZSB0ZXN0cyBjb3ZlciB0aGF0IGJyYW5jaCBkaXJlY3RseS5cblxuXHRcdGZ1bmN0aW9uIGdldFRpdGxlVGV4dChwYXJ0OiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCk6IHN0cmluZyB7XG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBjb2xsYXBzZSBidXR0b24nKTtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdHJldHVybiBsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IGJ1dHRvbi50ZXh0Q29udGVudCA/PyAnJztcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRTZXR0YWJsZVN0YXRlKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uKTogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+PiB7XG5cdFx0XHRyZXR1cm4gdG9vbEludm9jYXRpb24uc3RhdGUgYXMgUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+Pjtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzZXRUb29sU3BlY2lmaWNEYXRhKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBkYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhKTogdm9pZCB7XG5cdFx0XHQodG9vbEludm9jYXRpb24gYXMgeyB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhIH0pLnRvb2xTcGVjaWZpY0RhdGEgPSBkYXRhO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3VwZGF0ZVRpdGxlIGNsZWFycyBwcmV2aW91cyB0aXRsZSBmaWxlIHdpZGdldCBkaXNwb3NhYmxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHsgaW52b2NhdGlvbk1lc3NhZ2U6ICdmaXJzdCcgfSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdChwYXJ0IGFzIHVua25vd24gYXMgeyBfdGl0bGVGaWxlV2lkZ2V0U3RvcmU6IERpc3Bvc2FibGVTdG9yZSB9KS5fdGl0bGVGaWxlV2lkZ2V0U3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4geyBkaXNwb3NlZCA9IHRydWU7IH0gfSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgYSB0aXRsZSByZS1yZW5kZXJcblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHsgaW52b2NhdGlvbk1lc3NhZ2U6ICdzZWNvbmQnLCBzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyB9KSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZCwgdHJ1ZSwgJ1ByZXZpb3VzIHRpdGxlIGZpbGUgd2lkZ2V0IGRpc3Bvc2FibGUgc2hvdWxkIGJlIGNsZWFyZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHQgZGVzY3JpcHRpb24gd2l0aCBubyBhZ2VudE5hbWUgXHUyMTkyIHJlYWwgZGVzY3JpcHRpb24gYXJyaXZlcyBsYXRlciBcdTIxOTIgdGl0bGUgdXBkYXRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7IGtpbmQ6ICdzdWJhZ2VudCcgLyogbm8gZGVzY3JpcHRpb24sIG5vIGFnZW50TmFtZSAqLyB9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGFzc2VydC5vayhnZXRUaXRsZVRleHQocGFydCkuaW5jbHVkZXMoJ1N1YmFnZW50OicpLCAnVGl0bGUgc2hvdWxkIHN0YXJ0IHdpdGggZGVmYXVsdCBwcmVmaXgnKTtcblxuXHRcdFx0Ly8gTGF0ZSBtZXRhZGF0YTogcmVhbCBkZXNjcmlwdGlvbiBhcnJpdmVzIHZpYSBDaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZFxuXHRcdFx0c2V0VG9vbFNwZWNpZmljRGF0YSh0b29sSW52b2NhdGlvbiwgeyBraW5kOiAnc3ViYWdlbnQnLCBkZXNjcmlwdGlvbjogJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnIH0pO1xuXHRcdFx0Z2V0U2V0dGFibGVTdGF0ZSh0b29sSW52b2NhdGlvbikuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyksIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5vayhnZXRUaXRsZVRleHQocGFydCkuaW5jbHVkZXMoJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnKSwgJ1RpdGxlIHNob3VsZCByZWZsZWN0IHRoZSBuZXcgZGVzY3JpcHRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWwgZGVzY3JpcHRpb24gYWxyZWFkeSBzZXQgXHUyMTkyIGFnZW50TmFtZSBhcnJpdmVzIGxhdGVyIFx1MjE5MiB0aXRsZSB1cGRhdGVzIChyZWdyZXNzaW9uKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7IGtpbmQ6ICdzdWJhZ2VudCcsIGRlc2NyaXB0aW9uOiAnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScgLyogbm8gYWdlbnROYW1lICovIH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRpdGxlVGV4dChwYXJ0KS5pbmNsdWRlcygnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScpLCAnVGl0bGUgc2hvdWxkIHN0YXJ0IHdpdGggdGhlIHJlYWwgZGVzY3JpcHRpb24nKTtcblx0XHRcdGFzc2VydC5vayghZ2V0VGl0bGVUZXh0KHBhcnQpLmluY2x1ZGVzKCdDb2RlU2VhcmNoQWdlbnQnKSwgJ1RpdGxlIHNob3VsZCBub3QgeWV0IGhhdmUgYWdlbnQgbmFtZScpO1xuXG5cdFx0XHQvLyBMYXRlIG1ldGFkYXRhOiBhZ2VudE5hbWUgYXJyaXZlcyB2aWEgc3ViYWdlbnRfc3RhcnRlZCBhZnRlciB0aGVcblx0XHRcdC8vIGRlc2NyaXB0aW9uIGhhcyBhbHJlYWR5IGJlZW4gc2V0ICh0aGUgYnVnIHdlIGZpeGVkKS5cblx0XHRcdHNldFRvb2xTcGVjaWZpY0RhdGEodG9vbEludm9jYXRpb24sIHsga2luZDogJ3N1YmFnZW50JywgZGVzY3JpcHRpb246ICdTZWFyY2hpbmcgdGhlIGNvZGViYXNlJywgYWdlbnROYW1lOiAnQ29kZVNlYXJjaEFnZW50JyB9KTtcblx0XHRcdGdldFNldHRhYmxlU3RhdGUodG9vbEludm9jYXRpb24pLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQub2soZ2V0VGl0bGVUZXh0KHBhcnQpLmluY2x1ZGVzKCdDb2RlU2VhcmNoQWdlbnQnKSwgJ1RpdGxlIHNob3VsZCByZWZsZWN0IHRoZSBuZXcgYWdlbnQgbmFtZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWdlbnROYW1lIGFscmVhZHkgc2V0IFx1MjE5MiBlbXB0eSBhZ2VudE5hbWUgYXJyaXZlcyBcdTIxOTIgdGl0bGUgTk9UIGNsZWFyZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnc3ViYWdlbnQnLCBkZXNjcmlwdGlvbjogJ1NlYXJjaGluZyB0aGUgY29kZWJhc2UnLCBhZ2VudE5hbWU6ICdDb2RlU2VhcmNoQWdlbnQnIH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRpdGxlVGV4dChwYXJ0KS5pbmNsdWRlcygnQ29kZVNlYXJjaEFnZW50JyksICdUaXRsZSBzaG91bGQgc3RhcnQgd2l0aCB0aGUgYWdlbnQgbmFtZScpO1xuXG5cdFx0XHQvLyBBIHN1YnNlcXVlbnQgdXBkYXRlIGFycml2ZXMgd2l0aCBubyBhZ2VudE5hbWUgZmllbGQgXHUyMDE0IHRoZSBwYXJ0XG5cdFx0XHQvLyBtdXN0IE5PVCBjbGVhciB0aGUgcHJldmlvdXNseS1zZXQgbmFtZS5cblx0XHRcdHNldFRvb2xTcGVjaWZpY0RhdGEodG9vbEludm9jYXRpb24sIHsga2luZDogJ3N1YmFnZW50JywgZGVzY3JpcHRpb246ICdTZWFyY2hpbmcgdGhlIGNvZGViYXNlJyB9KTtcblx0XHRcdGdldFNldHRhYmxlU3RhdGUodG9vbEludm9jYXRpb24pLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQub2soZ2V0VGl0bGVUZXh0KHBhcnQpLmluY2x1ZGVzKCdDb2RlU2VhcmNoQWdlbnQnKSwgJ1RpdGxlIHNob3VsZCBzdGlsbCBoYXZlIHRoZSBhZ2VudCBuYW1lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFsIGRlc2NyaXB0aW9uIGFscmVhZHkgc2V0IFx1MjE5MiBubyBmdXJ0aGVyIGNoYW5nZXMgXHUyMTkyIHRpdGxlIHByZXNlcnZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7IGtpbmQ6ICdzdWJhZ2VudCcsIGRlc2NyaXB0aW9uOiAnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScsIGFnZW50TmFtZTogJ0NvZGVTZWFyY2hBZ2VudCcgfVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRjb25zdCBiZWZvcmUgPSBnZXRUaXRsZVRleHQocGFydCk7XG5cblx0XHRcdC8vIFRyaWdnZXIgdGhlIGF1dG9ydW4gd2l0aG91dCBjaGFuZ2luZyB0b29sU3BlY2lmaWNEYXRhLlxuXHRcdFx0Z2V0U2V0dGFibGVTdGF0ZSh0b29sSW52b2NhdGlvbikuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyksIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUaXRsZVRleHQocGFydCksIGJlZm9yZSwgJ1RpdGxlIHNob3VsZCBiZSB1bmNoYW5nZWQgd2hlbiBubyBtZXRhZGF0YSBjaGFuZ2VkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTdGF0ZSBtYW5hZ2VtZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBzdGFydCBhcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5nZXRJc0FjdGl2ZSgpLCB0cnVlLCAnU2hvdWxkIHN0YXJ0IGFzIGFjdGl2ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya0FzSW5hY3RpdmUgc2hvdWxkIHVwZGF0ZSBpc0FjdGl2ZSBzdGF0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKCk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdHBhcnQubWFya0FzSW5hY3RpdmUoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGlzQWN0aXZlOiBwYXJ0LmdldElzQWN0aXZlKCksXG5cdFx0XHRcdGFuaW1hdGlvbkVuYWJsZWQ6IHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRlZCcpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRcdGFuaW1hdGlvbkVuYWJsZWQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcmNlZCBpbmFjdGl2ZSBzdGF0ZSBmcmVlemVzIHRpbWluZyBmb3IgYSB0ZXJtaW5hbCBwYXJlbnQgcmVzcG9uc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0c3RhcnRlZEF0OiBEYXRlLm5vdygpIC0gNTAwMCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oeyB0b29sU3BlY2lmaWNEYXRhIH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXG5cdFx0XHRwYXJ0Lm1hcmtBc0luYWN0aXZlKHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aXNBY3RpdmU6IHRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUsXG5cdFx0XHRcdGhhc0R1cmF0aW9uOiB0eXBlb2YgdG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgdG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbiA+PSA1MDAwLFxuXHRcdFx0XHRjb250ZXh0RHVyYXRpb246IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uZHVyYXRpb24sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0aGFzRHVyYXRpb246IHRydWUsXG5cdFx0XHRcdGNvbnRleHREdXJhdGlvbjogdG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbixcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yY2VkIGluYWN0aXZlIHN0YXRlIGZyZWV6ZXMgc2VyaWFsaXplZCBzdWJhZ2VudCB0aW1pbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdSZXN0b3JlZCB0YXNrJyxcblx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Jlc3RvcmVkJyxcblx0XHRcdFx0c3RhcnRlZEF0OiBEYXRlLm5vdygpIC0gNTAwMCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKSk7XG5cblx0XHRcdHBhcnQubWFya0FzSW5hY3RpdmUodHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpc0FjdGl2ZTogdG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSxcblx0XHRcdFx0aGFzRHVyYXRpb246IHR5cGVvZiB0b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uID09PSAnbnVtYmVyJyAmJiB0b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uID49IDUwMDAsXG5cdFx0XHRcdGNvbnRleHREdXJhdGlvbjogZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpPy5kdXJhdGlvbixcblx0XHRcdH0sIHtcblx0XHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHRoYXNEdXJhdGlvbjogdHJ1ZSxcblx0XHRcdFx0Y29udGV4dER1cmF0aW9uOiB0b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdG9wcyBpbW1lZGlhdGVseSB3aGVuIHRoZSBwYXJlbnQgcmVzcG9uc2UgYmVjb21lcyB0ZXJtaW5hbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uPigpKTtcblx0XHRcdGxldCBpc0NvbXBsZXRlID0gZmFsc2U7XG5cdFx0XHRjb25zdCBiYXNlQ29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblx0XHRcdGNvbnN0IGJhc2VFbGVtZW50ID0gYmFzZUNvbnRleHQuZWxlbWVudCBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXHRcdFx0Y29uc3QgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgPSB7XG5cdFx0XHRcdC4uLmJhc2VDb250ZXh0LFxuXHRcdFx0XHRlbGVtZW50OiB7XG5cdFx0XHRcdFx0Li4uYmFzZUVsZW1lbnQsXG5cdFx0XHRcdFx0bW9kZWw6IHtcblx0XHRcdFx0XHRcdC4uLmJhc2VFbGVtZW50Lm1vZGVsLFxuXHRcdFx0XHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0XHRcdH0gYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbFsnbW9kZWwnXSxcblx0XHRcdFx0XHRnZXQgaXNDb21wbGV0ZSgpIHsgcmV0dXJuIGlzQ29tcGxldGU7IH0sXG5cdFx0XHRcdFx0Z2V0IGlzQ2FuY2VsZWQoKSB7IHJldHVybiBmYWxzZTsgfSxcblx0XHRcdFx0XHRzZXRWb3RlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogRGF0ZS5ub3coKSAtIDUwMDAsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQoY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHsgdG9vbFNwZWNpZmljRGF0YSB9KSwgY29udGV4dCk7XG5cblx0XHRcdGlzQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0b25EaWRDaGFuZ2UuZmlyZSh7IHJlYXNvbjogJ2NvbXBsZXRlZFJlcXVlc3QnIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aXNBY3RpdmU6IHBhcnQuZ2V0SXNBY3RpdmUoKSxcblx0XHRcdFx0dG9vbElzQWN0aXZlOiB0b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlLFxuXHRcdFx0XHRoYXNEdXJhdGlvbjogdHlwZW9mIHRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24gPT09ICdudW1iZXInICYmIHRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24gPj0gNTAwMCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHR0b29sSXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0XHRoYXNEdXJhdGlvbjogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya0FzSW5hY3RpdmUgc2hvdWxkIHJlbW92ZSBzdHJlYW1pbmcgY2xhc3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBFeHBhbmQgdG8gdHJpZ2dlciB3cmFwcGVyIGNyZWF0aW9uXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGJ1dHRvbj8uY2xpY2soKTtcblxuXHRcdFx0cGFydC5tYXJrQXNJbmFjdGl2ZSgpO1xuXG5cdFx0XHRjb25zdCB3cmFwcGVyID0gZ2V0V3JhcHBlckVsZW1lbnQocGFydCk7XG5cdFx0XHRpZiAod3JhcHBlcikge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JhcHBlci5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdGhpbmtpbmctc3RyZWFtaW5nJyksIGZhbHNlLFxuXHRcdFx0XHRcdCdTdHJlYW1pbmcgY2xhc3Mgc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgbWFya0FzSW5hY3RpdmUnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtBc0luYWN0aXZlIHNob3VsZCBjb2xsYXBzZSB0aGUgcGFydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKCk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEZpcnN0IGV4cGFuZFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdC8vIFZlcmlmeSBleHBhbmRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSk7XG5cblx0XHRcdHBhcnQubWFya0FzSW5hY3RpdmUoKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGNvbGxhcHNlIHdoZW4gaW5hY3RpdmVcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgJ1Nob3VsZCBiZSBjb2xsYXBzZWQgYWZ0ZXIgbWFya0FzSW5hY3RpdmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtBc0luYWN0aXZlIHNob3VsZCBjaGFuZ2UgZGVmYXVsdCBkZXNjcmlwdGlvbiB0byBwYXN0IHRlbnNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHQvLyBubyBkZXNjcmlwdGlvbiBcdTIwMTQgc2hvdWxkIHVzZSB0aGUgZGVmYXVsdCBcIlJ1bm5pbmcgc3ViYWdlbnRcIlxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gQmVmb3JlIG1hcmtpbmcgaW5hY3RpdmUsIHRpdGxlIHNob3VsZCBzaG93IFwiUnVubmluZyBzdWJhZ2VudFwiXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBjb2xsYXBzZSBidXR0b24nKTtcblx0XHRcdGNvbnN0IGxhYmVsQmVmb3JlID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0Y29uc3QgdGV4dEJlZm9yZSA9IGxhYmVsQmVmb3JlPy50ZXh0Q29udGVudCA/PyBidXR0b24udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2sodGV4dEJlZm9yZS5pbmNsdWRlcygnUnVubmluZyBzdWJhZ2VudCcpLCAnVGl0bGUgc2hvdWxkIHNob3cgXCJSdW5uaW5nIHN1YmFnZW50XCIgYmVmb3JlIGNvbXBsZXRpb24nKTtcblxuXHRcdFx0cGFydC5tYXJrQXNJbmFjdGl2ZSgpO1xuXG5cdFx0XHQvLyBBZnRlciBtYXJraW5nIGluYWN0aXZlLCB0aXRsZSBzaG91bGQgc2hvdyBcIlJhbiBzdWJhZ2VudFwiXG5cdFx0XHRjb25zdCBsYWJlbEFmdGVyID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0Y29uc3QgdGV4dEFmdGVyID0gbGFiZWxBZnRlcj8udGV4dENvbnRlbnQgPz8gYnV0dG9uLnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHRBZnRlci5pbmNsdWRlcygnUmFuIHN1YmFnZW50JyksICdUaXRsZSBzaG91bGQgc2hvdyBcIlJhbiBzdWJhZ2VudFwiIGFmdGVyIGNvbXBsZXRpb24nKTtcblx0XHRcdGFzc2VydC5vayghdGV4dEFmdGVyLmluY2x1ZGVzKCdSdW5uaW5nIHN1YmFnZW50JyksICdUaXRsZSBzaG91bGQgbm8gbG9uZ2VyIHNob3cgXCJSdW5uaW5nIHN1YmFnZW50XCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtBc0luYWN0aXZlIHNob3VsZCBrZWVwIGN1c3RvbSBkZXNjcmlwdGlvbiB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnRXhwbG9yZXInLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0cGFydC5tYXJrQXNJbmFjdGl2ZSgpO1xuXG5cdFx0XHQvLyBBZnRlciBtYXJraW5nIGluYWN0aXZlLCB0aXRsZSBzaG91bGQgc3RpbGwgc2hvdyB0aGUgY3VzdG9tIGRlc2NyaXB0aW9uXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBjb2xsYXBzZSBidXR0b24nKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0Y29uc3QgdGV4dCA9IGxhYmVsPy50ZXh0Q29udGVudCA/PyBidXR0b24udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnU2VhcmNoaW5nIHRoZSBjb2RlYmFzZScpLCAnVGl0bGUgc2hvdWxkIGtlZXAgY3VzdG9tIGRlc2NyaXB0aW9uIGFmdGVyIGNvbXBsZXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplVGl0bGUgc2hvdWxkIHVwZGF0ZSBidXR0b24gaWNvbiB0byBjaGVjaycsICgpID0+IHtcblx0XHRcdC8vIEVuYWJsZSB0aGUgc2hvd0NoZWNrbWFya3Mgc2V0dGluZyBzbyB0aGUgY2hlY2sgaWNvbiBpcyB2aXNpYmxlXG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLlNob3dDaGF0Q2hlY2ttYXJrcywgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKCk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdHBhcnQuZmluYWxpemVUaXRsZSgpO1xuXG5cdFx0XHQvLyBUaGUgYnV0dG9uIHNob3VsZCBub3cgc2hvdyBhIGNoZWNrIGljb25cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBnZXRDb2xsYXBzZUJ1dHRvbkljb24oYnV0dG9uKTtcblx0XHRcdGFzc2VydC5vayhpY29uRWxlbWVudD8uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uLWNoZWNrJyksICdTaG91bGQgaGF2ZSBjaGVjayBpY29uIGFmdGVyIGZpbmFsaXphdGlvbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnU2VyaWFsaXplZCBpbnZvY2F0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc2VyaWFsaXplZCB0b29sIGludm9jYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tTZXJpYWxpemVkVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbXBsZXRlZCB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdGaW5pc2hlZEFnZW50Jyxcblx0XHRcdFx0XHRwcm9tcHQ6ICdPcmlnaW5hbCBwcm9tcHQnLFxuXHRcdFx0XHRcdHJlc3VsdDogJ1Rhc2sgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQodHJ1ZSk7IC8vIGlzQ29tcGxldGUgPSB0cnVlXG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHNlcmlhbGl6ZWRJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gU2hvdWxkIGFscmVhZHkgYmUgaW5hY3RpdmUgc2luY2UgaXQncyBzZXJpYWxpemVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5nZXRJc0FjdGl2ZSgpLCBmYWxzZSwgJ1NlcmlhbGl6ZWQgaW52b2NhdGlvbiBzaG91bGQgYmUgaW5hY3RpdmUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2hhc1NhbWVDb250ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmV1c2UgdGhlIHZpc3VhbCBwYXJ0IGZvciBhIGNoaWxkIHRvb2wgaW52b2NhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHsgc3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICdzdWJhZ2VudC0xMjMnIH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRjb25zdCBvdGhlckludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sSWQ6ICdzb21lLXRvb2wnLFxuXHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogJ3N1YmFnZW50LTEyMydcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJ0Lmhhc1NhbWVDb250ZW50KG90aGVySW52b2NhdGlvbiwgW10sIGNvbnRleHQuZWxlbWVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIGZvciB0b29sIGludm9jYXRpb24gd2l0aCBkaWZmZXJlbnQgc3ViQWdlbnRJbnZvY2F0aW9uSWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7IHN1YkFnZW50SW52b2NhdGlvbklkOiAnc3ViYWdlbnQtMTIzJyB9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Y29uc3Qgb3RoZXJJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiAnc29tZS10b29sJyxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICdzdWJhZ2VudC00NTYnXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFydC5oYXNTYW1lQ29udGVudChvdGhlckludm9jYXRpb24sIFtdLCBjb250ZXh0LmVsZW1lbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UsICdTaG91bGQgbm90IG1hdGNoIHRvb2wgaW52b2NhdGlvbiB3aXRoIGRpZmZlcmVudCBzdWJBZ2VudEludm9jYXRpb25JZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciBydW5TdWJhZ2VudCB0b29sIHVzaW5nIHRvb2xDYWxsSWQgYXMgZWZmZWN0aXZlIElEJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2hhcmVkVG9vbENhbGxJZCA9ICdzaGFyZWQtdG9vbC1jYWxsLWlkJztcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiBSdW5TdWJhZ2VudFRvb2wuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHNoYXJlZFRvb2xDYWxsSWQsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0LCB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkKTtcblxuXHRcdFx0Y29uc3Qgb3RoZXJJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiBSdW5TdWJhZ2VudFRvb2wuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHNoYXJlZFRvb2xDYWxsSWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFydC5oYXNTYW1lQ29udGVudChvdGhlckludm9jYXRpb24sIFtdLCBjb250ZXh0LmVsZW1lbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSwgJ1Nob3VsZCBtYXRjaCBydW5TdWJhZ2VudCB0b29sIHVzaW5nIHRvb2xDYWxsSWQgYXMgZWZmZWN0aXZlIElEJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJldXNlIHRoZSB2aXN1YWwgcGFydCBmb3IgZ3JvdXBlZCBtYXJrZG93bicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHsgdG9vbENhbGxJZDogJ3N1YmFnZW50LTEyMycgfSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duQ29udGVudDogSUNoYXRNYXJrZG93bkNvbnRlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiB7IHZhbHVlOiAnPHZzY29kZV9jb2RlYmxvY2tfdXJpIHN1YkFnZW50SW52b2NhdGlvbklkPVwic3ViYWdlbnQtMTIzXCI+ZmlsZTovLy90ZXN0LnR4dDwvdnNjb2RlX2NvZGVibG9ja191cmk+JyB9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJ0Lmhhc1NhbWVDb250ZW50KG1hcmtkb3duQ29udGVudCwgW10sIGNvbnRleHQuZWxlbWVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTdHJlYW1pbmcgYmVoYXZpb3InLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgbG9hZGluZyBzcGlubmVyIHdoaWxlIHN0cmVhbWluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmdcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSBsb2FkaW5nIHNwaW5uZXIgaWNvbiB3aGlsZSBzdHJlYW1pbmdcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ1Nob3VsZCBoYXZlIGNvbGxhcHNlIGJ1dHRvbicpO1xuXHRcdFx0Y29uc3QgbG9hZGluZ0ljb24gPSBnZXRDb2xsYXBzZUJ1dHRvbkljb24oYnV0dG9uKTtcblx0XHRcdGFzc2VydC5vayhsb2FkaW5nSWNvbj8uY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uLWNpcmNsZS1maWxsZWQnKSwgJ1Nob3VsZCBoYXZlIGNpcmNsZS1maWxsZWQgaWNvbiB3aGlsZSBzdHJlYW1pbmcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0V4cGFuZC9jb2xsYXBzZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgdG9nZ2xlIGV4cGFuc2lvbiB3aGVuIGJ1dHRvbiBpcyBjbGlja2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oKTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gSW5pdGlhbGx5IGNvbGxhcHNlZFxuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpKTtcblxuXHRcdFx0Ly8gQ2xpY2sgdG8gZXhwYW5kXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBleHBhbmQgYnV0dG9uJyk7XG5cdFx0XHRidXR0b24uY2xpY2soKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGJlIGV4cGFuZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIGJlIGV4cGFuZGVkIGFmdGVyIGNsaWNraW5nIGJ1dHRvbicpO1xuXG5cdFx0XHQvLyBDbGljayBhZ2FpbiB0byBjb2xsYXBzZVxuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBjb2xsYXBzZWQgYWdhaW5cblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSxcblx0XHRcdFx0J1Nob3VsZCBiZSBjb2xsYXBzZWQgYWZ0ZXIgY2xpY2tpbmcgYnV0dG9uIGFnYWluJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGF2ZSBwcm9wZXIgYXJpYS1leHBhbmRlZCBhdHRyaWJ1dGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdCdXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAnZmFsc2UnLCAnU2hvdWxkIGhhdmUgYXJpYS1leHBhbmRlZD1cImZhbHNlXCIgd2hlbiBjb2xsYXBzZWQnKTtcblxuXHRcdFx0Ly8gRXhwYW5kXG5cdFx0XHRidXR0b24uY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSwgJ3RydWUnLCAnU2hvdWxkIGhhdmUgYXJpYS1leHBhbmRlZD1cInRydWVcIiB3aGVuIGV4cGFuZGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdMYXp5IHJlbmRlcmluZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGVmZXIgcHJvbXB0L3Jlc3VsdCByZW5kZXJpbmcgdW50aWwgZXhwYW5kZWQgd2hlbiBpbml0aWFsbHkgY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tTZXJpYWxpemVkVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbXBsZXRlZCB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdGaW5pc2hlZEFnZW50Jyxcblx0XHRcdFx0XHRwcm9tcHQ6ICdPcmlnaW5hbCBwcm9tcHQgZm9yIHRoZSB0YXNrJyxcblx0XHRcdFx0XHRyZXN1bHQ6ICdUYXNrIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KHRydWUpOyAvLyBpc0NvbXBsZXRlID0gdHJ1ZVxuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChzZXJpYWxpemVkSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIENvbnRlbnQgc2hvdWxkIGJlIGNvbGxhcHNlZCAtIG5vIHdyYXBwZXIgY29udGVudCBpbml0aWFsbHkgdmlzaWJsZVxuXHRcdFx0Ly8gSnVzdCB2ZXJpZnkgdGhhdCB0aGUgZG9tTm9kZSBoYXMgdGhlIGNvbGxhcHNlZCBjbGFzc1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCAnU2hvdWxkIGJlIGNvbGxhcHNlZCBpbml0aWFsbHknKTtcblxuXHRcdFx0Ly8gRXhwYW5kIHRvIHRyaWdnZXIgbGF6eSByZW5kZXJpbmdcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ0V4cGFuZCBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRidXR0b24uY2xpY2soKTtcblxuXHRcdFx0Ly8gQWZ0ZXIgZXhwYW5kaW5nLCB0aGUgY29udGVudCBjb250YWluZXJzIHNob3VsZCBiZSByZW5kZXJlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSwgJ1Nob3VsZCBiZSBleHBhbmRlZCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgcHJvbXB0IGFuZCByZXN1bHQgc2VjdGlvbnMgZXhpc3QgaW4gdGhlIGV4cGFuZGVkIGNvbnRlbnRcblx0XHRcdGNvbnN0IHdyYXBwZXJDb250ZW50ID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1saXN0Jyk7XG5cdFx0XHRhc3NlcnQub2sod3JhcHBlckNvbnRlbnQsICdXcmFwcGVyIGNvbnRlbnQgc2hvdWxkIGV4aXN0IGFmdGVyIGV4cGFuZCcpO1xuXG5cdFx0XHQvLyBDaGVjayB0aGF0IHNlY3Rpb25zIHdlcmUgaW5zZXJ0ZWRcblx0XHRcdGNvbnN0IHNlY3Rpb25zID0gd3JhcHBlckNvbnRlbnQucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtc3ViYWdlbnQtc2VjdGlvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlY3Rpb25zLmxlbmd0aCA+PSAyLCAnU2hvdWxkIGhhdmUgcHJvbXB0IGFuZCByZXN1bHQgc2VjdGlvbnMgYWZ0ZXIgZXhwYW5kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlbmRlciB3cmFwcGVyIGNvbnRlbnQgd2hpbGUgc3ViYWdlbnQgaXMgcnVubmluZyAodHJ1bHkgY29sbGFwc2VkKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW5uaW5nIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1J1bm5pbmdBZ2VudCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAnUHJvbXB0IHRleHQnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7IC8vIE5vdCBjb21wbGV0ZVxuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSBjb2xsYXBzZWQgd2l0aCBqdXN0IHRoZSB0aXRsZSB2aXNpYmxlXG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgYmUgY29sbGFwc2VkIHdoaWxlIHJ1bm5pbmcnKTtcblxuXHRcdFx0Ly8gV3JhcHBlciBjb250ZW50IHNob3VsZCBub3QgYmUgaW5pdGlhbGl6ZWQgeWV0IChsYXp5KVxuXHRcdFx0Y29uc3Qgd3JhcHBlckNvbnRlbnQgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtdXNlZC1jb250ZXh0LWxpc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cmFwcGVyQ29udGVudCwgbnVsbCwgJ1dyYXBwZXIgY29udGVudCBzaG91bGQgbm90IGJlIHJlbmRlcmVkIHdoaWxlIHJ1bm5pbmcgYW5kIGNvbGxhcHNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgcHJvbXB0IG9uIGV4cGFuZCB3aGVuIG5vIHRvb2wgaXRlbXMgeWV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1N0YXJ0aW5nIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1J1bm5pbmdBZ2VudCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAnVGhpcyBpcyB0aGUgcHJvbXB0IHRvIGV4ZWN1dGUnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7IC8vIE5vdCBjb21wbGV0ZVxuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEluaXRpYWxseSBjb2xsYXBzZWQgd2l0aCBubyBjb250ZW50XG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgYmUgY29sbGFwc2VkIGluaXRpYWxseScpO1xuXHRcdFx0bGV0IHdyYXBwZXJDb250ZW50ID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1saXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JhcHBlckNvbnRlbnQsIG51bGwsICdXcmFwcGVyIHNob3VsZCBub3QgZXhpc3QgaW5pdGlhbGx5Jyk7XG5cblx0XHRcdC8vIEV4cGFuZFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnRXhwYW5kIGJ1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHQvLyBXcmFwcGVyIHNob3VsZCBub3cgZXhpc3QgYW5kIGJlIHZpc2libGVcblx0XHRcdHdyYXBwZXJDb250ZW50ID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXVzZWQtY29udGV4dC1saXN0Jyk7XG5cdFx0XHRhc3NlcnQub2sod3JhcHBlckNvbnRlbnQsICdXcmFwcGVyIHNob3VsZCBleGlzdCBhZnRlciBleHBhbmQnKTtcblxuXHRcdFx0Ly8gUHJvbXB0IHNlY3Rpb24gc2hvdWxkIGJlIHJlbmRlcmVkXG5cdFx0XHRjb25zdCBwcm9tcHRTZWN0aW9uID0gd3JhcHBlckNvbnRlbnQucXVlcnlTZWxlY3RvcignLmNoYXQtc3ViYWdlbnQtc2VjdGlvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByb21wdFNlY3Rpb24sICdQcm9tcHQgc2VjdGlvbiBzaG91bGQgYmUgdmlzaWJsZSBhZnRlciBleHBhbmQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0N1cnJlbnQgcnVubmluZyB0b29sIGluIHRpdGxlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2JhdGNoZXMgcHJlc2VudGF0aW9uIHdoaWxlIHJlY29uc3RydWN0aW5nIHRlcm1pbmFsIHRvb2wgaGlzdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudFRvb2wgPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHBhcmVudFRvb2wsIGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKSk7XG5cdFx0XHRtYXJrZG93blJlbmRlckNvdW50ID0gMDtcblxuXHRcdFx0cGFydC5iZWdpblRvb2xQcmVzZW50YXRpb25CYXRjaCgpO1xuXHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IDEyODsgaW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCB0b29sID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdyZWFkRmlsZScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogYGNoaWxkLSR7aW5kZXh9YCxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogcGFyZW50VG9vbC50b29sQ2FsbElkLFxuXHRcdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBgQ29tcGxldGVkIHRvb2wgJHtpbmRleH1gXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRwYXJ0LmFwcGVuZFRvb2xJbnZvY2F0aW9uKHRvb2wsIGluZGV4KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVuZGVyc0R1cmluZ0JhdGNoID0gbWFya2Rvd25SZW5kZXJDb3VudDtcblx0XHRcdHBhcnQuZW5kVG9vbFByZXNlbnRhdGlvbkJhdGNoKCk7XG5cdFx0XHRjb25zdCByZW5kZXJzQWZ0ZXJCYXRjaCA9IG1hcmtkb3duUmVuZGVyQ291bnQ7XG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24pO1xuXHRcdFx0Y29uc3QgdGl0bGVBZnRlckJhdGNoID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pPy50ZXh0Q29udGVudCA/PyBidXR0b24udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRjb25zdCB0b29sU3RhdGVUcmFja2luZyA9IChwYXJ0IGFzIHVua25vd24gYXMgeyBfdG9vbFN0YXRlVHJhY2tpbmc6IHsgX3RvRGlzcG9zZTogU2V0PG9iamVjdD4gfSB9KS5fdG9vbFN0YXRlVHJhY2tpbmc7XG5cdFx0XHRjb25zdCB0cmFja2VkVGVybWluYWxUb29sQ291bnQgPSB0b29sU3RhdGVUcmFja2luZy5fdG9EaXNwb3NlLnNpemU7XG5cblx0XHRcdGNvbnN0IGxpdmVUb29sID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbElkOiAnc2VhcmNoRmlsZXMnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnbGl2ZS1jaGlsZCcsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiBwYXJlbnRUb29sLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaGluZyBsaXZlIGZpbGVzJ1xuXHRcdFx0fSk7XG5cdFx0XHRwYXJ0LmFwcGVuZFRvb2xJbnZvY2F0aW9uKGxpdmVUb29sLCAxMjgpO1xuXHRcdFx0Y29uc3QgdGl0bGVBZnRlckxpdmVUb29sID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pPy50ZXh0Q29udGVudCA/PyBidXR0b24udGV4dENvbnRlbnQgPz8gJyc7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZW5kZXJzRHVyaW5nQmF0Y2gsXG5cdFx0XHRcdHJlbmRlcnNBZnRlckJhdGNoLFxuXHRcdFx0XHR0cmFja2VkVGVybWluYWxUb29sQ291bnQsXG5cdFx0XHRcdHJlbmRlcnNBZnRlckxpdmVUb29sOiBtYXJrZG93blJlbmRlckNvdW50LFxuXHRcdFx0XHR0aXRsZUFmdGVyQmF0Y2hJbmNsdWRlc0xhdGVzdFRvb2w6IHRpdGxlQWZ0ZXJCYXRjaC5pbmNsdWRlcygnQ29tcGxldGVkIHRvb2wgMTI3JyksXG5cdFx0XHRcdHRpdGxlQWZ0ZXJMaXZlVG9vbEluY2x1ZGVzTGF0ZXN0VG9vbDogdGl0bGVBZnRlckxpdmVUb29sLmluY2x1ZGVzKCdTZWFyY2hpbmcgbGl2ZSBmaWxlcycpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZW5kZXJzRHVyaW5nQmF0Y2g6IDAsXG5cdFx0XHRcdHJlbmRlcnNBZnRlckJhdGNoOiAxLFxuXHRcdFx0XHR0cmFja2VkVGVybWluYWxUb29sQ291bnQ6IDAsXG5cdFx0XHRcdHJlbmRlcnNBZnRlckxpdmVUb29sOiAyLFxuXHRcdFx0XHR0aXRsZUFmdGVyQmF0Y2hJbmNsdWRlc0xhdGVzdFRvb2w6IHRydWUsXG5cdFx0XHRcdHRpdGxlQWZ0ZXJMaXZlVG9vbEluY2x1ZGVzTGF0ZXN0VG9vbDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmF0Y2hlcyBncm91cGVkIGhvb2sgcHJlc2VudGF0aW9uIHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJlbnRUb29sID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChwYXJlbnRUb29sLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXHRcdFx0Y29uc3QgaG9va1BhcnQ6IElDaGF0SG9va1BhcnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdob29rJyxcblx0XHRcdFx0aG9va1R5cGU6ICdQcmVUb29sVXNlJyxcblx0XHRcdFx0c3lzdGVtTWVzc2FnZTogJ1dhcm5pbmcnLFxuXHRcdFx0XHR0b29sRGlzcGxheU5hbWU6ICdTZWFyY2gnLFxuXHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogcGFyZW50VG9vbC50b29sQ2FsbElkLFxuXHRcdFx0fTtcblx0XHRcdG1hcmtkb3duUmVuZGVyQ291bnQgPSAwO1xuXG5cdFx0XHRwYXJ0LmJlZ2luVG9vbFByZXNlbnRhdGlvbkJhdGNoKCk7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgMzI7IGluZGV4KyspIHtcblx0XHRcdFx0cGFydC5hcHBlbmRIb29rSXRlbSgoKSA9PiAoeyBkb21Ob2RlOiBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpIH0pLCBob29rUGFydCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZW5kZXJzRHVyaW5nQmF0Y2ggPSBtYXJrZG93blJlbmRlckNvdW50O1xuXHRcdFx0cGFydC5lbmRUb29sUHJlc2VudGF0aW9uQmF0Y2goKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlbmRlcnNEdXJpbmdCYXRjaCxcblx0XHRcdFx0cmVuZGVyc0FmdGVyQmF0Y2g6IG1hcmtkb3duUmVuZGVyQ291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlbmRlcnNEdXJpbmdCYXRjaDogMCxcblx0XHRcdFx0cmVuZGVyc0FmdGVyQmF0Y2g6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1cGRhdGUgdGl0bGUgd2l0aCBjdXJyZW50IHJ1bm5pbmcgdG9vbCBpbnZvY2F0aW9uIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBBZGQgYSBjaGlsZCB0b29sIGludm9jYXRpb25cblx0XHRcdGNvbnN0IGNoaWxkVG9vbCA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xJZDogJ3JlYWRGaWxlJyxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGNvbmZpZy50cydcblx0XHRcdH0pO1xuXG5cdFx0XHRwYXJ0LmFwcGVuZFRvb2xJbnZvY2F0aW9uKGNoaWxkVG9vbCwgMCk7XG5cblx0XHRcdC8vIFRoZSB0aXRsZSBzaG91bGQgaW5jbHVkZSB0aGUgY3VycmVudCBydW5uaW5nIHRvb2wgbWVzc2FnZVxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnU2hvdWxkIGhhdmUgY29sbGFwc2UgYnV0dG9uJyk7XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBnZXRDb2xsYXBzZUJ1dHRvbkxhYmVsKGJ1dHRvbik7XG5cdFx0XHRjb25zdCBidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnUmVhZGluZyBjb25maWcudHMnKSwgJ1RpdGxlIHNob3VsZCBpbmNsdWRlIGN1cnJlbnQgcnVubmluZyB0b29sIG1lc3NhZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzaG93IGxhdGVzdCB0b29sIHdoZW4gbXVsdGlwbGUgdG9vbHMgYXJlIGFkZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gQWRkIGZpcnN0IHRvb2xcblx0XHRcdGNvbnN0IGZpcnN0VG9vbCA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xJZDogJ3JlYWRGaWxlJyxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUxLnRzJ1xuXHRcdFx0fSk7XG5cdFx0XHRwYXJ0LmFwcGVuZFRvb2xJbnZvY2F0aW9uKGZpcnN0VG9vbCwgMCk7XG5cblx0XHRcdC8vIEFkZCBzZWNvbmQgdG9vbFxuXHRcdFx0Y29uc3Qgc2Vjb25kVG9vbCA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xJZDogJ3NlYXJjaEZpbGVzJyxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2hpbmcgZm9yIHBhdHRlcm5zJ1xuXHRcdFx0fSk7XG5cdFx0XHRwYXJ0LmFwcGVuZFRvb2xJbnZvY2F0aW9uKHNlY29uZFRvb2wsIDEpO1xuXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdTaG91bGQgaGF2ZSBjb2xsYXBzZSBidXR0b24nKTtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdGNvbnN0IGJ1dHRvblRleHQgPSBsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IGJ1dHRvbi50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdC8vIFNob3VsZCBzaG93IHRoZSBsYXRlc3QgdG9vbCBtZXNzYWdlXG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnU2VhcmNoaW5nIGZvciBwYXR0ZXJucycpLCAnVGl0bGUgc2hvdWxkIGluY2x1ZGUgbGF0ZXN0IHRvb2wgbWVzc2FnZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGtlZXAgc2hvd2luZyBydW5uaW5nIHRvb2wgd2hlbiBhbm90aGVyIHRvb2wgY29tcGxldGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gQWRkIGZpcnN0IHRvb2wgKHdpbGwgY29tcGxldGUpXG5cdFx0XHRjb25zdCBmaXJzdFRvb2xTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpKTtcblx0XHRcdGNvbnN0IGZpcnN0VG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdyZWFkRmlsZScsXG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogZmlyc3RUb29sU3RhdGUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBmaWxlMS50cydcblx0XHRcdH07XG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGZpcnN0VG9vbCk7XG5cblx0XHRcdC8vIEFkZCBzZWNvbmQgdG9vbCAod2lsbCBrZWVwIHJ1bm5pbmcpXG5cdFx0XHRjb25zdCBzZWNvbmRUb29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBzZWNvbmRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3NlYXJjaEZpbGVzJyxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBzZWNvbmRUb29sU3RhdGUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnU2VhcmNoaW5nIGZvciBwYXR0ZXJucydcblx0XHRcdH07XG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKHNlY29uZFRvb2wpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGl0bGUgc2hvd3Mgc2Vjb25kIHRvb2xcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbiwgJ0J1dHRvbiBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IGdldENvbGxhcHNlQnV0dG9uTGFiZWwoYnV0dG9uKTtcblx0XHRcdGxldCBidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24/LnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1NlYXJjaGluZyBmb3IgcGF0dGVybnMnKSwgJ1RpdGxlIHNob3VsZCBzaG93IHNlY29uZCB0b29sJyk7XG5cblx0XHRcdC8vIENvbXBsZXRlIHRoZSBmaXJzdCB0b29sXG5cdFx0XHRmaXJzdFRvb2xTdGF0ZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gVGl0bGUgc2hvdWxkIHN0aWxsIHNob3cgdGhlIHNlY29uZCB0b29sICh3aGljaCBpcyBzdGlsbCBydW5uaW5nIGFuZCBvd25zIHRoZSB0aXRsZSlcblx0XHRcdGJ1dHRvblRleHQgPSBsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IGJ1dHRvbj8udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnU2VhcmNoaW5nIGZvciBwYXR0ZXJucycpLCAnVGl0bGUgc2hvdWxkIHN0aWxsIHNob3cgc2Vjb25kIHRvb2wgYWZ0ZXIgZmlyc3QgY29tcGxldGVzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQga2VlcCB0aXRsZSB3aGVuIHRvb2wgaXMgY2FuY2VsbGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gQWRkIGEgdG9vbCB0aGF0IHdpbGwgYmUgY2FuY2VsbGVkXG5cdFx0XHRjb25zdCB0b29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2w6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbElkOiAncmVhZEZpbGUnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IHRvb2xTdGF0ZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUudHMnXG5cdFx0XHR9O1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGl0bGUgaW5jbHVkZXMgdG9vbCBtZXNzYWdlXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdCdXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBnZXRDb2xsYXBzZUJ1dHRvbkxhYmVsKGJ1dHRvbik7XG5cdFx0XHRsZXQgYnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uPy50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhidXR0b25UZXh0LmluY2x1ZGVzKCdSZWFkaW5nIGZpbGUudHMnKSwgJ1RpdGxlIHNob3VsZCBpbmNsdWRlIHRvb2wgbWVzc2FnZSB3aGlsZSBydW5uaW5nJyk7XG5cblx0XHRcdC8vIENhbmNlbCB0aGUgdG9vbFxuXHRcdFx0dG9vbFN0YXRlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBUaXRsZSBzaG91bGQgc3RpbGwgaW5jbHVkZSB0aGUgdG9vbCBtZXNzYWdlIChwZXJzaXN0cyBsaWtlIHRoaW5raW5nIHBhcnQpXG5cdFx0XHRidXR0b25UZXh0ID0gbGFiZWxFbGVtZW50Py50ZXh0Q29udGVudCA/PyBidXR0b24/LnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvblRleHQuaW5jbHVkZXMoJ1JlYWRpbmcgZmlsZS50cycpLFxuXHRcdFx0XHQnVGl0bGUgc2hvdWxkIHN0aWxsIGluY2x1ZGUgdG9vbCBtZXNzYWdlIGFmdGVyIGNhbmNlbGxhdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGtlZXAgc2hvd2luZyBsYXN0IHRvb2wgbWVzc2FnZSB3aGVuIHRoYXQgdG9vbCBjb21wbGV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBGaXJzdCB0b29sIHN0YXJ0c1xuXHRcdFx0Y29uc3QgZmlyc3RUb29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBmaXJzdFRvb2w6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbElkOiAncmVhZEZpbGUnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IGZpcnN0VG9vbFN0YXRlLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZTEudHMnXG5cdFx0XHR9O1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShmaXJzdFRvb2wpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGl0bGUgc2hvd3MgZmlyc3QgdG9vbFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uLCAnQnV0dG9uIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gZ2V0Q29sbGFwc2VCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0bGV0IGJ1dHRvblRleHQgPSBsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IGJ1dHRvbj8udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnUmVhZGluZyBmaWxlMS50cycpLCAnVGl0bGUgc2hvdWxkIHNob3cgZmlyc3QgdG9vbCcpO1xuXG5cdFx0XHQvLyBTZWNvbmQgdG9vbCBzdGFydHMgYW5kIGJlY29tZXMgdGhlIGN1cnJlbnQgdGl0bGVcblx0XHRcdGNvbnN0IHNlY29uZFRvb2xTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpKTtcblx0XHRcdGNvbnN0IHNlY29uZFRvb2w6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbElkOiAnc2VhcmNoRmlsZXMnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IHNlY29uZFRvb2xTdGF0ZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2hpbmcgZm9yIHBhdHRlcm5zJ1xuXHRcdFx0fTtcblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoc2Vjb25kVG9vbCk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aXRsZSBzaG93cyBzZWNvbmQgdG9vbFxuXHRcdFx0YnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uPy50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhidXR0b25UZXh0LmluY2x1ZGVzKCdTZWFyY2hpbmcgZm9yIHBhdHRlcm5zJyksICdUaXRsZSBzaG91bGQgc2hvdyBzZWNvbmQgdG9vbCcpO1xuXG5cdFx0XHQvLyBTZWNvbmQgdG9vbCBjb21wbGV0ZXNcblx0XHRcdHNlY29uZFRvb2xTdGF0ZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gVGl0bGUgc2hvdWxkIHN0aWxsIHNob3cgc2Vjb25kIHRvb2wgKHBlcnNpc3RzIGxpa2UgdGhpbmtpbmcgcGFydClcblx0XHRcdGJ1dHRvblRleHQgPSBsYWJlbEVsZW1lbnQ/LnRleHRDb250ZW50ID8/IGJ1dHRvbj8udGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uVGV4dC5pbmNsdWRlcygnU2VhcmNoaW5nIGZvciBwYXR0ZXJucycpLFxuXHRcdFx0XHQnVGl0bGUgc2hvdWxkIHN0aWxsIHNob3cgbGFzdCB0b29sIG1lc3NhZ2UgYWZ0ZXIgY29tcGxldGlvbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXBwZW5kTWFya2Rvd25JdGVtJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhcHBlbmQgbWFya2Rvd24gaXRlbSB0byBleHBhbmRlZCBzdWJhZ2VudCBwYXJ0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogJ3Rlc3Qtc3ViYWdlbnQtaWQnLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gRXhwYW5kIHRoZSBwYXJ0IGZpcnN0XG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGJ1dHRvbj8uY2xpY2soKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsICdTaG91bGQgYmUgZXhwYW5kZWQnKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgbW9jayBtYXJrZG93biBjb250ZW50IHdpdGggZWRpdCBwaWxsXG5cdFx0XHRjb25zdCBtYXJrZG93bkNvbnRlbnQ6IElDaGF0TWFya2Rvd25Db250ZW50ID0ge1xuXHRcdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdFx0Y29udGVudDogeyB2YWx1ZTogJ0VkaXRlZCBmaWxlLnRzJyB9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBtb2NrIERPTSBub2RlIGZvciB0aGUgbWFya2Rvd25cblx0XHRcdGNvbnN0IG1hcmtkb3duRG9tTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRtYXJrZG93bkRvbU5vZGUuY2xhc3NOYW1lID0gJ2NoYXQtY29kZWJsb2NrLWJ1dHRvbic7XG5cdFx0XHRtYXJrZG93bkRvbU5vZGUudGV4dENvbnRlbnQgPSAnZmlsZS50cyc7XG5cblx0XHRcdGxldCBkaXNwb3NlQ2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IG1vY2tEaXNwb3NhYmxlID0geyBkaXNwb3NlOiAoKSA9PiB7IGRpc3Bvc2VDYWxsQ291bnQrKzsgfSB9O1xuXG5cdFx0XHQvLyBBcHBlbmQgbWFya2Rvd24gaXRlbVxuXHRcdFx0cGFydC5hcHBlbmRNYXJrZG93bkl0ZW0oXG5cdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6IG1hcmtkb3duRG9tTm9kZSwgZGlzcG9zYWJsZTogbW9ja0Rpc3Bvc2FibGUgfSksXG5cdFx0XHRcdCdjb2RlYmxvY2stMTIzJyxcblx0XHRcdFx0bWFya2Rvd25Db250ZW50LFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgbWFya2Rvd24gd2FzIGFwcGVuZGVkXG5cdFx0XHRjb25zdCB3cmFwcGVyID0gZ2V0V3JhcHBlckVsZW1lbnQocGFydCk7XG5cdFx0XHRhc3NlcnQub2sod3JhcHBlciwgJ1dyYXBwZXIgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRjb25zdCBhcHBlbmRlZEVsZW1lbnQgPSB3cmFwcGVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWNvZGVibG9jay1idXR0b24nKTtcblx0XHRcdGFzc2VydC5vayhhcHBlbmRlZEVsZW1lbnQsICdBcHBlbmRlZCBtYXJrZG93biBlbGVtZW50IHNob3VsZCBleGlzdCBpbiB3cmFwcGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kZWRFbGVtZW50LnRleHRDb250ZW50LCAnZmlsZS50cycsICdTaG91bGQgaGF2ZSBjb3JyZWN0IGNvbnRlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmVuZGVyIG1hcmtkb3duIGl0ZW0gd2hlbiBwYXJ0IGlzIGNvbGxhcHNlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICd0ZXN0LXN1YmFnZW50LWRlZmVyJyxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIFBhcnQgaXMgY29sbGFwc2VkIGJ5IGRlZmF1bHRcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgJ1Nob3VsZCBzdGFydCBjb2xsYXBzZWQnKTtcblxuXHRcdFx0Y29uc3QgbWFya2Rvd25Db250ZW50OiBJQ2hhdE1hcmtkb3duQ29udGVudCA9IHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IHsgdmFsdWU6ICdEZWZlcnJlZCBlZGl0JyB9XG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgZmFjdG9yeUNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgbWFya2Rvd25Eb21Ob2RlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdG1hcmtkb3duRG9tTm9kZS5jbGFzc05hbWUgPSAnZGVmZXJyZWQtZWRpdCc7XG5cdFx0XHRtYXJrZG93bkRvbU5vZGUudGV4dENvbnRlbnQgPSAnZGVmZXJyZWQudHMnO1xuXG5cdFx0XHRjb25zdCBtb2NrRGlzcG9zYWJsZSA9IHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cblx0XHRcdC8vIEFwcGVuZCBtYXJrZG93biBpdGVtIHdoaWxlIGNvbGxhcHNlZCAtIGZhY3Rvcnkgc2hvdWxkIG5vdCBiZSBjYWxsZWRcblx0XHRcdHBhcnQuYXBwZW5kTWFya2Rvd25JdGVtKFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0ZmFjdG9yeUNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogbWFya2Rvd25Eb21Ob2RlLCBkaXNwb3NhYmxlOiBtb2NrRGlzcG9zYWJsZSB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQnY29kZWJsb2NrLWRlZmVycmVkJyxcblx0XHRcdFx0bWFya2Rvd25Db250ZW50LFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cblx0XHRcdC8vIEZhY3Rvcnkgc2hvdWxkIG5vdCBiZSBjYWxsZWQgd2hlbiBjb2xsYXBzZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWN0b3J5Q2FsbGVkLCBmYWxzZSwgJ0ZhY3Rvcnkgc2hvdWxkIG5vdCBiZSBjYWxsZWQgd2hlbiBjb2xsYXBzZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhcHBlbmQgbXVsdGlwbGUgbWFya2Rvd24gaXRlbXMgd2l0aCBzYW1lIGNvZGVibG9jayBJRCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICd0ZXN0LXN1YmFnZW50LWRlZHVwJyxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEV4cGFuZCB0aGUgcGFydFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duQ29udGVudDogSUNoYXRNYXJrZG93bkNvbnRlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiB7IHZhbHVlOiAnU2FtZSBjb2RlYmxvY2snIH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHNoYXJlZENvZGVibG9ja0lkID0gJ2NvZGVibG9jay1zYW1lLWlkJztcblxuXHRcdFx0Ly8gQXBwZW5kIGZpcnN0IGl0ZW1cblx0XHRcdGNvbnN0IGZpcnN0Tm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRmaXJzdE5vZGUuY2xhc3NOYW1lID0gJ2ZpcnN0LWl0ZW0nO1xuXHRcdFx0Zmlyc3ROb2RlLnRleHRDb250ZW50ID0gJ2ZpcnN0IGl0ZW0gY29udGVudCc7XG5cdFx0XHRwYXJ0LmFwcGVuZE1hcmtkb3duSXRlbShcblx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogZmlyc3ROb2RlLCBkaXNwb3NhYmxlOiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9IH0pLFxuXHRcdFx0XHRzaGFyZWRDb2RlYmxvY2tJZCxcblx0XHRcdFx0bWFya2Rvd25Db250ZW50LFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cblx0XHRcdC8vIEFwcGVuZCBzZWNvbmQgaXRlbSB3aXRoIHNhbWUgY29kZWJsb2NrIElEXG5cdFx0XHRjb25zdCBzZWNvbmROb2RlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHNlY29uZE5vZGUuY2xhc3NOYW1lID0gJ3NlY29uZC1pdGVtJztcblx0XHRcdHNlY29uZE5vZGUudGV4dENvbnRlbnQgPSAnc2Vjb25kIGl0ZW0gY29udGVudCc7XG5cdFx0XHRwYXJ0LmFwcGVuZE1hcmtkb3duSXRlbShcblx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogc2Vjb25kTm9kZSwgZGlzcG9zYWJsZTogeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSB9KSxcblx0XHRcdFx0c2hhcmVkQ29kZWJsb2NrSWQsXG5cdFx0XHRcdG1hcmtkb3duQ29udGVudCxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBCb3RoIGl0ZW1zIGFyZSBhZGRlZCAobm8gYnVpbHQtaW4gZGVkdXBsaWNhdGlvbiBieSBjb2RlYmxvY2sgSUQpXG5cdFx0XHRjb25zdCB3cmFwcGVyID0gZ2V0V3JhcHBlckVsZW1lbnQocGFydCk7XG5cdFx0XHRhc3NlcnQub2sod3JhcHBlciwgJ1dyYXBwZXIgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRjb25zdCBmaXJzdEl0ZW1zID0gd3JhcHBlci5xdWVyeVNlbGVjdG9yQWxsKCcuZmlyc3QtaXRlbScpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kSXRlbXMgPSB3cmFwcGVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5zZWNvbmQtaXRlbScpO1xuXHRcdFx0Ly8gSW1wbGVtZW50YXRpb24gZG9lcyBub3QgZGVkdXBsaWNhdGUgLSBib3RoIGl0ZW1zIGV4aXN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RJdGVtcy5sZW5ndGgsIDEsICdGaXJzdCBpdGVtIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZEl0ZW1zLmxlbmd0aCwgMSwgJ1NlY29uZCBpdGVtIHNob3VsZCBleGlzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtdWx0aXBsZSBkaWZmZXJlbnQgY29kZWJsb2NrIElEcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICd0ZXN0LXN1YmFnZW50LW11bHRpJyxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEV4cGFuZCB0aGUgcGFydFxuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cblx0XHRcdC8vIEFwcGVuZCBmaXJzdCBpdGVtXG5cdFx0XHRjb25zdCBmaXJzdE5vZGUgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0Zmlyc3ROb2RlLmNsYXNzTmFtZSA9ICdpdGVtLW9uZSc7XG5cdFx0XHRmaXJzdE5vZGUudGV4dENvbnRlbnQgPSAnZmlyc3QgaXRlbSBjb250ZW50Jztcblx0XHRcdHBhcnQuYXBwZW5kTWFya2Rvd25JdGVtKFxuXHRcdFx0XHQoKSA9PiAoeyBkb21Ob2RlOiBmaXJzdE5vZGUsIGRpc3Bvc2FibGU6IHsgZGlzcG9zZTogKCkgPT4geyB9IH0gfSksXG5cdFx0XHRcdCdjb2RlYmxvY2stMScsXG5cdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IHsgdmFsdWU6ICdGaXJzdCcgfSB9LFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cblx0XHRcdC8vIEFwcGVuZCBzZWNvbmQgaXRlbSB3aXRoIGRpZmZlcmVudCBJRFxuXHRcdFx0Y29uc3Qgc2Vjb25kTm9kZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRzZWNvbmROb2RlLmNsYXNzTmFtZSA9ICdpdGVtLXR3byc7XG5cdFx0XHRzZWNvbmROb2RlLnRleHRDb250ZW50ID0gJ3NlY29uZCBpdGVtIGNvbnRlbnQnO1xuXHRcdFx0cGFydC5hcHBlbmRNYXJrZG93bkl0ZW0oXG5cdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6IHNlY29uZE5vZGUsIGRpc3Bvc2FibGU6IHsgZGlzcG9zZTogKCkgPT4geyB9IH0gfSksXG5cdFx0XHRcdCdjb2RlYmxvY2stMicsXG5cdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IHsgdmFsdWU6ICdTZWNvbmQnIH0gfSxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBCb3RoIHNob3VsZCBleGlzdFxuXHRcdFx0Y29uc3Qgd3JhcHBlciA9IGdldFdyYXBwZXJFbGVtZW50KHBhcnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXIsICdXcmFwcGVyIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXIucXVlcnlTZWxlY3RvcignLml0ZW0tb25lJyksICdGaXJzdCBpdGVtIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdyYXBwZXIucXVlcnlTZWxlY3RvcignLml0ZW0tdHdvJyksICdTZWNvbmQgaXRlbSBzaG91bGQgZXhpc3QnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0F1dG8tZXhwYW5kIG9uIGNvbmZpcm1hdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYXV0by1leHBhbmQgd2hlbiB0b29sIHN0YXRlIGJlY29tZXMgV2FpdGluZ0ZvckNvbmZpcm1hdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGluaXRpYWxseSBjb2xsYXBzZWRcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgJ1Nob3VsZCBzdGFydCBjb2xsYXBzZWQnKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgdG9vbCBpbnZvY2F0aW9uIHRoYXQgc3RhcnRzIGluIGV4ZWN1dGluZyBzdGF0ZSwgdGhlbiBjaGFuZ2VzIHRvIFdhaXRpbmdGb3JDb25maXJtYXRpb25cblx0XHRcdGNvbnN0IHN0YXRlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpKTtcblx0XHRcdGNvbnN0IGNoaWxkVG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdyZWFkRmlsZScsXG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogc3RhdGVPYnNlcnZhYmxlLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZSdcblx0XHRcdH07XG5cblx0XHRcdC8vIFRyYWNrIHRoaXMgdG9vbCdzIHN0YXRlICh0aGlzIHJlZ2lzdGVycyBvYnNlcnZlcnMpXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNoaWxkVG9vbCk7XG5cblx0XHRcdC8vIFNob3VsZCBzdGlsbCBiZSBjb2xsYXBzZWQgc2luY2UgdG9vbCBpcyBleGVjdXRpbmcsIG5vdCB3YWl0aW5nIGZvciBjb25maXJtYXRpb25cblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgJ1Nob3VsZCBzdGlsbCBiZSBjb2xsYXBzZWQgd2hlbiB0b29sIGlzIGV4ZWN1dGluZycpO1xuXG5cdFx0XHQvLyBOb3cgY2hhbmdlIHN0YXRlIHRvIFdhaXRpbmdGb3JDb25maXJtYXRpb25cblx0XHRcdHN0YXRlT2JzZXJ2YWJsZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFNob3VsZCBhdXRvLWV4cGFuZCB3aGVuIHRvb2wgbmVlZHMgY29uZmlybWF0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIGF1dG8tZXhwYW5kIHdoZW4gdG9vbCBuZWVkcyBjb25maXJtYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwdWJsaXNoIHRoZSBwZW5kaW5nIGNvbmZpcm1hdGlvbiBjb3VudCB0byB0aGUgb3Blbi1jaGF0IHBpbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2wgPSB7IC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7IHRvb2xJZDogJ2ZpcnN0JyB9KSwgc3RhdGUgfTtcblx0XHRcdHBhcnQuZW5hYmxlQ2Fyb3VzZWxNb2RlKCgpID0+IHsgfSwgKCkgPT4geyB9LCAoX3Rvb2wsIGN1cnJlbnRTdGF0ZSkgPT4gY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pO1xuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wpO1xuXG5cdFx0XHRzdGF0ZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpPy5jb25maXJtYXRpb25Db3VudDtcblx0XHRcdHN0YXRlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cGVuZGluZyxcblx0XHRcdFx0YWZ0ZXJDb25maXJtYXRpb246IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uY29uZmlybWF0aW9uQ291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBlbmRpbmc6IDEsXG5cdFx0XHRcdGFmdGVyQ29uZmlybWF0aW9uOiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzdGluZ3Vpc2ggdGhlIGFjdGl2ZSBjb25maXJtYXRpb24gZnJvbSBwZW5kaW5nIGNvbmZpcm1hdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydChjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdH1cblx0XHRcdH0pLCBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSkpO1xuXG5cdFx0XHRwYXJ0LnNldENvbmZpcm1hdGlvbkFjdGl2ZSh0cnVlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KT8uY29uZmlybWF0aW9uQWN0aXZlO1xuXHRcdFx0cGFydC5zZXRDb25maXJtYXRpb25BY3RpdmUoZmFsc2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWN0aXZlLFxuXHRcdFx0XHRpbmFjdGl2ZTogZ2V0T3BlbkNoYXRDb250ZXh0KHBhcnQpPy5jb25maXJtYXRpb25BY3RpdmUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGFjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0aW5hY3RpdmU6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVmcmVzaCB0aGUgb3Blbi1jaGF0IHRpbWluZyB3aGVuIHRoZSBzdWJhZ2VudCBzdG9wcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0Y2hhdFJlc291cmNlOiAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC90ZXN0L3Rvb2wtY2FsbCcsXG5cdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRzdGFydGVkQXQ6IDEwMDAsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCkpO1xuXHRcdFx0KHRvb2xJbnZvY2F0aW9uIGFzIHVua25vd24gYXMgeyBzdGF0ZTogdHlwZW9mIHN0YXRlIH0pLnN0YXRlID0gc3RhdGU7XG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpKTtcblxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbiA9IDUwMDA7XG5cdFx0XHRzdGF0ZS5zZXQoeyAuLi5zdGF0ZS5nZXQoKSB9LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE9wZW5DaGF0Q29udGV4dChwYXJ0KSwge1xuXHRcdFx0XHRjaGF0UmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Rlc3QvdG9vbC1jYWxsJyxcblx0XHRcdFx0cGFyZW50U2Vzc2lvblJlc291cmNlOiAnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uMScsXG5cdFx0XHRcdHRpdGxlOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uQ291bnQ6IDAsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbkFjdGl2ZTogZmFsc2UsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogMTAwMCxcblx0XHRcdFx0ZHVyYXRpb246IDUwMDAsXG5cdFx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0b3AgdHJhY2tpbmcgYSB0b29sIGludm9jYXRpb24gb25jZSBpdCByZWFjaGVzIGEgdGVybWluYWwgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2w6IElDaGF0VG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRcdC4uLmNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0dG9vbElkOiAncmVhZEZpbGUnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IHN0YXRlT2JzZXJ2YWJsZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUnXG5cdFx0XHR9O1xuXG5cdFx0XHRwYXJ0LnRyYWNrVG9vbFN0YXRlKGNoaWxkVG9vbCk7XG5cdFx0XHRjb25zdCBvYnNlcnZlckNvdW50ID0gKCkgPT4gKHN0YXRlT2JzZXJ2YWJsZSBhcyB1bmtub3duIGFzIEJhc2VPYnNlcnZhYmxlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+KS5kZWJ1Z0dldE9ic2VydmVycygpLnNpemU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2JzZXJ2ZXJDb3VudCgpLCAxLCAnVHJhY2tpbmcgYXV0b3J1biBzaG91bGQgb2JzZXJ2ZSB0aGUgdG9vbCBzdGF0ZScpO1xuXG5cdFx0XHQvLyBDb21wbGV0ZSB0aGUgdG9vbDsgZGlzcG9zYWwgb2YgdGhlIHRyYWNraW5nIGF1dG9ydW4gaXMgZGVmZXJyZWQgdmlhIGEgbWljcm90YXNrLlxuXHRcdFx0c3RhdGVPYnNlcnZhYmxlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvYnNlcnZlckNvdW50KCksIDAsICdUcmFja2luZyBhdXRvcnVuIHNob3VsZCBiZSBkaXNwb3NlZCBvbmNlIHRoZSB0b29sIHJlYWNoZXMgYSB0ZXJtaW5hbCBzdGF0ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGF1dG8tY29sbGFwc2Ugd2hlbiBjb25maXJtYXRpb24gaXMgYWRkcmVzc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgdG9vbCBpbnZvY2F0aW9uIHRoYXQgaXMgd2FpdGluZyBmb3IgY29uZmlybWF0aW9uXG5cdFx0XHRjb25zdCBzdGF0ZU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikpO1xuXHRcdFx0Y29uc3QgY2hpbGRUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3J1bkluVGVybWluYWwnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IHN0YXRlT2JzZXJ2YWJsZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gbnBtIGluc3RhbGwnXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBUcmFjayB0aGlzIHRvb2wncyBzdGF0ZVxuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wpO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgZXhwYW5kZWQgbm93XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIGJlIGV4cGFuZGVkIHdoZW4gd2FpdGluZyBmb3IgY29uZmlybWF0aW9uJyk7XG5cblx0XHRcdC8vIE5vdyBzaW11bGF0ZSBjb25maXJtYXRpb24gYmVpbmcgYWRkcmVzc2VkICh0b29sIG1vdmVzIHRvIGV4ZWN1dGluZylcblx0XHRcdHN0YXRlT2JzZXJ2YWJsZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGF1dG8tY29sbGFwc2UgYWZ0ZXIgY29uZmlybWF0aW9uIGlzIGFkZHJlc3NlZFxuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLFxuXHRcdFx0XHQnU2hvdWxkIGF1dG8tY29sbGFwc2UgYWZ0ZXIgY29uZmlybWF0aW9uIGlzIGFkZHJlc3NlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBhdXRvLWNvbGxhcHNlIGlmIHVzZXIgbWFudWFsbHkgZXhwYW5kZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBVc2VyIG1hbnVhbGx5IGV4cGFuZHNcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgZXhwYW5kZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsICdTaG91bGQgYmUgZXhwYW5kZWQgYWZ0ZXIgdXNlciBjbGljaycpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSB0b29sIHRoYXQgZ29lcyB0aHJvdWdoIGNvbmZpcm1hdGlvbiBjeWNsZVxuXHRcdFx0Y29uc3Qgc3RhdGVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pKTtcblx0XHRcdGNvbnN0IGNoaWxkVG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdydW5JblRlcm1pbmFsJyxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBzdGF0ZU9ic2VydmFibGUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIG5wbSBpbnN0YWxsJ1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gVHJhY2sgdGhpcyB0b29sJ3Mgc3RhdGVcblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY2hpbGRUb29sKTtcblxuXHRcdFx0Ly8gQ29uZmlybSB0aGUgdG9vbCAobW92ZSB0byBleGVjdXRpbmcpXG5cdFx0XHRzdGF0ZU9ic2VydmFibGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyksIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFNpbmNlIHVzZXIgbWFudWFsbHkgZXhwYW5kZWQsIGl0IHNob3VsZCBzdGF5IGV4cGFuZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIHN0YXkgZXhwYW5kZWQgd2hlbiB1c2VyIG1hbnVhbGx5IGV4cGFuZGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzcGVjdCBtYW51YWwgZXhwYW5zaW9uIGFmdGVyIGF1dG8tZXhwYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGluaXRpYWxseSBjb2xsYXBzZWRcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgJ1Nob3VsZCBzdGFydCBjb2xsYXBzZWQnKTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgdG9vbCB0aGF0IG5lZWRzIGNvbmZpcm1hdGlvblxuXHRcdFx0Y29uc3Qgc3RhdGVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pKTtcblx0XHRcdGNvbnN0IGNoaWxkVG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdydW5JblRlcm1pbmFsJyxcblx0XHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdG9vbEludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0YXRlOiBzdGF0ZU9ic2VydmFibGUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIG5wbSBpbnN0YWxsJ1xuXHRcdFx0fTtcblxuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wpO1xuXG5cdFx0XHQvLyBTaG91bGQgYXV0by1leHBhbmRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgYXV0by1leHBhbmQgZm9yIGNvbmZpcm1hdGlvbicpO1xuXG5cdFx0XHQvLyBVc2VyIG1hbnVhbGx5IGNvbGxhcHNlc1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gZ2V0Q29sbGFwc2VCdXR0b24ocGFydCk7XG5cdFx0XHRidXR0b24/LmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksICdTaG91bGQgY29sbGFwc2UgYWZ0ZXIgdXNlciBjbGljaycpO1xuXG5cdFx0XHQvLyBVc2VyIG1hbnVhbGx5IGV4cGFuZHMgYWdhaW5cblx0XHRcdGJ1dHRvbj8uY2xpY2soKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgZXhwYW5kIGFmdGVyIHNlY29uZCB1c2VyIGNsaWNrJyk7XG5cblx0XHRcdC8vIENvbmZpcm0gdGhlIHRvb2wgKG1vdmUgdG8gZXhlY3V0aW5nKVxuXHRcdFx0c3RhdGVPYnNlcnZhYmxlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBTaW5jZSB1c2VyIG1hbnVhbGx5IHJlLWV4cGFuZGVkIGFmdGVyIGF1dG8tZXhwYW5kLCBzaG91bGQgc3RheSBleHBhbmRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBzdGF5IGV4cGFuZGVkIHdoZW4gdXNlciBtYW51YWxseSByZS1leHBhbmRlZCBhZnRlciBhdXRvLWV4cGFuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3VtZSBhdXRvLWNvbGxhcHNlIGFmdGVyIHVzZXIgbWFudWFsbHkgZXhwYW5kcyB0aGVuIGNvbGxhcHNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3JraW5nIG9uIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIEZpcnN0IGNvbmZpcm1hdGlvbiBjeWNsZSAtIHVzZXIgbWFudWFsbHkgZXhwYW5kc1xuXHRcdFx0Y29uc3Qgc3RhdGVPYnNlcnZhYmxlMSA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUxJywgY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikpO1xuXHRcdFx0Y29uc3QgY2hpbGRUb29sMTogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdydW5JblRlcm1pbmFsJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbDEnLFxuXHRcdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiB0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0c3RhdGU6IHN0YXRlT2JzZXJ2YWJsZTEsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRmlyc3QgdG9vbCdcblx0XHRcdH07XG5cblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY2hpbGRUb29sMSk7XG5cblx0XHRcdC8vIFNob3VsZCBhdXRvLWV4cGFuZCBmb3IgZmlyc3QgY29uZmlybWF0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC11c2VkLWNvbnRleHQtY29sbGFwc2VkJyksIGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIGF1dG8tZXhwYW5kIGZvciBmaXJzdCBjb25maXJtYXRpb24nKTtcblxuXHRcdFx0Ly8gVXNlciBtYW51YWxseSBjb2xsYXBzZXNcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGdldENvbGxhcHNlQnV0dG9uKHBhcnQpO1xuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCAnU2hvdWxkIGNvbGxhcHNlIGFmdGVyIHVzZXIgY2xpY2snKTtcblxuXHRcdFx0Ly8gVXNlciBtYW51YWxseSBleHBhbmRzICh0aGlzIHNldHMgdXNlck1hbnVhbGx5RXhwYW5kZWQgPSB0cnVlKVxuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBleHBhbmQgYWZ0ZXIgdXNlciByZS1leHBhbmRzJyk7XG5cblx0XHRcdC8vIENvbXBsZXRlIGZpcnN0IHRvb2wgKHNob3VsZCBub3QgYXV0by1jb2xsYXBzZSBzaW5jZSB1c2VyIG1hbnVhbGx5IGV4cGFuZGVkKVxuXHRcdFx0c3RhdGVPYnNlcnZhYmxlMS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSwgZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgc3RheSBleHBhbmRlZCBhZnRlciBmaXJzdCB0b29sIGNvbXBsZXRlcyAodXNlciBtYW51YWxseSBleHBhbmRlZCknKTtcblxuXHRcdFx0Ly8gVXNlciBtYW51YWxseSBjb2xsYXBzZXMgYWdhaW4gKHRoaXMgcmVzZXRzIHVzZXJNYW51YWxseUV4cGFuZGVkKVxuXHRcdFx0YnV0dG9uPy5jbGljaygpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCAnU2hvdWxkIGNvbGxhcHNlIGFmdGVyIHVzZXIgbWFudWFsbHkgY29sbGFwc2VzJyk7XG5cblx0XHRcdC8vIFNlY29uZCBjb25maXJtYXRpb24gY3ljbGUgLSBzaG91bGQgYXV0by1jb2xsYXBzZSBub3cgc2luY2UgdXNlck1hbnVhbGx5RXhwYW5kZWQgd2FzIHJlc2V0XG5cdFx0XHRjb25zdCBzdGF0ZU9ic2VydmFibGUyID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZTInLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSk7XG5cdFx0XHRjb25zdCBjaGlsZFRvb2wyOiBJQ2hhdFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0XHQuLi5jcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHRvb2xJZDogJ3J1bkluVGVybWluYWwnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sMicsXG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogc3RhdGVPYnNlcnZhYmxlMixcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWNvbmQgdG9vbCdcblx0XHRcdH07XG5cblx0XHRcdHBhcnQudHJhY2tUb29sU3RhdGUoY2hpbGRUb29sMik7XG5cblx0XHRcdC8vIFNob3VsZCBhdXRvLWV4cGFuZCBmb3Igc2Vjb25kIGNvbmZpcm1hdGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpLCBmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCBhdXRvLWV4cGFuZCBmb3Igc2Vjb25kIGNvbmZpcm1hdGlvbicpO1xuXG5cdFx0XHQvLyBDb21wbGV0ZSBzZWNvbmQgdG9vbCAtIHNob3VsZCBhdXRvLWNvbGxhcHNlIHNpbmNlIHVzZXJNYW51YWxseUV4cGFuZGVkIHdhcyByZXNldCBieSB0aGUgZWFybGllciBjb2xsYXBzZVxuXHRcdFx0c3RhdGVPYnNlcnZhYmxlMi5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSxcblx0XHRcdFx0J1Nob3VsZCBhdXRvLWNvbGxhcHNlIGFmdGVyIHNlY29uZCBjb25maXJtYXRpb24gaXMgYWRkcmVzc2VkICh1c2VyTWFudWFsbHlFeHBhbmRlZCB3YXMgcmVzZXQpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY2xlYXIgY3VycmVudCBydW5uaW5nIHRvb2wgbWVzc2FnZSB3aGVuIHRvb2wgY29tcGxldGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50J1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gQ3JlYXRlIGEgdG9vbCB0aGF0IHdpbGwgY29tcGxldGVcblx0XHRcdGNvbnN0IHN0YXRlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCBjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpKTtcblx0XHRcdGNvbnN0IGNoaWxkVG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdFx0Li4uY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHR0b29sSWQ6ICdyZWFkRmlsZScsXG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHRvb2xJbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdGF0ZTogc3RhdGVPYnNlcnZhYmxlLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgY29uZmlnLnRzJ1xuXHRcdFx0fTtcblxuXHRcdFx0cGFydC50cmFja1Rvb2xTdGF0ZShjaGlsZFRvb2wpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGl0bGUgaW5jbHVkZXMgdG9vbCBtZXNzYWdlXG5cdFx0XHRjb25zdCBidXR0b24gPSBnZXRDb2xsYXBzZUJ1dHRvbihwYXJ0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b24sICdCdXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSBnZXRDb2xsYXBzZUJ1dHRvbkxhYmVsKGJ1dHRvbik7XG5cdFx0XHRsZXQgYnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uPy50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhidXR0b25UZXh0LmluY2x1ZGVzKCdSZWFkaW5nIGNvbmZpZy50cycpLCAnVGl0bGUgc2hvdWxkIGluY2x1ZGUgdG9vbCBtZXNzYWdlIHdoaWxlIHJ1bm5pbmcnKTtcblxuXHRcdFx0Ly8gQ29tcGxldGUgdGhlIHRvb2xcblx0XHRcdHN0YXRlT2JzZXJ2YWJsZS5zZXQoY3JlYXRlU3RhdGUoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkKSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gVGl0bGUgc2hvdWxkIHN0aWxsIGluY2x1ZGUgdGhlIHRvb2wgbWVzc2FnZSAocGVyc2lzdHMgbGlrZSB0aGlua2luZyBwYXJ0KVxuXHRcdFx0YnV0dG9uVGV4dCA9IGxhYmVsRWxlbWVudD8udGV4dENvbnRlbnQgPz8gYnV0dG9uPy50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdGFzc2VydC5vayhidXR0b25UZXh0LmluY2x1ZGVzKCdSZWFkaW5nIGNvbmZpZy50cycpLFxuXHRcdFx0XHQnVGl0bGUgc2hvdWxkIHN0aWxsIGluY2x1ZGUgdG9vbCBtZXNzYWdlIGFmdGVyIGNvbXBsZXRpb24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ01vZGVsIG5hbWUgdG9vbHRpcCcsICgpID0+IHtcblx0XHQvLyBIb3ZlciBjb250ZW50IG1heSBiZSBhIHBsYWluIHN0cmluZyBvciBhbiBJTWFya2Rvd25TdHJpbmc7IG5vcm1hbGl6ZSB0byB0ZXh0IGZvciBhc3NlcnRpb25zLlxuXHRcdGNvbnN0IGhvdmVyVGV4dCA9IChjb250ZW50OiB1bmtub3duKTogc3RyaW5nID0+IHtcblx0XHRcdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNNYXJrZG93blN0cmluZyhjb250ZW50KSkge1xuXHRcdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAnJztcblx0XHR9O1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNldCB1cCBob3ZlciB3aXRoIG1vZGVsIG5hbWUgZnJvbSBzZXJpYWxpemVkIHRvb2xTcGVjaWZpY0RhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR1cERlbGF5ZWRIb3ZlckNhbGxzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBjb250ZW50OiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRtb2NrSG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiB7IGNvbnRlbnQ6IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdHNldHVwRGVsYXllZEhvdmVyQ2FsbHMucHVzaCh7IGVsZW1lbnQsIGNvbnRlbnQ6IGhvdmVyVGV4dChvcHRpb25zLmNvbnRlbnQpIH0pO1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1NlcmlhbGl6ZWRUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29tcGxldGVkIHRhc2snLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAnRG8gdGhlIHRoaW5nJyxcblx0XHRcdFx0XHRyZXN1bHQ6ICdEb25lJyxcblx0XHRcdFx0XHRtb2RlbE5hbWU6ICdHUFQtNG8nXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KHRydWUpO1xuXG5cdFx0XHRjcmVhdGVQYXJ0KHNlcmlhbGl6ZWRJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgc2V0IHVwIGEgaG92ZXIgd2l0aCB0aGUgbW9kZWwgbmFtZVxuXHRcdFx0Y29uc3QgbW9kZWxIb3ZlciA9IHNldHVwRGVsYXllZEhvdmVyQ2FsbHMuZmluZChjID0+IGMuY29udGVudC5pbmNsdWRlcygnR1BULTRvJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsSG92ZXIsICdTaG91bGQgc2V0IHVwIGhvdmVyIHdpdGggbW9kZWwgbmFtZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzZXQgdXAgaG92ZXIgd2hlbiBubyBtb2RlbCBuYW1lIGlzIGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNldHVwRGVsYXllZEhvdmVyQ2FsbHM6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGNvbnRlbnQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdG1vY2tIb3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IHsgY29udGVudDogc3RyaW5nIH0pID0+IHtcblx0XHRcdFx0c2V0dXBEZWxheWVkSG92ZXJDYWxscy5wdXNoKHsgZWxlbWVudCwgY29udGVudDogaG92ZXJUZXh0KG9wdGlvbnMuY29udGVudCkgfSk7XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZEludm9jYXRpb24gPSBjcmVhdGVNb2NrU2VyaWFsaXplZFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDb21wbGV0ZWQgdGFzaycsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50Jyxcblx0XHRcdFx0XHRwcm9tcHQ6ICdEbyB0aGUgdGhpbmcnLFxuXHRcdFx0XHRcdHJlc3VsdDogJ0RvbmUnLFxuXHRcdFx0XHRcdC8vIG5vIG1vZGVsTmFtZVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dCh0cnVlKTtcblxuXHRcdFx0Y3JlYXRlUGFydChzZXJpYWxpemVkSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIFNob3VsZCBub3QgaGF2ZSBzZXQgdXAgYW55IGhvdmVyIHdpdGggbW9kZWwgaW5mb1xuXHRcdFx0Y29uc3QgbW9kZWxIb3ZlciA9IHNldHVwRGVsYXllZEhvdmVyQ2FsbHMuZmluZChjID0+IGMuY29udGVudC5pbmNsdWRlcygnTW9kZWw6JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsSG92ZXIsIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3Qgc2V0IHVwIG1vZGVsIGhvdmVyIHdoZW4gbm8gbW9kZWwgbmFtZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNldCB1cCBob3ZlciB3aGVuIHRvb2wgY29tcGxldGVzIGFuZCB0b29sU3BlY2lmaWNEYXRhIGhhcyBtb2RlbE5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR1cERlbGF5ZWRIb3ZlckNhbGxzOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBjb250ZW50OiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRtb2NrSG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiB7IGNvbnRlbnQ6IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdHNldHVwRGVsYXllZEhvdmVyQ2FsbHMucHVzaCh7IGVsZW1lbnQsIGNvbnRlbnQ6IGhvdmVyVGV4dChvcHRpb25zLmNvbnRlbnQpIH0pO1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya2luZyBvbiB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAnRG8gc3R1ZmYnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBjcmVhdGVNb2NrVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0XHRzdGF0ZVR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KGZhbHNlKTtcblxuXHRcdFx0Y3JlYXRlUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cblx0XHRcdC8vIE5vIG1vZGVsIGhvdmVyIGluaXRpYWxseSAobm8gbW9kZWxOYW1lIHlldClcblx0XHRcdGNvbnN0IGluaXRpYWxIb3ZlciA9IHNldHVwRGVsYXllZEhvdmVyQ2FsbHMuZmluZChjID0+IGMuY29udGVudC5pbmNsdWRlcygnTW9kZWw6JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluaXRpYWxIb3ZlciwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCBoYXZlIG1vZGVsIGhvdmVyIGluaXRpYWxseScpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBpbnZva2UoKSBzZXR0aW5nIG1vZGVsTmFtZSBvbiB0b29sU3BlY2lmaWNEYXRhXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSA9ICdDbGF1ZGUgU29ubmV0IDQnO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB0b29sIGNvbXBsZXRpb25cblx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUgYXMgUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+Pjtcblx0XHRcdHN0YXRlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBTaG91bGQgbm93IGhhdmUgYSBob3ZlciB3aXRoIHRoZSBtb2RlbCBuYW1lXG5cdFx0XHRjb25zdCBtb2RlbEhvdmVyID0gc2V0dXBEZWxheWVkSG92ZXJDYWxscy5maW5kKGMgPT4gYy5jb250ZW50LmluY2x1ZGVzKCdDbGF1ZGUgU29ubmV0IDQnKSk7XG5cdFx0XHRhc3NlcnQub2sobW9kZWxIb3ZlciwgJ1Nob3VsZCBzZXQgdXAgaG92ZXIgd2l0aCBtb2RlbCBuYW1lIGFmdGVyIGNvbXBsZXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzZXQgdXAgaG92ZXIgd2l0aCBjcmVkaXRzIGZyb20gc2VyaWFsaXplZCB0b29sU3BlY2lmaWNEYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dXBEZWxheWVkSG92ZXJDYWxsczogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgY29udGVudDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdFx0bW9ja0hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlciA9IChlbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogeyBjb250ZW50OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRzZXR1cERlbGF5ZWRIb3ZlckNhbGxzLnB1c2goeyBlbGVtZW50LCBjb250ZW50OiBob3ZlclRleHQob3B0aW9ucy5jb250ZW50KSB9KTtcblx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXJpYWxpemVkSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tTZXJpYWxpemVkVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbXBsZXRlZCB0YXNrJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdUZXN0QWdlbnQnLFxuXHRcdFx0XHRcdHByb21wdDogJ0RvIHRoZSB0aGluZycsXG5cdFx0XHRcdFx0cmVzdWx0OiAnRG9uZScsXG5cdFx0XHRcdFx0bW9kZWxOYW1lOiAnR1BULTRvJyxcblx0XHRcdFx0XHRjcmVkaXRzOiAxLjUsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZU1vY2tSZW5kZXJDb250ZXh0KHRydWUpO1xuXG5cdFx0XHRjcmVhdGVQYXJ0KHNlcmlhbGl6ZWRJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gSG92ZXIgc2hvdWxkIG1lbnRpb24gYm90aCB0aGUgbW9kZWwgYW5kIHRoZSBjcmVkaXQgY29zdFxuXHRcdFx0Y29uc3QgaG92ZXIgPSBzZXR1cERlbGF5ZWRIb3ZlckNhbGxzLmZpbmQoYyA9PiBjLmNvbnRlbnQuaW5jbHVkZXMoJzEuNScpICYmIGMuY29udGVudC5pbmNsdWRlcygnY3JlZGl0cycpKTtcblx0XHRcdGFzc2VydC5vayhob3ZlciwgJ1Nob3VsZCBzZXQgdXAgaG92ZXIgd2l0aCBjcmVkaXRzJyk7XG5cdFx0XHRhc3NlcnQub2soaG92ZXIhLmNvbnRlbnQuaW5jbHVkZXMoJ0dQVC00bycpLCAnSG92ZXIgc2hvdWxkIHN0aWxsIGluY2x1ZGUgbW9kZWwgbmFtZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVwZGF0ZSBob3ZlciB3aXRoIGNyZWRpdHMgd2hlbiB0aGV5IGFycml2ZSBhZnRlciBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dXBEZWxheWVkSG92ZXJDYWxsczogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgY29udGVudDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdFx0bW9ja0hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlciA9IChlbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogeyBjb250ZW50OiBzdHJpbmcgfSkgPT4ge1xuXHRcdFx0XHRzZXR1cERlbGF5ZWRIb3ZlckNhbGxzLnB1c2goeyBlbGVtZW50LCBjb250ZW50OiBob3ZlclRleHQob3B0aW9ucy5jb250ZW50KSB9KTtcblx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ0RvIHN0dWZmJyxcblx0XHRcdFx0bW9kZWxOYW1lOiAnR1BULTRvJyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gY3JlYXRlTW9ja1Rvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0c3RhdGVUeXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVNb2NrUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cblx0XHRcdGNyZWF0ZVBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQpO1xuXG5cdFx0XHQvLyBObyBjcmVkaXRzIGluIHRoZSBob3ZlciB5ZXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXR1cERlbGF5ZWRIb3ZlckNhbGxzLmZpbmQoYyA9PiBjLmNvbnRlbnQuaW5jbHVkZXMoJ2NyZWRpdCcpKSwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCBzaG93IGNyZWRpdHMgYmVmb3JlIHRoZXkgYXJlIHJlcG9ydGVkJyk7XG5cblx0XHRcdC8vIENyZWRpdHMgYWNjdW11bGF0ZSBhbmQgdGhlIHN1YmFnZW50IGNvbXBsZXRlc1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5jcmVkaXRzID0gMjtcblx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUgYXMgUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+Pjtcblx0XHRcdHN0YXRlLnNldChjcmVhdGVTdGF0ZShJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBjcmVkaXRIb3ZlciA9IHNldHVwRGVsYXllZEhvdmVyQ2FsbHMuZmluZChjID0+IGMuY29udGVudC5pbmNsdWRlcygnMicpICYmIGMuY29udGVudC5pbmNsdWRlcygnY3JlZGl0cycpKTtcblx0XHRcdGFzc2VydC5vayhjcmVkaXRIb3ZlciwgJ1Nob3VsZCBzZXQgdXAgaG92ZXIgd2l0aCBjcmVkaXRzIGFmdGVyIGNvbXBsZXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1cGRhdGUgaG92ZXIgd2l0aCBtb2RlbCBuYW1lIHdoZW4gaXQgYXJyaXZlcyBhZnRlciBpbml0aWFsIHJlbmRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNldHVwRGVsYXllZEhvdmVyQ2FsbHM6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGNvbnRlbnQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdG1vY2tIb3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IHsgY29udGVudDogc3RyaW5nIH0pID0+IHtcblx0XHRcdFx0c2V0dXBEZWxheWVkSG92ZXJDYWxscy5wdXNoKHsgZWxlbWVudCwgY29udGVudDogaG92ZXJUZXh0KG9wdGlvbnMuY29udGVudCkgfSk7XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQWdlbnQgaG9zdCBzdWJhZ2VudHMgc3RhcnQgd2l0aG91dCBhIG1vZGVsIG5hbWU7IGl0IGlzIHJlcG9ydGVkXG5cdFx0XHQvLyBsYXRlciB2aWEgdGhlIGNoaWxkIHR1cm5zJyB1c2FnZSBldmVudHMuXG5cdFx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1dvcmtpbmcgb24gdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ1Rlc3RBZ2VudCcsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IGNyZWF0ZU1vY2tUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRcdHN0YXRlVHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlTW9ja1JlbmRlckNvbnRleHQoZmFsc2UpO1xuXG5cdFx0XHRjcmVhdGVQYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblxuXHRcdFx0Ly8gTm8gbW9kZWwgaW4gdGhlIGhvdmVyIHlldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldHVwRGVsYXllZEhvdmVyQ2FsbHMuZmluZChjID0+IGMuY29udGVudC5pbmNsdWRlcygnTW9kZWwnKSksIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3Qgc2hvdyBhIG1vZGVsIGJlZm9yZSBvbmUgaXMgcmVwb3J0ZWQnKTtcblxuXHRcdFx0Ly8gTW9kZWwgbmFtZSBhcnJpdmVzIHdoaWxlIHRoZSBzdWJhZ2VudCBpcyBzdGlsbCBydW5uaW5nXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSA9ICdDbGF1ZGUgU29ubmV0IDQnO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZSBhcyBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4+O1xuXHRcdFx0c3RhdGUuc2V0KGNyZWF0ZVN0YXRlKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyksIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IG1vZGVsSG92ZXIgPSBzZXR1cERlbGF5ZWRIb3ZlckNhbGxzLmZpbmQoYyA9PiBjLmNvbnRlbnQuaW5jbHVkZXMoJ0NsYXVkZSBTb25uZXQgNCcpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbEhvdmVyLCAnU2hvdWxkIHNldCB1cCBob3ZlciB3aXRoIG1vZGVsIG5hbWUgYWZ0ZXIgaXQgYXJyaXZlcycpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQThDO0FBQ3ZELFNBQVMsY0FBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBSWhDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCLHFDQUFxQztBQUMvRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLCtCQUErQjtBQUN4QyxTQUErRSxxQkFBb0QsdUJBQXVCO0FBSTFKLFNBQVMsa0NBQWtDO0FBRzNDLFNBQTBCLHdCQUF3QjtBQUVsRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBaUMsOEJBQThCO0FBQy9ELFNBQTZCLGNBQWMsUUFBUSxzQkFBc0I7QUFDekUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQ0FBc0Msb0NBQW9DLHlCQUF5QjtBQUM1RyxTQUFTLCtCQUErQiwyQkFBMkIsZ0NBQWdDLDJDQUEyQztBQUU5SSxNQUFNLG1DQUFtQyxlQUFlO0FBQUEsRUFDdkQsWUFBWSxjQUF1QixTQUFpQztBQUNuRSxVQUFNLFFBQVcsSUFBSSxPQUFPLGFBQWEsSUFBSSxhQUFhLE9BQU8sYUFBYSxPQUFPLE1BQU0sYUFBVyxhQUFhLElBQUksT0FBTyxDQUFDLEdBQUcsT0FBTztBQUN6SSxRQUFJLEtBQUssa0JBQWtCLFFBQVE7QUFDbEMsV0FBSyxVQUFVLEtBQUssTUFBTTtBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSwwQkFBNEQ7QUFBQSxFQUFsRTtBQUVDLFNBQWlCLGVBQWUsSUFBSSxRQUFnQjtBQUNwRCxTQUFTLGNBQWMsS0FBSyxhQUFhO0FBQ3pDLFNBQVEscUJBQXFCO0FBQUE7QUFBQSxFQUU3QixJQUFJLHFCQUE4QjtBQUNqQyxXQUFPLEtBQUssYUFBYSxhQUFhO0FBQUEsRUFDdkM7QUFBQSxFQUVBLHFCQUFxQixXQUEwQjtBQUM5QyxTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUEsRUFFQSxjQUFjLFFBQXNCO0FBQ25DLFNBQUssYUFBYSxLQUFLLE1BQU07QUFBQSxFQUM5QjtBQUFBLEVBRUEsU0FBUyxPQUFlLFlBQTZCLFdBQXdEO0FBQzVHLFdBQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxJQUFFLEVBQUU7QUFBQSxFQUM3QjtBQUFBLEVBRUEsT0FBTyxNQUFjLFdBQWdFO0FBQ3BGLFFBQUksQ0FBQyxLQUFLLHNCQUFzQixTQUFTLE9BQU8sdUJBQXVCLGNBQWMsc0NBQXNDO0FBQzFILGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxDQUFDLFFBQVEsWUFBWSxJQUFJLDJCQUEyQixRQUFRLE9BQU87QUFBQSxFQUMzRTtBQUNEO0FBRUEsTUFBTSxnQ0FBZ0MsZ0JBQWdCO0FBQUEsRUFJckQsWUFBNkIsZ0JBQWdDO0FBQzVELFVBQU07QUFEc0I7QUFIN0IsMkJBQWtCO0FBQ2xCLCtCQUFzQjtBQUFBLEVBSXRCO0FBQUEsRUFFUyxXQUFXLElBQVksbUJBQXVDO0FBQ3RFLFNBQUs7QUFDTCxXQUFPLE1BQU0sV0FBVyxJQUFJLGlCQUFpQjtBQUFBLEVBQzlDO0FBQUEsRUFFUyxlQUFlLElBQVksbUJBQXVDLFNBQTBFO0FBQ3BKLFNBQUs7QUFDTCxRQUFJLE9BQU8sT0FBTyxxQkFBcUI7QUFDdEMsYUFBTyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssY0FBYyxDQUFDLENBQUM7QUFBQSxJQUM5QztBQUNBLFdBQU8sTUFBTSxlQUFlLElBQUksbUJBQW1CLE9BQU87QUFBQSxFQUMzRDtBQUNEO0FBRUEsTUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxRQUFNLFFBQVEsd0NBQXdDO0FBSXRELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosV0FBUyx3QkFBd0IsYUFBc0IsT0FBTyxrQkFBdUIsSUFBSSxNQUFNLDhCQUE4QixHQUFrQztBQUM5SixVQUFNLGNBQStDO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLElBQUk7QUFBQSxNQUNKO0FBQUEsTUFDQSxJQUFJLFFBQVE7QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFzQztBQUFBLElBQzdEO0FBRUEsV0FBTztBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1Qsa0JBQWtCLENBQUM7QUFBQSxNQUNuQixjQUFjO0FBQUEsTUFDZCxXQUFXLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFBQSxNQUNsRCxTQUFTLENBQUM7QUFBQSxNQUNWLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUNaLHFCQUFxQjtBQUFBLE1BQ3JCLGdCQUFnQjtBQUFBLE1BQ2hCLGdCQUFnQixDQUFDO0FBQUEsTUFDakIsY0FBYyxnQkFBZ0IsZ0JBQWdCLEdBQUc7QUFBQSxNQUNqRCx1QkFBdUIsTUFBTTtBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUVBLFdBQVMsWUFBWSxXQUEwQyxZQUFrRTtBQUNoSSxZQUFRLFdBQVc7QUFBQSxNQUNsQixLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQyxjQUFjLGdCQUFnQixnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsVUFDaEQsa0JBQWtCLGdCQUFnQixvQkFBb0IsTUFBUztBQUFBLFFBQ2hFO0FBQUEsTUFDRCxLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQztBQUFBLFVBQ0EsV0FBVyxFQUFFLE1BQU0sZ0JBQWdCLHNCQUFzQjtBQUFBLFVBQ3pELGVBQWU7QUFBQSxVQUNmLGVBQWU7QUFBQSxVQUNmLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8sY0FBYyxDQUFDO0FBQUEsUUFDekQ7QUFBQSxNQUNELEtBQUssb0JBQW9CLFVBQVU7QUFDbEMsZUFBTztBQUFBLFVBQ04sTUFBTSxvQkFBb0IsVUFBVTtBQUFBLFVBQ3BDO0FBQUEsVUFDQSxXQUFXLEVBQUUsTUFBTSxnQkFBZ0Isc0JBQXNCO0FBQUEsVUFDekQsVUFBVSxnQkFBZ0IsWUFBWSxFQUFFLFNBQVMsUUFBVyxVQUFVLE9BQVUsQ0FBQztBQUFBLFFBQ2xGO0FBQUEsTUFDRCxLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQztBQUFBLFVBQ0EsV0FBVyxFQUFFLE1BQU0sZ0JBQWdCLHNCQUFzQjtBQUFBLFVBQ3pELFFBQVE7QUFBQSxZQUNQLElBQUk7QUFBQSxZQUNKLE1BQU07QUFBQSxZQUNOLFVBQVU7QUFBQSxVQUNYO0FBQUEsVUFDQSxRQUFRLE1BQU07QUFBQSxVQUFFO0FBQUEsUUFDakI7QUFBQSxNQUNELEtBQUssb0JBQW9CLFVBQVU7QUFDbEMsZUFBTztBQUFBLFVBQ04sTUFBTSxvQkFBb0IsVUFBVTtBQUFBLFVBQ3BDO0FBQUEsVUFDQSxzQkFBc0I7QUFBQSxZQUNyQixPQUFPO0FBQUEsWUFDUCxTQUFTO0FBQUEsVUFDVjtBQUFBLFVBQ0EsU0FBUyxNQUFNO0FBQUEsVUFBRTtBQUFBLFFBQ2xCO0FBQUEsTUFDRCxLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQztBQUFBLFVBQ0EsV0FBVyxFQUFFLE1BQU0sZ0JBQWdCLHNCQUFzQjtBQUFBLFVBQ3pELGVBQWU7QUFBQSxVQUNmLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8sY0FBYyxDQUFDO0FBQUEsVUFDeEQsU0FBUyxNQUFNO0FBQUEsVUFBRTtBQUFBLFFBQ2xCO0FBQUEsTUFDRCxLQUFLLG9CQUFvQixVQUFVO0FBQ2xDLGVBQU87QUFBQSxVQUNOLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxVQUNwQztBQUFBLFVBQ0EsUUFBUSxnQkFBZ0I7QUFBQSxRQUN6QjtBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBRUEsV0FBUyx5QkFBeUIsVUFROUIsQ0FBQyxHQUF3QjtBQUM1QixVQUFNLFlBQVksUUFBUSxhQUFhLG9CQUFvQixVQUFVO0FBQ3JFLFVBQU0sYUFBYSxZQUFZLFdBQVcsUUFBUSxVQUFVO0FBQzVELFVBQU0sYUFBYSxRQUFRLGNBQWMsZUFBZSxLQUFLLE9BQU8sRUFBRSxTQUFTLEVBQUUsRUFBRSxVQUFVLENBQUM7QUFFOUYsVUFBTSxpQkFBc0M7QUFBQSxNQUMzQyxjQUFjO0FBQUEsTUFDZCxrQkFBa0IsUUFBUSxvQkFBb0I7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsTUFDVDtBQUFBLE1BQ0EsZUFBZTtBQUFBLE1BQ2YsbUJBQW1CLFFBQVEscUJBQXFCO0FBQUEsTUFDaEQsa0JBQWtCO0FBQUEsTUFDbEIsUUFBUSxlQUFlO0FBQUEsTUFDdkIsUUFBUSxRQUFRLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUM7QUFBQSxNQUNBLHNCQUFzQixRQUFRO0FBQUEsTUFDOUIsT0FBTyxnQkFBZ0IsU0FBUyxVQUFVO0FBQUEsTUFDMUMsc0JBQXNCLGdCQUFnQixTQUFTLFFBQVEsb0JBQW9CLEVBQUUsTUFBTSxXQUFXLEdBQUcsSUFBSTtBQUFBLE1BQ3JHLHNCQUFzQjtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFFBQVEsTUFBTSxtQ0FBbUM7QUFBQSxRQUNoRCxRQUFRLFFBQVEsVUFBVSxnQkFBZ0I7QUFBQSxRQUMxQyxzQkFBc0IsUUFBUTtBQUFBLFFBQzlCLGtCQUFrQixRQUFRO0FBQUEsUUFDMUIsWUFBWSxjQUFjLG9CQUFvQixVQUFVO0FBQUEsTUFDekQsQ0FBQztBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUVBLFdBQVMsbUNBQW1DLFVBS3hDLENBQUMsR0FBa0M7QUFDdEMsV0FBTztBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2Qsa0JBQWtCLFFBQVEsb0JBQW9CO0FBQUEsUUFDN0MsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLGVBQWU7QUFBQSxNQUNmLG1CQUFtQjtBQUFBLE1BQ25CLGtCQUFrQjtBQUFBLE1BQ2xCLGVBQWU7QUFBQSxNQUNmLGFBQWEsRUFBRSxNQUFNLGdCQUFnQixzQkFBc0I7QUFBQSxNQUMzRCxZQUFZLFFBQVEsY0FBYztBQUFBLE1BQ2xDLFlBQVksUUFBUSx3QkFBd0I7QUFBQSxNQUM1QyxRQUFRLFFBQVEsVUFBVSxnQkFBZ0I7QUFBQSxNQUMxQyxRQUFRLGVBQWU7QUFBQSxNQUN2QixzQkFBc0IsUUFBUTtBQUFBLE1BQzlCLE1BQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUVBLFFBQU0sTUFBTTtBQUNYLGtCQUFjLE1BQU0sSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBQzdDLDJCQUF1Qiw4QkFBOEIsUUFBVyxLQUFLO0FBQ3JFLDBCQUFzQjtBQUd0QiwyQkFBdUI7QUFBQSxNQUN0QixRQUFRLENBQUMsV0FBNEIsVUFBa0MsZUFBZ0Q7QUFDdEg7QUFDQSxjQUFNLFVBQVUsY0FBYyxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQ3JFLGNBQU0sVUFBVSxPQUFPLGNBQWMsV0FBVyxZQUFhLFVBQVUsU0FBUztBQUNoRixnQkFBUSxjQUFjO0FBQ3RCLGVBQU87QUFBQSxVQUNOO0FBQUEsVUFDQSxTQUFTLE1BQU07QUFBQSxVQUFFO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLHdCQUFvQjtBQUFBLE1BQ25CLGVBQWU7QUFBQSxNQUNmLFVBQVUsT0FBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQ3RDLG1CQUFtQjtBQUFBLElBQ3BCO0FBQ0EseUJBQXFCLEtBQUssNEJBQTRCLGlCQUFpQjtBQUd2RSx1QkFBbUI7QUFBQSxNQUNsQixlQUFlO0FBQUEsTUFDZixrQkFBa0IsTUFBTTtBQUFBLE1BQ3hCLG1CQUFtQixPQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsTUFBRSxFQUFFO0FBQUEsTUFDL0MsMEJBQTBCLE9BQU8sRUFBRSxTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUN0RCxrQkFBa0IsTUFBTTtBQUFBLE1BQ3hCLFdBQVcsTUFBTTtBQUFBLE1BQUU7QUFBQSxNQUNuQix1QkFBdUIsTUFBTTtBQUFBLE1BQUU7QUFBQSxNQUMvQixtQkFBbUIsT0FBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQUUsR0FBRyxNQUFNLE1BQU07QUFBQSxNQUFFLEdBQUcsTUFBTSxNQUFNO0FBQUEsTUFBRSxHQUFHLFFBQVEsTUFBTTtBQUFBLE1BQUUsRUFBRTtBQUFBLE1BQ3BHLGtCQUFrQixNQUFNO0FBQUEsTUFBRTtBQUFBLElBQzNCO0FBQ0EseUJBQXFCLEtBQUssZUFBZSxnQkFBZ0I7QUFDekQseUJBQXFCLEtBQUssdUJBQXVCLElBQUksY0FBYyx5QkFBeUI7QUFBQSxNQUNsRixrQkFBMkI7QUFBRSxlQUFPO0FBQUEsTUFBTztBQUFBLElBQ3JELEVBQUUsQ0FBQztBQUNILDRCQUF3QixJQUFJLDBCQUEwQjtBQUN0RCx5QkFBcUIsS0FBSyx3QkFBd0IscUJBQXFCO0FBQ3ZFLGtCQUFjLElBQUksd0JBQXdCLElBQUk7QUFBQSxNQUM3QyxFQUFFLElBQUksc0NBQXNDLE9BQU8sZ0JBQWdCO0FBQUEsTUFDbkU7QUFBQSxNQUNBLEVBQUUsbUJBQW1CLEtBQUs7QUFBQSxNQUMxQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLHFCQUFxQixJQUFJLGtCQUFrQjtBQUFBLE1BQzNDLHFCQUFxQixJQUFJLGVBQWU7QUFBQSxJQUN6QyxDQUFDO0FBQ0QseUJBQXFCLEtBQUssY0FBYyxXQUFXO0FBQ25ELElBQUMscUJBQXFCLElBQUkscUJBQXFCLEVBQStCLHFCQUFxQixrQkFBa0IsMkJBQTJCLElBQUk7QUFHcEosbUJBQWUsQ0FBQztBQUNoQixxQkFBaUIsQ0FBQztBQUNsQixnQ0FBNEIsb0JBQUksSUFBSTtBQUFBLEVBQ3JDLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxnQkFBWSxRQUFRO0FBQUEsRUFDckIsQ0FBQztBQUVELFdBQVMsV0FDUixnQkFDQSxTQUNBLFlBQzBCO0FBQzFCLFVBQU0sT0FBTyxNQUFNLElBQUkscUJBQXFCO0FBQUEsTUFDM0M7QUFBQSxNQUNBLGNBQWMsZUFBZSx3QkFBd0IsZUFBZTtBQUFBLE1BQ3BFO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsTUFBTTtBQUFBLE1BQ047QUFBQSxJQUNELENBQUM7QUFFRCxlQUFXLFNBQVMsS0FBSyxZQUFZLEtBQUssT0FBTztBQUNqRCxnQkFBWSxJQUFJLEVBQUUsU0FBUyxNQUFNLEtBQUssUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUV4RCxXQUFPO0FBQUEsRUFDUjtBQUVBLFdBQVMsa0JBQWtCLE1BQXdEO0FBQ2xGLFVBQU0sU0FBUyxLQUFLLFFBQVEsY0FBYywyQ0FBMkM7QUFDckYsV0FBTyxjQUFjLE1BQU0sSUFBSSxTQUFTO0FBQUEsRUFDekM7QUFFQSxXQUFTLHVCQUF1QixRQUE4QztBQUM3RSxVQUFNLFFBQVEsT0FBTyxjQUFjLHdCQUF3QjtBQUMzRCxXQUFPLGNBQWMsS0FBSyxJQUFJLFFBQVE7QUFBQSxFQUN2QztBQUVBLFdBQVMsc0JBQXNCLFFBQThDO0FBQzVFLFVBQU0sT0FBTyxPQUFPO0FBQ3BCLFdBQU8sY0FBYyxJQUFJLElBQUksT0FBTztBQUFBLEVBQ3JDO0FBRUEsV0FBUyxrQkFBa0IsTUFBd0Q7QUFDbEYsVUFBTSxVQUFVLEtBQUssUUFBUSxjQUFjLDRCQUE0QjtBQUN2RSxXQUFPLGNBQWMsT0FBTyxJQUFJLFVBQVU7QUFBQSxFQUMzQztBQUVBLFdBQVMsbUJBQW1CLE1BQTBRO0FBQ3JTLFdBQVEsS0FBdVMsa0JBQWtCLFdBQVc7QUFBQSxFQUM3VTtBQUVBLFdBQVMsb0JBQW9CLE1BQStCLFNBQXdCO0FBQ25GLFVBQU0sVUFBVyxLQUEwSDtBQUMzSSxXQUFPLEdBQUcsT0FBTztBQUNqQixVQUFNLFNBQVMsTUFBTSxJQUFJLElBQUksT0FBTyxnQkFBZ0IsaUJBQWlCLElBQUksT0FBTyxDQUFDO0FBQ2pGLFlBQVEsaUJBQWlCLE1BQU07QUFDL0IsWUFBUSxnQkFBZ0IsTUFBTTtBQUM5QixJQUFDLEtBQXdELHdCQUF3QjtBQUFBLEVBQ2xGO0FBRUEsUUFBTSxtQkFBbUIsTUFBTTtBQUM5QixTQUFLLG9EQUFvRCxNQUFNO0FBQzlELFlBQU0saUJBQWlCLHlCQUF5QjtBQUNoRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsYUFBTyxHQUFHLEtBQUssUUFBUSxVQUFVLFNBQVMsbUJBQW1CLEdBQUcscUNBQXFDO0FBQ3JHLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLG9CQUFvQixHQUFHLHNDQUFzQztBQUN2RyxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUywwQkFBMEIsR0FBRyw0Q0FBNEM7QUFDbkgsYUFBTyxHQUFHLEtBQUssUUFBUSxVQUFVLFNBQVMscUNBQXFDLEdBQUcsaURBQWlEO0FBQ25JLGFBQU8sWUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLG1DQUFtQyxHQUFHLE9BQU8seURBQXlEO0FBQUEsSUFDMUosQ0FBQztBQUVELFNBQUssa0VBQWtFLE1BQU07QUFDNUUsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBQ2xDLFlBQU0sU0FBUyxLQUFLLFFBQVEsY0FBYywwQkFBMEI7QUFDcEUsWUFBTSxVQUFVLFFBQVEsY0FBYyxrQ0FBa0M7QUFDeEUsWUFBTSxpQkFBaUIsa0JBQWtCLElBQUk7QUFFN0MsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixjQUFjLEtBQUssUUFBUSxVQUFVLFNBQVMsd0JBQXdCO0FBQUEsUUFDdEUsdUJBQXVCLFNBQVMsa0JBQWtCO0FBQUEsUUFDbEQsK0JBQStCLFNBQVMsdUJBQXVCO0FBQUEsTUFDaEUsR0FBRztBQUFBLFFBQ0YsY0FBYztBQUFBLFFBQ2QsdUJBQXVCO0FBQUEsUUFDdkIsK0JBQStCO0FBQUEsTUFDaEMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNkVBQTZFLE1BQU07QUFDdkYsWUFBTSxnQkFBZ0IscUJBQXFCLElBQUkscUJBQXFCO0FBQ3BFLG9CQUFjLHFCQUFxQixrQkFBa0IsMkJBQTJCLEtBQUs7QUFDckYsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBRWxDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsY0FBYyxLQUFLLFFBQVEsVUFBVSxTQUFTLHdCQUF3QjtBQUFBLFFBQ3RFLFlBQVksQ0FBQyxDQUFDLEtBQUssUUFBUSxjQUFjLGtDQUFrQztBQUFBLFFBQzNFLHVCQUF1QixrQkFBa0IsSUFBSSxHQUFHLE1BQU0sWUFBWTtBQUFBLE1BQ25FLEdBQUc7QUFBQSxRQUNGLGNBQWM7QUFBQSxRQUNkLFlBQVk7QUFBQSxRQUNaLHVCQUF1QjtBQUFBLE1BQ3hCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGtGQUFrRixNQUFNO0FBQzVGLFlBQU0sV0FBVywwQkFBMEI7QUFBQSxRQUMxQyxjQUFjO0FBQUEsUUFDZCx1QkFBdUI7QUFBQSxNQUN4QixDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsWUFBWTtBQUFBLFFBQ2xDLFFBQVEsU0FBUztBQUFBLFFBQ2pCLE1BQU0sU0FBUztBQUFBLFFBQ2YsVUFBVSxTQUFTO0FBQUEsUUFDbkIsY0FBYyxJQUFJLGdCQUFnQixTQUFTLEtBQUssRUFBRSxJQUFJLGtDQUFrQztBQUFBLE1BQ3pGLEdBQUc7QUFBQSxRQUNGLFFBQVE7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLGNBQWM7QUFBQSxNQUNmLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDREQUE0RCxNQUFNO0FBQ3RFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsU0FBUyw4QkFBOEIsS0FBTyxRQUFXLElBQU07QUFBQSxRQUMvRCxXQUFXLDhCQUE4QixLQUFPLElBQU07QUFBQSxNQUN2RCxHQUFHO0FBQUEsUUFDRixTQUFTO0FBQUEsUUFDVCxXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLGtCQUFrQixvQ0FBb0MsUUFBVyxPQUFPLFFBQVcsS0FBSztBQUFBLFFBQ3hGLGVBQWUsb0NBQW9DLFFBQVcsT0FBTyxVQUFVLElBQUk7QUFBQSxRQUNuRixVQUFVLG9DQUFvQyxVQUFVLE1BQU0sVUFBVSxJQUFJO0FBQUEsUUFDNUUsZUFBZSxvQ0FBb0MsVUFBVSxNQUFNLFVBQVUsSUFBSTtBQUFBLFFBQ2pGLGVBQWUsb0NBQW9DLFVBQVUsTUFBTSxRQUFXLEtBQUs7QUFBQSxNQUNwRixHQUFHO0FBQUEsUUFDRixrQkFBa0I7QUFBQSxRQUNsQixlQUFlO0FBQUEsUUFDZixVQUFVO0FBQUEsUUFDVixlQUFlO0FBQUEsUUFDZixlQUFlO0FBQUEsTUFDaEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsscUZBQXFGLE1BQU07QUFDL0YsWUFBTSxTQUFTLE1BQU0sSUFBSSxJQUFJLE9BQU8sZ0JBQWdCLGVBQWUsQ0FBQztBQUNwRSxZQUFNLFdBQVcsTUFBTSxJQUFJLHFCQUFxQjtBQUFBLFFBQy9DO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBLENBQUM7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsZUFBUyxPQUFPLFdBQVcsU0FBUyxjQUFjLEtBQUssQ0FBQztBQUN4RCxZQUFNLFlBQVk7QUFRbEIsZ0JBQVUsdUJBQXVCO0FBQ2pDLGdCQUFVLHNCQUFzQjtBQUNoQyxnQkFBVSxvQkFBb0I7QUFDOUIsZ0JBQVUsbUJBQW1CO0FBQzdCLGdCQUFVLHVCQUF1QjtBQUVqQyxnQkFBVSxtQkFBbUI7QUFFN0IsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixnQkFBZ0IsVUFBVTtBQUFBLFFBQzFCLGlCQUFpQixVQUFVO0FBQUEsTUFDNUIsR0FBRztBQUFBLFFBQ0YsZ0JBQWdCO0FBQUEsUUFDaEIsaUJBQWlCO0FBQUEsTUFDbEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNkRBQTZELE1BQU07QUFDdkUsWUFBTSxTQUFTLE1BQU0sSUFBSSxJQUFJLE9BQU8sZ0JBQWdCLGVBQWUsQ0FBQztBQUNwRSxZQUFNLFdBQVcsTUFBTSxJQUFJLHFCQUFxQjtBQUFBLFFBQy9DO0FBQUEsUUFDQTtBQUFBLFVBQ0MsY0FBYztBQUFBLFVBQ2QsdUJBQXVCO0FBQUEsVUFDdkIsVUFBVTtBQUFBLFFBQ1g7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sWUFBWSxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQ3pELGVBQVMsT0FBTyxTQUFTO0FBQ3pCLFlBQU0sV0FBVyxVQUFVLGNBQTJCLGlDQUFpQztBQUV2RixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFFBQVEsVUFBVSxVQUFVLFNBQVMsUUFBUTtBQUFBLFFBQzdDLE9BQU8sVUFBVSxjQUFjLHVDQUF1QyxHQUFHO0FBQUEsUUFDekUsZ0JBQWdCLFVBQVUsY0FBYyxzQ0FBc0MsR0FBRyxVQUFVLFNBQVMsaUJBQWlCO0FBQUEsUUFDckgsV0FBVyxVQUFVLGFBQWEsWUFBWTtBQUFBLE1BQy9DLEdBQUc7QUFBQSxRQUNGLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLGdCQUFnQjtBQUFBLFFBQ2hCLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFlBQU0sU0FBUyxNQUFNLElBQUksSUFBSSxPQUFPLGdCQUFnQixlQUFlLENBQUM7QUFDcEUsWUFBTSxXQUFXLE1BQU0sSUFBSSxxQkFBcUI7QUFBQSxRQUMvQztBQUFBLFFBQ0E7QUFBQSxVQUNDLGNBQWM7QUFBQSxVQUNkLHVCQUF1QjtBQUFBLFVBQ3ZCLFVBQVU7QUFBQSxVQUNWLGtCQUFrQjtBQUFBLFVBQ2xCLGlCQUFpQjtBQUFBLFVBQ2pCLGdCQUFnQixRQUFRO0FBQUEsUUFDekI7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sWUFBWSxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQ3pELGVBQVMsT0FBTyxTQUFTO0FBRXpCLGFBQU8sWUFBWSxVQUFVLGlCQUFpQiwyQ0FBMkMsRUFBRSxRQUFRLENBQUM7QUFBQSxJQUNyRyxDQUFDO0FBRUQsU0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxZQUFNLGNBQWM7QUFBQSxRQUNuQixjQUFjO0FBQUEsUUFDZCx1QkFBdUI7QUFBQSxRQUN2QixVQUFVO0FBQUEsTUFDWDtBQUNBLFlBQU0sU0FBUyxNQUFNLElBQUksSUFBSSxPQUFPLGdCQUFnQixlQUFlLENBQUM7QUFDcEUsWUFBTSxXQUFXLE1BQU0sSUFBSSxxQkFBcUI7QUFBQSxRQUMvQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sWUFBWSxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQ3pELGVBQVMsT0FBTyxTQUFTO0FBQ3pCLFlBQU0sWUFBWTtBQUVsQixlQUFTLGlCQUFpQjtBQUFBLFFBQ3pCLEdBQUc7QUFBQSxRQUNILGtCQUFrQjtBQUFBLFFBQ2xCLGlCQUFpQjtBQUFBLFFBQ2pCLGdCQUFnQixRQUFRO0FBQUEsTUFDekIsQ0FBQztBQUNELGdCQUFVLHNCQUFzQjtBQUNoQyxZQUFNLFlBQVk7QUFBQSxRQUNqQixPQUFPLFVBQVUsY0FBYyx1Q0FBdUMsR0FBRztBQUFBLFFBQ3pFLFdBQVcsVUFBVSxhQUFhLFlBQVk7QUFBQSxNQUMvQztBQUNBLGVBQVMsaUJBQWlCLFdBQVc7QUFDckMsZ0JBQVUsc0JBQXNCO0FBRWhDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEI7QUFBQSxRQUNBLGNBQWMsVUFBVSxjQUFjLHVDQUF1QyxHQUFHO0FBQUEsUUFDaEYsa0JBQWtCLFVBQVUsYUFBYSxZQUFZO0FBQUEsTUFDdEQsR0FBRztBQUFBLFFBQ0YsV0FBVztBQUFBLFVBQ1YsT0FBTztBQUFBLFVBQ1AsV0FBVztBQUFBLFFBQ1o7QUFBQSxRQUNBLGNBQWM7QUFBQSxRQUNkLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFVBQUk7QUFDSiwyQkFBcUIsS0FBSyxvQkFBb0IsY0FBa0M7QUFBQSxRQUMvRSxhQUFhLE9BQU0sYUFBWTtBQUM5QiwyQkFBaUI7QUFDakIsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFDRixZQUFNLFNBQVMsTUFBTSxJQUFJLElBQUksT0FBTyxnQkFBZ0IsZUFBZSxDQUFDO0FBQ3BFLFlBQU0sV0FBVyxNQUFNLElBQUkscUJBQXFCO0FBQUEsUUFDL0M7QUFBQSxRQUNBO0FBQUEsVUFDQyxjQUFjO0FBQUEsVUFDZCx1QkFBdUI7QUFBQSxVQUN2QixPQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxRQUNBLENBQUM7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxTQUFTLE9BQU8sSUFBSTtBQUFBLFFBQ3pCLGNBQWM7QUFBQSxRQUNkLHVCQUF1QjtBQUFBLFFBQ3ZCLE9BQU87QUFBQSxNQUNSLENBQUM7QUFFRCxhQUFPLGdCQUFnQixrQkFBa0I7QUFBQSxRQUN4QyxRQUFRLGVBQWU7QUFBQSxRQUN2QixNQUFNLGVBQWU7QUFBQSxRQUNyQixVQUFVLGVBQWU7QUFBQSxNQUMxQixHQUFHO0FBQUEsUUFDRixRQUFRO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxVQUFJLFdBQVc7QUFDZixZQUFNLFNBQVMsTUFBTSxJQUFJLElBQUksT0FBTyxnQkFBZ0IsaUJBQWlCLFFBQVcsTUFBTSxNQUFNO0FBQUU7QUFBQSxNQUFZLENBQUMsQ0FBQztBQUM1RyxZQUFNLFdBQVcsTUFBTSxJQUFJLHFCQUFxQjtBQUFBLFFBQy9DO0FBQUEsUUFDQTtBQUFBLFVBQ0MsY0FBYztBQUFBLFVBQ2QsdUJBQXVCO0FBQUEsUUFDeEI7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sWUFBWSxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQ3pELGVBQVMsT0FBTyxTQUFTO0FBQ3pCLFlBQU0sYUFBYSxVQUFVLGNBQTJCLGlDQUFpQztBQUN6RixZQUFNLE9BQU8sVUFBVSxjQUEyQiw2QkFBNkI7QUFDL0UsYUFBTyxHQUFHLFVBQVU7QUFDcEIsYUFBTyxHQUFHLElBQUk7QUFFZCxpQkFBVyxjQUFjLElBQUksV0FBVyxXQUFXLFNBQVMsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQzlFLFlBQU0sa0JBQWtCO0FBQ3hCLFdBQUssY0FBYyxJQUFJLFdBQVcsV0FBVyxTQUFTLEVBQUUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUV4RSxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCO0FBQUEsUUFDQSxjQUFjO0FBQUEsTUFDZixHQUFHO0FBQUEsUUFDRixpQkFBaUI7QUFBQSxRQUNqQixjQUFjO0FBQUEsTUFDZixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywrRUFBK0UsTUFBTTtBQUN6RixZQUFNLE9BQU8sV0FBVyx5QkFBeUI7QUFBQSxRQUNoRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixjQUFjO0FBQUEsUUFDZjtBQUFBLE1BQ0QsQ0FBQyxHQUFHLHdCQUF3QixLQUFLLENBQUM7QUFFbEMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixZQUFZLENBQUMsQ0FBRSxLQUFrRDtBQUFBLFFBQ2pFLGlCQUFpQixZQUFZO0FBQUEsUUFDN0IscUJBQXFCLFlBQVk7QUFBQSxRQUNqQyx3QkFBd0Isc0JBQXNCO0FBQUEsTUFDL0MsR0FBRztBQUFBLFFBQ0YsWUFBWTtBQUFBLFFBQ1osaUJBQWlCO0FBQUEsUUFDakIscUJBQXFCO0FBQUEsUUFDckIsd0JBQXdCO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssdUZBQXVGLE1BQU07QUFDakcsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBQ2xDLDBCQUFvQixNQUFNLElBQUk7QUFFOUIsWUFBTSxpQkFBaUIsa0JBQWtCLElBQUk7QUFDN0MsWUFBTSxxQkFBcUIsS0FBSyxRQUFRLGNBQTJCLHFDQUFxQztBQUN4RyxhQUFPLEdBQUcsY0FBYztBQUN4QixhQUFPLEdBQUcsa0JBQWtCO0FBQzVCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsbUJBQW1CLEtBQUssUUFBUSxVQUFVLFNBQVMsOEJBQThCO0FBQUEsUUFDakYsdUJBQXVCLGVBQWUsTUFBTTtBQUFBLFFBQzVDLGtCQUFrQixtQkFBbUIsTUFBTTtBQUFBLE1BQzVDLEdBQUc7QUFBQSxRQUNGLG1CQUFtQjtBQUFBLFFBQ25CLHVCQUF1QjtBQUFBLFFBQ3ZCLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHFGQUFxRixNQUFNO0FBQy9GLDRCQUFzQixxQkFBcUIsS0FBSztBQUNoRCxZQUFNLE9BQU8sV0FBVyx5QkFBeUI7QUFBQSxRQUNoRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixjQUFjO0FBQUEsUUFDZjtBQUFBLE1BQ0QsQ0FBQyxHQUFHLHdCQUF3QixLQUFLLENBQUM7QUFDbEMsWUFBTSw4QkFBOEIsc0JBQXNCO0FBRTFELDRCQUFzQixxQkFBcUIsSUFBSTtBQUMvQyw0QkFBc0IsY0FBYyxPQUFPLG1CQUFtQjtBQUU5RCxZQUFNLGlCQUFpQixrQkFBa0IsSUFBSTtBQUM3QyxZQUFNLHFCQUFxQixLQUFLLFFBQVEsY0FBMkIscUNBQXFDO0FBQ3hHLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEI7QUFBQSxRQUNBLDRCQUE0QixzQkFBc0I7QUFBQSxRQUNsRCxtQkFBbUIsS0FBSyxRQUFRLFVBQVUsU0FBUyw4QkFBOEI7QUFBQSxRQUNqRix1QkFBdUIsZ0JBQWdCLE1BQU07QUFBQSxRQUM3QyxrQkFBa0Isb0JBQW9CLE1BQU07QUFBQSxNQUM3QyxHQUFHO0FBQUEsUUFDRiw2QkFBNkI7QUFBQSxRQUM3Qiw0QkFBNEI7QUFBQSxRQUM1QixtQkFBbUI7QUFBQSxRQUNuQix1QkFBdUI7QUFBQSxRQUN2QixrQkFBa0I7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxnRkFBZ0YsTUFBTTtBQUMxRiw0QkFBc0IscUJBQXFCLEtBQUs7QUFDaEQsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsT0FBTyxJQUFJLE1BQU0sZ0NBQWdDLENBQUMsQ0FBQztBQUUvRSxZQUFNLGlCQUFpQixrQkFBa0IsSUFBSTtBQUM3QyxZQUFNLHFCQUFxQixLQUFLLFFBQVEsY0FBMkIscUNBQXFDO0FBQ3hHLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsWUFBWSxDQUFDLENBQUMsS0FBSyxRQUFRLGNBQWMsa0NBQWtDO0FBQUEsUUFDM0UsdUJBQXVCLGdCQUFnQixNQUFNO0FBQUEsUUFDN0Msa0JBQWtCLG9CQUFvQixNQUFNO0FBQUEsTUFDN0MsR0FBRztBQUFBLFFBQ0YsWUFBWTtBQUFBLFFBQ1osdUJBQXVCO0FBQUEsUUFDdkIsa0JBQWtCO0FBQUEsTUFDbkIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0ZBQW9GLE1BQU07QUFDOUYsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBQ2xDLDBCQUFvQixNQUFNLEtBQUs7QUFFL0IsWUFBTSxpQkFBaUIsa0JBQWtCLElBQUk7QUFDN0MsWUFBTSxxQkFBcUIsS0FBSyxRQUFRLGNBQTJCLHFDQUFxQztBQUN4RyxhQUFPLEdBQUcsY0FBYztBQUN4QixhQUFPLEdBQUcsa0JBQWtCO0FBQzVCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsbUJBQW1CLEtBQUssUUFBUSxVQUFVLFNBQVMsOEJBQThCO0FBQUEsUUFDakYsdUJBQXVCLGVBQWUsTUFBTTtBQUFBLFFBQzVDLGtCQUFrQixtQkFBbUIsTUFBTTtBQUFBLE1BQzVDLEdBQUc7QUFBQSxRQUNGLG1CQUFtQjtBQUFBLFFBQ25CLHVCQUF1QjtBQUFBLFFBQ3ZCLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLCtFQUErRSxNQUFNO0FBQ3pGLFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLGNBQWM7QUFBQSxVQUNkLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUVsQyxXQUFLLGVBQWUseUJBQXlCO0FBQUEsUUFDNUMsWUFBWTtBQUFBLFFBQ1osUUFBUTtBQUFBLFFBQ1IsbUJBQW1CO0FBQUEsUUFDbkIsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLE1BQzFDLENBQUMsQ0FBQztBQUNGLFlBQU0sUUFBUSxtQkFBbUIsSUFBSTtBQUNyQyxXQUFLLGVBQWUseUJBQXlCO0FBQUEsUUFDNUMsWUFBWTtBQUFBLFFBQ1osUUFBUTtBQUFBLFFBQ1IsbUJBQW1CO0FBQUEsUUFDbkIsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLE1BQzFDLENBQUMsQ0FBQztBQUNGLFlBQU0sU0FBUyxtQkFBbUIsSUFBSTtBQUN0QyxXQUFLLGVBQWU7QUFFcEIsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixZQUFZLE9BQU87QUFBQSxRQUNuQixpQkFBaUIsT0FBTztBQUFBLFFBQ3hCLFdBQVcsT0FBTztBQUFBLFFBQ2xCLGVBQWUsT0FBTyxnQkFBZ0I7QUFBQSxRQUN0QyxZQUFZLFFBQVE7QUFBQSxRQUNwQixrQkFBa0IsUUFBUTtBQUFBLFFBQzFCLGdCQUFnQixRQUFRLGdCQUFnQjtBQUFBLFFBQ3hDLGVBQWUsbUJBQW1CLElBQUksR0FBRztBQUFBLFFBQ3pDLG1CQUFtQixtQkFBbUIsSUFBSSxHQUFHO0FBQUEsTUFDOUMsR0FBRztBQUFBLFFBQ0YsWUFBWTtBQUFBLFFBQ1osaUJBQWlCO0FBQUEsUUFDakIsV0FBVztBQUFBLFFBQ1gsZUFBZTtBQUFBLFFBQ2YsWUFBWTtBQUFBLFFBQ1osa0JBQWtCO0FBQUEsUUFDbEIsZ0JBQWdCO0FBQUEsUUFDaEIsZUFBZTtBQUFBLFFBQ2YsbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssK0RBQStELE1BQU07QUFDekUsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBQ2xDLFlBQU0sUUFBUSxnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUMzRixZQUFNLFlBQVk7QUFBQSxRQUNqQixHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFlBQVk7QUFBQSxVQUNaLFFBQVE7QUFBQSxVQUNSLG1CQUFtQjtBQUFBLFFBQ3BCLENBQUM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFdBQUssZUFBZSxTQUFTO0FBQzdCLFlBQU0sWUFBWSxtQkFBbUIsSUFBSTtBQUN6QyxZQUFNLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUN6RSxZQUFNLFlBQVksbUJBQW1CLElBQUk7QUFFekMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixxQkFBcUIsV0FBVztBQUFBLFFBQ2hDLG9CQUFvQixXQUFXO0FBQUEsUUFDL0IscUJBQXFCLFdBQVc7QUFBQSxRQUNoQyxvQkFBb0IsV0FBVztBQUFBLE1BQ2hDLEdBQUc7QUFBQSxRQUNGLHFCQUFxQjtBQUFBLFFBQ3JCLG9CQUFvQjtBQUFBLFFBQ3BCLHFCQUFxQjtBQUFBLFFBQ3JCLG9CQUFvQjtBQUFBLE1BQ3JCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGNBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUNsQyxZQUFNLGFBQWEsZ0JBQWdCLGNBQWMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDckcsWUFBTSxjQUFjLGdCQUFnQixlQUFlLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3ZHLFdBQUssZUFBZTtBQUFBLFFBQ25CLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsWUFBWTtBQUFBLFVBQ1osUUFBUTtBQUFBLFVBQ1IsbUJBQW1CO0FBQUEsUUFDcEIsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUNELFdBQUssZUFBZTtBQUFBLFFBQ25CLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsWUFBWTtBQUFBLFVBQ1osUUFBUTtBQUFBLFVBQ1IsbUJBQW1CO0FBQUEsUUFDcEIsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUVELGtCQUFZLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUUvRSxhQUFPLGdCQUFnQixtQkFBbUIsSUFBSSxLQUFLO0FBQUEsUUFDbEQsa0JBQWtCLG1CQUFtQixJQUFJLEdBQUc7QUFBQSxRQUM1QyxpQkFBaUIsbUJBQW1CLElBQUksR0FBRztBQUFBLE1BQzVDLEdBQUc7QUFBQSxRQUNGLGtCQUFrQjtBQUFBLFFBQ2xCLGlCQUFpQjtBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG9GQUFvRixNQUFNO0FBQzlGLFlBQU0sYUFBOEM7QUFBQSxRQUNuRCxNQUFNO0FBQUEsUUFDTixjQUFjO0FBQUEsUUFDZCxVQUFVO0FBQUEsTUFDWDtBQUNBLFlBQU0sY0FBYyxnQkFBZ0IsZUFBZSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUN2RyxZQUFNLGFBQWE7QUFBQSxRQUNsQixHQUFHLHlCQUF5QixFQUFFLGtCQUFrQixXQUFXLENBQUM7QUFBQSxRQUM1RCxPQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sT0FBTyxXQUFXLFlBQVksd0JBQXdCLEtBQUssQ0FBQztBQUNsRSxZQUFNLGFBQWEsZ0JBQWdCLGNBQWMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDckcsV0FBSyxlQUFlO0FBQUEsUUFDbkIsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixZQUFZO0FBQUEsVUFDWixRQUFRO0FBQUEsVUFDUixtQkFBbUI7QUFBQSxRQUNwQixDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsTUFDUixDQUFDO0FBQ0QsaUJBQVcsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBQzlFLFlBQU0sWUFBWSxtQkFBbUIsSUFBSTtBQUV6QyxpQkFBVyxXQUFXO0FBQ3RCLGtCQUFZLElBQUksRUFBRSxHQUFHLFlBQVksSUFBSSxFQUFFLEdBQUcsTUFBUztBQUNuRCxZQUFNLGtCQUFrQixtQkFBbUIsSUFBSTtBQUMvQyxpQkFBVyxXQUFXO0FBQ3RCLGtCQUFZLElBQUksRUFBRSxHQUFHLFlBQVksSUFBSSxFQUFFLEdBQUcsTUFBUztBQUNuRCxZQUFNLGlCQUFpQixtQkFBbUIsSUFBSTtBQUU5QyxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFdBQVcsV0FBVztBQUFBLFFBQ3RCLGlCQUFpQixpQkFBaUI7QUFBQSxRQUNsQyxnQkFBZ0IsZ0JBQWdCO0FBQUEsTUFDakMsR0FBRztBQUFBLFFBQ0YsV0FBVztBQUFBLFFBQ1gsaUJBQWlCO0FBQUEsUUFDakIsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNEVBQTRFLE1BQU07QUFDdEYsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBRWxDLFlBQU0sZUFBZSx5QkFBeUI7QUFBQSxRQUM3QyxZQUFZO0FBQUEsUUFDWixtQkFBbUI7QUFBQSxRQUNuQixXQUFXLG9CQUFvQixVQUFVO0FBQUEsTUFDMUMsQ0FBQztBQUNELE1BQUMsYUFBK0UsbUJBQW1CO0FBQUEsUUFDbEcsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFVBQ1osVUFBVTtBQUFBLFVBQ1YsWUFBWTtBQUFBLFVBQ1osWUFBWTtBQUFBLFFBQ2I7QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxNQUNYO0FBQ0EsV0FBSyxlQUFlLFlBQVk7QUFFaEMsYUFBTyxZQUFZLG1CQUFtQixJQUFJLEdBQUcsaUJBQWlCLDRCQUE0QjtBQUFBLElBQzNGLENBQUM7QUFFRCxTQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGNBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUNsQyxZQUFNLFFBQVEsZ0JBQWdCLFNBQVMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDM0YsWUFBTSxZQUFZO0FBQUEsUUFDakIsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixZQUFZO0FBQUEsVUFDWixRQUFRO0FBQUEsVUFDUixtQkFBbUI7QUFBQSxRQUNwQixDQUFDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGVBQWUsU0FBUztBQUM3QixZQUFNLGNBQWMsbUJBQW1CLElBQUksR0FBRztBQUM5QyxnQkFBVSxvQkFBb0I7QUFDOUIsWUFBTSxJQUFJLEVBQUUsR0FBRyxNQUFNLElBQUksRUFBRSxHQUFHLE1BQVM7QUFFdkMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0EsUUFBUSxtQkFBbUIsSUFBSSxHQUFHO0FBQUEsTUFDbkMsR0FBRztBQUFBLFFBQ0YsYUFBYTtBQUFBLFFBQ2IsUUFBUTtBQUFBLE1BQ1QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNEVBQTRFLE1BQU07QUFDdEYsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBQ2xDLFdBQUssZUFBZSx5QkFBeUI7QUFBQSxRQUM1QyxZQUFZO0FBQUEsUUFDWixRQUFRO0FBQUEsUUFDUixtQkFBbUI7QUFBQSxRQUNuQixXQUFXLG9CQUFvQixVQUFVO0FBQUEsTUFDMUMsQ0FBQyxDQUFDO0FBQ0YsWUFBTSxRQUFRLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQzNGLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsWUFBWTtBQUFBLFVBQ1osUUFBUTtBQUFBLFVBQ1IsbUJBQW1CO0FBQUEsUUFDcEIsQ0FBQztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsV0FBSyxlQUFlLFNBQVM7QUFDN0IsWUFBTSxZQUFZLG1CQUFtQixJQUFJO0FBQ3pDLFlBQU0sSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRXpFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIscUJBQXFCLFdBQVc7QUFBQSxRQUNoQyxnQkFBZ0IsV0FBVztBQUFBLFFBQzNCLGtCQUFrQixtQkFBbUIsSUFBSSxHQUFHO0FBQUEsUUFDNUMsYUFBYSxtQkFBbUIsSUFBSSxHQUFHO0FBQUEsTUFDeEMsR0FBRztBQUFBLFFBQ0YscUJBQXFCO0FBQUEsUUFDckIsZ0JBQWdCO0FBQUEsUUFDaEIsa0JBQWtCO0FBQUEsUUFDbEIsYUFBYTtBQUFBLE1BQ2QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsscUVBQXFFLE1BQU07QUFDL0UsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUMvQyxZQUFNLHFCQUFxQixLQUFLLFFBQVEsY0FBMkIscUNBQXFDO0FBQ3hHLFlBQU0sbUJBQW1CLEtBQUssUUFBUSxjQUEyQiwyQ0FBMkM7QUFDNUcsWUFBTSxVQUFVLEtBQUssUUFBUSxjQUFjLGlDQUFpQztBQUM1RSxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLGtCQUFrQjtBQUM1QixhQUFPLEdBQUcsZ0JBQWdCO0FBQzFCLGFBQU8sR0FBRyxPQUFPO0FBQ2pCLGFBQU8sR0FBRyxNQUFNO0FBRWhCLFlBQU0saUJBQWlCLGlCQUFpQjtBQUN4QyxZQUFNLDJCQUEyQixRQUFRLFVBQVUsU0FBUyxVQUFVO0FBQ3RFLGFBQU8sTUFBTTtBQUNiLFlBQU0sK0JBQStCLEtBQUssUUFBUSxVQUFVLFNBQVMsbUNBQW1DO0FBQ3hHLFlBQU0sZ0JBQWdCLElBQUksV0FBVyxNQUFNLGVBQWU7QUFDMUQsYUFBTyxlQUFlLGVBQWUsZ0JBQWdCLEVBQUUsT0FBTyxxQkFBcUIsQ0FBQztBQUNwRix5QkFBbUIsY0FBYyxhQUFhO0FBQzlDLFlBQU0sOEJBQThCLEtBQUssUUFBUSxVQUFVLFNBQVMsbUNBQW1DO0FBQ3ZHLHVCQUFpQixjQUFjLElBQUksV0FBVyxZQUFZLDJCQUEyQixpQkFBaUIsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBRXhILGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBLHFCQUFxQixDQUFDLEtBQUssUUFBUSxVQUFVLFNBQVMsbUNBQW1DO0FBQUEsUUFDekYsZUFBZSxpQkFBaUI7QUFBQSxRQUNoQyx5QkFBeUIsUUFBUSxVQUFVLFNBQVMsVUFBVTtBQUFBLE1BQy9ELEdBQUc7QUFBQSxRQUNGLGdCQUFnQjtBQUFBLFFBQ2hCLDBCQUEwQjtBQUFBLFFBQzFCLDhCQUE4QjtBQUFBLFFBQzlCLDZCQUE2QjtBQUFBLFFBQzdCLHFCQUFxQjtBQUFBLFFBQ3JCLGVBQWU7QUFBQSxRQUNmLHlCQUF5QjtBQUFBLE1BQzFCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFlBQU0sT0FBTyxXQUFXLHlCQUF5QixHQUFHLHdCQUF3QixLQUFLLENBQUM7QUFDbEYsWUFBTSxxQkFBcUIsS0FBSyxRQUFRLGNBQTJCLHFDQUFxQztBQUN4RyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLGtCQUFrQjtBQUM1QixhQUFPLEdBQUcsTUFBTTtBQUVoQixhQUFPLE1BQU07QUFDYix5QkFBbUIsZ0JBQWdCLE1BQU0sQ0FBQztBQUMxQyxZQUFNLG1CQUFtQixJQUFJLFdBQVcsTUFBTSxrQkFBa0I7QUFDaEUsYUFBTyxlQUFlLGtCQUFrQixnQkFBZ0IsRUFBRSxPQUFPLHFCQUFxQixDQUFDO0FBQ3ZGLHlCQUFtQixjQUFjLGdCQUFnQjtBQUNqRCxZQUFNLElBQUksUUFBYyxhQUFXLFdBQVcsc0JBQXNCLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFFcEYsYUFBTyxZQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsbUNBQW1DLEdBQUcsS0FBSztBQUFBLElBQy9GLENBQUM7QUFFRCxTQUFLLGlGQUFpRixNQUFNO0FBQzNGLFlBQU0saUJBQWlCLHlCQUF5QixFQUFFLFdBQVcsb0JBQW9CLFVBQVUsVUFBVSxDQUFDO0FBQ3RHLFlBQU0sVUFBVSx3QkFBd0IsSUFBSTtBQUU1QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxhQUFPLEdBQUcsS0FBSyxRQUFRLGNBQWMsOEJBQThCLENBQUM7QUFBQSxJQUNyRSxDQUFDO0FBRUQsU0FBSyxpRkFBaUYsTUFBTTtBQUMzRixZQUFNLGlCQUFpQixtQ0FBbUM7QUFBQSxRQUN6RCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsUUFDZDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFVBQVUsS0FBSyxZQUFZO0FBQUEsUUFDM0IsWUFBWSxDQUFDLENBQUMsS0FBSyxRQUFRLGNBQWMsOEJBQThCO0FBQUEsTUFDeEUsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1YsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssc0ZBQXNGLE1BQU07QUFDaEcsWUFBTSxpQkFBaUIsbUNBQW1DO0FBQUEsUUFDekQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sVUFBVTtBQUFBLFVBQ1YsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixVQUFVLEtBQUssWUFBWTtBQUFBLFFBQzNCLFlBQVksQ0FBQyxDQUFDLEtBQUssUUFBUSxjQUFjLDhCQUE4QjtBQUFBLE1BQ3hFLEdBQUc7QUFBQSxRQUNGLFVBQVU7QUFBQSxRQUNWLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFlBQU0saUJBQWlCLHlCQUF5QjtBQUNoRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsYUFBTyxHQUFHLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCLEdBQUcsZ0NBQWdDO0FBQUEsSUFDM0csQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sb0JBQW9CLE1BQU07QUFDL0IsU0FBSyw4REFBOEQsTUFBTTtBQUN4RSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsUUFDVDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEsNkJBQTZCO0FBQy9DLFlBQU0sZUFBZSx1QkFBdUIsTUFBTTtBQUNsRCxZQUFNLGFBQWEsY0FBYyxlQUFlLE9BQU8sZUFBZTtBQUN0RSxhQUFPLEdBQUcsV0FBVyxTQUFTLGlCQUFpQixHQUFHLGlDQUFpQztBQUNuRixhQUFPLEdBQUcsV0FBVyxTQUFTLHdCQUF3QixHQUFHLGtDQUFrQztBQUFBLElBQzVGLENBQUM7QUFFRCxTQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQTtBQUFBLFFBRWQ7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDZCQUE2QjtBQUMvQyxZQUFNLGVBQWUsdUJBQXVCLE1BQU07QUFDbEQsWUFBTSxhQUFhLGNBQWMsZUFBZSxPQUFPLGVBQWU7QUFDdEUsYUFBTyxHQUFHLFdBQVcsU0FBUyxXQUFXLEdBQUcsMENBQTBDO0FBQUEsSUFDdkYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0seUJBQXlCLE1BQU07QUFRcEMsYUFBUyxhQUFhLE1BQXVDO0FBQzVELFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxhQUFPLEdBQUcsUUFBUSw2QkFBNkI7QUFDL0MsWUFBTSxlQUFlLHVCQUF1QixNQUFNO0FBQ2xELGFBQU8sY0FBYyxlQUFlLE9BQU8sZUFBZTtBQUFBLElBQzNEO0FBRUEsYUFBUyxpQkFBaUIsZ0JBQW9HO0FBQzdILGFBQU8sZUFBZTtBQUFBLElBQ3ZCO0FBRUEsYUFBUyxvQkFBb0IsZ0JBQXFDLE1BQTZDO0FBQzlHLE1BQUMsZUFBeUUsbUJBQW1CO0FBQUEsSUFDOUY7QUFFQSxTQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFlBQU0saUJBQWlCLHlCQUF5QixFQUFFLG1CQUFtQixRQUFRLENBQUM7QUFDOUUsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBQzdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLFVBQUksV0FBVztBQUNmLE1BQUMsS0FBK0Qsc0JBQXNCLElBQUksRUFBRSxTQUFTLE1BQU07QUFBRSxtQkFBVztBQUFBLE1BQU0sRUFBRSxDQUFDO0FBR2pJLFdBQUssZUFBZSx5QkFBeUIsRUFBRSxtQkFBbUIsVUFBVSxXQUFXLG9CQUFvQixVQUFVLFVBQVUsQ0FBQyxDQUFDO0FBRWpJLGFBQU8sWUFBWSxVQUFVLE1BQU0seURBQXlEO0FBQUEsSUFDN0YsQ0FBQztBQUVELFNBQUssb0dBQTBGLE1BQU07QUFDcEcsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0MsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLFFBQ3pDLGtCQUFrQjtBQUFBLFVBQUUsTUFBTTtBQUFBO0FBQUEsUUFBOEM7QUFBQSxNQUN6RSxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBQzdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLGFBQU8sR0FBRyxhQUFhLElBQUksRUFBRSxTQUFTLFdBQVcsR0FBRyx3Q0FBd0M7QUFHNUYsMEJBQW9CLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxhQUFhLHlCQUF5QixDQUFDO0FBQy9GLHVCQUFpQixjQUFjLEVBQUUsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRXBHLGFBQU8sR0FBRyxhQUFhLElBQUksRUFBRSxTQUFTLHdCQUF3QixHQUFHLDBDQUEwQztBQUFBLElBQzVHLENBQUM7QUFFRCxTQUFLLGlHQUF1RixNQUFNO0FBQ2pHLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxRQUN6QyxrQkFBa0I7QUFBQSxVQUFFLE1BQU07QUFBQSxVQUFZLGFBQWE7QUFBQTtBQUFBLFFBQTRDO0FBQUEsTUFDaEcsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUM3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxhQUFPLEdBQUcsYUFBYSxJQUFJLEVBQUUsU0FBUyx3QkFBd0IsR0FBRyw4Q0FBOEM7QUFDL0csYUFBTyxHQUFHLENBQUMsYUFBYSxJQUFJLEVBQUUsU0FBUyxpQkFBaUIsR0FBRyxzQ0FBc0M7QUFJakcsMEJBQW9CLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxhQUFhLDBCQUEwQixXQUFXLGtCQUFrQixDQUFDO0FBQzdILHVCQUFpQixjQUFjLEVBQUUsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRXBHLGFBQU8sR0FBRyxhQUFhLElBQUksRUFBRSxTQUFTLGlCQUFpQixHQUFHLHlDQUF5QztBQUFBLElBQ3BHLENBQUM7QUFFRCxTQUFLLGlGQUF1RSxNQUFNO0FBQ2pGLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxRQUN6QyxrQkFBa0IsRUFBRSxNQUFNLFlBQVksYUFBYSwwQkFBMEIsV0FBVyxrQkFBa0I7QUFBQSxNQUMzRyxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBQzdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLGFBQU8sR0FBRyxhQUFhLElBQUksRUFBRSxTQUFTLGlCQUFpQixHQUFHLHdDQUF3QztBQUlsRywwQkFBb0IsZ0JBQWdCLEVBQUUsTUFBTSxZQUFZLGFBQWEseUJBQXlCLENBQUM7QUFDL0YsdUJBQWlCLGNBQWMsRUFBRSxJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFFcEcsYUFBTyxHQUFHLGFBQWEsSUFBSSxFQUFFLFNBQVMsaUJBQWlCLEdBQUcsd0NBQXdDO0FBQUEsSUFDbkcsQ0FBQztBQUVELFNBQUssaUZBQXVFLE1BQU07QUFDakYsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0MsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLFFBQ3pDLGtCQUFrQixFQUFFLE1BQU0sWUFBWSxhQUFhLDBCQUEwQixXQUFXLGtCQUFrQjtBQUFBLE1BQzNHLENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFDN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsWUFBTSxTQUFTLGFBQWEsSUFBSTtBQUdoQyx1QkFBaUIsY0FBYyxFQUFFLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUVwRyxhQUFPLFlBQVksYUFBYSxJQUFJLEdBQUcsUUFBUSxvREFBb0Q7QUFBQSxJQUNwRyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxvQkFBb0IsTUFBTTtBQUMvQixTQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFlBQU0saUJBQWlCLHlCQUF5QjtBQUNoRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsYUFBTyxZQUFZLEtBQUssWUFBWSxHQUFHLE1BQU0sd0JBQXdCO0FBQUEsSUFDdEUsQ0FBQztBQUVELFNBQUssK0NBQStDLE1BQU07QUFDekQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxXQUFLLGVBQWU7QUFFcEIsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixVQUFVLEtBQUssWUFBWTtBQUFBLFFBQzNCLGtCQUFrQixLQUFLLFFBQVEsVUFBVSxTQUFTLG1DQUFtQztBQUFBLE1BQ3RGLEdBQUc7QUFBQSxRQUNGLFVBQVU7QUFBQSxRQUNWLGtCQUFrQjtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFlBQU0sbUJBQW9EO0FBQUEsUUFDekQsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLFFBQ2QsV0FBVyxLQUFLLElBQUksSUFBSTtBQUFBLE1BQ3pCO0FBQ0EsWUFBTSxPQUFPLFdBQVcseUJBQXlCLEVBQUUsaUJBQWlCLENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBRXRHLFdBQUssZUFBZSxJQUFJO0FBRXhCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxpQkFBaUI7QUFBQSxRQUMzQixhQUFhLE9BQU8saUJBQWlCLGFBQWEsWUFBWSxpQkFBaUIsWUFBWTtBQUFBLFFBQzNGLGlCQUFpQixtQkFBbUIsSUFBSSxHQUFHO0FBQUEsTUFDNUMsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsaUJBQWlCLGlCQUFpQjtBQUFBLE1BQ25DLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFlBQU0sbUJBQW9EO0FBQUEsUUFDekQsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLFFBQ2QsV0FBVyxLQUFLLElBQUksSUFBSTtBQUFBLE1BQ3pCO0FBQ0EsWUFBTSxPQUFPLFdBQVcsbUNBQW1DO0FBQUEsUUFDMUQ7QUFBQSxRQUNBLFlBQVk7QUFBQSxNQUNiLENBQUMsR0FBRyx3QkFBd0IsSUFBSSxDQUFDO0FBRWpDLFdBQUssZUFBZSxJQUFJO0FBRXhCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxpQkFBaUI7QUFBQSxRQUMzQixhQUFhLE9BQU8saUJBQWlCLGFBQWEsWUFBWSxpQkFBaUIsWUFBWTtBQUFBLFFBQzNGLGlCQUFpQixtQkFBbUIsSUFBSSxHQUFHO0FBQUEsTUFDNUMsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1YsYUFBYTtBQUFBLFFBQ2IsaUJBQWlCLGlCQUFpQjtBQUFBLE1BQ25DLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFlBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxRQUF1QyxDQUFDO0FBQ2hGLFVBQUksYUFBYTtBQUNqQixZQUFNLGNBQWMsd0JBQXdCLEtBQUs7QUFDakQsWUFBTSxjQUFjLFlBQVk7QUFDaEMsWUFBTSxVQUF5QztBQUFBLFFBQzlDLEdBQUc7QUFBQSxRQUNILFNBQVM7QUFBQSxVQUNSLEdBQUc7QUFBQSxVQUNILE9BQU87QUFBQSxZQUNOLEdBQUcsWUFBWTtBQUFBLFlBQ2YsYUFBYSxZQUFZO0FBQUEsVUFDMUI7QUFBQSxVQUNBLElBQUksYUFBYTtBQUFFLG1CQUFPO0FBQUEsVUFBWTtBQUFBLFVBQ3RDLElBQUksYUFBYTtBQUFFLG1CQUFPO0FBQUEsVUFBTztBQUFBLFVBQ2pDLFNBQVMsTUFBTTtBQUFBLFVBQUU7QUFBQSxRQUNsQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLG1CQUFvRDtBQUFBLFFBQ3pELE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLGFBQWE7QUFBQSxRQUNiLGNBQWM7QUFBQSxRQUNkLFdBQVcsS0FBSyxJQUFJLElBQUk7QUFBQSxNQUN6QjtBQUNBLFlBQU0sT0FBTyxXQUFXLHlCQUF5QixFQUFFLGlCQUFpQixDQUFDLEdBQUcsT0FBTztBQUUvRSxtQkFBYTtBQUNiLGtCQUFZLEtBQUssRUFBRSxRQUFRLG1CQUFtQixDQUFDO0FBRS9DLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxLQUFLLFlBQVk7QUFBQSxRQUMzQixjQUFjLGlCQUFpQjtBQUFBLFFBQy9CLGFBQWEsT0FBTyxpQkFBaUIsYUFBYSxZQUFZLGlCQUFpQixZQUFZO0FBQUEsTUFDNUYsR0FBRztBQUFBLFFBQ0YsVUFBVTtBQUFBLFFBQ1YsY0FBYztBQUFBLFFBQ2QsYUFBYTtBQUFBLE1BQ2QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssZ0RBQWdELE1BQU07QUFDMUQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsY0FBUSxNQUFNO0FBRWQsV0FBSyxlQUFlO0FBRXBCLFlBQU0sVUFBVSxrQkFBa0IsSUFBSTtBQUN0QyxVQUFJLFNBQVM7QUFDWixlQUFPO0FBQUEsVUFBWSxRQUFRLFVBQVUsU0FBUyx5QkFBeUI7QUFBQSxVQUFHO0FBQUEsVUFDekU7QUFBQSxRQUF3RDtBQUFBLE1BQzFEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxZQUFNLGlCQUFpQix5QkFBeUI7QUFDaEQsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxjQUFRLE1BQU07QUFHZCxhQUFPLFlBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRyxLQUFLO0FBRXhGLFdBQUssZUFBZTtBQUdwQixhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRywwQ0FBMEM7QUFBQSxJQUNySCxDQUFDO0FBRUQsU0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUE7QUFBQSxRQUVQO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxhQUFPLEdBQUcsUUFBUSw2QkFBNkI7QUFDL0MsWUFBTSxjQUFjLHVCQUF1QixNQUFNO0FBQ2pELFlBQU0sYUFBYSxhQUFhLGVBQWUsT0FBTyxlQUFlO0FBQ3JFLGFBQU8sR0FBRyxXQUFXLFNBQVMsa0JBQWtCLEdBQUcsd0RBQXdEO0FBRTNHLFdBQUssZUFBZTtBQUdwQixZQUFNLGFBQWEsdUJBQXVCLE1BQU07QUFDaEQsWUFBTSxZQUFZLFlBQVksZUFBZSxPQUFPLGVBQWU7QUFDbkUsYUFBTyxHQUFHLFVBQVUsU0FBUyxjQUFjLEdBQUcsbURBQW1EO0FBQ2pHLGFBQU8sR0FBRyxDQUFDLFVBQVUsU0FBUyxrQkFBa0IsR0FBRyxnREFBZ0Q7QUFBQSxJQUNwRyxDQUFDO0FBRUQsU0FBSywyREFBMkQsTUFBTTtBQUNyRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxXQUFLLGVBQWU7QUFHcEIsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDZCQUE2QjtBQUMvQyxZQUFNLFFBQVEsdUJBQXVCLE1BQU07QUFDM0MsWUFBTSxPQUFPLE9BQU8sZUFBZSxPQUFPLGVBQWU7QUFDekQsYUFBTyxHQUFHLEtBQUssU0FBUyx3QkFBd0IsR0FBRyx1REFBdUQ7QUFBQSxJQUMzRyxDQUFDO0FBRUQsU0FBSyxvREFBb0QsTUFBTTtBQUU5RCxZQUFNLGdCQUFnQixxQkFBcUIsSUFBSSxxQkFBcUI7QUFDcEUsb0JBQWMscUJBQXFCLGdDQUFnQyxvQkFBb0IsSUFBSTtBQUUzRixZQUFNLGlCQUFpQix5QkFBeUI7QUFDaEQsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRS9DLFdBQUssY0FBYztBQUduQixZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEsNkJBQTZCO0FBQy9DLFlBQU0sY0FBYyxzQkFBc0IsTUFBTTtBQUNoRCxhQUFPLEdBQUcsYUFBYSxVQUFVLFNBQVMsZUFBZSxHQUFHLDJDQUEyQztBQUFBLElBQ3hHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHlCQUF5QixNQUFNO0FBQ3BDLFNBQUssNENBQTRDLE1BQU07QUFDdEQsWUFBTSx1QkFBdUIsbUNBQW1DO0FBQUEsUUFDL0Qsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFVBQ1IsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLElBQUk7QUFFNUMsWUFBTSxPQUFPLFdBQVcsc0JBQXNCLE9BQU87QUFHckQsYUFBTyxZQUFZLEtBQUssWUFBWSxHQUFHLE9BQU8sMENBQTBDO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxZQUFNLGlCQUFpQix5QkFBeUIsRUFBRSxzQkFBc0IsZUFBZSxDQUFDO0FBQ3hGLFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxZQUFNLGtCQUFrQix5QkFBeUI7QUFBQSxRQUNoRCxRQUFRO0FBQUEsUUFDUixzQkFBc0I7QUFBQSxNQUN2QixDQUFDO0FBRUQsWUFBTSxTQUFTLEtBQUssZUFBZSxpQkFBaUIsQ0FBQyxHQUFHLFFBQVEsT0FBTztBQUN2RSxhQUFPLFlBQVksUUFBUSxLQUFLO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssK0VBQStFLE1BQU07QUFDekYsWUFBTSxpQkFBaUIseUJBQXlCLEVBQUUsc0JBQXNCLGVBQWUsQ0FBQztBQUN4RixZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsWUFBTSxrQkFBa0IseUJBQXlCO0FBQUEsUUFDaEQsUUFBUTtBQUFBLFFBQ1Isc0JBQXNCO0FBQUEsTUFDdkIsQ0FBQztBQUVELFlBQU0sU0FBUyxLQUFLLGVBQWUsaUJBQWlCLENBQUMsR0FBRyxRQUFRLE9BQU87QUFDdkUsYUFBTyxZQUFZLFFBQVEsT0FBTyxzRUFBc0U7QUFBQSxJQUN6RyxDQUFDO0FBRUQsU0FBSyw0RUFBNEUsTUFBTTtBQUN0RixZQUFNLG1CQUFtQjtBQUN6QixZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxRQUFRLGdCQUFnQjtBQUFBLFFBQ3hCLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLFNBQVMsZUFBZSxVQUFVO0FBRTFFLFlBQU0sa0JBQWtCLHlCQUF5QjtBQUFBLFFBQ2hELFFBQVEsZ0JBQWdCO0FBQUEsUUFDeEIsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUVELFlBQU0sU0FBUyxLQUFLLGVBQWUsaUJBQWlCLENBQUMsR0FBRyxRQUFRLE9BQU87QUFDdkUsYUFBTyxZQUFZLFFBQVEsTUFBTSxnRUFBZ0U7QUFBQSxJQUNsRyxDQUFDO0FBRUQsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxZQUFNLGlCQUFpQix5QkFBeUIsRUFBRSxZQUFZLGVBQWUsQ0FBQztBQUM5RSxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFFL0MsWUFBTSxrQkFBd0M7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTixTQUFTLEVBQUUsT0FBTyxvR0FBb0c7QUFBQSxNQUN2SDtBQUVBLFlBQU0sU0FBUyxLQUFLLGVBQWUsaUJBQWlCLENBQUMsR0FBRyxRQUFRLE9BQU87QUFDdkUsYUFBTyxZQUFZLFFBQVEsS0FBSztBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUssK0NBQStDLE1BQU07QUFDekQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0MsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLE1BQzFDLENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDZCQUE2QjtBQUMvQyxZQUFNLGNBQWMsc0JBQXNCLE1BQU07QUFDaEQsYUFBTyxHQUFHLGFBQWEsVUFBVSxTQUFTLHVCQUF1QixHQUFHLGdEQUFnRDtBQUFBLElBQ3JILENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG1CQUFtQixNQUFNO0FBQzlCLFNBQUssa0RBQWtELE1BQU07QUFDNUQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsQ0FBQztBQUd4RSxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEsMkJBQTJCO0FBQzdDLGFBQU8sTUFBTTtBQUdiLGFBQU87QUFBQSxRQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFBRztBQUFBLFFBQ2xGO0FBQUEsTUFBMEM7QUFHM0MsYUFBTyxNQUFNO0FBR2IsYUFBTztBQUFBLFFBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUN0RTtBQUFBLE1BQWlEO0FBQUEsSUFDbkQsQ0FBQztBQUVELFNBQUssOENBQThDLE1BQU07QUFDeEQsWUFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEscUJBQXFCO0FBQ3ZDLGFBQU8sWUFBWSxPQUFPLGFBQWEsZUFBZSxHQUFHLFNBQVMsa0RBQWtEO0FBR3BILGFBQU8sTUFBTTtBQUViLGFBQU8sWUFBWSxPQUFPLGFBQWEsZUFBZSxHQUFHLFFBQVEsZ0RBQWdEO0FBQUEsSUFDbEgsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sa0JBQWtCLE1BQU07QUFDN0IsU0FBSywrRUFBK0UsTUFBTTtBQUN6RixZQUFNLHVCQUF1QixtQ0FBbUM7QUFBQSxRQUMvRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsVUFDUixRQUFRO0FBQUEsUUFDVDtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsSUFBSTtBQUU1QyxZQUFNLE9BQU8sV0FBVyxzQkFBc0IsT0FBTztBQUlyRCxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRywrQkFBK0I7QUFHekcsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDRCQUE0QjtBQUM5QyxhQUFPLE1BQU07QUFHYixhQUFPLFlBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRyxPQUFPLG9CQUFvQjtBQUc5RyxZQUFNLGlCQUFpQixLQUFLLFFBQVEsY0FBYyx5QkFBeUI7QUFDM0UsYUFBTyxHQUFHLGdCQUFnQiwyQ0FBMkM7QUFHckUsWUFBTSxXQUFXLGVBQWUsaUJBQWlCLHdCQUF3QjtBQUN6RSxhQUFPLEdBQUcsU0FBUyxVQUFVLEdBQUcscURBQXFEO0FBQUEsSUFDdEYsQ0FBQztBQUVELFNBQUssaUZBQWlGLE1BQU07QUFDM0YsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxRQUNBLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxNQUMxQyxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLG1DQUFtQztBQUc3RyxZQUFNLGlCQUFpQixLQUFLLFFBQVEsY0FBYyx5QkFBeUI7QUFDM0UsYUFBTyxZQUFZLGdCQUFnQixNQUFNLG9FQUFvRTtBQUFBLElBQzlHLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxRQUNUO0FBQUEsUUFDQSxXQUFXLG9CQUFvQixVQUFVO0FBQUEsTUFDMUMsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRywrQkFBK0I7QUFDekcsVUFBSSxpQkFBaUIsS0FBSyxRQUFRLGNBQWMseUJBQXlCO0FBQ3pFLGFBQU8sWUFBWSxnQkFBZ0IsTUFBTSxvQ0FBb0M7QUFHN0UsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDRCQUE0QjtBQUM5QyxhQUFPLE1BQU07QUFHYix1QkFBaUIsS0FBSyxRQUFRLGNBQWMseUJBQXlCO0FBQ3JFLGFBQU8sR0FBRyxnQkFBZ0IsbUNBQW1DO0FBRzdELFlBQU0sZ0JBQWdCLGVBQWUsY0FBYyx3QkFBd0I7QUFDM0UsYUFBTyxHQUFHLGVBQWUsK0NBQStDO0FBQUEsSUFDekUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0saUNBQWlDLE1BQU07QUFDNUMsU0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxZQUFNLGFBQWEseUJBQXlCO0FBQUEsUUFDM0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLE9BQU8sV0FBVyxZQUFZLHdCQUF3QixLQUFLLENBQUM7QUFDbEUsNEJBQXNCO0FBRXRCLFdBQUssMkJBQTJCO0FBQ2hDLGVBQVMsUUFBUSxHQUFHLFFBQVEsS0FBSyxTQUFTO0FBQ3pDLGNBQU0sT0FBTyx5QkFBeUI7QUFBQSxVQUNyQyxRQUFRO0FBQUEsVUFDUixZQUFZLFNBQVMsS0FBSztBQUFBLFVBQzFCLHNCQUFzQixXQUFXO0FBQUEsVUFDakMsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLFVBQ3pDLG1CQUFtQixrQkFBa0IsS0FBSztBQUFBLFFBQzNDLENBQUM7QUFDRCxhQUFLLHFCQUFxQixNQUFNLEtBQUs7QUFBQSxNQUN0QztBQUVBLFlBQU0scUJBQXFCO0FBQzNCLFdBQUsseUJBQXlCO0FBQzlCLFlBQU0sb0JBQW9CO0FBQzFCLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxhQUFPLEdBQUcsTUFBTTtBQUNoQixZQUFNLGtCQUFrQix1QkFBdUIsTUFBTSxHQUFHLGVBQWUsT0FBTyxlQUFlO0FBQzdGLFlBQU0sb0JBQXFCLEtBQXdFO0FBQ25HLFlBQU0sMkJBQTJCLGtCQUFrQixXQUFXO0FBRTlELFlBQU0sV0FBVyx5QkFBeUI7QUFBQSxRQUN6QyxRQUFRO0FBQUEsUUFDUixZQUFZO0FBQUEsUUFDWixzQkFBc0IsV0FBVztBQUFBLFFBQ2pDLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxRQUN6QyxtQkFBbUI7QUFBQSxNQUNwQixDQUFDO0FBQ0QsV0FBSyxxQkFBcUIsVUFBVSxHQUFHO0FBQ3ZDLFlBQU0scUJBQXFCLHVCQUF1QixNQUFNLEdBQUcsZUFBZSxPQUFPLGVBQWU7QUFFaEcsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxzQkFBc0I7QUFBQSxRQUN0QixtQ0FBbUMsZ0JBQWdCLFNBQVMsb0JBQW9CO0FBQUEsUUFDaEYsc0NBQXNDLG1CQUFtQixTQUFTLHNCQUFzQjtBQUFBLE1BQ3pGLEdBQUc7QUFBQSxRQUNGLG9CQUFvQjtBQUFBLFFBQ3BCLG1CQUFtQjtBQUFBLFFBQ25CLDBCQUEwQjtBQUFBLFFBQzFCLHNCQUFzQjtBQUFBLFFBQ3RCLG1DQUFtQztBQUFBLFFBQ25DLHNDQUFzQztBQUFBLE1BQ3ZDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELFlBQU0sYUFBYSx5QkFBeUI7QUFBQSxRQUMzQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sT0FBTyxXQUFXLFlBQVksd0JBQXdCLEtBQUssQ0FBQztBQUNsRSxZQUFNLFdBQTBCO0FBQUEsUUFDL0IsTUFBTTtBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsZUFBZTtBQUFBLFFBQ2YsaUJBQWlCO0FBQUEsUUFDakIsc0JBQXNCLFdBQVc7QUFBQSxNQUNsQztBQUNBLDRCQUFzQjtBQUV0QixXQUFLLDJCQUEyQjtBQUNoQyxlQUFTLFFBQVEsR0FBRyxRQUFRLElBQUksU0FBUztBQUN4QyxhQUFLLGVBQWUsT0FBTyxFQUFFLFNBQVMsV0FBVyxTQUFTLGNBQWMsS0FBSyxFQUFFLElBQUksUUFBUTtBQUFBLE1BQzVGO0FBQ0EsWUFBTSxxQkFBcUI7QUFDM0IsV0FBSyx5QkFBeUI7QUFFOUIsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0EsbUJBQW1CO0FBQUEsTUFDcEIsR0FBRztBQUFBLFFBQ0Ysb0JBQW9CO0FBQUEsUUFDcEIsbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0VBQW9FLE1BQU07QUFDOUUsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsWUFBTSxZQUFZLHlCQUF5QjtBQUFBLFFBQzFDLFFBQVE7QUFBQSxRQUNSLHNCQUFzQixlQUFlO0FBQUEsUUFDckMsV0FBVyxvQkFBb0IsVUFBVTtBQUFBLFFBQ3pDLG1CQUFtQjtBQUFBLE1BQ3BCLENBQUM7QUFFRCxXQUFLLHFCQUFxQixXQUFXLENBQUM7QUFHdEMsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLDZCQUE2QjtBQUMvQyxZQUFNLGVBQWUsdUJBQXVCLE1BQU07QUFDbEQsWUFBTSxhQUFhLGNBQWMsZUFBZSxPQUFPLGVBQWU7QUFDdEUsYUFBTyxHQUFHLFdBQVcsU0FBUyxtQkFBbUIsR0FBRyxtREFBbUQ7QUFBQSxJQUN4RyxDQUFDO0FBRUQsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFlBQVkseUJBQXlCO0FBQUEsUUFDMUMsUUFBUTtBQUFBLFFBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUNyQyxXQUFXLG9CQUFvQixVQUFVO0FBQUEsUUFDekMsbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQztBQUNELFdBQUsscUJBQXFCLFdBQVcsQ0FBQztBQUd0QyxZQUFNLGFBQWEseUJBQXlCO0FBQUEsUUFDM0MsUUFBUTtBQUFBLFFBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUNyQyxXQUFXLG9CQUFvQixVQUFVO0FBQUEsUUFDekMsbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQztBQUNELFdBQUsscUJBQXFCLFlBQVksQ0FBQztBQUV2QyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsYUFBTyxHQUFHLFFBQVEsNkJBQTZCO0FBQy9DLFlBQU0sZUFBZSx1QkFBdUIsTUFBTTtBQUNsRCxZQUFNLGFBQWEsY0FBYyxlQUFlLE9BQU8sZUFBZTtBQUV0RSxhQUFPLEdBQUcsV0FBVyxTQUFTLHdCQUF3QixHQUFHLDBDQUEwQztBQUFBLElBQ3BHLENBQUM7QUFFRCxTQUFLLGdFQUFnRSxNQUFNO0FBQzFFLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLFlBQU0saUJBQWlCLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3BHLFlBQU0sWUFBaUM7QUFBQSxRQUN0QyxHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFFBQVE7QUFBQSxVQUNSLHNCQUFzQixlQUFlO0FBQUEsUUFDdEMsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLFFBQ1AsbUJBQW1CO0FBQUEsTUFDcEI7QUFDQSxXQUFLLGVBQWUsU0FBUztBQUc3QixZQUFNLGtCQUFrQixnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUNyRyxZQUFNLGFBQWtDO0FBQUEsUUFDdkMsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLE1BQ3BCO0FBQ0EsV0FBSyxlQUFlLFVBQVU7QUFHOUIsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLHFCQUFxQjtBQUN2QyxZQUFNLGVBQWUsdUJBQXVCLE1BQU07QUFDbEQsVUFBSSxhQUFhLGNBQWMsZUFBZSxRQUFRLGVBQWU7QUFDckUsYUFBTyxHQUFHLFdBQVcsU0FBUyx3QkFBd0IsR0FBRywrQkFBK0I7QUFHeEYscUJBQWUsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBR2xGLG1CQUFhLGNBQWMsZUFBZSxRQUFRLGVBQWU7QUFDakUsYUFBTyxHQUFHLFdBQVcsU0FBUyx3QkFBd0IsR0FBRywyREFBMkQ7QUFBQSxJQUNySCxDQUFDO0FBRUQsU0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFlBQVksZ0JBQWdCLFNBQVMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDL0YsWUFBTSxZQUFpQztBQUFBLFFBQ3RDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUNBLFdBQUssZUFBZSxTQUFTO0FBRzdCLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxhQUFPLEdBQUcsUUFBUSxxQkFBcUI7QUFDdkMsWUFBTSxlQUFlLHVCQUF1QixNQUFNO0FBQ2xELFVBQUksYUFBYSxjQUFjLGVBQWUsUUFBUSxlQUFlO0FBQ3JFLGFBQU8sR0FBRyxXQUFXLFNBQVMsaUJBQWlCLEdBQUcsaURBQWlEO0FBR25HLGdCQUFVLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUc3RSxtQkFBYSxjQUFjLGVBQWUsUUFBUSxlQUFlO0FBQ2pFLGFBQU87QUFBQSxRQUFHLFdBQVcsU0FBUyxpQkFBaUI7QUFBQSxRQUM5QztBQUFBLE1BQTREO0FBQUEsSUFDOUQsQ0FBQztBQUVELFNBQUssa0VBQWtFLE1BQU07QUFDNUUsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsWUFBTSxpQkFBaUIsZ0JBQWdCLFNBQVMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDcEcsWUFBTSxZQUFpQztBQUFBLFFBQ3RDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUNBLFdBQUssZUFBZSxTQUFTO0FBRzdCLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxhQUFPLEdBQUcsUUFBUSxxQkFBcUI7QUFDdkMsWUFBTSxlQUFlLHVCQUF1QixNQUFNO0FBQ2xELFVBQUksYUFBYSxjQUFjLGVBQWUsUUFBUSxlQUFlO0FBQ3JFLGFBQU8sR0FBRyxXQUFXLFNBQVMsa0JBQWtCLEdBQUcsOEJBQThCO0FBR2pGLFlBQU0sa0JBQWtCLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxDQUFDO0FBQ3JHLFlBQU0sYUFBa0M7QUFBQSxRQUN2QyxHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFFBQVE7QUFBQSxVQUNSLHNCQUFzQixlQUFlO0FBQUEsUUFDdEMsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLFFBQ1AsbUJBQW1CO0FBQUEsTUFDcEI7QUFDQSxXQUFLLGVBQWUsVUFBVTtBQUc5QixtQkFBYSxjQUFjLGVBQWUsUUFBUSxlQUFlO0FBQ2pFLGFBQU8sR0FBRyxXQUFXLFNBQVMsd0JBQXdCLEdBQUcsK0JBQStCO0FBR3hGLHNCQUFnQixJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFHbkYsbUJBQWEsY0FBYyxlQUFlLFFBQVEsZUFBZTtBQUNqRSxhQUFPO0FBQUEsUUFBRyxXQUFXLFNBQVMsd0JBQXdCO0FBQUEsUUFDckQ7QUFBQSxNQUE0RDtBQUFBLElBQzlELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUsseURBQXlELE1BQU07QUFDbkUsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msc0JBQXNCO0FBQUEsUUFDdEIsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGNBQVEsTUFBTTtBQUNkLGFBQU8sWUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLE9BQU8sb0JBQW9CO0FBRzlHLFlBQU0sa0JBQXdDO0FBQUEsUUFDN0MsTUFBTTtBQUFBLFFBQ04sU0FBUyxFQUFFLE9BQU8saUJBQWlCO0FBQUEsTUFDcEM7QUFHQSxZQUFNLGtCQUFrQixXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQy9ELHNCQUFnQixZQUFZO0FBQzVCLHNCQUFnQixjQUFjO0FBRTlCLFVBQUksbUJBQW1CO0FBQ3ZCLFlBQU0saUJBQWlCLEVBQUUsU0FBUyxNQUFNO0FBQUU7QUFBQSxNQUFvQixFQUFFO0FBR2hFLFdBQUs7QUFBQSxRQUNKLE9BQU8sRUFBRSxTQUFTLGlCQUFpQixZQUFZLGVBQWU7QUFBQSxRQUM5RDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUdBLFlBQU0sVUFBVSxrQkFBa0IsSUFBSTtBQUN0QyxhQUFPLEdBQUcsU0FBUyxzQkFBc0I7QUFDekMsWUFBTSxrQkFBa0IsUUFBUSxjQUFjLHdCQUF3QjtBQUN0RSxhQUFPLEdBQUcsaUJBQWlCLG1EQUFtRDtBQUM5RSxhQUFPLFlBQVksZ0JBQWdCLGFBQWEsV0FBVyw2QkFBNkI7QUFBQSxJQUN6RixDQUFDO0FBRUQsU0FBSywwREFBMEQsTUFBTTtBQUNwRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxzQkFBc0I7QUFBQSxRQUN0QixrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRyx3QkFBd0I7QUFFbEcsWUFBTSxrQkFBd0M7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTixTQUFTLEVBQUUsT0FBTyxnQkFBZ0I7QUFBQSxNQUNuQztBQUVBLFVBQUksZ0JBQWdCO0FBQ3BCLFlBQU0sa0JBQWtCLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDL0Qsc0JBQWdCLFlBQVk7QUFDNUIsc0JBQWdCLGNBQWM7QUFFOUIsWUFBTSxpQkFBaUIsRUFBRSxTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFHNUMsV0FBSztBQUFBLFFBQ0osTUFBTTtBQUNMLDBCQUFnQjtBQUNoQixpQkFBTyxFQUFFLFNBQVMsaUJBQWlCLFlBQVksZUFBZTtBQUFBLFFBQy9EO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUdBLGFBQU8sWUFBWSxlQUFlLE9BQU8sNkNBQTZDO0FBQUEsSUFDdkYsQ0FBQztBQUVELFNBQUssZ0VBQWdFLE1BQU07QUFDMUUsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msc0JBQXNCO0FBQUEsUUFDdEIsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGNBQVEsTUFBTTtBQUVkLFlBQU0sa0JBQXdDO0FBQUEsUUFDN0MsTUFBTTtBQUFBLFFBQ04sU0FBUyxFQUFFLE9BQU8saUJBQWlCO0FBQUEsTUFDcEM7QUFFQSxZQUFNLG9CQUFvQjtBQUcxQixZQUFNLFlBQVksV0FBVyxTQUFTLGNBQWMsS0FBSztBQUN6RCxnQkFBVSxZQUFZO0FBQ3RCLGdCQUFVLGNBQWM7QUFDeEIsV0FBSztBQUFBLFFBQ0osT0FBTyxFQUFFLFNBQVMsV0FBVyxZQUFZLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFLEVBQUU7QUFBQSxRQUNoRTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUdBLFlBQU0sYUFBYSxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQzFELGlCQUFXLFlBQVk7QUFDdkIsaUJBQVcsY0FBYztBQUN6QixXQUFLO0FBQUEsUUFDSixPQUFPLEVBQUUsU0FBUyxZQUFZLFlBQVksRUFBRSxTQUFTLE1BQU07QUFBQSxRQUFFLEVBQUUsRUFBRTtBQUFBLFFBQ2pFO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBR0EsWUFBTSxVQUFVLGtCQUFrQixJQUFJO0FBQ3RDLGFBQU8sR0FBRyxTQUFTLHNCQUFzQjtBQUN6QyxZQUFNLGFBQWEsUUFBUSxpQkFBaUIsYUFBYTtBQUN6RCxZQUFNLGNBQWMsUUFBUSxpQkFBaUIsY0FBYztBQUUzRCxhQUFPLFlBQVksV0FBVyxRQUFRLEdBQUcseUJBQXlCO0FBQ2xFLGFBQU8sWUFBWSxZQUFZLFFBQVEsR0FBRywwQkFBMEI7QUFBQSxJQUNyRSxDQUFDO0FBRUQsU0FBSyxrREFBa0QsTUFBTTtBQUM1RCxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxzQkFBc0I7QUFBQSxRQUN0QixrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLFNBQVMsa0JBQWtCLElBQUk7QUFDckMsY0FBUSxNQUFNO0FBR2QsWUFBTSxZQUFZLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDekQsZ0JBQVUsWUFBWTtBQUN0QixnQkFBVSxjQUFjO0FBQ3hCLFdBQUs7QUFBQSxRQUNKLE9BQU8sRUFBRSxTQUFTLFdBQVcsWUFBWSxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQUUsRUFBRSxFQUFFO0FBQUEsUUFDaEU7QUFBQSxRQUNBLEVBQUUsTUFBTSxtQkFBbUIsU0FBUyxFQUFFLE9BQU8sUUFBUSxFQUFFO0FBQUEsUUFDdkQ7QUFBQSxNQUNEO0FBR0EsWUFBTSxhQUFhLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDMUQsaUJBQVcsWUFBWTtBQUN2QixpQkFBVyxjQUFjO0FBQ3pCLFdBQUs7QUFBQSxRQUNKLE9BQU8sRUFBRSxTQUFTLFlBQVksWUFBWSxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQUUsRUFBRSxFQUFFO0FBQUEsUUFDakU7QUFBQSxRQUNBLEVBQUUsTUFBTSxtQkFBbUIsU0FBUyxFQUFFLE9BQU8sU0FBUyxFQUFFO0FBQUEsUUFDeEQ7QUFBQSxNQUNEO0FBR0EsWUFBTSxVQUFVLGtCQUFrQixJQUFJO0FBQ3RDLGFBQU8sR0FBRyxTQUFTLHNCQUFzQjtBQUN6QyxhQUFPLEdBQUcsUUFBUSxjQUFjLFdBQVcsR0FBRyx5QkFBeUI7QUFDdkUsYUFBTyxHQUFHLFFBQVEsY0FBYyxXQUFXLEdBQUcsMEJBQTBCO0FBQUEsSUFDekUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sK0JBQStCLE1BQU07QUFDMUMsU0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRyx3QkFBd0I7QUFHbEcsWUFBTSxrQkFBa0IsZ0JBQWdCLFNBQVMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDckcsWUFBTSxZQUFpQztBQUFBLFFBQ3RDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUdBLFdBQUssZUFBZSxTQUFTO0FBRzdCLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLGtEQUFrRDtBQUc1SCxzQkFBZ0IsSUFBSSxZQUFZLG9CQUFvQixVQUFVLHNCQUFzQixHQUFHLE1BQVM7QUFHaEcsYUFBTztBQUFBLFFBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUFHO0FBQUEsUUFDbEY7QUFBQSxNQUFpRDtBQUFBLElBQ25ELENBQUM7QUFFRCxTQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFlBQU0sT0FBTyxXQUFXLHlCQUF5QjtBQUFBLFFBQ2hELGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLGNBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUNsQyxZQUFNLFFBQVEsZ0JBQWdCLFNBQVMsWUFBWSxvQkFBb0IsVUFBVSxTQUFTLENBQUM7QUFDM0YsWUFBTSxZQUFZLEVBQUUsR0FBRyx5QkFBeUIsRUFBRSxRQUFRLFFBQVEsQ0FBQyxHQUFHLE1BQU07QUFDNUUsV0FBSyxtQkFBbUIsTUFBTTtBQUFBLE1BQUUsR0FBRyxNQUFNO0FBQUEsTUFBRSxHQUFHLENBQUMsT0FBTyxpQkFBaUIsYUFBYSxTQUFTLG9CQUFvQixVQUFVLHNCQUFzQjtBQUNqSixXQUFLLGVBQWUsU0FBUztBQUU3QixZQUFNLElBQUksWUFBWSxvQkFBb0IsVUFBVSxzQkFBc0IsR0FBRyxNQUFTO0FBQ3RGLFlBQU0sVUFBVSxtQkFBbUIsSUFBSSxHQUFHO0FBQzFDLFlBQU0sSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRXpFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEI7QUFBQSxRQUNBLG1CQUFtQixtQkFBbUIsSUFBSSxHQUFHO0FBQUEsTUFDOUMsR0FBRztBQUFBLFFBQ0YsU0FBUztBQUFBLFFBQ1QsbUJBQW1CO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsseUVBQXlFLE1BQU07QUFDbkYsWUFBTSxPQUFPLFdBQVcseUJBQXlCO0FBQUEsUUFDaEQsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsY0FBYztBQUFBLFFBQ2Y7QUFBQSxNQUNELENBQUMsR0FBRyx3QkFBd0IsS0FBSyxDQUFDO0FBRWxDLFdBQUssc0JBQXNCLElBQUk7QUFDL0IsWUFBTSxTQUFTLG1CQUFtQixJQUFJLEdBQUc7QUFDekMsV0FBSyxzQkFBc0IsS0FBSztBQUVoQyxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCO0FBQUEsUUFDQSxVQUFVLG1CQUFtQixJQUFJLEdBQUc7QUFBQSxNQUNyQyxHQUFHO0FBQUEsUUFDRixRQUFRO0FBQUEsUUFDUixVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywrREFBK0QsTUFBTTtBQUN6RSxZQUFNLG1CQUFvRDtBQUFBLFFBQ3pELE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLGNBQWM7QUFBQSxRQUNkLFVBQVU7QUFBQSxRQUNWLFdBQVc7QUFBQSxNQUNaO0FBQ0EsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0M7QUFBQSxRQUNBLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxNQUMxQyxDQUFDO0FBQ0QsWUFBTSxRQUFRLGdCQUFnQixTQUFTLGVBQWUsTUFBTSxJQUFJLENBQUM7QUFDakUsTUFBQyxlQUFzRCxRQUFRO0FBQy9ELFlBQU0sT0FBTyxXQUFXLGdCQUFnQix3QkFBd0IsS0FBSyxDQUFDO0FBRXRFLHVCQUFpQixXQUFXO0FBQzVCLHVCQUFpQixXQUFXO0FBQzVCLFlBQU0sSUFBSSxFQUFFLEdBQUcsTUFBTSxJQUFJLEVBQUUsR0FBRyxNQUFTO0FBRXZDLGFBQU8sZ0JBQWdCLG1CQUFtQixJQUFJLEdBQUc7QUFBQSxRQUNoRCxjQUFjO0FBQUEsUUFDZCx1QkFBdUI7QUFBQSxRQUN2QixPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxRQUNuQixvQkFBb0I7QUFBQSxRQUNwQixXQUFXO0FBQUEsUUFDWCxVQUFVO0FBQUEsUUFDVixVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywyRUFBMkUsWUFBWTtBQUMzRixZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUUvQyxZQUFNLGtCQUFrQixnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUNyRyxZQUFNLFlBQWlDO0FBQUEsUUFDdEMsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLE1BQ3BCO0FBRUEsV0FBSyxlQUFlLFNBQVM7QUFDN0IsWUFBTSxnQkFBZ0IsTUFBTyxnQkFBeUUsa0JBQWtCLEVBQUU7QUFDMUgsYUFBTyxZQUFZLGNBQWMsR0FBRyxHQUFHLGdEQUFnRDtBQUd2RixzQkFBZ0IsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBQ25GLFlBQU0sUUFBUSxRQUFRO0FBRXRCLGFBQU8sWUFBWSxjQUFjLEdBQUcsR0FBRyw0RUFBNEU7QUFBQSxJQUNwSCxDQUFDO0FBRUQsU0FBSyx1REFBdUQsTUFBTTtBQUNqRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLGtCQUFrQixnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLHNCQUFzQixDQUFDO0FBQ2xILFlBQU0sWUFBaUM7QUFBQSxRQUN0QyxHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFFBQVE7QUFBQSxVQUNSLHNCQUFzQixlQUFlO0FBQUEsUUFDdEMsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLFFBQ1AsbUJBQW1CO0FBQUEsTUFDcEI7QUFHQSxXQUFLLGVBQWUsU0FBUztBQUc3QixhQUFPO0FBQUEsUUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQUc7QUFBQSxRQUNsRjtBQUFBLE1BQWtEO0FBR25ELHNCQUFnQixJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFHbkYsYUFBTztBQUFBLFFBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUN0RTtBQUFBLE1BQXNEO0FBQUEsSUFDeEQsQ0FBQztBQUVELFNBQUssc0RBQXNELE1BQU07QUFDaEUsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0Msa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLEtBQUs7QUFFN0MsWUFBTSxPQUFPLFdBQVcsZ0JBQWdCLE9BQU87QUFHL0MsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGNBQVEsTUFBTTtBQUdkLGFBQU8sWUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLE9BQU8scUNBQXFDO0FBRy9ILFlBQU0sa0JBQWtCLGdCQUFnQixTQUFTLFlBQVksb0JBQW9CLFVBQVUsc0JBQXNCLENBQUM7QUFDbEgsWUFBTSxZQUFpQztBQUFBLFFBQ3RDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1Isc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUdBLFdBQUssZUFBZSxTQUFTO0FBRzdCLHNCQUFnQixJQUFJLFlBQVksb0JBQW9CLFVBQVUsU0FBUyxHQUFHLE1BQVM7QUFHbkYsYUFBTztBQUFBLFFBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUFHO0FBQUEsUUFDbEY7QUFBQSxNQUFrRDtBQUFBLElBQ3BELENBQUM7QUFFRCxTQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLFlBQU0sT0FBTyxXQUFXLGdCQUFnQixPQUFPO0FBRy9DLGFBQU8sR0FBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QixHQUFHLHdCQUF3QjtBQUdsRyxZQUFNLGtCQUFrQixnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLHNCQUFzQixDQUFDO0FBQ2xILFlBQU0sWUFBaUM7QUFBQSxRQUN0QyxHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFFBQVE7QUFBQSxVQUNSLHNCQUFzQixlQUFlO0FBQUEsUUFDdEMsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLFFBQ1AsbUJBQW1CO0FBQUEsTUFDcEI7QUFFQSxXQUFLLGVBQWUsU0FBUztBQUc3QixhQUFPO0FBQUEsUUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQUc7QUFBQSxRQUNsRjtBQUFBLE1BQXFDO0FBR3RDLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxjQUFRLE1BQU07QUFDZCxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRyxrQ0FBa0M7QUFHNUcsY0FBUSxNQUFNO0FBQ2QsYUFBTztBQUFBLFFBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUFHO0FBQUEsUUFDbEY7QUFBQSxNQUF1QztBQUd4QyxzQkFBZ0IsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBR25GLGFBQU87QUFBQSxRQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFBRztBQUFBLFFBQ2xGO0FBQUEsTUFBdUU7QUFBQSxJQUN6RSxDQUFDO0FBRUQsU0FBSywwRUFBMEUsTUFBTTtBQUNwRixZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLG1CQUFtQixnQkFBZ0IsVUFBVSxZQUFZLG9CQUFvQixVQUFVLHNCQUFzQixDQUFDO0FBQ3BILFlBQU0sYUFBa0M7QUFBQSxRQUN2QyxHQUFHLHlCQUF5QjtBQUFBLFVBQzNCLFFBQVE7QUFBQSxVQUNSLFlBQVk7QUFBQSxVQUNaLHNCQUFzQixlQUFlO0FBQUEsUUFDdEMsQ0FBQztBQUFBLFFBQ0QsT0FBTztBQUFBLFFBQ1AsbUJBQW1CO0FBQUEsTUFDcEI7QUFFQSxXQUFLLGVBQWUsVUFBVTtBQUc5QixhQUFPO0FBQUEsUUFBWSxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQUc7QUFBQSxRQUNsRjtBQUFBLE1BQTJDO0FBRzVDLFlBQU0sU0FBUyxrQkFBa0IsSUFBSTtBQUNyQyxjQUFRLE1BQU07QUFDZCxhQUFPLEdBQUcsS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkIsR0FBRyxrQ0FBa0M7QUFHNUcsY0FBUSxNQUFNO0FBQ2QsYUFBTztBQUFBLFFBQVksS0FBSyxRQUFRLFVBQVUsU0FBUyw2QkFBNkI7QUFBQSxRQUFHO0FBQUEsUUFDbEY7QUFBQSxNQUFxQztBQUd0Qyx1QkFBaUIsSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBQ3BGLGFBQU87QUFBQSxRQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFBRztBQUFBLFFBQ2xGO0FBQUEsTUFBMEU7QUFHM0UsY0FBUSxNQUFNO0FBQ2QsYUFBTyxHQUFHLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCLEdBQUcsK0NBQStDO0FBR3pILFlBQU0sbUJBQW1CLGdCQUFnQixVQUFVLFlBQVksb0JBQW9CLFVBQVUsc0JBQXNCLENBQUM7QUFDcEgsWUFBTSxhQUFrQztBQUFBLFFBQ3ZDLEdBQUcseUJBQXlCO0FBQUEsVUFDM0IsUUFBUTtBQUFBLFVBQ1IsWUFBWTtBQUFBLFVBQ1osc0JBQXNCLGVBQWU7QUFBQSxRQUN0QyxDQUFDO0FBQUEsUUFDRCxPQUFPO0FBQUEsUUFDUCxtQkFBbUI7QUFBQSxNQUNwQjtBQUVBLFdBQUssZUFBZSxVQUFVO0FBRzlCLGFBQU87QUFBQSxRQUFZLEtBQUssUUFBUSxVQUFVLFNBQVMsNkJBQTZCO0FBQUEsUUFBRztBQUFBLFFBQ2xGO0FBQUEsTUFBNEM7QUFHN0MsdUJBQWlCLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUNwRixhQUFPO0FBQUEsUUFBRyxLQUFLLFFBQVEsVUFBVSxTQUFTLDZCQUE2QjtBQUFBLFFBQ3RFO0FBQUEsTUFBOEY7QUFBQSxJQUNoRyxDQUFDO0FBRUQsU0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxZQUFNLGlCQUFpQix5QkFBeUI7QUFBQSxRQUMvQyxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxZQUFNLE9BQU8sV0FBVyxnQkFBZ0IsT0FBTztBQUcvQyxZQUFNLGtCQUFrQixnQkFBZ0IsU0FBUyxZQUFZLG9CQUFvQixVQUFVLFNBQVMsQ0FBQztBQUNyRyxZQUFNLFlBQWlDO0FBQUEsUUFDdEMsR0FBRyx5QkFBeUI7QUFBQSxVQUMzQixRQUFRO0FBQUEsVUFDUixzQkFBc0IsZUFBZTtBQUFBLFFBQ3RDLENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxRQUNQLG1CQUFtQjtBQUFBLE1BQ3BCO0FBRUEsV0FBSyxlQUFlLFNBQVM7QUFHN0IsWUFBTSxTQUFTLGtCQUFrQixJQUFJO0FBQ3JDLGFBQU8sR0FBRyxRQUFRLHFCQUFxQjtBQUN2QyxZQUFNLGVBQWUsdUJBQXVCLE1BQU07QUFDbEQsVUFBSSxhQUFhLGNBQWMsZUFBZSxRQUFRLGVBQWU7QUFDckUsYUFBTyxHQUFHLFdBQVcsU0FBUyxtQkFBbUIsR0FBRyxpREFBaUQ7QUFHckcsc0JBQWdCLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUduRixtQkFBYSxjQUFjLGVBQWUsUUFBUSxlQUFlO0FBQ2pFLGFBQU87QUFBQSxRQUFHLFdBQVcsU0FBUyxtQkFBbUI7QUFBQSxRQUNoRDtBQUFBLE1BQTBEO0FBQUEsSUFDNUQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sc0JBQXNCLE1BQU07QUFFakMsVUFBTSxZQUFZLENBQUMsWUFBNkI7QUFDL0MsVUFBSSxPQUFPLFlBQVksVUFBVTtBQUNoQyxlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUksaUJBQWlCLE9BQU8sR0FBRztBQUM5QixlQUFPLFFBQVE7QUFBQSxNQUNoQjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBRUEsU0FBSyx3RUFBd0UsTUFBTTtBQUNsRixZQUFNLHlCQUFzRSxDQUFDO0FBQzdFLHVCQUFpQixvQkFBb0IsQ0FBQyxTQUFzQixZQUFpQztBQUM1RiwrQkFBdUIsS0FBSyxFQUFFLFNBQVMsU0FBUyxVQUFVLFFBQVEsT0FBTyxFQUFFLENBQUM7QUFDNUUsZUFBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQUUsRUFBRTtBQUFBLE1BQzdCO0FBRUEsWUFBTSx1QkFBdUIsbUNBQW1DO0FBQUEsUUFDL0Qsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFVBQ1IsUUFBUTtBQUFBLFVBQ1IsV0FBVztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLElBQUk7QUFFNUMsaUJBQVcsc0JBQXNCLE9BQU87QUFHeEMsWUFBTSxhQUFhLHVCQUF1QixLQUFLLE9BQUssRUFBRSxRQUFRLFNBQVMsUUFBUSxDQUFDO0FBQ2hGLGFBQU8sR0FBRyxZQUFZLHFDQUFxQztBQUFBLElBQzVELENBQUM7QUFFRCxTQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFlBQU0seUJBQXNFLENBQUM7QUFDN0UsdUJBQWlCLG9CQUFvQixDQUFDLFNBQXNCLFlBQWlDO0FBQzVGLCtCQUF1QixLQUFLLEVBQUUsU0FBUyxTQUFTLFVBQVUsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUM1RSxlQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFO0FBQUEsTUFDN0I7QUFFQSxZQUFNLHVCQUF1QixtQ0FBbUM7QUFBQSxRQUMvRCxrQkFBa0I7QUFBQSxVQUNqQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsVUFDYixXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsVUFDUixRQUFRO0FBQUE7QUFBQSxRQUVUO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixJQUFJO0FBRTVDLGlCQUFXLHNCQUFzQixPQUFPO0FBR3hDLFlBQU0sYUFBYSx1QkFBdUIsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLFFBQVEsQ0FBQztBQUNoRixhQUFPLFlBQVksWUFBWSxRQUFXLGtEQUFrRDtBQUFBLElBQzdGLENBQUM7QUFFRCxTQUFLLDhFQUE4RSxNQUFNO0FBQ3hGLFlBQU0seUJBQXNFLENBQUM7QUFDN0UsdUJBQWlCLG9CQUFvQixDQUFDLFNBQXNCLFlBQWlDO0FBQzVGLCtCQUF1QixLQUFLLEVBQUUsU0FBUyxTQUFTLFVBQVUsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUM1RSxlQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFO0FBQUEsTUFDN0I7QUFFQSxZQUFNLG1CQUFvRDtBQUFBLFFBQ3pELE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxRQUNYLFFBQVE7QUFBQSxNQUNUO0FBRUEsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0M7QUFBQSxRQUNBLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxNQUMxQyxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLGlCQUFXLGdCQUFnQixPQUFPO0FBR2xDLFlBQU0sZUFBZSx1QkFBdUIsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLFFBQVEsQ0FBQztBQUNsRixhQUFPLFlBQVksY0FBYyxRQUFXLHVDQUF1QztBQUduRix1QkFBaUIsWUFBWTtBQUc3QixZQUFNLFFBQVEsZUFBZTtBQUM3QixZQUFNLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUd6RSxZQUFNLGFBQWEsdUJBQXVCLEtBQUssT0FBSyxFQUFFLFFBQVEsU0FBUyxpQkFBaUIsQ0FBQztBQUN6RixhQUFPLEdBQUcsWUFBWSxzREFBc0Q7QUFBQSxJQUM3RSxDQUFDO0FBRUQsU0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxZQUFNLHlCQUFzRSxDQUFDO0FBQzdFLHVCQUFpQixvQkFBb0IsQ0FBQyxTQUFzQixZQUFpQztBQUM1RiwrQkFBdUIsS0FBSyxFQUFFLFNBQVMsU0FBUyxVQUFVLFFBQVEsT0FBTyxFQUFFLENBQUM7QUFDNUUsZUFBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQUUsRUFBRTtBQUFBLE1BQzdCO0FBRUEsWUFBTSx1QkFBdUIsbUNBQW1DO0FBQUEsUUFDL0Qsa0JBQWtCO0FBQUEsVUFDakIsTUFBTTtBQUFBLFVBQ04sYUFBYTtBQUFBLFVBQ2IsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFVBQ1IsUUFBUTtBQUFBLFVBQ1IsV0FBVztBQUFBLFVBQ1gsU0FBUztBQUFBLFFBQ1Y7QUFBQSxNQUNELENBQUM7QUFDRCxZQUFNLFVBQVUsd0JBQXdCLElBQUk7QUFFNUMsaUJBQVcsc0JBQXNCLE9BQU87QUFHeEMsWUFBTSxRQUFRLHVCQUF1QixLQUFLLE9BQUssRUFBRSxRQUFRLFNBQVMsS0FBSyxLQUFLLEVBQUUsUUFBUSxTQUFTLFNBQVMsQ0FBQztBQUN6RyxhQUFPLEdBQUcsT0FBTyxrQ0FBa0M7QUFDbkQsYUFBTyxHQUFHLE1BQU8sUUFBUSxTQUFTLFFBQVEsR0FBRyx1Q0FBdUM7QUFBQSxJQUNyRixDQUFDO0FBRUQsU0FBSyxzRUFBc0UsTUFBTTtBQUNoRixZQUFNLHlCQUFzRSxDQUFDO0FBQzdFLHVCQUFpQixvQkFBb0IsQ0FBQyxTQUFzQixZQUFpQztBQUM1RiwrQkFBdUIsS0FBSyxFQUFFLFNBQVMsU0FBUyxVQUFVLFFBQVEsT0FBTyxFQUFFLENBQUM7QUFDNUUsZUFBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQUUsRUFBRTtBQUFBLE1BQzdCO0FBRUEsWUFBTSxtQkFBb0Q7QUFBQSxRQUN6RCxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsUUFDUixXQUFXO0FBQUEsTUFDWjtBQUVBLFlBQU0saUJBQWlCLHlCQUF5QjtBQUFBLFFBQy9DO0FBQUEsUUFDQSxXQUFXLG9CQUFvQixVQUFVO0FBQUEsTUFDMUMsQ0FBQztBQUNELFlBQU0sVUFBVSx3QkFBd0IsS0FBSztBQUU3QyxpQkFBVyxnQkFBZ0IsT0FBTztBQUdsQyxhQUFPLFlBQVksdUJBQXVCLEtBQUssT0FBSyxFQUFFLFFBQVEsU0FBUyxRQUFRLENBQUMsR0FBRyxRQUFXLGtEQUFrRDtBQUdoSix1QkFBaUIsVUFBVTtBQUMzQixZQUFNLFFBQVEsZUFBZTtBQUM3QixZQUFNLElBQUksWUFBWSxvQkFBb0IsVUFBVSxTQUFTLEdBQUcsTUFBUztBQUV6RSxZQUFNLGNBQWMsdUJBQXVCLEtBQUssT0FBSyxFQUFFLFFBQVEsU0FBUyxHQUFHLEtBQUssRUFBRSxRQUFRLFNBQVMsU0FBUyxDQUFDO0FBQzdHLGFBQU8sR0FBRyxhQUFhLG1EQUFtRDtBQUFBLElBQzNFLENBQUM7QUFFRCxTQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFlBQU0seUJBQXNFLENBQUM7QUFDN0UsdUJBQWlCLG9CQUFvQixDQUFDLFNBQXNCLFlBQWlDO0FBQzVGLCtCQUF1QixLQUFLLEVBQUUsU0FBUyxTQUFTLFVBQVUsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUM1RSxlQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsUUFBRSxFQUFFO0FBQUEsTUFDN0I7QUFJQSxZQUFNLG1CQUFvRDtBQUFBLFFBQ3pELE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxNQUNaO0FBRUEsWUFBTSxpQkFBaUIseUJBQXlCO0FBQUEsUUFDL0M7QUFBQSxRQUNBLFdBQVcsb0JBQW9CLFVBQVU7QUFBQSxNQUMxQyxDQUFDO0FBQ0QsWUFBTSxVQUFVLHdCQUF3QixLQUFLO0FBRTdDLGlCQUFXLGdCQUFnQixPQUFPO0FBR2xDLGFBQU8sWUFBWSx1QkFBdUIsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLE9BQU8sQ0FBQyxHQUFHLFFBQVcsZ0RBQWdEO0FBRzdJLHVCQUFpQixZQUFZO0FBQzdCLFlBQU0sUUFBUSxlQUFlO0FBQzdCLFlBQU0sSUFBSSxZQUFZLG9CQUFvQixVQUFVLFNBQVMsR0FBRyxNQUFTO0FBRXpFLFlBQU0sYUFBYSx1QkFBdUIsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLGlCQUFpQixDQUFDO0FBQ3pGLGFBQU8sR0FBRyxZQUFZLHNEQUFzRDtBQUFBLElBQzdFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
