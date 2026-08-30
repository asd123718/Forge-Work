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
import { addDisposableListener } from "../../../base/browser/dom.js";
import { CachedFunction } from "../../../base/common/cache.js";
import { getStructuralKey } from "../../../base/common/equals.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { FileAccess } from "../../../base/common/network.js";
import { derived, observableFromEvent, ValueWithChangeEventFromObservable } from "../../../base/common/observable.js";
import { localize } from "../../../nls.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { observableConfigValue } from "../../observable/common/platformObservableUtils.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
const IAccessibilitySignalService = createDecorator("accessibilitySignalService");
const AcknowledgeDocCommentsToken = /* @__PURE__ */ Symbol("AcknowledgeDocCommentsToken");
let AccessibilitySignalService = class extends Disposable {
  constructor(configurationService, accessibilityService, telemetryService) {
    super();
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.telemetryService = telemetryService;
    this.sounds = /* @__PURE__ */ new Map();
    this.screenReaderAttached = observableFromEvent(
      this,
      this.accessibilityService.onDidChangeScreenReaderOptimized,
      () => (
        /** @description accessibilityService.onDidChangeScreenReaderOptimized */
        this.accessibilityService.isScreenReaderOptimized()
      )
    );
    this.sentTelemetry = /* @__PURE__ */ new Set();
    this.playingSounds = /* @__PURE__ */ new Set();
    this._signalConfigValue = new CachedFunction((signal) => observableConfigValue(signal.settingsKey, { sound: "off", announcement: "off" }, this.configurationService));
    this._signalEnabledState = new CachedFunction(
      { getCacheKey: getStructuralKey },
      (arg) => {
        return derived((reader) => {
          const setting = this._signalConfigValue.get(arg.signal).read(reader);
          if (arg.modality === "sound" || arg.modality === void 0) {
            if (arg.signal.managesOwnEnablement || checkEnabledState(setting.sound, () => this.screenReaderAttached.read(reader), arg.userGesture)) {
              return true;
            }
          }
          if (arg.modality === "announcement" || arg.modality === void 0) {
            if (checkEnabledState(setting.announcement, () => this.screenReaderAttached.read(reader), arg.userGesture)) {
              return true;
            }
          }
          return false;
        }).recomputeInitiallyAndOnChange(this._store);
      }
    );
  }
  getEnabledState(signal, userGesture, modality) {
    return new ValueWithChangeEventFromObservable(this._signalEnabledState.get({ signal, userGesture, modality }));
  }
  async playSignal(signal, options = {}) {
    const shouldPlayAnnouncement = options.modality === "announcement" || options.modality === void 0;
    const announcementMessage = options.customAlertMessage ?? signal.announcementMessage;
    if (shouldPlayAnnouncement && this.isAnnouncementEnabled(signal, options.userGesture) && announcementMessage) {
      this.accessibilityService.status(announcementMessage);
    }
    const shouldPlaySound = options.modality === "sound" || options.modality === void 0;
    if (shouldPlaySound && this.isSoundEnabled(signal, options.userGesture)) {
      this.sendSignalTelemetry(signal, options.source);
      await this.playSound(signal.sound.getSound(), options.allowManyInParallel);
    }
  }
  async playSignals(signals) {
    for (const signal of signals) {
      this.sendSignalTelemetry("signal" in signal ? signal.signal : signal, "source" in signal ? signal.source : void 0);
    }
    const signalArray = signals.map((s) => "signal" in s ? s.signal : s);
    const announcements = signalArray.filter((signal) => this.isAnnouncementEnabled(signal)).map((s) => s.announcementMessage);
    if (announcements.length) {
      this.accessibilityService.status(announcements.join(", "));
    }
    const sounds = new Set(signalArray.filter((signal) => this.isSoundEnabled(signal)).map((signal) => signal.sound.getSound()));
    await Promise.all(Array.from(sounds).map((sound) => this.playSound(sound, true)));
  }
  sendSignalTelemetry(signal, source) {
    const isScreenReaderOptimized = this.accessibilityService.isScreenReaderOptimized();
    const key = signal.name + (source ? `::${source}` : "") + (isScreenReaderOptimized ? "{screenReaderOptimized}" : "");
    if (this.sentTelemetry.has(key) || this.getVolumeInPercent() === 0) {
      return;
    }
    this.sentTelemetry.add(key);
    this.telemetryService.publicLog2("signal.played", {
      signal: signal.name,
      source: source ?? "",
      isScreenReaderOptimized
    });
  }
  getVolumeInPercent() {
    const volume = this.configurationService.getValue("accessibility.signalOptions.volume");
    if (typeof volume !== "number") {
      return 50;
    }
    return Math.max(Math.min(volume, 100), 0);
  }
  async playSound(sound, allowManyInParallel = false) {
    if (!allowManyInParallel && this.playingSounds.has(sound)) {
      return;
    }
    this.playingSounds.add(sound);
    const url = FileAccess.asBrowserUri(`vs/platform/accessibilitySignal/browser/media/${sound.fileName}`).toString(true);
    try {
      const sound2 = this.sounds.get(url);
      if (sound2) {
        sound2.volume = this.getVolumeInPercent() / 100;
        sound2.currentTime = 0;
        await sound2.play();
      } else {
        const playedSound = await playAudio(url, this.getVolumeInPercent() / 100);
        this.sounds.set(url, playedSound);
      }
    } catch (e) {
      if (!e.message.includes("play() can only be initiated by a user gesture")) {
        console.error("Error while playing sound", e);
      }
    } finally {
      this.playingSounds.delete(sound);
    }
  }
  playSignalLoop(signal, milliseconds) {
    let playing = true;
    const playSound = () => {
      if (playing) {
        this.playSignal(signal, { allowManyInParallel: true }).finally(() => {
          setTimeout(() => {
            if (playing) {
              playSound();
            }
          }, milliseconds);
        });
      }
    };
    playSound();
    return toDisposable(() => playing = false);
  }
  isAnnouncementEnabled(signal, userGesture) {
    if (!signal.announcementMessage) {
      return false;
    }
    return this._signalEnabledState.get({ signal, userGesture: !!userGesture, modality: "announcement" }).get();
  }
  isSoundEnabled(signal, userGesture) {
    return this._signalEnabledState.get({ signal, userGesture: !!userGesture, modality: "sound" }).get();
  }
  onSoundEnabledChanged(signal) {
    return this.getEnabledState(signal, false).onDidChange;
  }
  getDelayMs(signal, modality, mode) {
    if (!this.configurationService.getValue("accessibility.signalOptions.debouncePositionChanges")) {
      return 0;
    }
    let value;
    if (signal.name === AccessibilitySignal.errorAtPosition.name && mode === "positional") {
      value = this.configurationService.getValue("accessibility.signalOptions.experimental.delays.errorAtPosition");
    } else if (signal.name === AccessibilitySignal.warningAtPosition.name && mode === "positional") {
      value = this.configurationService.getValue("accessibility.signalOptions.experimental.delays.warningAtPosition");
    } else {
      value = this.configurationService.getValue("accessibility.signalOptions.experimental.delays.general");
    }
    return modality === "sound" ? value.sound : value.announcement;
  }
};
AccessibilitySignalService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IAccessibilityService),
  __decorateParam(2, ITelemetryService)
], AccessibilitySignalService);
function checkEnabledState(state, getScreenReaderAttached, isTriggeredByUserGesture) {
  return state === "on" || state === "always" || state === "auto" && getScreenReaderAttached() || state === "userGesture" && isTriggeredByUserGesture;
}
async function playAudio(url, volume) {
  const disposables = new DisposableStore();
  try {
    return await doPlayAudio(url, volume, disposables);
  } finally {
    disposables.dispose();
  }
}
function doPlayAudio(url, volume, disposables) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.volume = volume;
    disposables.add(addDisposableListener(audio, "ended", () => {
      resolve(audio);
    }));
    disposables.add(addDisposableListener(audio, "error", (e) => {
      reject(e.error);
    }));
    audio.play().catch((e) => {
      reject(e);
    });
  });
}
const _Sound = class _Sound {
  constructor(fileName) {
    this.fileName = fileName;
  }
  static register(options) {
    const sound = new _Sound(options.fileName);
    return sound;
  }
};
_Sound.error = _Sound.register({ fileName: "error.mp3" });
_Sound.warning = _Sound.register({ fileName: "warning.mp3" });
_Sound.success = _Sound.register({ fileName: "success.mp3" });
_Sound.foldedArea = _Sound.register({ fileName: "foldedAreas.mp3" });
_Sound.break = _Sound.register({ fileName: "break.mp3" });
_Sound.quickFixes = _Sound.register({ fileName: "quickFixes.mp3" });
_Sound.taskCompleted = _Sound.register({ fileName: "taskCompleted.mp3" });
_Sound.taskFailed = _Sound.register({ fileName: "taskFailed.mp3" });
_Sound.terminalBell = _Sound.register({ fileName: "terminalBell.mp3" });
_Sound.diffLineInserted = _Sound.register({ fileName: "diffLineInserted.mp3" });
_Sound.diffLineDeleted = _Sound.register({ fileName: "diffLineDeleted.mp3" });
_Sound.diffLineModified = _Sound.register({ fileName: "diffLineModified.mp3" });
_Sound.requestSent = _Sound.register({ fileName: "requestSent.mp3" });
_Sound.responseReceived1 = _Sound.register({ fileName: "responseReceived1.mp3" });
_Sound.responseReceived2 = _Sound.register({ fileName: "responseReceived2.mp3" });
_Sound.responseReceived3 = _Sound.register({ fileName: "responseReceived3.mp3" });
_Sound.responseReceived4 = _Sound.register({ fileName: "responseReceived4.mp3" });
_Sound.clear = _Sound.register({ fileName: "clear.mp3" });
_Sound.save = _Sound.register({ fileName: "save.mp3" });
_Sound.format = _Sound.register({ fileName: "format.mp3" });
_Sound.voiceRecordingStarted = _Sound.register({ fileName: "voiceRecordingStarted.mp3" });
_Sound.voiceRecordingStopped = _Sound.register({ fileName: "voiceRecordingStopped.mp3" });
_Sound.progress = _Sound.register({ fileName: "progress.mp3" });
_Sound.chatEditModifiedFile = _Sound.register({ fileName: "chatEditModifiedFile.mp3" });
_Sound.editsKept = _Sound.register({ fileName: "editsKept.mp3" });
_Sound.editsUndone = _Sound.register({ fileName: "editsUndone.mp3" });
_Sound.nextEditSuggestion = _Sound.register({ fileName: "nextEditSuggestion.mp3" });
_Sound.terminalCommandSucceeded = _Sound.register({ fileName: "terminalCommandSucceeded.mp3" });
_Sound.chatUserActionRequired = _Sound.register({ fileName: "chatUserActionRequired.mp3" });
_Sound.codeActionTriggered = _Sound.register({ fileName: "codeActionTriggered.mp3" });
_Sound.codeActionApplied = _Sound.register({ fileName: "codeActionApplied.mp3" });
let Sound = _Sound;
class SoundSource {
  constructor(randomOneOf) {
    this.randomOneOf = randomOneOf;
  }
  getSound(deterministic = false) {
    if (deterministic || this.randomOneOf.length === 1) {
      return this.randomOneOf[0];
    } else {
      const index = Math.floor(Math.random() * this.randomOneOf.length);
      return this.randomOneOf[index];
    }
  }
}
const _AccessibilitySignal = class _AccessibilitySignal {
  constructor(sound, name, legacySoundSettingsKey, settingsKey, legacyAnnouncementSettingsKey, announcementMessage, managesOwnEnablement = false) {
    this.sound = sound;
    this.name = name;
    this.legacySoundSettingsKey = legacySoundSettingsKey;
    this.settingsKey = settingsKey;
    this.legacyAnnouncementSettingsKey = legacyAnnouncementSettingsKey;
    this.announcementMessage = announcementMessage;
    this.managesOwnEnablement = managesOwnEnablement;
  }
  static register(options) {
    const soundSource = new SoundSource("randomOneOf" in options.sound ? options.sound.randomOneOf : [options.sound]);
    const signal = new _AccessibilitySignal(
      soundSource,
      options.name,
      options.legacySoundSettingsKey,
      options.settingsKey,
      options.legacyAnnouncementSettingsKey,
      options.announcementMessage,
      options.managesOwnEnablement
    );
    _AccessibilitySignal._signals.add(signal);
    return signal;
  }
  static get allAccessibilitySignals() {
    return [...this._signals];
  }
};
_AccessibilitySignal._signals = /* @__PURE__ */ new Set();
_AccessibilitySignal.errorAtPosition = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.positionHasError.name", "Error at Position"),
  sound: Sound.error,
  announcementMessage: localize("accessibility.signals.positionHasError", "Error"),
  settingsKey: "accessibility.signals.positionHasError",
  delaySettingsKey: "accessibility.signalOptions.delays.errorAtPosition"
});
_AccessibilitySignal.warningAtPosition = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.positionHasWarning.name", "Warning at Position"),
  sound: Sound.warning,
  announcementMessage: localize("accessibility.signals.positionHasWarning", "Warning"),
  settingsKey: "accessibility.signals.positionHasWarning",
  delaySettingsKey: "accessibility.signalOptions.delays.warningAtPosition"
});
_AccessibilitySignal.errorOnLine = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasError.name", "Error on Line"),
  sound: Sound.error,
  legacySoundSettingsKey: "audioCues.lineHasError",
  legacyAnnouncementSettingsKey: "accessibility.alert.error",
  announcementMessage: localize("accessibility.signals.lineHasError", "Error on Line"),
  settingsKey: "accessibility.signals.lineHasError"
});
_AccessibilitySignal.warningOnLine = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasWarning.name", "Warning on Line"),
  sound: Sound.warning,
  legacySoundSettingsKey: "audioCues.lineHasWarning",
  legacyAnnouncementSettingsKey: "accessibility.alert.warning",
  announcementMessage: localize("accessibility.signals.lineHasWarning", "Warning on Line"),
  settingsKey: "accessibility.signals.lineHasWarning"
});
_AccessibilitySignal.foldedArea = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasFoldedArea.name", "Folded Area on Line"),
  sound: Sound.foldedArea,
  legacySoundSettingsKey: "audioCues.lineHasFoldedArea",
  legacyAnnouncementSettingsKey: "accessibility.alert.foldedArea",
  announcementMessage: localize("accessibility.signals.lineHasFoldedArea", "Folded"),
  settingsKey: "accessibility.signals.lineHasFoldedArea"
});
_AccessibilitySignal.break = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasBreakpoint.name", "Breakpoint on Line"),
  sound: Sound.break,
  legacySoundSettingsKey: "audioCues.lineHasBreakpoint",
  legacyAnnouncementSettingsKey: "accessibility.alert.breakpoint",
  announcementMessage: localize("accessibility.signals.lineHasBreakpoint", "Breakpoint"),
  settingsKey: "accessibility.signals.lineHasBreakpoint"
});
_AccessibilitySignal.inlineSuggestion = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasInlineSuggestion.name", "Inline Suggestion on Line"),
  sound: Sound.quickFixes,
  legacySoundSettingsKey: "audioCues.lineHasInlineSuggestion",
  settingsKey: "accessibility.signals.lineHasInlineSuggestion"
});
_AccessibilitySignal.nextEditSuggestion = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.nextEditSuggestion.name", "Next Edit Suggestion on Line"),
  sound: Sound.nextEditSuggestion,
  legacySoundSettingsKey: "audioCues.nextEditSuggestion",
  settingsKey: "accessibility.signals.nextEditSuggestion",
  announcementMessage: localize("accessibility.signals.nextEditSuggestion", "Next Edit Suggestion")
});
_AccessibilitySignal.terminalQuickFix = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.terminalQuickFix.name", "Terminal Quick Fix"),
  sound: Sound.quickFixes,
  legacySoundSettingsKey: "audioCues.terminalQuickFix",
  legacyAnnouncementSettingsKey: "accessibility.alert.terminalQuickFix",
  announcementMessage: localize("accessibility.signals.terminalQuickFix", "Quick Fix"),
  settingsKey: "accessibility.signals.terminalQuickFix"
});
_AccessibilitySignal.onDebugBreak = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.onDebugBreak.name", "Debugger Stopped on Breakpoint"),
  sound: Sound.break,
  legacySoundSettingsKey: "audioCues.onDebugBreak",
  legacyAnnouncementSettingsKey: "accessibility.alert.onDebugBreak",
  announcementMessage: localize("accessibility.signals.onDebugBreak", "Breakpoint"),
  settingsKey: "accessibility.signals.onDebugBreak"
});
_AccessibilitySignal.noInlayHints = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.noInlayHints", "No Inlay Hints on Line"),
  sound: Sound.error,
  legacySoundSettingsKey: "audioCues.noInlayHints",
  legacyAnnouncementSettingsKey: "accessibility.alert.noInlayHints",
  announcementMessage: localize("accessibility.signals.noInlayHints", "No Inlay Hints"),
  settingsKey: "accessibility.signals.noInlayHints"
});
_AccessibilitySignal.taskCompleted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.taskCompleted", "Task Completed"),
  sound: Sound.taskCompleted,
  legacySoundSettingsKey: "audioCues.taskCompleted",
  legacyAnnouncementSettingsKey: "accessibility.alert.taskCompleted",
  announcementMessage: localize("accessibility.signals.taskCompleted", "Task Completed"),
  settingsKey: "accessibility.signals.taskCompleted"
});
_AccessibilitySignal.taskFailed = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.taskFailed", "Task Failed"),
  sound: Sound.taskFailed,
  legacySoundSettingsKey: "audioCues.taskFailed",
  legacyAnnouncementSettingsKey: "accessibility.alert.taskFailed",
  announcementMessage: localize("accessibility.signals.taskFailed", "Task Failed"),
  settingsKey: "accessibility.signals.taskFailed"
});
_AccessibilitySignal.terminalCommandFailed = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.terminalCommandFailed", "Terminal Command Failed"),
  sound: Sound.error,
  legacySoundSettingsKey: "audioCues.terminalCommandFailed",
  legacyAnnouncementSettingsKey: "accessibility.alert.terminalCommandFailed",
  announcementMessage: localize("accessibility.signals.terminalCommandFailed", "Command Failed"),
  settingsKey: "accessibility.signals.terminalCommandFailed"
});
_AccessibilitySignal.terminalCommandSucceeded = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.terminalCommandSucceeded", "Terminal Command Succeeded"),
  sound: Sound.terminalCommandSucceeded,
  announcementMessage: localize("accessibility.signals.terminalCommandSucceeded", "Command Succeeded"),
  settingsKey: "accessibility.signals.terminalCommandSucceeded"
});
_AccessibilitySignal.terminalBell = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.terminalBell", "Terminal Bell"),
  sound: Sound.terminalBell,
  legacySoundSettingsKey: "audioCues.terminalBell",
  legacyAnnouncementSettingsKey: "accessibility.alert.terminalBell",
  announcementMessage: localize("accessibility.signals.terminalBell", "Terminal Bell"),
  settingsKey: "accessibility.signals.terminalBell"
});
_AccessibilitySignal.notebookCellCompleted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.notebookCellCompleted", "Notebook Cell Completed"),
  sound: Sound.taskCompleted,
  legacySoundSettingsKey: "audioCues.notebookCellCompleted",
  legacyAnnouncementSettingsKey: "accessibility.alert.notebookCellCompleted",
  announcementMessage: localize("accessibility.signals.notebookCellCompleted", "Notebook Cell Completed"),
  settingsKey: "accessibility.signals.notebookCellCompleted"
});
_AccessibilitySignal.notebookCellFailed = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.notebookCellFailed", "Notebook Cell Failed"),
  sound: Sound.taskFailed,
  legacySoundSettingsKey: "audioCues.notebookCellFailed",
  legacyAnnouncementSettingsKey: "accessibility.alert.notebookCellFailed",
  announcementMessage: localize("accessibility.signals.notebookCellFailed", "Notebook Cell Failed"),
  settingsKey: "accessibility.signals.notebookCellFailed"
});
_AccessibilitySignal.diffLineInserted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.diffLineInserted", "Diff Line Inserted"),
  sound: Sound.diffLineInserted,
  legacySoundSettingsKey: "audioCues.diffLineInserted",
  settingsKey: "accessibility.signals.diffLineInserted"
});
_AccessibilitySignal.diffLineDeleted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.diffLineDeleted", "Diff Line Deleted"),
  sound: Sound.diffLineDeleted,
  legacySoundSettingsKey: "audioCues.diffLineDeleted",
  settingsKey: "accessibility.signals.diffLineDeleted"
});
_AccessibilitySignal.diffLineModified = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.diffLineModified", "Diff Line Modified"),
  sound: Sound.diffLineModified,
  legacySoundSettingsKey: "audioCues.diffLineModified",
  settingsKey: "accessibility.signals.diffLineModified"
});
_AccessibilitySignal.chatEditModifiedFile = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.chatEditModifiedFile", "Chat Edit Modified File"),
  sound: Sound.chatEditModifiedFile,
  announcementMessage: localize("accessibility.signals.chatEditModifiedFile", "File Modified from Chat Edits"),
  settingsKey: "accessibility.signals.chatEditModifiedFile"
});
_AccessibilitySignal.chatRequestSent = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.chatRequestSent", "Chat Request Sent"),
  sound: Sound.requestSent,
  legacySoundSettingsKey: "audioCues.chatRequestSent",
  legacyAnnouncementSettingsKey: "accessibility.alert.chatRequestSent",
  announcementMessage: localize("accessibility.signals.chatRequestSent", "Chat Request Sent"),
  settingsKey: "accessibility.signals.chatRequestSent"
});
_AccessibilitySignal.chatResponseReceived = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.chatResponseReceived", "Chat Response Received"),
  legacySoundSettingsKey: "audioCues.chatResponseReceived",
  sound: {
    randomOneOf: [
      Sound.responseReceived1,
      Sound.responseReceived2,
      Sound.responseReceived3,
      Sound.responseReceived4
    ]
  },
  settingsKey: "accessibility.signals.chatResponseReceived"
});
_AccessibilitySignal.codeActionTriggered = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.codeActionRequestTriggered", "Code Action Request Triggered"),
  sound: Sound.codeActionTriggered,
  legacySoundSettingsKey: "audioCues.codeActionRequestTriggered",
  legacyAnnouncementSettingsKey: "accessibility.alert.codeActionRequestTriggered",
  announcementMessage: localize("accessibility.signals.codeActionRequestTriggered", "Code Action Request Triggered"),
  settingsKey: "accessibility.signals.codeActionTriggered"
});
_AccessibilitySignal.codeActionApplied = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.codeActionApplied", "Code Action Applied"),
  legacySoundSettingsKey: "audioCues.codeActionApplied",
  sound: Sound.codeActionApplied,
  settingsKey: "accessibility.signals.codeActionApplied"
});
_AccessibilitySignal.progress = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.progress", "Progress"),
  sound: Sound.progress,
  legacySoundSettingsKey: "audioCues.chatResponsePending",
  legacyAnnouncementSettingsKey: "accessibility.alert.progress",
  announcementMessage: localize("accessibility.signals.progress", "Progress"),
  settingsKey: "accessibility.signals.progress"
});
_AccessibilitySignal.clear = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.clear", "Clear"),
  sound: Sound.clear,
  legacySoundSettingsKey: "audioCues.clear",
  legacyAnnouncementSettingsKey: "accessibility.alert.clear",
  announcementMessage: localize("accessibility.signals.clear", "Clear"),
  settingsKey: "accessibility.signals.clear"
});
_AccessibilitySignal.save = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.save", "Save"),
  sound: Sound.save,
  legacySoundSettingsKey: "audioCues.save",
  legacyAnnouncementSettingsKey: "accessibility.alert.save",
  announcementMessage: localize("accessibility.signals.save", "Save"),
  settingsKey: "accessibility.signals.save"
});
_AccessibilitySignal.format = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.format", "Format"),
  sound: Sound.format,
  legacySoundSettingsKey: "audioCues.format",
  legacyAnnouncementSettingsKey: "accessibility.alert.format",
  announcementMessage: localize("accessibility.signals.format", "Format"),
  settingsKey: "accessibility.signals.format"
});
_AccessibilitySignal.voiceRecordingStarted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.voiceRecordingStarted", "Voice Recording Started"),
  sound: Sound.voiceRecordingStarted,
  legacySoundSettingsKey: "audioCues.voiceRecordingStarted",
  settingsKey: "accessibility.signals.voiceRecordingStarted"
});
_AccessibilitySignal.voiceModeStarted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.voiceModeStarted", "Voice Mode Started"),
  sound: Sound.voiceRecordingStarted,
  announcementMessage: localize("accessibility.signals.voiceModeStarted", "Voice Mode Started"),
  settingsKey: "accessibility.signals.voiceModeStarted"
});
_AccessibilitySignal.voiceRecordingStopped = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.voiceRecordingStopped", "Voice Recording Stopped"),
  sound: Sound.voiceRecordingStopped,
  legacySoundSettingsKey: "audioCues.voiceRecordingStopped",
  settingsKey: "accessibility.signals.voiceRecordingStopped"
});
_AccessibilitySignal.voiceModeStopped = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.voiceModeStopped", "Voice Mode Stopped"),
  sound: Sound.voiceRecordingStopped,
  announcementMessage: localize("accessibility.signals.voiceModeStopped", "Voice Mode Stopped"),
  settingsKey: "accessibility.signals.voiceModeStopped"
});
_AccessibilitySignal.editsKept = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.editsKept", "Edits Kept"),
  sound: Sound.editsKept,
  announcementMessage: localize("accessibility.signals.editsKept", "Edits Kept"),
  settingsKey: "accessibility.signals.editsKept"
});
_AccessibilitySignal.editsUndone = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.editsUndone", "Undo Edits"),
  sound: Sound.editsUndone,
  announcementMessage: localize("accessibility.signals.editsUndone", "Edits Undone"),
  settingsKey: "accessibility.signals.editsUndone"
});
_AccessibilitySignal.chatUserActionRequired = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.chatUserActionRequired", "Chat User Action Required"),
  sound: Sound.chatUserActionRequired,
  announcementMessage: localize("accessibility.signals.chatUserActionRequired", "Chat User Action Required"),
  settingsKey: "accessibility.signals.chatUserActionRequired"
});
let AccessibilitySignal = _AccessibilitySignal;
export {
  AccessibilitySignal,
  AccessibilitySignalService,
  AcknowledgeDocCommentsToken,
  IAccessibilitySignalService,
  Sound,
  SoundSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWNjZXNzaWJpbGl0eVNpZ25hbFxcYnJvd3NlclxcYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENhY2hlZEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FjaGUuanMnO1xuaW1wb3J0IHsgZ2V0U3RydWN0dXJhbEtleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2VxdWFscy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgSVZhbHVlV2l0aENoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIFZhbHVlV2l0aENoYW5nZUV2ZW50RnJvbU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuXG5leHBvcnQgY29uc3QgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZT4oJ2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwbGF5U2lnbmFsKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgb3B0aW9ucz86IElBY2Nlc3NiaWxpdHlTaWduYWxPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0cGxheVNpZ25hbHMoc2lnbmFsczogKEFjY2Vzc2liaWxpdHlTaWduYWwgfCB7IHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbDsgc291cmNlOiBzdHJpbmcgfSlbXSk6IFByb21pc2U8dm9pZD47XG5cdHBsYXlTaWduYWxMb29wKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgbWlsbGlzZWNvbmRzOiBudW1iZXIpOiBJRGlzcG9zYWJsZTtcblxuXHRnZXRFbmFibGVkU3RhdGUoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCB1c2VyR2VzdHVyZTogYm9vbGVhbiwgbW9kYWxpdHk/OiBBY2Nlc3NpYmlsaXR5TW9kYWxpdHkgfCB1bmRlZmluZWQpOiBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQ8Ym9vbGVhbj47XG5cdGdldERlbGF5TXMoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBtb2RhbGl0eTogQWNjZXNzaWJpbGl0eU1vZGFsaXR5LCBtb2RlOiAnbGluZScgfCAncG9zaXRpb25hbCcpOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBBdm9pZCB0aGlzIG1ldGhvZCBhbmQgcHJlZmVyIGAucGxheVNpZ25hbGAhXG5cdCAqIE9ubHkgdXNlIGl0IHdoZW4geW91IHdhbnQgdG8gcGxheSB0aGUgc291bmQgcmVnYXJkbGVzcyBvZiBlbmFibGVtZW50LCBlLmcuIGluIHRoZSBzZXR0aW5ncyBxdWljayBwaWNrLlxuXHQgKi9cblx0cGxheVNvdW5kKHNpZ25hbDogU291bmQsIGFsbG93TWFueUluUGFyYWxsZWw6IGJvb2xlYW4sIHRva2VuOiB0eXBlb2YgQWNrbm93bGVkZ2VEb2NDb21tZW50c1Rva2VuKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKiogQGRlcHJlY2F0ZWQgVXNlIGdldEVuYWJsZWRTdGF0ZSguLi4pLm9uQ2hhbmdlICovXG5cdGlzU291bmRFbmFibGVkKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCk6IGJvb2xlYW47XG5cdC8qKiBAZGVwcmVjYXRlZCBVc2UgZ2V0RW5hYmxlZFN0YXRlKC4uLikudmFsdWUgKi9cblx0aXNBbm5vdW5jZW1lbnRFbmFibGVkKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCk6IGJvb2xlYW47XG5cdC8qKiBAZGVwcmVjYXRlZCBVc2UgZ2V0RW5hYmxlZFN0YXRlKC4uLikub25DaGFuZ2UgKi9cblx0b25Tb3VuZEVuYWJsZWRDaGFuZ2VkKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCk6IEV2ZW50PHZvaWQ+O1xufVxuXG4vKiogTWFrZSBzdXJlIHlvdSB1bmRlcnN0YW5kIHRoZSBkb2MgY29tbWVudHMgb2YgdGhlIG1ldGhvZCB5b3Ugd2FudCB0byBjYWxsIHdoZW4gdXNpbmcgdGhpcyB0b2tlbiEgKi9cbmV4cG9ydCBjb25zdCBBY2tub3dsZWRnZURvY0NvbW1lbnRzVG9rZW4gPSBTeW1ib2woJ0Fja25vd2xlZGdlRG9jQ29tbWVudHNUb2tlbicpO1xuXG5leHBvcnQgdHlwZSBBY2Nlc3NpYmlsaXR5TW9kYWxpdHkgPSAnc291bmQnIHwgJ2Fubm91bmNlbWVudCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjY2Vzc2JpbGl0eVNpZ25hbE9wdGlvbnMge1xuXHRhbGxvd01hbnlJblBhcmFsbGVsPzogYm9vbGVhbjtcblxuXHRtb2RhbGl0eT86IEFjY2Vzc2liaWxpdHlNb2RhbGl0eTtcblxuXHQvKipcblx0ICogVGhlIHNvdXJjZSB0aGF0IHRyaWdnZXJlZCB0aGUgc2lnbmFsIChlLmcuIFwiZGlmZkVkaXRvci5jdXJzb3JQb3NpdGlvbkNoYW5nZWRcIikuXG5cdCAqL1xuXHRzb3VyY2U/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEZvciBhY3Rpb25zIGxpa2Ugc2F2ZSBvciBmb3JtYXQsIGRlcGVuZGluZyBvbiB0aGVcblx0ICogY29uZmlndXJlZCB2YWx1ZSwgd2Ugd2lsbCBvbmx5XG5cdCAqIHBsYXkgdGhlIHNvdW5kIGlmIHRoZSB1c2VyIHRyaWdnZXJlZCB0aGUgYWN0aW9uLlxuXHQgKi9cblx0dXNlckdlc3R1cmU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgY3VzdG9tIG1lc3NhZ2UgdG8gYWxlcnQgd2l0aC5cblx0ICogVGhpcyB3aWxsIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGFubm91bmNlbWVudCBtZXNzYWdlLlxuXHQgKi9cblx0Y3VzdG9tQWxlcnRNZXNzYWdlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2NyZWVuUmVhZGVyQXR0YWNoZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VudFRlbGVtZXRyeTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNvdW5kcyA9IG5ldyBNYXAoKTtcblx0XHR0aGlzLnNjcmVlblJlYWRlckF0dGFjaGVkID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCxcblx0XHRcdCgpID0+IC8qKiBAZGVzY3JpcHRpb24gYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQgKi8gdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpXG5cdFx0KTtcblx0XHR0aGlzLnNlbnRUZWxlbWV0cnkgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLnBsYXlpbmdTb3VuZHMgPSBuZXcgU2V0PFNvdW5kPigpO1xuXHRcdHRoaXMuX3NpZ25hbENvbmZpZ1ZhbHVlID0gbmV3IENhY2hlZEZ1bmN0aW9uKChzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWwpID0+IG9ic2VydmFibGVDb25maWdWYWx1ZTx7XG5cdFx0XHRzb3VuZDogRW5hYmxlZFN0YXRlO1xuXHRcdFx0YW5ub3VuY2VtZW50OiBFbmFibGVkU3RhdGU7XG5cdFx0fT4oc2lnbmFsLnNldHRpbmdzS2V5LCB7IHNvdW5kOiAnb2ZmJywgYW5ub3VuY2VtZW50OiAnb2ZmJyB9LCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0dGhpcy5fc2lnbmFsRW5hYmxlZFN0YXRlID0gbmV3IENhY2hlZEZ1bmN0aW9uKFxuXHRcdFx0eyBnZXRDYWNoZUtleTogZ2V0U3RydWN0dXJhbEtleSB9LFxuXHRcdFx0KGFyZzogeyBzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWw7IHVzZXJHZXN0dXJlOiBib29sZWFuOyBtb2RhbGl0eT86IEFjY2Vzc2liaWxpdHlNb2RhbGl0eSB8IHVuZGVmaW5lZCB9KSA9PiB7XG5cdFx0XHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBzb3VuZCBlbmFibGVkICovXG5cdFx0XHRcdFx0Y29uc3Qgc2V0dGluZyA9IHRoaXMuX3NpZ25hbENvbmZpZ1ZhbHVlLmdldChhcmcuc2lnbmFsKS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdFx0XHRpZiAoYXJnLm1vZGFsaXR5ID09PSAnc291bmQnIHx8IGFyZy5tb2RhbGl0eSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRpZiAoYXJnLnNpZ25hbC5tYW5hZ2VzT3duRW5hYmxlbWVudCB8fCBjaGVja0VuYWJsZWRTdGF0ZShzZXR0aW5nLnNvdW5kLCAoKSA9PiB0aGlzLnNjcmVlblJlYWRlckF0dGFjaGVkLnJlYWQocmVhZGVyKSwgYXJnLnVzZXJHZXN0dXJlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGFyZy5tb2RhbGl0eSA9PT0gJ2Fubm91bmNlbWVudCcgfHwgYXJnLm1vZGFsaXR5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGlmIChjaGVja0VuYWJsZWRTdGF0ZShzZXR0aW5nLmFubm91bmNlbWVudCwgKCkgPT4gdGhpcy5zY3JlZW5SZWFkZXJBdHRhY2hlZC5yZWFkKHJlYWRlciksIGFyZy51c2VyR2VzdHVyZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW5hYmxlZFN0YXRlKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgdXNlckdlc3R1cmU6IGJvb2xlYW4sIG1vZGFsaXR5PzogQWNjZXNzaWJpbGl0eU1vZGFsaXR5IHwgdW5kZWZpbmVkKTogSVZhbHVlV2l0aENoYW5nZUV2ZW50PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gbmV3IFZhbHVlV2l0aENoYW5nZUV2ZW50RnJvbU9ic2VydmFibGUodGhpcy5fc2lnbmFsRW5hYmxlZFN0YXRlLmdldCh7IHNpZ25hbCwgdXNlckdlc3R1cmUsIG1vZGFsaXR5IH0pKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBwbGF5U2lnbmFsKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgb3B0aW9uczogSUFjY2Vzc2JpbGl0eVNpZ25hbE9wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNob3VsZFBsYXlBbm5vdW5jZW1lbnQgPSBvcHRpb25zLm1vZGFsaXR5ID09PSAnYW5ub3VuY2VtZW50JyB8fCBvcHRpb25zLm1vZGFsaXR5ID09PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYW5ub3VuY2VtZW50TWVzc2FnZSA9IG9wdGlvbnMuY3VzdG9tQWxlcnRNZXNzYWdlID8/IHNpZ25hbC5hbm5vdW5jZW1lbnRNZXNzYWdlO1xuXHRcdGlmIChzaG91bGRQbGF5QW5ub3VuY2VtZW50ICYmIHRoaXMuaXNBbm5vdW5jZW1lbnRFbmFibGVkKHNpZ25hbCwgb3B0aW9ucy51c2VyR2VzdHVyZSkgJiYgYW5ub3VuY2VtZW50TWVzc2FnZSkge1xuXHRcdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5zdGF0dXMoYW5ub3VuY2VtZW50TWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvdWxkUGxheVNvdW5kID0gb3B0aW9ucy5tb2RhbGl0eSA9PT0gJ3NvdW5kJyB8fCBvcHRpb25zLm1vZGFsaXR5ID09PSB1bmRlZmluZWQ7XG5cdFx0aWYgKHNob3VsZFBsYXlTb3VuZCAmJiB0aGlzLmlzU291bmRFbmFibGVkKHNpZ25hbCwgb3B0aW9ucy51c2VyR2VzdHVyZSkpIHtcblx0XHRcdHRoaXMuc2VuZFNpZ25hbFRlbGVtZXRyeShzaWduYWwsIG9wdGlvbnMuc291cmNlKTtcblx0XHRcdGF3YWl0IHRoaXMucGxheVNvdW5kKHNpZ25hbC5zb3VuZC5nZXRTb3VuZCgpLCBvcHRpb25zLmFsbG93TWFueUluUGFyYWxsZWwpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBwbGF5U2lnbmFscyhzaWduYWxzOiAoQWNjZXNzaWJpbGl0eVNpZ25hbCB8IHsgc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsOyBzb3VyY2U6IHN0cmluZyB9KVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBzaWduYWwgb2Ygc2lnbmFscykge1xuXHRcdFx0dGhpcy5zZW5kU2lnbmFsVGVsZW1ldHJ5KCdzaWduYWwnIGluIHNpZ25hbCA/IHNpZ25hbC5zaWduYWwgOiBzaWduYWwsICdzb3VyY2UnIGluIHNpZ25hbCA/IHNpZ25hbC5zb3VyY2UgOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRjb25zdCBzaWduYWxBcnJheSA9IHNpZ25hbHMubWFwKHMgPT4gJ3NpZ25hbCcgaW4gcyA/IHMuc2lnbmFsIDogcyk7XG5cdFx0Y29uc3QgYW5ub3VuY2VtZW50cyA9IHNpZ25hbEFycmF5LmZpbHRlcihzaWduYWwgPT4gdGhpcy5pc0Fubm91bmNlbWVudEVuYWJsZWQoc2lnbmFsKSkubWFwKHMgPT4gcy5hbm5vdW5jZW1lbnRNZXNzYWdlKTtcblx0XHRpZiAoYW5ub3VuY2VtZW50cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uuc3RhdHVzKGFubm91bmNlbWVudHMuam9pbignLCAnKSk7XG5cdFx0fVxuXG5cdFx0Ly8gU29tZSBzb3VuZHMgYXJlIHJldXNlZC4gRG9uJ3QgcGxheSB0aGUgc2FtZSBzb3VuZCB0d2ljZS5cblx0XHRjb25zdCBzb3VuZHMgPSBuZXcgU2V0KHNpZ25hbEFycmF5LmZpbHRlcihzaWduYWwgPT4gdGhpcy5pc1NvdW5kRW5hYmxlZChzaWduYWwpKS5tYXAoc2lnbmFsID0+IHNpZ25hbC5zb3VuZC5nZXRTb3VuZCgpKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoQXJyYXkuZnJvbShzb3VuZHMpLm1hcChzb3VuZCA9PiB0aGlzLnBsYXlTb3VuZChzb3VuZCwgdHJ1ZSkpKTtcblxuXHR9XG5cblxuXHRwcml2YXRlIHNlbmRTaWduYWxUZWxlbWV0cnkoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkID0gdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHRcdGNvbnN0IGtleSA9IHNpZ25hbC5uYW1lICsgKHNvdXJjZSA/IGA6OiR7c291cmNlfWAgOiAnJykgKyAoaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQgPyAne3NjcmVlblJlYWRlck9wdGltaXplZH0nIDogJycpO1xuXHRcdC8vIE9ubHkgc2VuZCBvbmNlIHBlciB1c2VyIHNlc3Npb25cblx0XHRpZiAodGhpcy5zZW50VGVsZW1ldHJ5LmhhcyhrZXkpIHx8IHRoaXMuZ2V0Vm9sdW1lSW5QZXJjZW50KCkgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZW50VGVsZW1ldHJ5LmFkZChrZXkpO1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e1xuXHRcdFx0c2lnbmFsOiBzdHJpbmc7XG5cdFx0XHRzb3VyY2U6IHN0cmluZztcblx0XHRcdGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkOiBib29sZWFuO1xuXHRcdH0sIHtcblx0XHRcdG93bmVyOiAnaGVkaWV0JztcblxuXHRcdFx0c2lnbmFsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNpZ25hbCB0aGF0IHdhcyBwbGF5ZWQuJyB9O1xuXHRcdFx0c291cmNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNvdXJjZSB0aGF0IHRyaWdnZXJlZCB0aGUgc2lnbmFsIChlLmcuIFwiZGlmZkVkaXRvck5hdmlnYXRpb25cIikuJyB9O1xuXHRcdFx0aXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGlzIHVzaW5nIGEgc2NyZWVuIHJlYWRlcicgfTtcblxuXHRcdFx0Y29tbWVudDogJ1RoaXMgZGF0YSBpcyBjb2xsZWN0ZWQgdG8gdW5kZXJzdGFuZCBob3cgc2lnbmFscyBhcmUgdXNlZCBhbmQgaWYgbW9yZSBzaWduYWxzIHNob3VsZCBiZSBhZGRlZC4nO1xuXHRcdH0+KCdzaWduYWwucGxheWVkJywge1xuXHRcdFx0c2lnbmFsOiBzaWduYWwubmFtZSxcblx0XHRcdHNvdXJjZTogc291cmNlID8/ICcnLFxuXHRcdFx0aXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZvbHVtZUluUGVyY2VudCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHZvbHVtZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLnZvbHVtZScpO1xuXHRcdGlmICh0eXBlb2Ygdm9sdW1lICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIDUwO1xuXHRcdH1cblxuXHRcdHJldHVybiBNYXRoLm1heChNYXRoLm1pbih2b2x1bWUsIDEwMCksIDApO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBwbGF5aW5nU291bmRzO1xuXG5cdHB1YmxpYyBhc3luYyBwbGF5U291bmQoc291bmQ6IFNvdW5kLCBhbGxvd01hbnlJblBhcmFsbGVsID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWFsbG93TWFueUluUGFyYWxsZWwgJiYgdGhpcy5wbGF5aW5nU291bmRzLmhhcyhzb3VuZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5wbGF5aW5nU291bmRzLmFkZChzb3VuZCk7XG5cdFx0Y29uc3QgdXJsID0gRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYHZzL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9tZWRpYS8ke3NvdW5kLmZpbGVOYW1lfWApLnRvU3RyaW5nKHRydWUpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNvdW5kID0gdGhpcy5zb3VuZHMuZ2V0KHVybCk7XG5cdFx0XHRpZiAoc291bmQpIHtcblx0XHRcdFx0c291bmQudm9sdW1lID0gdGhpcy5nZXRWb2x1bWVJblBlcmNlbnQoKSAvIDEwMDtcblx0XHRcdFx0c291bmQuY3VycmVudFRpbWUgPSAwO1xuXHRcdFx0XHRhd2FpdCBzb3VuZC5wbGF5KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwbGF5ZWRTb3VuZCA9IGF3YWl0IHBsYXlBdWRpbyh1cmwsIHRoaXMuZ2V0Vm9sdW1lSW5QZXJjZW50KCkgLyAxMDApO1xuXHRcdFx0XHR0aGlzLnNvdW5kcy5zZXQodXJsLCBwbGF5ZWRTb3VuZCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKCFlLm1lc3NhZ2UuaW5jbHVkZXMoJ3BsYXkoKSBjYW4gb25seSBiZSBpbml0aWF0ZWQgYnkgYSB1c2VyIGdlc3R1cmUnKSkge1xuXHRcdFx0XHQvLyB0cmFja2luZyB0aGlzIGlzc3VlIGluICMxNzg2NDIsIG5vIG5lZWQgdG8gc3BhbSB0aGUgY29uc29sZVxuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBwbGF5aW5nIHNvdW5kJywgZSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMucGxheWluZ1NvdW5kcy5kZWxldGUoc291bmQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwbGF5U2lnbmFsTG9vcChzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWwsIG1pbGxpc2Vjb25kczogbnVtYmVyKTogSURpc3Bvc2FibGUge1xuXHRcdGxldCBwbGF5aW5nID0gdHJ1ZTtcblx0XHRjb25zdCBwbGF5U291bmQgPSAoKSA9PiB7XG5cdFx0XHRpZiAocGxheWluZykge1xuXHRcdFx0XHR0aGlzLnBsYXlTaWduYWwoc2lnbmFsLCB7IGFsbG93TWFueUluUGFyYWxsZWw6IHRydWUgfSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAocGxheWluZykge1xuXHRcdFx0XHRcdFx0XHRwbGF5U291bmQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCBtaWxsaXNlY29uZHMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHBsYXlTb3VuZCgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gcGxheWluZyA9IGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NpZ25hbENvbmZpZ1ZhbHVlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NpZ25hbEVuYWJsZWRTdGF0ZTtcblxuXHRwdWJsaWMgaXNBbm5vdW5jZW1lbnRFbmFibGVkKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgdXNlckdlc3R1cmU/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFzaWduYWwuYW5ub3VuY2VtZW50TWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2lnbmFsRW5hYmxlZFN0YXRlLmdldCh7IHNpZ25hbCwgdXNlckdlc3R1cmU6ICEhdXNlckdlc3R1cmUsIG1vZGFsaXR5OiAnYW5ub3VuY2VtZW50JyB9KS5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBpc1NvdW5kRW5hYmxlZChzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWwsIHVzZXJHZXN0dXJlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zaWduYWxFbmFibGVkU3RhdGUuZ2V0KHsgc2lnbmFsLCB1c2VyR2VzdHVyZTogISF1c2VyR2VzdHVyZSwgbW9kYWxpdHk6ICdzb3VuZCcgfSkuZ2V0KCk7XG5cdH1cblxuXHRwdWJsaWMgb25Tb3VuZEVuYWJsZWRDaGFuZ2VkKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRFbmFibGVkU3RhdGUoc2lnbmFsLCBmYWxzZSkub25EaWRDaGFuZ2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVsYXlNcyhzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWwsIG1vZGFsaXR5OiBBY2Nlc3NpYmlsaXR5TW9kYWxpdHksIG1vZGU6ICdsaW5lJyB8ICdwb3NpdGlvbmFsJyk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnKSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGxldCB2YWx1ZTogeyBzb3VuZDogbnVtYmVyOyBhbm5vdW5jZW1lbnQ6IG51bWJlciB9O1xuXHRcdGlmIChzaWduYWwubmFtZSA9PT0gQWNjZXNzaWJpbGl0eVNpZ25hbC5lcnJvckF0UG9zaXRpb24ubmFtZSAmJiBtb2RlID09PSAncG9zaXRpb25hbCcpIHtcblx0XHRcdHZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmV4cGVyaW1lbnRhbC5kZWxheXMuZXJyb3JBdFBvc2l0aW9uJyk7XG5cdFx0fSBlbHNlIGlmIChzaWduYWwubmFtZSA9PT0gQWNjZXNzaWJpbGl0eVNpZ25hbC53YXJuaW5nQXRQb3NpdGlvbi5uYW1lICYmIG1vZGUgPT09ICdwb3NpdGlvbmFsJykge1xuXHRcdFx0dmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZXhwZXJpbWVudGFsLmRlbGF5cy53YXJuaW5nQXRQb3NpdGlvbicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5leHBlcmltZW50YWwuZGVsYXlzLmdlbmVyYWwnKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGFsaXR5ID09PSAnc291bmQnID8gdmFsdWUuc291bmQgOiB2YWx1ZS5hbm5vdW5jZW1lbnQ7XG5cdH1cbn1cblxudHlwZSBFbmFibGVkU3RhdGUgPSAnb24nIHwgJ29mZicgfCAnYXV0bycgfCAndXNlckdlc3R1cmUnIHwgJ2Fsd2F5cycgfCAnbmV2ZXInO1xuZnVuY3Rpb24gY2hlY2tFbmFibGVkU3RhdGUoc3RhdGU6IEVuYWJsZWRTdGF0ZSwgZ2V0U2NyZWVuUmVhZGVyQXR0YWNoZWQ6ICgpID0+IGJvb2xlYW4sIGlzVHJpZ2dlcmVkQnlVc2VyR2VzdHVyZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdGUgPT09ICdvbicgfHwgc3RhdGUgPT09ICdhbHdheXMnIHx8IChzdGF0ZSA9PT0gJ2F1dG8nICYmIGdldFNjcmVlblJlYWRlckF0dGFjaGVkKCkpIHx8IHN0YXRlID09PSAndXNlckdlc3R1cmUnICYmIGlzVHJpZ2dlcmVkQnlVc2VyR2VzdHVyZTtcbn1cblxuLyoqXG4gKiBQbGF5IHRoZSBnaXZlbiBhdWRpbyB1cmwuXG4gKiBAdm9sdW1lIHZhbHVlIGJldHdlZW4gMCBhbmQgMVxuICovXG5hc3luYyBmdW5jdGlvbiBwbGF5QXVkaW8odXJsOiBzdHJpbmcsIHZvbHVtZTogbnVtYmVyKTogUHJvbWlzZTxIVE1MQXVkaW9FbGVtZW50PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR0cnkge1xuXHRcdHJldHVybiBhd2FpdCBkb1BsYXlBdWRpbyh1cmwsIHZvbHVtZSwgZGlzcG9zYWJsZXMpO1xuXHR9IGZpbmFsbHkge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBkb1BsYXlBdWRpbyh1cmw6IHN0cmluZywgdm9sdW1lOiBudW1iZXIsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPEhUTUxBdWRpb0VsZW1lbnQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPEhUTUxBdWRpb0VsZW1lbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyh1cmwpO1xuXHRcdGF1ZGlvLnZvbHVtZSA9IHZvbHVtZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGF1ZGlvLCAnZW5kZWQnLCAoKSA9PiB7XG5cdFx0XHRyZXNvbHZlKGF1ZGlvKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihhdWRpbywgJ2Vycm9yJywgKGUpID0+IHtcblx0XHRcdC8vIFdoZW4gdGhlIGVycm9yIGV2ZW50IGZpcmVzLCBlbmRlZCBtaWdodCBub3QgYmUgY2FsbGVkXG5cdFx0XHRyZWplY3QoZS5lcnJvcik7XG5cdFx0fSkpO1xuXHRcdGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IHtcblx0XHRcdC8vIFdoZW4gcGxheSBmYWlscywgdGhlIGVycm9yIGV2ZW50IGlzIG5vdCBmaXJlZC5cblx0XHRcdHJlamVjdChlKTtcblx0XHR9KTtcblx0fSk7XG59XG5cbi8qKlxuICogQ29ycmVzcG9uZHMgdG8gdGhlIGF1ZGlvIGZpbGVzIGluIC4vbWVkaWEuXG4qL1xuZXhwb3J0IGNsYXNzIFNvdW5kIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVnaXN0ZXIob3B0aW9uczogeyBmaWxlTmFtZTogc3RyaW5nIH0pOiBTb3VuZCB7XG5cdFx0Y29uc3Qgc291bmQgPSBuZXcgU291bmQob3B0aW9ucy5maWxlTmFtZSk7XG5cdFx0cmV0dXJuIHNvdW5kO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBlcnJvciA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdlcnJvci5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHdhcm5pbmcgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAnd2FybmluZy5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHN1Y2Nlc3MgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAnc3VjY2Vzcy5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGZvbGRlZEFyZWEgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAnZm9sZGVkQXJlYXMubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBicmVhayA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdicmVhay5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHF1aWNrRml4ZXMgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAncXVpY2tGaXhlcy5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHRhc2tDb21wbGV0ZWQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAndGFza0NvbXBsZXRlZC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHRhc2tGYWlsZWQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAndGFza0ZhaWxlZC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHRlcm1pbmFsQmVsbCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICd0ZXJtaW5hbEJlbGwubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBkaWZmTGluZUluc2VydGVkID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2RpZmZMaW5lSW5zZXJ0ZWQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBkaWZmTGluZURlbGV0ZWQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAnZGlmZkxpbmVEZWxldGVkLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZGlmZkxpbmVNb2RpZmllZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdkaWZmTGluZU1vZGlmaWVkLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgcmVxdWVzdFNlbnQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAncmVxdWVzdFNlbnQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSByZXNwb25zZVJlY2VpdmVkMSA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdyZXNwb25zZVJlY2VpdmVkMS5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHJlc3BvbnNlUmVjZWl2ZWQyID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ3Jlc3BvbnNlUmVjZWl2ZWQyLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgcmVzcG9uc2VSZWNlaXZlZDMgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAncmVzcG9uc2VSZWNlaXZlZDMubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSByZXNwb25zZVJlY2VpdmVkNCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdyZXNwb25zZVJlY2VpdmVkNC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGNsZWFyID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2NsZWFyLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgc2F2ZSA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdzYXZlLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZm9ybWF0ID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2Zvcm1hdC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHZvaWNlUmVjb3JkaW5nU3RhcnRlZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICd2b2ljZVJlY29yZGluZ1N0YXJ0ZWQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSB2b2ljZVJlY29yZGluZ1N0b3BwZWQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAndm9pY2VSZWNvcmRpbmdTdG9wcGVkLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgcHJvZ3Jlc3MgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAncHJvZ3Jlc3MubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjaGF0RWRpdE1vZGlmaWVkRmlsZSA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdjaGF0RWRpdE1vZGlmaWVkRmlsZS5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGVkaXRzS2VwdCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdlZGl0c0tlcHQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBlZGl0c1VuZG9uZSA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdlZGl0c1VuZG9uZS5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IG5leHRFZGl0U3VnZ2VzdGlvbiA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICduZXh0RWRpdFN1Z2dlc3Rpb24ubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAndGVybWluYWxDb21tYW5kU3VjY2VlZGVkLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdjaGF0VXNlckFjdGlvblJlcXVpcmVkLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgY29kZUFjdGlvblRyaWdnZXJlZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdjb2RlQWN0aW9uVHJpZ2dlcmVkLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgY29kZUFjdGlvbkFwcGxpZWQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAnY29kZUFjdGlvbkFwcGxpZWQubXAzJyB9KTtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBmaWxlTmFtZTogc3RyaW5nKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFNvdW5kU291cmNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJhbmRvbU9uZU9mOiBTb3VuZFtdXG5cdCkgeyB9XG5cblx0cHVibGljIGdldFNvdW5kKGRldGVybWluaXN0aWMgPSBmYWxzZSk6IFNvdW5kIHtcblx0XHRpZiAoZGV0ZXJtaW5pc3RpYyB8fCB0aGlzLnJhbmRvbU9uZU9mLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmFuZG9tT25lT2ZbMF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5yYW5kb21PbmVPZi5sZW5ndGgpO1xuXHRcdFx0cmV0dXJuIHRoaXMucmFuZG9tT25lT2ZbaW5kZXhdO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWNjZXNzaWJpbGl0eVNpZ25hbCB7XG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNvdW5kOiBTb3VuZFNvdXJjZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNldHRpbmdzS2V5OiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFubm91bmNlbWVudE1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWFuYWdlc093bkVuYWJsZW1lbnQ6IGJvb2xlYW4gPSBmYWxzZVxuXHQpIHsgfVxuXG5cdHByaXZhdGUgc3RhdGljIF9zaWduYWxzID0gbmV3IFNldDxBY2Nlc3NpYmlsaXR5U2lnbmFsPigpO1xuXHRwcml2YXRlIHN0YXRpYyByZWdpc3RlcihvcHRpb25zOiB7XG5cdFx0bmFtZTogc3RyaW5nO1xuXHRcdHNvdW5kOiBTb3VuZCB8IHtcblx0XHRcdC8qKlxuXHRcdFx0ICogR2FtaW5nIGFuZCBvdGhlciBhcHBzIG9mdGVuIHBsYXkgYSBzb3VuZCB2YXJpYW50IHdoZW4gdGhlIHNhbWUgZXZlbnQgaGFwcGVucyBhZ2FpblxuXHRcdFx0ICogZm9yIGFuIGltcHJvdmVkIGV4cGVyaWVuY2UuIFRoaXMgb3B0aW9uIGVuYWJsZXMgcGxheWluZyBhIHJhbmRvbSBzb3VuZC5cblx0XHRcdCAqL1xuXHRcdFx0cmFuZG9tT25lT2Y6IFNvdW5kW107XG5cdFx0fTtcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5Pzogc3RyaW5nO1xuXHRcdHNldHRpbmdzS2V5OiBzdHJpbmc7XG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk/OiBzdHJpbmc7XG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZT86IHN0cmluZztcblx0XHRkZWxheVNldHRpbmdzS2V5Pzogc3RyaW5nO1xuXHRcdG1hbmFnZXNPd25FbmFibGVtZW50PzogYm9vbGVhbjtcblx0fSk6IEFjY2Vzc2liaWxpdHlTaWduYWwge1xuXHRcdGNvbnN0IHNvdW5kU291cmNlID0gbmV3IFNvdW5kU291cmNlKCdyYW5kb21PbmVPZicgaW4gb3B0aW9ucy5zb3VuZCA/IG9wdGlvbnMuc291bmQucmFuZG9tT25lT2YgOiBbb3B0aW9ucy5zb3VuZF0pO1xuXHRcdGNvbnN0IHNpZ25hbCA9IG5ldyBBY2Nlc3NpYmlsaXR5U2lnbmFsKFxuXHRcdFx0c291bmRTb3VyY2UsXG5cdFx0XHRvcHRpb25zLm5hbWUsXG5cdFx0XHRvcHRpb25zLmxlZ2FjeVNvdW5kU2V0dGluZ3NLZXksXG5cdFx0XHRvcHRpb25zLnNldHRpbmdzS2V5LFxuXHRcdFx0b3B0aW9ucy5sZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleSxcblx0XHRcdG9wdGlvbnMuYW5ub3VuY2VtZW50TWVzc2FnZSxcblx0XHRcdG9wdGlvbnMubWFuYWdlc093bkVuYWJsZW1lbnRcblx0XHQpO1xuXHRcdEFjY2Vzc2liaWxpdHlTaWduYWwuX3NpZ25hbHMuYWRkKHNpZ25hbCk7XG5cdFx0cmV0dXJuIHNpZ25hbDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0IGFsbEFjY2Vzc2liaWxpdHlTaWduYWxzKCkge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc2lnbmFsc107XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGVycm9yQXRQb3NpdGlvbiA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5wb3NpdGlvbkhhc0Vycm9yLm5hbWUnLCAnRXJyb3IgYXQgUG9zaXRpb24nKSxcblx0XHRzb3VuZDogU291bmQuZXJyb3IsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc0Vycm9yJywgJ0Vycm9yJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucG9zaXRpb25IYXNFcnJvcicsXG5cdFx0ZGVsYXlTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWxheXMuZXJyb3JBdFBvc2l0aW9uJ1xuXHR9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSB3YXJuaW5nQXRQb3NpdGlvbiA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5wb3NpdGlvbkhhc1dhcm5pbmcubmFtZScsICdXYXJuaW5nIGF0IFBvc2l0aW9uJyksXG5cdFx0c291bmQ6IFNvdW5kLndhcm5pbmcsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc1dhcm5pbmcnLCAnV2FybmluZycpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnBvc2l0aW9uSGFzV2FybmluZycsXG5cdFx0ZGVsYXlTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWxheXMud2FybmluZ0F0UG9zaXRpb24nXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZXJyb3JPbkxpbmUgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMubGluZUhhc0Vycm9yLm5hbWUnLCAnRXJyb3Igb24gTGluZScpLFxuXHRcdHNvdW5kOiBTb3VuZC5lcnJvcixcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmxpbmVIYXNFcnJvcicsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LmVycm9yJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNFcnJvcicsICdFcnJvciBvbiBMaW5lJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0Vycm9yJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB3YXJuaW5nT25MaW5lID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmxpbmVIYXNXYXJuaW5nLm5hbWUnLCAnV2FybmluZyBvbiBMaW5lJyksXG5cdFx0c291bmQ6IFNvdW5kLndhcm5pbmcsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5saW5lSGFzV2FybmluZycsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0Lndhcm5pbmcnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc1dhcm5pbmcnLCAnV2FybmluZyBvbiBMaW5lJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc1dhcm5pbmcnLFxuXHR9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBmb2xkZWRBcmVhID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmxpbmVIYXNGb2xkZWRBcmVhLm5hbWUnLCAnRm9sZGVkIEFyZWEgb24gTGluZScpLFxuXHRcdHNvdW5kOiBTb3VuZC5mb2xkZWRBcmVhLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMubGluZUhhc0ZvbGRlZEFyZWEnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC5mb2xkZWRBcmVhJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNGb2xkZWRBcmVhJywgJ0ZvbGRlZCcpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNGb2xkZWRBcmVhJyxcblx0fSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgYnJlYWsgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMubGluZUhhc0JyZWFrcG9pbnQubmFtZScsICdCcmVha3BvaW50IG9uIExpbmUnKSxcblx0XHRzb3VuZDogU291bmQuYnJlYWssXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5saW5lSGFzQnJlYWtwb2ludCcsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LmJyZWFrcG9pbnQnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0JyZWFrcG9pbnQnLCAnQnJlYWtwb2ludCcpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNCcmVha3BvaW50Jyxcblx0fSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgaW5saW5lU3VnZ2VzdGlvbiA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5saW5lSGFzSW5saW5lU3VnZ2VzdGlvbi5uYW1lJywgJ0lubGluZSBTdWdnZXN0aW9uIG9uIExpbmUnKSxcblx0XHRzb3VuZDogU291bmQucXVpY2tGaXhlcyxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmxpbmVIYXNJbmxpbmVTdWdnZXN0aW9uJyxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzSW5saW5lU3VnZ2VzdGlvbicsXG5cdH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IG5leHRFZGl0U3VnZ2VzdGlvbiA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5uZXh0RWRpdFN1Z2dlc3Rpb24ubmFtZScsICdOZXh0IEVkaXQgU3VnZ2VzdGlvbiBvbiBMaW5lJyksXG5cdFx0c291bmQ6IFNvdW5kLm5leHRFZGl0U3VnZ2VzdGlvbixcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLm5leHRFZGl0U3VnZ2VzdGlvbicsXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubmV4dEVkaXRTdWdnZXN0aW9uJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5leHRFZGl0U3VnZ2VzdGlvbicsICdOZXh0IEVkaXQgU3VnZ2VzdGlvbicpLFxuXHR9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0ZXJtaW5hbFF1aWNrRml4ID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnRlcm1pbmFsUXVpY2tGaXgubmFtZScsICdUZXJtaW5hbCBRdWljayBGaXgnKSxcblx0XHRzb3VuZDogU291bmQucXVpY2tGaXhlcyxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLnRlcm1pbmFsUXVpY2tGaXgnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC50ZXJtaW5hbFF1aWNrRml4Jyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsUXVpY2tGaXgnLCAnUXVpY2sgRml4JyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxRdWlja0ZpeCcsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgb25EZWJ1Z0JyZWFrID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLm9uRGVidWdCcmVhay5uYW1lJywgJ0RlYnVnZ2VyIFN0b3BwZWQgb24gQnJlYWtwb2ludCcpLFxuXHRcdHNvdW5kOiBTb3VuZC5icmVhayxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLm9uRGVidWdCcmVhaycsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0Lm9uRGVidWdCcmVhaycsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5vbkRlYnVnQnJlYWsnLCAnQnJlYWtwb2ludCcpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm9uRGVidWdCcmVhaycsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgbm9JbmxheUhpbnRzID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLm5vSW5sYXlIaW50cycsICdObyBJbmxheSBIaW50cyBvbiBMaW5lJyksXG5cdFx0c291bmQ6IFNvdW5kLmVycm9yLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMubm9JbmxheUhpbnRzJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQubm9JbmxheUhpbnRzJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vSW5sYXlIaW50cycsICdObyBJbmxheSBIaW50cycpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vSW5sYXlIaW50cycsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGFza0NvbXBsZXRlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy50YXNrQ29tcGxldGVkJywgJ1Rhc2sgQ29tcGxldGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLnRhc2tDb21wbGV0ZWQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy50YXNrQ29tcGxldGVkJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQudGFza0NvbXBsZXRlZCcsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrQ29tcGxldGVkJywgJ1Rhc2sgQ29tcGxldGVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGFza0NvbXBsZXRlZCcsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGFza0ZhaWxlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy50YXNrRmFpbGVkJywgJ1Rhc2sgRmFpbGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLnRhc2tGYWlsZWQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy50YXNrRmFpbGVkJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQudGFza0ZhaWxlZCcsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrRmFpbGVkJywgJ1Rhc2sgRmFpbGVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGFza0ZhaWxlZCcsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGVybWluYWxDb21tYW5kRmFpbGVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnRlcm1pbmFsQ29tbWFuZEZhaWxlZCcsICdUZXJtaW5hbCBDb21tYW5kIEZhaWxlZCcpLFxuXHRcdHNvdW5kOiBTb3VuZC5lcnJvcixcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLnRlcm1pbmFsQ29tbWFuZEZhaWxlZCcsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LnRlcm1pbmFsQ29tbWFuZEZhaWxlZCcsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRGYWlsZWQnLCAnQ29tbWFuZCBGYWlsZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRGYWlsZWQnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHRlcm1pbmFsQ29tbWFuZFN1Y2NlZWRlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy50ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQnLCAnVGVybWluYWwgQ29tbWFuZCBTdWNjZWVkZWQnKSxcblx0XHRzb3VuZDogU291bmQudGVybWluYWxDb21tYW5kU3VjY2VlZGVkLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxDb21tYW5kU3VjY2VlZGVkJywgJ0NvbW1hbmQgU3VjY2VlZGVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxDb21tYW5kU3VjY2VlZGVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0ZXJtaW5hbEJlbGwgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMudGVybWluYWxCZWxsJywgJ1Rlcm1pbmFsIEJlbGwnKSxcblx0XHRzb3VuZDogU291bmQudGVybWluYWxCZWxsLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMudGVybWluYWxCZWxsJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQudGVybWluYWxCZWxsJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQmVsbCcsICdUZXJtaW5hbCBCZWxsJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxCZWxsJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBub3RlYm9va0NlbGxDb21wbGV0ZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMubm90ZWJvb2tDZWxsQ29tcGxldGVkJywgJ05vdGVib29rIENlbGwgQ29tcGxldGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLnRhc2tDb21wbGV0ZWQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5ub3RlYm9va0NlbGxDb21wbGV0ZWQnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC5ub3RlYm9va0NlbGxDb21wbGV0ZWQnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsQ29tcGxldGVkJywgJ05vdGVib29rIENlbGwgQ29tcGxldGVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsQ29tcGxldGVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBub3RlYm9va0NlbGxGYWlsZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMubm90ZWJvb2tDZWxsRmFpbGVkJywgJ05vdGVib29rIENlbGwgRmFpbGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLnRhc2tGYWlsZWQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5ub3RlYm9va0NlbGxGYWlsZWQnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC5ub3RlYm9va0NlbGxGYWlsZWQnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsRmFpbGVkJywgJ05vdGVib29rIENlbGwgRmFpbGVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsRmFpbGVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBkaWZmTGluZUluc2VydGVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmRpZmZMaW5lSW5zZXJ0ZWQnLCAnRGlmZiBMaW5lIEluc2VydGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLmRpZmZMaW5lSW5zZXJ0ZWQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5kaWZmTGluZUluc2VydGVkJyxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZUluc2VydGVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBkaWZmTGluZURlbGV0ZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuZGlmZkxpbmVEZWxldGVkJywgJ0RpZmYgTGluZSBEZWxldGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLmRpZmZMaW5lRGVsZXRlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmRpZmZMaW5lRGVsZXRlZCcsXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZGlmZkxpbmVEZWxldGVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBkaWZmTGluZU1vZGlmaWVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmRpZmZMaW5lTW9kaWZpZWQnLCAnRGlmZiBMaW5lIE1vZGlmaWVkJyksXG5cdFx0c291bmQ6IFNvdW5kLmRpZmZMaW5lTW9kaWZpZWQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5kaWZmTGluZU1vZGlmaWVkJyxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZU1vZGlmaWVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjaGF0RWRpdE1vZGlmaWVkRmlsZSA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5jaGF0RWRpdE1vZGlmaWVkRmlsZScsICdDaGF0IEVkaXQgTW9kaWZpZWQgRmlsZScpLFxuXHRcdHNvdW5kOiBTb3VuZC5jaGF0RWRpdE1vZGlmaWVkRmlsZSxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRFZGl0TW9kaWZpZWRGaWxlJywgJ0ZpbGUgTW9kaWZpZWQgZnJvbSBDaGF0IEVkaXRzJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdEVkaXRNb2RpZmllZEZpbGUnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGNoYXRSZXF1ZXN0U2VudCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5jaGF0UmVxdWVzdFNlbnQnLCAnQ2hhdCBSZXF1ZXN0IFNlbnQnKSxcblx0XHRzb3VuZDogU291bmQucmVxdWVzdFNlbnQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5jaGF0UmVxdWVzdFNlbnQnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC5jaGF0UmVxdWVzdFNlbnQnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlcXVlc3RTZW50JywgJ0NoYXQgUmVxdWVzdCBTZW50JyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlcXVlc3RTZW50Jyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjaGF0UmVzcG9uc2VSZWNlaXZlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5jaGF0UmVzcG9uc2VSZWNlaXZlZCcsICdDaGF0IFJlc3BvbnNlIFJlY2VpdmVkJyksXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5jaGF0UmVzcG9uc2VSZWNlaXZlZCcsXG5cdFx0c291bmQ6IHtcblx0XHRcdHJhbmRvbU9uZU9mOiBbXG5cdFx0XHRcdFNvdW5kLnJlc3BvbnNlUmVjZWl2ZWQxLFxuXHRcdFx0XHRTb3VuZC5yZXNwb25zZVJlY2VpdmVkMixcblx0XHRcdFx0U291bmQucmVzcG9uc2VSZWNlaXZlZDMsXG5cdFx0XHRcdFNvdW5kLnJlc3BvbnNlUmVjZWl2ZWQ0XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVzcG9uc2VSZWNlaXZlZCdcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjb2RlQWN0aW9uVHJpZ2dlcmVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmNvZGVBY3Rpb25SZXF1ZXN0VHJpZ2dlcmVkJywgJ0NvZGUgQWN0aW9uIFJlcXVlc3QgVHJpZ2dlcmVkJyksXG5cdFx0c291bmQ6IFNvdW5kLmNvZGVBY3Rpb25UcmlnZ2VyZWQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5jb2RlQWN0aW9uUmVxdWVzdFRyaWdnZXJlZCcsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LmNvZGVBY3Rpb25SZXF1ZXN0VHJpZ2dlcmVkJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNvZGVBY3Rpb25SZXF1ZXN0VHJpZ2dlcmVkJywgJ0NvZGUgQWN0aW9uIFJlcXVlc3QgVHJpZ2dlcmVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY29kZUFjdGlvblRyaWdnZXJlZCcsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgY29kZUFjdGlvbkFwcGxpZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuY29kZUFjdGlvbkFwcGxpZWQnLCAnQ29kZSBBY3Rpb24gQXBwbGllZCcpLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMuY29kZUFjdGlvbkFwcGxpZWQnLFxuXHRcdHNvdW5kOiBTb3VuZC5jb2RlQWN0aW9uQXBwbGllZCxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jb2RlQWN0aW9uQXBwbGllZCdcblx0fSk7XG5cblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHByb2dyZXNzID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnByb2dyZXNzJywgJ1Byb2dyZXNzJyksXG5cdFx0c291bmQ6IFNvdW5kLnByb2dyZXNzLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMuY2hhdFJlc3BvbnNlUGVuZGluZycsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LnByb2dyZXNzJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnByb2dyZXNzJywgJ1Byb2dyZXNzJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucHJvZ3Jlc3MnXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgY2xlYXIgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuY2xlYXInLCAnQ2xlYXInKSxcblx0XHRzb3VuZDogU291bmQuY2xlYXIsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5jbGVhcicsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LmNsZWFyJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNsZWFyJywgJ0NsZWFyJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2xlYXInXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgc2F2ZSA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5zYXZlJywgJ1NhdmUnKSxcblx0XHRzb3VuZDogU291bmQuc2F2ZSxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLnNhdmUnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC5zYXZlJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNhdmUnLCAnU2F2ZScpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNhdmUnXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZm9ybWF0ID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmZvcm1hdCcsICdGb3JtYXQnKSxcblx0XHRzb3VuZDogU291bmQuZm9ybWF0LFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMuZm9ybWF0Jyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQuZm9ybWF0Jyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdCcsICdGb3JtYXQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5mb3JtYXQnXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdm9pY2VSZWNvcmRpbmdTdGFydGVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnZvaWNlUmVjb3JkaW5nU3RhcnRlZCcsICdWb2ljZSBSZWNvcmRpbmcgU3RhcnRlZCcpLFxuXHRcdHNvdW5kOiBTb3VuZC52b2ljZVJlY29yZGluZ1N0YXJ0ZWQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy52b2ljZVJlY29yZGluZ1N0YXJ0ZWQnLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlUmVjb3JkaW5nU3RhcnRlZCdcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB2b2ljZU1vZGVTdGFydGVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnZvaWNlTW9kZVN0YXJ0ZWQnLCAnVm9pY2UgTW9kZSBTdGFydGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLnZvaWNlUmVjb3JkaW5nU3RhcnRlZCxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlTW9kZVN0YXJ0ZWQnLCAnVm9pY2UgTW9kZSBTdGFydGVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RhcnRlZCdcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB2b2ljZVJlY29yZGluZ1N0b3BwZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMudm9pY2VSZWNvcmRpbmdTdG9wcGVkJywgJ1ZvaWNlIFJlY29yZGluZyBTdG9wcGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLnZvaWNlUmVjb3JkaW5nU3RvcHBlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLnZvaWNlUmVjb3JkaW5nU3RvcHBlZCcsXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VSZWNvcmRpbmdTdG9wcGVkJ1xuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHZvaWNlTW9kZVN0b3BwZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMudm9pY2VNb2RlU3RvcHBlZCcsICdWb2ljZSBNb2RlIFN0b3BwZWQnKSxcblx0XHRzb3VuZDogU291bmQudm9pY2VSZWNvcmRpbmdTdG9wcGVkLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RvcHBlZCcsICdWb2ljZSBNb2RlIFN0b3BwZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZU1vZGVTdG9wcGVkJ1xuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGVkaXRzS2VwdCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5lZGl0c0tlcHQnLCAnRWRpdHMgS2VwdCcpLFxuXHRcdHNvdW5kOiBTb3VuZC5lZGl0c0tlcHQsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5lZGl0c0tlcHQnLCAnRWRpdHMgS2VwdCcpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzS2VwdCcsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZWRpdHNVbmRvbmUgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuZWRpdHNVbmRvbmUnLCAnVW5kbyBFZGl0cycpLFxuXHRcdHNvdW5kOiBTb3VuZC5lZGl0c1VuZG9uZSxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzVW5kb25lJywgJ0VkaXRzIFVuZG9uZScpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzVW5kb25lJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjaGF0VXNlckFjdGlvblJlcXVpcmVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQnLCAnQ2hhdCBVc2VyIEFjdGlvbiBSZXF1aXJlZCcpLFxuXHRcdHNvdW5kOiBTb3VuZC5jaGF0VXNlckFjdGlvblJlcXVpcmVkLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCcsICdDaGF0IFVzZXIgQWN0aW9uIFJlcXVpcmVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCdcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsNkJBQTZC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
