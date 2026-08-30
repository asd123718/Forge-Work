import assert from "assert";
import { decodeKeybinding, createSimpleKeybinding } from "../../../../base/common/keybindings.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { OS } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ContextKeyExpr } from "../../../contextkey/common/contextkey.js";
import { KeybindingResolver, ResultKind } from "../../common/keybindingResolver.js";
import { ResolvedKeybindingItem } from "../../common/resolvedKeybindingItem.js";
import { USLayoutResolvedKeybinding } from "../../common/usLayoutResolvedKeybinding.js";
import { createUSLayoutResolvedKeybinding } from "./keybindingsTestUtils.js";
function createContext(ctx) {
  return {
    getValue: (key) => {
      return ctx[key];
    }
  };
}
suite("KeybindingResolver", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function kbItem(keybinding, command, commandArgs, when, isDefault) {
    const resolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
    return new ResolvedKeybindingItem(
      resolvedKeybinding,
      command,
      commandArgs,
      when,
      isDefault,
      null,
      false
    );
  }
  function getDispatchStr(chord) {
    return USLayoutResolvedKeybinding.getDispatchStr(chord);
  }
  test("resolve key", () => {
    const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ;
    const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
    const contextRules = ContextKeyExpr.equals("bar", "baz");
    const keybindingItem = kbItem(keybinding, "yes", null, contextRules, true);
    assert.strictEqual(contextRules.evaluate(createContext({ bar: "baz" })), true);
    assert.strictEqual(contextRules.evaluate(createContext({ bar: "bz" })), false);
    const resolver = new KeybindingResolver([keybindingItem], [], () => {
    });
    const r1 = resolver.resolve(createContext({ bar: "baz" }), [], getDispatchStr(runtimeKeybinding));
    assert.ok(r1.kind === ResultKind.KbFound);
    assert.strictEqual(r1.commandId, "yes");
    const r2 = resolver.resolve(createContext({ bar: "bz" }), [], getDispatchStr(runtimeKeybinding));
    assert.strictEqual(r2.kind, ResultKind.NoMatchingKb);
  });
  test("resolve key with arguments", () => {
    const commandArgs = { text: "no" };
    const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ;
    const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
    const contextRules = ContextKeyExpr.equals("bar", "baz");
    const keybindingItem = kbItem(keybinding, "yes", commandArgs, contextRules, true);
    const resolver = new KeybindingResolver([keybindingItem], [], () => {
    });
    const r = resolver.resolve(createContext({ bar: "baz" }), [], getDispatchStr(runtimeKeybinding));
    assert.ok(r.kind === ResultKind.KbFound);
    assert.strictEqual(r.commandArgs, commandArgs);
  });
  suite("handle keybinding removals", () => {
    test("simple 1", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), false)
      ]);
    });
    test("simple 2", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyC, "yes3", null, ContextKeyExpr.equals("3", "c"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true),
        kbItem(KeyCode.KeyC, "yes3", null, ContextKeyExpr.equals("3", "c"), false)
      ]);
    });
    test("removal with not matching when", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-yes1", null, ContextKeyExpr.equals("1", "b"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with not matching keybinding", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyB, "-yes1", null, ContextKeyExpr.equals("1", "a"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with matching keybinding and when", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-yes1", null, ContextKeyExpr.equals("1", "a"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with unspecified keybinding", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(0, "-yes1", null, ContextKeyExpr.equals("1", "a"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with unspecified when", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-yes1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with unspecified when and unspecified keybinding", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(0, "-yes1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("issue #138997 - removal in default list", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, void 0, true),
        kbItem(KeyCode.KeyB, "yes2", null, void 0, true),
        kbItem(0, "-yes1", null, void 0, false)
      ];
      const overrides = [];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, void 0, true)
      ]);
    });
    test("issue #612#issuecomment-222109084 cannot remove keybindings for commands with ^", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "^yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-yes1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("issue #140884 Unable to reassign F1 as keybinding for Show All Commands", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, void 0, true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, void 0, false),
        kbItem(KeyCode.KeyA, "command1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "command1", null, void 0, false)
      ]);
    });
    test("issue #141638: Keyboard Shortcuts: Change When Expression might actually remove keybinding in Insiders", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, void 0, true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.equals("a", "1"), false),
        kbItem(KeyCode.KeyA, "-command1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.equals("a", "1"), false)
      ]);
    });
    test("issue #157751: Auto-quoting of context keys prevents removal of keybindings via UI", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.deserialize(`editorTextFocus && activeEditor != workbench.editor.notebook && editorLangId in julia.supportedLanguageIds`), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, ContextKeyExpr.deserialize(`editorTextFocus && activeEditor != 'workbench.editor.notebook' && editorLangId in 'julia.supportedLanguageIds'`), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, []);
    });
    test("issue #293802: removal still matches when default when clause becomes more specific", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.and(ContextKeyExpr.has("inChatInput"), ContextKeyExpr.not("withinEditSessionDiff")), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, ContextKeyExpr.has("inChatInput"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, []);
    });
    test("removal with more specific when clause does not match broader default", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.has("inChatInput"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, ContextKeyExpr.and(ContextKeyExpr.has("inChatInput"), ContextKeyExpr.not("withinEditSessionDiff")), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.has("inChatInput"), true)
      ]);
    });
    test("issue #160604: Remove keybindings with when clause does not work", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, void 0, true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, ContextKeyExpr.true(), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, []);
    });
    test("contextIsEntirelyIncluded", () => {
      const toContextKeyExpression = (expr) => {
        if (typeof expr === "string" || !expr) {
          return ContextKeyExpr.deserialize(expr);
        }
        return expr;
      };
      const assertIsIncluded = (a, b) => {
        assert.strictEqual(KeybindingResolver.whenIsEntirelyIncluded(toContextKeyExpression(a), toContextKeyExpression(b)), true);
      };
      const assertIsNotIncluded = (a, b) => {
        assert.strictEqual(KeybindingResolver.whenIsEntirelyIncluded(toContextKeyExpression(a), toContextKeyExpression(b)), false);
      };
      assertIsIncluded(null, null);
      assertIsIncluded(null, ContextKeyExpr.true());
      assertIsIncluded(ContextKeyExpr.true(), null);
      assertIsIncluded(ContextKeyExpr.true(), ContextKeyExpr.true());
      assertIsIncluded("key1", null);
      assertIsIncluded("key1", "");
      assertIsIncluded("key1", "key1");
      assertIsIncluded("key1", ContextKeyExpr.true());
      assertIsIncluded("!key1", "");
      assertIsIncluded("!key1", "!key1");
      assertIsIncluded("key2", "");
      assertIsIncluded("key2", "key2");
      assertIsIncluded("key1 && key1 && key2 && key2", "key2");
      assertIsIncluded("key1 && key2", "key2");
      assertIsIncluded("key1 && key2", "key1");
      assertIsIncluded("key1 && key2", "");
      assertIsIncluded("key1", "key1 || key2");
      assertIsIncluded("key1 || !key1", "key2 || !key2");
      assertIsIncluded("key1", "key1 || key2 && key3");
      assertIsNotIncluded("key1", "!key1");
      assertIsNotIncluded("!key1", "key1");
      assertIsNotIncluded("key1 && key2", "key3");
      assertIsNotIncluded("key1 && key2", "key4");
      assertIsNotIncluded("key1", "key2");
      assertIsNotIncluded("key1 || key2", "key2");
      assertIsNotIncluded("", "key2");
      assertIsNotIncluded(null, "key2");
    });
  });
  suite("resolve command", () => {
    function _kbItem(keybinding, command, when) {
      return kbItem(keybinding, command, null, when, true);
    }
    const items = [
      // This one will never match because its "when" is always overwritten by another one
      _kbItem(
        KeyCode.KeyX,
        "first",
        ContextKeyExpr.and(
          ContextKeyExpr.equals("key1", true),
          ContextKeyExpr.notEquals("key2", false)
        )
      ),
      // This one always overwrites first
      _kbItem(
        KeyCode.KeyX,
        "second",
        ContextKeyExpr.equals("key2", true)
      ),
      // This one is a secondary mapping for `second`
      _kbItem(
        KeyCode.KeyZ,
        "second",
        void 0
      ),
      // This one sometimes overwrites first
      _kbItem(
        KeyCode.KeyX,
        "third",
        ContextKeyExpr.equals("key3", true)
      ),
      // This one is always overwritten by another one
      _kbItem(
        KeyMod.CtrlCmd | KeyCode.KeyY,
        "fourth",
        ContextKeyExpr.equals("key4", true)
      ),
      // This one overwrites with a chord the previous one
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ),
        "fifth",
        void 0
      ),
      // This one has no keybinding
      _kbItem(
        0,
        "sixth",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU),
        "seventh",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK),
        "seventh",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU),
        "uncomment lines",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
        // cmd+k cmd+c
        "comment lines",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyG, KeyMod.CtrlCmd | KeyCode.KeyC),
        // cmd+g cmd+c
        "unreachablechord",
        void 0
      ),
      _kbItem(
        KeyMod.CtrlCmd | KeyCode.KeyG,
        // cmd+g
        "eleven",
        void 0
      ),
      _kbItem(
        [KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB],
        // cmd+k a b
        "long multi chord",
        void 0
      ),
      _kbItem(
        [KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC],
        // cmd+b cmd+c
        "shadowed by long-multi-chord-2",
        void 0
      ),
      _kbItem(
        [KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC, KeyCode.KeyI],
        // cmd+b cmd+c i
        "long-multi-chord-2",
        void 0
      )
    ];
    const resolver = new KeybindingResolver(items, [], () => {
    });
    const testKbLookupByCommand = (commandId, expectedKeys) => {
      const lookupResult = resolver.lookupKeybindings(commandId);
      assert.strictEqual(lookupResult.length, expectedKeys.length, "Length mismatch @ commandId " + commandId);
      for (let i = 0, len = lookupResult.length; i < len; i++) {
        const expected = createUSLayoutResolvedKeybinding(expectedKeys[i], OS);
        assert.strictEqual(lookupResult[i].resolvedKeybinding.getUserSettingsLabel(), expected.getUserSettingsLabel(), "value mismatch @ commandId " + commandId);
      }
    };
    const testResolve = (ctx, _expectedKey, commandId) => {
      const expectedKeybinding = decodeKeybinding(_expectedKey, OS);
      const previousChord = [];
      for (let i = 0, len = expectedKeybinding.chords.length; i < len; i++) {
        const chord = getDispatchStr(expectedKeybinding.chords[i]);
        const result = resolver.resolve(ctx, previousChord, chord);
        if (i === len - 1) {
          assert.ok(result.kind === ResultKind.KbFound, `Enters multi chord for ${commandId} at chord ${i}`);
          assert.strictEqual(result.commandId, commandId, `Enters multi chord for ${commandId} at chord ${i}`);
        } else if (i > 0) {
          assert.ok(result.kind === ResultKind.MoreChordsNeeded, `Continues multi chord for ${commandId} at chord ${i}`);
        } else {
          assert.ok(result.kind === ResultKind.MoreChordsNeeded, `Enters multi chord for ${commandId} at chord ${i}`);
        }
        previousChord.push(chord);
      }
    };
    test("resolve command - 1", () => {
      testKbLookupByCommand("first", []);
    });
    test("resolve command - 2", () => {
      testKbLookupByCommand("second", [KeyCode.KeyZ, KeyCode.KeyX]);
      testResolve(createContext({ key2: true }), KeyCode.KeyX, "second");
      testResolve(createContext({}), KeyCode.KeyZ, "second");
    });
    test("resolve command - 3", () => {
      testKbLookupByCommand("third", [KeyCode.KeyX]);
      testResolve(createContext({ key3: true }), KeyCode.KeyX, "third");
    });
    test("resolve command - 4", () => {
      testKbLookupByCommand("fourth", []);
    });
    test("resolve command - 5", () => {
      testKbLookupByCommand("fifth", [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ)]);
      testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ), "fifth");
    });
    test("resolve command - 6", () => {
      testKbLookupByCommand("seventh", [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK)]);
      testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK), "seventh");
    });
    test("resolve command - 7", () => {
      testKbLookupByCommand("uncomment lines", [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU)]);
      testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU), "uncomment lines");
    });
    test("resolve command - 8", () => {
      testKbLookupByCommand("comment lines", [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC)]);
      testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC), "comment lines");
    });
    test("resolve command - 9", () => {
      testKbLookupByCommand("unreachablechord", []);
    });
    test("resolve command - 10", () => {
      testKbLookupByCommand("eleven", [KeyMod.CtrlCmd | KeyCode.KeyG]);
      testResolve(createContext({}), KeyMod.CtrlCmd | KeyCode.KeyG, "eleven");
    });
    test("resolve command - 11", () => {
      testKbLookupByCommand("sixth", []);
    });
    test("resolve command - 12", () => {
      testKbLookupByCommand("long multi chord", [[KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB]]);
      testResolve(createContext({}), [KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB], "long multi chord");
    });
    const emptyContext = createContext({});
    test("KBs having common prefix - the one defined later is returned", () => {
      testResolve(emptyContext, [KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC, KeyCode.KeyI], "long-multi-chord-2");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxca2V5YmluZGluZ1xcdGVzdFxcY29tbW9uXFxrZXliaW5kaW5nUmVzb2x2ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGRlY29kZUtleWJpbmRpbmcsIGNyZWF0ZVNpbXBsZUtleWJpbmRpbmcsIEtleUNvZGVDaG9yZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1Jlc29sdmVyLCBSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Jlc29sdmVkS2V5YmluZGluZ0l0ZW0uanMnO1xuaW1wb3J0IHsgVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vdXNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgY3JlYXRlVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuL2tleWJpbmRpbmdzVGVzdFV0aWxzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dChjdHg6IGFueSkge1xuXHRyZXR1cm4ge1xuXHRcdGdldFZhbHVlOiAoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiBjdHhba2V5XTtcblx0XHR9XG5cdH07XG59XG5cbnN1aXRlKCdLZXliaW5kaW5nUmVzb2x2ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24ga2JJdGVtKGtleWJpbmRpbmc6IG51bWJlciB8IG51bWJlcltdLCBjb21tYW5kOiBzdHJpbmcsIGNvbW1hbmRBcmdzOiBhbnksIHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCBpc0RlZmF1bHQ6IGJvb2xlYW4pOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIHtcblx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmcgPSBjcmVhdGVVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyhrZXliaW5kaW5nLCBPUyk7XG5cdFx0cmV0dXJuIG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKFxuXHRcdFx0cmVzb2x2ZWRLZXliaW5kaW5nLFxuXHRcdFx0Y29tbWFuZCxcblx0XHRcdGNvbW1hbmRBcmdzLFxuXHRcdFx0d2hlbixcblx0XHRcdGlzRGVmYXVsdCxcblx0XHRcdG51bGwsXG5cdFx0XHRmYWxzZVxuXHRcdCk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXREaXNwYXRjaFN0cihjaG9yZDogS2V5Q29kZUNob3JkKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcuZ2V0RGlzcGF0Y2hTdHIoY2hvcmQpITtcblx0fVxuXG5cdHRlc3QoJ3Jlc29sdmUga2V5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Wjtcblx0XHRjb25zdCBydW50aW1lS2V5YmluZGluZyA9IGNyZWF0ZVNpbXBsZUtleWJpbmRpbmcoa2V5YmluZGluZywgT1MpO1xuXHRcdGNvbnN0IGNvbnRleHRSdWxlcyA9IENvbnRleHRLZXlFeHByLmVxdWFscygnYmFyJywgJ2JheicpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdJdGVtID0ga2JJdGVtKGtleWJpbmRpbmcsICd5ZXMnLCBudWxsLCBjb250ZXh0UnVsZXMsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHRSdWxlcy5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgYmFyOiAnYmF6JyB9KSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0UnVsZXMuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7IGJhcjogJ2J6JyB9KSksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHJlc29sdmVyID0gbmV3IEtleWJpbmRpbmdSZXNvbHZlcihba2V5YmluZGluZ0l0ZW1dLCBbXSwgKCkgPT4geyB9KTtcblxuXHRcdGNvbnN0IHIxID0gcmVzb2x2ZXIucmVzb2x2ZShjcmVhdGVDb250ZXh0KHsgYmFyOiAnYmF6JyB9KSwgW10sIGdldERpc3BhdGNoU3RyKHJ1bnRpbWVLZXliaW5kaW5nKSk7XG5cdFx0YXNzZXJ0Lm9rKHIxLmtpbmQgPT09IFJlc3VsdEtpbmQuS2JGb3VuZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIxLmNvbW1hbmRJZCwgJ3llcycpO1xuXG5cdFx0Y29uc3QgcjIgPSByZXNvbHZlci5yZXNvbHZlKGNyZWF0ZUNvbnRleHQoeyBiYXI6ICdieicgfSksIFtdLCBnZXREaXNwYXRjaFN0cihydW50aW1lS2V5YmluZGluZykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMi5raW5kLCBSZXN1bHRLaW5kLk5vTWF0Y2hpbmdLYik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUga2V5IHdpdGggYXJndW1lbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRBcmdzID0geyB0ZXh0OiAnbm8nIH07XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlaO1xuXHRcdGNvbnN0IHJ1bnRpbWVLZXliaW5kaW5nID0gY3JlYXRlU2ltcGxlS2V5YmluZGluZyhrZXliaW5kaW5nLCBPUyk7XG5cdFx0Y29uc3QgY29udGV4dFJ1bGVzID0gQ29udGV4dEtleUV4cHIuZXF1YWxzKCdiYXInLCAnYmF6Jyk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ0l0ZW0gPSBrYkl0ZW0oa2V5YmluZGluZywgJ3llcycsIGNvbW1hbmRBcmdzLCBjb250ZXh0UnVsZXMsIHRydWUpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSBuZXcgS2V5YmluZGluZ1Jlc29sdmVyKFtrZXliaW5kaW5nSXRlbV0sIFtdLCAoKSA9PiB7IH0pO1xuXG5cdFx0Y29uc3QgciA9IHJlc29sdmVyLnJlc29sdmUoY3JlYXRlQ29udGV4dCh7IGJhcjogJ2JheicgfSksIFtdLCBnZXREaXNwYXRjaFN0cihydW50aW1lS2V5YmluZGluZykpO1xuXHRcdGFzc2VydC5vayhyLmtpbmQgPT09IFJlc3VsdEtpbmQuS2JGb3VuZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIuY29tbWFuZEFyZ3MsIGNvbW1hbmRBcmdzKTtcblx0fSk7XG5cblx0c3VpdGUoJ2hhbmRsZSBrZXliaW5kaW5nIHJlbW92YWxzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc2ltcGxlIDEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICd5ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgZmFsc2UpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW1wbGUgMicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlDLCAneWVzMycsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMycsICdjJyksIGZhbHNlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscyhbLi4uZGVmYXVsdHMsIC4uLm92ZXJyaWRlc10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QywgJ3llczMnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzMnLCAnYycpLCBmYWxzZSksXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92YWwgd2l0aCBub3QgbWF0Y2hpbmcgd2hlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnLXllczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYicpLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICd5ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZhbCB3aXRoIG5vdCBtYXRjaGluZyBrZXliaW5kaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICd5ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICcteWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIGZhbHNlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscyhbLi4uZGVmYXVsdHMsIC4uLm92ZXJyaWRlc10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmFsIHdpdGggbWF0Y2hpbmcga2V5YmluZGluZyBhbmQgd2hlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnLXllczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZhbCB3aXRoIHVuc3BlY2lmaWVkIGtleWJpbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKDAsICcteWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIGZhbHNlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscyhbLi4uZGVmYXVsdHMsIC4uLm92ZXJyaWRlc10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmFsIHdpdGggdW5zcGVjaWZpZWQgd2hlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnLXllczEnLCBudWxsLCB1bmRlZmluZWQsIGZhbHNlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscyhbLi4uZGVmYXVsdHMsIC4uLm92ZXJyaWRlc10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmFsIHdpdGggdW5zcGVjaWZpZWQgd2hlbiBhbmQgdW5zcGVjaWZpZWQga2V5YmluZGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oMCwgJy15ZXMxJywgbnVsbCwgdW5kZWZpbmVkLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNzdWUgIzEzODk5NyAtIHJlbW92YWwgaW4gZGVmYXVsdCBsaXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICd5ZXMxJywgbnVsbCwgdW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCB1bmRlZmluZWQsIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oMCwgJy15ZXMxJywgbnVsbCwgdW5kZWZpbmVkLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBvdmVycmlkZXM6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSA9IFtdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIHVuZGVmaW5lZCwgdHJ1ZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNzdWUgIzYxMiNpc3N1ZWNvbW1lbnQtMjIyMTA5MDg0IGNhbm5vdCByZW1vdmUga2V5YmluZGluZ3MgZm9yIGNvbW1hbmRzIHdpdGggXicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnXnllczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJy15ZXMxJywgbnVsbCwgdW5kZWZpbmVkLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNzdWUgIzE0MDg4NCBVbmFibGUgdG8gcmVhc3NpZ24gRjEgYXMga2V5YmluZGluZyBmb3IgU2hvdyBBbGwgQ29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ2NvbW1hbmQxJywgbnVsbCwgdW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICctY29tbWFuZDEnLCBudWxsLCB1bmRlZmluZWQsIGZhbHNlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ2NvbW1hbmQxJywgbnVsbCwgdW5kZWZpbmVkLCBmYWxzZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnY29tbWFuZDEnLCBudWxsLCB1bmRlZmluZWQsIGZhbHNlKVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc3N1ZSAjMTQxNjM4OiBLZXlib2FyZCBTaG9ydGN1dHM6IENoYW5nZSBXaGVuIEV4cHJlc3Npb24gbWlnaHQgYWN0dWFsbHkgcmVtb3ZlIGtleWJpbmRpbmcgaW4gSW5zaWRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ2NvbW1hbmQxJywgbnVsbCwgdW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnYScsICcxJyksIGZhbHNlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJy1jb21tYW5kMScsIG51bGwsIHVuZGVmaW5lZCwgZmFsc2UpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscyhbLi4uZGVmYXVsdHMsIC4uLm92ZXJyaWRlc10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ2NvbW1hbmQxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhJywgJzEnKSwgZmFsc2UpXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzc3VlICMxNTc3NTE6IEF1dG8tcXVvdGluZyBvZiBjb250ZXh0IGtleXMgcHJldmVudHMgcmVtb3ZhbCBvZiBrZXliaW5kaW5ncyB2aWEgVUknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ2NvbW1hbmQxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoYGVkaXRvclRleHRGb2N1cyAmJiBhY3RpdmVFZGl0b3IgIT0gd29ya2JlbmNoLmVkaXRvci5ub3RlYm9vayAmJiBlZGl0b3JMYW5nSWQgaW4ganVsaWEuc3VwcG9ydGVkTGFuZ3VhZ2VJZHNgKSwgdHJ1ZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnLWNvbW1hbmQxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoYGVkaXRvclRleHRGb2N1cyAmJiBhY3RpdmVFZGl0b3IgIT0gJ3dvcmtiZW5jaC5lZGl0b3Iubm90ZWJvb2snICYmIGVkaXRvckxhbmdJZCBpbiAnanVsaWEuc3VwcG9ydGVkTGFuZ3VhZ2VJZHMnYCksIGZhbHNlKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc3N1ZSAjMjkzODAyOiByZW1vdmFsIHN0aWxsIG1hdGNoZXMgd2hlbiBkZWZhdWx0IHdoZW4gY2xhdXNlIGJlY29tZXMgbW9yZSBzcGVjaWZpYycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnY29tbWFuZDEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuaGFzKCdpbkNoYXRJbnB1dCcpLCBDb250ZXh0S2V5RXhwci5ub3QoJ3dpdGhpbkVkaXRTZXNzaW9uRGlmZicpKSwgdHJ1ZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnLWNvbW1hbmQxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuaGFzKCdpbkNoYXRJbnB1dCcpLCBmYWxzZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZhbCB3aXRoIG1vcmUgc3BlY2lmaWMgd2hlbiBjbGF1c2UgZG9lcyBub3QgbWF0Y2ggYnJvYWRlciBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIENvbnRleHRLZXlFeHByLmhhcygnaW5DaGF0SW5wdXQnKSwgdHJ1ZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnLWNvbW1hbmQxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnaW5DaGF0SW5wdXQnKSwgQ29udGV4dEtleUV4cHIubm90KCd3aXRoaW5FZGl0U2Vzc2lvbkRpZmYnKSksIGZhbHNlKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIENvbnRleHRLZXlFeHByLmhhcygnaW5DaGF0SW5wdXQnKSwgdHJ1ZSksXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzc3VlICMxNjA2MDQ6IFJlbW92ZSBrZXliaW5kaW5ncyB3aXRoIHdoZW4gY2xhdXNlIGRvZXMgbm90IHdvcmsnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ2NvbW1hbmQxJywgbnVsbCwgdW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICctY29tbWFuZDEnLCBudWxsLCBDb250ZXh0S2V5RXhwci50cnVlKCksIGZhbHNlKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb250ZXh0SXNFbnRpcmVseUluY2x1ZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9Db250ZXh0S2V5RXhwcmVzc2lvbiA9IChleHByOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHN0cmluZyB8IG51bGwpID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBleHByID09PSAnc3RyaW5nJyB8fCAhZXhwcikge1xuXHRcdFx0XHRcdHJldHVybiBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShleHByKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZXhwcjtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhc3NlcnRJc0luY2x1ZGVkID0gKGE6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgc3RyaW5nIHwgbnVsbCwgYjogQ29udGV4dEtleUV4cHJlc3Npb24gfCBzdHJpbmcgfCBudWxsKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChLZXliaW5kaW5nUmVzb2x2ZXIud2hlbklzRW50aXJlbHlJbmNsdWRlZCh0b0NvbnRleHRLZXlFeHByZXNzaW9uKGEpLCB0b0NvbnRleHRLZXlFeHByZXNzaW9uKGIpKSwgdHJ1ZSk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYXNzZXJ0SXNOb3RJbmNsdWRlZCA9IChhOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHN0cmluZyB8IG51bGwsIGI6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgc3RyaW5nIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoS2V5YmluZGluZ1Jlc29sdmVyLndoZW5Jc0VudGlyZWx5SW5jbHVkZWQodG9Db250ZXh0S2V5RXhwcmVzc2lvbihhKSwgdG9Db250ZXh0S2V5RXhwcmVzc2lvbihiKSksIGZhbHNlKTtcblx0XHRcdH07XG5cblx0XHRcdGFzc2VydElzSW5jbHVkZWQobnVsbCwgbnVsbCk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKG51bGwsIENvbnRleHRLZXlFeHByLnRydWUoKSk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKENvbnRleHRLZXlFeHByLnRydWUoKSwgbnVsbCk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKENvbnRleHRLZXlFeHByLnRydWUoKSwgQ29udGV4dEtleUV4cHIudHJ1ZSgpKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTEnLCBudWxsKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTEnLCAnJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxJywgJ2tleTEnKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTEnLCBDb250ZXh0S2V5RXhwci50cnVlKCkpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZCgnIWtleTEnLCAnJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCcha2V5MScsICcha2V5MScpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZCgna2V5MicsICcnKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTInLCAna2V5MicpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZCgna2V5MSAmJiBrZXkxICYmIGtleTIgJiYga2V5MicsICdrZXkyJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxICYmIGtleTInLCAna2V5MicpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZCgna2V5MSAmJiBrZXkyJywgJ2tleTEnKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTEgJiYga2V5MicsICcnKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTEnLCAna2V5MSB8fCBrZXkyJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxIHx8ICFrZXkxJywgJ2tleTIgfHwgIWtleTInKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTEnLCAna2V5MSB8fCBrZXkyICYmIGtleTMnKTtcblxuXHRcdFx0YXNzZXJ0SXNOb3RJbmNsdWRlZCgna2V5MScsICcha2V5MScpO1xuXHRcdFx0YXNzZXJ0SXNOb3RJbmNsdWRlZCgnIWtleTEnLCAna2V5MScpO1xuXHRcdFx0YXNzZXJ0SXNOb3RJbmNsdWRlZCgna2V5MSAmJiBrZXkyJywgJ2tleTMnKTtcblx0XHRcdGFzc2VydElzTm90SW5jbHVkZWQoJ2tleTEgJiYga2V5MicsICdrZXk0Jyk7XG5cdFx0XHRhc3NlcnRJc05vdEluY2x1ZGVkKCdrZXkxJywgJ2tleTInKTtcblx0XHRcdGFzc2VydElzTm90SW5jbHVkZWQoJ2tleTEgfHwga2V5MicsICdrZXkyJyk7XG5cdFx0XHRhc3NlcnRJc05vdEluY2x1ZGVkKCcnLCAna2V5MicpO1xuXHRcdFx0YXNzZXJ0SXNOb3RJbmNsdWRlZChudWxsLCAna2V5MicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb2x2ZSBjb21tYW5kJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gX2tiSXRlbShrZXliaW5kaW5nOiBudW1iZXIgfCBudW1iZXJbXSwgY29tbWFuZDogc3RyaW5nLCB3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCk6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0ge1xuXHRcdFx0cmV0dXJuIGtiSXRlbShrZXliaW5kaW5nLCBjb21tYW5kLCBudWxsLCB3aGVuLCB0cnVlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdC8vIFRoaXMgb25lIHdpbGwgbmV2ZXIgbWF0Y2ggYmVjYXVzZSBpdHMgXCJ3aGVuXCIgaXMgYWx3YXlzIG92ZXJ3cml0dGVuIGJ5IGFub3RoZXIgb25lXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRLZXlDb2RlLktleVgsXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2tleTEnLCB0cnVlKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2tleTInLCBmYWxzZSlcblx0XHRcdFx0KVxuXHRcdFx0KSxcblx0XHRcdC8vIFRoaXMgb25lIGFsd2F5cyBvdmVyd3JpdGVzIGZpcnN0XG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRLZXlDb2RlLktleVgsXG5cdFx0XHRcdCdzZWNvbmQnLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2tleTInLCB0cnVlKVxuXHRcdFx0KSxcblx0XHRcdC8vIFRoaXMgb25lIGlzIGEgc2Vjb25kYXJ5IG1hcHBpbmcgZm9yIGBzZWNvbmRgXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRLZXlDb2RlLktleVosXG5cdFx0XHRcdCdzZWNvbmQnLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCksXG5cdFx0XHQvLyBUaGlzIG9uZSBzb21ldGltZXMgb3ZlcndyaXRlcyBmaXJzdFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5Q29kZS5LZXlYLFxuXHRcdFx0XHQndGhpcmQnLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2tleTMnLCB0cnVlKVxuXHRcdFx0KSxcblx0XHRcdC8vIFRoaXMgb25lIGlzIGFsd2F5cyBvdmVyd3JpdHRlbiBieSBhbm90aGVyIG9uZVxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVksXG5cdFx0XHRcdCdmb3VydGgnLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2tleTQnLCB0cnVlKVxuXHRcdFx0KSxcblx0XHRcdC8vIFRoaXMgb25lIG92ZXJ3cml0ZXMgd2l0aCBhIGNob3JkIHRoZSBwcmV2aW91cyBvbmVcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlZLCBLZXlDb2RlLktleVopLFxuXHRcdFx0XHQnZmlmdGgnLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCksXG5cdFx0XHQvLyBUaGlzIG9uZSBoYXMgbm8ga2V5YmluZGluZ1xuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0MCxcblx0XHRcdFx0J3NpeHRoJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlVKSxcblx0XHRcdFx0J3NldmVudGgnLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCksXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspLFxuXHRcdFx0XHQnc2V2ZW50aCcsXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KSxcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5VSksXG5cdFx0XHRcdCd1bmNvbW1lbnQgbGluZXMnLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCksXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMpLCAvLyBjbWQrayBjbWQrY1xuXHRcdFx0XHQnY29tbWVudCBsaW5lcycsXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KSxcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlHLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QyksIC8vIGNtZCtnIGNtZCtjXG5cdFx0XHRcdCd1bnJlYWNoYWJsZWNob3JkJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUcsIC8vIGNtZCtnXG5cdFx0XHRcdCdlbGV2ZW4nLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCksXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5QSwgS2V5Q29kZS5LZXlCXSwgLy8gY21kK2sgYSBiXG5cdFx0XHRcdCdsb25nIG11bHRpIGNob3JkJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0W0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlCLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Q10sIC8vIGNtZCtiIGNtZCtjXG5cdFx0XHRcdCdzaGFkb3dlZCBieSBsb25nLW11bHRpLWNob3JkLTInLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCksXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUIsIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDLCBLZXlDb2RlLktleUldLCAvLyBjbWQrYiBjbWQrYyBpXG5cdFx0XHRcdCdsb25nLW11bHRpLWNob3JkLTInLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdClcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSBuZXcgS2V5YmluZGluZ1Jlc29sdmVyKGl0ZW1zLCBbXSwgKCkgPT4geyB9KTtcblxuXHRcdGNvbnN0IHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCA9IChjb21tYW5kSWQ6IHN0cmluZywgZXhwZWN0ZWRLZXlzOiBudW1iZXJbXSB8IG51bWJlcltdW10pID0+IHtcblx0XHRcdC8vIFRlc3QgbG9va3VwXG5cdFx0XHRjb25zdCBsb29rdXBSZXN1bHQgPSByZXNvbHZlci5sb29rdXBLZXliaW5kaW5ncyhjb21tYW5kSWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvb2t1cFJlc3VsdC5sZW5ndGgsIGV4cGVjdGVkS2V5cy5sZW5ndGgsICdMZW5ndGggbWlzbWF0Y2ggQCBjb21tYW5kSWQgJyArIGNvbW1hbmRJZCk7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbG9va3VwUmVzdWx0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gY3JlYXRlVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcoZXhwZWN0ZWRLZXlzW2ldLCBPUykhO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb29rdXBSZXN1bHRbaV0ucmVzb2x2ZWRLZXliaW5kaW5nIS5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpLCBleHBlY3RlZC5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpLCAndmFsdWUgbWlzbWF0Y2ggQCBjb21tYW5kSWQgJyArIGNvbW1hbmRJZCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRlc3RSZXNvbHZlID0gKGN0eDogSUNvbnRleHQsIF9leHBlY3RlZEtleTogbnVtYmVyIHwgbnVtYmVyW10sIGNvbW1hbmRJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZEtleWJpbmRpbmcgPSBkZWNvZGVLZXliaW5kaW5nKF9leHBlY3RlZEtleSwgT1MpITtcblxuXHRcdFx0Y29uc3QgcHJldmlvdXNDaG9yZDogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGV4cGVjdGVkS2V5YmluZGluZy5jaG9yZHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblxuXHRcdFx0XHRjb25zdCBjaG9yZCA9IGdldERpc3BhdGNoU3RyKDxLZXlDb2RlQ2hvcmQ+ZXhwZWN0ZWRLZXliaW5kaW5nLmNob3Jkc1tpXSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZXIucmVzb2x2ZShjdHgsIHByZXZpb3VzQ2hvcmQsIGNob3JkKTtcblxuXHRcdFx0XHRpZiAoaSA9PT0gbGVuIC0gMSkge1xuXHRcdFx0XHRcdC8vIGlmIGl0J3MgdGhlIGZpbmFsIGNob3JkLCB0aGVuIHdlIHNob3VsZCBmaW5kIGEgdmFsaWQgY29tbWFuZCxcblx0XHRcdFx0XHQvLyBhbmQgdGhlcmUgc2hvdWxkIG5vdCBiZSBhIGNob3JkLlxuXHRcdFx0XHRcdGFzc2VydC5vayhyZXN1bHQua2luZCA9PT0gUmVzdWx0S2luZC5LYkZvdW5kLCBgRW50ZXJzIG11bHRpIGNob3JkIGZvciAke2NvbW1hbmRJZH0gYXQgY2hvcmQgJHtpfWApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29tbWFuZElkLCBjb21tYW5kSWQsIGBFbnRlcnMgbXVsdGkgY2hvcmQgZm9yICR7Y29tbWFuZElkfSBhdCBjaG9yZCAke2l9YCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaSA+IDApIHtcblx0XHRcdFx0XHQvLyBpZiB0aGlzIGlzIGFuIGludGVybWVkaWF0ZSBjaG9yZCwgd2Ugc2hvdWxkIG5vdCBmaW5kIGEgdmFsaWQgY29tbWFuZCxcblx0XHRcdFx0XHQvLyBhbmQgdGhlcmUgc2hvdWxkIGJlIGFuIG9wZW4gY2hvcmQgd2UgY29udGludWUuXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLk1vcmVDaG9yZHNOZWVkZWQsIGBDb250aW51ZXMgbXVsdGkgY2hvcmQgZm9yICR7Y29tbWFuZElkfSBhdCBjaG9yZCAke2l9YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gaWYgaXQncyBub3QgdGhlIGZpbmFsIGNob3JkIGFuZCBub3QgYW4gaW50ZXJtZWRpYXRlLCB0aGVuIHdlIHNob3VsZCBub3Rcblx0XHRcdFx0XHQvLyBmaW5kIGEgdmFsaWQgY29tbWFuZCwgYW5kIHdlIHNob3VsZCBlbnRlciBhIGNob3JkLlxuXHRcdFx0XHRcdGFzc2VydC5vayhyZXN1bHQua2luZCA9PT0gUmVzdWx0S2luZC5Nb3JlQ2hvcmRzTmVlZGVkLCBgRW50ZXJzIG11bHRpIGNob3JkIGZvciAke2NvbW1hbmRJZH0gYXQgY2hvcmQgJHtpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByZXZpb3VzQ2hvcmQucHVzaChjaG9yZCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDEnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0S2JMb29rdXBCeUNvbW1hbmQoJ2ZpcnN0JywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gMicsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgnc2Vjb25kJywgW0tleUNvZGUuS2V5WiwgS2V5Q29kZS5LZXlYXSk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHsga2V5MjogdHJ1ZSB9KSwgS2V5Q29kZS5LZXlYLCAnc2Vjb25kJyk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHt9KSwgS2V5Q29kZS5LZXlaLCAnc2Vjb25kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlIGNvbW1hbmQgLSAzJywgKCkgPT4ge1xuXHRcdFx0dGVzdEtiTG9va3VwQnlDb21tYW5kKCd0aGlyZCcsIFtLZXlDb2RlLktleVhdKTtcblx0XHRcdHRlc3RSZXNvbHZlKGNyZWF0ZUNvbnRleHQoeyBrZXkzOiB0cnVlIH0pLCBLZXlDb2RlLktleVgsICd0aGlyZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gNCcsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgnZm91cnRoJywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gNScsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgnZmlmdGgnLCBbS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVksIEtleUNvZGUuS2V5WildKTtcblx0XHRcdHRlc3RSZXNvbHZlKGNyZWF0ZUNvbnRleHQoe30pLCBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WSwgS2V5Q29kZS5LZXlaKSwgJ2ZpZnRoJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlIGNvbW1hbmQgLSA2JywgKCkgPT4ge1xuXHRcdFx0dGVzdEtiTG9va3VwQnlDb21tYW5kKCdzZXZlbnRoJywgW0tleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SyldKTtcblx0XHRcdHRlc3RSZXNvbHZlKGNyZWF0ZUNvbnRleHQoe30pLCBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspLCAnc2V2ZW50aCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gNycsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgndW5jb21tZW50IGxpbmVzJywgW0tleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5VSldKTtcblx0XHRcdHRlc3RSZXNvbHZlKGNyZWF0ZUNvbnRleHQoe30pLCBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVUpLCAndW5jb21tZW50IGxpbmVzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlIGNvbW1hbmQgLSA4JywgKCkgPT4ge1xuXHRcdFx0dGVzdEtiTG9va3VwQnlDb21tYW5kKCdjb21tZW50IGxpbmVzJywgW0tleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QyldKTtcblx0XHRcdHRlc3RSZXNvbHZlKGNyZWF0ZUNvbnRleHQoe30pLCBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMpLCAnY29tbWVudCBsaW5lcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gOScsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgndW5yZWFjaGFibGVjaG9yZCcsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDEwJywgKCkgPT4ge1xuXHRcdFx0dGVzdEtiTG9va3VwQnlDb21tYW5kKCdlbGV2ZW4nLCBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUddKTtcblx0XHRcdHRlc3RSZXNvbHZlKGNyZWF0ZUNvbnRleHQoe30pLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RywgJ2VsZXZlbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gMTEnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0S2JMb29rdXBCeUNvbW1hbmQoJ3NpeHRoJywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gMTInLCAoKSA9PiB7XG5cdFx0XHR0ZXN0S2JMb29rdXBCeUNvbW1hbmQoJ2xvbmcgbXVsdGkgY2hvcmQnLCBbW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleUEsIEtleUNvZGUuS2V5Ql1dKTtcblx0XHRcdHRlc3RSZXNvbHZlKGNyZWF0ZUNvbnRleHQoe30pLCBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5QSwgS2V5Q29kZS5LZXlCXSwgJ2xvbmcgbXVsdGkgY2hvcmQnKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVtcHR5Q29udGV4dCA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXG5cdFx0dGVzdCgnS0JzIGhhdmluZyBjb21tb24gcHJlZml4IC0gdGhlIG9uZSBkZWZpbmVkIGxhdGVyIGlzIHJldHVybmVkJywgKCkgPT4ge1xuXHRcdFx0dGVzdFJlc29sdmUoZW1wdHlDb250ZXh0LCBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUIsIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDLCBLZXlDb2RlLktleUldLCAnbG9uZy1tdWx0aS1jaG9yZC0yJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0IsOEJBQTRDO0FBQ3ZFLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBUyxVQUFVO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNEO0FBQy9ELFNBQVMsb0JBQW9CLGtCQUFrQjtBQUMvQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdDQUF3QztBQUVqRCxTQUFTLGNBQWMsS0FBVTtBQUNoQyxTQUFPO0FBQUEsSUFDTixVQUFVLENBQUMsUUFBZ0I7QUFDMUIsYUFBTyxJQUFJLEdBQUc7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxzQkFBc0IsTUFBTTtBQUVqQywwQ0FBd0M7QUFFeEMsV0FBUyxPQUFPLFlBQStCLFNBQWlCLGFBQWtCLE1BQXdDLFdBQTRDO0FBQ3JLLFVBQU0scUJBQXFCLGlDQUFpQyxZQUFZLEVBQUU7QUFDMUUsV0FBTyxJQUFJO0FBQUEsTUFDVjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsV0FBUyxlQUFlLE9BQTZCO0FBQ3BELFdBQU8sMkJBQTJCLGVBQWUsS0FBSztBQUFBLEVBQ3ZEO0FBRUEs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
