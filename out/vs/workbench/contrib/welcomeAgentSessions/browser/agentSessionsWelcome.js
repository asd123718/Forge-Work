var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import "./media/agentSessionsWelcome.css";
import { $, addDisposableListener, append, clearNode, getWindow, scheduleAtNextAnimationFrame } from "../../../../base/browser/dom.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Toggle } from "../../../../base/browser/ui/toggle/toggle.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { basename } from "../../../../base/common/resources.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { getListStyles, getToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { SIDE_BAR_FOREGROUND } from "../../../common/theme.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../chat/common/constants.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { ChatWidget } from "../../chat/browser/widget/chatWidget.js";
import { IAgentSessionsService } from "../../chat/browser/agentSessions/agentSessionsService.js";
import { AgentSessionProviders } from "../../chat/browser/agentSessions/agentSessions.js";
import { AgentSessionsWelcomeInput } from "./agentSessionsWelcomeInput.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { ChatViewId, IChatWidgetService } from "../../chat/browser/chat.js";
import { ChatSessionPosition, getResourceForNewChatSession } from "../../chat/browser/chatSessions/chatSessions.contribution.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { AgentSessionsControl } from "../../chat/browser/agentSessions/agentSessionsControl.js";
import { AgentSessionsFilter } from "../../chat/browser/agentSessions/agentSessionsFilter.js";
import { AgentSessionsListDelegate } from "../../chat/browser/agentSessions/agentSessionsViewer.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { IWalkthroughsService } from "../../welcomeGettingStarted/browser/gettingStartedService.js";
import { GettingStartedInput } from "../../welcomeGettingStarted/browser/gettingStartedInput.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspacesService, isRecentFolder, isRecentWorkspace } from "../../../../platform/workspaces/common/workspaces.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { canShowAgentsBanner, createAgentsBanner } from "../../chat/browser/agentSessions/agentSessionsBanner.js";
const configurationKey = "workbench.startupEditor";
const MAX_SESSIONS = 6;
const MAX_REPO_PICKS = 10;
const MAX_WALKTHROUGHS = 10;
const WELCOME_CHAT_INPUT_LAYOUT_HEIGHT = 150;
const WELCOME_CHAT_INPUT_RESERVED_LIST_HEIGHT = 50;
const WELCOME_CHAT_INPUT_RESERVED_CHROME_HEIGHT = 72;
const WELCOME_COMPACT_HEIGHT = 800;
const WELCOME_CHAT_INPUT_MAX_HEIGHT_OVERRIDE = WELCOME_CHAT_INPUT_LAYOUT_HEIGHT + WELCOME_CHAT_INPUT_RESERVED_LIST_HEIGHT + WELCOME_CHAT_INPUT_RESERVED_CHROME_HEIGHT;
let AgentSessionsWelcomePage = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService, layoutService, commandService, editorService, agentSessionsService, configurationService, productService, walkthroughsService, chatService, chatEntitlementService, markdownRendererService, workspaceContextService, workspacesService, hostService, workspaceTrustManagementService, viewDescriptorService, chatWidgetService, logService) {
    super(AgentSessionsWelcomePage.ID, group, telemetryService, themeService, storageService);
    this.storageService = storageService;
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.commandService = commandService;
    this.editorService = editorService;
    this.agentSessionsService = agentSessionsService;
    this.configurationService = configurationService;
    this.productService = productService;
    this.walkthroughsService = walkthroughsService;
    this.chatService = chatService;
    this.chatEntitlementService = chatEntitlementService;
    this.markdownRendererService = markdownRendererService;
    this.workspaceContextService = workspaceContextService;
    this.workspacesService = workspacesService;
    this.hostService = hostService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.viewDescriptorService = viewDescriptorService;
    this.chatWidgetService = chatWidgetService;
    this.logService = logService;
    this.sessionsControlDisposables = this._register(new DisposableStore());
    this.contentDisposables = this._register(new DisposableStore());
    this.walkthroughs = [];
    this._selectedSessionProvider = AgentSessionProviders.Local;
    this._recentTrustedWorkspaces = [];
    this._isEmptyWorkspace = false;
    this._workspaceKind = "empty";
    // Telemetry tracking
    this._openedAt = 0;
    this.container = $(".agentSessionsWelcome", {
      role: "document",
      tabindex: 0,
      "aria-label": localize("agentSessionsWelcomeAriaLabel", "Overview of agent sessions and how to get started.")
    });
    this.contextService = this._register(contextKeyService.createScoped(this.container));
    ChatContextKeys.inAgentSessionsWelcome.bindTo(this.contextService).set(true);
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
      const input = this.input || this._storedInput;
      if (this.chatEntitlementService.sentiment.hidden && input) {
        this._closedBy = "chatHidden";
        this.group.closeEditor(input);
      }
    }));
  }
  createEditor(parent) {
    parent.appendChild(this.container);
    this.contentContainer = $(".agentSessionsWelcome-content");
    this.scrollableElement = this._register(new DomScrollableElement(this.contentContainer, {
      className: "agentSessionsWelcome-scrollable",
      vertical: ScrollbarVisibility.Auto
    }));
    this.container.appendChild(this.scrollableElement.getDomNode());
  }
  async setInput(input, options, context, token) {
    this._storedInput = input;
    this._openedAt = Date.now();
    await super.setInput(input, options, context, token);
    this._workspaceKind = input.workspaceKind ?? "empty";
    await this.buildContent();
  }
  clearInput() {
    if (this._openedAt > 0) {
      const visibleDurationMs = Date.now() - this._openedAt;
      this.telemetryService.publicLog2(
        "agentSessionsWelcome.closed",
        {
          visibleDurationMs,
          closedBy: this._closedBy ?? "disposed"
        }
      );
      this._openedAt = 0;
      this._closedBy = void 0;
    }
    super.clearInput();
  }
  async buildContent() {
    this.contentDisposables.clear();
    this.sessionsControlDisposables.clear();
    this.sessionsControl = void 0;
    clearNode(this.contentContainer);
    this._isEmptyWorkspace = this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
    if (this._isEmptyWorkspace) {
      const recentlyOpened = await this.getRecentlyOpenedWorkspaces(true);
      this._recentTrustedWorkspaces = recentlyOpened.slice(0, MAX_REPO_PICKS);
    }
    this.walkthroughs = this.walkthroughsService.getWalkthroughs();
    const header = append(this.contentContainer, $(".agentSessionsWelcome-header"));
    append(header, $("h1.product-name", {}, this.productService.nameLong));
    const startEntries = append(header, $(".agentSessionsWelcome-startEntries"));
    await this.buildStartEntries(startEntries);
    const chatSection = append(this.contentContainer, $(".agentSessionsWelcome-chatSection"));
    this.buildChatWidget(chatSection);
    const sessionsSection = append(this.contentContainer, $(".agentSessionsWelcome-sessionsSection"));
    this.buildSessionsOrPrompts(sessionsSection);
    const footer = append(this.contentContainer, $(".agentSessionsWelcome-footer"));
    this.buildFooter(footer);
    let originalSessions = this.agentSessionsService.model.sessions.length > 0;
    this.contentDisposables.add(this.agentSessionsService.model.onDidChangeSessions(() => {
      const hasSessions = this.agentSessionsService.model.sessions.length > 0;
      if (hasSessions !== originalSessions) {
        originalSessions = hasSessions;
        clearNode(sessionsSection);
        this.buildSessionsOrPrompts(sessionsSection);
      }
      this.layoutSessionsControl();
    }));
    this.scrollableElement?.scanDomNode();
  }
  async buildStartEntries(container) {
    const workspaces = await this.getRecentlyOpenedWorkspaces(false);
    const openEntry = workspaces.length > 0 ? { icon: Codicon.folderOpened, label: localize("openRecent", "Open Recent..."), command: "workbench.action.openRecent" } : { icon: Codicon.folderOpened, label: localize("openFolder", "Open Folder..."), command: "workbench.action.files.openFolder" };
    const entries = [
      openEntry,
      { icon: Codicon.newFile, label: localize("newFile", "New file..."), command: "welcome.showNewFileEntries" },
      { icon: Codicon.repoClone, label: localize("cloneRepo", "Clone Git Repository..."), command: "git.clone" }
    ];
    for (const entry of entries) {
      const button = append(container, $("button.agentSessionsWelcome-startEntry"));
      button.appendChild(renderIcon(entry.icon));
      button.appendChild(document.createTextNode(entry.label));
      button.onclick = () => {
        this.telemetryService.publicLog2(
          "agentSessionsWelcome.ActionExecuted",
          { welcomeKind: "agentSessionsWelcomePage", action: "executeCommand", actionId: entry.command }
        );
        this.commandService.executeCommand(entry.command);
      };
    }
  }
  buildChatWidget(container) {
    const chatWidgetContainer = append(container, $(".agentSessionsWelcome-chatWidget"));
    const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatWidgetContainer)).appendChild($(".chat-editor-overflow.monaco-editor"));
    this.contentDisposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
    const scopedContextKeyService = this.contentDisposables.add(this.contextService.createScoped(chatWidgetContainer));
    const scopedInstantiationService = this.contentDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
    const onDidChangeActiveSessionProvider = this.contentDisposables.add(new Emitter());
    const recreateSessionForProvider = async (provider) => {
      if (this.chatWidget && this.chatModelRef) {
        this.chatWidget.setModel(void 0);
        this.chatModelRef.dispose();
        const newResource = getResourceForNewChatSession({
          type: provider,
          position: ChatSessionPosition.Sidebar,
          displayName: ""
        });
        const ref = await this.chatService.acquireOrLoadSession(newResource, ChatAgentLocation.Chat, CancellationToken.None);
        this.chatModelRef = ref ?? this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
        this.contentDisposables.add(this.chatModelRef);
        if (this.chatModelRef.object) {
          this.chatWidget.setModel(this.chatModelRef.object);
        }
      }
    };
    const sessionTypePickerDelegate = {
      getActiveSessionProvider: () => this._selectedSessionProvider,
      setActiveSessionProvider: (provider) => {
        this._selectedSessionProvider = provider;
        onDidChangeActiveSessionProvider.fire(provider);
        try {
          recreateSessionForProvider(provider);
        } catch {
        }
      },
      onDidChangeActiveSessionProvider: onDidChangeActiveSessionProvider.event
    };
    const onDidChangeSelectedWorkspace = this.contentDisposables.add(new Emitter());
    const onDidChangeWorkspaces = this.contentDisposables.add(new Emitter());
    const workspacePickerDelegate = this._isEmptyWorkspace ? {
      getWorkspaces: () => this._recentTrustedWorkspaces.map((w) => ({
        uri: this.getWorkspaceUri(w),
        label: this.getWorkspaceLabel(w),
        isFolder: isRecentFolder(w)
      })),
      getSelectedWorkspace: () => this._selectedWorkspace,
      setSelectedWorkspace: (workspace) => {
        this._selectedWorkspace = workspace;
        onDidChangeSelectedWorkspace.fire(workspace);
      },
      onDidChangeSelectedWorkspace: onDidChangeSelectedWorkspace.event,
      onDidChangeWorkspaces: onDidChangeWorkspaces.event,
      openFolderCommand: "workbench.action.files.openFolder"
    } : void 0;
    this.chatWidget = this.contentDisposables.add(scopedInstantiationService.createInstance(
      ChatWidget,
      ChatAgentLocation.Chat,
      // TODO: @osortega should we have a completely different ID and check that context instead in chatInputPart?
      {},
      // Empty resource view context
      {
        autoScroll: (mode) => mode !== ChatModeKind.Ask,
        renderFollowups: false,
        supportsFileReferences: true,
        renderInputOnTop: true,
        rendererOptions: {
          renderTextEditsAsSummary: () => true,
          referencesExpandedWhenEmptyResponse: false,
          progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask
        },
        editorOverflowWidgetsDomNode,
        enableImplicitContext: true,
        enableWorkingSet: "explicit",
        supportsChangingModes: true,
        sessionTypePickerDelegate,
        workspacePickerDelegate,
        submitHandler: this._isEmptyWorkspace ? (query, mode) => this.handleWorkspaceSubmission(query, mode) : void 0
      },
      {
        listForeground: SIDE_BAR_FOREGROUND,
        listBackground: editorBackground,
        overlayBackground: editorBackground,
        inputEditorBackground: editorBackground,
        resultEditorBackground: editorBackground
      }
    ));
    this.chatWidget.render(chatWidgetContainer);
    this.chatWidget.setVisible(true);
    this.contentDisposables.add(scheduleAtNextAnimationFrame(getWindow(chatWidgetContainer), () => {
      this.layoutChatWidget();
    }));
    this.chatModelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
    this.contentDisposables.add(this.chatModelRef);
    if (this.chatModelRef.object) {
      this.chatWidget.setModel(this.chatModelRef.object);
    }
    this.contentDisposables.add(addDisposableListener(chatWidgetContainer, "mousedown", () => {
      this.chatWidget?.focusInput();
    }));
    this.contentDisposables.add(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
      if (this.chatModelRef?.object?.sessionResource.toString() === chatSessionResource.toString()) {
        const mode = this.chatWidget?.input.currentModeObs.get().name.get() || "unknown";
        this.telemetryService.publicLog2(
          "agentSessionsWelcome.chatSubmitted",
          {
            mode,
            provider: this._selectedSessionProvider,
            workspaceKind: this._workspaceKind,
            selectedRecentWorkspace: this._selectedWorkspace !== void 0
          }
        );
        this._closedBy = "chatSubmission";
        this.openSessionInChat(chatSessionResource);
      }
    }));
    this.applyPrefillData();
  }
  getWorkspaceLabel(workspace) {
    if (isRecentFolder(workspace)) {
      return workspace.label || basename(workspace.folderUri);
    } else if (isRecentWorkspace(workspace)) {
      return workspace.label || basename(workspace.workspace.configPath);
    }
    return "";
  }
  getWorkspaceUri(workspace) {
    if (isRecentFolder(workspace)) {
      return workspace.folderUri;
    } else if (isRecentWorkspace(workspace)) {
      return workspace.workspace.configPath;
    }
    throw new Error("Invalid workspace type");
  }
  async handleWorkspaceSubmission(query, mode) {
    if (!this._selectedWorkspace) {
      return false;
    }
    if (!query.trim()) {
      return false;
    }
    const prefillData = {
      query,
      mode,
      timestamp: Date.now()
    };
    this.storageService.store(
      "chat.welcomeViewPrefill",
      JSON.stringify(prefillData),
      StorageScope.APPLICATION,
      StorageTarget.MACHINE
    );
    const workspace = this._recentTrustedWorkspaces.find((w) => this.getWorkspaceUri(w).toString() === this._selectedWorkspace?.uri.toString());
    if (workspace) {
      try {
        if (isRecentFolder(workspace)) {
          await this.hostService.openWindow([{ folderUri: workspace.folderUri }]);
        } else if (isRecentWorkspace(workspace)) {
          await this.hostService.openWindow([{ workspaceUri: workspace.workspace.configPath }]);
        }
        return true;
      } catch (e) {
      }
    }
    this.storageService.remove("chat.welcomeViewPrefill", StorageScope.APPLICATION);
    return false;
  }
  /**
   * Reads and applies prefill data from storage (used when transferring chat input from another workspace).
   * This is called after the chat widget is created to populate it with any pending prefill data.
   */
  applyPrefillData() {
    const prefillData = this.storageService.get("chat.welcomeViewPrefill", StorageScope.APPLICATION);
    if (prefillData) {
      this.storageService.remove("chat.welcomeViewPrefill", StorageScope.APPLICATION);
      try {
        const { query, mode, timestamp } = JSON.parse(prefillData);
        if (timestamp && Date.now() - timestamp > 60 * 1e3) {
          return;
        }
        if (query && this.chatWidget) {
          this.chatWidget.setInput(query);
        }
        if (mode !== void 0 && this.chatWidget) {
          this.chatWidget.input.setChatMode(mode, false);
        }
        this.chatWidget?.focusInput();
      } catch {
      }
    }
  }
  buildSessionsOrPrompts(container) {
    this.sessionsControlDisposables.clear();
    this.sessionsControl = void 0;
    const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
    if (sessions.length > 0) {
      this.buildSessionsGrid(container, sessions);
    } else {
      this.buildWalkthroughs(container);
    }
  }
  buildSessionsGrid(container, _sessions) {
    this.sessionsControlContainer = append(container, $(".agentSessionsWelcome-sessionsGrid"));
    const options = {
      overrideStyles: getListStyles({
        listBackground: editorBackground
      }),
      filter: this.sessionsControlDisposables.add(this.instantiationService.createInstance(AgentSessionsFilter, {
        limitResults: () => MAX_SESSIONS,
        overrideExclude: (session) => session.isArchived() ? true : void 0
      })),
      getHoverPosition: () => HoverPosition.BELOW,
      trackActiveEditorSession: () => false,
      source: "welcomeView",
      itemHeight: AgentSessionsListDelegate.ITEM_HEIGHT,
      sectionHeight: AgentSessionsListDelegate.SECTION_HEIGHT,
      notifySessionOpened: () => {
        const isProjectionEnabled = this.configurationService.getValue(ChatConfiguration.AgentSessionProjectionEnabled);
        if (!isProjectionEnabled) {
          this._closedBy = "sessionClicked";
          this.revealMaximizedChat();
        }
      }
    };
    this.sessionsControl = this.sessionsControlDisposables.add(this.instantiationService.createInstance(
      AgentSessionsControl,
      this.sessionsControlContainer,
      options
    ));
    this.sessionsControlDisposables.add(this.agentSessionsService.model.onDidResolve(() => {
      this.layoutSessionsControl();
    }));
    if (this.agentSessionsService.model.resolved) {
      this.layoutSessionsControl();
    }
    this.sessionsControlDisposables.add(scheduleAtNextAnimationFrame(getWindow(this.sessionsControlContainer), () => {
      this.layoutSessionsControl();
    }));
    if (canShowAgentsBanner(this.chatEntitlementService)) {
      const agentsBanner = createAgentsBanner(
        {
          cssClass: "agentSessionsWelcome-agentsBanner",
          source: "agentSessionsWelcome",
          label: localize("viewAllSessions", "View All Sessions"),
          onButtonClick: () => {
            this._closedBy = "viewAllSessions";
          }
        },
        this.commandService,
        this.telemetryService
      );
      this.sessionsControlDisposables.add(agentsBanner.disposables);
      append(container, agentsBanner.element);
    }
  }
  buildWalkthroughs(container) {
    const activeWalkthroughs = this.walkthroughs.filter(
      (w) => !w.when || this.contextService.contextMatchesRules(w.when)
    ).slice(0, MAX_WALKTHROUGHS);
    if (activeWalkthroughs.length === 0) {
      return;
    }
    let currentIndex = 0;
    const card = append(container, $(".agentSessionsWelcome-walkthroughCard"));
    const iconContainer = append(card, $(".agentSessionsWelcome-walkthroughCard-icon"));
    const content = append(card, $(".agentSessionsWelcome-walkthroughCard-content"));
    const title = append(content, $(".agentSessionsWelcome-walkthroughCard-title"));
    const desc = append(content, $(".agentSessionsWelcome-walkthroughCard-description"));
    const navContainer = append(card, $(".agentSessionsWelcome-walkthroughCard-nav"));
    const prevButton = append(navContainer, $("button.nav-button"));
    prevButton.appendChild(renderIcon(Codicon.chevronLeft));
    prevButton.title = localize("previousWalkthrough", "Previous");
    const nextButton = append(navContainer, $("button.nav-button"));
    nextButton.appendChild(renderIcon(Codicon.chevronRight));
    nextButton.title = localize("nextWalkthrough", "Next");
    const updateContent = () => {
      const walkthrough = activeWalkthroughs[currentIndex];
      clearNode(iconContainer);
      if (walkthrough.icon.type === "icon") {
        iconContainer.appendChild(renderIcon(walkthrough.icon.icon));
      }
      title.textContent = walkthrough.title;
      desc.textContent = walkthrough.description || "";
      prevButton.disabled = currentIndex === 0;
      nextButton.disabled = currentIndex === activeWalkthroughs.length - 1;
    };
    updateContent();
    card.onclick = () => {
      const walkthrough = activeWalkthroughs[currentIndex];
      this.telemetryService.publicLog2(
        "agentSessionsWelcome.ActionExecuted",
        { welcomeKind: "agentSessionsWelcomePage", action: "openWalkthrough", actionId: walkthrough.id }
      );
      const options = {
        selectedCategory: walkthrough.id,
        returnToCommand: AgentSessionsWelcomePage.COMMAND_ID
      };
      this.editorService.openEditor({
        resource: GettingStartedInput.RESOURCE,
        options
      });
    };
    prevButton.onclick = (e) => {
      e.stopPropagation();
      if (currentIndex > 0) {
        currentIndex--;
        updateContent();
      }
    };
    nextButton.onclick = (e) => {
      e.stopPropagation();
      if (currentIndex < activeWalkthroughs.length - 1) {
        currentIndex++;
        updateContent();
      }
    };
  }
  buildPrivacyNotice(container) {
    if (!this.chatEntitlementService.anonymous) {
      return;
    }
    if (this.storageService.getBoolean(AgentSessionsWelcomePage.PRIVACY_NOTICE_DISMISSED_KEY, StorageScope.APPLICATION, false)) {
      return;
    }
    const agent = this.productService.defaultChatAgent;
    const providers = agent?.provider;
    if (!providers || !providers.default || !agent?.termsStatementUrl || !agent.privacyStatementUrl) {
      return;
    }
    const tosCard = append(container, $(".agentSessionsWelcome-walkthroughCard.agentSessionsWelcome-tosCard"));
    const dismissNotice = () => {
      this.storageService.store(AgentSessionsWelcomePage.PRIVACY_NOTICE_DISMISSED_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
      tosCard.remove();
    };
    this.contentDisposables.add(this.chatService.onDidSubmitRequest(() => dismissNotice()));
    const iconContainer = append(tosCard, $(".agentSessionsWelcome-walkthroughCard-icon"));
    iconContainer.appendChild(renderIcon(Codicon.chatSparkle));
    const content = append(tosCard, $(".agentSessionsWelcome-walkthroughCard-content"));
    const title = append(content, $(".agentSessionsWelcome-walkthroughCard-title"));
    title.textContent = localize("tosTitle", "Forge uses Codex. Review the terms before you start.");
    const desc = append(content, $(".agentSessionsWelcome-walkthroughCard-description"));
    const descriptionMarkdown = new MarkdownString(
      localize(
        { key: "tosDescription", comment: ['{Locked="]({1})"}', '{Locked="]({2})"}'] },
        "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).",
        providers.default.name,
        agent.termsStatementUrl,
        agent.privacyStatementUrl
      ),
      { isTrusted: true }
    );
    const renderedMarkdown = this.markdownRendererService.render(descriptionMarkdown);
    desc.appendChild(renderedMarkdown.element);
    const dismissButton = append(tosCard, $("button.agentSessionsWelcome-tosCard-dismiss"));
    dismissButton.appendChild(renderIcon(Codicon.close));
    dismissButton.title = localize("dismissPrivacyNotice", "Dismiss");
    dismissButton.onclick = (e) => {
      e.stopPropagation();
      dismissNotice();
    };
  }
  buildFooter(container) {
    this.buildPrivacyNotice(container);
    const showOnStartupContainer = append(container, $(".agentSessionsWelcome-showOnStartup"));
    const showOnStartupCheckbox = this.contentDisposables.add(new Toggle({
      icon: Codicon.check,
      actionClassName: "agentSessionsWelcome-checkbox",
      isChecked: this.configurationService.getValue(configurationKey) === "agentSessionsWelcomePage",
      title: localize("checkboxTitle", "When checked, this page will be shown on startup."),
      ...getToggleStyles({
        inputActiveOptionBackground: "var(--vscode-descriptionForeground)",
        inputActiveOptionForeground: "var(--vscode-editor-background)",
        inputActiveOptionBorder: "var(--vscode-descriptionForeground)"
      })
    }));
    showOnStartupCheckbox.domNode.id = "showOnStartup";
    const showOnStartupLabel = $("label.caption", { for: "showOnStartup" }, localize("showOnStartup", "Show welcome page on startup"));
    const onShowOnStartupChanged = () => {
      if (showOnStartupCheckbox.checked) {
        this.configurationService.updateValue(configurationKey, "agentSessionsWelcomePage");
      } else {
        this.configurationService.updateValue(configurationKey, "none");
      }
    };
    this.contentDisposables.add(showOnStartupCheckbox.onChange(() => onShowOnStartupChanged()));
    this.contentDisposables.add(addDisposableListener(showOnStartupLabel, "click", () => {
      showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
      onShowOnStartupChanged();
    }));
    showOnStartupContainer.appendChild(showOnStartupCheckbox.domNode);
    showOnStartupContainer.appendChild(showOnStartupLabel);
  }
  layout(dimension) {
    this.lastDimension = dimension;
    this.container.style.height = `${dimension.height}px`;
    this.container.style.width = `${dimension.width}px`;
    this.container.classList.toggle("height-constrained", dimension.height <= WELCOME_COMPACT_HEIGHT);
    this.layoutChatWidget();
    this.layoutSessionsControl();
    this.scrollableElement?.scanDomNode();
  }
  layoutChatWidget() {
    if (!this.chatWidget || !this.lastDimension) {
      return;
    }
    const chatWidth = Math.min(800, this.lastDimension.width - 80);
    this.chatWidget.setInputPartMaxHeightOverride(WELCOME_CHAT_INPUT_MAX_HEIGHT_OVERRIDE);
    this.chatWidget.layout(WELCOME_CHAT_INPUT_LAYOUT_HEIGHT, chatWidth);
  }
  layoutSessionsControl() {
    if (!this.sessionsControl || !this.sessionsControlContainer || !this.lastDimension) {
      return;
    }
    const sessionsWidth = Math.min(800, this.lastDimension.width - 80);
    const visibleSessions = Math.min(
      this.agentSessionsService.model.sessions.filter((s) => !s.isArchived()).length,
      MAX_SESSIONS
    );
    const sessionsHeight = visibleSessions * AgentSessionsListDelegate.ITEM_HEIGHT;
    this.sessionsControl.layout(sessionsHeight, sessionsWidth);
    const marginOffset = Math.floor(visibleSessions / 2) * AgentSessionsListDelegate.ITEM_HEIGHT;
    this.sessionsControl.element.style.marginBottom = `-${marginOffset}px`;
  }
  focus() {
    super.focus();
    this.chatWidget?.focusInput();
  }
  async revealMaximizedChat() {
    try {
      await this.closeEditorAndMaximizeAuxiliaryBar();
    } catch (error) {
      this.logService.error("Failed to open maximized chat: {0}", toErrorMessage(error));
    }
  }
  async openSessionInChat(sessionResource) {
    try {
      await this.closeEditorAndMaximizeAuxiliaryBar(sessionResource);
    } catch (error) {
      this.logService.error("Failed to open agent session: {0}", toErrorMessage(error));
    }
  }
  async closeEditorAndMaximizeAuxiliaryBar(sessionResource) {
    const editorToClose = this.input || this._storedInput;
    if (editorToClose && this.group.contains(editorToClose)) {
      await new Promise((resolve) => {
        const disposable = this.group.onDidActiveEditorChange((e) => {
          disposable.dispose();
          resolve();
        });
        this.group.closeEditor(editorToClose);
      });
    }
    if (sessionResource) {
      await this.chatWidgetService.openSession(sessionResource);
    } else {
      await this.commandService.executeCommand("workbench.action.chat.open");
    }
    const chatViewLocation = this.viewDescriptorService.getViewLocationById(ChatViewId);
    if (chatViewLocation === ViewContainerLocation.AuxiliaryBar) {
      this.layoutService.setAuxiliaryBarMaximized(true);
    }
  }
  async getRecentlyOpenedWorkspaces(onlyTrusted = false) {
    const workspaces = await this.workspacesService.getRecentlyOpened();
    const trustInfoPromises = workspaces.workspaces.map(async (ws) => {
      const uri = isRecentWorkspace(ws) ? ws.workspace.configPath : ws.folderUri;
      const trustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(uri);
      return { workspace: ws, trusted: trustInfo.trusted };
    });
    const trustInfoResults = await Promise.all(trustInfoPromises);
    const filteredWorkspaces = trustInfoResults.filter((result) => onlyTrusted ? result.trusted : true).map((result) => result.workspace);
    return filteredWorkspaces;
  }
};
AgentSessionsWelcomePage.ID = "agentSessionsWelcomePage";
AgentSessionsWelcomePage.COMMAND_ID = "workbench.action.openAgentSessionsWelcome";
AgentSessionsWelcomePage.PRIVACY_NOTICE_DISMISSED_KEY = "agentSessionsWelcome.privacyNoticeDismissed";
AgentSessionsWelcomePage = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, IAgentSessionsService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IWalkthroughsService),
  __decorateParam(13, IChatService),
  __decorateParam(14, IChatEntitlementService),
  __decorateParam(15, IMarkdownRendererService),
  __decorateParam(16, IWorkspaceContextService),
  __decorateParam(17, IWorkspacesService),
  __decorateParam(18, IHostService),
  __decorateParam(19, IWorkspaceTrustManagementService),
  __decorateParam(20, IViewDescriptorService),
  __decorateParam(21, IChatWidgetService),
  __decorateParam(22, ILogService)
], AgentSessionsWelcomePage);
class AgentSessionsWelcomeInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return JSON.stringify({});
  }
  deserialize(instantiationService, serializedEditorInput) {
    return new AgentSessionsWelcomeInput({});
  }
}
export {
  AgentSessionsWelcomeInputSerializer,
  AgentSessionsWelcomePage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVBZ2VudFNlc3Npb25zXFxicm93c2VyXFxhZ2VudFNlc3Npb25zV2VsY29tZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9hZ2VudFNlc3Npb25zV2VsY29tZS5jc3MnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGNsZWFyTm9kZSwgRGltZW5zaW9uLCBnZXRXaW5kb3csIHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IFRvZ2dsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBnZXRMaXN0U3R5bGVzLCBnZXRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0LCBJRWRpdG9yU2VyaWFsaXplciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgU0lERV9CQVJfRk9SRUdST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBBZ2VudFNlc3Npb25UYXJnZXQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc1dlbGNvbWVFZGl0b3JPcHRpb25zLCBBZ2VudFNlc3Npb25zV2VsY29tZUlucHV0LCBBZ2VudFNlc3Npb25zV2VsY29tZVdvcmtzcGFjZUtpbmQgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNXZWxjb21lSW5wdXQuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0lkLCBJQ2hhdFdpZGdldFNlcnZpY2UsIElTZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlLCBJV29ya3NwYWNlUGlja2VyRGVsZWdhdGUsIElXb3Jrc3BhY2VQaWNrZXJJdGVtIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25Qb3NpdGlvbiwgZ2V0UmVzb3VyY2VGb3JOZXdDaGF0U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0U2Vzc2lvbnMvY2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc0NvbnRyb2wsIElBZ2VudFNlc3Npb25zQ29udHJvbE9wdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zQ29udHJvbC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zRmlsdGVyIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc0ZpbHRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1ZpZXdlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFdhbGt0aHJvdWdoLCBJV2Fsa3Rocm91Z2hzU2VydmljZSB9IGZyb20gJy4uLy4uL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHZXR0aW5nU3RhcnRlZEVkaXRvck9wdGlvbnMsIEdldHRpbmdTdGFydGVkSW5wdXQgfSBmcm9tICcuLi8uLi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvYnJvd3Nlci9nZXR0aW5nU3RhcnRlZElucHV0LmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlc1NlcnZpY2UsIElSZWNlbnRGb2xkZXIsIElSZWNlbnRXb3Jrc3BhY2UsIGlzUmVjZW50Rm9sZGVyLCBpc1JlY2VudFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGNhblNob3dBZ2VudHNCYW5uZXIsIGNyZWF0ZUFnZW50c0Jhbm5lciB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNCYW5uZXIuanMnO1xuXG5jb25zdCBjb25maWd1cmF0aW9uS2V5ID0gJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yJztcbmNvbnN0IE1BWF9TRVNTSU9OUyA9IDY7XG5jb25zdCBNQVhfUkVQT19QSUNLUyA9IDEwO1xuY29uc3QgTUFYX1dBTEtUSFJPVUdIUyA9IDEwO1xuY29uc3QgV0VMQ09NRV9DSEFUX0lOUFVUX0xBWU9VVF9IRUlHSFQgPSAxNTA7XG5jb25zdCBXRUxDT01FX0NIQVRfSU5QVVRfUkVTRVJWRURfTElTVF9IRUlHSFQgPSA1MDtcbmNvbnN0IFdFTENPTUVfQ0hBVF9JTlBVVF9SRVNFUlZFRF9DSFJPTUVfSEVJR0hUID0gNzI7XG5jb25zdCBXRUxDT01FX0NPTVBBQ1RfSEVJR0hUID0gODAwO1xuLy8gTWlycm9yIENoYXRXaWRnZXQncyBjb21wYWN0LXN1cmZhY2Ugc2l6aW5nIHNvIHRoZSBoaWRkZW4gbGlzdCByZXNlcnZhdGlvbiBhbmQgaW5wdXQgY2hyb21lIGRvIG5vdCBjb2xsYXBzZSB0aGUgZWRpdG9yLlxuY29uc3QgV0VMQ09NRV9DSEFUX0lOUFVUX01BWF9IRUlHSFRfT1ZFUlJJREUgPSBXRUxDT01FX0NIQVRfSU5QVVRfTEFZT1VUX0hFSUdIVCArIFdFTENPTUVfQ0hBVF9JTlBVVF9SRVNFUlZFRF9MSVNUX0hFSUdIVCArIFdFTENPTUVfQ0hBVF9JTlBVVF9SRVNFUlZFRF9DSFJPTUVfSEVJR0hUO1xuXG4vKipcbiAqIC0gdmlzaWJsZUR1cmF0aW9uTXM6IERvIHRoZXkgY2xvc2UgaXQgcmlnaHQgYXdheSBvciBsZWF2ZSBpdCBvcGVuICgjMylcbiAqIC0gY2xvc2VkQnk6IFRyYWNrIHdoYXQgYWN0aW9uIGNhdXNlZCB0aGUgY2xvc2UgKHZpZXdBbGxTZXNzaW9ucywgY2hhdFN1Ym1pc3Npb24sIHNlc3Npb25DbGlja2VkLCBldGMuKSAoIzUpXG4gKi9cbnR5cGUgQWdlbnRTZXNzaW9uc1dlbGNvbWVDbG9zZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0dmlzaWJsZUR1cmF0aW9uTXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdIb3cgbG9uZyB0aGUgd2VsY29tZSBwYWdlIHdhcyB2aXNpYmxlIGluIG1pbGxpc2Vjb25kcy4nIH07XG5cdGNsb3NlZEJ5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hhdCBhY3Rpb24gY2F1c2VkIHRoZSB3ZWxjb21lIHBhZ2UgdG8gY2xvc2UuJyB9O1xuXHRvd25lcjogJ29zb3J0ZWdhJztcblx0Y29tbWVudDogJ1RyYWNrcyB3aGVuIHRoZSBhZ2VudCBzZXNzaW9ucyB3ZWxjb21lIHBhZ2UgaXMgY2xvc2VkIHRvIHVuZGVyc3RhbmQgZW5nYWdlbWVudC4nO1xufTtcblxudHlwZSBBZ2VudFNlc3Npb25zV2VsY29tZUNsb3NlZEV2ZW50ID0ge1xuXHR2aXNpYmxlRHVyYXRpb25NczogbnVtYmVyO1xuXHRjbG9zZWRCeTogc3RyaW5nO1xufTtcblxuLyoqXG4gKiAtIG1vZGUvcHJvdmlkZXIvd29ya3NwYWNlS2luZDogVHJhY2sgYWdlbnQgdHlwZSwgc2Vzc2lvbiBwcm92aWRlciwgYW5kIHdvcmtzcGFjZSBzdGF0ZSAoIzQpXG4gKiAtIHNlbGVjdGVkUmVjZW50V29ya3NwYWNlOiBEbyB1c2VycyBzZWxlY3QgYSByZWNlbnQgd29ya3NwYWNlIGJlZm9yZSBzdWJtaXR0aW5nIGNoYXQgKCM4KVxuICovXG50eXBlIEFnZW50U2Vzc2lvbnNXZWxjb21lQ2hhdFN1Ym1pdHRlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRtb2RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGNoYXQgbW9kZSB1c2VkIChhc2ssIGFnZW50LCBlZGl0KS4nIH07XG5cdHByb3ZpZGVyOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNlc3Npb24gcHJvdmlkZXIgKGxvY2FsLCBjbG91ZCkuJyB9O1xuXHR3b3Jrc3BhY2VLaW5kOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHR5cGUgb2Ygd29ya3NwYWNlIC0gZW1wdHksIGZvbGRlciwgb3Igd29ya3NwYWNlLicgfTtcblx0c2VsZWN0ZWRSZWNlbnRXb3Jrc3BhY2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGEgcmVjZW50IHdvcmtzcGFjZSB3YXMgc2VsZWN0ZWQgYmVmb3JlIHN1Ym1pdHRpbmcuJyB9O1xuXHRvd25lcjogJ29zb3J0ZWdhJztcblx0Y29tbWVudDogJ1RyYWNrcyBjaGF0IHN1Ym1pc3Npb25zIGZyb20gdGhlIHdlbGNvbWUgcGFnZSB0byB1bmRlcnN0YW5kIHNlc3Npb24gY3JlYXRpb24gcGF0dGVybnMuJztcbn07XG5cbnR5cGUgQWdlbnRTZXNzaW9uc1dlbGNvbWVDaGF0U3VibWl0dGVkRXZlbnQgPSB7XG5cdG1vZGU6IHN0cmluZztcblx0cHJvdmlkZXI6IHN0cmluZztcblx0d29ya3NwYWNlS2luZDogQWdlbnRTZXNzaW9uc1dlbGNvbWVXb3Jrc3BhY2VLaW5kO1xuXHRzZWxlY3RlZFJlY2VudFdvcmtzcGFjZTogYm9vbGVhbjtcbn07XG5cbnR5cGUgQWdlbnRTZXNzaW9uc1dlbGNvbWVBY3Rpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0YWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3Rpb24gYmVpbmcgZXhlY3V0ZWQgb24gdGhlIGFnZW50IHNlc3Npb25zIHdlbGNvbWUgcGFnZS4nIH07XG5cdGFjdGlvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lkZW50aWZpZXIgb2YgdGhlIGFjdGlvbiBiZWluZyBleGVjdXRlZCwgc3VjaCBhcyBjb21tYW5kIElEIG9yIHdhbGt0aHJvdWdoIElELicgfTtcblx0d2VsY29tZUtpbmQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGtpbmQgb2Ygd2VsY29tZSBwYWdlJyB9O1xuXHRvd25lcjogJ29zb3J0ZWdhJztcblx0Y29tbWVudDogJ0hlbHAgdW5kZXJzdGFuZCB3aGF0IGFjdGlvbnMgYXJlIG1vc3QgY29tbW9ubHkgdGFrZW4gb24gdGhlIGFnZW50IHNlc3Npb25zIHdlbGNvbWUgcGFnZSc7XG59O1xuXG50eXBlIEFnZW50U2Vzc2lvbnNXZWxjb21lQWN0aW9uRXZlbnQgPSB7XG5cdGFjdGlvbjogc3RyaW5nO1xuXHR3ZWxjb21lS2luZDogJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZSc7XG5cdGFjdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59O1xuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlIGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZSc7XG5cdHN0YXRpYyByZWFkb25seSBDT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkFnZW50U2Vzc2lvbnNXZWxjb21lJztcblxuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbnRlbnRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzY3JvbGxhYmxlRWxlbWVudDogRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY2hhdFdpZGdldDogQ2hhdFdpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjaGF0TW9kZWxSZWY6IElSZWZlcmVuY2U8SUNoYXRNb2RlbD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2Vzc2lvbnNDb250cm9sOiBBZ2VudFNlc3Npb25zQ29udHJvbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZXNzaW9uc0NvbnRyb2xDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zQ29udHJvbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIGNvbnRleHRTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgd2Fsa3Rocm91Z2hzOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFtdID0gW107XG5cdHByaXZhdGUgX3NlbGVjdGVkU2Vzc2lvblByb3ZpZGVyOiBBZ2VudFNlc3Npb25UYXJnZXQgPSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWw7XG5cdHByaXZhdGUgX3NlbGVjdGVkV29ya3NwYWNlOiBJV29ya3NwYWNlUGlja2VySXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVjZW50VHJ1c3RlZFdvcmtzcGFjZXM6IEFycmF5PElSZWNlbnRXb3Jrc3BhY2UgfCBJUmVjZW50Rm9sZGVyPiA9IFtdO1xuXHRwcml2YXRlIF9pc0VtcHR5V29ya3NwYWNlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3dvcmtzcGFjZUtpbmQ6IEFnZW50U2Vzc2lvbnNXZWxjb21lV29ya3NwYWNlS2luZCA9ICdlbXB0eSc7XG5cblx0Ly8gVGVsZW1ldHJ5IHRyYWNraW5nXG5cdHByaXZhdGUgX29wZW5lZEF0OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9jbG9zZWRCeT86IHN0cmluZztcblx0cHJpdmF0ZSBfc3RvcmVkSW5wdXQ6IEFnZW50U2Vzc2lvbnNXZWxjb21lSW5wdXQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVdhbGt0aHJvdWdoc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3YWxrdGhyb3VnaHNTZXJ2aWNlOiBJV2Fsa3Rocm91Z2hzU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlc1NlcnZpY2U6IElXb3Jrc3BhY2VzU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoQWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHR0aGlzLmNvbnRhaW5lciA9ICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZScsIHtcblx0XHRcdHJvbGU6ICdkb2N1bWVudCcsXG5cdFx0XHR0YWJpbmRleDogMCxcblx0XHRcdCdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnNXZWxjb21lQXJpYUxhYmVsJywgXCJPdmVydmlldyBvZiBhZ2VudCBzZXNzaW9ucyBhbmQgaG93IHRvIGdldCBzdGFydGVkLlwiKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5jb250ZXh0U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmNvbnRhaW5lcikpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5pbkFnZW50U2Vzc2lvbnNXZWxjb21lLmJpbmRUbyh0aGlzLmNvbnRleHRTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZW50aW1lbnQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmlucHV0IHx8IHRoaXMuX3N0b3JlZElucHV0O1xuXHRcdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuaGlkZGVuICYmIGlucHV0KSB7XG5cdFx0XHRcdHRoaXMuX2Nsb3NlZEJ5ID0gJ2NoYXRIaWRkZW4nO1xuXHRcdFx0XHR0aGlzLmdyb3VwLmNsb3NlRWRpdG9yKGlucHV0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5jb250YWluZXIpO1xuXG5cdFx0Ly8gQ3JlYXRlIHNjcm9sbGFibGUgY29udGVudFxuXHRcdHRoaXMuY29udGVudENvbnRhaW5lciA9ICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS1jb250ZW50Jyk7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLmNvbnRlbnRDb250YWluZXIsIHtcblx0XHRcdGNsYXNzTmFtZTogJ2FnZW50U2Vzc2lvbnNXZWxjb21lLXNjcm9sbGFibGUnLFxuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0b1xuXHRcdH0pKTtcblx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogQWdlbnRTZXNzaW9uc1dlbGNvbWVJbnB1dCwgb3B0aW9uczogQWdlbnRTZXNzaW9uc1dlbGNvbWVFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3N0b3JlZElucHV0ID0gaW5wdXQ7XG5cdFx0dGhpcy5fb3BlbmVkQXQgPSBEYXRlLm5vdygpO1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0dGhpcy5fd29ya3NwYWNlS2luZCA9IGlucHV0LndvcmtzcGFjZUtpbmQgPz8gJ2VtcHR5Jztcblx0XHRhd2FpdCB0aGlzLmJ1aWxkQ29udGVudCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHQvLyBTZW5kIGNsb3NlZCB0ZWxlbWV0cnkgd2hlbiB0aGUgZWRpdG9yIGlzIGNsb3NlZFxuXHRcdGlmICh0aGlzLl9vcGVuZWRBdCA+IDApIHtcblx0XHRcdGNvbnN0IHZpc2libGVEdXJhdGlvbk1zID0gRGF0ZS5ub3coKSAtIHRoaXMuX29wZW5lZEF0O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRTZXNzaW9uc1dlbGNvbWVDbG9zZWRFdmVudCwgQWdlbnRTZXNzaW9uc1dlbGNvbWVDbG9zZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdCdhZ2VudFNlc3Npb25zV2VsY29tZS5jbG9zZWQnLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dmlzaWJsZUR1cmF0aW9uTXMsXG5cdFx0XHRcdFx0Y2xvc2VkQnk6IHRoaXMuX2Nsb3NlZEJ5ID8/ICdkaXNwb3NlZCdcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX29wZW5lZEF0ID0gMDtcblx0XHRcdHRoaXMuX2Nsb3NlZEJ5ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGJ1aWxkQ29udGVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbCA9IHVuZGVmaW5lZDtcblx0XHRjbGVhck5vZGUodGhpcy5jb250ZW50Q29udGFpbmVyKTtcblxuXHRcdC8vIERldGVjdCBlbXB0eSB3b3Jrc3BhY2UgYW5kIGZldGNoIHJlY2VudCB3b3Jrc3BhY2VzXG5cdFx0dGhpcy5faXNFbXB0eVdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdFx0aWYgKHRoaXMuX2lzRW1wdHlXb3Jrc3BhY2UpIHtcblx0XHRcdGNvbnN0IHJlY2VudGx5T3BlbmVkID0gYXdhaXQgdGhpcy5nZXRSZWNlbnRseU9wZW5lZFdvcmtzcGFjZXModHJ1ZSk7XG5cdFx0XHR0aGlzLl9yZWNlbnRUcnVzdGVkV29ya3NwYWNlcyA9IHJlY2VudGx5T3BlbmVkLnNsaWNlKDAsIE1BWF9SRVBPX1BJQ0tTKTtcblx0XHR9XG5cblx0XHQvLyBHZXQgd2Fsa3Rocm91Z2hzXG5cdFx0dGhpcy53YWxrdGhyb3VnaHMgPSB0aGlzLndhbGt0aHJvdWdoc1NlcnZpY2UuZ2V0V2Fsa3Rocm91Z2hzKCk7XG5cblx0XHQvLyBIZWFkZXJcblx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQodGhpcy5jb250ZW50Q29udGFpbmVyLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtaGVhZGVyJykpO1xuXHRcdGFwcGVuZChoZWFkZXIsICQoJ2gxLnByb2R1Y3QtbmFtZScsIHt9LCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSk7XG5cblx0XHRjb25zdCBzdGFydEVudHJpZXMgPSBhcHBlbmQoaGVhZGVyLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtc3RhcnRFbnRyaWVzJykpO1xuXHRcdGF3YWl0IHRoaXMuYnVpbGRTdGFydEVudHJpZXMoc3RhcnRFbnRyaWVzKTtcblxuXHRcdC8vIENoYXQgaW5wdXQgc2VjdGlvblxuXHRcdGNvbnN0IGNoYXRTZWN0aW9uID0gYXBwZW5kKHRoaXMuY29udGVudENvbnRhaW5lciwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLWNoYXRTZWN0aW9uJykpO1xuXHRcdHRoaXMuYnVpbGRDaGF0V2lkZ2V0KGNoYXRTZWN0aW9uKTtcblxuXHRcdC8vIFNlc3Npb25zIG9yIHdhbGt0aHJvdWdoc1xuXHRcdGNvbnN0IHNlc3Npb25zU2VjdGlvbiA9IGFwcGVuZCh0aGlzLmNvbnRlbnRDb250YWluZXIsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS1zZXNzaW9uc1NlY3Rpb24nKSk7XG5cdFx0dGhpcy5idWlsZFNlc3Npb25zT3JQcm9tcHRzKHNlc3Npb25zU2VjdGlvbik7XG5cblx0XHQvLyBGb290ZXJcblx0XHRjb25zdCBmb290ZXIgPSBhcHBlbmQodGhpcy5jb250ZW50Q29udGFpbmVyLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtZm9vdGVyJykpO1xuXHRcdHRoaXMuYnVpbGRGb290ZXIoZm9vdGVyKTtcblxuXHRcdC8vIExpc3RlbiBmb3Igc2Vzc2lvbiBjaGFuZ2VzIC0gc3RvcmUgcmVmZXJlbmNlIHRvIGF2b2lkIHF1ZXJ5U2VsZWN0b3Jcblx0XHRsZXQgb3JpZ2luYWxTZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnMubGVuZ3RoID4gMDtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdGNvbnN0IGhhc1Nlc3Npb25zID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5sZW5ndGggPiAwO1xuXHRcdFx0Ly8gT25seSByZWJ1aWxkIGlmIHRoZSBhbW91bnQgb2Ygc2Vzc2lvbnMgY2hhbmdlZCwgb3RoZXIgdXBkYXRlcyBzaG91bGQgYmUgbWFuYWdlZCBieSB0aGUgY29udHJvbFxuXHRcdFx0aWYgKGhhc1Nlc3Npb25zICE9PSBvcmlnaW5hbFNlc3Npb25zKSB7XG5cdFx0XHRcdG9yaWdpbmFsU2Vzc2lvbnMgPSBoYXNTZXNzaW9ucztcblx0XHRcdFx0Y2xlYXJOb2RlKHNlc3Npb25zU2VjdGlvbik7XG5cdFx0XHRcdHRoaXMuYnVpbGRTZXNzaW9uc09yUHJvbXB0cyhzZXNzaW9uc1NlY3Rpb24pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sYXlvdXRTZXNzaW9uc0NvbnRyb2woKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50Py5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBidWlsZFN0YXJ0RW50cmllcyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlcyA9IGF3YWl0IHRoaXMuZ2V0UmVjZW50bHlPcGVuZWRXb3Jrc3BhY2VzKGZhbHNlKTtcblx0XHRjb25zdCBvcGVuRW50cnkgPSB3b3Jrc3BhY2VzLmxlbmd0aCA+IDBcblx0XHRcdD8geyBpY29uOiBDb2RpY29uLmZvbGRlck9wZW5lZCwgbGFiZWw6IGxvY2FsaXplKCdvcGVuUmVjZW50JywgXCJPcGVuIFJlY2VudC4uLlwiKSwgY29tbWFuZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblJlY2VudCcgfVxuXHRcdFx0OiB7IGljb246IENvZGljb24uZm9sZGVyT3BlbmVkLCBsYWJlbDogbG9jYWxpemUoJ29wZW5Gb2xkZXInLCBcIk9wZW4gRm9sZGVyLi4uXCIpLCBjb21tYW5kOiAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuRm9sZGVyJyB9O1xuXHRcdGNvbnN0IGVudHJpZXMgPSBbXG5cdFx0XHRvcGVuRW50cnksXG5cdFx0XHR7IGljb246IENvZGljb24ubmV3RmlsZSwgbGFiZWw6IGxvY2FsaXplKCduZXdGaWxlJywgXCJOZXcgZmlsZS4uLlwiKSwgY29tbWFuZDogJ3dlbGNvbWUuc2hvd05ld0ZpbGVFbnRyaWVzJyB9LFxuXHRcdFx0eyBpY29uOiBDb2RpY29uLnJlcG9DbG9uZSwgbGFiZWw6IGxvY2FsaXplKCdjbG9uZVJlcG8nLCBcIkNsb25lIEdpdCBSZXBvc2l0b3J5Li4uXCIpLCBjb21tYW5kOiAnZ2l0LmNsb25lJyB9LFxuXHRcdF07XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGFwcGVuZChjb250YWluZXIsICQoJ2J1dHRvbi5hZ2VudFNlc3Npb25zV2VsY29tZS1zdGFydEVudHJ5JykpO1xuXHRcdFx0YnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oZW50cnkuaWNvbikpO1xuXHRcdFx0YnV0dG9uLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGVudHJ5LmxhYmVsKSk7XG5cdFx0XHRidXR0b24ub25jbGljayA9ICgpID0+IHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRTZXNzaW9uc1dlbGNvbWVBY3Rpb25FdmVudCwgQWdlbnRTZXNzaW9uc1dlbGNvbWVBY3Rpb25DbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdFx0J2FnZW50U2Vzc2lvbnNXZWxjb21lLkFjdGlvbkV4ZWN1dGVkJyxcblx0XHRcdFx0XHR7IHdlbGNvbWVLaW5kOiAnYWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlJywgYWN0aW9uOiAnZXhlY3V0ZUNvbW1hbmQnLCBhY3Rpb25JZDogZW50cnkuY29tbWFuZCB9XG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZW50cnkuY29tbWFuZCk7XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYnVpbGRDaGF0V2lkZ2V0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0Q29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLWNoYXRXaWRnZXQnKSk7XG5cblx0XHQvLyBDcmVhdGUgZWRpdG9yIG92ZXJmbG93IHdpZGdldHMgY29udGFpbmVyXG5cdFx0Y29uc3QgZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoZ2V0V2luZG93KGNoYXRXaWRnZXRDb250YWluZXIpKS5hcHBlbmRDaGlsZCgkKCcuY2hhdC1lZGl0b3Itb3ZlcmZsb3cubW9uYWNvLWVkaXRvcicpKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdC8vIENyZWF0ZSBDaGF0V2lkZ2V0IHdpdGggc2NvcGVkIHNlcnZpY2VzXG5cdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0U2VydmljZS5jcmVhdGVTY29wZWQoY2hhdFdpZGdldENvbnRhaW5lcikpO1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdC8vIENyZWF0ZSBhIGRlbGVnYXRlIGZvciB0aGUgc2Vzc2lvbiB0YXJnZXQgcGlja2VyIHdpdGggaW5kZXBlbmRlbnQgbG9jYWwgc3RhdGVcblx0XHRjb25zdCBvbkRpZENoYW5nZUFjdGl2ZVNlc3Npb25Qcm92aWRlciA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxBZ2VudFNlc3Npb25UYXJnZXQ+KCkpO1xuXHRcdGNvbnN0IHJlY3JlYXRlU2Vzc2lvbkZvclByb3ZpZGVyID0gYXN5bmMgKHByb3ZpZGVyOiBBZ2VudFNlc3Npb25UYXJnZXQpID0+IHtcblx0XHRcdGlmICh0aGlzLmNoYXRXaWRnZXQgJiYgdGhpcy5jaGF0TW9kZWxSZWYpIHtcblx0XHRcdFx0dGhpcy5jaGF0V2lkZ2V0LnNldE1vZGVsKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuY2hhdE1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y29uc3QgbmV3UmVzb3VyY2UgPSBnZXRSZXNvdXJjZUZvck5ld0NoYXRTZXNzaW9uKHtcblx0XHRcdFx0XHR0eXBlOiBwcm92aWRlcixcblx0XHRcdFx0XHRwb3NpdGlvbjogQ2hhdFNlc3Npb25Qb3NpdGlvbi5TaWRlYmFyLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnJ1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihuZXdSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdHRoaXMuY2hhdE1vZGVsUmVmID0gcmVmID8/IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmNoYXRNb2RlbFJlZik7XG5cdFx0XHRcdGlmICh0aGlzLmNoYXRNb2RlbFJlZi5vYmplY3QpIHtcblx0XHRcdFx0XHR0aGlzLmNoYXRXaWRnZXQuc2V0TW9kZWwodGhpcy5jaGF0TW9kZWxSZWYub2JqZWN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZTogSVNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUgPSB7XG5cdFx0XHRnZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI6ICgpID0+IHRoaXMuX3NlbGVjdGVkU2Vzc2lvblByb3ZpZGVyLFxuXHRcdFx0c2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyOiAocHJvdmlkZXI6IEFnZW50U2Vzc2lvblRhcmdldCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3RlZFNlc3Npb25Qcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdFx0XHRvbkRpZENoYW5nZUFjdGl2ZVNlc3Npb25Qcm92aWRlci5maXJlKHByb3ZpZGVyKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZWNyZWF0ZVNlc3Npb25Gb3JQcm92aWRlcihwcm92aWRlcik7XG5cdFx0XHRcdH0gY2F0Y2ggeyAvKiBJZ25vcmUgZXJyb3JzICovIH1cblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZVNlc3Npb25Qcm92aWRlcjogb25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uUHJvdmlkZXIuZXZlbnRcblx0XHR9O1xuXG5cdFx0Ly8gQ3JlYXRlIHdvcmtzcGFjZSBwaWNrZXIgZGVsZWdhdGUgZm9yIGVtcHR5IHdvcmtzcGFjZSBzY2VuYXJpb3Ncblx0XHRjb25zdCBvbkRpZENoYW5nZVNlbGVjdGVkV29ya3NwYWNlID0gdGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VQaWNrZXJJdGVtIHwgdW5kZWZpbmVkPigpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVdvcmtzcGFjZXMgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlUGlja2VyRGVsZWdhdGU6IElXb3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZSB8IHVuZGVmaW5lZCA9IHRoaXMuX2lzRW1wdHlXb3Jrc3BhY2UgPyB7XG5cdFx0XHRnZXRXb3Jrc3BhY2VzOiAoKSA9PiB0aGlzLl9yZWNlbnRUcnVzdGVkV29ya3NwYWNlcy5tYXAodyA9PiAoe1xuXHRcdFx0XHR1cmk6IHRoaXMuZ2V0V29ya3NwYWNlVXJpKHcpLFxuXHRcdFx0XHRsYWJlbDogdGhpcy5nZXRXb3Jrc3BhY2VMYWJlbCh3KSxcblx0XHRcdFx0aXNGb2xkZXI6IGlzUmVjZW50Rm9sZGVyKHcpLFxuXHRcdFx0fSkpLFxuXHRcdFx0Z2V0U2VsZWN0ZWRXb3Jrc3BhY2U6ICgpID0+IHRoaXMuX3NlbGVjdGVkV29ya3NwYWNlLFxuXHRcdFx0c2V0U2VsZWN0ZWRXb3Jrc3BhY2U6ICh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VQaWNrZXJJdGVtIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGVkV29ya3NwYWNlID0gd29ya3NwYWNlO1xuXHRcdFx0XHRvbkRpZENoYW5nZVNlbGVjdGVkV29ya3NwYWNlLmZpcmUod29ya3NwYWNlKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVNlbGVjdGVkV29ya3NwYWNlOiBvbkRpZENoYW5nZVNlbGVjdGVkV29ya3NwYWNlLmV2ZW50LFxuXHRcdFx0b25EaWRDaGFuZ2VXb3Jrc3BhY2VzOiBvbkRpZENoYW5nZVdvcmtzcGFjZXMuZXZlbnQsXG5cdFx0XHRvcGVuRm9sZGVyQ29tbWFuZDogJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkZvbGRlcicsXG5cdFx0fSA6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuY2hhdFdpZGdldCA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRXaWRnZXQsXG5cdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Ly8gVE9ETzogQG9zb3J0ZWdhIHNob3VsZCB3ZSBoYXZlIGEgY29tcGxldGVseSBkaWZmZXJlbnQgSUQgYW5kIGNoZWNrIHRoYXQgY29udGV4dCBpbnN0ZWFkIGluIGNoYXRJbnB1dFBhcnQ/XG5cdFx0XHR7fSwgLy8gRW1wdHkgcmVzb3VyY2UgdmlldyBjb250ZXh0XG5cdFx0XHR7XG5cdFx0XHRcdGF1dG9TY3JvbGw6IG1vZGUgPT4gbW9kZSAhPT0gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0cmVuZGVyRm9sbG93dXBzOiBmYWxzZSxcblx0XHRcdFx0c3VwcG9ydHNGaWxlUmVmZXJlbmNlczogdHJ1ZSxcblx0XHRcdFx0cmVuZGVySW5wdXRPblRvcDogdHJ1ZSxcblx0XHRcdFx0cmVuZGVyZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0cmVuZGVyVGV4dEVkaXRzQXNTdW1tYXJ5OiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRcdHJlZmVyZW5jZXNFeHBhbmRlZFdoZW5FbXB0eVJlc3BvbnNlOiBmYWxzZSxcblx0XHRcdFx0XHRwcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2U6IG1vZGUgPT4gbW9kZSAhPT0gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSxcblx0XHRcdFx0ZW5hYmxlSW1wbGljaXRDb250ZXh0OiB0cnVlLFxuXHRcdFx0XHRlbmFibGVXb3JraW5nU2V0OiAnZXhwbGljaXQnLFxuXHRcdFx0XHRzdXBwb3J0c0NoYW5naW5nTW9kZXM6IHRydWUsXG5cdFx0XHRcdHNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUsXG5cdFx0XHRcdHdvcmtzcGFjZVBpY2tlckRlbGVnYXRlLFxuXHRcdFx0XHRzdWJtaXRIYW5kbGVyOiB0aGlzLl9pc0VtcHR5V29ya3NwYWNlID8gKHF1ZXJ5LCBtb2RlKSA9PiB0aGlzLmhhbmRsZVdvcmtzcGFjZVN1Ym1pc3Npb24ocXVlcnksIG1vZGUpIDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGlzdEZvcmVncm91bmQ6IFNJREVfQkFSX0ZPUkVHUk9VTkQsXG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRvdmVybGF5QmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0aW5wdXRFZGl0b3JCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRyZXN1bHRFZGl0b3JCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5jaGF0V2lkZ2V0LnJlbmRlcihjaGF0V2lkZ2V0Q29udGFpbmVyKTtcblx0XHR0aGlzLmNoYXRXaWRnZXQuc2V0VmlzaWJsZSh0cnVlKTtcblxuXHRcdC8vIFNjaGVkdWxlIGluaXRpYWwgbGF5b3V0IGF0IG5leHQgYW5pbWF0aW9uIGZyYW1lIHRvIGVuc3VyZSBwcm9wZXIgaW5wdXQgc2l6aW5nXG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZ2V0V2luZG93KGNoYXRXaWRnZXRDb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmxheW91dENoYXRXaWRnZXQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTdGFydCBhIGNoYXQgc2Vzc2lvbiBzbyB0aGUgd2lkZ2V0IGhhcyBhIHZpZXdNb2RlbFxuXHRcdC8vIFRoaXMgaXMgbmVjZXNzYXJ5IGZvciBhY3Rpb25zIGxpa2UgbW9kZSBzd2l0Y2hpbmcgdG8gd29yayBwcm9wZXJseVxuXHRcdHRoaXMuY2hhdE1vZGVsUmVmID0gdGhpcy5jaGF0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5jaGF0TW9kZWxSZWYpO1xuXHRcdGlmICh0aGlzLmNoYXRNb2RlbFJlZi5vYmplY3QpIHtcblx0XHRcdHRoaXMuY2hhdFdpZGdldC5zZXRNb2RlbCh0aGlzLmNoYXRNb2RlbFJlZi5vYmplY3QpO1xuXHRcdH1cblxuXHRcdC8vIEZvY3VzIHRoZSBpbnB1dCB3aGVuIGNsaWNraW5nIGFueXdoZXJlIGluIHRoZSBjaGF0IHdpZGdldCBhcmVhXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIG91ciB3aWRnZXQgYmVjb21lcyBsYXN0Rm9jdXNlZFdpZGdldCBmb3IgdGhlIGNoYXRXaWRnZXRTZXJ2aWNlXG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjaGF0V2lkZ2V0Q29udGFpbmVyLCAnbW91c2Vkb3duJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5jaGF0V2lkZ2V0Py5mb2N1c0lucHV0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQXV0b21hdGljYWxseSBvcGVuIHRoZSBjaGF0IHZpZXcgd2hlbiBhIHJlcXVlc3QgaXMgc3VibWl0dGVkIGZyb20gdGhpcyB3ZWxjb21lIHZpZXdcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5jaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3QoKHsgY2hhdFNlc3Npb25SZXNvdXJjZSB9KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5jaGF0TW9kZWxSZWY/Lm9iamVjdD8uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IGNoYXRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHQvLyBTZW5kIGNoYXQgc3VibWl0dGVkIHRlbGVtZXRyeVxuXHRcdFx0XHRjb25zdCBtb2RlID0gdGhpcy5jaGF0V2lkZ2V0Py5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKS5uYW1lLmdldCgpIHx8ICd1bmtub3duJztcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRTZXNzaW9uc1dlbGNvbWVDaGF0U3VibWl0dGVkRXZlbnQsIEFnZW50U2Vzc2lvbnNXZWxjb21lQ2hhdFN1Ym1pdHRlZENsYXNzaWZpY2F0aW9uPihcblx0XHRcdFx0XHQnYWdlbnRTZXNzaW9uc1dlbGNvbWUuY2hhdFN1Ym1pdHRlZCcsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bW9kZSxcblx0XHRcdFx0XHRcdHByb3ZpZGVyOiB0aGlzLl9zZWxlY3RlZFNlc3Npb25Qcm92aWRlcixcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUtpbmQ6IHRoaXMuX3dvcmtzcGFjZUtpbmQsXG5cdFx0XHRcdFx0XHRzZWxlY3RlZFJlY2VudFdvcmtzcGFjZTogdGhpcy5fc2VsZWN0ZWRXb3Jrc3BhY2UgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblxuXHRcdFx0XHR0aGlzLl9jbG9zZWRCeSA9ICdjaGF0U3VibWlzc2lvbic7XG5cdFx0XHRcdHRoaXMub3BlblNlc3Npb25JbkNoYXQoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIHByZWZpbGwgZGF0YSBmcm9tIGEgd29ya3NwYWNlIHRyYW5zZmVyXG5cdFx0dGhpcy5hcHBseVByZWZpbGxEYXRhKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZTogSVJlY2VudFdvcmtzcGFjZSB8IElSZWNlbnRGb2xkZXIpOiBzdHJpbmcge1xuXHRcdGlmIChpc1JlY2VudEZvbGRlcih3b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlLmxhYmVsIHx8IGJhc2VuYW1lKHdvcmtzcGFjZS5mb2xkZXJVcmkpO1xuXHRcdH0gZWxzZSBpZiAoaXNSZWNlbnRXb3Jrc3BhY2Uod29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZS5sYWJlbCB8fCBiYXNlbmFtZSh3b3Jrc3BhY2Uud29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmtzcGFjZVVyaSh3b3Jrc3BhY2U6IElSZWNlbnRXb3Jrc3BhY2UgfCBJUmVjZW50Rm9sZGVyKTogVVJJIHtcblx0XHRpZiAoaXNSZWNlbnRGb2xkZXIod29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZS5mb2xkZXJVcmk7XG5cdFx0fSBlbHNlIGlmIChpc1JlY2VudFdvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlLndvcmtzcGFjZS5jb25maWdQYXRoO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgd29ya3NwYWNlIHR5cGUnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlV29ya3NwYWNlU3VibWlzc2lvbihxdWVyeTogc3RyaW5nLCBtb2RlOiBDaGF0TW9kZUtpbmQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyBPbmx5IGhhbmRsZSBpZiBhIHdvcmtzcGFjZSBpcyBzZWxlY3RlZFxuXHRcdGlmICghdGhpcy5fc2VsZWN0ZWRXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIXF1ZXJ5LnRyaW0oKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFN0b3JlIHRoZSBwcmVmaWxsIGRhdGEgZm9yIHRoZSB0YXJnZXQgd29ya3NwYWNlIHRvIHJlYWQgb24gc3RhcnR1cFxuXHRcdGNvbnN0IHByZWZpbGxEYXRhID0ge1xuXHRcdFx0cXVlcnksXG5cdFx0XHRtb2RlLFxuXHRcdFx0dGltZXN0YW1wOiBEYXRlLm5vdygpLFxuXHRcdH07XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdCdjaGF0LndlbGNvbWVWaWV3UHJlZmlsbCcsXG5cdFx0XHRKU09OLnN0cmluZ2lmeShwcmVmaWxsRGF0YSksXG5cdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkVcblx0XHQpO1xuXG5cdFx0Ly8gRmluZCB0aGUgd29ya3NwYWNlIHRvIGRldGVybWluZSBpZiBpdCdzIGEgZm9sZGVyIG9yIHdvcmtzcGFjZSBmaWxlXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5fcmVjZW50VHJ1c3RlZFdvcmtzcGFjZXMuZmluZCh3ID0+XG5cdFx0XHR0aGlzLmdldFdvcmtzcGFjZVVyaSh3KS50b1N0cmluZygpID09PSB0aGlzLl9zZWxlY3RlZFdvcmtzcGFjZT8udXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGlzUmVjZW50Rm9sZGVyKHdvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3sgZm9sZGVyVXJpOiB3b3Jrc3BhY2UuZm9sZGVyVXJpIH1dKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1JlY2VudFdvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt7IHdvcmtzcGFjZVVyaTogd29ya3NwYWNlLndvcmtzcGFjZS5jb25maWdQYXRoIH1dKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gSWdub3JlIGVycm9yc1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZSgnY2hhdC53ZWxjb21lVmlld1ByZWZpbGwnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBhbmQgYXBwbGllcyBwcmVmaWxsIGRhdGEgZnJvbSBzdG9yYWdlICh1c2VkIHdoZW4gdHJhbnNmZXJyaW5nIGNoYXQgaW5wdXQgZnJvbSBhbm90aGVyIHdvcmtzcGFjZSkuXG5cdCAqIFRoaXMgaXMgY2FsbGVkIGFmdGVyIHRoZSBjaGF0IHdpZGdldCBpcyBjcmVhdGVkIHRvIHBvcHVsYXRlIGl0IHdpdGggYW55IHBlbmRpbmcgcHJlZmlsbCBkYXRhLlxuXHQgKi9cblx0cHJpdmF0ZSBhcHBseVByZWZpbGxEYXRhKCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZWZpbGxEYXRhID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoJ2NoYXQud2VsY29tZVZpZXdQcmVmaWxsJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAocHJlZmlsbERhdGEpIHtcblx0XHRcdC8vIFJlbW92ZSBpbW1lZGlhdGVseSB0byBwcmV2ZW50IHJlLWFwcGxpY2F0aW9uXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZSgnY2hhdC53ZWxjb21lVmlld1ByZWZpbGwnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgeyBxdWVyeSwgbW9kZSwgdGltZXN0YW1wIH0gPSBKU09OLnBhcnNlKHByZWZpbGxEYXRhKTtcblx0XHRcdFx0Ly8gSW52YWxpZGF0ZSBlbnRyaWVzIG9sZGVyIHRoYW4gMSBtaW51dGVcblx0XHRcdFx0aWYgKHRpbWVzdGFtcCAmJiBEYXRlLm5vdygpIC0gdGltZXN0YW1wID4gNjAgKiAxMDAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChxdWVyeSAmJiB0aGlzLmNoYXRXaWRnZXQpIHtcblx0XHRcdFx0XHR0aGlzLmNoYXRXaWRnZXQuc2V0SW5wdXQocXVlcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RlICE9PSB1bmRlZmluZWQgJiYgdGhpcy5jaGF0V2lkZ2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5jaGF0V2lkZ2V0LmlucHV0LnNldENoYXRNb2RlKG1vZGUsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBGb2N1cyB0aGUgaW5wdXQgdG8gbWFrZSBpdCBjbGVhciB3ZSd2ZSBwcmVmaWxsZWRcblx0XHRcdFx0dGhpcy5jaGF0V2lkZ2V0Py5mb2N1c0lucHV0KCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gSWdub3JlIG1hbGZvcm1lZCBwcmVmaWxsIGRhdGFcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkU2Vzc2lvbnNPclByb21wdHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIENsZWFyIHByZXZpb3VzIHNlc3Npb25zIGNvbnRyb2xcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnMuZmlsdGVyKHMgPT4gIXMuaXNBcmNoaXZlZCgpKTtcblxuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmJ1aWxkU2Vzc2lvbnNHcmlkKGNvbnRhaW5lciwgc2Vzc2lvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmJ1aWxkV2Fsa3Rocm91Z2hzKGNvbnRhaW5lcik7XG5cdFx0fVxuXHR9XG5cblxuXHRwcml2YXRlIGJ1aWxkU2Vzc2lvbnNHcmlkKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIF9zZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0Ly8gU2hvdyBjYWNoZWQgc2Vzc2lvbnMgaW1tZWRpYXRlbHkgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2Ugc2hvdyBsb2FkaW5nIHNrZWxldG9uXG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtc2Vzc2lvbnNHcmlkJykpO1xuXHRcdGNvbnN0IG9wdGlvbnM6IElBZ2VudFNlc3Npb25zQ29udHJvbE9wdGlvbnMgPSB7XG5cdFx0XHRvdmVycmlkZVN0eWxlczogZ2V0TGlzdFN0eWxlcyh7XG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0fSksXG5cdFx0XHRmaWx0ZXI6IHRoaXMuc2Vzc2lvbnNDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc0ZpbHRlciwge1xuXHRcdFx0XHRsaW1pdFJlc3VsdHM6ICgpID0+IE1BWF9TRVNTSU9OUyxcblx0XHRcdFx0b3ZlcnJpZGVFeGNsdWRlOiAoc2Vzc2lvbikgPT4gc2Vzc2lvbi5pc0FyY2hpdmVkKCkgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdFx0fSkpLFxuXHRcdFx0Z2V0SG92ZXJQb3NpdGlvbjogKCkgPT4gSG92ZXJQb3NpdGlvbi5CRUxPVyxcblx0XHRcdHRyYWNrQWN0aXZlRWRpdG9yU2Vzc2lvbjogKCkgPT4gZmFsc2UsXG5cdFx0XHRzb3VyY2U6ICd3ZWxjb21lVmlldycsXG5cdFx0XHRpdGVtSGVpZ2h0OiBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlLklURU1fSEVJR0hULFxuXHRcdFx0c2VjdGlvbkhlaWdodDogQWdlbnRTZXNzaW9uc0xpc3REZWxlZ2F0ZS5TRUNUSU9OX0hFSUdIVCxcblx0XHRcdG5vdGlmeVNlc3Npb25PcGVuZWQ6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaXNQcm9qZWN0aW9uRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRTZXNzaW9uUHJvamVjdGlvbkVuYWJsZWQpO1xuXHRcdFx0XHRpZiAoIWlzUHJvamVjdGlvbkVuYWJsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9jbG9zZWRCeSA9ICdzZXNzaW9uQ2xpY2tlZCc7XG5cdFx0XHRcdFx0dGhpcy5yZXZlYWxNYXhpbWl6ZWRDaGF0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wgPSB0aGlzLnNlc3Npb25zQ29udHJvbERpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QWdlbnRTZXNzaW9uc0NvbnRyb2wsXG5cdFx0XHR0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lcixcblx0XHRcdG9wdGlvbnNcblx0XHQpKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgbG9hZGluZyBzdGF0ZSBjaGFuZ2VzIHRvIHRvZ2dsZSBza2VsZXRvbiB2aXNpYmlsaXR5XG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xEaXNwb3NhYmxlcy5hZGQodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZFJlc29sdmUoKCkgPT4ge1xuXHRcdFx0dGhpcy5sYXlvdXRTZXNzaW9uc0NvbnRyb2woKTtcblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5yZXNvbHZlZCkge1xuXHRcdFx0dGhpcy5sYXlvdXRTZXNzaW9uc0NvbnRyb2woKTtcblx0XHR9XG5cblx0XHQvLyBTY2hlZHVsZSBsYXlvdXQgYXQgbmV4dCBhbmltYXRpb24gZnJhbWUgdG8gZW5zdXJlIHByb3BlciByZW5kZXJpbmdcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbERpc3Bvc2FibGVzLmFkZChzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lciksICgpID0+IHtcblx0XHRcdHRoaXMubGF5b3V0U2Vzc2lvbnNDb250cm9sKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gXCJUcnkgb3V0IHRoZSBuZXcgQWdlbnRzIGFwcFwiIGJhbm5lclxuXHRcdGlmIChjYW5TaG93QWdlbnRzQmFubmVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZSkpIHtcblx0XHRcdGNvbnN0IGFnZW50c0Jhbm5lciA9IGNyZWF0ZUFnZW50c0Jhbm5lcihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNzc0NsYXNzOiAnYWdlbnRTZXNzaW9uc1dlbGNvbWUtYWdlbnRzQmFubmVyJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdhZ2VudFNlc3Npb25zV2VsY29tZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd2aWV3QWxsU2Vzc2lvbnMnLCBcIlZpZXcgQWxsIFNlc3Npb25zXCIpLFxuXHRcdFx0XHRcdG9uQnV0dG9uQ2xpY2s6ICgpID0+IHsgdGhpcy5fY2xvc2VkQnkgPSAndmlld0FsbFNlc3Npb25zJzsgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZSxcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sRGlzcG9zYWJsZXMuYWRkKGFnZW50c0Jhbm5lci5kaXNwb3NhYmxlcyk7XG5cdFx0XHRhcHBlbmQoY29udGFpbmVyLCBhZ2VudHNCYW5uZXIuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBidWlsZFdhbGt0aHJvdWdocyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlV2Fsa3Rocm91Z2hzID0gdGhpcy53YWxrdGhyb3VnaHMuZmlsdGVyKHcgPT5cblx0XHRcdCF3LndoZW4gfHwgdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHcud2hlbilcblx0XHQpLnNsaWNlKDAsIE1BWF9XQUxLVEhST1VHSFMpO1xuXG5cdFx0aWYgKGFjdGl2ZVdhbGt0aHJvdWdocy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgY3VycmVudEluZGV4ID0gMDtcblxuXHRcdGNvbnN0IGNhcmQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtd2Fsa3Rocm91Z2hDYXJkJykpO1xuXG5cdFx0Ly8gSWNvblxuXHRcdGNvbnN0IGljb25Db250YWluZXIgPSBhcHBlbmQoY2FyZCwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXdhbGt0aHJvdWdoQ2FyZC1pY29uJykpO1xuXG5cdFx0Ly8gQ29udGVudFxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhcHBlbmQoY2FyZCwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXdhbGt0aHJvdWdoQ2FyZC1jb250ZW50JykpO1xuXHRcdGNvbnN0IHRpdGxlID0gYXBwZW5kKGNvbnRlbnQsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS13YWxrdGhyb3VnaENhcmQtdGl0bGUnKSk7XG5cdFx0Y29uc3QgZGVzYyA9IGFwcGVuZChjb250ZW50LCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtd2Fsa3Rocm91Z2hDYXJkLWRlc2NyaXB0aW9uJykpO1xuXG5cdFx0Ly8gTmF2aWdhdGlvbiBhcnJvd3MgY29udGFpbmVyXG5cdFx0Y29uc3QgbmF2Q29udGFpbmVyID0gYXBwZW5kKGNhcmQsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS13YWxrdGhyb3VnaENhcmQtbmF2JykpO1xuXHRcdGNvbnN0IHByZXZCdXR0b24gPSBhcHBlbmQobmF2Q29udGFpbmVyLCAkKCdidXR0b24ubmF2LWJ1dHRvbicpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRwcmV2QnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uTGVmdCkpO1xuXHRcdHByZXZCdXR0b24udGl0bGUgPSBsb2NhbGl6ZSgncHJldmlvdXNXYWxrdGhyb3VnaCcsIFwiUHJldmlvdXNcIik7XG5cblx0XHRjb25zdCBuZXh0QnV0dG9uID0gYXBwZW5kKG5hdkNvbnRhaW5lciwgJCgnYnV0dG9uLm5hdi1idXR0b24nKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0bmV4dEJ1dHRvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2hldnJvblJpZ2h0KSk7XG5cdFx0bmV4dEJ1dHRvbi50aXRsZSA9IGxvY2FsaXplKCduZXh0V2Fsa3Rocm91Z2gnLCBcIk5leHRcIik7XG5cblx0XHRjb25zdCB1cGRhdGVDb250ZW50ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2Fsa3Rocm91Z2ggPSBhY3RpdmVXYWxrdGhyb3VnaHNbY3VycmVudEluZGV4XTtcblxuXHRcdFx0Ly8gVXBkYXRlIGljb25cblx0XHRcdGNsZWFyTm9kZShpY29uQ29udGFpbmVyKTtcblx0XHRcdGlmICh3YWxrdGhyb3VnaC5pY29uLnR5cGUgPT09ICdpY29uJykge1xuXHRcdFx0XHRpY29uQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlckljb24od2Fsa3Rocm91Z2guaWNvbi5pY29uKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSBjb250ZW50XG5cdFx0XHR0aXRsZS50ZXh0Q29udGVudCA9IHdhbGt0aHJvdWdoLnRpdGxlO1xuXHRcdFx0ZGVzYy50ZXh0Q29udGVudCA9IHdhbGt0aHJvdWdoLmRlc2NyaXB0aW9uIHx8ICcnO1xuXG5cdFx0XHQvLyBVcGRhdGUgbmF2aWdhdGlvbiBidXR0b24gc3RhdGVzXG5cdFx0XHRwcmV2QnV0dG9uLmRpc2FibGVkID0gY3VycmVudEluZGV4ID09PSAwO1xuXHRcdFx0bmV4dEJ1dHRvbi5kaXNhYmxlZCA9IGN1cnJlbnRJbmRleCA9PT0gYWN0aXZlV2Fsa3Rocm91Z2hzLmxlbmd0aCAtIDE7XG5cdFx0fTtcblxuXHRcdC8vIEluaXRpYWxpemUgY29udGVudFxuXHRcdHVwZGF0ZUNvbnRlbnQoKTtcblxuXHRcdGNhcmQub25jbGljayA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHdhbGt0aHJvdWdoID0gYWN0aXZlV2Fsa3Rocm91Z2hzW2N1cnJlbnRJbmRleF07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZ2VudFNlc3Npb25zV2VsY29tZUFjdGlvbkV2ZW50LCBBZ2VudFNlc3Npb25zV2VsY29tZUFjdGlvbkNsYXNzaWZpY2F0aW9uPihcblx0XHRcdFx0J2FnZW50U2Vzc2lvbnNXZWxjb21lLkFjdGlvbkV4ZWN1dGVkJyxcblx0XHRcdFx0eyB3ZWxjb21lS2luZDogJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZScsIGFjdGlvbjogJ29wZW5XYWxrdGhyb3VnaCcsIGFjdGlvbklkOiB3YWxrdGhyb3VnaC5pZCB9XG5cdFx0XHQpO1xuXHRcdFx0Ly8gT3BlbiB3YWxrdGhyb3VnaCB3aXRoIHJldHVyblRvQ29tbWFuZCBzbyBiYWNrIGJ1dHRvbiByZXR1cm5zIHRvIGFnZW50IHNlc3Npb25zIHdlbGNvbWVcblx0XHRcdGNvbnN0IG9wdGlvbnM6IEdldHRpbmdTdGFydGVkRWRpdG9yT3B0aW9ucyA9IHtcblx0XHRcdFx0c2VsZWN0ZWRDYXRlZ29yeTogd2Fsa3Rocm91Z2guaWQsXG5cdFx0XHRcdHJldHVyblRvQ29tbWFuZDogQWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlLkNPTU1BTkRfSUQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogR2V0dGluZ1N0YXJ0ZWRJbnB1dC5SRVNPVVJDRSxcblx0XHRcdFx0b3B0aW9uc1xuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdHByZXZCdXR0b24ub25jbGljayA9IChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aWYgKGN1cnJlbnRJbmRleCA+IDApIHtcblx0XHRcdFx0Y3VycmVudEluZGV4LS07XG5cdFx0XHRcdHVwZGF0ZUNvbnRlbnQoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bmV4dEJ1dHRvbi5vbmNsaWNrID0gKGUpID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRpZiAoY3VycmVudEluZGV4IDwgYWN0aXZlV2Fsa3Rocm91Z2hzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0Y3VycmVudEluZGV4Kys7XG5cdFx0XHRcdHVwZGF0ZUNvbnRlbnQoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUFJJVkFDWV9OT1RJQ0VfRElTTUlTU0VEX0tFWSA9ICdhZ2VudFNlc3Npb25zV2VsY29tZS5wcml2YWN5Tm90aWNlRGlzbWlzc2VkJztcblxuXHRwcml2YXRlIGJ1aWxkUHJpdmFjeU5vdGljZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gVE9TL1ByaXZhY3kgbm90aWNlIGZvciB1c2VycyB3aG8gYXJlIG5vdCBzaWduZWQgaW4gLSByZXVzaW5nIHdhbGt0aHJvdWdoIGNhcmQgZGVzaWduXG5cdFx0aWYgKCF0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdXNlciBoYXMgZGlzbWlzc2VkIHRoZSBub3RpY2Vcblx0XHRpZiAodGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEFnZW50U2Vzc2lvbnNXZWxjb21lUGFnZS5QUklWQUNZX05PVElDRV9ESVNNSVNTRURfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50O1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IGFnZW50Py5wcm92aWRlcjtcblx0XHRpZiAoIXByb3ZpZGVycyB8fCAhcHJvdmlkZXJzLmRlZmF1bHQgfHwgIWFnZW50Py50ZXJtc1N0YXRlbWVudFVybCB8fCAhYWdlbnQucHJpdmFjeVN0YXRlbWVudFVybCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvc0NhcmQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtd2Fsa3Rocm91Z2hDYXJkLmFnZW50U2Vzc2lvbnNXZWxjb21lLXRvc0NhcmQnKSk7XG5cblx0XHRjb25zdCBkaXNtaXNzTm90aWNlID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UuUFJJVkFDWV9OT1RJQ0VfRElTTUlTU0VEX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0dG9zQ2FyZC5yZW1vdmUoKTtcblx0XHR9O1xuXG5cdFx0Ly8gRGlzbWlzcyB0aGUgbm90aWNlIHdoZW4gYSBjaGF0IHJlcXVlc3QgaXMgc2VudFxuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmNoYXRTZXJ2aWNlLm9uRGlkU3VibWl0UmVxdWVzdCgoKSA9PiBkaXNtaXNzTm90aWNlKCkpKTtcblxuXHRcdC8vIEljb25cblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gYXBwZW5kKHRvc0NhcmQsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS13YWxrdGhyb3VnaENhcmQtaWNvbicpKTtcblx0XHRpY29uQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaGF0U3BhcmtsZSkpO1xuXG5cdFx0Ly8gQ29udGVudFxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhcHBlbmQodG9zQ2FyZCwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXdhbGt0aHJvdWdoQ2FyZC1jb250ZW50JykpO1xuXHRcdGNvbnN0IHRpdGxlID0gYXBwZW5kKGNvbnRlbnQsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS13YWxrdGhyb3VnaENhcmQtdGl0bGUnKSk7XG5cdFx0dGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndG9zVGl0bGUnLCBcIkZvcmdlIHVzZXMgQ29kZXguIFJldmlldyB0aGUgdGVybXMgYmVmb3JlIHlvdSBzdGFydC5cIik7XG5cblx0XHRjb25zdCBkZXNjID0gYXBwZW5kKGNvbnRlbnQsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS13YWxrdGhyb3VnaENhcmQtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25NYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHR7IGtleTogJ3Rvc0Rlc2NyaXB0aW9uJywgY29tbWVudDogWyd7TG9ja2VkPVwiXSh7MX0pXCJ9JywgJ3tMb2NrZWQ9XCJdKHsyfSlcIn0nXSB9LFxuXHRcdFx0XHRcIkJ5IGNvbnRpbnVpbmcsIHlvdSBhZ3JlZSB0byB7MH0ncyBbVGVybXNdKHsxfSkgYW5kIFtQcml2YWN5IFN0YXRlbWVudF0oezJ9KS5cIixcblx0XHRcdFx0cHJvdmlkZXJzLmRlZmF1bHQubmFtZSxcblx0XHRcdFx0YWdlbnQudGVybXNTdGF0ZW1lbnRVcmwsXG5cdFx0XHRcdGFnZW50LnByaXZhY3lTdGF0ZW1lbnRVcmxcblx0XHRcdCksXG5cdFx0XHR7IGlzVHJ1c3RlZDogdHJ1ZSB9XG5cdFx0KTtcblx0XHRjb25zdCByZW5kZXJlZE1hcmtkb3duID0gdGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoZGVzY3JpcHRpb25NYXJrZG93bik7XG5cdFx0ZGVzYy5hcHBlbmRDaGlsZChyZW5kZXJlZE1hcmtkb3duLmVsZW1lbnQpO1xuXG5cdFx0Ly8gRGlzbWlzcyBidXR0b25cblx0XHRjb25zdCBkaXNtaXNzQnV0dG9uID0gYXBwZW5kKHRvc0NhcmQsICQoJ2J1dHRvbi5hZ2VudFNlc3Npb25zV2VsY29tZS10b3NDYXJkLWRpc21pc3MnKSk7XG5cdFx0ZGlzbWlzc0J1dHRvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2xvc2UpKTtcblx0XHRkaXNtaXNzQnV0dG9uLnRpdGxlID0gbG9jYWxpemUoJ2Rpc21pc3NQcml2YWN5Tm90aWNlJywgXCJEaXNtaXNzXCIpO1xuXHRcdGRpc21pc3NCdXR0b24ub25jbGljayA9IChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0ZGlzbWlzc05vdGljZSgpO1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkRm9vdGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBQcml2YWN5IG5vdGljZVxuXHRcdHRoaXMuYnVpbGRQcml2YWN5Tm90aWNlKGNvbnRhaW5lcik7XG5cblx0XHQvLyBTaG93IG9uIHN0YXJ0dXAgY2hlY2tib3hcblx0XHRjb25zdCBzaG93T25TdGFydHVwQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXNob3dPblN0YXJ0dXAnKSk7XG5cdFx0Y29uc3Qgc2hvd09uU3RhcnR1cENoZWNrYm94ID0gdGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBUb2dnbGUoe1xuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdGFjdGlvbkNsYXNzTmFtZTogJ2FnZW50U2Vzc2lvbnNXZWxjb21lLWNoZWNrYm94Jyxcblx0XHRcdGlzQ2hlY2tlZDogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShjb25maWd1cmF0aW9uS2V5KSA9PT0gJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoZWNrYm94VGl0bGUnLCBcIldoZW4gY2hlY2tlZCwgdGhpcyBwYWdlIHdpbGwgYmUgc2hvd24gb24gc3RhcnR1cC5cIiksXG5cdFx0XHQuLi5nZXRUb2dnbGVTdHlsZXMoe1xuXHRcdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKScsXG5cdFx0XHRcdGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1lZGl0b3ItYmFja2dyb3VuZCknLFxuXHRcdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJvcmRlcjogJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJyxcblx0XHRcdH0pXG5cdFx0fSkpO1xuXHRcdHNob3dPblN0YXJ0dXBDaGVja2JveC5kb21Ob2RlLmlkID0gJ3Nob3dPblN0YXJ0dXAnO1xuXHRcdGNvbnN0IHNob3dPblN0YXJ0dXBMYWJlbCA9ICQoJ2xhYmVsLmNhcHRpb24nLCB7IGZvcjogJ3Nob3dPblN0YXJ0dXAnIH0sIGxvY2FsaXplKCdzaG93T25TdGFydHVwJywgXCJTaG93IHdlbGNvbWUgcGFnZSBvbiBzdGFydHVwXCIpKTtcblxuXHRcdGNvbnN0IG9uU2hvd09uU3RhcnR1cENoYW5nZWQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoc2hvd09uU3RhcnR1cENoZWNrYm94LmNoZWNrZWQpIHtcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShjb25maWd1cmF0aW9uS2V5LCAnYWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGNvbmZpZ3VyYXRpb25LZXksICdub25lJyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChzaG93T25TdGFydHVwQ2hlY2tib3gub25DaGFuZ2UoKCkgPT4gb25TaG93T25TdGFydHVwQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzaG93T25TdGFydHVwTGFiZWwsICdjbGljaycsICgpID0+IHtcblx0XHRcdHNob3dPblN0YXJ0dXBDaGVja2JveC5jaGVja2VkID0gIXNob3dPblN0YXJ0dXBDaGVja2JveC5jaGVja2VkO1xuXHRcdFx0b25TaG93T25TdGFydHVwQ2hhbmdlZCgpO1xuXHRcdH0pKTtcblxuXHRcdHNob3dPblN0YXJ0dXBDb250YWluZXIuYXBwZW5kQ2hpbGQoc2hvd09uU3RhcnR1cENoZWNrYm94LmRvbU5vZGUpO1xuXHRcdHNob3dPblN0YXJ0dXBDb250YWluZXIuYXBwZW5kQ2hpbGQoc2hvd09uU3RhcnR1cExhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgbGFzdERpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMubGFzdERpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtkaW1lbnNpb24uaGVpZ2h0fXB4YDtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke2RpbWVuc2lvbi53aWR0aH1weGA7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGVpZ2h0LWNvbnN0cmFpbmVkJywgZGltZW5zaW9uLmhlaWdodCA8PSBXRUxDT01FX0NPTVBBQ1RfSEVJR0hUKTtcblxuXHRcdC8vIExheW91dCBjaGF0IHdpZGdldFxuXHRcdHRoaXMubGF5b3V0Q2hhdFdpZGdldCgpO1xuXG5cdFx0Ly8gTGF5b3V0IHNlc3Npb25zIGNvbnRyb2xcblx0XHR0aGlzLmxheW91dFNlc3Npb25zQ29udHJvbCgpO1xuXG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudD8uc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0Q2hhdFdpZGdldCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2hhdFdpZGdldCB8fCAhdGhpcy5sYXN0RGltZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFdpZHRoID0gTWF0aC5taW4oODAwLCB0aGlzLmxhc3REaW1lbnNpb24ud2lkdGggLSA4MCk7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LnNldElucHV0UGFydE1heEhlaWdodE92ZXJyaWRlKFdFTENPTUVfQ0hBVF9JTlBVVF9NQVhfSEVJR0hUX09WRVJSSURFKTtcblx0XHR0aGlzLmNoYXRXaWRnZXQubGF5b3V0KFdFTENPTUVfQ0hBVF9JTlBVVF9MQVlPVVRfSEVJR0hULCBjaGF0V2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRTZXNzaW9uc0NvbnRyb2woKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNlc3Npb25zQ29udHJvbCB8fCAhdGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIgfHwgIXRoaXMubGFzdERpbWVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRPRE86IEBvc29ydGVnYSB0aGlzIGlzIGEgd2VpcmQgd2F5IG9mIGRvaW5nIHRoaXMsIG1heWJlIHdlIGhhbmRsZSB0aGUgMi1jb2x1bSBsYXlvdXQgaW4gdGhlIGNvbnRyb2wgaXRzZWxmP1xuXHRcdGNvbnN0IHNlc3Npb25zV2lkdGggPSBNYXRoLm1pbig4MDAsIHRoaXMubGFzdERpbWVuc2lvbi53aWR0aCAtIDgwKTtcblx0XHQvLyBDYWxjdWxhdGUgaGVpZ2h0IGJhc2VkIG9uIGFjdHVhbCB2aXNpYmxlIHNlc3Npb25zIChjYXBwZWQgYXQgTUFYX1NFU1NJT05TKVxuXHRcdC8vIFVzZSBJVEVNX0hFSUdIVCBwZXIgaXRlbSBmcm9tIEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGVcblx0XHQvLyBHaXZlIHRoZSBsaXN0IEZVTEwgaGVpZ2h0IHNvIHZpcnR1YWxpemF0aW9uIHJlbmRlcnMgYWxsIGl0ZW1zXG5cdFx0Ly8gQ1NTIHRyYW5zZm9ybXMgaGFuZGxlIHRoZSAyLWNvbHVtbiB2aXN1YWwgbGF5b3V0XG5cdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25zID0gTWF0aC5taW4oXG5cdFx0XHR0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzID0+ICFzLmlzQXJjaGl2ZWQoKSkubGVuZ3RoLFxuXHRcdFx0TUFYX1NFU1NJT05TXG5cdFx0KTtcblx0XHRjb25zdCBzZXNzaW9uc0hlaWdodCA9IHZpc2libGVTZXNzaW9ucyAqIEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wubGF5b3V0KHNlc3Npb25zSGVpZ2h0LCBzZXNzaW9uc1dpZHRoKTtcblxuXHRcdC8vIFNldCBtYXJnaW4gb2Zmc2V0IGZvciAyLWNvbHVtbiBsYXlvdXQ6IGFjdHVhbCBoZWlnaHQgLSB2aXN1YWwgaGVpZ2h0XG5cdFx0Ly8gVmlzdWFsIGhlaWdodCA9IGNlaWwobi8yKSAqIElURU1fSEVJR0hULCBzbyBvZmZzZXQgPSBmbG9vcihuLzIpICogSVRFTV9IRUlHSFRcblx0XHRjb25zdCBtYXJnaW5PZmZzZXQgPSBNYXRoLmZsb29yKHZpc2libGVTZXNzaW9ucyAvIDIpICogQWdlbnRTZXNzaW9uc0xpc3REZWxlZ2F0ZS5JVEVNX0hFSUdIVDtcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbC5lbGVtZW50IS5zdHlsZS5tYXJnaW5Cb3R0b20gPSBgLSR7bWFyZ2luT2Zmc2V0fXB4YDtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0Py5mb2N1c0lucHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJldmVhbE1heGltaXplZENoYXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY2xvc2VFZGl0b3JBbmRNYXhpbWl6ZUF1eGlsaWFyeUJhcigpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBvcGVuIG1heGltaXplZCBjaGF0OiB7MH0nLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlblNlc3Npb25JbkNoYXQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jbG9zZUVkaXRvckFuZE1heGltaXplQXV4aWxpYXJ5QmFyKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIG9wZW4gYWdlbnQgc2Vzc2lvbjogezB9JywgdG9FcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsb3NlRWRpdG9yQW5kTWF4aW1pemVBdXhpbGlhcnlCYXIoc2Vzc2lvblJlc291cmNlPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yVG9DbG9zZSA9IHRoaXMuaW5wdXQgfHwgdGhpcy5fc3RvcmVkSW5wdXQ7XG5cblx0XHRpZiAoZWRpdG9yVG9DbG9zZSAmJiB0aGlzLmdyb3VwLmNvbnRhaW5zKGVkaXRvclRvQ2xvc2UpKSB7XG5cdFx0XHQvLyBXYWl0IHVudGlsIHRoZSBhY3RpdmUgZWRpdG9yIGNoYW5nZWQgc28gdGhhdCB0aGUgY2hhdCBkb2Vzbid0IHRvZ2dsZSBiYWNrXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuZ3JvdXAub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLmdyb3VwLmNsb3NlRWRpdG9yKGVkaXRvclRvQ2xvc2UpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdC8vIE5vdyBwcm9jZWVkIHdpdGggb3BlbmluZyBjaGF0IGFuZCBtYXhpbWl6aW5nXG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbicpO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0Vmlld0xvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZChDaGF0Vmlld0lkKTtcblx0XHRpZiAoY2hhdFZpZXdMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikge1xuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldEF1eGlsaWFyeUJhck1heGltaXplZCh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFJlY2VudGx5T3BlbmVkV29ya3NwYWNlcyhvbmx5VHJ1c3RlZDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxBcnJheTxJUmVjZW50V29ya3NwYWNlIHwgSVJlY2VudEZvbGRlcj4+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VzID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRseU9wZW5lZCgpO1xuXHRcdGNvbnN0IHRydXN0SW5mb1Byb21pc2VzID0gd29ya3NwYWNlcy53b3Jrc3BhY2VzLm1hcChhc3luYyB3cyA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBpc1JlY2VudFdvcmtzcGFjZSh3cykgPyB3cy53b3Jrc3BhY2UuY29uZmlnUGF0aCA6IHdzLmZvbGRlclVyaTtcblx0XHRcdGNvbnN0IHRydXN0SW5mbyA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRVcmlUcnVzdEluZm8odXJpKTtcblx0XHRcdHJldHVybiB7IHdvcmtzcGFjZTogd3MsIHRydXN0ZWQ6IHRydXN0SW5mby50cnVzdGVkIH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgdHJ1c3RJbmZvUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHRydXN0SW5mb1Byb21pc2VzKTtcblx0XHRjb25zdCBmaWx0ZXJlZFdvcmtzcGFjZXMgPSB0cnVzdEluZm9SZXN1bHRzXG5cdFx0XHQuZmlsdGVyKHJlc3VsdCA9PiBvbmx5VHJ1c3RlZCA/IHJlc3VsdC50cnVzdGVkIDogdHJ1ZSlcblx0XHRcdC5tYXAocmVzdWx0ID0+IHJlc3VsdC53b3Jrc3BhY2UpO1xuXHRcdHJldHVybiBmaWx0ZXJlZFdvcmtzcGFjZXM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvbnNXZWxjb21lSW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEFnZW50U2Vzc2lvbnNXZWxjb21lSW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHNlcmlhbGl6ZShlZGl0b3JJbnB1dDogQWdlbnRTZXNzaW9uc1dlbGNvbWVJbnB1dCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHt9KTtcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcmlhbGl6ZWRFZGl0b3JJbnB1dDogc3RyaW5nKTogQWdlbnRTZXNzaW9uc1dlbGNvbWVJbnB1dCB7XG5cdFx0cmV0dXJuIG5ldyBBZ2VudFNlc3Npb25zV2VsY29tZUlucHV0KHt9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLHVCQUF1QixRQUFRLFdBQXNCLFdBQVcsb0NBQW9DO0FBQ2hILFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsY0FBYztBQUN2QixTQUFTLHlCQUF5QjtBQUNs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
