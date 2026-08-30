import { KeyChord, KeyCode, KeyMod, ScanCode } from "../../../../../base/common/keyCodes.js";
import { KeyCodeChord, decodeKeybinding, ScanCodeChord, Keybinding } from "../../../../../base/common/keybindings.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { WindowsKeyboardMapper } from "../../common/windowsKeyboardMapper.js";
import { assertMapping, assertResolveKeyboardEvent, assertResolveKeybinding, readRawMapping } from "./keyboardMapperTestUtils.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const WRITE_FILE_IF_DIFFERENT = false;
async function createKeyboardMapper(isUSStandard, file, mapAltGrToCtrlAlt) {
  const rawMappings = await readRawMapping(file);
  return new WindowsKeyboardMapper(isUSStandard, rawMappings, mapAltGrToCtrlAlt);
}
function _assertResolveKeybinding(mapper, k, expected) {
  const keyBinding = decodeKeybinding(k, OperatingSystem.Windows);
  assertResolveKeybinding(mapper, keyBinding, expected);
}
suite("keyboardMapper - WINDOWS de_ch", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    mapper = await createKeyboardMapper(false, "win_de_ch", false);
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "win_de_ch.txt");
  });
  test("resolveKeybinding Ctrl+A", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyCode.KeyA,
      [{
        label: "Ctrl+A",
        ariaLabel: "Control+A",
        electronAccelerator: "Ctrl+A",
        userSettingsLabel: "ctrl+a",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+A"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Z", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyCode.KeyZ,
      [{
        label: "Ctrl+Z",
        ariaLabel: "Control+Z",
        electronAccelerator: "Ctrl+Z",
        userSettingsLabel: "ctrl+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+Z"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+Z", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.KeyZ,
        code: null
      },
      {
        label: "Ctrl+Z",
        ariaLabel: "Control+Z",
        electronAccelerator: "Ctrl+Z",
        userSettingsLabel: "ctrl+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+Z"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Ctrl+]", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyCode.BracketRight,
      [{
        label: "Ctrl+^",
        ariaLabel: "Control+^",
        electronAccelerator: "Ctrl+]",
        userSettingsLabel: "ctrl+oem_6",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.BracketRight,
        code: null
      },
      {
        label: "Ctrl+^",
        ariaLabel: "Control+^",
        electronAccelerator: "Ctrl+]",
        userSettingsLabel: "ctrl+oem_6",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+]"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeybinding Shift+]", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.Shift | KeyCode.BracketRight,
      [{
        label: "Shift+^",
        ariaLabel: "Shift+^",
        electronAccelerator: "Shift+]",
        userSettingsLabel: "shift+oem_6",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["shift+]"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+/", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyCode.Slash,
      [{
        label: "Ctrl+\xA7",
        ariaLabel: "Control+\xA7",
        electronAccelerator: "Ctrl+/",
        userSettingsLabel: "ctrl+oem_2",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+/"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Shift+/", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
      [{
        label: "Ctrl+Shift+\xA7",
        ariaLabel: "Control+Shift+\xA7",
        electronAccelerator: "Ctrl+Shift+/",
        userSettingsLabel: "ctrl+shift+oem_2",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+shift+/"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+K Ctrl+\\", () => {
    _assertResolveKeybinding(
      mapper,
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
      [{
        label: "Ctrl+K Ctrl+\xE4",
        ariaLabel: "Control+K Control+\xE4",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+k ctrl+oem_5",
        isWYSIWYG: false,
        isMultiChord: true,
        dispatchParts: ["ctrl+K", "ctrl+\\"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+K Ctrl+=", () => {
    _assertResolveKeybinding(
      mapper,
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
      []
    );
  });
  test("resolveKeybinding Ctrl+DownArrow", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyCode.DownArrow,
      [{
        label: "Ctrl+DownArrow",
        ariaLabel: "Control+DownArrow",
        electronAccelerator: "Ctrl+Down",
        userSettingsLabel: "ctrl+down",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+DownArrow"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+NUMPAD_0", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyCode.Numpad0,
      [{
        label: "Ctrl+NumPad0",
        ariaLabel: "Control+NumPad0",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+numpad0",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+NumPad0"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Ctrl+Home", () => {
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyCode.Home,
      [{
        label: "Ctrl+Home",
        ariaLabel: "Control+Home",
        electronAccelerator: "Ctrl+Home",
        userSettingsLabel: "ctrl+home",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+Home"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Ctrl+Home", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.Home,
        code: null
      },
      {
        label: "Ctrl+Home",
        ariaLabel: "Control+Home",
        electronAccelerator: "Ctrl+Home",
        userSettingsLabel: "ctrl+home",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+Home"],
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
        label: "Ctrl+, Ctrl+\xA7",
        ariaLabel: "Control+, Control+\xA7",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+oem_comma ctrl+oem_2",
        isWYSIWYG: false,
        isMultiChord: true,
        dispatchParts: ["ctrl+,", "ctrl+/"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeyboardEvent Single Modifier Ctrl+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.Ctrl,
        code: null
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
suite("keyboardMapper - WINDOWS en_us", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    mapper = await createKeyboardMapper(true, "win_en_us", false);
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "win_en_us.txt");
  });
  test("resolveKeybinding Ctrl+K Ctrl+\\", () => {
    _assertResolveKeybinding(
      mapper,
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
      [{
        label: "Ctrl+K Ctrl+\\",
        ariaLabel: "Control+K Control+\\",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+k ctrl+\\",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["ctrl+K", "ctrl+\\"],
        singleModifierDispatchParts: [null, null]
      }]
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
        dispatchParts: ["ctrl+,", "ctrl+/"],
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
        dispatchParts: ["ctrl+,"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeyboardEvent Single Modifier Ctrl+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.Ctrl,
        code: null
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
  test("resolveKeyboardEvent Single Modifier Shift+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.Shift,
        code: null
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
  test("resolveKeyboardEvent Single Modifier Alt+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: true,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.Alt,
        code: null
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
  test("resolveKeyboardEvent Single Modifier Meta+", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: KeyCode.Meta,
        code: null
      },
      {
        label: "Windows",
        ariaLabel: "Windows",
        electronAccelerator: null,
        userSettingsLabel: "win",
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
        keyCode: KeyCode.Shift,
        code: null
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
    const mapper2 = await createKeyboardMapper(true, "win_en_us", true);
    assertResolveKeyboardEvent(
      mapper2,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: true,
        keyCode: KeyCode.KeyZ,
        code: null
      },
      {
        label: "Ctrl+Alt+Z",
        ariaLabel: "Control+Alt+Z",
        electronAccelerator: "Ctrl+Alt+Z",
        userSettingsLabel: "ctrl+alt+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+alt+Z"],
        singleModifierDispatchParts: [null]
      }
    );
  });
});
suite("keyboardMapper - WINDOWS por_ptb", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    mapper = await createKeyboardMapper(false, "win_por_ptb", false);
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "win_por_ptb.txt");
  });
  test("resolveKeyboardEvent Ctrl+[IntlRo]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.ABNT_C1,
        code: null
      },
      {
        label: "Ctrl+/",
        ariaLabel: "Control+/",
        electronAccelerator: "Ctrl+ABNT_C1",
        userSettingsLabel: "ctrl+abnt_c1",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+ABNT_C1"],
        singleModifierDispatchParts: [null]
      }
    );
  });
  test("resolveKeyboardEvent Ctrl+[NumpadComma]", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        altGraphKey: false,
        keyCode: KeyCode.ABNT_C2,
        code: null
      },
      {
        label: "Ctrl+.",
        ariaLabel: "Control+.",
        electronAccelerator: "Ctrl+ABNT_C2",
        userSettingsLabel: "ctrl+abnt_c2",
        isWYSIWYG: false,
        isMultiChord: false,
        dispatchParts: ["ctrl+ABNT_C2"],
        singleModifierDispatchParts: [null]
      }
    );
  });
});
suite("keyboardMapper - WINDOWS ru", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let mapper;
  suiteSetup(async () => {
    mapper = await createKeyboardMapper(false, "win_ru", false);
  });
  test("mapping", () => {
    return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, "win_ru.txt");
  });
  test("issue ##24361: resolveKeybinding Ctrl+K Ctrl+K", () => {
    _assertResolveKeybinding(
      mapper,
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK),
      [{
        label: "Ctrl+K Ctrl+K",
        ariaLabel: "Control+K Control+K",
        electronAccelerator: null,
        userSettingsLabel: "ctrl+k ctrl+k",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["ctrl+K", "ctrl+K"],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
});
suite("keyboardMapper - misc", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #23513: Toggle Sidebar Visibility and Go to Line display same key mapping in Arabic keyboard", () => {
    const mapper = new WindowsKeyboardMapper(false, {
      "KeyB": {
        "vkey": "VK_B",
        "value": "\u0644\u0627",
        "withShift": "\u0644\u0622",
        "withAltGr": "",
        "withShiftAltGr": ""
      },
      "KeyG": {
        "vkey": "VK_G",
        "value": "\u0644",
        "withShift": "\u0644\u0623",
        "withAltGr": "",
        "withShiftAltGr": ""
      }
    }, false);
    _assertResolveKeybinding(
      mapper,
      KeyMod.CtrlCmd | KeyCode.KeyB,
      [{
        label: "Ctrl+B",
        ariaLabel: "Control+B",
        electronAccelerator: "Ctrl+B",
        userSettingsLabel: "ctrl+b",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["ctrl+B"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFx0ZXN0XFxub2RlXFx3aW5kb3dzS2V5Ym9hcmRNYXBwZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QsIFNjYW5Db2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZUNob3JkLCBkZWNvZGVLZXliaW5kaW5nLCBTY2FuQ29kZUNob3JkLCBLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgV2luZG93c0tleWJvYXJkTWFwcGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dpbmRvd3NLZXlib2FyZE1hcHBlci5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRLZXliaW5kaW5nLCBhc3NlcnRNYXBwaW5nLCBhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudCwgYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcsIHJlYWRSYXdNYXBwaW5nIH0gZnJvbSAnLi9rZXlib2FyZE1hcHBlclRlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBJV2luZG93c0tleWJvYXJkTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZExheW91dC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY29uc3QgV1JJVEVfRklMRV9JRl9ESUZGRVJFTlQgPSBmYWxzZTtcblxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlS2V5Ym9hcmRNYXBwZXIoaXNVU1N0YW5kYXJkOiBib29sZWFuLCBmaWxlOiBzdHJpbmcsIG1hcEFsdEdyVG9DdHJsQWx0OiBib29sZWFuKTogUHJvbWlzZTxXaW5kb3dzS2V5Ym9hcmRNYXBwZXI+IHtcblx0Y29uc3QgcmF3TWFwcGluZ3MgPSBhd2FpdCByZWFkUmF3TWFwcGluZzxJV2luZG93c0tleWJvYXJkTWFwcGluZz4oZmlsZSk7XG5cdHJldHVybiBuZXcgV2luZG93c0tleWJvYXJkTWFwcGVyKGlzVVNTdGFuZGFyZCwgcmF3TWFwcGluZ3MsIG1hcEFsdEdyVG9DdHJsQWx0KTtcbn1cblxuZnVuY3Rpb24gX2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKG1hcHBlcjogV2luZG93c0tleWJvYXJkTWFwcGVyLCBrOiBudW1iZXIsIGV4cGVjdGVkOiBJUmVzb2x2ZWRLZXliaW5kaW5nW10pOiB2b2lkIHtcblx0Y29uc3Qga2V5QmluZGluZyA9IGRlY29kZUtleWJpbmRpbmcoaywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhtYXBwZXIsIGtleUJpbmRpbmchLCBleHBlY3RlZCk7XG59XG5cbnN1aXRlKCdrZXlib2FyZE1hcHBlciAtIFdJTkRPV1MgZGVfY2gnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IG1hcHBlcjogV2luZG93c0tleWJvYXJkTWFwcGVyO1xuXG5cdHN1aXRlU2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdG1hcHBlciA9IGF3YWl0IGNyZWF0ZUtleWJvYXJkTWFwcGVyKGZhbHNlLCAnd2luX2RlX2NoJywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRNYXBwaW5nKFdSSVRFX0ZJTEVfSUZfRElGRkVSRU5ULCBtYXBwZXIsICd3aW5fZGVfY2gudHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrQScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtBJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtBJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrQScsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCthJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrQSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtaJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlcixcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlaLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK1onLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1onLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtaJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK3onLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtaJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDdHJsK1onLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogdHJ1ZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLktleVosXG5cdFx0XHRcdGNvZGU6IG51bGwhXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrWicsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrWicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK1onLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwreicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1onXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtdJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlcixcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrXicsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrXicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK10nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrb2VtXzYnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgQ3RybCtdJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogS2V5Q29kZS5CcmFja2V0UmlnaHQsXG5cdFx0XHRcdGNvZGU6IG51bGwhXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrXicsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrXicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK10nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrb2VtXzYnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBTaGlmdCtdJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlcixcblx0XHRcdEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0LFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdTaGlmdCteJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnU2hpZnQrXicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdTaGlmdCtdJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdzaGlmdCtvZW1fNicsXG5cdFx0XHRcdGlzV1lTSVdZRzogZmFsc2UsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnc2hpZnQrXSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCsvJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlcixcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TbGFzaCxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtcdTAwQTcnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1x1MDBBNycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsKy8nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrb2VtXzInLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrLyddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtTaGlmdCsvJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlcixcblx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5TbGFzaCxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtTaGlmdCtcdTAwQTcnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1NoaWZ0K1x1MDBBNycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK1NoaWZ0Ky8nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrc2hpZnQrb2VtXzInLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrc2hpZnQrLyddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtLIEN0cmwrXFxcXCcsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzbGFzaCksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrSyBDdHJsK1x1MDBFNCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrSyBDb250cm9sK1x1MDBFNCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtrIGN0cmwrb2VtXzUnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IHRydWUsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtLJywgJ2N0cmwrXFxcXCddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsLCBudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtLIEN0cmwrPScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVxdWFsKSxcblx0XHRcdFtdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtEb3duQXJyb3cnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtEb3duQXJyb3cnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK0Rvd25BcnJvdycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0Rvd24nLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrZG93bicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK0Rvd25BcnJvdyddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtOVU1QQURfMCcsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTnVtcGFkMCxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtOdW1QYWQwJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtOdW1QYWQwJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK251bXBhZDAnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtOdW1QYWQwJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDdHJsK0hvbWUnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkhvbWUsXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrSG9tZScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrSG9tZScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0hvbWUnLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwraG9tZScsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK0hvbWUnXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IEN0cmwrSG9tZScsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IEtleUNvZGUuSG9tZSxcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtIb21lJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtIb21lJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrSG9tZScsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtob21lJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrSG9tZSddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlVXNlckJpbmRpbmcgQ3RybCtbQ29tbWFdIEN0cmwrLycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlciwgbmV3IEtleWJpbmRpbmcoW1xuXHRcdFx0XHRuZXcgU2NhbkNvZGVDaG9yZCh0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBTY2FuQ29kZS5Db21tYSksXG5cdFx0XHRcdG5ldyBLZXlDb2RlQ2hvcmQodHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgS2V5Q29kZS5TbGFzaCksXG5cdFx0XHRdKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCssIEN0cmwrXHUwMEE3Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCssIENvbnRyb2wrXHUwMEE3Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK29lbV9jb21tYSBjdHJsK29lbV8yJyxcblx0XHRcdFx0aXNXWVNJV1lHOiBmYWxzZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiB0cnVlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrLCcsICdjdHJsKy8nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbCwgbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBDdHJsKycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IEtleUNvZGUuQ3RybCxcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ2N0cmwnXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgna2V5Ym9hcmRNYXBwZXIgLSBXSU5ET1dTIGVuX3VzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBtYXBwZXI6IFdpbmRvd3NLZXlib2FyZE1hcHBlcjtcblxuXHRzdWl0ZVNldHVwKGFzeW5jICgpID0+IHtcblx0XHRtYXBwZXIgPSBhd2FpdCBjcmVhdGVLZXlib2FyZE1hcHBlcih0cnVlLCAnd2luX2VuX3VzJywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRNYXBwaW5nKFdSSVRFX0ZJTEVfSUZfRElGRkVSRU5ULCBtYXBwZXIsICd3aW5fZW5fdXMudHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrSyBDdHJsK1xcXFwnLCAoKSA9PiB7XG5cdFx0X2Fzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0S2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5CYWNrc2xhc2gpLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0sgQ3RybCtcXFxcJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtLIENvbnRyb2wrXFxcXCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtrIGN0cmwrXFxcXCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiB0cnVlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrSycsICdjdHJsK1xcXFwnXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbCwgbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVVc2VyQmluZGluZyBDdHJsK1tDb21tYV0gQ3RybCsvJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXliaW5kaW5nKFxuXHRcdFx0bWFwcGVyLCBuZXcgS2V5YmluZGluZyhbXG5cdFx0XHRcdG5ldyBTY2FuQ29kZUNob3JkKHRydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIFNjYW5Db2RlLkNvbW1hKSxcblx0XHRcdFx0bmV3IEtleUNvZGVDaG9yZCh0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBLZXlDb2RlLlNsYXNoKSxcblx0XHRcdF0pLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6ICdDdHJsKywgQ3RybCsvJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCssIENvbnRyb2wrLycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCssIGN0cmwrLycsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiB0cnVlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrLCcsICdjdHJsKy8nXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbCwgbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVVc2VyQmluZGluZyBDdHJsK1tDb21tYV0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRtYXBwZXIsIG5ldyBLZXliaW5kaW5nKFtcblx0XHRcdFx0bmV3IFNjYW5Db2RlQ2hvcmQodHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgU2NhbkNvZGUuQ29tbWEpLFxuXHRcdFx0XSksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrLCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrLCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsKywnLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrLCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsKywnXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBDdHJsKycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IEtleUNvZGUuQ3RybCxcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ2N0cmwnXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBTaW5nbGUgTW9kaWZpZXIgU2hpZnQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0XHRzaGlmdEtleTogdHJ1ZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogS2V5Q29kZS5TaGlmdCxcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnU2hpZnQnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdTaGlmdCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnc2hpZnQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ3NoaWZ0J10sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgU2luZ2xlIE1vZGlmaWVyIEFsdCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiB0cnVlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLkFsdCxcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQWx0Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQWx0Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdhbHQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ2FsdCddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBNZXRhKycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiBmYWxzZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IEtleUNvZGUuTWV0YSxcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnV2luZG93cycsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ1dpbmRvd3MnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ3dpbicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnbWV0YSddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IE9ubHkgTW9kaWZpZXJzIEN0cmwrU2hpZnQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLlNoaWZ0LFxuXHRcdFx0XHRjb2RlOiBudWxsIVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsK1NoaWZ0Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtTaGlmdCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtzaGlmdCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBtYXBBbHRHclRvQ3RybEFsdCBBbHRHcitaJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcHBlciA9IGF3YWl0IGNyZWF0ZUtleWJvYXJkTWFwcGVyKHRydWUsICd3aW5fZW5fdXMnLCB0cnVlKTtcblxuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogdHJ1ZSxcblx0XHRcdFx0a2V5Q29kZTogS2V5Q29kZS5LZXlaLFxuXHRcdFx0XHRjb2RlOiBudWxsIVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0FsdCtaJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtBbHQrWicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0FsdCtaJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2FsdCt6Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrYWx0K1onXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2tleWJvYXJkTWFwcGVyIC0gV0lORE9XUyBwb3JfcHRiJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBtYXBwZXI6IFdpbmRvd3NLZXlib2FyZE1hcHBlcjtcblxuXHRzdWl0ZVNldHVwKGFzeW5jICgpID0+IHtcblx0XHRtYXBwZXIgPSBhd2FpdCBjcmVhdGVLZXlib2FyZE1hcHBlcihmYWxzZSwgJ3dpbl9wb3JfcHRiJywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBwaW5nJywgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRNYXBwaW5nKFdSSVRFX0ZJTEVfSUZfRElGRkVSRU5ULCBtYXBwZXIsICd3aW5fcG9yX3B0Yi50eHQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgQ3RybCtbSW50bFJvXScsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiB0cnVlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IEtleUNvZGUuQUJOVF9DMSxcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCsvJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCsvJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrQUJOVF9DMScsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCthYm50X2MxJyxcblx0XHRcdFx0aXNXWVNJV1lHOiBmYWxzZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK0FCTlRfQzEnXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgQ3RybCtbTnVtcGFkQ29tbWFdJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogS2V5Q29kZS5BQk5UX0MyLFxuXHRcdFx0XHRjb2RlOiBudWxsIVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsKy4nLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sKy4nLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtBQk5UX0MyJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2FibnRfYzInLFxuXHRcdFx0XHRpc1dZU0lXWUc6IGZhbHNlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrQUJOVF9DMiddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgna2V5Ym9hcmRNYXBwZXIgLSBXSU5ET1dTIHJ1JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBtYXBwZXI6IFdpbmRvd3NLZXlib2FyZE1hcHBlcjtcblxuXHRzdWl0ZVNldHVwKGFzeW5jICgpID0+IHtcblx0XHRtYXBwZXIgPSBhd2FpdCBjcmVhdGVLZXlib2FyZE1hcHBlcihmYWxzZSwgJ3dpbl9ydScsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcGluZycsICgpID0+IHtcblx0XHRyZXR1cm4gYXNzZXJ0TWFwcGluZyhXUklURV9GSUxFX0lGX0RJRkZFUkVOVCwgbWFwcGVyLCAnd2luX3J1LnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjIzI0MzYxOiByZXNvbHZlS2V5YmluZGluZyBDdHJsK0sgQ3RybCtLJywgKCkgPT4ge1xuXHRcdF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlcixcblx0XHRcdEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SyksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrSyBDdHJsK0snLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK0sgQ29udHJvbCtLJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2sgY3RybCtrJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IHRydWUsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCtLJywgJ2N0cmwrSyddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsLCBudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2tleWJvYXJkTWFwcGVyIC0gbWlzYycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjM1MTM6IFRvZ2dsZSBTaWRlYmFyIFZpc2liaWxpdHkgYW5kIEdvIHRvIExpbmUgZGlzcGxheSBzYW1lIGtleSBtYXBwaW5nIGluIEFyYWJpYyBrZXlib2FyZCcsICgpID0+IHtcblx0XHRjb25zdCBtYXBwZXIgPSBuZXcgV2luZG93c0tleWJvYXJkTWFwcGVyKGZhbHNlLCB7XG5cdFx0XHQnS2V5Qic6IHtcblx0XHRcdFx0J3ZrZXknOiAnVktfQicsXG5cdFx0XHRcdCd2YWx1ZSc6ICdcdTA2NDRcdTA2MjcnLFxuXHRcdFx0XHQnd2l0aFNoaWZ0JzogJ1x1MDY0NFx1MDYyMicsXG5cdFx0XHRcdCd3aXRoQWx0R3InOiAnJyxcblx0XHRcdFx0J3dpdGhTaGlmdEFsdEdyJzogJydcblx0XHRcdH0sXG5cdFx0XHQnS2V5Ryc6IHtcblx0XHRcdFx0J3ZrZXknOiAnVktfRycsXG5cdFx0XHRcdCd2YWx1ZSc6ICdcdTA2NDQnLFxuXHRcdFx0XHQnd2l0aFNoaWZ0JzogJ1x1MDY0NFx1MDYyMycsXG5cdFx0XHRcdCd3aXRoQWx0R3InOiAnJyxcblx0XHRcdFx0J3dpdGhTaGlmdEFsdEdyJzogJydcblx0XHRcdH1cblx0XHR9LCBmYWxzZSk7XG5cblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Qixcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtCJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtCJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrQicsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCtiJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrQiddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxTQUFTLFFBQVEsZ0JBQWdCO0FBQ3BELFNBQVMsY0FBYyxrQkFBa0IsZUFBZSxrQkFBa0I7QUFDMUUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBOEIsZUFBZSw0QkFBNEIseUJBQXlCLHNCQUFzQjtBQUV4SCxTQUFTLCtDQUErQztBQUV4RCxNQUFNLDBCQUEwQjtBQUVoQyxlQUFlLHFCQUFxQixjQUF1QixNQUFjLG1CQUE0RDtBQUNwSSxRQUFNLGNBQWMsTUFBTSxlQUF3QyxJQUFJO0FBQ3RFLFNBQU8sSUFBSSxzQkFBc0IsY0FBYyxhQUFhLGlCQUFpQjtBQUM5RTtBQUVBLFNBQVMseUJBQXlCLFFBQStCLEdBQVcsVUFBdUM7QUFDbEgsUUFBTSxhQUFhLGlCQUFpQixHQUFHLGdCQUFnQixPQUFPO0FBQzlELDBCQUF3QixRQUFRLFlBQWEsUUFBUTtBQUN0RDtBQUVBLE1BQU0sa0NBQWtDLE1BQU07QUFFN0MsMENBQXdDO0FBRXhDLE1BQUk7QUFFSixhQUFXLFlBQVk7QUFDdEIsYUFBUyxNQUFNLHFCQUFxQixPQUFPLGFBQWEsS0FBSztBQUFBLEVBQzlELENBQUM7QUFFRCxPQUFLLFdBQVcsTUFBTTtBQUNy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
