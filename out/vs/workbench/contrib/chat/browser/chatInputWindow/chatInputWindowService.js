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
import "./media/chatInputWindow.css";
import * as dom from "../../../../../base/browser/dom.js";
import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { DeferredPromise, disposableTimeout, timeout } from "../../../../../base/common/async.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { AnchorPosition } from "../../../../../base/common/layout.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { ILayoutService } from "../../../../../platform/layout/browser/layoutService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IAuxiliaryWindowService } from "../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable } from "../../../../../platform/theme/common/colorUtils.js";
import { chartsOrange } from "../../../../../platform/theme/common/colors/chartsColors.js";
import { editorBackground } from "../../../../../platform/theme/common/colorRegistry.js";
import { inputBackground, inputBorder } from "../../../../../platform/theme/common/colors/inputColors.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { localize } from "../../../../../nls.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { ChatMode } from "../../common/chatModes.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../common/chatService/chatService.js";
import { isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatWidget } from "../widget/chatWidget.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { ChatSessionRoutingController } from "../sessionRouter/chatSessionRoutingController.js";
import { combineVoiceInput } from "../voiceClient/voiceInputUtils.js";
import { IChatInputWindowService, ChatInputWindowStorageKeys, CHAT_INPUT_WINDOW_DEFAULT_HEIGHT, CHAT_INPUT_WINDOW_SET_VOICE_TARGET_COMMAND_ID, getChatInputWindowBounds } from "../../common/chatInputWindow.js";
import { autorun, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { AgentSessionStatus } from "../agentSessions/agentSessionsModel.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { IVoiceSessionController } from "../voiceClient/voiceSessionController.js";
import { IMicCaptureService } from "../voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../voiceClient/ttsPlaybackService.js";
import { setupVoiceInputDecorations } from "../voiceClient/voiceInputDecorations.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { getQuickInputWidth } from "../../../../../platform/quickinput/browser/quickInputController.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IChatSessionRoutingProviderService, OmniChatEnabledSettingId } from "../../common/sessionRouter.js";
import { QuickInputService } from "../../../../services/quickinput/browser/quickInputService.js";
import { AgentSessionProviders } from "../agentSessions/agentSessions.js";
import { derivePendingId, getVoiceToolApprovalCommand, isPendingIdResolved, markPendingIdResolved } from "../../common/voiceClient/voiceClientService.js";
import { ConfirmationOptionKind } from "../../../../../platform/agentHost/common/state/protocol/state.js";
const CHAT_INPUT_WINDOW_ACTION_WIDGET_HEIGHT = 420;
const CHAT_INPUT_WINDOW_ACTION_WIDGET_WIDTH = 420;
const CHAT_INPUT_WINDOW_ACTION_WIDGET_MARGIN = 4;
const CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT = 44;
const CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT = 360;
const CHAT_INPUT_WINDOW_MIN_CONFIRMATION_HEIGHT = 112;
const CHAT_INPUT_WINDOW_CONTEXT_PICKER_TRANSITION_DELAY = 100;
function getDescendantElements(parent, className) {
  const result = [];
  const visit = (element) => {
    for (const child of element.children) {
      if (!dom.isHTMLElement(child)) {
        continue;
      }
      if (!className || child.classList.contains(className)) {
        result.push(child);
      }
      visit(child);
    }
  };
  visit(parent);
  return result;
}
let ChatInputWindowService = class extends Disposable {
  constructor(auxiliaryWindowService, storageService, themeService, workspaceContextService, instantiationService, contextKeyService, chatService, commandService, agentSessionsService, logService, voiceSessionController, micCaptureService, ttsPlaybackService, accessibilityService, configurationService, keybindingService, chatEntitlementService, hostService, fileDialogService, routingProviderService) {
    super();
    this.auxiliaryWindowService = auxiliaryWindowService;
    this.storageService = storageService;
    this.themeService = themeService;
    this.workspaceContextService = workspaceContextService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.chatService = chatService;
    this.commandService = commandService;
    this.agentSessionsService = agentSessionsService;
    this.logService = logService;
    this.voiceSessionController = voiceSessionController;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.accessibilityService = accessibilityService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.chatEntitlementService = chatEntitlementService;
    this.hostService = hostService;
    this.fileDialogService = fileDialogService;
    this.routingProviderService = routingProviderService;
    this._onDidChangeOpen = this._register(new Emitter());
    this.onDidChangeOpen = this._onDidChangeOpen.event;
    this._auxiliaryWindowRef = this._register(new MutableDisposable());
    this._windowDisposables = this._register(new DisposableStore());
    this._pendingResolvedInteractionCheck = this._register(new MutableDisposable());
    this._pendingPromptIndex = 0;
    this._dismissedPendingRequests = observableValue(this, /* @__PURE__ */ new Set());
    this._dismissedCIFailures = observableValue(this, /* @__PURE__ */ new Set());
    this._ciFailureProviders = observableValue(this, []);
    this._fitWindowToContent = () => {
    };
    this._desiredOpen = false;
    this._ownershipId = mainWindow.crypto.randomUUID();
    this._actionWidgetWindow = this._register(new MutableDisposable());
    this._actionWidgetLayoutGeneration = 0;
    this._actionWidgetVisibilityCount = 0;
    this._actionWidgetWindowAnchorY = 0;
    this._actionWidgetAnchorPosition = AnchorPosition.BELOW;
    this._actionWidgetPlacement = "above";
    this._contextPicker = this._register(new MutableDisposable());
    /** Bounds of the window that invoked omni, captured before the auxiliary window opens. */
    this._invokingWindowBounds = this._windowBounds(mainWindow);
    this._invokingWindow = mainWindow;
    const ownershipChannel = new BroadcastChannel("chat-input-window-ownership");
    ownershipChannel.onmessage = (e) => {
      const incoming = e.data;
      if (incoming?.type !== "claim" || typeof incoming.timestamp !== "number" || typeof incoming.id !== "string") {
        return;
      }
      const current = this._ownershipClaim;
      const incomingWins = !current || incoming.timestamp > current.timestamp || incoming.timestamp === current.timestamp && incoming.id > current.id;
      if (incomingWins) {
        this.closeWindow();
      }
    };
    this._register({ dispose: () => ownershipChannel.close() });
    this._ownershipChannel = ownershipChannel;
    this._register(dom.addDisposableListener(mainWindow, "beforeunload", () => {
      if (this._window) {
        this.closeWindow();
      }
    }));
    const wasOpen = this.storageService.getBoolean(ChatInputWindowStorageKeys.WindowOpen, StorageScope.WORKSPACE, false);
    if (wasOpen) {
      this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    this._dismissedCIFailures.set(new Set(
      this.storageService.getObject(ChatInputWindowStorageKeys.DismissedCIFailures, StorageScope.PROFILE, [])
    ), void 0);
    const closeAndResetPositionWhenDisabled = () => {
      if (!this._isEnabled()) {
        this.closeWindow();
        this.storageService.remove(ChatInputWindowStorageKeys.WindowPositionOffset, StorageScope.WORKSPACE);
      }
    };
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(OmniChatEnabledSettingId)) {
        closeAndResetPositionWhenDisabled();
      }
    }));
    this._register(this.chatEntitlementService.onDidChangeSentiment(closeAndResetPositionWhenDisabled));
    closeAndResetPositionWhenDisabled();
  }
  get isOpen() {
    return !!this._window;
  }
  get hasFocus() {
    return this._window?.window.document.hasFocus() ?? false;
  }
  registerCIFailureProvider(provider) {
    this._ciFailureProviders.set([...this._ciFailureProviders.get(), provider], void 0);
    return toDisposable(() => {
      const providers = this._ciFailureProviders.get();
      const index = providers.indexOf(provider);
      if (index >= 0) {
        this._ciFailureProviders.set(providers.filter((candidate) => candidate !== provider), void 0);
      }
    });
  }
  async openWindow(invokingWindowBounds) {
    if (!this._isEnabled()) {
      return;
    }
    this._desiredOpen = true;
    if (this._window) {
      return;
    }
    if (this._openOperation) {
      return this._openOperation;
    }
    this._invokingWindow = dom.getActiveWindow();
    this._invokingWindowBounds = this._isUsableWindowBounds(invokingWindowBounds) ? invokingWindowBounds : this._windowBounds(this._invokingWindow);
    this._openOperation = this._doOpenWindow();
    try {
      await this._openOperation;
    } catch (error) {
      this._desiredOpen = false;
      this._disposeWidget();
      this._window = void 0;
      this._windowDisposables.clear();
      this._auxiliaryWindowRef.clear();
      this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      throw error;
    } finally {
      this._openOperation = void 0;
    }
  }
  async _doOpenWindow() {
    const bounds = this._defaultBounds();
    const auxiliaryWindow = await this.auxiliaryWindowService.open({
      bounds,
      alwaysOnTop: true,
      frameless: true,
      transparent: true,
      disableFullscreen: true,
      nativeTitlebar: false,
      disableMaximize: true,
      notResizable: true,
      noBackgroundThrottling: true,
      backgroundColor: "#00000000"
    });
    if (!this._desiredOpen || !this._isEnabled()) {
      auxiliaryWindow.dispose();
      return;
    }
    this._window = auxiliaryWindow;
    this._auxiliaryWindowRef.value = auxiliaryWindow;
    this.voiceSessionController.setOmniInputOpen(true);
    const surface = dom.append(auxiliaryWindow.container, dom.$(".chat-input-window"));
    const workspace = this.workspaceContextService.getWorkspace();
    const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : "";
    auxiliaryWindow.window.document.title = projectName ? localize("chatInputWindow.titleWithProject", "Chat Input \u2014 {0}", projectName) : localize("chatInputWindow.title", "Chat Input");
    auxiliaryWindow.container.style.overflow = "hidden";
    auxiliaryWindow.window.document.body.classList.add("chat-input-window-body");
    auxiliaryWindow.window.document.body.style.setProperty("margin", "0", "important");
    auxiliaryWindow.window.document.body.style.setProperty("overflow", "hidden", "important");
    this._windowDisposables.clear();
    const applyThemeColors = () => {
      const theme = this.themeService.getColorTheme();
      const surfaceColor = theme.getColor(inputBackground)?.toString() ?? "#3c3c3c";
      const border = theme.getColor(inputBorder)?.toString() ?? "transparent";
      auxiliaryWindow.window.document.body.style.setProperty("background-color", "transparent", "important");
      surface.style.backgroundColor = surfaceColor;
      surface.style.border = `1px solid ${border}`;
    };
    surface.style.display = "flex";
    surface.style.flex = "1 1 auto";
    surface.style.flexDirection = "column";
    surface.style.minHeight = "0";
    const row = dom.append(surface, dom.$(".chat-input-window-row"));
    this._row = row;
    const lead = dom.append(row, dom.$(".chat-input-window-lead", {
      "aria-hidden": "true",
      title: localize("chatInputWindow.drag", "Drag to move")
    }));
    this._lead = lead;
    lead.style.setProperty("-webkit-app-region", "drag");
    lead.appendChild(renderIcon(Codicon.grabber));
    applyThemeColors();
    this._windowDisposables.add(this.themeService.onDidColorThemeChange(() => applyThemeColors()));
    this._renderChatWidget(auxiliaryWindow, surface, row, bounds);
    const pendingActiveWindowSync = this._windowDisposables.add(new MutableDisposable());
    this._windowDisposables.add(autorun((reader) => {
      const ownsVoice = this.voiceSessionController.omniInputActive.read(reader);
      if (ownsVoice || auxiliaryWindow.window.document.hasFocus()) {
        return;
      }
      pendingActiveWindowSync.value = dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => {
        const activeWindow = dom.getActiveWindow();
        if (activeWindow !== auxiliaryWindow.window) {
          this.voiceSessionController.setActiveWindow(activeWindow);
        }
      });
    }));
    const trail = dom.append(row, dom.$(".chat-input-window-trail"));
    this._trail = trail;
    const close = dom.append(trail, dom.$("a.chat-input-window-close", {
      role: "button",
      tabindex: "0",
      "aria-label": localize("chatInputWindow.close.label", "Close")
    }));
    close.appendChild(renderIcon(Codicon.closeSmall));
    this._windowDisposables.add(dom.addDisposableListener(close, dom.EventType.CLICK, () => this.closeWindow()));
    this._windowDisposables.add(dom.addStandardDisposableListener(close, dom.EventType.KEY_DOWN, (event) => {
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        event.preventDefault();
        this.closeWindow();
      }
    }));
    this._renderPendingPrompts(auxiliaryWindow, surface);
    Event.once(auxiliaryWindow.onUnload)(() => {
      if (this._window !== auxiliaryWindow) {
        return;
      }
      this._storeWindowPosition(auxiliaryWindow);
      this._disposeWidget();
      this._desiredOpen = false;
      this._ownershipClaim = void 0;
      this._window = void 0;
      this._windowDisposables.clear();
      this._auxiliaryWindowRef.value = void 0;
      this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      this._onDidChangeOpen.fire(false);
    });
    this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this._onDidChangeOpen.fire(true);
  }
  closeWindow() {
    this._desiredOpen = false;
    this._ownershipClaim = void 0;
    if (!this._window) {
      return;
    }
    this._storeWindowPosition(this._window);
    this.storageService.store(ChatInputWindowStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this._routingController?.cancelPending();
    this._disposeWidget();
    this._window = void 0;
    this._windowDisposables.clear();
    this._auxiliaryWindowRef.value = void 0;
    this._onDidChangeOpen.fire(false);
  }
  async toggleWindow(invokingWindowBounds) {
    if (this._desiredOpen || this.isOpen) {
      this.closeWindow();
    } else {
      const claim = { timestamp: Date.now(), id: this._ownershipId };
      this._ownershipClaim = claim;
      this._ownershipChannel.postMessage({ type: "claim", ...claim });
      await this.openWindow(invokingWindowBounds);
    }
  }
  async acceptVoiceInput(text) {
    const window = this._window?.window;
    const widget = this._widget;
    if (!window?.document.hasFocus() && !this.voiceSessionController.omniInputActive.get() || !widget || !this._routingController) {
      return false;
    }
    this._completePendingVoiceRoute(false);
    const pendingRoute = new DeferredPromise();
    this._pendingVoiceRoute = pendingRoute;
    const routeTimeout = disposableTimeout(() => pendingRoute.complete(false), 3e4);
    try {
      await widget.acceptInput(combineVoiceInput(widget.getInput(), text), {
        preserveFocus: true,
        isVoiceModeInput: true
      });
      return await pendingRoute.p;
    } finally {
      routeTimeout.dispose();
      if (this._pendingVoiceRoute === pendingRoute) {
        this._completePendingVoiceRoute(false);
      }
    }
  }
  _completePendingVoiceRoute(resource) {
    const pendingRoute = this._pendingVoiceRoute;
    if (!pendingRoute) {
      return;
    }
    this._pendingVoiceRoute = void 0;
    void pendingRoute.complete(resource);
  }
  _renderChatWidget(auxiliaryWindow, surface, row, openingBounds) {
    this._dismissedPendingRequests.set(/* @__PURE__ */ new Set(), void 0);
    const parent = dom.append(row, dom.$(".interactive-session"));
    parent.style.flex = "1 1 auto";
    parent.style.minWidth = "0";
    const editorOverflowWidgetsDomNode = dom.append(auxiliaryWindow.window.document.body, dom.$(".chat-editor-overflow.monaco-editor"));
    this._windowDisposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
    const scopedContextKeyService = this._windowDisposables.add(this.contextKeyService.createScoped(parent));
    ChatContextKeys.inChatInputWindow.bindTo(scopedContextKeyService).set(true);
    const scopedInstantiationService = this._windowDisposables.add(this.instantiationService.createChild(
      new ServiceCollection([
        IContextKeyService,
        scopedContextKeyService
      ])
    ));
    const widget = this._windowDisposables.add(scopedInstantiationService.createInstance(
      ChatWidget,
      ChatAgentLocation.Chat,
      { isQuickChat: true },
      {
        autoScroll: true,
        renderInputOnTop: true,
        renderStyle: "compact",
        inputEditorMaxHeight: 250,
        renderGettingStartedTip: false,
        deferredNotificationsEnabled: false,
        // Show only the input box — drop every response list item.
        filter: () => false,
        enableImplicitContext: false,
        defaultMode: ChatMode.Agent,
        modelPickerSessionType: AgentSessionProviders.AgentHostCopilot,
        menus: { telemetrySource: "chatInputWindow" },
        // Routing seam: intercept submission before local execution and
        // route it to the best-matching existing session (or a new one),
        // forwarding any explicit attachments on the input.
        submitHandler: (query, mode, attachedContext, isVoiceModeInput) => this._routingController?.handleSubmit(query, mode, attachedContext, isVoiceModeInput) ?? Promise.resolve(false),
        onDidChangeModelPickerVisibility: (visible) => this._setActionWidgetVisible(auxiliaryWindow, surface, void 0, visible, "above"),
        inputPickerPosition: () => this._actionWidgetAnchorPosition,
        inputPickerContainer: () => this._actionWidgetWindow.value?.container,
        inputPickerAnchor: (anchor) => this._getActionWidgetAnchor(anchor),
        inputPickerOpenOnMouseUp: true,
        contextPicker: {
          prepare: () => this._prepareContextPicker(auxiliaryWindow, surface, scopedContextKeyService, widget)
        },
        editorOverflowWidgetsDomNode
      },
      {
        inputEditorBackground: inputBackground,
        resultEditorBackground: editorBackground,
        listBackground: editorBackground,
        listForeground: editorBackground,
        overlayBackground: editorBackground
      }
    ));
    this._widget = widget;
    widget.render(parent);
    widget.setVisible(true);
    const inputContainer = widget.input.inputContainerElement;
    if (inputContainer) {
      try {
        const inputValue = observableFromEvent(this, widget.inputEditor.onDidChangeModelContent, () => widget.getInput());
        this._windowDisposables.add(setupVoiceInputDecorations({
          voiceSessionController: this.voiceSessionController,
          ttsPlaybackService: this.ttsPlaybackService,
          micCaptureService: this.micCaptureService,
          configurationService: this.configurationService,
          keybindingService: this.keybindingService,
          themeService: this.themeService,
          accessibilityService: this.accessibilityService
        }, {
          inputContainer,
          glowContainer: surface,
          isActive: this.voiceSessionController.omniInputOpen,
          inputValue,
          isOwner: this.voiceSessionController.omniInputOpen
        }));
      } catch (error) {
        this.logService.error("[chatInputWindow] Failed to initialize voice decorations", error);
      }
    }
    const modelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: "ChatInputWindow" });
    this._modelRef = modelRef;
    widget.setModel(modelRef.object);
    widget.setInputPlaceholder(localize("chatInputWindow.inputPlaceholder", "Send a request to any session or folder..."));
    let fitWindowToInput = () => {
    };
    const host = {
      widget,
      getOwnSessionResource: () => this._modelRef?.object.sessionResource,
      getRoutingProvider: () => this.routingProviderService.getProvider(),
      getPendingReplySessionResource: () => this._activePendingSessionResource,
      getSelectedModelLabel: () => widget.inputPart.selectedLanguageModel.get()?.metadata.name,
      onWillRoute: () => this.voiceSessionController.prepareForRoutingRequest(),
      onWillDispatchRoute: (resource) => this.voiceSessionController.markRoutedRequestPending(resource),
      onDidRejectRoute: (resource, isVoiceModeInput) => {
        if (resource) {
          this.voiceSessionController.clearRoutedRequest(resource);
        }
        if (isVoiceModeInput) {
          this._completePendingVoiceRoute(false);
        }
      },
      onDidResolveRoute: (resource, kind, isVoiceModeInput, requestId) => {
        if (resource) {
          this.voiceSessionController.markRoutedRequestPending(resource, requestId);
        }
        if (isVoiceModeInput) {
          this._completePendingVoiceRoute(resource ?? false);
        }
        this.commandService.executeCommand(CHAT_INPUT_WINDOW_SET_VOICE_TARGET_COMMAND_ID, resource?.toString(), kind).catch(() => {
        });
      },
      onDidDismissRoute: (resource, requestId) => {
        const dismissed = new Set(this._dismissedPendingRequests.get());
        dismissed.add(this._pendingRequestKey(resource, requestId));
        this._dismissedPendingRequests.set(dismissed, void 0);
        this.voiceSessionController.clearRoutedRequest(resource);
      },
      onDidChangeActionWidgetVisibility: (visible, anchor) => this._setActionWidgetVisible(auxiliaryWindow, surface, anchor, visible, "right"),
      getActionWidgetContainer: () => this._actionWidgetWindow.value?.container,
      getActionWidgetAnchor: (anchor) => this._getActionWidgetAnchor(anchor),
      getActionWidgetAnchorPosition: () => this._actionWidgetAnchorPosition,
      pickFolder: async (defaultUri) => (await this.fileDialogService.showOpenDialog({
        title: localize("chatInputWindow.selectSessionFolder", "Select Folder for New Session"),
        openLabel: localize("chatInputWindow.selectFolder", "Select Folder"),
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri
      }))?.[0],
      placeBadge: (badge) => {
        const row2 = this._row;
        if (!surface.isConnected || !row2) {
          return;
        }
        row2.after(badge);
        fitWindowToInput();
        const observerDisposables = this._windowDisposables.add(new DisposableStore());
        const resizeObserver = new auxiliaryWindow.window.ResizeObserver(() => fitWindowToInput());
        observerDisposables.add(toDisposable(() => resizeObserver.disconnect()));
        resizeObserver.observe(badge);
        const observer = new auxiliaryWindow.window.MutationObserver(() => {
          if (!badge.isConnected) {
            observerDisposables.dispose();
            fitWindowToInput();
          }
        });
        observerDisposables.add(toDisposable(() => observer.disconnect()));
        observer.observe(surface, { childList: true });
      }
    };
    this._routingController = this._windowDisposables.add(this.instantiationService.createInstance(ChatSessionRoutingController, host, "chatInputWindow"));
    let lastContentHeight;
    let didInitialPosition = false;
    let currentPosition = { x: openingBounds.x, y: openingBounds.y };
    let pendingBounds;
    let applyingBounds = false;
    const getRowHeight = () => {
      let contentHeight = Math.ceil(widget.contentHeight);
      if (widget.attachmentModel.size > 0) {
        contentHeight += Math.max(0, CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT - widget.input.inputRowHeight);
      }
      return Math.max(CHAT_INPUT_WINDOW_INITIAL_SURFACE_HEIGHT, contentHeight);
    };
    const applyPendingBounds = async () => {
      if (applyingBounds) {
        return;
      }
      applyingBounds = true;
      try {
        while (pendingBounds && this._window === auxiliaryWindow) {
          const bounds = pendingBounds;
          pendingBounds = void 0;
          currentPosition = { x: bounds.x, y: bounds.y };
          await auxiliaryWindow.setBounds(bounds);
        }
      } finally {
        applyingBounds = false;
      }
    };
    fitWindowToInput = () => {
      const win = this._window?.window;
      if (!win || win !== auxiliaryWindow.window) {
        return;
      }
      const width = this._defaultWidth();
      const rowHeight = getRowHeight();
      const extraHeight = Array.from(surface.children).filter((child) => child !== this._row).reduce((height, child) => {
        const element = child;
        const position = auxiliaryWindow.window.getComputedStyle(element).position;
        return position === "absolute" || position === "fixed" ? height : height + element.offsetHeight;
      }, 0);
      const contentHeight = rowHeight + extraHeight + 4;
      if (contentHeight === lastContentHeight) {
        return;
      }
      lastContentHeight = contentHeight;
      if (!didInitialPosition) {
        didInitialPosition = true;
        const initialBounds = this._positionedBounds(width, contentHeight);
        currentPosition = { x: initialBounds.x, y: initialBounds.y };
      } else if (!applyingBounds) {
        currentPosition = { x: win.screenX, y: win.screenY };
      }
      pendingBounds = { ...currentPosition, width, height: contentHeight };
      void applyPendingBounds();
    };
    this._fitWindowToContent = fitWindowToInput;
    let layingOut = false;
    const layout = () => {
      if (layingOut) {
        return;
      }
      layingOut = true;
      try {
        const chrome = (this._lead?.offsetWidth ?? 0) + (this._trail?.offsetWidth ?? 0);
        const rowStyle = auxiliaryWindow.window.getComputedStyle(row);
        const horizontalPadding = Number.parseFloat(rowStyle.paddingLeft) + Number.parseFloat(rowStyle.paddingRight);
        const available = Math.max(0, row.clientWidth - chrome - horizontalPadding);
        parent.style.width = `${available}px`;
        widget.input.layout(available);
        const rowHeight = getRowHeight();
        widget.layoutForInputHeight(rowHeight, available);
        fitWindowToInput();
      } finally {
        layingOut = false;
      }
    };
    layout();
    this._windowDisposables.add(widget.onDidChangeContentHeight(() => fitWindowToInput()));
    const updateAttachmentLayout = () => {
      row.classList.toggle("has-attachments", widget.attachmentModel.size > 0);
      layout();
    };
    this._windowDisposables.add(widget.attachmentModel.onDidChange(updateAttachmentLayout));
    updateAttachmentLayout();
    const scheduledInputLayout = this._windowDisposables.add(new MutableDisposable());
    this._windowDisposables.add(widget.inputEditor.onDidChangeModelContent(() => {
      scheduledInputLayout.value = dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => layout());
    }));
    this._windowDisposables.add(dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => {
      layout();
      this._windowDisposables.add(dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, () => {
        widget.focusInput();
      }));
    }));
    this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, "focus", () => {
      const activeElement = auxiliaryWindow.window.document.activeElement;
      if (!activeElement || activeElement === auxiliaryWindow.window.document.body || activeElement === auxiliaryWindow.window.document.documentElement || widget.inputEditor.getDomNode()?.contains(activeElement)) {
        widget.focusInput();
      }
      if (this.voiceSessionController.omniInputActive.get()) {
        this.voiceSessionController.setOmniInputActive(true);
        this.voiceSessionController.setActiveWindow(auxiliaryWindow.window);
      }
    }));
    this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, "resize", layout));
  }
  _renderPendingPrompts(auxiliaryWindow, surface) {
    const panel = dom.append(surface, dom.$(".chat-input-window-pending-panel"));
    const header = dom.append(panel, dom.$(".chat-input-window-pending-header", { "aria-live": "polite" }));
    const marker = dom.append(header, dom.$("span.chat-input-window-pending-marker", { "aria-hidden": "true" }));
    marker.appendChild(renderIcon(Codicon.gripper));
    const label = dom.append(header, dom.$("span.chat-input-window-pending-label"));
    const navigation = dom.append(header, dom.$(".chat-input-window-pending-navigation"));
    const previous = this._appendPendingNavigationButton(navigation, Codicon.chevronLeft, localize("chatInputWindow.pending.previous", "Previous Item"));
    const next = this._appendPendingNavigationButton(navigation, Codicon.chevronRight, localize("chatInputWindow.pending.next", "Next Item"));
    const approvalFallback = dom.append(panel, dom.$(".chat-input-window-pending-approval-fallback"));
    const approvalTitle = dom.append(approvalFallback, dom.$(".chat-input-window-pending-approval-title"));
    const approvalMessage = dom.append(approvalFallback, dom.$(".chat-input-window-pending-approval-message"));
    const approvalCommand = dom.append(approvalFallback, dom.$("code.chat-input-window-pending-approval-command"));
    const approvalDisclaimer = dom.append(approvalFallback, dom.$(".chat-input-window-pending-approval-disclaimer"));
    const approvalActions = dom.append(approvalFallback, dom.$(".chat-input-window-pending-approval-actions"));
    const ciFallback = dom.append(panel, dom.$(".chat-input-window-pending-ci-fallback"));
    const ciTitle = dom.append(ciFallback, dom.$(".chat-input-window-pending-ci-title"));
    const ciDetail = dom.append(ciFallback, dom.$(".chat-input-window-pending-ci-detail", { "aria-live": "polite" }));
    const ciActions = dom.append(ciFallback, dom.$(".chat-input-window-pending-ci-actions"));
    const approvalActionDisposables = this._windowDisposables.add(new MutableDisposable());
    const ciActionDisposables = this._windowDisposables.add(new MutableDisposable());
    let lastActivatedPendingItem;
    let displayedApproval;
    let displayedPendingOccurrence;
    let displayedCIFailure;
    let renderedCIFailureId;
    const renderCIFailure = (entry) => {
      displayedCIFailure = entry;
      if (renderedCIFailureId !== entry?.id) {
        renderedCIFailureId = entry?.id;
        ciActionDisposables.value = new DisposableStore();
        ciActions.replaceChildren();
        if (entry) {
          const button = ciActionDisposables.value.add(new Button(ciActions, {
            title: localize("chatInputWindow.pending.fixCITooltip", "Fix failing CI checks"),
            ...defaultButtonStyles,
            small: true,
            buttonBackground: asCssVariable(chartsOrange),
            buttonHoverBackground: `color-mix(in srgb, ${asCssVariable(chartsOrange)} 88%, black)`,
            buttonBorder: asCssVariable(chartsOrange)
          }));
          button.label = localize("chatInputWindow.pending.fixCI", "Fix CI");
          ciActionDisposables.value.add(button.onDidClick(() => {
            entry.provider.fixCI(entry.failure.sessionResource);
            this._widget?.focusInput();
          }));
          const dismissButton = ciActionDisposables.value.add(new Button(ciActions, {
            ...defaultButtonStyles,
            small: true,
            secondary: true
          }));
          dismissButton.label = localize("chatInputWindow.pending.dismissCI", "Dismiss");
          ciActionDisposables.value.add(dismissButton.onDidClick(() => {
            const dismissed = new Set(this._dismissedCIFailures.get());
            dismissed.add(entry.id);
            this._dismissedCIFailures.set(dismissed, void 0);
            this.storageService.store(
              ChatInputWindowStorageKeys.DismissedCIFailures,
              JSON.stringify([...dismissed].slice(-100)),
              StorageScope.PROFILE,
              StorageTarget.MACHINE
            );
            this._widget?.focusInput();
          }));
        }
      }
      if (!entry) {
        ciTitle.textContent = "";
        ciDetail.textContent = "";
        return;
      }
      ciTitle.textContent = localize("chatInputWindow.pending.ciTitle", "CI is failing for {0}", entry.failure.label);
      ciDetail.textContent = localize(
        "chatInputWindow.pending.ciDetail",
        "{0} checks failed, {1} pending",
        entry.failure.failed,
        entry.failure.pending
      );
    };
    const renderApprovalFallback = (approval) => {
      approvalActionDisposables.value = new DisposableStore();
      approvalActions.replaceChildren();
      if (!approval) {
        return;
      }
      const state = approval.invocation.state.get();
      if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation && state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
        return;
      }
      const messages = state.confirmationMessages;
      const confirmationTitle = renderAsPlaintext(messages?.title ?? approval.invocation.invocationMessage);
      approvalTitle.textContent = confirmationTitle;
      const confirmationMessage = renderAsPlaintext(messages?.message ?? "");
      const showConfirmationMessage = !!confirmationMessage && confirmationMessage !== confirmationTitle;
      approvalMessage.textContent = showConfirmationMessage ? confirmationMessage : "";
      dom.setVisibility(showConfirmationMessage, approvalMessage);
      approvalCommand.textContent = getVoiceToolApprovalCommand(approval.invocation) ?? "";
      dom.setVisibility(!!approvalCommand.textContent, approvalCommand);
      const approvalReason = messages?.approvalReason?.status === "complete" ? renderAsPlaintext(messages.approvalReason.explanation) : "";
      approvalDisclaimer.textContent = [renderAsPlaintext(messages?.disclaimer ?? ""), approvalReason].filter(Boolean).join("\n");
      dom.setVisibility(!!approvalDisclaimer.textContent, approvalDisclaimer);
      const confirm = (reason) => {
        markPendingIdResolved(approval.occurrence);
        IChatToolInvocation.confirmWith(approval.invocation, reason);
      };
      const options = messages?.customOptions;
      if (options?.length) {
        for (const option of options) {
          const button = approvalActionDisposables.value.add(new Button(approvalActions, {
            ...defaultButtonStyles,
            small: true,
            secondary: option.kind === ConfirmationOptionKind.Deny
          }));
          button.label = option.label;
          approvalActionDisposables.value.add(button.onDidClick(() => confirm({
            type: ToolConfirmKind.UserAction,
            selectedButton: option.id,
            selectedButtonKind: option.kind
          })));
        }
      } else {
        const allowButton = approvalActionDisposables.value.add(new Button(approvalActions, {
          ...defaultButtonStyles,
          small: true
        }));
        allowButton.label = messages?.confirmResults ? localize("chatInputWindow.pending.allowAndReview", "Allow and Review Once") : localize("chatInputWindow.pending.allow", "Allow Once");
        approvalActionDisposables.value.add(allowButton.onDidClick(() => confirm({ type: ToolConfirmKind.UserAction })));
        const skipButton = approvalActionDisposables.value.add(new Button(approvalActions, {
          ...defaultButtonStyles,
          small: true,
          secondary: true
        }));
        skipButton.label = localize("chatInputWindow.pending.skip", "Skip");
        approvalActionDisposables.value.add(skipButton.onDidClick(() => confirm({ type: ToolConfirmKind.Skipped })));
      }
    };
    const parent = dom.append(panel, dom.$(".chat-input-window-pending-widget.interactive-session"));
    this._windowDisposables.add(dom.addDisposableListener(parent, dom.EventType.CLICK, (event) => {
      const approval = displayedApproval;
      const target = event.target;
      if (!(target instanceof auxiliaryWindow.window.Element)) {
        return;
      }
      if (approval && target.closest(".chat-confirmation-widget-buttons")) {
        const state = approval.invocation.state.get();
        if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
          markPendingIdResolved(approval.occurrence);
        }
      }
      this._notifyPendingItemResolvedAfterInteraction();
    }, { capture: true }));
    this._windowDisposables.add(dom.addDisposableListener(parent, dom.EventType.KEY_DOWN, () => {
      this._notifyPendingItemResolvedAfterInteraction();
    }, { capture: true }));
    const scopedContextKeyService = this._windowDisposables.add(this.contextKeyService.createScoped(parent));
    ChatContextKeys.inChatInputWindow.bindTo(scopedContextKeyService).set(true);
    const scopedInstantiationService = this._windowDisposables.add(this.instantiationService.createChild(
      new ServiceCollection([
        IContextKeyService,
        scopedContextKeyService
      ])
    ));
    const widget = this._windowDisposables.add(scopedInstantiationService.createInstance(
      ChatWidget,
      ChatAgentLocation.Chat,
      { isQuickChat: true },
      {
        autoScroll: true,
        renderInputOnTop: true,
        renderStyle: "compact",
        renderGettingStartedTip: false,
        rendererOptions: { questionCarouselFitContent: true },
        filter: (item) => isResponseVM(item) && (!!item.model.isPendingConfirmation.get() || item.model.response.value.some((part) => part.kind === "questionCarousel" && !part.isUsed)),
        enableImplicitContext: false,
        defaultMode: ChatMode.Ask,
        menus: { telemetrySource: "chatInputWindowPending" }
      },
      {
        inputEditorBackground: inputBackground,
        resultEditorBackground: editorBackground,
        listBackground: editorBackground,
        listForeground: editorBackground,
        overlayBackground: editorBackground
      }
    ));
    widget.render(parent);
    widget.setInputVisible(true);
    widget.setVisible(true);
    const list = widget.transcriptDomNode;
    let pendingItems = [];
    let layingOut = false;
    let lastPendingHeight;
    let lastPendingWidth;
    let confirmationWidgetLayoutHeight = 0;
    let displayedItemId;
    const layout = () => {
      if (layingOut || !panel.classList.contains("shown")) {
        return;
      }
      layingOut = true;
      try {
        if (displayedCIFailure) {
          this._fitWindowToContent();
          return;
        }
        for (const row of getDescendantElements(list, "monaco-list-row")) {
          const confirmations = getDescendantElements(row, "chat-confirmation-widget-container");
          const hasConfirmation = confirmations.length > 0;
          row.classList.toggle("chat-input-window-confirmation-row", hasConfirmation);
          for (const confirmation of confirmations) {
            confirmation.classList.toggle(
              "chat-input-window-modified-files-confirmation",
              getDescendantElements(confirmation, "chat-modified-files-confirmation").length > 0
            );
          }
          for (const value of getDescendantElements(row, "value")) {
            value.classList.toggle("chat-input-window-confirmation-value", hasConfirmation);
          }
        }
        panel.classList.toggle("tool-approval-fallback", !!displayedApproval && !panel.classList.contains("question"));
        const width = Math.max(0, panel.clientWidth);
        if (lastPendingHeight === void 0 || lastPendingWidth !== width) {
          if (lastPendingWidth !== width) {
            confirmationWidgetLayoutHeight = 0;
          }
          lastPendingWidth = width;
          widget.layout(lastPendingHeight ?? CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT, width);
        }
        const listBounds = list.getBoundingClientRect();
        const renderedRows = getDescendantElements(list, "interactive-item-container");
        const renderedContentHeight = renderedRows.reduce((height2, row) => {
          const rowBounds = row.getBoundingClientRect();
          const confirmation = getDescendantElements(row, "chat-confirmation-widget-container")[0];
          const confirmationBounds = confirmation?.getBoundingClientRect();
          const paddingBottom = parseFloat(dom.getWindow(row).getComputedStyle(row).paddingBottom);
          const renderedDescendantBottom = confirmation ? getDescendantElements(confirmation).reduce(
            (bottom2, element) => Math.max(bottom2, element.getBoundingClientRect().bottom),
            confirmationBounds?.bottom ?? 0
          ) : 0;
          const confirmationBottom = confirmationBounds ? Math.max(confirmationBounds.top + (confirmation?.scrollHeight ?? 0), renderedDescendantBottom) : 0;
          const bottom = Math.max(rowBounds.bottom, confirmationBottom + paddingBottom);
          return Math.max(height2, bottom - listBounds.top);
        }, 0);
        const isQuestion = panel.classList.contains("question");
        const questionContainer = isQuestion ? getDescendantElements(parent, "chat-question-carousel-widget-container").find((element) => element.childElementCount > 0) : void 0;
        const questionContentHeight = questionContainer ? questionContainer.getBoundingClientRect().bottom - parent.getBoundingClientRect().top : 0;
        const contentHeight = isQuestion ? Math.max(widget.contentHeight, questionContentHeight) : renderedContentHeight || widget.contentHeight;
        const minimumHeight = isQuestion ? 1 : CHAT_INPUT_WINDOW_MIN_CONFIRMATION_HEIGHT;
        const measuredHeight = isQuestion ? Math.max(minimumHeight, Math.ceil(contentHeight)) : Math.min(CHAT_INPUT_WINDOW_MAX_PENDING_HEIGHT, Math.max(minimumHeight, Math.ceil(contentHeight)));
        const height = isQuestion ? measuredHeight : Math.max(lastPendingHeight ?? 0, measuredHeight);
        const heightChanged = height !== lastPendingHeight;
        if (heightChanged) {
          lastPendingHeight = height;
          parent.style.height = `${height}px`;
          this._fitWindowToContent();
        }
        if (isQuestion && heightChanged) {
          widget.layout(height, width);
        } else if (!panel.classList.contains("question") && height > confirmationWidgetLayoutHeight) {
          confirmationWidgetLayoutHeight = height;
          widget.layout(height, width);
          scheduleLayout();
        }
      } finally {
        layingOut = false;
      }
    };
    const scheduledLayout = this._windowDisposables.add(new MutableDisposable());
    const scheduleLayout = () => {
      scheduledLayout.value = dom.scheduleAtNextAnimationFrame(auxiliaryWindow.window, layout);
    };
    const showPendingItem = (index) => {
      if (pendingItems.length === 0) {
        this._pendingPromptIndex = 0;
        lastPendingHeight = void 0;
        lastPendingWidth = void 0;
        confirmationWidgetLayoutHeight = 0;
        displayedItemId = void 0;
        displayedApproval = void 0;
        displayedPendingOccurrence = void 0;
        renderApprovalFallback(void 0);
        renderCIFailure(void 0);
        lastActivatedPendingItem = void 0;
        this._activePendingSessionResource = void 0;
        panel.classList.remove("shown", "question", "tool-approval-fallback", "ci-failure");
        widget.setModel(void 0);
        this._fitWindowToContent();
        return;
      }
      this._pendingPromptIndex = (index + pendingItems.length) % pendingItems.length;
      const item = pendingItems[this._pendingPromptIndex];
      if (displayedItemId !== item.id) {
        displayedItemId = item.id;
        lastPendingHeight = void 0;
        confirmationWidgetLayoutHeight = 0;
      }
      panel.classList.add("shown");
      const hasMultiple = pendingItems.length > 1;
      header.classList.toggle("hidden", !hasMultiple);
      label.textContent = hasMultiple ? localize("chatInputWindow.pending.count", "Item {0} of {1}", this._pendingPromptIndex + 1, pendingItems.length) : "";
      navigation.classList.toggle("hidden", !hasMultiple);
      for (const button of [previous, next]) {
        button.classList.toggle("disabled", !hasMultiple);
        button.setAttribute("aria-disabled", String(!hasMultiple));
        button.tabIndex = hasMultiple ? 0 : -1;
      }
      if (item.kind === "ciFailure") {
        this._activePendingSessionResource = void 0;
        displayedApproval = void 0;
        displayedPendingOccurrence = void 0;
        renderApprovalFallback(void 0);
        renderCIFailure(item);
        panel.classList.remove("question", "tool-approval-fallback");
        panel.classList.add("ci-failure");
        widget.setModel(void 0);
        scheduleLayout();
        return;
      }
      const model = item.model;
      this._activePendingSessionResource = model.sessionResource;
      renderCIFailure(void 0);
      panel.classList.remove("ci-failure");
      const hasPendingQuestion = this._hasPendingQuestion(model);
      const pendingApproval = this._getPendingToolApproval(model);
      const pendingOccurrence = pendingApproval?.occurrence ?? this._getPendingQuestionOccurrence(model);
      displayedApproval = pendingApproval;
      displayedPendingOccurrence = pendingOccurrence;
      renderApprovalFallback(pendingApproval);
      const omniInputOpen = this.voiceSessionController.omniInputOpen.get();
      if (!omniInputOpen) {
        lastActivatedPendingItem = void 0;
      }
      panel.classList.toggle("question", hasPendingQuestion);
      panel.classList.toggle("tool-approval-fallback", !hasPendingQuestion && !!pendingApproval);
      widget.setModel(model);
      if (pendingOccurrence && omniInputOpen && pendingOccurrence !== lastActivatedPendingItem) {
        lastActivatedPendingItem = pendingOccurrence;
        this.voiceSessionController.announceSessionInOmni(model.sessionResource);
      }
      scheduleLayout();
    };
    this._windowDisposables.add(dom.addDisposableListener(previous, dom.EventType.CLICK, () => showPendingItem(this._pendingPromptIndex - 1)));
    this._windowDisposables.add(dom.addDisposableListener(next, dom.EventType.CLICK, () => showPendingItem(this._pendingPromptIndex + 1)));
    this._windowDisposables.add(widget.onDidChangeContentHeight(scheduleLayout));
    const pendingMutationObserver = new auxiliaryWindow.window.MutationObserver(scheduleLayout);
    pendingMutationObserver.observe(widget.domNode, { childList: true, subtree: true, attributes: true });
    this._windowDisposables.add(toDisposable(() => pendingMutationObserver.disconnect()));
    this._windowDisposables.add(dom.addDisposableListener(auxiliaryWindow.window, "resize", scheduleLayout));
    this._loadPendingSessionModels();
    this._windowDisposables.add(autorun((reader) => {
      this.voiceSessionController.omniInputOpen.read(reader);
      const dismissedPendingRequests = this._dismissedPendingRequests.read(reader);
      const dismissedCIFailures = this._dismissedCIFailures.read(reader);
      const displayedResource = this._activePendingSessionResource;
      if (displayedResource && displayedPendingOccurrence) {
        const displayedModel = this.chatService.getSession(displayedResource);
        const currentOccurrence = displayedModel ? this._getPendingToolApproval(displayedModel)?.occurrence ?? this._getPendingQuestionOccurrence(displayedModel) : void 0;
        if (currentOccurrence !== displayedPendingOccurrence) {
          this.voiceSessionController.notifyPendingItemResolved(displayedResource);
          displayedPendingOccurrence = void 0;
        }
      }
      const currentItemId = pendingItems[this._pendingPromptIndex]?.id;
      const activeTarget = this.voiceSessionController.targetSession.read(reader)?.toString();
      const pendingChats = [...this.chatService.chatModels.read(reader)].filter((model) => !!model.requestNeedsInput.read(reader) && !this._hasOnlyResolvedPendingTools(model, reader)).filter((model) => !dismissedPendingRequests.has(this._pendingRequestKey(model.sessionResource, model.lastRequest?.id))).sort((a, b) => Number(b.sessionResource.toString() === activeTarget) - Number(a.sessionResource.toString() === activeTarget) || Number(this._hasPendingQuestion(b)) - Number(this._hasPendingQuestion(a)) || b.lastMessageDate - a.lastMessageDate).map((model) => ({
        kind: "chat",
        id: `chat:${this._pendingRequestKey(model.sessionResource, model.lastRequest?.id)}`,
        model
      }));
      const ciFailures = [];
      for (const provider of this._ciFailureProviders.read(reader)) {
        for (const failure of provider.failures.read(reader)) {
          const item = {
            kind: "ciFailure",
            id: `ci:${failure.sessionResource.toString()}:${failure.occurrenceId}`,
            failure,
            provider
          };
          if (!dismissedCIFailures.has(item.id)) {
            ciFailures.push(item);
          }
        }
      }
      ciFailures.sort((a, b) => b.failure.updatedAt - a.failure.updatedAt);
      pendingItems = [...pendingChats, ...ciFailures];
      const preservedIndex = currentItemId ? pendingItems.findIndex((item) => item.id === currentItemId) : -1;
      showPendingItem(preservedIndex >= 0 ? preservedIndex : Math.min(this._pendingPromptIndex, pendingItems.length - 1));
    }));
  }
  _notifyPendingItemResolvedAfterInteraction() {
    const resource = this._activePendingSessionResource;
    if (!resource) {
      return;
    }
    const model = this.chatService.getSession(resource);
    const occurrence = model ? this._getPendingToolApproval(model)?.occurrence ?? this._getPendingQuestionOccurrence(model) : void 0;
    if (!occurrence) {
      return;
    }
    this._pendingResolvedInteractionCheck.value = disposableTimeout(() => {
      const currentModel = this.chatService.getSession(resource);
      const currentOccurrence = currentModel ? this._getPendingToolApproval(currentModel)?.occurrence ?? this._getPendingQuestionOccurrence(currentModel) : void 0;
      if (currentOccurrence !== occurrence) {
        this.voiceSessionController.notifyPendingItemResolved(resource);
      }
    }, 0);
  }
  _loadPendingSessionModels() {
    const refs = this._windowDisposables.add(new DisposableMap());
    const loads = /* @__PURE__ */ new Set();
    const cts = new CancellationTokenSource();
    this._windowDisposables.add(toDisposable(() => cts.dispose(true)));
    const update = async () => {
      const pendingSessions = this.agentSessionsService.model.sessions.filter((session) => !session.isArchived() && session.status === AgentSessionStatus.NeedsInput);
      const pendingKeys = new Set(pendingSessions.map((session) => session.resource.toString()));
      for (const key of refs.keys()) {
        if (!pendingKeys.has(key)) {
          refs.deleteAndDispose(key);
        }
      }
      await Promise.all(pendingSessions.map(async (session) => {
        const key = session.resource.toString();
        if (this.chatService.getSession(session.resource) || refs.has(key) || loads.has(key)) {
          return;
        }
        loads.add(key);
        try {
          const ref = await this.chatService.acquireOrLoadSession(session.resource, ChatAgentLocation.Chat, cts.token, "ChatInputWindow-pending");
          if (!ref) {
            return;
          }
          if (cts.token.isCancellationRequested || !this.agentSessionsService.model.sessions.some((candidate) => candidate.resource.toString() === key && candidate.status === AgentSessionStatus.NeedsInput && !candidate.isArchived())) {
            ref.dispose();
            return;
          }
          refs.set(key, ref);
        } catch (error) {
          if (!cts.token.isCancellationRequested) {
            this.logService.warn(`[chatInputWindow] Failed to load pending session ${key}:`, error);
          }
        } finally {
          loads.delete(key);
        }
      }));
    };
    this._windowDisposables.add(this.agentSessionsService.model.onDidChangeSessions(() => void update()));
    void update();
  }
  _appendPendingNavigationButton(container, icon, ariaLabel) {
    const button = dom.append(container, dom.$("a.chat-input-window-pending-navigation-button", {
      role: "button",
      tabindex: "0",
      "aria-label": ariaLabel
    }));
    button.appendChild(renderIcon(icon));
    this._windowDisposables.add(dom.addStandardDisposableListener(button, dom.EventType.KEY_DOWN, (event) => {
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        event.preventDefault();
        button.click();
      }
    }));
    return button;
  }
  _pendingRequestKey(resource, requestId) {
    return `${resource.toString()}\0${requestId ?? ""}`;
  }
  _hasPendingQuestion(model) {
    return model.lastRequest?.response?.response.value.some((part) => part.kind === "questionCarousel" && !part.isUsed) ?? false;
  }
  _getPendingQuestionOccurrence(model) {
    const request = model.lastRequest;
    const question = request?.response?.response.value.find((part) => part.kind === "questionCarousel" && !part.isUsed && !part.answeredExternally);
    return request && question ? derivePendingId(request.id, question, this._windowDisposables) : void 0;
  }
  _hasOnlyResolvedPendingTools(model, reader) {
    const request = model.lastRequest;
    const parts = request?.response?.response.value;
    if (!request || !parts) {
      return false;
    }
    let sawResolvedTool = false;
    for (const part of parts) {
      if (part.kind === "questionCarousel" && !part.isUsed && !part.answeredExternally) {
        return false;
      }
      if (part.kind === "elicitation2" && part.state.get() === "pending") {
        return false;
      }
      if ((part.kind === "planReview" || part.kind === "confirmation") && !part.isUsed) {
        return false;
      }
      if (part.kind !== "toolInvocation") {
        continue;
      }
      const state = part.state.get();
      if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation && state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval && state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
        continue;
      }
      const occurrence = derivePendingId(request.id, part, this._windowDisposables);
      if (!isPendingIdResolved(occurrence, reader)) {
        return false;
      }
      sawResolvedTool = true;
    }
    return sawResolvedTool;
  }
  _getPendingToolApproval(model) {
    const request = model.lastRequest;
    const parts = request?.response?.response.value;
    if (!request || !parts) {
      return void 0;
    }
    for (const part of parts) {
      if (part.kind !== "toolInvocation") {
        continue;
      }
      const state = part.state.get();
      if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation && state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval && state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
        continue;
      }
      const occurrence = derivePendingId(request.id, part, this._windowDisposables);
      if (!isPendingIdResolved(occurrence)) {
        return { invocation: part, occurrence };
      }
    }
    return void 0;
  }
  _setActionWidgetVisible(auxiliaryWindow, surface, anchor, visible, placement) {
    if (!visible) {
      if (this._actionWidgetOwner !== auxiliaryWindow) {
        return Promise.resolve();
      }
      this._actionWidgetVisibilityCount = Math.max(0, this._actionWidgetVisibilityCount - 1);
      if (this._actionWidgetVisibilityCount === 0) {
        this._actionWidgetLayoutGeneration++;
        this._actionWidgetOwner = void 0;
        this._actionWidgetWindow.clear();
      }
      return Promise.resolve();
    }
    if (this._actionWidgetOwner !== auxiliaryWindow) {
      this._actionWidgetLayoutGeneration++;
      this._actionWidgetVisibilityCount = 0;
      this._actionWidgetOwner = auxiliaryWindow;
      this._actionWidgetWindow.clear();
      this._actionWidgetOpenOperation = void 0;
    }
    this._actionWidgetVisibilityCount++;
    if (this._actionWidgetWindow.value) {
      return Promise.resolve();
    }
    if (this._actionWidgetOpenOperation) {
      return this._actionWidgetOpenOperation;
    }
    const generation = ++this._actionWidgetLayoutGeneration;
    const operation = this._openActionWidgetWindow(auxiliaryWindow, surface, anchor, generation, placement);
    this._actionWidgetOpenOperation = operation;
    return operation.finally(() => {
      if (this._actionWidgetOpenOperation === operation) {
        this._actionWidgetOpenOperation = void 0;
      }
    });
  }
  async _prepareContextPicker(auxiliaryWindow, surface, contextKeyService, widget) {
    this._contextPicker.clear();
    await this._setActionWidgetVisible(auxiliaryWindow, surface, void 0, true, "above");
    const actionWidgetWindow = this._actionWidgetWindow.value;
    if (!actionWidgetWindow) {
      throw new Error("Unable to open the chat input context picker window");
    }
    actionWidgetWindow.window.focus();
    await timeout(0);
    const pickerLayoutService = {
      _serviceBrand: void 0,
      onDidLayoutMainContainer: Event.None,
      onDidLayoutContainer: Event.None,
      onDidLayoutActiveContainer: Event.None,
      onDidAddContainer: Event.None,
      onDidChangeActiveContainer: Event.None,
      get mainContainerDimension() {
        return { width: actionWidgetWindow.container.clientWidth, height: actionWidgetWindow.container.clientHeight };
      },
      get activeContainerDimension() {
        return this.mainContainerDimension;
      },
      mainContainer: actionWidgetWindow.container,
      activeContainer: actionWidgetWindow.container,
      containers: [actionWidgetWindow.container],
      getContainer: () => actionWidgetWindow.container,
      whenContainerStylesLoaded: () => actionWidgetWindow.whenStylesHaveLoaded,
      mainContainerOffset: { top: 0, quickPickTop: 0 },
      activeContainerOffset: { top: 0, quickPickTop: 0 },
      focus: () => actionWidgetWindow.window.focus()
    };
    const services = new ServiceCollection(
      [IContextKeyService, contextKeyService],
      [ILayoutService, pickerLayoutService]
    );
    const scopedInstantiationService = this.instantiationService.createChild(services);
    const store = new DisposableStore();
    store.add(scopedInstantiationService);
    store.add(dom.addDisposableListener(actionWidgetWindow.window, dom.EventType.KEY_DOWN, (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this._contextPicker.clear();
    }, true));
    const quickInputService = store.add(scopedInstantiationService.createInstance(QuickInputService));
    services.set(IQuickInputService, quickInputService);
    const pendingHide = store.add(new MutableDisposable());
    const pendingLayout = store.add(new MutableDisposable());
    let picker;
    const anchorPicker = () => {
      pendingLayout.value = dom.scheduleAtNextAnimationFrame(actionWidgetWindow.window, () => {
        if (picker) {
          if (picker.style.top !== "auto") {
            picker.style.top = "auto";
          }
          if (picker.style.bottom !== "0px") {
            picker.style.bottom = "0";
          }
        }
      });
    };
    const pickerObserver = new actionWidgetWindow.window.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (dom.isHTMLElement(mutation.target) && mutation.target.classList.contains("quick-input-widget")) {
          picker = mutation.target;
        }
        for (const node of mutation.addedNodes) {
          if (dom.isHTMLElement(node) && node.classList.contains("quick-input-widget")) {
            picker = node;
          }
        }
        for (const node of mutation.removedNodes) {
          if (picker && (node === picker || node.contains(picker))) {
            picker = void 0;
          }
        }
      }
      anchorPicker();
    });
    pickerObserver.observe(actionWidgetWindow.container, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    store.add(toDisposable(() => pickerObserver.disconnect()));
    store.add(quickInputService.onShow(() => {
      pendingHide.clear();
      anchorPicker();
    }));
    store.add(quickInputService.onHide(() => {
      pendingHide.value = disposableTimeout(() => {
        if (this._contextPicker.value === store) {
          this._contextPicker.clear();
        }
      }, CHAT_INPUT_WINDOW_CONTEXT_PICKER_TRANSITION_DELAY);
    }));
    store.add(toDisposable(() => {
      void this._setActionWidgetVisible(auxiliaryWindow, surface, void 0, false, "above");
      if (this._window === auxiliaryWindow) {
        auxiliaryWindow.window.focus();
        widget.focusInput();
      }
    }));
    this._contextPicker.value = store;
    return quickInputService;
  }
  async _openActionWidgetWindow(auxiliaryWindow, surface, anchor, generation, placement) {
    const sourceWindow = auxiliaryWindow.window;
    const [cursorScreenPoint, nativeSourceBounds] = await Promise.all([
      this.hostService.getCursorScreenPoint(),
      this.hostService.getWindowPosition(sourceWindow)
    ]);
    const sourceBounds = nativeSourceBounds ?? {
      x: sourceWindow.screenX,
      y: sourceWindow.screenY,
      width: sourceWindow.outerWidth,
      height: sourceWindow.outerHeight
    };
    const sourceSurfaceBounds = surface.getBoundingClientRect();
    const sourceTop = sourceBounds.y + sourceSurfaceBounds.top;
    const sourceRight = sourceBounds.x + sourceSurfaceBounds.right;
    const sourceAnchorBounds = anchor?.getBoundingClientRect();
    const screen = sourceWindow.screen;
    const display = cursorScreenPoint?.display ?? {
      x: sourceBounds.x,
      y: sourceBounds.y,
      width: screen.availWidth,
      height: screen.availHeight
    };
    const displayBottom = display.y + display.height;
    const displayRight = display.x + display.width;
    const width = Math.min(
      placement === "right" ? CHAT_INPUT_WINDOW_ACTION_WIDGET_WIDTH : sourceBounds.width,
      display.width
    );
    const availableAbove = Math.max(1, sourceTop - display.y - CHAT_INPUT_WINDOW_ACTION_WIDGET_MARGIN);
    const height = Math.min(
      CHAT_INPUT_WINDOW_ACTION_WIDGET_HEIGHT,
      placement === "above" ? availableAbove : display.height
    );
    const preferredX = placement === "right" ? sourceRight + CHAT_INPUT_WINDOW_ACTION_WIDGET_MARGIN : sourceBounds.x;
    const preferredY = placement === "right" ? sourceBounds.y + (sourceAnchorBounds?.top ?? sourceSurfaceBounds.top) : sourceTop - height - CHAT_INPUT_WINDOW_ACTION_WIDGET_MARGIN;
    const x = Math.min(Math.max(display.x, preferredX), displayRight - width);
    const y = Math.min(Math.max(display.y, preferredY), displayBottom - height);
    const actionWidgetWindow = await this.auxiliaryWindowService.open({
      bounds: { x, y, width, height },
      alwaysOnTop: true,
      frameless: true,
      transparent: true,
      notResizable: true,
      disableFullscreen: true,
      nativeTitlebar: false,
      noBackgroundThrottling: true,
      backgroundColor: "#00000000"
    });
    await actionWidgetWindow.whenStylesHaveLoaded;
    if (generation !== this._actionWidgetLayoutGeneration || this._window !== auxiliaryWindow) {
      actionWidgetWindow.dispose();
      return;
    }
    actionWidgetWindow.window.document.body.style.setProperty("background-color", "transparent", "important");
    actionWidgetWindow.window.document.body.style.setProperty("margin", "0", "important");
    actionWidgetWindow.container.style.backgroundColor = "transparent";
    actionWidgetWindow.container.style.overflow = "hidden";
    this._actionWidgetPlacement = placement;
    this._actionWidgetWindowAnchorY = placement === "right" ? 0 : height;
    this._actionWidgetAnchorPosition = placement === "right" ? AnchorPosition.BELOW : AnchorPosition.ABOVE;
    this._actionWidgetWindow.value = actionWidgetWindow;
  }
  _getActionWidgetAnchor(anchor) {
    const bounds = anchor.getBoundingClientRect();
    return {
      x: this._actionWidgetPlacement === "right" ? 0 : bounds.left,
      y: this._actionWidgetWindowAnchorY,
      width: bounds.width,
      height: 1
    };
  }
  _disposeWidget() {
    this._completePendingVoiceRoute(false);
    this._pendingResolvedInteractionCheck.clear();
    this.voiceSessionController.setOmniInputOpen(false);
    this.voiceSessionController.setOmniInputActive(false);
    this._routingController = void 0;
    this._widget = void 0;
    this._fitWindowToContent = () => {
    };
    this._row = void 0;
    this._lead = void 0;
    this._trail = void 0;
    this._activePendingSessionResource = void 0;
    this._contextPicker.clear();
    this._actionWidgetVisibilityCount = 0;
    this._actionWidgetOwner = void 0;
    this._actionWidgetOpenOperation = void 0;
    this._actionWidgetWindow.clear();
    this._actionWidgetLayoutGeneration++;
    this._modelRef?.dispose();
    this._modelRef = void 0;
  }
  _defaultBounds() {
    return this._positionedBounds(this._defaultWidth(), CHAT_INPUT_WINDOW_DEFAULT_HEIGHT);
  }
  _positionedBounds(width, height) {
    const offset = this.storageService.getObject(
      ChatInputWindowStorageKeys.WindowPositionOffset,
      StorageScope.WORKSPACE
    );
    const validOffset = offset && Number.isFinite(offset.x) && Number.isFinite(offset.y) ? offset : void 0;
    const bounds = getChatInputWindowBounds(this._invokingWindowBounds, width, height, validOffset);
    const screen = this._invokingWindow.screen;
    const availableLeft = screen.availLeft;
    const availableTop = screen.availTop;
    if (typeof availableLeft !== "number" || typeof availableTop !== "number" || !Number.isFinite(availableLeft) || !Number.isFinite(availableTop) || screen.availWidth <= 0 || screen.availHeight <= 0) {
      return bounds;
    }
    return {
      ...bounds,
      x: Math.min(Math.max(bounds.x, availableLeft), availableLeft + Math.max(0, screen.availWidth - width)),
      y: Math.min(Math.max(bounds.y, availableTop), availableTop + Math.max(0, screen.availHeight - height))
    };
  }
  _storeWindowPosition(auxiliaryWindow) {
    const bounds = auxiliaryWindow.createState().bounds;
    if (bounds?.x === void 0 || bounds.y === void 0) {
      return;
    }
    this.storageService.store(
      ChatInputWindowStorageKeys.WindowPositionOffset,
      JSON.stringify({
        x: bounds.x - this._invokingWindowBounds.x,
        y: bounds.y - this._invokingWindowBounds.y
      }),
      StorageScope.WORKSPACE,
      StorageTarget.MACHINE
    );
  }
  _defaultWidth() {
    const invokingWindowWidth = this._invokingWindowBounds.width > 0 ? this._invokingWindowBounds.width : mainWindow.outerWidth;
    return Math.round(getQuickInputWidth(invokingWindowWidth) * 1.1);
  }
  _windowBounds(window) {
    return {
      x: window.screenX,
      y: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight
    };
  }
  _isUsableWindowBounds(bounds) {
    return !!bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && Number.isFinite(bounds.width) && Number.isFinite(bounds.height) && bounds.width > 0 && bounds.height > 0;
  }
  _isEnabled() {
    return this.configurationService.getValue(OmniChatEnabledSettingId) === true && !this.chatEntitlementService.sentiment.hidden;
  }
};
ChatInputWindowService = __decorateClass([
  __decorateParam(0, IAuxiliaryWindowService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IAgentSessionsService),
  __decorateParam(9, ILogService),
  __decorateParam(10, IVoiceSessionController),
  __decorateParam(11, IMicCaptureService),
  __decorateParam(12, ITtsPlaybackService),
  __decorateParam(13, IAccessibilityService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IKeybindingService),
  __decorateParam(16, IChatEntitlementService),
  __decorateParam(17, IHostService),
  __decorateParam(18, IFileDialogService),
  __decorateParam(19, IChatSessionRoutingProviderService)
], ChatInputWindowService);
registerSingleton(IChatInputWindowService, ChatInputWindowService, InstantiationType.Delayed);
export {
  ChatInputWindowService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRJbnB1dFdpbmRvd1xcY2hhdElucHV0V2luZG93U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0SW5wdXRXaW5kb3cuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBkaXNwb3NhYmxlVGltZW91dCwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElBbmNob3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBbmNob3JQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xheW91dC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLCBJQXV4aWxpYXJ5V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvYXV4aWxpYXJ5V2luZG93L2Jyb3dzZXIvYXV4aWxpYXJ5V2luZG93U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVjdGFuZ2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgY2hhcnRzT3JhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9jaGFydHNDb2xvcnMuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlucHV0QmFja2dyb3VuZCwgaW5wdXRCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2lucHV0Q29sb3JzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbFJlZmVyZW5jZSwgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldCB9IGZyb20gJy4uL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblJvdXRpbmdDb250cm9sbGVyLCBJQ2hhdFNlc3Npb25Sb3V0aW5nSG9zdCB9IGZyb20gJy4uL3Nlc3Npb25Sb3V0ZXIvY2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBjb21iaW5lVm9pY2VJbnB1dCB9IGZyb20gJy4uL3ZvaWNlQ2xpZW50L3ZvaWNlSW5wdXRVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0V2luZG93Q0lGYWlsdXJlLCBJQ2hhdElucHV0V2luZG93Q0lGYWlsdXJlUHJvdmlkZXIsIElDaGF0SW5wdXRXaW5kb3dTZXJ2aWNlLCBDaGF0SW5wdXRXaW5kb3dTdG9yYWdlS2V5cywgQ0hBVF9JTlBVVF9XSU5ET1dfREVGQVVMVF9IRUlHSFQsIENIQVRfSU5QVVRfV0lORE9XX1NFVF9WT0lDRV9UQVJHRVRfQ09NTUFORF9JRCwgZ2V0Q2hhdElucHV0V2luZG93Qm91bmRzLCBJQ2hhdElucHV0V2luZG93UG9zaXRpb25PZmZzZXQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdElucHV0V2luZG93LmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElSZWFkZXIsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB9IGZyb20gJy4uL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSU1pY0NhcHR1cmVTZXJ2aWNlIH0gZnJvbSAnLi4vdm9pY2VDbGllbnQvbWljQ2FwdHVyZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVR0c1BsYXliYWNrU2VydmljZSB9IGZyb20gJy4uL3ZvaWNlQ2xpZW50L3R0c1BsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzZXR1cFZvaWNlSW5wdXREZWNvcmF0aW9ucyB9IGZyb20gJy4uL3ZvaWNlQ2xpZW50L3ZvaWNlSW5wdXREZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBnZXRRdWlja0lucHV0V2lkdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcXVpY2tJbnB1dENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyU2VydmljZSwgT21uaUNoYXRFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Sb3V0ZXIuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9xdWlja2lucHV0L2Jyb3dzZXIvcXVpY2tJbnB1dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IGRlcml2ZVBlbmRpbmdJZCwgZ2V0Vm9pY2VUb29sQXBwcm92YWxDb21tYW5kLCBpc1BlbmRpbmdJZFJlc29sdmVkLCBtYXJrUGVuZGluZ0lkUmVzb2x2ZWQgfSBmcm9tICcuLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcblxuY29uc3QgQ0hBVF9JTlBVVF9XSU5ET1dfQUNUSU9OX1dJREdFVF9IRUlHSFQgPSA0MjA7XG5jb25zdCBDSEFUX0lOUFVUX1dJTkRPV19BQ1RJT05fV0lER0VUX1dJRFRIID0gNDIwO1xuY29uc3QgQ0hBVF9JTlBVVF9XSU5ET1dfQUNUSU9OX1dJREdFVF9NQVJHSU4gPSA0O1xuY29uc3QgQ0hBVF9JTlBVVF9XSU5ET1dfSU5JVElBTF9TVVJGQUNFX0hFSUdIVCA9IDQ0O1xuY29uc3QgQ0hBVF9JTlBVVF9XSU5ET1dfTUFYX1BFTkRJTkdfSEVJR0hUID0gMzYwO1xuY29uc3QgQ0hBVF9JTlBVVF9XSU5ET1dfTUlOX0NPTkZJUk1BVElPTl9IRUlHSFQgPSAxMTI7XG5jb25zdCBDSEFUX0lOUFVUX1dJTkRPV19DT05URVhUX1BJQ0tFUl9UUkFOU0lUSU9OX0RFTEFZID0gMTAwO1xuXG50eXBlIENoYXRJbnB1dEFjdGlvbldpZGdldFBsYWNlbWVudCA9ICdhYm92ZScgfCAncmlnaHQnO1xuXG5pbnRlcmZhY2UgSUNoYXRJbnB1dFdpbmRvd1BlbmRpbmdDaGF0IHtcblx0cmVhZG9ubHkga2luZDogJ2NoYXQnO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlbDogSUNoYXRNb2RlbDtcbn1cblxuaW50ZXJmYWNlIElDaGF0SW5wdXRXaW5kb3dQZW5kaW5nQ0lGYWlsdXJlIHtcblx0cmVhZG9ubHkga2luZDogJ2NpRmFpbHVyZSc7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZhaWx1cmU6IElDaGF0SW5wdXRXaW5kb3dDSUZhaWx1cmU7XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiBJQ2hhdElucHV0V2luZG93Q0lGYWlsdXJlUHJvdmlkZXI7XG59XG5cbnR5cGUgQ2hhdElucHV0V2luZG93UGVuZGluZ0l0ZW0gPSBJQ2hhdElucHV0V2luZG93UGVuZGluZ0NoYXQgfCBJQ2hhdElucHV0V2luZG93UGVuZGluZ0NJRmFpbHVyZTtcblxuZnVuY3Rpb24gZ2V0RGVzY2VuZGFudEVsZW1lbnRzKHBhcmVudDogSFRNTEVsZW1lbnQsIGNsYXNzTmFtZT86IHN0cmluZyk6IEhUTUxFbGVtZW50W10ge1xuXHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0Y29uc3QgdmlzaXQgPSAoZWxlbWVudDogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGVsZW1lbnQuY2hpbGRyZW4pIHtcblx0XHRcdGlmICghZG9tLmlzSFRNTEVsZW1lbnQoY2hpbGQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFjbGFzc05hbWUgfHwgY2hpbGQuY2xhc3NMaXN0LmNvbnRhaW5zKGNsYXNzTmFtZSkpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goY2hpbGQpO1xuXHRcdFx0fVxuXHRcdFx0dmlzaXQoY2hpbGQpO1xuXHRcdH1cblx0fTtcblx0dmlzaXQocGFyZW50KTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBIb3N0cyBhIGZyYW1lbGVzcywgYWx3YXlzLW9uLXRvcCBhdXhpbGlhcnkgd2luZG93IGNvbnRhaW5pbmcgdGhlIGZ1bGwgY2hhdFxuICogaW5wdXQgYm94IFx1MjAxNCBkaWN0YXRpb24sIHZvaWNlIG1vZGUsIGFuZCB0aGUgZ2xvdyBhbmltYXRpb24uIFN1Ym1pc3Npb25zIGFyZVxuICogaW50ZXJjZXB0ZWQgYW5kIHJvdXRlZCB0byB0aGUgYmVzdC1tYXRjaGluZyBleGlzdGluZyBzZXNzaW9uIChvciBhIG5ldyBvbmUpXG4gKiB2aWEgdGhlIHNoYXJlZCB7QGxpbmsgQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlcn0uXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0SW5wdXRXaW5kb3dTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0SW5wdXRXaW5kb3dTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9wZW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPcGVuOiBFdmVudDxib29sZWFuPiA9IHRoaXMuX29uRGlkQ2hhbmdlT3Blbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXhpbGlhcnlXaW5kb3dSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX3dpbmRvdzogSUF1eGlsaWFyeVdpbmRvdyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfd2luZG93RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vd25lcnNoaXBDaGFubmVsOiBCcm9hZGNhc3RDaGFubmVsO1xuXHRwcml2YXRlIF9tb2RlbFJlZjogSUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2lkZ2V0OiBDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wZW5kaW5nVm9pY2VSb3V0ZTogRGVmZXJyZWRQcm9taXNlPFVSSSB8IGZhbHNlPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Jlc29sdmVkSW50ZXJhY3Rpb25DaGVjayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfcGVuZGluZ1Byb21wdEluZGV4ID0gMDtcblx0cHJpdmF0ZSBfYWN0aXZlUGVuZGluZ1Nlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNtaXNzZWRQZW5kaW5nUmVxdWVzdHMgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlTZXQ8c3RyaW5nPj4odGhpcywgbmV3IFNldCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzbWlzc2VkQ0lGYWlsdXJlcyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+Pih0aGlzLCBuZXcgU2V0KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaUZhaWx1cmVQcm92aWRlcnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUNoYXRJbnB1dFdpbmRvd0NJRmFpbHVyZVByb3ZpZGVyW10+KHRoaXMsIFtdKTtcblx0cHJpdmF0ZSBfZml0V2luZG93VG9Db250ZW50OiAoKSA9PiB2b2lkID0gKCkgPT4geyB9O1xuXHQvKiogVGhlIHNpbmdsZSBpbnB1dCByb3c7IHJvdXRpbmcgcmVzdWx0cyBhcmUgaW5zZXJ0ZWQgaW1tZWRpYXRlbHkgYWZ0ZXIgaXQuICovXG5cdHByaXZhdGUgX3JvdzogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xlYWQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90cmFpbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBTaGFyZWQgcm91dGluZyArIGFkdmlzb3J5LWJhZGdlIGJlaGF2aW91cjsgcmVjcmVhdGVkIHBlciB3aWRnZXQsIHRvcm4gZG93biBvbiBjbG9zZS4gKi9cblx0cHJpdmF0ZSBfcm91dGluZ0NvbnRyb2xsZXI6IENoYXRTZXNzaW9uUm91dGluZ0NvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdC8qKiBJbi1mbGlnaHQgYG9wZW5XaW5kb3coKWAgb3BlcmF0aW9uLCBzbyBjb25jdXJyZW50IHRvZ2dsZXMgc3RheSBpZGVtcG90ZW50LiAqL1xuXHRwcml2YXRlIF9vcGVuT3BlcmF0aW9uOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZXNpcmVkT3BlbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vd25lcnNoaXBJZCA9IG1haW5XaW5kb3cuY3J5cHRvLnJhbmRvbVVVSUQoKTtcblx0cHJpdmF0ZSBfb3duZXJzaGlwQ2xhaW06IHsgcmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7IHJlYWRvbmx5IGlkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aW9uV2lkZ2V0V2luZG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElBdXhpbGlhcnlXaW5kb3c+KCkpO1xuXHRwcml2YXRlIF9hY3Rpb25XaWRnZXRMYXlvdXRHZW5lcmF0aW9uID0gMDtcblx0cHJpdmF0ZSBfYWN0aW9uV2lkZ2V0VmlzaWJpbGl0eUNvdW50ID0gMDtcblx0cHJpdmF0ZSBfYWN0aW9uV2lkZ2V0T3Blbk9wZXJhdGlvbjogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWN0aW9uV2lkZ2V0T3duZXI6IElBdXhpbGlhcnlXaW5kb3cgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGlvbldpZGdldFdpbmRvd0FuY2hvclkgPSAwO1xuXHRwcml2YXRlIF9hY3Rpb25XaWRnZXRBbmNob3JQb3NpdGlvbiA9IEFuY2hvclBvc2l0aW9uLkJFTE9XO1xuXHRwcml2YXRlIF9hY3Rpb25XaWRnZXRQbGFjZW1lbnQ6IENoYXRJbnB1dEFjdGlvbldpZGdldFBsYWNlbWVudCA9ICdhYm92ZSc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRQaWNrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0LyoqIEJvdW5kcyBvZiB0aGUgd2luZG93IHRoYXQgaW52b2tlZCBvbW5pLCBjYXB0dXJlZCBiZWZvcmUgdGhlIGF1eGlsaWFyeSB3aW5kb3cgb3BlbnMuICovXG5cdHByaXZhdGUgX2ludm9raW5nV2luZG93Qm91bmRzOiBJUmVjdGFuZ2xlID0gdGhpcy5fd2luZG93Qm91bmRzKG1haW5XaW5kb3cpO1xuXHRwcml2YXRlIF9pbnZva2luZ1dpbmRvdyA9IG1haW5XaW5kb3c7XG5cblx0Z2V0IGlzT3BlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl93aW5kb3c7XG5cdH1cblxuXHRnZXQgaGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpbmRvdz8ud2luZG93LmRvY3VtZW50Lmhhc0ZvY3VzKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRyZWdpc3RlckNJRmFpbHVyZVByb3ZpZGVyKHByb3ZpZGVyOiBJQ2hhdElucHV0V2luZG93Q0lGYWlsdXJlUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fY2lGYWlsdXJlUHJvdmlkZXJzLnNldChbLi4udGhpcy5fY2lGYWlsdXJlUHJvdmlkZXJzLmdldCgpLCBwcm92aWRlcl0sIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLl9jaUZhaWx1cmVQcm92aWRlcnMuZ2V0KCk7XG5cdFx0XHRjb25zdCBpbmRleCA9IHByb3ZpZGVycy5pbmRleE9mKHByb3ZpZGVyKTtcblx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2NpRmFpbHVyZVByb3ZpZGVycy5zZXQocHJvdmlkZXJzLmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlICE9PSBwcm92aWRlciksIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXhpbGlhcnlXaW5kb3dTZXJ2aWNlOiBJQXV4aWxpYXJ5V2luZG93U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgcHJpdmF0ZSByZWFkb25seSB2b2ljZVNlc3Npb25Db250cm9sbGVyOiBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRASU1pY0NhcHR1cmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWljQ2FwdHVyZVNlcnZpY2U6IElNaWNDYXB0dXJlU2VydmljZSxcblx0XHRASVR0c1BsYXliYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR0c1BsYXliYWNrU2VydmljZTogSVR0c1BsYXliYWNrU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uUm91dGluZ1Byb3ZpZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJvdXRpbmdQcm92aWRlclNlcnZpY2U6IElDaGF0U2Vzc2lvblJvdXRpbmdQcm92aWRlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBvd25lcnNoaXBDaGFubmVsID0gbmV3IEJyb2FkY2FzdENoYW5uZWwoJ2NoYXQtaW5wdXQtd2luZG93LW93bmVyc2hpcCcpO1xuXHRcdG93bmVyc2hpcENoYW5uZWwub25tZXNzYWdlID0gZSA9PiB7XG5cdFx0XHRjb25zdCBpbmNvbWluZyA9IGUuZGF0YTtcblx0XHRcdGlmIChpbmNvbWluZz8udHlwZSAhPT0gJ2NsYWltJyB8fCB0eXBlb2YgaW5jb21pbmcudGltZXN0YW1wICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgaW5jb21pbmcuaWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9vd25lcnNoaXBDbGFpbTtcblx0XHRcdGNvbnN0IGluY29taW5nV2lucyA9ICFjdXJyZW50XG5cdFx0XHRcdHx8IGluY29taW5nLnRpbWVzdGFtcCA+IGN1cnJlbnQudGltZXN0YW1wXG5cdFx0XHRcdHx8IChpbmNvbWluZy50aW1lc3RhbXAgPT09IGN1cnJlbnQudGltZXN0YW1wICYmIGluY29taW5nLmlkID4gY3VycmVudC5pZCk7XG5cdFx0XHRpZiAoaW5jb21pbmdXaW5zKSB7XG5cdFx0XHRcdHRoaXMuY2xvc2VXaW5kb3coKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gb3duZXJzaGlwQ2hhbm5lbC5jbG9zZSgpIH0pO1xuXHRcdHRoaXMuX293bmVyc2hpcENoYW5uZWwgPSBvd25lcnNoaXBDaGFubmVsO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYWluV2luZG93LCAnYmVmb3JldW5sb2FkJywgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3dpbmRvdykge1xuXHRcdFx0XHR0aGlzLmNsb3NlV2luZG93KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgd2FzT3BlbiA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDaGF0SW5wdXRXaW5kb3dTdG9yYWdlS2V5cy5XaW5kb3dPcGVuLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSk7XG5cdFx0aWYgKHdhc09wZW4pIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdElucHV0V2luZG93U3RvcmFnZUtleXMuV2luZG93T3BlbiwgZmFsc2UsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc21pc3NlZENJRmFpbHVyZXMuc2V0KG5ldyBTZXQoXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxyZWFkb25seSBzdHJpbmdbXT4oQ2hhdElucHV0V2luZG93U3RvcmFnZUtleXMuRGlzbWlzc2VkQ0lGYWlsdXJlcywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFtdKVxuXHRcdCksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBjbG9zZUFuZFJlc2V0UG9zaXRpb25XaGVuRGlzYWJsZWQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuY2xvc2VXaW5kb3coKTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoQ2hhdElucHV0V2luZG93U3RvcmFnZUtleXMuV2luZG93UG9zaXRpb25PZmZzZXQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihPbW5pQ2hhdEVuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdGNsb3NlQW5kUmVzZXRQb3NpdGlvbldoZW5EaXNhYmxlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZW50aW1lbnQoY2xvc2VBbmRSZXNldFBvc2l0aW9uV2hlbkRpc2FibGVkKSk7XG5cdFx0Y2xvc2VBbmRSZXNldFBvc2l0aW9uV2hlbkRpc2FibGVkKCk7XG5cdH1cblxuXHRhc3luYyBvcGVuV2luZG93KGludm9raW5nV2luZG93Qm91bmRzPzogSVJlY3RhbmdsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGVzaXJlZE9wZW4gPSB0cnVlO1xuXHRcdGlmICh0aGlzLl93aW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQ29hbGVzY2UgY29uY3VycmVudCBvcGVuL3RvZ2dsZSBjYWxscyBzbyB3ZSBuZXZlciBjcmVhdGUgdHdvIGF1eCB3aW5kb3dzLlxuXHRcdGlmICh0aGlzLl9vcGVuT3BlcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3Blbk9wZXJhdGlvbjtcblx0XHR9XG5cdFx0dGhpcy5faW52b2tpbmdXaW5kb3cgPSBkb20uZ2V0QWN0aXZlV2luZG93KCk7XG5cdFx0dGhpcy5faW52b2tpbmdXaW5kb3dCb3VuZHMgPSB0aGlzLl9pc1VzYWJsZVdpbmRvd0JvdW5kcyhpbnZva2luZ1dpbmRvd0JvdW5kcylcblx0XHRcdD8gaW52b2tpbmdXaW5kb3dCb3VuZHNcblx0XHRcdDogdGhpcy5fd2luZG93Qm91bmRzKHRoaXMuX2ludm9raW5nV2luZG93KTtcblx0XHR0aGlzLl9vcGVuT3BlcmF0aW9uID0gdGhpcy5fZG9PcGVuV2luZG93KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX29wZW5PcGVyYXRpb247XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2Rlc2lyZWRPcGVuID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9kaXNwb3NlV2lkZ2V0KCk7XG5cdFx0XHR0aGlzLl93aW5kb3cgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYXV4aWxpYXJ5V2luZG93UmVmLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRJbnB1dFdpbmRvd1N0b3JhZ2VLZXlzLldpbmRvd09wZW4sIGZhbHNlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX29wZW5PcGVyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9PcGVuV2luZG93KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJvdW5kcyA9IHRoaXMuX2RlZmF1bHRCb3VuZHMoKTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvdyA9IGF3YWl0IHRoaXMuYXV4aWxpYXJ5V2luZG93U2VydmljZS5vcGVuKHtcblx0XHRcdGJvdW5kcyxcblx0XHRcdGFsd2F5c09uVG9wOiB0cnVlLFxuXHRcdFx0ZnJhbWVsZXNzOiB0cnVlLFxuXHRcdFx0dHJhbnNwYXJlbnQ6IHRydWUsXG5cdFx0XHRkaXNhYmxlRnVsbHNjcmVlbjogdHJ1ZSxcblx0XHRcdG5hdGl2ZVRpdGxlYmFyOiBmYWxzZSxcblx0XHRcdGRpc2FibGVNYXhpbWl6ZTogdHJ1ZSxcblx0XHRcdG5vdFJlc2l6YWJsZTogdHJ1ZSxcblx0XHRcdG5vQmFja2dyb3VuZFRocm90dGxpbmc6IHRydWUsXG5cdFx0XHRiYWNrZ3JvdW5kQ29sb3I6ICcjMDAwMDAwMDAnLFxuXHRcdH0pO1xuXHRcdGlmICghdGhpcy5fZGVzaXJlZE9wZW4gfHwgIXRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRhdXhpbGlhcnlXaW5kb3cuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3dpbmRvdyA9IGF1eGlsaWFyeVdpbmRvdztcblx0XHR0aGlzLl9hdXhpbGlhcnlXaW5kb3dSZWYudmFsdWUgPSBhdXhpbGlhcnlXaW5kb3c7XG5cdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnNldE9tbmlJbnB1dE9wZW4odHJ1ZSk7XG5cdFx0Y29uc3Qgc3VyZmFjZSA9IGRvbS5hcHBlbmQoYXV4aWxpYXJ5V2luZG93LmNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LWlucHV0LXdpbmRvdycpKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgcHJvamVjdE5hbWUgPSB3b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGggPiAwID8gd29ya3NwYWNlLmZvbGRlcnNbMF0ubmFtZSA6ICcnO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuZG9jdW1lbnQudGl0bGUgPSBwcm9qZWN0TmFtZVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdElucHV0V2luZG93LnRpdGxlV2l0aFByb2plY3QnLCBcIkNoYXQgSW5wdXQgXHUyMDE0IHswfVwiLCBwcm9qZWN0TmFtZSlcblx0XHRcdDogbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy50aXRsZScsIFwiQ2hhdCBJbnB1dFwiKTtcblx0XHRhdXhpbGlhcnlXaW5kb3cuY29udGFpbmVyLnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0YXV4aWxpYXJ5V2luZG93LndpbmRvdy5kb2N1bWVudC5ib2R5LmNsYXNzTGlzdC5hZGQoJ2NoYXQtaW5wdXQtd2luZG93LWJvZHknKTtcblx0XHRhdXhpbGlhcnlXaW5kb3cud2luZG93LmRvY3VtZW50LmJvZHkuc3R5bGUuc2V0UHJvcGVydHkoJ21hcmdpbicsICcwJywgJ2ltcG9ydGFudCcpO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuZG9jdW1lbnQuYm9keS5zdHlsZS5zZXRQcm9wZXJ0eSgnb3ZlcmZsb3cnLCAnaGlkZGVuJywgJ2ltcG9ydGFudCcpO1xuXG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGFwcGx5VGhlbWVDb2xvcnMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRcdGNvbnN0IHN1cmZhY2VDb2xvciA9IHRoZW1lLmdldENvbG9yKGlucHV0QmFja2dyb3VuZCk/LnRvU3RyaW5nKCkgPz8gJyMzYzNjM2MnO1xuXHRcdFx0Y29uc3QgYm9yZGVyID0gdGhlbWUuZ2V0Q29sb3IoaW5wdXRCb3JkZXIpPy50b1N0cmluZygpID8/ICd0cmFuc3BhcmVudCc7XG5cdFx0XHRhdXhpbGlhcnlXaW5kb3cud2luZG93LmRvY3VtZW50LmJvZHkuc3R5bGUuc2V0UHJvcGVydHkoJ2JhY2tncm91bmQtY29sb3InLCAndHJhbnNwYXJlbnQnLCAnaW1wb3J0YW50Jyk7XG5cdFx0XHRzdXJmYWNlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHN1cmZhY2VDb2xvcjtcblx0XHRcdHN1cmZhY2Uuc3R5bGUuYm9yZGVyID0gYDFweCBzb2xpZCAke2JvcmRlcn1gO1xuXHRcdH07XG5cblx0XHRzdXJmYWNlLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0c3VyZmFjZS5zdHlsZS5mbGV4ID0gJzEgMSBhdXRvJztcblx0XHRzdXJmYWNlLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcblx0XHRzdXJmYWNlLnN0eWxlLm1pbkhlaWdodCA9ICcwJztcblxuXHRcdGNvbnN0IHJvdyA9IGRvbS5hcHBlbmQoc3VyZmFjZSwgZG9tLiQoJy5jaGF0LWlucHV0LXdpbmRvdy1yb3cnKSk7XG5cdFx0dGhpcy5fcm93ID0gcm93O1xuXHRcdGNvbnN0IGxlYWQgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJy5jaGF0LWlucHV0LXdpbmRvdy1sZWFkJywge1xuXHRcdFx0J2FyaWEtaGlkZGVuJzogJ3RydWUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0SW5wdXRXaW5kb3cuZHJhZycsIFwiRHJhZyB0byBtb3ZlXCIpLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9sZWFkID0gbGVhZDtcblx0XHRsZWFkLnN0eWxlLnNldFByb3BlcnR5KCctd2Via2l0LWFwcC1yZWdpb24nLCAnZHJhZycpO1xuXHRcdGxlYWQuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmdyYWJiZXIpKTtcblxuXHRcdGFwcGx5VGhlbWVDb2xvcnMoKTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IGFwcGx5VGhlbWVDb2xvcnMoKSkpO1xuXG5cdFx0Ly8gSG9zdCB0aGUgcmVhbCBjaGF0IGlucHV0IChkaWN0YXRpb24sIHZvaWNlIG1vZGUsIGdsb3cpIGJ5IHJlbmRlcmluZyBhXG5cdFx0Ly8gY29tcGFjdCBDaGF0V2lkZ2V0LiBUaGUgcmVzcG9uc2UgbGlzdCBpcyBmaWx0ZXJlZCBvdXQgc28gb25seSB0aGUgaW5wdXRcblx0XHQvLyBib3ggc2hvd3MuIFN1Ym1pc3Npb24gaXMgaW50ZXJjZXB0ZWQgdmlhIHN1Ym1pdEhhbmRsZXIgKHRoZSByb3V0aW5nXG5cdFx0Ly8gc2VhbSkgYW5kIHJvdXRlZCB0byB0aGUgYmVzdC1tYXRjaGluZyBleGlzdGluZyBzZXNzaW9uLlxuXHRcdHRoaXMuX3JlbmRlckNoYXRXaWRnZXQoYXV4aWxpYXJ5V2luZG93LCBzdXJmYWNlLCByb3csIGJvdW5kcyk7XG5cdFx0Y29uc3QgcGVuZGluZ0FjdGl2ZVdpbmRvd1N5bmMgPSB0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBvd25zVm9pY2UgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIub21uaUlucHV0QWN0aXZlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChvd25zVm9pY2UgfHwgYXV4aWxpYXJ5V2luZG93LndpbmRvdy5kb2N1bWVudC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHBlbmRpbmdBY3RpdmVXaW5kb3dTeW5jLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoYXV4aWxpYXJ5V2luZG93LndpbmRvdywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSBkb20uZ2V0QWN0aXZlV2luZG93KCk7XG5cdFx0XHRcdGlmIChhY3RpdmVXaW5kb3cgIT09IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cpIHtcblx0XHRcdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuc2V0QWN0aXZlV2luZG93KGFjdGl2ZVdpbmRvdyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHRyYWlsID0gZG9tLmFwcGVuZChyb3csIGRvbS4kKCcuY2hhdC1pbnB1dC13aW5kb3ctdHJhaWwnKSk7XG5cdFx0dGhpcy5fdHJhaWwgPSB0cmFpbDtcblx0XHRjb25zdCBjbG9zZSA9IGRvbS5hcHBlbmQodHJhaWwsIGRvbS4kKCdhLmNoYXQtaW5wdXQtd2luZG93LWNsb3NlJywge1xuXHRcdFx0cm9sZTogJ2J1dHRvbicsXG5cdFx0XHR0YWJpbmRleDogJzAnLFxuXHRcdFx0J2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgnY2hhdElucHV0V2luZG93LmNsb3NlLmxhYmVsJywgXCJDbG9zZVwiKSxcblx0XHR9KSk7XG5cdFx0Y2xvc2UuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNsb3NlU21hbGwpKTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjbG9zZSwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5jbG9zZVdpbmRvdygpKSk7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihjbG9zZSwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5jbG9zZVdpbmRvdygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZW5kZXJQZW5kaW5nUHJvbXB0cyhhdXhpbGlhcnlXaW5kb3csIHN1cmZhY2UpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgd2hlbiB0aGUgdXNlciBjbG9zZXMgdGhlIHdpbmRvdyB2aWEgT1MgY29udHJvbHMuIEd1YXJkIGJ5IHdpbmRvd1xuXHRcdC8vIGlkZW50aXR5IHNvIGEgc3RhbGUgdW5sb2FkIGFmdGVyIGEgcXVpY2sgcmVvcGVuIGNhbid0IHRlYXIgZG93biB0aGUgbmV3IG9uZS5cblx0XHRFdmVudC5vbmNlKGF1eGlsaWFyeVdpbmRvdy5vblVubG9hZCkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3dpbmRvdyAhPT0gYXV4aWxpYXJ5V2luZG93KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0b3JlV2luZG93UG9zaXRpb24oYXV4aWxpYXJ5V2luZG93KTtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VXaWRnZXQoKTtcblx0XHRcdHRoaXMuX2Rlc2lyZWRPcGVuID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9vd25lcnNoaXBDbGFpbSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3dpbmRvdyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hdXhpbGlhcnlXaW5kb3dSZWYudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRJbnB1dFdpbmRvd1N0b3JhZ2VLZXlzLldpbmRvd09wZW4sIGZhbHNlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VPcGVuLmZpcmUoZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0SW5wdXRXaW5kb3dTdG9yYWdlS2V5cy5XaW5kb3dPcGVuLCB0cnVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlT3Blbi5maXJlKHRydWUpO1xuXHR9XG5cblx0Y2xvc2VXaW5kb3coKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVzaXJlZE9wZW4gPSBmYWxzZTtcblx0XHR0aGlzLl9vd25lcnNoaXBDbGFpbSA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRoaXMuX3dpbmRvdykgeyByZXR1cm47IH1cblxuXHRcdHRoaXMuX3N0b3JlV2luZG93UG9zaXRpb24odGhpcy5fd2luZG93KTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRJbnB1dFdpbmRvd1N0b3JhZ2VLZXlzLldpbmRvd09wZW4sIGZhbHNlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Ly8gQ2FuY2VsIGFueSBpbi1mbGlnaHQgc3VibWlzc2lvbiBzbyByb3V0aW5nIGNhbid0IGRpc3BhdGNoIGFmdGVyIGNsb3NlLlxuXHRcdHRoaXMuX3JvdXRpbmdDb250cm9sbGVyPy5jYW5jZWxQZW5kaW5nKCk7XG5cdFx0dGhpcy5fZGlzcG9zZVdpZGdldCgpO1xuXHRcdHRoaXMuX3dpbmRvdyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2F1eGlsaWFyeVdpbmRvd1JlZi52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU9wZW4uZmlyZShmYWxzZSk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVXaW5kb3coaW52b2tpbmdXaW5kb3dCb3VuZHM/OiBJUmVjdGFuZ2xlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2Rlc2lyZWRPcGVuIHx8IHRoaXMuaXNPcGVuKSB7XG5cdFx0XHR0aGlzLmNsb3NlV2luZG93KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNsYWltID0geyB0aW1lc3RhbXA6IERhdGUubm93KCksIGlkOiB0aGlzLl9vd25lcnNoaXBJZCB9O1xuXHRcdFx0dGhpcy5fb3duZXJzaGlwQ2xhaW0gPSBjbGFpbTtcblx0XHRcdHRoaXMuX293bmVyc2hpcENoYW5uZWwucG9zdE1lc3NhZ2UoeyB0eXBlOiAnY2xhaW0nLCAuLi5jbGFpbSB9KTtcblx0XHRcdGF3YWl0IHRoaXMub3BlbldpbmRvdyhpbnZva2luZ1dpbmRvd0JvdW5kcyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYWNjZXB0Vm9pY2VJbnB1dCh0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPFVSSSB8IGZhbHNlPiB7XG5cdFx0Y29uc3Qgd2luZG93ID0gdGhpcy5fd2luZG93Py53aW5kb3c7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fd2lkZ2V0O1xuXHRcdGlmICgoIXdpbmRvdz8uZG9jdW1lbnQuaGFzRm9jdXMoKSAmJiAhdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm9tbmlJbnB1dEFjdGl2ZS5nZXQoKSkgfHwgIXdpZGdldCB8fCAhdGhpcy5fcm91dGluZ0NvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb21wbGV0ZVBlbmRpbmdWb2ljZVJvdXRlKGZhbHNlKTtcblx0XHRjb25zdCBwZW5kaW5nUm91dGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFVSSSB8IGZhbHNlPigpO1xuXHRcdHRoaXMuX3BlbmRpbmdWb2ljZVJvdXRlID0gcGVuZGluZ1JvdXRlO1xuXHRcdGNvbnN0IHJvdXRlVGltZW91dCA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHBlbmRpbmdSb3V0ZS5jb21wbGV0ZShmYWxzZSksIDMwXzAwMCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHdpZGdldC5hY2NlcHRJbnB1dChjb21iaW5lVm9pY2VJbnB1dCh3aWRnZXQuZ2V0SW5wdXQoKSwgdGV4dCksIHtcblx0XHRcdFx0cHJlc2VydmVGb2N1czogdHJ1ZSxcblx0XHRcdFx0aXNWb2ljZU1vZGVJbnB1dDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHBlbmRpbmdSb3V0ZS5wO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyb3V0ZVRpbWVvdXQuZGlzcG9zZSgpO1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdWb2ljZVJvdXRlID09PSBwZW5kaW5nUm91dGUpIHtcblx0XHRcdFx0dGhpcy5fY29tcGxldGVQZW5kaW5nVm9pY2VSb3V0ZShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29tcGxldGVQZW5kaW5nVm9pY2VSb3V0ZShyZXNvdXJjZTogVVJJIHwgZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nUm91dGUgPSB0aGlzLl9wZW5kaW5nVm9pY2VSb3V0ZTtcblx0XHRpZiAoIXBlbmRpbmdSb3V0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nVm9pY2VSb3V0ZSA9IHVuZGVmaW5lZDtcblx0XHR2b2lkIHBlbmRpbmdSb3V0ZS5jb21wbGV0ZShyZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDaGF0V2lkZ2V0KGF1eGlsaWFyeVdpbmRvdzogSUF1eGlsaWFyeVdpbmRvdywgc3VyZmFjZTogSFRNTEVsZW1lbnQsIHJvdzogSFRNTEVsZW1lbnQsIG9wZW5pbmdCb3VuZHM6IElSZWN0YW5nbGUpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNtaXNzZWRQZW5kaW5nUmVxdWVzdHMuc2V0KG5ldyBTZXQoKSwgdW5kZWZpbmVkKTtcblx0XHQvLyBUaGUgZ2xvdyBDU1Mga2V5cyBvZmYgYC5tb25hY28td29ya2JlbmNoIC5pbnRlcmFjdGl2ZS1zZXNzaW9uXG5cdFx0Ly8gLmNoYXQtaW5wdXQtY29udGFpbmVyYCAtIHRoZSBhdXggY29udGFpbmVyIGFscmVhZHkgdHJhY2tzIHRoZVxuXHRcdC8vIGBtb25hY28td29ya2JlbmNoYCBjbGFzcywgc28gd2Ugb25seSBuZWVkIHRoZSBgLmludGVyYWN0aXZlLXNlc3Npb25gXG5cdFx0Ly8gd3JhcHBlciBoZXJlLlxuXHRcdGNvbnN0IHBhcmVudCA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnLmludGVyYWN0aXZlLXNlc3Npb24nKSk7XG5cdFx0cGFyZW50LnN0eWxlLmZsZXggPSAnMSAxIGF1dG8nO1xuXHRcdHBhcmVudC5zdHlsZS5taW5XaWR0aCA9ICcwJztcblx0XHRjb25zdCBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlID0gZG9tLmFwcGVuZChhdXhpbGlhcnlXaW5kb3cud2luZG93LmRvY3VtZW50LmJvZHksIGRvbS4kKCcuY2hhdC1lZGl0b3Itb3ZlcmZsb3cubW9uYWNvLWVkaXRvcicpKTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHBhcmVudCkpO1xuXHRcdC8vIE1hcmsgdGhpcyBzdXJmYWNlIHNvIGl0cyBkZWRpY2F0ZWQgYWNjZXNzaWJpbGl0eSBoZWxwIChyb3V0aW5nICsgaG93IHRvXG5cdFx0Ly8gY2xvc2UpIHRha2VzIHByZWNlZGVuY2Ugb3ZlciB0aGUgZ2VuZXJpYyBRdWljayBDaGF0IGhlbHAuXG5cdFx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0V2luZG93LmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IHdpZGdldDogQ2hhdFdpZGdldCA9IHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRXaWRnZXQsXG5cdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0eyBpc1F1aWNrQ2hhdDogdHJ1ZSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRhdXRvU2Nyb2xsOiB0cnVlLFxuXHRcdFx0XHRyZW5kZXJJbnB1dE9uVG9wOiB0cnVlLFxuXHRcdFx0XHRyZW5kZXJTdHlsZTogJ2NvbXBhY3QnLFxuXHRcdFx0XHRpbnB1dEVkaXRvck1heEhlaWdodDogMjUwLFxuXHRcdFx0XHRyZW5kZXJHZXR0aW5nU3RhcnRlZFRpcDogZmFsc2UsXG5cdFx0XHRcdGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHQvLyBTaG93IG9ubHkgdGhlIGlucHV0IGJveCBcdTIwMTQgZHJvcCBldmVyeSByZXNwb25zZSBsaXN0IGl0ZW0uXG5cdFx0XHRcdGZpbHRlcjogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGVuYWJsZUltcGxpY2l0Q29udGV4dDogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHRNb2RlOiBDaGF0TW9kZS5BZ2VudCxcblx0XHRcdFx0bW9kZWxQaWNrZXJTZXNzaW9uVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvcGlsb3QsXG5cdFx0XHRcdG1lbnVzOiB7IHRlbGVtZXRyeVNvdXJjZTogJ2NoYXRJbnB1dFdpbmRvdycgfSxcblx0XHRcdFx0Ly8gUm91dGluZyBzZWFtOiBpbnRlcmNlcHQgc3VibWlzc2lvbiBiZWZvcmUgbG9jYWwgZXhlY3V0aW9uIGFuZFxuXHRcdFx0XHQvLyByb3V0ZSBpdCB0byB0aGUgYmVzdC1tYXRjaGluZyBleGlzdGluZyBzZXNzaW9uIChvciBhIG5ldyBvbmUpLFxuXHRcdFx0XHQvLyBmb3J3YXJkaW5nIGFueSBleHBsaWNpdCBhdHRhY2htZW50cyBvbiB0aGUgaW5wdXQuXG5cdFx0XHRcdHN1Ym1pdEhhbmRsZXI6IChxdWVyeSwgbW9kZSwgYXR0YWNoZWRDb250ZXh0LCBpc1ZvaWNlTW9kZUlucHV0KSA9PiB0aGlzLl9yb3V0aW5nQ29udHJvbGxlcj8uaGFuZGxlU3VibWl0KHF1ZXJ5LCBtb2RlLCBhdHRhY2hlZENvbnRleHQsIGlzVm9pY2VNb2RlSW5wdXQpID8/IFByb21pc2UucmVzb2x2ZShmYWxzZSksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxQaWNrZXJWaXNpYmlsaXR5OiB2aXNpYmxlID0+IHRoaXMuX3NldEFjdGlvbldpZGdldFZpc2libGUoYXV4aWxpYXJ5V2luZG93LCBzdXJmYWNlLCB1bmRlZmluZWQsIHZpc2libGUsICdhYm92ZScpLFxuXHRcdFx0XHRpbnB1dFBpY2tlclBvc2l0aW9uOiAoKSA9PiB0aGlzLl9hY3Rpb25XaWRnZXRBbmNob3JQb3NpdGlvbixcblx0XHRcdFx0aW5wdXRQaWNrZXJDb250YWluZXI6ICgpID0+IHRoaXMuX2FjdGlvbldpZGdldFdpbmRvdy52YWx1ZT8uY29udGFpbmVyLFxuXHRcdFx0XHRpbnB1dFBpY2tlckFuY2hvcjogYW5jaG9yID0+IHRoaXMuX2dldEFjdGlvbldpZGdldEFuY2hvcihhbmNob3IpLFxuXHRcdFx0XHRpbnB1dFBpY2tlck9wZW5Pbk1vdXNlVXA6IHRydWUsXG5cdFx0XHRcdGNvbnRleHRQaWNrZXI6IHtcblx0XHRcdFx0XHRwcmVwYXJlOiAoKTogUHJvbWlzZTxJUXVpY2tJbnB1dFNlcnZpY2U+ID0+IHRoaXMuX3ByZXBhcmVDb250ZXh0UGlja2VyKGF1eGlsaWFyeVdpbmRvdywgc3VyZmFjZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHdpZGdldCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpbnB1dEVkaXRvckJhY2tncm91bmQ6IGlucHV0QmFja2dyb3VuZCxcblx0XHRcdFx0cmVzdWx0RWRpdG9yQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdGxpc3RGb3JlZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRvdmVybGF5QmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdH1cblx0XHQpKTtcblx0XHR0aGlzLl93aWRnZXQgPSB3aWRnZXQ7XG5cdFx0d2lkZ2V0LnJlbmRlcihwYXJlbnQpO1xuXHRcdHdpZGdldC5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdGNvbnN0IGlucHV0Q29udGFpbmVyID0gd2lkZ2V0LmlucHV0LmlucHV0Q29udGFpbmVyRWxlbWVudDtcblx0XHRpZiAoaW5wdXRDb250YWluZXIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGlucHV0VmFsdWUgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHdpZGdldC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCwgKCkgPT4gd2lkZ2V0LmdldElucHV0KCkpO1xuXHRcdFx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQoc2V0dXBWb2ljZUlucHV0RGVjb3JhdGlvbnMoe1xuXHRcdFx0XHRcdHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI6IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRcdFx0XHR0dHNQbGF5YmFja1NlcnZpY2U6IHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLFxuXHRcdFx0XHRcdG1pY0NhcHR1cmVTZXJ2aWNlOiB0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLFxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdFx0XHRcdHRoZW1lU2VydmljZTogdGhpcy50aGVtZVNlcnZpY2UsXG5cdFx0XHRcdFx0YWNjZXNzaWJpbGl0eVNlcnZpY2U6IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpbnB1dENvbnRhaW5lcixcblx0XHRcdFx0XHRnbG93Q29udGFpbmVyOiBzdXJmYWNlLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIub21uaUlucHV0T3Blbixcblx0XHRcdFx0XHRpbnB1dFZhbHVlLFxuXHRcdFx0XHRcdGlzT3duZXI6IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5vbW5pSW5wdXRPcGVuLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tjaGF0SW5wdXRXaW5kb3ddIEZhaWxlZCB0byBpbml0aWFsaXplIHZvaWNlIGRlY29yYXRpb25zJywgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGhpcy5jaGF0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB7IGRpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlOiB0cnVlLCBkZWJ1Z093bmVyOiAnQ2hhdElucHV0V2luZG93JyB9KTtcblx0XHR0aGlzLl9tb2RlbFJlZiA9IG1vZGVsUmVmO1xuXHRcdHdpZGdldC5zZXRNb2RlbChtb2RlbFJlZi5vYmplY3QpO1xuXHRcdHdpZGdldC5zZXRJbnB1dFBsYWNlaG9sZGVyKGxvY2FsaXplKCdjaGF0SW5wdXRXaW5kb3cuaW5wdXRQbGFjZWhvbGRlcicsIFwiU2VuZCBhIHJlcXVlc3QgdG8gYW55IHNlc3Npb24gb3IgZm9sZGVyLi4uXCIpKTtcblxuXHRcdGxldCBmaXRXaW5kb3dUb0lucHV0ID0gKCkgPT4geyB9O1xuXG5cdFx0Ly8gUm91dGUgc3VibWlzc2lvbnMgdGhyb3VnaCB0aGUgc2hhcmVkIGNvbnRyb2xsZXIsIGluc2VydGluZyBpdHMgYWR2aXNvcnlcblx0XHQvLyBwYW5lbCBiZWxvdyB0aGUgaW5wdXQgYW5kIGV4Y2x1ZGluZyB0aGlzIHdpbmRvdydzIHNjcmF0Y2ggc2Vzc2lvbiBmcm9tXG5cdFx0Ly8gdGhlIHJvdXRpbmcgY2FuZGlkYXRlcyBzbyBpdCBjYW4gbmV2ZXIgcm91dGUgdG8gaXRzZWxmLlxuXHRcdGNvbnN0IGhvc3Q6IElDaGF0U2Vzc2lvblJvdXRpbmdIb3N0ID0ge1xuXHRcdFx0d2lkZ2V0LFxuXHRcdFx0Z2V0T3duU2Vzc2lvblJlc291cmNlOiAoKSA9PiB0aGlzLl9tb2RlbFJlZj8ub2JqZWN0LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGdldFJvdXRpbmdQcm92aWRlcjogKCkgPT4gdGhpcy5yb3V0aW5nUHJvdmlkZXJTZXJ2aWNlLmdldFByb3ZpZGVyKCksXG5cdFx0XHRnZXRQZW5kaW5nUmVwbHlTZXNzaW9uUmVzb3VyY2U6ICgpID0+IHRoaXMuX2FjdGl2ZVBlbmRpbmdTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRnZXRTZWxlY3RlZE1vZGVsTGFiZWw6ICgpID0+IHdpZGdldC5pbnB1dFBhcnQuc2VsZWN0ZWRMYW5ndWFnZU1vZGVsLmdldCgpPy5tZXRhZGF0YS5uYW1lLFxuXHRcdFx0b25XaWxsUm91dGU6ICgpID0+IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5wcmVwYXJlRm9yUm91dGluZ1JlcXVlc3QoKSxcblx0XHRcdG9uV2lsbERpc3BhdGNoUm91dGU6IHJlc291cmNlID0+IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5tYXJrUm91dGVkUmVxdWVzdFBlbmRpbmcocmVzb3VyY2UpLFxuXHRcdFx0b25EaWRSZWplY3RSb3V0ZTogKHJlc291cmNlLCBpc1ZvaWNlTW9kZUlucHV0KSA9PiB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5jbGVhclJvdXRlZFJlcXVlc3QocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc1ZvaWNlTW9kZUlucHV0KSB7XG5cdFx0XHRcdFx0dGhpcy5fY29tcGxldGVQZW5kaW5nVm9pY2VSb3V0ZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlc29sdmVSb3V0ZTogKHJlc291cmNlLCBraW5kLCBpc1ZvaWNlTW9kZUlucHV0LCByZXF1ZXN0SWQpID0+IHtcblx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm1hcmtSb3V0ZWRSZXF1ZXN0UGVuZGluZyhyZXNvdXJjZSwgcmVxdWVzdElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNWb2ljZU1vZGVJbnB1dCkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbXBsZXRlUGVuZGluZ1ZvaWNlUm91dGUocmVzb3VyY2UgPz8gZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9JTlBVVF9XSU5ET1dfU0VUX1ZPSUNFX1RBUkdFVF9DT01NQU5EX0lELCByZXNvdXJjZT8udG9TdHJpbmcoKSwga2luZCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZERpc21pc3NSb3V0ZTogKHJlc291cmNlLCByZXF1ZXN0SWQpID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzbWlzc2VkID0gbmV3IFNldCh0aGlzLl9kaXNtaXNzZWRQZW5kaW5nUmVxdWVzdHMuZ2V0KCkpO1xuXHRcdFx0XHRkaXNtaXNzZWQuYWRkKHRoaXMuX3BlbmRpbmdSZXF1ZXN0S2V5KHJlc291cmNlLCByZXF1ZXN0SWQpKTtcblx0XHRcdFx0dGhpcy5fZGlzbWlzc2VkUGVuZGluZ1JlcXVlc3RzLnNldChkaXNtaXNzZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5jbGVhclJvdXRlZFJlcXVlc3QocmVzb3VyY2UpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aW9uV2lkZ2V0VmlzaWJpbGl0eTogKHZpc2libGUsIGFuY2hvcikgPT4gdGhpcy5fc2V0QWN0aW9uV2lkZ2V0VmlzaWJsZShhdXhpbGlhcnlXaW5kb3csIHN1cmZhY2UsIGFuY2hvciwgdmlzaWJsZSwgJ3JpZ2h0JyksXG5cdFx0XHRnZXRBY3Rpb25XaWRnZXRDb250YWluZXI6ICgpID0+IHRoaXMuX2FjdGlvbldpZGdldFdpbmRvdy52YWx1ZT8uY29udGFpbmVyLFxuXHRcdFx0Z2V0QWN0aW9uV2lkZ2V0QW5jaG9yOiBhbmNob3IgPT4gdGhpcy5fZ2V0QWN0aW9uV2lkZ2V0QW5jaG9yKGFuY2hvciksXG5cdFx0XHRnZXRBY3Rpb25XaWRnZXRBbmNob3JQb3NpdGlvbjogKCkgPT4gdGhpcy5fYWN0aW9uV2lkZ2V0QW5jaG9yUG9zaXRpb24sXG5cdFx0XHRwaWNrRm9sZGVyOiBhc3luYyBkZWZhdWx0VXJpID0+IChhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0SW5wdXRXaW5kb3cuc2VsZWN0U2Vzc2lvbkZvbGRlcicsIFwiU2VsZWN0IEZvbGRlciBmb3IgTmV3IFNlc3Npb25cIiksXG5cdFx0XHRcdG9wZW5MYWJlbDogbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy5zZWxlY3RGb2xkZXInLCBcIlNlbGVjdCBGb2xkZXJcIiksXG5cdFx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHRVcmksXG5cdFx0XHR9KSk/LlswXSxcblx0XHRcdHBsYWNlQmFkZ2U6IChiYWRnZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByb3cgPSB0aGlzLl9yb3c7XG5cdFx0XHRcdGlmICghc3VyZmFjZS5pc0Nvbm5lY3RlZCB8fCAhcm93KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJvdy5hZnRlcihiYWRnZSk7XG5cdFx0XHRcdGZpdFdpbmRvd1RvSW5wdXQoKTtcblx0XHRcdFx0Y29uc3Qgb2JzZXJ2ZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdFx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IG5ldyBhdXhpbGlhcnlXaW5kb3cud2luZG93LlJlc2l6ZU9ic2VydmVyKCgpID0+IGZpdFdpbmRvd1RvSW5wdXQoKSk7XG5cdFx0XHRcdG9ic2VydmVyRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblx0XHRcdFx0cmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShiYWRnZSk7XG5cdFx0XHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFiYWRnZS5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRcdFx0b2JzZXJ2ZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRmaXRXaW5kb3dUb0lucHV0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0b2JzZXJ2ZXJEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXHRcdFx0XHRvYnNlcnZlci5vYnNlcnZlKHN1cmZhY2UsIHsgY2hpbGRMaXN0OiB0cnVlIH0pO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHRoaXMuX3JvdXRpbmdDb250cm9sbGVyID0gdGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlc3Npb25Sb3V0aW5nQ29udHJvbGxlciwgaG9zdCwgJ2NoYXRJbnB1dFdpbmRvdycpKTtcblxuXHRcdC8vIEZpdCB0aGUgZnJhbWVsZXNzIHdpbmRvdyB0byB0aGUgd2lkZ2V0J3Mgb3duIGNvbnRlbnQgYW5kIGFueSByb3V0aW5nXG5cdFx0Ly8gcGFuZWwgYmVsb3cgaXQuIE1lYXN1cmluZyB0aGUgaW5wdXQgY29udGFpbmVyIGl0c2VsZiBpbmNsdWRlcyB0aGVcblx0XHQvLyBoZWlnaHQgdGhlIGhvc3QgYXNzaWduZWQgYW5kIGNyZWF0ZXMgYSBmZWVkYmFjayBsb29wIHdpdGggZW1wdHkgc3BhY2UuXG5cdFx0bGV0IGxhc3RDb250ZW50SGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRpZEluaXRpYWxQb3NpdGlvbiA9IGZhbHNlO1xuXHRcdC8vIFJlbmRlcmVyIHNjcmVlbiBjb29yZGluYXRlcyBsYWcgbmF0aXZlIG1vdmVzLCBzbyByZXRhaW4gdGhlIHJlcXVlc3RlZFxuXHRcdC8vIHBvc2l0aW9uIHVudGlsIGVhY2ggcXVldWVkIGJvdW5kcyB1cGRhdGUgaGFzIGNvbXBsZXRlZC5cblx0XHRsZXQgY3VycmVudFBvc2l0aW9uID0geyB4OiBvcGVuaW5nQm91bmRzLngsIHk6IG9wZW5pbmdCb3VuZHMueSB9O1xuXHRcdGxldCBwZW5kaW5nQm91bmRzOiBJUmVjdGFuZ2xlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhcHBseWluZ0JvdW5kcyA9IGZhbHNlO1xuXHRcdGNvbnN0IGdldFJvd0hlaWdodCA9ICgpID0+IHtcblx0XHRcdGxldCBjb250ZW50SGVpZ2h0ID0gTWF0aC5jZWlsKHdpZGdldC5jb250ZW50SGVpZ2h0KTtcblx0XHRcdGlmICh3aWRnZXQuYXR0YWNobWVudE1vZGVsLnNpemUgPiAwKSB7XG5cdFx0XHRcdGNvbnRlbnRIZWlnaHQgKz0gTWF0aC5tYXgoMCwgQ0hBVF9JTlBVVF9XSU5ET1dfSU5JVElBTF9TVVJGQUNFX0hFSUdIVCAtIHdpZGdldC5pbnB1dC5pbnB1dFJvd0hlaWdodCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gTWF0aC5tYXgoQ0hBVF9JTlBVVF9XSU5ET1dfSU5JVElBTF9TVVJGQUNFX0hFSUdIVCwgY29udGVudEhlaWdodCk7XG5cdFx0fTtcblx0XHRjb25zdCBhcHBseVBlbmRpbmdCb3VuZHMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoYXBwbHlpbmdCb3VuZHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXBwbHlpbmdCb3VuZHMgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0d2hpbGUgKHBlbmRpbmdCb3VuZHMgJiYgdGhpcy5fd2luZG93ID09PSBhdXhpbGlhcnlXaW5kb3cpIHtcblx0XHRcdFx0XHRjb25zdCBib3VuZHMgPSBwZW5kaW5nQm91bmRzO1xuXHRcdFx0XHRcdHBlbmRpbmdCb3VuZHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y3VycmVudFBvc2l0aW9uID0geyB4OiBib3VuZHMueCwgeTogYm91bmRzLnkgfTtcblx0XHRcdFx0XHRhd2FpdCBhdXhpbGlhcnlXaW5kb3cuc2V0Qm91bmRzKGJvdW5kcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGFwcGx5aW5nQm91bmRzID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRmaXRXaW5kb3dUb0lucHV0ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2luID0gdGhpcy5fd2luZG93Py53aW5kb3c7XG5cdFx0XHRpZiAoIXdpbiB8fCB3aW4gIT09IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLl9kZWZhdWx0V2lkdGgoKTtcblx0XHRcdGNvbnN0IHJvd0hlaWdodCA9IGdldFJvd0hlaWdodCgpO1xuXHRcdFx0Y29uc3QgZXh0cmFIZWlnaHQgPSBBcnJheS5mcm9tKHN1cmZhY2UuY2hpbGRyZW4pXG5cdFx0XHRcdC5maWx0ZXIoY2hpbGQgPT4gY2hpbGQgIT09IHRoaXMuX3Jvdylcblx0XHRcdFx0LnJlZHVjZSgoaGVpZ2h0LCBjaGlsZCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBjaGlsZCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5wb3NpdGlvbjtcblx0XHRcdFx0XHRyZXR1cm4gcG9zaXRpb24gPT09ICdhYnNvbHV0ZScgfHwgcG9zaXRpb24gPT09ICdmaXhlZCdcblx0XHRcdFx0XHRcdD8gaGVpZ2h0XG5cdFx0XHRcdFx0XHQ6IGhlaWdodCArIGVsZW1lbnQub2Zmc2V0SGVpZ2h0O1xuXHRcdFx0XHR9LCAwKTtcblx0XHRcdGNvbnN0IGNvbnRlbnRIZWlnaHQgPSByb3dIZWlnaHQgKyBleHRyYUhlaWdodCArIDQ7XG5cdFx0XHRpZiAoY29udGVudEhlaWdodCA9PT0gbGFzdENvbnRlbnRIZWlnaHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGFzdENvbnRlbnRIZWlnaHQgPSBjb250ZW50SGVpZ2h0O1xuXHRcdFx0aWYgKCFkaWRJbml0aWFsUG9zaXRpb24pIHtcblx0XHRcdFx0ZGlkSW5pdGlhbFBvc2l0aW9uID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbEJvdW5kcyA9IHRoaXMuX3Bvc2l0aW9uZWRCb3VuZHMod2lkdGgsIGNvbnRlbnRIZWlnaHQpO1xuXHRcdFx0XHRjdXJyZW50UG9zaXRpb24gPSB7IHg6IGluaXRpYWxCb3VuZHMueCwgeTogaW5pdGlhbEJvdW5kcy55IH07XG5cdFx0XHR9IGVsc2UgaWYgKCFhcHBseWluZ0JvdW5kcykge1xuXHRcdFx0XHRjdXJyZW50UG9zaXRpb24gPSB7IHg6IHdpbi5zY3JlZW5YLCB5OiB3aW4uc2NyZWVuWSB9O1xuXHRcdFx0fVxuXHRcdFx0cGVuZGluZ0JvdW5kcyA9IHsgLi4uY3VycmVudFBvc2l0aW9uLCB3aWR0aCwgaGVpZ2h0OiBjb250ZW50SGVpZ2h0IH07XG5cdFx0XHR2b2lkIGFwcGx5UGVuZGluZ0JvdW5kcygpO1xuXHRcdH07XG5cdFx0dGhpcy5fZml0V2luZG93VG9Db250ZW50ID0gZml0V2luZG93VG9JbnB1dDtcblxuXHRcdGxldCBsYXlpbmdPdXQgPSBmYWxzZTtcblx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiB7XG5cdFx0XHRpZiAobGF5aW5nT3V0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxheWluZ091dCA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjaHJvbWUgPSAodGhpcy5fbGVhZD8ub2Zmc2V0V2lkdGggPz8gMCkgKyAodGhpcy5fdHJhaWw/Lm9mZnNldFdpZHRoID8/IDApO1xuXHRcdFx0XHRjb25zdCByb3dTdHlsZSA9IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShyb3cpO1xuXHRcdFx0XHRjb25zdCBob3Jpem9udGFsUGFkZGluZyA9IE51bWJlci5wYXJzZUZsb2F0KHJvd1N0eWxlLnBhZGRpbmdMZWZ0KSArIE51bWJlci5wYXJzZUZsb2F0KHJvd1N0eWxlLnBhZGRpbmdSaWdodCk7XG5cdFx0XHRcdGNvbnN0IGF2YWlsYWJsZSA9IE1hdGgubWF4KDAsIHJvdy5jbGllbnRXaWR0aCAtIGNocm9tZSAtIGhvcml6b250YWxQYWRkaW5nKTtcblx0XHRcdFx0cGFyZW50LnN0eWxlLndpZHRoID0gYCR7YXZhaWxhYmxlfXB4YDtcblx0XHRcdFx0d2lkZ2V0LmlucHV0LmxheW91dChhdmFpbGFibGUpO1xuXHRcdFx0XHRjb25zdCByb3dIZWlnaHQgPSBnZXRSb3dIZWlnaHQoKTtcblx0XHRcdFx0d2lkZ2V0LmxheW91dEZvcklucHV0SGVpZ2h0KHJvd0hlaWdodCwgYXZhaWxhYmxlKTtcblx0XHRcdFx0Zml0V2luZG93VG9JbnB1dCgpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bGF5aW5nT3V0ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRsYXlvdXQoKTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQod2lkZ2V0Lm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoKSA9PiBmaXRXaW5kb3dUb0lucHV0KCkpKTtcblx0XHRjb25zdCB1cGRhdGVBdHRhY2htZW50TGF5b3V0ID0gKCkgPT4ge1xuXHRcdFx0cm93LmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1hdHRhY2htZW50cycsIHdpZGdldC5hdHRhY2htZW50TW9kZWwuc2l6ZSA+IDApO1xuXHRcdFx0bGF5b3V0KCk7XG5cdFx0fTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQod2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5vbkRpZENoYW5nZSh1cGRhdGVBdHRhY2htZW50TGF5b3V0KSk7XG5cdFx0dXBkYXRlQXR0YWNobWVudExheW91dCgpO1xuXHRcdGNvbnN0IHNjaGVkdWxlZElucHV0TGF5b3V0ID0gdGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQod2lkZ2V0LmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdC8vIFN1Ym1pdCBjb250cm9scyBjaGFuZ2UgYWZ0ZXIgdGhlIGVkaXRvciBldmVudDsgbWVhc3VyZSB0aGVtIGluIHRoZVxuXHRcdFx0Ly8gbmV4dCBmcmFtZSBzbyB0aGUgZWRpdG9yIHlpZWxkcyBzcGFjZSBiZWZvcmUgdGhleSBjYW4gY292ZXIgY2xvc2UuXG5cdFx0XHRzY2hlZHVsZWRJbnB1dExheW91dC52YWx1ZSA9IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGF1eGlsaWFyeVdpbmRvdy53aW5kb3csICgpID0+IGxheW91dCgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQoZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoYXV4aWxpYXJ5V2luZG93LndpbmRvdywgKCkgPT4ge1xuXHRcdFx0bGF5b3V0KCk7XG5cdFx0XHQvLyBGb2N1cyB0aGUgaW5wdXQgb25seSBhZnRlciB0aGUgd2luZG93IGhhcyBiZWVuIHBvc2l0aW9uZWQ6IHRoZVxuXHRcdFx0Ly8gYG1vdmVUb2AvYHJlc2l6ZVRvYCBhYm92ZSBibHVyIHRoZSBlZGl0b3IsIHNvIGZvY3VzaW5nIGluIGFcblx0XHRcdC8vIGZvbGxvdy11cCBmcmFtZSAoYWZ0ZXIgdGhlIE9TIHdpbmRvdyBpcyBzZXR0bGVkIGFuZCBrZXllZCkgaXMgd2hhdFxuXHRcdFx0Ly8gbWFrZXMgdGhlIGNhcmV0IGFjdHVhbGx5IHJlbmRlci5cblx0XHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZChkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShhdXhpbGlhcnlXaW5kb3cud2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHRcdC8vIFJlZnJlc2ggZWRpdG9yIGZvY3VzIGFuZCB0cmFuc2ZlciB0aGUgdm9pY2UgY2FwdHVyZSBsZWFzZSBiYWNrIHRvIG9tbmlcblx0XHQvLyB3aGVuIGFuIGluLXByb2dyZXNzIG9tbmkgdHVybiByZWdhaW5zIE9TIGZvY3VzLlxuXHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGF1eGlsaWFyeVdpbmRvdy53aW5kb3csICdmb2N1cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBhdXhpbGlhcnlXaW5kb3cud2luZG93LmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0XHRpZiAoIWFjdGl2ZUVsZW1lbnRcblx0XHRcdFx0fHwgYWN0aXZlRWxlbWVudCA9PT0gYXV4aWxpYXJ5V2luZG93LndpbmRvdy5kb2N1bWVudC5ib2R5XG5cdFx0XHRcdHx8IGFjdGl2ZUVsZW1lbnQgPT09IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50XG5cdFx0XHRcdHx8IHdpZGdldC5pbnB1dEVkaXRvci5nZXREb21Ob2RlKCk/LmNvbnRhaW5zKGFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm9tbmlJbnB1dEFjdGl2ZS5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuc2V0T21uaUlucHV0QWN0aXZlKHRydWUpO1xuXHRcdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuc2V0QWN0aXZlV2luZG93KGF1eGlsaWFyeVdpbmRvdy53aW5kb3cpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhdXhpbGlhcnlXaW5kb3cud2luZG93LCAncmVzaXplJywgbGF5b3V0KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJQZW5kaW5nUHJvbXB0cyhhdXhpbGlhcnlXaW5kb3c6IElBdXhpbGlhcnlXaW5kb3csIHN1cmZhY2U6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcGFuZWwgPSBkb20uYXBwZW5kKHN1cmZhY2UsIGRvbS4kKCcuY2hhdC1pbnB1dC13aW5kb3ctcGVuZGluZy1wYW5lbCcpKTtcblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKHBhbmVsLCBkb20uJCgnLmNoYXQtaW5wdXQtd2luZG93LXBlbmRpbmctaGVhZGVyJywgeyAnYXJpYS1saXZlJzogJ3BvbGl0ZScgfSkpO1xuXHRcdGNvbnN0IG1hcmtlciA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnc3Bhbi5jaGF0LWlucHV0LXdpbmRvdy1wZW5kaW5nLW1hcmtlcicsIHsgJ2FyaWEtaGlkZGVuJzogJ3RydWUnIH0pKTtcblx0XHRtYXJrZXIuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmdyaXBwZXIpKTtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnc3Bhbi5jaGF0LWlucHV0LXdpbmRvdy1wZW5kaW5nLWxhYmVsJykpO1xuXHRcdGNvbnN0IG5hdmlnYXRpb24gPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJy5jaGF0LWlucHV0LXdpbmRvdy1wZW5kaW5nLW5hdmlnYXRpb24nKSk7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9hcHBlbmRQZW5kaW5nTmF2aWdhdGlvbkJ1dHRvbihuYXZpZ2F0aW9uLCBDb2RpY29uLmNoZXZyb25MZWZ0LCBsb2NhbGl6ZSgnY2hhdElucHV0V2luZG93LnBlbmRpbmcucHJldmlvdXMnLCBcIlByZXZpb3VzIEl0ZW1cIikpO1xuXHRcdGNvbnN0IG5leHQgPSB0aGlzLl9hcHBlbmRQZW5kaW5nTmF2aWdhdGlvbkJ1dHRvbihuYXZpZ2F0aW9uLCBDb2RpY29uLmNoZXZyb25SaWdodCwgbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy5wZW5kaW5nLm5leHQnLCBcIk5leHQgSXRlbVwiKSk7XG5cdFx0Y29uc3QgYXBwcm92YWxGYWxsYmFjayA9IGRvbS5hcHBlbmQocGFuZWwsIGRvbS4kKCcuY2hhdC1pbnB1dC13aW5kb3ctcGVuZGluZy1hcHByb3ZhbC1mYWxsYmFjaycpKTtcblx0XHRjb25zdCBhcHByb3ZhbFRpdGxlID0gZG9tLmFwcGVuZChhcHByb3ZhbEZhbGxiYWNrLCBkb20uJCgnLmNoYXQtaW5wdXQtd2luZG93LXBlbmRpbmctYXBwcm92YWwtdGl0bGUnKSk7XG5cdFx0Y29uc3QgYXBwcm92YWxNZXNzYWdlID0gZG9tLmFwcGVuZChhcHByb3ZhbEZhbGxiYWNrLCBkb20uJCgnLmNoYXQtaW5wdXQtd2luZG93LXBlbmRpbmctYXBwcm92YWwtbWVzc2FnZScpKTtcblx0XHRjb25zdCBhcHByb3ZhbENvbW1hbmQgPSBkb20uYXBwZW5kKGFwcHJvdmFsRmFsbGJhY2ssIGRvbS4kKCdjb2RlLmNoYXQtaW5wdXQtd2luZG93LXBlbmRpbmctYXBwcm92YWwtY29tbWFuZCcpKTtcblx0XHRjb25zdCBhcHByb3ZhbERpc2NsYWltZXIgPSBkb20uYXBwZW5kKGFwcHJvdmFsRmFsbGJhY2ssIGRvbS4kKCcuY2hhdC1pbnB1dC13aW5kb3ctcGVuZGluZy1hcHByb3ZhbC1kaXNjbGFpbWVyJykpO1xuXHRcdGNvbnN0IGFwcHJvdmFsQWN0aW9ucyA9IGRvbS5hcHBlbmQoYXBwcm92YWxGYWxsYmFjaywgZG9tLiQoJy5jaGF0LWlucHV0LXdpbmRvdy1wZW5kaW5nLWFwcHJvdmFsLWFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgY2lGYWxsYmFjayA9IGRvbS5hcHBlbmQocGFuZWwsIGRvbS4kKCcuY2hhdC1pbnB1dC13aW5kb3ctcGVuZGluZy1jaS1mYWxsYmFjaycpKTtcblx0XHRjb25zdCBjaVRpdGxlID0gZG9tLmFwcGVuZChjaUZhbGxiYWNrLCBkb20uJCgnLmNoYXQtaW5wdXQtd2luZG93LXBlbmRpbmctY2ktdGl0bGUnKSk7XG5cdFx0Y29uc3QgY2lEZXRhaWwgPSBkb20uYXBwZW5kKGNpRmFsbGJhY2ssIGRvbS4kKCcuY2hhdC1pbnB1dC13aW5kb3ctcGVuZGluZy1jaS1kZXRhaWwnLCB7ICdhcmlhLWxpdmUnOiAncG9saXRlJyB9KSk7XG5cdFx0Y29uc3QgY2lBY3Rpb25zID0gZG9tLmFwcGVuZChjaUZhbGxiYWNrLCBkb20uJCgnLmNoYXQtaW5wdXQtd2luZG93LXBlbmRpbmctY2ktYWN0aW9ucycpKTtcblx0XHRjb25zdCBhcHByb3ZhbEFjdGlvbkRpc3Bvc2FibGVzID0gdGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRcdGNvbnN0IGNpQWN0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdFx0bGV0IGxhc3RBY3RpdmF0ZWRQZW5kaW5nSXRlbTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkaXNwbGF5ZWRBcHByb3ZhbDogeyByZWFkb25seSBpbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uOyByZWFkb25seSBvY2N1cnJlbmNlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGlzcGxheWVkUGVuZGluZ09jY3VycmVuY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGlzcGxheWVkQ0lGYWlsdXJlOiBJQ2hhdElucHV0V2luZG93UGVuZGluZ0NJRmFpbHVyZSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVuZGVyZWRDSUZhaWx1cmVJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlbmRlckNJRmFpbHVyZSA9IChlbnRyeTogSUNoYXRJbnB1dFdpbmRvd1BlbmRpbmdDSUZhaWx1cmUgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGRpc3BsYXllZENJRmFpbHVyZSA9IGVudHJ5O1xuXHRcdFx0aWYgKHJlbmRlcmVkQ0lGYWlsdXJlSWQgIT09IGVudHJ5Py5pZCkge1xuXHRcdFx0XHRyZW5kZXJlZENJRmFpbHVyZUlkID0gZW50cnk/LmlkO1xuXHRcdFx0XHRjaUFjdGlvbkRpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjaUFjdGlvbnMucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IGNpQWN0aW9uRGlzcG9zYWJsZXMudmFsdWUuYWRkKG5ldyBCdXR0b24oY2lBY3Rpb25zLCB7XG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy5wZW5kaW5nLmZpeENJVG9vbHRpcCcsIFwiRml4IGZhaWxpbmcgQ0kgY2hlY2tzXCIpLFxuXHRcdFx0XHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdFx0XHRcdHNtYWxsOiB0cnVlLFxuXHRcdFx0XHRcdFx0YnV0dG9uQmFja2dyb3VuZDogYXNDc3NWYXJpYWJsZShjaGFydHNPcmFuZ2UpLFxuXHRcdFx0XHRcdFx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiBgY29sb3ItbWl4KGluIHNyZ2IsICR7YXNDc3NWYXJpYWJsZShjaGFydHNPcmFuZ2UpfSA4OCUsIGJsYWNrKWAsXG5cdFx0XHRcdFx0XHRidXR0b25Cb3JkZXI6IGFzQ3NzVmFyaWFibGUoY2hhcnRzT3JhbmdlKSxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0YnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy5wZW5kaW5nLmZpeENJJywgXCJGaXggQ0lcIik7XG5cdFx0XHRcdFx0Y2lBY3Rpb25EaXNwb3NhYmxlcy52YWx1ZS5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0ZW50cnkucHJvdmlkZXIuZml4Q0koZW50cnkuZmFpbHVyZS5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0dGhpcy5fd2lkZ2V0Py5mb2N1c0lucHV0KCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGNvbnN0IGRpc21pc3NCdXR0b24gPSBjaUFjdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChuZXcgQnV0dG9uKGNpQWN0aW9ucywge1xuXHRcdFx0XHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdFx0XHRcdHNtYWxsOiB0cnVlLFxuXHRcdFx0XHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRkaXNtaXNzQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy5wZW5kaW5nLmRpc21pc3NDSScsIFwiRGlzbWlzc1wiKTtcblx0XHRcdFx0XHRjaUFjdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChkaXNtaXNzQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzbWlzc2VkID0gbmV3IFNldCh0aGlzLl9kaXNtaXNzZWRDSUZhaWx1cmVzLmdldCgpKTtcblx0XHRcdFx0XHRcdGRpc21pc3NlZC5hZGQoZW50cnkuaWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fZGlzbWlzc2VkQ0lGYWlsdXJlcy5zZXQoZGlzbWlzc2VkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFx0XHRcdFx0Q2hhdElucHV0V2luZG93U3RvcmFnZUtleXMuRGlzbWlzc2VkQ0lGYWlsdXJlcyxcblx0XHRcdFx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoWy4uLmRpc21pc3NlZF0uc2xpY2UoLTEwMCkpLFxuXHRcdFx0XHRcdFx0XHRTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdFx0XHRcdFx0U3RvcmFnZVRhcmdldC5NQUNISU5FLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHRoaXMuX3dpZGdldD8uZm9jdXNJbnB1dCgpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHRjaVRpdGxlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdGNpRGV0YWlsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y2lUaXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0SW5wdXRXaW5kb3cucGVuZGluZy5jaVRpdGxlJywgXCJDSSBpcyBmYWlsaW5nIGZvciB7MH1cIiwgZW50cnkuZmFpbHVyZS5sYWJlbCk7XG5cdFx0XHRjaURldGFpbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdElucHV0V2luZG93LnBlbmRpbmcuY2lEZXRhaWwnLFxuXHRcdFx0XHRcInswfSBjaGVja3MgZmFpbGVkLCB7MX0gcGVuZGluZ1wiLFxuXHRcdFx0XHRlbnRyeS5mYWlsdXJlLmZhaWxlZCxcblx0XHRcdFx0ZW50cnkuZmFpbHVyZS5wZW5kaW5nLFxuXHRcdFx0KTtcblx0XHR9O1xuXHRcdGNvbnN0IHJlbmRlckFwcHJvdmFsRmFsbGJhY2sgPSAoYXBwcm92YWw6IHR5cGVvZiBkaXNwbGF5ZWRBcHByb3ZhbCkgPT4ge1xuXHRcdFx0YXBwcm92YWxBY3Rpb25EaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGFwcHJvdmFsQWN0aW9ucy5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdGlmICghYXBwcm92YWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhcHByb3ZhbC5pbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb25cblx0XHRcdFx0JiYgc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtZXNzYWdlcyA9IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzO1xuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uVGl0bGUgPSByZW5kZXJBc1BsYWludGV4dChtZXNzYWdlcz8udGl0bGUgPz8gYXBwcm92YWwuaW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSk7XG5cdFx0XHRhcHByb3ZhbFRpdGxlLnRleHRDb250ZW50ID0gY29uZmlybWF0aW9uVGl0bGU7XG5cdFx0XHRjb25zdCBjb25maXJtYXRpb25NZXNzYWdlID0gcmVuZGVyQXNQbGFpbnRleHQobWVzc2FnZXM/Lm1lc3NhZ2UgPz8gJycpO1xuXHRcdFx0Y29uc3Qgc2hvd0NvbmZpcm1hdGlvbk1lc3NhZ2UgPSAhIWNvbmZpcm1hdGlvbk1lc3NhZ2UgJiYgY29uZmlybWF0aW9uTWVzc2FnZSAhPT0gY29uZmlybWF0aW9uVGl0bGU7XG5cdFx0XHRhcHByb3ZhbE1lc3NhZ2UudGV4dENvbnRlbnQgPSBzaG93Q29uZmlybWF0aW9uTWVzc2FnZSA/IGNvbmZpcm1hdGlvbk1lc3NhZ2UgOiAnJztcblx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KHNob3dDb25maXJtYXRpb25NZXNzYWdlLCBhcHByb3ZhbE1lc3NhZ2UpO1xuXHRcdFx0YXBwcm92YWxDb21tYW5kLnRleHRDb250ZW50ID0gZ2V0Vm9pY2VUb29sQXBwcm92YWxDb21tYW5kKGFwcHJvdmFsLmludm9jYXRpb24pID8/ICcnO1xuXHRcdFx0ZG9tLnNldFZpc2liaWxpdHkoISFhcHByb3ZhbENvbW1hbmQudGV4dENvbnRlbnQsIGFwcHJvdmFsQ29tbWFuZCk7XG5cdFx0XHRjb25zdCBhcHByb3ZhbFJlYXNvbiA9IG1lc3NhZ2VzPy5hcHByb3ZhbFJlYXNvbj8uc3RhdHVzID09PSAnY29tcGxldGUnXG5cdFx0XHRcdD8gcmVuZGVyQXNQbGFpbnRleHQobWVzc2FnZXMuYXBwcm92YWxSZWFzb24uZXhwbGFuYXRpb24pXG5cdFx0XHRcdDogJyc7XG5cdFx0XHRhcHByb3ZhbERpc2NsYWltZXIudGV4dENvbnRlbnQgPSBbcmVuZGVyQXNQbGFpbnRleHQobWVzc2FnZXM/LmRpc2NsYWltZXIgPz8gJycpLCBhcHByb3ZhbFJlYXNvbl0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpO1xuXHRcdFx0ZG9tLnNldFZpc2liaWxpdHkoISFhcHByb3ZhbERpc2NsYWltZXIudGV4dENvbnRlbnQsIGFwcHJvdmFsRGlzY2xhaW1lcik7XG5cblx0XHRcdGNvbnN0IGNvbmZpcm0gPSAocmVhc29uOiBQYXJhbWV0ZXJzPHR5cGVvZiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoPlsxXSkgPT4ge1xuXHRcdFx0XHRtYXJrUGVuZGluZ0lkUmVzb2x2ZWQoYXBwcm92YWwub2NjdXJyZW5jZSk7XG5cdFx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgoYXBwcm92YWwuaW52b2NhdGlvbiwgcmVhc29uKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBvcHRpb25zID0gbWVzc2FnZXM/LmN1c3RvbU9wdGlvbnM7XG5cdFx0XHRpZiAob3B0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBidXR0b24gPSBhcHByb3ZhbEFjdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChuZXcgQnV0dG9uKGFwcHJvdmFsQWN0aW9ucywge1xuXHRcdFx0XHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdFx0XHRcdHNtYWxsOiB0cnVlLFxuXHRcdFx0XHRcdFx0c2Vjb25kYXJ5OiBvcHRpb24ua2luZCA9PT0gQ29uZmlybWF0aW9uT3B0aW9uS2luZC5EZW55LFxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRidXR0b24ubGFiZWwgPSBvcHRpb24ubGFiZWw7XG5cdFx0XHRcdFx0YXBwcm92YWxBY3Rpb25EaXNwb3NhYmxlcy52YWx1ZS5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gY29uZmlybSh7XG5cdFx0XHRcdFx0XHR0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbixcblx0XHRcdFx0XHRcdHNlbGVjdGVkQnV0dG9uOiBvcHRpb24uaWQsXG5cdFx0XHRcdFx0XHRzZWxlY3RlZEJ1dHRvbktpbmQ6IG9wdGlvbi5raW5kLFxuXHRcdFx0XHRcdH0pKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGFsbG93QnV0dG9uID0gYXBwcm92YWxBY3Rpb25EaXNwb3NhYmxlcy52YWx1ZS5hZGQobmV3IEJ1dHRvbihhcHByb3ZhbEFjdGlvbnMsIHtcblx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRcdHNtYWxsOiB0cnVlLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGFsbG93QnV0dG9uLmxhYmVsID0gbWVzc2FnZXM/LmNvbmZpcm1SZXN1bHRzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdElucHV0V2luZG93LnBlbmRpbmcuYWxsb3dBbmRSZXZpZXcnLCBcIkFsbG93IGFuZCBSZXZpZXcgT25jZVwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy5wZW5kaW5nLmFsbG93JywgXCJBbGxvdyBPbmNlXCIpO1xuXHRcdFx0XHRhcHByb3ZhbEFjdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChhbGxvd0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IGNvbmZpcm0oeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KSkpO1xuXHRcdFx0XHRjb25zdCBza2lwQnV0dG9uID0gYXBwcm92YWxBY3Rpb25EaXNwb3NhYmxlcy52YWx1ZS5hZGQobmV3IEJ1dHRvbihhcHByb3ZhbEFjdGlvbnMsIHtcblx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRcdHNtYWxsOiB0cnVlLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRza2lwQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy5wZW5kaW5nLnNraXAnLCBcIlNraXBcIik7XG5cdFx0XHRcdGFwcHJvdmFsQWN0aW9uRGlzcG9zYWJsZXMudmFsdWUuYWRkKHNraXBCdXR0b24ub25EaWRDbGljaygoKSA9PiBjb25maXJtKHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQgfSkpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcGFyZW50ID0gZG9tLmFwcGVuZChwYW5lbCwgZG9tLiQoJy5jaGF0LWlucHV0LXdpbmRvdy1wZW5kaW5nLXdpZGdldC5pbnRlcmFjdGl2ZS1zZXNzaW9uJykpO1xuXHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgZXZlbnQgPT4ge1xuXHRcdFx0Y29uc3QgYXBwcm92YWwgPSBkaXNwbGF5ZWRBcHByb3ZhbDtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldDtcblx0XHRcdGlmICghKHRhcmdldCBpbnN0YW5jZW9mIGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuRWxlbWVudCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFwcHJvdmFsICYmIHRhcmdldC5jbG9zZXN0KCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LWJ1dHRvbnMnKSkge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGFwcHJvdmFsLmludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uXG5cdFx0XHRcdFx0fHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRcdG1hcmtQZW5kaW5nSWRSZXNvbHZlZChhcHByb3ZhbC5vY2N1cnJlbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbm90aWZ5UGVuZGluZ0l0ZW1SZXNvbHZlZEFmdGVySW50ZXJhY3Rpb24oKTtcblx0XHR9LCB7IGNhcHR1cmU6IHRydWUgfSkpO1xuXHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbm90aWZ5UGVuZGluZ0l0ZW1SZXNvbHZlZEFmdGVySW50ZXJhY3Rpb24oKTtcblx0XHR9LCB7IGNhcHR1cmU6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHBhcmVudCkpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dFdpbmRvdy5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKFxuXHRcdFx0bmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtcblx0XHRcdFx0SUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHRzY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdF0pXG5cdFx0KSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFdpZGdldCxcblx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHR7IGlzUXVpY2tDaGF0OiB0cnVlIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGF1dG9TY3JvbGw6IHRydWUsXG5cdFx0XHRcdHJlbmRlcklucHV0T25Ub3A6IHRydWUsXG5cdFx0XHRcdHJlbmRlclN0eWxlOiAnY29tcGFjdCcsXG5cdFx0XHRcdHJlbmRlckdldHRpbmdTdGFydGVkVGlwOiBmYWxzZSxcblx0XHRcdFx0cmVuZGVyZXJPcHRpb25zOiB7IHF1ZXN0aW9uQ2Fyb3VzZWxGaXRDb250ZW50OiB0cnVlIH0sXG5cdFx0XHRcdGZpbHRlcjogaXRlbSA9PiBpc1Jlc3BvbnNlVk0oaXRlbSkgJiYgKFxuXHRcdFx0XHRcdCEhaXRlbS5tb2RlbC5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KClcblx0XHRcdFx0XHR8fCBpdGVtLm1vZGVsLnJlc3BvbnNlLnZhbHVlLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJyAmJiAhcGFydC5pc1VzZWQpXG5cdFx0XHRcdCksXG5cdFx0XHRcdGVuYWJsZUltcGxpY2l0Q29udGV4dDogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHRNb2RlOiBDaGF0TW9kZS5Bc2ssXG5cdFx0XHRcdG1lbnVzOiB7IHRlbGVtZXRyeVNvdXJjZTogJ2NoYXRJbnB1dFdpbmRvd1BlbmRpbmcnIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpbnB1dEVkaXRvckJhY2tncm91bmQ6IGlucHV0QmFja2dyb3VuZCxcblx0XHRcdFx0cmVzdWx0RWRpdG9yQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdGxpc3RGb3JlZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRvdmVybGF5QmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdH1cblx0XHQpKTtcblx0XHR3aWRnZXQucmVuZGVyKHBhcmVudCk7XG5cdFx0Ly8gVG9vbCBhcHByb3ZhbHMgYW5kIHF1ZXN0aW9ucyBhcmUgcmVuZGVyZWQgaW4gQ2hhdElucHV0UGFydCByYXRoZXIgdGhhblxuXHRcdC8vIHRoZSByZXNwb25zZSBsaXN0LiBLZWVwIGl0IG1vdW50ZWQ7IENTUyBoaWRlcyBvbmx5IHRoZSBlZGl0b3IgY2hyb21lLlxuXHRcdHdpZGdldC5zZXRJbnB1dFZpc2libGUodHJ1ZSk7XG5cdFx0d2lkZ2V0LnNldFZpc2libGUodHJ1ZSk7XG5cdFx0Y29uc3QgbGlzdCA9IHdpZGdldC50cmFuc2NyaXB0RG9tTm9kZTtcblxuXHRcdGxldCBwZW5kaW5nSXRlbXM6IHJlYWRvbmx5IENoYXRJbnB1dFdpbmRvd1BlbmRpbmdJdGVtW10gPSBbXTtcblx0XHRsZXQgbGF5aW5nT3V0ID0gZmFsc2U7XG5cdFx0bGV0IGxhc3RQZW5kaW5nSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhc3RQZW5kaW5nV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY29uZmlybWF0aW9uV2lkZ2V0TGF5b3V0SGVpZ2h0ID0gMDtcblx0XHRsZXQgZGlzcGxheWVkSXRlbUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4ge1xuXHRcdFx0aWYgKGxheWluZ091dCB8fCAhcGFuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCdzaG93bicpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxheWluZ091dCA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoZGlzcGxheWVkQ0lGYWlsdXJlKSB7XG5cdFx0XHRcdFx0dGhpcy5fZml0V2luZG93VG9Db250ZW50KCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3Qgcm93IG9mIGdldERlc2NlbmRhbnRFbGVtZW50cyhsaXN0LCAnbW9uYWNvLWxpc3Qtcm93JykpIHtcblx0XHRcdFx0XHRjb25zdCBjb25maXJtYXRpb25zID0gZ2V0RGVzY2VuZGFudEVsZW1lbnRzKHJvdywgJ2NoYXQtY29uZmlybWF0aW9uLXdpZGdldC1jb250YWluZXInKTtcblx0XHRcdFx0XHRjb25zdCBoYXNDb25maXJtYXRpb24gPSBjb25maXJtYXRpb25zLmxlbmd0aCA+IDA7XG5cdFx0XHRcdFx0cm93LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtaW5wdXQtd2luZG93LWNvbmZpcm1hdGlvbi1yb3cnLCBoYXNDb25maXJtYXRpb24pO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY29uZmlybWF0aW9uIG9mIGNvbmZpcm1hdGlvbnMpIHtcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvbi5jbGFzc0xpc3QudG9nZ2xlKFxuXHRcdFx0XHRcdFx0XHQnY2hhdC1pbnB1dC13aW5kb3ctbW9kaWZpZWQtZmlsZXMtY29uZmlybWF0aW9uJyxcblx0XHRcdFx0XHRcdFx0Z2V0RGVzY2VuZGFudEVsZW1lbnRzKGNvbmZpcm1hdGlvbiwgJ2NoYXQtbW9kaWZpZWQtZmlsZXMtY29uZmlybWF0aW9uJykubGVuZ3RoID4gMCxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgdmFsdWUgb2YgZ2V0RGVzY2VuZGFudEVsZW1lbnRzKHJvdywgJ3ZhbHVlJykpIHtcblx0XHRcdFx0XHRcdHZhbHVlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtaW5wdXQtd2luZG93LWNvbmZpcm1hdGlvbi12YWx1ZScsIGhhc0NvbmZpcm1hdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHBhbmVsLmNsYXNzTGlzdC50b2dnbGUoJ3Rvb2wtYXBwcm92YWwtZmFsbGJhY2snLCAhIWRpc3BsYXllZEFwcHJvdmFsICYmICFwYW5lbC5jbGFzc0xpc3QuY29udGFpbnMoJ3F1ZXN0aW9uJykpO1xuXHRcdFx0XHRjb25zdCB3aWR0aCA9IE1hdGgubWF4KDAsIHBhbmVsLmNsaWVudFdpZHRoKTtcblx0XHRcdFx0aWYgKGxhc3RQZW5kaW5nSGVpZ2h0ID09PSB1bmRlZmluZWQgfHwgbGFzdFBlbmRpbmdXaWR0aCAhPT0gd2lkdGgpIHtcblx0XHRcdFx0XHRpZiAobGFzdFBlbmRpbmdXaWR0aCAhPT0gd2lkdGgpIHtcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvbldpZGdldExheW91dEhlaWdodCA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxhc3RQZW5kaW5nV2lkdGggPSB3aWR0aDtcblx0XHRcdFx0XHR3aWRnZXQubGF5b3V0KGxhc3RQZW5kaW5nSGVpZ2h0ID8/IENIQVRfSU5QVVRfV0lORE9XX01BWF9QRU5ESU5HX0hFSUdIVCwgd2lkdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGxpc3RCb3VuZHMgPSBsaXN0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRjb25zdCByZW5kZXJlZFJvd3MgPSBnZXREZXNjZW5kYW50RWxlbWVudHMobGlzdCwgJ2ludGVyYWN0aXZlLWl0ZW0tY29udGFpbmVyJyk7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkQ29udGVudEhlaWdodCA9IHJlbmRlcmVkUm93cy5yZWR1Y2UoKGhlaWdodCwgcm93KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgcm93Qm91bmRzID0gcm93LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbiA9IGdldERlc2NlbmRhbnRFbGVtZW50cyhyb3csICdjaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtY29udGFpbmVyJylbMF07XG5cdFx0XHRcdFx0Y29uc3QgY29uZmlybWF0aW9uQm91bmRzID0gY29uZmlybWF0aW9uPy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0XHRjb25zdCBwYWRkaW5nQm90dG9tID0gcGFyc2VGbG9hdChkb20uZ2V0V2luZG93KHJvdykuZ2V0Q29tcHV0ZWRTdHlsZShyb3cpLnBhZGRpbmdCb3R0b20pO1xuXHRcdFx0XHRcdGNvbnN0IHJlbmRlcmVkRGVzY2VuZGFudEJvdHRvbSA9IGNvbmZpcm1hdGlvblxuXHRcdFx0XHRcdFx0PyBnZXREZXNjZW5kYW50RWxlbWVudHMoY29uZmlybWF0aW9uKS5yZWR1Y2UoXG5cdFx0XHRcdFx0XHRcdChib3R0b20sIGVsZW1lbnQpID0+IE1hdGgubWF4KGJvdHRvbSwgZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5ib3R0b20pLFxuXHRcdFx0XHRcdFx0XHRjb25maXJtYXRpb25Cb3VuZHM/LmJvdHRvbSA/PyAwLFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0OiAwO1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbkJvdHRvbSA9IGNvbmZpcm1hdGlvbkJvdW5kc1xuXHRcdFx0XHRcdFx0PyBNYXRoLm1heChjb25maXJtYXRpb25Cb3VuZHMudG9wICsgKGNvbmZpcm1hdGlvbj8uc2Nyb2xsSGVpZ2h0ID8/IDApLCByZW5kZXJlZERlc2NlbmRhbnRCb3R0b20pXG5cdFx0XHRcdFx0XHQ6IDA7XG5cdFx0XHRcdFx0Y29uc3QgYm90dG9tID0gTWF0aC5tYXgocm93Qm91bmRzLmJvdHRvbSwgY29uZmlybWF0aW9uQm90dG9tICsgcGFkZGluZ0JvdHRvbSk7XG5cdFx0XHRcdFx0cmV0dXJuIE1hdGgubWF4KGhlaWdodCwgYm90dG9tIC0gbGlzdEJvdW5kcy50b3ApO1xuXHRcdFx0XHR9LCAwKTtcblx0XHRcdFx0Y29uc3QgaXNRdWVzdGlvbiA9IHBhbmVsLmNsYXNzTGlzdC5jb250YWlucygncXVlc3Rpb24nKTtcblx0XHRcdFx0Y29uc3QgcXVlc3Rpb25Db250YWluZXIgPSBpc1F1ZXN0aW9uXG5cdFx0XHRcdFx0PyBnZXREZXNjZW5kYW50RWxlbWVudHMocGFyZW50LCAnY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC13aWRnZXQtY29udGFpbmVyJykuZmluZChlbGVtZW50ID0+IGVsZW1lbnQuY2hpbGRFbGVtZW50Q291bnQgPiAwKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBxdWVzdGlvbkNvbnRlbnRIZWlnaHQgPSBxdWVzdGlvbkNvbnRhaW5lclxuXHRcdFx0XHRcdD8gcXVlc3Rpb25Db250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuYm90dG9tIC0gcGFyZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcFxuXHRcdFx0XHRcdDogMDtcblx0XHRcdFx0Y29uc3QgY29udGVudEhlaWdodCA9IGlzUXVlc3Rpb25cblx0XHRcdFx0XHQ/IE1hdGgubWF4KHdpZGdldC5jb250ZW50SGVpZ2h0LCBxdWVzdGlvbkNvbnRlbnRIZWlnaHQpXG5cdFx0XHRcdFx0OiByZW5kZXJlZENvbnRlbnRIZWlnaHQgfHwgd2lkZ2V0LmNvbnRlbnRIZWlnaHQ7XG5cdFx0XHRcdGNvbnN0IG1pbmltdW1IZWlnaHQgPSBpc1F1ZXN0aW9uID8gMSA6IENIQVRfSU5QVVRfV0lORE9XX01JTl9DT05GSVJNQVRJT05fSEVJR0hUO1xuXHRcdFx0XHRjb25zdCBtZWFzdXJlZEhlaWdodCA9IGlzUXVlc3Rpb25cblx0XHRcdFx0XHQ/IE1hdGgubWF4KG1pbmltdW1IZWlnaHQsIE1hdGguY2VpbChjb250ZW50SGVpZ2h0KSlcblx0XHRcdFx0XHQ6IE1hdGgubWluKENIQVRfSU5QVVRfV0lORE9XX01BWF9QRU5ESU5HX0hFSUdIVCwgTWF0aC5tYXgobWluaW11bUhlaWdodCwgTWF0aC5jZWlsKGNvbnRlbnRIZWlnaHQpKSk7XG5cdFx0XHRcdC8vIEFwcHJvdmFsIGNvbnRlbnQgKGRpZmYgc3VtbWFyaWVzLCByaXNrIGJhZGdlcywgYnV0dG9uIHJvd3MpIGNhblxuXHRcdFx0XHQvLyByZW5kZXIgYWZ0ZXIgdGhlIGZpcnN0IGZyYW1lLiBHcm93IHRvIGFjY29tbW9kYXRlIGl0LCBidXQgbmV2ZXJcblx0XHRcdFx0Ly8gc2hyaW5rIHRoaXMgcHJvbXB0IGFuZCByZS1lbnRlciBhIHJlc2l6ZSBvc2NpbGxhdGlvbi5cblx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gaXNRdWVzdGlvblxuXHRcdFx0XHRcdD8gbWVhc3VyZWRIZWlnaHRcblx0XHRcdFx0XHQ6IE1hdGgubWF4KGxhc3RQZW5kaW5nSGVpZ2h0ID8/IDAsIG1lYXN1cmVkSGVpZ2h0KTtcblx0XHRcdFx0Y29uc3QgaGVpZ2h0Q2hhbmdlZCA9IGhlaWdodCAhPT0gbGFzdFBlbmRpbmdIZWlnaHQ7XG5cdFx0XHRcdGlmIChoZWlnaHRDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0bGFzdFBlbmRpbmdIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0XHRcdFx0cGFyZW50LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRcdFx0dGhpcy5fZml0V2luZG93VG9Db250ZW50KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzUXVlc3Rpb24gJiYgaGVpZ2h0Q2hhbmdlZCkge1xuXHRcdFx0XHRcdHdpZGdldC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIXBhbmVsLmNsYXNzTGlzdC5jb250YWlucygncXVlc3Rpb24nKSAmJiBoZWlnaHQgPiBjb25maXJtYXRpb25XaWRnZXRMYXlvdXRIZWlnaHQpIHtcblx0XHRcdFx0XHQvLyBLZWVwIHRoZSB2aXJ0dWFsIHJvdyBjb25zdHJhaW5lZCBiZWxvdyB0aGUgaW5wdXQvaGVhZGVyLCBhbmRcblx0XHRcdFx0XHQvLyBhbGxvdyBvbmx5IG1vbm90b25pYyBncm93dGggd2hlbiBhcHByb3ZhbCBkZXRhaWxzIHJlbmRlciBsYXRlLlxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvbldpZGdldExheW91dEhlaWdodCA9IGhlaWdodDtcblx0XHRcdFx0XHR3aWRnZXQubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHRcdFx0XHRcdHNjaGVkdWxlTGF5b3V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGxheWluZ091dCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgc2NoZWR1bGVkTGF5b3V0ID0gdGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCBzY2hlZHVsZUxheW91dCA9ICgpID0+IHtcblx0XHRcdHNjaGVkdWxlZExheW91dC52YWx1ZSA9IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGF1eGlsaWFyeVdpbmRvdy53aW5kb3csIGxheW91dCk7XG5cdFx0fTtcblx0XHRjb25zdCBzaG93UGVuZGluZ0l0ZW0gPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0aWYgKHBlbmRpbmdJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb21wdEluZGV4ID0gMDtcblx0XHRcdFx0bGFzdFBlbmRpbmdIZWlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGxhc3RQZW5kaW5nV2lkdGggPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbldpZGdldExheW91dEhlaWdodCA9IDA7XG5cdFx0XHRcdGRpc3BsYXllZEl0ZW1JZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0ZGlzcGxheWVkQXBwcm92YWwgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGRpc3BsYXllZFBlbmRpbmdPY2N1cnJlbmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRyZW5kZXJBcHByb3ZhbEZhbGxiYWNrKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJlbmRlckNJRmFpbHVyZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRsYXN0QWN0aXZhdGVkUGVuZGluZ0l0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVBlbmRpbmdTZXNzaW9uUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHBhbmVsLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3duJywgJ3F1ZXN0aW9uJywgJ3Rvb2wtYXBwcm92YWwtZmFsbGJhY2snLCAnY2ktZmFpbHVyZScpO1xuXHRcdFx0XHR3aWRnZXQuc2V0TW9kZWwodW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fZml0V2luZG93VG9Db250ZW50KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3BlbmRpbmdQcm9tcHRJbmRleCA9IChpbmRleCArIHBlbmRpbmdJdGVtcy5sZW5ndGgpICUgcGVuZGluZ0l0ZW1zLmxlbmd0aDtcblx0XHRcdGNvbnN0IGl0ZW0gPSBwZW5kaW5nSXRlbXNbdGhpcy5fcGVuZGluZ1Byb21wdEluZGV4XTtcblx0XHRcdGlmIChkaXNwbGF5ZWRJdGVtSWQgIT09IGl0ZW0uaWQpIHtcblx0XHRcdFx0ZGlzcGxheWVkSXRlbUlkID0gaXRlbS5pZDtcblx0XHRcdFx0bGFzdFBlbmRpbmdIZWlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbldpZGdldExheW91dEhlaWdodCA9IDA7XG5cdFx0XHR9XG5cdFx0XHRwYW5lbC5jbGFzc0xpc3QuYWRkKCdzaG93bicpO1xuXG5cdFx0XHRjb25zdCBoYXNNdWx0aXBsZSA9IHBlbmRpbmdJdGVtcy5sZW5ndGggPiAxO1xuXHRcdFx0aGVhZGVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFoYXNNdWx0aXBsZSk7XG5cdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGhhc011bHRpcGxlXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXRJbnB1dFdpbmRvdy5wZW5kaW5nLmNvdW50JywgXCJJdGVtIHswfSBvZiB7MX1cIiwgdGhpcy5fcGVuZGluZ1Byb21wdEluZGV4ICsgMSwgcGVuZGluZ0l0ZW1zLmxlbmd0aClcblx0XHRcdFx0OiAnJztcblx0XHRcdG5hdmlnYXRpb24uY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIWhhc011bHRpcGxlKTtcblx0XHRcdGZvciAoY29uc3QgYnV0dG9uIG9mIFtwcmV2aW91cywgbmV4dF0pIHtcblx0XHRcdFx0YnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWhhc011bHRpcGxlKTtcblx0XHRcdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyghaGFzTXVsdGlwbGUpKTtcblx0XHRcdFx0YnV0dG9uLnRhYkluZGV4ID0gaGFzTXVsdGlwbGUgPyAwIDogLTE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpdGVtLmtpbmQgPT09ICdjaUZhaWx1cmUnKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVBlbmRpbmdTZXNzaW9uUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGRpc3BsYXllZEFwcHJvdmFsID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRkaXNwbGF5ZWRQZW5kaW5nT2NjdXJyZW5jZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmVuZGVyQXBwcm92YWxGYWxsYmFjayh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZW5kZXJDSUZhaWx1cmUoaXRlbSk7XG5cdFx0XHRcdHBhbmVsLmNsYXNzTGlzdC5yZW1vdmUoJ3F1ZXN0aW9uJywgJ3Rvb2wtYXBwcm92YWwtZmFsbGJhY2snKTtcblx0XHRcdFx0cGFuZWwuY2xhc3NMaXN0LmFkZCgnY2ktZmFpbHVyZScpO1xuXHRcdFx0XHR3aWRnZXQuc2V0TW9kZWwodW5kZWZpbmVkKTtcblx0XHRcdFx0c2NoZWR1bGVMYXlvdXQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGl0ZW0ubW9kZWw7XG5cdFx0XHR0aGlzLl9hY3RpdmVQZW5kaW5nU2Vzc2lvblJlc291cmNlID0gbW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0cmVuZGVyQ0lGYWlsdXJlKHVuZGVmaW5lZCk7XG5cdFx0XHRwYW5lbC5jbGFzc0xpc3QucmVtb3ZlKCdjaS1mYWlsdXJlJyk7XG5cdFx0XHRjb25zdCBoYXNQZW5kaW5nUXVlc3Rpb24gPSB0aGlzLl9oYXNQZW5kaW5nUXVlc3Rpb24obW9kZWwpO1xuXHRcdFx0Y29uc3QgcGVuZGluZ0FwcHJvdmFsID0gdGhpcy5fZ2V0UGVuZGluZ1Rvb2xBcHByb3ZhbChtb2RlbCk7XG5cdFx0XHRjb25zdCBwZW5kaW5nT2NjdXJyZW5jZSA9IHBlbmRpbmdBcHByb3ZhbD8ub2NjdXJyZW5jZSA/PyB0aGlzLl9nZXRQZW5kaW5nUXVlc3Rpb25PY2N1cnJlbmNlKG1vZGVsKTtcblx0XHRcdGRpc3BsYXllZEFwcHJvdmFsID0gcGVuZGluZ0FwcHJvdmFsO1xuXHRcdFx0ZGlzcGxheWVkUGVuZGluZ09jY3VycmVuY2UgPSBwZW5kaW5nT2NjdXJyZW5jZTtcblx0XHRcdHJlbmRlckFwcHJvdmFsRmFsbGJhY2socGVuZGluZ0FwcHJvdmFsKTtcblx0XHRcdGNvbnN0IG9tbmlJbnB1dE9wZW4gPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIub21uaUlucHV0T3Blbi5nZXQoKTtcblx0XHRcdGlmICghb21uaUlucHV0T3Blbikge1xuXHRcdFx0XHRsYXN0QWN0aXZhdGVkUGVuZGluZ0l0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRwYW5lbC5jbGFzc0xpc3QudG9nZ2xlKCdxdWVzdGlvbicsIGhhc1BlbmRpbmdRdWVzdGlvbik7XG5cdFx0XHRwYW5lbC5jbGFzc0xpc3QudG9nZ2xlKCd0b29sLWFwcHJvdmFsLWZhbGxiYWNrJywgIWhhc1BlbmRpbmdRdWVzdGlvbiAmJiAhIXBlbmRpbmdBcHByb3ZhbCk7XG5cdFx0XHR3aWRnZXQuc2V0TW9kZWwobW9kZWwpO1xuXHRcdFx0aWYgKHBlbmRpbmdPY2N1cnJlbmNlICYmIG9tbmlJbnB1dE9wZW4gJiYgcGVuZGluZ09jY3VycmVuY2UgIT09IGxhc3RBY3RpdmF0ZWRQZW5kaW5nSXRlbSkge1xuXHRcdFx0XHQvLyBUaGUgcGVuZGluZyBjYXJkIGlzIHRoZSBtb3N0IGRpcmVjdCBvYnNlcnZhdGlvbiB0aGF0IHRoaXMgZXhhY3Rcblx0XHRcdFx0Ly8gcXVlc3Rpb24gb3IgYXBwcm92YWwgaXMgdmlzaWJsZSBpbiBvbW5pLiBBY3RpdmF0ZSBpdCBvbmNlIHNvIGFcblx0XHRcdFx0Ly8gY29hbGVzY2VkL21pc3NlZCBzdGF0ZSB0cmFuc2l0aW9uIGNhbm5vdCBsZWF2ZSBhIHZpc2libGUgcHJvbXB0XG5cdFx0XHRcdC8vIHVuYW5ub3VuY2VkLiBWb2ljZSBuYXJyYXRpb24gZGVkdXAgaXMgb2NjdXJyZW5jZS1iYXNlZCwgc28gdGhlXG5cdFx0XHRcdC8vIG5vcm1hbCBzdGF0ZS1jaGFuZ2UgcGF0aCBhbmQgdGhpcyBVSSBwYXRoIHJlbWFpbiBleGFjdGx5LW9uY2UuXG5cdFx0XHRcdGxhc3RBY3RpdmF0ZWRQZW5kaW5nSXRlbSA9IHBlbmRpbmdPY2N1cnJlbmNlO1xuXHRcdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuYW5ub3VuY2VTZXNzaW9uSW5PbW5pKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHRzY2hlZHVsZUxheW91dCgpO1xuXHRcdH07XG5cblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihwcmV2aW91cywgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gc2hvd1BlbmRpbmdJdGVtKHRoaXMuX3BlbmRpbmdQcm9tcHRJbmRleCAtIDEpKSk7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobmV4dCwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gc2hvd1BlbmRpbmdJdGVtKHRoaXMuX3BlbmRpbmdQcm9tcHRJbmRleCArIDEpKSk7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKHdpZGdldC5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoc2NoZWR1bGVMYXlvdXQpKTtcblx0XHRjb25zdCBwZW5kaW5nTXV0YXRpb25PYnNlcnZlciA9IG5ldyBhdXhpbGlhcnlXaW5kb3cud2luZG93Lk11dGF0aW9uT2JzZXJ2ZXIoc2NoZWR1bGVMYXlvdXQpO1xuXHRcdHBlbmRpbmdNdXRhdGlvbk9ic2VydmVyLm9ic2VydmUod2lkZ2V0LmRvbU5vZGUsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlLCBhdHRyaWJ1dGVzOiB0cnVlIH0pO1xuXHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGVuZGluZ011dGF0aW9uT2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYXV4aWxpYXJ5V2luZG93LndpbmRvdywgJ3Jlc2l6ZScsIHNjaGVkdWxlTGF5b3V0KSk7XG5cdFx0dGhpcy5fbG9hZFBlbmRpbmdTZXNzaW9uTW9kZWxzKCk7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5vbW5pSW5wdXRPcGVuLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRpc21pc3NlZFBlbmRpbmdSZXF1ZXN0cyA9IHRoaXMuX2Rpc21pc3NlZFBlbmRpbmdSZXF1ZXN0cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBkaXNtaXNzZWRDSUZhaWx1cmVzID0gdGhpcy5fZGlzbWlzc2VkQ0lGYWlsdXJlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBkaXNwbGF5ZWRSZXNvdXJjZSA9IHRoaXMuX2FjdGl2ZVBlbmRpbmdTZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoZGlzcGxheWVkUmVzb3VyY2UgJiYgZGlzcGxheWVkUGVuZGluZ09jY3VycmVuY2UpIHtcblx0XHRcdFx0Y29uc3QgZGlzcGxheWVkTW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oZGlzcGxheWVkUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50T2NjdXJyZW5jZSA9IGRpc3BsYXllZE1vZGVsXG5cdFx0XHRcdFx0PyB0aGlzLl9nZXRQZW5kaW5nVG9vbEFwcHJvdmFsKGRpc3BsYXllZE1vZGVsKT8ub2NjdXJyZW5jZSA/PyB0aGlzLl9nZXRQZW5kaW5nUXVlc3Rpb25PY2N1cnJlbmNlKGRpc3BsYXllZE1vZGVsKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoY3VycmVudE9jY3VycmVuY2UgIT09IGRpc3BsYXllZFBlbmRpbmdPY2N1cnJlbmNlKSB7XG5cdFx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm5vdGlmeVBlbmRpbmdJdGVtUmVzb2x2ZWQoZGlzcGxheWVkUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGRpc3BsYXllZFBlbmRpbmdPY2N1cnJlbmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJyZW50SXRlbUlkID0gcGVuZGluZ0l0ZW1zW3RoaXMuX3BlbmRpbmdQcm9tcHRJbmRleF0/LmlkO1xuXHRcdFx0Y29uc3QgYWN0aXZlVGFyZ2V0ID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnRhcmdldFNlc3Npb24ucmVhZChyZWFkZXIpPy50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgcGVuZGluZ0NoYXRzOiBJQ2hhdElucHV0V2luZG93UGVuZGluZ0NoYXRbXSA9IFsuLi50aGlzLmNoYXRTZXJ2aWNlLmNoYXRNb2RlbHMucmVhZChyZWFkZXIpXVxuXHRcdFx0XHQuZmlsdGVyKG1vZGVsID0+ICEhbW9kZWwucmVxdWVzdE5lZWRzSW5wdXQucmVhZChyZWFkZXIpICYmICF0aGlzLl9oYXNPbmx5UmVzb2x2ZWRQZW5kaW5nVG9vbHMobW9kZWwsIHJlYWRlcikpXG5cdFx0XHRcdC5maWx0ZXIobW9kZWwgPT4gIWRpc21pc3NlZFBlbmRpbmdSZXF1ZXN0cy5oYXModGhpcy5fcGVuZGluZ1JlcXVlc3RLZXkobW9kZWwuc2Vzc2lvblJlc291cmNlLCBtb2RlbC5sYXN0UmVxdWVzdD8uaWQpKSlcblx0XHRcdFx0LnNvcnQoKGEsIGIpID0+XG5cdFx0XHRcdFx0TnVtYmVyKGIuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IGFjdGl2ZVRhcmdldCkgLSBOdW1iZXIoYS5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gYWN0aXZlVGFyZ2V0KVxuXHRcdFx0XHRcdHx8IE51bWJlcih0aGlzLl9oYXNQZW5kaW5nUXVlc3Rpb24oYikpIC0gTnVtYmVyKHRoaXMuX2hhc1BlbmRpbmdRdWVzdGlvbihhKSlcblx0XHRcdFx0XHR8fCBiLmxhc3RNZXNzYWdlRGF0ZSAtIGEubGFzdE1lc3NhZ2VEYXRlKVxuXHRcdFx0XHQubWFwKG1vZGVsID0+ICh7XG5cdFx0XHRcdFx0a2luZDogJ2NoYXQnLFxuXHRcdFx0XHRcdGlkOiBgY2hhdDoke3RoaXMuX3BlbmRpbmdSZXF1ZXN0S2V5KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgbW9kZWwubGFzdFJlcXVlc3Q/LmlkKX1gLFxuXHRcdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBjaUZhaWx1cmVzOiBJQ2hhdElucHV0V2luZG93UGVuZGluZ0NJRmFpbHVyZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX2NpRmFpbHVyZVByb3ZpZGVycy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBmYWlsdXJlIG9mIHByb3ZpZGVyLmZhaWx1cmVzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW06IElDaGF0SW5wdXRXaW5kb3dQZW5kaW5nQ0lGYWlsdXJlID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ2NpRmFpbHVyZScsXG5cdFx0XHRcdFx0XHRpZDogYGNpOiR7ZmFpbHVyZS5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX06JHtmYWlsdXJlLm9jY3VycmVuY2VJZH1gLFxuXHRcdFx0XHRcdFx0ZmFpbHVyZSxcblx0XHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKCFkaXNtaXNzZWRDSUZhaWx1cmVzLmhhcyhpdGVtLmlkKSkge1xuXHRcdFx0XHRcdFx0Y2lGYWlsdXJlcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2lGYWlsdXJlcy5zb3J0KChhLCBiKSA9PiBiLmZhaWx1cmUudXBkYXRlZEF0IC0gYS5mYWlsdXJlLnVwZGF0ZWRBdCk7XG5cdFx0XHRwZW5kaW5nSXRlbXMgPSBbLi4ucGVuZGluZ0NoYXRzLCAuLi5jaUZhaWx1cmVzXTtcblx0XHRcdGNvbnN0IHByZXNlcnZlZEluZGV4ID0gY3VycmVudEl0ZW1JZFxuXHRcdFx0XHQ/IHBlbmRpbmdJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLmlkID09PSBjdXJyZW50SXRlbUlkKVxuXHRcdFx0XHQ6IC0xO1xuXHRcdFx0c2hvd1BlbmRpbmdJdGVtKHByZXNlcnZlZEluZGV4ID49IDAgPyBwcmVzZXJ2ZWRJbmRleCA6IE1hdGgubWluKHRoaXMuX3BlbmRpbmdQcm9tcHRJbmRleCwgcGVuZGluZ0l0ZW1zLmxlbmd0aCAtIDEpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9ub3RpZnlQZW5kaW5nSXRlbVJlc29sdmVkQWZ0ZXJJbnRlcmFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuX2FjdGl2ZVBlbmRpbmdTZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0Y29uc3Qgb2NjdXJyZW5jZSA9IG1vZGVsXG5cdFx0XHQ/IHRoaXMuX2dldFBlbmRpbmdUb29sQXBwcm92YWwobW9kZWwpPy5vY2N1cnJlbmNlID8/IHRoaXMuX2dldFBlbmRpbmdRdWVzdGlvbk9jY3VycmVuY2UobW9kZWwpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpZiAoIW9jY3VycmVuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ1Jlc29sdmVkSW50ZXJhY3Rpb25DaGVjay52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBjdXJyZW50T2NjdXJyZW5jZSA9IGN1cnJlbnRNb2RlbFxuXHRcdFx0XHQ/IHRoaXMuX2dldFBlbmRpbmdUb29sQXBwcm92YWwoY3VycmVudE1vZGVsKT8ub2NjdXJyZW5jZSA/PyB0aGlzLl9nZXRQZW5kaW5nUXVlc3Rpb25PY2N1cnJlbmNlKGN1cnJlbnRNb2RlbClcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY3VycmVudE9jY3VycmVuY2UgIT09IG9jY3VycmVuY2UpIHtcblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm5vdGlmeVBlbmRpbmdJdGVtUmVzb2x2ZWQocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0sIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZFBlbmRpbmdTZXNzaW9uTW9kZWxzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlZnMgPSB0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJQ2hhdE1vZGVsUmVmZXJlbmNlPigpKTtcblx0XHRjb25zdCBsb2FkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRjb25zdCB1cGRhdGUgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwZW5kaW5nU2Vzc2lvbnMgPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zXG5cdFx0XHRcdC5maWx0ZXIoc2Vzc2lvbiA9PiAhc2Vzc2lvbi5pc0FyY2hpdmVkKCkgJiYgc2Vzc2lvbi5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KTtcblx0XHRcdGNvbnN0IHBlbmRpbmdLZXlzID0gbmV3IFNldChwZW5kaW5nU2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKSk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiByZWZzLmtleXMoKSkge1xuXHRcdFx0XHRpZiAoIXBlbmRpbmdLZXlzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0cmVmcy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHBlbmRpbmdTZXNzaW9ucy5tYXAoYXN5bmMgc2Vzc2lvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKSB8fCByZWZzLmhhcyhrZXkpIHx8IGxvYWRzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxvYWRzLmFkZChrZXkpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3RzLnRva2VuLCAnQ2hhdElucHV0V2luZG93LXBlbmRpbmcnKTtcblx0XHRcdFx0XHRpZiAoIXJlZikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLnNvbWUoY2FuZGlkYXRlID0+XG5cdFx0XHRcdFx0XHRjYW5kaWRhdGUucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0ga2V5ICYmIGNhbmRpZGF0ZS5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0ICYmICFjYW5kaWRhdGUuaXNBcmNoaXZlZCgpKSkge1xuXHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVmcy5zZXQoa2V5LCByZWYpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGlmICghY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW2NoYXRJbnB1dFdpbmRvd10gRmFpbGVkIHRvIGxvYWQgcGVuZGluZyBzZXNzaW9uICR7a2V5fTpgLCBlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGxvYWRzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHZvaWQgdXBkYXRlKCkpKTtcblx0XHR2b2lkIHVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwZW5kUGVuZGluZ05hdmlnYXRpb25CdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaWNvbjogVGhlbWVJY29uLCBhcmlhTGFiZWw6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBidXR0b24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJ2EuY2hhdC1pbnB1dC13aW5kb3ctcGVuZGluZy1uYXZpZ2F0aW9uLWJ1dHRvbicsIHtcblx0XHRcdHJvbGU6ICdidXR0b24nLFxuXHRcdFx0dGFiaW5kZXg6ICcwJyxcblx0XHRcdCdhcmlhLWxhYmVsJzogYXJpYUxhYmVsLFxuXHRcdH0pKTtcblx0XHRidXR0b24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihpY29uKSk7XG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGJ1dHRvbi5jbGljaygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gYnV0dG9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVuZGluZ1JlcXVlc3RLZXkocmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtyZXNvdXJjZS50b1N0cmluZygpfVxcMCR7cmVxdWVzdElkID8/ICcnfWA7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNQZW5kaW5nUXVlc3Rpb24obW9kZWw6IElDaGF0TW9kZWwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gbW9kZWwubGFzdFJlcXVlc3Q/LnJlc3BvbnNlPy5yZXNwb25zZS52YWx1ZS5zb21lKHBhcnQgPT4gcGFydC5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcgJiYgIXBhcnQuaXNVc2VkKSA/PyBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFBlbmRpbmdRdWVzdGlvbk9jY3VycmVuY2UobW9kZWw6IElDaGF0TW9kZWwpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5sYXN0UmVxdWVzdDtcblx0XHRjb25zdCBxdWVzdGlvbiA9IHJlcXVlc3Q/LnJlc3BvbnNlPy5yZXNwb25zZS52YWx1ZS5maW5kKHBhcnQgPT5cblx0XHRcdHBhcnQua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnICYmICFwYXJ0LmlzVXNlZCAmJiAhcGFydC5hbnN3ZXJlZEV4dGVybmFsbHkpO1xuXHRcdHJldHVybiByZXF1ZXN0ICYmIHF1ZXN0aW9uID8gZGVyaXZlUGVuZGluZ0lkKHJlcXVlc3QuaWQsIHF1ZXN0aW9uLCB0aGlzLl93aW5kb3dEaXNwb3NhYmxlcykgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNPbmx5UmVzb2x2ZWRQZW5kaW5nVG9vbHMobW9kZWw6IElDaGF0TW9kZWwsIHJlYWRlcjogSVJlYWRlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5sYXN0UmVxdWVzdDtcblx0XHRjb25zdCBwYXJ0cyA9IHJlcXVlc3Q/LnJlc3BvbnNlPy5yZXNwb25zZS52YWx1ZTtcblx0XHRpZiAoIXJlcXVlc3QgfHwgIXBhcnRzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCBzYXdSZXNvbHZlZFRvb2wgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJyAmJiAhcGFydC5pc1VzZWQgJiYgIXBhcnQuYW5zd2VyZWRFeHRlcm5hbGx5KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdlbGljaXRhdGlvbjInICYmIHBhcnQuc3RhdGUuZ2V0KCkgPT09ICdwZW5kaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKHBhcnQua2luZCA9PT0gJ3BsYW5SZXZpZXcnIHx8IHBhcnQua2luZCA9PT0gJ2NvbmZpcm1hdGlvbicpICYmICFwYXJ0LmlzVXNlZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFydC5raW5kICE9PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBwYXJ0LnN0YXRlLmdldCgpO1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb25cblx0XHRcdFx0JiYgc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbFxuXHRcdFx0XHQmJiBzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvY2N1cnJlbmNlID0gZGVyaXZlUGVuZGluZ0lkKHJlcXVlc3QuaWQsIHBhcnQsIHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzKTtcblx0XHRcdGlmICghaXNQZW5kaW5nSWRSZXNvbHZlZChvY2N1cnJlbmNlLCByZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHNhd1Jlc29sdmVkVG9vbCA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBzYXdSZXNvbHZlZFRvb2w7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQZW5kaW5nVG9vbEFwcHJvdmFsKG1vZGVsOiBJQ2hhdE1vZGVsKTogeyByZWFkb25seSBpbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uOyByZWFkb25seSBvY2N1cnJlbmNlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmxhc3RSZXF1ZXN0O1xuXHRcdGNvbnN0IHBhcnRzID0gcmVxdWVzdD8ucmVzcG9uc2U/LnJlc3BvbnNlLnZhbHVlO1xuXHRcdGlmICghcmVxdWVzdCB8fCAhcGFydHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuXHRcdFx0aWYgKHBhcnQua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXRlID0gcGFydC5zdGF0ZS5nZXQoKTtcblx0XHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uXG5cdFx0XHRcdCYmIHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWxcblx0XHRcdFx0JiYgc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvY2N1cnJlbmNlID0gZGVyaXZlUGVuZGluZ0lkKHJlcXVlc3QuaWQsIHBhcnQsIHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzKTtcblx0XHRcdGlmICghaXNQZW5kaW5nSWRSZXNvbHZlZChvY2N1cnJlbmNlKSkge1xuXHRcdFx0XHRyZXR1cm4geyBpbnZvY2F0aW9uOiBwYXJ0LCBvY2N1cnJlbmNlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRBY3Rpb25XaWRnZXRWaXNpYmxlKGF1eGlsaWFyeVdpbmRvdzogSUF1eGlsaWFyeVdpbmRvdywgc3VyZmFjZTogSFRNTEVsZW1lbnQsIGFuY2hvcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsIHZpc2libGU6IGJvb2xlYW4sIHBsYWNlbWVudDogQ2hhdElucHV0QWN0aW9uV2lkZ2V0UGxhY2VtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHRpZiAodGhpcy5fYWN0aW9uV2lkZ2V0T3duZXIgIT09IGF1eGlsaWFyeVdpbmRvdykge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRWaXNpYmlsaXR5Q291bnQgPSBNYXRoLm1heCgwLCB0aGlzLl9hY3Rpb25XaWRnZXRWaXNpYmlsaXR5Q291bnQgLSAxKTtcblx0XHRcdGlmICh0aGlzLl9hY3Rpb25XaWRnZXRWaXNpYmlsaXR5Q291bnQgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0TGF5b3V0R2VuZXJhdGlvbisrO1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRPd25lciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0V2luZG93LmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2FjdGlvbldpZGdldE93bmVyICE9PSBhdXhpbGlhcnlXaW5kb3cpIHtcblx0XHRcdHRoaXMuX2FjdGlvbldpZGdldExheW91dEdlbmVyYXRpb24rKztcblx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFZpc2liaWxpdHlDb3VudCA9IDA7XG5cdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRPd25lciA9IGF1eGlsaWFyeVdpbmRvdztcblx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFdpbmRvdy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0T3Blbk9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aW9uV2lkZ2V0VmlzaWJpbGl0eUNvdW50Kys7XG5cdFx0aWYgKHRoaXMuX2FjdGlvbldpZGdldFdpbmRvdy52YWx1ZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYWN0aW9uV2lkZ2V0T3Blbk9wZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGlvbldpZGdldE9wZW5PcGVyYXRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9ICsrdGhpcy5fYWN0aW9uV2lkZ2V0TGF5b3V0R2VuZXJhdGlvbjtcblx0XHRjb25zdCBvcGVyYXRpb24gPSB0aGlzLl9vcGVuQWN0aW9uV2lkZ2V0V2luZG93KGF1eGlsaWFyeVdpbmRvdywgc3VyZmFjZSwgYW5jaG9yLCBnZW5lcmF0aW9uLCBwbGFjZW1lbnQpO1xuXHRcdHRoaXMuX2FjdGlvbldpZGdldE9wZW5PcGVyYXRpb24gPSBvcGVyYXRpb247XG5cdFx0cmV0dXJuIG9wZXJhdGlvbi5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9hY3Rpb25XaWRnZXRPcGVuT3BlcmF0aW9uID09PSBvcGVyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0T3Blbk9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3ByZXBhcmVDb250ZXh0UGlja2VyKGF1eGlsaWFyeVdpbmRvdzogSUF1eGlsaWFyeVdpbmRvdywgc3VyZmFjZTogSFRNTEVsZW1lbnQsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIHdpZGdldDogQ2hhdFdpZGdldCk6IFByb21pc2U8SVF1aWNrSW5wdXRTZXJ2aWNlPiB7XG5cdFx0dGhpcy5fY29udGV4dFBpY2tlci5jbGVhcigpO1xuXHRcdGF3YWl0IHRoaXMuX3NldEFjdGlvbldpZGdldFZpc2libGUoYXV4aWxpYXJ5V2luZG93LCBzdXJmYWNlLCB1bmRlZmluZWQsIHRydWUsICdhYm92ZScpO1xuXG5cdFx0Y29uc3QgYWN0aW9uV2lkZ2V0V2luZG93ID0gdGhpcy5fYWN0aW9uV2lkZ2V0V2luZG93LnZhbHVlO1xuXHRcdGlmICghYWN0aW9uV2lkZ2V0V2luZG93KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byBvcGVuIHRoZSBjaGF0IGlucHV0IGNvbnRleHQgcGlja2VyIHdpbmRvdycpO1xuXHRcdH1cblxuXHRcdGFjdGlvbldpZGdldFdpbmRvdy53aW5kb3cuZm9jdXMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3QgcGlja2VyTGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZExheW91dE1haW5Db250YWluZXI6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZExheW91dENvbnRhaW5lcjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRBZGRDb250YWluZXI6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lcjogRXZlbnQuTm9uZSxcblx0XHRcdGdldCBtYWluQ29udGFpbmVyRGltZW5zaW9uKCkge1xuXHRcdFx0XHRyZXR1cm4geyB3aWR0aDogYWN0aW9uV2lkZ2V0V2luZG93LmNvbnRhaW5lci5jbGllbnRXaWR0aCwgaGVpZ2h0OiBhY3Rpb25XaWRnZXRXaW5kb3cuY29udGFpbmVyLmNsaWVudEhlaWdodCB9O1xuXHRcdFx0fSxcblx0XHRcdGdldCBhY3RpdmVDb250YWluZXJEaW1lbnNpb24oKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1haW5Db250YWluZXJEaW1lbnNpb247XG5cdFx0XHR9LFxuXHRcdFx0bWFpbkNvbnRhaW5lcjogYWN0aW9uV2lkZ2V0V2luZG93LmNvbnRhaW5lcixcblx0XHRcdGFjdGl2ZUNvbnRhaW5lcjogYWN0aW9uV2lkZ2V0V2luZG93LmNvbnRhaW5lcixcblx0XHRcdGNvbnRhaW5lcnM6IFthY3Rpb25XaWRnZXRXaW5kb3cuY29udGFpbmVyXSxcblx0XHRcdGdldENvbnRhaW5lcjogKCkgPT4gYWN0aW9uV2lkZ2V0V2luZG93LmNvbnRhaW5lcixcblx0XHRcdHdoZW5Db250YWluZXJTdHlsZXNMb2FkZWQ6ICgpID0+IGFjdGlvbldpZGdldFdpbmRvdy53aGVuU3R5bGVzSGF2ZUxvYWRlZCxcblx0XHRcdG1haW5Db250YWluZXJPZmZzZXQ6IHsgdG9wOiAwLCBxdWlja1BpY2tUb3A6IDAgfSxcblx0XHRcdGFjdGl2ZUNvbnRhaW5lck9mZnNldDogeyB0b3A6IDAsIHF1aWNrUGlja1RvcDogMCB9LFxuXHRcdFx0Zm9jdXM6ICgpID0+IGFjdGlvbldpZGdldFdpbmRvdy53aW5kb3cuZm9jdXMoKSxcblx0XHR9O1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdLFxuXHRcdFx0W0lMYXlvdXRTZXJ2aWNlLCBwaWNrZXJMYXlvdXRTZXJ2aWNlXSxcblx0XHQpO1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChzZXJ2aWNlcyk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRzdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhY3Rpb25XaWRnZXRXaW5kb3cud2luZG93LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQua2V5ICE9PSAnRXNjYXBlJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9jb250ZXh0UGlja2VyLmNsZWFyKCk7XG5cdFx0fSwgdHJ1ZSkpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gc3RvcmUuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrSW5wdXRTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElRdWlja0lucHV0U2VydmljZSwgcXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcGVuZGluZ0hpZGUgPSBzdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGNvbnN0IHBlbmRpbmdMYXlvdXQgPSBzdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGxldCBwaWNrZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFuY2hvclBpY2tlciA9ICgpID0+IHtcblx0XHRcdHBlbmRpbmdMYXlvdXQudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShhY3Rpb25XaWRnZXRXaW5kb3cud2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdGlmIChwaWNrZXIpIHtcblx0XHRcdFx0XHRpZiAocGlja2VyLnN0eWxlLnRvcCAhPT0gJ2F1dG8nKSB7XG5cdFx0XHRcdFx0XHRwaWNrZXIuc3R5bGUudG9wID0gJ2F1dG8nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocGlja2VyLnN0eWxlLmJvdHRvbSAhPT0gJzBweCcpIHtcblx0XHRcdFx0XHRcdHBpY2tlci5zdHlsZS5ib3R0b20gPSAnMCc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdGNvbnN0IHBpY2tlck9ic2VydmVyID0gbmV3IGFjdGlvbldpZGdldFdpbmRvdy53aW5kb3cuTXV0YXRpb25PYnNlcnZlcihtdXRhdGlvbnMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBtdXRhdGlvbiBvZiBtdXRhdGlvbnMpIHtcblx0XHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KG11dGF0aW9uLnRhcmdldCkgJiYgbXV0YXRpb24udGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygncXVpY2staW5wdXQtd2lkZ2V0JykpIHtcblx0XHRcdFx0XHRwaWNrZXIgPSBtdXRhdGlvbi50YXJnZXQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIG11dGF0aW9uLmFkZGVkTm9kZXMpIHtcblx0XHRcdFx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQobm9kZSkgJiYgbm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ3F1aWNrLWlucHV0LXdpZGdldCcpKSB7XG5cdFx0XHRcdFx0XHRwaWNrZXIgPSBub2RlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgbXV0YXRpb24ucmVtb3ZlZE5vZGVzKSB7XG5cdFx0XHRcdFx0aWYgKHBpY2tlciAmJiAobm9kZSA9PT0gcGlja2VyIHx8IG5vZGUuY29udGFpbnMocGlja2VyKSkpIHtcblx0XHRcdFx0XHRcdHBpY2tlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGFuY2hvclBpY2tlcigpO1xuXHRcdH0pO1xuXHRcdHBpY2tlck9ic2VydmVyLm9ic2VydmUoYWN0aW9uV2lkZ2V0V2luZG93LmNvbnRhaW5lciwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUsIGF0dHJpYnV0ZXM6IHRydWUsIGF0dHJpYnV0ZUZpbHRlcjogWydzdHlsZSddIH0pO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGlja2VyT2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cdFx0c3RvcmUuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLm9uU2hvdygoKSA9PiB7XG5cdFx0XHRwZW5kaW5nSGlkZS5jbGVhcigpO1xuXHRcdFx0YW5jaG9yUGlja2VyKCk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChxdWlja0lucHV0U2VydmljZS5vbkhpZGUoKCkgPT4ge1xuXHRcdFx0cGVuZGluZ0hpZGUudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9jb250ZXh0UGlja2VyLnZhbHVlID09PSBzdG9yZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRQaWNrZXIuY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgQ0hBVF9JTlBVVF9XSU5ET1dfQ09OVEVYVF9QSUNLRVJfVFJBTlNJVElPTl9ERUxBWSk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLl9zZXRBY3Rpb25XaWRnZXRWaXNpYmxlKGF1eGlsaWFyeVdpbmRvdywgc3VyZmFjZSwgdW5kZWZpbmVkLCBmYWxzZSwgJ2Fib3ZlJyk7XG5cdFx0XHRpZiAodGhpcy5fd2luZG93ID09PSBhdXhpbGlhcnlXaW5kb3cpIHtcblx0XHRcdFx0YXV4aWxpYXJ5V2luZG93LndpbmRvdy5mb2N1cygpO1xuXHRcdFx0XHR3aWRnZXQuZm9jdXNJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9jb250ZXh0UGlja2VyLnZhbHVlID0gc3RvcmU7XG5cblx0XHRyZXR1cm4gcXVpY2tJbnB1dFNlcnZpY2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuQWN0aW9uV2lkZ2V0V2luZG93KGF1eGlsaWFyeVdpbmRvdzogSUF1eGlsaWFyeVdpbmRvdywgc3VyZmFjZTogSFRNTEVsZW1lbnQsIGFuY2hvcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsIGdlbmVyYXRpb246IG51bWJlciwgcGxhY2VtZW50OiBDaGF0SW5wdXRBY3Rpb25XaWRnZXRQbGFjZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzb3VyY2VXaW5kb3cgPSBhdXhpbGlhcnlXaW5kb3cud2luZG93O1xuXHRcdGNvbnN0IFtjdXJzb3JTY3JlZW5Qb2ludCwgbmF0aXZlU291cmNlQm91bmRzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuaG9zdFNlcnZpY2UuZ2V0Q3Vyc29yU2NyZWVuUG9pbnQoKSxcblx0XHRcdHRoaXMuaG9zdFNlcnZpY2UuZ2V0V2luZG93UG9zaXRpb24oc291cmNlV2luZG93KSxcblx0XHRdKTtcblx0XHRjb25zdCBzb3VyY2VCb3VuZHMgPSBuYXRpdmVTb3VyY2VCb3VuZHMgPz8ge1xuXHRcdFx0eDogc291cmNlV2luZG93LnNjcmVlblgsXG5cdFx0XHR5OiBzb3VyY2VXaW5kb3cuc2NyZWVuWSxcblx0XHRcdHdpZHRoOiBzb3VyY2VXaW5kb3cub3V0ZXJXaWR0aCxcblx0XHRcdGhlaWdodDogc291cmNlV2luZG93Lm91dGVySGVpZ2h0LFxuXHRcdH07XG5cdFx0Y29uc3Qgc291cmNlU3VyZmFjZUJvdW5kcyA9IHN1cmZhY2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3Qgc291cmNlVG9wID0gc291cmNlQm91bmRzLnkgKyBzb3VyY2VTdXJmYWNlQm91bmRzLnRvcDtcblx0XHRjb25zdCBzb3VyY2VSaWdodCA9IHNvdXJjZUJvdW5kcy54ICsgc291cmNlU3VyZmFjZUJvdW5kcy5yaWdodDtcblx0XHRjb25zdCBzb3VyY2VBbmNob3JCb3VuZHMgPSBhbmNob3I/LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHNjcmVlbiA9IHNvdXJjZVdpbmRvdy5zY3JlZW47XG5cdFx0Y29uc3QgZGlzcGxheSA9IGN1cnNvclNjcmVlblBvaW50Py5kaXNwbGF5ID8/IHtcblx0XHRcdHg6IHNvdXJjZUJvdW5kcy54LFxuXHRcdFx0eTogc291cmNlQm91bmRzLnksXG5cdFx0XHR3aWR0aDogc2NyZWVuLmF2YWlsV2lkdGgsXG5cdFx0XHRoZWlnaHQ6IHNjcmVlbi5hdmFpbEhlaWdodCxcblx0XHR9O1xuXHRcdGNvbnN0IGRpc3BsYXlCb3R0b20gPSBkaXNwbGF5LnkgKyBkaXNwbGF5LmhlaWdodDtcblx0XHRjb25zdCBkaXNwbGF5UmlnaHQgPSBkaXNwbGF5LnggKyBkaXNwbGF5LndpZHRoO1xuXHRcdGNvbnN0IHdpZHRoID0gTWF0aC5taW4oXG5cdFx0XHRwbGFjZW1lbnQgPT09ICdyaWdodCcgPyBDSEFUX0lOUFVUX1dJTkRPV19BQ1RJT05fV0lER0VUX1dJRFRIIDogc291cmNlQm91bmRzLndpZHRoLFxuXHRcdFx0ZGlzcGxheS53aWR0aFxuXHRcdCk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlQWJvdmUgPSBNYXRoLm1heCgxLCBzb3VyY2VUb3AgLSBkaXNwbGF5LnkgLSBDSEFUX0lOUFVUX1dJTkRPV19BQ1RJT05fV0lER0VUX01BUkdJTik7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5taW4oXG5cdFx0XHRDSEFUX0lOUFVUX1dJTkRPV19BQ1RJT05fV0lER0VUX0hFSUdIVCxcblx0XHRcdHBsYWNlbWVudCA9PT0gJ2Fib3ZlJyA/IGF2YWlsYWJsZUFib3ZlIDogZGlzcGxheS5oZWlnaHRcblx0XHQpO1xuXHRcdGNvbnN0IHByZWZlcnJlZFggPSBwbGFjZW1lbnQgPT09ICdyaWdodCdcblx0XHRcdD8gc291cmNlUmlnaHQgKyBDSEFUX0lOUFVUX1dJTkRPV19BQ1RJT05fV0lER0VUX01BUkdJTlxuXHRcdFx0OiBzb3VyY2VCb3VuZHMueDtcblx0XHRjb25zdCBwcmVmZXJyZWRZID0gcGxhY2VtZW50ID09PSAncmlnaHQnXG5cdFx0XHQ/IHNvdXJjZUJvdW5kcy55ICsgKHNvdXJjZUFuY2hvckJvdW5kcz8udG9wID8/IHNvdXJjZVN1cmZhY2VCb3VuZHMudG9wKVxuXHRcdFx0OiBzb3VyY2VUb3AgLSBoZWlnaHQgLSBDSEFUX0lOUFVUX1dJTkRPV19BQ1RJT05fV0lER0VUX01BUkdJTjtcblx0XHRjb25zdCB4ID0gTWF0aC5taW4oTWF0aC5tYXgoZGlzcGxheS54LCBwcmVmZXJyZWRYKSwgZGlzcGxheVJpZ2h0IC0gd2lkdGgpO1xuXHRcdGNvbnN0IHkgPSBNYXRoLm1pbihNYXRoLm1heChkaXNwbGF5LnksIHByZWZlcnJlZFkpLCBkaXNwbGF5Qm90dG9tIC0gaGVpZ2h0KTtcblx0XHRjb25zdCBhY3Rpb25XaWRnZXRXaW5kb3cgPSBhd2FpdCB0aGlzLmF1eGlsaWFyeVdpbmRvd1NlcnZpY2Uub3Blbih7XG5cdFx0XHRib3VuZHM6IHsgeCwgeSwgd2lkdGgsIGhlaWdodCB9LFxuXHRcdFx0YWx3YXlzT25Ub3A6IHRydWUsXG5cdFx0XHRmcmFtZWxlc3M6IHRydWUsXG5cdFx0XHR0cmFuc3BhcmVudDogdHJ1ZSxcblx0XHRcdG5vdFJlc2l6YWJsZTogdHJ1ZSxcblx0XHRcdGRpc2FibGVGdWxsc2NyZWVuOiB0cnVlLFxuXHRcdFx0bmF0aXZlVGl0bGViYXI6IGZhbHNlLFxuXHRcdFx0bm9CYWNrZ3JvdW5kVGhyb3R0bGluZzogdHJ1ZSxcblx0XHRcdGJhY2tncm91bmRDb2xvcjogJyMwMDAwMDAwMCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgYWN0aW9uV2lkZ2V0V2luZG93LndoZW5TdHlsZXNIYXZlTG9hZGVkO1xuXHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9hY3Rpb25XaWRnZXRMYXlvdXRHZW5lcmF0aW9uIHx8IHRoaXMuX3dpbmRvdyAhPT0gYXV4aWxpYXJ5V2luZG93KSB7XG5cdFx0XHRhY3Rpb25XaWRnZXRXaW5kb3cuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFjdGlvbldpZGdldFdpbmRvdy53aW5kb3cuZG9jdW1lbnQuYm9keS5zdHlsZS5zZXRQcm9wZXJ0eSgnYmFja2dyb3VuZC1jb2xvcicsICd0cmFuc3BhcmVudCcsICdpbXBvcnRhbnQnKTtcblx0XHRhY3Rpb25XaWRnZXRXaW5kb3cud2luZG93LmRvY3VtZW50LmJvZHkuc3R5bGUuc2V0UHJvcGVydHkoJ21hcmdpbicsICcwJywgJ2ltcG9ydGFudCcpO1xuXHRcdGFjdGlvbldpZGdldFdpbmRvdy5jb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3RyYW5zcGFyZW50Jztcblx0XHRhY3Rpb25XaWRnZXRXaW5kb3cuY29udGFpbmVyLnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0dGhpcy5fYWN0aW9uV2lkZ2V0UGxhY2VtZW50ID0gcGxhY2VtZW50O1xuXHRcdHRoaXMuX2FjdGlvbldpZGdldFdpbmRvd0FuY2hvclkgPSBwbGFjZW1lbnQgPT09ICdyaWdodCcgPyAwIDogaGVpZ2h0O1xuXHRcdHRoaXMuX2FjdGlvbldpZGdldEFuY2hvclBvc2l0aW9uID0gcGxhY2VtZW50ID09PSAncmlnaHQnID8gQW5jaG9yUG9zaXRpb24uQkVMT1cgOiBBbmNob3JQb3NpdGlvbi5BQk9WRTtcblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRXaW5kb3cudmFsdWUgPSBhY3Rpb25XaWRnZXRXaW5kb3c7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBY3Rpb25XaWRnZXRBbmNob3IoYW5jaG9yOiBIVE1MRWxlbWVudCk6IElBbmNob3Ige1xuXHRcdGNvbnN0IGJvdW5kcyA9IGFuY2hvci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eDogdGhpcy5fYWN0aW9uV2lkZ2V0UGxhY2VtZW50ID09PSAncmlnaHQnID8gMCA6IGJvdW5kcy5sZWZ0LFxuXHRcdFx0eTogdGhpcy5fYWN0aW9uV2lkZ2V0V2luZG93QW5jaG9yWSxcblx0XHRcdHdpZHRoOiBib3VuZHMud2lkdGgsXG5cdFx0XHRoZWlnaHQ6IDEsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VXaWRnZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tcGxldGVQZW5kaW5nVm9pY2VSb3V0ZShmYWxzZSk7XG5cdFx0dGhpcy5fcGVuZGluZ1Jlc29sdmVkSW50ZXJhY3Rpb25DaGVjay5jbGVhcigpO1xuXHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5zZXRPbW5pSW5wdXRPcGVuKGZhbHNlKTtcblx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuc2V0T21uaUlucHV0QWN0aXZlKGZhbHNlKTtcblx0XHR0aGlzLl9yb3V0aW5nQ29udHJvbGxlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl93aWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZml0V2luZG93VG9Db250ZW50ID0gKCkgPT4geyB9O1xuXHRcdHRoaXMuX3JvdyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sZWFkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RyYWlsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2FjdGl2ZVBlbmRpbmdTZXNzaW9uUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29udGV4dFBpY2tlci5jbGVhcigpO1xuXHRcdHRoaXMuX2FjdGlvbldpZGdldFZpc2liaWxpdHlDb3VudCA9IDA7XG5cdFx0dGhpcy5fYWN0aW9uV2lkZ2V0T3duZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYWN0aW9uV2lkZ2V0T3Blbk9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRXaW5kb3cuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRMYXlvdXRHZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5fbW9kZWxSZWY/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9tb2RlbFJlZiA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2RlZmF1bHRCb3VuZHMoKTogSVJlY3RhbmdsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bvc2l0aW9uZWRCb3VuZHModGhpcy5fZGVmYXVsdFdpZHRoKCksIENIQVRfSU5QVVRfV0lORE9XX0RFRkFVTFRfSEVJR0hUKTtcblx0fVxuXG5cdHByaXZhdGUgX3Bvc2l0aW9uZWRCb3VuZHMod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBJUmVjdGFuZ2xlIHtcblx0XHRjb25zdCBvZmZzZXQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxJQ2hhdElucHV0V2luZG93UG9zaXRpb25PZmZzZXQ+KFxuXHRcdFx0Q2hhdElucHV0V2luZG93U3RvcmFnZUtleXMuV2luZG93UG9zaXRpb25PZmZzZXQsXG5cdFx0XHRTdG9yYWdlU2NvcGUuV09SS1NQQUNFLFxuXHRcdCk7XG5cdFx0Y29uc3QgdmFsaWRPZmZzZXQgPSBvZmZzZXQgJiYgTnVtYmVyLmlzRmluaXRlKG9mZnNldC54KSAmJiBOdW1iZXIuaXNGaW5pdGUob2Zmc2V0LnkpID8gb2Zmc2V0IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGJvdW5kcyA9IGdldENoYXRJbnB1dFdpbmRvd0JvdW5kcyh0aGlzLl9pbnZva2luZ1dpbmRvd0JvdW5kcywgd2lkdGgsIGhlaWdodCwgdmFsaWRPZmZzZXQpO1xuXHRcdGNvbnN0IHNjcmVlbiA9IHRoaXMuX2ludm9raW5nV2luZG93LnNjcmVlbiBhcyBTY3JlZW4gJiB7IHJlYWRvbmx5IGF2YWlsTGVmdD86IG51bWJlcjsgcmVhZG9ubHkgYXZhaWxUb3A/OiBudW1iZXIgfTtcblx0XHRjb25zdCBhdmFpbGFibGVMZWZ0ID0gc2NyZWVuLmF2YWlsTGVmdDtcblx0XHRjb25zdCBhdmFpbGFibGVUb3AgPSBzY3JlZW4uYXZhaWxUb3A7XG5cdFx0aWYgKHR5cGVvZiBhdmFpbGFibGVMZWZ0ICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgYXZhaWxhYmxlVG9wICE9PSAnbnVtYmVyJyB8fCAhTnVtYmVyLmlzRmluaXRlKGF2YWlsYWJsZUxlZnQpIHx8ICFOdW1iZXIuaXNGaW5pdGUoYXZhaWxhYmxlVG9wKSB8fCBzY3JlZW4uYXZhaWxXaWR0aCA8PSAwIHx8IHNjcmVlbi5hdmFpbEhlaWdodCA8PSAwKSB7XG5cdFx0XHRyZXR1cm4gYm91bmRzO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uYm91bmRzLFxuXHRcdFx0eDogTWF0aC5taW4oTWF0aC5tYXgoYm91bmRzLngsIGF2YWlsYWJsZUxlZnQpLCBhdmFpbGFibGVMZWZ0ICsgTWF0aC5tYXgoMCwgc2NyZWVuLmF2YWlsV2lkdGggLSB3aWR0aCkpLFxuXHRcdFx0eTogTWF0aC5taW4oTWF0aC5tYXgoYm91bmRzLnksIGF2YWlsYWJsZVRvcCksIGF2YWlsYWJsZVRvcCArIE1hdGgubWF4KDAsIHNjcmVlbi5hdmFpbEhlaWdodCAtIGhlaWdodCkpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zdG9yZVdpbmRvd1Bvc2l0aW9uKGF1eGlsaWFyeVdpbmRvdzogSUF1eGlsaWFyeVdpbmRvdyk6IHZvaWQge1xuXHRcdGNvbnN0IGJvdW5kcyA9IGF1eGlsaWFyeVdpbmRvdy5jcmVhdGVTdGF0ZSgpLmJvdW5kcztcblx0XHRpZiAoYm91bmRzPy54ID09PSB1bmRlZmluZWQgfHwgYm91bmRzLnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0Q2hhdElucHV0V2luZG93U3RvcmFnZUtleXMuV2luZG93UG9zaXRpb25PZmZzZXQsXG5cdFx0XHRKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHg6IGJvdW5kcy54IC0gdGhpcy5faW52b2tpbmdXaW5kb3dCb3VuZHMueCxcblx0XHRcdFx0eTogYm91bmRzLnkgLSB0aGlzLl9pbnZva2luZ1dpbmRvd0JvdW5kcy55LFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRJbnB1dFdpbmRvd1Bvc2l0aW9uT2Zmc2V0KSxcblx0XHRcdFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHRTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2RlZmF1bHRXaWR0aCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGludm9raW5nV2luZG93V2lkdGggPSB0aGlzLl9pbnZva2luZ1dpbmRvd0JvdW5kcy53aWR0aCA+IDBcblx0XHRcdD8gdGhpcy5faW52b2tpbmdXaW5kb3dCb3VuZHMud2lkdGhcblx0XHRcdDogbWFpbldpbmRvdy5vdXRlcldpZHRoO1xuXHRcdHJldHVybiBNYXRoLnJvdW5kKGdldFF1aWNrSW5wdXRXaWR0aChpbnZva2luZ1dpbmRvd1dpZHRoKSAqIDEuMSk7XG5cdH1cblxuXHRwcml2YXRlIF93aW5kb3dCb3VuZHMod2luZG93OiBXaW5kb3cpOiBJUmVjdGFuZ2xlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eDogd2luZG93LnNjcmVlblgsXG5cdFx0XHR5OiB3aW5kb3cuc2NyZWVuWSxcblx0XHRcdHdpZHRoOiB3aW5kb3cub3V0ZXJXaWR0aCxcblx0XHRcdGhlaWdodDogd2luZG93Lm91dGVySGVpZ2h0LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9pc1VzYWJsZVdpbmRvd0JvdW5kcyhib3VuZHM6IElSZWN0YW5nbGUgfCB1bmRlZmluZWQpOiBib3VuZHMgaXMgSVJlY3RhbmdsZSB7XG5cdFx0cmV0dXJuICEhYm91bmRzXG5cdFx0XHQmJiBOdW1iZXIuaXNGaW5pdGUoYm91bmRzLngpXG5cdFx0XHQmJiBOdW1iZXIuaXNGaW5pdGUoYm91bmRzLnkpXG5cdFx0XHQmJiBOdW1iZXIuaXNGaW5pdGUoYm91bmRzLndpZHRoKVxuXHRcdFx0JiYgTnVtYmVyLmlzRmluaXRlKGJvdW5kcy5oZWlnaHQpXG5cdFx0XHQmJiBib3VuZHMud2lkdGggPiAwXG5cdFx0XHQmJiBib3VuZHMuaGVpZ2h0ID4gMDtcblx0fVxuXG5cdHByaXZhdGUgX2lzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihPbW5pQ2hhdEVuYWJsZWRTZXR0aW5nSWQpID09PSB0cnVlXG5cdFx0XHQmJiAhdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5oaWRkZW47XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRJbnB1dFdpbmRvd1NlcnZpY2UsIENoYXRJbnB1dFdpbmRvd1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCLG1CQUFtQixlQUFlO0FBQzVELFNBQVMsY0FBYztBQUV2QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxZQUFZLGVBQWUsaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDekcsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBRy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixjQUFjLHFC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QUssS0FDNUIsT0FBTyxTQUFTLE9BQU8sTUFBTSxLQUM3QixPQUFPLFFBQVEsS0FDZixPQUFPLFNBQVM7QUFBQSxFQUNyQjtBQUFBLEVBRVEsYUFBc0I7QUFDN0IsV0FBTyxLQUFLLHFCQUFxQixTQUFrQix3QkFBd0IsTUFBTSxRQUM3RSxDQUFDLEtBQUssdUJBQXVCLFVBQVU7QUFBQSxFQUM1QztBQUNEO0FBL2hEYSx5QkFBTjtBQUFBLEVBaUVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBcEZVO0FBaWlEYixrQkFBa0IseUJBQXlCLHdCQUF3QixrQkFBa0IsT0FBTzsiLAogICJuYW1lcyI6IFsicm93IiwgImhlaWdodCIsICJib3R0b20iXQp9Cg==
