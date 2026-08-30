import assert from "assert";
import * as types from "../../common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { assertDefined, isOneOf, typeCheck } from "../../common/types.js";
suite("Types", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("isFunction", () => {
    assert(!types.isFunction(void 0));
    assert(!types.isFunction(null));
    assert(!types.isFunction("foo"));
    assert(!types.isFunction(5));
    assert(!types.isFunction(true));
    assert(!types.isFunction([]));
    assert(!types.isFunction([1, 2, "3"]));
    assert(!types.isFunction({}));
    assert(!types.isFunction({ foo: "bar" }));
    assert(!types.isFunction(/test/));
    assert(!types.isFunction(new RegExp("")));
    assert(!types.isFunction(/* @__PURE__ */ new Date()));
    assert(types.isFunction(assert));
    assert(types.isFunction(function foo() {
    }));
  });
  test("areFunctions", () => {
    assert(!types.areFunctions());
    assert(!types.areFunctions(null));
    assert(!types.areFunctions("foo"));
    assert(!types.areFunctions(5));
    assert(!types.areFunctions(true));
    assert(!types.areFunctions([]));
    assert(!types.areFunctions([1, 2, "3"]));
    assert(!types.areFunctions({}));
    assert(!types.areFunctions({ foo: "bar" }));
    assert(!types.areFunctions(/test/));
    assert(!types.areFunctions(new RegExp("")));
    assert(!types.areFunctions(/* @__PURE__ */ new Date()));
    assert(!types.areFunctions(assert, ""));
    assert(types.areFunctions(assert));
    assert(types.areFunctions(assert, assert));
    assert(types.areFunctions(function foo() {
    }));
  });
  test("isObject", () => {
    assert(!types.isObject(void 0));
    assert(!types.isObject(null));
    assert(!types.isObject("foo"));
    assert(!types.isObject(5));
    assert(!types.isObject(true));
    assert(!types.isObject([]));
    assert(!types.isObject([1, 2, "3"]));
    assert(!types.isObject(/test/));
    assert(!types.isObject(new RegExp("")));
    assert(!types.isFunction(/* @__PURE__ */ new Date()));
    assert.strictEqual(types.isObject(assert), false);
    assert(!types.isObject(function foo() {
    }));
    assert(types.isObject({}));
    assert(types.isObject({ foo: "bar" }));
  });
  test("isEmptyObject", () => {
    assert(!types.isEmptyObject(void 0));
    assert(!types.isEmptyObject(null));
    assert(!types.isEmptyObject("foo"));
    assert(!types.isEmptyObject(5));
    assert(!types.isEmptyObject(true));
    assert(!types.isEmptyObject([]));
    assert(!types.isEmptyObject([1, 2, "3"]));
    assert(!types.isEmptyObject(/test/));
    assert(!types.isEmptyObject(new RegExp("")));
    assert(!types.isEmptyObject(/* @__PURE__ */ new Date()));
    assert.strictEqual(types.isEmptyObject(assert), false);
    assert(!types.isEmptyObject(function foo() {
    }));
    assert(!types.isEmptyObject({ foo: "bar" }));
    assert(types.isEmptyObject({}));
  });
  test("isString", () => {
    assert(!types.isString(void 0));
    assert(!types.isString(null));
    assert(!types.isString(5));
    assert(!types.isString([]));
    assert(!types.isString([1, 2, "3"]));
    assert(!types.isString(true));
    assert(!types.isString({}));
    assert(!types.isString(/test/));
    assert(!types.isString(new RegExp("")));
    assert(!types.isString(/* @__PURE__ */ new Date()));
    assert(!types.isString(assert));
    assert(!types.isString(function foo() {
    }));
    assert(!types.isString({ foo: "bar" }));
    assert(types.isString("foo"));
  });
  test("isStringArray", () => {
    assert(!types.isStringArray(void 0));
    assert(!types.isStringArray(null));
    assert(!types.isStringArray(5));
    assert(!types.isStringArray("foo"));
    assert(!types.isStringArray(true));
    assert(!types.isStringArray({}));
    assert(!types.isStringArray(/test/));
    assert(!types.isStringArray(new RegExp("")));
    assert(!types.isStringArray(/* @__PURE__ */ new Date()));
    assert(!types.isStringArray(assert));
    assert(!types.isStringArray(function foo() {
    }));
    assert(!types.isStringArray({ foo: "bar" }));
    assert(!types.isStringArray([1, 2, 3]));
    assert(!types.isStringArray([1, 2, "3"]));
    assert(!types.isStringArray(["foo", "bar", 5]));
    assert(!types.isStringArray(["foo", null, "bar"]));
    assert(!types.isStringArray(["foo", void 0, "bar"]));
    assert(types.isStringArray([]));
    assert(types.isStringArray(["foo"]));
    assert(types.isStringArray(["foo", "bar"]));
    assert(types.isStringArray(["foo", "bar", "baz"]));
  });
  test("isArrayOf", () => {
    assert(!types.isArrayOf(void 0, types.isString));
    assert(!types.isArrayOf(null, types.isString));
    assert(!types.isArrayOf(5, types.isString));
    assert(!types.isArrayOf("foo", types.isString));
    assert(!types.isArrayOf(true, types.isString));
    assert(!types.isArrayOf({}, types.isString));
    assert(!types.isArrayOf(/test/, types.isString));
    assert(!types.isArrayOf(new RegExp(""), types.isString));
    assert(!types.isArrayOf(/* @__PURE__ */ new Date(), types.isString));
    assert(!types.isArrayOf(assert, types.isString));
    assert(!types.isArrayOf(function foo() {
    }, types.isString));
    assert(!types.isArrayOf({ foo: "bar" }, types.isString));
    assert(!types.isArrayOf([1, 2, 3], types.isString));
    assert(!types.isArrayOf([1, 2, "3"], types.isString));
    assert(!types.isArrayOf(["foo", "bar", 5], types.isString));
    assert(!types.isArrayOf(["foo", null, "bar"], types.isString));
    assert(!types.isArrayOf(["foo", void 0, "bar"], types.isString));
    assert(types.isArrayOf([], types.isString));
    assert(types.isArrayOf(["foo"], types.isString));
    assert(types.isArrayOf(["foo", "bar"], types.isString));
    assert(types.isArrayOf(["foo", "bar", "baz"], types.isString));
    assert(types.isArrayOf([], types.isNumber));
    assert(types.isArrayOf([1], types.isNumber));
    assert(types.isArrayOf([1, 2, 3], types.isNumber));
    assert(!types.isArrayOf([1, 2, "3"], types.isNumber));
    assert(types.isArrayOf([], types.isBoolean));
    assert(types.isArrayOf([true], types.isBoolean));
    assert(types.isArrayOf([true, false, true], types.isBoolean));
    assert(!types.isArrayOf([true, 1, false], types.isBoolean));
    assert(types.isArrayOf([], types.isFunction));
    assert(types.isArrayOf([assert], types.isFunction));
    assert(types.isArrayOf([assert, function foo() {
    }], types.isFunction));
    assert(!types.isArrayOf([assert, "foo"], types.isFunction));
    const isEven = (n) => types.isNumber(n) && n % 2 === 0;
    assert(types.isArrayOf([], isEven));
    assert(types.isArrayOf([2, 4, 6], isEven));
    assert(!types.isArrayOf([2, 3, 4], isEven));
    assert(!types.isArrayOf([1, 3, 5], isEven));
  });
  test("isNumber", () => {
    assert(!types.isNumber(void 0));
    assert(!types.isNumber(null));
    assert(!types.isNumber("foo"));
    assert(!types.isNumber([]));
    assert(!types.isNumber([1, 2, "3"]));
    assert(!types.isNumber(true));
    assert(!types.isNumber({}));
    assert(!types.isNumber(/test/));
    assert(!types.isNumber(new RegExp("")));
    assert(!types.isNumber(/* @__PURE__ */ new Date()));
    assert(!types.isNumber(assert));
    assert(!types.isNumber(function foo() {
    }));
    assert(!types.isNumber({ foo: "bar" }));
    assert(!types.isNumber(parseInt("A", 10)));
    assert(types.isNumber(5));
  });
  test("isUndefined", () => {
    assert(!types.isUndefined(null));
    assert(!types.isUndefined("foo"));
    assert(!types.isUndefined([]));
    assert(!types.isUndefined([1, 2, "3"]));
    assert(!types.isUndefined(true));
    assert(!types.isUndefined({}));
    assert(!types.isUndefined(/test/));
    assert(!types.isUndefined(new RegExp("")));
    assert(!types.isUndefined(/* @__PURE__ */ new Date()));
    assert(!types.isUndefined(assert));
    assert(!types.isUndefined(function foo() {
    }));
    assert(!types.isUndefined({ foo: "bar" }));
    assert(types.isUndefined(void 0));
  });
  test("isUndefinedOrNull", () => {
    assert(!types.isUndefinedOrNull("foo"));
    assert(!types.isUndefinedOrNull([]));
    assert(!types.isUndefinedOrNull([1, 2, "3"]));
    assert(!types.isUndefinedOrNull(true));
    assert(!types.isUndefinedOrNull({}));
    assert(!types.isUndefinedOrNull(/test/));
    assert(!types.isUndefinedOrNull(new RegExp("")));
    assert(!types.isUndefinedOrNull(/* @__PURE__ */ new Date()));
    assert(!types.isUndefinedOrNull(assert));
    assert(!types.isUndefinedOrNull(function foo() {
    }));
    assert(!types.isUndefinedOrNull({ foo: "bar" }));
    assert(types.isUndefinedOrNull(void 0));
    assert(types.isUndefinedOrNull(null));
  });
  test("assertIsDefined / assertAreDefined", () => {
    assert.throws(() => types.assertReturnsDefined(void 0));
    assert.throws(() => types.assertReturnsDefined(null));
    assert.throws(() => types.assertReturnsAllDefined(null, void 0));
    assert.throws(() => types.assertReturnsAllDefined(true, void 0));
    assert.throws(() => types.assertReturnsAllDefined(void 0, false));
    assert.strictEqual(types.assertReturnsDefined(true), true);
    assert.strictEqual(types.assertReturnsDefined(false), false);
    assert.strictEqual(types.assertReturnsDefined("Hello"), "Hello");
    assert.strictEqual(types.assertReturnsDefined(""), "");
    const res = types.assertReturnsAllDefined(1, true, "Hello");
    assert.strictEqual(res[0], 1);
    assert.strictEqual(res[1], true);
    assert.strictEqual(res[2], "Hello");
  });
  suite("assertDefined", () => {
    test("should not throw if `value` is defined (bool)", async () => {
      assert.doesNotThrow(function() {
        assertDefined(true, "Oops something happened.");
      });
    });
    test("should not throw if `value` is defined (number)", async () => {
      assert.doesNotThrow(function() {
        assertDefined(5, "Oops something happened.");
      });
    });
    test("should not throw if `value` is defined (zero)", async () => {
      assert.doesNotThrow(function() {
        assertDefined(0, "Oops something happened.");
      });
    });
    test("should not throw if `value` is defined (string)", async () => {
      assert.doesNotThrow(function() {
        assertDefined("some string", "Oops something happened.");
      });
    });
    test("should not throw if `value` is defined (empty string)", async () => {
      assert.doesNotThrow(function() {
        assertDefined("", "Oops something happened.");
      });
    });
    const assertThrows = (testFunction, errorMessage) => {
      let thrownError;
      try {
        testFunction();
      } catch (e) {
        thrownError = e;
      }
      assertDefined(thrownError, "Must throw an error.");
      assert(
        thrownError instanceof Error,
        "Error must be an instance of `Error`."
      );
      assert.strictEqual(
        thrownError.message,
        errorMessage,
        "Error must have correct message."
      );
    };
    test("should throw if `value` is `null`", async () => {
      const errorMessage = "Uggh ohh!";
      assertThrows(() => {
        assertDefined(null, errorMessage);
      }, errorMessage);
    });
    test("should throw if `value` is `undefined`", async () => {
      const errorMessage = "Oh no!";
      assertThrows(() => {
        assertDefined(void 0, new Error(errorMessage));
      }, errorMessage);
    });
    test("should throw assertion error by default", async () => {
      const errorMessage = "Uggh ohh!";
      let thrownError;
      try {
        assertDefined(null, errorMessage);
      } catch (e) {
        thrownError = e;
      }
      assertDefined(thrownError, "Must throw an error.");
      assert(
        thrownError instanceof Error,
        "Error must be an instance of `Error`."
      );
      assert.strictEqual(
        thrownError.message,
        errorMessage,
        "Error must have correct message."
      );
    });
    test("should throw provided error instance", async () => {
      class TestError extends Error {
        constructor(...args) {
          super(...args);
          this.name = "TestError";
        }
      }
      const errorMessage = "Oops something hapenned.";
      const error = new TestError(errorMessage);
      let thrownError;
      try {
        assertDefined(null, error);
      } catch (e) {
        thrownError = e;
      }
      assert(
        thrownError instanceof TestError,
        "Error must be an instance of `TestError`."
      );
      assert.strictEqual(
        thrownError.message,
        errorMessage,
        "Error must have correct message."
      );
    });
  });
  suite("isOneOf", () => {
    suite("success", () => {
      suite("string", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf("foo", ["foo", "bar"]),
              "Foo must be one of: foo, bar"
            );
          });
        });
        test("subtype", () => {
          assert.doesNotThrow(() => {
            const item = "hi";
            const list = ["hi", "ciao"];
            assert(
              isOneOf(item, list),
              "Hi must be one of: hi, ciao"
            );
            typeCheck(item);
          });
        });
      });
      suite("number", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf(10, [10, 100]),
              "10 must be one of: 10, 100"
            );
          });
        });
        test("subtype", () => {
          assert.doesNotThrow(() => {
            const item = 20;
            const list = [20, 2e3];
            assert(
              isOneOf(item, list),
              "20 must be one of: 20, 2000"
            );
            typeCheck(item);
          });
        });
      });
      suite("boolean", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf(true, [true, false]),
              "true must be one of: true, false"
            );
          });
          assert.doesNotThrow(() => {
            assert(
              isOneOf(false, [true, false]),
              "false must be one of: true, false"
            );
          });
        });
        test("subtype (true)", () => {
          assert.doesNotThrow(() => {
            const item = true;
            const list = [true, true];
            assert(
              isOneOf(item, list),
              "true must be one of: true, true"
            );
            typeCheck(item);
          });
        });
        test("subtype (false)", () => {
          assert.doesNotThrow(() => {
            const item = false;
            const list = [false, true];
            assert(
              isOneOf(item, list),
              "false must be one of: false, true"
            );
            typeCheck(item);
          });
        });
      });
      suite("undefined", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf(void 0, [void 0]),
              "undefined must be one of: undefined"
            );
          });
          assert.doesNotThrow(() => {
            assert(
              isOneOf(void 0, [void 0]),
              "undefined must be one of: void 0"
            );
          });
        });
        test("subtype", () => {
          assert.doesNotThrow(() => {
            let item;
            const list = [void 0];
            assert(
              isOneOf(item, list),
              "undefined | null must be one of: undefined"
            );
            typeCheck(item);
          });
        });
      });
      suite("null", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf(null, [null]),
              "null must be one of: null"
            );
          });
        });
        test("subtype", () => {
          assert.doesNotThrow(() => {
            const item = null;
            const list = [null];
            assert(
              isOneOf(item, list),
              "null must be one of: null"
            );
            typeCheck(item);
          });
        });
      });
      suite("any", () => {
        test("item", () => {
          assert.doesNotThrow(() => {
            const item = "1";
            const list = ["2", "1"];
            assert(
              isOneOf(item, list),
              "1 must be one of: 2, 1"
            );
            typeCheck(item);
          });
        });
        test("list", () => {
          assert.doesNotThrow(() => {
            const item = "5";
            const list = ["3", "5", "2.5"];
            assert(
              isOneOf(item, list),
              "5 must be one of: 3, 5, 2.5"
            );
            typeCheck(item);
          });
        });
        test("both", () => {
          assert.doesNotThrow(() => {
            const item = "12";
            const list = ["14.25", "7", "12"];
            assert(
              isOneOf(item, list),
              "12 must be one of: 14.25, 7, 12"
            );
            typeCheck(item);
          });
        });
      });
      suite("unknown", () => {
        test("item", () => {
          assert.doesNotThrow(() => {
            const item = "1";
            const list = ["2", "1"];
            assert(
              isOneOf(item, list),
              "1 must be one of: 2, 1"
            );
            typeCheck(item);
          });
        });
        test("both", () => {
          assert.doesNotThrow(() => {
            const item = "12";
            const list = ["14.25", "7", "12"];
            assert(
              isOneOf(item, list),
              "12 must be one of: 14.25, 7, 12"
            );
            typeCheck(item);
          });
        });
      });
    });
    suite("failure", () => {
      suite("string", () => {
        test("type", () => {
          assert.throws(() => {
            const item = "baz";
            assert(
              isOneOf(item, ["foo", "bar"]),
              "Baz must not be one of: foo, bar"
            );
          });
        });
        test("subtype", () => {
          assert.throws(() => {
            const item = "vitannia";
            const list = ["hi", "ciao"];
            assert(
              isOneOf(item, list),
              "vitannia must be one of: hi, ciao"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            const item = "vitannia";
            const list = [];
            assert(
              isOneOf(item, list),
              "vitannia must be one of: empty"
            );
          });
        });
      });
      suite("number", () => {
        test("type", () => {
          assert.throws(() => {
            assert(
              isOneOf(19, [10, 100]),
              "19 must not be one of: 10, 100"
            );
          });
        });
        test("subtype", () => {
          assert.throws(() => {
            const item = 24;
            const list = [20, 2e3];
            assert(
              isOneOf(item, list),
              "24 must not be one of: 20, 2000"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            const item = 20;
            const list = [];
            assert(
              isOneOf(item, list),
              "20 must not be one of: empty"
            );
          });
        });
      });
      suite("boolean", () => {
        test("type", () => {
          assert.throws(() => {
            assert(
              isOneOf(true, [false]),
              "true must not be one of: false"
            );
          });
          assert.throws(() => {
            assert(
              isOneOf(false, [true]),
              "false must not be one of: true"
            );
          });
        });
        test("subtype (true)", () => {
          assert.throws(() => {
            const item = true;
            const list = [false];
            assert(
              isOneOf(item, list),
              "true must not be one of: false"
            );
          });
        });
        test("subtype (false)", () => {
          assert.throws(() => {
            const item = false;
            const list = [true, true, true];
            assert(
              isOneOf(item, list),
              "false must be one of: true, true, true"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            const item = true;
            const list = [];
            assert(
              isOneOf(item, list),
              "true must be one of: empty"
            );
          });
        });
      });
      suite("undefined", () => {
        test("type", () => {
          assert.throws(() => {
            assert(
              isOneOf(void 0, []),
              "undefined must not be one of: empty"
            );
          });
          assert.throws(() => {
            assert(
              isOneOf(void 0, []),
              "void 0 must not be one of: empty"
            );
          });
        });
        test("subtype", () => {
          assert.throws(() => {
            let item;
            const list = [null];
            assert(
              isOneOf(item, list),
              "undefined must be one of: null"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            let item;
            const list = [];
            assert(
              isOneOf(item, list),
              "undefined must be one of: empty"
            );
          });
        });
      });
      suite("null", () => {
        test("type", () => {
          assert.throws(() => {
            assert(
              isOneOf(null, []),
              "null must be one of: empty"
            );
          });
        });
        test("subtype", () => {
          assert.throws(() => {
            const item = null;
            const list = [];
            assert(
              isOneOf(item, list),
              "null must be one of: empty"
            );
          });
        });
      });
      suite("any", () => {
        test("item", () => {
          assert.throws(() => {
            const item = "1";
            const list = ["3", "4"];
            assert(
              isOneOf(item, list),
              "1 must not be one of: 3, 4"
            );
          });
        });
        test("list", () => {
          assert.throws(() => {
            const item = "5";
            const list = ["3", "6", "2.5"];
            assert(
              isOneOf(item, list),
              "5 must not be one of: 3, 6, 2.5"
            );
          });
        });
        test("both", () => {
          assert.throws(() => {
            const item = "12";
            const list = ["14.25", "7", "15"];
            assert(
              isOneOf(item, list),
              "12 must not be one of: 14.25, 7, 15"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            const item = "25";
            const list = [];
            assert(
              isOneOf(item, list),
              "25 must not be one of: empty"
            );
          });
        });
      });
      suite("unknown", () => {
        test("item", () => {
          assert.throws(() => {
            const item = "100";
            const list = ["12", "11"];
            assert(
              isOneOf(item, list),
              "100 must not be one of: 12, 11"
            );
          });
          test("both", () => {
            assert.throws(() => {
              const item = "21";
              const list = ["14.25", "7", "12"];
              assert(
                isOneOf(item, list),
                "21 must not be one of: 14.25, 7, 12"
              );
            });
          });
        });
      });
    });
  });
  test("validateConstraints", () => {
    types.validateConstraints([1, "test", true], [Number, String, Boolean]);
    types.validateConstraints([1, "test", true], ["number", "string", "boolean"]);
    types.validateConstraints([console.log], [Function]);
    types.validateConstraints([void 0], [types.isUndefined]);
    types.validateConstraints([1], [types.isNumber]);
    class Foo {
    }
    types.validateConstraints([new Foo()], [Foo]);
    function isFoo(f) {
    }
    assert.throws(() => types.validateConstraints([new Foo()], [isFoo]));
    function isFoo2(f) {
      return true;
    }
    types.validateConstraints([new Foo()], [isFoo2]);
    assert.throws(() => types.validateConstraints([1, true], [types.isNumber, types.isString]));
    assert.throws(() => types.validateConstraints(["2"], [types.isNumber]));
    assert.throws(() => types.validateConstraints([1, "test", true], [Number, String, Number]));
  });
  suite("hasKey", () => {
    test("should return true when object has specified key", () => {
      const obj = { a: "test" };
      assert(types.hasKey(obj, { a: true }));
      assert.strictEqual(obj.a, "test");
    });
    test("should return false when object does not have specified key", () => {
      const obj = { b: 42 };
      assert(!types.hasKey(obj, { a: true }));
    });
    test("should work with multiple keys", () => {
      const obj = { a: "test", b: 42 };
      assert(types.hasKey(obj, { a: true, b: true }));
      assert.strictEqual(obj.a, "test");
      assert.strictEqual(obj.b, 42);
    });
    test("should return false if any key is missing", () => {
      const obj = { a: "test" };
      assert(!types.hasKey(obj, { a: true, b: true }));
    });
    test("should work with empty key object", () => {
      const obj = { a: "test" };
      assert(types.hasKey(obj, {}));
    });
    test("should work with complex union types", () => {
      const objA = { kind: "a", value: "hello" };
      const objB = { kind: "b", count: 5 };
      assert(types.hasKey(objA, { value: true }));
      assert(!types.hasKey(objA, { count: true }));
      assert(!types.hasKey(objA, { items: true }));
      assert(!types.hasKey(objB, { value: true }));
      assert(types.hasKey(objB, { count: true }));
      assert(!types.hasKey(objB, { items: true }));
    });
    test("should handle objects with optional properties", () => {
      const obj1 = { a: "test", b: 42 };
      const obj2 = { a: "test" };
      assert(types.hasKey(obj1, { a: true }));
      assert(types.hasKey(obj1, { b: true }));
      assert(types.hasKey(obj2, { a: true }));
      assert(!types.hasKey(obj2, { b: true }));
    });
    test("should work with nested objects", () => {
      const obj = { data: { nested: "test" } };
      assert(types.hasKey(obj, { data: true }));
      assert(!types.hasKey(obj, { value: true }));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHR5cGVzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5pbXBvcnQgeyBhc3NlcnREZWZpbmVkLCBpc09uZU9mLCB0eXBlQ2hlY2sgfSBmcm9tICcuLi8uLi9jb21tb24vdHlwZXMuanMnO1xuXG5zdWl0ZSgnVHlwZXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXNGdW5jdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24odW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKG51bGwpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24oJ2ZvbycpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24oNSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNGdW5jdGlvbih0cnVlKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKFtdKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKFsxLCAyLCAnMyddKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKHt9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKHsgZm9vOiAnYmFyJyB9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKC90ZXN0LykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNGdW5jdGlvbihuZXcgUmVnRXhwKCcnKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNGdW5jdGlvbihuZXcgRGF0ZSgpKSk7XG5cblx0XHRhc3NlcnQodHlwZXMuaXNGdW5jdGlvbihhc3NlcnQpKTtcblx0XHRhc3NlcnQodHlwZXMuaXNGdW5jdGlvbihmdW5jdGlvbiBmb28oKSB7IC8qKi8gfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcmVGdW5jdGlvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMoKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMobnVsbCkpO1xuXHRcdGFzc2VydCghdHlwZXMuYXJlRnVuY3Rpb25zKCdmb28nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMoNSkpO1xuXHRcdGFzc2VydCghdHlwZXMuYXJlRnVuY3Rpb25zKHRydWUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmFyZUZ1bmN0aW9ucyhbXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuYXJlRnVuY3Rpb25zKFsxLCAyLCAnMyddKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMoe30pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmFyZUZ1bmN0aW9ucyh7IGZvbzogJ2JhcicgfSkpO1xuXHRcdGFzc2VydCghdHlwZXMuYXJlRnVuY3Rpb25zKC90ZXN0LykpO1xuXHRcdGFzc2VydCghdHlwZXMuYXJlRnVuY3Rpb25zKG5ldyBSZWdFeHAoJycpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMobmV3IERhdGUoKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuYXJlRnVuY3Rpb25zKGFzc2VydCwgJycpKTtcblxuXHRcdGFzc2VydCh0eXBlcy5hcmVGdW5jdGlvbnMoYXNzZXJ0KSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmFyZUZ1bmN0aW9ucyhhc3NlcnQsIGFzc2VydCkpO1xuXHRcdGFzc2VydCh0eXBlcy5hcmVGdW5jdGlvbnMoZnVuY3Rpb24gZm9vKCkgeyAvKiovIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnaXNPYmplY3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc09iamVjdCh1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzT2JqZWN0KG51bGwpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzT2JqZWN0KCdmb28nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc09iamVjdCg1KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc09iamVjdCh0cnVlKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc09iamVjdChbXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNPYmplY3QoWzEsIDIsICczJ10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzT2JqZWN0KC90ZXN0LykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNPYmplY3QobmV3IFJlZ0V4cCgnJykpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24obmV3IERhdGUoKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlcy5pc09iamVjdChhc3NlcnQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc09iamVjdChmdW5jdGlvbiBmb28oKSB7IH0pKTtcblxuXHRcdGFzc2VydCh0eXBlcy5pc09iamVjdCh7fSkpO1xuXHRcdGFzc2VydCh0eXBlcy5pc09iamVjdCh7IGZvbzogJ2JhcicgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0VtcHR5T2JqZWN0JywgKCkgPT4ge1xuXHRcdGFzc2VydCghdHlwZXMuaXNFbXB0eU9iamVjdCh1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QobnVsbCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNFbXB0eU9iamVjdCgnZm9vJykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNFbXB0eU9iamVjdCg1KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0VtcHR5T2JqZWN0KHRydWUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QoW10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QoWzEsIDIsICczJ10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QoL3Rlc3QvKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0VtcHR5T2JqZWN0KG5ldyBSZWdFeHAoJycpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0VtcHR5T2JqZWN0KG5ldyBEYXRlKCkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZXMuaXNFbXB0eU9iamVjdChhc3NlcnQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0VtcHR5T2JqZWN0KGZ1bmN0aW9uIGZvbygpIHsgLyoqLyB9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0VtcHR5T2JqZWN0KHsgZm9vOiAnYmFyJyB9KSk7XG5cblx0XHRhc3NlcnQodHlwZXMuaXNFbXB0eU9iamVjdCh7fSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1N0cmluZycsICgpID0+IHtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nKHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcobnVsbCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcoNSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcoW10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nKFsxLCAyLCAnMyddKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyh0cnVlKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyh7fSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcoL3Rlc3QvKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyhuZXcgUmVnRXhwKCcnKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcobmV3IERhdGUoKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcoYXNzZXJ0KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyhmdW5jdGlvbiBmb28oKSB7IC8qKi8gfSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcoeyBmb286ICdiYXInIH0pKTtcblxuXHRcdGFzc2VydCh0eXBlcy5pc1N0cmluZygnZm9vJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc1N0cmluZ0FycmF5JywgKCkgPT4ge1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheSh1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkobnVsbCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheSg1KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KCdmb28nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KHRydWUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkoe30pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkoL3Rlc3QvKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KG5ldyBSZWdFeHAoJycpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KG5ldyBEYXRlKCkpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkoYXNzZXJ0KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KGZ1bmN0aW9uIGZvbygpIHsgLyoqLyB9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KHsgZm9vOiAnYmFyJyB9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KFsxLCAyLCAzXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheShbMSwgMiwgJzMnXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheShbJ2ZvbycsICdiYXInLCA1XSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheShbJ2ZvbycsIG51bGwsICdiYXInXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheShbJ2ZvbycsIHVuZGVmaW5lZCwgJ2JhciddKSk7XG5cblx0XHRhc3NlcnQodHlwZXMuaXNTdHJpbmdBcnJheShbXSkpO1xuXHRcdGFzc2VydCh0eXBlcy5pc1N0cmluZ0FycmF5KFsnZm9vJ10pKTtcblx0XHRhc3NlcnQodHlwZXMuaXNTdHJpbmdBcnJheShbJ2ZvbycsICdiYXInXSkpO1xuXHRcdGFzc2VydCh0eXBlcy5pc1N0cmluZ0FycmF5KFsnZm9vJywgJ2JhcicsICdiYXonXSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0FycmF5T2YnLCAoKSA9PiB7XG5cdFx0Ly8gQmFzaWMgbm9uLWFycmF5IHZhbHVlc1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKHVuZGVmaW5lZCwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihudWxsLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKDUsIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoJ2ZvbycsIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YodHJ1ZSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZih7fSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZigvdGVzdC8sIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YobmV3IFJlZ0V4cCgnJyksIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YobmV3IERhdGUoKSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihhc3NlcnQsIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoZnVuY3Rpb24gZm9vKCkgeyAvKiovIH0sIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoeyBmb286ICdiYXInIH0sIHR5cGVzLmlzU3RyaW5nKSk7XG5cblx0XHQvLyBBcnJheXMgd2l0aCB3cm9uZyB0eXBlc1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKFsxLCAyLCAzXSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihbMSwgMiwgJzMnXSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihbJ2ZvbycsICdiYXInLCA1XSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihbJ2ZvbycsIG51bGwsICdiYXInXSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihbJ2ZvbycsIHVuZGVmaW5lZCwgJ2JhciddLCB0eXBlcy5pc1N0cmluZykpO1xuXG5cdFx0Ly8gVmFsaWQgc3RyaW5nIGFycmF5c1xuXHRcdGFzc2VydCh0eXBlcy5pc0FycmF5T2YoW10sIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbJ2ZvbyddLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCh0eXBlcy5pc0FycmF5T2YoWydmb28nLCAnYmFyJ10sIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbJ2ZvbycsICdiYXInLCAnYmF6J10sIHR5cGVzLmlzU3RyaW5nKSk7XG5cblx0XHQvLyBWYWxpZCBudW1iZXIgYXJyYXlzXG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbXSwgdHlwZXMuaXNOdW1iZXIpKTtcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFsxXSwgdHlwZXMuaXNOdW1iZXIpKTtcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFsxLCAyLCAzXSwgdHlwZXMuaXNOdW1iZXIpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihbMSwgMiwgJzMnXSwgdHlwZXMuaXNOdW1iZXIpKTtcblxuXHRcdC8vIFZhbGlkIGJvb2xlYW4gYXJyYXlzXG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbXSwgdHlwZXMuaXNCb29sZWFuKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbdHJ1ZV0sIHR5cGVzLmlzQm9vbGVhbikpO1xuXHRcdGFzc2VydCh0eXBlcy5pc0FycmF5T2YoW3RydWUsIGZhbHNlLCB0cnVlXSwgdHlwZXMuaXNCb29sZWFuKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoW3RydWUsIDEsIGZhbHNlXSwgdHlwZXMuaXNCb29sZWFuKSk7XG5cblx0XHQvLyBWYWxpZCBmdW5jdGlvbiBhcnJheXNcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFtdLCB0eXBlcy5pc0Z1bmN0aW9uKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbYXNzZXJ0XSwgdHlwZXMuaXNGdW5jdGlvbikpO1xuXHRcdGFzc2VydCh0eXBlcy5pc0FycmF5T2YoW2Fzc2VydCwgZnVuY3Rpb24gZm9vKCkgeyAvKiovIH1dLCB0eXBlcy5pc0Z1bmN0aW9uKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoW2Fzc2VydCwgJ2ZvbyddLCB0eXBlcy5pc0Z1bmN0aW9uKSk7XG5cblx0XHQvLyBDdXN0b20gdHlwZSBndWFyZFxuXHRcdGNvbnN0IGlzRXZlbiA9IChuOiB1bmtub3duKTogbiBpcyBudW1iZXIgPT4gdHlwZXMuaXNOdW1iZXIobikgJiYgbiAlIDIgPT09IDA7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbXSwgaXNFdmVuKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbMiwgNCwgNl0sIGlzRXZlbikpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKFsyLCAzLCA0XSwgaXNFdmVuKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoWzEsIDMsIDVdLCBpc0V2ZW4pKTtcblx0fSk7XG5cblx0dGVzdCgnaXNOdW1iZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc051bWJlcih1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKG51bGwpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKCdmb28nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc051bWJlcihbXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNOdW1iZXIoWzEsIDIsICczJ10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKHRydWUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKHt9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc051bWJlcigvdGVzdC8pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKG5ldyBSZWdFeHAoJycpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc051bWJlcihuZXcgRGF0ZSgpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc051bWJlcihhc3NlcnQpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKGZ1bmN0aW9uIGZvbygpIHsgLyoqLyB9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc051bWJlcih7IGZvbzogJ2JhcicgfSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNOdW1iZXIocGFyc2VJbnQoJ0EnLCAxMCkpKTtcblxuXHRcdGFzc2VydCh0eXBlcy5pc051bWJlcig1KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzVW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQobnVsbCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQoJ2ZvbycpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkKFtdKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZChbMSwgMiwgJzMnXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQodHJ1ZSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQoe30pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkKC90ZXN0LykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQobmV3IFJlZ0V4cCgnJykpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkKG5ldyBEYXRlKCkpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkKGFzc2VydCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQoZnVuY3Rpb24gZm9vKCkgeyAvKiovIH0pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkKHsgZm9vOiAnYmFyJyB9KSk7XG5cblx0XHRhc3NlcnQodHlwZXMuaXNVbmRlZmluZWQodW5kZWZpbmVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzVW5kZWZpbmVkT3JOdWxsJywgKCkgPT4ge1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwoJ2ZvbycpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKFtdKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChbMSwgMiwgJzMnXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwodHJ1ZSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwoe30pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKC90ZXN0LykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwobmV3IFJlZ0V4cCgnJykpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKG5ldyBEYXRlKCkpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKGFzc2VydCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwoZnVuY3Rpb24gZm9vKCkgeyAvKiovIH0pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKHsgZm9vOiAnYmFyJyB9KSk7XG5cblx0XHRhc3NlcnQodHlwZXMuaXNVbmRlZmluZWRPck51bGwodW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKG51bGwpKTtcblx0fSk7XG5cblx0dGVzdCgnYXNzZXJ0SXNEZWZpbmVkIC8gYXNzZXJ0QXJlRGVmaW5lZCcsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHR5cGVzLmFzc2VydFJldHVybnNEZWZpbmVkKHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdHlwZXMuYXNzZXJ0UmV0dXJuc0RlZmluZWQobnVsbCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdHlwZXMuYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQobnVsbCwgdW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy5hc3NlcnRSZXR1cm5zQWxsRGVmaW5lZCh0cnVlLCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHR5cGVzLmFzc2VydFJldHVybnNBbGxEZWZpbmVkKHVuZGVmaW5lZCwgZmFsc2UpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlcy5hc3NlcnRSZXR1cm5zRGVmaW5lZCh0cnVlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVzLmFzc2VydFJldHVybnNEZWZpbmVkKGZhbHNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlcy5hc3NlcnRSZXR1cm5zRGVmaW5lZCgnSGVsbG8nKSwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVzLmFzc2VydFJldHVybnNEZWZpbmVkKCcnKSwgJycpO1xuXG5cdFx0Y29uc3QgcmVzID0gdHlwZXMuYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQoMSwgdHJ1ZSwgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgJ0hlbGxvJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhc3NlcnREZWZpbmVkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgdGhyb3cgaWYgYHZhbHVlYCBpcyBkZWZpbmVkIChib29sKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRhc3NlcnREZWZpbmVkKHRydWUsICdPb3BzIHNvbWV0aGluZyBoYXBwZW5lZC4nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCB0aHJvdyBpZiBgdmFsdWVgIGlzIGRlZmluZWQgKG51bWJlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0YXNzZXJ0RGVmaW5lZCg1LCAnT29wcyBzb21ldGhpbmcgaGFwcGVuZWQuJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgdGhyb3cgaWYgYHZhbHVlYCBpcyBkZWZpbmVkICh6ZXJvKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRhc3NlcnREZWZpbmVkKDAsICdPb3BzIHNvbWV0aGluZyBoYXBwZW5lZC4nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCB0aHJvdyBpZiBgdmFsdWVgIGlzIGRlZmluZWQgKHN0cmluZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0YXNzZXJ0RGVmaW5lZCgnc29tZSBzdHJpbmcnLCAnT29wcyBzb21ldGhpbmcgaGFwcGVuZWQuJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgdGhyb3cgaWYgYHZhbHVlYCBpcyBkZWZpbmVkIChlbXB0eSBzdHJpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdyhmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGFzc2VydERlZmluZWQoJycsICdPb3BzIHNvbWV0aGluZyBoYXBwZW5lZC4nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0LyoqXG5cdFx0ICogTm90ZSEgQVBJIG9mIGBhc3NlcnQudGhyb3dzKClgIGlzIGRpZmZlcmVudCBpbiB0aGUgYnJvd3NlclxuXHRcdCAqIGFuZCBpbiBOb2RlLmpzLCBhbmQgaXQgaXMgbm90IHBvc3NpYmxlIHRvIHVzZSB0aGUgc2FtZSBjb2RlXG5cdFx0ICogaGVyZS4gVGhlcmVmb3JlIHdlIGhhZCB0byByZXNvcnQgdG8gdGhlIG1hbnVhbCB0cnkvY2F0Y2guXG5cdFx0ICovXG5cdFx0Y29uc3QgYXNzZXJ0VGhyb3dzID0gKFxuXHRcdFx0dGVzdEZ1bmN0aW9uOiAoKSA9PiB2b2lkLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiBzdHJpbmcsXG5cdFx0KSA9PiB7XG5cdFx0XHRsZXQgdGhyb3duRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0ZXN0RnVuY3Rpb24oKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhyb3duRXJyb3IgPSBlIGFzIEVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnREZWZpbmVkKHRocm93bkVycm9yLCAnTXVzdCB0aHJvdyBhbiBlcnJvci4nKTtcblx0XHRcdGFzc2VydChcblx0XHRcdFx0dGhyb3duRXJyb3IgaW5zdGFuY2VvZiBFcnJvcixcblx0XHRcdFx0J0Vycm9yIG11c3QgYmUgYW4gaW5zdGFuY2Ugb2YgYEVycm9yYC4nLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0aHJvd25FcnJvci5tZXNzYWdlLFxuXHRcdFx0XHRlcnJvck1lc3NhZ2UsXG5cdFx0XHRcdCdFcnJvciBtdXN0IGhhdmUgY29ycmVjdCBtZXNzYWdlLicsXG5cdFx0XHQpO1xuXHRcdH07XG5cblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgaWYgYHZhbHVlYCBpcyBgbnVsbGAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSAnVWdnaCBvaGghJztcblx0XHRcdGFzc2VydFRocm93cygoKSA9PiB7XG5cdFx0XHRcdGFzc2VydERlZmluZWQobnVsbCwgZXJyb3JNZXNzYWdlKTtcblx0XHRcdH0sIGVycm9yTWVzc2FnZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgaWYgYHZhbHVlYCBpcyBgdW5kZWZpbmVkYCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9ICdPaCBubyEnO1xuXHRcdFx0YXNzZXJ0VGhyb3dzKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0RGVmaW5lZCh1bmRlZmluZWQsIG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpKTtcblx0XHRcdH0sIGVycm9yTWVzc2FnZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgYXNzZXJ0aW9uIGVycm9yIGJ5IGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSAnVWdnaCBvaGghJztcblx0XHRcdGxldCB0aHJvd25FcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnREZWZpbmVkKG51bGwsIGVycm9yTWVzc2FnZSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRocm93bkVycm9yID0gZSBhcyBFcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0RGVmaW5lZCh0aHJvd25FcnJvciwgJ011c3QgdGhyb3cgYW4gZXJyb3IuJyk7XG5cblx0XHRcdGFzc2VydChcblx0XHRcdFx0dGhyb3duRXJyb3IgaW5zdGFuY2VvZiBFcnJvcixcblx0XHRcdFx0J0Vycm9yIG11c3QgYmUgYW4gaW5zdGFuY2Ugb2YgYEVycm9yYC4nLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0aHJvd25FcnJvci5tZXNzYWdlLFxuXHRcdFx0XHRlcnJvck1lc3NhZ2UsXG5cdFx0XHRcdCdFcnJvciBtdXN0IGhhdmUgY29ycmVjdCBtZXNzYWdlLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IHByb3ZpZGVkIGVycm9yIGluc3RhbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2xhc3MgVGVzdEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRcdFx0XHRjb25zdHJ1Y3RvciguLi5hcmdzOiBDb25zdHJ1Y3RvclBhcmFtZXRlcnM8dHlwZW9mIEVycm9yPikge1xuXHRcdFx0XHRcdHN1cGVyKC4uLmFyZ3MpO1xuXG5cdFx0XHRcdFx0dGhpcy5uYW1lID0gJ1Rlc3RFcnJvcic7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gJ09vcHMgc29tZXRoaW5nIGhhcGVubmVkLic7XG5cdFx0XHRjb25zdCBlcnJvciA9IG5ldyBUZXN0RXJyb3IoZXJyb3JNZXNzYWdlKTtcblxuXHRcdFx0bGV0IHRocm93bkVycm9yO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0RGVmaW5lZChudWxsLCBlcnJvcik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRocm93bkVycm9yID0gZTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHR0aHJvd25FcnJvciBpbnN0YW5jZW9mIFRlc3RFcnJvcixcblx0XHRcdFx0J0Vycm9yIG11c3QgYmUgYW4gaW5zdGFuY2Ugb2YgYFRlc3RFcnJvcmAuJyxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRocm93bkVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdGVycm9yTWVzc2FnZSxcblx0XHRcdFx0J0Vycm9yIG11c3QgaGF2ZSBjb3JyZWN0IG1lc3NhZ2UuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc09uZU9mJywgKCkgPT4ge1xuXHRcdHN1aXRlKCdzdWNjZXNzJywgKCkgPT4ge1xuXHRcdFx0c3VpdGUoJ3N0cmluZycsICgpID0+IHtcblx0XHRcdFx0dGVzdCgndHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZignZm9vJywgWydmb28nLCAnYmFyJ10pLFxuXHRcdFx0XHRcdFx0XHQnRm9vIG11c3QgYmUgb25lIG9mOiBmb28sIGJhcicsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdzdWJ0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogc3RyaW5nID0gJ2hpJztcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICgnaGknIHwgJ2NpYW8nIHwgJ2hvbGEnKVtdID0gWydoaScsICdjaWFvJ107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J0hpIG11c3QgYmUgb25lIG9mOiBoaSwgY2lhbycsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8J2hpJyB8ICdjaWFvJyB8ICdob2xhJz4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCdudW1iZXInLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3R5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoMTAsIFsxMCwgMTAwXSksXG5cdFx0XHRcdFx0XHRcdCcxMCBtdXN0IGJlIG9uZSBvZjogMTAsIDEwMCdcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBudW1iZXIgPSAyMDtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICgyMCB8IDIwMDApW10gPSBbMjAsIDIwMDBdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCcyMCBtdXN0IGJlIG9uZSBvZjogMjAsIDIwMDAnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPDIwIHwgMjAwMD4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ2Jvb2xlYW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3R5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YodHJ1ZSwgW3RydWUsIGZhbHNlXSksXG5cdFx0XHRcdFx0XHRcdCd0cnVlIG11c3QgYmUgb25lIG9mOiB0cnVlLCBmYWxzZSdcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihmYWxzZSwgW3RydWUsIGZhbHNlXSksXG5cdFx0XHRcdFx0XHRcdCdmYWxzZSBtdXN0IGJlIG9uZSBvZjogdHJ1ZSwgZmFsc2UnXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdzdWJ0eXBlICh0cnVlKScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IGJvb2xlYW4gPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKHRydWUpW10gPSBbdHJ1ZSwgdHJ1ZV07XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J3RydWUgbXVzdCBiZSBvbmUgb2Y6IHRydWUsIHRydWUnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPHRydWU+KGl0ZW0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdzdWJ0eXBlIChmYWxzZSknLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBib29sZWFuID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAoZmFsc2UgfCB0cnVlKVtdID0gW2ZhbHNlLCB0cnVlXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnZmFsc2UgbXVzdCBiZSBvbmUgb2Y6IGZhbHNlLCB0cnVlJyxcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdHR5cGVDaGVjazxmYWxzZT4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCd1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3R5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YodW5kZWZpbmVkLCBbdW5kZWZpbmVkXSksXG5cdFx0XHRcdFx0XHRcdCd1bmRlZmluZWQgbXVzdCBiZSBvbmUgb2Y6IHVuZGVmaW5lZCdcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZih1bmRlZmluZWQsIFt2b2lkIDBdKSxcblx0XHRcdFx0XHRcdFx0J3VuZGVmaW5lZCBtdXN0IGJlIG9uZSBvZjogdm9pZCAwJ1xuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnc3VidHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGxldCBpdGVtOiB1bmRlZmluZWQgfCBudWxsO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKHVuZGVmaW5lZClbXSA9IFt1bmRlZmluZWRdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCd1bmRlZmluZWQgfCBudWxsIG11c3QgYmUgb25lIG9mOiB1bmRlZmluZWQnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPHVuZGVmaW5lZD4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCdudWxsJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCd0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKG51bGwsIFtudWxsXSksXG5cdFx0XHRcdFx0XHRcdCdudWxsIG11c3QgYmUgb25lIG9mOiBudWxsJ1xuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnc3VidHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IHVuZGVmaW5lZCB8IG51bGwgfCBzdHJpbmcgPSBudWxsO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKG51bGwpW10gPSBbbnVsbF07XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J251bGwgbXVzdCBiZSBvbmUgb2Y6IG51bGwnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPG51bGw+KGl0ZW0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnYW55JywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCdpdGVtJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogYW55ID0gJzEnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKCcxJyB8ICcyJylbXSA9IFsnMicsICcxJ107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzEgbXVzdCBiZSBvbmUgb2Y6IDIsIDEnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPCcxJyB8ICcyJz4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2xpc3QnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiAnNScgPSAnNSc7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiBhbnlbXSA9IFsnMycsICc1JywgJzIuNSddO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCc1IG11c3QgYmUgb25lIG9mOiAzLCA1LCAyLjUnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPCc1Jz4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2JvdGgnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBhbnkgPSAnMTInO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogYW55W10gPSBbJzE0LjI1JywgJzcnLCAnMTInXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnMTIgbXVzdCBiZSBvbmUgb2Y6IDE0LjI1LCA3LCAxMicsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8YW55PihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ3Vua25vd24nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ2l0ZW0nLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiB1bmtub3duID0gJzEnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKCcxJyB8ICcyJylbXSA9IFsnMicsICcxJ107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzEgbXVzdCBiZSBvbmUgb2Y6IDIsIDEnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPCcxJyB8ICcyJz4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2JvdGgnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiB1bmtub3duID0gJzEyJztcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6IHVua25vd25bXSA9IFsnMTQuMjUnLCAnNycsICcxMiddO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCcxMiBtdXN0IGJlIG9uZSBvZjogMTQuMjUsIDcsIDEyJyxcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdHR5cGVDaGVjazx1bmtub3duPihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdmYWlsdXJlJywgKCkgPT4ge1xuXHRcdFx0c3VpdGUoJ3N0cmluZycsICgpID0+IHtcblx0XHRcdFx0dGVzdCgndHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IHN0cmluZyA9ICdiYXonO1xuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIFsnZm9vJywgJ2JhciddKSxcblx0XHRcdFx0XHRcdFx0J0JheiBtdXN0IG5vdCBiZSBvbmUgb2Y6IGZvbywgYmFyJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBzdHJpbmcgPSAndml0YW5uaWEnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKCdoaScgfCAnY2lhbycgfCAnaG9sYScpW10gPSBbJ2hpJywgJ2NpYW8nXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQndml0YW5uaWEgbXVzdCBiZSBvbmUgb2Y6IGhpLCBjaWFvJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2VtcHR5JywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogc3RyaW5nID0gJ3ZpdGFubmlhJztcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICgnaGknIHwgJ2NpYW8nIHwgJ2hvbGEnKVtdID0gW107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J3ZpdGFubmlhIG11c3QgYmUgb25lIG9mOiBlbXB0eScsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnbnVtYmVyJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCd0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKDE5LCBbMTAsIDEwMF0pLFxuXHRcdFx0XHRcdFx0XHQnMTkgbXVzdCBub3QgYmUgb25lIG9mOiAxMCwgMTAwJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBudW1iZXIgPSAyNDtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICgyMCB8IDIwMDApW10gPSBbMjAsIDIwMDBdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCcyNCBtdXN0IG5vdCBiZSBvbmUgb2Y6IDIwLCAyMDAwJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2VtcHR5JywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogbnVtYmVyID0gMjA7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAoMjAgfCAyMDAwKVtdID0gW107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzIwIG11c3Qgbm90IGJlIG9uZSBvZjogZW1wdHknLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ2Jvb2xlYW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3R5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YodHJ1ZSwgW2ZhbHNlXSksXG5cdFx0XHRcdFx0XHRcdCd0cnVlIG11c3Qgbm90IGJlIG9uZSBvZjogZmFsc2UnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGZhbHNlLCBbdHJ1ZV0pLFxuXHRcdFx0XHRcdFx0XHQnZmFsc2UgbXVzdCBub3QgYmUgb25lIG9mOiB0cnVlJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUgKHRydWUpJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogYm9vbGVhbiA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAodHJ1ZSB8IGZhbHNlKVtdID0gW2ZhbHNlXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQndHJ1ZSBtdXN0IG5vdCBiZSBvbmUgb2Y6IGZhbHNlJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUgKGZhbHNlKScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6IChmYWxzZSB8IHRydWUpW10gPSBbdHJ1ZSwgdHJ1ZSwgdHJ1ZV07XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J2ZhbHNlIG11c3QgYmUgb25lIG9mOiB0cnVlLCB0cnVlLCB0cnVlJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2VtcHR5JywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogYm9vbGVhbiA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAoZmFsc2UgfCB0cnVlKVtdID0gW107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J3RydWUgbXVzdCBiZSBvbmUgb2Y6IGVtcHR5Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCd1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3R5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YodW5kZWZpbmVkLCBbXSksXG5cdFx0XHRcdFx0XHRcdCd1bmRlZmluZWQgbXVzdCBub3QgYmUgb25lIG9mOiBlbXB0eScsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2Yodm9pZCAwLCBbXSksXG5cdFx0XHRcdFx0XHRcdCd2b2lkIDAgbXVzdCBub3QgYmUgb25lIG9mOiBlbXB0eScsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdzdWJ0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IGl0ZW06IHVuZGVmaW5lZCB8IG51bGw7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAodW5kZWZpbmVkIHwgbnVsbClbXSA9IFtudWxsXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQndW5kZWZpbmVkIG11c3QgYmUgb25lIG9mOiBudWxsJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2VtcHR5JywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IGl0ZW06IHVuZGVmaW5lZCB8IG51bGw7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAodW5kZWZpbmVkIHwgbnVsbClbXSA9IFtdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCd1bmRlZmluZWQgbXVzdCBiZSBvbmUgb2Y6IGVtcHR5Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCdudWxsJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCd0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKG51bGwsIFtdKSxcblx0XHRcdFx0XHRcdFx0J251bGwgbXVzdCBiZSBvbmUgb2Y6IGVtcHR5Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiB1bmRlZmluZWQgfCBudWxsIHwgc3RyaW5nID0gbnVsbDtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6IG51bGxbXSA9IFtdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCdudWxsIG11c3QgYmUgb25lIG9mOiBlbXB0eScsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnYW55JywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCdpdGVtJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogYW55ID0gJzEnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKCcxJyB8ICcyJyB8ICczJyB8ICc0JylbXSA9IFsnMycsICc0J107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzEgbXVzdCBub3QgYmUgb25lIG9mOiAzLCA0Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2xpc3QnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiAnNScgPSAnNSc7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiBhbnlbXSA9IFsnMycsICc2JywgJzIuNSddO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCc1IG11c3Qgbm90IGJlIG9uZSBvZjogMywgNiwgMi41Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ2JvdGgnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBhbnkgPSAnMTInO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogYW55W10gPSBbJzE0LjI1JywgJzcnLCAnMTUnXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnMTIgbXVzdCBub3QgYmUgb25lIG9mOiAxNC4yNSwgNywgMTUnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBhbnkgPSAnMjUnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogYW55W10gPSBbXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnMjUgbXVzdCBub3QgYmUgb25lIG9mOiBlbXB0eScsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgndW5rbm93bicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnaXRlbScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IHVua25vd24gPSAnMTAwJztcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICgnMTEnIHwgJzEyJylbXSA9IFsnMTInLCAnMTEnXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnMTAwIG11c3Qgbm90IGJlIG9uZSBvZjogMTIsIDExJyxcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHRlc3QoJ2JvdGgnLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogdW5rbm93biA9ICcyMSc7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6IHVua25vd25bXSA9IFsnMTQuMjUnLCAnNycsICcxMiddO1xuXG5cdFx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHRcdCcyMSBtdXN0IG5vdCBiZSBvbmUgb2Y6IDE0LjI1LCA3LCAxMicsXG5cdFx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZGF0ZUNvbnN0cmFpbnRzJywgKCkgPT4ge1xuXHRcdHR5cGVzLnZhbGlkYXRlQ29uc3RyYWludHMoWzEsICd0ZXN0JywgdHJ1ZV0sIFtOdW1iZXIsIFN0cmluZywgQm9vbGVhbl0pO1xuXHRcdHR5cGVzLnZhbGlkYXRlQ29uc3RyYWludHMoWzEsICd0ZXN0JywgdHJ1ZV0sIFsnbnVtYmVyJywgJ3N0cmluZycsICdib29sZWFuJ10pO1xuXHRcdHR5cGVzLnZhbGlkYXRlQ29uc3RyYWludHMoW2NvbnNvbGUubG9nXSwgW0Z1bmN0aW9uXSk7XG5cdFx0dHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbdW5kZWZpbmVkXSwgW3R5cGVzLmlzVW5kZWZpbmVkXSk7XG5cdFx0dHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbMV0sIFt0eXBlcy5pc051bWJlcl0pO1xuXG5cdFx0Y2xhc3MgRm9vIHsgfVxuXHRcdHR5cGVzLnZhbGlkYXRlQ29uc3RyYWludHMoW25ldyBGb28oKV0sIFtGb29dKTtcblxuXHRcdGZ1bmN0aW9uIGlzRm9vKGY6IGFueSkgeyB9XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy52YWxpZGF0ZUNvbnN0cmFpbnRzKFtuZXcgRm9vKCldLCBbaXNGb29dKSk7XG5cblx0XHRmdW5jdGlvbiBpc0ZvbzIoZjogYW55KSB7IHJldHVybiB0cnVlOyB9XG5cdFx0dHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbbmV3IEZvbygpXSwgW2lzRm9vMl0pO1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy52YWxpZGF0ZUNvbnN0cmFpbnRzKFsxLCB0cnVlXSwgW3R5cGVzLmlzTnVtYmVyLCB0eXBlcy5pc1N0cmluZ10pKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHR5cGVzLnZhbGlkYXRlQ29uc3RyYWludHMoWycyJ10sIFt0eXBlcy5pc051bWJlcl0pKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHR5cGVzLnZhbGlkYXRlQ29uc3RyYWludHMoWzEsICd0ZXN0JywgdHJ1ZV0sIFtOdW1iZXIsIFN0cmluZywgTnVtYmVyXSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnaGFzS2V5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSB3aGVuIG9iamVjdCBoYXMgc3BlY2lmaWVkIGtleScsICgpID0+IHtcblx0XHRcdHR5cGUgQSA9IHsgYTogc3RyaW5nIH07XG5cdFx0XHR0eXBlIEIgPSB7IGI6IG51bWJlciB9O1xuXHRcdFx0Y29uc3Qgb2JqOiBBIHwgQiA9IHsgYTogJ3Rlc3QnIH07XG5cblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqLCB7IGE6IHRydWUgfSkpO1xuXHRcdFx0Ly8gQWZ0ZXIgdGhpcyBjaGVjaywgVHlwZVNjcmlwdCBrbm93cyBvYmogaXMgdHlwZSBBXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2JqLmEsICd0ZXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gb2JqZWN0IGRvZXMgbm90IGhhdmUgc3BlY2lmaWVkIGtleScsICgpID0+IHtcblx0XHRcdHR5cGUgQSA9IHsgYTogc3RyaW5nIH07XG5cdFx0XHR0eXBlIEIgPSB7IGI6IG51bWJlciB9O1xuXHRcdFx0Y29uc3Qgb2JqOiBBIHwgQiA9IHsgYjogNDIgfTtcblxuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0YXNzZXJ0KCF0eXBlcy5oYXNLZXkob2JqLCB7IGE6IHRydWUgfSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHdvcmsgd2l0aCBtdWx0aXBsZSBrZXlzJywgKCkgPT4ge1xuXHRcdFx0dHlwZSBBID0geyBhOiBzdHJpbmc7IGI6IG51bWJlciB9O1xuXHRcdFx0dHlwZSBCID0geyBjOiBib29sZWFuIH07XG5cdFx0XHRjb25zdCBvYmo6IEEgfCBCID0geyBhOiAndGVzdCcsIGI6IDQyIH07XG5cblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqLCB7IGE6IHRydWUsIGI6IHRydWUgfSkpO1xuXHRcdFx0Ly8gQWZ0ZXIgdGhpcyBjaGVjaywgVHlwZVNjcmlwdCBrbm93cyBvYmogaXMgdHlwZSBBXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2JqLmEsICd0ZXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2JqLmIsIDQyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZmFsc2UgaWYgYW55IGtleSBpcyBtaXNzaW5nJywgKCkgPT4ge1xuXHRcdFx0dHlwZSBBID0geyBhOiBzdHJpbmc7IGI6IG51bWJlciB9O1xuXHRcdFx0dHlwZSBCID0geyBhOiBzdHJpbmcgfTtcblx0XHRcdGNvbnN0IG9iajogQSB8IEIgPSB7IGE6ICd0ZXN0JyB9O1xuXG5cdFx0XHRhc3NlcnQoIXR5cGVzLmhhc0tleShvYmosIHsgYTogdHJ1ZSwgYjogdHJ1ZSB9KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd29yayB3aXRoIGVtcHR5IGtleSBvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHR0eXBlIEEgPSB7IGE6IHN0cmluZyB9O1xuXHRcdFx0dHlwZSBCID0geyBiOiBudW1iZXIgfTtcblx0XHRcdGNvbnN0IG9iajogQSB8IEIgPSB7IGE6ICd0ZXN0JyB9O1xuXG5cdFx0XHQvLyBFbXB0eSBrZXkgb2JqZWN0IHNob3VsZCByZXR1cm4gdHJ1ZSAoYWxsIHplcm8ga2V5cyBleGlzdClcblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqLCB7fSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHdvcmsgd2l0aCBjb21wbGV4IHVuaW9uIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0dHlwZSBUeXBlQSA9IHsga2luZDogJ2EnOyB2YWx1ZTogc3RyaW5nIH07XG5cdFx0XHR0eXBlIFR5cGVCID0geyBraW5kOiAnYic7IGNvdW50OiBudW1iZXIgfTtcblx0XHRcdHR5cGUgVHlwZUMgPSB7IGtpbmQ6ICdjJzsgaXRlbXM6IHN0cmluZ1tdIH07XG5cblx0XHRcdGNvbnN0IG9iakE6IFR5cGVBIHwgVHlwZUIgfCBUeXBlQyA9IHsga2luZDogJ2EnLCB2YWx1ZTogJ2hlbGxvJyB9O1xuXHRcdFx0Y29uc3Qgb2JqQjogVHlwZUEgfCBUeXBlQiB8IFR5cGVDID0geyBraW5kOiAnYicsIGNvdW50OiA1IH07XG5cblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqQSwgeyB2YWx1ZTogdHJ1ZSB9KSk7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRhc3NlcnQoIXR5cGVzLmhhc0tleShvYmpBLCB7IGNvdW50OiB0cnVlIH0pKTtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdGFzc2VydCghdHlwZXMuaGFzS2V5KG9iakEsIHsgaXRlbXM6IHRydWUgfSkpO1xuXG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRhc3NlcnQoIXR5cGVzLmhhc0tleShvYmpCLCB7IHZhbHVlOiB0cnVlIH0pKTtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqQiwgeyBjb3VudDogdHJ1ZSB9KSk7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRhc3NlcnQoIXR5cGVzLmhhc0tleShvYmpCLCB7IGl0ZW1zOiB0cnVlIH0pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgb2JqZWN0cyB3aXRoIG9wdGlvbmFsIHByb3BlcnRpZXMnLCAoKSA9PiB7XG5cdFx0XHR0eXBlIEEgPSB7IGE6IHN0cmluZzsgYj86IG51bWJlciB9O1xuXHRcdFx0dHlwZSBCID0geyBjOiBib29sZWFuIH07XG5cdFx0XHRjb25zdCBvYmoxOiBBIHwgQiA9IHsgYTogJ3Rlc3QnLCBiOiA0MiB9O1xuXHRcdFx0Y29uc3Qgb2JqMjogQSB8IEIgPSB7IGE6ICd0ZXN0JyB9O1xuXG5cdFx0XHRhc3NlcnQodHlwZXMuaGFzS2V5KG9iajEsIHsgYTogdHJ1ZSB9KSk7XG5cdFx0XHRhc3NlcnQodHlwZXMuaGFzS2V5KG9iajEsIHsgYjogdHJ1ZSB9KSk7XG5cblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqMiwgeyBhOiB0cnVlIH0pKTtcblx0XHRcdGFzc2VydCghdHlwZXMuaGFzS2V5KG9iajIsIHsgYjogdHJ1ZSB9KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd29yayB3aXRoIG5lc3RlZCBvYmplY3RzJywgKCkgPT4ge1xuXHRcdFx0dHlwZSBBID0geyBkYXRhOiB7IG5lc3RlZDogc3RyaW5nIH0gfTtcblx0XHRcdHR5cGUgQiA9IHsgdmFsdWU6IG51bWJlciB9O1xuXHRcdFx0Y29uc3Qgb2JqOiBBIHwgQiA9IHsgZGF0YTogeyBuZXN0ZWQ6ICd0ZXN0JyB9IH07XG5cblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqLCB7IGRhdGE6IHRydWUgfSkpO1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0YXNzZXJ0KCF0eXBlcy5oYXNLZXkob2JqLCB7IHZhbHVlOiB0cnVlIH0pKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxlQUFlLFNBQVMsaUJBQWlCO0FBRWxELE1BQU0sU0FBUyxNQUFNO0FBRXBCLDBDQUF3QztBQUV4QyxPQUFLLGNBQWMsTUFBTTtBQUN4QixXQUFPLENBQUMsTUFBTSxXQUFXLE1BQVMsQ0FBQztBQUNuQyxXQUFPLENBQUMsTUFBTSxXQUFXLElBQUksQ0FBQztBQUM5QixXQUFPLENBQUMsTUFBTSxXQUFXLEtBQUssQ0FBQztBQUMvQixXQUFPLENBQUMsTUFBTSxXQUFXLENBQUMsQ0FBQztBQUMzQixXQUFPLENBQUMsTUFBTSxXQUFXLElBQUksQ0FBQztBQUM5QixXQUFPLENBQUMsTUFBTSxXQUFXLENBQUMsQ0FBQyxDQUFDO0FBQzVCLFdBQU8sQ0FBQyxNQUFNLFdBQVcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDckMsV0FBTyxDQUFDLE1BQU0sV0FBVyxDQUFDLENBQUMsQ0FBQztBQUM1QixXQUFPLENBQUMsTUFBTSxXQUFXLEVBQUUsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUN4QyxXQUFPLENBQUMsTUFBTSxXQUFXLE1BQU0sQ0FBQztBQUNoQyxXQUFPLENBQUMsTUFBTSxXQUFXLElBQUksT0FBTyxFQUFFLENBQUMsQ0FBQztBQUN4QyxXQUFPLENBQUMsTUFBTSxXQUFXLG9CQUFJ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R0FBRyxNQUFNLFFBQVEsQ0FBQztBQUMxRCxXQUFPLENBQUMsTUFBTSxVQUFVLENBQUMsT0FBTyxNQUFNLEtBQUssR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUM3RCxXQUFPLENBQUMsTUFBTSxVQUFVLENBQUMsT0FBTyxRQUFXLEtBQUssR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUdsRSxXQUFPLE1BQU0sVUFBVSxDQUFDLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFDMUMsV0FBTyxNQUFNLFVBQVUsQ0FBQyxLQUFLLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFDL0MsV0FBTyxNQUFNLFVBQVUsQ0FBQyxPQUFPLEtBQUssR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUN0RCxXQUFPLE1BQU0sVUFBVSxDQUFDLE9BQU8sT0FBTyxLQUFLLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFHN0QsV0FBTyxNQUFNLFVBQVUsQ0FBQyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQzFDLFdBQU8sTUFBTSxVQUFVLENBQUMsQ0FBQyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQzNDLFdBQU8sTUFBTSxVQUFVLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUNqRCxXQUFPLENBQUMsTUFBTSxVQUFVLENBQUMsR0FBRyxHQUFHLEdBQUcsR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUdwRCxXQUFPLE1BQU0sVUFBVSxDQUFDLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFDM0MsV0FBTyxNQUFNLFVBQVUsQ0FBQyxJQUFJLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFDL0MsV0FBTyxNQUFNLFVBQVUsQ0FBQyxNQUFNLE9BQU8sSUFBSSxHQUFHLE1BQU0sU0FBUyxDQUFDO0FBQzVELFdBQU8sQ0FBQyxNQUFNLFVBQVUsQ0FBQyxNQUFNLEdBQUcsS0FBSyxHQUFHLE1BQU0sU0FBUyxDQUFDO0FBRzFELFdBQU8sTUFBTSxVQUFVLENBQUMsR0FBRyxNQUFNLFVBQVUsQ0FBQztBQUM1QyxXQUFPLE1BQU0sVUFBVSxDQUFDLE1BQU0sR0FBRyxNQUFNLFVBQVUsQ0FBQztBQUNsRCxXQUFPLE1BQU0sVUFBVSxDQUFDLFFBQVEsU0FBUyxNQUFNO0FBQUEsSUFBTyxDQUFDLEdBQUcsTUFBTSxVQUFVLENBQUM7QUFDM0UsV0FBTyxDQUFDLE1BQU0sVUFBVSxDQUFDLFFBQVEsS0FBSyxHQUFHLE1BQU0sVUFBVSxDQUFDO0FBRzFELFVBQU0sU0FBUyxDQUFDLE1BQTRCLE1BQU0sU0FBUyxDQUFDLEtBQUssSUFBSSxNQUFNO0FBQzNFLFdBQU8sTUFBTSxVQUFVLENBQUMsR0FBRyxNQUFNLENBQUM7QUFDbEMsV0FBTyxNQUFNLFVBQVUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQztBQUN6QyxXQUFPLENBQUMsTUFBTSxVQUFVLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLENBQUM7QUFDMUMsV0FBTyxDQUFDLE1BQU0sVUFBVSxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUssWUFBWSxNQUFNO0FBQ3RCLFdBQU8sQ0FBQyxNQUFNLFNBQVMsTUFBUyxDQUFDO0FBQ2pDLFdBQU8sQ0FBQyxNQUFNLFNBQVMsSUFBSSxDQUFDO0FBQzVCLFdBQU8sQ0FBQyxNQUFNLFNBQVMsS0FBSyxDQUFDO0FBQzdCLFdBQU8sQ0FBQyxNQUFNLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDMUIsV0FBTyxDQUFDLE1BQU0sU0FBUyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUNuQyxXQUFPLENBQUMsTUFBTSxTQUFTLElBQUksQ0FBQztBQUM1QixXQUFPLENBQUMsTUFBTSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQzFCLFdBQU8sQ0FBQyxNQUFNLFNBQVMsTUFBTSxDQUFDO0FBQzlCLFdBQU8sQ0FBQyxNQUFNLFNBQVMsSUFBSSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQ3RDLFdBQU8sQ0FBQyxNQUFNLFNBQVMsb0JBQUksS0FBSyxDQUFDLENBQUM7QUFDbEMsV0FBTyxDQUFDLE1BQU0sU0FBUyxNQUFNLENBQUM7QUFDOUIsV0FBTyxDQUFDLE1BQU0sU0FBUyxTQUFTLE1BQU07QUFBQSxJQUFPLENBQUMsQ0FBQztBQUMvQyxXQUFPLENBQUMsTUFBTSxTQUFTLEVBQUUsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUN0QyxXQUFPLENBQUMsTUFBTSxTQUFTLFNBQVMsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUV6QyxXQUFPLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxFQUN6QixDQUFDO0FBRUQsT0FBSyxlQUFlLE1BQU07QUFDekIsV0FBTyxDQUFDLE1BQU0sWUFBWSxJQUFJLENBQUM7QUFDL0IsV0FBTyxDQUFDLE1BQU0sWUFBWSxLQUFLLENBQUM7QUFDaEMsV0FBTyxDQUFDLE1BQU0sWUFBWSxDQUFDLENBQUMsQ0FBQztBQUM3QixXQUFPLENBQUMsTUFBTSxZQUFZLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ3RDLFdBQU8sQ0FBQyxNQUFNLFlBQVksSUFBSSxDQUFDO0FBQy9CLFdBQU8sQ0FBQyxNQUFNLFlBQVksQ0FBQyxDQUFDLENBQUM7QUFDN0IsV0FBTyxDQUFDLE1BQU0sWUFBWSxNQUFNLENBQUM7QUFDakMsV0FBTyxDQUFDLE1BQU0sWUFBWSxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDekMsV0FBTyxDQUFDLE1BQU0sWUFBWSxvQkFBSSxLQUFLLENBQUMsQ0FBQztBQUNyQyxXQUFPLENBQUMsTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUNqQyxXQUFPLENBQUMsTUFBTSxZQUFZLFNBQVMsTUFBTTtBQUFBLElBQU8sQ0FBQyxDQUFDO0FBQ2xELFdBQU8sQ0FBQyxNQUFNLFlBQVksRUFBRSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBRXpDLFdBQU8sTUFBTSxZQUFZLE1BQVMsQ0FBQztBQUFBLEVBQ3BDLENBQUM7QUFFRCxPQUFLLHFCQUFxQixNQUFNO0FBQy9CLFdBQU8sQ0FBQyxNQUFNLGtCQUFrQixLQUFLLENBQUM7QUFDdEMsV0FBTyxDQUFDLE1BQU0sa0JBQWtCLENBQUMsQ0FBQyxDQUFDO0FBQ25DLFdBQU8sQ0FBQyxNQUFNLGtCQUFrQixDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUM1QyxXQUFPLENBQUMsTUFBTSxrQkFBa0IsSUFBSSxDQUFDO0FBQ3JDLFdBQU8sQ0FBQyxNQUFNLGtCQUFrQixDQUFDLENBQUMsQ0FBQztBQUNuQyxXQUFPLENBQUMsTUFBTSxrQkFBa0IsTUFBTSxDQUFDO0FBQ3ZDLFdBQU8sQ0FBQyxNQUFNLGtCQUFrQixJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDL0MsV0FBTyxDQUFDLE1BQU0sa0JBQWtCLG9CQUFJLEtBQUssQ0FBQyxDQUFDO0FBQzNDLFdBQU8sQ0FBQyxNQUFNLGtCQUFrQixNQUFNLENBQUM7QUFDdkMsV0FBTyxDQUFDLE1BQU0sa0JBQWtCLFNBQVMsTUFBTTtBQUFBLElBQU8sQ0FBQyxDQUFDO0FBQ3hELFdBQU8sQ0FBQyxNQUFNLGtCQUFrQixFQUFFLEtBQUssTUFBTSxDQUFDLENBQUM7QUFFL0MsV0FBTyxNQUFNLGtCQUFrQixNQUFTLENBQUM7QUFDekMsV0FBTyxNQUFNLGtCQUFrQixJQUFJLENBQUM7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxXQUFPLE9BQU8sTUFBTSxNQUFNLHFCQUFxQixNQUFTLENBQUM7QUFDekQsV0FBTyxPQUFPLE1BQU0sTUFBTSxxQkFBcUIsSUFBSSxDQUFDO0FBQ3BELFdBQU8sT0FBTyxNQUFNLE1BQU0sd0JBQXdCLE1BQU0sTUFBUyxDQUFDO0FBQ2xFLFdBQU8sT0FBTyxNQUFNLE1BQU0sd0JBQXdCLE1BQU0sTUFBUyxDQUFDO0FBQ2xFLFdBQU8sT0FBTyxNQUFNLE1BQU0sd0JBQXdCLFFBQVcsS0FBSyxDQUFDO0FBRW5FLFdBQU8sWUFBWSxNQUFNLHFCQUFxQixJQUFJLEdBQUcsSUFBSTtBQUN6RCxXQUFPLFlBQVksTUFBTSxxQkFBcUIsS0FBSyxHQUFHLEtBQUs7QUFDM0QsV0FBTyxZQUFZLE1BQU0scUJBQXFCLE9BQU8sR0FBRyxPQUFPO0FBQy9ELFdBQU8sWUFBWSxNQUFNLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtBQUVyRCxVQUFNLE1BQU0sTUFBTSx3QkFBd0IsR0FBRyxNQUFNLE9BQU87QUFDMUQsV0FBTyxZQUFZLElBQUksQ0FBQyxHQUFHLENBQUM7QUFDNUIsV0FBTyxZQUFZLElBQUksQ0FBQyxHQUFHLElBQUk7QUFDL0IsV0FBTyxZQUFZLElBQUksQ0FBQyxHQUFHLE9BQU87QUFBQSxFQUNuQyxDQUFDO0FBRUQsUUFBTSxpQkFBaUIsTUFBTTtBQUM1QixTQUFLLGlEQUFpRCxZQUFZO0FBQ2pFLGFBQU8sYUFBYSxXQUFZO0FBQy9CLHNCQUFjLE1BQU0sMEJBQTBCO0FBQUEsTUFDL0MsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssbURBQW1ELFlBQVk7QUFDbkUsYUFBTyxhQUFhLFdBQVk7QUFDL0Isc0JBQWMsR0FBRywwQkFBMEI7QUFBQSxNQUM1QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxpREFBaUQsWUFBWTtBQUNqRSxhQUFPLGFBQWEsV0FBWTtBQUMvQixzQkFBYyxHQUFHLDBCQUEwQjtBQUFBLE1BQzVDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG1EQUFtRCxZQUFZO0FBQ25FLGFBQU8sYUFBYSxXQUFZO0FBQy9CLHNCQUFjLGVBQWUsMEJBQTBCO0FBQUEsTUFDeEQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsseURBQXlELFlBQVk7QUFDekUsYUFBTyxhQUFhLFdBQVk7QUFDL0Isc0JBQWMsSUFBSSwwQkFBMEI7QUFBQSxNQUM3QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBT0QsVUFBTSxlQUFlLENBQ3BCLGNBQ0EsaUJBQ0k7QUFDSixVQUFJO0FBRUosVUFBSTtBQUNILHFCQUFhO0FBQUEsTUFDZCxTQUFTLEdBQUc7QUFDWCxzQkFBYztBQUFBLE1BQ2Y7QUFFQSxvQkFBYyxhQUFhLHNCQUFzQjtBQUNqRDtBQUFBLFFBQ0MsdUJBQXVCO0FBQUEsUUFDdkI7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1o7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLHFDQUFxQyxZQUFZO0FBQ3JELFlBQU0sZUFBZTtBQUNyQixtQkFBYSxNQUFNO0FBQ2xCLHNCQUFjLE1BQU0sWUFBWTtBQUFBLE1BQ2pDLEdBQUcsWUFBWTtBQUFBLElBQ2hCLENBQUM7QUFFRCxTQUFLLDBDQUEwQyxZQUFZO0FBQzFELFlBQU0sZUFBZTtBQUNyQixtQkFBYSxNQUFNO0FBQ2xCLHNCQUFjLFFBQVcsSUFBSSxNQUFNLFlBQVksQ0FBQztBQUFBLE1BQ2pELEdBQUcsWUFBWTtBQUFBLElBQ2hCLENBQUM7QUFFRCxTQUFLLDJDQUEyQyxZQUFZO0FBQzNELFlBQU0sZUFBZTtBQUNyQixVQUFJO0FBQ0osVUFBSTtBQUNILHNCQUFjLE1BQU0sWUFBWTtBQUFBLE1BQ2pDLFNBQVMsR0FBRztBQUNYLHNCQUFjO0FBQUEsTUFDZjtBQUVBLG9CQUFjLGFBQWEsc0JBQXNCO0FBRWpEO0FBQUEsUUFDQyx1QkFBdUI7QUFBQSxRQUN2QjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx3Q0FBd0MsWUFBWTtBQUFBLE1BQ3hELE1BQU0sa0JBQWtCLE1BQU07QUFBQSxRQUM3QixlQUFlLE1BQTJDO0FBQ3pELGdCQUFNLEdBQUcsSUFBSTtBQUViLGVBQUssT0FBTztBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBRUEsWUFBTSxlQUFlO0FBQ3JCLFlBQU0sUUFBUSxJQUFJLFVBQVUsWUFBWTtBQUV4QyxVQUFJO0FBQ0osVUFBSTtBQUNILHNCQUFjLE1BQU0sS0FBSztBQUFBLE1BQzFCLFNBQVMsR0FBRztBQUNYLHNCQUFjO0FBQUEsTUFDZjtBQUVBO0FBQUEsUUFDQyx1QkFBdUI7QUFBQSxRQUN2QjtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxXQUFXLE1BQU07QUFDdEIsVUFBTSxXQUFXLE1BQU07QUFDdEIsWUFBTSxVQUFVLE1BQU07QUFDckIsYUFBSyxRQUFRLE1BQU07QUFDbEIsaUJBQU8sYUFBYSxNQUFNO0FBQ3pCO0FBQUEsY0FDQyxRQUFRLE9BQU8sQ0FBQyxPQUFPLEtBQUssQ0FBQztBQUFBLGNBQzdCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUVELGFBQUssV0FBVyxNQUFNO0FBQ3JCLGlCQUFPLGFBQWEsTUFBTTtBQUN6QixrQkFBTSxPQUFlO0FBQ3JCLGtCQUFNLE9BQW1DLENBQUMsTUFBTSxNQUFNO0FBRXREO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUVBLHNCQUFrQyxJQUFJO0FBQUEsVUFDdkMsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sVUFBVSxNQUFNO0FBQ3JCLGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLGFBQWEsTUFBTTtBQUN6QjtBQUFBLGNBQ0MsUUFBUSxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUM7QUFBQSxjQUNyQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFdBQVcsTUFBTTtBQUNyQixpQkFBTyxhQUFhLE1BQU07QUFDekIsa0JBQU0sT0FBZTtBQUNyQixrQkFBTSxPQUFzQixDQUFDLElBQUksR0FBSTtBQUVyQztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFFQSxzQkFBcUIsSUFBSTtBQUFBLFVBQzFCLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUVGLENBQUM7QUFFRCxZQUFNLFdBQVcsTUFBTTtBQUN0QixhQUFLLFFBQVEsTUFBTTtBQUNsQixpQkFBTyxhQUFhLE1BQU07QUFDekI7QUFBQSxjQUNDLFFBQVEsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDO0FBQUEsY0FDM0I7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBRUQsaUJBQU8sYUFBYSxNQUFNO0FBQ3pCO0FBQUEsY0FDQyxRQUFRLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQztBQUFBLGNBQzVCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUVELGFBQUssa0JBQWtCLE1BQU07QUFDNUIsaUJBQU8sYUFBYSxNQUFNO0FBQ3pCLGtCQUFNLE9BQWdCO0FBQ3RCLGtCQUFNLE9BQWlCLENBQUMsTUFBTSxJQUFJO0FBRWxDO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUVBLHNCQUFnQixJQUFJO0FBQUEsVUFDckIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUVELGFBQUssbUJBQW1CLE1BQU07QUFDN0IsaUJBQU8sYUFBYSxNQUFNO0FBQ3pCLGtCQUFNLE9BQWdCO0FBQ3RCLGtCQUFNLE9BQXlCLENBQUMsT0FBTyxJQUFJO0FBRTNDO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUVBLHNCQUFpQixJQUFJO0FBQUEsVUFDdEIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sYUFBYSxNQUFNO0FBQ3hCLGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLGFBQWEsTUFBTTtBQUN6QjtBQUFBLGNBQ0MsUUFBUSxRQUFXLENBQUMsTUFBUyxDQUFDO0FBQUEsY0FDOUI7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBRUQsaUJBQU8sYUFBYSxNQUFNO0FBQ3pCO0FBQUEsY0FDQyxRQUFRLFFBQVcsQ0FBQyxNQUFNLENBQUM7QUFBQSxjQUMzQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFdBQVcsTUFBTTtBQUNyQixpQkFBTyxhQUFhLE1BQU07QUFDekIsZ0JBQUk7QUFDSixrQkFBTSxPQUFzQixDQUFDLE1BQVM7QUFFdEM7QUFBQSxjQUNDLFFBQVEsTUFBTSxJQUFJO0FBQUEsY0FDbEI7QUFBQSxZQUNEO0FBRUEsc0JBQXFCLElBQUk7QUFBQSxVQUMxQixDQUFDO0FBQUEsUUFDRixDQUFDO0FBQUEsTUFDRixDQUFDO0FBRUQsWUFBTSxRQUFRLE1BQU07QUFDbkIsYUFBSyxRQUFRLE1BQU07QUFDbEIsaUJBQU8sYUFBYSxNQUFNO0FBQ3pCO0FBQUEsY0FDQyxRQUFRLE1BQU0sQ0FBQyxJQUFJLENBQUM7QUFBQSxjQUNwQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFdBQVcsTUFBTTtBQUNyQixpQkFBTyxhQUFhLE1BQU07QUFDekIsa0JBQU0sT0FBa0M7QUFDeEMsa0JBQU0sT0FBaUIsQ0FBQyxJQUFJO0FBRTVCO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUVBLHNCQUFnQixJQUFJO0FBQUEsVUFDckIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sT0FBTyxNQUFNO0FBQ2xCLGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLGFBQWEsTUFBTTtBQUN6QixrQkFBTSxPQUFZO0FBQ2xCLGtCQUFNLE9BQXNCLENBQUMsS0FBSyxHQUFHO0FBRXJDO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUVBLHNCQUFxQixJQUFJO0FBQUEsVUFDMUIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUVELGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLGFBQWEsTUFBTTtBQUN6QixrQkFBTSxPQUFZO0FBQ2xCLGtCQUFNLE9BQWMsQ0FBQyxLQUFLLEtBQUssS0FBSztBQUVwQztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFFQSxzQkFBZSxJQUFJO0FBQUEsVUFDcEIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUVELGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLGFBQWEsTUFBTTtBQUN6QixrQkFBTSxPQUFZO0FBQ2xCLGtCQUFNLE9BQWMsQ0FBQyxTQUFTLEtBQUssSUFBSTtBQUV2QztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFFQSxzQkFBZSxJQUFJO0FBQUEsVUFDcEIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sV0FBVyxNQUFNO0FBQ3RCLGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLGFBQWEsTUFBTTtBQUN6QixrQkFBTSxPQUFnQjtBQUN0QixrQkFBTSxPQUFzQixDQUFDLEtBQUssR0FBRztBQUVyQztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFFQSxzQkFBcUIsSUFBSTtBQUFBLFVBQzFCLENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFFBQVEsTUFBTTtBQUNsQixpQkFBTyxhQUFhLE1BQU07QUFDekIsa0JBQU0sT0FBZ0I7QUFDdEIsa0JBQU0sT0FBa0IsQ0FBQyxTQUFTLEtBQUssSUFBSTtBQUUzQztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFFQSxzQkFBbUIsSUFBSTtBQUFBLFVBQ3hCLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLFdBQVcsTUFBTTtBQUN0QixZQUFNLFVBQVUsTUFBTTtBQUNyQixhQUFLLFFBQVEsTUFBTTtBQUNsQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBZTtBQUNyQjtBQUFBLGNBQ0MsUUFBUSxNQUFNLENBQUMsT0FBTyxLQUFLLENBQUM7QUFBQSxjQUM1QjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFdBQVcsTUFBTTtBQUNyQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBZTtBQUNyQixrQkFBTSxPQUFtQyxDQUFDLE1BQU0sTUFBTTtBQUV0RDtBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFNBQVMsTUFBTTtBQUNuQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBZTtBQUNyQixrQkFBTSxPQUFtQyxDQUFDO0FBRTFDO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sVUFBVSxNQUFNO0FBQ3JCLGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLE9BQU8sTUFBTTtBQUNuQjtBQUFBLGNBQ0MsUUFBUSxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUM7QUFBQSxjQUNyQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFdBQVcsTUFBTTtBQUNyQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBZTtBQUNyQixrQkFBTSxPQUFzQixDQUFDLElBQUksR0FBSTtBQUVyQztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFNBQVMsTUFBTTtBQUNuQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBZTtBQUNyQixrQkFBTSxPQUFzQixDQUFDO0FBRTdCO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sV0FBVyxNQUFNO0FBQ3RCLGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLE9BQU8sTUFBTTtBQUNuQjtBQUFBLGNBQ0MsUUFBUSxNQUFNLENBQUMsS0FBSyxDQUFDO0FBQUEsY0FDckI7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBRUQsaUJBQU8sT0FBTyxNQUFNO0FBQ25CO0FBQUEsY0FDQyxRQUFRLE9BQU8sQ0FBQyxJQUFJLENBQUM7QUFBQSxjQUNyQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLGtCQUFrQixNQUFNO0FBQzVCLGlCQUFPLE9BQU8sTUFBTTtBQUNuQixrQkFBTSxPQUFnQjtBQUN0QixrQkFBTSxPQUF5QixDQUFDLEtBQUs7QUFFckM7QUFBQSxjQUNDLFFBQVEsTUFBTSxJQUFJO0FBQUEsY0FDbEI7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRixDQUFDO0FBRUQsYUFBSyxtQkFBbUIsTUFBTTtBQUM3QixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBZ0I7QUFDdEIsa0JBQU0sT0FBeUIsQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUVoRDtBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFNBQVMsTUFBTTtBQUNuQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBZ0I7QUFDdEIsa0JBQU0sT0FBeUIsQ0FBQztBQUVoQztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxZQUFNLGFBQWEsTUFBTTtBQUN4QixhQUFLLFFBQVEsTUFBTTtBQUNsQixpQkFBTyxPQUFPLE1BQU07QUFDbkI7QUFBQSxjQUNDLFFBQVEsUUFBVyxDQUFDLENBQUM7QUFBQSxjQUNyQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFFRCxpQkFBTyxPQUFPLE1BQU07QUFDbkI7QUFBQSxjQUNDLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFdBQVcsTUFBTTtBQUNyQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsZ0JBQUk7QUFDSixrQkFBTSxPQUE2QixDQUFDLElBQUk7QUFFeEM7QUFBQSxjQUNDLFFBQVEsTUFBTSxJQUFJO0FBQUEsY0FDbEI7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRixDQUFDO0FBRUQsYUFBSyxTQUFTLE1BQU07QUFDbkIsaUJBQU8sT0FBTyxNQUFNO0FBQ25CLGdCQUFJO0FBQ0osa0JBQU0sT0FBNkIsQ0FBQztBQUVwQztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxZQUFNLFFBQVEsTUFBTTtBQUNuQixhQUFLLFFBQVEsTUFBTTtBQUNsQixpQkFBTyxPQUFPLE1BQU07QUFDbkI7QUFBQSxjQUNDLFFBQVEsTUFBTSxDQUFDLENBQUM7QUFBQSxjQUNoQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFdBQVcsTUFBTTtBQUNyQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBa0M7QUFDeEMsa0JBQU0sT0FBZSxDQUFDO0FBRXRCO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sT0FBTyxNQUFNO0FBQ2xCLGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLE9BQU8sTUFBTTtBQUNuQixrQkFBTSxPQUFZO0FBQ2xCLGtCQUFNLE9BQWtDLENBQUMsS0FBSyxHQUFHO0FBRWpEO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUVELGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLE9BQU8sTUFBTTtBQUNuQixrQkFBTSxPQUFZO0FBQ2xCLGtCQUFNLE9BQWMsQ0FBQyxLQUFLLEtBQUssS0FBSztBQUVwQztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLENBQUM7QUFFRCxhQUFLLFFBQVEsTUFBTTtBQUNsQixpQkFBTyxPQUFPLE1BQU07QUFDbkIsa0JBQU0sT0FBWTtBQUNsQixrQkFBTSxPQUFjLENBQUMsU0FBUyxLQUFLLElBQUk7QUFFdkM7QUFBQSxjQUNDLFFBQVEsTUFBTSxJQUFJO0FBQUEsY0FDbEI7QUFBQSxZQUNEO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRixDQUFDO0FBRUQsYUFBSyxTQUFTLE1BQU07QUFDbkIsaUJBQU8sT0FBTyxNQUFNO0FBQ25CLGtCQUFNLE9BQVk7QUFDbEIsa0JBQU0sT0FBYyxDQUFDO0FBRXJCO0FBQUEsY0FDQyxRQUFRLE1BQU0sSUFBSTtBQUFBLGNBQ2xCO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUVELFlBQU0sV0FBVyxNQUFNO0FBQ3RCLGFBQUssUUFBUSxNQUFNO0FBQ2xCLGlCQUFPLE9BQU8sTUFBTTtBQUNuQixrQkFBTSxPQUFnQjtBQUN0QixrQkFBTSxPQUF3QixDQUFDLE1BQU0sSUFBSTtBQUV6QztBQUFBLGNBQ0MsUUFBUSxNQUFNLElBQUk7QUFBQSxjQUNsQjtBQUFBLFlBQ0Q7QUFBQSxVQUVELENBQUM7QUFFRCxlQUFLLFFBQVEsTUFBTTtBQUNsQixtQkFBTyxPQUFPLE1BQU07QUFDbkIsb0JBQU0sT0FBZ0I7QUFDdEIsb0JBQU0sT0FBa0IsQ0FBQyxTQUFTLEtBQUssSUFBSTtBQUUzQztBQUFBLGdCQUNDLFFBQVEsTUFBTSxJQUFJO0FBQUEsZ0JBQ2xCO0FBQUEsY0FDRDtBQUFBLFlBRUQsQ0FBQztBQUFBLFVBQ0YsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUJBQXVCLE1BQU07QUFDakMsVUFBTSxvQkFBb0IsQ0FBQyxHQUFHLFFBQVEsSUFBSSxHQUFHLENBQUMsUUFBUSxRQUFRLE9BQU8sQ0FBQztBQUN0RSxVQUFNLG9CQUFvQixDQUFDLEdBQUcsUUFBUSxJQUFJLEdBQUcsQ0FBQyxVQUFVLFVBQVUsU0FBUyxDQUFDO0FBQzVFLFVBQU0sb0JBQW9CLENBQUMsUUFBUSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUM7QUFDbkQsVUFBTSxvQkFBb0IsQ0FBQyxNQUFTLEdBQUcsQ0FBQyxNQUFNLFdBQVcsQ0FBQztBQUMxRCxVQUFNLG9CQUFvQixDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sUUFBUSxDQUFDO0FBQUEsSUFFL0MsTUFBTSxJQUFJO0FBQUEsSUFBRTtBQUNaLFVBQU0sb0JBQW9CLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUU1QyxhQUFTLE1BQU0sR0FBUTtBQUFBLElBQUU7QUFDekIsV0FBTyxPQUFPLE1BQU0sTUFBTSxvQkFBb0IsQ0FBQyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7QUFFbkUsYUFBUyxPQUFPLEdBQVE7QUFBRSxhQUFPO0FBQUEsSUFBTTtBQUN2QyxVQUFNLG9CQUFvQixDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7QUFFL0MsV0FBTyxPQUFPLE1BQU0sTUFBTSxvQkFBb0IsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLE1BQU0sVUFBVSxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQzFGLFdBQU8sT0FBTyxNQUFNLE1BQU0sb0JBQW9CLENBQUMsR0FBRyxHQUFHLENBQUMsTUFBTSxRQUFRLENBQUMsQ0FBQztBQUN0RSxXQUFPLE9BQU8sTUFBTSxNQUFNLG9CQUFvQixDQUFDLEdBQUcsUUFBUSxJQUFJLEdBQUcsQ0FBQyxRQUFRLFFBQVEsTUFBTSxDQUFDLENBQUM7QUFBQSxFQUMzRixDQUFDO0FBRUQsUUFBTSxVQUFVLE1BQU07QUFDckIsU0FBSyxvREFBb0QsTUFBTTtBQUc5RCxZQUFNLE1BQWEsRUFBRSxHQUFHLE9BQU87QUFFL0IsYUFBTyxNQUFNLE9BQU8sS0FBSyxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFFckMsYUFBTyxZQUFZLElBQUksR0FBRyxNQUFNO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssK0RBQStELE1BQU07QUFHekUsWUFBTSxNQUFhLEVBQUUsR0FBRyxHQUFHO0FBRzNCLGFBQU8sQ0FBQyxNQUFNLE9BQU8sS0FBSyxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFBQSxJQUN2QyxDQUFDO0FBRUQsU0FBSyxrQ0FBa0MsTUFBTTtBQUc1QyxZQUFNLE1BQWEsRUFBRSxHQUFHLFFBQVEsR0FBRyxHQUFHO0FBRXRDLGFBQU8sTUFBTSxPQUFPLEtBQUssRUFBRSxHQUFHLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQztBQUU5QyxhQUFPLFlBQVksSUFBSSxHQUFHLE1BQU07QUFDaEMsYUFBTyxZQUFZLElBQUksR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUVELFNBQUssNkNBQTZDLE1BQU07QUFHdkQsWUFBTSxNQUFhLEVBQUUsR0FBRyxPQUFPO0FBRS9CLGFBQU8sQ0FBQyxNQUFNLE9BQU8sS0FBSyxFQUFFLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUsscUNBQXFDLE1BQU07QUFHL0MsWUFBTSxNQUFhLEVBQUUsR0FBRyxPQUFPO0FBRy9CLGFBQU8sTUFBTSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUM3QixDQUFDO0FBRUQsU0FBSyx3Q0FBd0MsTUFBTTtBQUtsRCxZQUFNLE9BQThCLEVBQUUsTUFBTSxLQUFLLE9BQU8sUUFBUTtBQUNoRSxZQUFNLE9BQThCLEVBQUUsTUFBTSxLQUFLLE9BQU8sRUFBRTtBQUUxRCxhQUFPLE1BQU0sT0FBTyxNQUFNLEVBQUUsT0FBTyxLQUFLLENBQUMsQ0FBQztBQUUxQyxhQUFPLENBQUMsTUFBTSxPQUFPLE1BQU0sRUFBRSxPQUFPLEtBQUssQ0FBQyxDQUFDO0FBRTNDLGFBQU8sQ0FBQyxNQUFNLE9BQU8sTUFBTSxFQUFFLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFHM0MsYUFBTyxDQUFDLE1BQU0sT0FBTyxNQUFNLEVBQUUsT0FBTyxLQUFLLENBQUMsQ0FBQztBQUUzQyxhQUFPLE1BQU0sT0FBTyxNQUFNLEVBQUUsT0FBTyxLQUFLLENBQUMsQ0FBQztBQUUxQyxhQUFPLENBQUMsTUFBTSxPQUFPLE1BQU0sRUFBRSxPQUFPLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDNUMsQ0FBQztBQUVELFNBQUssa0RBQWtELE1BQU07QUFHNUQsWUFBTSxPQUFjLEVBQUUsR0FBRyxRQUFRLEdBQUcsR0FBRztBQUN2QyxZQUFNLE9BQWMsRUFBRSxHQUFHLE9BQU87QUFFaEMsYUFBTyxNQUFNLE9BQU8sTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFDdEMsYUFBTyxNQUFNLE9BQU8sTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFFdEMsYUFBTyxNQUFNLE9BQU8sTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFDdEMsYUFBTyxDQUFDLE1BQU0sT0FBTyxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQztBQUFBLElBQ3hDLENBQUM7QUFFRCxTQUFLLG1DQUFtQyxNQUFNO0FBRzdDLFlBQU0sTUFBYSxFQUFFLE1BQU0sRUFBRSxRQUFRLE9BQU8sRUFBRTtBQUU5QyxhQUFPLE1BQU0sT0FBTyxLQUFLLEVBQUUsTUFBTSxLQUFLLENBQUMsQ0FBQztBQUV4QyxhQUFPLENBQUMsTUFBTSxPQUFPLEtBQUssRUFBRSxPQUFPLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
