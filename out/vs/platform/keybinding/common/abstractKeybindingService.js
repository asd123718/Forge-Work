import * as arrays from "../../../base/common/arrays.js";
import { IntervalTimer, TimeoutTimer } from "../../../base/common/async.js";
import { illegalState } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { IME } from "../../../base/common/ime.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as nls from "../../../nls.js";
import { ResultKind, NoMatchingKb } from "./keybindingResolver.js";
const HIGH_FREQ_COMMANDS = /^(cursor|delete|undo|redo|tab|editor\.action\.clipboard)/;
function isKeyInComposition(e) {
  return e.keyCode === KeyCode.KEY_IN_COMPOSITION;
}
class AbstractKeybindingService extends Disposable {
  constructor(_contextKeyService, _commandService, _telemetryService, _notificationService, _logService) {
    super();
    this._contextKeyService = _contextKeyService;
    this._commandService = _commandService;
    this._telemetryService = _telemetryService;
    this._notificationService = _notificationService;
    this._logService = _logService;
    this._onDidUpdateKeybindings = this._register(new Emitter());
    this._currentChords = [];
    this._currentChordChecker = new IntervalTimer();
    this._currentChordStatusMessage = null;
    this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
    this._currentSingleModifier = null;
    this._currentSingleModifierClearTimeout = new TimeoutTimer();
    this._currentlyDispatchingCommandId = null;
    this._logging = false;
  }
  get onDidUpdateKeybindings() {
    return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None;
  }
  get inChordMode() {
    return this._currentChords.length > 0;
  }
  getDefaultKeybindingsContent() {
    return "";
  }
  toggleLogging() {
    this._logging = !this._logging;
    return this._logging;
  }
  _log(str) {
    if (this._logging) {
      this._logService.info(`[KeybindingService]: ${str}`);
    }
  }
  getDefaultKeybindings() {
    return this._getResolver().getDefaultKeybindings();
  }
  getKeybindings() {
    return this._getResolver().getKeybindings();
  }
  customKeybindingsCount() {
    return 0;
  }
  lookupKeybindings(commandId) {
    return arrays.coalesce(
      this._getResolver().lookupKeybindings(commandId).map((item) => item.resolvedKeybinding)
    );
  }
  lookupKeybinding(commandId, context, enforceContextCheck = false) {
    const result = this._getResolver().lookupPrimaryKeybinding(commandId, context || this._contextKeyService, enforceContextCheck);
    if (!result) {
      return void 0;
    }
    return result.resolvedKeybinding;
  }
  dispatchEvent(e, target) {
    return this._dispatch(e, target);
  }
  // TODO@ulugbekna: update namings to align with `_doDispatch`
  // TODO@ulugbekna: this fn doesn't seem to take into account single-modifier keybindings, eg `shift shift`
  softDispatch(e, target) {
    this._log(`/ Soft dispatching keyboard event`);
    if (isKeyInComposition(e)) {
      this._log(`\\ Keyboard event is part of an IME composition`);
      return NoMatchingKb;
    }
    const keybinding = this.resolveKeyboardEvent(e);
    if (keybinding.hasMultipleChords()) {
      console.warn("keyboard event should not be mapped to multiple chords");
      return NoMatchingKb;
    }
    const [firstChord] = keybinding.getDispatchChords();
    if (firstChord === null) {
      this._log(`\\ Keyboard event cannot be dispatched`);
      return NoMatchingKb;
    }
    const contextValue = this._contextKeyService.getContext(target);
    const currentChords = this._currentChords.map((({ keypress }) => keypress));
    return this._getResolver().resolve(contextValue, currentChords, firstChord);
  }
  _scheduleLeaveChordMode() {
    const chordLastInteractedTime = Date.now();
    this._currentChordChecker.cancelAndSet(() => {
      if (!this._documentHasFocus()) {
        this._leaveChordMode();
        return;
      }
      if (Date.now() - chordLastInteractedTime > 5e3) {
        this._leaveChordMode();
      }
    }, 500);
  }
  _expectAnotherChord(firstChord, keypressLabel) {
    this._currentChords.push({ keypress: firstChord, label: keypressLabel });
    switch (this._currentChords.length) {
      case 0:
        throw illegalState("impossible");
      case 1:
        this._currentChordStatusMessage = this._notificationService.status(nls.localize("first.chord", "({0}) was pressed. Waiting for second key of chord...", keypressLabel));
        break;
      default: {
        const fullKeypressLabel = this._currentChords.map(({ label }) => label).join(", ");
        this._currentChordStatusMessage = this._notificationService.status(nls.localize("next.chord", "({0}) was pressed. Waiting for next key of chord...", fullKeypressLabel));
      }
    }
    this._scheduleLeaveChordMode();
    if (IME.enabled) {
      IME.disable();
    }
  }
  _leaveChordMode() {
    if (this._currentChordStatusMessage) {
      this._currentChordStatusMessage.close();
      this._currentChordStatusMessage = null;
    }
    this._currentChordChecker.cancel();
    this._currentChords = [];
    IME.enable();
  }
  dispatchByUserSettingsLabel(userSettingsLabel, target) {
    this._log(`/ Dispatching keybinding triggered via menu entry accelerator - ${userSettingsLabel}`);
    const keybindings = this.resolveUserBinding(userSettingsLabel);
    if (keybindings.length === 0) {
      this._log(`\\ Could not resolve - ${userSettingsLabel}`);
    } else {
      this._doDispatch(
        keybindings[0],
        target,
        /*isSingleModiferChord*/
        false
      );
    }
  }
  _dispatch(e, target) {
    if (isKeyInComposition(e)) {
      this._log(`+ Ignoring keybinding dispatch because an IME composition is in progress.`);
      return false;
    }
    return this._doDispatch(
      this.resolveKeyboardEvent(e),
      target,
      /*isSingleModiferChord*/
      false
    );
  }
  _singleModifierDispatch(e, target) {
    if (isKeyInComposition(e)) {
      return false;
    }
    const keybinding = this.resolveKeyboardEvent(e);
    const [singleModifier] = keybinding.getSingleModifierDispatchChords();
    if (singleModifier) {
      if (this._ignoreSingleModifiers.has(singleModifier)) {
        this._log(`+ Ignoring single modifier ${singleModifier} due to it being pressed together with other keys.`);
        this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
        this._currentSingleModifierClearTimeout.cancel();
        this._currentSingleModifier = null;
        return false;
      }
      this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
      if (this._currentSingleModifier === null) {
        this._log(`+ Storing single modifier for possible chord ${singleModifier}.`);
        this._currentSingleModifier = singleModifier;
        this._currentSingleModifierClearTimeout.cancelAndSet(() => {
          this._log(`+ Clearing single modifier due to 300ms elapsed.`);
          this._currentSingleModifier = null;
        }, 300);
        return false;
      }
      if (singleModifier === this._currentSingleModifier) {
        this._log(`/ Dispatching single modifier chord ${singleModifier} ${singleModifier}`);
        this._currentSingleModifierClearTimeout.cancel();
        this._currentSingleModifier = null;
        return this._doDispatch(
          keybinding,
          target,
          /*isSingleModiferChord*/
          true
        );
      }
      this._log(`+ Clearing single modifier due to modifier mismatch: ${this._currentSingleModifier} ${singleModifier}`);
      this._currentSingleModifierClearTimeout.cancel();
      this._currentSingleModifier = null;
      return false;
    }
    const [firstChord] = keybinding.getChords();
    this._ignoreSingleModifiers = new KeybindingModifierSet(firstChord);
    if (this._currentSingleModifier !== null) {
      this._log(`+ Clearing single modifier due to other key up.`);
    }
    this._currentSingleModifierClearTimeout.cancel();
    this._currentSingleModifier = null;
    return false;
  }
  _doDispatch(userKeypress, target, isSingleModiferChord = false) {
    let shouldPreventDefault = false;
    if (userKeypress.hasMultipleChords()) {
      console.warn("Unexpected keyboard event mapped to multiple chords");
      return false;
    }
    let userPressedChord = null;
    let currentChords = null;
    if (isSingleModiferChord) {
      const [dispatchKeyname] = userKeypress.getSingleModifierDispatchChords();
      userPressedChord = dispatchKeyname;
      currentChords = dispatchKeyname ? [dispatchKeyname] : [];
    } else {
      [userPressedChord] = userKeypress.getDispatchChords();
      currentChords = this._currentChords.map(({ keypress }) => keypress);
    }
    if (userPressedChord === null) {
      this._log(`\\ Keyboard event cannot be dispatched in keydown phase.`);
      return shouldPreventDefault;
    }
    const contextValue = this._contextKeyService.getContext(target);
    const keypressLabel = userKeypress.getLabel();
    const resolveResult = this._getResolver().resolve(contextValue, currentChords, userPressedChord);
    switch (resolveResult.kind) {
      case ResultKind.NoMatchingKb: {
        this._logService.trace("KeybindingService#dispatch", keypressLabel, `[ No matching keybinding ]`);
        if (this.inChordMode) {
          const currentChordsLabel = this._currentChords.map(({ label }) => label).join(", ");
          this._log(`+ Leaving multi-chord mode: Nothing bound to "${currentChordsLabel}, ${keypressLabel}".`);
          this._notificationService.status(nls.localize("missing.chord", "The key combination ({0}, {1}) is not a command.", currentChordsLabel, keypressLabel), {
            hideAfter: 10 * 1e3
            /* 10s */
          });
          this._leaveChordMode();
          shouldPreventDefault = true;
        }
        return shouldPreventDefault;
      }
      case ResultKind.MoreChordsNeeded: {
        this._logService.trace("KeybindingService#dispatch", keypressLabel, `[ Several keybindings match - more chords needed ]`);
        shouldPreventDefault = true;
        this._expectAnotherChord(userPressedChord, keypressLabel);
        this._log(this._currentChords.length === 1 ? `+ Entering multi-chord mode...` : `+ Continuing multi-chord mode...`);
        return shouldPreventDefault;
      }
      case ResultKind.KbFound: {
        this._logService.trace("KeybindingService#dispatch", keypressLabel, `[ Will dispatch command ${resolveResult.commandId} ]`);
        if (resolveResult.commandId === null || resolveResult.commandId === "") {
          if (this.inChordMode) {
            const currentChordsLabel = this._currentChords.map(({ label }) => label).join(", ");
            this._log(`+ Leaving chord mode: Nothing bound to "${currentChordsLabel}, ${keypressLabel}".`);
            this._notificationService.status(nls.localize("missing.chord", "The key combination ({0}, {1}) is not a command.", currentChordsLabel, keypressLabel), {
              hideAfter: 10 * 1e3
              /* 10s */
            });
            this._leaveChordMode();
            shouldPreventDefault = true;
          }
        } else {
          if (this.inChordMode) {
            this._leaveChordMode();
          }
          if (!resolveResult.isBubble) {
            shouldPreventDefault = true;
          }
          this._log(`+ Invoking command ${resolveResult.commandId}.`);
          this._currentlyDispatchingCommandId = resolveResult.commandId;
          try {
            if (typeof resolveResult.commandArgs === "undefined") {
              this._commandService.executeCommand(resolveResult.commandId).then(void 0, (err) => this._notificationService.warn(err));
            } else {
              this._commandService.executeCommand(resolveResult.commandId, resolveResult.commandArgs).then(void 0, (err) => this._notificationService.warn(err));
            }
          } finally {
            this._currentlyDispatchingCommandId = null;
          }
          if (!HIGH_FREQ_COMMANDS.test(resolveResult.commandId)) {
            this._telemetryService.publicLog2("workbenchActionExecuted", { id: resolveResult.commandId, from: "keybinding", detail: userKeypress.getUserSettingsLabel() ?? void 0 });
          }
        }
        return shouldPreventDefault;
      }
    }
  }
  mightProducePrintableCharacter(event) {
    if (event.ctrlKey || event.metaKey) {
      return false;
    }
    if (event.keyCode >= KeyCode.KeyA && event.keyCode <= KeyCode.KeyZ || event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9) {
      return true;
    }
    return false;
  }
  appendKeybinding(label, commandId, context, enforceContextCheck) {
    if (commandId) {
      const keybindingLabel = this.lookupKeybinding(commandId, context, enforceContextCheck)?.getLabel();
      if (keybindingLabel) {
        return nls.localize(
          { key: "keybindingLabel", comment: ["UI element label", "A keybinding label"] },
          "{0} ({1})",
          label,
          keybindingLabel
        );
      }
    }
    return label;
  }
}
const _KeybindingModifierSet = class _KeybindingModifierSet {
  constructor(source) {
    this._ctrlKey = source ? source.ctrlKey : false;
    this._shiftKey = source ? source.shiftKey : false;
    this._altKey = source ? source.altKey : false;
    this._metaKey = source ? source.metaKey : false;
  }
  has(modifier) {
    switch (modifier) {
      case "ctrl":
        return this._ctrlKey;
      case "shift":
        return this._shiftKey;
      case "alt":
        return this._altKey;
      case "meta":
        return this._metaKey;
    }
  }
};
_KeybindingModifierSet.EMPTY = new _KeybindingModifierSet(null);
let KeybindingModifierSet = _KeybindingModifierSet;
export {
  AbstractKeybindingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxca2V5YmluZGluZ1xcY29tbW9uXFxhYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJbnRlcnZhbFRpbWVyLCBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpbGxlZ2FsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTUUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pbWUuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmcsIFJlc29sdmVkQ2hvcmQsIFJlc29sdmVkS2V5YmluZGluZywgU2luZ2xlTW9kaWZpZXJDaG9yZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuXG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQgfSBmcm9tICcuLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSwgSUtleWJvYXJkRXZlbnQsIEtleWJpbmRpbmdzU2NoZW1hQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlc29sdXRpb25SZXN1bHQsIEtleWJpbmRpbmdSZXNvbHZlciwgUmVzdWx0S2luZCwgTm9NYXRjaGluZ0tiIH0gZnJvbSAnLi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSB9IGZyb20gJy4vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJU3RhdHVzSGFuZGxlIH0gZnJvbSAnLi4vLi4vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5cbmludGVyZmFjZSBDdXJyZW50Q2hvcmQge1xuXHRrZXlwcmVzczogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nIHwgbnVsbDtcbn1cblxuY29uc3QgSElHSF9GUkVRX0NPTU1BTkRTID0gL14oY3Vyc29yfGRlbGV0ZXx1bmRvfHJlZG98dGFifGVkaXRvclxcLmFjdGlvblxcLmNsaXBib2FyZCkvO1xuXG4vKipcbiAqIFdoZXRoZXIgdGhlIGtleXN0cm9rZSBiZWxvbmdzIHRvIGFuIGluLWZsaWdodCBJTUUgY29tcG9zaXRpb24uIGBTdGFuZGFyZEtleWJvYXJkRXZlbnRgIG5vcm1hbGl6ZXNcbiAqIGV2ZXJ5IGNvbXBvc2luZyBrZXlzdHJva2UgdG8ge0BsaW5rIEtleUNvZGUuS0VZX0lOX0NPTVBPU0lUSU9OfSwgaW5jbHVkaW5nIHRoZSBwbGF0Zm9ybS9JTUVcbiAqIGNvbWJpbmF0aW9ucyB0aGF0IHdvdWxkIG90aGVyd2lzZSByZXBvcnQgdGhlIHJlYWwga2V5IGNvZGUgZm9yIGtleXMgdGhlIElNRSBvd25zLlxuICovXG5mdW5jdGlvbiBpc0tleUluQ29tcG9zaXRpb24oZTogSUtleWJvYXJkRXZlbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGUua2V5Q29kZSA9PT0gS2V5Q29kZS5LRVlfSU5fQ09NUE9TSVRJT047XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElLZXliaW5kaW5nU2VydmljZSB7XG5cblx0cHVibGljIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkVXBkYXRlS2V5YmluZGluZ3M6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkVXBkYXRlS2V5YmluZGluZ3MoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFVwZGF0ZUtleWJpbmRpbmdzID8gdGhpcy5fb25EaWRVcGRhdGVLZXliaW5kaW5ncy5ldmVudCA6IEV2ZW50Lk5vbmU7IC8vIFNpbm9uIHN0dWJiaW5nIHdhbGtzIHByb3BlcnRpZXMgb24gcHJvdG90eXBlXG5cdH1cblxuXHQvKiogcmVjZW50bHkgcmVjb3JkZWQga2V5cHJlc3NlcyB0aGF0IGNhbiB0cmlnZ2VyIGEga2V5YmluZGluZztcblx0ICpcblx0ICogZXhhbXBsZTogc2F5LCB0aGVyZSdzIFwiY21kK2sgY21kK2lcIiBrZXliaW5kaW5nO1xuXHQgKiB0aGUgdXNlciBwcmVzc2VkIFwiY21kK2tcIiAoYmVmb3JlIHRoZXkgcHJlc3MgXCJjbWQraVwiKVxuXHQgKiBcImNtZCtrXCIgd291bGQgYmUgc3RvcmVkIGluIHRoaXMgYXJyYXksIHdoZW4gb24gcHJlc3NpbmcgXCJjbWQraVwiLCB0aGUgc2VydmljZVxuXHQgKiB3b3VsZCBpbnZva2UgdGhlIGNvbW1hbmQgYm91bmQgYnkgdGhlIGtleWJpbmRpbmdcblx0ICovXG5cdHByaXZhdGUgX2N1cnJlbnRDaG9yZHM6IEN1cnJlbnRDaG9yZFtdO1xuXG5cdHByaXZhdGUgX2N1cnJlbnRDaG9yZENoZWNrZXI6IEludGVydmFsVGltZXI7XG5cdHByaXZhdGUgX2N1cnJlbnRDaG9yZFN0YXR1c01lc3NhZ2U6IElTdGF0dXNIYW5kbGUgfCBudWxsO1xuXHRwcml2YXRlIF9pZ25vcmVTaW5nbGVNb2RpZmllcnM6IEtleWJpbmRpbmdNb2RpZmllclNldDtcblx0cHJpdmF0ZSBfY3VycmVudFNpbmdsZU1vZGlmaWVyOiBTaW5nbGVNb2RpZmllckNob3JkIHwgbnVsbDtcblx0cHJpdmF0ZSBfY3VycmVudFNpbmdsZU1vZGlmaWVyQ2xlYXJUaW1lb3V0OiBUaW1lb3V0VGltZXI7XG5cdHByb3RlY3RlZCBfY3VycmVudGx5RGlzcGF0Y2hpbmdDb21tYW5kSWQ6IHN0cmluZyB8IG51bGw7XG5cblx0cHJvdGVjdGVkIF9sb2dnaW5nOiBib29sZWFuO1xuXG5cdHB1YmxpYyBnZXQgaW5DaG9yZE1vZGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRDaG9yZHMubGVuZ3RoID4gMDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2N1cnJlbnRDaG9yZHMgPSBbXTtcblx0XHR0aGlzLl9jdXJyZW50Q2hvcmRDaGVja2VyID0gbmV3IEludGVydmFsVGltZXIoKTtcblx0XHR0aGlzLl9jdXJyZW50Q2hvcmRTdGF0dXNNZXNzYWdlID0gbnVsbDtcblx0XHR0aGlzLl9pZ25vcmVTaW5nbGVNb2RpZmllcnMgPSBLZXliaW5kaW5nTW9kaWZpZXJTZXQuRU1QVFk7XG5cdFx0dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyID0gbnVsbDtcblx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXJDbGVhclRpbWVvdXQgPSBuZXcgVGltZW91dFRpbWVyKCk7XG5cdFx0dGhpcy5fY3VycmVudGx5RGlzcGF0Y2hpbmdDb21tYW5kSWQgPSBudWxsO1xuXHRcdHRoaXMuX2xvZ2dpbmcgPSBmYWxzZTtcblx0fVxuXG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRSZXNvbHZlcigpOiBLZXliaW5kaW5nUmVzb2x2ZXI7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZG9jdW1lbnRIYXNGb2N1cygpOiBib29sZWFuO1xuXHRwdWJsaWMgYWJzdHJhY3QgcmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZzogS2V5YmluZGluZyk6IFJlc29sdmVkS2V5YmluZGluZ1tdO1xuXHRwdWJsaWMgYWJzdHJhY3QgcmVzb2x2ZUtleWJvYXJkRXZlbnQoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpOiBSZXNvbHZlZEtleWJpbmRpbmc7XG5cdHB1YmxpYyBhYnN0cmFjdCByZXNvbHZlVXNlckJpbmRpbmcodXNlckJpbmRpbmc6IHN0cmluZyk6IFJlc29sdmVkS2V5YmluZGluZ1tdO1xuXHRwdWJsaWMgYWJzdHJhY3QgcmVnaXN0ZXJTY2hlbWFDb250cmlidXRpb24oY29udHJpYnV0aW9uOiBLZXliaW5kaW5nc1NjaGVtYUNvbnRyaWJ1dGlvbik6IElEaXNwb3NhYmxlO1xuXHRwdWJsaWMgYWJzdHJhY3QgX2R1bXBEZWJ1Z0luZm8oKTogc3RyaW5nO1xuXHRwdWJsaWMgYWJzdHJhY3QgX2R1bXBEZWJ1Z0luZm9KU09OKCk6IHN0cmluZztcblxuXHRwdWJsaWMgZ2V0RGVmYXVsdEtleWJpbmRpbmdzQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHB1YmxpYyB0b2dnbGVMb2dnaW5nKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2xvZ2dpbmcgPSAhdGhpcy5fbG9nZ2luZztcblx0XHRyZXR1cm4gdGhpcy5fbG9nZ2luZztcblx0fVxuXG5cdHByb3RlY3RlZCBfbG9nKHN0cjogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xvZ2dpbmcpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0tleWJpbmRpbmdTZXJ2aWNlXTogJHtzdHJ9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldERlZmF1bHRLZXliaW5kaW5ncygpOiByZWFkb25seSBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRSZXNvbHZlcigpLmdldERlZmF1bHRLZXliaW5kaW5ncygpO1xuXHR9XG5cblx0cHVibGljIGdldEtleWJpbmRpbmdzKCk6IHJlYWRvbmx5IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldFJlc29sdmVyKCkuZ2V0S2V5YmluZGluZ3MoKTtcblx0fVxuXG5cdHB1YmxpYyBjdXN0b21LZXliaW5kaW5nc0NvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwdWJsaWMgbG9va3VwS2V5YmluZGluZ3MoY29tbWFuZElkOiBzdHJpbmcpOiBSZXNvbHZlZEtleWJpbmRpbmdbXSB7XG5cdFx0cmV0dXJuIGFycmF5cy5jb2FsZXNjZShcblx0XHRcdHRoaXMuX2dldFJlc29sdmVyKCkubG9va3VwS2V5YmluZGluZ3MoY29tbWFuZElkKS5tYXAoaXRlbSA9PiBpdGVtLnJlc29sdmVkS2V5YmluZGluZylcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGxvb2t1cEtleWJpbmRpbmcoY29tbWFuZElkOiBzdHJpbmcsIGNvbnRleHQ/OiBJQ29udGV4dEtleVNlcnZpY2UsIGVuZm9yY2VDb250ZXh0Q2hlY2sgPSBmYWxzZSk6IFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fZ2V0UmVzb2x2ZXIoKS5sb29rdXBQcmltYXJ5S2V5YmluZGluZyhjb21tYW5kSWQsIGNvbnRleHQgfHwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIGVuZm9yY2VDb250ZXh0Q2hlY2spO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0LnJlc29sdmVkS2V5YmluZGluZztcblx0fVxuXG5cdHB1YmxpYyBkaXNwYXRjaEV2ZW50KGU6IElLZXlib2FyZEV2ZW50LCB0YXJnZXQ6IElDb250ZXh0S2V5U2VydmljZVRhcmdldCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9kaXNwYXRjaChlLCB0YXJnZXQpO1xuXHR9XG5cblx0Ly8gVE9ET0B1bHVnYmVrbmE6IHVwZGF0ZSBuYW1pbmdzIHRvIGFsaWduIHdpdGggYF9kb0Rpc3BhdGNoYFxuXHQvLyBUT0RPQHVsdWdiZWtuYTogdGhpcyBmbiBkb2Vzbid0IHNlZW0gdG8gdGFrZSBpbnRvIGFjY291bnQgc2luZ2xlLW1vZGlmaWVyIGtleWJpbmRpbmdzLCBlZyBgc2hpZnQgc2hpZnRgXG5cdHB1YmxpYyBzb2Z0RGlzcGF0Y2goZTogSUtleWJvYXJkRXZlbnQsIHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0KTogUmVzb2x1dGlvblJlc3VsdCB7XG5cdFx0dGhpcy5fbG9nKGAvIFNvZnQgZGlzcGF0Y2hpbmcga2V5Ym9hcmQgZXZlbnRgKTtcblx0XHRpZiAoaXNLZXlJbkNvbXBvc2l0aW9uKGUpKSB7XG5cdFx0XHQvLyBNdXN0IGFncmVlIHdpdGggYF9kaXNwYXRjaGA6IGNhbGxlcnMgdXNlIHRoaXMgdG8gZGVjaWRlIHdoZXRoZXIgdGhlIHdvcmtiZW5jaCB3aWxsXG5cdFx0XHQvLyBjbGFpbSB0aGUga2V5LCBhbmQgYSBcInllc1wiIGhlcmUgZm9sbG93ZWQgYnkgYSBcIm5vXCIgdGhlcmUgd291bGQgZHJvcCB0aGUga2V5c3Ryb2tlIG9uXG5cdFx0XHQvLyB0aGUgZmxvb3IgLSBzdG9wcGluZyB0aGUgd2lkZ2V0IChlLmcuIHRoZSB0ZXJtaW5hbCkgZnJvbSBwYXNzaW5nIGl0IHRvIHRoZSBJTUUuXG5cdFx0XHR0aGlzLl9sb2coYFxcXFwgS2V5Ym9hcmQgZXZlbnQgaXMgcGFydCBvZiBhbiBJTUUgY29tcG9zaXRpb25gKTtcblx0XHRcdHJldHVybiBOb01hdGNoaW5nS2I7XG5cdFx0fVxuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLnJlc29sdmVLZXlib2FyZEV2ZW50KGUpO1xuXHRcdGlmIChrZXliaW5kaW5nLmhhc011bHRpcGxlQ2hvcmRzKCkpIHtcblx0XHRcdGNvbnNvbGUud2Fybigna2V5Ym9hcmQgZXZlbnQgc2hvdWxkIG5vdCBiZSBtYXBwZWQgdG8gbXVsdGlwbGUgY2hvcmRzJyk7XG5cdFx0XHRyZXR1cm4gTm9NYXRjaGluZ0tiO1xuXHRcdH1cblx0XHRjb25zdCBbZmlyc3RDaG9yZCxdID0ga2V5YmluZGluZy5nZXREaXNwYXRjaENob3JkcygpO1xuXHRcdGlmIChmaXJzdENob3JkID09PSBudWxsKSB7XG5cdFx0XHQvLyBjYW5ub3QgYmUgZGlzcGF0Y2hlZCwgcHJvYmFibHkgb25seSBtb2RpZmllciBrZXlzXG5cdFx0XHR0aGlzLl9sb2coYFxcXFwgS2V5Ym9hcmQgZXZlbnQgY2Fubm90IGJlIGRpc3BhdGNoZWRgKTtcblx0XHRcdHJldHVybiBOb01hdGNoaW5nS2I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dFZhbHVlID0gdGhpcy5fY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dCh0YXJnZXQpO1xuXHRcdGNvbnN0IGN1cnJlbnRDaG9yZHMgPSB0aGlzLl9jdXJyZW50Q2hvcmRzLm1hcCgoKHsga2V5cHJlc3MgfSkgPT4ga2V5cHJlc3MpKTtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0UmVzb2x2ZXIoKS5yZXNvbHZlKGNvbnRleHRWYWx1ZSwgY3VycmVudENob3JkcywgZmlyc3RDaG9yZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZUxlYXZlQ2hvcmRNb2RlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNob3JkTGFzdEludGVyYWN0ZWRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHR0aGlzLl9jdXJyZW50Q2hvcmRDaGVja2VyLmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cblx0XHRcdGlmICghdGhpcy5fZG9jdW1lbnRIYXNGb2N1cygpKSB7XG5cdFx0XHRcdC8vIEZvY3VzIGhhcyBiZWVuIGxvc3QgPT4gbGVhdmUgY2hvcmQgbW9kZVxuXHRcdFx0XHR0aGlzLl9sZWF2ZUNob3JkTW9kZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChEYXRlLm5vdygpIC0gY2hvcmRMYXN0SW50ZXJhY3RlZFRpbWUgPiA1MDAwKSB7XG5cdFx0XHRcdC8vIDUgc2Vjb25kcyBlbGFwc2VkID0+IGxlYXZlIGNob3JkIG1vZGVcblx0XHRcdFx0dGhpcy5fbGVhdmVDaG9yZE1vZGUoKTtcblx0XHRcdH1cblxuXHRcdH0sIDUwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9leHBlY3RBbm90aGVyQ2hvcmQoZmlyc3RDaG9yZDogc3RyaW5nLCBrZXlwcmVzc0xhYmVsOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG5cblx0XHR0aGlzLl9jdXJyZW50Q2hvcmRzLnB1c2goeyBrZXlwcmVzczogZmlyc3RDaG9yZCwgbGFiZWw6IGtleXByZXNzTGFiZWwgfSk7XG5cblx0XHRzd2l0Y2ggKHRoaXMuX2N1cnJlbnRDaG9yZHMubGVuZ3RoKSB7XG5cdFx0XHRjYXNlIDA6XG5cdFx0XHRcdHRocm93IGlsbGVnYWxTdGF0ZSgnaW1wb3NzaWJsZScpO1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHQvLyBUT0RPQHVsdWdiZWtuYTogcmV2aXNlIHRoaXMgbWVzc2FnZSBhbmQgdGhlIG9uZSBiZWxvdyAoYXQgbGVhc3QsIGZpeCB0ZXJtaW5vbG9neSlcblx0XHRcdFx0dGhpcy5fY3VycmVudENob3JkU3RhdHVzTWVzc2FnZSA9IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uuc3RhdHVzKG5scy5sb2NhbGl6ZSgnZmlyc3QuY2hvcmQnLCBcIih7MH0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uXCIsIGtleXByZXNzTGFiZWwpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGNvbnN0IGZ1bGxLZXlwcmVzc0xhYmVsID0gdGhpcy5fY3VycmVudENob3Jkcy5tYXAoKHsgbGFiZWwgfSkgPT4gbGFiZWwpLmpvaW4oJywgJyk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRDaG9yZFN0YXR1c01lc3NhZ2UgPSB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnN0YXR1cyhubHMubG9jYWxpemUoJ25leHQuY2hvcmQnLCBcIih7MH0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBuZXh0IGtleSBvZiBjaG9yZC4uLlwiLCBmdWxsS2V5cHJlc3NMYWJlbCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NjaGVkdWxlTGVhdmVDaG9yZE1vZGUoKTtcblxuXHRcdGlmIChJTUUuZW5hYmxlZCkge1xuXHRcdFx0SU1FLmRpc2FibGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sZWF2ZUNob3JkTW9kZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudENob3JkU3RhdHVzTWVzc2FnZSkge1xuXHRcdFx0dGhpcy5fY3VycmVudENob3JkU3RhdHVzTWVzc2FnZS5jbG9zZSgpO1xuXHRcdFx0dGhpcy5fY3VycmVudENob3JkU3RhdHVzTWVzc2FnZSA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRDaG9yZENoZWNrZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5fY3VycmVudENob3JkcyA9IFtdO1xuXHRcdElNRS5lbmFibGUoKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwYXRjaEJ5VXNlclNldHRpbmdzTGFiZWwodXNlclNldHRpbmdzTGFiZWw6IHN0cmluZywgdGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2coYC8gRGlzcGF0Y2hpbmcga2V5YmluZGluZyB0cmlnZ2VyZWQgdmlhIG1lbnUgZW50cnkgYWNjZWxlcmF0b3IgLSAke3VzZXJTZXR0aW5nc0xhYmVsfWApO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdzID0gdGhpcy5yZXNvbHZlVXNlckJpbmRpbmcodXNlclNldHRpbmdzTGFiZWwpO1xuXHRcdGlmIChrZXliaW5kaW5ncy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2xvZyhgXFxcXCBDb3VsZCBub3QgcmVzb2x2ZSAtICR7dXNlclNldHRpbmdzTGFiZWx9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RvRGlzcGF0Y2goa2V5YmluZGluZ3NbMF0sIHRhcmdldCwgLyppc1NpbmdsZU1vZGlmZXJDaG9yZCovZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfZGlzcGF0Y2goZTogSUtleWJvYXJkRXZlbnQsIHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0KTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzS2V5SW5Db21wb3NpdGlvbihlKSkge1xuXHRcdFx0Ly8gVGhlIGtleXN0cm9rZSBiZWxvbmdzIHRvIHRoZSBJTUUsIHdoaWNoIG93bnMgRW50ZXIgKGNvbW1pdCksIFNwYWNlIGFuZCB0aGUgYXJyb3dzXG5cdFx0XHQvLyAoY2FuZGlkYXRlIHNlbGVjdGlvbikgYW5kIEVzY2FwZSAoY2FuY2VsKSBmb3IgdGhlIGR1cmF0aW9uIG9mIHRoZSBjb21wb3NpdGlvbi5cblx0XHRcdC8vIERpc3BhdGNoaW5nIHdvdWxkIHJ1biBjb21tYW5kcyB0aGUgdXNlciBuZXZlciBpbnZva2VkIC0gZS5nLiBhY2NlcHRpbmcgYSBwaWNrZXIgb3Jcblx0XHRcdC8vIHN1Ym1pdHRpbmcgYSBmb3JtIHdoaWxlIHRoZXkgYXJlIHN0aWxsIGNob29zaW5nIGNoYXJhY3RlcnMuXG5cdFx0XHR0aGlzLl9sb2coYCsgSWdub3Jpbmcga2V5YmluZGluZyBkaXNwYXRjaCBiZWNhdXNlIGFuIElNRSBjb21wb3NpdGlvbiBpcyBpbiBwcm9ncmVzcy5gKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RvRGlzcGF0Y2godGhpcy5yZXNvbHZlS2V5Ym9hcmRFdmVudChlKSwgdGFyZ2V0LCAvKmlzU2luZ2xlTW9kaWZlckNob3JkKi9mYWxzZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3NpbmdsZU1vZGlmaWVyRGlzcGF0Y2goZTogSUtleWJvYXJkRXZlbnQsIHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0KTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzS2V5SW5Db21wb3NpdGlvbihlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5yZXNvbHZlS2V5Ym9hcmRFdmVudChlKTtcblx0XHRjb25zdCBbc2luZ2xlTW9kaWZpZXIsXSA9IGtleWJpbmRpbmcuZ2V0U2luZ2xlTW9kaWZpZXJEaXNwYXRjaENob3JkcygpO1xuXG5cdFx0aWYgKHNpbmdsZU1vZGlmaWVyKSB7XG5cblx0XHRcdGlmICh0aGlzLl9pZ25vcmVTaW5nbGVNb2RpZmllcnMuaGFzKHNpbmdsZU1vZGlmaWVyKSkge1xuXHRcdFx0XHR0aGlzLl9sb2coYCsgSWdub3Jpbmcgc2luZ2xlIG1vZGlmaWVyICR7c2luZ2xlTW9kaWZpZXJ9IGR1ZSB0byBpdCBiZWluZyBwcmVzc2VkIHRvZ2V0aGVyIHdpdGggb3RoZXIga2V5cy5gKTtcblx0XHRcdFx0dGhpcy5faWdub3JlU2luZ2xlTW9kaWZpZXJzID0gS2V5YmluZGluZ01vZGlmaWVyU2V0LkVNUFRZO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXJDbGVhclRpbWVvdXQuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTaW5nbGVNb2RpZmllciA9IG51bGw7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5faWdub3JlU2luZ2xlTW9kaWZpZXJzID0gS2V5YmluZGluZ01vZGlmaWVyU2V0LkVNUFRZO1xuXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyID09PSBudWxsKSB7XG5cdFx0XHRcdC8vIHdlIGhhdmUgYSB2YWxpZCBgc2luZ2xlTW9kaWZpZXJgLCBzdG9yZSBpdCBmb3IgdGhlIG5leHQga2V5dXAsIGJ1dCBjbGVhciBpdCBpbiAzMDBtc1xuXHRcdFx0XHR0aGlzLl9sb2coYCsgU3RvcmluZyBzaW5nbGUgbW9kaWZpZXIgZm9yIHBvc3NpYmxlIGNob3JkICR7c2luZ2xlTW9kaWZpZXJ9LmApO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIgPSBzaW5nbGVNb2RpZmllcjtcblx0XHRcdFx0dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyQ2xlYXJUaW1lb3V0LmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nKGArIENsZWFyaW5nIHNpbmdsZSBtb2RpZmllciBkdWUgdG8gMzAwbXMgZWxhcHNlZC5gKTtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIgPSBudWxsO1xuXHRcdFx0XHR9LCAzMDApO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzaW5nbGVNb2RpZmllciA9PT0gdGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyKSB7XG5cdFx0XHRcdC8vIGJpbmdvIVxuXHRcdFx0XHR0aGlzLl9sb2coYC8gRGlzcGF0Y2hpbmcgc2luZ2xlIG1vZGlmaWVyIGNob3JkICR7c2luZ2xlTW9kaWZpZXJ9ICR7c2luZ2xlTW9kaWZpZXJ9YCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTaW5nbGVNb2RpZmllckNsZWFyVGltZW91dC5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyID0gbnVsbDtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RvRGlzcGF0Y2goa2V5YmluZGluZywgdGFyZ2V0LCAvKmlzU2luZ2xlTW9kaWZlckNob3JkKi90cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nKGArIENsZWFyaW5nIHNpbmdsZSBtb2RpZmllciBkdWUgdG8gbW9kaWZpZXIgbWlzbWF0Y2g6ICR7dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyfSAke3NpbmdsZU1vZGlmaWVyfWApO1xuXHRcdFx0dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyQ2xlYXJUaW1lb3V0LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyID0gbnVsbDtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHByZXNzaW5nIGEgbW9kaWZpZXIgYW5kIGhvbGRpbmcgaXQgcHJlc3NlZCB3aXRoIGFueSBvdGhlciBtb2RpZmllciBvciBrZXkgY29tYmluYXRpb24sXG5cdFx0Ly8gdGhlIHByZXNzZWQgbW9kaWZpZXJzIHNob3VsZCBubyBsb25nZXIgYmUgY29uc2lkZXJlZCBmb3Igc2luZ2xlIG1vZGlmaWVyIGRpc3BhdGNoLlxuXHRcdGNvbnN0IFtmaXJzdENob3JkLF0gPSBrZXliaW5kaW5nLmdldENob3JkcygpO1xuXHRcdHRoaXMuX2lnbm9yZVNpbmdsZU1vZGlmaWVycyA9IG5ldyBLZXliaW5kaW5nTW9kaWZpZXJTZXQoZmlyc3RDaG9yZCk7XG5cblx0XHRpZiAodGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyICE9PSBudWxsKSB7XG5cdFx0XHR0aGlzLl9sb2coYCsgQ2xlYXJpbmcgc2luZ2xlIG1vZGlmaWVyIGR1ZSB0byBvdGhlciBrZXkgdXAuYCk7XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRTaW5nbGVNb2RpZmllckNsZWFyVGltZW91dC5jYW5jZWwoKTtcblx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIgPSBudWxsO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2RvRGlzcGF0Y2godXNlcktleXByZXNzOiBSZXNvbHZlZEtleWJpbmRpbmcsIHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0LCBpc1NpbmdsZU1vZGlmZXJDaG9yZCA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0bGV0IHNob3VsZFByZXZlbnREZWZhdWx0ID0gZmFsc2U7XG5cblx0XHRpZiAodXNlcktleXByZXNzLmhhc011bHRpcGxlQ2hvcmRzKCkpIHsgLy8gd2FybiAtIGJlY2F1c2UgdXNlciBjYW4gcHJlc3MgYSBzaW5nbGUgY2hvcmQgYXQgYSB0aW1lXG5cdFx0XHRjb25zb2xlLndhcm4oJ1VuZXhwZWN0ZWQga2V5Ym9hcmQgZXZlbnQgbWFwcGVkIHRvIG11bHRpcGxlIGNob3JkcycpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCB1c2VyUHJlc3NlZENob3JkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgY3VycmVudENob3Jkczogc3RyaW5nW10gfCBudWxsID0gbnVsbDtcblxuXHRcdGlmIChpc1NpbmdsZU1vZGlmZXJDaG9yZCkge1xuXHRcdFx0Ly8gVGhlIGtleWJpbmRpbmcgaXMgdGhlIHNlY29uZCBrZXlwcmVzcyBvZiBhIHNpbmdsZSBtb2RpZmllciBjaG9yZCwgZS5nLiBcInNoaWZ0IHNoaWZ0XCIuXG5cdFx0XHQvLyBBIHNpbmdsZSBtb2RpZmllciBjYW4gb25seSBvY2N1ciB3aGVuIHRoZSBzYW1lIG1vZGlmaWVyIGlzIHByZXNzZWQgaW4gc2hvcnQgc2VxdWVuY2UsXG5cdFx0XHQvLyBoZW5jZSB3ZSBkaXNyZWdhcmQgYF9jdXJyZW50Q2hvcmRgIGFuZCB1c2UgdGhlIHNhbWUgbW9kaWZpZXIgaW5zdGVhZC5cblx0XHRcdGNvbnN0IFtkaXNwYXRjaEtleW5hbWUsXSA9IHVzZXJLZXlwcmVzcy5nZXRTaW5nbGVNb2RpZmllckRpc3BhdGNoQ2hvcmRzKCk7XG5cdFx0XHR1c2VyUHJlc3NlZENob3JkID0gZGlzcGF0Y2hLZXluYW1lO1xuXHRcdFx0Y3VycmVudENob3JkcyA9IGRpc3BhdGNoS2V5bmFtZSA/IFtkaXNwYXRjaEtleW5hbWVdIDogW107IC8vIFRPRE9AdWx1Z2Jla25hOiBpbiB0aGUgYGVsc2VgIGNhc2Ugd2UgYXNzaWduIGFuIGVtcHR5IGFycmF5IC0gbWFrZSBzdXJlIGByZXNvbHZlYCBjYW4gaGFuZGxlIGFuIGVtcHR5IGFycmF5IHdlbGxcblx0XHR9IGVsc2Uge1xuXHRcdFx0W3VzZXJQcmVzc2VkQ2hvcmQsXSA9IHVzZXJLZXlwcmVzcy5nZXREaXNwYXRjaENob3JkcygpO1xuXHRcdFx0Y3VycmVudENob3JkcyA9IHRoaXMuX2N1cnJlbnRDaG9yZHMubWFwKCh7IGtleXByZXNzIH0pID0+IGtleXByZXNzKTtcblx0XHR9XG5cblx0XHRpZiAodXNlclByZXNzZWRDaG9yZCA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fbG9nKGBcXFxcIEtleWJvYXJkIGV2ZW50IGNhbm5vdCBiZSBkaXNwYXRjaGVkIGluIGtleWRvd24gcGhhc2UuYCk7XG5cdFx0XHQvLyBjYW5ub3QgYmUgZGlzcGF0Y2hlZCwgcHJvYmFibHkgb25seSBtb2RpZmllciBrZXlzXG5cdFx0XHRyZXR1cm4gc2hvdWxkUHJldmVudERlZmF1bHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dFZhbHVlID0gdGhpcy5fY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dCh0YXJnZXQpO1xuXHRcdGNvbnN0IGtleXByZXNzTGFiZWwgPSB1c2VyS2V5cHJlc3MuZ2V0TGFiZWwoKTtcblxuXHRcdGNvbnN0IHJlc29sdmVSZXN1bHQgPSB0aGlzLl9nZXRSZXNvbHZlcigpLnJlc29sdmUoY29udGV4dFZhbHVlLCBjdXJyZW50Q2hvcmRzLCB1c2VyUHJlc3NlZENob3JkKTtcblxuXHRcdHN3aXRjaCAocmVzb2x2ZVJlc3VsdC5raW5kKSB7XG5cblx0XHRcdGNhc2UgUmVzdWx0S2luZC5Ob01hdGNoaW5nS2I6IHtcblxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdLZXliaW5kaW5nU2VydmljZSNkaXNwYXRjaCcsIGtleXByZXNzTGFiZWwsIGBbIE5vIG1hdGNoaW5nIGtleWJpbmRpbmcgXWApO1xuXG5cdFx0XHRcdGlmICh0aGlzLmluQ2hvcmRNb2RlKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudENob3Jkc0xhYmVsID0gdGhpcy5fY3VycmVudENob3Jkcy5tYXAoKHsgbGFiZWwgfSkgPT4gbGFiZWwpLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0dGhpcy5fbG9nKGArIExlYXZpbmcgbXVsdGktY2hvcmQgbW9kZTogTm90aGluZyBib3VuZCB0byBcIiR7Y3VycmVudENob3Jkc0xhYmVsfSwgJHtrZXlwcmVzc0xhYmVsfVwiLmApO1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uuc3RhdHVzKG5scy5sb2NhbGl6ZSgnbWlzc2luZy5jaG9yZCcsIFwiVGhlIGtleSBjb21iaW5hdGlvbiAoezB9LCB7MX0pIGlzIG5vdCBhIGNvbW1hbmQuXCIsIGN1cnJlbnRDaG9yZHNMYWJlbCwga2V5cHJlc3NMYWJlbCksIHsgaGlkZUFmdGVyOiAxMCAqIDEwMDAgLyogMTBzICovIH0pO1xuXHRcdFx0XHRcdHRoaXMuX2xlYXZlQ2hvcmRNb2RlKCk7XG5cblx0XHRcdFx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHNob3VsZFByZXZlbnREZWZhdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIFJlc3VsdEtpbmQuTW9yZUNob3Jkc05lZWRlZDoge1xuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0tleWJpbmRpbmdTZXJ2aWNlI2Rpc3BhdGNoJywga2V5cHJlc3NMYWJlbCwgYFsgU2V2ZXJhbCBrZXliaW5kaW5ncyBtYXRjaCAtIG1vcmUgY2hvcmRzIG5lZWRlZCBdYCk7XG5cblx0XHRcdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9leHBlY3RBbm90aGVyQ2hvcmQodXNlclByZXNzZWRDaG9yZCwga2V5cHJlc3NMYWJlbCk7XG5cdFx0XHRcdHRoaXMuX2xvZyh0aGlzLl9jdXJyZW50Q2hvcmRzLmxlbmd0aCA9PT0gMSA/IGArIEVudGVyaW5nIG11bHRpLWNob3JkIG1vZGUuLi5gIDogYCsgQ29udGludWluZyBtdWx0aS1jaG9yZCBtb2RlLi4uYCk7XG5cdFx0XHRcdHJldHVybiBzaG91bGRQcmV2ZW50RGVmYXVsdDtcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSBSZXN1bHRLaW5kLktiRm91bmQ6IHtcblxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdLZXliaW5kaW5nU2VydmljZSNkaXNwYXRjaCcsIGtleXByZXNzTGFiZWwsIGBbIFdpbGwgZGlzcGF0Y2ggY29tbWFuZCAke3Jlc29sdmVSZXN1bHQuY29tbWFuZElkfSBdYCk7XG5cblx0XHRcdFx0aWYgKHJlc29sdmVSZXN1bHQuY29tbWFuZElkID09PSBudWxsIHx8IHJlc29sdmVSZXN1bHQuY29tbWFuZElkID09PSAnJykge1xuXG5cdFx0XHRcdFx0aWYgKHRoaXMuaW5DaG9yZE1vZGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRDaG9yZHNMYWJlbCA9IHRoaXMuX2N1cnJlbnRDaG9yZHMubWFwKCh7IGxhYmVsIH0pID0+IGxhYmVsKS5qb2luKCcsICcpO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nKGArIExlYXZpbmcgY2hvcmQgbW9kZTogTm90aGluZyBib3VuZCB0byBcIiR7Y3VycmVudENob3Jkc0xhYmVsfSwgJHtrZXlwcmVzc0xhYmVsfVwiLmApO1xuXHRcdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5zdGF0dXMobmxzLmxvY2FsaXplKCdtaXNzaW5nLmNob3JkJywgXCJUaGUga2V5IGNvbWJpbmF0aW9uICh7MH0sIHsxfSkgaXMgbm90IGEgY29tbWFuZC5cIiwgY3VycmVudENob3Jkc0xhYmVsLCBrZXlwcmVzc0xhYmVsKSwgeyBoaWRlQWZ0ZXI6IDEwICogMTAwMCAvKiAxMHMgKi8gfSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9sZWF2ZUNob3JkTW9kZSgpO1xuXHRcdFx0XHRcdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICh0aGlzLmluQ2hvcmRNb2RlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sZWF2ZUNob3JkTW9kZSgpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghcmVzb2x2ZVJlc3VsdC5pc0J1YmJsZSkge1xuXHRcdFx0XHRcdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX2xvZyhgKyBJbnZva2luZyBjb21tYW5kICR7cmVzb2x2ZVJlc3VsdC5jb21tYW5kSWR9LmApO1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRseURpc3BhdGNoaW5nQ29tbWFuZElkID0gcmVzb2x2ZVJlc3VsdC5jb21tYW5kSWQ7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcmVzb2x2ZVJlc3VsdC5jb21tYW5kQXJncyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQocmVzb2x2ZVJlc3VsdC5jb21tYW5kSWQpLnRoZW4odW5kZWZpbmVkLCBlcnIgPT4gdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKGVycikpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQocmVzb2x2ZVJlc3VsdC5jb21tYW5kSWQsIHJlc29sdmVSZXN1bHQuY29tbWFuZEFyZ3MpLnRoZW4odW5kZWZpbmVkLCBlcnIgPT4gdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKGVycikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jdXJyZW50bHlEaXNwYXRjaGluZ0NvbW1hbmRJZCA9IG51bGw7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFISUdIX0ZSRVFfQ09NTUFORFMudGVzdChyZXNvbHZlUmVzdWx0LmNvbW1hbmRJZCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiByZXNvbHZlUmVzdWx0LmNvbW1hbmRJZCwgZnJvbTogJ2tleWJpbmRpbmcnLCBkZXRhaWw6IHVzZXJLZXlwcmVzcy5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpID8/IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gc2hvdWxkUHJldmVudERlZmF1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YWJzdHJhY3QgZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRtaWdodFByb2R1Y2VQcmludGFibGVDaGFyYWN0ZXIoZXZlbnQ6IElLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkge1xuXHRcdFx0Ly8gaWdub3JlIGN0cmwvY21kLWNvbWJpbmF0aW9uIGJ1dCBub3Qgc2hpZnQvYWx0LWNvbWJpbmF0aW9zXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIHdlYWsgY2hlY2sgZm9yIGNlcnRhaW4gcmFuZ2VzLiB0aGlzIGlzIHByb3Blcmx5IGltcGxlbWVudGVkIGluIGEgc3ViY2xhc3Ncblx0XHQvLyB3aXRoIGFjY2VzcyB0byB0aGUgS2V5Ym9hcmRNYXBwZXJGYWN0b3J5LlxuXHRcdGlmICgoZXZlbnQua2V5Q29kZSA+PSBLZXlDb2RlLktleUEgJiYgZXZlbnQua2V5Q29kZSA8PSBLZXlDb2RlLktleVopXG5cdFx0XHR8fCAoZXZlbnQua2V5Q29kZSA+PSBLZXlDb2RlLkRpZ2l0MCAmJiBldmVudC5rZXlDb2RlIDw9IEtleUNvZGUuRGlnaXQ5KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBhcHBlbmRLZXliaW5kaW5nKGxhYmVsOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCwgY29udGV4dD86IElDb250ZXh0S2V5U2VydmljZSwgZW5mb3JjZUNvbnRleHRDaGVjaz86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGlmIChjb21tYW5kSWQpIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IHRoaXMubG9va3VwS2V5YmluZGluZyhjb21tYW5kSWQsIGNvbnRleHQsIGVuZm9yY2VDb250ZXh0Q2hlY2spPy5nZXRMYWJlbCgpO1xuXHRcdFx0aWYgKGtleWJpbmRpbmdMYWJlbCkge1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAna2V5YmluZGluZ0xhYmVsJywgY29tbWVudDogWydVSSBlbGVtZW50IGxhYmVsJywgJ0Ega2V5YmluZGluZyBsYWJlbCddIH0sXG5cdFx0XHRcdFx0XCJ7MH0gKHsxfSlcIixcblx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRrZXliaW5kaW5nTGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGFiZWw7XG5cdH1cbn1cblxuY2xhc3MgS2V5YmluZGluZ01vZGlmaWVyU2V0IHtcblxuXHRwdWJsaWMgc3RhdGljIEVNUFRZID0gbmV3IEtleWJpbmRpbmdNb2RpZmllclNldChudWxsKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHJsS2V5OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGlmdEtleTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWx0S2V5OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXRhS2V5OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogUmVzb2x2ZWRDaG9yZCB8IG51bGwpIHtcblx0XHR0aGlzLl9jdHJsS2V5ID0gc291cmNlID8gc291cmNlLmN0cmxLZXkgOiBmYWxzZTtcblx0XHR0aGlzLl9zaGlmdEtleSA9IHNvdXJjZSA/IHNvdXJjZS5zaGlmdEtleSA6IGZhbHNlO1xuXHRcdHRoaXMuX2FsdEtleSA9IHNvdXJjZSA/IHNvdXJjZS5hbHRLZXkgOiBmYWxzZTtcblx0XHR0aGlzLl9tZXRhS2V5ID0gc291cmNlID8gc291cmNlLm1ldGFLZXkgOiBmYWxzZTtcblx0fVxuXG5cdGhhcyhtb2RpZmllcjogU2luZ2xlTW9kaWZpZXJDaG9yZCkge1xuXHRcdHN3aXRjaCAobW9kaWZpZXIpIHtcblx0XHRcdGNhc2UgJ2N0cmwnOiByZXR1cm4gdGhpcy5fY3RybEtleTtcblx0XHRcdGNhc2UgJ3NoaWZ0JzogcmV0dXJuIHRoaXMuX3NoaWZ0S2V5O1xuXHRcdFx0Y2FzZSAnYWx0JzogcmV0dXJuIHRoaXMuX2FsdEtleTtcblx0XHRcdGNhc2UgJ21ldGEnOiByZXR1cm4gdGhpcy5fbWV0YUtleTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFlBQVksWUFBWTtBQUN4QixTQUFTLGVBQWUsb0JBQW9CO0FBQzVDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQWU7QUFFeEIsU0FBUyxrQkFBK0I7QUFDeEMsWUFBWSxTQUFTO0FBS3JCLFNBQStDLFlBQVksb0JBQW9CO0FBVy9FLE1BQU0scUJBQXFCO0FBTzNCLFNBQVMsbUJBQW1CLEdBQTRCO0FBQ3ZELFNBQU8sRUFBRSxZQUFZLFFBQVE7QUFDOUI7QUFFTyxNQUFlLGtDQUFrQyxXQUF5QztBQUFBLEVBK0JoRyxZQUNTLG9CQUNFLGlCQUNBLG1CQUNGLHNCQUNFLGFBQ1Q7QUFDRCxVQUFNO0FBTkU7QUFDRTtBQUNBO0FBQ0Y7QUFDRTtBQWhDWCxTQUFtQiwwQkFBeUMsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBb0M3RixTQUFLLGlC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
