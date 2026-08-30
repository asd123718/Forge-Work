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
import "./media/chatViewPane.css";
import { $, addDisposableListener, append, EventHelper, EventType, getWindow, setVisibility } from "../../../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../../../base/browser/mouseEvent.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Orientation, Sash } from "../../../../../../base/browser/ui/sash/sash.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { MutableDisposable, toDisposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../../../base/common/map.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { autorun, observableFromEvent, observableValue } from "../../../../../../base/common/observable.js";
import { getComparisonKey, isEqual } from "../../../../../../base/common/resources.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { editorBackground } from "../../../../../../platform/theme/common/colorRegistry.js";
import { ChatViewTitleControl } from "./chatViewTitleControl.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../../../platform/theme/common/theme.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { ViewPane } from "../../../../../browser/parts/views/viewPane.js";
import { Memento } from "../../../../../common/memento.js";
import { SIDE_BAR_FOREGROUND } from "../../../../../common/theme.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../../common/views.js";
import { ILifecycleService, StartupKind } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { CHAT_PROVIDER_ID } from "../../../common/participants/chatParticipantContribTypes.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSessionsService, localChatSessionType } from "../../../common/chatSessionsService.js";
import { LocalChatSessionUri, getChatSessionType, isUntitledChatSession } from "../../../common/model/chatUri.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, getDefaultNewChatSessionResource, getDefaultNewChatSessionType } from "../../../common/constants.js";
import { AgentSessionsControl } from "../../agentSessions/agentSessionsControl.js";
import { ACTION_ID_NEW_CHAT } from "../../actions/chatActions.js";
import { ChatWidget, layoutChatWidgetForInputHeight } from "../../widget/chatWidget.js";
import { ChatViewWelcomeController } from "../../viewsWelcome/chatViewWelcomeController.js";
import { IWorkbenchLayoutService, LayoutSettings, Position } from "../../../../../services/layout/browser/layoutService.js";
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from "../../agentSessions/agentSessions.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT, ChatViewId, IChatWidgetService, setModelPreservingInputTypedWhileLoading } from "../../chat.js";
import { IActivityService, ProgressBadge } from "../../../../../services/activity/common/activity.js";
import { disposableTimeout } from "../../../../../../base/common/async.js";
import { AgentSessionsFilter, AgentSessionsGrouping } from "../../agentSessions/agentSessionsFilter.js";
import { IAgentSessionsService } from "../../agentSessions/agentSessionsService.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { HoverPosition } from "../../../../../../base/browser/ui/hover/hoverWidget.js";
import { ChatEntitlementContextKeys, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { toErrorMessage } from "../../../../../../base/common/errorMessage.js";
import { IHostService } from "../../../../../services/host/browser/host.js";
import { IMicCaptureService } from "../../voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../voiceClient/ttsPlaybackService.js";
import { IVoiceSessionController } from "../../voiceClient/voiceSessionController.js";
import { IVoiceInputModeService } from "../../voiceInputMode/voiceInputMode.js";
import { isGlowingVoiceState, readVoiceGlowIntensity, resolveVoiceGlowColors } from "../../voiceClient/voiceGlow.js";
import { createVoiceGlowController } from "../../voiceClient/voiceGlowController.js";
import { combineVoiceInput } from "../../voiceClient/voiceInputUtils.js";
import { resolveVoiceModel } from "../../voiceClient/voiceToolDispatchService.js";
import { IAgentTitleBarStatusService } from "../../agentSessions/experiments/agentTitleBarStatusService.js";
import { IVoicePlaybackService } from "../../../common/voicePlaybackService.js";
import { VOICE_AGENT_PROGRESS_SETTING } from "../../../common/voiceClient/voiceClientService.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
let ChatViewPane = class extends ViewPane {
  constructor(options, keybindingService2, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, storageService, chatService, chatAgentService, logService, notificationService, layoutService, chatSessionsService, telemetryService, lifecycleService, progressService, agentSessionsService, chatEntitlementService, commandService, activityService, hostService, micCaptureService, ttsPlaybackService, voiceSessionController, voiceInputModeService, chatWidgetService, _agentTitleBarStatusService, _voicePlaybackService, _workbenchEnvironmentService, workspaceContextService, agentHostEnablementService, accessibilityService) {
    super(options, keybindingService2, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.storageService = storageService;
    this.chatService = chatService;
    this.chatAgentService = chatAgentService;
    this.logService = logService;
    this.notificationService = notificationService;
    this.layoutService = layoutService;
    this.chatSessionsService = chatSessionsService;
    this.telemetryService = telemetryService;
    this.progressService = progressService;
    this.agentSessionsService = agentSessionsService;
    this.chatEntitlementService = chatEntitlementService;
    this.commandService = commandService;
    this.activityService = activityService;
    this.hostService = hostService;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.voiceSessionController = voiceSessionController;
    this.voiceInputModeService = voiceInputModeService;
    this.chatWidgetService = chatWidgetService;
    this.workspaceContextService = workspaceContextService;
    this.agentHostEnablementService = agentHostEnablementService;
    this.accessibilityService = accessibilityService;
    this.lastDimensionsPerOrientation = /* @__PURE__ */ new Map();
    this.loadSessionCts = this._register(new MutableDisposable());
    this._applyModelCts = this._register(new MutableDisposable());
    /** While > 0 the sessions list is suppressed so a session transition's transiently-empty widget does not reveal it (see {@link beginSessionsListSuppression}). */
    this._sessionsListSuppressionCount = 0;
    this.modelRef = this._register(new MutableDisposable());
    this.widgetViewStates = new LRUCache(CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT);
    this.activityBadge = this._register(new MutableDisposable());
    this._currentSessionResource = observableValue(this, void 0);
    this._voiceBarDisposables = this._register(new DisposableStore());
    this.sessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
    this.sessionsViewerOrientationConfiguration = "sideBySide";
    this.sessionsViewerSashDisposables = this._register(new MutableDisposable());
    //#region Layout
    this.layoutingBody = false;
    this.element.classList.add("chat-viewpane-container");
    this.memento = new Memento(`interactive-session-view-${CHAT_PROVIDER_ID}`, this.storageService);
    this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    if (lifecycleService.startupKind !== StartupKind.ReloadedWindow && this.configurationService.getValue(ChatConfiguration.RestoreLastPanelSession) === false) {
      this.viewState.sessionId = void 0;
      this.viewState.sessionResource = void 0;
    }
    this.sessionsViewerVisible = false;
    this.sessionsViewerSidebarWidth = Math.max(ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH, this.viewState.sessionsSidebarWidth ?? ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH);
    this.chatViewLocationContext = ChatContextKeys.panelLocation.bindTo(contextKeyService);
    this.sessionsViewerOrientationContext = ChatContextKeys.agentSessionsViewerOrientation.bindTo(contextKeyService);
    this.sessionsViewerPositionContext = ChatContextKeys.agentSessionsViewerPosition.bindTo(contextKeyService);
    this.sessionsViewerVisibilityContext = ChatContextKeys.agentSessionsViewerVisible.bindTo(contextKeyService);
    this.updateContextKeys();
    this._focusedSessionResource = observableFromEvent(
      this,
      this.chatWidgetService.onDidChangeFocusedSession,
      () => this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource
    );
    this.registerListeners();
  }
  updateContextKeys() {
    const { position, location } = this.getViewPositionAndLocation();
    this.chatViewLocationContext.set(location ?? ViewContainerLocation.AuxiliaryBar);
    this.sessionsViewerOrientationContext.set(this.sessionsViewerOrientation);
    this.sessionsViewerPositionContext.set(position === Position.RIGHT ? AgentSessionsViewerPosition.Right : AgentSessionsViewerPosition.Left);
  }
  getViewPositionAndLocation() {
    const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
    const sideBarPosition = this.layoutService.getSideBarPosition();
    const panelPosition = this.layoutService.getPanelPosition();
    let sideSessionsOnRightPosition;
    switch (viewLocation) {
      case ViewContainerLocation.Sidebar:
        sideSessionsOnRightPosition = sideBarPosition === Position.RIGHT;
        break;
      case ViewContainerLocation.Panel:
        sideSessionsOnRightPosition = panelPosition !== Position.LEFT;
        break;
      default:
        sideSessionsOnRightPosition = sideBarPosition === Position.LEFT;
        break;
    }
    return {
      position: sideSessionsOnRightPosition ? Position.RIGHT : Position.LEFT,
      location: viewLocation ?? ViewContainerLocation.AuxiliaryBar
    };
  }
  getSessionHoverPosition() {
    const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
    const sideBarPosition = this.layoutService.getSideBarPosition();
    if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
      return viewLocation === ViewContainerLocation.Sidebar && sideBarPosition === Position.RIGHT ? HoverPosition.LEFT : HoverPosition.RIGHT;
    }
    return {
      [Position.LEFT]: HoverPosition.RIGHT,
      [Position.RIGHT]: HoverPosition.LEFT,
      [Position.TOP]: HoverPosition.BELOW,
      [Position.BOTTOM]: HoverPosition.ABOVE
    }[viewLocation === ViewContainerLocation.Panel ? this.layoutService.getPanelPosition() : sideBarPosition];
  }
  updateViewPaneClasses(fromEvent) {
    const activityBarLocationDefault = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === "default";
    this.viewPaneContainer?.classList.toggle("activity-bar-location-default", activityBarLocationDefault);
    this.viewPaneContainer?.classList.toggle("activity-bar-location-other", !activityBarLocationDefault);
    const { position, location } = this.getViewPositionAndLocation();
    this.viewPaneContainer?.classList.toggle("chat-view-location-auxiliarybar", location === ViewContainerLocation.AuxiliaryBar);
    this.viewPaneContainer?.classList.toggle("chat-view-location-sidebar", location === ViewContainerLocation.Sidebar);
    this.viewPaneContainer?.classList.toggle("chat-view-location-panel", location === ViewContainerLocation.Panel);
    this.viewPaneContainer?.classList.toggle("chat-view-position-left", position === Position.LEFT);
    this.viewPaneContainer?.classList.toggle("chat-view-position-right", position === Position.RIGHT);
    if (fromEvent) {
      this.relayout();
    }
  }
  registerListeners() {
    this._register(this.chatAgentService.onDidChangeAgents(() => this.onDidChangeAgents()));
    this._register(this.chatSessionsService.onDidCommitSession(async (e) => {
      if (!this.modelRef.value) {
        return;
      }
      if (!isEqual(e.original, this.modelRef.value.object.sessionResource)) {
        return;
      }
      const modelRef = await this.chatService.acquireOrLoadSession(e.committed, ChatAgentLocation.Chat, CancellationToken.None, "ChatViewPane#onDidCommitSession");
      await this.showModel(CancellationToken.None, modelRef);
    }));
    this._register(Event.any(
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("workbench.sideBar.location")),
      this.layoutService.onDidChangePanelPosition,
      this.layoutService.onDidChangePartVisibility,
      Event.filter(this.viewDescriptorService.onDidChangeContainerLocation, (e) => e.viewContainer === this.viewDescriptorService.getViewContainerByViewId(this.id))
    )(() => {
      this.updateContextKeys();
      this.updateViewPaneClasses(
        true
        /* layout here */
      );
    }));
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => {
      return e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION);
    })(() => this.updateViewPaneClasses(true)));
  }
  onDidChangeAgents() {
    if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
      if (!this._widget?.viewModel && !this.restoringSession) {
        this.restoringSession = this.acquireTransferredOrPersistedSession(CancellationToken.None, "ChatViewPane#onDidChangeAgents").then(async (modelRef) => {
          if (!this._widget) {
            return;
          }
          const wasVisible = this._widget.visible;
          try {
            this._widget.setVisible(false);
            await this.showModel(CancellationToken.None, modelRef, true, !modelRef);
          } finally {
            this._widget.setVisible(wasVisible);
          }
        });
        this.restoringSession.finally(() => this.restoringSession = void 0);
      }
    }
    this._onDidChangeViewWelcomeState.fire();
  }
  getTransferredOrPersistedSessionInfo() {
    if (this.chatService.transferredSessionResource) {
      return this.chatService.transferredSessionResource;
    }
    if (this.viewState.sessionResource) {
      return this.viewState.sessionResource;
    }
    return this.viewState.sessionId ? LocalChatSessionUri.forSession(this.viewState.sessionId) : void 0;
  }
  renderBody(parent) {
    super.renderBody(parent);
    this.telemetryService.publicLog2("chatViewPaneOpened");
    this.viewPaneContainer = parent;
    this.viewPaneContainer.classList.add("chat-viewpane");
    this.updateViewPaneClasses(false);
    const controlsWrapper = append(parent, $(".voice-agent-controls-wrapper"));
    this.createControls(controlsWrapper);
    this._voiceBarContainer = $(".voice-agent-bar-host");
    this._voiceBarContainer.style.display = "none";
    this._updateVoiceBar(this._voiceBarContainer);
    const inputContainerEl = this._widget.inputPart.inputContainerElement;
    if (inputContainerEl) {
      this._setupVoiceTranscriptOverlay(inputContainerEl);
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agents.voice.enabled")) {
        this._updateVoiceBar(this._voiceBarContainer);
      }
    }));
    this.setupContextMenu(parent);
    this.applyModel();
  }
  createControls(parent) {
    const sessionsControl = this.createSessionsControl(parent);
    const welcomeController = this.welcomeController = this._register(this.instantiationService.createInstance(ChatViewWelcomeController, parent, this, ChatAgentLocation.Chat));
    const chatWidget = this.createChatControl(parent);
    this.registerControlsListeners(sessionsControl, chatWidget, welcomeController);
    this.updateSessionsControlVisibility();
  }
  _updateVoiceBar(container) {
    this._voiceBarDisposables.clear();
    container.replaceChildren();
    container.style.display = "none";
    if (this.configurationService.getValue("agents.voice.enabled")) {
      this._voiceBarDisposables.add(CommandsRegistry.registerCommand("_chat.voice.acceptInput", (accessor, text) => {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const focusedWidget = chatWidgetService.lastFocusedWidget;
        const widget = focusedWidget?.hasInputFocus() ? focusedWidget : this._widget;
        if (text && widget?.viewModel) {
          if (widget.viewModel.editing) {
            widget.input.setValue(text, false);
          } else {
            return widget.acceptInput(combineVoiceInput(widget.getInput(), text), {
              preserveFocus: true,
              isVoiceModeInput: this.configurationService.getValue(VOICE_AGENT_PROGRESS_SETTING) === true
            });
          }
        }
        return void 0;
      }));
      this._voiceBarDisposables.add(CommandsRegistry.registerCommand("_chat.voice.switchToSession", async (_accessor, resourceStr) => {
        if (!resourceStr) {
          return false;
        }
        try {
          const resource = URI.parse(resourceStr);
          this.viewState.sessionResource = resource;
          this.applyModel();
          await this.restoringSession;
          const restoredResource = this._widget?.viewModel?.sessionResource;
          return !!restoredResource && isEqual(restoredResource, resource);
        } catch {
          return false;
        }
      }));
      this._voiceBarDisposables.add(CommandsRegistry.registerCommand("_chat.voice.getCurrentSession", (_accessor) => {
        return this._widget?.viewModel?.sessionResource?.toString();
      }));
      this._voiceBarDisposables.add(CommandsRegistry.registerCommand("_chat.voice.selectModel", (_accessor, requestedModel) => {
        const widget = this._getVoiceActionWidget();
        if (!widget) {
          return { ok: false, reason: "no_input" };
        }
        const resolved = resolveVoiceModel(widget.inputPart.availableLanguageModels, requestedModel);
        if (!resolved.ok || !resolved.identifier) {
          return resolved;
        }
        return widget.inputPart.switchModelByIdentifier(resolved.identifier, true, true) ? resolved : { ok: false, reason: "selection_failed", available_models: resolved.available_models };
      }));
    }
  }
  _getVoiceActionWidget() {
    const target = this._currentVoiceInputResource();
    return target ? this.chatWidgetService.getWidgetBySessionResource(target) : this._widget;
  }
  /**
   * The single chat input voice mode is currently bound to. Mirrors the routing
   * used by `_chat.voice.acceptInput`: an explicit target session (set by the
   * floating aux window) wins, otherwise the last-focused chat widget's session,
   * falling back to this pane's own session. The glow / transcript render only on
   * the pane whose session matches this, so with several chat inputs open (e.g.
   * this pane plus a chat editor) exactly one lights up.
   */
  _currentVoiceInputResource(reader) {
    const omniInputOpen = reader ? this.voiceSessionController.omniInputOpen.read(reader) : this.voiceSessionController.omniInputOpen.get();
    if (omniInputOpen) {
      return void 0;
    }
    const target = reader ? this.voiceSessionController.targetSession.read(reader) : this.voiceSessionController.targetSession.get();
    if (target) {
      return target;
    }
    const focused = reader ? this._focusedSessionResource.read(reader) : this._focusedSessionResource.get();
    return focused ?? this._widget?.viewModel?.sessionResource;
  }
  _setupVoiceTranscriptOverlay(inputContainerEl) {
    inputContainerEl.style.position = "relative";
    const showTranscriptSetting = observableFromEvent(
      this,
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("agents.voice.showTranscript")),
      () => this.configurationService.getValue("agents.voice.showTranscript") !== false
    );
    const showLiveTranscriptSetting = observableFromEvent(
      this,
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("agents.voice.liveTranscript")),
      () => this.configurationService.getValue("agents.voice.liveTranscript") !== false
    );
    const inputValue = observableFromEvent(
      this,
      this._widget.inputEditor.onDidChangeModelContent,
      () => this._widget.getInput()
    );
    const transcriptOverlay = $(".voice-transcript-overlay");
    const transcriptScrollable = this._register(new DomScrollableElement(transcriptOverlay, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto
    }));
    const transcriptOverlayNode = transcriptScrollable.getDomNode();
    transcriptOverlayNode.classList.add("voice-transcript-overlay-scrollable");
    transcriptOverlayNode.style.display = "none";
    inputContainerEl.append(transcriptOverlayNode);
    let animFrameId;
    const glowDataArrayRef = { value: void 0 };
    const win = getWindow(inputContainerEl);
    const glowController = this._register(createVoiceGlowController(
      inputContainerEl,
      () => isDark(this.themeService.getColorTheme().type) ? "dark" : "light",
      () => resolveVoiceGlowColors(this.themeService.getColorTheme())
    ));
    this._register(this.themeService.onDidColorThemeChange(() => glowController.refreshTheme()));
    const getEffectiveVoice = () => {
      const sim = this.voiceInputModeService.simulatedVoiceState.get();
      if (sim === "idle" || sim === "listening" || sim === "speaking") {
        return { connected: true, voiceState: sim, simulating: true };
      }
      if (sim === "off" || sim === "connecting" || sim === "dictating") {
        return { connected: false, voiceState: "idle", simulating: true };
      }
      return {
        connected: this.voiceSessionController.isConnected.get(),
        voiceState: this.voiceSessionController.voiceState.get(),
        simulating: false
      };
    };
    const startGlowAnimation = () => {
      if (animFrameId !== void 0) {
        return;
      }
      const animate = () => {
        animFrameId = win.requestAnimationFrame(animate);
        const { connected, voiceState, simulating } = getEffectiveVoice();
        const currentSession = this._currentSessionResource.get();
        const boundResource = this._currentVoiceInputResource();
        const isOwner = !!currentSession && !!boundResource && isEqual(currentSession, boundResource);
        const glowActive = connected && isGlowingVoiceState(voiceState) && (simulating || isOwner);
        if (!glowActive) {
          glowController.clear();
          return;
        }
        const analyser = this.ttsPlaybackService.analyserNode ?? (voiceState === "listening" ? this.micCaptureService.analyserNode : null) ?? null;
        let intensity;
        if (!analyser && simulating) {
          const t = Date.now() / 1e3;
          intensity = Math.min(1, 0.28 + 0.34 * Math.abs(Math.sin(t * 6.1)) + 0.22 * Math.abs(Math.sin(t * 11.3 + 1)));
        } else {
          intensity = readVoiceGlowIntensity(analyser, glowDataArrayRef);
        }
        glowController.render(voiceState, intensity, this.accessibilityService.isMotionReduced());
      };
      animFrameId = win.requestAnimationFrame(animate);
    };
    const stopGlowAnimation = () => {
      if (animFrameId !== void 0) {
        win.cancelAnimationFrame(animFrameId);
        animFrameId = void 0;
      }
      glowController.clear();
    };
    this._register(autorun((reader) => {
      const connected = this.voiceSessionController.isConnected.read(reader);
      const voiceState = this.voiceSessionController.voiceState.read(reader);
      const omniInputOpen = this.voiceSessionController.omniInputOpen.read(reader);
      const sim = this.voiceInputModeService.simulatedVoiceState.read(reader);
      const simGlow = sim === "listening" || sim === "speaking";
      if (!omniInputOpen && (simGlow || connected && isGlowingVoiceState(voiceState))) {
        startGlowAnimation();
      } else {
        stopGlowAnimation();
      }
    }));
    this._register({ dispose: () => stopGlowAnimation() });
    let listeningSession;
    let ownerSession;
    this._register(autorun((reader) => {
      const simState = this.voiceInputModeService.simulatedVoiceState.read(reader);
      const simVersion = this.voiceInputModeService.simulatedVersion.read(reader);
      if (simState !== void 0) {
        if (simState === "idle" && simVersion) {
          transcriptOverlayNode.style.display = "";
          transcriptOverlayNode.classList.remove("has-transcript");
          transcriptOverlay.replaceChildren();
          const hint = $("span.partial");
          switch (simVersion) {
            case "handsFree":
              hint.textContent = localize("voiceMode.simHint.handsFree", "Hands-free \u2014 just start talking");
              break;
            case "keyboardHold": {
              const kbLabel = this.keybindingService.lookupKeybinding("workbench.action.chat.voiceInputMode.holdToTalk")?.getLabel();
              hint.textContent = kbLabel ? localize("voiceMode.pttHint", "Hold {0} to talk", kbLabel) : localize("voiceMode.simHint.keyboardHold", "Hold Space to talk");
              break;
            }
            case "buttonHold":
              hint.textContent = localize("voiceMode.simHint.buttonHold", "Hold the button to talk, tap to turn off");
              break;
            case "clickToggle":
              hint.textContent = localize("voiceMode.simHint.clickToggle", "Tap the button to start listening");
              break;
          }
          transcriptOverlay.append(hint);
          transcriptScrollable.scanDomNode();
        } else {
          transcriptOverlayNode.style.display = "none";
          transcriptOverlayNode.classList.remove("has-transcript");
        }
        return;
      }
      const turns = this.voiceSessionController.transcriptTurns.read(reader);
      const connected = this.voiceSessionController.isConnected.read(reader);
      const voiceState = this.voiceSessionController.voiceState.read(reader);
      const omniInputOpen = this.voiceSessionController.omniInputOpen.read(reader);
      const targetSession = this.voiceSessionController.targetSession.read(reader);
      const currentSession = this._currentSessionResource.read(reader);
      const showTranscript = showTranscriptSetting.read(reader);
      const showLiveTranscript = showLiveTranscriptSetting.read(reader);
      const hasInput = inputValue.read(reader).length > 0;
      const visible = turns.filter((t) => t.text.length > 0 || t.speaker === "user" && t.isPartial);
      const showListeningPlaceholder = voiceState === "listening" && (!showTranscript || !showLiveTranscript);
      if (!connected || omniInputOpen) {
        listeningSession = void 0;
        ownerSession = void 0;
        transcriptOverlayNode.style.display = "none";
        transcriptOverlayNode.classList.remove("has-transcript");
        return;
      }
      if (voiceState === "listening") {
        if (!listeningSession) {
          listeningSession = targetSession ?? currentSession;
          ownerSession = listeningSession;
        } else if (!targetSession && currentSession && !isEqual(currentSession, listeningSession)) {
          const dictationSession = listeningSession;
          const activelyDictating = turns.some((t) => t.speaker === "user" && t.isPartial && t.text.trim().length > 0);
          if (activelyDictating) {
            this.voiceSessionController.finishListeningAndSubmitTo(dictationSession);
            listeningSession = void 0;
          } else if (isUntitledChatSession(currentSession)) {
            listeningSession = currentSession;
            ownerSession = currentSession;
          } else {
            this.voiceSessionController.discardListening();
            listeningSession = void 0;
          }
        }
      } else {
        listeningSession = void 0;
      }
      const boundResource = this._currentVoiceInputResource(reader);
      if (boundResource && currentSession && !isEqual(boundResource, currentSession)) {
        transcriptOverlayNode.style.display = "none";
        transcriptOverlayNode.classList.remove("has-transcript");
        return;
      }
      const effectiveOwner = targetSession ?? ownerSession;
      if (effectiveOwner && currentSession && !isEqual(effectiveOwner, currentSession)) {
        transcriptOverlayNode.style.display = "none";
        transcriptOverlayNode.classList.remove("has-transcript");
        return;
      }
      if (visible.length === 0 || !showTranscript || showListeningPlaceholder) {
        if (hasInput) {
          transcriptOverlayNode.style.display = "none";
          transcriptOverlayNode.classList.remove("has-transcript");
          return;
        }
        const handsFree = this.configurationService.getValue("agents.voice.handsFree") === true;
        if (showListeningPlaceholder) {
          transcriptOverlayNode.style.display = "";
          transcriptOverlayNode.classList.remove("has-transcript");
          transcriptOverlay.replaceChildren();
          const listening = $("span.listening");
          listening.textContent = localize("voiceMode.listening", "Listening...");
          transcriptOverlay.append(listening);
          transcriptScrollable.scanDomNode();
        } else if (!showTranscript && voiceState === "speaking") {
          transcriptOverlayNode.style.display = "";
          transcriptOverlayNode.classList.remove("has-transcript");
          transcriptOverlay.replaceChildren();
          const hint = $("span.partial");
          const kb = this.keybindingService.lookupKeybinding("workbench.action.chat.voiceInputMode.holdToTalk") ?? this.keybindingService.lookupKeybinding("agentsVoice.pushToTalk");
          const kbLabel = kb?.getLabel();
          hint.textContent = kbLabel ? localize("voiceMode.bargeInHint", "Speak or use {0}", kbLabel) : localize("voiceMode.bargeInHintNoKb", "Speak to barge in");
          transcriptOverlay.append(hint);
          transcriptScrollable.scanDomNode();
        } else if (voiceState === "idle" && visible.length === 0 && showTranscript && !handsFree) {
          transcriptOverlayNode.style.display = "";
          transcriptOverlayNode.classList.remove("has-transcript");
          transcriptOverlay.replaceChildren();
          const hint = $("span.partial");
          const kb = this.keybindingService.lookupKeybinding("agentsVoice.pushToTalk");
          const kbLabel = kb?.getLabel();
          hint.textContent = kbLabel ? localize("voiceMode.pttOrBargeInHint", "Press {0} to talk or barge in", kbLabel) : localize("voiceMode.clickMicOrBargeInHint", "Click voice mode to talk or barge in");
          transcriptOverlay.append(hint);
          transcriptScrollable.scanDomNode();
        } else {
          transcriptOverlayNode.style.display = "none";
          transcriptOverlayNode.classList.remove("has-transcript");
        }
        return;
      }
      transcriptOverlayNode.style.display = "";
      transcriptOverlayNode.classList.add("has-transcript");
      const lastTurn = visible[visible.length - 1];
      const contentElements = [];
      if (lastTurn.speaker === "user") {
        const span = $("span");
        if (lastTurn.isPartial) {
          const committedPart = lastTurn.committed || "";
          const unsurePart = lastTurn.text.slice(committedPart.length);
          if (committedPart) {
            const c = $("span.committed");
            c.textContent = committedPart;
            span.append(c);
          }
          const u = $("span.partial");
          u.textContent = unsurePart + "\u2589";
          span.append(u);
        } else {
          span.className = "committed";
          span.textContent = lastTurn.text;
        }
        contentElements.push(span);
      } else {
        const div = $("div.assistant-text");
        div.textContent = lastTurn.text;
        contentElements.push(div);
      }
      transcriptOverlay.replaceChildren(...contentElements);
      transcriptScrollable.scanDomNode();
      transcriptScrollable.setScrollPosition({ scrollTop: 0 });
    }));
  }
  get agentSessionsControl() {
    return this.sessionsControl;
  }
  createSessionsControl(parent) {
    const sessionsContainer = this.sessionsContainer = parent.appendChild($(".agent-sessions-container"));
    const sessionsTitleContainer = this.sessionsTitleContainer = append(sessionsContainer, $(".agent-sessions-title-container"));
    const sessionsTitle = this.sessionsTitle = append(sessionsTitleContainer, $("span.agent-sessions-title"));
    sessionsTitle.textContent = localize("sessions", "Sessions");
    this._register(addDisposableListener(sessionsTitle, EventType.CLICK, () => {
      this.sessionsControl?.scrollToTop();
      this.sessionsControl?.focus();
    }));
    const sessionsToolbarContainer = append(sessionsTitleContainer, $(".agent-sessions-toolbar"));
    const sessionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionsToolbarContainer, MenuId.AgentSessionsToolbar, {
      menuOptions: { shouldForwardArgs: true }
    }));
    const sessionsFilter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {
      filterMenuId: MenuId.AgentSessionsViewerFilterSubMenu,
      groupResults: () => this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked ? AgentSessionsGrouping.Capped : AgentSessionsGrouping.Date
    }));
    this._register(Event.runAndSubscribe(sessionsFilter.onDidChange, () => {
      sessionsToolbarContainer.classList.toggle("filtered", !sessionsFilter.isDefault());
    }));
    const newSessionButtonContainer = this.sessionsNewButtonContainer = append(sessionsContainer, $(".agent-sessions-new-button-container"));
    const newSessionButton = this._register(new Button(newSessionButtonContainer, { ...defaultButtonStyles, secondary: true }));
    newSessionButton.label = localize("newSession", "New Session");
    this._register(newSessionButton.onDidClick(() => this.commandService.executeCommand(ACTION_ID_NEW_CHAT, this.getActionsContext())));
    this.sessionsControlContainer = append(sessionsContainer, $(".agent-sessions-control-container"));
    const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsControlContainer, {
      source: "chatViewPane",
      filter: sessionsFilter,
      overrideStyles: this.getLocationBasedColors().listOverrideStyles,
      getHoverPosition: () => this.getSessionHoverPosition(),
      trackActiveEditorSession: () => {
        return !this._widget || this._widget.isEmpty();
      },
      overrideSessionOpenOptions: (openEvent) => {
        if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked && !openEvent.sideBySide) {
          return { ...openEvent, editorOptions: {
            ...openEvent.editorOptions,
            preserveFocus: false
            /* focus the chat widget when opening from stacked sessions viewer since this closes the stacked viewer */
          } };
        }
        return openEvent;
      }
    }));
    this._register(this.onDidChangeBodyVisibility((visible) => sessionsControl.setVisible(visible)));
    sessionsToolbar.context = sessionsControl;
    this._register(this.hostService.onDidChangeFocus((hasFocus) => {
      if (hasFocus) {
        sessionsControl.refresh();
      }
    }));
    this._register(Event.runAndSubscribe(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsOrientation)), (e) => {
      const newSessionsViewerOrientationConfiguration = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
      this.doUpdateConfiguredSessionsViewerOrientation(newSessionsViewerOrientationConfiguration, { updateConfiguration: false, layout: !!e });
    }));
    return sessionsControl;
  }
  getSessionsViewerOrientation() {
    return this.sessionsViewerOrientation;
  }
  updateConfiguredSessionsViewerOrientation(orientation) {
    return this.doUpdateConfiguredSessionsViewerOrientation(orientation, { updateConfiguration: true, layout: true });
  }
  doUpdateConfiguredSessionsViewerOrientation(orientation, options) {
    const oldSessionsViewerOrientationConfiguration = this.sessionsViewerOrientationConfiguration;
    let validatedOrientation;
    if (orientation === "stacked" || orientation === "sideBySide") {
      validatedOrientation = orientation;
    } else {
      validatedOrientation = "sideBySide";
    }
    this.sessionsViewerOrientationConfiguration = validatedOrientation;
    if (oldSessionsViewerOrientationConfiguration === this.sessionsViewerOrientationConfiguration) {
      return;
    }
    if (options.updateConfiguration) {
      this.configurationService.updateValue(ChatConfiguration.ChatViewSessionsOrientation, validatedOrientation);
    }
    if (options.layout) {
      this.relayout();
    }
  }
  updateSessionsControlVisibility() {
    if (!this.sessionsContainer || !this.viewPaneContainer) {
      return { changed: false, visible: false };
    }
    let newSessionsContainerVisible;
    if (!this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled)) {
      newSessionsContainerVisible = false;
    } else {
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        newSessionsContainerVisible = (!!this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.hasByokModels) && // chat is setup (otherwise make room for terms and welcome)
        (!this._widget || this._widget.isEmpty() && !!this._widget.viewModel && !this._widget.viewModel.model.title) && // chat widget empty (but not when model is loading or has a title)
        this._sessionsListSuppressionCount === 0 && // not mid-transition (a slow session transiently shows an empty widget)
        !this.welcomeController?.isShowingWelcome.get();
      } else {
        newSessionsContainerVisible = !this.welcomeController?.isShowingWelcome.get() && // welcome not showing
        !!this.lastDimensions && this.lastDimensions.width >= ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH;
      }
    }
    this.viewPaneContainer.classList.toggle("has-sessions-control", newSessionsContainerVisible);
    const sessionsContainerVisible = this.sessionsContainer.style.display !== "none";
    setVisibility(newSessionsContainerVisible, this.sessionsContainer);
    this.sessionsViewerVisible = newSessionsContainerVisible;
    this.sessionsViewerVisibilityContext.set(newSessionsContainerVisible);
    return {
      changed: sessionsContainerVisible !== newSessionsContainerVisible,
      visible: newSessionsContainerVisible
    };
  }
  refreshSessionsControlVisibility() {
    const { changed } = this.updateSessionsControlVisibility();
    if (changed) {
      this.relayout();
    }
  }
  /**
   * Suppresses the sessions list until the returned disposable is disposed.
   * Used to span a whole session transition (e.g. a "Continue in…" migration:
   * load → materializing send → rebind) so the transiently-empty widget never
   * falls back to the list.
   */
  beginSessionsListSuppression() {
    this._sessionsListSuppressionCount++;
    this.refreshSessionsControlVisibility();
    return toDisposable(() => {
      this._sessionsListSuppressionCount--;
      this.refreshSessionsControlVisibility();
    });
  }
  getFocusedSessions() {
    return this.sessionsControl?.getFocus() ?? [];
  }
  get widget() {
    return this._widget;
  }
  createChatControl(parent) {
    const chatControlsContainer = append(parent, $(".chat-controls-container"));
    const locationBasedColors = this.getLocationBasedColors();
    const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatControlsContainer)).appendChild($(".chat-editor-overflow.monaco-editor"));
    this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
    this.createChatTitleControl(chatControlsContainer);
    const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this._widget = this._register(scopedInstantiationService.createInstance(
      ChatWidget,
      ChatAgentLocation.Chat,
      { viewId: this.id },
      {
        autoScroll: (mode) => mode !== ChatModeKind.Ask,
        renderFollowups: true,
        supportsFileReferences: true,
        clear: () => this.clear(),
        enableFind: true,
        rendererOptions: {
          renderTextEditsAsSummary: (uri) => {
            return true;
          },
          referencesExpandedWhenEmptyResponse: false,
          progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask
        },
        editorOverflowWidgetsDomNode,
        enableImplicitContext: true,
        enableWorkingSet: "explicit",
        supportsChangingModes: true,
        dndContainer: parent
      },
      {
        listForeground: SIDE_BAR_FOREGROUND,
        listBackground: locationBasedColors.background,
        overlayBackground: locationBasedColors.overlayBackground,
        inputEditorBackground: locationBasedColors.background,
        resultEditorBackground: editorBackground
      }
    ));
    this._widget.render(chatControlsContainer, parent);
    const updateWidgetVisibility = (reader) => this._widget.setVisible(this.isBodyVisible() && !this.welcomeController?.isShowingWelcome.read(reader));
    this._register(this.onDidChangeBodyVisibility(() => updateWidgetVisibility()));
    this._register(autorun((reader) => updateWidgetVisibility(reader)));
    return this._widget;
  }
  createChatTitleControl(parent) {
    this.titleControl = this._register(this.instantiationService.createInstance(
      ChatViewTitleControl,
      parent,
      {
        focusChat: () => this._widget.focusInput()
      }
    ));
    this._register(this.titleControl.onDidChangeHeight(() => {
      this.relayout();
    }));
  }
  //#endregion
  registerControlsListeners(sessionsControl, chatWidget, welcomeController) {
    const hasByokModelsContextKeys = /* @__PURE__ */ new Set([ChatEntitlementContextKeys.hasByokModels.key]);
    this._register(Event.any(
      chatWidget.onDidChangeEmptyState,
      Event.fromObservable(welcomeController.isShowingWelcome),
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled)),
      Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(hasByokModelsContextKeys))
    )(() => {
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        sessionsControl.clearFocus();
      }
      const { changed: visibilityChanged } = this.updateSessionsControlVisibility();
      if (visibilityChanged) {
        this.relayout();
      }
    }));
    this._register(chatWidget.onDidChangeViewModel(() => {
      const model = chatWidget.viewModel?.model;
      this.titleControl?.update(model);
      this._currentSessionResource.set(chatWidget.viewModel?.sessionResource, void 0);
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        return;
      }
      const sessionResource = chatWidget.viewModel?.sessionResource;
      if (sessionResource) {
        const revealed = sessionsControl.reveal(sessionResource);
        if (!revealed) {
          sessionsControl.clearFocus();
        }
      }
    }));
    this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        return;
      }
      if (sessionsControl.hasFocusOrSelection()) {
        return;
      }
      const sessionResource = chatWidget.viewModel?.sessionResource;
      if (sessionResource) {
        sessionsControl.reveal(sessionResource);
      }
    }));
    this._register(this.agentSessionsService.model.onDidChangeSessionArchivedState((e) => {
      if (e.isArchived()) {
        const currentSessionResource = chatWidget.viewModel?.sessionResource;
        if (currentSessionResource && isEqual(currentSessionResource, e.resource)) {
          this.clear();
        }
      }
    }));
    this._register(autorun((reader) => {
      chatWidget.inputPart.height.read(reader);
      if (this.sessionsViewerVisible && this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        this.relayoutForInputHeight();
      }
    }));
    const progressBadgeDisposables = this._register(new MutableDisposable());
    const updateProgressBadge = () => {
      progressBadgeDisposables.value = new DisposableStore();
      if (!this.configurationService.getValue(ChatConfiguration.ChatViewProgressBadgeEnabled)) {
        this.activityBadge.clear();
        return;
      }
      const model = chatWidget.viewModel?.model;
      if (model) {
        progressBadgeDisposables.value.add(autorun((reader) => {
          if (model.requestInProgress.read(reader)) {
            this.activityBadge.value = this.activityService.showViewActivity(this.id, {
              badge: new ProgressBadge(() => localize("sessionInProgress", "Agent Session in Progress"))
            });
          } else {
            this.activityBadge.clear();
          }
        }));
      } else {
        this.activityBadge.clear();
      }
    };
    this._register(chatWidget.onDidChangeViewModel(() => updateProgressBadge()));
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.ChatViewProgressBadgeEnabled))(() => updateProgressBadge()));
    updateProgressBadge();
  }
  setupContextMenu(parent) {
    this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => {
      EventHelper.stop(e, true);
      this.contextMenuService.showContextMenu({
        menuId: MenuId.ChatWelcomeContext,
        contextKeyService: this.contextKeyService,
        getAnchor: () => new StandardMouseEvent(getWindow(parent), e)
      });
    }));
  }
  //#region Model Management
  applyModel() {
    this._applyModelCts.value?.cancel();
    const cts = this._applyModelCts.value = new CancellationTokenSource();
    this.restoringSession = this._applyModel(cts.token).catch((err) => {
      if (!isCancellationError(err)) {
        this.logService.error("ChatViewPane#applyModel failed", err);
      }
    });
    this.restoringSession.finally(() => this.restoringSession = void 0);
  }
  async _applyModel(token) {
    const modelRef = await this.acquireTransferredOrPersistedSession(token, "ChatViewPane#applyModel");
    await this.showModel(token, modelRef, true, !modelRef);
  }
  /**
   * Force-start a new local chat session in the view, bypassing the
   * default-provider override applied by `showModel()`. Used by the
   * picker when the user explicitly selects "Local", and by New Local Chat.
   */
  async startNewLocalSession() {
    this._applyModelCts.value?.cancel();
    const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: "ChatViewPane#startNewLocalSession" });
    return this.showModel(CancellationToken.None, ref);
  }
  /**
   * When the remembered or computed default session type is a non-local
   * provider (for example when the agent host is enabled), return a new session
   * reference for it instead of the built-in local provider. Returns
   * `undefined` to fall back to `startNewLocalSession`.
   */
  async acquireDefaultNewSession(token) {
    const workspace = this.workspaceContextService.getWorkspace();
    const defaultType = getDefaultNewChatSessionType(this.configurationService, this.chatSessionsService, this.storageService, workspace, this.agentHostEnablementService.enabled.get());
    if (defaultType === localChatSessionType) {
      return void 0;
    }
    const resource = getDefaultNewChatSessionResource(this.configurationService, this.chatSessionsService, this.storageService, workspace, this.agentHostEnablementService.enabled.get());
    try {
      return await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, "ChatViewPane#acquireDefaultNewSession");
    } catch (error) {
      if (isCancellationError(error)) {
        throw error;
      }
      this.logService.warn(`[ChatViewPane] Failed to acquire default agent-host session, falling back to local`, error);
      return void 0;
    }
  }
  async acquireTransferredOrPersistedSession(token, debugOwner) {
    const sessionResource = this.getTransferredOrPersistedSessionInfo();
    if (!sessionResource) {
      return void 0;
    }
    const modelRef = await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, token, debugOwner);
    if (!modelRef) {
      return void 0;
    }
    if (this.shouldSkipRestoredLocalSession(sessionResource, modelRef.object)) {
      modelRef.dispose();
      return void 0;
    }
    return modelRef;
  }
  shouldSkipRestoredLocalSession(sessionResource, model) {
    const workspace = this.workspaceContextService.getWorkspace();
    const defaultType = getDefaultNewChatSessionType(this.configurationService, this.chatSessionsService, this.storageService, workspace, this.agentHostEnablementService.enabled.get());
    return defaultType !== localChatSessionType && getChatSessionType(sessionResource) === localChatSessionType && !model.hasRequests;
  }
  async showModel(token, modelRef, startNewSession = true, ignoreTransferredSession = false, inputBeforeLoad) {
    const oldModelResource = this._widget.viewModel?.sessionResource;
    if (oldModelResource) {
      this.widgetViewStates.set(getComparisonKey(oldModelResource), this._widget.getViewState());
    }
    this.modelRef.value = void 0;
    const baselineInput = inputBeforeLoad ?? this._widget?.getInput() ?? "";
    let ref;
    if (startNewSession) {
      if (modelRef) {
        ref = modelRef;
      } else if (!ignoreTransferredSession && this.chatService.transferredSessionResource) {
        ref = await this.chatService.acquireOrLoadSession(this.chatService.transferredSessionResource, ChatAgentLocation.Chat, token, "ChatViewPane#showModel");
      } else {
        ref = await this.acquireDefaultNewSession(token) ?? this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: "ChatViewPane#showModel" });
      }
      if (!ref) {
        throw new Error("Could not start chat session");
      }
    }
    if (token.isCancellationRequested) {
      ref?.dispose();
      return void 0;
    }
    this.modelRef.value = ref;
    const model = ref?.object;
    if (model) {
      await this.updateWidgetLockState(getChatSessionType(model.sessionResource));
      if (token.isCancellationRequested) {
        this.modelRef.value = void 0;
        return void 0;
      }
      this.viewState.sessionResource = model.sessionResource;
    }
    if (model) {
      setModelPreservingInputTypedWhileLoading(this._widget, baselineInput, () => this._widget.setModel(model));
      const widgetViewState = this.widgetViewStates.get(getComparisonKey(model.sessionResource));
      if (widgetViewState) {
        this._widget.restoreViewState(widgetViewState);
      }
    } else {
      this._widget.setModel(model);
    }
    this.titleControl?.update(model);
    this.updateActions();
    if (oldModelResource) {
      const capturedOldResource = oldModelResource;
      this._register(disposableTimeout(() => {
        const oldSession = this.agentSessionsService.model.getSession(capturedOldResource);
        if (oldSession && !oldSession.isMarkedUnread()) {
          oldSession.setRead(true);
        }
      }, 0));
    }
    return model;
  }
  async updateWidgetLockState(sessionType) {
    if (sessionType === localChatSessionType) {
      this._widget.unlockFromCodingAgent();
      return;
    }
    let canResolve = false;
    try {
      canResolve = await this.chatSessionsService.canResolveChatSession(sessionType);
    } catch (error) {
      this.logService.warn(`Failed to resolve chat session type '${sessionType}' for locking`, error);
    }
    if (!canResolve) {
      this._widget.unlockFromCodingAgent();
      return;
    }
    const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
    if (contribution) {
      this._widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType, contribution.agentHostProviderId);
    } else {
      this._widget.unlockFromCodingAgent();
    }
  }
  async clear() {
    this.loadSessionCts.value?.cancel();
    this.updateViewState();
    await this.showModel(CancellationToken.None);
    this.updateActions();
  }
  async loadSession(sessionResource) {
    const t0 = Date.now();
    this.logService.trace(`[ChatViewPane] loadSession start uri=${sessionResource.toString()}`);
    const inputBeforeLoad = this._widget?.getInput() ?? "";
    this.loadSessionCts.value?.cancel();
    const cts = this.loadSessionCts.value = new CancellationTokenSource();
    const token = cts.token;
    if (this.restoringSession) {
      await this.restoringSession;
    }
    if (token.isCancellationRequested) {
      this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=preAcquire`);
      return void 0;
    }
    return this.progressService.withProgress({ location: ChatViewId, delay: 200 }, async () => {
      let queue = Promise.resolve();
      const clearWidget = disposableTimeout(() => {
        if (token.isCancellationRequested || this.loadSessionCts.value !== cts) {
          return;
        }
        queue = this.showModel(token, void 0, false).then(() => {
        });
      }, 100);
      const clearWidgetCancellationListener = token.onCancellationRequested(() => clearWidget.dispose());
      try {
        const newModelRef = await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, token, "ChatViewPane#loadSession");
        clearWidget.dispose();
        await queue;
        if (token.isCancellationRequested) {
          newModelRef?.dispose();
          this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=postAcquire`);
          return void 0;
        }
        const result = await this.showModel(token, newModelRef, true, false, inputBeforeLoad);
        this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()}`);
        return result;
      } catch (err) {
        clearWidget.dispose();
        await queue;
        if (token.isCancellationRequested) {
          this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=error`);
          return void 0;
        }
        this.logService.error(`Failed to load chat session '${sessionResource.toString()}'`, err);
        this.notificationService.error(localize("chat.loadSessionFailed", "Failed to open chat session: {0}", toErrorMessage(err)));
        const result = await this.showModel(token, void 0, true, false, inputBeforeLoad);
        this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} error=true`);
        return result;
      } finally {
        clearWidgetCancellationListener.dispose();
      }
    });
  }
  //#endregion
  focus() {
    super.focus();
    this.focusInput();
  }
  focusInput() {
    this._widget.focusInput();
  }
  focusSessions() {
    if (this.sessionsContainer?.style.display === "none") {
      return false;
    }
    this.sessionsControl?.focus();
    return true;
  }
  relayout() {
    if (!this._widget?.visible) {
      return;
    }
    if (this.lastDimensions) {
      this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
    }
  }
  relayoutForInputHeight() {
    if (this.layoutingBody || !this._widget?.visible || !this.lastDimensions) {
      return;
    }
    this.layoutChatAndSessions(this.lastDimensions.height, this.lastDimensions.width, false);
  }
  layoutBody(height, width) {
    if (this.layoutingBody) {
      return;
    }
    this.layoutingBody = true;
    try {
      this.doLayoutBody(height, width);
    } finally {
      this.layoutingBody = false;
    }
  }
  doLayoutBody(height, width) {
    super.layoutBody(height, width);
    this.lastDimensions = { height, width };
    this.layoutChatAndSessions(height, width, true);
  }
  layoutChatAndSessions(height, width, layoutInput) {
    let remainingHeight = height;
    const remainingWidth = width;
    const titleHeight = this.titleControl?.getHeight() ?? 0;
    remainingHeight -= titleHeight;
    const { heightReduction, widthReduction } = this.layoutSessionsControl(remainingHeight, remainingWidth);
    const inputMaxHeight = this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked ? remainingHeight : void 0;
    if (layoutInput) {
      this._widget.setInputPartMaxHeightOverride(inputMaxHeight);
      this._widget.layout(remainingHeight - heightReduction, remainingWidth - widthReduction);
    } else {
      layoutChatWidgetForInputHeight(this._widget, inputMaxHeight, remainingHeight - heightReduction, remainingWidth - widthReduction);
    }
    this.lastDimensionsPerOrientation.set(this.sessionsViewerOrientation, { height, width });
  }
  layoutSessionsControl(height, width) {
    let heightReduction = 0;
    let widthReduction = 0;
    if (!this.sessionsContainer || !this.sessionsControlContainer || !this.sessionsControl || !this.viewPaneContainer || !this.sessionsTitleContainer || !this.sessionsTitle) {
      return { heightReduction, widthReduction };
    }
    const oldSessionsViewerOrientation = this.sessionsViewerOrientation;
    let newSessionsViewerOrientation;
    switch (this.sessionsViewerOrientationConfiguration) {
      // Stacked
      case "stacked":
        newSessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
        break;
      // Update orientation based on available width
      default:
        newSessionsViewerOrientation = width >= ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH ? AgentSessionsViewerOrientation.SideBySide : AgentSessionsViewerOrientation.Stacked;
    }
    this.sessionsViewerOrientation = newSessionsViewerOrientation;
    if (newSessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
      this.viewPaneContainer.classList.toggle("sessions-control-orientation-sidebyside", true);
      this.viewPaneContainer.classList.toggle("sessions-control-orientation-stacked", false);
      this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.SideBySide);
    } else {
      this.viewPaneContainer.classList.toggle("sessions-control-orientation-sidebyside", false);
      this.viewPaneContainer.classList.toggle("sessions-control-orientation-stacked", true);
      this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.Stacked);
    }
    if (oldSessionsViewerOrientation !== this.sessionsViewerOrientation) {
      const updatePromise = this.sessionsControl.update();
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
        updatePromise.then((didUpdate) => {
          if (!didUpdate) {
            return;
          }
          const sessionResource = this._widget?.viewModel?.sessionResource;
          if (sessionResource) {
            this.sessionsControl?.reveal(sessionResource);
          }
        });
      }
    }
    const { visible: sessionsContainerVisible } = this.updateSessionsControlVisibility();
    if (!sessionsContainerVisible || this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
      this.sessionsViewerSashDisposables.clear();
      this.sessionsViewerSash = void 0;
    } else if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
      if (!this.sessionsViewerSashDisposables.value && this.viewPaneContainer) {
        this.createSessionsViewerSash(this.viewPaneContainer, height, width);
      }
    }
    if (!sessionsContainerVisible) {
      return { heightReduction: 0, widthReduction: 0 };
    }
    const sessionsTitleHeight = this.sessionsTitleContainer.offsetHeight;
    let availableSessionsHeight = height - sessionsTitleHeight;
    let reservedChatWidgetHeight = 0;
    if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
      reservedChatWidgetHeight = Math.max(ChatViewPane.MIN_CHAT_WIDGET_HEIGHT, this._widget?.input?.height.get() ?? 0);
      availableSessionsHeight -= reservedChatWidgetHeight;
    } else {
      availableSessionsHeight -= this.sessionsNewButtonContainer?.offsetHeight ?? 0;
    }
    availableSessionsHeight = Math.max(0, availableSessionsHeight);
    if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
      const sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(width);
      this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
      this.sessionsControlContainer.style.width = `${sessionsViewerSidebarWidth}px`;
      this.sessionsControl.layout(availableSessionsHeight, sessionsViewerSidebarWidth);
      this.sessionsViewerSash?.layout();
      heightReduction = 0;
      widthReduction = sessionsViewerSidebarWidth + ChatViewPane.SESSIONS_SIDEBAR_BORDER_WIDTH;
    } else {
      this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
      this.sessionsControlContainer.style.width = ``;
      this.sessionsControl.layout(availableSessionsHeight, width);
      heightReduction = sessionsTitleHeight + availableSessionsHeight;
      widthReduction = 0;
    }
    return { heightReduction, widthReduction };
  }
  computeEffectiveSideBySideSessionsSidebarWidth(width, sessionsViewerSidebarWidth = this.sessionsViewerSidebarWidth) {
    return Math.max(
      ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH,
      // never smaller than min width for side by side sessions
      Math.min(
        sessionsViewerSidebarWidth,
        width - ChatViewPane.CHAT_WIDGET_DEFAULT_WIDTH
        // never so wide that chat widget is smaller than default width
      )
    );
  }
  getLastDimensions(orientation) {
    return this.lastDimensionsPerOrientation.get(orientation);
  }
  createSessionsViewerSash(container, height, width) {
    const disposables = this.sessionsViewerSashDisposables.value = new DisposableStore();
    const sash = this.sessionsViewerSash = disposables.add(new Sash(container, {
      getVerticalSashLeft: () => {
        const sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(this.lastDimensions?.width ?? width);
        const { position } = this.getViewPositionAndLocation();
        if (position === Position.RIGHT) {
          return (this.lastDimensions?.width ?? width) - sessionsViewerSidebarWidth;
        }
        return sessionsViewerSidebarWidth;
      }
    }, { orientation: Orientation.VERTICAL }));
    let sashStartWidth;
    disposables.add(sash.onDidStart(() => sashStartWidth = this.sessionsViewerSidebarWidth));
    disposables.add(sash.onDidEnd(() => sashStartWidth = void 0));
    disposables.add(sash.onDidChange((e) => {
      if (sashStartWidth === void 0 || !this.lastDimensions) {
        return;
      }
      const { position } = this.getViewPositionAndLocation();
      const delta = e.currentX - e.startX;
      const newWidth = position === Position.RIGHT ? sashStartWidth - delta : sashStartWidth + delta;
      if (newWidth < ChatViewPane.SESSIONS_SIDEBAR_SNAP_THRESHOLD) {
        this.updateConfiguredSessionsViewerOrientation("stacked");
        return;
      }
      this.sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(this.lastDimensions.width, newWidth);
      this.viewState.sessionsSidebarWidth = this.sessionsViewerSidebarWidth;
      this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
    }));
    disposables.add(sash.onDidReset(() => {
      this.sessionsViewerSidebarWidth = ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH;
      this.viewState.sessionsSidebarWidth = this.sessionsViewerSidebarWidth;
      this.relayout();
    }));
  }
  //#endregion
  saveState() {
    if (this._widget?.viewModel) {
      this._widget.saveState();
      this.updateViewState();
      this.memento.saveMemento();
    }
    super.saveState();
  }
  updateViewState(viewState) {
    const newViewState = viewState ?? this._widget.getInputState();
    if (newViewState) {
      for (const [key, value] of Object.entries(newViewState)) {
        this.viewState[key] = value;
      }
    }
  }
  shouldShowWelcome() {
    const noPersistedSessions = !this.chatService.hasSessions();
    const hasCoreAgent = this.chatAgentService.getAgents().some((agent) => agent.isCore && agent.locations.includes(ChatAgentLocation.Chat));
    const hasDefaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat) !== void 0;
    const shouldShow = !hasCoreAgent && (!hasDefaultAgent || !this._widget?.viewModel && noPersistedSessions);
    this.logService.trace(`ChatViewPane#shouldShowWelcome() = ${shouldShow}: hasCoreAgent=${hasCoreAgent} hasDefaultAgent=${hasDefaultAgent} || noViewModel=${!this._widget?.viewModel} && noPersistedSessions=${noPersistedSessions}`);
    return !!shouldShow;
  }
  getMatchingWelcomeView() {
    return this.welcomeController?.getMatchingWelcomeView();
  }
  getActionsContext() {
    return this._widget?.viewModel ? {
      sessionResource: this._widget.viewModel.sessionResource,
      $mid: MarshalledId.ChatViewContext
    } : void 0;
  }
};
//#endregion
//#region Sessions Control
ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH = 200;
ChatViewPane.SESSIONS_SIDEBAR_SNAP_THRESHOLD = ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH / 2;
// snap to hide when dragged below half of minimum width
ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH = 300;
ChatViewPane.SESSIONS_SIDEBAR_BORDER_WIDTH = 1;
ChatViewPane.CHAT_WIDGET_DEFAULT_WIDTH = 300;
ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH = ChatViewPane.CHAT_WIDGET_DEFAULT_WIDTH + ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH;
//#endregion
//#region Chat Control
ChatViewPane.MIN_CHAT_WIDGET_HEIGHT = 116;
ChatViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IChatService),
  __decorateParam(12, IChatAgentService),
  __decorateParam(13, ILogService),
  __decorateParam(14, INotificationService),
  __decorateParam(15, IWorkbenchLayoutService),
  __decorateParam(16, IChatSessionsService),
  __decorateParam(17, ITelemetryService),
  __decorateParam(18, ILifecycleService),
  __decorateParam(19, IProgressService),
  __decorateParam(20, IAgentSessionsService),
  __decorateParam(21, IChatEntitlementService),
  __decorateParam(22, ICommandService),
  __decorateParam(23, IActivityService),
  __decorateParam(24, IHostService),
  __decorateParam(25, IMicCaptureService),
  __decorateParam(26, ITtsPlaybackService),
  __decorateParam(27, IVoiceSessionController),
  __decorateParam(28, IVoiceInputModeService),
  __decorateParam(29, IChatWidgetService),
  __decorateParam(30, IAgentTitleBarStatusService),
  __decorateParam(31, IVoicePlaybackService),
  __decorateParam(32, IWorkbenchEnvironmentService),
  __decorateParam(33, IWorkspaceContextService),
  __decorateParam(34, IAgentHostEnablementService),
  __decorateParam(35, IAccessibilityService)
], ChatViewPane);
export {
  ChatViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldEhvc3RzXFx2aWV3UGFuZVxcY2hhdFZpZXdQYW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRWaWV3UGFuZS5jc3MnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIEV2ZW50SGVscGVyLCBFdmVudFR5cGUsIGdldFdpbmRvdywgc2V0VmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24sIFNhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIElSZWFkZXIsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZ2V0Q29tcGFyaXNvbktleSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENoYXRWaWV3VGl0bGVDb250cm9sIH0gZnJvbSAnLi9jaGF0Vmlld1RpdGxlQ29udHJvbC5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJVmlld1BhbmVPcHRpb25zLCBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgTWVtZW50byB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9tZW1lbnRvLmpzJztcbmltcG9ydCB7IFNJREVfQkFSX0ZPUkVHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBTdGFydHVwS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDaGF0Vmlld1RpdGxlQWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ0hBVF9QUk9WSURFUl9JRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdFBhcnRpY2lwYW50Q29udHJpYlR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWxSZWZlcmVuY2UsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpLCBnZXRDaGF0U2Vzc2lvblR5cGUsIGlzVW50aXRsZWRDaGF0U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kLCBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25SZXNvdXJjZSwgZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc0NvbnRyb2wgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNDb250cm9sLmpzJztcbmltcG9ydCB7IEFDVElPTl9JRF9ORVdfQ0hBVCB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldCwgbGF5b3V0Q2hhdFdpZGdldEZvcklucHV0SGVpZ2h0IH0gZnJvbSAnLi4vLi4vd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdXZWxjb21lQ29udHJvbGxlciwgSVZpZXdXZWxjb21lRGVsZWdhdGUgfSBmcm9tICcuLi8uLi92aWV3c1dlbGNvbWUvY2hhdFZpZXdXZWxjb21lQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZpZXdzV2VsY29tZURlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi92aWV3c1dlbGNvbWUvY2hhdFZpZXdzV2VsY29tZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgTGF5b3V0U2V0dGluZ3MsIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24sIEFnZW50U2Vzc2lvbnNWaWV3ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IENIQVRfV0lER0VUX1ZJRVdfU1RBVEVfQ0FDSEVfTElNSVQsIENoYXRWaWV3SWQsIElDaGF0V2lkZ2V0U2VydmljZSwgSUNoYXRXaWRnZXRWaWV3U3RhdGUsIHNldE1vZGVsUHJlc2VydmluZ0lucHV0VHlwZWRXaGlsZUxvYWRpbmcgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIFByb2dyZXNzQmFkZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zRmlsdGVyLCBBZ2VudFNlc3Npb25zR3JvdXBpbmcgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNGaWx0ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSU1pY0NhcHR1cmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdm9pY2VDbGllbnQvbWljQ2FwdHVyZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVR0c1BsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uL3ZvaWNlQ2xpZW50L3R0c1BsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSVZvaWNlSW5wdXRNb2RlU2VydmljZSwgU2ltdWxhdGVkVm9pY2VTdGF0ZSB9IGZyb20gJy4uLy4uL3ZvaWNlSW5wdXRNb2RlL3ZvaWNlSW5wdXRNb2RlLmpzJztcbmltcG9ydCB7IGlzR2xvd2luZ1ZvaWNlU3RhdGUsIHJlYWRWb2ljZUdsb3dJbnRlbnNpdHksIHJlc29sdmVWb2ljZUdsb3dDb2xvcnMsIFZvaWNlR2xvd1N0YXRlIH0gZnJvbSAnLi4vLi4vdm9pY2VDbGllbnQvdm9pY2VHbG93LmpzJztcbmltcG9ydCB7IGNyZWF0ZVZvaWNlR2xvd0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi92b2ljZUNsaWVudC92b2ljZUdsb3dDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IGNvbWJpbmVWb2ljZUlucHV0IH0gZnJvbSAnLi4vLi4vdm9pY2VDbGllbnQvdm9pY2VJbnB1dFV0aWxzLmpzJztcbmltcG9ydCB7IElWb2ljZU1vZGVsU2VsZWN0aW9uUmVzdWx0LCByZXNvbHZlVm9pY2VNb2RlbCB9IGZyb20gJy4uLy4uL3ZvaWNlQ2xpZW50L3ZvaWNlVG9vbERpc3BhdGNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL2FnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWb2ljZVBsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92b2ljZVBsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWT0lDRV9BR0VOVF9QUk9HUkVTU19TRVRUSU5HIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJQ2hhdFZpZXdQYW5lU3RhdGUgZXh0ZW5kcyBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPiB7XG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBUaGlzIGlzIGtlcHQgYXJvdW5kIHRvIHN1cHBvcnQgb2xkIHZpZXcgc3RhdGVzLiBIb3dldmVyIGl0IHNob3VsZCBub3QgYmUgc2V0IG9uIG5ldyBzdGF0ZXMgYW5kIGBzZXNzaW9uUmVzb3VyY2VgIHNob3VsZCBiZSB1c2VkIGluc3RlYWQuXG5cdCAqL1xuXHRzZXNzaW9uSWQ/OiBzdHJpbmc7XG5cdHNlc3Npb25SZXNvdXJjZT86IFVSSTtcblxuXHRzZXNzaW9uc1NpZGViYXJXaWR0aD86IG51bWJlcjtcbn1cblxudHlwZSBDaGF0Vmlld1BhbmVPcGVuZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYmF0dGVuJztcblx0Y29tbWVudDogJ0V2ZW50IGZpcmVkIHdoZW4gdGhlIGNoYXQgdmlldyBwYW5lIGlzIG9wZW5lZCc7XG59O1xuXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXdQYW5lIGV4dGVuZHMgVmlld1BhbmUgaW1wbGVtZW50cyBJVmlld1dlbGNvbWVEZWxlZ2F0ZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtZW1lbnRvOiBNZW1lbnRvPElDaGF0Vmlld1BhbmVTdGF0ZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld1N0YXRlOiBJQ2hhdFZpZXdQYW5lU3RhdGU7XG5cblx0cHJpdmF0ZSB2aWV3UGFuZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhdFZpZXdMb2NhdGlvbkNvbnRleHQ6IElDb250ZXh0S2V5PFZpZXdDb250YWluZXJMb2NhdGlvbj47XG5cblx0cHJpdmF0ZSBsYXN0RGltZW5zaW9uczogeyBoZWlnaHQ6IG51bWJlcjsgd2lkdGg6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxhc3REaW1lbnNpb25zUGVyT3JpZW50YXRpb246IE1hcDxBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24sIHsgaGVpZ2h0OiBudW1iZXI7IHdpZHRoOiBudW1iZXIgfT4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSB3ZWxjb21lQ29udHJvbGxlcjogQ2hhdFZpZXdXZWxjb21lQ29udHJvbGxlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlc3RvcmluZ1Nlc3Npb246IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9hZFNlc3Npb25DdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcHBseU1vZGVsQ3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpKTtcblx0LyoqIFdoaWxlID4gMCB0aGUgc2Vzc2lvbnMgbGlzdCBpcyBzdXBwcmVzc2VkIHNvIGEgc2Vzc2lvbiB0cmFuc2l0aW9uJ3MgdHJhbnNpZW50bHktZW1wdHkgd2lkZ2V0IGRvZXMgbm90IHJldmVhbCBpdCAoc2VlIHtAbGluayBiZWdpblNlc3Npb25zTGlzdFN1cHByZXNzaW9ufSkuICovXG5cdHByaXZhdGUgX3Nlc3Npb25zTGlzdFN1cHByZXNzaW9uQ291bnQgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsUmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElDaGF0TW9kZWxSZWZlcmVuY2U+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldFZpZXdTdGF0ZXMgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBJQ2hhdFdpZGdldFZpZXdTdGF0ZT4oQ0hBVF9XSURHRVRfVklFV19TVEFURV9DQUNIRV9MSU1JVCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eUJhZGdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50U2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0LyoqXG5cdCAqIFNlc3Npb24gcmVzb3VyY2Ugb2YgdGhlIGxhc3QtZm9jdXNlZCBjaGF0IHdpZGdldCwgb3IgdGhpcyBwYW5lJ3Mgb3duXG5cdCAqIHNlc3Npb24gd2hlbiBubyBjaGF0IHdpZGdldCBpcyBmb2N1c2VkLiBVc2VkIHRvIGJpbmQgdGhlIHZvaWNlIGdsb3cgL1xuXHQgKiB0cmFuc2NyaXB0IHRvIHRoZSBzaW5nbGUgaW5wdXQgdm9pY2UgdGFyZ2V0cywgc28gd2l0aCBzZXZlcmFsIGNoYXQgaW5wdXRzXG5cdCAqIG9wZW4gKGUuZy4gdGhpcyBwYW5lIHBsdXMgYSBjaGF0IGVkaXRvcikgb25seSB0aGUgZm9jdXNlZCBvbmUgbGlnaHRzIHVwLlxuXHQgKi9cblx0cHJpdmF0ZSBfZm9jdXNlZFNlc3Npb25SZXNvdXJjZSE6IElPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlMjogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJTWljQ2FwdHVyZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtaWNDYXB0dXJlU2VydmljZTogSU1pY0NhcHR1cmVTZXJ2aWNlLFxuXHRcdEBJVHRzUGxheWJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHRzUGxheWJhY2tTZXJ2aWNlOiBJVHRzUGxheWJhY2tTZXJ2aWNlLFxuXHRcdEBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciBwcml2YXRlIHJlYWRvbmx5IHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI6IElWb2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdEBJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdm9pY2VJbnB1dE1vZGVTZXJ2aWNlOiBJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UgX2FnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlOiBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UsXG5cdFx0QElWb2ljZVBsYXliYWNrU2VydmljZSBfdm9pY2VQbGF5YmFja1NlcnZpY2U6IElWb2ljZVBsYXliYWNrU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBfd29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZTogSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZTIsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtdmlld3BhbmUtY29udGFpbmVyJyk7XG5cblx0XHQvLyBWaWV3IHN0YXRlIGZvciB0aGUgVmlld1BhbmUgaXMgY3VycmVudGx5IGdsb2JhbCBwZXItcHJvdmlkZXIgYmFzaWNhbGx5LFxuXHRcdC8vIGJ1dCBzb21lIG90aGVyIHN0cmljdGx5IHBlci1tb2RlbCBzdGF0ZSB3aWxsIHJlcXVpcmUgYSBzZXBhcmF0ZSBtZW1lbnRvLlxuXHRcdHRoaXMubWVtZW50byA9IG5ldyBNZW1lbnRvKGBpbnRlcmFjdGl2ZS1zZXNzaW9uLXZpZXctJHtDSEFUX1BST1ZJREVSX0lEfWAsIHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMudmlld1N0YXRlID0gdGhpcy5tZW1lbnRvLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRpZiAoXG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLnN0YXJ0dXBLaW5kICE9PSBTdGFydHVwS2luZC5SZWxvYWRlZFdpbmRvdyAmJlxuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5SZXN0b3JlTGFzdFBhbmVsU2Vzc2lvbikgPT09IGZhbHNlXG5cdFx0KSB7XG5cdFx0XHQvLyBjbGVhciBwZXJzaXN0ZWQgc2Vzc2lvbiBvbiBmcmVzaCBzdGFydFxuXHRcdFx0dGhpcy52aWV3U3RhdGUuc2Vzc2lvbklkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy52aWV3U3RhdGUuc2Vzc2lvblJlc291cmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLnNlc3Npb25zVmlld2VyVmlzaWJsZSA9IGZhbHNlOyAvLyB3aWxsIGJlIHVwZGF0ZWQgZnJvbSBsYXlvdXQgY29kZVxuXHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGggPSBNYXRoLm1heChDaGF0Vmlld1BhbmUuU0VTU0lPTlNfU0lERUJBUl9NSU5fV0lEVEgsIHRoaXMudmlld1N0YXRlLnNlc3Npb25zU2lkZWJhcldpZHRoID8/IENoYXRWaWV3UGFuZS5TRVNTSU9OU19TSURFQkFSX0RFRkFVTFRfV0lEVEgpO1xuXG5cdFx0Ly8gQ29udGV4dGtleXNcblx0XHR0aGlzLmNoYXRWaWV3TG9jYXRpb25Db250ZXh0ID0gQ2hhdENvbnRleHRLZXlzLnBhbmVsTG9jYXRpb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb25Db250ZXh0ID0gQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJQb3NpdGlvbkNvbnRleHQgPSBDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uc1ZpZXdlclBvc2l0aW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZXNzaW9uc1ZpZXdlclZpc2liaWxpdHlDb250ZXh0ID0gQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJWaXNpYmxlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnVwZGF0ZUNvbnRleHRLZXlzKCk7XG5cblx0XHQvLyBUcmFja3MgdGhlIHNlc3Npb24gb2YgdGhlIGxhc3QtZm9jdXNlZCBjaGF0IHdpZGdldCBzbyB0aGUgdm9pY2UgVUkgY2FuXG5cdFx0Ly8gYmluZCB0byBleGFjdGx5IG9uZSBpbnB1dCBldmVuIHdoZW4gc2V2ZXJhbCBhcmUgb3Blbi5cblx0XHR0aGlzLl9mb2N1c2VkU2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uLFxuXHRcdFx0KCkgPT4gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb250ZXh0S2V5cygpOiB2b2lkIHtcblx0XHRjb25zdCB7IHBvc2l0aW9uLCBsb2NhdGlvbiB9ID0gdGhpcy5nZXRWaWV3UG9zaXRpb25BbmRMb2NhdGlvbigpO1xuXG5cdFx0dGhpcy5jaGF0Vmlld0xvY2F0aW9uQ29udGV4dC5zZXQobG9jYXRpb24gPz8gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0dGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29udGV4dC5zZXQodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uKTtcblx0XHR0aGlzLnNlc3Npb25zVmlld2VyUG9zaXRpb25Db250ZXh0LnNldChwb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQgPyBBZ2VudFNlc3Npb25zVmlld2VyUG9zaXRpb24uUmlnaHQgOiBBZ2VudFNlc3Npb25zVmlld2VyUG9zaXRpb24uTGVmdCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpZXdQb3NpdGlvbkFuZExvY2F0aW9uKCk6IHsgcG9zaXRpb246IFBvc2l0aW9uOyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIH0ge1xuXHRcdGNvbnN0IHZpZXdMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodGhpcy5pZCk7XG5cdFx0Y29uc3Qgc2lkZUJhclBvc2l0aW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHBhbmVsUG9zaXRpb24gPSB0aGlzLmxheW91dFNlcnZpY2UuZ2V0UGFuZWxQb3NpdGlvbigpO1xuXG5cdFx0bGV0IHNpZGVTZXNzaW9uc09uUmlnaHRQb3NpdGlvbjogYm9vbGVhbjtcblx0XHRzd2l0Y2ggKHZpZXdMb2NhdGlvbikge1xuXHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcjpcblx0XHRcdFx0c2lkZVNlc3Npb25zT25SaWdodFBvc2l0aW9uID0gc2lkZUJhclBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbDpcblx0XHRcdFx0c2lkZVNlc3Npb25zT25SaWdodFBvc2l0aW9uID0gcGFuZWxQb3NpdGlvbiAhPT0gUG9zaXRpb24uTEVGVDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRzaWRlU2Vzc2lvbnNPblJpZ2h0UG9zaXRpb24gPSBzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLkxFRlQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogc2lkZVNlc3Npb25zT25SaWdodFBvc2l0aW9uID8gUG9zaXRpb24uUklHSFQgOiBQb3NpdGlvbi5MRUZULFxuXHRcdFx0bG9jYXRpb246IHZpZXdMb2NhdGlvbiA/PyBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFNlc3Npb25Ib3ZlclBvc2l0aW9uKCkge1xuXHRcdGNvbnN0IHZpZXdMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodGhpcy5pZCk7XG5cdFx0Y29uc3Qgc2lkZUJhclBvc2l0aW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpO1xuXG5cdFx0aWYgKHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUpIHtcblx0XHRcdHJldHVybiB2aWV3TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyICYmIHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQgPyBIb3ZlclBvc2l0aW9uLkxFRlQgOiBIb3ZlclBvc2l0aW9uLlJJR0hUO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRbUG9zaXRpb24uTEVGVF06IEhvdmVyUG9zaXRpb24uUklHSFQsXG5cdFx0XHRbUG9zaXRpb24uUklHSFRdOiBIb3ZlclBvc2l0aW9uLkxFRlQsXG5cdFx0XHRbUG9zaXRpb24uVE9QXTogSG92ZXJQb3NpdGlvbi5CRUxPVyxcblx0XHRcdFtQb3NpdGlvbi5CT1RUT01dOiBIb3ZlclBvc2l0aW9uLkFCT1ZFXG5cdFx0fVt2aWV3TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCA/IHRoaXMubGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkgOiBzaWRlQmFyUG9zaXRpb25dO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVWaWV3UGFuZUNsYXNzZXMoZnJvbUV2ZW50OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZpdHlCYXJMb2NhdGlvbkRlZmF1bHQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OKSA9PT0gJ2RlZmF1bHQnO1xuXHRcdHRoaXMudmlld1BhbmVDb250YWluZXI/LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2aXR5LWJhci1sb2NhdGlvbi1kZWZhdWx0JywgYWN0aXZpdHlCYXJMb2NhdGlvbkRlZmF1bHQpO1xuXHRcdHRoaXMudmlld1BhbmVDb250YWluZXI/LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2aXR5LWJhci1sb2NhdGlvbi1vdGhlcicsICFhY3Rpdml0eUJhckxvY2F0aW9uRGVmYXVsdCk7XG5cblx0XHRjb25zdCB7IHBvc2l0aW9uLCBsb2NhdGlvbiB9ID0gdGhpcy5nZXRWaWV3UG9zaXRpb25BbmRMb2NhdGlvbigpO1xuXG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC12aWV3LWxvY2F0aW9uLWF1eGlsaWFyeWJhcicsIGxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKTtcblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyPy5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXZpZXctbG9jYXRpb24tc2lkZWJhcicsIGxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC12aWV3LWxvY2F0aW9uLXBhbmVsJywgbG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyPy5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXZpZXctcG9zaXRpb24tbGVmdCcsIHBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUKTtcblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyPy5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXZpZXctcG9zaXRpb24tcmlnaHQnLCBwb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQpO1xuXG5cdFx0aWYgKGZyb21FdmVudCkge1xuXHRcdFx0dGhpcy5yZWxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBBZ2VudCBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzKCgpID0+IHRoaXMub25EaWRDaGFuZ2VBZ2VudHMoKSkpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ29tbWl0U2Vzc2lvbihhc3luYyAoZSkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLm1vZGVsUmVmLnZhbHVlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpc0VxdWFsKGUub3JpZ2luYWwsIHRoaXMubW9kZWxSZWYudmFsdWUub2JqZWN0LnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oZS5jb21taXR0ZWQsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdDaGF0Vmlld1BhbmUjb25EaWRDb21taXRTZXNzaW9uJyk7XG5cdFx0XHRhd2FpdCB0aGlzLnNob3dNb2RlbChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBtb2RlbFJlZik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGF5b3V0IGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nKSksXG5cdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uLFxuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHksXG5cdFx0XHRFdmVudC5maWx0ZXIodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VDb250YWluZXJMb2NhdGlvbiwgZSA9PiBlLnZpZXdDb250YWluZXIgPT09IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh0aGlzLmlkKSlcblx0XHQpKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQ29udGV4dEtleXMoKTtcblx0XHRcdHRoaXMudXBkYXRlVmlld1BhbmVDbGFzc2VzKHRydWUgLyogbGF5b3V0IGhlcmUgKi8pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNldHRpbmdzIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4ge1xuXHRcdFx0cmV0dXJuIGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OKTtcblx0XHR9KSgoKSA9PiB0aGlzLnVwZGF0ZVZpZXdQYW5lQ2xhc3Nlcyh0cnVlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUFnZW50cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSkge1xuXHRcdFx0aWYgKCF0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbCAmJiAhdGhpcy5yZXN0b3JpbmdTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMucmVzdG9yaW5nU2Vzc2lvbiA9XG5cdFx0XHRcdFx0dGhpcy5hY3F1aXJlVHJhbnNmZXJyZWRPclBlcnNpc3RlZFNlc3Npb24oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ0NoYXRWaWV3UGFuZSNvbkRpZENoYW5nZUFnZW50cycpLnRoZW4oYXN5bmMgbW9kZWxSZWYgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLl93aWRnZXQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuOyAvLyByZW5kZXJCb2R5IGhhcyBub3QgYmVlbiBjYWxsZWQgeWV0XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIFRoZSB3aWRnZXQgbWF5IGJlIGhpZGRlbiBhdCB0aGlzIHBvaW50LCBiZWNhdXNlIHdlbGNvbWUgdmlld3Mgd2VyZSBhbGxvd2VkLiBVc2Ugc2V0VmlzaWJsZSB0b1xuXHRcdFx0XHRcdFx0Ly8gYXZvaWQgZG9pbmcgYSByZW5kZXIgd2hpbGUgdGhlIHdpZGdldCBpcyBoaWRkZW4uIFRoaXMgaXMgY2hhbmdpbmcgdGhlIGNvbmRpdGlvbiBpbiBgc2hvdWxkU2hvd1dlbGNvbWVgXG5cdFx0XHRcdFx0XHQvLyBzbyBpdCBzaG91bGQgZmlyZSBvbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUuXG5cdFx0XHRcdFx0XHRjb25zdCB3YXNWaXNpYmxlID0gdGhpcy5fd2lkZ2V0LnZpc2libGU7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl93aWRnZXQuc2V0VmlzaWJsZShmYWxzZSk7XG5cblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zaG93TW9kZWwoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgbW9kZWxSZWYsIHRydWUsICFtb2RlbFJlZik7XG5cdFx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl93aWRnZXQuc2V0VmlzaWJsZSh3YXNWaXNpYmxlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLnJlc3RvcmluZ1Nlc3Npb24uZmluYWxseSgoKSA9PiB0aGlzLnJlc3RvcmluZ1Nlc3Npb24gPSB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRyYW5zZmVycmVkT3JQZXJzaXN0ZWRTZXNzaW9uSW5mbygpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmNoYXRTZXJ2aWNlLnRyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGF0U2VydmljZS50cmFuc2ZlcnJlZFNlc3Npb25SZXNvdXJjZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy52aWV3U3RhdGUuc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52aWV3U3RhdGUuc2Vzc2lvblJlc291cmNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uSWQgPyBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24odGhpcy52aWV3U3RhdGUuc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KHBhcmVudCk7XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7fSwgQ2hhdFZpZXdQYW5lT3BlbmVkQ2xhc3NpZmljYXRpb24+KCdjaGF0Vmlld1BhbmVPcGVuZWQnKTtcblxuXHRcdHRoaXMudmlld1BhbmVDb250YWluZXIgPSBwYXJlbnQ7XG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXZpZXdwYW5lJyk7XG5cdFx0dGhpcy51cGRhdGVWaWV3UGFuZUNsYXNzZXMoZmFsc2UpO1xuXG5cdFx0Ly8gQ29udHJvbHMgd3JhcHBlciBcdTIwMTQgc2Vzc2lvbnMgKyBjaGF0IGxpdmUgaW5zaWRlIGhlcmVcblx0XHRjb25zdCBjb250cm9sc1dyYXBwZXIgPSBhcHBlbmQocGFyZW50LCAkKCcudm9pY2UtYWdlbnQtY29udHJvbHMtd3JhcHBlcicpKTtcblx0XHR0aGlzLmNyZWF0ZUNvbnRyb2xzKGNvbnRyb2xzV3JhcHBlcik7XG5cblx0XHQvLyBWb2ljZSBiYXIgXHUyMDE0IGhpZGRlbiBieSBkZWZhdWx0LCB2b2ljZSBpcyBhY3RpdmF0ZWQgdmlhIG1pYyBidXR0b24gaW4gdG9vbGJhci5cblx0XHQvLyBUaGUgd2lkZ2V0IGlzIHN0aWxsIGNyZWF0ZWQgZm9yIFBUVCBrZXliaW5kaW5nIHN1cHBvcnQgYW5kIHNlc3Npb24gYmluZGluZy5cblx0XHR0aGlzLl92b2ljZUJhckNvbnRhaW5lciA9ICQoJy52b2ljZS1hZ2VudC1iYXItaG9zdCcpO1xuXHRcdHRoaXMuX3ZvaWNlQmFyQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fdXBkYXRlVm9pY2VCYXIodGhpcy5fdm9pY2VCYXJDb250YWluZXIpO1xuXG5cdFx0Ly8gVHJhbnNjcmlwdCBvdmVybGF5IFx1MjAxNCBzaG93biBpbnNpZGUgdGhlIGlucHV0IGNvbnRhaW5lciB3aGVuIHZvaWNlIGlzIGFjdGl2ZVxuXHRcdGNvbnN0IGlucHV0Q29udGFpbmVyRWwgPSB0aGlzLl93aWRnZXQuaW5wdXRQYXJ0LmlucHV0Q29udGFpbmVyRWxlbWVudDtcblx0XHRpZiAoaW5wdXRDb250YWluZXJFbCkge1xuXHRcdFx0dGhpcy5fc2V0dXBWb2ljZVRyYW5zY3JpcHRPdmVybGF5KGlucHV0Q29udGFpbmVyRWwpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS5lbmFibGVkJykpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVm9pY2VCYXIodGhpcy5fdm9pY2VCYXJDb250YWluZXIhKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnNldHVwQ29udGV4dE1lbnUocGFyZW50KTtcblxuXHRcdHRoaXMuYXBwbHlNb2RlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb250cm9scyhwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cblx0XHQvLyBTZXNzaW9ucyBDb250cm9sXG5cdFx0Y29uc3Qgc2Vzc2lvbnNDb250cm9sID0gdGhpcy5jcmVhdGVTZXNzaW9uc0NvbnRyb2wocGFyZW50KTtcblxuXHRcdC8vIFdlbGNvbWUgQ29udHJvbCAodXNlZCB0byBzaG93IGNoYXQgc3BlY2lmaWMgZXh0ZW5zaW9uIHByb3ZpZGVkIHdlbGNvbWUgdmlld3MgdmlhIGBjaGF0Vmlld3NXZWxjb21lYCBjb250cmlidXRpb24gcG9pbnQpXG5cdFx0Y29uc3Qgd2VsY29tZUNvbnRyb2xsZXIgPSB0aGlzLndlbGNvbWVDb250cm9sbGVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Vmlld1dlbGNvbWVDb250cm9sbGVyLCBwYXJlbnQsIHRoaXMsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblxuXHRcdC8vIENoYXQgQ29udHJvbFxuXHRcdGNvbnN0IGNoYXRXaWRnZXQgPSB0aGlzLmNyZWF0ZUNoYXRDb250cm9sKHBhcmVudCk7XG5cblx0XHQvLyBDb250cm9scyBMaXN0ZW5lcnNcblx0XHR0aGlzLnJlZ2lzdGVyQ29udHJvbHNMaXN0ZW5lcnMoc2Vzc2lvbnNDb250cm9sLCBjaGF0V2lkZ2V0LCB3ZWxjb21lQ29udHJvbGxlcik7XG5cblx0XHQvLyBVcGRhdGUgc2Vzc2lvbnMgY29udHJvbCB2aXNpYmlsaXR5IHdoZW4gYWxsIGNvbnRyb2xzIGFyZSBjcmVhdGVkXG5cdFx0dGhpcy51cGRhdGVTZXNzaW9uc0NvbnRyb2xWaXNpYmlsaXR5KCk7XG5cdH1cblxuXHQvLyNyZWdpb24gVm9pY2UgQWdlbnQgQmFyXG5cblx0cHJpdmF0ZSBfdm9pY2VCYXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92b2ljZUJhckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIF91cGRhdGVWb2ljZUJhcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fdm9pY2VCYXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnRhaW5lci5yZXBsYWNlQ2hpbGRyZW4oKTtcblxuXHRcdC8vIEFsd2F5cyBrZWVwIHRoZSBjb250YWluZXIgaGlkZGVuIFx1MjAxNCB2b2ljZSBVSSBpcyBub3cgdGhlIG1pYyB0b29sYmFyXG5cdFx0Ly8gYnV0dG9uICsgdHJhbnNjcmlwdCBvdmVybGF5LiBXZSBzdGlsbCByZWdpc3RlciB0aGUgY29tbWFuZCBicmlkZ2VzXG5cdFx0Ly8gbmVlZGVkIGJ5IFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuXG5cdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignYWdlbnRzLnZvaWNlLmVuYWJsZWQnKSkge1xuXHRcdFx0Ly8gVm9pY2UgY29tbWFuZCBicmlkZ2UgXHUyMDE0IGxldHMgdGhlIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgcmVhY2ggaW50byB0aGUgY2hhdCB3aWRnZXRcblx0XHRcdHRoaXMuX3ZvaWNlQmFyRGlzcG9zYWJsZXMuYWRkKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfY2hhdC52b2ljZS5hY2NlcHRJbnB1dCcsIChhY2Nlc3NvciwgdGV4dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRcdC8vIElnbm9yZSBsYXN0Rm9jdXNlZFdpZGdldCB3aGVuIGl0cyBpbnB1dCBubyBsb25nZXIgaGFzIGZvY3VzIGJlY2F1c2UgYmx1ciBkb2VzIG5vdCBjbGVhciBpdC5cblx0XHRcdFx0Y29uc3QgZm9jdXNlZFdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSBmb2N1c2VkV2lkZ2V0Py5oYXNJbnB1dEZvY3VzKCkgPyBmb2N1c2VkV2lkZ2V0IDogdGhpcy5fd2lkZ2V0O1xuXHRcdFx0XHRpZiAodGV4dCAmJiB3aWRnZXQ/LnZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdGlmICh3aWRnZXQudmlld01vZGVsLmVkaXRpbmcpIHtcblx0XHRcdFx0XHRcdC8vIFdoZW4gZWRpdGluZyBhbiBvbGQgbWVzc2FnZSwgcG9wdWxhdGUgdGhlIGFjdGl2ZSBpbnB1dFxuXHRcdFx0XHRcdFx0Ly8gZWRpdG9yIHNvIHRoZSB1c2VyIGNhbiByZXZpZXcgYmVmb3JlIHN1Ym1pdHRpbmcuXG5cdFx0XHRcdFx0XHR3aWRnZXQuaW5wdXQuc2V0VmFsdWUodGV4dCwgZmFsc2UpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBQcmVzZXJ2ZSBhbnkgdGV4dCB0aGUgdXNlciBhbHJlYWR5IHR5cGVkIGluIHRoZSBpbnB1dC5cblx0XHRcdFx0XHRcdHJldHVybiB3aWRnZXQuYWNjZXB0SW5wdXQoY29tYmluZVZvaWNlSW5wdXQod2lkZ2V0LmdldElucHV0KCksIHRleHQpLCB7XG5cdFx0XHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGlzVm9pY2VNb2RlSW5wdXQ6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oVk9JQ0VfQUdFTlRfUFJPR1JFU1NfU0VUVElORykgPT09IHRydWUsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3ZvaWNlQmFyRGlzcG9zYWJsZXMuYWRkKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfY2hhdC52b2ljZS5zd2l0Y2hUb1Nlc3Npb24nLCBhc3luYyAoX2FjY2Vzc29yLCByZXNvdXJjZVN0cjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG5cdFx0XHRcdGlmICghcmVzb3VyY2VTdHIpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShyZXNvdXJjZVN0cik7XG5cdFx0XHRcdFx0dGhpcy52aWV3U3RhdGUuc2Vzc2lvblJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0XHRcdFx0dGhpcy5hcHBseU1vZGVsKCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXN0b3JpbmdTZXNzaW9uO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3RvcmVkUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdHJldHVybiAhIXJlc3RvcmVkUmVzb3VyY2UgJiYgaXNFcXVhbChyZXN0b3JlZFJlc291cmNlLCByZXNvdXJjZSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fdm9pY2VCYXJEaXNwb3NhYmxlcy5hZGQoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19jaGF0LnZvaWNlLmdldEN1cnJlbnRTZXNzaW9uJywgKF9hY2Nlc3Nvcik6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fdm9pY2VCYXJEaXNwb3NhYmxlcy5hZGQoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19jaGF0LnZvaWNlLnNlbGVjdE1vZGVsJywgKF9hY2Nlc3NvciwgcmVxdWVzdGVkTW9kZWw6IHN0cmluZyk6IElWb2ljZU1vZGVsU2VsZWN0aW9uUmVzdWx0ID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fZ2V0Vm9pY2VBY3Rpb25XaWRnZXQoKTtcblx0XHRcdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ25vX2lucHV0JyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVZvaWNlTW9kZWwod2lkZ2V0LmlucHV0UGFydC5hdmFpbGFibGVMYW5ndWFnZU1vZGVscywgcmVxdWVzdGVkTW9kZWwpO1xuXHRcdFx0XHRpZiAoIXJlc29sdmVkLm9rIHx8ICFyZXNvbHZlZC5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB3aWRnZXQuaW5wdXRQYXJ0LnN3aXRjaE1vZGVsQnlJZGVudGlmaWVyKHJlc29sdmVkLmlkZW50aWZpZXIsIHRydWUsIHRydWUpXG5cdFx0XHRcdFx0PyByZXNvbHZlZFxuXHRcdFx0XHRcdDogeyBvazogZmFsc2UsIHJlYXNvbjogJ3NlbGVjdGlvbl9mYWlsZWQnLCBhdmFpbGFibGVfbW9kZWxzOiByZXNvbHZlZC5hdmFpbGFibGVfbW9kZWxzIH07XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Vm9pY2VBY3Rpb25XaWRnZXQoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fY3VycmVudFZvaWNlSW5wdXRSZXNvdXJjZSgpO1xuXHRcdHJldHVybiB0YXJnZXQgPyB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHRhcmdldCkgOiB0aGlzLl93aWRnZXQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNpbmdsZSBjaGF0IGlucHV0IHZvaWNlIG1vZGUgaXMgY3VycmVudGx5IGJvdW5kIHRvLiBNaXJyb3JzIHRoZSByb3V0aW5nXG5cdCAqIHVzZWQgYnkgYF9jaGF0LnZvaWNlLmFjY2VwdElucHV0YDogYW4gZXhwbGljaXQgdGFyZ2V0IHNlc3Npb24gKHNldCBieSB0aGVcblx0ICogZmxvYXRpbmcgYXV4IHdpbmRvdykgd2lucywgb3RoZXJ3aXNlIHRoZSBsYXN0LWZvY3VzZWQgY2hhdCB3aWRnZXQncyBzZXNzaW9uLFxuXHQgKiBmYWxsaW5nIGJhY2sgdG8gdGhpcyBwYW5lJ3Mgb3duIHNlc3Npb24uIFRoZSBnbG93IC8gdHJhbnNjcmlwdCByZW5kZXIgb25seSBvblxuXHQgKiB0aGUgcGFuZSB3aG9zZSBzZXNzaW9uIG1hdGNoZXMgdGhpcywgc28gd2l0aCBzZXZlcmFsIGNoYXQgaW5wdXRzIG9wZW4gKGUuZy5cblx0ICogdGhpcyBwYW5lIHBsdXMgYSBjaGF0IGVkaXRvcikgZXhhY3RseSBvbmUgbGlnaHRzIHVwLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3VycmVudFZvaWNlSW5wdXRSZXNvdXJjZShyZWFkZXI/OiBJUmVhZGVyKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBvbW5pSW5wdXRPcGVuID0gcmVhZGVyID8gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm9tbmlJbnB1dE9wZW4ucmVhZChyZWFkZXIpIDogdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm9tbmlJbnB1dE9wZW4uZ2V0KCk7XG5cdFx0aWYgKG9tbmlJbnB1dE9wZW4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IHJlYWRlciA/IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci50YXJnZXRTZXNzaW9uLnJlYWQocmVhZGVyKSA6IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci50YXJnZXRTZXNzaW9uLmdldCgpO1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZvY3VzZWQgPSByZWFkZXIgPyB0aGlzLl9mb2N1c2VkU2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKSA6IHRoaXMuX2ZvY3VzZWRTZXNzaW9uUmVzb3VyY2UuZ2V0KCk7XG5cdFx0cmV0dXJuIGZvY3VzZWQgPz8gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwVm9pY2VUcmFuc2NyaXB0T3ZlcmxheShpbnB1dENvbnRhaW5lckVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlucHV0Q29udGFpbmVyRWwuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdGNvbnN0IHNob3dUcmFuc2NyaXB0U2V0dGluZyA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHR0aGlzLFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS5zaG93VHJhbnNjcmlwdCcpKSxcblx0XHRcdCgpID0+IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2FnZW50cy52b2ljZS5zaG93VHJhbnNjcmlwdCcpICE9PSBmYWxzZVxuXHRcdCk7XG5cdFx0Y29uc3Qgc2hvd0xpdmVUcmFuc2NyaXB0U2V0dGluZyA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHR0aGlzLFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS5saXZlVHJhbnNjcmlwdCcpKSxcblx0XHRcdCgpID0+IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2FnZW50cy52b2ljZS5saXZlVHJhbnNjcmlwdCcpICE9PSBmYWxzZVxuXHRcdCk7XG5cdFx0Y29uc3QgaW5wdXRWYWx1ZSA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHR0aGlzLFxuXHRcdFx0dGhpcy5fd2lkZ2V0LmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50LFxuXHRcdFx0KCkgPT4gdGhpcy5fd2lkZ2V0LmdldElucHV0KClcblx0XHQpO1xuXHRcdGNvbnN0IHRyYW5zY3JpcHRPdmVybGF5ID0gJCgnLnZvaWNlLXRyYW5zY3JpcHQtb3ZlcmxheScpO1xuXHRcdGNvbnN0IHRyYW5zY3JpcHRTY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRyYW5zY3JpcHRPdmVybGF5LCB7XG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHRyYW5zY3JpcHRPdmVybGF5Tm9kZSA9IHRyYW5zY3JpcHRTY3JvbGxhYmxlLmdldERvbU5vZGUoKTtcblx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LmFkZCgndm9pY2UtdHJhbnNjcmlwdC1vdmVybGF5LXNjcm9sbGFibGUnKTtcblx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRpbnB1dENvbnRhaW5lckVsLmFwcGVuZCh0cmFuc2NyaXB0T3ZlcmxheU5vZGUpO1xuXG5cdFx0Ly8gRHluYW1pYyBhdWRpby1yZWFjdGl2ZSBnbG93IGFuaW1hdGlvbiAobWF0Y2hlcyBhdXggd2luZG93IGJlaGF2aW9yKVxuXHRcdGxldCBhbmltRnJhbWVJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGdsb3dEYXRhQXJyYXlSZWY6IHsgdmFsdWU6IFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQgfSA9IHsgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IHdpbiA9IGdldFdpbmRvdyhpbnB1dENvbnRhaW5lckVsKTtcblx0XHRjb25zdCBnbG93Q29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZVZvaWNlR2xvd0NvbnRyb2xsZXIoXG5cdFx0XHRpbnB1dENvbnRhaW5lckVsLFxuXHRcdFx0KCkgPT4gaXNEYXJrKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKSA/ICdkYXJrJyA6ICdsaWdodCcsXG5cdFx0XHQoKSA9PiByZXNvbHZlVm9pY2VHbG93Q29sb3JzKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSksXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IGdsb3dDb250cm9sbGVyLnJlZnJlc2hUaGVtZSgpKSk7XG5cdFx0Ly8gTWVyZ2UgdGhlIHJlYWwgdm9pY2Ugc2Vzc2lvbiB3aXRoIGFueSBkZXYvcHJldmlldyBzaW11bGF0aW9uIHNvIHRoZSB3YWxrdGhyb3VnaFxuXHRcdC8vIGNvbW1hbmRzIGRyaXZlIHRoZSBpbnB1dC1ib3ggZ2xvdyBleGFjdGx5IGFzIGEgbGl2ZSBzZXNzaW9uIHdvdWxkLlxuXHRcdGNvbnN0IGdldEVmZmVjdGl2ZVZvaWNlID0gKCk6IHsgY29ubmVjdGVkOiBib29sZWFuOyB2b2ljZVN0YXRlOiBWb2ljZUdsb3dTdGF0ZTsgc2ltdWxhdGluZzogYm9vbGVhbiB9ID0+IHtcblx0XHRcdGNvbnN0IHNpbTogU2ltdWxhdGVkVm9pY2VTdGF0ZSB8IHVuZGVmaW5lZCA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZvaWNlU3RhdGUuZ2V0KCk7XG5cdFx0XHRpZiAoc2ltID09PSAnaWRsZScgfHwgc2ltID09PSAnbGlzdGVuaW5nJyB8fCBzaW0gPT09ICdzcGVha2luZycpIHtcblx0XHRcdFx0cmV0dXJuIHsgY29ubmVjdGVkOiB0cnVlLCB2b2ljZVN0YXRlOiBzaW0sIHNpbXVsYXRpbmc6IHRydWUgfTtcblx0XHRcdH1cblx0XHRcdGlmIChzaW0gPT09ICdvZmYnIHx8IHNpbSA9PT0gJ2Nvbm5lY3RpbmcnIHx8IHNpbSA9PT0gJ2RpY3RhdGluZycpIHtcblx0XHRcdFx0cmV0dXJuIHsgY29ubmVjdGVkOiBmYWxzZSwgdm9pY2VTdGF0ZTogJ2lkbGUnLCBzaW11bGF0aW5nOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb25uZWN0ZWQ6IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5nZXQoKSxcblx0XHRcdFx0dm9pY2VTdGF0ZTogdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnZvaWNlU3RhdGUuZ2V0KCkgYXMgVm9pY2VHbG93U3RhdGUsXG5cdFx0XHRcdHNpbXVsYXRpbmc6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9O1xuXHRcdGNvbnN0IHN0YXJ0R2xvd0FuaW1hdGlvbiA9ICgpID0+IHtcblx0XHRcdGlmIChhbmltRnJhbWVJZCAhPT0gdW5kZWZpbmVkKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3QgYW5pbWF0ZSA9ICgpID0+IHtcblx0XHRcdFx0YW5pbUZyYW1lSWQgPSB3aW4ucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xuXHRcdFx0XHRjb25zdCB7IGNvbm5lY3RlZCwgdm9pY2VTdGF0ZSwgc2ltdWxhdGluZyB9ID0gZ2V0RWZmZWN0aXZlVm9pY2UoKTtcblx0XHRcdFx0Ly8gT25seSBnbG93IHRoZSBpbnB1dCBvZiB0aGUgc2Vzc2lvbiB2b2ljZSBpcyBib3VuZCB0by4gTWlycm9ycyB0aGVcblx0XHRcdFx0Ly8gdHJhbnNjcmlwdCBvdmVybGF5J3Mgb3duZXJzaGlwIHRlc3QgKHNlZSBiZWxvdykgc28gdGhlIGdsb3cgYW5kXG5cdFx0XHRcdC8vIHRoZSBcIkxpc3RlbmluZy4uLlwiL3RyYW5zY3JpcHQgb3ZlcmxheSBhbHdheXMgcmVuZGVyIG9uIHRoZSBzYW1lXG5cdFx0XHRcdC8vIHBhbmUgYW5kIG5ldmVyIG9uIGEgZGlmZmVyZW50IHNwbGl0L3dpbmRvdyAoIzg1MTQpIG9yIGEgY2hhdFxuXHRcdFx0XHQvLyBlZGl0b3Igb3BlbiBhbG9uZ3NpZGUgdGhpcyBwYW5lLiBBIGRldi9wcmV2aWV3IHNpbXVsYXRpb24gYnlwYXNzZXNcblx0XHRcdFx0Ly8gb3duZXJzaGlwIHNvIHRoZSB3YWxrdGhyb3VnaCBjYW4gbGlnaHQgdXAgaGVyZS5cblx0XHRcdFx0Y29uc3QgY3VycmVudFNlc3Npb24gPSB0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlLmdldCgpO1xuXHRcdFx0XHRjb25zdCBib3VuZFJlc291cmNlID0gdGhpcy5fY3VycmVudFZvaWNlSW5wdXRSZXNvdXJjZSgpO1xuXHRcdFx0XHRjb25zdCBpc093bmVyID0gISFjdXJyZW50U2Vzc2lvbiAmJiAhIWJvdW5kUmVzb3VyY2UgJiYgaXNFcXVhbChjdXJyZW50U2Vzc2lvbiwgYm91bmRSZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGdsb3dBY3RpdmUgPSBjb25uZWN0ZWQgJiYgaXNHbG93aW5nVm9pY2VTdGF0ZSh2b2ljZVN0YXRlKSAmJiAoc2ltdWxhdGluZyB8fCBpc093bmVyKTtcblxuXHRcdFx0XHRpZiAoIWdsb3dBY3RpdmUpIHtcblx0XHRcdFx0XHRnbG93Q29udHJvbGxlci5jbGVhcigpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEdldCBhdWRpbyBpbnRlbnNpdHkgZnJvbSBhbmFseXNlclxuXHRcdFx0XHRjb25zdCBhbmFseXNlciA9IHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmFuYWx5c2VyTm9kZVxuXHRcdFx0XHRcdD8/ICh2b2ljZVN0YXRlID09PSAnbGlzdGVuaW5nJyA/IHRoaXMubWljQ2FwdHVyZVNlcnZpY2UuYW5hbHlzZXJOb2RlIDogbnVsbClcblx0XHRcdFx0XHQ/PyBudWxsO1xuXHRcdFx0XHRsZXQgaW50ZW5zaXR5OiBudW1iZXI7XG5cdFx0XHRcdGlmICghYW5hbHlzZXIgJiYgc2ltdWxhdGluZykge1xuXHRcdFx0XHRcdC8vIE5vIGxpdmUgYXVkaW8gKGEgc2ltdWxhdGlvbik6IHN5bnRoZXNpemUgYSBsaXZlbHkgcHVsc2luZyBpbnRlbnNpdHlcblx0XHRcdFx0XHQvLyBzbyB0aGUgd2Fsa3Rocm91Z2ggZ2xvdyBiZWhhdmVzIGxpa2UgcmVhbCBzcGVlY2ggaW5zdGVhZCBvZiBzaXR0aW5nIGZsYXQuXG5cdFx0XHRcdFx0Y29uc3QgdCA9IERhdGUubm93KCkgLyAxMDAwO1xuXHRcdFx0XHRcdGludGVuc2l0eSA9IE1hdGgubWluKDEsIDAuMjggKyAwLjM0ICogTWF0aC5hYnMoTWF0aC5zaW4odCAqIDYuMSkpICsgMC4yMiAqIE1hdGguYWJzKE1hdGguc2luKHQgKiAxMS4zICsgMSkpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbnRlbnNpdHkgPSByZWFkVm9pY2VHbG93SW50ZW5zaXR5KGFuYWx5c2VyLCBnbG93RGF0YUFycmF5UmVmKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGdsb3dDb250cm9sbGVyLnJlbmRlcih2b2ljZVN0YXRlLCBpbnRlbnNpdHksIHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkpO1xuXHRcdFx0fTtcblx0XHRcdGFuaW1GcmFtZUlkID0gd2luLnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcblx0XHR9O1xuXHRcdGNvbnN0IHN0b3BHbG93QW5pbWF0aW9uID0gKCkgPT4ge1xuXHRcdFx0aWYgKGFuaW1GcmFtZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0d2luLmNhbmNlbEFuaW1hdGlvbkZyYW1lKGFuaW1GcmFtZUlkKTtcblx0XHRcdFx0YW5pbUZyYW1lSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRnbG93Q29udHJvbGxlci5jbGVhcigpO1xuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY29ubmVjdGVkID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZvaWNlU3RhdGUgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudm9pY2VTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBvbW5pSW5wdXRPcGVuID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm9tbmlJbnB1dE9wZW4ucmVhZChyZWFkZXIpO1xuXHRcdFx0Ly8gT25seSBydW4gdGhlIHBlci1mcmFtZSBnbG93IGxvb3AgZm9yIHN0YXRlcyB0aGF0IGFjdHVhbGx5IHJlbmRlciBhXG5cdFx0XHQvLyBnbG93LiBJZGxlIHJlbmRlcnMgbm9uZSwgc28ga2VlcGluZyB0aGUgbG9vcCBhbGl2ZSB0aGVuIHdvdWxkIGJ1cm4gYVxuXHRcdFx0Ly8gcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGNhbGxiYWNrIGV2ZXJ5IGZyYW1lIGZvciBub3RoaW5nLiBSZWFjdCB0b1xuXHRcdFx0Ly8gc2ltdWxhdGVkIHN0YXRlcyB0b28sIHNvIHRoZSB3YWxrdGhyb3VnaCBjb21tYW5kcyBsaWdodCB1cCB0aGUgZ2xvdy5cblx0XHRcdGNvbnN0IHNpbSA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2ltR2xvdyA9IHNpbSA9PT0gJ2xpc3RlbmluZycgfHwgc2ltID09PSAnc3BlYWtpbmcnO1xuXHRcdFx0aWYgKCFvbW5pSW5wdXRPcGVuICYmIChzaW1HbG93IHx8IChjb25uZWN0ZWQgJiYgaXNHbG93aW5nVm9pY2VTdGF0ZSh2b2ljZVN0YXRlKSkpKSB7XG5cdFx0XHRcdHN0YXJ0R2xvd0FuaW1hdGlvbigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RvcEdsb3dBbmltYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBzdG9wR2xvd0FuaW1hdGlvbigpIH0pO1xuXG5cdFx0Ly8gVm9pY2UgdHJhbnNjcmlwdCBpcyBwZXItc2Vzc2lvbi4gVGhlIHRyYW5zY3JpcHQgaXMgXCJvd25lZFwiIGJ5IHRoZVxuXHRcdC8vIHNlc3Npb24gdGhlIHVzZXIgaXMgZGljdGF0aW5nIGludG8gKHRoZSBleHBsaWNpdCB0YXJnZXQgc2Vzc2lvbiwgb3IgdGhlXG5cdFx0Ly8gZm9jdXNlZCBzZXNzaW9uIHdoZW4gZGljdGF0aW9uIGJlZ2FuKSBhbmQgaXMgb25seSBzaG93biBpbiB0aGF0XG5cdFx0Ly8gc2Vzc2lvbidzIHZpZXcuIFN3aXRjaGluZyBmb2N1cyB0byBhIGRpZmZlcmVudCBzZXNzaW9uIGhpZGVzIHRoZVxuXHRcdC8vIHRyYW5zY3JpcHQgaGVyZTsgc3dpdGNoaW5nIHRvIGFub3RoZXIgZXhpc3Rpbmcgc2Vzc2lvbiBzdG9wc1xuXHRcdC8vIHRyYW5zY3JpcHRpb24gc28gaXQgaXNuJ3QgbWlzcm91dGVkIHRoZXJlLiBBbnl0aGluZyBhbHJlYWR5IGRpY3RhdGVkIGlzXG5cdFx0Ly8gc3VibWl0dGVkIHRvIHRoZSBvcmlnaW5hbCBzZXNzaW9uOyBhbiBpZGxlIGhhbmRzLWZyZWUgdHVybiBtYXkgaW5zdGVhZFxuXHRcdC8vIGZvbGxvdyBhbiB1bnRpdGxlZCBcIk5ldyBDaGF0XCIgc2Vzc2lvbiBiZWZvcmUgYW55IGRpY3RhdGlvbiBzdGFydHMuXG5cdFx0bGV0IGxpc3RlbmluZ1Nlc3Npb246IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgb3duZXJTZXNzaW9uOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Ly8gRGV2L3ByZXZpZXc6IHdoZW4gYSB3YWxrdGhyb3VnaCBpcyBzaW11bGF0aW5nLCBkcml2ZSB0aGUgb3ZlcmxheSBoaW50IGZyb20gdGhlXG5cdFx0XHQvLyBzaW11bGF0ZWQgc3RhdGUgKyB2ZXJzaW9uIHNvIGVhY2ggZGVzaWduIHNob3dzIGl0cyBvd24gaW5zdHJ1Y3Rpb24uXG5cdFx0XHRjb25zdCBzaW1TdGF0ZSA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2ltVmVyc2lvbiA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZlcnNpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHNpbVN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKHNpbVN0YXRlID09PSAnaWRsZScgJiYgc2ltVmVyc2lvbikge1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy10cmFuc2NyaXB0Jyk7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXkucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRcdFx0Y29uc3QgaGludCA9ICQoJ3NwYW4ucGFydGlhbCcpO1xuXHRcdFx0XHRcdHN3aXRjaCAoc2ltVmVyc2lvbikge1xuXHRcdFx0XHRcdFx0Y2FzZSAnaGFuZHNGcmVlJzpcblx0XHRcdFx0XHRcdFx0aGludC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd2b2ljZU1vZGUuc2ltSGludC5oYW5kc0ZyZWUnLCBcIkhhbmRzLWZyZWUgXFx1MjAxNCBqdXN0IHN0YXJ0IHRhbGtpbmdcIik7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAna2V5Ym9hcmRIb2xkJzoge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBrYkxhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQudm9pY2VJbnB1dE1vZGUuaG9sZFRvVGFsaycpPy5nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdFx0XHRoaW50LnRleHRDb250ZW50ID0ga2JMYWJlbFxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlTW9kZS5wdHRIaW50JywgXCJIb2xkIHswfSB0byB0YWxrXCIsIGtiTGFiZWwpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgndm9pY2VNb2RlLnNpbUhpbnQua2V5Ym9hcmRIb2xkJywgXCJIb2xkIFNwYWNlIHRvIHRhbGtcIik7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2FzZSAnYnV0dG9uSG9sZCc6XG5cdFx0XHRcdFx0XHRcdGhpbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndm9pY2VNb2RlLnNpbUhpbnQuYnV0dG9uSG9sZCcsIFwiSG9sZCB0aGUgYnV0dG9uIHRvIHRhbGssIHRhcCB0byB0dXJuIG9mZlwiKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlICdjbGlja1RvZ2dsZSc6XG5cdFx0XHRcdFx0XHRcdGhpbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndm9pY2VNb2RlLnNpbUhpbnQuY2xpY2tUb2dnbGUnLCBcIlRhcCB0aGUgYnV0dG9uIHRvIHN0YXJ0IGxpc3RlbmluZ1wiKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5LmFwcGVuZChoaW50KTtcblx0XHRcdFx0XHR0cmFuc2NyaXB0U2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtdHJhbnNjcmlwdCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHVybnMgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudHJhbnNjcmlwdFR1cm5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGNvbm5lY3RlZCA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2b2ljZVN0YXRlID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgb21uaUlucHV0T3BlbiA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5vbW5pSW5wdXRPcGVuLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHRhcmdldFNlc3Npb24gPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudGFyZ2V0U2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvbiA9IHRoaXMuX2N1cnJlbnRTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2hvd1RyYW5zY3JpcHQgPSBzaG93VHJhbnNjcmlwdFNldHRpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2hvd0xpdmVUcmFuc2NyaXB0ID0gc2hvd0xpdmVUcmFuc2NyaXB0U2V0dGluZy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYXNJbnB1dCA9IGlucHV0VmFsdWUucmVhZChyZWFkZXIpLmxlbmd0aCA+IDA7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gdHVybnMuZmlsdGVyKHQgPT4gdC50ZXh0Lmxlbmd0aCA+IDAgfHwgKHQuc3BlYWtlciA9PT0gJ3VzZXInICYmIHQuaXNQYXJ0aWFsKSk7XG5cdFx0XHRjb25zdCBzaG93TGlzdGVuaW5nUGxhY2Vob2xkZXIgPSB2b2ljZVN0YXRlID09PSAnbGlzdGVuaW5nJyAmJiAoIXNob3dUcmFuc2NyaXB0IHx8ICFzaG93TGl2ZVRyYW5zY3JpcHQpO1xuXG5cdFx0XHRpZiAoIWNvbm5lY3RlZCB8fCBvbW5pSW5wdXRPcGVuKSB7XG5cdFx0XHRcdGxpc3RlbmluZ1Nlc3Npb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdG93bmVyU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtdHJhbnNjcmlwdCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhcHR1cmUgLyBtYWludGFpbiB0aGUgc2Vzc2lvbiB0aGUgY3VycmVudCB0cmFuc2NyaXB0IGJlbG9uZ3MgdG8uXG5cdFx0XHRpZiAodm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycpIHtcblx0XHRcdFx0aWYgKCFsaXN0ZW5pbmdTZXNzaW9uKSB7XG5cdFx0XHRcdFx0bGlzdGVuaW5nU2Vzc2lvbiA9IHRhcmdldFNlc3Npb24gPz8gY3VycmVudFNlc3Npb247XG5cdFx0XHRcdFx0b3duZXJTZXNzaW9uID0gbGlzdGVuaW5nU2Vzc2lvbjtcblx0XHRcdFx0fSBlbHNlIGlmICghdGFyZ2V0U2Vzc2lvbiAmJiBjdXJyZW50U2Vzc2lvbiAmJiAhaXNFcXVhbChjdXJyZW50U2Vzc2lvbiwgbGlzdGVuaW5nU2Vzc2lvbikpIHtcblx0XHRcdFx0XHRjb25zdCBkaWN0YXRpb25TZXNzaW9uID0gbGlzdGVuaW5nU2Vzc2lvbjtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVseURpY3RhdGluZyA9IHR1cm5zLnNvbWUodCA9PiB0LnNwZWFrZXIgPT09ICd1c2VyJyAmJiB0LmlzUGFydGlhbCAmJiB0LnRleHQudHJpbSgpLmxlbmd0aCA+IDApO1xuXHRcdFx0XHRcdGlmIChhY3RpdmVseURpY3RhdGluZykge1xuXHRcdFx0XHRcdFx0Ly8gVGhlIHVzZXIgaGFzIGFscmVhZHkgc3Bva2VuIFx1MjAxNCBzdWJtaXQgdGhlaXIgd29yZHMgdG8gdGhlXG5cdFx0XHRcdFx0XHQvLyBzZXNzaW9uIHRoZXkgd2VyZSBkaWN0YXRpbmcgaW50byByYXRoZXIgdGhhbiBsb3NpbmcgdGhlbVxuXHRcdFx0XHRcdFx0Ly8gb3IgbWlzcm91dGluZyB0byB0aGUgbmV3bHkgZm9jdXNlZCBzZXNzaW9uLlxuXHRcdFx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmZpbmlzaExpc3RlbmluZ0FuZFN1Ym1pdFRvKGRpY3RhdGlvblNlc3Npb24pO1xuXHRcdFx0XHRcdFx0bGlzdGVuaW5nU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihjdXJyZW50U2Vzc2lvbikpIHtcblx0XHRcdFx0XHRcdC8vIElkbGUgaGFuZHMtZnJlZSBsaXN0ZW4gZm9sbG93aW5nIGludG8gYSBmcmVzaCBOZXcgQ2hhdC5cblx0XHRcdFx0XHRcdGxpc3RlbmluZ1Nlc3Npb24gPSBjdXJyZW50U2Vzc2lvbjtcblx0XHRcdFx0XHRcdG93bmVyU2Vzc2lvbiA9IGN1cnJlbnRTZXNzaW9uO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBJZGxlIGxpc3RlbiBhbmQgdGhlIHVzZXIgc3dpdGNoZWQgdG8gYW5vdGhlciBleGlzdGluZ1xuXHRcdFx0XHRcdFx0Ly8gc2Vzc2lvbiBiZWZvcmUgc2F5aW5nIGFueXRoaW5nIFx1MjAxNCBub3RoaW5nIHRvIHN1Ym1pdC5cblx0XHRcdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5kaXNjYXJkTGlzdGVuaW5nKCk7XG5cdFx0XHRcdFx0XHRsaXN0ZW5pbmdTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQWxsb3cgdGhlIG5leHQgZGljdGF0aW9uIHRvIHJlLWNhcHR1cmUgdGhlIG93bmluZyBzZXNzaW9uLlxuXHRcdFx0XHRsaXN0ZW5pbmdTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEb24ndCBzaG93IGEgdHJhbnNjcmlwdCB0aGF0IGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgc2Vzc2lvbiBoZXJlLCBvclxuXHRcdFx0Ly8gb24gYSBwYW5lIHRoYXQgaXNuJ3QgdGhlIHNpbmdsZSBpbnB1dCB2b2ljZSBpcyBib3VuZCB0byAoZm9jdXMtYXdhcmUsXG5cdFx0XHQvLyBzbyBhIGNoYXQgZWRpdG9yIG9wZW4gYWxvbmdzaWRlIHRoaXMgcGFuZSBkb2Vzbid0IGFsc28gc2hvdyBpdCkuXG5cdFx0XHRjb25zdCBib3VuZFJlc291cmNlID0gdGhpcy5fY3VycmVudFZvaWNlSW5wdXRSZXNvdXJjZShyZWFkZXIpO1xuXHRcdFx0aWYgKGJvdW5kUmVzb3VyY2UgJiYgY3VycmVudFNlc3Npb24gJiYgIWlzRXF1YWwoYm91bmRSZXNvdXJjZSwgY3VycmVudFNlc3Npb24pKSB7XG5cdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWZmZWN0aXZlT3duZXIgPSB0YXJnZXRTZXNzaW9uID8/IG93bmVyU2Vzc2lvbjtcblx0XHRcdGlmIChlZmZlY3RpdmVPd25lciAmJiBjdXJyZW50U2Vzc2lvbiAmJiAhaXNFcXVhbChlZmZlY3RpdmVPd25lciwgY3VycmVudFNlc3Npb24pKSB7XG5cdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG93IGhpbnQgd2hlbiBjb25uZWN0ZWQgYnV0IG5vIHRyYW5zY3JpcHQgeWV0XG5cdFx0XHRpZiAodmlzaWJsZS5sZW5ndGggPT09IDAgfHwgIXNob3dUcmFuc2NyaXB0IHx8IHNob3dMaXN0ZW5pbmdQbGFjZWhvbGRlcikge1xuXHRcdFx0XHRpZiAoaGFzSW5wdXQpIHtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaGFuZHNGcmVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignYWdlbnRzLnZvaWNlLmhhbmRzRnJlZScpID09PSB0cnVlO1xuXHRcdFx0XHRpZiAoc2hvd0xpc3RlbmluZ1BsYWNlaG9sZGVyKSB7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheS5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdFx0XHRjb25zdCBsaXN0ZW5pbmcgPSAkKCdzcGFuLmxpc3RlbmluZycpO1xuXHRcdFx0XHRcdGxpc3RlbmluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd2b2ljZU1vZGUubGlzdGVuaW5nJywgXCJMaXN0ZW5pbmcuLi5cIik7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXkuYXBwZW5kKGxpc3RlbmluZyk7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdFNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHRcdFx0fSBlbHNlIGlmICghc2hvd1RyYW5zY3JpcHQgJiYgdm9pY2VTdGF0ZSA9PT0gJ3NwZWFraW5nJykge1xuXHRcdFx0XHRcdC8vIFRyYW5zY3JpcHQgaXMgZGlzYWJsZWQ6IGhpbnQgdGhhdCB0aGUgdXNlciBjYW4gaW50ZXJydXB0IHBsYXliYWNrLlxuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy10cmFuc2NyaXB0Jyk7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXkucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRcdFx0Y29uc3QgaGludCA9ICQoJ3NwYW4ucGFydGlhbCcpO1xuXHRcdFx0XHRcdGNvbnN0IGtiID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQudm9pY2VJbnB1dE1vZGUuaG9sZFRvVGFsaycpXG5cdFx0XHRcdFx0XHQ/PyB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGsnKTtcblx0XHRcdFx0XHRjb25zdCBrYkxhYmVsID0ga2I/LmdldExhYmVsKCk7XG5cdFx0XHRcdFx0aGludC50ZXh0Q29udGVudCA9IGtiTGFiZWxcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlTW9kZS5iYXJnZUluSGludCcsIFwiU3BlYWsgb3IgdXNlIHswfVwiLCBrYkxhYmVsKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgndm9pY2VNb2RlLmJhcmdlSW5IaW50Tm9LYicsIFwiU3BlYWsgdG8gYmFyZ2UgaW5cIik7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXkuYXBwZW5kKGhpbnQpO1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodm9pY2VTdGF0ZSA9PT0gJ2lkbGUnICYmIHZpc2libGUubGVuZ3RoID09PSAwICYmIHNob3dUcmFuc2NyaXB0ICYmICFoYW5kc0ZyZWUpIHtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtdHJhbnNjcmlwdCcpO1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5LnJlcGxhY2VDaGlsZHJlbigpO1xuXHRcdFx0XHRcdGNvbnN0IGhpbnQgPSAkKCdzcGFuLnBhcnRpYWwnKTtcblx0XHRcdFx0XHRjb25zdCBrYiA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnYWdlbnRzVm9pY2UucHVzaFRvVGFsaycpO1xuXHRcdFx0XHRcdGNvbnN0IGtiTGFiZWwgPSBrYj8uZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHRoaW50LnRleHRDb250ZW50ID0ga2JMYWJlbFxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgndm9pY2VNb2RlLnB0dE9yQmFyZ2VJbkhpbnQnLCBcIlByZXNzIHswfSB0byB0YWxrIG9yIGJhcmdlIGluXCIsIGtiTGFiZWwpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCd2b2ljZU1vZGUuY2xpY2tNaWNPckJhcmdlSW5IaW50JywgXCJDbGljayB2b2ljZSBtb2RlIHRvIHRhbGsgb3IgYmFyZ2UgaW5cIik7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXkuYXBwZW5kKGhpbnQpO1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy10cmFuc2NyaXB0Jyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLmNsYXNzTGlzdC5hZGQoJ2hhcy10cmFuc2NyaXB0Jyk7XG5cdFx0XHQvLyBTaG93IG9ubHkgdGhlIGxhdGVzdCB2aXNpYmxlIHR1cm5cblx0XHRcdGNvbnN0IGxhc3RUdXJuID0gdmlzaWJsZVt2aXNpYmxlLmxlbmd0aCAtIDFdO1xuXHRcdFx0Y29uc3QgY29udGVudEVsZW1lbnRzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0XHRpZiAobGFzdFR1cm4uc3BlYWtlciA9PT0gJ3VzZXInKSB7XG5cdFx0XHRcdGNvbnN0IHNwYW4gPSAkKCdzcGFuJyk7XG5cdFx0XHRcdGlmIChsYXN0VHVybi5pc1BhcnRpYWwpIHtcblx0XHRcdFx0XHRjb25zdCBjb21taXR0ZWRQYXJ0ID0gbGFzdFR1cm4uY29tbWl0dGVkIHx8ICcnO1xuXHRcdFx0XHRcdGNvbnN0IHVuc3VyZVBhcnQgPSBsYXN0VHVybi50ZXh0LnNsaWNlKGNvbW1pdHRlZFBhcnQubGVuZ3RoKTtcblx0XHRcdFx0XHRpZiAoY29tbWl0dGVkUGFydCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYyA9ICQoJ3NwYW4uY29tbWl0dGVkJyk7XG5cdFx0XHRcdFx0XHRjLnRleHRDb250ZW50ID0gY29tbWl0dGVkUGFydDtcblx0XHRcdFx0XHRcdHNwYW4uYXBwZW5kKGMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB1ID0gJCgnc3Bhbi5wYXJ0aWFsJyk7XG5cdFx0XHRcdFx0dS50ZXh0Q29udGVudCA9IHVuc3VyZVBhcnQgKyAnXFx1MjU4OSc7XG5cdFx0XHRcdFx0c3Bhbi5hcHBlbmQodSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3Bhbi5jbGFzc05hbWUgPSAnY29tbWl0dGVkJztcblx0XHRcdFx0XHRzcGFuLnRleHRDb250ZW50ID0gbGFzdFR1cm4udGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250ZW50RWxlbWVudHMucHVzaChzcGFuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGRpdiA9ICQoJ2Rpdi5hc3Npc3RhbnQtdGV4dCcpO1xuXHRcdFx0XHRkaXYudGV4dENvbnRlbnQgPSBsYXN0VHVybi50ZXh0O1xuXHRcdFx0XHRjb250ZW50RWxlbWVudHMucHVzaChkaXYpO1xuXHRcdFx0fVxuXHRcdFx0dHJhbnNjcmlwdE92ZXJsYXkucmVwbGFjZUNoaWxkcmVuKC4uLmNvbnRlbnRFbGVtZW50cyk7XG5cdFx0XHR0cmFuc2NyaXB0U2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0dHJhbnNjcmlwdFNjcm9sbGFibGUuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IDAgfSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFNlc3Npb25zIENvbnRyb2xcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVNTSU9OU19TSURFQkFSX01JTl9XSURUSCA9IDIwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTlNfU0lERUJBUl9TTkFQX1RIUkVTSE9MRCA9IHRoaXMuU0VTU0lPTlNfU0lERUJBUl9NSU5fV0lEVEggLyAyOyAvLyBzbmFwIHRvIGhpZGUgd2hlbiBkcmFnZ2VkIGJlbG93IGhhbGYgb2YgbWluaW11bSB3aWR0aFxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVNTSU9OU19TSURFQkFSX0RFRkFVTFRfV0lEVEggPSAzMDA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFU1NJT05TX1NJREVCQVJfQk9SREVSX1dJRFRIID0gMTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0hBVF9XSURHRVRfREVGQVVMVF9XSURUSCA9IDMwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTlNfU0lERUJBUl9WSUVXX01JTl9XSURUSCA9IHRoaXMuQ0hBVF9XSURHRVRfREVGQVVMVF9XSURUSCArIHRoaXMuU0VTU0lPTlNfU0lERUJBUl9ERUZBVUxUX1dJRFRIO1xuXG5cdHByaXZhdGUgc2Vzc2lvbnNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zVGl0bGVDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zVGl0bGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zTmV3QnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZXNzaW9uc0NvbnRyb2xDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zQ29udHJvbDogQWdlbnRTZXNzaW9uc0NvbnRyb2wgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGFnZW50U2Vzc2lvbnNDb250cm9sKCk6IEFnZW50U2Vzc2lvbnNDb250cm9sIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuc2Vzc2lvbnNDb250cm9sOyB9XG5cblx0cHJpdmF0ZSBzZXNzaW9uc1ZpZXdlclZpc2libGU6IGJvb2xlYW47XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkO1xuXHRwcml2YXRlIHNlc3Npb25zVmlld2VyT3JpZW50YXRpb25Db25maWd1cmF0aW9uOiAnc3RhY2tlZCcgfCAnc2lkZUJ5U2lkZScgPSAnc2lkZUJ5U2lkZSc7XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbkNvbnRleHQ6IElDb250ZXh0S2V5PEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbj47XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJWaXNpYmlsaXR5Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJQb3NpdGlvbkNvbnRleHQ6IElDb250ZXh0S2V5PEFnZW50U2Vzc2lvbnNWaWV3ZXJQb3NpdGlvbj47XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBzZXNzaW9uc1ZpZXdlclNhc2g6IFNhc2ggfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNWaWV3ZXJTYXNoRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRwcml2YXRlIGNyZWF0ZVNlc3Npb25zQ29udHJvbChwYXJlbnQ6IEhUTUxFbGVtZW50KTogQWdlbnRTZXNzaW9uc0NvbnRyb2wge1xuXHRcdGNvbnN0IHNlc3Npb25zQ29udGFpbmVyID0gdGhpcy5zZXNzaW9uc0NvbnRhaW5lciA9IHBhcmVudC5hcHBlbmRDaGlsZCgkKCcuYWdlbnQtc2Vzc2lvbnMtY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gU2Vzc2lvbnMgVGl0bGVcblx0XHRjb25zdCBzZXNzaW9uc1RpdGxlQ29udGFpbmVyID0gdGhpcy5zZXNzaW9uc1RpdGxlQ29udGFpbmVyID0gYXBwZW5kKHNlc3Npb25zQ29udGFpbmVyLCAkKCcuYWdlbnQtc2Vzc2lvbnMtdGl0bGUtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHNlc3Npb25zVGl0bGUgPSB0aGlzLnNlc3Npb25zVGl0bGUgPSBhcHBlbmQoc2Vzc2lvbnNUaXRsZUNvbnRhaW5lciwgJCgnc3Bhbi5hZ2VudC1zZXNzaW9ucy10aXRsZScpKTtcblx0XHRzZXNzaW9uc1RpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Nlc3Npb25zJywgXCJTZXNzaW9uc1wiKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2Vzc2lvbnNUaXRsZSwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnNlc3Npb25zQ29udHJvbD8uc2Nyb2xsVG9Ub3AoKTtcblx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5mb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNlc3Npb25zIFRvb2xiYXJcblx0XHRjb25zdCBzZXNzaW9uc1Rvb2xiYXJDb250YWluZXIgPSBhcHBlbmQoc2Vzc2lvbnNUaXRsZUNvbnRhaW5lciwgJCgnLmFnZW50LXNlc3Npb25zLXRvb2xiYXInKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgc2Vzc2lvbnNUb29sYmFyQ29udGFpbmVyLCBNZW51SWQuQWdlbnRTZXNzaW9uc1Rvb2xiYXIsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH1cblx0XHR9KSk7XG5cblx0XHQvLyBTZXNzaW9ucyBGaWx0ZXJcblx0XHRjb25zdCBzZXNzaW9uc0ZpbHRlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc0ZpbHRlciwge1xuXHRcdFx0ZmlsdGVyTWVudUlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc1ZpZXdlckZpbHRlclN1Yk1lbnUsXG5cdFx0XHRncm91cFJlc3VsdHM6ICgpID0+IHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQgPyBBZ2VudFNlc3Npb25zR3JvdXBpbmcuQ2FwcGVkIDogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGVcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHNlc3Npb25zRmlsdGVyLm9uRGlkQ2hhbmdlLCAoKSA9PiB7XG5cdFx0XHRzZXNzaW9uc1Rvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZmlsdGVyZWQnLCAhc2Vzc2lvbnNGaWx0ZXIuaXNEZWZhdWx0KCkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIE5ldyBTZXNzaW9uIEJ1dHRvblxuXHRcdGNvbnN0IG5ld1Nlc3Npb25CdXR0b25Db250YWluZXIgPSB0aGlzLnNlc3Npb25zTmV3QnV0dG9uQ29udGFpbmVyID0gYXBwZW5kKHNlc3Npb25zQ29udGFpbmVyLCAkKCcuYWdlbnQtc2Vzc2lvbnMtbmV3LWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbkJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24obmV3U2Vzc2lvbkJ1dHRvbkNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXHRcdG5ld1Nlc3Npb25CdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbmV3U2Vzc2lvbicsIFwiTmV3IFNlc3Npb25cIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3U2Vzc2lvbkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUNUSU9OX0lEX05FV19DSEFULCB0aGlzLmdldEFjdGlvbnNDb250ZXh0KCkpKSk7XG5cblx0XHQvLyBTZXNzaW9ucyBDb250cm9sXG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIgPSBhcHBlbmQoc2Vzc2lvbnNDb250YWluZXIsICQoJy5hZ2VudC1zZXNzaW9ucy1jb250cm9sLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBzZXNzaW9uc0NvbnRyb2wgPSB0aGlzLnNlc3Npb25zQ29udHJvbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc0NvbnRyb2wsIHRoaXMuc2Vzc2lvbnNDb250cm9sQ29udGFpbmVyLCB7XG5cdFx0XHRzb3VyY2U6ICdjaGF0Vmlld1BhbmUnLFxuXHRcdFx0ZmlsdGVyOiBzZXNzaW9uc0ZpbHRlcixcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRnZXRIb3ZlclBvc2l0aW9uOiAoKSA9PiB0aGlzLmdldFNlc3Npb25Ib3ZlclBvc2l0aW9uKCksXG5cdFx0XHR0cmFja0FjdGl2ZUVkaXRvclNlc3Npb246ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuICF0aGlzLl93aWRnZXQgfHwgdGhpcy5fd2lkZ2V0LmlzRW1wdHkoKTsgLy8gb25seSB0cmFjayBhbmQgcmV2ZWFsIGlmIGNoYXQgd2lkZ2V0IGlzIGVtcHR5XG5cdFx0XHR9LFxuXHRcdFx0b3ZlcnJpZGVTZXNzaW9uT3Blbk9wdGlvbnM6IG9wZW5FdmVudCA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkICYmICFvcGVuRXZlbnQuc2lkZUJ5U2lkZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLm9wZW5FdmVudCwgZWRpdG9yT3B0aW9uczogeyAuLi5vcGVuRXZlbnQuZWRpdG9yT3B0aW9ucywgcHJlc2VydmVGb2N1czogZmFsc2UgLyogZm9jdXMgdGhlIGNoYXQgd2lkZ2V0IHdoZW4gb3BlbmluZyBmcm9tIHN0YWNrZWQgc2Vzc2lvbnMgdmlld2VyIHNpbmNlIHRoaXMgY2xvc2VzIHRoZSBzdGFja2VkIHZpZXdlciAqLyB9IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG9wZW5FdmVudDtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHNlc3Npb25zQ29udHJvbC5zZXRWaXNpYmxlKHZpc2libGUpKSk7XG5cblx0XHRzZXNzaW9uc1Rvb2xiYXIuY29udGV4dCA9IHNlc3Npb25zQ29udHJvbDtcblxuXHRcdC8vIFJlZnJlc2ggc2Vzc2lvbnMgd2hlbiB3aW5kb3cgZ2V0cyBmb2N1cyB0byBjb21wZW5zYXRlIGZvciBtaXNzaW5nIGV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhoYXNGb2N1cyA9PiB7XG5cdFx0XHRpZiAoaGFzRm9jdXMpIHtcblx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBEZWFsIHdpdGggb3JpZW50YXRpb24gY29uZmlndXJhdGlvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zT3JpZW50YXRpb24pKSwgZSA9PiB7XG5cdFx0XHRjb25zdCBuZXdTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3N0YWNrZWQnIHwgJ3NpZGVCeVNpZGUnIHwgdW5rbm93bj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc09yaWVudGF0aW9uKTtcblx0XHRcdHRoaXMuZG9VcGRhdGVDb25maWd1cmVkU2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbihuZXdTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbiwgeyB1cGRhdGVDb25maWd1cmF0aW9uOiBmYWxzZSwgbGF5b3V0OiAhIWUgfSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHNlc3Npb25zQ29udHJvbDtcblx0fVxuXG5cdGdldFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24oKTogQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uO1xuXHR9XG5cblx0dXBkYXRlQ29uZmlndXJlZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24ob3JpZW50YXRpb246ICdzdGFja2VkJyB8ICdzaWRlQnlTaWRlJyB8IHVua25vd24pOiB2b2lkIHtcblx0XHRyZXR1cm4gdGhpcy5kb1VwZGF0ZUNvbmZpZ3VyZWRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uKG9yaWVudGF0aW9uLCB7IHVwZGF0ZUNvbmZpZ3VyYXRpb246IHRydWUsIGxheW91dDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVDb25maWd1cmVkU2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbihvcmllbnRhdGlvbjogJ3N0YWNrZWQnIHwgJ3NpZGVCeVNpZGUnIHwgdW5rbm93biwgb3B0aW9uczogeyB1cGRhdGVDb25maWd1cmF0aW9uOiBib29sZWFuOyBsYXlvdXQ6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb25Db25maWd1cmF0aW9uID0gdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbjtcblxuXHRcdGxldCB2YWxpZGF0ZWRPcmllbnRhdGlvbjogJ3N0YWNrZWQnIHwgJ3NpZGVCeVNpZGUnO1xuXHRcdGlmIChvcmllbnRhdGlvbiA9PT0gJ3N0YWNrZWQnIHx8IG9yaWVudGF0aW9uID09PSAnc2lkZUJ5U2lkZScpIHtcblx0XHRcdHZhbGlkYXRlZE9yaWVudGF0aW9uID0gb3JpZW50YXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbGlkYXRlZE9yaWVudGF0aW9uID0gJ3NpZGVCeVNpZGUnOyAvLyBkZWZhdWx0XG5cdFx0fVxuXHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbkNvbmZpZ3VyYXRpb24gPSB2YWxpZGF0ZWRPcmllbnRhdGlvbjtcblxuXHRcdGlmIChvbGRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbiA9PT0gdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbikge1xuXHRcdFx0cmV0dXJuOyAvLyBubyBjaGFuZ2UgZnJvbSBvdXIgZXhpc3RpbmcgY29uZmlnXG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMudXBkYXRlQ29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zT3JpZW50YXRpb24sIHZhbGlkYXRlZE9yaWVudGF0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5sYXlvdXQpIHtcblx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNlc3Npb25zQ29udHJvbFZpc2liaWxpdHkoKTogeyBjaGFuZ2VkOiBib29sZWFuOyB2aXNpYmxlOiBib29sZWFuIH0ge1xuXHRcdGlmICghdGhpcy5zZXNzaW9uc0NvbnRhaW5lciB8fCAhdGhpcy52aWV3UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIHsgY2hhbmdlZDogZmFsc2UsIHZpc2libGU6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0bGV0IG5ld1Nlc3Npb25zQ29udGFpbmVyVmlzaWJsZTogYm9vbGVhbjtcblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWQpKSB7XG5cdFx0XHRuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGUgPSBmYWxzZTsgLy8gZGlzYWJsZWQgaW4gc2V0dGluZ3Ncblx0XHR9IGVsc2Uge1xuXG5cdFx0XHQvLyBTZXNzaW9ucyBjb250cm9sOiBzdGFja2VkXG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCkge1xuXHRcdFx0XHRuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGUgPVxuXHRcdFx0XHRcdCghIXRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuY29tcGxldGVkIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5oYXNCeW9rTW9kZWxzKSAmJlx0XHRcdFx0XHQvLyBjaGF0IGlzIHNldHVwIChvdGhlcndpc2UgbWFrZSByb29tIGZvciB0ZXJtcyBhbmQgd2VsY29tZSlcblx0XHRcdFx0XHQoIXRoaXMuX3dpZGdldCB8fCAodGhpcy5fd2lkZ2V0LmlzRW1wdHkoKSAmJiAhIXRoaXMuX3dpZGdldC52aWV3TW9kZWwgJiYgIXRoaXMuX3dpZGdldC52aWV3TW9kZWwubW9kZWwudGl0bGUpKSAmJlx0Ly8gY2hhdCB3aWRnZXQgZW1wdHkgKGJ1dCBub3Qgd2hlbiBtb2RlbCBpcyBsb2FkaW5nIG9yIGhhcyBhIHRpdGxlKVxuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25zTGlzdFN1cHByZXNzaW9uQ291bnQgPT09IDAgJiZcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIG5vdCBtaWQtdHJhbnNpdGlvbiAoYSBzbG93IHNlc3Npb24gdHJhbnNpZW50bHkgc2hvd3MgYW4gZW1wdHkgd2lkZ2V0KVxuXHRcdFx0XHRcdCF0aGlzLndlbGNvbWVDb250cm9sbGVyPy5pc1Nob3dpbmdXZWxjb21lLmdldCgpO1x0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyB3ZWxjb21lIG5vdCBzaG93aW5nXG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlc3Npb25zIGNvbnRyb2w6IHNpZGViYXJcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGUgPVxuXHRcdFx0XHRcdCF0aGlzLndlbGNvbWVDb250cm9sbGVyPy5pc1Nob3dpbmdXZWxjb21lLmdldCgpICYmXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyB3ZWxjb21lIG5vdCBzaG93aW5nXG5cdFx0XHRcdFx0ISF0aGlzLmxhc3REaW1lbnNpb25zICYmIHRoaXMubGFzdERpbWVuc2lvbnMud2lkdGggPj0gQ2hhdFZpZXdQYW5lLlNFU1NJT05TX1NJREVCQVJfVklFV19NSU5fV0lEVEg7XHQvLyBoYXMgc2Vzc2lvbnMgb3IgaXMgc2hvd2luZyBhbGwgc2Vzc2lvbnNcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1zZXNzaW9ucy1jb250cm9sJywgbmV3U2Vzc2lvbnNDb250YWluZXJWaXNpYmxlKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zQ29udGFpbmVyVmlzaWJsZSA9IHRoaXMuc2Vzc2lvbnNDb250YWluZXIuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xuXHRcdHNldFZpc2liaWxpdHkobmV3U2Vzc2lvbnNDb250YWluZXJWaXNpYmxlLCB0aGlzLnNlc3Npb25zQ29udGFpbmVyKTtcblx0XHR0aGlzLnNlc3Npb25zVmlld2VyVmlzaWJsZSA9IG5ld1Nlc3Npb25zQ29udGFpbmVyVmlzaWJsZTtcblx0XHR0aGlzLnNlc3Npb25zVmlld2VyVmlzaWJpbGl0eUNvbnRleHQuc2V0KG5ld1Nlc3Npb25zQ29udGFpbmVyVmlzaWJsZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hhbmdlZDogc2Vzc2lvbnNDb250YWluZXJWaXNpYmxlICE9PSBuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGUsXG5cdFx0XHR2aXNpYmxlOiBuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGVcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCB7IGNoYW5nZWQgfSA9IHRoaXMudXBkYXRlU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLnJlbGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN1cHByZXNzZXMgdGhlIHNlc3Npb25zIGxpc3QgdW50aWwgdGhlIHJldHVybmVkIGRpc3Bvc2FibGUgaXMgZGlzcG9zZWQuXG5cdCAqIFVzZWQgdG8gc3BhbiBhIHdob2xlIHNlc3Npb24gdHJhbnNpdGlvbiAoZS5nLiBhIFwiQ29udGludWUgaW5cdTIwMjZcIiBtaWdyYXRpb246XG5cdCAqIGxvYWQgXHUyMTkyIG1hdGVyaWFsaXppbmcgc2VuZCBcdTIxOTIgcmViaW5kKSBzbyB0aGUgdHJhbnNpZW50bHktZW1wdHkgd2lkZ2V0IG5ldmVyXG5cdCAqIGZhbGxzIGJhY2sgdG8gdGhlIGxpc3QuXG5cdCAqL1xuXHRiZWdpblNlc3Npb25zTGlzdFN1cHByZXNzaW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9zZXNzaW9uc0xpc3RTdXBwcmVzc2lvbkNvdW50Kys7XG5cdFx0dGhpcy5yZWZyZXNoU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNMaXN0U3VwcHJlc3Npb25Db3VudC0tO1xuXHRcdFx0dGhpcy5yZWZyZXNoU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZFNlc3Npb25zKCk6IElBZ2VudFNlc3Npb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnNDb250cm9sPy5nZXRGb2N1cygpID8/IFtdO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIENoYXQgQ29udHJvbFxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1JTl9DSEFUX1dJREdFVF9IRUlHSFQgPSAxMTY7XG5cblx0cHJpdmF0ZSBfd2lkZ2V0ITogQ2hhdFdpZGdldDtcblx0Z2V0IHdpZGdldCgpOiBDaGF0V2lkZ2V0IHsgcmV0dXJuIHRoaXMuX3dpZGdldDsgfVxuXG5cdHByaXZhdGUgdGl0bGVDb250cm9sOiBDaGF0Vmlld1RpdGxlQ29udHJvbCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNyZWF0ZUNoYXRDb250cm9sKHBhcmVudDogSFRNTEVsZW1lbnQpOiBDaGF0V2lkZ2V0IHtcblx0XHRjb25zdCBjaGF0Q29udHJvbHNDb250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcuY2hhdC1jb250cm9scy1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBsb2NhdGlvbkJhc2VkQ29sb3JzID0gdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCk7XG5cblx0XHRjb25zdCBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihnZXRXaW5kb3coY2hhdENvbnRyb2xzQ29udGFpbmVyKSkuYXBwZW5kQ2hpbGQoJCgnLmNoYXQtZWRpdG9yLW92ZXJmbG93Lm1vbmFjby1lZGl0b3InKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdC8vIENoYXQgVGl0bGVcblx0XHR0aGlzLmNyZWF0ZUNoYXRUaXRsZUNvbnRyb2woY2hhdENvbnRyb2xzQ29udGFpbmVyKTtcblxuXHRcdC8vIENoYXQgV2lkZ2V0XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHR0aGlzLl93aWRnZXQgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRXaWRnZXQsXG5cdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0eyB2aWV3SWQ6IHRoaXMuaWQgfSxcblx0XHRcdHtcblx0XHRcdFx0YXV0b1Njcm9sbDogbW9kZSA9PiBtb2RlICE9PSBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRyZW5kZXJGb2xsb3d1cHM6IHRydWUsXG5cdFx0XHRcdHN1cHBvcnRzRmlsZVJlZmVyZW5jZXM6IHRydWUsXG5cdFx0XHRcdGNsZWFyOiAoKSA9PiB0aGlzLmNsZWFyKCksXG5cdFx0XHRcdGVuYWJsZUZpbmQ6IHRydWUsXG5cdFx0XHRcdHJlbmRlcmVyT3B0aW9uczoge1xuXHRcdFx0XHRcdHJlbmRlclRleHRFZGl0c0FzU3VtbWFyeTogKHVyaSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZWZlcmVuY2VzRXhwYW5kZWRXaGVuRW1wdHlSZXNwb25zZTogZmFsc2UsXG5cdFx0XHRcdFx0cHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlOiBtb2RlID0+IG1vZGUgIT09IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRcdGVuYWJsZUltcGxpY2l0Q29udGV4dDogdHJ1ZSxcblx0XHRcdFx0ZW5hYmxlV29ya2luZ1NldDogJ2V4cGxpY2l0Jyxcblx0XHRcdFx0c3VwcG9ydHNDaGFuZ2luZ01vZGVzOiB0cnVlLFxuXHRcdFx0XHRkbmRDb250YWluZXI6IHBhcmVudCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxpc3RGb3JlZ3JvdW5kOiBTSURFX0JBUl9GT1JFR1JPVU5ELFxuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogbG9jYXRpb25CYXNlZENvbG9ycy5iYWNrZ3JvdW5kLFxuXHRcdFx0XHRvdmVybGF5QmFja2dyb3VuZDogbG9jYXRpb25CYXNlZENvbG9ycy5vdmVybGF5QmFja2dyb3VuZCxcblx0XHRcdFx0aW5wdXRFZGl0b3JCYWNrZ3JvdW5kOiBsb2NhdGlvbkJhc2VkQ29sb3JzLmJhY2tncm91bmQsXG5cdFx0XHRcdHJlc3VsdEVkaXRvckJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHR9KSk7XG5cdFx0dGhpcy5fd2lkZ2V0LnJlbmRlcihjaGF0Q29udHJvbHNDb250YWluZXIsIHBhcmVudCk7XG5cblx0XHRjb25zdCB1cGRhdGVXaWRnZXRWaXNpYmlsaXR5ID0gKHJlYWRlcj86IElSZWFkZXIpID0+IHRoaXMuX3dpZGdldC5zZXRWaXNpYmxlKHRoaXMuaXNCb2R5VmlzaWJsZSgpICYmICF0aGlzLndlbGNvbWVDb250cm9sbGVyPy5pc1Nob3dpbmdXZWxjb21lLnJlYWQocmVhZGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KCgpID0+IHVwZGF0ZVdpZGdldFZpc2liaWxpdHkoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHVwZGF0ZVdpZGdldFZpc2liaWxpdHkocmVhZGVyKSkpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ2hhdFRpdGxlQ29udHJvbChwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy50aXRsZUNvbnRyb2wgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3VGl0bGVDb250cm9sLFxuXHRcdFx0cGFyZW50LFxuXHRcdFx0e1xuXHRcdFx0XHRmb2N1c0NoYXQ6ICgpID0+IHRoaXMuX3dpZGdldC5mb2N1c0lucHV0KClcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGl0bGVDb250cm9sLm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHtcblx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29udHJvbHNMaXN0ZW5lcnMoc2Vzc2lvbnNDb250cm9sOiBBZ2VudFNlc3Npb25zQ29udHJvbCwgY2hhdFdpZGdldDogQ2hhdFdpZGdldCwgd2VsY29tZUNvbnRyb2xsZXI6IENoYXRWaWV3V2VsY29tZUNvbnRyb2xsZXIpOiB2b2lkIHtcblxuXHRcdC8vIFNlc3Npb25zIGNvbnRyb2wgdmlzaWJpbGl0eSBpcyBpbXBhY3RlZCBieSBtdWx0aXBsZSB0aGluZ3M6XG5cdFx0Ly8gLSBjaGF0IHdpZGdldCBiZWluZyBpbiBlbXB0eSBzdGF0ZSBvciBzaG93aW5nIGEgY2hhdFxuXHRcdC8vIC0gZXh0ZW5zaW9ucyBwcm92aWRlZCB3ZWxjb21lIHZpZXcgc2hvd2luZyBvciBub3Rcblx0XHQvLyAtIGNvbmZpZ3VyYXRpb24gc2V0dGluZ1xuXHRcdC8vIC0gYGhhc0J5b2tNb2RlbHNgIGZsaXBwaW5nIChCWU9LIG1vZGVscyBiZWNvbWluZyBhdmFpbGFibGUgb3IgZ29pbmcgYXdheSlcblx0XHRjb25zdCBoYXNCeW9rTW9kZWxzQ29udGV4dEtleXMgPSBuZXcgU2V0KFtDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5oYXNCeW9rTW9kZWxzLmtleV0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShcblx0XHRcdGNoYXRXaWRnZXQub25EaWRDaGFuZ2VFbXB0eVN0YXRlLFxuXHRcdFx0RXZlbnQuZnJvbU9ic2VydmFibGUod2VsY29tZUNvbnRyb2xsZXIuaXNTaG93aW5nV2VsY29tZSksXG5cdFx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZCkpLFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCBlID0+IGUuYWZmZWN0c1NvbWUoaGFzQnlva01vZGVsc0NvbnRleHRLZXlzKSlcblx0XHQpKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkKSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5jbGVhckZvY3VzKCk7IC8vIGltcHJvdmUgdmlzdWFsIGFwcGVhcmFuY2Ugd2hlbiBzd2l0Y2hpbmcgdmlzaWJpbGl0eSBieSBjbGVhcmluZyBmb2N1c1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBjaGFuZ2VkOiB2aXNpYmlsaXR5Q2hhbmdlZCB9ID0gdGhpcy51cGRhdGVTZXNzaW9uc0NvbnRyb2xWaXNpYmlsaXR5KCk7XG5cdFx0XHRpZiAodmlzaWJpbGl0eUNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5yZWxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIHRoZSBhY3RpdmUgY2hhdCBtb2RlbCBhbmQgcmV2ZWFsIGl0IGluIHRoZSBzZXNzaW9ucyBjb250cm9sIGlmIHNpZGUtYnktc2lkZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRXaWRnZXQub25EaWRDaGFuZ2VWaWV3TW9kZWwoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjaGF0V2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWw7XG5cdFx0XHR0aGlzLnRpdGxlQ29udHJvbD8udXBkYXRlKG1vZGVsKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRTZXNzaW9uUmVzb3VyY2Uuc2V0KGNoYXRXaWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gb25seSByZXZlYWwgaW4gc2lkZS1ieS1zaWRlIG1vZGVcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gY2hhdFdpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3QgcmV2ZWFsZWQgPSBzZXNzaW9uc0NvbnRyb2wucmV2ZWFsKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmICghcmV2ZWFsZWQpIHtcblx0XHRcdFx0XHQvLyBTZXNzaW9uIGRvZXNuJ3QgZXhpc3QgaW4gdGhlIGxpc3QgeWV0IChlLmcuLCBuZXcgdW50aXRsZWQgc2Vzc2lvbiksXG5cdFx0XHRcdFx0Ly8gY2xlYXIgdGhlIHNlbGVjdGlvbiBzbyB0aGUgbGlzdCBkb2Vzbid0IHNob3cgc3RhbGUgc2VsZWN0aW9uXG5cdFx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLmNsZWFyRm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gc2Vzc2lvbnMgY2hhbmdlIChlLmcuLCBhZnRlciBmaXJzdCBtZXNzYWdlIGluIGEgbmV3IHNlc3Npb24pXG5cdFx0Ly8gcmV2ZWFsIGl0IHVubGVzcyB0aGUgdXNlciBpcyBpbnRlcmFjdGluZyB3aXRoIHRoZSBsaXN0IGFscmVhZHlcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBvbmx5IHJldmVhbCBpbiBzaWRlLWJ5LXNpZGUgbW9kZVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2Vzc2lvbnNDb250cm9sLmhhc0ZvY3VzT3JTZWxlY3Rpb24oKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRvIG5vdCByZXZlYWwgaWYgdXNlciBpcyBpbnRlcmFjdGluZyB3aXRoIHNlc3Npb25zIGNvbnRyb2xcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gY2hhdFdpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLnJldmVhbChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gdGhlIGN1cnJlbnRseSBkaXNwbGF5ZWQgc2Vzc2lvbiBpcyBhcmNoaXZlZCwgc3RhcnQgYSBuZXcgc2Vzc2lvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZShlID0+IHtcblx0XHRcdGlmIChlLmlzQXJjaGl2ZWQoKSkge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblJlc291cmNlID0gY2hhdFdpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0aWYgKGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgJiYgaXNFcXVhbChjdXJyZW50U2Vzc2lvblJlc291cmNlLCBlLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gc2hvd2luZyBzZXNzaW9ucyBzdGFja2VkLCBhZGp1c3QgdGhlIGhlaWdodCBvZiB0aGUgc2Vzc2lvbnMgbGlzdCB0byBtYWtlIHJvb20gZm9yIGNoYXQgaW5wdXRcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjaGF0V2lkZ2V0LmlucHV0UGFydC5oZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMuc2Vzc2lvbnNWaWV3ZXJWaXNpYmxlICYmIHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQpIHtcblx0XHRcdFx0dGhpcy5yZWxheW91dEZvcklucHV0SGVpZ2h0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2hvdyBwcm9ncmVzcyBiYWRnZSB3aGVuIHRoZSBjdXJyZW50IHNlc3Npb24gaXMgaW4gcHJvZ3Jlc3Ncblx0XHRjb25zdCBwcm9ncmVzc0JhZGdlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0XHRjb25zdCB1cGRhdGVQcm9ncmVzc0JhZGdlID0gKCkgPT4ge1xuXHRcdFx0cHJvZ3Jlc3NCYWRnZURpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdQcm9ncmVzc0JhZGdlRW5hYmxlZCkpIHtcblx0XHRcdFx0dGhpcy5hY3Rpdml0eUJhZGdlLmNsZWFyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBjaGF0V2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWw7XG5cdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0cHJvZ3Jlc3NCYWRnZURpc3Bvc2FibGVzLnZhbHVlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0aWYgKG1vZGVsLnJlcXVlc3RJblByb2dyZXNzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5hY3Rpdml0eUJhZGdlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd1ZpZXdBY3Rpdml0eSh0aGlzLmlkLCB7XG5cdFx0XHRcdFx0XHRcdGJhZGdlOiBuZXcgUHJvZ3Jlc3NCYWRnZSgoKSA9PiBsb2NhbGl6ZSgnc2Vzc2lvbkluUHJvZ3Jlc3MnLCBcIkFnZW50IFNlc3Npb24gaW4gUHJvZ3Jlc3NcIikpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5hY3Rpdml0eUJhZGdlLmNsZWFyKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFjdGl2aXR5QmFkZ2UuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRXaWRnZXQub25EaWRDaGFuZ2VWaWV3TW9kZWwoKCkgPT4gdXBkYXRlUHJvZ3Jlc3NCYWRnZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdQcm9ncmVzc0JhZGdlRW5hYmxlZCkpKCgpID0+IHVwZGF0ZVByb2dyZXNzQmFkZ2UoKSkpO1xuXHRcdHVwZGF0ZVByb2dyZXNzQmFkZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBDb250ZXh0TWVudShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudCwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5DaGF0V2VsY29tZUNvbnRleHQsXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHBhcmVudCksIGUpXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyNyZWdpb24gTW9kZWwgTWFuYWdlbWVudFxuXG5cdHByaXZhdGUgYXBwbHlNb2RlbCgpOiB2b2lkIHtcblx0XHQvLyBNYWtlIHRoZSBpbml0aWFsIHNlc3Npb24gcmVzb2x1dGlvbiBjYW5jZWxhYmxlIHNvIGFuIGV4cGxpY2l0IHJlcXVlc3Rcblx0XHQvLyAoZS5nLiBOZXcgTG9jYWwgQ2hhdCB2aWEgYHN0YXJ0TmV3TG9jYWxTZXNzaW9uYCkgY2FuIHByZWVtcHQgYSBzbG93IC9cblx0XHQvLyBibG9ja2luZyBkZWZhdWx0LXByb3ZpZGVyIHJlc29sdXRpb24gaW5zdGVhZCBvZiB3YWl0aW5nIGZvciBpdC5cblx0XHQvLyBDYW5jZWwgYW55IHByZXZpb3VzIGluLWZsaWdodCByZXNvbHV0aW9uIGZpcnN0OiBhc3NpZ25pbmcgdG8gdGhlXG5cdFx0Ly8gTXV0YWJsZURpc3Bvc2FibGUgb25seSBkaXNwb3NlcyB0aGUgb2xkIHNvdXJjZSwgYW5kIGRpc3Bvc2luZyBhXG5cdFx0Ly8gQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgZG9lcyBub3QgY2FuY2VsIGl0LlxuXHRcdHRoaXMuX2FwcGx5TW9kZWxDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdGNvbnN0IGN0cyA9IHRoaXMuX2FwcGx5TW9kZWxDdHMudmFsdWUgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLnJlc3RvcmluZ1Nlc3Npb24gPSB0aGlzLl9hcHBseU1vZGVsKGN0cy50b2tlbikuY2F0Y2goZXJyID0+IHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignQ2hhdFZpZXdQYW5lI2FwcGx5TW9kZWwgZmFpbGVkJywgZXJyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLnJlc3RvcmluZ1Nlc3Npb24uZmluYWxseSgoKSA9PiB0aGlzLnJlc3RvcmluZ1Nlc3Npb24gPSB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlNb2RlbCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuYWNxdWlyZVRyYW5zZmVycmVkT3JQZXJzaXN0ZWRTZXNzaW9uKHRva2VuLCAnQ2hhdFZpZXdQYW5lI2FwcGx5TW9kZWwnKTtcblx0XHRhd2FpdCB0aGlzLnNob3dNb2RlbCh0b2tlbiwgbW9kZWxSZWYsIHRydWUsICFtb2RlbFJlZik7XG5cdH1cblxuXHQvKipcblx0ICogRm9yY2Utc3RhcnQgYSBuZXcgbG9jYWwgY2hhdCBzZXNzaW9uIGluIHRoZSB2aWV3LCBieXBhc3NpbmcgdGhlXG5cdCAqIGRlZmF1bHQtcHJvdmlkZXIgb3ZlcnJpZGUgYXBwbGllZCBieSBgc2hvd01vZGVsKClgLiBVc2VkIGJ5IHRoZVxuXHQgKiBwaWNrZXIgd2hlbiB0aGUgdXNlciBleHBsaWNpdGx5IHNlbGVjdHMgXCJMb2NhbFwiLCBhbmQgYnkgTmV3IExvY2FsIENoYXQuXG5cdCAqL1xuXHRhc3luYyBzdGFydE5ld0xvY2FsU2Vzc2lvbigpOiBQcm9taXNlPElDaGF0TW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBQcmVlbXB0IGFueSBpbi1mbGlnaHQgaW5pdGlhbCBzZXNzaW9uIHJlc29sdXRpb24gKGUuZy4gdGhlIGNvbXB1dGVkXG5cdFx0Ly8gZGVmYXVsdCBwcm92aWRlcikuIFdpdGhvdXQgdGhpcywgb3BlbmluZyB0aGUgdmlldyBraWNrcyBvZmYgYSBkZWZhdWx0XG5cdFx0Ly8gcmVzb2x1dGlvbiB0aGF0LCB3aGVuIHRoZSBkZWZhdWx0IGlzIGEgbm9uLWxvY2FsIGhhcm5lc3MsIGJsb2NrcyBvblxuXHRcdC8vIGFnZW50IGhvc3QgYWN0aXZhdGlvbjsgY2FuY2VsaW5nIGl0IGxldHMgdGhpcyBleHBsaWNpdCBsb2NhbCByZXF1ZXN0XG5cdFx0Ly8gd2luIGltbWVkaWF0ZWx5LlxuXHRcdHRoaXMuX2FwcGx5TW9kZWxDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgeyBkZWJ1Z093bmVyOiAnQ2hhdFZpZXdQYW5lI3N0YXJ0TmV3TG9jYWxTZXNzaW9uJyB9KTtcblx0XHRyZXR1cm4gdGhpcy5zaG93TW9kZWwoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgcmVmKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGVuIHRoZSByZW1lbWJlcmVkIG9yIGNvbXB1dGVkIGRlZmF1bHQgc2Vzc2lvbiB0eXBlIGlzIGEgbm9uLWxvY2FsXG5cdCAqIHByb3ZpZGVyIChmb3IgZXhhbXBsZSB3aGVuIHRoZSBhZ2VudCBob3N0IGlzIGVuYWJsZWQpLCByZXR1cm4gYSBuZXcgc2Vzc2lvblxuXHQgKiByZWZlcmVuY2UgZm9yIGl0IGluc3RlYWQgb2YgdGhlIGJ1aWx0LWluIGxvY2FsIHByb3ZpZGVyLiBSZXR1cm5zXG5cdCAqIGB1bmRlZmluZWRgIHRvIGZhbGwgYmFjayB0byBgc3RhcnROZXdMb2NhbFNlc3Npb25gLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBhY3F1aXJlRGVmYXVsdE5ld1Nlc3Npb24odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdE1vZGVsUmVmZXJlbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBkZWZhdWx0VHlwZSA9IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHRoaXMuYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZC5nZXQoKSk7XG5cdFx0aWYgKGRlZmF1bHRUeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25SZXNvdXJjZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZSwgdGhpcy5hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5lbmFibGVkLmdldCgpKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHRva2VuLCAnQ2hhdFZpZXdQYW5lI2FjcXVpcmVEZWZhdWx0TmV3U2Vzc2lvbicpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBBIGNhbmNlbGxhdGlvbiBtZWFucyB0aGUgY2FsbGVyIChlLmcuIGBzdGFydE5ld0xvY2FsU2Vzc2lvbmApXG5cdFx0XHQvLyBkZWxpYmVyYXRlbHkgcHJlZW1wdGVkIHRoaXMgcmVzb2x1dGlvbjsgcHJvcGFnYXRlIGl0IHNvIHRoZVxuXHRcdFx0Ly8gaW5pdGlhbCBgYXBwbHlNb2RlbGAgYmFpbHMgaW5zdGVhZCBvZiBjcmVhdGluZyBhIGZhbGxiYWNrIHNlc3Npb24uXG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0NoYXRWaWV3UGFuZV0gRmFpbGVkIHRvIGFjcXVpcmUgZGVmYXVsdCBhZ2VudC1ob3N0IHNlc3Npb24sIGZhbGxpbmcgYmFjayB0byBsb2NhbGAsIGVycm9yKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhY3F1aXJlVHJhbnNmZXJyZWRPclBlcnNpc3RlZFNlc3Npb24odG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBkZWJ1Z093bmVyOiBzdHJpbmcpOiBQcm9taXNlPElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmdldFRyYW5zZmVycmVkT3JQZXJzaXN0ZWRTZXNzaW9uSW5mbygpO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHRva2VuLCBkZWJ1Z093bmVyKTtcblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNob3VsZFNraXBSZXN0b3JlZExvY2FsU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIG1vZGVsUmVmLm9iamVjdCkpIHtcblx0XHRcdG1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsUmVmO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTa2lwUmVzdG9yZWRMb2NhbFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIG1vZGVsOiBJQ2hhdE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBkZWZhdWx0VHlwZSA9IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHRoaXMuYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZC5nZXQoKSk7XG5cdFx0cmV0dXJuIGRlZmF1bHRUeXBlICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZVxuXHRcdFx0JiYgZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlXG5cdFx0XHQmJiAhbW9kZWwuaGFzUmVxdWVzdHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dNb2RlbCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG1vZGVsUmVmPzogSUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZCwgc3RhcnROZXdTZXNzaW9uID0gdHJ1ZSwgaWdub3JlVHJhbnNmZXJyZWRTZXNzaW9uID0gZmFsc2UsIGlucHV0QmVmb3JlTG9hZD86IHN0cmluZyk6IFByb21pc2U8SUNoYXRNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG9sZE1vZGVsUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKG9sZE1vZGVsUmVzb3VyY2UpIHtcblx0XHRcdHRoaXMud2lkZ2V0Vmlld1N0YXRlcy5zZXQoZ2V0Q29tcGFyaXNvbktleShvbGRNb2RlbFJlc291cmNlKSwgdGhpcy5fd2lkZ2V0LmdldFZpZXdTdGF0ZSgpKTtcblx0XHR9XG5cdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIEJhc2VsaW5lIGRyYWZ0IGZvciBwcmVzZXJ2aW5nIHRleHQgdHlwZWQgZHVyaW5nIGxvYWRpbmcuIGBsb2FkU2Vzc2lvbmBcblx0XHQvLyBvcGVucyBpdHMgbG9hZCB3aW5kb3cgYmVmb3JlIGNhbGxpbmcgdXMsIHNvIGl0IHBhc3NlcyBpdHMgb3duIGJhc2VsaW5lO1xuXHRcdC8vIG90aGVyd2lzZSB0aGlzIGNhbGwncyBvd24gYXdhaXQgaXMgdGhlIGxvYWQgd2luZG93LiBTZWUgIzMyNTMyMy5cblx0XHRjb25zdCBiYXNlbGluZUlucHV0ID0gaW5wdXRCZWZvcmVMb2FkID8/IHRoaXMuX3dpZGdldD8uZ2V0SW5wdXQoKSA/PyAnJztcblxuXHRcdGxldCByZWY6IElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHN0YXJ0TmV3U2Vzc2lvbikge1xuXHRcdFx0aWYgKG1vZGVsUmVmKSB7XG5cdFx0XHRcdHJlZiA9IG1vZGVsUmVmO1xuXHRcdFx0fSBlbHNlIGlmICghaWdub3JlVHJhbnNmZXJyZWRTZXNzaW9uICYmIHRoaXMuY2hhdFNlcnZpY2UudHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0cmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbih0aGlzLmNoYXRTZXJ2aWNlLnRyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB0b2tlbiwgJ0NoYXRWaWV3UGFuZSNzaG93TW9kZWwnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlZiA9IGF3YWl0IHRoaXMuYWNxdWlyZURlZmF1bHROZXdTZXNzaW9uKHRva2VuKSA/PyB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHsgZGVidWdPd25lcjogJ0NoYXRWaWV3UGFuZSNzaG93TW9kZWwnIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZWYpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3Qgc3RhcnQgY2hhdCBzZXNzaW9uJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZWY/LmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHJlZjtcblx0XHRjb25zdCBtb2RlbCA9IHJlZj8ub2JqZWN0O1xuXG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVdpZGdldExvY2tTdGF0ZShnZXRDaGF0U2Vzc2lvblR5cGUobW9kZWwuc2Vzc2lvblJlc291cmNlKSk7IC8vIFVwZGF0ZSB3aWRnZXQgbG9jayBzdGF0ZSBiYXNlZCBvbiBzZXNzaW9uIHR5cGVcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJlbWVtYmVyIGFzIG1vZGVsIHRvIHJlc3RvcmUgaW4gdmlldyBzdGF0ZVxuXHRcdFx0dGhpcy52aWV3U3RhdGUuc2Vzc2lvblJlc291cmNlID0gbW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0c2V0TW9kZWxQcmVzZXJ2aW5nSW5wdXRUeXBlZFdoaWxlTG9hZGluZyh0aGlzLl93aWRnZXQsIGJhc2VsaW5lSW5wdXQsICgpID0+IHRoaXMuX3dpZGdldC5zZXRNb2RlbChtb2RlbCkpO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0Vmlld1N0YXRlID0gdGhpcy53aWRnZXRWaWV3U3RhdGVzLmdldChnZXRDb21wYXJpc29uS2V5KG1vZGVsLnNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0aWYgKHdpZGdldFZpZXdTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQucmVzdG9yZVZpZXdTdGF0ZSh3aWRnZXRWaWV3U3RhdGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0TW9kZWwobW9kZWwpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aXRsZSBjb250cm9sXG5cdFx0dGhpcy50aXRsZUNvbnRyb2w/LnVwZGF0ZShtb2RlbCk7XG5cblx0XHQvLyBVcGRhdGUgdGhlIHRvb2xiYXIgY29udGV4dCB3aXRoIG5ldyBzZXNzaW9uSWRcblx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblxuXHRcdC8vIE1hcmsgdGhlIG9sZCBtb2RlbCBhcyByZWFkIHdoZW4gY2xvc2luZyB1bmxlc3MgZXhwbGljaXRseSBtYXJrZWQgdW5yZWFkLlxuXHRcdC8vIERlZmVycmVkIGJlY2F1c2Ugc2V0UmVhZCBmaXJlcyBfb25EaWRDaGFuZ2VTZXNzaW9ucyB3aGljaCBzeW5jaHJvbm91c2x5XG5cdFx0Ly8gcmUtcmVuZGVycyB0aGUgc2Vzc2lvbnMgbGlzdCAofjI1MG1zKSwgYW5kIHRoYXQgZG9lc24ndCBuZWVkIHRvIGJsb2NrXG5cdFx0Ly8gdGhlIG5ldyBjaGF0IGZyb20gZGlzcGxheWluZy5cblx0XHRpZiAob2xkTW9kZWxSZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgY2FwdHVyZWRPbGRSZXNvdXJjZSA9IG9sZE1vZGVsUmVzb3VyY2U7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9sZFNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLmdldFNlc3Npb24oY2FwdHVyZWRPbGRSZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChvbGRTZXNzaW9uICYmICFvbGRTZXNzaW9uLmlzTWFya2VkVW5yZWFkKCkpIHtcblx0XHRcdFx0XHRvbGRTZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDApKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVdpZGdldExvY2tTdGF0ZShzZXNzaW9uVHlwZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlc3Npb25UeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnVubG9ja0Zyb21Db2RpbmdBZ2VudCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBjYW5SZXNvbHZlID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGNhblJlc29sdmUgPSBhd2FpdCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuY2FuUmVzb2x2ZUNoYXRTZXNzaW9uKHNlc3Npb25UeXBlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEZhaWxlZCB0byByZXNvbHZlIGNoYXQgc2Vzc2lvbiB0eXBlICcke3Nlc3Npb25UeXBlfScgZm9yIGxvY2tpbmdgLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0aWYgKCFjYW5SZXNvbHZlKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQudW5sb2NrRnJvbUNvZGluZ0FnZW50KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHNlc3Npb25UeXBlKTtcblx0XHRpZiAoY29udHJpYnV0aW9uKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQubG9ja1RvQ29kaW5nQWdlbnQoY29udHJpYnV0aW9uLm5hbWUsIGNvbnRyaWJ1dGlvbi5kaXNwbGF5TmFtZSwgc2Vzc2lvblR5cGUsIGNvbnRyaWJ1dGlvbi5hZ2VudEhvc3RQcm92aWRlcklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnVubG9ja0Zyb21Db2RpbmdBZ2VudCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ2FuY2VsIGFueSBpbi1mbGlnaHQgbG9hZFNlc3Npb24gY2FsbCB0byBwcmV2ZW50IGl0IGZyb21cblx0XHQvLyBvdmVyd3JpdGluZyB0aGUgZnJlc2ggc2Vzc2lvbiB3ZSBhcmUgYWJvdXQgdG8gY3JlYXRlLlxuXHRcdHRoaXMubG9hZFNlc3Npb25DdHMudmFsdWU/LmNhbmNlbCgpO1xuXG5cdFx0Ly8gR3JhYiB0aGUgd2lkZ2V0J3MgbGF0ZXN0IHZpZXcgc3RhdGUgYmVjYXVzZSBpdCB3aWxsIGJlIGxvYWRlZCBiYWNrIGludG8gdGhlIHdpZGdldFxuXHRcdHRoaXMudXBkYXRlVmlld1N0YXRlKCk7XG5cdFx0YXdhaXQgdGhpcy5zaG93TW9kZWwoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBVcGRhdGUgdGhlIHRvb2xiYXIgY29udGV4dCB3aXRoIG5ldyBzZXNzaW9uSWRcblx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblx0fVxuXG5cdGFzeW5jIGxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdDAgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0NoYXRWaWV3UGFuZV0gbG9hZFNlc3Npb24gc3RhcnQgdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cblx0XHQvLyBDYXB0dXJlIHRoZSBpbnB1dCBkcmFmdCB1cCBmcm9udDogdGhlIGxvYWQgd2luZG93IChjbGVhciArIGFjcXVpcmUgYmVsb3cpXG5cdFx0Ly8gb3BlbnMgYmVmb3JlIGBzaG93TW9kZWxgIGJpbmRzLCBzbyB0ZXh0IHR5cGVkIGR1cmluZyBsb2FkaW5nIG11c3QgYmVcblx0XHQvLyBiYXNlbGluZWQgaGVyZSB0byBiZSBwcmVzZXJ2ZWQgcmF0aGVyIHRoYW4gZXJhc2VkLiBTZWUgIzMyNTMyMy5cblx0XHRjb25zdCBpbnB1dEJlZm9yZUxvYWQgPSB0aGlzLl93aWRnZXQ/LmdldElucHV0KCkgPz8gJyc7XG5cblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCBsb2FkU2Vzc2lvbiBjYWxsIHNvIHRoZSBsYXN0IG9uZSBhbHdheXMgd2luc1xuXHRcdHRoaXMubG9hZFNlc3Npb25DdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdGNvbnN0IGN0cyA9IHRoaXMubG9hZFNlc3Npb25DdHMudmFsdWUgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCB0b2tlbiA9IGN0cy50b2tlbjtcblxuXHRcdC8vIFdhaXQgZm9yIGFueSBpbi1wcm9ncmVzcyBzZXNzaW9uIHJlc3RvcmUgKGUuZy4gZnJvbSBvbkRpZENoYW5nZUFnZW50cylcblx0XHQvLyB0byBmaW5pc2ggZmlyc3QsIHNvIG91ciBzaG93TW9kZWwgY2FsbCBpcyBndWFyYW50ZWVkIHRvIGJlIHRoZSBsYXN0IG9uZS5cblx0XHRpZiAodGhpcy5yZXN0b3JpbmdTZXNzaW9uKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlc3RvcmluZ1Nlc3Npb247XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtDaGF0Vmlld1BhbmVdIGxvYWRTZXNzaW9uIGRvbmUgdG90YWw9JHtEYXRlLm5vdygpIC0gdDB9bXMgdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IGNhbmNlbGxlZD10cnVlIHBoYXNlPXByZUFjcXVpcmVgKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBDaGF0Vmlld0lkLCBkZWxheTogMjAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBxdWV1ZTogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHQvLyBBIGRlbGF5IGhlcmUgdG8gYXZvaWQgYmxpbmtpbmcgYmVjYXVzZSBvbmx5IENsb3VkIHNlc3Npb25zIGFyZSBzbG93LCBtb3N0IG90aGVycyBhcmUgZmFzdFxuXHRcdFx0Y29uc3QgY2xlYXJXaWRnZXQgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdC8vIE9ubHkgY2xlYXIgdGhlIGN1cnJlbnQgbW9kZWwgaWYgdGhpcyBsb2FkU2Vzc2lvbiBjYWxsIGlzIHN0aWxsIHRoZSBhY3RpdmUgb25lXG5cdFx0XHRcdC8vIGFuZCBoYXMgbm90IGJlZW4gY2FuY2VsbGVkLiBUaGlzIHByZXNlcnZlcyB0aGUgXCJsYXN0IGNhbGwgd2luc1wiIGJlaGF2aW9yLlxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgdGhpcy5sb2FkU2Vzc2lvbkN0cy52YWx1ZSAhPT0gY3RzKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGNsZWFyIGN1cnJlbnQgbW9kZWwgd2l0aG91dCBzdGFydGluZyBhIG5ldyBvbmVcblx0XHRcdFx0cXVldWUgPSB0aGlzLnNob3dNb2RlbCh0b2tlbiwgdW5kZWZpbmVkLCBmYWxzZSkudGhlbigoKSA9PiB7IH0pO1xuXHRcdFx0fSwgMTAwKTtcblx0XHRcdGNvbnN0IGNsZWFyV2lkZ2V0Q2FuY2VsbGF0aW9uTGlzdGVuZXIgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBjbGVhcldpZGdldC5kaXNwb3NlKCkpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBuZXdNb2RlbFJlZiA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB0b2tlbiwgJ0NoYXRWaWV3UGFuZSNsb2FkU2Vzc2lvbicpO1xuXHRcdFx0XHRjbGVhcldpZGdldC5kaXNwb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHF1ZXVlO1xuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdG5ld01vZGVsUmVmPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdFZpZXdQYW5lXSBsb2FkU2Vzc2lvbiBkb25lIHRvdGFsPSR7RGF0ZS5ub3coKSAtIHQwfW1zIHVyaT0ke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBjYW5jZWxsZWQ9dHJ1ZSBwaGFzZT1wb3N0QWNxdWlyZWApO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNob3dNb2RlbCh0b2tlbiwgbmV3TW9kZWxSZWYsIHRydWUsIGZhbHNlLCBpbnB1dEJlZm9yZUxvYWQpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtDaGF0Vmlld1BhbmVdIGxvYWRTZXNzaW9uIGRvbmUgdG90YWw9JHtEYXRlLm5vdygpIC0gdDB9bXMgdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y2xlYXJXaWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRhd2FpdCBxdWV1ZTtcblxuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtDaGF0Vmlld1BhbmVdIGxvYWRTZXNzaW9uIGRvbmUgdG90YWw9JHtEYXRlLm5vdygpIC0gdDB9bXMgdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IGNhbmNlbGxlZD10cnVlIHBoYXNlPWVycm9yYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlY292ZXIgYnkgc3RhcnRpbmcgYSBmcmVzaCBlbXB0eSBzZXNzaW9uIHNvIHRoZSB3aWRnZXRcblx0XHRcdFx0Ly8gaXMgbm90IGxlZnQgaW4gYSBicm9rZW4gc3RhdGUgd2l0aG91dCB0aXRsZSBvciBiYWNrIGJ1dHRvbi5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBjaGF0IHNlc3Npb24gJyR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9J2AsIGVycik7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY2hhdC5sb2FkU2Vzc2lvbkZhaWxlZCcsIFwiRmFpbGVkIHRvIG9wZW4gY2hhdCBzZXNzaW9uOiB7MH1cIiwgdG9FcnJvck1lc3NhZ2UoZXJyKSkpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNob3dNb2RlbCh0b2tlbiwgdW5kZWZpbmVkLCB0cnVlLCBmYWxzZSwgaW5wdXRCZWZvcmVMb2FkKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdFZpZXdQYW5lXSBsb2FkU2Vzc2lvbiBkb25lIHRvdGFsPSR7RGF0ZS5ub3coKSAtIHQwfW1zIHVyaT0ke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBlcnJvcj10cnVlYCk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjbGVhcldpZGdldENhbmNlbGxhdGlvbkxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHR0aGlzLmZvY3VzSW5wdXQoKTtcblx0fVxuXG5cdGZvY3VzSW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0fVxuXG5cdGZvY3VzU2Vzc2lvbnMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuc2Vzc2lvbnNDb250YWluZXI/LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBub3QgdmlzaWJsZVxuXHRcdH1cblxuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5mb2N1cygpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyNyZWdpb24gTGF5b3V0XG5cblx0cHJpdmF0ZSBsYXlvdXRpbmdCb2R5ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3dpZGdldD8udmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxhc3REaW1lbnNpb25zKSB7XG5cdFx0XHR0aGlzLmxheW91dEJvZHkodGhpcy5sYXN0RGltZW5zaW9ucy5oZWlnaHQsIHRoaXMubGFzdERpbWVuc2lvbnMud2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVsYXlvdXRGb3JJbnB1dEhlaWdodCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYXlvdXRpbmdCb2R5IHx8ICF0aGlzLl93aWRnZXQ/LnZpc2libGUgfHwgIXRoaXMubGFzdERpbWVuc2lvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dENoYXRBbmRTZXNzaW9ucyh0aGlzLmxhc3REaW1lbnNpb25zLmhlaWdodCwgdGhpcy5sYXN0RGltZW5zaW9ucy53aWR0aCwgZmFsc2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYXlvdXRpbmdCb2R5KSB7XG5cdFx0XHRyZXR1cm47IC8vIHByZXZlbnQgcmUtZW50cmFuY3lcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dGluZ0JvZHkgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmRvTGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5sYXlvdXRpbmdCb2R5ID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0xheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXG5cdFx0dGhpcy5sYXN0RGltZW5zaW9ucyA9IHsgaGVpZ2h0LCB3aWR0aCB9O1xuXHRcdHRoaXMubGF5b3V0Q2hhdEFuZFNlc3Npb25zKGhlaWdodCwgd2lkdGgsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRDaGF0QW5kU2Vzc2lvbnMoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGxheW91dElucHV0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0bGV0IHJlbWFpbmluZ0hlaWdodCA9IGhlaWdodDtcblx0XHRjb25zdCByZW1haW5pbmdXaWR0aCA9IHdpZHRoO1xuXG5cdFx0Ly8gVm9pY2UgYmFyIGlzIG5vdyBpbnNpZGUgdGhlIGlucHV0IGNvbnRhaW5lciwgbm8gc2VwYXJhdGUgaGVpZ2h0IGRlZHVjdGlvbiBuZWVkZWRcblxuXHRcdC8vIFRpdGxlIENvbnRyb2xcblx0XHRjb25zdCB0aXRsZUhlaWdodCA9IHRoaXMudGl0bGVDb250cm9sPy5nZXRIZWlnaHQoKSA/PyAwO1xuXHRcdHJlbWFpbmluZ0hlaWdodCAtPSB0aXRsZUhlaWdodDtcblxuXHRcdC8vIFNlc3Npb25zIENvbnRyb2xcblx0XHRjb25zdCB7IGhlaWdodFJlZHVjdGlvbiwgd2lkdGhSZWR1Y3Rpb24gfSA9IHRoaXMubGF5b3V0U2Vzc2lvbnNDb250cm9sKHJlbWFpbmluZ0hlaWdodCwgcmVtYWluaW5nV2lkdGgpO1xuXG5cdFx0Ly8gSW4gc3RhY2tlZCBtb2RlIHRoZSBzZXNzaW9ucyB2aWV3ZXIgc2l0cyBhYm92ZSB0aGUgY2hhdCB3aWRnZXQsIHNvIHRoZVxuXHRcdC8vIHdpZGdldCdzIGxheW91dCBoZWlnaHQgaXMgcmVkdWNlZCBieSBgaGVpZ2h0UmVkdWN0aW9uYC4gSG93ZXZlciwgdGhlIGlucHV0XG5cdFx0Ly8gcGFydCdzIG1heC1oZWlnaHQgbmVlZHMgdG8gYmUgYmFzZWQgb24gdGhlIGZ1bGwgYHJlbWFpbmluZ0hlaWdodGAgKGJlZm9yZVxuXHRcdC8vIHRoZSBzZXNzaW9ucyB2aWV3ZXIgZGVkdWN0aW9uKSBzbyB0aGUgaW5wdXQgY2FuIGdyb3cgZnJlZWx5LiBBcyB0aGUgaW5wdXRcblx0XHQvLyBncm93cywgYW4gYXV0b3J1biB0cmlnZ2VycyByZWxheW91dCB3aGljaCBzaHJpbmtzIHRoZSBzZXNzaW9ucyB2aWV3ZXIsXG5cdFx0Ly8gZ2l2aW5nIHRoZSB3aWRnZXQgbW9yZSBzcGFjZSBhbmQgY29udmVyZ2luZyB0byB0aGUgcmlnaHQgc2l6ZXMuXG5cdFx0Y29uc3QgaW5wdXRNYXhIZWlnaHQgPSB0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkID8gcmVtYWluaW5nSGVpZ2h0IDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQ2hhdCBXaWRnZXRcblx0XHRpZiAobGF5b3V0SW5wdXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRJbnB1dFBhcnRNYXhIZWlnaHRPdmVycmlkZShpbnB1dE1heEhlaWdodCk7XG5cdFx0XHR0aGlzLl93aWRnZXQubGF5b3V0KHJlbWFpbmluZ0hlaWdodCAtIGhlaWdodFJlZHVjdGlvbiwgcmVtYWluaW5nV2lkdGggLSB3aWR0aFJlZHVjdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxheW91dENoYXRXaWRnZXRGb3JJbnB1dEhlaWdodCh0aGlzLl93aWRnZXQsIGlucHV0TWF4SGVpZ2h0LCByZW1haW5pbmdIZWlnaHQgLSBoZWlnaHRSZWR1Y3Rpb24sIHJlbWFpbmluZ1dpZHRoIC0gd2lkdGhSZWR1Y3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIGxhc3QgZGltZW5zaW9ucyBwZXIgb3JpZW50YXRpb25cblx0XHR0aGlzLmxhc3REaW1lbnNpb25zUGVyT3JpZW50YXRpb24uc2V0KHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiwgeyBoZWlnaHQsIHdpZHRoIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRTZXNzaW9uc0NvbnRyb2woaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB7IGhlaWdodFJlZHVjdGlvbjogbnVtYmVyOyB3aWR0aFJlZHVjdGlvbjogbnVtYmVyIH0ge1xuXHRcdGxldCBoZWlnaHRSZWR1Y3Rpb24gPSAwO1xuXHRcdGxldCB3aWR0aFJlZHVjdGlvbiA9IDA7XG5cblx0XHRpZiAoIXRoaXMuc2Vzc2lvbnNDb250YWluZXIgfHwgIXRoaXMuc2Vzc2lvbnNDb250cm9sQ29udGFpbmVyIHx8ICF0aGlzLnNlc3Npb25zQ29udHJvbCB8fCAhdGhpcy52aWV3UGFuZUNvbnRhaW5lciB8fCAhdGhpcy5zZXNzaW9uc1RpdGxlQ29udGFpbmVyIHx8ICF0aGlzLnNlc3Npb25zVGl0bGUpIHtcblx0XHRcdHJldHVybiB7IGhlaWdodFJlZHVjdGlvbiwgd2lkdGhSZWR1Y3Rpb24gfTtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID0gdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uO1xuXHRcdGxldCBuZXdTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uOiBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb247XG5cdFx0c3dpdGNoICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb25Db25maWd1cmF0aW9uKSB7XG5cdFx0XHQvLyBTdGFja2VkXG5cdFx0XHRjYXNlICdzdGFja2VkJzpcblx0XHRcdFx0bmV3U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdC8vIFVwZGF0ZSBvcmllbnRhdGlvbiBiYXNlZCBvbiBhdmFpbGFibGUgd2lkdGhcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdG5ld1Nlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPSB3aWR0aCA+PSBDaGF0Vmlld1BhbmUuU0VTU0lPTlNfU0lERUJBUl9WSUVXX01JTl9XSURUSCA/IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlIDogQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID0gbmV3U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbjtcblxuXHRcdGlmIChuZXdTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZSkge1xuXHRcdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzZXNzaW9ucy1jb250cm9sLW9yaWVudGF0aW9uLXNpZGVieXNpZGUnLCB0cnVlKTtcblx0XHRcdHRoaXMudmlld1BhbmVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2Vzc2lvbnMtY29udHJvbC1vcmllbnRhdGlvbi1zdGFja2VkJywgZmFsc2UpO1xuXHRcdFx0dGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29udGV4dC5zZXQoQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Nlc3Npb25zLWNvbnRyb2wtb3JpZW50YXRpb24tc2lkZWJ5c2lkZScsIGZhbHNlKTtcblx0XHRcdHRoaXMudmlld1BhbmVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2Vzc2lvbnMtY29udHJvbC1vcmllbnRhdGlvbi1zdGFja2VkJywgdHJ1ZSk7XG5cdFx0XHR0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb25Db250ZXh0LnNldChBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCk7XG5cdFx0fVxuXG5cdFx0aWYgKG9sZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gIT09IHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbikge1xuXHRcdFx0Y29uc3QgdXBkYXRlUHJvbWlzZSA9IHRoaXMuc2Vzc2lvbnNDb250cm9sLnVwZGF0ZSgpOyAvLyBDaGFuZ2luZyBvcmllbnRhdGlvbiBoYXMgYW4gaW1wYWN0IHRvIGdyb3VwaW5nLCBzbyB3ZSBuZWVkIHRvIHVwZGF0ZVxuXG5cdFx0XHQvLyBTd2l0Y2hpbmcgdG8gc2lkZS1ieS1zaWRlLCByZXZlYWwgdGhlIGN1cnJlbnQgc2Vzc2lvbiBhZnRlciBlbGVtZW50cyBoYXZlIGxvYWRlZFxuXHRcdFx0aWYgKHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUpIHtcblx0XHRcdFx0dXBkYXRlUHJvbWlzZS50aGVuKGRpZFVwZGF0ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFkaWRVcGRhdGUpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5yZXZlYWwoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB2aXNpYmlsaXR5IGlzIGluIHN5bmMgYmVmb3JlIHdlIGxheW91dFxuXHRcdGNvbnN0IHsgdmlzaWJsZTogc2Vzc2lvbnNDb250YWluZXJWaXNpYmxlIH0gPSB0aGlzLnVwZGF0ZVNlc3Npb25zQ29udHJvbFZpc2liaWxpdHkoKTtcblxuXHRcdC8vIEhhbmRsZSBTYXNoIChvbmx5IHZpc2libGUgaW4gc2lkZS1ieS1zaWRlKVxuXHRcdGlmICghc2Vzc2lvbnNDb250YWluZXJWaXNpYmxlIHx8IHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJTYXNoRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJTYXNoID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZSkge1xuXHRcdFx0aWYgKCF0aGlzLnNlc3Npb25zVmlld2VyU2FzaERpc3Bvc2FibGVzLnZhbHVlICYmIHRoaXMudmlld1BhbmVDb250YWluZXIpIHtcblx0XHRcdFx0dGhpcy5jcmVhdGVTZXNzaW9uc1ZpZXdlclNhc2godGhpcy52aWV3UGFuZUNvbnRhaW5lciwgaGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFzZXNzaW9uc0NvbnRhaW5lclZpc2libGUpIHtcblx0XHRcdHJldHVybiB7IGhlaWdodFJlZHVjdGlvbjogMCwgd2lkdGhSZWR1Y3Rpb246IDAgfTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uc1RpdGxlSGVpZ2h0ID0gdGhpcy5zZXNzaW9uc1RpdGxlQ29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0XHRsZXQgYXZhaWxhYmxlU2Vzc2lvbnNIZWlnaHQgPSBoZWlnaHQgLSBzZXNzaW9uc1RpdGxlSGVpZ2h0O1xuXHRcdGxldCByZXNlcnZlZENoYXRXaWRnZXRIZWlnaHQgPSAwO1xuXHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkKSB7XG5cdFx0XHRyZXNlcnZlZENoYXRXaWRnZXRIZWlnaHQgPSBNYXRoLm1heChDaGF0Vmlld1BhbmUuTUlOX0NIQVRfV0lER0VUX0hFSUdIVCwgdGhpcy5fd2lkZ2V0Py5pbnB1dD8uaGVpZ2h0LmdldCgpID8/IDApO1xuXHRcdFx0YXZhaWxhYmxlU2Vzc2lvbnNIZWlnaHQgLT0gcmVzZXJ2ZWRDaGF0V2lkZ2V0SGVpZ2h0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhdmFpbGFibGVTZXNzaW9uc0hlaWdodCAtPSB0aGlzLnNlc3Npb25zTmV3QnV0dG9uQ29udGFpbmVyPy5vZmZzZXRIZWlnaHQgPz8gMDtcblx0XHR9XG5cdFx0YXZhaWxhYmxlU2Vzc2lvbnNIZWlnaHQgPSBNYXRoLm1heCgwLCBhdmFpbGFibGVTZXNzaW9uc0hlaWdodCk7XG5cblx0XHQvLyBTaG93IGFzIHNpZGViYXJcblx0XHRpZiAodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGggPSB0aGlzLmNvbXB1dGVFZmZlY3RpdmVTaWRlQnlTaWRlU2Vzc2lvbnNTaWRlYmFyV2lkdGgod2lkdGgpO1xuXG5cdFx0XHR0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHthdmFpbGFibGVTZXNzaW9uc0hlaWdodH1weGA7XG5cdFx0XHR0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3Nlc3Npb25zVmlld2VyU2lkZWJhcldpZHRofXB4YDtcblx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sLmxheW91dChhdmFpbGFibGVTZXNzaW9uc0hlaWdodCwgc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGgpO1xuXHRcdFx0dGhpcy5zZXNzaW9uc1ZpZXdlclNhc2g/LmxheW91dCgpO1xuXG5cdFx0XHRoZWlnaHRSZWR1Y3Rpb24gPSAwOyAvLyBzaWRlIGJ5IHNpZGUgdG8gY2hhdCB3aWRnZXRcblx0XHRcdHdpZHRoUmVkdWN0aW9uID0gc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGggKyBDaGF0Vmlld1BhbmUuU0VTU0lPTlNfU0lERUJBUl9CT1JERVJfV0lEVEg7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBzdGFja2VkXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHthdmFpbGFibGVTZXNzaW9uc0hlaWdodH1weGA7XG5cdFx0XHR0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lci5zdHlsZS53aWR0aCA9IGBgO1xuXHRcdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wubGF5b3V0KGF2YWlsYWJsZVNlc3Npb25zSGVpZ2h0LCB3aWR0aCk7XG5cblx0XHRcdGhlaWdodFJlZHVjdGlvbiA9IHNlc3Npb25zVGl0bGVIZWlnaHQgKyBhdmFpbGFibGVTZXNzaW9uc0hlaWdodDtcblx0XHRcdHdpZHRoUmVkdWN0aW9uID0gMDsgLy8gc3RhY2tlZCBvbiB0b3Agb2YgdGhlIGNoYXQgd2lkZ2V0XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgaGVpZ2h0UmVkdWN0aW9uLCB3aWR0aFJlZHVjdGlvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlRWZmZWN0aXZlU2lkZUJ5U2lkZVNlc3Npb25zU2lkZWJhcldpZHRoKHdpZHRoOiBudW1iZXIsIHNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoID0gdGhpcy5zZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgubWF4KFxuXHRcdFx0Q2hhdFZpZXdQYW5lLlNFU1NJT05TX1NJREVCQVJfTUlOX1dJRFRILFx0XHRcdC8vIG5ldmVyIHNtYWxsZXIgdGhhbiBtaW4gd2lkdGggZm9yIHNpZGUgYnkgc2lkZSBzZXNzaW9uc1xuXHRcdFx0TWF0aC5taW4oXG5cdFx0XHRcdHNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoLFxuXHRcdFx0XHR3aWR0aCAtIENoYXRWaWV3UGFuZS5DSEFUX1dJREdFVF9ERUZBVUxUX1dJRFRIXHQvLyBuZXZlciBzbyB3aWRlIHRoYXQgY2hhdCB3aWRnZXQgaXMgc21hbGxlciB0aGFuIGRlZmF1bHQgd2lkdGhcblx0XHRcdClcblx0XHQpO1xuXHR9XG5cblx0Z2V0TGFzdERpbWVuc2lvbnMob3JpZW50YXRpb246IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbik6IHsgaGVpZ2h0OiBudW1iZXI7IHdpZHRoOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubGFzdERpbWVuc2lvbnNQZXJPcmllbnRhdGlvbi5nZXQob3JpZW50YXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXNzaW9uc1ZpZXdlclNhc2goY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuc2Vzc2lvbnNWaWV3ZXJTYXNoRGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBzYXNoID0gdGhpcy5zZXNzaW9uc1ZpZXdlclNhc2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNhc2goY29udGFpbmVyLCB7XG5cdFx0XHRnZXRWZXJ0aWNhbFNhc2hMZWZ0OiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoID0gdGhpcy5jb21wdXRlRWZmZWN0aXZlU2lkZUJ5U2lkZVNlc3Npb25zU2lkZWJhcldpZHRoKHRoaXMubGFzdERpbWVuc2lvbnM/LndpZHRoID8/IHdpZHRoKTtcblx0XHRcdFx0Y29uc3QgeyBwb3NpdGlvbiB9ID0gdGhpcy5nZXRWaWV3UG9zaXRpb25BbmRMb2NhdGlvbigpO1xuXHRcdFx0XHRpZiAocG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUKSB7XG5cdFx0XHRcdFx0cmV0dXJuICh0aGlzLmxhc3REaW1lbnNpb25zPy53aWR0aCA/PyB3aWR0aCkgLSBzZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBzZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aDtcblx0XHRcdH1cblx0XHR9LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCB9KSk7XG5cblx0XHRsZXQgc2FzaFN0YXJ0V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2FzaC5vbkRpZFN0YXJ0KCgpID0+IHNhc2hTdGFydFdpZHRoID0gdGhpcy5zZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkRW5kKCgpID0+IHNhc2hTdGFydFdpZHRoID0gdW5kZWZpbmVkKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2FzaC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChzYXNoU3RhcnRXaWR0aCA9PT0gdW5kZWZpbmVkIHx8ICF0aGlzLmxhc3REaW1lbnNpb25zKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyBwb3NpdGlvbiB9ID0gdGhpcy5nZXRWaWV3UG9zaXRpb25BbmRMb2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgZGVsdGEgPSBlLmN1cnJlbnRYIC0gZS5zdGFydFg7XG5cdFx0XHRjb25zdCBuZXdXaWR0aCA9IHBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVCA/IHNhc2hTdGFydFdpZHRoIC0gZGVsdGEgOiBzYXNoU3RhcnRXaWR0aCArIGRlbHRhO1xuXG5cdFx0XHRpZiAobmV3V2lkdGggPCBDaGF0Vmlld1BhbmUuU0VTU0lPTlNfU0lERUJBUl9TTkFQX1RIUkVTSE9MRCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyZWRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uKCdzdGFja2VkJyk7IC8vIHNuYXAgdG8gc3RhY2tlZCB3aGVuIHNpemVkIHNtYWxsIGVub3VnaFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGggPSB0aGlzLmNvbXB1dGVFZmZlY3RpdmVTaWRlQnlTaWRlU2Vzc2lvbnNTaWRlYmFyV2lkdGgodGhpcy5sYXN0RGltZW5zaW9ucy53aWR0aCwgbmV3V2lkdGgpO1xuXHRcdFx0dGhpcy52aWV3U3RhdGUuc2Vzc2lvbnNTaWRlYmFyV2lkdGggPSB0aGlzLnNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoO1xuXG5cdFx0XHR0aGlzLmxheW91dEJvZHkodGhpcy5sYXN0RGltZW5zaW9ucy5oZWlnaHQsIHRoaXMubGFzdERpbWVuc2lvbnMud2lkdGgpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkUmVzZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aCA9IENoYXRWaWV3UGFuZS5TRVNTSU9OU19TSURFQkFSX0RFRkFVTFRfV0lEVEg7XG5cdFx0XHR0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uc1NpZGViYXJXaWR0aCA9IHRoaXMuc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGg7XG5cblx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cblx0XHQvLyBEb24ndCBkbyBzYXZlU3RhdGUgd2hlbiBubyB3aWRnZXQsIG9yIG5vIHZpZXdNb2RlbCBpbiB3aGljaCBjYXNlXG5cdFx0Ly8gdGhlIHN0YXRlIGhhcyBub3QgeWV0IGJlZW4gcmVzdG9yZWQgLSBpbiB0aGF0IGNhc2UgdGhlIGRlZmF1bHRcblx0XHQvLyBzdGF0ZSB3b3VsZCBvdmVyd3JpdGUgdGhlIHJlYWwgc3RhdGVcblx0XHRpZiAodGhpcy5fd2lkZ2V0Py52aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zYXZlU3RhdGUoKTtcblxuXHRcdFx0dGhpcy51cGRhdGVWaWV3U3RhdGUoKTtcblx0XHRcdHRoaXMubWVtZW50by5zYXZlTWVtZW50bygpO1xuXHRcdH1cblxuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVWaWV3U3RhdGUodmlld1N0YXRlPzogSUNoYXRNb2RlbElucHV0U3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdWaWV3U3RhdGUgPSB2aWV3U3RhdGUgPz8gdGhpcy5fd2lkZ2V0LmdldElucHV0U3RhdGUoKTtcblx0XHRpZiAobmV3Vmlld1N0YXRlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhuZXdWaWV3U3RhdGUpKSB7XG5cdFx0XHRcdCh0aGlzLnZpZXdTdGF0ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XSA9IHZhbHVlOyAvLyBBc3NpZ24gYWxsIHByb3BzIHRvIHRoZSBtZW1lbnRvIHNvIHRoZXkgZ2V0IHNhdmVkXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdWxkU2hvd1dlbGNvbWUoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgbm9QZXJzaXN0ZWRTZXNzaW9ucyA9ICF0aGlzLmNoYXRTZXJ2aWNlLmhhc1Nlc3Npb25zKCk7XG5cdFx0Y29uc3QgaGFzQ29yZUFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50cygpLnNvbWUoYWdlbnQgPT4gYWdlbnQuaXNDb3JlICYmIGFnZW50LmxvY2F0aW9ucy5pbmNsdWRlcyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdFx0Y29uc3QgaGFzRGVmYXVsdEFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSAhPT0gdW5kZWZpbmVkOyAvLyBvbmx5IGZhbHNlIHdoZW4gSGlkZSBBSSBGZWF0dXJlcyBoYXMgcnVuIGFuZCB1bnJlZ2lzdGVyZWQgdGhlIHNldHVwIGFnZW50c1xuXHRcdGNvbnN0IHNob3VsZFNob3cgPSAhaGFzQ29yZUFnZW50ICYmICghaGFzRGVmYXVsdEFnZW50IHx8ICF0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbCAmJiBub1BlcnNpc3RlZFNlc3Npb25zKTtcblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hhdFZpZXdQYW5lI3Nob3VsZFNob3dXZWxjb21lKCkgPSAke3Nob3VsZFNob3d9OiBoYXNDb3JlQWdlbnQ9JHtoYXNDb3JlQWdlbnR9IGhhc0RlZmF1bHRBZ2VudD0ke2hhc0RlZmF1bHRBZ2VudH0gfHwgbm9WaWV3TW9kZWw9JHshdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWx9ICYmIG5vUGVyc2lzdGVkU2Vzc2lvbnM9JHtub1BlcnNpc3RlZFNlc3Npb25zfWApO1xuXG5cdFx0cmV0dXJuICEhc2hvdWxkU2hvdztcblx0fVxuXG5cdGdldE1hdGNoaW5nV2VsY29tZVZpZXcoKTogSUNoYXRWaWV3c1dlbGNvbWVEZXNjcmlwdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53ZWxjb21lQ29udHJvbGxlcj8uZ2V0TWF0Y2hpbmdXZWxjb21lVmlldygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aW9uc0NvbnRleHQoKTogSUNoYXRWaWV3VGl0bGVBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWwgPyB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHRoaXMuX3dpZGdldC52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkNoYXRWaWV3Q29udGV4dFxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLHVCQUF1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
