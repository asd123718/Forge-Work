import assert from "assert";
import { stub, useFakeTimers } from "sinon";
import { Emitter } from "../../../../../../base/common/event.js";
import { CharPredictState, PredictionStats, TypeAheadAddon } from "../../browser/terminalTypeAheadAddon.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { DEFAULT_LOCAL_ECHO_EXCLUDE } from "../../common/terminalTypeAheadConfiguration.js";
import { isString } from "../../../../../../base/common/types.js";
const CSI = `\x1B[`;
var CursorMoveDirection = /* @__PURE__ */ ((CursorMoveDirection2) => {
  CursorMoveDirection2["Back"] = "D";
  CursorMoveDirection2["Forwards"] = "C";
  return CursorMoveDirection2;
})(CursorMoveDirection || {});
suite("Workbench - Terminal Typeahead", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  suite("PredictionStats", () => {
    let stats;
    let add;
    let succeed;
    let fail;
    setup(() => {
      add = ds.add(new Emitter());
      succeed = ds.add(new Emitter());
      fail = ds.add(new Emitter());
      stats = ds.add(new PredictionStats({
        onPredictionAdded: add.event,
        onPredictionSucceeded: succeed.event,
        onPredictionFailed: fail.event
      }));
    });
    test("creates sane data", () => {
      const stubs = createPredictionStubs(5);
      const clock = useFakeTimers();
      try {
        for (const s of stubs) {
          add.fire(s);
        }
        for (let i = 0; i < stubs.length; i++) {
          clock.tick(100);
          (i % 2 ? fail : succeed).fire(stubs[i]);
        }
        assert.strictEqual(stats.accuracy, 3 / 5);
        assert.strictEqual(stats.sampleSize, 5);
        assert.deepStrictEqual(stats.latency, {
          count: 3,
          min: 100,
          max: 500,
          median: 300
        });
      } finally {
        clock.restore();
      }
    });
    test("circular buffer", () => {
      const bufferSize = 24;
      const stubs = createPredictionStubs(bufferSize * 2);
      for (const s of stubs.slice(0, bufferSize)) {
        add.fire(s);
        succeed.fire(s);
      }
      assert.strictEqual(stats.accuracy, 1);
      for (const s of stubs.slice(bufferSize, bufferSize * 3 / 2)) {
        add.fire(s);
        fail.fire(s);
      }
      assert.strictEqual(stats.accuracy, 0.5);
      for (const s of stubs.slice(bufferSize * 3 / 2)) {
        add.fire(s);
        fail.fire(s);
      }
      assert.strictEqual(stats.accuracy, 0);
    });
  });
  suite("timeline", () => {
    let onBeforeProcessData;
    let publicLog;
    let config;
    let addon;
    const predictedHelloo = [
      `${CSI}?25l`,
      // hide cursor
      `${CSI}2;7H`,
      // move cursor
      "o",
      // new character
      `${CSI}2;8H`,
      // place cursor back at end of line
      `${CSI}?25h`
      // show cursor
    ].join("");
    const expectProcessed = (input, output) => {
      const evt = { data: input };
      onBeforeProcessData.fire(evt);
      assert.strictEqual(JSON.stringify(evt.data), JSON.stringify(output));
    };
    setup(() => {
      onBeforeProcessData = ds.add(new Emitter());
      config = upcastPartial({
        localEchoStyle: "italic",
        localEchoLatencyThreshold: 0,
        localEchoExcludePrograms: DEFAULT_LOCAL_ECHO_EXCLUDE
      });
      publicLog = stub();
      addon = new TestTypeAheadAddon(
        upcastPartial({ onBeforeProcessData: onBeforeProcessData.event }),
        new TestConfigurationService({ terminal: { integrated: { ...config } } }),
        upcastPartial({ publicLog })
      );
      addon.unlockMakingPredictions();
    });
    teardown(() => {
      addon.dispose();
    });
    test("predicts a single character", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      t.expectWritten(`${CSI}3mo${CSI}23m`);
    });
    test("validates character prediction", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("o", predictedHelloo);
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("validates zsh prediction (#112842)", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("o", predictedHelloo);
      t.onData("x");
      expectProcessed("\box", [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;8H`,
        // move cursor
        "\box",
        // new data
        `${CSI}2;9H`,
        // place cursor back at end of line
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("does not validate zsh prediction on differing lookbehindn (#112842)", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("o", predictedHelloo);
      t.onData("x");
      expectProcessed("\bqx", [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;8H`,
        // move cursor cursor
        `${CSI}X`,
        // delete character
        `${CSI}0m`,
        // reset style
        "\bqx",
        // new data
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 0.5);
    });
    test("rolls back character prediction", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("q", [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;7H`,
        // move cursor cursor
        `${CSI}X`,
        // delete character
        `${CSI}0m`,
        // reset style
        "q",
        // new character
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 0);
    });
    test("handles left arrow when we hit the boundary", () => {
      const t = ds.add(createMockTerminal({ lines: ["|"] }));
      addon.activate(t.terminal);
      addon.unlockNavigating();
      const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
      t.onData(`${CSI}${"D" /* Back */}`);
      t.expectWritten("");
      onBeforeProcessData.fire({ data: "xy" });
      assert.strictEqual(
        addon.physicalCursor(t.terminal.buffer.active)?.x,
        // The cursor should not have changed because we've hit the
        // boundary (start of prompt)
        cursorXBefore
      );
    });
    test("handles right arrow when we hit the boundary", () => {
      const t = ds.add(createMockTerminal({ lines: ["|"] }));
      addon.activate(t.terminal);
      addon.unlockNavigating();
      const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
      t.onData(`${CSI}${"C" /* Forwards */}`);
      t.expectWritten("");
      onBeforeProcessData.fire({ data: "xy" });
      assert.strictEqual(
        addon.physicalCursor(t.terminal.buffer.active)?.x,
        // The cursor should not have changed because we've hit the
        // boundary (end of prompt)
        cursorXBefore
      );
    });
    test("internal cursor state is reset when all predictions are undone", () => {
      const t = ds.add(createMockTerminal({ lines: ["|"] }));
      addon.activate(t.terminal);
      addon.unlockNavigating();
      const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
      t.onData(`${CSI}${"D" /* Back */}`);
      t.expectWritten("");
      addon.undoAllPredictions();
      assert.strictEqual(
        addon.physicalCursor(t.terminal.buffer.active)?.x,
        // The cursor should not have changed because we've hit the
        // boundary (start of prompt)
        cursorXBefore
      );
    });
    test("restores cursor graphics mode", () => {
      const t = ds.add(createMockTerminal({
        lines: ["hello|"],
        cursorAttrs: { isAttributeDefault: false, isBold: true, isFgPalette: true, getFgColor: 1 }
      }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed("q", [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;7H`,
        // move cursor cursor
        `${CSI}X`,
        // delete character
        `${CSI}1;38;5;1m`,
        // reset style
        "q",
        // new character
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 0);
    });
    test("validates against and applies graphics mode on predicted", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed(`${CSI}4mo`, [
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;7H`,
        // move cursor
        `${CSI}4m`,
        // new PTY's style
        "o",
        // new character
        `${CSI}2;8H`,
        // place cursor back at end of line
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("ignores cursor hides or shows", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("o");
      expectProcessed(`${CSI}?25lo${CSI}?25h`, [
        `${CSI}?25l`,
        // hide cursor from PTY
        `${CSI}?25l`,
        // hide cursor
        `${CSI}2;7H`,
        // move cursor
        "o",
        // new character
        `${CSI}?25h`,
        // show cursor from PTY
        `${CSI}2;8H`,
        // place cursor back at end of line
        `${CSI}?25h`
        // show cursor
      ].join(""));
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("matches backspace at EOL (bash style)", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("\x7F");
      expectProcessed(`\b${CSI}K`, `\b${CSI}K`);
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("matches backspace at EOL (zsh style)", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("\x7F");
      expectProcessed("\b \b", "\b \b");
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("gradually matches backspace", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("\x7F");
      expectProcessed("\b", "");
      expectProcessed(" \b", "\b \b");
      assert.strictEqual(addon.stats?.accuracy, 1);
    });
    test("restores old character after invalid backspace", () => {
      const t = ds.add(createMockTerminal({ lines: ["hel|lo"] }));
      addon.activate(t.terminal);
      addon.unlockNavigating();
      t.onData("\x7F");
      t.expectWritten(`${CSI}2;4H${CSI}X`);
      expectProcessed("x", `${CSI}?25l${CSI}0ml${CSI}2;5H${CSI}0mx${CSI}?25h`);
      assert.strictEqual(addon.stats?.accuracy, 0);
    });
    test("waits for validation before deleting to left of cursor", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      t.onData("\x7F");
      t.expectWritten("");
      expectProcessed("\b \b", "\b \b");
      t.cursor.x--;
      t.onData("o");
      onBeforeProcessData.fire({ data: "o" });
      t.cursor.x++;
      t.clearWritten();
      t.onData("\x7F");
      t.expectWritten(`${CSI}2;6H${CSI}X`);
    });
    test("waits for first valid prediction on a line", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.lockMakingPredictions();
      addon.activate(t.terminal);
      t.onData("o");
      t.expectWritten("");
      expectProcessed("o", "o");
      t.onData("o");
      t.expectWritten(`${CSI}3mo${CSI}23m`);
    });
    test("disables on title change", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.activate(t.terminal);
      addon.reevaluateNow();
      assert.strictEqual(addon.isShowing, true, "expected to show initially");
      t.onTitleChange.fire("foo - VIM.exe");
      addon.reevaluateNow();
      assert.strictEqual(addon.isShowing, false, "expected to hide when vim is open");
      t.onTitleChange.fire("foo - git.exe");
      addon.reevaluateNow();
      assert.strictEqual(addon.isShowing, true, "expected to show again after vim closed");
    });
    test("adds line wrap prediction even if behind a boundary", () => {
      const t = ds.add(createMockTerminal({ lines: ["hello|"] }));
      addon.lockMakingPredictions();
      addon.activate(t.terminal);
      t.onData("hi".repeat(50));
      t.expectWritten("");
      expectProcessed("hi", [
        `${CSI}?25l`,
        // hide cursor
        "hi",
        // this greeting characters
        ...new Array(36).fill(`${CSI}3mh${CSI}23m${CSI}3mi${CSI}23m`),
        // rest of the greetings that fit on this line
        `${CSI}2;81H`,
        // move to end of line
        `${CSI}?25h`
      ].join(""));
    });
  });
});
class TestTypeAheadAddon extends TypeAheadAddon {
  unlockMakingPredictions() {
    this._lastRow = { y: 1, startingX: 100, endingX: 100, charState: CharPredictState.Validated };
  }
  lockMakingPredictions() {
    this._lastRow = void 0;
  }
  unlockNavigating() {
    this._lastRow = { y: 1, startingX: 1, endingX: 1, charState: CharPredictState.Validated };
  }
  reevaluateNow() {
    this._reevaluatePredictorStateNow(this.stats, this._timeline);
  }
  get isShowing() {
    return !!this._timeline?.isShowingPredictions;
  }
  undoAllPredictions() {
    this._timeline?.undoAllPredictions();
  }
  physicalCursor(buffer) {
    return this._timeline?.physicalCursor(buffer);
  }
  tentativeCursor(buffer) {
    return this._timeline?.tentativeCursor(buffer);
  }
}
function upcastPartial(v) {
  return v;
}
function createPredictionStubs(n) {
  return new Array(n).fill(0).map(stubPrediction);
}
function stubPrediction() {
  return {
    apply: () => "",
    rollback: () => "",
    matches: () => 0,
    rollForwards: () => ""
  };
}
function createMockTerminal({ lines, cursorAttrs }) {
  const ds = new DisposableStore();
  const written = [];
  const cursor = { y: 1, x: 1 };
  const onTitleChange = ds.add(new Emitter());
  const onData = ds.add(new Emitter());
  const csiEmitter = ds.add(new Emitter());
  for (let y = 0; y < lines.length; y++) {
    const line = lines[y];
    if (line.includes("|")) {
      cursor.y = y + 1;
      cursor.x = line.indexOf("|") + 1;
      lines[y] = line.replace("|", "");
      break;
    }
  }
  return {
    written,
    cursor,
    expectWritten: (s) => {
      assert.strictEqual(JSON.stringify(written.join("")), JSON.stringify(s));
      written.splice(0, written.length);
    },
    clearWritten: () => written.splice(0, written.length),
    onData: (s) => onData.fire(s),
    csiEmitter,
    onTitleChange,
    dispose: () => ds.dispose(),
    terminal: {
      cols: 80,
      rows: 5,
      onResize: new Emitter().event,
      onData: onData.event,
      onTitleChange: onTitleChange.event,
      parser: {
        registerCsiHandler(_, callback) {
          ds.add(csiEmitter.event(callback));
        }
      },
      write(line) {
        written.push(line);
      },
      _core: {
        _inputHandler: {
          _curAttrData: mockCell("", cursorAttrs)
        },
        writeSync() {
        }
      },
      buffer: {
        active: {
          type: "normal",
          baseY: 0,
          get cursorY() {
            return cursor.y;
          },
          get cursorX() {
            return cursor.x;
          },
          getLine(y) {
            const s = lines[y - 1] || "";
            return {
              length: s.length,
              getCell: (x) => mockCell(s[x - 1] || ""),
              translateToString: (trim, start = 0, end = s.length) => {
                const out = s.slice(start, end);
                return trim ? out.trimRight() : out;
              }
            };
          }
        }
      }
    }
  };
}
function mockCell(char, attrs = {}) {
  return new Proxy({}, {
    get(_, prop) {
      if (isString(prop) && attrs.hasOwnProperty(prop)) {
        return () => attrs[prop];
      }
      switch (prop) {
        case "getWidth":
          return () => 1;
        case "getChars":
          return () => char;
        case "getCode":
          return () => char.charCodeAt(0) || 0;
        case "isAttributeDefault":
          return () => true;
        default:
          return String(prop).startsWith("is") ? (() => false) : (() => 0);
      }
    }
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcdHlwZUFoZWFkXFx0ZXN0XFxicm93c2VyXFx0ZXJtaW5hbFR5cGVBaGVhZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBJQnVmZmVyLCBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBTaW5vblN0dWIsIHN0dWIsIHVzZUZha2VUaW1lcnMgfSBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ2hhclByZWRpY3RTdGF0ZSwgSVByZWRpY3Rpb24sIFByZWRpY3Rpb25TdGF0cywgVHlwZUFoZWFkQWRkb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsVHlwZUFoZWFkQWRkb24uanMnO1xuaW1wb3J0IHsgSUJlZm9yZVByb2Nlc3NEYXRhRXZlbnQsIElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MT0NBTF9FQ0hPX0VYQ0xVREUsIHR5cGUgSVRlcm1pbmFsVHlwZUFoZWFkQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbFR5cGVBaGVhZENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNvbnN0IENTSSA9IGBcXHgxYltgO1xuXG5jb25zdCBlbnVtIEN1cnNvck1vdmVEaXJlY3Rpb24ge1xuXHRCYWNrID0gJ0QnLFxuXHRGb3J3YXJkcyA9ICdDJyxcbn1cblxuc3VpdGUoJ1dvcmtiZW5jaCAtIFRlcm1pbmFsIFR5cGVhaGVhZCcsICgpID0+IHtcblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnUHJlZGljdGlvblN0YXRzJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0czogUHJlZGljdGlvblN0YXRzO1xuXHRcdGxldCBhZGQ6IEVtaXR0ZXI8SVByZWRpY3Rpb24+O1xuXHRcdGxldCBzdWNjZWVkOiBFbWl0dGVyPElQcmVkaWN0aW9uPjtcblx0XHRsZXQgZmFpbDogRW1pdHRlcjxJUHJlZGljdGlvbj47XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRhZGQgPSBkcy5hZGQobmV3IEVtaXR0ZXI8SVByZWRpY3Rpb24+KCkpO1xuXHRcdFx0c3VjY2VlZCA9IGRzLmFkZChuZXcgRW1pdHRlcjxJUHJlZGljdGlvbj4oKSk7XG5cdFx0XHRmYWlsID0gZHMuYWRkKG5ldyBFbWl0dGVyPElQcmVkaWN0aW9uPigpKTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRzdGF0cyA9IGRzLmFkZChuZXcgUHJlZGljdGlvblN0YXRzKHtcblx0XHRcdFx0b25QcmVkaWN0aW9uQWRkZWQ6IGFkZC5ldmVudCxcblx0XHRcdFx0b25QcmVkaWN0aW9uU3VjY2VlZGVkOiBzdWNjZWVkLmV2ZW50LFxuXHRcdFx0XHRvblByZWRpY3Rpb25GYWlsZWQ6IGZhaWwuZXZlbnQsXG5cdFx0XHR9IGFzIGFueSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlcyBzYW5lIGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdHVicyA9IGNyZWF0ZVByZWRpY3Rpb25TdHVicyg1KTtcblx0XHRcdGNvbnN0IGNsb2NrID0gdXNlRmFrZVRpbWVycygpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIHN0dWJzKSB7IGFkZC5maXJlKHMpOyB9XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdHVicy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNsb2NrLnRpY2soMTAwKTtcblx0XHRcdFx0XHQoaSAlIDIgPyBmYWlsIDogc3VjY2VlZCkuZmlyZShzdHVic1tpXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHMuYWNjdXJhY3ksIDMgLyA1KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRzLnNhbXBsZVNpemUsIDUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRzLmxhdGVuY3ksIHtcblx0XHRcdFx0XHRjb3VudDogMyxcblx0XHRcdFx0XHRtaW46IDEwMCxcblx0XHRcdFx0XHRtYXg6IDUwMCxcblx0XHRcdFx0XHRtZWRpYW46IDMwMFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGNsb2NrLnJlc3RvcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NpcmN1bGFyIGJ1ZmZlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1ZmZlclNpemUgPSAyNDtcblx0XHRcdGNvbnN0IHN0dWJzID0gY3JlYXRlUHJlZGljdGlvblN0dWJzKGJ1ZmZlclNpemUgKiAyKTtcblxuXHRcdFx0Zm9yIChjb25zdCBzIG9mIHN0dWJzLnNsaWNlKDAsIGJ1ZmZlclNpemUpKSB7IGFkZC5maXJlKHMpOyBzdWNjZWVkLmZpcmUocyk7IH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0cy5hY2N1cmFjeSwgMSk7XG5cblx0XHRcdGZvciAoY29uc3QgcyBvZiBzdHVicy5zbGljZShidWZmZXJTaXplLCBidWZmZXJTaXplICogMyAvIDIpKSB7IGFkZC5maXJlKHMpOyBmYWlsLmZpcmUocyk7IH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0cy5hY2N1cmFjeSwgMC41KTtcblxuXHRcdFx0Zm9yIChjb25zdCBzIG9mIHN0dWJzLnNsaWNlKGJ1ZmZlclNpemUgKiAzIC8gMikpIHsgYWRkLmZpcmUocyk7IGZhaWwuZmlyZShzKTsgfVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRzLmFjY3VyYWN5LCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RpbWVsaW5lJywgKCkgPT4ge1xuXHRcdGxldCBvbkJlZm9yZVByb2Nlc3NEYXRhOiBFbWl0dGVyPElCZWZvcmVQcm9jZXNzRGF0YUV2ZW50Pjtcblx0XHRsZXQgcHVibGljTG9nOiBTaW5vblN0dWI7XG5cdFx0bGV0IGNvbmZpZzogSVRlcm1pbmFsVHlwZUFoZWFkQ29uZmlndXJhdGlvbjtcblx0XHRsZXQgYWRkb246IFRlc3RUeXBlQWhlYWRBZGRvbjtcblxuXHRcdGNvbnN0IHByZWRpY3RlZEhlbGxvbyA9IFtcblx0XHRcdGAke0NTSX0/MjVsYCwgLy8gaGlkZSBjdXJzb3Jcblx0XHRcdGAke0NTSX0yOzdIYCwgLy8gbW92ZSBjdXJzb3Jcblx0XHRcdCdvJywgLy8gbmV3IGNoYXJhY3RlclxuXHRcdFx0YCR7Q1NJfTI7OEhgLCAvLyBwbGFjZSBjdXJzb3IgYmFjayBhdCBlbmQgb2YgbGluZVxuXHRcdFx0YCR7Q1NJfT8yNWhgLCAvLyBzaG93IGN1cnNvclxuXHRcdF0uam9pbignJyk7XG5cblx0XHRjb25zdCBleHBlY3RQcm9jZXNzZWQgPSAoaW5wdXQ6IHN0cmluZywgb3V0cHV0OiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IGV2dCA9IHsgZGF0YTogaW5wdXQgfTtcblx0XHRcdG9uQmVmb3JlUHJvY2Vzc0RhdGEuZmlyZShldnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEpTT04uc3RyaW5naWZ5KGV2dC5kYXRhKSwgSlNPTi5zdHJpbmdpZnkob3V0cHV0KSk7XG5cdFx0fTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG9uQmVmb3JlUHJvY2Vzc0RhdGEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8SUJlZm9yZVByb2Nlc3NEYXRhRXZlbnQ+KCkpO1xuXHRcdFx0Y29uZmlnID0gdXBjYXN0UGFydGlhbDxJVGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uPih7XG5cdFx0XHRcdGxvY2FsRWNob1N0eWxlOiAnaXRhbGljJyxcblx0XHRcdFx0bG9jYWxFY2hvTGF0ZW5jeVRocmVzaG9sZDogMCxcblx0XHRcdFx0bG9jYWxFY2hvRXhjbHVkZVByb2dyYW1zOiBERUZBVUxUX0xPQ0FMX0VDSE9fRVhDTFVERSxcblx0XHRcdH0pO1xuXHRcdFx0cHVibGljTG9nID0gc3R1YigpO1xuXHRcdFx0YWRkb24gPSBuZXcgVGVzdFR5cGVBaGVhZEFkZG9uKFxuXHRcdFx0XHR1cGNhc3RQYXJ0aWFsPElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyPih7IG9uQmVmb3JlUHJvY2Vzc0RhdGE6IG9uQmVmb3JlUHJvY2Vzc0RhdGEuZXZlbnQgfSksXG5cdFx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IC4uLmNvbmZpZyB9IH0gfSksXG5cdFx0XHRcdHVwY2FzdFBhcnRpYWw8SVRlbGVtZXRyeVNlcnZpY2U+KHsgcHVibGljTG9nIH0pXG5cdFx0XHQpO1xuXHRcdFx0YWRkb24udW5sb2NrTWFraW5nUHJlZGljdGlvbnMoKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGFkZG9uLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZWRpY3RzIGEgc2luZ2xlIGNoYXJhY3RlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsbG98J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnbycpO1xuXHRcdFx0dC5leHBlY3RXcml0dGVuKGAke0NTSX0zbW8ke0NTSX0yM21gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhbGlkYXRlcyBjaGFyYWN0ZXIgcHJlZGljdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsbG98J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnbycpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdvJywgcHJlZGljdGVkSGVsbG9vKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIHpzaCBwcmVkaWN0aW9uICgjMTEyODQyKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsbG98J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnbycpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdvJywgcHJlZGljdGVkSGVsbG9vKTtcblxuXHRcdFx0dC5vbkRhdGEoJ3gnKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZCgnXFxib3gnLCBbXG5cdFx0XHRcdGAke0NTSX0/MjVsYCwgLy8gaGlkZSBjdXJzb3Jcblx0XHRcdFx0YCR7Q1NJfTI7OEhgLCAvLyBtb3ZlIGN1cnNvclxuXHRcdFx0XHQnXFxib3gnLCAvLyBuZXcgZGF0YVxuXHRcdFx0XHRgJHtDU0l9Mjs5SGAsIC8vIHBsYWNlIGN1cnNvciBiYWNrIGF0IGVuZCBvZiBsaW5lXG5cdFx0XHRcdGAke0NTSX0/MjVoYCwgLy8gc2hvdyBjdXJzb3Jcblx0XHRcdF0uam9pbignJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLnN0YXRzPy5hY2N1cmFjeSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCB2YWxpZGF0ZSB6c2ggcHJlZGljdGlvbiBvbiBkaWZmZXJpbmcgbG9va2JlaGluZG4gKCMxMTI4NDIpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdvJyk7XG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoJ28nLCBwcmVkaWN0ZWRIZWxsb28pO1xuXG5cdFx0XHR0Lm9uRGF0YSgneCcpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdcXGJxeCcsIFtcblx0XHRcdFx0YCR7Q1NJfT8yNWxgLCAvLyBoaWRlIGN1cnNvclxuXHRcdFx0XHRgJHtDU0l9Mjs4SGAsIC8vIG1vdmUgY3Vyc29yIGN1cnNvclxuXHRcdFx0XHRgJHtDU0l9WGAsIC8vIGRlbGV0ZSBjaGFyYWN0ZXJcblx0XHRcdFx0YCR7Q1NJfTBtYCwgLy8gcmVzZXQgc3R5bGVcblx0XHRcdFx0J1xcYnF4JywgLy8gbmV3IGRhdGFcblx0XHRcdFx0YCR7Q1NJfT8yNWhgLCAvLyBzaG93IGN1cnNvclxuXHRcdFx0XS5qb2luKCcnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uc3RhdHM/LmFjY3VyYWN5LCAwLjUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncm9sbHMgYmFjayBjaGFyYWN0ZXIgcHJlZGljdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsbG98J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnbycpO1xuXG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoJ3EnLCBbXG5cdFx0XHRcdGAke0NTSX0/MjVsYCwgLy8gaGlkZSBjdXJzb3Jcblx0XHRcdFx0YCR7Q1NJfTI7N0hgLCAvLyBtb3ZlIGN1cnNvciBjdXJzb3Jcblx0XHRcdFx0YCR7Q1NJfVhgLCAvLyBkZWxldGUgY2hhcmFjdGVyXG5cdFx0XHRcdGAke0NTSX0wbWAsIC8vIHJlc2V0IHN0eWxlXG5cdFx0XHRcdCdxJywgLy8gbmV3IGNoYXJhY3RlclxuXHRcdFx0XHRgJHtDU0l9PzI1aGAsIC8vIHNob3cgY3Vyc29yXG5cdFx0XHRdLmpvaW4oJycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBsZWZ0IGFycm93IHdoZW4gd2UgaGl0IHRoZSBib3VuZGFyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnfCddIH0pKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXHRcdFx0YWRkb24udW5sb2NrTmF2aWdhdGluZygpO1xuXG5cdFx0XHRjb25zdCBjdXJzb3JYQmVmb3JlID0gYWRkb24ucGh5c2ljYWxDdXJzb3IodC50ZXJtaW5hbC5idWZmZXIuYWN0aXZlKT8ueCE7XG5cdFx0XHR0Lm9uRGF0YShgJHtDU0l9JHtDdXJzb3JNb3ZlRGlyZWN0aW9uLkJhY2t9YCk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oJycpO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIHJvbGxiYWNrIGJlY2F1c2Ugd2UgZG9uJ3QgZXhwZWN0IHRoaXMgZGF0YVxuXHRcdFx0b25CZWZvcmVQcm9jZXNzRGF0YS5maXJlKHsgZGF0YTogJ3h5JyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhZGRvbi5waHlzaWNhbEN1cnNvcih0LnRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUpPy54LFxuXHRcdFx0XHQvLyBUaGUgY3Vyc29yIHNob3VsZCBub3QgaGF2ZSBjaGFuZ2VkIGJlY2F1c2Ugd2UndmUgaGl0IHRoZVxuXHRcdFx0XHQvLyBib3VuZGFyeSAoc3RhcnQgb2YgcHJvbXB0KVxuXHRcdFx0XHRjdXJzb3JYQmVmb3JlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgcmlnaHQgYXJyb3cgd2hlbiB3ZSBoaXQgdGhlIGJvdW5kYXJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWyd8J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHRhZGRvbi51bmxvY2tOYXZpZ2F0aW5nKCk7XG5cblx0XHRcdGNvbnN0IGN1cnNvclhCZWZvcmUgPSBhZGRvbi5waHlzaWNhbEN1cnNvcih0LnRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUpPy54ITtcblx0XHRcdHQub25EYXRhKGAke0NTSX0ke0N1cnNvck1vdmVEaXJlY3Rpb24uRm9yd2FyZHN9YCk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oJycpO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIHJvbGxiYWNrIGJlY2F1c2Ugd2UgZG9uJ3QgZXhwZWN0IHRoaXMgZGF0YVxuXHRcdFx0b25CZWZvcmVQcm9jZXNzRGF0YS5maXJlKHsgZGF0YTogJ3h5JyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhZGRvbi5waHlzaWNhbEN1cnNvcih0LnRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUpPy54LFxuXHRcdFx0XHQvLyBUaGUgY3Vyc29yIHNob3VsZCBub3QgaGF2ZSBjaGFuZ2VkIGJlY2F1c2Ugd2UndmUgaGl0IHRoZVxuXHRcdFx0XHQvLyBib3VuZGFyeSAoZW5kIG9mIHByb21wdClcblx0XHRcdFx0Y3Vyc29yWEJlZm9yZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnRlcm5hbCBjdXJzb3Igc3RhdGUgaXMgcmVzZXQgd2hlbiBhbGwgcHJlZGljdGlvbnMgYXJlIHVuZG9uZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnfCddIH0pKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXHRcdFx0YWRkb24udW5sb2NrTmF2aWdhdGluZygpO1xuXG5cdFx0XHRjb25zdCBjdXJzb3JYQmVmb3JlID0gYWRkb24ucGh5c2ljYWxDdXJzb3IodC50ZXJtaW5hbC5idWZmZXIuYWN0aXZlKT8ueCE7XG5cdFx0XHR0Lm9uRGF0YShgJHtDU0l9JHtDdXJzb3JNb3ZlRGlyZWN0aW9uLkJhY2t9YCk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oJycpO1xuXHRcdFx0YWRkb24udW5kb0FsbFByZWRpY3Rpb25zKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YWRkb24ucGh5c2ljYWxDdXJzb3IodC50ZXJtaW5hbC5idWZmZXIuYWN0aXZlKT8ueCxcblx0XHRcdFx0Ly8gVGhlIGN1cnNvciBzaG91bGQgbm90IGhhdmUgY2hhbmdlZCBiZWNhdXNlIHdlJ3ZlIGhpdCB0aGVcblx0XHRcdFx0Ly8gYm91bmRhcnkgKHN0YXJ0IG9mIHByb21wdClcblx0XHRcdFx0Y3Vyc29yWEJlZm9yZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyBjdXJzb3IgZ3JhcGhpY3MgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHtcblx0XHRcdFx0bGluZXM6IFsnaGVsbG98J10sXG5cdFx0XHRcdGN1cnNvckF0dHJzOiB7IGlzQXR0cmlidXRlRGVmYXVsdDogZmFsc2UsIGlzQm9sZDogdHJ1ZSwgaXNGZ1BhbGV0dGU6IHRydWUsIGdldEZnQ29sb3I6IDEgfSxcblx0XHRcdH0pKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXHRcdFx0dC5vbkRhdGEoJ28nKTtcblxuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdxJywgW1xuXHRcdFx0XHRgJHtDU0l9PzI1bGAsIC8vIGhpZGUgY3Vyc29yXG5cdFx0XHRcdGAke0NTSX0yOzdIYCwgLy8gbW92ZSBjdXJzb3IgY3Vyc29yXG5cdFx0XHRcdGAke0NTSX1YYCwgLy8gZGVsZXRlIGNoYXJhY3RlclxuXHRcdFx0XHRgJHtDU0l9MTszODs1OzFtYCwgLy8gcmVzZXQgc3R5bGVcblx0XHRcdFx0J3EnLCAvLyBuZXcgY2hhcmFjdGVyXG5cdFx0XHRcdGAke0NTSX0/MjVoYCwgLy8gc2hvdyBjdXJzb3Jcblx0XHRcdF0uam9pbignJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLnN0YXRzPy5hY2N1cmFjeSwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZXMgYWdhaW5zdCBhbmQgYXBwbGllcyBncmFwaGljcyBtb2RlIG9uIHByZWRpY3RlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsbG98J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnbycpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKGAke0NTSX00bW9gLCBbXG5cdFx0XHRcdGAke0NTSX0/MjVsYCwgLy8gaGlkZSBjdXJzb3Jcblx0XHRcdFx0YCR7Q1NJfTI7N0hgLCAvLyBtb3ZlIGN1cnNvclxuXHRcdFx0XHRgJHtDU0l9NG1gLCAvLyBuZXcgUFRZJ3Mgc3R5bGVcblx0XHRcdFx0J28nLCAvLyBuZXcgY2hhcmFjdGVyXG5cdFx0XHRcdGAke0NTSX0yOzhIYCwgLy8gcGxhY2UgY3Vyc29yIGJhY2sgYXQgZW5kIG9mIGxpbmVcblx0XHRcdFx0YCR7Q1NJfT8yNWhgLCAvLyBzaG93IGN1cnNvclxuXHRcdFx0XS5qb2luKCcnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uc3RhdHM/LmFjY3VyYWN5LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZXMgY3Vyc29yIGhpZGVzIG9yIHNob3dzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblx0XHRcdHQub25EYXRhKCdvJyk7XG5cdFx0XHRleHBlY3RQcm9jZXNzZWQoYCR7Q1NJfT8yNWxvJHtDU0l9PzI1aGAsIFtcblx0XHRcdFx0YCR7Q1NJfT8yNWxgLCAvLyBoaWRlIGN1cnNvciBmcm9tIFBUWVxuXHRcdFx0XHRgJHtDU0l9PzI1bGAsIC8vIGhpZGUgY3Vyc29yXG5cdFx0XHRcdGAke0NTSX0yOzdIYCwgLy8gbW92ZSBjdXJzb3Jcblx0XHRcdFx0J28nLCAvLyBuZXcgY2hhcmFjdGVyXG5cdFx0XHRcdGAke0NTSX0/MjVoYCwgLy8gc2hvdyBjdXJzb3IgZnJvbSBQVFlcblx0XHRcdFx0YCR7Q1NJfTI7OEhgLCAvLyBwbGFjZSBjdXJzb3IgYmFjayBhdCBlbmQgb2YgbGluZVxuXHRcdFx0XHRgJHtDU0l9PzI1aGAsIC8vIHNob3cgY3Vyc29yXG5cdFx0XHRdLmpvaW4oJycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBiYWNrc3BhY2UgYXQgRU9MIChiYXNoIHN0eWxlKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsbG98J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnXFx4N0YnKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZChgXFxiJHtDU0l9S2AsIGBcXGIke0NTSX1LYCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uc3RhdHM/LmFjY3VyYWN5LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgYmFja3NwYWNlIGF0IEVPTCAoenNoIHN0eWxlKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsbG98J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnXFx4N0YnKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZCgnXFxiIFxcYicsICdcXGIgXFxiJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uc3RhdHM/LmFjY3VyYWN5LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyYWR1YWxseSBtYXRjaGVzIGJhY2tzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsbG98J10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHR0Lm9uRGF0YSgnXFx4N0YnKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZCgnXFxiJywgJycpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCcgXFxiJywgJ1xcYiBcXGInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgb2xkIGNoYXJhY3RlciBhZnRlciBpbnZhbGlkIGJhY2tzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHQgPSBkcy5hZGQoY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXM6IFsnaGVsfGxvJ10gfSkpO1xuXHRcdFx0YWRkb24uYWN0aXZhdGUodC50ZXJtaW5hbCk7XG5cdFx0XHRhZGRvbi51bmxvY2tOYXZpZ2F0aW5nKCk7XG5cdFx0XHR0Lm9uRGF0YSgnXFx4N0YnKTtcblx0XHRcdHQuZXhwZWN0V3JpdHRlbihgJHtDU0l9Mjs0SCR7Q1NJfVhgKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZCgneCcsIGAke0NTSX0/MjVsJHtDU0l9MG1sJHtDU0l9Mjs1SCR7Q1NJfTBteCR7Q1NJfT8yNWhgKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRvbi5zdGF0cz8uYWNjdXJhY3ksIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2FpdHMgZm9yIHZhbGlkYXRpb24gYmVmb3JlIGRlbGV0aW5nIHRvIGxlZnQgb2YgY3Vyc29yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblxuXHRcdFx0Ly8gaW5pdGlhbGx5IHNob3VsZCBub3QgYmFja3NwYWNlICh1bnRpbCB0aGUgc2VydmVyIGNvbmZpcm1zIGl0KVxuXHRcdFx0dC5vbkRhdGEoJ1xceDdGJyk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oJycpO1xuXHRcdFx0ZXhwZWN0UHJvY2Vzc2VkKCdcXGIgXFxiJywgJ1xcYiBcXGInKTtcblx0XHRcdHQuY3Vyc29yLngtLTtcblxuXHRcdFx0Ly8gZW50ZXIgaW5wdXQgb24gdGhlIGNvbHVtbi4uLlxuXHRcdFx0dC5vbkRhdGEoJ28nKTtcblx0XHRcdG9uQmVmb3JlUHJvY2Vzc0RhdGEuZmlyZSh7IGRhdGE6ICdvJyB9KTtcblx0XHRcdHQuY3Vyc29yLngrKztcblx0XHRcdHQuY2xlYXJXcml0dGVuKCk7XG5cblx0XHRcdC8vIG5vdyB0aGF0IHRoZSBjb2x1bW4gaXMgJ3VubG9ja2VkJywgd2Ugc2hvdWxkIGJlIGFibGUgdG8gcHJlZGljdCBiYWNrc3BhY2Ugb24gaXRcblx0XHRcdHQub25EYXRhKCdcXHg3RicpO1xuXHRcdFx0dC5leHBlY3RXcml0dGVuKGAke0NTSX0yOzZIJHtDU0l9WGApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2FpdHMgZm9yIGZpcnN0IHZhbGlkIHByZWRpY3Rpb24gb24gYSBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5sb2NrTWFraW5nUHJlZGljdGlvbnMoKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXG5cdFx0XHR0Lm9uRGF0YSgnbycpO1xuXHRcdFx0dC5leHBlY3RXcml0dGVuKCcnKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZCgnbycsICdvJyk7XG5cblx0XHRcdHQub25EYXRhKCdvJyk7XG5cdFx0XHR0LmV4cGVjdFdyaXR0ZW4oYCR7Q1NJfTNtbyR7Q1NJfTIzbWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzYWJsZXMgb24gdGl0bGUgY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5hY3RpdmF0ZSh0LnRlcm1pbmFsKTtcblxuXHRcdFx0YWRkb24ucmVldmFsdWF0ZU5vdygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLmlzU2hvd2luZywgdHJ1ZSwgJ2V4cGVjdGVkIHRvIHNob3cgaW5pdGlhbGx5Jyk7XG5cblx0XHRcdHQub25UaXRsZUNoYW5nZS5maXJlKCdmb28gLSBWSU0uZXhlJyk7XG5cdFx0XHRhZGRvbi5yZWV2YWx1YXRlTm93KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkb24uaXNTaG93aW5nLCBmYWxzZSwgJ2V4cGVjdGVkIHRvIGhpZGUgd2hlbiB2aW0gaXMgb3BlbicpO1xuXG5cdFx0XHR0Lm9uVGl0bGVDaGFuZ2UuZmlyZSgnZm9vIC0gZ2l0LmV4ZScpO1xuXHRcdFx0YWRkb24ucmVldmFsdWF0ZU5vdygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkZG9uLmlzU2hvd2luZywgdHJ1ZSwgJ2V4cGVjdGVkIHRvIHNob3cgYWdhaW4gYWZ0ZXIgdmltIGNsb3NlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyBsaW5lIHdyYXAgcHJlZGljdGlvbiBldmVuIGlmIGJlaGluZCBhIGJvdW5kYXJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdCA9IGRzLmFkZChjcmVhdGVNb2NrVGVybWluYWwoeyBsaW5lczogWydoZWxsb3wnXSB9KSk7XG5cdFx0XHRhZGRvbi5sb2NrTWFraW5nUHJlZGljdGlvbnMoKTtcblx0XHRcdGFkZG9uLmFjdGl2YXRlKHQudGVybWluYWwpO1xuXG5cdFx0XHR0Lm9uRGF0YSgnaGknLnJlcGVhdCg1MCkpO1xuXHRcdFx0dC5leHBlY3RXcml0dGVuKCcnKTtcblx0XHRcdGV4cGVjdFByb2Nlc3NlZCgnaGknLCBbXG5cdFx0XHRcdGAke0NTSX0/MjVsYCwgLy8gaGlkZSBjdXJzb3Jcblx0XHRcdFx0J2hpJywgLy8gdGhpcyBncmVldGluZyBjaGFyYWN0ZXJzXG5cdFx0XHRcdC4uLm5ldyBBcnJheSgzNikuZmlsbChgJHtDU0l9M21oJHtDU0l9MjNtJHtDU0l9M21pJHtDU0l9MjNtYCksIC8vIHJlc3Qgb2YgdGhlIGdyZWV0aW5ncyB0aGF0IGZpdCBvbiB0aGlzIGxpbmVcblx0XHRcdFx0YCR7Q1NJfTI7ODFIYCwgLy8gbW92ZSB0byBlbmQgb2YgbGluZVxuXHRcdFx0XHRgJHtDU0l9PzI1aGBcblx0XHRcdF0uam9pbignJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBUZXN0VHlwZUFoZWFkQWRkb24gZXh0ZW5kcyBUeXBlQWhlYWRBZGRvbiB7XG5cdHVubG9ja01ha2luZ1ByZWRpY3Rpb25zKCkge1xuXHRcdHRoaXMuX2xhc3RSb3cgPSB7IHk6IDEsIHN0YXJ0aW5nWDogMTAwLCBlbmRpbmdYOiAxMDAsIGNoYXJTdGF0ZTogQ2hhclByZWRpY3RTdGF0ZS5WYWxpZGF0ZWQgfTtcblx0fVxuXG5cdGxvY2tNYWtpbmdQcmVkaWN0aW9ucygpIHtcblx0XHR0aGlzLl9sYXN0Um93ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0dW5sb2NrTmF2aWdhdGluZygpIHtcblx0XHR0aGlzLl9sYXN0Um93ID0geyB5OiAxLCBzdGFydGluZ1g6IDEsIGVuZGluZ1g6IDEsIGNoYXJTdGF0ZTogQ2hhclByZWRpY3RTdGF0ZS5WYWxpZGF0ZWQgfTtcblx0fVxuXG5cdHJlZXZhbHVhdGVOb3coKSB7XG5cdFx0dGhpcy5fcmVldmFsdWF0ZVByZWRpY3RvclN0YXRlTm93KHRoaXMuc3RhdHMhLCB0aGlzLl90aW1lbGluZSEpO1xuXHR9XG5cblx0Z2V0IGlzU2hvd2luZygpIHtcblx0XHRyZXR1cm4gISF0aGlzLl90aW1lbGluZT8uaXNTaG93aW5nUHJlZGljdGlvbnM7XG5cdH1cblxuXHR1bmRvQWxsUHJlZGljdGlvbnMoKSB7XG5cdFx0dGhpcy5fdGltZWxpbmU/LnVuZG9BbGxQcmVkaWN0aW9ucygpO1xuXHR9XG5cblx0cGh5c2ljYWxDdXJzb3IoYnVmZmVyOiBJQnVmZmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVsaW5lPy5waHlzaWNhbEN1cnNvcihidWZmZXIpO1xuXHR9XG5cblx0dGVudGF0aXZlQ3Vyc29yKGJ1ZmZlcjogSUJ1ZmZlcikge1xuXHRcdHJldHVybiB0aGlzLl90aW1lbGluZT8udGVudGF0aXZlQ3Vyc29yKGJ1ZmZlcik7XG5cdH1cbn1cblxuZnVuY3Rpb24gdXBjYXN0UGFydGlhbDxUPih2OiBQYXJ0aWFsPFQ+KTogVCB7XG5cdHJldHVybiB2IGFzIFQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVByZWRpY3Rpb25TdHVicyhuOiBudW1iZXIpIHtcblx0cmV0dXJuIG5ldyBBcnJheShuKS5maWxsKDApLm1hcChzdHViUHJlZGljdGlvbik7XG59XG5cbmZ1bmN0aW9uIHN0dWJQcmVkaWN0aW9uKCk6IElQcmVkaWN0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRhcHBseTogKCkgPT4gJycsXG5cdFx0cm9sbGJhY2s6ICgpID0+ICcnLFxuXHRcdG1hdGNoZXM6ICgpID0+IDAsXG5cdFx0cm9sbEZvcndhcmRzOiAoKSA9PiAnJyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja1Rlcm1pbmFsKHsgbGluZXMsIGN1cnNvckF0dHJzIH06IHtcblx0bGluZXM6IHN0cmluZ1tdO1xuXHRjdXJzb3JBdHRycz86IGFueTtcbn0pIHtcblx0Y29uc3QgZHMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHdyaXR0ZW46IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGN1cnNvciA9IHsgeTogMSwgeDogMSB9O1xuXHRjb25zdCBvblRpdGxlQ2hhbmdlID0gZHMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdGNvbnN0IG9uRGF0YSA9IGRzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRjb25zdCBjc2lFbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcltdPigpKTtcblxuXHRmb3IgKGxldCB5ID0gMDsgeSA8IGxpbmVzLmxlbmd0aDsgeSsrKSB7XG5cdFx0Y29uc3QgbGluZSA9IGxpbmVzW3ldO1xuXHRcdGlmIChsaW5lLmluY2x1ZGVzKCd8JykpIHtcblx0XHRcdGN1cnNvci55ID0geSArIDE7XG5cdFx0XHRjdXJzb3IueCA9IGxpbmUuaW5kZXhPZignfCcpICsgMTtcblx0XHRcdGxpbmVzW3ldID0gbGluZS5yZXBsYWNlKCd8JywgJycpOyAvLyBDb2RlUUwgW1NNMDIzODNdIHJlcGxhY2luZyB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBpcyBpbnRlbmRlZFxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHtcblx0XHR3cml0dGVuLFxuXHRcdGN1cnNvcixcblx0XHRleHBlY3RXcml0dGVuOiAoczogc3RyaW5nKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSlNPTi5zdHJpbmdpZnkod3JpdHRlbi5qb2luKCcnKSksIEpTT04uc3RyaW5naWZ5KHMpKTtcblx0XHRcdHdyaXR0ZW4uc3BsaWNlKDAsIHdyaXR0ZW4ubGVuZ3RoKTtcblx0XHR9LFxuXHRcdGNsZWFyV3JpdHRlbjogKCkgPT4gd3JpdHRlbi5zcGxpY2UoMCwgd3JpdHRlbi5sZW5ndGgpLFxuXHRcdG9uRGF0YTogKHM6IHN0cmluZykgPT4gb25EYXRhLmZpcmUocyksXG5cdFx0Y3NpRW1pdHRlcixcblx0XHRvblRpdGxlQ2hhbmdlLFxuXHRcdGRpc3Bvc2U6ICgpID0+IGRzLmRpc3Bvc2UoKSxcblx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0Y29sczogODAsXG5cdFx0XHRyb3dzOiA1LFxuXHRcdFx0b25SZXNpemU6IG5ldyBFbWl0dGVyPHZvaWQ+KCkuZXZlbnQsXG5cdFx0XHRvbkRhdGE6IG9uRGF0YS5ldmVudCxcblx0XHRcdG9uVGl0bGVDaGFuZ2U6IG9uVGl0bGVDaGFuZ2UuZXZlbnQsXG5cdFx0XHRwYXJzZXI6IHtcblx0XHRcdFx0cmVnaXN0ZXJDc2lIYW5kbGVyKF86IHVua25vd24sIGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XG5cdFx0XHRcdFx0ZHMuYWRkKGNzaUVtaXR0ZXIuZXZlbnQoY2FsbGJhY2spKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR3cml0ZShsaW5lOiBzdHJpbmcpIHtcblx0XHRcdFx0d3JpdHRlbi5wdXNoKGxpbmUpO1xuXHRcdFx0fSxcblx0XHRcdF9jb3JlOiB7XG5cdFx0XHRcdF9pbnB1dEhhbmRsZXI6IHtcblx0XHRcdFx0XHRfY3VyQXR0ckRhdGE6IG1vY2tDZWxsKCcnLCBjdXJzb3JBdHRycylcblx0XHRcdFx0fSxcblx0XHRcdFx0d3JpdGVTeW5jKCkge1xuXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRidWZmZXI6IHtcblx0XHRcdFx0YWN0aXZlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ25vcm1hbCcsXG5cdFx0XHRcdFx0YmFzZVk6IDAsXG5cdFx0XHRcdFx0Z2V0IGN1cnNvclkoKSB7IHJldHVybiBjdXJzb3IueTsgfSxcblx0XHRcdFx0XHRnZXQgY3Vyc29yWCgpIHsgcmV0dXJuIGN1cnNvci54OyB9LFxuXHRcdFx0XHRcdGdldExpbmUoeTogbnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzID0gbGluZXNbeSAtIDFdIHx8ICcnO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0bGVuZ3RoOiBzLmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0Z2V0Q2VsbDogKHg6IG51bWJlcikgPT4gbW9ja0NlbGwoc1t4IC0gMV0gfHwgJycpLFxuXHRcdFx0XHRcdFx0XHR0cmFuc2xhdGVUb1N0cmluZzogKHRyaW06IGJvb2xlYW4sIHN0YXJ0ID0gMCwgZW5kID0gcy5sZW5ndGgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBvdXQgPSBzLnNsaWNlKHN0YXJ0LCBlbmQpO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cmltID8gb3V0LnRyaW1SaWdodCgpIDogb3V0O1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIFRlcm1pbmFsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1vY2tDZWxsKGNoYXI6IHN0cmluZywgYXR0cnM6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9ID0ge30pIHtcblx0cmV0dXJuIG5ldyBQcm94eSh7fSwge1xuXHRcdGdldChfLCBwcm9wKSB7XG5cdFx0XHRpZiAoaXNTdHJpbmcocHJvcCkgJiYgYXR0cnMuaGFzT3duUHJvcGVydHkocHJvcCkpIHtcblx0XHRcdFx0cmV0dXJuICgpID0+IGF0dHJzW3Byb3BdO1xuXHRcdFx0fVxuXG5cdFx0XHRzd2l0Y2ggKHByb3ApIHtcblx0XHRcdFx0Y2FzZSAnZ2V0V2lkdGgnOlxuXHRcdFx0XHRcdHJldHVybiAoKSA9PiAxO1xuXHRcdFx0XHRjYXNlICdnZXRDaGFycyc6XG5cdFx0XHRcdFx0cmV0dXJuICgpID0+IGNoYXI7XG5cdFx0XHRcdGNhc2UgJ2dldENvZGUnOlxuXHRcdFx0XHRcdHJldHVybiAoKSA9PiBjaGFyLmNoYXJDb2RlQXQoMCkgfHwgMDtcblx0XHRcdFx0Y2FzZSAnaXNBdHRyaWJ1dGVEZWZhdWx0Jzpcblx0XHRcdFx0XHRyZXR1cm4gKCkgPT4gdHJ1ZTtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gU3RyaW5nKHByb3ApLnN0YXJ0c1dpdGgoJ2lzJykgPyAoKCkgPT4gZmFsc2UpIDogKCgpID0+IDApO1xuXHRcdFx0fVxuXHRcdH0sXG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZ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
