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
import "./media/chatWidget.css";
import * as dom from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { Action } from "../../../../base/common/actions.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { constObservable, derived, derivedObservableWithCache, autorun, observableFromEvent, observableSignalFromEvent } from "../../../../base/common/observable.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { localize } from "../../../../nls.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { SESSION_WORKSPACE_GROUP_GITHUB, SessionTypeAuthRequirement } from "../../../services/sessions/common/session.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { isAllowSignedOutWhenUsableEnabled, shouldShowGitHubWorkspaceGroupSignIn } from "../../../browser/sessionsAuthGate.js";
import { AGENTIC_SIGN_IN_COMMAND_ID } from "../../../common/sessionCommands.js";
import { IAquariumService } from "../../aquarium/browser/aquariumOverlay.js";
import { WorkspacePicker } from "./sessionWorkspacePicker.js";
import { WebWorkspacePicker } from "./webWorkspacePicker.js";
import { NewChatInputWidget } from "./newChatInput.js";
import { NoAgentHostEmptyState } from "./noAgentHostEmptyState.js";
import { IAgentHostFilterService } from "../../../services/agentHostFilter/common/agentHostFilter.js";
import { SessionWorkspacePickerVisibleContext } from "../../../common/contextkeys.js";
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackState, IAgentFeedbackService } from "../../agentFeedback/browser/agentFeedbackService.js";
import { buildNewSessionPrompt } from "../../agentFeedback/browser/agentFeedbackAttachmentEntry.js";
import { SessionInputBannerWidget } from "../../sessionInputBanners/browser/sessionInputBannerWidget.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ChatInputTipPresenter } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputTipPresenter.js";
import { chatInputStackClass, ChatInputStackSlot, setChatInputStackSlot } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js";
import { IChatPetService } from "../../../../workbench/contrib/chat/browser/chatPetService.js";
import { IChatTipService } from "../../../../workbench/contrib/chat/browser/chatTipService.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatModeKind } from "../../../../workbench/contrib/chat/common/constants.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { TOTAL_SESSIONS_KEY } from "../../sessions/browser/sessionsLifecycleTracker.js";
import { INewSessionComposerService, NewSessionWorkspacePreselectionSource } from "./newSessionComposerService.js";
const MIN_SESSIONS_FOR_FIRST_RUN_NOTICES = 2;
let NewChatWidget = class extends Disposable {
  constructor(options, instantiationService, contextKeyService, contextMenuService, configurationService, logService, sessionsManagementService, sessionsService, aquariumService, agentHostFilterService, uriIdentityService, agentFeedbackService, chatPetService, chatTipService, openerService, defaultAccountService, storageService, newSessionComposerService) {
    super();
    this.options = options;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsService = sessionsService;
    this.aquariumService = aquariumService;
    this.agentHostFilterService = agentHostFilterService;
    this.uriIdentityService = uriIdentityService;
    this.agentFeedbackService = agentFeedbackService;
    this.chatPetService = chatPetService;
    this.chatTipService = chatTipService;
    this.openerService = openerService;
    this.defaultAccountService = defaultAccountService;
    this.storageService = storageService;
    this._chatTipPresenter = this._register(new MutableDisposable());
    this._isChatTipSessionInitialized = false;
    /** Recreates the draft once a better/late-registering provider can serve the folder (see {@link _createNewSession}). */
    this._pendingPreferredUpgrade = new MutableDisposable();
    this._newSessionCreation = new MutableDisposable();
    /** In-flight background sends awaiting confirmation before their comments are cleared. */
    this._pendingBackgroundSends = this._register(new DisposableMap());
    this._workspacePickerVisibleKey = SessionWorkspacePickerVisibleContext.bindTo(contextKeyService);
    this._register(toDisposable(() => this._workspacePickerVisibleKey.reset()));
    this._renderHarnessPickerInControls = this.options.renderSessionTypePickerInControls.get();
    this._register(this._pendingPreferredUpgrade);
    this._register(this._newSessionCreation);
    this._session = derivedObservableWithCache(this, (reader, prev) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      if (activeSession && activeSession.isCreated.read(reader)) {
        return prev;
      }
      return activeSession;
    });
    this._isQuickChatComposer = derived(this, (reader) => {
      const session = this._session.read(reader);
      return session?.isQuickChat?.read(reader) ?? false;
    });
    const PickerCtor = isWeb ? WebWorkspacePicker : WorkspacePicker;
    this._workspacePicker = this._register(this.instantiationService.createInstance(PickerCtor, {
      canRestoreWorkspace: () => !this._isQuickChatComposer.get(),
      getWorkspaceGroupAction: (group) => {
        if (group === SESSION_WORKSPACE_GROUP_GITHUB && shouldShowGitHubWorkspaceGroupSignIn(
          this.defaultAccountService.currentDefaultAccount !== null,
          isAllowSignedOutWhenUsableEnabled(this.configurationService)
        )) {
          return {
            label: localize("workspacePicker.signInGitHub", "Sign in to GitHub"),
            icon: Codicon.signIn,
            commandId: AGENTIC_SIGN_IN_COMMAND_ID,
            hideWorkspaceItems: true
          };
        }
        return void 0;
      }
    }));
    const feedbackChanged = observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback);
    this._feedbackItems = derived(this, (reader) => {
      feedbackChanged.read(reader);
      return this.agentFeedbackService.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).filter((item) => item.state === AgentFeedbackState.Accepted);
    });
    const canSendRequest = derived((reader) => {
      const session = this._session.read(reader);
      if (!session) {
        return false;
      }
      if (session.loading.read(reader)) {
        return false;
      }
      return true;
    });
    const loading = derived((reader) => {
      const session = this._session.read(reader);
      return session?.loading.read(reader) ?? false;
    });
    const hasFeedback = derived(this, (reader) => this._feedbackItems.read(reader).length > 0);
    const canSubmitWithoutSession = derived(this, (reader) => !this._session.read(reader) && hasFeedback.read(reader));
    const deferredNotificationsEnabled = observableFromEvent(
      this,
      this.storageService.onDidChangeValue(StorageScope.APPLICATION, TOTAL_SESSIONS_KEY, this._store),
      () => this._hasEnoughSessionsForFirstRunNotices()
    );
    const newChatInput = this.instantiationService.createInstance(NewChatInputWidget, {
      session: this._session,
      getContextFolderUri: () => this._getContextFolderUri(),
      getWorkspacePreselectionSource: () => this._isQuickChatComposer.get() ? NewSessionWorkspacePreselectionSource.None : this._workspacePicker.preselectionSource,
      sendRequest: async ({ query, attachments, background }) => this._send(query, attachments, background),
      canSendRequest,
      canSubmitWithoutSession,
      hasAdditionalSendContent: hasFeedback,
      loading,
      historyKey: constObservable(void 0),
      // no persisted history for the new-session view
      renderSessionTypePickerInControls: this._renderHarnessPickerInControls,
      supportsBackground: true,
      deferredNotificationsEnabled
    });
    this._register(toDisposable(() => newChatInput.saveState()));
    this._newChatInput = this._register(newChatInput);
    this._register(newSessionComposerService.registerComposer(this._newChatInput));
    const chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
    chatModeKindKey.set(ChatModeKind.Agent);
    this._register(toDisposable(() => chatModeKindKey.reset()));
    this._register(this.openerService.registerOpener({
      open: async (resource) => {
        if (!this._chatTipPresenter.value?.current) {
          return false;
        }
        const link = typeof resource === "string" ? resource : resource.toString();
        if (link === "command:workbench.action.chat.openModelPicker") {
          this._newChatInput.openModelPicker();
          return true;
        }
        if (link === "command:workbench.action.chat.openPlan") {
          return true;
        }
        return false;
      }
    }));
    this._register(this._workspacePicker.onDidSelectWorkspace(async (folderUri) => {
      await this._onWorkspaceSelected(folderUri);
      this._newChatInput.focus();
    }));
    this._register(this._newChatInput.sessionTypePicker.onDidSelectSessionType(async (pick) => {
      if (this._isQuickChatComposer.get()) {
        this.sessionsService.openQuickChat(pick ? { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId } : void 0);
        this._newChatInput.focus();
        return;
      }
      await this._onWorkspaceSelected(this._workspacePicker.selectedFolderUri);
      this._newChatInput.focus();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("chat.tips.enabled")) {
        return;
      }
      if (this.configurationService.getValue("chat.tips.enabled")) {
        this._renderChatTip();
      } else {
        this._clearChatTip();
      }
    }));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, TOTAL_SESSIONS_KEY, this._store)(() => this._renderChatTip()));
    const foregroundSessionCountContextKeys = /* @__PURE__ */ new Set([ChatContextKeys.foregroundSessionCount.key]);
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(foregroundSessionCountContextKeys)) {
        this._renderChatTip();
      }
    }));
    let previousModelId;
    this._register(autorun((reader) => {
      const modelId = this._newChatInput.selectedModelState.read(reader).currentModel?.identifier;
      if (previousModelId !== void 0 && previousModelId !== modelId) {
        this._renderChatTip();
      }
      previousModelId = modelId;
    }));
    let previousFolderUri = this._session.get()?.workspace.get()?.folders[0]?.root;
    this._register(autorun((reader) => {
      const session = this._session.read(reader);
      const folderUri = session?.workspace.read(reader)?.folders[0]?.root;
      this._handlePromptOptionsWorkspaceChange(previousFolderUri, folderUri);
      previousFolderUri = folderUri;
      if (folderUri && !this.uriIdentityService.extUri.isEqual(folderUri, this._workspacePicker.selectedFolderUri)) {
        this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false });
      }
    }));
  }
  _handlePromptOptionsWorkspaceChange(previousFolderUri, folderUri) {
    const workspaceChanged = previousFolderUri ? !folderUri || !this.uriIdentityService.extUri.isEqual(previousFolderUri, folderUri) : !!folderUri;
    if (!workspaceChanged) {
      return;
    }
    if (folderUri) {
      void this._refreshPromptOptions();
    } else {
      this._newChatInput.clearPromptOptions();
    }
  }
  // --- Rendering ---
  render(parent) {
    const element = dom.append(parent, dom.$(".sessions-chat-widget"));
    const chatWidgetContainer = dom.append(element, dom.$(".new-chat-widget-container"));
    const chatWidgetContent = dom.append(chatWidgetContainer, dom.$(`.new-chat-widget-content.${chatInputStackClass}`));
    this._aquariumToggle = this._register(this.aquariumService.mountToggle(element));
    const aquariumAction = this._register(new Action(
      "sessions.aquarium.showAction",
      localize("aquariumAction", "Aquarium"),
      void 0,
      true,
      () => this.aquariumService.toggleActionVisibility()
    ));
    const petAction = this._register(new Action(
      "sessions.chatPet.toggle",
      localize("petAction", "Pet (/vscode-pet)"),
      void 0,
      true,
      () => this.chatPetService.toggle()
    ));
    this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, (e) => {
      const target = e.target;
      if (target && chatWidgetContent.contains(target)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      aquariumAction.checked = this.aquariumService.actionVisible.get();
      petAction.checked = this.chatPetService.enabled.get();
      const anchor = new StandardMouseEvent(dom.getWindow(element), e);
      this.contextMenuService.showContextMenu({
        getAnchor: () => anchor,
        getActions: () => [aquariumAction, petAction],
        getCheckedActionsRepresentation: () => "checkbox"
      });
    }));
    const workspacePickerContainer = dom.append(chatWidgetContent, dom.$(".new-session-workspace-picker-container"));
    this._register(isWeb ? this._renderEmptyStateGate(workspacePickerContainer, chatWidgetContent) : this._renderWorkspacePicker(workspacePickerContainer));
    if (!isWeb && !this._renderHarnessPickerInControls) {
      const quickChatHeaderRow = dom.append(chatWidgetContent, dom.$(".new-session-quick-chat-header.session-workspace-picker"));
      const quickChatHeaderLabel = dom.append(quickChatHeaderRow, dom.$(".session-workspace-picker-label"));
      quickChatHeaderLabel.textContent = localize("newChatHeader", "New Chat");
      const quickChatWithLabel = dom.append(quickChatHeaderRow, dom.$(".session-workspace-picker-label.session-workspace-picker-with-label"));
      quickChatWithLabel.textContent = localize("newSessionWith", "with");
      this._quickChatHeaderPickerHost = dom.append(quickChatHeaderRow, dom.$(".new-chat-quick-chat-header-picker-host"));
    }
    this._renderFeedbackBanner(chatWidgetContent);
    this._newChatInput.render(chatWidgetContent, parent);
    const chatTipContainer = this._newChatInput.gettingStartedTipContainerElement;
    this._chatTipPresenter.value = chatTipContainer && this.instantiationService.createInstance(
      ChatInputTipPresenter,
      {
        container: chatTipContainer,
        // Reset tip rotation the first time this composer becomes the only
        // foreground surface, so a returning user gets a fresh tip.
        onBeforeUpdate: () => {
          if (this.contextKeyService.getContextKeyValue(ChatContextKeys.foregroundSessionCount.key) !== 0) {
            this._isChatTipSessionInitialized = false;
          } else if (!this._isChatTipSessionInitialized) {
            this._isChatTipSessionInitialized = true;
            this.chatTipService.resetSession();
          }
        },
        // No tip in the no-agent-host empty state: there is no usable composer.
        // Tips also stay away until the user has actually started a couple of
        // sessions, so a first-run composer is not busy.
        isEligible: () => !chatWidgetContent.classList.contains("no-agent-host") && this._hasEnoughSessionsForFirstRunNotices() && this.contextKeyService.getContextKeyValue(ChatContextKeys.foregroundSessionCount.key) === 0,
        focusInput: () => this.focusInput()
      },
      this._newChatInput.noticeHost
    );
    this._register(autorun((reader) => {
      const isQuickChat = this._isQuickChatComposer.read(reader);
      chatWidgetContent.classList.toggle("quick-chat", isQuickChat);
      if (!isWeb) {
        this._workspacePickerVisibleKey.set(!isQuickChat);
      }
    }));
    if (!isWeb && !this._renderHarnessPickerInControls) {
      this._register(autorun((reader) => {
        const isQuickChat = this._isQuickChatComposer.read(reader);
        const target = isQuickChat ? this._quickChatHeaderPickerHost : this._workspacePickerRow;
        if (target) {
          this._newChatInput.sessionTypePicker.render(target, { className: "sessions-chat-session-type-picker" });
        }
      }));
    }
    this._seedWorkspaceDraft();
    if (!isWeb) {
      let wasQuickChat = this._isQuickChatComposer.get();
      this._register(autorun((reader) => {
        const isQuickChat = this._isQuickChatComposer.read(reader);
        if (wasQuickChat && !isQuickChat && !this._session.read(reader)) {
          if (!this._workspacePicker.refreshAutomaticSelection()) {
            this._seedWorkspaceDraft();
          }
        }
        wasQuickChat = isQuickChat;
      }));
    }
    chatWidgetContainer.classList.add("revealed");
  }
  _renderChatTip() {
    this._chatTipPresenter.value?.update();
  }
  _clearChatTip() {
    this._chatTipPresenter.value?.clear();
  }
  _hasEnoughSessionsForFirstRunNotices() {
    return this.storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0) >= MIN_SESSIONS_FOR_FIRST_RUN_NOTICES;
  }
  /**
   * Seed the new-session draft from the workspace picker's restored folder,
   * unless an active session already exists (then just sync the picker to it).
   */
  _seedWorkspaceDraft() {
    const restoredFolderUri = this._workspacePicker.selectedFolderUri;
    if (!this._syncWorkspacePickerFromActiveSession() && restoredFolderUri) {
      void this._createNewSession(restoredFolderUri);
    }
  }
  /**
   * If a new-session draft was restored by {@link openNewSession}, sync
   * the workspace picker to match the session's workspace. The picker may
   * have restored a workspace from a different provider (e.g. remote vs
   * local), so overwrite it with the session's actual workspace without
   * firing the event (which would trigger {@link _onWorkspaceSelected} and
   * create a new session).
   *
   * @returns `true` if an active session was found and the picker was synced.
   */
  _syncWorkspacePickerFromActiveSession() {
    const activeSession = this._session.get();
    if (!activeSession) {
      return false;
    }
    const sessionWorkspace = activeSession.workspace.get();
    const folderUri = sessionWorkspace?.folders[0]?.root;
    if (folderUri) {
      this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false });
      this._replaceDraftOnUnservableHarness(folderUri, activeSession);
    }
    return true;
  }
  /**
   * Replaces a restored draft whose harness the folder can no longer serve.
   * A draft outlives navigation, so it can name a session type that has since
   * stopped being advertised. Keeping it would leave the composer showing, and
   * sending to, an agent the harness picker doesn't list. An empty type list
   * means the folder's providers haven't reported yet (a late-connecting agent
   * host), so the draft is left alone.
   */
  _replaceDraftOnUnservableHarness(folderUri, draft) {
    if (draft.isCreated.get()) {
      return;
    }
    const pick = { providerId: draft.providerId, sessionTypeId: draft.sessionType };
    if (this.sessionsManagementService.getSessionTypesForFolder(folderUri).length === 0 || this._isPreferredServable(folderUri, pick)) {
      return;
    }
    void this._createNewSession(folderUri);
  }
  _isPreferredServable(folderUri, pick) {
    return this.sessionsManagementService.getSessionTypesForFolder(folderUri).some((t) => (pick.providerId === void 0 || t.providerId === pick.providerId) && t.sessionType.id === pick.sessionTypeId);
  }
  async _createNewSession(folderUri) {
    this._pendingPreferredUpgrade.clear();
    const creationCts = new CancellationTokenSource();
    const creationLifecycle = toDisposable(() => creationCts.dispose(true));
    this._newSessionCreation.value = creationLifecycle;
    const userPick = this._newChatInput.sessionTypePicker.getUserPickedSessionType();
    const pendingChange = new DisposableStore();
    let changedWhilePending = false;
    pendingChange.add(this.sessionsManagementService.onDidChangeSessionTypes(() => changedWhilePending = true));
    let result;
    try {
      result = await this._createSessionNow(folderUri, userPick, creationCts.token);
    } finally {
      pendingChange.dispose();
    }
    const isCurrentCreation = this._newSessionCreation.value === creationLifecycle;
    if (isCurrentCreation) {
      this._newSessionCreation.clear();
    } else {
      return result;
    }
    if (result.trustDeclined) {
      this._pendingPreferredUpgrade.clear();
      return result;
    }
    if (!result.session || !userPick || !this._isPreferredServable(folderUri, userPick)) {
      this._scheduleRecreateOnProviderChange(folderUri, userPick, result.session, changedWhilePending);
    }
    return result;
  }
  async _createSessionNow(folderUri, userPick, token) {
    const preferredPick = userPick && this._isPreferredServable(folderUri, userPick) ? userPick : this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
    const effectivePick = this._preferUsableSessionTypeWhenSignedOut(folderUri, preferredPick);
    const fallbackProviderId = this._workspacePicker.selectedResolved?.providerId;
    try {
      return await this.sessionsService.openNewSession({
        folderUri,
        ...effectivePick ? { providerId: effectivePick.providerId, sessionTypeId: effectivePick.sessionTypeId } : fallbackProviderId ? { providerId: fallbackProviderId } : void 0
      }, token);
    } catch (e) {
      this.logService.error("Failed to create new session:", e);
      return { session: void 0, trustDeclined: false };
    }
  }
  /**
   * While the user is signed out and the conditional-auth opt-in is on, replace
   * a pick that requires GitHub with the first offered session type usable
   * without it. A no-op when signed in, when the opt-in is off (today's
   * behavior), or when no offered type is usable — in which case the caller's
   * existing fallbacks still apply.
   */
  _preferUsableSessionTypeWhenSignedOut(folderUri, pick) {
    if (this.defaultAccountService.currentDefaultAccount !== null || !isAllowSignedOutWhenUsableEnabled(this.configurationService)) {
      return pick;
    }
    const usable = this.sessionsManagementService.getSessionTypesForFolder(folderUri).filter((type) => type.sessionType.authRequirement === SessionTypeAuthRequirement.None);
    const pickIsUsable = usable.some((type) => type.sessionType.id === pick?.sessionTypeId && (pick?.providerId === void 0 || type.providerId === pick.providerId));
    if (usable.length === 0 || pickIsUsable) {
      return pick;
    }
    return { providerId: usable[0].providerId, sessionTypeId: usable[0].sessionType.id };
  }
  _scheduleRecreateOnProviderChange(folderUri, userPick, created, replayMissedChange) {
    const store = new DisposableStore();
    store.add(this.sessionsManagementService.onDidChangeSessionTypes(() => this._recreateOnProviderChange(folderUri, userPick, created)));
    this._pendingPreferredUpgrade.value = store;
    if (replayMissedChange) {
      this._recreateOnProviderChange(folderUri, userPick, created);
    }
  }
  _recreateOnProviderChange(folderUri, userPick, created) {
    if (created) {
      const active = this._session.get();
      if (active?.sessionId !== created.sessionId || active.isCreated.get()) {
        return;
      }
      if (userPick) {
        if (!this._isPreferredServable(folderUri, userPick)) {
          return;
        }
      } else {
        const preferred = this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
        if (!preferred || preferred.providerId === active.providerId && preferred.sessionTypeId === active.sessionType) {
          return;
        }
      }
    }
    void this._createNewSession(folderUri);
  }
  /**
   * Returns the workspace URI for the context picker based on the current workspace selection.
   */
  _getContextFolderUri() {
    return this._workspacePicker.selectedFolderUri;
  }
  _renderWorkspacePicker(container) {
    this._workspacePickerVisibleKey.set(true);
    const pickersRow = dom.append(container, dom.$(".session-workspace-picker"));
    const pickersLabel = dom.append(pickersRow, dom.$(".session-workspace-picker-label"));
    pickersLabel.textContent = this._workspacePicker.selectedFolderUri ? localize("newSessionIn", "New session in") : localize("newSessionChooseWorkspace", "Start by picking a");
    this._workspacePicker.render(pickersRow);
    if (!this._renderHarnessPickerInControls) {
      const withLabel = dom.append(pickersRow, dom.$(".session-workspace-picker-label.session-workspace-picker-with-label"));
      withLabel.textContent = localize("newSessionWith", "with");
      this._workspacePickerRow = pickersRow;
      if (isWeb) {
        this._newChatInput.sessionTypePicker.render(pickersRow, { className: "sessions-chat-session-type-picker" });
      }
    }
    return this._workspacePicker.onDidSelectWorkspace(() => {
      const folderUri = this._workspacePicker.selectedFolderUri;
      pickersLabel.textContent = folderUri ? localize("newSessionIn", "New session in") : localize("newSessionChooseWorkspace", "Start by picking a");
    });
  }
  _renderEmptyState(container) {
    this._workspacePickerVisibleKey.set(false);
    const emptyState = this.instantiationService.createInstance(NoAgentHostEmptyState);
    emptyState.render(container);
    this._activeEmptyState = emptyState;
    return {
      dispose: () => {
        if (this._activeEmptyState === emptyState) {
          this._activeEmptyState = void 0;
        }
        emptyState.dispose();
      }
    };
  }
  /**
   * Web-only: hosts the workspace picker, but swaps it out for the
   * no-agent-host empty state once we are *sure* there are no hosts —
   * i.e. after a discovery cycle has completed. Rendering the empty
   * state before discovery has run would briefly flash it at users who
   * actually have hosts that just haven't been discovered yet (e.g.
   * cached tunnels resolved on startup). Until then we keep the regular
   * workspace picker, which has its own loading affordance.
   */
  _renderEmptyStateGate(container, chatWidgetContent) {
    const store = new DisposableStore();
    const pickerSlot = dom.append(container, dom.$(".session-workspace-picker-slot"));
    const stateDisposables = store.add(new MutableDisposable());
    const showPicker = () => {
      chatWidgetContent.classList.remove("no-agent-host");
      dom.clearNode(pickerSlot);
      stateDisposables.value = this._renderWorkspacePicker(pickerSlot);
      this._renderChatTip();
    };
    const showEmptyState = () => {
      chatWidgetContent.classList.add("no-agent-host");
      dom.clearNode(pickerSlot);
      stateDisposables.value = this._renderEmptyState(pickerSlot);
      this._clearChatTip();
    };
    const filter = this.agentHostFilterService;
    let hasCompletedDiscovery = filter.hosts.length > 0;
    if (!hasCompletedDiscovery && !filter.isDiscovering) {
      filter.rediscover();
    }
    const update = () => {
      if (hasCompletedDiscovery && !filter.isDiscovering && filter.hosts.length === 0) {
        showEmptyState();
      } else {
        showPicker();
      }
    };
    update();
    store.add(filter.onDidChange(() => {
      if (filter.hosts.length > 0) {
        hasCompletedDiscovery = true;
      }
      update();
    }));
    store.add(filter.onDidChangeDiscovering(() => {
      if (!filter.isDiscovering) {
        hasCompletedDiscovery = true;
      }
      update();
    }));
    return store;
  }
  // --- Send ---
  async _send(query, attachedContext, background) {
    const session = this._session.get();
    if (!session) {
      this._workspacePicker.showPicker();
      return false;
    }
    const feedbackItems = [...this._feedbackItems.get()];
    const workspaceRoots = session.workspace.get()?.folders.map((folder) => folder.root) ?? (this._workspacePicker.selectedFolderUri ? [this._workspacePicker.selectedFolderUri] : []);
    const request = buildNewSessionPrompt(query, feedbackItems, workspaceRoots);
    const wasQuickChat = this._isQuickChatComposer.get();
    const reseedFolderUri = background && !wasQuickChat ? this._workspacePicker.selectedFolderUri : void 0;
    const sendOptions = { query: request, attachedContext, background };
    const clearFeedback = () => {
      for (const item of feedbackItems) {
        this.agentFeedbackService.removeFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, item.id);
      }
    };
    if (background) {
      this._pendingBackgroundSends.set(sendOptions, Event.once(
        Event.filter(this.sessionsManagementService.onDidSendRequest, (event) => event.options === sendOptions)
      )(() => {
        clearFeedback();
        this._pendingBackgroundSends.deleteAndDispose(sendOptions);
      }));
    }
    try {
      await this.sessionsManagementService.sendNewChatRequest(session, sendOptions);
    } catch (e) {
      this._pendingBackgroundSends.deleteAndDispose(sendOptions);
      this.logService.error("Failed to send request:", e);
      return false;
    }
    if (!background) {
      clearFeedback();
    }
    if (background) {
      if (wasQuickChat) {
        this.sessionsService.openQuickChat();
      } else if (reseedFolderUri) {
        await this._createNewSession(reseedFolderUri);
      }
    }
    return true;
  }
  _renderFeedbackBanner(container) {
    const host = dom.append(container, dom.$(".session-input-banners.new-session-feedback-banners"));
    const content = this._register(new MutableDisposable());
    this._register(autorun((reader) => {
      const feedbackItems = this._feedbackItems.read(reader);
      content.clear();
      dom.clearNode(host);
      if (!feedbackItems.length) {
        setChatInputStackSlot(host, ChatInputStackSlot.Empty);
        return;
      }
      const count = feedbackItems.length;
      const text = count === 1 ? localize("newSessionFeedback.one", "1 comment") : localize("newSessionFeedback.many", "{0} comments", count);
      const store = new DisposableStore();
      content.value = store;
      const banner = store.add(this.instantiationService.createInstance(SessionInputBannerWidget, {
        icon: Codicon.commentDiscussion,
        accent: false,
        text,
        ariaLabel: text,
        actions: [{
          label: localize("newSessionFeedback.reveal", "Reveal"),
          run: () => this.agentFeedbackService.revealFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, feedbackItems[0].id)
        }]
      }));
      host.appendChild(banner.domNode);
      setChatInputStackSlot(host, ChatInputStackSlot.Docked);
    }));
  }
  saveState() {
    this._newChatInput.saveState();
  }
  layout(_height, _width) {
    this._newChatInput.layout(_height, _width);
  }
  focusInput() {
    if (this._activeEmptyState) {
      this._activeEmptyState.focus();
      return;
    }
    this._newChatInput.focus();
  }
  /**
   * Handles a workspace selection from the workspace picker and creates a
   * new session for it. Workspace trust (when required) is requested by
   * {@link ISessionsService.openNewSession} itself — a single gate shared
   * by every path that creates a concrete session for a folder.
   */
  async _onWorkspaceSelected(folderUri) {
    this._pendingPreferredUpgrade.clear();
    const currentFolderUri = this._session.get()?.workspace.get()?.folders[0]?.root;
    const refreshingPromptOptions = !!currentFolderUri && (!folderUri || !this.uriIdentityService.extUri.isEqual(currentFolderUri, folderUri)) && this._newChatInput.preparePromptOptionsRefresh();
    if (!folderUri) {
      this.sessionsService.unsetNewSession();
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    const result = await this._createNewSession(folderUri);
    if (refreshingPromptOptions && !result.session) {
      this._newChatInput.showPromptOptions(void 0);
    }
    if (result.trustDeclined) {
      this._workspacePicker.removeFromRecents(folderUri);
    }
  }
  async _refreshPromptOptions() {
    try {
      await this._newChatInput.refreshPromptOptions();
    } catch (error) {
      this.logService.error("Failed to refresh new-session prompt options:", error);
      this._newChatInput.showPromptOptions(void 0);
    }
  }
  prefillInput(text) {
    this._newChatInput.prefillInput(text);
  }
  setHostVisible(visible) {
    this._aquariumToggle?.setHostVisible(visible);
  }
  sendQuery(text) {
    this._newChatInput.sendQuery(text);
  }
  submitInput() {
    if (!this._session.get()) {
      this._workspacePicker.showPicker();
      return Promise.resolve(false);
    }
    return this._newChatInput.submit();
  }
  attach(uris) {
    this._newChatInput.attach(uris);
  }
  selectWorkspace(folderUri, providerId) {
    this._workspacePicker.setSelectedWorkspace(folderUri, { providerId });
  }
};
NewChatWidget = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ISessionsManagementService),
  __decorateParam(7, ISessionsService),
  __decorateParam(8, IAquariumService),
  __decorateParam(9, IAgentHostFilterService),
  __decorateParam(10, IUriIdentityService),
  __decorateParam(11, IAgentFeedbackService),
  __decorateParam(12, IChatPetService),
  __decorateParam(13, IChatTipService),
  __decorateParam(14, IOpenerService),
  __decorateParam(15, IDefaultAccountService),
  __decorateParam(16, IStorageService),
  __decorateParam(17, INewSessionComposerService)
], NewChatWidget);
export {
  NewChatWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcbmV3Q2hhdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0V2lkZ2V0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZSwgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIsIFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSU9wZW5OZXdTZXNzaW9uUmVzdWx0LCBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVFbmFibGVkLCBzaG91bGRTaG93R2l0SHViV29ya3NwYWNlR3JvdXBTaWduSW4gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Nlc3Npb25zQXV0aEdhdGUuanMnO1xuaW1wb3J0IHsgQUdFTlRJQ19TSUdOX0lOX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElBcXVhcml1bVNlcnZpY2UsIElNb3VudGVkVG9nZ2xlSGFuZGxlIH0gZnJvbSAnLi4vLi4vYXF1YXJpdW0vYnJvd3Nlci9hcXVhcml1bU92ZXJsYXkuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlUGlja2VyIH0gZnJvbSAnLi9zZXNzaW9uV29ya3NwYWNlUGlja2VyLmpzJztcbmltcG9ydCB7IFdlYldvcmtzcGFjZVBpY2tlciB9IGZyb20gJy4vd2ViV29ya3NwYWNlUGlja2VyLmpzJztcbmltcG9ydCB7IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB9IGZyb20gJy4vc2Vzc2lvblR5cGVQaWNrZXIuanMnO1xuaW1wb3J0IHsgTmV3Q2hhdElucHV0V2lkZ2V0IH0gZnJvbSAnLi9uZXdDaGF0SW5wdXQuanMnO1xuaW1wb3J0IHsgTm9BZ2VudEhvc3RFbXB0eVN0YXRlIH0gZnJvbSAnLi9ub0FnZW50SG9zdEVtcHR5U3RhdGUuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hZ2VudEhvc3RGaWx0ZXIvY29tbW9uL2FnZW50SG9zdEZpbHRlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9jaGF0Vmlldy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uV29ya3NwYWNlUGlja2VyVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UsIEFnZW50RmVlZGJhY2tTdGF0ZSwgSUFnZW50RmVlZGJhY2ssIElBZ2VudEZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4uLy4uL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZE5ld1Nlc3Npb25Qcm9tcHQgfSBmcm9tICcuLi8uLi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja0F0dGFjaG1lbnRFbnRyeS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSW5wdXRCYW5uZXJXaWRnZXQgfSBmcm9tICcuLi8uLi9zZXNzaW9uSW5wdXRCYW5uZXJzL2Jyb3dzZXIvc2Vzc2lvbklucHV0QmFubmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRUaXBQcmVzZW50ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFRpcFByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBjaGF0SW5wdXRTdGFja0NsYXNzLCBDaGF0SW5wdXRTdGFja1Nsb3QsIHNldENoYXRJbnB1dFN0YWNrU2xvdCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0U3RhY2suanMnO1xuaW1wb3J0IHsgSUNoYXRQZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRQZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0VGlwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0VGlwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVE9UQUxfU0VTU0lPTlNfS0VZIH0gZnJvbSAnLi4vLi4vc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXIuanMnO1xuaW1wb3J0IHsgSU5ld1Nlc3Npb25Db21wb3NlclNlcnZpY2UsIE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UgfSBmcm9tICcuL25ld1Nlc3Npb25Db21wb3NlclNlcnZpY2UuanMnO1xuXG4vLyAjcmVnaW9uIC0tLSBOZXcgQ2hhdCBXaWRnZXQgLS0tXG5cbi8qKiBNaW5pbXVtIG51bWJlciBvZiBzdGFydGVkIHNlc3Npb25zIHJlcXVpcmVkIGJlZm9yZSBzaG93aW5nIHRpcHMgYW5kIHByb21vdGlvbnMuICovXG5jb25zdCBNSU5fU0VTU0lPTlNfRk9SX0ZJUlNUX1JVTl9OT1RJQ0VTID0gMjtcblxuZXhwb3J0IGNsYXNzIE5ld0NoYXRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VQaWNrZXI6IFdvcmtzcGFjZVBpY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfbmV3Q2hhdElucHV0OiBOZXdDaGF0SW5wdXRXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRUaXBQcmVzZW50ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2hhdElucHV0VGlwUHJlc2VudGVyPigpKTtcblx0cHJpdmF0ZSBfaXNDaGF0VGlwU2Vzc2lvbkluaXRpYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2FxdWFyaXVtVG9nZ2xlOiBJTW91bnRlZFRvZ2dsZUhhbmRsZSB8IHVuZGVmaW5lZDtcblxuXHQvKiogUmVjcmVhdGVzIHRoZSBkcmFmdCBvbmNlIGEgYmV0dGVyL2xhdGUtcmVnaXN0ZXJpbmcgcHJvdmlkZXIgY2FuIHNlcnZlIHRoZSBmb2xkZXIgKHNlZSB7QGxpbmsgX2NyZWF0ZU5ld1Nlc3Npb259KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1ByZWZlcnJlZFVwZ3JhZGUgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25ld1Nlc3Npb25DcmVhdGlvbiA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKTtcblxuXHQvKipcblx0ICogVGhlIGN1cnJlbnRseSBtb3VudGVkIG5vLWFnZW50LWhvc3QgZW1wdHkgc3RhdGUsIGlmIGFueS4gU2V0IGJ5XG5cdCAqIHtAbGluayBfcmVuZGVyRW1wdHlTdGF0ZUdhdGV9IHdoaWxlIHRoZSBlbXB0eSBzdGF0ZSByZXBsYWNlcyB0aGVcblx0ICogd29ya3NwYWNlIHBpY2tlcjsgY29uc3VsdGVkIGJ5IHtAbGluayBmb2N1c0lucHV0fSB0byByb3V0ZSBmb2N1cyB0b1xuXHQgKiB0aGUgdmlzaWJsZSBoZWFkaW5nIGluc3RlYWQgb2YgdGhlIChoaWRkZW4pIGNoYXQgaW5wdXQuXG5cdCAqL1xuXHRwcml2YXRlIF9hY3RpdmVFbXB0eVN0YXRlOiBOb0FnZW50SG9zdEVtcHR5U3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gcmVuZGVyIHRoZSBzZXNzaW9uIHR5cGUgKFwiaGFybmVzc1wiKSBwaWNrZXIgYmVsb3cgdGhlIGlucHV0XG5cdCAqIChpbiB0aGUgY29udHJvbHMpIGluc3RlYWQgb2YgbmV4dCB0byB0aGUgd29ya3NwYWNlIHBpY2tlci4gUmVhZCBvbmNlIGZyb21cblx0ICogdGhlIHZpZXcgb3B0aW9ucyBhdCBjb25zdHJ1Y3Rpb24gdGltZTsgdGhlIHdpZGdldCBkb2VzIG5vdCByZWFjdCB0byBsYXRlclxuXHQgKiBjaGFuZ2VzIG9mIHRoZSBzb3VyY2Ugb2JzZXJ2YWJsZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckhhcm5lc3NQaWNrZXJJbkNvbnRyb2xzOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb246IElPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPjtcblxuXHQvKiogV2hldGhlciB0aGUgYWN0aXZlIGRyYWZ0IGlzIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdCAoaGlkZXMgdGhlIHdvcmtzcGFjZSBwaWNrZXIpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1F1aWNrQ2hhdENvbXBvc2VyOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHQvKiogRHJhZnQgY29tbWVudHMgc2hhcmVkIGJ5IGV2ZXJ5IHVuY3JlYXRlZCBuZXctc2Vzc2lvbiBjb21wb3Nlci4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZmVlZGJhY2tJdGVtczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUFnZW50RmVlZGJhY2tbXT47XG5cblx0LyoqIEluLWZsaWdodCBiYWNrZ3JvdW5kIHNlbmRzIGF3YWl0aW5nIGNvbmZpcm1hdGlvbiBiZWZvcmUgdGhlaXIgY29tbWVudHMgYXJlIGNsZWFyZWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdCYWNrZ3JvdW5kU2VuZHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxvYmplY3Q+KCkpO1xuXG5cdC8qKiBUaGUgd29ya3NwYWNlLXJvdyBjb250YWluZXIgaG9zdGluZyB0aGUgaW5saW5lIGhhcm5lc3MgcGlja2VyIChkZXNrdG9wLCBub24tcXVpY2stY2hhdCkuICovXG5cdHByaXZhdGUgX3dvcmtzcGFjZVBpY2tlclJvdzogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFRoZSBxdWljay1jaGF0IGhlYWRlciByb3cgaG9zdGluZyB0aGUgaW5saW5lIGhhcm5lc3MgcGlja2VyIChkZXNrdG9wLCBxdWljayBjaGF0KS4gKi9cblx0cHJpdmF0ZSBfcXVpY2tDaGF0SGVhZGVyUGlja2VySG9zdDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFRyYWNrcyB3aGV0aGVyIHRoZSB3b3Jrc3BhY2UgcGlja2VyIGlzIGN1cnJlbnRseSByZW5kZXJlZCAodnMgcmVwbGFjZWQgYnlcblx0ICogdGhlIG5vLWFnZW50LWhvc3QgZW1wdHkgc3RhdGUgb24gd2ViKS4gQ29uc3VtZWQgYnkgdGhlIG5ldy1zZXNzaW9uLXZpZXdcblx0ICogb25ib2FyZGluZyB0b3VyIHRvIHNraXAgdGhlIHdvcmtzcGFjZSBzdGVwIHdoZW4gdGhlIHBpY2tlciBpcyBub3Qgc2hvd24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VQaWNrZXJWaXNpYmxlS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElDaGF0Vmlld09wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElBcXVhcml1bVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhcXVhcml1bVNlcnZpY2U6IElBcXVhcml1bVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRIb3N0RmlsdGVyU2VydmljZTogSUFnZW50SG9zdEZpbHRlclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElBZ2VudEZlZWRiYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50RmVlZGJhY2tTZXJ2aWNlOiBJQWdlbnRGZWVkYmFja1NlcnZpY2UsXG5cdFx0QElDaGF0UGV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRQZXRTZXJ2aWNlOiBJQ2hhdFBldFNlcnZpY2UsXG5cdFx0QElDaGF0VGlwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRUaXBTZXJ2aWNlOiBJQ2hhdFRpcFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlIG5ld1Nlc3Npb25Db21wb3NlclNlcnZpY2U6IElOZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlclZpc2libGVLZXkgPSBTZXNzaW9uV29ya3NwYWNlUGlja2VyVmlzaWJsZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fd29ya3NwYWNlUGlja2VyVmlzaWJsZUtleS5yZXNldCgpKSk7XG5cdFx0dGhpcy5fcmVuZGVySGFybmVzc1BpY2tlckluQ29udHJvbHMgPSB0aGlzLm9wdGlvbnMucmVuZGVyU2Vzc2lvblR5cGVQaWNrZXJJbkNvbnRyb2xzLmdldCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3BlbmRpbmdQcmVmZXJyZWRVcGdyYWRlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9uZXdTZXNzaW9uQ3JlYXRpb24pO1xuXG5cdFx0Ly8gVE9ETzogQHNhbmR5MDgxIFRoZSBzZXNzaW9uL2NoYXQgc2hvdWxkIGJlIHBhc3NlZCBkb3duLiBUaGVyZSBzaG91bGQgbm90IGJlIHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uIHJlYWQgaW4gdGhlIHdpZGdldC5cblx0XHR0aGlzLl9zZXNzaW9uID0gZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KHRoaXMsIChyZWFkZXIsIHByZXYpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uICYmIGFjdGl2ZVNlc3Npb24uaXNDcmVhdGVkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gcHJldjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQSBxdWljayBjaGF0IGlzIHdvcmtzcGFjZS1sZXNzOyB0aGUgY29tcG9zZXIgaGlkZXMgdGhlIHdvcmtzcGFjZSBwaWNrZXJcblx0XHQvLyAobm90aGluZyB0byBwaWNrKSBhbmQgc3VyZmFjZXMgdGhlIHNlc3Npb24tdHlwZSBwaWNrZXIgaW4gdGhlIGNvbnRyb2xzLlxuXHRcdHRoaXMuX2lzUXVpY2tDaGF0Q29tcG9zZXIgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbj8uaXNRdWlja0NoYXQ/LnJlYWQocmVhZGVyKSA/PyBmYWxzZTtcblx0XHR9KTtcblxuXHRcdC8vIE9uIHdlYiAodnNjb2RlLmRldiAvIGluc2lkZXJzLnZzY29kZS5kZXYpLCB1c2Uge0BsaW5rIFdlYldvcmtzcGFjZVBpY2tlcn1cblx0XHQvLyB3aGljaCBzY29wZXMgcmVjZW50cyB0byB0aGUgYWN0aXZlIGhvc3QgYW5kIHJlbmRlcnMgYXMgYSBib3R0b21cblx0XHQvLyBzaGVldCBvbiBwaG9uZS1sYXlvdXQgdmlld3BvcnRzLiBPbiBFbGVjdHJvbiBkZXNrdG9wLCB0aGUgcmVndWxhclxuXHRcdC8vIHtAbGluayBXb3Jrc3BhY2VQaWNrZXJ9IGlzIGZpbmUgXHUyMDE0IHBob25lcyBuZXZlciBydW4gdGhlcmUuXG5cdFx0Y29uc3QgUGlja2VyQ3RvciA9IGlzV2ViID8gV2ViV29ya3NwYWNlUGlja2VyIDogV29ya3NwYWNlUGlja2VyO1xuXHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGlja2VyQ3Rvciwge1xuXHRcdFx0Y2FuUmVzdG9yZVdvcmtzcGFjZTogKCkgPT4gIXRoaXMuX2lzUXVpY2tDaGF0Q29tcG9zZXIuZ2V0KCksXG5cdFx0XHRnZXRXb3Jrc3BhY2VHcm91cEFjdGlvbjogZ3JvdXAgPT4ge1xuXHRcdFx0XHRpZiAoZ3JvdXAgPT09IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQiAmJiBzaG91bGRTaG93R2l0SHViV29ya3NwYWNlR3JvdXBTaWduSW4oXG5cdFx0XHRcdFx0dGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UuY3VycmVudERlZmF1bHRBY2NvdW50ICE9PSBudWxsLFxuXHRcdFx0XHRcdGlzQWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdFx0KSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5zaWduSW5HaXRIdWInLCBcIlNpZ24gaW4gdG8gR2l0SHViXCIpLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zaWduSW4sXG5cdFx0XHRcdFx0XHRjb21tYW5kSWQ6IEFHRU5USUNfU0lHTl9JTl9DT01NQU5EX0lELFxuXHRcdFx0XHRcdFx0aGlkZVdvcmtzcGFjZUl0ZW1zOiB0cnVlLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZmVlZGJhY2tDaGFuZ2VkID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLmFnZW50RmVlZGJhY2tTZXJ2aWNlLm9uRGlkQ2hhbmdlRmVlZGJhY2spO1xuXHRcdHRoaXMuX2ZlZWRiYWNrSXRlbXMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRmZWVkYmFja0NoYW5nZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHRoaXMuYWdlbnRGZWVkYmFja1NlcnZpY2UuZ2V0RmVlZGJhY2soQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UpXG5cdFx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2FuU2VuZFJlcXVlc3QgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlc3Npb24ubG9hZGluZy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsb2FkaW5nID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHNlc3Npb24/LmxvYWRpbmcucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGhhc0ZlZWRiYWNrID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fZmVlZGJhY2tJdGVtcy5yZWFkKHJlYWRlcikubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgY2FuU3VibWl0V2l0aG91dFNlc3Npb24gPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiAhdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcikgJiYgaGFzRmVlZGJhY2sucmVhZChyZWFkZXIpKTtcblx0XHRjb25zdCBkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdHRoaXMsXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBUT1RBTF9TRVNTSU9OU19LRVksIHRoaXMuX3N0b3JlKSxcblx0XHRcdCgpID0+IHRoaXMuX2hhc0Vub3VnaFNlc3Npb25zRm9yRmlyc3RSdW5Ob3RpY2VzKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IG5ld0NoYXRJbnB1dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV3Q2hhdElucHV0V2lkZ2V0LCB7XG5cdFx0XHRzZXNzaW9uOiB0aGlzLl9zZXNzaW9uLFxuXHRcdFx0Z2V0Q29udGV4dEZvbGRlclVyaTogKCkgPT4gdGhpcy5fZ2V0Q29udGV4dEZvbGRlclVyaSgpLFxuXHRcdFx0Z2V0V29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlOiAoKSA9PiB0aGlzLl9pc1F1aWNrQ2hhdENvbXBvc2VyLmdldCgpXG5cdFx0XHRcdD8gTmV3U2Vzc2lvbldvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZS5Ob25lXG5cdFx0XHRcdDogdGhpcy5fd29ya3NwYWNlUGlja2VyLnByZXNlbGVjdGlvblNvdXJjZSxcblx0XHRcdHNlbmRSZXF1ZXN0OiBhc3luYyAoeyBxdWVyeSwgYXR0YWNobWVudHMsIGJhY2tncm91bmQgfSkgPT4gdGhpcy5fc2VuZChxdWVyeSwgYXR0YWNobWVudHMsIGJhY2tncm91bmQpLFxuXHRcdFx0Y2FuU2VuZFJlcXVlc3QsXG5cdFx0XHRjYW5TdWJtaXRXaXRob3V0U2Vzc2lvbixcblx0XHRcdGhhc0FkZGl0aW9uYWxTZW5kQ29udGVudDogaGFzRmVlZGJhY2ssXG5cdFx0XHRsb2FkaW5nLFxuXHRcdFx0aGlzdG9yeUtleTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksIC8vIG5vIHBlcnNpc3RlZCBoaXN0b3J5IGZvciB0aGUgbmV3LXNlc3Npb24gdmlld1xuXHRcdFx0cmVuZGVyU2Vzc2lvblR5cGVQaWNrZXJJbkNvbnRyb2xzOiB0aGlzLl9yZW5kZXJIYXJuZXNzUGlja2VySW5Db250cm9scyxcblx0XHRcdHN1cHBvcnRzQmFja2dyb3VuZDogdHJ1ZSxcblx0XHRcdGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQsXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IG5ld0NoYXRJbnB1dC5zYXZlU3RhdGUoKSkpO1xuXHRcdHRoaXMuX25ld0NoYXRJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ld0NoYXRJbnB1dCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3U2Vzc2lvbkNvbXBvc2VyU2VydmljZS5yZWdpc3RlckNvbXBvc2VyKHRoaXMuX25ld0NoYXRJbnB1dCkpO1xuXG5cdFx0Ly8gQ29tbWVudCAzOiBCaW5kIEFnZW50IG1vZGUgaW4gdGhlIHNjb3BlZCBjb250ZXh0IHNvIHRoYXQgQWdlbnQtb25seSB0aXBzXG5cdFx0Ly8gKG1lc3NhZ2VRdWV1ZWluZywgc3ViYWdlbnRzLCBldGMuKSBhcmUgZWxpZ2libGUgYW5kIGNoYXRNb2RlS2luZC1iYXNlZFxuXHRcdC8vIHdoZW4tY2xhdXNlcyBldmFsdWF0ZSBjb3JyZWN0bHkgYWdhaW5zdCB0aGlzIGNvbXBvc2VyJ3MgYWN0dWFsIG1vZGUuXG5cdFx0Y29uc3QgY2hhdE1vZGVLaW5kS2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNoYXRNb2RlS2luZEtleS5zZXQoQ2hhdE1vZGVLaW5kLkFnZW50KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gY2hhdE1vZGVLaW5kS2V5LnJlc2V0KCkpKTtcblxuXHRcdC8vIENvbW1lbnQgNDogUm91dGUgdGlwIGNvbW1hbmQgbGlua3MgdG8gdGhpcyBjb21wb3NlcidzIG93biBwaWNrZXJzXG5cdFx0Ly8gc28gdGhleSBkbyBub3QgZmFsbCB0aHJvdWdoIHRvIElDaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldFxuXHRcdC8vICh3aGljaCB0aGlzIGNvbXBvc2VyIGlzIG5vdCByZWdpc3RlcmVkIHdpdGgpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub3BlbmVyU2VydmljZS5yZWdpc3Rlck9wZW5lcih7XG5cdFx0XHRvcGVuOiBhc3luYyAocmVzb3VyY2U6IFVSSSB8IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NoYXRUaXBQcmVzZW50ZXIudmFsdWU/LmN1cnJlbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbGluayA9IHR5cGVvZiByZXNvdXJjZSA9PT0gJ3N0cmluZycgPyByZXNvdXJjZSA6IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmIChsaW5rID09PSAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVsUGlja2VyJykge1xuXHRcdFx0XHRcdHRoaXMuX25ld0NoYXRJbnB1dC5vcGVuTW9kZWxQaWNrZXIoKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobGluayA9PT0gJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5QbGFuJykge1xuXHRcdFx0XHRcdC8vIFBsYW4gbW9kZSBpcyBub3QgYXZhaWxhYmxlIGluIHRoZSBuZXctc2Vzc2lvbiBjb21wb3NlcjsgY29uc3VtZVxuXHRcdFx0XHRcdC8vIHRoZSBsaW5rIHdpdGhvdXQgYWN0aW9uIHNvIGl0IGRvZXMgbm90IG1pc2ZpcmUgb24gYSBzdGFsZSB3aWRnZXQuXG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtzcGFjZVBpY2tlci5vbkRpZFNlbGVjdFdvcmtzcGFjZShhc3luYyBmb2xkZXJVcmkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fb25Xb3Jrc3BhY2VTZWxlY3RlZChmb2xkZXJVcmkpO1xuXHRcdFx0dGhpcy5fbmV3Q2hhdElucHV0LmZvY3VzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25ld0NoYXRJbnB1dC5zZXNzaW9uVHlwZVBpY2tlci5vbkRpZFNlbGVjdFNlc3Npb25UeXBlKGFzeW5jIHBpY2sgPT4ge1xuXHRcdFx0Ly8gQSBxdWljayBjaGF0IGhhcyBubyBmb2xkZXI6IHJlLWNyZWF0ZSB0aGUgZHJhZnQgd2l0aCB0aGUgcGlja2VkXG5cdFx0XHQvLyB0eXBlIHZpYSBvcGVuUXVpY2tDaGF0IChtaXJyb3JzIHRoZSBmb2xkZXIgcGF0aCdzIGRyYWZ0IHJlY3JlYXRpb24pLlxuXHRcdFx0aWYgKHRoaXMuX2lzUXVpY2tDaGF0Q29tcG9zZXIuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uc1NlcnZpY2Uub3BlblF1aWNrQ2hhdChwaWNrID8geyBwcm92aWRlcklkOiBwaWNrLnByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6IHBpY2suc2Vzc2lvblR5cGVJZCB9IDogdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fbmV3Q2hhdElucHV0LmZvY3VzKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX29uV29ya3NwYWNlU2VsZWN0ZWQodGhpcy5fd29ya3NwYWNlUGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpKTtcblx0XHRcdHRoaXMuX25ld0NoYXRJbnB1dC5mb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKCFlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdjaGF0LnRpcHMuZW5hYmxlZCcpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LnRpcHMuZW5hYmxlZCcpKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckNoYXRUaXAoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyQ2hhdFRpcCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBUT1RBTF9TRVNTSU9OU19LRVksIHRoaXMuX3N0b3JlKSgoKSA9PiB0aGlzLl9yZW5kZXJDaGF0VGlwKCkpKTtcblx0XHRjb25zdCBmb3JlZ3JvdW5kU2Vzc2lvbkNvdW50Q29udGV4dEtleXMgPSBuZXcgU2V0KFtDaGF0Q29udGV4dEtleXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudC5rZXldKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKGZvcmVncm91bmRTZXNzaW9uQ291bnRDb250ZXh0S2V5cykpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQ2hhdFRpcCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIENvbW1lbnQgMjogUmUtZXZhbHVhdGUgdGhlIHRpcCB3aGVuIHRoZSBzZWxlY3RlZCBtb2RlbCBjaGFuZ2VzLCBiZWNhdXNlXG5cdFx0Ly8gc29tZSB0aXBzIChlLmcuIHRpcC5zd2l0Y2hUb0F1dG8pIGFyZSBvbmx5IGVsaWdpYmxlIGZvciBzcGVjaWZpYyBtb2RlbHMuXG5cdFx0bGV0IHByZXZpb3VzTW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsSWQgPSB0aGlzLl9uZXdDaGF0SW5wdXQuc2VsZWN0ZWRNb2RlbFN0YXRlLnJlYWQocmVhZGVyKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXI7XG5cdFx0XHRpZiAocHJldmlvdXNNb2RlbElkICE9PSB1bmRlZmluZWQgJiYgcHJldmlvdXNNb2RlbElkICE9PSBtb2RlbElkKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckNoYXRUaXAoKTtcblx0XHRcdH1cblx0XHRcdHByZXZpb3VzTW9kZWxJZCA9IG1vZGVsSWQ7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtc3luYyB0aGUgcGlja2VyJ3MgZGlzcGxheWVkIHNlbGVjdGlvbiB3aGVuIHRoZSBzZXNzaW9uJ3Mgd29ya3NwYWNlXG5cdFx0Ly8gY2hhbmdlcyBleHRlcm5hbGx5IChlLmcuIHNlc3Npb25zU2VydmljZS5vcGVuTmV3U2Vzc2lvbih7IGZvbGRlclVyaSB9KSkuXG5cdFx0bGV0IHByZXZpb3VzRm9sZGVyVXJpID0gdGhpcy5fc2Vzc2lvbi5nZXQoKT8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IHNlc3Npb24/LndvcmtzcGFjZS5yZWFkKHJlYWRlcik/LmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0XHR0aGlzLl9oYW5kbGVQcm9tcHRPcHRpb25zV29ya3NwYWNlQ2hhbmdlKHByZXZpb3VzRm9sZGVyVXJpLCBmb2xkZXJVcmkpO1xuXHRcdFx0cHJldmlvdXNGb2xkZXJVcmkgPSBmb2xkZXJVcmk7XG5cdFx0XHRpZiAoZm9sZGVyVXJpICYmICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChmb2xkZXJVcmksIHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEZvbGRlclVyaSkpIHtcblx0XHRcdFx0dGhpcy5fd29ya3NwYWNlUGlja2VyLnNldFNlbGVjdGVkV29ya3NwYWNlKGZvbGRlclVyaSwgeyBmaXJlRXZlbnQ6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVByb21wdE9wdGlvbnNXb3Jrc3BhY2VDaGFuZ2UocHJldmlvdXNGb2xkZXJVcmk6IFVSSSB8IHVuZGVmaW5lZCwgZm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VDaGFuZ2VkID0gcHJldmlvdXNGb2xkZXJVcmlcblx0XHRcdD8gIWZvbGRlclVyaSB8fCAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocHJldmlvdXNGb2xkZXJVcmksIGZvbGRlclVyaSlcblx0XHRcdDogISFmb2xkZXJVcmk7XG5cdFx0aWYgKCF3b3Jrc3BhY2VDaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChmb2xkZXJVcmkpIHtcblx0XHRcdHZvaWQgdGhpcy5fcmVmcmVzaFByb21wdE9wdGlvbnMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbmV3Q2hhdElucHV0LmNsZWFyUHJvbXB0T3B0aW9ucygpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBSZW5kZXJpbmcgLS0tXG5cblx0cmVuZGVyKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC13aWRnZXQnKSk7XG5cdFx0Y29uc3QgY2hhdFdpZGdldENvbnRhaW5lciA9IGRvbS5hcHBlbmQoZWxlbWVudCwgZG9tLiQoJy5uZXctY2hhdC13aWRnZXQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRDb250ZW50ID0gZG9tLmFwcGVuZChjaGF0V2lkZ2V0Q29udGFpbmVyLCBkb20uJChgLm5ldy1jaGF0LXdpZGdldC1jb250ZW50LiR7Y2hhdElucHV0U3RhY2tDbGFzc31gKSk7XG5cblx0XHR0aGlzLl9hcXVhcml1bVRvZ2dsZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXF1YXJpdW1TZXJ2aWNlLm1vdW50VG9nZ2xlKGVsZW1lbnQpKTtcblx0XHRjb25zdCBhcXVhcml1bUFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oXG5cdFx0XHQnc2Vzc2lvbnMuYXF1YXJpdW0uc2hvd0FjdGlvbicsXG5cdFx0XHRsb2NhbGl6ZSgnYXF1YXJpdW1BY3Rpb24nLCBcIkFxdWFyaXVtXCIpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHRoaXMuYXF1YXJpdW1TZXJ2aWNlLnRvZ2dsZUFjdGlvblZpc2liaWxpdHkoKVxuXHRcdCkpO1xuXHRcdGNvbnN0IHBldEFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oXG5cdFx0XHQnc2Vzc2lvbnMuY2hhdFBldC50b2dnbGUnLFxuXHRcdFx0bG9jYWxpemUoJ3BldEFjdGlvbicsIFwiUGV0ICgvdnNjb2RlLXBldClcIiksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0KCkgPT4gdGhpcy5jaGF0UGV0U2VydmljZS50b2dnbGUoKVxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBOb2RlIHwgbnVsbDtcblx0XHRcdGlmICh0YXJnZXQgJiYgY2hhdFdpZGdldENvbnRlbnQuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRhcXVhcml1bUFjdGlvbi5jaGVja2VkID0gdGhpcy5hcXVhcml1bVNlcnZpY2UuYWN0aW9uVmlzaWJsZS5nZXQoKTtcblx0XHRcdHBldEFjdGlvbi5jaGVja2VkID0gdGhpcy5jaGF0UGV0U2VydmljZS5lbmFibGVkLmdldCgpO1xuXHRcdFx0Y29uc3QgYW5jaG9yID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChkb20uZ2V0V2luZG93KGVsZW1lbnQpLCBlKTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBbYXF1YXJpdW1BY3Rpb24sIHBldEFjdGlvbl0sXG5cdFx0XHRcdGdldENoZWNrZWRBY3Rpb25zUmVwcmVzZW50YXRpb246ICgpID0+ICdjaGVja2JveCcsXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VQaWNrZXJDb250YWluZXIgPSBkb20uYXBwZW5kKGNoYXRXaWRnZXRDb250ZW50LCBkb20uJCgnLm5ldy1zZXNzaW9uLXdvcmtzcGFjZS1waWNrZXItY29udGFpbmVyJykpO1xuXHRcdC8vIE9uIHdlYiAodnNjb2RlLmRldiAvIGluc2lkZXJzLnZzY29kZS5kZXYpIHRoZSB3b3Jrc3BhY2UgcGlja2VyIGlzXG5cdFx0Ly8gc2NvcGVkIHRvIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgYWdlbnQgaG9zdC4gV2hlbiBubyBob3N0cyBhcmVcblx0XHQvLyBrbm93biB0aGVyZSBpcyBub3RoaW5nIGZvciB0aGUgdXNlciB0byBwaWNrLCBzbyBzd2FwIHRoZSBwaWNrZXJcblx0XHQvLyBvdXQgZm9yIHRoZSBuby1hZ2VudC1ob3N0IGVtcHR5IHN0YXRlLiBPbiBFbGVjdHJvbiBkZXNrdG9wIHRoZVxuXHRcdC8vIHJlZ3VsYXIgcGlja2VyIGlzIGFsd2F5cyBmdW5jdGlvbmFsICh0aGUgbG9jYWwgQ29waWxvdCBwcm92aWRlclxuXHRcdC8vIGlzIGFsd2F5cyBhdmFpbGFibGUpIHNvIHRoaXMgYnJhbmNoIGlzIHdlYi1vbmx5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGlzV2ViXG5cdFx0XHQ/IHRoaXMuX3JlbmRlckVtcHR5U3RhdGVHYXRlKHdvcmtzcGFjZVBpY2tlckNvbnRhaW5lciwgY2hhdFdpZGdldENvbnRlbnQpXG5cdFx0XHQ6IHRoaXMuX3JlbmRlcldvcmtzcGFjZVBpY2tlcih3b3Jrc3BhY2VQaWNrZXJDb250YWluZXIpKTtcblxuXHRcdC8vIFF1aWNrLWNoYXQgY29tcG9zZXIgaGVhZGVyICh3b3Jrc3BhY2UtbGVzcyk6IGEgdG9wLW9mLWlucHV0IFwiTmV3IENoYXRcIlxuXHRcdC8vIGxhYmVsIHBsdXMgdGhlIGlubGluZSBzZXNzaW9uLXR5cGUgcGlja2VyLiBTaG93biBvbmx5IGluIHF1aWNrLWNoYXRcblx0XHQvLyBtb2RlIHZpYSB0aGUgYC5xdWljay1jaGF0YCBjbGFzcyBvbiB0aGUgY29udGVudCAoc2VlIENTUykuIE9uIHdlYiB0aGVcblx0XHQvLyBjb21wb3NlciBpcyBuZXZlciBhIHF1aWNrIGNoYXQsIHNvIGl0IHN0YXlzIGVtcHR5L2hpZGRlbiB0aGVyZS5cblx0XHRpZiAoIWlzV2ViICYmICF0aGlzLl9yZW5kZXJIYXJuZXNzUGlja2VySW5Db250cm9scykge1xuXHRcdFx0Y29uc3QgcXVpY2tDaGF0SGVhZGVyUm93ID0gZG9tLmFwcGVuZChjaGF0V2lkZ2V0Q29udGVudCwgZG9tLiQoJy5uZXctc2Vzc2lvbi1xdWljay1jaGF0LWhlYWRlci5zZXNzaW9uLXdvcmtzcGFjZS1waWNrZXInKSk7XG5cdFx0XHRjb25zdCBxdWlja0NoYXRIZWFkZXJMYWJlbCA9IGRvbS5hcHBlbmQocXVpY2tDaGF0SGVhZGVyUm93LCBkb20uJCgnLnNlc3Npb24td29ya3NwYWNlLXBpY2tlci1sYWJlbCcpKTtcblx0XHRcdHF1aWNrQ2hhdEhlYWRlckxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25ld0NoYXRIZWFkZXInLCBcIk5ldyBDaGF0XCIpO1xuXHRcdFx0Y29uc3QgcXVpY2tDaGF0V2l0aExhYmVsID0gZG9tLmFwcGVuZChxdWlja0NoYXRIZWFkZXJSb3csIGRvbS4kKCcuc2Vzc2lvbi13b3Jrc3BhY2UtcGlja2VyLWxhYmVsLnNlc3Npb24td29ya3NwYWNlLXBpY2tlci13aXRoLWxhYmVsJykpO1xuXHRcdFx0cXVpY2tDaGF0V2l0aExhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25ld1Nlc3Npb25XaXRoJywgXCJ3aXRoXCIpO1xuXHRcdFx0dGhpcy5fcXVpY2tDaGF0SGVhZGVyUGlja2VySG9zdCA9IGRvbS5hcHBlbmQocXVpY2tDaGF0SGVhZGVyUm93LCBkb20uJCgnLm5ldy1jaGF0LXF1aWNrLWNoYXQtaGVhZGVyLXBpY2tlci1ob3N0JykpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlckZlZWRiYWNrQmFubmVyKGNoYXRXaWRnZXRDb250ZW50KTtcblx0XHR0aGlzLl9uZXdDaGF0SW5wdXQucmVuZGVyKGNoYXRXaWRnZXRDb250ZW50LCBwYXJlbnQpO1xuXG5cdFx0Ly8gVGhlIHRpcCBsaXZlcyBpbiB0aGUgaW5wdXQncyBub3RpY2Ugc2xvdCwgc28gdGhlIHByZXNlbnRlciBpcyBjcmVhdGVkXG5cdFx0Ly8gYWZ0ZXIgdGhlIGlucHV0IGhhcyByZW5kZXJlZCBpdC5cblx0XHRjb25zdCBjaGF0VGlwQ29udGFpbmVyID0gdGhpcy5fbmV3Q2hhdElucHV0LmdldHRpbmdTdGFydGVkVGlwQ29udGFpbmVyRWxlbWVudDtcblx0XHR0aGlzLl9jaGF0VGlwUHJlc2VudGVyLnZhbHVlID0gY2hhdFRpcENvbnRhaW5lciAmJiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdElucHV0VGlwUHJlc2VudGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250YWluZXI6IGNoYXRUaXBDb250YWluZXIsXG5cdFx0XHRcdC8vIFJlc2V0IHRpcCByb3RhdGlvbiB0aGUgZmlyc3QgdGltZSB0aGlzIGNvbXBvc2VyIGJlY29tZXMgdGhlIG9ubHlcblx0XHRcdFx0Ly8gZm9yZWdyb3VuZCBzdXJmYWNlLCBzbyBhIHJldHVybmluZyB1c2VyIGdldHMgYSBmcmVzaCB0aXAuXG5cdFx0XHRcdG9uQmVmb3JlVXBkYXRlOiAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPG51bWJlcj4oQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5KSAhPT0gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5faXNDaGF0VGlwU2Vzc2lvbkluaXRpYWxpemVkID0gZmFsc2U7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghdGhpcy5faXNDaGF0VGlwU2Vzc2lvbkluaXRpYWxpemVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9pc0NoYXRUaXBTZXNzaW9uSW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5jaGF0VGlwU2VydmljZS5yZXNldFNlc3Npb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIE5vIHRpcCBpbiB0aGUgbm8tYWdlbnQtaG9zdCBlbXB0eSBzdGF0ZTogdGhlcmUgaXMgbm8gdXNhYmxlIGNvbXBvc2VyLlxuXHRcdFx0XHQvLyBUaXBzIGFsc28gc3RheSBhd2F5IHVudGlsIHRoZSB1c2VyIGhhcyBhY3R1YWxseSBzdGFydGVkIGEgY291cGxlIG9mXG5cdFx0XHRcdC8vIHNlc3Npb25zLCBzbyBhIGZpcnN0LXJ1biBjb21wb3NlciBpcyBub3QgYnVzeS5cblx0XHRcdFx0aXNFbGlnaWJsZTogKCkgPT4gIWNoYXRXaWRnZXRDb250ZW50LmNsYXNzTGlzdC5jb250YWlucygnbm8tYWdlbnQtaG9zdCcpXG5cdFx0XHRcdFx0JiYgdGhpcy5faGFzRW5vdWdoU2Vzc2lvbnNGb3JGaXJzdFJ1bk5vdGljZXMoKVxuXHRcdFx0XHRcdCYmIHRoaXMuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPG51bWJlcj4oQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5KSA9PT0gMCxcblx0XHRcdFx0Zm9jdXNJbnB1dDogKCkgPT4gdGhpcy5mb2N1c0lucHV0KCksXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fbmV3Q2hhdElucHV0Lm5vdGljZUhvc3QsXG5cdFx0KTtcblxuXHRcdC8vIFF1aWNrIGNoYXQgY29tcG9zZXI6IGhpZGUgdGhlIHdvcmtzcGFjZSBwaWNrZXIgZm9yIHdvcmtzcGFjZS1sZXNzXG5cdFx0Ly8gZHJhZnRzICh0aGVyZSBpcyBub3RoaW5nIHRvIHBpY2spIGFuZCByZWZsZWN0IGl0IGluIHRoZSBwaWNrZXItdmlzaWJsZVxuXHRcdC8vIGNvbnRleHQga2V5LiBRdWljayBjaGF0cyBhcmUgb25seSBjcmVhdGVkIG9uIGRlc2t0b3AgKHRoZSBsb2NhbCBhZ2VudFxuXHRcdC8vIGhvc3QpLCBzbyBsZWF2ZSB0aGUgd2ViIGVtcHR5LXN0YXRlIGdhdGUncyBrZXkgbWFuYWdlbWVudCB1bnRvdWNoZWQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXNRdWlja0NoYXQgPSB0aGlzLl9pc1F1aWNrQ2hhdENvbXBvc2VyLnJlYWQocmVhZGVyKTtcblx0XHRcdGNoYXRXaWRnZXRDb250ZW50LmNsYXNzTGlzdC50b2dnbGUoJ3F1aWNrLWNoYXQnLCBpc1F1aWNrQ2hhdCk7XG5cdFx0XHRpZiAoIWlzV2ViKSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlclZpc2libGVLZXkuc2V0KCFpc1F1aWNrQ2hhdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGVza3RvcCBoYXJuZXNzLXBpY2tlciBwbGFjZW1lbnQ6IGEgcXVpY2sgY2hhdCByZW5kZXJzIHRoZSBzZXNzaW9uLXR5cGVcblx0XHQvLyBwaWNrZXIgaW4gaXRzIHRvcC1vZi1pbnB1dCBoZWFkZXIgcm93OyBvdGhlcndpc2UgKGluY2x1ZGluZyBhZnRlciBhXG5cdFx0Ly8gQ21kK04gc3dhcCBvdXQgb2YgYSBxdWljayBjaGF0KSBpdCByZS1wYXJlbnRzIGludG8gdGhlIHdvcmtzcGFjZSByb3cuXG5cdFx0aWYgKCFpc1dlYiAmJiAhdGhpcy5fcmVuZGVySGFybmVzc1BpY2tlckluQ29udHJvbHMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgaXNRdWlja0NoYXQgPSB0aGlzLl9pc1F1aWNrQ2hhdENvbXBvc2VyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gaXNRdWlja0NoYXQgPyB0aGlzLl9xdWlja0NoYXRIZWFkZXJQaWNrZXJIb3N0IDogdGhpcy5fd29ya3NwYWNlUGlja2VyUm93O1xuXHRcdFx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5fbmV3Q2hhdElucHV0LnNlc3Npb25UeXBlUGlja2VyLnJlbmRlcih0YXJnZXQsIHsgY2xhc3NOYW1lOiAnc2Vzc2lvbnMtY2hhdC1zZXNzaW9uLXR5cGUtcGlja2VyJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBpbml0aWFsIHNlc3Npb24gZm9yIGFueSB3b3Jrc3BhY2UgYWxyZWFkeSBzZWxlY3RlZCBhdCBjb25zdHJ1Y3QgdGltZS5cblx0XHQvLyBJZiB0aGUgc2VsZWN0aW9uIGFycml2ZXMgbGF0ZXIgKHByb3ZpZGVyIHJlZ2lzdGVycyBhc3luY2hyb25vdXNseSksIHRoZVxuXHRcdC8vIHBpY2tlciBmaXJlcyBvbkRpZFNlbGVjdFdvcmtzcGFjZSBhbmQgb3VyIGxpc3RlbmVyIGhhbmRsZXMgaXQuXG5cdFx0Ly8gU2tpcCBpZiBhbiBhY3RpdmUgc2Vzc2lvbiBhbHJlYWR5IGV4aXN0cyAocmVzdG9yZWQgYnkgb3Blbk5ld1Nlc3Npb25cblx0XHQvLyBmcm9tIGEgbmV3LXNlc3Npb24gZHJhZnQgd2hlbiBuYXZpZ2F0aW5nIGJhY2sgZnJvbSBhbm90aGVyIHNlc3Npb24pLlxuXHRcdHRoaXMuX3NlZWRXb3Jrc3BhY2VEcmFmdCgpO1xuXG5cdFx0Ly8gUmUtc2VlZCB0aGUgd29ya3NwYWNlIGRyYWZ0IHdoZW4gdGhlIGNvbXBvc2VyIHN3YXBzIG91dCBvZiBxdWljay1jaGF0XG5cdFx0Ly8gbW9kZSAoZS5nLiBDbWQrTiBkaXNjYXJkcyBhIHF1aWNrIGNoYXQsIGxlYXZpbmcgdGhlIHJldXNlZCBjb21wb3NlclxuXHRcdC8vIHNlc3Npb24tbGVzcyk6IHdpdGhvdXQgYW4gYWN0aXZlIHNlc3Npb24gdGhlIHNlc3Npb24tdHlwZSBwaWNrZXIgaGFzIG5vXG5cdFx0Ly8gZm9sZGVyIHR5cGVzIGFuZCBoaWRlcyBpdHNlbGYsIHNvIHJlc3RvcmUgdGhlIGxhc3QgZm9sZGVyIHRvIG1hdGNoIGFcblx0XHQvLyBmcmVzaGx5LW9wZW5lZCBuZXctc2Vzc2lvbiBjb21wb3Nlci5cblx0XHRpZiAoIWlzV2ViKSB7XG5cdFx0XHRsZXQgd2FzUXVpY2tDaGF0ID0gdGhpcy5faXNRdWlja0NoYXRDb21wb3Nlci5nZXQoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgaXNRdWlja0NoYXQgPSB0aGlzLl9pc1F1aWNrQ2hhdENvbXBvc2VyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHdhc1F1aWNrQ2hhdCAmJiAhaXNRdWlja0NoYXQgJiYgIXRoaXMuX3Nlc3Npb24ucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl93b3Jrc3BhY2VQaWNrZXIucmVmcmVzaEF1dG9tYXRpY1NlbGVjdGlvbigpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZWVkV29ya3NwYWNlRHJhZnQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0d2FzUXVpY2tDaGF0ID0gaXNRdWlja0NoYXQ7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y2hhdFdpZGdldENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdyZXZlYWxlZCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQ2hhdFRpcCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0VGlwUHJlc2VudGVyLnZhbHVlPy51cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQ2hhdFRpcCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0VGlwUHJlc2VudGVyLnZhbHVlPy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzRW5vdWdoU2Vzc2lvbnNGb3JGaXJzdFJ1bk5vdGljZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKFRPVEFMX1NFU1NJT05TX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCAwKSA+PSBNSU5fU0VTU0lPTlNfRk9SX0ZJUlNUX1JVTl9OT1RJQ0VTO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlZWQgdGhlIG5ldy1zZXNzaW9uIGRyYWZ0IGZyb20gdGhlIHdvcmtzcGFjZSBwaWNrZXIncyByZXN0b3JlZCBmb2xkZXIsXG5cdCAqIHVubGVzcyBhbiBhY3RpdmUgc2Vzc2lvbiBhbHJlYWR5IGV4aXN0cyAodGhlbiBqdXN0IHN5bmMgdGhlIHBpY2tlciB0byBpdCkuXG5cdCAqL1xuXHRwcml2YXRlIF9zZWVkV29ya3NwYWNlRHJhZnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzdG9yZWRGb2xkZXJVcmkgPSB0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk7XG5cdFx0aWYgKCF0aGlzLl9zeW5jV29ya3NwYWNlUGlja2VyRnJvbUFjdGl2ZVNlc3Npb24oKSAmJiByZXN0b3JlZEZvbGRlclVyaSkge1xuXHRcdFx0dm9pZCB0aGlzLl9jcmVhdGVOZXdTZXNzaW9uKHJlc3RvcmVkRm9sZGVyVXJpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSWYgYSBuZXctc2Vzc2lvbiBkcmFmdCB3YXMgcmVzdG9yZWQgYnkge0BsaW5rIG9wZW5OZXdTZXNzaW9ufSwgc3luY1xuXHQgKiB0aGUgd29ya3NwYWNlIHBpY2tlciB0byBtYXRjaCB0aGUgc2Vzc2lvbidzIHdvcmtzcGFjZS4gVGhlIHBpY2tlciBtYXlcblx0ICogaGF2ZSByZXN0b3JlZCBhIHdvcmtzcGFjZSBmcm9tIGEgZGlmZmVyZW50IHByb3ZpZGVyIChlLmcuIHJlbW90ZSB2c1xuXHQgKiBsb2NhbCksIHNvIG92ZXJ3cml0ZSBpdCB3aXRoIHRoZSBzZXNzaW9uJ3MgYWN0dWFsIHdvcmtzcGFjZSB3aXRob3V0XG5cdCAqIGZpcmluZyB0aGUgZXZlbnQgKHdoaWNoIHdvdWxkIHRyaWdnZXIge0BsaW5rIF9vbldvcmtzcGFjZVNlbGVjdGVkfSBhbmRcblx0ICogY3JlYXRlIGEgbmV3IHNlc3Npb24pLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBgdHJ1ZWAgaWYgYW4gYWN0aXZlIHNlc3Npb24gd2FzIGZvdW5kIGFuZCB0aGUgcGlja2VyIHdhcyBzeW5jZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9zeW5jV29ya3NwYWNlUGlja2VyRnJvbUFjdGl2ZVNlc3Npb24oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbldvcmtzcGFjZSA9IGFjdGl2ZVNlc3Npb24ud29ya3NwYWNlLmdldCgpO1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IHNlc3Npb25Xb3Jrc3BhY2U/LmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0aWYgKGZvbGRlclVyaSkge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlUGlja2VyLnNldFNlbGVjdGVkV29ya3NwYWNlKGZvbGRlclVyaSwgeyBmaXJlRXZlbnQ6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5fcmVwbGFjZURyYWZ0T25VbnNlcnZhYmxlSGFybmVzcyhmb2xkZXJVcmksIGFjdGl2ZVNlc3Npb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxhY2VzIGEgcmVzdG9yZWQgZHJhZnQgd2hvc2UgaGFybmVzcyB0aGUgZm9sZGVyIGNhbiBubyBsb25nZXIgc2VydmUuXG5cdCAqIEEgZHJhZnQgb3V0bGl2ZXMgbmF2aWdhdGlvbiwgc28gaXQgY2FuIG5hbWUgYSBzZXNzaW9uIHR5cGUgdGhhdCBoYXMgc2luY2Vcblx0ICogc3RvcHBlZCBiZWluZyBhZHZlcnRpc2VkLiBLZWVwaW5nIGl0IHdvdWxkIGxlYXZlIHRoZSBjb21wb3NlciBzaG93aW5nLCBhbmRcblx0ICogc2VuZGluZyB0bywgYW4gYWdlbnQgdGhlIGhhcm5lc3MgcGlja2VyIGRvZXNuJ3QgbGlzdC4gQW4gZW1wdHkgdHlwZSBsaXN0XG5cdCAqIG1lYW5zIHRoZSBmb2xkZXIncyBwcm92aWRlcnMgaGF2ZW4ndCByZXBvcnRlZCB5ZXQgKGEgbGF0ZS1jb25uZWN0aW5nIGFnZW50XG5cdCAqIGhvc3QpLCBzbyB0aGUgZHJhZnQgaXMgbGVmdCBhbG9uZS5cblx0ICovXG5cdHByaXZhdGUgX3JlcGxhY2VEcmFmdE9uVW5zZXJ2YWJsZUhhcm5lc3MoZm9sZGVyVXJpOiBVUkksIGRyYWZ0OiBJQWN0aXZlU2Vzc2lvbik6IHZvaWQge1xuXHRcdGlmIChkcmFmdC5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGljayA9IHsgcHJvdmlkZXJJZDogZHJhZnQucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogZHJhZnQuc2Vzc2lvblR5cGUgfTtcblx0XHRpZiAodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmkpLmxlbmd0aCA9PT0gMCB8fCB0aGlzLl9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaSwgcGljaykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dm9pZCB0aGlzLl9jcmVhdGVOZXdTZXNzaW9uKGZvbGRlclVyaSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaTogVVJJLCBwaWNrOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmkpLnNvbWUodCA9PlxuXHRcdFx0KHBpY2sucHJvdmlkZXJJZCA9PT0gdW5kZWZpbmVkIHx8IHQucHJvdmlkZXJJZCA9PT0gcGljay5wcm92aWRlcklkKVxuXHRcdFx0JiYgdC5zZXNzaW9uVHlwZS5pZCA9PT0gcGljay5zZXNzaW9uVHlwZUlkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZU5ld1Nlc3Npb24oZm9sZGVyVXJpOiBVUkkpOiBQcm9taXNlPElPcGVuTmV3U2Vzc2lvblJlc3VsdD4ge1xuXHRcdHRoaXMuX3BlbmRpbmdQcmVmZXJyZWRVcGdyYWRlLmNsZWFyKCk7XG5cdFx0Y29uc3QgY3JlYXRpb25DdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBjcmVhdGlvbkxpZmVjeWNsZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiBjcmVhdGlvbkN0cy5kaXNwb3NlKHRydWUpKTtcblx0XHR0aGlzLl9uZXdTZXNzaW9uQ3JlYXRpb24udmFsdWUgPSBjcmVhdGlvbkxpZmVjeWNsZTtcblx0XHRjb25zdCB1c2VyUGljayA9IHRoaXMuX25ld0NoYXRJbnB1dC5zZXNzaW9uVHlwZVBpY2tlci5nZXRVc2VyUGlja2VkU2Vzc2lvblR5cGUoKTtcblx0XHQvLyBTZXNzaW9uIGNyZWF0aW9uIGlzIGFzeW5jLCBzbyBhIHByb3ZpZGVyIGNhbiBzdGFydCBzZXJ2aW5nIHRoZSBmb2xkZXJcblx0XHQvLyAoZS5nLiB0aGUgbG9jYWwgYWdlbnQgaG9zdCBmaW5pc2hpbmcgaXRzIGhhbmRzaGFrZSkgYmV0d2VlbiB0aGUgY2FsbFxuXHRcdC8vIGJlbG93IGFuZCB0aGUgbGlzdGVuZXIgaW5zdGFsbGVkIGFmdGVyIGl0LiBUaGF0IGNoYW5nZSB3b3VsZCBsYW5kIGluXG5cdFx0Ly8gdGhlIGdhcCBhbmQgYmUgbG9zdCwgbGVhdmluZyB0aGUgY29tcG9zZXIgd2l0aG91dCBhIGRyYWZ0IFx1MjAxNCBhbmQgd2l0aFxuXHRcdC8vIHRoZSBoYXJuZXNzIHBpY2tlciBoaWRkZW4gXHUyMDE0IHVudGlsIHRoZSB1c2VyIHJlLXBpY2tzIHRoZSB3b3Jrc3BhY2UuXG5cdFx0Ly8gUmVjb3JkIGl0IGhlcmUgc28gdGhlIGxpc3RlbmVyIGNhbiByZXBsYXkgaXQuXG5cdFx0Y29uc3QgcGVuZGluZ0NoYW5nZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgY2hhbmdlZFdoaWxlUGVuZGluZyA9IGZhbHNlO1xuXHRcdHBlbmRpbmdDaGFuZ2UuYWRkKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiBjaGFuZ2VkV2hpbGVQZW5kaW5nID0gdHJ1ZSkpO1xuXHRcdGxldCByZXN1bHQ6IElPcGVuTmV3U2Vzc2lvblJlc3VsdDtcblx0XHR0cnkge1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5fY3JlYXRlU2Vzc2lvbk5vdyhmb2xkZXJVcmksIHVzZXJQaWNrLCBjcmVhdGlvbkN0cy50b2tlbik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlbmRpbmdDaGFuZ2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpc0N1cnJlbnRDcmVhdGlvbiA9IHRoaXMuX25ld1Nlc3Npb25DcmVhdGlvbi52YWx1ZSA9PT0gY3JlYXRpb25MaWZlY3ljbGU7XG5cdFx0aWYgKGlzQ3VycmVudENyZWF0aW9uKSB7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9uQ3JlYXRpb24uY2xlYXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC50cnVzdERlY2xpbmVkKSB7XG5cdFx0XHQvLyBUaGUgdXNlciBleHBsaWNpdGx5IGRlY2xpbmVkIHRydXN0OiBkb24ndCBzY2hlZHVsZSBhIHJldHJ5LCB3aGljaFxuXHRcdFx0Ly8gd291bGQgc2lsZW50bHkgcmVjcmVhdGUgKGFuZCBwb3NzaWJseSByZS1wcm9tcHQpIHRoZSBkcmFmdCBvbmNlIGFcblx0XHRcdC8vIHByb3ZpZGVyIHJlZ2lzdGVycy9jaGFuZ2VzIHdpdGhvdXQgYW55IGZ1cnRoZXIgdXNlciBhY3Rpb24uXG5cdFx0XHR0aGlzLl9wZW5kaW5nUHJlZmVycmVkVXBncmFkZS5jbGVhcigpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Ly8gS2VlcCB0aGUgZHJhZnQgaW4gc3luYyB3aXRoIGxhdGUtcmVnaXN0ZXJpbmcgcHJvdmlkZXJzLiBBZ2VudCBob3N0c1xuXHRcdC8vIGNvbm5lY3QgbGF6aWx5LCBzbyB0aGVyZSBpcyBubyB0aW1lb3V0IFx1MjAxNCB0aGUgbGlzdGVuZXIgbGl2ZXMgdW50aWwgdGhlXG5cdFx0Ly8gZHJhZnQgaXMgc2VudCBvciByZXBsYWNlZC4gV2Ugd2F0Y2ggd2hlbjpcblx0XHQvLyAgLSBubyBwcm92aWRlciBjYW4gc2VydmUgdGhlIGZvbGRlciB5ZXQgKCFyZXN1bHQuc2Vzc2lvbiksXG5cdFx0Ly8gIC0gdGhlIHVzZXIncyBleHBsaWNpdCBwaWNrIGlzbid0IHNlcnZhYmxlIHlldCAoY3JlYXRlZCB3aXRoIGFcblx0XHQvLyAgICBmYWxsYmFjaywgdXBncmFkZSBvbmNlIGl0cyBwcm92aWRlciBjb25uZWN0cyksIG9yXG5cdFx0Ly8gIC0gdGhlcmUgaXMgbm8gZXhwbGljaXQgcGljaywgc28gdGhlIGRyYWZ0IHRyYWNrcyB0aGUgcHJlZmVycmVkXG5cdFx0Ly8gICAgKGZpcnN0KSB0eXBlLCB3aGljaCBjYW4gY2hhbmdlIGFzIHRoZSBmb2xkZXIncyBzZXNzaW9uLXR5cGUgbGlzdFxuXHRcdC8vICAgIGdyb3dzLlxuXHRcdGlmICghcmVzdWx0LnNlc3Npb24gfHwgIXVzZXJQaWNrIHx8ICF0aGlzLl9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaSwgdXNlclBpY2spKSB7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVJlY3JlYXRlT25Qcm92aWRlckNoYW5nZShmb2xkZXJVcmksIHVzZXJQaWNrLCByZXN1bHQuc2Vzc2lvbiwgY2hhbmdlZFdoaWxlUGVuZGluZyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVTZXNzaW9uTm93KGZvbGRlclVyaTogVVJJLCB1c2VyUGljazogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElPcGVuTmV3U2Vzc2lvblJlc3VsdD4ge1xuXHRcdC8vIFByZWZlciB0aGUgdXNlcidzIGV4cGxpY2l0IHBpY2sgd2hlbiBpdHMgcHJvdmlkZXIgY2FuIHNlcnZlIHRoZVxuXHRcdC8vIGZvbGRlcjsgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byB0aGUgcHJlZmVycmVkIChmaXJzdCkgc2Vzc2lvbiB0eXBlLlxuXHRcdGNvbnN0IHByZWZlcnJlZFBpY2sgPSB1c2VyUGljayAmJiB0aGlzLl9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaSwgdXNlclBpY2spXG5cdFx0XHQ/IHVzZXJQaWNrXG5cdFx0XHQ6IHRoaXMuX25ld0NoYXRJbnB1dC5zZXNzaW9uVHlwZVBpY2tlci5nZXRQcmVmZXJyZWRTZXNzaW9uVHlwZShmb2xkZXJVcmkpO1xuXHRcdC8vIEEgc2lnbmVkLW91dCB1c2VyICh1bmRlciB0aGUgY29uZGl0aW9uYWwtYXV0aCBvcHQtaW4pIGNhbid0IHJ1biBhIHR5cGVcblx0XHQvLyB0aGF0IHJlcXVpcmVzIEdpdEh1Yiwgc28gZGVmYXVsdCB0byB0aGUgZmlyc3Qgb2ZmZXJlZCB0eXBlIHVzYWJsZVxuXHRcdC8vIHdpdGhvdXQgaXQuIE5vLW9wIHdoZW4gc2lnbmVkIGluIG9yIHRoZSBvcHQtaW4gaXMgb2ZmIFx1MjAxNCB0b2RheSdzIGJlaGF2aW9yLlxuXHRcdC8vIFRPRE86IHJlY29uc2lkZXIgc2lsZW50bHkgc3dpdGNoaW5nIGF3YXkgZnJvbSB0aGUgcmVtZW1iZXJlZCBzZWxlY3Rpb247XG5cdFx0Ly8gaW5zdGVhZCBrZWVwIGl0IGFuZCBzdXJmYWNlIGFuIGlubGluZSBcInNpZ24gaW4gZm9yIHRoaXMgdHlwZVwiIGFmZm9yZGFuY2Vcblx0XHQvLyBmb3IgR2l0SHViLW9ubHkgdHlwZXMuXG5cdFx0Y29uc3QgZWZmZWN0aXZlUGljayA9IHRoaXMuX3ByZWZlclVzYWJsZVNlc3Npb25UeXBlV2hlblNpZ25lZE91dChmb2xkZXJVcmksIHByZWZlcnJlZFBpY2spO1xuXHRcdGNvbnN0IGZhbGxiYWNrUHJvdmlkZXJJZCA9IHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZFJlc29sdmVkPy5wcm92aWRlcklkO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb24oe1xuXHRcdFx0XHRmb2xkZXJVcmksXG5cdFx0XHRcdC4uLihlZmZlY3RpdmVQaWNrXG5cdFx0XHRcdFx0PyB7IHByb3ZpZGVySWQ6IGVmZmVjdGl2ZVBpY2sucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogZWZmZWN0aXZlUGljay5zZXNzaW9uVHlwZUlkIH1cblx0XHRcdFx0XHQ6IGZhbGxiYWNrUHJvdmlkZXJJZFxuXHRcdFx0XHRcdFx0PyB7IHByb3ZpZGVySWQ6IGZhbGxiYWNrUHJvdmlkZXJJZCB9XG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCksXG5cdFx0XHR9LCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIG5ldyBzZXNzaW9uOicsIGUpO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogdW5kZWZpbmVkLCB0cnVzdERlY2xpbmVkOiBmYWxzZSB9O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXaGlsZSB0aGUgdXNlciBpcyBzaWduZWQgb3V0IGFuZCB0aGUgY29uZGl0aW9uYWwtYXV0aCBvcHQtaW4gaXMgb24sIHJlcGxhY2Vcblx0ICogYSBwaWNrIHRoYXQgcmVxdWlyZXMgR2l0SHViIHdpdGggdGhlIGZpcnN0IG9mZmVyZWQgc2Vzc2lvbiB0eXBlIHVzYWJsZVxuXHQgKiB3aXRob3V0IGl0LiBBIG5vLW9wIHdoZW4gc2lnbmVkIGluLCB3aGVuIHRoZSBvcHQtaW4gaXMgb2ZmICh0b2RheSdzXG5cdCAqIGJlaGF2aW9yKSwgb3Igd2hlbiBubyBvZmZlcmVkIHR5cGUgaXMgdXNhYmxlIFx1MjAxNCBpbiB3aGljaCBjYXNlIHRoZSBjYWxsZXInc1xuXHQgKiBleGlzdGluZyBmYWxsYmFja3Mgc3RpbGwgYXBwbHkuXG5cdCAqL1xuXHRwcml2YXRlIF9wcmVmZXJVc2FibGVTZXNzaW9uVHlwZVdoZW5TaWduZWRPdXQoZm9sZGVyVXJpOiBVUkksIHBpY2s6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCk6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLmN1cnJlbnREZWZhdWx0QWNjb3VudCAhPT0gbnVsbCB8fCAhaXNBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gcGljaztcblx0XHR9XG5cdFx0Y29uc3QgdXNhYmxlID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmkpXG5cdFx0XHQuZmlsdGVyKHR5cGUgPT4gdHlwZS5zZXNzaW9uVHlwZS5hdXRoUmVxdWlyZW1lbnQgPT09IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50Lk5vbmUpO1xuXHRcdC8vIE1hdGNoIG9uIHByb3ZpZGVyIHRvbyB3aGVuIHRoZSBwaWNrIG5hbWVzIG9uZTogdHdvIHByb3ZpZGVycyBjYW4gb2ZmZXJcblx0XHQvLyB0aGUgc2FtZSBzZXNzaW9uIHR5cGUgaWQsIGFuZCBvbmx5IG9uZSBvZiB0aGVtIG1heSBiZSB1c2FibGUuXG5cdFx0Y29uc3QgcGlja0lzVXNhYmxlID0gdXNhYmxlLnNvbWUodHlwZSA9PiB0eXBlLnNlc3Npb25UeXBlLmlkID09PSBwaWNrPy5zZXNzaW9uVHlwZUlkXG5cdFx0XHQmJiAocGljaz8ucHJvdmlkZXJJZCA9PT0gdW5kZWZpbmVkIHx8IHR5cGUucHJvdmlkZXJJZCA9PT0gcGljay5wcm92aWRlcklkKSk7XG5cdFx0aWYgKHVzYWJsZS5sZW5ndGggPT09IDAgfHwgcGlja0lzVXNhYmxlKSB7XG5cdFx0XHRyZXR1cm4gcGljaztcblx0XHR9XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXJJZDogdXNhYmxlWzBdLnByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6IHVzYWJsZVswXS5zZXNzaW9uVHlwZS5pZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVSZWNyZWF0ZU9uUHJvdmlkZXJDaGFuZ2UoZm9sZGVyVXJpOiBVUkksIHVzZXJQaWNrOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQsIGNyZWF0ZWQ6IElTZXNzaW9uIHwgdW5kZWZpbmVkLCByZXBsYXlNaXNzZWRDaGFuZ2U6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzKCgpID0+IHRoaXMuX3JlY3JlYXRlT25Qcm92aWRlckNoYW5nZShmb2xkZXJVcmksIHVzZXJQaWNrLCBjcmVhdGVkKSkpO1xuXHRcdHRoaXMuX3BlbmRpbmdQcmVmZXJyZWRVcGdyYWRlLnZhbHVlID0gc3RvcmU7XG5cdFx0aWYgKHJlcGxheU1pc3NlZENoYW5nZSkge1xuXHRcdFx0dGhpcy5fcmVjcmVhdGVPblByb3ZpZGVyQ2hhbmdlKGZvbGRlclVyaSwgdXNlclBpY2ssIGNyZWF0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY3JlYXRlT25Qcm92aWRlckNoYW5nZShmb2xkZXJVcmk6IFVSSSwgdXNlclBpY2s6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCwgY3JlYXRlZDogSVNlc3Npb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoY3JlYXRlZCkge1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHRcdGlmIChhY3RpdmU/LnNlc3Npb25JZCAhPT0gY3JlYXRlZC5zZXNzaW9uSWQgfHwgYWN0aXZlLmlzQ3JlYXRlZC5nZXQoKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHRoZSBkcmFmdCB3YXMgc2VudCBvciBpcyBubyBsb25nZXIgdGhlIGFjdGl2ZSBzZXNzaW9uXG5cdFx0XHR9XG5cdFx0XHRpZiAodXNlclBpY2spIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaSwgdXNlclBpY2spKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyB0aGUgcHJlZmVycmVkIHByb3ZpZGVyIHN0aWxsIGNhbm5vdCBzZXJ2ZSB0aGUgZm9sZGVyXG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE5vIGV4cGxpY2l0IHBpY2s6IGtlZXAgdGhlIGRyYWZ0IG9uIHRoZSBwcmVmZXJyZWQgKGZpcnN0KVxuXHRcdFx0XHQvLyB0eXBlLiBSZWNyZWF0ZSBvbmx5IHdoZW4gdGhhdCBwcmVmZXJyZWQgYWN0dWFsbHkgY2hhbmdlZC5cblx0XHRcdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5fbmV3Q2hhdElucHV0LnNlc3Npb25UeXBlUGlja2VyLmdldFByZWZlcnJlZFNlc3Npb25UeXBlKGZvbGRlclVyaSk7XG5cdFx0XHRcdGlmICghcHJlZmVycmVkIHx8IChwcmVmZXJyZWQucHJvdmlkZXJJZCA9PT0gYWN0aXZlLnByb3ZpZGVySWQgJiYgcHJlZmVycmVkLnNlc3Npb25UeXBlSWQgPT09IGFjdGl2ZS5zZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dm9pZCB0aGlzLl9jcmVhdGVOZXdTZXNzaW9uKGZvbGRlclVyaSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgd29ya3NwYWNlIFVSSSBmb3IgdGhlIGNvbnRleHQgcGlja2VyIGJhc2VkIG9uIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBzZWxlY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRDb250ZXh0Rm9sZGVyVXJpKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEZvbGRlclVyaTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcldvcmtzcGFjZVBpY2tlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlclZpc2libGVLZXkuc2V0KHRydWUpO1xuXHRcdGNvbnN0IHBpY2tlcnNSb3cgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9uLXdvcmtzcGFjZS1waWNrZXInKSk7XG5cdFx0Y29uc3QgcGlja2Vyc0xhYmVsID0gZG9tLmFwcGVuZChwaWNrZXJzUm93LCBkb20uJCgnLnNlc3Npb24td29ya3NwYWNlLXBpY2tlci1sYWJlbCcpKTtcblx0XHRwaWNrZXJzTGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmlcblx0XHRcdD8gbG9jYWxpemUoJ25ld1Nlc3Npb25JbicsIFwiTmV3IHNlc3Npb24gaW5cIilcblx0XHRcdDogbG9jYWxpemUoJ25ld1Nlc3Npb25DaG9vc2VXb3Jrc3BhY2UnLCBcIlN0YXJ0IGJ5IHBpY2tpbmcgYVwiKTtcblxuXHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlci5yZW5kZXIocGlja2Vyc1Jvdyk7XG5cblx0XHRpZiAoIXRoaXMuX3JlbmRlckhhcm5lc3NQaWNrZXJJbkNvbnRyb2xzKSB7XG5cdFx0XHRjb25zdCB3aXRoTGFiZWwgPSBkb20uYXBwZW5kKHBpY2tlcnNSb3csIGRvbS4kKCcuc2Vzc2lvbi13b3Jrc3BhY2UtcGlja2VyLWxhYmVsLnNlc3Npb24td29ya3NwYWNlLXBpY2tlci13aXRoLWxhYmVsJykpO1xuXHRcdFx0d2l0aExhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25ld1Nlc3Npb25XaXRoJywgXCJ3aXRoXCIpO1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlUGlja2VyUm93ID0gcGlja2Vyc1Jvdztcblx0XHRcdC8vIE9uIHdlYiB0aGUgY29tcG9zZXIgaXMgbmV2ZXIgYSBxdWljayBjaGF0LCBzbyBrZWVwIHRoZSBoYXJuZXNzXG5cdFx0XHQvLyBwaWNrZXIgaW5saW5lIGluIHRoZSB3b3Jrc3BhY2Ugcm93LiBPbiBkZXNrdG9wIHRoZSBwbGFjZW1lbnQgaXNcblx0XHRcdC8vIHJlYWN0aXZlIChjb250cm9scyByb3cgZm9yIHF1aWNrIGNoYXRzKSBcdTIwMTQgc2VlIHRoZSByZW5kZXIoKSBhdXRvcnVuLlxuXHRcdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRcdHRoaXMuX25ld0NoYXRJbnB1dC5zZXNzaW9uVHlwZVBpY2tlci5yZW5kZXIocGlja2Vyc1JvdywgeyBjbGFzc05hbWU6ICdzZXNzaW9ucy1jaGF0LXNlc3Npb24tdHlwZS1waWNrZXInIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlUGlja2VyLm9uRGlkU2VsZWN0V29ya3NwYWNlKCgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEZvbGRlclVyaTtcblx0XHRcdHBpY2tlcnNMYWJlbC50ZXh0Q29udGVudCA9IGZvbGRlclVyaVxuXHRcdFx0XHQ/IGxvY2FsaXplKCduZXdTZXNzaW9uSW4nLCBcIk5ldyBzZXNzaW9uIGluXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ25ld1Nlc3Npb25DaG9vc2VXb3Jrc3BhY2UnLCBcIlN0YXJ0IGJ5IHBpY2tpbmcgYVwiKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckVtcHR5U3RhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXJWaXNpYmxlS2V5LnNldChmYWxzZSk7XG5cdFx0Y29uc3QgZW1wdHlTdGF0ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm9BZ2VudEhvc3RFbXB0eVN0YXRlKTtcblx0XHRlbXB0eVN0YXRlLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHRoaXMuX2FjdGl2ZUVtcHR5U3RhdGUgPSBlbXB0eVN0YXRlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVFbXB0eVN0YXRlID09PSBlbXB0eVN0YXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlRW1wdHlTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbXB0eVN0YXRlLmRpc3Bvc2UoKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXZWItb25seTogaG9zdHMgdGhlIHdvcmtzcGFjZSBwaWNrZXIsIGJ1dCBzd2FwcyBpdCBvdXQgZm9yIHRoZVxuXHQgKiBuby1hZ2VudC1ob3N0IGVtcHR5IHN0YXRlIG9uY2Ugd2UgYXJlICpzdXJlKiB0aGVyZSBhcmUgbm8gaG9zdHMgXHUyMDE0XG5cdCAqIGkuZS4gYWZ0ZXIgYSBkaXNjb3ZlcnkgY3ljbGUgaGFzIGNvbXBsZXRlZC4gUmVuZGVyaW5nIHRoZSBlbXB0eVxuXHQgKiBzdGF0ZSBiZWZvcmUgZGlzY292ZXJ5IGhhcyBydW4gd291bGQgYnJpZWZseSBmbGFzaCBpdCBhdCB1c2VycyB3aG9cblx0ICogYWN0dWFsbHkgaGF2ZSBob3N0cyB0aGF0IGp1c3QgaGF2ZW4ndCBiZWVuIGRpc2NvdmVyZWQgeWV0IChlLmcuXG5cdCAqIGNhY2hlZCB0dW5uZWxzIHJlc29sdmVkIG9uIHN0YXJ0dXApLiBVbnRpbCB0aGVuIHdlIGtlZXAgdGhlIHJlZ3VsYXJcblx0ICogd29ya3NwYWNlIHBpY2tlciwgd2hpY2ggaGFzIGl0cyBvd24gbG9hZGluZyBhZmZvcmRhbmNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyRW1wdHlTdGF0ZUdhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgY2hhdFdpZGdldENvbnRlbnQ6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHBpY2tlclNsb3QgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9uLXdvcmtzcGFjZS1waWNrZXItc2xvdCcpKTtcblx0XHRjb25zdCBzdGF0ZURpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRcdGNvbnN0IHNob3dQaWNrZXIgPSAoKSA9PiB7XG5cdFx0XHRjaGF0V2lkZ2V0Q29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCduby1hZ2VudC1ob3N0Jyk7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHBpY2tlclNsb3QpO1xuXHRcdFx0c3RhdGVEaXNwb3NhYmxlcy52YWx1ZSA9IHRoaXMuX3JlbmRlcldvcmtzcGFjZVBpY2tlcihwaWNrZXJTbG90KTtcblx0XHRcdHRoaXMuX3JlbmRlckNoYXRUaXAoKTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2hvd0VtcHR5U3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRjaGF0V2lkZ2V0Q29udGVudC5jbGFzc0xpc3QuYWRkKCduby1hZ2VudC1ob3N0Jyk7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHBpY2tlclNsb3QpO1xuXHRcdFx0c3RhdGVEaXNwb3NhYmxlcy52YWx1ZSA9IHRoaXMuX3JlbmRlckVtcHR5U3RhdGUocGlja2VyU2xvdCk7XG5cdFx0XHR0aGlzLl9jbGVhckNoYXRUaXAoKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZmlsdGVyID0gdGhpcy5hZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlO1xuXHRcdGxldCBoYXNDb21wbGV0ZWREaXNjb3ZlcnkgPSBmaWx0ZXIuaG9zdHMubGVuZ3RoID4gMDtcblxuXHRcdC8vIElmIG5vIGRpc2NvdmVyeSBjeWNsZSBpcyBpbiBmbGlnaHQgb3IgaGFzIGNvbXBsZXRlZCB5ZXQsIGtpY2sgb25lXG5cdFx0Ly8gb2ZmIHNvIHRoZSBlbXB0eSBzdGF0ZSBjYW4gcmVzb2x2ZSBpbiBhIGJvdW5kZWQgdGltZS4gVGhlXG5cdFx0Ly8gYHR1bm5lbEFnZW50SG9zdC5jb250cmlidXRpb25gIGFscmVhZHkgdHJpZ2dlcnMgYSBzdGFydHVwXG5cdFx0Ly8gcmVkaXNjb3ZlciwgYnV0IGluIHRoZSAocmFyZSkgY2FzZSB0aGUgdmlldyBtb3VudHMgYmVmb3JlIHRoZVxuXHRcdC8vIGNvbnRyaWJ1dGlvbiBnZXRzIGEgY2hhbmNlLCB0aGlzIHByZXZlbnRzIHRoZSB1c2VyIGZyb20gYmVpbmdcblx0XHQvLyBzdHVjayBvbiBhIHBpY2tlciB0aGF0IG5ldmVyIGdldHMgcG9wdWxhdGVkLlxuXHRcdGlmICghaGFzQ29tcGxldGVkRGlzY292ZXJ5ICYmICFmaWx0ZXIuaXNEaXNjb3ZlcmluZykge1xuXHRcdFx0ZmlsdGVyLnJlZGlzY292ZXIoKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAoaGFzQ29tcGxldGVkRGlzY292ZXJ5ICYmICFmaWx0ZXIuaXNEaXNjb3ZlcmluZyAmJiBmaWx0ZXIuaG9zdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHNob3dFbXB0eVN0YXRlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzaG93UGlja2VyKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHVwZGF0ZSgpO1xuXG5cdFx0Ly8gYG9uRGlkQ2hhbmdlYCBmaXJlcyB3aGVuIHRoZSBob3N0IGxpc3QgY2hhbmdlcyBcdTIwMTQgZW50ZXJpbmcgb3Jcblx0XHQvLyBsZWF2aW5nIHRoZSBlbXB0eSBzdGF0ZSBpZiB0aGUgbGFzdCBob3N0IGRpc2Nvbm5lY3RzIG9yIHRoZVxuXHRcdC8vIGZpcnN0IGhvc3QgYXBwZWFycy5cblx0XHRzdG9yZS5hZGQoZmlsdGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmIChmaWx0ZXIuaG9zdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRoYXNDb21wbGV0ZWREaXNjb3ZlcnkgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dXBkYXRlKCk7XG5cdFx0fSkpO1xuXHRcdC8vIGBvbkRpZENoYW5nZURpc2NvdmVyaW5nYCBmaXJlcyBvbiBkaXNjb3Zlcnkgc3RhcnQgKmFuZCogZW5kOyB3ZVxuXHRcdC8vIHRyZWF0IGFueSB0cmFuc2l0aW9uIG91dCBvZiBkaXNjb3ZlcmluZyBhcyBoYXZpbmcgY29tcGxldGVkIGF0XG5cdFx0Ly8gbGVhc3Qgb25lIGN5Y2xlLlxuXHRcdHN0b3JlLmFkZChmaWx0ZXIub25EaWRDaGFuZ2VEaXNjb3ZlcmluZygoKSA9PiB7XG5cdFx0XHRpZiAoIWZpbHRlci5pc0Rpc2NvdmVyaW5nKSB7XG5cdFx0XHRcdGhhc0NvbXBsZXRlZERpc2NvdmVyeSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHR1cGRhdGUoKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHQvLyAtLS0gU2VuZCAtLS1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kKHF1ZXJ5OiBzdHJpbmcsIGF0dGFjaGVkQ29udGV4dD86IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSwgYmFja2dyb3VuZD86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zaG93UGlja2VyKCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGZlZWRiYWNrSXRlbXMgPSBbLi4udGhpcy5fZmVlZGJhY2tJdGVtcy5nZXQoKV07XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdHMgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKT8uZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci5yb290KVxuXHRcdFx0Pz8gKHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEZvbGRlclVyaSA/IFt0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmldIDogW10pO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBidWlsZE5ld1Nlc3Npb25Qcm9tcHQocXVlcnksIGZlZWRiYWNrSXRlbXMsIHdvcmtzcGFjZVJvb3RzKTtcblxuXHRcdC8vIENhcHR1cmUgdGhlIGNvbXBvc2VyJ3Mgd29ya3NwYWNlIHNlbGVjdGlvbiBiZWZvcmUgdGhlIHNlbmQ6IGFcblx0XHQvLyBiYWNrZ3JvdW5kIHNlbmQgY29uc3VtZXMgdGhlIGluLWZsaWdodCBuZXcgc2Vzc2lvbiBhbmQgcmVzZXRzIHRoZVxuXHRcdC8vIG5ldy1zZXNzaW9uIHZpZXcsIHNvIHdlIHJlLXNlZWQgYSBmcmVzaCBwZW5kaW5nIHNlc3Npb24gYWZ0ZXJ3YXJkc1xuXHRcdC8vIChzZWUgYmVsb3cpIHRvIGtlZXAgdGhlIGNvbXBvc2VyJ3MgcGlja2VycyBmdW5jdGlvbmFsLiBRdWljayBjaGF0c1xuXHRcdC8vIGhhdmUgbm8gd29ya3NwYWNlLCBzbyB0aGV5IHJlLXNlZWQgdmlhIG9wZW5RdWlja0NoYXQgaW5zdGVhZC5cblx0XHRjb25zdCB3YXNRdWlja0NoYXQgPSB0aGlzLl9pc1F1aWNrQ2hhdENvbXBvc2VyLmdldCgpO1xuXHRcdGNvbnN0IHJlc2VlZEZvbGRlclVyaSA9IGJhY2tncm91bmQgJiYgIXdhc1F1aWNrQ2hhdCA/IHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEZvbGRlclVyaSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZW5kT3B0aW9ucyA9IHsgcXVlcnk6IHJlcXVlc3QsIGF0dGFjaGVkQ29udGV4dCwgYmFja2dyb3VuZCB9O1xuXHRcdGNvbnN0IGNsZWFyRmVlZGJhY2sgPSAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZmVlZGJhY2tJdGVtcykge1xuXHRcdFx0XHR0aGlzLmFnZW50RmVlZGJhY2tTZXJ2aWNlLnJlbW92ZUZlZWRiYWNrKEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLCBpdGVtLmlkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdC8vIEEgYmFja2dyb3VuZCBzZW5kIGlzIGZpcmUtYW5kLWZvcmdldCBhbmQgdGhlIGNvbXBvc2VyIGltbWVkaWF0ZWx5IHJlc2VlZHNcblx0XHQvLyBmb3IgdGhlIG5leHQgb25lLCBzbyBzZXZlcmFsIGNhbiBiZSBpbiBmbGlnaHQgYXQgb25jZS4gRWFjaCBpcyB0cmFja2VkXG5cdFx0Ly8gc2VwYXJhdGVseSwga2V5ZWQgYnkgdGhlIG9wdGlvbnMgb2JqZWN0IGl0IHdhcyBzdGFydGVkIHdpdGgsIHNvIG9uZVxuXHRcdC8vIHNlbmQncyBvdXRjb21lIG5ldmVyIGNsZWFycyBhbm90aGVyJ3MgY29tbWVudHMuXG5cdFx0aWYgKGJhY2tncm91bmQpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdCYWNrZ3JvdW5kU2VuZHMuc2V0KHNlbmRPcHRpb25zLCBFdmVudC5vbmNlKFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkU2VuZFJlcXVlc3QsIGV2ZW50ID0+IGV2ZW50Lm9wdGlvbnMgPT09IHNlbmRPcHRpb25zKVxuXHRcdFx0KSgoKSA9PiB7XG5cdFx0XHRcdGNsZWFyRmVlZGJhY2soKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0JhY2tncm91bmRTZW5kcy5kZWxldGVBbmREaXNwb3NlKHNlbmRPcHRpb25zKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNlbmROZXdDaGF0UmVxdWVzdChzZXNzaW9uLCBzZW5kT3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0JhY2tncm91bmRTZW5kcy5kZWxldGVBbmREaXNwb3NlKHNlbmRPcHRpb25zKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHNlbmQgcmVxdWVzdDonLCBlKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWJhY2tncm91bmQpIHtcblx0XHRcdGNsZWFyRmVlZGJhY2soKTtcblx0XHR9XG5cblx0XHQvLyBBIGJhY2tncm91bmQgc2VuZCBncmFkdWF0ZWQgdGhlIGNvbXBvc2VyJ3MgaW4tZmxpZ2h0IHNlc3Npb24gYW5kXG5cdFx0Ly8gcmV0dXJuZWQgdGhlIHZpZXcgdG8gYSBmcmVzaCAoYnV0IHNlc3Npb24tbGVzcykgbmV3LXNlc3Npb24gY29tcG9zZXIuXG5cdFx0Ly8gVGhlIHNlbmQgbm93IGNvbW1pdHMgaW4gdGhlIGJhY2tncm91bmQsIHNvIHJlc2VlZCBhIHJlcGxhY2VtZW50IGRyYWZ0XG5cdFx0Ly8gaW1tZWRpYXRlbHkgXHUyMDE0IHByb3ZpZGVycyBhcmUgbXVsdGktbmV3LXNlc3Npb24gYXdhcmUsIHNvIHRoZSBncmFkdWF0aW5nXG5cdFx0Ly8gc2Vzc2lvbiBhbmQgdGhpcyBuZXcgZHJhZnQgY29leGlzdC4gVGhpcyByZXN0b3JlcyB0aGVcblx0XHQvLyBzZXNzaW9uLXR5cGUvbW9kZWwgcGlja2VycyBmb3IgdGhlIG5leHQgbWVzc2FnZS5cblx0XHRpZiAoYmFja2dyb3VuZCkge1xuXHRcdFx0aWYgKHdhc1F1aWNrQ2hhdCkge1xuXHRcdFx0XHR0aGlzLnNlc3Npb25zU2VydmljZS5vcGVuUXVpY2tDaGF0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc2VlZEZvbGRlclVyaSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jcmVhdGVOZXdTZXNzaW9uKHJlc2VlZEZvbGRlclVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyRmVlZGJhY2tCYW5uZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGhvc3QgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9uLWlucHV0LWJhbm5lcnMubmV3LXNlc3Npb24tZmVlZGJhY2stYmFubmVycycpKTtcblx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZmVlZGJhY2tJdGVtcyA9IHRoaXMuX2ZlZWRiYWNrSXRlbXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29udGVudC5jbGVhcigpO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZShob3N0KTtcblx0XHRcdGlmICghZmVlZGJhY2tJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0c2V0Q2hhdElucHV0U3RhY2tTbG90KGhvc3QsIENoYXRJbnB1dFN0YWNrU2xvdC5FbXB0eSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY291bnQgPSBmZWVkYmFja0l0ZW1zLmxlbmd0aDtcblx0XHRcdGNvbnN0IHRleHQgPSBjb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCduZXdTZXNzaW9uRmVlZGJhY2sub25lJywgXCIxIGNvbW1lbnRcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbmV3U2Vzc2lvbkZlZWRiYWNrLm1hbnknLCBcInswfSBjb21tZW50c1wiLCBjb3VudCk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnRlbnQudmFsdWUgPSBzdG9yZTtcblx0XHRcdGNvbnN0IGJhbm5lciA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25JbnB1dEJhbm5lcldpZGdldCwge1xuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uLFxuXHRcdFx0XHRhY2NlbnQ6IGZhbHNlLFxuXHRcdFx0XHR0ZXh0LFxuXHRcdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHRcdGFjdGlvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCduZXdTZXNzaW9uRmVlZGJhY2sucmV2ZWFsJywgXCJSZXZlYWxcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmFnZW50RmVlZGJhY2tTZXJ2aWNlLnJldmVhbEZlZWRiYWNrKEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLCBmZWVkYmFja0l0ZW1zWzBdLmlkKSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KSk7XG5cdFx0XHRob3N0LmFwcGVuZENoaWxkKGJhbm5lci5kb21Ob2RlKTtcblx0XHRcdC8vIERvY2tzIHRvIHRoZSBjb21wb3NlciBiZWxvdyBpdC5cblx0XHRcdHNldENoYXRJbnB1dFN0YWNrU2xvdChob3N0LCBDaGF0SW5wdXRTdGFja1Nsb3QuRG9ja2VkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3Q2hhdElucHV0LnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0bGF5b3V0KF9oZWlnaHQ6IG51bWJlciwgX3dpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9uZXdDaGF0SW5wdXQubGF5b3V0KF9oZWlnaHQsIF93aWR0aCk7XG5cdH1cblxuXHRmb2N1c0lucHV0KCk6IHZvaWQge1xuXHRcdC8vIFdoaWxlIHRoZSBlbXB0eSBzdGF0ZSBpcyBtb3VudGVkLCB0aGUgY2hhdCBpbnB1dCBpcyBoaWRkZW4gdmlhXG5cdFx0Ly8gQ1NTIChgLm5vLWFnZW50LWhvc3RgIG9uIGAubmV3LWNoYXQtd2lkZ2V0LWNvbnRlbnRgKSBzbyBmb2N1c2luZ1xuXHRcdC8vIGl0IHdvdWxkIGp1c3Qgc2VuZCBmb2N1cyB0byA8Ym9keT4uIExhbmQgb24gdGhlIGVtcHR5IHN0YXRlJ3Ncblx0XHQvLyBoZWFkaW5nIGluc3RlYWQgc28gdGhlIHVzZXIgaGFzIGEgdmlzaWJsZSBmb2N1cyB0YXJnZXQuXG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUVtcHR5U3RhdGUpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUVtcHR5U3RhdGUuZm9jdXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbmV3Q2hhdElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyBhIHdvcmtzcGFjZSBzZWxlY3Rpb24gZnJvbSB0aGUgd29ya3NwYWNlIHBpY2tlciBhbmQgY3JlYXRlcyBhXG5cdCAqIG5ldyBzZXNzaW9uIGZvciBpdC4gV29ya3NwYWNlIHRydXN0ICh3aGVuIHJlcXVpcmVkKSBpcyByZXF1ZXN0ZWQgYnlcblx0ICoge0BsaW5rIElTZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb259IGl0c2VsZiBcdTIwMTQgYSBzaW5nbGUgZ2F0ZSBzaGFyZWRcblx0ICogYnkgZXZlcnkgcGF0aCB0aGF0IGNyZWF0ZXMgYSBjb25jcmV0ZSBzZXNzaW9uIGZvciBhIGZvbGRlci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX29uV29ya3NwYWNlU2VsZWN0ZWQoZm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCB1cGdyYWRlIGZvciBhIHByZXZpb3VzIHNlbGVjdGlvbi5cblx0XHR0aGlzLl9wZW5kaW5nUHJlZmVycmVkVXBncmFkZS5jbGVhcigpO1xuXHRcdGNvbnN0IGN1cnJlbnRGb2xkZXJVcmkgPSB0aGlzLl9zZXNzaW9uLmdldCgpPy53b3Jrc3BhY2UuZ2V0KCk/LmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0Y29uc3QgcmVmcmVzaGluZ1Byb21wdE9wdGlvbnMgPSAhIWN1cnJlbnRGb2xkZXJVcmlcblx0XHRcdCYmICghZm9sZGVyVXJpIHx8ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChjdXJyZW50Rm9sZGVyVXJpLCBmb2xkZXJVcmkpKVxuXHRcdFx0JiYgdGhpcy5fbmV3Q2hhdElucHV0LnByZXBhcmVQcm9tcHRPcHRpb25zUmVmcmVzaCgpO1xuXG5cdFx0aWYgKCFmb2xkZXJVcmkpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLnVuc2V0TmV3U2Vzc2lvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fY3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmkpO1xuXHRcdGlmIChyZWZyZXNoaW5nUHJvbXB0T3B0aW9ucyAmJiAhcmVzdWx0LnNlc3Npb24pIHtcblx0XHRcdHRoaXMuX25ld0NoYXRJbnB1dC5zaG93UHJvbXB0T3B0aW9ucyh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0LnRydXN0RGVjbGluZWQpIHtcblx0XHRcdC8vIERvbid0IGxlYXZlIHRoZSBwaWNrZXIgc2hvd2luZyB0aGUgZGVjbGluZWQgZm9sZGVyIGFzIHNlbGVjdGVkLlxuXHRcdFx0dGhpcy5fd29ya3NwYWNlUGlja2VyLnJlbW92ZUZyb21SZWNlbnRzKGZvbGRlclVyaSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFByb21wdE9wdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX25ld0NoYXRJbnB1dC5yZWZyZXNoUHJvbXB0T3B0aW9ucygpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byByZWZyZXNoIG5ldy1zZXNzaW9uIHByb21wdCBvcHRpb25zOicsIGVycm9yKTtcblx0XHRcdHRoaXMuX25ld0NoYXRJbnB1dC5zaG93UHJvbXB0T3B0aW9ucyh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByZWZpbGxJbnB1dCh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9uZXdDaGF0SW5wdXQucHJlZmlsbElucHV0KHRleHQpO1xuXHR9XG5cblx0c2V0SG9zdFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2FxdWFyaXVtVG9nZ2xlPy5zZXRIb3N0VmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdHNlbmRRdWVyeSh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9uZXdDaGF0SW5wdXQuc2VuZFF1ZXJ5KHRleHQpO1xuXHR9XG5cblx0c3VibWl0SW5wdXQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLl9zZXNzaW9uLmdldCgpKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2hvd1BpY2tlcigpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9uZXdDaGF0SW5wdXQuc3VibWl0KCk7XG5cdH1cblxuXHRhdHRhY2godXJpczogVVJJW10pOiB2b2lkIHtcblx0XHR0aGlzLl9uZXdDaGF0SW5wdXQuYXR0YWNoKHVyaXMpO1xuXHR9XG5cblx0c2VsZWN0V29ya3NwYWNlKGZvbGRlclVyaTogVVJJLCBwcm92aWRlcklkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3NwYWNlUGlja2VyLnNldFNlbGVjdGVkV29ya3NwYWNlKGZvbGRlclVyaSwgeyBwcm92aWRlcklkIH0pO1xu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
