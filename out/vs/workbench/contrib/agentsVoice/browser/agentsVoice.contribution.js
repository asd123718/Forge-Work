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
import "../../chat/browser/voiceClient/micCaptureService.js";
import "../../chat/browser/voiceClient/ttsPlaybackService.js";
import "../../chat/browser/voiceClient/voiceClientService.js";
import { IVoiceSessionController, isVoiceEntitled } from "../../chat/browser/voiceClient/voiceSessionController.js";
import { normalizeAgentsVoiceId, VOICE_AGENT_PROGRESS_SETTING } from "../../chat/common/voiceClient/voiceClientService.js";
import "../../chat/browser/voiceClient/voiceToolDispatchService.js";
import "../../chat/common/voicePlaybackService.js";
import "../common/voiceTranscriptStore.js";
import "./transcriptsView/voiceTranscripts.contribution.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { URI } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { SegmentedVoiceInputModePillInactive } from "../../chat/browser/voiceInputMode/voiceInputModeContextKeys.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { Extensions as WorkbenchConfigurationExtensions } from "../../../common/configuration.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { AgentsVoiceSettingId, AgentsVoiceStorageKeys, AGENTS_VOICE_CONNECTED, AGENTS_VOICE_CONNECTING, AGENTS_VOICE_ENABLED, AGENTS_VOICE_ENTITLED, AGENTS_VOICE_LISTENING, AGENTS_VOICE_RECONNECTING } from "../common/agentsVoice.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
import { ChatAgentLocation } from "../../chat/common/constants.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID } from "../../chat/browser/actions/configureVoiceInstructionsAction.js";
import { IVoiceModeOnboardingService } from "./voiceModeOnboarding.js";
import { SHOW_VOICE_MODE_ONBOARDING_COMMAND } from "../../chat/browser/speechToText/micButtonMenuActions.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
const AGENTS_VOICE_WIDGET_FOCUSED = new RawContextKey("agentsVoiceWidgetFocused", false);
const AGENTS_VOICE_INITIATED_HERE = ContextKeyExpr.equals("agentsVoiceInitiatedHere", true);
const VOICE_ACTIVE_ON_SURFACE = ContextKeyExpr.or(IsSessionsWindowContext.negate(), AGENTS_VOICE_INITIATED_HERE);
let AgentsVoiceEntitlementKeyContribution = class extends Disposable {
  constructor(chatEntitlementService, contextKeyService) {
    super();
    const entitledKey = AGENTS_VOICE_ENTITLED.bindTo(contextKeyService);
    const update = () => entitledKey.set(isVoiceEntitled(chatEntitlementService));
    update();
    this._register(chatEntitlementService.onDidChangeEntitlement(update));
  }
};
AgentsVoiceEntitlementKeyContribution.ID = "workbench.contrib.agentsVoiceEntitlementKey";
AgentsVoiceEntitlementKeyContribution = __decorateClass([
  __decorateParam(0, IChatEntitlementService),
  __decorateParam(1, IContextKeyService)
], AgentsVoiceEntitlementKeyContribution);
registerWorkbenchContribution2(AgentsVoiceEntitlementKeyContribution.ID, AgentsVoiceEntitlementKeyContribution, WorkbenchPhase.AfterRestored);
let AgentsVoiceConnectedKeyContribution = class extends Disposable {
  constructor(voiceSessionController, contextKeyService) {
    super();
    const connectedKey = AGENTS_VOICE_CONNECTED.bindTo(contextKeyService);
    const connectingKey = AGENTS_VOICE_CONNECTING.bindTo(contextKeyService);
    const listeningKey = AGENTS_VOICE_LISTENING.bindTo(contextKeyService);
    const reconnectingKey = AGENTS_VOICE_RECONNECTING.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      connectedKey.set(voiceSessionController.isConnected.read(reader));
      connectingKey.set(voiceSessionController.isConnecting.read(reader));
      reconnectingKey.set(voiceSessionController.isReconnecting.read(reader));
      listeningKey.set(voiceSessionController.voiceState.read(reader) === "listening");
    }));
  }
};
AgentsVoiceConnectedKeyContribution.ID = "workbench.contrib.agentsVoiceConnectedKey";
AgentsVoiceConnectedKeyContribution = __decorateClass([
  __decorateParam(0, IVoiceSessionController),
  __decorateParam(1, IContextKeyService)
], AgentsVoiceConnectedKeyContribution);
registerWorkbenchContribution2(AgentsVoiceConnectedKeyContribution.ID, AgentsVoiceConnectedKeyContribution, WorkbenchPhase.Eventually);
let AgentsVoiceTelemetryContribution = class extends Disposable {
  constructor(configurationService, telemetryService, storageService) {
    super();
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agents.voice.enabled")) {
        const enabled = configurationService.getValue("agents.voice.enabled");
        if (enabled) {
          storageService.store(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, Date.now(), StorageScope.PROFILE, StorageTarget.MACHINE);
          telemetryService.publicLog2("voiceEnabled", { source: "setting" });
        } else {
          const enabledAt = storageService.getNumber(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, StorageScope.PROFILE, 0);
          const daysActive = enabledAt ? Math.round((Date.now() - enabledAt) / (1e3 * 60 * 60 * 24)) : 0;
          telemetryService.publicLog2("voiceDisabled", { daysActive });
          storageService.remove(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, StorageScope.PROFILE);
        }
      }
    }));
  }
};
AgentsVoiceTelemetryContribution.ID = "workbench.contrib.agentsVoiceTelemetry";
AgentsVoiceTelemetryContribution._ENABLED_AT_KEY = "agents.voice.enabledAtMs";
AgentsVoiceTelemetryContribution = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IStorageService)
], AgentsVoiceTelemetryContribution);
registerWorkbenchContribution2(AgentsVoiceTelemetryContribution.ID, AgentsVoiceTelemetryContribution, WorkbenchPhase.AfterRestored);
let AgentsVoiceOnboardingContribution = class extends Disposable {
  constructor(voiceSessionController, voiceModeOnboardingService) {
    super();
    this._register(autorun((reader) => {
      if (voiceSessionController.isConnecting.read(reader) || voiceSessionController.isConnected.read(reader)) {
        voiceModeOnboardingService.showIfNeeded();
      }
    }));
  }
};
AgentsVoiceOnboardingContribution.ID = "workbench.contrib.agentsVoiceOnboarding";
AgentsVoiceOnboardingContribution = __decorateClass([
  __decorateParam(0, IVoiceSessionController),
  __decorateParam(1, IVoiceModeOnboardingService)
], AgentsVoiceOnboardingContribution);
registerWorkbenchContribution2(AgentsVoiceOnboardingContribution.ID, AgentsVoiceOnboardingContribution, WorkbenchPhase.Eventually);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.connecting",
      title: nls.localize2("agentsVoice.connecting", "Connecting..."),
      icon: Codicon.loadingCompact,
      precondition: ContextKeyExpr.and(
        AGENTS_VOICE_ENABLED,
        ContextKeyExpr.or(
          AGENTS_VOICE_CONNECTING.isEqualTo(true),
          AGENTS_VOICE_RECONNECTING.isEqualTo(true)
        )
      ),
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillInactive,
          AGENTS_VOICE_ENABLED,
          ContextKeyExpr.notEquals(`config.${AgentsVoiceSettingId.ShowButton}`, false),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ContextKeyExpr.or(
            AGENTS_VOICE_CONNECTING.isEqualTo(true),
            AGENTS_VOICE_RECONNECTING.isEqualTo(true)
          ),
          VOICE_ACTIVE_ON_SURFACE
        ),
        group: "navigation",
        order: -10
      }
    });
  }
  async run() {
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.startVoiceInChat",
      title: nls.localize2("agentsVoice.startVoiceInChat", "Voice Mode"),
      icon: Codicon.voiceModeCompact,
      precondition: AGENTS_VOICE_ENABLED,
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillInactive,
          AGENTS_VOICE_ENABLED,
          ContextKeyExpr.notEquals(`config.${AgentsVoiceSettingId.ShowButton}`, false),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.currentlyEditing.negate(),
          AGENTS_VOICE_LISTENING.negate(),
          AGENTS_VOICE_CONNECTING.negate(),
          AGENTS_VOICE_RECONNECTING.negate(),
          // Hide Voice Mode while dictation is active (recording or the
          // model is loading) so the two mic affordances never compete.
          ChatContextKeys.speechToTextRecording.negate(),
          ChatContextKeys.speechToTextPreparing.negate()
        ),
        group: "navigation",
        order: -10
      },
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillInactive,
          AGENTS_VOICE_ENABLED,
          ChatContextKeys.inChatInput
        )
      }
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    const keybindingService = accessor.get(IKeybindingService);
    const handsFree = accessor.get(IConfigurationService).getValue("agents.voice.handsFree") === true;
    const omniHasFocus = accessor.get(IContextKeyService).getContextKeyValue(ChatContextKeys.inChatInputWindow.key) === true;
    const activeWindow = getActiveWindow();
    voiceController.setActiveWindow(activeWindow);
    const holdMode = keybindingService.enableKeybindingHoldMode("agentsVoice.startVoiceInChat");
    const currentSession = omniHasFocus ? void 0 : await accessor.get(ICommandService).executeCommand("_chat.voice.getCurrentSession");
    voiceController.setOmniInputActive(omniHasFocus);
    if (omniHasFocus) {
      voiceController.setDraftTarget();
    } else if (currentSession) {
      try {
        const resource = URI.parse(currentSession);
        if (resource.scheme === "sessions-voice") {
          voiceController.setDraftTarget();
        } else {
          voiceController.setTargetSession(resource);
          voiceController.activateSession(resource);
        }
      } catch {
      }
    }
    const wasConnected = voiceController.isConnected.get();
    if (!wasConnected) {
      await voiceController.connect(activeWindow);
    }
    if (!holdMode && !handsFree && !wasConnected) {
      return;
    }
    voiceController.pttDown();
    if (!holdMode) {
      voiceController.pttUp();
      return;
    }
    await holdMode;
    voiceController.pttUp();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.pttStopInChat",
      title: nls.localize2("agentsVoice.pttStopInChat", "Voice Mode: Stop Recording"),
      icon: Codicon.voiceModeCompact,
      precondition: ContextKeyExpr.and(
        AGENTS_VOICE_ENABLED,
        AGENTS_VOICE_LISTENING.isEqualTo(true)
      ),
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillInactive,
          AGENTS_VOICE_ENABLED,
          ContextKeyExpr.notEquals(`config.${AgentsVoiceSettingId.ShowButton}`, false),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.currentlyEditing.negate(),
          AGENTS_VOICE_LISTENING.isEqualTo(true),
          VOICE_ACTIVE_ON_SURFACE
        ),
        group: "navigation",
        order: -10
      }
      // NOTE: intentionally no keybinding. The Cmd+Shift+Space chord is
      // owned solely by `agentsVoice.startVoiceInChat`, which handles both
      // starting and stopping (via the controller's push-to-talk model).
      // Binding the same chord here as well caused the two actions to
      // fight on every OS key-repeat, producing rapid start/stop toggling.
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    voiceController.stopListening();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.disconnect",
      title: nls.localize2("agentsVoice.disconnect", "Disconnect Voice Mode"),
      icon: Codicon.debugDisconnectCompact,
      f1: true,
      precondition: ContextKeyExpr.and(
        AGENTS_VOICE_ENABLED,
        AGENTS_VOICE_CONNECTED.isEqualTo(true)
      ),
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          AGENTS_VOICE_ENABLED,
          ContextKeyExpr.notEquals(`config.${AgentsVoiceSettingId.ShowButton}`, false),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.currentlyEditing.negate(),
          AGENTS_VOICE_CONNECTED.isEqualTo(true),
          VOICE_ACTIVE_ON_SURFACE,
          // The segmented voice pill's voice cell is itself the on/off toggle,
          // so a separate disconnect button would be redundant there.
          SegmentedVoiceInputModePillInactive
        ),
        group: "navigation",
        order: -9
      },
      keybinding: {
        // Keep this below the editor widgets and negate their contexts so
        // Escape still dismisses IntelliSense/hover and clears selections
        // while the user is typing in the chat input.
        weight: KeybindingWeight.EditorContrib - 5,
        primary: KeyCode.Escape,
        when: ContextKeyExpr.and(
          AGENTS_VOICE_ENABLED,
          ChatContextKeys.inChatInput,
          AGENTS_VOICE_CONNECTED.isEqualTo(true),
          VOICE_ACTIVE_ON_SURFACE,
          // Don't disconnect voice while a request is running — pressing
          // Escape there is meant to interrupt/cancel that request, not
          // tear down the voice session (which is especially disruptive
          // in hands-free mode where there is no reconnect button).
          ChatContextKeys.hasActiveRequest.negate(),
          EditorContextKeys.hoverVisible.toNegated(),
          EditorContextKeys.hasNonEmptySelection.toNegated(),
          EditorContextKeys.hasMultipleSelections.toNegated()
        )
      }
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    voiceController.disconnect("explicit");
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.cancelActiveRequest",
      title: nls.localize2("agentsVoice.cancelActiveRequest", "Voice Mode: Cancel Request"),
      f1: false,
      keybinding: {
        weight: KeybindingWeight.EditorContrib - 5,
        primary: KeyCode.Escape,
        when: ContextKeyExpr.and(
          AGENTS_VOICE_ENABLED,
          ChatContextKeys.inChatInput,
          AGENTS_VOICE_CONNECTED.isEqualTo(true),
          // Mirror the disconnect binding's editor negations so Escape
          // still dismisses IntelliSense/hover and clears selections first.
          ChatContextKeys.hasActiveRequest,
          EditorContextKeys.hoverVisible.toNegated(),
          EditorContextKeys.hasNonEmptySelection.toNegated(),
          EditorContextKeys.hasMultipleSelections.toNegated()
        )
      }
    });
  }
  async run(accessor) {
    await accessor.get(ICommandService).executeCommand("workbench.action.chat.cancel");
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.openSettings",
      title: nls.localize2("agentsVoice.openSettings", "Voice Mode Settings"),
      f1: true,
      precondition: AGENTS_VOICE_ENABLED
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand("workbench.action.openSettings", { query: "agents.voice" });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SHOW_VOICE_MODE_ONBOARDING_COMMAND,
      title: nls.localize2("agentsVoice.showOnboarding", "Voice Mode: Show Introduction"),
      f1: true,
      precondition: AGENTS_VOICE_ENABLED
    });
  }
  run(accessor) {
    if (!accessor.get(IVoiceModeOnboardingService).show()) {
      accessor.get(INotificationService).info(nls.localize("agentsVoice.onboardingNeedsChat", "Open a chat to see the Voice Mode introduction."));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.simulateConnection",
      title: nls.localize2("agentsVoice.simulateConnection", "Voice: Simulate Connection (Dev)"),
      f1: true
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    voiceController.simulateConnection();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.resetOnboarding",
      title: nls.localize2("resetAgentsVoiceOnboarding", "Voice: Reset Onboarding"),
      f1: true
    });
  }
  async run(accessor) {
    const storageService = accessor.get(IStorageService);
    storageService.remove(AgentsVoiceStorageKeys.OnboardingCompleted, StorageScope.PROFILE);
    storageService.remove(AgentsVoiceStorageKeys.IntroBannerShown, StorageScope.APPLICATION);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.pushToTalk",
      title: nls.localize2("agentsVoicePushToTalk", "Voice Mode: Push to Talk"),
      f1: true,
      precondition: AGENTS_VOICE_ENABLED,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
        when: ContextKeyExpr.and(
          AGENTS_VOICE_WIDGET_FOCUSED,
          ContextKeyExpr.not("inputFocus")
        )
      }
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    const keybindingService = accessor.get(IKeybindingService);
    const holdMode = keybindingService.enableKeybindingHoldMode("agentsVoice.pushToTalk");
    if (!voiceController.isConnected.get() && !voiceController.isConnecting.get()) {
      await voiceController.connect(getActiveWindow());
    }
    if (!voiceController.isConnected.get()) {
      return;
    }
    voiceController.pttDown();
    if (!holdMode) {
      voiceController.pttUp();
      return;
    }
    await holdMode;
    voiceController.pttUp();
  }
});
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "agentsVoice",
  title: nls.localize("agentsVoiceConfigurationTitle", "Voice Mode"),
  type: "object",
  properties: {
    "agents.voice.enabled": {
      type: "boolean",
      description: nls.localize("agents.voice.enabled", "Enable the Voice Mode panel in the chat view for voice-driven coding conversations."),
      default: false,
      experiment: {
        mode: "auto"
      },
      tags: ["experimental"],
      scope: ConfigurationScope.APPLICATION,
      restricted: true
    },
    [AgentsVoiceSettingId.ShowButton]: {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.showButton", "Controls whether the Voice Mode button is shown in the chat input. When hidden, Voice Mode can still be started with its keyboard shortcut."),
      default: true,
      tags: ["experimental"],
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.backendUrl": {
      type: "string",
      description: nls.localize("agents.voice.backendUrl", "Voice backend WebSocket URL. Leave empty to use the default hosted backend. Set to e.g. `ws://localhost:8000/api/v1/realtime/voice` to point at a backend running on your machine."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      included: false
    },
    "agents.voice.speakResponses": {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.speakResponses", "When enabled, the assistant reads responses aloud. When disabled, responses are not spoken; enable `#agents.voice.showTranscript#` to read them as a text transcript instead."),
      default: true,
      scope: ConfigurationScope.APPLICATION
    },
    [VOICE_AGENT_PROGRESS_SETTING]: {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.agentProgress", "Allow Agent mode to speak brief semantic progress updates while it investigates, plans, edits, validates, or recovers from a problem."),
      default: true,
      tags: ["experimental"],
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.voice": {
      type: "string",
      enum: ["harper_neutral", "birch_neutral", "junho_neutral", "oak_neutral"],
      enumItemLabels: ["Harper", "Birch", "Junho", "Oak"],
      enumDescriptions: [
        nls.localize("agents.voice.voice.harper", "Harper."),
        nls.localize("agents.voice.voice.birch", "Birch."),
        nls.localize("agents.voice.voice.junho", "Junho."),
        nls.localize("agents.voice.voice.oak", "Oak.")
      ],
      markdownDescription: nls.localize("agents.voice.voice", "The voice used when the assistant reads responses aloud. Changing this while voice mode is connected takes effect immediately. Use [Voice Mode instructions](command:{0}) to customize Voice Mode behavior and terminology.", CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID),
      default: "birch_neutral",
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.language": {
      type: "string",
      enum: ["auto", "en", "de", "es", "fr", "it", "pt", "ja", "ko", "zh"],
      enumItemLabels: [
        nls.localize("agents.voice.language.auto", "Automatic"),
        nls.localize("agents.voice.language.en", "English"),
        nls.localize("agents.voice.language.de", "German"),
        nls.localize("agents.voice.language.es", "Spanish"),
        nls.localize("agents.voice.language.fr", "French"),
        nls.localize("agents.voice.language.it", "Italian"),
        nls.localize("agents.voice.language.pt", "Portuguese"),
        nls.localize("agents.voice.language.ja", "Japanese"),
        nls.localize("agents.voice.language.ko", "Korean"),
        nls.localize("agents.voice.language.zh", "Chinese")
      ],
      markdownDescription: nls.localize("agents.voice.language", "The language used for speech recognition, dictation, and spoken responses. The selectable languages support native voice output. Automatic uses the configured display language for speech recognition and dictation when supported; otherwise, it follows the system or browser locale. English voice output is used when the detected language does not support native voice output. Changing this while voice mode is connected takes effect immediately."),
      default: "auto",
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.showTranscript": {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.showTranscript", "Show the voice transcript overlay in the chat input area while voice mode is active. Enable this to read responses as text when `#agents.voice.speakResponses#` is disabled."),
      default: false,
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.liveTranscript": {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.liveTranscript", "Show your speech as a live, word-by-word transcript while you are speaking. When disabled, your transcript appears only once you finish speaking. Requires `#agents.voice.showTranscript#` to be enabled to be visible."),
      default: false,
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.handsFree": {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.handsFree", "When enabled, voice mode automatically re-enters listening after the assistant finishes speaking, so you can hold a hands-free back-and-forth conversation. When disabled, you start and end each turn manually, and ending the turn sends it. Turns are not ended automatically on trailing silence or a stop phrase unless {0} or {1} is explicitly configured.", "`#agents.voice.turn.silenceMs#`", "`#agents.voice.turn.stopPhrases#`"),
      default: true,
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.turn.silenceMs": {
      type: "number",
      markdownDescription: nls.localize("agents.voice.turn.silenceMs", "Trailing silence in milliseconds before the backend ends the turn automatically. Set to `-1` to disable ending the turn on silence, in which case the turn ends only via a stop phrase ({0}) or manually. When enabled, the backend clamps this to its supported range (currently 200-5000 ms) and is the source of truth. When hands-free mode ({1}) is disabled, the turn is not ended on silence by default unless this setting is explicitly configured, so you keep manual control over when a turn is sent.", "`#agents.voice.turn.stopPhrases#`", "`#agents.voice.handsFree#`"),
      default: 800,
      anyOf: [
        {
          const: -1,
          description: nls.localize("agents.voice.turn.silenceMs.disabled", "Do not end the turn on trailing silence.")
        },
        {
          type: "number",
          minimum: 200,
          maximum: 5e3
        }
      ],
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.turn.stopPhrases": {
      type: "array",
      items: { type: "string" },
      markdownDescription: nls.localize("agents.voice.turn.stopPhrases", "Phrases that end the turn when spoken at the end of an utterance. Leave empty to disable ending the turn on a stop phrase, in which case the turn ends only on trailing silence ({0}) or manually. The backend strips the matched phrase from the transcript before it reaches the agent. When hands-free mode ({1}) is disabled, stop phrases do not end the turn by default unless this setting is explicitly configured, so you keep manual control over when a turn is sent.", "`#agents.voice.turn.silenceMs#`", "`#agents.voice.handsFree#`"),
      default: ["send it"],
      scope: ConfigurationScope.APPLICATION
    }
  }
});
Registry.as(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "agents.voice.voice",
  includeApplication: true,
  migrateFn: (value) => ({ value: normalizeAgentsVoiceId(value) })
}, {
  key: "agents.voice.turn.autoEndMode",
  migrateFn: (value) => {
    const result = [["agents.voice.turn.autoEndMode", { value: void 0 }]];
    if (value === "off" || value === "vad" || value === "phrase" || value === "both") {
      const silenceEnabled = value === "vad" || value === "both";
      const phraseEnabled = value === "phrase" || value === "both";
      if (!silenceEnabled) {
        result.push(["agents.voice.turn.silenceMs", { value: -1 }]);
      }
      if (!phraseEnabled) {
        result.push(["agents.voice.turn.stopPhrases", { value: [] }]);
      }
    }
    return result;
  }
}]);
export {
  AGENTS_VOICE_WIDGET_FOCUSED
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFnZW50c1ZvaWNlXFxicm93c2VyXFxhZ2VudHNWb2ljZS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vLyBSZWdpc3RlciB2b2ljZSBjbGllbnQgc2VydmljZXNcbmltcG9ydCAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L21pY0NhcHR1cmVTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3R0c1BsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIGlzVm9pY2VFbnRpdGxlZCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZUFnZW50c1ZvaWNlSWQsIFZPSUNFX0FHRU5UX1BST0dSRVNTX1NFVFRJTkcgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi8uLi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi4vLi4vY2hhdC9jb21tb24vdm9pY2VQbGF5YmFja1NlcnZpY2UuanMnO1xuXG4vLyBSZWdpc3RlciB0aGUgdm9pY2UgdHJhbnNjcmlwdCBzdG9yZSBzaW5nbGV0b25cbmltcG9ydCAnLi4vY29tbW9uL3ZvaWNlVHJhbnNjcmlwdFN0b3JlLmpzJztcblxuLy8gUmVnaXN0ZXIgdGhlIFZvaWNlIFRyYW5zY3JpcHRzIHZpZXcgKyBzaG93LWNvbW1hbmQgKyBjaGF0LW1lbnUgZW50cnlcbmltcG9ydCAnLi90cmFuc2NyaXB0c1ZpZXcvdm9pY2VUcmFuc2NyaXB0cy5jb250cmlidXRpb24uanMnO1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBDb25maWd1cmF0aW9uU2NvcGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsSW5hY3RpdmUgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvdm9pY2VJbnB1dE1vZGUvdm9pY2VJbnB1dE1vZGVDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycywgSUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbmltcG9ydCB7IEFnZW50c1ZvaWNlU2V0dGluZ0lkLCBBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLCBBR0VOVFNfVk9JQ0VfQ09OTkVDVEVELCBBR0VOVFNfVk9JQ0VfQ09OTkVDVElORywgQUdFTlRTX1ZPSUNFX0VOQUJMRUQsIEFHRU5UU19WT0lDRV9FTlRJVExFRCwgQUdFTlRTX1ZPSUNFX0xJU1RFTklORywgQUdFTlRTX1ZPSUNFX1JFQ09OTkVDVElORyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHtcblx0Vm9pY2VFbmFibGVkQ2xhc3NpZmljYXRpb24sIFZvaWNlRW5hYmxlZEV2ZW50LFxuXHRWb2ljZURpc2FibGVkQ2xhc3NpZmljYXRpb24sIFZvaWNlRGlzYWJsZWRFdmVudCxcbn0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ09ORklHVVJFX1ZPSUNFX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jb25maWd1cmVWb2ljZUluc3RydWN0aW9uc0FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuL3ZvaWNlTW9kZU9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgU0hPV19WT0lDRV9NT0RFX09OQk9BUkRJTkdfQ09NTUFORCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvbWljQnV0dG9uTWVudUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG4vLyAtLS0gQ29udGV4dCBLZXlzIC0tLVxuXG5leHBvcnQgY29uc3QgQUdFTlRTX1ZPSUNFX1dJREdFVF9GT0NVU0VEID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FnZW50c1ZvaWNlV2lkZ2V0Rm9jdXNlZCcsIGZhbHNlKTtcbmNvbnN0IEFHRU5UU19WT0lDRV9JTklUSUFURURfSEVSRSA9IENvbnRleHRLZXlFeHByLmVxdWFscygnYWdlbnRzVm9pY2VJbml0aWF0ZWRIZXJlJywgdHJ1ZSk7XG5jb25zdCBWT0lDRV9BQ1RJVkVfT05fU1VSRkFDRSA9IENvbnRleHRLZXlFeHByLm9yKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLCBBR0VOVFNfVk9JQ0VfSU5JVElBVEVEX0hFUkUpITtcblxuLy8gLS0tIENvbnRleHQgS2V5IEJpbmRpbmcgLS0tXG5cbi8vIFJlZmxlY3RzIENvcGlsb3QgZW50aXRsZW1lbnQgaW50byBhIHNpbmdsZSBgYWdlbnRzVm9pY2VFbnRpdGxlZGAgY29udGV4dCBrZXkuXG4vLyBLZXB0IGFzIG9uZSBpbXBlcmF0aXZlbHktc2V0IGtleSAocmF0aGVyIHRoYW4gYW4gT1Itb2YtcGxhbnMgZXhwcmVzc2lvbikgc29cbi8vIHRoYXQgbmVnYXRpbmcgYEFHRU5UU19WT0lDRV9FTkFCTEVEYCAoZS5nLiBmb3IgdGhlIHN0YW5kYWxvbmUgdm9pY2UgY29udHJvbHMpXG4vLyBkb2VzIG5vdCBkaXN0cmlidXRlIHRoZSBwbGFuIGRpc2p1bmN0aW9uIGludG8gdGhvdXNhbmRzIG9mIHRlcm1zLlxuY2xhc3MgQWdlbnRzVm9pY2VFbnRpdGxlbWVudEtleUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRzVm9pY2VFbnRpdGxlbWVudEtleSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVudGl0bGVkS2V5ID0gQUdFTlRTX1ZPSUNFX0VOVElUTEVELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgdXBkYXRlID0gKCkgPT4gZW50aXRsZWRLZXkuc2V0KGlzVm9pY2VFbnRpdGxlZChjaGF0RW50aXRsZW1lbnRTZXJ2aWNlKSk7XG5cdFx0dXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVudGl0bGVtZW50KHVwZGF0ZSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihBZ2VudHNWb2ljZUVudGl0bGVtZW50S2V5Q29udHJpYnV0aW9uLklELCBBZ2VudHNWb2ljZUVudGl0bGVtZW50S2V5Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxuLy8gU2VwYXJhdGUgY29udHJpYnV0aW9uIGZvciB2b2ljZSBjb25uZWN0ZWQgc3RhdGUgXHUyMDE0IHJ1bnMgbGF0ZXIgdG8gYXZvaWRcbi8vIGZvcmNpbmcgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgaW5zdGFudGlhdGlvbiB0b28gZWFybHkuXG5jbGFzcyBBZ2VudHNWb2ljZUNvbm5lY3RlZEtleUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRzVm9pY2VDb25uZWN0ZWRLZXknO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB2b2ljZVNlc3Npb25Db250cm9sbGVyOiBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjb25uZWN0ZWRLZXkgPSBBR0VOVFNfVk9JQ0VfQ09OTkVDVEVELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY29ubmVjdGluZ0tleSA9IEFHRU5UU19WT0lDRV9DT05ORUNUSU5HLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdGVuaW5nS2V5ID0gQUdFTlRTX1ZPSUNFX0xJU1RFTklORy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlY29ubmVjdGluZ0tleSA9IEFHRU5UU19WT0lDRV9SRUNPTk5FQ1RJTkcuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25uZWN0ZWRLZXkuc2V0KHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0ZWQucmVhZChyZWFkZXIpKTtcblx0XHRcdGNvbm5lY3RpbmdLZXkuc2V0KHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRyZWNvbm5lY3RpbmdLZXkuc2V0KHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNSZWNvbm5lY3RpbmcucmVhZChyZWFkZXIpKTtcblx0XHRcdGxpc3RlbmluZ0tleS5zZXQodm9pY2VTZXNzaW9uQ29udHJvbGxlci52b2ljZVN0YXRlLnJlYWQocmVhZGVyKSA9PT0gJ2xpc3RlbmluZycpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRzVm9pY2VDb25uZWN0ZWRLZXlDb250cmlidXRpb24uSUQsIEFnZW50c1ZvaWNlQ29ubmVjdGVkS2V5Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcblxuLy8gLS0tIFRlbGVtZXRyeTogdHJhY2sgZW5hYmxlL2Rpc2FibGUgLS0tXG5cbmNsYXNzIEFnZW50c1ZvaWNlVGVsZW1ldHJ5Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRzVm9pY2VUZWxlbWV0cnknO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRU5BQkxFRF9BVF9LRVkgPSAnYWdlbnRzLnZvaWNlLmVuYWJsZWRBdE1zJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFRyYWNrIHdoZW4gdGhlIHNldHRpbmcgaXMgdG9nZ2xlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdhZ2VudHMudm9pY2UuZW5hYmxlZCcpKSB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignYWdlbnRzLnZvaWNlLmVuYWJsZWQnKTtcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudHNWb2ljZVRlbGVtZXRyeUNvbnRyaWJ1dGlvbi5fRU5BQkxFRF9BVF9LRVksIERhdGUubm93KCksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxWb2ljZUVuYWJsZWRFdmVudCwgVm9pY2VFbmFibGVkQ2xhc3NpZmljYXRpb24+KCd2b2ljZUVuYWJsZWQnLCB7IHNvdXJjZTogJ3NldHRpbmcnIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGVuYWJsZWRBdCA9IHN0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcihBZ2VudHNWb2ljZVRlbGVtZXRyeUNvbnRyaWJ1dGlvbi5fRU5BQkxFRF9BVF9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAwKTtcblx0XHRcdFx0XHRjb25zdCBkYXlzQWN0aXZlID0gZW5hYmxlZEF0ID8gTWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIGVuYWJsZWRBdCkgLyAoMTAwMCAqIDYwICogNjAgKiAyNCkpIDogMDtcblx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Vm9pY2VEaXNhYmxlZEV2ZW50LCBWb2ljZURpc2FibGVkQ2xhc3NpZmljYXRpb24+KCd2b2ljZURpc2FibGVkJywgeyBkYXlzQWN0aXZlIH0pO1xuXHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBZ2VudHNWb2ljZVRlbGVtZXRyeUNvbnRyaWJ1dGlvbi5fRU5BQkxFRF9BVF9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRzVm9pY2VUZWxlbWV0cnlDb250cmlidXRpb24uSUQsIEFnZW50c1ZvaWNlVGVsZW1ldHJ5Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxuLy8gLS0tIEZpcnN0LXJ1biBpbnRyb2R1Y3Rpb24gLS0tXG5cbi8qKlxuICogU2hvd3MgdGhlIFZvaWNlIE1vZGUgaW50cm9kdWN0aW9uIHRoZSBmaXJzdCB0aW1lIGEgc2Vzc2lvbiBzdGFydHMuIFRoaXNcbiAqIHdhdGNoZXMgdGhlIGNvbm5lY3Rpb24gc3RhdGUgcmF0aGVyIHRoYW4gYW55IG9uZSBlbnRyeSBwb2ludCwgYmVjYXVzZSBWb2ljZVxuICogTW9kZSBjYW4gYmUgc3RhcnRlZCBmcm9tIHRoZSBpbnB1dC1tb2RlIHBpbGwsIGEgY29tbWFuZCwgYSBrZXliaW5kaW5nIG9yIHRoZVxuICogQWdlbnRzIHdpbmRvdyAtIGFsbCBvZiB3aGljaCBsYW5kIGhlcmUuXG4gKi9cbmNsYXNzIEFnZW50c1ZvaWNlT25ib2FyZGluZ0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmFnZW50c1ZvaWNlT25ib2FyZGluZyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElWb2ljZVNlc3Npb25Db250cm9sbGVyIHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI6IElWb2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdEBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2Ugdm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2U6IElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICh2b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGluZy5yZWFkKHJlYWRlcikgfHwgdm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0dm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbi8vIFJlZ2lzdGVyZWQgYXQgdGhlIHNhbWUgbGF0ZSBwaGFzZSBhcyB0aGUgY29ubmVjdGVkLWtleSBjb250cmlidXRpb24gc28gaXRcbi8vIGRvZXMgbm90IGZvcmNlIGBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcmAgdG8gaW5zdGFudGlhdGUgZWFybHkuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRzVm9pY2VPbmJvYXJkaW5nQ29udHJpYnV0aW9uLklELCBBZ2VudHNWb2ljZU9uYm9hcmRpbmdDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xuXG4vLyAtLS0gVm9pY2UgbW9kZSBidXR0b24gaW4gQ2hhdCB0b29sYmFyIC0tLVxuLy8gU2hvd3MgdGhlIHZvaWNlIG1vZGUgaWNvbiBpbiBib3RoIGlkbGUgYW5kIGFjdGl2ZSBzdGF0ZXMuXG4vLyBDbGljayB0byBjb25uZWN0IGlmIGRpc2Nvbm5lY3RlZCwgb3IgdG9nZ2xlIFBUVCBpZiBjb25uZWN0ZWQuXG4vLyBUaGUgZGlzY29ubmVjdCBidXR0b24gKHNob3duIHdoZW4gY29ubmVjdGVkKSBpbmRpY2F0ZXMgYWN0aXZlIHZvaWNlIG1vZGUuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50c1ZvaWNlLmNvbm5lY3RpbmcnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FnZW50c1ZvaWNlLmNvbm5lY3RpbmcnLCBcIkNvbm5lY3RpbmcuLi5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmxvYWRpbmdDb21wYWN0LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRBR0VOVFNfVk9JQ0VfQ09OTkVDVElORy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX1JFQ09OTkVDVElORy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdCksXG5cdFx0XHQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0U2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsSW5hY3RpdmUsXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0VOQUJMRUQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtBZ2VudHNWb2ljZVNldHRpbmdJZC5TaG93QnV0dG9ufWAsIGZhbHNlKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0NPTk5FQ1RJTkcuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX1JFQ09OTkVDVElORy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRWT0lDRV9BQ1RJVkVfT05fU1VSRkFDRSxcblx0XHRcdFx0KSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IC0xMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBOby1vcCBcdTIwMTQganVzdCBhIHZpc3VhbCBpbmRpY2F0b3Jcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50c1ZvaWNlLnN0YXJ0Vm9pY2VJbkNoYXQnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FnZW50c1ZvaWNlLnN0YXJ0Vm9pY2VJbkNoYXQnLCBcIlZvaWNlIE1vZGVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnZvaWNlTW9kZUNvbXBhY3QsXG5cdFx0XHRwcmVjb25kaXRpb246IEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0U2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsSW5hY3RpdmUsXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0VOQUJMRUQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtBZ2VudHNWb2ljZVNldHRpbmdJZC5TaG93QnV0dG9ufWAsIGZhbHNlKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdEFHRU5UU19WT0lDRV9MSVNURU5JTkcubmVnYXRlKCksXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0NPTk5FQ1RJTkcubmVnYXRlKCksXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX1JFQ09OTkVDVElORy5uZWdhdGUoKSxcblx0XHRcdFx0XHQvLyBIaWRlIFZvaWNlIE1vZGUgd2hpbGUgZGljdGF0aW9uIGlzIGFjdGl2ZSAocmVjb3JkaW5nIG9yIHRoZVxuXHRcdFx0XHRcdC8vIG1vZGVsIGlzIGxvYWRpbmcpIHNvIHRoZSB0d28gbWljIGFmZm9yZGFuY2VzIG5ldmVyIGNvbXBldGUuXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnNwZWVjaFRvVGV4dFJlY29yZGluZy5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuc3BlZWNoVG9UZXh0UHJlcGFyaW5nLm5lZ2F0ZSgpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTEwXG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0U2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsSW5hY3RpdmUsXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0VOQUJMRUQsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0LFxuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2b2ljZUNvbnRyb2xsZXIgPSBhY2Nlc3Nvci5nZXQoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cdFx0Y29uc3QgaGFuZHNGcmVlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnKSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBvbW5pSGFzRm9jdXMgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0V2luZG93LmtleSkgPT09IHRydWU7XG5cdFx0Y29uc3QgYWN0aXZlV2luZG93ID0gZ2V0QWN0aXZlV2luZG93KCk7XG5cdFx0dm9pY2VDb250cm9sbGVyLnNldEFjdGl2ZVdpbmRvdyhhY3RpdmVXaW5kb3cpO1xuXG5cdFx0Ly8gQ2FwdHVyZSBob2xkLW1vZGUgRklSU1QsIHN5bmNocm9ub3VzbHksIGJlZm9yZSBhbnkgYGF3YWl0YC4gVGhlXG5cdFx0Ly8ga2V5YmluZGluZyBzZXJ2aWNlIG9ubHkgcmVwb3J0cyBhIGhlbGQgY2hvcmQgd2hpbGUgaXQgaXMgc3RpbGxcblx0XHQvLyBkaXNwYXRjaGluZyB0aGlzIGNvbW1hbmQ7IHRoZSBtb21lbnQgYHJ1bigpYCBmaXJzdCBzdXNwZW5kcyBvbiBhblxuXHRcdC8vIGF3YWl0IGl0IGNsZWFycyBgX2N1cnJlbnRseURpc3BhdGNoaW5nQ29tbWFuZElkYCwgYWZ0ZXIgd2hpY2hcblx0XHQvLyBgZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlYCByZXR1cm5zIGB1bmRlZmluZWRgLiBDYWxsaW5nIGl0IHVwLWZyb250IGlzXG5cdFx0Ly8gd2hhdCBtYWtlcyBwcmVzcy1hbmQtaG9sZCB3b3JrIGV2ZW4gb24gdGhlIHZlcnkgZmlyc3QgKGNvbGQpIHByZXNzXG5cdFx0Ly8gd2hlcmUgd2Ugc3RpbGwgaGF2ZSB0byBjb25uZWN0LiBgdW5kZWZpbmVkYCBoZXJlIG1lYW5zIHRoZSBhY3Rpb24gd2FzXG5cdFx0Ly8gaW52b2tlZCB3aXRob3V0IGEgaGVsZCBrZXkgKHRvb2xiYXIgbWljIGJ1dHRvbiAvIGNvbW1hbmQgcGFsZXR0ZSkuXG5cdFx0Y29uc3QgaG9sZE1vZGUgPSBrZXliaW5kaW5nU2VydmljZS5lbmFibGVLZXliaW5kaW5nSG9sZE1vZGUoJ2FnZW50c1ZvaWNlLnN0YXJ0Vm9pY2VJbkNoYXQnKTtcblxuXHRcdC8vIEFuIGV4cGxpY2l0IHByZXNzIGluIGFub3RoZXIgY29tcG9zZXIgdHJhbnNmZXJzIFZvaWNlIE1vZGUgb3duZXJzaGlwIHRvXG5cdFx0Ly8gdGhhdCBjb21wb3Nlci4gVGhlIGRyYWZ0IHNlbnRpbmVsIGRlbGliZXJhdGVseSBjbGVhcnMgdGhlIGNvbmNyZXRlIHRhcmdldC5cblx0XHRjb25zdCBjdXJyZW50U2Vzc2lvbiA9IG9tbmlIYXNGb2N1c1xuXHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdDogYXdhaXQgYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQ8c3RyaW5nIHwgdW5kZWZpbmVkPignX2NoYXQudm9pY2UuZ2V0Q3VycmVudFNlc3Npb24nKTtcblx0XHR2b2ljZUNvbnRyb2xsZXIuc2V0T21uaUlucHV0QWN0aXZlKG9tbmlIYXNGb2N1cyk7XG5cdFx0aWYgKG9tbmlIYXNGb2N1cykge1xuXHRcdFx0dm9pY2VDb250cm9sbGVyLnNldERyYWZ0VGFyZ2V0KCk7XG5cdFx0fSBlbHNlIGlmIChjdXJyZW50U2Vzc2lvbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoY3VycmVudFNlc3Npb24pO1xuXHRcdFx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lID09PSAnc2Vzc2lvbnMtdm9pY2UnKSB7XG5cdFx0XHRcdFx0dm9pY2VDb250cm9sbGVyLnNldERyYWZ0VGFyZ2V0KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dm9pY2VDb250cm9sbGVyLnNldFRhcmdldFNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHRcdHZvaWNlQ29udHJvbGxlci5hY3RpdmF0ZVNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gVGhlIHJvdXRpbmcgY29tbWFuZCBvd25zIHZhbGlkYXRpb247IGxlYXZlIHRoZSBjdXJyZW50IHRhcmdldCB1bmNoYW5nZWQuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSBzZXNzaW9uIGlzIGNvbm5lY3RlZCBiZWZvcmUgd2Ugc3RhcnQgcmVjb3JkaW5nLiBUaGUgbWljXG5cdFx0Ly8gYnV0dG9uJ3MgZmlyc3QgcHJlc3MgY29ubmVjdHM7IGEgaGVsZCBrZXliaW5kaW5nIGFsc28gY29ubmVjdHMgaGVyZSBzb1xuXHRcdC8vIHRoYXQgcHJlc3MtYW5kLWhvbGQgd29ya3Mgb24gdGhlIHZlcnkgZmlyc3QgaW52b2NhdGlvbi4gSWYgdGhlIHVzZXJcblx0XHQvLyByZWxlYXNlcyB0aGUga2V5IHdoaWxlIHdlJ3JlIHN0aWxsIGNvbm5lY3RpbmcsIGBob2xkTW9kZWAgcmVzb2x2ZXNcblx0XHQvLyBlYXJseSBhbmQgdGhlIGF3YWl0ZWQgcmVsZWFzZSBiZWxvdyBmaXJlcyByaWdodCBhZnRlciBwdHREb3duKCkgXHUyMDE0IHRoZVxuXHRcdC8vIGNvbnRyb2xsZXIgdGhlbiB0cmVhdHMgaXQgYXMgYSBxdWljayB0YXAgKHRvZ2dsZSBvbikuXG5cdFx0Y29uc3Qgd2FzQ29ubmVjdGVkID0gdm9pY2VDb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpO1xuXHRcdGlmICghd2FzQ29ubmVjdGVkKSB7XG5cdFx0XHRhd2FpdCB2b2ljZUNvbnRyb2xsZXIuY29ubmVjdChhY3RpdmVXaW5kb3cpO1xuXHRcdH1cblxuXHRcdGlmICghaG9sZE1vZGUgJiYgIWhhbmRzRnJlZSAmJiAhd2FzQ29ubmVjdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTWFwIHRoZSBwaHlzaWNhbCBrZXkvYnV0dG9uIGdlc3R1cmUgZGlyZWN0bHkgb250byB0aGUgY29udHJvbGxlcidzXG5cdFx0Ly8gcHVzaC10by10YWxrIG1vZGVsOiBwcmVzcyA9PiBwdHREb3duKCksIHJlbGVhc2UgPT4gcHR0VXAoKS4gVGhlXG5cdFx0Ly8gY29udHJvbGxlciBpdHNlbGYgZGVjaWRlcyB0YXAtdnMtaG9sZCBiYXNlZCBvbiBob3cgbG9uZyB0aGUga2V5IHdhc1xuXHRcdC8vIGhlbGQgKGEgcXVpY2sgdGFwIGVudGVycyB0b2dnbGUgbW9kZSBhbmQga2VlcHMgcmVjb3JkaW5nOyBhIHJlYWwgaG9sZFxuXHRcdC8vIHJlY29yZHMgb25seSB3aGlsZSBoZWxkKS4gYGVuYWJsZUtleWJpbmRpbmdIb2xkTW9kZWAgYWxzbyBzd2FsbG93cyBPU1xuXHRcdC8vIGtleS1yZXBlYXQgd2hpbGUgaGVsZCwgc28gaG9sZGluZyB0aGUgc2hvcnRjdXQgbm8gbG9uZ2VyIHJhcGlkbHlcblx0XHQvLyB0b2dnbGVzLlxuXHRcdHZvaWNlQ29udHJvbGxlci5wdHREb3duKCk7XG5cdFx0aWYgKCFob2xkTW9kZSkge1xuXHRcdFx0Ly8gTm90IGludm9rZWQgdmlhIGEgaGVsZCBrZXliaW5kaW5nICh0b29sYmFyIG1pYyBidXR0b24gb3IgY29tbWFuZFxuXHRcdFx0Ly8gcGFsZXR0ZSk6IGVtdWxhdGUgYSB0YXAgc28gdGhlIGNvbnRyb2xsZXIgZW50ZXJzIHRvZ2dsZSBtb2RlIGFuZFxuXHRcdFx0Ly8ga2VlcHMgbGlzdGVuaW5nLiBQcmVzc2luZyB0aGUgYnV0dG9uL3Nob3J0Y3V0IGFnYWluIHN0b3BzLlxuXHRcdFx0dm9pY2VDb250cm9sbGVyLnB0dFVwKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgaG9sZE1vZGU7XG5cdFx0dm9pY2VDb250cm9sbGVyLnB0dFVwKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudHNWb2ljZS5wdHRTdG9wSW5DaGF0Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhZ2VudHNWb2ljZS5wdHRTdG9wSW5DaGF0JywgXCJWb2ljZSBNb2RlOiBTdG9wIFJlY29yZGluZ1wiKSxcblx0XHRcdGljb246IENvZGljb24udm9pY2VNb2RlQ29tcGFjdCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRBR0VOVFNfVk9JQ0VfRU5BQkxFRCxcblx0XHRcdFx0QUdFTlRTX1ZPSUNFX0xJU1RFTklORy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0U2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsSW5hY3RpdmUsXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0VOQUJMRUQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtBZ2VudHNWb2ljZVNldHRpbmdJZC5TaG93QnV0dG9ufWAsIGZhbHNlKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdEFHRU5UU19WT0lDRV9MSVNURU5JTkcuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRcdFZPSUNFX0FDVElWRV9PTl9TVVJGQUNFLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTEwXG5cdFx0XHR9LFxuXHRcdFx0Ly8gTk9URTogaW50ZW50aW9uYWxseSBubyBrZXliaW5kaW5nLiBUaGUgQ21kK1NoaWZ0K1NwYWNlIGNob3JkIGlzXG5cdFx0XHQvLyBvd25lZCBzb2xlbHkgYnkgYGFnZW50c1ZvaWNlLnN0YXJ0Vm9pY2VJbkNoYXRgLCB3aGljaCBoYW5kbGVzIGJvdGhcblx0XHRcdC8vIHN0YXJ0aW5nIGFuZCBzdG9wcGluZyAodmlhIHRoZSBjb250cm9sbGVyJ3MgcHVzaC10by10YWxrIG1vZGVsKS5cblx0XHRcdC8vIEJpbmRpbmcgdGhlIHNhbWUgY2hvcmQgaGVyZSBhcyB3ZWxsIGNhdXNlZCB0aGUgdHdvIGFjdGlvbnMgdG9cblx0XHRcdC8vIGZpZ2h0IG9uIGV2ZXJ5IE9TIGtleS1yZXBlYXQsIHByb2R1Y2luZyByYXBpZCBzdGFydC9zdG9wIHRvZ2dsaW5nLlxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZvaWNlQ29udHJvbGxlciA9IGFjY2Vzc29yLmdldChJVm9pY2VTZXNzaW9uQ29udHJvbGxlcik7XG5cdFx0Ly8gU3RvcCByZWNvcmRpbmcgYW5kIHRoZSBhdXRvLWxpc3RlbiBsb29wIGJ1dCBrZWVwIHRoZSBXZWJTb2NrZXRcblx0XHQvLyBjb25uZWN0ZWQgc28gdGhlIHVzZXIgY2FuIHJlc3VtZSB3aXRob3V0IHJlY29ubmVjdGluZy4gVXNlIHRoZVxuXHRcdC8vIHNlcGFyYXRlIFwiRGlzY29ubmVjdCBWb2ljZSBNb2RlXCIgYnV0dG9uIHRvIGZ1bGx5IGVuZCB0aGUgc2Vzc2lvbi5cblx0XHR2b2ljZUNvbnRyb2xsZXIuc3RvcExpc3RlbmluZygpO1xuXHR9XG59KTtcblxuLy8gLS0tIERpc2Nvbm5lY3QgVm9pY2UgKGNvbW1hbmQgcGFsZXR0ZSArIHNlcGFyYXRlIHRvb2xiYXIgYnV0dG9uIHdoZW4gY29ubmVjdGVkKSAtLS1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRzVm9pY2UuZGlzY29ubmVjdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2UuZGlzY29ubmVjdCcsIFwiRGlzY29ubmVjdCBWb2ljZSBNb2RlXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5kZWJ1Z0Rpc2Nvbm5lY3RDb21wYWN0LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0QUdFTlRTX1ZPSUNFX0VOQUJMRUQsXG5cdFx0XHRcdEFHRU5UU19WT0lDRV9DT05ORUNURUQuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0KSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RXhlY3V0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7QWdlbnRzVm9pY2VTZXR0aW5nSWQuU2hvd0J1dHRvbn1gLCBmYWxzZSksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5uZWdhdGUoKSxcblx0XHRcdFx0XHRBR0VOVFNfVk9JQ0VfQ09OTkVDVEVELmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0XHRWT0lDRV9BQ1RJVkVfT05fU1VSRkFDRSxcblx0XHRcdFx0XHQvLyBUaGUgc2VnbWVudGVkIHZvaWNlIHBpbGwncyB2b2ljZSBjZWxsIGlzIGl0c2VsZiB0aGUgb24vb2ZmIHRvZ2dsZSxcblx0XHRcdFx0XHQvLyBzbyBhIHNlcGFyYXRlIGRpc2Nvbm5lY3QgYnV0dG9uIHdvdWxkIGJlIHJlZHVuZGFudCB0aGVyZS5cblx0XHRcdFx0XHRTZWdtZW50ZWRWb2ljZUlucHV0TW9kZVBpbGxJbmFjdGl2ZSxcblx0XHRcdFx0KSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IC05XG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHQvLyBLZWVwIHRoaXMgYmVsb3cgdGhlIGVkaXRvciB3aWRnZXRzIGFuZCBuZWdhdGUgdGhlaXIgY29udGV4dHMgc29cblx0XHRcdFx0Ly8gRXNjYXBlIHN0aWxsIGRpc21pc3NlcyBJbnRlbGxpU2Vuc2UvaG92ZXIgYW5kIGNsZWFycyBzZWxlY3Rpb25zXG5cdFx0XHRcdC8vIHdoaWxlIHRoZSB1c2VyIGlzIHR5cGluZyBpbiB0aGUgY2hhdCBpbnB1dC5cblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgLSA1LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCxcblx0XHRcdFx0XHRBR0VOVFNfVk9JQ0VfQ09OTkVDVEVELmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0XHRWT0lDRV9BQ1RJVkVfT05fU1VSRkFDRSxcblx0XHRcdFx0XHQvLyBEb24ndCBkaXNjb25uZWN0IHZvaWNlIHdoaWxlIGEgcmVxdWVzdCBpcyBydW5uaW5nIFx1MjAxNCBwcmVzc2luZ1xuXHRcdFx0XHRcdC8vIEVzY2FwZSB0aGVyZSBpcyBtZWFudCB0byBpbnRlcnJ1cHQvY2FuY2VsIHRoYXQgcmVxdWVzdCwgbm90XG5cdFx0XHRcdFx0Ly8gdGVhciBkb3duIHRoZSB2b2ljZSBzZXNzaW9uICh3aGljaCBpcyBlc3BlY2lhbGx5IGRpc3J1cHRpdmVcblx0XHRcdFx0XHQvLyBpbiBoYW5kcy1mcmVlIG1vZGUgd2hlcmUgdGhlcmUgaXMgbm8gcmVjb25uZWN0IGJ1dHRvbikuXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmhhc0FjdGl2ZVJlcXVlc3QubmVnYXRlKCksXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaG92ZXJWaXNpYmxlLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc011bHRpcGxlU2VsZWN0aW9ucy50b05lZ2F0ZWQoKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdm9pY2VDb250cm9sbGVyID0gYWNjZXNzb3IuZ2V0KElWb2ljZVNlc3Npb25Db250cm9sbGVyKTtcblx0XHR2b2ljZUNvbnRyb2xsZXIuZGlzY29ubmVjdCgnZXhwbGljaXQnKTtcblx0fVxufSk7XG5cbi8vIC0tLSBDYW5jZWwgQWN0aXZlIFJlcXVlc3QgdmlhIEVzY2FwZSAod2hpbGUgdm9pY2UtY29ubmVjdGVkIGluIHRoZSBjaGF0IGlucHV0KSAtLS1cbi8vXG4vLyBUaGUgRGlzY29ubmVjdC1vbi1Fc2NhcGUgYWN0aW9uIGFib3ZlIGRlbGliZXJhdGVseSBkb2VzIE5PVEhJTkcgd2hpbGUgYVxuLy8gcmVxdWVzdCBpcyBydW5uaW5nIChpdHMgYHdoZW5gIG5lZ2F0ZXMgaGFzQWN0aXZlUmVxdWVzdCkgc28gaXQgZG9lc24ndCB0ZWFyXG4vLyBkb3duIHRoZSB2b2ljZSBzZXNzaW9uIG1pZC10dXJuLiBCdXQgdGhlIGJ1aWx0LWluIENhbmNlbCBhY3Rpb24gaXMgYm91bmQgdG9cbi8vIENtZC9DdHJsK0VzY2FwZSAoQWx0K0JhY2tzcGFjZSBvbiBXaW5kb3dzKSwgc28gcGxhaW4gRXNjYXBlIHdvdWxkIG90aGVyd2lzZVxuLy8gYmUgYSBuby1vcCB0aGVyZS4gUmVzdG9yZSB0aGUgZXhwZWN0ZWQgYmVoYXZpb3I6IHBsYWluIEVzY2FwZSBjYW5jZWxzIHRoZVxuLy8gaW4tZmxpZ2h0IHJlcXVlc3Qgd2hpbGUgbGVhdmluZyB0aGUgaWRsZS1vbmx5IGRpc2Nvbm5lY3QgaW50YWN0LlxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudHNWb2ljZS5jYW5jZWxBY3RpdmVSZXF1ZXN0Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhZ2VudHNWb2ljZS5jYW5jZWxBY3RpdmVSZXF1ZXN0JywgXCJWb2ljZSBNb2RlOiBDYW5jZWwgUmVxdWVzdFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgLSA1LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCxcblx0XHRcdFx0XHRBR0VOVFNfVk9JQ0VfQ09OTkVDVEVELmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0XHQvLyBNaXJyb3IgdGhlIGRpc2Nvbm5lY3QgYmluZGluZydzIGVkaXRvciBuZWdhdGlvbnMgc28gRXNjYXBlXG5cdFx0XHRcdFx0Ly8gc3RpbGwgZGlzbWlzc2VzIEludGVsbGlTZW5zZS9ob3ZlciBhbmQgY2xlYXJzIHNlbGVjdGlvbnMgZmlyc3QuXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmhhc0FjdGl2ZVJlcXVlc3QsXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaG92ZXJWaXNpYmxlLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc011bHRpcGxlU2VsZWN0aW9ucy50b05lZ2F0ZWQoKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jYW5jZWwnKTtcblx0fVxufSk7XG5cbi8vIC0tLSBPcGVuIFZvaWNlIE1vZGUgU2V0dGluZ3MgLS0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50c1ZvaWNlLm9wZW5TZXR0aW5ncycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2Uub3BlblNldHRpbmdzJywgXCJWb2ljZSBNb2RlIFNldHRpbmdzXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgeyBxdWVyeTogJ2FnZW50cy52b2ljZScgfSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNIT1dfVk9JQ0VfTU9ERV9PTkJPQVJESU5HX0NPTU1BTkQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2Uuc2hvd09uYm9hcmRpbmcnLCBcIlZvaWNlIE1vZGU6IFNob3cgSW50cm9kdWN0aW9uXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0aWYgKCFhY2Nlc3Nvci5nZXQoSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlKS5zaG93KCkpIHtcblx0XHRcdGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSkuaW5mbyhubHMubG9jYWxpemUoJ2FnZW50c1ZvaWNlLm9uYm9hcmRpbmdOZWVkc0NoYXQnLCBcIk9wZW4gYSBjaGF0IHRvIHNlZSB0aGUgVm9pY2UgTW9kZSBpbnRyb2R1Y3Rpb24uXCIpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyAtLS0gU2ltdWxhdGUgVm9pY2UgQ29ubmVjdGlvbiAoZGV2IHV0aWxpdHksIGJhY2tlbmQgZG93bikgLS0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50c1ZvaWNlLnNpbXVsYXRlQ29ubmVjdGlvbicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2Uuc2ltdWxhdGVDb25uZWN0aW9uJywgXCJWb2ljZTogU2ltdWxhdGUgQ29ubmVjdGlvbiAoRGV2KVwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZvaWNlQ29udHJvbGxlciA9IGFjY2Vzc29yLmdldChJVm9pY2VTZXNzaW9uQ29udHJvbGxlcik7XG5cdFx0dm9pY2VDb250cm9sbGVyLnNpbXVsYXRlQ29ubmVjdGlvbigpO1xuXHR9XG59KTtcblxuLy8gLS0tIFJlc2V0IE9uYm9hcmRpbmcgQ29tbWFuZCAoZGV2IHV0aWxpdHkpIC0tLVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudHNWb2ljZS5yZXNldE9uYm9hcmRpbmcnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Jlc2V0QWdlbnRzVm9pY2VPbmJvYXJkaW5nJywgXCJWb2ljZTogUmVzZXQgT25ib2FyZGluZ1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0c3RvcmFnZVNlcnZpY2UucmVtb3ZlKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuT25ib2FyZGluZ0NvbXBsZXRlZCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLkludHJvQmFubmVyU2hvd24sIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cbn0pO1xuXG4vLyAtLS0gUHVzaC10by1UYWxrIENvbW1hbmQgLS0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGsnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FnZW50c1ZvaWNlUHVzaFRvVGFsaycsIFwiVm9pY2UgTW9kZTogUHVzaCB0byBUYWxrXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX1dJREdFVF9GT0NVU0VELFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdCgnaW5wdXRGb2N1cycpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2b2ljZUNvbnRyb2xsZXIgPSBhY2Nlc3Nvci5nZXQoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0XHQvLyBDYXB0dXJlIGhvbGQgbW9kZSBiZWZvcmUgYXdhaXRpbmcgc28gdGhlIGRpc3BhdGNoaW5nIGNvbW1hbmQgaXMgc3RpbGwgYXZhaWxhYmxlLlxuXHRcdGNvbnN0IGhvbGRNb2RlID0ga2V5YmluZGluZ1NlcnZpY2UuZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKCdhZ2VudHNWb2ljZS5wdXNoVG9UYWxrJyk7XG5cblx0XHQvLyBBdXRvLWNvbm5lY3Qgb24gZmlyc3QgUFRUIHByZXNzXG5cdFx0aWYgKCF2b2ljZUNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkgJiYgIXZvaWNlQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCkpIHtcblx0XHRcdGF3YWl0IHZvaWNlQ29udHJvbGxlci5jb25uZWN0KGdldEFjdGl2ZVdpbmRvdygpKTtcblx0XHR9XG5cdFx0aWYgKCF2b2ljZUNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2b2ljZUNvbnRyb2xsZXIucHR0RG93bigpO1xuXG5cdFx0aWYgKCFob2xkTW9kZSkge1xuXHRcdFx0Ly8gTm90IGludm9rZWQgdmlhIGEgaGVsZCBrZXliaW5kaW5nOiBlbXVsYXRlIGEgdGFwIHNvIHRoZSBjb250cm9sbGVyXG5cdFx0XHQvLyBlbnRlcnMgdG9nZ2xlIG1vZGUgYW5kIGtlZXBzIGxpc3RlbmluZy4gUHJlc3NpbmcgYWdhaW4gc3RvcHMuXG5cdFx0XHR2b2ljZUNvbnRyb2xsZXIucHR0VXAoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgc2hvcnRjdXQgaXMgYmVpbmcgaGVsZDogd2FpdCBmb3IgcmVsZWFzZSwgdGhlbiBmaW5pc2ggdGhlIHR1cm4uXG5cdFx0Ly8gVGhlIGNvbnRyb2xsZXIgZGVjaWRlcyB0YXAtdnMtaG9sZCBiYXNlZCBvbiBob3cgbG9uZyBpdCB3YXMgaGVsZC5cblx0XHRhd2FpdCBob2xkTW9kZTtcblx0XHR2b2ljZUNvbnRyb2xsZXIucHR0VXAoKTtcblx0fVxufSk7XG5cbi8vIE1pY3JvcGhvbmUgc2VsZWN0aW9uIGlzIHNoYXJlZCB3aXRoIGRpY3RhdGlvbiB2aWEgdGhlIHNpbmdsZVxuLy8gYHdvcmtiZW5jaC5hY3Rpb24uY2hhdC5zZWxlY3RTcGVlY2hUb1RleHRNaWNyb3Bob25lYCBjb21tYW5kIChzZWVcbi8vIGNoYXRTcGVlY2hUb1RleHRBY3Rpb25zLnRzKSwgc28gVm9pY2UgTW9kZSBubyBsb25nZXIgcmVnaXN0ZXJzIGl0cyBvd24uXG5cbi8vIC0tLSBTZXR0aW5ncyAtLS1cblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdhZ2VudHNWb2ljZScsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2FnZW50c1ZvaWNlQ29uZmlndXJhdGlvblRpdGxlJywgXCJWb2ljZSBNb2RlXCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdCdhZ2VudHMudm9pY2UuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5lbmFibGVkJywgXCJFbmFibGUgdGhlIFZvaWNlIE1vZGUgcGFuZWwgaW4gdGhlIGNoYXQgdmlldyBmb3Igdm9pY2UtZHJpdmVuIGNvZGluZyBjb252ZXJzYXRpb25zLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bycsXG5cdFx0XHR9LFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdH0sXG5cdFx0W0FnZW50c1ZvaWNlU2V0dGluZ0lkLlNob3dCdXR0b25dOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5zaG93QnV0dG9uJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBWb2ljZSBNb2RlIGJ1dHRvbiBpcyBzaG93biBpbiB0aGUgY2hhdCBpbnB1dC4gV2hlbiBoaWRkZW4sIFZvaWNlIE1vZGUgY2FuIHN0aWxsIGJlIHN0YXJ0ZWQgd2l0aCBpdHMga2V5Ym9hcmQgc2hvcnRjdXQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdH0sXG5cdFx0J2FnZW50cy52b2ljZS5iYWNrZW5kVXJsJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UuYmFja2VuZFVybCcsIFwiVm9pY2UgYmFja2VuZCBXZWJTb2NrZXQgVVJMLiBMZWF2ZSBlbXB0eSB0byB1c2UgdGhlIGRlZmF1bHQgaG9zdGVkIGJhY2tlbmQuIFNldCB0byBlLmcuIGB3czovL2xvY2FsaG9zdDo4MDAwL2FwaS92MS9yZWFsdGltZS92b2ljZWAgdG8gcG9pbnQgYXQgYSBiYWNrZW5kIHJ1bm5pbmcgb24geW91ciBtYWNoaW5lLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdGluY2x1ZGVkOiBmYWxzZSxcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2Uuc3BlYWtSZXNwb25zZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5zcGVha1Jlc3BvbnNlcycsIFwiV2hlbiBlbmFibGVkLCB0aGUgYXNzaXN0YW50IHJlYWRzIHJlc3BvbnNlcyBhbG91ZC4gV2hlbiBkaXNhYmxlZCwgcmVzcG9uc2VzIGFyZSBub3Qgc3Bva2VuOyBlbmFibGUgYCNhZ2VudHMudm9pY2Uuc2hvd1RyYW5zY3JpcHQjYCB0byByZWFkIHRoZW0gYXMgYSB0ZXh0IHRyYW5zY3JpcHQgaW5zdGVhZC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHRcdFtWT0lDRV9BR0VOVF9QUk9HUkVTU19TRVRUSU5HXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UuYWdlbnRQcm9ncmVzcycsIFwiQWxsb3cgQWdlbnQgbW9kZSB0byBzcGVhayBicmllZiBzZW1hbnRpYyBwcm9ncmVzcyB1cGRhdGVzIHdoaWxlIGl0IGludmVzdGlnYXRlcywgcGxhbnMsIGVkaXRzLCB2YWxpZGF0ZXMsIG9yIHJlY292ZXJzIGZyb20gYSBwcm9ibGVtLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2Uudm9pY2UnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnaGFycGVyX25ldXRyYWwnLCAnYmlyY2hfbmV1dHJhbCcsICdqdW5ob19uZXV0cmFsJywgJ29ha19uZXV0cmFsJ10sXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogWydIYXJwZXInLCAnQmlyY2gnLCAnSnVuaG8nLCAnT2FrJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLnZvaWNlLmhhcnBlcicsIFwiSGFycGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2Uudm9pY2UuYmlyY2gnLCBcIkJpcmNoLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2Uudm9pY2UuanVuaG8nLCBcIkp1bmhvLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2Uudm9pY2Uub2FrJywgXCJPYWsuXCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLnZvaWNlJywgXCJUaGUgdm9pY2UgdXNlZCB3aGVuIHRoZSBhc3Npc3RhbnQgcmVhZHMgcmVzcG9uc2VzIGFsb3VkLiBDaGFuZ2luZyB0aGlzIHdoaWxlIHZvaWNlIG1vZGUgaXMgY29ubmVjdGVkIHRha2VzIGVmZmVjdCBpbW1lZGlhdGVseS4gVXNlIFtWb2ljZSBNb2RlIGluc3RydWN0aW9uc10oY29tbWFuZDp7MH0pIHRvIGN1c3RvbWl6ZSBWb2ljZSBNb2RlIGJlaGF2aW9yIGFuZCB0ZXJtaW5vbG9neS5cIiwgQ09ORklHVVJFX1ZPSUNFX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQpLFxuXHRcdFx0ZGVmYXVsdDogJ2JpcmNoX25ldXRyYWwnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYXV0bycsICdlbicsICdkZScsICdlcycsICdmcicsICdpdCcsICdwdCcsICdqYScsICdrbycsICd6aCddLFxuXHRcdFx0ZW51bUl0ZW1MYWJlbHM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UuYXV0bycsIFwiQXV0b21hdGljXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZS5lbicsIFwiRW5nbGlzaFwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UuZGUnLCBcIkdlcm1hblwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UuZXMnLCBcIlNwYW5pc2hcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmxhbmd1YWdlLmZyJywgXCJGcmVuY2hcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmxhbmd1YWdlLml0JywgXCJJdGFsaWFuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZS5wdCcsIFwiUG9ydHVndWVzZVwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UuamEnLCBcIkphcGFuZXNlXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZS5rbycsIFwiS29yZWFuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZS56aCcsIFwiQ2hpbmVzZVwiKSxcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZScsIFwiVGhlIGxhbmd1YWdlIHVzZWQgZm9yIHNwZWVjaCByZWNvZ25pdGlvbiwgZGljdGF0aW9uLCBhbmQgc3Bva2VuIHJlc3BvbnNlcy4gVGhlIHNlbGVjdGFibGUgbGFuZ3VhZ2VzIHN1cHBvcnQgbmF0aXZlIHZvaWNlIG91dHB1dC4gQXV0b21hdGljIHVzZXMgdGhlIGNvbmZpZ3VyZWQgZGlzcGxheSBsYW5ndWFnZSBmb3Igc3BlZWNoIHJlY29nbml0aW9uIGFuZCBkaWN0YXRpb24gd2hlbiBzdXBwb3J0ZWQ7IG90aGVyd2lzZSwgaXQgZm9sbG93cyB0aGUgc3lzdGVtIG9yIGJyb3dzZXIgbG9jYWxlLiBFbmdsaXNoIHZvaWNlIG91dHB1dCBpcyB1c2VkIHdoZW4gdGhlIGRldGVjdGVkIGxhbmd1YWdlIGRvZXMgbm90IHN1cHBvcnQgbmF0aXZlIHZvaWNlIG91dHB1dC4gQ2hhbmdpbmcgdGhpcyB3aGlsZSB2b2ljZSBtb2RlIGlzIGNvbm5lY3RlZCB0YWtlcyBlZmZlY3QgaW1tZWRpYXRlbHkuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2F1dG8nLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2Uuc2hvd1RyYW5zY3JpcHQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5zaG93VHJhbnNjcmlwdCcsIFwiU2hvdyB0aGUgdm9pY2UgdHJhbnNjcmlwdCBvdmVybGF5IGluIHRoZSBjaGF0IGlucHV0IGFyZWEgd2hpbGUgdm9pY2UgbW9kZSBpcyBhY3RpdmUuIEVuYWJsZSB0aGlzIHRvIHJlYWQgcmVzcG9uc2VzIGFzIHRleHQgd2hlbiBgI2FnZW50cy52b2ljZS5zcGVha1Jlc3BvbnNlcyNgIGlzIGRpc2FibGVkLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2UubGl2ZVRyYW5zY3JpcHQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5saXZlVHJhbnNjcmlwdCcsIFwiU2hvdyB5b3VyIHNwZWVjaCBhcyBhIGxpdmUsIHdvcmQtYnktd29yZCB0cmFuc2NyaXB0IHdoaWxlIHlvdSBhcmUgc3BlYWtpbmcuIFdoZW4gZGlzYWJsZWQsIHlvdXIgdHJhbnNjcmlwdCBhcHBlYXJzIG9ubHkgb25jZSB5b3UgZmluaXNoIHNwZWFraW5nLiBSZXF1aXJlcyBgI2FnZW50cy52b2ljZS5zaG93VHJhbnNjcmlwdCNgIHRvIGJlIGVuYWJsZWQgdG8gYmUgdmlzaWJsZS5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0fSxcblx0XHQnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZScsIFwiV2hlbiBlbmFibGVkLCB2b2ljZSBtb2RlIGF1dG9tYXRpY2FsbHkgcmUtZW50ZXJzIGxpc3RlbmluZyBhZnRlciB0aGUgYXNzaXN0YW50IGZpbmlzaGVzIHNwZWFraW5nLCBzbyB5b3UgY2FuIGhvbGQgYSBoYW5kcy1mcmVlIGJhY2stYW5kLWZvcnRoIGNvbnZlcnNhdGlvbi4gV2hlbiBkaXNhYmxlZCwgeW91IHN0YXJ0IGFuZCBlbmQgZWFjaCB0dXJuIG1hbnVhbGx5LCBhbmQgZW5kaW5nIHRoZSB0dXJuIHNlbmRzIGl0LiBUdXJucyBhcmUgbm90IGVuZGVkIGF1dG9tYXRpY2FsbHkgb24gdHJhaWxpbmcgc2lsZW5jZSBvciBhIHN0b3AgcGhyYXNlIHVubGVzcyB7MH0gb3IgezF9IGlzIGV4cGxpY2l0bHkgY29uZmlndXJlZC5cIiwgJ2AjYWdlbnRzLnZvaWNlLnR1cm4uc2lsZW5jZU1zI2AnLCAnYCNhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcyNgJyksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2UudHVybi5zaWxlbmNlTXMnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLnR1cm4uc2lsZW5jZU1zJywgXCJUcmFpbGluZyBzaWxlbmNlIGluIG1pbGxpc2Vjb25kcyBiZWZvcmUgdGhlIGJhY2tlbmQgZW5kcyB0aGUgdHVybiBhdXRvbWF0aWNhbGx5LiBTZXQgdG8gYC0xYCB0byBkaXNhYmxlIGVuZGluZyB0aGUgdHVybiBvbiBzaWxlbmNlLCBpbiB3aGljaCBjYXNlIHRoZSB0dXJuIGVuZHMgb25seSB2aWEgYSBzdG9wIHBocmFzZSAoezB9KSBvciBtYW51YWxseS4gV2hlbiBlbmFibGVkLCB0aGUgYmFja2VuZCBjbGFtcHMgdGhpcyB0byBpdHMgc3VwcG9ydGVkIHJhbmdlIChjdXJyZW50bHkgMjAwLTUwMDAgbXMpIGFuZCBpcyB0aGUgc291cmNlIG9mIHRydXRoLiBXaGVuIGhhbmRzLWZyZWUgbW9kZSAoezF9KSBpcyBkaXNhYmxlZCwgdGhlIHR1cm4gaXMgbm90IGVuZGVkIG9uIHNpbGVuY2UgYnkgZGVmYXVsdCB1bmxlc3MgdGhpcyBzZXR0aW5nIGlzIGV4cGxpY2l0bHkgY29uZmlndXJlZCwgc28geW91IGtlZXAgbWFudWFsIGNvbnRyb2wgb3ZlciB3aGVuIGEgdHVybiBpcyBzZW50LlwiLCAnYCNhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcyNgJywgJ2AjYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSNgJyksXG5cdFx0XHRkZWZhdWx0OiA4MDAsXG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29uc3Q6IC0xLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS50dXJuLnNpbGVuY2VNcy5kaXNhYmxlZCcsIFwiRG8gbm90IGVuZCB0aGUgdHVybiBvbiB0cmFpbGluZyBzaWxlbmNlLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdG1pbmltdW06IDIwMCxcblx0XHRcdFx0XHRtYXhpbXVtOiA1MDAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0fSxcblx0XHQnYWdlbnRzLnZvaWNlLnR1cm4uc3RvcFBocmFzZXMnOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLnR1cm4uc3RvcFBocmFzZXMnLCBcIlBocmFzZXMgdGhhdCBlbmQgdGhlIHR1cm4gd2hlbiBzcG9rZW4gYXQgdGhlIGVuZCBvZiBhbiB1dHRlcmFuY2UuIExlYXZlIGVtcHR5IHRvIGRpc2FibGUgZW5kaW5nIHRoZSB0dXJuIG9uIGEgc3RvcCBwaHJhc2UsIGluIHdoaWNoIGNhc2UgdGhlIHR1cm4gZW5kcyBvbmx5IG9uIHRyYWlsaW5nIHNpbGVuY2UgKHswfSkgb3IgbWFudWFsbHkuIFRoZSBiYWNrZW5kIHN0cmlwcyB0aGUgbWF0Y2hlZCBwaHJhc2UgZnJvbSB0aGUgdHJhbnNjcmlwdCBiZWZvcmUgaXQgcmVhY2hlcyB0aGUgYWdlbnQuIFdoZW4gaGFuZHMtZnJlZSBtb2RlICh7MX0pIGlzIGRpc2FibGVkLCBzdG9wIHBocmFzZXMgZG8gbm90IGVuZCB0aGUgdHVybiBieSBkZWZhdWx0IHVubGVzcyB0aGlzIHNldHRpbmcgaXMgZXhwbGljaXRseSBjb25maWd1cmVkLCBzbyB5b3Uga2VlcCBtYW51YWwgY29udHJvbCBvdmVyIHdoZW4gYSB0dXJuIGlzIHNlbnQuXCIsICdgI2FnZW50cy52b2ljZS50dXJuLnNpbGVuY2VNcyNgJywgJ2AjYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSNgJyksXG5cdFx0XHRkZWZhdWx0OiBbJ3NlbmQgaXQnXSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0fSxcblx0fVxufSk7XG5cbi8vIE1pZ3JhdGUgdGhlIHJlbW92ZWQgYGFnZW50cy52b2ljZS50dXJuLmF1dG9FbmRNb2RlYCBzZXR0aW5nIG9udG8gdGhlIHR3b1xuLy8gc2V0dGluZ3MgdGhhdCBub3cgZ292ZXJuIHR1cm4tZW5kaW5nLCBwcmVzZXJ2aW5nIHRoZSBwcmV2aW91cyBiZWhhdmlvcjpcbi8vIHNpbGVuY2UgZW5kaW5nIGlzIGRpc2FibGVkIChgc2lsZW5jZU1zOiAtMWApIHVubGVzcyB0aGUgb2xkIG1vZGUgd2FzIGB2YWRgXG4vLyBvciBgYm90aGAsIGFuZCBzdG9wLXBocmFzZSBlbmRpbmcgaXMgZGlzYWJsZWQgKGBzdG9wUGhyYXNlczogW11gKSB1bmxlc3MgdGhlXG4vLyBvbGQgbW9kZSB3YXMgYHBocmFzZWAgb3IgYGJvdGhgLlxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeT4oV29ya2JlbmNoQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdhZ2VudHMudm9pY2Uudm9pY2UnLFxuXHRcdGluY2x1ZGVBcHBsaWNhdGlvbjogdHJ1ZSxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93bikgPT4gKHsgdmFsdWU6IG5vcm1hbGl6ZUFnZW50c1ZvaWNlSWQodmFsdWUpIH0pLFxuXHR9LCB7XG5cdFx0a2V5OiAnYWdlbnRzLnZvaWNlLnR1cm4uYXV0b0VuZE1vZGUnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzID0gW1snYWdlbnRzLnZvaWNlLnR1cm4uYXV0b0VuZE1vZGUnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV1dO1xuXHRcdFx0aWYgKHZhbHVlID09PSAnb2ZmJyB8fCB2YWx1ZSA9PT0gJ3ZhZCcgfHwgdmFsdWUgPT09ICdwaHJhc2UnIHx8IHZhbHVlID09PSAnYm90aCcpIHtcblx0XHRcdFx0Y29uc3Qgc2lsZW5jZUVuYWJsZWQgPSB2YWx1ZSA9PT0gJ3ZhZCcgfHwgdmFsdWUgPT09ICdib3RoJztcblx0XHRcdFx0Y29uc3QgcGhyYXNlRW5hYmxlZCA9IHZhbHVlID09PSAncGhyYXNlJyB8fCB2YWx1ZSA9PT0gJ2JvdGgnO1xuXHRcdFx0XHRpZiAoIXNpbGVuY2VFbmFibGVkKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goWydhZ2VudHMudm9pY2UudHVybi5zaWxlbmNlTXMnLCB7IHZhbHVlOiAtMSB9XSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFwaHJhc2VFbmFibGVkKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goWydhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcycsIHsgdmFsdWU6IFtdIH1dKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1dKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyx5QkFBeUIsdUJBQXVC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
