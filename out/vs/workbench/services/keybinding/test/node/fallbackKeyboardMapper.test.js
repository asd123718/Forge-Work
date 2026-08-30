import { KeyChord, KeyCode, KeyMod, ScanCode } from "../../../../../base/common/keyCodes.js";
import { KeyCodeChord, decodeKeybinding, ScanCodeChord, Keybinding } from "../../../../../base/common/keybindings.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FallbackKeyboardMapper } from "../../common/fallbackKeyboardMapper.js";
import { assertResolveKeyboardEvent, assertResolveKeybinding } from "./keyboardMapperTestUtils.js";
suite("keyboardMapper - MAC fallback", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const mapper = new FallbackKeyboardMapper(false, OperatingSystem.Macintosh);
  function _assertResolveKeybinding(k, expected) {
    assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Macintosh), expected);
  }
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
        dispatchParts: ["meta+Z"],
        singleModifierDispatchParts: [null]
      }]
    );
  });
  test("resolveKeybinding Cmd+K Cmd+=", () => {
    _assertResolveKeybinding(
      KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
      [{
        label: "\u2318K \u2318=",
        ariaLabel: "Command+K Command+=",
        electronAccelerator: null,
        userSettingsLabel: "cmd+k cmd+=",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["meta+K", "meta+="],
        singleModifierDispatchParts: [null, null]
      }]
    );
  });
  test("resolveKeyboardEvent Cmd+Z", () => {
    assertResolveKeyboardEvent(
      mapper,
      {
        _standardKeyboardEventBrand: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        altGraphKey: false,
        keyCode: KeyCode.KeyZ,
        code: null
      },
      {
        label: "\u2318Z",
        ariaLabel: "Command+Z",
        electronAccelerator: "Cmd+Z",
        userSettingsLabel: "cmd+z",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: ["meta+Z"],
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
        label: "\u2318, \u2318/",
        ariaLabel: "Command+, Command+/",
        electronAccelerator: null,
        userSettingsLabel: "cmd+, cmd+/",
        isWYSIWYG: true,
        isMultiChord: true,
        dispatchParts: ["meta+,", "meta+/"],
        singleModifierDispatchParts: [null, null]
      }]
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
        label: "\u21E7",
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
        label: "\u2325",
        ariaLabel: "Option",
        electronAccelerator: null,
        userSettingsLabel: "alt",
        isWYSIWYG: true,
        isMultiChord: false,
        dispatchParts: [null],
        singleModifierDispatchParts: ["alt"]
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
        label: "\u2303\u21E7",
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
  test("resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z", () => {
    const mapper2 = new FallbackKeyboardMapper(true, OperatingSystem.Macintosh);
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
        label: "\u2303\u2325Z",
        ariaLabel: "Control+Option+Z",
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
suite("keyboardMapper - LINUX fallback", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const mapper = new FallbackKeyboardMapper(false, OperatingSystem.Linux);
  function _assertResolveKeybinding(k, expected) {
    assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux), expected);
  }
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
        dispatchParts: ["ctrl+Z"],
        singleModifierDispatchParts: [null]
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
        dispatchParts: ["ctrl+K", "ctrl+="],
        singleModifierDispatchParts: [null, null]
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
  test("resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z", () => {
    const mapper2 = new FallbackKeyboardMapper(true, OperatingSystem.Linux);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxrZXliaW5kaW5nXFx0ZXN0XFxub2RlXFxmYWxsYmFja0tleWJvYXJkTWFwcGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kLCBTY2FuQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEtleUNvZGVDaG9yZCwgZGVjb2RlS2V5YmluZGluZywgU2NhbkNvZGVDaG9yZCwgS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmFsbGJhY2tLZXlib2FyZE1hcHBlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9mYWxsYmFja0tleWJvYXJkTWFwcGVyLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZEtleWJpbmRpbmcsIGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50LCBhc3NlcnRSZXNvbHZlS2V5YmluZGluZyB9IGZyb20gJy4va2V5Ym9hcmRNYXBwZXJUZXN0VXRpbHMuanMnO1xuXG5zdWl0ZSgna2V5Ym9hcmRNYXBwZXIgLSBNQUMgZmFsbGJhY2snLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgbWFwcGVyID0gbmV3IEZhbGxiYWNrS2V5Ym9hcmRNYXBwZXIoZmFsc2UsIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpO1xuXG5cdGZ1bmN0aW9uIF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhrOiBudW1iZXIsIGV4cGVjdGVkOiBJUmVzb2x2ZWRLZXliaW5kaW5nW10pOiB2b2lkIHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhtYXBwZXIsIGRlY29kZUtleWJpbmRpbmcoaywgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCkhLCBleHBlY3RlZCk7XG5cdH1cblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDbWQrWicsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Wixcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4WicsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQrWicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDbWQrWicsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK3onLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnbWV0YStaJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5YmluZGluZyBDbWQrSyBDbWQrPScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVxdWFsKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4SyBcdTIzMTg9Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29tbWFuZCtLIENvbW1hbmQrPScsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK2sgY21kKz0nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogdHJ1ZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydtZXRhK0snLCAnbWV0YSs9J10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGwsIG51bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDbWQrWicsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiBmYWxzZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdGtleUNvZGU6IEtleUNvZGUuS2V5Wixcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4WicsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQrWicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDbWQrWicsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kK3onLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnbWV0YStaJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVVc2VyQmluZGluZyBDbWQrW0NvbW1hXSBDbWQrLycsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlciwgbmV3IEtleWJpbmRpbmcoW1xuXHRcdFx0XHRuZXcgU2NhbkNvZGVDaG9yZChmYWxzZSwgZmFsc2UsIGZhbHNlLCB0cnVlLCBTY2FuQ29kZS5Db21tYSksXG5cdFx0XHRcdG5ldyBLZXlDb2RlQ2hvcmQoZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgS2V5Q29kZS5TbGFzaCksXG5cdFx0XHRdKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzE4LCBcdTIzMTgvJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29tbWFuZCssIENvbW1hbmQrLycsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY21kKywgY21kKy8nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogdHJ1ZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydtZXRhKywnLCAnbWV0YSsvJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGwsIG51bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBTaW5nbGUgTW9kaWZpZXIgTWV0YSsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogdHJ1ZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLk1ldGEsXG5cdFx0XHRcdGNvZGU6IG51bGwhXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ1x1MjMxOCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbW1hbmQnLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2NtZCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnbWV0YSddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IFNpbmdsZSBNb2RpZmllciBTaGlmdCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLlNoaWZ0LFxuXHRcdFx0XHRjb2RlOiBudWxsIVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdcdTIxRTcnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdTaGlmdCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnc2hpZnQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ3NoaWZ0J10sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgU2luZ2xlIE1vZGlmaWVyIEFsdCsnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiB0cnVlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLkFsdCxcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzI1Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnT3B0aW9uJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdhbHQnLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbJ2FsdCddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IE9ubHkgTW9kaWZpZXJzIEN0cmwrU2hpZnQrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiB0cnVlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLlNoaWZ0LFxuXHRcdFx0XHRjb2RlOiBudWxsIVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdcdTIzMDNcdTIxRTcnLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sK1NoaWZ0Jyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK3NoaWZ0Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IG1hcEFsdEdyVG9DdHJsQWx0IEFsdEdyK1onLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwcGVyID0gbmV3IEZhbGxiYWNrS2V5Ym9hcmRNYXBwZXIodHJ1ZSwgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCk7XG5cblx0XHRhc3NlcnRSZXNvbHZlS2V5Ym9hcmRFdmVudChcblx0XHRcdG1hcHBlcixcblx0XHRcdHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiBmYWxzZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IHRydWUsXG5cdFx0XHRcdGtleUNvZGU6IEtleUNvZGUuS2V5Wixcblx0XHRcdFx0Y29kZTogbnVsbCFcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnXHUyMzAzXHUyMzI1WicsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrT3B0aW9uK1onLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiAnQ3RybCtBbHQrWicsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCthbHQreicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK2FsdCtaJ10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdrZXlib2FyZE1hcHBlciAtIExJTlVYIGZhbGxiYWNrJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IG1hcHBlciA9IG5ldyBGYWxsYmFja0tleWJvYXJkTWFwcGVyKGZhbHNlLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXG5cdGZ1bmN0aW9uIF9hc3NlcnRSZXNvbHZlS2V5YmluZGluZyhrOiBudW1iZXIsIGV4cGVjdGVkOiBJUmVzb2x2ZWRLZXliaW5kaW5nW10pOiB2b2lkIHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhtYXBwZXIsIGRlY29kZUtleWJpbmRpbmcoaywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSEsIGV4cGVjdGVkKTtcblx0fVxuXG5cdHRlc3QoJ3Jlc29sdmVLZXliaW5kaW5nIEN0cmwrWicsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Wixcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtaJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtaJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrWicsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCt6Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrWiddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJpbmRpbmcgQ3RybCtLIEN0cmwrPScsICgpID0+IHtcblx0XHRfYXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVxdWFsKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCtLIEN0cmwrPScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrSyBDb250cm9sKz0nLFxuXHRcdFx0XHRlbGVjdHJvbkFjY2VsZXJhdG9yOiBudWxsLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwrayBjdHJsKz0nLFxuXHRcdFx0XHRpc1dZU0lXWUc6IHRydWUsXG5cdFx0XHRcdGlzTXVsdGlDaG9yZDogdHJ1ZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK0snLCAnY3RybCs9J10sXG5cdFx0XHRcdHNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hQYXJ0czogW251bGwsIG51bGxdLFxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlS2V5Ym9hcmRFdmVudCBDdHJsK1onLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJvYXJkRXZlbnQoXG5cdFx0XHRtYXBwZXIsXG5cdFx0XHR7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleTogdHJ1ZSxcblx0XHRcdFx0c2hpZnRLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0R3JhcGhLZXk6IGZhbHNlLFxuXHRcdFx0XHRrZXlDb2RlOiBLZXlDb2RlLktleVosXG5cdFx0XHRcdGNvZGU6IG51bGwhXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrWicsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0NvbnRyb2wrWicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK1onLFxuXHRcdFx0XHR1c2VyU2V0dGluZ3NMYWJlbDogJ2N0cmwreicsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogWydjdHJsK1onXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVVzZXJCaW5kaW5nIEN0cmwrW0NvbW1hXSBDdHJsKy8nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UmVzb2x2ZUtleWJpbmRpbmcoXG5cdFx0XHRtYXBwZXIsIG5ldyBLZXliaW5kaW5nKFtcblx0XHRcdFx0bmV3IFNjYW5Db2RlQ2hvcmQodHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgU2NhbkNvZGUuQ29tbWEpLFxuXHRcdFx0XHRuZXcgS2V5Q29kZUNob3JkKHRydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIEtleUNvZGUuU2xhc2gpLFxuXHRcdFx0XSksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogJ0N0cmwrLCBDdHJsKy8nLFxuXHRcdFx0XHRhcmlhTGFiZWw6ICdDb250cm9sKywgQ29udHJvbCsvJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogbnVsbCxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsKywgY3RybCsvJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IHRydWUsXG5cdFx0XHRcdGRpc3BhdGNoUGFydHM6IFsnY3RybCssJywgJ2N0cmwrLyddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsLCBudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVVzZXJCaW5kaW5nIEN0cmwrW0NvbW1hXScsICgpID0+IHtcblx0XHRhc3NlcnRSZXNvbHZlS2V5YmluZGluZyhcblx0XHRcdG1hcHBlciwgbmV3IEtleWJpbmRpbmcoW1xuXHRcdFx0XHRuZXcgU2NhbkNvZGVDaG9yZCh0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBTY2FuQ29kZS5Db21tYSksXG5cdFx0XHRdKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiAnQ3RybCssJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCssJyxcblx0XHRcdFx0ZWxlY3Ryb25BY2NlbGVyYXRvcjogJ0N0cmwrLCcsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCssJyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrLCddLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFtudWxsXSxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUtleWJvYXJkRXZlbnQgU2luZ2xlIE1vZGlmaWVyIEN0cmwrJywgKCkgPT4ge1xuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IHRydWUsXG5cdFx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0a2V5Q29kZTogS2V5Q29kZS5DdHJsLFxuXHRcdFx0XHRjb2RlOiBudWxsIVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCcsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6IG51bGwsXG5cdFx0XHRcdHVzZXJTZXR0aW5nc0xhYmVsOiAnY3RybCcsXG5cdFx0XHRcdGlzV1lTSVdZRzogdHJ1ZSxcblx0XHRcdFx0aXNNdWx0aUNob3JkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGF0Y2hQYXJ0czogW251bGxdLFxuXHRcdFx0XHRzaW5nbGVNb2RpZmllckRpc3BhdGNoUGFydHM6IFsnY3RybCddLFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVLZXlib2FyZEV2ZW50IG1hcEFsdEdyVG9DdHJsQWx0IEFsdEdyK1onLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwcGVyID0gbmV3IEZhbGxiYWNrS2V5Ym9hcmRNYXBwZXIodHJ1ZSwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblxuXHRcdGFzc2VydFJlc29sdmVLZXlib2FyZEV2ZW50KFxuXHRcdFx0bWFwcGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRfc3RhbmRhcmRLZXlib2FyZEV2ZW50QnJhbmQ6IHRydWUsXG5cdFx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRcdGFsdEtleTogZmFsc2UsXG5cdFx0XHRcdG1ldGFLZXk6IGZhbHNlLFxuXHRcdFx0XHRhbHRHcmFwaEtleTogdHJ1ZSxcblx0XHRcdFx0a2V5Q29kZTogS2V5Q29kZS5LZXlaLFxuXHRcdFx0XHRjb2RlOiBudWxsIVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdDdHJsK0FsdCtaJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQ29udHJvbCtBbHQrWicsXG5cdFx0XHRcdGVsZWN0cm9uQWNjZWxlcmF0b3I6ICdDdHJsK0FsdCtaJyxcblx0XHRcdFx0dXNlclNldHRpbmdzTGFiZWw6ICdjdHJsK2FsdCt6Jyxcblx0XHRcdFx0aXNXWVNJV1lHOiB0cnVlLFxuXHRcdFx0XHRpc011bHRpQ2hvcmQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwYXRjaFBhcnRzOiBbJ2N0cmwrYWx0K1onXSxcblx0XHRcdFx0c2luZ2xlTW9kaWZpZXJEaXNwYXRjaFBhcnRzOiBbbnVsbF0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxTQUFTLFFBQVEsZ0JBQWdCO0FBQ3BELFNBQVMsY0FBYyxrQkFBa0IsZUFBZSxrQkFBa0I7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
