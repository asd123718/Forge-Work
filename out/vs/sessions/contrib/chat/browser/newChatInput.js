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
import "./media/chatInput.css";
import "./media/chatInputMobile.css";
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { Schemas } from "../../../../base/common/network.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../editor/common/config/fontInfo.js";
import { EditorOptions } from "../../../../editor/common/config/editorOptions.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { CopyPasteController } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { PlaceholderTextContribution } from "../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { AccessibilityVerbositySettingId } from "../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../../../workbench/contrib/accessibility/common/accessibilityCommands.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { ContextMenuController } from "../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { getSimpleEditorOptions } from "../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js";
import { NewChatContextAttachments } from "./newChatContextAttachments.js";
import { ChatDragAndDrop } from "../../../../workbench/contrib/chat/browser/widget/chatDragAndDrop.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from "../../../../workbench/common/theme.js";
import { inactiveSessionViewBackground, inactiveSessionViewForeground } from "../../../common/theme.js";
import { INewChatVoiceTargetService, isNewChatVoiceSessionActive, NEW_CHAT_VOICE_SENTINEL, NewChatVoiceController } from "./newChatVoice.js";
import { MobileSessionTypePicker } from "./mobile/mobileSessionTypePicker.js";
import { installMobileChipLaneScroll } from "../../../browser/parts/mobile/mobileChipLaneScroll.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { Menus } from "../../../browser/menus.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { getDictationHoverMarkdown } from "../../../../workbench/contrib/chat/browser/speechToText/micButtonHovers.js";
import { addMicButtonContextMenuListener, getDictationContextMenuActions } from "../../../../workbench/contrib/chat/browser/speechToText/micButtonMenuActions.js";
import { SlashCommandHandler } from "./slashCommands.js";
import { VariableCompletionHandler } from "./variableCompletions.js";
import { SessionReferenceCompletionHandler } from "./sessionReferenceCompletions.js";
import { AgentHostInputCompletionHandler } from "./agentHostInputCompletions.js";
import { IChatRequestVariableEntry, isExplicitFileOrImageVariableEntry, toFileVariableEntry } from "../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js";
import { IChatSessionsService } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../workbench/contrib/chat/common/constants.js";
import { ChatHistoryNavigator } from "../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js";
import { registerAndCreateHistoryNavigationContext } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { autorun, constObservable, derived, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ChatInputNotificationWidget } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationWidget.js";
import { ChatInputNoticeHost, ChatInputNoticeLane } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js";
import { registerChatInputOnboardingHosts } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputOnboardingHosts.js";
import { IChatInputNoticeHubService } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHub.js";
import { chatInputStackClass, chatInputStackSlotClass, ChatInputStackSlot, refreshChatInputStack, setChatInputStackSlot } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js";
import { IChatSubmitRequestHandlerService } from "../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js";
import { INewChatModelPickerService, NewChatModelPickerService } from "./newChatModelPicker.js";
import { ModelPicker, ModelPickerActionViewItem } from "./modelPicker.js";
import { ISessionModelSelectionModel, SessionModelSelectionModel } from "./sessionModelSelectionModel.js";
import { ISessionContext, SessionContext } from "../../../services/sessions/browser/sessionContext.js";
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from "./sessionsChatHistory.js";
import { IChatStatusItemService } from "../../../../workbench/contrib/chat/browser/chatStatus/chatStatusItemService.js";
import { handleTerminalCommandPaste, isTerminalCommandInput } from "../../../../workbench/contrib/chat/browser/chatTerminalCommandPaste.js";
import { IChatPasteTargetService } from "../../../../workbench/contrib/chat/browser/chat.js";
import { NewChatInputPasteTarget } from "./newChatInputPasteTarget.js";
import { getChatSessionType } from "../../../../workbench/contrib/chat/common/model/chatUri.js";
import { ChatSpeechToTextState, DictationSettingId, IChatSpeechToTextService, isDictationActiveOnSurface } from "../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js";
import { setupDictationMicGlow } from "../../../../workbench/contrib/chat/browser/speechToText/dictationMicGlow.js";
import { IDictationOnboardingService } from "../../../../workbench/contrib/chat/browser/speechToText/dictationOnboarding.js";
import { ChatVoiceInputModeAction, VoiceInputModeActionViewItem } from "../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputModeActionViewItem.js";
import { IVoiceInputModeService } from "../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js";
import { toAction } from "../../../../base/common/actions.js";
import { runDictationShortcut } from "../../../../workbench/contrib/chat/browser/actions/chatSpeechToTextActions.js";
import { notifyDictationSubmitted } from "../../../../workbench/contrib/chat/browser/speechToText/dictationSession.js";
import { combineVoiceInput } from "../../../../workbench/contrib/chat/browser/voiceClient/voiceInputUtils.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { DictationDownloadRing, getDictationDownloadHoverMarkdown, getDictationPreparingLabel } from "../../../../workbench/contrib/chat/browser/speechToText/dictationDownloadRing.js";
import { IVoiceSessionController } from "../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js";
import { ChatPetWidget } from "../../../../workbench/contrib/chat/browser/widget/chatPetWidget.js";
import { IVoiceModeOnboardingService } from "../../../../workbench/contrib/agentsVoice/browser/voiceModeOnboarding.js";
import { AGENTS_VOICE_ENABLED } from "../../../../workbench/contrib/agentsVoice/common/agentsVoice.js";
import { animatePromptTyping } from "./promptTypingAnimation.js";
import { PromptTemplatePlaceholderController } from "./promptTemplatePlaceholder.js";
import { NEW_SESSION_PROMPT_TYPING_DURATION_MS } from "./newSessionComposerService.js";
import { NewSessionPromptOptionsWidget } from "./newSessionPromptOptions.js";
const OPEN_OTEL_SETTINGS_COMMAND = "github.copilot.chat.otel.openSettings";
const OTEL_STATUS_COMMAND = "github.copilot.chat.otel.statusActive";
const OTEL_STATUS_ENTRY_ID = "copilot.otelStatus";
const OTEL_DOCS_URL = "https://code.visualstudio.com/docs/agents/guides/monitoring-agents";
const STORAGE_KEY_DRAFT_STATE = "sessions.draftState";
const MIN_EDITOR_HEIGHT = 50;
const MAX_EDITOR_HEIGHT = 200;
const NEW_CHAT_INPUT_FONT_FAMILY = "system-ui, -apple-system, sans-serif";
const SessionsChatInputHasDictationFocus = new RawContextKey("sessionsChatInputHasDictationFocus", false, localize("sessionsChatInputHasDictationFocus", "True when focus is in an Agents window chat composer that supports dictation."));
const TOGGLE_DICTATION_COMMAND_ID = "sessions.action.chat.toggleDictation";
let activeDictationComposer;
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: TOGGLE_DICTATION_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: ContextKeyExpr.and(
    SessionsChatInputHasDictationFocus,
    ContextKeyExpr.has(ChatContextKeys.speechToTextConfigured.key)
  ),
  primary: KeyMod.CtrlCmd | KeyCode.KeyI,
  handler: () => activeDictationComposer?.toggleDictation()
});
KeybindingsRegistry.registerKeybindingRule({
  id: "agentsVoice.startVoiceInChat",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: ContextKeyExpr.and(
    SessionsChatInputHasDictationFocus,
    AGENTS_VOICE_ENABLED
  ),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space
});
let NewChatInputStatusActionViewItem = class extends MenuEntryActionViewItem {
  constructor(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService, chatStatusItemService, hoverService, commandService) {
    super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
    this.chatStatusItemService = chatStatusItemService;
    this.hoverService = hoverService;
    this.commandService = commandService;
    this.hoverContentDisposables = this._register(new MutableDisposable());
  }
  render(container) {
    super.render(container);
    if (this._commandAction.id !== OTEL_STATUS_COMMAND) {
      return;
    }
    this._register(this.chatStatusItemService.onDidChange((e) => {
      if (e.entry.id === OTEL_STATUS_ENTRY_ID) {
        this.updateTooltip();
      }
    }));
  }
  async onClick(event) {
    if (this._commandAction.id === OTEL_STATUS_COMMAND && this.element) {
      event.preventDefault();
      event.stopPropagation();
      this.hoverService.showManagedHover(this.element);
      return;
    }
    await super.onClick(event);
  }
  getHoverContents() {
    if (this._commandAction.id === OTEL_STATUS_COMMAND) {
      return { element: () => this._renderStatusHover() };
    }
    return super.getHoverContents();
  }
  getTooltip() {
    if (this._commandAction.id === OTEL_STATUS_COMMAND) {
      const tooltip = this._getStatusEntryTooltip();
      if (tooltip) {
        return tooltip;
      }
    }
    return super.getTooltip();
  }
  _getStatusEntryTooltip() {
    for (const entry of this.chatStatusItemService.getEntries()) {
      if (entry.id === OTEL_STATUS_ENTRY_ID) {
        return entry.tooltip;
      }
    }
    return void 0;
  }
  _renderStatusHover() {
    const store = new DisposableStore();
    this.hoverContentDisposables.value = store;
    const root = dom.$(".new-chat-input-status-hover");
    root.appendChild(dom.$(".new-chat-input-status-hover-title", void 0, localize("newChatInput.status.otel.title", "Monitoring with OpenTelemetry enabled")));
    root.appendChild(dom.$(".new-chat-input-status-hover-detail", void 0, this._getStatusEntryTooltip() ?? super.getTooltip()));
    const actions = root.appendChild(dom.$(".new-chat-input-status-hover-actions"));
    const learnMoreButton = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
    learnMoreButton.label = localize("newChatInput.status.otel.learnMore", "Learn More");
    store.add(learnMoreButton.onDidClick(() => {
      void this.commandService.executeCommand("vscode.open", URI.parse(OTEL_DOCS_URL));
      this.hoverService.hideHover(true);
    }));
    const manageButton = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
    manageButton.label = localize("newChatInput.status.otel.manage", "Manage");
    store.add(manageButton.onDidClick(() => {
      void this.commandService.executeCommand(OPEN_OTEL_SETTINGS_COMMAND);
      this.hoverService.hideHover(true);
    }));
    return root;
  }
};
NewChatInputStatusActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, IChatStatusItemService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ICommandService)
], NewChatInputStatusActionViewItem);
const RANDOM_PLACEHOLDERS = [
  localize("sessionsChatInput.placeholder.whatAreYouBuilding", "What are you building?"),
  localize("sessionsChatInput.placeholder.whatWillYouShipToday", "What will you ship today?"),
  localize("sessionsChatInput.placeholder.describeWhatYouWantToBuild", "Describe what you want to build"),
  localize("sessionsChatInput.placeholder.whatsYourNextMilestone", "What's your next milestone?"),
  localize("sessionsChatInput.placeholder.whatAreYouTryingToAchieve", "What are you trying to achieve?"),
  localize("sessionsChatInput.placeholder.pitchYourIdea", "Pitch your idea"),
  localize("sessionsChatInput.placeholder.whatsTheGoal", "What's the goal?"),
  localize("sessionsChatInput.placeholder.whatWillYouCreate", "What will you create?"),
  localize("sessionsChatInput.placeholder.whatFeatureAreYouDreamingUp", "What feature are you dreaming up?"),
  localize("sessionsChatInput.placeholder.describeTheOutcome", "Describe the outcome you want"),
  localize("sessionsChatInput.placeholder.whatProblemAreYouSolving", "What problem are you solving?"),
  localize("sessionsChatInput.placeholder.whatsNextOnYourRoadmap", "What's next on your roadmap?"),
  localize("sessionsChatInput.placeholder.whatWouldYouLikeToAutomate", "What would you like to automate?"),
  localize("sessionsChatInput.placeholder.whatWillYouLaunch", "What will you launch?"),
  localize("sessionsChatInput.placeholder.describeYourMission", "Describe your mission")
];
let lastPlaceholderIndex = -1;
function getRandomChatInputPlaceholder() {
  let index = Math.floor(Math.random() * RANDOM_PLACEHOLDERS.length);
  if (index === lastPlaceholderIndex) {
    index = (index + 1) % RANDOM_PLACEHOLDERS.length;
  }
  lastPlaceholderIndex = index;
  return RANDOM_PLACEHOLDERS[index];
}
let NewChatInputWidget = class extends Disposable {
  constructor(options, instantiationService, modelService, textModelService, chatPasteTargetService, configurationService, contextKeyService, logService, hoverService, storageService, dialogService, keybindingService, layoutService, chatSessionsService, chatSpeechToTextService, dictationOnboardingService, chatInputNoticeHubService, chatSubmitRequestHandlerService, contextMenuService, commandService, voiceSessionController, voiceInputModeService, accessibilityService, voiceModeOnboardingService, newChatVoiceTargetService, themeService) {
    super();
    this.options = options;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.textModelService = textModelService;
    this.chatPasteTargetService = chatPasteTargetService;
    this.configurationService = configurationService;
    this.contextKeyService = contextKeyService;
    this.logService = logService;
    this.hoverService = hoverService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.keybindingService = keybindingService;
    this.layoutService = layoutService;
    this.chatSessionsService = chatSessionsService;
    this.chatSpeechToTextService = chatSpeechToTextService;
    this.dictationOnboardingService = dictationOnboardingService;
    this.chatInputNoticeHubService = chatInputNoticeHubService;
    this.chatSubmitRequestHandlerService = chatSubmitRequestHandlerService;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
    this.voiceSessionController = voiceSessionController;
    this.voiceInputModeService = voiceInputModeService;
    this.accessibilityService = accessibilityService;
    this.voiceModeOnboardingService = voiceModeOnboardingService;
    this.newChatVoiceTargetService = newChatVoiceTargetService;
    this.themeService = themeService;
    /** Arbitrates which notice occupies the area above this input. */
    this.noticeHost = this._register(new ChatInputNoticeHost(() => this.focus()));
    // IHistoryNavigationWidget
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._inputModelReference = this._register(new MutableDisposable());
    this._promptTemplatePlaceholder = this._register(new MutableDisposable());
    this._promptOptionsWidget = this._register(new MutableDisposable());
    this._promptOptionsRefresh = this._register(new MutableDisposable());
    this._promptOptionsDismissed = false;
    this._sending = false;
    this._loadingDelayDisposable = this._register(new MutableDisposable());
    this._promptTypingAnimation = this._register(new MutableDisposable());
    this._newChatModelPickerService = new NewChatModelPickerService();
    this._compactModelPicker = observableValue(this, false);
    // Input state
    this._draftState = {
      inputText: "",
      attachments: []
    };
    this._sessionModelSelectionModel = this._register(this.instantiationService.createInstance(SessionModelSelectionModel, this.options.session));
    this._canSendRequest = derived(this, (reader) => {
      if (this.options.canSubmitWithoutSession?.read(reader)) {
        return true;
      }
      const modelSelection = this._sessionModelSelectionModel.state.read(reader);
      return this.options.canSendRequest.read(reader) && modelSelection.hasSelectableModel && !modelSelection.pendingSelection;
    });
    this._scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
      [INewChatModelPickerService, this._newChatModelPickerService],
      [ISessionContext, new SessionContext(this.options.session)],
      [ISessionModelSelectionModel, this._sessionModelSelectionModel]
    )));
    this._history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    if (this.options.historyKey) {
      this._register(autorun((reader) => this._setHistoryKey(this.options.historyKey?.read(reader))));
      this._register(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
          this._setHistoryKey(this.options.historyKey?.get());
        }
      }));
    }
    this._contextAttachments = this._register(this.instantiationService.createInstance(NewChatContextAttachments));
    this.sessionTypePicker = this._register(this.instantiationService.createInstance(MobileSessionTypePicker, this.options.session, this.options.sessionTypePickerOptions));
    this._register(this._contextAttachments.onDidChangeContext(() => {
      this._updateDraftState();
      this._updateSendButtonState();
      this.focus();
    }));
    this._register(autorun((reader) => {
      this._canSendRequest.read(reader);
      this.options.hasAdditionalSendContent?.read(reader);
      const isLoading = this.options.loading.read(reader);
      this._loadingSpinner?.classList.toggle("visible", isLoading);
      this._updateSendButtonState();
    }));
  }
  /** The canonical notice slot, directly above this input. */
  get gettingStartedTipContainerElement() {
    return this._gettingStartedTipContainer;
  }
  get element() {
    return this._editorContainer;
  }
  /** The underlying input editor. Exposed for component fixtures. */
  get inputEditor() {
    return this._editor;
  }
  /** The current model-selection state. Exposed so host widgets can react to model changes. */
  get selectedModelState() {
    return this._sessionModelSelectionModel.state;
  }
  get workspacePreselectionSource() {
    return this.options.getWorkspacePreselectionSource?.();
  }
  /** Opens the model picker dropdown. */
  openModelPicker() {
    this._newChatModelPickerService.openModelPicker();
  }
  /** Moves the provider-contributed session controls into the given container. */
  renderSessionControls(container) {
    if (!this._sessionControlsContainer) {
      throw new Error("NewChatInputWidget must be rendered before its session controls.");
    }
    container.appendChild(this._sessionControlsContainer);
  }
  _setHistoryKey(historyKey) {
    this._history.setHistoryKey(this.configurationService.getValue(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false ? historyKey : void 0);
  }
  // --- Rendering ---
  render(parent, root) {
    const chatInputContainer = dom.append(parent, dom.$(`.new-chat-input-container.${chatInputStackClass}`));
    const editorOverflowWidgetsDomNode = this.layoutService.getContainer(dom.getWindow(root)).appendChild(dom.$(".sessions-chat-editor-overflow.monaco-editor"));
    editorOverflowWidgetsDomNode.classList.add("hideSuggestTextIcons");
    this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
    this._register(this.chatInputNoticeHubService.registerHost(this.noticeHost, chatInputContainer));
    const composerFocusKey = ChatContextKeys.inChatComposer.bindTo(this._register(this.contextKeyService.createScoped(chatInputContainer)));
    const composerFocusTracker = this._register(dom.trackFocus(chatInputContainer));
    this._register(composerFocusTracker.onDidFocus(() => composerFocusKey.set(true)));
    this._register(composerFocusTracker.onDidBlur(() => composerFocusKey.set(false)));
    const notificationContainer = dom.append(chatInputContainer, dom.$(`.chat-input-notification-container.${chatInputStackSlotClass}`));
    const notificationWidget = this._register(this.instantiationService.createInstance(
      ChatInputNotificationWidget,
      {
        modelTargetChatSessionType: this.sessionTypePicker.modelTargetChatSessionType,
        deferredNotificationsEnabled: this.options.deferredNotificationsEnabled,
        openModelPicker: () => this._newChatModelPickerService.openModelPicker(),
        switchToModel: (modelIdentifier) => this._newChatModelPickerService.switchToModel(modelIdentifier),
        onDidChangeVisibility: (visible, focusTarget) => this.noticeHost.setOccupied(ChatInputNoticeLane.Notification, visible, focusTarget),
        focusInput: () => this.focus()
      }
    ));
    notificationWidget.attachTo(notificationContainer);
    const voiceOnboardingContainer = dom.append(chatInputContainer, dom.$(`.voice-mode-onboarding-container.${chatInputStackSlotClass}`));
    const dictationOnboardingContainer = dom.append(chatInputContainer, dom.$(`.dictation-onboarding-container.${chatInputStackSlotClass}`));
    this._register(registerChatInputOnboardingHosts(
      this.noticeHost,
      { voice: voiceOnboardingContainer, dictation: dictationOnboardingContainer },
      chatInputContainer,
      () => this.focus(),
      this.voiceModeOnboardingService,
      this.dictationOnboardingService
    ));
    this._gettingStartedTipContainer = dom.append(chatInputContainer, dom.$(`.chat-getting-started-tip-container.${chatInputStackSlotClass}`));
    this._promptOptionsWidget.value = this.instantiationService.createInstance(NewSessionPromptOptionsWidget, chatInputContainer, {
      selectOption: async (option, expectedInput, animate) => {
        this.focus();
        const inserted = animate ? await this.animatePrompt(option.prompt, NEW_SESSION_PROMPT_TYPING_DURATION_MS, option.placeholder, CancellationToken.None, expectedInput) : this._replacePrompt(option.prompt, option.placeholder, expectedInput);
        const generatedValue = option.placeholder ? option.prompt.replace(option.placeholder, "") : option.prompt;
        if (inserted && (this._editor.getValue() === option.prompt || this._editor.getValue() === generatedValue)) {
          aria.status(localize("newSessionPromptOptions.inserted", "Inserted prompt: {0}", option.title));
        }
        return inserted;
      },
      onDidSelectOption: (option) => this._promptOptionsController?.onDidSelectOption(option),
      onDidClose: () => this._dismissPromptOptions()
    });
    this._promptOptionsWidget.value.setState(this._promptOptionsState);
    const inputAreaWrapper = dom.append(chatInputContainer, dom.$(".new-chat-input-area-wrapper"));
    const inputArea = dom.append(inputAreaWrapper, dom.$(".new-chat-input-area"));
    const contextAttachments = this._contextAttachments;
    const attachRow = dom.append(inputArea, dom.$(".sessions-chat-attach-row"));
    const attachedContextContainer = dom.append(attachRow, dom.$(".sessions-chat-attached-context"));
    this._contextAttachments.renderAttachedContext(attachedContextContainer);
    this._register(this.instantiationService.createInstance(ChatDragAndDrop, () => void 0, {
      get attachments() {
        return contextAttachments.attachments;
      },
      addAttachments: (entries) => contextAttachments.addAttachments(...entries)
    }, {
      listForeground: inactiveSessionViewForeground,
      listBackground: inactiveSessionViewBackground,
      overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND
    })).addOverlay(root, root);
    this._createEditor(inputArea, editorOverflowWidgetsDomNode);
    const inputHasContent = observableFromEvent(this, this._editor.onDidChangeModelContent, () => this._editor.getValue().length > 0);
    this._register(this.instantiationService.createInstance(ChatPetWidget, chatInputContainer, inputArea, root, constObservable(void 0), inputHasContent, constObservable(true), this._editor.onDidChangeModelContent));
    this._createInputToolbar(inputArea);
    const newChatBottomContainer = dom.append(parent, dom.$(".new-chat-bottom-container"));
    const newChatControlsContainer = dom.append(newChatBottomContainer, dom.$(".new-chat-controls-container"));
    if (this.options.renderSessionTypePickerInControls !== false) {
      const sessionTypePickerHost = dom.append(newChatControlsContainer, dom.$(".new-chat-session-type-picker-host"));
      this.sessionTypePicker.render(sessionTypePickerHost);
    }
    const sessionControlsContainer = this._sessionControlsContainer = dom.append(newChatControlsContainer, dom.$(".new-chat-session-controls"));
    this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, sessionControlsContainer, Menus.NewSessionControl, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide
    }));
    this._register({ dispose: () => sessionControlsContainer.remove() });
    const repoConfigContainer = dom.append(newChatBottomContainer, dom.$(".new-chat-repo-config-container"));
    this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, repoConfigContainer, Menus.NewSessionRepositoryConfig, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide
    }));
    this._register(installMobileChipLaneScroll(newChatBottomContainer, this.layoutService));
    const statusContainer = dom.append(repoConfigContainer, dom.$(".new-chat-status-toolbar"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, statusContainer, MenuId.ChatInputStatus, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      toolbarOptions: { primaryGroup: () => true },
      actionViewItemProvider: (action, options) => {
        if (action.id === OTEL_STATUS_COMMAND && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(NewChatInputStatusActionViewItem, action, options);
        }
        return void 0;
      }
    }));
    this._restoreState();
    setChatInputStackSlot(chatInputContainer, ChatInputStackSlot.Standalone);
    refreshChatInputStack(parent);
    this._register(dom.addDisposableListener(chatInputContainer, "animationend", () => {
      this._editor?.layout();
    }, { once: true }));
  }
  _updateInputLoadingState() {
    const loading = this._sending;
    if (loading) {
      if (!this._loadingDelayDisposable.value) {
        const timer = setTimeout(() => {
          this._loadingDelayDisposable.clear();
          if (this._sending) {
            this._loadingSpinner?.classList.add("visible");
          }
        }, 500);
        this._loadingDelayDisposable.value = toDisposable(() => clearTimeout(timer));
      }
    } else {
      this._loadingDelayDisposable.clear();
      this._loadingSpinner?.classList.remove("visible");
    }
  }
  // --- Editor ---
  _getAriaLabel() {
    const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.SessionsChat);
    if (verbose) {
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      return kbLabel ? localize("chatInput.accessibilityHelp", "Chat input. Press Enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel) : localize("chatInput.accessibilityHelpNoKb", "Chat input. Press Enter to send out the request. Use the Chat Accessibility Help command for more information.");
    }
    return localize("chatInput", "Chat input");
  }
  _getTerminalCommandPrefix() {
    const session = this.options.session.get();
    return session ? this.chatSessionsService.getCapabilitiesForSessionType(getChatSessionType(session.resource))?.terminalCommandPrefix : void 0;
  }
  _handleTerminalCommandPaste(e) {
    handleTerminalCommandPaste(e, this._editor, this._getTerminalCommandPrefix(), this.dialogService, this.storageService);
  }
  /**
   * Paste edits are applied through the bulk edit service, which resolves the
   * input model and force-destroys it when the last reference is released.
   * Holding one keeps the model alive for this editor's lifetime.
   */
  async _holdInputModelReference(uri) {
    try {
      this._inputModelReference.value = await this.textModelService.createModelReference(uri);
    } catch (error) {
      this.logService.error("Failed to hold the chat input model reference", error);
    }
  }
  _createEditor(container, overflowWidgetsDomNode) {
    const editorContainer = this._editorContainer = dom.append(container, dom.$(".sessions-chat-editor"));
    const minHeight = this.options.minEditorHeight ?? MIN_EDITOR_HEIGHT;
    editorContainer.style.height = `${minHeight}px`;
    const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(container));
    const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
    this._historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
    this._historyNavigationForwardsEnablement = historyNavigationForwardsEnablement;
    const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));
    const uri = URI.from({ scheme: Schemas.sessionsChatInput, path: `input-${Date.now()}` });
    const textModel = this._register(this.modelService.createModel("", null, uri, true));
    void this._holdInputModelReference(uri);
    const editorOptions = {
      ...getSimpleEditorOptions(this.configurationService),
      readOnly: false,
      // Match the workbench chat input so the post-paste selector is offered.
      pasteAs: EditorOptions.pasteAs.defaultValue,
      ariaLabel: this._getAriaLabel(),
      placeholder: this.options.placeholder ?? getRandomChatInputPlaceholder(),
      fontFamily: NEW_CHAT_INPUT_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 20,
      cursorWidth: 1,
      padding: { top: 8, bottom: 2 },
      wrappingStrategy: "advanced",
      stickyScroll: { enabled: false },
      renderWhitespace: "none",
      scrollbar: {
        horizontal: "hidden",
        alwaysConsumeMouseWheel: false,
        vertical: "auto",
        verticalScrollbarSize: 7
      },
      overflowWidgetsDomNode,
      suggest: {
        showIcons: true,
        showSnippets: false,
        showWords: true,
        showStatusBar: false,
        insertMode: "insert",
        fitWidthToDetails: true
      }
    };
    const widgetOptions = {
      isSimpleWidget: true,
      contributions: EditorExtensionsRegistry.getSomeEditorContributions([
        ContextMenuController.ID,
        SuggestController.ID,
        SnippetController2.ID,
        PlaceholderTextContribution.ID,
        CopyPasteController.ID
      ])
    };
    this._editor = this._register(scopedInstantiationService.createInstance(
      CodeEditorWidget,
      editorContainer,
      editorOptions,
      widgetOptions
    ));
    this._editor.setModel(textModel);
    this._promptTemplatePlaceholder.value = new PromptTemplatePlaceholderController(this._editor, () => this._promptTypingAnimation.value?.complete());
    this._register(autorun((reader) => {
      this.options.session.read(reader);
      this._updateEditorFontFamily();
    }));
    this._register(dom.addDisposableListener(this._editorContainer, dom.EventType.PASTE, (e) => this._handleTerminalCommandPaste(e), true));
    SuggestController.get(this._editor)?.forceRenderingAbove();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AccessibilityVerbositySettingId.SessionsChat)) {
        this._editor.updateOptions({ ariaLabel: this._getAriaLabel() });
      }
    }));
    const dictationFocusKey = SessionsChatInputHasDictationFocus.bindTo(inputScopedContextKeyService);
    this._register(this._editor.onDidFocusEditorWidget(() => {
      dictationFocusKey.set(true);
      activeDictationComposer = this;
      this._onDidFocus.fire();
    }));
    this._register(this._editor.onDidBlurEditorWidget(() => {
      dictationFocusKey.set(false);
      if (activeDictationComposer === this) {
        activeDictationComposer = void 0;
      }
      this._onDidBlur.fire();
    }));
    this._register(toDisposable(() => {
      if (activeDictationComposer === this) {
        activeDictationComposer = void 0;
      }
    }));
    this._register(this._editor.onKeyDown((e) => {
      if (e.browserEvent.defaultPrevented) {
        return;
      }
      if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && !e.altKey && this._promptTemplatePlaceholder.value?.replaceAtCursor()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (this._editor.contextKeyService.getContextKeyValue("suggestWidgetVisible")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        this._send();
      }
      if (this.options.supportsBackground && e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this._send(true);
      }
      if (e.equals(KeyMod.CtrlCmd | KeyCode.Slash)) {
        e.preventDefault();
        e.stopPropagation();
        this._contextAttachments.showPicker(this.options.getContextFolderUri());
      }
    }));
    const updateHistoryNavigationEnablement = () => {
      const model = this._editor.getModel();
      const position = this._editor.getPosition();
      if (!model || !position) {
        return;
      }
      this._historyNavigationBackwardsEnablement.set(position.lineNumber === 1 && position.column === 1);
      this._historyNavigationForwardsEnablement.set(position.lineNumber === model.getLineCount() && position.column === model.getLineMaxColumn(position.lineNumber));
    };
    this._register(this._editor.onDidChangeCursorPosition(() => updateHistoryNavigationEnablement()));
    updateHistoryNavigationEnablement();
    let previousHeight = -1;
    this._register(this._editor.onDidContentSizeChange((e) => {
      if (!e.contentHeightChanged) {
        return;
      }
      const contentHeight = this._editor.getContentHeight();
      const clampedHeight = Math.min(MAX_EDITOR_HEIGHT, Math.max(this.options.minEditorHeight ?? MIN_EDITOR_HEIGHT, contentHeight));
      if (clampedHeight === previousHeight) {
        return;
      }
      previousHeight = clampedHeight;
      this._editorContainer.style.height = `${clampedHeight}px`;
      this._editor.layout();
    }));
    this._register(this._scopedInstantiationService.createInstance(SlashCommandHandler, this._editor));
    this._register(this.instantiationService.createInstance(
      VariableCompletionHandler,
      this._editor,
      this._contextAttachments,
      () => this.options.getContextFolderUri()
    ));
    this._register(this.instantiationService.createInstance(
      SessionReferenceCompletionHandler,
      this._editor,
      this._contextAttachments
    ));
    this._agentHostInputCompletionHandler = this._register(this._scopedInstantiationService.createInstance(
      AgentHostInputCompletionHandler,
      this._editor,
      this._contextAttachments
    ));
    this._register(this.chatPasteTargetService.registerTarget(textModel.uri, new NewChatInputPasteTarget(
      this._editor,
      this._contextAttachments,
      this._agentHostInputCompletionHandler,
      () => this._getTerminalCommandPrefix(),
      () => this.options.session.get()?.resource,
      textModel.uri
    )));
    this._register(this._editor.onDidChangeModelContent(() => {
      this._updateDraftState();
      this._updateSendButtonState();
      this._updateEditorFontFamily();
      this._promptOptionsWidget.value?.setInputValue(this._editor.getValue());
    }));
  }
  /**
   * The input is monospace only while a terminal command is being composed:
   * the attached session advertises a prefix AND the current input begins with
   * it. Otherwise it uses the normal new-chat input font.
   */
  _updateEditorFontFamily() {
    const isCommand = isTerminalCommandInput(this._editor.getModel()?.getLineContent(1) || "", this._getTerminalCommandPrefix());
    this._editor.updateOptions({ fontFamily: isCommand ? EDITOR_FONT_DEFAULTS.fontFamily : NEW_CHAT_INPUT_FONT_FAMILY });
  }
  _createAttachButton(container) {
    const attachButton = dom.append(container, dom.$(".sessions-chat-attach-button"));
    const attachButtonLabel = localize("addContext", "Add Context...");
    attachButton.tabIndex = 0;
    attachButton.role = "button";
    attachButton.ariaLabel = attachButtonLabel;
    this._register(this.hoverService.setupDelayedHover(attachButton, {
      content: attachButtonLabel,
      position: { hoverPosition: HoverPosition.BELOW },
      appearance: { showPointer: true }
    }));
    dom.append(attachButton, renderIcon(Codicon.addCompact));
    this._register(dom.addDisposableListener(attachButton, dom.EventType.CLICK, () => {
      this._contextAttachments.showPicker(this.options.getContextFolderUri());
    }));
  }
  _createInputToolbar(container) {
    const toolbar = dom.append(container, dom.$(".sessions-chat-toolbar"));
    let dictationActionVisible = false;
    let voiceActionCount = 0;
    const updateVoiceInputActionBorder = () => {
      toolbar.classList.toggle("sessions-chat-voice-input-actions-multiple", Number(dictationActionVisible) + voiceActionCount > 1);
    };
    this._createAttachButton(toolbar);
    const configContainer = dom.append(toolbar, dom.$(".sessions-chat-config-toolbar"));
    this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, configContainer, Menus.NewSessionConfig, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      actionViewItemProvider: (action) => {
        if (action.id === "sessions.modelPicker") {
          const picker = this._scopedInstantiationService.createInstance(ModelPicker, this._compactModelPicker);
          return new ModelPickerActionViewItem(picker);
        }
        return void 0;
      }
    }));
    dom.append(toolbar, dom.$(".sessions-chat-toolbar-spacer"));
    try {
      this._createSpeechToTextButton(toolbar, (visible) => {
        dictationActionVisible = visible;
        updateVoiceInputActionBorder();
      });
    } catch (error) {
      this.logService.error("Failed to create new-session dictation control:", error);
    }
    const voiceContainer = dom.append(toolbar, dom.$(".sessions-chat-voice-toolbar"));
    try {
      this._register(this.instantiationService.createInstance(NewChatVoiceController, {
        toolbarContainer: voiceContainer,
        inputContainer: container,
        composer: this,
        onDidChangeActions: (actionCount) => {
          voiceActionCount = actionCount;
          updateVoiceInputActionBorder();
        }
      }));
    } catch (error) {
      this.logService.error("Failed to create new-session voice controls:", error);
    }
    try {
      this._createVoiceInputModePill(toolbar, container);
    } catch (error) {
      this.logService.error("Failed to create new-session voice input mode pill:", error);
    }
    this._loadingSpinner = dom.append(toolbar, dom.$(".sessions-chat-loading-spinner"));
    const loadingIcon = dom.append(this._loadingSpinner, renderIcon(ThemeIcon.modify(Codicon.loading, "spin")));
    loadingIcon.setAttribute("aria-hidden", "true");
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this._loadingSpinner, localize("loading", "Loading...")));
    this._loadingSpinner.classList.toggle("visible", this.options.loading.get());
    if (this.options.renderSendButton !== false) {
      const sendButtonContainer = dom.append(toolbar, dom.$(".sessions-chat-send-button"));
      const sendButton = this._sendButton = this._register(new Button(sendButtonContainer, {
        secondary: true,
        title: this.options.supportsBackground ? localize("sendWithBackgroundHint", "Send (Alt-click to start in the background)") : localize("send", "Send"),
        ariaLabel: localize("send", "Send")
      }));
      sendButton.icon = Codicon.arrowUpCompact;
      this._register(sendButton.onDidClick((e) => this._send(!!this.options.supportsBackground && !!e?.altKey)));
    }
    updateVoiceInputActionBorder();
  }
  _createVoiceInputModePill(toolbar, inputContainer) {
    const pillContainer = dom.append(toolbar, dom.$(".sessions-chat-voice-input-mode"));
    const isVoiceInputActive = derived(this, (reader) => isEqual(this.newChatVoiceTargetService.currentVoiceInputResource.read(reader), NEW_CHAT_VOICE_SENTINEL));
    const isVoiceSessionActive = derived(this, (reader) => isNewChatVoiceSessionActive(
      this.voiceSessionController.isConnected.read(reader),
      this.voiceSessionController.isConnecting.read(reader),
      this.voiceSessionController.targetSession.read(reader),
      this.voiceSessionController.hasDraftTarget.read(reader),
      this.voiceSessionController.omniInputOpen.read(reader)
    ));
    const action = toAction({
      id: ChatVoiceInputModeAction.ID,
      label: localize("voiceInputMode", "Voice Input Mode"),
      run: () => {
      }
    });
    const pill = this._register(this._scopedInstantiationService.createInstance(VoiceInputModeActionViewItem, action, {
      // Dictation must target this composer's editor, not the last focused
      // chat widget (this composer isn't an `IChatWidget`).
      toggleDictation: () => {
        void this.toggleDictation();
      },
      isActive: isVoiceInputActive,
      isVoiceActive: isVoiceSessionActive
    }));
    pill.render(pillContainer);
    this._register(autorun((reader) => {
      const dict = this.voiceInputModeService.dictationAvailable.read(reader);
      const voice = this.voiceInputModeService.voiceAvailable.read(reader);
      const handsFree = this.voiceInputModeService.handsFree.read(reader);
      const connected = isVoiceSessionActive.read(reader) && this.voiceSessionController.isConnected.read(reader);
      const pillActive = dict && voice || voice && !dict && !handsFree && connected;
      pillContainer.classList.toggle("hidden", !pillActive);
      inputContainer.classList.toggle("voice-input-mode-pill", pillActive);
    }));
  }
  _createSpeechToTextButton(container, onDidChangeVisibility) {
    const sttService = this.chatSpeechToTextService;
    const button = dom.append(container, dom.$(".sessions-chat-stt-button"));
    button.tabIndex = 0;
    button.role = "button";
    const micLabel = localize("sessionsStt.dictate", "Dictate (Speech to Text)");
    const stopLabel = localize("sessionsStt.stop", "Stop Dictation");
    this._register(this.hoverService.setupDelayedHover(button, () => ({
      // While the model prepares, surface the download/connecting hover
      // (which invites the user to click to cancel) so this composer matches
      // the main chat toolbar affordance. Idle gets the richer description
      // naming the configured dictation model.
      content: sttService.currentSurface === "chat" && sttService.isPreparingModel ? getDictationDownloadHoverMarkdown(sttService) : isDictationActiveOnSurface(sttService, "chat") ? stopLabel : getDictationHoverMarkdown(micLabel, this.configurationService),
      position: { hoverPosition: HoverPosition.BELOW },
      appearance: { showPointer: true }
    })));
    const downloadRing = this._register(new MutableDisposable());
    const renderState = () => {
      const active = isDictationActiveOnSurface(sttService, "chat");
      const preparing = active && sttService.isPreparingModel;
      const recording = active && sttService.state === ChatSpeechToTextState.Recording;
      dom.clearNode(button);
      downloadRing.clear();
      if (preparing) {
        if (sttService.isDownloadingModel) {
          dom.append(button, renderIcon(Codicon.micDownloadCompact));
          downloadRing.value = new DictationDownloadRing(button, sttService);
        } else {
          dom.append(button, renderIcon(ThemeIcon.modify(Codicon.loadingCompact, "spin")));
        }
      } else {
        dom.append(button, renderIcon(recording ? Codicon.micFilled : Codicon.mic));
      }
      button.classList.toggle("recording", recording && !preparing);
      button.classList.toggle("preparing", preparing);
      button.ariaLabel = preparing ? localize("sessionsStt.cancelPreparing", "Cancel Dictation. {0}", getDictationPreparingLabel(sttService)) : active ? stopLabel : micLabel;
    };
    renderState();
    this._register(sttService.onDidChangeState(renderState));
    this._register(sttService.onDidChangePreparingModel(renderState));
    this._register(sttService.onDidChangeDownloadingModel(renderState));
    this._register(setupDictationMicGlow(button, sttService, this.accessibilityService, void 0, this.themeService));
    const updateVisibility = () => {
      const voiceActive = isNewChatVoiceSessionActive(
        this.voiceSessionController.isConnected.get(),
        this.voiceSessionController.isConnecting.get(),
        this.voiceSessionController.targetSession.get(),
        this.voiceSessionController.hasDraftTarget.get(),
        this.voiceSessionController.omniInputOpen.get()
      );
      const dict = this.voiceInputModeService.dictationAvailable.get();
      const voice = this.voiceInputModeService.voiceAvailable.get();
      const handsFree = this.voiceInputModeService.handsFree.get();
      const sessionActive = this.voiceSessionController.isConnected.get();
      const pillActive = dict && voice || voice && !dict && !handsFree && sessionActive;
      const buttonShown = this.configurationService.getValue(DictationSettingId.ShowButton) !== false;
      const visible = sttService.isConfigured && !voiceActive && !pillActive && buttonShown;
      button.classList.toggle("hidden", !visible);
      onDidChangeVisibility(visible);
    };
    updateVisibility();
    this._register(autorun((reader) => {
      this.voiceSessionController.isConnected.read(reader);
      this.voiceSessionController.isConnecting.read(reader);
      this.voiceSessionController.targetSession.read(reader);
      this.voiceSessionController.hasDraftTarget.read(reader);
      this.voiceSessionController.omniInputOpen.read(reader);
      this.voiceInputModeService.dictationAvailable.read(reader);
      this.voiceInputModeService.voiceAvailable.read(reader);
      this.voiceInputModeService.handsFree.read(reader);
      updateVisibility();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dictation.enabled") || e.affectsConfiguration("dictation.model") || e.affectsConfiguration(DictationSettingId.ShowButton)) {
        updateVisibility();
      }
    }));
    const toggle = () => this.toggleDictation();
    this._register(Gesture.addTarget(button));
    [dom.EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._register(dom.addDisposableListener(button, eventType, (e) => {
        dom.EventHelper.stop(e);
        void toggle();
      }));
    });
    this._register(dom.addDisposableListener(button, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(event, true);
        void toggle();
      }
    }));
    this._register(addMicButtonContextMenuListener(
      button,
      () => getDictationContextMenuActions(this.commandService, this.configurationService, this.keybindingService, TOGGLE_DICTATION_COMMAND_ID),
      this.contextMenuService
    ));
  }
  /**
   * Toggle dictation into this composer's editor. Shared by the mic button and
   * the Cmd/Ctrl+I chord ({@link TOGGLE_DICTATION_COMMAND_ID}); the shared
   * Dictate action can't target this composer since it isn't an `IChatWidget`.
   */
  async toggleDictation() {
    if (!this._editor) {
      return;
    }
    await runDictationShortcut({
      speechService: this.chatSpeechToTextService,
      keybindingService: this.keybindingService,
      logService: this.logService,
      onboardingService: this.dictationOnboardingService
    }, TOGGLE_DICTATION_COMMAND_ID, this._editor);
  }
  // --- Input History (IHistoryNavigationWidget) ---
  showPreviousValue() {
    if (this._history.isAtStart()) {
      return;
    }
    if (this._draftState?.inputText || this._draftState?.attachments.length) {
      this._history.overlay(this._toHistoryEntry(this._draftState));
    }
    this._navigateHistory(true);
  }
  showNextValue() {
    if (this._history.isAtEnd()) {
      return;
    }
    if (this._draftState?.inputText || this._draftState?.attachments.length) {
      this._history.overlay(this._toHistoryEntry(this._draftState));
    }
    this._navigateHistory(false);
  }
  _updateDraftState() {
    this._draftState = {
      inputText: this._editor?.getModel()?.getValue() ?? "",
      attachments: [...this._contextAttachments.attachments]
    };
  }
  _toHistoryEntry(draft) {
    return {
      ...draft,
      mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
      selectedModel: void 0,
      selections: [],
      contrib: {}
    };
  }
  _navigateHistory(previous) {
    const entry = previous ? this._history.previous() : this._history.next();
    const inputText = entry?.inputText ?? "";
    if (entry) {
      this._editor?.getModel()?.setValue(inputText);
      this._contextAttachments.setAttachments(entry.attachments);
    }
    aria.status(inputText);
    if (previous) {
      this._editor.setPosition({ lineNumber: 1, column: 1 });
    } else {
      const model = this._editor.getModel();
      if (model) {
        const lastLine = model.getLineCount();
        this._editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
      }
    }
  }
  // --- Send ---
  async submit(background = false) {
    return this._send(background);
  }
  async _send(background = false) {
    const rawQuery = this._editor.getModel()?.getValue() ?? "";
    const query = rawQuery.trim();
    const queryOffset = rawQuery.length - rawQuery.trimStart().length;
    const hasSendableAttachment = this._contextAttachments.attachments.some(isExplicitFileOrImageVariableEntry);
    const hasAdditionalSendContent = this.options.hasAdditionalSendContent?.get() ?? false;
    if (!query && !hasSendableAttachment && !hasAdditionalSendContent || this._sending) {
      return false;
    }
    if (!this._canSendRequest.get()) {
      return false;
    }
    notifyDictationSubmitted(this._editor);
    const session = this.options.session.get();
    if (!hasAdditionalSendContent && session && await this.chatSubmitRequestHandlerService.tryHandle({
      sessionResource: session.resource,
      providerId: session.providerId,
      sessionId: session.sessionId,
      input: query
    })) {
      this._editor.getModel()?.setValue("");
      return true;
    }
    const attachments = this._agentHostInputCompletionHandler?.getAttachmentsForSend(query, queryOffset) ?? [...this._contextAttachments.attachments];
    const attachedContext = attachments.length > 0 ? attachments : void 0;
    const request = query;
    if (this._draftState) {
      this._history.append(this._toHistoryEntry(this._draftState));
    }
    this._clearDraftState();
    this._sending = true;
    this._editor.updateOptions({ readOnly: true });
    this._updateSendButtonState();
    this._updateInputLoadingState();
    let sent = false;
    try {
      sent = await this.options.sendRequest({ query: request, attachments: attachedContext, background });
      if (!sent) {
        return false;
      }
      this._contextAttachments.clear();
      this._editor.getModel()?.setValue("");
    } catch (e) {
      this.logService.error("Failed to send request:", e);
      return false;
    } finally {
      this._sending = false;
      this._editor.updateOptions({ readOnly: false });
      this._updateDraftState();
      this._updateSendButtonState();
      this._updateInputLoadingState();
    }
    return sent;
  }
  _updateSendButtonState() {
    if (!this._sendButton) {
      return;
    }
    const hasText = !!this._editor?.getModel()?.getValue().trim();
    const hasSendableAttachment = this._contextAttachments.attachments.some(isExplicitFileOrImageVariableEntry);
    const hasAdditionalSendContent = this.options.hasAdditionalSendContent?.get() ?? false;
    this._sendButton.enabled = !this._sending && (hasText || hasSendableAttachment || hasAdditionalSendContent) && this._canSendRequest.get();
  }
  _restoreState() {
    const draft = this._getDraftState();
    if (draft) {
      this._editor?.getModel()?.setValue(draft.inputText);
      if (draft.attachments?.length) {
        this._contextAttachments.setAttachments(draft.attachments.map(IChatRequestVariableEntry.fromExport));
      }
    }
  }
  _getDraftState() {
    const raw = this.storageService.get(STORAGE_KEY_DRAFT_STATE, StorageScope.WORKSPACE);
    if (!raw) {
      return void 0;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return void 0;
    }
  }
  _clearDraftState() {
    this._draftState = { inputText: "", attachments: [] };
    this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(this._draftState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  saveState() {
    if (this._draftState) {
      const state = {
        ...this._draftState,
        attachments: this._draftState.attachments.map(IChatRequestVariableEntry.toExport)
      };
      this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  layout(_height, width) {
    this._compactModelPicker.set(width < NewChatInputWidget.compactModelPickerWidth, void 0);
    this._editor?.layout();
  }
  focus() {
    this._editor?.focus();
  }
  async animatePrompt(text, durationMs, placeholder, token, expectedValue = "") {
    const editor = this._editor;
    const model = editor?.getModel();
    if (!editor || !model || !text || model.getValue() !== expectedValue || token.isCancellationRequested) {
      return false;
    }
    this._promptTypingAnimation.clear();
    if (expectedValue) {
      model.setValue("");
    }
    this._promptTemplatePlaceholder.value?.setPlaceholder(placeholder);
    const targetWindow = dom.getWindow(this._editorContainer);
    const effectiveDuration = this.accessibilityService.isMotionReduced() || this.accessibilityService.isScreenReaderOptimized() ? 0 : durationMs;
    const animation = animatePromptTyping({
      getValue: () => model.getValue(),
      setValue: (value) => {
        model.setValue(value);
        const lastLine = model.getLineCount();
        editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
      },
      onDidChange: (listener) => model.onDidChangeContent(() => listener())
    }, text, effectiveDuration, {
      now: () => targetWindow.performance.now(),
      schedule: (callback) => dom.scheduleAtNextAnimationFrame(targetWindow, callback)
    });
    this._promptTypingAnimation.value = animation;
    const cancellationListener = token.onCancellationRequested(() => {
      if (this._promptTypingAnimation.value === animation) {
        this._promptTypingAnimation.clear();
      } else {
        animation.dispose();
      }
    });
    try {
      return (await animation.result).didWrite;
    } finally {
      cancellationListener.dispose();
      if (this._promptTypingAnimation.value === animation) {
        this._promptTypingAnimation.clear();
      }
    }
  }
  _replacePrompt(text, placeholder, expectedValue) {
    const model = this._editor.getModel();
    if (!model || model.getValue() !== expectedValue) {
      return false;
    }
    this._promptTypingAnimation.clear();
    this._promptTemplatePlaceholder.value?.setPlaceholder(placeholder);
    this._editor.pushUndoStop();
    const edited = this._editor.executeEdits("sessions.promptOption", [{ range: model.getFullModelRange(), text }]);
    if (!edited) {
      return false;
    }
    this._editor.pushUndoStop();
    const lastLine = model.getLineCount();
    this._editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
    return true;
  }
  showPromptOptions(state) {
    if (state && this._promptOptionsDismissed) {
      return false;
    }
    this._promptOptionsState = state;
    const widget = this._promptOptionsWidget.value;
    if (!widget) {
      return false;
    }
    widget.setState(state);
    widget.setInputValue(this._editor.getValue());
    return true;
  }
  setPromptOptionsController(controller) {
    this._cancelPromptOptionsRefresh(false);
    this._promptOptionsController = controller;
    this._promptOptionsDismissed = false;
  }
  preparePromptOptionsRefresh() {
    if (!this._promptOptionsController || this._promptOptionsDismissed) {
      return false;
    }
    this._cancelPromptOptionsRefresh();
    this.showPromptOptions({ kind: "loading" });
    return true;
  }
  clearPromptOptions() {
    this._cancelPromptOptionsRefresh();
    this.showPromptOptions(void 0);
  }
  _dismissPromptOptions() {
    if (this._promptOptionsDismissed) {
      return;
    }
    const controller = this._promptOptionsController;
    this._promptOptionsDismissed = true;
    this._cancelPromptOptionsRefresh(false);
    this.showPromptOptions(void 0);
    this.focus();
    aria.status(localize("newSessionPromptOptions.closed", "Prompt options closed"));
    controller?.onDidClose();
  }
  _cancelPromptOptionsRefresh(clearGeneratedInput = true) {
    const shouldClearInput = this._promptOptionsWidget.value?.shouldClearInputForRefresh() ?? false;
    this._promptTypingAnimation.clear();
    this._promptOptionsRefresh.value?.cancel();
    this._promptOptionsRefresh.clear();
    if (clearGeneratedInput && shouldClearInput) {
      this._promptTemplatePlaceholder.value?.setPlaceholder(void 0);
      this._editor.getModel()?.setValue("");
    }
  }
  async refreshPromptOptions(token = CancellationToken.None) {
    const controller = this._promptOptionsController;
    if (!controller || !this.preparePromptOptionsRefresh()) {
      return false;
    }
    const cts = new CancellationTokenSource(token);
    this._promptOptionsRefresh.value = cts;
    let state;
    try {
      state = await controller.resolve(cts.token);
    } catch (error) {
      if (this._promptOptionsRefresh.value === cts) {
        this._promptOptionsRefresh.clear();
        if (cts.token.isCancellationRequested) {
          this.showPromptOptions(void 0);
          return false;
        }
      }
      throw error;
    }
    if (this._promptOptionsRefresh.value !== cts) {
      return false;
    }
    if (cts.token.isCancellationRequested) {
      this._promptOptionsRefresh.clear();
      this.showPromptOptions(void 0);
      return false;
    }
    this._promptOptionsRefresh.clear();
    return this.showPromptOptions(state);
  }
  dispose() {
    this._cancelPromptOptionsRefresh();
    super.dispose();
  }
  /** See {@link INewChatVoiceComposer.routesWhileSessionActive}. */
  get routesWhileSessionActive() {
    return this.options.voiceRoutesWhileSessionActive === true;
  }
  prefillInput(text) {
    const editor = this._editor;
    const model = editor?.getModel();
    if (editor && model) {
      model.setValue(text);
      const lastLine = model.getLineCount();
      const maxColumn = model.getLineMaxColumn(lastLine);
      editor.setPosition({ lineNumber: lastLine, column: maxColumn });
      editor.focus();
    }
  }
  sendQuery(text) {
    if (this._sending) {
      return;
    }
    const model = this._editor?.getModel();
    if (model) {
      const combined = combineVoiceInput(model.getValue(), text);
      model.setValue(combined);
      this._send();
    }
  }
  attach(uris) {
    this._contextAttachments.addAttachments(...uris.map((uri) => toFileVariableEntry(uri)));
  }
  getVoiceModels() {
    return this._sessionModelSelectionModel.state.get().models;
  }
  selectVoiceModel(identifier) {
    return this._sessionModelSelectionModel.selectModel(identifier);
  }
};
NewChatInputWidget.compactModelPickerWidth = 280;
NewChatInputWidget = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IModelService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IChatPasteTargetService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IDialogService),
  __decorateParam(11, IKeybindingService),
  __decorateParam(12, IWorkbenchLayoutService),
  __decorateParam(13, IChatSessionsService),
  __decorateParam(14, IChatSpeechToTextService),
  __decorateParam(15, IDictationOnboardingService),
  __decorateParam(16, IChatInputNoticeHubService),
  __decorateParam(17, IChatSubmitRequestHandlerService),
  __decorateParam(18, IContextMenuService),
  __decorateParam(19, ICommandService),
  __decorateParam(20, IVoiceSessionController),
  __decorateParam(21, IVoiceInputModeService),
  __decorateParam(22, IAccessibilityService),
  __decorateParam(23, IVoiceModeOnboardingService),
  __decorateParam(24, INewChatVoiceTargetService),
  __decorateParam(25, IThemeService)
], NewChatInputWidget);
export {
  NewChatInputWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcbmV3Q2hhdElucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRJbnB1dC5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL2NoYXRJbnB1dE1vYmlsZS5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTWVudUVudHJ5QWN0aW9uVmlld0l0ZW1PcHRpb25zLCBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0LCBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRURJVE9SX0ZPTlRfREVGQVVMVFMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IENvcHlQYXN0ZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb3B5UGFzdGVDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFBsYWNlaG9sZGVyVGV4dENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BsYWNlaG9sZGVyVGV4dC9icm93c2VyL3BsYWNlaG9sZGVyVGV4dENvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQ29udGV4dE1lbnVDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29udGV4dG1lbnUvYnJvd3Nlci9jb250ZXh0bWVudS5qcyc7XG5pbXBvcnQgeyBnZXRTaW1wbGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY29kZUVkaXRvci9icm93c2VyL3NpbXBsZUVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTmV3Q2hhdENvbnRleHRBdHRhY2htZW50cyB9IGZyb20gJy4vbmV3Q2hhdENvbnRleHRBdHRhY2htZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0RHJhZ0FuZERyb3AgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXREcmFnQW5kRHJvcC5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBpbmFjdGl2ZVNlc3Npb25WaWV3QmFja2dyb3VuZCwgaW5hY3RpdmVTZXNzaW9uVmlld0ZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuXG5pbXBvcnQgeyBJTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSwgaXNOZXdDaGF0Vm9pY2VTZXNzaW9uQWN0aXZlLCBORVdfQ0hBVF9WT0lDRV9TRU5USU5FTCwgTmV3Q2hhdFZvaWNlQ29udHJvbGxlciB9IGZyb20gJy4vbmV3Q2hhdFZvaWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uVHlwZVBpY2tlck9wdGlvbnMsIFNlc3Npb25UeXBlUGlja2VyIH0gZnJvbSAnLi9zZXNzaW9uVHlwZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgTW9iaWxlU2Vzc2lvblR5cGVQaWNrZXIgfSBmcm9tICcuL21vYmlsZS9tb2JpbGVTZXNzaW9uVHlwZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBpbnN0YWxsTW9iaWxlQ2hpcExhbmVTY3JvbGwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVDaGlwTGFuZVNjcm9sbC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdldERpY3RhdGlvbkhvdmVyTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L21pY0J1dHRvbkhvdmVycy5qcyc7XG5pbXBvcnQgeyBhZGRNaWNCdXR0b25Db250ZXh0TWVudUxpc3RlbmVyLCBnZXREaWN0YXRpb25Db250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L21pY0J1dHRvbk1lbnVBY3Rpb25zLmpzJztcbmltcG9ydCB7IFNsYXNoQ29tbWFuZEhhbmRsZXIgfSBmcm9tICcuL3NsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVmFyaWFibGVDb21wbGV0aW9uSGFuZGxlciB9IGZyb20gJy4vdmFyaWFibGVDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uUmVmZXJlbmNlQ29tcGxldGlvbkhhbmRsZXIgfSBmcm9tICcuL3Nlc3Npb25SZWZlcmVuY2VDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWxJbnB1dFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnksIHRvRmlsZVZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRIaXN0b3J5TmF2aWdhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vd2lkZ2V0L2NoYXRXaWRnZXRIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFuZENyZWF0ZUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dCwgSUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9jb250ZXh0U2NvcGVkSGlzdG9yeVdpZGdldC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWNlSG9zdCwgQ2hhdElucHV0Tm90aWNlTGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0Tm90aWNlSG9zdC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRJbnB1dE9uYm9hcmRpbmdIb3N0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0T25ib2FyZGluZ0hvc3RzLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXROb3RpY2VIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpY2VIdWIuanMnO1xuaW1wb3J0IHsgY2hhdElucHV0U3RhY2tDbGFzcywgY2hhdElucHV0U3RhY2tTbG90Q2xhc3MsIENoYXRJbnB1dFN0YWNrU2xvdCwgcmVmcmVzaENoYXRJbnB1dFN0YWNrLCBzZXRDaGF0SW5wdXRTdGFja1Nsb3QgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFN0YWNrLmpzJztcbmltcG9ydCB7IElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2UsIE5ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2UgfSBmcm9tICcuL25ld0NoYXRNb2RlbFBpY2tlci5qcyc7XG5pbXBvcnQgeyBNb2RlbFBpY2tlciwgTW9kZWxQaWNrZXJBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vbW9kZWxQaWNrZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsLCBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbCB9IGZyb20gJy4vc2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Db250ZXh0LCBTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbkNvbnRleHQuanMnO1xuaW1wb3J0IHsgQUdFTlRfU0VTU0lPTlNfU0NPUEVEX0lOUFVUX0hJU1RPUllfU0VUVElORyB9IGZyb20gJy4vc2Vzc2lvbnNDaGF0SGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFN0YXR1c0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTdGF0dXMvY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhbmRsZVRlcm1pbmFsQ29tbWFuZFBhc3RlLCBpc1Rlcm1pbmFsQ29tbWFuZElucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRUZXJtaW5hbENvbW1hbmRQYXN0ZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IE5ld0NoYXRJbnB1dFBhc3RlVGFyZ2V0IH0gZnJvbSAnLi9uZXdDaGF0SW5wdXRQYXN0ZVRhcmdldC5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IENoYXRTcGVlY2hUb1RleHRTdGF0ZSwgRGljdGF0aW9uU2V0dGluZ0lkLCBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIGlzRGljdGF0aW9uQWN0aXZlT25TdXJmYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBzZXR1cERpY3RhdGlvbk1pY0dsb3cgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvbk1pY0dsb3cuanMnO1xuaW1wb3J0IHsgSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25PbmJvYXJkaW5nLmpzJztcbmltcG9ydCB7IENoYXRWb2ljZUlucHV0TW9kZUFjdGlvbiwgVm9pY2VJbnB1dE1vZGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUlucHV0TW9kZS92b2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElWb2ljZUlucHV0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VJbnB1dE1vZGUvdm9pY2VJbnB1dE1vZGUuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IHJ1bkRpY3RhdGlvblNob3J0Y3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdFNwZWVjaFRvVGV4dEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgbm90aWZ5RGljdGF0aW9uU3VibWl0dGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25TZXNzaW9uLmpzJztcbmltcG9ydCB7IGNvbWJpbmVWb2ljZUlucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlSW5wdXRVdGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBEaWN0YXRpb25Eb3dubG9hZFJpbmcsIGdldERpY3RhdGlvbkRvd25sb2FkSG92ZXJNYXJrZG93biwgZ2V0RGljdGF0aW9uUHJlcGFyaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvbkRvd25sb2FkUmluZy5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IENoYXRQZXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRQZXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvYWdlbnRzVm9pY2UvYnJvd3Nlci92b2ljZU1vZGVPbmJvYXJkaW5nLmpzJztcbmltcG9ydCB7IEFHRU5UU19WT0lDRV9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvYWdlbnRzVm9pY2UvY29tbW9uL2FnZW50c1ZvaWNlLmpzJztcbmltcG9ydCB7IGFuaW1hdGVQcm9tcHRUeXBpbmcsIElQcm9tcHRUeXBpbmdBbmltYXRpb24gfSBmcm9tICcuL3Byb21wdFR5cGluZ0FuaW1hdGlvbi5qcyc7XG5pbXBvcnQgeyBQcm9tcHRUZW1wbGF0ZVBsYWNlaG9sZGVyQ29udHJvbGxlciB9IGZyb20gJy4vcHJvbXB0VGVtcGxhdGVQbGFjZWhvbGRlci5qcyc7XG5pbXBvcnQgeyBJTmV3U2Vzc2lvbkNvbXBvc2VyLCBJTmV3U2Vzc2lvblByb21wdE9wdGlvbnNDb250cm9sbGVyLCBORVdfU0VTU0lPTl9QUk9NUFRfVFlQSU5HX0RVUkFUSU9OX01TLCBOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlLCBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlIH0gZnJvbSAnLi9uZXdTZXNzaW9uQ29tcG9zZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5ld1Nlc3Npb25Qcm9tcHRPcHRpb25zV2lkZ2V0IH0gZnJvbSAnLi9uZXdTZXNzaW9uUHJvbXB0T3B0aW9ucy5qcyc7XG5cblxuY29uc3QgT1BFTl9PVEVMX1NFVFRJTkdTX0NPTU1BTkQgPSAnZ2l0aHViLmNvcGlsb3QuY2hhdC5vdGVsLm9wZW5TZXR0aW5ncyc7XG5jb25zdCBPVEVMX1NUQVRVU19DT01NQU5EID0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQub3RlbC5zdGF0dXNBY3RpdmUnO1xuY29uc3QgT1RFTF9TVEFUVVNfRU5UUllfSUQgPSAnY29waWxvdC5vdGVsU3RhdHVzJztcbmNvbnN0IE9URUxfRE9DU19VUkwgPSAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9hZ2VudHMvZ3VpZGVzL21vbml0b3JpbmctYWdlbnRzJztcbmNvbnN0IFNUT1JBR0VfS0VZX0RSQUZUX1NUQVRFID0gJ3Nlc3Npb25zLmRyYWZ0U3RhdGUnO1xuY29uc3QgTUlOX0VESVRPUl9IRUlHSFQgPSA1MDtcbmNvbnN0IE1BWF9FRElUT1JfSEVJR0hUID0gMjAwO1xuY29uc3QgTkVXX0NIQVRfSU5QVVRfRk9OVF9GQU1JTFkgPSAnc3lzdGVtLXVpLCAtYXBwbGUtc3lzdGVtLCBzYW5zLXNlcmlmJztcblxuLyoqIFRydWUgd2hpbGUgZm9jdXMgaXMgaW4gYW4gQWdlbnRzIHdpbmRvdyBjb21wb3NlciB0aGF0IHN1cHBvcnRzIGRpY3RhdGlvbi4gKi9cbmNvbnN0IFNlc3Npb25zQ2hhdElucHV0SGFzRGljdGF0aW9uRm9jdXMgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2Vzc2lvbnNDaGF0SW5wdXRIYXNEaWN0YXRpb25Gb2N1cycsIGZhbHNlLCBsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXRIYXNEaWN0YXRpb25Gb2N1cycsIFwiVHJ1ZSB3aGVuIGZvY3VzIGlzIGluIGFuIEFnZW50cyB3aW5kb3cgY2hhdCBjb21wb3NlciB0aGF0IHN1cHBvcnRzIGRpY3RhdGlvbi5cIikpO1xuXG5jb25zdCBUT0dHTEVfRElDVEFUSU9OX0NPTU1BTkRfSUQgPSAnc2Vzc2lvbnMuYWN0aW9uLmNoYXQudG9nZ2xlRGljdGF0aW9uJztcblxuLyoqIENvbXBvc2VyIHRoZSBkaWN0YXRpb24gc2hvcnRjdXQgdGFyZ2V0cyAodGhlIGNvbXBvc2VyIGlzbid0IGFuIGBJQ2hhdFdpZGdldGApLiAqL1xubGV0IGFjdGl2ZURpY3RhdGlvbkNvbXBvc2VyOiBOZXdDaGF0SW5wdXRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogVE9HR0xFX0RJQ1RBVElPTl9DT01NQU5EX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRTZXNzaW9uc0NoYXRJbnB1dEhhc0RpY3RhdGlvbkZvY3VzLFxuXHRcdENvbnRleHRLZXlFeHByLmhhcyhDaGF0Q29udGV4dEtleXMuc3BlZWNoVG9UZXh0Q29uZmlndXJlZC5rZXkpLFxuXHQpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSxcblx0aGFuZGxlcjogKCkgPT4gYWN0aXZlRGljdGF0aW9uQ29tcG9zZXI/LnRvZ2dsZURpY3RhdGlvbigpLFxufSk7XG5cbi8vIFByZXNlcnZlIHRoZSBjb21tYW5kIGlkIHNvIHB1c2gtdG8tdGFsayBob2xkIG1vZGUgY2FuIHRyYWNrIHRoaXMgY2hvcmQuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2FnZW50c1ZvaWNlLnN0YXJ0Vm9pY2VJbkNoYXQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRTZXNzaW9uc0NoYXRJbnB1dEhhc0RpY3RhdGlvbkZvY3VzLFxuXHRcdEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHQpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuU3BhY2UsXG59KTtcblxuaW50ZXJmYWNlIElEcmFmdFN0YXRlIHtcblx0aW5wdXRUZXh0OiBzdHJpbmc7XG5cdGF0dGFjaG1lbnRzOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG59XG5cbmNsYXNzIE5ld0NoYXRJbnB1dFN0YXR1c0FjdGlvblZpZXdJdGVtIGV4dGVuZHMgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyQ29udGVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBNZW51SXRlbUFjdGlvbixcblx0XHRvcHRpb25zOiBJTWVudUVudHJ5QWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFN0YXR1c0l0ZW1TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlOiBJQ2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhY3Rpb24sIG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRpZiAodGhpcy5fY29tbWFuZEFjdGlvbi5pZCAhPT0gT1RFTF9TVEFUVVNfQ09NTUFORCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuZW50cnkuaWQgPT09IE9URUxfU1RBVFVTX0VOVFJZX0lEKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIG9uQ2xpY2soZXZlbnQ6IE1vdXNlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fY29tbWFuZEFjdGlvbi5pZCA9PT0gT1RFTF9TVEFUVVNfQ09NTUFORCAmJiB0aGlzLmVsZW1lbnQpIHtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLnNob3dNYW5hZ2VkSG92ZXIodGhpcy5lbGVtZW50KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBzdXBlci5vbkNsaWNrKGV2ZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRIb3ZlckNvbnRlbnRzKCk6IElNYW5hZ2VkSG92ZXJDb250ZW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY29tbWFuZEFjdGlvbi5pZCA9PT0gT1RFTF9TVEFUVVNfQ09NTUFORCkge1xuXHRcdFx0cmV0dXJuIHsgZWxlbWVudDogKCkgPT4gdGhpcy5fcmVuZGVyU3RhdHVzSG92ZXIoKSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5nZXRIb3ZlckNvbnRlbnRzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl9jb21tYW5kQWN0aW9uLmlkID09PSBPVEVMX1NUQVRVU19DT01NQU5EKSB7XG5cdFx0XHRjb25zdCB0b29sdGlwID0gdGhpcy5fZ2V0U3RhdHVzRW50cnlUb29sdGlwKCk7XG5cdFx0XHRpZiAodG9vbHRpcCkge1xuXHRcdFx0XHRyZXR1cm4gdG9vbHRpcDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuZ2V0VG9vbHRpcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U3RhdHVzRW50cnlUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLmNoYXRTdGF0dXNJdGVtU2VydmljZS5nZXRFbnRyaWVzKCkpIHtcblx0XHRcdGlmIChlbnRyeS5pZCA9PT0gT1RFTF9TVEFUVVNfRU5UUllfSUQpIHtcblx0XHRcdFx0cmV0dXJuIGVudHJ5LnRvb2x0aXA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclN0YXR1c0hvdmVyKCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmhvdmVyQ29udGVudERpc3Bvc2FibGVzLnZhbHVlID0gc3RvcmU7XG5cblx0XHRjb25zdCByb290ID0gZG9tLiQoJy5uZXctY2hhdC1pbnB1dC1zdGF0dXMtaG92ZXInKTtcblx0XHRyb290LmFwcGVuZENoaWxkKGRvbS4kKCcubmV3LWNoYXQtaW5wdXQtc3RhdHVzLWhvdmVyLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnbmV3Q2hhdElucHV0LnN0YXR1cy5vdGVsLnRpdGxlJywgXCJNb25pdG9yaW5nIHdpdGggT3BlblRlbGVtZXRyeSBlbmFibGVkXCIpKSk7XG5cdFx0cm9vdC5hcHBlbmRDaGlsZChkb20uJCgnLm5ldy1jaGF0LWlucHV0LXN0YXR1cy1ob3Zlci1kZXRhaWwnLCB1bmRlZmluZWQsIHRoaXMuX2dldFN0YXR1c0VudHJ5VG9vbHRpcCgpID8/IHN1cGVyLmdldFRvb2x0aXAoKSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHJvb3QuYXBwZW5kQ2hpbGQoZG9tLiQoJy5uZXctY2hhdC1pbnB1dC1zdGF0dXMtaG92ZXItYWN0aW9ucycpKTtcblx0XHRjb25zdCBsZWFybk1vcmVCdXR0b24gPSBzdG9yZS5hZGQobmV3IEJ1dHRvbihhY3Rpb25zLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0bGVhcm5Nb3JlQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ25ld0NoYXRJbnB1dC5zdGF0dXMub3RlbC5sZWFybk1vcmUnLCBcIkxlYXJuIE1vcmVcIik7XG5cdFx0c3RvcmUuYWRkKGxlYXJuTW9yZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLm9wZW4nLCBVUkkucGFyc2UoT1RFTF9ET0NTX1VSTCkpO1xuXHRcdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1hbmFnZUJ1dHRvbiA9IHN0b3JlLmFkZChuZXcgQnV0dG9uKGFjdGlvbnMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRtYW5hZ2VCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbmV3Q2hhdElucHV0LnN0YXR1cy5vdGVsLm1hbmFnZScsIFwiTWFuYWdlXCIpO1xuXHRcdHN0b3JlLmFkZChtYW5hZ2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoT1BFTl9PVEVMX1NFVFRJTkdTX0NPTU1BTkQpO1xuXHRcdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiByb290O1xuXHR9XG59XG5cbi8qKlxuICogT3B0aW9ucyBwYXNzZWQgdG8gdGhlIHtAbGluayBOZXdDaGF0SW5wdXRXaWRnZXR9J3MgYHNlbmRSZXF1ZXN0YCBjYWxsYmFjayB3aGVuXG4gKiB0aGUgdXNlciBzdWJtaXRzIHRoZSBpbnB1dC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTmV3Q2hhdElucHV0U2VuZFJlcXVlc3Qge1xuXHRyZWFkb25seSBxdWVyeTogc3RyaW5nO1xuXHRyZWFkb25seSBhdHRhY2htZW50cz86IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblx0cmVhZG9ubHkgYmFja2dyb3VuZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmFuZG9taXplZCwgZnJpZW5kbHkgcGxhY2Vob2xkZXJzIHNob3duIGluIHRoZSBuZXctc2Vzc2lvbiBjaGF0IGlucHV0XG4gKiB0byBhZGQgYSBiaXQgb2YgcGVyc29uYWxpdHkuIE9uZSBpcyBwaWNrZWQgcGVyIHdpZGdldCBpbnN0YW5jZSwgYXZvaWRpbmdcbiAqIGFuIGltbWVkaWF0ZSByZXBlYXQgb2YgdGhlIHByZXZpb3VzIHBpY2suXG4gKi9cbmNvbnN0IFJBTkRPTV9QTEFDRUhPTERFUlMgPSBbXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci53aGF0QXJlWW91QnVpbGRpbmcnLCBcIldoYXQgYXJlIHlvdSBidWlsZGluZz9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci53aGF0V2lsbFlvdVNoaXBUb2RheScsIFwiV2hhdCB3aWxsIHlvdSBzaGlwIHRvZGF5P1wiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLmRlc2NyaWJlV2hhdFlvdVdhbnRUb0J1aWxkJywgXCJEZXNjcmliZSB3aGF0IHlvdSB3YW50IHRvIGJ1aWxkXCIpLFxuXHRsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXQucGxhY2Vob2xkZXIud2hhdHNZb3VyTmV4dE1pbGVzdG9uZScsIFwiV2hhdCdzIHlvdXIgbmV4dCBtaWxlc3RvbmU/XCIpLFxuXHRsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXQucGxhY2Vob2xkZXIud2hhdEFyZVlvdVRyeWluZ1RvQWNoaWV2ZScsIFwiV2hhdCBhcmUgeW91IHRyeWluZyB0byBhY2hpZXZlP1wiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLnBpdGNoWW91cklkZWEnLCBcIlBpdGNoIHlvdXIgaWRlYVwiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLndoYXRzVGhlR29hbCcsIFwiV2hhdCdzIHRoZSBnb2FsP1wiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLndoYXRXaWxsWW91Q3JlYXRlJywgXCJXaGF0IHdpbGwgeW91IGNyZWF0ZT9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci53aGF0RmVhdHVyZUFyZVlvdURyZWFtaW5nVXAnLCBcIldoYXQgZmVhdHVyZSBhcmUgeW91IGRyZWFtaW5nIHVwP1wiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLmRlc2NyaWJlVGhlT3V0Y29tZScsIFwiRGVzY3JpYmUgdGhlIG91dGNvbWUgeW91IHdhbnRcIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci53aGF0UHJvYmxlbUFyZVlvdVNvbHZpbmcnLCBcIldoYXQgcHJvYmxlbSBhcmUgeW91IHNvbHZpbmc/XCIpLFxuXHRsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXQucGxhY2Vob2xkZXIud2hhdHNOZXh0T25Zb3VyUm9hZG1hcCcsIFwiV2hhdCdzIG5leHQgb24geW91ciByb2FkbWFwP1wiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLndoYXRXb3VsZFlvdUxpa2VUb0F1dG9tYXRlJywgXCJXaGF0IHdvdWxkIHlvdSBsaWtlIHRvIGF1dG9tYXRlP1wiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLndoYXRXaWxsWW91TGF1bmNoJywgXCJXaGF0IHdpbGwgeW91IGxhdW5jaD9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci5kZXNjcmliZVlvdXJNaXNzaW9uJywgXCJEZXNjcmliZSB5b3VyIG1pc3Npb25cIiksXG5dO1xuXG5sZXQgbGFzdFBsYWNlaG9sZGVySW5kZXggPSAtMTtcbmZ1bmN0aW9uIGdldFJhbmRvbUNoYXRJbnB1dFBsYWNlaG9sZGVyKCk6IHN0cmluZyB7XG5cdGxldCBpbmRleCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIFJBTkRPTV9QTEFDRUhPTERFUlMubGVuZ3RoKTtcblx0aWYgKGluZGV4ID09PSBsYXN0UGxhY2Vob2xkZXJJbmRleCkge1xuXHRcdGluZGV4ID0gKGluZGV4ICsgMSkgJSBSQU5ET01fUExBQ0VIT0xERVJTLmxlbmd0aDtcblx0fVxuXHRsYXN0UGxhY2Vob2xkZXJJbmRleCA9IGluZGV4O1xuXHRyZXR1cm4gUkFORE9NX1BMQUNFSE9MREVSU1tpbmRleF07XG59XG5cbi8vICNyZWdpb24gLS0tIE5ldyBDaGF0IFdpZGdldCAtLS1cblxuZXhwb3J0IGNsYXNzIE5ld0NoYXRJbnB1dFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQsIElOZXdTZXNzaW9uQ29tcG9zZXIge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBjb21wYWN0TW9kZWxQaWNrZXJXaWR0aCA9IDI4MDtcblxuXHRyZWFkb25seSBzZXNzaW9uVHlwZVBpY2tlcjogU2Vzc2lvblR5cGVQaWNrZXI7XG5cblx0LyoqIEFyYml0cmF0ZXMgd2hpY2ggbm90aWNlIG9jY3VwaWVzIHRoZSBhcmVhIGFib3ZlIHRoaXMgaW5wdXQuICovXG5cdHJlYWRvbmx5IG5vdGljZUhvc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2hhdElucHV0Tm90aWNlSG9zdCgoKSA9PiB0aGlzLmZvY3VzKCkpKTtcblx0cHJpdmF0ZSBfZ2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBUaGUgY2Fub25pY2FsIG5vdGljZSBzbG90LCBkaXJlY3RseSBhYm92ZSB0aGlzIGlucHV0LiAqL1xuXHRnZXQgZ2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXJFbGVtZW50KCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXI7XG5cdH1cblxuXG5cdC8vIElIaXN0b3J5TmF2aWdhdGlvbldpZGdldFxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEJsdXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyID0gdGhpcy5fb25EaWRCbHVyLmV2ZW50O1xuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLl9lZGl0b3JDb250YWluZXI7IH1cblxuXHQvKiogVGhlIHVuZGVybHlpbmcgaW5wdXQgZWRpdG9yLiBFeHBvc2VkIGZvciBjb21wb25lbnQgZml4dHVyZXMuICovXG5cdGdldCBpbnB1dEVkaXRvcigpOiBDb2RlRWRpdG9yV2lkZ2V0IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2VkaXRvcjsgfVxuXG5cdC8qKiBUaGUgY3VycmVudCBtb2RlbC1zZWxlY3Rpb24gc3RhdGUuIEV4cG9zZWQgc28gaG9zdCB3aWRnZXRzIGNhbiByZWFjdCB0byBtb2RlbCBjaGFuZ2VzLiAqL1xuXHRnZXQgc2VsZWN0ZWRNb2RlbFN0YXRlKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwuc3RhdGU7IH1cblxuXHRnZXQgd29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlKCk6IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuZ2V0V29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlPy4oKTtcblx0fVxuXG5cdC8qKiBPcGVucyB0aGUgbW9kZWwgcGlja2VyIGRyb3Bkb3duLiAqL1xuXHRvcGVuTW9kZWxQaWNrZXIoKTogdm9pZCB7IHRoaXMuX25ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2Uub3Blbk1vZGVsUGlja2VyKCk7IH1cblxuXHQvKiogTW92ZXMgdGhlIHByb3ZpZGVyLWNvbnRyaWJ1dGVkIHNlc3Npb24gY29udHJvbHMgaW50byB0aGUgZ2l2ZW4gY29udGFpbmVyLiAqL1xuXHRyZW5kZXJTZXNzaW9uQ29udHJvbHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbkNvbnRyb2xzQ29udGFpbmVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05ld0NoYXRJbnB1dFdpZGdldCBtdXN0IGJlIHJlbmRlcmVkIGJlZm9yZSBpdHMgc2Vzc2lvbiBjb250cm9scy4nKTtcblx0XHR9XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3Nlc3Npb25Db250cm9sc0NvbnRhaW5lcik7XG5cdH1cblxuXHQvLyBJbnB1dFxuXHRwcml2YXRlIF9lZGl0b3IhOiBDb2RlRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIF9lZGl0b3JDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRNb2RlbFJlZmVyZW5jZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4+KCkpO1xuXHRwcml2YXRlIF9zZXNzaW9uQ29udHJvbHNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRUZW1wbGF0ZVBsYWNlaG9sZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFByb21wdFRlbXBsYXRlUGxhY2Vob2xkZXJDb250cm9sbGVyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbXB0T3B0aW9uc1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1dpZGdldD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdE9wdGlvbnNSZWZyZXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpKTtcblx0cHJpdmF0ZSBfcHJvbXB0T3B0aW9uc1N0YXRlOiBOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1N0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcm9tcHRPcHRpb25zQ29udHJvbGxlcjogSU5ld1Nlc3Npb25Qcm9tcHRPcHRpb25zQ29udHJvbGxlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJvbXB0T3B0aW9uc0Rpc21pc3NlZCA9IGZhbHNlO1xuXG5cdC8vIFNlbmQgYnV0dG9uXG5cdHByaXZhdGUgX3NlbmRCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VuZGluZyA9IGZhbHNlO1xuXG5cdC8vIExvYWRpbmcgc3RhdGVcblx0cHJpdmF0ZSBfbG9hZGluZ1NwaW5uZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2FkaW5nRGVsYXlEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRUeXBpbmdBbmltYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVByb21wdFR5cGluZ0FuaW1hdGlvbj4oKSk7XG5cblx0Ly8gQXR0YWNoZWQgY29udGV4dFxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0QXR0YWNobWVudHM6IE5ld0NoYXRDb250ZXh0QXR0YWNobWVudHM7XG5cblx0Ly8gU2xhc2ggY29tbWFuZHNcblx0cHJpdmF0ZSBfYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlcjogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSA9IG5ldyBOZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsOiBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FuU2VuZFJlcXVlc3Q6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wYWN0TW9kZWxQaWNrZXIgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdC8vIElucHV0IHN0YXRlXG5cdHByaXZhdGUgX2RyYWZ0U3RhdGU6IElEcmFmdFN0YXRlIHwgdW5kZWZpbmVkID0ge1xuXHRcdGlucHV0VGV4dDogJycsXG5cdFx0YXR0YWNobWVudHM6IFtdLFxuXHR9O1xuXG5cdC8vIElucHV0IGhpc3Rvcnlcblx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeTogQ2hhdEhpc3RvcnlOYXZpZ2F0b3I7XG5cdHByaXZhdGUgX2hpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudCE6IElIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHRbJ2hpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudCddO1xuXHRwcml2YXRlIF9oaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudCE6IElIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHRbJ2hpc3RvcnlOYXZpZ2F0aW9uRm9yd2FyZHNFbmFibGVtZW50J107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiB7XG5cdFx0XHRzZXNzaW9uOiBJT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cdFx0XHRnZXRDb250ZXh0Rm9sZGVyVXJpOiAoKSA9PiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0XHRnZXRXb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2U/OiAoKSA9PiBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlO1xuXHRcdFx0c2VuZFJlcXVlc3Q6IChyZXF1ZXN0OiBJTmV3Q2hhdElucHV0U2VuZFJlcXVlc3QpID0+IFByb21pc2U8Ym9vbGVhbj47XG5cdFx0XHRjYW5TZW5kUmVxdWVzdDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdFx0XHRjYW5TdWJtaXRXaXRob3V0U2Vzc2lvbj86IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRcdFx0aGFzQWRkaXRpb25hbFNlbmRDb250ZW50PzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdFx0XHRsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0XHRcdGhpc3RvcnlLZXk/OiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRcdFx0bWluRWRpdG9ySGVpZ2h0PzogbnVtYmVyO1xuXHRcdFx0cGxhY2Vob2xkZXI/OiBzdHJpbmc7XG5cdFx0XHRyZW5kZXJTZXNzaW9uVHlwZVBpY2tlckluQ29udHJvbHM/OiBib29sZWFuO1xuXHRcdFx0cmVuZGVyU2VuZEJ1dHRvbj86IGJvb2xlYW47XG5cdFx0XHRzZXNzaW9uVHlwZVBpY2tlck9wdGlvbnM/OiBJU2Vzc2lvblR5cGVQaWNrZXJPcHRpb25zO1xuXHRcdFx0c3VwcG9ydHNCYWNrZ3JvdW5kPzogYm9vbGVhbjtcblx0XHRcdGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQ/OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0XHRcdC8qKlxuXHRcdFx0ICogS2VlcCB0aGlzIGNvbXBvc2VyIGEgdmFsaWQgdm9pY2UgdGFyZ2V0IGV2ZW4gd2hpbGUgYSBjcmVhdGVkIHNlc3Npb25cblx0XHRcdCAqIGlzIGFjdGl2ZS4gVXNlZCBieSB0aGUgaW4tc2Vzc2lvbiBcIm5ldyBjaGF0XCIgY29tcG9zZXIgc28gZGljdGF0aW9uXG5cdFx0XHQgKiBjcmVhdGVzIGEgcGFyYWxsZWwgY2hhdCBpbnN0ZWFkIG9mIHJvdXRpbmcgdG8gdGhlIHBhcmVudCBzZXNzaW9uJ3Ncblx0XHRcdCAqIGNoYXQgd2lkZ2V0LiBUaGUgd2VsY29tZSBjb21wb3NlciBsZWF2ZXMgdGhpcyB1bnNldC5cblx0XHRcdCAqL1xuXHRcdFx0dm9pY2VSb3V0ZXNXaGlsZVNlc3Npb25BY3RpdmU/OiBib29sZWFuO1xuXHRcdH0sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFBhc3RlVGFyZ2V0U2VydmljZTogSUNoYXRQYXN0ZVRhcmdldFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlOiBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsXG5cdFx0QElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlOiBJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UsXG5cdFx0QElDaGF0SW5wdXROb3RpY2VIdWJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdElucHV0Tm90aWNlSHViU2VydmljZTogSUNoYXRJbnB1dE5vdGljZUh1YlNlcnZpY2UsXG5cdFx0QElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZTogSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElWb2ljZVNlc3Npb25Db250cm9sbGVyIHByaXZhdGUgcmVhZG9ubHkgdm9pY2VTZXNzaW9uQ29udHJvbGxlcjogSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsXG5cdFx0QElWb2ljZUlucHV0TW9kZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2b2ljZUlucHV0TW9kZVNlcnZpY2U6IElWb2ljZUlucHV0TW9kZVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlOiBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UsXG5cdFx0QElOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZTogSU5ld0NoYXRWb2ljZVRhcmdldFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsLCB0aGlzLm9wdGlvbnMuc2Vzc2lvbikpO1xuXHRcdHRoaXMuX2NhblNlbmRSZXF1ZXN0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5jYW5TdWJtaXRXaXRob3V0U2Vzc2lvbj8ucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWxTZWxlY3Rpb24gPSB0aGlzLl9zZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbC5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5vcHRpb25zLmNhblNlbmRSZXF1ZXN0LnJlYWQocmVhZGVyKSAmJiBtb2RlbFNlbGVjdGlvbi5oYXNTZWxlY3RhYmxlTW9kZWwgJiYgIW1vZGVsU2VsZWN0aW9uLnBlbmRpbmdTZWxlY3Rpb247XG5cdFx0fSk7XG5cdFx0dGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSwgdGhpcy5fbmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZV0sXG5cdFx0XHRbSVNlc3Npb25Db250ZXh0LCBuZXcgU2Vzc2lvbkNvbnRleHQodGhpcy5vcHRpb25zLnNlc3Npb24pXSxcblx0XHRcdFtJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwsIHRoaXMuX3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsXSxcblx0XHQpKSk7XG5cdFx0dGhpcy5faGlzdG9yeSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLmhpc3RvcnlLZXkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHRoaXMuX3NldEhpc3RvcnlLZXkodGhpcy5vcHRpb25zLmhpc3RvcnlLZXk/LnJlYWQocmVhZGVyKSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBR0VOVF9TRVNTSU9OU19TQ09QRURfSU5QVVRfSElTVE9SWV9TRVRUSU5HKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NldEhpc3RvcnlLZXkodGhpcy5vcHRpb25zLmhpc3RvcnlLZXk/LmdldCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZXh0QXR0YWNobWVudHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRDb250ZXh0QXR0YWNobWVudHMpKTtcblx0XHQvLyBBbHdheXMgdXNlIHRoZSBtb2JpbGUtYXdhcmUgcGlja2VyLiBJdHMgb3ZlcnJpZGVzIGJhaWwgdG8gdGhlXG5cdFx0Ly8gZGVza3RvcCBiZWhhdmlvciB3aGVuIGBpc1Bob25lTGF5b3V0KClgIGlzIGZhbHNlLCBzbyBwaWNraW5nXG5cdFx0Ly8gdGhlIHNhbWUgY2xhc3MgcmVnYXJkbGVzcyBvZiBjb25zdHJ1Y3Rpb24tdGltZSB2aWV3cG9ydFxuXHRcdC8vIGF2b2lkcyBhIGNsYXNzLW1pc21hdGNoIHdoZW4gdGhlIHVzZXIgcmVzaXplcyBhY3Jvc3MgdGhlXG5cdFx0Ly8gcGhvbmUgYnJlYWtwb2ludCBhZnRlciB0aGUgY2hhdCBpbnB1dCBtb3VudGVkLlxuXHRcdHRoaXMuc2Vzc2lvblR5cGVQaWNrZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vYmlsZVNlc3Npb25UeXBlUGlja2VyLCB0aGlzLm9wdGlvbnMuc2Vzc2lvbiwgdGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyT3B0aW9ucykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5vbkRpZENoYW5nZUNvbnRleHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlRHJhZnRTdGF0ZSgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XG5cdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX2NhblNlbmRSZXF1ZXN0LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMub3B0aW9ucy5oYXNBZGRpdGlvbmFsU2VuZENvbnRlbnQ/LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGlzTG9hZGluZyA9IHRoaXMub3B0aW9ucy5sb2FkaW5nLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2xvYWRpbmdTcGlubmVyPy5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgaXNMb2FkaW5nKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEhpc3RvcnlLZXkoaGlzdG9yeUtleTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5faGlzdG9yeS5zZXRIaXN0b3J5S2V5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQUdFTlRfU0VTU0lPTlNfU0NPUEVEX0lOUFVUX0hJU1RPUllfU0VUVElORykgIT09IGZhbHNlID8gaGlzdG9yeUtleSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvLyAtLS0gUmVuZGVyaW5nIC0tLVxuXG5cdHJlbmRlcihwYXJlbnQ6IEhUTUxFbGVtZW50LCByb290OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIElucHV0IHNsb3QsIGFuZCB0aGUgc3RhY2sgdGhlIG5vdGljZXMsIHByb21wdCBvcHRpb25zIGFuZCBpbnB1dCBhcmVhIHNpdCBpbi5cblx0XHRjb25zdCBjaGF0SW5wdXRDb250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoYC5uZXctY2hhdC1pbnB1dC1jb250YWluZXIuJHtjaGF0SW5wdXRTdGFja0NsYXNzfWApKTtcblxuXHRcdC8vIE92ZXJmbG93IHdpZGdldCBET00gbm9kZSBhdCB0aGUgdG9wIGxldmVsIHNvIHRoZSBzdWdnZXN0IHdpZGdldFxuXHRcdC8vIGlzIG5vdCBjbGlwcGVkIGJ5IGFueSBvdmVyZmxvdzpoaWRkZW4gYW5jZXN0b3IuXG5cdFx0Ly8gTW91bnRlZCBvbiB0aGUgd29ya2JlbmNoIGNvbnRhaW5lciAobm90IHRoZSBjb21wb3NlciBzdWJ0cmVlKSBzbyBvdmVyZmxvd1xuXHRcdC8vIHdpZGdldHMgc3VjaCBhcyBzdWdnZXN0IGFuZCB0aGUgcG9zdC1wYXN0ZSBzZWxlY3RvciBhcmUgbm90IGNsaXBwZWQgYnksXG5cdFx0Ly8gb3Igc3RhY2tlZCBiZW5lYXRoLCB0aGUgY29tcG9zZXIncyBvd24gbGF5b3V0LiBCZWNhdXNlIGl0IGxpdmVzIG91dHNpZGUgdGhlXG5cdFx0Ly8gY29tcG9zZXIsIGl0IGhhcyB0byBiZSB0YWtlbiBkb3duIHdpdGggdGhlIHdpZGdldCByYXRoZXIgdGhhbiB3aXRoIGByb290YC5cblx0XHRjb25zdCBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihkb20uZ2V0V2luZG93KHJvb3QpKS5hcHBlbmRDaGlsZChkb20uJCgnLnNlc3Npb25zLWNoYXQtZWRpdG9yLW92ZXJmbG93Lm1vbmFjby1lZGl0b3InKSk7XG5cdFx0Ly8gU3VwcHJlc3MgdGhlIGRlZmF1bHQgYFRleHRgIGtpbmQgaWNvbiBpbiB0aGUgc3VnZ2VzdCB3aWRnZXQ7IGNoYXQgc2xhc2gvc2tpbGxcblx0XHQvLyBjb21wbGV0aW9ucyB1c2UgdGhhdCBraW5kIGFuZCByZWx5IG9uIHRoZSBjaGF0IG1vZHVsZSdzIENTUyBydWxlIHNjb3BlZCB0byB0aGlzIGNsYXNzLlxuXHRcdGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUuY2xhc3NMaXN0LmFkZCgnaGlkZVN1Z2dlc3RUZXh0SWNvbnMnKTtcblx0XHQvLyBSZWdpc3RlcmVkIGJlZm9yZSB0aGUgZWRpdG9yIHNvIGl0IGlzIHJlbW92ZWQgYWZ0ZXIgdGhlIGVkaXRvciBcdTIwMTQgYW5kIHRoZVxuXHRcdC8vIG92ZXJmbG93IHdpZGdldHMgaXQgb3ducyBcdTIwMTQgaGF2ZSBiZWVuIGRpc3Bvc2VkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRJbnB1dE5vdGljZUh1YlNlcnZpY2UucmVnaXN0ZXJIb3N0KHRoaXMubm90aWNlSG9zdCwgY2hhdElucHV0Q29udGFpbmVyKSk7XG5cblx0XHQvLyBTY29wZXMgdGhlIG5vdGljZSBmb2N1cyBjb21tYW5kIHRvIHRoaXMgY29tcG9zZXIuIFRyYWNrZWQgb24gdGhlIHdob2xlXG5cdFx0Ly8gY29udGFpbmVyIHJhdGhlciB0aGFuIHRoZSBlZGl0b3IsIHNvIHRoZSBjb21tYW5kIGNhbiBhbHNvIHRvZ2dsZSBmb2N1c1xuXHRcdC8vIGJhY2sgb3V0IG9mIGEgbm90aWNlIG9uY2UgaXQgaXMgaW4gb25lLlxuXHRcdGNvbnN0IGNvbXBvc2VyRm9jdXNLZXkgPSBDaGF0Q29udGV4dEtleXMuaW5DaGF0Q29tcG9zZXIuYmluZFRvKHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNoYXRJbnB1dENvbnRhaW5lcikpKTtcblx0XHRjb25zdCBjb21wb3NlckZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKGNoYXRJbnB1dENvbnRhaW5lcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbXBvc2VyRm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gY29tcG9zZXJGb2N1c0tleS5zZXQodHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb21wb3NlckZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gY29tcG9zZXJGb2N1c0tleS5zZXQoZmFsc2UpKSk7XG5cblx0XHQvLyBOb3RpZmljYXRpb24gd2lkZ2V0IGFib3ZlIHRoZSBpbnB1dCBhcmVhXG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uQ29udGFpbmVyID0gZG9tLmFwcGVuZChjaGF0SW5wdXRDb250YWluZXIsIGRvbS4kKGAuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tY29udGFpbmVyLiR7Y2hhdElucHV0U3RhY2tTbG90Q2xhc3N9YCkpO1xuXHRcdC8vIERlY2xhcmVkIHVwIGZyb250OiB0aGUgdmlzaWJpbGl0eSBjYWxsYmFjayBjYW4gZmlyZSB3aGlsZSB0aGUgd2lkZ2V0IGlzXG5cdFx0Ly8gc3RpbGwgYmVpbmcgY29uc3RydWN0ZWQsIGJlZm9yZSB0aGUgYmluZGluZyBiZWxvdyBpcyBhc3NpZ25lZC5cblx0XHRjb25zdCBub3RpZmljYXRpb25XaWRnZXQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQsXG5cdFx0XHR7XG5cdFx0XHRcdG1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiB0aGlzLnNlc3Npb25UeXBlUGlja2VyLm1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0XHRkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkOiB0aGlzLm9wdGlvbnMuZGVmZXJyZWROb3RpZmljYXRpb25zRW5hYmxlZCxcblx0XHRcdFx0b3Blbk1vZGVsUGlja2VyOiAoKSA9PiB0aGlzLl9uZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlLm9wZW5Nb2RlbFBpY2tlcigpLFxuXHRcdFx0XHRzd2l0Y2hUb01vZGVsOiBtb2RlbElkZW50aWZpZXIgPT4gdGhpcy5fbmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZS5zd2l0Y2hUb01vZGVsKG1vZGVsSWRlbnRpZmllciksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogKHZpc2libGUsIGZvY3VzVGFyZ2V0KSA9PiB0aGlzLm5vdGljZUhvc3Quc2V0T2NjdXBpZWQoQ2hhdElucHV0Tm90aWNlTGFuZS5Ob3RpZmljYXRpb24sIHZpc2libGUsIGZvY3VzVGFyZ2V0KSxcblx0XHRcdFx0Zm9jdXNJbnB1dDogKCkgPT4gdGhpcy5mb2N1cygpLFxuXHRcdFx0fSxcblx0XHQpKTtcblx0XHRub3RpZmljYXRpb25XaWRnZXQuYXR0YWNoVG8obm90aWZpY2F0aW9uQ29udGFpbmVyKTtcblxuXHRcdC8vIEZpcnN0LXJ1biB2b2ljZSBhbmQgZGljdGF0aW9uIGludHJvZHVjdGlvbnMsIGRvY2tlZCBkaXJlY3RseSBhYm92ZSB0aGVcblx0XHQvLyBpbnB1dCBhcmVhIHNvIHRoZXkgcmVhZCBhcyBvbmUgc3RhY2sgd2l0aCBpdC5cblx0XHRjb25zdCB2b2ljZU9uYm9hcmRpbmdDb250YWluZXIgPSBkb20uYXBwZW5kKGNoYXRJbnB1dENvbnRhaW5lciwgZG9tLiQoYC52b2ljZS1tb2RlLW9uYm9hcmRpbmctY29udGFpbmVyLiR7Y2hhdElucHV0U3RhY2tTbG90Q2xhc3N9YCkpO1xuXHRcdGNvbnN0IGRpY3RhdGlvbk9uYm9hcmRpbmdDb250YWluZXIgPSBkb20uYXBwZW5kKGNoYXRJbnB1dENvbnRhaW5lciwgZG9tLiQoYC5kaWN0YXRpb24tb25ib2FyZGluZy1jb250YWluZXIuJHtjaGF0SW5wdXRTdGFja1Nsb3RDbGFzc31gKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJDaGF0SW5wdXRPbmJvYXJkaW5nSG9zdHMoXG5cdFx0XHR0aGlzLm5vdGljZUhvc3QsXG5cdFx0XHR7IHZvaWNlOiB2b2ljZU9uYm9hcmRpbmdDb250YWluZXIsIGRpY3RhdGlvbjogZGljdGF0aW9uT25ib2FyZGluZ0NvbnRhaW5lciB9LFxuXHRcdFx0Y2hhdElucHV0Q29udGFpbmVyLFxuXHRcdFx0KCkgPT4gdGhpcy5mb2N1cygpLFxuXHRcdFx0dGhpcy52b2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSxcblx0XHRcdHRoaXMuZGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHQvLyBHZXR0aW5nLXN0YXJ0ZWQgdGlwOiB0aGUgY2Fub25pY2FsIG5vdGljZSBzbG90LCBkaXJlY3RseSBhYm92ZSBhbmRcblx0XHQvLyBhdHRhY2hlZCB0byB0aGUgaW5wdXQsIG1hdGNoaW5nIHRoZSB3b3JrYmVuY2ggY2hhdCBpbnB1dC5cblx0XHR0aGlzLl9nZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lciA9IGRvbS5hcHBlbmQoY2hhdElucHV0Q29udGFpbmVyLCBkb20uJChgLmNoYXQtZ2V0dGluZy1zdGFydGVkLXRpcC1jb250YWluZXIuJHtjaGF0SW5wdXRTdGFja1Nsb3RDbGFzc31gKSk7XG5cblx0XHR0aGlzLl9wcm9tcHRPcHRpb25zV2lkZ2V0LnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOZXdTZXNzaW9uUHJvbXB0T3B0aW9uc1dpZGdldCwgY2hhdElucHV0Q29udGFpbmVyLCB7XG5cdFx0XHRzZWxlY3RPcHRpb246IGFzeW5jIChvcHRpb24sIGV4cGVjdGVkSW5wdXQsIGFuaW1hdGUpID0+IHtcblx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHRjb25zdCBpbnNlcnRlZCA9IGFuaW1hdGVcblx0XHRcdFx0XHQ/IGF3YWl0IHRoaXMuYW5pbWF0ZVByb21wdChvcHRpb24ucHJvbXB0LCBORVdfU0VTU0lPTl9QUk9NUFRfVFlQSU5HX0RVUkFUSU9OX01TLCBvcHRpb24ucGxhY2Vob2xkZXIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIGV4cGVjdGVkSW5wdXQpXG5cdFx0XHRcdFx0OiB0aGlzLl9yZXBsYWNlUHJvbXB0KG9wdGlvbi5wcm9tcHQsIG9wdGlvbi5wbGFjZWhvbGRlciwgZXhwZWN0ZWRJbnB1dCk7XG5cdFx0XHRcdGNvbnN0IGdlbmVyYXRlZFZhbHVlID0gb3B0aW9uLnBsYWNlaG9sZGVyID8gb3B0aW9uLnByb21wdC5yZXBsYWNlKG9wdGlvbi5wbGFjZWhvbGRlciwgJycpIDogb3B0aW9uLnByb21wdDtcblx0XHRcdFx0aWYgKGluc2VydGVkICYmICh0aGlzLl9lZGl0b3IuZ2V0VmFsdWUoKSA9PT0gb3B0aW9uLnByb21wdCB8fCB0aGlzLl9lZGl0b3IuZ2V0VmFsdWUoKSA9PT0gZ2VuZXJhdGVkVmFsdWUpKSB7XG5cdFx0XHRcdFx0YXJpYS5zdGF0dXMobG9jYWxpemUoJ25ld1Nlc3Npb25Qcm9tcHRPcHRpb25zLmluc2VydGVkJywgXCJJbnNlcnRlZCBwcm9tcHQ6IHswfVwiLCBvcHRpb24udGl0bGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gaW5zZXJ0ZWQ7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRTZWxlY3RPcHRpb246IG9wdGlvbiA9PiB0aGlzLl9wcm9tcHRPcHRpb25zQ29udHJvbGxlcj8ub25EaWRTZWxlY3RPcHRpb24ob3B0aW9uKSxcblx0XHRcdG9uRGlkQ2xvc2U6ICgpID0+IHRoaXMuX2Rpc21pc3NQcm9tcHRPcHRpb25zKCksXG5cdFx0fSk7XG5cdFx0dGhpcy5fcHJvbXB0T3B0aW9uc1dpZGdldC52YWx1ZS5zZXRTdGF0ZSh0aGlzLl9wcm9tcHRPcHRpb25zU3RhdGUpO1xuXG5cdFx0Ly8gSW5wdXQgYXJlYSBpbnNpZGUgdGhlIGlucHV0IHNsb3Rcblx0XHRjb25zdCBpbnB1dEFyZWFXcmFwcGVyID0gZG9tLmFwcGVuZChjaGF0SW5wdXRDb250YWluZXIsIGRvbS4kKCcubmV3LWNoYXQtaW5wdXQtYXJlYS13cmFwcGVyJykpO1xuXHRcdGNvbnN0IGlucHV0QXJlYSA9IGRvbS5hcHBlbmQoaW5wdXRBcmVhV3JhcHBlciwgZG9tLiQoJy5uZXctY2hhdC1pbnB1dC1hcmVhJykpO1xuXG5cdFx0Ly8gQXR0YWNobWVudHMgcm93IChwaWxscyBvbmx5KSBpbnNpZGUgaW5wdXQgYXJlYSwgYWJvdmUgZWRpdG9yXG5cdFx0Y29uc3QgY29udGV4dEF0dGFjaG1lbnRzID0gdGhpcy5fY29udGV4dEF0dGFjaG1lbnRzO1xuXHRcdGNvbnN0IGF0dGFjaFJvdyA9IGRvbS5hcHBlbmQoaW5wdXRBcmVhLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtYXR0YWNoLXJvdycpKTtcblx0XHRjb25zdCBhdHRhY2hlZENvbnRleHRDb250YWluZXIgPSBkb20uYXBwZW5kKGF0dGFjaFJvdywgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWF0dGFjaGVkLWNvbnRleHQnKSk7XG5cdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLnJlbmRlckF0dGFjaGVkQ29udGV4dChhdHRhY2hlZENvbnRleHRDb250YWluZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdERyYWdBbmREcm9wLCAoKSA9PiB1bmRlZmluZWQsIHtcblx0XHRcdGdldCBhdHRhY2htZW50cygpIHsgcmV0dXJuIGNvbnRleHRBdHRhY2htZW50cy5hdHRhY2htZW50czsgfSxcblx0XHRcdGFkZEF0dGFjaG1lbnRzOiAoZW50cmllczogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKSA9PiBjb250ZXh0QXR0YWNobWVudHMuYWRkQXR0YWNobWVudHMoLi4uZW50cmllcyksXG5cdFx0fSwge1xuXHRcdFx0bGlzdEZvcmVncm91bmQ6IGluYWN0aXZlU2Vzc2lvblZpZXdGb3JlZ3JvdW5kLFxuXHRcdFx0bGlzdEJhY2tncm91bmQ6IGluYWN0aXZlU2Vzc2lvblZpZXdCYWNrZ3JvdW5kLFxuXHRcdFx0b3ZlcmxheUJhY2tncm91bmQ6IEVESVRPUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQsXG5cdFx0fSkpLmFkZE92ZXJsYXkocm9vdCwgcm9vdCk7XG5cblx0XHR0aGlzLl9jcmVhdGVFZGl0b3IoaW5wdXRBcmVhLCBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlKTtcblx0XHRjb25zdCBpbnB1dEhhc0NvbnRlbnQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCwgKCkgPT4gdGhpcy5fZWRpdG9yLmdldFZhbHVlKCkubGVuZ3RoID4gMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UGV0V2lkZ2V0LCBjaGF0SW5wdXRDb250YWluZXIsIGlucHV0QXJlYSwgcm9vdCwgY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksIGlucHV0SGFzQ29udGVudCwgY29uc3RPYnNlcnZhYmxlKHRydWUpLCB0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQpKTtcblx0XHR0aGlzLl9jcmVhdGVJbnB1dFRvb2xiYXIoaW5wdXRBcmVhKTtcblxuXHRcdGNvbnN0IG5ld0NoYXRCb3R0b21Db250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5uZXctY2hhdC1ib3R0b20tY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IG5ld0NoYXRDb250cm9sc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQobmV3Q2hhdEJvdHRvbUNvbnRhaW5lciwgZG9tLiQoJy5uZXctY2hhdC1jb250cm9scy1jb250YWluZXInKSk7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZW5kZXJTZXNzaW9uVHlwZVBpY2tlckluQ29udHJvbHMgIT09IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVHlwZVBpY2tlckhvc3QgPSBkb20uYXBwZW5kKG5ld0NoYXRDb250cm9sc0NvbnRhaW5lciwgZG9tLiQoJy5uZXctY2hhdC1zZXNzaW9uLXR5cGUtcGlja2VyLWhvc3QnKSk7XG5cdFx0XHR0aGlzLnNlc3Npb25UeXBlUGlja2VyLnJlbmRlcihzZXNzaW9uVHlwZVBpY2tlckhvc3QpO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uQ29udHJvbHNDb250YWluZXIgPSB0aGlzLl9zZXNzaW9uQ29udHJvbHNDb250YWluZXIgPSBkb20uYXBwZW5kKG5ld0NoYXRDb250cm9sc0NvbnRhaW5lciwgZG9tLiQoJy5uZXctY2hhdC1zZXNzaW9uLWNvbnRyb2xzJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBzZXNzaW9uQ29udHJvbHNDb250YWluZXIsIE1lbnVzLk5ld1Nlc3Npb25Db250cm9sLCB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gc2Vzc2lvbkNvbnRyb2xzQ29udGFpbmVyLnJlbW92ZSgpIH0pO1xuXG5cdFx0Y29uc3QgcmVwb0NvbmZpZ0NvbnRhaW5lciA9IGRvbS5hcHBlbmQobmV3Q2hhdEJvdHRvbUNvbnRhaW5lciwgZG9tLiQoJy5uZXctY2hhdC1yZXBvLWNvbmZpZy1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHJlcG9Db25maWdDb250YWluZXIsIE1lbnVzLk5ld1Nlc3Npb25SZXBvc2l0b3J5Q29uZmlnLCB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0fSkpO1xuXG5cdFx0Ly8gT24gcGhvbmUsIHRoZSBjaGlwIGxhbmUgaXMgaG9yaXpvbnRhbGx5IHNjcm9sbGFibGUgd2hlbiBpdHNcblx0XHQvLyBjb250ZW50IG92ZXJmbG93cyB0aGUgdmlld3BvcnQuIE5hdGl2ZSB0b3VjaCBzY3JvbGwgaXMgYmxvY2tlZFxuXHRcdC8vIGJlY2F1c2UgZWFjaCBjaGlwIHJlZ2lzdGVycyBhIGBHZXN0dXJlLmFkZFRhcmdldGAgaGFuZGxlciBpblxuXHRcdC8vIGByZW5kZXJQaWNrZXJUcmlnZ2VyYCB0aGF0IGNhbGxzIGBwcmV2ZW50RGVmYXVsdGAgb25cblx0XHQvLyBgdG91Y2htb3ZlYCwgc3dhbGxvd2luZyB0aGUgcGFuLiBUaGUgaGVscGVyIGJlbG93IGluc3RhbGxzIGFcblx0XHQvLyBwb2ludGVyLWV2ZW50LWJhc2VkIHNjcm9sbCBoYW5kbGVyIHRoYXQgbm8tb3BzIG9uIGRlc2t0b3AgYW5kXG5cdFx0Ly8ga2lja3MgaW4gb25jZSBhIGRyYWcgY3Jvc3NlcyBhIHNtYWxsIHRocmVzaG9sZCBvbiBwaG9uZS5cblx0XHR0aGlzLl9yZWdpc3RlcihpbnN0YWxsTW9iaWxlQ2hpcExhbmVTY3JvbGwobmV3Q2hhdEJvdHRvbUNvbnRhaW5lciwgdGhpcy5sYXlvdXRTZXJ2aWNlKSk7XG5cblx0XHQvLyBHZW5lcmljIGV4dGVuc2lvbiBwb2ludCBmb3Igc3RhdHVzIGluZGljYXRvcnMgaW4gdGhlIG5ldy1zZXNzaW9uIHZpZXcuXG5cdFx0Y29uc3Qgc3RhdHVzQ29udGFpbmVyID0gZG9tLmFwcGVuZChyZXBvQ29uZmlnQ29udGFpbmVyLCBkb20uJCgnLm5ldy1jaGF0LXN0YXR1cy10b29sYmFyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHN0YXR1c0NvbnRhaW5lciwgTWVudUlkLkNoYXRJbnB1dFN0YXR1cywge1xuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlIH0sXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IE9URUxfU1RBVFVTX0NPTU1BTkQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOZXdDaGF0SW5wdXRTdGF0dXNBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHQvLyBSZXN0b3JlIGRyYWZ0IGlucHV0IHN0YXRlIGZyb20gc3RvcmFnZVxuXHRcdHRoaXMuX3Jlc3RvcmVTdGF0ZSgpO1xuXG5cdFx0Ly8gVGhlIGNvbXBvc2VyIGlzIGEgc3RhY2ssIGFuZCB3YXMganVzdCBhZGRlZCB0byBpdHMgaG9zdCdzIHN0YWNrLiBIb3N0c1xuXHRcdC8vIG9mdGVuIGRvY2sgYSBub3RpY2UgLSB0aGUgc3ViLXNlc3Npb24gdGlwLCBhIGZlZWRiYWNrIGJhbm5lciAtIGJlZm9yZVxuXHRcdC8vIHRoaXMgcG9pbnQsIGFuZCBub3RoaW5nIHJlcG9ydHMgZm9yIGEgY2hpbGQgYmVpbmcgYWRkZWQuXG5cdFx0Ly9cblx0XHQvLyBTdGFuZGFsb25lLCBub3QgZG9ja2VkOiB0aGUgY29tcG9zZXIgZHJhd3MgaXRzIG93biBmcmFtZSwgc28gYSBub3RpY2Vcblx0XHQvLyBhYm92ZSBpdCBqb2lucyBpdCBidXQgdGhlIHJ1biBzdG9wcyBiZWZvcmUgdGhlIGNvbnRyb2xzIHJvdyBiZWxvdy5cblx0XHRzZXRDaGF0SW5wdXRTdGFja1Nsb3QoY2hhdElucHV0Q29udGFpbmVyLCBDaGF0SW5wdXRTdGFja1Nsb3QuU3RhbmRhbG9uZSk7XG5cdFx0cmVmcmVzaENoYXRJbnB1dFN0YWNrKHBhcmVudCk7XG5cblx0XHQvLyBMYXlvdXQgZWRpdG9yIGFmdGVyIHRoZSBpbnB1dCBzbG90IGZhZGUtaW4gYW5pbWF0aW9uIGNvbXBsZXRlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2hhdElucHV0Q29udGFpbmVyLCAnYW5pbWF0aW9uZW5kJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fZWRpdG9yPy5sYXlvdXQoKTtcblx0XHR9LCB7IG9uY2U6IHRydWUgfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSW5wdXRMb2FkaW5nU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9hZGluZyA9IHRoaXMuX3NlbmRpbmc7XG5cdFx0aWYgKGxvYWRpbmcpIHtcblx0XHRcdGlmICghdGhpcy5fbG9hZGluZ0RlbGF5RGlzcG9zYWJsZS52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvYWRpbmdEZWxheURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fc2VuZGluZykge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9hZGluZ1NwaW5uZXI/LmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDUwMCk7XG5cdFx0XHRcdHRoaXMuX2xvYWRpbmdEZWxheURpc3Bvc2FibGUudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4gY2xlYXJUaW1lb3V0KHRpbWVyKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvYWRpbmdEZWxheURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2xvYWRpbmdTcGlubmVyPy5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIEVkaXRvciAtLS1cblxuXHRwcml2YXRlIF9nZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRjb25zdCB2ZXJib3NlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlNlc3Npb25zQ2hhdCk7XG5cdFx0aWYgKHZlcmJvc2UpIHtcblx0XHRcdGNvbnN0IGtiTGFiZWwgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5PcGVuQWNjZXNzaWJpbGl0eUhlbHApPy5nZXRMYWJlbCgpO1xuXHRcdFx0cmV0dXJuIGtiTGFiZWxcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdElucHV0LmFjY2Vzc2liaWxpdHlIZWxwJywgXCJDaGF0IGlucHV0LiBQcmVzcyBFbnRlciB0byBzZW5kIG91dCB0aGUgcmVxdWVzdC4gVXNlIHswfSBmb3IgQ2hhdCBBY2Nlc3NpYmlsaXR5IEhlbHAuXCIsIGtiTGFiZWwpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRJbnB1dC5hY2Nlc3NpYmlsaXR5SGVscE5vS2InLCBcIkNoYXQgaW5wdXQuIFByZXNzIEVudGVyIHRvIHNlbmQgb3V0IHRoZSByZXF1ZXN0LiBVc2UgdGhlIENoYXQgQWNjZXNzaWJpbGl0eSBIZWxwIGNvbW1hbmQgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXRJbnB1dCcsIFwiQ2hhdCBpbnB1dFwiKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRlcm1pbmFsQ29tbWFuZFByZWZpeCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLm9wdGlvbnMuc2Vzc2lvbi5nZXQoKTtcblx0XHRyZXR1cm4gc2Vzc2lvbiA/IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDYXBhYmlsaXRpZXNGb3JTZXNzaW9uVHlwZShnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvbi5yZXNvdXJjZSkpPy50ZXJtaW5hbENvbW1hbmRQcmVmaXggOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVUZXJtaW5hbENvbW1hbmRQYXN0ZShlOiBDbGlwYm9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGhhbmRsZVRlcm1pbmFsQ29tbWFuZFBhc3RlKGUsIHRoaXMuX2VkaXRvciwgdGhpcy5fZ2V0VGVybWluYWxDb21tYW5kUHJlZml4KCksIHRoaXMuZGlhbG9nU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHQvKipcblx0ICogUGFzdGUgZWRpdHMgYXJlIGFwcGxpZWQgdGhyb3VnaCB0aGUgYnVsayBlZGl0IHNlcnZpY2UsIHdoaWNoIHJlc29sdmVzIHRoZVxuXHQgKiBpbnB1dCBtb2RlbCBhbmQgZm9yY2UtZGVzdHJveXMgaXQgd2hlbiB0aGUgbGFzdCByZWZlcmVuY2UgaXMgcmVsZWFzZWQuXG5cdCAqIEhvbGRpbmcgb25lIGtlZXBzIHRoZSBtb2RlbCBhbGl2ZSBmb3IgdGhpcyBlZGl0b3IncyBsaWZldGltZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hvbGRJbnB1dE1vZGVsUmVmZXJlbmNlKHVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lucHV0TW9kZWxSZWZlcmVuY2UudmFsdWUgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gaG9sZCB0aGUgY2hhdCBpbnB1dCBtb2RlbCByZWZlcmVuY2UnLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRWRpdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yQ29udGFpbmVyID0gdGhpcy5fZWRpdG9yQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1lZGl0b3InKSk7XG5cdFx0Y29uc3QgbWluSGVpZ2h0ID0gdGhpcy5vcHRpb25zLm1pbkVkaXRvckhlaWdodCA/PyBNSU5fRURJVE9SX0hFSUdIVDtcblx0XHRlZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7bWluSGVpZ2h0fXB4YDtcblxuXHRcdC8vIENyZWF0ZSBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZSBhbmQgcmVnaXN0ZXIgaGlzdG9yeSBuYXZpZ2F0aW9uXG5cdFx0Ly8gQkVGT1JFIGNyZWF0aW5nIHRoZSBlZGl0b3IsIHNvIHRoZSBlZGl0b3IncyBjb250ZXh0IGtleSBzY29wZSBpcyBhIGNoaWxkXG5cdFx0Y29uc3QgaW5wdXRTY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IHsgaGlzdG9yeU5hdmlnYXRpb25CYWNrd2FyZHNFbmFibGVtZW50LCBoaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudCB9ID0gdGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBbmRDcmVhdGVIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHQoaW5wdXRTY29wZWRDb250ZXh0S2V5U2VydmljZSwgdGhpcykpO1xuXHRcdHRoaXMuX2hpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudCA9IGhpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudDtcblx0XHR0aGlzLl9oaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudCA9IGhpc3RvcnlOYXZpZ2F0aW9uRm9yd2FyZHNFbmFibGVtZW50O1xuXG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBpbnB1dFNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnNlc3Npb25zQ2hhdElucHV0LCBwYXRoOiBgaW5wdXQtJHtEYXRlLm5vdygpfWAgfSk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIG51bGwsIHVyaSwgdHJ1ZSkpO1xuXHRcdHZvaWQgdGhpcy5faG9sZElucHV0TW9kZWxSZWZlcmVuY2UodXJpKTtcblxuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnM6IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zID0ge1xuXHRcdFx0Li4uZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdHJlYWRPbmx5OiBmYWxzZSxcblx0XHRcdC8vIE1hdGNoIHRoZSB3b3JrYmVuY2ggY2hhdCBpbnB1dCBzbyB0aGUgcG9zdC1wYXN0ZSBzZWxlY3RvciBpcyBvZmZlcmVkLlxuXHRcdFx0cGFzdGVBczogRWRpdG9yT3B0aW9ucy5wYXN0ZUFzLmRlZmF1bHRWYWx1ZSxcblx0XHRcdGFyaWFMYWJlbDogdGhpcy5fZ2V0QXJpYUxhYmVsKCksXG5cdFx0XHRwbGFjZWhvbGRlcjogdGhpcy5vcHRpb25zLnBsYWNlaG9sZGVyID8/IGdldFJhbmRvbUNoYXRJbnB1dFBsYWNlaG9sZGVyKCksXG5cdFx0XHRmb250RmFtaWx5OiBORVdfQ0hBVF9JTlBVVF9GT05UX0ZBTUlMWSxcblx0XHRcdGZvbnRTaXplOiAxMyxcblx0XHRcdGxpbmVIZWlnaHQ6IDIwLFxuXHRcdFx0Y3Vyc29yV2lkdGg6IDEsXG5cdFx0XHRwYWRkaW5nOiB7IHRvcDogOCwgYm90dG9tOiAyIH0sXG5cdFx0XHR3cmFwcGluZ1N0cmF0ZWd5OiAnYWR2YW5jZWQnLFxuXHRcdFx0c3RpY2t5U2Nyb2xsOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnbm9uZScsXG5cdFx0XHRzY3JvbGxiYXI6IHtcblx0XHRcdFx0aG9yaXpvbnRhbDogJ2hpZGRlbicsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0dmVydGljYWw6ICdhdXRvJyxcblx0XHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiA3LFxuXHRcdFx0fSxcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRzdWdnZXN0OiB7XG5cdFx0XHRcdHNob3dJY29uczogdHJ1ZSxcblx0XHRcdFx0c2hvd1NuaXBwZXRzOiBmYWxzZSxcblx0XHRcdFx0c2hvd1dvcmRzOiB0cnVlLFxuXHRcdFx0XHRzaG93U3RhdHVzQmFyOiBmYWxzZSxcblx0XHRcdFx0aW5zZXJ0TW9kZTogJ2luc2VydCcsXG5cdFx0XHRcdGZpdFdpZHRoVG9EZXRhaWxzOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgd2lkZ2V0T3B0aW9uczogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zID0ge1xuXHRcdFx0aXNTaW1wbGVXaWRnZXQ6IHRydWUsXG5cdFx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0U29tZUVkaXRvckNvbnRyaWJ1dGlvbnMoW1xuXHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdFN1Z2dlc3RDb250cm9sbGVyLklELFxuXHRcdFx0XHRTbmlwcGV0Q29udHJvbGxlcjIuSUQsXG5cdFx0XHRcdFBsYWNlaG9sZGVyVGV4dENvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdFx0Q29weVBhc3RlQ29udHJvbGxlci5JRCxcblx0XHRcdF0pLFxuXHRcdH07XG5cblx0XHR0aGlzLl9lZGl0b3IgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvZGVFZGl0b3JXaWRnZXQsIGVkaXRvckNvbnRhaW5lciwgZWRpdG9yT3B0aW9ucywgd2lkZ2V0T3B0aW9ucyxcblx0XHQpKTtcblx0XHR0aGlzLl9lZGl0b3Iuc2V0TW9kZWwodGV4dE1vZGVsKTtcblx0XHR0aGlzLl9wcm9tcHRUZW1wbGF0ZVBsYWNlaG9sZGVyLnZhbHVlID0gbmV3IFByb21wdFRlbXBsYXRlUGxhY2Vob2xkZXJDb250cm9sbGVyKHRoaXMuX2VkaXRvciwgKCkgPT4gdGhpcy5fcHJvbXB0VHlwaW5nQW5pbWF0aW9uLnZhbHVlPy5jb21wbGV0ZSgpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvLyBSZS1ldmFsdWF0ZSB3aGVuIHRoZSBhdHRhY2hlZCBzZXNzaW9uIGNoYW5nZXM7IGNvbnRlbnQgY2hhbmdlcyBhcmVcblx0XHRcdC8vIGhhbmRsZWQgYnkgdGhlIG1vZGVsLWNvbnRlbnQgbGlzdGVuZXIgYmVsb3cuXG5cdFx0XHR0aGlzLm9wdGlvbnMuc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl91cGRhdGVFZGl0b3JGb250RmFtaWx5KCk7XG5cdFx0fSkpO1xuXHRcdC8vIEF0dGFjaCB0byB0aGUgY29udGFpbmVyIChub3QgYGdldERvbU5vZGUoKWAsIHdoaWNoIGlzIG51bGwgdW50aWwgdGhlXG5cdFx0Ly8gZWRpdG9yIGhhcyBhIG1vZGVsKSBzbyB0aGUgY2FwdHVyZS1waGFzZSBwYXN0ZSB2ZXRvIGlzIGFsd2F5cyB3aXJlZCB1cC5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VkaXRvckNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5QQVNURSwgZSA9PiB0aGlzLl9oYW5kbGVUZXJtaW5hbENvbW1hbmRQYXN0ZShlKSwgdHJ1ZSkpO1xuXG5cdFx0Ly8gRW5zdXJlIHN1Z2dlc3Qgd2lkZ2V0IHJlbmRlcnMgYWJvdmUgdGhlIGlucHV0IChub3QgY2xpcHBlZCBieSBjb250YWluZXIpXG5cdFx0U3VnZ2VzdENvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik/LmZvcmNlUmVuZGVyaW5nQWJvdmUoKTtcblxuXHRcdC8vIFVwZGF0ZSBhcmlhIGxhYmVsIHdoZW4gYWNjZXNzaWJpbGl0eSB2ZXJib3NpdHkgc2V0dGluZyBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlNlc3Npb25zQ2hhdCkpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWw6IHRoaXMuX2dldEFyaWFMYWJlbCgpIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpY3RhdGlvbkZvY3VzS2V5ID0gU2Vzc2lvbnNDaGF0SW5wdXRIYXNEaWN0YXRpb25Gb2N1cy5iaW5kVG8oaW5wdXRTY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0ZGljdGF0aW9uRm9jdXNLZXkuc2V0KHRydWUpO1xuXHRcdFx0YWN0aXZlRGljdGF0aW9uQ29tcG9zZXIgPSB0aGlzO1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0ZGljdGF0aW9uRm9jdXNLZXkuc2V0KGZhbHNlKTtcblx0XHRcdGlmIChhY3RpdmVEaWN0YXRpb25Db21wb3NlciA9PT0gdGhpcykge1xuXHRcdFx0XHRhY3RpdmVEaWN0YXRpb25Db21wb3NlciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQmx1ci5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoYWN0aXZlRGljdGF0aW9uQ29tcG9zZXIgPT09IHRoaXMpIHtcblx0XHRcdFx0YWN0aXZlRGljdGF0aW9uQ29tcG9zZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uS2V5RG93bihlID0+IHtcblx0XHRcdGlmIChlLmJyb3dzZXJFdmVudC5kZWZhdWx0UHJldmVudGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgJiYgIWUuc2hpZnRLZXkgJiYgIWUuY3RybEtleSAmJiAhZS5hbHRLZXkgJiYgdGhpcy5fcHJvbXB0VGVtcGxhdGVQbGFjZWhvbGRlci52YWx1ZT8ucmVwbGFjZUF0Q3Vyc29yKCkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyICYmICFlLnNoaWZ0S2V5ICYmICFlLmN0cmxLZXkgJiYgIWUuYWx0S2V5KSB7XG5cdFx0XHRcdC8vIERvbid0IHNlbmQgaWYgdGhlIHN1Z2dlc3Qgd2lkZ2V0IGlzIHZpc2libGUgKGxldCBpdCBhY2NlcHQgdGhlIGNvbXBsZXRpb24pXG5cdFx0XHRcdGlmICh0aGlzLl9lZGl0b3IuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KCdzdWdnZXN0V2lkZ2V0VmlzaWJsZScpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fc2VuZCgpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQWx0K0VudGVyIFx1MjAxNCBzZW5kIGluIHRoZSBiYWNrZ3JvdW5kIHdpdGhvdXQgbmF2aWdhdGluZyBpbnRvIHRoZSBzZXNzaW9uXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnN1cHBvcnRzQmFja2dyb3VuZCAmJiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgJiYgIWUuc2hpZnRLZXkgJiYgIWUuY3RybEtleSAmJiBlLmFsdEtleSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX3NlbmQodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDbWQrLyAvIEN0cmwrLyBcdTIwMTQgb3BlbiB0aGUgY29udGV4dCBwaWNrZXIgKHNhbWUgYXMgdGhlIGF0dGFjaCBidXR0b24pXG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNsYXNoKSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5zaG93UGlja2VyKHRoaXMub3B0aW9ucy5nZXRDb250ZXh0Rm9sZGVyVXJpKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFVwZGF0ZSBoaXN0b3J5IG5hdmlnYXRpb24gZW5hYmxlbWVudCBiYXNlZCBvbiBjdXJzb3IgcG9zaXRpb25cblx0XHRjb25zdCB1cGRhdGVIaXN0b3J5TmF2aWdhdGlvbkVuYWJsZW1lbnQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGlmICghbW9kZWwgfHwgIXBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudC5zZXQocG9zaXRpb24ubGluZU51bWJlciA9PT0gMSAmJiBwb3NpdGlvbi5jb2x1bW4gPT09IDEpO1xuXHRcdFx0dGhpcy5faGlzdG9yeU5hdmlnYXRpb25Gb3J3YXJkc0VuYWJsZW1lbnQuc2V0KHBvc2l0aW9uLmxpbmVOdW1iZXIgPT09IG1vZGVsLmdldExpbmVDb3VudCgpICYmIHBvc2l0aW9uLmNvbHVtbiA9PT0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoKSA9PiB1cGRhdGVIaXN0b3J5TmF2aWdhdGlvbkVuYWJsZW1lbnQoKSkpO1xuXHRcdHVwZGF0ZUhpc3RvcnlOYXZpZ2F0aW9uRW5hYmxlbWVudCgpO1xuXG5cdFx0bGV0IHByZXZpb3VzSGVpZ2h0ID0gLTE7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ29udGVudFNpemVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoIWUuY29udGVudEhlaWdodENoYW5nZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0XHRjb25zdCBjbGFtcGVkSGVpZ2h0ID0gTWF0aC5taW4oTUFYX0VESVRPUl9IRUlHSFQsIE1hdGgubWF4KHRoaXMub3B0aW9ucy5taW5FZGl0b3JIZWlnaHQgPz8gTUlOX0VESVRPUl9IRUlHSFQsIGNvbnRlbnRIZWlnaHQpKTtcblx0XHRcdGlmIChjbGFtcGVkSGVpZ2h0ID09PSBwcmV2aW91c0hlaWdodCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRwcmV2aW91c0hlaWdodCA9IGNsYW1wZWRIZWlnaHQ7XG5cdFx0XHR0aGlzLl9lZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7Y2xhbXBlZEhlaWdodH1weGA7XG5cdFx0XHR0aGlzLl9lZGl0b3IubGF5b3V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2xhc2ggY29tbWFuZHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTbGFzaENvbW1hbmRIYW5kbGVyLCB0aGlzLl9lZGl0b3IpKTtcblxuXHRcdC8vIFZhcmlhYmxlIGNvbXBsZXRpb25zICgjZmlsZSwgI2ZvbGRlcilcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VmFyaWFibGVDb21wbGV0aW9uSGFuZGxlciwgdGhpcy5fZWRpdG9yLCB0aGlzLl9jb250ZXh0QXR0YWNobWVudHMsICgpID0+IHRoaXMub3B0aW9ucy5nZXRDb250ZXh0Rm9sZGVyVXJpKCksXG5cdFx0KSk7XG5cblx0XHQvLyBTZXNzaW9uIHJlZmVyZW5jZSBjb21wbGV0aW9ucyAoI3Nlc3Npb24pXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFNlc3Npb25SZWZlcmVuY2VDb21wbGV0aW9uSGFuZGxlciwgdGhpcy5fZWRpdG9yLCB0aGlzLl9jb250ZXh0QXR0YWNobWVudHMsXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9hZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyLCB0aGlzLl9lZGl0b3IsIHRoaXMuX2NvbnRleHRBdHRhY2htZW50cyxcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFBhc3RlVGFyZ2V0U2VydmljZS5yZWdpc3RlclRhcmdldCh0ZXh0TW9kZWwudXJpLCBuZXcgTmV3Q2hhdElucHV0UGFzdGVUYXJnZXQoXG5cdFx0XHR0aGlzLl9lZGl0b3IsXG5cdFx0XHR0aGlzLl9jb250ZXh0QXR0YWNobWVudHMsXG5cdFx0XHR0aGlzLl9hZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyLFxuXHRcdFx0KCkgPT4gdGhpcy5fZ2V0VGVybWluYWxDb21tYW5kUHJlZml4KCksXG5cdFx0XHQoKSA9PiB0aGlzLm9wdGlvbnMuc2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2UsXG5cdFx0XHR0ZXh0TW9kZWwudXJpLFxuXHRcdCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVEcmFmdFN0YXRlKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUVkaXRvckZvbnRGYW1pbHkoKTtcblx0XHRcdHRoaXMuX3Byb21wdE9wdGlvbnNXaWRnZXQudmFsdWU/LnNldElucHV0VmFsdWUodGhpcy5fZWRpdG9yLmdldFZhbHVlKCkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaW5wdXQgaXMgbW9ub3NwYWNlIG9ubHkgd2hpbGUgYSB0ZXJtaW5hbCBjb21tYW5kIGlzIGJlaW5nIGNvbXBvc2VkOlxuXHQgKiB0aGUgYXR0YWNoZWQgc2Vzc2lvbiBhZHZlcnRpc2VzIGEgcHJlZml4IEFORCB0aGUgY3VycmVudCBpbnB1dCBiZWdpbnMgd2l0aFxuXHQgKiBpdC4gT3RoZXJ3aXNlIGl0IHVzZXMgdGhlIG5vcm1hbCBuZXctY2hhdCBpbnB1dCBmb250LlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlRWRpdG9yRm9udEZhbWlseSgpOiB2b2lkIHtcblx0XHRjb25zdCBpc0NvbW1hbmQgPSBpc1Rlcm1pbmFsQ29tbWFuZElucHV0KHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lQ29udGVudCgxKSB8fCAnJywgdGhpcy5fZ2V0VGVybWluYWxDb21tYW5kUHJlZml4KCkpO1xuXHRcdHRoaXMuX2VkaXRvci51cGRhdGVPcHRpb25zKHsgZm9udEZhbWlseTogaXNDb21tYW5kID8gRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseSA6IE5FV19DSEFUX0lOUFVUX0ZPTlRfRkFNSUxZIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQXR0YWNoQnV0dG9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBhdHRhY2hCdXR0b24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWF0dGFjaC1idXR0b24nKSk7XG5cdFx0Y29uc3QgYXR0YWNoQnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnYWRkQ29udGV4dCcsIFwiQWRkIENvbnRleHQuLi5cIik7XG5cdFx0YXR0YWNoQnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHRhdHRhY2hCdXR0b24ucm9sZSA9ICdidXR0b24nO1xuXHRcdGF0dGFjaEJ1dHRvbi5hcmlhTGFiZWwgPSBhdHRhY2hCdXR0b25MYWJlbDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihhdHRhY2hCdXR0b24sIHtcblx0XHRcdGNvbnRlbnQ6IGF0dGFjaEJ1dHRvbkxhYmVsLFxuXHRcdFx0cG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyB9LFxuXHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogdHJ1ZSB9XG5cdFx0fSkpO1xuXHRcdGRvbS5hcHBlbmQoYXR0YWNoQnV0dG9uLCByZW5kZXJJY29uKENvZGljb24uYWRkQ29tcGFjdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYXR0YWNoQnV0dG9uLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZXh0QXR0YWNobWVudHMuc2hvd1BpY2tlcih0aGlzLm9wdGlvbnMuZ2V0Q29udGV4dEZvbGRlclVyaSgpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVJbnB1dFRvb2xiYXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvb2xiYXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXRvb2xiYXInKSk7XG5cdFx0bGV0IGRpY3RhdGlvbkFjdGlvblZpc2libGUgPSBmYWxzZTtcblx0XHRsZXQgdm9pY2VBY3Rpb25Db3VudCA9IDA7XG5cdFx0Y29uc3QgdXBkYXRlVm9pY2VJbnB1dEFjdGlvbkJvcmRlciA9ICgpID0+IHtcblx0XHRcdHRvb2xiYXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2Vzc2lvbnMtY2hhdC12b2ljZS1pbnB1dC1hY3Rpb25zLW11bHRpcGxlJywgTnVtYmVyKGRpY3RhdGlvbkFjdGlvblZpc2libGUpICsgdm9pY2VBY3Rpb25Db3VudCA+IDEpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9jcmVhdGVBdHRhY2hCdXR0b24odG9vbGJhcik7XG5cblx0XHQvLyBTZXNzaW9uIGNvbmZpZyBwaWNrZXJzIChzdWNoIGFzIG1vZGVsKSBcdTIwMTQgcmVuZGVyZWQgdmlhIE1lbnVXb3JrYmVuY2hUb29sQmFyXG5cdFx0Ly8gVmlzaWJpbGl0eSBjb250cm9sbGVkIGJ5IGNvbnRleHQga2V5cyAoaXNBY3RpdmVTZXNzaW9uQmFja2dyb3VuZFByb3ZpZGVyLCBpc05ld0NoYXRTZXNzaW9uKVxuXHRcdGNvbnN0IGNvbmZpZ0NvbnRhaW5lciA9IGRvbS5hcHBlbmQodG9vbGJhciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWNvbmZpZy10b29sYmFyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBjb25maWdDb250YWluZXIsIE1lbnVzLk5ld1Nlc3Npb25Db25maWcsIHtcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24pID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gJ3Nlc3Npb25zLm1vZGVsUGlja2VyJykge1xuXHRcdFx0XHRcdGNvbnN0IHBpY2tlciA9IHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGVsUGlja2VyLCB0aGlzLl9jb21wYWN0TW9kZWxQaWNrZXIpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTW9kZWxQaWNrZXJBY3Rpb25WaWV3SXRlbShwaWNrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQodG9vbGJhciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXRvb2xiYXItc3BhY2VyJykpO1xuXG5cdFx0Ly8gRGljdGF0aW9uIG1pYyBidXR0b24uIFNoYXJlcyB0aGUgU1RUIHNlcnZpY2UsIG1pY1xuXHRcdC8vIGRldmljZSwgYW5kIGdhdGluZyAoYmFja2VuZCBzdXBwb3J0ICsgYGRpY3RhdGlvbi5lbmFibGVkYClcblx0XHQvLyB3aXRoIHRoZSBtYWluIGNoYXQgaW5wdXQ7IGluc2VydHMgdGhlIHRyYW5zY3JpcHQgaW50byB0aGlzIGNvbXBvc2VyJ3Ncblx0XHQvLyBlZGl0b3IuIFBsYWNlZCBiZWZvcmUgdGhlIHZvaWNlIGNvbnRyb2xzIHNvIGRpY3RhdGlvbiBsZWFkcyB0aGVcblx0XHQvLyBtaWMtcmVsYXRlZCBncm91cC5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fY3JlYXRlU3BlZWNoVG9UZXh0QnV0dG9uKHRvb2xiYXIsIHZpc2libGUgPT4ge1xuXHRcdFx0XHRkaWN0YXRpb25BY3Rpb25WaXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdFx0dXBkYXRlVm9pY2VJbnB1dEFjdGlvbkJvcmRlcigpO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGNyZWF0ZSBuZXctc2Vzc2lvbiBkaWN0YXRpb24gY29udHJvbDonLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gVm9pY2UgY29udHJvbHMgKG1pYy9zdG9wL3NldHRpbmdzL2Rpc2Nvbm5lY3QpLiBUaGUgaGFuZC1idWlsdCB0b29sYmFyXG5cdFx0Ly8gY2FuJ3QgdXNlIHRoZSBzaGFyZWQgYE1lbnVJZC5DaGF0RXhlY3V0ZWAsIHNvIGEgZGVkaWNhdGVkIG1lbnUgaXMgdXNlZC5cblx0XHQvLyBLZWVwIHRoZSBzZXNzaW9uIHBpY2tlciB1c2FibGUgd2hlbiBvcHRpb25hbCB2b2ljZSBpbml0aWFsaXphdGlvbiBmYWlscy5cblx0XHQvLyBUaGUgY29udHJvbGxlciBhbHNvIGhhbmRsZXMgdm9pY2UgdGFyZ2V0IHJvdXRpbmcgKyBpbnB1dCBnbG93LCB3aGljaCB0aGVcblx0XHQvLyBzZWdtZW50ZWQgcGlsbCByZWxpZXMgb24sIHNvIGl0IGlzIGNyZWF0ZWQgcmVnYXJkbGVzcyBvZiB0aGUgcGlsbDsgaXRzXG5cdFx0Ly8gdG9vbGJhciBpdGVtcyBoaWRlICh2aWEgYHdoZW5gKSB3aGVuIHRoZSBwaWxsIGlzIGFjdGl2ZS5cblx0XHRjb25zdCB2b2ljZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQodG9vbGJhciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXZvaWNlLXRvb2xiYXInKSk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV3Q2hhdFZvaWNlQ29udHJvbGxlciwge1xuXHRcdFx0XHR0b29sYmFyQ29udGFpbmVyOiB2b2ljZUNvbnRhaW5lcixcblx0XHRcdFx0aW5wdXRDb250YWluZXI6IGNvbnRhaW5lcixcblx0XHRcdFx0Y29tcG9zZXI6IHRoaXMsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQWN0aW9uczogYWN0aW9uQ291bnQgPT4ge1xuXHRcdFx0XHRcdHZvaWNlQWN0aW9uQ291bnQgPSBhY3Rpb25Db3VudDtcblx0XHRcdFx0XHR1cGRhdGVWb2ljZUlucHV0QWN0aW9uQm9yZGVyKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGNyZWF0ZSBuZXctc2Vzc2lvbiB2b2ljZSBjb250cm9sczonLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gU2VnbWVudGVkIHZvaWNlL2RpY3RhdGlvbiBwaWxsIChleHBlcmltZW50YWwpLiBXaGVuIGVuYWJsZWQgaXQgcmVwbGFjZXMgdGhlXG5cdFx0Ly8gc3RhbmRhbG9uZSBkaWN0YXRpb24gYnV0dG9uIGFuZCB2b2ljZSBjb250cm9scyBhYm92ZSB3aXRoIGEgc2luZ2xlIGNvbnRyb2wuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2NyZWF0ZVZvaWNlSW5wdXRNb2RlUGlsbCh0b29sYmFyLCBjb250YWluZXIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgbmV3LXNlc3Npb24gdm9pY2UgaW5wdXQgbW9kZSBwaWxsOicsIGVycm9yKTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2FkaW5nU3Bpbm5lciA9IGRvbS5hcHBlbmQodG9vbGJhciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWxvYWRpbmctc3Bpbm5lcicpKTtcblx0XHRjb25zdCBsb2FkaW5nSWNvbiA9IGRvbS5hcHBlbmQodGhpcy5fbG9hZGluZ1NwaW5uZXIsIHJlbmRlckljb24oVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmcsICdzcGluJykpKTtcblx0XHRsb2FkaW5nSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5fbG9hZGluZ1NwaW5uZXIsIGxvY2FsaXplKCdsb2FkaW5nJywgXCJMb2FkaW5nLi4uXCIpKSk7XG5cdFx0dGhpcy5fbG9hZGluZ1NwaW5uZXIuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHRoaXMub3B0aW9ucy5sb2FkaW5nLmdldCgpKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVuZGVyU2VuZEJ1dHRvbiAhPT0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IHNlbmRCdXR0b25Db250YWluZXIgPSBkb20uYXBwZW5kKHRvb2xiYXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1zZW5kLWJ1dHRvbicpKTtcblx0XHRcdGNvbnN0IHNlbmRCdXR0b24gPSB0aGlzLl9zZW5kQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihzZW5kQnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0dGl0bGU6IHRoaXMub3B0aW9ucy5zdXBwb3J0c0JhY2tncm91bmRcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzZW5kV2l0aEJhY2tncm91bmRIaW50JywgXCJTZW5kIChBbHQtY2xpY2sgdG8gc3RhcnQgaW4gdGhlIGJhY2tncm91bmQpXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnc2VuZCcsIFwiU2VuZFwiKSxcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnc2VuZCcsIFwiU2VuZFwiKSxcblx0XHRcdH0pKTtcblx0XHRcdHNlbmRCdXR0b24uaWNvbiA9IENvZGljb24uYXJyb3dVcENvbXBhY3Q7XG5cdFx0XHQvLyBIb2xkIEFsdCB3aGlsZSBjbGlja2luZyBTZW5kIHRvIHN0YXJ0IHRoZSBzZXNzaW9uIGluIHRoZSBiYWNrZ3JvdW5kLlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoc2VuZEJ1dHRvbi5vbkRpZENsaWNrKGUgPT4gdGhpcy5fc2VuZCghIXRoaXMub3B0aW9ucy5zdXBwb3J0c0JhY2tncm91bmQgJiYgISEoZSBhcyBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCB8IHVuZGVmaW5lZCk/LmFsdEtleSkpKTtcblx0XHR9XG5cdFx0dXBkYXRlVm9pY2VJbnB1dEFjdGlvbkJvcmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVm9pY2VJbnB1dE1vZGVQaWxsKHRvb2xiYXI6IEhUTUxFbGVtZW50LCBpbnB1dENvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBwaWxsQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0b29sYmFyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtdm9pY2UtaW5wdXQtbW9kZScpKTtcblx0XHRjb25zdCBpc1ZvaWNlSW5wdXRBY3RpdmUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiBpc0VxdWFsKHRoaXMubmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZS5jdXJyZW50Vm9pY2VJbnB1dFJlc291cmNlLnJlYWQocmVhZGVyKSwgTkVXX0NIQVRfVk9JQ0VfU0VOVElORUwpKTtcblx0XHRjb25zdCBpc1ZvaWNlU2Vzc2lvbkFjdGl2ZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IGlzTmV3Q2hhdFZvaWNlU2Vzc2lvbkFjdGl2ZShcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlciksXG5cdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLnJlYWQocmVhZGVyKSxcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci50YXJnZXRTZXNzaW9uLnJlYWQocmVhZGVyKSxcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5oYXNEcmFmdFRhcmdldC5yZWFkKHJlYWRlciksXG5cdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIub21uaUlucHV0T3Blbi5yZWFkKHJlYWRlciksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBhY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRpZDogQ2hhdFZvaWNlSW5wdXRNb2RlQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZScsIFwiVm9pY2UgSW5wdXQgTW9kZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4geyAvKiBpbnRlcmFjdGlvbiBoYW5kbGVkIGJ5IHRoZSB2aWV3IGl0ZW0gKi8gfSxcblx0XHR9KTtcblx0XHRjb25zdCBwaWxsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVm9pY2VJbnB1dE1vZGVBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7XG5cdFx0XHQvLyBEaWN0YXRpb24gbXVzdCB0YXJnZXQgdGhpcyBjb21wb3NlcidzIGVkaXRvciwgbm90IHRoZSBsYXN0IGZvY3VzZWRcblx0XHRcdC8vIGNoYXQgd2lkZ2V0ICh0aGlzIGNvbXBvc2VyIGlzbid0IGFuIGBJQ2hhdFdpZGdldGApLlxuXHRcdFx0dG9nZ2xlRGljdGF0aW9uOiAoKSA9PiB7IHZvaWQgdGhpcy50b2dnbGVEaWN0YXRpb24oKTsgfSxcblx0XHRcdGlzQWN0aXZlOiBpc1ZvaWNlSW5wdXRBY3RpdmUsXG5cdFx0XHRpc1ZvaWNlQWN0aXZlOiBpc1ZvaWNlU2Vzc2lvbkFjdGl2ZSxcblx0XHR9KSk7XG5cdFx0cGlsbC5yZW5kZXIocGlsbENvbnRhaW5lcik7XG5cblx0XHQvLyBUaGUgcGlsbCBvbmx5IGVhcm5zIGl0cyBwbGFjZSB3aGVuIGl0IHdvdWxkIGhvc3QgYXQgbGVhc3QgdHdvIGNlbGxzOlxuXHRcdC8vICAgLSBib3RoIGRpY3RhdGlvbiBhbmQgVm9pY2UgTW9kZSBhcmUgYXZhaWxhYmxlLCBvclxuXHRcdC8vICAgLSBvbmx5IFZvaWNlIE1vZGUgaXMgYXZhaWxhYmxlIGluIG1hbnVhbCAobm9uLWhhbmRzLWZyZWUpIG1vZGUgQU5EIGFcblx0XHQvLyAgICAgc2Vzc2lvbiBpcyBhY3RpdmUsIHNvIGxpc3RlbiArIHZvaWNlLWNvbm5lY3Rpb24gY2VsbHMgYm90aCByZW5kZXIuXG5cdFx0Ly8gT3RoZXJ3aXNlIHRoZSBzdGFuZGFsb25lIGRpY3RhdGlvbiArIHZvaWNlIGNvbnRyb2xzIHNob3cgaW5zdGVhZC5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkaWN0ID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2UuZGljdGF0aW9uQXZhaWxhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZvaWNlID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2Uudm9pY2VBdmFpbGFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaGFuZHNGcmVlID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2UuaGFuZHNGcmVlLnJlYWQocmVhZGVyKTtcblx0XHRcdC8vIFRoZSB2b2ljZS1vbmx5IGJyYW5jaCdzIFwic2Vzc2lvbiBhY3RpdmVcIiBtdXN0IG1hdGNoIHRoZSBtYWluLXdpbmRvd1xuXHRcdFx0Ly8gYEFHRU5UU19WT0lDRV9DT05ORUNURURgIGNvbnRleHQga2V5LCB3aGljaCB0cmFja3MgYGlzQ29ubmVjdGVkYCBvbmx5LlxuXHRcdFx0Ly8gQ291bnRpbmcgYGlzQ29ubmVjdGluZ2AgaGVyZSB3b3VsZCBzaG93IHRoZSBwaWxsIHdoaWxlIHRoZSBzY29wZWRcblx0XHRcdC8vIHN0YW5kYWxvbmUgdG9vbGJhciBzdGlsbCBzaG93cyBpdHMgQ29ubmVjdGluZyBpdGVtIChkdXBsaWNhdGUgY29udHJvbHMpLlxuXHRcdFx0Y29uc3QgY29ubmVjdGVkID0gaXNWb2ljZVNlc3Npb25BY3RpdmUucmVhZChyZWFkZXIpICYmIHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBwaWxsQWN0aXZlID0gKGRpY3QgJiYgdm9pY2UpIHx8ICh2b2ljZSAmJiAhZGljdCAmJiAhaGFuZHNGcmVlICYmIGNvbm5lY3RlZCk7XG5cdFx0XHRwaWxsQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFwaWxsQWN0aXZlKTtcblx0XHRcdC8vIE1pcnJvciB0aGUgcGlsbCdzIGFjdGl2ZSBzdGF0ZSBvbnRvIHRoZSBpbnB1dCBjb250YWluZXIgc28gdm9pY2UgZ2xvd1xuXHRcdFx0Ly8gc3R5bGluZyAoZHJpdmVuIGJ5IHRoZSB2b2ljZSBjb250cm9sbGVyKSBzdGF5cyBjb25zaXN0ZW50LlxuXHRcdFx0aW5wdXRDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndm9pY2UtaW5wdXQtbW9kZS1waWxsJywgcGlsbEFjdGl2ZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlU3BlZWNoVG9UZXh0QnV0dG9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogKHZpc2libGU6IGJvb2xlYW4pID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBzdHRTZXJ2aWNlID0gdGhpcy5jaGF0U3BlZWNoVG9UZXh0U2VydmljZTtcblxuXHRcdGNvbnN0IGJ1dHRvbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtc3R0LWJ1dHRvbicpKTtcblx0XHRidXR0b24udGFiSW5kZXggPSAwO1xuXHRcdGJ1dHRvbi5yb2xlID0gJ2J1dHRvbic7XG5cdFx0Y29uc3QgbWljTGFiZWwgPSBsb2NhbGl6ZSgnc2Vzc2lvbnNTdHQuZGljdGF0ZScsIFwiRGljdGF0ZSAoU3BlZWNoIHRvIFRleHQpXCIpO1xuXHRcdGNvbnN0IHN0b3BMYWJlbCA9IGxvY2FsaXplKCdzZXNzaW9uc1N0dC5zdG9wJywgXCJTdG9wIERpY3RhdGlvblwiKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihidXR0b24sICgpID0+ICh7XG5cdFx0XHQvLyBXaGlsZSB0aGUgbW9kZWwgcHJlcGFyZXMsIHN1cmZhY2UgdGhlIGRvd25sb2FkL2Nvbm5lY3RpbmcgaG92ZXJcblx0XHRcdC8vICh3aGljaCBpbnZpdGVzIHRoZSB1c2VyIHRvIGNsaWNrIHRvIGNhbmNlbCkgc28gdGhpcyBjb21wb3NlciBtYXRjaGVzXG5cdFx0XHQvLyB0aGUgbWFpbiBjaGF0IHRvb2xiYXIgYWZmb3JkYW5jZS4gSWRsZSBnZXRzIHRoZSByaWNoZXIgZGVzY3JpcHRpb25cblx0XHRcdC8vIG5hbWluZyB0aGUgY29uZmlndXJlZCBkaWN0YXRpb24gbW9kZWwuXG5cdFx0XHRjb250ZW50OiBzdHRTZXJ2aWNlLmN1cnJlbnRTdXJmYWNlID09PSAnY2hhdCcgJiYgc3R0U2VydmljZS5pc1ByZXBhcmluZ01vZGVsXG5cdFx0XHRcdD8gZ2V0RGljdGF0aW9uRG93bmxvYWRIb3Zlck1hcmtkb3duKHN0dFNlcnZpY2UpXG5cdFx0XHRcdDogKGlzRGljdGF0aW9uQWN0aXZlT25TdXJmYWNlKHN0dFNlcnZpY2UsICdjaGF0JykgPyBzdG9wTGFiZWwgOiBnZXREaWN0YXRpb25Ib3Zlck1hcmtkb3duKG1pY0xhYmVsLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSksXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiB0cnVlIH1cblx0XHR9KSkpO1xuXG5cdFx0Y29uc3QgZG93bmxvYWRSaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpY3RhdGlvbkRvd25sb2FkUmluZz4oKSk7XG5cdFx0Y29uc3QgcmVuZGVyU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSBpc0RpY3RhdGlvbkFjdGl2ZU9uU3VyZmFjZShzdHRTZXJ2aWNlLCAnY2hhdCcpO1xuXHRcdFx0Y29uc3QgcHJlcGFyaW5nID0gYWN0aXZlICYmIHN0dFNlcnZpY2UuaXNQcmVwYXJpbmdNb2RlbDtcblx0XHRcdC8vIE9ubHkgdGhlIGFjdGl2ZSBSZWNvcmRpbmcgc3RhdGUgc2hvdWxkIHJlYWQgYXMgXCJyZWNvcmRpbmdcIiAoZmlsbGVkXG5cdFx0XHQvLyBtaWMpLiBPbmNlIHRoZSB1c2VyIHN0b3BzLCB0aGUgc2VydmljZSBlbnRlcnMgVHJhbnNjcmliaW5nIHdoaWxlIGl0XG5cdFx0XHQvLyB3YWl0cyBmb3IgdGhlIGZpbmFsIHRyYW5zY3JpcHQgKHVwIHRvIGEgZmV3IHNlY29uZHMgb24gdGhlIGNsb3VkXG5cdFx0XHQvLyBiYWNrZW5kKTsgZHVyaW5nIHRoYXQgdGhlIG1pYyBtdXN0IGFscmVhZHkgcmVhZCBhcyBpZGxlLCBtYXRjaGluZ1xuXHRcdFx0Ly8gdGhlIGNoYXQgdG9vbGJhciB3aGljaCBmbGlwcyBhcyBzb29uIGFzIHJlY29yZGluZyBzdG9wcy5cblx0XHRcdGNvbnN0IHJlY29yZGluZyA9IGFjdGl2ZSAmJiBzdHRTZXJ2aWNlLnN0YXRlID09PSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuUmVjb3JkaW5nO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZShidXR0b24pO1xuXHRcdFx0ZG93bmxvYWRSaW5nLmNsZWFyKCk7XG5cdFx0XHRpZiAocHJlcGFyaW5nKSB7XG5cdFx0XHRcdC8vIEZpcnN0LXVzZSBvbmx5LiBTaG93IGEgZG93bmxvYWQgaWNvbiB3cmFwcGVkIGJ5IGEgcHJvZ3Jlc3Ncblx0XHRcdFx0Ly8gcmluZyBvbmx5IGR1cmluZyBhbiBhY3R1YWwgbW9kZWwgZG93bmxvYWQgKGEgY29uZmlybWVkIGNhY2hlXG5cdFx0XHRcdC8vIG1pc3MpOyBvdGhlcndpc2UgKGxvYWRpbmcgYW4gYWxyZWFkeS1jYWNoZWQgbW9kZWwsIG9yIHRoZSBjbG91ZFxuXHRcdFx0XHQvLyBiYWNrZW5kIGNvbm5lY3RpbmcpIHJlbmRlciBhIHBsYWluIHNwaW5uZXIgaW5zdGVhZC5cblx0XHRcdFx0Ly8gR2x5cGhzIHJlbmRlciBhdCB0aGUgY29tcGFjdCAxMnB4IHNpemUsIHNvIHVzZSB0aGUgYCpDb21wYWN0YFxuXHRcdFx0XHQvLyB2YXJpYW50cyB3aGVyZSBvbmUgZXhpc3RzLlxuXHRcdFx0XHRpZiAoc3R0U2VydmljZS5pc0Rvd25sb2FkaW5nTW9kZWwpIHtcblx0XHRcdFx0XHRkb20uYXBwZW5kKGJ1dHRvbiwgcmVuZGVySWNvbihDb2RpY29uLm1pY0Rvd25sb2FkQ29tcGFjdCkpO1xuXHRcdFx0XHRcdGRvd25sb2FkUmluZy52YWx1ZSA9IG5ldyBEaWN0YXRpb25Eb3dubG9hZFJpbmcoYnV0dG9uLCBzdHRTZXJ2aWNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkb20uYXBwZW5kKGJ1dHRvbiwgcmVuZGVySWNvbihUaGVtZUljb24ubW9kaWZ5KENvZGljb24ubG9hZGluZ0NvbXBhY3QsICdzcGluJykpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gYG1pY2AgLyBgbWljRmlsbGVkYCBoYXZlIG5vIGNvbXBhY3QgdmFyaWFudCwgc28gdGhleSBzdGF5IGFzLWlzLlxuXHRcdFx0XHRkb20uYXBwZW5kKGJ1dHRvbiwgcmVuZGVySWNvbihyZWNvcmRpbmcgPyBDb2RpY29uLm1pY0ZpbGxlZCA6IENvZGljb24ubWljKSk7XG5cdFx0XHR9XG5cdFx0XHRidXR0b24uY2xhc3NMaXN0LnRvZ2dsZSgncmVjb3JkaW5nJywgcmVjb3JkaW5nICYmICFwcmVwYXJpbmcpO1xuXHRcdFx0YnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoJ3ByZXBhcmluZycsIHByZXBhcmluZyk7XG5cdFx0XHRidXR0b24uYXJpYUxhYmVsID0gcHJlcGFyaW5nXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3Nlc3Npb25zU3R0LmNhbmNlbFByZXBhcmluZycsIFwiQ2FuY2VsIERpY3RhdGlvbi4gezB9XCIsIGdldERpY3RhdGlvblByZXBhcmluZ0xhYmVsKHN0dFNlcnZpY2UpKVxuXHRcdFx0XHQ6IChhY3RpdmUgPyBzdG9wTGFiZWwgOiBtaWNMYWJlbCk7XG5cdFx0fTtcblx0XHRyZW5kZXJTdGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0dFNlcnZpY2Uub25EaWRDaGFuZ2VTdGF0ZShyZW5kZXJTdGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0dFNlcnZpY2Uub25EaWRDaGFuZ2VQcmVwYXJpbmdNb2RlbChyZW5kZXJTdGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0dFNlcnZpY2Uub25EaWRDaGFuZ2VEb3dubG9hZGluZ01vZGVsKHJlbmRlclN0YXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0dXBEaWN0YXRpb25NaWNHbG93KGJ1dHRvbiwgc3R0U2VydmljZSwgdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZSwgdW5kZWZpbmVkLCB0aGlzLnRoZW1lU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlVmlzaWJpbGl0eSA9ICgpID0+IHtcblx0XHRcdC8vIE1pcnJvciB0aGUgYE1lbnVJZC5DaGF0RXhlY3V0ZWAgZGljdGF0aW9uIGdhdGU6IGhpZGUgd2hpbGVcblx0XHRcdC8vIHVuY29uZmlndXJlZCwgYW5kIHdoaWxlIFZvaWNlIE1vZGUgaXMgY29ubmVjdGVkIHNvIHRoZSBkaWN0YXRpb24gYW5kXG5cdFx0XHQvLyB2b2ljZSBtaWMgYWZmb3JkYW5jZXMgbmV2ZXIgY29tcGV0ZSBvbiB0aGlzIGNvbXBvc2VyLiBBbHNvIGhpZGUgd2hlblxuXHRcdFx0Ly8gdGhlIHNlZ21lbnRlZCB2b2ljZS9kaWN0YXRpb24gcGlsbCBhcHBsaWVzIChib3RoIG1vZGVzIGF2YWlsYWJsZSwgc29cblx0XHRcdC8vIHRoZSBwaWxsIGhvc3RzIGl0cyBvd24gZGljdGF0aW9uIGNlbGwpLCB3aGljaCBzdXBlcnNlZGVzIHRoaXMgYnV0dG9uLlxuXHRcdFx0Y29uc3Qgdm9pY2VBY3RpdmUgPSBpc05ld0NoYXRWb2ljZVNlc3Npb25BY3RpdmUoXG5cdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5nZXQoKSxcblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGluZy5nZXQoKSxcblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnRhcmdldFNlc3Npb24uZ2V0KCksXG5cdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5oYXNEcmFmdFRhcmdldC5nZXQoKSxcblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm9tbmlJbnB1dE9wZW4uZ2V0KCksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgZGljdCA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLmRpY3RhdGlvbkF2YWlsYWJsZS5nZXQoKTtcblx0XHRcdGNvbnN0IHZvaWNlID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2Uudm9pY2VBdmFpbGFibGUuZ2V0KCk7XG5cdFx0XHRjb25zdCBoYW5kc0ZyZWUgPSB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5oYW5kc0ZyZWUuZ2V0KCk7XG5cdFx0XHQvLyBNYXRjaCB0aGUgcGlsbCBhdXRvcnVuIC8gYEFHRU5UU19WT0lDRV9DT05ORUNURURgOiB0aGUgdm9pY2Utb25seSBicmFuY2hcblx0XHRcdC8vIGtleXMgb2ZmIGBpc0Nvbm5lY3RlZGAgb25seSwgbm90IHRoZSBjb25uZWN0aW5nIHBoYXNlLlxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkFjdGl2ZSA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5nZXQoKTtcblx0XHRcdGNvbnN0IHBpbGxBY3RpdmUgPSAoZGljdCAmJiB2b2ljZSkgfHwgKHZvaWNlICYmICFkaWN0ICYmICFoYW5kc0ZyZWUgJiYgc2Vzc2lvbkFjdGl2ZSk7XG5cdFx0XHQvLyBIb25vciB0aGUgc2hhcmVkIGBkaWN0YXRpb24uc2hvd0J1dHRvbmAgdmlzaWJpbGl0eSB0b2dnbGU6IGhpZGluZyB0aGVcblx0XHRcdC8vIGJ1dHRvbiBzdGlsbCBsZWF2ZXMgQ21kL0N0cmwrSSB3b3JraW5nIChpdHMga2V5YmluZGluZyBpcyBpbmRlcGVuZGVudCkuXG5cdFx0XHRjb25zdCBidXR0b25TaG93biA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oRGljdGF0aW9uU2V0dGluZ0lkLlNob3dCdXR0b24pICE9PSBmYWxzZTtcblx0XHRcdGNvbnN0IHZpc2libGUgPSBzdHRTZXJ2aWNlLmlzQ29uZmlndXJlZCAmJiAhdm9pY2VBY3RpdmUgJiYgIXBpbGxBY3RpdmUgJiYgYnV0dG9uU2hvd247XG5cdFx0XHRidXR0b24uY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXZpc2libGUpO1xuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5KHZpc2libGUpO1xuXHRcdH07XG5cdFx0dXBkYXRlVmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci50YXJnZXRTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5oYXNEcmFmdFRhcmdldC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIub21uaUlucHV0T3Blbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5kaWN0YXRpb25BdmFpbGFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2Uudm9pY2VBdmFpbGFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2UuaGFuZHNGcmVlLnJlYWQocmVhZGVyKTtcblx0XHRcdHVwZGF0ZVZpc2liaWxpdHkoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHQvLyBCb3RoIHRoZSBlbmFibGUga2lsbC1zd2l0Y2ggYW5kIHRoZSBtb2RlbCBzZWxlY3Rpb24gY2FuIGNoYW5nZVxuXHRcdFx0Ly8gYXZhaWxhYmlsaXR5IChlLmcuIGFuIHVuc3VwcG9ydGVkIG9uLWRldmljZSBwbGF0Zm9ybSBiZWNvbWVzXG5cdFx0XHQvLyBjb25maWd1cmVkIHdoZW4gc3dpdGNoaW5nIHRvIHRoZSBjbG91ZCBiYWNrZW5kKS5cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkaWN0YXRpb24uZW5hYmxlZCcpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RpY3RhdGlvbi5tb2RlbCcpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRGljdGF0aW9uU2V0dGluZ0lkLlNob3dCdXR0b24pKSB7XG5cdFx0XHRcdHVwZGF0ZVZpc2liaWxpdHkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB0b2dnbGUgPSAoKSA9PiB0aGlzLnRvZ2dsZURpY3RhdGlvbigpO1xuXHRcdC8vIEEgc3R5bGVkIGRpdiBkb2Vzbid0IGdldCBFbnRlci9TcGFjZSBhY3RpdmF0aW9uIG9yIHRvdWNoIHRhcCBmb3IgZnJlZTtcblx0XHQvLyB3aXJlIHRoZW0gZXhwbGljaXRseSBzbyB0aGUgYnV0dG9uIGlzIGtleWJvYXJkLSBhbmQgdG91Y2gtYWNjZXNzaWJsZS5cblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldChidXR0b24pKTtcblx0XHRbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXS5mb3JFYWNoKGV2ZW50VHlwZSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgZXZlbnRUeXBlLCBlID0+IHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHRcdHZvaWQgdG9nZ2xlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZXZlbnQsIHRydWUpO1xuXHRcdFx0XHR2b2lkIHRvZ2dsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJpZ2h0LWNsaWNrIHNob3dzIGRpY3RhdGlvbi1zcGVjaWZpYyBlbnRyaWVzIChcIkNvbmZpZ3VyZSBLZXliaW5kaW5nXCIsXG5cdFx0Ly8gXCJTZWxlY3QgTWljcm9waG9uZVwiLCBcIkRpc2FibGUgRGljdGF0aW9uXCIpIG1pcnJvcmluZyB0aGUgY2hhdC1pbnB1dCBtaWNcblx0XHQvLyBidXR0b24sIHNpbmNlIHRoaXMgY3VzdG9tIGJ1dHRvbiBpc24ndCBhIGBNZW51RW50cnlBY3Rpb25WaWV3SXRlbWAuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkTWljQnV0dG9uQ29udGV4dE1lbnVMaXN0ZW5lcihcblx0XHRcdGJ1dHRvbixcblx0XHRcdCgpID0+IGdldERpY3RhdGlvbkNvbnRleHRNZW51QWN0aW9ucyh0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCBUT0dHTEVfRElDVEFUSU9OX0NPTU1BTkRfSUQpLFxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0KSk7XG5cdH1cblxuXHQvKipcblx0ICogVG9nZ2xlIGRpY3RhdGlvbiBpbnRvIHRoaXMgY29tcG9zZXIncyBlZGl0b3IuIFNoYXJlZCBieSB0aGUgbWljIGJ1dHRvbiBhbmRcblx0ICogdGhlIENtZC9DdHJsK0kgY2hvcmQgKHtAbGluayBUT0dHTEVfRElDVEFUSU9OX0NPTU1BTkRfSUR9KTsgdGhlIHNoYXJlZFxuXHQgKiBEaWN0YXRlIGFjdGlvbiBjYW4ndCB0YXJnZXQgdGhpcyBjb21wb3NlciBzaW5jZSBpdCBpc24ndCBhbiBgSUNoYXRXaWRnZXRgLlxuXHQgKi9cblx0YXN5bmMgdG9nZ2xlRGljdGF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHJ1bkRpY3RhdGlvblNob3J0Y3V0KHtcblx0XHRcdHNwZWVjaFNlcnZpY2U6IHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsXG5cdFx0XHRrZXliaW5kaW5nU2VydmljZTogdGhpcy5rZXliaW5kaW5nU2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2U6IHRoaXMubG9nU2VydmljZSxcblx0XHRcdG9uYm9hcmRpbmdTZXJ2aWNlOiB0aGlzLmRpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlLFxuXHRcdH0sIFRPR0dMRV9ESUNUQVRJT05fQ09NTUFORF9JRCwgdGhpcy5fZWRpdG9yKTtcblx0fVxuXG5cdC8vIC0tLSBJbnB1dCBIaXN0b3J5IChJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQpIC0tLVxuXG5cdHNob3dQcmV2aW91c1ZhbHVlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oaXN0b3J5LmlzQXRTdGFydCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kcmFmdFN0YXRlPy5pbnB1dFRleHQgfHwgdGhpcy5fZHJhZnRTdGF0ZT8uYXR0YWNobWVudHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9oaXN0b3J5Lm92ZXJsYXkodGhpcy5fdG9IaXN0b3J5RW50cnkodGhpcy5fZHJhZnRTdGF0ZSkpO1xuXHRcdH1cblx0XHR0aGlzLl9uYXZpZ2F0ZUhpc3RvcnkodHJ1ZSk7XG5cdH1cblxuXHRzaG93TmV4dFZhbHVlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oaXN0b3J5LmlzQXRFbmQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZHJhZnRTdGF0ZT8uaW5wdXRUZXh0IHx8IHRoaXMuX2RyYWZ0U3RhdGU/LmF0dGFjaG1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5faGlzdG9yeS5vdmVybGF5KHRoaXMuX3RvSGlzdG9yeUVudHJ5KHRoaXMuX2RyYWZ0U3RhdGUpKTtcblx0XHR9XG5cdFx0dGhpcy5fbmF2aWdhdGVIaXN0b3J5KGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURyYWZ0U3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZHJhZnRTdGF0ZSA9IHtcblx0XHRcdGlucHV0VGV4dDogdGhpcy5fZWRpdG9yPy5nZXRNb2RlbCgpPy5nZXRWYWx1ZSgpID8/ICcnLFxuXHRcdFx0YXR0YWNobWVudHM6IFsuLi50aGlzLl9jb250ZXh0QXR0YWNobWVudHMuYXR0YWNobWVudHNdLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90b0hpc3RvcnlFbnRyeShkcmFmdDogSURyYWZ0U3RhdGUpOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmRyYWZ0LFxuXHRcdFx0bW9kZTogeyBpZDogQ2hhdE1vZGVLaW5kLkFnZW50LCBraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQgfSxcblx0XHRcdHNlbGVjdGVkTW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdHNlbGVjdGlvbnM6IFtdLFxuXHRcdFx0Y29udHJpYjoge30sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX25hdmlnYXRlSGlzdG9yeShwcmV2aW91czogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gcHJldmlvdXMgPyB0aGlzLl9oaXN0b3J5LnByZXZpb3VzKCkgOiB0aGlzLl9oaXN0b3J5Lm5leHQoKTtcblx0XHRjb25zdCBpbnB1dFRleHQgPSBlbnRyeT8uaW5wdXRUZXh0ID8/ICcnO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yPy5nZXRNb2RlbCgpPy5zZXRWYWx1ZShpbnB1dFRleHQpO1xuXHRcdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLnNldEF0dGFjaG1lbnRzKGVudHJ5LmF0dGFjaG1lbnRzKTtcblx0XHR9XG5cdFx0YXJpYS5zdGF0dXMoaW5wdXRUZXh0KTtcblx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRjb25zdCBsYXN0TGluZSA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiBsYXN0TGluZSwgY29sdW1uOiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxhc3RMaW5lKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gU2VuZCAtLS1cblxuXG5cdGFzeW5jIHN1Ym1pdChiYWNrZ3JvdW5kID0gZmFsc2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZChiYWNrZ3JvdW5kKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmQoYmFja2dyb3VuZCA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmF3UXVlcnkgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0VmFsdWUoKSA/PyAnJztcblx0XHRjb25zdCBxdWVyeSA9IHJhd1F1ZXJ5LnRyaW0oKTtcblx0XHRjb25zdCBxdWVyeU9mZnNldCA9IHJhd1F1ZXJ5Lmxlbmd0aCAtIHJhd1F1ZXJ5LnRyaW1TdGFydCgpLmxlbmd0aDtcblx0XHRjb25zdCBoYXNTZW5kYWJsZUF0dGFjaG1lbnQgPSB0aGlzLl9jb250ZXh0QXR0YWNobWVudHMuYXR0YWNobWVudHMuc29tZShpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5KTtcblx0XHRjb25zdCBoYXNBZGRpdGlvbmFsU2VuZENvbnRlbnQgPSB0aGlzLm9wdGlvbnMuaGFzQWRkaXRpb25hbFNlbmRDb250ZW50Py5nZXQoKSA/PyBmYWxzZTtcblx0XHRpZiAoKCFxdWVyeSAmJiAhaGFzU2VuZGFibGVBdHRhY2htZW50ICYmICFoYXNBZGRpdGlvbmFsU2VuZENvbnRlbnQpIHx8IHRoaXMuX3NlbmRpbmcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBSZXNwZWN0IHRoZSBzYW1lIGdhdGUgYXMgdGhlIHNlbmQgYnV0dG9uIChlLmcuIGEgc2Vzc2lvbiB3aXRoIG5vXG5cdFx0Ly8gdXNhYmxlIG1vZGVsKS4gVGhlIEVudGVyIGtleWJpbmRpbmcgYW5kIHNsYXNoLWNvbW1hbmQgcGF0aHMgcmVhY2hcblx0XHQvLyBoZXJlIGRpcmVjdGx5LCBieXBhc3NpbmcgdGhlIGJ1dHRvbidzIGRpc2FibGVkIHN0YXRlLlxuXHRcdGlmICghdGhpcy5fY2FuU2VuZFJlcXVlc3QuZ2V0KCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBNZWFzdXJlIGFueSBwZW5kaW5nIGRpY3RhdGlvbiBhY2N1cmFjeSBhZ2FpbnN0IHRoZSB0ZXh0IGJlaW5nIHNlbnQsXG5cdFx0Ly8gYmVmb3JlIHRoZSBlZGl0b3IgaXMgY2xlYXJlZCBiZWxvdy5cblx0XHRub3RpZnlEaWN0YXRpb25TdWJtaXR0ZWQodGhpcy5fZWRpdG9yKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLm9wdGlvbnMuc2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIWhhc0FkZGl0aW9uYWxTZW5kQ29udGVudCAmJiBzZXNzaW9uICYmIGF3YWl0IHRoaXMuY2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZS50cnlIYW5kbGUoe1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLFxuXHRcdFx0cHJvdmlkZXJJZDogc2Vzc2lvbi5wcm92aWRlcklkLFxuXHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdGlucHV0OiBxdWVyeSxcblx0XHR9KSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LnNldFZhbHVlKCcnKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gdGhpcy5fYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlcj8uZ2V0QXR0YWNobWVudHNGb3JTZW5kKHF1ZXJ5LCBxdWVyeU9mZnNldCkgPz8gWy4uLnRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5hdHRhY2htZW50c107XG5cdFx0Y29uc3QgYXR0YWNoZWRDb250ZXh0ID0gYXR0YWNobWVudHMubGVuZ3RoID4gMFxuXHRcdFx0PyBhdHRhY2htZW50c1xuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHF1ZXJ5O1xuXG5cdFx0aWYgKHRoaXMuX2RyYWZ0U3RhdGUpIHtcblx0XHRcdHRoaXMuX2hpc3RvcnkuYXBwZW5kKHRoaXMuX3RvSGlzdG9yeUVudHJ5KHRoaXMuX2RyYWZ0U3RhdGUpKTtcblx0XHR9XG5cdFx0dGhpcy5fY2xlYXJEcmFmdFN0YXRlKCk7XG5cblx0XHR0aGlzLl9zZW5kaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9lZGl0b3IudXBkYXRlT3B0aW9ucyh7IHJlYWRPbmx5OiB0cnVlIH0pO1xuXHRcdHRoaXMuX3VwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xuXHRcdHRoaXMuX3VwZGF0ZUlucHV0TG9hZGluZ1N0YXRlKCk7XG5cblx0XHRsZXQgc2VudCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRzZW50ID0gYXdhaXQgdGhpcy5vcHRpb25zLnNlbmRSZXF1ZXN0KHsgcXVlcnk6IHJlcXVlc3QsIGF0dGFjaG1lbnRzOiBhdHRhY2hlZENvbnRleHQsIGJhY2tncm91bmQgfSk7XG5cdFx0XHRpZiAoIXNlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8uc2V0VmFsdWUoJycpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHNlbmQgcmVxdWVzdDonLCBlKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc2VuZGluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogZmFsc2UgfSk7XG5cdFx0XHR0aGlzLl91cGRhdGVEcmFmdFN0YXRlKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUlucHV0TG9hZGluZ1N0YXRlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBzZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2VuZEJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBoYXNUZXh0ID0gISF0aGlzLl9lZGl0b3I/LmdldE1vZGVsKCk/LmdldFZhbHVlKCkudHJpbSgpO1xuXHRcdGNvbnN0IGhhc1NlbmRhYmxlQXR0YWNobWVudCA9IHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5hdHRhY2htZW50cy5zb21lKGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnkpO1xuXHRcdGNvbnN0IGhhc0FkZGl0aW9uYWxTZW5kQ29udGVudCA9IHRoaXMub3B0aW9ucy5oYXNBZGRpdGlvbmFsU2VuZENvbnRlbnQ/LmdldCgpID8/IGZhbHNlO1xuXHRcdHRoaXMuX3NlbmRCdXR0b24uZW5hYmxlZCA9ICF0aGlzLl9zZW5kaW5nICYmIChoYXNUZXh0IHx8IGhhc1NlbmRhYmxlQXR0YWNobWVudCB8fCBoYXNBZGRpdGlvbmFsU2VuZENvbnRlbnQpICYmIHRoaXMuX2NhblNlbmRSZXF1ZXN0LmdldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZVN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRyYWZ0ID0gdGhpcy5fZ2V0RHJhZnRTdGF0ZSgpO1xuXHRcdGlmIChkcmFmdCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yPy5nZXRNb2RlbCgpPy5zZXRWYWx1ZShkcmFmdC5pbnB1dFRleHQpO1xuXHRcdFx0aWYgKGRyYWZ0LmF0dGFjaG1lbnRzPy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLnNldEF0dGFjaG1lbnRzKGRyYWZ0LmF0dGFjaG1lbnRzLm1hcChJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LmZyb21FeHBvcnQpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXREcmFmdFN0YXRlKCk6IElEcmFmdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTVE9SQUdFX0tFWV9EUkFGVF9TVEFURSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShyYXcpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckRyYWZ0U3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZHJhZnRTdGF0ZSA9IHsgaW5wdXRUZXh0OiAnJywgYXR0YWNobWVudHM6IFtdIH07XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9EUkFGVF9TVEFURSwgSlNPTi5zdHJpbmdpZnkodGhpcy5fZHJhZnRTdGF0ZSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RyYWZ0U3RhdGUpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0ge1xuXHRcdFx0XHQuLi50aGlzLl9kcmFmdFN0YXRlLFxuXHRcdFx0XHRhdHRhY2htZW50czogdGhpcy5fZHJhZnRTdGF0ZS5hdHRhY2htZW50cy5tYXAoSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeS50b0V4cG9ydCksXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9EUkFGVF9TVEFURSwgSlNPTi5zdHJpbmdpZnkoc3RhdGUpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdGxheW91dChfaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21wYWN0TW9kZWxQaWNrZXIuc2V0KHdpZHRoIDwgTmV3Q2hhdElucHV0V2lkZ2V0LmNvbXBhY3RNb2RlbFBpY2tlcldpZHRoLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2VkaXRvcj8ubGF5b3V0KCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3I/LmZvY3VzKCk7XG5cdH1cblxuXHRhc3luYyBhbmltYXRlUHJvbXB0KHRleHQ6IHN0cmluZywgZHVyYXRpb25NczogbnVtYmVyLCBwbGFjZWhvbGRlcjogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGV4cGVjdGVkVmFsdWUgPSAnJyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvcjtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRpZiAoIWVkaXRvciB8fCAhbW9kZWwgfHwgIXRleHQgfHwgbW9kZWwuZ2V0VmFsdWUoKSAhPT0gZXhwZWN0ZWRWYWx1ZSB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Byb21wdFR5cGluZ0FuaW1hdGlvbi5jbGVhcigpO1xuXHRcdGlmIChleHBlY3RlZFZhbHVlKSB7XG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb21wdFRlbXBsYXRlUGxhY2Vob2xkZXIudmFsdWU/LnNldFBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyKTtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuX2VkaXRvckNvbnRhaW5lcik7XG5cdFx0Y29uc3QgZWZmZWN0aXZlRHVyYXRpb24gPSB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpIHx8IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSA/IDAgOiBkdXJhdGlvbk1zO1xuXHRcdGNvbnN0IGFuaW1hdGlvbiA9IGFuaW1hdGVQcm9tcHRUeXBpbmcoe1xuXHRcdFx0Z2V0VmFsdWU6ICgpID0+IG1vZGVsLmdldFZhbHVlKCksXG5cdFx0XHRzZXRWYWx1ZTogdmFsdWUgPT4ge1xuXHRcdFx0XHRtb2RlbC5zZXRWYWx1ZSh2YWx1ZSk7XG5cdFx0XHRcdGNvbnN0IGxhc3RMaW5lID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IGxhc3RMaW5lLCBjb2x1bW46IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGFzdExpbmUpIH0pO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBsaXN0ZW5lciA9PiBtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gbGlzdGVuZXIoKSksXG5cdFx0fSwgdGV4dCwgZWZmZWN0aXZlRHVyYXRpb24sIHtcblx0XHRcdG5vdzogKCkgPT4gdGFyZ2V0V2luZG93LnBlcmZvcm1hbmNlLm5vdygpLFxuXHRcdFx0c2NoZWR1bGU6IGNhbGxiYWNrID0+IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgY2FsbGJhY2spLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3Byb21wdFR5cGluZ0FuaW1hdGlvbi52YWx1ZSA9IGFuaW1hdGlvbjtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25MaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9wcm9tcHRUeXBpbmdBbmltYXRpb24udmFsdWUgPT09IGFuaW1hdGlvbikge1xuXHRcdFx0XHR0aGlzLl9wcm9tcHRUeXBpbmdBbmltYXRpb24uY2xlYXIoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFuaW1hdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiAoYXdhaXQgYW5pbWF0aW9uLnJlc3VsdCkuZGlkV3JpdGU7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNhbmNlbGxhdGlvbkxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGlmICh0aGlzLl9wcm9tcHRUeXBpbmdBbmltYXRpb24udmFsdWUgPT09IGFuaW1hdGlvbikge1xuXHRcdFx0XHR0aGlzLl9wcm9tcHRUeXBpbmdBbmltYXRpb24uY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXBsYWNlUHJvbXB0KHRleHQ6IHN0cmluZywgcGxhY2Vob2xkZXI6IHN0cmluZywgZXhwZWN0ZWRWYWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsIHx8IG1vZGVsLmdldFZhbHVlKCkgIT09IGV4cGVjdGVkVmFsdWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvbXB0VHlwaW5nQW5pbWF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fcHJvbXB0VGVtcGxhdGVQbGFjZWhvbGRlci52YWx1ZT8uc2V0UGxhY2Vob2xkZXIocGxhY2Vob2xkZXIpO1xuXHRcdHRoaXMuX2VkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRjb25zdCBlZGl0ZWQgPSB0aGlzLl9lZGl0b3IuZXhlY3V0ZUVkaXRzKCdzZXNzaW9ucy5wcm9tcHRPcHRpb24nLCBbeyByYW5nZTogbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdGV4dCB9XSk7XG5cdFx0aWYgKCFlZGl0ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGNvbnN0IGxhc3RMaW5lID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0dGhpcy5fZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogbGFzdExpbmUsIGNvbHVtbjogbW9kZWwuZ2V0TGluZU1heENvbHVtbihsYXN0TGluZSkgfSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzaG93UHJvbXB0T3B0aW9ucyhzdGF0ZTogTmV3U2Vzc2lvblByb21wdE9wdGlvbnNTdGF0ZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdGF0ZSAmJiB0aGlzLl9wcm9tcHRPcHRpb25zRGlzbWlzc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb21wdE9wdGlvbnNTdGF0ZSA9IHN0YXRlO1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX3Byb21wdE9wdGlvbnNXaWRnZXQudmFsdWU7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0d2lkZ2V0LnNldFN0YXRlKHN0YXRlKTtcblx0XHR3aWRnZXQuc2V0SW5wdXRWYWx1ZSh0aGlzLl9lZGl0b3IuZ2V0VmFsdWUoKSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXRQcm9tcHRPcHRpb25zQ29udHJvbGxlcihjb250cm9sbGVyOiBJTmV3U2Vzc2lvblByb21wdE9wdGlvbnNDb250cm9sbGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuY2VsUHJvbXB0T3B0aW9uc1JlZnJlc2goZmFsc2UpO1xuXHRcdHRoaXMuX3Byb21wdE9wdGlvbnNDb250cm9sbGVyID0gY29udHJvbGxlcjtcblx0XHR0aGlzLl9wcm9tcHRPcHRpb25zRGlzbWlzc2VkID0gZmFsc2U7XG5cdH1cblxuXHRwcmVwYXJlUHJvbXB0T3B0aW9uc1JlZnJlc2goKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9wcm9tcHRPcHRpb25zQ29udHJvbGxlciB8fCB0aGlzLl9wcm9tcHRPcHRpb25zRGlzbWlzc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2NhbmNlbFByb21wdE9wdGlvbnNSZWZyZXNoKCk7XG5cdFx0dGhpcy5zaG93UHJvbXB0T3B0aW9ucyh7IGtpbmQ6ICdsb2FkaW5nJyB9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNsZWFyUHJvbXB0T3B0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5jZWxQcm9tcHRPcHRpb25zUmVmcmVzaCgpO1xuXHRcdHRoaXMuc2hvd1Byb21wdE9wdGlvbnModW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc21pc3NQcm9tcHRPcHRpb25zKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wcm9tcHRPcHRpb25zRGlzbWlzc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9wcm9tcHRPcHRpb25zQ29udHJvbGxlcjtcblx0XHR0aGlzLl9wcm9tcHRPcHRpb25zRGlzbWlzc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9jYW5jZWxQcm9tcHRPcHRpb25zUmVmcmVzaChmYWxzZSk7XG5cdFx0dGhpcy5zaG93UHJvbXB0T3B0aW9ucyh1bmRlZmluZWQpO1xuXHRcdHRoaXMuZm9jdXMoKTtcblx0XHRhcmlhLnN0YXR1cyhsb2NhbGl6ZSgnbmV3U2Vzc2lvblByb21wdE9wdGlvbnMuY2xvc2VkJywgXCJQcm9tcHQgb3B0aW9ucyBjbG9zZWRcIikpO1xuXHRcdGNvbnRyb2xsZXI/Lm9uRGlkQ2xvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFByb21wdE9wdGlvbnNSZWZyZXNoKGNsZWFyR2VuZXJhdGVkSW5wdXQgPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvdWxkQ2xlYXJJbnB1dCA9IHRoaXMuX3Byb21wdE9wdGlvbnNXaWRnZXQudmFsdWU/LnNob3VsZENsZWFySW5wdXRGb3JSZWZyZXNoKCkgPz8gZmFsc2U7XG5cdFx0dGhpcy5fcHJvbXB0VHlwaW5nQW5pbWF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fcHJvbXB0T3B0aW9uc1JlZnJlc2gudmFsdWU/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3Byb21wdE9wdGlvbnNSZWZyZXNoLmNsZWFyKCk7XG5cdFx0aWYgKGNsZWFyR2VuZXJhdGVkSW5wdXQgJiYgc2hvdWxkQ2xlYXJJbnB1dCkge1xuXHRcdFx0dGhpcy5fcHJvbXB0VGVtcGxhdGVQbGFjZWhvbGRlci52YWx1ZT8uc2V0UGxhY2Vob2xkZXIodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5zZXRWYWx1ZSgnJyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVmcmVzaFByb21wdE9wdGlvbnModG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9wcm9tcHRPcHRpb25zQ29udHJvbGxlcjtcblx0XHRpZiAoIWNvbnRyb2xsZXIgfHwgIXRoaXMucHJlcGFyZVByb21wdE9wdGlvbnNSZWZyZXNoKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHR0aGlzLl9wcm9tcHRPcHRpb25zUmVmcmVzaC52YWx1ZSA9IGN0cztcblx0XHRsZXQgc3RhdGU6IE5ld1Nlc3Npb25Qcm9tcHRPcHRpb25zU3RhdGU7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXRlID0gYXdhaXQgY29udHJvbGxlci5yZXNvbHZlKGN0cy50b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0aGlzLl9wcm9tcHRPcHRpb25zUmVmcmVzaC52YWx1ZSA9PT0gY3RzKSB7XG5cdFx0XHRcdHRoaXMuX3Byb21wdE9wdGlvbnNSZWZyZXNoLmNsZWFyKCk7XG5cdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dQcm9tcHRPcHRpb25zKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Byb21wdE9wdGlvbnNSZWZyZXNoLnZhbHVlICE9PSBjdHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhpcy5fcHJvbXB0T3B0aW9uc1JlZnJlc2guY2xlYXIoKTtcblx0XHRcdHRoaXMuc2hvd1Byb21wdE9wdGlvbnModW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvbXB0T3B0aW9uc1JlZnJlc2guY2xlYXIoKTtcblx0XHRyZXR1cm4gdGhpcy5zaG93UHJvbXB0T3B0aW9ucyhzdGF0ZSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFByb21wdE9wdGlvbnNSZWZyZXNoKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqIFNlZSB7QGxpbmsgSU5ld0NoYXRWb2ljZUNvbXBvc2VyLnJvdXRlc1doaWxlU2Vzc2lvbkFjdGl2ZX0uICovXG5cdGdldCByb3V0ZXNXaGlsZVNlc3Npb25BY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy52b2ljZVJvdXRlc1doaWxlU2Vzc2lvbkFjdGl2ZSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByZWZpbGxJbnB1dCh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3I7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0aWYgKGVkaXRvciAmJiBtb2RlbCkge1xuXHRcdFx0bW9kZWwuc2V0VmFsdWUodGV4dCk7XG5cdFx0XHRjb25zdCBsYXN0TGluZSA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsYXN0TGluZSk7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiBsYXN0TGluZSwgY29sdW1uOiBtYXhDb2x1bW4gfSk7XG5cdFx0XHRlZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRzZW5kUXVlcnkodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gQSBzdWJtaXQgaXMgYWxyZWFkeSBpbiBmbGlnaHQgKGUuZy4gYSByYXBpZCBzZWNvbmQgdHJhbnNjcmlwdCBiZWZvcmUgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBpcyBjcmVhdGVkKTsgZG9uJ3QgY2xvYmJlciB0aGUgaW4tZmxpZ2h0IHRleHQgb3IgZG91YmxlLXN1Ym1pdC5cblx0XHRpZiAodGhpcy5fc2VuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdGNvbnN0IGNvbWJpbmVkID0gY29tYmluZVZvaWNlSW5wdXQobW9kZWwuZ2V0VmFsdWUoKSwgdGV4dCk7XG5cdFx0XHRtb2RlbC5zZXRWYWx1ZShjb21iaW5lZCk7XG5cdFx0XHR0aGlzLl9zZW5kKCk7XG5cdFx0fVxuXHR9XG5cblx0YXR0YWNoKHVyaXM6IFVSSVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLmFkZEF0dGFjaG1lbnRzKC4uLnVyaXMubWFwKHVyaSA9PiB0b0ZpbGVWYXJpYWJsZUVudHJ5KHVyaSkpKTtcblx0fVxuXG5cdGdldFZvaWNlTW9kZWxzKCkge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbC5zdGF0ZS5nZXQoKS5tb2RlbHM7XG5cdH1cblxuXHRzZWxlY3RWb2ljZU1vZGVsKGlkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbC5zZWxlY3RNb2RlbChpZGVudGlmaWVyKTtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksaUJBQTZCLG1CQUFtQixvQkFBb0I7QUFDekYsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFFdkIsU0FBMEMsK0JBQStCO0FBQ3pFLFNBQVMsd0JBQWtEO0FBQzNELFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMscUJBQXFCO0FBQzlCLFNBQW1DLHlCQUF5QjtBQUM1RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQixvQkFBb0IscUJBQXFCO0FBQ2xFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25D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
