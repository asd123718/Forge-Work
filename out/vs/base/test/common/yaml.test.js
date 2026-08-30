import * as assert from "assert";
import { parse, parseFrontMatter, parseCommaSeparatedList } from "../../common/yaml.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function parseOk(input) {
  const errors = [];
  const result = parse(input, errors);
  assert.deepStrictEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors)}`);
  return result;
}
function assertScalar(input, node, expected) {
  assert.ok(node, "Expected a node but got undefined");
  assert.strictEqual(node.type, "scalar");
  const scalar = node;
  assert.strictEqual(scalar.value, expected.value);
  if (expected.format !== void 0) {
    assert.strictEqual(scalar.format, expected.format);
  }
  assert.strictEqual(
    input.substring(scalar.startOffset, scalar.endOffset),
    scalar.rawValue,
    `Offset mismatch: input[${scalar.startOffset}..${scalar.endOffset}] is "${input.substring(scalar.startOffset, scalar.endOffset)}" but rawValue is "${scalar.rawValue}"`
  );
}
function assertMap(node, expectedKeyCount) {
  assert.ok(node, "Expected a node but got undefined");
  assert.strictEqual(node.type, "map", `Expected map but got ${node.type}`);
  const map = node;
  assert.strictEqual(map.properties.length, expectedKeyCount, `Expected ${expectedKeyCount} properties but got ${map.properties.length}`);
  return map;
}
function assertSequence(node, expectedItemCount) {
  assert.ok(node, "Expected a node but got undefined");
  assert.strictEqual(node.type, "sequence", `Expected sequence but got ${node.type}`);
  const seq = node;
  assert.strictEqual(seq.items.length, expectedItemCount, `Expected ${expectedItemCount} items but got ${seq.items.length}`);
  return seq;
}
suite("YAML Parser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Empty input", () => {
    test("returns undefined for empty string", () => {
      assert.strictEqual(parseOk(""), void 0);
    });
    test("returns undefined for whitespace-only input", () => {
      assert.strictEqual(parseOk("   "), void 0);
    });
    test("returns undefined for newline-only input", () => {
      assert.strictEqual(parseOk("\n\n"), void 0);
    });
  });
  suite("Scalars", () => {
    test("unquoted scalar", () => {
      const input = "hello world";
      const node = parseOk(input);
      assertScalar(input, node, { value: "hello world", format: "none" });
    });
    test("literal block scalar format", () => {
      const input = [
        "text: |",
        "  line one",
        "  line two"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one\nline two\n", format: "literal" });
    });
    test("folded block scalar format", () => {
      const input = [
        "text: >",
        "  line one",
        "  line two"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one line two\n", format: "folded" });
    });
    test("literal block scalar strip chomping (|-)", () => {
      const input = [
        "text: |-",
        "  line one",
        "  line two"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one\nline two", format: "literal" });
    });
    test("literal block scalar keep chomping (|+)", () => {
      const input = [
        "text: |+",
        "  line one",
        "  line two",
        ""
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one\nline two\n", format: "literal" });
    });
    test("folded block scalar strip chomping (>-)", () => {
      const input = [
        "text: >-",
        "  line one",
        "  line two"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one line two", format: "folded" });
    });
    test("folded block scalar keep chomping (>+)", () => {
      const input = [
        "text: >+",
        "  line one",
        "  line two",
        ""
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one line two\n", format: "folded" });
    });
    test("single-quoted scalar", () => {
      const input = `'hello world'`;
      const node = parseOk(input);
      assertScalar(input, node, { value: "hello world", format: "single" });
    });
    test("double-quoted scalar", () => {
      const input = '"hello world"';
      const node = parseOk(input);
      assertScalar(input, node, { value: "hello world", format: "double" });
    });
    test("double-quoted scalar with escape sequences", () => {
      const input = '"hello\\nworld"';
      const node = parseOk(input);
      assertScalar(input, node, { value: "hello\nworld", format: "double" });
    });
    test("single-quoted scalar with escaped single quote", () => {
      const input = `'it''s a test'`;
      const node = parseOk(input);
      assertScalar(input, node, { value: `it's a test`, format: "single" });
    });
    test("scalar offsets are correct", () => {
      const node = parseOk("hello");
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 5);
    });
  });
  suite("Block mappings", () => {
    test("simple key-value pair", () => {
      const input = "name: John Doe";
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assert.strictEqual(map.properties[0].key.value, "name");
      assertScalar(input, map.properties[0].value, { value: "John Doe" });
    });
    test("multiple key-value pairs", () => {
      const input = [
        "name: John Doe",
        "age: 30"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assert.strictEqual(map.properties[0].key.value, "name");
      assertScalar(input, map.properties[0].value, { value: "John Doe" });
      assert.strictEqual(map.properties[1].key.value, "age");
      assertScalar(input, map.properties[1].value, { value: "30" });
    });
    test("nested mappings", () => {
      const input = [
        "name: John Doe",
        "age: 30",
        "mother:",
        "  name: Susi Doe",
        "  age: 50",
        "  address:",
        "    street: 123 Main St",
        "    city: Example City"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 3);
      assert.strictEqual(map.properties[0].key.value, "name");
      assert.strictEqual(map.properties[2].key.value, "mother");
      const mother = assertMap(map.properties[2].value, 3);
      assert.strictEqual(mother.properties[0].key.value, "name");
      assertScalar(input, mother.properties[0].value, { value: "Susi Doe" });
      const address = assertMap(mother.properties[2].value, 2);
      assert.strictEqual(address.properties[0].key.value, "street");
      assertScalar(input, address.properties[0].value, { value: "123 Main St" });
    });
    test("mapping with quoted keys and values", () => {
      const input = [
        `"name": 'John Doe'`,
        `'age': "30"`
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assert.strictEqual(map.properties[0].key.format, "double");
      assert.strictEqual(map.properties[0].value.format, "single");
    });
    test("mapping offsets", () => {
      const input = "name: John";
      const node = parseOk(input);
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 10);
    });
  });
  suite("Block sequences", () => {
    test("simple sequence", () => {
      const input = [
        "- Apple",
        "- Banana",
        "- Cherry"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "Apple" });
      assertScalar(input, seq.items[1], { value: "Banana" });
      assertScalar(input, seq.items[2], { value: "Cherry" });
    });
    test("spec 2.4 - sequence of mappings (229Q)", () => {
      const input = [
        "-",
        "  name: Mark McGwire",
        "  hr:   65",
        "  avg:  0.278",
        "-",
        "  name: Sammy Sosa",
        "  hr:   63",
        "  avg:  0.288"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 2);
      const first = assertMap(seq.items[0], 3);
      assert.strictEqual(first.properties[0].key.value, "name");
      assertScalar(input, first.properties[0].value, { value: "Mark McGwire" });
      assert.strictEqual(first.properties[1].key.value, "hr");
      assertScalar(input, first.properties[1].value, { value: "65" });
      assert.strictEqual(first.properties[2].key.value, "avg");
      assertScalar(input, first.properties[2].value, { value: "0.278" });
      const second = assertMap(seq.items[1], 3);
      assert.strictEqual(second.properties[0].key.value, "name");
      assertScalar(input, second.properties[0].value, { value: "Sammy Sosa" });
      assert.strictEqual(second.properties[1].key.value, "hr");
      assertScalar(input, second.properties[1].value, { value: "63" });
      assert.strictEqual(second.properties[2].key.value, "avg");
      assertScalar(input, second.properties[2].value, { value: "0.288" });
    });
    test("sequence of mappings", () => {
      const input = [
        "-",
        "  name: Mark McGwire",
        "  hr:   65",
        "  avg:  0.278",
        "-",
        "  name: Sammy Sosa",
        "  hr:   63",
        "  avg:  0.288"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 2);
      const first = assertMap(seq.items[0], 3);
      assertScalar(input, first.properties[0].value, { value: "Mark McGwire" });
      const second = assertMap(seq.items[1], 3);
      assertScalar(input, second.properties[0].value, { value: "Sammy Sosa" });
    });
    test("map of sequences", () => {
      const input = [
        "american:",
        "  - Boston Red Sox",
        "  - Detroit Tigers",
        "  - New York Yankees",
        "national:",
        "  - New York Mets",
        "  - Chicago Cubs",
        "  - Atlanta Braves"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      const american = assertSequence(map.properties[0].value, 3);
      assertScalar(input, american.items[0], { value: "Boston Red Sox" });
      const national = assertSequence(map.properties[1].value, 3);
      assertScalar(input, national.items[2], { value: "Atlanta Braves" });
    });
    test("inline mapping after dash", () => {
      const input = [
        "- name: Mark McGwire",
        "  hr: 65",
        "- name: Sammy Sosa",
        "  hr: 63"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 2);
      const first = assertMap(seq.items[0], 2);
      assertScalar(input, first.properties[0].value, { value: "Mark McGwire" });
    });
  });
  suite("Flow mappings", () => {
    test("simple flow mapping", () => {
      const input = "{hr: 65, avg: 0.278}";
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assert.strictEqual(map.properties[0].key.value, "hr");
      assertScalar(input, map.properties[0].value, { value: "65" });
      assert.strictEqual(map.properties[1].key.value, "avg");
      assertScalar(input, map.properties[1].value, { value: "0.278" });
    });
    test("flow mapping offsets", () => {
      const input = "{hr: 65}";
      const node = parseOk(input);
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 8);
    });
  });
  suite("Flow sequences", () => {
    test("simple flow sequence", () => {
      const input = "[Sammy Sosa  , 63, 0.288]";
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "Sammy Sosa" });
      assertScalar(input, seq.items[1], { value: "63" });
      assertScalar(input, seq.items[2], { value: "0.288" });
    });
    test("flow sequence with quoted strings", () => {
      const input = `[ 'Sammy Sosa', 63, 0.288]`;
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "Sammy Sosa", format: "single" });
    });
    test("flow sequence offsets", () => {
      const input = "[a, b]";
      const node = parseOk(input);
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 6);
    });
  });
  suite("Mixed structures", () => {
    test("object with scalars, arrays, inline objects and arrays", () => {
      const input = [
        "object:",
        "    street: 123 Main St",
        '    city: "Example City"',
        "array:",
        "  - Boston Red Sox",
        `  - 'Detroit Tigers'`,
        "inline object: {hr: 65, avg: 0.278}",
        `inline array: [ 'Sammy Sosa', 63, 0.288]`,
        "bool: false"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 5);
      const obj = assertMap(map.properties[0].value, 2);
      assertScalar(input, obj.properties[0].value, { value: "123 Main St" });
      assertScalar(input, obj.properties[1].value, { value: "Example City", format: "double" });
      const arr = assertSequence(map.properties[1].value, 2);
      assertScalar(input, arr.items[0], { value: "Boston Red Sox" });
      assertScalar(input, arr.items[1], { value: "Detroit Tigers", format: "single" });
      const inlineObj = assertMap(map.properties[2].value, 2);
      assertScalar(input, inlineObj.properties[0].value, { value: "65" });
      const inlineArr = assertSequence(map.properties[3].value, 3);
      assertScalar(input, inlineArr.items[0], { value: "Sammy Sosa", format: "single" });
      assertScalar(input, map.properties[4].value, { value: "false" });
    });
    test("arrays of inline arrays", () => {
      const input = [
        "- [name        , hr, avg  ]",
        "- [Mark McGwire, 65, 0.278]",
        "- [Sammy Sosa  , 63, 0.288]"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      const header = assertSequence(seq.items[0], 3);
      assertScalar(input, header.items[0], { value: "name" });
      assertScalar(input, header.items[1], { value: "hr" });
      assertScalar(input, header.items[2], { value: "avg" });
      const row1 = assertSequence(seq.items[1], 3);
      assertScalar(input, row1.items[0], { value: "Mark McGwire" });
    });
  });
  suite("Comments", () => {
    test("comment-only lines are ignored", () => {
      const input = [
        "# This is a comment",
        "name: John"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assert.strictEqual(map.properties[0].key.value, "name");
    });
    test("inline comment after value", () => {
      const input = [
        "hr: # 1998 hr ranking",
        "  - Mark McGwire",
        "  - Sammy Sosa",
        "rbi:",
        "  # 1998 rbi ranking",
        "  - Sammy Sosa",
        "  - Ken Griffey#part of the value, not a comment"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      const hr = assertSequence(map.properties[0].value, 2);
      assertScalar(input, hr.items[0], { value: "Mark McGwire" });
      const rbi = assertSequence(map.properties[1].value, 2);
      assertScalar(input, rbi.items[1], { value: "Ken Griffey#part of the value, not a comment" });
    });
  });
  suite("Error handling", () => {
    test("missing value emits error and creates empty scalar", () => {
      const errors = [];
      const input = [
        "name:",
        "age: 30"
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].value, { value: "" });
      assert.ok(errors.some((e) => e.code === "missing-value"));
    });
    test("duplicate keys emit errors", () => {
      const errors = [];
      const input = [
        "name: John",
        "name: Jane"
      ].join("\n");
      const node = parse(input, errors);
      assertMap(node, 2);
      assert.ok(errors.some((e) => e.code === "duplicate-key"));
    });
    test("duplicate keys allowed with option", () => {
      const errors = [];
      const input = [
        "name: John",
        "name: Jane"
      ].join("\n");
      const node = parse(input, errors, { allowDuplicateKeys: true });
      assertMap(node, 2);
      assert.strictEqual(errors.length, 0);
    });
    test("wrong indentation emits error but still parses", () => {
      const errors = [];
      const input = [
        "parent:",
        "  child1: a",
        "    child2: b"
      ].join("\n");
      const node = parse(input, errors);
      assert.ok(node);
      assert.ok(errors.some((e) => e.code === "unexpected-indentation"));
    });
  });
  suite("Offset tracking", () => {
    test("scalar offsets in mapping", () => {
      const input = "key: value";
      const map = parseOk(input);
      assert.strictEqual(map.properties[0].key.startOffset, 0);
      assert.strictEqual(map.properties[0].key.endOffset, 3);
      const val = map.properties[0].value;
      assert.strictEqual(val.startOffset, 5);
      assert.strictEqual(val.endOffset, 10);
    });
    test("offsets are zero-based and endOffset is exclusive", () => {
      const input = '"hi"';
      const node = parseOk(input);
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 4);
      assert.strictEqual(node.value, "hi");
      assert.strictEqual(node.rawValue, '"hi"');
    });
    test("sequence item offsets", () => {
      const input = [
        "- a",
        "- b"
      ].join("\n");
      const seq = parseOk(input);
      const first = seq.items[0];
      assert.strictEqual(first.startOffset, 2);
      assert.strictEqual(first.endOffset, 3);
    });
  });
  suite("Nested sequences", () => {
    test("block sequence in block sequence (dash-dash)", () => {
      const input = [
        "- - s1_i1",
        "  - s1_i2",
        "- s2"
      ].join("\n");
      const outer = assertSequence(parseOk(input), 2);
      const inner = assertSequence(outer.items[0], 2);
      assertScalar(input, inner.items[0], { value: "s1_i1" });
      assertScalar(input, inner.items[1], { value: "s1_i2" });
      assertScalar(input, outer.items[1], { value: "s2" });
    });
    test("sequence at same indent as parent mapping key", () => {
      const input = [
        "one:",
        "- 2",
        "- 3",
        "four: 5"
      ].join("\n");
      const map = assertMap(parseOk(input), 2);
      assertScalar(input, map.properties[0].key, { value: "one" });
      const seq = assertSequence(map.properties[0].value, 2);
      assertScalar(input, seq.items[0], { value: "2" });
      assertScalar(input, seq.items[1], { value: "3" });
      assertScalar(input, map.properties[1].key, { value: "four" });
      assertScalar(input, map.properties[1].value, { value: "5" });
    });
    test("sequence indented under mapping key", () => {
      const input = [
        "foo:",
        "  - 42",
        "bar:",
        "  - 44"
      ].join("\n");
      const map = assertMap(parseOk(input), 2);
      const seq1 = assertSequence(map.properties[0].value, 1);
      assertScalar(input, seq1.items[0], { value: "42" });
      const seq2 = assertSequence(map.properties[1].value, 1);
      assertScalar(input, seq2.items[0], { value: "44" });
    });
  });
  suite("Multiline plain scalars", () => {
    test("multiline scalar in mapping value", () => {
      const input = [
        "a: b",
        " c"
      ].join("\n");
      const map = assertMap(parseOk(input), 1);
      assertScalar(input, map.properties[0].value, { value: "b c" });
    });
    test("multiline scalar with multiple continuation lines", () => {
      const input = [
        "plain:",
        "  This unquoted scalar",
        "  spans many lines."
      ].join("\n");
      const map = assertMap(parseOk(input), 1);
      assertScalar(input, map.properties[0].value, { value: "This unquoted scalar spans many lines." });
    });
    test("multiline scalar at top level", () => {
      const input = [
        "a",
        "b",
        "  c",
        "d"
      ].join("\n");
      const result = parseOk(input);
      assertScalar(input, result, { value: "a b c d" });
    });
    test("multiline scalar with empty line preserves newline", () => {
      const input = [
        "a: val1",
        " val2",
        "",
        " val3"
      ].join("\n");
      const map = assertMap(parseOk(input), 1);
      assertScalar(input, map.properties[0].value, { value: "val1 val2\nval3" });
    });
    test("multiline scalar stops at same indent as mapping", () => {
      const input = [
        "a: b",
        " c",
        "d: e"
      ].join("\n");
      const map = assertMap(parseOk(input), 2);
      assertScalar(input, map.properties[0].value, { value: "b c" });
      assertScalar(input, map.properties[1].value, { value: "e" });
    });
    test("multiline scalar value on next line", () => {
      const input = [
        "a:",
        "  b",
        "  c"
      ].join("\n");
      const map = assertMap(parseOk(input), 1);
      assertScalar(input, map.properties[0].value, { value: "b c" });
    });
    test("multiline scalar stops at comment", () => {
      const input = [
        "value1",
        "# a comment",
        "value2"
      ].join("\n");
      const result = parseOk(input);
      assertScalar(input, result, { value: "value1" });
    });
    test("multiline scalar with multiple mappings", () => {
      const input = [
        "a: b",
        " c",
        "d:",
        " e",
        "  f"
      ].join("\n");
      const map = assertMap(parseOk(input), 2);
      assertScalar(input, map.properties[0].value, { value: "b c" });
      assertScalar(input, map.properties[1].value, { value: "e f" });
    });
  });
  suite("Edge cases", () => {
    test("colon in unquoted value", () => {
      const input = "url: http://example.com";
      const map = parseOk(input);
      assertScalar(input, map.properties[0].value, { value: "http://example.com" });
    });
    test("trailing whitespace is trimmed from unquoted scalars", () => {
      const input = "name: John   ";
      const map = parseOk(input);
      assertScalar(input, map.properties[0].value, { value: "John" });
    });
    test("empty flow map", () => {
      const node = parseOk("{}");
      const map = assertMap(node, 0);
      assert.strictEqual(map.startOffset, 0);
      assert.strictEqual(map.endOffset, 2);
    });
    test("empty flow sequence", () => {
      const node = parseOk("[]");
      const seq = assertSequence(node, 0);
      assert.strictEqual(seq.startOffset, 0);
      assert.strictEqual(seq.endOffset, 2);
    });
    test("CRLF line endings", () => {
      const input = "name: John\r\nage: 30";
      const map = parseOk(input);
      assertMap(map, 2);
      assertScalar(input, map.properties[0].value, { value: "John" });
      assertScalar(input, map.properties[1].value, { value: "30" });
    });
    test("multiple --- document separators: only first document is parsed", () => {
      const input = [
        "---",
        "key1: value1",
        "key2: value2",
        "---",
        "key3: value3"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "key1" });
      assertScalar(input, map.properties[0].value, { value: "value1" });
      assertScalar(input, map.properties[1].key, { value: "key2" });
      assertScalar(input, map.properties[1].value, { value: "value2" });
    });
  });
  suite("Old test suite", () => {
    test("mapping value on next line", () => {
      const input = [
        "name:",
        "  John Doe",
        "colors:",
        "  [ Red, Green, Blue ]"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].value, { value: "John Doe" });
      const colors = assertSequence(map.properties[1].value, 3);
      assertScalar(input, colors.items[0], { value: "Red" });
      assertScalar(input, colors.items[1], { value: "Green" });
      assertScalar(input, colors.items[2], { value: "Blue" });
    });
    test("flow map with different data types", () => {
      const input = "{active: true, score: 85.5, role: null}";
      const node = parseOk(input);
      const map = assertMap(node, 3);
      assertScalar(input, map.properties[0].key, { value: "active" });
      assertScalar(input, map.properties[0].value, { value: "true" });
      assertScalar(input, map.properties[1].key, { value: "score" });
      assertScalar(input, map.properties[1].value, { value: "85.5" });
      assertScalar(input, map.properties[2].key, { value: "role" });
      assertScalar(input, map.properties[2].value, { value: "null" });
    });
    test("flow map with quoted keys and values", () => {
      const input = '{"name": "John Doe", "age": 30}';
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "name", format: "double" });
      assertScalar(input, map.properties[0].value, { value: "John Doe", format: "double" });
      assertScalar(input, map.properties[1].key, { value: "age", format: "double" });
      assertScalar(input, map.properties[1].value, { value: "30" });
    });
    test("special characters in values", () => {
      const input = `key: value with 	 special chars`;
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: `value with 	 special chars` });
    });
    test("various whitespace after colon", () => {
      const input = `key:	 	 	 value`;
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "value" });
    });
    test("inline array with comment continuation", () => {
      const input = [
        "[one # comment about two",
        ",two, three]"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "one" });
      assertScalar(input, seq.items[1], { value: "two" });
      assertScalar(input, seq.items[2], { value: "three" });
    });
    test("multi-line flow sequence", () => {
      const input = [
        "[",
        "    geen, ",
        "    yello, red]"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "geen" });
      assertScalar(input, seq.items[1], { value: "yello" });
      assertScalar(input, seq.items[2], { value: "red" });
    });
    test("nested block sequences (dash on next line)", () => {
      const input = [
        "-",
        "  - Apple",
        "  - Banana",
        "  - Cherry"
      ].join("\n");
      const node = parseOk(input);
      const outer = assertSequence(node, 1);
      const inner = assertSequence(outer.items[0], 3);
      assertScalar(input, inner.items[0], { value: "Apple" });
      assertScalar(input, inner.items[1], { value: "Banana" });
      assertScalar(input, inner.items[2], { value: "Cherry" });
    });
    test("nested flow sequences", () => {
      const input = [
        "[",
        "  [ee], [ff, gg]",
        "]"
      ].join("\n");
      const node = parseOk(input);
      const outer = assertSequence(node, 2);
      const first = assertSequence(outer.items[0], 1);
      assertScalar(input, first.items[0], { value: "ee" });
      const second = assertSequence(outer.items[1], 2);
      assertScalar(input, second.items[0], { value: "ff" });
      assertScalar(input, second.items[1], { value: "gg" });
    });
    test("mapping with sequence containing a mapping", () => {
      const input = [
        "items:",
        "- name: John",
        "  age: 30"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].key, { value: "items" });
      const seq = assertSequence(map.properties[0].value, 1);
      const item = assertMap(seq.items[0], 2);
      assertScalar(input, item.properties[0].value, { value: "John" });
      assertScalar(input, item.properties[1].value, { value: "30" });
    });
    test("sequence of mappings with varying styles", () => {
      const input = [
        "-",
        "  name: one",
        "- name: two",
        "-",
        "  name: three"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      const first = assertMap(seq.items[0], 1);
      assertScalar(input, first.properties[0].value, { value: "one" });
      const second = assertMap(seq.items[1], 1);
      assertScalar(input, second.properties[0].value, { value: "two" });
      const third = assertMap(seq.items[2], 1);
      assertScalar(input, third.properties[0].value, { value: "three" });
    });
    test("sequence of multi-property mappings", () => {
      const input = [
        "products:",
        "  - name: Laptop",
        "    price: 999.99",
        "    in_stock: true",
        "  - name: Mouse",
        "    price: 25.50",
        "    in_stock: false"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      const products = assertSequence(map.properties[0].value, 2);
      const laptop = assertMap(products.items[0], 3);
      assertScalar(input, laptop.properties[0].value, { value: "Laptop" });
      assertScalar(input, laptop.properties[1].value, { value: "999.99" });
      assertScalar(input, laptop.properties[2].value, { value: "true" });
      const mouse = assertMap(products.items[1], 3);
      assertScalar(input, mouse.properties[0].value, { value: "Mouse" });
      assertScalar(input, mouse.properties[1].value, { value: "25.50" });
      assertScalar(input, mouse.properties[2].value, { value: "false" });
    });
    test("flow sequence with mixed types", () => {
      const input = 'vals: [1, true, null, "str"]';
      const node = parseOk(input);
      const map = assertMap(node, 1);
      const vals = assertSequence(map.properties[0].value, 4);
      assertScalar(input, vals.items[0], { value: "1" });
      assertScalar(input, vals.items[1], { value: "true" });
      assertScalar(input, vals.items[2], { value: "null" });
      assertScalar(input, vals.items[3], { value: "str", format: "double" });
    });
    test("flow map with nested flow sequence", () => {
      const input = 'config: {env: "prod", settings: [true, 42], debug: false}';
      const node = parseOk(input);
      const map = assertMap(node, 1);
      const config = assertMap(map.properties[0].value, 3);
      assertScalar(input, config.properties[0].key, { value: "env" });
      assertScalar(input, config.properties[0].value, { value: "prod", format: "double" });
      const settings = assertSequence(config.properties[1].value, 2);
      assertScalar(input, settings.items[0], { value: "true" });
      assertScalar(input, settings.items[1], { value: "42" });
      assertScalar(input, config.properties[2].key, { value: "debug" });
      assertScalar(input, config.properties[2].value, { value: "false" });
    });
    test("full-line and inline comments", () => {
      const input = [
        "# This is a comment",
        "name: John Doe  # inline comment",
        "age: 30"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "name" });
      assertScalar(input, map.properties[0].value, { value: "John Doe" });
      assertScalar(input, map.properties[1].key, { value: "age" });
      assertScalar(input, map.properties[1].value, { value: "30" });
    });
    test("unexpected indentation with recovery", () => {
      const errors = [];
      const input = [
        "key: 1",
        "    stray: value"
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "key" });
      assertScalar(input, map.properties[0].value, { value: "1" });
      assertScalar(input, map.properties[1].key, { value: "stray" });
      assertScalar(input, map.properties[1].value, { value: "value" });
      assert.ok(errors.some((e) => e.code === "unexpected-indentation"));
    });
    test("empty value followed by non-empty", () => {
      const input = [
        "empty:",
        "array: []"
      ].join("\n");
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "empty" });
      assertScalar(input, map.properties[0].value, { value: "" });
      assertScalar(input, map.properties[1].key, { value: "array" });
      const arr = assertSequence(map.properties[1].value, 0);
      assert.ok(arr);
    });
    test("nested mapping with empty value", () => {
      const input = [
        "parent:",
        "  child:"
      ].join("\n");
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 1);
      const parent = assertMap(map.properties[0].value, 1);
      assertScalar(input, parent.properties[0].key, { value: "child" });
      assertScalar(input, parent.properties[0].value, { value: "" });
    });
    test("multiple keys with empty values", () => {
      const errors = [];
      const input = [
        "key1:",
        "key2:",
        "key3:"
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 3);
      assertScalar(input, map.properties[0].key, { value: "key1" });
      assertScalar(input, map.properties[0].value, { value: "" });
      assertScalar(input, map.properties[1].key, { value: "key2" });
      assertScalar(input, map.properties[1].value, { value: "" });
      assertScalar(input, map.properties[2].key, { value: "key3" });
      assertScalar(input, map.properties[2].value, { value: "" });
    });
    test("large input performance", () => {
      const lines = Array.from({ length: 1e3 }, (_, i) => `key${i}: value${i}`);
      const input = lines.join("\n");
      const start = Date.now();
      const node = parseOk(input);
      const duration = Date.now() - start;
      const map = assertMap(node, 1e3);
      assertScalar(input, map.properties[0].key, { value: "key0" });
      assertScalar(input, map.properties[999].key, { value: "key999" });
      assert.ok(duration < 500, `Parsing took ${duration}ms, expected < 500ms`);
    });
    test("deeply nested structure performance", () => {
      const lines = [];
      for (let i = 0; i < 50; i++) {
        lines.push("  ".repeat(i) + `level${i}:`);
      }
      lines.push("  ".repeat(50) + "deepValue: reached");
      const input = lines.join("\n");
      const start = Date.now();
      const errors = [];
      const result = parse(input, errors);
      const duration = Date.now() - start;
      assert.ok(result);
      assert.strictEqual(result.type, "map");
      assert.ok(duration < 500, `Parsing took ${duration}ms, expected < 500ms`);
    });
    test("unclosed flow sequence with empty lines", () => {
      const errors = [];
      const input = [
        "key: [",
        "",
        "",
        "",
        ""
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].key, { value: "key" });
      const seq = map.properties[0].value;
      assert.strictEqual(seq.type, "sequence");
      assert.strictEqual(seq.items.length, 0);
    });
    test("deeply nested same-named keys", () => {
      const input = [
        "a:",
        "  b:",
        "    a:",
        "      b:",
        "        value: test"
      ].join("\n");
      const node = parseOk(input);
      const outerA = assertMap(node, 1);
      assertScalar(input, outerA.properties[0].key, { value: "a" });
      const outerB = assertMap(outerA.properties[0].value, 1);
      assertScalar(input, outerB.properties[0].key, { value: "b" });
      const innerA = assertMap(outerB.properties[0].value, 1);
      assertScalar(input, innerA.properties[0].key, { value: "a" });
      const innerB = assertMap(innerA.properties[0].value, 1);
      assertScalar(input, innerB.properties[0].key, { value: "b" });
      const leaf = assertMap(innerB.properties[0].value, 1);
      assertScalar(input, leaf.properties[0].key, { value: "value" });
      assertScalar(input, leaf.properties[0].value, { value: "test" });
    });
    test("flow sequence with empty lines between items", () => {
      const input = ["arr: [", "", "item1,", "", "item2", "", "]"].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      const seq = assertSequence(map.properties[0].value, 2);
      assertScalar(input, seq.items[0], { value: "item1" });
      assertScalar(input, seq.items[1], { value: "item2" });
    });
    test("excessive whitespace after colon", () => {
      const input = "key:      value";
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "value" });
    });
    test("unclosed double quote", () => {
      const input = 'name: "John';
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].key, { value: "name" });
      assertScalar(input, map.properties[0].value, { value: "John" });
    });
    test("unclosed single quote", () => {
      const input = `description: 'Hello world`;
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].key, { value: "description" });
      assertScalar(input, map.properties[0].value, { value: "Hello world" });
    });
    test("comment in unclosed flow sequence", () => {
      const input = [
        "mode: agent",
        "tools: [#r"
      ].join("\n");
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "mode" });
      assertScalar(input, map.properties[0].value, { value: "agent" });
      assertScalar(input, map.properties[1].key, { value: "tools" });
      const seq = map.properties[1].value;
      assert.strictEqual(seq.type, "sequence");
      assert.strictEqual(seq.items.length, 0);
    });
    test("duplicate keys emit error", () => {
      const errors = [];
      const input = [
        "key: 1",
        "key: 2"
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].value, { value: "1" });
      assertScalar(input, map.properties[1].value, { value: "2" });
      assert.ok(errors.some((e) => e.code === "duplicate-key"));
    });
    test("duplicate keys allowed via option", () => {
      const errors = [];
      const input = [
        "key: 1",
        "key: 2"
      ].join("\n");
      const node = parse(input, errors, { allowDuplicateKeys: true });
      assertMap(node, 2);
      assert.strictEqual(errors.length, 0);
    });
  });
  suite("parseMarkdown", () => {
    test("no frontmatter returns undefined header and full input as body", () => {
      const input = "Just some markdown text\nwithout frontmatter.";
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.strictEqual(result.header, void 0);
      assert.strictEqual(result.body, input);
    });
    test("empty input returns undefined header and empty body", () => {
      const result = parseFrontMatter("");
      assert.ok(result);
      assert.strictEqual(result.header, void 0);
      assert.strictEqual(result.body, "");
    });
    test("frontmatter with body", () => {
      const input = [
        "---",
        "title: Hello",
        "author: World",
        "---",
        "# Heading",
        "Body text here."
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      const map = assertMap(result.header, 2);
      assert.strictEqual(map.properties[0].value.value, "Hello");
      assert.strictEqual(map.properties[1].value.value, "World");
      assert.strictEqual(result.getStringValue("title"), "Hello");
      assert.strictEqual(result.getStringValue("author"), "World");
      assert.strictEqual(result.body, "# Heading\nBody text here.");
    });
    test("frontmatter only, no body", () => {
      const input = [
        "---",
        "key: value",
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      const map = assertMap(result.header, 1);
      assert.strictEqual(map.properties[0].value.value, "value");
      assert.strictEqual(result.getStringValue("key"), "value");
      assert.strictEqual(result.body, "");
    });
    test("empty frontmatter strips delimiters", () => {
      const input = [
        "---",
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.strictEqual(result.header, void 0);
      assert.strictEqual(result.body, "");
    });
    test("comment-only frontmatter strips delimiters and preserves body", () => {
      const input = [
        "---",
        "# note",
        "---",
        "Body text here."
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.strictEqual(result.header, void 0);
      assert.strictEqual(result.body, "Body text here.");
    });
    test("getStringValue returns the scalar for a known key", () => {
      const input = [
        "---",
        "name: my-agent",
        "tools: foo, bar",
        "---",
        "body content"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.strictEqual(result.getStringValue("name"), "my-agent");
      assert.deepStrictEqual(result.getStringArrayValue("tools"), ["foo", "bar"]);
    });
    test("getStringArrayValue returns array for a sequence key", () => {
      const input = [
        "---",
        "tags:",
        "  - foo",
        "  - bar",
        "  - baz",
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.deepStrictEqual(result.getStringArrayValue("tags"), ["foo", "bar", "baz"]);
    });
    test("getStringArrayValue splits comma-separated scalar into array", () => {
      const input = [
        "---",
        "tags: foo, bar, baz",
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.deepStrictEqual(result.getStringArrayValue("tags"), ["foo", "bar", "baz"]);
    });
    test("getStringArrayValue wraps quoted scalars in a single-element array", () => {
      const input = [
        "---",
        'tags: "foo, bar"',
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.deepStrictEqual(result.getStringArrayValue("tags"), ["foo, bar"]);
    });
  });
  suite("parseCommaSeparatedList", () => {
    test("empty string produces empty array", () => {
      const items = parseCommaSeparatedList("");
      assert.deepStrictEqual(items, []);
    });
    test("single unquoted item", () => {
      const items = parseCommaSeparatedList("hello", 0);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].value, "hello");
      assert.strictEqual(items[0].format, "none");
    });
    test("multiple unquoted items", () => {
      const items = parseCommaSeparatedList("foo, bar, baz");
      assert.deepStrictEqual(items.map((i) => i.value), ["foo", "bar", "baz"]);
    });
    test("double-quoted items", () => {
      const items = parseCommaSeparatedList('"hello", "world"', 0);
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].value, "hello");
      assert.strictEqual(items[0].format, "double");
      assert.strictEqual(items[1].value, "world");
      assert.strictEqual(items[1].format, "double");
    });
    test("single-quoted items", () => {
      const items = parseCommaSeparatedList(`'foo', 'bar'`, 0);
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].value, "foo");
      assert.strictEqual(items[0].format, "single");
      assert.strictEqual(items[1].value, "bar");
      assert.strictEqual(items[1].format, "single");
    });
    test("mixed quoted and unquoted items", () => {
      const items = parseCommaSeparatedList(`plain, "double", 'single'`);
      assert.strictEqual(items.length, 3);
      assert.deepStrictEqual([items[0].value, items[0].format], ["plain", "none"]);
      assert.deepStrictEqual([items[1].value, items[1].format], ["double", "double"]);
      assert.deepStrictEqual([items[2].value, items[2].format], ["single", "single"]);
    });
    test("trailing whitespace trimmed from unquoted items", () => {
      const items = parseCommaSeparatedList("  foo  ,  bar  ");
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].value, "foo");
      assert.strictEqual(items[1].value, "bar");
    });
    test("offsets are relative to the provided offset", () => {
      const value = "a, b, c";
      const offset = 10;
      const items = parseCommaSeparatedList(value, offset);
      assert.strictEqual(items.length, 3);
      const doc = " ".repeat(offset) + value;
      for (const item of items) {
        assert.strictEqual(doc.substring(item.startOffset, item.endOffset), item.rawValue);
      }
    });
    test("whitespace-only string produces empty array", () => {
      const items = parseCommaSeparatedList("   ");
      assert.deepStrictEqual(items, []);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHlhbWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcGFyc2UsIHBhcnNlRnJvbnRNYXR0ZXIsIHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0LCBZYW1sTm9kZSwgWWFtbFNjYWxhck5vZGUsIFlhbWxNYXBOb2RlLCBZYW1sU2VxdWVuY2VOb2RlLCBZYW1sUGFyc2VFcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi95YW1sLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG4vLyBIZWxwZXIgdG8gcGFyc2UgYW5kIGFzc2VydCBubyBlcnJvcnNcbmZ1bmN0aW9uIHBhcnNlT2soaW5wdXQ6IHN0cmluZyk6IFlhbWxOb2RlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdGNvbnN0IHJlc3VsdCA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVycm9ycywgW10sIGBVbmV4cGVjdGVkIGVycm9yczogJHtKU09OLnN0cmluZ2lmeShlcnJvcnMpfWApO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyBIZWxwZXIgdG8gYXNzZXJ0IGEgc2NhbGFyIG5vZGUgYW5kIHZlcmlmeSBpdHMgb2Zmc2V0cyBtYXRjaCB0aGUgcmF3IHZhbHVlIGluIHRoZSBpbnB1dFxuZnVuY3Rpb24gYXNzZXJ0U2NhbGFyKGlucHV0OiBzdHJpbmcsIG5vZGU6IFlhbWxOb2RlIHwgdW5kZWZpbmVkLCBleHBlY3RlZDogeyB2YWx1ZTogc3RyaW5nOyBmb3JtYXQ/OiAnc2luZ2xlJyB8ICdkb3VibGUnIHwgJ25vbmUnIHwgJ2xpdGVyYWwnIHwgJ2ZvbGRlZCcgfSk6IHZvaWQge1xuXHRhc3NlcnQub2sobm9kZSwgJ0V4cGVjdGVkIGEgbm9kZSBidXQgZ290IHVuZGVmaW5lZCcpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS50eXBlLCAnc2NhbGFyJyk7XG5cdGNvbnN0IHNjYWxhciA9IG5vZGUgYXMgWWFtbFNjYWxhck5vZGU7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChzY2FsYXIudmFsdWUsIGV4cGVjdGVkLnZhbHVlKTtcblx0aWYgKGV4cGVjdGVkLmZvcm1hdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYWxhci5mb3JtYXQsIGV4cGVjdGVkLmZvcm1hdCk7XG5cdH1cblx0Ly8gVmVyaWZ5IHRoYXQgdGhlIG9mZnNldHMgY29ycmVjdGx5IGNvcnJlc3BvbmQgdG8gdGhlIHJhd1ZhbHVlIGluIHRoZSBpbnB1dFxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0aW5wdXQuc3Vic3RyaW5nKHNjYWxhci5zdGFydE9mZnNldCwgc2NhbGFyLmVuZE9mZnNldCksXG5cdFx0c2NhbGFyLnJhd1ZhbHVlLFxuXHRcdGBPZmZzZXQgbWlzbWF0Y2g6IGlucHV0WyR7c2NhbGFyLnN0YXJ0T2Zmc2V0fS4uJHtzY2FsYXIuZW5kT2Zmc2V0fV0gaXMgXCIke2lucHV0LnN1YnN0cmluZyhzY2FsYXIuc3RhcnRPZmZzZXQsIHNjYWxhci5lbmRPZmZzZXQpfVwiIGJ1dCByYXdWYWx1ZSBpcyBcIiR7c2NhbGFyLnJhd1ZhbHVlfVwiYFxuXHQpO1xufVxuXG4vLyBIZWxwZXIgdG8gYXNzZXJ0IGEgbWFwIG5vZGUgYW5kIHJldHVybiBwcm9wZXJ0aWVzIGZvciBmdXJ0aGVyIGFzc2VydGlvbnNcbmZ1bmN0aW9uIGFzc2VydE1hcChub2RlOiBZYW1sTm9kZSB8IHVuZGVmaW5lZCwgZXhwZWN0ZWRLZXlDb3VudDogbnVtYmVyKTogWWFtbE1hcE5vZGUge1xuXHRhc3NlcnQub2sobm9kZSwgJ0V4cGVjdGVkIGEgbm9kZSBidXQgZ290IHVuZGVmaW5lZCcpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS50eXBlLCAnbWFwJywgYEV4cGVjdGVkIG1hcCBidXQgZ290ICR7bm9kZS50eXBlfWApO1xuXHRjb25zdCBtYXAgPSBub2RlIGFzIFlhbWxNYXBOb2RlO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXMubGVuZ3RoLCBleHBlY3RlZEtleUNvdW50LCBgRXhwZWN0ZWQgJHtleHBlY3RlZEtleUNvdW50fSBwcm9wZXJ0aWVzIGJ1dCBnb3QgJHttYXAucHJvcGVydGllcy5sZW5ndGh9YCk7XG5cdHJldHVybiBtYXA7XG59XG5cbi8vIEhlbHBlciB0byBhc3NlcnQgYSBzZXF1ZW5jZSBub2RlIGFuZCByZXR1cm4gaXRlbXNcbmZ1bmN0aW9uIGFzc2VydFNlcXVlbmNlKG5vZGU6IFlhbWxOb2RlIHwgdW5kZWZpbmVkLCBleHBlY3RlZEl0ZW1Db3VudDogbnVtYmVyKTogWWFtbFNlcXVlbmNlTm9kZSB7XG5cdGFzc2VydC5vayhub2RlLCAnRXhwZWN0ZWQgYSBub2RlIGJ1dCBnb3QgdW5kZWZpbmVkJyk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLnR5cGUsICdzZXF1ZW5jZScsIGBFeHBlY3RlZCBzZXF1ZW5jZSBidXQgZ290ICR7bm9kZS50eXBlfWApO1xuXHRjb25zdCBzZXEgPSBub2RlIGFzIFlhbWxTZXF1ZW5jZU5vZGU7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChzZXEuaXRlbXMubGVuZ3RoLCBleHBlY3RlZEl0ZW1Db3VudCwgYEV4cGVjdGVkICR7ZXhwZWN0ZWRJdGVtQ291bnR9IGl0ZW1zIGJ1dCBnb3QgJHtzZXEuaXRlbXMubGVuZ3RofWApO1xuXHRyZXR1cm4gc2VxO1xufVxuXG5zdWl0ZSgnWUFNTCBQYXJzZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ0VtcHR5IGlucHV0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VPaygnJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igd2hpdGVzcGFjZS1vbmx5IGlucHV0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlT2soJyAgICcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5ld2xpbmUtb25seSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU9rKCdcXG5cXG4nKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1NjYWxhcnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgndW5xdW90ZWQgc2NhbGFyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnaGVsbG8gd29ybGQnO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBub2RlLCB7IHZhbHVlOiAnaGVsbG8gd29ybGQnLCBmb3JtYXQ6ICdub25lJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpdGVyYWwgYmxvY2sgc2NhbGFyIGZvcm1hdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQndGV4dDogfCcsXG5cdFx0XHRcdCcgIGxpbmUgb25lJyxcblx0XHRcdFx0JyAgbGluZSB0d28nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdsaW5lIG9uZVxcbmxpbmUgdHdvXFxuJywgZm9ybWF0OiAnbGl0ZXJhbCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb2xkZWQgYmxvY2sgc2NhbGFyIGZvcm1hdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQndGV4dDogPicsXG5cdFx0XHRcdCcgIGxpbmUgb25lJyxcblx0XHRcdFx0JyAgbGluZSB0d28nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdsaW5lIG9uZSBsaW5lIHR3b1xcbicsIGZvcm1hdDogJ2ZvbGRlZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXRlcmFsIGJsb2NrIHNjYWxhciBzdHJpcCBjaG9tcGluZyAofC0pJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCd0ZXh0OiB8LScsXG5cdFx0XHRcdCcgIGxpbmUgb25lJyxcblx0XHRcdFx0JyAgbGluZSB0d28nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdsaW5lIG9uZVxcbmxpbmUgdHdvJywgZm9ybWF0OiAnbGl0ZXJhbCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXRlcmFsIGJsb2NrIHNjYWxhciBrZWVwIGNob21waW5nICh8KyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J3RleHQ6IHwrJyxcblx0XHRcdFx0JyAgbGluZSBvbmUnLFxuXHRcdFx0XHQnICBsaW5lIHR3bycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdsaW5lIG9uZVxcbmxpbmUgdHdvXFxuJywgZm9ybWF0OiAnbGl0ZXJhbCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb2xkZWQgYmxvY2sgc2NhbGFyIHN0cmlwIGNob21waW5nICg+LSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J3RleHQ6ID4tJyxcblx0XHRcdFx0JyAgbGluZSBvbmUnLFxuXHRcdFx0XHQnICBsaW5lIHR3bycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2xpbmUgb25lIGxpbmUgdHdvJywgZm9ybWF0OiAnZm9sZGVkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvbGRlZCBibG9jayBzY2FsYXIga2VlcCBjaG9tcGluZyAoPispJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCd0ZXh0OiA+KycsXG5cdFx0XHRcdCcgIGxpbmUgb25lJyxcblx0XHRcdFx0JyAgbGluZSB0d28nLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnbGluZSBvbmUgbGluZSB0d29cXG4nLCBmb3JtYXQ6ICdmb2xkZWQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlLXF1b3RlZCBzY2FsYXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGAnaGVsbG8gd29ybGQnYDtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbm9kZSwgeyB2YWx1ZTogJ2hlbGxvIHdvcmxkJywgZm9ybWF0OiAnc2luZ2xlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvdWJsZS1xdW90ZWQgc2NhbGFyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnXCJoZWxsbyB3b3JsZFwiJztcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbm9kZSwgeyB2YWx1ZTogJ2hlbGxvIHdvcmxkJywgZm9ybWF0OiAnZG91YmxlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvdWJsZS1xdW90ZWQgc2NhbGFyIHdpdGggZXNjYXBlIHNlcXVlbmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ1wiaGVsbG9cXFxcbndvcmxkXCInO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBub2RlLCB7IHZhbHVlOiAnaGVsbG9cXG53b3JsZCcsIGZvcm1hdDogJ2RvdWJsZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUtcXVvdGVkIHNjYWxhciB3aXRoIGVzY2FwZWQgc2luZ2xlIHF1b3RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgJ2l0JydzIGEgdGVzdCdgO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBub2RlLCB7IHZhbHVlOiBgaXQncyBhIHRlc3RgLCBmb3JtYXQ6ICdzaW5nbGUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NhbGFyIG9mZnNldHMgYXJlIGNvcnJlY3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPaygnaGVsbG8nKSBhcyBZYW1sU2NhbGFyTm9kZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLnN0YXJ0T2Zmc2V0LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLmVuZE9mZnNldCwgNSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdCbG9jayBtYXBwaW5ncycsICgpID0+IHtcblx0XHR0ZXN0KCdzaW1wbGUga2V5LXZhbHVlIHBhaXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICduYW1lOiBKb2huIERvZSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMF0ua2V5LnZhbHVlLCAnbmFtZScpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ0pvaG4gRG9lJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIGtleS12YWx1ZSBwYWlycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnbmFtZTogSm9obiBEb2UnLFxuXHRcdFx0XHQnYWdlOiAzMCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5wcm9wZXJ0aWVzWzBdLmtleS52YWx1ZSwgJ25hbWUnKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdKb2huIERvZScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMV0ua2V5LnZhbHVlLCAnYWdlJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnMzAnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVzdGVkIG1hcHBpbmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCduYW1lOiBKb2huIERvZScsXG5cdFx0XHRcdCdhZ2U6IDMwJyxcblx0XHRcdFx0J21vdGhlcjonLFxuXHRcdFx0XHQnICBuYW1lOiBTdXNpIERvZScsXG5cdFx0XHRcdCcgIGFnZTogNTAnLFxuXHRcdFx0XHQnICBhZGRyZXNzOicsXG5cdFx0XHRcdCcgICAgc3RyZWV0OiAxMjMgTWFpbiBTdCcsXG5cdFx0XHRcdCcgICAgY2l0eTogRXhhbXBsZSBDaXR5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMF0ua2V5LnZhbHVlLCAnbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5wcm9wZXJ0aWVzWzJdLmtleS52YWx1ZSwgJ21vdGhlcicpO1xuXHRcdFx0Y29uc3QgbW90aGVyID0gYXNzZXJ0TWFwKG1hcC5wcm9wZXJ0aWVzWzJdLnZhbHVlLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3RoZXIucHJvcGVydGllc1swXS5rZXkudmFsdWUsICduYW1lJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1vdGhlci5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnU3VzaSBEb2UnIH0pO1xuXHRcdFx0Y29uc3QgYWRkcmVzcyA9IGFzc2VydE1hcChtb3RoZXIucHJvcGVydGllc1syXS52YWx1ZSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkcmVzcy5wcm9wZXJ0aWVzWzBdLmtleS52YWx1ZSwgJ3N0cmVldCcpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBhZGRyZXNzLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICcxMjMgTWFpbiBTdCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBwaW5nIHdpdGggcXVvdGVkIGtleXMgYW5kIHZhbHVlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnXCJuYW1lXCI6IFxcJ0pvaG4gRG9lXFwnJyxcblx0XHRcdFx0J1xcJ2FnZVxcJzogXCIzMFwiJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMF0ua2V5LmZvcm1hdCwgJ2RvdWJsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChtYXAucHJvcGVydGllc1swXS52YWx1ZSBhcyBZYW1sU2NhbGFyTm9kZSkuZm9ybWF0LCAnc2luZ2xlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBwaW5nIG9mZnNldHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICduYW1lOiBKb2huJztcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KSBhcyBZYW1sTWFwTm9kZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLnN0YXJ0T2Zmc2V0LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLmVuZE9mZnNldCwgMTApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQmxvY2sgc2VxdWVuY2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZSBzZXF1ZW5jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLSBBcHBsZScsXG5cdFx0XHRcdCctIEJhbmFuYScsXG5cdFx0XHRcdCctIENoZXJyeScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1swXSwgeyB2YWx1ZTogJ0FwcGxlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzFdLCB7IHZhbHVlOiAnQmFuYW5hJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzJdLCB7IHZhbHVlOiAnQ2hlcnJ5JyB9KTtcblx0XHR9KTtcblxuXHRcdC8vIFNwZWMgRXhhbXBsZSAyLjQuIFNlcXVlbmNlIG9mIE1hcHBpbmdzICgyMjlRKVxuXHRcdHRlc3QoJ3NwZWMgMi40IC0gc2VxdWVuY2Ugb2YgbWFwcGluZ3MgKDIyOVEpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctJyxcblx0XHRcdFx0JyAgbmFtZTogTWFyayBNY0d3aXJlJyxcblx0XHRcdFx0JyAgaHI6ICAgNjUnLFxuXHRcdFx0XHQnICBhdmc6ICAwLjI3OCcsXG5cdFx0XHRcdCctJyxcblx0XHRcdFx0JyAgbmFtZTogU2FtbXkgU29zYScsXG5cdFx0XHRcdCcgIGhyOiAgIDYzJyxcblx0XHRcdFx0JyAgYXZnOiAgMC4yODgnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDIpO1xuXG5cdFx0XHRjb25zdCBmaXJzdCA9IGFzc2VydE1hcChzZXEuaXRlbXNbMF0sIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnByb3BlcnRpZXNbMF0ua2V5LnZhbHVlLCAnbmFtZScpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBmaXJzdC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnTWFyayBNY0d3aXJlJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wcm9wZXJ0aWVzWzFdLmtleS52YWx1ZSwgJ2hyJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGZpcnN0LnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICc2NScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucHJvcGVydGllc1syXS5rZXkudmFsdWUsICdhdmcnKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgZmlyc3QucHJvcGVydGllc1syXS52YWx1ZSwgeyB2YWx1ZTogJzAuMjc4JyB9KTtcblxuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYXNzZXJ0TWFwKHNlcS5pdGVtc1sxXSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnByb3BlcnRpZXNbMF0ua2V5LnZhbHVlLCAnbmFtZScpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZWNvbmQucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ1NhbW15IFNvc2EnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5wcm9wZXJ0aWVzWzFdLmtleS52YWx1ZSwgJ2hyJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlY29uZC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnNjMnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5wcm9wZXJ0aWVzWzJdLmtleS52YWx1ZSwgJ2F2ZycpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZWNvbmQucHJvcGVydGllc1syXS52YWx1ZSwgeyB2YWx1ZTogJzAuMjg4JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcXVlbmNlIG9mIG1hcHBpbmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctJyxcblx0XHRcdFx0JyAgbmFtZTogTWFyayBNY0d3aXJlJyxcblx0XHRcdFx0JyAgaHI6ICAgNjUnLFxuXHRcdFx0XHQnICBhdmc6ICAwLjI3OCcsXG5cdFx0XHRcdCctJyxcblx0XHRcdFx0JyAgbmFtZTogU2FtbXkgU29zYScsXG5cdFx0XHRcdCcgIGhyOiAgIDYzJyxcblx0XHRcdFx0JyAgYXZnOiAgMC4yODgnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDIpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBhc3NlcnRNYXAoc2VxLml0ZW1zWzBdLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgZmlyc3QucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ01hcmsgTWNHd2lyZScgfSk7XG5cdFx0XHRjb25zdCBzZWNvbmQgPSBhc3NlcnRNYXAoc2VxLml0ZW1zWzFdLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2Vjb25kLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdTYW1teSBTb3NhJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcCBvZiBzZXF1ZW5jZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2FtZXJpY2FuOicsXG5cdFx0XHRcdCcgIC0gQm9zdG9uIFJlZCBTb3gnLFxuXHRcdFx0XHQnICAtIERldHJvaXQgVGlnZXJzJyxcblx0XHRcdFx0JyAgLSBOZXcgWW9yayBZYW5rZWVzJyxcblx0XHRcdFx0J25hdGlvbmFsOicsXG5cdFx0XHRcdCcgIC0gTmV3IFlvcmsgTWV0cycsXG5cdFx0XHRcdCcgIC0gQ2hpY2FnbyBDdWJzJyxcblx0XHRcdFx0JyAgLSBBdGxhbnRhIEJyYXZlcycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0Y29uc3QgYW1lcmljYW4gPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1swXS52YWx1ZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGFtZXJpY2FuLml0ZW1zWzBdLCB7IHZhbHVlOiAnQm9zdG9uIFJlZCBTb3gnIH0pO1xuXHRcdFx0Y29uc3QgbmF0aW9uYWwgPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG5hdGlvbmFsLml0ZW1zWzJdLCB7IHZhbHVlOiAnQXRsYW50YSBCcmF2ZXMnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5saW5lIG1hcHBpbmcgYWZ0ZXIgZGFzaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLSBuYW1lOiBNYXJrIE1jR3dpcmUnLFxuXHRcdFx0XHQnICBocjogNjUnLFxuXHRcdFx0XHQnLSBuYW1lOiBTYW1teSBTb3NhJyxcblx0XHRcdFx0JyAgaHI6IDYzJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBzZXEgPSBhc3NlcnRTZXF1ZW5jZShub2RlLCAyKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gYXNzZXJ0TWFwKHNlcS5pdGVtc1swXSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGZpcnN0LnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdNYXJrIE1jR3dpcmUnIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRmxvdyBtYXBwaW5ncycsICgpID0+IHtcblx0XHR0ZXN0KCdzaW1wbGUgZmxvdyBtYXBwaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAne2hyOiA2NSwgYXZnOiAwLjI3OH0nO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5wcm9wZXJ0aWVzWzBdLmtleS52YWx1ZSwgJ2hyJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnNjUnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5wcm9wZXJ0aWVzWzFdLmtleS52YWx1ZSwgJ2F2ZycpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJzAuMjc4JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zsb3cgbWFwcGluZyBvZmZzZXRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAne2hyOiA2NX0nO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpIGFzIFlhbWxNYXBOb2RlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUuc3RhcnRPZmZzZXQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUuZW5kT2Zmc2V0LCA4KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0Zsb3cgc2VxdWVuY2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZSBmbG93IHNlcXVlbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnW1NhbW15IFNvc2EgICwgNjMsIDAuMjg4XSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBzZXEgPSBhc3NlcnRTZXF1ZW5jZShub2RlLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzBdLCB7IHZhbHVlOiAnU2FtbXkgU29zYScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1sxXSwgeyB2YWx1ZTogJzYzJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzJdLCB7IHZhbHVlOiAnMC4yODgnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmxvdyBzZXF1ZW5jZSB3aXRoIHF1b3RlZCBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgWyAnU2FtbXkgU29zYScsIDYzLCAwLjI4OF1gO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1swXSwgeyB2YWx1ZTogJ1NhbW15IFNvc2EnLCBmb3JtYXQ6ICdzaW5nbGUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmxvdyBzZXF1ZW5jZSBvZmZzZXRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnW2EsIGJdJztcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KSBhcyBZYW1sU2VxdWVuY2VOb2RlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUuc3RhcnRPZmZzZXQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUuZW5kT2Zmc2V0LCA2KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ01peGVkIHN0cnVjdHVyZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnb2JqZWN0IHdpdGggc2NhbGFycywgYXJyYXlzLCBpbmxpbmUgb2JqZWN0cyBhbmQgYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdvYmplY3Q6Jyxcblx0XHRcdFx0JyAgICBzdHJlZXQ6IDEyMyBNYWluIFN0Jyxcblx0XHRcdFx0JyAgICBjaXR5OiBcIkV4YW1wbGUgQ2l0eVwiJyxcblx0XHRcdFx0J2FycmF5OicsXG5cdFx0XHRcdCcgIC0gQm9zdG9uIFJlZCBTb3gnLFxuXHRcdFx0XHRgICAtICdEZXRyb2l0IFRpZ2VycydgLFxuXHRcdFx0XHQnaW5saW5lIG9iamVjdDoge2hyOiA2NSwgYXZnOiAwLjI3OH0nLFxuXHRcdFx0XHRgaW5saW5lIGFycmF5OiBbICdTYW1teSBTb3NhJywgNjMsIDAuMjg4XWAsXG5cdFx0XHRcdCdib29sOiBmYWxzZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDUpO1xuXG5cdFx0XHQvLyBOZXN0ZWQgb2JqZWN0XG5cdFx0XHRjb25zdCBvYmogPSBhc3NlcnRNYXAobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBvYmoucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJzEyMyBNYWluIFN0JyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgb2JqLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICdFeGFtcGxlIENpdHknLCBmb3JtYXQ6ICdkb3VibGUnIH0pO1xuXG5cdFx0XHQvLyBBcnJheVxuXHRcdFx0Y29uc3QgYXJyID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBhcnIuaXRlbXNbMF0sIHsgdmFsdWU6ICdCb3N0b24gUmVkIFNveCcgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGFyci5pdGVtc1sxXSwgeyB2YWx1ZTogJ0RldHJvaXQgVGlnZXJzJywgZm9ybWF0OiAnc2luZ2xlJyB9KTtcblxuXHRcdFx0Ly8gSW5saW5lIG9iamVjdFxuXHRcdFx0Y29uc3QgaW5saW5lT2JqID0gYXNzZXJ0TWFwKG1hcC5wcm9wZXJ0aWVzWzJdLnZhbHVlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaW5saW5lT2JqLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICc2NScgfSk7XG5cblx0XHRcdC8vIElubGluZSBhcnJheVxuXHRcdFx0Y29uc3QgaW5saW5lQXJyID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbM10udmFsdWUsIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBpbmxpbmVBcnIuaXRlbXNbMF0sIHsgdmFsdWU6ICdTYW1teSBTb3NhJywgZm9ybWF0OiAnc2luZ2xlJyB9KTtcblxuXHRcdFx0Ly8gQm9vbGVhbiBhcyBzY2FsYXJcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbNF0udmFsdWUsIHsgdmFsdWU6ICdmYWxzZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcnJheXMgb2YgaW5saW5lIGFycmF5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLSBbbmFtZSAgICAgICAgLCBociwgYXZnICBdJyxcblx0XHRcdFx0Jy0gW01hcmsgTWNHd2lyZSwgNjUsIDAuMjc4XScsXG5cdFx0XHRcdCctIFtTYW1teSBTb3NhICAsIDYzLCAwLjI4OF0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDMpO1xuXG5cdFx0XHRjb25zdCBoZWFkZXIgPSBhc3NlcnRTZXF1ZW5jZShzZXEuaXRlbXNbMF0sIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBoZWFkZXIuaXRlbXNbMF0sIHsgdmFsdWU6ICduYW1lJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaGVhZGVyLml0ZW1zWzFdLCB7IHZhbHVlOiAnaHInIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBoZWFkZXIuaXRlbXNbMl0sIHsgdmFsdWU6ICdhdmcnIH0pO1xuXG5cdFx0XHRjb25zdCByb3cxID0gYXNzZXJ0U2VxdWVuY2Uoc2VxLml0ZW1zWzFdLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgcm93MS5pdGVtc1swXSwgeyB2YWx1ZTogJ01hcmsgTWNHd2lyZScgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDb21tZW50cycsICgpID0+IHtcblx0XHR0ZXN0KCdjb21tZW50LW9ubHkgbGluZXMgYXJlIGlnbm9yZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0JyMgVGhpcyBpcyBhIGNvbW1lbnQnLFxuXHRcdFx0XHQnbmFtZTogSm9obicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5wcm9wZXJ0aWVzWzBdLmtleS52YWx1ZSwgJ25hbWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lubGluZSBjb21tZW50IGFmdGVyIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdocjogIyAxOTk4IGhyIHJhbmtpbmcnLFxuXHRcdFx0XHQnICAtIE1hcmsgTWNHd2lyZScsXG5cdFx0XHRcdCcgIC0gU2FtbXkgU29zYScsXG5cdFx0XHRcdCdyYmk6Jyxcblx0XHRcdFx0JyAgIyAxOTk4IHJiaSByYW5raW5nJyxcblx0XHRcdFx0JyAgLSBTYW1teSBTb3NhJyxcblx0XHRcdFx0JyAgLSBLZW4gR3JpZmZleSNwYXJ0IG9mIHRoZSB2YWx1ZSwgbm90IGEgY29tbWVudCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXG5cdFx0XHRjb25zdCBociA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaHIuaXRlbXNbMF0sIHsgdmFsdWU6ICdNYXJrIE1jR3dpcmUnIH0pO1xuXG5cdFx0XHRjb25zdCByYmkgPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgMik7XG5cdFx0XHQvLyAnIycgd2l0aG91dCBsZWFkaW5nIHNwYWNlIGlzIHBhcnQgb2YgdGhlIHZhbHVlXG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHJiaS5pdGVtc1sxXSwgeyB2YWx1ZTogJ0tlbiBHcmlmZmV5I3BhcnQgb2YgdGhlIHZhbHVlLCBub3QgYSBjb21tZW50JyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0Vycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ21pc3NpbmcgdmFsdWUgZW1pdHMgZXJyb3IgYW5kIGNyZWF0ZXMgZW1wdHkgc2NhbGFyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J25hbWU6Jyxcblx0XHRcdFx0J2FnZTogMzAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZShpbnB1dCwgZXJyb3JzKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICcnIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9ycy5zb21lKGUgPT4gZS5jb2RlID09PSAnbWlzc2luZy12YWx1ZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2R1cGxpY2F0ZSBrZXlzIGVtaXQgZXJyb3JzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J25hbWU6IEpvaG4nLFxuXHRcdFx0XHQnbmFtZTogSmFuZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRcdFx0YXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9ycy5zb21lKGUgPT4gZS5jb2RlID09PSAnZHVwbGljYXRlLWtleScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2R1cGxpY2F0ZSBrZXlzIGFsbG93ZWQgd2l0aCBvcHRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnbmFtZTogSm9obicsXG5cdFx0XHRcdCduYW1lOiBKYW5lJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycywgeyBhbGxvd0R1cGxpY2F0ZUtleXM6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cm9uZyBpbmRlbnRhdGlvbiBlbWl0cyBlcnJvciBidXQgc3RpbGwgcGFyc2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J3BhcmVudDonLFxuXHRcdFx0XHQnICBjaGlsZDE6IGEnLFxuXHRcdFx0XHQnICAgIGNoaWxkMjogYicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5vZGUpO1xuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgcHJvZHVjZWQgYW4gaW5kZW50YXRpb24gZXJyb3Jcblx0XHRcdGFzc2VydC5vayhlcnJvcnMuc29tZShlID0+IGUuY29kZSA9PT0gJ3VuZXhwZWN0ZWQtaW5kZW50YXRpb24nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdPZmZzZXQgdHJhY2tpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2NhbGFyIG9mZnNldHMgaW4gbWFwcGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ2tleTogdmFsdWUnO1xuXHRcdFx0Y29uc3QgbWFwID0gcGFyc2VPayhpbnB1dCkgYXMgWWFtbE1hcE5vZGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMF0ua2V5LnN0YXJ0T2Zmc2V0LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAucHJvcGVydGllc1swXS5rZXkuZW5kT2Zmc2V0LCAzKTtcblx0XHRcdGNvbnN0IHZhbCA9IG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlIGFzIFlhbWxTY2FsYXJOb2RlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbC5zdGFydE9mZnNldCwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsLmVuZE9mZnNldCwgMTApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2Zmc2V0cyBhcmUgemVyby1iYXNlZCBhbmQgZW5kT2Zmc2V0IGlzIGV4Y2x1c2l2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ1wiaGlcIic7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCkgYXMgWWFtbFNjYWxhck5vZGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS5zdGFydE9mZnNldCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS5lbmRPZmZzZXQsIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUudmFsdWUsICdoaScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUucmF3VmFsdWUsICdcImhpXCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcXVlbmNlIGl0ZW0gb2Zmc2V0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLSBhJyxcblx0XHRcdFx0Jy0gYicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgc2VxID0gcGFyc2VPayhpbnB1dCkgYXMgWWFtbFNlcXVlbmNlTm9kZTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gc2VxLml0ZW1zWzBdIGFzIFlhbWxTY2FsYXJOb2RlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnN0YXJ0T2Zmc2V0LCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5lbmRPZmZzZXQsIDMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTmVzdGVkIHNlcXVlbmNlcycsICgpID0+IHtcblx0XHR0ZXN0KCdibG9jayBzZXF1ZW5jZSBpbiBibG9jayBzZXF1ZW5jZSAoZGFzaC1kYXNoKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLSAtIHMxX2kxJyxcblx0XHRcdFx0JyAgLSBzMV9pMicsXG5cdFx0XHRcdCctIHMyJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBvdXRlciA9IGFzc2VydFNlcXVlbmNlKHBhcnNlT2soaW5wdXQpLCAyKTtcblx0XHRcdGNvbnN0IGlubmVyID0gYXNzZXJ0U2VxdWVuY2Uob3V0ZXIuaXRlbXNbMF0sIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBpbm5lci5pdGVtc1swXSwgeyB2YWx1ZTogJ3MxX2kxJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaW5uZXIuaXRlbXNbMV0sIHsgdmFsdWU6ICdzMV9pMicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG91dGVyLml0ZW1zWzFdLCB7IHZhbHVlOiAnczInIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VxdWVuY2UgYXQgc2FtZSBpbmRlbnQgYXMgcGFyZW50IG1hcHBpbmcga2V5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdvbmU6Jyxcblx0XHRcdFx0Jy0gMicsXG5cdFx0XHRcdCctIDMnLFxuXHRcdFx0XHQnZm91cjogNScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKHBhcnNlT2soaW5wdXQpLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnb25lJyB9KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzBdLCB7IHZhbHVlOiAnMicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1sxXSwgeyB2YWx1ZTogJzMnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS5rZXksIHsgdmFsdWU6ICdmb3VyJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICc1JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcXVlbmNlIGluZGVudGVkIHVuZGVyIG1hcHBpbmcga2V5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdmb286Jyxcblx0XHRcdFx0JyAgLSA0MicsXG5cdFx0XHRcdCdiYXI6Jyxcblx0XHRcdFx0JyAgLSA0NCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKHBhcnNlT2soaW5wdXQpLCAyKTtcblx0XHRcdGNvbnN0IHNlcTEgPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1swXS52YWx1ZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcTEuaXRlbXNbMF0sIHsgdmFsdWU6ICc0MicgfSk7XG5cdFx0XHRjb25zdCBzZXEyID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEyLml0ZW1zWzBdLCB7IHZhbHVlOiAnNDQnIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTXVsdGlsaW5lIHBsYWluIHNjYWxhcnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbXVsdGlsaW5lIHNjYWxhciBpbiBtYXBwaW5nIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdhOiBiJyxcblx0XHRcdFx0JyBjJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAocGFyc2VPayhpbnB1dCksIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2IgYycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aWxpbmUgc2NhbGFyIHdpdGggbXVsdGlwbGUgY29udGludWF0aW9uIGxpbmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdwbGFpbjonLFxuXHRcdFx0XHQnICBUaGlzIHVucXVvdGVkIHNjYWxhcicsXG5cdFx0XHRcdCcgIHNwYW5zIG1hbnkgbGluZXMuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAocGFyc2VPayhpbnB1dCksIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ1RoaXMgdW5xdW90ZWQgc2NhbGFyIHNwYW5zIG1hbnkgbGluZXMuJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpbGluZSBzY2FsYXIgYXQgdG9wIGxldmVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdhJyxcblx0XHRcdFx0J2InLFxuXHRcdFx0XHQnICBjJyxcblx0XHRcdFx0J2QnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCByZXN1bHQsIHsgdmFsdWU6ICdhIGIgYyBkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpbGluZSBzY2FsYXIgd2l0aCBlbXB0eSBsaW5lIHByZXNlcnZlcyBuZXdsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdhOiB2YWwxJyxcblx0XHRcdFx0JyB2YWwyJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgdmFsMycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKHBhcnNlT2soaW5wdXQpLCAxKTtcblx0XHRcdC8vIEVtcHR5IGxpbmUgYmV0d2VlbiB2YWwyIGFuZCB2YWwzIGJlY29tZXMgXFxuXG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAndmFsMSB2YWwyXFxudmFsMycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aWxpbmUgc2NhbGFyIHN0b3BzIGF0IHNhbWUgaW5kZW50IGFzIG1hcHBpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2E6IGInLFxuXHRcdFx0XHQnIGMnLFxuXHRcdFx0XHQnZDogZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKHBhcnNlT2soaW5wdXQpLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdiIGMnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJ2UnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlsaW5lIHNjYWxhciB2YWx1ZSBvbiBuZXh0IGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2E6Jyxcblx0XHRcdFx0JyAgYicsXG5cdFx0XHRcdCcgIGMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChwYXJzZU9rKGlucHV0KSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnYiBjJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpbGluZSBzY2FsYXIgc3RvcHMgYXQgY29tbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQndmFsdWUxJyxcblx0XHRcdFx0JyMgYSBjb21tZW50Jyxcblx0XHRcdFx0J3ZhbHVlMicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Ly8gQ29tbWVudCB0ZXJtaW5hdGVzIHRoZSBzY2FsYXIgY29udGludWF0aW9uLCBzbyB2YWx1ZTIgaXMgbm90IHBhcnQgb2YgdmFsdWUxXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgcmVzdWx0LCB7IHZhbHVlOiAndmFsdWUxJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpbGluZSBzY2FsYXIgd2l0aCBtdWx0aXBsZSBtYXBwaW5ncycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnYTogYicsXG5cdFx0XHRcdCcgYycsXG5cdFx0XHRcdCdkOicsXG5cdFx0XHRcdCcgZScsXG5cdFx0XHRcdCcgIGYnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChwYXJzZU9rKGlucHV0KSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnYiBjJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICdlIGYnIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRWRnZSBjYXNlcycsICgpID0+IHtcblx0XHR0ZXN0KCdjb2xvbiBpbiB1bnF1b3RlZCB2YWx1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ3VybDogaHR0cDovL2V4YW1wbGUuY29tJztcblx0XHRcdGNvbnN0IG1hcCA9IHBhcnNlT2soaW5wdXQpIGFzIFlhbWxNYXBOb2RlO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2h0dHA6Ly9leGFtcGxlLmNvbScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFpbGluZyB3aGl0ZXNwYWNlIGlzIHRyaW1tZWQgZnJvbSB1bnF1b3RlZCBzY2FsYXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnbmFtZTogSm9obiAgICc7XG5cdFx0XHRjb25zdCBtYXAgPSBwYXJzZU9rKGlucHV0KSBhcyBZYW1sTWFwTm9kZTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdKb2huJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IGZsb3cgbWFwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soJ3t9Jyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnN0YXJ0T2Zmc2V0LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZW5kT2Zmc2V0LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IGZsb3cgc2VxdWVuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPaygnW10nKTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcS5zdGFydE9mZnNldCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxLmVuZE9mZnNldCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDUkxGIGxpbmUgZW5kaW5ncycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ25hbWU6IEpvaG5cXHJcXG5hZ2U6IDMwJztcblx0XHRcdGNvbnN0IG1hcCA9IHBhcnNlT2soaW5wdXQpIGFzIFlhbWxNYXBOb2RlO1xuXHRcdFx0YXNzZXJ0TWFwKG1hcCwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnSm9obicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnMzAnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgLS0tIGRvY3VtZW50IHNlcGFyYXRvcnM6IG9ubHkgZmlyc3QgZG9jdW1lbnQgaXMgcGFyc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQna2V5MTogdmFsdWUxJyxcblx0XHRcdFx0J2tleTI6IHZhbHVlMicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQna2V5MzogdmFsdWUzJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2tleTEnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ3ZhbHVlMScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLmtleSwgeyB2YWx1ZTogJ2tleTInIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJ3ZhbHVlMicgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdPbGQgdGVzdCBzdWl0ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hcHBpbmcgdmFsdWUgb24gbmV4dCBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCduYW1lOicsXG5cdFx0XHRcdCcgIEpvaG4gRG9lJyxcblx0XHRcdFx0J2NvbG9yczonLFxuXHRcdFx0XHQnICBbIFJlZCwgR3JlZW4sIEJsdWUgXScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ0pvaG4gRG9lJyB9KTtcblx0XHRcdGNvbnN0IGNvbG9ycyA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgY29sb3JzLml0ZW1zWzBdLCB7IHZhbHVlOiAnUmVkJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgY29sb3JzLml0ZW1zWzFdLCB7IHZhbHVlOiAnR3JlZW4nIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBjb2xvcnMuaXRlbXNbMl0sIHsgdmFsdWU6ICdCbHVlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zsb3cgbWFwIHdpdGggZGlmZmVyZW50IGRhdGEgdHlwZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICd7YWN0aXZlOiB0cnVlLCBzY29yZTogODUuNSwgcm9sZTogbnVsbH0nO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdhY3RpdmUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ3RydWUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS5rZXksIHsgdmFsdWU6ICdzY29yZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnODUuNScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzJdLmtleSwgeyB2YWx1ZTogJ3JvbGUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1syXS52YWx1ZSwgeyB2YWx1ZTogJ251bGwnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmxvdyBtYXAgd2l0aCBxdW90ZWQga2V5cyBhbmQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAne1wibmFtZVwiOiBcIkpvaG4gRG9lXCIsIFwiYWdlXCI6IDMwfSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ25hbWUnLCBmb3JtYXQ6ICdkb3VibGUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ0pvaG4gRG9lJywgZm9ybWF0OiAnZG91YmxlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0ua2V5LCB7IHZhbHVlOiAnYWdlJywgZm9ybWF0OiAnZG91YmxlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICczMCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzcGVjaWFsIGNoYXJhY3RlcnMgaW4gdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBga2V5OiB2YWx1ZSB3aXRoIFxcdCBzcGVjaWFsIGNoYXJzYDtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6IGB2YWx1ZSB3aXRoIFxcdCBzcGVjaWFsIGNoYXJzYCB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhcmlvdXMgd2hpdGVzcGFjZSBhZnRlciBjb2xvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYGtleTpcXHQgXFx0IFxcdCB2YWx1ZWA7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAndmFsdWUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5saW5lIGFycmF5IHdpdGggY29tbWVudCBjb250aW51YXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J1tvbmUgIyBjb21tZW50IGFib3V0IHR3bycsXG5cdFx0XHRcdCcsdHdvLCB0aHJlZV0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMF0sIHsgdmFsdWU6ICdvbmUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMV0sIHsgdmFsdWU6ICd0d28nIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMl0sIHsgdmFsdWU6ICd0aHJlZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aS1saW5lIGZsb3cgc2VxdWVuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J1snLFxuXHRcdFx0XHQnICAgIGdlZW4sICcsXG5cdFx0XHRcdCcgICAgeWVsbG8sIHJlZF0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMF0sIHsgdmFsdWU6ICdnZWVuJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzFdLCB7IHZhbHVlOiAneWVsbG8nIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMl0sIHsgdmFsdWU6ICdyZWQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVzdGVkIGJsb2NrIHNlcXVlbmNlcyAoZGFzaCBvbiBuZXh0IGxpbmUpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctJyxcblx0XHRcdFx0JyAgLSBBcHBsZScsXG5cdFx0XHRcdCcgIC0gQmFuYW5hJyxcblx0XHRcdFx0JyAgLSBDaGVycnknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG91dGVyID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMSk7XG5cdFx0XHRjb25zdCBpbm5lciA9IGFzc2VydFNlcXVlbmNlKG91dGVyLml0ZW1zWzBdLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaW5uZXIuaXRlbXNbMF0sIHsgdmFsdWU6ICdBcHBsZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGlubmVyLml0ZW1zWzFdLCB7IHZhbHVlOiAnQmFuYW5hJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaW5uZXIuaXRlbXNbMl0sIHsgdmFsdWU6ICdDaGVycnknIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVzdGVkIGZsb3cgc2VxdWVuY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdbJyxcblx0XHRcdFx0JyAgW2VlXSwgW2ZmLCBnZ10nLFxuXHRcdFx0XHQnXScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgb3V0ZXIgPSBhc3NlcnRTZXF1ZW5jZShub2RlLCAyKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gYXNzZXJ0U2VxdWVuY2Uob3V0ZXIuaXRlbXNbMF0sIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBmaXJzdC5pdGVtc1swXSwgeyB2YWx1ZTogJ2VlJyB9KTtcblx0XHRcdGNvbnN0IHNlY29uZCA9IGFzc2VydFNlcXVlbmNlKG91dGVyLml0ZW1zWzFdLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2Vjb25kLml0ZW1zWzBdLCB7IHZhbHVlOiAnZmYnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZWNvbmQuaXRlbXNbMV0sIHsgdmFsdWU6ICdnZycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBwaW5nIHdpdGggc2VxdWVuY2UgY29udGFpbmluZyBhIG1hcHBpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2l0ZW1zOicsXG5cdFx0XHRcdCctIG5hbWU6IEpvaG4nLFxuXHRcdFx0XHQnICBhZ2U6IDMwJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2l0ZW1zJyB9KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAxKTtcblx0XHRcdGNvbnN0IGl0ZW0gPSBhc3NlcnRNYXAoc2VxLml0ZW1zWzBdLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaXRlbS5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnSm9obicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGl0ZW0ucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJzMwJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcXVlbmNlIG9mIG1hcHBpbmdzIHdpdGggdmFyeWluZyBzdHlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0nLFxuXHRcdFx0XHQnICBuYW1lOiBvbmUnLFxuXHRcdFx0XHQnLSBuYW1lOiB0d28nLFxuXHRcdFx0XHQnLScsXG5cdFx0XHRcdCcgIG5hbWU6IHRocmVlJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBzZXEgPSBhc3NlcnRTZXF1ZW5jZShub2RlLCAzKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gYXNzZXJ0TWFwKHNlcS5pdGVtc1swXSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGZpcnN0LnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdvbmUnIH0pO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYXNzZXJ0TWFwKHNlcS5pdGVtc1sxXSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlY29uZC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAndHdvJyB9KTtcblx0XHRcdGNvbnN0IHRoaXJkID0gYXNzZXJ0TWFwKHNlcS5pdGVtc1syXSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHRoaXJkLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICd0aHJlZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXF1ZW5jZSBvZiBtdWx0aS1wcm9wZXJ0eSBtYXBwaW5ncycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQncHJvZHVjdHM6Jyxcblx0XHRcdFx0JyAgLSBuYW1lOiBMYXB0b3AnLFxuXHRcdFx0XHQnICAgIHByaWNlOiA5OTkuOTknLFxuXHRcdFx0XHQnICAgIGluX3N0b2NrOiB0cnVlJyxcblx0XHRcdFx0JyAgLSBuYW1lOiBNb3VzZScsXG5cdFx0XHRcdCcgICAgcHJpY2U6IDI1LjUwJyxcblx0XHRcdFx0JyAgICBpbl9zdG9jazogZmFsc2UnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGNvbnN0IHByb2R1Y3RzID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDIpO1xuXHRcdFx0Y29uc3QgbGFwdG9wID0gYXNzZXJ0TWFwKHByb2R1Y3RzLml0ZW1zWzBdLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbGFwdG9wLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdMYXB0b3AnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBsYXB0b3AucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJzk5OS45OScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGxhcHRvcC5wcm9wZXJ0aWVzWzJdLnZhbHVlLCB7IHZhbHVlOiAndHJ1ZScgfSk7XG5cdFx0XHRjb25zdCBtb3VzZSA9IGFzc2VydE1hcChwcm9kdWN0cy5pdGVtc1sxXSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1vdXNlLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdNb3VzZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1vdXNlLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICcyNS41MCcgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1vdXNlLnByb3BlcnRpZXNbMl0udmFsdWUsIHsgdmFsdWU6ICdmYWxzZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmbG93IHNlcXVlbmNlIHdpdGggbWl4ZWQgdHlwZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBOb3RlOiBjdXJyZW50IHBhcnNlciB0cmVhdHMgYWxsIHZhbHVlcyBhcyBzY2FsYXJzIChzdHJpbmdzKSwgbm90IHR5cGVkXG5cdFx0XHRjb25zdCBpbnB1dCA9ICd2YWxzOiBbMSwgdHJ1ZSwgbnVsbCwgXCJzdHJcIl0nO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0Y29uc3QgdmFscyA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCA0KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgdmFscy5pdGVtc1swXSwgeyB2YWx1ZTogJzEnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCB2YWxzLml0ZW1zWzFdLCB7IHZhbHVlOiAndHJ1ZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHZhbHMuaXRlbXNbMl0sIHsgdmFsdWU6ICdudWxsJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgdmFscy5pdGVtc1szXSwgeyB2YWx1ZTogJ3N0cicsIGZvcm1hdDogJ2RvdWJsZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmbG93IG1hcCB3aXRoIG5lc3RlZCBmbG93IHNlcXVlbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnY29uZmlnOiB7ZW52OiBcInByb2RcIiwgc2V0dGluZ3M6IFt0cnVlLCA0Ml0sIGRlYnVnOiBmYWxzZX0nO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gYXNzZXJ0TWFwKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgY29uZmlnLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnZW52JyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgY29uZmlnLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdwcm9kJywgZm9ybWF0OiAnZG91YmxlJyB9KTtcblx0XHRcdGNvbnN0IHNldHRpbmdzID0gYXNzZXJ0U2VxdWVuY2UoY29uZmlnLnByb3BlcnRpZXNbMV0udmFsdWUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXR0aW5ncy5pdGVtc1swXSwgeyB2YWx1ZTogJ3RydWUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXR0aW5ncy5pdGVtc1sxXSwgeyB2YWx1ZTogJzQyJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgY29uZmlnLnByb3BlcnRpZXNbMl0ua2V5LCB7IHZhbHVlOiAnZGVidWcnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBjb25maWcucHJvcGVydGllc1syXS52YWx1ZSwgeyB2YWx1ZTogJ2ZhbHNlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Z1bGwtbGluZSBhbmQgaW5saW5lIGNvbW1lbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCcjIFRoaXMgaXMgYSBjb21tZW50Jyxcblx0XHRcdFx0J25hbWU6IEpvaG4gRG9lICAjIGlubGluZSBjb21tZW50Jyxcblx0XHRcdFx0J2FnZTogMzAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnbmFtZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnSm9obiBEb2UnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS5rZXksIHsgdmFsdWU6ICdhZ2UnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJzMwJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuZXhwZWN0ZWQgaW5kZW50YXRpb24gd2l0aCByZWNvdmVyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdrZXk6IDEnLFxuXHRcdFx0XHQnICAgIHN0cmF5OiB2YWx1ZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdrZXknIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJzEnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS5rZXksIHsgdmFsdWU6ICdzdHJheScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAndmFsdWUnIH0pO1xuXHRcdFx0Ly8gU2hvdWxkIHJlcG9ydCBhbiBpbmRlbnRhdGlvbiBlcnJvclxuXHRcdFx0YXNzZXJ0Lm9rKGVycm9ycy5zb21lKGUgPT4gZS5jb2RlID09PSAndW5leHBlY3RlZC1pbmRlbnRhdGlvbicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IHZhbHVlIGZvbGxvd2VkIGJ5IG5vbi1lbXB0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnZW1wdHk6Jyxcblx0XHRcdFx0J2FycmF5OiBbXScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2VtcHR5JyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICcnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS5rZXksIHsgdmFsdWU6ICdhcnJheScgfSk7XG5cdFx0XHRjb25zdCBhcnIgPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgMCk7XG5cdFx0XHRhc3NlcnQub2soYXJyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25lc3RlZCBtYXBwaW5nIHdpdGggZW1wdHkgdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J3BhcmVudDonLFxuXHRcdFx0XHQnICBjaGlsZDonLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gYXNzZXJ0TWFwKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgcGFyZW50LnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnY2hpbGQnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBwYXJlbnQucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBrZXlzIHdpdGggZW1wdHkgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2tleTE6Jyxcblx0XHRcdFx0J2tleTI6Jyxcblx0XHRcdFx0J2tleTM6Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2tleTEnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLmtleSwgeyB2YWx1ZTogJ2tleTInIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzJdLmtleSwgeyB2YWx1ZTogJ2tleTMnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1syXS52YWx1ZSwgeyB2YWx1ZTogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXJnZSBpbnB1dCBwZXJmb3JtYW5jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbmVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAwMCB9LCAoXywgaSkgPT4gYGtleSR7aX06IHZhbHVlJHtpfWApO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0O1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEwMDApO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdrZXkwJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbOTk5XS5rZXksIHsgdmFsdWU6ICdrZXk5OTknIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGR1cmF0aW9uIDwgNTAwLCBgUGFyc2luZyB0b29rICR7ZHVyYXRpb259bXMsIGV4cGVjdGVkIDwgNTAwbXNgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZXBseSBuZXN0ZWQgc3RydWN0dXJlIHBlcmZvcm1hbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGluZXMgPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTA7IGkrKykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKCcgICcucmVwZWF0KGkpICsgYGxldmVsJHtpfTpgKTtcblx0XHRcdH1cblx0XHRcdGxpbmVzLnB1c2goJyAgJy5yZXBlYXQoNTApICsgJ2RlZXBWYWx1ZTogcmVhY2hlZCcpO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IGVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydDtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50eXBlLCAnbWFwJyk7XG5cdFx0XHRhc3NlcnQub2soZHVyYXRpb24gPCA1MDAsIGBQYXJzaW5nIHRvb2sgJHtkdXJhdGlvbn1tcywgZXhwZWN0ZWQgPCA1MDBtc2ApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5jbG9zZWQgZmxvdyBzZXF1ZW5jZSB3aXRoIGVtcHR5IGxpbmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2tleTogWycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZShpbnB1dCwgZXJyb3JzKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAna2V5JyB9KTtcblx0XHRcdGNvbnN0IHNlcSA9IG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlIGFzIFlhbWxTZXF1ZW5jZU5vZGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxLnR5cGUsICdzZXF1ZW5jZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcS5pdGVtcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVlcGx5IG5lc3RlZCBzYW1lLW5hbWVkIGtleXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2E6Jyxcblx0XHRcdFx0JyAgYjonLFxuXHRcdFx0XHQnICAgIGE6Jyxcblx0XHRcdFx0JyAgICAgIGI6Jyxcblx0XHRcdFx0JyAgICAgICAgdmFsdWU6IHRlc3QnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG91dGVyQSA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgb3V0ZXJBLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnYScgfSk7XG5cdFx0XHRjb25zdCBvdXRlckIgPSBhc3NlcnRNYXAob3V0ZXJBLnByb3BlcnRpZXNbMF0udmFsdWUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBvdXRlckIucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdiJyB9KTtcblx0XHRcdGNvbnN0IGlubmVyQSA9IGFzc2VydE1hcChvdXRlckIucHJvcGVydGllc1swXS52YWx1ZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGlubmVyQS5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2EnIH0pO1xuXHRcdFx0Y29uc3QgaW5uZXJCID0gYXNzZXJ0TWFwKGlubmVyQS5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaW5uZXJCLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnYicgfSk7XG5cdFx0XHRjb25zdCBsZWFmID0gYXNzZXJ0TWFwKGlubmVyQi5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbGVhZi5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ3ZhbHVlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbGVhZi5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAndGVzdCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmbG93IHNlcXVlbmNlIHdpdGggZW1wdHkgbGluZXMgYmV0d2VlbiBpdGVtcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gWydhcnI6IFsnLCAnJywgJ2l0ZW0xLCcsICcnLCAnaXRlbTInLCAnJywgJ10nXS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzBdLCB7IHZhbHVlOiAnaXRlbTEnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMV0sIHsgdmFsdWU6ICdpdGVtMicgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNlc3NpdmUgd2hpdGVzcGFjZSBhZnRlciBjb2xvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ2tleTogICAgICB2YWx1ZSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAndmFsdWUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5jbG9zZWQgZG91YmxlIHF1b3RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnbmFtZTogXCJKb2huJztcblx0XHRcdGNvbnN0IGVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICduYW1lJyB9KTtcblx0XHRcdC8vIFBhcnNlciBzaG91bGQgcmVjb3ZlcjogdmFsdWUgc2hvdWxkIGJlICdKb2huJyAoc2FucyBxdW90ZSlcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdKb2huJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuY2xvc2VkIHNpbmdsZSBxdW90ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYGRlc2NyaXB0aW9uOiAnSGVsbG8gd29ybGRgO1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2Rlc2NyaXB0aW9uJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdIZWxsbyB3b3JsZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21tZW50IGluIHVuY2xvc2VkIGZsb3cgc2VxdWVuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J21vZGU6IGFnZW50Jyxcblx0XHRcdFx0J3Rvb2xzOiBbI3InLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdtb2RlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdhZ2VudCcgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLmtleSwgeyB2YWx1ZTogJ3Rvb2xzJyB9KTtcblx0XHRcdGNvbnN0IHNlcSA9IG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlIGFzIFlhbWxTZXF1ZW5jZU5vZGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxLnR5cGUsICdzZXF1ZW5jZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcS5pdGVtcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHVwbGljYXRlIGtleXMgZW1pdCBlcnJvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdrZXk6IDEnLFxuXHRcdFx0XHQna2V5OiAyJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnMScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnMicgfSk7XG5cdFx0XHRhc3NlcnQub2soZXJyb3JzLnNvbWUoZSA9PiBlLmNvZGUgPT09ICdkdXBsaWNhdGUta2V5JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHVwbGljYXRlIGtleXMgYWxsb3dlZCB2aWEgb3B0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2tleTogMScsXG5cdFx0XHRcdCdrZXk6IDInLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZShpbnB1dCwgZXJyb3JzLCB7IGFsbG93RHVwbGljYXRlS2V5czogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlTWFya2Rvd24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdubyBmcm9udG1hdHRlciByZXR1cm5zIHVuZGVmaW5lZCBoZWFkZXIgYW5kIGZ1bGwgaW5wdXQgYXMgYm9keScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ0p1c3Qgc29tZSBtYXJrZG93biB0ZXh0XFxud2l0aG91dCBmcm9udG1hdHRlci4nO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VGcm9udE1hdHRlcihpbnB1dCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaGVhZGVyLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ib2R5LCBpbnB1dCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbXB0eSBpbnB1dCByZXR1cm5zIHVuZGVmaW5lZCBoZWFkZXIgYW5kIGVtcHR5IGJvZHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUZyb250TWF0dGVyKCcnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5oZWFkZXIsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJvZHksICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zyb250bWF0dGVyIHdpdGggYm9keScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3RpdGxlOiBIZWxsbycsXG5cdFx0XHRcdCdhdXRob3I6IFdvcmxkJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCcjIEhlYWRpbmcnLFxuXHRcdFx0XHQnQm9keSB0ZXh0IGhlcmUuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUZyb250TWF0dGVyKGlucHV0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKHJlc3VsdC5oZWFkZXIsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChtYXAucHJvcGVydGllc1swXS52YWx1ZSBhcyBZYW1sU2NhbGFyTm9kZSkudmFsdWUsICdIZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChtYXAucHJvcGVydGllc1sxXS52YWx1ZSBhcyBZYW1sU2NhbGFyTm9kZSkudmFsdWUsICdXb3JsZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXRTdHJpbmdWYWx1ZSgndGl0bGUnKSwgJ0hlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldFN0cmluZ1ZhbHVlKCdhdXRob3InKSwgJ1dvcmxkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJvZHksICcjIEhlYWRpbmdcXG5Cb2R5IHRleHQgaGVyZS4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zyb250bWF0dGVyIG9ubHksIG5vIGJvZHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdrZXk6IHZhbHVlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VGcm9udE1hdHRlcihpbnB1dCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChyZXN1bHQuaGVhZGVyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobWFwLnByb3BlcnRpZXNbMF0udmFsdWUgYXMgWWFtbFNjYWxhck5vZGUpLnZhbHVlLCAndmFsdWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0U3RyaW5nVmFsdWUoJ2tleScpLCAndmFsdWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYm9keSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgZnJvbnRtYXR0ZXIgc3RyaXBzIGRlbGltaXRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlRnJvbnRNYXR0ZXIoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmhlYWRlciwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYm9keSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tbWVudC1vbmx5IGZyb250bWF0dGVyIHN0cmlwcyBkZWxpbWl0ZXJzIGFuZCBwcmVzZXJ2ZXMgYm9keScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0JyMgbm90ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSB0ZXh0IGhlcmUuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUZyb250TWF0dGVyKGlucHV0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5oZWFkZXIsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJvZHksICdCb2R5IHRleHQgaGVyZS4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFN0cmluZ1ZhbHVlIHJldHVybnMgdGhlIHNjYWxhciBmb3IgYSBrbm93biBrZXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBteS1hZ2VudCcsXG5cdFx0XHRcdCd0b29sczogZm9vLCBiYXInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2JvZHkgY29udGVudCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VGcm9udE1hdHRlcihpbnB1dCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0U3RyaW5nVmFsdWUoJ25hbWUnKSwgJ215LWFnZW50Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5nZXRTdHJpbmdBcnJheVZhbHVlKCd0b29scycpLCBbJ2ZvbycsICdiYXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRTdHJpbmdBcnJheVZhbHVlIHJldHVybnMgYXJyYXkgZm9yIGEgc2VxdWVuY2Uga2V5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQndGFnczonLFxuXHRcdFx0XHQnICAtIGZvbycsXG5cdFx0XHRcdCcgIC0gYmFyJyxcblx0XHRcdFx0JyAgLSBiYXonLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUZyb250TWF0dGVyKGlucHV0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZ2V0U3RyaW5nQXJyYXlWYWx1ZSgndGFncycpLCBbJ2ZvbycsICdiYXInLCAnYmF6J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0U3RyaW5nQXJyYXlWYWx1ZSBzcGxpdHMgY29tbWEtc2VwYXJhdGVkIHNjYWxhciBpbnRvIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQndGFnczogZm9vLCBiYXIsIGJheicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlRnJvbnRNYXR0ZXIoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5nZXRTdHJpbmdBcnJheVZhbHVlKCd0YWdzJyksIFsnZm9vJywgJ2JhcicsICdiYXonXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRTdHJpbmdBcnJheVZhbHVlIHdyYXBzIHF1b3RlZCBzY2FsYXJzIGluIGEgc2luZ2xlLWVsZW1lbnQgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCd0YWdzOiBcImZvbywgYmFyXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUZyb250TWF0dGVyKGlucHV0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZ2V0U3RyaW5nQXJyYXlWYWx1ZSgndGFncycpLCBbJ2ZvbywgYmFyJ10pO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2VtcHR5IHN0cmluZyBwcm9kdWNlcyBlbXB0eSBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gcGFyc2VDb21tYVNlcGFyYXRlZExpc3QoJycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlIHVucXVvdGVkIGl0ZW0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KCdoZWxsbycsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0udmFsdWUsICdoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLmZvcm1hdCwgJ25vbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIHVucXVvdGVkIGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCgnZm9vLCBiYXIsIGJheicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaSA9PiBpLnZhbHVlKSwgWydmb28nLCAnYmFyJywgJ2JheiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvdWJsZS1xdW90ZWQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBWYWx1ZSBpczogXCJoZWxsb1wiLCBcIndvcmxkXCIgIFx1MjAxNCBwYXNzIGl0IGRpcmVjdGx5IGFzIGEgc3RyaW5nIHdpdGgga25vd24gb2Zmc2V0LlxuXHRcdFx0Y29uc3QgaXRlbXMgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCgnXCJoZWxsb1wiLCBcIndvcmxkXCInLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLnZhbHVlLCAnaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5mb3JtYXQsICdkb3VibGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1sxXS52YWx1ZSwgJ3dvcmxkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMV0uZm9ybWF0LCAnZG91YmxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUtcXVvdGVkIGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdChgJ2ZvbycsICdiYXInYCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS52YWx1ZSwgJ2ZvbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLmZvcm1hdCwgJ3NpbmdsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzFdLnZhbHVlLCAnYmFyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMV0uZm9ybWF0LCAnc2luZ2xlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaXhlZCBxdW90ZWQgYW5kIHVucXVvdGVkIGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdChgcGxhaW4sIFwiZG91YmxlXCIsICdzaW5nbGUnYCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2l0ZW1zWzBdLnZhbHVlLCBpdGVtc1swXS5mb3JtYXRdLCBbJ3BsYWluJywgJ25vbmUnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtpdGVtc1sxXS52YWx1ZSwgaXRlbXNbMV0uZm9ybWF0XSwgWydkb3VibGUnLCAnZG91YmxlJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbaXRlbXNbMl0udmFsdWUsIGl0ZW1zWzJdLmZvcm1hdF0sIFsnc2luZ2xlJywgJ3NpbmdsZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYWlsaW5nIHdoaXRlc3BhY2UgdHJpbW1lZCBmcm9tIHVucXVvdGVkIGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCgnICBmb28gICwgIGJhciAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS52YWx1ZSwgJ2ZvbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzFdLnZhbHVlLCAnYmFyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvZmZzZXRzIGFyZSByZWxhdGl2ZSB0byB0aGUgcHJvdmlkZWQgb2Zmc2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAnYSwgYiwgYyc7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSAxMDtcblx0XHRcdGNvbnN0IGl0ZW1zID0gcGFyc2VDb21tYVNlcGFyYXRlZExpc3QodmFsdWUsIG9mZnNldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAzKTtcblx0XHRcdC8vIEVhY2ggaXRlbSdzIHJhd1ZhbHVlIHNob3VsZCBhcHBlYXIgYXQgc3RhcnRPZmZzZXQgd2l0aGluIGBvZmZzZXQgKyB2YWx1ZWBcblx0XHRcdGNvbnN0IGRvYyA9ICcgJy5yZXBlYXQob2Zmc2V0KSArIHZhbHVlO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb2Muc3Vic3RyaW5nKGl0ZW0uc3RhcnRPZmZzZXQsIGl0ZW0uZW5kT2Zmc2V0KSwgaXRlbS5yYXdWYWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aGl0ZXNwYWNlLW9ubHkgc3RyaW5nIHByb2R1Y2VzIGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCgnICAgJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxPQUFPLGtCQUFrQiwrQkFBd0c7QUFDMUksU0FBUywrQ0FBK0M7QUFHeEQsU0FBUyxRQUFRLE9BQXFDO0FBQ3JELFFBQU0sU0FBMkIsQ0FBQztBQUNsQyxRQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU07QUFDbEMsU0FBTyxnQkFBZ0IsUUFBUSxDQUFDLEdBQUcsc0JBQXNCLEtBQUssVUFBVSxNQUFNLENBQUMsRUFBRTtBQUNqRixTQUFPO0FBQ1I7QUFHQSxTQUFTLGFBQWEsT0FBZSxNQUE0QixVQUFpRztBQUNqSyxTQUFPLEdBQUcsTUFBTSxtQ0FBbUM7QUFDbkQsU0FBTyxZQUFZLEtBQUssTUFBTSxRQUFRO0FBQ3RDLFFBQU0sU0FBUztBQUNmLFNBQU8sWUFBWSxPQUFPLE9BQU8sU0FBUyxLQUFLO0FBQy9DLE1BQUksU0FBUyxXQUFXLFFBQVc7QUFDbEMsV0FBTyxZQUFZLE9BQU8sUUFBUSxTQUFTLE1BQU07QUFBQSxFQUNsRDtBQUVBLFNBQU87QUFBQSxJQUNOLE1BQU0sVUFBVSxPQUFPLGFBQWEsT0FBTyxTQUFTO0FBQUEsSUFDcEQsT0FBTztBQUFBLElBQ1AsMEJBQTBCLE9BQU8sV0FBVyxLQUFLLE9BQU8sU0FBUyxTQUFTLE1BQU0sVUFBVSxPQUFPLGFBQWEsT0FBTyxTQUFTLENBQUMsc0JBQXNCLE9BQU8sUUFBUTtBQUFBLEVBQ3JLO0FBQ0Q7QUFHQSxTQUFTLFVBQVUsTUFBNEIsa0JBQXVDO0FBQ3JGLFNBQU8sR0FBRyxNQUFNLG1DQUFtQztB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
