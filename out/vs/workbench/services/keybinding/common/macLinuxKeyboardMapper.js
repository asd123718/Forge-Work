import { CharCode } from "../../../../base/common/charCode.js";
import { KeyCode, KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, IMMUTABLE_KEY_CODE_TO_CODE, ScanCode, ScanCodeUtils, isModifierKey } from "../../../../base/common/keyCodes.js";
import { KeyCodeChord, ScanCodeChord } from "../../../../base/common/keybindings.js";
import { OperatingSystem } from "../../../../base/common/platform.js";
import { BaseResolvedKeybinding } from "../../../../platform/keybinding/common/baseResolvedKeybinding.js";
const CHAR_CODE_TO_KEY_CODE = [];
class NativeResolvedKeybinding extends BaseResolvedKeybinding {
  constructor(mapper, os, chords) {
    super(os, chords);
    this._mapper = mapper;
  }
  _getLabel(chord) {
    return this._mapper.getUILabelForScanCodeChord(chord);
  }
  _getAriaLabel(chord) {
    return this._mapper.getAriaLabelForScanCodeChord(chord);
  }
  _getElectronAccelerator(chord) {
    return this._mapper.getElectronAcceleratorLabelForScanCodeChord(chord);
  }
  _getUserSettingsLabel(chord) {
    return this._mapper.getUserSettingsLabelForScanCodeChord(chord);
  }
  _isWYSIWYG(binding) {
    if (!binding) {
      return true;
    }
    if (IMMUTABLE_CODE_TO_KEY_CODE[binding.scanCode] !== KeyCode.DependsOnKbLayout) {
      return true;
    }
    const a = this._mapper.getAriaLabelForScanCodeChord(binding);
    const b = this._mapper.getUserSettingsLabelForScanCodeChord(binding);
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.toLowerCase() === b.toLowerCase();
  }
  _getChordDispatch(chord) {
    return this._mapper.getDispatchStrForScanCodeChord(chord);
  }
  _getSingleModifierChordDispatch(chord) {
    if ((chord.scanCode === ScanCode.ControlLeft || chord.scanCode === ScanCode.ControlRight) && !chord.shiftKey && !chord.altKey && !chord.metaKey) {
      return "ctrl";
    }
    if ((chord.scanCode === ScanCode.AltLeft || chord.scanCode === ScanCode.AltRight) && !chord.ctrlKey && !chord.shiftKey && !chord.metaKey) {
      return "alt";
    }
    if ((chord.scanCode === ScanCode.ShiftLeft || chord.scanCode === ScanCode.ShiftRight) && !chord.ctrlKey && !chord.altKey && !chord.metaKey) {
      return "shift";
    }
    if ((chord.scanCode === ScanCode.MetaLeft || chord.scanCode === ScanCode.MetaRight) && !chord.ctrlKey && !chord.shiftKey && !chord.altKey) {
      return "meta";
    }
    return null;
  }
}
class ScanCodeCombo {
  constructor(ctrlKey, shiftKey, altKey, scanCode) {
    this.ctrlKey = ctrlKey;
    this.shiftKey = shiftKey;
    this.altKey = altKey;
    this.scanCode = scanCode;
  }
  toString() {
    return `${this.ctrlKey ? "Ctrl+" : ""}${this.shiftKey ? "Shift+" : ""}${this.altKey ? "Alt+" : ""}${ScanCodeUtils.toString(this.scanCode)}`;
  }
  equals(other) {
    return this.ctrlKey === other.ctrlKey && this.shiftKey === other.shiftKey && this.altKey === other.altKey && this.scanCode === other.scanCode;
  }
  getProducedCharCode(mapping) {
    if (!mapping) {
      return "";
    }
    if (this.ctrlKey && this.shiftKey && this.altKey) {
      return mapping.withShiftAltGr;
    }
    if (this.ctrlKey && this.altKey) {
      return mapping.withAltGr;
    }
    if (this.shiftKey) {
      return mapping.withShift;
    }
    return mapping.value;
  }
  getProducedChar(mapping) {
    const charCode = MacLinuxKeyboardMapper.getCharCode(this.getProducedCharCode(mapping));
    if (charCode === 0) {
      return " --- ";
    }
    if (charCode >= CharCode.U_Combining_Grave_Accent && charCode <= CharCode.U_Combining_Latin_Small_Letter_X) {
      return "U+" + charCode.toString(16);
    }
    return "  " + String.fromCharCode(charCode) + "  ";
  }
}
class KeyCodeCombo {
  constructor(ctrlKey, shiftKey, altKey, keyCode) {
    this.ctrlKey = ctrlKey;
    this.shiftKey = shiftKey;
    this.altKey = altKey;
    this.keyCode = keyCode;
  }
  toString() {
    return `${this.ctrlKey ? "Ctrl+" : ""}${this.shiftKey ? "Shift+" : ""}${this.altKey ? "Alt+" : ""}${KeyCodeUtils.toString(this.keyCode)}`;
  }
}
class ScanCodeKeyCodeMapper {
  constructor() {
    /**
     * ScanCode combination => KeyCode combination.
     * Only covers relevant modifiers ctrl, shift, alt (since meta does not influence the mappings).
     */
    this._scanCodeToKeyCode = [];
    /**
     * inverse of `_scanCodeToKeyCode`.
     * KeyCode combination => ScanCode combination.
     * Only covers relevant modifiers ctrl, shift, alt (since meta does not influence the mappings).
     */
    this._keyCodeToScanCode = [];
    this._scanCodeToKeyCode = [];
    this._keyCodeToScanCode = [];
  }
  registrationComplete() {
    this._moveToEnd(ScanCode.IntlHash);
    this._moveToEnd(ScanCode.IntlBackslash);
  }
  _moveToEnd(scanCode) {
    for (let mod = 0; mod < 8; mod++) {
      const encodedKeyCodeCombos = this._scanCodeToKeyCode[(scanCode << 3) + mod];
      if (!encodedKeyCodeCombos) {
        continue;
      }
      for (let i = 0, len = encodedKeyCodeCombos.length; i < len; i++) {
        const encodedScanCodeCombos = this._keyCodeToScanCode[encodedKeyCodeCombos[i]];
        if (encodedScanCodeCombos.length === 1) {
          continue;
        }
        for (let j = 0, len2 = encodedScanCodeCombos.length; j < len2; j++) {
          const entry = encodedScanCodeCombos[j];
          const entryScanCode = entry >>> 3;
          if (entryScanCode === scanCode) {
            for (let k = j + 1; k < len2; k++) {
              encodedScanCodeCombos[k - 1] = encodedScanCodeCombos[k];
            }
            encodedScanCodeCombos[len2 - 1] = entry;
          }
        }
      }
    }
  }
  registerIfUnknown(scanCodeCombo, keyCodeCombo) {
    if (keyCodeCombo.keyCode === KeyCode.Unknown) {
      return;
    }
    const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
    const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);
    const keyCodeIsDigit = keyCodeCombo.keyCode >= KeyCode.Digit0 && keyCodeCombo.keyCode <= KeyCode.Digit9;
    const keyCodeIsLetter = keyCodeCombo.keyCode >= KeyCode.KeyA && keyCodeCombo.keyCode <= KeyCode.KeyZ;
    const existingKeyCodeCombos = this._scanCodeToKeyCode[scanCodeComboEncoded];
    if (keyCodeIsDigit || keyCodeIsLetter) {
      if (existingKeyCodeCombos) {
        for (let i = 0, len = existingKeyCodeCombos.length; i < len; i++) {
          if (existingKeyCodeCombos[i] === keyCodeComboEncoded) {
            return;
          }
        }
      }
    } else {
      if (existingKeyCodeCombos && existingKeyCodeCombos.length !== 0) {
        return;
      }
    }
    this._scanCodeToKeyCode[scanCodeComboEncoded] = this._scanCodeToKeyCode[scanCodeComboEncoded] || [];
    this._scanCodeToKeyCode[scanCodeComboEncoded].unshift(keyCodeComboEncoded);
    this._keyCodeToScanCode[keyCodeComboEncoded] = this._keyCodeToScanCode[keyCodeComboEncoded] || [];
    this._keyCodeToScanCode[keyCodeComboEncoded].unshift(scanCodeComboEncoded);
  }
  lookupKeyCodeCombo(keyCodeCombo) {
    const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);
    const scanCodeCombosEncoded = this._keyCodeToScanCode[keyCodeComboEncoded];
    if (!scanCodeCombosEncoded || scanCodeCombosEncoded.length === 0) {
      return [];
    }
    const result = [];
    for (let i = 0, len = scanCodeCombosEncoded.length; i < len; i++) {
      const scanCodeComboEncoded = scanCodeCombosEncoded[i];
      const ctrlKey = scanCodeComboEncoded & 1 ? true : false;
      const shiftKey = scanCodeComboEncoded & 2 ? true : false;
      const altKey = scanCodeComboEncoded & 4 ? true : false;
      const scanCode = scanCodeComboEncoded >>> 3;
      result[i] = new ScanCodeCombo(ctrlKey, shiftKey, altKey, scanCode);
    }
    return result;
  }
  lookupScanCodeCombo(scanCodeCombo) {
    const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
    const keyCodeCombosEncoded = this._scanCodeToKeyCode[scanCodeComboEncoded];
    if (!keyCodeCombosEncoded || keyCodeCombosEncoded.length === 0) {
      return [];
    }
    const result = [];
    for (let i = 0, len = keyCodeCombosEncoded.length; i < len; i++) {
      const keyCodeComboEncoded = keyCodeCombosEncoded[i];
      const ctrlKey = keyCodeComboEncoded & 1 ? true : false;
      const shiftKey = keyCodeComboEncoded & 2 ? true : false;
      const altKey = keyCodeComboEncoded & 4 ? true : false;
      const keyCode = keyCodeComboEncoded >>> 3;
      result[i] = new KeyCodeCombo(ctrlKey, shiftKey, altKey, keyCode);
    }
    return result;
  }
  guessStableKeyCode(scanCode) {
    if (scanCode >= ScanCode.Digit1 && scanCode <= ScanCode.Digit0) {
      switch (scanCode) {
        case ScanCode.Digit1:
          return KeyCode.Digit1;
        case ScanCode.Digit2:
          return KeyCode.Digit2;
        case ScanCode.Digit3:
          return KeyCode.Digit3;
        case ScanCode.Digit4:
          return KeyCode.Digit4;
        case ScanCode.Digit5:
          return KeyCode.Digit5;
        case ScanCode.Digit6:
          return KeyCode.Digit6;
        case ScanCode.Digit7:
          return KeyCode.Digit7;
        case ScanCode.Digit8:
          return KeyCode.Digit8;
        case ScanCode.Digit9:
          return KeyCode.Digit9;
        case ScanCode.Digit0:
          return KeyCode.Digit0;
      }
    }
    const keyCodeCombos1 = this.lookupScanCodeCombo(new ScanCodeCombo(false, false, false, scanCode));
    const keyCodeCombos2 = this.lookupScanCodeCombo(new ScanCodeCombo(false, true, false, scanCode));
    if (keyCodeCombos1.length === 1 && keyCodeCombos2.length === 1) {
      const shiftKey1 = keyCodeCombos1[0].shiftKey;
      const keyCode1 = keyCodeCombos1[0].keyCode;
      const shiftKey2 = keyCodeCombos2[0].shiftKey;
      const keyCode2 = keyCodeCombos2[0].keyCode;
      if (keyCode1 === keyCode2 && shiftKey1 !== shiftKey2) {
        return keyCode1;
      }
    }
    return KeyCode.DependsOnKbLayout;
  }
  _encodeScanCodeCombo(scanCodeCombo) {
    return this._encode(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, scanCodeCombo.scanCode);
  }
  _encodeKeyCodeCombo(keyCodeCombo) {
    return this._encode(keyCodeCombo.ctrlKey, keyCodeCombo.shiftKey, keyCodeCombo.altKey, keyCodeCombo.keyCode);
  }
  _encode(ctrlKey, shiftKey, altKey, principal) {
    return ((ctrlKey ? 1 : 0) << 0 | (shiftKey ? 1 : 0) << 1 | (altKey ? 1 : 0) << 2 | principal << 3) >>> 0;
  }
}
class MacLinuxKeyboardMapper {
  constructor(_isUSStandard, rawMappings, _mapAltGrToCtrlAlt, _OS) {
    this._isUSStandard = _isUSStandard;
    this._mapAltGrToCtrlAlt = _mapAltGrToCtrlAlt;
    this._OS = _OS;
    /**
     * UI label for a ScanCode.
     */
    this._scanCodeToLabel = [];
    /**
     * Dispatching string for a ScanCode.
     */
    this._scanCodeToDispatch = [];
    this._codeInfo = [];
    this._scanCodeKeyCodeMapper = new ScanCodeKeyCodeMapper();
    this._scanCodeToLabel = [];
    this._scanCodeToDispatch = [];
    const _registerIfUnknown = (hwCtrlKey, hwShiftKey, hwAltKey, scanCode, kbCtrlKey, kbShiftKey, kbAltKey, keyCode) => {
      this._scanCodeKeyCodeMapper.registerIfUnknown(
        new ScanCodeCombo(hwCtrlKey ? true : false, hwShiftKey ? true : false, hwAltKey ? true : false, scanCode),
        new KeyCodeCombo(kbCtrlKey ? true : false, kbShiftKey ? true : false, kbAltKey ? true : false, keyCode)
      );
    };
    const _registerAllCombos = (_ctrlKey, _shiftKey, _altKey, scanCode, keyCode) => {
      for (let ctrlKey = _ctrlKey; ctrlKey <= 1; ctrlKey++) {
        for (let shiftKey = _shiftKey; shiftKey <= 1; shiftKey++) {
          for (let altKey = _altKey; altKey <= 1; altKey++) {
            _registerIfUnknown(
              ctrlKey,
              shiftKey,
              altKey,
              scanCode,
              ctrlKey,
              shiftKey,
              altKey,
              keyCode
            );
          }
        }
      }
    };
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      this._scanCodeToLabel[scanCode] = null;
    }
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      this._scanCodeToDispatch[scanCode] = null;
    }
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      const keyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
      if (keyCode !== KeyCode.DependsOnKbLayout) {
        _registerAllCombos(0, 0, 0, scanCode, keyCode);
        this._scanCodeToLabel[scanCode] = KeyCodeUtils.toString(keyCode);
        if (keyCode === KeyCode.Unknown || isModifierKey(keyCode)) {
          this._scanCodeToDispatch[scanCode] = null;
        } else {
          this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;
        }
      }
    }
    const missingLatinLettersOverride = {};
    {
      const producesLatinLetter = [];
      for (const strScanCode in rawMappings) {
        if (rawMappings.hasOwnProperty(strScanCode)) {
          const scanCode = ScanCodeUtils.toEnum(strScanCode);
          if (scanCode === ScanCode.None) {
            continue;
          }
          if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
            continue;
          }
          const rawMapping = rawMappings[strScanCode];
          const value = MacLinuxKeyboardMapper.getCharCode(rawMapping.value);
          if (value >= CharCode.a && value <= CharCode.z) {
            const upperCaseValue = CharCode.A + (value - CharCode.a);
            producesLatinLetter[upperCaseValue] = true;
          }
        }
      }
      const _registerLetterIfMissing = (charCode, scanCode, value, withShift) => {
        if (!producesLatinLetter[charCode]) {
          missingLatinLettersOverride[ScanCodeUtils.toString(scanCode)] = {
            value,
            withShift,
            withAltGr: "",
            withShiftAltGr: ""
          };
        }
      };
      _registerLetterIfMissing(CharCode.A, ScanCode.KeyA, "a", "A");
      _registerLetterIfMissing(CharCode.B, ScanCode.KeyB, "b", "B");
      _registerLetterIfMissing(CharCode.C, ScanCode.KeyC, "c", "C");
      _registerLetterIfMissing(CharCode.D, ScanCode.KeyD, "d", "D");
      _registerLetterIfMissing(CharCode.E, ScanCode.KeyE, "e", "E");
      _registerLetterIfMissing(CharCode.F, ScanCode.KeyF, "f", "F");
      _registerLetterIfMissing(CharCode.G, ScanCode.KeyG, "g", "G");
      _registerLetterIfMissing(CharCode.H, ScanCode.KeyH, "h", "H");
      _registerLetterIfMissing(CharCode.I, ScanCode.KeyI, "i", "I");
      _registerLetterIfMissing(CharCode.J, ScanCode.KeyJ, "j", "J");
      _registerLetterIfMissing(CharCode.K, ScanCode.KeyK, "k", "K");
      _registerLetterIfMissing(CharCode.L, ScanCode.KeyL, "l", "L");
      _registerLetterIfMissing(CharCode.M, ScanCode.KeyM, "m", "M");
      _registerLetterIfMissing(CharCode.N, ScanCode.KeyN, "n", "N");
      _registerLetterIfMissing(CharCode.O, ScanCode.KeyO, "o", "O");
      _registerLetterIfMissing(CharCode.P, ScanCode.KeyP, "p", "P");
      _registerLetterIfMissing(CharCode.Q, ScanCode.KeyQ, "q", "Q");
      _registerLetterIfMissing(CharCode.R, ScanCode.KeyR, "r", "R");
      _registerLetterIfMissing(CharCode.S, ScanCode.KeyS, "s", "S");
      _registerLetterIfMissing(CharCode.T, ScanCode.KeyT, "t", "T");
      _registerLetterIfMissing(CharCode.U, ScanCode.KeyU, "u", "U");
      _registerLetterIfMissing(CharCode.V, ScanCode.KeyV, "v", "V");
      _registerLetterIfMissing(CharCode.W, ScanCode.KeyW, "w", "W");
      _registerLetterIfMissing(CharCode.X, ScanCode.KeyX, "x", "X");
      _registerLetterIfMissing(CharCode.Y, ScanCode.KeyY, "y", "Y");
      _registerLetterIfMissing(CharCode.Z, ScanCode.KeyZ, "z", "Z");
    }
    const mappings = [];
    let mappingsLen = 0;
    for (const strScanCode in rawMappings) {
      if (rawMappings.hasOwnProperty(strScanCode)) {
        const scanCode = ScanCodeUtils.toEnum(strScanCode);
        if (scanCode === ScanCode.None) {
          continue;
        }
        if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
          continue;
        }
        this._codeInfo[scanCode] = rawMappings[strScanCode];
        const rawMapping = missingLatinLettersOverride[strScanCode] || rawMappings[strScanCode];
        const value = MacLinuxKeyboardMapper.getCharCode(rawMapping.value);
        const withShift = MacLinuxKeyboardMapper.getCharCode(rawMapping.withShift);
        const withAltGr = MacLinuxKeyboardMapper.getCharCode(rawMapping.withAltGr);
        const withShiftAltGr = MacLinuxKeyboardMapper.getCharCode(rawMapping.withShiftAltGr);
        const mapping = {
          scanCode,
          value,
          withShift,
          withAltGr,
          withShiftAltGr
        };
        mappings[mappingsLen++] = mapping;
        this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;
        if (value >= CharCode.a && value <= CharCode.z) {
          const upperCaseValue = CharCode.A + (value - CharCode.a);
          this._scanCodeToLabel[scanCode] = String.fromCharCode(upperCaseValue);
        } else if (value >= CharCode.A && value <= CharCode.Z) {
          this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
        } else if (value) {
          this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
        } else {
          this._scanCodeToLabel[scanCode] = null;
        }
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const mapping = mappings[i];
      const scanCode = mapping.scanCode;
      const withShiftAltGr = mapping.withShiftAltGr;
      if (withShiftAltGr === mapping.withAltGr || withShiftAltGr === mapping.withShift || withShiftAltGr === mapping.value) {
        continue;
      }
      const kb = MacLinuxKeyboardMapper._charCodeToKb(withShiftAltGr);
      if (!kb) {
        continue;
      }
      const kbShiftKey = kb.shiftKey;
      const keyCode = kb.keyCode;
      if (kbShiftKey) {
        _registerIfUnknown(1, 1, 1, scanCode, 0, 1, 0, keyCode);
      } else {
        _registerIfUnknown(1, 1, 1, scanCode, 0, 0, 0, keyCode);
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const mapping = mappings[i];
      const scanCode = mapping.scanCode;
      const withAltGr = mapping.withAltGr;
      if (withAltGr === mapping.withShift || withAltGr === mapping.value) {
        continue;
      }
      const kb = MacLinuxKeyboardMapper._charCodeToKb(withAltGr);
      if (!kb) {
        continue;
      }
      const kbShiftKey = kb.shiftKey;
      const keyCode = kb.keyCode;
      if (kbShiftKey) {
        _registerIfUnknown(1, 0, 1, scanCode, 0, 1, 0, keyCode);
      } else {
        _registerIfUnknown(1, 0, 1, scanCode, 0, 0, 0, keyCode);
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const mapping = mappings[i];
      const scanCode = mapping.scanCode;
      const withShift = mapping.withShift;
      if (withShift === mapping.value) {
        continue;
      }
      const kb = MacLinuxKeyboardMapper._charCodeToKb(withShift);
      if (!kb) {
        continue;
      }
      const kbShiftKey = kb.shiftKey;
      const keyCode = kb.keyCode;
      if (kbShiftKey) {
        _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode);
        _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode);
        _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode);
        _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode);
      } else {
        _registerIfUnknown(0, 1, 0, scanCode, 0, 0, 0, keyCode);
        _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode);
        _registerIfUnknown(0, 1, 1, scanCode, 0, 0, 1, keyCode);
        _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode);
        _registerIfUnknown(1, 1, 0, scanCode, 1, 0, 0, keyCode);
        _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode);
        _registerIfUnknown(1, 1, 1, scanCode, 1, 0, 1, keyCode);
        _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode);
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const mapping = mappings[i];
      const scanCode = mapping.scanCode;
      const kb = MacLinuxKeyboardMapper._charCodeToKb(mapping.value);
      if (!kb) {
        continue;
      }
      const kbShiftKey = kb.shiftKey;
      const keyCode = kb.keyCode;
      if (kbShiftKey) {
        _registerIfUnknown(0, 0, 0, scanCode, 0, 1, 0, keyCode);
        _registerIfUnknown(0, 0, 1, scanCode, 0, 1, 1, keyCode);
        _registerIfUnknown(1, 0, 0, scanCode, 1, 1, 0, keyCode);
        _registerIfUnknown(1, 0, 1, scanCode, 1, 1, 1, keyCode);
      } else {
        _registerIfUnknown(0, 0, 0, scanCode, 0, 0, 0, keyCode);
        _registerIfUnknown(0, 0, 1, scanCode, 0, 0, 1, keyCode);
        _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode);
        _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode);
        _registerIfUnknown(1, 0, 0, scanCode, 1, 0, 0, keyCode);
        _registerIfUnknown(1, 0, 1, scanCode, 1, 0, 1, keyCode);
        _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode);
        _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode);
      }
    }
    _registerAllCombos(0, 0, 0, ScanCode.Digit1, KeyCode.Digit1);
    _registerAllCombos(0, 0, 0, ScanCode.Digit2, KeyCode.Digit2);
    _registerAllCombos(0, 0, 0, ScanCode.Digit3, KeyCode.Digit3);
    _registerAllCombos(0, 0, 0, ScanCode.Digit4, KeyCode.Digit4);
    _registerAllCombos(0, 0, 0, ScanCode.Digit5, KeyCode.Digit5);
    _registerAllCombos(0, 0, 0, ScanCode.Digit6, KeyCode.Digit6);
    _registerAllCombos(0, 0, 0, ScanCode.Digit7, KeyCode.Digit7);
    _registerAllCombos(0, 0, 0, ScanCode.Digit8, KeyCode.Digit8);
    _registerAllCombos(0, 0, 0, ScanCode.Digit9, KeyCode.Digit9);
    _registerAllCombos(0, 0, 0, ScanCode.Digit0, KeyCode.Digit0);
    this._scanCodeKeyCodeMapper.registrationComplete();
  }
  dumpDebugInfo() {
    const result = [];
    const immutableSamples = [
      ScanCode.ArrowUp,
      ScanCode.Numpad0
    ];
    let cnt = 0;
    result.push(`isUSStandard: ${this._isUSStandard}`);
    result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
        if (immutableSamples.indexOf(scanCode) === -1) {
          continue;
        }
      }
      if (cnt % 4 === 0) {
        result.push(`|       HW Code combination      |  Key  |    KeyCode combination    | Pri |          UI label         |         User settings          |    Electron accelerator   |       Dispatching string       | WYSIWYG |`);
        result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
      }
      cnt++;
      const mapping = this._codeInfo[scanCode];
      for (let mod = 0; mod < 8; mod++) {
        const hwCtrlKey = mod & 1 ? true : false;
        const hwShiftKey = mod & 2 ? true : false;
        const hwAltKey = mod & 4 ? true : false;
        const scanCodeCombo = new ScanCodeCombo(hwCtrlKey, hwShiftKey, hwAltKey, scanCode);
        const resolvedKb = this.resolveKeyboardEvent({
          _standardKeyboardEventBrand: true,
          ctrlKey: scanCodeCombo.ctrlKey,
          shiftKey: scanCodeCombo.shiftKey,
          altKey: scanCodeCombo.altKey,
          metaKey: false,
          altGraphKey: false,
          keyCode: KeyCode.DependsOnKbLayout,
          code: ScanCodeUtils.toString(scanCode)
        });
        const outScanCodeCombo = scanCodeCombo.toString();
        const outKey = scanCodeCombo.getProducedChar(mapping);
        const ariaLabel = resolvedKb.getAriaLabel();
        const outUILabel = ariaLabel ? ariaLabel.replace(/Control\+/, "Ctrl+") : null;
        const outUserSettings = resolvedKb.getUserSettingsLabel();
        const outElectronAccelerator = resolvedKb.getElectronAccelerator();
        const outDispatchStr = resolvedKb.getDispatchChords()[0];
        const isWYSIWYG = resolvedKb ? resolvedKb.isWYSIWYG() : false;
        const outWYSIWYG = isWYSIWYG ? "       " : "   NO  ";
        const kbCombos = this._scanCodeKeyCodeMapper.lookupScanCodeCombo(scanCodeCombo);
        if (kbCombos.length === 0) {
          result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad("", 25)} | ${this._leftPad("", 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
        } else {
          for (let i = 0, len = kbCombos.length; i < len; i++) {
            const kbCombo = kbCombos[i];
            let colPriority;
            const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(kbCombo);
            if (scanCodeCombos.length === 1) {
              colPriority = "";
            } else {
              let priority = -1;
              for (let j = 0; j < scanCodeCombos.length; j++) {
                if (scanCodeCombos[j].equals(scanCodeCombo)) {
                  priority = j + 1;
                  break;
                }
              }
              colPriority = String(priority);
            }
            const outKeybinding = kbCombo.toString();
            if (i === 0) {
              result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad(outKeybinding, 25)} | ${this._leftPad(colPriority, 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
            } else {
              result.push(`| ${this._leftPad("", 30)} |       | ${this._leftPad(outKeybinding, 25)} | ${this._leftPad(colPriority, 3)} | ${this._leftPad("", 25)} | ${this._leftPad("", 30)} | ${this._leftPad("", 25)} | ${this._leftPad("", 30)} |         |`);
            }
          }
        }
      }
      result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
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
  keyCodeChordToScanCodeChord(chord) {
    if (chord.keyCode === KeyCode.Enter) {
      return [new ScanCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, ScanCode.Enter)];
    }
    const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(
      new KeyCodeCombo(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.keyCode)
    );
    const result = [];
    for (let i = 0, len = scanCodeCombos.length; i < len; i++) {
      const scanCodeCombo = scanCodeCombos[i];
      result[i] = new ScanCodeChord(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, chord.metaKey, scanCodeCombo.scanCode);
    }
    return result;
  }
  getUILabelForScanCodeChord(chord) {
    if (!chord) {
      return null;
    }
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    if (this._OS === OperatingSystem.Macintosh) {
      switch (chord.scanCode) {
        case ScanCode.ArrowLeft:
          return "\u2190";
        case ScanCode.ArrowUp:
          return "\u2191";
        case ScanCode.ArrowRight:
          return "\u2192";
        case ScanCode.ArrowDown:
          return "\u2193";
      }
    }
    return this._scanCodeToLabel[chord.scanCode];
  }
  getAriaLabelForScanCodeChord(chord) {
    if (!chord) {
      return null;
    }
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    return this._scanCodeToLabel[chord.scanCode];
  }
  getDispatchStrForScanCodeChord(chord) {
    const codeDispatch = this._scanCodeToDispatch[chord.scanCode];
    if (!codeDispatch) {
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
    result += codeDispatch;
    return result;
  }
  getUserSettingsLabelForScanCodeChord(chord) {
    if (!chord) {
      return null;
    }
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[chord.scanCode];
    if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
      return KeyCodeUtils.toUserSettingsUS(immutableKeyCode).toLowerCase();
    }
    const constantKeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(chord.scanCode);
    if (constantKeyCode !== KeyCode.DependsOnKbLayout) {
      const reverseChords = this.keyCodeChordToScanCodeChord(new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, constantKeyCode));
      for (let i = 0, len = reverseChords.length; i < len; i++) {
        const reverseChord = reverseChords[i];
        if (reverseChord.scanCode === chord.scanCode) {
          return KeyCodeUtils.toUserSettingsUS(constantKeyCode).toLowerCase();
        }
      }
    }
    return this._scanCodeToDispatch[chord.scanCode];
  }
  getElectronAcceleratorLabelForScanCodeChord(chord) {
    if (!chord) {
      return null;
    }
    const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[chord.scanCode];
    if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
      return KeyCodeUtils.toElectronAccelerator(immutableKeyCode);
    }
    const constantKeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(chord.scanCode);
    if (this._OS === OperatingSystem.Linux && !this._isUSStandard) {
      const isOEMKey = constantKeyCode === KeyCode.Semicolon || constantKeyCode === KeyCode.Equal || constantKeyCode === KeyCode.Comma || constantKeyCode === KeyCode.Minus || constantKeyCode === KeyCode.Period || constantKeyCode === KeyCode.Slash || constantKeyCode === KeyCode.Backquote || constantKeyCode === KeyCode.BracketLeft || constantKeyCode === KeyCode.Backslash || constantKeyCode === KeyCode.BracketRight;
      if (isOEMKey) {
        return null;
      }
    }
    if (constantKeyCode !== KeyCode.DependsOnKbLayout) {
      return KeyCodeUtils.toElectronAccelerator(constantKeyCode);
    }
    return null;
  }
  _toResolvedKeybinding(chordParts) {
    if (chordParts.length === 0) {
      return [];
    }
    const result = [];
    this._generateResolvedKeybindings(chordParts, 0, [], result);
    return result;
  }
  _generateResolvedKeybindings(chordParts, currentIndex, previousParts, result) {
    const chordPart = chordParts[currentIndex];
    const isFinalIndex = currentIndex === chordParts.length - 1;
    for (let i = 0, len = chordPart.length; i < len; i++) {
      const chords = [...previousParts, chordPart[i]];
      if (isFinalIndex) {
        result.push(new NativeResolvedKeybinding(this, this._OS, chords));
      } else {
        this._generateResolvedKeybindings(chordParts, currentIndex + 1, chords, result);
      }
    }
  }
  resolveKeyboardEvent(keyboardEvent) {
    let code = ScanCodeUtils.toEnum(keyboardEvent.code);
    if (code === ScanCode.NumpadEnter) {
      code = ScanCode.Enter;
    }
    const keyCode = keyboardEvent.keyCode;
    if (keyCode === KeyCode.LeftArrow || keyCode === KeyCode.UpArrow || keyCode === KeyCode.RightArrow || keyCode === KeyCode.DownArrow || keyCode === KeyCode.Delete || keyCode === KeyCode.Insert || keyCode === KeyCode.Home || keyCode === KeyCode.End || keyCode === KeyCode.PageDown || keyCode === KeyCode.PageUp || keyCode === KeyCode.Backspace) {
      const immutableScanCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
      if (immutableScanCode !== ScanCode.DependsOnKbLayout) {
        code = immutableScanCode;
      }
    } else {
      if (code === ScanCode.Numpad1 || code === ScanCode.Numpad2 || code === ScanCode.Numpad3 || code === ScanCode.Numpad4 || code === ScanCode.Numpad5 || code === ScanCode.Numpad6 || code === ScanCode.Numpad7 || code === ScanCode.Numpad8 || code === ScanCode.Numpad9 || code === ScanCode.Numpad0 || code === ScanCode.NumpadDecimal) {
        if (keyCode >= 0) {
          const immutableScanCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
          if (immutableScanCode !== ScanCode.DependsOnKbLayout) {
            code = immutableScanCode;
          }
        }
      }
    }
    const ctrlKey = keyboardEvent.ctrlKey || this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey;
    const altKey = keyboardEvent.altKey || this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey;
    const chord = new ScanCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, code);
    return new NativeResolvedKeybinding(this, this._OS, [chord]);
  }
  _resolveChord(chord) {
    if (!chord) {
      return [];
    }
    if (chord instanceof ScanCodeChord) {
      return [chord];
    }
    return this.keyCodeChordToScanCodeChord(chord);
  }
  resolveKeybinding(keybinding) {
    const chords = keybinding.chords.map((chord) => this._resolveChord(chord));
    return this._toResolvedKeybinding(chords);
  }
  static _redirectCharCode(charCode) {
    switch (charCode) {
      // allow-any-unicode-next-line
      // CJK: 。 「 」 【 】 ； ，
      // map: . [ ] [ ] ; ,
      case CharCode.U_IDEOGRAPHIC_FULL_STOP:
        return CharCode.Period;
      case CharCode.U_LEFT_CORNER_BRACKET:
        return CharCode.OpenSquareBracket;
      case CharCode.U_RIGHT_CORNER_BRACKET:
        return CharCode.CloseSquareBracket;
      case CharCode.U_LEFT_BLACK_LENTICULAR_BRACKET:
        return CharCode.OpenSquareBracket;
      case CharCode.U_RIGHT_BLACK_LENTICULAR_BRACKET:
        return CharCode.CloseSquareBracket;
      case CharCode.U_FULLWIDTH_SEMICOLON:
        return CharCode.Semicolon;
      case CharCode.U_FULLWIDTH_COMMA:
        return CharCode.Comma;
    }
    return charCode;
  }
  static _charCodeToKb(charCode) {
    charCode = this._redirectCharCode(charCode);
    if (charCode < CHAR_CODE_TO_KEY_CODE.length) {
      return CHAR_CODE_TO_KEY_CODE[charCode];
    }
    return null;
  }
  /**
   * Attempt to map a combining character to a regular one that renders the same way.
   *
   * https://www.compart.com/en/unicode/bidiclass/NSM
   */
  static getCharCode(char) {
    if (char.length === 0) {
      return 0;
    }
    const charCode = char.charCodeAt(0);
    switch (charCode) {
      case CharCode.U_Combining_Grave_Accent:
        return CharCode.U_GRAVE_ACCENT;
      case CharCode.U_Combining_Acute_Accent:
        return CharCode.U_ACUTE_ACCENT;
      case CharCode.U_Combining_Circumflex_Accent:
        return CharCode.U_CIRCUMFLEX;
      case CharCode.U_Combining_Tilde:
        return CharCode.U_SMALL_TILDE;
      case CharCode.U_Combining_Macron:
        return CharCode.U_MACRON;
      case CharCode.U_Combining_Overline:
        return CharCode.U_OVERLINE;
      case CharCode.U_Combining_Breve:
        return CharCode.U_BREVE;
      case CharCode.U_Combining_Dot_Above:
        return CharCode.U_DOT_ABOVE;
      case CharCode.U_Combining_Diaeresis:
        return CharCode.U_DIAERESIS;
      case CharCode.U_Combining_Ring_Above:
        return CharCode.U_RING_ABOVE;
      case CharCode.U_Combining_Double_Acute_Accent:
        return CharCode.U_DOUBLE_ACUTE_ACCENT;
    }
    return charCode;
  }
}
(function() {
  function define(charCode, keyCode, shiftKey) {
    for (let i = CHAR_CODE_TO_KEY_CODE.length; i < charCode; i++) {
      CHAR_CODE_TO_KEY_CODE[i] = null;
    }
    CHAR_CODE_TO_KEY_CODE[charCode] = { keyCode, shiftKey };
  }
  for (let chCode = CharCode.A; chCode <= CharCode.Z; chCode++) {
    define(chCode, KeyCode.KeyA + (chCode - CharCode.A), true);
  }
  for (let chCode = CharCode.a; chCode <= CharCode.z; chCode++) {
    define(chCode, KeyCode.KeyA + (chCode - CharCode.a), false);
  }
  define(CharCode.Semicolon, KeyCode.Semicolon, false);
  define(CharCode.Colon, KeyCode.Semicolon, true);
  define(CharCode.Equals, KeyCode.Equal, false);
  define(CharCode.Plus, KeyCode.Equal, true);
  define(CharCode.Comma, KeyCode.Comma, false);
  define(CharCode.LessThan, KeyCode.Comma, true);
  define(CharCode.Dash, KeyCode.Minus, false);
  define(CharCode.Underline, KeyCode.Minus, true);
  define(CharCode.Period, KeyCode.Period, false);
  define(CharCode.GreaterThan, KeyCode.Period, true);
  define(CharCode.Slash, KeyCode.Slash, false);
  define(CharCode.QuestionMark, KeyCode.Slash, true);
  define(CharCode.BackTick, KeyCode.Backquote, false);
  define(CharCode.Tilde, KeyCode.Backquote, true);
  define(CharCode.OpenSquareBracket, KeyCode.BracketLeft, false);
  define(CharCode.OpenCurlyBrace, KeyCode.BracketLeft, true);
  define(CharCode.Backslash, KeyCode.Backslash, false);
  define(CharCode.Pipe, KeyCode.Backslash, true);
  define(CharCode.CloseSquareBracket, KeyCode.BracketRight, false);
  define(CharCode.CloseCurlyBrace, KeyCode.BracketRight, true);
  define(CharCode.SingleQuote, KeyCode.Quote, false);
  define(CharCode.DoubleQuote, KeyCode.Quote, true);
})();
export {
  MacLinuxKeyboardMapper,
  NativeResolvedKeybinding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFxjb21tb25cXG1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleUNvZGVVdGlscywgSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREUsIElNTVVUQUJMRV9LRVlfQ09ERV9UT19DT0RFLCBTY2FuQ29kZSwgU2NhbkNvZGVVdGlscywgaXNNb2RpZmllcktleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZywgS2V5Q29kZUNob3JkLCBTaW5nbGVNb2RpZmllckNob3JkLCBTY2FuQ29kZUNob3JkLCBLZXliaW5kaW5nLCBDaG9yZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRNYXBwZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXlib2FyZExheW91dC9jb21tb24va2V5Ym9hcmRNYXBwZXIuanMnO1xuaW1wb3J0IHsgQmFzZVJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2Jhc2VSZXNvbHZlZEtleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU1hY0xpbnV4S2V5Ym9hcmRNYXBwaW5nLCBJTWFjTGludXhLZXlNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvY29tbW9uL2tleWJvYXJkTGF5b3V0LmpzJztcblxuLyoqXG4gKiBBIG1hcCBmcm9tIGNoYXJhY3RlciB0byBrZXkgY29kZXMuXG4gKiBlLmcuIENvbnRhaW5zIGVudHJpZXMgc3VjaCBhczpcbiAqICAtICcvJyA9PiB7IGtleUNvZGU6IEtleUNvZGUuVVNfU0xBU0gsIHNoaWZ0S2V5OiBmYWxzZSB9XG4gKiAgLSAnPycgPT4geyBrZXlDb2RlOiBLZXlDb2RlLlVTX1NMQVNILCBzaGlmdEtleTogdHJ1ZSB9XG4gKi9cbmNvbnN0IENIQVJfQ09ERV9UT19LRVlfQ09ERTogKHsga2V5Q29kZTogS2V5Q29kZTsgc2hpZnRLZXk6IGJvb2xlYW4gfSB8IG51bGwpW10gPSBbXTtcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZVJlc29sdmVkS2V5YmluZGluZyBleHRlbmRzIEJhc2VSZXNvbHZlZEtleWJpbmRpbmc8U2NhbkNvZGVDaG9yZD4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcHBlcjogTWFjTGludXhLZXlib2FyZE1hcHBlcjtcblxuXHRjb25zdHJ1Y3RvcihtYXBwZXI6IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIsIG9zOiBPcGVyYXRpbmdTeXN0ZW0sIGNob3JkczogU2NhbkNvZGVDaG9yZFtdKSB7XG5cdFx0c3VwZXIob3MsIGNob3Jkcyk7XG5cdFx0dGhpcy5fbWFwcGVyID0gbWFwcGVyO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRMYWJlbChjaG9yZDogU2NhbkNvZGVDaG9yZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9tYXBwZXIuZ2V0VUlMYWJlbEZvclNjYW5Db2RlQ2hvcmQoY2hvcmQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBcmlhTGFiZWwoY2hvcmQ6IFNjYW5Db2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbWFwcGVyLmdldEFyaWFMYWJlbEZvclNjYW5Db2RlQ2hvcmQoY2hvcmQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRFbGVjdHJvbkFjY2VsZXJhdG9yKGNob3JkOiBTY2FuQ29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcHBlci5nZXRFbGVjdHJvbkFjY2VsZXJhdG9yTGFiZWxGb3JTY2FuQ29kZUNob3JkKGNob3JkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0VXNlclNldHRpbmdzTGFiZWwoY2hvcmQ6IFNjYW5Db2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbWFwcGVyLmdldFVzZXJTZXR0aW5nc0xhYmVsRm9yU2NhbkNvZGVDaG9yZChjaG9yZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2lzV1lTSVdZRyhiaW5kaW5nOiBTY2FuQ29kZUNob3JkIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdGlmICghYmluZGluZykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtiaW5kaW5nLnNjYW5Db2RlXSAhPT0gS2V5Q29kZS5EZXBlbmRzT25LYkxheW91dCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGEgPSB0aGlzLl9tYXBwZXIuZ2V0QXJpYUxhYmVsRm9yU2NhbkNvZGVDaG9yZChiaW5kaW5nKTtcblx0XHRjb25zdCBiID0gdGhpcy5fbWFwcGVyLmdldFVzZXJTZXR0aW5nc0xhYmVsRm9yU2NhbkNvZGVDaG9yZChiaW5kaW5nKTtcblxuXHRcdGlmICghYSAmJiAhYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKGEudG9Mb3dlckNhc2UoKSA9PT0gYi50b0xvd2VyQ2FzZSgpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Q2hvcmREaXNwYXRjaChjaG9yZDogU2NhbkNvZGVDaG9yZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9tYXBwZXIuZ2V0RGlzcGF0Y2hTdHJGb3JTY2FuQ29kZUNob3JkKGNob3JkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0U2luZ2xlTW9kaWZpZXJDaG9yZERpc3BhdGNoKGNob3JkOiBTY2FuQ29kZUNob3JkKTogU2luZ2xlTW9kaWZpZXJDaG9yZCB8IG51bGwge1xuXHRcdGlmICgoY2hvcmQuc2NhbkNvZGUgPT09IFNjYW5Db2RlLkNvbnRyb2xMZWZ0IHx8IGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5Db250cm9sUmlnaHQpICYmICFjaG9yZC5zaGlmdEtleSAmJiAhY2hvcmQuYWx0S2V5ICYmICFjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRyZXR1cm4gJ2N0cmwnO1xuXHRcdH1cblx0XHRpZiAoKGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5BbHRMZWZ0IHx8IGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5BbHRSaWdodCkgJiYgIWNob3JkLmN0cmxLZXkgJiYgIWNob3JkLnNoaWZ0S2V5ICYmICFjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRyZXR1cm4gJ2FsdCc7XG5cdFx0fVxuXHRcdGlmICgoY2hvcmQuc2NhbkNvZGUgPT09IFNjYW5Db2RlLlNoaWZ0TGVmdCB8fCBjaG9yZC5zY2FuQ29kZSA9PT0gU2NhbkNvZGUuU2hpZnRSaWdodCkgJiYgIWNob3JkLmN0cmxLZXkgJiYgIWNob3JkLmFsdEtleSAmJiAhY2hvcmQubWV0YUtleSkge1xuXHRcdFx0cmV0dXJuICdzaGlmdCc7XG5cdFx0fVxuXHRcdGlmICgoY2hvcmQuc2NhbkNvZGUgPT09IFNjYW5Db2RlLk1ldGFMZWZ0IHx8IGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5NZXRhUmlnaHQpICYmICFjaG9yZC5jdHJsS2V5ICYmICFjaG9yZC5zaGlmdEtleSAmJiAhY2hvcmQuYWx0S2V5KSB7XG5cdFx0XHRyZXR1cm4gJ21ldGEnO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVNjYW5Db2RlTWFwcGluZyB7XG5cdHNjYW5Db2RlOiBTY2FuQ29kZTtcblx0dmFsdWU6IG51bWJlcjtcblx0d2l0aFNoaWZ0OiBudW1iZXI7XG5cdHdpdGhBbHRHcjogbnVtYmVyO1xuXHR3aXRoU2hpZnRBbHRHcjogbnVtYmVyO1xufVxuXG5jbGFzcyBTY2FuQ29kZUNvbWJvIHtcblx0cHVibGljIHJlYWRvbmx5IGN0cmxLZXk6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBzaGlmdEtleTogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGFsdEtleTogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IHNjYW5Db2RlOiBTY2FuQ29kZTtcblxuXHRjb25zdHJ1Y3RvcihjdHJsS2V5OiBib29sZWFuLCBzaGlmdEtleTogYm9vbGVhbiwgYWx0S2V5OiBib29sZWFuLCBzY2FuQ29kZTogU2NhbkNvZGUpIHtcblx0XHR0aGlzLmN0cmxLZXkgPSBjdHJsS2V5O1xuXHRcdHRoaXMuc2hpZnRLZXkgPSBzaGlmdEtleTtcblx0XHR0aGlzLmFsdEtleSA9IGFsdEtleTtcblx0XHR0aGlzLnNjYW5Db2RlID0gc2NhbkNvZGU7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5jdHJsS2V5ID8gJ0N0cmwrJyA6ICcnfSR7dGhpcy5zaGlmdEtleSA/ICdTaGlmdCsnIDogJyd9JHt0aGlzLmFsdEtleSA/ICdBbHQrJyA6ICcnfSR7U2NhbkNvZGVVdGlscy50b1N0cmluZyh0aGlzLnNjYW5Db2RlKX1gO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogU2NhbkNvZGVDb21ibyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLmN0cmxLZXkgPT09IG90aGVyLmN0cmxLZXlcblx0XHRcdCYmIHRoaXMuc2hpZnRLZXkgPT09IG90aGVyLnNoaWZ0S2V5XG5cdFx0XHQmJiB0aGlzLmFsdEtleSA9PT0gb3RoZXIuYWx0S2V5XG5cdFx0XHQmJiB0aGlzLnNjYW5Db2RlID09PSBvdGhlci5zY2FuQ29kZVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFByb2R1Y2VkQ2hhckNvZGUobWFwcGluZzogSU1hY0xpbnV4S2V5TWFwcGluZyk6IHN0cmluZyB7XG5cdFx0aWYgKCFtYXBwaW5nKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmN0cmxLZXkgJiYgdGhpcy5zaGlmdEtleSAmJiB0aGlzLmFsdEtleSkge1xuXHRcdFx0cmV0dXJuIG1hcHBpbmcud2l0aFNoaWZ0QWx0R3I7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmN0cmxLZXkgJiYgdGhpcy5hbHRLZXkpIHtcblx0XHRcdHJldHVybiBtYXBwaW5nLndpdGhBbHRHcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc2hpZnRLZXkpIHtcblx0XHRcdHJldHVybiBtYXBwaW5nLndpdGhTaGlmdDtcblx0XHR9XG5cdFx0cmV0dXJuIG1hcHBpbmcudmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJvZHVjZWRDaGFyKG1hcHBpbmc6IElNYWNMaW51eEtleU1hcHBpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNoYXJDb2RlID0gTWFjTGludXhLZXlib2FyZE1hcHBlci5nZXRDaGFyQ29kZSh0aGlzLmdldFByb2R1Y2VkQ2hhckNvZGUobWFwcGluZykpO1xuXHRcdGlmIChjaGFyQ29kZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICcgLS0tICc7XG5cdFx0fVxuXHRcdGlmIChjaGFyQ29kZSA+PSBDaGFyQ29kZS5VX0NvbWJpbmluZ19HcmF2ZV9BY2NlbnQgJiYgY2hhckNvZGUgPD0gQ2hhckNvZGUuVV9Db21iaW5pbmdfTGF0aW5fU21hbGxfTGV0dGVyX1gpIHtcblx0XHRcdC8vIGNvbWJpbmluZ1xuXHRcdFx0cmV0dXJuICdVKycgKyBjaGFyQ29kZS50b1N0cmluZygxNik7XG5cdFx0fVxuXHRcdHJldHVybiAnICAnICsgU3RyaW5nLmZyb21DaGFyQ29kZShjaGFyQ29kZSkgKyAnICAnO1xuXHR9XG59XG5cbmNsYXNzIEtleUNvZGVDb21ibyB7XG5cdHB1YmxpYyByZWFkb25seSBjdHJsS2V5OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hpZnRLZXk6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBhbHRLZXk6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBrZXlDb2RlOiBLZXlDb2RlO1xuXG5cdGNvbnN0cnVjdG9yKGN0cmxLZXk6IGJvb2xlYW4sIHNoaWZ0S2V5OiBib29sZWFuLCBhbHRLZXk6IGJvb2xlYW4sIGtleUNvZGU6IEtleUNvZGUpIHtcblx0XHR0aGlzLmN0cmxLZXkgPSBjdHJsS2V5O1xuXHRcdHRoaXMuc2hpZnRLZXkgPSBzaGlmdEtleTtcblx0XHR0aGlzLmFsdEtleSA9IGFsdEtleTtcblx0XHR0aGlzLmtleUNvZGUgPSBrZXlDb2RlO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuY3RybEtleSA/ICdDdHJsKycgOiAnJ30ke3RoaXMuc2hpZnRLZXkgPyAnU2hpZnQrJyA6ICcnfSR7dGhpcy5hbHRLZXkgPyAnQWx0KycgOiAnJ30ke0tleUNvZGVVdGlscy50b1N0cmluZyh0aGlzLmtleUNvZGUpfWA7XG5cdH1cbn1cblxuY2xhc3MgU2NhbkNvZGVLZXlDb2RlTWFwcGVyIHtcblxuXHQvKipcblx0ICogU2NhbkNvZGUgY29tYmluYXRpb24gPT4gS2V5Q29kZSBjb21iaW5hdGlvbi5cblx0ICogT25seSBjb3ZlcnMgcmVsZXZhbnQgbW9kaWZpZXJzIGN0cmwsIHNoaWZ0LCBhbHQgKHNpbmNlIG1ldGEgZG9lcyBub3QgaW5mbHVlbmNlIHRoZSBtYXBwaW5ncykuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2FuQ29kZVRvS2V5Q29kZTogbnVtYmVyW11bXSA9IFtdO1xuXHQvKipcblx0ICogaW52ZXJzZSBvZiBgX3NjYW5Db2RlVG9LZXlDb2RlYC5cblx0ICogS2V5Q29kZSBjb21iaW5hdGlvbiA9PiBTY2FuQ29kZSBjb21iaW5hdGlvbi5cblx0ICogT25seSBjb3ZlcnMgcmVsZXZhbnQgbW9kaWZpZXJzIGN0cmwsIHNoaWZ0LCBhbHQgKHNpbmNlIG1ldGEgZG9lcyBub3QgaW5mbHVlbmNlIHRoZSBtYXBwaW5ncykuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXlDb2RlVG9TY2FuQ29kZTogbnVtYmVyW11bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX3NjYW5Db2RlVG9LZXlDb2RlID0gW107XG5cdFx0dGhpcy5fa2V5Q29kZVRvU2NhbkNvZGUgPSBbXTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RyYXRpb25Db21wbGV0ZSgpOiB2b2lkIHtcblx0XHQvLyBJbnRsSGFzaCBhbmQgSW50bEJhY2tzbGFzaCBhcmUgcmFyZSBrZXlzLCBzbyBlbnN1cmUgdGhleSBkb24ndCBlbmQgdXAgYmVpbmcgdGhlIHByZWZlcnJlZC4uLlxuXHRcdHRoaXMuX21vdmVUb0VuZChTY2FuQ29kZS5JbnRsSGFzaCk7XG5cdFx0dGhpcy5fbW92ZVRvRW5kKFNjYW5Db2RlLkludGxCYWNrc2xhc2gpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbW92ZVRvRW5kKHNjYW5Db2RlOiBTY2FuQ29kZSk6IHZvaWQge1xuXHRcdGZvciAobGV0IG1vZCA9IDA7IG1vZCA8IDg7IG1vZCsrKSB7XG5cdFx0XHRjb25zdCBlbmNvZGVkS2V5Q29kZUNvbWJvcyA9IHRoaXMuX3NjYW5Db2RlVG9LZXlDb2RlWyhzY2FuQ29kZSA8PCAzKSArIG1vZF07XG5cdFx0XHRpZiAoIWVuY29kZWRLZXlDb2RlQ29tYm9zKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGVuY29kZWRLZXlDb2RlQ29tYm9zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGVuY29kZWRTY2FuQ29kZUNvbWJvcyA9IHRoaXMuX2tleUNvZGVUb1NjYW5Db2RlW2VuY29kZWRLZXlDb2RlQ29tYm9zW2ldXTtcblx0XHRcdFx0aWYgKGVuY29kZWRTY2FuQ29kZUNvbWJvcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGxldCBqID0gMCwgbGVuID0gZW5jb2RlZFNjYW5Db2RlQ29tYm9zLmxlbmd0aDsgaiA8IGxlbjsgaisrKSB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBlbmNvZGVkU2NhbkNvZGVDb21ib3Nbal07XG5cdFx0XHRcdFx0Y29uc3QgZW50cnlTY2FuQ29kZSA9IChlbnRyeSA+Pj4gMyk7XG5cdFx0XHRcdFx0aWYgKGVudHJ5U2NhbkNvZGUgPT09IHNjYW5Db2RlKSB7XG5cdFx0XHRcdFx0XHQvLyBNb3ZlIHRoaXMgZW50cnkgdG8gdGhlIGVuZFxuXHRcdFx0XHRcdFx0Zm9yIChsZXQgayA9IGogKyAxOyBrIDwgbGVuOyBrKyspIHtcblx0XHRcdFx0XHRcdFx0ZW5jb2RlZFNjYW5Db2RlQ29tYm9zW2sgLSAxXSA9IGVuY29kZWRTY2FuQ29kZUNvbWJvc1trXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVuY29kZWRTY2FuQ29kZUNvbWJvc1tsZW4gLSAxXSA9IGVudHJ5O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlcklmVW5rbm93bihzY2FuQ29kZUNvbWJvOiBTY2FuQ29kZUNvbWJvLCBrZXlDb2RlQ29tYm86IEtleUNvZGVDb21ibyk6IHZvaWQge1xuXHRcdGlmIChrZXlDb2RlQ29tYm8ua2V5Q29kZSA9PT0gS2V5Q29kZS5Vbmtub3duKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNjYW5Db2RlQ29tYm9FbmNvZGVkID0gdGhpcy5fZW5jb2RlU2NhbkNvZGVDb21ibyhzY2FuQ29kZUNvbWJvKTtcblx0XHRjb25zdCBrZXlDb2RlQ29tYm9FbmNvZGVkID0gdGhpcy5fZW5jb2RlS2V5Q29kZUNvbWJvKGtleUNvZGVDb21ibyk7XG5cblx0XHRjb25zdCBrZXlDb2RlSXNEaWdpdCA9IChrZXlDb2RlQ29tYm8ua2V5Q29kZSA+PSBLZXlDb2RlLkRpZ2l0MCAmJiBrZXlDb2RlQ29tYm8ua2V5Q29kZSA8PSBLZXlDb2RlLkRpZ2l0OSk7XG5cdFx0Y29uc3Qga2V5Q29kZUlzTGV0dGVyID0gKGtleUNvZGVDb21iby5rZXlDb2RlID49IEtleUNvZGUuS2V5QSAmJiBrZXlDb2RlQ29tYm8ua2V5Q29kZSA8PSBLZXlDb2RlLktleVopO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmdLZXlDb2RlQ29tYm9zID0gdGhpcy5fc2NhbkNvZGVUb0tleUNvZGVbc2NhbkNvZGVDb21ib0VuY29kZWRdO1xuXG5cdFx0Ly8gQWxsb3cgYSBzY2FuIGNvZGUgdG8gbWFwIHRvIG11bHRpcGxlIGtleSBjb2RlcyBpZiBpdCBpcyBhIGRpZ2l0IG9yIGEgbGV0dGVyIGtleSBjb2RlXG5cdFx0aWYgKGtleUNvZGVJc0RpZ2l0IHx8IGtleUNvZGVJc0xldHRlcikge1xuXHRcdFx0Ly8gT25seSBjaGVjayB0aGF0IHdlIGRvbid0IGluc2VydCB0aGUgc2FtZSBlbnRyeSB0d2ljZVxuXHRcdFx0aWYgKGV4aXN0aW5nS2V5Q29kZUNvbWJvcykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZXhpc3RpbmdLZXlDb2RlQ29tYm9zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nS2V5Q29kZUNvbWJvc1tpXSA9PT0ga2V5Q29kZUNvbWJvRW5jb2RlZCkge1xuXHRcdFx0XHRcdFx0Ly8gYXZvaWQgZHVwbGljYXRlc1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBEb24ndCBhbGxvdyBtdWx0aXBsZXNcblx0XHRcdGlmIChleGlzdGluZ0tleUNvZGVDb21ib3MgJiYgZXhpc3RpbmdLZXlDb2RlQ29tYm9zLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2NhbkNvZGVUb0tleUNvZGVbc2NhbkNvZGVDb21ib0VuY29kZWRdID0gdGhpcy5fc2NhbkNvZGVUb0tleUNvZGVbc2NhbkNvZGVDb21ib0VuY29kZWRdIHx8IFtdO1xuXHRcdHRoaXMuX3NjYW5Db2RlVG9LZXlDb2RlW3NjYW5Db2RlQ29tYm9FbmNvZGVkXS51bnNoaWZ0KGtleUNvZGVDb21ib0VuY29kZWQpO1xuXG5cdFx0dGhpcy5fa2V5Q29kZVRvU2NhbkNvZGVba2V5Q29kZUNvbWJvRW5jb2RlZF0gPSB0aGlzLl9rZXlDb2RlVG9TY2FuQ29kZVtrZXlDb2RlQ29tYm9FbmNvZGVkXSB8fCBbXTtcblx0XHR0aGlzLl9rZXlDb2RlVG9TY2FuQ29kZVtrZXlDb2RlQ29tYm9FbmNvZGVkXS51bnNoaWZ0KHNjYW5Db2RlQ29tYm9FbmNvZGVkKTtcblx0fVxuXG5cdHB1YmxpYyBsb29rdXBLZXlDb2RlQ29tYm8oa2V5Q29kZUNvbWJvOiBLZXlDb2RlQ29tYm8pOiBTY2FuQ29kZUNvbWJvW10ge1xuXHRcdGNvbnN0IGtleUNvZGVDb21ib0VuY29kZWQgPSB0aGlzLl9lbmNvZGVLZXlDb2RlQ29tYm8oa2V5Q29kZUNvbWJvKTtcblx0XHRjb25zdCBzY2FuQ29kZUNvbWJvc0VuY29kZWQgPSB0aGlzLl9rZXlDb2RlVG9TY2FuQ29kZVtrZXlDb2RlQ29tYm9FbmNvZGVkXTtcblx0XHRpZiAoIXNjYW5Db2RlQ29tYm9zRW5jb2RlZCB8fCBzY2FuQ29kZUNvbWJvc0VuY29kZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBTY2FuQ29kZUNvbWJvW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2NhbkNvZGVDb21ib3NFbmNvZGVkLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzY2FuQ29kZUNvbWJvRW5jb2RlZCA9IHNjYW5Db2RlQ29tYm9zRW5jb2RlZFtpXTtcblxuXHRcdFx0Y29uc3QgY3RybEtleSA9IChzY2FuQ29kZUNvbWJvRW5jb2RlZCAmIDBiMDAxKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdGNvbnN0IHNoaWZ0S2V5ID0gKHNjYW5Db2RlQ29tYm9FbmNvZGVkICYgMGIwMTApID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0Y29uc3QgYWx0S2V5ID0gKHNjYW5Db2RlQ29tYm9FbmNvZGVkICYgMGIxMDApID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc2NhbkNvZGU6IFNjYW5Db2RlID0gKHNjYW5Db2RlQ29tYm9FbmNvZGVkID4+PiAzKTtcblxuXHRcdFx0cmVzdWx0W2ldID0gbmV3IFNjYW5Db2RlQ29tYm8oY3RybEtleSwgc2hpZnRLZXksIGFsdEtleSwgc2NhbkNvZGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGxvb2t1cFNjYW5Db2RlQ29tYm8oc2NhbkNvZGVDb21ibzogU2NhbkNvZGVDb21ibyk6IEtleUNvZGVDb21ib1tdIHtcblx0XHRjb25zdCBzY2FuQ29kZUNvbWJvRW5jb2RlZCA9IHRoaXMuX2VuY29kZVNjYW5Db2RlQ29tYm8oc2NhbkNvZGVDb21ibyk7XG5cdFx0Y29uc3Qga2V5Q29kZUNvbWJvc0VuY29kZWQgPSB0aGlzLl9zY2FuQ29kZVRvS2V5Q29kZVtzY2FuQ29kZUNvbWJvRW5jb2RlZF07XG5cdFx0aWYgKCFrZXlDb2RlQ29tYm9zRW5jb2RlZCB8fCBrZXlDb2RlQ29tYm9zRW5jb2RlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IEtleUNvZGVDb21ib1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGtleUNvZGVDb21ib3NFbmNvZGVkLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBrZXlDb2RlQ29tYm9FbmNvZGVkID0ga2V5Q29kZUNvbWJvc0VuY29kZWRbaV07XG5cblx0XHRcdGNvbnN0IGN0cmxLZXkgPSAoa2V5Q29kZUNvbWJvRW5jb2RlZCAmIDBiMDAxKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdGNvbnN0IHNoaWZ0S2V5ID0gKGtleUNvZGVDb21ib0VuY29kZWQgJiAwYjAxMCkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRjb25zdCBhbHRLZXkgPSAoa2V5Q29kZUNvbWJvRW5jb2RlZCAmIDBiMTAwKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdGNvbnN0IGtleUNvZGU6IEtleUNvZGUgPSAoa2V5Q29kZUNvbWJvRW5jb2RlZCA+Pj4gMyk7XG5cblx0XHRcdHJlc3VsdFtpXSA9IG5ldyBLZXlDb2RlQ29tYm8oY3RybEtleSwgc2hpZnRLZXksIGFsdEtleSwga2V5Q29kZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ3Vlc3NTdGFibGVLZXlDb2RlKHNjYW5Db2RlOiBTY2FuQ29kZSk6IEtleUNvZGUge1xuXHRcdGlmIChzY2FuQ29kZSA+PSBTY2FuQ29kZS5EaWdpdDEgJiYgc2NhbkNvZGUgPD0gU2NhbkNvZGUuRGlnaXQwKSB7XG5cdFx0XHQvLyBkaWdpdHMgYXJlIG9rXG5cdFx0XHRzd2l0Y2ggKHNjYW5Db2RlKSB7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQxOiByZXR1cm4gS2V5Q29kZS5EaWdpdDE7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQyOiByZXR1cm4gS2V5Q29kZS5EaWdpdDI7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQzOiByZXR1cm4gS2V5Q29kZS5EaWdpdDM7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQ0OiByZXR1cm4gS2V5Q29kZS5EaWdpdDQ7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQ1OiByZXR1cm4gS2V5Q29kZS5EaWdpdDU7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQ2OiByZXR1cm4gS2V5Q29kZS5EaWdpdDY7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQ3OiByZXR1cm4gS2V5Q29kZS5EaWdpdDc7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQ4OiByZXR1cm4gS2V5Q29kZS5EaWdpdDg7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQ5OiByZXR1cm4gS2V5Q29kZS5EaWdpdDk7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuRGlnaXQwOiByZXR1cm4gS2V5Q29kZS5EaWdpdDA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTG9va3VwIHRoZSBzY2FuQ29kZSB3aXRoIGFuZCB3aXRob3V0IHNoaWZ0IGFuZCBzZWUgaWYgdGhlIGtleUNvZGUgaXMgc3RhYmxlXG5cdFx0Y29uc3Qga2V5Q29kZUNvbWJvczEgPSB0aGlzLmxvb2t1cFNjYW5Db2RlQ29tYm8obmV3IFNjYW5Db2RlQ29tYm8oZmFsc2UsIGZhbHNlLCBmYWxzZSwgc2NhbkNvZGUpKTtcblx0XHRjb25zdCBrZXlDb2RlQ29tYm9zMiA9IHRoaXMubG9va3VwU2NhbkNvZGVDb21ibyhuZXcgU2NhbkNvZGVDb21ibyhmYWxzZSwgdHJ1ZSwgZmFsc2UsIHNjYW5Db2RlKSk7XG5cdFx0aWYgKGtleUNvZGVDb21ib3MxLmxlbmd0aCA9PT0gMSAmJiBrZXlDb2RlQ29tYm9zMi5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IHNoaWZ0S2V5MSA9IGtleUNvZGVDb21ib3MxWzBdLnNoaWZ0S2V5O1xuXHRcdFx0Y29uc3Qga2V5Q29kZTEgPSBrZXlDb2RlQ29tYm9zMVswXS5rZXlDb2RlO1xuXHRcdFx0Y29uc3Qgc2hpZnRLZXkyID0ga2V5Q29kZUNvbWJvczJbMF0uc2hpZnRLZXk7XG5cdFx0XHRjb25zdCBrZXlDb2RlMiA9IGtleUNvZGVDb21ib3MyWzBdLmtleUNvZGU7XG5cdFx0XHRpZiAoa2V5Q29kZTEgPT09IGtleUNvZGUyICYmIHNoaWZ0S2V5MSAhPT0gc2hpZnRLZXkyKSB7XG5cdFx0XHRcdC8vIFRoaXMgbG9va3MgbGlrZSBhIHN0YWJsZSBtYXBwaW5nXG5cdFx0XHRcdHJldHVybiBrZXlDb2RlMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gS2V5Q29kZS5EZXBlbmRzT25LYkxheW91dDtcblx0fVxuXG5cdHByaXZhdGUgX2VuY29kZVNjYW5Db2RlQ29tYm8oc2NhbkNvZGVDb21ibzogU2NhbkNvZGVDb21ibyk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuY29kZShzY2FuQ29kZUNvbWJvLmN0cmxLZXksIHNjYW5Db2RlQ29tYm8uc2hpZnRLZXksIHNjYW5Db2RlQ29tYm8uYWx0S2V5LCBzY2FuQ29kZUNvbWJvLnNjYW5Db2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX2VuY29kZUtleUNvZGVDb21ibyhrZXlDb2RlQ29tYm86IEtleUNvZGVDb21ibyk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuY29kZShrZXlDb2RlQ29tYm8uY3RybEtleSwga2V5Q29kZUNvbWJvLnNoaWZ0S2V5LCBrZXlDb2RlQ29tYm8uYWx0S2V5LCBrZXlDb2RlQ29tYm8ua2V5Q29kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmNvZGUoY3RybEtleTogYm9vbGVhbiwgc2hpZnRLZXk6IGJvb2xlYW4sIGFsdEtleTogYm9vbGVhbiwgcHJpbmNpcGFsOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiAoXG5cdFx0XHQoKGN0cmxLZXkgPyAxIDogMCkgPDwgMClcblx0XHRcdHwgKChzaGlmdEtleSA/IDEgOiAwKSA8PCAxKVxuXHRcdFx0fCAoKGFsdEtleSA/IDEgOiAwKSA8PCAyKVxuXHRcdFx0fCBwcmluY2lwYWwgPDwgM1xuXHRcdCkgPj4+IDA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIgaW1wbGVtZW50cyBJS2V5Ym9hcmRNYXBwZXIge1xuXG5cdC8qKlxuXHQgKiB1c2VkIG9ubHkgZm9yIGRlYnVnIHB1cnBvc2VzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29kZUluZm86IElNYWNMaW51eEtleU1hcHBpbmdbXTtcblx0LyoqXG5cdCAqIE1hcHMgU2NhbkNvZGUgY29tYm9zIDwtPiBLZXlDb2RlIGNvbWJvcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjYW5Db2RlS2V5Q29kZU1hcHBlcjogU2NhbkNvZGVLZXlDb2RlTWFwcGVyO1xuXHQvKipcblx0ICogVUkgbGFiZWwgZm9yIGEgU2NhbkNvZGUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2FuQ29kZVRvTGFiZWw6IEFycmF5PHN0cmluZyB8IG51bGw+ID0gW107XG5cdC8qKlxuXHQgKiBEaXNwYXRjaGluZyBzdHJpbmcgZm9yIGEgU2NhbkNvZGUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2FuQ29kZVRvRGlzcGF0Y2g6IEFycmF5PHN0cmluZyB8IG51bGw+ID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNVU1N0YW5kYXJkOiBib29sZWFuLFxuXHRcdHJhd01hcHBpbmdzOiBJTWFjTGludXhLZXlib2FyZE1hcHBpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWFwQWx0R3JUb0N0cmxBbHQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfT1M6IE9wZXJhdGluZ1N5c3RlbSxcblx0KSB7XG5cdFx0dGhpcy5fY29kZUluZm8gPSBbXTtcblx0XHR0aGlzLl9zY2FuQ29kZUtleUNvZGVNYXBwZXIgPSBuZXcgU2NhbkNvZGVLZXlDb2RlTWFwcGVyKCk7XG5cdFx0dGhpcy5fc2NhbkNvZGVUb0xhYmVsID0gW107XG5cdFx0dGhpcy5fc2NhbkNvZGVUb0Rpc3BhdGNoID0gW107XG5cblx0XHRjb25zdCBfcmVnaXN0ZXJJZlVua25vd24gPSAoXG5cdFx0XHRod0N0cmxLZXk6IDAgfCAxLCBod1NoaWZ0S2V5OiAwIHwgMSwgaHdBbHRLZXk6IDAgfCAxLCBzY2FuQ29kZTogU2NhbkNvZGUsXG5cdFx0XHRrYkN0cmxLZXk6IDAgfCAxLCBrYlNoaWZ0S2V5OiAwIHwgMSwga2JBbHRLZXk6IDAgfCAxLCBrZXlDb2RlOiBLZXlDb2RlLFxuXHRcdCk6IHZvaWQgPT4ge1xuXHRcdFx0dGhpcy5fc2NhbkNvZGVLZXlDb2RlTWFwcGVyLnJlZ2lzdGVySWZVbmtub3duKFxuXHRcdFx0XHRuZXcgU2NhbkNvZGVDb21ibyhod0N0cmxLZXkgPyB0cnVlIDogZmFsc2UsIGh3U2hpZnRLZXkgPyB0cnVlIDogZmFsc2UsIGh3QWx0S2V5ID8gdHJ1ZSA6IGZhbHNlLCBzY2FuQ29kZSksXG5cdFx0XHRcdG5ldyBLZXlDb2RlQ29tYm8oa2JDdHJsS2V5ID8gdHJ1ZSA6IGZhbHNlLCBrYlNoaWZ0S2V5ID8gdHJ1ZSA6IGZhbHNlLCBrYkFsdEtleSA/IHRydWUgOiBmYWxzZSwga2V5Q29kZSlcblx0XHRcdCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IF9yZWdpc3RlckFsbENvbWJvcyA9IChfY3RybEtleTogMCB8IDEsIF9zaGlmdEtleTogMCB8IDEsIF9hbHRLZXk6IDAgfCAxLCBzY2FuQ29kZTogU2NhbkNvZGUsIGtleUNvZGU6IEtleUNvZGUpOiB2b2lkID0+IHtcblx0XHRcdGZvciAobGV0IGN0cmxLZXkgPSBfY3RybEtleTsgY3RybEtleSA8PSAxOyBjdHJsS2V5KyspIHtcblx0XHRcdFx0Zm9yIChsZXQgc2hpZnRLZXkgPSBfc2hpZnRLZXk7IHNoaWZ0S2V5IDw9IDE7IHNoaWZ0S2V5KyspIHtcblx0XHRcdFx0XHRmb3IgKGxldCBhbHRLZXkgPSBfYWx0S2V5OyBhbHRLZXkgPD0gMTsgYWx0S2V5KyspIHtcblx0XHRcdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bihcblx0XHRcdFx0XHRcdFx0Y3RybEtleSwgc2hpZnRLZXksIGFsdEtleSwgc2NhbkNvZGUsXG5cdFx0XHRcdFx0XHRcdGN0cmxLZXksIHNoaWZ0S2V5LCBhbHRLZXksIGtleUNvZGVcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIEluaXRpYWxpemUgYF9zY2FuQ29kZVRvTGFiZWxgXG5cdFx0Zm9yIChsZXQgc2NhbkNvZGUgPSBTY2FuQ29kZS5Ob25lOyBzY2FuQ29kZSA8IFNjYW5Db2RlLk1BWF9WQUxVRTsgc2NhbkNvZGUrKykge1xuXHRcdFx0dGhpcy5fc2NhbkNvZGVUb0xhYmVsW3NjYW5Db2RlXSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBgX3NjYW5Db2RlVG9EaXNwYXRjaGBcblx0XHRmb3IgKGxldCBzY2FuQ29kZSA9IFNjYW5Db2RlLk5vbmU7IHNjYW5Db2RlIDwgU2NhbkNvZGUuTUFYX1ZBTFVFOyBzY2FuQ29kZSsrKSB7XG5cdFx0XHR0aGlzLl9zY2FuQ29kZVRvRGlzcGF0Y2hbc2NhbkNvZGVdID0gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgaW1tdXRhYmxlIG1hcHBpbmdzXG5cdFx0Zm9yIChsZXQgc2NhbkNvZGUgPSBTY2FuQ29kZS5Ob25lOyBzY2FuQ29kZSA8IFNjYW5Db2RlLk1BWF9WQUxVRTsgc2NhbkNvZGUrKykge1xuXHRcdFx0Y29uc3Qga2V5Q29kZSA9IElNTVVUQUJMRV9DT0RFX1RPX0tFWV9DT0RFW3NjYW5Db2RlXTtcblx0XHRcdGlmIChrZXlDb2RlICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRcdF9yZWdpc3RlckFsbENvbWJvcygwLCAwLCAwLCBzY2FuQ29kZSwga2V5Q29kZSk7XG5cdFx0XHRcdHRoaXMuX3NjYW5Db2RlVG9MYWJlbFtzY2FuQ29kZV0gPSBLZXlDb2RlVXRpbHMudG9TdHJpbmcoa2V5Q29kZSk7XG5cblx0XHRcdFx0aWYgKGtleUNvZGUgPT09IEtleUNvZGUuVW5rbm93biB8fCBpc01vZGlmaWVyS2V5KGtleUNvZGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NhbkNvZGVUb0Rpc3BhdGNoW3NjYW5Db2RlXSA9IG51bGw7IC8vIGNhbm5vdCBkaXNwYXRjaCBvbiB0aGlzIFNjYW5Db2RlXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NhbkNvZGVUb0Rpc3BhdGNoW3NjYW5Db2RlXSA9IGBbJHtTY2FuQ29kZVV0aWxzLnRvU3RyaW5nKHNjYW5Db2RlKX1dYDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRyeSB0byBpZGVudGlmeSBrZXlib2FyZCBsYXlvdXRzIHdoZXJlIGNoYXJhY3RlcnMgQS1aIGFyZSBtaXNzaW5nXG5cdFx0Ly8gYW5kIGZvcmNpYmx5IG1hcCB0aGVtIHRvIHRoZWlyIGNvcnJlc3BvbmRpbmcgc2NhbiBjb2RlcyBpZiB0aGF0IGlzIHRoZSBjYXNlXG5cdFx0Y29uc3QgbWlzc2luZ0xhdGluTGV0dGVyc092ZXJyaWRlOiB7IFtzY2FuQ29kZTogc3RyaW5nXTogSU1hY0xpbnV4S2V5TWFwcGluZyB9ID0ge307XG5cblx0XHR7XG5cdFx0XHRjb25zdCBwcm9kdWNlc0xhdGluTGV0dGVyOiBib29sZWFuW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc3RyU2NhbkNvZGUgaW4gcmF3TWFwcGluZ3MpIHtcblx0XHRcdFx0aWYgKHJhd01hcHBpbmdzLmhhc093blByb3BlcnR5KHN0clNjYW5Db2RlKSkge1xuXHRcdFx0XHRcdGNvbnN0IHNjYW5Db2RlID0gU2NhbkNvZGVVdGlscy50b0VudW0oc3RyU2NhbkNvZGUpO1xuXHRcdFx0XHRcdGlmIChzY2FuQ29kZSA9PT0gU2NhbkNvZGUuTm9uZSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtzY2FuQ29kZV0gIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHJhd01hcHBpbmcgPSByYXdNYXBwaW5nc1tzdHJTY2FuQ29kZV07XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBNYWNMaW51eEtleWJvYXJkTWFwcGVyLmdldENoYXJDb2RlKHJhd01hcHBpbmcudmFsdWUpO1xuXG5cdFx0XHRcdFx0aWYgKHZhbHVlID49IENoYXJDb2RlLmEgJiYgdmFsdWUgPD0gQ2hhckNvZGUueikge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXBwZXJDYXNlVmFsdWUgPSBDaGFyQ29kZS5BICsgKHZhbHVlIC0gQ2hhckNvZGUuYSk7XG5cdFx0XHRcdFx0XHRwcm9kdWNlc0xhdGluTGV0dGVyW3VwcGVyQ2FzZVZhbHVlXSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IF9yZWdpc3RlckxldHRlcklmTWlzc2luZyA9IChjaGFyQ29kZTogQ2hhckNvZGUsIHNjYW5Db2RlOiBTY2FuQ29kZSwgdmFsdWU6IHN0cmluZywgd2l0aFNoaWZ0OiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRcdFx0aWYgKCFwcm9kdWNlc0xhdGluTGV0dGVyW2NoYXJDb2RlXSkge1xuXHRcdFx0XHRcdG1pc3NpbmdMYXRpbkxldHRlcnNPdmVycmlkZVtTY2FuQ29kZVV0aWxzLnRvU3RyaW5nKHNjYW5Db2RlKV0gPSB7XG5cdFx0XHRcdFx0XHR2YWx1ZTogdmFsdWUsXG5cdFx0XHRcdFx0XHR3aXRoU2hpZnQ6IHdpdGhTaGlmdCxcblx0XHRcdFx0XHRcdHdpdGhBbHRHcjogJycsXG5cdFx0XHRcdFx0XHR3aXRoU2hpZnRBbHRHcjogJydcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBFbnN1cmUgbGV0dGVycyBhcmUgbWFwcGVkXG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuQSwgU2NhbkNvZGUuS2V5QSwgJ2EnLCAnQScpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkIsIFNjYW5Db2RlLktleUIsICdiJywgJ0InKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5DLCBTY2FuQ29kZS5LZXlDLCAnYycsICdDJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuRCwgU2NhbkNvZGUuS2V5RCwgJ2QnLCAnRCcpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkUsIFNjYW5Db2RlLktleUUsICdlJywgJ0UnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5GLCBTY2FuQ29kZS5LZXlGLCAnZicsICdGJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuRywgU2NhbkNvZGUuS2V5RywgJ2cnLCAnRycpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkgsIFNjYW5Db2RlLktleUgsICdoJywgJ0gnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5JLCBTY2FuQ29kZS5LZXlJLCAnaScsICdJJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuSiwgU2NhbkNvZGUuS2V5SiwgJ2onLCAnSicpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkssIFNjYW5Db2RlLktleUssICdrJywgJ0snKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5MLCBTY2FuQ29kZS5LZXlMLCAnbCcsICdMJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuTSwgU2NhbkNvZGUuS2V5TSwgJ20nLCAnTScpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLk4sIFNjYW5Db2RlLktleU4sICduJywgJ04nKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5PLCBTY2FuQ29kZS5LZXlPLCAnbycsICdPJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuUCwgU2NhbkNvZGUuS2V5UCwgJ3AnLCAnUCcpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlEsIFNjYW5Db2RlLktleVEsICdxJywgJ1EnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5SLCBTY2FuQ29kZS5LZXlSLCAncicsICdSJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuUywgU2NhbkNvZGUuS2V5UywgJ3MnLCAnUycpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlQsIFNjYW5Db2RlLktleVQsICd0JywgJ1QnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5VLCBTY2FuQ29kZS5LZXlVLCAndScsICdVJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuViwgU2NhbkNvZGUuS2V5ViwgJ3YnLCAnVicpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlcsIFNjYW5Db2RlLktleVcsICd3JywgJ1cnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5YLCBTY2FuQ29kZS5LZXlYLCAneCcsICdYJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuWSwgU2NhbkNvZGUuS2V5WSwgJ3knLCAnWScpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlosIFNjYW5Db2RlLktleVosICd6JywgJ1onKTtcblx0XHR9XG5cblx0XHRjb25zdCBtYXBwaW5nczogSVNjYW5Db2RlTWFwcGluZ1tdID0gW107XG5cdFx0bGV0IG1hcHBpbmdzTGVuID0gMDtcblx0XHRmb3IgKGNvbnN0IHN0clNjYW5Db2RlIGluIHJhd01hcHBpbmdzKSB7XG5cdFx0XHRpZiAocmF3TWFwcGluZ3MuaGFzT3duUHJvcGVydHkoc3RyU2NhbkNvZGUpKSB7XG5cdFx0XHRcdGNvbnN0IHNjYW5Db2RlID0gU2NhbkNvZGVVdGlscy50b0VudW0oc3RyU2NhbkNvZGUpO1xuXHRcdFx0XHRpZiAoc2NhbkNvZGUgPT09IFNjYW5Db2RlLk5vbmUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbc2NhbkNvZGVdICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9jb2RlSW5mb1tzY2FuQ29kZV0gPSByYXdNYXBwaW5nc1tzdHJTY2FuQ29kZV07XG5cblx0XHRcdFx0Y29uc3QgcmF3TWFwcGluZyA9IG1pc3NpbmdMYXRpbkxldHRlcnNPdmVycmlkZVtzdHJTY2FuQ29kZV0gfHwgcmF3TWFwcGluZ3Nbc3RyU2NhbkNvZGVdO1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIuZ2V0Q2hhckNvZGUocmF3TWFwcGluZy52YWx1ZSk7XG5cdFx0XHRcdGNvbnN0IHdpdGhTaGlmdCA9IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIuZ2V0Q2hhckNvZGUocmF3TWFwcGluZy53aXRoU2hpZnQpO1xuXHRcdFx0XHRjb25zdCB3aXRoQWx0R3IgPSBNYWNMaW51eEtleWJvYXJkTWFwcGVyLmdldENoYXJDb2RlKHJhd01hcHBpbmcud2l0aEFsdEdyKTtcblx0XHRcdFx0Y29uc3Qgd2l0aFNoaWZ0QWx0R3IgPSBNYWNMaW51eEtleWJvYXJkTWFwcGVyLmdldENoYXJDb2RlKHJhd01hcHBpbmcud2l0aFNoaWZ0QWx0R3IpO1xuXG5cdFx0XHRcdGNvbnN0IG1hcHBpbmc6IElTY2FuQ29kZU1hcHBpbmcgPSB7XG5cdFx0XHRcdFx0c2NhbkNvZGU6IHNjYW5Db2RlLFxuXHRcdFx0XHRcdHZhbHVlOiB2YWx1ZSxcblx0XHRcdFx0XHR3aXRoU2hpZnQ6IHdpdGhTaGlmdCxcblx0XHRcdFx0XHR3aXRoQWx0R3I6IHdpdGhBbHRHcixcblx0XHRcdFx0XHR3aXRoU2hpZnRBbHRHcjogd2l0aFNoaWZ0QWx0R3IsXG5cdFx0XHRcdH07XG5cdFx0XHRcdG1hcHBpbmdzW21hcHBpbmdzTGVuKytdID0gbWFwcGluZztcblxuXHRcdFx0XHR0aGlzLl9zY2FuQ29kZVRvRGlzcGF0Y2hbc2NhbkNvZGVdID0gYFske1NjYW5Db2RlVXRpbHMudG9TdHJpbmcoc2NhbkNvZGUpfV1gO1xuXG5cdFx0XHRcdGlmICh2YWx1ZSA+PSBDaGFyQ29kZS5hICYmIHZhbHVlIDw9IENoYXJDb2RlLnopIHtcblx0XHRcdFx0XHRjb25zdCB1cHBlckNhc2VWYWx1ZSA9IENoYXJDb2RlLkEgKyAodmFsdWUgLSBDaGFyQ29kZS5hKTtcblx0XHRcdFx0XHR0aGlzLl9zY2FuQ29kZVRvTGFiZWxbc2NhbkNvZGVdID0gU3RyaW5nLmZyb21DaGFyQ29kZSh1cHBlckNhc2VWYWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPj0gQ2hhckNvZGUuQSAmJiB2YWx1ZSA8PSBDaGFyQ29kZS5aKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NhbkNvZGVUb0xhYmVsW3NjYW5Db2RlXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NhbkNvZGVUb0xhYmVsW3NjYW5Db2RlXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3NjYW5Db2RlVG9MYWJlbFtzY2FuQ29kZV0gPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGFsbCBgd2l0aFNoaWZ0QWx0R3JgIGVudHJpZXNcblx0XHRmb3IgKGxldCBpID0gbWFwcGluZ3MubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IG1hcHBpbmcgPSBtYXBwaW5nc1tpXTtcblx0XHRcdGNvbnN0IHNjYW5Db2RlID0gbWFwcGluZy5zY2FuQ29kZTtcblx0XHRcdGNvbnN0IHdpdGhTaGlmdEFsdEdyID0gbWFwcGluZy53aXRoU2hpZnRBbHRHcjtcblx0XHRcdGlmICh3aXRoU2hpZnRBbHRHciA9PT0gbWFwcGluZy53aXRoQWx0R3IgfHwgd2l0aFNoaWZ0QWx0R3IgPT09IG1hcHBpbmcud2l0aFNoaWZ0IHx8IHdpdGhTaGlmdEFsdEdyID09PSBtYXBwaW5nLnZhbHVlKSB7XG5cdFx0XHRcdC8vIGhhbmRsZWQgYmVsb3dcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrYiA9IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIuX2NoYXJDb2RlVG9LYih3aXRoU2hpZnRBbHRHcik7XG5cdFx0XHRpZiAoIWtiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2JTaGlmdEtleSA9IGtiLnNoaWZ0S2V5O1xuXHRcdFx0Y29uc3Qga2V5Q29kZSA9IGtiLmtleUNvZGU7XG5cblx0XHRcdGlmIChrYlNoaWZ0S2V5KSB7XG5cdFx0XHRcdC8vIEN0cmwrU2hpZnQrQWx0K1NjYW5Db2RlID0+IFNoaWZ0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDEsIDEsIHNjYW5Db2RlLCAwLCAxLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgQ3RybCtBbHQrU2NhbkNvZGUgPT4gICAgICAgICAgU2hpZnQrS2V5Q29kZVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQ3RybCtTaGlmdCtBbHQrU2NhbkNvZGUgPT4gS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMSwgMSwgc2NhbkNvZGUsIDAsIDAsIDAsIGtleUNvZGUpOyAvLyAgICAgICBDdHJsK0FsdCtTY2FuQ29kZSA9PiAgICAgICAgICAgICAgICBLZXlDb2RlXG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEhhbmRsZSBhbGwgYHdpdGhBbHRHcmAgZW50cmllc1xuXHRcdGZvciAobGV0IGkgPSBtYXBwaW5ncy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgbWFwcGluZyA9IG1hcHBpbmdzW2ldO1xuXHRcdFx0Y29uc3Qgc2NhbkNvZGUgPSBtYXBwaW5nLnNjYW5Db2RlO1xuXHRcdFx0Y29uc3Qgd2l0aEFsdEdyID0gbWFwcGluZy53aXRoQWx0R3I7XG5cdFx0XHRpZiAod2l0aEFsdEdyID09PSBtYXBwaW5nLndpdGhTaGlmdCB8fCB3aXRoQWx0R3IgPT09IG1hcHBpbmcudmFsdWUpIHtcblx0XHRcdFx0Ly8gaGFuZGxlZCBiZWxvd1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtiID0gTWFjTGludXhLZXlib2FyZE1hcHBlci5fY2hhckNvZGVUb0tiKHdpdGhBbHRHcik7XG5cdFx0XHRpZiAoIWtiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2JTaGlmdEtleSA9IGtiLnNoaWZ0S2V5O1xuXHRcdFx0Y29uc3Qga2V5Q29kZSA9IGtiLmtleUNvZGU7XG5cblx0XHRcdGlmIChrYlNoaWZ0S2V5KSB7XG5cdFx0XHRcdC8vIEN0cmwrQWx0K1NjYW5Db2RlID0+IFNoaWZ0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDAsIDEsIHNjYW5Db2RlLCAwLCAxLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgQ3RybCtBbHQrU2NhbkNvZGUgPT4gICAgICAgICAgU2hpZnQrS2V5Q29kZVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQ3RybCtBbHQrU2NhbkNvZGUgPT4gS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMCwgMSwgc2NhbkNvZGUsIDAsIDAsIDAsIGtleUNvZGUpOyAvLyAgICAgICBDdHJsK0FsdCtTY2FuQ29kZSA9PiAgICAgICAgICAgICAgICBLZXlDb2RlXG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEhhbmRsZSBhbGwgYHdpdGhTaGlmdGAgZW50cmllc1xuXHRcdGZvciAobGV0IGkgPSBtYXBwaW5ncy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgbWFwcGluZyA9IG1hcHBpbmdzW2ldO1xuXHRcdFx0Y29uc3Qgc2NhbkNvZGUgPSBtYXBwaW5nLnNjYW5Db2RlO1xuXHRcdFx0Y29uc3Qgd2l0aFNoaWZ0ID0gbWFwcGluZy53aXRoU2hpZnQ7XG5cdFx0XHRpZiAod2l0aFNoaWZ0ID09PSBtYXBwaW5nLnZhbHVlKSB7XG5cdFx0XHRcdC8vIGhhbmRsZWQgYmVsb3dcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrYiA9IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIuX2NoYXJDb2RlVG9LYih3aXRoU2hpZnQpO1xuXHRcdFx0aWYgKCFrYikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtiU2hpZnRLZXkgPSBrYi5zaGlmdEtleTtcblx0XHRcdGNvbnN0IGtleUNvZGUgPSBrYi5rZXlDb2RlO1xuXG5cdFx0XHRpZiAoa2JTaGlmdEtleSkge1xuXHRcdFx0XHQvLyBTaGlmdCtTY2FuQ29kZSA9PiBTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAxLCAwLCBzY2FuQ29kZSwgMCwgMSwgMCwga2V5Q29kZSk7IC8vICAgICAgICAgIFNoaWZ0K1NjYW5Db2RlID0+ICAgICAgICAgIFNoaWZ0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDAsIDEsIDEsIHNjYW5Db2RlLCAwLCAxLCAxLCBrZXlDb2RlKTsgLy8gICAgICBTaGlmdCtBbHQrU2NhbkNvZGUgPT4gICAgICBTaGlmdCtBbHQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMSwgMCwgc2NhbkNvZGUsIDEsIDEsIDAsIGtleUNvZGUpOyAvLyAgICAgQ3RybCtTaGlmdCtTY2FuQ29kZSA9PiAgICAgQ3RybCtTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAxLCAxLCBzY2FuQ29kZSwgMSwgMSwgMSwga2V5Q29kZSk7IC8vIEN0cmwrU2hpZnQrQWx0K1NjYW5Db2RlID0+IEN0cmwrU2hpZnQrQWx0K0tleUNvZGVcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFNoaWZ0K1NjYW5Db2RlID0+IEtleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDAsIDEsIDAsIHNjYW5Db2RlLCAwLCAwLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgICAgU2hpZnQrU2NhbkNvZGUgPT4gICAgICAgICAgICAgICAgS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMCwgMSwgMCwgc2NhbkNvZGUsIDAsIDEsIDAsIGtleUNvZGUpOyAvLyAgICAgICAgICBTaGlmdCtTY2FuQ29kZSA9PiAgICAgICAgICBTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAxLCAxLCBzY2FuQ29kZSwgMCwgMCwgMSwga2V5Q29kZSk7IC8vICAgICAgU2hpZnQrQWx0K1NjYW5Db2RlID0+ICAgICAgICAgICAgQWx0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDAsIDEsIDEsIHNjYW5Db2RlLCAwLCAxLCAxLCBrZXlDb2RlKTsgLy8gICAgICBTaGlmdCtBbHQrU2NhbkNvZGUgPT4gICAgICBTaGlmdCtBbHQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMSwgMCwgc2NhbkNvZGUsIDEsIDAsIDAsIGtleUNvZGUpOyAvLyAgICAgQ3RybCtTaGlmdCtTY2FuQ29kZSA9PiAgICAgICAgICAgQ3RybCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAxLCAwLCBzY2FuQ29kZSwgMSwgMSwgMCwga2V5Q29kZSk7IC8vICAgICBDdHJsK1NoaWZ0K1NjYW5Db2RlID0+ICAgICBDdHJsK1NoaWZ0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDEsIDEsIHNjYW5Db2RlLCAxLCAwLCAxLCBrZXlDb2RlKTsgLy8gQ3RybCtTaGlmdCtBbHQrU2NhbkNvZGUgPT4gICAgICAgQ3RybCtBbHQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMSwgMSwgc2NhbkNvZGUsIDEsIDEsIDEsIGtleUNvZGUpOyAvLyBDdHJsK1NoaWZ0K0FsdCtTY2FuQ29kZSA9PiBDdHJsK1NoaWZ0K0FsdCtLZXlDb2RlXG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEhhbmRsZSBhbGwgYHZhbHVlYCBlbnRyaWVzXG5cdFx0Zm9yIChsZXQgaSA9IG1hcHBpbmdzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBtYXBwaW5nID0gbWFwcGluZ3NbaV07XG5cdFx0XHRjb25zdCBzY2FuQ29kZSA9IG1hcHBpbmcuc2NhbkNvZGU7XG5cdFx0XHRjb25zdCBrYiA9IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIuX2NoYXJDb2RlVG9LYihtYXBwaW5nLnZhbHVlKTtcblx0XHRcdGlmICgha2IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrYlNoaWZ0S2V5ID0ga2Iuc2hpZnRLZXk7XG5cdFx0XHRjb25zdCBrZXlDb2RlID0ga2Iua2V5Q29kZTtcblxuXHRcdFx0aWYgKGtiU2hpZnRLZXkpIHtcblx0XHRcdFx0Ly8gU2NhbkNvZGUgPT4gU2hpZnQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMCwgMCwgMCwgc2NhbkNvZGUsIDAsIDEsIDAsIGtleUNvZGUpOyAvLyAgICAgICAgICAgICAgICBTY2FuQ29kZSA9PiAgICAgICAgICBTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAwLCAxLCBzY2FuQ29kZSwgMCwgMSwgMSwga2V5Q29kZSk7IC8vICAgICAgICAgICAgQWx0K1NjYW5Db2RlID0+ICAgICAgU2hpZnQrQWx0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDAsIDAsIHNjYW5Db2RlLCAxLCAxLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgICAgIEN0cmwrU2NhbkNvZGUgPT4gICAgIEN0cmwrU2hpZnQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMCwgMSwgc2NhbkNvZGUsIDEsIDEsIDEsIGtleUNvZGUpOyAvLyAgICAgICBDdHJsK0FsdCtTY2FuQ29kZSA9PiBDdHJsK1NoaWZ0K0FsdCtLZXlDb2RlXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBTY2FuQ29kZSA9PiBLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAwLCAwLCBzY2FuQ29kZSwgMCwgMCwgMCwga2V5Q29kZSk7IC8vICAgICAgICAgICAgICAgIFNjYW5Db2RlID0+ICAgICAgICAgICAgICAgIEtleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDAsIDAsIDEsIHNjYW5Db2RlLCAwLCAwLCAxLCBrZXlDb2RlKTsgLy8gICAgICAgICAgICBBbHQrU2NhbkNvZGUgPT4gICAgICAgICAgICBBbHQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMCwgMSwgMCwgc2NhbkNvZGUsIDAsIDEsIDAsIGtleUNvZGUpOyAvLyAgICAgICAgICBTaGlmdCtTY2FuQ29kZSA9PiAgICAgICAgICBTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAxLCAxLCBzY2FuQ29kZSwgMCwgMSwgMSwga2V5Q29kZSk7IC8vICAgICAgU2hpZnQrQWx0K1NjYW5Db2RlID0+ICAgICAgU2hpZnQrQWx0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDAsIDAsIHNjYW5Db2RlLCAxLCAwLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgICAgIEN0cmwrU2NhbkNvZGUgPT4gICAgICAgICAgIEN0cmwrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMCwgMSwgc2NhbkNvZGUsIDEsIDAsIDEsIGtleUNvZGUpOyAvLyAgICAgICBDdHJsK0FsdCtTY2FuQ29kZSA9PiAgICAgICBDdHJsK0FsdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAxLCAwLCBzY2FuQ29kZSwgMSwgMSwgMCwga2V5Q29kZSk7IC8vICAgICBDdHJsK1NoaWZ0K1NjYW5Db2RlID0+ICAgICBDdHJsK1NoaWZ0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDEsIDEsIHNjYW5Db2RlLCAxLCAxLCAxLCBrZXlDb2RlKTsgLy8gQ3RybCtTaGlmdCtBbHQrU2NhbkNvZGUgPT4gQ3RybCtTaGlmdCtBbHQrS2V5Q29kZVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBIYW5kbGUgYWxsIGxlZnQtb3ZlciBhdmFpbGFibGUgZGlnaXRzXG5cdFx0X3JlZ2lzdGVyQWxsQ29tYm9zKDAsIDAsIDAsIFNjYW5Db2RlLkRpZ2l0MSwgS2V5Q29kZS5EaWdpdDEpO1xuXHRcdF9yZWdpc3RlckFsbENvbWJvcygwLCAwLCAwLCBTY2FuQ29kZS5EaWdpdDIsIEtleUNvZGUuRGlnaXQyKTtcblx0XHRfcmVnaXN0ZXJBbGxDb21ib3MoMCwgMCwgMCwgU2NhbkNvZGUuRGlnaXQzLCBLZXlDb2RlLkRpZ2l0Myk7XG5cdFx0X3JlZ2lzdGVyQWxsQ29tYm9zKDAsIDAsIDAsIFNjYW5Db2RlLkRpZ2l0NCwgS2V5Q29kZS5EaWdpdDQpO1xuXHRcdF9yZWdpc3RlckFsbENvbWJvcygwLCAwLCAwLCBTY2FuQ29kZS5EaWdpdDUsIEtleUNvZGUuRGlnaXQ1KTtcblx0XHRfcmVnaXN0ZXJBbGxDb21ib3MoMCwgMCwgMCwgU2NhbkNvZGUuRGlnaXQ2LCBLZXlDb2RlLkRpZ2l0Nik7XG5cdFx0X3JlZ2lzdGVyQWxsQ29tYm9zKDAsIDAsIDAsIFNjYW5Db2RlLkRpZ2l0NywgS2V5Q29kZS5EaWdpdDcpO1xuXHRcdF9yZWdpc3RlckFsbENvbWJvcygwLCAwLCAwLCBTY2FuQ29kZS5EaWdpdDgsIEtleUNvZGUuRGlnaXQ4KTtcblx0XHRfcmVnaXN0ZXJBbGxDb21ib3MoMCwgMCwgMCwgU2NhbkNvZGUuRGlnaXQ5LCBLZXlDb2RlLkRpZ2l0OSk7XG5cdFx0X3JlZ2lzdGVyQWxsQ29tYm9zKDAsIDAsIDAsIFNjYW5Db2RlLkRpZ2l0MCwgS2V5Q29kZS5EaWdpdDApO1xuXG5cdFx0dGhpcy5fc2NhbkNvZGVLZXlDb2RlTWFwcGVyLnJlZ2lzdHJhdGlvbkNvbXBsZXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgZHVtcERlYnVnSW5mbygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IGltbXV0YWJsZVNhbXBsZXMgPSBbXG5cdFx0XHRTY2FuQ29kZS5BcnJvd1VwLFxuXHRcdFx0U2NhbkNvZGUuTnVtcGFkMFxuXHRcdF07XG5cblx0XHRsZXQgY250ID0gMDtcblx0XHRyZXN1bHQucHVzaChgaXNVU1N0YW5kYXJkOiAke3RoaXMuX2lzVVNTdGFuZGFyZH1gKTtcblx0XHRyZXN1bHQucHVzaChgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLWApO1xuXHRcdGZvciAobGV0IHNjYW5Db2RlID0gU2NhbkNvZGUuTm9uZTsgc2NhbkNvZGUgPCBTY2FuQ29kZS5NQVhfVkFMVUU7IHNjYW5Db2RlKyspIHtcblx0XHRcdGlmIChJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtzY2FuQ29kZV0gIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdFx0aWYgKGltbXV0YWJsZVNhbXBsZXMuaW5kZXhPZihzY2FuQ29kZSkgPT09IC0xKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNudCAlIDQgPT09IDApIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goYHwgICAgICAgSFcgQ29kZSBjb21iaW5hdGlvbiAgICAgIHwgIEtleSAgfCAgICBLZXlDb2RlIGNvbWJpbmF0aW9uICAgIHwgUHJpIHwgICAgICAgICAgVUkgbGFiZWwgICAgICAgICB8ICAgICAgICAgVXNlciBzZXR0aW5ncyAgICAgICAgICB8ICAgIEVsZWN0cm9uIGFjY2VsZXJhdG9yICAgfCAgICAgICBEaXNwYXRjaGluZyBzdHJpbmcgICAgICAgfCBXWVNJV1lHIHxgKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goYC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcblx0XHRcdH1cblx0XHRcdGNudCsrO1xuXG5cdFx0XHRjb25zdCBtYXBwaW5nID0gdGhpcy5fY29kZUluZm9bc2NhbkNvZGVdO1xuXG5cdFx0XHRmb3IgKGxldCBtb2QgPSAwOyBtb2QgPCA4OyBtb2QrKykge1xuXHRcdFx0XHRjb25zdCBod0N0cmxLZXkgPSAobW9kICYgMGIwMDEpID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBod1NoaWZ0S2V5ID0gKG1vZCAmIDBiMDEwKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdFx0Y29uc3QgaHdBbHRLZXkgPSAobW9kICYgMGIxMDApID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBzY2FuQ29kZUNvbWJvID0gbmV3IFNjYW5Db2RlQ29tYm8oaHdDdHJsS2V5LCBod1NoaWZ0S2V5LCBod0FsdEtleSwgc2NhbkNvZGUpO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEtiID0gdGhpcy5yZXNvbHZlS2V5Ym9hcmRFdmVudCh7XG5cdFx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRcdGN0cmxLZXk6IHNjYW5Db2RlQ29tYm8uY3RybEtleSxcblx0XHRcdFx0XHRzaGlmdEtleTogc2NhbkNvZGVDb21iby5zaGlmdEtleSxcblx0XHRcdFx0XHRhbHRLZXk6IHNjYW5Db2RlQ29tYm8uYWx0S2V5LFxuXHRcdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0LFxuXHRcdFx0XHRcdGNvZGU6IFNjYW5Db2RlVXRpbHMudG9TdHJpbmcoc2NhbkNvZGUpXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IG91dFNjYW5Db2RlQ29tYm8gPSBzY2FuQ29kZUNvbWJvLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IG91dEtleSA9IHNjYW5Db2RlQ29tYm8uZ2V0UHJvZHVjZWRDaGFyKG1hcHBpbmcpO1xuXHRcdFx0XHRjb25zdCBhcmlhTGFiZWwgPSByZXNvbHZlZEtiLmdldEFyaWFMYWJlbCgpO1xuXHRcdFx0XHRjb25zdCBvdXRVSUxhYmVsID0gKGFyaWFMYWJlbCA/IGFyaWFMYWJlbC5yZXBsYWNlKC9Db250cm9sXFwrLywgJ0N0cmwrJykgOiBudWxsKTtcblx0XHRcdFx0Y29uc3Qgb3V0VXNlclNldHRpbmdzID0gcmVzb2x2ZWRLYi5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpO1xuXHRcdFx0XHRjb25zdCBvdXRFbGVjdHJvbkFjY2VsZXJhdG9yID0gcmVzb2x2ZWRLYi5nZXRFbGVjdHJvbkFjY2VsZXJhdG9yKCk7XG5cdFx0XHRcdGNvbnN0IG91dERpc3BhdGNoU3RyID0gcmVzb2x2ZWRLYi5nZXREaXNwYXRjaENob3JkcygpWzBdO1xuXG5cdFx0XHRcdGNvbnN0IGlzV1lTSVdZRyA9IChyZXNvbHZlZEtiID8gcmVzb2x2ZWRLYi5pc1dZU0lXWUcoKSA6IGZhbHNlKTtcblx0XHRcdFx0Y29uc3Qgb3V0V1lTSVdZRyA9IChpc1dZU0lXWUcgPyAnICAgICAgICcgOiAnICAgTk8gICcpO1xuXG5cdFx0XHRcdGNvbnN0IGtiQ29tYm9zID0gdGhpcy5fc2NhbkNvZGVLZXlDb2RlTWFwcGVyLmxvb2t1cFNjYW5Db2RlQ29tYm8oc2NhbkNvZGVDb21ibyk7XG5cdFx0XHRcdGlmIChrYkNvbWJvcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChgfCAke3RoaXMuX2xlZnRQYWQob3V0U2NhbkNvZGVDb21ibywgMzApfSB8ICR7b3V0S2V5fSB8ICR7dGhpcy5fbGVmdFBhZCgnJywgMjUpfSB8ICR7dGhpcy5fbGVmdFBhZCgnJywgMyl9IHwgJHt0aGlzLl9sZWZ0UGFkKG91dFVJTGFiZWwsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQob3V0VXNlclNldHRpbmdzLCAzMCl9IHwgJHt0aGlzLl9sZWZ0UGFkKG91dEVsZWN0cm9uQWNjZWxlcmF0b3IsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQob3V0RGlzcGF0Y2hTdHIsIDMwKX0gfCAke291dFdZU0lXWUd9IHxgKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0ga2JDb21ib3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGtiQ29tYm8gPSBrYkNvbWJvc1tpXTtcblx0XHRcdFx0XHRcdC8vIGZpbmQgb3V0IHRoZSBwcmlvcml0eSBvZiB0aGlzIHNjYW4gY29kZSBmb3IgdGhpcyBrZXkgY29kZVxuXHRcdFx0XHRcdFx0bGV0IGNvbFByaW9yaXR5OiBzdHJpbmc7XG5cblx0XHRcdFx0XHRcdGNvbnN0IHNjYW5Db2RlQ29tYm9zID0gdGhpcy5fc2NhbkNvZGVLZXlDb2RlTWFwcGVyLmxvb2t1cEtleUNvZGVDb21ibyhrYkNvbWJvKTtcblx0XHRcdFx0XHRcdGlmIChzY2FuQ29kZUNvbWJvcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0Ly8gbm8gbmVlZCBmb3IgcHJpb3JpdHksIHRoaXMga2V5IGNvZGUgY29tYm8gbWFwcyB0byBwcmVjaXNlbHkgdGhpcyBzY2FuIGNvZGUgY29tYm9cblx0XHRcdFx0XHRcdFx0Y29sUHJpb3JpdHkgPSAnJztcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGxldCBwcmlvcml0eSA9IC0xO1xuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IHNjYW5Db2RlQ29tYm9zLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHNjYW5Db2RlQ29tYm9zW2pdLmVxdWFscyhzY2FuQ29kZUNvbWJvKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cHJpb3JpdHkgPSBqICsgMTtcblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb2xQcmlvcml0eSA9IFN0cmluZyhwcmlvcml0eSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IG91dEtleWJpbmRpbmcgPSBrYkNvbWJvLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHRpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaChgfCAke3RoaXMuX2xlZnRQYWQob3V0U2NhbkNvZGVDb21ibywgMzApfSB8ICR7b3V0S2V5fSB8ICR7dGhpcy5fbGVmdFBhZChvdXRLZXliaW5kaW5nLCAyNSl9IHwgJHt0aGlzLl9sZWZ0UGFkKGNvbFByaW9yaXR5LCAzKX0gfCAke3RoaXMuX2xlZnRQYWQob3V0VUlMYWJlbCwgMjUpfSB8ICR7dGhpcy5fbGVmdFBhZChvdXRVc2VyU2V0dGluZ3MsIDMwKX0gfCAke3RoaXMuX2xlZnRQYWQob3V0RWxlY3Ryb25BY2NlbGVyYXRvciwgMjUpfSB8ICR7dGhpcy5fbGVmdFBhZChvdXREaXNwYXRjaFN0ciwgMzApfSB8ICR7b3V0V1lTSVdZR30gfGApO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gc2Vjb25kYXJ5IGtleWJpbmRpbmdzXG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGB8ICR7dGhpcy5fbGVmdFBhZCgnJywgMzApfSB8ICAgICAgIHwgJHt0aGlzLl9sZWZ0UGFkKG91dEtleWJpbmRpbmcsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQoY29sUHJpb3JpdHksIDMpfSB8ICR7dGhpcy5fbGVmdFBhZCgnJywgMjUpfSB8ICR7dGhpcy5fbGVmdFBhZCgnJywgMzApfSB8ICR7dGhpcy5fbGVmdFBhZCgnJywgMjUpfSB8ICR7dGhpcy5fbGVmdFBhZCgnJywgMzApfSB8ICAgICAgICAgfGApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLWApO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9sZWZ0UGFkKHN0cjogc3RyaW5nIHwgbnVsbCwgY250OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGlmIChzdHIgPT09IG51bGwpIHtcblx0XHRcdHN0ciA9ICdudWxsJztcblx0XHR9XG5cdFx0d2hpbGUgKHN0ci5sZW5ndGggPCBjbnQpIHtcblx0XHRcdHN0ciA9ICcgJyArIHN0cjtcblx0XHR9XG5cdFx0cmV0dXJuIHN0cjtcblx0fVxuXG5cdHB1YmxpYyBrZXlDb2RlQ2hvcmRUb1NjYW5Db2RlQ2hvcmQoY2hvcmQ6IEtleUNvZGVDaG9yZCk6IFNjYW5Db2RlQ2hvcmRbXSB7XG5cdFx0Ly8gQXZvaWQgZG91YmxlIEVudGVyIGJpbmRpbmdzIChib3RoIFNjYW5Db2RlLk51bXBhZEVudGVyIGFuZCBTY2FuQ29kZS5FbnRlciBwb2ludCB0byBLZXlDb2RlLkVudGVyKVxuXHRcdGlmIChjaG9yZC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRyZXR1cm4gW25ldyBTY2FuQ29kZUNob3JkKGNob3JkLmN0cmxLZXksIGNob3JkLnNoaWZ0S2V5LCBjaG9yZC5hbHRLZXksIGNob3JkLm1ldGFLZXksIFNjYW5Db2RlLkVudGVyKV07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NhbkNvZGVDb21ib3MgPSB0aGlzLl9zY2FuQ29kZUtleUNvZGVNYXBwZXIubG9va3VwS2V5Q29kZUNvbWJvKFxuXHRcdFx0bmV3IEtleUNvZGVDb21ibyhjaG9yZC5jdHJsS2V5LCBjaG9yZC5zaGlmdEtleSwgY2hvcmQuYWx0S2V5LCBjaG9yZC5rZXlDb2RlKVxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQ6IFNjYW5Db2RlQ2hvcmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzY2FuQ29kZUNvbWJvcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2NhbkNvZGVDb21ibyA9IHNjYW5Db2RlQ29tYm9zW2ldO1xuXHRcdFx0cmVzdWx0W2ldID0gbmV3IFNjYW5Db2RlQ2hvcmQoc2NhbkNvZGVDb21iby5jdHJsS2V5LCBzY2FuQ29kZUNvbWJvLnNoaWZ0S2V5LCBzY2FuQ29kZUNvbWJvLmFsdEtleSwgY2hvcmQubWV0YUtleSwgc2NhbkNvZGVDb21iby5zY2FuQ29kZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VUlMYWJlbEZvclNjYW5Db2RlQ2hvcmQoY2hvcmQ6IFNjYW5Db2RlQ2hvcmQgfCBudWxsKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5pc0R1cGxpY2F0ZU1vZGlmaWVyQ2FzZSgpKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9PUyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCkge1xuXHRcdFx0c3dpdGNoIChjaG9yZC5zY2FuQ29kZSkge1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkFycm93TGVmdDpcblx0XHRcdFx0XHRyZXR1cm4gJ1x1MjE5MCc7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuQXJyb3dVcDpcblx0XHRcdFx0XHRyZXR1cm4gJ1x1MjE5MSc7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuQXJyb3dSaWdodDpcblx0XHRcdFx0XHRyZXR1cm4gJ1x1MjE5Mic7XG5cdFx0XHRcdGNhc2UgU2NhbkNvZGUuQXJyb3dEb3duOlxuXHRcdFx0XHRcdHJldHVybiAnXHUyMTkzJztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NjYW5Db2RlVG9MYWJlbFtjaG9yZC5zY2FuQ29kZV07XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXJpYUxhYmVsRm9yU2NhbkNvZGVDaG9yZChjaG9yZDogU2NhbkNvZGVDaG9yZCB8IG51bGwpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIWNob3JkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGNob3JkLmlzRHVwbGljYXRlTW9kaWZpZXJDYXNlKCkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NjYW5Db2RlVG9MYWJlbFtjaG9yZC5zY2FuQ29kZV07XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGlzcGF0Y2hTdHJGb3JTY2FuQ29kZUNob3JkKGNob3JkOiBTY2FuQ29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Y29uc3QgY29kZURpc3BhdGNoID0gdGhpcy5fc2NhbkNvZGVUb0Rpc3BhdGNoW2Nob3JkLnNjYW5Db2RlXTtcblx0XHRpZiAoIWNvZGVEaXNwYXRjaCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQgPSAnJztcblxuXHRcdGlmIChjaG9yZC5jdHJsS2V5KSB7XG5cdFx0XHRyZXN1bHQgKz0gJ2N0cmwrJztcblx0XHR9XG5cdFx0aWYgKGNob3JkLnNoaWZ0S2V5KSB7XG5cdFx0XHRyZXN1bHQgKz0gJ3NoaWZ0Kyc7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5hbHRLZXkpIHtcblx0XHRcdHJlc3VsdCArPSAnYWx0Kyc7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRyZXN1bHQgKz0gJ21ldGErJztcblx0XHR9XG5cdFx0cmVzdWx0ICs9IGNvZGVEaXNwYXRjaDtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VXNlclNldHRpbmdzTGFiZWxGb3JTY2FuQ29kZUNob3JkKGNob3JkOiBTY2FuQ29kZUNob3JkIHwgbnVsbCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghY2hvcmQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuaXNEdXBsaWNhdGVNb2RpZmllckNhc2UoKSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGltbXV0YWJsZUtleUNvZGUgPSBJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtjaG9yZC5zY2FuQ29kZV07XG5cdFx0aWYgKGltbXV0YWJsZUtleUNvZGUgIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdHJldHVybiBLZXlDb2RlVXRpbHMudG9Vc2VyU2V0dGluZ3NVUyhpbW11dGFibGVLZXlDb2RlKS50b0xvd2VyQ2FzZSgpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgc2NhbkNvZGUgYWx3YXlzIG1hcHMgdG8gdGhlIHNhbWUga2V5Q29kZSBhbmQgYmFja1xuXHRcdGNvbnN0IGNvbnN0YW50S2V5Q29kZTogS2V5Q29kZSA9IHRoaXMuX3NjYW5Db2RlS2V5Q29kZU1hcHBlci5ndWVzc1N0YWJsZUtleUNvZGUoY2hvcmQuc2NhbkNvZGUpO1xuXHRcdGlmIChjb25zdGFudEtleUNvZGUgIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdC8vIFZlcmlmeSB0aGF0IHRoaXMgaXMgYSBnb29kIGtleSBjb2RlIHRoYXQgY2FuIGJlIG1hcHBlZCBiYWNrIHRvIHRoZSBzYW1lIHNjYW4gY29kZVxuXHRcdFx0Y29uc3QgcmV2ZXJzZUNob3JkcyA9IHRoaXMua2V5Q29kZUNob3JkVG9TY2FuQ29kZUNob3JkKG5ldyBLZXlDb2RlQ2hvcmQoY2hvcmQuY3RybEtleSwgY2hvcmQuc2hpZnRLZXksIGNob3JkLmFsdEtleSwgY2hvcmQubWV0YUtleSwgY29uc3RhbnRLZXlDb2RlKSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmV2ZXJzZUNob3Jkcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCByZXZlcnNlQ2hvcmQgPSByZXZlcnNlQ2hvcmRzW2ldO1xuXHRcdFx0XHRpZiAocmV2ZXJzZUNob3JkLnNjYW5Db2RlID09PSBjaG9yZC5zY2FuQ29kZSkge1xuXHRcdFx0XHRcdHJldHVybiBLZXlDb2RlVXRpbHMudG9Vc2VyU2V0dGluZ3NVUyhjb25zdGFudEtleUNvZGUpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fc2NhbkNvZGVUb0Rpc3BhdGNoW2Nob3JkLnNjYW5Db2RlXTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbGVjdHJvbkFjY2VsZXJhdG9yTGFiZWxGb3JTY2FuQ29kZUNob3JkKGNob3JkOiBTY2FuQ29kZUNob3JkIHwgbnVsbCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghY2hvcmQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGltbXV0YWJsZUtleUNvZGUgPSBJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtjaG9yZC5zY2FuQ29kZV07XG5cdFx0aWYgKGltbXV0YWJsZUtleUNvZGUgIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdHJldHVybiBLZXlDb2RlVXRpbHMudG9FbGVjdHJvbkFjY2VsZXJhdG9yKGltbXV0YWJsZUtleUNvZGUpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgc2NhbkNvZGUgYWx3YXlzIG1hcHMgdG8gdGhlIHNhbWUga2V5Q29kZSBhbmQgYmFja1xuXHRcdGNvbnN0IGNvbnN0YW50S2V5Q29kZTogS2V5Q29kZSA9IHRoaXMuX3NjYW5Db2RlS2V5Q29kZU1hcHBlci5ndWVzc1N0YWJsZUtleUNvZGUoY2hvcmQuc2NhbkNvZGUpO1xuXG5cdFx0aWYgKHRoaXMuX09TID09PSBPcGVyYXRpbmdTeXN0ZW0uTGludXggJiYgIXRoaXMuX2lzVVNTdGFuZGFyZCkge1xuXHRcdFx0Ly8gW0VsZWN0cm9uIEFjY2VsZXJhdG9yc10gT24gTGludXgsIEVsZWN0cm9uIGRvZXMgbm90IGhhbmRsZSBjb3JyZWN0bHkgT0VNIGtleXMuXG5cdFx0XHQvLyB3aGVuIHVzaW5nIGEgZGlmZmVyZW50IGtleWJvYXJkIGxheW91dCB0aGFuIFVTIFN0YW5kYXJkLlxuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzcwNlxuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTM0ODkwI2lzc3VlY29tbWVudC05NDE2NzE3OTFcblx0XHRcdGNvbnN0IGlzT0VNS2V5ID0gKFxuXHRcdFx0XHRjb25zdGFudEtleUNvZGUgPT09IEtleUNvZGUuU2VtaWNvbG9uXG5cdFx0XHRcdHx8IGNvbnN0YW50S2V5Q29kZSA9PT0gS2V5Q29kZS5FcXVhbFxuXHRcdFx0XHR8fCBjb25zdGFudEtleUNvZGUgPT09IEtleUNvZGUuQ29tbWFcblx0XHRcdFx0fHwgY29uc3RhbnRLZXlDb2RlID09PSBLZXlDb2RlLk1pbnVzXG5cdFx0XHRcdHx8IGNvbnN0YW50S2V5Q29kZSA9PT0gS2V5Q29kZS5QZXJpb2Rcblx0XHRcdFx0fHwgY29uc3RhbnRLZXlDb2RlID09PSBLZXlDb2RlLlNsYXNoXG5cdFx0XHRcdHx8IGNvbnN0YW50S2V5Q29kZSA9PT0gS2V5Q29kZS5CYWNrcXVvdGVcblx0XHRcdFx0fHwgY29uc3RhbnRLZXlDb2RlID09PSBLZXlDb2RlLkJyYWNrZXRMZWZ0XG5cdFx0XHRcdHx8IGNvbnN0YW50S2V5Q29kZSA9PT0gS2V5Q29kZS5CYWNrc2xhc2hcblx0XHRcdFx0fHwgY29uc3RhbnRLZXlDb2RlID09PSBLZXlDb2RlLkJyYWNrZXRSaWdodFxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKGlzT0VNS2V5KSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjb25zdGFudEtleUNvZGUgIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdHJldHVybiBLZXlDb2RlVXRpbHMudG9FbGVjdHJvbkFjY2VsZXJhdG9yKGNvbnN0YW50S2V5Q29kZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF90b1Jlc29sdmVkS2V5YmluZGluZyhjaG9yZFBhcnRzOiBTY2FuQ29kZUNob3JkW11bXSk6IE5hdGl2ZVJlc29sdmVkS2V5YmluZGluZ1tdIHtcblx0XHRpZiAoY2hvcmRQYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmdbXSA9IFtdO1xuXHRcdHRoaXMuX2dlbmVyYXRlUmVzb2x2ZWRLZXliaW5kaW5ncyhjaG9yZFBhcnRzLCAwLCBbXSwgcmVzdWx0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2VuZXJhdGVSZXNvbHZlZEtleWJpbmRpbmdzKGNob3JkUGFydHM6IFNjYW5Db2RlQ2hvcmRbXVtdLCBjdXJyZW50SW5kZXg6IG51bWJlciwgcHJldmlvdXNQYXJ0czogU2NhbkNvZGVDaG9yZFtdLCByZXN1bHQ6IE5hdGl2ZVJlc29sdmVkS2V5YmluZGluZ1tdKSB7XG5cdFx0Y29uc3QgY2hvcmRQYXJ0ID0gY2hvcmRQYXJ0c1tjdXJyZW50SW5kZXhdO1xuXHRcdGNvbnN0IGlzRmluYWxJbmRleCA9IGN1cnJlbnRJbmRleCA9PT0gY2hvcmRQYXJ0cy5sZW5ndGggLSAxO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjaG9yZFBhcnQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGNob3JkcyA9IFsuLi5wcmV2aW91c1BhcnRzLCBjaG9yZFBhcnRbaV1dO1xuXHRcdFx0aWYgKGlzRmluYWxJbmRleCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgTmF0aXZlUmVzb2x2ZWRLZXliaW5kaW5nKHRoaXMsIHRoaXMuX09TLCBjaG9yZHMpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2dlbmVyYXRlUmVzb2x2ZWRLZXliaW5kaW5ncyhjaG9yZFBhcnRzLCBjdXJyZW50SW5kZXggKyAxLCBjaG9yZHMsIHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlc29sdmVLZXlib2FyZEV2ZW50KGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KTogTmF0aXZlUmVzb2x2ZWRLZXliaW5kaW5nIHtcblx0XHRsZXQgY29kZSA9IFNjYW5Db2RlVXRpbHMudG9FbnVtKGtleWJvYXJkRXZlbnQuY29kZSk7XG5cblx0XHQvLyBUcmVhdCBOdW1wYWRFbnRlciBhcyBFbnRlclxuXHRcdGlmIChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWRFbnRlcikge1xuXHRcdFx0Y29kZSA9IFNjYW5Db2RlLkVudGVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleUNvZGUgPSBrZXlib2FyZEV2ZW50LmtleUNvZGU7XG5cblx0XHRpZiAoXG5cdFx0XHQoa2V5Q29kZSA9PT0gS2V5Q29kZS5MZWZ0QXJyb3cpXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93KVxuXHRcdFx0fHwgKGtleUNvZGUgPT09IEtleUNvZGUuUmlnaHRBcnJvdylcblx0XHRcdHx8IChrZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvdylcblx0XHRcdHx8IChrZXlDb2RlID09PSBLZXlDb2RlLkRlbGV0ZSlcblx0XHRcdHx8IChrZXlDb2RlID09PSBLZXlDb2RlLkluc2VydClcblx0XHRcdHx8IChrZXlDb2RlID09PSBLZXlDb2RlLkhvbWUpXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5FbmQpXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5QYWdlRG93bilcblx0XHRcdHx8IChrZXlDb2RlID09PSBLZXlDb2RlLlBhZ2VVcClcblx0XHRcdHx8IChrZXlDb2RlID09PSBLZXlDb2RlLkJhY2tzcGFjZSlcblx0XHQpIHtcblx0XHRcdC8vIFwiRGlzcGF0Y2hcIiBvbiBrZXlDb2RlIGZvciB0aGVzZSBrZXkgY29kZXMgdG8gd29ya2Fyb3VuZCBpc3N1ZXMgd2l0aCByZW1vdGUgZGVza3RvcGluZyBzb2Z0d2FyZVxuXHRcdFx0Ly8gd2hlcmUgdGhlIHNjYW4gY29kZXMgYXBwZWFyIHRvIGJlIGluY29ycmVjdCAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNDEwNylcblx0XHRcdGNvbnN0IGltbXV0YWJsZVNjYW5Db2RlID0gSU1NVVRBQkxFX0tFWV9DT0RFX1RPX0NPREVba2V5Q29kZV07XG5cdFx0XHRpZiAoaW1tdXRhYmxlU2NhbkNvZGUgIT09IFNjYW5Db2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRcdGNvZGUgPSBpbW11dGFibGVTY2FuQ29kZTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdGlmIChcblx0XHRcdFx0KGNvZGUgPT09IFNjYW5Db2RlLk51bXBhZDEpXG5cdFx0XHRcdHx8IChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWQyKVxuXHRcdFx0XHR8fCAoY29kZSA9PT0gU2NhbkNvZGUuTnVtcGFkMylcblx0XHRcdFx0fHwgKGNvZGUgPT09IFNjYW5Db2RlLk51bXBhZDQpXG5cdFx0XHRcdHx8IChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWQ1KVxuXHRcdFx0XHR8fCAoY29kZSA9PT0gU2NhbkNvZGUuTnVtcGFkNilcblx0XHRcdFx0fHwgKGNvZGUgPT09IFNjYW5Db2RlLk51bXBhZDcpXG5cdFx0XHRcdHx8IChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWQ4KVxuXHRcdFx0XHR8fCAoY29kZSA9PT0gU2NhbkNvZGUuTnVtcGFkOSlcblx0XHRcdFx0fHwgKGNvZGUgPT09IFNjYW5Db2RlLk51bXBhZDApXG5cdFx0XHRcdHx8IChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWREZWNpbWFsKVxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIFwiRGlzcGF0Y2hcIiBvbiBrZXlDb2RlIGZvciBhbGwgbnVtcGFkIGtleXMgaW4gb3JkZXIgZm9yIE51bUxvY2sgdG8gd29yayBjb3JyZWN0bHlcblx0XHRcdFx0aWYgKGtleUNvZGUgPj0gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGltbXV0YWJsZVNjYW5Db2RlID0gSU1NVVRBQkxFX0tFWV9DT0RFX1RPX0NPREVba2V5Q29kZV07XG5cdFx0XHRcdFx0aWYgKGltbXV0YWJsZVNjYW5Db2RlICE9PSBTY2FuQ29kZS5EZXBlbmRzT25LYkxheW91dCkge1xuXHRcdFx0XHRcdFx0Y29kZSA9IGltbXV0YWJsZVNjYW5Db2RlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGN0cmxLZXkgPSBrZXlib2FyZEV2ZW50LmN0cmxLZXkgfHwgKHRoaXMuX21hcEFsdEdyVG9DdHJsQWx0ICYmIGtleWJvYXJkRXZlbnQuYWx0R3JhcGhLZXkpO1xuXHRcdGNvbnN0IGFsdEtleSA9IGtleWJvYXJkRXZlbnQuYWx0S2V5IHx8ICh0aGlzLl9tYXBBbHRHclRvQ3RybEFsdCAmJiBrZXlib2FyZEV2ZW50LmFsdEdyYXBoS2V5KTtcblx0XHRjb25zdCBjaG9yZCA9IG5ldyBTY2FuQ29kZUNob3JkKGN0cmxLZXksIGtleWJvYXJkRXZlbnQuc2hpZnRLZXksIGFsdEtleSwga2V5Ym9hcmRFdmVudC5tZXRhS2V5LCBjb2RlKTtcblx0XHRyZXR1cm4gbmV3IE5hdGl2ZVJlc29sdmVkS2V5YmluZGluZyh0aGlzLCB0aGlzLl9PUywgW2Nob3JkXSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlQ2hvcmQoY2hvcmQ6IENob3JkIHwgbnVsbCk6IFNjYW5Db2RlQ2hvcmRbXSB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQgaW5zdGFuY2VvZiBTY2FuQ29kZUNob3JkKSB7XG5cdFx0XHRyZXR1cm4gW2Nob3JkXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMua2V5Q29kZUNob3JkVG9TY2FuQ29kZUNob3JkKGNob3JkKTtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlS2V5YmluZGluZyhrZXliaW5kaW5nOiBLZXliaW5kaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW10ge1xuXHRcdGNvbnN0IGNob3JkczogU2NhbkNvZGVDaG9yZFtdW10gPSBrZXliaW5kaW5nLmNob3Jkcy5tYXAoY2hvcmQgPT4gdGhpcy5fcmVzb2x2ZUNob3JkKGNob3JkKSk7XG5cdFx0cmV0dXJuIHRoaXMuX3RvUmVzb2x2ZWRLZXliaW5kaW5nKGNob3Jkcyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVkaXJlY3RDaGFyQ29kZShjaGFyQ29kZTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRzd2l0Y2ggKGNoYXJDb2RlKSB7XG5cdFx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHRcdC8vIENKSzogXHUzMDAyIFx1MzAwQyBcdTMwMEQgXHUzMDEwIFx1MzAxMSBcdUZGMUIgXHVGRjBDXG5cdFx0XHQvLyBtYXA6IC4gWyBdIFsgXSA7ICxcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9JREVPR1JBUEhJQ19GVUxMX1NUT1A6IHJldHVybiBDaGFyQ29kZS5QZXJpb2Q7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfTEVGVF9DT1JORVJfQlJBQ0tFVDogcmV0dXJuIENoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0O1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX1JJR0hUX0NPUk5FUl9CUkFDS0VUOiByZXR1cm4gQ2hhckNvZGUuQ2xvc2VTcXVhcmVCcmFja2V0O1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0xFRlRfQkxBQ0tfTEVOVElDVUxBUl9CUkFDS0VUOiByZXR1cm4gQ2hhckNvZGUuT3BlblNxdWFyZUJyYWNrZXQ7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfUklHSFRfQkxBQ0tfTEVOVElDVUxBUl9CUkFDS0VUOiByZXR1cm4gQ2hhckNvZGUuQ2xvc2VTcXVhcmVCcmFja2V0O1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0ZVTExXSURUSF9TRU1JQ09MT046IHJldHVybiBDaGFyQ29kZS5TZW1pY29sb247XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfRlVMTFdJRFRIX0NPTU1BOiByZXR1cm4gQ2hhckNvZGUuQ29tbWE7XG5cdFx0fVxuXHRcdHJldHVybiBjaGFyQ29kZTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jaGFyQ29kZVRvS2IoY2hhckNvZGU6IG51bWJlcik6IHsga2V5Q29kZTogS2V5Q29kZTsgc2hpZnRLZXk6IGJvb2xlYW4gfSB8IG51bGwge1xuXHRcdGNoYXJDb2RlID0gdGhpcy5fcmVkaXJlY3RDaGFyQ29kZShjaGFyQ29kZSk7XG5cdFx0aWYgKGNoYXJDb2RlIDwgQ0hBUl9DT0RFX1RPX0tFWV9DT0RFLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIENIQVJfQ09ERV9UT19LRVlfQ09ERVtjaGFyQ29kZV07XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF0dGVtcHQgdG8gbWFwIGEgY29tYmluaW5nIGNoYXJhY3RlciB0byBhIHJlZ3VsYXIgb25lIHRoYXQgcmVuZGVycyB0aGUgc2FtZSB3YXkuXG5cdCAqXG5cdCAqIGh0dHBzOi8vd3d3LmNvbXBhcnQuY29tL2VuL3VuaWNvZGUvYmlkaWNsYXNzL05TTVxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBnZXRDaGFyQ29kZShjaGFyOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGlmIChjaGFyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXJDb2RlID0gY2hhci5jaGFyQ29kZUF0KDApO1xuXHRcdHN3aXRjaCAoY2hhckNvZGUpIHtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfR3JhdmVfQWNjZW50OiByZXR1cm4gQ2hhckNvZGUuVV9HUkFWRV9BQ0NFTlQ7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfQ29tYmluaW5nX0FjdXRlX0FjY2VudDogcmV0dXJuIENoYXJDb2RlLlVfQUNVVEVfQUNDRU5UO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0NvbWJpbmluZ19DaXJjdW1mbGV4X0FjY2VudDogcmV0dXJuIENoYXJDb2RlLlVfQ0lSQ1VNRkxFWDtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfVGlsZGU6IHJldHVybiBDaGFyQ29kZS5VX1NNQUxMX1RJTERFO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0NvbWJpbmluZ19NYWNyb246IHJldHVybiBDaGFyQ29kZS5VX01BQ1JPTjtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfT3ZlcmxpbmU6IHJldHVybiBDaGFyQ29kZS5VX09WRVJMSU5FO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0NvbWJpbmluZ19CcmV2ZTogcmV0dXJuIENoYXJDb2RlLlVfQlJFVkU7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfQ29tYmluaW5nX0RvdF9BYm92ZTogcmV0dXJuIENoYXJDb2RlLlVfRE9UX0FCT1ZFO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0NvbWJpbmluZ19EaWFlcmVzaXM6IHJldHVybiBDaGFyQ29kZS5VX0RJQUVSRVNJUztcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfUmluZ19BYm92ZTogcmV0dXJuIENoYXJDb2RlLlVfUklOR19BQk9WRTtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfRG91YmxlX0FjdXRlX0FjY2VudDogcmV0dXJuIENoYXJDb2RlLlVfRE9VQkxFX0FDVVRFX0FDQ0VOVDtcblx0XHR9XG5cdFx0cmV0dXJuIGNoYXJDb2RlO1xuXHR9XG59XG5cbihmdW5jdGlvbiAoKSB7XG5cdGZ1bmN0aW9uIGRlZmluZShjaGFyQ29kZTogbnVtYmVyLCBrZXlDb2RlOiBLZXlDb2RlLCBzaGlmdEtleTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGZvciAobGV0IGkgPSBDSEFSX0NPREVfVE9fS0VZX0NPREUubGVuZ3RoOyBpIDwgY2hhckNvZGU7IGkrKykge1xuXHRcdFx0Q0hBUl9DT0RFX1RPX0tFWV9DT0RFW2ldID0gbnVsbDtcblx0XHR9XG5cdFx0Q0hBUl9DT0RFX1RPX0tFWV9DT0RFW2NoYXJDb2RlXSA9IHsga2V5Q29kZToga2V5Q29kZSwgc2hpZnRLZXk6IHNoaWZ0S2V5IH07XG5cdH1cblxuXHRmb3IgKGxldCBjaENvZGUgPSBDaGFyQ29kZS5BOyBjaENvZGUgPD0gQ2hhckNvZGUuWjsgY2hDb2RlKyspIHtcblx0XHRkZWZpbmUoY2hDb2RlLCBLZXlDb2RlLktleUEgKyAoY2hDb2RlIC0gQ2hhckNvZGUuQSksIHRydWUpO1xuXHR9XG5cblx0Zm9yIChsZXQgY2hDb2RlID0gQ2hhckNvZGUuYTsgY2hDb2RlIDw9IENoYXJDb2RlLno7IGNoQ29kZSsrKSB7XG5cdFx0ZGVmaW5lKGNoQ29kZSwgS2V5Q29kZS5LZXlBICsgKGNoQ29kZSAtIENoYXJDb2RlLmEpLCBmYWxzZSk7XG5cdH1cblxuXHRkZWZpbmUoQ2hhckNvZGUuU2VtaWNvbG9uLCBLZXlDb2RlLlNlbWljb2xvbiwgZmFsc2UpO1xuXHRkZWZpbmUoQ2hhckNvZGUuQ29sb24sIEtleUNvZGUuU2VtaWNvbG9uLCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuRXF1YWxzLCBLZXlDb2RlLkVxdWFsLCBmYWxzZSk7XG5cdGRlZmluZShDaGFyQ29kZS5QbHVzLCBLZXlDb2RlLkVxdWFsLCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuQ29tbWEsIEtleUNvZGUuQ29tbWEsIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLkxlc3NUaGFuLCBLZXlDb2RlLkNvbW1hLCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuRGFzaCwgS2V5Q29kZS5NaW51cywgZmFsc2UpO1xuXHRkZWZpbmUoQ2hhckNvZGUuVW5kZXJsaW5lLCBLZXlDb2RlLk1pbnVzLCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuUGVyaW9kLCBLZXlDb2RlLlBlcmlvZCwgZmFsc2UpO1xuXHRkZWZpbmUoQ2hhckNvZGUuR3JlYXRlclRoYW4sIEtleUNvZGUuUGVyaW9kLCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuU2xhc2gsIEtleUNvZGUuU2xhc2gsIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLlF1ZXN0aW9uTWFyaywgS2V5Q29kZS5TbGFzaCwgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLkJhY2tUaWNrLCBLZXlDb2RlLkJhY2txdW90ZSwgZmFsc2UpO1xuXHRkZWZpbmUoQ2hhckNvZGUuVGlsZGUsIEtleUNvZGUuQmFja3F1b3RlLCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuT3BlblNxdWFyZUJyYWNrZXQsIEtleUNvZGUuQnJhY2tldExlZnQsIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLk9wZW5DdXJseUJyYWNlLCBLZXlDb2RlLkJyYWNrZXRMZWZ0LCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuQmFja3NsYXNoLCBLZXlDb2RlLkJhY2tzbGFzaCwgZmFsc2UpO1xuXHRkZWZpbmUoQ2hhckNvZGUuUGlwZSwgS2V5Q29kZS5CYWNrc2xhc2gsIHRydWUpO1xuXG5cdGRlZmluZShDaGFyQ29kZS5DbG9zZVNxdWFyZUJyYWNrZXQsIEtleUNvZGUuQnJhY2tldFJpZ2h0LCBmYWxzZSk7XG5cdGRlZmluZShDaGFyQ29kZS5DbG9zZUN1cmx5QnJhY2UsIEtleUNvZGUuQnJhY2tldFJpZ2h0LCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuU2luZ2xlUXVvdGUsIEtleUNvZGUuUXVvdGUsIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLkRvdWJsZVF1b3RlLCBLZXlDb2RlLlF1b3RlLCB0cnVlKTtcbn0pKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsY0FBYyw0QkFBNEIsNEJBQTRCLFVBQVUsZUFBZSxxQkFBcUI7QUFDdEksU0FBNkIsY0FBbUMscUJBQXdDO0FBQ3hHLFNBQVMsdUJBQXVCO0FBR2hDLFNBQVMsOEJBQThCO0FBU3ZDLE1BQU0sd0JBQTRFLENBQUM7QUFFNUUsTUFBTSxpQ0FBaUMsdUJBQXNDO0FBQUEsRUFJbkYsWUFBWSxRQUFnQyxJQUFxQixRQUF5QjtBQUN6RixVQUFNLElBQUksTUFBTTtBQUNoQixTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUFBLEVBRVUsVUFBVSxPQUFxQztBQUN4RCxXQUFPLEtBQUssUUFBUSwyQkFBMkIsS0FBSztBQUFBLEVBQ3JEO0FBQUEsRUFFVSxjQUFjLE9BQXFDO0FBQzVELFdBQU8sS0FBSyxRQUFRLDZCQUE2QixLQUFLO0FBQUEsRUFDdkQ7QUFBQSxFQUVVLHdCQUF3QixPQUFxQztBQUN0RSxXQUFPLEtBQUssUUFBUSw0Q0FBNEMsS0FBSztBQUFBLEVBQ3RFO0FBQUEsRUFFVSxzQkFBc0IsT0FBcUM7QUFDcEUsV0FBTyxLQUFLLFFBQVEscUNBQXFDLEtBQUs7QUFBQSxFQUMvRDtBQUFBLEVBRVUsV0FBVyxTQUF3QztBQUM1RCxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSwyQkFBMkIsUUFBUSxRQUFRLE1BQU0sUUFBUSxtQkFBbUI7QUFDL0UsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLElBQUksS0FBSyxRQUFRLDZCQUE2QixPQUFPO0FBQzNELFVBQU0sSUFBSSxLQUFLLFFBQVEscUNBQXFDLE9BQU87QUFFbkUsUUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFD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LEdBQUcsR0FBRyxHQUFHLE9BQU87QUFDdEQsMkJBQW1CLEdBQUcsR0FBRyxHQUFHLFVBQVUsR0FBRyxHQUFHLEdBQUcsT0FBTztBQUN0RCwyQkFBbUIsR0FBRyxHQUFHLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxPQUFPO0FBQ3RELDJCQUFtQixHQUFHLEdBQUcsR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLE9BQU87QUFBQSxNQUN2RCxPQUFPO0FBRU4sMkJBQW1CLEdBQUcsR0FBRyxHQUFHLFVBQVUsR0FBRyxHQUFHLEdBQUcsT0FBTztBQUN0RCwyQkFBbUIsR0FBRyxHQUFHLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxPQUFPO0FBQ3RELDJCQUFtQixHQUFHLEdBQUcsR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLE9BQU87QUFDdEQsMkJBQW1CLEdBQUcsR0FBRyxHQUFHLFVBQVUsR0FBRyxHQUFHLEdBQUcsT0FBTztBQUN0RCwyQkFBbUIsR0FBRyxHQUFHLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxPQUFPO0FBQ3RELDJCQUFtQixHQUFHLEdBQUcsR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLE9BQU87QUFDdEQsMkJBQW1CLEdBQUcsR0FBRyxHQUFHLFVBQVUsR0FBRyxHQUFHLEdBQUcsT0FBTztBQUN0RCwyQkFBbUIsR0FBRyxHQUFHLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxPQUFPO0FBQUEsTUFDdkQ7QUFBQSxJQUNEO0FBRUEsdUJBQW1CLEdBQUcsR0FBRyxHQUFHLFNBQVMsUUFBUSxRQUFRLE1BQU07QUFDM0QsdUJBQW1CLEdBQUcsR0FBRyxHQUFHLFNBQVMsUUFBUSxRQUFRLE1BQU07QUFDM0QsdUJBQW1CLEdBQUcsR0FBRyxHQUFHLFNBQVMsUUFBUSxRQUFRLE1BQU07QUFDM0QsdUJBQW1CLEdBQUcsR0FBRyxHQUFHLFNBQVMsUUFBUSxRQUFRLE1BQU07QUFDM0QsdUJBQW1CLEdBQUcsR0FBRyxHQUFHLFNBQVMsUUFBUSxRQUFRLE1BQU07QUFDM0QsdUJBQW1CLEdBQUcsR0FB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
