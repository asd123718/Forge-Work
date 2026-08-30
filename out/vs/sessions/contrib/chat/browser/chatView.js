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
import "./media/chatView.css";
import "./media/voiceChatView.css";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IMicCaptureService } from "../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js";
import { IVoiceSessionController } from "../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from "../../../../workbench/common/theme.js";
import { ChatWidget } from "../../../../workbench/contrib/chat/browser/widget/chatWidget.js";
import { setModelPreservingInputTypedWhileLoading } from "../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { isChatTranscriptContextVariableEntry } from "../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../workbench/contrib/chat/common/constants.js";
import { getChatSessionType } from "../../../../workbench/contrib/chat/common/model/chatUri.js";
import { IChatSessionsService, localChatSessionType } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { AbstractChatView } from "../../../browser/parts/chatView.js";
import { ChatInteractivity, getSessionStatusMessage, isActiveSessionStatus } from "../../../services/sessions/common/session.js";
import { NewChatWidget } from "./newChatWidget.js";
import { NewChatInSessionWidget } from "./newChatInSessionWidget.js";
import { SessionInputBanners } from "../../sessionInputBanners/browser/sessionInputBanners.js";
import { SessionChatInputToolbar } from "./sessionChatInputToolbar.js";
import { ResponseSelectionSideChatController } from "./responseSelectionSideChatController.js";
import { ISessionChatPillsDebugService } from "./sessionChatInputToolbarDebug.js";
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from "./sessionsChatHistory.js";
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground, inactiveSessionViewBackground, inactiveSessionViewForeground } from "../../../common/theme.js";
import { setupVoiceInputDecorations } from "./voiceInputDecorations.js";
import { INewChatVoiceTargetService } from "./newChatVoice.js";
import { ISessionsChatViewStateService } from "./chatViewStateService.js";
function shouldShowSessionChatTip(sessionStatus) {
  return sessionStatus === void 0 || !isActiveSessionStatus(sessionStatus);
}
let NewChatView = class extends AbstractChatView {
  constructor(isNewChatInSession, options, instantiationService) {
    super();
    this.element.classList.add("chat-view-new");
    this.kind = isNewChatInSession ? "newChatInSession" : "newSession";
    this._widget = this._register(isNewChatInSession ? instantiationService.createInstance(NewChatInSessionWidget, options) : instantiationService.createInstance(NewChatWidget, options));
    this._widget.render(this.element);
  }
  toJSON() {
    return { type: NewChatView.TYPE };
  }
  doLayout(width, height, _top, _left) {
    this._widget.layout(height, width);
  }
  focus() {
    this._widget.focusInput();
  }
  selectWorkspace(folderUri, providerId) {
    if (this._widget instanceof NewChatWidget) {
      this._widget.selectWorkspace(folderUri, providerId);
    }
  }
  prefillInput(text) {
    if (this._widget instanceof NewChatWidget) {
      this._widget.prefillInput(text);
    }
  }
  sendQuery(text) {
    if (this._widget instanceof NewChatWidget) {
      this._widget.sendQuery(text);
    }
  }
  submitInput() {
    return this._widget instanceof NewChatWidget ? this._widget.submitInput() : Promise.resolve(false);
  }
  attach(uris) {
    this._widget.attach(uris);
  }
  setVisible(visible) {
    if (this._widget instanceof NewChatWidget) {
      this._widget.setHostVisible(visible);
    }
  }
};
NewChatView.TYPE = "sessions.newSession";
NewChatView = __decorateClass([
  __decorateParam(2, IInstantiationService)
], NewChatView);
let ChatView = class extends AbstractChatView {
  constructor(instantiationService, contextKeyService, chatService, chatSessionsService, configurationService, logService, keybindingService, themeService, accessibilityService, voiceSessionController, micCaptureService, ttsPlaybackService, chatPillsDebugService, newChatVoiceTargetService, viewStateService) {
    super();
    this.chatService = chatService;
    this.chatSessionsService = chatSessionsService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.keybindingService = keybindingService;
    this.themeService = themeService;
    this.accessibilityService = accessibilityService;
    this.voiceSessionController = voiceSessionController;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.chatPillsDebugService = chatPillsDebugService;
    this.newChatVoiceTargetService = newChatVoiceTargetService;
    this.viewStateService = viewStateService;
    this.kind = "chat";
    /** Reference to the loaded chat model; disposing releases the model. */
    this._modelRef = this._register(new MutableDisposable());
    /** Cancels any in-flight model load when a new session is set or the view disposes. */
    this._loadCts = this._register(new MutableDisposable());
    /** Tracks the current chat's interactivity and hides the input for read-only chats. */
    this._interactiveDisposable = this._register(new MutableDisposable());
    this._currentChatResourceObs = observableValue(this, void 0);
    this._currentSessionObs = observableValue(this, void 0);
    /** Whether this view currently represents the active session. */
    this._isActive = true;
    /** Observable mirror of {@link _isActive} so the voice overlay can react. */
    this._isActiveObs = observableValue(this, true);
    this.element.classList.add("chat-view-chat");
    const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
    const scopedInstantiationService = this._register(instantiationService.createChild(
      new ServiceCollection([IContextKeyService, scopedContextKeyService])
    ));
    this._voiceInitiatedHereKey = scopedContextKeyService.createKey("agentsVoiceInitiatedHere", false);
    this._widget = this._register(scopedInstantiationService.createInstance(
      ChatWidget,
      ChatAgentLocation.Chat,
      void 0,
      {
        autoScroll: (mode) => mode !== ChatModeKind.Ask,
        renderFollowups: true,
        supportsFileReferences: true,
        rendererOptions: {
          referencesExpandedWhenEmptyResponse: false,
          progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask
        },
        enableImplicitContext: true,
        enableWorkingSet: "implicit",
        supportsChangingModes: true,
        inputEditorMinLines: 2,
        isSessionsWindow: true,
        enableFind: true,
        renderGettingStartedTip: () => shouldShowSessionChatTip(this._currentSessionObs.get()?.status.get())
      },
      this._buildStyles(this._isActive)
    ));
    this._widget.render(this.element);
    this._register(autorun((reader) => {
      const sessionStatus = this._currentSessionObs.read(reader)?.status.read(reader);
      if (!shouldShowSessionChatTip(sessionStatus)) {
        this._widget.updateGettingStartedTip();
      }
    }));
    const chatModel = observableFromEvent(this, this._widget.onDidChangeViewModel, () => this._widget.viewModel?.model);
    this._setupTranscriptPreparationProgress(chatModel);
    this._setupInitialTranscriptContext(chatModel);
    this._selectionSideChatController = this._register(scopedInstantiationService.createInstance(ResponseSelectionSideChatController, this._widget));
    this._banners = this._register(instantiationService.createInstance(SessionInputBanners));
    this._banners.setActive(this._isActive);
    this._chatPills = this._register(instantiationService.createInstance(SessionChatInputToolbar));
    this._register(chatPillsDebugService.register(this._chatPills, this._banners, this._isActiveObs));
    this._ensureBannersMounted();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
        this._applyHistoryKey();
      }
    }));
    this._setupVoiceOverlay();
    this._register(autorun((reader) => {
      const active = this._isActiveObs.read(reader);
      const voiceActive = this.voiceSessionController.isConnected.read(reader) || this.voiceSessionController.isConnecting.read(reader);
      const target = this.voiceSessionController.targetSession.read(reader);
      const hasDraftTarget = this.voiceSessionController.hasDraftTarget.read(reader);
      const omniInputOpen = this.voiceSessionController.omniInputOpen.read(reader);
      const current = this._currentChatResourceObs.read(reader);
      const ownsVoice = !hasDraftTarget && (!target || !!current && isEqual(target, current));
      this._voiceInitiatedHereKey.set(!omniInputOpen && active && voiceActive && ownsVoice);
    }));
  }
  _setupTranscriptPreparationProgress(chatModel) {
    this._register(autorun((reader) => {
      const resource = this._currentChatResourceObs.read(reader);
      const session = this._currentSessionObs.read(reader);
      const statusMessage = session ? getSessionStatusMessage(session.status.read(reader), session.description.read(reader)) : void 0;
      const activity = typeof statusMessage === "string" ? statusMessage : statusMessage ? renderAsPlaintext(statusMessage) : void 0;
      const model = chatModel.read(reader);
      let showProgress;
      if (!resource) {
        showProgress = false;
      } else if (!model) {
        showProgress = true;
      } else {
        const requests = model.getRequests();
        const lastRequest = model.lastRequestObs.read(reader);
        const visibleRequestCount = requests.filter((request) => !request.isHiddenFromTranscript).length;
        const hiddenRequestIncomplete = lastRequest?.isHiddenFromTranscript ? lastRequest.response?.isIncomplete.read(reader) : void 0;
        showProgress = shouldShowTranscriptPreparationProgress(requests.length, visibleRequestCount, hiddenRequestIncomplete);
      }
      const progress = getTranscriptProgress(showProgress, activity);
      this._widget.setTranscriptProgress(progress, progress);
    }));
  }
  _setupInitialTranscriptContext(chatModel) {
    let currentEntryId;
    this._register(autorun((reader) => {
      const model = chatModel.read(reader);
      model?.lastRequestObs.read(reader);
      const requests = model?.getRequests() ?? [];
      const hasVisibleRequest = requests.some((request) => !request.isHiddenFromTranscript);
      const entry = hasVisibleRequest ? void 0 : findTranscriptContextEntry(requests.filter((request) => request.isHiddenFromTranscript));
      if (entry?.id === currentEntryId) {
        return;
      }
      currentEntryId = entry?.id;
      this._widget.setTranscriptContext(entry);
    }));
  }
  dispose() {
    this._saveCurrentViewState();
    this._loadCts.value?.cancel();
    super.dispose();
  }
  _buildStyles(active) {
    return {
      listForeground: active ? activeSessionViewForeground : inactiveSessionViewForeground,
      listBackground: active ? activeSessionViewBackground : inactiveSessionViewBackground,
      overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
      inputEditorBackground: inactiveSessionViewBackground,
      resultEditorBackground: agentsPanelBackground
    };
  }
  /** The underlying chat widget. */
  get widget() {
    return this._widget;
  }
  setChat(chat, historyKey, session) {
    this.chatPillsDebugService.clear(this._chatPills);
    this._currentSessionObs.set(session, void 0);
    const resource = chat.resource;
    const previousChatResource = this._currentChatResource;
    const chatChanged = !isEqual(previousChatResource, resource);
    if (chatChanged) {
      this._saveCurrentViewState();
    }
    this._historyKey = historyKey;
    this._applyHistoryKey();
    this._chatPills.setChat(chat);
    this._selectionSideChatController.setChat(chat);
    this._banners.setDebugData(void 0);
    this._interactiveDisposable.value = autorun((reader) => {
      this._widget.setReadOnly(chat.interactivity.read(reader) !== ChatInteractivity.Full);
    });
    if (!chatChanged) {
      return;
    }
    this._currentChatResource = resource;
    this._currentChatResourceObs.set(resource, void 0);
    this._loadCts.value?.cancel();
    if (previousChatResource) {
      this._clearCurrentChat();
    }
    const cts = new CancellationTokenSource();
    this._loadCts.value = cts;
    const token = cts.token;
    this._widget.setLoading(true);
    const inputBeforeLoad = this._widget.getInput();
    const loadPromise = this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, "ChatView").then((ref) => {
      if (token.isCancellationRequested || !ref || !isEqual(this._currentChatResource, resource)) {
        ref?.dispose();
        if (isEqual(this._currentChatResource, resource)) {
          this._widget.setLoading(false);
        }
        return;
      }
      this._modelRef.value = ref;
      this._updateWidgetLockState(getChatSessionType(ref.object.sessionResource));
      setModelPreservingInputTypedWhileLoading(this._widget, inputBeforeLoad, () => this._widget.setModel(ref.object));
      const widgetViewState = this.viewStateService.get(resource);
      if (widgetViewState) {
        this._widget.restoreViewState(widgetViewState);
      }
      this._widget.setLoading(false);
      this.element.dataset.boundChatResource = resource.toString();
    }, (err) => {
      if (!token.isCancellationRequested) {
        this.logService.error("[ChatView] Failed to load chat model for chat", err);
      }
      if (isEqual(this._currentChatResource, resource)) {
        this._currentChatResource = void 0;
        this._currentChatResourceObs.set(void 0, void 0);
        this._widget.setLoading(false);
      }
    });
    this.showProgressWhile(loadPromise, 800);
  }
  _saveCurrentViewState() {
    const resource = this._widget.viewModel?.sessionResource;
    if (resource) {
      this.viewStateService.set(resource, this._widget.getViewState());
    }
  }
  _clearCurrentChat() {
    this._widget.clear().catch((err) => this.logService.error("[ChatView] Failed to clear chat widget", err));
    this._widget.setModel(void 0);
    this._modelRef.clear();
    delete this.element.dataset.boundChatResource;
  }
  _applyHistoryKey() {
    const scopedHistory = this.configurationService.getValue(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false;
    this._widget.inputPart.setHistoryKey(scopedHistory ? this._historyKey : void 0);
  }
  _updateWidgetLockState(sessionType) {
    if (sessionType === localChatSessionType) {
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
  toJSON() {
    return { type: ChatView.TYPE };
  }
  doLayout(width, height, _top, _left) {
    this._ensureBannersMounted();
    this._widget.layout(height, width);
  }
  /**
   * Mounts the status pills and session banners above the chat input.
   */
  _ensureBannersMounted() {
    const inputPartElement = this._widget.inputPart.element;
    const persistentContentContainer = this._widget.inputPart.persistentContentContainerElement;
    const pillsNode = this._chatPills.element;
    const bannersNode = this._banners.domNode;
    if (persistentContentContainer.firstChild !== pillsNode) {
      persistentContentContainer.insertBefore(pillsNode, persistentContentContainer.firstChild);
    }
    if (persistentContentContainer.nextSibling !== bannersNode) {
      inputPartElement.insertBefore(bannersNode, persistentContentContainer.nextSibling);
    }
  }
  //#region Voice overlay
  /**
   * Sets up this view's transcript overlay and input glow, mirroring `ChatViewPane`.
   * Shows only while voice is connected and targeting this active session.
   */
  _setupVoiceOverlay() {
    const inputContainerEl = this._widget.inputPart.inputContainerElement;
    if (!inputContainerEl) {
      return;
    }
    const isVoiceSurfaceActive = derived(
      this,
      (reader) => this._isActiveObs.read(reader) && !this.voiceSessionController.omniInputOpen.read(reader)
    );
    this._register(setupVoiceInputDecorations({
      voiceSessionController: this.voiceSessionController,
      ttsPlaybackService: this.ttsPlaybackService,
      micCaptureService: this.micCaptureService,
      configurationService: this.configurationService,
      keybindingService: this.keybindingService,
      themeService: this.themeService,
      accessibilityService: this.accessibilityService
    }, {
      inputContainer: inputContainerEl,
      isActive: isVoiceSurfaceActive,
      getCurrentResource: () => this._currentChatResource,
      currentVoiceInputResource: this.newChatVoiceTargetService.currentVoiceInputResource
    }));
  }
  //#endregion
  focus() {
    this._widget.focusInput();
  }
  attach(uris) {
    for (const uri of uris) {
      this._widget.attachmentModel.addFile(uri).catch((err) => this.logService.error("[ChatView] Failed to attach file as context", err));
    }
  }
  setActive(active) {
    if (this._isActive === active) {
      return;
    }
    this._isActive = active;
    this._isActiveObs.set(active, void 0);
    this._banners.setActive(active);
    this._widget.setStyles(this._buildStyles(active));
  }
  setVisible(visible) {
    if (this._isVisible === visible) {
      return;
    }
    this._isVisible = visible;
    this._widget.setVisible(visible);
  }
};
ChatView.TYPE = "sessions.session";
ChatView = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatSessionsService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IAccessibilityService),
  __decorateParam(9, IVoiceSessionController),
  __decorateParam(10, IMicCaptureService),
  __decorateParam(11, ITtsPlaybackService),
  __decorateParam(12, ISessionChatPillsDebugService),
  __decorateParam(13, INewChatVoiceTargetService),
  __decorateParam(14, ISessionsChatViewStateService)
], ChatView);
function shouldShowTranscriptPreparationProgress(requestCount, visibleRequestCount, hiddenRequestIncomplete) {
  return requestCount === 0 || visibleRequestCount === 0 && hiddenRequestIncomplete !== false;
}
function getTranscriptProgress(showProgress, activity) {
  if (!showProgress) {
    return void 0;
  }
  return activity?.trim() || void 0;
}
function findTranscriptContextEntry(requests) {
  for (const request of requests) {
    const entry = [...request.variableData.variables, ...request.attachedContext ?? []].find(isChatTranscriptContextVariableEntry);
    if (entry) {
      return entry;
    }
  }
  return void 0;
}
let ChatViewFactory = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  createNewChatView(isNewChatInSession, options) {
    return this.instantiationService.createInstance(NewChatView, isNewChatInSession, options);
  }
  createChatView() {
    return this.instantiationService.createInstance(ChatView);
  }
};
ChatViewFactory = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ChatViewFactory);
export {
  ChatView,
  ChatViewFactory,
  NewChatView,
  findTranscriptContextEntry,
  getTranscriptProgress,
  shouldShowSessionChatTip,
  shouldShowTranscriptPreparationProgress
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcY2hhdFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdFZpZXcuY3NzJztcbmltcG9ydCAnLi9tZWRpYS92b2ljZUNoYXRWaWV3LmNzcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWljQ2FwdHVyZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvbWljQ2FwdHVyZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVR0c1BsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC90dHNQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VTZXNzaW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEVESVRPUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IENoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgc2V0TW9kZWxQcmVzZXJ2aW5nSW5wdXRUeXBlZFdoaWxlTG9hZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWxSZWZlcmVuY2UsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ2hhdFRyYW5zY3JpcHRDb250ZXh0VmFyaWFibGVFbnRyeSwgSUNoYXRSZXF1ZXN0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5LCBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0Q2hhdFZpZXcsIENoYXRWaWV3S2luZCwgSUNoYXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvY2hhdFZpZXcuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIGdldFNlc3Npb25TdGF0dXNNZXNzYWdlLCBJQ2hhdCwgaXNBY3RpdmVTZXNzaW9uU3RhdHVzLCBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElDaGF0Vmlld0ZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0Vmlldy9icm93c2VyL2NoYXRWaWV3RmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBOZXdDaGF0V2lkZ2V0IH0gZnJvbSAnLi9uZXdDaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IE5ld0NoYXRJblNlc3Npb25XaWRnZXQgfSBmcm9tICcuL25ld0NoYXRJblNlc3Npb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbklucHV0QmFubmVycyB9IGZyb20gJy4uLy4uL3Nlc3Npb25JbnB1dEJhbm5lcnMvYnJvd3Nlci9zZXNzaW9uSW5wdXRCYW5uZXJzLmpzJztcbmltcG9ydCB7IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyIH0gZnJvbSAnLi9zZXNzaW9uQ2hhdElucHV0VG9vbGJhci5qcyc7XG5pbXBvcnQgeyBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlciB9IGZyb20gJy4vcmVzcG9uc2VTZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2UgfSBmcm9tICcuL3Nlc3Npb25DaGF0SW5wdXRUb29sYmFyRGVidWcuanMnO1xuaW1wb3J0IHsgQUdFTlRfU0VTU0lPTlNfU0NPUEVEX0lOUFVUX0hJU1RPUllfU0VUVElORyB9IGZyb20gJy4vc2Vzc2lvbnNDaGF0SGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBhY3RpdmVTZXNzaW9uVmlld0JhY2tncm91bmQsIGFjdGl2ZVNlc3Npb25WaWV3Rm9yZWdyb3VuZCwgYWdlbnRzUGFuZWxCYWNrZ3JvdW5kLCBpbmFjdGl2ZVNlc3Npb25WaWV3QmFja2dyb3VuZCwgaW5hY3RpdmVTZXNzaW9uVmlld0ZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgc2V0dXBWb2ljZUlucHV0RGVjb3JhdGlvbnMgfSBmcm9tICcuL3ZvaWNlSW5wdXREZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4vbmV3Q2hhdFZvaWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc0NoYXRWaWV3U3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0Vmlld1N0YXRlU2VydmljZS5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRTaG93U2Vzc2lvbkNoYXRUaXAoc2Vzc2lvblN0YXR1czogU2Vzc2lvblN0YXR1cyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2Vzc2lvblN0YXR1cyA9PT0gdW5kZWZpbmVkIHx8ICFpc0FjdGl2ZVNlc3Npb25TdGF0dXMoc2Vzc2lvblN0YXR1cyk7XG59XG5cbi8qKlxuICogQSBzZXNzaW9uIHZpZXcgdGhhdCBob3N0cyBhIHtAbGluayBOZXdDaGF0V2lkZ2V0fSBcdTIwMTQgdGhlIFwibmV3IHNlc3Npb25cIiBVSVxuICogc2hvd24gYmVmb3JlIGEgc2Vzc2lvbiBoYXMgYmVlbiBjcmVhdGVkLiBUaGlzIGlzIHRoZSBkZWZhdWx0IHZpZXcgdGhhdFxuICogdGhlIGBTZXNzaW9uc1BhcnRgIGdyaWQgaXMgc2VlZGVkIHdpdGguXG4gKi9cbmV4cG9ydCBjbGFzcyBOZXdDaGF0VmlldyBleHRlbmRzIEFic3RyYWN0Q2hhdFZpZXcge1xuXG5cdHN0YXRpYyByZWFkb25seSBUWVBFID0gJ3Nlc3Npb25zLm5ld1Nlc3Npb24nO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IGtpbmQ6IENoYXRWaWV3S2luZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQ6IE5ld0NoYXRXaWRnZXQgfCBOZXdDaGF0SW5TZXNzaW9uV2lkZ2V0O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlzTmV3Q2hhdEluU2Vzc2lvbjogYm9vbGVhbixcblx0XHRvcHRpb25zOiBJQ2hhdFZpZXdPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtdmlldy1uZXcnKTtcblx0XHR0aGlzLmtpbmQgPSBpc05ld0NoYXRJblNlc3Npb24gPyAnbmV3Q2hhdEluU2Vzc2lvbicgOiAnbmV3U2Vzc2lvbic7XG5cdFx0dGhpcy5fd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoaXNOZXdDaGF0SW5TZXNzaW9uXG5cdFx0XHQ/IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRJblNlc3Npb25XaWRnZXQsIG9wdGlvbnMpXG5cdFx0XHQ6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRXaWRnZXQsIG9wdGlvbnMpKTtcblx0XHR0aGlzLl93aWRnZXQucmVuZGVyKHRoaXMuZWxlbWVudCk7XG5cdH1cblxuXHRvdmVycmlkZSB0b0pTT04oKTogb2JqZWN0IHtcblx0XHRyZXR1cm4geyB0eXBlOiBOZXdDaGF0Vmlldy5UWVBFIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZG9MYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIF90b3A6IG51bWJlciwgX2xlZnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuZm9jdXNJbnB1dCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2VsZWN0V29ya3NwYWNlKGZvbGRlclVyaTogVVJJLCBwcm92aWRlcklkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldCBpbnN0YW5jZW9mIE5ld0NoYXRXaWRnZXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zZWxlY3RXb3Jrc3BhY2UoZm9sZGVyVXJpLCBwcm92aWRlcklkKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBwcmVmaWxsSW5wdXQodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldCBpbnN0YW5jZW9mIE5ld0NoYXRXaWRnZXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5wcmVmaWxsSW5wdXQodGV4dCk7XG5cdFx0fVxuXHR9XG5cblxuXHRvdmVycmlkZSBzZW5kUXVlcnkodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldCBpbnN0YW5jZW9mIE5ld0NoYXRXaWRnZXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zZW5kUXVlcnkodGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc3VibWl0SW5wdXQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldCBpbnN0YW5jZW9mIE5ld0NoYXRXaWRnZXQgPyB0aGlzLl93aWRnZXQuc3VibWl0SW5wdXQoKSA6IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhdHRhY2godXJpczogVVJJW10pOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuYXR0YWNoKHVyaXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldCBpbnN0YW5jZW9mIE5ld0NoYXRXaWRnZXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRIb3N0VmlzaWJsZSh2aXNpYmxlKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBBIHNlc3Npb24gdmlldyB0aGF0IGhvc3RzIHRoZSBzdGFuZGFyZCBjaGF0IHtAbGluayBDaGF0V2lkZ2V0fSBcdTIwMTQgdXNlZCB0b1xuICogcmVuZGVyIGFuIGFjdGl2ZSBjaGF0IHNlc3Npb24gaW5zaWRlIHRoZSBgU2Vzc2lvbnNQYXJ0YCBncmlkLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXcgZXh0ZW5kcyBBYnN0cmFjdENoYXRWaWV3IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVFlQRSA9ICdzZXNzaW9ucy5zZXNzaW9uJztcblxuXHRvdmVycmlkZSByZWFkb25seSBraW5kOiBDaGF0Vmlld0tpbmQgPSAnY2hhdCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0OiBDaGF0V2lkZ2V0O1xuXG5cdC8qKiBTZXNzaW9uIGJhbm5lcnMgKENJIGZhaWx1cmVzLCBjcmVhdGVkIGNvbW1lbnRzKSBzaG93biBhYm92ZSB0aGUgY2hhdCBpbnB1dC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYmFubmVyczogU2Vzc2lvbklucHV0QmFubmVycztcblx0LyoqIEZsb2F0aW5nIHN0YXR1cyBwaWxscyAoY2hhbmdlcywgcHJldmlldywgYmFja2dyb3VuZCBhY3Rpdml0eSkgYWJvdmUgdGhlIGlucHV0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0UGlsbHM6IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyO1xuXG5cdC8qKiBTaG93cyBhbiBcIkFzayBRdWVzdGlvblwiIGlucHV0IHdoZW4gdGhlIHVzZXIgc2VsZWN0cyBhc3Npc3RhbnQgbWFya2Rvd24gdGV4dC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uU2lkZUNoYXRDb250cm9sbGVyOiBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlcjtcblxuXHQvKiogUmVmZXJlbmNlIHRvIHRoZSBsb2FkZWQgY2hhdCBtb2RlbDsgZGlzcG9zaW5nIHJlbGVhc2VzIHRoZSBtb2RlbC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUNoYXRNb2RlbFJlZmVyZW5jZT4oKSk7XG5cblx0LyoqIENhbmNlbHMgYW55IGluLWZsaWdodCBtb2RlbCBsb2FkIHdoZW4gYSBuZXcgc2Vzc2lvbiBpcyBzZXQgb3IgdGhlIHZpZXcgZGlzcG9zZXMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXG5cdC8qKiBUcmFja3MgdGhlIGN1cnJlbnQgY2hhdCdzIGludGVyYWN0aXZpdHkgYW5kIGhpZGVzIHRoZSBpbnB1dCBmb3IgcmVhZC1vbmx5IGNoYXRzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnRlcmFjdGl2ZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0LyoqIFRyYWNrcyB0aGUgY3VycmVudGx5IGxvYWRlZCBjaGF0IHJlc291cmNlIHRvIGF2b2lkIHJlZHVuZGFudCByZWxvYWRzLiAqL1xuXHRwcml2YXRlIF9jdXJyZW50Q2hhdFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRDaGF0UmVzb3VyY2VPYnMgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50U2Vzc2lvbk9icyA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSBfaGlzdG9yeUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBXaGV0aGVyIHRoaXMgdmlldyBjdXJyZW50bHkgcmVwcmVzZW50cyB0aGUgYWN0aXZlIHNlc3Npb24uICovXG5cdHByaXZhdGUgX2lzQWN0aXZlID0gdHJ1ZTtcblx0LyoqIE9ic2VydmFibGUgbWlycm9yIG9mIHtAbGluayBfaXNBY3RpdmV9IHNvIHRoZSB2b2ljZSBvdmVybGF5IGNhbiByZWFjdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaXNBY3RpdmVPYnMgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgdHJ1ZSk7XG5cblx0LyoqIFdoZXRoZXIgdGhpcyB2aWV3IGlzIGN1cnJlbnRseSB2aXNpYmxlLiBgdW5kZWZpbmVkYCBzbyB0aGUgZmlyc3QgcHVzaCBhbHdheXMgcmVhY2hlcyB0aGUgd2lkZ2V0LiAqL1xuXHRwcml2YXRlIF9pc1Zpc2libGU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFBlci12aWV3IG1pcnJvciBvZiBgYWdlbnRzVm9pY2VJbml0aWF0ZWRIZXJlYCwgc2NvcGVkIGFib3ZlIHRoZSBjaGF0IHdpZGdldC5cblx0ICogS2VlcHMgcG9zdC1jb25uZWN0IHZvaWNlIGNvbnRyb2xzIGFuY2hvcmVkIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbiB2aWV3LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdm9pY2VJbml0aWF0ZWRIZXJlS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciBwcml2YXRlIHJlYWRvbmx5IHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI6IElWb2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdEBJTWljQ2FwdHVyZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtaWNDYXB0dXJlU2VydmljZTogSU1pY0NhcHR1cmVTZXJ2aWNlLFxuXHRcdEBJVHRzUGxheWJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHRzUGxheWJhY2tTZXJ2aWNlOiBJVHRzUGxheWJhY2tTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRQaWxsc0RlYnVnU2VydmljZTogSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2UsXG5cdFx0QElOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZTogSU5ld0NoYXRWb2ljZVRhcmdldFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc0NoYXRWaWV3U3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld1N0YXRlU2VydmljZTogSVNlc3Npb25zQ2hhdFZpZXdTdGF0ZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC12aWV3LWNoYXQnKTtcblxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWxlbWVudCkpO1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKVxuXHRcdCkpO1xuXG5cdFx0Ly8gTWF0Y2hlcyBgQUdFTlRTX1ZPSUNFX0lOSVRJQVRFRF9IRVJFYCBpbiBhZ2VudHNWb2ljZS5jb250cmlidXRpb24udHMuXG5cdFx0dGhpcy5fdm9pY2VJbml0aWF0ZWRIZXJlS2V5ID0gc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KCdhZ2VudHNWb2ljZUluaXRpYXRlZEhlcmUnLCBmYWxzZSk7XG5cblx0XHR0aGlzLl93aWRnZXQgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRXaWRnZXQsXG5cdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRhdXRvU2Nyb2xsOiBtb2RlID0+IG1vZGUgIT09IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdHJlbmRlckZvbGxvd3VwczogdHJ1ZSxcblx0XHRcdFx0c3VwcG9ydHNGaWxlUmVmZXJlbmNlczogdHJ1ZSxcblx0XHRcdFx0cmVuZGVyZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0cmVmZXJlbmNlc0V4cGFuZGVkV2hlbkVtcHR5UmVzcG9uc2U6IGZhbHNlLFxuXHRcdFx0XHRcdHByb2dyZXNzTWVzc2FnZUF0Qm90dG9tT2ZSZXNwb25zZTogbW9kZSA9PiBtb2RlICE9PSBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmFibGVJbXBsaWNpdENvbnRleHQ6IHRydWUsXG5cdFx0XHRcdGVuYWJsZVdvcmtpbmdTZXQ6ICdpbXBsaWNpdCcsXG5cdFx0XHRcdHN1cHBvcnRzQ2hhbmdpbmdNb2RlczogdHJ1ZSxcblx0XHRcdFx0aW5wdXRFZGl0b3JNaW5MaW5lczogMixcblx0XHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSxcblx0XHRcdFx0ZW5hYmxlRmluZDogdHJ1ZSxcblx0XHRcdFx0cmVuZGVyR2V0dGluZ1N0YXJ0ZWRUaXA6ICgpID0+IHNob3VsZFNob3dTZXNzaW9uQ2hhdFRpcCh0aGlzLl9jdXJyZW50U2Vzc2lvbk9icy5nZXQoKT8uc3RhdHVzLmdldCgpKSxcblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9idWlsZFN0eWxlcyh0aGlzLl9pc0FjdGl2ZSlcblx0XHQpKTtcblx0XHR0aGlzLl93aWRnZXQucmVuZGVyKHRoaXMuZWxlbWVudCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXR1cyA9IHRoaXMuX2N1cnJlbnRTZXNzaW9uT2JzLnJlYWQocmVhZGVyKT8uc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghc2hvdWxkU2hvd1Nlc3Npb25DaGF0VGlwKHNlc3Npb25TdGF0dXMpKSB7XG5cdFx0XHRcdHRoaXMuX3dpZGdldC51cGRhdGVHZXR0aW5nU3RhcnRlZFRpcCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuX3dpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCwgKCkgPT4gdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWwpO1xuXHRcdHRoaXMuX3NldHVwVHJhbnNjcmlwdFByZXBhcmF0aW9uUHJvZ3Jlc3MoY2hhdE1vZGVsKTtcblx0XHR0aGlzLl9zZXR1cEluaXRpYWxUcmFuc2NyaXB0Q29udGV4dChjaGF0TW9kZWwpO1xuXG5cdFx0dGhpcy5fc2VsZWN0aW9uU2lkZUNoYXRDb250cm9sbGVyID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzcG9uc2VTZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIsIHRoaXMuX3dpZGdldCkpO1xuXG5cdFx0Ly8gTW91bnQgdGhlIHNlc3Npb24gYmFubmVycyBkaXJlY3RseSBhYm92ZSB0aGUgY2hhdCBpbnB1dC5cblx0XHR0aGlzLl9iYW5uZXJzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbklucHV0QmFubmVycykpO1xuXHRcdHRoaXMuX2Jhbm5lcnMuc2V0QWN0aXZlKHRoaXMuX2lzQWN0aXZlKTtcblxuXHRcdC8vIEZsb2F0aW5nIHN0YXR1cyBwaWxscyBhYm92ZSB0aGUgaW5wdXQuXG5cdFx0dGhpcy5fY2hhdFBpbGxzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjaGF0UGlsbHNEZWJ1Z1NlcnZpY2UucmVnaXN0ZXIodGhpcy5fY2hhdFBpbGxzLCB0aGlzLl9iYW5uZXJzLCB0aGlzLl9pc0FjdGl2ZU9icykpO1xuXHRcdHRoaXMuX2Vuc3VyZUJhbm5lcnNNb3VudGVkKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFHRU5UX1NFU1NJT05TX1NDT1BFRF9JTlBVVF9ISVNUT1JZX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHRoaXMuX2FwcGx5SGlzdG9yeUtleSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFZvaWNlIHRyYW5zY3JpcHQgb3ZlcmxheSArIGlucHV0IGdsb3cuXG5cdFx0dGhpcy5fc2V0dXBWb2ljZU92ZXJsYXkoKTtcblxuXHRcdC8vIEFuY2hvciBwb3N0LWNvbm5lY3Qgdm9pY2UgY29udHJvbHMgdG8gdGhpcyBhY3RpdmUgdm9pY2Ugdmlldy5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLl9pc0FjdGl2ZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2b2ljZUFjdGl2ZSA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcilcblx0XHRcdFx0fHwgdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGluZy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudGFyZ2V0U2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYXNEcmFmdFRhcmdldCA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5oYXNEcmFmdFRhcmdldC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBvbW5pSW5wdXRPcGVuID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm9tbmlJbnB1dE9wZW4ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2N1cnJlbnRDaGF0UmVzb3VyY2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgb3duc1ZvaWNlID0gIWhhc0RyYWZ0VGFyZ2V0ICYmICghdGFyZ2V0IHx8ICghIWN1cnJlbnQgJiYgaXNFcXVhbCh0YXJnZXQsIGN1cnJlbnQpKSk7XG5cdFx0XHR0aGlzLl92b2ljZUluaXRpYXRlZEhlcmVLZXkuc2V0KCFvbW5pSW5wdXRPcGVuICYmIGFjdGl2ZSAmJiB2b2ljZUFjdGl2ZSAmJiBvd25zVm9pY2UpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwVHJhbnNjcmlwdFByZXBhcmF0aW9uUHJvZ3Jlc3MoY2hhdE1vZGVsOiBJT2JzZXJ2YWJsZTxJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkPik6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fY3VycmVudENoYXRSZXNvdXJjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fY3VycmVudFNlc3Npb25PYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3RhdHVzTWVzc2FnZSA9IHNlc3Npb25cblx0XHRcdFx0PyBnZXRTZXNzaW9uU3RhdHVzTWVzc2FnZShzZXNzaW9uLnN0YXR1cy5yZWFkKHJlYWRlciksIHNlc3Npb24uZGVzY3JpcHRpb24ucmVhZChyZWFkZXIpKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGFjdGl2aXR5ID0gdHlwZW9mIHN0YXR1c01lc3NhZ2UgPT09ICdzdHJpbmcnID8gc3RhdHVzTWVzc2FnZSA6IHN0YXR1c01lc3NhZ2UgPyByZW5kZXJBc1BsYWludGV4dChzdGF0dXNNZXNzYWdlKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG1vZGVsID0gY2hhdE1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGxldCBzaG93UHJvZ3Jlc3M6IGJvb2xlYW47XG5cdFx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRcdHNob3dQcm9ncmVzcyA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICghbW9kZWwpIHtcblx0XHRcdFx0c2hvd1Byb2dyZXNzID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRcdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSBtb2RlbC5sYXN0UmVxdWVzdE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVSZXF1ZXN0Q291bnQgPSByZXF1ZXN0cy5maWx0ZXIocmVxdWVzdCA9PiAhcmVxdWVzdC5pc0hpZGRlbkZyb21UcmFuc2NyaXB0KS5sZW5ndGg7XG5cdFx0XHRcdGNvbnN0IGhpZGRlblJlcXVlc3RJbmNvbXBsZXRlID0gbGFzdFJlcXVlc3Q/LmlzSGlkZGVuRnJvbVRyYW5zY3JpcHRcblx0XHRcdFx0XHQ/IGxhc3RSZXF1ZXN0LnJlc3BvbnNlPy5pc0luY29tcGxldGUucmVhZChyZWFkZXIpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdHNob3dQcm9ncmVzcyA9IHNob3VsZFNob3dUcmFuc2NyaXB0UHJlcGFyYXRpb25Qcm9ncmVzcyhyZXF1ZXN0cy5sZW5ndGgsIHZpc2libGVSZXF1ZXN0Q291bnQsIGhpZGRlblJlcXVlc3RJbmNvbXBsZXRlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByb2dyZXNzID0gZ2V0VHJhbnNjcmlwdFByb2dyZXNzKHNob3dQcm9ncmVzcywgYWN0aXZpdHkpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldFRyYW5zY3JpcHRQcm9ncmVzcyhwcm9ncmVzcywgcHJvZ3Jlc3MpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwSW5pdGlhbFRyYW5zY3JpcHRDb250ZXh0KGNoYXRNb2RlbDogSU9ic2VydmFibGU8SUNoYXRNb2RlbCB8IHVuZGVmaW5lZD4pOiB2b2lkIHtcblx0XHRsZXQgY3VycmVudEVudHJ5SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNoYXRNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRtb2RlbD8ubGFzdFJlcXVlc3RPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdHMgPSBtb2RlbD8uZ2V0UmVxdWVzdHMoKSA/PyBbXTtcblx0XHRcdGNvbnN0IGhhc1Zpc2libGVSZXF1ZXN0ID0gcmVxdWVzdHMuc29tZShyZXF1ZXN0ID0+ICFyZXF1ZXN0LmlzSGlkZGVuRnJvbVRyYW5zY3JpcHQpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBoYXNWaXNpYmxlUmVxdWVzdCA/IHVuZGVmaW5lZCA6IGZpbmRUcmFuc2NyaXB0Q29udGV4dEVudHJ5KHJlcXVlc3RzLmZpbHRlcihyZXF1ZXN0ID0+IHJlcXVlc3QuaXNIaWRkZW5Gcm9tVHJhbnNjcmlwdCkpO1xuXHRcdFx0aWYgKGVudHJ5Py5pZCA9PT0gY3VycmVudEVudHJ5SWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudEVudHJ5SWQgPSBlbnRyeT8uaWQ7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0VHJhbnNjcmlwdENvbnRleHQoZW50cnkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2F2ZUN1cnJlbnRWaWV3U3RhdGUoKTtcblx0XHR0aGlzLl9sb2FkQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZFN0eWxlcyhhY3RpdmU6IGJvb2xlYW4pIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGlzdEZvcmVncm91bmQ6IGFjdGl2ZSA/IGFjdGl2ZVNlc3Npb25WaWV3Rm9yZWdyb3VuZCA6IGluYWN0aXZlU2Vzc2lvblZpZXdGb3JlZ3JvdW5kLFxuXHRcdFx0bGlzdEJhY2tncm91bmQ6IGFjdGl2ZSA/IGFjdGl2ZVNlc3Npb25WaWV3QmFja2dyb3VuZCA6IGluYWN0aXZlU2Vzc2lvblZpZXdCYWNrZ3JvdW5kLFxuXHRcdFx0b3ZlcmxheUJhY2tncm91bmQ6IEVESVRPUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQsXG5cdFx0XHRpbnB1dEVkaXRvckJhY2tncm91bmQ6IGluYWN0aXZlU2Vzc2lvblZpZXdCYWNrZ3JvdW5kLFxuXHRcdFx0cmVzdWx0RWRpdG9yQmFja2dyb3VuZDogYWdlbnRzUGFuZWxCYWNrZ3JvdW5kLFxuXHRcdH07XG5cdH1cblxuXHQvKiogVGhlIHVuZGVybHlpbmcgY2hhdCB3aWRnZXQuICovXG5cdGdldCB3aWRnZXQoKTogQ2hhdFdpZGdldCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldDtcblx0fVxuXG5cdG92ZXJyaWRlIHNldENoYXQoY2hhdDogSUNoYXQsIGhpc3RvcnlLZXk/OiBzdHJpbmcsIHNlc3Npb24/OiBJU2Vzc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuY2hhdFBpbGxzRGVidWdTZXJ2aWNlLmNsZWFyKHRoaXMuX2NoYXRQaWxscyk7XG5cdFx0dGhpcy5fY3VycmVudFNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBjaGF0LnJlc291cmNlO1xuXHRcdGNvbnN0IHByZXZpb3VzQ2hhdFJlc291cmNlID0gdGhpcy5fY3VycmVudENoYXRSZXNvdXJjZTtcblx0XHRjb25zdCBjaGF0Q2hhbmdlZCA9ICFpc0VxdWFsKHByZXZpb3VzQ2hhdFJlc291cmNlLCByZXNvdXJjZSk7XG5cdFx0aWYgKGNoYXRDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9zYXZlQ3VycmVudFZpZXdTdGF0ZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9oaXN0b3J5S2V5ID0gaGlzdG9yeUtleTtcblx0XHR0aGlzLl9hcHBseUhpc3RvcnlLZXkoKTtcblxuXHRcdC8vIFJlZmxlY3QgdGhpcyBjaGF0J3MgbGFzdC10dXJuIGNoYW5nZXMsIHN0YXR1cywgYW5kIGJhY2tncm91bmQgYWN0aXZpdHkuXG5cdFx0dGhpcy5fY2hhdFBpbGxzLnNldENoYXQoY2hhdCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uU2lkZUNoYXRDb250cm9sbGVyLnNldENoYXQoY2hhdCk7XG5cdFx0dGhpcy5fYmFubmVycy5zZXREZWJ1Z0RhdGEodW5kZWZpbmVkKTtcblxuXHRcdC8vIFJlZmxlY3QgcmVhZC1vbmx5IChub24taW50ZXJhY3RpdmUpIGNoYXRzOiBoaWRlIHRoZSBjb21wb3NlciBhbmQgZ2F0ZVxuXHRcdC8vIG11dGF0aW5nIGFjdGlvbnMgKFN0YXJ0IE92ZXIgLyBSZXN0b3JlIENoZWNrcG9pbnQpIHZpYSB0aGUgd2lkZ2V0LiBBbnlcblx0XHQvLyBub24tRnVsbCBpbnRlcmFjdGl2aXR5IGlzIHRyZWF0ZWQgYXMgcmVhZC1vbmx5IGhlcmUgKGhpZGRlbiBjaGF0cyBhcmVcblx0XHQvLyBmaWx0ZXJlZCBvdXQgb2YgdGhlIHZpc2libGUgbW9kZWwgYmVmb3JlIHRoZXkgcmVhY2ggYSBDaGF0VmlldykuXG5cdFx0dGhpcy5faW50ZXJhY3RpdmVEaXNwb3NhYmxlLnZhbHVlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldFJlYWRPbmx5KGNoYXQuaW50ZXJhY3Rpdml0eS5yZWFkKHJlYWRlcikgIT09IENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2tpcCBsb2FkaW5nIGlmIHdlJ3JlIGFscmVhZHkgc2hvd2luZyB0aGlzIGNoYXRcblx0XHRpZiAoIWNoYXRDaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudENoYXRSZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdHRoaXMuX2N1cnJlbnRDaGF0UmVzb3VyY2VPYnMuc2V0KHJlc291cmNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQ2FuY2VsIGFueSBpbi1mbGlnaHQgbG9hZCBmb3IgdGhlIHByZXZpb3VzIGNoYXQgYW5kIHN0YXJ0IGEgZnJlc2ggb25lLlxuXHRcdHRoaXMuX2xvYWRDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdGlmIChwcmV2aW91c0NoYXRSZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5fY2xlYXJDdXJyZW50Q2hhdCgpO1xuXHRcdH1cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9sb2FkQ3RzLnZhbHVlID0gY3RzO1xuXHRcdGNvbnN0IHRva2VuID0gY3RzLnRva2VuO1xuXHRcdHRoaXMuX3dpZGdldC5zZXRMb2FkaW5nKHRydWUpO1xuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgaW5wdXQgZHJhZnQgYmVmb3JlIHRoZSBsb2FkIHdpbmRvdyBvcGVucyBzbyB0ZXh0IHR5cGVkXG5cdFx0Ly8gZHVyaW5nIGxvYWRpbmcgaXMgcHJlc2VydmVkIHdoZW4gdGhlIG1vZGVsIGJpbmRzLiBTZWUgIzMyNTMyMy5cblx0XHRjb25zdCBpbnB1dEJlZm9yZUxvYWQgPSB0aGlzLl93aWRnZXQuZ2V0SW5wdXQoKTtcblxuXHRcdGNvbnN0IGxvYWRQcm9taXNlID0gdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgdG9rZW4sICdDaGF0VmlldycpLnRoZW4ocmVmID0+IHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCAhcmVmIHx8ICFpc0VxdWFsKHRoaXMuX2N1cnJlbnRDaGF0UmVzb3VyY2UsIHJlc291cmNlKSkge1xuXHRcdFx0XHRyZWY/LmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKGlzRXF1YWwodGhpcy5fY3VycmVudENoYXRSZXNvdXJjZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldExvYWRpbmcoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX21vZGVsUmVmLnZhbHVlID0gcmVmO1xuXHRcdFx0dGhpcy5fdXBkYXRlV2lkZ2V0TG9ja1N0YXRlKGdldENoYXRTZXNzaW9uVHlwZShyZWYub2JqZWN0LnNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0c2V0TW9kZWxQcmVzZXJ2aW5nSW5wdXRUeXBlZFdoaWxlTG9hZGluZyh0aGlzLl93aWRnZXQsIGlucHV0QmVmb3JlTG9hZCwgKCkgPT4gdGhpcy5fd2lkZ2V0LnNldE1vZGVsKHJlZi5vYmplY3QpKTtcblx0XHRcdGNvbnN0IHdpZGdldFZpZXdTdGF0ZSA9IHRoaXMudmlld1N0YXRlU2VydmljZS5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKHdpZGdldFZpZXdTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQucmVzdG9yZVZpZXdTdGF0ZSh3aWRnZXRWaWV3U3RhdGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldExvYWRpbmcoZmFsc2UpO1xuXHRcdFx0Ly8gRXhwb3NlIHRoZSBib3VuZCBjaGF0IHJlc291cmNlIG9uIHRoZSBET00gc28gdGVzdCBhdXRvbWF0aW9uXG5cdFx0XHQvLyBjYW4gc3luY2hyb25pemUgd2l0aCB0aGUgcG9zdC1yZWJpbmQgc3RhdGUgd2l0aG91dCBwb2xsaW5nIHRpbWVvdXRzLlxuXHRcdFx0Ly8gU2V0IEFGVEVSIGBzZXRNb2RlbGAgc28gb2JzZXJ2ZXJzIHNlZSB0aGUgYXR0cmlidXRlIG9ubHkgb25jZSB0aGVcblx0XHRcdC8vIGlubmVyIHdpZGdldCBpcyBmdWxseSBhdHRhY2hlZCB0byB0aGUgbG9hZGVkIG1vZGVsLlxuXHRcdFx0dGhpcy5lbGVtZW50LmRhdGFzZXQuYm91bmRDaGF0UmVzb3VyY2UgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHRpZiAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0NoYXRWaWV3XSBGYWlsZWQgdG8gbG9hZCBjaGF0IG1vZGVsIGZvciBjaGF0JywgZXJyKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0VxdWFsKHRoaXMuX2N1cnJlbnRDaGF0UmVzb3VyY2UsIHJlc291cmNlKSkgeyAvLyBtaWdodCBoYXZlIGNoYW5nZWQgd2hpbGUgd2Ugd2VyZSB3YWl0aW5nLCBvbmx5IHJlc2V0IGlmIGl0IGlzIHN0aWxsIHRoZSBzYW1lXG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRDaGF0UmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRDaGF0UmVzb3VyY2VPYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldExvYWRpbmcoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gU3VyZmFjZSBwcm9ncmVzcyBvbiB0aGlzIGxlYWYncyBvd24gYmFyIHdoaWxlIHRoZSBjaGF0IG1vZGVsIGxvYWRzLFxuXHRcdC8vIG1hdGNoaW5nIGhvdyBlYWNoIGVkaXRvciBncm91cCBzaG93cyBwcm9ncmVzcyBpbmRlcGVuZGVudGx5LiBUaGUgc2hvcnRcblx0XHQvLyBkZWxheSBhdm9pZHMgZmxhc2hpbmcgdGhlIGJhciBmb3IgZmFzdCBjYWNoZWQgbG9hZHMuXG5cdFx0dGhpcy5zaG93UHJvZ3Jlc3NXaGlsZShsb2FkUHJvbWlzZSwgODAwKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVDdXJyZW50Vmlld1N0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0dGhpcy52aWV3U3RhdGVTZXJ2aWNlLnNldChyZXNvdXJjZSwgdGhpcy5fd2lkZ2V0LmdldFZpZXdTdGF0ZSgpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckN1cnJlbnRDaGF0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5jbGVhcigpLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tDaGF0Vmlld10gRmFpbGVkIHRvIGNsZWFyIGNoYXQgd2lkZ2V0JywgZXJyKSk7XG5cdFx0dGhpcy5fd2lkZ2V0LnNldE1vZGVsKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbW9kZWxSZWYuY2xlYXIoKTtcblx0XHQvLyBDbGVhciB0aGUgYm91bmQtcmVzb3VyY2UgYXR0cmlidXRlIHdoaWxlIHRoZSByZWJpbmQgaXMgaW4gZmxpZ2h0IHNvXG5cdFx0Ly8gdGVzdCBhdXRvbWF0aW9uIGNhbiB3YWl0IGZvciB0aGUgbmV4dCBgc2V0Q2hhdGAgY3ljbGUgdG8gZmluaXNoXG5cdFx0Ly8gYmVmb3JlIGFjdGluZyBvbiB0aGUgdmlldy5cblx0XHRkZWxldGUgdGhpcy5lbGVtZW50LmRhdGFzZXQuYm91bmRDaGF0UmVzb3VyY2U7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUhpc3RvcnlLZXkoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NvcGVkSGlzdG9yeSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQUdFTlRfU0VTU0lPTlNfU0NPUEVEX0lOUFVUX0hJU1RPUllfU0VUVElORykgIT09IGZhbHNlO1xuXHRcdHRoaXMuX3dpZGdldC5pbnB1dFBhcnQuc2V0SGlzdG9yeUtleShzY29wZWRIaXN0b3J5ID8gdGhpcy5faGlzdG9yeUtleSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVXaWRnZXRMb2NrU3RhdGUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChzZXNzaW9uVHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdHRoaXMuX3dpZGdldC51bmxvY2tGcm9tQ29kaW5nQWdlbnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oc2Vzc2lvblR5cGUpO1xuXHRcdGlmIChjb250cmlidXRpb24pIHtcblx0XHRcdHRoaXMuX3dpZGdldC5sb2NrVG9Db2RpbmdBZ2VudChjb250cmlidXRpb24ubmFtZSwgY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lLCBzZXNzaW9uVHlwZSwgY29udHJpYnV0aW9uLmFnZW50SG9zdFByb3ZpZGVySWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93aWRnZXQudW5sb2NrRnJvbUNvZGluZ0FnZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHsgdHlwZTogQ2hhdFZpZXcuVFlQRSB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGRvTGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBfdG9wOiBudW1iZXIsIF9sZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVCYW5uZXJzTW91bnRlZCgpO1xuXHRcdHRoaXMuX3dpZGdldC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHQvKipcblx0ICogTW91bnRzIHRoZSBzdGF0dXMgcGlsbHMgYW5kIHNlc3Npb24gYmFubmVycyBhYm92ZSB0aGUgY2hhdCBpbnB1dC5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZUJhbm5lcnNNb3VudGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0UGFydEVsZW1lbnQgPSB0aGlzLl93aWRnZXQuaW5wdXRQYXJ0LmVsZW1lbnQ7XG5cdFx0Y29uc3QgcGVyc2lzdGVudENvbnRlbnRDb250YWluZXIgPSB0aGlzLl93aWRnZXQuaW5wdXRQYXJ0LnBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyRWxlbWVudDtcblx0XHRjb25zdCBwaWxsc05vZGUgPSB0aGlzLl9jaGF0UGlsbHMuZWxlbWVudDtcblx0XHRjb25zdCBiYW5uZXJzTm9kZSA9IHRoaXMuX2Jhbm5lcnMuZG9tTm9kZTtcblx0XHRpZiAocGVyc2lzdGVudENvbnRlbnRDb250YWluZXIuZmlyc3RDaGlsZCAhPT0gcGlsbHNOb2RlKSB7XG5cdFx0XHRwZXJzaXN0ZW50Q29udGVudENvbnRhaW5lci5pbnNlcnRCZWZvcmUocGlsbHNOb2RlLCBwZXJzaXN0ZW50Q29udGVudENvbnRhaW5lci5maXJzdENoaWxkKTtcblx0XHR9XG5cdFx0aWYgKHBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyLm5leHRTaWJsaW5nICE9PSBiYW5uZXJzTm9kZSkge1xuXHRcdFx0aW5wdXRQYXJ0RWxlbWVudC5pbnNlcnRCZWZvcmUoYmFubmVyc05vZGUsIHBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyLm5leHRTaWJsaW5nKTtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gVm9pY2Ugb3ZlcmxheVxuXG5cdC8qKlxuXHQgKiBTZXRzIHVwIHRoaXMgdmlldydzIHRyYW5zY3JpcHQgb3ZlcmxheSBhbmQgaW5wdXQgZ2xvdywgbWlycm9yaW5nIGBDaGF0Vmlld1BhbmVgLlxuXHQgKiBTaG93cyBvbmx5IHdoaWxlIHZvaWNlIGlzIGNvbm5lY3RlZCBhbmQgdGFyZ2V0aW5nIHRoaXMgYWN0aXZlIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zZXR1cFZvaWNlT3ZlcmxheSgpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dENvbnRhaW5lckVsID0gdGhpcy5fd2lkZ2V0LmlucHV0UGFydC5pbnB1dENvbnRhaW5lckVsZW1lbnQ7XG5cdFx0aWYgKCFpbnB1dENvbnRhaW5lckVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlzVm9pY2VTdXJmYWNlQWN0aXZlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT5cblx0XHRcdHRoaXMuX2lzQWN0aXZlT2JzLnJlYWQocmVhZGVyKSAmJiAhdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm9tbmlJbnB1dE9wZW4ucmVhZChyZWFkZXIpXG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3RlcihzZXR1cFZvaWNlSW5wdXREZWNvcmF0aW9ucyh7XG5cdFx0XHR2b2ljZVNlc3Npb25Db250cm9sbGVyOiB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsXG5cdFx0XHR0dHNQbGF5YmFja1NlcnZpY2U6IHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLFxuXHRcdFx0bWljQ2FwdHVyZVNlcnZpY2U6IHRoaXMubWljQ2FwdHVyZVNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdFx0dGhlbWVTZXJ2aWNlOiB0aGlzLnRoZW1lU2VydmljZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdH0sIHtcblx0XHRcdGlucHV0Q29udGFpbmVyOiBpbnB1dENvbnRhaW5lckVsLFxuXHRcdFx0aXNBY3RpdmU6IGlzVm9pY2VTdXJmYWNlQWN0aXZlLFxuXHRcdFx0Z2V0Q3VycmVudFJlc291cmNlOiAoKSA9PiB0aGlzLl9jdXJyZW50Q2hhdFJlc291cmNlLFxuXHRcdFx0Y3VycmVudFZvaWNlSW5wdXRSZXNvdXJjZTogdGhpcy5uZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlLmN1cnJlbnRWb2ljZUlucHV0UmVzb3VyY2UsXG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGF0dGFjaCh1cmlzOiBVUklbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIHVyaXMpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkRmlsZSh1cmkpLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tDaGF0Vmlld10gRmFpbGVkIHRvIGF0dGFjaCBmaWxlIGFzIGNvbnRleHQnLCBlcnIpKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzZXRBY3RpdmUoYWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzQWN0aXZlID09PSBhY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNBY3RpdmUgPSBhY3RpdmU7XG5cdFx0dGhpcy5faXNBY3RpdmVPYnMuc2V0KGFjdGl2ZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9iYW5uZXJzLnNldEFjdGl2ZShhY3RpdmUpO1xuXHRcdHRoaXMuX3dpZGdldC5zZXRTdHlsZXModGhpcy5fYnVpbGRTdHlsZXMoYWN0aXZlKSk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNWaXNpYmxlID09PSB2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy5fd2lkZ2V0LnNldFZpc2libGUodmlzaWJsZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFNob3dUcmFuc2NyaXB0UHJlcGFyYXRpb25Qcm9ncmVzcyhyZXF1ZXN0Q291bnQ6IG51bWJlciwgdmlzaWJsZVJlcXVlc3RDb3VudDogbnVtYmVyLCBoaWRkZW5SZXF1ZXN0SW5jb21wbGV0ZTogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVxdWVzdENvdW50ID09PSAwIHx8ICh2aXNpYmxlUmVxdWVzdENvdW50ID09PSAwICYmIGhpZGRlblJlcXVlc3RJbmNvbXBsZXRlICE9PSBmYWxzZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmFuc2NyaXB0UHJvZ3Jlc3Moc2hvd1Byb2dyZXNzOiBib29sZWFuLCBhY3Rpdml0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzaG93UHJvZ3Jlc3MpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBhY3Rpdml0eT8udHJpbSgpIHx8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRUcmFuc2NyaXB0Q29udGV4dEVudHJ5KHJlcXVlc3RzOiByZWFkb25seSB7IHJlYWRvbmx5IHZhcmlhYmxlRGF0YTogeyByZWFkb25seSB2YXJpYWJsZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB9OyByZWFkb25seSBhdHRhY2hlZENvbnRleHQ/OiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfVtdKTogSUNoYXRSZXF1ZXN0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHJlcXVlc3RzKSB7XG5cdFx0Y29uc3QgZW50cnkgPSBbLi4ucmVxdWVzdC52YXJpYWJsZURhdGEudmFyaWFibGVzLCAuLi4ocmVxdWVzdC5hdHRhY2hlZENvbnRleHQgPz8gW10pXS5maW5kKGlzQ2hhdFRyYW5zY3JpcHRDb250ZXh0VmFyaWFibGVFbnRyeSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gZW50cnk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogRGVmYXVsdCB7QGxpbmsgSUNoYXRWaWV3RmFjdG9yeX0gaW1wbGVtZW50YXRpb24uIExpdmVzIGluIHRoZSBjb250cmliXG4gKiBsYXllciB3aGVyZSB0aGUgY29uY3JldGUgdmlld3MgYXJlIGRlZmluZWQgYW5kIGlzIHJlZ2lzdGVyZWQgYXMgYW4gZWFnZXJcbiAqIHNpbmdsZXRvbiB2aWEgdGhlIGVudHJ5IHBvaW50LlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXdGYWN0b3J5IGltcGxlbWVudHMgSUNoYXRWaWV3RmFjdG9yeSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7IH1cblxuXHRjcmVhdGVOZXdDaGF0Vmlldyhpc05ld0NoYXRJblNlc3Npb246IGJvb2xlYW4sIG9wdGlvbnM6IElDaGF0Vmlld09wdGlvbnMpOiBBYnN0cmFjdENoYXRWaWV3IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOZXdDaGF0VmlldywgaXNOZXdDaGF0SW5TZXNzaW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdGNyZWF0ZUNoYXRWaWV3KCk6IEFic3RyYWN0Q2hhdFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxTQUFzQixxQkFBcUIsdUJBQXVCO0FBQ3BGLFNBQVMsZUFBZTtBQUV4QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnREFBZ0Q7QUFDekQsU0FBOEIsb0JBQW9CO0FBQ2xELFNBQVMsNENBQW1IO0FBRTVILFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQiw0QkFBNEI7QUFDM0QsU0FBUyx3QkFBd0Q7QUFDakUsU0FBUyxtQkFBbUIseUJBQWdDLDZCQUFzRDtBQUVsSCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG1EQUFtRDtBQUM1RCxTQUFTLDZCQUE2Qiw2QkFBNkIsdUJBQXVCLCtCQUErQixxQ0FBcUM7QUFDOUosU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxxQ0FBcUM7QUFFdkMsU0FBUyx5QkFBeUIsZUFBbUQ7QUFD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
