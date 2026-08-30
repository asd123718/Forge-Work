import { CharCode } from "../../../../base/common/charCode.js";
import { KeyCode, KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, ScanCode, ScanCodeUtils, NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE } from "../../../../base/common/keyCodes.js";
import { KeyCodeChord, ScanCodeChord } from "../../../../base/common/keybindings.js";
import { UILabelProvider } from "../../../../base/common/keybindingLabels.js";
import { OperatingSystem } from "../../../../base/common/platform.js";
import { BaseResolvedKeybinding } from "../../../../platform/keybinding/common/baseResolvedKeybinding.js";
import { toEmptyArrayIfContainsNull } from "../../../../platform/keybinding/common/resolvedKeybindingItem.js";
const LOG = false;
function log(str) {
  if (LOG) {
    console.info(str);
  }
}
class WindowsNativeResolvedKeybinding extends BaseResolvedKeybinding {
  constructor(mapper, chords) {
    super(OperatingSystem.Windows, chords);
    this._mapper = mapper;
  }
  _getLabel(chord) {
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    return this._mapper.getUILabelForKeyCode(chord.keyCode);
  }
  _getUSLabelForKeybinding(chord) {
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    return KeyCodeUtils.toString(chord.keyCode);
  }
  getUSLabel() {
    return UILabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getUSLabelForKeybinding(keybinding));
  }
  _getAriaLabel(chord) {
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    return this._mapper.getAriaLabelForKeyCode(chord.keyCode);
  }
  _getElectronAccelerator(chord) {
    return this._mapper.getElectronAcceleratorForKeyBinding(chord);
  }
  _getUserSettingsLabel(chord) {
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    const result = this._mapper.getUserSettingsLabelForKeyCode(chord.keyCode);
    return result ? result.toLowerCase() : result;
  }
  _isWYSIWYG(chord) {
    return this.__isWYSIWYG(chord.keyCode);
  }
  __isWYSIWYG(keyCode) {
    if (keyCode === KeyCode.LeftArrow || keyCode === KeyCode.UpArrow || keyCode === KeyCode.RightArrow || keyCode === KeyCode.DownArrow) {
      return true;
    }
    const ariaLabel = this._mapper.getAriaLabelForKeyCode(keyCode);
    const userSettingsLabel = this._mapper.getUserSettingsLabelForKeyCode(keyCode);
    return ariaLabel === userSettingsLabel;
  }
  _getChordDispatch(chord) {
    if (chord.isModifierKey()) {
      return null;
    }
    let result = "";
    if (chord.ctrlKey) {
      result += "ctrl+";
    }
    if (chord.shiftKey) {
      result += "shift+";
    }
    if (chord.altKey) {
      result += "alt+";
    }
    if (chord.metaKey) {
      result += "meta+";
    }
    result += KeyCodeUtils.toString(chord.keyCode);
    return result;
  }
  _getSingleModifierChordDispatch(chord) {
    if (chord.keyCode === KeyCode.Ctrl && !chord.shiftKey && !chord.altKey && !chord.metaKey) {
      return "ctrl";
    }
    if (chord.keyCode === KeyCode.Shift && !chord.ctrlKey && !chord.altKey && !chord.metaKey) {
      return "shift";
    }
    if (chord.keyCode === KeyCode.Alt && !chord.ctrlKey && !chord.shiftKey && !chord.metaKey) {
      return "alt";
    }
    if (chord.keyCode === KeyCode.Meta && !chord.ctrlKey && !chord.shiftKey && !chord.altKey) {
      return "meta";
    }
    return null;
  }
  static getProducedCharCode(chord, mapping) {
    if (!mapping) {
      return null;
    }
    if (chord.ctrlKey && chord.shiftKey && chord.altKey) {
      return mapping.withShiftAltGr;
    }
    if (chord.ctrlKey && chord.altKey) {
      return mapping.withAltGr;
    }
    if (chord.shiftKey) {
      return mapping.withShift;
    }
    return mapping.value;
  }
  static getProducedChar(chord, mapping) {
    const char = this.getProducedCharCode(chord, mapping);
    if (char === null || char.length === 0) {
      return " --- ";
    }
    return "  " + char + "  ";
  }
}
class WindowsKeyboardMapper {
  constructor(_isUSStandard, rawMappings, _mapAltGrToCtrlAlt) {
    this._isUSStandard = _isUSStandard;
    this._mapAltGrToCtrlAlt = _mapAltGrToCtrlAlt;
    this._keyCodeToLabel = [];
    this._scanCodeToKeyCode = [];
    this._keyCodeToLabel = [];
    this._keyCodeExists = [];
    this._keyCodeToLabel[KeyCode.Unknown] = KeyCodeUtils.toString(KeyCode.Unknown);
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
      if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
        this._scanCodeToKeyCode[scanCode] = immutableKeyCode;
        this._keyCodeToLabel[immutableKeyCode] = KeyCodeUtils.toString(immutableKeyCode);
        this._keyCodeExists[immutableKeyCode] = true;
      }
    }
    const producesLetter = [];
    let producesLetters = false;
    this._codeInfo = [];
    for (const strCode in rawMappings) {
      if (rawMappings.hasOwnProperty(strCode)) {
        const scanCode = ScanCodeUtils.toEnum(strCode);
        if (scanCode === ScanCode.None) {
          log(`Unknown scanCode ${strCode} in mapping.`);
          continue;
        }
        const rawMapping = rawMappings[strCode];
        const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
        if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
          const keyCode2 = NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || KeyCode.Unknown;
          if (keyCode2 === KeyCode.Unknown || immutableKeyCode === keyCode2) {
            continue;
          }
          if (scanCode !== ScanCode.NumpadComma) {
            continue;
          }
        }
        const value = rawMapping.value;
        const withShift = rawMapping.withShift;
        const withAltGr = rawMapping.withAltGr;
        const withShiftAltGr = rawMapping.withShiftAltGr;
        const keyCode = NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || KeyCode.Unknown;
        const mapping = {
          scanCode,
          keyCode,
          value,
          withShift,
          withAltGr,
          withShiftAltGr
        };
        this._codeInfo[scanCode] = mapping;
        this._scanCodeToKeyCode[scanCode] = keyCode;
        if (keyCode === KeyCode.Unknown) {
          continue;
        }
        this._keyCodeExists[keyCode] = true;
        if (value.length === 0) {
          this._keyCodeToLabel[keyCode] = null;
        } else if (value.length > 1) {
          this._keyCodeToLabel[keyCode] = value;
        } else {
          const charCode = value.charCodeAt(0);
          if (charCode >= CharCode.a && charCode <= CharCode.z) {
            const upperCaseValue = CharCode.A + (charCode - CharCode.a);
            producesLetter[upperCaseValue] = true;
            producesLetters = true;
            this._keyCodeToLabel[keyCode] = String.fromCharCode(CharCode.A + (charCode - CharCode.a));
          } else if (charCode >= CharCode.A && charCode <= CharCode.Z) {
            producesLetter[charCode] = true;
            producesLetters = true;
            this._keyCodeToLabel[keyCode] = value;
          } else {
            this._keyCodeToLabel[keyCode] = value;
          }
        }
      }
    }
    const _registerLetterIfMissing = (charCode, keyCode) => {
      if (!producesLetter[charCode]) {
        this._keyCodeToLabel[keyCode] = String.fromCharCode(charCode);
      }
    };
    _registerLetterIfMissing(CharCode.A, KeyCode.KeyA);
    _registerLetterIfMissing(CharCode.B, KeyCode.KeyB);
    _registerLetterIfMissing(CharCode.C, KeyCode.KeyC);
    _registerLetterIfMissing(CharCode.D, KeyCode.KeyD);
    _registerLetterIfMissing(CharCode.E, KeyCode.KeyE);
    _registerLetterIfMissing(CharCode.F, KeyCode.KeyF);
    _registerLetterIfMissing(CharCode.G, KeyCode.KeyG);
    _registerLetterIfMissing(CharCode.H, KeyCode.KeyH);
    _registerLetterIfMissing(CharCode.I, KeyCode.KeyI);
    _registerLetterIfMissing(CharCode.J, KeyCode.KeyJ);
    _registerLetterIfMissing(CharCode.K, KeyCode.KeyK);
    _registerLetterIfMissing(CharCode.L, KeyCode.KeyL);
    _registerLetterIfMissing(CharCode.M, KeyCode.KeyM);
    _registerLetterIfMissing(CharCode.N, KeyCode.KeyN);
    _registerLetterIfMissing(CharCode.O, KeyCode.KeyO);
    _registerLetterIfMissing(CharCode.P, KeyCode.KeyP);
    _registerLetterIfMissing(CharCode.Q, KeyCode.KeyQ);
    _registerLetterIfMissing(CharCode.R, KeyCode.KeyR);
    _registerLetterIfMissing(CharCode.S, KeyCode.KeyS);
    _registerLetterIfMissing(CharCode.T, KeyCode.KeyT);
    _registerLetterIfMissing(CharCode.U, KeyCode.KeyU);
    _registerLetterIfMissing(CharCode.V, KeyCode.KeyV);
    _registerLetterIfMissing(CharCode.W, KeyCode.KeyW);
    _registerLetterIfMissing(CharCode.X, KeyCode.KeyX);
    _registerLetterIfMissing(CharCode.Y, KeyCode.KeyY);
    _registerLetterIfMissing(CharCode.Z, KeyCode.KeyZ);
    if (!producesLetters) {
      const _registerLabel = (keyCode, charCode) => {
        this._keyCodeToLabel[keyCode] = String.fromCharCode(charCode);
      };
      _registerLabel(KeyCode.Semicolon, CharCode.Semicolon);
      _registerLabel(KeyCode.Equal, CharCode.Equals);
      _registerLabel(KeyCode.Comma, CharCode.Comma);
      _registerLabel(KeyCode.Minus, CharCode.Dash);
      _registerLabel(KeyCode.Period, CharCode.Period);
      _registerLabel(KeyCode.Slash, CharCode.Slash);
      _registerLabel(KeyCode.Backquote, CharCode.BackTick);
      _registerLabel(KeyCode.BracketLeft, CharCode.OpenSquareBracket);
      _registerLabel(KeyCode.Backslash, CharCode.Backslash);
      _registerLabel(KeyCode.BracketRight, CharCode.CloseSquareBracket);
      _registerLabel(KeyCode.Quote, CharCode.SingleQuote);
    }
  }
  dumpDebugInfo() {
    const result = [];
    const immutableSamples = [
      ScanCode.ArrowUp,
      ScanCode.Numpad0
    ];
    let cnt = 0;
    result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
        if (immutableSamples.indexOf(scanCode) === -1) {
          continue;
        }
      }
      if (cnt % 6 === 0) {
        result.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI label         |        User settings       | WYSIWYG |`);
        result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
      }
      cnt++;
      const mapping = this._codeInfo[scanCode];
      const strCode = ScanCodeUtils.toString(scanCode);
      const mods = [0, 2, 5, 7];
      for (const mod of mods) {
        const ctrlKey = mod & 1 ? true : false;
        const shiftKey = mod & 2 ? true : false;
        const altKey = mod & 4 ? true : false;
        const scanCodeChord = new ScanCodeChord(ctrlKey, shiftKey, altKey, false, scanCode);
        const keyCodeChord = this._resolveChord(scanCodeChord);
        const strKeyCode = keyCodeChord ? KeyCodeUtils.toString(keyCodeChord.keyCode) : null;
        const resolvedKb = keyCodeChord ? new WindowsNativeResolvedKeybinding(this, [keyCodeChord]) : null;
        const outScanCode = `${ctrlKey ? "Ctrl+" : ""}${shiftKey ? "Shift+" : ""}${altKey ? "Alt+" : ""}${strCode}`;
        const ariaLabel = resolvedKb ? resolvedKb.getAriaLabel() : null;
        const outUILabel = ariaLabel ? ariaLabel.replace(/Control\+/, "Ctrl+") : null;
        const outUserSettings = resolvedKb ? resolvedKb.getUserSettingsLabel() : null;
        const outKey = WindowsNativeResolvedKeybinding.getProducedChar(scanCodeChord, mapping);
        const outKb = strKeyCode ? `${ctrlKey ? "Ctrl+" : ""}${shiftKey ? "Shift+" : ""}${altKey ? "Alt+" : ""}${strKeyCode}` : null;
        const isWYSIWYG = resolvedKb ? resolvedKb.isWYSIWYG() : false;
        const outWYSIWYG = isWYSIWYG ? "       " : "   NO  ";
        result.push(`| ${this._leftPad(outScanCode, 30)} | ${outKey} | ${this._leftPad(outKb, 25)} | ${this._leftPad(outUILabel, 25)} |  ${this._leftPad(outUserSettings, 25)} | ${outWYSIWYG} |`);
      }
      result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
    }
    return result.join("\n");
  }
  _leftPad(str, cnt) {
    if (str === null) {
      str = "null";
    }
    while (str.length < cnt) {
      str = " " + str;
    }
    return str;
  }
  getUILabelForKeyCode(keyCode) {
    return this._getLabelForKeyCode(keyCode);
  }
  getAriaLabelForKeyCode(keyCode) {
    return this._getLabelForKeyCode(keyCode);
  }
  getUserSettingsLabelForKeyCode(keyCode) {
    if (this._isUSStandard) {
      return KeyCodeUtils.toUserSettingsUS(keyCode);
    }
    return KeyCodeUtils.toUserSettingsGeneral(keyCode);
  }
  getElectronAcceleratorForKeyBinding(chord) {
    return KeyCodeUtils.toElectronAccelerator(chord.keyCode);
  }
  _getLabelForKeyCode(keyCode) {
    return this._keyCodeToLabel[keyCode] || KeyCodeUtils.toString(KeyCode.Unknown);
  }
  resolveKeyboardEvent(keyboardEvent) {
    const ctrlKey = keyboardEvent.ctrlKey || this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey;
    const altKey = keyboardEvent.altKey || this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey;
    const chord = new KeyCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
    return new WindowsNativeResolvedKeybinding(this, [chord]);
  }
  _resolveChord(chord) {
    if (!chord) {
      return null;
    }
    if (chord instanceof KeyCodeChord) {
      if (!this._keyCodeExists[chord.keyCode]) {
        return null;
      }
      return chord;
    }
    const keyCode = this._scanCodeToKeyCode[chord.scanCode] || KeyCode.Unknown;
    if (keyCode === KeyCode.Unknown || !this._keyCodeExists[keyCode]) {
      return null;
    }
    return new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, keyCode);
  }
  resolveKeybinding(keybinding) {
    const chords = toEmptyArrayIfContainsNull(keybinding.chords.map((chord) => this._resolveChord(chord)));
    if (chords.length > 0) {
      return [new WindowsNativeResolvedKeybinding(this, chords)];
    }
    return [];
  }
}
export {
  WindowsKeyboardMapper,
  WindowsNativeResolvedKeybinding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFxjb21tb25cXHdpbmRvd3NLZXlib2FyZE1hcHBlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5Q29kZVV0aWxzLCBJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERSwgU2NhbkNvZGUsIFNjYW5Db2RlVXRpbHMsIE5BVElWRV9XSU5ET1dTX0tFWV9DT0RFX1RPX0tFWV9DT0RFIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nLCBLZXlDb2RlQ2hvcmQsIFNpbmdsZU1vZGlmaWVyQ2hvcmQsIFNjYW5Db2RlQ2hvcmQsIEtleWJpbmRpbmcsIENob3JkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgVUlMYWJlbFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ0xhYmVscy5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkTWFwcGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvY29tbW9uL2tleWJvYXJkTWFwcGVyLmpzJztcbmltcG9ydCB7IEJhc2VSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9iYXNlUmVzb2x2ZWRLZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IHRvRW1wdHlBcnJheUlmQ29udGFpbnNOdWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBJV2luZG93c0tleWJvYXJkTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZExheW91dC5qcyc7XG5cbmNvbnN0IExPRyA9IGZhbHNlO1xuZnVuY3Rpb24gbG9nKHN0cjogc3RyaW5nKTogdm9pZCB7XG5cdGlmIChMT0cpIHtcblx0XHRjb25zb2xlLmluZm8oc3RyKTtcblx0fVxufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNjYW5Db2RlTWFwcGluZyB7XG5cdHNjYW5Db2RlOiBTY2FuQ29kZTtcblx0a2V5Q29kZTogS2V5Q29kZTtcblx0dmFsdWU6IHN0cmluZztcblx0d2l0aFNoaWZ0OiBzdHJpbmc7XG5cdHdpdGhBbHRHcjogc3RyaW5nO1xuXHR3aXRoU2hpZnRBbHRHcjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgV2luZG93c05hdGl2ZVJlc29sdmVkS2V5YmluZGluZyBleHRlbmRzIEJhc2VSZXNvbHZlZEtleWJpbmRpbmc8S2V5Q29kZUNob3JkPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWFwcGVyOiBXaW5kb3dzS2V5Ym9hcmRNYXBwZXI7XG5cblx0Y29uc3RydWN0b3IobWFwcGVyOiBXaW5kb3dzS2V5Ym9hcmRNYXBwZXIsIGNob3JkczogS2V5Q29kZUNob3JkW10pIHtcblx0XHRzdXBlcihPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgY2hvcmRzKTtcblx0XHR0aGlzLl9tYXBwZXIgPSBtYXBwZXI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldExhYmVsKGNob3JkOiBLZXlDb2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoY2hvcmQuaXNEdXBsaWNhdGVNb2RpZmllckNhc2UoKSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWFwcGVyLmdldFVJTGFiZWxGb3JLZXlDb2RlKGNob3JkLmtleUNvZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VVNMYWJlbEZvcktleWJpbmRpbmcoY2hvcmQ6IEtleUNvZGVDaG9yZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChjaG9yZC5pc0R1cGxpY2F0ZU1vZGlmaWVyQ2FzZSgpKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBLZXlDb2RlVXRpbHMudG9TdHJpbmcoY2hvcmQua2V5Q29kZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VVNMYWJlbCgpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gVUlMYWJlbFByb3ZpZGVyLnRvTGFiZWwodGhpcy5fb3MsIHRoaXMuX2Nob3JkcywgKGtleWJpbmRpbmcpID0+IHRoaXMuX2dldFVTTGFiZWxGb3JLZXliaW5kaW5nKGtleWJpbmRpbmcpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0QXJpYUxhYmVsKGNob3JkOiBLZXlDb2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoY2hvcmQuaXNEdXBsaWNhdGVNb2RpZmllckNhc2UoKSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWFwcGVyLmdldEFyaWFMYWJlbEZvcktleUNvZGUoY2hvcmQua2V5Q29kZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEVsZWN0cm9uQWNjZWxlcmF0b3IoY2hvcmQ6IEtleUNvZGVDaG9yZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9tYXBwZXIuZ2V0RWxlY3Ryb25BY2NlbGVyYXRvckZvcktleUJpbmRpbmcoY2hvcmQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRVc2VyU2V0dGluZ3NMYWJlbChjaG9yZDogS2V5Q29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGNob3JkLmlzRHVwbGljYXRlTW9kaWZpZXJDYXNlKCkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fbWFwcGVyLmdldFVzZXJTZXR0aW5nc0xhYmVsRm9yS2V5Q29kZShjaG9yZC5rZXlDb2RlKTtcblx0XHRyZXR1cm4gKHJlc3VsdCA/IHJlc3VsdC50b0xvd2VyQ2FzZSgpIDogcmVzdWx0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfaXNXWVNJV1lHKGNob3JkOiBLZXlDb2RlQ2hvcmQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fX2lzV1lTSVdZRyhjaG9yZC5rZXlDb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX19pc1dZU0lXWUcoa2V5Q29kZTogS2V5Q29kZSk6IGJvb2xlYW4ge1xuXHRcdGlmIChcblx0XHRcdGtleUNvZGUgPT09IEtleUNvZGUuTGVmdEFycm93XG5cdFx0XHR8fCBrZXlDb2RlID09PSBLZXlDb2RlLlVwQXJyb3dcblx0XHRcdHx8IGtleUNvZGUgPT09IEtleUNvZGUuUmlnaHRBcnJvd1xuXHRcdFx0fHwga2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3dcblx0XHQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBhcmlhTGFiZWwgPSB0aGlzLl9tYXBwZXIuZ2V0QXJpYUxhYmVsRm9yS2V5Q29kZShrZXlDb2RlKTtcblx0XHRjb25zdCB1c2VyU2V0dGluZ3NMYWJlbCA9IHRoaXMuX21hcHBlci5nZXRVc2VyU2V0dGluZ3NMYWJlbEZvcktleUNvZGUoa2V5Q29kZSk7XG5cdFx0cmV0dXJuIChhcmlhTGFiZWwgPT09IHVzZXJTZXR0aW5nc0xhYmVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Q2hvcmREaXNwYXRjaChjaG9yZDogS2V5Q29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGNob3JkLmlzTW9kaWZpZXJLZXkoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQgPSAnJztcblxuXHRcdGlmIChjaG9yZC5jdHJsS2V5KSB7XG5cdFx0XHRyZXN1bHQgKz0gJ2N0cmwrJztcblx0XHR9XG5cdFx0aWYgKGNob3JkLnNoaWZ0S2V5KSB7XG5cdFx0XHRyZXN1bHQgKz0gJ3NoaWZ0Kyc7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5hbHRLZXkpIHtcblx0XHRcdHJlc3VsdCArPSAnYWx0Kyc7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRyZXN1bHQgKz0gJ21ldGErJztcblx0XHR9XG5cdFx0cmVzdWx0ICs9IEtleUNvZGVVdGlscy50b1N0cmluZyhjaG9yZC5rZXlDb2RlKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFNpbmdsZU1vZGlmaWVyQ2hvcmREaXNwYXRjaChjaG9yZDogS2V5Q29kZUNob3JkKTogU2luZ2xlTW9kaWZpZXJDaG9yZCB8IG51bGwge1xuXHRcdGlmIChjaG9yZC5rZXlDb2RlID09PSBLZXlDb2RlLkN0cmwgJiYgIWNob3JkLnNoaWZ0S2V5ICYmICFjaG9yZC5hbHRLZXkgJiYgIWNob3JkLm1ldGFLZXkpIHtcblx0XHRcdHJldHVybiAnY3RybCc7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5rZXlDb2RlID09PSBLZXlDb2RlLlNoaWZ0ICYmICFjaG9yZC5jdHJsS2V5ICYmICFjaG9yZC5hbHRLZXkgJiYgIWNob3JkLm1ldGFLZXkpIHtcblx0XHRcdHJldHVybiAnc2hpZnQnO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQua2V5Q29kZSA9PT0gS2V5Q29kZS5BbHQgJiYgIWNob3JkLmN0cmxLZXkgJiYgIWNob3JkLnNoaWZ0S2V5ICYmICFjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRyZXR1cm4gJ2FsdCc7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5rZXlDb2RlID09PSBLZXlDb2RlLk1ldGEgJiYgIWNob3JkLmN0cmxLZXkgJiYgIWNob3JkLnNoaWZ0S2V5ICYmICFjaG9yZC5hbHRLZXkpIHtcblx0XHRcdHJldHVybiAnbWV0YSc7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0UHJvZHVjZWRDaGFyQ29kZShjaG9yZDogU2NhbkNvZGVDaG9yZCwgbWFwcGluZzogSVNjYW5Db2RlTWFwcGluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghbWFwcGluZykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5jdHJsS2V5ICYmIGNob3JkLnNoaWZ0S2V5ICYmIGNob3JkLmFsdEtleSkge1xuXHRcdFx0cmV0dXJuIG1hcHBpbmcud2l0aFNoaWZ0QWx0R3I7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5jdHJsS2V5ICYmIGNob3JkLmFsdEtleSkge1xuXHRcdFx0cmV0dXJuIG1hcHBpbmcud2l0aEFsdEdyO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuc2hpZnRLZXkpIHtcblx0XHRcdHJldHVybiBtYXBwaW5nLndpdGhTaGlmdDtcblx0XHR9XG5cdFx0cmV0dXJuIG1hcHBpbmcudmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldFByb2R1Y2VkQ2hhcihjaG9yZDogU2NhbkNvZGVDaG9yZCwgbWFwcGluZzogSVNjYW5Db2RlTWFwcGluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY2hhciA9IHRoaXMuZ2V0UHJvZHVjZWRDaGFyQ29kZShjaG9yZCwgbWFwcGluZyk7XG5cdFx0aWYgKGNoYXIgPT09IG51bGwgfHwgY2hhci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnIC0tLSAnO1xuXHRcdH1cblx0XHRyZXR1cm4gJyAgJyArIGNoYXIgKyAnICAnO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBXaW5kb3dzS2V5Ym9hcmRNYXBwZXIgaW1wbGVtZW50cyBJS2V5Ym9hcmRNYXBwZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvZGVJbmZvOiBJU2NhbkNvZGVNYXBwaW5nW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjYW5Db2RlVG9LZXlDb2RlOiBLZXlDb2RlW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2tleUNvZGVUb0xhYmVsOiBBcnJheTxzdHJpbmcgfCBudWxsPiA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXlDb2RlRXhpc3RzOiBib29sZWFuW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNVU1N0YW5kYXJkOiBib29sZWFuLFxuXHRcdHJhd01hcHBpbmdzOiBJV2luZG93c0tleWJvYXJkTWFwcGluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXBBbHRHclRvQ3RybEFsdDogYm9vbGVhblxuXHQpIHtcblx0XHR0aGlzLl9zY2FuQ29kZVRvS2V5Q29kZSA9IFtdO1xuXHRcdHRoaXMuX2tleUNvZGVUb0xhYmVsID0gW107XG5cdFx0dGhpcy5fa2V5Q29kZUV4aXN0cyA9IFtdO1xuXHRcdHRoaXMuX2tleUNvZGVUb0xhYmVsW0tleUNvZGUuVW5rbm93bl0gPSBLZXlDb2RlVXRpbHMudG9TdHJpbmcoS2V5Q29kZS5Vbmtub3duKTtcblxuXHRcdGZvciAobGV0IHNjYW5Db2RlID0gU2NhbkNvZGUuTm9uZTsgc2NhbkNvZGUgPCBTY2FuQ29kZS5NQVhfVkFMVUU7IHNjYW5Db2RlKyspIHtcblx0XHRcdGNvbnN0IGltbXV0YWJsZUtleUNvZGUgPSBJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtzY2FuQ29kZV07XG5cdFx0XHRpZiAoaW1tdXRhYmxlS2V5Q29kZSAhPT0gS2V5Q29kZS5EZXBlbmRzT25LYkxheW91dCkge1xuXHRcdFx0XHR0aGlzLl9zY2FuQ29kZVRvS2V5Q29kZVtzY2FuQ29kZV0gPSBpbW11dGFibGVLZXlDb2RlO1xuXHRcdFx0XHR0aGlzLl9rZXlDb2RlVG9MYWJlbFtpbW11dGFibGVLZXlDb2RlXSA9IEtleUNvZGVVdGlscy50b1N0cmluZyhpbW11dGFibGVLZXlDb2RlKTtcblx0XHRcdFx0dGhpcy5fa2V5Q29kZUV4aXN0c1tpbW11dGFibGVLZXlDb2RlXSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZHVjZXNMZXR0ZXI6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGxldCBwcm9kdWNlc0xldHRlcnMgPSBmYWxzZTtcblxuXHRcdHRoaXMuX2NvZGVJbmZvID0gW107XG5cdFx0Zm9yIChjb25zdCBzdHJDb2RlIGluIHJhd01hcHBpbmdzKSB7XG5cdFx0XHRpZiAocmF3TWFwcGluZ3MuaGFzT3duUHJvcGVydHkoc3RyQ29kZSkpIHtcblx0XHRcdFx0Y29uc3Qgc2NhbkNvZGUgPSBTY2FuQ29kZVV0aWxzLnRvRW51bShzdHJDb2RlKTtcblx0XHRcdFx0aWYgKHNjYW5Db2RlID09PSBTY2FuQ29kZS5Ob25lKSB7XG5cdFx0XHRcdFx0bG9nKGBVbmtub3duIHNjYW5Db2RlICR7c3RyQ29kZX0gaW4gbWFwcGluZy5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByYXdNYXBwaW5nID0gcmF3TWFwcGluZ3Nbc3RyQ29kZV07XG5cblx0XHRcdFx0Y29uc3QgaW1tdXRhYmxlS2V5Q29kZSA9IElNTVVUQUJMRV9DT0RFX1RPX0tFWV9DT0RFW3NjYW5Db2RlXTtcblx0XHRcdFx0aWYgKGltbXV0YWJsZUtleUNvZGUgIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdFx0XHRjb25zdCBrZXlDb2RlID0gTkFUSVZFX1dJTkRPV1NfS0VZX0NPREVfVE9fS0VZX0NPREVbcmF3TWFwcGluZy52a2V5XSB8fCBLZXlDb2RlLlVua25vd247XG5cdFx0XHRcdFx0aWYgKGtleUNvZGUgPT09IEtleUNvZGUuVW5rbm93biB8fCBpbW11dGFibGVLZXlDb2RlID09PSBrZXlDb2RlKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHNjYW5Db2RlICE9PSBTY2FuQ29kZS5OdW1wYWRDb21tYSkge1xuXHRcdFx0XHRcdFx0Ly8gTG9va3MgbGlrZSBTY2FuQ29kZS5OdW1wYWRDb21tYSBkb2Vzbid0IGFsd2F5cyBtYXAgdG8gS2V5Q29kZS5OVU1QQURfU0VQQVJBVE9SXG5cdFx0XHRcdFx0XHQvLyBlLmcuIG9uIFBPUiAtIFBUQlxuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdmFsdWUgPSByYXdNYXBwaW5nLnZhbHVlO1xuXHRcdFx0XHRjb25zdCB3aXRoU2hpZnQgPSByYXdNYXBwaW5nLndpdGhTaGlmdDtcblx0XHRcdFx0Y29uc3Qgd2l0aEFsdEdyID0gcmF3TWFwcGluZy53aXRoQWx0R3I7XG5cdFx0XHRcdGNvbnN0IHdpdGhTaGlmdEFsdEdyID0gcmF3TWFwcGluZy53aXRoU2hpZnRBbHRHcjtcblx0XHRcdFx0Y29uc3Qga2V5Q29kZSA9IE5BVElWRV9XSU5ET1dTX0tFWV9DT0RFX1RPX0tFWV9DT0RFW3Jhd01hcHBpbmcudmtleV0gfHwgS2V5Q29kZS5Vbmtub3duO1xuXG5cdFx0XHRcdGNvbnN0IG1hcHBpbmc6IElTY2FuQ29kZU1hcHBpbmcgPSB7XG5cdFx0XHRcdFx0c2NhbkNvZGU6IHNjYW5Db2RlLFxuXHRcdFx0XHRcdGtleUNvZGU6IGtleUNvZGUsXG5cdFx0XHRcdFx0dmFsdWU6IHZhbHVlLFxuXHRcdFx0XHRcdHdpdGhTaGlmdDogd2l0aFNoaWZ0LFxuXHRcdFx0XHRcdHdpdGhBbHRHcjogd2l0aEFsdEdyLFxuXHRcdFx0XHRcdHdpdGhTaGlmdEFsdEdyOiB3aXRoU2hpZnRBbHRHcixcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fY29kZUluZm9bc2NhbkNvZGVdID0gbWFwcGluZztcblx0XHRcdFx0dGhpcy5fc2NhbkNvZGVUb0tleUNvZGVbc2NhbkNvZGVdID0ga2V5Q29kZTtcblxuXHRcdFx0XHRpZiAoa2V5Q29kZSA9PT0gS2V5Q29kZS5Vbmtub3duKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fa2V5Q29kZUV4aXN0c1trZXlDb2RlXSA9IHRydWU7XG5cblx0XHRcdFx0aWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIFRoaXMga2V5IGRvZXMgbm90IHByb2R1Y2Ugc3RyaW5nc1xuXHRcdFx0XHRcdHRoaXMuX2tleUNvZGVUb0xhYmVsW2tleUNvZGVdID0gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGVsc2UgaWYgKHZhbHVlLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHQvLyBUaGlzIGtleSBwcm9kdWNlcyBhIGxldHRlciByZXByZXNlbnRhYmxlIHdpdGggbXVsdGlwbGUgVVRGLTE2IGNvZGUgdW5pdHMuXG5cdFx0XHRcdFx0dGhpcy5fa2V5Q29kZVRvTGFiZWxba2V5Q29kZV0gPSB2YWx1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXJDb2RlID0gdmFsdWUuY2hhckNvZGVBdCgwKTtcblxuXHRcdFx0XHRcdGlmIChjaGFyQ29kZSA+PSBDaGFyQ29kZS5hICYmIGNoYXJDb2RlIDw9IENoYXJDb2RlLnopIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVwcGVyQ2FzZVZhbHVlID0gQ2hhckNvZGUuQSArIChjaGFyQ29kZSAtIENoYXJDb2RlLmEpO1xuXHRcdFx0XHRcdFx0cHJvZHVjZXNMZXR0ZXJbdXBwZXJDYXNlVmFsdWVdID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHByb2R1Y2VzTGV0dGVycyA9IHRydWU7XG5cdFx0XHRcdFx0XHR0aGlzLl9rZXlDb2RlVG9MYWJlbFtrZXlDb2RlXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoQ2hhckNvZGUuQSArIChjaGFyQ29kZSAtIENoYXJDb2RlLmEpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRlbHNlIGlmIChjaGFyQ29kZSA+PSBDaGFyQ29kZS5BICYmIGNoYXJDb2RlIDw9IENoYXJDb2RlLlopIHtcblx0XHRcdFx0XHRcdHByb2R1Y2VzTGV0dGVyW2NoYXJDb2RlXSA9IHRydWU7XG5cdFx0XHRcdFx0XHRwcm9kdWNlc0xldHRlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5fa2V5Q29kZVRvTGFiZWxba2V5Q29kZV0gPSB2YWx1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2tleUNvZGVUb0xhYmVsW2tleUNvZGVdID0gdmFsdWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGtleWJvYXJkIGxheW91dHMgd2hlcmUgbGF0aW4gY2hhcmFjdGVycyBhcmUgbm90IHByb2R1Y2VkIGUuZy4gQ3lyaWxsaWNcblx0XHRjb25zdCBfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcgPSAoY2hhckNvZGU6IENoYXJDb2RlLCBrZXlDb2RlOiBLZXlDb2RlKTogdm9pZCA9PiB7XG5cdFx0XHRpZiAoIXByb2R1Y2VzTGV0dGVyW2NoYXJDb2RlXSkge1xuXHRcdFx0XHR0aGlzLl9rZXlDb2RlVG9MYWJlbFtrZXlDb2RlXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhckNvZGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkEsIEtleUNvZGUuS2V5QSk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkIsIEtleUNvZGUuS2V5Qik7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkMsIEtleUNvZGUuS2V5Qyk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkQsIEtleUNvZGUuS2V5RCk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkUsIEtleUNvZGUuS2V5RSk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkYsIEtleUNvZGUuS2V5Rik7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkcsIEtleUNvZGUuS2V5Ryk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkgsIEtleUNvZGUuS2V5SCk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkksIEtleUNvZGUuS2V5SSk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkosIEtleUNvZGUuS2V5Sik7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkssIEtleUNvZGUuS2V5Syk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkwsIEtleUNvZGUuS2V5TCk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLk0sIEtleUNvZGUuS2V5TSk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLk4sIEtleUNvZGUuS2V5Tik7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLk8sIEtleUNvZGUuS2V5Tyk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlAsIEtleUNvZGUuS2V5UCk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlEsIEtleUNvZGUuS2V5USk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlIsIEtleUNvZGUuS2V5Uik7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlMsIEtleUNvZGUuS2V5Uyk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlQsIEtleUNvZGUuS2V5VCk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlUsIEtleUNvZGUuS2V5VSk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlYsIEtleUNvZGUuS2V5Vik7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlcsIEtleUNvZGUuS2V5Vyk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlgsIEtleUNvZGUuS2V5WCk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlksIEtleUNvZGUuS2V5WSk7XG5cdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlosIEtleUNvZGUuS2V5Wik7XG5cblx0XHRpZiAoIXByb2R1Y2VzTGV0dGVycykge1xuXHRcdFx0Ly8gU2luY2UgdGhpcyBrZXlib2FyZCBsYXlvdXQgcHJvZHVjZXMgbm8gbGF0aW4gbGV0dGVycyBhdCBhbGwsIG1vc3Qgb2YgdGhlIFVJIHdpbGwgdXNlIHRoZVxuXHRcdFx0Ly8gVVMga2IgbGF5b3V0IGVxdWl2YWxlbnQgZm9yIFVJIGxhYmVscywgc28gYWxzbyB0cnkgdG8gcmVuZGVyIG90aGVyIGtleXMgd2l0aCB0aGUgVVMgbGFiZWxzXG5cdFx0XHQvLyBmb3IgY29uc2lzdGVuY3kuLi5cblx0XHRcdGNvbnN0IF9yZWdpc3RlckxhYmVsID0gKGtleUNvZGU6IEtleUNvZGUsIGNoYXJDb2RlOiBDaGFyQ29kZSk6IHZvaWQgPT4ge1xuXHRcdFx0XHQvLyBjb25zdCBleGlzdGluZ0xhYmVsID0gdGhpcy5fa2V5Q29kZVRvTGFiZWxba2V5Q29kZV07XG5cdFx0XHRcdC8vIGNvbnN0IGV4aXN0aW5nQ2hhckNvZGUgPSAoZXhpc3RpbmdMYWJlbCA/IGV4aXN0aW5nTGFiZWwuY2hhckNvZGVBdCgwKSA6IENoYXJDb2RlLk51bGwpO1xuXHRcdFx0XHQvLyBpZiAoZXhpc3RpbmdDaGFyQ29kZSA8IDMyIHx8IGV4aXN0aW5nQ2hhckNvZGUgPiAxMjYpIHtcblx0XHRcdFx0dGhpcy5fa2V5Q29kZVRvTGFiZWxba2V5Q29kZV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXJDb2RlKTtcblx0XHRcdFx0Ly8gfVxuXHRcdFx0fTtcblx0XHRcdF9yZWdpc3RlckxhYmVsKEtleUNvZGUuU2VtaWNvbG9uLCBDaGFyQ29kZS5TZW1pY29sb24pO1xuXHRcdFx0X3JlZ2lzdGVyTGFiZWwoS2V5Q29kZS5FcXVhbCwgQ2hhckNvZGUuRXF1YWxzKTtcblx0XHRcdF9yZWdpc3RlckxhYmVsKEtleUNvZGUuQ29tbWEsIENoYXJDb2RlLkNvbW1hKTtcblx0XHRcdF9yZWdpc3RlckxhYmVsKEtleUNvZGUuTWludXMsIENoYXJDb2RlLkRhc2gpO1xuXHRcdFx0X3JlZ2lzdGVyTGFiZWwoS2V5Q29kZS5QZXJpb2QsIENoYXJDb2RlLlBlcmlvZCk7XG5cdFx0XHRfcmVnaXN0ZXJMYWJlbChLZXlDb2RlLlNsYXNoLCBDaGFyQ29kZS5TbGFzaCk7XG5cdFx0XHRfcmVnaXN0ZXJMYWJlbChLZXlDb2RlLkJhY2txdW90ZSwgQ2hhckNvZGUuQmFja1RpY2spO1xuXHRcdFx0X3JlZ2lzdGVyTGFiZWwoS2V5Q29kZS5CcmFja2V0TGVmdCwgQ2hhckNvZGUuT3BlblNxdWFyZUJyYWNrZXQpO1xuXHRcdFx0X3JlZ2lzdGVyTGFiZWwoS2V5Q29kZS5CYWNrc2xhc2gsIENoYXJDb2RlLkJhY2tzbGFzaCk7XG5cdFx0XHRfcmVnaXN0ZXJMYWJlbChLZXlDb2RlLkJyYWNrZXRSaWdodCwgQ2hhckNvZGUuQ2xvc2VTcXVhcmVCcmFja2V0KTtcblx0XHRcdF9yZWdpc3RlckxhYmVsKEtleUNvZGUuUXVvdGUsIENoYXJDb2RlLlNpbmdsZVF1b3RlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZHVtcERlYnVnSW5mbygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IGltbXV0YWJsZVNhbXBsZXMgPSBbXG5cdFx0XHRTY2FuQ29kZS5BcnJvd1VwLFxuXHRcdFx0U2NhbkNvZGUuTnVtcGFkMFxuXHRcdF07XG5cblx0XHRsZXQgY250ID0gMDtcblx0XHRyZXN1bHQucHVzaChgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcblx0XHRmb3IgKGxldCBzY2FuQ29kZSA9IFNjYW5Db2RlLk5vbmU7IHNjYW5Db2RlIDwgU2NhbkNvZGUuTUFYX1ZBTFVFOyBzY2FuQ29kZSsrKSB7XG5cdFx0XHRpZiAoSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbc2NhbkNvZGVdICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRcdGlmIChpbW11dGFibGVTYW1wbGVzLmluZGV4T2Yoc2NhbkNvZGUpID09PSAtMSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjbnQgJSA2ID09PSAwKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGB8ICAgICAgIEhXIENvZGUgY29tYmluYXRpb24gICAgICB8ICBLZXkgIHwgICAgS2V5Q29kZSBjb21iaW5hdGlvbiAgICB8ICAgICAgICAgIFVJIGxhYmVsICAgICAgICAgfCAgICAgICAgVXNlciBzZXR0aW5ncyAgICAgICB8IFdZU0lXWUcgfGApO1xuXHRcdFx0XHRyZXN1bHQucHVzaChgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcblx0XHRcdH1cblx0XHRcdGNudCsrO1xuXG5cdFx0XHRjb25zdCBtYXBwaW5nID0gdGhpcy5fY29kZUluZm9bc2NhbkNvZGVdO1xuXHRcdFx0Y29uc3Qgc3RyQ29kZSA9IFNjYW5Db2RlVXRpbHMudG9TdHJpbmcoc2NhbkNvZGUpO1xuXG5cdFx0XHRjb25zdCBtb2RzID0gWzBiMDAwLCAwYjAxMCwgMGIxMDEsIDBiMTExXTtcblx0XHRcdGZvciAoY29uc3QgbW9kIG9mIG1vZHMpIHtcblx0XHRcdFx0Y29uc3QgY3RybEtleSA9IChtb2QgJiAwYjAwMSkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHNoaWZ0S2V5ID0gKG1vZCAmIDBiMDEwKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdFx0Y29uc3QgYWx0S2V5ID0gKG1vZCAmIDBiMTAwKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdFx0Y29uc3Qgc2NhbkNvZGVDaG9yZCA9IG5ldyBTY2FuQ29kZUNob3JkKGN0cmxLZXksIHNoaWZ0S2V5LCBhbHRLZXksIGZhbHNlLCBzY2FuQ29kZSk7XG5cdFx0XHRcdGNvbnN0IGtleUNvZGVDaG9yZCA9IHRoaXMuX3Jlc29sdmVDaG9yZChzY2FuQ29kZUNob3JkKTtcblx0XHRcdFx0Y29uc3Qgc3RyS2V5Q29kZSA9IChrZXlDb2RlQ2hvcmQgPyBLZXlDb2RlVXRpbHMudG9TdHJpbmcoa2V5Q29kZUNob3JkLmtleUNvZGUpIDogbnVsbCk7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkS2IgPSAoa2V5Q29kZUNob3JkID8gbmV3IFdpbmRvd3NOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmcodGhpcywgW2tleUNvZGVDaG9yZF0pIDogbnVsbCk7XG5cblx0XHRcdFx0Y29uc3Qgb3V0U2NhbkNvZGUgPSBgJHtjdHJsS2V5ID8gJ0N0cmwrJyA6ICcnfSR7c2hpZnRLZXkgPyAnU2hpZnQrJyA6ICcnfSR7YWx0S2V5ID8gJ0FsdCsnIDogJyd9JHtzdHJDb2RlfWA7XG5cdFx0XHRcdGNvbnN0IGFyaWFMYWJlbCA9IChyZXNvbHZlZEtiID8gcmVzb2x2ZWRLYi5nZXRBcmlhTGFiZWwoKSA6IG51bGwpO1xuXHRcdFx0XHRjb25zdCBvdXRVSUxhYmVsID0gKGFyaWFMYWJlbCA/IGFyaWFMYWJlbC5yZXBsYWNlKC9Db250cm9sXFwrLywgJ0N0cmwrJykgOiBudWxsKTtcblx0XHRcdFx0Y29uc3Qgb3V0VXNlclNldHRpbmdzID0gKHJlc29sdmVkS2IgPyByZXNvbHZlZEtiLmdldFVzZXJTZXR0aW5nc0xhYmVsKCkgOiBudWxsKTtcblx0XHRcdFx0Y29uc3Qgb3V0S2V5ID0gV2luZG93c05hdGl2ZVJlc29sdmVkS2V5YmluZGluZy5nZXRQcm9kdWNlZENoYXIoc2NhbkNvZGVDaG9yZCwgbWFwcGluZyk7XG5cdFx0XHRcdGNvbnN0IG91dEtiID0gKHN0cktleUNvZGUgPyBgJHtjdHJsS2V5ID8gJ0N0cmwrJyA6ICcnfSR7c2hpZnRLZXkgPyAnU2hpZnQrJyA6ICcnfSR7YWx0S2V5ID8gJ0FsdCsnIDogJyd9JHtzdHJLZXlDb2RlfWAgOiBudWxsKTtcblx0XHRcdFx0Y29uc3QgaXNXWVNJV1lHID0gKHJlc29sdmVkS2IgPyByZXNvbHZlZEtiLmlzV1lTSVdZRygpIDogZmFsc2UpO1xuXHRcdFx0XHRjb25zdCBvdXRXWVNJV1lHID0gKGlzV1lTSVdZRyA/ICcgICAgICAgJyA6ICcgICBOTyAgJyk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGB8ICR7dGhpcy5fbGVmdFBhZChvdXRTY2FuQ29kZSwgMzApfSB8ICR7b3V0S2V5fSB8ICR7dGhpcy5fbGVmdFBhZChvdXRLYiwgMjUpfSB8ICR7dGhpcy5fbGVmdFBhZChvdXRVSUxhYmVsLCAyNSl9IHwgICR7dGhpcy5fbGVmdFBhZChvdXRVc2VyU2V0dGluZ3MsIDI1KX0gfCAke291dFdZU0lXWUd9IHxgKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKGAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLWApO1xuXHRcdH1cblxuXG5cdFx0cmV0dXJuIHJlc3VsdC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgX2xlZnRQYWQoc3RyOiBzdHJpbmcgfCBudWxsLCBjbnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0aWYgKHN0ciA9PT0gbnVsbCkge1xuXHRcdFx0c3RyID0gJ251bGwnO1xuXHRcdH1cblx0XHR3aGlsZSAoc3RyLmxlbmd0aCA8IGNudCkge1xuXHRcdFx0c3RyID0gJyAnICsgc3RyO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RyO1xuXHR9XG5cblx0cHVibGljIGdldFVJTGFiZWxGb3JLZXlDb2RlKGtleUNvZGU6IEtleUNvZGUpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9nZXRMYWJlbEZvcktleUNvZGUoa2V5Q29kZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXJpYUxhYmVsRm9yS2V5Q29kZShrZXlDb2RlOiBLZXlDb2RlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0TGFiZWxGb3JLZXlDb2RlKGtleUNvZGUpO1xuXHR9XG5cblx0cHVibGljIGdldFVzZXJTZXR0aW5nc0xhYmVsRm9yS2V5Q29kZShrZXlDb2RlOiBLZXlDb2RlKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5faXNVU1N0YW5kYXJkKSB7XG5cdFx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvVXNlclNldHRpbmdzVVMoa2V5Q29kZSk7XG5cdFx0fVxuXHRcdHJldHVybiBLZXlDb2RlVXRpbHMudG9Vc2VyU2V0dGluZ3NHZW5lcmFsKGtleUNvZGUpO1xuXHR9XG5cblx0cHVibGljIGdldEVsZWN0cm9uQWNjZWxlcmF0b3JGb3JLZXlCaW5kaW5nKGNob3JkOiBLZXlDb2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvRWxlY3Ryb25BY2NlbGVyYXRvcihjaG9yZC5rZXlDb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldExhYmVsRm9yS2V5Q29kZShrZXlDb2RlOiBLZXlDb2RlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fa2V5Q29kZVRvTGFiZWxba2V5Q29kZV0gfHwgS2V5Q29kZVV0aWxzLnRvU3RyaW5nKEtleUNvZGUuVW5rbm93bik7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUtleWJvYXJkRXZlbnQoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpOiBXaW5kb3dzTmF0aXZlUmVzb2x2ZWRLZXliaW5kaW5nIHtcblx0XHRjb25zdCBjdHJsS2V5ID0ga2V5Ym9hcmRFdmVudC5jdHJsS2V5IHx8ICh0aGlzLl9tYXBBbHRHclRvQ3RybEFsdCAmJiBrZXlib2FyZEV2ZW50LmFsdEdyYXBoS2V5KTtcblx0XHRjb25zdCBhbHRLZXkgPSBrZXlib2FyZEV2ZW50LmFsdEtleSB8fCAodGhpcy5fbWFwQWx0R3JUb0N0cmxBbHQgJiYga2V5Ym9hcmRFdmVudC5hbHRHcmFwaEtleSk7XG5cdFx0Y29uc3QgY2hvcmQgPSBuZXcgS2V5Q29kZUNob3JkKGN0cmxLZXksIGtleWJvYXJkRXZlbnQuc2hpZnRLZXksIGFsdEtleSwga2V5Ym9hcmRFdmVudC5tZXRhS2V5LCBrZXlib2FyZEV2ZW50LmtleUNvZGUpO1xuXHRcdHJldHVybiBuZXcgV2luZG93c05hdGl2ZVJlc29sdmVkS2V5YmluZGluZyh0aGlzLCBbY2hvcmRdKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDaG9yZChjaG9yZDogQ2hvcmQgfCBudWxsKTogS2V5Q29kZUNob3JkIHwgbnVsbCB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChjaG9yZCBpbnN0YW5jZW9mIEtleUNvZGVDaG9yZCkge1xuXHRcdFx0aWYgKCF0aGlzLl9rZXlDb2RlRXhpc3RzW2Nob3JkLmtleUNvZGVdKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNob3JkO1xuXHRcdH1cblx0XHRjb25zdCBrZXlDb2RlID0gdGhpcy5fc2NhbkNvZGVUb0tleUNvZGVbY2hvcmQuc2NhbkNvZGVdIHx8IEtleUNvZGUuVW5rbm93bjtcblx0XHRpZiAoa2V5Q29kZSA9PT0gS2V5Q29kZS5Vbmtub3duIHx8ICF0aGlzLl9rZXlDb2RlRXhpc3RzW2tleUNvZGVdKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBLZXlDb2RlQ2hvcmQoY2hvcmQuY3RybEtleSwgY2hvcmQuc2hpZnRLZXksIGNob3JkLmFsdEtleSwgY2hvcmQubWV0YUtleSwga2V5Q29kZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZzogS2V5YmluZGluZyk6IFJlc29sdmVkS2V5YmluZGluZ1tdIHtcblx0XHRjb25zdCBjaG9yZHM6IEtleUNvZGVDaG9yZFtdID0gdG9FbXB0eUFycmF5SWZDb250YWluc051bGwoa2V5YmluZGluZy5jaG9yZHMubWFwKGNob3JkID0+IHRoaXMuX3Jlc29sdmVDaG9yZChjaG9yZCkpKTtcblx0XHRpZiAoY2hvcmRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBbbmV3IFdpbmRvd3NOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmcodGhpcywgY2hvcmRzKV07XG5cdFx0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R0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFDakQsNkJBQXlCLFNBQVMsR0FBRyxRQUFRLElBQUk7QUFFakQsUUFBSSxDQUFDLGlCQUFpQjtBQUlyQixZQUFNLGlCQUFpQixDQUFDLFNBQWtCLGFBQTZCO0FBSXRFLGFBQUssZ0JBQWdCLE9BQU8sSUFBSSxPQUFPLGFBQWEsUUFBUTtBQUFBLE1BRTdEO0FBQ0EscUJBQWUsUUFB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
