import assert from "assert";
import * as dom from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AgentsVoiceStorageKeys } from "../../common/agentsVoice.js";
import { IVoiceSessionController } from "../../../chat/browser/voiceClient/voiceSessionController.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { VoiceModeOnboardingBanner, VoiceModeOnboardingService } from "../../browser/voiceModeOnboarding.js";
import { isChatInputStackSlotShowing } from "../../../chat/browser/widget/input/chatInputStack.js";
suite("Voice Mode onboarding", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class TestTelemetryService extends NullTelemetryServiceShape {
    constructor(events) {
      super();
      this.events = events;
    }
    publicLog2(eventName, data) {
      if (eventName) {
        this.events.push({ name: eventName, data });
      }
    }
  }
  function createHost(store) {
    const root = dom.$("div");
    root.tabIndex = 0;
    const container = dom.append(root, dom.$(".voice-mode-onboarding-container"));
    document.body.appendChild(root);
    store.add(toDisposable(() => root.remove()));
    return { root, container, focused: 0 };
  }
  function register(service, host) {
    return service.registerHost({
      container: host.container,
      focusRoot: host.root,
      focus: () => {
        host.focused++;
        host.root.focus();
      }
    });
  }
  function createTestInstantiationService(store, screenReaderOptimized = false) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(IAccessibilityService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeScreenReaderOptimized = Event.None;
        this.onDidChangeReducedMotion = Event.None;
      }
      isScreenReaderOptimized() {
        return screenReaderOptimized;
      }
      isMotionReduced() {
        return false;
      }
    }());
    return instantiationService;
  }
  function createService(store, executed = [], holds = [], telemetryEvents = [], screenReaderOptimized = false) {
    const instantiationService = createTestInstantiationService(store, screenReaderOptimized);
    instantiationService.stub(ICommandService, new class extends mock() {
      executeCommand(id) {
        executed.push(id);
        return Promise.resolve(void 0);
      }
    }());
    instantiationService.stub(IVoiceSessionController, new class extends mock() {
      constructor() {
        super(...arguments);
        this.voiceState = constObservable("idle");
      }
      setAutoListenHeld(held) {
        holds.push(held);
      }
      stopListening() {
      }
      pttDown() {
      }
      pttUp() {
      }
    }());
    instantiationService.stub(ITelemetryService, new TestTelemetryService(telemetryEvents));
    return store.add(instantiationService.createInstance(VoiceModeOnboardingService));
  }
  test("auditions a voice, dismisses, and never returns", () => {
    const telemetryEvents = [];
    const service = createService(disposables, [], [], telemetryEvents);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const shown = isChatInputStackSlotShowing(host.container);
    const selectedOnOpen = host.container.querySelectorAll(".voice-mode-onboarding-voice.selected").length;
    const voices = [...host.container.querySelectorAll(".voice-mode-onboarding-voice-label")].map((element) => element.textContent);
    const voicesLabel = host.container.querySelector(".voice-mode-onboarding-voices-label")?.textContent;
    const microphonePicker = host.container.querySelector(".voice-mode-onboarding-microphone-picker");
    const microphonePickerHidden = microphonePicker?.hidden;
    const microphonePickerDisplay = microphonePicker && dom.getWindow(microphonePicker).getComputedStyle(microphonePicker).display;
    host.container.querySelector(".voice-mode-onboarding-voice").click();
    const selectedAfterPick = host.container.querySelectorAll(".voice-mode-onboarding-voice.selected").length;
    host.container.querySelector(".voice-mode-onboarding-close").click();
    const shownAfterClose = isChatInputStackSlotShowing(host.container);
    service.showIfNeeded();
    const shownAgain = isChatInputStackSlotShowing(host.container);
    assert.deepStrictEqual(
      {
        shown,
        microphonePickerHidden,
        microphonePickerDisplay,
        selectedOnOpen,
        voices,
        voicesLabel,
        selectedAfterPick,
        shownAfterClose,
        shownAgain,
        telemetryEvents
      },
      {
        shown: true,
        microphonePickerHidden: true,
        microphonePickerDisplay: "none",
        selectedOnOpen: 0,
        voices: ["Birch (Default)", "Harper", "Oak", "Junho"],
        voicesLabel: "Agent Voice:",
        selectedAfterPick: 1,
        shownAfterClose: false,
        shownAgain: false,
        telemetryEvents: [
          { name: "voiceModeOnboarding.action", data: { action: "shown", source: "automatic" } },
          { name: "voiceModeOnboarding.action", data: { action: "selectVoice", source: "automatic" } },
          { name: "voiceModeOnboarding.action", data: { action: "close", source: "automatic" } }
        ]
      }
    );
  });
  test("clicking the playing voice stops its preview without changing the selection", () => {
    const instantiationService = createTestInstantiationService(disposables);
    const audio = document.createElement("audio");
    let playCount = 0;
    let pauseCount = 0;
    audio.play = () => {
      playCount++;
      return Promise.resolve();
    };
    audio.pause = () => pauseCount++;
    const host = createHost(disposables);
    disposables.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
      container: host.container,
      onDismiss: () => void 0,
      source: "manual",
      audioFactory: () => audio
    }));
    const defaultVoiceOption = host.container.querySelector(".voice-mode-onboarding-voice");
    defaultVoiceOption.click();
    const playingAfterFirstClick = defaultVoiceOption.classList.contains("playing");
    const ariaLabelAfterFirstClick = defaultVoiceOption.getAttribute("aria-label");
    defaultVoiceOption.click();
    assert.deepStrictEqual(
      {
        label: defaultVoiceOption.querySelector(".voice-mode-onboarding-voice-label")?.textContent,
        playCount,
        pauseCount,
        playingAfterFirstClick,
        ariaLabelAfterFirstClick,
        playingAfterSecondClick: defaultVoiceOption.classList.contains("playing"),
        ariaLabelAfterSecondClick: defaultVoiceOption.getAttribute("aria-label"),
        selectedAfterSecondClick: defaultVoiceOption.classList.contains("selected")
      },
      {
        label: "Birch (Default)",
        playCount: 1,
        pauseCount: 1,
        playingAfterFirstClick: true,
        ariaLabelAfterFirstClick: "Stop Birch (Default) preview.",
        playingAfterSecondClick: false,
        ariaLabelAfterSecondClick: "Birch (Default). Hear this voice and use it for every conversation.",
        selectedAfterSecondClick: true
      }
    );
  });
  test("previews the native voice per language and keeps the chooser only for English", () => {
    const instantiationService = createTestInstantiationService(disposables);
    const cases = [
      { language: "de-DE", options: 1, chooser: false, sample: "de_marc_neutral.mp3" },
      { language: "es-MX", options: 1, chooser: false, sample: "es-ES_maria_neutral.mp3" },
      { language: "fr-CA", options: 1, chooser: false, sample: "fr_david_neutral.mp3" },
      { language: "it-IT", options: 1, chooser: false, sample: "it_eva_neutral.mp3" },
      { language: "ja-JP", options: 1, chooser: false, sample: "ja_aruha_neutral.mp3" },
      { language: "ko-KR", options: 1, chooser: false, sample: "ko_jiyon_neutral.mp3" },
      { language: "pt-PT", options: 1, chooser: false, sample: "pt-BR_gil_neutral.mp3" },
      { language: "zh-TW", options: 1, chooser: false, sample: "zh_wuzhi_neutral.mp3" },
      { language: "en-GB", options: 4, chooser: true, sample: "maya_neutral.mp3" },
      { language: "is", options: 4, chooser: true, sample: "maya_neutral.mp3" }
    ];
    const actual = [];
    for (const { language } of cases) {
      const host = createHost(disposables);
      const audio = document.createElement("audio");
      audio.play = () => Promise.resolve();
      disposables.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
        container: host.container,
        onDismiss: () => void 0,
        source: "manual",
        audioFactory: () => audio,
        voiceLanguage: language
      }));
      const options = host.container.querySelectorAll(".voice-mode-onboarding-voice").length;
      const chooser = !!host.container.querySelector('.voice-mode-onboarding-voices[role="radiogroup"]');
      host.container.querySelector(".voice-mode-onboarding-voice").click();
      const sample = audio.src.split(/[?#]/)[0].split("/").pop() ?? "";
      actual.push({ language, options, chooser, sample });
    }
    assert.deepStrictEqual(actual, cases);
  });
  test("swaps the chips when the spoken language changes", () => {
    const instantiationService = createTestInstantiationService(disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration("agents.voice.language", "en");
    instantiationService.stub(IConfigurationService, configurationService);
    const host = createHost(disposables);
    const audio = document.createElement("audio");
    audio.play = () => Promise.resolve();
    disposables.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
      container: host.container,
      onDismiss: () => void 0,
      source: "manual",
      audioFactory: () => audio
    }));
    const countVoices = () => host.container.querySelectorAll(".voice-mode-onboarding-voice").length;
    const englishOptions = countVoices();
    configurationService.setUserConfiguration("agents.voice.language", "zh");
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set(["agents.voice.language"]),
      change: { keys: ["agents.voice.language"], overrides: [] },
      affectsConfiguration: (candidate) => candidate === "agents.voice.language"
    });
    const chineseOptions = countVoices();
    host.container.querySelector(".voice-mode-onboarding-voice").click();
    const chineseSample = audio.src.split(/[?#]/)[0].split("/").pop() ?? "";
    assert.deepStrictEqual(
      { englishOptions, chineseOptions, chineseSample },
      { englishOptions: 4, chineseOptions: 1, chineseSample: "zh_wuzhi_neutral.mp3" }
    );
  });
  test("can be shown again manually", () => {
    const telemetryEvents = [];
    const service = createService(disposables, [], [], telemetryEvents);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    const shown = service.show();
    host.container.querySelector(".voice-mode-onboarding-close").click();
    assert.deepStrictEqual(
      { shown, telemetryEvents },
      {
        shown: true,
        telemetryEvents: [
          { name: "voiceModeOnboarding.action", data: { action: "shown", source: "manual" } },
          { name: "voiceModeOnboarding.action", data: { action: "close", source: "manual" } }
        ]
      }
    );
  });
  test("can be dismissed without choosing a voice", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    host.container.querySelector(".voice-mode-onboarding-close").click();
    assert.strictEqual(isChatInputStackSlotShowing(host.container), false);
  });
  test("places the introduction in the tab order", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.show();
    const card = host.container.querySelector(".voice-mode-onboarding-banner");
    assert.deepStrictEqual(
      {
        activeElement: document.activeElement,
        card,
        tabIndex: card?.tabIndex,
        closeIcon: host.container.querySelector(".voice-mode-onboarding-close")?.className,
        listeningNotice: host.container.querySelector(".voice-mode-onboarding-listening-notice")
      },
      {
        activeElement: document.body,
        card,
        tabIndex: 0,
        closeIcon: "action-label codicon codicon-close-compact voice-mode-onboarding-close chat-input-notice-dismiss",
        listeningNotice: null
      }
    );
  });
  test("asking twice in one session leaves exactly one card", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    service.showIfNeeded();
    assert.deepStrictEqual(
      {
        visible: isChatInputStackSlotShowing(host.container),
        cards: host.container.querySelectorAll(".voice-mode-onboarding-banner").length
      },
      { visible: true, cards: 1 }
    );
  });
  test("keeps its one showing when there is no chat to dock to", () => {
    const service = createService(disposables);
    service.showIfNeeded();
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    assert.strictEqual(isChatInputStackSlotShowing(host.container), true);
  });
  test("the description links open Voice Mode settings and instructions", () => {
    const executed = [];
    const service = createService(disposables, executed);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const links = [...host.container.querySelectorAll(".voice-mode-onboarding-description a")];
    for (const link of links) {
      link.click();
    }
    assert.deepStrictEqual(
      { labels: links.map((link) => link.textContent), executed },
      {
        labels: ["settings", "how it's written"],
        executed: ["agentsVoice.openSettings", "workbench.action.chat.configureVoiceInstructions"]
      }
    );
  });
  test("does not block Voice Mode from listening while the card is up", () => {
    const holds = [];
    const service = createService(disposables, [], holds);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    host.container.querySelector(".voice-mode-onboarding-close").click();
    assert.deepStrictEqual(holds, []);
  });
  test("the one appearance is only spent once the card is really up", () => {
    let cardWhenStored;
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(IVoiceSessionController, new class extends mock() {
      constructor() {
        super(...arguments);
        this.voiceState = constObservable("idle");
      }
      setAutoListenHeld() {
      }
      stopListening() {
      }
    }());
    const host = createHost(disposables);
    const storageService = instantiationService.get(IStorageService);
    const store = storageService.store.bind(storageService);
    instantiationService.stub(IStorageService, new Proxy(storageService, {
      get: (target, property, receiver) => property === "store" ? (key, value, scope, target2) => {
        if (key === AgentsVoiceStorageKeys.IntroBannerShown) {
          cardWhenStored = {
            visible: isChatInputStackSlotShowing(host.container),
            cards: host.container.querySelectorAll(".voice-mode-onboarding-banner").length
          };
        }
        store(key, value, scope, target2);
      } : Reflect.get(target, property, receiver)
    }));
    const service = disposables.add(instantiationService.createInstance(VoiceModeOnboardingService));
    disposables.add(register(service, host));
    service.showIfNeeded();
    assert.deepStrictEqual(cardWhenStored, { visible: true, cards: 1 });
  });
  test("hands focus back to the chat input when dismissed from the keyboard", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const close = host.container.querySelector(".voice-mode-onboarding-close");
    close.focus();
    const dismissedFromInside = dom.isAncestorOfActiveElement(host.container);
    close.click();
    assert.deepStrictEqual(
      { dismissedFromInside, focused: host.focused },
      { dismissedFromInside: true, focused: 1 }
    );
  });
  test("leaves focus alone when the card is dismissed from elsewhere", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(register(service, host));
    service.showIfNeeded();
    const elsewhere = document.body.appendChild(dom.$("div"));
    disposables.add(toDisposable(() => elsewhere.remove()));
    elsewhere.tabIndex = 0;
    elsewhere.focus();
    host.container.querySelector(".voice-mode-onboarding-close").click();
    assert.strictEqual(host.focused, 0);
  });
  test("attaches to the most recently focused host", () => {
    const service = createService(disposables);
    const first = createHost(disposables);
    const second = createHost(disposables);
    disposables.add(register(service, first));
    disposables.add(register(service, second));
    second.root.focus();
    second.root.dispatchEvent(new FocusEvent("focus"));
    service.showIfNeeded();
    assert.deepStrictEqual(
      {
        first: isChatInputStackSlotShowing(first.container),
        second: isChatInputStackSlotShowing(second.container)
      },
      { first: false, second: true }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFnZW50c1ZvaWNlXFx0ZXN0XFxicm93c2VyXFx2b2ljZU1vZGVPbmJvYXJkaW5nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRzVm9pY2VTdG9yYWdlS2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciwgVm9pY2VTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBWb2ljZU1vZGVPbmJvYXJkaW5nQmFubmVyLCBWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdm9pY2VNb2RlT25ib2FyZGluZy5qcyc7XG5pbXBvcnQgeyBpc0NoYXRJbnB1dFN0YWNrU2xvdFNob3dpbmcgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFN0YWNrLmpzJztcblxuc3VpdGUoJ1ZvaWNlIE1vZGUgb25ib2FyZGluZycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGludGVyZmFjZSBJVGVzdEhvc3QgeyByb290OiBIVE1MRWxlbWVudDsgY29udGFpbmVyOiBIVE1MRWxlbWVudDsgZm9jdXNlZDogbnVtYmVyIH1cblx0aW50ZXJmYWNlIElUZWxlbWV0cnlFdmVudCB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgZGF0YTogdW5rbm93biB9XG5cblx0Y2xhc3MgVGVzdFRlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIHtcblx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGV2ZW50czogSVRlbGVtZXRyeUV2ZW50W10pIHtcblx0XHRcdHN1cGVyKCk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRpZiAoZXZlbnROYW1lKSB7XG5cdFx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSG9zdChzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPik6IElUZXN0SG9zdCB7XG5cdFx0Y29uc3Qgcm9vdCA9IGRvbS4kKCdkaXYnKTtcblx0XHRyb290LnRhYkluZGV4ID0gMDtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uYXBwZW5kKHJvb3QsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWNvbnRhaW5lcicpKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHJvb3QpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcm9vdC5yZW1vdmUoKSkpO1xuXHRcdHJldHVybiB7IHJvb3QsIGNvbnRhaW5lciwgZm9jdXNlZDogMCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVnaXN0ZXIoc2VydmljZTogVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UsIGhvc3Q6IElUZXN0SG9zdCkge1xuXHRcdHJldHVybiBzZXJ2aWNlLnJlZ2lzdGVySG9zdCh7XG5cdFx0XHRjb250YWluZXI6IGhvc3QuY29udGFpbmVyLFxuXHRcdFx0Zm9jdXNSb290OiBob3N0LnJvb3QsXG5cdFx0XHRmb2N1czogKCkgPT4ge1xuXHRcdFx0XHRob3N0LmZvY3VzZWQrKztcblx0XHRcdFx0aG9zdC5yb290LmZvY3VzKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBzY3JlZW5SZWFkZXJPcHRpbWl6ZWQgPSBmYWxzZSkge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjY2Vzc2liaWxpdHlTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVkdWNlZE1vdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSBpc1NjcmVlblJlYWRlck9wdGltaXplZCgpOiBib29sZWFuIHsgcmV0dXJuIHNjcmVlblJlYWRlck9wdGltaXplZDsgfVxuXHRcdFx0b3ZlcnJpZGUgaXNNb3Rpb25SZWR1Y2VkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHR9KTtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBleGVjdXRlZDogc3RyaW5nW10gPSBbXSwgaG9sZHM6IGJvb2xlYW5bXSA9IFtdLCB0ZWxlbWV0cnlFdmVudHM6IElUZWxlbWV0cnlFdmVudFtdID0gW10sIHNjcmVlblJlYWRlck9wdGltaXplZCA9IGZhbHNlKTogVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2Uge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKHN0b3JlLCBzY3JlZW5SZWFkZXJPcHRpbWl6ZWQpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDb21tYW5kU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBleGVjdXRlQ29tbWFuZChpZDogc3RyaW5nKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0ZXhlY3V0ZWQucHVzaChpZCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWb2ljZVNlc3Npb25Db250cm9sbGVyLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZVNlc3Npb25Db250cm9sbGVyPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHZvaWNlU3RhdGUgPSBjb25zdE9ic2VydmFibGU8Vm9pY2VTdGF0ZT4oJ2lkbGUnKTtcblx0XHRcdG92ZXJyaWRlIHNldEF1dG9MaXN0ZW5IZWxkKGhlbGQ6IGJvb2xlYW4pOiB2b2lkIHsgaG9sZHMucHVzaChoZWxkKTsgfVxuXHRcdFx0b3ZlcnJpZGUgc3RvcExpc3RlbmluZygpOiB2b2lkIHsgfVxuXHRcdFx0b3ZlcnJpZGUgcHR0RG93bigpOiB2b2lkIHsgfVxuXHRcdFx0b3ZlcnJpZGUgcHR0VXAoKTogdm9pZCB7IH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UodGVsZW1ldHJ5RXZlbnRzKSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSkpO1xuXHR9XG5cblx0dGVzdCgnYXVkaXRpb25zIGEgdm9pY2UsIGRpc21pc3NlcywgYW5kIG5ldmVyIHJldHVybnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5RXZlbnRzOiBJVGVsZW1ldHJ5RXZlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzLCBbXSwgW10sIHRlbGVtZXRyeUV2ZW50cyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlcihzZXJ2aWNlLCBob3N0KSk7XG5cblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXHRcdGNvbnN0IHNob3duID0gaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGhvc3QuY29udGFpbmVyKTtcblxuXHRcdC8vIE5vdGhpbmcgaXMgY2hvc2VuIHVudGlsIHRoZSB1c2VyIGNob29zZXM6IHRoZSBjYXJkIGFza3MgYSBxdWVzdGlvblxuXHRcdC8vIHJhdGhlciB0aGFuIGFycml2aW5nIHdpdGggYW4gYW5zd2VyIGFscmVhZHkgZmlsbGVkIGluLlxuXHRcdGNvbnN0IHNlbGVjdGVkT25PcGVuID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZS5zZWxlY3RlZCcpLmxlbmd0aDtcblx0XHRjb25zdCB2b2ljZXMgPSBbLi4uaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UtbGFiZWwnKV0ubWFwKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCk7XG5cdFx0Y29uc3Qgdm9pY2VzTGFiZWwgPSBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZXMtbGFiZWwnKT8udGV4dENvbnRlbnQ7XG5cdFx0Y29uc3QgbWljcm9waG9uZVBpY2tlciA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLW1pY3JvcGhvbmUtcGlja2VyJyk7XG5cdFx0Y29uc3QgbWljcm9waG9uZVBpY2tlckhpZGRlbiA9IG1pY3JvcGhvbmVQaWNrZXI/LmhpZGRlbjtcblx0XHRjb25zdCBtaWNyb3Bob25lUGlja2VyRGlzcGxheSA9IG1pY3JvcGhvbmVQaWNrZXIgJiYgZG9tLmdldFdpbmRvdyhtaWNyb3Bob25lUGlja2VyKS5nZXRDb21wdXRlZFN0eWxlKG1pY3JvcGhvbmVQaWNrZXIpLmRpc3BsYXk7XG5cdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UnKSEuY2xpY2soKTtcblx0XHRjb25zdCBzZWxlY3RlZEFmdGVyUGljayA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2Uuc2VsZWN0ZWQnKS5sZW5ndGg7XG5cblx0XHQvLyBEaXNtaXNzYWwgaXMgbmV2ZXIgZ2F0ZWQsIGFuZCBoYXZpbmcgYmVlbiBzZWVuIGl0IG11c3Qgbm90IGNvbWUgYmFjay5cblx0XHRob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jbG9zZScpIS5jbGljaygpO1xuXHRcdGNvbnN0IHNob3duQWZ0ZXJDbG9zZSA9IGlzQ2hhdElucHV0U3RhY2tTbG90U2hvd2luZyhob3N0LmNvbnRhaW5lcik7XG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRjb25zdCBzaG93bkFnYWluID0gaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGhvc3QuY29udGFpbmVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHNob3duLFxuXHRcdFx0XHRtaWNyb3Bob25lUGlja2VySGlkZGVuLFxuXHRcdFx0XHRtaWNyb3Bob25lUGlja2VyRGlzcGxheSxcblx0XHRcdFx0c2VsZWN0ZWRPbk9wZW4sXG5cdFx0XHRcdHZvaWNlcyxcblx0XHRcdFx0dm9pY2VzTGFiZWwsXG5cdFx0XHRcdHNlbGVjdGVkQWZ0ZXJQaWNrLFxuXHRcdFx0XHRzaG93bkFmdGVyQ2xvc2UsXG5cdFx0XHRcdHNob3duQWdhaW4sXG5cdFx0XHRcdHRlbGVtZXRyeUV2ZW50cyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHNob3duOiB0cnVlLFxuXHRcdFx0XHRtaWNyb3Bob25lUGlja2VySGlkZGVuOiB0cnVlLFxuXHRcdFx0XHRtaWNyb3Bob25lUGlja2VyRGlzcGxheTogJ25vbmUnLFxuXHRcdFx0XHRzZWxlY3RlZE9uT3BlbjogMCxcblx0XHRcdFx0dm9pY2VzOiBbJ0JpcmNoIChEZWZhdWx0KScsICdIYXJwZXInLCAnT2FrJywgJ0p1bmhvJ10sXG5cdFx0XHRcdHZvaWNlc0xhYmVsOiAnQWdlbnQgVm9pY2U6Jyxcblx0XHRcdFx0c2VsZWN0ZWRBZnRlclBpY2s6IDEsXG5cdFx0XHRcdHNob3duQWZ0ZXJDbG9zZTogZmFsc2UsXG5cdFx0XHRcdHNob3duQWdhaW46IGZhbHNlLFxuXHRcdFx0XHR0ZWxlbWV0cnlFdmVudHM6IFtcblx0XHRcdFx0XHR7IG5hbWU6ICd2b2ljZU1vZGVPbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnc2hvd24nLCBzb3VyY2U6ICdhdXRvbWF0aWMnIH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICd2b2ljZU1vZGVPbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnc2VsZWN0Vm9pY2UnLCBzb3VyY2U6ICdhdXRvbWF0aWMnIH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICd2b2ljZU1vZGVPbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnY2xvc2UnLCBzb3VyY2U6ICdhdXRvbWF0aWMnIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGlja2luZyB0aGUgcGxheWluZyB2b2ljZSBzdG9wcyBpdHMgcHJldmlldyB3aXRob3V0IGNoYW5naW5nIHRoZSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgYXVkaW8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhdWRpbycpO1xuXHRcdGxldCBwbGF5Q291bnQgPSAwO1xuXHRcdGxldCBwYXVzZUNvdW50ID0gMDtcblx0XHRhdWRpby5wbGF5ID0gKCkgPT4ge1xuXHRcdFx0cGxheUNvdW50Kys7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fTtcblx0XHRhdWRpby5wYXVzZSA9ICgpID0+IHBhdXNlQ291bnQrKztcblxuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lciwge1xuXHRcdFx0Y29udGFpbmVyOiBob3N0LmNvbnRhaW5lcixcblx0XHRcdG9uRGlzbWlzczogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c291cmNlOiAnbWFudWFsJyxcblx0XHRcdGF1ZGlvRmFjdG9yeTogKCkgPT4gYXVkaW8sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdFZvaWNlT3B0aW9uID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UnKSE7XG5cdFx0ZGVmYXVsdFZvaWNlT3B0aW9uLmNsaWNrKCk7XG5cdFx0Y29uc3QgcGxheWluZ0FmdGVyRmlyc3RDbGljayA9IGRlZmF1bHRWb2ljZU9wdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoJ3BsYXlpbmcnKTtcblx0XHRjb25zdCBhcmlhTGFiZWxBZnRlckZpcnN0Q2xpY2sgPSBkZWZhdWx0Vm9pY2VPcHRpb24uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0ZGVmYXVsdFZvaWNlT3B0aW9uLmNsaWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogZGVmYXVsdFZvaWNlT3B0aW9uLnF1ZXJ5U2VsZWN0b3IoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UtbGFiZWwnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdHBsYXlDb3VudCxcblx0XHRcdFx0cGF1c2VDb3VudCxcblx0XHRcdFx0cGxheWluZ0FmdGVyRmlyc3RDbGljayxcblx0XHRcdFx0YXJpYUxhYmVsQWZ0ZXJGaXJzdENsaWNrLFxuXHRcdFx0XHRwbGF5aW5nQWZ0ZXJTZWNvbmRDbGljazogZGVmYXVsdFZvaWNlT3B0aW9uLmNsYXNzTGlzdC5jb250YWlucygncGxheWluZycpLFxuXHRcdFx0XHRhcmlhTGFiZWxBZnRlclNlY29uZENsaWNrOiBkZWZhdWx0Vm9pY2VPcHRpb24uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHRcdHNlbGVjdGVkQWZ0ZXJTZWNvbmRDbGljazogZGVmYXVsdFZvaWNlT3B0aW9uLmNsYXNzTGlzdC5jb250YWlucygnc2VsZWN0ZWQnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQmlyY2ggKERlZmF1bHQpJyxcblx0XHRcdFx0cGxheUNvdW50OiAxLFxuXHRcdFx0XHRwYXVzZUNvdW50OiAxLFxuXHRcdFx0XHRwbGF5aW5nQWZ0ZXJGaXJzdENsaWNrOiB0cnVlLFxuXHRcdFx0XHRhcmlhTGFiZWxBZnRlckZpcnN0Q2xpY2s6ICdTdG9wIEJpcmNoIChEZWZhdWx0KSBwcmV2aWV3LicsXG5cdFx0XHRcdHBsYXlpbmdBZnRlclNlY29uZENsaWNrOiBmYWxzZSxcblx0XHRcdFx0YXJpYUxhYmVsQWZ0ZXJTZWNvbmRDbGljazogJ0JpcmNoIChEZWZhdWx0KS4gSGVhciB0aGlzIHZvaWNlIGFuZCB1c2UgaXQgZm9yIGV2ZXJ5IGNvbnZlcnNhdGlvbi4nLFxuXHRcdFx0XHRzZWxlY3RlZEFmdGVyU2Vjb25kQ2xpY2s6IHRydWUsXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJldmlld3MgdGhlIG5hdGl2ZSB2b2ljZSBwZXIgbGFuZ3VhZ2UgYW5kIGtlZXBzIHRoZSBjaG9vc2VyIG9ubHkgZm9yIEVuZ2xpc2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gQSBsYW5ndWFnZSBWb2ljZSBNb2RlIHNwZWFrcyBuYXRpdmVseSBzaG93cyBpdHMgb25lIHZvaWNlIHdpdGggbm9cblx0XHQvLyBjaG9vc2VyOyBFbmdsaXNoIGFuZCBsYW5ndWFnZXMgd2l0aG91dCBhIG5hdGl2ZSB2b2ljZSBrZWVwIHRoZSBmb3VyLlxuXHRcdGNvbnN0IGNhc2VzID0gW1xuXHRcdFx0eyBsYW5ndWFnZTogJ2RlLURFJywgb3B0aW9uczogMSwgY2hvb3NlcjogZmFsc2UsIHNhbXBsZTogJ2RlX21hcmNfbmV1dHJhbC5tcDMnIH0sXG5cdFx0XHR7IGxhbmd1YWdlOiAnZXMtTVgnLCBvcHRpb25zOiAxLCBjaG9vc2VyOiBmYWxzZSwgc2FtcGxlOiAnZXMtRVNfbWFyaWFfbmV1dHJhbC5tcDMnIH0sXG5cdFx0XHR7IGxhbmd1YWdlOiAnZnItQ0EnLCBvcHRpb25zOiAxLCBjaG9vc2VyOiBmYWxzZSwgc2FtcGxlOiAnZnJfZGF2aWRfbmV1dHJhbC5tcDMnIH0sXG5cdFx0XHR7IGxhbmd1YWdlOiAnaXQtSVQnLCBvcHRpb25zOiAxLCBjaG9vc2VyOiBmYWxzZSwgc2FtcGxlOiAnaXRfZXZhX25ldXRyYWwubXAzJyB9LFxuXHRcdFx0eyBsYW5ndWFnZTogJ2phLUpQJywgb3B0aW9uczogMSwgY2hvb3NlcjogZmFsc2UsIHNhbXBsZTogJ2phX2FydWhhX25ldXRyYWwubXAzJyB9LFxuXHRcdFx0eyBsYW5ndWFnZTogJ2tvLUtSJywgb3B0aW9uczogMSwgY2hvb3NlcjogZmFsc2UsIHNhbXBsZTogJ2tvX2ppeW9uX25ldXRyYWwubXAzJyB9LFxuXHRcdFx0eyBsYW5ndWFnZTogJ3B0LVBUJywgb3B0aW9uczogMSwgY2hvb3NlcjogZmFsc2UsIHNhbXBsZTogJ3B0LUJSX2dpbF9uZXV0cmFsLm1wMycgfSxcblx0XHRcdHsgbGFuZ3VhZ2U6ICd6aC1UVycsIG9wdGlvbnM6IDEsIGNob29zZXI6IGZhbHNlLCBzYW1wbGU6ICd6aF93dXpoaV9uZXV0cmFsLm1wMycgfSxcblx0XHRcdHsgbGFuZ3VhZ2U6ICdlbi1HQicsIG9wdGlvbnM6IDQsIGNob29zZXI6IHRydWUsIHNhbXBsZTogJ21heWFfbmV1dHJhbC5tcDMnIH0sXG5cdFx0XHR7IGxhbmd1YWdlOiAnaXMnLCBvcHRpb25zOiA0LCBjaG9vc2VyOiB0cnVlLCBzYW1wbGU6ICdtYXlhX25ldXRyYWwubXAzJyB9LFxuXHRcdF07XG5cdFx0Y29uc3QgYWN0dWFsOiB7IGxhbmd1YWdlOiBzdHJpbmc7IG9wdGlvbnM6IG51bWJlcjsgY2hvb3NlcjogYm9vbGVhbjsgc2FtcGxlOiBzdHJpbmcgfVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHsgbGFuZ3VhZ2UgfSBvZiBjYXNlcykge1xuXHRcdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3QgYXVkaW8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhdWRpbycpO1xuXHRcdFx0YXVkaW8ucGxheSA9ICgpID0+IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZvaWNlTW9kZU9uYm9hcmRpbmdCYW5uZXIsIHtcblx0XHRcdFx0Y29udGFpbmVyOiBob3N0LmNvbnRhaW5lcixcblx0XHRcdFx0b25EaXNtaXNzOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHNvdXJjZTogJ21hbnVhbCcsXG5cdFx0XHRcdGF1ZGlvRmFjdG9yeTogKCkgPT4gYXVkaW8sXG5cdFx0XHRcdHZvaWNlTGFuZ3VhZ2U6IGxhbmd1YWdlLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBvcHRpb25zID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZScpLmxlbmd0aDtcblx0XHRcdGNvbnN0IGNob29zZXIgPSAhIWhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2VzW3JvbGU9XCJyYWRpb2dyb3VwXCJdJyk7XG5cdFx0XHRob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZScpIS5jbGljaygpO1xuXHRcdFx0Y29uc3Qgc2FtcGxlID0gYXVkaW8uc3JjLnNwbGl0KC9bPyNdLylbMF0uc3BsaXQoJy8nKS5wb3AoKSA/PyAnJztcblx0XHRcdGFjdHVhbC5wdXNoKHsgbGFuZ3VhZ2UsIG9wdGlvbnMsIGNob29zZXIsIHNhbXBsZSB9KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgY2FzZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdzd2FwcyB0aGUgY2hpcHMgd2hlbiB0aGUgc3Bva2VuIGxhbmd1YWdlIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnLCAnZW4nKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGF1ZGlvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYXVkaW8nKTtcblx0XHRhdWRpby5wbGF5ID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZvaWNlTW9kZU9uYm9hcmRpbmdCYW5uZXIsIHtcblx0XHRcdGNvbnRhaW5lcjogaG9zdC5jb250YWluZXIsXG5cdFx0XHRvbkRpc21pc3M6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHNvdXJjZTogJ21hbnVhbCcsXG5cdFx0XHRhdWRpb0ZhY3Rvcnk6ICgpID0+IGF1ZGlvLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvdW50Vm9pY2VzID0gKCkgPT4gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZScpLmxlbmd0aDtcblx0XHRjb25zdCBlbmdsaXNoT3B0aW9ucyA9IGNvdW50Vm9pY2VzKCk7XG5cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLmxhbmd1YWdlJywgJ3poJyk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFsnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJ10pLFxuXHRcdFx0Y2hhbmdlOiB7IGtleXM6IFsnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJ10sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiBjYW5kaWRhdGUgPT4gY2FuZGlkYXRlID09PSAnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJyxcblx0XHR9KTtcblx0XHRjb25zdCBjaGluZXNlT3B0aW9ucyA9IGNvdW50Vm9pY2VzKCk7XG5cdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UnKSEuY2xpY2soKTtcblx0XHRjb25zdCBjaGluZXNlU2FtcGxlID0gYXVkaW8uc3JjLnNwbGl0KC9bPyNdLylbMF0uc3BsaXQoJy8nKS5wb3AoKSA/PyAnJztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGVuZ2xpc2hPcHRpb25zLCBjaGluZXNlT3B0aW9ucywgY2hpbmVzZVNhbXBsZSB9LFxuXHRcdFx0eyBlbmdsaXNoT3B0aW9uczogNCwgY2hpbmVzZU9wdGlvbnM6IDEsIGNoaW5lc2VTYW1wbGU6ICd6aF93dXpoaV9uZXV0cmFsLm1wMycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBiZSBzaG93biBhZ2FpbiBtYW51YWxseScsICgpID0+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlFdmVudHM6IElUZWxlbWV0cnlFdmVudFtdID0gW107XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMsIFtdLCBbXSwgdGVsZW1ldHJ5RXZlbnRzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyKHNlcnZpY2UsIGhvc3QpKTtcblxuXHRcdGNvbnN0IHNob3duID0gc2VydmljZS5zaG93KCk7XG5cdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctY2xvc2UnKSEuY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHNob3duLCB0ZWxlbWV0cnlFdmVudHMgfSxcblx0XHRcdHtcblx0XHRcdFx0c2hvd246IHRydWUsXG5cdFx0XHRcdHRlbGVtZXRyeUV2ZW50czogW1xuXHRcdFx0XHRcdHsgbmFtZTogJ3ZvaWNlTW9kZU9uYm9hcmRpbmcuYWN0aW9uJywgZGF0YTogeyBhY3Rpb246ICdzaG93bicsIHNvdXJjZTogJ21hbnVhbCcgfSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ3ZvaWNlTW9kZU9uYm9hcmRpbmcuYWN0aW9uJywgZGF0YTogeyBhY3Rpb246ICdjbG9zZScsIHNvdXJjZTogJ21hbnVhbCcgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBiZSBkaXNtaXNzZWQgd2l0aG91dCBjaG9vc2luZyBhIHZvaWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyKHNlcnZpY2UsIGhvc3QpKTtcblxuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctY2xvc2UnKSEuY2xpY2soKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NoYXRJbnB1dFN0YWNrU2xvdFNob3dpbmcoaG9zdC5jb250YWluZXIpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BsYWNlcyB0aGUgaW50cm9kdWN0aW9uIGluIHRoZSB0YWIgb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0c2VydmljZS5zaG93KCk7XG5cdFx0Y29uc3QgY2FyZCA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWJhbm5lcicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0YWN0aXZlRWxlbWVudDogZG9jdW1lbnQuYWN0aXZlRWxlbWVudCxcblx0XHRcdFx0Y2FyZCxcblx0XHRcdFx0dGFiSW5kZXg6IGNhcmQ/LnRhYkluZGV4LFxuXHRcdFx0XHRjbG9zZUljb246IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctY2xvc2UnKT8uY2xhc3NOYW1lLFxuXHRcdFx0XHRsaXN0ZW5pbmdOb3RpY2U6IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctbGlzdGVuaW5nLW5vdGljZScpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0YWN0aXZlRWxlbWVudDogZG9jdW1lbnQuYm9keSxcblx0XHRcdFx0Y2FyZCxcblx0XHRcdFx0dGFiSW5kZXg6IDAsXG5cdFx0XHRcdGNsb3NlSWNvbjogJ2FjdGlvbi1sYWJlbCBjb2RpY29uIGNvZGljb24tY2xvc2UtY29tcGFjdCB2b2ljZS1tb2RlLW9uYm9hcmRpbmctY2xvc2UgY2hhdC1pbnB1dC1ub3RpY2UtZGlzbWlzcycsXG5cdFx0XHRcdGxpc3RlbmluZ05vdGljZTogbnVsbCxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhc2tpbmcgdHdpY2UgaW4gb25lIHNlc3Npb24gbGVhdmVzIGV4YWN0bHkgb25lIGNhcmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0Ly8gVm9pY2UgTW9kZSByZXBvcnRzIGNvbm5lY3RpbmcgYW5kIHRoZW4gY29ubmVjdGVkLCBzbyB0aGUgdHJpZ2dlciBmaXJlc1xuXHRcdC8vIG1vcmUgdGhhbiBvbmNlIGZvciBhIHNpbmdsZSBzZXNzaW9uIHN0YXJ0LlxuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHZpc2libGU6IGlzQ2hhdElucHV0U3RhY2tTbG90U2hvd2luZyhob3N0LmNvbnRhaW5lciksXG5cdFx0XHRcdGNhcmRzOiBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWJhbm5lcicpLmxlbmd0aCxcblx0XHRcdH0sXG5cdFx0XHR7IHZpc2libGU6IHRydWUsIGNhcmRzOiAxIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBpdHMgb25lIHNob3dpbmcgd2hlbiB0aGVyZSBpcyBubyBjaGF0IHRvIGRvY2sgdG8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gTm90aGluZyByZWdpc3RlcmVkIHlldDogdGhlIGludHJvZHVjdGlvbiBjYW5ub3QgYmUgc2hvd24sIGFuZCBtdXN0IG5vdFxuXHRcdC8vIGJ1cm4gaXRzIHNpbmdsZSBhcHBlYXJhbmNlIGRvaW5nIG5vdGhpbmcuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblxuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGhvc3QuY29udGFpbmVyKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBkZXNjcmlwdGlvbiBsaW5rcyBvcGVuIFZvaWNlIE1vZGUgc2V0dGluZ3MgYW5kIGluc3RydWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBleGVjdXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcywgZXhlY3V0ZWQpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRjb25zdCBsaW5rcyA9IFsuLi5ob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1kZXNjcmlwdGlvbiBhJyldO1xuXHRcdGZvciAoY29uc3QgbGluayBvZiBsaW5rcykge1xuXHRcdFx0bGluay5jbGljaygpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGxhYmVsczogbGlua3MubWFwKGxpbmsgPT4gbGluay50ZXh0Q29udGVudCksIGV4ZWN1dGVkIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsczogWydzZXR0aW5ncycsICdob3cgaXRcXCdzIHdyaXR0ZW4nXSxcblx0XHRcdFx0ZXhlY3V0ZWQ6IFsnYWdlbnRzVm9pY2Uub3BlblNldHRpbmdzJywgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb25maWd1cmVWb2ljZUluc3RydWN0aW9ucyddLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJsb2NrIFZvaWNlIE1vZGUgZnJvbSBsaXN0ZW5pbmcgd2hpbGUgdGhlIGNhcmQgaXMgdXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9sZHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzLCBbXSwgaG9sZHMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jbG9zZScpIS5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChob2xkcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgb25lIGFwcGVhcmFuY2UgaXMgb25seSBzcGVudCBvbmNlIHRoZSBjYXJkIGlzIHJlYWxseSB1cCcsICgpID0+IHtcblx0XHQvLyBUaGUgZ3VhcmFudGVlIGlzIG9yZGVyaW5nLiBBbnl0aGluZyB0aGUgY2FyZCBuZWVkcyBhdCBjb25zdHJ1Y3Rpb24gY2FuXG5cdFx0Ly8gdGhyb3csIGFuZCBpZiB0aGUga2V5IHdlcmUgd3JpdHRlbiBmaXJzdCB0aGUgdXNlciB3b3VsZCBzaWxlbnRseSBsb3NlXG5cdFx0Ly8gdGhlaXIgb25seSBzaG93aW5nIC0gc28gYnkgdGhlIHRpbWUgaXQgaXMgd3JpdHRlbiB0aGUgY2FyZCBtdXN0IGFscmVhZHlcblx0XHQvLyBiZSBidWlsdCBhbmQgYXR0YWNoZWQuXG5cdFx0bGV0IGNhcmRXaGVuU3RvcmVkOiB7IHZpc2libGU6IGJvb2xlYW47IGNhcmRzOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdm9pY2VTdGF0ZSA9IGNvbnN0T2JzZXJ2YWJsZTxWb2ljZVN0YXRlPignaWRsZScpO1xuXHRcdFx0b3ZlcnJpZGUgc2V0QXV0b0xpc3RlbkhlbGQoKTogdm9pZCB7IH1cblx0XHRcdG92ZXJyaWRlIHN0b3BMaXN0ZW5pbmcoKTogdm9pZCB7IH1cblx0XHR9KTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yZSA9IHN0b3JhZ2VTZXJ2aWNlLnN0b3JlLmJpbmQoc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBuZXcgUHJveHkoc3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdGdldDogKHRhcmdldCwgcHJvcGVydHksIHJlY2VpdmVyKSA9PiBwcm9wZXJ0eSA9PT0gJ3N0b3JlJ1xuXHRcdFx0XHQ/IChrZXk6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4sIHNjb3BlOiBTdG9yYWdlU2NvcGUsIHRhcmdldDI6IFN0b3JhZ2VUYXJnZXQpID0+IHtcblx0XHRcdFx0XHRpZiAoa2V5ID09PSBBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLkludHJvQmFubmVyU2hvd24pIHtcblx0XHRcdFx0XHRcdGNhcmRXaGVuU3RvcmVkID0ge1xuXHRcdFx0XHRcdFx0XHR2aXNpYmxlOiBpc0NoYXRJbnB1dFN0YWNrU2xvdFNob3dpbmcoaG9zdC5jb250YWluZXIpLFxuXHRcdFx0XHRcdFx0XHRjYXJkczogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy1iYW5uZXInKS5sZW5ndGgsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdG9yZShrZXksIHZhbHVlLCBzY29wZSwgdGFyZ2V0Mik7XG5cdFx0XHRcdH1cblx0XHRcdFx0OiBSZWZsZWN0LmdldCh0YXJnZXQsIHByb3BlcnR5LCByZWNlaXZlciksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlcihzZXJ2aWNlLCBob3N0KSk7XG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FyZFdoZW5TdG9yZWQsIHsgdmlzaWJsZTogdHJ1ZSwgY2FyZHM6IDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRzIGZvY3VzIGJhY2sgdG8gdGhlIGNoYXQgaW5wdXQgd2hlbiBkaXNtaXNzZWQgZnJvbSB0aGUga2V5Ym9hcmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXIoc2VydmljZSwgaG9zdCkpO1xuXG5cdFx0c2VydmljZS5zaG93SWZOZWVkZWQoKTtcblx0XHRjb25zdCBjbG9zZSA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWNsb3NlJykhO1xuXHRcdGNsb3NlLmZvY3VzKCk7XG5cdFx0Y29uc3QgZGlzbWlzc2VkRnJvbUluc2lkZSA9IGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGhvc3QuY29udGFpbmVyKTtcblx0XHRjbG9zZS5jbGljaygpO1xuXG5cdFx0Ly8gRGlzbWlzc2luZyBmcm9tIGluc2lkZSB0aGUgY2FyZCBtdXN0IG5vdCBkcm9wIHRoZSBjYXJldCBvbiB0aGUgYm9keS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBkaXNtaXNzZWRGcm9tSW5zaWRlLCBmb2N1c2VkOiBob3N0LmZvY3VzZWQgfSxcblx0XHRcdHsgZGlzbWlzc2VkRnJvbUluc2lkZTogdHJ1ZSwgZm9jdXNlZDogMSB9KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIGZvY3VzIGFsb25lIHdoZW4gdGhlIGNhcmQgaXMgZGlzbWlzc2VkIGZyb20gZWxzZXdoZXJlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyKHNlcnZpY2UsIGhvc3QpKTtcblxuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cdFx0Y29uc3QgZWxzZXdoZXJlID0gZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkb20uJCgnZGl2JykpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZWxzZXdoZXJlLnJlbW92ZSgpKSk7XG5cdFx0ZWxzZXdoZXJlLnRhYkluZGV4ID0gMDtcblx0XHRlbHNld2hlcmUuZm9jdXMoKTtcblx0XHRob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jbG9zZScpIS5jbGljaygpO1xuXG5cdFx0Ly8gVGhlIHVzZXIgYWxyZWFkeSBtb3ZlZCBvbjsgeWFua2luZyB0aGUgY2FyZXQgYmFjayB3b3VsZCBiZSBydWRlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LmZvY3VzZWQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdhdHRhY2hlcyB0byB0aGUgbW9zdCByZWNlbnRseSBmb2N1c2VkIGhvc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGZpcnN0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyKHNlcnZpY2UsIGZpcnN0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyKHNlcnZpY2UsIHNlY29uZCkpO1xuXG5cdFx0Ly8gVGhlIHJlbmRlcmVyIHJ1bm5pbmcgdGhlc2UgdGVzdHMgZG9lcyBub3QgcmVsaWFibHkgaGFuZCBvdXQgcmVhbCBmb2N1cyxcblx0XHQvLyBzbyByYWlzZSB0aGUgc2FtZSBldmVudCB0aGUgZm9jdXMgdHJhY2tlciBsaXN0ZW5zIGZvci5cblx0XHRzZWNvbmQucm9vdC5mb2N1cygpO1xuXHRcdHNlY29uZC5yb290LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2ZvY3VzJykpO1xuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRmaXJzdDogaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGZpcnN0LmNvbnRhaW5lciksXG5cdFx0XHRcdHNlY29uZDogaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKHNlY29uZC5jb250YWluZXIpLFxuXHRcdFx0fSxcblx0XHRcdHsgZmlyc3Q6IGZhbHNlLCBzZWNvbmQ6IHRydWUgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsYUFBYTtBQUN0QixTQUEwQixvQkFBb0I7QUFDOUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGdDQUFnQztBQUN6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
