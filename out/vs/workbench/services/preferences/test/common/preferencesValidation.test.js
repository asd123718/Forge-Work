import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { createValidator, getInvalidTypeError } from "../../common/preferencesValidation.js";
suite("Preferences Validation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class Tester {
    constructor(settings) {
      this.settings = settings;
      this.validator = createValidator(settings);
    }
    accepts(input) {
      assert.strictEqual(this.validator(input), "", `Expected ${JSON.stringify(this.settings)} to accept \`${JSON.stringify(input)}\`. Got ${this.validator(input)}.`);
    }
    rejects(input) {
      assert.notStrictEqual(this.validator(input), "", `Expected ${JSON.stringify(this.settings)} to reject \`${JSON.stringify(input)}\`.`);
      return {
        withMessage: (message) => {
          const actual = this.validator(input);
          assert.ok(actual);
          assert(
            actual.indexOf(message) > -1,
            `Expected error of ${JSON.stringify(this.settings)} on \`${input}\` to contain ${message}. Got ${this.validator(input)}.`
          );
        }
      };
    }
    validatesNumeric() {
      this.accepts("3");
      this.accepts("3.");
      this.accepts(".0");
      this.accepts("3.0");
      this.accepts(" 3.0");
      this.accepts(" 3.0  ");
      this.rejects("3f");
      this.accepts(3);
      this.rejects("test");
    }
    validatesNullableNumeric() {
      this.validatesNumeric();
      this.accepts(0);
      this.accepts("");
      this.accepts(null);
      this.accepts(void 0);
    }
    validatesNonNullableNumeric() {
      this.validatesNumeric();
      this.accepts(0);
      this.rejects("");
      this.rejects(null);
      this.rejects(void 0);
    }
    validatesString() {
      this.accepts("3");
      this.accepts("3.");
      this.accepts(".0");
      this.accepts("3.0");
      this.accepts(" 3.0");
      this.accepts(" 3.0  ");
      this.accepts("");
      this.accepts("3f");
      this.accepts("hello");
      this.rejects(6);
    }
  }
  test("exclusive max and max work together properly", () => {
    {
      const justMax = new Tester({ maximum: 5, type: "number" });
      justMax.validatesNonNullableNumeric();
      justMax.rejects("5.1");
      justMax.accepts("5.0");
    }
    {
      const justEMax = new Tester({ exclusiveMaximum: 5, type: "number" });
      justEMax.validatesNonNullableNumeric();
      justEMax.rejects("5.1");
      justEMax.rejects("5.0");
      justEMax.accepts("4.999");
    }
    {
      const bothNumeric = new Tester({ exclusiveMaximum: 5, maximum: 4, type: "number" });
      bothNumeric.validatesNonNullableNumeric();
      bothNumeric.rejects("5.1");
      bothNumeric.rejects("5.0");
      bothNumeric.rejects("4.999");
      bothNumeric.accepts("4");
    }
    {
      const bothNumeric = new Tester({ exclusiveMaximum: 5, maximum: 6, type: "number" });
      bothNumeric.validatesNonNullableNumeric();
      bothNumeric.rejects("5.1");
      bothNumeric.rejects("5.0");
      bothNumeric.accepts("4.999");
    }
  });
  test("exclusive min and min work together properly", () => {
    {
      const justMin = new Tester({ minimum: -5, type: "number" });
      justMin.validatesNonNullableNumeric();
      justMin.rejects("-5.1");
      justMin.accepts("-5.0");
    }
    {
      const justEMin = new Tester({ exclusiveMinimum: -5, type: "number" });
      justEMin.validatesNonNullableNumeric();
      justEMin.rejects("-5.1");
      justEMin.rejects("-5.0");
      justEMin.accepts("-4.999");
    }
    {
      const bothNumeric = new Tester({ exclusiveMinimum: -5, minimum: -4, type: "number" });
      bothNumeric.validatesNonNullableNumeric();
      bothNumeric.rejects("-5.1");
      bothNumeric.rejects("-5.0");
      bothNumeric.rejects("-4.999");
      bothNumeric.accepts("-4");
    }
    {
      const bothNumeric = new Tester({ exclusiveMinimum: -5, minimum: -6, type: "number" });
      bothNumeric.validatesNonNullableNumeric();
      bothNumeric.rejects("-5.1");
      bothNumeric.rejects("-5.0");
      bothNumeric.accepts("-4.999");
    }
  });
  test("multiple of works for both integers and fractions", () => {
    {
      const onlyEvens = new Tester({ multipleOf: 2, type: "number" });
      onlyEvens.accepts("2.0");
      onlyEvens.accepts("2");
      onlyEvens.accepts("-4");
      onlyEvens.accepts("0");
      onlyEvens.accepts("100");
      onlyEvens.rejects("100.1");
      onlyEvens.rejects("");
      onlyEvens.rejects("we");
    }
    {
      const hackyIntegers = new Tester({ multipleOf: 1, type: "number" });
      hackyIntegers.accepts("2.0");
      hackyIntegers.rejects(".5");
    }
    {
      const halfIntegers = new Tester({ multipleOf: 0.5, type: "number" });
      halfIntegers.accepts("0.5");
      halfIntegers.accepts("1.5");
      halfIntegers.rejects("1.51");
    }
  });
  test("integer type correctly adds a validation", () => {
    {
      const integers = new Tester({ multipleOf: 1, type: "integer" });
      integers.accepts("02");
      integers.accepts("2");
      integers.accepts("20");
      integers.rejects(".5");
      integers.rejects("2j");
      integers.rejects("");
    }
  });
  test("null is allowed only when expected", () => {
    {
      const nullableIntegers = new Tester({ type: ["integer", "null"] });
      nullableIntegers.accepts("2");
      nullableIntegers.rejects(".5");
      nullableIntegers.accepts("2.0");
      nullableIntegers.rejects("2j");
      nullableIntegers.accepts("");
    }
    {
      const nonnullableIntegers = new Tester({ type: ["integer"] });
      nonnullableIntegers.accepts("2");
      nonnullableIntegers.rejects(".5");
      nonnullableIntegers.accepts("2.0");
      nonnullableIntegers.rejects("2j");
      nonnullableIntegers.rejects("");
    }
    {
      const nullableNumbers = new Tester({ type: ["number", "null"] });
      nullableNumbers.accepts("2");
      nullableNumbers.accepts(".5");
      nullableNumbers.accepts("2.0");
      nullableNumbers.rejects("2j");
      nullableNumbers.accepts("");
    }
    {
      const nonnullableNumbers = new Tester({ type: ["number"] });
      nonnullableNumbers.accepts("2");
      nonnullableNumbers.accepts(".5");
      nonnullableNumbers.accepts("2.0");
      nonnullableNumbers.rejects("2j");
      nonnullableNumbers.rejects("");
    }
  });
  test("string max min length work", () => {
    {
      const min = new Tester({ minLength: 4, type: "string" });
      min.rejects("123");
      min.accepts("1234");
      min.accepts("12345");
    }
    {
      const max = new Tester({ maxLength: 6, type: "string" });
      max.accepts("12345");
      max.accepts("123456");
      max.rejects("1234567");
    }
    {
      const minMax = new Tester({ minLength: 4, maxLength: 6, type: "string" });
      minMax.rejects("123");
      minMax.accepts("1234");
      minMax.accepts("12345");
      minMax.accepts("123456");
      minMax.rejects("1234567");
    }
  });
  test("objects work", () => {
    {
      const obj = new Tester({ type: "object", properties: { "a": { type: "string", maxLength: 2 } }, additionalProperties: false });
      obj.rejects({ "a": "string" });
      obj.accepts({ "a": "st" });
      obj.rejects({ "a": null });
      obj.rejects({ "a": 7 });
      obj.accepts({});
      obj.rejects("test");
      obj.rejects(7);
      obj.rejects([1, 2, 3]);
    }
    {
      const pattern = new Tester({ type: "object", patternProperties: { "^a[a-z]$": { type: "string", minLength: 2 } }, additionalProperties: false });
      pattern.accepts({ "ab": "string" });
      pattern.accepts({ "ab": "string", "ac": "hmm" });
      pattern.rejects({ "ab": "string", "ac": "h" });
      pattern.rejects({ "ab": "string", "ac": 99999 });
      pattern.rejects({ "abc": "string" });
      pattern.rejects({ "a0": "string" });
      pattern.rejects({ "ab": "string", "bc": "hmm" });
      pattern.rejects({ "be": "string" });
      pattern.rejects({ "be": "a" });
      pattern.accepts({});
    }
    {
      const pattern = new Tester({ type: "object", patternProperties: { "^#": { type: "string", minLength: 3 } }, additionalProperties: { type: "string", maxLength: 3 } });
      pattern.accepts({ "#ab": "string" });
      pattern.accepts({ "ab": "str" });
      pattern.rejects({ "#ab": "s" });
      pattern.rejects({ "ab": 99999 });
      pattern.rejects({ "#ab": 99999 });
      pattern.accepts({});
    }
    {
      const pattern = new Tester({ type: "object", properties: { "hello": { type: "string" } }, additionalProperties: { type: "boolean" } });
      pattern.accepts({ "hello": "world" });
      pattern.accepts({ "hello": "world", "bye": false });
      pattern.rejects({ "hello": "world", "bye": "false" });
      pattern.rejects({ "hello": "world", "bye": 1 });
      pattern.rejects({ "hello": "world", "bye": "world" });
      pattern.accepts({ "hello": "test" });
      pattern.accepts({});
    }
  });
  test("numerical objects work", () => {
    {
      const obj = new Tester({ type: "object", properties: { "b": { type: "number" } } });
      obj.accepts({ "b": 2.5 });
      obj.accepts({ "b": -2.5 });
      obj.accepts({ "b": 0 });
      obj.accepts({ "b": "0.12" });
      obj.rejects({ "b": "abc" });
      obj.rejects({ "b": [] });
      obj.rejects({ "b": false });
      obj.rejects({ "b": null });
      obj.rejects({ "b": void 0 });
    }
    {
      const obj = new Tester({ type: "object", properties: { "b": { type: "integer", minimum: 2, maximum: 5.5 } } });
      obj.accepts({ "b": 2 });
      obj.accepts({ "b": 3 });
      obj.accepts({ "b": "3.0" });
      obj.accepts({ "b": 5 });
      obj.rejects({ "b": 1 });
      obj.rejects({ "b": 6 });
      obj.rejects({ "b": 5.5 });
    }
  });
  test("patterns work", () => {
    {
      const urls = new Tester({ pattern: "^(hello)*$", type: "string" });
      urls.accepts("");
      urls.rejects("hel");
      urls.accepts("hello");
      urls.rejects("hellohel");
      urls.accepts("hellohello");
    }
    {
      const urls = new Tester({ pattern: "^(hello)*$", type: "string", patternErrorMessage: "err: must be friendly" });
      urls.accepts("");
      urls.rejects("hel").withMessage("err: must be friendly");
      urls.accepts("hello");
      urls.rejects("hellohel").withMessage("err: must be friendly");
      urls.accepts("hellohello");
    }
    {
      const unicodePattern = new Tester({ type: "string", pattern: "^[\\p{L}\\d_. -]*$", minLength: 3 });
      unicodePattern.accepts("_autoload");
      unicodePattern.rejects("#hash");
      unicodePattern.rejects("");
    }
  });
  test("custom error messages are shown", () => {
    const withMessage = new Tester({ minLength: 1, maxLength: 0, type: "string", errorMessage: "always error!" });
    withMessage.rejects("").withMessage("always error!");
    withMessage.rejects(" ").withMessage("always error!");
    withMessage.rejects("1").withMessage("always error!");
  });
  class ArrayTester {
    constructor(settings) {
      this.settings = settings;
      this.validator = createValidator(settings);
    }
    accepts(input) {
      assert.strictEqual(this.validator(input), "", `Expected ${JSON.stringify(this.settings)} to accept \`${JSON.stringify(input)}\`. Got ${this.validator(input)}.`);
    }
    rejects(input) {
      assert.notStrictEqual(this.validator(input), "", `Expected ${JSON.stringify(this.settings)} to reject \`${JSON.stringify(input)}\`.`);
      return {
        withMessage: (message) => {
          const actual = this.validator(input);
          assert.ok(actual);
          assert(
            actual.indexOf(message) > -1,
            `Expected error of ${JSON.stringify(this.settings)} on \`${input}\` to contain ${message}. Got ${this.validator(input)}.`
          );
        }
      };
    }
  }
  test("simple array", () => {
    {
      const arr = new ArrayTester({ type: "array", items: { type: "string" } });
      arr.accepts([]);
      arr.accepts(["foo"]);
      arr.accepts(["foo", "bar"]);
      arr.rejects(76);
      arr.rejects([6, "3", 7]);
    }
  });
  test("min-max items array", () => {
    {
      const arr = new ArrayTester({ type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 });
      arr.rejects([]).withMessage("Array must have at least 1 items");
      arr.accepts(["a"]);
      arr.accepts(["a", "a"]);
      arr.rejects(["a", "a", "a"]).withMessage("Array must have at most 2 items");
    }
  });
  test("array of enums", () => {
    {
      const arr = new ArrayTester({ type: "array", items: { type: "string", enum: ["a", "b"] } });
      arr.accepts(["a"]);
      arr.accepts(["a", "b"]);
      arr.rejects(["c"]).withMessage(`Value 'c' is not one of`);
      arr.rejects(["a", "c"]).withMessage(`Value 'c' is not one of`);
      arr.rejects(["c", "d"]).withMessage(`Value 'c' is not one of`);
      arr.rejects(["c", "d"]).withMessage(`Value 'd' is not one of`);
    }
  });
  test("array of numbers", () => {
    {
      const arr = new ArrayTester({ type: "array", items: { type: "number" } });
      arr.accepts([]);
      arr.accepts([2]);
      arr.accepts([2, 3]);
      arr.accepts(["2", "3"]);
      arr.accepts([6.6, "3", 7]);
      arr.rejects(76);
      arr.rejects(7.6);
      arr.rejects([6, "a", 7]);
    }
    {
      const arr = new ArrayTester({ type: "array", items: { type: "integer", minimum: -2, maximum: 3 }, maxItems: 4 });
      arr.accepts([]);
      arr.accepts([-2, 3]);
      arr.accepts([2, 3]);
      arr.accepts(["2", "3"]);
      arr.accepts(["-2", "0", "3"]);
      arr.accepts(["-2", 0, "3"]);
      arr.rejects(2);
      arr.rejects(76);
      arr.rejects([6, "3", 7]);
      arr.rejects([2, "a", 3]);
      arr.rejects([-2, 4]);
      arr.rejects([-1.2, 2.1]);
      arr.rejects([-3, 3]);
      arr.rejects([-3, 4]);
      arr.rejects([2, 2, 2, 2, 2]);
    }
  });
  test("min-max and enum", () => {
    const arr = new ArrayTester({ type: "array", items: { type: "string", enum: ["a", "b"] }, minItems: 1, maxItems: 2 });
    arr.rejects(["a", "b", "c"]).withMessage("Array must have at most 2 items");
    arr.rejects(["a", "b", "c"]).withMessage(`Value 'c' is not one of`);
  });
  test("pattern", () => {
    const arr = new ArrayTester({ type: "array", items: { type: "string", pattern: "^(hello)*$" } });
    arr.accepts(["hello"]);
    arr.rejects(["a"]).withMessage(`Value 'a' must match regex`);
  });
  test("Unicode pattern", () => {
    const arr = new ArrayTester({ type: "array", items: { type: "string", pattern: "^[\\p{L}\\d_. -]*$" } });
    arr.accepts(["hello", "world"]);
    arr.rejects(["hello", "#world"]).withMessage(`Value '#world' must match regex`);
  });
  test("pattern with error message", () => {
    const arr = new ArrayTester({ type: "array", items: { type: "string", pattern: "^(hello)*$", patternErrorMessage: "err: must be friendly" } });
    arr.rejects(["a"]).withMessage(`err: must be friendly`);
  });
  test("uniqueItems", () => {
    const arr = new ArrayTester({ type: "array", items: { type: "string" }, uniqueItems: true });
    arr.rejects(["a", "a"]).withMessage(`Array has duplicate items`);
  });
  test("getInvalidTypeError", () => {
    function testInvalidTypeError(value, type, shouldValidate) {
      const message = `value: ${value}, type: ${JSON.stringify(type)}, expected: ${shouldValidate ? "valid" : "invalid"}`;
      if (shouldValidate) {
        assert.ok(!getInvalidTypeError(value, type), message);
      } else {
        assert.ok(getInvalidTypeError(value, type), message);
      }
    }
    testInvalidTypeError(1, "number", true);
    testInvalidTypeError(1.5, "number", true);
    testInvalidTypeError([1], "number", false);
    testInvalidTypeError("1", "number", false);
    testInvalidTypeError({ a: 1 }, "number", false);
    testInvalidTypeError(null, "number", false);
    testInvalidTypeError("a", "string", true);
    testInvalidTypeError("1", "string", true);
    testInvalidTypeError([], "string", false);
    testInvalidTypeError({}, "string", false);
    testInvalidTypeError([1], "array", true);
    testInvalidTypeError([], "array", true);
    testInvalidTypeError([{}, [[]]], "array", true);
    testInvalidTypeError({ a: ["a"] }, "array", false);
    testInvalidTypeError("hello", "array", false);
    testInvalidTypeError(true, "boolean", true);
    testInvalidTypeError("hello", "boolean", false);
    testInvalidTypeError(null, "boolean", false);
    testInvalidTypeError([true], "boolean", false);
    testInvalidTypeError(null, "null", true);
    testInvalidTypeError(false, "null", false);
    testInvalidTypeError([null], "null", false);
    testInvalidTypeError("null", "null", false);
  });
  test("uri checks work", () => {
    const tester = new Tester({ type: "string", format: "uri" });
    tester.rejects("example.com");
    tester.rejects("example.com/example");
    tester.rejects("example/example.html");
    tester.rejects("www.example.com");
    tester.rejects("");
    tester.rejects(" ");
    tester.rejects("example");
    tester.accepts("https:");
    tester.accepts("https://");
    tester.accepts("https://example.com");
    tester.accepts("https://www.example.com");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwcmVmZXJlbmNlc1xcdGVzdFxcY29tbW9uXFxwcmVmZXJlbmNlc1ZhbGlkYXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVWYWxpZGF0b3IsIGdldEludmFsaWRUeXBlRXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vcHJlZmVyZW5jZXNWYWxpZGF0aW9uLmpzJztcblxuXG5zdWl0ZSgnUHJlZmVyZW5jZXMgVmFsaWRhdGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgVGVzdGVyIHtcblx0XHRwcml2YXRlIHZhbGlkYXRvcjogKHZhbHVlOiBhbnkpID0+IHN0cmluZyB8IG51bGw7XG5cblx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHNldHRpbmdzOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKSB7XG5cdFx0XHR0aGlzLnZhbGlkYXRvciA9IGNyZWF0ZVZhbGlkYXRvcihzZXR0aW5ncykhO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBhY2NlcHRzKGlucHV0OiBhbnkpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzLnZhbGlkYXRvcihpbnB1dCksICcnLCBgRXhwZWN0ZWQgJHtKU09OLnN0cmluZ2lmeSh0aGlzLnNldHRpbmdzKX0gdG8gYWNjZXB0IFxcYCR7SlNPTi5zdHJpbmdpZnkoaW5wdXQpfVxcYC4gR290ICR7dGhpcy52YWxpZGF0b3IoaW5wdXQpfS5gKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcmVqZWN0cyhpbnB1dDogYW55KSB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGhpcy52YWxpZGF0b3IoaW5wdXQpLCAnJywgYEV4cGVjdGVkICR7SlNPTi5zdHJpbmdpZnkodGhpcy5zZXR0aW5ncyl9IHRvIHJlamVjdCBcXGAke0pTT04uc3RyaW5naWZ5KGlucHV0KX1cXGAuYCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR3aXRoTWVzc2FnZTpcblx0XHRcdFx0XHQobWVzc2FnZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBhY3R1YWwgPSB0aGlzLnZhbGlkYXRvcihpbnB1dCk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2soYWN0dWFsKTtcblx0XHRcdFx0XHRcdGFzc2VydChhY3R1YWwuaW5kZXhPZihtZXNzYWdlKSA+IC0xLFxuXHRcdFx0XHRcdFx0XHRgRXhwZWN0ZWQgZXJyb3Igb2YgJHtKU09OLnN0cmluZ2lmeSh0aGlzLnNldHRpbmdzKX0gb24gXFxgJHtpbnB1dH1cXGAgdG8gY29udGFpbiAke21lc3NhZ2V9LiBHb3QgJHt0aGlzLnZhbGlkYXRvcihpbnB1dCl9LmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cHVibGljIHZhbGlkYXRlc051bWVyaWMoKSB7XG5cdFx0XHR0aGlzLmFjY2VwdHMoJzMnKTtcblx0XHRcdHRoaXMuYWNjZXB0cygnMy4nKTtcblx0XHRcdHRoaXMuYWNjZXB0cygnLjAnKTtcblx0XHRcdHRoaXMuYWNjZXB0cygnMy4wJyk7XG5cdFx0XHR0aGlzLmFjY2VwdHMoJyAzLjAnKTtcblx0XHRcdHRoaXMuYWNjZXB0cygnIDMuMCAgJyk7XG5cdFx0XHR0aGlzLnJlamVjdHMoJzNmJyk7XG5cdFx0XHR0aGlzLmFjY2VwdHMoMyk7XG5cdFx0XHR0aGlzLnJlamVjdHMoJ3Rlc3QnKTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdmFsaWRhdGVzTnVsbGFibGVOdW1lcmljKCkge1xuXHRcdFx0dGhpcy52YWxpZGF0ZXNOdW1lcmljKCk7XG5cdFx0XHR0aGlzLmFjY2VwdHMoMCk7XG5cdFx0XHR0aGlzLmFjY2VwdHMoJycpO1xuXHRcdFx0dGhpcy5hY2NlcHRzKG51bGwpO1xuXHRcdFx0dGhpcy5hY2NlcHRzKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHZhbGlkYXRlc05vbk51bGxhYmxlTnVtZXJpYygpIHtcblx0XHRcdHRoaXMudmFsaWRhdGVzTnVtZXJpYygpO1xuXHRcdFx0dGhpcy5hY2NlcHRzKDApO1xuXHRcdFx0dGhpcy5yZWplY3RzKCcnKTtcblx0XHRcdHRoaXMucmVqZWN0cyhudWxsKTtcblx0XHRcdHRoaXMucmVqZWN0cyh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB2YWxpZGF0ZXNTdHJpbmcoKSB7XG5cdFx0XHR0aGlzLmFjY2VwdHMoJzMnKTtcblx0XHRcdHRoaXMuYWNjZXB0cygnMy4nKTtcblx0XHRcdHRoaXMuYWNjZXB0cygnLjAnKTtcblx0XHRcdHRoaXMuYWNjZXB0cygnMy4wJyk7XG5cdFx0XHR0aGlzLmFjY2VwdHMoJyAzLjAnKTtcblx0XHRcdHRoaXMuYWNjZXB0cygnIDMuMCAgJyk7XG5cdFx0XHR0aGlzLmFjY2VwdHMoJycpO1xuXHRcdFx0dGhpcy5hY2NlcHRzKCczZicpO1xuXHRcdFx0dGhpcy5hY2NlcHRzKCdoZWxsbycpO1xuXHRcdFx0dGhpcy5yZWplY3RzKDYpO1xuXHRcdH1cblx0fVxuXG5cblx0dGVzdCgnZXhjbHVzaXZlIG1heCBhbmQgbWF4IHdvcmsgdG9nZXRoZXIgcHJvcGVybHknLCAoKSA9PiB7XG5cdFx0e1xuXHRcdFx0Y29uc3QganVzdE1heCA9IG5ldyBUZXN0ZXIoeyBtYXhpbXVtOiA1LCB0eXBlOiAnbnVtYmVyJyB9KTtcblx0XHRcdGp1c3RNYXgudmFsaWRhdGVzTm9uTnVsbGFibGVOdW1lcmljKCk7XG5cdFx0XHRqdXN0TWF4LnJlamVjdHMoJzUuMScpO1xuXHRcdFx0anVzdE1heC5hY2NlcHRzKCc1LjAnKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QganVzdEVNYXggPSBuZXcgVGVzdGVyKHsgZXhjbHVzaXZlTWF4aW11bTogNSwgdHlwZTogJ251bWJlcicgfSk7XG5cdFx0XHRqdXN0RU1heC52YWxpZGF0ZXNOb25OdWxsYWJsZU51bWVyaWMoKTtcblx0XHRcdGp1c3RFTWF4LnJlamVjdHMoJzUuMScpO1xuXHRcdFx0anVzdEVNYXgucmVqZWN0cygnNS4wJyk7XG5cdFx0XHRqdXN0RU1heC5hY2NlcHRzKCc0Ljk5OScpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBib3RoTnVtZXJpYyA9IG5ldyBUZXN0ZXIoeyBleGNsdXNpdmVNYXhpbXVtOiA1LCBtYXhpbXVtOiA0LCB0eXBlOiAnbnVtYmVyJyB9KTtcblx0XHRcdGJvdGhOdW1lcmljLnZhbGlkYXRlc05vbk51bGxhYmxlTnVtZXJpYygpO1xuXHRcdFx0Ym90aE51bWVyaWMucmVqZWN0cygnNS4xJyk7XG5cdFx0XHRib3RoTnVtZXJpYy5yZWplY3RzKCc1LjAnKTtcblx0XHRcdGJvdGhOdW1lcmljLnJlamVjdHMoJzQuOTk5Jyk7XG5cdFx0XHRib3RoTnVtZXJpYy5hY2NlcHRzKCc0Jyk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IGJvdGhOdW1lcmljID0gbmV3IFRlc3Rlcih7IGV4Y2x1c2l2ZU1heGltdW06IDUsIG1heGltdW06IDYsIHR5cGU6ICdudW1iZXInIH0pO1xuXHRcdFx0Ym90aE51bWVyaWMudmFsaWRhdGVzTm9uTnVsbGFibGVOdW1lcmljKCk7XG5cdFx0XHRib3RoTnVtZXJpYy5yZWplY3RzKCc1LjEnKTtcblx0XHRcdGJvdGhOdW1lcmljLnJlamVjdHMoJzUuMCcpO1xuXHRcdFx0Ym90aE51bWVyaWMuYWNjZXB0cygnNC45OTknKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1c2l2ZSBtaW4gYW5kIG1pbiB3b3JrIHRvZ2V0aGVyIHByb3Blcmx5JywgKCkgPT4ge1xuXHRcdHtcblx0XHRcdGNvbnN0IGp1c3RNaW4gPSBuZXcgVGVzdGVyKHsgbWluaW11bTogLTUsIHR5cGU6ICdudW1iZXInIH0pO1xuXHRcdFx0anVzdE1pbi52YWxpZGF0ZXNOb25OdWxsYWJsZU51bWVyaWMoKTtcblx0XHRcdGp1c3RNaW4ucmVqZWN0cygnLTUuMScpO1xuXHRcdFx0anVzdE1pbi5hY2NlcHRzKCctNS4wJyk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IGp1c3RFTWluID0gbmV3IFRlc3Rlcih7IGV4Y2x1c2l2ZU1pbmltdW06IC01LCB0eXBlOiAnbnVtYmVyJyB9KTtcblx0XHRcdGp1c3RFTWluLnZhbGlkYXRlc05vbk51bGxhYmxlTnVtZXJpYygpO1xuXHRcdFx0anVzdEVNaW4ucmVqZWN0cygnLTUuMScpO1xuXHRcdFx0anVzdEVNaW4ucmVqZWN0cygnLTUuMCcpO1xuXHRcdFx0anVzdEVNaW4uYWNjZXB0cygnLTQuOTk5Jyk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IGJvdGhOdW1lcmljID0gbmV3IFRlc3Rlcih7IGV4Y2x1c2l2ZU1pbmltdW06IC01LCBtaW5pbXVtOiAtNCwgdHlwZTogJ251bWJlcicgfSk7XG5cdFx0XHRib3RoTnVtZXJpYy52YWxpZGF0ZXNOb25OdWxsYWJsZU51bWVyaWMoKTtcblx0XHRcdGJvdGhOdW1lcmljLnJlamVjdHMoJy01LjEnKTtcblx0XHRcdGJvdGhOdW1lcmljLnJlamVjdHMoJy01LjAnKTtcblx0XHRcdGJvdGhOdW1lcmljLnJlamVjdHMoJy00Ljk5OScpO1xuXHRcdFx0Ym90aE51bWVyaWMuYWNjZXB0cygnLTQnKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgYm90aE51bWVyaWMgPSBuZXcgVGVzdGVyKHsgZXhjbHVzaXZlTWluaW11bTogLTUsIG1pbmltdW06IC02LCB0eXBlOiAnbnVtYmVyJyB9KTtcblx0XHRcdGJvdGhOdW1lcmljLnZhbGlkYXRlc05vbk51bGxhYmxlTnVtZXJpYygpO1xuXHRcdFx0Ym90aE51bWVyaWMucmVqZWN0cygnLTUuMScpO1xuXHRcdFx0Ym90aE51bWVyaWMucmVqZWN0cygnLTUuMCcpO1xuXHRcdFx0Ym90aE51bWVyaWMuYWNjZXB0cygnLTQuOTk5Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBvZiB3b3JrcyBmb3IgYm90aCBpbnRlZ2VycyBhbmQgZnJhY3Rpb25zJywgKCkgPT4ge1xuXHRcdHtcblx0XHRcdGNvbnN0IG9ubHlFdmVucyA9IG5ldyBUZXN0ZXIoeyBtdWx0aXBsZU9mOiAyLCB0eXBlOiAnbnVtYmVyJyB9KTtcblx0XHRcdG9ubHlFdmVucy5hY2NlcHRzKCcyLjAnKTtcblx0XHRcdG9ubHlFdmVucy5hY2NlcHRzKCcyJyk7XG5cdFx0XHRvbmx5RXZlbnMuYWNjZXB0cygnLTQnKTtcblx0XHRcdG9ubHlFdmVucy5hY2NlcHRzKCcwJyk7XG5cdFx0XHRvbmx5RXZlbnMuYWNjZXB0cygnMTAwJyk7XG5cdFx0XHRvbmx5RXZlbnMucmVqZWN0cygnMTAwLjEnKTtcblx0XHRcdG9ubHlFdmVucy5yZWplY3RzKCcnKTtcblx0XHRcdG9ubHlFdmVucy5yZWplY3RzKCd3ZScpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBoYWNreUludGVnZXJzID0gbmV3IFRlc3Rlcih7IG11bHRpcGxlT2Y6IDEsIHR5cGU6ICdudW1iZXInIH0pO1xuXHRcdFx0aGFja3lJbnRlZ2Vycy5hY2NlcHRzKCcyLjAnKTtcblx0XHRcdGhhY2t5SW50ZWdlcnMucmVqZWN0cygnLjUnKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgaGFsZkludGVnZXJzID0gbmV3IFRlc3Rlcih7IG11bHRpcGxlT2Y6IDAuNSwgdHlwZTogJ251bWJlcicgfSk7XG5cdFx0XHRoYWxmSW50ZWdlcnMuYWNjZXB0cygnMC41Jyk7XG5cdFx0XHRoYWxmSW50ZWdlcnMuYWNjZXB0cygnMS41Jyk7XG5cdFx0XHRoYWxmSW50ZWdlcnMucmVqZWN0cygnMS41MScpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaW50ZWdlciB0eXBlIGNvcnJlY3RseSBhZGRzIGEgdmFsaWRhdGlvbicsICgpID0+IHtcblx0XHR7XG5cdFx0XHRjb25zdCBpbnRlZ2VycyA9IG5ldyBUZXN0ZXIoeyBtdWx0aXBsZU9mOiAxLCB0eXBlOiAnaW50ZWdlcicgfSk7XG5cdFx0XHRpbnRlZ2Vycy5hY2NlcHRzKCcwMicpO1xuXHRcdFx0aW50ZWdlcnMuYWNjZXB0cygnMicpO1xuXHRcdFx0aW50ZWdlcnMuYWNjZXB0cygnMjAnKTtcblx0XHRcdGludGVnZXJzLnJlamVjdHMoJy41Jyk7XG5cdFx0XHRpbnRlZ2Vycy5yZWplY3RzKCcyaicpO1xuXHRcdFx0aW50ZWdlcnMucmVqZWN0cygnJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdudWxsIGlzIGFsbG93ZWQgb25seSB3aGVuIGV4cGVjdGVkJywgKCkgPT4ge1xuXHRcdHtcblx0XHRcdGNvbnN0IG51bGxhYmxlSW50ZWdlcnMgPSBuZXcgVGVzdGVyKHsgdHlwZTogWydpbnRlZ2VyJywgJ251bGwnXSB9KTtcblx0XHRcdG51bGxhYmxlSW50ZWdlcnMuYWNjZXB0cygnMicpO1xuXHRcdFx0bnVsbGFibGVJbnRlZ2Vycy5yZWplY3RzKCcuNScpO1xuXHRcdFx0bnVsbGFibGVJbnRlZ2Vycy5hY2NlcHRzKCcyLjAnKTtcblx0XHRcdG51bGxhYmxlSW50ZWdlcnMucmVqZWN0cygnMmonKTtcblx0XHRcdG51bGxhYmxlSW50ZWdlcnMuYWNjZXB0cygnJyk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IG5vbm51bGxhYmxlSW50ZWdlcnMgPSBuZXcgVGVzdGVyKHsgdHlwZTogWydpbnRlZ2VyJ10gfSk7XG5cdFx0XHRub25udWxsYWJsZUludGVnZXJzLmFjY2VwdHMoJzInKTtcblx0XHRcdG5vbm51bGxhYmxlSW50ZWdlcnMucmVqZWN0cygnLjUnKTtcblx0XHRcdG5vbm51bGxhYmxlSW50ZWdlcnMuYWNjZXB0cygnMi4wJyk7XG5cdFx0XHRub25udWxsYWJsZUludGVnZXJzLnJlamVjdHMoJzJqJyk7XG5cdFx0XHRub25udWxsYWJsZUludGVnZXJzLnJlamVjdHMoJycpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBudWxsYWJsZU51bWJlcnMgPSBuZXcgVGVzdGVyKHsgdHlwZTogWydudW1iZXInLCAnbnVsbCddIH0pO1xuXHRcdFx0bnVsbGFibGVOdW1iZXJzLmFjY2VwdHMoJzInKTtcblx0XHRcdG51bGxhYmxlTnVtYmVycy5hY2NlcHRzKCcuNScpO1xuXHRcdFx0bnVsbGFibGVOdW1iZXJzLmFjY2VwdHMoJzIuMCcpO1xuXHRcdFx0bnVsbGFibGVOdW1iZXJzLnJlamVjdHMoJzJqJyk7XG5cdFx0XHRudWxsYWJsZU51bWJlcnMuYWNjZXB0cygnJyk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IG5vbm51bGxhYmxlTnVtYmVycyA9IG5ldyBUZXN0ZXIoeyB0eXBlOiBbJ251bWJlciddIH0pO1xuXHRcdFx0bm9ubnVsbGFibGVOdW1iZXJzLmFjY2VwdHMoJzInKTtcblx0XHRcdG5vbm51bGxhYmxlTnVtYmVycy5hY2NlcHRzKCcuNScpO1xuXHRcdFx0bm9ubnVsbGFibGVOdW1iZXJzLmFjY2VwdHMoJzIuMCcpO1xuXHRcdFx0bm9ubnVsbGFibGVOdW1iZXJzLnJlamVjdHMoJzJqJyk7XG5cdFx0XHRub25udWxsYWJsZU51bWJlcnMucmVqZWN0cygnJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzdHJpbmcgbWF4IG1pbiBsZW5ndGggd29yaycsICgpID0+IHtcblx0XHR7XG5cdFx0XHRjb25zdCBtaW4gPSBuZXcgVGVzdGVyKHsgbWluTGVuZ3RoOiA0LCB0eXBlOiAnc3RyaW5nJyB9KTtcblx0XHRcdG1pbi5yZWplY3RzKCcxMjMnKTtcblx0XHRcdG1pbi5hY2NlcHRzKCcxMjM0Jyk7XG5cdFx0XHRtaW4uYWNjZXB0cygnMTIzNDUnKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgbWF4ID0gbmV3IFRlc3Rlcih7IG1heExlbmd0aDogNiwgdHlwZTogJ3N0cmluZycgfSk7XG5cdFx0XHRtYXguYWNjZXB0cygnMTIzNDUnKTtcblx0XHRcdG1heC5hY2NlcHRzKCcxMjM0NTYnKTtcblx0XHRcdG1heC5yZWplY3RzKCcxMjM0NTY3Jyk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IG1pbk1heCA9IG5ldyBUZXN0ZXIoeyBtaW5MZW5ndGg6IDQsIG1heExlbmd0aDogNiwgdHlwZTogJ3N0cmluZycgfSk7XG5cdFx0XHRtaW5NYXgucmVqZWN0cygnMTIzJyk7XG5cdFx0XHRtaW5NYXguYWNjZXB0cygnMTIzNCcpO1xuXHRcdFx0bWluTWF4LmFjY2VwdHMoJzEyMzQ1Jyk7XG5cdFx0XHRtaW5NYXguYWNjZXB0cygnMTIzNDU2Jyk7XG5cdFx0XHRtaW5NYXgucmVqZWN0cygnMTIzNDU2NycpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnb2JqZWN0cyB3b3JrJywgKCkgPT4ge1xuXHRcdHtcblx0XHRcdGNvbnN0IG9iaiA9IG5ldyBUZXN0ZXIoeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyAnYSc6IHsgdHlwZTogJ3N0cmluZycsIG1heExlbmd0aDogMiB9IH0sIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSB9KTtcblx0XHRcdG9iai5yZWplY3RzKHsgJ2EnOiAnc3RyaW5nJyB9KTtcblx0XHRcdG9iai5hY2NlcHRzKHsgJ2EnOiAnc3QnIH0pO1xuXHRcdFx0b2JqLnJlamVjdHMoeyAnYSc6IG51bGwgfSk7XG5cdFx0XHRvYmoucmVqZWN0cyh7ICdhJzogNyB9KTtcblx0XHRcdG9iai5hY2NlcHRzKHt9KTtcblx0XHRcdG9iai5yZWplY3RzKCd0ZXN0Jyk7XG5cdFx0XHRvYmoucmVqZWN0cyg3KTtcblx0XHRcdG9iai5yZWplY3RzKFsxLCAyLCAzXSk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSBuZXcgVGVzdGVyKHsgdHlwZTogJ29iamVjdCcsIHBhdHRlcm5Qcm9wZXJ0aWVzOiB7ICdeYVthLXpdJCc6IHsgdHlwZTogJ3N0cmluZycsIG1pbkxlbmd0aDogMiB9IH0sIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSB9KTtcblx0XHRcdHBhdHRlcm4uYWNjZXB0cyh7ICdhYic6ICdzdHJpbmcnIH0pO1xuXHRcdFx0cGF0dGVybi5hY2NlcHRzKHsgJ2FiJzogJ3N0cmluZycsICdhYyc6ICdobW0nIH0pO1xuXHRcdFx0cGF0dGVybi5yZWplY3RzKHsgJ2FiJzogJ3N0cmluZycsICdhYyc6ICdoJyB9KTtcblx0XHRcdHBhdHRlcm4ucmVqZWN0cyh7ICdhYic6ICdzdHJpbmcnLCAnYWMnOiA5OTk5OSB9KTtcblx0XHRcdHBhdHRlcm4ucmVqZWN0cyh7ICdhYmMnOiAnc3RyaW5nJyB9KTtcblx0XHRcdHBhdHRlcm4ucmVqZWN0cyh7ICdhMCc6ICdzdHJpbmcnIH0pO1xuXHRcdFx0cGF0dGVybi5yZWplY3RzKHsgJ2FiJzogJ3N0cmluZycsICdiYyc6ICdobW0nIH0pO1xuXHRcdFx0cGF0dGVybi5yZWplY3RzKHsgJ2JlJzogJ3N0cmluZycgfSk7XG5cdFx0XHRwYXR0ZXJuLnJlamVjdHMoeyAnYmUnOiAnYScgfSk7XG5cdFx0XHRwYXR0ZXJuLmFjY2VwdHMoe30pO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gbmV3IFRlc3Rlcih7IHR5cGU6ICdvYmplY3QnLCBwYXR0ZXJuUHJvcGVydGllczogeyAnXiMnOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDMgfSB9LCBhZGRpdGlvbmFsUHJvcGVydGllczogeyB0eXBlOiAnc3RyaW5nJywgbWF4TGVuZ3RoOiAzIH0gfSk7XG5cdFx0XHRwYXR0ZXJuLmFjY2VwdHMoeyAnI2FiJzogJ3N0cmluZycgfSk7XG5cdFx0XHRwYXR0ZXJuLmFjY2VwdHMoeyAnYWInOiAnc3RyJyB9KTtcblx0XHRcdHBhdHRlcm4ucmVqZWN0cyh7ICcjYWInOiAncycgfSk7XG5cdFx0XHRwYXR0ZXJuLnJlamVjdHMoeyAnYWInOiA5OTk5OSB9KTtcblx0XHRcdHBhdHRlcm4ucmVqZWN0cyh7ICcjYWInOiA5OTk5OSB9KTtcblx0XHRcdHBhdHRlcm4uYWNjZXB0cyh7fSk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSBuZXcgVGVzdGVyKHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgJ2hlbGxvJzogeyB0eXBlOiAnc3RyaW5nJyB9IH0sIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6ICdib29sZWFuJyB9IH0pO1xuXHRcdFx0cGF0dGVybi5hY2NlcHRzKHsgJ2hlbGxvJzogJ3dvcmxkJyB9KTtcblx0XHRcdHBhdHRlcm4uYWNjZXB0cyh7ICdoZWxsbyc6ICd3b3JsZCcsICdieWUnOiBmYWxzZSB9KTtcblx0XHRcdHBhdHRlcm4ucmVqZWN0cyh7ICdoZWxsbyc6ICd3b3JsZCcsICdieWUnOiAnZmFsc2UnIH0pO1xuXHRcdFx0cGF0dGVybi5yZWplY3RzKHsgJ2hlbGxvJzogJ3dvcmxkJywgJ2J5ZSc6IDEgfSk7XG5cdFx0XHRwYXR0ZXJuLnJlamVjdHMoeyAnaGVsbG8nOiAnd29ybGQnLCAnYnllJzogJ3dvcmxkJyB9KTtcblx0XHRcdHBhdHRlcm4uYWNjZXB0cyh7ICdoZWxsbyc6ICd0ZXN0JyB9KTtcblx0XHRcdHBhdHRlcm4uYWNjZXB0cyh7fSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdudW1lcmljYWwgb2JqZWN0cyB3b3JrJywgKCkgPT4ge1xuXHRcdHtcblx0XHRcdGNvbnN0IG9iaiA9IG5ldyBUZXN0ZXIoeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyAnYic6IHsgdHlwZTogJ251bWJlcicgfSB9IH0pO1xuXHRcdFx0b2JqLmFjY2VwdHMoeyAnYic6IDIuNSB9KTtcblx0XHRcdG9iai5hY2NlcHRzKHsgJ2InOiAtMi41IH0pO1xuXHRcdFx0b2JqLmFjY2VwdHMoeyAnYic6IDAgfSk7XG5cdFx0XHRvYmouYWNjZXB0cyh7ICdiJzogJzAuMTInIH0pO1xuXHRcdFx0b2JqLnJlamVjdHMoeyAnYic6ICdhYmMnIH0pO1xuXHRcdFx0b2JqLnJlamVjdHMoeyAnYic6IFtdIH0pO1xuXHRcdFx0b2JqLnJlamVjdHMoeyAnYic6IGZhbHNlIH0pO1xuXHRcdFx0b2JqLnJlamVjdHMoeyAnYic6IG51bGwgfSk7XG5cdFx0XHRvYmoucmVqZWN0cyh7ICdiJzogdW5kZWZpbmVkIH0pO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBvYmogPSBuZXcgVGVzdGVyKHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgJ2InOiB7IHR5cGU6ICdpbnRlZ2VyJywgbWluaW11bTogMiwgbWF4aW11bTogNS41IH0gfSB9KTtcblx0XHRcdG9iai5hY2NlcHRzKHsgJ2InOiAyIH0pO1xuXHRcdFx0b2JqLmFjY2VwdHMoeyAnYic6IDMgfSk7XG5cdFx0XHRvYmouYWNjZXB0cyh7ICdiJzogJzMuMCcgfSk7XG5cdFx0XHRvYmouYWNjZXB0cyh7ICdiJzogNSB9KTtcblx0XHRcdG9iai5yZWplY3RzKHsgJ2InOiAxIH0pO1xuXHRcdFx0b2JqLnJlamVjdHMoeyAnYic6IDYgfSk7XG5cdFx0XHRvYmoucmVqZWN0cyh7ICdiJzogNS41IH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncGF0dGVybnMgd29yaycsICgpID0+IHtcblx0XHR7XG5cdFx0XHRjb25zdCB1cmxzID0gbmV3IFRlc3Rlcih7IHBhdHRlcm46ICdeKGhlbGxvKSokJywgdHlwZTogJ3N0cmluZycgfSk7XG5cdFx0XHR1cmxzLmFjY2VwdHMoJycpO1xuXHRcdFx0dXJscy5yZWplY3RzKCdoZWwnKTtcblx0XHRcdHVybHMuYWNjZXB0cygnaGVsbG8nKTtcblx0XHRcdHVybHMucmVqZWN0cygnaGVsbG9oZWwnKTtcblx0XHRcdHVybHMuYWNjZXB0cygnaGVsbG9oZWxsbycpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCB1cmxzID0gbmV3IFRlc3Rlcih7IHBhdHRlcm46ICdeKGhlbGxvKSokJywgdHlwZTogJ3N0cmluZycsIHBhdHRlcm5FcnJvck1lc3NhZ2U6ICdlcnI6IG11c3QgYmUgZnJpZW5kbHknIH0pO1xuXHRcdFx0dXJscy5hY2NlcHRzKCcnKTtcblx0XHRcdHVybHMucmVqZWN0cygnaGVsJykud2l0aE1lc3NhZ2UoJ2VycjogbXVzdCBiZSBmcmllbmRseScpO1xuXHRcdFx0dXJscy5hY2NlcHRzKCdoZWxsbycpO1xuXHRcdFx0dXJscy5yZWplY3RzKCdoZWxsb2hlbCcpLndpdGhNZXNzYWdlKCdlcnI6IG11c3QgYmUgZnJpZW5kbHknKTtcblx0XHRcdHVybHMuYWNjZXB0cygnaGVsbG9oZWxsbycpO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCB1bmljb2RlUGF0dGVybiA9IG5ldyBUZXN0ZXIoeyB0eXBlOiAnc3RyaW5nJywgcGF0dGVybjogJ15bXFxcXHB7TH1cXFxcZF8uIC1dKiQnLCBtaW5MZW5ndGg6IDMgfSk7XG5cdFx0XHR1bmljb2RlUGF0dGVybi5hY2NlcHRzKCdfYXV0b2xvYWQnKTtcblx0XHRcdHVuaWNvZGVQYXR0ZXJuLnJlamVjdHMoJyNoYXNoJyk7XG5cdFx0XHR1bmljb2RlUGF0dGVybi5yZWplY3RzKCcnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2N1c3RvbSBlcnJvciBtZXNzYWdlcyBhcmUgc2hvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2l0aE1lc3NhZ2UgPSBuZXcgVGVzdGVyKHsgbWluTGVuZ3RoOiAxLCBtYXhMZW5ndGg6IDAsIHR5cGU6ICdzdHJpbmcnLCBlcnJvck1lc3NhZ2U6ICdhbHdheXMgZXJyb3IhJyB9KTtcblx0XHR3aXRoTWVzc2FnZS5yZWplY3RzKCcnKS53aXRoTWVzc2FnZSgnYWx3YXlzIGVycm9yIScpO1xuXHRcdHdpdGhNZXNzYWdlLnJlamVjdHMoJyAnKS53aXRoTWVzc2FnZSgnYWx3YXlzIGVycm9yIScpO1xuXHRcdHdpdGhNZXNzYWdlLnJlamVjdHMoJzEnKS53aXRoTWVzc2FnZSgnYWx3YXlzIGVycm9yIScpO1xuXHR9KTtcblxuXHRjbGFzcyBBcnJheVRlc3RlciB7XG5cdFx0cHJpdmF0ZSB2YWxpZGF0b3I6ICh2YWx1ZTogYW55KSA9PiBzdHJpbmcgfCBudWxsO1xuXG5cdFx0Y29uc3RydWN0b3IocHJpdmF0ZSBzZXR0aW5nczogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSkge1xuXHRcdFx0dGhpcy52YWxpZGF0b3IgPSBjcmVhdGVWYWxpZGF0b3Ioc2V0dGluZ3MpITtcblx0XHR9XG5cblx0XHRwdWJsaWMgYWNjZXB0cyhpbnB1dDogdW5rbm93bltdKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcy52YWxpZGF0b3IoaW5wdXQpLCAnJywgYEV4cGVjdGVkICR7SlNPTi5zdHJpbmdpZnkodGhpcy5zZXR0aW5ncyl9IHRvIGFjY2VwdCBcXGAke0pTT04uc3RyaW5naWZ5KGlucHV0KX1cXGAuIEdvdCAke3RoaXMudmFsaWRhdG9yKGlucHV0KX0uYCk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJlamVjdHMoaW5wdXQ6IGFueSkge1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRoaXMudmFsaWRhdG9yKGlucHV0KSwgJycsIGBFeHBlY3RlZCAke0pTT04uc3RyaW5naWZ5KHRoaXMuc2V0dGluZ3MpfSB0byByZWplY3QgXFxgJHtKU09OLnN0cmluZ2lmeShpbnB1dCl9XFxgLmApO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0d2l0aE1lc3NhZ2U6XG5cdFx0XHRcdFx0KG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWN0dWFsID0gdGhpcy52YWxpZGF0b3IoaW5wdXQpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKGFjdHVhbCk7XG5cdFx0XHRcdFx0XHRhc3NlcnQoYWN0dWFsLmluZGV4T2YobWVzc2FnZSkgPiAtMSxcblx0XHRcdFx0XHRcdFx0YEV4cGVjdGVkIGVycm9yIG9mICR7SlNPTi5zdHJpbmdpZnkodGhpcy5zZXR0aW5ncyl9IG9uIFxcYCR7aW5wdXR9XFxgIHRvIGNvbnRhaW4gJHttZXNzYWdlfS4gR290ICR7dGhpcy52YWxpZGF0b3IoaW5wdXQpfS5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ3NpbXBsZSBhcnJheScsICgpID0+IHtcblx0XHR7XG5cdFx0XHRjb25zdCBhcnIgPSBuZXcgQXJyYXlUZXN0ZXIoeyB0eXBlOiAnYXJyYXknLCBpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9IH0pO1xuXHRcdFx0YXJyLmFjY2VwdHMoW10pO1xuXHRcdFx0YXJyLmFjY2VwdHMoWydmb28nXSk7XG5cdFx0XHRhcnIuYWNjZXB0cyhbJ2ZvbycsICdiYXInXSk7XG5cdFx0XHRhcnIucmVqZWN0cyg3Nik7XG5cdFx0XHRhcnIucmVqZWN0cyhbNiwgJzMnLCA3XSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdtaW4tbWF4IGl0ZW1zIGFycmF5JywgKCkgPT4ge1xuXHRcdHtcblx0XHRcdGNvbnN0IGFyciA9IG5ldyBBcnJheVRlc3Rlcih7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sIG1pbkl0ZW1zOiAxLCBtYXhJdGVtczogMiB9KTtcblx0XHRcdGFyci5yZWplY3RzKFtdKS53aXRoTWVzc2FnZSgnQXJyYXkgbXVzdCBoYXZlIGF0IGxlYXN0IDEgaXRlbXMnKTtcblx0XHRcdGFyci5hY2NlcHRzKFsnYSddKTtcblx0XHRcdGFyci5hY2NlcHRzKFsnYScsICdhJ10pO1xuXHRcdFx0YXJyLnJlamVjdHMoWydhJywgJ2EnLCAnYSddKS53aXRoTWVzc2FnZSgnQXJyYXkgbXVzdCBoYXZlIGF0IG1vc3QgMiBpdGVtcycpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYXJyYXkgb2YgZW51bXMnLCAoKSA9PiB7XG5cdFx0e1xuXHRcdFx0Y29uc3QgYXJyID0gbmV3IEFycmF5VGVzdGVyKHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIGVudW06IFsnYScsICdiJ10gfSB9KTtcblx0XHRcdGFyci5hY2NlcHRzKFsnYSddKTtcblx0XHRcdGFyci5hY2NlcHRzKFsnYScsICdiJ10pO1xuXG5cdFx0XHRhcnIucmVqZWN0cyhbJ2MnXSkud2l0aE1lc3NhZ2UoYFZhbHVlICdjJyBpcyBub3Qgb25lIG9mYCk7XG5cdFx0XHRhcnIucmVqZWN0cyhbJ2EnLCAnYyddKS53aXRoTWVzc2FnZShgVmFsdWUgJ2MnIGlzIG5vdCBvbmUgb2ZgKTtcblxuXHRcdFx0YXJyLnJlamVjdHMoWydjJywgJ2QnXSkud2l0aE1lc3NhZ2UoYFZhbHVlICdjJyBpcyBub3Qgb25lIG9mYCk7XG5cdFx0XHRhcnIucmVqZWN0cyhbJ2MnLCAnZCddKS53aXRoTWVzc2FnZShgVmFsdWUgJ2QnIGlzIG5vdCBvbmUgb2ZgKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2FycmF5IG9mIG51bWJlcnMnLCAoKSA9PiB7XG5cdFx0Ly8gV2UgYWNjZXB0IHBhcnNlYWJsZSBzdHJpbmdzIHNpbmNlIHRoZSB2aWV3IGhhbmRsZXMgc3RyaW5nc1xuXHRcdHtcblx0XHRcdGNvbnN0IGFyciA9IG5ldyBBcnJheVRlc3Rlcih7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdudW1iZXInIH0gfSk7XG5cdFx0XHRhcnIuYWNjZXB0cyhbXSk7XG5cdFx0XHRhcnIuYWNjZXB0cyhbMl0pO1xuXHRcdFx0YXJyLmFjY2VwdHMoWzIsIDNdKTtcblx0XHRcdGFyci5hY2NlcHRzKFsnMicsICczJ10pO1xuXHRcdFx0YXJyLmFjY2VwdHMoWzYuNiwgJzMnLCA3XSk7XG5cdFx0XHRhcnIucmVqZWN0cyg3Nik7XG5cdFx0XHRhcnIucmVqZWN0cyg3LjYpO1xuXHRcdFx0YXJyLnJlamVjdHMoWzYsICdhJywgN10pO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCBhcnIgPSBuZXcgQXJyYXlUZXN0ZXIoeyB0eXBlOiAnYXJyYXknLCBpdGVtczogeyB0eXBlOiAnaW50ZWdlcicsIG1pbmltdW06IC0yLCBtYXhpbXVtOiAzIH0sIG1heEl0ZW1zOiA0IH0pO1xuXHRcdFx0YXJyLmFjY2VwdHMoW10pO1xuXHRcdFx0YXJyLmFjY2VwdHMoWy0yLCAzXSk7XG5cdFx0XHRhcnIuYWNjZXB0cyhbMiwgM10pO1xuXHRcdFx0YXJyLmFjY2VwdHMoWycyJywgJzMnXSk7XG5cdFx0XHRhcnIuYWNjZXB0cyhbJy0yJywgJzAnLCAnMyddKTtcblx0XHRcdGFyci5hY2NlcHRzKFsnLTInLCAwLjAsICczJ10pO1xuXHRcdFx0YXJyLnJlamVjdHMoMik7XG5cdFx0XHRhcnIucmVqZWN0cyg3Nik7XG5cdFx0XHRhcnIucmVqZWN0cyhbNiwgJzMnLCA3XSk7XG5cdFx0XHRhcnIucmVqZWN0cyhbMiwgJ2EnLCAzXSk7XG5cdFx0XHRhcnIucmVqZWN0cyhbLTIsIDRdKTtcblx0XHRcdGFyci5yZWplY3RzKFstMS4yLCAyLjFdKTtcblx0XHRcdGFyci5yZWplY3RzKFstMywgM10pO1xuXHRcdFx0YXJyLnJlamVjdHMoWy0zLCA0XSk7XG5cdFx0XHRhcnIucmVqZWN0cyhbMiwgMiwgMiwgMiwgMl0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbWluLW1heCBhbmQgZW51bScsICgpID0+IHtcblx0XHRjb25zdCBhcnIgPSBuZXcgQXJyYXlUZXN0ZXIoeyB0eXBlOiAnYXJyYXknLCBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgZW51bTogWydhJywgJ2InXSB9LCBtaW5JdGVtczogMSwgbWF4SXRlbXM6IDIgfSk7XG5cblx0XHRhcnIucmVqZWN0cyhbJ2EnLCAnYicsICdjJ10pLndpdGhNZXNzYWdlKCdBcnJheSBtdXN0IGhhdmUgYXQgbW9zdCAyIGl0ZW1zJyk7XG5cdFx0YXJyLnJlamVjdHMoWydhJywgJ2InLCAnYyddKS53aXRoTWVzc2FnZShgVmFsdWUgJ2MnIGlzIG5vdCBvbmUgb2ZgKTtcblx0fSk7XG5cblx0dGVzdCgncGF0dGVybicsICgpID0+IHtcblx0XHRjb25zdCBhcnIgPSBuZXcgQXJyYXlUZXN0ZXIoeyB0eXBlOiAnYXJyYXknLCBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgcGF0dGVybjogJ14oaGVsbG8pKiQnIH0gfSk7XG5cblx0XHRhcnIuYWNjZXB0cyhbJ2hlbGxvJ10pO1xuXHRcdGFyci5yZWplY3RzKFsnYSddKS53aXRoTWVzc2FnZShgVmFsdWUgJ2EnIG11c3QgbWF0Y2ggcmVnZXhgKTtcblx0fSk7XG5cblx0dGVzdCgnVW5pY29kZSBwYXR0ZXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFyciA9IG5ldyBBcnJheVRlc3Rlcih7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCBwYXR0ZXJuOiAnXltcXFxccHtMfVxcXFxkXy4gLV0qJCcgfSB9KTtcblxuXHRcdGFyci5hY2NlcHRzKFsnaGVsbG8nLCAnd29ybGQnXSk7XG5cdFx0YXJyLnJlamVjdHMoWydoZWxsbycsICcjd29ybGQnXSkud2l0aE1lc3NhZ2UoYFZhbHVlICcjd29ybGQnIG11c3QgbWF0Y2ggcmVnZXhgKTtcblx0fSk7XG5cblx0dGVzdCgncGF0dGVybiB3aXRoIGVycm9yIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXJyID0gbmV3IEFycmF5VGVzdGVyKHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIHBhdHRlcm46ICdeKGhlbGxvKSokJywgcGF0dGVybkVycm9yTWVzc2FnZTogJ2VycjogbXVzdCBiZSBmcmllbmRseScgfSB9KTtcblxuXHRcdGFyci5yZWplY3RzKFsnYSddKS53aXRoTWVzc2FnZShgZXJyOiBtdXN0IGJlIGZyaWVuZGx5YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuaXF1ZUl0ZW1zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFyciA9IG5ldyBBcnJheVRlc3Rlcih7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sIHVuaXF1ZUl0ZW1zOiB0cnVlIH0pO1xuXG5cdFx0YXJyLnJlamVjdHMoWydhJywgJ2EnXSkud2l0aE1lc3NhZ2UoYEFycmF5IGhhcyBkdXBsaWNhdGUgaXRlbXNgKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0SW52YWxpZFR5cGVFcnJvcicsICgpID0+IHtcblx0XHRmdW5jdGlvbiB0ZXN0SW52YWxpZFR5cGVFcnJvcih2YWx1ZTogYW55LCB0eXBlOiBzdHJpbmcgfCBzdHJpbmdbXSwgc2hvdWxkVmFsaWRhdGU6IGJvb2xlYW4pIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBgdmFsdWU6ICR7dmFsdWV9LCB0eXBlOiAke0pTT04uc3RyaW5naWZ5KHR5cGUpfSwgZXhwZWN0ZWQ6ICR7c2hvdWxkVmFsaWRhdGUgPyAndmFsaWQnIDogJ2ludmFsaWQnfWA7XG5cdFx0XHRpZiAoc2hvdWxkVmFsaWRhdGUpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFnZXRJbnZhbGlkVHlwZUVycm9yKHZhbHVlLCB0eXBlKSwgbWVzc2FnZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQub2soZ2V0SW52YWxpZFR5cGVFcnJvcih2YWx1ZSwgdHlwZSksIG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKDEsICdudW1iZXInLCB0cnVlKTtcblx0XHR0ZXN0SW52YWxpZFR5cGVFcnJvcigxLjUsICdudW1iZXInLCB0cnVlKTtcblx0XHR0ZXN0SW52YWxpZFR5cGVFcnJvcihbMV0sICdudW1iZXInLCBmYWxzZSk7XG5cdFx0dGVzdEludmFsaWRUeXBlRXJyb3IoJzEnLCAnbnVtYmVyJywgZmFsc2UpO1xuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKHsgYTogMSB9LCAnbnVtYmVyJywgZmFsc2UpO1xuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKG51bGwsICdudW1iZXInLCBmYWxzZSk7XG5cblx0XHR0ZXN0SW52YWxpZFR5cGVFcnJvcignYScsICdzdHJpbmcnLCB0cnVlKTtcblx0XHR0ZXN0SW52YWxpZFR5cGVFcnJvcignMScsICdzdHJpbmcnLCB0cnVlKTtcblx0XHR0ZXN0SW52YWxpZFR5cGVFcnJvcihbXSwgJ3N0cmluZycsIGZhbHNlKTtcblx0XHR0ZXN0SW52YWxpZFR5cGVFcnJvcih7fSwgJ3N0cmluZycsIGZhbHNlKTtcblxuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKFsxXSwgJ2FycmF5JywgdHJ1ZSk7XG5cdFx0dGVzdEludmFsaWRUeXBlRXJyb3IoW10sICdhcnJheScsIHRydWUpO1xuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKFt7fSwgW1tdXV0sICdhcnJheScsIHRydWUpO1xuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKHsgYTogWydhJ10gfSwgJ2FycmF5JywgZmFsc2UpO1xuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKCdoZWxsbycsICdhcnJheScsIGZhbHNlKTtcblxuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKHRydWUsICdib29sZWFuJywgdHJ1ZSk7XG5cdFx0dGVzdEludmFsaWRUeXBlRXJyb3IoJ2hlbGxvJywgJ2Jvb2xlYW4nLCBmYWxzZSk7XG5cdFx0dGVzdEludmFsaWRUeXBlRXJyb3IobnVsbCwgJ2Jvb2xlYW4nLCBmYWxzZSk7XG5cdFx0dGVzdEludmFsaWRUeXBlRXJyb3IoW3RydWVdLCAnYm9vbGVhbicsIGZhbHNlKTtcblxuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKG51bGwsICdudWxsJywgdHJ1ZSk7XG5cdFx0dGVzdEludmFsaWRUeXBlRXJyb3IoZmFsc2UsICdudWxsJywgZmFsc2UpO1xuXHRcdHRlc3RJbnZhbGlkVHlwZUVycm9yKFtudWxsXSwgJ251bGwnLCBmYWxzZSk7XG5cdFx0dGVzdEludmFsaWRUeXBlRXJyb3IoJ251bGwnLCAnbnVsbCcsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgndXJpIGNoZWNrcyB3b3JrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RlciA9IG5ldyBUZXN0ZXIoeyB0eXBlOiAnc3RyaW5nJywgZm9ybWF0OiAndXJpJyB9KTtcblx0XHR0ZXN0ZXIucmVqZWN0cygnZXhhbXBsZS5jb20nKTtcblx0XHR0ZXN0ZXIucmVqZWN0cygnZXhhbXBsZS5jb20vZXhhbXBsZScpO1xuXHRcdHRlc3Rlci5yZWplY3RzKCdleGFtcGxlL2V4YW1wbGUuaHRtbCcpO1xuXHRcdHRlc3Rlci5yZWplY3RzKCd3d3cuZXhhbXBsZS5jb20nKTtcblx0XHR0ZXN0ZXIucmVqZWN0cygnJyk7XG5cdFx0dGVzdGVyLnJlamVjdHMoJyAnKTtcblx0XHR0ZXN0ZXIucmVqZWN0cygnZXhhbXBsZScpO1xuXG5cdFx0dGVzdGVyLmFjY2VwdHMoJ2h0dHBzOicpO1xuXHRcdHRlc3Rlci5hY2NlcHRzKCdodHRwczovLycpO1xuXHRcdHRlc3Rlci5hY2NlcHRzKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0dGVzdGVyLmFjY2VwdHMoJ2h0dHBzOi8vd3d3LmV4YW1wbGUuY29tJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxpQkFBaUIsMkJBQTJCO0FBR3JELE1BQU0sMEJBQTBCLE1BQU07QUFDckMsMENBQXdDO0FB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
