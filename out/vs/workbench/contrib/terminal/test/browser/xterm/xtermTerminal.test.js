import { deepStrictEqual, ok, strictEqual } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { timeout } from "../../../../../../base/common/async.js";
import { Color, RGBA } from "../../../../../../base/common/color.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { TestColorTheme } from "../../../../../../platform/theme/test/common/testThemeService.js";
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from "../../../../../common/theme.js";
import { ViewContainerLocation } from "../../../../../common/views.js";
import { XtermTerminal } from "../../../browser/xterm/xtermTerminal.js";
import { TERMINAL_VIEW_ID } from "../../../common/terminal.js";
import { registerColors, TERMINAL_BACKGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_FOREGROUND_COLOR, TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_FOREGROUND_COLOR } from "../../../common/terminalColorRegistry.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { TestWebglAddon, TestXtermAddonImporter } from "./xtermTestUtils.js";
registerColors();
class TestViewDescriptorService {
  constructor() {
    this._location = ViewContainerLocation.Panel;
    this._onDidChangeLocation = new Emitter();
    this.onDidChangeLocation = this._onDidChangeLocation.event;
  }
  getViewLocationById(id) {
    return this._location;
  }
  moveTerminalToLocation(to) {
    const oldLocation = this._location;
    this._location = to;
    this._onDidChangeLocation.fire({
      views: [
        { id: TERMINAL_VIEW_ID }
      ],
      from: oldLocation,
      to
    });
  }
}
const defaultTerminalConfig = {
  fontFamily: "monospace",
  fontWeight: "normal",
  fontWeightBold: "normal",
  gpuAcceleration: "off",
  scrollback: 10,
  fastScrollSensitivity: 2,
  mouseWheelScrollSensitivity: 1,
  unicodeVersion: "6"
};
suite("XtermTerminal", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let themeService;
  let xterm;
  let XTermBaseCtor;
  function write(data) {
    return new Promise((resolve) => {
      xterm.write(data, resolve);
    });
  }
  setup(async () => {
    configurationService = new TestConfigurationService({
      editor: {
        fastScrollSensitivity: 2,
        mouseWheelScrollSensitivity: 1
      },
      files: {},
      terminal: {
        integrated: defaultTerminalConfig
      }
    });
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService
    }, store);
    themeService = instantiationService.get(IThemeService);
    XTermBaseCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    const capabilityStore = store.add(new TerminalCapabilityStore());
    xterm = store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
      cols: 80,
      rows: 30,
      xtermColorProvider: { getBackgroundColor: () => void 0 },
      capabilities: capabilityStore,
      disableShellIntegrationReporting: true,
      xtermAddonImporter: new TestXtermAddonImporter()
    }, void 0));
    TestWebglAddon.shouldThrow = false;
    TestWebglAddon.isEnabled = false;
    TestWebglAddon.customGlyphOptions.length = 0;
  });
  test("should use fallback dimensions of 80x30", () => {
    strictEqual(xterm.raw.cols, 80);
    strictEqual(xterm.raw.rows, 30);
  });
  test("disables custom glyphs when moved into an auxiliary window", async () => {
    await configurationService.setUserConfiguration("terminal.integrated", {
      ...defaultTerminalConfig,
      gpuAcceleration: "on",
      customGlyphs: true
    });
    configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock() {
      affectsConfiguration(section) {
        return section.startsWith("terminal.integrated");
      }
    }());
    const mainContainer = document.createElement("div");
    document.body.appendChild(mainContainer);
    store.add(toDisposable(() => mainContainer.remove()));
    xterm.attachToElement(mainContainer);
    await timeout(0);
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    store.add(toDisposable(() => iframe.remove()));
    const auxiliaryDocument = iframe.contentDocument;
    const auxiliaryContainer = document.createElement("div");
    auxiliaryDocument.body.appendChild(auxiliaryContainer);
    const createElement = auxiliaryDocument.createElement;
    auxiliaryDocument.createElement = () => {
      throw new Error("Not allowed to create elements in child window JavaScript context.");
    };
    store.add(toDisposable(() => auxiliaryDocument.createElement = createElement));
    auxiliaryContainer.appendChild(xterm.raw.element);
    xterm.raw.open(xterm.raw.element);
    xterm.refresh();
    await timeout(0);
    mainContainer.appendChild(xterm.raw.element);
    xterm.raw.open(xterm.raw.element);
    xterm.refresh();
    await timeout(0);
    deepStrictEqual(TestWebglAddon.customGlyphOptions, [true, false, true]);
  });
  test("does not load stale custom glyph settings when moved during addon import", async () => {
    await configurationService.setUserConfiguration("terminal.integrated", {
      ...defaultTerminalConfig,
      gpuAcceleration: "on",
      customGlyphs: true
    });
    configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock() {
      affectsConfiguration(section) {
        return section.startsWith("terminal.integrated");
      }
    }());
    const mainContainer = document.createElement("div");
    document.body.appendChild(mainContainer);
    store.add(toDisposable(() => mainContainer.remove()));
    xterm.attachToElement(mainContainer);
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    store.add(toDisposable(() => iframe.remove()));
    const auxiliaryDocument = iframe.contentDocument;
    const auxiliaryContainer = document.createElement("div");
    auxiliaryDocument.body.appendChild(auxiliaryContainer);
    const createElement = auxiliaryDocument.createElement;
    auxiliaryDocument.createElement = () => {
      throw new Error("Not allowed to create elements in child window JavaScript context.");
    };
    store.add(toDisposable(() => auxiliaryDocument.createElement = createElement));
    auxiliaryContainer.appendChild(xterm.raw.element);
    xterm.raw.open(xterm.raw.element);
    xterm.refresh();
    await timeout(0);
    deepStrictEqual(TestWebglAddon.customGlyphOptions, [false]);
  });
  suite("getContentsAsText", () => {
    test("should return all buffer contents when no markers provided", async () => {
      await write("line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5");
      const result = xterm.getContentsAsText();
      strictEqual(result.startsWith("line 1\nline 2\nline 3\nline 4\nline 5"), true, "Should include the content plus empty lines up to buffer length");
      const lines = result.split("\n");
      strictEqual(lines.length, xterm.raw.buffer.active.length, "Should end with empty lines (total buffer size is 30 rows)");
    });
    test("should return contents from start marker to end", async () => {
      await write("line 1\r\n");
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\nline 3\r\nline 4\r\nline 5");
      const result = xterm.getContentsAsText(startMarker);
      strictEqual(result.startsWith("line 2\nline 3\nline 4\nline 5"), true, "Should start with line 2 and include empty lines");
    });
    test("should return contents from start to end marker", async () => {
      await write("line 1\r\n");
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\nline 3\r\n");
      const endMarker = xterm.raw.registerMarker(0);
      await write("line 4\r\nline 5");
      const result = xterm.getContentsAsText(startMarker, endMarker);
      strictEqual(result, "line 2\nline 3\nline 4");
    });
    test("should return single line when start and end markers are the same", async () => {
      await write("line 1\r\nline 2\r\n");
      const marker = xterm.raw.registerMarker(0);
      await write("line 3\r\nline 4\r\nline 5");
      const result = xterm.getContentsAsText(marker, marker);
      strictEqual(result, "line 3");
    });
    test("should return empty string when start marker is beyond end marker", async () => {
      await write("line 1\r\n");
      const endMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\nline 3\r\n");
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 4\r\nline 5");
      const result = xterm.getContentsAsText(startMarker, endMarker);
      strictEqual(result, "");
    });
    test("should handle empty buffer", async () => {
      const result = xterm.getContentsAsText();
      const lines = result.split("\n");
      strictEqual(lines.length, xterm.raw.buffer.active.length, "Empty terminal should have empty lines equal to buffer length");
      strictEqual(lines.every((line) => line === ""), true, "All lines should be empty");
    });
    test("should handle mixed content with spaces and special characters", async () => {
      await write("hello world\r\n  indented line\r\nline with $pecial chars!@#\r\n\r\nempty line above");
      const result = xterm.getContentsAsText();
      strictEqual(result.startsWith("hello world\n  indented line\nline with $pecial chars!@#\n\nempty line above"), true, "Should handle spaces and special characters correctly");
    });
    test("should fall back to line 0 when startMarker is disposed (line === -1)", async () => {
      await write("line 1\r\n");
      const disposedMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\nline 3\r\nline 4\r\nline 5");
      disposedMarker.dispose();
      const result = xterm.getContentsAsText(disposedMarker);
      ok(result.startsWith("line 1\nline 2\nline 3\nline 4\nline 5"), `Unexpected result: ${result}`);
    });
    test("should throw error when endMarker is disposed (line === -1)", async () => {
      await write("line 1\r\n");
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\n");
      const disposedEndMarker = xterm.raw.registerMarker(0);
      await write("line 3\r\nline 4\r\nline 5");
      disposedEndMarker.dispose();
      try {
        xterm.getContentsAsText(startMarker, disposedEndMarker);
        throw new Error("Expected error was not thrown");
      } catch (error) {
        strictEqual(error.message, "Cannot get contents of a disposed endMarker");
      }
    });
    test("should handle markers at buffer boundaries", async () => {
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 1\r\nline 2\r\nline 3\r\nline 4\r\n");
      const endMarker = xterm.raw.registerMarker(0);
      await write("line 5");
      const result = xterm.getContentsAsText(startMarker, endMarker);
      strictEqual(result, "line 1\nline 2\nline 3\nline 4\nline 5", "Should handle markers at buffer boundaries correctly");
    });
    test("should handle terminal escape sequences properly", async () => {
      await write("\x1B[31mred text\x1B[0m\r\n\x1B[32mgreen text\x1B[0m");
      const result = xterm.getContentsAsText();
      strictEqual(result.startsWith("red text\ngreen text"), true, "ANSI escape sequences should be filtered out, but there will be trailing empty lines");
    });
  });
  suite("getBufferReverseIterator", () => {
    test("should get text properly within scrollback limit", async () => {
      const text = "line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5";
      await write(text);
      const result = [...xterm.getBufferReverseIterator()].reverse().join("\r\n");
      strictEqual(text, result, "Should equal original text");
    });
    test("should get text properly when exceed scrollback limit", async () => {
      const text = "line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\n".repeat(8).trim();
      await write(text);
      await write("\r\nline more");
      const result = [...xterm.getBufferReverseIterator()].reverse().join("\r\n");
      const expect = text.slice(8) + "\r\nline more";
      strictEqual(expect, result, "Should equal original text without line 1");
    });
  });
  suite("theme", () => {
    test("should apply correct background color based on getBackgroundColor", () => {
      themeService.setTheme(new TestColorTheme({
        [PANEL_BACKGROUND]: "#ff0000",
        [SIDE_BAR_BACKGROUND]: "#00ff00"
      }));
      xterm = store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
        cols: 80,
        rows: 30,
        xtermAddonImporter: new TestXtermAddonImporter(),
        xtermColorProvider: { getBackgroundColor: () => new Color(new RGBA(255, 0, 0)) },
        capabilities: store.add(new TerminalCapabilityStore()),
        disableShellIntegrationReporting: true
      }, void 0));
      strictEqual(xterm.raw.options.theme?.background, "#ff0000");
    });
    test("should react to and apply theme changes", () => {
      themeService.setTheme(new TestColorTheme({
        [TERMINAL_BACKGROUND_COLOR]: "#000100",
        [TERMINAL_FOREGROUND_COLOR]: "#000200",
        [TERMINAL_CURSOR_FOREGROUND_COLOR]: "#000300",
        [TERMINAL_CURSOR_BACKGROUND_COLOR]: "#000400",
        [TERMINAL_SELECTION_BACKGROUND_COLOR]: "#000500",
        [TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR]: "#000600",
        [TERMINAL_SELECTION_FOREGROUND_COLOR]: void 0,
        "terminal.ansiBlack": "#010000",
        "terminal.ansiRed": "#020000",
        "terminal.ansiGreen": "#030000",
        "terminal.ansiYellow": "#040000",
        "terminal.ansiBlue": "#050000",
        "terminal.ansiMagenta": "#060000",
        "terminal.ansiCyan": "#070000",
        "terminal.ansiWhite": "#080000",
        "terminal.ansiBrightBlack": "#090000",
        "terminal.ansiBrightRed": "#100000",
        "terminal.ansiBrightGreen": "#110000",
        "terminal.ansiBrightYellow": "#120000",
        "terminal.ansiBrightBlue": "#130000",
        "terminal.ansiBrightMagenta": "#140000",
        "terminal.ansiBrightCyan": "#150000",
        "terminal.ansiBrightWhite": "#160000"
      }));
      xterm = store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
        cols: 80,
        rows: 30,
        xtermAddonImporter: new TestXtermAddonImporter(),
        xtermColorProvider: { getBackgroundColor: () => void 0 },
        capabilities: store.add(new TerminalCapabilityStore()),
        disableShellIntegrationReporting: true
      }, void 0));
      deepStrictEqual(xterm.raw.options.theme, {
        background: void 0,
        foreground: "#000200",
        cursor: "#000300",
        cursorAccent: "#000400",
        selectionBackground: "#000500",
        selectionInactiveBackground: "#000600",
        selectionForeground: void 0,
        overviewRulerBorder: void 0,
        scrollbarSliderActiveBackground: void 0,
        scrollbarSliderBackground: void 0,
        scrollbarSliderHoverBackground: void 0,
        black: "#010000",
        green: "#030000",
        red: "#020000",
        yellow: "#040000",
        blue: "#050000",
        magenta: "#060000",
        cyan: "#070000",
        white: "#080000",
        brightBlack: "#090000",
        brightRed: "#100000",
        brightGreen: "#110000",
        brightYellow: "#120000",
        brightBlue: "#130000",
        brightMagenta: "#140000",
        brightCyan: "#150000",
        brightWhite: "#160000"
      });
      themeService.setTheme(new TestColorTheme({
        [TERMINAL_BACKGROUND_COLOR]: "#00010f",
        [TERMINAL_FOREGROUND_COLOR]: "#00020f",
        [TERMINAL_CURSOR_FOREGROUND_COLOR]: "#00030f",
        [TERMINAL_CURSOR_BACKGROUND_COLOR]: "#00040f",
        [TERMINAL_SELECTION_BACKGROUND_COLOR]: "#00050f",
        [TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR]: "#00060f",
        [TERMINAL_SELECTION_FOREGROUND_COLOR]: "#00070f",
        "terminal.ansiBlack": "#01000f",
        "terminal.ansiRed": "#02000f",
        "terminal.ansiGreen": "#03000f",
        "terminal.ansiYellow": "#04000f",
        "terminal.ansiBlue": "#05000f",
        "terminal.ansiMagenta": "#06000f",
        "terminal.ansiCyan": "#07000f",
        "terminal.ansiWhite": "#08000f",
        "terminal.ansiBrightBlack": "#09000f",
        "terminal.ansiBrightRed": "#10000f",
        "terminal.ansiBrightGreen": "#11000f",
        "terminal.ansiBrightYellow": "#12000f",
        "terminal.ansiBrightBlue": "#13000f",
        "terminal.ansiBrightMagenta": "#14000f",
        "terminal.ansiBrightCyan": "#15000f",
        "terminal.ansiBrightWhite": "#16000f"
      }));
      deepStrictEqual(xterm.raw.options.theme, {
        background: void 0,
        foreground: "#00020f",
        cursor: "#00030f",
        cursorAccent: "#00040f",
        selectionBackground: "#00050f",
        selectionInactiveBackground: "#00060f",
        selectionForeground: "#00070f",
        overviewRulerBorder: void 0,
        scrollbarSliderActiveBackground: void 0,
        scrollbarSliderBackground: void 0,
        scrollbarSliderHoverBackground: void 0,
        black: "#01000f",
        green: "#03000f",
        red: "#02000f",
        yellow: "#04000f",
        blue: "#05000f",
        magenta: "#06000f",
        cyan: "#07000f",
        white: "#08000f",
        brightBlack: "#09000f",
        brightRed: "#10000f",
        brightGreen: "#11000f",
        brightYellow: "#12000f",
        brightBlue: "#13000f",
        brightMagenta: "#14000f",
        brightCyan: "#15000f",
        brightWhite: "#16000f"
      });
    });
  });
});
export {
  TestViewDescriptorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx4dGVybVxceHRlcm1UZXJtaW5hbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29sb3IsIFJHQkEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb2xvclRoZW1lLCBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CQUNLR1JPVU5ELCBTSURFX0JBUl9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvciwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFh0ZXJtVGVybWluYWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3h0ZXJtL3h0ZXJtVGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29uZmlndXJhdGlvbiwgVEVSTUlOQUxfVklFV19JRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbG9ycywgVEVSTUlOQUxfQkFDS0dST1VORF9DT0xPUiwgVEVSTUlOQUxfQ1VSU09SX0JBQ0tHUk9VTkRfQ09MT1IsIFRFUk1JTkFMX0NVUlNPUl9GT1JFR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9GT1JFR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9JTkFDVElWRV9TRUxFQ1RJT05fQkFDS0dST1VORF9DT0xPUiwgVEVSTUlOQUxfU0VMRUNUSU9OX0JBQ0tHUk9VTkRfQ09MT1IsIFRFUk1JTkFMX1NFTEVDVElPTl9GT1JFR1JPVU5EX0NPTE9SIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rlcm1pbmFsQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdFdlYmdsQWRkb24sIFRlc3RYdGVybUFkZG9uSW1wb3J0ZXIgfSBmcm9tICcuL3h0ZXJtVGVzdFV0aWxzLmpzJztcblxucmVnaXN0ZXJDb2xvcnMoKTtcblxuZXhwb3J0IGNsYXNzIFRlc3RWaWV3RGVzY3JpcHRvclNlcnZpY2UgaW1wbGVtZW50cyBQYXJ0aWFsPElWaWV3RGVzY3JpcHRvclNlcnZpY2U+IHtcblx0cHJpdmF0ZSBfbG9jYXRpb24gPSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlTG9jYXRpb24gPSBuZXcgRW1pdHRlcjx7IHZpZXdzOiBJVmlld0Rlc2NyaXB0b3JbXTsgZnJvbTogVmlld0NvbnRhaW5lckxvY2F0aW9uOyB0bzogVmlld0NvbnRhaW5lckxvY2F0aW9uIH0+KCk7XG5cdG9uRGlkQ2hhbmdlTG9jYXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZUxvY2F0aW9uLmV2ZW50O1xuXHRnZXRWaWV3TG9jYXRpb25CeUlkKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fbG9jYXRpb247XG5cdH1cblx0bW92ZVRlcm1pbmFsVG9Mb2NhdGlvbih0bzogVmlld0NvbnRhaW5lckxvY2F0aW9uKSB7XG5cdFx0Y29uc3Qgb2xkTG9jYXRpb24gPSB0aGlzLl9sb2NhdGlvbjtcblx0XHR0aGlzLl9sb2NhdGlvbiA9IHRvO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTG9jYXRpb24uZmlyZSh7XG5cdFx0XHR2aWV3czogW1xuXHRcdFx0XHR7IGlkOiBURVJNSU5BTF9WSUVXX0lEIH0gYXMgdW5rbm93biBhcyBJVmlld0Rlc2NyaXB0b3Jcblx0XHRcdF0sXG5cdFx0XHRmcm9tOiBvbGRMb2NhdGlvbixcblx0XHRcdHRvXG5cdFx0fSk7XG5cdH1cbn1cblxuY29uc3QgZGVmYXVsdFRlcm1pbmFsQ29uZmlnOiBQYXJ0aWFsPElUZXJtaW5hbENvbmZpZ3VyYXRpb24+ID0ge1xuXHRmb250RmFtaWx5OiAnbW9ub3NwYWNlJyxcblx0Zm9udFdlaWdodDogJ25vcm1hbCcsXG5cdGZvbnRXZWlnaHRCb2xkOiAnbm9ybWFsJyxcblx0Z3B1QWNjZWxlcmF0aW9uOiAnb2ZmJyxcblx0c2Nyb2xsYmFjazogMTAsXG5cdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogMixcblx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiAxLFxuXHR1bmljb2RlVmVyc2lvbjogJzYnXG59O1xuXG5zdWl0ZSgnWHRlcm1UZXJtaW5hbCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCB0aGVtZVNlcnZpY2U6IFRlc3RUaGVtZVNlcnZpY2U7XG5cdGxldCB4dGVybTogWHRlcm1UZXJtaW5hbDtcblx0bGV0IFhUZXJtQmFzZUN0b3I6IHR5cGVvZiBUZXJtaW5hbDtcblxuXHRmdW5jdGlvbiB3cml0ZShkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcblx0XHRcdHh0ZXJtLndyaXRlKGRhdGEsIHJlc29sdmUpO1xuXHRcdH0pO1xuXHR9XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiAyLFxuXHRcdFx0XHRtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk6IDFcblx0XHRcdH0gYXMgUGFydGlhbDxJRWRpdG9yT3B0aW9ucz4sXG5cdFx0XHRmaWxlczoge30sXG5cdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRpbnRlZ3JhdGVkOiBkZWZhdWx0VGVybWluYWxDb25maWdcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0fSwgc3RvcmUpO1xuXHRcdHRoZW1lU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVGhlbWVTZXJ2aWNlKSBhcyBUZXN0VGhlbWVTZXJ2aWNlO1xuXG5cdFx0WFRlcm1CYXNlQ3RvciA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblxuXHRcdGNvbnN0IGNhcGFiaWxpdHlTdG9yZSA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSk7XG5cdFx0eHRlcm0gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoWHRlcm1UZXJtaW5hbCwgdW5kZWZpbmVkLCBYVGVybUJhc2VDdG9yLCB7XG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDMwLFxuXHRcdFx0eHRlcm1Db2xvclByb3ZpZGVyOiB7IGdldEJhY2tncm91bmRDb2xvcjogKCkgPT4gdW5kZWZpbmVkIH0sXG5cdFx0XHRjYXBhYmlsaXRpZXM6IGNhcGFiaWxpdHlTdG9yZSxcblx0XHRcdGRpc2FibGVTaGVsbEludGVncmF0aW9uUmVwb3J0aW5nOiB0cnVlLFxuXHRcdFx0eHRlcm1BZGRvbkltcG9ydGVyOiBuZXcgVGVzdFh0ZXJtQWRkb25JbXBvcnRlcigpLFxuXHRcdH0sIHVuZGVmaW5lZCkpO1xuXG5cdFx0VGVzdFdlYmdsQWRkb24uc2hvdWxkVGhyb3cgPSBmYWxzZTtcblx0XHRUZXN0V2ViZ2xBZGRvbi5pc0VuYWJsZWQgPSBmYWxzZTtcblx0XHRUZXN0V2ViZ2xBZGRvbi5jdXN0b21HbHlwaE9wdGlvbnMubGVuZ3RoID0gMDtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHVzZSBmYWxsYmFjayBkaW1lbnNpb25zIG9mIDgweDMwJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKHh0ZXJtLnJhdy5jb2xzLCA4MCk7XG5cdFx0c3RyaWN0RXF1YWwoeHRlcm0ucmF3LnJvd3MsIDMwKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZXMgY3VzdG9tIGdseXBocyB3aGVuIG1vdmVkIGludG8gYW4gYXV4aWxpYXJ5IHdpbmRvdycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbigndGVybWluYWwuaW50ZWdyYXRlZCcsIHtcblx0XHRcdC4uLmRlZmF1bHRUZXJtaW5hbENvbmZpZyxcblx0XHRcdGdwdUFjY2VsZXJhdGlvbjogJ29uJyxcblx0XHRcdGN1c3RvbUdseXBoczogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpIHtcblx0XHRcdG92ZXJyaWRlIGFmZmVjdHNDb25maWd1cmF0aW9uKHNlY3Rpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gc2VjdGlvbi5zdGFydHNXaXRoKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtYWluQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChtYWluQ29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG1haW5Db250YWluZXIucmVtb3ZlKCkpKTtcblx0XHR4dGVybS5hdHRhY2hUb0VsZW1lbnQobWFpbkNvbnRhaW5lcik7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IGlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGlmcmFtZS5yZW1vdmUoKSkpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeURvY3VtZW50ID0gaWZyYW1lLmNvbnRlbnREb2N1bWVudCE7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5Q29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0YXV4aWxpYXJ5RG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhdXhpbGlhcnlDb250YWluZXIpO1xuXHRcdGNvbnN0IGNyZWF0ZUVsZW1lbnQgPSBhdXhpbGlhcnlEb2N1bWVudC5jcmVhdGVFbGVtZW50O1xuXHRcdGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQgPSAoKSA9PiB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBhbGxvd2VkIHRvIGNyZWF0ZSBlbGVtZW50cyBpbiBjaGlsZCB3aW5kb3cgSmF2YVNjcmlwdCBjb250ZXh0LicpO1xuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhdXhpbGlhcnlEb2N1bWVudC5jcmVhdGVFbGVtZW50ID0gY3JlYXRlRWxlbWVudCkpO1xuXG5cdFx0YXV4aWxpYXJ5Q29udGFpbmVyLmFwcGVuZENoaWxkKHh0ZXJtLnJhdy5lbGVtZW50ISk7XG5cdFx0eHRlcm0ucmF3Lm9wZW4oeHRlcm0ucmF3LmVsZW1lbnQhKTtcblx0XHR4dGVybS5yZWZyZXNoKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdG1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQoeHRlcm0ucmF3LmVsZW1lbnQhKTtcblx0XHR4dGVybS5yYXcub3Blbih4dGVybS5yYXcuZWxlbWVudCEpO1xuXHRcdHh0ZXJtLnJlZnJlc2goKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0ZGVlcFN0cmljdEVxdWFsKFRlc3RXZWJnbEFkZG9uLmN1c3RvbUdseXBoT3B0aW9ucywgW3RydWUsIGZhbHNlLCB0cnVlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGxvYWQgc3RhbGUgY3VzdG9tIGdseXBoIHNldHRpbmdzIHdoZW4gbW92ZWQgZHVyaW5nIGFkZG9uIGltcG9ydCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbigndGVybWluYWwuaW50ZWdyYXRlZCcsIHtcblx0XHRcdC4uLmRlZmF1bHRUZXJtaW5hbENvbmZpZyxcblx0XHRcdGdwdUFjY2VsZXJhdGlvbjogJ29uJyxcblx0XHRcdGN1c3RvbUdseXBoczogdHJ1ZSxcblx0XHR9KTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpIHtcblx0XHRcdG92ZXJyaWRlIGFmZmVjdHNDb25maWd1cmF0aW9uKHNlY3Rpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gc2VjdGlvbi5zdGFydHNXaXRoKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtYWluQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChtYWluQ29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG1haW5Db250YWluZXIucmVtb3ZlKCkpKTtcblx0XHR4dGVybS5hdHRhY2hUb0VsZW1lbnQobWFpbkNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBpZnJhbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGlmcmFtZSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBpZnJhbWUucmVtb3ZlKCkpKTtcblx0XHRjb25zdCBhdXhpbGlhcnlEb2N1bWVudCA9IGlmcmFtZS5jb250ZW50RG9jdW1lbnQhO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGF1eGlsaWFyeURvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYXV4aWxpYXJ5Q29udGFpbmVyKTtcblx0XHRjb25zdCBjcmVhdGVFbGVtZW50ID0gYXV4aWxpYXJ5RG9jdW1lbnQuY3JlYXRlRWxlbWVudDtcblx0XHRhdXhpbGlhcnlEb2N1bWVudC5jcmVhdGVFbGVtZW50ID0gKCkgPT4ge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgYWxsb3dlZCB0byBjcmVhdGUgZWxlbWVudHMgaW4gY2hpbGQgd2luZG93IEphdmFTY3JpcHQgY29udGV4dC4nKTtcblx0XHR9O1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYXV4aWxpYXJ5RG9jdW1lbnQuY3JlYXRlRWxlbWVudCA9IGNyZWF0ZUVsZW1lbnQpKTtcblxuXHRcdGF1eGlsaWFyeUNvbnRhaW5lci5hcHBlbmRDaGlsZCh4dGVybS5yYXcuZWxlbWVudCEpO1xuXHRcdHh0ZXJtLnJhdy5vcGVuKHh0ZXJtLnJhdy5lbGVtZW50ISk7XG5cdFx0eHRlcm0ucmVmcmVzaCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwoVGVzdFdlYmdsQWRkb24uY3VzdG9tR2x5cGhPcHRpb25zLCBbZmFsc2VdKTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldENvbnRlbnRzQXNUZXh0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gYWxsIGJ1ZmZlciBjb250ZW50cyB3aGVuIG5vIG1hcmtlcnMgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAxXFxyXFxubGluZSAyXFxyXFxubGluZSAzXFxyXFxubGluZSA0XFxyXFxubGluZSA1Jyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQuc3RhcnRzV2l0aCgnbGluZSAxXFxubGluZSAyXFxubGluZSAzXFxubGluZSA0XFxubGluZSA1JyksIHRydWUsICdTaG91bGQgaW5jbHVkZSB0aGUgY29udGVudCBwbHVzIGVtcHR5IGxpbmVzIHVwIHRvIGJ1ZmZlciBsZW5ndGgnKTtcblx0XHRcdGNvbnN0IGxpbmVzID0gcmVzdWx0LnNwbGl0KCdcXG4nKTtcblx0XHRcdHN0cmljdEVxdWFsKGxpbmVzLmxlbmd0aCwgeHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUubGVuZ3RoLCAnU2hvdWxkIGVuZCB3aXRoIGVtcHR5IGxpbmVzICh0b3RhbCBidWZmZXIgc2l6ZSBpcyAzMCByb3dzKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBjb250ZW50cyBmcm9tIHN0YXJ0IG1hcmtlciB0byBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAxXFxyXFxuJyk7XG5cdFx0XHRjb25zdCBzdGFydE1hcmtlciA9IHh0ZXJtLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAyXFxyXFxubGluZSAzXFxyXFxubGluZSA0XFxyXFxubGluZSA1Jyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KHN0YXJ0TWFya2VyKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC5zdGFydHNXaXRoKCdsaW5lIDJcXG5saW5lIDNcXG5saW5lIDRcXG5saW5lIDUnKSwgdHJ1ZSwgJ1Nob3VsZCBzdGFydCB3aXRoIGxpbmUgMiBhbmQgaW5jbHVkZSBlbXB0eSBsaW5lcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBjb250ZW50cyBmcm9tIHN0YXJ0IHRvIGVuZCBtYXJrZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAxXFxyXFxuJyk7XG5cdFx0XHRjb25zdCBzdGFydE1hcmtlciA9IHh0ZXJtLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAyXFxyXFxubGluZSAzXFxyXFxuJyk7XG5cdFx0XHRjb25zdCBlbmRNYXJrZXIgPSB4dGVybS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgNFxcclxcbmxpbmUgNScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB4dGVybS5nZXRDb250ZW50c0FzVGV4dChzdGFydE1hcmtlciwgZW5kTWFya2VyKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ2xpbmUgMlxcbmxpbmUgM1xcbmxpbmUgNCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBzaW5nbGUgbGluZSB3aGVuIHN0YXJ0IGFuZCBlbmQgbWFya2VycyBhcmUgdGhlIHNhbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAxXFxyXFxubGluZSAyXFxyXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXIgPSB4dGVybS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB4dGVybS5nZXRDb250ZW50c0FzVGV4dChtYXJrZXIsIG1hcmtlcik7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdsaW5lIDMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZW1wdHkgc3RyaW5nIHdoZW4gc3RhcnQgbWFya2VyIGlzIGJleW9uZCBlbmQgbWFya2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMVxcclxcbicpO1xuXHRcdFx0Y29uc3QgZW5kTWFya2VyID0geHRlcm0ucmF3LnJlZ2lzdGVyTWFya2VyKDApITtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDJcXHJcXG5saW5lIDNcXHJcXG4nKTtcblx0XHRcdGNvbnN0IHN0YXJ0TWFya2VyID0geHRlcm0ucmF3LnJlZ2lzdGVyTWFya2VyKDApITtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDRcXHJcXG5saW5lIDUnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0geHRlcm0uZ2V0Q29udGVudHNBc1RleHQoc3RhcnRNYXJrZXIsIGVuZE1hcmtlcik7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgYnVmZmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0geHRlcm0uZ2V0Q29udGVudHNBc1RleHQoKTtcblx0XHRcdGNvbnN0IGxpbmVzID0gcmVzdWx0LnNwbGl0KCdcXG4nKTtcblx0XHRcdHN0cmljdEVxdWFsKGxpbmVzLmxlbmd0aCwgeHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUubGVuZ3RoLCAnRW1wdHkgdGVybWluYWwgc2hvdWxkIGhhdmUgZW1wdHkgbGluZXMgZXF1YWwgdG8gYnVmZmVyIGxlbmd0aCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwobGluZXMuZXZlcnkobGluZSA9PiBsaW5lID09PSAnJyksIHRydWUsICdBbGwgbGluZXMgc2hvdWxkIGJlIGVtcHR5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1peGVkIGNvbnRlbnQgd2l0aCBzcGFjZXMgYW5kIHNwZWNpYWwgY2hhcmFjdGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlKCdoZWxsbyB3b3JsZFxcclxcbiAgaW5kZW50ZWQgbGluZVxcclxcbmxpbmUgd2l0aCAkcGVjaWFsIGNoYXJzIUAjXFxyXFxuXFxyXFxuZW1wdHkgbGluZSBhYm92ZScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB4dGVybS5nZXRDb250ZW50c0FzVGV4dCgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LnN0YXJ0c1dpdGgoJ2hlbGxvIHdvcmxkXFxuICBpbmRlbnRlZCBsaW5lXFxubGluZSB3aXRoICRwZWNpYWwgY2hhcnMhQCNcXG5cXG5lbXB0eSBsaW5lIGFib3ZlJyksIHRydWUsICdTaG91bGQgaGFuZGxlIHNwYWNlcyBhbmQgc3BlY2lhbCBjaGFyYWN0ZXJzIGNvcnJlY3RseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZhbGwgYmFjayB0byBsaW5lIDAgd2hlbiBzdGFydE1hcmtlciBpcyBkaXNwb3NlZCAobGluZSA9PT0gLTEpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMVxcclxcbicpO1xuXHRcdFx0Y29uc3QgZGlzcG9zZWRNYXJrZXIgPSB4dGVybS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNScpO1xuXG5cdFx0XHRkaXNwb3NlZE1hcmtlci5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KGRpc3Bvc2VkTWFya2VyKTtcblx0XHRcdC8vIFNob3VsZCByZXR1cm4gY29udGVudCBmcm9tIGxpbmUgMCAoaW5jbHVkaW5nIGxpbmUgMSkgaW5zdGVhZCBvZiB0aHJvd2luZ1xuXHRcdFx0b2socmVzdWx0LnN0YXJ0c1dpdGgoJ2xpbmUgMVxcbmxpbmUgMlxcbmxpbmUgM1xcbmxpbmUgNFxcbmxpbmUgNScpLCBgVW5leHBlY3RlZCByZXN1bHQ6ICR7cmVzdWx0fWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IGVycm9yIHdoZW4gZW5kTWFya2VyIGlzIGRpc3Bvc2VkIChsaW5lID09PSAtMSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAxXFxyXFxuJyk7XG5cdFx0XHRjb25zdCBzdGFydE1hcmtlciA9IHh0ZXJtLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAyXFxyXFxuJyk7XG5cdFx0XHRjb25zdCBkaXNwb3NlZEVuZE1hcmtlciA9IHh0ZXJtLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAzXFxyXFxubGluZSA0XFxyXFxubGluZSA1Jyk7XG5cblx0XHRcdGRpc3Bvc2VkRW5kTWFya2VyLmRpc3Bvc2UoKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0eHRlcm0uZ2V0Q29udGVudHNBc1RleHQoc3RhcnRNYXJrZXIsIGRpc3Bvc2VkRW5kTWFya2VyKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBlcnJvciB3YXMgbm90IHRocm93bicpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3I6IGFueSkge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChlcnJvci5tZXNzYWdlLCAnQ2Fubm90IGdldCBjb250ZW50cyBvZiBhIGRpc3Bvc2VkIGVuZE1hcmtlcicpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtYXJrZXJzIGF0IGJ1ZmZlciBib3VuZGFyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhcnRNYXJrZXIgPSB4dGVybS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbicpO1xuXHRcdFx0Y29uc3QgZW5kTWFya2VyID0geHRlcm0ucmF3LnJlZ2lzdGVyTWFya2VyKDApITtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDUnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0geHRlcm0uZ2V0Q29udGVudHNBc1RleHQoc3RhcnRNYXJrZXIsIGVuZE1hcmtlcik7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdsaW5lIDFcXG5saW5lIDJcXG5saW5lIDNcXG5saW5lIDRcXG5saW5lIDUnLCAnU2hvdWxkIGhhbmRsZSBtYXJrZXJzIGF0IGJ1ZmZlciBib3VuZGFyaWVzIGNvcnJlY3RseScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB0ZXJtaW5hbCBlc2NhcGUgc2VxdWVuY2VzIHByb3Blcmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGUoJ1xceDFiWzMxbXJlZCB0ZXh0XFx4MWJbMG1cXHJcXG5cXHgxYlszMm1ncmVlbiB0ZXh0XFx4MWJbMG0nKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0geHRlcm0uZ2V0Q29udGVudHNBc1RleHQoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC5zdGFydHNXaXRoKCdyZWQgdGV4dFxcbmdyZWVuIHRleHQnKSwgdHJ1ZSwgJ0FOU0kgZXNjYXBlIHNlcXVlbmNlcyBzaG91bGQgYmUgZmlsdGVyZWQgb3V0LCBidXQgdGhlcmUgd2lsbCBiZSB0cmFpbGluZyBlbXB0eSBsaW5lcycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0QnVmZmVyUmV2ZXJzZUl0ZXJhdG9yJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBnZXQgdGV4dCBwcm9wZXJseSB3aXRoaW4gc2Nyb2xsYmFjayBsaW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxubGluZSAzXFxyXFxubGluZSA0XFxyXFxubGluZSA1Jztcblx0XHRcdGF3YWl0IHdyaXRlKHRleHQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBbLi4ueHRlcm0uZ2V0QnVmZmVyUmV2ZXJzZUl0ZXJhdG9yKCldLnJldmVyc2UoKS5qb2luKCdcXHJcXG4nKTtcblx0XHRcdHN0cmljdEVxdWFsKHRleHQsIHJlc3VsdCwgJ1Nob3VsZCBlcXVhbCBvcmlnaW5hbCB0ZXh0Jyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGdldCB0ZXh0IHByb3Blcmx5IHdoZW4gZXhjZWVkIHNjcm9sbGJhY2sgbGltaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBtYXggYnVmZmVyIGxpbmVzKDQwKSA9IHJvd3MoMzApICsgc2Nyb2xsYmFjaygxMClcblx0XHRcdGNvbnN0IHRleHQgPSAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxubGluZSAzXFxyXFxubGluZSA0XFxyXFxubGluZSA1XFxyXFxuJy5yZXBlYXQoOCkudHJpbSgpO1xuXHRcdFx0YXdhaXQgd3JpdGUodGV4dCk7XG5cdFx0XHRhd2FpdCB3cml0ZSgnXFxyXFxubGluZSBtb3JlJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IFsuLi54dGVybS5nZXRCdWZmZXJSZXZlcnNlSXRlcmF0b3IoKV0ucmV2ZXJzZSgpLmpvaW4oJ1xcclxcbicpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ID0gdGV4dC5zbGljZSg4KSArICdcXHJcXG5saW5lIG1vcmUnO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXhwZWN0LCByZXN1bHQsICdTaG91bGQgZXF1YWwgb3JpZ2luYWwgdGV4dCB3aXRob3V0IGxpbmUgMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndGhlbWUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGFwcGx5IGNvcnJlY3QgYmFja2dyb3VuZCBjb2xvciBiYXNlZCBvbiBnZXRCYWNrZ3JvdW5kQ29sb3InLCAoKSA9PiB7XG5cdFx0XHR0aGVtZVNlcnZpY2Uuc2V0VGhlbWUobmV3IFRlc3RDb2xvclRoZW1lKHtcblx0XHRcdFx0W1BBTkVMX0JBQ0tHUk9VTkRdOiAnI2ZmMDAwMCcsXG5cdFx0XHRcdFtTSURFX0JBUl9CQUNLR1JPVU5EXTogJyMwMGZmMDAnXG5cdFx0XHR9KSk7XG5cdFx0XHR4dGVybSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShYdGVybVRlcm1pbmFsLCB1bmRlZmluZWQsIFhUZXJtQmFzZUN0b3IsIHtcblx0XHRcdFx0Y29sczogODAsXG5cdFx0XHRcdHJvd3M6IDMwLFxuXHRcdFx0XHR4dGVybUFkZG9uSW1wb3J0ZXI6IG5ldyBUZXN0WHRlcm1BZGRvbkltcG9ydGVyKCksXG5cdFx0XHRcdHh0ZXJtQ29sb3JQcm92aWRlcjogeyBnZXRCYWNrZ3JvdW5kQ29sb3I6ICgpID0+IG5ldyBDb2xvcihuZXcgUkdCQSgyNTUsIDAsIDApKSB9LFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSksXG5cdFx0XHRcdGRpc2FibGVTaGVsbEludGVncmF0aW9uUmVwb3J0aW5nOiB0cnVlLFxuXHRcdFx0fSwgdW5kZWZpbmVkKSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh4dGVybS5yYXcub3B0aW9ucy50aGVtZT8uYmFja2dyb3VuZCwgJyNmZjAwMDAnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVhY3QgdG8gYW5kIGFwcGx5IHRoZW1lIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHR0aGVtZVNlcnZpY2Uuc2V0VGhlbWUobmV3IFRlc3RDb2xvclRoZW1lKHtcblx0XHRcdFx0W1RFUk1JTkFMX0JBQ0tHUk9VTkRfQ09MT1JdOiAnIzAwMDEwMCcsXG5cdFx0XHRcdFtURVJNSU5BTF9GT1JFR1JPVU5EX0NPTE9SXTogJyMwMDAyMDAnLFxuXHRcdFx0XHRbVEVSTUlOQUxfQ1VSU09SX0ZPUkVHUk9VTkRfQ09MT1JdOiAnIzAwMDMwMCcsXG5cdFx0XHRcdFtURVJNSU5BTF9DVVJTT1JfQkFDS0dST1VORF9DT0xPUl06ICcjMDAwNDAwJyxcblx0XHRcdFx0W1RFUk1JTkFMX1NFTEVDVElPTl9CQUNLR1JPVU5EX0NPTE9SXTogJyMwMDA1MDAnLFxuXHRcdFx0XHRbVEVSTUlOQUxfSU5BQ1RJVkVfU0VMRUNUSU9OX0JBQ0tHUk9VTkRfQ09MT1JdOiAnIzAwMDYwMCcsXG5cdFx0XHRcdFtURVJNSU5BTF9TRUxFQ1RJT05fRk9SRUdST1VORF9DT0xPUl06IHVuZGVmaW5lZCxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCbGFjayc6ICcjMDEwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lSZWQnOiAnIzAyMDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpR3JlZW4nOiAnIzAzMDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpWWVsbG93JzogJyMwNDAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJsdWUnOiAnIzA1MDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpTWFnZW50YSc6ICcjMDYwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lDeWFuJzogJyMwNzAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaVdoaXRlJzogJyMwODAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodEJsYWNrJzogJyMwOTAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodFJlZCc6ICcjMTAwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRHcmVlbic6ICcjMTEwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRZZWxsb3cnOiAnIzEyMDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0Qmx1ZSc6ICcjMTMwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRNYWdlbnRhJzogJyMxNDAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodEN5YW4nOiAnIzE1MDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0V2hpdGUnOiAnIzE2MDAwMCcsXG5cdFx0XHR9KSk7XG5cdFx0XHR4dGVybSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShYdGVybVRlcm1pbmFsLCB1bmRlZmluZWQsIFhUZXJtQmFzZUN0b3IsIHtcblx0XHRcdFx0Y29sczogODAsXG5cdFx0XHRcdHJvd3M6IDMwLFxuXHRcdFx0XHR4dGVybUFkZG9uSW1wb3J0ZXI6IG5ldyBUZXN0WHRlcm1BZGRvbkltcG9ydGVyKCksXG5cdFx0XHRcdHh0ZXJtQ29sb3JQcm92aWRlcjogeyBnZXRCYWNrZ3JvdW5kQ29sb3I6ICgpID0+IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSksXG5cdFx0XHRcdGRpc2FibGVTaGVsbEludGVncmF0aW9uUmVwb3J0aW5nOiB0cnVlXG5cdFx0XHR9LCB1bmRlZmluZWQpKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh4dGVybS5yYXcub3B0aW9ucy50aGVtZSwge1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGZvcmVncm91bmQ6ICcjMDAwMjAwJyxcblx0XHRcdFx0Y3Vyc29yOiAnIzAwMDMwMCcsXG5cdFx0XHRcdGN1cnNvckFjY2VudDogJyMwMDA0MDAnLFxuXHRcdFx0XHRzZWxlY3Rpb25CYWNrZ3JvdW5kOiAnIzAwMDUwMCcsXG5cdFx0XHRcdHNlbGVjdGlvbkluYWN0aXZlQmFja2dyb3VuZDogJyMwMDA2MDAnLFxuXHRcdFx0XHRzZWxlY3Rpb25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdG92ZXJ2aWV3UnVsZXJCb3JkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Nyb2xsYmFyU2xpZGVyQWN0aXZlQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzY3JvbGxiYXJTbGlkZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNjcm9sbGJhclNsaWRlckhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRibGFjazogJyMwMTAwMDAnLFxuXHRcdFx0XHRncmVlbjogJyMwMzAwMDAnLFxuXHRcdFx0XHRyZWQ6ICcjMDIwMDAwJyxcblx0XHRcdFx0eWVsbG93OiAnIzA0MDAwMCcsXG5cdFx0XHRcdGJsdWU6ICcjMDUwMDAwJyxcblx0XHRcdFx0bWFnZW50YTogJyMwNjAwMDAnLFxuXHRcdFx0XHRjeWFuOiAnIzA3MDAwMCcsXG5cdFx0XHRcdHdoaXRlOiAnIzA4MDAwMCcsXG5cdFx0XHRcdGJyaWdodEJsYWNrOiAnIzA5MDAwMCcsXG5cdFx0XHRcdGJyaWdodFJlZDogJyMxMDAwMDAnLFxuXHRcdFx0XHRicmlnaHRHcmVlbjogJyMxMTAwMDAnLFxuXHRcdFx0XHRicmlnaHRZZWxsb3c6ICcjMTIwMDAwJyxcblx0XHRcdFx0YnJpZ2h0Qmx1ZTogJyMxMzAwMDAnLFxuXHRcdFx0XHRicmlnaHRNYWdlbnRhOiAnIzE0MDAwMCcsXG5cdFx0XHRcdGJyaWdodEN5YW46ICcjMTUwMDAwJyxcblx0XHRcdFx0YnJpZ2h0V2hpdGU6ICcjMTYwMDAwJyxcblx0XHRcdH0pO1xuXHRcdFx0dGhlbWVTZXJ2aWNlLnNldFRoZW1lKG5ldyBUZXN0Q29sb3JUaGVtZSh7XG5cdFx0XHRcdFtURVJNSU5BTF9CQUNLR1JPVU5EX0NPTE9SXTogJyMwMDAxMGYnLFxuXHRcdFx0XHRbVEVSTUlOQUxfRk9SRUdST1VORF9DT0xPUl06ICcjMDAwMjBmJyxcblx0XHRcdFx0W1RFUk1JTkFMX0NVUlNPUl9GT1JFR1JPVU5EX0NPTE9SXTogJyMwMDAzMGYnLFxuXHRcdFx0XHRbVEVSTUlOQUxfQ1VSU09SX0JBQ0tHUk9VTkRfQ09MT1JdOiAnIzAwMDQwZicsXG5cdFx0XHRcdFtURVJNSU5BTF9TRUxFQ1RJT05fQkFDS0dST1VORF9DT0xPUl06ICcjMDAwNTBmJyxcblx0XHRcdFx0W1RFUk1JTkFMX0lOQUNUSVZFX1NFTEVDVElPTl9CQUNLR1JPVU5EX0NPTE9SXTogJyMwMDA2MGYnLFxuXHRcdFx0XHRbVEVSTUlOQUxfU0VMRUNUSU9OX0ZPUkVHUk9VTkRfQ09MT1JdOiAnIzAwMDcwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQmxhY2snOiAnIzAxMDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpUmVkJzogJyMwMjAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUdyZWVuJzogJyMwMzAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaVllbGxvdyc6ICcjMDQwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCbHVlJzogJyMwNTAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaU1hZ2VudGEnOiAnIzA2MDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQ3lhbic6ICcjMDcwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lXaGl0ZSc6ICcjMDgwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRCbGFjayc6ICcjMDkwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRSZWQnOiAnIzEwMDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0R3JlZW4nOiAnIzExMDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0WWVsbG93JzogJyMxMjAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodEJsdWUnOiAnIzEzMDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0TWFnZW50YSc6ICcjMTQwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRDeWFuJzogJyMxNTAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodFdoaXRlJzogJyMxNjAwMGYnLFxuXHRcdFx0fSkpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHh0ZXJtLnJhdy5vcHRpb25zLnRoZW1lLCB7XG5cdFx0XHRcdGJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Zm9yZWdyb3VuZDogJyMwMDAyMGYnLFxuXHRcdFx0XHRjdXJzb3I6ICcjMDAwMzBmJyxcblx0XHRcdFx0Y3Vyc29yQWNjZW50OiAnIzAwMDQwZicsXG5cdFx0XHRcdHNlbGVjdGlvbkJhY2tncm91bmQ6ICcjMDAwNTBmJyxcblx0XHRcdFx0c2VsZWN0aW9uSW5hY3RpdmVCYWNrZ3JvdW5kOiAnIzAwMDYwZicsXG5cdFx0XHRcdHNlbGVjdGlvbkZvcmVncm91bmQ6ICcjMDAwNzBmJyxcblx0XHRcdFx0b3ZlcnZpZXdSdWxlckJvcmRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNjcm9sbGJhclNsaWRlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Nyb2xsYmFyU2xpZGVySG92ZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJsYWNrOiAnIzAxMDAwZicsXG5cdFx0XHRcdGdyZWVuOiAnIzAzMDAwZicsXG5cdFx0XHRcdHJlZDogJyMwMjAwMGYnLFxuXHRcdFx0XHR5ZWxsb3c6ICcjMDQwMDBmJyxcblx0XHRcdFx0Ymx1ZTogJyMwNTAwMGYnLFxuXHRcdFx0XHRtYWdlbnRhOiAnIzA2MDAwZicsXG5cdFx0XHRcdGN5YW46ICcjMDcwMDBmJyxcblx0XHRcdFx0d2hpdGU6ICcjMDgwMDBmJyxcblx0XHRcdFx0YnJpZ2h0QmxhY2s6ICcjMDkwMDBmJyxcblx0XHRcdFx0YnJpZ2h0UmVkOiAnIzEwMDAwZicsXG5cdFx0XHRcdGJyaWdodEdyZWVuOiAnIzExMDAwZicsXG5cdFx0XHRcdGJyaWdodFllbGxvdzogJyMxMjAwMGYnLFxuXHRcdFx0XHRicmlnaHRCbHVlOiAnIzEzMDAwZicsXG5cdFx0XHRcdGJyaWdodE1hZ2VudGE6ICcjMTQwMDBmJyxcblx0XHRcdFx0YnJpZ2h0Q3lhbjogJyMxNTAwMGYnLFxuXHRcdFx0XHRicmlnaHRXaGl0ZTogJyMxNjAwMGYn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
