import { deepStrictEqual, strictEqual } from "assert";
import { importAMDNodeModule } from "../../../../../amdX.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TerminalCapabilityStore } from "../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { ITerminalService } from "../../browser/terminal.js";
import { XtermTerminal } from "../../browser/xterm/xtermTerminal.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { createFakeDetachedTerminal } from "./chatTerminalMirrorTestUtils.js";
import { TestXtermAddonImporter } from "./xterm/xtermTestUtils.js";
import { computeChatTerminalMirrorCols, computeMaxBufferColumnWidth, computeSnapshotLineCount, DetachedTerminalCommandMirror, DetachedTerminalSnapshotMirror, vtBoundaryMatches } from "../../browser/chatTerminalCommandMirror.js";
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
suite("Workbench - ChatTerminalCommandMirror", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("VT mirroring with XtermTerminal", () => {
    let instantiationService;
    let configurationService;
    let XTermBaseCtor;
    async function createXterm(cols = 80, rows = 10, scrollback = 10) {
      const capabilities = store.add(new TerminalCapabilityStore());
      return store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
        cols,
        rows,
        xtermColorProvider: { getBackgroundColor: () => void 0 },
        capabilities,
        disableShellIntegrationReporting: true,
        xtermAddonImporter: new TestXtermAddonImporter()
      }, void 0));
    }
    function write(xterm, data) {
      return new Promise((resolve) => xterm.write(data, resolve));
    }
    function getBufferText(xterm) {
      const buffer = xterm.raw.buffer.active;
      const lines = [];
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        lines.push(line?.translateToString(true) ?? "");
      }
      while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
      return lines.join("\n");
    }
    async function mirrorViaVT(source, startLine = 0) {
      const startMarker = source.raw.registerMarker(startLine - source.raw.buffer.active.baseY - source.raw.buffer.active.cursorY);
      const vt = await source.getRangeAsVT(startMarker ?? void 0, void 0, true);
      startMarker?.dispose();
      const mirror = await createXterm(source.raw.cols, source.raw.rows);
      if (vt) {
        await write(mirror, vt);
      }
      return mirror;
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
      XTermBaseCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    });
    test("single character", async () => {
      const source = await createXterm();
      await write(source, "X");
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("single line", async () => {
      const source = await createXterm();
      await write(source, "hello world");
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("multiple lines", async () => {
      const source = await createXterm();
      await write(source, "line 1\r\nline 2\r\nline 3");
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("wrapped line", async () => {
      const source = await createXterm(20, 10);
      const longLine = "a".repeat(50);
      await write(source, longLine);
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("content with special characters", async () => {
      const source = await createXterm();
      await write(source, "hello	tab\r\nspaces   here\r\n$pecial!@#%^&*");
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("content with ANSI colors", async () => {
      const source = await createXterm();
      await write(source, "\x1B[31mred\x1B[0m \x1B[32mgreen\x1B[0m \x1B[34mblue\x1B[0m");
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("content filling visible area", async () => {
      const source = await createXterm(80, 5);
      for (let i = 1; i <= 5; i++) {
        await write(source, `line ${i}\r
`);
      }
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("content with scrollback (partial buffer)", async () => {
      const source = await createXterm(80, 5, 5);
      for (let i = 1; i <= 12; i++) {
        await write(source, `line ${i}\r
`);
      }
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("empty content", async () => {
      const source = await createXterm();
      const mirror = await mirrorViaVT(source);
      strictEqual(getBufferText(mirror), getBufferText(source));
    });
    test("content from marker to cursor", async () => {
      const source = await createXterm();
      await write(source, "before\r\n");
      const startMarker = source.raw.registerMarker(0);
      await write(source, "output line 1\r\noutput line 2");
      const vt = await source.getRangeAsVT(startMarker, void 0, true);
      const mirror = await createXterm();
      if (vt) {
        await write(mirror, vt);
      }
      startMarker.dispose();
      const mirrorText = getBufferText(mirror);
      strictEqual(mirrorText.includes("output line 1"), true);
      strictEqual(mirrorText.includes("output line 2"), true);
      strictEqual(mirrorText.includes("before"), false);
    });
    test("disposed start marker does not throw in VT serialization", async () => {
      const source = await createXterm();
      await write(source, "line 1\r\nline 2");
      const startMarker = source.raw.registerMarker(0);
      startMarker.dispose();
      const vt = await source.getRangeAsVT(startMarker, void 0, true);
      strictEqual(typeof vt, "string");
    });
    test("incremental mirroring appends correctly", async () => {
      const source = await createXterm();
      const marker = source.raw.registerMarker(0);
      await write(source, "initial\r\n");
      const vt1 = await source.getRangeAsVT(marker, void 0, true) ?? "";
      const mirror = await createXterm();
      await write(mirror, vt1);
      await write(source, "added\r\n");
      const vt2 = await source.getRangeAsVT(marker, void 0, true) ?? "";
      const appended = vt2.slice(vt1.length);
      if (appended) {
        await write(mirror, appended);
      }
      const freshMirror = await createXterm();
      await write(freshMirror, vt2);
      marker.dispose();
      strictEqual(getBufferText(mirror), getBufferText(freshMirror));
    });
    test("VT divergence detection prevents corruption (Windows scenario)", async () => {
      const mirror = await createXterm();
      const vt1 = "Line1\r\nLine2";
      await write(mirror, vt1);
      strictEqual(getBufferText(mirror), "Line1\nLine2");
      const vt2 = "DifferentPrefixLine3";
      const boundaryMatches = vtBoundaryMatches(vt2, vt1, vt1.length);
      strictEqual(boundaryMatches, false, "Boundary check should detect divergence");
      await write(mirror, `\x1Bc${vt2}`);
      strictEqual(getBufferText(mirror), "DifferentPrefixLine3");
    });
    test("boundary check allows append when VT prefix matches", async () => {
      const mirror = await createXterm();
      const vt1 = "Line1\r\nLine2\r\n";
      await write(mirror, vt1);
      const vt2 = vt1 + "Line3\r\n";
      const boundaryMatches = vtBoundaryMatches(vt2, vt1, vt1.length);
      strictEqual(boundaryMatches, true, "Boundary check should pass when prefix matches");
      const appended = vt2.slice(vt1.length);
      await write(mirror, appended);
      strictEqual(getBufferText(mirror), "Line1\nLine2\nLine3");
    });
    test("incremental updates use append path (not full rewrite) in normal operation", async () => {
      const source = await createXterm();
      const marker = source.raw.registerMarker(0);
      const writes = [];
      await write(source, "output line 1\r\n");
      const vt1 = await source.getRangeAsVT(marker, void 0, true) ?? "";
      const mirror = await createXterm();
      await write(mirror, vt1);
      writes.push(vt1);
      await write(source, "output line 2\r\n");
      const vt2 = await source.getRangeAsVT(marker, void 0, true) ?? "";
      strictEqual(vt2.startsWith(vt1), true, "VT2 should start with VT1");
      const appended2 = vt2.slice(vt1.length);
      strictEqual(appended2.length > 0, true, "Should have new content to append");
      strictEqual(appended2.length < vt2.length, true, "Append should be smaller than full rewrite");
      await write(mirror, appended2);
      writes.push(appended2);
      await write(source, "output line 3\r\n");
      const vt3 = await source.getRangeAsVT(marker, void 0, true) ?? "";
      strictEqual(vt3.startsWith(vt2), true, "VT3 should start with VT2");
      const appended3 = vt3.slice(vt2.length);
      strictEqual(appended3.length > 0, true, "Should have new content to append");
      strictEqual(appended3.length < vt3.length, true, "Append should be smaller than full rewrite");
      await write(mirror, appended3);
      writes.push(appended3);
      marker.dispose();
      strictEqual(getBufferText(mirror), "output line 1\noutput line 2\noutput line 3");
      const totalWritten = writes.reduce((sum, w) => sum + w.length, 0);
      const fullRewriteWouldBe = vt1.length + vt2.length + vt3.length;
      strictEqual(
        totalWritten < fullRewriteWouldBe,
        true,
        `Append path should write less (${totalWritten}) than full rewrites would (${fullRewriteWouldBe})`
      );
    });
    test("snapshot line count reflects rendered rows", async () => {
      async function measure(text) {
        const xterm = await createXterm();
        if (text) {
          await write(xterm, text);
        }
        return computeSnapshotLineCount(xterm.raw.buffer.active);
      }
      deepStrictEqual({
        empty: await measure(""),
        short: await measure("hello"),
        exactlyOneRow: await measure("a".repeat(80)),
        twoWrappedRows: await measure("a".repeat(81)),
        threeWrappedRows: await measure("a".repeat(200)),
        multilineWithWrapping: await measure(`${"a".repeat(81)}\r
next`),
        trailingCarriageReturnLineFeed: await measure("line\r\n"),
        trailingLineFeed: await measure("line\n")
      }, {
        empty: 0,
        short: 1,
        exactlyOneRow: 1,
        twoWrappedRows: 2,
        threeWrappedRows: 3,
        multilineWithWrapping: 3,
        trailingCarriageReturnLineFeed: 1,
        trailingLineFeed: 1
      });
    });
    test("snapshot line count updates after appends and rewrites", async () => {
      const xterm = await createXterm();
      await write(xterm, "a".repeat(81));
      const initial = computeSnapshotLineCount(xterm.raw.buffer.active);
      await write(xterm, "b".repeat(120));
      const appended = computeSnapshotLineCount(xterm.raw.buffer.active);
      await write(xterm, "\x1B[2J\x1B[3J\x1B[Hshort");
      const rewritten = computeSnapshotLineCount(xterm.raw.buffer.active);
      deepStrictEqual({ initial, appended, rewritten }, {
        initial: 2,
        appended: 3,
        rewritten: 1
      });
    });
    test("snapshot line count preserves an explicit value", async () => {
      const xterm = await createXterm();
      await write(xterm, "a".repeat(200));
      strictEqual(computeSnapshotLineCount(xterm.raw.buffer.active, 7), 7);
    });
  });
  suite("computeMaxBufferColumnWidth", () => {
    function createMockBuffer(lines, cols = 80) {
      return {
        length: lines.length,
        getLine(y) {
          if (y < 0 || y >= lines.length) {
            return void 0;
          }
          const lineContent = lines[y];
          return {
            length: Math.max(lineContent.length, cols),
            getCell(x) {
              if (x < 0 || x >= lineContent.length) {
                return { getChars: () => "" };
              }
              const char = lineContent[x];
              return { getChars: () => char === " " ? "" : char };
            }
          };
        }
      };
    }
    test("returns 0 for empty buffer", () => {
      const buffer = createMockBuffer([]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 0);
    });
    test("returns 0 for buffer with only empty lines", () => {
      const buffer = createMockBuffer(["", "", ""]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 0);
    });
    test("returns correct width for single character", () => {
      const buffer = createMockBuffer(["X"]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 1);
    });
    test("returns correct width for single line", () => {
      const buffer = createMockBuffer(["hello"]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 5);
    });
    test("returns max width across multiple lines", () => {
      const buffer = createMockBuffer([
        "short",
        "much longer line",
        "mid"
      ]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 16);
    });
    test("ignores trailing spaces (empty cells)", () => {
      const buffer = createMockBuffer(["hello     "]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 5);
    });
    test("respects cols parameter to clamp line length", () => {
      const buffer = createMockBuffer(["abcdefghijklmnop"]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 10), 10);
    });
    test("handles lines with content at different positions", () => {
      const buffer = createMockBuffer([
        "a",
        // width 1
        "  b",
        // content at col 2, but width is 3
        "    c",
        // content at col 4, but width is 5
        "      d"
        // content at col 6, width is 7
      ]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 7);
    });
    test("handles buffer with undefined lines gracefully", () => {
      const buffer = {
        length: 3,
        getLine(y) {
          if (y === 1) {
            return void 0;
          }
          return {
            length: 5,
            getCell(x) {
              return x < 3 ? { getChars: () => "X" } : { getChars: () => "" };
            }
          };
        }
      };
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 3);
    });
    test("handles line with all empty cells", () => {
      const buffer = createMockBuffer(["     "]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 0);
    });
    test("handles mixed empty and non-empty lines", () => {
      const buffer = createMockBuffer([
        "",
        "content",
        "",
        "more",
        ""
      ]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 7);
    });
    test("returns correct width for line exactly at 80 cols", () => {
      const line80 = "a".repeat(80);
      const buffer = createMockBuffer([line80]);
      strictEqual(computeMaxBufferColumnWidth(buffer, 80), 80);
    });
    test("returns correct width for line exceeding 80 cols with higher cols value", () => {
      const line100 = "a".repeat(100);
      const buffer = createMockBuffer([line100], 120);
      strictEqual(computeMaxBufferColumnWidth(buffer, 120), 100);
    });
    test("handles wide terminal with long content", () => {
      const buffer = createMockBuffer([
        "short",
        "a".repeat(150),
        "medium content here"
      ], 200);
      strictEqual(computeMaxBufferColumnWidth(buffer, 200), 150);
    });
    test("max of multiple lines where longest exceeds default cols", () => {
      const buffer = createMockBuffer([
        "a".repeat(50),
        "b".repeat(120),
        "c".repeat(90)
      ], 150);
      strictEqual(computeMaxBufferColumnWidth(buffer, 150), 120);
    });
  });
  suite("vtBoundaryMatches", () => {
    test("returns true when strings match at boundary", () => {
      const oldVT = "Line1\r\nLine2\r\n";
      const newVT = oldVT + "Line3\r\n";
      strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), true);
    });
    test("returns false when strings diverge at boundary", () => {
      const oldVT = "Line1\r\nLine2";
      const newVT = "DifferentPrefixLine3";
      strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), false);
    });
    test("returns false when single character differs in window", () => {
      const oldVT = "AAAAAAAAAA";
      const newVT = "AAAAABAAAANewContent";
      strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), false);
    });
    test("returns true for empty strings", () => {
      strictEqual(vtBoundaryMatches("", "", 0), true);
    });
    test("returns true when slicePoint is 0", () => {
      const oldVT = "";
      const newVT = "SomeContent";
      strictEqual(vtBoundaryMatches(newVT, oldVT, 0), true);
    });
    test("handles strings shorter than window size", () => {
      const oldVT = "Short";
      const newVT = "ShortAdded";
      strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), true);
    });
    test("respects custom window size parameter", () => {
      const prefix = "A".repeat(80);
      const oldVT = prefix;
      const newVT = "X" + "A".repeat(79) + "NewContent";
      strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length, 50), true);
      strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length, 100), false);
    });
    test("detects divergence in escape sequences (Windows scenario)", () => {
      const oldVT = "\x1B[0m\x1B[1mBold\x1B[0m\r\n";
      const newVT = "\x1B[0m\x1B[22mBold\x1B[0m\r\nMore";
      strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), false);
    });
    test("handles matching escape sequences", () => {
      const oldVT = "\x1B[31mRed\x1B[0m\r\n";
      const newVT = "\x1B[31mRed\x1B[0m\r\nGreen";
      strictEqual(vtBoundaryMatches(newVT, oldVT, oldVT.length), true);
    });
  });
  suite("computeChatTerminalMirrorCols", () => {
    function makeFont(charWidth, letterSpacing = 0) {
      return { fontFamily: "monospace", fontSize: 12, letterSpacing, lineHeight: 1, charWidth, charHeight: 14 };
    }
    test("fills the available width minus the gutter", () => {
      deepStrictEqual({
        wide: computeChatTerminalMirrorCols(1224, makeFont(10), 1),
        floored: computeChatTerminalMirrorCols(1200, makeFont(10), 1)
      }, {
        wide: 120,
        // floor((1224 - 20) / 10)
        floored: 118
        // (1200 - 20) / 10
      });
    });
    test("is stable across device pixel ratios when letter spacing is zero", () => {
      strictEqual(computeChatTerminalMirrorCols(1224, makeFont(10), 2), 120);
    });
    test("accounts for letter spacing in device pixels", () => {
      strictEqual(computeChatTerminalMirrorCols(1224, makeFont(10, 1), 2), 114);
    });
    test("falls back to the default cols when width or font is unmeasurable", () => {
      deepStrictEqual({
        zeroWidth: computeChatTerminalMirrorCols(0, makeFont(10), 1),
        nanWidth: computeChatTerminalMirrorCols(NaN, makeFont(10), 1),
        missingCharWidth: computeChatTerminalMirrorCols(1224, makeFont(void 0), 1),
        zeroCharWidth: computeChatTerminalMirrorCols(1224, makeFont(0), 1)
      }, {
        zeroWidth: 80,
        nanWidth: 80,
        missingCharWidth: 80,
        zeroCharWidth: 80
      });
    });
    test("treats an invalid device pixel ratio as 1", () => {
      strictEqual(computeChatTerminalMirrorCols(1224, makeFont(10), 0), 120);
    });
    test("uses an explicitly measured horizontal chrome over the default", () => {
      deepStrictEqual({
        none: computeChatTerminalMirrorCols(1200, makeFont(10), 1, 0),
        measured: computeChatTerminalMirrorCols(1224, makeFont(10), 1, 24)
      }, {
        none: 120,
        measured: 120
      });
    });
    test("narrow widths wrap to the fitting column count, minimum one column", () => {
      deepStrictEqual({
        narrow: computeChatTerminalMirrorCols(100, makeFont(10), 1),
        // (100 - 20) / 10
        tiny: computeChatTerminalMirrorCols(25, makeFont(10), 1)
      }, {
        narrow: 8,
        tiny: 1
      });
    });
  });
  suite("DetachedTerminalSnapshotMirror.layout", () => {
    let instantiationService;
    let XTermBaseCtor;
    let fakes;
    setup(async () => {
      instantiationService = workbenchInstantiationService(void 0, store);
      XTermBaseCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
      fakes = [];
      instantiationService.stub(ITerminalService, {
        createDetachedTerminal: async (options) => {
          const fake = createFakeDetachedTerminal(XTermBaseCtor, options);
          fakes.push(fake);
          return fake.instance;
        }
      });
    });
    function createSnapshotMirror(output) {
      return store.add(instantiationService.createInstance(DetachedTerminalSnapshotMirror, output, () => void 0));
    }
    test("resizes the detached terminal to cols computed from the width", async () => {
      const mirror = createSnapshotMirror({ text: "hello" });
      await mirror.layout(1224);
      strictEqual(fakes.length, 1);
      strictEqual(fakes[0].raw.cols, 120);
    });
    test("first render after layout wraps at the new cols", async () => {
      const mirror = createSnapshotMirror({ text: "x".repeat(100) });
      await mirror.layout(1224);
      await mirror.render();
      deepStrictEqual({
        cols: fakes[0].raw.cols,
        lineCount: computeSnapshotLineCount(fakes[0].raw.buffer.active),
        maxColumnWidth: computeMaxBufferColumnWidth(fakes[0].raw.buffer.active, fakes[0].raw.cols)
      }, {
        cols: 120,
        lineCount: 1,
        maxColumnWidth: 100
      });
    });
    test("re-wraps already rendered output at the new cols without rewriting", async () => {
      const mirror = createSnapshotMirror({ text: "x".repeat(100) });
      await mirror.render();
      strictEqual(computeSnapshotLineCount(fakes[0].raw.buffer.active), 2);
      const writeCallsBeforeLayout = fakes[0].counters.writeCalls;
      await mirror.layout(1224);
      deepStrictEqual({
        cols: fakes[0].raw.cols,
        lineCount: computeSnapshotLineCount(fakes[0].raw.buffer.active),
        maxColumnWidth: computeMaxBufferColumnWidth(fakes[0].raw.buffer.active, fakes[0].raw.cols),
        // Re-wrapping must come from xterm's native resize reflow, not a buffer
        // rewrite, which would flash a cleared frame on every resize
        writeCalls: fakes[0].counters.writeCalls
      }, {
        cols: 120,
        lineCount: 1,
        maxColumnWidth: 100,
        writeCalls: writeCallsBeforeLayout
      });
    });
    test("repeated layout with the same width does not resize or rewrite", async () => {
      const mirror = createSnapshotMirror({ text: "x".repeat(100) });
      await mirror.render();
      await mirror.layout(1224);
      const { resizeCalls, writeCalls } = { ...fakes[0].counters };
      await mirror.layout(1224);
      deepStrictEqual(fakes[0].counters, { resizeCalls, writeCalls });
    });
    test("ignores non-positive widths", async () => {
      const mirror = createSnapshotMirror({ text: "hello" });
      await mirror.layout(0);
      await mirror.layout(-10);
      strictEqual(fakes[0].raw.cols, 80);
    });
    test("drops a persisted lineCount that reflects the old wrap width", async () => {
      const mirror = createSnapshotMirror({ text: "x".repeat(100), lineCount: 2 });
      await mirror.layout(1224);
      const result = await mirror.render();
      strictEqual(result?.lineCount, 1);
    });
    test("keeps an explicit lineCount for truncated output", async () => {
      const mirror = createSnapshotMirror({ text: "short", truncated: true, lineCount: 42 });
      const result = await mirror.render();
      strictEqual(result?.lineCount, 42);
    });
    test("keeps a truncated snapshot height across layout", async () => {
      const mirror = createSnapshotMirror({ text: "x".repeat(100), truncated: true, lineCount: 42 });
      const first = await mirror.render();
      const laidOut = await mirror.layout(1224);
      const cached = await mirror.render();
      deepStrictEqual({
        first: first?.lineCount,
        laidOut: laidOut?.lineCount,
        cached: cached?.lineCount
      }, {
        first: 42,
        laidOut: 42,
        cached: 42
      });
    });
    test("measures horizontal chrome from the attached element computed padding", async () => {
      const mirror = createSnapshotMirror({ text: "hello" });
      const container = document.createElement("div");
      document.body.appendChild(container);
      try {
        fakes[0].raw.open(container);
        fakes[0].raw.element.style.paddingLeft = "4px";
        fakes[0].raw.element.style.paddingRight = "0px";
        await mirror.layout(1224);
        strictEqual(fakes[0].raw.cols, 122);
      } finally {
        container.remove();
      }
    });
  });
  suite("DetachedTerminalCommandMirror.layout", () => {
    let instantiationService;
    let XTermBaseCtor;
    let fakes;
    setup(async () => {
      const configurationService = new TestConfigurationService({
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
      XTermBaseCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
      fakes = [];
      instantiationService.stub(ITerminalService, {
        createDetachedTerminal: async (options) => {
          const fake = createFakeDetachedTerminal(XTermBaseCtor, options);
          fakes.push(fake);
          return fake.instance;
        }
      });
    });
    async function createXterm(cols = 80, rows = 10) {
      const capabilities = store.add(new TerminalCapabilityStore());
      return store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
        cols,
        rows,
        xtermColorProvider: { getBackgroundColor: () => void 0 },
        capabilities,
        disableShellIntegrationReporting: true,
        xtermAddonImporter: new TestXtermAddonImporter()
      }, void 0));
    }
    function write(xterm, data) {
      return new Promise((resolve) => xterm.write(data, resolve));
    }
    function lineText(raw, y) {
      return raw.buffer.active.getLine(y)?.translateToString(true) ?? "";
    }
    async function createWrappedCommand(source) {
      const executedMarker = source.raw.registerMarker(0);
      await write(source, "x".repeat(100) + "\r\n");
      const endMarker = source.raw.registerMarker(0);
      return { executedMarker, endMarker };
    }
    function createCommandMirror(source, command) {
      return store.add(instantiationService.createInstance(DetachedTerminalCommandMirror, source, command));
    }
    test("resizes before any render without writing content", async () => {
      const source = await createXterm();
      const command = await createWrappedCommand(source);
      const mirror = createCommandMirror(source, command);
      await mirror.layout(1224);
      deepStrictEqual({
        cols: fakes[0].raw.cols,
        writeCalls: fakes[0].counters.writeCalls
      }, {
        cols: 120,
        writeCalls: 0
      });
    });
    test("re-wraps rendered command output at the new cols without rewriting", async () => {
      const source = await createXterm();
      const command = await createWrappedCommand(source);
      const mirror = createCommandMirror(source, command);
      await mirror.renderCommand();
      deepStrictEqual({
        line0: lineText(fakes[0].raw, 0),
        line1: lineText(fakes[0].raw, 1)
      }, {
        line0: "x".repeat(80),
        line1: "x".repeat(20)
      });
      const writeCallsBeforeLayout = fakes[0].counters.writeCalls;
      const result = await mirror.layout(1224);
      deepStrictEqual({
        cols: fakes[0].raw.cols,
        line0: lineText(fakes[0].raw, 0),
        maxColumnWidth: computeMaxBufferColumnWidth(fakes[0].raw.buffer.active, fakes[0].raw.cols),
        // The reported line count must reflect the re-wrapped mirror rows, not the
        // source terminal's wrap at its own cols, so the box height matches
        lineCount: result?.lineCount,
        // Re-wrapping must come from xterm's native resize reflow, not a buffer
        // rewrite, which would flash a cleared frame on every resize
        writeCalls: fakes[0].counters.writeCalls
      }, {
        cols: 120,
        line0: "x".repeat(100),
        maxColumnWidth: 100,
        lineCount: 1,
        writeCalls: writeCallsBeforeLayout
      });
    });
    test("repeated layout with the same width does not resize or rewrite", async () => {
      const source = await createXterm();
      const command = await createWrappedCommand(source);
      const mirror = createCommandMirror(source, command);
      await mirror.renderCommand();
      await mirror.layout(1224);
      const { resizeCalls, writeCalls } = { ...fakes[0].counters };
      await mirror.layout(1224);
      deepStrictEqual(fakes[0].counters, { resizeCalls, writeCalls });
    });
  });
  suite("row height metrics", () => {
    let instantiationService;
    let XTermBaseCtor;
    let fakes;
    let nextFont;
    setup(async () => {
      const configurationService = new TestConfigurationService({
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
      XTermBaseCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
      fakes = [];
      nextFont = void 0;
      instantiationService.stub(ITerminalService, {
        createDetachedTerminal: async (options) => {
          const fake = createFakeDetachedTerminal(XTermBaseCtor, options, nextFont);
          fakes.push(fake);
          return fake.instance;
        }
      });
    });
    function createSnapshotMirror(output) {
      return store.add(instantiationService.createInstance(DetachedTerminalSnapshotMirror, output, () => void 0));
    }
    async function createLaidOutCommandMirror() {
      const capabilities = store.add(new TerminalCapabilityStore());
      const source = store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
        cols: 80,
        rows: 10,
        xtermColorProvider: { getBackgroundColor: () => void 0 },
        capabilities,
        disableShellIntegrationReporting: true,
        xtermAddonImporter: new TestXtermAddonImporter()
      }, void 0));
      const mirror = store.add(instantiationService.createInstance(DetachedTerminalCommandMirror, source, {}));
      await mirror.layout(1224);
      return mirror;
    }
    test("snapshot mirror reports the mirror cell height once the terminal exists", async () => {
      const mirror = createSnapshotMirror({ text: "hello" });
      await mirror.render();
      strictEqual(mirror.getRowHeightPx(), 14);
    });
    test("snapshot mirror reports undefined before the detached terminal resolves", () => {
      const mirror = createSnapshotMirror({ text: "hello" });
      strictEqual(mirror.getRowHeightPx(), void 0);
    });
    test("uses the exact fractional cell height without per-row rounding", async () => {
      nextFont = { fontFamily: "monospace", fontSize: 12, letterSpacing: 0, lineHeight: 1.1, charWidth: 10, charHeight: 14.4 };
      const mirror = createSnapshotMirror({ text: "hello" });
      await mirror.render();
      strictEqual(mirror.getRowHeightPx(), 14.4 * 1.1);
    });
    test("command mirror reports the mirror cell height", async () => {
      const mirror = await createLaidOutCommandMirror();
      strictEqual(mirror.getRowHeightPx(), 14);
    });
    function createHost() {
      const host = mainWindow.document.createElement("div");
      mainWindow.document.body.appendChild(host);
      store.add(toDisposable(() => host.remove()));
      return host;
    }
    function nextRender(raw) {
      return new Promise((resolve) => {
        const listener = raw.onRender(() => {
          listener.dispose();
          resolve();
        });
      });
    }
    function write(raw, data) {
      return new Promise((resolve) => raw.write(data, resolve));
    }
    test("snapshot mirror onDidChangeRowHeight fires once per metrics change, only after attach", async () => {
      nextFont = { fontFamily: "monospace", fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 10, charHeight: 14 };
      const mirror = createSnapshotMirror({ text: "hello" });
      let fires = 0;
      store.add(mirror.onDidChangeRowHeight(() => fires++));
      await mirror.render();
      strictEqual(fires, 0, "rendering content alone must not fire before attach");
      const host = createHost();
      await mirror.attach(host);
      strictEqual(fires, 0, "attach alone must not fire without a render");
      const raw = fakes[0].raw;
      let rendered = nextRender(raw);
      raw.open(host);
      await rendered;
      strictEqual(fires, 1, "the first real render announces the metrics");
      rendered = nextRender(raw);
      await write(raw, "more");
      await rendered;
      strictEqual(fires, 1, "renders with unchanged metrics must not re-fire");
      nextFont.charHeight = 21;
      rendered = nextRender(raw);
      await write(raw, "!");
      await rendered;
      strictEqual(fires, 2, "a metrics change fires exactly once more");
    });
    test("command mirror onDidChangeRowHeight fires once per metrics change, only after attach", async () => {
      nextFont = { fontFamily: "monospace", fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 10, charHeight: 14 };
      const mirror = await createLaidOutCommandMirror();
      let fires = 0;
      store.add(mirror.onDidChangeRowHeight(() => fires++));
      const host = createHost();
      const raw = fakes[0].raw;
      let rendered = nextRender(raw);
      raw.open(host);
      await rendered;
      strictEqual(fires, 0, "renders before attach must not fire");
      await mirror.attach(host);
      rendered = nextRender(raw);
      await write(raw, "output");
      await rendered;
      strictEqual(fires, 1, "the first render after attach announces the metrics");
      rendered = nextRender(raw);
      await write(raw, "more");
      await rendered;
      strictEqual(fires, 1, "renders with unchanged metrics must not re-fire");
      nextFont.charHeight = 21;
      rendered = nextRender(raw);
      await write(raw, "!");
      await rendered;
      strictEqual(fires, 2, "a metrics change fires exactly once more");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFxjaGF0VGVybWluYWxDb21tYW5kTWlycm9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsRm9udCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTZXJ2aWNlLCB0eXBlIElEZXRhY2hlZFhUZXJtT3B0aW9ucyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgWHRlcm1UZXJtaW5hbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIveHRlcm0veHRlcm1UZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmFrZURldGFjaGVkVGVybWluYWwgfSBmcm9tICcuL2NoYXRUZXJtaW5hbE1pcnJvclRlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0WHRlcm1BZGRvbkltcG9ydGVyIH0gZnJvbSAnLi94dGVybS94dGVybVRlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlQ2hhdFRlcm1pbmFsTWlycm9yQ29scywgY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoLCBjb21wdXRlU25hcHNob3RMaW5lQ291bnQsIERldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yLCBEZXRhY2hlZFRlcm1pbmFsU25hcHNob3RNaXJyb3IsIHZ0Qm91bmRhcnlNYXRjaGVzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jaGF0VGVybWluYWxDb21tYW5kTWlycm9yLmpzJztcblxuY29uc3QgZGVmYXVsdFRlcm1pbmFsQ29uZmlnID0ge1xuXHRmb250RmFtaWx5OiAnbW9ub3NwYWNlJyxcblx0Zm9udFdlaWdodDogJ25vcm1hbCcsXG5cdGZvbnRXZWlnaHRCb2xkOiAnbm9ybWFsJyxcblx0Z3B1QWNjZWxlcmF0aW9uOiAnb2ZmJyxcblx0c2Nyb2xsYmFjazogMTAsXG5cdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogMixcblx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiAxLFxuXHR1bmljb2RlVmVyc2lvbjogJzYnXG59O1xuXG5zdWl0ZSgnV29ya2JlbmNoIC0gQ2hhdFRlcm1pbmFsQ29tbWFuZE1pcnJvcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnVlQgbWlycm9yaW5nIHdpdGggWHRlcm1UZXJtaW5hbCcsICgpID0+IHtcblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRsZXQgWFRlcm1CYXNlQ3RvcjogdHlwZW9mIFRlcm1pbmFsO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlWHRlcm0oY29scyA9IDgwLCByb3dzID0gMTAsIHNjcm9sbGJhY2sgPSAxMCk6IFByb21pc2U8WHRlcm1UZXJtaW5hbD4ge1xuXHRcdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0XHRcdHJldHVybiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoWHRlcm1UZXJtaW5hbCwgdW5kZWZpbmVkLCBYVGVybUJhc2VDdG9yLCB7XG5cdFx0XHRcdGNvbHMsXG5cdFx0XHRcdHJvd3MsXG5cdFx0XHRcdHh0ZXJtQ29sb3JQcm92aWRlcjogeyBnZXRCYWNrZ3JvdW5kQ29sb3I6ICgpID0+IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRjYXBhYmlsaXRpZXMsXG5cdFx0XHRcdGRpc2FibGVTaGVsbEludGVncmF0aW9uUmVwb3J0aW5nOiB0cnVlLFxuXHRcdFx0XHR4dGVybUFkZG9uSW1wb3J0ZXI6IG5ldyBUZXN0WHRlcm1BZGRvbkltcG9ydGVyKCksXG5cdFx0XHR9LCB1bmRlZmluZWQpKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB3cml0ZSh4dGVybTogWHRlcm1UZXJtaW5hbCwgZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB4dGVybS53cml0ZShkYXRhLCByZXNvbHZlKSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0QnVmZmVyVGV4dCh4dGVybTogWHRlcm1UZXJtaW5hbCk6IHN0cmluZyB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSB4dGVybS5yYXcuYnVmZmVyLmFjdGl2ZTtcblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBidWZmZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKGkpO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxpbmU/LnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpID8/ICcnKTtcblx0XHRcdH1cblx0XHRcdC8vIFRyaW0gdHJhaWxpbmcgZW1wdHkgbGluZXNcblx0XHRcdHdoaWxlIChsaW5lcy5sZW5ndGggPiAwICYmIGxpbmVzW2xpbmVzLmxlbmd0aCAtIDFdID09PSAnJykge1xuXHRcdFx0XHRsaW5lcy5wb3AoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHR9XG5cblx0XHRhc3luYyBmdW5jdGlvbiBtaXJyb3JWaWFWVChzb3VyY2U6IFh0ZXJtVGVybWluYWwsIHN0YXJ0TGluZSA9IDApOiBQcm9taXNlPFh0ZXJtVGVybWluYWw+IHtcblx0XHRcdGNvbnN0IHN0YXJ0TWFya2VyID0gc291cmNlLnJhdy5yZWdpc3Rlck1hcmtlcihzdGFydExpbmUgLSBzb3VyY2UucmF3LmJ1ZmZlci5hY3RpdmUuYmFzZVkgLSBzb3VyY2UucmF3LmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSk7XG5cdFx0XHRjb25zdCB2dCA9IGF3YWl0IHNvdXJjZS5nZXRSYW5nZUFzVlQoc3RhcnRNYXJrZXIgPz8gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0c3RhcnRNYXJrZXI/LmRpc3Bvc2UoKTtcblxuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgY3JlYXRlWHRlcm0oc291cmNlLnJhdy5jb2xzLCBzb3VyY2UucmF3LnJvd3MpO1xuXHRcdFx0aWYgKHZ0KSB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKG1pcnJvciwgdnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1pcnJvcjtcblx0XHR9XG5cblx0XHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0XHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk6IDIsXG5cdFx0XHRcdFx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiAxXG5cdFx0XHRcdH0gYXMgUGFydGlhbDxJRWRpdG9yT3B0aW9ucz4sXG5cdFx0XHRcdGZpbGVzOiB7fSxcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiBkZWZhdWx0VGVybWluYWxDb25maWdcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHR9LCBzdG9yZSk7XG5cblx0XHRcdFhUZXJtQmFzZUN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgY2hhcmFjdGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgY3JlYXRlWHRlcm0oKTtcblx0XHRcdGF3YWl0IHdyaXRlKHNvdXJjZSwgJ1gnKTtcblxuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgbWlycm9yVmlhVlQoc291cmNlKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0QnVmZmVyVGV4dChtaXJyb3IpLCBnZXRCdWZmZXJUZXh0KHNvdXJjZSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0YXdhaXQgd3JpdGUoc291cmNlLCAnaGVsbG8gd29ybGQnKTtcblxuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgbWlycm9yVmlhVlQoc291cmNlKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0QnVmZmVyVGV4dChtaXJyb3IpLCBnZXRCdWZmZXJUZXh0KHNvdXJjZSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgbGluZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0YXdhaXQgd3JpdGUoc291cmNlLCAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxubGluZSAzJyk7XG5cblx0XHRcdGNvbnN0IG1pcnJvciA9IGF3YWl0IG1pcnJvclZpYVZUKHNvdXJjZSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGdldEJ1ZmZlclRleHQobWlycm9yKSwgZ2V0QnVmZmVyVGV4dChzb3VyY2UpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyYXBwZWQgbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IGNyZWF0ZVh0ZXJtKDIwLCAxMCk7IC8vIG5hcnJvdyB0ZXJtaW5hbFxuXHRcdFx0Y29uc3QgbG9uZ0xpbmUgPSAnYScucmVwZWF0KDUwKTsgLy8gZXhjZWVkcyAyMCBjb2xzXG5cdFx0XHRhd2FpdCB3cml0ZShzb3VyY2UsIGxvbmdMaW5lKTtcblxuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgbWlycm9yVmlhVlQoc291cmNlKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0QnVmZmVyVGV4dChtaXJyb3IpLCBnZXRCdWZmZXJUZXh0KHNvdXJjZSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udGVudCB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IGNyZWF0ZVh0ZXJtKCk7XG5cdFx0XHRhd2FpdCB3cml0ZShzb3VyY2UsICdoZWxsb1xcdHRhYlxcclxcbnNwYWNlcyAgIGhlcmVcXHJcXG4kcGVjaWFsIUAjJV4mKicpO1xuXG5cdFx0XHRjb25zdCBtaXJyb3IgPSBhd2FpdCBtaXJyb3JWaWFWVChzb3VyY2UpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChnZXRCdWZmZXJUZXh0KG1pcnJvciksIGdldEJ1ZmZlclRleHQoc291cmNlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb250ZW50IHdpdGggQU5TSSBjb2xvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0YXdhaXQgd3JpdGUoc291cmNlLCAnXFx4MWJbMzFtcmVkXFx4MWJbMG0gXFx4MWJbMzJtZ3JlZW5cXHgxYlswbSBcXHgxYlszNG1ibHVlXFx4MWJbMG0nKTtcblxuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgbWlycm9yVmlhVlQoc291cmNlKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0QnVmZmVyVGV4dChtaXJyb3IpLCBnZXRCdWZmZXJUZXh0KHNvdXJjZSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udGVudCBmaWxsaW5nIHZpc2libGUgYXJlYScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IGNyZWF0ZVh0ZXJtKDgwLCA1KTtcblx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDw9IDU7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB3cml0ZShzb3VyY2UsIGBsaW5lICR7aX1cXHJcXG5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgbWlycm9yVmlhVlQoc291cmNlKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0QnVmZmVyVGV4dChtaXJyb3IpLCBnZXRCdWZmZXJUZXh0KHNvdXJjZSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udGVudCB3aXRoIHNjcm9sbGJhY2sgKHBhcnRpYWwgYnVmZmVyKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IGNyZWF0ZVh0ZXJtKDgwLCA1LCA1KTsgLy8gNSByb3dzIHZpc2libGUsIDUgc2Nyb2xsYmFjayA9IDEwIHRvdGFsXG5cdFx0XHQvLyBXcml0ZSBlbm91Z2ggdG8gcHVzaCBpbnRvIHNjcm9sbGJhY2tcblx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDw9IDEyOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgd3JpdGUoc291cmNlLCBgbGluZSAke2l9XFxyXFxuYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1pcnJvciA9IGF3YWl0IG1pcnJvclZpYVZUKHNvdXJjZSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGdldEJ1ZmZlclRleHQobWlycm9yKSwgZ2V0QnVmZmVyVGV4dChzb3VyY2UpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXG5cdFx0XHRjb25zdCBtaXJyb3IgPSBhd2FpdCBtaXJyb3JWaWFWVChzb3VyY2UpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChnZXRCdWZmZXJUZXh0KG1pcnJvciksIGdldEJ1ZmZlclRleHQoc291cmNlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb250ZW50IGZyb20gbWFya2VyIHRvIGN1cnNvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IGNyZWF0ZVh0ZXJtKCk7XG5cdFx0XHRhd2FpdCB3cml0ZShzb3VyY2UsICdiZWZvcmVcXHJcXG4nKTtcblx0XHRcdGNvbnN0IHN0YXJ0TWFya2VyID0gc291cmNlLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZShzb3VyY2UsICdvdXRwdXQgbGluZSAxXFxyXFxub3V0cHV0IGxpbmUgMicpO1xuXG5cdFx0XHRjb25zdCB2dCA9IGF3YWl0IHNvdXJjZS5nZXRSYW5nZUFzVlQoc3RhcnRNYXJrZXIsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0aWYgKHZ0KSB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKG1pcnJvciwgdnQpO1xuXHRcdFx0fVxuXHRcdFx0c3RhcnRNYXJrZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBNaXJyb3Igc2hvdWxkIGNvbnRhaW4ganVzdCB0aGUgY29udGVudCBmcm9tIG1hcmtlciBvbndhcmRzXG5cdFx0XHRjb25zdCBtaXJyb3JUZXh0ID0gZ2V0QnVmZmVyVGV4dChtaXJyb3IpO1xuXHRcdFx0c3RyaWN0RXF1YWwobWlycm9yVGV4dC5pbmNsdWRlcygnb3V0cHV0IGxpbmUgMScpLCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKG1pcnJvclRleHQuaW5jbHVkZXMoJ291dHB1dCBsaW5lIDInKSwgdHJ1ZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChtaXJyb3JUZXh0LmluY2x1ZGVzKCdiZWZvcmUnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZWQgc3RhcnQgbWFya2VyIGRvZXMgbm90IHRocm93IGluIFZUIHNlcmlhbGl6YXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0YXdhaXQgd3JpdGUoc291cmNlLCAnbGluZSAxXFxyXFxubGluZSAyJyk7XG5cblx0XHRcdGNvbnN0IHN0YXJ0TWFya2VyID0gc291cmNlLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRzdGFydE1hcmtlci5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IHZ0ID0gYXdhaXQgc291cmNlLmdldFJhbmdlQXNWVChzdGFydE1hcmtlciwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKHR5cGVvZiB2dCwgJ3N0cmluZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jcmVtZW50YWwgbWlycm9yaW5nIGFwcGVuZHMgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgY3JlYXRlWHRlcm0oKTtcblx0XHRcdGNvbnN0IG1hcmtlciA9IHNvdXJjZS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoc291cmNlLCAnaW5pdGlhbFxcclxcbicpO1xuXG5cdFx0XHQvLyBGaXJzdCBtaXJyb3Igd2l0aCBpbml0aWFsIGNvbnRlbnRcblx0XHRcdGNvbnN0IHZ0MSA9IGF3YWl0IHNvdXJjZS5nZXRSYW5nZUFzVlQobWFya2VyLCB1bmRlZmluZWQsIHRydWUpID8/ICcnO1xuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgY3JlYXRlWHRlcm0oKTtcblx0XHRcdGF3YWl0IHdyaXRlKG1pcnJvciwgdnQxKTtcblxuXHRcdFx0Ly8gQWRkIG1vcmUgY29udGVudCB0byBzb3VyY2Vcblx0XHRcdGF3YWl0IHdyaXRlKHNvdXJjZSwgJ2FkZGVkXFxyXFxuJyk7XG5cdFx0XHRjb25zdCB2dDIgPSBhd2FpdCBzb3VyY2UuZ2V0UmFuZ2VBc1ZUKG1hcmtlciwgdW5kZWZpbmVkLCB0cnVlKSA/PyAnJztcblxuXHRcdFx0Ly8gQXBwZW5kIG9ubHkgdGhlIG5ldyBwYXJ0IHRvIG1pcnJvclxuXHRcdFx0Y29uc3QgYXBwZW5kZWQgPSB2dDIuc2xpY2UodnQxLmxlbmd0aCk7XG5cdFx0XHRpZiAoYXBwZW5kZWQpIHtcblx0XHRcdFx0YXdhaXQgd3JpdGUobWlycm9yLCBhcHBlbmRlZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSBhIGZyZXNoIG1pcnJvciB3aXRoIGZ1bGwgVlQgdG8gY29tcGFyZSBhZ2FpbnN0XG5cdFx0XHRjb25zdCBmcmVzaE1pcnJvciA9IGF3YWl0IGNyZWF0ZVh0ZXJtKCk7XG5cdFx0XHRhd2FpdCB3cml0ZShmcmVzaE1pcnJvciwgdnQyKTtcblxuXHRcdFx0bWFya2VyLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gSW5jcmVtZW50YWwgbWlycm9yIHNob3VsZCBtYXRjaCBmcmVzaCBtaXJyb3Jcblx0XHRcdHN0cmljdEVxdWFsKGdldEJ1ZmZlclRleHQobWlycm9yKSwgZ2V0QnVmZmVyVGV4dChmcmVzaE1pcnJvcikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnVlQgZGl2ZXJnZW5jZSBkZXRlY3Rpb24gcHJldmVudHMgY29ycnVwdGlvbiAoV2luZG93cyBzY2VuYXJpbyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHRlc3Qgc2ltdWxhdGVzIHRoZSBXaW5kb3dzIGlzc3VlIHdoZXJlIFZUIHNlcXVlbmNlcyBjYW4gZGlmZmVyXG5cdFx0XHQvLyBiZXR3ZWVuIGNhbGxzIGV2ZW4gZm9yIGVxdWl2YWxlbnQgdmlzdWFsIGNvbnRlbnQuIE9uIFdpbmRvd3MsIHRoZVxuXHRcdFx0Ly8gc2VyaWFsaXplciBjYW4gcHJvZHVjZSBkaWZmZXJlbnQgZXNjYXBlIHNlcXVlbmNlcyAoZS5nLiwgZGlmZmVyZW50XG5cdFx0XHQvLyBsaW5lIGVuZGluZ3Mgb3IgY3Vyc29yIHBvc2l0aW9uaW5nKSBjYXVzaW5nIHRoZSBwcmVmaXggdG8gZGl2ZXJnZS5cblx0XHRcdC8vXG5cdFx0XHQvLyBXaXRob3V0IGJvdW5kYXJ5IGNoZWNraW5nLCBibGluZGx5IHNsaWNpbmcgd291bGQgY29ycnVwdCBvdXRwdXQ6XG5cdFx0XHQvLyAtIHZ0MTogXCJMaW5lMVxcclxcbkxpbmUyXCIgKGxlbmd0aCAxMylcblx0XHRcdC8vIC0gdnQyOiBcIkxpbmUxXFxuTGluZTJcXG5MaW5lM1wiIChkaWZmZXJlbnQgZm9ybWF0LCBidXQgc3RhcnRzIHNpbWlsYXJseSlcblx0XHRcdC8vIC0gc2xpY2UoMTMpIG9uIHZ0MiB3b3VsZCBnaXZlIFwiaW5lM1wiIGluc3RlYWQgb2YgdGhlIGZ1bGwgbmV3IGNvbnRlbnRcblxuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgY3JlYXRlWHRlcm0oKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgZmlyc3QgVlQgc25hcHNob3Rcblx0XHRcdGNvbnN0IHZ0MSA9ICdMaW5lMVxcclxcbkxpbmUyJztcblx0XHRcdGF3YWl0IHdyaXRlKG1pcnJvciwgdnQxKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldEJ1ZmZlclRleHQobWlycm9yKSwgJ0xpbmUxXFxuTGluZTInKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgZGl2ZXJnZW50IFZUIHNuYXBzaG90IChkaWZmZXJlbnQgZXNjYXBlIHNlcXVlbmNlcyBmb3Igc2FtZSBjb250ZW50KVxuXHRcdFx0Ly8gVGhpcyBtaW1pY3Mgd2hhdCBjYW4gaGFwcGVuIG9uIFdpbmRvd3Mgd2hlcmUgdGhlIFZUIHNlcmlhbGl6ZXJcblx0XHRcdC8vIHByb2R1Y2VzIGRpZmZlcmVudCBvdXRwdXQgYmV0d2VlbiBjYWxsc1xuXHRcdFx0Y29uc3QgdnQyID0gJ0RpZmZlcmVudFByZWZpeCcgKyAnTGluZTMnO1xuXG5cdFx0XHQvLyBVc2UgdGhlIGFjdHVhbCB1dGlsaXR5IGZ1bmN0aW9uIHRvIHRlc3QgYm91bmRhcnkgY2hlY2tpbmdcblx0XHRcdGNvbnN0IGJvdW5kYXJ5TWF0Y2hlcyA9IHZ0Qm91bmRhcnlNYXRjaGVzKHZ0MiwgdnQxLCB2dDEubGVuZ3RoKTtcblxuXHRcdFx0Ly8gQm91bmRhcnkgc2hvdWxkIE5PVCBtYXRjaCBiZWNhdXNlIHRoZSBwcmVmaXggZGl2ZXJnZWRcblx0XHRcdHN0cmljdEVxdWFsKGJvdW5kYXJ5TWF0Y2hlcywgZmFsc2UsICdCb3VuZGFyeSBjaGVjayBzaG91bGQgZGV0ZWN0IGRpdmVyZ2VuY2UnKTtcblxuXHRcdFx0Ly8gVXNlIFxceDFiYyAoUklTKSArIG5ldyBjb250ZW50IGluIG9uZSB3cml0ZSB0byBhdm9pZCBhIGJsYW5rIGZyYW1lXG5cdFx0XHRhd2FpdCB3cml0ZShtaXJyb3IsIGBcXHgxYmMke3Z0Mn1gKTtcblxuXHRcdFx0Ly8gRmluYWwgY29udGVudCBzaG91bGQgYmUgdGhlIGNvbXBsZXRlIG5ldyBWVCwgbm90IGNvcnJ1cHRlZFxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0QnVmZmVyVGV4dChtaXJyb3IpLCAnRGlmZmVyZW50UHJlZml4TGluZTMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JvdW5kYXJ5IGNoZWNrIGFsbG93cyBhcHBlbmQgd2hlbiBWVCBwcmVmaXggbWF0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1pcnJvciA9IGF3YWl0IGNyZWF0ZVh0ZXJtKCk7XG5cblx0XHRcdC8vIEZpcnN0IFZUIHNuYXBzaG90XG5cdFx0XHRjb25zdCB2dDEgPSAnTGluZTFcXHJcXG5MaW5lMlxcclxcbic7XG5cdFx0XHRhd2FpdCB3cml0ZShtaXJyb3IsIHZ0MSk7XG5cblx0XHRcdC8vIFNlY29uZCBWVCBzbmFwc2hvdCB0aGF0IHByb3Blcmx5IGV4dGVuZHMgdGhlIGZpcnN0XG5cdFx0XHRjb25zdCB2dDIgPSB2dDEgKyAnTGluZTNcXHJcXG4nO1xuXG5cdFx0XHQvLyBVc2UgdGhlIGFjdHVhbCB1dGlsaXR5IGZ1bmN0aW9uIHRvIHRlc3QgYm91bmRhcnkgY2hlY2tpbmdcblx0XHRcdGNvbnN0IGJvdW5kYXJ5TWF0Y2hlcyA9IHZ0Qm91bmRhcnlNYXRjaGVzKHZ0MiwgdnQxLCB2dDEubGVuZ3RoKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYm91bmRhcnlNYXRjaGVzLCB0cnVlLCAnQm91bmRhcnkgY2hlY2sgc2hvdWxkIHBhc3Mgd2hlbiBwcmVmaXggbWF0Y2hlcycpO1xuXG5cdFx0XHQvLyBBcHBlbmQgc2hvdWxkIHdvcmsgY29ycmVjdGx5XG5cdFx0XHRjb25zdCBhcHBlbmRlZCA9IHZ0Mi5zbGljZSh2dDEubGVuZ3RoKTtcblx0XHRcdGF3YWl0IHdyaXRlKG1pcnJvciwgYXBwZW5kZWQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChnZXRCdWZmZXJUZXh0KG1pcnJvciksICdMaW5lMVxcbkxpbmUyXFxuTGluZTMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY3JlbWVudGFsIHVwZGF0ZXMgdXNlIGFwcGVuZCBwYXRoIChub3QgZnVsbCByZXdyaXRlKSBpbiBub3JtYWwgb3BlcmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGhpcyB0ZXN0IHZlcmlmaWVzIHRoYXQgaW4gbm9ybWFsIG9wZXJhdGlvbiAoVlQgcHJlZml4IG1hdGNoZXMpLFxuXHRcdFx0Ly8gd2UgdXNlIHRoZSBlZmZpY2llbnQgYXBwZW5kIHBhdGggcmF0aGVyIHRoYW4gZnVsbCByZXdyaXRlLlxuXG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0Y29uc3QgbWFya2VyID0gc291cmNlLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cblx0XHRcdC8vIEJ1aWxkIHVwIGNvbnRlbnQgaW5jcmVtZW50YWxseSwgc2ltdWxhdGluZyBzdHJlYW1pbmcgb3V0cHV0XG5cdFx0XHRjb25zdCB3cml0ZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdC8vIFN0ZXAgMTogSW5pdGlhbCBjb250ZW50XG5cdFx0XHRhd2FpdCB3cml0ZShzb3VyY2UsICdvdXRwdXQgbGluZSAxXFxyXFxuJyk7XG5cdFx0XHRjb25zdCB2dDEgPSBhd2FpdCBzb3VyY2UuZ2V0UmFuZ2VBc1ZUKG1hcmtlciwgdW5kZWZpbmVkLCB0cnVlKSA/PyAnJztcblxuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgY3JlYXRlWHRlcm0oKTtcblx0XHRcdGF3YWl0IHdyaXRlKG1pcnJvciwgdnQxKTtcblx0XHRcdHdyaXRlcy5wdXNoKHZ0MSk7XG5cblx0XHRcdC8vIFN0ZXAgMjogQWRkIG1vcmUgY29udGVudCAtIHNob3VsZCB1c2UgYXBwZW5kIHBhdGhcblx0XHRcdGF3YWl0IHdyaXRlKHNvdXJjZSwgJ291dHB1dCBsaW5lIDJcXHJcXG4nKTtcblx0XHRcdGNvbnN0IHZ0MiA9IGF3YWl0IHNvdXJjZS5nZXRSYW5nZUFzVlQobWFya2VyLCB1bmRlZmluZWQsIHRydWUpID8/ICcnO1xuXG5cdFx0XHQvLyBWZXJpZnkgVlQgZXh0ZW5kcyBwcm9wZXJseSAocHJlZml4IG1hdGNoZXMpXG5cdFx0XHRzdHJpY3RFcXVhbCh2dDIuc3RhcnRzV2l0aCh2dDEpLCB0cnVlLCAnVlQyIHNob3VsZCBzdGFydCB3aXRoIFZUMScpO1xuXG5cdFx0XHQvLyBBcHBlbmQgb25seSB0aGUgbmV3IHBhcnQgKHRoaXMgaXMgd2hhdCB0aGUgYXBwZW5kIHBhdGggZG9lcylcblx0XHRcdGNvbnN0IGFwcGVuZGVkMiA9IHZ0Mi5zbGljZSh2dDEubGVuZ3RoKTtcblx0XHRcdHN0cmljdEVxdWFsKGFwcGVuZGVkMi5sZW5ndGggPiAwLCB0cnVlLCAnU2hvdWxkIGhhdmUgbmV3IGNvbnRlbnQgdG8gYXBwZW5kJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhcHBlbmRlZDIubGVuZ3RoIDwgdnQyLmxlbmd0aCwgdHJ1ZSwgJ0FwcGVuZCBzaG91bGQgYmUgc21hbGxlciB0aGFuIGZ1bGwgcmV3cml0ZScpO1xuXHRcdFx0YXdhaXQgd3JpdGUobWlycm9yLCBhcHBlbmRlZDIpO1xuXHRcdFx0d3JpdGVzLnB1c2goYXBwZW5kZWQyKTtcblxuXHRcdFx0Ly8gU3RlcCAzOiBBZGQgbW9yZSBjb250ZW50IC0gc2hvdWxkIGNvbnRpbnVlIHVzaW5nIGFwcGVuZCBwYXRoXG5cdFx0XHRhd2FpdCB3cml0ZShzb3VyY2UsICdvdXRwdXQgbGluZSAzXFxyXFxuJyk7XG5cdFx0XHRjb25zdCB2dDMgPSBhd2FpdCBzb3VyY2UuZ2V0UmFuZ2VBc1ZUKG1hcmtlciwgdW5kZWZpbmVkLCB0cnVlKSA/PyAnJztcblxuXHRcdFx0c3RyaWN0RXF1YWwodnQzLnN0YXJ0c1dpdGgodnQyKSwgdHJ1ZSwgJ1ZUMyBzaG91bGQgc3RhcnQgd2l0aCBWVDInKTtcblxuXHRcdFx0Y29uc3QgYXBwZW5kZWQzID0gdnQzLnNsaWNlKHZ0Mi5sZW5ndGgpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXBwZW5kZWQzLmxlbmd0aCA+IDAsIHRydWUsICdTaG91bGQgaGF2ZSBuZXcgY29udGVudCB0byBhcHBlbmQnKTtcblx0XHRcdHN0cmljdEVxdWFsKGFwcGVuZGVkMy5sZW5ndGggPCB2dDMubGVuZ3RoLCB0cnVlLCAnQXBwZW5kIHNob3VsZCBiZSBzbWFsbGVyIHRoYW4gZnVsbCByZXdyaXRlJyk7XG5cdFx0XHRhd2FpdCB3cml0ZShtaXJyb3IsIGFwcGVuZGVkMyk7XG5cdFx0XHR3cml0ZXMucHVzaChhcHBlbmRlZDMpO1xuXG5cdFx0XHRtYXJrZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBWZXJpZnkgZmluYWwgY29udGVudCBpcyBjb3JyZWN0XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRCdWZmZXJUZXh0KG1pcnJvciksICdvdXRwdXQgbGluZSAxXFxub3V0cHV0IGxpbmUgMlxcbm91dHB1dCBsaW5lIDMnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHdlIHVzZWQgdGhlIGFwcGVuZCBwYXRoICh0b3RhbCBieXRlcyB3cml0dGVuIHNob3VsZCBiZSByb3VnaGx5XG5cdFx0XHQvLyBlcXVhbCB0byB0b3RhbCBWVCwgbm90IDN4IHRoZSB0b3RhbCBkdWUgdG8gZnVsbCByZXdyaXRlcylcblx0XHRcdGNvbnN0IHRvdGFsV3JpdHRlbiA9IHdyaXRlcy5yZWR1Y2UoKHN1bSwgdykgPT4gc3VtICsgdy5sZW5ndGgsIDApO1xuXHRcdFx0Y29uc3QgZnVsbFJld3JpdGVXb3VsZEJlID0gdnQxLmxlbmd0aCArIHZ0Mi5sZW5ndGggKyB2dDMubGVuZ3RoO1xuXHRcdFx0c3RyaWN0RXF1YWwodG90YWxXcml0dGVuIDwgZnVsbFJld3JpdGVXb3VsZEJlLCB0cnVlLFxuXHRcdFx0XHRgQXBwZW5kIHBhdGggc2hvdWxkIHdyaXRlIGxlc3MgKCR7dG90YWxXcml0dGVufSkgdGhhbiBmdWxsIHJld3JpdGVzIHdvdWxkICgke2Z1bGxSZXdyaXRlV291bGRCZX0pYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzbmFwc2hvdCBsaW5lIGNvdW50IHJlZmxlY3RzIHJlbmRlcmVkIHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3luYyBmdW5jdGlvbiBtZWFzdXJlKHRleHQ6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0XHRcdGNvbnN0IHh0ZXJtID0gYXdhaXQgY3JlYXRlWHRlcm0oKTtcblx0XHRcdFx0aWYgKHRleHQpIHtcblx0XHRcdFx0XHRhd2FpdCB3cml0ZSh4dGVybSwgdGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNvbXB1dGVTbmFwc2hvdExpbmVDb3VudCh4dGVybS5yYXcuYnVmZmVyLmFjdGl2ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGVtcHR5OiBhd2FpdCBtZWFzdXJlKCcnKSxcblx0XHRcdFx0c2hvcnQ6IGF3YWl0IG1lYXN1cmUoJ2hlbGxvJyksXG5cdFx0XHRcdGV4YWN0bHlPbmVSb3c6IGF3YWl0IG1lYXN1cmUoJ2EnLnJlcGVhdCg4MCkpLFxuXHRcdFx0XHR0d29XcmFwcGVkUm93czogYXdhaXQgbWVhc3VyZSgnYScucmVwZWF0KDgxKSksXG5cdFx0XHRcdHRocmVlV3JhcHBlZFJvd3M6IGF3YWl0IG1lYXN1cmUoJ2EnLnJlcGVhdCgyMDApKSxcblx0XHRcdFx0bXVsdGlsaW5lV2l0aFdyYXBwaW5nOiBhd2FpdCBtZWFzdXJlKGAkeydhJy5yZXBlYXQoODEpfVxcclxcbm5leHRgKSxcblx0XHRcdFx0dHJhaWxpbmdDYXJyaWFnZVJldHVybkxpbmVGZWVkOiBhd2FpdCBtZWFzdXJlKCdsaW5lXFxyXFxuJyksXG5cdFx0XHRcdHRyYWlsaW5nTGluZUZlZWQ6IGF3YWl0IG1lYXN1cmUoJ2xpbmVcXG4nKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZW1wdHk6IDAsXG5cdFx0XHRcdHNob3J0OiAxLFxuXHRcdFx0XHRleGFjdGx5T25lUm93OiAxLFxuXHRcdFx0XHR0d29XcmFwcGVkUm93czogMixcblx0XHRcdFx0dGhyZWVXcmFwcGVkUm93czogMyxcblx0XHRcdFx0bXVsdGlsaW5lV2l0aFdyYXBwaW5nOiAzLFxuXHRcdFx0XHR0cmFpbGluZ0NhcnJpYWdlUmV0dXJuTGluZUZlZWQ6IDEsXG5cdFx0XHRcdHRyYWlsaW5nTGluZUZlZWQ6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NuYXBzaG90IGxpbmUgY291bnQgdXBkYXRlcyBhZnRlciBhcHBlbmRzIGFuZCByZXdyaXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHh0ZXJtID0gYXdhaXQgY3JlYXRlWHRlcm0oKTtcblx0XHRcdGF3YWl0IHdyaXRlKHh0ZXJtLCAnYScucmVwZWF0KDgxKSk7XG5cdFx0XHRjb25zdCBpbml0aWFsID0gY29tcHV0ZVNuYXBzaG90TGluZUNvdW50KHh0ZXJtLnJhdy5idWZmZXIuYWN0aXZlKTtcblxuXHRcdFx0YXdhaXQgd3JpdGUoeHRlcm0sICdiJy5yZXBlYXQoMTIwKSk7XG5cdFx0XHRjb25zdCBhcHBlbmRlZCA9IGNvbXB1dGVTbmFwc2hvdExpbmVDb3VudCh4dGVybS5yYXcuYnVmZmVyLmFjdGl2ZSk7XG5cblx0XHRcdGF3YWl0IHdyaXRlKHh0ZXJtLCAnXFx4MWJbMkpcXHgxYlszSlxceDFiW0hzaG9ydCcpO1xuXHRcdFx0Y29uc3QgcmV3cml0dGVuID0gY29tcHV0ZVNuYXBzaG90TGluZUNvdW50KHh0ZXJtLnJhdy5idWZmZXIuYWN0aXZlKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHsgaW5pdGlhbCwgYXBwZW5kZWQsIHJld3JpdHRlbiB9LCB7XG5cdFx0XHRcdGluaXRpYWw6IDIsXG5cdFx0XHRcdGFwcGVuZGVkOiAzLFxuXHRcdFx0XHRyZXdyaXR0ZW46IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NuYXBzaG90IGxpbmUgY291bnQgcHJlc2VydmVzIGFuIGV4cGxpY2l0IHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeHRlcm0gPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0YXdhaXQgd3JpdGUoeHRlcm0sICdhJy5yZXBlYXQoMjAwKSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGNvbXB1dGVTbmFwc2hvdExpbmVDb3VudCh4dGVybS5yYXcuYnVmZmVyLmFjdGl2ZSwgNyksIDcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoJywgKCkgPT4ge1xuXG5cdFx0LyoqXG5cdFx0ICogQ3JlYXRlcyBhIG1vY2sgYnVmZmVyIHdpdGggdGhlIGdpdmVuIGxpbmVzLlxuXHRcdCAqIEVhY2ggc3RyaW5nIHJlcHJlc2VudHMgYSBsaW5lOyBjaGFyYWN0ZXJzIGFyZSBjZWxscywgc3BhY2VzIGFyZSBlbXB0eSBjZWxscy5cblx0XHQgKi9cblx0XHRmdW5jdGlvbiBjcmVhdGVNb2NrQnVmZmVyKGxpbmVzOiBzdHJpbmdbXSwgY29sczogbnVtYmVyID0gODApOiB7IHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyOyBnZXRMaW5lKHk6IG51bWJlcik6IHsgcmVhZG9ubHkgbGVuZ3RoOiBudW1iZXI7IGdldENlbGwoeDogbnVtYmVyKTogeyBnZXRDaGFycygpOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIH0ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGVuZ3RoOiBsaW5lcy5sZW5ndGgsXG5cdFx0XHRcdGdldExpbmUoeTogbnVtYmVyKSB7XG5cdFx0XHRcdFx0aWYgKHkgPCAwIHx8IHkgPj0gbGluZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IGxpbmVzW3ldO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsZW5ndGg6IE1hdGgubWF4KGxpbmVDb250ZW50Lmxlbmd0aCwgY29scyksXG5cdFx0XHRcdFx0XHRnZXRDZWxsKHg6IG51bWJlcikge1xuXHRcdFx0XHRcdFx0XHRpZiAoeCA8IDAgfHwgeCA+PSBsaW5lQ29udGVudC5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4geyBnZXRDaGFyczogKCkgPT4gJycgfTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCBjaGFyID0gbGluZUNvbnRlbnRbeF07XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGdldENoYXJzOiAoKSA9PiBjaGFyID09PSAnICcgPyAnJyA6IGNoYXIgfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JldHVybnMgMCBmb3IgZW1wdHkgYnVmZmVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gY3JlYXRlTW9ja0J1ZmZlcihbXSk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb21wdXRlTWF4QnVmZmVyQ29sdW1uV2lkdGgoYnVmZmVyLCA4MCksIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyAwIGZvciBidWZmZXIgd2l0aCBvbmx5IGVtcHR5IGxpbmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gY3JlYXRlTW9ja0J1ZmZlcihbJycsICcnLCAnJ10pO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGJ1ZmZlciwgODApLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29ycmVjdCB3aWR0aCBmb3Igc2luZ2xlIGNoYXJhY3RlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGNyZWF0ZU1vY2tCdWZmZXIoWydYJ10pO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGJ1ZmZlciwgODApLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29ycmVjdCB3aWR0aCBmb3Igc2luZ2xlIGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSBjcmVhdGVNb2NrQnVmZmVyKFsnaGVsbG8nXSk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb21wdXRlTWF4QnVmZmVyQ29sdW1uV2lkdGgoYnVmZmVyLCA4MCksIDUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBtYXggd2lkdGggYWNyb3NzIG11bHRpcGxlIGxpbmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gY3JlYXRlTW9ja0J1ZmZlcihbXG5cdFx0XHRcdCdzaG9ydCcsXG5cdFx0XHRcdCdtdWNoIGxvbmdlciBsaW5lJyxcblx0XHRcdFx0J21pZCdcblx0XHRcdF0pO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGJ1ZmZlciwgODApLCAxNik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIHRyYWlsaW5nIHNwYWNlcyAoZW1wdHkgY2VsbHMpJywgKCkgPT4ge1xuXHRcdFx0Ly8gU3BhY2VzIGFyZSB0cmVhdGVkIGFzIGVtcHR5IGNlbGxzIGluIG91ciBtb2NrXG5cdFx0XHRjb25zdCBidWZmZXIgPSBjcmVhdGVNb2NrQnVmZmVyKFsnaGVsbG8gICAgICddKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbXB1dGVNYXhCdWZmZXJDb2x1bW5XaWR0aChidWZmZXIsIDgwKSwgNSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNwZWN0cyBjb2xzIHBhcmFtZXRlciB0byBjbGFtcCBsaW5lIGxlbmd0aCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGNyZWF0ZU1vY2tCdWZmZXIoWydhYmNkZWZnaGlqa2xtbm9wJ10pOyAvLyAxNiBjaGFycywgbm8gc3BhY2VzXG5cdFx0XHRzdHJpY3RFcXVhbChjb21wdXRlTWF4QnVmZmVyQ29sdW1uV2lkdGgoYnVmZmVyLCAxMCksIDEwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgbGluZXMgd2l0aCBjb250ZW50IGF0IGRpZmZlcmVudCBwb3NpdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSBjcmVhdGVNb2NrQnVmZmVyKFtcblx0XHRcdFx0J2EnLCAgICAgICAgICAgLy8gd2lkdGggMVxuXHRcdFx0XHQnICBiJywgICAgICAgICAvLyBjb250ZW50IGF0IGNvbCAyLCBidXQgd2lkdGggaXMgM1xuXHRcdFx0XHQnICAgIGMnLCAgICAgICAvLyBjb250ZW50IGF0IGNvbCA0LCBidXQgd2lkdGggaXMgNVxuXHRcdFx0XHQnICAgICAgZCcgICAgICAvLyBjb250ZW50IGF0IGNvbCA2LCB3aWR0aCBpcyA3XG5cdFx0XHRdKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbXB1dGVNYXhCdWZmZXJDb2x1bW5XaWR0aChidWZmZXIsIDgwKSwgNyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGJ1ZmZlciB3aXRoIHVuZGVmaW5lZCBsaW5lcyBncmFjZWZ1bGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnVmZmVyID0ge1xuXHRcdFx0XHRsZW5ndGg6IDMsXG5cdFx0XHRcdGdldExpbmUoeTogbnVtYmVyKSB7XG5cdFx0XHRcdFx0aWYgKHkgPT09IDEpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsZW5ndGg6IDUsXG5cdFx0XHRcdFx0XHRnZXRDZWxsKHg6IG51bWJlcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4geCA8IDMgPyB7IGdldENoYXJzOiAoKSA9PiAnWCcgfSA6IHsgZ2V0Q2hhcnM6ICgpID0+ICcnIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbXB1dGVNYXhCdWZmZXJDb2x1bW5XaWR0aChidWZmZXIsIDgwKSwgMyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGxpbmUgd2l0aCBhbGwgZW1wdHkgY2VsbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSBjcmVhdGVNb2NrQnVmZmVyKFsnICAgICAnXSk7IC8vIGFsbCBzcGFjZXMgPSBlbXB0eSBjZWxsc1xuXHRcdFx0c3RyaWN0RXF1YWwoY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGJ1ZmZlciwgODApLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgbWl4ZWQgZW1wdHkgYW5kIG5vbi1lbXB0eSBsaW5lcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGNyZWF0ZU1vY2tCdWZmZXIoW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2NvbnRlbnQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J21vcmUnLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb21wdXRlTWF4QnVmZmVyQ29sdW1uV2lkdGgoYnVmZmVyLCA4MCksIDcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBjb3JyZWN0IHdpZHRoIGZvciBsaW5lIGV4YWN0bHkgYXQgODAgY29scycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbmU4MCA9ICdhJy5yZXBlYXQoODApO1xuXHRcdFx0Y29uc3QgYnVmZmVyID0gY3JlYXRlTW9ja0J1ZmZlcihbbGluZTgwXSk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb21wdXRlTWF4QnVmZmVyQ29sdW1uV2lkdGgoYnVmZmVyLCA4MCksIDgwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29ycmVjdCB3aWR0aCBmb3IgbGluZSBleGNlZWRpbmcgODAgY29scyB3aXRoIGhpZ2hlciBjb2xzIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGluZTEwMCA9ICdhJy5yZXBlYXQoMTAwKTtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGNyZWF0ZU1vY2tCdWZmZXIoW2xpbmUxMDBdLCAxMjApO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGJ1ZmZlciwgMTIwKSwgMTAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgd2lkZSB0ZXJtaW5hbCB3aXRoIGxvbmcgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGNyZWF0ZU1vY2tCdWZmZXIoW1xuXHRcdFx0XHQnc2hvcnQnLFxuXHRcdFx0XHQnYScucmVwZWF0KDE1MCksXG5cdFx0XHRcdCdtZWRpdW0gY29udGVudCBoZXJlJ1xuXHRcdFx0XSwgMjAwKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbXB1dGVNYXhCdWZmZXJDb2x1bW5XaWR0aChidWZmZXIsIDIwMCksIDE1MCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXggb2YgbXVsdGlwbGUgbGluZXMgd2hlcmUgbG9uZ2VzdCBleGNlZWRzIGRlZmF1bHQgY29scycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGNyZWF0ZU1vY2tCdWZmZXIoW1xuXHRcdFx0XHQnYScucmVwZWF0KDUwKSxcblx0XHRcdFx0J2InLnJlcGVhdCgxMjApLFxuXHRcdFx0XHQnYycucmVwZWF0KDkwKVxuXHRcdFx0XSwgMTUwKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbXB1dGVNYXhCdWZmZXJDb2x1bW5XaWR0aChidWZmZXIsIDE1MCksIDEyMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd2dEJvdW5kYXJ5TWF0Y2hlcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSB3aGVuIHN0cmluZ3MgbWF0Y2ggYXQgYm91bmRhcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvbGRWVCA9ICdMaW5lMVxcclxcbkxpbmUyXFxyXFxuJztcblx0XHRcdGNvbnN0IG5ld1ZUID0gb2xkVlQgKyAnTGluZTNcXHJcXG4nO1xuXHRcdFx0c3RyaWN0RXF1YWwodnRCb3VuZGFyeU1hdGNoZXMobmV3VlQsIG9sZFZULCBvbGRWVC5sZW5ndGgpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBzdHJpbmdzIGRpdmVyZ2UgYXQgYm91bmRhcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvbGRWVCA9ICdMaW5lMVxcclxcbkxpbmUyJztcblx0XHRcdGNvbnN0IG5ld1ZUID0gJ0RpZmZlcmVudFByZWZpeExpbmUzJztcblx0XHRcdHN0cmljdEVxdWFsKHZ0Qm91bmRhcnlNYXRjaGVzKG5ld1ZULCBvbGRWVCwgb2xkVlQubGVuZ3RoKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIHNpbmdsZSBjaGFyYWN0ZXIgZGlmZmVycyBpbiB3aW5kb3cnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvbGRWVCA9ICdBQUFBQUFBQUFBJztcblx0XHRcdGNvbnN0IG5ld1ZUID0gJ0FBQUFBQkFBQUEnICsgJ05ld0NvbnRlbnQnO1xuXHRcdFx0c3RyaWN0RXF1YWwodnRCb3VuZGFyeU1hdGNoZXMobmV3VlQsIG9sZFZULCBvbGRWVC5sZW5ndGgpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIGVtcHR5IHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbCh2dEJvdW5kYXJ5TWF0Y2hlcygnJywgJycsIDApLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSB3aGVuIHNsaWNlUG9pbnQgaXMgMCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG9sZFZUID0gJyc7XG5cdFx0XHRjb25zdCBuZXdWVCA9ICdTb21lQ29udGVudCc7XG5cdFx0XHRzdHJpY3RFcXVhbCh2dEJvdW5kYXJ5TWF0Y2hlcyhuZXdWVCwgb2xkVlQsIDApLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgc3RyaW5ncyBzaG9ydGVyIHRoYW4gd2luZG93IHNpemUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvbGRWVCA9ICdTaG9ydCc7XG5cdFx0XHRjb25zdCBuZXdWVCA9ICdTaG9ydCcgKyAnQWRkZWQnO1xuXHRcdFx0c3RyaWN0RXF1YWwodnRCb3VuZGFyeU1hdGNoZXMobmV3VlQsIG9sZFZULCBvbGRWVC5sZW5ndGgpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3BlY3RzIGN1c3RvbSB3aW5kb3cgc2l6ZSBwYXJhbWV0ZXInLCAoKSA9PiB7XG5cdFx0XHQvLyBXaXRoIGRlZmF1bHQgd2luZG93ICg1MCksIHRoaXMgd291bGQgbWF0Y2ggc2luY2UgdGhlIGRpZmYgaXMgYXQgcG9zaXRpb24gNzBcblx0XHRcdGNvbnN0IHByZWZpeCA9ICdBJy5yZXBlYXQoODApO1xuXHRcdFx0Y29uc3Qgb2xkVlQgPSBwcmVmaXg7XG5cdFx0XHRjb25zdCBuZXdWVCA9ICdYJyArICdBJy5yZXBlYXQoNzkpICsgJ05ld0NvbnRlbnQnOyAvLyBkaWZmZXJzIGF0IHBvc2l0aW9uIDBcblxuXHRcdFx0Ly8gV2l0aCB3aW5kb3cgb2YgNTAsIG9ubHkgY2hlY2tzIGNoYXJzIDMwLTgwLCB3aGljaCB3b3VsZCBtYXRjaFxuXHRcdFx0c3RyaWN0RXF1YWwodnRCb3VuZGFyeU1hdGNoZXMobmV3VlQsIG9sZFZULCBvbGRWVC5sZW5ndGgsIDUwKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFdpdGggd2luZG93IG9mIDEwMCwgd291bGQgY2hlY2sgY2hhcnMgMC04MCwgd2hpY2ggd291bGQgTk9UIG1hdGNoXG5cdFx0XHRzdHJpY3RFcXVhbCh2dEJvdW5kYXJ5TWF0Y2hlcyhuZXdWVCwgb2xkVlQsIG9sZFZULmxlbmd0aCwgMTAwKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGV0ZWN0cyBkaXZlcmdlbmNlIGluIGVzY2FwZSBzZXF1ZW5jZXMgKFdpbmRvd3Mgc2NlbmFyaW8pJywgKCkgPT4ge1xuXHRcdFx0Ly8gU2ltdWxhdGVzIFdpbmRvd3MgaXNzdWUgd2hlcmUgVlQgZXNjYXBlIHNlcXVlbmNlcyBkaWZmZXJcblx0XHRcdGNvbnN0IG9sZFZUID0gJ1xceDFiWzBtXFx4MWJbMW1Cb2xkXFx4MWJbMG1cXHJcXG4nO1xuXHRcdFx0Y29uc3QgbmV3VlQgPSAnXFx4MWJbMG1cXHgxYlsyMm1Cb2xkXFx4MWJbMG1cXHJcXG5Nb3JlJzsgLy8gRGlmZmVyZW50IGVzY2FwZSBjb2RlIGZvciBib2xkXG5cdFx0XHRzdHJpY3RFcXVhbCh2dEJvdW5kYXJ5TWF0Y2hlcyhuZXdWVCwgb2xkVlQsIG9sZFZULmxlbmd0aCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgbWF0Y2hpbmcgZXNjYXBlIHNlcXVlbmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG9sZFZUID0gJ1xceDFiWzMxbVJlZFxceDFiWzBtXFxyXFxuJztcblx0XHRcdGNvbnN0IG5ld1ZUID0gJ1xceDFiWzMxbVJlZFxceDFiWzBtXFxyXFxuR3JlZW4nO1xuXHRcdFx0c3RyaWN0RXF1YWwodnRCb3VuZGFyeU1hdGNoZXMobmV3VlQsIG9sZFZULCBvbGRWVC5sZW5ndGgpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gbWFrZUZvbnQoY2hhcldpZHRoPzogbnVtYmVyLCBsZXR0ZXJTcGFjaW5nID0gMCk6IElUZXJtaW5hbEZvbnQge1xuXHRcdFx0cmV0dXJuIHsgZm9udEZhbWlseTogJ21vbm9zcGFjZScsIGZvbnRTaXplOiAxMiwgbGV0dGVyU3BhY2luZywgbGluZUhlaWdodDogMSwgY2hhcldpZHRoLCBjaGFySGVpZ2h0OiAxNCB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ2ZpbGxzIHRoZSBhdmFpbGFibGUgd2lkdGggbWludXMgdGhlIGd1dHRlcicsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHdpZGU6IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKDEyMjQsIG1ha2VGb250KDEwKSwgMSksXG5cdFx0XHRcdGZsb29yZWQ6IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKDEyMDAsIG1ha2VGb250KDEwKSwgMSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdpZGU6IDEyMCwgLy8gZmxvb3IoKDEyMjQgLSAyMCkgLyAxMClcblx0XHRcdFx0Zmxvb3JlZDogMTE4LCAvLyAoMTIwMCAtIDIwKSAvIDEwXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzIHN0YWJsZSBhY3Jvc3MgZGV2aWNlIHBpeGVsIHJhdGlvcyB3aGVuIGxldHRlciBzcGFjaW5nIGlzIHplcm8nLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjb21wdXRlQ2hhdFRlcm1pbmFsTWlycm9yQ29scygxMjI0LCBtYWtlRm9udCgxMCksIDIpLCAxMjApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjb3VudHMgZm9yIGxldHRlciBzcGFjaW5nIGluIGRldmljZSBwaXhlbHMnLCAoKSA9PiB7XG5cdFx0XHQvLyBmbG9vcigoMTIyNCAtIDI0KSAqIDIgLyAoMTAgKiAyICsgMSkpXG5cdFx0XHRzdHJpY3RFcXVhbChjb21wdXRlQ2hhdFRlcm1pbmFsTWlycm9yQ29scygxMjI0LCBtYWtlRm9udCgxMCwgMSksIDIpLCAxMTQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgZGVmYXVsdCBjb2xzIHdoZW4gd2lkdGggb3IgZm9udCBpcyB1bm1lYXN1cmFibGUnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR6ZXJvV2lkdGg6IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKDAsIG1ha2VGb250KDEwKSwgMSksXG5cdFx0XHRcdG5hbldpZHRoOiBjb21wdXRlQ2hhdFRlcm1pbmFsTWlycm9yQ29scyhOYU4sIG1ha2VGb250KDEwKSwgMSksXG5cdFx0XHRcdG1pc3NpbmdDaGFyV2lkdGg6IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKDEyMjQsIG1ha2VGb250KHVuZGVmaW5lZCksIDEpLFxuXHRcdFx0XHR6ZXJvQ2hhcldpZHRoOiBjb21wdXRlQ2hhdFRlcm1pbmFsTWlycm9yQ29scygxMjI0LCBtYWtlRm9udCgwKSwgMSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHplcm9XaWR0aDogODAsXG5cdFx0XHRcdG5hbldpZHRoOiA4MCxcblx0XHRcdFx0bWlzc2luZ0NoYXJXaWR0aDogODAsXG5cdFx0XHRcdHplcm9DaGFyV2lkdGg6IDgwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmVhdHMgYW4gaW52YWxpZCBkZXZpY2UgcGl4ZWwgcmF0aW8gYXMgMScsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKDEyMjQsIG1ha2VGb250KDEwKSwgMCksIDEyMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGFuIGV4cGxpY2l0bHkgbWVhc3VyZWQgaG9yaXpvbnRhbCBjaHJvbWUgb3ZlciB0aGUgZGVmYXVsdCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG5vbmU6IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKDEyMDAsIG1ha2VGb250KDEwKSwgMSwgMCksXG5cdFx0XHRcdG1lYXN1cmVkOiBjb21wdXRlQ2hhdFRlcm1pbmFsTWlycm9yQ29scygxMjI0LCBtYWtlRm9udCgxMCksIDEsIDI0KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bm9uZTogMTIwLFxuXHRcdFx0XHRtZWFzdXJlZDogMTIwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYXJyb3cgd2lkdGhzIHdyYXAgdG8gdGhlIGZpdHRpbmcgY29sdW1uIGNvdW50LCBtaW5pbXVtIG9uZSBjb2x1bW4nLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRuYXJyb3c6IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKDEwMCwgbWFrZUZvbnQoMTApLCAxKSwgLy8gKDEwMCAtIDIwKSAvIDEwXG5cdFx0XHRcdHRpbnk6IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKDI1LCBtYWtlRm9udCgxMCksIDEpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRuYXJyb3c6IDgsXG5cdFx0XHRcdHRpbnk6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0RldGFjaGVkVGVybWluYWxTbmFwc2hvdE1pcnJvci5sYXlvdXQnLCAoKSA9PiB7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IFhUZXJtQmFzZUN0b3I6IHR5cGVvZiBUZXJtaW5hbDtcblx0XHRsZXQgZmFrZXM6IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZUZha2VEZXRhY2hlZFRlcm1pbmFsPltdO1xuXG5cdFx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRcdFhUZXJtQmFzZUN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0XHRmYWtlcyA9IFtdO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRcdGNyZWF0ZURldGFjaGVkVGVybWluYWw6IGFzeW5jIChvcHRpb25zOiBJRGV0YWNoZWRYVGVybU9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZURldGFjaGVkVGVybWluYWwoWFRlcm1CYXNlQ3Rvciwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0ZmFrZXMucHVzaChmYWtlKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFrZS5pbnN0YW5jZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBhcyBQYXJ0aWFsPElUZXJtaW5hbFNlcnZpY2U+KTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVNuYXBzaG90TWlycm9yKG91dHB1dDogeyB0ZXh0OiBzdHJpbmc7IHRydW5jYXRlZD86IGJvb2xlYW47IGxpbmVDb3VudD86IG51bWJlciB9IHwgdW5kZWZpbmVkKTogRGV0YWNoZWRUZXJtaW5hbFNuYXBzaG90TWlycm9yIHtcblx0XHRcdHJldHVybiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGV0YWNoZWRUZXJtaW5hbFNuYXBzaG90TWlycm9yLCBvdXRwdXQsICgpID0+IHVuZGVmaW5lZCkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Jlc2l6ZXMgdGhlIGRldGFjaGVkIHRlcm1pbmFsIHRvIGNvbHMgY29tcHV0ZWQgZnJvbSB0aGUgd2lkdGgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBjcmVhdGVTbmFwc2hvdE1pcnJvcih7IHRleHQ6ICdoZWxsbycgfSk7XG5cdFx0XHRhd2FpdCBtaXJyb3IubGF5b3V0KDEyMjQpOyAvLyBmbG9vcigoMTIyNCAtIDIwKSAvIDEwKSA9IDEyMCBjb2xzXG5cdFx0XHRzdHJpY3RFcXVhbChmYWtlcy5sZW5ndGgsIDEpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZmFrZXNbMF0ucmF3LmNvbHMsIDEyMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaXJzdCByZW5kZXIgYWZ0ZXIgbGF5b3V0IHdyYXBzIGF0IHRoZSBuZXcgY29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1pcnJvciA9IGNyZWF0ZVNuYXBzaG90TWlycm9yKHsgdGV4dDogJ3gnLnJlcGVhdCgxMDApIH0pO1xuXHRcdFx0YXdhaXQgbWlycm9yLmxheW91dCgxMjI0KTtcblx0XHRcdGF3YWl0IG1pcnJvci5yZW5kZXIoKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvbHM6IGZha2VzWzBdLnJhdy5jb2xzLFxuXHRcdFx0XHRsaW5lQ291bnQ6IGNvbXB1dGVTbmFwc2hvdExpbmVDb3VudChmYWtlc1swXS5yYXcuYnVmZmVyLmFjdGl2ZSksXG5cdFx0XHRcdG1heENvbHVtbldpZHRoOiBjb21wdXRlTWF4QnVmZmVyQ29sdW1uV2lkdGgoZmFrZXNbMF0ucmF3LmJ1ZmZlci5hY3RpdmUsIGZha2VzWzBdLnJhdy5jb2xzKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29sczogMTIwLFxuXHRcdFx0XHRsaW5lQ291bnQ6IDEsXG5cdFx0XHRcdG1heENvbHVtbldpZHRoOiAxMDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlLXdyYXBzIGFscmVhZHkgcmVuZGVyZWQgb3V0cHV0IGF0IHRoZSBuZXcgY29scyB3aXRob3V0IHJld3JpdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1pcnJvciA9IGNyZWF0ZVNuYXBzaG90TWlycm9yKHsgdGV4dDogJ3gnLnJlcGVhdCgxMDApIH0pO1xuXHRcdFx0YXdhaXQgbWlycm9yLnJlbmRlcigpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29tcHV0ZVNuYXBzaG90TGluZUNvdW50KGZha2VzWzBdLnJhdy5idWZmZXIuYWN0aXZlKSwgMik7XG5cdFx0XHRjb25zdCB3cml0ZUNhbGxzQmVmb3JlTGF5b3V0ID0gZmFrZXNbMF0uY291bnRlcnMud3JpdGVDYWxscztcblx0XHRcdGF3YWl0IG1pcnJvci5sYXlvdXQoMTIyNCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb2xzOiBmYWtlc1swXS5yYXcuY29scyxcblx0XHRcdFx0bGluZUNvdW50OiBjb21wdXRlU25hcHNob3RMaW5lQ291bnQoZmFrZXNbMF0ucmF3LmJ1ZmZlci5hY3RpdmUpLFxuXHRcdFx0XHRtYXhDb2x1bW5XaWR0aDogY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGZha2VzWzBdLnJhdy5idWZmZXIuYWN0aXZlLCBmYWtlc1swXS5yYXcuY29scyksXG5cdFx0XHRcdC8vIFJlLXdyYXBwaW5nIG11c3QgY29tZSBmcm9tIHh0ZXJtJ3MgbmF0aXZlIHJlc2l6ZSByZWZsb3csIG5vdCBhIGJ1ZmZlclxuXHRcdFx0XHQvLyByZXdyaXRlLCB3aGljaCB3b3VsZCBmbGFzaCBhIGNsZWFyZWQgZnJhbWUgb24gZXZlcnkgcmVzaXplXG5cdFx0XHRcdHdyaXRlQ2FsbHM6IGZha2VzWzBdLmNvdW50ZXJzLndyaXRlQ2FsbHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbHM6IDEyMCxcblx0XHRcdFx0bGluZUNvdW50OiAxLFxuXHRcdFx0XHRtYXhDb2x1bW5XaWR0aDogMTAwLFxuXHRcdFx0XHR3cml0ZUNhbGxzOiB3cml0ZUNhbGxzQmVmb3JlTGF5b3V0LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBlYXRlZCBsYXlvdXQgd2l0aCB0aGUgc2FtZSB3aWR0aCBkb2VzIG5vdCByZXNpemUgb3IgcmV3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1pcnJvciA9IGNyZWF0ZVNuYXBzaG90TWlycm9yKHsgdGV4dDogJ3gnLnJlcGVhdCgxMDApIH0pO1xuXHRcdFx0YXdhaXQgbWlycm9yLnJlbmRlcigpO1xuXHRcdFx0YXdhaXQgbWlycm9yLmxheW91dCgxMjI0KTtcblx0XHRcdGNvbnN0IHsgcmVzaXplQ2FsbHMsIHdyaXRlQ2FsbHMgfSA9IHsgLi4uZmFrZXNbMF0uY291bnRlcnMgfTtcblx0XHRcdGF3YWl0IG1pcnJvci5sYXlvdXQoMTIyNCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZmFrZXNbMF0uY291bnRlcnMsIHsgcmVzaXplQ2FsbHMsIHdyaXRlQ2FsbHMgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIG5vbi1wb3NpdGl2ZSB3aWR0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBjcmVhdGVTbmFwc2hvdE1pcnJvcih7IHRleHQ6ICdoZWxsbycgfSk7XG5cdFx0XHRhd2FpdCBtaXJyb3IubGF5b3V0KDApO1xuXHRcdFx0YXdhaXQgbWlycm9yLmxheW91dCgtMTApO1xuXHRcdFx0c3RyaWN0RXF1YWwoZmFrZXNbMF0ucmF3LmNvbHMsIDgwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIGEgcGVyc2lzdGVkIGxpbmVDb3VudCB0aGF0IHJlZmxlY3RzIHRoZSBvbGQgd3JhcCB3aWR0aCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFByb2R1Y2VycyBwZXJzaXN0IGxpbmVDb3VudCB3cmFwcGVkIGF0IHRoZSBzb3VyY2UgdGVybWluYWwncyBjb2xzOyBhZnRlciBhXG5cdFx0XHQvLyB3aWR0aCBsYXlvdXQgdGhlIHJlbmRlcmVkIHJvdyBjb3VudCBpcyB0aGUgZ3JvdW5kIHRydXRoIGZvciB0aGUgYm94IGhlaWdodFxuXHRcdFx0Y29uc3QgbWlycm9yID0gY3JlYXRlU25hcHNob3RNaXJyb3IoeyB0ZXh0OiAneCcucmVwZWF0KDEwMCksIGxpbmVDb3VudDogMiB9KTtcblx0XHRcdGF3YWl0IG1pcnJvci5sYXlvdXQoMTIyNCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtaXJyb3IucmVuZGVyKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmxpbmVDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBhbiBleHBsaWNpdCBsaW5lQ291bnQgZm9yIHRydW5jYXRlZCBvdXRwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUcnVuY2F0ZWQgc25hcHNob3RzIHVuZGVyLXJlcHJlc2VudCB0aGUgcmVhbCBvdXRwdXQsIHNvIHRoZSBwZXJzaXN0ZWQgY291bnQgd2luc1xuXHRcdFx0Y29uc3QgbWlycm9yID0gY3JlYXRlU25hcHNob3RNaXJyb3IoeyB0ZXh0OiAnc2hvcnQnLCB0cnVuY2F0ZWQ6IHRydWUsIGxpbmVDb3VudDogNDIgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtaXJyb3IucmVuZGVyKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmxpbmVDb3VudCwgNDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgYSB0cnVuY2F0ZWQgc25hcHNob3QgaGVpZ2h0IGFjcm9zcyBsYXlvdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBjcmVhdGVTbmFwc2hvdE1pcnJvcih7IHRleHQ6ICd4Jy5yZXBlYXQoMTAwKSwgdHJ1bmNhdGVkOiB0cnVlLCBsaW5lQ291bnQ6IDQyIH0pO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBtaXJyb3IucmVuZGVyKCk7XG5cdFx0XHRjb25zdCBsYWlkT3V0ID0gYXdhaXQgbWlycm9yLmxheW91dCgxMjI0KTtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IGF3YWl0IG1pcnJvci5yZW5kZXIoKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGZpcnN0OiBmaXJzdD8ubGluZUNvdW50LFxuXHRcdFx0XHRsYWlkT3V0OiBsYWlkT3V0Py5saW5lQ291bnQsXG5cdFx0XHRcdGNhY2hlZDogY2FjaGVkPy5saW5lQ291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGZpcnN0OiA0Mixcblx0XHRcdFx0bGFpZE91dDogNDIsXG5cdFx0XHRcdGNhY2hlZDogNDIsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21lYXN1cmVzIGhvcml6b250YWwgY2hyb21lIGZyb20gdGhlIGF0dGFjaGVkIGVsZW1lbnQgY29tcHV0ZWQgcGFkZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1pcnJvciA9IGNyZWF0ZVNuYXBzaG90TWlycm9yKHsgdGV4dDogJ2hlbGxvJyB9KTtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZmFrZXNbMF0ucmF3Lm9wZW4oY29udGFpbmVyKTtcblx0XHRcdFx0ZmFrZXNbMF0ucmF3LmVsZW1lbnQhLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzRweCc7XG5cdFx0XHRcdGZha2VzWzBdLnJhdy5lbGVtZW50IS5zdHlsZS5wYWRkaW5nUmlnaHQgPSAnMHB4Jztcblx0XHRcdFx0YXdhaXQgbWlycm9yLmxheW91dCgxMjI0KTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoZmFrZXNbMF0ucmF3LmNvbHMsIDEyMik7IC8vIGZsb29yKCgxMjI0IC0gNCkgLyAxMClcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0RldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yLmxheW91dCcsICgpID0+IHtcblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgWFRlcm1CYXNlQ3RvcjogdHlwZW9mIFRlcm1pbmFsO1xuXHRcdGxldCBmYWtlczogUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlRmFrZURldGFjaGVkVGVybWluYWw+W107XG5cblx0XHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0XHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk6IDIsXG5cdFx0XHRcdFx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiAxXG5cdFx0XHRcdH0gYXMgUGFydGlhbDxJRWRpdG9yT3B0aW9ucz4sXG5cdFx0XHRcdGZpbGVzOiB7fSxcblx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRpbnRlZ3JhdGVkOiBkZWZhdWx0VGVybWluYWxDb25maWdcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZVxuXHRcdFx0fSwgc3RvcmUpO1xuXHRcdFx0WFRlcm1CYXNlQ3RvciA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblx0XHRcdGZha2VzID0gW107XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFNlcnZpY2UsIHtcblx0XHRcdFx0Y3JlYXRlRGV0YWNoZWRUZXJtaW5hbDogYXN5bmMgKG9wdGlvbnM6IElEZXRhY2hlZFhUZXJtT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZha2UgPSBjcmVhdGVGYWtlRGV0YWNoZWRUZXJtaW5hbChYVGVybUJhc2VDdG9yLCBvcHRpb25zKTtcblx0XHRcdFx0XHRmYWtlcy5wdXNoKGZha2UpO1xuXHRcdFx0XHRcdHJldHVybiBmYWtlLmluc3RhbmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGFzIFBhcnRpYWw8SVRlcm1pbmFsU2VydmljZT4pO1xuXHRcdH0pO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlWHRlcm0oY29scyA9IDgwLCByb3dzID0gMTApOiBQcm9taXNlPFh0ZXJtVGVybWluYWw+IHtcblx0XHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSk7XG5cdFx0XHRyZXR1cm4gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFh0ZXJtVGVybWluYWwsIHVuZGVmaW5lZCwgWFRlcm1CYXNlQ3Rvciwge1xuXHRcdFx0XHRjb2xzLFxuXHRcdFx0XHRyb3dzLFxuXHRcdFx0XHR4dGVybUNvbG9yUHJvdmlkZXI6IHsgZ2V0QmFja2dyb3VuZENvbG9yOiAoKSA9PiB1bmRlZmluZWQgfSxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdFx0XHRkaXNhYmxlU2hlbGxJbnRlZ3JhdGlvblJlcG9ydGluZzogdHJ1ZSxcblx0XHRcdFx0eHRlcm1BZGRvbkltcG9ydGVyOiBuZXcgVGVzdFh0ZXJtQWRkb25JbXBvcnRlcigpLFxuXHRcdFx0fSwgdW5kZWZpbmVkKSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gd3JpdGUoeHRlcm06IFh0ZXJtVGVybWluYWwsIGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geHRlcm0ud3JpdGUoZGF0YSwgcmVzb2x2ZSkpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGxpbmVUZXh0KHJhdzogVGVybWluYWwsIHk6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gcmF3LmJ1ZmZlci5hY3RpdmUuZ2V0TGluZSh5KT8udHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSkgPz8gJyc7XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogV3JpdGVzIGEgZmluaXNoZWQgY29tbWFuZCB3aG9zZSBvdXRwdXQgaXMgYSBzaW5nbGUgMTAwIGNoYXJhY3RlciBsaW5lLCB3aGljaCBzb2Z0LXdyYXBzXG5cdFx0ICogb250byB0d28gcm93cyBpbiB0aGUgODAgY29sdW1uIHNvdXJjZSB0ZXJtaW5hbC5cblx0XHQgKi9cblx0XHRhc3luYyBmdW5jdGlvbiBjcmVhdGVXcmFwcGVkQ29tbWFuZChzb3VyY2U6IFh0ZXJtVGVybWluYWwpOiBQcm9taXNlPElUZXJtaW5hbENvbW1hbmQ+IHtcblx0XHRcdGNvbnN0IGV4ZWN1dGVkTWFya2VyID0gc291cmNlLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZShzb3VyY2UsICd4Jy5yZXBlYXQoMTAwKSArICdcXHJcXG4nKTtcblx0XHRcdGNvbnN0IGVuZE1hcmtlciA9IHNvdXJjZS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0cmV0dXJuIHsgZXhlY3V0ZWRNYXJrZXIsIGVuZE1hcmtlciB9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsQ29tbWFuZDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVDb21tYW5kTWlycm9yKHNvdXJjZTogWHRlcm1UZXJtaW5hbCwgY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCk6IERldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yIHtcblx0XHRcdHJldHVybiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3IsIHNvdXJjZSwgY29tbWFuZCkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Jlc2l6ZXMgYmVmb3JlIGFueSByZW5kZXIgd2l0aG91dCB3cml0aW5nIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGF3YWl0IGNyZWF0ZVdyYXBwZWRDb21tYW5kKHNvdXJjZSk7XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBjcmVhdGVDb21tYW5kTWlycm9yKHNvdXJjZSwgY29tbWFuZCk7XG5cdFx0XHRhd2FpdCBtaXJyb3IubGF5b3V0KDEyMjQpOyAvLyBmbG9vcigoMTIyNCAtIDIwKSAvIDEwKSA9IDEyMCBjb2xzXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb2xzOiBmYWtlc1swXS5yYXcuY29scyxcblx0XHRcdFx0d3JpdGVDYWxsczogZmFrZXNbMF0uY291bnRlcnMud3JpdGVDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29sczogMTIwLFxuXHRcdFx0XHR3cml0ZUNhbGxzOiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZS13cmFwcyByZW5kZXJlZCBjb21tYW5kIG91dHB1dCBhdCB0aGUgbmV3IGNvbHMgd2l0aG91dCByZXdyaXRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGF3YWl0IGNyZWF0ZVdyYXBwZWRDb21tYW5kKHNvdXJjZSk7XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBjcmVhdGVDb21tYW5kTWlycm9yKHNvdXJjZSwgY29tbWFuZCk7XG5cdFx0XHRhd2FpdCBtaXJyb3IucmVuZGVyQ29tbWFuZCgpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bGluZTA6IGxpbmVUZXh0KGZha2VzWzBdLnJhdywgMCksXG5cdFx0XHRcdGxpbmUxOiBsaW5lVGV4dChmYWtlc1swXS5yYXcsIDEpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRsaW5lMDogJ3gnLnJlcGVhdCg4MCksXG5cdFx0XHRcdGxpbmUxOiAneCcucmVwZWF0KDIwKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgd3JpdGVDYWxsc0JlZm9yZUxheW91dCA9IGZha2VzWzBdLmNvdW50ZXJzLndyaXRlQ2FsbHM7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtaXJyb3IubGF5b3V0KDEyMjQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29sczogZmFrZXNbMF0ucmF3LmNvbHMsXG5cdFx0XHRcdGxpbmUwOiBsaW5lVGV4dChmYWtlc1swXS5yYXcsIDApLFxuXHRcdFx0XHRtYXhDb2x1bW5XaWR0aDogY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGZha2VzWzBdLnJhdy5idWZmZXIuYWN0aXZlLCBmYWtlc1swXS5yYXcuY29scyksXG5cdFx0XHRcdC8vIFRoZSByZXBvcnRlZCBsaW5lIGNvdW50IG11c3QgcmVmbGVjdCB0aGUgcmUtd3JhcHBlZCBtaXJyb3Igcm93cywgbm90IHRoZVxuXHRcdFx0XHQvLyBzb3VyY2UgdGVybWluYWwncyB3cmFwIGF0IGl0cyBvd24gY29scywgc28gdGhlIGJveCBoZWlnaHQgbWF0Y2hlc1xuXHRcdFx0XHRsaW5lQ291bnQ6IHJlc3VsdD8ubGluZUNvdW50LFxuXHRcdFx0XHQvLyBSZS13cmFwcGluZyBtdXN0IGNvbWUgZnJvbSB4dGVybSdzIG5hdGl2ZSByZXNpemUgcmVmbG93LCBub3QgYSBidWZmZXJcblx0XHRcdFx0Ly8gcmV3cml0ZSwgd2hpY2ggd291bGQgZmxhc2ggYSBjbGVhcmVkIGZyYW1lIG9uIGV2ZXJ5IHJlc2l6ZVxuXHRcdFx0XHR3cml0ZUNhbGxzOiBmYWtlc1swXS5jb3VudGVycy53cml0ZUNhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjb2xzOiAxMjAsXG5cdFx0XHRcdGxpbmUwOiAneCcucmVwZWF0KDEwMCksXG5cdFx0XHRcdG1heENvbHVtbldpZHRoOiAxMDAsXG5cdFx0XHRcdGxpbmVDb3VudDogMSxcblx0XHRcdFx0d3JpdGVDYWxsczogd3JpdGVDYWxsc0JlZm9yZUxheW91dCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwZWF0ZWQgbGF5b3V0IHdpdGggdGhlIHNhbWUgd2lkdGggZG9lcyBub3QgcmVzaXplIG9yIHJld3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBjcmVhdGVYdGVybSgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGF3YWl0IGNyZWF0ZVdyYXBwZWRDb21tYW5kKHNvdXJjZSk7XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBjcmVhdGVDb21tYW5kTWlycm9yKHNvdXJjZSwgY29tbWFuZCk7XG5cdFx0XHRhd2FpdCBtaXJyb3IucmVuZGVyQ29tbWFuZCgpO1xuXHRcdFx0YXdhaXQgbWlycm9yLmxheW91dCgxMjI0KTtcblx0XHRcdGNvbnN0IHsgcmVzaXplQ2FsbHMsIHdyaXRlQ2FsbHMgfSA9IHsgLi4uZmFrZXNbMF0uY291bnRlcnMgfTtcblx0XHRcdGF3YWl0IG1pcnJvci5sYXlvdXQoMTIyNCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZmFrZXNbMF0uY291bnRlcnMsIHsgcmVzaXplQ2FsbHMsIHdyaXRlQ2FsbHMgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyb3cgaGVpZ2h0IG1ldHJpY3MnLCAoKSA9PiB7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IFhUZXJtQmFzZUN0b3I6IHR5cGVvZiBUZXJtaW5hbDtcblx0XHRsZXQgZmFrZXM6IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZUZha2VEZXRhY2hlZFRlcm1pbmFsPltdO1xuXHRcdGxldCBuZXh0Rm9udDogSVRlcm1pbmFsRm9udCB8IHVuZGVmaW5lZDtcblxuXHRcdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRcdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogMixcblx0XHRcdFx0XHRtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk6IDFcblx0XHRcdFx0fSBhcyBQYXJ0aWFsPElFZGl0b3JPcHRpb25zPixcblx0XHRcdFx0ZmlsZXM6IHt9LFxuXHRcdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRcdGludGVncmF0ZWQ6IGRlZmF1bHRUZXJtaW5hbENvbmZpZ1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHR9LCBzdG9yZSk7XG5cdFx0XHRYVGVybUJhc2VDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdFx0ZmFrZXMgPSBbXTtcblx0XHRcdG5leHRGb250ID0gdW5kZWZpbmVkO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRcdGNyZWF0ZURldGFjaGVkVGVybWluYWw6IGFzeW5jIChvcHRpb25zOiBJRGV0YWNoZWRYVGVybU9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRjb25zdCBmYWtlID0gY3JlYXRlRmFrZURldGFjaGVkVGVybWluYWwoWFRlcm1CYXNlQ3Rvciwgb3B0aW9ucywgbmV4dEZvbnQpO1xuXHRcdFx0XHRcdGZha2VzLnB1c2goZmFrZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZha2UuaW5zdGFuY2U7XG5cdFx0XHRcdH1cblx0XHRcdH0gYXMgUGFydGlhbDxJVGVybWluYWxTZXJ2aWNlPik7XG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVTbmFwc2hvdE1pcnJvcihvdXRwdXQ6IHsgdGV4dDogc3RyaW5nIH0gfCB1bmRlZmluZWQpOiBEZXRhY2hlZFRlcm1pbmFsU25hcHNob3RNaXJyb3Ige1xuXHRcdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZXRhY2hlZFRlcm1pbmFsU25hcHNob3RNaXJyb3IsIG91dHB1dCwgKCkgPT4gdW5kZWZpbmVkKSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlTGFpZE91dENvbW1hbmRNaXJyb3IoKTogUHJvbWlzZTxEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvcj4ge1xuXHRcdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShYdGVybVRlcm1pbmFsLCB1bmRlZmluZWQsIFhUZXJtQmFzZUN0b3IsIHtcblx0XHRcdFx0Y29sczogODAsXG5cdFx0XHRcdHJvd3M6IDEwLFxuXHRcdFx0XHR4dGVybUNvbG9yUHJvdmlkZXI6IHsgZ2V0QmFja2dyb3VuZENvbG9yOiAoKSA9PiB1bmRlZmluZWQgfSxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdFx0XHRkaXNhYmxlU2hlbGxJbnRlZ3JhdGlvblJlcG9ydGluZzogdHJ1ZSxcblx0XHRcdFx0eHRlcm1BZGRvbkltcG9ydGVyOiBuZXcgVGVzdFh0ZXJtQWRkb25JbXBvcnRlcigpLFxuXHRcdFx0fSwgdW5kZWZpbmVkKSk7XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3IsIHNvdXJjZSwge30gYXMgSVRlcm1pbmFsQ29tbWFuZCkpO1xuXHRcdFx0Ly8gbGF5b3V0IGNyZWF0ZXMgdGhlIGRldGFjaGVkIHRlcm1pbmFsIHdpdGhvdXQgbmVlZGluZyBhIHJlbmRlcmVkIGNvbW1hbmRcblx0XHRcdGF3YWl0IG1pcnJvci5sYXlvdXQoMTIyNCk7XG5cdFx0XHRyZXR1cm4gbWlycm9yO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3NuYXBzaG90IG1pcnJvciByZXBvcnRzIHRoZSBtaXJyb3IgY2VsbCBoZWlnaHQgb25jZSB0aGUgdGVybWluYWwgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWlycm9yID0gY3JlYXRlU25hcHNob3RNaXJyb3IoeyB0ZXh0OiAnaGVsbG8nIH0pO1xuXHRcdFx0YXdhaXQgbWlycm9yLnJlbmRlcigpO1xuXHRcdFx0Ly8gY2hhckhlaWdodCAxNCBcdTAwRDcgbGluZUhlaWdodCAxIGZyb20gdGhlIGZha2UgZm9udFxuXHRcdFx0c3RyaWN0RXF1YWwobWlycm9yLmdldFJvd0hlaWdodFB4KCksIDE0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NuYXBzaG90IG1pcnJvciByZXBvcnRzIHVuZGVmaW5lZCBiZWZvcmUgdGhlIGRldGFjaGVkIHRlcm1pbmFsIHJlc29sdmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWlycm9yID0gY3JlYXRlU25hcHNob3RNaXJyb3IoeyB0ZXh0OiAnaGVsbG8nIH0pO1xuXHRcdFx0c3RyaWN0RXF1YWwobWlycm9yLmdldFJvd0hlaWdodFB4KCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHRoZSBleGFjdCBmcmFjdGlvbmFsIGNlbGwgaGVpZ2h0IHdpdGhvdXQgcGVyLXJvdyByb3VuZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSBET00gcmVuZGVyZXIgcGFpbnRzIGVhY2ggcm93IGF0IHRoZSBleGFjdCBjc3MgY2VsbCBoZWlnaHQ7IGNlaWxpbmcgdGhlXG5cdFx0XHQvLyBwZXItcm93IHZhbHVlIHdvdWxkIGFjY3VtdWxhdGUgYWNyb3NzIHJvd3MgYW5kIHNsaWNlIHRoZSBsYXN0IHJvd1xuXHRcdFx0bmV4dEZvbnQgPSB7IGZvbnRGYW1pbHk6ICdtb25vc3BhY2UnLCBmb250U2l6ZTogMTIsIGxldHRlclNwYWNpbmc6IDAsIGxpbmVIZWlnaHQ6IDEuMSwgY2hhcldpZHRoOiAxMCwgY2hhckhlaWdodDogMTQuNCB9O1xuXHRcdFx0Y29uc3QgbWlycm9yID0gY3JlYXRlU25hcHNob3RNaXJyb3IoeyB0ZXh0OiAnaGVsbG8nIH0pO1xuXHRcdFx0YXdhaXQgbWlycm9yLnJlbmRlcigpO1xuXHRcdFx0c3RyaWN0RXF1YWwobWlycm9yLmdldFJvd0hlaWdodFB4KCksIDE0LjQgKiAxLjEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tbWFuZCBtaXJyb3IgcmVwb3J0cyB0aGUgbWlycm9yIGNlbGwgaGVpZ2h0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWlycm9yID0gYXdhaXQgY3JlYXRlTGFpZE91dENvbW1hbmRNaXJyb3IoKTtcblx0XHRcdHN0cmljdEVxdWFsKG1pcnJvci5nZXRSb3dIZWlnaHRQeCgpLCAxNCk7XG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVIb3N0KCk6IEhUTUxFbGVtZW50IHtcblx0XHRcdGNvbnN0IGhvc3QgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGhvc3QpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBob3N0LnJlbW92ZSgpKSk7XG5cdFx0XHRyZXR1cm4gaG9zdDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBuZXh0UmVuZGVyKHJhdzogVGVybWluYWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSByYXcub25SZW5kZXIoKCkgPT4ge1xuXHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gd3JpdGUocmF3OiBUZXJtaW5hbCwgZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiByYXcud3JpdGUoZGF0YSwgcmVzb2x2ZSkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3NuYXBzaG90IG1pcnJvciBvbkRpZENoYW5nZVJvd0hlaWdodCBmaXJlcyBvbmNlIHBlciBtZXRyaWNzIGNoYW5nZSwgb25seSBhZnRlciBhdHRhY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRuZXh0Rm9udCA9IHsgZm9udEZhbWlseTogJ21vbm9zcGFjZScsIGZvbnRTaXplOiAxMiwgbGV0dGVyU3BhY2luZzogMCwgbGluZUhlaWdodDogMSwgY2hhcldpZHRoOiAxMCwgY2hhckhlaWdodDogMTQgfTtcblx0XHRcdGNvbnN0IG1pcnJvciA9IGNyZWF0ZVNuYXBzaG90TWlycm9yKHsgdGV4dDogJ2hlbGxvJyB9KTtcblx0XHRcdGxldCBmaXJlcyA9IDA7XG5cdFx0XHRzdG9yZS5hZGQobWlycm9yLm9uRGlkQ2hhbmdlUm93SGVpZ2h0KCgpID0+IGZpcmVzKyspKTtcblx0XHRcdGF3YWl0IG1pcnJvci5yZW5kZXIoKTtcblx0XHRcdHN0cmljdEVxdWFsKGZpcmVzLCAwLCAncmVuZGVyaW5nIGNvbnRlbnQgYWxvbmUgbXVzdCBub3QgZmlyZSBiZWZvcmUgYXR0YWNoJyk7XG5cblx0XHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KCk7XG5cdFx0XHRhd2FpdCBtaXJyb3IuYXR0YWNoKGhvc3QpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZmlyZXMsIDAsICdhdHRhY2ggYWxvbmUgbXVzdCBub3QgZmlyZSB3aXRob3V0IGEgcmVuZGVyJyk7XG5cblx0XHRcdGNvbnN0IHJhdyA9IGZha2VzWzBdLnJhdztcblx0XHRcdGxldCByZW5kZXJlZCA9IG5leHRSZW5kZXIocmF3KTtcblx0XHRcdHJhdy5vcGVuKGhvc3QpO1xuXHRcdFx0YXdhaXQgcmVuZGVyZWQ7XG5cdFx0XHRzdHJpY3RFcXVhbChmaXJlcywgMSwgJ3RoZSBmaXJzdCByZWFsIHJlbmRlciBhbm5vdW5jZXMgdGhlIG1ldHJpY3MnKTtcblxuXHRcdFx0cmVuZGVyZWQgPSBuZXh0UmVuZGVyKHJhdyk7XG5cdFx0XHRhd2FpdCB3cml0ZShyYXcsICdtb3JlJyk7XG5cdFx0XHRhd2FpdCByZW5kZXJlZDtcblx0XHRcdHN0cmljdEVxdWFsKGZpcmVzLCAxLCAncmVuZGVycyB3aXRoIHVuY2hhbmdlZCBtZXRyaWNzIG11c3Qgbm90IHJlLWZpcmUnKTtcblxuXHRcdFx0bmV4dEZvbnQuY2hhckhlaWdodCA9IDIxO1xuXHRcdFx0cmVuZGVyZWQgPSBuZXh0UmVuZGVyKHJhdyk7XG5cdFx0XHRhd2FpdCB3cml0ZShyYXcsICchJyk7XG5cdFx0XHRhd2FpdCByZW5kZXJlZDtcblx0XHRcdHN0cmljdEVxdWFsKGZpcmVzLCAyLCAnYSBtZXRyaWNzIGNoYW5nZSBmaXJlcyBleGFjdGx5IG9uY2UgbW9yZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tbWFuZCBtaXJyb3Igb25EaWRDaGFuZ2VSb3dIZWlnaHQgZmlyZXMgb25jZSBwZXIgbWV0cmljcyBjaGFuZ2UsIG9ubHkgYWZ0ZXIgYXR0YWNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bmV4dEZvbnQgPSB7IGZvbnRGYW1pbHk6ICdtb25vc3BhY2UnLCBmb250U2l6ZTogMTIsIGxldHRlclNwYWNpbmc6IDAsIGxpbmVIZWlnaHQ6IDEsIGNoYXJXaWR0aDogMTAsIGNoYXJIZWlnaHQ6IDE0IH07XG5cdFx0XHRjb25zdCBtaXJyb3IgPSBhd2FpdCBjcmVhdGVMYWlkT3V0Q29tbWFuZE1pcnJvcigpO1xuXHRcdFx0bGV0IGZpcmVzID0gMDtcblx0XHRcdHN0b3JlLmFkZChtaXJyb3Iub25EaWRDaGFuZ2VSb3dIZWlnaHQoKCkgPT4gZmlyZXMrKykpO1xuXG5cdFx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCgpO1xuXHRcdFx0Y29uc3QgcmF3ID0gZmFrZXNbMF0ucmF3O1xuXHRcdFx0bGV0IHJlbmRlcmVkID0gbmV4dFJlbmRlcihyYXcpO1xuXHRcdFx0cmF3Lm9wZW4oaG9zdCk7XG5cdFx0XHRhd2FpdCByZW5kZXJlZDtcblx0XHRcdHN0cmljdEVxdWFsKGZpcmVzLCAwLCAncmVuZGVycyBiZWZvcmUgYXR0YWNoIG11c3Qgbm90IGZpcmUnKTtcblxuXHRcdFx0YXdhaXQgbWlycm9yLmF0dGFjaChob3N0KTtcblx0XHRcdHJlbmRlcmVkID0gbmV4dFJlbmRlcihyYXcpO1xuXHRcdFx0YXdhaXQgd3JpdGUocmF3LCAnb3V0cHV0Jyk7XG5cdFx0XHRhd2FpdCByZW5kZXJlZDtcblx0XHRcdHN0cmljdEVxdWFsKGZpcmVzLCAxLCAndGhlIGZpcnN0IHJlbmRlciBhZnRlciBhdHRhY2ggYW5ub3VuY2VzIHRoZSBtZXRyaWNzJyk7XG5cblx0XHRcdHJlbmRlcmVkID0gbmV4dFJlbmRlcihyYXcpO1xuXHRcdFx0YXdhaXQgd3JpdGUocmF3LCAnbW9yZScpO1xuXHRcdFx0YXdhaXQgcmVuZGVyZWQ7XG5cdFx0XHRzdHJpY3RFcXVhbChmaXJlcywgMSwgJ3JlbmRlcnMgd2l0aCB1bmNoYW5nZWQgbWV0cmljcyBtdXN0IG5vdCByZS1maXJlJyk7XG5cblx0XHRcdG5leHRGb250LmNoYXJIZWlnaHQgPSAyMTtcblx0XHRcdHJlbmRlcmVkID0gbmV4dFJlbmRlcihyYXcpO1xuXHRcdFx0YXdhaXQgd3JpdGUocmF3LCAnIScpO1xuXHRcdFx0YXdhaXQgcmVuZGVyZWQ7XG5cdFx0XHRzdHJpY3RFcXVhbChmaXJlcywgMiwgJ2EgbWV0cmljcyBjaGFuZ2UgZmlyZXMgZXhhY3RseSBvbmNlIG1vcmUnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUM3QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdDQUFnQztBQUd6QyxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLHdCQUFvRDtBQUM3RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLCtCQUErQiw2QkFBNkIsMEJBQTBCLCtCQUErQixnQ0FBZ0MseUJBQXlCO0FBRXZMLE1BQU0sd0JBQXdCO0FBQUEsRUFDN0IsWUFBWTtBQUFBLEVBQ1osWUFBWTtBQUFBLEVBQ1osZ0JBQWdCO0FBQUEsRUFDaEIsaUJBQWlCO0FBQUEsRUFDakIsWUFBWTtBQUFBLEVBQ1osdUJBQXVCO0FBQUEsRUFDdkIsNkJBQTZCO0FBQUEsRUFDN0IsZ0JBQWdCO0FBQ2pCO0FBRUEsTUFBTSx5Q0FBeUMsTUFBTTtBQUNwRCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFFBQU0sbUNBQW1DLE1BQU07QUFDOUMsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBRUosbUJBQWUsWUFBWSxPQUFPLElBQUksT0FBTyxJQUFJLGFBQWEsSUFBNEI7QUFDekYsWUFBTSxlQUFlLE1BQU0s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
