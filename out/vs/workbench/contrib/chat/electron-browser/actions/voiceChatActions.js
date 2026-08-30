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
import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { RunOnceScheduler, disposableTimeout, raceCancellation } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { isNumber } from "../../../../../base/common/types.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { Action2, MenuId } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { Extensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { contrastBorder, focusBorder } from "../../../../../platform/theme/common/colorRegistry.js";
import { editorInfoForeground } from "../../../../../platform/theme/common/colors/editorColors.js";
import { spinningLoading, syncing } from "../../../../../platform/theme/common/iconRegistry.js";
import { isHighContrast } from "../../../../../platform/theme/common/theme.js";
import { registerThemingParticipant } from "../../../../../platform/theme/common/themeService.js";
import { ActiveEditorContext } from "../../../../common/contextkeys.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../../services/layout/browser/layoutService.js";
import { IStatusbarService, StatusbarAlignment } from "../../../../services/statusbar/browser/statusbar.js";
import { AccessibilityVoiceSettingId, SpeechTimeoutDefault, accessibilityConfigurationNodeBase } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { InlineChatController } from "../../../inlineChat/browser/inlineChatController.js";
import { CTX_INLINE_CHAT_FOCUSED, MENU_INLINE_CHAT_WIDGET_SECONDARY } from "../../../inlineChat/common/inlineChat.js";
import { NOTEBOOK_EDITOR_FOCUSED } from "../../../notebook/common/notebookContextKeys.js";
import { CONTEXT_SETTINGS_EDITOR } from "../../../preferences/common/preferences.js";
import { SearchContext } from "../../../search/common/constants.js";
import { TextToSpeechInProgress as GlobalTextToSpeechInProgress, HasSpeechProvider, ISpeechService, KeywordRecognitionStatus, SpeechToTextInProgress, SpeechToTextStatus, TextToSpeechStatus } from "../../../speech/common/speechService.js";
import { CHAT_CATEGORY } from "../../browser/actions/chatActions.js";
import { IChatWidgetService, IQuickChatService } from "../../browser/chat.js";
import { SegmentedVoiceInputModePillInactive } from "../../browser/voiceInputMode/voiceInputModeContextKeys.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { KEYWORD_ACTIVIATION_SETTING_ID } from "../../common/chatService/chatService.js";
import { ChatResponseViewModel, isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { VoiceChatInProgress as GlobalVoiceChatInProgress, IVoiceChatService } from "../../common/voiceChatService.js";
import "./media/voiceChatActions.css";
const VoiceChatSessionContexts = ["view", "inline", "quick", "editor"];
const CanVoiceChat = ContextKeyExpr.and(ChatContextKeys.enabled, HasSpeechProvider);
const FocusInChatInput = ContextKeyExpr.or(CTX_INLINE_CHAT_FOCUSED, ChatContextKeys.inChatInput);
const ScopedVoiceChatGettingReady = new RawContextKey("scopedVoiceChatGettingReady", false, { type: "boolean", description: localize("scopedVoiceChatGettingReady", "True when getting ready for receiving voice input from the microphone for voice chat. This key is only defined scoped, per chat context.") });
const ScopedVoiceChatInProgress = new RawContextKey("scopedVoiceChatInProgress", void 0, { type: "string", description: localize("scopedVoiceChatInProgress", "Defined as a location where voice recording from microphone is in progress for voice chat. This key is only defined scoped, per chat context.") });
const AnyScopedVoiceChatInProgress = ContextKeyExpr.or(...VoiceChatSessionContexts.map((context) => ScopedVoiceChatInProgress.isEqualTo(context)));
var VoiceChatSessionState = /* @__PURE__ */ ((VoiceChatSessionState2) => {
  VoiceChatSessionState2[VoiceChatSessionState2["Stopped"] = 1] = "Stopped";
  VoiceChatSessionState2[VoiceChatSessionState2["GettingReady"] = 2] = "GettingReady";
  VoiceChatSessionState2[VoiceChatSessionState2["Started"] = 3] = "Started";
  return VoiceChatSessionState2;
})(VoiceChatSessionState || {});
class VoiceChatSessionControllerFactory {
  static async create(accessor, context) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const quickChatService = accessor.get(IQuickChatService);
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const editorService = accessor.get(IEditorService);
    switch (context) {
      case "focused": {
        const controller = VoiceChatSessionControllerFactory.doCreateForFocusedChat(chatWidgetService, layoutService);
        return controller ?? VoiceChatSessionControllerFactory.create(accessor, "view");
      }
      case "view": {
        const chatWidget = await chatWidgetService.revealWidget();
        if (chatWidget) {
          return VoiceChatSessionControllerFactory.doCreateForChatWidget("view", chatWidget);
        }
        break;
      }
      case "inline": {
        const activeCodeEditor = getCodeEditor(editorService.activeTextEditorControl);
        if (activeCodeEditor) {
          const inlineChat = InlineChatController.get(activeCodeEditor);
          if (inlineChat) {
            if (!inlineChat.isActive) {
              inlineChat.run();
            }
            return VoiceChatSessionControllerFactory.doCreateForChatWidget("inline", inlineChat.widget.chatWidget);
          }
        }
        break;
      }
      case "quick": {
        quickChatService.open();
        return VoiceChatSessionControllerFactory.create(accessor, "focused");
      }
    }
    return void 0;
  }
  static doCreateForFocusedChat(chatWidgetService, layoutService) {
    const chatWidget = chatWidgetService.lastFocusedWidget;
    if (chatWidget?.hasInputFocus()) {
      let context;
      if (layoutService.hasFocus(Parts.EDITOR_PART)) {
        context = chatWidget.location === ChatAgentLocation.Chat ? "editor" : "inline";
      } else if ([Parts.SIDEBAR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART, Parts.TITLEBAR_PART, Parts.STATUSBAR_PART, Parts.BANNER_PART, Parts.ACTIVITYBAR_PART].some((part) => layoutService.hasFocus(part))) {
        context = "view";
      } else {
        context = "quick";
      }
      return VoiceChatSessionControllerFactory.doCreateForChatWidget(context, chatWidget);
    }
    return void 0;
  }
  static createChatContextKeyController(contextKeyService, context) {
    const contextVoiceChatGettingReady = ScopedVoiceChatGettingReady.bindTo(contextKeyService);
    const contextVoiceChatInProgress = ScopedVoiceChatInProgress.bindTo(contextKeyService);
    return (state) => {
      switch (state) {
        case 2 /* GettingReady */:
          contextVoiceChatGettingReady.set(true);
          contextVoiceChatInProgress.reset();
          break;
        case 3 /* Started */:
          contextVoiceChatGettingReady.reset();
          contextVoiceChatInProgress.set(context);
          break;
        case 1 /* Stopped */:
          contextVoiceChatGettingReady.reset();
          contextVoiceChatInProgress.reset();
          break;
      }
    };
  }
  static doCreateForChatWidget(context, chatWidget) {
    return {
      context,
      scopedContextKeyService: chatWidget.scopedContextKeyService,
      onDidAcceptInput: chatWidget.onDidAcceptInput,
      onDidHideInput: chatWidget.onDidHide,
      focusInput: () => chatWidget.focusInput(),
      acceptInput: () => chatWidget.acceptInput(void 0, { isVoiceInput: true }),
      updateInput: (text) => chatWidget.setInput(text),
      getInput: () => chatWidget.getInput(),
      setInputPlaceholder: (text) => chatWidget.setInputPlaceholder(text),
      clearInputPlaceholder: () => chatWidget.resetInputPlaceholder(),
      updateState: VoiceChatSessionControllerFactory.createChatContextKeyController(chatWidget.scopedContextKeyService, context)
    };
  }
}
let VoiceChatSessions = class {
  constructor(voiceChatService, configurationService, instantiationService, accessibilityService) {
    this.voiceChatService = voiceChatService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.accessibilityService = accessibilityService;
    this.currentVoiceChatSession = void 0;
    this.voiceChatSessionIds = 0;
  }
  static getInstance(instantiationService) {
    if (!VoiceChatSessions.instance) {
      VoiceChatSessions.instance = instantiationService.createInstance(VoiceChatSessions);
    }
    return VoiceChatSessions.instance;
  }
  async start(controller, context) {
    this.stop();
    ChatSynthesizerSessions.getInstance(this.instantiationService).stop();
    let disableTimeout = false;
    const sessionId = ++this.voiceChatSessionIds;
    const session = this.currentVoiceChatSession = {
      id: sessionId,
      controller,
      hasRecognizedInput: false,
      disposables: new DisposableStore(),
      setTimeoutDisabled: (disabled) => {
        disableTimeout = disabled;
      },
      accept: () => this.accept(sessionId),
      stop: () => this.stop(sessionId, controller.context)
    };
    const cts = new CancellationTokenSource();
    session.disposables.add(toDisposable(() => cts.dispose(true)));
    session.disposables.add(controller.onDidAcceptInput(() => this.stop(sessionId, controller.context)));
    session.disposables.add(controller.onDidHideInput(() => this.stop(sessionId, controller.context)));
    controller.focusInput();
    controller.updateState(2 /* GettingReady */);
    const voiceChatSession = await this.voiceChatService.createVoiceChatSession(cts.token, { usesAgents: controller.context !== "inline", model: context?.widget?.viewModel?.model });
    let inputValue = controller.getInput();
    let voiceChatTimeout = this.configurationService.getValue(AccessibilityVoiceSettingId.SpeechTimeout);
    if (!isNumber(voiceChatTimeout) || voiceChatTimeout < 0) {
      voiceChatTimeout = SpeechTimeoutDefault;
    }
    const acceptTranscriptionScheduler = session.disposables.add(new RunOnceScheduler(() => this.accept(sessionId), voiceChatTimeout));
    session.disposables.add(voiceChatSession.onDidChange(({ status, text, waitingForInput }) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      switch (status) {
        case SpeechToTextStatus.Started:
          this.onDidSpeechToTextSessionStart(controller, session.disposables);
          break;
        case SpeechToTextStatus.Recognizing:
          if (text) {
            session.hasRecognizedInput = true;
            session.controller.updateInput(inputValue ? [inputValue, text].join(" ") : text);
            if (voiceChatTimeout > 0 && context?.voice?.disableTimeout !== true && !disableTimeout) {
              acceptTranscriptionScheduler.cancel();
            }
          }
          break;
        case SpeechToTextStatus.Recognized:
          if (text) {
            session.hasRecognizedInput = true;
            inputValue = inputValue ? [inputValue, text].join(" ") : text;
            session.controller.updateInput(inputValue);
            if (voiceChatTimeout > 0 && context?.voice?.disableTimeout !== true && !waitingForInput && !disableTimeout) {
              acceptTranscriptionScheduler.schedule();
            }
          }
          break;
        case SpeechToTextStatus.Stopped:
          this.stop(session.id, controller.context);
          break;
      }
    }));
    return session;
  }
  onDidSpeechToTextSessionStart(controller, disposables) {
    controller.updateState(3 /* Started */);
    let dotCount = 0;
    const updatePlaceholder = () => {
      dotCount = (dotCount + 1) % 4;
      controller.setInputPlaceholder(`${localize("listening", "I'm listening")}${".".repeat(dotCount)}`);
      placeholderScheduler.schedule();
    };
    const placeholderScheduler = disposables.add(new RunOnceScheduler(updatePlaceholder, 500));
    updatePlaceholder();
  }
  stop(voiceChatSessionId = this.voiceChatSessionIds, context) {
    if (!this.currentVoiceChatSession || this.voiceChatSessionIds !== voiceChatSessionId || context && this.currentVoiceChatSession.controller.context !== context) {
      return;
    }
    this.currentVoiceChatSession.controller.clearInputPlaceholder();
    this.currentVoiceChatSession.controller.updateState(1 /* Stopped */);
    this.currentVoiceChatSession.disposables.dispose();
    this.currentVoiceChatSession = void 0;
  }
  async accept(voiceChatSessionId = this.voiceChatSessionIds) {
    if (!this.currentVoiceChatSession || this.voiceChatSessionIds !== voiceChatSessionId) {
      return;
    }
    if (!this.currentVoiceChatSession.hasRecognizedInput) {
      this.stop(voiceChatSessionId, this.currentVoiceChatSession.controller.context);
      return;
    }
    const controller = this.currentVoiceChatSession.controller;
    const response = await controller.acceptInput();
    if (!response) {
      return;
    }
    const autoSynthesize = this.configurationService.getValue(AccessibilityVoiceSettingId.AutoSynthesize);
    if (autoSynthesize === "on" || autoSynthesize !== "off" && !this.accessibilityService.isScreenReaderOptimized()) {
      let context;
      if (controller.context === "inline") {
        context = "focused";
      } else {
        context = controller;
      }
      ChatSynthesizerSessions.getInstance(this.instantiationService).start(this.instantiationService.invokeFunction((accessor) => ChatSynthesizerSessionController.create(accessor, context, response)));
    }
  }
};
VoiceChatSessions.instance = void 0;
VoiceChatSessions = __decorateClass([
  __decorateParam(0, IVoiceChatService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IAccessibilityService)
], VoiceChatSessions);
const VOICE_KEY_HOLD_THRESHOLD = 500;
async function startVoiceChatWithHoldMode(id, accessor, target, context) {
  const instantiationService = accessor.get(IInstantiationService);
  const keybindingService = accessor.get(IKeybindingService);
  const holdMode = keybindingService.enableKeybindingHoldMode(id);
  const controller = await VoiceChatSessionControllerFactory.create(accessor, target);
  if (!controller) {
    return;
  }
  const session = await VoiceChatSessions.getInstance(instantiationService).start(controller, context);
  let acceptVoice = false;
  const handle = disposableTimeout(() => {
    acceptVoice = true;
    session?.setTimeoutDisabled(true);
  }, VOICE_KEY_HOLD_THRESHOLD);
  await holdMode;
  handle.dispose();
  if (acceptVoice) {
    session.accept();
  }
}
class VoiceChatWithHoldModeAction extends Action2 {
  constructor(desc, target) {
    super(desc);
    this.target = target;
  }
  run(accessor, context) {
    return startVoiceChatWithHoldMode(this.desc.id, accessor, this.target, context);
  }
}
const _VoiceChatInChatViewAction = class _VoiceChatInChatViewAction extends VoiceChatWithHoldModeAction {
  constructor() {
    super({
      id: _VoiceChatInChatViewAction.ID,
      title: localize2("workbench.action.chat.voiceChatInView.label", "Voice Chat in Chat View"),
      category: CHAT_CATEGORY,
      precondition: CanVoiceChat,
      f1: true
    }, "view");
  }
};
_VoiceChatInChatViewAction.ID = "workbench.action.chat.voiceChatInChatView";
let VoiceChatInChatViewAction = _VoiceChatInChatViewAction;
const _HoldToVoiceChatInChatViewAction = class _HoldToVoiceChatInChatViewAction extends Action2 {
  constructor() {
    super({
      id: _HoldToVoiceChatInChatViewAction.ID,
      title: localize2("workbench.action.chat.holdToVoiceChatInChatView.label", "Hold to Voice Chat in Chat View"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(
          CanVoiceChat,
          ChatContextKeys.requestInProgress.negate(),
          // disable when a chat request is in progress
          FocusInChatInput?.negate(),
          // when already in chat input, disable this action and prefer to start voice chat directly
          EditorContextKeys.focus.negate(),
          // do not steal the inline-chat keybinding
          NOTEBOOK_EDITOR_FOCUSED.negate(),
          // do not steal the notebook keybinding
          SearchContext.SearchViewFocusedKey.negate(),
          // do not steal the search keybinding
          CONTEXT_SETTINGS_EDITOR.negate()
          // do not steal the settings editor keybinding
        ),
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      }
    });
  }
  async run(accessor, context) {
    const instantiationService = accessor.get(IInstantiationService);
    const keybindingService = accessor.get(IKeybindingService);
    const widgetService = accessor.get(IChatWidgetService);
    const holdMode = keybindingService.enableKeybindingHoldMode(_HoldToVoiceChatInChatViewAction.ID);
    let session;
    const handle = disposableTimeout(async () => {
      const controller = await VoiceChatSessionControllerFactory.create(accessor, "view");
      if (controller) {
        session = await VoiceChatSessions.getInstance(instantiationService).start(controller, context);
        session.setTimeoutDisabled(true);
      }
    }, VOICE_KEY_HOLD_THRESHOLD);
    (await widgetService.revealWidget())?.focusInput();
    await holdMode;
    handle.dispose();
    if (session) {
      session.accept();
    }
  }
};
_HoldToVoiceChatInChatViewAction.ID = "workbench.action.chat.holdToVoiceChatInChatView";
let HoldToVoiceChatInChatViewAction = _HoldToVoiceChatInChatViewAction;
const _InlineVoiceChatAction = class _InlineVoiceChatAction extends VoiceChatWithHoldModeAction {
  constructor() {
    super({
      id: _InlineVoiceChatAction.ID,
      title: localize2("workbench.action.chat.inlineVoiceChat", "Inline Voice Chat"),
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(
        CanVoiceChat,
        ActiveEditorContext
      ),
      f1: true
    }, "inline");
  }
};
_InlineVoiceChatAction.ID = "workbench.action.chat.inlineVoiceChat";
let InlineVoiceChatAction = _InlineVoiceChatAction;
const _QuickVoiceChatAction = class _QuickVoiceChatAction extends VoiceChatWithHoldModeAction {
  constructor() {
    super({
      id: _QuickVoiceChatAction.ID,
      title: localize2("workbench.action.chat.quickVoiceChat.label", "Quick Voice Chat"),
      category: CHAT_CATEGORY,
      precondition: CanVoiceChat,
      f1: true
    }, "quick");
  }
};
_QuickVoiceChatAction.ID = "workbench.action.chat.quickVoiceChat";
let QuickVoiceChatAction = _QuickVoiceChatAction;
const primaryVoiceActionMenu = (when, chatLocationOnlyWhen) => {
  return [
    {
      id: MenuId.ChatExecute,
      when: ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), when, chatLocationOnlyWhen),
      group: "navigation",
      order: 3
    },
    {
      id: MenuId.ChatExecute,
      when: ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat).negate(), when),
      group: "navigation",
      order: 2
    }
  ];
};
const _StartVoiceChatAction = class _StartVoiceChatAction extends Action2 {
  constructor() {
    super({
      id: _StartVoiceChatAction.ID,
      title: localize2("workbench.action.chat.startVoiceChat.label", "Start Voice Chat"),
      category: CHAT_CATEGORY,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(
          FocusInChatInput,
          // scope this action to chat input fields only
          EditorContextKeys.focus.negate(),
          // do not steal the editor inline-chat keybinding
          NOTEBOOK_EDITOR_FOCUSED.negate(),
          // do not steal the notebook inline-chat keybinding
          ChatContextKeys.speechToTextConfigured.negate()
          // built-in on-device dictation wins: yield the keybinding when it's available so it does not collide with the built-in dictation keybinding
        ),
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      },
      icon: Codicon.mic,
      precondition: ContextKeyExpr.and(
        CanVoiceChat,
        ScopedVoiceChatGettingReady.negate(),
        // disable when voice chat is getting ready
        SpeechToTextInProgress.negate()
        // disable when speech to text is in progress
      ),
      menu: primaryVoiceActionMenu(ContextKeyExpr.and(
        HasSpeechProvider,
        ChatContextKeys.speechToTextConfigured.negate(),
        // built-in on-device dictation wins: hide the extension mic when it's available so only one mic shows
        ScopedChatSynthesisInProgress.negate(),
        // hide when text to speech is in progress
        AnyScopedVoiceChatInProgress?.negate()
        // hide when voice chat is in progress
      ), SegmentedVoiceInputModePillInactive)
      // only hide in the main Chat location, where the segmented toggle provides a replacement; keep the mic in inline/quick chat
    });
  }
  async run(accessor, context) {
    const widget = context?.widget;
    if (widget) {
      widget.focusInput();
    }
    return startVoiceChatWithHoldMode(this.desc.id, accessor, "focused", context);
  }
};
_StartVoiceChatAction.ID = "workbench.action.chat.startVoiceChat";
let StartVoiceChatAction = _StartVoiceChatAction;
const _StopListeningAction = class _StopListeningAction extends Action2 {
  constructor() {
    super({
      id: _StopListeningAction.ID,
      title: localize2("workbench.action.chat.stopListening.label", "Stop Listening"),
      category: CHAT_CATEGORY,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 100,
        primary: KeyCode.Escape,
        when: AnyScopedVoiceChatInProgress
      },
      icon: spinningLoading,
      precondition: GlobalVoiceChatInProgress,
      // need global context here because of `f1: true`
      menu: primaryVoiceActionMenu(AnyScopedVoiceChatInProgress, SegmentedVoiceInputModePillInactive)
    });
  }
  async run(accessor) {
    VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).stop();
  }
};
_StopListeningAction.ID = "workbench.action.chat.stopListening";
let StopListeningAction = _StopListeningAction;
const _StopListeningAndSubmitAction = class _StopListeningAndSubmitAction extends Action2 {
  constructor() {
    super({
      id: _StopListeningAndSubmitAction.ID,
      title: localize2("workbench.action.chat.stopListeningAndSubmit.label", "Stop Listening and Submit"),
      category: CHAT_CATEGORY,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(
          FocusInChatInput,
          AnyScopedVoiceChatInProgress
        ),
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      },
      precondition: GlobalVoiceChatInProgress
      // need global context here because of `f1: true`
    });
  }
  run(accessor) {
    VoiceChatSessions.getInstance(accessor.get(IInstantiationService)).accept();
  }
};
_StopListeningAndSubmitAction.ID = "workbench.action.chat.stopListeningAndSubmit";
let StopListeningAndSubmitAction = _StopListeningAndSubmitAction;
const ScopedChatSynthesisInProgress = new RawContextKey("scopedChatSynthesisInProgress", false, { type: "boolean", description: localize("scopedChatSynthesisInProgress", "Defined as a location where voice recording from microphone is in progress for voice chat. This key is only defined scoped, per chat context.") });
class ChatSynthesizerSessionController {
  static create(accessor, context, response) {
    if (context === "focused") {
      return ChatSynthesizerSessionController.doCreateForFocusedChat(accessor, response);
    } else {
      return {
        onDidHideChat: context.onDidHideInput,
        contextKeyService: context.scopedContextKeyService,
        response
      };
    }
  }
  static doCreateForFocusedChat(accessor, response) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const contextKeyService = accessor.get(IContextKeyService);
    let chatWidget = chatWidgetService.getWidgetBySessionResource(response.session.sessionResource);
    if (chatWidget?.location === ChatAgentLocation.EditorInline) {
      chatWidget = chatWidgetService.lastFocusedWidget;
    }
    return {
      onDidHideChat: chatWidget?.onDidHide ?? Event.None,
      contextKeyService: chatWidget?.scopedContextKeyService ?? contextKeyService,
      response
    };
  }
}
let ChatSynthesizerSessions = class {
  constructor(speechService, configurationService, instantiationService) {
    this.speechService = speechService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.activeSession = void 0;
  }
  static getInstance(instantiationService) {
    if (!ChatSynthesizerSessions.instance) {
      ChatSynthesizerSessions.instance = instantiationService.createInstance(ChatSynthesizerSessions);
    }
    return ChatSynthesizerSessions.instance;
  }
  async start(controller) {
    this.stop();
    VoiceChatSessions.getInstance(this.instantiationService).stop();
    const activeSession = this.activeSession = new CancellationTokenSource();
    const disposables = new DisposableStore();
    disposables.add(activeSession.token.onCancellationRequested(() => disposables.dispose()));
    const session = await this.speechService.createTextToSpeechSession(activeSession.token, "chat");
    if (activeSession.token.isCancellationRequested) {
      return;
    }
    disposables.add(controller.onDidHideChat(() => this.stop()));
    const scopedChatToSpeechInProgress = ScopedChatSynthesisInProgress.bindTo(controller.contextKeyService);
    disposables.add(toDisposable(() => scopedChatToSpeechInProgress.reset()));
    disposables.add(session.onDidChange((e) => {
      switch (e.status) {
        case TextToSpeechStatus.Started:
          scopedChatToSpeechInProgress.set(true);
          break;
        case TextToSpeechStatus.Stopped:
          scopedChatToSpeechInProgress.reset();
          break;
      }
    }));
    for await (const chunk of this.nextChatResponseChunk(controller.response, activeSession.token)) {
      if (activeSession.token.isCancellationRequested) {
        return;
      }
      await raceCancellation(session.synthesize(chunk), activeSession.token);
    }
  }
  async *nextChatResponseChunk(response, token) {
    const context = {
      ignoreCodeBlocks: this.configurationService.getValue(AccessibilityVoiceSettingId.IgnoreCodeBlocks),
      insideCodeBlock: false
    };
    let totalOffset = 0;
    let complete = false;
    do {
      const responseLength = response.response.toString().length;
      const { chunk, offset } = this.parseNextChatResponseChunk(response, totalOffset, context);
      totalOffset = offset;
      complete = response.isComplete;
      if (chunk) {
        yield chunk;
      }
      if (token.isCancellationRequested) {
        return;
      }
      if (!complete && responseLength === response.response.toString().length) {
        await raceCancellation(Event.toPromise(response.onDidChange), token);
      }
    } while (!token.isCancellationRequested && !complete);
  }
  parseNextChatResponseChunk(response, offset, context) {
    let chunk = void 0;
    const text = response.response.toString();
    if (response.isComplete) {
      chunk = text.substring(offset);
      offset = text.length + 1;
    } else {
      const res = parseNextChatResponseChunk(text, offset);
      chunk = res.chunk;
      offset = res.offset;
    }
    if (chunk && context.ignoreCodeBlocks) {
      chunk = this.filterCodeBlocks(chunk, context);
    }
    return {
      chunk: chunk ? renderAsPlaintext({ value: chunk }) : chunk,
      // convert markdown to plain text
      offset
    };
  }
  filterCodeBlocks(chunk, context) {
    return chunk.split("\n").filter((line) => {
      if (line.trimStart().startsWith("```")) {
        context.insideCodeBlock = !context.insideCodeBlock;
        return false;
      }
      return !context.insideCodeBlock;
    }).join("\n");
  }
  stop() {
    this.activeSession?.dispose(true);
    this.activeSession = void 0;
  }
};
ChatSynthesizerSessions.instance = void 0;
ChatSynthesizerSessions = __decorateClass([
  __decorateParam(0, ISpeechService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IInstantiationService)
], ChatSynthesizerSessions);
const sentenceDelimiter = [".", "!", "?", ":"];
const lineDelimiter = "\n";
const wordDelimiter = " ";
function parseNextChatResponseChunk(text, offset) {
  let chunk = void 0;
  for (let i = text.length - 1; i >= offset; i--) {
    const cur = text[i];
    const next = text[i + 1];
    if (sentenceDelimiter.includes(cur) && next === wordDelimiter || // end of sentence
    lineDelimiter === cur) {
      chunk = text.substring(offset, i + 1).trim();
      offset = i + 1;
      break;
    }
  }
  return { chunk, offset };
}
class ReadChatResponseAloud extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.readChatResponseAloud",
      title: localize2("workbench.action.chat.readChatResponseAloud", "Read Aloud"),
      icon: Codicon.unmute,
      precondition: CanVoiceChat,
      menu: [{
        id: MenuId.ChatMessageFooter,
        when: ContextKeyExpr.and(
          CanVoiceChat,
          ChatContextKeys.isResponse,
          // only for responses
          ScopedChatSynthesisInProgress.negate(),
          // but not when already in progress
          ChatContextKeys.responseIsFiltered.negate()
          // and not when response is filtered
        ),
        group: "navigation",
        order: -10
        // first
      }, {
        id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
        when: ContextKeyExpr.and(
          CanVoiceChat,
          ChatContextKeys.isResponse,
          // only for responses
          ScopedChatSynthesisInProgress.negate(),
          // but not when already in progress
          ChatContextKeys.responseIsFiltered.negate()
          // and not when response is filtered
        ),
        group: "navigation",
        order: -10
        // first
      }]
    });
  }
  run(accessor, ...args) {
    const instantiationService = accessor.get(IInstantiationService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    let response = void 0;
    if (args.length > 0) {
      const responseArg = args[0];
      if (isResponseVM(responseArg)) {
        response = responseArg;
      }
    } else {
      const chatWidget = chatWidgetService.lastFocusedWidget;
      if (chatWidget) {
        const focus = chatWidget.getFocus();
        if (focus instanceof ChatResponseViewModel) {
          response = focus;
        } else {
          const chatViewModel = chatWidget.viewModel;
          if (chatViewModel) {
            const items = chatViewModel.getItems();
            for (let i = items.length - 1; i >= 0; i--) {
              const item = items[i];
              if (isResponseVM(item)) {
                response = item;
                break;
              }
            }
          }
        }
      }
    }
    if (!response) {
      return;
    }
    const controller = ChatSynthesizerSessionController.create(accessor, "focused", response.model);
    ChatSynthesizerSessions.getInstance(instantiationService).start(controller);
  }
}
const _StopReadAloud = class _StopReadAloud extends Action2 {
  constructor() {
    super({
      id: _StopReadAloud.ID,
      icon: syncing,
      title: localize2("workbench.action.speech.stopReadAloud", "Stop Reading Aloud"),
      f1: true,
      category: CHAT_CATEGORY,
      precondition: GlobalTextToSpeechInProgress,
      // need global context here because of `f1: true`
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 100,
        primary: KeyCode.Escape,
        when: ScopedChatSynthesisInProgress
      },
      menu: primaryVoiceActionMenu(ScopedChatSynthesisInProgress)
    });
  }
  async run(accessor) {
    ChatSynthesizerSessions.getInstance(accessor.get(IInstantiationService)).stop();
  }
};
_StopReadAloud.ID = "workbench.action.speech.stopReadAloud";
let StopReadAloud = _StopReadAloud;
const _StopReadChatItemAloud = class _StopReadChatItemAloud extends Action2 {
  constructor() {
    super({
      id: _StopReadChatItemAloud.ID,
      icon: Codicon.mute,
      title: localize2("workbench.action.chat.stopReadChatItemAloud", "Stop Reading Aloud"),
      precondition: ScopedChatSynthesisInProgress,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 100,
        primary: KeyCode.Escape
      },
      menu: [
        {
          id: MenuId.ChatMessageFooter,
          when: ContextKeyExpr.and(
            ScopedChatSynthesisInProgress,
            // only when in progress
            ChatContextKeys.isResponse,
            // only for responses
            ChatContextKeys.responseIsFiltered.negate()
            // but not when response is filtered
          ),
          group: "navigation",
          order: -10
          // first
        },
        {
          id: MENU_INLINE_CHAT_WIDGET_SECONDARY,
          when: ContextKeyExpr.and(
            ScopedChatSynthesisInProgress,
            // only when in progress
            ChatContextKeys.isResponse,
            // only for responses
            ChatContextKeys.responseIsFiltered.negate()
            // but not when response is filtered
          ),
          group: "navigation",
          order: -10
          // first
        }
      ]
    });
  }
  async run(accessor, ...args) {
    ChatSynthesizerSessions.getInstance(accessor.get(IInstantiationService)).stop();
  }
};
_StopReadChatItemAloud.ID = "workbench.action.chat.stopReadChatItemAloud";
let StopReadChatItemAloud = _StopReadChatItemAloud;
function supportsKeywordActivation(configurationService, speechService, chatAgentService) {
  if (!speechService.hasSpeechProvider || !chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
    return false;
  }
  const value = configurationService.getValue(KEYWORD_ACTIVIATION_SETTING_ID);
  return typeof value === "string" && value !== KeywordActivationContribution.SETTINGS_VALUE.OFF;
}
let KeywordActivationContribution = class extends Disposable {
  constructor(speechService, configurationService, commandService, instantiationService, editorService, hostService, chatAgentService) {
    super();
    this.speechService = speechService;
    this.configurationService = configurationService;
    this.commandService = commandService;
    this.editorService = editorService;
    this.hostService = hostService;
    this.chatAgentService = chatAgentService;
    this.activeSession = void 0;
    this._register(instantiationService.createInstance(KeywordActivationStatusEntry));
    this.registerListeners();
  }
  registerListeners() {
    this._register(Event.runAndSubscribe(this.speechService.onDidChangeHasSpeechProvider, () => {
      this.updateConfiguration();
      this.handleKeywordActivation();
    }));
    const onDidAddDefaultAgent = this._register(this.chatAgentService.onDidChangeAgents(() => {
      if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
        this.updateConfiguration();
        this.handleKeywordActivation();
        onDidAddDefaultAgent.dispose();
      }
    }));
    this._register(this.speechService.onDidStartSpeechToTextSession(() => this.handleKeywordActivation()));
    this._register(this.speechService.onDidEndSpeechToTextSession(() => this.handleKeywordActivation()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(KEYWORD_ACTIVIATION_SETTING_ID)) {
        this.handleKeywordActivation();
      }
    }));
  }
  updateConfiguration() {
    if (!this.speechService.hasSpeechProvider || !this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
      return;
    }
    const registry = Registry.as(Extensions.Configuration);
    registry.registerConfiguration({
      ...accessibilityConfigurationNodeBase,
      properties: {
        [KEYWORD_ACTIVIATION_SETTING_ID]: {
          "type": "string",
          "enum": [
            KeywordActivationContribution.SETTINGS_VALUE.OFF,
            KeywordActivationContribution.SETTINGS_VALUE.VIEW_CHAT,
            KeywordActivationContribution.SETTINGS_VALUE.QUICK_CHAT,
            KeywordActivationContribution.SETTINGS_VALUE.INLINE_CHAT,
            KeywordActivationContribution.SETTINGS_VALUE.CHAT_IN_CONTEXT
          ],
          "enumDescriptions": [
            localize("voice.keywordActivation.off", "Keyword activation is disabled."),
            localize("voice.keywordActivation.chatInView", "Keyword activation is enabled and listening for 'Hey Code' to start a voice chat session in the chat view."),
            localize("voice.keywordActivation.quickChat", "Keyword activation is enabled and listening for 'Hey Code' to start a voice chat session in the quick chat."),
            localize("voice.keywordActivation.inlineChat", "Keyword activation is enabled and listening for 'Hey Code' to start a voice chat session in the active editor if possible."),
            localize("voice.keywordActivation.chatInContext", "Keyword activation is enabled and listening for 'Hey Code' to start a voice chat session in the active editor or view depending on keyboard focus.")
          ],
          "description": localize("voice.keywordActivation", "Controls whether the keyword phrase 'Hey Code' is recognized to start a voice chat session. Enabling this will start recording from the microphone but the audio is processed locally and never sent to a server."),
          "default": "off",
          "tags": ["accessibility"]
        }
      }
    });
  }
  handleKeywordActivation() {
    const enabled = supportsKeywordActivation(this.configurationService, this.speechService, this.chatAgentService) && !this.speechService.hasActiveSpeechToTextSession;
    if (enabled && this.activeSession || !enabled && !this.activeSession) {
      return;
    }
    if (enabled) {
      this.enableKeywordActivation();
    } else {
      this.disableKeywordActivation();
    }
  }
  async enableKeywordActivation() {
    const session = this.activeSession = new CancellationTokenSource();
    const result = await this.speechService.recognizeKeyword(session.token);
    if (session.token.isCancellationRequested || session !== this.activeSession) {
      return;
    }
    this.activeSession = void 0;
    if (result === KeywordRecognitionStatus.Recognized) {
      if (this.hostService.hasFocus) {
        this.commandService.executeCommand(this.getKeywordCommand());
      }
      this.handleKeywordActivation();
    }
  }
  getKeywordCommand() {
    const setting = this.configurationService.getValue(KEYWORD_ACTIVIATION_SETTING_ID);
    switch (setting) {
      case KeywordActivationContribution.SETTINGS_VALUE.INLINE_CHAT:
        return InlineVoiceChatAction.ID;
      case KeywordActivationContribution.SETTINGS_VALUE.QUICK_CHAT:
        return QuickVoiceChatAction.ID;
      case KeywordActivationContribution.SETTINGS_VALUE.CHAT_IN_CONTEXT: {
        const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorControl);
        if (activeCodeEditor?.hasWidgetFocus()) {
          return InlineVoiceChatAction.ID;
        }
      }
      default:
        return VoiceChatInChatViewAction.ID;
    }
  }
  disableKeywordActivation() {
    this.activeSession?.dispose(true);
    this.activeSession = void 0;
  }
  dispose() {
    this.activeSession?.dispose();
    super.dispose();
  }
};
KeywordActivationContribution.ID = "workbench.contrib.keywordActivation";
KeywordActivationContribution.SETTINGS_VALUE = {
  OFF: "off",
  INLINE_CHAT: "inlineChat",
  QUICK_CHAT: "quickChat",
  VIEW_CHAT: "chatInView",
  CHAT_IN_CONTEXT: "chatInContext"
};
KeywordActivationContribution = __decorateClass([
  __decorateParam(0, ISpeechService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IHostService),
  __decorateParam(6, IChatAgentService)
], KeywordActivationContribution);
let KeywordActivationStatusEntry = class extends Disposable {
  constructor(speechService, statusbarService, commandService, configurationService, chatAgentService) {
    super();
    this.speechService = speechService;
    this.statusbarService = statusbarService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.chatAgentService = chatAgentService;
    this.entry = this._register(new MutableDisposable());
    this._register(CommandsRegistry.registerCommand(KeywordActivationStatusEntry.STATUS_COMMAND, () => this.commandService.executeCommand("workbench.action.openSettings", KEYWORD_ACTIVIATION_SETTING_ID)));
    this.registerListeners();
    this.updateStatusEntry();
  }
  registerListeners() {
    this._register(this.speechService.onDidStartKeywordRecognition(() => this.updateStatusEntry()));
    this._register(this.speechService.onDidEndKeywordRecognition(() => this.updateStatusEntry()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(KEYWORD_ACTIVIATION_SETTING_ID)) {
        this.updateStatusEntry();
      }
    }));
  }
  updateStatusEntry() {
    const visible = supportsKeywordActivation(this.configurationService, this.speechService, this.chatAgentService);
    if (visible) {
      if (!this.entry.value) {
        this.createStatusEntry();
      }
      this.updateStatusLabel();
    } else {
      this.entry.clear();
    }
  }
  createStatusEntry() {
    this.entry.value = this.statusbarService.addEntry(this.getStatusEntryProperties(), "status.voiceKeywordActivation", StatusbarAlignment.RIGHT, 103);
  }
  getStatusEntryProperties() {
    return {
      name: KeywordActivationStatusEntry.STATUS_NAME,
      text: this.speechService.hasActiveKeywordRecognition ? "$(mic-filled)" : "$(mic)",
      tooltip: this.speechService.hasActiveKeywordRecognition ? KeywordActivationStatusEntry.STATUS_ACTIVE : KeywordActivationStatusEntry.STATUS_INACTIVE,
      ariaLabel: this.speechService.hasActiveKeywordRecognition ? KeywordActivationStatusEntry.STATUS_ACTIVE : KeywordActivationStatusEntry.STATUS_INACTIVE,
      command: KeywordActivationStatusEntry.STATUS_COMMAND,
      kind: "prominent",
      showInAllWindows: true
    };
  }
  updateStatusLabel() {
    this.entry.value?.update(this.getStatusEntryProperties());
  }
};
KeywordActivationStatusEntry.STATUS_NAME = localize("keywordActivation.status.name", "Voice Keyword Activation");
KeywordActivationStatusEntry.STATUS_COMMAND = "keywordActivation.status.command";
KeywordActivationStatusEntry.STATUS_ACTIVE = localize("keywordActivation.status.active", "Listening to 'Hey Code'...");
KeywordActivationStatusEntry.STATUS_INACTIVE = localize("keywordActivation.status.inactive", "Waiting for voice chat to end...");
KeywordActivationStatusEntry = __decorateClass([
  __decorateParam(0, ISpeechService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IChatAgentService)
], KeywordActivationStatusEntry);
registerThemingParticipant((theme, collector) => {
  let activeRecordingColor;
  let activeRecordingDimmedColor;
  if (!isHighContrast(theme.type)) {
    activeRecordingColor = theme.getColor(editorInfoForeground) ?? theme.getColor(focusBorder);
    activeRecordingDimmedColor = activeRecordingColor?.transparent(0.38);
  } else {
    activeRecordingColor = theme.getColor(contrastBorder);
    activeRecordingDimmedColor = theme.getColor(contrastBorder);
  }
  collector.addRule(`
		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled),
		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled) {
			color: ${activeRecordingColor};
			outline: 1px solid ${activeRecordingColor};
			outline-offset: -1px;
			animation: pulseAnimation 1s infinite;
			border-radius: 50%;
		}

		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled)::before,
		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::before {
			position: absolute;
			outline: 1px solid ${activeRecordingColor};
			outline-offset: 2px;
			border-radius: 50%;
			width: 16px;
			height: 16px;
		}

		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-sync.codicon-modifier-spin:not(.disabled)::after,
		.monaco-workbench.monaco-enable-motion .interactive-input-part .monaco-action-bar .action-label.codicon-loading.codicon-modifier-spin:not(.disabled)::after {
			outline: 2px solid ${activeRecordingColor};
			outline-offset: -1px;
			animation: pulseAnimation 1500ms cubic-bezier(0.75, 0, 0.25, 1) infinite;
		}

		@keyframes pulseAnimation {
			0% {
				outline-width: 2px;
			}
			62% {
				outline-width: 5px;
				outline-color: ${activeRecordingDimmedColor};
			}
			100% {
				outline-width: 2px;
			}
		}
	`);
});
export {
  HoldToVoiceChatInChatViewAction,
  InlineVoiceChatAction,
  KeywordActivationContribution,
  QuickVoiceChatAction,
  ReadChatResponseAloud,
  StartVoiceChatAction,
  StopListeningAction,
  StopListeningAndSubmitAction,
  StopReadAloud,
  StopReadChatItemAloud,
  VOICE_KEY_HOLD_THRESHOLD,
  VoiceChatInChatViewAction,
  parseNextChatResponseChunk
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXGFjdGlvbnNcXHZvaWNlQ2hhdEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIsIGRpc3Bvc2FibGVUaW1lb3V0LCByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTnVtYmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyLCBmb2N1c0JvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGVkaXRvckluZm9Gb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9lZGl0b3JDb2xvcnMuanMnO1xuaW1wb3J0IHsgc3Bpbm5pbmdMb2FkaW5nLCBzeW5jaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc0hpZ2hDb250cmFzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyRW50cnksIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWb2ljZVNldHRpbmdJZCwgU3BlZWNoVGltZW91dERlZmF1bHQsIGFjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uTm9kZUJhc2UgfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSW5saW5lQ2hhdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQ1RYX0lOTElORV9DSEFUX0ZPQ1VTRUQsIE1FTlVfSU5MSU5FX0NIQVRfV0lER0VUX1NFQ09OREFSWSB9IGZyb20gJy4uLy4uLy4uL2lubGluZUNoYXQvY29tbW9uL2lubGluZUNoYXQuanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX1NFVFRJTkdTX0VESVRPUiB9IGZyb20gJy4uLy4uLy4uL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VhcmNoL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgVGV4dFRvU3BlZWNoSW5Qcm9ncmVzcyBhcyBHbG9iYWxUZXh0VG9TcGVlY2hJblByb2dyZXNzLCBIYXNTcGVlY2hQcm92aWRlciwgSVNwZWVjaFNlcnZpY2UsIEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cywgU3BlZWNoVG9UZXh0SW5Qcm9ncmVzcywgU3BlZWNoVG9UZXh0U3RhdHVzLCBUZXh0VG9TcGVlY2hTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zcGVlY2gvY29tbW9uL3NwZWVjaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hY3Rpb25zL2NoYXRFeGVjdXRlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlLCBJUXVpY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBTZWdtZW50ZWRWb2ljZUlucHV0TW9kZVBpbGxJbmFjdGl2ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdm9pY2VJbnB1dE1vZGUvdm9pY2VJbnB1dE1vZGVDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBLRVlXT1JEX0FDVElWSUFUSU9OX1NFVFRJTkdfSUQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgVm9pY2VDaGF0SW5Qcm9ncmVzcyBhcyBHbG9iYWxWb2ljZUNoYXRJblByb2dyZXNzLCBJVm9pY2VDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi92b2ljZUNoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi9tZWRpYS92b2ljZUNoYXRBY3Rpb25zLmNzcyc7XG5cbi8vI3JlZ2lvbiBTcGVlY2ggdG8gVGV4dFxuXG50eXBlIFZvaWNlQ2hhdFNlc3Npb25Db250ZXh0ID0gJ3ZpZXcnIHwgJ2lubGluZScgfCAncXVpY2snIHwgJ2VkaXRvcic7XG5jb25zdCBWb2ljZUNoYXRTZXNzaW9uQ29udGV4dHM6IFZvaWNlQ2hhdFNlc3Npb25Db250ZXh0W10gPSBbJ3ZpZXcnLCAnaW5saW5lJywgJ3F1aWNrJywgJ2VkaXRvciddO1xuXG4vLyBHbG9iYWwgQ29udGV4dCBLZXlzIChzZXQgb24gZ2xvYmFsIGNvbnRleHQga2V5IHNlcnZpY2UpXG5jb25zdCBDYW5Wb2ljZUNoYXQgPSBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIEhhc1NwZWVjaFByb3ZpZGVyKTtcbmNvbnN0IEZvY3VzSW5DaGF0SW5wdXQgPSBDb250ZXh0S2V5RXhwci5vcihDVFhfSU5MSU5FX0NIQVRfRk9DVVNFRCwgQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0KTtcblxuLy8gU2NvcGVkIENvbnRleHQgS2V5cyAoc2V0IG9uIHBlci1jaGF0LWNvbnRleHQgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UpXG5jb25zdCBTY29wZWRWb2ljZUNoYXRHZXR0aW5nUmVhZHkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2NvcGVkVm9pY2VDaGF0R2V0dGluZ1JlYWR5JywgZmFsc2UsIHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Njb3BlZFZvaWNlQ2hhdEdldHRpbmdSZWFkeScsIFwiVHJ1ZSB3aGVuIGdldHRpbmcgcmVhZHkgZm9yIHJlY2VpdmluZyB2b2ljZSBpbnB1dCBmcm9tIHRoZSBtaWNyb3Bob25lIGZvciB2b2ljZSBjaGF0LiBUaGlzIGtleSBpcyBvbmx5IGRlZmluZWQgc2NvcGVkLCBwZXIgY2hhdCBjb250ZXh0LlwiKSB9KTtcbmNvbnN0IFNjb3BlZFZvaWNlQ2hhdEluUHJvZ3Jlc3MgPSBuZXcgUmF3Q29udGV4dEtleTxWb2ljZUNoYXRTZXNzaW9uQ29udGV4dCB8IHVuZGVmaW5lZD4oJ3Njb3BlZFZvaWNlQ2hhdEluUHJvZ3Jlc3MnLCB1bmRlZmluZWQsIHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NvcGVkVm9pY2VDaGF0SW5Qcm9ncmVzcycsIFwiRGVmaW5lZCBhcyBhIGxvY2F0aW9uIHdoZXJlIHZvaWNlIHJlY29yZGluZyBmcm9tIG1pY3JvcGhvbmUgaXMgaW4gcHJvZ3Jlc3MgZm9yIHZvaWNlIGNoYXQuIFRoaXMga2V5IGlzIG9ubHkgZGVmaW5lZCBzY29wZWQsIHBlciBjaGF0IGNvbnRleHQuXCIpIH0pO1xuY29uc3QgQW55U2NvcGVkVm9pY2VDaGF0SW5Qcm9ncmVzcyA9IENvbnRleHRLZXlFeHByLm9yKC4uLlZvaWNlQ2hhdFNlc3Npb25Db250ZXh0cy5tYXAoY29udGV4dCA9PiBTY29wZWRWb2ljZUNoYXRJblByb2dyZXNzLmlzRXF1YWxUbyhjb250ZXh0KSkpO1xuXG5lbnVtIFZvaWNlQ2hhdFNlc3Npb25TdGF0ZSB7XG5cdFN0b3BwZWQgPSAxLFxuXHRHZXR0aW5nUmVhZHksXG5cdFN0YXJ0ZWRcbn1cblxuaW50ZXJmYWNlIElWb2ljZUNoYXRTZXNzaW9uQ29udHJvbGxlciB7XG5cblx0cmVhZG9ubHkgb25EaWRBY2NlcHRJbnB1dDogRXZlbnQ8dW5rbm93bj47XG5cdHJlYWRvbmx5IG9uRGlkSGlkZUlucHV0OiBFdmVudDx1bmtub3duPjtcblxuXHRyZWFkb25seSBjb250ZXh0OiBWb2ljZUNoYXRTZXNzaW9uQ29udGV4dDtcblx0cmVhZG9ubHkgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblxuXHR1cGRhdGVTdGF0ZShzdGF0ZTogVm9pY2VDaGF0U2Vzc2lvblN0YXRlKTogdm9pZDtcblxuXHRmb2N1c0lucHV0KCk6IHZvaWQ7XG5cdGFjY2VwdElucHV0KCk6IFByb21pc2U8SUNoYXRSZXNwb25zZU1vZGVsIHwgdW5kZWZpbmVkPjtcblx0dXBkYXRlSW5wdXQodGV4dDogc3RyaW5nKTogdm9pZDtcblx0Z2V0SW5wdXQoKTogc3RyaW5nO1xuXG5cdHNldElucHV0UGxhY2Vob2xkZXIodGV4dDogc3RyaW5nKTogdm9pZDtcblx0Y2xlYXJJbnB1dFBsYWNlaG9sZGVyKCk6IHZvaWQ7XG59XG5cbmNsYXNzIFZvaWNlQ2hhdFNlc3Npb25Db250cm9sbGVyRmFjdG9yeSB7XG5cblx0c3RhdGljIGFzeW5jIGNyZWF0ZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogJ3ZpZXcnIHwgJ2lubGluZScgfCAncXVpY2snIHwgJ2ZvY3VzZWQnKTogUHJvbWlzZTxJVm9pY2VDaGF0U2Vzc2lvbkNvbnRyb2xsZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrQ2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0c3dpdGNoIChjb250ZXh0KSB7XG5cdFx0XHRjYXNlICdmb2N1c2VkJzoge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gVm9pY2VDaGF0U2Vzc2lvbkNvbnRyb2xsZXJGYWN0b3J5LmRvQ3JlYXRlRm9yRm9jdXNlZENoYXQoY2hhdFdpZGdldFNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXHRcdFx0XHRyZXR1cm4gY29udHJvbGxlciA/PyBWb2ljZUNoYXRTZXNzaW9uQ29udHJvbGxlckZhY3RvcnkuY3JlYXRlKGFjY2Vzc29yLCAndmlldycpOyAvLyBmYWxsYmFjayB0byAndmlldydcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3ZpZXcnOiB7XG5cdFx0XHRcdGNvbnN0IGNoYXRXaWRnZXQgPSBhd2FpdCBjaGF0V2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTtcblx0XHRcdFx0aWYgKGNoYXRXaWRnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm4gVm9pY2VDaGF0U2Vzc2lvbkNvbnRyb2xsZXJGYWN0b3J5LmRvQ3JlYXRlRm9yQ2hhdFdpZGdldCgndmlldycsIGNoYXRXaWRnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaW5saW5lJzoge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVDb2RlRWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRcdFx0aWYgKGFjdGl2ZUNvZGVFZGl0b3IpIHtcblx0XHRcdFx0XHRjb25zdCBpbmxpbmVDaGF0ID0gSW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUNvZGVFZGl0b3IpO1xuXHRcdFx0XHRcdGlmIChpbmxpbmVDaGF0KSB7XG5cdFx0XHRcdFx0XHRpZiAoIWlubGluZUNoYXQuaXNBY3RpdmUpIHtcblx0XHRcdFx0XHRcdFx0aW5saW5lQ2hhdC5ydW4oKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBWb2ljZUNoYXRTZXNzaW9uQ29udHJvbGxlckZhY3RvcnkuZG9DcmVhdGVGb3JDaGF0V2lkZ2V0KCdpbmxpbmUnLCBpbmxpbmVDaGF0LndpZGdldC5jaGF0V2lkZ2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdxdWljayc6IHtcblx0XHRcdFx0cXVpY2tDaGF0U2VydmljZS5vcGVuKCk7IC8vIHRoaXMgd2lsbCBwb3B1bGF0ZSBmb2N1c2VkIGNoYXQgd2lkZ2V0IGluIHRoZSBjaGF0IHdpZGdldCBzZXJ2aWNlXG5cdFx0XHRcdHJldHVybiBWb2ljZUNoYXRTZXNzaW9uQ29udHJvbGxlckZhY3RvcnkuY3JlYXRlKGFjY2Vzc29yLCAnZm9jdXNlZCcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBkb0NyZWF0ZUZvckZvY3VzZWRDaGF0KGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTogSVZvaWNlQ2hhdFNlc3Npb25Db250cm9sbGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjaGF0V2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKGNoYXRXaWRnZXQ/Lmhhc0lucHV0Rm9jdXMoKSkge1xuXG5cdFx0XHQvLyBGaWd1cmUgb3V0IHRoZSBjb250ZXh0IG9mIHRoZSBjaGF0IHdpZGdldCBieSBhc2tpbmdcblx0XHRcdC8vIGxheW91dCBzZXJ2aWNlIGZvciB0aGUgcGFydCB0aGF0IGhhcyBmb2N1cy4gVW5mb3J0dW5hdGVseVxuXHRcdFx0Ly8gdGhlcmUgaXMgbm8gYmV0dGVyIHdheSBiZWNhdXNlIHRoZSB3aWRnZXQgZG9lcyBub3Qga25vd1xuXHRcdFx0Ly8gaXRzIGxvY2F0aW9uLlxuXG5cdFx0XHRsZXQgY29udGV4dDogVm9pY2VDaGF0U2Vzc2lvbkNvbnRleHQ7XG5cdFx0XHRpZiAobGF5b3V0U2VydmljZS5oYXNGb2N1cyhQYXJ0cy5FRElUT1JfUEFSVCkpIHtcblx0XHRcdFx0Y29udGV4dCA9IGNoYXRXaWRnZXQubG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQgPyAnZWRpdG9yJyA6ICdpbmxpbmUnO1xuXHRcdFx0fSBlbHNlIGlmIChcblx0XHRcdFx0W1BhcnRzLlNJREVCQVJfUEFSVCwgUGFydHMuUEFORUxfUEFSVCwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIFBhcnRzLlRJVExFQkFSX1BBUlQsIFBhcnRzLlNUQVRVU0JBUl9QQVJULCBQYXJ0cy5CQU5ORVJfUEFSVCwgUGFydHMuQUNUSVZJVFlCQVJfUEFSVF0uc29tZShwYXJ0ID0+IGxheW91dFNlcnZpY2UuaGFzRm9jdXMocGFydCkpXG5cdFx0XHQpIHtcblx0XHRcdFx0Y29udGV4dCA9ICd2aWV3Jztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRleHQgPSAncXVpY2snO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gVm9pY2VDaGF0U2Vzc2lvbkNvbnRyb2xsZXJGYWN0b3J5LmRvQ3JlYXRlRm9yQ2hhdFdpZGdldChjb250ZXh0LCBjaGF0V2lkZ2V0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgY3JlYXRlQ2hhdENvbnRleHRLZXlDb250cm9sbGVyKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHQ6IFZvaWNlQ2hhdFNlc3Npb25Db250ZXh0KTogKHN0YXRlOiBWb2ljZUNoYXRTZXNzaW9uU3RhdGUpID0+IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRleHRWb2ljZUNoYXRHZXR0aW5nUmVhZHkgPSBTY29wZWRWb2ljZUNoYXRHZXR0aW5nUmVhZHkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0Vm9pY2VDaGF0SW5Qcm9ncmVzcyA9IFNjb3BlZFZvaWNlQ2hhdEluUHJvZ3Jlc3MuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHJldHVybiAoc3RhdGU6IFZvaWNlQ2hhdFNlc3Npb25TdGF0ZSkgPT4ge1xuXHRcdFx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdFx0XHRjYXNlIFZvaWNlQ2hhdFNlc3Npb25TdGF0ZS5HZXR0aW5nUmVhZHk6XG5cdFx0XHRcdFx0Y29udGV4dFZvaWNlQ2hhdEdldHRpbmdSZWFkeS5zZXQodHJ1ZSk7XG5cdFx0XHRcdFx0Y29udGV4dFZvaWNlQ2hhdEluUHJvZ3Jlc3MucmVzZXQoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBWb2ljZUNoYXRTZXNzaW9uU3RhdGUuU3RhcnRlZDpcblx0XHRcdFx0XHRjb250ZXh0Vm9pY2VDaGF0R2V0dGluZ1JlYWR5LnJlc2V0KCk7XG5cdFx0XHRcdFx0Y29udGV4dFZvaWNlQ2hhdEluUHJvZ3Jlc3Muc2V0KGNvbnRleHQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFZvaWNlQ2hhdFNlc3Npb25TdGF0ZS5TdG9wcGVkOlxuXHRcdFx0XHRcdGNvbnRleHRWb2ljZUNoYXRHZXR0aW5nUmVhZHkucmVzZXQoKTtcblx0XHRcdFx0XHRjb250ZXh0Vm9pY2VDaGF0SW5Qcm9ncmVzcy5yZXNldCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBkb0NyZWF0ZUZvckNoYXRXaWRnZXQoY29udGV4dDogVm9pY2VDaGF0U2Vzc2lvbkNvbnRleHQsIGNoYXRXaWRnZXQ6IElDaGF0V2lkZ2V0KTogSVZvaWNlQ2hhdFNlc3Npb25Db250cm9sbGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGV4dCxcblx0XHRcdHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBjaGF0V2lkZ2V0LnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0b25EaWRBY2NlcHRJbnB1dDogY2hhdFdpZGdldC5vbkRpZEFjY2VwdElucHV0LFxuXHRcdFx0b25EaWRIaWRlSW5wdXQ6IGNoYXRXaWRnZXQub25EaWRIaWRlLFxuXHRcdFx0Zm9jdXNJbnB1dDogKCkgPT4gY2hhdFdpZGdldC5mb2N1c0lucHV0KCksXG5cdFx0XHRhY2NlcHRJbnB1dDogKCkgPT4gY2hhdFdpZGdldC5hY2NlcHRJbnB1dCh1bmRlZmluZWQsIHsgaXNWb2ljZUlucHV0OiB0cnVlIH0pLFxuXHRcdFx0dXBkYXRlSW5wdXQ6IHRleHQgPT4gY2hhdFdpZGdldC5zZXRJbnB1dCh0ZXh0KSxcblx0XHRcdGdldElucHV0OiAoKSA9PiBjaGF0V2lkZ2V0LmdldElucHV0KCksXG5cdFx0XHRzZXRJbnB1dFBsYWNlaG9sZGVyOiB0ZXh0ID0+IGNoYXRXaWRnZXQuc2V0SW5wdXRQbGFjZWhvbGRlcih0ZXh0KSxcblx0XHRcdGNsZWFySW5wdXRQbGFjZWhvbGRlcjogKCkgPT4gY2hhdFdpZGdldC5yZXNldElucHV0UGxhY2Vob2xkZXIoKSxcblx0XHRcdHVwZGF0ZVN0YXRlOiBWb2ljZUNoYXRTZXNzaW9uQ29udHJvbGxlckZhY3RvcnkuY3JlYXRlQ2hhdENvbnRleHRLZXlDb250cm9sbGVyKGNoYXRXaWRnZXQuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHQpXG5cdFx0fTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVZvaWNlQ2hhdFNlc3Npb24ge1xuXHRzZXRUaW1lb3V0RGlzYWJsZWQoZGlzYWJsZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXG5cdGFjY2VwdCgpOiB2b2lkO1xuXHRzdG9wKCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJQWN0aXZlVm9pY2VDaGF0U2Vzc2lvbiBleHRlbmRzIElWb2ljZUNoYXRTZXNzaW9uIHtcblx0cmVhZG9ubHkgaWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY29udHJvbGxlcjogSVZvaWNlQ2hhdFNlc3Npb25Db250cm9sbGVyO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdGhhc1JlY29nbml6ZWRJbnB1dDogYm9vbGVhbjtcbn1cblxuY2xhc3MgVm9pY2VDaGF0U2Vzc2lvbnMge1xuXG5cdHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBWb2ljZUNoYXRTZXNzaW9ucyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0c3RhdGljIGdldEluc3RhbmNlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBWb2ljZUNoYXRTZXNzaW9ucyB7XG5cdFx0aWYgKCFWb2ljZUNoYXRTZXNzaW9ucy5pbnN0YW5jZSkge1xuXHRcdFx0Vm9pY2VDaGF0U2Vzc2lvbnMuaW5zdGFuY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZUNoYXRTZXNzaW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFZvaWNlQ2hhdFNlc3Npb25zLmluc3RhbmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBjdXJyZW50Vm9pY2VDaGF0U2Vzc2lvbjogSUFjdGl2ZVZvaWNlQ2hhdFNlc3Npb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdm9pY2VDaGF0U2Vzc2lvbklkcyA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElWb2ljZUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdm9pY2VDaGF0U2VydmljZTogSVZvaWNlQ2hhdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBzdGFydChjb250cm9sbGVyOiBJVm9pY2VDaGF0U2Vzc2lvbkNvbnRyb2xsZXIsIGNvbnRleHQ/OiBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0KTogUHJvbWlzZTxJVm9pY2VDaGF0U2Vzc2lvbj4ge1xuXG5cdFx0Ly8gU3RvcCBydW5uaW5nIHRleHQtdG8tc3BlZWNoIG9yIHNwZWVjaC10by10ZXh0IHNlc3Npb25zIGluIGNoYXRzXG5cdFx0dGhpcy5zdG9wKCk7XG5cdFx0Q2hhdFN5bnRoZXNpemVyU2Vzc2lvbnMuZ2V0SW5zdGFuY2UodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkuc3RvcCgpO1xuXG5cdFx0bGV0IGRpc2FibGVUaW1lb3V0ID0gZmFsc2U7XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSArK3RoaXMudm9pY2VDaGF0U2Vzc2lvbklkcztcblx0XHRjb25zdCBzZXNzaW9uOiBJQWN0aXZlVm9pY2VDaGF0U2Vzc2lvbiA9IHRoaXMuY3VycmVudFZvaWNlQ2hhdFNlc3Npb24gPSB7XG5cdFx0XHRpZDogc2Vzc2lvbklkLFxuXHRcdFx0Y29udHJvbGxlcixcblx0XHRcdGhhc1JlY29nbml6ZWRJbnB1dDogZmFsc2UsXG5cdFx0XHRkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLFxuXHRcdFx0c2V0VGltZW91dERpc2FibGVkOiAoZGlzYWJsZWQ6IGJvb2xlYW4pID0+IHsgZGlzYWJsZVRpbWVvdXQgPSBkaXNhYmxlZDsgfSxcblx0XHRcdGFjY2VwdDogKCkgPT4gdGhpcy5hY2NlcHQoc2Vzc2lvbklkKSxcblx0XHRcdHN0b3A6ICgpID0+IHRoaXMuc3RvcChzZXNzaW9uSWQsIGNvbnRyb2xsZXIuY29udGV4dClcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRzZXNzaW9uLmRpc3Bvc2FibGVzLmFkZChjb250cm9sbGVyLm9uRGlkQWNjZXB0SW5wdXQoKCkgPT4gdGhpcy5zdG9wKHNlc3Npb25JZCwgY29udHJvbGxlci5jb250ZXh0KSkpO1xuXHRcdHNlc3Npb24uZGlzcG9zYWJsZXMuYWRkKGNvbnRyb2xsZXIub25EaWRIaWRlSW5wdXQoKCkgPT4gdGhpcy5zdG9wKHNlc3Npb25JZCwgY29udHJvbGxlci5jb250ZXh0KSkpO1xuXG5cdFx0Y29udHJvbGxlci5mb2N1c0lucHV0KCk7XG5cblx0XHRjb250cm9sbGVyLnVwZGF0ZVN0YXRlKFZvaWNlQ2hhdFNlc3Npb25TdGF0ZS5HZXR0aW5nUmVhZHkpO1xuXG5cdFx0Y29uc3Qgdm9pY2VDaGF0U2Vzc2lvbiA9IGF3YWl0IHRoaXMudm9pY2VDaGF0U2VydmljZS5jcmVhdGVWb2ljZUNoYXRTZXNzaW9uKGN0cy50b2tlbiwgeyB1c2VzQWdlbnRzOiBjb250cm9sbGVyLmNvbnRleHQgIT09ICdpbmxpbmUnLCBtb2RlbDogY29udGV4dD8ud2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsIH0pO1xuXG5cdFx0bGV0IGlucHV0VmFsdWUgPSBjb250cm9sbGVyLmdldElucHV0KCk7XG5cblx0XHRsZXQgdm9pY2VDaGF0VGltZW91dCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQuU3BlZWNoVGltZW91dCk7XG5cdFx0aWYgKCFpc051bWJlcih2b2ljZUNoYXRUaW1lb3V0KSB8fCB2b2ljZUNoYXRUaW1lb3V0IDwgMCkge1xuXHRcdFx0dm9pY2VDaGF0VGltZW91dCA9IFNwZWVjaFRpbWVvdXREZWZhdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjY2VwdFRyYW5zY3JpcHRpb25TY2hlZHVsZXIgPSBzZXNzaW9uLmRpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmFjY2VwdChzZXNzaW9uSWQpLCB2b2ljZUNoYXRUaW1lb3V0KSk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NhYmxlcy5hZGQodm9pY2VDaGF0U2Vzc2lvbi5vbkRpZENoYW5nZSgoeyBzdGF0dXMsIHRleHQsIHdhaXRpbmdGb3JJbnB1dCB9KSA9PiB7XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuU3RhcnRlZDpcblx0XHRcdFx0XHR0aGlzLm9uRGlkU3BlZWNoVG9UZXh0U2Vzc2lvblN0YXJ0KGNvbnRyb2xsZXIsIHNlc3Npb24uZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZzpcblx0XHRcdFx0XHRpZiAodGV4dCkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvbi5oYXNSZWNvZ25pemVkSW5wdXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0c2Vzc2lvbi5jb250cm9sbGVyLnVwZGF0ZUlucHV0KGlucHV0VmFsdWUgPyBbaW5wdXRWYWx1ZSwgdGV4dF0uam9pbignICcpIDogdGV4dCk7XG5cdFx0XHRcdFx0XHRpZiAodm9pY2VDaGF0VGltZW91dCA+IDAgJiYgY29udGV4dD8udm9pY2U/LmRpc2FibGVUaW1lb3V0ICE9PSB0cnVlICYmICFkaXNhYmxlVGltZW91dCkge1xuXHRcdFx0XHRcdFx0XHRhY2NlcHRUcmFuc2NyaXB0aW9uU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZDpcblx0XHRcdFx0XHRpZiAodGV4dCkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvbi5oYXNSZWNvZ25pemVkSW5wdXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aW5wdXRWYWx1ZSA9IGlucHV0VmFsdWUgPyBbaW5wdXRWYWx1ZSwgdGV4dF0uam9pbignICcpIDogdGV4dDtcblx0XHRcdFx0XHRcdHNlc3Npb24uY29udHJvbGxlci51cGRhdGVJbnB1dChpbnB1dFZhbHVlKTtcblx0XHRcdFx0XHRcdGlmICh2b2ljZUNoYXRUaW1lb3V0ID4gMCAmJiBjb250ZXh0Py52b2ljZT8uZGlzYWJsZVRpbWVvdXQgIT09IHRydWUgJiYgIXdhaXRpbmdGb3JJbnB1dCAmJiAhZGlzYWJsZVRpbWVvdXQpIHtcblx0XHRcdFx0XHRcdFx0YWNjZXB0VHJhbnNjcmlwdGlvblNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuU3RvcHBlZDpcblx0XHRcdFx0XHR0aGlzLnN0b3Aoc2Vzc2lvbi5pZCwgY29udHJvbGxlci5jb250ZXh0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRTcGVlY2hUb1RleHRTZXNzaW9uU3RhcnQoY29udHJvbGxlcjogSVZvaWNlQ2hhdFNlc3Npb25Db250cm9sbGVyLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0Y29udHJvbGxlci51cGRhdGVTdGF0ZShWb2ljZUNoYXRTZXNzaW9uU3RhdGUuU3RhcnRlZCk7XG5cblx0XHRsZXQgZG90Q291bnQgPSAwO1xuXG5cdFx0Y29uc3QgdXBkYXRlUGxhY2Vob2xkZXIgPSAoKSA9PiB7XG5cdFx0XHRkb3RDb3VudCA9IChkb3RDb3VudCArIDEpICUgNDtcblx0XHRcdGNvbnRyb2xsZXIuc2V0SW5wdXRQbGFjZWhvbGRlcihgJHtsb2NhbGl6ZSgnbGlzdGVuaW5nJywgXCJJJ20gbGlzdGVuaW5nXCIpfSR7Jy4nLnJlcGVhdChkb3RDb3VudCl9YCk7XG5cdFx0XHRwbGFjZWhvbGRlclNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH07XG5cblx0XHRjb25zdCBwbGFjZWhvbGRlclNjaGVkdWxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcih1cGRhdGVQbGFjZWhvbGRlciwgNTAwKSk7XG5cdFx0dXBkYXRlUGxhY2Vob2xkZXIoKTtcblx0fVxuXG5cdHN0b3Aodm9pY2VDaGF0U2Vzc2lvbklkID0gdGhpcy52b2ljZUNoYXRTZXNzaW9uSWRzLCBjb250ZXh0PzogVm9pY2VDaGF0U2Vzc2lvbkNvbnRleHQpOiB2b2lkIHtcblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5jdXJyZW50Vm9pY2VDaGF0U2Vzc2lvbiB8fFxuXHRcdFx0dGhpcy52b2ljZUNoYXRTZXNzaW9uSWRzICE9PSB2b2ljZUNoYXRTZXNzaW9uSWQgfHxcblx0XHRcdChjb250ZXh0ICYmIHRoaXMuY3VycmVudFZvaWNlQ2hhdFNlc3Npb24uY29udHJvbGxlci5jb250ZXh0ICE9PSBjb250ZXh0KVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudFZvaWNlQ2hhdFNlc3Npb24uY29udHJvbGxlci5jbGVhcklucHV0UGxhY2Vob2xkZXIoKTtcblxuXHRcdHRoaXMuY3VycmVudFZvaWNlQ2hhdFNlc3Npb24uY29udHJvbGxlci51cGRhdGVTdGF0ZShWb2ljZUNoYXRTZXNzaW9uU3RhdGUuU3RvcHBlZCk7XG5cblx0XHR0aGlzLmN1cnJlbnRWb2ljZUNoYXRTZXNzaW9uLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmN1cnJlbnRWb2ljZUNoYXRTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgYWNjZXB0KHZvaWNlQ2hhdFNlc3Npb25JZCA9IHRoaXMudm9pY2VDaGF0U2Vzc2lvbklkcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChcblx0XHRcdCF0aGlzLmN1cnJlbnRWb2ljZUNoYXRTZXNzaW9uIHx8XG5cdFx0XHR0aGlzLnZvaWNlQ2hhdFNlc3Npb25JZHMgIT09IHZvaWNlQ2hhdFNlc3Npb25JZFxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jdXJyZW50Vm9pY2VDaGF0U2Vzc2lvbi5oYXNSZWNvZ25pemVkSW5wdXQpIHtcblx0XHRcdC8vIElmIHdlIGhhdmUgYW4gYWN0aXZlIHNlc3Npb24gYnV0IHdpdGhvdXQgcmVjb2duaXplZFxuXHRcdFx0Ly8gaW5wdXQsIHdlIGRvIG5vdCB3YW50IHRvIGp1c3QgYWNjZXB0IHRoZSBpbnB1dCB0aGF0XG5cdFx0XHQvLyB3YXMgbWF5YmUgdHlwZWQgYmVmb3JlLiBCdXQgd2Ugc3RpbGwgd2FudCB0byBzdG9wIHRoZVxuXHRcdFx0Ly8gdm9pY2Ugc2Vzc2lvbiBiZWNhdXNlIGBhY2NlcHRJbnB1dGAgd291bGQgZG8gdGhhdC5cblx0XHRcdHRoaXMuc3RvcCh2b2ljZUNoYXRTZXNzaW9uSWQsIHRoaXMuY3VycmVudFZvaWNlQ2hhdFNlc3Npb24uY29udHJvbGxlci5jb250ZXh0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5jdXJyZW50Vm9pY2VDaGF0U2Vzc2lvbi5jb250cm9sbGVyO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY29udHJvbGxlci5hY2NlcHRJbnB1dCgpO1xuXHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXV0b1N5bnRoZXNpemUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdvbicgfCAnb2ZmJz4oQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkLkF1dG9TeW50aGVzaXplKTtcblx0XHRpZiAoYXV0b1N5bnRoZXNpemUgPT09ICdvbicgfHwgKGF1dG9TeW50aGVzaXplICE9PSAnb2ZmJyAmJiAhdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSkge1xuXHRcdFx0bGV0IGNvbnRleHQ6IElWb2ljZUNoYXRTZXNzaW9uQ29udHJvbGxlciB8ICdmb2N1c2VkJztcblx0XHRcdGlmIChjb250cm9sbGVyLmNvbnRleHQgPT09ICdpbmxpbmUnKSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgdWdseSwgYnV0IHRoZSBsaWdodHdlaWdodCBpbmxpbmUgY2hhdCB0dXJucyBpbnRvXG5cdFx0XHRcdC8vIGEgZGlmZmVyZW50IHdpZGdldCBhcyBzb29uIGFzIGEgcmVzcG9uc2UgY29tZXMgaW4sIHNvIHdlIGZhbGxiYWNrIHRvXG5cdFx0XHRcdC8vIHBpY2tpbmcgdXAgZnJvbSB0aGUgZm9jdXNlZCBjaGF0IHdpZGdldFxuXHRcdFx0XHRjb250ZXh0ID0gJ2ZvY3VzZWQnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGV4dCA9IGNvbnRyb2xsZXI7XG5cdFx0XHR9XG5cdFx0XHRDaGF0U3ludGhlc2l6ZXJTZXNzaW9ucy5nZXRJbnN0YW5jZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKS5zdGFydCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IENoYXRTeW50aGVzaXplclNlc3Npb25Db250cm9sbGVyLmNyZWF0ZShhY2Nlc3NvciwgY29udGV4dCwgcmVzcG9uc2UpKSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBWT0lDRV9LRVlfSE9MRF9USFJFU0hPTEQgPSA1MDA7XG5cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0Vm9pY2VDaGF0V2l0aEhvbGRNb2RlKGlkOiBzdHJpbmcsIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB0YXJnZXQ6ICd2aWV3JyB8ICdpbmxpbmUnIHwgJ3F1aWNrJyB8ICdmb2N1c2VkJywgY29udGV4dD86IElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblxuXHRjb25zdCBob2xkTW9kZSA9IGtleWJpbmRpbmdTZXJ2aWNlLmVuYWJsZUtleWJpbmRpbmdIb2xkTW9kZShpZCk7XG5cblx0Y29uc3QgY29udHJvbGxlciA9IGF3YWl0IFZvaWNlQ2hhdFNlc3Npb25Db250cm9sbGVyRmFjdG9yeS5jcmVhdGUoYWNjZXNzb3IsIHRhcmdldCk7XG5cdGlmICghY29udHJvbGxlcikge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBWb2ljZUNoYXRTZXNzaW9ucy5nZXRJbnN0YW5jZShpbnN0YW50aWF0aW9uU2VydmljZSkuc3RhcnQoY29udHJvbGxlciwgY29udGV4dCk7XG5cblx0bGV0IGFjY2VwdFZvaWNlID0gZmFsc2U7XG5cdGNvbnN0IGhhbmRsZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRhY2NlcHRWb2ljZSA9IHRydWU7XG5cdFx0c2Vzc2lvbj8uc2V0VGltZW91dERpc2FibGVkKHRydWUpOyAvLyBkaXNhYmxlIGFjY2VwdCBvbiB0aW1lb3V0IHdoZW4gaG9sZCBtb2RlIHJ1bnMgZm9yIFZPSUNFX0tFWV9IT0xEX1RIUkVTSE9MRFxuXHR9LCBWT0lDRV9LRVlfSE9MRF9USFJFU0hPTEQpO1xuXHRhd2FpdCBob2xkTW9kZTtcblx0aGFuZGxlLmRpc3Bvc2UoKTtcblxuXHRpZiAoYWNjZXB0Vm9pY2UpIHtcblx0XHRzZXNzaW9uLmFjY2VwdCgpO1xuXHR9XG59XG5cbmNsYXNzIFZvaWNlQ2hhdFdpdGhIb2xkTW9kZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4sIHByaXZhdGUgcmVhZG9ubHkgdGFyZ2V0OiAndmlldycgfCAnaW5saW5lJyB8ICdxdWljaycpIHtcblx0XHRzdXBlcihkZXNjKTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gc3RhcnRWb2ljZUNoYXRXaXRoSG9sZE1vZGUodGhpcy5kZXNjLmlkLCBhY2Nlc3NvciwgdGhpcy50YXJnZXQsIGNvbnRleHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBWb2ljZUNoYXRJbkNoYXRWaWV3QWN0aW9uIGV4dGVuZHMgVm9pY2VDaGF0V2l0aEhvbGRNb2RlQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnZvaWNlQ2hhdEluQ2hhdFZpZXcnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBWb2ljZUNoYXRJbkNoYXRWaWV3QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LnZvaWNlQ2hhdEluVmlldy5sYWJlbCcsIFwiVm9pY2UgQ2hhdCBpbiBDaGF0IFZpZXdcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2FuVm9pY2VDaGF0LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9LCAndmlldycpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBIb2xkVG9Wb2ljZUNoYXRJbkNoYXRWaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5ob2xkVG9Wb2ljZUNoYXRJbkNoYXRWaWV3JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSG9sZFRvVm9pY2VDaGF0SW5DaGF0Vmlld0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5ob2xkVG9Wb2ljZUNoYXRJbkNoYXRWaWV3LmxhYmVsJywgXCJIb2xkIHRvIFZvaWNlIENoYXQgaW4gQ2hhdCBWaWV3XCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENhblZvaWNlQ2hhdCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMucmVxdWVzdEluUHJvZ3Jlc3MubmVnYXRlKCksIFx0Ly8gZGlzYWJsZSB3aGVuIGEgY2hhdCByZXF1ZXN0IGlzIGluIHByb2dyZXNzXG5cdFx0XHRcdFx0Rm9jdXNJbkNoYXRJbnB1dD8ubmVnYXRlKCksXHRcdFx0XHRcdFx0Ly8gd2hlbiBhbHJlYWR5IGluIGNoYXQgaW5wdXQsIGRpc2FibGUgdGhpcyBhY3Rpb24gYW5kIHByZWZlciB0byBzdGFydCB2b2ljZSBjaGF0IGRpcmVjdGx5XG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZm9jdXMubmVnYXRlKCksIFx0XHRcdFx0Ly8gZG8gbm90IHN0ZWFsIHRoZSBpbmxpbmUtY2hhdCBrZXliaW5kaW5nXG5cdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQubmVnYXRlKCksXHRcdFx0XHQvLyBkbyBub3Qgc3RlYWwgdGhlIG5vdGVib29rIGtleWJpbmRpbmdcblx0XHRcdFx0XHRTZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5Lm5lZ2F0ZSgpLFx0Ly8gZG8gbm90IHN0ZWFsIHRoZSBzZWFyY2gga2V5YmluZGluZ1xuXHRcdFx0XHRcdENPTlRFWFRfU0VUVElOR1NfRURJVE9SLm5lZ2F0ZSgpLFx0XHRcdFx0Ly8gZG8gbm90IHN0ZWFsIHRoZSBzZXR0aW5ncyBlZGl0b3Iga2V5YmluZGluZ1xuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gVGhlIGludGVudCBvZiB0aGlzIGFjdGlvbiBpcyB0byBwcm92aWRlIDIgbW9kZXMgdG8gYWxpZ24gd2l0aCB3aGF0IGBDdHJsY21kK0lgIGluIGlubGluZSBjaGF0OlxuXHRcdC8vIC0gaWYgdGhlIHVzZXIgcHJlc3MgYW5kIGhvbGRzLCB3ZSBzdGFydCB2b2ljZSBjaGF0IGluIHRoZSBjaGF0IHZpZXdcblx0XHQvLyAtIGlmIHRoZSB1c2VyIHByZXNzIGFuZCByZWxlYXNlcyBxdWlja2x5IGVub3VnaCwgd2UganVzdCBvcGVuIHRoZSBjaGF0IHZpZXcgd2l0aG91dCB2b2ljZSBjaGF0XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaG9sZE1vZGUgPSBrZXliaW5kaW5nU2VydmljZS5lbmFibGVLZXliaW5kaW5nSG9sZE1vZGUoSG9sZFRvVm9pY2VDaGF0SW5DaGF0Vmlld0FjdGlvbi5JRCk7XG5cblx0XHRsZXQgc2Vzc2lvbjogSVZvaWNlQ2hhdFNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGFuZGxlID0gZGlzcG9zYWJsZVRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGF3YWl0IFZvaWNlQ2hhdFNlc3Npb25Db250cm9sbGVyRmFjdG9yeS5jcmVhdGUoYWNjZXNzb3IsICd2aWV3Jyk7XG5cdFx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0XHRzZXNzaW9uID0gYXdhaXQgVm9pY2VDaGF0U2Vzc2lvbnMuZ2V0SW5zdGFuY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpLnN0YXJ0KGNvbnRyb2xsZXIsIGNvbnRleHQpO1xuXHRcdFx0XHRzZXNzaW9uLnNldFRpbWVvdXREaXNhYmxlZCh0cnVlKTtcblx0XHRcdH1cblx0XHR9LCBWT0lDRV9LRVlfSE9MRF9USFJFU0hPTEQpO1xuXG5cdFx0KGF3YWl0IHdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCkpPy5mb2N1c0lucHV0KCk7XG5cblx0XHRhd2FpdCBob2xkTW9kZTtcblx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24uYWNjZXB0KCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVWb2ljZUNoYXRBY3Rpb24gZXh0ZW5kcyBWb2ljZUNoYXRXaXRoSG9sZE1vZGVBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5saW5lVm9pY2VDaGF0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSW5saW5lVm9pY2VDaGF0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LmlubGluZVZvaWNlQ2hhdCcsIFwiSW5saW5lIFZvaWNlIENoYXRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDYW5Wb2ljZUNoYXQsXG5cdFx0XHRcdEFjdGl2ZUVkaXRvckNvbnRleHQsXG5cdFx0XHQpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9LCAnaW5saW5lJyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrVm9pY2VDaGF0QWN0aW9uIGV4dGVuZHMgVm9pY2VDaGF0V2l0aEhvbGRNb2RlQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnF1aWNrVm9pY2VDaGF0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUXVpY2tWb2ljZUNoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQucXVpY2tWb2ljZUNoYXQubGFiZWwnLCBcIlF1aWNrIFZvaWNlIENoYXRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2FuVm9pY2VDaGF0LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9LCAncXVpY2snKTtcblx0fVxufVxuXG5jb25zdCBwcmltYXJ5Vm9pY2VBY3Rpb25NZW51ID0gKHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCBjaGF0TG9jYXRpb25Pbmx5V2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkKSA9PiB7XG5cdHJldHVybiBbXG5cdFx0e1xuXHRcdFx0aWQ6IE1lbnVJZC5DaGF0RXhlY3V0ZSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLCB3aGVuLCBjaGF0TG9jYXRpb25Pbmx5V2hlbiksXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDNcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBNZW51SWQuQ2hhdEV4ZWN1dGUsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KS5uZWdhdGUoKSwgd2hlbiksXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDJcblx0XHR9XG5cdF07XG59O1xuXG5leHBvcnQgY2xhc3MgU3RhcnRWb2ljZUNoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnN0YXJ0Vm9pY2VDaGF0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU3RhcnRWb2ljZUNoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3RhcnRWb2ljZUNoYXQubGFiZWwnLCBcIlN0YXJ0IFZvaWNlIENoYXRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdEZvY3VzSW5DaGF0SW5wdXQsXHRcdFx0XHRcdC8vIHNjb3BlIHRoaXMgYWN0aW9uIHRvIGNoYXQgaW5wdXQgZmllbGRzIG9ubHlcblx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5mb2N1cy5uZWdhdGUoKSwgXHQvLyBkbyBub3Qgc3RlYWwgdGhlIGVkaXRvciBpbmxpbmUtY2hhdCBrZXliaW5kaW5nXG5cdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQubmVnYXRlKCksXHQvLyBkbyBub3Qgc3RlYWwgdGhlIG5vdGVib29rIGlubGluZS1jaGF0IGtleWJpbmRpbmdcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuc3BlZWNoVG9UZXh0Q29uZmlndXJlZC5uZWdhdGUoKVx0Ly8gYnVpbHQtaW4gb24tZGV2aWNlIGRpY3RhdGlvbiB3aW5zOiB5aWVsZCB0aGUga2V5YmluZGluZyB3aGVuIGl0J3MgYXZhaWxhYmxlIHNvIGl0IGRvZXMgbm90IGNvbGxpZGUgd2l0aCB0aGUgYnVpbHQtaW4gZGljdGF0aW9uIGtleWJpbmRpbmdcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUlcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLm1pYyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDYW5Wb2ljZUNoYXQsXG5cdFx0XHRcdFNjb3BlZFZvaWNlQ2hhdEdldHRpbmdSZWFkeS5uZWdhdGUoKSxcdC8vIGRpc2FibGUgd2hlbiB2b2ljZSBjaGF0IGlzIGdldHRpbmcgcmVhZHlcblx0XHRcdFx0U3BlZWNoVG9UZXh0SW5Qcm9ncmVzcy5uZWdhdGUoKVx0XHRcdC8vIGRpc2FibGUgd2hlbiBzcGVlY2ggdG8gdGV4dCBpcyBpbiBwcm9ncmVzc1xuXHRcdFx0KSxcblx0XHRcdG1lbnU6IHByaW1hcnlWb2ljZUFjdGlvbk1lbnUoQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRIYXNTcGVlY2hQcm92aWRlcixcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnNwZWVjaFRvVGV4dENvbmZpZ3VyZWQubmVnYXRlKCksXHQvLyBidWlsdC1pbiBvbi1kZXZpY2UgZGljdGF0aW9uIHdpbnM6IGhpZGUgdGhlIGV4dGVuc2lvbiBtaWMgd2hlbiBpdCdzIGF2YWlsYWJsZSBzbyBvbmx5IG9uZSBtaWMgc2hvd3Ncblx0XHRcdFx0U2NvcGVkQ2hhdFN5bnRoZXNpc0luUHJvZ3Jlc3MubmVnYXRlKCksXHQvLyBoaWRlIHdoZW4gdGV4dCB0byBzcGVlY2ggaXMgaW4gcHJvZ3Jlc3Ncblx0XHRcdFx0QW55U2NvcGVkVm9pY2VDaGF0SW5Qcm9ncmVzcz8ubmVnYXRlKCksXHQvLyBoaWRlIHdoZW4gdm9pY2UgY2hhdCBpcyBpbiBwcm9ncmVzc1xuXHRcdFx0KSwgU2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsSW5hY3RpdmUpXHQvLyBvbmx5IGhpZGUgaW4gdGhlIG1haW4gQ2hhdCBsb2NhdGlvbiwgd2hlcmUgdGhlIHNlZ21lbnRlZCB0b2dnbGUgcHJvdmlkZXMgYSByZXBsYWNlbWVudDsga2VlcCB0aGUgbWljIGluIGlubGluZS9xdWljayBjaGF0XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY29udGV4dD8ud2lkZ2V0O1xuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdC8vIGlmIHdlIGFscmVhZHkgZ2V0IGEgY29udGV4dCB3aGVuIHRoZSBhY3Rpb24gaXMgZXhlY3V0ZWRcblx0XHRcdC8vIGZyb20gYSB0b29sYmFyIHdpdGhpbiB0aGUgY2hhdCB3aWRnZXQsIHRoZW4gbWFrZSBzdXJlXG5cdFx0XHQvLyB0byBtb3ZlIGZvY3VzIGludG8gdGhlIGlucHV0IGZpZWxkIHNvIHRoYXQgdGhlIGNvbnRyb2xsZXJcblx0XHRcdC8vIGlzIHByb3Blcmx5IHJldHJpZXZlZFxuXHRcdFx0d2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhcnRWb2ljZUNoYXRXaXRoSG9sZE1vZGUodGhpcy5kZXNjLmlkLCBhY2Nlc3NvciwgJ2ZvY3VzZWQnLCBjb250ZXh0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RvcExpc3RlbmluZ0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3RvcExpc3RlbmluZyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFN0b3BMaXN0ZW5pbmdBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3RvcExpc3RlbmluZy5sYWJlbCcsIFwiU3RvcCBMaXN0ZW5pbmdcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwMCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdHdoZW46IEFueVNjb3BlZFZvaWNlQ2hhdEluUHJvZ3Jlc3Ncblx0XHRcdH0sXG5cdFx0XHRpY29uOiBzcGlubmluZ0xvYWRpbmcsXG5cdFx0XHRwcmVjb25kaXRpb246IEdsb2JhbFZvaWNlQ2hhdEluUHJvZ3Jlc3MsIC8vIG5lZWQgZ2xvYmFsIGNvbnRleHQgaGVyZSBiZWNhdXNlIG9mIGBmMTogdHJ1ZWBcblx0XHRcdG1lbnU6IHByaW1hcnlWb2ljZUFjdGlvbk1lbnUoQW55U2NvcGVkVm9pY2VDaGF0SW5Qcm9ncmVzcywgU2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsSW5hY3RpdmUpXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRWb2ljZUNoYXRTZXNzaW9ucy5nZXRJbnN0YW5jZShhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKSkuc3RvcCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdG9wTGlzdGVuaW5nQW5kU3VibWl0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zdG9wTGlzdGVuaW5nQW5kU3VibWl0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU3RvcExpc3RlbmluZ0FuZFN1Ym1pdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zdG9wTGlzdGVuaW5nQW5kU3VibWl0LmxhYmVsJywgXCJTdG9wIExpc3RlbmluZyBhbmQgU3VibWl0XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRGb2N1c0luQ2hhdElucHV0LFxuXHRcdFx0XHRcdEFueVNjb3BlZFZvaWNlQ2hhdEluUHJvZ3Jlc3Ncblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUlcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IEdsb2JhbFZvaWNlQ2hhdEluUHJvZ3Jlc3MgLy8gbmVlZCBnbG9iYWwgY29udGV4dCBoZXJlIGJlY2F1c2Ugb2YgYGYxOiB0cnVlYFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Vm9pY2VDaGF0U2Vzc2lvbnMuZ2V0SW5zdGFuY2UoYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkpLmFjY2VwdCgpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gVGV4dCB0byBTcGVlY2hcblxuY29uc3QgU2NvcGVkQ2hhdFN5bnRoZXNpc0luUHJvZ3Jlc3MgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2NvcGVkQ2hhdFN5bnRoZXNpc0luUHJvZ3Jlc3MnLCBmYWxzZSwgeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NvcGVkQ2hhdFN5bnRoZXNpc0luUHJvZ3Jlc3MnLCBcIkRlZmluZWQgYXMgYSBsb2NhdGlvbiB3aGVyZSB2b2ljZSByZWNvcmRpbmcgZnJvbSBtaWNyb3Bob25lIGlzIGluIHByb2dyZXNzIGZvciB2b2ljZSBjaGF0LiBUaGlzIGtleSBpcyBvbmx5IGRlZmluZWQgc2NvcGVkLCBwZXIgY2hhdCBjb250ZXh0LlwiKSB9KTtcblxuaW50ZXJmYWNlIElDaGF0U3ludGhlc2l6ZXJTZXNzaW9uQ29udHJvbGxlciB7XG5cblx0cmVhZG9ubHkgb25EaWRIaWRlQ2hhdDogRXZlbnQ8dW5rbm93bj47XG5cblx0cmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cmVhZG9ubHkgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbDtcbn1cblxuY2xhc3MgQ2hhdFN5bnRoZXNpemVyU2Vzc2lvbkNvbnRyb2xsZXIge1xuXG5cdHN0YXRpYyBjcmVhdGUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElWb2ljZUNoYXRTZXNzaW9uQ29udHJvbGxlciB8ICdmb2N1c2VkJywgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCk6IElDaGF0U3ludGhlc2l6ZXJTZXNzaW9uQ29udHJvbGxlciB7XG5cdFx0aWYgKGNvbnRleHQgPT09ICdmb2N1c2VkJykge1xuXHRcdFx0cmV0dXJuIENoYXRTeW50aGVzaXplclNlc3Npb25Db250cm9sbGVyLmRvQ3JlYXRlRm9yRm9jdXNlZENoYXQoYWNjZXNzb3IsIHJlc3BvbnNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b25EaWRIaWRlQ2hhdDogY29udGV4dC5vbkRpZEhpZGVJbnB1dCxcblx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IGNvbnRleHQuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdHJlc3BvbnNlXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGRvQ3JlYXRlRm9yRm9jdXNlZENoYXQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwpOiBJQ2hhdFN5bnRoZXNpemVyU2Vzc2lvbkNvbnRyb2xsZXIge1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRsZXQgY2hhdFdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHJlc3BvbnNlLnNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoY2hhdFdpZGdldD8ubG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSkge1xuXHRcdFx0Y2hhdFdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0OyAvLyB3b3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjEyNzg1XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkSGlkZUNoYXQ6IGNoYXRXaWRnZXQ/Lm9uRGlkSGlkZSA/PyBFdmVudC5Ob25lLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IGNoYXRXaWRnZXQ/LnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID8/IGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVzcG9uc2Vcblx0XHR9O1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ2hhdFN5bnRoZXNpemVyQ29udGV4dCB7XG5cdHJlYWRvbmx5IGlnbm9yZUNvZGVCbG9ja3M6IGJvb2xlYW47XG5cdGluc2lkZUNvZGVCbG9jazogYm9vbGVhbjtcbn1cblxuY2xhc3MgQ2hhdFN5bnRoZXNpemVyU2Vzc2lvbnMge1xuXG5cdHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBDaGF0U3ludGhlc2l6ZXJTZXNzaW9ucyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0c3RhdGljIGdldEluc3RhbmNlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBDaGF0U3ludGhlc2l6ZXJTZXNzaW9ucyB7XG5cdFx0aWYgKCFDaGF0U3ludGhlc2l6ZXJTZXNzaW9ucy5pbnN0YW5jZSkge1xuXHRcdFx0Q2hhdFN5bnRoZXNpemVyU2Vzc2lvbnMuaW5zdGFuY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U3ludGhlc2l6ZXJTZXNzaW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIENoYXRTeW50aGVzaXplclNlc3Npb25zLmluc3RhbmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhY3RpdmVTZXNzaW9uOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNwZWVjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzcGVlY2hTZXJ2aWNlOiBJU3BlZWNoU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIHN0YXJ0KGNvbnRyb2xsZXI6IElDaGF0U3ludGhlc2l6ZXJTZXNzaW9uQ29udHJvbGxlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gU3RvcCBydW5uaW5nIHRleHQtdG8tc3BlZWNoIG9yIHNwZWVjaC10by10ZXh0IHNlc3Npb25zIGluIGNoYXRzXG5cdFx0dGhpcy5zdG9wKCk7XG5cdFx0Vm9pY2VDaGF0U2Vzc2lvbnMuZ2V0SW5zdGFuY2UodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkuc3RvcCgpO1xuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuYWN0aXZlU2Vzc2lvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjdGl2ZVNlc3Npb24udG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5zcGVlY2hTZXJ2aWNlLmNyZWF0ZVRleHRUb1NwZWVjaFNlc3Npb24oYWN0aXZlU2Vzc2lvbi50b2tlbiwgJ2NoYXQnKTtcblxuXHRcdGlmIChhY3RpdmVTZXNzaW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbnRyb2xsZXIub25EaWRIaWRlQ2hhdCgoKSA9PiB0aGlzLnN0b3AoKSkpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkQ2hhdFRvU3BlZWNoSW5Qcm9ncmVzcyA9IFNjb3BlZENoYXRTeW50aGVzaXNJblByb2dyZXNzLmJpbmRUbyhjb250cm9sbGVyLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNjb3BlZENoYXRUb1NwZWVjaEluUHJvZ3Jlc3MucmVzZXQoKSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlc3Npb24ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRzd2l0Y2ggKGUuc3RhdHVzKSB7XG5cdFx0XHRcdGNhc2UgVGV4dFRvU3BlZWNoU3RhdHVzLlN0YXJ0ZWQ6XG5cdFx0XHRcdFx0c2NvcGVkQ2hhdFRvU3BlZWNoSW5Qcm9ncmVzcy5zZXQodHJ1ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGV4dFRvU3BlZWNoU3RhdHVzLlN0b3BwZWQ6XG5cdFx0XHRcdFx0c2NvcGVkQ2hhdFRvU3BlZWNoSW5Qcm9ncmVzcy5yZXNldCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2YgdGhpcy5uZXh0Q2hhdFJlc3BvbnNlQ2h1bmsoY29udHJvbGxlci5yZXNwb25zZSwgYWN0aXZlU2Vzc2lvbi50b2tlbikpIHtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbihzZXNzaW9uLnN5bnRoZXNpemUoY2h1bmspLCBhY3RpdmVTZXNzaW9uLnRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jICpuZXh0Q2hhdFJlc3BvbnNlQ2h1bmsocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQXN5bmNJdGVyYWJsZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb250ZXh0OiBJQ2hhdFN5bnRoZXNpemVyQ29udGV4dCA9IHtcblx0XHRcdGlnbm9yZUNvZGVCbG9ja3M6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkLklnbm9yZUNvZGVCbG9ja3MpLFxuXHRcdFx0aW5zaWRlQ29kZUJsb2NrOiBmYWxzZVxuXHRcdH07XG5cblx0XHRsZXQgdG90YWxPZmZzZXQgPSAwO1xuXHRcdGxldCBjb21wbGV0ZSA9IGZhbHNlO1xuXHRcdGRvIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlTGVuZ3RoID0gcmVzcG9uc2UucmVzcG9uc2UudG9TdHJpbmcoKS5sZW5ndGg7XG5cdFx0XHRjb25zdCB7IGNodW5rLCBvZmZzZXQgfSA9IHRoaXMucGFyc2VOZXh0Q2hhdFJlc3BvbnNlQ2h1bmsocmVzcG9uc2UsIHRvdGFsT2Zmc2V0LCBjb250ZXh0KTtcblx0XHRcdHRvdGFsT2Zmc2V0ID0gb2Zmc2V0O1xuXHRcdFx0Y29tcGxldGUgPSByZXNwb25zZS5pc0NvbXBsZXRlO1xuXG5cdFx0XHRpZiAoY2h1bmspIHtcblx0XHRcdFx0eWllbGQgY2h1bms7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY29tcGxldGUgJiYgcmVzcG9uc2VMZW5ndGggPT09IHJlc3BvbnNlLnJlc3BvbnNlLnRvU3RyaW5nKCkubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHJhY2VDYW5jZWxsYXRpb24oRXZlbnQudG9Qcm9taXNlKHJlc3BvbnNlLm9uRGlkQ2hhbmdlKSwgdG9rZW4pOyAvLyB3YWl0IGZvciB0aGUgcmVzcG9uc2UgdG8gY2hhbmdlXG5cdFx0XHR9XG5cdFx0fSB3aGlsZSAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkICYmICFjb21wbGV0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlTmV4dENoYXRSZXNwb25zZUNodW5rKHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwsIG9mZnNldDogbnVtYmVyLCBjb250ZXh0OiBJQ2hhdFN5bnRoZXNpemVyQ29udGV4dCk6IHsgcmVhZG9ubHkgY2h1bms6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgb2Zmc2V0OiBudW1iZXIgfSB7XG5cdFx0bGV0IGNodW5rOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB0ZXh0ID0gcmVzcG9uc2UucmVzcG9uc2UudG9TdHJpbmcoKTtcblxuXHRcdGlmIChyZXNwb25zZS5pc0NvbXBsZXRlKSB7XG5cdFx0XHRjaHVuayA9IHRleHQuc3Vic3RyaW5nKG9mZnNldCk7XG5cdFx0XHRvZmZzZXQgPSB0ZXh0Lmxlbmd0aCArIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlcyA9IHBhcnNlTmV4dENoYXRSZXNwb25zZUNodW5rKHRleHQsIG9mZnNldCk7XG5cdFx0XHRjaHVuayA9IHJlcy5jaHVuaztcblx0XHRcdG9mZnNldCA9IHJlcy5vZmZzZXQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNodW5rICYmIGNvbnRleHQuaWdub3JlQ29kZUJsb2Nrcykge1xuXHRcdFx0Y2h1bmsgPSB0aGlzLmZpbHRlckNvZGVCbG9ja3MoY2h1bmssIGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjaHVuazogY2h1bmsgPyByZW5kZXJBc1BsYWludGV4dCh7IHZhbHVlOiBjaHVuayB9KSA6IGNodW5rLCAvLyBjb252ZXJ0IG1hcmtkb3duIHRvIHBsYWluIHRleHRcblx0XHRcdG9mZnNldFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckNvZGVCbG9ja3MoY2h1bms6IHN0cmluZywgY29udGV4dDogSUNoYXRTeW50aGVzaXplckNvbnRleHQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBjaHVuay5zcGxpdCgnXFxuJylcblx0XHRcdC5maWx0ZXIobGluZSA9PiB7XG5cdFx0XHRcdGlmIChsaW5lLnRyaW1TdGFydCgpLnN0YXJ0c1dpdGgoJ2BgYCcpKSB7XG5cdFx0XHRcdFx0Y29udGV4dC5pbnNpZGVDb2RlQmxvY2sgPSAhY29udGV4dC5pbnNpZGVDb2RlQmxvY2s7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAhY29udGV4dC5pbnNpZGVDb2RlQmxvY2s7XG5cdFx0XHR9KVxuXHRcdFx0LmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0c3RvcCgpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZVNlc3Npb24/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNvbnN0IHNlbnRlbmNlRGVsaW1pdGVyID0gWycuJywgJyEnLCAnPycsICc6J107XG5jb25zdCBsaW5lRGVsaW1pdGVyID0gJ1xcbic7XG5jb25zdCB3b3JkRGVsaW1pdGVyID0gJyAnO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VOZXh0Q2hhdFJlc3BvbnNlQ2h1bmsodGV4dDogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IHsgcmVhZG9ubHkgY2h1bms6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgb2Zmc2V0OiBudW1iZXIgfSB7XG5cdGxldCBjaHVuazogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGZvciAobGV0IGkgPSB0ZXh0Lmxlbmd0aCAtIDE7IGkgPj0gb2Zmc2V0OyBpLS0pIHsgLy8gZ29pbmcgZnJvbSBlbmQgdG8gc3RhcnQgdG8gcHJvZHVjZSBsYXJnZXN0IGNodW5rc1xuXHRcdGNvbnN0IGN1ciA9IHRleHRbaV07XG5cdFx0Y29uc3QgbmV4dCA9IHRleHRbaSArIDFdO1xuXHRcdGlmIChcblx0XHRcdHNlbnRlbmNlRGVsaW1pdGVyLmluY2x1ZGVzKGN1cikgJiYgbmV4dCA9PT0gd29yZERlbGltaXRlciB8fFx0Ly8gZW5kIG9mIHNlbnRlbmNlXG5cdFx0XHRsaW5lRGVsaW1pdGVyID09PSBjdXJcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gZW5kIG9mIGxpbmVcblx0XHQpIHtcblx0XHRcdGNodW5rID0gdGV4dC5zdWJzdHJpbmcob2Zmc2V0LCBpICsgMSkudHJpbSgpO1xuXHRcdFx0b2Zmc2V0ID0gaSArIDE7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBjaHVuaywgb2Zmc2V0IH07XG59XG5cbmV4cG9ydCBjbGFzcyBSZWFkQ2hhdFJlc3BvbnNlQWxvdWQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVhZENoYXRSZXNwb25zZUFsb3VkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZWFkQ2hhdFJlc3BvbnNlQWxvdWQnLCBcIlJlYWQgQWxvdWRcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnVubXV0ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2FuVm9pY2VDaGF0LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TWVzc2FnZUZvb3Rlcixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENhblZvaWNlQ2hhdCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNSZXNwb25zZSxcdFx0XHRcdFx0XHQvLyBvbmx5IGZvciByZXNwb25zZXNcblx0XHRcdFx0XHRTY29wZWRDaGF0U3ludGhlc2lzSW5Qcm9ncmVzcy5uZWdhdGUoKSxcdFx0XHQvLyBidXQgbm90IHdoZW4gYWxyZWFkeSBpbiBwcm9ncmVzc1xuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUlzRmlsdGVyZWQubmVnYXRlKCksXHQvLyBhbmQgbm90IHdoZW4gcmVzcG9uc2UgaXMgZmlsdGVyZWRcblx0XHRcdFx0KSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IC0xMCAvLyBmaXJzdFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTUVOVV9JTkxJTkVfQ0hBVF9XSURHRVRfU0VDT05EQVJZLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2FuVm9pY2VDaGF0LFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLFx0XHRcdFx0XHRcdC8vIG9ubHkgZm9yIHJlc3BvbnNlc1xuXHRcdFx0XHRcdFNjb3BlZENoYXRTeW50aGVzaXNJblByb2dyZXNzLm5lZ2F0ZSgpLFx0XHRcdC8vIGJ1dCBub3Qgd2hlbiBhbHJlYWR5IGluIHByb2dyZXNzXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlc3BvbnNlSXNGaWx0ZXJlZC5uZWdhdGUoKVx0XHQvLyBhbmQgbm90IHdoZW4gcmVzcG9uc2UgaXMgZmlsdGVyZWRcblx0XHRcdFx0KSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IC0xMCAvLyBmaXJzdFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXG5cdFx0bGV0IHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChhcmdzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlQXJnID0gYXJnc1swXTtcblx0XHRcdGlmIChpc1Jlc3BvbnNlVk0ocmVzcG9uc2VBcmcpKSB7XG5cdFx0XHRcdHJlc3BvbnNlID0gcmVzcG9uc2VBcmc7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNoYXRXaWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRcdGlmIChjaGF0V2lkZ2V0KSB7XG5cblx0XHRcdFx0Ly8gcGljayBmb2N1c2VkIHJlc3BvbnNlXG5cdFx0XHRcdGNvbnN0IGZvY3VzID0gY2hhdFdpZGdldC5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAoZm9jdXMgaW5zdGFuY2VvZiBDaGF0UmVzcG9uc2VWaWV3TW9kZWwpIHtcblx0XHRcdFx0XHRyZXNwb25zZSA9IGZvY3VzO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gcGljayB0aGUgbGFzdCByZXNwb25zZVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjaGF0Vmlld01vZGVsID0gY2hhdFdpZGdldC52aWV3TW9kZWw7XG5cdFx0XHRcdFx0aWYgKGNoYXRWaWV3TW9kZWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW1zID0gY2hhdFZpZXdNb2RlbC5nZXRJdGVtcygpO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IGl0ZW1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSBpdGVtc1tpXTtcblx0XHRcdFx0XHRcdFx0aWYgKGlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3BvbnNlID0gaXRlbTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gQ2hhdFN5bnRoZXNpemVyU2Vzc2lvbkNvbnRyb2xsZXIuY3JlYXRlKGFjY2Vzc29yLCAnZm9jdXNlZCcsIHJlc3BvbnNlLm1vZGVsKTtcblx0XHRDaGF0U3ludGhlc2l6ZXJTZXNzaW9ucy5nZXRJbnN0YW5jZShpbnN0YW50aWF0aW9uU2VydmljZSkuc3RhcnQoY29udHJvbGxlcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0b3BSZWFkQWxvdWQgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5zcGVlY2guc3RvcFJlYWRBbG91ZCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFN0b3BSZWFkQWxvdWQuSUQsXG5cdFx0XHRpY29uOiBzeW5jaW5nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5zcGVlY2guc3RvcFJlYWRBbG91ZCcsIFwiU3RvcCBSZWFkaW5nIEFsb3VkXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogR2xvYmFsVGV4dFRvU3BlZWNoSW5Qcm9ncmVzcywgLy8gbmVlZCBnbG9iYWwgY29udGV4dCBoZXJlIGJlY2F1c2Ugb2YgYGYxOiB0cnVlYFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwMCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdHdoZW46IFNjb3BlZENoYXRTeW50aGVzaXNJblByb2dyZXNzXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogcHJpbWFyeVZvaWNlQWN0aW9uTWVudShTY29wZWRDaGF0U3ludGhlc2lzSW5Qcm9ncmVzcylcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdENoYXRTeW50aGVzaXplclNlc3Npb25zLmdldEluc3RhbmNlKGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpKS5zdG9wKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0b3BSZWFkQ2hhdEl0ZW1BbG91ZCBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3RvcFJlYWRDaGF0SXRlbUFsb3VkJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU3RvcFJlYWRDaGF0SXRlbUFsb3VkLklELFxuXHRcdFx0aWNvbjogQ29kaWNvbi5tdXRlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LnN0b3BSZWFkQ2hhdEl0ZW1BbG91ZCcsIFwiU3RvcCBSZWFkaW5nIEFsb3VkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTY29wZWRDaGF0U3ludGhlc2lzSW5Qcm9ncmVzcyxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMDAsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdE1lc3NhZ2VGb290ZXIsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0U2NvcGVkQ2hhdFN5bnRoZXNpc0luUHJvZ3Jlc3MsXHRcdFx0XHQvLyBvbmx5IHdoZW4gaW4gcHJvZ3Jlc3Ncblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLFx0XHRcdFx0XHQvLyBvbmx5IGZvciByZXNwb25zZXNcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUlzRmlsdGVyZWQubmVnYXRlKClcdC8vIGJ1dCBub3Qgd2hlbiByZXNwb25zZSBpcyBmaWx0ZXJlZFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogLTEwIC8vIGZpcnN0XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTUVOVV9JTkxJTkVfQ0hBVF9XSURHRVRfU0VDT05EQVJZLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFNjb3BlZENoYXRTeW50aGVzaXNJblByb2dyZXNzLFx0XHRcdFx0Ly8gb25seSB3aGVuIGluIHByb2dyZXNzXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaXNSZXNwb25zZSxcdFx0XHRcdFx0Ly8gb25seSBmb3IgcmVzcG9uc2VzXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMucmVzcG9uc2VJc0ZpbHRlcmVkLm5lZ2F0ZSgpXHQvLyBidXQgbm90IHdoZW4gcmVzcG9uc2UgaXMgZmlsdGVyZWRcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IC0xMCAvLyBmaXJzdFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdENoYXRTeW50aGVzaXplclNlc3Npb25zLmdldEluc3RhbmNlKGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpKS5zdG9wKCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBLZXl3b3JkIFJlY29nbml0aW9uXG5cbmZ1bmN0aW9uIHN1cHBvcnRzS2V5d29yZEFjdGl2YXRpb24oY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgc3BlZWNoU2VydmljZTogSVNwZWVjaFNlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdGlmICghc3BlZWNoU2VydmljZS5oYXNTcGVlY2hQcm92aWRlciB8fCAhY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCB2YWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEtFWVdPUkRfQUNUSVZJQVRJT05fU0VUVElOR19JRCk7XG5cblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUgIT09IEtleXdvcmRBY3RpdmF0aW9uQ29udHJpYnV0aW9uLlNFVFRJTkdTX1ZBTFVFLk9GRjtcbn1cblxuZXhwb3J0IGNsYXNzIEtleXdvcmRBY3RpdmF0aW9uQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5rZXl3b3JkQWN0aXZhdGlvbic7XG5cblx0c3RhdGljIFNFVFRJTkdTX1ZBTFVFID0ge1xuXHRcdE9GRjogJ29mZicsXG5cdFx0SU5MSU5FX0NIQVQ6ICdpbmxpbmVDaGF0Jyxcblx0XHRRVUlDS19DSEFUOiAncXVpY2tDaGF0Jyxcblx0XHRWSUVXX0NIQVQ6ICdjaGF0SW5WaWV3Jyxcblx0XHRDSEFUX0lOX0NPTlRFWFQ6ICdjaGF0SW5Db250ZXh0J1xuXHR9O1xuXG5cdHByaXZhdGUgYWN0aXZlU2Vzc2lvbjogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTcGVlY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3BlZWNoU2VydmljZTogSVNwZWVjaFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoS2V5d29yZEFjdGl2YXRpb25TdGF0dXNFbnRyeSkpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5zcGVlY2hTZXJ2aWNlLm9uRGlkQ2hhbmdlSGFzU3BlZWNoUHJvdmlkZXIsICgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0dGhpcy5oYW5kbGVLZXl3b3JkQWN0aXZhdGlvbigpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG9uRGlkQWRkRGVmYXVsdEFnZW50ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0XHR0aGlzLmhhbmRsZUtleXdvcmRBY3RpdmF0aW9uKCk7XG5cblx0XHRcdFx0b25EaWRBZGREZWZhdWx0QWdlbnQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3BlZWNoU2VydmljZS5vbkRpZFN0YXJ0U3BlZWNoVG9UZXh0U2Vzc2lvbigoKSA9PiB0aGlzLmhhbmRsZUtleXdvcmRBY3RpdmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNwZWVjaFNlcnZpY2Uub25EaWRFbmRTcGVlY2hUb1RleHRTZXNzaW9uKCgpID0+IHRoaXMuaGFuZGxlS2V5d29yZEFjdGl2YXRpb24oKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihLRVlXT1JEX0FDVElWSUFUSU9OX1NFVFRJTkdfSUQpKSB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlS2V5d29yZEFjdGl2YXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNwZWVjaFNlcnZpY2UuaGFzU3BlZWNoUHJvdmlkZXIgfHwgIXRoaXMuY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpIHtcblx0XHRcdHJldHVybjsgLy8gdGhlc2Ugc2V0dGluZ3MgcmVxdWlyZSBhIHNwZWVjaCBhbmQgY2hhdCBwcm92aWRlclxuXHRcdH1cblxuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRyZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0Li4uYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0W0tFWVdPUkRfQUNUSVZJQVRJT05fU0VUVElOR19JRF06IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdlbnVtJzogW1xuXHRcdFx0XHRcdFx0S2V5d29yZEFjdGl2YXRpb25Db250cmlidXRpb24uU0VUVElOR1NfVkFMVUUuT0ZGLFxuXHRcdFx0XHRcdFx0S2V5d29yZEFjdGl2YXRpb25Db250cmlidXRpb24uU0VUVElOR1NfVkFMVUUuVklFV19DSEFULFxuXHRcdFx0XHRcdFx0S2V5d29yZEFjdGl2YXRpb25Db250cmlidXRpb24uU0VUVElOR1NfVkFMVUUuUVVJQ0tfQ0hBVCxcblx0XHRcdFx0XHRcdEtleXdvcmRBY3RpdmF0aW9uQ29udHJpYnV0aW9uLlNFVFRJTkdTX1ZBTFVFLklOTElORV9DSEFULFxuXHRcdFx0XHRcdFx0S2V5d29yZEFjdGl2YXRpb25Db250cmlidXRpb24uU0VUVElOR1NfVkFMVUUuQ0hBVF9JTl9DT05URVhUXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0XHRcdGxvY2FsaXplKCd2b2ljZS5rZXl3b3JkQWN0aXZhdGlvbi5vZmYnLCBcIktleXdvcmQgYWN0aXZhdGlvbiBpcyBkaXNhYmxlZC5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgndm9pY2Uua2V5d29yZEFjdGl2YXRpb24uY2hhdEluVmlldycsIFwiS2V5d29yZCBhY3RpdmF0aW9uIGlzIGVuYWJsZWQgYW5kIGxpc3RlbmluZyBmb3IgJ0hleSBDb2RlJyB0byBzdGFydCBhIHZvaWNlIGNoYXQgc2Vzc2lvbiBpbiB0aGUgY2hhdCB2aWV3LlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCd2b2ljZS5rZXl3b3JkQWN0aXZhdGlvbi5xdWlja0NoYXQnLCBcIktleXdvcmQgYWN0aXZhdGlvbiBpcyBlbmFibGVkIGFuZCBsaXN0ZW5pbmcgZm9yICdIZXkgQ29kZScgdG8gc3RhcnQgYSB2b2ljZSBjaGF0IHNlc3Npb24gaW4gdGhlIHF1aWNrIGNoYXQuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3ZvaWNlLmtleXdvcmRBY3RpdmF0aW9uLmlubGluZUNoYXQnLCBcIktleXdvcmQgYWN0aXZhdGlvbiBpcyBlbmFibGVkIGFuZCBsaXN0ZW5pbmcgZm9yICdIZXkgQ29kZScgdG8gc3RhcnQgYSB2b2ljZSBjaGF0IHNlc3Npb24gaW4gdGhlIGFjdGl2ZSBlZGl0b3IgaWYgcG9zc2libGUuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3ZvaWNlLmtleXdvcmRBY3RpdmF0aW9uLmNoYXRJbkNvbnRleHQnLCBcIktleXdvcmQgYWN0aXZhdGlvbiBpcyBlbmFibGVkIGFuZCBsaXN0ZW5pbmcgZm9yICdIZXkgQ29kZScgdG8gc3RhcnQgYSB2b2ljZSBjaGF0IHNlc3Npb24gaW4gdGhlIGFjdGl2ZSBlZGl0b3Igb3IgdmlldyBkZXBlbmRpbmcgb24ga2V5Ym9hcmQgZm9jdXMuXCIpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgndm9pY2Uua2V5d29yZEFjdGl2YXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGtleXdvcmQgcGhyYXNlICdIZXkgQ29kZScgaXMgcmVjb2duaXplZCB0byBzdGFydCBhIHZvaWNlIGNoYXQgc2Vzc2lvbi4gRW5hYmxpbmcgdGhpcyB3aWxsIHN0YXJ0IHJlY29yZGluZyBmcm9tIHRoZSBtaWNyb3Bob25lIGJ1dCB0aGUgYXVkaW8gaXMgcHJvY2Vzc2VkIGxvY2FsbHkgYW5kIG5ldmVyIHNlbnQgdG8gYSBzZXJ2ZXIuXCIpLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ29mZicsXG5cdFx0XHRcdFx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUtleXdvcmRBY3RpdmF0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZWQgPVxuXHRcdFx0c3VwcG9ydHNLZXl3b3JkQWN0aXZhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnNwZWVjaFNlcnZpY2UsIHRoaXMuY2hhdEFnZW50U2VydmljZSkgJiZcblx0XHRcdCF0aGlzLnNwZWVjaFNlcnZpY2UuaGFzQWN0aXZlU3BlZWNoVG9UZXh0U2Vzc2lvbjtcblx0XHRpZiAoXG5cdFx0XHQoZW5hYmxlZCAmJiB0aGlzLmFjdGl2ZVNlc3Npb24pIHx8XG5cdFx0XHQoIWVuYWJsZWQgJiYgIXRoaXMuYWN0aXZlU2Vzc2lvbilcblx0XHQpIHtcblx0XHRcdHJldHVybjsgLy8gYWxyZWFkeSBydW5uaW5nIG9yIHN0b3BwZWRcblx0XHR9XG5cblx0XHQvLyBTdGFydCBrZXl3b3JkIGFjdGl2YXRpb25cblx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbmFibGVLZXl3b3JkQWN0aXZhdGlvbigpO1xuXHRcdH1cblxuXHRcdC8vIFN0b3Aga2V5d29yZCBhY3RpdmF0aW9uXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLmRpc2FibGVLZXl3b3JkQWN0aXZhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZW5hYmxlS2V5d29yZEFjdGl2YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuYWN0aXZlU2Vzc2lvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc3BlZWNoU2VydmljZS5yZWNvZ25pemVLZXl3b3JkKHNlc3Npb24udG9rZW4pO1xuXHRcdGlmIChzZXNzaW9uLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHNlc3Npb24gIT09IHRoaXMuYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuOyAvLyBjYW5jZWxsZWRcblx0XHR9XG5cblx0XHR0aGlzLmFjdGl2ZVNlc3Npb24gPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAocmVzdWx0ID09PSBLZXl3b3JkUmVjb2duaXRpb25TdGF0dXMuUmVjb2duaXplZCkge1xuXHRcdFx0aWYgKHRoaXMuaG9zdFNlcnZpY2UuaGFzRm9jdXMpIHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh0aGlzLmdldEtleXdvcmRDb21tYW5kKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbW1lZGlhdGVseSBzdGFydCBhbm90aGVyIGtleWJvYXJkIGFjdGl2YXRpb24gc2Vzc2lvblxuXHRcdFx0Ly8gYmVjYXVzZSB3ZSBjYW5ub3QgYXNzdW1lIHRoYXQgdGhlIGNvbW1hbmQgd2UgZXhlY3V0ZVxuXHRcdFx0Ly8gd2lsbCB0cmlnZ2VyIGEgc3BlZWNoIHJlY29nbml0aW9uIHNlc3Npb24uXG5cblx0XHRcdHRoaXMuaGFuZGxlS2V5d29yZEFjdGl2YXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEtleXdvcmRDb21tYW5kKCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc2V0dGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoS0VZV09SRF9BQ1RJVklBVElPTl9TRVRUSU5HX0lEKTtcblx0XHRzd2l0Y2ggKHNldHRpbmcpIHtcblx0XHRcdGNhc2UgS2V5d29yZEFjdGl2YXRpb25Db250cmlidXRpb24uU0VUVElOR1NfVkFMVUUuSU5MSU5FX0NIQVQ6XG5cdFx0XHRcdHJldHVybiBJbmxpbmVWb2ljZUNoYXRBY3Rpb24uSUQ7XG5cdFx0XHRjYXNlIEtleXdvcmRBY3RpdmF0aW9uQ29udHJpYnV0aW9uLlNFVFRJTkdTX1ZBTFVFLlFVSUNLX0NIQVQ6XG5cdFx0XHRcdHJldHVybiBRdWlja1ZvaWNlQ2hhdEFjdGlvbi5JRDtcblx0XHRcdGNhc2UgS2V5d29yZEFjdGl2YXRpb25Db250cmlidXRpb24uU0VUVElOR1NfVkFMVUUuQ0hBVF9JTl9DT05URVhUOiB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUNvZGVFZGl0b3IgPSBnZXRDb2RlRWRpdG9yKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0XHRcdGlmIChhY3RpdmVDb2RlRWRpdG9yPy5oYXNXaWRnZXRGb2N1cygpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIElubGluZVZvaWNlQ2hhdEFjdGlvbi5JRDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFZvaWNlQ2hhdEluQ2hhdFZpZXdBY3Rpb24uSUQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkaXNhYmxlS2V5d29yZEFjdGl2YXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uPy5kaXNwb3NlKHRydWUpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uPy5kaXNwb3NlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgS2V5d29yZEFjdGl2YXRpb25TdGF0dXNFbnRyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZW50cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCkpO1xuXG5cdHByaXZhdGUgc3RhdGljIFNUQVRVU19OQU1FID0gbG9jYWxpemUoJ2tleXdvcmRBY3RpdmF0aW9uLnN0YXR1cy5uYW1lJywgXCJWb2ljZSBLZXl3b3JkIEFjdGl2YXRpb25cIik7XG5cdHByaXZhdGUgc3RhdGljIFNUQVRVU19DT01NQU5EID0gJ2tleXdvcmRBY3RpdmF0aW9uLnN0YXR1cy5jb21tYW5kJztcblx0cHJpdmF0ZSBzdGF0aWMgU1RBVFVTX0FDVElWRSA9IGxvY2FsaXplKCdrZXl3b3JkQWN0aXZhdGlvbi5zdGF0dXMuYWN0aXZlJywgXCJMaXN0ZW5pbmcgdG8gJ0hleSBDb2RlJy4uLlwiKTtcblx0cHJpdmF0ZSBzdGF0aWMgU1RBVFVTX0lOQUNUSVZFID0gbG9jYWxpemUoJ2tleXdvcmRBY3RpdmF0aW9uLnN0YXR1cy5pbmFjdGl2ZScsIFwiV2FpdGluZyBmb3Igdm9pY2UgY2hhdCB0byBlbmQuLi5cIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTcGVlY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3BlZWNoU2VydmljZTogSVNwZWVjaFNlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEtleXdvcmRBY3RpdmF0aW9uU3RhdHVzRW50cnkuU1RBVFVTX0NPTU1BTkQsICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgS0VZV09SRF9BQ1RJVklBVElPTl9TRVRUSU5HX0lEKSkpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMudXBkYXRlU3RhdHVzRW50cnkoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zcGVlY2hTZXJ2aWNlLm9uRGlkU3RhcnRLZXl3b3JkUmVjb2duaXRpb24oKCkgPT4gdGhpcy51cGRhdGVTdGF0dXNFbnRyeSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zcGVlY2hTZXJ2aWNlLm9uRGlkRW5kS2V5d29yZFJlY29nbml0aW9uKCgpID0+IHRoaXMudXBkYXRlU3RhdHVzRW50cnkoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oS0VZV09SRF9BQ1RJVklBVElPTl9TRVRUSU5HX0lEKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1c0VudHJ5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0dXNFbnRyeSgpOiB2b2lkIHtcblx0XHRjb25zdCB2aXNpYmxlID0gc3VwcG9ydHNLZXl3b3JkQWN0aXZhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnNwZWVjaFNlcnZpY2UsIHRoaXMuY2hhdEFnZW50U2VydmljZSk7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdGlmICghdGhpcy5lbnRyeS52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZVN0YXR1c0VudHJ5KCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzTGFiZWwoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbnRyeS5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU3RhdHVzRW50cnkoKSB7XG5cdFx0dGhpcy5lbnRyeS52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeSh0aGlzLmdldFN0YXR1c0VudHJ5UHJvcGVydGllcygpLCAnc3RhdHVzLnZvaWNlS2V5d29yZEFjdGl2YXRpb24nLCBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsIDEwMyk7XG5cdH1cblxuXHRwcml2YXRlIGdldFN0YXR1c0VudHJ5UHJvcGVydGllcygpOiBJU3RhdHVzYmFyRW50cnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBLZXl3b3JkQWN0aXZhdGlvblN0YXR1c0VudHJ5LlNUQVRVU19OQU1FLFxuXHRcdFx0dGV4dDogdGhpcy5zcGVlY2hTZXJ2aWNlLmhhc0FjdGl2ZUtleXdvcmRSZWNvZ25pdGlvbiA/ICckKG1pYy1maWxsZWQpJyA6ICckKG1pYyknLFxuXHRcdFx0dG9vbHRpcDogdGhpcy5zcGVlY2hTZXJ2aWNlLmhhc0FjdGl2ZUtleXdvcmRSZWNvZ25pdGlvbiA/IEtleXdvcmRBY3RpdmF0aW9uU3RhdHVzRW50cnkuU1RBVFVTX0FDVElWRSA6IEtleXdvcmRBY3RpdmF0aW9uU3RhdHVzRW50cnkuU1RBVFVTX0lOQUNUSVZFLFxuXHRcdFx0YXJpYUxhYmVsOiB0aGlzLnNwZWVjaFNlcnZpY2UuaGFzQWN0aXZlS2V5d29yZFJlY29nbml0aW9uID8gS2V5d29yZEFjdGl2YXRpb25TdGF0dXNFbnRyeS5TVEFUVVNfQUNUSVZFIDogS2V5d29yZEFjdGl2YXRpb25TdGF0dXNFbnRyeS5TVEFUVVNfSU5BQ1RJVkUsXG5cdFx0XHRjb21tYW5kOiBLZXl3b3JkQWN0aXZhdGlvblN0YXR1c0VudHJ5LlNUQVRVU19DT01NQU5ELFxuXHRcdFx0a2luZDogJ3Byb21pbmVudCcsXG5cdFx0XHRzaG93SW5BbGxXaW5kb3dzOiB0cnVlXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3RhdHVzTGFiZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5lbnRyeS52YWx1ZT8udXBkYXRlKHRoaXMuZ2V0U3RhdHVzRW50cnlQcm9wZXJ0aWVzKCkpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRsZXQgYWN0aXZlUmVjb3JkaW5nQ29sb3I6IENvbG9yIHwgdW5kZWZpbmVkO1xuXHRsZXQgYWN0aXZlUmVjb3JkaW5nRGltbWVkQ29sb3I6IENvbG9yIHwgdW5kZWZpbmVkO1xuXHRpZiAoIWlzSGlnaENvbnRyYXN0KHRoZW1lLnR5cGUpKSB7XG5cdFx0YWN0aXZlUmVjb3JkaW5nQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JJbmZvRm9yZWdyb3VuZCkgPz8gdGhlbWUuZ2V0Q29sb3IoZm9jdXNCb3JkZXIpO1xuXHRcdGFjdGl2ZVJlY29yZGluZ0RpbW1lZENvbG9yID0gYWN0aXZlUmVjb3JkaW5nQ29sb3I/LnRyYW5zcGFyZW50KDAuMzgpO1xuXHR9IGVsc2Uge1xuXHRcdGFjdGl2ZVJlY29yZGluZ0NvbG9yID0gdGhlbWUuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXHRcdGFjdGl2ZVJlY29yZGluZ0RpbW1lZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXHR9XG5cblx0Ly8gU2hvdyBhIFwibWljcm9waG9uZVwiIG9yIFwicHVsc2VcIiBpY29uIHdoZW4gc3BlZWNoLXRvLXRleHQgb3IgdGV4dC10by1zcGVlY2ggaXMgaW4gcHJvZ3Jlc3MgdGhhdCBnbG93cyB2aWEgb3V0bGluZS5cblx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdC5tb25hY28td29ya2JlbmNoLm1vbmFjby1lbmFibGUtbW90aW9uIC5pbnRlcmFjdGl2ZS1pbnB1dC1wYXJ0IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWxhYmVsLmNvZGljb24tc3luYy5jb2RpY29uLW1vZGlmaWVyLXNwaW46bm90KC5kaXNhYmxlZCksXG5cdFx0Lm1vbmFjby13b3JrYmVuY2gubW9uYWNvLWVuYWJsZS1tb3Rpb24gLmludGVyYWN0aXZlLWlucHV0LXBhcnQgLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24tbGFiZWwuY29kaWNvbi1sb2FkaW5nLmNvZGljb24tbW9kaWZpZXItc3Bpbjpub3QoLmRpc2FibGVkKSB7XG5cdFx0XHRjb2xvcjogJHthY3RpdmVSZWNvcmRpbmdDb2xvcn07XG5cdFx0XHRvdXRsaW5lOiAxcHggc29saWQgJHthY3RpdmVSZWNvcmRpbmdDb2xvcn07XG5cdFx0XHRvdXRsaW5lLW9mZnNldDogLTFweDtcblx0XHRcdGFuaW1hdGlvbjogcHVsc2VBbmltYXRpb24gMXMgaW5maW5pdGU7XG5cdFx0XHRib3JkZXItcmFkaXVzOiA1MCU7XG5cdFx0fVxuXG5cdFx0Lm1vbmFjby13b3JrYmVuY2gubW9uYWNvLWVuYWJsZS1tb3Rpb24gLmludGVyYWN0aXZlLWlucHV0LXBhcnQgLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24tbGFiZWwuY29kaWNvbi1zeW5jLmNvZGljb24tbW9kaWZpZXItc3Bpbjpub3QoLmRpc2FibGVkKTo6YmVmb3JlLFxuXHRcdC5tb25hY28td29ya2JlbmNoLm1vbmFjby1lbmFibGUtbW90aW9uIC5pbnRlcmFjdGl2ZS1pbnB1dC1wYXJ0IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWxhYmVsLmNvZGljb24tbG9hZGluZy5jb2RpY29uLW1vZGlmaWVyLXNwaW46bm90KC5kaXNhYmxlZCk6OmJlZm9yZSB7XG5cdFx0XHRwb3NpdGlvbjogYWJzb2x1dGU7XG5cdFx0XHRvdXRsaW5lOiAxcHggc29saWQgJHthY3RpdmVSZWNvcmRpbmdDb2xvcn07XG5cdFx0XHRvdXRsaW5lLW9mZnNldDogMnB4O1xuXHRcdFx0Ym9yZGVyLXJhZGl1czogNTAlO1xuXHRcdFx0d2lkdGg6IDE2cHg7XG5cdFx0XHRoZWlnaHQ6IDE2cHg7XG5cdFx0fVxuXG5cdFx0Lm1vbmFjby13b3JrYmVuY2gubW9uYWNvLWVuYWJsZS1tb3Rpb24gLmludGVyYWN0aXZlLWlucHV0LXBhcnQgLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24tbGFiZWwuY29kaWNvbi1zeW5jLmNvZGljb24tbW9kaWZpZXItc3Bpbjpub3QoLmRpc2FibGVkKTo6YWZ0ZXIsXG5cdFx0Lm1vbmFjby13b3JrYmVuY2gubW9uYWNvLWVuYWJsZS1tb3Rpb24gLmludGVyYWN0aXZlLWlucHV0LXBhcnQgLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24tbGFiZWwuY29kaWNvbi1sb2FkaW5nLmNvZGljb24tbW9kaWZpZXItc3Bpbjpub3QoLmRpc2FibGVkKTo6YWZ0ZXIge1xuXHRcdFx0b3V0bGluZTogMnB4IHNvbGlkICR7YWN0aXZlUmVjb3JkaW5nQ29sb3J9O1xuXHRcdFx0b3V0bGluZS1vZmZzZXQ6IC0xcHg7XG5cdFx0XHRhbmltYXRpb246IHB1bHNlQW5pbWF0aW9uIDE1MDBtcyBjdWJpYy1iZXppZXIoMC43NSwgMCwgMC4yNSwgMSkgaW5maW5pdGU7XG5cdFx0fVxuXG5cdFx0QGtleWZyYW1lcyBwdWxzZUFuaW1hdGlvbiB7XG5cdFx0XHQwJSB7XG5cdFx0XHRcdG91dGxpbmUtd2lkdGg6IDJweDtcblx0XHRcdH1cblx0XHRcdDYyJSB7XG5cdFx0XHRcdG91dGxpbmUtd2lkdGg6IDVweDtcblx0XHRcdFx0b3V0bGluZS1jb2xvcjogJHthY3RpdmVSZWNvcmRpbmdEaW1tZWRDb2xvcn07XG5cdFx0XHR9XG5cdFx0XHQxMDAlIHtcblx0XHRcdFx0b3V0bGluZS13aWR0aDogMnB4O1xuXHRcdFx0fVxuXHRcdH1cblx0YCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0IsbUJBQW1CLHdCQUF3QjtBQUN0RSxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBRXhCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFNBQTBCLGNBQWM7QUFDakQsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQTBDO0FBQ25ELFNBQVMsZ0JBQXNDLG9CQUFvQixxQkFBcUI7QUFDeEYsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0IsbUJBQW1CO0FBQzVDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUIsYUFBYTtBQUMvQyxTQUFtRCxtQkFBbUIsMEJBQTBCO0FBQ2hHLFNBQVMsNkJBQTZCLHNCQUFzQiwwQ0FBMEM7QUFDdEcsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUIseUNBQXlDO0FBQzNFLFNBQVMsK0JBQStC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
