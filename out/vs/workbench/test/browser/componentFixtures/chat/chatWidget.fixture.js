import * as dom from "../../../../../base/browser/dom.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { autorun, constObservable } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { ChatRequestTextPart } from "../../../../contrib/chat/common/requestParser/chatParserTypes.js";
import { ChatModel } from "../../../../contrib/chat/common/model/chatModel.js";
import { ChatViewModel } from "../../../../contrib/chat/common/model/chatViewModel.js";
import { ChatListWidget } from "../../../../contrib/chat/browser/widget/chatListWidget.js";
import { ChatInputPart } from "../../../../contrib/chat/browser/widget/input/chatInputPart.js";
import { IChatWidgetService } from "../../../../contrib/chat/browser/chat.js";
import { ElicitationState, IChatService } from "../../../../contrib/chat/common/chatService/chatService.js";
import { ChatElicitationRequestPart } from "../../../../contrib/chat/common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { ChatToolInvocation } from "../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../contrib/chat/common/tools/languageModelToolsService.js";
import { IChatToolRiskAssessmentService, ToolRiskLevel } from "../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILinkPresentationService } from "../../../../../platform/dataChannel/common/dataChannel.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../../../contrib/chat/common/constants.js";
import { SessionType } from "../../../../contrib/chat/common/chatSessionsService.js";
import { IChatResponseFileChangesService } from "../../../../contrib/chat/browser/chatResponseFileChangesService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../fixtureUtils.js";
import { registerChatFixtureServices } from "./chatFixtureUtils.js";
import { isChatTurnStatusPillsEnabled } from "../../../../contrib/chat/browser/widget/chatTurnPills.js";
import "../../../../contrib/chat/browser/widget/media/chat.css";
function makeFileDiff(change) {
  const root = change.isOutsideWorkspace ? "/home/user" : "/repo";
  const modifiedURI = URI.file(`${root}/${change.name}`);
  const originalURI = change.created ? modifiedURI : URI.file(`${root}/.original/${change.name}`);
  return { originalURI, modifiedURI, added: change.added, removed: change.removed, quitEarly: false, identical: false, isFinal: true, isBusy: false, isOutsideWorkspace: change.isOutsideWorkspace ?? false };
}
function makeUserMessage(text) {
  return {
    text,
    parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
  };
}
async function renderChatWidget(context, options) {
  const { container, disposableStore } = context;
  const widgetHolder = { current: void 0 };
  const fixtureToolData = {
    id: "fixture.terminalTool",
    displayName: "Terminal",
    modelDescription: "Run a command in the terminal",
    source: ToolDataSource.Internal
  };
  const hasRiskAssessment = options.messages.some((m) => m.assistant?.some((p) => (p.kind === "terminalConfirmation" || p.kind === "elicitation") && p.riskAssessment));
  const hasRiskLoading = options.messages.some((m) => m.assistant?.some((p) => (p.kind === "terminalConfirmation" || p.kind === "elicitation") && p.riskLoading));
  const riskFeatureExplicitlyDisabled = options.riskAssessmentEnabled === false;
  const needsRiskService = hasRiskAssessment || hasRiskLoading || riskFeatureExplicitlyDisabled;
  const requestDiffs = /* @__PURE__ */ new Map();
  const requestFileEdits = /* @__PURE__ */ new Map();
  const needsTurnPills = isChatTurnStatusPillsEnabled(options.turnStatusPills);
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: context.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
      if (options.linkPresentationService) {
        reg.defineInstance(ILinkPresentationService, options.linkPresentationService);
      }
      reg.defineInstance(IChatWidgetService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.lastFocusedWidget = void 0;
          this.onDidAddWidget = Event.None;
          this.onDidBackgroundSession = Event.None;
          this.onDidChangeFocusedWidget = Event.None;
          this.onDidChangeFocusedSession = Event.None;
        }
        getAllWidgets() {
          return widgetHolder.current ? [widgetHolder.current] : [];
        }
        getWidgetByInputUri() {
          return void 0;
        }
        getWidgetBySessionResource() {
          return widgetHolder.current;
        }
        getWidgetsByLocations() {
          return [];
        }
        register() {
          return { dispose() {
          } };
        }
      }());
      if (needsTurnPills) {
        reg.defineInstance(IChatResponseFileChangesService, new class extends mock() {
          getChangesForRequest(_sessionResource, requestId) {
            return constObservable(requestDiffs.get(requestId) ?? []);
          }
          getFileEditsForRequest(_sessionResource, requestId) {
            return constObservable(requestFileEdits.get(requestId) ?? []);
          }
        }());
      }
      if (needsRiskService) {
        reg.defineInstance(ILanguageModelToolsService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeTools = Event.None;
            this.onDidPrepareToolCallBecomeUnresponsive = Event.None;
          }
          getTools() {
            return [fixtureToolData];
          }
          getTool(id) {
            return id === fixtureToolData.id ? fixtureToolData : void 0;
          }
        }());
        reg.defineInstance(IChatToolRiskAssessmentService, new class extends mock() {
          isEnabled() {
            return !riskFeatureExplicitlyDisabled;
          }
          getCached() {
            for (const m of options.messages) {
              for (const p of m.assistant ?? []) {
                if ((p.kind === "terminalConfirmation" || p.kind === "elicitation") && p.riskAssessment) {
                  return p.riskAssessment;
                }
              }
            }
            return void 0;
          }
          // For riskLoading: assess() never resolves, keeping the badge in loading state.
          async assess() {
            return new Promise(() => {
            });
          }
        }());
      }
    }
  });
  const configService = instantiationService.get(IConfigurationService);
  configService.setUserConfiguration("chat", {
    editor: { fontSize: 13, fontFamily: "default", fontWeight: "default", lineHeight: 0, wordWrap: "off" }
  });
  configService.setUserConfiguration("editor", { fontFamily: "monospace", fontLigatures: false });
  configService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
  if (options.verbose !== void 0) {
    configService.setUserConfiguration(ChatConfiguration.Verbose, options.verbose);
  }
  if (needsTurnPills) {
    configService.setUserConfiguration(ChatConfiguration.TurnStatusPills, options.turnStatusPills);
  }
  const sessionResource = needsTurnPills ? URI.from({ scheme: SessionType.AgentHostCopilot, path: "/turn-pills-session" }) : void 0;
  const chatService = instantiationService.get(IChatService);
  const model = disposableStore.add(instantiationService.createInstance(
    ChatModel,
    void 0,
    { initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: sessionResource }
  ));
  chatService.addSession(model);
  for (const message of options.messages) {
    const request = model.addRequest(makeUserMessage(message.user), { variables: [] }, 0);
    const response = request.response;
    if (message.fileChanges) {
      const fileEdits = message.fileChanges.map(makeFileDiff);
      requestDiffs.set(request.id, fileEdits.filter((diff) => !diff.isOutsideWorkspace));
      requestFileEdits.set(request.id, fileEdits);
    }
    for (const part of message.assistant ?? []) {
      if (part.kind === "markdown") {
        model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString(part.text) });
      } else if (part.kind === "progress") {
        model.acceptResponseProgress(request, { kind: "progressMessage", content: new MarkdownString(part.text) });
      } else if (part.kind === "elicitation") {
        const elicitation = new ChatElicitationRequestPart(
          part.title,
          part.message,
          "",
          "Continue",
          "Cancel",
          async () => ElicitationState.Accepted,
          async () => ElicitationState.Rejected,
          void 0,
          void 0,
          void 0,
          part.riskAssessment || part.riskLoading ? { toolId: fixtureToolData.id, parameters: void 0 } : void 0
        );
        model.acceptResponseProgress(request, elicitation);
      } else if (part.kind === "terminalConfirmation") {
        const title = part.title ?? `Run pwsh command?`;
        const toolInvocation = new ChatToolInvocation(
          {
            invocationMessage: new MarkdownString(`Running \`${part.command}\``),
            pastTenseMessage: new MarkdownString(`Ran \`${part.command}\``),
            confirmationMessages: { title, message: new MarkdownString(`\`${part.command}\``), disclaimer: part.disclaimer ? new MarkdownString(part.disclaimer, { supportThemeIcons: true }) : void 0 },
            toolSpecificData: {
              kind: "terminal",
              commandLine: { original: part.command },
              language: "pwsh",
              requestUnsandboxedExecution: part.requestUnsandboxedExecution,
              requestUnsandboxedExecutionReason: part.requestUnsandboxedExecutionReason,
              confirmation: part.confirmation
            }
          },
          fixtureToolData,
          generateUuid(),
          void 0,
          { command: part.command }
        );
        model.acceptResponseProgress(request, toolInvocation);
      }
    }
    if (message.details) {
      response.setResult({ details: message.details });
    }
    if (message.responseComplete !== false) {
      response.complete();
    }
  }
  const viewModel = disposableStore.add(instantiationService.createInstance(ChatViewModel, model, void 0));
  const width = options.width ?? 720;
  const height = options.height ?? 600;
  const listBackground = "var(--vscode-editor-background)";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.backgroundColor = "var(--vscode-sideBar-background, var(--vscode-editor-background))";
  container.classList.add("monaco-workbench");
  const auxBar = dom.$(".part.auxiliarybar");
  auxBar.style.width = "100%";
  auxBar.style.height = "100%";
  const auxContent = dom.$(".content");
  auxContent.style.width = "100%";
  auxContent.style.height = "100%";
  auxBar.appendChild(auxContent);
  container.appendChild(auxBar);
  const session = dom.$(".interactive-session");
  session.style.setProperty("--vscode-chat-list-background", listBackground);
  auxContent.appendChild(session);
  const menuService = instantiationService.get(IMenuService);
  menuService.addItem(MenuId.ChatInput, { command: { id: "workbench.action.chat.attachContext", title: "+", icon: Codicon.add }, group: "navigation", order: -1 });
  menuService.addItem(MenuId.ChatInput, { command: { id: "workbench.action.chat.openModePicker", title: "Agent" }, group: "navigation", order: 1 });
  menuService.addItem(MenuId.ChatInput, { command: { id: "workbench.action.chat.openModelPicker", title: "GPT-5.3-Codex" }, group: "navigation", order: 3 });
  menuService.addItem(MenuId.ChatInput, { command: { id: "workbench.action.chat.configureTools", title: "", icon: Codicon.settingsGear }, group: "navigation", order: 100 });
  menuService.addItem(MenuId.ChatExecute, { command: { id: "workbench.action.chat.submit", title: "Send", icon: Codicon.newLine }, group: "navigation", order: 4 });
  menuService.addItem(MenuId.ChatInputSecondary, { command: { id: "workbench.action.chat.openSessionTargetPicker", title: "Local" }, group: "navigation", order: 0 });
  menuService.addItem(MenuId.ChatInputSecondary, { command: { id: "workbench.action.chat.openPermissionPicker", title: "Default Permissions" }, group: "navigation", order: 10 });
  if (options.responseFooterAction) {
    menuService.addItem(MenuId.ChatMessageFooter, { command: { id: "workbench.action.chat.copyResponse", title: "Copy", icon: Codicon.copy }, group: "navigation", order: 1 });
  }
  const inputOptions = {
    renderFollowups: false,
    renderInputToolbarBelowInput: false,
    renderWorkingSet: false,
    menus: { executeToolbar: MenuId.ChatExecute, telemetrySource: "fixture" },
    widgetViewKindTag: "view",
    inputEditorMinLines: 2
  };
  const inputStyles = {
    overlayBackground: "var(--vscode-editor-background)",
    listForeground: "var(--vscode-foreground)",
    listBackground
  };
  const inputPart = disposableStore.add(instantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, inputOptions, inputStyles, false));
  const fixtureWidget = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeViewModel = new Emitter().event;
      this.viewModel = viewModel;
      this.contribs = [];
      this.location = ChatAgentLocation.Chat;
      this.viewContext = {};
      this.inputPart = inputPart;
    }
  }();
  widgetHolder.current = fixtureWidget;
  inputPart.render(session, "", fixtureWidget);
  inputPart.layout(width);
  options.decorateInputPart?.(inputPart, instantiationService);
  inputPart.element.classList.toggle("chat-input-hidden", options.inputVisible === false);
  const listContainer = dom.$(".interactive-list");
  listContainer.style.flex = options.hostLayoutMode ? "0 0 auto" : "1 1 auto";
  listContainer.style.minHeight = "0";
  listContainer.style.position = "relative";
  session.insertBefore(listContainer, session.firstChild);
  const listWidget = disposableStore.add(instantiationService.createInstance(
    ChatListWidget,
    listContainer,
    {
      currentChatMode: () => ChatModeKind.Agent,
      defaultElementHeight: 120,
      styles: {
        listForeground: "var(--vscode-foreground)",
        listBackground
      },
      location: ChatAgentLocation.Chat,
      rendererOptions: {
        progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask
      }
    }
  ));
  listWidget.setViewModel(viewModel);
  listWidget.setVisible(true);
  listWidget.refresh();
  const listHeight = options.listHeight ?? 420;
  listWidget.layout(listHeight, width);
  listWidget.scrollTop = 0;
  if (options.hostLayoutMode && options.hostLayoutMode !== "none") {
    let layouting = false;
    disposableStore.add(autorun((reader) => {
      const inputHeight = inputPart.height.read(reader);
      if (layouting) {
        return;
      }
      layouting = true;
      try {
        if (options.hostLayoutMode === "stackedFull") {
          inputPart.setMaxHeight(Math.max(0, height - 50));
          inputPart.layout(width);
        }
        const contentHeight = options.hostLayoutMode === "stackedFull" || options.hostLayoutMode === "stackedTargeted" ? Math.max(0, Math.max(116, inputHeight) - inputHeight) : Math.max(0, height - inputHeight);
        listContainer.style.height = `${contentHeight}px`;
        listContainer.dataset["expectedHeight"] = String(contentHeight);
        listWidget.layout(contentHeight, width);
      } finally {
        layouting = false;
      }
    }));
  }
  options.onRendered?.({
    inputPart,
    listWidget,
    model,
    width,
    addTerminalConfirmation: (request, command) => {
      model.acceptResponseProgress(request, new ChatToolInvocation(
        {
          invocationMessage: new MarkdownString(`Running \`${command}\``),
          pastTenseMessage: new MarkdownString(`Ran \`${command}\``),
          confirmationMessages: { title: "Run diagnostic command?", message: new MarkdownString(`\`${command}\``) },
          toolSpecificData: {
            kind: "terminal",
            commandLine: { original: command },
            language: "pwsh"
          }
        },
        fixtureToolData,
        generateUuid(),
        void 0,
        { command }
      ));
    }
  });
}
const SIMPLE_QA = [
  {
    user: "Add a fibonacci function to fibon.ts",
    assistant: [
      { kind: "markdown", text: "I added a recursive `fibonacci(n)` to `fibon.ts`. Note that recursion is exponential \u2014 for large `n` consider an iterative version." }
    ]
  }
];
const SCROLL_TO_BOTTOM_ACTION = [
  {
    user: [
      "Please investigate why the chat transcript sometimes stops following a long-running agent response after I scroll upward to review an earlier step. Trace the list scroll state, the lock that controls automatic scrolling, and the event that reveals the action for returning to the newest content.",
      "Start by reproducing the behavior with a response that grows over several updates. Record how the rendered height, scroll height, and scroll position change when new markdown, progress messages, and tool output arrive while the transcript is both locked to the bottom and intentionally paused above it.",
      "Then compare mouse-wheel, keyboard, and programmatic scrolling. Make sure each path preserves the user decision to stay in place, but that selecting the return action reliably restores the bottom lock without causing the final response to jump or become obscured.",
      "Review the floating action itself in light and dark themes. It should remain legible over transcript content, use the transcript surface at rest, show the secondary action treatment on hover and focus, and expose a descriptive label to keyboard and screen reader users.",
      "Finally, add focused coverage for the scroll-state calculation and an isolated component fixture that renders enough real chat content to overflow. Position the list away from the bottom so the action is visible over content and future visual regressions are caught."
    ].join("\n\n")
  }
];
async function renderScrollToBottomAction(context) {
  let handle;
  await renderChatWidget(context, {
    messages: SCROLL_TO_BOTTOM_ACTION,
    height: 240,
    listHeight: 240,
    inputVisible: false,
    onRendered: (value) => handle = value
  });
  if (!handle) {
    throw new Error("Scroll-to-bottom fixture did not initialize");
  }
  const targetWindow = dom.getWindow(context.container);
  const nextFrame = () => new Promise((resolve) => targetWindow.requestAnimationFrame(() => resolve()));
  await nextFrame();
  await nextFrame();
  const maximumScrollTop = handle.listWidget.scrollHeight - handle.listWidget.renderHeight;
  if (maximumScrollTop <= 0) {
    throw new Error("Scroll-to-bottom fixture content does not overflow");
  }
  handle.listWidget.scrollTop = maximumScrollTop / 2;
  await nextFrame();
  const scrollDownButton = context.container.querySelector(".chat-scroll-down");
  if (!scrollDownButton) {
    throw new Error("Scroll-to-bottom button was not rendered");
  }
  const buttonStyle = targetWindow.getComputedStyle(scrollDownButton);
  if (buttonStyle.display !== "flex") {
    throw new Error(`Scroll-to-bottom button is not visible: ${buttonStyle.display}`);
  }
  if (handle.listWidget.isScrolledToBottom) {
    throw new Error("Scroll-to-bottom fixture unexpectedly remained at the bottom");
  }
  if (!buttonStyle.backgroundColor || buttonStyle.backgroundColor === "transparent" || buttonStyle.backgroundColor === "rgba(0, 0, 0, 0)") {
    throw new Error(`Scroll-to-bottom button background is transparent: ${buttonStyle.backgroundColor}`);
  }
  const buttonBounds = scrollDownButton.getBoundingClientRect();
  const contentUnderButton = Array.from(context.container.querySelectorAll(".monaco-list-row")).some((row) => {
    const rowBounds = row.getBoundingClientRect();
    return rowBounds.left < buttonBounds.right && rowBounds.right > buttonBounds.left && rowBounds.top < buttonBounds.bottom && rowBounds.bottom > buttonBounds.top;
  });
  if (!contentUnderButton) {
    throw new Error("Scroll-to-bottom button does not overlay transcript content");
  }
}
const LAST_RESPONSE_HOVER = [
  {
    user: "Summarize the changes",
    assistant: [
      { kind: "markdown", text: "The response content ends here." }
    ],
    details: "Claude Opus 4.8 - 2 credits"
  }
];
async function renderLastResponseHover(context) {
  await renderChatWidget(context, {
    messages: LAST_RESPONSE_HOVER,
    height: 600,
    inputVisible: false,
    responseFooterAction: true
  });
  const response = context.container.querySelector(".interactive-response.chat-most-recent-response");
  response?.querySelector(":scope > .value")?.dispatchEvent(new MouseEvent("mouseenter"));
}
const KEYBOARD_FOCUS = [
  {
    user: "Summarize the changes",
    assistant: [
      { kind: "markdown", text: "The first response has keyboard-accessible actions." }
    ],
    details: "Claude Opus 4.8 - 2 credits"
  },
  {
    user: "What should I do next?",
    assistant: [
      { kind: "markdown", text: "Run the tests and review the diff." }
    ],
    details: "Claude Opus 4.8 - 1 credit"
  }
];
async function renderKeyboardFocus(context, target) {
  await renderChatWidget(context, {
    messages: KEYBOARD_FOCUS,
    height: 600,
    inputVisible: false,
    responseFooterAction: true,
    verbose: target === "request-timestamp"
  });
  const selector = target === "response-action" ? ".interactive-response:not(.chat-most-recent-response) .chat-footer-toolbar .action-label" : ".interactive-request .chat-request-timestamp";
  const focusTarget = context.container.querySelector(selector);
  if (!focusTarget) {
    throw new Error(`Missing keyboard focus target: ${target}`);
  }
  focusTarget.focus();
  if (focusTarget.ownerDocument.activeElement !== focusTarget) {
    throw new Error(`Could not focus keyboard target: ${target}`);
  }
}
const PENDING_TOOL_APPROVAL = [
  {
    user: "run git init",
    assistant: [
      {
        kind: "terminalConfirmation",
        command: "git init",
        riskAssessment: {
          risk: ToolRiskLevel.Orange,
          explanation: "Initializes a new Git repository in the current directory. Reversible by removing the .git folder."
        }
      }
    ],
    responseComplete: false
  }
];
const ISSUE_309796_MISSING_BACKSLASH = [
  {
    user: "install dependencies in the server directory",
    assistant: [
      {
        kind: "terminalConfirmation",
        command: "cd packages\\server && npm install",
        title: "Run `pwsh` command within `packages\\server`?",
        confirmation: {
          commandLine: "npm install",
          cwdLabel: "packages\\server",
          cdPrefix: "cd packages\\server && "
        }
      }
    ],
    responseComplete: false
  }
];
const STREAMING = [
  {
    user: "Search the workspace for TODO comments",
    assistant: [
      { kind: "progress", text: "Searching workspace for `TODO` comments..." }
    ],
    responseComplete: false
  }
];
const MULTI_TURN = [
  {
    user: "What does this project do?",
    assistant: [
      { kind: "markdown", text: "This project is **Visual Studio Code**, a free source-code editor made by Microsoft for Windows, Linux and macOS." }
    ]
  },
  {
    user: "Where is the entrypoint?",
    assistant: [
      { kind: "markdown", text: "The desktop entrypoint is in `src/vs/code/electron-main/main.ts`. The browser/server entrypoints live under `src/vs/server/`." }
    ]
  },
  {
    user: "Thanks!",
    assistant: [
      { kind: "markdown", text: "You are welcome \u2014 let me know if you have more questions." }
    ]
  }
];
const CODE_BLOCK_IN_LIST = [
  {
    user: "Why do the files appear while diffs fail?",
    assistant: [
      {
        kind: "markdown",
        text: [
          "## Root cause",
          "",
          "Git is unusable on this Mac because the Xcode license has not been accepted. Both `git --version` and `/usr/bin/git --version` currently exit with code 69 and report:",
          "",
          "> You have not agreed to the Xcode license agreements.",
          "",
          "### Why files appear but diffs fail",
          "",
          "1. The session restores/caches the change-set metadata, so VS Code can display the filenames and change counts.",
          "2. Opening a diff requires loading its original side using a `git-blob:` URI.",
          "3. Agent Host executes roughly:",
          "   ```bash",
          "   git show 1e393d7b352de7927a98d0321e51ae63046c8652:<path>",
          "   ```",
          "4. Git refuses to run because of the Xcode license."
        ].join("\n")
      }
    ]
  }
];
async function renderResizeObserverLoopHarness(context, hostLayoutMode) {
  const targetWindow = dom.getWindow(context.container);
  let handle;
  await renderChatWidget(context, {
    messages: [{
      user: [
        "Investigate ResizeObserver re-entry.",
        "",
        "Context (text/plain; no binary upload):",
        "Issue #316501 tracks chat list and input resize-observer loop warnings."
      ].join("\n"),
      assistant: [{
        kind: "markdown",
        text: "The mocked chat harness is ready."
      }]
    }],
    width: 720,
    height: 600,
    hostLayoutMode,
    onRendered: (value) => handle = value
  });
  if (!handle) {
    throw new Error("ResizeObserver harness did not initialize");
  }
  const fixtureHandle = handle;
  const controls = dom.$(".resize-observer-loop-harness");
  const runButton = dom.append(controls, dom.$("button.resize-observer-loop-run"));
  runButton.type = "button";
  runButton.textContent = "Run 20-turn burst";
  const status = dom.append(controls, dom.$("span.resize-observer-loop-status"));
  status.role = "status";
  status.textContent = "Ready";
  const warnings = dom.append(controls, dom.$("span.resize-observer-loop-warnings"));
  warnings.textContent = "Warnings: 0";
  controls.style.position = "absolute";
  controls.style.top = "8px";
  controls.style.right = "8px";
  controls.style.zIndex = "100";
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.alignItems = "center";
  controls.style.padding = "6px 8px";
  controls.style.background = "var(--vscode-editorWidget-background)";
  controls.style.border = "1px solid var(--vscode-widget-border)";
  context.container.style.position = "relative";
  context.container.appendChild(controls);
  let warningCount = 0;
  context.disposableStore.add(dom.addDisposableListener(targetWindow, dom.EventType.ERROR, (event) => {
    if (event instanceof ErrorEvent && event.message.includes("ResizeObserver loop")) {
      warningCount++;
      warnings.textContent = `Warnings: ${warningCount}`;
      warnings.dataset["observerContext"] = dom.getRecentDisposableResizeObserverContextForLoopError(event.message, targetWindow) ?? event.message;
      status.textContent = "Captured ResizeObserver warning";
    }
  }));
  const nextFrame = () => new Promise((resolve) => targetWindow.requestAnimationFrame(() => resolve()));
  const runBurst = async () => {
    runButton.disabled = true;
    status.textContent = "Adding queued turns...";
    const responses = [];
    for (let index = 1; index <= 20; index++) {
      const prompt = [
        `Queued prompt ${index}`,
        "",
        "Context (text/plain; no binary upload):",
        ...Array.from({ length: 12 }, (_, line) => `Resize stress sample ${index}.${line + 1}: ${"layout ".repeat(index % 5 + 1)}`)
      ].join("\n");
      fixtureHandle.inputPart.setValue(prompt, true);
      fixtureHandle.inputPart.layout(fixtureHandle.width);
      const request = fixtureHandle.model.addRequest(makeUserMessage(prompt), { variables: [] }, 0);
      fixtureHandle.model.acceptResponseProgress(request, {
        kind: "progressMessage",
        content: new MarkdownString(`Processing queued prompt ${index}...`)
      });
      if (index === 1) {
        fixtureHandle.addTerminalConfirmation(request, "git status --short");
      }
      responses.push(request.response);
      fixtureHandle.listWidget.refresh();
      await nextFrame();
      fixtureHandle.inputPart.setValue("", true);
      fixtureHandle.inputPart.layout(fixtureHandle.width);
      fixtureHandle.model.acceptResponseProgress(request, {
        kind: "markdownContent",
        content: new MarkdownString(`Mock streamed output ${index}

${"- response line\n".repeat(index % 7 + 1)}`)
      });
      fixtureHandle.listWidget.refresh();
      await nextFrame();
    }
    status.textContent = "Completing mocked responses...";
    for (const response of responses) {
      response.complete();
      fixtureHandle.listWidget.refresh();
      await nextFrame();
    }
    status.textContent = warningCount > 0 ? "Completed with ResizeObserver warning" : "Completed without warning";
    runButton.disabled = false;
  };
  context.disposableStore.add(dom.addDisposableListener(runButton, dom.EventType.CLICK, () => {
    void runBurst();
  }));
}
var chatWidget_fixture_default = defineThemedFixtureGroup({ path: "chat/widget/" }, {
  SimpleQA: defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: SIMPLE_QA }) }),
  ScrollToBottomAction: defineComponentFixture({ render: renderScrollToBottomAction }),
  Streaming: defineComponentFixture({ labels: { kind: "animated" }, render: (ctx) => renderChatWidget(ctx, { messages: STREAMING }) }),
  PendingToolApproval: defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: PENDING_TOOL_APPROVAL }) }),
  ResizeObserverLoopHarness: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: (context) => renderResizeObserverLoopHarness(context, "stackedFull")
  }),
  ResizeObserverLoopListOnly: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: (context) => renderResizeObserverLoopHarness(context, "listOnly")
  }),
  ResizeObserverLoopStackedTargeted: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: (context) => renderResizeObserverLoopHarness(context, "stackedTargeted")
  }),
  ResizeObserverLoopNoHostLayout: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: (context) => renderResizeObserverLoopHarness(context, "none")
  }),
  CodeBlockInList: defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: CODE_BLOCK_IN_LIST }) }),
  bugs: defineThemedFixtureGroup({
    "issue-309796-missing-backslash": defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: ISSUE_309796_MISSING_BACKSLASH }) })
  }),
  MultiTurn: defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: MULTI_TURN }) }),
  LastResponseContentHover: defineComponentFixture({ render: renderLastResponseHover }),
  ResponseActionKeyboardFocus: defineComponentFixture({ render: (ctx) => renderKeyboardFocus(ctx, "response-action") }),
  RequestTimestampKeyboardFocus: defineComponentFixture({ render: (ctx) => renderKeyboardFocus(ctx, "request-timestamp") })
});
export {
  chatWidget_fixture_default as default,
  renderChatWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxjaGF0XFxjaGF0V2lkZ2V0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0VGV4dFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdExpc3RXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdExpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0UGFydCwgSUNoYXRJbnB1dFBhcnRPcHRpb25zLCBJQ2hhdElucHV0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFBhcnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBFbGljaXRhdGlvblN0YXRlLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsIElUb29sUmlza0Fzc2Vzc21lbnQsIFRvb2xSaXNrTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci90b29scy9jaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMaW5rUHJlc2VudGF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2NvbW1vbi9kYXRhQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSwgSUNoYXRSZXNwb25zZUZpbGVFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAgfSBmcm9tICcuLi9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgRml4dHVyZU1lbnVTZXJ2aWNlLCByZWdpc3RlckNoYXRGaXh0dXJlU2VydmljZXMgfSBmcm9tICcuL2NoYXRGaXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdFR1cm5TdGF0dXNQaWxsc1NldHRpbmcsIGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFR1cm5QaWxscy5qcyc7XG5cbmltcG9ydCAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L21lZGlhL2NoYXQuY3NzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRml4dHVyZUZpbGVDaGFuZ2Uge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFkZGVkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbW92ZWQ6IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgdGhlIGZpbGUgd2FzIGNyZWF0ZWQgKHZzLiBlZGl0ZWQpIGR1cmluZyB0aGUgdHVybi4gKi9cblx0cmVhZG9ubHkgY3JlYXRlZDogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgdGhlIGZpbGUgaXMgb3V0c2lkZSB0aGUgb3duaW5nIHNlc3Npb24gd29ya3NwYWNlLiAqL1xuXHRyZWFkb25seSBpc091dHNpZGVXb3Jrc3BhY2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaXh0dXJlTWVzc2FnZSB7XG5cdHJlYWRvbmx5IHVzZXI6IHN0cmluZzsgLy8gdXNlciBwcm9tcHQgdGV4dFxuXHRyZWFkb25seSBhc3Npc3RhbnQ/OiBSZWFkb25seUFycmF5PFxuXHRcdHwgeyBraW5kOiAnbWFya2Rvd24nOyB0ZXh0OiBzdHJpbmcgfVxuXHRcdHwgeyBraW5kOiAncHJvZ3Jlc3MnOyB0ZXh0OiBzdHJpbmcgfVxuXHRcdHwgeyBraW5kOiAndGVybWluYWxDb25maXJtYXRpb24nOyBjb21tYW5kOiBzdHJpbmc7IHRpdGxlPzogc3RyaW5nOyBkaXNjbGFpbWVyPzogc3RyaW5nOyByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24/OiBib29sZWFuOyByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24/OiBzdHJpbmc7IHJpc2tBc3Nlc3NtZW50PzogeyByaXNrOiBUb29sUmlza0xldmVsOyBleHBsYW5hdGlvbjogc3RyaW5nIH07IHJpc2tMb2FkaW5nPzogYm9vbGVhbjsgY29uZmlybWF0aW9uPzogeyBjb21tYW5kTGluZTogc3RyaW5nOyBjd2RMYWJlbD86IHN0cmluZzsgY2RQcmVmaXg/OiBzdHJpbmcgfSB9XG5cdFx0fCB7IGtpbmQ6ICdlbGljaXRhdGlvbic7IHRpdGxlOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZzsgY29uZmlybWF0aW9uPzogeyBjb21tYW5kTGluZTogc3RyaW5nOyBjd2RMYWJlbD86IHN0cmluZzsgY2RQcmVmaXg/OiBzdHJpbmcgfTsgcmlza0Fzc2Vzc21lbnQ/OiB7IHJpc2s6IFRvb2xSaXNrTGV2ZWw7IGV4cGxhbmF0aW9uOiBzdHJpbmcgfTsgcmlza0xvYWRpbmc/OiBib29sZWFuIH1cblx0Pjtcblx0cmVhZG9ubHkgZGV0YWlscz86IHN0cmluZztcblx0cmVhZG9ubHkgcmVzcG9uc2VDb21wbGV0ZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBQZXItdHVybiBmaWxlIGNoYW5nZXMgc3VyZmFjZWQgdmlhIHtAbGluayBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlfSxcblx0ICogdXNlZCBieSB0aGUgdHVybiBjaGFuZ2VzIHN1bW1hcnkuIFJlcXVpcmVzIGB0dXJuU3RhdHVzUGlsbHNgIG9uIHRoZSBmaXh0dXJlXG5cdCAqIG9wdGlvbnMgdG8gYmUgcmVuZGVyZWQuXG5cdCAqL1xuXHRyZWFkb25seSBmaWxlQ2hhbmdlcz86IFJlYWRvbmx5QXJyYXk8SUZpeHR1cmVGaWxlQ2hhbmdlPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFdpZGdldEZpeHR1cmVPcHRpb25zIHtcblx0cmVhZG9ubHkgbWVzc2FnZXM6IFJlYWRvbmx5QXJyYXk8SUZpeHR1cmVNZXNzYWdlPjtcblx0cmVhZG9ubHkgd2lkdGg/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGhlaWdodD86IG51bWJlcjtcblx0cmVhZG9ubHkgbGlzdEhlaWdodD86IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgdG8gcmVuZGVyIHRoZSBtYWluIGNoYXQgaW5wdXQuIERlZmF1bHRzIHRvIGB0cnVlYC4gKi9cblx0cmVhZG9ubHkgaW5wdXRWaXNpYmxlPzogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgdG8gcG9wdWxhdGUgdGhlIHJlc3BvbnNlIGZvb3RlciB3aXRoIGFuIGFjdGlvbi4gKi9cblx0cmVhZG9ubHkgcmVzcG9uc2VGb290ZXJBY3Rpb24/OiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0byBzaG93IHJlcXVlc3QgYW5kIHJlc3BvbnNlIHRpbWluZyBkZXRhaWxzLiAqL1xuXHRyZWFkb25seSB2ZXJib3NlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gYGZhbHNlYCwgcmVnaXN0ZXJzIGEgc3R1YiBgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlYCB3aG9zZVxuXHQgKiBgaXNFbmFibGVkKClgIHJldHVybnMgYGZhbHNlYCwgZXhlcmNpc2luZyB0aGUgXCJmZWF0dXJlIG9mZlwiIGNvZGUgcGF0aC5cblx0ICogV2hlbiBvbWl0dGVkLCBiZWhhdmVzIGxpa2UgdG9kYXkgKGF1dG8tZGV0ZWN0ZWQgZnJvbSBtZXNzYWdlIHJpc2sgZGF0YSkuXG5cdCAqL1xuXHRyZWFkb25seSByaXNrQXNzZXNzbWVudEVuYWJsZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogT3B0aW9uYWwgaG9vayBpbnZva2VkIGFmdGVyIHRoZSBjaGF0IGlucHV0IHBhcnQgcmVuZGVycywgZS5nLiB0byBtb3VudFxuXHQgKiB3aWRnZXRzIGFib3ZlIHRoZSBpbnB1dC4gUmVjZWl2ZXMgdGhlIHJlbmRlcmVkIGlucHV0IHBhcnQgYW5kIHRoZSBmaXh0dXJlJ3Ncblx0ICogaW5zdGFudGlhdGlvbiBzZXJ2aWNlIHNvIGNhbGxlcnMgY2FuIGNyZWF0ZSBpbnN0YW5jZXMgYWdhaW5zdCB0aGUgc2FtZVxuXHQgKiBzZXJ2aWNlIGdyYXBoLlxuXHQgKi9cblx0cmVhZG9ubHkgZGVjb3JhdGVJbnB1dFBhcnQ/OiAoaW5wdXRQYXJ0OiBDaGF0SW5wdXRQYXJ0LCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB2b2lkO1xuXHQvKipcblx0ICogV2hlbiBzZXQsIHJlbmRlcnMgdGhlIGNoYXQgYXMgYW4gYWdlbnQgaG9zdCBzZXNzaW9uIGFuZCBlbmFibGVzIHRoZSB0dXJuXG5cdCAqIGNoYW5nZXMgc3VtbWFyeSAoYGNoYXQudHVyblN0YXR1c1BpbGxzYCksIHNvIGNvbXBsZXRlZCB0dXJucyB3aXRoXG5cdCAqIHtAbGluayBJRml4dHVyZU1lc3NhZ2UuZmlsZUNoYW5nZXN9IHNob3cgd29ya3NwYWNlIGNoYW5nZXMgYW5kIGV4dGVybmFsXG5cdCAqIE1hcmtkb3duIHByZXZpZXdzIHVuZGVyIHRoZSByZXNwb25zZS5cblx0ICovXG5cdHJlYWRvbmx5IHR1cm5TdGF0dXNQaWxscz86IENoYXRUdXJuU3RhdHVzUGlsbHNTZXR0aW5nO1xuXHRyZWFkb25seSBsaW5rUHJlc2VudGF0aW9uU2VydmljZT86IElMaW5rUHJlc2VudGF0aW9uU2VydmljZTtcblx0cmVhZG9ubHkgb25SZW5kZXJlZD86IChoYW5kbGU6IElDaGF0V2lkZ2V0Rml4dHVyZUhhbmRsZSkgPT4gdm9pZDtcblx0LyoqIFNlbGVjdHMgdGhlIGlucHV0LWhlaWdodCBjb25zdW1lciB1c2VkIGJ5IHRoZSBSZXNpemVPYnNlcnZlciBoYXJuZXNzLiAqL1xuXHRyZWFkb25seSBob3N0TGF5b3V0TW9kZT86ICdub25lJyB8ICdsaXN0T25seScgfCAnc3RhY2tlZEZ1bGwnIHwgJ3N0YWNrZWRUYXJnZXRlZCc7XG59XG5cbmludGVyZmFjZSBJQ2hhdFdpZGdldEZpeHR1cmVIYW5kbGUge1xuXHRyZWFkb25seSBpbnB1dFBhcnQ6IENoYXRJbnB1dFBhcnQ7XG5cdHJlYWRvbmx5IGxpc3RXaWRnZXQ6IENoYXRMaXN0V2lkZ2V0O1xuXHRyZWFkb25seSBtb2RlbDogQ2hhdE1vZGVsO1xuXHRyZWFkb25seSB3aWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBhZGRUZXJtaW5hbENvbmZpcm1hdGlvbjogKHJlcXVlc3Q6IFJldHVyblR5cGU8Q2hhdE1vZGVsWydhZGRSZXF1ZXN0J10+LCBjb21tYW5kOiBzdHJpbmcpID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIG1ha2VGaWxlRGlmZihjaGFuZ2U6IElGaXh0dXJlRmlsZUNoYW5nZSk6IElDaGF0UmVzcG9uc2VGaWxlRWRpdCB7XG5cdC8vIEEgY3JlYXRlZCBmaWxlIGhhcyBubyBiZWZvcmUtY29udGVudCwgc28gdGhlIGFnZW50IGhvc3QgcHJvdmlkZXIgbWFwcyBpdHNcblx0Ly8gYG9yaWdpbmFsVVJJYCB0byB0aGUgYG1vZGlmaWVkVVJJYCAoZXF1YWwgVVJJcyk7IGFuIGVkaXRlZCBmaWxlIGtlZXBzIGFcblx0Ly8gZGlzdGluY3Qgb3JpZ2luYWwuXG5cdGNvbnN0IHJvb3QgPSBjaGFuZ2UuaXNPdXRzaWRlV29ya3NwYWNlID8gJy9ob21lL3VzZXInIDogJy9yZXBvJztcblx0Y29uc3QgbW9kaWZpZWRVUkkgPSBVUkkuZmlsZShgJHtyb290fS8ke2NoYW5nZS5uYW1lfWApO1xuXHRjb25zdCBvcmlnaW5hbFVSSSA9IGNoYW5nZS5jcmVhdGVkID8gbW9kaWZpZWRVUkkgOiBVUkkuZmlsZShgJHtyb290fS8ub3JpZ2luYWwvJHtjaGFuZ2UubmFtZX1gKTtcblx0cmV0dXJuIHsgb3JpZ2luYWxVUkksIG1vZGlmaWVkVVJJLCBhZGRlZDogY2hhbmdlLmFkZGVkLCByZW1vdmVkOiBjaGFuZ2UucmVtb3ZlZCwgcXVpdEVhcmx5OiBmYWxzZSwgaWRlbnRpY2FsOiBmYWxzZSwgaXNGaW5hbDogdHJ1ZSwgaXNCdXN5OiBmYWxzZSwgaXNPdXRzaWRlV29ya3NwYWNlOiBjaGFuZ2UuaXNPdXRzaWRlV29ya3NwYWNlID8/IGZhbHNlIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VVc2VyTWVzc2FnZSh0ZXh0OiBzdHJpbmcpIHtcblx0cmV0dXJuIHtcblx0XHR0ZXh0LFxuXHRcdHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIDEsIDEsIHRleHQubGVuZ3RoICsgMSksIHRleHQpXSxcblx0fTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbmRlckNoYXRXaWRnZXQoY29udGV4dDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIG9wdGlvbnM6IElDaGF0V2lkZ2V0Rml4dHVyZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9ID0gY29udGV4dDtcblxuXHRjb25zdCB3aWRnZXRIb2xkZXI6IHsgY3VycmVudDogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQgfSA9IHsgY3VycmVudDogdW5kZWZpbmVkIH07XG5cblx0Y29uc3QgZml4dHVyZVRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0aWQ6ICdmaXh0dXJlLnRlcm1pbmFsVG9vbCcsXG5cdFx0ZGlzcGxheU5hbWU6ICdUZXJtaW5hbCcsXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1J1biBhIGNvbW1hbmQgaW4gdGhlIHRlcm1pbmFsJyxcblx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHR9O1xuXG5cdC8vIENvbGxlY3QgcmlzayBhc3Nlc3NtZW50cyBmcm9tIG1lc3NhZ2VzIHNvIHRoZSByaXNrIGJhZGdlIHNlcnZpY2UgY2FuXG5cdC8vIHJldHVybiB0aGVtIHN5bmNocm9ub3VzbHkgdmlhIGdldENhY2hlZCgpLlxuXHRjb25zdCBoYXNSaXNrQXNzZXNzbWVudCA9IG9wdGlvbnMubWVzc2FnZXMuc29tZShtID0+IG0uYXNzaXN0YW50Py5zb21lKHAgPT4gKHAua2luZCA9PT0gJ3Rlcm1pbmFsQ29uZmlybWF0aW9uJyB8fCBwLmtpbmQgPT09ICdlbGljaXRhdGlvbicpICYmIHAucmlza0Fzc2Vzc21lbnQpKTtcblx0Y29uc3QgaGFzUmlza0xvYWRpbmcgPSBvcHRpb25zLm1lc3NhZ2VzLnNvbWUobSA9PiBtLmFzc2lzdGFudD8uc29tZShwID0+IChwLmtpbmQgPT09ICd0ZXJtaW5hbENvbmZpcm1hdGlvbicgfHwgcC5raW5kID09PSAnZWxpY2l0YXRpb24nKSAmJiBwLnJpc2tMb2FkaW5nKSk7XG5cdGNvbnN0IHJpc2tGZWF0dXJlRXhwbGljaXRseURpc2FibGVkID0gb3B0aW9ucy5yaXNrQXNzZXNzbWVudEVuYWJsZWQgPT09IGZhbHNlO1xuXHRjb25zdCBuZWVkc1Jpc2tTZXJ2aWNlID0gaGFzUmlza0Fzc2Vzc21lbnQgfHwgaGFzUmlza0xvYWRpbmcgfHwgcmlza0ZlYXR1cmVFeHBsaWNpdGx5RGlzYWJsZWQ7XG5cblx0Ly8gTWFwcyBhIGNvbXBsZXRlZCB0dXJuJ3MgcmVxdWVzdElkIHRvIGl0cyBwZXItdHVybiBmaWxlIGRpZmZzLCBjb25zdW1lZCBieVxuXHQvLyB0aGUgdHVybiBjaGFuZ2VzIHN1bW1hcnkgdmlhIHRoZSBzdHViYmVkIElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuXG5cdGNvbnN0IHJlcXVlc3REaWZmcyA9IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBJRWRpdFNlc3Npb25FbnRyeURpZmZbXT4oKTtcblx0Y29uc3QgcmVxdWVzdEZpbGVFZGl0cyA9IG5ldyBNYXA8c3RyaW5nLCByZWFkb25seSBJQ2hhdFJlc3BvbnNlRmlsZUVkaXRbXT4oKTtcblx0Y29uc3QgbmVlZHNUdXJuUGlsbHMgPSBpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKG9wdGlvbnMudHVyblN0YXR1c1BpbGxzKTtcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGNvbnRleHQudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlckNoYXRGaXh0dXJlU2VydmljZXMocmVnKTtcblx0XHRcdGlmIChvcHRpb25zLmxpbmtQcmVzZW50YXRpb25TZXJ2aWNlKSB7XG5cdFx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTGlua1ByZXNlbnRhdGlvblNlcnZpY2UsIG9wdGlvbnMubGlua1ByZXNlbnRhdGlvblNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT3ZlcnJpZGUgd2lkZ2V0IHNlcnZpY2Ugc28gdGhlIGNoYXQgbGlzdCByZW5kZXJlciBjYW4gcm91dGUgdG9vbFxuXHRcdFx0Ly8gY29uZmlybWF0aW9ucyB0byB0aGUgY2Fyb3VzZWwgYXR0YWNoZWQgdG8gb3VyIGlucHV0IHBhcnQuXG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RGb2N1c2VkV2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFkZFdpZGdldCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQmFja2dyb3VuZFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvY3VzZWRXaWRnZXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWxsV2lkZ2V0cygpIHsgcmV0dXJuIHdpZGdldEhvbGRlci5jdXJyZW50ID8gW3dpZGdldEhvbGRlci5jdXJyZW50XSA6IFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFdpZGdldEJ5SW5wdXRVcmkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoKSB7IHJldHVybiB3aWRnZXRIb2xkZXIuY3VycmVudDsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRXaWRnZXRzQnlMb2NhdGlvbnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWdpc3RlcigpIHsgcmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9OyB9XG5cdFx0XHR9KCkpO1xuXG5cdFx0XHRpZiAobmVlZHNUdXJuUGlsbHMpIHtcblx0XHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0Q2hhbmdlc0ZvclJlcXVlc3QoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShyZXF1ZXN0RGlmZnMuZ2V0KHJlcXVlc3RJZCkgPz8gW10pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRvdmVycmlkZSBnZXRGaWxlRWRpdHNGb3JSZXF1ZXN0KF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUocmVxdWVzdEZpbGVFZGl0cy5nZXQocmVxdWVzdElkKSA/PyBbXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmVlZHNSaXNrU2VydmljZSkge1xuXHRcdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlVG9vbHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRcdG92ZXJyaWRlIG9uRGlkUHJlcGFyZVRvb2xDYWxsQmVjb21lVW5yZXNwb25zaXZlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0XHRvdmVycmlkZSBnZXRUb29scygpIHsgcmV0dXJuIFtmaXh0dXJlVG9vbERhdGFdOyB9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9vbChpZDogc3RyaW5nKSB7IHJldHVybiBpZCA9PT0gZml4dHVyZVRvb2xEYXRhLmlkID8gZml4dHVyZVRvb2xEYXRhIDogdW5kZWZpbmVkOyB9XG5cdFx0XHRcdH0oKSk7XG5cdFx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBpc0VuYWJsZWQoKSB7IHJldHVybiAhcmlza0ZlYXR1cmVFeHBsaWNpdGx5RGlzYWJsZWQ7IH1cblx0XHRcdFx0XHRvdmVycmlkZSBnZXRDYWNoZWQoKSB7XG5cdFx0XHRcdFx0XHQvLyBSZXR1cm4gdGhlIGZpcnN0IHJpc2sgYXNzZXNzbWVudCBmb3VuZCBpbiB0aGUgZml4dHVyZSBtZXNzYWdlcy5cblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbSBvZiBvcHRpb25zLm1lc3NhZ2VzKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgcCBvZiBtLmFzc2lzdGFudCA/PyBbXSkge1xuXHRcdFx0XHRcdFx0XHRcdGlmICgocC5raW5kID09PSAndGVybWluYWxDb25maXJtYXRpb24nIHx8IHAua2luZCA9PT0gJ2VsaWNpdGF0aW9uJykgJiYgcC5yaXNrQXNzZXNzbWVudCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHAucmlza0Fzc2Vzc21lbnQ7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBGb3Igcmlza0xvYWRpbmc6IGFzc2VzcygpIG5ldmVyIHJlc29sdmVzLCBrZWVwaW5nIHRoZSBiYWRnZSBpbiBsb2FkaW5nIHN0YXRlLlxuXHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGFzc2VzcygpOiBQcm9taXNlPElUb29sUmlza0Fzc2Vzc21lbnQgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHsgfSk7IH1cblx0XHRcdFx0fSgpKTtcblx0XHRcdH1cblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0Jywge1xuXHRcdGVkaXRvcjogeyBmb250U2l6ZTogMTMsIGZvbnRGYW1pbHk6ICdkZWZhdWx0JywgZm9udFdlaWdodDogJ2RlZmF1bHQnLCBsaW5lSGVpZ2h0OiAwLCB3b3JkV3JhcDogJ29mZicgfSxcblx0fSk7XG5cdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2VkaXRvcicsIHsgZm9udEZhbWlseTogJ21vbm9zcGFjZScsIGZvbnRMaWdhdHVyZXM6IGZhbHNlIH0pO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCwgdHJ1ZSk7XG5cdGlmIChvcHRpb25zLnZlcmJvc2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVmVyYm9zZSwgb3B0aW9ucy52ZXJib3NlKTtcblx0fVxuXHRpZiAobmVlZHNUdXJuUGlsbHMpIHtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlR1cm5TdGF0dXNQaWxscywgb3B0aW9ucy50dXJuU3RhdHVzUGlsbHMpO1xuXHR9XG5cblx0Ly8gQnVpbGQgYSByZWFsIENoYXRNb2RlbCBwb3B1bGF0ZWQgd2l0aCBoYW5kLWNyYWZ0ZWQgcmVxdWVzdHMvcmVzcG9uc2VzLCB0aGVuIGRyaXZlIGFcblx0Ly8gcmVhbCBDaGF0Vmlld01vZGVsICsgQ2hhdExpc3RXaWRnZXQgXHUyMDE0IHRoZSBzYW1lIGNvbXBvbmVudHMgdXNlZCBpbiBwcm9kdWN0aW9uLlxuXHQvLyBUaGUgdHVybiBjaGFuZ2VzIHN1bW1hcnkgb25seSByZW5kZXJzIGZvciBhZ2VudCBob3N0IHNlc3Npb25zLCB3aG9zZSBmcm9udGVuZFxuXHQvLyByZXNvdXJjZSB1c2VzIHRoZSBzZXNzaW9uIHR5cGUgYXMgdGhlIHNjaGVtZSAoZS5nLiBgYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9cdTIwMjZgKSxcblx0Ly8gd2hpY2ggaXMgd2hhdCBgZ2V0Q2hhdFNlc3Npb25UeXBlYCAvIGB0b0FnZW50SG9zdEJhY2tlbmRTZXNzaW9uVXJpYCByZWNvZ25pemUuXG5cdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IG5lZWRzVHVyblBpbGxzXG5cdFx0PyBVUkkuZnJvbSh7IHNjaGVtZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgcGF0aDogJy90dXJuLXBpbGxzLXNlc3Npb24nIH0pXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IGNoYXRTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDaGF0U2VydmljZSkgYXMgTW9ja0NoYXRTZXJ2aWNlO1xuXHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q2hhdE1vZGVsLFxuXHRcdHVuZGVmaW5lZCxcblx0XHR7IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY2FuVXNlVG9vbHM6IHRydWUsIHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UgfVxuXHQpKTtcblx0Y2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2RlbCk7XG5cblx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIG9wdGlvbnMubWVzc2FnZXMpIHtcblx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWwuYWRkUmVxdWVzdChtYWtlVXNlck1lc3NhZ2UobWVzc2FnZS51c2VyKSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZSE7XG5cdFx0aWYgKG1lc3NhZ2UuZmlsZUNoYW5nZXMpIHtcblx0XHRcdGNvbnN0IGZpbGVFZGl0cyA9IG1lc3NhZ2UuZmlsZUNoYW5nZXMubWFwKG1ha2VGaWxlRGlmZik7XG5cdFx0XHRyZXF1ZXN0RGlmZnMuc2V0KHJlcXVlc3QuaWQsIGZpbGVFZGl0cy5maWx0ZXIoZGlmZiA9PiAhZGlmZi5pc091dHNpZGVXb3Jrc3BhY2UpKTtcblx0XHRcdHJlcXVlc3RGaWxlRWRpdHMuc2V0KHJlcXVlc3QuaWQsIGZpbGVFZGl0cyk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcGFydCBvZiBtZXNzYWdlLmFzc2lzdGFudCA/PyBbXSkge1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ21hcmtkb3duJykge1xuXHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhwYXJ0LnRleHQpIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdwcm9ncmVzcycpIHtcblx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcocGFydC50ZXh0KSB9KTtcblx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAnZWxpY2l0YXRpb24nKSB7XG5cdFx0XHRcdGNvbnN0IGVsaWNpdGF0aW9uID0gbmV3IENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0KFxuXHRcdFx0XHRcdHBhcnQudGl0bGUsXG5cdFx0XHRcdFx0cGFydC5tZXNzYWdlLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCdDb250aW51ZScsXG5cdFx0XHRcdFx0J0NhbmNlbCcsXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4gRWxpY2l0YXRpb25TdGF0ZS5BY2NlcHRlZCxcblx0XHRcdFx0XHRhc3luYyAoKSA9PiBFbGljaXRhdGlvblN0YXRlLlJlamVjdGVkLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBhcnQucmlza0Fzc2Vzc21lbnQgfHwgcGFydC5yaXNrTG9hZGluZyA/IHsgdG9vbElkOiBmaXh0dXJlVG9vbERhdGEuaWQsIHBhcmFtZXRlcnM6IHVuZGVmaW5lZCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIGVsaWNpdGF0aW9uKTtcblx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAndGVybWluYWxDb25maXJtYXRpb24nKSB7XG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gcGFydC50aXRsZSA/PyBgUnVuIHB3c2ggY29tbWFuZD9gO1xuXHRcdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IG5ldyBDaGF0VG9vbEludm9jYXRpb24oXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgUnVubmluZyBcXGAke3BhcnQuY29tbWFuZH1cXGBgKSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgUmFuIFxcYCR7cGFydC5jb21tYW5kfVxcYGApLFxuXHRcdFx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGUsIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgXFxgJHtwYXJ0LmNvbW1hbmR9XFxgYCksIGRpc2NsYWltZXI6IHBhcnQuZGlzY2xhaW1lciA/IG5ldyBNYXJrZG93blN0cmluZyhwYXJ0LmRpc2NsYWltZXIsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSkgOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6IHBhcnQuY29tbWFuZCB9LFxuXHRcdFx0XHRcdFx0XHRsYW5ndWFnZTogJ3B3c2gnLFxuXHRcdFx0XHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHBhcnQucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLFxuXHRcdFx0XHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246IHBhcnQucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLFxuXHRcdFx0XHRcdFx0XHRjb25maXJtYXRpb246IHBhcnQuY29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGZpeHR1cmVUb29sRGF0YSxcblx0XHRcdFx0XHRnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0eyBjb21tYW5kOiBwYXJ0LmNvbW1hbmQgfSxcblx0XHRcdFx0KTtcblx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB0b29sSW52b2NhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChtZXNzYWdlLmRldGFpbHMpIHtcblx0XHRcdHJlc3BvbnNlLnNldFJlc3VsdCh7IGRldGFpbHM6IG1lc3NhZ2UuZGV0YWlscyB9KTtcblx0XHR9XG5cdFx0aWYgKG1lc3NhZ2UucmVzcG9uc2VDb21wbGV0ZSAhPT0gZmFsc2UpIHtcblx0XHRcdHJlc3BvbnNlLmNvbXBsZXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgdmlld01vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Vmlld01vZGVsLCBtb2RlbCwgdW5kZWZpbmVkKSk7XG5cblx0Y29uc3Qgd2lkdGggPSBvcHRpb25zLndpZHRoID8/IDcyMDtcblx0Y29uc3QgaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQgPz8gNjAwO1xuXHRjb25zdCBsaXN0QmFja2dyb3VuZCA9ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJztcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtc2lkZUJhci1iYWNrZ3JvdW5kLCB2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpKSc7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28td29ya2JlbmNoJyk7XG5cblx0Ly8gTWlycm9yIHRoZSBwcm9kdWN0IERPTSBhbmNlc3RyeTogdGhlIGNoYXQgd2lkZ2V0IGxpdmVzIGluc2lkZVxuXHQvLyBgLnBhcnQuYXV4aWxpYXJ5YmFyID4gLmNvbnRlbnRgLCB3aGVyZSBhdXhpbGlhcnlCYXJQYXJ0LmNzcyByZWNvbG9yc1xuXHQvLyBpbmxpbmUgZWRpdG9ycyB3aXRoIGAtLXZzY29kZS1zaWRlQmFyLWJhY2tncm91bmRgICh1c2VkIGJ5IHRoZSBjYXJvdXNlbCkuXG5cdGNvbnN0IGF1eEJhciA9IGRvbS4kKCcucGFydC5hdXhpbGlhcnliYXInKTtcblx0YXV4QmFyLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRhdXhCYXIuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRjb25zdCBhdXhDb250ZW50ID0gZG9tLiQoJy5jb250ZW50Jyk7XG5cdGF1eENvbnRlbnQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdGF1eENvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRhdXhCYXIuYXBwZW5kQ2hpbGQoYXV4Q29udGVudCk7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChhdXhCYXIpO1xuXG5cdGNvbnN0IHNlc3Npb24gPSBkb20uJCgnLmludGVyYWN0aXZlLXNlc3Npb24nKTtcblx0c2Vzc2lvbi5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtY2hhdC1saXN0LWJhY2tncm91bmQnLCBsaXN0QmFja2dyb3VuZCk7XG5cdGF1eENvbnRlbnQuYXBwZW5kQ2hpbGQoc2Vzc2lvbik7XG5cblx0Ly8gQnVpbGQgdGhlIGlucHV0IHBhcnQgRklSU1Qgc28gdGhlIHdpZGdldCAod2l0aCBpdHMgaW5wdXRQYXJ0KSBpcyByZWdpc3RlcmVkXG5cdC8vIGluIElDaGF0V2lkZ2V0U2VydmljZSBiZWZvcmUgdGhlIGxpc3Qgd2lkZ2V0IHJlbmRlcnMuIFRoZSByZW5kZXJlciBxdWVyaWVzXG5cdC8vIHRoZSBzZXJ2aWNlIHN5bmNocm9ub3VzbHkgd2hlbiByb3V0aW5nIHRvb2wgY29uZmlybWF0aW9ucyB0byB0aGUgY2Fyb3VzZWwuXG5cdC8vIEluIHByb2R1Y3Rpb24gYSBjaGF0IHdpZGdldCBhbHdheXMgaGFzIGFuIGlucHV0UGFydCwgc28gdGhlIGZpeHR1cmUgY3JlYXRlc1xuXHQvLyBvbmUgdW5jb25kaXRpb25hbGx5OyBgd2l0aElucHV0YCBvbmx5IGNvbnRyb2xzIHdoZXRoZXIgaXQgaXMgcmVuZGVyZWQgaW4gRE9NLlxuXHRjb25zdCBtZW51U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTWVudVNlcnZpY2UpIGFzIEZpeHR1cmVNZW51U2VydmljZTtcblx0bWVudVNlcnZpY2UuYWRkSXRlbShNZW51SWQuQ2hhdElucHV0LCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoQ29udGV4dCcsIHRpdGxlOiAnKycsIGljb246IENvZGljb24uYWRkIH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAtMSB9KTtcblx0bWVudVNlcnZpY2UuYWRkSXRlbShNZW51SWQuQ2hhdElucHV0LCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVQaWNrZXInLCB0aXRsZTogJ0FnZW50JyB9LCBncm91cDogJ25hdmlnYXRpb24nLCBvcmRlcjogMSB9KTtcblx0bWVudVNlcnZpY2UuYWRkSXRlbShNZW51SWQuQ2hhdElucHV0LCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVsUGlja2VyJywgdGl0bGU6ICdHUFQtNS4zLUNvZGV4JyB9LCBncm91cDogJ25hdmlnYXRpb24nLCBvcmRlcjogMyB9KTtcblx0bWVudVNlcnZpY2UuYWRkSXRlbShNZW51SWQuQ2hhdElucHV0LCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY29uZmlndXJlVG9vbHMnLCB0aXRsZTogJycsIGljb246IENvZGljb24uc2V0dGluZ3NHZWFyIH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAxMDAgfSk7XG5cdG1lbnVTZXJ2aWNlLmFkZEl0ZW0oTWVudUlkLkNoYXRFeGVjdXRlLCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3VibWl0JywgdGl0bGU6ICdTZW5kJywgaWNvbjogQ29kaWNvbi5uZXdMaW5lIH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiA0IH0pO1xuXHRtZW51U2VydmljZS5hZGRJdGVtKE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksIHsgY29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuU2Vzc2lvblRhcmdldFBpY2tlcicsIHRpdGxlOiAnTG9jYWwnIH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAwIH0pO1xuXHRtZW51U2VydmljZS5hZGRJdGVtKE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksIHsgY29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuUGVybWlzc2lvblBpY2tlcicsIHRpdGxlOiAnRGVmYXVsdCBQZXJtaXNzaW9ucycgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDEwIH0pO1xuXHRpZiAob3B0aW9ucy5yZXNwb25zZUZvb3RlckFjdGlvbikge1xuXHRcdG1lbnVTZXJ2aWNlLmFkZEl0ZW0oTWVudUlkLkNoYXRNZXNzYWdlRm9vdGVyLCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY29weVJlc3BvbnNlJywgdGl0bGU6ICdDb3B5JywgaWNvbjogQ29kaWNvbi5jb3B5IH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAxIH0pO1xuXHR9XG5cblx0Y29uc3QgaW5wdXRPcHRpb25zOiBJQ2hhdElucHV0UGFydE9wdGlvbnMgPSB7XG5cdFx0cmVuZGVyRm9sbG93dXBzOiBmYWxzZSxcblx0XHRyZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0OiBmYWxzZSxcblx0XHRyZW5kZXJXb3JraW5nU2V0OiBmYWxzZSxcblx0XHRtZW51czogeyBleGVjdXRlVG9vbGJhcjogTWVudUlkLkNoYXRFeGVjdXRlLCB0ZWxlbWV0cnlTb3VyY2U6ICdmaXh0dXJlJyB9LFxuXHRcdHdpZGdldFZpZXdLaW5kVGFnOiAndmlldycsXG5cdFx0aW5wdXRFZGl0b3JNaW5MaW5lczogMixcblx0fTtcblx0Y29uc3QgaW5wdXRTdHlsZXM6IElDaGF0SW5wdXRTdHlsZXMgPSB7XG5cdFx0b3ZlcmxheUJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJyxcblx0XHRsaXN0Rm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKScsXG5cdFx0bGlzdEJhY2tncm91bmQsXG5cdH07XG5cblx0Y29uc3QgaW5wdXRQYXJ0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRQYXJ0LCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBpbnB1dE9wdGlvbnMsIGlucHV0U3R5bGVzLCBmYWxzZSkpO1xuXG5cdGNvbnN0IGZpeHR1cmVXaWRnZXQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0PigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVZpZXdNb2RlbCA9IG5ldyBFbWl0dGVyPG5ldmVyPigpLmV2ZW50O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHZpZXdNb2RlbCA9IHZpZXdNb2RlbDtcblx0XHRvdmVycmlkZSByZWFkb25seSBjb250cmlicyA9IFtdO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxvY2F0aW9uID0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdDtcblx0XHRvdmVycmlkZSByZWFkb25seSB2aWV3Q29udGV4dCA9IHt9O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlucHV0UGFydCA9IGlucHV0UGFydDtcblx0fSgpO1xuXHR3aWRnZXRIb2xkZXIuY3VycmVudCA9IGZpeHR1cmVXaWRnZXQ7XG5cblx0aW5wdXRQYXJ0LnJlbmRlcihzZXNzaW9uLCAnJywgZml4dHVyZVdpZGdldCk7XG5cdGlucHV0UGFydC5sYXlvdXQod2lkdGgpO1xuXG5cdG9wdGlvbnMuZGVjb3JhdGVJbnB1dFBhcnQ/LihpbnB1dFBhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0aW5wdXRQYXJ0LmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1pbnB1dC1oaWRkZW4nLCBvcHRpb25zLmlucHV0VmlzaWJsZSA9PT0gZmFsc2UpO1xuXG5cdGNvbnN0IGxpc3RDb250YWluZXIgPSBkb20uJCgnLmludGVyYWN0aXZlLWxpc3QnKTtcblx0bGlzdENvbnRhaW5lci5zdHlsZS5mbGV4ID0gb3B0aW9ucy5ob3N0TGF5b3V0TW9kZSA/ICcwIDAgYXV0bycgOiAnMSAxIGF1dG8nO1xuXHRsaXN0Q29udGFpbmVyLnN0eWxlLm1pbkhlaWdodCA9ICcwJztcblx0bGlzdENvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdC8vIFByZXBlbmQgdGhlIGxpc3QgYmVmb3JlIHRoZSBpbnB1dCBzbyB0aGUgdmlzdWFsIG9yZGVyIG1hdGNoZXMgcHJvZHVjdGlvbi5cblx0c2Vzc2lvbi5pbnNlcnRCZWZvcmUobGlzdENvbnRhaW5lciwgc2Vzc2lvbi5maXJzdENoaWxkKTtcblxuXHRjb25zdCBsaXN0V2lkZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRDaGF0TGlzdFdpZGdldCxcblx0XHRsaXN0Q29udGFpbmVyLFxuXHRcdHtcblx0XHRcdGN1cnJlbnRDaGF0TW9kZTogKCkgPT4gQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0ZGVmYXVsdEVsZW1lbnRIZWlnaHQ6IDEyMCxcblx0XHRcdHN0eWxlczoge1xuXHRcdFx0XHRsaXN0Rm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKScsXG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0fSxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0cmVuZGVyZXJPcHRpb25zOiB7XG5cdFx0XHRcdHByb2dyZXNzTWVzc2FnZUF0Qm90dG9tT2ZSZXNwb25zZTogbW9kZSA9PiBtb2RlICE9PSBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0fSxcblx0XHR9LFxuXHQpKTtcblxuXHRsaXN0V2lkZ2V0LnNldFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRsaXN0V2lkZ2V0LnNldFZpc2libGUodHJ1ZSk7XG5cdGxpc3RXaWRnZXQucmVmcmVzaCgpO1xuXG5cdGNvbnN0IGxpc3RIZWlnaHQgPSBvcHRpb25zLmxpc3RIZWlnaHQgPz8gNDIwO1xuXHRsaXN0V2lkZ2V0LmxheW91dChsaXN0SGVpZ2h0LCB3aWR0aCk7XG5cdGxpc3RXaWRnZXQuc2Nyb2xsVG9wID0gMDtcblxuXHRpZiAob3B0aW9ucy5ob3N0TGF5b3V0TW9kZSAmJiBvcHRpb25zLmhvc3RMYXlvdXRNb2RlICE9PSAnbm9uZScpIHtcblx0XHRsZXQgbGF5b3V0aW5nID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dEhlaWdodCA9IGlucHV0UGFydC5oZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGxheW91dGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxheW91dGluZyA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5ob3N0TGF5b3V0TW9kZSA9PT0gJ3N0YWNrZWRGdWxsJykge1xuXHRcdFx0XHRcdC8vIE1pcnJvcnMgQ2hhdFZpZXdQYW5lJ3Mgc3RhY2tlZC1zZXNzaW9ucyBjb252ZXJnZW5jZSBwYXRoOlxuXHRcdFx0XHRcdC8vIHRoZSBob3N0IHN5bmNocm9ub3VzbHkgbGF5cyBvdXQgdGhlIGlucHV0IGFnYWluLlxuXHRcdFx0XHRcdGlucHV0UGFydC5zZXRNYXhIZWlnaHQoTWF0aC5tYXgoMCwgaGVpZ2h0IC0gNTApKTtcblx0XHRcdFx0XHRpbnB1dFBhcnQubGF5b3V0KHdpZHRoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRIZWlnaHQgPSBvcHRpb25zLmhvc3RMYXlvdXRNb2RlID09PSAnc3RhY2tlZEZ1bGwnIHx8IG9wdGlvbnMuaG9zdExheW91dE1vZGUgPT09ICdzdGFja2VkVGFyZ2V0ZWQnXG5cdFx0XHRcdFx0PyBNYXRoLm1heCgwLCBNYXRoLm1heCgxMTYsIGlucHV0SGVpZ2h0KSAtIGlucHV0SGVpZ2h0KVxuXHRcdFx0XHRcdDogTWF0aC5tYXgoMCwgaGVpZ2h0IC0gaW5wdXRIZWlnaHQpO1xuXHRcdFx0XHRsaXN0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2NvbnRlbnRIZWlnaHR9cHhgO1xuXHRcdFx0XHRsaXN0Q29udGFpbmVyLmRhdGFzZXRbJ2V4cGVjdGVkSGVpZ2h0J10gPSBTdHJpbmcoY29udGVudEhlaWdodCk7XG5cdFx0XHRcdGxpc3RXaWRnZXQubGF5b3V0KGNvbnRlbnRIZWlnaHQsIHdpZHRoKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGxheW91dGluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG9wdGlvbnMub25SZW5kZXJlZD8uKHtcblx0XHRpbnB1dFBhcnQsXG5cdFx0bGlzdFdpZGdldCxcblx0XHRtb2RlbCxcblx0XHR3aWR0aCxcblx0XHRhZGRUZXJtaW5hbENvbmZpcm1hdGlvbjogKHJlcXVlc3QsIGNvbW1hbmQpID0+IHtcblx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgbmV3IENoYXRUb29sSW52b2NhdGlvbihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYFJ1bm5pbmcgXFxgJHtjb21tYW5kfVxcYGApLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgUmFuIFxcYCR7Y29tbWFuZH1cXGBgKSxcblx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ1J1biBkaWFnbm9zdGljIGNvbW1hbmQ/JywgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGBcXGAke2NvbW1hbmR9XFxgYCkgfSxcblx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6IGNvbW1hbmQgfSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHdzaCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Zml4dHVyZVRvb2xEYXRhLFxuXHRcdFx0XHRnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7IGNvbW1hbmQgfSxcblx0XHRcdCkpO1xuXHRcdH0sXG5cdH0pO1xufVxuXG5jb25zdCBTSU1QTEVfUUE6IElGaXh0dXJlTWVzc2FnZVtdID0gW1xuXHR7XG5cdFx0dXNlcjogJ0FkZCBhIGZpYm9uYWNjaSBmdW5jdGlvbiB0byBmaWJvbi50cycsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bicsIHRleHQ6ICdJIGFkZGVkIGEgcmVjdXJzaXZlIGBmaWJvbmFjY2kobilgIHRvIGBmaWJvbi50c2AuIE5vdGUgdGhhdCByZWN1cnNpb24gaXMgZXhwb25lbnRpYWwgXHUyMDE0IGZvciBsYXJnZSBgbmAgY29uc2lkZXIgYW4gaXRlcmF0aXZlIHZlcnNpb24uJyB9LFxuXHRcdF0sXG5cdH0sXG5dO1xuXG5jb25zdCBTQ1JPTExfVE9fQk9UVE9NX0FDVElPTjogSUZpeHR1cmVNZXNzYWdlW10gPSBbXG5cdHtcblx0XHR1c2VyOiBbXG5cdFx0XHQnUGxlYXNlIGludmVzdGlnYXRlIHdoeSB0aGUgY2hhdCB0cmFuc2NyaXB0IHNvbWV0aW1lcyBzdG9wcyBmb2xsb3dpbmcgYSBsb25nLXJ1bm5pbmcgYWdlbnQgcmVzcG9uc2UgYWZ0ZXIgSSBzY3JvbGwgdXB3YXJkIHRvIHJldmlldyBhbiBlYXJsaWVyIHN0ZXAuIFRyYWNlIHRoZSBsaXN0IHNjcm9sbCBzdGF0ZSwgdGhlIGxvY2sgdGhhdCBjb250cm9scyBhdXRvbWF0aWMgc2Nyb2xsaW5nLCBhbmQgdGhlIGV2ZW50IHRoYXQgcmV2ZWFscyB0aGUgYWN0aW9uIGZvciByZXR1cm5pbmcgdG8gdGhlIG5ld2VzdCBjb250ZW50LicsXG5cdFx0XHQnU3RhcnQgYnkgcmVwcm9kdWNpbmcgdGhlIGJlaGF2aW9yIHdpdGggYSByZXNwb25zZSB0aGF0IGdyb3dzIG92ZXIgc2V2ZXJhbCB1cGRhdGVzLiBSZWNvcmQgaG93IHRoZSByZW5kZXJlZCBoZWlnaHQsIHNjcm9sbCBoZWlnaHQsIGFuZCBzY3JvbGwgcG9zaXRpb24gY2hhbmdlIHdoZW4gbmV3IG1hcmtkb3duLCBwcm9ncmVzcyBtZXNzYWdlcywgYW5kIHRvb2wgb3V0cHV0IGFycml2ZSB3aGlsZSB0aGUgdHJhbnNjcmlwdCBpcyBib3RoIGxvY2tlZCB0byB0aGUgYm90dG9tIGFuZCBpbnRlbnRpb25hbGx5IHBhdXNlZCBhYm92ZSBpdC4nLFxuXHRcdFx0J1RoZW4gY29tcGFyZSBtb3VzZS13aGVlbCwga2V5Ym9hcmQsIGFuZCBwcm9ncmFtbWF0aWMgc2Nyb2xsaW5nLiBNYWtlIHN1cmUgZWFjaCBwYXRoIHByZXNlcnZlcyB0aGUgdXNlciBkZWNpc2lvbiB0byBzdGF5IGluIHBsYWNlLCBidXQgdGhhdCBzZWxlY3RpbmcgdGhlIHJldHVybiBhY3Rpb24gcmVsaWFibHkgcmVzdG9yZXMgdGhlIGJvdHRvbSBsb2NrIHdpdGhvdXQgY2F1c2luZyB0aGUgZmluYWwgcmVzcG9uc2UgdG8ganVtcCBvciBiZWNvbWUgb2JzY3VyZWQuJyxcblx0XHRcdCdSZXZpZXcgdGhlIGZsb2F0aW5nIGFjdGlvbiBpdHNlbGYgaW4gbGlnaHQgYW5kIGRhcmsgdGhlbWVzLiBJdCBzaG91bGQgcmVtYWluIGxlZ2libGUgb3ZlciB0cmFuc2NyaXB0IGNvbnRlbnQsIHVzZSB0aGUgdHJhbnNjcmlwdCBzdXJmYWNlIGF0IHJlc3QsIHNob3cgdGhlIHNlY29uZGFyeSBhY3Rpb24gdHJlYXRtZW50IG9uIGhvdmVyIGFuZCBmb2N1cywgYW5kIGV4cG9zZSBhIGRlc2NyaXB0aXZlIGxhYmVsIHRvIGtleWJvYXJkIGFuZCBzY3JlZW4gcmVhZGVyIHVzZXJzLicsXG5cdFx0XHQnRmluYWxseSwgYWRkIGZvY3VzZWQgY292ZXJhZ2UgZm9yIHRoZSBzY3JvbGwtc3RhdGUgY2FsY3VsYXRpb24gYW5kIGFuIGlzb2xhdGVkIGNvbXBvbmVudCBmaXh0dXJlIHRoYXQgcmVuZGVycyBlbm91Z2ggcmVhbCBjaGF0IGNvbnRlbnQgdG8gb3ZlcmZsb3cuIFBvc2l0aW9uIHRoZSBsaXN0IGF3YXkgZnJvbSB0aGUgYm90dG9tIHNvIHRoZSBhY3Rpb24gaXMgdmlzaWJsZSBvdmVyIGNvbnRlbnQgYW5kIGZ1dHVyZSB2aXN1YWwgcmVncmVzc2lvbnMgYXJlIGNhdWdodC4nLFxuXHRcdF0uam9pbignXFxuXFxuJyksXG5cdH0sXG5dO1xuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJTY3JvbGxUb0JvdHRvbUFjdGlvbihjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRsZXQgaGFuZGxlOiBJQ2hhdFdpZGdldEZpeHR1cmVIYW5kbGUgfCB1bmRlZmluZWQ7XG5cdGF3YWl0IHJlbmRlckNoYXRXaWRnZXQoY29udGV4dCwge1xuXHRcdG1lc3NhZ2VzOiBTQ1JPTExfVE9fQk9UVE9NX0FDVElPTixcblx0XHRoZWlnaHQ6IDI0MCxcblx0XHRsaXN0SGVpZ2h0OiAyNDAsXG5cdFx0aW5wdXRWaXNpYmxlOiBmYWxzZSxcblx0XHRvblJlbmRlcmVkOiB2YWx1ZSA9PiBoYW5kbGUgPSB2YWx1ZSxcblx0fSk7XG5cblx0aWYgKCFoYW5kbGUpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Njcm9sbC10by1ib3R0b20gZml4dHVyZSBkaWQgbm90IGluaXRpYWxpemUnKTtcblx0fVxuXG5cdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3coY29udGV4dC5jb250YWluZXIpO1xuXHRjb25zdCBuZXh0RnJhbWUgPSAoKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdGF3YWl0IG5leHRGcmFtZSgpO1xuXHRhd2FpdCBuZXh0RnJhbWUoKTtcblxuXHRjb25zdCBtYXhpbXVtU2Nyb2xsVG9wID0gaGFuZGxlLmxpc3RXaWRnZXQuc2Nyb2xsSGVpZ2h0IC0gaGFuZGxlLmxpc3RXaWRnZXQucmVuZGVySGVpZ2h0O1xuXHRpZiAobWF4aW11bVNjcm9sbFRvcCA8PSAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTY3JvbGwtdG8tYm90dG9tIGZpeHR1cmUgY29udGVudCBkb2VzIG5vdCBvdmVyZmxvdycpO1xuXHR9XG5cblx0aGFuZGxlLmxpc3RXaWRnZXQuc2Nyb2xsVG9wID0gbWF4aW11bVNjcm9sbFRvcCAvIDI7XG5cdGF3YWl0IG5leHRGcmFtZSgpO1xuXG5cdGNvbnN0IHNjcm9sbERvd25CdXR0b24gPSBjb250ZXh0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtc2Nyb2xsLWRvd24nKTtcblx0aWYgKCFzY3JvbGxEb3duQnV0dG9uKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTY3JvbGwtdG8tYm90dG9tIGJ1dHRvbiB3YXMgbm90IHJlbmRlcmVkJyk7XG5cdH1cblxuXHRjb25zdCBidXR0b25TdHlsZSA9IHRhcmdldFdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHNjcm9sbERvd25CdXR0b24pO1xuXHRpZiAoYnV0dG9uU3R5bGUuZGlzcGxheSAhPT0gJ2ZsZXgnKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBTY3JvbGwtdG8tYm90dG9tIGJ1dHRvbiBpcyBub3QgdmlzaWJsZTogJHtidXR0b25TdHlsZS5kaXNwbGF5fWApO1xuXHR9XG5cdGlmIChoYW5kbGUubGlzdFdpZGdldC5pc1Njcm9sbGVkVG9Cb3R0b20pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Njcm9sbC10by1ib3R0b20gZml4dHVyZSB1bmV4cGVjdGVkbHkgcmVtYWluZWQgYXQgdGhlIGJvdHRvbScpO1xuXHR9XG5cdGlmICghYnV0dG9uU3R5bGUuYmFja2dyb3VuZENvbG9yIHx8IGJ1dHRvblN0eWxlLmJhY2tncm91bmRDb2xvciA9PT0gJ3RyYW5zcGFyZW50JyB8fCBidXR0b25TdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPT09ICdyZ2JhKDAsIDAsIDAsIDApJykge1xuXHRcdHRocm93IG5ldyBFcnJvcihgU2Nyb2xsLXRvLWJvdHRvbSBidXR0b24gYmFja2dyb3VuZCBpcyB0cmFuc3BhcmVudDogJHtidXR0b25TdHlsZS5iYWNrZ3JvdW5kQ29sb3J9YCk7XG5cdH1cblxuXHRjb25zdCBidXR0b25Cb3VuZHMgPSBzY3JvbGxEb3duQnV0dG9uLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRjb25zdCBjb250ZW50VW5kZXJCdXR0b24gPSBBcnJheS5mcm9tKGNvbnRleHQuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcubW9uYWNvLWxpc3Qtcm93JykpLnNvbWUocm93ID0+IHtcblx0XHRjb25zdCByb3dCb3VuZHMgPSByb3cuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0cmV0dXJuIHJvd0JvdW5kcy5sZWZ0IDwgYnV0dG9uQm91bmRzLnJpZ2h0XG5cdFx0XHQmJiByb3dCb3VuZHMucmlnaHQgPiBidXR0b25Cb3VuZHMubGVmdFxuXHRcdFx0JiYgcm93Qm91bmRzLnRvcCA8IGJ1dHRvbkJvdW5kcy5ib3R0b21cblx0XHRcdCYmIHJvd0JvdW5kcy5ib3R0b20gPiBidXR0b25Cb3VuZHMudG9wO1xuXHR9KTtcblx0aWYgKCFjb250ZW50VW5kZXJCdXR0b24pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Njcm9sbC10by1ib3R0b20gYnV0dG9uIGRvZXMgbm90IG92ZXJsYXkgdHJhbnNjcmlwdCBjb250ZW50Jyk7XG5cdH1cbn1cblxuY29uc3QgTEFTVF9SRVNQT05TRV9IT1ZFUjogSUZpeHR1cmVNZXNzYWdlW10gPSBbXG5cdHtcblx0XHR1c2VyOiAnU3VtbWFyaXplIHRoZSBjaGFuZ2VzJyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHsga2luZDogJ21hcmtkb3duJywgdGV4dDogJ1RoZSByZXNwb25zZSBjb250ZW50IGVuZHMgaGVyZS4nIH0sXG5cdFx0XSxcblx0XHRkZXRhaWxzOiAnQ2xhdWRlIE9wdXMgNC44IC0gMiBjcmVkaXRzJyxcblx0fSxcbl07XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlckxhc3RSZXNwb25zZUhvdmVyKGNvbnRleHQ6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdGF3YWl0IHJlbmRlckNoYXRXaWRnZXQoY29udGV4dCwge1xuXHRcdG1lc3NhZ2VzOiBMQVNUX1JFU1BPTlNFX0hPVkVSLFxuXHRcdGhlaWdodDogNjAwLFxuXHRcdGlucHV0VmlzaWJsZTogZmFsc2UsXG5cdFx0cmVzcG9uc2VGb290ZXJBY3Rpb246IHRydWUsXG5cdH0pO1xuXG5cdGNvbnN0IHJlc3BvbnNlID0gY29udGV4dC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5pbnRlcmFjdGl2ZS1yZXNwb25zZS5jaGF0LW1vc3QtcmVjZW50LXJlc3BvbnNlJyk7XG5cdHJlc3BvbnNlPy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignOnNjb3BlID4gLnZhbHVlJyk/LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZW50ZXInKSk7XG59XG5cbmNvbnN0IEtFWUJPQVJEX0ZPQ1VTOiBJRml4dHVyZU1lc3NhZ2VbXSA9IFtcblx0e1xuXHRcdHVzZXI6ICdTdW1tYXJpemUgdGhlIGNoYW5nZXMnLFxuXHRcdGFzc2lzdGFudDogW1xuXHRcdFx0eyBraW5kOiAnbWFya2Rvd24nLCB0ZXh0OiAnVGhlIGZpcnN0IHJlc3BvbnNlIGhhcyBrZXlib2FyZC1hY2Nlc3NpYmxlIGFjdGlvbnMuJyB9LFxuXHRcdF0sXG5cdFx0ZGV0YWlsczogJ0NsYXVkZSBPcHVzIDQuOCAtIDIgY3JlZGl0cycsXG5cdH0sXG5cdHtcblx0XHR1c2VyOiAnV2hhdCBzaG91bGQgSSBkbyBuZXh0PycsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bicsIHRleHQ6ICdSdW4gdGhlIHRlc3RzIGFuZCByZXZpZXcgdGhlIGRpZmYuJyB9LFxuXHRcdF0sXG5cdFx0ZGV0YWlsczogJ0NsYXVkZSBPcHVzIDQuOCAtIDEgY3JlZGl0Jyxcblx0fSxcbl07XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlcktleWJvYXJkRm9jdXMoY29udGV4dDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIHRhcmdldDogJ3Jlc3BvbnNlLWFjdGlvbicgfCAncmVxdWVzdC10aW1lc3RhbXAnKTogUHJvbWlzZTx2b2lkPiB7XG5cdGF3YWl0IHJlbmRlckNoYXRXaWRnZXQoY29udGV4dCwge1xuXHRcdG1lc3NhZ2VzOiBLRVlCT0FSRF9GT0NVUyxcblx0XHRoZWlnaHQ6IDYwMCxcblx0XHRpbnB1dFZpc2libGU6IGZhbHNlLFxuXHRcdHJlc3BvbnNlRm9vdGVyQWN0aW9uOiB0cnVlLFxuXHRcdHZlcmJvc2U6IHRhcmdldCA9PT0gJ3JlcXVlc3QtdGltZXN0YW1wJyxcblx0fSk7XG5cblx0Y29uc3Qgc2VsZWN0b3IgPSB0YXJnZXQgPT09ICdyZXNwb25zZS1hY3Rpb24nXG5cdFx0PyAnLmludGVyYWN0aXZlLXJlc3BvbnNlOm5vdCguY2hhdC1tb3N0LXJlY2VudC1yZXNwb25zZSkgLmNoYXQtZm9vdGVyLXRvb2xiYXIgLmFjdGlvbi1sYWJlbCdcblx0XHQ6ICcuaW50ZXJhY3RpdmUtcmVxdWVzdCAuY2hhdC1yZXF1ZXN0LXRpbWVzdGFtcCc7XG5cdGNvbnN0IGZvY3VzVGFyZ2V0ID0gY29udGV4dC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oc2VsZWN0b3IpO1xuXHRpZiAoIWZvY3VzVGFyZ2V0KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGtleWJvYXJkIGZvY3VzIHRhcmdldDogJHt0YXJnZXR9YCk7XG5cdH1cblx0Zm9jdXNUYXJnZXQuZm9jdXMoKTtcblx0aWYgKGZvY3VzVGFyZ2V0Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCAhPT0gZm9jdXNUYXJnZXQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmb2N1cyBrZXlib2FyZCB0YXJnZXQ6ICR7dGFyZ2V0fWApO1xuXHR9XG59XG5cbmNvbnN0IFBFTkRJTkdfVE9PTF9BUFBST1ZBTDogSUZpeHR1cmVNZXNzYWdlW10gPSBbXG5cdHtcblx0XHR1c2VyOiAncnVuIGdpdCBpbml0Jyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsQ29uZmlybWF0aW9uJyxcblx0XHRcdFx0Y29tbWFuZDogJ2dpdCBpbml0Jyxcblx0XHRcdFx0cmlza0Fzc2Vzc21lbnQ6IHtcblx0XHRcdFx0XHRyaXNrOiBUb29sUmlza0xldmVsLk9yYW5nZSxcblx0XHRcdFx0XHRleHBsYW5hdGlvbjogJ0luaXRpYWxpemVzIGEgbmV3IEdpdCByZXBvc2l0b3J5IGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeS4gUmV2ZXJzaWJsZSBieSByZW1vdmluZyB0aGUgLmdpdCBmb2xkZXIuJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XSxcblx0XHRyZXNwb25zZUNvbXBsZXRlOiBmYWxzZSxcblx0fSxcbl07XG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMDk3OTZcbmNvbnN0IElTU1VFXzMwOTc5Nl9NSVNTSU5HX0JBQ0tTTEFTSDogSUZpeHR1cmVNZXNzYWdlW10gPSBbXG5cdHtcblx0XHR1c2VyOiAnaW5zdGFsbCBkZXBlbmRlbmNpZXMgaW4gdGhlIHNlcnZlciBkaXJlY3RvcnknLFxuXHRcdGFzc2lzdGFudDogW1xuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAndGVybWluYWxDb25maXJtYXRpb24nLFxuXHRcdFx0XHRjb21tYW5kOiAnY2QgcGFja2FnZXNcXFxcc2VydmVyICYmIG5wbSBpbnN0YWxsJyxcblx0XHRcdFx0dGl0bGU6ICdSdW4gYHB3c2hgIGNvbW1hbmQgd2l0aGluIGBwYWNrYWdlc1xcXFxzZXJ2ZXJgPycsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbjoge1xuXHRcdFx0XHRcdGNvbW1hbmRMaW5lOiAnbnBtIGluc3RhbGwnLFxuXHRcdFx0XHRcdGN3ZExhYmVsOiAncGFja2FnZXNcXFxcc2VydmVyJyxcblx0XHRcdFx0XHRjZFByZWZpeDogJ2NkIHBhY2thZ2VzXFxcXHNlcnZlciAmJiAnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdLFxuXHRcdHJlc3BvbnNlQ29tcGxldGU6IGZhbHNlLFxuXHR9LFxuXTtcblxuY29uc3QgU1RSRUFNSU5HOiBJRml4dHVyZU1lc3NhZ2VbXSA9IFtcblx0e1xuXHRcdHVzZXI6ICdTZWFyY2ggdGhlIHdvcmtzcGFjZSBmb3IgVE9ETyBjb21tZW50cycsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7IGtpbmQ6ICdwcm9ncmVzcycsIHRleHQ6ICdTZWFyY2hpbmcgd29ya3NwYWNlIGZvciBgVE9ET2AgY29tbWVudHMuLi4nIH0sXG5cdFx0XSxcblx0XHRyZXNwb25zZUNvbXBsZXRlOiBmYWxzZSxcblx0fSxcbl07XG5cbmNvbnN0IE1VTFRJX1RVUk46IElGaXh0dXJlTWVzc2FnZVtdID0gW1xuXHR7XG5cdFx0dXNlcjogJ1doYXQgZG9lcyB0aGlzIHByb2plY3QgZG8/Jyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHsga2luZDogJ21hcmtkb3duJywgdGV4dDogJ1RoaXMgcHJvamVjdCBpcyAqKlZpc3VhbCBTdHVkaW8gQ29kZSoqLCBhIGZyZWUgc291cmNlLWNvZGUgZWRpdG9yIG1hZGUgYnkgTWljcm9zb2Z0IGZvciBXaW5kb3dzLCBMaW51eCBhbmQgbWFjT1MuJyB9LFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHR1c2VyOiAnV2hlcmUgaXMgdGhlIGVudHJ5cG9pbnQ/Jyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHsga2luZDogJ21hcmtkb3duJywgdGV4dDogJ1RoZSBkZXNrdG9wIGVudHJ5cG9pbnQgaXMgaW4gYHNyYy92cy9jb2RlL2VsZWN0cm9uLW1haW4vbWFpbi50c2AuIFRoZSBicm93c2VyL3NlcnZlciBlbnRyeXBvaW50cyBsaXZlIHVuZGVyIGBzcmMvdnMvc2VydmVyL2AuJyB9LFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHR1c2VyOiAnVGhhbmtzIScsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bicsIHRleHQ6ICdZb3UgYXJlIHdlbGNvbWUgXHUyMDE0IGxldCBtZSBrbm93IGlmIHlvdSBoYXZlIG1vcmUgcXVlc3Rpb25zLicgfSxcblx0XHRdLFxuXHR9LFxuXTtcblxuLy8gQ29kZSBibG9ja3MgdGhhdCBmb2xsb3cgb3IgYXJlIG5lc3RlZCBpbiBsaXN0IGl0ZW1zIHNob3VsZCBoYXZlIHN5bW1ldHJpYyBzcGFjaW5nXG4vLyBhYm92ZSBhbmQgYmVsb3cuIFRoaXMgYWxzbyBjb3ZlcnMgdGlnaHQgbGlzdHMsIHdoZXJlIHByb3NlIGJlZm9yZSBhIGNvZGUgYmxvY2sgaXMgYVxuLy8gdGV4dCBub2RlIGFuZCB0aGUgY29kZSBibG9jayBpcyB0aGVyZWZvcmUgc3RpbGwgdGhlIGZpcnN0IGVsZW1lbnQgY2hpbGQuXG5jb25zdCBDT0RFX0JMT0NLX0lOX0xJU1Q6IElGaXh0dXJlTWVzc2FnZVtdID0gW1xuXHR7XG5cdFx0dXNlcjogJ1doeSBkbyB0aGUgZmlsZXMgYXBwZWFyIHdoaWxlIGRpZmZzIGZhaWw/Jyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duJywgdGV4dDogW1xuXHRcdFx0XHRcdCcjIyBSb290IGNhdXNlJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnR2l0IGlzIHVudXNhYmxlIG9uIHRoaXMgTWFjIGJlY2F1c2UgdGhlIFhjb2RlIGxpY2Vuc2UgaGFzIG5vdCBiZWVuIGFjY2VwdGVkLiBCb3RoIGBnaXQgLS12ZXJzaW9uYCBhbmQgYC91c3IvYmluL2dpdCAtLXZlcnNpb25gIGN1cnJlbnRseSBleGl0IHdpdGggY29kZSA2OSBhbmQgcmVwb3J0OicsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0Jz4gWW91IGhhdmUgbm90IGFncmVlZCB0byB0aGUgWGNvZGUgbGljZW5zZSBhZ3JlZW1lbnRzLicsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0JyMjIyBXaHkgZmlsZXMgYXBwZWFyIGJ1dCBkaWZmcyBmYWlsJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnMS4gVGhlIHNlc3Npb24gcmVzdG9yZXMvY2FjaGVzIHRoZSBjaGFuZ2Utc2V0IG1ldGFkYXRhLCBzbyBWUyBDb2RlIGNhbiBkaXNwbGF5IHRoZSBmaWxlbmFtZXMgYW5kIGNoYW5nZSBjb3VudHMuJyxcblx0XHRcdFx0XHQnMi4gT3BlbmluZyBhIGRpZmYgcmVxdWlyZXMgbG9hZGluZyBpdHMgb3JpZ2luYWwgc2lkZSB1c2luZyBhIGBnaXQtYmxvYjpgIFVSSS4nLFxuXHRcdFx0XHRcdCczLiBBZ2VudCBIb3N0IGV4ZWN1dGVzIHJvdWdobHk6Jyxcblx0XHRcdFx0XHQnICAgYGBgYmFzaCcsXG5cdFx0XHRcdFx0JyAgIGdpdCBzaG93IDFlMzkzZDdiMzUyZGU3OTI3YTk4ZDAzMjFlNTFhZTYzMDQ2Yzg2NTI6PHBhdGg+Jyxcblx0XHRcdFx0XHQnICAgYGBgJyxcblx0XHRcdFx0XHQnNC4gR2l0IHJlZnVzZXMgdG8gcnVuIGJlY2F1c2Ugb2YgdGhlIFhjb2RlIGxpY2Vuc2UuJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdFx0fSxcblx0XHRdLFxuXHR9LFxuXTtcblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVyUmVzaXplT2JzZXJ2ZXJMb29wSGFybmVzcyhjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgaG9zdExheW91dE1vZGU6IElDaGF0V2lkZ2V0Rml4dHVyZU9wdGlvbnNbJ2hvc3RMYXlvdXRNb2RlJ10pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyhjb250ZXh0LmNvbnRhaW5lcik7XG5cblx0bGV0IGhhbmRsZTogSUNoYXRXaWRnZXRGaXh0dXJlSGFuZGxlIHwgdW5kZWZpbmVkO1xuXHRhd2FpdCByZW5kZXJDaGF0V2lkZ2V0KGNvbnRleHQsIHtcblx0XHRtZXNzYWdlczogW3tcblx0XHRcdHVzZXI6IFtcblx0XHRcdFx0J0ludmVzdGlnYXRlIFJlc2l6ZU9ic2VydmVyIHJlLWVudHJ5LicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnQ29udGV4dCAodGV4dC9wbGFpbjsgbm8gYmluYXJ5IHVwbG9hZCk6Jyxcblx0XHRcdFx0J0lzc3VlICMzMTY1MDEgdHJhY2tzIGNoYXQgbGlzdCBhbmQgaW5wdXQgcmVzaXplLW9ic2VydmVyIGxvb3Agd2FybmluZ3MuJyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRhc3Npc3RhbnQ6IFt7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bicsXG5cdFx0XHRcdHRleHQ6ICdUaGUgbW9ja2VkIGNoYXQgaGFybmVzcyBpcyByZWFkeS4nLFxuXHRcdFx0fV0sXG5cdFx0fV0sXG5cdFx0d2lkdGg6IDcyMCxcblx0XHRoZWlnaHQ6IDYwMCxcblx0XHRob3N0TGF5b3V0TW9kZSxcblx0XHRvblJlbmRlcmVkOiB2YWx1ZSA9PiBoYW5kbGUgPSB2YWx1ZSxcblx0fSk7XG5cblx0aWYgKCFoYW5kbGUpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Jlc2l6ZU9ic2VydmVyIGhhcm5lc3MgZGlkIG5vdCBpbml0aWFsaXplJyk7XG5cdH1cblx0Y29uc3QgZml4dHVyZUhhbmRsZSA9IGhhbmRsZTtcblxuXHRjb25zdCBjb250cm9scyA9IGRvbS4kKCcucmVzaXplLW9ic2VydmVyLWxvb3AtaGFybmVzcycpO1xuXHRjb25zdCBydW5CdXR0b24gPSBkb20uYXBwZW5kKGNvbnRyb2xzLCBkb20uJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5yZXNpemUtb2JzZXJ2ZXItbG9vcC1ydW4nKSk7XG5cdHJ1bkJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG5cdHJ1bkJ1dHRvbi50ZXh0Q29udGVudCA9ICdSdW4gMjAtdHVybiBidXJzdCc7XG5cdGNvbnN0IHN0YXR1cyA9IGRvbS5hcHBlbmQoY29udHJvbHMsIGRvbS4kKCdzcGFuLnJlc2l6ZS1vYnNlcnZlci1sb29wLXN0YXR1cycpKTtcblx0c3RhdHVzLnJvbGUgPSAnc3RhdHVzJztcblx0c3RhdHVzLnRleHRDb250ZW50ID0gJ1JlYWR5Jztcblx0Y29uc3Qgd2FybmluZ3MgPSBkb20uYXBwZW5kKGNvbnRyb2xzLCBkb20uJCgnc3Bhbi5yZXNpemUtb2JzZXJ2ZXItbG9vcC13YXJuaW5ncycpKTtcblx0d2FybmluZ3MudGV4dENvbnRlbnQgPSAnV2FybmluZ3M6IDAnO1xuXHRjb250cm9scy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdGNvbnRyb2xzLnN0eWxlLnRvcCA9ICc4cHgnO1xuXHRjb250cm9scy5zdHlsZS5yaWdodCA9ICc4cHgnO1xuXHRjb250cm9scy5zdHlsZS56SW5kZXggPSAnMTAwJztcblx0Y29udHJvbHMuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0Y29udHJvbHMuc3R5bGUuZ2FwID0gJzhweCc7XG5cdGNvbnRyb2xzLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcblx0Y29udHJvbHMuc3R5bGUucGFkZGluZyA9ICc2cHggOHB4Jztcblx0Y29udHJvbHMuc3R5bGUuYmFja2dyb3VuZCA9ICd2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJhY2tncm91bmQpJztcblx0Y29udHJvbHMuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtd2lkZ2V0LWJvcmRlciknO1xuXHRjb250ZXh0LmNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdGNvbnRleHQuY29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRyb2xzKTtcblxuXHRsZXQgd2FybmluZ0NvdW50ID0gMDtcblx0Y29udGV4dC5kaXNwb3NhYmxlU3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBkb20uRXZlbnRUeXBlLkVSUk9SLCBldmVudCA9PiB7XG5cdFx0aWYgKGV2ZW50IGluc3RhbmNlb2YgRXJyb3JFdmVudCAmJiBldmVudC5tZXNzYWdlLmluY2x1ZGVzKCdSZXNpemVPYnNlcnZlciBsb29wJykpIHtcblx0XHRcdHdhcm5pbmdDb3VudCsrO1xuXHRcdFx0d2FybmluZ3MudGV4dENvbnRlbnQgPSBgV2FybmluZ3M6ICR7d2FybmluZ0NvdW50fWA7XG5cdFx0XHR3YXJuaW5ncy5kYXRhc2V0WydvYnNlcnZlckNvbnRleHQnXSA9IGRvbS5nZXRSZWNlbnREaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXJDb250ZXh0Rm9yTG9vcEVycm9yKGV2ZW50Lm1lc3NhZ2UsIHRhcmdldFdpbmRvdykgPz8gZXZlbnQubWVzc2FnZTtcblx0XHRcdHN0YXR1cy50ZXh0Q29udGVudCA9ICdDYXB0dXJlZCBSZXNpemVPYnNlcnZlciB3YXJuaW5nJztcblx0XHR9XG5cdH0pKTtcblxuXHRjb25zdCBuZXh0RnJhbWUgPSAoKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdGNvbnN0IHJ1bkJ1cnN0ID0gYXN5bmMgKCkgPT4ge1xuXHRcdHJ1bkJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG5cdFx0c3RhdHVzLnRleHRDb250ZW50ID0gJ0FkZGluZyBxdWV1ZWQgdHVybnMuLi4nO1xuXHRcdGNvbnN0IHJlc3BvbnNlcyA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaW5kZXggPSAxOyBpbmRleCA8PSAyMDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgcHJvbXB0ID0gW1xuXHRcdFx0XHRgUXVldWVkIHByb21wdCAke2luZGV4fWAsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnQ29udGV4dCAodGV4dC9wbGFpbjsgbm8gYmluYXJ5IHVwbG9hZCk6Jyxcblx0XHRcdFx0Li4uQXJyYXkuZnJvbSh7IGxlbmd0aDogMTIgfSwgKF8sIGxpbmUpID0+IGBSZXNpemUgc3RyZXNzIHNhbXBsZSAke2luZGV4fS4ke2xpbmUgKyAxfTogJHsnbGF5b3V0ICcucmVwZWF0KGluZGV4ICUgNSArIDEpfWApLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Zml4dHVyZUhhbmRsZS5pbnB1dFBhcnQuc2V0VmFsdWUocHJvbXB0LCB0cnVlKTtcblx0XHRcdGZpeHR1cmVIYW5kbGUuaW5wdXRQYXJ0LmxheW91dChmaXh0dXJlSGFuZGxlLndpZHRoKTtcblxuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGZpeHR1cmVIYW5kbGUubW9kZWwuYWRkUmVxdWVzdChtYWtlVXNlck1lc3NhZ2UocHJvbXB0KSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdFx0Zml4dHVyZUhhbmRsZS5tb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdFx0a2luZDogJ3Byb2dyZXNzTWVzc2FnZScsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhgUHJvY2Vzc2luZyBxdWV1ZWQgcHJvbXB0ICR7aW5kZXh9Li4uYCksXG5cdFx0XHR9KTtcblx0XHRcdGlmIChpbmRleCA9PT0gMSkge1xuXHRcdFx0XHRmaXh0dXJlSGFuZGxlLmFkZFRlcm1pbmFsQ29uZmlybWF0aW9uKHJlcXVlc3QsICdnaXQgc3RhdHVzIC0tc2hvcnQnKTtcblx0XHRcdH1cblx0XHRcdHJlc3BvbnNlcy5wdXNoKHJlcXVlc3QucmVzcG9uc2UhKTtcblxuXHRcdFx0Zml4dHVyZUhhbmRsZS5saXN0V2lkZ2V0LnJlZnJlc2goKTtcblx0XHRcdGF3YWl0IG5leHRGcmFtZSgpO1xuXG5cdFx0XHRmaXh0dXJlSGFuZGxlLmlucHV0UGFydC5zZXRWYWx1ZSgnJywgdHJ1ZSk7XG5cdFx0XHRmaXh0dXJlSGFuZGxlLmlucHV0UGFydC5sYXlvdXQoZml4dHVyZUhhbmRsZS53aWR0aCk7XG5cdFx0XHRmaXh0dXJlSGFuZGxlLm1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwge1xuXHRcdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGBNb2NrIHN0cmVhbWVkIG91dHB1dCAke2luZGV4fVxcblxcbiR7Jy0gcmVzcG9uc2UgbGluZVxcbicucmVwZWF0KGluZGV4ICUgNyArIDEpfWApLFxuXHRcdFx0fSk7XG5cdFx0XHRmaXh0dXJlSGFuZGxlLmxpc3RXaWRnZXQucmVmcmVzaCgpO1xuXHRcdFx0YXdhaXQgbmV4dEZyYW1lKCk7XG5cdFx0fVxuXG5cdFx0c3RhdHVzLnRleHRDb250ZW50ID0gJ0NvbXBsZXRpbmcgbW9ja2VkIHJlc3BvbnNlcy4uLic7XG5cdFx0Zm9yIChjb25zdCByZXNwb25zZSBvZiByZXNwb25zZXMpIHtcblx0XHRcdHJlc3BvbnNlLmNvbXBsZXRlKCk7XG5cdFx0XHRmaXh0dXJlSGFuZGxlLmxpc3RXaWRnZXQucmVmcmVzaCgpO1xuXHRcdFx0YXdhaXQgbmV4dEZyYW1lKCk7XG5cdFx0fVxuXG5cdFx0c3RhdHVzLnRleHRDb250ZW50ID0gd2FybmluZ0NvdW50ID4gMFxuXHRcdFx0PyAnQ29tcGxldGVkIHdpdGggUmVzaXplT2JzZXJ2ZXIgd2FybmluZydcblx0XHRcdDogJ0NvbXBsZXRlZCB3aXRob3V0IHdhcm5pbmcnO1xuXHRcdHJ1bkJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuXHR9O1xuXG5cdGNvbnRleHQuZGlzcG9zYWJsZVN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJ1bkJ1dHRvbiwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdHZvaWQgcnVuQnVyc3QoKTtcblx0fSkpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnY2hhdC93aWRnZXQvJyB9LCB7XG5cdFNpbXBsZVFBOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhdFdpZGdldChjdHgsIHsgbWVzc2FnZXM6IFNJTVBMRV9RQSB9KSB9KSxcblx0U2Nyb2xsVG9Cb3R0b21BY3Rpb246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlclNjcm9sbFRvQm90dG9tQWN0aW9uIH0pLFxuXHRTdHJlYW1pbmc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyBsYWJlbHM6IHsga2luZDogJ2FuaW1hdGVkJyB9LCByZW5kZXI6IGN0eCA9PiByZW5kZXJDaGF0V2lkZ2V0KGN0eCwgeyBtZXNzYWdlczogU1RSRUFNSU5HIH0pIH0pLFxuXHRQZW5kaW5nVG9vbEFwcHJvdmFsOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhdFdpZGdldChjdHgsIHsgbWVzc2FnZXM6IFBFTkRJTkdfVE9PTF9BUFBST1ZBTCB9KSB9KSxcblx0UmVzaXplT2JzZXJ2ZXJMb29wSGFybmVzczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdhbmltYXRlZCcgfSxcblx0XHR2aXJ0dWFsVGltZTogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJSZXNpemVPYnNlcnZlckxvb3BIYXJuZXNzKGNvbnRleHQsICdzdGFja2VkRnVsbCcpLFxuXHR9KSxcblx0UmVzaXplT2JzZXJ2ZXJMb29wTGlzdE9ubHk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnYW5pbWF0ZWQnIH0sXG5cdFx0dmlydHVhbFRpbWU6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyUmVzaXplT2JzZXJ2ZXJMb29wSGFybmVzcyhjb250ZXh0LCAnbGlzdE9ubHknKSxcblx0fSksXG5cdFJlc2l6ZU9ic2VydmVyTG9vcFN0YWNrZWRUYXJnZXRlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdhbmltYXRlZCcgfSxcblx0XHR2aXJ0dWFsVGltZTogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJSZXNpemVPYnNlcnZlckxvb3BIYXJuZXNzKGNvbnRleHQsICdzdGFja2VkVGFyZ2V0ZWQnKSxcblx0fSksXG5cdFJlc2l6ZU9ic2VydmVyTG9vcE5vSG9zdExheW91dDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdhbmltYXRlZCcgfSxcblx0XHR2aXJ0dWFsVGltZTogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJSZXNpemVPYnNlcnZlckxvb3BIYXJuZXNzKGNvbnRleHQsICdub25lJyksXG5cdH0pLFxuXHRDb2RlQmxvY2tJbkxpc3Q6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IGN0eCA9PiByZW5kZXJDaGF0V2lkZ2V0KGN0eCwgeyBtZXNzYWdlczogQ09ERV9CTE9DS19JTl9MSVNUIH0pIH0pLFxuXHRidWdzOiBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoe1xuXHRcdCdpc3N1ZS0zMDk3OTYtbWlzc2luZy1iYWNrc2xhc2gnOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhdFdpZGdldChjdHgsIHsgbWVzc2FnZXM6IElTU1VFXzMwOTc5Nl9NSVNTSU5HX0JBQ0tTTEFTSCB9KSB9KSxcblx0fSksXG5cdE11bHRpVHVybjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogY3R4ID0+IHJlbmRlckNoYXRXaWRnZXQoY3R4LCB7IG1lc3NhZ2VzOiBNVUxUSV9UVVJOIH0pIH0pLFxuXHRMYXN0UmVzcG9uc2VDb250ZW50SG92ZXI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlckxhc3RSZXNwb25zZUhvdmVyIH0pLFxuXHRSZXNwb25zZUFjdGlvbktleWJvYXJkRm9jdXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IGN0eCA9PiByZW5kZXJLZXlib2FyZEZvY3VzKGN0eCwgJ3Jlc3BvbnNlLWFjdGlvbicpIH0pLFxuXHRSZXF1ZXN0VGltZXN0YW1wS2V5Ym9hcmRGb2N1czogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogY3R4ID0+IHJlbmRlcktleWJvYXJkRm9jdXMoY3R4LCAncmVxdWVzdC10aW1lc3RhbXAnKSB9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsY0FBYyxjQUFjO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQThEO0FBRXZFLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLGtCQUFrQixvQkFBb0I7QUFDL0MsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBdUMsc0JB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LEVBQUUsQ0FBQztBQUFBLEVBQ3pILDJCQUEyQix1QkFBdUI7QUFBQSxJQUNqRCxRQUFRLEVBQUUsTUFBTSxXQUFXO0FBQUEsSUFDM0IsYUFBYSxFQUFFLFNBQVMsTUFBTTtBQUFBLElBQzlCLFFBQVEsYUFBVyxnQ0FBZ0MsU0FBUyxhQUFhO0FBQUEsRUFDMUUsQ0FBQztBQUFBLEVBQ0QsNEJBQTRCLHVCQUF1QjtBQUFBLElBQ2xELFFBQVEsRUFBRSxNQUFNLFdBQVc7QUFBQSxJQUMzQixhQUFhLEVBQUUsU0FBUyxNQUFNO0FBQUEsSUFDOUIsUUFBUSxhQUFXLGdDQUFnQyxTQUFTLFVBQVU7QUFBQSxFQUN2RSxDQUFDO0FBQUEsRUFDRCxtQ0FBbUMsdUJBQXVCO0FBQUEsSUFDekQsUUFBUSxFQUFFLE1BQU0sV0FBVztBQUFBLElBQzNCLGFBQWEsRUFBRSxTQUFTLE1BQU07QUFBQSxJQUM5QixRQUFRLGFBQVcsZ0NBQWdDLFNBQVMsaUJBQWlCO0FBQUEsRUFDOUUsQ0FBQztBQUFBLEVBQ0QsZ0NBQWdDLHVCQUF1QjtBQUFBLElBQ3RELFFBQVEsRUFBRSxNQUFNLFdBQVc7QUFBQSxJQUMzQixhQUFhLEVBQUUsU0FBUyxNQUFNO0FBQUEsSUFDOUIsUUFBUSxhQUFXLGdDQUFnQyxTQUFTLE1BQU07QUFBQSxFQUNuRSxDQUFDO0FBQUEsRUFDRCxpQkFBaUIsdUJBQXVCLEVBQUUsUUFBUSxTQUFPLGlCQUFpQixLQUFLLEVBQUUsVUFBVSxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7QUFBQSxFQUNsSCxNQUFNLHlCQUF5QjtBQUFBLElBQzlCLGtDQUFrQyx1QkFBdUIsRUFBRSxRQUFRLFNBQU8saUJBQWlCLEtBQUssRUFBRSxVQUFVLCtCQUErQixDQUFDLEVBQUUsQ0FBQztBQUFBLEVBQ2hKLENBQUM7QUFBQSxFQUNELFdBQVcsdUJBQXVCLEVBQUUsUUFBUSxTQUFPLGlCQUFpQixLQUFLLEVBQUUsVUFBVSxXQUFXLENBQUMsRUFBRSxDQUFDO0FBQUEsRUFDcEcsMEJBQTBCLHVCQUF1QixFQUFFLFFBQVEsd0JBQXdCLENBQUM7QUFBQSxFQUNwRiw2QkFBNkIsdUJBQXVCLEVBQUUsUUFBUSxTQUFPLG9CQUFvQixLQUFLLGlCQUFpQixFQUFFLENBQUM7QUFBQSxFQUNsSCwrQkFBK0IsdUJBQXVCLEVBQUUsUUFBUSxTQUFPLG9CQUFvQixLQUFLLG1CQUFtQixFQUFFLENBQUM7QUFDdkgsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
