import assert from "assert";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { createSimpleKeybinding, KeyCodeChord } from "../../../../base/common/keybindings.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { OS } from "../../../../base/common/platform.js";
import Severity from "../../../../base/common/severity.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ContextKeyExpr } from "../../../contextkey/common/contextkey.js";
import { AbstractKeybindingService } from "../../common/abstractKeybindingService.js";
import { KeybindingResolver, ResultKind } from "../../common/keybindingResolver.js";
import { ResolvedKeybindingItem } from "../../common/resolvedKeybindingItem.js";
import { USLayoutResolvedKeybinding } from "../../common/usLayoutResolvedKeybinding.js";
import { createUSLayoutResolvedKeybinding } from "./keybindingsTestUtils.js";
import { NullLogService } from "../../../log/common/log.js";
import { NoOpNotification } from "../../../notification/common/notification.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
function createContext(ctx) {
  return {
    getValue: (key) => {
      return ctx[key];
    }
  };
}
suite("AbstractKeybindingService", () => {
  class TestKeybindingService extends AbstractKeybindingService {
    constructor(resolver, contextKeyService, commandService, notificationService) {
      super(contextKeyService, commandService, NullTelemetryService, notificationService, new NullLogService());
      this._resolver = resolver;
    }
    _getResolver() {
      return this._resolver;
    }
    _documentHasFocus() {
      return true;
    }
    resolveKeybinding(kb) {
      return USLayoutResolvedKeybinding.resolveKeybinding(kb, OS);
    }
    resolveKeyboardEvent(keyboardEvent) {
      const chord = new KeyCodeChord(
        keyboardEvent.ctrlKey,
        keyboardEvent.shiftKey,
        keyboardEvent.altKey,
        keyboardEvent.metaKey,
        keyboardEvent.keyCode
      ).toKeybinding();
      return this.resolveKeybinding(chord)[0];
    }
    resolveUserBinding(userBinding) {
      return [];
    }
    testDispatch(kb, isComposing = false) {
      return this._dispatch(this._toKeyboardEvent(kb, isComposing), null);
    }
    testSoftDispatch(kb, isComposing = false) {
      return this.softDispatch(this._toKeyboardEvent(kb, isComposing), null);
    }
    _toKeyboardEvent(kb, isComposing) {
      const keybinding = createSimpleKeybinding(kb, OS);
      return {
        _standardKeyboardEventBrand: true,
        ctrlKey: keybinding.ctrlKey,
        shiftKey: keybinding.shiftKey,
        altKey: keybinding.altKey,
        metaKey: keybinding.metaKey,
        altGraphKey: false,
        // `StandardKeyboardEvent` normalizes composing keystrokes to KEY_IN_COMPOSITION.
        keyCode: isComposing ? KeyCode.KEY_IN_COMPOSITION : keybinding.keyCode,
        code: null
      };
    }
    _dumpDebugInfo() {
      return "";
    }
    _dumpDebugInfoJSON() {
      return "";
    }
    registerSchemaContribution() {
      return Disposable.None;
    }
    enableKeybindingHoldMode() {
      return void 0;
    }
  }
  let createTestKeybindingService = null;
  let currentContextValue = null;
  let executeCommandCalls = null;
  let showMessageCalls = null;
  let statusMessageCalls = null;
  let statusMessageCallsDisposed = null;
  teardown(() => {
    currentContextValue = null;
    executeCommandCalls = null;
    showMessageCalls = null;
    createTestKeybindingService = null;
    statusMessageCalls = null;
    statusMessageCallsDisposed = null;
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    createTestKeybindingService = (items) => {
      const contextKeyService = {
        _serviceBrand: void 0,
        onDidChangeContext: void 0,
        bufferChangeEvents() {
        },
        createKey: void 0,
        contextMatchesRules: (rules) => {
          if (!rules) {
            return true;
          }
          if (!currentContextValue) {
            return false;
          }
          return rules.evaluate(currentContextValue);
        },
        getContextKeyValue: void 0,
        createScoped: void 0,
        createOverlay: void 0,
        getContext: (target) => {
          return currentContextValue;
        },
        updateParent: () => {
        }
      };
      const commandService = {
        _serviceBrand: void 0,
        onWillExecuteCommand: () => Disposable.None,
        onDidExecuteCommand: () => Disposable.None,
        executeCommand: (commandId, ...args) => {
          executeCommandCalls.push({
            commandId,
            args
          });
          return Promise.resolve(void 0);
        }
      };
      const notificationService = {
        _serviceBrand: void 0,
        onDidChangeFilter: void 0,
        notify: (notification) => {
          showMessageCalls.push({ sev: notification.severity, message: notification.message });
          return new NoOpNotification();
        },
        info: (message) => {
          showMessageCalls.push({ sev: Severity.Info, message });
          return new NoOpNotification();
        },
        warn: (message) => {
          showMessageCalls.push({ sev: Severity.Warning, message });
          return new NoOpNotification();
        },
        error: (message) => {
          showMessageCalls.push({ sev: Severity.Error, message });
          return new NoOpNotification();
        },
        prompt(severity, message, choices, options) {
          throw new Error("not implemented");
        },
        status(message, options) {
          statusMessageCalls.push(message);
          return {
            close: () => {
              statusMessageCallsDisposed.push(message);
            }
          };
        },
        setFilter() {
          throw new Error("not implemented");
        },
        getFilter() {
          throw new Error("not implemented");
        },
        getFilters() {
          throw new Error("not implemented");
        },
        removeFilter() {
          throw new Error("not implemented");
        }
      };
      const resolver = new KeybindingResolver(items, [], () => {
      });
      return new TestKeybindingService(resolver, contextKeyService, commandService, notificationService);
    };
  });
  function kbItem(keybinding, command, when) {
    return new ResolvedKeybindingItem(
      createUSLayoutResolvedKeybinding(keybinding, OS),
      command,
      null,
      when,
      true,
      null,
      false
    );
  }
  function toUsLabel(keybinding) {
    return createUSLayoutResolvedKeybinding(keybinding, OS).getLabel();
  }
  suite("simple tests: single- and multi-chord keybindings are dispatched", () => {
    test("a single-chord keybinding is dispatched correctly; this test makes sure the dispatch in general works before we test empty-string/null command ID", () => {
      const key = KeyMod.CtrlCmd | KeyCode.KeyK;
      const kbService = createTestKeybindingService([
        kbItem(key, "myCommand")
      ]);
      currentContextValue = createContext({});
      const shouldPreventDefault = kbService.testDispatch(key);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, [{ commandId: "myCommand", args: [null] }]);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, []);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      kbService.dispose();
    });
    test("a multi-chord keybinding is dispatched correctly", () => {
      const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
      const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
      const key = [chord0, chord1];
      const kbService = createTestKeybindingService([
        kbItem(key, "myCommand")
      ]);
      currentContextValue = createContext({});
      let shouldPreventDefault = kbService.testDispatch(chord0);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      shouldPreventDefault = kbService.testDispatch(chord1);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, [{ commandId: "myCommand", args: [null] }]);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      kbService.dispose();
    });
  });
  suite("keybindings with empty-string/null command ID", () => {
    test("a single-chord keybinding with an empty string command ID unbinds the keybinding (shouldPreventDefault = false)", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand"),
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "")
      ]);
      currentContextValue = createContext({});
      const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.deepStrictEqual(shouldPreventDefault, false);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, []);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      kbService.dispose();
    });
    test("a single-chord keybinding with a null command ID unbinds the keybinding (shouldPreventDefault = false)", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand"),
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, null)
      ]);
      currentContextValue = createContext({});
      const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.deepStrictEqual(shouldPreventDefault, false);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, []);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      kbService.dispose();
    });
    test("a multi-chord keybinding with an empty-string command ID keeps the keybinding (shouldPreventDefault = true)", () => {
      const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
      const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
      const key = [chord0, chord1];
      const kbService = createTestKeybindingService([
        kbItem(key, "myCommand"),
        kbItem(key, "")
      ]);
      currentContextValue = createContext({});
      let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyI);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`, `The key combination (${toUsLabel(chord0)}, ${toUsLabel(chord1)}) is not a command.`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      kbService.dispose();
    });
    test("a multi-chord keybinding with a null command ID keeps the keybinding (shouldPreventDefault = true)", () => {
      const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
      const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
      const key = [chord0, chord1];
      const kbService = createTestKeybindingService([
        kbItem(key, "myCommand"),
        kbItem(key, null)
      ]);
      currentContextValue = createContext({});
      let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyI);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`, `The key combination (${toUsLabel(chord0)}, ${toUsLabel(chord1)}) is not a command.`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      kbService.dispose();
    });
  });
  test("issue #16498: chord mode is quit for invalid chords", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), "chordCommand"),
      kbItem(KeyCode.Backspace, "simpleCommand")
    ]);
    let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, []);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, [
      `(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
    ]);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    shouldPreventDefault = kbService.testDispatch(KeyCode.Backspace);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, []);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, [
      `The key combination (${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}, ${toUsLabel(KeyCode.Backspace)}) is not a command.`
    ]);
    assert.deepStrictEqual(statusMessageCallsDisposed, [
      `(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
    ]);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    shouldPreventDefault = kbService.testDispatch(KeyCode.Backspace);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    kbService.dispose();
  });
  test("issue #16833: Keybinding service should not testDispatch on modifier keys", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyCode.Ctrl, "nope"),
      kbItem(KeyCode.Meta, "nope"),
      kbItem(KeyCode.Alt, "nope"),
      kbItem(KeyCode.Shift, "nope"),
      kbItem(KeyMod.CtrlCmd, "nope"),
      kbItem(KeyMod.WinCtrl, "nope"),
      kbItem(KeyMod.Alt, "nope"),
      kbItem(KeyMod.Shift, "nope")
    ]);
    function assertIsIgnored(keybinding) {
      const shouldPreventDefault = kbService.testDispatch(keybinding);
      assert.strictEqual(shouldPreventDefault, false);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, []);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      executeCommandCalls = [];
      showMessageCalls = [];
      statusMessageCalls = [];
      statusMessageCallsDisposed = [];
    }
    assertIsIgnored(KeyCode.Ctrl);
    assertIsIgnored(KeyCode.Meta);
    assertIsIgnored(KeyCode.Alt);
    assertIsIgnored(KeyCode.Shift);
    assertIsIgnored(KeyMod.CtrlCmd);
    assertIsIgnored(KeyMod.WinCtrl);
    assertIsIgnored(KeyMod.Alt);
    assertIsIgnored(KeyMod.Shift);
    kbService.dispose();
  });
  test("keybindings are not dispatched while an IME composition is in progress", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyCode.Enter, "enterCommand")
    ]);
    const shouldPreventDefaultWhileComposing = kbService.testDispatch(KeyCode.Enter, true);
    assert.deepStrictEqual(
      [shouldPreventDefaultWhileComposing, executeCommandCalls],
      [false, []]
    );
    assert.strictEqual(
      kbService.testSoftDispatch(KeyCode.Enter, true).kind,
      ResultKind.NoMatchingKb
    );
    const shouldPreventDefault = kbService.testDispatch(KeyCode.Enter, false);
    assert.deepStrictEqual(
      [shouldPreventDefault, executeCommandCalls],
      [true, [{ commandId: "enterCommand", args: [null] }]]
    );
    assert.strictEqual(
      kbService.testSoftDispatch(KeyCode.Enter, false).kind,
      ResultKind.KbFound
    );
    kbService.dispose();
  });
  test("can trigger command that is sharing keybinding with chord", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), "chordCommand"),
      kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "simpleCommand", ContextKeyExpr.has("key1"))
    ]);
    currentContextValue = createContext({
      key1: true
    });
    let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    currentContextValue = createContext({});
    shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, []);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, [
      `(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
    ]);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    currentContextValue = createContext({});
    shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyX);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "chordCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, [
      `(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
    ]);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    kbService.dispose();
  });
  test("cannot trigger chord if command is overwriting", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), "chordCommand", ContextKeyExpr.has("key1")),
      kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "simpleCommand")
    ]);
    currentContextValue = createContext({});
    let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    currentContextValue = createContext({
      key1: true
    });
    shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    currentContextValue = createContext({
      key1: true
    });
    shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyX);
    assert.strictEqual(shouldPreventDefault, false);
    assert.deepStrictEqual(executeCommandCalls, []);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    kbService.dispose();
  });
  test("can have spying command", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "^simpleCommand")
    ]);
    currentContextValue = createContext({});
    const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, false);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    kbService.dispose();
  });
  suite("appendKeybinding", () => {
    test("appends keybinding label when command has a keybinding", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("My Label", "myCommand");
      const expectedLabel = toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.strictEqual(result, `My Label (${expectedLabel})`);
      kbService.dispose();
    });
    test("returns only label when command has no keybinding", () => {
      const kbService = createTestKeybindingService([]);
      const result = kbService.appendKeybinding("My Label", "myCommand");
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("returns only label when commandId is null", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("My Label", null);
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("returns only label when commandId is undefined", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("My Label", void 0);
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("returns only label when commandId is empty string", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("My Label", "");
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("appends keybinding for command with context when context matches", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand", ContextKeyExpr.has("key1"))
      ]);
      currentContextValue = createContext({ key1: true });
      const result = kbService.appendKeybinding("My Label", "myCommand");
      const expectedLabel = toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.strictEqual(result, `My Label (${expectedLabel})`);
      kbService.dispose();
    });
    test("returns only label when context does not match and enforceContextCheck is true", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand", ContextKeyExpr.has("key1"))
      ]);
      currentContextValue = createContext({});
      const result = kbService.appendKeybinding("My Label", "myCommand", void 0, true);
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("appends keybinding when context does not match but enforceContextCheck is false", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand", ContextKeyExpr.has("key1"))
      ]);
      currentContextValue = createContext({});
      const result = kbService.appendKeybinding("My Label", "myCommand", void 0, false);
      const expectedLabel = toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.strictEqual(result, `My Label (${expectedLabel})`);
      kbService.dispose();
    });
    test("appends keybinding even when label is empty string", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("", "myCommand");
      const expectedLabel = toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.strictEqual(result, ` (${expectedLabel})`);
      kbService.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxca2V5YmluZGluZ1xcdGVzdFxcY29tbW9uXFxhYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbXBsZUtleWJpbmRpbmcsIFJlc29sdmVkS2V5YmluZGluZywgS2V5Q29kZUNob3JkLCBLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dCwgSUNvbnRleHRLZXlTZXJ2aWNlLCBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEFic3RyYWN0S2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWJzdHJhY3RLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdSZXNvbHZlciwgUmVzb2x1dGlvblJlc3VsdCwgUmVzdWx0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZXNvbHZlZEtleWJpbmRpbmdJdGVtLmpzJztcbmltcG9ydCB7IFVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IGNyZWF0ZVVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi9rZXliaW5kaW5nc1Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb24sIElOb3RpZmljYXRpb25TZXJ2aWNlLCBJUHJvbXB0Q2hvaWNlLCBJUHJvbXB0T3B0aW9ucywgSVN0YXR1c01lc3NhZ2VPcHRpb25zLCBOb09wTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dChjdHg6IGFueSkge1xuXHRyZXR1cm4ge1xuXHRcdGdldFZhbHVlOiAoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiBjdHhba2V5XTtcblx0XHR9XG5cdH07XG59XG5cbnN1aXRlKCdBYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNsYXNzIFRlc3RLZXliaW5kaW5nU2VydmljZSBleHRlbmRzIEFic3RyYWN0S2V5YmluZGluZ1NlcnZpY2Uge1xuXHRcdHByaXZhdGUgX3Jlc29sdmVyOiBLZXliaW5kaW5nUmVzb2x2ZXI7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdHJlc29sdmVyOiBLZXliaW5kaW5nUmVzb2x2ZXIsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Y29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlXG5cdFx0KSB7XG5cdFx0XHRzdXBlcihjb250ZXh0S2V5U2VydmljZSwgY29tbWFuZFNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlciA9IHJlc29sdmVyO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBfZ2V0UmVzb2x2ZXIoKTogS2V5YmluZGluZ1Jlc29sdmVyIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlcjtcblx0XHR9XG5cblx0XHRwcm90ZWN0ZWQgX2RvY3VtZW50SGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcmVzb2x2ZUtleWJpbmRpbmcoa2I6IEtleWJpbmRpbmcpOiBSZXNvbHZlZEtleWJpbmRpbmdbXSB7XG5cdFx0XHRyZXR1cm4gVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcucmVzb2x2ZUtleWJpbmRpbmcoa2IsIE9TKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcmVzb2x2ZUtleWJvYXJkRXZlbnQoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpOiBSZXNvbHZlZEtleWJpbmRpbmcge1xuXHRcdFx0Y29uc3QgY2hvcmQgPSBuZXcgS2V5Q29kZUNob3JkKFxuXHRcdFx0XHRrZXlib2FyZEV2ZW50LmN0cmxLZXksXG5cdFx0XHRcdGtleWJvYXJkRXZlbnQuc2hpZnRLZXksXG5cdFx0XHRcdGtleWJvYXJkRXZlbnQuYWx0S2V5LFxuXHRcdFx0XHRrZXlib2FyZEV2ZW50Lm1ldGFLZXksXG5cdFx0XHRcdGtleWJvYXJkRXZlbnQua2V5Q29kZVxuXHRcdFx0KS50b0tleWJpbmRpbmcoKTtcblx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVLZXliaW5kaW5nKGNob3JkKVswXTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcmVzb2x2ZVVzZXJCaW5kaW5nKHVzZXJCaW5kaW5nOiBzdHJpbmcpOiBSZXNvbHZlZEtleWJpbmRpbmdbXSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cHVibGljIHRlc3REaXNwYXRjaChrYjogbnVtYmVyLCBpc0NvbXBvc2luZzogYm9vbGVhbiA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGlzcGF0Y2godGhpcy5fdG9LZXlib2FyZEV2ZW50KGtiLCBpc0NvbXBvc2luZyksIG51bGwhKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdGVzdFNvZnREaXNwYXRjaChrYjogbnVtYmVyLCBpc0NvbXBvc2luZzogYm9vbGVhbiA9IGZhbHNlKTogUmVzb2x1dGlvblJlc3VsdCB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zb2Z0RGlzcGF0Y2godGhpcy5fdG9LZXlib2FyZEV2ZW50KGtiLCBpc0NvbXBvc2luZyksIG51bGwhKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF90b0tleWJvYXJkRXZlbnQoa2I6IG51bWJlciwgaXNDb21wb3Npbmc6IGJvb2xlYW4pOiBJS2V5Ym9hcmRFdmVudCB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nID0gY3JlYXRlU2ltcGxlS2V5YmluZGluZyhrYiwgT1MpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0X3N0YW5kYXJkS2V5Ym9hcmRFdmVudEJyYW5kOiB0cnVlLFxuXHRcdFx0XHRjdHJsS2V5OiBrZXliaW5kaW5nLmN0cmxLZXksXG5cdFx0XHRcdHNoaWZ0S2V5OiBrZXliaW5kaW5nLnNoaWZ0S2V5LFxuXHRcdFx0XHRhbHRLZXk6IGtleWJpbmRpbmcuYWx0S2V5LFxuXHRcdFx0XHRtZXRhS2V5OiBrZXliaW5kaW5nLm1ldGFLZXksXG5cdFx0XHRcdGFsdEdyYXBoS2V5OiBmYWxzZSxcblx0XHRcdFx0Ly8gYFN0YW5kYXJkS2V5Ym9hcmRFdmVudGAgbm9ybWFsaXplcyBjb21wb3Npbmcga2V5c3Ryb2tlcyB0byBLRVlfSU5fQ09NUE9TSVRJT04uXG5cdFx0XHRcdGtleUNvZGU6IGlzQ29tcG9zaW5nID8gS2V5Q29kZS5LRVlfSU5fQ09NUE9TSVRJT04gOiBrZXliaW5kaW5nLmtleUNvZGUsXG5cdFx0XHRcdGNvZGU6IG51bGwhXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHB1YmxpYyBfZHVtcERlYnVnSW5mbygpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBfZHVtcERlYnVnSW5mb0pTT04oKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRwdWJsaWMgcmVnaXN0ZXJTY2hlbWFDb250cmlidXRpb24oKTogSURpc3Bvc2FibGUge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHRwdWJsaWMgZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRsZXQgY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlOiAoaXRlbXM6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSwgY29udGV4dFZhbHVlPzogYW55KSA9PiBUZXN0S2V5YmluZGluZ1NlcnZpY2UgPSBudWxsITtcblx0bGV0IGN1cnJlbnRDb250ZXh0VmFsdWU6IElDb250ZXh0IHwgbnVsbCA9IG51bGw7XG5cdGxldCBleGVjdXRlQ29tbWFuZENhbGxzOiB7IGNvbW1hbmRJZDogc3RyaW5nOyBhcmdzOiB1bmtub3duW10gfVtdID0gbnVsbCE7XG5cdGxldCBzaG93TWVzc2FnZUNhbGxzOiB7IHNldjogU2V2ZXJpdHk7IG1lc3NhZ2U6IGFueSB9W10gPSBudWxsITtcblx0bGV0IHN0YXR1c01lc3NhZ2VDYWxsczogc3RyaW5nW10gfCBudWxsID0gbnVsbDtcblx0bGV0IHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkOiBzdHJpbmdbXSB8IG51bGwgPSBudWxsO1xuXG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBudWxsO1xuXHRcdGV4ZWN1dGVDb21tYW5kQ2FsbHMgPSBudWxsITtcblx0XHRzaG93TWVzc2FnZUNhbGxzID0gbnVsbCE7XG5cdFx0Y3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlID0gbnVsbCE7XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzID0gbnVsbDtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCA9IG51bGw7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHRjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UgPSAoaXRlbXM6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSk6IFRlc3RLZXliaW5kaW5nU2VydmljZSA9PiB7XG5cblx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0b25EaWRDaGFuZ2VDb250ZXh0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRidWZmZXJDaGFuZ2VFdmVudHMoKSB7IH0sXG5cdFx0XHRcdGNyZWF0ZUtleTogdW5kZWZpbmVkISxcblx0XHRcdFx0Y29udGV4dE1hdGNoZXNSdWxlczogKHJ1bGVzOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGwgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0XHRpZiAoIXJ1bGVzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFjdXJyZW50Q29udGV4dFZhbHVlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBydWxlcy5ldmFsdWF0ZShjdXJyZW50Q29udGV4dFZhbHVlKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0Q29udGV4dEtleVZhbHVlOiB1bmRlZmluZWQhLFxuXHRcdFx0XHRjcmVhdGVTY29wZWQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdGNyZWF0ZU92ZXJsYXk6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdGdldENvbnRleHQ6ICh0YXJnZXQ6IElDb250ZXh0S2V5U2VydmljZVRhcmdldCk6IGFueSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnJlbnRDb250ZXh0VmFsdWU7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVwZGF0ZVBhcmVudDogKCkgPT4geyB9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uV2lsbEV4ZWN1dGVDb21tYW5kOiAoKSA9PiBEaXNwb3NhYmxlLk5vbmUsXG5cdFx0XHRcdG9uRGlkRXhlY3V0ZUNvbW1hbmQ6ICgpID0+IERpc3Bvc2FibGUuTm9uZSxcblx0XHRcdFx0ZXhlY3V0ZUNvbW1hbmQ6IChjb21tYW5kSWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxhbnk+ID0+IHtcblx0XHRcdFx0XHRleGVjdXRlQ29tbWFuZENhbGxzLnB1c2goe1xuXHRcdFx0XHRcdFx0Y29tbWFuZElkOiBjb21tYW5kSWQsXG5cdFx0XHRcdFx0XHRhcmdzOiBhcmdzXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvbkRpZENoYW5nZUZpbHRlcjogdW5kZWZpbmVkISxcblx0XHRcdFx0bm90aWZ5OiAobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uKSA9PiB7XG5cdFx0XHRcdFx0c2hvd01lc3NhZ2VDYWxscy5wdXNoKHsgc2V2OiBub3RpZmljYXRpb24uc2V2ZXJpdHksIG1lc3NhZ2U6IG5vdGlmaWNhdGlvbi5tZXNzYWdlIH0pO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTm9PcE5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbmZvOiAobWVzc2FnZTogYW55KSA9PiB7XG5cdFx0XHRcdFx0c2hvd01lc3NhZ2VDYWxscy5wdXNoKHsgc2V2OiBTZXZlcml0eS5JbmZvLCBtZXNzYWdlIH0pO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTm9PcE5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3YXJuOiAobWVzc2FnZTogYW55KSA9PiB7XG5cdFx0XHRcdFx0c2hvd01lc3NhZ2VDYWxscy5wdXNoKHsgc2V2OiBTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlIH0pO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTm9PcE5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRlcnJvcjogKG1lc3NhZ2U6IGFueSkgPT4ge1xuXHRcdFx0XHRcdHNob3dNZXNzYWdlQ2FsbHMucHVzaCh7IHNldjogU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2UgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBOb09wTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByb21wdChzZXZlcml0eTogU2V2ZXJpdHksIG1lc3NhZ2U6IHN0cmluZywgY2hvaWNlczogSVByb21wdENob2ljZVtdLCBvcHRpb25zPzogSVByb21wdE9wdGlvbnMpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdGF0dXMobWVzc2FnZTogc3RyaW5nLCBvcHRpb25zPzogSVN0YXR1c01lc3NhZ2VPcHRpb25zKSB7XG5cdFx0XHRcdFx0c3RhdHVzTWVzc2FnZUNhbGxzIS5wdXNoKG1lc3NhZ2UpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRjbG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCEucHVzaChtZXNzYWdlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXRGaWx0ZXIoKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0RmlsdGVyKCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldEZpbHRlcnMoKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVtb3ZlRmlsdGVyKCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc29sdmVyID0gbmV3IEtleWJpbmRpbmdSZXNvbHZlcihpdGVtcywgW10sICgpID0+IHsgfSk7XG5cblx0XHRcdHJldHVybiBuZXcgVGVzdEtleWJpbmRpbmdTZXJ2aWNlKHJlc29sdmVyLCBjb250ZXh0S2V5U2VydmljZSwgY29tbWFuZFNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdH07XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGtiSXRlbShrZXliaW5kaW5nOiBudW1iZXIgfCBudW1iZXJbXSwgY29tbWFuZDogc3RyaW5nIHwgbnVsbCwgd2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uKTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSB7XG5cdFx0cmV0dXJuIG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKFxuXHRcdFx0Y3JlYXRlVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcoa2V5YmluZGluZywgT1MpLFxuXHRcdFx0Y29tbWFuZCxcblx0XHRcdG51bGwsXG5cdFx0XHR3aGVuLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG51bGwsXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b1VzTGFiZWwoa2V5YmluZGluZzogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gY3JlYXRlVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcoa2V5YmluZGluZywgT1MpIS5nZXRMYWJlbCgpITtcblx0fVxuXG5cdHN1aXRlKCdzaW1wbGUgdGVzdHM6IHNpbmdsZS0gYW5kIG11bHRpLWNob3JkIGtleWJpbmRpbmdzIGFyZSBkaXNwYXRjaGVkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYSBzaW5nbGUtY2hvcmQga2V5YmluZGluZyBpcyBkaXNwYXRjaGVkIGNvcnJlY3RseTsgdGhpcyB0ZXN0IG1ha2VzIHN1cmUgdGhlIGRpc3BhdGNoIGluIGdlbmVyYWwgd29ya3MgYmVmb3JlIHdlIHRlc3QgZW1wdHktc3RyaW5nL251bGwgY29tbWFuZCBJRCcsICgpID0+IHtcblxuXHRcdFx0Y29uc3Qga2V5ID0gS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUs7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oa2V5LCAnbXlDb21tYW5kJyksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXHRcdFx0Y29uc3Qgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKGtleSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgKFt7IGNvbW1hbmRJZDogJ215Q29tbWFuZCcsIGFyZ3M6IFtudWxsXSB9XSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBtdWx0aS1jaG9yZCBrZXliaW5kaW5nIGlzIGRpc3BhdGNoZWQgY29ycmVjdGx5JywgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBjaG9yZDAgPSBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Sztcblx0XHRcdGNvbnN0IGNob3JkMSA9IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJO1xuXHRcdFx0Y29uc3Qga2V5ID0gW2Nob3JkMCwgY2hvcmQxXTtcblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRcdGtiSXRlbShrZXksICdteUNvbW1hbmQnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7fSk7XG5cblx0XHRcdGxldCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goY2hvcmQwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCAoW2AoJHt0b1VzTGFiZWwoY2hvcmQwKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYF0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblxuXHRcdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKGNob3JkMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgKFt7IGNvbW1hbmRJZDogJ215Q29tbWFuZCcsIGFyZ3M6IFtudWxsXSB9XSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgKFtgKCR7dG9Vc0xhYmVsKGNob3JkMCl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmBdKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCAoW2AoJHt0b1VzTGFiZWwoY2hvcmQwKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYF0pKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2tleWJpbmRpbmdzIHdpdGggZW1wdHktc3RyaW5nL251bGwgY29tbWFuZCBJRCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2Egc2luZ2xlLWNob3JkIGtleWJpbmRpbmcgd2l0aCBhbiBlbXB0eSBzdHJpbmcgY29tbWFuZCBJRCB1bmJpbmRzIHRoZSBrZXliaW5kaW5nIChzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGZhbHNlKScsICgpID0+IHtcblxuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCAnbXlDb21tYW5kJyksXG5cdFx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJycpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHNlbmQgQ3RybC9DbWQgKyBLXG5cdFx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7fSk7XG5cdFx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCBbXSk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHNpbmdsZS1jaG9yZCBrZXliaW5kaW5nIHdpdGggYSBudWxsIGNvbW1hbmQgSUQgdW5iaW5kcyB0aGUga2V5YmluZGluZyAoc2hvdWxkUHJldmVudERlZmF1bHQgPSBmYWxzZSknLCAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJ215Q29tbWFuZCcpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIG51bGwpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHNlbmQgQ3RybC9DbWQgKyBLXG5cdFx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7fSk7XG5cdFx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCBbXSk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIG11bHRpLWNob3JkIGtleWJpbmRpbmcgd2l0aCBhbiBlbXB0eS1zdHJpbmcgY29tbWFuZCBJRCBrZWVwcyB0aGUga2V5YmluZGluZyAoc2hvdWxkUHJldmVudERlZmF1bHQgPSB0cnVlKScsICgpID0+IHtcblxuXHRcdFx0Y29uc3QgY2hvcmQwID0gS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUs7XG5cdFx0XHRjb25zdCBjaG9yZDEgPSBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5STtcblx0XHRcdGNvbnN0IGtleSA9IFtjaG9yZDAsIGNob3JkMV07XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oa2V5LCAnbXlDb21tYW5kJyksXG5cdFx0XHRcdGtiSXRlbShrZXksICcnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7fSk7XG5cblx0XHRcdGxldCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIChbYCgke3RvVXNMYWJlbChjaG9yZDApfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5gXSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXG5cdFx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIChbYCgke3RvVXNMYWJlbChjaG9yZDApfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5gLCBgVGhlIGtleSBjb21iaW5hdGlvbiAoJHt0b1VzTGFiZWwoY2hvcmQwKX0sICR7dG9Vc0xhYmVsKGNob3JkMSl9KSBpcyBub3QgYSBjb21tYW5kLmBdKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCAoW2AoJHt0b1VzTGFiZWwoY2hvcmQwKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYF0pKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgbXVsdGktY2hvcmQga2V5YmluZGluZyB3aXRoIGEgbnVsbCBjb21tYW5kIElEIGtlZXBzIHRoZSBrZXliaW5kaW5nIChzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRydWUpJywgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBjaG9yZDAgPSBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Sztcblx0XHRcdGNvbnN0IGNob3JkMSA9IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJO1xuXHRcdFx0Y29uc3Qga2V5ID0gW2Nob3JkMCwgY2hvcmQxXTtcblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRcdGtiSXRlbShrZXksICdteUNvbW1hbmQnKSxcblx0XHRcdFx0a2JJdGVtKGtleSwgbnVsbCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXG5cdFx0XHRsZXQgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCAoW2AoJHt0b1VzTGFiZWwoY2hvcmQwKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYF0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblxuXHRcdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCAoW2AoJHt0b1VzTGFiZWwoY2hvcmQwKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYCwgYFRoZSBrZXkgY29tYmluYXRpb24gKCR7dG9Vc0xhYmVsKGNob3JkMCl9LCAke3RvVXNMYWJlbChjaG9yZDEpfSkgaXMgbm90IGEgY29tbWFuZC5gXSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgKFtgKCR7dG9Vc0xhYmVsKGNob3JkMCl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmBdKSk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2NDk4OiBjaG9yZCBtb2RlIGlzIHF1aXQgZm9yIGludmFsaWQgY2hvcmRzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdGtiSXRlbShLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVgpLCAnY2hvcmRDb21tYW5kJyksXG5cdFx0XHRrYkl0ZW0oS2V5Q29kZS5CYWNrc3BhY2UsICdzaW1wbGVDb21tYW5kJyksXG5cdFx0XSk7XG5cblx0XHQvLyBzZW5kIEN0cmwvQ21kICsgS1xuXHRcdGxldCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIFtcblx0XHRcdGAoJHt0b1VzTGFiZWwoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5gXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXHRcdGV4ZWN1dGVDb21tYW5kQ2FsbHMgPSBbXTtcblx0XHRzaG93TWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQgPSBbXTtcblxuXHRcdC8vIHNlbmQgYmFja3NwYWNlXG5cdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleUNvZGUuQmFja3NwYWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXG5cdFx0XHRgVGhlIGtleSBjb21iaW5hdGlvbiAoJHt0b1VzTGFiZWwoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspfSwgJHt0b1VzTGFiZWwoS2V5Q29kZS5CYWNrc3BhY2UpfSkgaXMgbm90IGEgY29tbWFuZC5gXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW1xuXHRcdFx0YCgke3RvVXNMYWJlbChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmBcblx0XHRdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHQvLyBzZW5kIGJhY2tzcGFjZVxuXHRcdHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlDb2RlLkJhY2tzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFt7XG5cdFx0XHRjb21tYW5kSWQ6ICdzaW1wbGVDb21tYW5kJyxcblx0XHRcdGFyZ3M6IFtudWxsXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTY4MzM6IEtleWJpbmRpbmcgc2VydmljZSBzaG91bGQgbm90IHRlc3REaXNwYXRjaCBvbiBtb2RpZmllciBrZXlzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdGtiSXRlbShLZXlDb2RlLkN0cmwsICdub3BlJyksXG5cdFx0XHRrYkl0ZW0oS2V5Q29kZS5NZXRhLCAnbm9wZScpLFxuXHRcdFx0a2JJdGVtKEtleUNvZGUuQWx0LCAnbm9wZScpLFxuXHRcdFx0a2JJdGVtKEtleUNvZGUuU2hpZnQsICdub3BlJyksXG5cblx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCwgJ25vcGUnKSxcblx0XHRcdGtiSXRlbShLZXlNb2QuV2luQ3RybCwgJ25vcGUnKSxcblx0XHRcdGtiSXRlbShLZXlNb2QuQWx0LCAnbm9wZScpLFxuXHRcdFx0a2JJdGVtKEtleU1vZC5TaGlmdCwgJ25vcGUnKSxcblx0XHRdKTtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydElzSWdub3JlZChrZXliaW5kaW5nOiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChrZXliaW5kaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCBbXSk7XG5cdFx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0XHRzaG93TWVzc2FnZUNhbGxzID0gW107XG5cdFx0XHRzdGF0dXNNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cdFx0fVxuXG5cdFx0YXNzZXJ0SXNJZ25vcmVkKEtleUNvZGUuQ3RybCk7XG5cdFx0YXNzZXJ0SXNJZ25vcmVkKEtleUNvZGUuTWV0YSk7XG5cdFx0YXNzZXJ0SXNJZ25vcmVkKEtleUNvZGUuQWx0KTtcblx0XHRhc3NlcnRJc0lnbm9yZWQoS2V5Q29kZS5TaGlmdCk7XG5cblx0XHRhc3NlcnRJc0lnbm9yZWQoS2V5TW9kLkN0cmxDbWQpO1xuXHRcdGFzc2VydElzSWdub3JlZChLZXlNb2QuV2luQ3RybCk7XG5cdFx0YXNzZXJ0SXNJZ25vcmVkKEtleU1vZC5BbHQpO1xuXHRcdGFzc2VydElzSWdub3JlZChLZXlNb2QuU2hpZnQpO1xuXG5cdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgna2V5YmluZGluZ3MgYXJlIG5vdCBkaXNwYXRjaGVkIHdoaWxlIGFuIElNRSBjb21wb3NpdGlvbiBpcyBpbiBwcm9ncmVzcycsICgpID0+IHtcblxuXHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRrYkl0ZW0oS2V5Q29kZS5FbnRlciwgJ2VudGVyQ29tbWFuZCcpLFxuXHRcdF0pO1xuXG5cdFx0Ly8gRW50ZXIgY29tbWl0cyB0aGUgSU1FIGNvbXBvc2l0aW9uIGFuZCBiZWxvbmdzIHRvIHRoZSBpbnB1dCBtZXRob2QsIG5vdCB0byB0aGUgd29ya2JlbmNoLlxuXHRcdGNvbnN0IHNob3VsZFByZXZlbnREZWZhdWx0V2hpbGVDb21wb3NpbmcgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleUNvZGUuRW50ZXIsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbc2hvdWxkUHJldmVudERlZmF1bHRXaGlsZUNvbXBvc2luZywgZXhlY3V0ZUNvbW1hbmRDYWxsc10sXG5cdFx0XHRbZmFsc2UsIFtdXVxuXHRcdCk7XG5cblx0XHQvLyBgc29mdERpc3BhdGNoYCBtdXN0IGFncmVlLCBvdGhlcndpc2UgY2FsbGVycyB0aGF0IGFzayBcIndpbGwgdGhlIHdvcmtiZW5jaCBjbGFpbSB0aGlzIGtleT9cIlxuXHRcdC8vIHByZXZlbnQgdGhlIGRlZmF1bHQgYW5kIHRoZW4gbm9ib2R5IGhhbmRsZXMgdGhlIGtleXN0cm9rZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRrYlNlcnZpY2UudGVzdFNvZnREaXNwYXRjaChLZXlDb2RlLkVudGVyLCB0cnVlKS5raW5kLFxuXHRcdFx0UmVzdWx0S2luZC5Ob01hdGNoaW5nS2Jcblx0XHQpO1xuXG5cdFx0Ly8gT25jZSB0aGUgY29tcG9zaXRpb24gaGFzIGNvbW1pdHRlZCwgdGhlIHZlcnkgc2FtZSBrZXkgcnVucyB0aGUgY29tbWFuZCBhcyB1c3VhbC5cblx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5Q29kZS5FbnRlciwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbc2hvdWxkUHJldmVudERlZmF1bHQsIGV4ZWN1dGVDb21tYW5kQ2FsbHNdLFxuXHRcdFx0W3RydWUsIFt7IGNvbW1hbmRJZDogJ2VudGVyQ29tbWFuZCcsIGFyZ3M6IFtudWxsXSB9XV1cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGtiU2VydmljZS50ZXN0U29mdERpc3BhdGNoKEtleUNvZGUuRW50ZXIsIGZhbHNlKS5raW5kLFxuXHRcdFx0UmVzdWx0S2luZC5LYkZvdW5kXG5cdFx0KTtcblxuXHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiB0cmlnZ2VyIGNvbW1hbmQgdGhhdCBpcyBzaGFyaW5nIGtleWJpbmRpbmcgd2l0aCBjaG9yZCcsICgpID0+IHtcblxuXHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRrYkl0ZW0oS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlYKSwgJ2Nob3JkQ29tbWFuZCcpLFxuXHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCAnc2ltcGxlQ29tbWFuZCcsIENvbnRleHRLZXlFeHByLmhhcygna2V5MScpKSxcblx0XHRdKTtcblxuXG5cdFx0Ly8gc2VuZCBDdHJsL0NtZCArIEtcblx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7XG5cdFx0XHRrZXkxOiB0cnVlXG5cdFx0fSk7XG5cdFx0bGV0IHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFt7XG5cdFx0XHRjb21tYW5kSWQ6ICdzaW1wbGVDb21tYW5kJyxcblx0XHRcdGFyZ3M6IFtudWxsXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHQvLyBzZW5kIEN0cmwvQ21kICsgS1xuXHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHt9KTtcblx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIFtcblx0XHRcdGAoJHt0b1VzTGFiZWwoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5gXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXHRcdGV4ZWN1dGVDb21tYW5kQ2FsbHMgPSBbXTtcblx0XHRzaG93TWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQgPSBbXTtcblxuXHRcdC8vIHNlbmQgQ3RybC9DbWQgKyBYXG5cdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXHRcdHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFt7XG5cdFx0XHRjb21tYW5kSWQ6ICdjaG9yZENvbW1hbmQnLFxuXHRcdFx0YXJnczogW251bGxdXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW1xuXHRcdFx0YCgke3RvVXNMYWJlbChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmBcblx0XHRdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5ub3QgdHJpZ2dlciBjaG9yZCBpZiBjb21tYW5kIGlzIG92ZXJ3cml0aW5nJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdGtiSXRlbShLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVgpLCAnY2hvcmRDb21tYW5kJywgQ29udGV4dEtleUV4cHIuaGFzKCdrZXkxJykpLFxuXHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCAnc2ltcGxlQ29tbWFuZCcpLFxuXHRcdF0pO1xuXG5cblx0XHQvLyBzZW5kIEN0cmwvQ21kICsgS1xuXHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHt9KTtcblx0XHRsZXQgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW3tcblx0XHRcdGNvbW1hbmRJZDogJ3NpbXBsZUNvbW1hbmQnLFxuXHRcdFx0YXJnczogW251bGxdXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXHRcdGV4ZWN1dGVDb21tYW5kQ2FsbHMgPSBbXTtcblx0XHRzaG93TWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQgPSBbXTtcblxuXHRcdC8vIHNlbmQgQ3RybC9DbWQgKyBLXG5cdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe1xuXHRcdFx0a2V5MTogdHJ1ZVxuXHRcdH0pO1xuXHRcdHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFt7XG5cdFx0XHRjb21tYW5kSWQ6ICdzaW1wbGVDb21tYW5kJyxcblx0XHRcdGFyZ3M6IFtudWxsXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHQvLyBzZW5kIEN0cmwvQ21kICsgWFxuXHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdGtleTE6IHRydWVcblx0XHR9KTtcblx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXHRcdGV4ZWN1dGVDb21tYW5kQ2FsbHMgPSBbXTtcblx0XHRzaG93TWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQgPSBbXTtcblxuXHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBoYXZlIHNweWluZyBjb21tYW5kJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJ15zaW1wbGVDb21tYW5kJyksXG5cdFx0XSk7XG5cblx0XHQvLyBzZW5kIEN0cmwvQ21kICsgS1xuXHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHt9KTtcblx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW3tcblx0XHRcdGNvbW1hbmRJZDogJ3NpbXBsZUNvbW1hbmQnLFxuXHRcdFx0YXJnczogW251bGxdXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXHRcdGV4ZWN1dGVDb21tYW5kQ2FsbHMgPSBbXTtcblx0XHRzaG93TWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzID0gW107XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQgPSBbXTtcblxuXHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhcHBlbmRLZXliaW5kaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FwcGVuZHMga2V5YmluZGluZyBsYWJlbCB3aGVuIGNvbW1hbmQgaGFzIGEga2V5YmluZGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJ215Q29tbWFuZCcpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGtiU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCdNeSBMYWJlbCcsICdteUNvbW1hbmQnKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTGFiZWwgPSB0b1VzTGFiZWwoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgYE15IExhYmVsICgke2V4cGVjdGVkTGFiZWx9KWApO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBvbmx5IGxhYmVsIHdoZW4gY29tbWFuZCBoYXMgbm8ga2V5YmluZGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGtiU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCdNeSBMYWJlbCcsICdteUNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdNeSBMYWJlbCcpO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBvbmx5IGxhYmVsIHdoZW4gY29tbWFuZElkIGlzIG51bGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBrYlNlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnTXkgTGFiZWwnLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdNeSBMYWJlbCcpO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBvbmx5IGxhYmVsIHdoZW4gY29tbWFuZElkIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJ215Q29tbWFuZCcpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGtiU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCdNeSBMYWJlbCcsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnTXkgTGFiZWwnKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgb25seSBsYWJlbCB3aGVuIGNvbW1hbmRJZCBpcyBlbXB0eSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBrYlNlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnTXkgTGFiZWwnLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnTXkgTGFiZWwnKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGVuZHMga2V5YmluZGluZyBmb3IgY29tbWFuZCB3aXRoIGNvbnRleHQgd2hlbiBjb250ZXh0IG1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnLCBDb250ZXh0S2V5RXhwci5oYXMoJ2tleTEnKSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoeyBrZXkxOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0ga2JTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoJ015IExhYmVsJywgJ215Q29tbWFuZCcpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRMYWJlbCA9IHRvVXNMYWJlbChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBgTXkgTGFiZWwgKCR7ZXhwZWN0ZWRMYWJlbH0pYCk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG9ubHkgbGFiZWwgd2hlbiBjb250ZXh0IGRvZXMgbm90IG1hdGNoIGFuZCBlbmZvcmNlQ29udGV4dENoZWNrIGlzIHRydWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnLCBDb250ZXh0S2V5RXhwci5oYXMoJ2tleTEnKSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0ga2JTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoJ015IExhYmVsJywgJ215Q29tbWFuZCcsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnTXkgTGFiZWwnKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGVuZHMga2V5YmluZGluZyB3aGVuIGNvbnRleHQgZG9lcyBub3QgbWF0Y2ggYnV0IGVuZm9yY2VDb250ZXh0Q2hlY2sgaXMgZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnLCBDb250ZXh0S2V5RXhwci5oYXMoJ2tleTEnKSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0ga2JTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoJ015IExhYmVsJywgJ215Q29tbWFuZCcsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRMYWJlbCA9IHRvVXNMYWJlbChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBgTXkgTGFiZWwgKCR7ZXhwZWN0ZWRMYWJlbH0pYCk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBlbmRzIGtleWJpbmRpbmcgZXZlbiB3aGVuIGxhYmVsIGlzIGVtcHR5IHN0cmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJ215Q29tbWFuZCcpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGtiU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCcnLCAnbXlDb21tYW5kJyk7XG5cdFx0XHRjb25zdCBleHBlY3RlZExhYmVsID0gdG9Vc0xhYmVsKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGAgKCR7ZXhwZWN0ZWRMYWJlbH0pYCk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLHdCQUE0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
