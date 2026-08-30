import assert from "assert";
import { KeyChord, KeyCode, KeyMod, ScanCode, ScanCodeUtils } from "../../../../../base/common/keyCodes.js";
import { KeyCodeChord, decodeKeybinding, createSimpleKeybinding, ScanCodeChord, Keybinding } from "../../../../../base/common/keybindings.js";
import { UserSettingsLabelProvider } from "../../../../../base/common/keybindingLabels.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { USLayoutResolvedKeybinding } from "../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js";
import { MacLinuxKeyboardMapper } from "../../common/macLinuxKeyboardMapper.js";
import { assertMapping, assertResolveKeyboardEvent, assertResolveKeybinding, readRawMapping } from "./keyboardMapperTestUtils.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const WRITE_FILE_IF_DIFFERENT = false;
async function createKeyboardMapper(isUSStandard, file, mapAltGrToCtrlAlt, OS) {
  const rawMappings = await readRawMapping(file);
  return new MacLinuxKeyboardMapper(isUSStandard, rawMappings, mapAltGrToCtrlAlt, OS);
}
suite("keyboardMapper - MAC de_ch", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    const _mapper = await createKeyboardMapper(false, "mac_de_ch", false, OperatingSystem.Macintosh);
    mapper = _mapper;
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "mac_de_ch.txt");
  });
  function assertKeybindingTranslation(kb, expected) {
    _assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, expected);
  }
  function _assertResolveKeybinding(k, expected) {
    assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Macintosh), expected);
  }
  test("kb => hw", () => {
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Digit1, "cmd+Digit1");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyB, "cmd+KeyB");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB, "shift+cmd+KeyB");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyB, "ctrl+shift+alt+cmd+KeyB");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyZ, "cmd+KeyY");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyY, "cmd+KeyZ");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Slash, "shift+cmd+Digit7");
  });
  test("resolveKeybinding Cmd+A", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyA,
      [{
        label: "\u2318A",
        ariaLabel: "Command+A",
        electronAccelerator: "Cmd+A",
        userSettingsLabel: "cmd+a",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[KeyA]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Cmd+B", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyB,
      [{
        label: "\u2318B",
        ariaLabel: "Command+B",
        electronAccelerator: "Cmd+B",
        userSettingsLabel: "cmd+b",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[KeyB]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Cmd+Z", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyZ,
      [{
        label: "\u2318Z",
        ariaLabel: "Command+Z",
        electronAccelerator: "Cmd+Z",
        userSettingsLabel: "cmd+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[KeyY]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Cmd+[KeyY]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "KeyY"
      },
      {
        label: "\u2318Z",
        ariaLabel: "Command+Z",
        electronAccelerator: "Cmd+Z",
        userSettingsLabel: "cmd+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[KeyY]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Cmd+]", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.BracketRight,
      [{
        label: "\u2303\u2325\u23186",
        ariaLabel: "Control+Option+Command+6",
        electronAccelerator: "Ctrl+Alt+Cmd+6",
        userSettingsLabel: "ctrl+alt+cmd+6",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+alt+meta+[Digit6]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Cmd+[BracketRight]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "BracketRight"
      },
      {
        label: "\u2318\xA8",
        ariaLabel: "Command+\xA8",
        electronAccelerator: null,
        userSettingsLabel: "cmd+[BracketRight]",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["meta+[BracketRight]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Shift+]", () => {
    _assertResolveKeybinding(
      KeyMod.Shift | KeyCode.BracketRight,
      [{
        label: "\u2303\u23259",
        ariaLabel: "Control+Option+9",
        electronAccelerator: "Ctrl+Alt+9",
        userSettingsLabel: "ctrl+alt+9",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+alt+[Digit9]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Cmd+/", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Slash,
      [{
        label: "\u21E7\u23187",
        ariaLabel: "Shift+Command+7",
        electronAccelerator: "Shift+Cmd+7",
        userSettingsLabel: "shift+cmd+7",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["shift+meta+[Digit7]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Cmd+Shift+/", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
      [{
        label: "\u21E7\u2318'",
        ariaLabel: "Shift+Command+'",
        electronAccelerator: null,
        userSettingsLabel: "shift+cmd+[Minus]",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["shift+meta+[Minus]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Cmd+K Cmd+\\", () => {
    _assertResolveKeybinding(
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
      [{
        label: "\u2318K \u2303\u21E7\u2325\u23187",
        ariaLabel: "Command+K Control+Shift+Option+Command+7",
        electronAccelerator: null,
        userSettingsLabel: "cmd+k ctrl+shift+alt+cmd+7",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["meta+[KeyK]", "ctrl+shift+alt+meta+[Digit7]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeybinding Cmd+K Cmd+=", () => {
    _assertResolveKeybinding(
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
      [{
        label: "\u2318K \u21E7\u23180",
        ariaLabel: "Command+K Shift+Command+0",
        electronAccelerator: null,
        userSettingsLabel: "cmd+k shift+cmd+0",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["meta+[KeyK]", "shift+meta+[Digit0]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeybinding Cmd+DownArrow", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.DownArrow,
      [{
        label: "\u2318\u2193",
        ariaLabel: "Command+DownArrow",
        electronAccelerator: "Cmd+Down",
        userSettingsLabel: "cmd+down",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[ArrowDown]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Cmd+NUMPAD_0", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Numpad0,
      [{
        label: "\u2318NumPad0",
        ariaLabel: "Command+NumPad0",
        electronAccelerator: null,
        userSettingsLabel: "cmd+numpad0",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[Numpad0]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Home", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Home,
      [{
        label: "\u2318Home",
        ariaLabel: "Command+Home",
        electronAccelerator: "Cmd+Home",
        userSettingsLabel: "cmd+home",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[Home]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+[Home]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "Home"
      },
      {
        label: "\u2318Home",
        ariaLabel: "Command+Home",
        electronAccelerator: "Cmd+Home",
        userSettingsLabel: "cmd+home",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[Home]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveUserBinding Cmd+[Comma] Cmd+/", () => {
    assertResolveKeybinding(
      mapper,
      new Keybinding([
        new ScanCodeChord(false, false, false, true, ScanCode.Comma),
        new KeyCodeChord(false, false, false, true, KeyCode.Slash)
      ]),
      [{
        label: "\u2318, \u21E7\u23187",
        ariaLabel: "Command+, Shift+Command+7",
        electronAccelerator: null,
        userSettingsLabel: "cmd+[Comma] shift+cmd+7",
        isWYSIWYG: false,
        isMultiChord: true,
        dispatchParts: ["meta+[Comma]", "shift+meta+[Digit7]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeyboardEvent Single Modifier MetaLeft+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "MetaLeft"
      },
      {
        label: "\u2318",
        ariaLabel: "Command",
        electronAccelerator: null,
        userSettingsLabel: "cmd",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["meta"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier MetaRight+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "MetaRight"
      },
      {
        label: "\u2318",
        ariaLabel: "Command",
        electronAccelerator: null,
        userSettingsLabel: "cmd",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["meta"]
      }
    );
  });
});
suite("keyboardMapper - MAC en_us", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    const _mapper = await createKeyboardMapper(true, "mac_en_us", false, OperatingSystem.Macintosh);
    mapper = _mapper;
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "mac_en_us.txt");
  });
  test("resolveUserBinding Cmd+[Comma] Cmd+/", () => {
    assertResolveKeybinding(
      mapper,
      new Keybinding([
        new ScanCodeChord(false, false, false, true, ScanCode.Comma),
        new KeyCodeChord(false, false, false, true, KeyCode.Slash)
      ]),
      [{
        label: "\u2318, \u2318/",
        ariaLabel: "Command+, Command+/",
        electronAccelerator: null,
        userSettingsLabel: "cmd+, cmd+/",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["meta+[Comma]", "meta+[Slash]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeyboardEvent Single Modifier MetaLeft+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "MetaLeft"
      },
      {
        label: "\u2318",
        ariaLabel: "Command",
        electronAccelerator: null,
        userSettingsLabel: "cmd",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["meta"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier MetaRight+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "MetaRight"
      },
      {
        label: "\u2318",
        ariaLabel: "Command",
        electronAccelerator: null,
        userSettingsLabel: "cmd",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["meta"]
      }
    );
  });
  test("resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z", async () => {
    const mapper2 = await createKeyboardMapper(true, "mac_en_us", true, OperatingSystem.Macintosh);
    assertResolveKeyboardEvent(
      mapper2,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: true,
        keyCode: -1,
        code: "KeyZ"
      },
      {
        label: "\u2303\u2325Z",
        ariaLabel: "Control+Option+Z",
        electronAccelerator: "Ctrl+Alt+Z",
        userSettingsLabel: "ctrl+alt+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+alt+[KeyZ]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
});
suite("keyboardMapper - LINUX de_ch", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    const _mapper = await createKeyboardMapper(false, "linux_de_ch", false, OperatingSystem.Linux);
    mapper = _mapper;
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "linux_de_ch.txt");
  });
  function assertKeybindingTranslation(kb, expected) {
    _assertKeybindingTranslation(mapper, OperatingSystem.Linux, kb, expected);
  }
  function _assertResolveKeybinding(k, expected) {
    assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux), expected);
  }
  test("kb => hw", () => {
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Digit1, "ctrl+Digit1");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyB, "ctrl+KeyB");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB, "ctrl+shift+KeyB");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyB, "ctrl+shift+alt+meta+KeyB");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyZ, "ctrl+KeyY");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyY, "ctrl+KeyZ");
    assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Slash, "ctrl+shift+Digit7");
  });
  test("resolveKeybinding Ctrl+A", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyA,
      [{
        label: "Ctrl+A",
        ariaLabel: "Control+A",
        electronAccelerator: "Ctrl+A",
        userSettingsLabel: "ctrl+a",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[KeyA]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Z", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyZ,
      [{
        label: "Ctrl+Z",
        ariaLabel: "Control+Z",
        electronAccelerator: "Ctrl+Z",
        userSettingsLabel: "ctrl+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[KeyY]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+[KeyY]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "KeyY"
      },
      {
        label: "Ctrl+Z",
        ariaLabel: "Control+Z",
        electronAccelerator: "Ctrl+Z",
        userSettingsLabel: "ctrl+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[KeyY]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Ctrl+]", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.BracketRight,
      []
    );
  });
  test("resolveKeyboardEvent Ctrl+[BracketRight]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "BracketRight"
      },
      {
        label: "Ctrl+\xA8",
        ariaLabel: "Control+\xA8",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+[BracketRight]",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+[BracketRight]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Shift+]", () => {
    _assertResolveKeybinding(
      KeyMod.Shift | KeyCode.BracketRight,
      [{
        label: "Ctrl+Alt+0",
        ariaLabel: "Control+Alt+0",
        electronAccelerator: "Ctrl+Alt+0",
        userSettingsLabel: "ctrl+alt+0",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+alt+[Digit0]"],
        singleModifierDispatchParts: [null]
      }, {
        label: "Ctrl+Alt+$",
        ariaLabel: "Control+Alt+$",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+alt+[Backslash]",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+alt+[Backslash]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+/", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Slash,
      [{
        label: "Ctrl+Shift+7",
        ariaLabel: "Control+Shift+7",
        electronAccelerator: "Ctrl+Shift+7",
        userSettingsLabel: "ctrl+shift+7",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+shift+[Digit7]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Shift+/", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
      [{
        label: "Ctrl+Shift+'",
        ariaLabel: "Control+Shift+'",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+shift+[Minus]",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+shift+[Minus]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+K Ctrl+\\", () => {
    _assertResolveKeybinding(
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
      []
    );
  });
  test("resolveKeybinding Ctrl+K Ctrl+=", () => {
    _assertResolveKeybinding(
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
      [{
        label: "Ctrl+K Ctrl+Shift+0",
        ariaLabel: "Control+K Control+Shift+0",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+k ctrl+shift+0",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["ctrl+[KeyK]", "ctrl+shift+[Digit0]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+DownArrow", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.DownArrow,
      [{
        label: "Ctrl+DownArrow",
        ariaLabel: "Control+DownArrow",
        electronAccelerator: "Ctrl+Down",
        userSettingsLabel: "ctrl+down",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[ArrowDown]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+NUMPAD_0", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Numpad0,
      [{
        label: "Ctrl+NumPad0",
        ariaLabel: "Control+NumPad0",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+numpad0",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Numpad0]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Home", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Home,
      [{
        label: "Ctrl+Home",
        ariaLabel: "Control+Home",
        electronAccelerator: "Ctrl+Home",
        userSettingsLabel: "ctrl+home",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Home]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+[Home]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "Home"
      },
      {
        label: "Ctrl+Home",
        ariaLabel: "Control+Home",
        electronAccelerator: "Ctrl+Home",
        userSettingsLabel: "ctrl+home",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Home]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeyboardEvent Ctrl+[KeyX]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "KeyX"
      },
      {
        label: "Ctrl+X",
        ariaLabel: "Control+X",
        electronAccelerator: "Ctrl+X",
        userSettingsLabel: "ctrl+x",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[KeyX]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveUserBinding Ctrl+[Comma] Ctrl+/", () => {
    assertResolveKeybinding(
      mapper,
      new Keybinding([
        new ScanCodeChord(true, false, false, false, ScanCode.Comma),
        new KeyCodeChord(true, false, false, false, KeyCode.Slash)
      ]),
      [{
        label: "Ctrl+, Ctrl+Shift+7",
        ariaLabel: "Control+, Control+Shift+7",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+[Comma] ctrl+shift+7",
        isWYSIWYG: false,
        isMultiChord: true,
        dispatchParts: ["ctrl+[Comma]", "ctrl+shift+[Digit7]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeyboardEvent Single Modifier ControlLeft+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "ControlLeft"
      },
      {
        label: "Ctrl",
        ariaLabel: "Control",
        electronAccelerator: null,
        userSettingsLabel: "ctrl",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["ctrl"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier ControlRight+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "ControlRight"
      },
      {
        label: "Ctrl",
        ariaLabel: "Control",
        electronAccelerator: null,
        userSettingsLabel: "ctrl",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["ctrl"]
      }
    );
  });
});
suite("keyboardMapper - LINUX en_us", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    const _mapper = await createKeyboardMapper(true, "linux_en_us", false, OperatingSystem.Linux);
    mapper = _mapper;
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "linux_en_us.txt");
  });
  function _assertResolveKeybinding(k, expected) {
    assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux), expected);
  }
  test("resolveKeybinding Ctrl+A", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyA,
      [{
        label: "Ctrl+A",
        ariaLabel: "Control+A",
        electronAccelerator: "Ctrl+A",
        userSettingsLabel: "ctrl+a",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[KeyA]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Z", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyZ,
      [{
        label: "Ctrl+Z",
        ariaLabel: "Control+Z",
        electronAccelerator: "Ctrl+Z",
        userSettingsLabel: "ctrl+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[KeyZ]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+[KeyZ]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "KeyZ"
      },
      {
        label: "Ctrl+Z",
        ariaLabel: "Control+Z",
        electronAccelerator: "Ctrl+Z",
        userSettingsLabel: "ctrl+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[KeyZ]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Ctrl+]", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.BracketRight,
      [{
        label: "Ctrl+]",
        ariaLabel: "Control+]",
        electronAccelerator: "Ctrl+]",
        userSettingsLabel: "ctrl+]",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[BracketRight]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+[BracketRight]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "BracketRight"
      },
      {
        label: "Ctrl+]",
        ariaLabel: "Control+]",
        electronAccelerator: "Ctrl+]",
        userSettingsLabel: "ctrl+]",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[BracketRight]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Shift+]", () => {
    _assertResolveKeybinding(
      KeyMod.Shift | KeyCode.BracketRight,
      [{
        label: "Shift+]",
        ariaLabel: "Shift+]",
        electronAccelerator: "Shift+]",
        userSettingsLabel: "shift+]",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["shift+[BracketRight]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+/", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Slash,
      [{
        label: "Ctrl+/",
        ariaLabel: "Control+/",
        electronAccelerator: "Ctrl+/",
        userSettingsLabel: "ctrl+/",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Slash]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Shift+/", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
      [{
        label: "Ctrl+Shift+/",
        ariaLabel: "Control+Shift+/",
        electronAccelerator: "Ctrl+Shift+/",
        userSettingsLabel: "ctrl+shift+/",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+shift+[Slash]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+K Ctrl+\\", () => {
    _assertResolveKeybinding(
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
      [{
        label: "Ctrl+K Ctrl+\\",
        ariaLabel: "Control+K Control+\\",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+k ctrl+\\",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["ctrl+[KeyK]", "ctrl+[Backslash]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+K Ctrl+=", () => {
    _assertResolveKeybinding(
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
      [{
        label: "Ctrl+K Ctrl+=",
        ariaLabel: "Control+K Control+=",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+k ctrl+=",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["ctrl+[KeyK]", "ctrl+[Equal]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+DownArrow", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.DownArrow,
      [{
        label: "Ctrl+DownArrow",
        ariaLabel: "Control+DownArrow",
        electronAccelerator: "Ctrl+Down",
        userSettingsLabel: "ctrl+down",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[ArrowDown]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+NUMPAD_0", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Numpad0,
      [{
        label: "Ctrl+NumPad0",
        ariaLabel: "Control+NumPad0",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+numpad0",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Numpad0]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Home", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Home,
      [{
        label: "Ctrl+Home",
        ariaLabel: "Control+Home",
        electronAccelerator: "Ctrl+Home",
        userSettingsLabel: "ctrl+home",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Home]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+[Home]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "Home"
      },
      {
        label: "Ctrl+Home",
        ariaLabel: "Control+Home",
        electronAccelerator: "Ctrl+Home",
        userSettingsLabel: "ctrl+home",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Home]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Ctrl+Shift+,", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Comma,
      [{
        label: "Ctrl+Shift+,",
        ariaLabel: "Control+Shift+,",
        electronAccelerator: "Ctrl+Shift+,",
        userSettingsLabel: "ctrl+shift+,",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+shift+[Comma]"],
        singleModifierDispatchParts: [null]
      }, {
        label: "Ctrl+<",
        ariaLabel: "Control+<",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+[IntlBackslash]",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+[IntlBackslash]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("issue #23393: resolveKeybinding Ctrl+Enter", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.Enter,
      [{
        label: "Ctrl+Enter",
        ariaLabel: "Control+Enter",
        electronAccelerator: "Ctrl+Enter",
        userSettingsLabel: "ctrl+enter",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Enter]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("issue #23393: resolveKeyboardEvent Ctrl+[NumpadEnter]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "NumpadEnter"
      },
      {
        label: "Ctrl+Enter",
        ariaLabel: "Control+Enter",
        electronAccelerator: "Ctrl+Enter",
        userSettingsLabel: "ctrl+enter",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Enter]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveUserBinding Ctrl+[Comma] Ctrl+/", () => {
    assertResolveKeybinding(
      mapper,
      new Keybinding([
        new ScanCodeChord(true, false, false, false, ScanCode.Comma),
        new KeyCodeChord(true, false, false, false, KeyCode.Slash)
      ]),
      [{
        label: "Ctrl+, Ctrl+/",
        ariaLabel: "Control+, Control+/",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+, ctrl+/",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["ctrl+[Comma]", "ctrl+[Slash]"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveUserBinding Ctrl+[Comma]", () => {
    assertResolveKeybinding(
      mapper,
      new Keybinding([
        new ScanCodeChord(true, false, false, false, ScanCode.Comma)
      ]),
      [{
        label: "Ctrl+,",
        ariaLabel: "Control+,",
        electronAccelerator: "Ctrl+,",
        userSettingsLabel: "ctrl+,",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Comma]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Single Modifier ControlLeft+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "ControlLeft"
      },
      {
        label: "Ctrl",
        ariaLabel: "Control",
        electronAccelerator: null,
        userSettingsLabel: "ctrl",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["ctrl"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier ControlRight+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "ControlRight"
      },
      {
        label: "Ctrl",
        ariaLabel: "Control",
        electronAccelerator: null,
        userSettingsLabel: "ctrl",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["ctrl"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier ShiftLeft+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "ShiftLeft"
      },
      {
        label: "Shift",
        ariaLabel: "Shift",
        electronAccelerator: null,
        userSettingsLabel: "shift",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["shift"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier ShiftRight+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "ShiftRight"
      },
      {
        label: "Shift",
        ariaLabel: "Shift",
        electronAccelerator: null,
        userSettingsLabel: "shift",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["shift"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier AltLeft+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "AltLeft"
      },
      {
        label: "Alt",
        ariaLabel: "Alt",
        electronAccelerator: null,
        userSettingsLabel: "alt",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["alt"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier AltRight+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "AltRight"
      },
      {
        label: "Alt",
        ariaLabel: "Alt",
        electronAccelerator: null,
        userSettingsLabel: "alt",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["alt"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier MetaLeft+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "MetaLeft"
      },
      {
        label: "Super",
        ariaLabel: "Super",
        electronAccelerator: null,
        userSettingsLabel: "meta",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["meta"]
      }
    );
  });
  test("resolveKeyboardEvent Single Modifier MetaRight+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: -1,
        code: "MetaRight"
      },
      {
        label: "Super",
        ariaLabel: "Super",
        electronAccelerator: null,
        userSettingsLabel: "meta",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["meta"]
      }
    );
  });
  test("resolveKeyboardEvent Only Modifiers Ctrl+Shift+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "ShiftLeft"
      },
      {
        label: "Ctrl+Shift",
        ariaLabel: "Control+Shift",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+shift",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z", async () => {
    const mapper2 = await createKeyboardMapper(true, "linux_en_us", true, OperatingSystem.Linux);
    assertResolveKeyboardEvent(
      mapper2,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: true,
        keyCode: -1,
        code: "KeyZ"
      },
      {
        label: "Ctrl+Alt+Z",
        ariaLabel: "Control+Alt+Z",
        electronAccelerator: "Ctrl+Alt+Z",
        userSettingsLabel: "ctrl+alt+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+alt+[KeyZ]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
});
suite("keyboardMapper", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #23706: Linux UK layout: Ctrl + Apostrophe also toggles terminal", () => {
    const mapper = new MacLinuxKeyboardMapper(false, {
      "Backquote": {
        "value": "`",
        "withShift": "\xAC",
        "withAltGr": "|",
        "withShiftAltGr": "|"
      }
    }, false, OperatingSystem.Linux);
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "Backquote"
      },
      {
        label: "Ctrl+`",
        ariaLabel: "Control+`",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+`",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[Backquote]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("issue #24064: NumLock/NumPad keys stopped working in 1.11 on Linux", () => {
    const mapper = new MacLinuxKeyboardMapper(false, {}, false, OperatingSystem.Linux);
    function assertNumpadKeyboardEvent(keyCode, code, label, electronAccelerator, userSettingsLabel, dispatch) {
      assertResolveKeyboardEvent(
        mapper,
        {
          _standardKeyboardEventBrand: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          altGraphKey: false,
          keyCode,
          code
        },
        {
          label,
          ariaLabel: label,
          electronAccelerator,
          userSettingsLabel,
          isWYSIWYG: true,
          isMultiChord: false,
          dispatchParts: [dispatch],
          singleModifierDispatchParts: [null]
        }
      );
    }
    assertNumpadKeyboardEvent(KeyCode.End, "Numpad1", "End", "End", "end", "[End]");
    assertNumpadKeyboardEvent(KeyCode.DownArrow, "Numpad2", "DownArrow", "Down", "down", "[ArrowDown]");
    assertNumpadKeyboardEvent(KeyCode.PageDown, "Numpad3", "PageDown", "PageDown", "pagedown", "[PageDown]");
    assertNumpadKeyboardEvent(KeyCode.LeftArrow, "Numpad4", "LeftArrow", "Left", "left", "[ArrowLeft]");
    assertNumpadKeyboardEvent(KeyCode.Unknown, "Numpad5", "NumPad5", null, "numpad5", "[Numpad5]");
    assertNumpadKeyboardEvent(KeyCode.RightArrow, "Numpad6", "RightArrow", "Right", "right", "[ArrowRight]");
    assertNumpadKeyboardEvent(KeyCode.Home, "Numpad7", "Home", "Home", "home", "[Home]");
    assertNumpadKeyboardEvent(KeyCode.UpArrow, "Numpad8", "UpArrow", "Up", "up", "[ArrowUp]");
    assertNumpadKeyboardEvent(KeyCode.PageUp, "Numpad9", "PageUp", "PageUp", "pageup", "[PageUp]");
    assertNumpadKeyboardEvent(KeyCode.Insert, "Numpad0", "Insert", "Insert", "insert", "[Insert]");
    assertNumpadKeyboardEvent(KeyCode.Delete, "NumpadDecimal", "Del", "Delete", "delete", "[Delete]");
  });
  test("issue #24107: Delete, Insert, Home, End, PgUp, PgDn, and arrow keys no longer work editor in 1.11", () => {
    const mapper = new MacLinuxKeyboardMapper(false, {}, false, OperatingSystem.Linux);
    function assertKeyboardEvent(keyCode, code, label, electronAccelerator, userSettingsLabel, dispatch) {
      assertResolveKeyboardEvent(
        mapper,
        {
          _standardKeyboardEventBrand: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          metaKey: false,
          altGraphKey: false,
          keyCode,
          code
        },
        {
          label,
          ariaLabel: label,
          electronAccelerator,
          userSettingsLabel,
          isWYSIWYG: true,
          isMultiChord: false,
          dispatchParts: [dispatch],
          singleModifierDispatchParts: [null]
        }
      );
    }
    assertKeyboardEvent(KeyCode.UpArrow, "Lang3", "UpArrow", "Up", "up", "[ArrowUp]");
    assertKeyboardEvent(KeyCode.DownArrow, "NumpadEnter", "DownArrow", "Down", "down", "[ArrowDown]");
    assertKeyboardEvent(KeyCode.LeftArrow, "Convert", "LeftArrow", "Left", "left", "[ArrowLeft]");
    assertKeyboardEvent(KeyCode.RightArrow, "NonConvert", "RightArrow", "Right", "right", "[ArrowRight]");
    assertKeyboardEvent(KeyCode.Delete, "PrintScreen", "Del", "Delete", "delete", "[Delete]");
    assertKeyboardEvent(KeyCode.Insert, "NumpadDivide", "Insert", "Insert", "insert", "[Insert]");
    assertKeyboardEvent(KeyCode.End, "Unknown", "End", "End", "end", "[End]");
    assertKeyboardEvent(KeyCode.Home, "IntlRo", "Home", "Home", "home", "[Home]");
    assertKeyboardEvent(KeyCode.PageDown, "ControlRight", "PageDown", "PageDown", "pagedown", "[PageDown]");
    assertKeyboardEvent(KeyCode.PageUp, "Lang4", "PageUp", "PageUp", "pageup", "[PageUp]");
    assertKeyboardEvent(KeyCode.PageDown, "ControlRight", "PageDown", "PageDown", "pagedown", "[PageDown]");
    assertKeyboardEvent(KeyCode.PageUp, "Lang4", "PageUp", "PageUp", "pageup", "[PageUp]");
    assertKeyboardEvent(KeyCode.End, "", "End", "End", "end", "[End]");
    assertKeyboardEvent(KeyCode.Home, "IntlRo", "Home", "Home", "home", "[Home]");
    assertKeyboardEvent(KeyCode.Delete, "PrintScreen", "Del", "Delete", "delete", "[Delete]");
    assertKeyboardEvent(KeyCode.Insert, "NumpadDivide", "Insert", "Insert", "insert", "[Insert]");
    assertKeyboardEvent(KeyCode.RightArrow, "NonConvert", "RightArrow", "Right", "right", "[ArrowRight]");
    assertKeyboardEvent(KeyCode.LeftArrow, "Convert", "LeftArrow", "Left", "left", "[ArrowLeft]");
    assertKeyboardEvent(KeyCode.DownArrow, "NumpadEnter", "DownArrow", "Down", "down", "[ArrowDown]");
    assertKeyboardEvent(KeyCode.UpArrow, "Lang3", "UpArrow", "Up", "up", "[ArrowUp]");
  });
});
suite("keyboardMapper - LINUX ru", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    const _mapper = await createKeyboardMapper(false, "linux_ru", false, OperatingSystem.Linux);
    mapper = _mapper;
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "linux_ru.txt");
  });
  function _assertResolveKeybinding(k, expected) {
    assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux), expected);
  }
  test("resolveKeybinding Ctrl+S", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyS,
      [{
        label: "Ctrl+S",
        ariaLabel: "Control+S",
        electronAccelerator: "Ctrl+S",
        userSettingsLabel: "ctrl+s",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+[KeyS]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
});
suite("keyboardMapper - LINUX en_uk", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    const _mapper = await createKeyboardMapper(false, "linux_en_uk", false, OperatingSystem.Linux);
    mapper = _mapper;
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "linux_en_uk.txt");
  });
  test("issue #24522: resolveKeyboardEvent Ctrl+Alt+[Minus]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: true,
        metaKey: false,
        altGraphKey: false,
        keyCode: -1,
        code: "Minus"
      },
      {
        label: "Ctrl+Alt+-",
        ariaLabel: "Control+Alt+-",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+alt+[Minus]",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+alt+[Minus]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
});
suite("keyboardMapper - MAC zh_hant", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    const _mapper = await createKeyboardMapper(false, "mac_zh_hant", false, OperatingSystem.Macintosh);
    mapper = _mapper;
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "mac_zh_hant.txt");
  });
  function _assertResolveKeybinding(k, expected) {
    assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Macintosh), expected);
  }
  test("issue #28237 resolveKeybinding Cmd+C", () => {
    _assertResolveKeybinding(
      KeyMod.CtrlCmd | KeyCode.KeyC,
      [{
        label: "\u2318C",
        ariaLabel: "Command+C",
        electronAccelerator: "Cmd+C",
        userSettingsLabel: "cmd+c",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+[KeyC]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
});
suite("keyboardMapper - MAC zh_hant2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    const _mapper = await createKeyboardMapper(false, "mac_zh_hant2", false, OperatingSystem.Macintosh);
    mapper = _mapper;
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "mac_zh_hant2.txt");
  });
});
function _assertKeybindingTranslation(mapper, OS, kb, _expected) {
  let expected;
  if (typeof _expected === "string") {
    expected = [_expected];
  } else if (Array.isArray(_expected)) {
    expected = _expected;
  } else {
    expected = [];
  }
  const runtimeKeybinding = createSimpleKeybinding(kb, OS);
  const keybindingLabel = new USLayoutResolvedKeybinding([runtimeKeybinding], OS).getUserSettingsLabel();
  const actualHardwareKeypresses = mapper.keyCodeChordToScanCodeChord(runtimeKeybinding);
  if (actualHardwareKeypresses.length === 0) {
    assert.deepStrictEqual([], expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "[]" -- expected: "${expected}"`);
    return;
  }
  const actual = actualHardwareKeypresses.map((k) => UserSettingsLabelProvider.toLabel(OS, [k], (keybinding) => ScanCodeUtils.toString(keybinding.scanCode)));
  assert.deepStrictEqual(actual, expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "${actual}" -- expected: "${expected}"`);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFx0ZXN0XFxub2RlXFxtYWNMaW51eEtleWJvYXJkTWFwcGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kLCBTY2FuQ29kZSwgU2NhbkNvZGVVdGlscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEtleUNvZGVDaG9yZCwgZGVjb2RlS2V5YmluZGluZywgY3JlYXRlU2ltcGxlS2V5YmluZGluZywgU2NhbkNvZGVDaG9yZCwgS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IFVzZXJTZXR0aW5nc0xhYmVsUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5nTGFiZWxzLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vdXNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgTWFjTGludXhLZXlib2FyZE1hcHBlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9tYWNMaW51eEtleWJvYXJkTWFwcGVyLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZEtleWJpbmRpbmcsIGFzc2VydE1hcHBpbmcsIGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50LCBhc3NlcnRSZXNvbHZlS2V5YmluZGluZywgcmVhZFJhd01hcHBpbmcgfSBmcm9tICcuL2tleWJvYXJkTWFwcGVyVGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IElNYWNMaW51eEtleWJvYXJkTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZExheW91dC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY29uc3QgV1JJVEVfRklMRV9JRl9ESUZGRVJFTlQgPSBmYWxzZTtcblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlS2V5Ym9hcmRNYXBwZXIoaXNVU1N0YW5kYXJkOiBib29sZWFuLCBmaWxlOiBzdHJpbmcsIG1hcEFsdEdyVG9DdHJsQWx0OiBib29sZWFuLCBPUzogT3BlcmF0aW5nU3lzdGVtKTogUHJvbWlzZTxNYWNMaW51eEtleWJvYXJkTWFwcGVyPiB7XG5cdGNvbnN0IHJhd01hcHBpbmdzID0gYXdhaXQgcmVhZFJhd01hcHBpbmc8SU1hY0xpbnV4S2V5Ym9hcmRNYXBwaW5nPihmaWxlKTtcblx0cmV0dXJuIG5ldyBNYWNMaW51eEtleWJvYXJkTWFwcGVyKGlzVVNTdGFuZGFyZCwgcmF3TWFwcGluZ3MsIG1hcEFsdEdyVG9DdHJsQWx0LCBPUyk7XG59XG5cbnN1aXRlKCdrZXlib2FyZE1hcHBlciAtIE1BQyBkZV9jaCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgbWFwcGVyOiBNYWNMaW51eEtleWJvYXJkTWFwcGVyO1xuXG5cdHN1aXRlU2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IF9tYXBwZXIgPSBhd2FpdCBjcmVhdGVLZXlib2FyZE1hcHBlcihmYWxzZSwgJ21hY19kZV9jaCcsIGZhbHNlLCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKTtcblx0XHRtYXBwZXIgPSBfbWFwcGVyO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRNYXBwaW5nKFdSSVRFX0ZJTEVfSUZfRElGRkVSRU5ULCBtYXBwZXIsICdtYWNfZGVfY2gudHh0Jyk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFzc2VydEtleWJpbmRpbmdUcmFuc2xhdGlvbihrYjogbnVtYmVyLCBleHBlY3RlZDogc3RyaW5nIHwgc3RyaW5nW10pOiB2b2lkIHtcblx0XHRfYXNzZXJ0S2V5YmluZGluZ1RyYW5zbGF0aW9uKG1hcHBlciwgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCwga2IsIGV4cGVjdGVkKTtcblx0fVxuXG5cdGZ1bmN0aW9uIF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhrOiBudW1iZXIsIGV4cGVjdGVkOiBJUmVzb2x2ZWRLZXliaW5kaW5nW10pOiB2b2lkIHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhtYXBwZXIsIGRlY29kZUtleWJpbmRpbmcoaywgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCkhLCBleHBlY3RlZCk7XG5cdH1cblxuXHR0ZXN0KCdrYiA9PiBodycsICgpID0+IHtcblx0XHQvLyB1bmNoYW5nZWRcblx0XHRhc3NlcnRLZXliaW5kaW5nVHJhbnNsYXRpb24oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRpZ2l0MSwgJ2NtZCtEaWdpdDEnKTtcblx0XHRhc3NlcnRLZXliaW5kaW5nVHJhbnNsYXRpb24oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUIsICdjbWQrS2V5QicpO1xuXHRcdGFzc2VydEtleWJpbmRpbmdUcmFuc2xhdGlvbihLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5QiwgJ3NoaWZ0K2NtZCtLZXlCJyk7XG5cdFx0YXNzZXJ0S2V5YmluZGluZ1RyYW5zbGF0aW9uKEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlCLCAnY3RybCtzaGlmdCthbHQrY21kK0tleUInKTtcblxuXHRcdC8vIGZsaXBzIFkgYW5kIFpcblx0XHRhc3NlcnRLZXliaW5kaW5nVHJhbnNsYXRpb24oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVosICdjbWQrS2V5WScpO1xuXHRcdGFzc2VydEtleWJpbmRpbmdUcmFuc2xhdGlvbihLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WSwgJ2NtZCtLZXlaJyk7XG5cblx0XHQvLyBDdHJsKy9cblx0XHRhc3NlcnRLZXliaW5kaW5nVHJhbnNsYXRpb24oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNsYXNoLCAnc2hpZnQrY21kK0RpZ2l0NycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDbWQrQScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4QScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQrQScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDbWQrQScsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK2EnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnbWV0YStbS2V5QV0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIENtZCtCJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlCLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdcdTIzMThCJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29tbWFuZCtCJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0NtZCtCJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjbWQrYicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydtZXRhK1tLZXlCXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ21kK1onLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVosXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMxOFonLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb21tYW5kK1onLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ21kK1onLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2NtZCt6Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ21ldGErW0tleVldJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDbWQrW0tleVldJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IHRydWUsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdLZXlZJ1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdcdTIzMThaJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29tbWFuZCtaJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0NtZCtaJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjbWQreicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydtZXRhK1tLZXlZXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDbWQrXScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0LFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdcdTIzMDNcdTIzMjVcdTIzMTg2Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtPcHRpb24rQ29tbWFuZCs2Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrQWx0K0NtZCs2Jyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2FsdCtjbWQrNicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK2FsdCttZXRhK1tEaWdpdDZdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDbWQrW0JyYWNrZXRSaWdodF0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogdHJ1ZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ0JyYWNrZXRSaWdodCdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4XHUwMEE4Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29tbWFuZCtcdTAwQTgnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2NtZCtbQnJhY2tldFJpZ2h0XScsXG5cdFx0XHRcdGlzV1lTSVdZRzogZmFsc2UsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnbWV0YStbQnJhY2tldFJpZ2h0XSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBTaGlmdCtdJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0LFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdcdTIzMDNcdTIzMjU5Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtPcHRpb24rOScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0FsdCs5Jyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2FsdCs5Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrYWx0K1tEaWdpdDldJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDbWQrLycsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2xhc2gsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ1x1MjFFN1x1MjMxODcnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdTaGlmdCtDb21tYW5kKzcnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnU2hpZnQrQ21kKzcnLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ3NoaWZ0K2NtZCs3Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ3NoaWZ0K21ldGErW0RpZ2l0N10nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIENtZCtTaGlmdCsvJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5TbGFzaCxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMUU3XHUyMzE4XFwnJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnU2hpZnQrQ29tbWFuZCtcXCcnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ3NoaWZ0K2NtZCtbTWludXNdJyxcblx0XHRcdFx0aXNXWVNJV1lHOiBmYWxzZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydzaGlmdCttZXRhK1tNaW51c10nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIENtZCtLIENtZCtcXFxcJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NsYXNoKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4SyBcdTIzMDNcdTIxRTdcdTIzMjVcdTIzMTg3Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29tbWFuZCtLIENvbnRyb2wrU2hpZnQrT3B0aW9uK0NvbW1hbmQrNycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK2sgY3RybCtzaGlmdCthbHQrY21kKzcnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogdHJ1ZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydtZXRhK1tLZXlLXScsICdjdHJsK3NoaWZ0K2FsdCttZXRhK1tEaWdpdDddJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGwsIG51bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDbWQrSyBDbWQrPScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVxdWFsKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4SyBcdTIxRTdcdTIzMTgwJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29tbWFuZCtLIFNoaWZ0K0NvbW1hbmQrMCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK2sgc2hpZnQrY21kKzAnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogdHJ1ZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydtZXRhK1tLZXlLXScsICdzaGlmdCttZXRhK1tEaWdpdDBdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGwsIG51bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDbWQrRG93bkFycm93JywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMxOFx1MjE5MycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQrRG93bkFycm93Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0NtZCtEb3duJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjbWQrZG93bicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydtZXRhK1tBcnJvd0Rvd25dJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDbWQrTlVNUEFEXzAnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLk51bXBhZDAsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMxOE51bVBhZDAnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb21tYW5kK051bVBhZDAnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2NtZCtudW1wYWQwJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ21ldGErW051bXBhZDBdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDdHJsK0hvbWUnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkhvbWUsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMxOEhvbWUnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb21tYW5kK0hvbWUnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ21kK0hvbWUnLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2NtZCtob21lJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ21ldGErW0hvbWVdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDdHJsK1tIb21lXScsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiBmYWxzZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IC0xLFxuXHRcdFx0XHRjb2RlOiAnSG9tZSdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4SG9tZScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQrSG9tZScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDbWQrSG9tZScsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK2hvbWUnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnbWV0YStbSG9tZV0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVVzZXJCaW5kaW5nIENtZCtbQ29tbWFdIENtZCsvJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0bmV3IEtleWJpbmRpbmcoW1xuXHRcdFx0XHRuZXcgU2NhbkNvZGVDaG9yZChmYWxzZSwgZmFsc2UsIGZhbHNlLCB0cnVlLCBTY2FuQ29kZS5Db21tYSksXG5cdFx0XHRcdG5ldyBLZXlDb2RlQ2hvcmQoZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgS2V5Q29kZS5TbGFzaCksXG5cdFx0XHRdKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4LCBcdTIxRTdcdTIzMTg3Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29tbWFuZCssIFNoaWZ0K0NvbW1hbmQrNycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK1tDb21tYV0gc2hpZnQrY21kKzcnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IHRydWUsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnbWV0YStbQ29tbWFdJywgJ3NoaWZ0K21ldGErW0RpZ2l0N10nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbCwgbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBNZXRhTGVmdCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogdHJ1ZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ01ldGFMZWZ0J1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdcdTIzMTgnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb21tYW5kJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjbWQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ21ldGEnXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBTaW5nbGUgTW9kaWZpZXIgTWV0YVJpZ2h0KycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiBmYWxzZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IC0xLFxuXHRcdFx0XHRjb2RlOiAnTWV0YVJpZ2h0J1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdcdTIzMTgnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb21tYW5kJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjbWQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ21ldGEnXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgna2V5Ym9hcmRNYXBwZXIgLSBNQUMgZW5fdXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IG1hcHBlcjogTWFjTGludXhLZXlib2FyZE1hcHBlcjtcblxuXHRzdWl0ZVNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBfbWFwcGVyID0gYXdhaXQgY3JlYXRlS2V5Ym9hcmRNYXBwZXIodHJ1ZSwgJ21hY19lbl91cycsIGZhbHNlLCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKTtcblx0XHRtYXBwZXIgPSBfbWFwcGVyO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRNYXBwaW5nKFdSSVRFX0ZJTEVfSUZfRElGRkVSRU5ULCBtYXBwZXIsICdtYWNfZW5fdXMudHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVVc2VyQmluZGluZyBDbWQrW0NvbW1hXSBDbWQrLycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlcixcblx0XHRcdG5ldyBLZXliaW5kaW5nKFtcblx0XHRcdFx0bmV3IFNjYW5Db2RlQ2hvcmQoZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgU2NhbkNvZGUuQ29tbWEpLFxuXHRcdFx0XHRuZXcgS2V5Q29kZUNob3JkKGZhbHNlLCBmYWxzZSwgZmFsc2UsIHRydWUsIEtleUNvZGUuU2xhc2gpLFxuXHRcdFx0XSksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMxOCwgXHUyMzE4LycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQrLCBDb21tYW5kKy8nLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2NtZCssIGNtZCsvJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IHRydWUsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnbWV0YStbQ29tbWFdJywgJ21ldGErW1NsYXNoXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsLCBudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgU2luZ2xlIE1vZGlmaWVyIE1ldGFMZWZ0KycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiBmYWxzZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IC0xLFxuXHRcdFx0XHRjb2RlOiAnTWV0YUxlZnQnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMxOCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2NtZCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnbWV0YSddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBNZXRhUmlnaHQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IHRydWUsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdNZXRhUmlnaHQnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMxOCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2NtZCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnbWV0YSddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IG1hcEFsdEdyVG9DdHJsQWx0IEFsdEdyK1onLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwcGVyID0gYXdhaXQgY3JlYXRlS2V5Ym9hcmRNYXBwZXIodHJ1ZSwgJ21hY19lbl91cycsIHRydWUsIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpO1xuXG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiB0cnVlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ0tleVonXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMwM1x1MjMyNVonLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK09wdGlvbitaJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrQWx0K1onLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrYWx0K3onLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCthbHQrW0tleVpdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdrZXlib2FyZE1hcHBlciAtIExJTlVYIGRlX2NoJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBtYXBwZXI6IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXI7XG5cblx0c3VpdGVTZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgX21hcHBlciA9IGF3YWl0IGNyZWF0ZUtleWJvYXJkTWFwcGVyKGZhbHNlLCAnbGludXhfZGVfY2gnLCBmYWxzZSwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRtYXBwZXIgPSBfbWFwcGVyO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRNYXBwaW5nKFdSSVRFX0ZJTEVfSUZfRElGRkVSRU5ULCBtYXBwZXIsICdsaW51eF9kZV9jaC50eHQnKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0S2V5YmluZGluZ1RyYW5zbGF0aW9uKGtiOiBudW1iZXIsIGV4cGVjdGVkOiBzdHJpbmcgfCBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdF9hc3NlcnRLZXliaW5kaW5nVHJhbnNsYXRpb24obWFwcGVyLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIGtiLCBleHBlY3RlZCk7XG5cdH1cblxuXHRmdW5jdGlvbiBfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoazogbnVtYmVyLCBleHBlY3RlZDogSVJlc29sdmVkS2V5YmluZGluZ1tdKTogdm9pZCB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcobWFwcGVyLCBkZWNvZGVLZXliaW5kaW5nKGssIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkhLCBleHBlY3RlZCk7XG5cdH1cblxuXHR0ZXN0KCdrYiA9PiBodycsICgpID0+IHtcblx0XHQvLyB1bmNoYW5nZWRcblx0XHRhc3NlcnRLZXliaW5kaW5nVHJhbnNsYXRpb24oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRpZ2l0MSwgJ2N0cmwrRGlnaXQxJyk7XG5cdFx0YXNzZXJ0S2V5YmluZGluZ1RyYW5zbGF0aW9uKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlCLCAnY3RybCtLZXlCJyk7XG5cdFx0YXNzZXJ0S2V5YmluZGluZ1RyYW5zbGF0aW9uKEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlCLCAnY3RybCtzaGlmdCtLZXlCJyk7XG5cdFx0YXNzZXJ0S2V5YmluZGluZ1RyYW5zbGF0aW9uKEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlCLCAnY3RybCtzaGlmdCthbHQrbWV0YStLZXlCJyk7XG5cblx0XHQvLyBmbGlwcyBZIGFuZCBaXG5cdFx0YXNzZXJ0S2V5YmluZGluZ1RyYW5zbGF0aW9uKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlaLCAnY3RybCtLZXlZJyk7XG5cdFx0YXNzZXJ0S2V5YmluZGluZ1RyYW5zbGF0aW9uKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlZLCAnY3RybCtLZXlaJyk7XG5cblx0XHQvLyBDdHJsKy9cblx0XHRhc3NlcnRLZXliaW5kaW5nVHJhbnNsYXRpb24oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNsYXNoLCAnY3RybCtzaGlmdCtEaWdpdDcnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtBJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlBLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0EnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK0EnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtBJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2EnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtbS2V5QV0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrWicsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Wixcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtaJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtaJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrWicsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCt6Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0tleVldJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDdHJsK1tLZXlZXScsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IC0xLFxuXHRcdFx0XHRjb2RlOiAnS2V5WSdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtaJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtaJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrWicsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCt6Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0tleVldJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrXScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0LFxuXHRcdFx0W11cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDdHJsK1tCcmFja2V0UmlnaHRdJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdCcmFja2V0UmlnaHQnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrXHUwMEE4Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtcdTAwQTgnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrW0JyYWNrZXRSaWdodF0nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0JyYWNrZXRSaWdodF0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgU2hpZnQrXScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJyYWNrZXRSaWdodCxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtBbHQrMCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrQWx0KzAnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtBbHQrMCcsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCthbHQrMCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK2FsdCtbRGlnaXQwXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0FsdCskJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtBbHQrJCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCthbHQrW0JhY2tzbGFzaF0nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrYWx0K1tCYWNrc2xhc2hdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDdHJsKy8nLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNsYXNoLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK1NoaWZ0KzcnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1NoaWZ0KzcnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtTaGlmdCs3Jyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK3NoaWZ0KzcnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtzaGlmdCtbRGlnaXQ3XSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtTaGlmdCsvJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5TbGFzaCxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtTaGlmdCtcXCcnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1NoaWZ0K1xcJycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtzaGlmdCtbTWludXNdJyxcblx0XHRcdFx0aXNXWVNJV1lHOiBmYWxzZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK3NoaWZ0K1tNaW51c10nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrSyBDdHJsK1xcXFwnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc2xhc2gpLFxuXHRcdFx0W11cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDdHJsK0sgQ3RybCs9JywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRXF1YWwpLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0sgQ3RybCtTaGlmdCswJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtLIENvbnRyb2wrU2hpZnQrMCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtrIGN0cmwrc2hpZnQrMCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiB0cnVlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0tleUtdJywgJ2N0cmwrc2hpZnQrW0RpZ2l0MF0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbCwgbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrRG93bkFycm93JywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrRG93bkFycm93Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtEb3duQXJyb3cnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtEb3duJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2Rvd24nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtbQXJyb3dEb3duXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtOVU1QQURfMCcsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTnVtcGFkMCxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtOdW1QYWQwJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtOdW1QYWQwJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK251bXBhZDAnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtbTnVtcGFkMF0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrSG9tZScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuSG9tZSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtIb21lJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtIb21lJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrSG9tZScsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtob21lJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0hvbWVdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDdHJsK1tIb21lXScsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IC0xLFxuXHRcdFx0XHRjb2RlOiAnSG9tZSdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtIb21lJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtIb21lJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrSG9tZScsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtob21lJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0hvbWVdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IEN0cmwrW0tleVhdJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdLZXlYJ1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsK1gnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1gnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtYJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK3gnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtbS2V5WF0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVVzZXJCaW5kaW5nIEN0cmwrW0NvbW1hXSBDdHJsKy8nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRtYXBwZXIsIG5ldyBLZXliaW5kaW5nKFtcblx0XHRcdFx0bmV3IFNjYW5Db2RlQ2hvcmQodHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgU2NhbkNvZGUuQ29tbWEpLFxuXHRcdFx0XHRuZXcgS2V5Q29kZUNob3JkKHRydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIEtleUNvZGUuU2xhc2gpLFxuXHRcdFx0XSksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrLCBDdHJsK1NoaWZ0KzcnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sKywgQ29udHJvbCtTaGlmdCs3Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK1tDb21tYV0gY3RybCtzaGlmdCs3Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiBmYWxzZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiB0cnVlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0NvbW1hXScsICdjdHJsK3NoaWZ0K1tEaWdpdDddJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGwsIG51bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBTaW5nbGUgTW9kaWZpZXIgQ29udHJvbExlZnQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdDb250cm9sTGVmdCdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ2N0cmwnXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBTaW5nbGUgTW9kaWZpZXIgQ29udHJvbFJpZ2h0KycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IC0xLFxuXHRcdFx0XHRjb2RlOiAnQ29udHJvbFJpZ2h0J1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnY3RybCddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdrZXlib2FyZE1hcHBlciAtIExJTlVYIGVuX3VzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBtYXBwZXI6IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXI7XG5cblx0c3VpdGVTZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgX21hcHBlciA9IGF3YWl0IGNyZWF0ZUtleWJvYXJkTWFwcGVyKHRydWUsICdsaW51eF9lbl91cycsIGZhbHNlLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdG1hcHBlciA9IF9tYXBwZXI7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHBpbmcnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIGFzc2VydE1hcHBpbmcoV1JJVEVfRklMRV9JRl9ESUZGRVJFTlQsIG1hcHBlciwgJ2xpbnV4X2VuX3VzLnR4dCcpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoazogbnVtYmVyLCBleHBlY3RlZDogSVJlc29sdmVkS2V5YmluZGluZ1tdKTogdm9pZCB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcobWFwcGVyLCBkZWNvZGVLZXliaW5kaW5nKGssIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkhLCBleHBlY3RlZCk7XG5cdH1cblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDdHJsK0EnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUEsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrQScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrQScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0EnLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrYScsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tLZXlBXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtaJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlaLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK1onLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1onLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtaJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK3onLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtbS2V5Wl0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IEN0cmwrW0tleVpdJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdLZXlaJ1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsK1onLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1onLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtaJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK3onLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtbS2V5Wl0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtdJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrXScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrXScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK10nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrXScsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tCcmFja2V0UmlnaHRdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDdHJsK1tCcmFja2V0UmlnaHRdJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdCcmFja2V0UmlnaHQnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrXScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrXScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK10nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrXScsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tCcmFja2V0UmlnaHRdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIFNoaWZ0K10nLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ1NoaWZ0K10nLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdTaGlmdCtdJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ1NoaWZ0K10nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ3NoaWZ0K10nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnc2hpZnQrW0JyYWNrZXRSaWdodF0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrLycsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2xhc2gsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrLycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrLycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsKy8nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrLycsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tTbGFzaF0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrU2hpZnQrLycsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuU2xhc2gsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrU2hpZnQrLycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrU2hpZnQrLycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK1NoaWZ0Ky8nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrc2hpZnQrLycsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK3NoaWZ0K1tTbGFzaF0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrSyBDdHJsK1xcXFwnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc2xhc2gpLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0sgQ3RybCtcXFxcJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtLIENvbnRyb2wrXFxcXCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtrIGN0cmwrXFxcXCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiB0cnVlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0tleUtdJywgJ2N0cmwrW0JhY2tzbGFzaF0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbCwgbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrSyBDdHJsKz0nLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FcXVhbCksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrSyBDdHJsKz0nLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK0sgQ29udHJvbCs9Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2sgY3RybCs9Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IHRydWUsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtbS2V5S10nLCAnY3RybCtbRXF1YWxdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGwsIG51bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDdHJsK0Rvd25BcnJvdycsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0Rvd25BcnJvdycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrRG93bkFycm93Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrRG93bicsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtkb3duJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0Fycm93RG93bl0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrTlVNUEFEXzAnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLk51bXBhZDAsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrTnVtUGFkMCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrTnVtUGFkMCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtudW1wYWQwJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW051bXBhZDBdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDdHJsK0hvbWUnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkhvbWUsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrSG9tZScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrSG9tZScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0hvbWUnLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwraG9tZScsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tIb21lXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgQ3RybCtbSG9tZV0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogdHJ1ZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ0hvbWUnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrSG9tZScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrSG9tZScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0hvbWUnLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwraG9tZScsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tIb21lXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDdHJsK1NoaWZ0KywnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkNvbW1hLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK1NoaWZ0KywnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1NoaWZ0KywnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtTaGlmdCssJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK3NoaWZ0KywnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtzaGlmdCtbQ29tbWFdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrPCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrPCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtbSW50bEJhY2tzbGFzaF0nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0ludGxCYWNrc2xhc2hdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjMzOTM6IHJlc29sdmVLZXliaW5kaW5nIEN0cmwrRW50ZXInLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0VudGVyJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtFbnRlcicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0VudGVyJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2VudGVyJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0VudGVyXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIzMzkzOiByZXNvbHZlS2V5Ym9hcmRFdmVudCBDdHJsK1tOdW1wYWRFbnRlcl0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogdHJ1ZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ051bXBhZEVudGVyJ1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0VudGVyJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtFbnRlcicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0VudGVyJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2VudGVyJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0VudGVyXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlVXNlckJpbmRpbmcgQ3RybCtbQ29tbWFdIEN0cmwrLycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlciwgbmV3IEtleWJpbmRpbmcoW1xuXHRcdFx0XHRuZXcgU2NhbkNvZGVDaG9yZCh0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBTY2FuQ29kZS5Db21tYSksXG5cdFx0XHRcdG5ldyBLZXlDb2RlQ2hvcmQodHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgS2V5Q29kZS5TbGFzaCksXG5cdFx0XHRdKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCssIEN0cmwrLycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrLCBDb250cm9sKy8nLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrLCBjdHJsKy8nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogdHJ1ZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tDb21tYV0nLCAnY3RybCtbU2xhc2hdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGwsIG51bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlVXNlckJpbmRpbmcgQ3RybCtbQ29tbWFdJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0bWFwcGVyLCBuZXcgS2V5YmluZGluZyhbXG5cdFx0XHRcdG5ldyBTY2FuQ29kZUNob3JkKHRydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIFNjYW5Db2RlLkNvbW1hKVxuXHRcdFx0XSksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrLCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrLCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsKywnLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrLCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tDb21tYV0nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBDb250cm9sTGVmdCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogdHJ1ZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ0NvbnRyb2xMZWZ0J1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnY3RybCddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBDb250cm9sUmlnaHQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdDb250cm9sUmlnaHQnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogWydjdHJsJ10sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgU2luZ2xlIE1vZGlmaWVyIFNoaWZ0TGVmdCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ1NoaWZ0TGVmdCdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnU2hpZnQnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdTaGlmdCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnc2hpZnQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ3NoaWZ0J10sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgU2luZ2xlIE1vZGlmaWVyIFNoaWZ0UmlnaHQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0XHRzaGlmdEtleTogdHJ1ZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdTaGlmdFJpZ2h0J1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdTaGlmdCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ1NoaWZ0Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdzaGlmdCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnc2hpZnQnXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBTaW5nbGUgTW9kaWZpZXIgQWx0TGVmdCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiB0cnVlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ0FsdExlZnQnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0FsdCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0FsdCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnYWx0Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogWydhbHQnXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBTaW5nbGUgTW9kaWZpZXIgQWx0UmlnaHQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogdHJ1ZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdBbHRSaWdodCdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQWx0Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQWx0Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdhbHQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ2FsdCddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBNZXRhTGVmdCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogdHJ1ZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ01ldGFMZWZ0J1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdTdXBlcicsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ1N1cGVyJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdtZXRhJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogWydtZXRhJ10sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgU2luZ2xlIE1vZGlmaWVyIE1ldGFSaWdodCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogdHJ1ZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ01ldGFSaWdodCdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnU3VwZXInLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdTdXBlcicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnbWV0YScsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnbWV0YSddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IE9ubHkgTW9kaWZpZXJzIEN0cmwrU2hpZnQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ1NoaWZ0TGVmdCdcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtTaGlmdCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrU2hpZnQnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrc2hpZnQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgbWFwQWx0R3JUb0N0cmxBbHQgQWx0R3IrWicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXBwZXIgPSBhd2FpdCBjcmVhdGVLZXlib2FyZE1hcHBlcih0cnVlLCAnbGludXhfZW5fdXMnLCB0cnVlLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiB0cnVlLFxuXHRcdFx0XHRrZXlDb2RlOiAtMSxcblx0XHRcdFx0Y29kZTogJ0tleVonXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrQWx0K1onLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK0FsdCtaJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrQWx0K1onLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrYWx0K3onLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCthbHQrW0tleVpdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdrZXlib2FyZE1hcHBlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjM3MDY6IExpbnV4IFVLIGxheW91dDogQ3RybCArIEFwb3N0cm9waGUgYWxzbyB0b2dnbGVzIHRlcm1pbmFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcHBlciA9IG5ldyBNYWNMaW51eEtleWJvYXJkTWFwcGVyKGZhbHNlLCB7XG5cdFx0XHQnQmFja3F1b3RlJzoge1xuXHRcdFx0XHQndmFsdWUnOiAnYCcsXG5cdFx0XHRcdCd3aXRoU2hpZnQnOiAnXHUwMEFDJyxcblx0XHRcdFx0J3dpdGhBbHRHcic6ICd8Jyxcblx0XHRcdFx0J3dpdGhTaGlmdEFsdEdyJzogJ3wnXG5cdFx0XHR9XG5cdFx0fSwgZmFsc2UsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IC0xLFxuXHRcdFx0XHRjb2RlOiAnQmFja3F1b3RlJ1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsK2AnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK2AnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrYCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1tCYWNrcXVvdGVdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNDA2NDogTnVtTG9jay9OdW1QYWQga2V5cyBzdG9wcGVkIHdvcmtpbmcgaW4gMS4xMSBvbiBMaW51eCcsICgpID0+IHtcblx0XHRjb25zdCBtYXBwZXIgPSBuZXcgTWFjTGludXhLZXlib2FyZE1hcHBlcihmYWxzZSwge30sIGZhbHNlLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0TnVtcGFkS2V5Ym9hcmRFdmVudChrZXlDb2RlOiBLZXlDb2RlLCBjb2RlOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGVsZWN0cm9uQWNjZWxlcmF0b3I6IHN0cmluZyB8IG51bGwsIHVzZXJTZXR0aW5nc0xhYmVsOiBzdHJpbmcsIGRpc3BhdGNoOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0XHRtYXBwZXIsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRcdGtleUNvZGU6IGtleUNvZGUsXG5cdFx0XHRcdFx0Y29kZTogY29kZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxhYmVsLFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogbGFiZWwsXG5cdFx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogZWxlY3Ryb25BY2NlbGVyYXRvcixcblx0XHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogdXNlclNldHRpbmdzTGFiZWwsXG5cdFx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW2Rpc3BhdGNoXSxcblx0XHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRhc3NlcnROdW1wYWRLZXlib2FyZEV2ZW50KEtleUNvZGUuRW5kLCAnTnVtcGFkMScsICdFbmQnLCAnRW5kJywgJ2VuZCcsICdbRW5kXScpO1xuXHRcdGFzc2VydE51bXBhZEtleWJvYXJkRXZlbnQoS2V5Q29kZS5Eb3duQXJyb3csICdOdW1wYWQyJywgJ0Rvd25BcnJvdycsICdEb3duJywgJ2Rvd24nLCAnW0Fycm93RG93bl0nKTtcblx0XHRhc3NlcnROdW1wYWRLZXlib2FyZEV2ZW50KEtleUNvZGUuUGFnZURvd24sICdOdW1wYWQzJywgJ1BhZ2VEb3duJywgJ1BhZ2VEb3duJywgJ3BhZ2Vkb3duJywgJ1tQYWdlRG93bl0nKTtcblx0XHRhc3NlcnROdW1wYWRLZXlib2FyZEV2ZW50KEtleUNvZGUuTGVmdEFycm93LCAnTnVtcGFkNCcsICdMZWZ0QXJyb3cnLCAnTGVmdCcsICdsZWZ0JywgJ1tBcnJvd0xlZnRdJyk7XG5cdFx0YXNzZXJ0TnVtcGFkS2V5Ym9hcmRFdmVudChLZXlDb2RlLlVua25vd24sICdOdW1wYWQ1JywgJ051bVBhZDUnLCBudWxsLCAnbnVtcGFkNScsICdbTnVtcGFkNV0nKTtcblx0XHRhc3NlcnROdW1wYWRLZXlib2FyZEV2ZW50KEtleUNvZGUuUmlnaHRBcnJvdywgJ051bXBhZDYnLCAnUmlnaHRBcnJvdycsICdSaWdodCcsICdyaWdodCcsICdbQXJyb3dSaWdodF0nKTtcblx0XHRhc3NlcnROdW1wYWRLZXlib2FyZEV2ZW50KEtleUNvZGUuSG9tZSwgJ051bXBhZDcnLCAnSG9tZScsICdIb21lJywgJ2hvbWUnLCAnW0hvbWVdJyk7XG5cdFx0YXNzZXJ0TnVtcGFkS2V5Ym9hcmRFdmVudChLZXlDb2RlLlVwQXJyb3csICdOdW1wYWQ4JywgJ1VwQXJyb3cnLCAnVXAnLCAndXAnLCAnW0Fycm93VXBdJyk7XG5cdFx0YXNzZXJ0TnVtcGFkS2V5Ym9hcmRFdmVudChLZXlDb2RlLlBhZ2VVcCwgJ051bXBhZDknLCAnUGFnZVVwJywgJ1BhZ2VVcCcsICdwYWdldXAnLCAnW1BhZ2VVcF0nKTtcblx0XHRhc3NlcnROdW1wYWRLZXlib2FyZEV2ZW50KEtleUNvZGUuSW5zZXJ0LCAnTnVtcGFkMCcsICdJbnNlcnQnLCAnSW5zZXJ0JywgJ2luc2VydCcsICdbSW5zZXJ0XScpO1xuXHRcdGFzc2VydE51bXBhZEtleWJvYXJkRXZlbnQoS2V5Q29kZS5EZWxldGUsICdOdW1wYWREZWNpbWFsJywgJ0RlbCcsICdEZWxldGUnLCAnZGVsZXRlJywgJ1tEZWxldGVdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNDEwNzogRGVsZXRlLCBJbnNlcnQsIEhvbWUsIEVuZCwgUGdVcCwgUGdEbiwgYW5kIGFycm93IGtleXMgbm8gbG9uZ2VyIHdvcmsgZWRpdG9yIGluIDEuMTEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwcGVyID0gbmV3IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIoZmFsc2UsIHt9LCBmYWxzZSwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydEtleWJvYXJkRXZlbnQoa2V5Q29kZTogS2V5Q29kZSwgY29kZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBlbGVjdHJvbkFjY2VsZXJhdG9yOiBzdHJpbmcsIHVzZXJTZXR0aW5nc0xhYmVsOiBzdHJpbmcsIGRpc3BhdGNoOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0XHRtYXBwZXIsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRcdGtleUNvZGU6IGtleUNvZGUsXG5cdFx0XHRcdFx0Y29kZTogY29kZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxhYmVsLFxuXHRcdFx0XHRcdGFyaWFMYWJlbDogbGFiZWwsXG5cdFx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogZWxlY3Ryb25BY2NlbGVyYXRvcixcblx0XHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogdXNlclNldHRpbmdzTGFiZWwsXG5cdFx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW2Rpc3BhdGNoXSxcblx0XHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjQxMDcjaXNzdWVjb21tZW50LTI5MjMxODQ5N1xuXHRcdGFzc2VydEtleWJvYXJkRXZlbnQoS2V5Q29kZS5VcEFycm93LCAnTGFuZzMnLCAnVXBBcnJvdycsICdVcCcsICd1cCcsICdbQXJyb3dVcF0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuRG93bkFycm93LCAnTnVtcGFkRW50ZXInLCAnRG93bkFycm93JywgJ0Rvd24nLCAnZG93bicsICdbQXJyb3dEb3duXScpO1xuXHRcdGFzc2VydEtleWJvYXJkRXZlbnQoS2V5Q29kZS5MZWZ0QXJyb3csICdDb252ZXJ0JywgJ0xlZnRBcnJvdycsICdMZWZ0JywgJ2xlZnQnLCAnW0Fycm93TGVmdF0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuUmlnaHRBcnJvdywgJ05vbkNvbnZlcnQnLCAnUmlnaHRBcnJvdycsICdSaWdodCcsICdyaWdodCcsICdbQXJyb3dSaWdodF0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuRGVsZXRlLCAnUHJpbnRTY3JlZW4nLCAnRGVsJywgJ0RlbGV0ZScsICdkZWxldGUnLCAnW0RlbGV0ZV0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuSW5zZXJ0LCAnTnVtcGFkRGl2aWRlJywgJ0luc2VydCcsICdJbnNlcnQnLCAnaW5zZXJ0JywgJ1tJbnNlcnRdJyk7XG5cdFx0YXNzZXJ0S2V5Ym9hcmRFdmVudChLZXlDb2RlLkVuZCwgJ1Vua25vd24nLCAnRW5kJywgJ0VuZCcsICdlbmQnLCAnW0VuZF0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuSG9tZSwgJ0ludGxSbycsICdIb21lJywgJ0hvbWUnLCAnaG9tZScsICdbSG9tZV0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuUGFnZURvd24sICdDb250cm9sUmlnaHQnLCAnUGFnZURvd24nLCAnUGFnZURvd24nLCAncGFnZWRvd24nLCAnW1BhZ2VEb3duXScpO1xuXHRcdGFzc2VydEtleWJvYXJkRXZlbnQoS2V5Q29kZS5QYWdlVXAsICdMYW5nNCcsICdQYWdlVXAnLCAnUGFnZVVwJywgJ3BhZ2V1cCcsICdbUGFnZVVwXScpO1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI0MTA3I2lzc3VlY29tbWVudC0yOTIzMjM5MjRcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuUGFnZURvd24sICdDb250cm9sUmlnaHQnLCAnUGFnZURvd24nLCAnUGFnZURvd24nLCAncGFnZWRvd24nLCAnW1BhZ2VEb3duXScpO1xuXHRcdGFzc2VydEtleWJvYXJkRXZlbnQoS2V5Q29kZS5QYWdlVXAsICdMYW5nNCcsICdQYWdlVXAnLCAnUGFnZVVwJywgJ3BhZ2V1cCcsICdbUGFnZVVwXScpO1xuXHRcdGFzc2VydEtleWJvYXJkRXZlbnQoS2V5Q29kZS5FbmQsICcnLCAnRW5kJywgJ0VuZCcsICdlbmQnLCAnW0VuZF0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuSG9tZSwgJ0ludGxSbycsICdIb21lJywgJ0hvbWUnLCAnaG9tZScsICdbSG9tZV0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuRGVsZXRlLCAnUHJpbnRTY3JlZW4nLCAnRGVsJywgJ0RlbGV0ZScsICdkZWxldGUnLCAnW0RlbGV0ZV0nKTtcblx0XHRhc3NlcnRLZXlib2FyZEV2ZW50KEtleUNvZGUuSW5zZXJ0LCAnTnVtcGFkRGl2aWRlJywgJ0luc2VydCcsICdJbnNlcnQnLCAnaW5zZXJ0JywgJ1tJbnNlcnRdJyk7XG5cdFx0YXNzZXJ0S2V5Ym9hcmRFdmVudChLZXlDb2RlLlJpZ2h0QXJyb3csICdOb25Db252ZXJ0JywgJ1JpZ2h0QXJyb3cnLCAnUmlnaHQnLCAncmlnaHQnLCAnW0Fycm93UmlnaHRdJyk7XG5cdFx0YXNzZXJ0S2V5Ym9hcmRFdmVudChLZXlDb2RlLkxlZnRBcnJvdywgJ0NvbnZlcnQnLCAnTGVmdEFycm93JywgJ0xlZnQnLCAnbGVmdCcsICdbQXJyb3dMZWZ0XScpO1xuXHRcdGFzc2VydEtleWJvYXJkRXZlbnQoS2V5Q29kZS5Eb3duQXJyb3csICdOdW1wYWRFbnRlcicsICdEb3duQXJyb3cnLCAnRG93bicsICdkb3duJywgJ1tBcnJvd0Rvd25dJyk7XG5cdFx0YXNzZXJ0S2V5Ym9hcmRFdmVudChLZXlDb2RlLlVwQXJyb3csICdMYW5nMycsICdVcEFycm93JywgJ1VwJywgJ3VwJywgJ1tBcnJvd1VwXScpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgna2V5Ym9hcmRNYXBwZXIgLSBMSU5VWCBydScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgbWFwcGVyOiBNYWNMaW51eEtleWJvYXJkTWFwcGVyO1xuXG5cdHN1aXRlU2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IF9tYXBwZXIgPSBhd2FpdCBjcmVhdGVLZXlib2FyZE1hcHBlcihmYWxzZSwgJ2xpbnV4X3J1JywgZmFsc2UsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0bWFwcGVyID0gX21hcHBlcjtcblx0fSk7XG5cblx0dGVzdCgnbWFwcGluZycsICgpID0+IHtcblx0XHRyZXR1cm4gYXNzZXJ0TWFwcGluZyhXUklURV9GSUxFX0lGX0RJRkZFUkVOVCwgbWFwcGVyLCAnbGludXhfcnUudHh0Jyk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhrOiBudW1iZXIsIGV4cGVjdGVkOiBJUmVzb2x2ZWRLZXliaW5kaW5nW10pOiB2b2lkIHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhtYXBwZXIsIGRlY29kZUtleWJpbmRpbmcoaywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSEsIGV4cGVjdGVkKTtcblx0fVxuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrUycsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Uyxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtTJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtTJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrUycsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtzJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrW0tleVNdJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgna2V5Ym9hcmRNYXBwZXIgLSBMSU5VWCBlbl91aycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgbWFwcGVyOiBNYWNMaW51eEtleWJvYXJkTWFwcGVyO1xuXG5cdHN1aXRlU2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IF9tYXBwZXIgPSBhd2FpdCBjcmVhdGVLZXlib2FyZE1hcHBlcihmYWxzZSwgJ2xpbnV4X2VuX3VrJywgZmFsc2UsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0bWFwcGVyID0gX21hcHBlcjtcblx0fSk7XG5cblx0dGVzdCgnbWFwcGluZycsICgpID0+IHtcblx0XHRyZXR1cm4gYXNzZXJ0TWFwcGluZyhXUklURV9GSUxFX0lGX0RJRkZFUkVOVCwgbWFwcGVyLCAnbGludXhfZW5fdWsudHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNDUyMjogcmVzb2x2ZUtleWJvYXJkRXZlbnQgQ3RybCtBbHQrW01pbnVzXScsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogdHJ1ZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogLTEsXG5cdFx0XHRcdGNvZGU6ICdNaW51cydcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtBbHQrLScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrQWx0Ky0nLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrYWx0K1tNaW51c10nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrYWx0K1tNaW51c10nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2tleWJvYXJkTWFwcGVyIC0gTUFDIHpoX2hhbnQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IG1hcHBlcjogTWFjTGludXhLZXlib2FyZE1hcHBlcjtcblxuXHRzdWl0ZVNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBfbWFwcGVyID0gYXdhaXQgY3JlYXRlS2V5Ym9hcmRNYXBwZXIoZmFsc2UsICdtYWNfemhfaGFudCcsIGZhbHNlLCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKTtcblx0XHRtYXBwZXIgPSBfbWFwcGVyO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRNYXBwaW5nKFdSSVRFX0ZJTEVfSUZfRElGRkVSRU5ULCBtYXBwZXIsICdtYWNfemhfaGFudC50eHQnKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gX2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKGs6IG51bWJlciwgZXhwZWN0ZWQ6IElSZXNvbHZlZEtleWJpbmRpbmdbXSk6IHZvaWQge1xuXHRcdGFzc2VydFJlc29sdmVLZXliaW5kaW5nKG1hcHBlciwgZGVjb2RlS2V5YmluZGluZyhrLCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSEsIGV4cGVjdGVkKTtcblx0fVxuXG5cdHRlc3QoJ2lzc3VlICMyODIzNyByZXNvbHZlS2V5YmluZGluZyBDbWQrQycsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Qyxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4QycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQrQycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDbWQrQycsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK2MnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnbWV0YStbS2V5Q10nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdrZXlib2FyZE1hcHBlciAtIE1BQyB6aF9oYW50MicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgbWFwcGVyOiBNYWNMaW51eEtleWJvYXJkTWFwcGVyO1xuXG5cdHN1aXRlU2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IF9tYXBwZXIgPSBhd2FpdCBjcmVhdGVLZXlib2FyZE1hcHBlcihmYWxzZSwgJ21hY196aF9oYW50MicsIGZhbHNlLCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKTtcblx0XHRtYXBwZXIgPSBfbWFwcGVyO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRNYXBwaW5nKFdSSVRFX0ZJTEVfSUZfRElGRkVSRU5ULCBtYXBwZXIsICdtYWNfemhfaGFudDIudHh0Jyk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIF9hc3NlcnRLZXliaW5kaW5nVHJhbnNsYXRpb24obWFwcGVyOiBNYWNMaW51eEtleWJvYXJkTWFwcGVyLCBPUzogT3BlcmF0aW5nU3lzdGVtLCBrYjogbnVtYmVyLCBfZXhwZWN0ZWQ6IHN0cmluZyB8IHN0cmluZ1tdKTogdm9pZCB7XG5cdGxldCBleHBlY3RlZDogc3RyaW5nW107XG5cdGlmICh0eXBlb2YgX2V4cGVjdGVkID09PSAnc3RyaW5nJykge1xuXHRcdGV4cGVjdGVkID0gW19leHBlY3RlZF07XG5cdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShfZXhwZWN0ZWQpKSB7XG5cdFx0ZXhwZWN0ZWQgPSBfZXhwZWN0ZWQ7XG5cdH0gZWxzZSB7XG5cdFx0ZXhwZWN0ZWQgPSBbXTtcblx0fVxuXG5cdGNvbnN0IHJ1bnRpbWVLZXliaW5kaW5nID0gY3JlYXRlU2ltcGxlS2V5YmluZGluZyhrYiwgT1MpO1xuXG5cdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IG5ldyBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyhbcnVudGltZUtleWJpbmRpbmddLCBPUykuZ2V0VXNlclNldHRpbmdzTGFiZWwoKTtcblxuXHRjb25zdCBhY3R1YWxIYXJkd2FyZUtleXByZXNzZXMgPSBtYXBwZXIua2V5Q29kZUNob3JkVG9TY2FuQ29kZUNob3JkKHJ1bnRpbWVLZXliaW5kaW5nKTtcblx0aWYgKGFjdHVhbEhhcmR3YXJlS2V5cHJlc3Nlcy5sZW5ndGggPT09IDApIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtdLCBleHBlY3RlZCwgYHNpbXBsZUtleWJpbmRpbmdUb0hhcmR3YXJlS2V5cHJlc3MgLS0gXCIke2tleWJpbmRpbmdMYWJlbH1cIiAtLSBhY3R1YWw6IFwiW11cIiAtLSBleHBlY3RlZDogXCIke2V4cGVjdGVkfVwiYCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgYWN0dWFsID0gYWN0dWFsSGFyZHdhcmVLZXlwcmVzc2VzXG5cdFx0Lm1hcChrID0+IFVzZXJTZXR0aW5nc0xhYmVsUHJvdmlkZXIudG9MYWJlbChPUywgW2tdLCAoa2V5YmluZGluZykgPT4gU2NhbkNvZGVVdGlscy50b1N0cmluZyhrZXliaW5kaW5nLnNjYW5Db2RlKSkpO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIGBzaW1wbGVLZXliaW5kaW5nVG9IYXJkd2FyZUtleXByZXNzIC0tIFwiJHtrZXliaW5kaW5nTGFiZWx9XCIgLS0gYWN0dWFsOiBcIiR7YWN0dWFsfVwiIC0tIGV4cGVjdGVkOiBcIiR7ZXhwZWN0ZWR9XCJgKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtB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
