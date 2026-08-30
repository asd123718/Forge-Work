import assert from "assert";
import * as dom from "../../../../../base/browser/dom.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { buildMicrophoneOptions, DictationOnboardingBanner, DictationOnboardingService, indexOfMicrophone } from "../../browser/speechToText/dictationOnboarding.js";
import { isChatInputStackSlotShowing } from "../../browser/widget/input/chatInputStack.js";
function device(kind, deviceId, label) {
  return { kind, deviceId, label, groupId: "", toJSON: () => ({}) };
}
suite("Dictation onboarding", () => {
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
    const container = dom.append(root, dom.$(".dictation-onboarding-container"));
    document.body.appendChild(root);
    store.add(toDisposable(() => root.remove()));
    return { root, container };
  }
  function createService(store, executed, telemetryEvents = []) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    if (executed) {
      instantiationService.stub(ICommandService, {
        executeCommand: async (id) => {
          executed.push(id);
        }
      });
    }
    instantiationService.stub(ITelemetryService, new TestTelemetryService(telemetryEvents));
    return store.add(instantiationService.createInstance(DictationOnboardingService));
  }
  test("labels the physical default microphone without listing it twice", () => {
    const options = buildMicrophoneOptions([
      // The virtual entries duplicate a real device under a synthetic id.
      device("audioinput", "default", "Default - Studio Mic"),
      device("audioinput", "communications", "Communications - Studio Mic"),
      device("audioinput", "mic-a", "Studio Mic"),
      // Same device reported twice, and a device that is not a microphone.
      device("audioinput", "mic-a", "Studio Mic"),
      device("audiooutput", "speaker-a", "Speakers"),
      // Labels stay empty until permission has been granted at least once.
      device("audioinput", "abcdefghij-unlabelled", "")
    ]);
    assert.deepStrictEqual(options, [
      { deviceId: "", label: "Studio Mic (System default)" },
      { deviceId: "abcdefghij-unlabelled", label: "Unknown device (abcdefgh)" }
    ]);
  });
  test("uses the first physical microphone when the virtual default has no identity", () => {
    const options = buildMicrophoneOptions([
      device("audioinput", "default", "System default"),
      device("audioinput", "mic-a", "Studio Mic"),
      device("audioinput", "mic-b", "Built-in Mic")
    ]);
    assert.deepStrictEqual(options, [
      { deviceId: "", label: "Studio Mic (System default)" },
      { deviceId: "mic-b", label: "Built-in Mic" }
    ]);
  });
  test("falls back to the system default when the remembered device is gone", () => {
    const options = buildMicrophoneOptions([
      device("audioinput", "default", "Default - Built-in Mic"),
      device("audioinput", "built-in", "Built-in Mic"),
      device("audioinput", "mic-a", "Studio Mic")
    ]);
    assert.deepStrictEqual(
      {
        remembered: indexOfMicrophone(options, "mic-a"),
        systemDefault: indexOfMicrophone(options, ""),
        unplugged: indexOfMicrophone(options, "mic-that-was-unplugged")
      },
      { remembered: 1, systemDefault: 0, unplugged: 0 }
    );
  });
  test("shows alongside the first dictation, then never returns", () => {
    const telemetryEvents = [];
    const service = createService(disposables, void 0, telemetryEvents);
    const host = createHost(disposables);
    disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));
    const shownFirstTime = service.showIfNeeded();
    const shown = isChatInputStackSlotShowing(host.container);
    const closeIcon = host.container.querySelector(".dictation-onboarding-close")?.className;
    const hasMicrophoneControls = host.container.querySelector(".dictation-onboarding-device") !== null;
    const hasWaveform = host.container.querySelector(".dictation-onboarding-waveform") !== null;
    host.container.querySelector(".dictation-onboarding-close").click();
    const shownAgain = service.showIfNeeded();
    assert.deepStrictEqual(
      {
        shownFirstTime,
        shown,
        closeIcon,
        hasMicrophoneControls,
        hasWaveform,
        visibleAfterClose: isChatInputStackSlotShowing(host.container),
        shownAgain,
        telemetryEvents
      },
      {
        shownFirstTime: true,
        shown: true,
        closeIcon: "action-label codicon codicon-close-compact dictation-onboarding-close chat-input-notice-dismiss",
        hasMicrophoneControls: true,
        hasWaveform: true,
        visibleAfterClose: false,
        shownAgain: false,
        telemetryEvents: [
          { name: "dictationOnboarding.action", data: { action: "shown", source: "automatic" } },
          { name: "dictationOnboarding.action", data: { action: "close", source: "automatic" } }
        ]
      }
    );
  });
  test("shows populated microphone picker after dictation acquires permission without another capture", async () => {
    const host = createHost(disposables);
    let getUserMediaCalls = 0;
    const selectedDeviceIds = [];
    const mediaDevices = Object.assign(new EventTarget(), {
      enumerateDevices: async () => [
        device("audioinput", "default", "Default - Studio Mic"),
        device("audioinput", "studio", "Studio Mic"),
        device("audioinput", "built-in", "Built-in Mic")
      ],
      getUserMedia: async () => {
        getUserMediaCalls++;
        throw new Error("Automatic onboarding must not acquire a stream");
      }
    });
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const banner = disposables.add(instantiationService.createInstance(DictationOnboardingBanner, {
      container: host.container,
      onDismiss: () => {
      },
      previewMicrophone: false,
      source: "automatic"
    }, mediaDevices));
    const analyser = new class extends mock() {
      constructor() {
        super(...arguments);
        this.fftSize = 256;
      }
      getByteTimeDomainData() {
      }
    }();
    await banner.refreshMicrophones(analyser, async (deviceId) => {
      selectedDeviceIds.push(deviceId);
      return analyser;
    });
    const picker = host.container.querySelector(".dictation-onboarding-picker select");
    picker.selectedIndex = 1;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    assert.deepStrictEqual(
      {
        pickerHidden: host.container.querySelector(".dictation-onboarding-picker")?.hidden,
        options: Array.from(host.container.querySelectorAll(".dictation-onboarding-picker option"), (option) => option.textContent),
        hasWaveform: host.container.querySelector(".dictation-onboarding-waveform") !== null,
        getUserMediaCalls,
        selectedDeviceIds
      },
      {
        pickerHidden: false,
        options: ["Studio Mic (System default)", "Built-in Mic"],
        hasWaveform: true,
        getUserMediaCalls: 0,
        selectedDeviceIds: ["built-in"]
      }
    );
  });
  test("keeps the picker hidden until a microphone reports a real label", async () => {
    const host = createHost(disposables);
    let labelled = false;
    const mediaDevices = Object.assign(new EventTarget(), {
      enumerateDevices: async () => labelled ? [
        device("audioinput", "default", "Default - Studio Mic"),
        device("audioinput", "studio", "Studio Mic"),
        device("audioinput", "built-in", "Built-in Mic")
      ] : [
        device("audioinput", "default", ""),
        device("audioinput", "studio", ""),
        device("audioinput", "built-in", "")
      ],
      getUserMedia: async () => {
        throw new Error("Automatic onboarding must not acquire a stream");
      }
    });
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const banner = disposables.add(instantiationService.createInstance(DictationOnboardingBanner, {
      container: host.container,
      onDismiss: () => {
      },
      previewMicrophone: false,
      source: "automatic"
    }, mediaDevices));
    const analyser = new class extends mock() {
      constructor() {
        super(...arguments);
        this.fftSize = 256;
      }
      getByteTimeDomainData() {
      }
    }();
    await banner.refreshMicrophones(analyser);
    const hiddenWhileUnlabelled = host.container.querySelector(".dictation-onboarding-picker")?.hidden;
    labelled = true;
    await banner.refreshMicrophones(analyser);
    assert.deepStrictEqual(
      {
        hiddenWhileUnlabelled,
        hiddenAfterLabelled: host.container.querySelector(".dictation-onboarding-picker")?.hidden,
        options: Array.from(host.container.querySelectorAll(".dictation-onboarding-picker option"), (option) => option.textContent)
      },
      {
        hiddenWhileUnlabelled: true,
        hiddenAfterLabelled: false,
        options: ["Studio Mic (System default)", "Built-in Mic"]
      }
    );
  });
  test("escape dismisses the card", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));
    service.showIfNeeded();
    host.container.querySelector(".dictation-onboarding-banner").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    assert.strictEqual(isChatInputStackSlotShowing(host.container), false);
  });
  test("dictates straight away when there is no chat input to dock to", () => {
    const service = createService(disposables);
    assert.strictEqual(service.showIfNeeded(), false);
  });
  test("showing again replaces the card rather than hiding it", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));
    service.show();
    service.show();
    const microphonePicker = host.container.querySelector(".dictation-onboarding-picker");
    assert.deepStrictEqual(
      {
        visible: isChatInputStackSlotShowing(host.container),
        cards: host.container.querySelectorAll(".dictation-onboarding-banner").length,
        hasMicrophoneControls: host.container.querySelector(".dictation-onboarding-device") !== null,
        hasWaveform: host.container.querySelector(".dictation-onboarding-waveform") !== null,
        microphonePickerHidden: microphonePicker?.hidden,
        microphonePickerDisplay: microphonePicker && dom.getWindow(microphonePicker).getComputedStyle(microphonePicker).display
      },
      { visible: true, cards: 1, hasMicrophoneControls: true, hasWaveform: true, microphonePickerHidden: true, microphonePickerDisplay: "none" }
    );
  });
  test("reset shows the introduction on the next dictation", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));
    service.showIfNeeded();
    host.container.querySelector(".dictation-onboarding-close").click();
    service.reset();
    assert.strictEqual(service.showIfNeeded(), true);
  });
  test("attaches to the most recently focused host", () => {
    const service = createService(disposables);
    const first = createHost(disposables);
    const second = createHost(disposables);
    disposables.add(service.registerHost({ container: first.container, focusRoot: first.root }));
    disposables.add(service.registerHost({ container: second.container, focusRoot: second.root }));
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
  test("offers a way to change the settings and how dictation writes", () => {
    const executed = [];
    const telemetryEvents = [];
    const service = createService(disposables, executed, telemetryEvents);
    const host = createHost(disposables);
    disposables.add(service.registerHost({ container: host.container, focusRoot: host.root }));
    service.show();
    const links = host.container.querySelectorAll(".dictation-onboarding-description a");
    links.forEach((link) => link.click());
    assert.deepStrictEqual(
      {
        count: links.length,
        // Every link has to be reachable without a mouse, not just the first.
        keyboardReachable: Array.from(links).every((link) => link.tabIndex === 0),
        executed,
        telemetryEvents
      },
      {
        count: 2,
        keyboardReachable: true,
        executed: ["workbench.action.openSettings", "workbench.action.chat.configureDictationInstructions"],
        telemetryEvents: [
          { name: "dictationOnboarding.action", data: { action: "shown", source: "manual" } },
          { name: "dictationOnboarding.action", data: { action: "openSettings", source: "manual" } },
          { name: "dictationOnboarding.action", data: { action: "openInstructions", source: "manual" } }
        ]
      }
    );
  });
  test("disposing the host it is docked to takes the card down with it", () => {
    const service = createService(disposables);
    const host = createHost(disposables);
    const registration = service.registerHost({ container: host.container, focusRoot: host.root });
    service.show();
    registration.dispose();
    assert.deepStrictEqual(
      {
        visible: isChatInputStackSlotShowing(host.container),
        cards: host.container.querySelectorAll(".dictation-onboarding-banner").length
      },
      { visible: false, cards: 0 }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGRpY3RhdGlvbk9uYm9hcmRpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgYnVpbGRNaWNyb3Bob25lT3B0aW9ucywgRGljdGF0aW9uT25ib2FyZGluZ0Jhbm5lciwgRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UsIGluZGV4T2ZNaWNyb3Bob25lIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zcGVlY2hUb1RleHQvZGljdGF0aW9uT25ib2FyZGluZy5qcyc7XG5pbXBvcnQgeyBpc0NoYXRJbnB1dFN0YWNrU2xvdFNob3dpbmcgfSBmcm9tICcuLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXRTdGFjay5qcyc7XG5cbi8qKiBNaW5pbWFsIHN0YW5kLWluIGZvciB0aGUgYnJvd3NlcidzIGRldmljZSBkZXNjcmlwdG9yLiAqL1xuZnVuY3Rpb24gZGV2aWNlKGtpbmQ6IE1lZGlhRGV2aWNlS2luZCwgZGV2aWNlSWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyk6IE1lZGlhRGV2aWNlSW5mbyB7XG5cdHJldHVybiB7IGtpbmQsIGRldmljZUlkLCBsYWJlbCwgZ3JvdXBJZDogJycsIHRvSlNPTjogKCkgPT4gKHt9KSB9O1xufVxuXG5zdWl0ZSgnRGljdGF0aW9uIG9uYm9hcmRpbmcnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0aW50ZXJmYWNlIElUZWxlbWV0cnlFdmVudCB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgZGF0YTogdW5rbm93biB9XG5cblx0Y2xhc3MgVGVzdFRlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIHtcblx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGV2ZW50czogSVRlbGVtZXRyeUV2ZW50W10pIHtcblx0XHRcdHN1cGVyKCk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRpZiAoZXZlbnROYW1lKSB7XG5cdFx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSG9zdChzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPik6IHsgcm9vdDogSFRNTEVsZW1lbnQ7IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfSB7XG5cdFx0Y29uc3Qgcm9vdCA9IGRvbS4kKCdkaXYnKTtcblx0XHRyb290LnRhYkluZGV4ID0gMDtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uYXBwZW5kKHJvb3QsIGRvbS4kKCcuZGljdGF0aW9uLW9uYm9hcmRpbmctY29udGFpbmVyJykpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocm9vdCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByb290LnJlbW92ZSgpKSk7XG5cdFx0cmV0dXJuIHsgcm9vdCwgY29udGFpbmVyIH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBleGVjdXRlZD86IHN0cmluZ1tdLCB0ZWxlbWV0cnlFdmVudHM6IElUZWxlbWV0cnlFdmVudFtdID0gW10pOiBEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRpZiAoZXhlY3V0ZWQpIHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCB7XG5cdFx0XHRcdGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoaWQ6IHN0cmluZykgPT4geyBleGVjdXRlZC5wdXNoKGlkKTsgfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdH1cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UodGVsZW1ldHJ5RXZlbnRzKSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSkpO1xuXHR9XG5cblx0dGVzdCgnbGFiZWxzIHRoZSBwaHlzaWNhbCBkZWZhdWx0IG1pY3JvcGhvbmUgd2l0aG91dCBsaXN0aW5nIGl0IHR3aWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBidWlsZE1pY3JvcGhvbmVPcHRpb25zKFtcblx0XHRcdC8vIFRoZSB2aXJ0dWFsIGVudHJpZXMgZHVwbGljYXRlIGEgcmVhbCBkZXZpY2UgdW5kZXIgYSBzeW50aGV0aWMgaWQuXG5cdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnZGVmYXVsdCcsICdEZWZhdWx0IC0gU3R1ZGlvIE1pYycpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2NvbW11bmljYXRpb25zJywgJ0NvbW11bmljYXRpb25zIC0gU3R1ZGlvIE1pYycpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ21pYy1hJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRcdC8vIFNhbWUgZGV2aWNlIHJlcG9ydGVkIHR3aWNlLCBhbmQgYSBkZXZpY2UgdGhhdCBpcyBub3QgYSBtaWNyb3Bob25lLlxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ21pYy1hJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRcdGRldmljZSgnYXVkaW9vdXRwdXQnLCAnc3BlYWtlci1hJywgJ1NwZWFrZXJzJyksXG5cdFx0XHQvLyBMYWJlbHMgc3RheSBlbXB0eSB1bnRpbCBwZXJtaXNzaW9uIGhhcyBiZWVuIGdyYW50ZWQgYXQgbGVhc3Qgb25jZS5cblx0XHRcdGRldmljZSgnYXVkaW9pbnB1dCcsICdhYmNkZWZnaGlqLXVubGFiZWxsZWQnLCAnJyksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMsIFtcblx0XHRcdHsgZGV2aWNlSWQ6ICcnLCBsYWJlbDogJ1N0dWRpbyBNaWMgKFN5c3RlbSBkZWZhdWx0KScgfSxcblx0XHRcdHsgZGV2aWNlSWQ6ICdhYmNkZWZnaGlqLXVubGFiZWxsZWQnLCBsYWJlbDogJ1Vua25vd24gZGV2aWNlIChhYmNkZWZnaCknIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGZpcnN0IHBoeXNpY2FsIG1pY3JvcGhvbmUgd2hlbiB0aGUgdmlydHVhbCBkZWZhdWx0IGhhcyBubyBpZGVudGl0eScsICgpID0+IHtcblx0XHRjb25zdCBvcHRpb25zID0gYnVpbGRNaWNyb3Bob25lT3B0aW9ucyhbXG5cdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnZGVmYXVsdCcsICdTeXN0ZW0gZGVmYXVsdCcpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ21pYy1hJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRcdGRldmljZSgnYXVkaW9pbnB1dCcsICdtaWMtYicsICdCdWlsdC1pbiBNaWMnKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3B0aW9ucywgW1xuXHRcdFx0eyBkZXZpY2VJZDogJycsIGxhYmVsOiAnU3R1ZGlvIE1pYyAoU3lzdGVtIGRlZmF1bHQpJyB9LFxuXHRcdFx0eyBkZXZpY2VJZDogJ21pYy1iJywgbGFiZWw6ICdCdWlsdC1pbiBNaWMnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHN5c3RlbSBkZWZhdWx0IHdoZW4gdGhlIHJlbWVtYmVyZWQgZGV2aWNlIGlzIGdvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGJ1aWxkTWljcm9waG9uZU9wdGlvbnMoW1xuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2RlZmF1bHQnLCAnRGVmYXVsdCAtIEJ1aWx0LWluIE1pYycpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2J1aWx0LWluJywgJ0J1aWx0LWluIE1pYycpLFxuXHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ21pYy1hJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHJlbWVtYmVyZWQ6IGluZGV4T2ZNaWNyb3Bob25lKG9wdGlvbnMsICdtaWMtYScpLFxuXHRcdFx0XHRzeXN0ZW1EZWZhdWx0OiBpbmRleE9mTWljcm9waG9uZShvcHRpb25zLCAnJyksXG5cdFx0XHRcdHVucGx1Z2dlZDogaW5kZXhPZk1pY3JvcGhvbmUob3B0aW9ucywgJ21pYy10aGF0LXdhcy11bnBsdWdnZWQnKSxcblx0XHRcdH0sXG5cdFx0XHR7IHJlbWVtYmVyZWQ6IDEsIHN5c3RlbURlZmF1bHQ6IDAsIHVucGx1Z2dlZDogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgYWxvbmdzaWRlIHRoZSBmaXJzdCBkaWN0YXRpb24sIHRoZW4gbmV2ZXIgcmV0dXJucycsICgpID0+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlFdmVudHM6IElUZWxlbWV0cnlFdmVudFtdID0gW107XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMsIHVuZGVmaW5lZCwgdGVsZW1ldHJ5RXZlbnRzKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJIb3N0KHsgY29udGFpbmVyOiBob3N0LmNvbnRhaW5lciwgZm9jdXNSb290OiBob3N0LnJvb3QgfSkpO1xuXG5cdFx0Y29uc3Qgc2hvd25GaXJzdFRpbWUgPSBzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXHRcdGNvbnN0IHNob3duID0gaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGhvc3QuY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGNsb3NlSWNvbiA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5kaWN0YXRpb24tb25ib2FyZGluZy1jbG9zZScpPy5jbGFzc05hbWU7XG5cdFx0Y29uc3QgaGFzTWljcm9waG9uZUNvbnRyb2xzID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWRldmljZScpICE9PSBudWxsO1xuXHRcdGNvbnN0IGhhc1dhdmVmb3JtID0gaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmRpY3RhdGlvbi1vbmJvYXJkaW5nLXdhdmVmb3JtJykgIT09IG51bGw7XG5cdFx0aG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5kaWN0YXRpb24tb25ib2FyZGluZy1jbG9zZScpIS5jbGljaygpO1xuXHRcdGNvbnN0IHNob3duQWdhaW4gPSBzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0c2hvd25GaXJzdFRpbWUsIHNob3duLCBjbG9zZUljb24sXG5cdFx0XHRcdGhhc01pY3JvcGhvbmVDb250cm9scyxcblx0XHRcdFx0aGFzV2F2ZWZvcm0sXG5cdFx0XHRcdHZpc2libGVBZnRlckNsb3NlOiBpc0NoYXRJbnB1dFN0YWNrU2xvdFNob3dpbmcoaG9zdC5jb250YWluZXIpLFxuXHRcdFx0XHRzaG93bkFnYWluLFxuXHRcdFx0XHR0ZWxlbWV0cnlFdmVudHMsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRzaG93bkZpcnN0VGltZTogdHJ1ZSwgc2hvd246IHRydWUsIGNsb3NlSWNvbjogJ2FjdGlvbi1sYWJlbCBjb2RpY29uIGNvZGljb24tY2xvc2UtY29tcGFjdCBkaWN0YXRpb24tb25ib2FyZGluZy1jbG9zZSBjaGF0LWlucHV0LW5vdGljZS1kaXNtaXNzJyxcblx0XHRcdFx0aGFzTWljcm9waG9uZUNvbnRyb2xzOiB0cnVlLFxuXHRcdFx0XHRoYXNXYXZlZm9ybTogdHJ1ZSxcblx0XHRcdFx0dmlzaWJsZUFmdGVyQ2xvc2U6IGZhbHNlLFxuXHRcdFx0XHRzaG93bkFnYWluOiBmYWxzZSxcblx0XHRcdFx0dGVsZW1ldHJ5RXZlbnRzOiBbXG5cdFx0XHRcdFx0eyBuYW1lOiAnZGljdGF0aW9uT25ib2FyZGluZy5hY3Rpb24nLCBkYXRhOiB7IGFjdGlvbjogJ3Nob3duJywgc291cmNlOiAnYXV0b21hdGljJyB9IH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnZGljdGF0aW9uT25ib2FyZGluZy5hY3Rpb24nLCBkYXRhOiB7IGFjdGlvbjogJ2Nsb3NlJywgc291cmNlOiAnYXV0b21hdGljJyB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgcG9wdWxhdGVkIG1pY3JvcGhvbmUgcGlja2VyIGFmdGVyIGRpY3RhdGlvbiBhY3F1aXJlcyBwZXJtaXNzaW9uIHdpdGhvdXQgYW5vdGhlciBjYXB0dXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRsZXQgZ2V0VXNlck1lZGlhQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IHNlbGVjdGVkRGV2aWNlSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG1lZGlhRGV2aWNlcyA9IE9iamVjdC5hc3NpZ24obmV3IEV2ZW50VGFyZ2V0KCksIHtcblx0XHRcdGVudW1lcmF0ZURldmljZXM6IGFzeW5jICgpID0+IFtcblx0XHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2RlZmF1bHQnLCAnRGVmYXVsdCAtIFN0dWRpbyBNaWMnKSxcblx0XHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ3N0dWRpbycsICdTdHVkaW8gTWljJyksXG5cdFx0XHRcdGRldmljZSgnYXVkaW9pbnB1dCcsICdidWlsdC1pbicsICdCdWlsdC1pbiBNaWMnKSxcblx0XHRcdF0sXG5cdFx0XHRnZXRVc2VyTWVkaWE6IGFzeW5jICgpOiBQcm9taXNlPE1lZGlhU3RyZWFtPiA9PiB7XG5cdFx0XHRcdGdldFVzZXJNZWRpYUNhbGxzKys7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQXV0b21hdGljIG9uYm9hcmRpbmcgbXVzdCBub3QgYWNxdWlyZSBhIHN0cmVhbScpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGJhbm5lciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWN0YXRpb25PbmJvYXJkaW5nQmFubmVyLCB7XG5cdFx0XHRjb250YWluZXI6IGhvc3QuY29udGFpbmVyLFxuXHRcdFx0b25EaXNtaXNzOiAoKSA9PiB7IH0sXG5cdFx0XHRwcmV2aWV3TWljcm9waG9uZTogZmFsc2UsXG5cdFx0XHRzb3VyY2U6ICdhdXRvbWF0aWMnLFxuXHRcdH0sIG1lZGlhRGV2aWNlcykpO1xuXG5cdFx0Y29uc3QgYW5hbHlzZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPEFuYWx5c2VyTm9kZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBmZnRTaXplID0gMjU2O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0Qnl0ZVRpbWVEb21haW5EYXRhKCk6IHZvaWQgeyB9XG5cdFx0fTtcblx0XHRhd2FpdCBiYW5uZXIucmVmcmVzaE1pY3JvcGhvbmVzKGFuYWx5c2VyLCBhc3luYyBkZXZpY2VJZCA9PiB7XG5cdFx0XHRzZWxlY3RlZERldmljZUlkcy5wdXNoKGRldmljZUlkKTtcblx0XHRcdHJldHVybiBhbmFseXNlcjtcblx0XHR9KTtcblx0XHRjb25zdCBwaWNrZXIgPSBob3N0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxTZWxlY3RFbGVtZW50PignLmRpY3RhdGlvbi1vbmJvYXJkaW5nLXBpY2tlciBzZWxlY3QnKSE7XG5cdFx0cGlja2VyLnNlbGVjdGVkSW5kZXggPSAxO1xuXHRcdHBpY2tlci5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY2hhbmdlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHBpY2tlckhpZGRlbjogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5kaWN0YXRpb24tb25ib2FyZGluZy1waWNrZXInKT8uaGlkZGVuLFxuXHRcdFx0XHRvcHRpb25zOiBBcnJheS5mcm9tKGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTE9wdGlvbkVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctcGlja2VyIG9wdGlvbicpLCBvcHRpb24gPT4gb3B0aW9uLnRleHRDb250ZW50KSxcblx0XHRcdFx0aGFzV2F2ZWZvcm06IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5kaWN0YXRpb24tb25ib2FyZGluZy13YXZlZm9ybScpICE9PSBudWxsLFxuXHRcdFx0XHRnZXRVc2VyTWVkaWFDYWxscyxcblx0XHRcdFx0c2VsZWN0ZWREZXZpY2VJZHMsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwaWNrZXJIaWRkZW46IGZhbHNlLFxuXHRcdFx0XHRvcHRpb25zOiBbJ1N0dWRpbyBNaWMgKFN5c3RlbSBkZWZhdWx0KScsICdCdWlsdC1pbiBNaWMnXSxcblx0XHRcdFx0aGFzV2F2ZWZvcm06IHRydWUsXG5cdFx0XHRcdGdldFVzZXJNZWRpYUNhbGxzOiAwLFxuXHRcdFx0XHRzZWxlY3RlZERldmljZUlkczogWydidWlsdC1pbiddLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRoZSBwaWNrZXIgaGlkZGVuIHVudGlsIGEgbWljcm9waG9uZSByZXBvcnRzIGEgcmVhbCBsYWJlbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdChkaXNwb3NhYmxlcyk7XG5cdFx0bGV0IGxhYmVsbGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgbWVkaWFEZXZpY2VzID0gT2JqZWN0LmFzc2lnbihuZXcgRXZlbnRUYXJnZXQoKSwge1xuXHRcdFx0ZW51bWVyYXRlRGV2aWNlczogYXN5bmMgKCkgPT4gbGFiZWxsZWRcblx0XHRcdFx0PyBbXG5cdFx0XHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2RlZmF1bHQnLCAnRGVmYXVsdCAtIFN0dWRpbyBNaWMnKSxcblx0XHRcdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnc3R1ZGlvJywgJ1N0dWRpbyBNaWMnKSxcblx0XHRcdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnYnVpbHQtaW4nLCAnQnVpbHQtaW4gTWljJyksXG5cdFx0XHRcdF1cblx0XHRcdFx0OiBbXG5cdFx0XHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ2RlZmF1bHQnLCAnJyksXG5cdFx0XHRcdFx0ZGV2aWNlKCdhdWRpb2lucHV0JywgJ3N0dWRpbycsICcnKSxcblx0XHRcdFx0XHRkZXZpY2UoJ2F1ZGlvaW5wdXQnLCAnYnVpbHQtaW4nLCAnJyksXG5cdFx0XHRcdF0sXG5cdFx0XHRnZXRVc2VyTWVkaWE6IGFzeW5jICgpOiBQcm9taXNlPE1lZGlhU3RyZWFtPiA9PiB7IHRocm93IG5ldyBFcnJvcignQXV0b21hdGljIG9uYm9hcmRpbmcgbXVzdCBub3QgYWNxdWlyZSBhIHN0cmVhbScpOyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgYmFubmVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpY3RhdGlvbk9uYm9hcmRpbmdCYW5uZXIsIHtcblx0XHRcdGNvbnRhaW5lcjogaG9zdC5jb250YWluZXIsXG5cdFx0XHRvbkRpc21pc3M6ICgpID0+IHsgfSxcblx0XHRcdHByZXZpZXdNaWNyb3Bob25lOiBmYWxzZSxcblx0XHRcdHNvdXJjZTogJ2F1dG9tYXRpYycsXG5cdFx0fSwgbWVkaWFEZXZpY2VzKSk7XG5cblx0XHRjb25zdCBhbmFseXNlciA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8QW5hbHlzZXJOb2RlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGZmdFNpemUgPSAyNTY7XG5cdFx0XHRvdmVycmlkZSBnZXRCeXRlVGltZURvbWFpbkRhdGEoKTogdm9pZCB7IH1cblx0XHR9O1xuXHRcdGF3YWl0IGJhbm5lci5yZWZyZXNoTWljcm9waG9uZXMoYW5hbHlzZXIpO1xuXHRcdGNvbnN0IGhpZGRlbldoaWxlVW5sYWJlbGxlZCA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctcGlja2VyJyk/LmhpZGRlbjtcblxuXHRcdGxhYmVsbGVkID0gdHJ1ZTtcblx0XHRhd2FpdCBiYW5uZXIucmVmcmVzaE1pY3JvcGhvbmVzKGFuYWx5c2VyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGhpZGRlbldoaWxlVW5sYWJlbGxlZCxcblx0XHRcdFx0aGlkZGVuQWZ0ZXJMYWJlbGxlZDogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5kaWN0YXRpb24tb25ib2FyZGluZy1waWNrZXInKT8uaGlkZGVuLFxuXHRcdFx0XHRvcHRpb25zOiBBcnJheS5mcm9tKGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTE9wdGlvbkVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctcGlja2VyIG9wdGlvbicpLCBvcHRpb24gPT4gb3B0aW9uLnRleHRDb250ZW50KSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGhpZGRlbldoaWxlVW5sYWJlbGxlZDogdHJ1ZSxcblx0XHRcdFx0aGlkZGVuQWZ0ZXJMYWJlbGxlZDogZmFsc2UsXG5cdFx0XHRcdG9wdGlvbnM6IFsnU3R1ZGlvIE1pYyAoU3lzdGVtIGRlZmF1bHQpJywgJ0J1aWx0LWluIE1pYyddLFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZSBkaXNtaXNzZXMgdGhlIGNhcmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3Rlckhvc3QoeyBjb250YWluZXI6IGhvc3QuY29udGFpbmVyLCBmb2N1c1Jvb3Q6IGhvc3Qucm9vdCB9KSk7XG5cblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXHRcdGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctYmFubmVyJykhXG5cdFx0XHQuZGlzcGF0Y2hFdmVudChuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsga2V5OiAnRXNjYXBlJywga2V5Q29kZTogMjcsIGJ1YmJsZXM6IHRydWUgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ2hhdElucHV0U3RhY2tTbG90U2hvd2luZyhob3N0LmNvbnRhaW5lciksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGljdGF0ZXMgc3RyYWlnaHQgYXdheSB3aGVuIHRoZXJlIGlzIG5vIGNoYXQgaW5wdXQgdG8gZG9jayB0bycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zaG93SWZOZWVkZWQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93aW5nIGFnYWluIHJlcGxhY2VzIHRoZSBjYXJkIHJhdGhlciB0aGFuIGhpZGluZyBpdCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVySG9zdCh7IGNvbnRhaW5lcjogaG9zdC5jb250YWluZXIsIGZvY3VzUm9vdDogaG9zdC5yb290IH0pKTtcblxuXHRcdHNlcnZpY2Uuc2hvdygpO1xuXHRcdHNlcnZpY2Uuc2hvdygpO1xuXG5cdFx0Y29uc3QgbWljcm9waG9uZVBpY2tlciA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctcGlja2VyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dmlzaWJsZTogaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGhvc3QuY29udGFpbmVyKSxcblx0XHRcdFx0Y2FyZHM6IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kaWN0YXRpb24tb25ib2FyZGluZy1iYW5uZXInKS5sZW5ndGgsXG5cdFx0XHRcdGhhc01pY3JvcGhvbmVDb250cm9sczogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWRldmljZScpICE9PSBudWxsLFxuXHRcdFx0XHRoYXNXYXZlZm9ybTogaG9zdC5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmRpY3RhdGlvbi1vbmJvYXJkaW5nLXdhdmVmb3JtJykgIT09IG51bGwsXG5cdFx0XHRcdG1pY3JvcGhvbmVQaWNrZXJIaWRkZW46IG1pY3JvcGhvbmVQaWNrZXI/LmhpZGRlbixcblx0XHRcdFx0bWljcm9waG9uZVBpY2tlckRpc3BsYXk6IG1pY3JvcGhvbmVQaWNrZXIgJiYgZG9tLmdldFdpbmRvdyhtaWNyb3Bob25lUGlja2VyKS5nZXRDb21wdXRlZFN0eWxlKG1pY3JvcGhvbmVQaWNrZXIpLmRpc3BsYXksXG5cdFx0XHR9LFxuXHRcdFx0eyB2aXNpYmxlOiB0cnVlLCBjYXJkczogMSwgaGFzTWljcm9waG9uZUNvbnRyb2xzOiB0cnVlLCBoYXNXYXZlZm9ybTogdHJ1ZSwgbWljcm9waG9uZVBpY2tlckhpZGRlbjogdHJ1ZSwgbWljcm9waG9uZVBpY2tlckRpc3BsYXk6ICdub25lJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXQgc2hvd3MgdGhlIGludHJvZHVjdGlvbiBvbiB0aGUgbmV4dCBkaWN0YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3Rlckhvc3QoeyBjb250YWluZXI6IGhvc3QuY29udGFpbmVyLCBmb2N1c1Jvb3Q6IGhvc3Qucm9vdCB9KSk7XG5cblx0XHRzZXJ2aWNlLnNob3dJZk5lZWRlZCgpO1xuXHRcdGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctY2xvc2UnKSEuY2xpY2soKTtcblx0XHRzZXJ2aWNlLnJlc2V0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zaG93SWZOZWVkZWQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dGFjaGVzIHRvIHRoZSBtb3N0IHJlY2VudGx5IGZvY3VzZWQgaG9zdCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBzZWNvbmQgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3Rlckhvc3QoeyBjb250YWluZXI6IGZpcnN0LmNvbnRhaW5lciwgZm9jdXNSb290OiBmaXJzdC5yb290IH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3Rlckhvc3QoeyBjb250YWluZXI6IHNlY29uZC5jb250YWluZXIsIGZvY3VzUm9vdDogc2Vjb25kLnJvb3QgfSkpO1xuXG5cdFx0Ly8gVGhlIHJlbmRlcmVyIHJ1bm5pbmcgdGhlc2UgdGVzdHMgZG9lcyBub3QgcmVsaWFibHkgaGFuZCBvdXQgcmVhbCBmb2N1cyxcblx0XHQvLyBzbyByYWlzZSB0aGUgc2FtZSBldmVudCB0aGUgZm9jdXMgdHJhY2tlciBsaXN0ZW5zIGZvci5cblx0XHRzZWNvbmQucm9vdC5mb2N1cygpO1xuXHRcdHNlY29uZC5yb290LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2ZvY3VzJykpO1xuXHRcdHNlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRmaXJzdDogaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGZpcnN0LmNvbnRhaW5lciksXG5cdFx0XHRcdHNlY29uZDogaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKHNlY29uZC5jb250YWluZXIpLFxuXHRcdFx0fSxcblx0XHRcdHsgZmlyc3Q6IGZhbHNlLCBzZWNvbmQ6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29mZmVycyBhIHdheSB0byBjaGFuZ2UgdGhlIHNldHRpbmdzIGFuZCBob3cgZGljdGF0aW9uIHdyaXRlcycsICgpID0+IHtcblx0XHRjb25zdCBleGVjdXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB0ZWxlbWV0cnlFdmVudHM6IElUZWxlbWV0cnlFdmVudFtdID0gW107XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZGlzcG9zYWJsZXMsIGV4ZWN1dGVkLCB0ZWxlbWV0cnlFdmVudHMpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3Rlckhvc3QoeyBjb250YWluZXI6IGhvc3QuY29udGFpbmVyLCBmb2N1c1Jvb3Q6IGhvc3Qucm9vdCB9KSk7XG5cblx0XHRzZXJ2aWNlLnNob3coKTtcblx0XHRjb25zdCBsaW5rcyA9IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEFuY2hvckVsZW1lbnQ+KCcuZGljdGF0aW9uLW9uYm9hcmRpbmctZGVzY3JpcHRpb24gYScpO1xuXHRcdGxpbmtzLmZvckVhY2gobGluayA9PiBsaW5rLmNsaWNrKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0Y291bnQ6IGxpbmtzLmxlbmd0aCxcblx0XHRcdFx0Ly8gRXZlcnkgbGluayBoYXMgdG8gYmUgcmVhY2hhYmxlIHdpdGhvdXQgYSBtb3VzZSwgbm90IGp1c3QgdGhlIGZpcnN0LlxuXHRcdFx0XHRrZXlib2FyZFJlYWNoYWJsZTogQXJyYXkuZnJvbShsaW5rcykuZXZlcnkobGluayA9PiBsaW5rLnRhYkluZGV4ID09PSAwKSxcblx0XHRcdFx0ZXhlY3V0ZWQsXG5cdFx0XHRcdHRlbGVtZXRyeUV2ZW50cyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNvdW50OiAyLFxuXHRcdFx0XHRrZXlib2FyZFJlYWNoYWJsZTogdHJ1ZSxcblx0XHRcdFx0ZXhlY3V0ZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNvbmZpZ3VyZURpY3RhdGlvbkluc3RydWN0aW9ucyddLFxuXHRcdFx0XHR0ZWxlbWV0cnlFdmVudHM6IFtcblx0XHRcdFx0XHR7IG5hbWU6ICdkaWN0YXRpb25PbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnc2hvd24nLCBzb3VyY2U6ICdtYW51YWwnIH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdkaWN0YXRpb25PbmJvYXJkaW5nLmFjdGlvbicsIGRhdGE6IHsgYWN0aW9uOiAnb3BlblNldHRpbmdzJywgc291cmNlOiAnbWFudWFsJyB9IH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnZGljdGF0aW9uT25ib2FyZGluZy5hY3Rpb24nLCBkYXRhOiB7IGFjdGlvbjogJ29wZW5JbnN0cnVjdGlvbnMnLCBzb3VyY2U6ICdtYW51YWwnIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NpbmcgdGhlIGhvc3QgaXQgaXMgZG9ja2VkIHRvIHRha2VzIHRoZSBjYXJkIGRvd24gd2l0aCBpdCcsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHNlcnZpY2UucmVnaXN0ZXJIb3N0KHsgY29udGFpbmVyOiBob3N0LmNvbnRhaW5lciwgZm9jdXNSb290OiBob3N0LnJvb3QgfSk7XG5cblx0XHRzZXJ2aWNlLnNob3coKTtcblx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dmlzaWJsZTogaXNDaGF0SW5wdXRTdGFja1Nsb3RTaG93aW5nKGhvc3QuY29udGFpbmVyKSxcblx0XHRcdFx0Y2FyZHM6IGhvc3QuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kaWN0YXRpb24tb25ib2FyZGluZy1iYW5uZXInKS5sZW5ndGgsXG5cdFx0XHR9LFxuXHRcdFx0eyB2aXNpYmxlOiBmYWxzZSwgY2FyZHM6IDAgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBQ3JCLFNBQTBCLG9CQUFvQjtBQUM5QyxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx3QkFBd0IsMkJBQTJCLDRCQUE0Qix5QkFBeUI7QUFDakgsU0FBUyxtQ0FBbUM7QUFHNUMsU0FBUyxPQUFPLE1BQXVCLFVBQWtCLE9BQWdDO0FBQ3hGLFNBQU8sRUFBRSxNQUFNLFVBQVUsT0FBTyxTQUFTLElBQUksUUFBUSxPQUFPLENBQUMsR0FBRztBQUNqRTtBQUVBLE1BQU0sd0JBQXdCLE1BQU07QUFFbkMsUUFBTSxjQUFjLHdDQUF3QztBQUFBLEVBRzVELE1BQU0sNkJBQTZCLDBCQUEwQjtBQUFBLElBQzVELFlBQTZCLFFBQTJCO0FBQ3ZELFlBQU07QUFEc0I7QUFBQSxJQUU3QjtBQUFBLElBRVMsV0FBVyxXQUFvQixNQUFzQjtBQUM3RCxVQUFJLFdBQVc7QUFDZCxhQUFLLE9BQU8sS0FBSyxFQUFFLE1BQU0sV0FBVyxLQUFLLENBQUM7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsV0FBUyxXQUFXLE9BQW9GO0FB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
