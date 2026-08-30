import assert from "assert";
import { createScanner, parse, ParseErrorCode, parseTree, ScanError, SyntaxKind } from "../../common/json.js";
import { getParseErrorMessage } from "../../common/jsonErrorMessages.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function assertKinds(text, ...kinds) {
  const scanner = createScanner(text);
  let kind;
  while ((kind = scanner.scan()) !== SyntaxKind.EOF) {
    assert.strictEqual(kind, kinds.shift());
  }
  assert.strictEqual(kinds.length, 0);
}
function assertScanError(text, expectedKind, scanError) {
  const scanner = createScanner(text);
  scanner.scan();
  assert.strictEqual(scanner.getToken(), expectedKind);
  assert.strictEqual(scanner.getTokenError(), scanError);
}
function assertValidParse(input, expected, options) {
  const errors = [];
  const actual = parse(input, errors, options);
  if (errors.length !== 0) {
    assert(false, getParseErrorMessage(errors[0].error));
  }
  assert.deepStrictEqual(actual, expected);
}
function assertInvalidParse(input, expected, options) {
  const errors = [];
  const actual = parse(input, errors, options);
  assert(errors.length > 0);
  assert.deepStrictEqual(actual, expected);
}
function assertTree(input, expected, expectedErrors = [], options) {
  const errors = [];
  const actual = parseTree(input, errors, options);
  assert.deepStrictEqual(errors.map((e) => e.error, expected), expectedErrors);
  const checkParent = (node) => {
    if (node.children) {
      for (const child of node.children) {
        assert.strictEqual(node, child.parent);
        delete child.parent;
        checkParent(child);
      }
    }
  };
  checkParent(actual);
  assert.deepStrictEqual(actual, expected);
}
suite("JSON", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("tokens", () => {
    assertKinds("{", SyntaxKind.OpenBraceToken);
    assertKinds("}", SyntaxKind.CloseBraceToken);
    assertKinds("[", SyntaxKind.OpenBracketToken);
    assertKinds("]", SyntaxKind.CloseBracketToken);
    assertKinds(":", SyntaxKind.ColonToken);
    assertKinds(",", SyntaxKind.CommaToken);
  });
  test("comments", () => {
    assertKinds("// this is a comment", SyntaxKind.LineCommentTrivia);
    assertKinds("// this is a comment\n", SyntaxKind.LineCommentTrivia, SyntaxKind.LineBreakTrivia);
    assertKinds("/* this is a comment*/", SyntaxKind.BlockCommentTrivia);
    assertKinds("/* this is a \r\ncomment*/", SyntaxKind.BlockCommentTrivia);
    assertKinds("/* this is a \ncomment*/", SyntaxKind.BlockCommentTrivia);
    assertKinds("/* this is a", SyntaxKind.BlockCommentTrivia);
    assertKinds("/* this is a \ncomment", SyntaxKind.BlockCommentTrivia);
    assertKinds("/ ttt", SyntaxKind.Unknown, SyntaxKind.Trivia, SyntaxKind.Unknown);
  });
  test("strings", () => {
    assertKinds('"test"', SyntaxKind.StringLiteral);
    assertKinds('"\\""', SyntaxKind.StringLiteral);
    assertKinds('"\\/"', SyntaxKind.StringLiteral);
    assertKinds('"\\b"', SyntaxKind.StringLiteral);
    assertKinds('"\\f"', SyntaxKind.StringLiteral);
    assertKinds('"\\n"', SyntaxKind.StringLiteral);
    assertKinds('"\\r"', SyntaxKind.StringLiteral);
    assertKinds('"\\t"', SyntaxKind.StringLiteral);
    assertKinds('"\\v"', SyntaxKind.StringLiteral);
    assertKinds('"\u88FF"', SyntaxKind.StringLiteral);
    assertKinds('"\u200B\u2028"', SyntaxKind.StringLiteral);
    assertKinds('"test', SyntaxKind.StringLiteral);
    assertKinds('"test\n"', SyntaxKind.StringLiteral, SyntaxKind.LineBreakTrivia, SyntaxKind.StringLiteral);
    assertScanError('"	"', SyntaxKind.StringLiteral, ScanError.InvalidCharacter);
    assertScanError('"	 "', SyntaxKind.StringLiteral, ScanError.InvalidCharacter);
  });
  test("numbers", () => {
    assertKinds("0", SyntaxKind.NumericLiteral);
    assertKinds("0.1", SyntaxKind.NumericLiteral);
    assertKinds("-0.1", SyntaxKind.NumericLiteral);
    assertKinds("-1", SyntaxKind.NumericLiteral);
    assertKinds("1", SyntaxKind.NumericLiteral);
    assertKinds("123456789", SyntaxKind.NumericLiteral);
    assertKinds("10", SyntaxKind.NumericLiteral);
    assertKinds("90", SyntaxKind.NumericLiteral);
    assertKinds("90E+123", SyntaxKind.NumericLiteral);
    assertKinds("90e+123", SyntaxKind.NumericLiteral);
    assertKinds("90e-123", SyntaxKind.NumericLiteral);
    assertKinds("90E-123", SyntaxKind.NumericLiteral);
    assertKinds("90E123", SyntaxKind.NumericLiteral);
    assertKinds("90e123", SyntaxKind.NumericLiteral);
    assertKinds("01", SyntaxKind.NumericLiteral, SyntaxKind.NumericLiteral);
    assertKinds("-01", SyntaxKind.NumericLiteral, SyntaxKind.NumericLiteral);
    assertKinds("-", SyntaxKind.Unknown);
    assertKinds(".0", SyntaxKind.Unknown);
  });
  test("keywords: true, false, null", () => {
    assertKinds("true", SyntaxKind.TrueKeyword);
    assertKinds("false", SyntaxKind.FalseKeyword);
    assertKinds("null", SyntaxKind.NullKeyword);
    assertKinds(
      "true false null",
      SyntaxKind.TrueKeyword,
      SyntaxKind.Trivia,
      SyntaxKind.FalseKeyword,
      SyntaxKind.Trivia,
      SyntaxKind.NullKeyword
    );
    assertKinds("nulllll", SyntaxKind.Unknown);
    assertKinds("True", SyntaxKind.Unknown);
    assertKinds("foo-bar", SyntaxKind.Unknown);
    assertKinds("foo bar", SyntaxKind.Unknown, SyntaxKind.Trivia, SyntaxKind.Unknown);
  });
  test("trivia", () => {
    assertKinds(" ", SyntaxKind.Trivia);
    assertKinds("  	  ", SyntaxKind.Trivia);
    assertKinds("  	  \n  	  ", SyntaxKind.Trivia, SyntaxKind.LineBreakTrivia, SyntaxKind.Trivia);
    assertKinds("\r\n", SyntaxKind.LineBreakTrivia);
    assertKinds("\r", SyntaxKind.LineBreakTrivia);
    assertKinds("\n", SyntaxKind.LineBreakTrivia);
    assertKinds("\n\r", SyntaxKind.LineBreakTrivia, SyntaxKind.LineBreakTrivia);
    assertKinds("\n   \n", SyntaxKind.LineBreakTrivia, SyntaxKind.Trivia, SyntaxKind.LineBreakTrivia);
  });
  test("parse: literals", () => {
    assertValidParse("true", true);
    assertValidParse("false", false);
    assertValidParse("null", null);
    assertValidParse('"foo"', "foo");
    assertValidParse('"\\"-\\\\-\\/-\\b-\\f-\\n-\\r-\\t"', '"-\\-/-\b-\f-\n-\r-	');
    assertValidParse('"\\u00DC"', "\xDC");
    assertValidParse("9", 9);
    assertValidParse("-9", -9);
    assertValidParse("0.129", 0.129);
    assertValidParse("23e3", 23e3);
    assertValidParse("1.2E+3", 1200);
    assertValidParse("1.2E-3", 12e-4);
    assertValidParse("1.2E-3 // comment", 12e-4);
  });
  test("parse: objects", () => {
    assertValidParse("{}", {});
    assertValidParse('{ "foo": true }', { foo: true });
    assertValidParse('{ "bar": 8, "xoo": "foo" }', { bar: 8, xoo: "foo" });
    assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} });
    assertValidParse('{ "a": false, "b": true, "c": [ 7.4 ] }', { a: false, b: true, c: [7.4] });
    assertValidParse('{ "lineComment": "//", "blockComment": ["/*", "*/"], "brackets": [ ["{", "}"], ["[", "]"], ["(", ")"] ] }', { lineComment: "//", blockComment: ["/*", "*/"], brackets: [["{", "}"], ["[", "]"], ["(", ")"]] });
    assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} });
    assertValidParse('{ "hello": { "again": { "inside": 5 }, "world": 1 }}', { hello: { again: { inside: 5 }, world: 1 } });
    assertValidParse('{ "foo": /*hello*/true }', { foo: true });
  });
  test("parse: arrays", () => {
    assertValidParse("[]", []);
    assertValidParse("[ [],  [ [] ]]", [[], [[]]]);
    assertValidParse("[ 1, 2, 3 ]", [1, 2, 3]);
    assertValidParse('[ { "a": null } ]', [{ a: null }]);
  });
  test("parse: objects with errors", () => {
    assertInvalidParse("{,}", {});
    assertInvalidParse('{ "foo": true, }', { foo: true }, { allowTrailingComma: false });
    assertInvalidParse('{ "bar": 8 "xoo": "foo" }', { bar: 8, xoo: "foo" });
    assertInvalidParse('{ ,"bar": 8 }', { bar: 8 });
    assertInvalidParse('{ ,"bar": 8, "foo" }', { bar: 8 });
    assertInvalidParse('{ "bar": 8, "foo": }', { bar: 8 });
    assertInvalidParse('{ 8, "foo": 9 }', { foo: 9 });
  });
  test("parse: array with errors", () => {
    assertInvalidParse("[,]", []);
    assertInvalidParse("[ 1, 2, ]", [1, 2], { allowTrailingComma: false });
    assertInvalidParse("[ 1 2, 3 ]", [1, 2, 3]);
    assertInvalidParse("[ ,1, 2, 3 ]", [1, 2, 3]);
    assertInvalidParse("[ ,1, 2, 3, ]", [1, 2, 3], { allowTrailingComma: false });
  });
  test("parse: disallow commments", () => {
    const options = { disallowComments: true };
    assertValidParse('[ 1, 2, null, "foo" ]', [1, 2, null, "foo"], options);
    assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} }, options);
    assertInvalidParse('{ "foo": /*comment*/ true }', { foo: true }, options);
  });
  test("parse: trailing comma", () => {
    assertValidParse('{ "hello": [], }', { hello: [] });
    let options = { allowTrailingComma: true };
    assertValidParse('{ "hello": [], }', { hello: [] }, options);
    assertValidParse('{ "hello": [] }', { hello: [] }, options);
    assertValidParse('{ "hello": [], "world": {}, }', { hello: [], world: {} }, options);
    assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} }, options);
    assertValidParse('{ "hello": [1,] }', { hello: [1] }, options);
    options = { allowTrailingComma: false };
    assertInvalidParse('{ "hello": [], }', { hello: [] }, options);
    assertInvalidParse('{ "hello": [], "world": {}, }', { hello: [], world: {} }, options);
  });
  test("tree: literals", () => {
    assertTree("true", { type: "boolean", offset: 0, length: 4, value: true });
    assertTree("false", { type: "boolean", offset: 0, length: 5, value: false });
    assertTree("null", { type: "null", offset: 0, length: 4, value: null });
    assertTree("23", { type: "number", offset: 0, length: 2, value: 23 });
    assertTree("-1.93e-19", { type: "number", offset: 0, length: 9, value: -193e-21 });
    assertTree('"hello"', { type: "string", offset: 0, length: 7, value: "hello" });
  });
  test("tree: arrays", () => {
    assertTree("[]", { type: "array", offset: 0, length: 2, children: [] });
    assertTree("[ 1 ]", { type: "array", offset: 0, length: 5, children: [{ type: "number", offset: 2, length: 1, value: 1 }] });
    assertTree('[ 1,"x"]', {
      type: "array",
      offset: 0,
      length: 8,
      children: [
        { type: "number", offset: 2, length: 1, value: 1 },
        { type: "string", offset: 4, length: 3, value: "x" }
      ]
    });
    assertTree("[[]]", {
      type: "array",
      offset: 0,
      length: 4,
      children: [
        { type: "array", offset: 1, length: 2, children: [] }
      ]
    });
  });
  test("tree: objects", () => {
    assertTree("{ }", { type: "object", offset: 0, length: 3, children: [] });
    assertTree('{ "val": 1 }', {
      type: "object",
      offset: 0,
      length: 12,
      children: [
        {
          type: "property",
          offset: 2,
          length: 8,
          colonOffset: 7,
          children: [
            { type: "string", offset: 2, length: 5, value: "val" },
            { type: "number", offset: 9, length: 1, value: 1 }
          ]
        }
      ]
    });
    assertTree(
      '{"id": "$", "v": [ null, null] }',
      {
        type: "object",
        offset: 0,
        length: 32,
        children: [
          {
            type: "property",
            offset: 1,
            length: 9,
            colonOffset: 5,
            children: [
              { type: "string", offset: 1, length: 4, value: "id" },
              { type: "string", offset: 7, length: 3, value: "$" }
            ]
          },
          {
            type: "property",
            offset: 12,
            length: 18,
            colonOffset: 15,
            children: [
              { type: "string", offset: 12, length: 3, value: "v" },
              {
                type: "array",
                offset: 17,
                length: 13,
                children: [
                  { type: "null", offset: 19, length: 4, value: null },
                  { type: "null", offset: 25, length: 4, value: null }
                ]
              }
            ]
          }
        ]
      }
    );
    assertTree(
      '{  "id": { "foo": { } } , }',
      {
        type: "object",
        offset: 0,
        length: 27,
        children: [
          {
            type: "property",
            offset: 3,
            length: 20,
            colonOffset: 7,
            children: [
              { type: "string", offset: 3, length: 4, value: "id" },
              {
                type: "object",
                offset: 9,
                length: 14,
                children: [
                  {
                    type: "property",
                    offset: 11,
                    length: 10,
                    colonOffset: 16,
                    children: [
                      { type: "string", offset: 11, length: 5, value: "foo" },
                      { type: "object", offset: 18, length: 3, children: [] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      [ParseErrorCode.PropertyNameExpected, ParseErrorCode.ValueExpected],
      { allowTrailingComma: false }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGpzb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjcmVhdGVTY2FubmVyLCBOb2RlLCBwYXJzZSwgUGFyc2VFcnJvciwgUGFyc2VFcnJvckNvZGUsIFBhcnNlT3B0aW9ucywgcGFyc2VUcmVlLCBTY2FuRXJyb3IsIFN5bnRheEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBnZXRQYXJzZUVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9qc29uRXJyb3JNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuZnVuY3Rpb24gYXNzZXJ0S2luZHModGV4dDogc3RyaW5nLCAuLi5raW5kczogU3ludGF4S2luZFtdKTogdm9pZCB7XG5cdGNvbnN0IHNjYW5uZXIgPSBjcmVhdGVTY2FubmVyKHRleHQpO1xuXHRsZXQga2luZDogU3ludGF4S2luZDtcblx0d2hpbGUgKChraW5kID0gc2Nhbm5lci5zY2FuKCkpICE9PSBTeW50YXhLaW5kLkVPRikge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChraW5kLCBraW5kcy5zaGlmdCgpKTtcblx0fVxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoa2luZHMubGVuZ3RoLCAwKTtcbn1cbmZ1bmN0aW9uIGFzc2VydFNjYW5FcnJvcih0ZXh0OiBzdHJpbmcsIGV4cGVjdGVkS2luZDogU3ludGF4S2luZCwgc2NhbkVycm9yOiBTY2FuRXJyb3IpOiB2b2lkIHtcblx0Y29uc3Qgc2Nhbm5lciA9IGNyZWF0ZVNjYW5uZXIodGV4dCk7XG5cdHNjYW5uZXIuc2NhbigpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5nZXRUb2tlbigpLCBleHBlY3RlZEtpbmQpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5nZXRUb2tlbkVycm9yKCksIHNjYW5FcnJvcik7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFZhbGlkUGFyc2UoaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IGFueSwgb3B0aW9ucz86IFBhcnNlT3B0aW9ucyk6IHZvaWQge1xuXHRjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRjb25zdCBhY3R1YWwgPSBwYXJzZShpbnB1dCwgZXJyb3JzLCBvcHRpb25zKTtcblxuXHRpZiAoZXJyb3JzLmxlbmd0aCAhPT0gMCkge1xuXHRcdGFzc2VydChmYWxzZSwgZ2V0UGFyc2VFcnJvck1lc3NhZ2UoZXJyb3JzWzBdLmVycm9yKSk7XG5cdH1cblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0SW52YWxpZFBhcnNlKGlucHV0OiBzdHJpbmcsIGV4cGVjdGVkOiBhbnksIG9wdGlvbnM/OiBQYXJzZU9wdGlvbnMpOiB2b2lkIHtcblx0Y29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcblx0Y29uc3QgYWN0dWFsID0gcGFyc2UoaW5wdXQsIGVycm9ycywgb3B0aW9ucyk7XG5cblx0YXNzZXJ0KGVycm9ycy5sZW5ndGggPiAwKTtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VHJlZShpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogYW55LCBleHBlY3RlZEVycm9yczogbnVtYmVyW10gPSBbXSwgb3B0aW9ucz86IFBhcnNlT3B0aW9ucyk6IHZvaWQge1xuXHRjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRjb25zdCBhY3R1YWwgPSBwYXJzZVRyZWUoaW5wdXQsIGVycm9ycywgb3B0aW9ucyk7XG5cblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlcnJvcnMubWFwKGUgPT4gZS5lcnJvciwgZXhwZWN0ZWQpLCBleHBlY3RlZEVycm9ycyk7XG5cdGNvbnN0IGNoZWNrUGFyZW50ID0gKG5vZGU6IE5vZGUpID0+IHtcblx0XHRpZiAobm9kZS5jaGlsZHJlbikge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLCBjaGlsZC5wYXJlbnQpO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0ZGVsZXRlICg8YW55PmNoaWxkKS5wYXJlbnQ7IC8vIGRlbGV0ZSB0byBhdm9pZCByZWN1cnNpb24gaW4gZGVlcCBlcXVhbFxuXHRcdFx0XHRjaGVja1BhcmVudChjaGlsZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXHRjaGVja1BhcmVudChhY3R1YWwpO1xuXG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG59XG5cbnN1aXRlKCdKU09OJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Rva2VucycsICgpID0+IHtcblx0XHRhc3NlcnRLaW5kcygneycsIFN5bnRheEtpbmQuT3BlbkJyYWNlVG9rZW4pO1xuXHRcdGFzc2VydEtpbmRzKCd9JywgU3ludGF4S2luZC5DbG9zZUJyYWNlVG9rZW4pO1xuXHRcdGFzc2VydEtpbmRzKCdbJywgU3ludGF4S2luZC5PcGVuQnJhY2tldFRva2VuKTtcblx0XHRhc3NlcnRLaW5kcygnXScsIFN5bnRheEtpbmQuQ2xvc2VCcmFja2V0VG9rZW4pO1xuXHRcdGFzc2VydEtpbmRzKCc6JywgU3ludGF4S2luZC5Db2xvblRva2VuKTtcblx0XHRhc3NlcnRLaW5kcygnLCcsIFN5bnRheEtpbmQuQ29tbWFUb2tlbik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbW1lbnRzJywgKCkgPT4ge1xuXHRcdGFzc2VydEtpbmRzKCcvLyB0aGlzIGlzIGEgY29tbWVudCcsIFN5bnRheEtpbmQuTGluZUNvbW1lbnRUcml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCcvLyB0aGlzIGlzIGEgY29tbWVudFxcbicsIFN5bnRheEtpbmQuTGluZUNvbW1lbnRUcml2aWEsIFN5bnRheEtpbmQuTGluZUJyZWFrVHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnLyogdGhpcyBpcyBhIGNvbW1lbnQqLycsIFN5bnRheEtpbmQuQmxvY2tDb21tZW50VHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnLyogdGhpcyBpcyBhIFxcclxcbmNvbW1lbnQqLycsIFN5bnRheEtpbmQuQmxvY2tDb21tZW50VHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnLyogdGhpcyBpcyBhIFxcbmNvbW1lbnQqLycsIFN5bnRheEtpbmQuQmxvY2tDb21tZW50VHJpdmlhKTtcblxuXHRcdC8vIHVuZXhwZWN0ZWQgZW5kXG5cdFx0YXNzZXJ0S2luZHMoJy8qIHRoaXMgaXMgYScsIFN5bnRheEtpbmQuQmxvY2tDb21tZW50VHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnLyogdGhpcyBpcyBhIFxcbmNvbW1lbnQnLCBTeW50YXhLaW5kLkJsb2NrQ29tbWVudFRyaXZpYSk7XG5cblx0XHQvLyBicm9rZW4gY29tbWVudFxuXHRcdGFzc2VydEtpbmRzKCcvIHR0dCcsIFN5bnRheEtpbmQuVW5rbm93biwgU3ludGF4S2luZC5Ucml2aWEsIFN5bnRheEtpbmQuVW5rbm93bik7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmluZ3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0S2luZHMoJ1widGVzdFwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXFxcXCJcIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJ1wiXFxcXC9cIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJ1wiXFxcXGJcIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJ1wiXFxcXGZcIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJ1wiXFxcXG5cIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJ1wiXFxcXHJcIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJ1wiXFxcXHRcIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJ1wiXFxcXHZcIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJ1wiXFx1ODhmZlwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcdTIwMEJcXHUyMDI4XCInLCBTeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwpO1xuXG5cdFx0Ly8gdW5leHBlY3RlZCBlbmRcblx0XHRhc3NlcnRLaW5kcygnXCJ0ZXN0JywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJ0ZXN0XFxuXCInLCBTeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwsIFN5bnRheEtpbmQuTGluZUJyZWFrVHJpdmlhLCBTeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwpO1xuXG5cdFx0Ly8gaW52YWxpZCBjaGFyYWN0ZXJzXG5cdFx0YXNzZXJ0U2NhbkVycm9yKCdcIlxcdFwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsLCBTY2FuRXJyb3IuSW52YWxpZENoYXJhY3Rlcik7XG5cdFx0YXNzZXJ0U2NhbkVycm9yKCdcIlxcdCBcIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCwgU2NhbkVycm9yLkludmFsaWRDaGFyYWN0ZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdudW1iZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydEtpbmRzKCcwJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJzAuMScsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCctMC4xJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJy0xJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJzEnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnMTIzNDU2Nzg5JywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJzEwJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJzkwJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJzkwRSsxMjMnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnOTBlKzEyMycsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCc5MGUtMTIzJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJzkwRS0xMjMnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnOTBFMTIzJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJzkwZTEyMycsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpO1xuXG5cdFx0Ly8gemVybyBoYW5kbGluZ1xuXHRcdGFzc2VydEtpbmRzKCcwMScsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCctMDEnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblxuXHRcdC8vIHVuZXhwZWN0ZWQgZW5kXG5cdFx0YXNzZXJ0S2luZHMoJy0nLCBTeW50YXhLaW5kLlVua25vd24pO1xuXHRcdGFzc2VydEtpbmRzKCcuMCcsIFN5bnRheEtpbmQuVW5rbm93bik7XG5cdH0pO1xuXG5cdHRlc3QoJ2tleXdvcmRzOiB0cnVlLCBmYWxzZSwgbnVsbCcsICgpID0+IHtcblx0XHRhc3NlcnRLaW5kcygndHJ1ZScsIFN5bnRheEtpbmQuVHJ1ZUtleXdvcmQpO1xuXHRcdGFzc2VydEtpbmRzKCdmYWxzZScsIFN5bnRheEtpbmQuRmFsc2VLZXl3b3JkKTtcblx0XHRhc3NlcnRLaW5kcygnbnVsbCcsIFN5bnRheEtpbmQuTnVsbEtleXdvcmQpO1xuXG5cblx0XHRhc3NlcnRLaW5kcygndHJ1ZSBmYWxzZSBudWxsJyxcblx0XHRcdFN5bnRheEtpbmQuVHJ1ZUtleXdvcmQsXG5cdFx0XHRTeW50YXhLaW5kLlRyaXZpYSxcblx0XHRcdFN5bnRheEtpbmQuRmFsc2VLZXl3b3JkLFxuXHRcdFx0U3ludGF4S2luZC5Ucml2aWEsXG5cdFx0XHRTeW50YXhLaW5kLk51bGxLZXl3b3JkKTtcblxuXHRcdC8vIGludmFsaWQgd29yZHNcblx0XHRhc3NlcnRLaW5kcygnbnVsbGxsbCcsIFN5bnRheEtpbmQuVW5rbm93bik7XG5cdFx0YXNzZXJ0S2luZHMoJ1RydWUnLCBTeW50YXhLaW5kLlVua25vd24pO1xuXHRcdGFzc2VydEtpbmRzKCdmb28tYmFyJywgU3ludGF4S2luZC5Vbmtub3duKTtcblx0XHRhc3NlcnRLaW5kcygnZm9vIGJhcicsIFN5bnRheEtpbmQuVW5rbm93biwgU3ludGF4S2luZC5Ucml2aWEsIFN5bnRheEtpbmQuVW5rbm93bik7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaXZpYScsICgpID0+IHtcblx0XHRhc3NlcnRLaW5kcygnICcsIFN5bnRheEtpbmQuVHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnICBcXHQgICcsIFN5bnRheEtpbmQuVHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnICBcXHQgIFxcbiAgXFx0ICAnLCBTeW50YXhLaW5kLlRyaXZpYSwgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEsIFN5bnRheEtpbmQuVHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnXFxyXFxuJywgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCdcXHInLCBTeW50YXhLaW5kLkxpbmVCcmVha1RyaXZpYSk7XG5cdFx0YXNzZXJ0S2luZHMoJ1xcbicsIFN5bnRheEtpbmQuTGluZUJyZWFrVHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnXFxuXFxyJywgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEsIFN5bnRheEtpbmQuTGluZUJyZWFrVHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnXFxuICAgXFxuJywgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEsIFN5bnRheEtpbmQuVHJpdmlhLCBTeW50YXhLaW5kLkxpbmVCcmVha1RyaXZpYSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlOiBsaXRlcmFscycsICgpID0+IHtcblxuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3RydWUnLCB0cnVlKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdmYWxzZScsIGZhbHNlKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdudWxsJywgbnVsbCk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnXCJmb29cIicsICdmb28nKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdcIlxcXFxcIi1cXFxcXFxcXC1cXFxcLy1cXFxcYi1cXFxcZi1cXFxcbi1cXFxcci1cXFxcdFwiJywgJ1wiLVxcXFwtLy1cXGItXFxmLVxcbi1cXHItXFx0Jyk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnXCJcXFxcdTAwRENcIicsICdcdTAwREMnKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCc5JywgOSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnLTknLCAtOSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnMC4xMjknLCAwLjEyOSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnMjNlMycsIDIzZTMpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJzEuMkUrMycsIDEuMkUrMyk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnMS4yRS0zJywgMS4yRS0zKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCcxLjJFLTMgLy8gY29tbWVudCcsIDEuMkUtMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlOiBvYmplY3RzJywgKCkgPT4ge1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3t9Jywge30pO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3sgXCJmb29cIjogdHJ1ZSB9JywgeyBmb286IHRydWUgfSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImJhclwiOiA4LCBcInhvb1wiOiBcImZvb1wiIH0nLCB7IGJhcjogOCwgeG9vOiAnZm9vJyB9KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10sIFwid29ybGRcIjoge30gfScsIHsgaGVsbG86IFtdLCB3b3JsZDoge30gfSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImFcIjogZmFsc2UsIFwiYlwiOiB0cnVlLCBcImNcIjogWyA3LjQgXSB9JywgeyBhOiBmYWxzZSwgYjogdHJ1ZSwgYzogWzcuNF0gfSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImxpbmVDb21tZW50XCI6IFwiLy9cIiwgXCJibG9ja0NvbW1lbnRcIjogW1wiLypcIiwgXCIqL1wiXSwgXCJicmFja2V0c1wiOiBbIFtcIntcIiwgXCJ9XCJdLCBbXCJbXCIsIFwiXVwiXSwgW1wiKFwiLCBcIilcIl0gXSB9JywgeyBsaW5lQ29tbWVudDogJy8vJywgYmxvY2tDb21tZW50OiBbJy8qJywgJyovJ10sIGJyYWNrZXRzOiBbWyd7JywgJ30nXSwgWydbJywgJ10nXSwgWycoJywgJyknXV0gfSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImhlbGxvXCI6IFtdLCBcIndvcmxkXCI6IHt9IH0nLCB7IGhlbGxvOiBbXSwgd29ybGQ6IHt9IH0pO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3sgXCJoZWxsb1wiOiB7IFwiYWdhaW5cIjogeyBcImluc2lkZVwiOiA1IH0sIFwid29ybGRcIjogMSB9fScsIHsgaGVsbG86IHsgYWdhaW46IHsgaW5zaWRlOiA1IH0sIHdvcmxkOiAxIH0gfSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImZvb1wiOiAvKmhlbGxvKi90cnVlIH0nLCB7IGZvbzogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2U6IGFycmF5cycsICgpID0+IHtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdbXScsIFtdKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdbIFtdLCAgWyBbXSBdXScsIFtbXSwgW1tdXV0pO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ1sgMSwgMiwgMyBdJywgWzEsIDIsIDNdKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdbIHsgXCJhXCI6IG51bGwgfSBdJywgW3sgYTogbnVsbCB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlOiBvYmplY3RzIHdpdGggZXJyb3JzJywgKCkgPT4ge1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgneyx9Jywge30pO1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgneyBcImZvb1wiOiB0cnVlLCB9JywgeyBmb286IHRydWUgfSwgeyBhbGxvd1RyYWlsaW5nQ29tbWE6IGZhbHNlIH0pO1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgneyBcImJhclwiOiA4IFwieG9vXCI6IFwiZm9vXCIgfScsIHsgYmFyOiA4LCB4b286ICdmb28nIH0pO1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgneyAsXCJiYXJcIjogOCB9JywgeyBiYXI6IDggfSk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCd7ICxcImJhclwiOiA4LCBcImZvb1wiIH0nLCB7IGJhcjogOCB9KTtcblx0XHRhc3NlcnRJbnZhbGlkUGFyc2UoJ3sgXCJiYXJcIjogOCwgXCJmb29cIjogfScsIHsgYmFyOiA4IH0pO1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgneyA4LCBcImZvb1wiOiA5IH0nLCB7IGZvbzogOSB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2U6IGFycmF5IHdpdGggZXJyb3JzJywgKCkgPT4ge1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgnWyxdJywgW10pO1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgnWyAxLCAyLCBdJywgWzEsIDJdLCB7IGFsbG93VHJhaWxpbmdDb21tYTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCdbIDEgMiwgMyBdJywgWzEsIDIsIDNdKTtcblx0XHRhc3NlcnRJbnZhbGlkUGFyc2UoJ1sgLDEsIDIsIDMgXScsIFsxLCAyLCAzXSk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCdbICwxLCAyLCAzLCBdJywgWzEsIDIsIDNdLCB7IGFsbG93VHJhaWxpbmdDb21tYTogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlOiBkaXNhbGxvdyBjb21tbWVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHsgZGlzYWxsb3dDb21tZW50czogdHJ1ZSB9O1xuXG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnWyAxLCAyLCBudWxsLCBcImZvb1wiIF0nLCBbMSwgMiwgbnVsbCwgJ2ZvbyddLCBvcHRpb25zKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10sIFwid29ybGRcIjoge30gfScsIHsgaGVsbG86IFtdLCB3b3JsZDoge30gfSwgb3B0aW9ucyk7XG5cblx0XHRhc3NlcnRJbnZhbGlkUGFyc2UoJ3sgXCJmb29cIjogLypjb21tZW50Ki8gdHJ1ZSB9JywgeyBmb286IHRydWUgfSwgb3B0aW9ucyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlOiB0cmFpbGluZyBjb21tYScsICgpID0+IHtcblx0XHQvLyBkZWZhdWx0IGlzIGFsbG93XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImhlbGxvXCI6IFtdLCB9JywgeyBoZWxsbzogW10gfSk7XG5cblx0XHRsZXQgb3B0aW9ucyA9IHsgYWxsb3dUcmFpbGluZ0NvbW1hOiB0cnVlIH07XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImhlbGxvXCI6IFtdLCB9JywgeyBoZWxsbzogW10gfSwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImhlbGxvXCI6IFtdIH0nLCB7IGhlbGxvOiBbXSB9LCBvcHRpb25zKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10sIFwid29ybGRcIjoge30sIH0nLCB7IGhlbGxvOiBbXSwgd29ybGQ6IHt9IH0sIG9wdGlvbnMpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3sgXCJoZWxsb1wiOiBbXSwgXCJ3b3JsZFwiOiB7fSB9JywgeyBoZWxsbzogW10sIHdvcmxkOiB7fSB9LCBvcHRpb25zKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogWzEsXSB9JywgeyBoZWxsbzogWzFdIH0sIG9wdGlvbnMpO1xuXG5cdFx0b3B0aW9ucyA9IHsgYWxsb3dUcmFpbGluZ0NvbW1hOiBmYWxzZSB9O1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgneyBcImhlbGxvXCI6IFtdLCB9JywgeyBoZWxsbzogW10gfSwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10sIFwid29ybGRcIjoge30sIH0nLCB7IGhlbGxvOiBbXSwgd29ybGQ6IHt9IH0sIG9wdGlvbnMpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmVlOiBsaXRlcmFscycsICgpID0+IHtcblx0XHRhc3NlcnRUcmVlKCd0cnVlJywgeyB0eXBlOiAnYm9vbGVhbicsIG9mZnNldDogMCwgbGVuZ3RoOiA0LCB2YWx1ZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnRUcmVlKCdmYWxzZScsIHsgdHlwZTogJ2Jvb2xlYW4nLCBvZmZzZXQ6IDAsIGxlbmd0aDogNSwgdmFsdWU6IGZhbHNlIH0pO1xuXHRcdGFzc2VydFRyZWUoJ251bGwnLCB7IHR5cGU6ICdudWxsJywgb2Zmc2V0OiAwLCBsZW5ndGg6IDQsIHZhbHVlOiBudWxsIH0pO1xuXHRcdGFzc2VydFRyZWUoJzIzJywgeyB0eXBlOiAnbnVtYmVyJywgb2Zmc2V0OiAwLCBsZW5ndGg6IDIsIHZhbHVlOiAyMyB9KTtcblx0XHRhc3NlcnRUcmVlKCctMS45M2UtMTknLCB7IHR5cGU6ICdudW1iZXInLCBvZmZzZXQ6IDAsIGxlbmd0aDogOSwgdmFsdWU6IC0xLjkzZS0xOSB9KTtcblx0XHRhc3NlcnRUcmVlKCdcImhlbGxvXCInLCB7IHR5cGU6ICdzdHJpbmcnLCBvZmZzZXQ6IDAsIGxlbmd0aDogNywgdmFsdWU6ICdoZWxsbycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWU6IGFycmF5cycsICgpID0+IHtcblx0XHRhc3NlcnRUcmVlKCdbXScsIHsgdHlwZTogJ2FycmF5Jywgb2Zmc2V0OiAwLCBsZW5ndGg6IDIsIGNoaWxkcmVuOiBbXSB9KTtcblx0XHRhc3NlcnRUcmVlKCdbIDEgXScsIHsgdHlwZTogJ2FycmF5Jywgb2Zmc2V0OiAwLCBsZW5ndGg6IDUsIGNoaWxkcmVuOiBbeyB0eXBlOiAnbnVtYmVyJywgb2Zmc2V0OiAyLCBsZW5ndGg6IDEsIHZhbHVlOiAxIH1dIH0pO1xuXHRcdGFzc2VydFRyZWUoJ1sgMSxcInhcIl0nLCB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLCBvZmZzZXQ6IDAsIGxlbmd0aDogOCwgY2hpbGRyZW46IFtcblx0XHRcdFx0eyB0eXBlOiAnbnVtYmVyJywgb2Zmc2V0OiAyLCBsZW5ndGg6IDEsIHZhbHVlOiAxIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIG9mZnNldDogNCwgbGVuZ3RoOiAzLCB2YWx1ZTogJ3gnIH1cblx0XHRcdF1cblx0XHR9KTtcblx0XHRhc3NlcnRUcmVlKCdbW11dJywge1xuXHRcdFx0dHlwZTogJ2FycmF5Jywgb2Zmc2V0OiAwLCBsZW5ndGg6IDQsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdHsgdHlwZTogJ2FycmF5Jywgb2Zmc2V0OiAxLCBsZW5ndGg6IDIsIGNoaWxkcmVuOiBbXSB9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWU6IG9iamVjdHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0VHJlZSgneyB9JywgeyB0eXBlOiAnb2JqZWN0Jywgb2Zmc2V0OiAwLCBsZW5ndGg6IDMsIGNoaWxkcmVuOiBbXSB9KTtcblx0XHRhc3NlcnRUcmVlKCd7IFwidmFsXCI6IDEgfScsIHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLCBvZmZzZXQ6IDAsIGxlbmd0aDogMTIsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAncHJvcGVydHknLCBvZmZzZXQ6IDIsIGxlbmd0aDogOCwgY29sb25PZmZzZXQ6IDcsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBvZmZzZXQ6IDIsIGxlbmd0aDogNSwgdmFsdWU6ICd2YWwnIH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdudW1iZXInLCBvZmZzZXQ6IDksIGxlbmd0aDogMSwgdmFsdWU6IDEgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHRcdGFzc2VydFRyZWUoJ3tcImlkXCI6IFwiJFwiLCBcInZcIjogWyBudWxsLCBudWxsXSB9Jyxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsIG9mZnNldDogMCwgbGVuZ3RoOiAzMiwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAncHJvcGVydHknLCBvZmZzZXQ6IDEsIGxlbmd0aDogOSwgY29sb25PZmZzZXQ6IDUsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIG9mZnNldDogMSwgbGVuZ3RoOiA0LCB2YWx1ZTogJ2lkJyB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBvZmZzZXQ6IDcsIGxlbmd0aDogMywgdmFsdWU6ICckJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAncHJvcGVydHknLCBvZmZzZXQ6IDEyLCBsZW5ndGg6IDE4LCBjb2xvbk9mZnNldDogMTUsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIG9mZnNldDogMTIsIGxlbmd0aDogMywgdmFsdWU6ICd2JyB9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jywgb2Zmc2V0OiAxNywgbGVuZ3RoOiAxMywgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ251bGwnLCBvZmZzZXQ6IDE5LCBsZW5ndGg6IDQsIHZhbHVlOiBudWxsIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdudWxsJywgb2Zmc2V0OiAyNSwgbGVuZ3RoOiA0LCB2YWx1ZTogbnVsbCB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0KTtcblx0XHRhc3NlcnRUcmVlKCd7ICBcImlkXCI6IHsgXCJmb29cIjogeyB9IH0gLCB9Jyxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsIG9mZnNldDogMCwgbGVuZ3RoOiAyNywgY2hpbGRyZW46IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAncHJvcGVydHknLCBvZmZzZXQ6IDMsIGxlbmd0aDogMjAsIGNvbG9uT2Zmc2V0OiA3LCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBvZmZzZXQ6IDMsIGxlbmd0aDogNCwgdmFsdWU6ICdpZCcgfSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLCBvZmZzZXQ6IDksIGxlbmd0aDogMTQsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdwcm9wZXJ0eScsIG9mZnNldDogMTEsIGxlbmd0aDogMTAsIGNvbG9uT2Zmc2V0OiAxNiwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBvZmZzZXQ6IDExLCBsZW5ndGg6IDUsIHZhbHVlOiAnZm9vJyB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ29iamVjdCcsIG9mZnNldDogMTgsIGxlbmd0aDogMywgY2hpbGRyZW46IFtdIH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdFx0LCBbUGFyc2VFcnJvckNvZGUuUHJvcGVydHlOYW1lRXhwZWN0ZWQsIFBhcnNlRXJyb3JDb2RlLlZhbHVlRXhwZWN0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
