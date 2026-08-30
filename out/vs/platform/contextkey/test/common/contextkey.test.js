import assert from "assert";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ContextKeyExpr, implies } from "../../common/contextkey.js";
function createContext(ctx) {
  return {
    getValue: (key) => {
      return ctx[key];
    }
  };
}
suite("ContextKeyExpr", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("ContextKeyExpr.equals", () => {
    const a = ContextKeyExpr.and(
      ContextKeyExpr.has("a1"),
      ContextKeyExpr.and(ContextKeyExpr.has("and.a")),
      ContextKeyExpr.has("a2"),
      ContextKeyExpr.regex("d3", /d.*/),
      ContextKeyExpr.regex("d4", /\*\*3*/),
      ContextKeyExpr.equals("b1", "bb1"),
      ContextKeyExpr.equals("b2", "bb2"),
      ContextKeyExpr.notEquals("c1", "cc1"),
      ContextKeyExpr.notEquals("c2", "cc2"),
      ContextKeyExpr.not("d1"),
      ContextKeyExpr.not("d2")
    );
    const b = ContextKeyExpr.and(
      ContextKeyExpr.equals("b2", "bb2"),
      ContextKeyExpr.notEquals("c1", "cc1"),
      ContextKeyExpr.not("d1"),
      ContextKeyExpr.regex("d4", /\*\*3*/),
      ContextKeyExpr.notEquals("c2", "cc2"),
      ContextKeyExpr.has("a2"),
      ContextKeyExpr.equals("b1", "bb1"),
      ContextKeyExpr.regex("d3", /d.*/),
      ContextKeyExpr.has("a1"),
      ContextKeyExpr.and(ContextKeyExpr.equals("and.a", true)),
      ContextKeyExpr.not("d2")
    );
    assert(a.equals(b), "expressions should be equal");
  });
  test("issue #134942: Equals in comparator expressions", () => {
    function testEquals(expr, str) {
      const deserialized = ContextKeyExpr.deserialize(str);
      assert.ok(expr);
      assert.ok(deserialized);
      assert.strictEqual(expr.equals(deserialized), true, str);
    }
    testEquals(ContextKeyExpr.greater("value", 0), "value > 0");
    testEquals(ContextKeyExpr.greaterEquals("value", 0), "value >= 0");
    testEquals(ContextKeyExpr.smaller("value", 0), "value < 0");
    testEquals(ContextKeyExpr.smallerEquals("value", 0), "value <= 0");
  });
  test("normalize", () => {
    const key1IsTrue = ContextKeyExpr.equals("key1", true);
    const key1IsNotFalse = ContextKeyExpr.notEquals("key1", false);
    const key1IsFalse = ContextKeyExpr.equals("key1", false);
    const key1IsNotTrue = ContextKeyExpr.notEquals("key1", true);
    assert.ok(key1IsTrue.equals(ContextKeyExpr.has("key1")));
    assert.ok(key1IsNotFalse.equals(ContextKeyExpr.has("key1")));
    assert.ok(key1IsFalse.equals(ContextKeyExpr.not("key1")));
    assert.ok(key1IsNotTrue.equals(ContextKeyExpr.not("key1")));
  });
  test("evaluate", () => {
    const context = createContext({
      "a": true,
      "b": false,
      "c": "5",
      "d": "d"
    });
    function testExpression(expr, expected) {
      const rules = ContextKeyExpr.deserialize(expr);
      assert.strictEqual(rules.evaluate(context), expected, expr);
    }
    function testBatch(expr, value) {
      testExpression(expr, !!value);
      testExpression(expr + " == true", !!value);
      testExpression(expr + " != true", !value);
      testExpression(expr + " == false", !value);
      testExpression(expr + " != false", !!value);
      testExpression(expr + " == 5", value == "5");
      testExpression(expr + " != 5", value != "5");
      testExpression("!" + expr, !value);
      testExpression(expr + " =~ /d.*/", /d.*/.test(value));
      testExpression(expr + " =~ /D/i", /D/i.test(value));
    }
    testBatch("a", true);
    testBatch("b", false);
    testBatch("c", "5");
    testBatch("d", "d");
    testBatch("z", void 0);
    testExpression("true", true);
    testExpression("false", false);
    testExpression("a && !b", true);
    testExpression("a && b", false);
    testExpression("a && !b && c == 5", true);
    testExpression("d =~ /e.*/", false);
    testExpression("b && a || a", true);
    testExpression("a || b", true);
    testExpression("b || b", false);
    testExpression("b && a || a && b", false);
  });
  test("negate", () => {
    function testNegate(expr, expected) {
      const actual = ContextKeyExpr.deserialize(expr).negate().serialize();
      assert.strictEqual(actual, expected);
    }
    testNegate("true", "false");
    testNegate("false", "true");
    testNegate("a", "!a");
    testNegate("a && b || c", "!a && !c || !b && !c");
    testNegate("a && b || c || d", "!a && !c && !d || !b && !c && !d");
    testNegate("!a && !b || !c && !d", "a && c || a && d || b && c || b && d");
    testNegate("!a && !b || !c && !d || !e && !f", "a && c && e || a && c && f || a && d && e || a && d && f || b && c && e || b && c && f || b && d && e || b && d && f");
  });
  test("false, true", () => {
    function testNormalize(expr, expected) {
      const actual = ContextKeyExpr.deserialize(expr).serialize();
      assert.strictEqual(actual, expected);
    }
    testNormalize("true", "true");
    testNormalize("!true", "false");
    testNormalize("false", "false");
    testNormalize("!false", "true");
    testNormalize("a && true", "a");
    testNormalize("a && false", "false");
    testNormalize("a || true", "true");
    testNormalize("a || false", "a");
    testNormalize("isMac", isMacintosh ? "true" : "false");
    testNormalize("isLinux", isLinux ? "true" : "false");
    testNormalize("isWindows", isWindows ? "true" : "false");
  });
  test("issue #101015: distribute OR", () => {
    function t(expr1, expr2, expected) {
      const e1 = ContextKeyExpr.deserialize(expr1);
      const e2 = ContextKeyExpr.deserialize(expr2);
      const actual = ContextKeyExpr.and(e1, e2)?.serialize();
      assert.strictEqual(actual, expected);
    }
    t("a", "b", "a && b");
    t("a || b", "c", "a && c || b && c");
    t("a || b", "c || d", "a && c || a && d || b && c || b && d");
    t("a || b", "c && d", "a && c && d || b && c && d");
    t("a || b", "c && d || e", "a && e || b && e || a && c && d || b && c && d");
  });
  test("ContextKeyInExpr", () => {
    const ainb = ContextKeyExpr.deserialize("a in b");
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3, "b": [3, 2, 1] })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3, "b": [1, 2, 3] })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3, "b": [1, 2] })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3 })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3, "b": null })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": ["x"] })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": ["y"] })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": {} })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": { "x": false } })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": { "x": true } })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "prototype", "b": {} })), false);
    if (isWindows) {
      assert.strictEqual(ainb.evaluate(createContext({ "a": "file:///c%3A/Users/path/file.ts", "b": ["file:///c%3A/users/path/file.ts"] })), true);
      assert.strictEqual(ainb.evaluate(createContext({ "a": "file:///c%3A/users/path/file.ts", "b": ["file:///c%3A/Users/path/file.ts"] })), true);
      assert.strictEqual(ainb.evaluate(createContext({ "a": "file:///c%3A/Users/path/file.ts", "b": { "file:///c%3A/users/path/file.ts": true } })), true);
      assert.strictEqual(ainb.evaluate(createContext({ "a": "git:/path/File.ts", "b": ["git:/path/file.ts"] })), false);
      assert.strictEqual(ainb.evaluate(createContext({ "a": "file:///c%3A/Users/path/file.ts", "b": ["file:///c%3A/Users/path/file.ts"] })), true);
    }
  });
  test("ContextKeyNotInExpr", () => {
    const aNotInB = ContextKeyExpr.deserialize("a not in b");
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3, "b": [3, 2, 1] })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3, "b": [1, 2, 3] })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3, "b": [1, 2] })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3 })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3, "b": null })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": ["x"] })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": ["y"] })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": {} })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": { "x": false } })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": { "x": true } })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "prototype", "b": {} })), true);
    if (isWindows) {
      assert.strictEqual(aNotInB.evaluate(createContext({ "a": "file:///c%3A/Users/path/file.ts", "b": ["file:///c%3A/users/path/file.ts"] })), false);
      assert.strictEqual(aNotInB.evaluate(createContext({ "a": "file:///c%3A/users/path/file.ts", "b": ["file:///c%3A/Users/path/file.ts"] })), false);
      assert.strictEqual(aNotInB.evaluate(createContext({ "a": "git:/path/File.ts", "b": ["git:/path/file.ts"] })), true);
    }
  });
  test("issue #106524: distributing AND should normalize", () => {
    const actual = ContextKeyExpr.and(
      ContextKeyExpr.or(
        ContextKeyExpr.has("a"),
        ContextKeyExpr.has("b")
      ),
      ContextKeyExpr.has("c")
    );
    const expected = ContextKeyExpr.or(
      ContextKeyExpr.and(
        ContextKeyExpr.has("a"),
        ContextKeyExpr.has("c")
      ),
      ContextKeyExpr.and(
        ContextKeyExpr.has("b"),
        ContextKeyExpr.has("c")
      )
    );
    assert.strictEqual(actual.equals(expected), true);
  });
  test("issue #129625: Removes duplicated terms in OR expressions", () => {
    const expr = ContextKeyExpr.or(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.has("B"),
      ContextKeyExpr.has("A")
    );
    assert.strictEqual(expr.serialize(), "A || B");
  });
  test("Resolves true constant OR expressions", () => {
    const expr = ContextKeyExpr.or(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.not("A")
    );
    assert.strictEqual(expr.serialize(), "true");
  });
  test("Resolves false constant AND expressions", () => {
    const expr = ContextKeyExpr.and(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.not("A")
    );
    assert.strictEqual(expr.serialize(), "false");
  });
  test("issue #129625: Removes duplicated terms in AND expressions", () => {
    const expr = ContextKeyExpr.and(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.has("B"),
      ContextKeyExpr.has("A")
    );
    assert.strictEqual(expr.serialize(), "A && B");
  });
  test("issue #129625: Remove duplicated terms when negating", () => {
    const expr = ContextKeyExpr.and(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.or(
        ContextKeyExpr.has("B1"),
        ContextKeyExpr.has("B2")
      )
    );
    assert.strictEqual(expr.serialize(), "A && B1 || A && B2");
    assert.strictEqual(expr.negate().serialize(), "!A || !A && !B1 || !A && !B2 || !B1 && !B2");
    assert.strictEqual(expr.negate().negate().serialize(), "A && B1 || A && B2");
    assert.strictEqual(expr.negate().negate().negate().serialize(), "!A || !A && !B1 || !A && !B2 || !B1 && !B2");
  });
  test("issue #129625: remove redundant terms in OR expressions", () => {
    function strImplies(p0, q0) {
      const p = ContextKeyExpr.deserialize(p0);
      const q = ContextKeyExpr.deserialize(q0);
      return implies(p, q);
    }
    assert.strictEqual(strImplies("a && b", "a"), true);
    assert.strictEqual(strImplies("a", "a && b"), false);
  });
  test("implies", () => {
    function strImplies(p0, q0) {
      const p = ContextKeyExpr.deserialize(p0);
      const q = ContextKeyExpr.deserialize(q0);
      return implies(p, q);
    }
    assert.strictEqual(strImplies("a", "a"), true);
    assert.strictEqual(strImplies("a", "a || b"), true);
    assert.strictEqual(strImplies("a", "a && b"), false);
    assert.strictEqual(strImplies("a", "a && b || a && c"), false);
    assert.strictEqual(strImplies("a && b", "a"), true);
    assert.strictEqual(strImplies("a && b", "b"), true);
    assert.strictEqual(strImplies("a && b", "a && b || c"), true);
    assert.strictEqual(strImplies("a || b", "a || c"), false);
    assert.strictEqual(strImplies("a || b", "a || b"), true);
    assert.strictEqual(strImplies("a && b", "a && b"), true);
    assert.strictEqual(strImplies("a || b", "a || b || c"), true);
    assert.strictEqual(strImplies("c && a && b", "c && a"), true);
  });
  test("Greater, GreaterEquals, Smaller, SmallerEquals evaluate", () => {
    function checkEvaluate(expr, ctx, expected) {
      const _expr = ContextKeyExpr.deserialize(expr);
      assert.strictEqual(_expr.evaluate(createContext(ctx)), expected);
    }
    checkEvaluate("a > 1", {}, false);
    checkEvaluate("a > 1", { a: 0 }, false);
    checkEvaluate("a > 1", { a: 1 }, false);
    checkEvaluate("a > 1", { a: 2 }, true);
    checkEvaluate("a > 1", { a: "0" }, false);
    checkEvaluate("a > 1", { a: "1" }, false);
    checkEvaluate("a > 1", { a: "2" }, true);
    checkEvaluate("a > 1", { a: "a" }, false);
    checkEvaluate("a > 10", { a: 2 }, false);
    checkEvaluate("a > 10", { a: 11 }, true);
    checkEvaluate("a > 10", { a: "11" }, true);
    checkEvaluate("a > 10", { a: "2" }, false);
    checkEvaluate("a > 10", { a: "11" }, true);
    checkEvaluate("a > 1.1", { a: 1 }, false);
    checkEvaluate("a > 1.1", { a: 2 }, true);
    checkEvaluate("a > 1.1", { a: 11 }, true);
    checkEvaluate("a > 1.1", { a: "1.1" }, false);
    checkEvaluate("a > 1.1", { a: "2" }, true);
    checkEvaluate("a > 1.1", { a: "11" }, true);
    checkEvaluate("a > b", { a: "b" }, false);
    checkEvaluate("a > b", { a: "c" }, false);
    checkEvaluate("a > b", { a: 1e3 }, false);
    checkEvaluate("a >= 2", { a: "1" }, false);
    checkEvaluate("a >= 2", { a: "2" }, true);
    checkEvaluate("a >= 2", { a: "3" }, true);
    checkEvaluate("a < 2", { a: "1" }, true);
    checkEvaluate("a < 2", { a: "2" }, false);
    checkEvaluate("a < 2", { a: "3" }, false);
    checkEvaluate("a <= 2", { a: "1" }, true);
    checkEvaluate("a <= 2", { a: "2" }, true);
    checkEvaluate("a <= 2", { a: "3" }, false);
  });
  test("Greater, GreaterEquals, Smaller, SmallerEquals negate", () => {
    function checkNegate(expr, expected) {
      const a = ContextKeyExpr.deserialize(expr);
      const b = a.negate();
      assert.strictEqual(b.serialize(), expected);
    }
    checkNegate("a > 1", "a <= 1");
    checkNegate("a > 1.1", "a <= 1.1");
    checkNegate("a > b", "a <= b");
    checkNegate("a >= 1", "a < 1");
    checkNegate("a >= 1.1", "a < 1.1");
    checkNegate("a >= b", "a < b");
    checkNegate("a < 1", "a >= 1");
    checkNegate("a < 1.1", "a >= 1.1");
    checkNegate("a < b", "a >= b");
    checkNegate("a <= 1", "a > 1");
    checkNegate("a <= 1.1", "a > 1.1");
    checkNegate("a <= b", "a > b");
  });
  test("issue #111899: context keys can use `<` or `>` ", () => {
    const actual = ContextKeyExpr.deserialize("editorTextFocus && vim.active && vim.use<C-r>");
    assert.ok(actual.equals(
      ContextKeyExpr.and(
        ContextKeyExpr.has("editorTextFocus"),
        ContextKeyExpr.has("vim.active"),
        ContextKeyExpr.has("vim.use<C-r>")
      )
    ));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29udGV4dGtleVxcdGVzdFxcY29tbW9uXFxjb250ZXh0a2V5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBpbXBsaWVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnRleHRrZXkuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVDb250ZXh0KGN0eDogYW55KSB7XG5cdHJldHVybiB7XG5cdFx0Z2V0VmFsdWU6IChrZXk6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuIGN0eFtrZXldO1xuXHRcdH1cblx0fTtcbn1cblxuc3VpdGUoJ0NvbnRleHRLZXlFeHByJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0NvbnRleHRLZXlFeHByLmVxdWFscycsICgpID0+IHtcblx0XHRjb25zdCBhID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdhMScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnYW5kLmEnKSksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2EyJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5yZWdleCgnZDMnLCAvZC4qLyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5yZWdleCgnZDQnLCAvXFwqXFwqMyovKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnYjEnLCAnYmIxJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2IyJywgJ2JiMicpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjMScsICdjYzEnKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnYzInLCAnY2MyJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoJ2QxJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoJ2QyJylcblx0XHQpITtcblx0XHRjb25zdCBiID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdiMicsICdiYjInKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnYzEnLCAnY2MxJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoJ2QxJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5yZWdleCgnZDQnLCAvXFwqXFwqMyovKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnYzInLCAnY2MyJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2EyJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2IxJywgJ2JiMScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIucmVnZXgoJ2QzJywgL2QuKi8pLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdhMScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnYW5kLmEnLCB0cnVlKSksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoJ2QyJylcblx0XHQpITtcblx0XHRhc3NlcnQoYS5lcXVhbHMoYiksICdleHByZXNzaW9ucyBzaG91bGQgYmUgZXF1YWwnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEzNDk0MjogRXF1YWxzIGluIGNvbXBhcmF0b3IgZXhwcmVzc2lvbnMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdGVzdEVxdWFscyhleHByOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCwgc3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGRlc2VyaWFsaXplZCA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHN0cik7XG5cdFx0XHRhc3NlcnQub2soZXhwcik7XG5cdFx0XHRhc3NlcnQub2soZGVzZXJpYWxpemVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHByLmVxdWFscyhkZXNlcmlhbGl6ZWQpLCB0cnVlLCBzdHIpO1xuXHRcdH1cblx0XHR0ZXN0RXF1YWxzKENvbnRleHRLZXlFeHByLmdyZWF0ZXIoJ3ZhbHVlJywgMCksICd2YWx1ZSA+IDAnKTtcblx0XHR0ZXN0RXF1YWxzKENvbnRleHRLZXlFeHByLmdyZWF0ZXJFcXVhbHMoJ3ZhbHVlJywgMCksICd2YWx1ZSA+PSAwJyk7XG5cdFx0dGVzdEVxdWFscyhDb250ZXh0S2V5RXhwci5zbWFsbGVyKCd2YWx1ZScsIDApLCAndmFsdWUgPCAwJyk7XG5cdFx0dGVzdEVxdWFscyhDb250ZXh0S2V5RXhwci5zbWFsbGVyRXF1YWxzKCd2YWx1ZScsIDApLCAndmFsdWUgPD0gMCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdub3JtYWxpemUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qga2V5MUlzVHJ1ZSA9IENvbnRleHRLZXlFeHByLmVxdWFscygna2V5MScsIHRydWUpO1xuXHRcdGNvbnN0IGtleTFJc05vdEZhbHNlID0gQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdrZXkxJywgZmFsc2UpO1xuXHRcdGNvbnN0IGtleTFJc0ZhbHNlID0gQ29udGV4dEtleUV4cHIuZXF1YWxzKCdrZXkxJywgZmFsc2UpO1xuXHRcdGNvbnN0IGtleTFJc05vdFRydWUgPSBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2tleTEnLCB0cnVlKTtcblxuXHRcdGFzc2VydC5vayhrZXkxSXNUcnVlLmVxdWFscyhDb250ZXh0S2V5RXhwci5oYXMoJ2tleTEnKSkpO1xuXHRcdGFzc2VydC5vayhrZXkxSXNOb3RGYWxzZS5lcXVhbHMoQ29udGV4dEtleUV4cHIuaGFzKCdrZXkxJykpKTtcblx0XHRhc3NlcnQub2soa2V5MUlzRmFsc2UuZXF1YWxzKENvbnRleHRLZXlFeHByLm5vdCgna2V5MScpKSk7XG5cdFx0YXNzZXJ0Lm9rKGtleTFJc05vdFRydWUuZXF1YWxzKENvbnRleHRLZXlFeHByLm5vdCgna2V5MScpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2YWx1YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdCdhJzogdHJ1ZSxcblx0XHRcdCdiJzogZmFsc2UsXG5cdFx0XHQnYyc6ICc1Jyxcblx0XHRcdCdkJzogJ2QnXG5cdFx0fSk7XG5cdFx0ZnVuY3Rpb24gdGVzdEV4cHJlc3Npb24oZXhwcjogc3RyaW5nLCBleHBlY3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coZXhwciArICcgJyArIGV4cGVjdGVkKTtcblx0XHRcdGNvbnN0IHJ1bGVzID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZXhwcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVsZXMhLmV2YWx1YXRlKGNvbnRleHQpLCBleHBlY3RlZCwgZXhwcik7XG5cdFx0fVxuXHRcdGZ1bmN0aW9uIHRlc3RCYXRjaChleHByOiBzdHJpbmcsIHZhbHVlOiBhbnkpOiB2b2lkIHtcblx0XHRcdC8qIGVzbGludC1kaXNhYmxlIGVxZXFlcSAqL1xuXHRcdFx0dGVzdEV4cHJlc3Npb24oZXhwciwgISF2YWx1ZSk7XG5cdFx0XHR0ZXN0RXhwcmVzc2lvbihleHByICsgJyA9PSB0cnVlJywgISF2YWx1ZSk7XG5cdFx0XHR0ZXN0RXhwcmVzc2lvbihleHByICsgJyAhPSB0cnVlJywgIXZhbHVlKTtcblx0XHRcdHRlc3RFeHByZXNzaW9uKGV4cHIgKyAnID09IGZhbHNlJywgIXZhbHVlKTtcblx0XHRcdHRlc3RFeHByZXNzaW9uKGV4cHIgKyAnICE9IGZhbHNlJywgISF2YWx1ZSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHRlc3RFeHByZXNzaW9uKGV4cHIgKyAnID09IDUnLCB2YWx1ZSA9PSA8YW55Pic1Jyk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHRlc3RFeHByZXNzaW9uKGV4cHIgKyAnICE9IDUnLCB2YWx1ZSAhPSA8YW55Pic1Jyk7XG5cdFx0XHR0ZXN0RXhwcmVzc2lvbignIScgKyBleHByLCAhdmFsdWUpO1xuXHRcdFx0dGVzdEV4cHJlc3Npb24oZXhwciArICcgPX4gL2QuKi8nLCAvZC4qLy50ZXN0KHZhbHVlKSk7XG5cdFx0XHR0ZXN0RXhwcmVzc2lvbihleHByICsgJyA9fiAvRC9pJywgL0QvaS50ZXN0KHZhbHVlKSk7XG5cdFx0XHQvKiBlc2xpbnQtZW5hYmxlIGVxZXFlcSAqL1xuXHRcdH1cblxuXHRcdHRlc3RCYXRjaCgnYScsIHRydWUpO1xuXHRcdHRlc3RCYXRjaCgnYicsIGZhbHNlKTtcblx0XHR0ZXN0QmF0Y2goJ2MnLCAnNScpO1xuXHRcdHRlc3RCYXRjaCgnZCcsICdkJyk7XG5cdFx0dGVzdEJhdGNoKCd6JywgdW5kZWZpbmVkKTtcblxuXHRcdHRlc3RFeHByZXNzaW9uKCd0cnVlJywgdHJ1ZSk7XG5cdFx0dGVzdEV4cHJlc3Npb24oJ2ZhbHNlJywgZmFsc2UpO1xuXHRcdHRlc3RFeHByZXNzaW9uKCdhICYmICFiJywgdHJ1ZSAmJiAhZmFsc2UpO1xuXHRcdHRlc3RFeHByZXNzaW9uKCdhICYmIGInLCB0cnVlICYmIGZhbHNlKTtcblx0XHR0ZXN0RXhwcmVzc2lvbignYSAmJiAhYiAmJiBjID09IDUnLCB0cnVlICYmICFmYWxzZSAmJiAnNScgPT09ICc1Jyk7XG5cdFx0dGVzdEV4cHJlc3Npb24oJ2QgPX4gL2UuKi8nLCBmYWxzZSk7XG5cblx0XHQvLyBwcmVjZWRlbmNlIHRlc3Q6IGZhbHNlICYmIHRydWUgfHwgdHJ1ZSA9PT0gdHJ1ZSBiZWNhdXNlICYmIGlzIGV2YWx1YXRlZCBmaXJzdFxuXHRcdHRlc3RFeHByZXNzaW9uKCdiICYmIGEgfHwgYScsIHRydWUpO1xuXG5cdFx0dGVzdEV4cHJlc3Npb24oJ2EgfHwgYicsIHRydWUpO1xuXHRcdHRlc3RFeHByZXNzaW9uKCdiIHx8IGInLCBmYWxzZSk7XG5cdFx0dGVzdEV4cHJlc3Npb24oJ2IgJiYgYSB8fCBhICYmIGInLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25lZ2F0ZScsICgpID0+IHtcblx0XHRmdW5jdGlvbiB0ZXN0TmVnYXRlKGV4cHI6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZXhwcikhLm5lZ2F0ZSgpLnNlcmlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdH1cblx0XHR0ZXN0TmVnYXRlKCd0cnVlJywgJ2ZhbHNlJyk7XG5cdFx0dGVzdE5lZ2F0ZSgnZmFsc2UnLCAndHJ1ZScpO1xuXHRcdHRlc3ROZWdhdGUoJ2EnLCAnIWEnKTtcblx0XHR0ZXN0TmVnYXRlKCdhICYmIGIgfHwgYycsICchYSAmJiAhYyB8fCAhYiAmJiAhYycpO1xuXHRcdHRlc3ROZWdhdGUoJ2EgJiYgYiB8fCBjIHx8IGQnLCAnIWEgJiYgIWMgJiYgIWQgfHwgIWIgJiYgIWMgJiYgIWQnKTtcblx0XHR0ZXN0TmVnYXRlKCchYSAmJiAhYiB8fCAhYyAmJiAhZCcsICdhICYmIGMgfHwgYSAmJiBkIHx8IGIgJiYgYyB8fCBiICYmIGQnKTtcblx0XHR0ZXN0TmVnYXRlKCchYSAmJiAhYiB8fCAhYyAmJiAhZCB8fCAhZSAmJiAhZicsICdhICYmIGMgJiYgZSB8fCBhICYmIGMgJiYgZiB8fCBhICYmIGQgJiYgZSB8fCBhICYmIGQgJiYgZiB8fCBiICYmIGMgJiYgZSB8fCBiICYmIGMgJiYgZiB8fCBiICYmIGQgJiYgZSB8fCBiICYmIGQgJiYgZicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxzZSwgdHJ1ZScsICgpID0+IHtcblx0XHRmdW5jdGlvbiB0ZXN0Tm9ybWFsaXplKGV4cHI6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZXhwcikhLnNlcmlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdH1cblx0XHR0ZXN0Tm9ybWFsaXplKCd0cnVlJywgJ3RydWUnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCchdHJ1ZScsICdmYWxzZScpO1xuXHRcdHRlc3ROb3JtYWxpemUoJ2ZhbHNlJywgJ2ZhbHNlJyk7XG5cdFx0dGVzdE5vcm1hbGl6ZSgnIWZhbHNlJywgJ3RydWUnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCdhICYmIHRydWUnLCAnYScpO1xuXHRcdHRlc3ROb3JtYWxpemUoJ2EgJiYgZmFsc2UnLCAnZmFsc2UnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCdhIHx8IHRydWUnLCAndHJ1ZScpO1xuXHRcdHRlc3ROb3JtYWxpemUoJ2EgfHwgZmFsc2UnLCAnYScpO1xuXHRcdHRlc3ROb3JtYWxpemUoJ2lzTWFjJywgaXNNYWNpbnRvc2ggPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCdpc0xpbnV4JywgaXNMaW51eCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdHRlc3ROb3JtYWxpemUoJ2lzV2luZG93cycsIGlzV2luZG93cyA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTAxMDE1OiBkaXN0cmlidXRlIE9SJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHQoZXhwcjE6IHN0cmluZywgZXhwcjI6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0Y29uc3QgZTEgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShleHByMSk7XG5cdFx0XHRjb25zdCBlMiA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGV4cHIyKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IENvbnRleHRLZXlFeHByLmFuZChlMSwgZTIpPy5zZXJpYWxpemUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHR9XG5cdFx0dCgnYScsICdiJywgJ2EgJiYgYicpO1xuXHRcdHQoJ2EgfHwgYicsICdjJywgJ2EgJiYgYyB8fCBiICYmIGMnKTtcblx0XHR0KCdhIHx8IGInLCAnYyB8fCBkJywgJ2EgJiYgYyB8fCBhICYmIGQgfHwgYiAmJiBjIHx8IGIgJiYgZCcpO1xuXHRcdHQoJ2EgfHwgYicsICdjICYmIGQnLCAnYSAmJiBjICYmIGQgfHwgYiAmJiBjICYmIGQnKTtcblx0XHR0KCdhIHx8IGInLCAnYyAmJiBkIHx8IGUnLCAnYSAmJiBlIHx8IGIgJiYgZSB8fCBhICYmIGMgJiYgZCB8fCBiICYmIGMgJiYgZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb250ZXh0S2V5SW5FeHByJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFpbmIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSgnYSBpbiBiJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6IDMsICdiJzogWzMsIDIsIDFdIH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogMywgJ2InOiBbMSwgMiwgM10gfSkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzLCAnYic6IFsxLCAyXSB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6IDMsICdiJzogbnVsbCB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAneCcsICdiJzogWyd4J10gfSkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAneCcsICdiJzogWyd5J10gfSkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ3gnLCAnYic6IHt9IH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICd4JywgJ2InOiB7ICd4JzogZmFsc2UgfSB9KSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICd4JywgJ2InOiB7ICd4JzogdHJ1ZSB9IH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ3Byb3RvdHlwZScsICdiJzoge30gfSkpLCBmYWxzZSk7XG5cblx0XHQvLyBmaWxlIFVSSSBjYXNlLWluc2Vuc2l0aXZlIGNvbXBhcmlzb24gb24gV2luZG93c1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdC8vIEFycmF5IHNvdXJjZTogZmlsZSBVUklzIHdpdGggZGlmZmVyZW50IGNhc2luZyBzaG91bGQgbWF0Y2ggb24gV2luZG93c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ2ZpbGU6Ly8vYyUzQS9Vc2Vycy9wYXRoL2ZpbGUudHMnLCAnYic6IFsnZmlsZTovLy9jJTNBL3VzZXJzL3BhdGgvZmlsZS50cyddIH0pKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAnZmlsZTovLy9jJTNBL3VzZXJzL3BhdGgvZmlsZS50cycsICdiJzogWydmaWxlOi8vL2MlM0EvVXNlcnMvcGF0aC9maWxlLnRzJ10gfSkpLCB0cnVlKTtcblx0XHRcdC8vIE9iamVjdCBzb3VyY2U6IGZpbGUgVVJJcyB3aXRoIGRpZmZlcmVudCBjYXNpbmcgc2hvdWxkIG1hdGNoIG9uIFdpbmRvd3Ncblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdmaWxlOi8vL2MlM0EvVXNlcnMvcGF0aC9maWxlLnRzJywgJ2InOiB7ICdmaWxlOi8vL2MlM0EvdXNlcnMvcGF0aC9maWxlLnRzJzogdHJ1ZSB9IH0pKSwgdHJ1ZSk7XG5cdFx0XHQvLyBOb24tZmlsZSBVUklzIHNob3VsZCBzdGlsbCBiZSBjYXNlLXNlbnNpdGl2ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ2dpdDovcGF0aC9GaWxlLnRzJywgJ2InOiBbJ2dpdDovcGF0aC9maWxlLnRzJ10gfSkpLCBmYWxzZSk7XG5cdFx0XHQvLyBFeGFjdCBtYXRjaCBzdGlsbCB3b3Jrc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ2ZpbGU6Ly8vYyUzQS9Vc2Vycy9wYXRoL2ZpbGUudHMnLCAnYic6IFsnZmlsZTovLy9jJTNBL1VzZXJzL3BhdGgvZmlsZS50cyddIH0pKSwgdHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdDb250ZXh0S2V5Tm90SW5FeHByJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFOb3RJbkIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSgnYSBub3QgaW4gYicpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzLCAnYic6IFszLCAyLCAxXSB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzLCAnYic6IFsxLCAyLCAzXSB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzLCAnYic6IFsxLCAyXSB9KSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6IDMgfSkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzLCAnYic6IG51bGwgfSkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAneCcsICdiJzogWyd4J10gfSkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFOb3RJbkIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ3gnLCAnYic6IFsneSddIH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFOb3RJbkIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ3gnLCAnYic6IHt9IH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFOb3RJbkIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ3gnLCAnYic6IHsgJ3gnOiBmYWxzZSB9IH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICd4JywgJ2InOiB7ICd4JzogdHJ1ZSB9IH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdwcm90b3R5cGUnLCAnYic6IHt9IH0pKSwgdHJ1ZSk7XG5cblx0XHQvLyBmaWxlIFVSSSBjYXNlLWluc2Vuc2l0aXZlIGNvbXBhcmlzb24gb24gV2luZG93c1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdmaWxlOi8vL2MlM0EvVXNlcnMvcGF0aC9maWxlLnRzJywgJ2InOiBbJ2ZpbGU6Ly8vYyUzQS91c2Vycy9wYXRoL2ZpbGUudHMnXSB9KSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdmaWxlOi8vL2MlM0EvdXNlcnMvcGF0aC9maWxlLnRzJywgJ2InOiBbJ2ZpbGU6Ly8vYyUzQS9Vc2Vycy9wYXRoL2ZpbGUudHMnXSB9KSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdnaXQ6L3BhdGgvRmlsZS50cycsICdiJzogWydnaXQ6L3BhdGgvZmlsZS50cyddIH0pKSwgdHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTA2NTI0OiBkaXN0cmlidXRpbmcgQU5EIHNob3VsZCBub3JtYWxpemUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnYScpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2InKVxuXHRcdFx0KSxcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnYycpXG5cdFx0KTtcblx0XHRjb25zdCBleHBlY3RlZCA9IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2EnKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdjJylcblx0XHRcdCksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnYicpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2MnKVxuXHRcdFx0KVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCEuZXF1YWxzKGV4cGVjdGVkISksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTI5NjI1OiBSZW1vdmVzIGR1cGxpY2F0ZWQgdGVybXMgaW4gT1IgZXhwcmVzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdBJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ0InKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnQScpXG5cdFx0KSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cHIuc2VyaWFsaXplKCksICdBIHx8IEInKTtcblx0fSk7XG5cblx0dGVzdCgnUmVzb2x2ZXMgdHJ1ZSBjb25zdGFudCBPUiBleHByZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ0EnKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm5vdCgnQScpXG5cdFx0KSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cHIuc2VyaWFsaXplKCksICd0cnVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Jlc29sdmVzIGZhbHNlIGNvbnN0YW50IEFORCBleHByZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdBJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoJ0EnKVxuXHRcdCkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHByLnNlcmlhbGl6ZSgpLCAnZmFsc2UnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyOTYyNTogUmVtb3ZlcyBkdXBsaWNhdGVkIHRlcm1zIGluIEFORCBleHByZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdBJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ0InKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnQScpXG5cdFx0KSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cHIuc2VyaWFsaXplKCksICdBICYmIEInKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyOTYyNTogUmVtb3ZlIGR1cGxpY2F0ZWQgdGVybXMgd2hlbiBuZWdhdGluZycsICgpID0+IHtcblx0XHRjb25zdCBleHByID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdBJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdCMScpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ0IyJyksXG5cdFx0XHQpXG5cdFx0KSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cHIuc2VyaWFsaXplKCksICdBICYmIEIxIHx8IEEgJiYgQjInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwci5uZWdhdGUoKSEuc2VyaWFsaXplKCksICchQSB8fCAhQSAmJiAhQjEgfHwgIUEgJiYgIUIyIHx8ICFCMSAmJiAhQjInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwci5uZWdhdGUoKSEubmVnYXRlKCkhLnNlcmlhbGl6ZSgpLCAnQSAmJiBCMSB8fCBBICYmIEIyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cHIubmVnYXRlKCkhLm5lZ2F0ZSgpIS5uZWdhdGUoKSEuc2VyaWFsaXplKCksICchQSB8fCAhQSAmJiAhQjEgfHwgIUEgJiYgIUIyIHx8ICFCMSAmJiAhQjInKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyOTYyNTogcmVtb3ZlIHJlZHVuZGFudCB0ZXJtcyBpbiBPUiBleHByZXNzaW9ucycsICgpID0+IHtcblx0XHRmdW5jdGlvbiBzdHJJbXBsaWVzKHAwOiBzdHJpbmcsIHEwOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdGNvbnN0IHAgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShwMCkhO1xuXHRcdFx0Y29uc3QgcSA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHEwKSE7XG5cdFx0XHRyZXR1cm4gaW1wbGllcyhwLCBxKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckltcGxpZXMoJ2EgJiYgYicsICdhJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhJywgJ2EgJiYgYicpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ltcGxpZXMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gc3RySW1wbGllcyhwMDogc3RyaW5nLCBxMDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0XHRjb25zdCBwID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUocDApITtcblx0XHRcdGNvbnN0IHEgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShxMCkhO1xuXHRcdFx0cmV0dXJuIGltcGxpZXMocCwgcSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhJywgJ2EnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckltcGxpZXMoJ2EnLCAnYSB8fCBiJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhJywgJ2EgJiYgYicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckltcGxpZXMoJ2EnLCAnYSAmJiBiIHx8IGEgJiYgYycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckltcGxpZXMoJ2EgJiYgYicsICdhJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhICYmIGInLCAnYicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYSAmJiBiJywgJ2EgJiYgYiB8fCBjJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhIHx8IGInLCAnYSB8fCBjJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYSB8fCBiJywgJ2EgfHwgYicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYSAmJiBiJywgJ2EgJiYgYicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYSB8fCBiJywgJ2EgfHwgYiB8fCBjJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdjICYmIGEgJiYgYicsICdjICYmIGEnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0dyZWF0ZXIsIEdyZWF0ZXJFcXVhbHMsIFNtYWxsZXIsIFNtYWxsZXJFcXVhbHMgZXZhbHVhdGUnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY2hlY2tFdmFsdWF0ZShleHByOiBzdHJpbmcsIGN0eDogYW55LCBleHBlY3RlZDogYW55KTogdm9pZCB7XG5cdFx0XHRjb25zdCBfZXhwciA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGV4cHIpITtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChfZXhwci5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KGN0eCkpLCBleHBlY3RlZCk7XG5cdFx0fVxuXG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEnLCB7fSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxJywgeyBhOiAwIH0sIGZhbHNlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMScsIHsgYTogMSB9LCBmYWxzZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEnLCB7IGE6IDIgfSwgdHJ1ZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEnLCB7IGE6ICcwJyB9LCBmYWxzZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEnLCB7IGE6ICcxJyB9LCBmYWxzZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEnLCB7IGE6ICcyJyB9LCB0cnVlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMScsIHsgYTogJ2EnIH0sIGZhbHNlKTtcblxuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxMCcsIHsgYTogMiB9LCBmYWxzZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEwJywgeyBhOiAxMSB9LCB0cnVlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMTAnLCB7IGE6ICcxMScgfSwgdHJ1ZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEwJywgeyBhOiAnMicgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxMCcsIHsgYTogJzExJyB9LCB0cnVlKTtcblxuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxLjEnLCB7IGE6IDEgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxLjEnLCB7IGE6IDIgfSwgdHJ1ZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEuMScsIHsgYTogMTEgfSwgdHJ1ZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEuMScsIHsgYTogJzEuMScgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxLjEnLCB7IGE6ICcyJyB9LCB0cnVlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMS4xJywgeyBhOiAnMTEnIH0sIHRydWUpO1xuXG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IGInLCB7IGE6ICdiJyB9LCBmYWxzZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IGInLCB7IGE6ICdjJyB9LCBmYWxzZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IGInLCB7IGE6IDEwMDAgfSwgZmFsc2UpO1xuXG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+PSAyJywgeyBhOiAnMScgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPj0gMicsIHsgYTogJzInIH0sIHRydWUpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPj0gMicsIHsgYTogJzMnIH0sIHRydWUpO1xuXG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA8IDInLCB7IGE6ICcxJyB9LCB0cnVlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhIDwgMicsIHsgYTogJzInIH0sIGZhbHNlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhIDwgMicsIHsgYTogJzMnIH0sIGZhbHNlKTtcblxuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPD0gMicsIHsgYTogJzEnIH0sIHRydWUpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPD0gMicsIHsgYTogJzInIH0sIHRydWUpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPD0gMicsIHsgYTogJzMnIH0sIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnR3JlYXRlciwgR3JlYXRlckVxdWFscywgU21hbGxlciwgU21hbGxlckVxdWFscyBuZWdhdGUnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY2hlY2tOZWdhdGUoZXhwcjogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRjb25zdCBhID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZXhwcikhO1xuXHRcdFx0Y29uc3QgYiA9IGEubmVnYXRlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5zZXJpYWxpemUoKSwgZXhwZWN0ZWQpO1xuXHRcdH1cblxuXHRcdGNoZWNrTmVnYXRlKCdhID4gMScsICdhIDw9IDEnKTtcblx0XHRjaGVja05lZ2F0ZSgnYSA+IDEuMScsICdhIDw9IDEuMScpO1xuXHRcdGNoZWNrTmVnYXRlKCdhID4gYicsICdhIDw9IGInKTtcblxuXHRcdGNoZWNrTmVnYXRlKCdhID49IDEnLCAnYSA8IDEnKTtcblx0XHRjaGVja05lZ2F0ZSgnYSA+PSAxLjEnLCAnYSA8IDEuMScpO1xuXHRcdGNoZWNrTmVnYXRlKCdhID49IGInLCAnYSA8IGInKTtcblxuXHRcdGNoZWNrTmVnYXRlKCdhIDwgMScsICdhID49IDEnKTtcblx0XHRjaGVja05lZ2F0ZSgnYSA8IDEuMScsICdhID49IDEuMScpO1xuXHRcdGNoZWNrTmVnYXRlKCdhIDwgYicsICdhID49IGInKTtcblxuXHRcdGNoZWNrTmVnYXRlKCdhIDw9IDEnLCAnYSA+IDEnKTtcblx0XHRjaGVja05lZ2F0ZSgnYSA8PSAxLjEnLCAnYSA+IDEuMScpO1xuXHRcdGNoZWNrTmVnYXRlKCdhIDw9IGInLCAnYSA+IGInKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExMTg5OTogY29udGV4dCBrZXlzIGNhbiB1c2UgYDxgIG9yIGA+YCAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoJ2VkaXRvclRleHRGb2N1cyAmJiB2aW0uYWN0aXZlICYmIHZpbS51c2U8Qy1yPicpITtcblx0XHRhc3NlcnQub2soYWN0dWFsLmVxdWFscyhcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdlZGl0b3JUZXh0Rm9jdXMnKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCd2aW0uYWN0aXZlJyksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygndmltLnVzZTxDLXI+JyksXG5cdFx0XHQpIVxuXHRcdCkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhLGlCQUFpQjtBQUNoRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFzQyxlQUFlO0FBRTlELFNBQVMsY0FBYyxLQUFVO0FBQ2hDLFNBQU87QUFBQSxJQUNOLFVBQVUsQ0FBQyxRQUFnQjtBQUMxQixhQUFPLElBQUksR0FBRztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLGtCQUFrQixNQUFNO0FBRTdCLDBDQUF3QztBQUV4QyxPQUFLLHlCQUF5QixNQUFNO0FBQ25DLFVBQU0sSUFBSSxlQUFlO0FBQUEsTUFDeEIsZUFBZSxJQUFJLElBQUk7QUFBQSxNQUN2QixlQUFlLElBQUksZUFBZSxJQUFJLE9BQU8sQ0FBQztBQUFBLE1BQzlDLGVBQWUsSUFBSSxJQUFJO0FBQUEsTUFDdkIsZUFBZSxNQUFNLE1BQU0sS0FBSztBQUFBLE1BQ2hDLGVBQWUsTUFBTSxNQUFNLFFB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QUFFLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFFeEMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsRUFBRSxHQUFHLEtBQUs7QUFDdkMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsR0FBRyxHQUFHLElBQUk7QUFDdkMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFDekMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDekMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFFekMsa0JBQWMsV0FBVyxFQUFFLEdBQUcsRUFBRSxHQUFHLEtBQUs7QUFDeEMsa0JBQWMsV0FBVyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUk7QUFDdkMsa0JBQWMsV0FBVyxFQUFFLEdBQUcsR0FBRyxHQUFHLElBQUk7QUFDeEMsa0JBQWMsV0FBVyxFQUFFLEdBQUcsTUFBTSxHQUFHLEtBQUs7QUFDNUMsa0JBQWMsV0FBVyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFDekMsa0JBQWMsV0FBVyxFQUFFLEdBQUcsS0FBSyxHQUFHLElBQUk7QUFFMUMsa0JBQWMsU0FBUyxFQUFFLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDeEMsa0JBQWMsU0FBUyxFQUFFLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDeEMsa0JBQWMsU0FBUyxFQUFFLEdBQUcsSUFBSyxHQUFHLEtBQUs7QUFFekMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDekMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFDeEMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFFeEMsa0JBQWMsU0FBUyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFDdkMsa0JBQWMsU0FBUyxFQUFFLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDeEMsa0JBQWMsU0FBUyxFQUFFLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFFeEMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFDeEMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFDeEMsa0JBQWMsVUFBVSxFQUFFLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFBQSxFQUMxQyxDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxhQUFTLFlBQVksTUFBYyxVQUF3QjtBQUMxRCxZQUFNLElBQUksZUFBZSxZQUFZLElBQUk7QUFDekMsWUFBTSxJQUFJLEVBQUUsT0FBTztBQUNuQixhQUFPLFlBQVksRUFBRSxVQUFVLEdBQUcsUUFBUTtBQUFBLElBQzNDO0FBRUEsZ0JBQVksU0FBUyxRQUFRO0FBQzdCLGdCQUFZLFdBQVcsVUFBVTtBQUNqQyxnQkFBWSxTQUFTLFFBQVE7QUFFN0IsZ0JBQVksVUFBVSxPQUFPO0FBQzdCLGdCQUFZLFlBQVksU0FBUztBQUNqQyxnQkFBWSxVQUFVLE9BQU87QUFFN0IsZ0JBQVksU0FBUyxRQUFRO0FBQzdCLGdCQUFZLFdBQVcsVUFBVTtBQUNqQyxnQkFBWSxTQUFTLFFBQVE7QUFFN0IsZ0JBQVksVUFBVSxPQUFPO0FBQzdCLGdCQUFZLFlBQVksU0FBUztBQUNqQyxnQkFBWSxVQUFVLE9BQU87QUFBQSxFQUM5QixDQUFDO0FBRUQsT0FBSyxtREFBbUQsTUFBTTtBQUM3RCxVQUFNLFNBQVMsZUFBZSxZQUFZLCtDQUErQztBQUN6RixXQUFPLEdBQUcsT0FBTztBQUFBLE1BQ2hCLGVBQWU7QUFBQSxRQUNkLGVBQWUsSUFBSSxpQkFBaUI7QUFBQSxRQUNwQyxlQUFlLElBQUksWUFBWTtBQUFBLFFBQy9CLGVBQWUsSUFBSSxjQUFjO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
