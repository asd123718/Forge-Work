import * as matchers from "../../common/problemMatcher.js";
import assert from "assert";
import { ValidationState, ValidationStatus } from "../../../../../base/common/parsers.js";
import { MarkerSeverity } from "../../../../../platform/markers/common/markers.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
class ProblemReporter {
  constructor() {
    this._validationStatus = new ValidationStatus();
    this._messages = [];
  }
  info(message) {
    this._messages.push(message);
    this._validationStatus.state = ValidationState.Info;
  }
  warn(message) {
    this._messages.push(message);
    this._validationStatus.state = ValidationState.Warning;
  }
  error(message) {
    this._messages.push(message);
    this._validationStatus.state = ValidationState.Error;
  }
  fatal(message) {
    this._messages.push(message);
    this._validationStatus.state = ValidationState.Fatal;
  }
  hasMessage(message) {
    return this._messages.indexOf(message) !== null;
  }
  get messages() {
    return this._messages;
  }
  get state() {
    return this._validationStatus.state;
  }
  isOK() {
    return this._validationStatus.isOK();
  }
  get status() {
    return this._validationStatus;
  }
}
suite("ProblemPatternParser", () => {
  let reporter;
  let parser;
  const testRegexp = new RegExp("test");
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    reporter = new ProblemReporter();
    parser = new matchers.ProblemPatternParser(reporter);
  });
  suite("single-pattern definitions", () => {
    test("parses a pattern defined by only a regexp", () => {
      const problemPattern = {
        regexp: "test"
      };
      const parsed = parser.parse(problemPattern);
      assert(reporter.isOK());
      assert.deepStrictEqual(parsed, {
        regexp: testRegexp,
        kind: matchers.ProblemLocationKind.Location,
        file: 1,
        line: 2,
        character: 3,
        message: 0
      });
    });
    test("does not sets defaults for line and character if kind is File", () => {
      const problemPattern = {
        regexp: "test",
        kind: "file"
      };
      const parsed = parser.parse(problemPattern);
      assert.deepStrictEqual(parsed, {
        regexp: testRegexp,
        kind: matchers.ProblemLocationKind.File,
        file: 1,
        message: 0
      });
    });
  });
  suite("multi-pattern definitions", () => {
    test("defines a pattern based on regexp and property fields, with file/line location", () => {
      const problemPattern = [
        { regexp: "test", file: 3, line: 4, column: 5, message: 6 }
      ];
      const parsed = parser.parse(problemPattern);
      assert(reporter.isOK());
      assert.deepStrictEqual(
        parsed,
        [{
          regexp: testRegexp,
          kind: matchers.ProblemLocationKind.Location,
          file: 3,
          line: 4,
          character: 5,
          message: 6
        }]
      );
    });
    test("defines a pattern bsaed on regexp and property fields, with location", () => {
      const problemPattern = [
        { regexp: "test", file: 3, location: 4, message: 6 }
      ];
      const parsed = parser.parse(problemPattern);
      assert(reporter.isOK());
      assert.deepStrictEqual(
        parsed,
        [{
          regexp: testRegexp,
          kind: matchers.ProblemLocationKind.Location,
          file: 3,
          location: 4,
          message: 6
        }]
      );
    });
    test("accepts a pattern that provides the fields from multiple entries", () => {
      const problemPattern = [
        { regexp: "test", file: 3 },
        { regexp: "test1", line: 4 },
        { regexp: "test2", column: 5 },
        { regexp: "test3", message: 6 }
      ];
      const parsed = parser.parse(problemPattern);
      assert(reporter.isOK());
      assert.deepStrictEqual(parsed, [
        { regexp: testRegexp, kind: matchers.ProblemLocationKind.Location, file: 3 },
        { regexp: new RegExp("test1"), line: 4 },
        { regexp: new RegExp("test2"), character: 5 },
        { regexp: new RegExp("test3"), message: 6 }
      ]);
    });
    test("forbids setting the loop flag outside of the last element in the array", () => {
      const problemPattern = [
        { regexp: "test", file: 3, loop: true },
        { regexp: "test1", line: 4 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage("The loop property is only supported on the last line matcher."));
    });
    test("forbids setting the kind outside of the first element of the array", () => {
      const problemPattern = [
        { regexp: "test", file: 3 },
        { regexp: "test1", kind: "file", line: 4 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage("The problem pattern is invalid. The kind property must be provided only in the first element"));
    });
    test("kind: Location requires a regexp", () => {
      const problemPattern = [
        { file: 0, line: 1, column: 20, message: 0 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage("The problem pattern is missing a regular expression."));
    });
    test("kind: Location requires a regexp on every entry", () => {
      const problemPattern = [
        { regexp: "test", file: 3 },
        { line: 4 },
        { regexp: "test2", column: 5 },
        { regexp: "test3", message: 6 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage("The problem pattern is missing a regular expression."));
    });
    test("kind: Location requires a message", () => {
      const problemPattern = [
        { regexp: "test", file: 0, line: 1, column: 20 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage("The problem pattern is invalid. It must have at least have a file and a message."));
    });
    test("kind: Location requires a file", () => {
      const problemPattern = [
        { regexp: "test", line: 1, column: 20, message: 0 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage('The problem pattern is invalid. It must either have kind: "file" or have a line or location match group.'));
    });
    test("kind: Location requires either a line or location", () => {
      const problemPattern = [
        { regexp: "test", file: 1, column: 20, message: 0 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage('The problem pattern is invalid. It must either have kind: "file" or have a line or location match group.'));
    });
    test("kind: File accepts a regexp, file and message", () => {
      const problemPattern = [
        { regexp: "test", file: 2, kind: "file", message: 6 }
      ];
      const parsed = parser.parse(problemPattern);
      assert(reporter.isOK());
      assert.deepStrictEqual(
        parsed,
        [{
          regexp: testRegexp,
          kind: matchers.ProblemLocationKind.File,
          file: 2,
          message: 6
        }]
      );
    });
    test("kind: File requires a file", () => {
      const problemPattern = [
        { regexp: "test", kind: "file", message: 6 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage("The problem pattern is invalid. It must have at least have a file and a message."));
    });
    test("kind: File requires a message", () => {
      const problemPattern = [
        { regexp: "test", kind: "file", file: 6 }
      ];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage("The problem pattern is invalid. It must have at least have a file and a message."));
    });
    test("empty pattern array should be handled gracefully", () => {
      const problemPattern = [];
      const parsed = parser.parse(problemPattern);
      assert.strictEqual(null, parsed);
      assert.strictEqual(ValidationState.Error, reporter.state);
      assert(reporter.hasMessage("The problem pattern is invalid. It must contain at least one pattern."));
    });
  });
});
suite("ProblemPatternRegistry - msCompile", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches lines with leading whitespace", () => {
    const matcher = matchers.createLineMatcher({
      owner: "msCompile",
      applyTo: matchers.ApplyToKind.allDocuments,
      fileLocation: matchers.FileLocationKind.Absolute,
      pattern: matchers.ProblemPatternRegistry.get("msCompile")
    });
    const line = "    /workspace/app.cs(5,10): error CS1001: Sample message";
    const result = matcher.handle([line]);
    assert.ok(result.match);
    const marker = result.match.marker;
    assert.strictEqual(marker.code, "CS1001");
    assert.strictEqual(marker.message, "Sample message");
  });
  test("matches lines without diagnostic code", () => {
    const matcher = matchers.createLineMatcher({
      owner: "msCompile",
      applyTo: matchers.ApplyToKind.allDocuments,
      fileLocation: matchers.FileLocationKind.Absolute,
      pattern: matchers.ProblemPatternRegistry.get("msCompile")
    });
    const line = "/workspace/app.cs(3,7): warning : Message without code";
    const result = matcher.handle([line]);
    assert.ok(result.match);
    const marker = result.match.marker;
    assert.strictEqual(marker.code, void 0);
    assert.strictEqual(marker.message, "Message without code");
  });
  test("matches lines without location information", () => {
    const matcher = matchers.createLineMatcher({
      owner: "msCompile",
      applyTo: matchers.ApplyToKind.allDocuments,
      fileLocation: matchers.FileLocationKind.Absolute,
      pattern: matchers.ProblemPatternRegistry.get("msCompile")
    });
    const line = "Main.cs: warning CS0168: The variable 'x' is declared but never used";
    const result = matcher.handle([line]);
    assert.ok(result.match);
    const marker = result.match.marker;
    assert.strictEqual(marker.code, "CS0168");
    assert.strictEqual(marker.message, "The variable 'x' is declared but never used");
    assert.strictEqual(marker.severity, MarkerSeverity.Warning);
  });
  test("matches lines with build prefixes and fatal errors", () => {
    const matcher = matchers.createLineMatcher({
      owner: "msCompile",
      applyTo: matchers.ApplyToKind.allDocuments,
      fileLocation: matchers.FileLocationKind.Absolute,
      pattern: matchers.ProblemPatternRegistry.get("msCompile")
    });
    const line = "  1>c:/workspace/app.cs(12): fatal error C1002: Fatal diagnostics";
    const result = matcher.handle([line]);
    assert.ok(result.match);
    const marker = result.match.marker;
    assert.strictEqual(marker.code, "C1002");
    assert.strictEqual(marker.message, "Fatal diagnostics");
    assert.strictEqual(marker.severity, MarkerSeverity.Error);
  });
  test("matches info diagnostics with codes", () => {
    const matcher = matchers.createLineMatcher({
      owner: "msCompile",
      applyTo: matchers.ApplyToKind.allDocuments,
      fileLocation: matchers.FileLocationKind.Absolute,
      pattern: matchers.ProblemPatternRegistry.get("msCompile")
    });
    const line = "2>/workspace/app.cs(20,5): info INF1001: Informational diagnostics";
    const result = matcher.handle([line]);
    assert.ok(result.match);
    const marker = result.match.marker;
    assert.strictEqual(marker.code, "INF1001");
    assert.strictEqual(marker.message, "Informational diagnostics");
    assert.strictEqual(marker.severity, MarkerSeverity.Info);
  });
  test("matches lines with subcategory prefixes", () => {
    const matcher = matchers.createLineMatcher({
      owner: "msCompile",
      applyTo: matchers.ApplyToKind.allDocuments,
      fileLocation: matchers.FileLocationKind.Absolute,
      pattern: matchers.ProblemPatternRegistry.get("msCompile")
    });
    const line = "Main.cs(17,20): subcategory warning CS0168: The variable 'x' is declared but never used";
    const result = matcher.handle([line]);
    assert.ok(result.match);
    const marker = result.match.marker;
    assert.strictEqual(marker.code, "CS0168");
    assert.strictEqual(marker.message, "The variable 'x' is declared but never used");
    assert.strictEqual(marker.severity, MarkerSeverity.Warning);
  });
  test("matches complex diagnostics with all qualifiers", () => {
    const matcher = matchers.createLineMatcher({
      owner: "msCompile",
      applyTo: matchers.ApplyToKind.allDocuments,
      fileLocation: matchers.FileLocationKind.Absolute,
      pattern: matchers.ProblemPatternRegistry.get("msCompile")
    });
    const line = "  12>c:/workspace/Main.cs(42,7,43,2): subcategory fatal error CS9999: Complex diagnostics";
    const result = matcher.handle([line]);
    assert.ok(result.match);
    const marker = result.match.marker;
    assert.strictEqual(marker.code, "CS9999");
    assert.strictEqual(marker.message, "Complex diagnostics");
    assert.strictEqual(marker.severity, MarkerSeverity.Error);
    assert.strictEqual(marker.startLineNumber, 42);
    assert.strictEqual(marker.startColumn, 7);
    assert.strictEqual(marker.endLineNumber, 43);
    assert.strictEqual(marker.endColumn, 2);
  });
  test("ignores diagnostics without origin", () => {
    const matcher = matchers.createLineMatcher({
      owner: "msCompile",
      applyTo: matchers.ApplyToKind.allDocuments,
      fileLocation: matchers.FileLocationKind.Absolute,
      pattern: matchers.ProblemPatternRegistry.get("msCompile")
    });
    const line = "warning: The variable 'x' is declared but never used";
    const result = matcher.handle([line]);
    assert.strictEqual(result.match, null);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFx0ZXN0XFxjb21tb25cXHByb2JsZW1NYXRjaGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICogYXMgbWF0Y2hlcnMgZnJvbSAnLi4vLi4vY29tbW9uL3Byb2JsZW1NYXRjaGVyLmpzJztcblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVmFsaWRhdGlvblN0YXRlLCBJUHJvYmxlbVJlcG9ydGVyLCBWYWxpZGF0aW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmNsYXNzIFByb2JsZW1SZXBvcnRlciBpbXBsZW1lbnRzIElQcm9ibGVtUmVwb3J0ZXIge1xuXHRwcml2YXRlIF92YWxpZGF0aW9uU3RhdHVzOiBWYWxpZGF0aW9uU3RhdHVzO1xuXHRwcml2YXRlIF9tZXNzYWdlczogc3RyaW5nW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fdmFsaWRhdGlvblN0YXR1cyA9IG5ldyBWYWxpZGF0aW9uU3RhdHVzKCk7XG5cdFx0dGhpcy5fbWVzc2FnZXMgPSBbXTtcblx0fVxuXG5cdHB1YmxpYyBpbmZvKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX21lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdFx0dGhpcy5fdmFsaWRhdGlvblN0YXR1cy5zdGF0ZSA9IFZhbGlkYXRpb25TdGF0ZS5JbmZvO1xuXHR9XG5cblx0cHVibGljIHdhcm4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVzc2FnZXMucHVzaChtZXNzYWdlKTtcblx0XHR0aGlzLl92YWxpZGF0aW9uU3RhdHVzLnN0YXRlID0gVmFsaWRhdGlvblN0YXRlLldhcm5pbmc7XG5cdH1cblxuXHRwdWJsaWMgZXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVzc2FnZXMucHVzaChtZXNzYWdlKTtcblx0XHR0aGlzLl92YWxpZGF0aW9uU3RhdHVzLnN0YXRlID0gVmFsaWRhdGlvblN0YXRlLkVycm9yO1xuXHR9XG5cblx0cHVibGljIGZhdGFsKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX21lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdFx0dGhpcy5fdmFsaWRhdGlvblN0YXR1cy5zdGF0ZSA9IFZhbGlkYXRpb25TdGF0ZS5GYXRhbDtcblx0fVxuXG5cdHB1YmxpYyBoYXNNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tZXNzYWdlcy5pbmRleE9mKG1lc3NhZ2UpICE9PSBudWxsO1xuXHR9XG5cdHB1YmxpYyBnZXQgbWVzc2FnZXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9tZXNzYWdlcztcblx0fVxuXHRwdWJsaWMgZ2V0IHN0YXRlKCk6IFZhbGlkYXRpb25TdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbGlkYXRpb25TdGF0dXMuc3RhdGU7XG5cdH1cblxuXHRwdWJsaWMgaXNPSygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsaWRhdGlvblN0YXR1cy5pc09LKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN0YXR1cygpOiBWYWxpZGF0aW9uU3RhdHVzIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsaWRhdGlvblN0YXR1cztcblx0fVxufVxuXG5zdWl0ZSgnUHJvYmxlbVBhdHRlcm5QYXJzZXInLCAoKSA9PiB7XG5cdGxldCByZXBvcnRlcjogUHJvYmxlbVJlcG9ydGVyO1xuXHRsZXQgcGFyc2VyOiBtYXRjaGVycy5Qcm9ibGVtUGF0dGVyblBhcnNlcjtcblx0Y29uc3QgdGVzdFJlZ2V4cCA9IG5ldyBSZWdFeHAoJ3Rlc3QnKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0cmVwb3J0ZXIgPSBuZXcgUHJvYmxlbVJlcG9ydGVyKCk7XG5cdFx0cGFyc2VyID0gbmV3IG1hdGNoZXJzLlByb2JsZW1QYXR0ZXJuUGFyc2VyKHJlcG9ydGVyKTtcblx0fSk7XG5cblx0c3VpdGUoJ3NpbmdsZS1wYXR0ZXJuIGRlZmluaXRpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyBhIHBhdHRlcm4gZGVmaW5lZCBieSBvbmx5IGEgcmVnZXhwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm46IG1hdGNoZXJzLkNvbmZpZy5JUHJvYmxlbVBhdHRlcm4gPSB7XG5cdFx0XHRcdHJlZ2V4cDogJ3Rlc3QnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VyLnBhcnNlKHByb2JsZW1QYXR0ZXJuKTtcblx0XHRcdGFzc2VydChyZXBvcnRlci5pc09LKCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHtcblx0XHRcdFx0cmVnZXhwOiB0ZXN0UmVnZXhwLFxuXHRcdFx0XHRraW5kOiBtYXRjaGVycy5Qcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0XHRmaWxlOiAxLFxuXHRcdFx0XHRsaW5lOiAyLFxuXHRcdFx0XHRjaGFyYWN0ZXI6IDMsXG5cdFx0XHRcdG1lc3NhZ2U6IDBcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ2RvZXMgbm90IHNldHMgZGVmYXVsdHMgZm9yIGxpbmUgYW5kIGNoYXJhY3RlciBpZiBraW5kIGlzIEZpbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9ibGVtUGF0dGVybjogbWF0Y2hlcnMuQ29uZmlnLklQcm9ibGVtUGF0dGVybiA9IHtcblx0XHRcdFx0cmVnZXhwOiAndGVzdCcsXG5cdFx0XHRcdGtpbmQ6ICdmaWxlJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlci5wYXJzZShwcm9ibGVtUGF0dGVybik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwge1xuXHRcdFx0XHRyZWdleHA6IHRlc3RSZWdleHAsXG5cdFx0XHRcdGtpbmQ6IG1hdGNoZXJzLlByb2JsZW1Mb2NhdGlvbktpbmQuRmlsZSxcblx0XHRcdFx0ZmlsZTogMSxcblx0XHRcdFx0bWVzc2FnZTogMFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtdWx0aS1wYXR0ZXJuIGRlZmluaXRpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2RlZmluZXMgYSBwYXR0ZXJuIGJhc2VkIG9uIHJlZ2V4cCBhbmQgcHJvcGVydHkgZmllbGRzLCB3aXRoIGZpbGUvbGluZSBsb2NhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJuOiBtYXRjaGVycy5Db25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gPSBbXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdCcsIGZpbGU6IDMsIGxpbmU6IDQsIGNvbHVtbjogNSwgbWVzc2FnZTogNiB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VyLnBhcnNlKHByb2JsZW1QYXR0ZXJuKTtcblx0XHRcdGFzc2VydChyZXBvcnRlci5pc09LKCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0cmVnZXhwOiB0ZXN0UmVnZXhwLFxuXHRcdFx0XHRcdGtpbmQ6IG1hdGNoZXJzLlByb2JsZW1Mb2NhdGlvbktpbmQuTG9jYXRpb24sXG5cdFx0XHRcdFx0ZmlsZTogMyxcblx0XHRcdFx0XHRsaW5lOiA0LFxuXHRcdFx0XHRcdGNoYXJhY3RlcjogNSxcblx0XHRcdFx0XHRtZXNzYWdlOiA2XG5cdFx0XHRcdH1dXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ2RlZmluZXMgYSBwYXR0ZXJuIGJzYWVkIG9uIHJlZ2V4cCBhbmQgcHJvcGVydHkgZmllbGRzLCB3aXRoIGxvY2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm46IG1hdGNoZXJzLkNvbmZpZy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IFtcblx0XHRcdFx0eyByZWdleHA6ICd0ZXN0JywgZmlsZTogMywgbG9jYXRpb246IDQsIG1lc3NhZ2U6IDYgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlci5wYXJzZShwcm9ibGVtUGF0dGVybik7XG5cdFx0XHRhc3NlcnQocmVwb3J0ZXIuaXNPSygpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdHJlZ2V4cDogdGVzdFJlZ2V4cCxcblx0XHRcdFx0XHRraW5kOiBtYXRjaGVycy5Qcm9ibGVtTG9jYXRpb25LaW5kLkxvY2F0aW9uLFxuXHRcdFx0XHRcdGZpbGU6IDMsXG5cdFx0XHRcdFx0bG9jYXRpb246IDQsXG5cdFx0XHRcdFx0bWVzc2FnZTogNlxuXHRcdFx0XHR9XVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdhY2NlcHRzIGEgcGF0dGVybiB0aGF0IHByb3ZpZGVzIHRoZSBmaWVsZHMgZnJvbSBtdWx0aXBsZSBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm46IG1hdGNoZXJzLkNvbmZpZy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IFtcblx0XHRcdFx0eyByZWdleHA6ICd0ZXN0JywgZmlsZTogMyB9LFxuXHRcdFx0XHR7IHJlZ2V4cDogJ3Rlc3QxJywgbGluZTogNCB9LFxuXHRcdFx0XHR7IHJlZ2V4cDogJ3Rlc3QyJywgY29sdW1uOiA1IH0sXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdDMnLCBtZXNzYWdlOiA2IH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZXIucGFyc2UocHJvYmxlbVBhdHRlcm4pO1xuXHRcdFx0YXNzZXJ0KHJlcG9ydGVyLmlzT0soKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwgW1xuXHRcdFx0XHR7IHJlZ2V4cDogdGVzdFJlZ2V4cCwga2luZDogbWF0Y2hlcnMuUHJvYmxlbUxvY2F0aW9uS2luZC5Mb2NhdGlvbiwgZmlsZTogMyB9LFxuXHRcdFx0XHR7IHJlZ2V4cDogbmV3IFJlZ0V4cCgndGVzdDEnKSwgbGluZTogNCB9LFxuXHRcdFx0XHR7IHJlZ2V4cDogbmV3IFJlZ0V4cCgndGVzdDInKSwgY2hhcmFjdGVyOiA1IH0sXG5cdFx0XHRcdHsgcmVnZXhwOiBuZXcgUmVnRXhwKCd0ZXN0MycpLCBtZXNzYWdlOiA2IH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ2ZvcmJpZHMgc2V0dGluZyB0aGUgbG9vcCBmbGFnIG91dHNpZGUgb2YgdGhlIGxhc3QgZWxlbWVudCBpbiB0aGUgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9ibGVtUGF0dGVybjogbWF0Y2hlcnMuQ29uZmlnLk11bHRpTGluZVByb2JsZW1QYXR0ZXJuID0gW1xuXHRcdFx0XHR7IHJlZ2V4cDogJ3Rlc3QnLCBmaWxlOiAzLCBsb29wOiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdDEnLCBsaW5lOiA0IH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZXIucGFyc2UocHJvYmxlbVBhdHRlcm4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG51bGwsIHBhcnNlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVmFsaWRhdGlvblN0YXRlLkVycm9yLCByZXBvcnRlci5zdGF0ZSk7XG5cdFx0XHRhc3NlcnQocmVwb3J0ZXIuaGFzTWVzc2FnZSgnVGhlIGxvb3AgcHJvcGVydHkgaXMgb25seSBzdXBwb3J0ZWQgb24gdGhlIGxhc3QgbGluZSBtYXRjaGVyLicpKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdmb3JiaWRzIHNldHRpbmcgdGhlIGtpbmQgb3V0c2lkZSBvZiB0aGUgZmlyc3QgZWxlbWVudCBvZiB0aGUgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9ibGVtUGF0dGVybjogbWF0Y2hlcnMuQ29uZmlnLk11bHRpTGluZVByb2JsZW1QYXR0ZXJuID0gW1xuXHRcdFx0XHR7IHJlZ2V4cDogJ3Rlc3QnLCBmaWxlOiAzIH0sXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdDEnLCBraW5kOiAnZmlsZScsIGxpbmU6IDQgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlci5wYXJzZShwcm9ibGVtUGF0dGVybik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnVsbCwgcGFyc2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChWYWxpZGF0aW9uU3RhdGUuRXJyb3IsIHJlcG9ydGVyLnN0YXRlKTtcblx0XHRcdGFzc2VydChyZXBvcnRlci5oYXNNZXNzYWdlKCdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIGludmFsaWQuIFRoZSBraW5kIHByb3BlcnR5IG11c3QgYmUgcHJvdmlkZWQgb25seSBpbiB0aGUgZmlyc3QgZWxlbWVudCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tpbmQ6IExvY2F0aW9uIHJlcXVpcmVzIGEgcmVnZXhwJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm46IG1hdGNoZXJzLkNvbmZpZy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IFtcblx0XHRcdFx0eyBmaWxlOiAwLCBsaW5lOiAxLCBjb2x1bW46IDIwLCBtZXNzYWdlOiAwIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZXIucGFyc2UocHJvYmxlbVBhdHRlcm4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG51bGwsIHBhcnNlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVmFsaWRhdGlvblN0YXRlLkVycm9yLCByZXBvcnRlci5zdGF0ZSk7XG5cdFx0XHRhc3NlcnQocmVwb3J0ZXIuaGFzTWVzc2FnZSgnVGhlIHByb2JsZW0gcGF0dGVybiBpcyBtaXNzaW5nIGEgcmVndWxhciBleHByZXNzaW9uLicpKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdraW5kOiBMb2NhdGlvbiByZXF1aXJlcyBhIHJlZ2V4cCBvbiBldmVyeSBlbnRyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJuOiBtYXRjaGVycy5Db25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gPSBbXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdCcsIGZpbGU6IDMgfSxcblx0XHRcdFx0eyBsaW5lOiA0IH0sXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdDInLCBjb2x1bW46IDUgfSxcblx0XHRcdFx0eyByZWdleHA6ICd0ZXN0MycsIG1lc3NhZ2U6IDYgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlci5wYXJzZShwcm9ibGVtUGF0dGVybik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnVsbCwgcGFyc2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChWYWxpZGF0aW9uU3RhdGUuRXJyb3IsIHJlcG9ydGVyLnN0YXRlKTtcblx0XHRcdGFzc2VydChyZXBvcnRlci5oYXNNZXNzYWdlKCdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIG1pc3NpbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uJykpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ2tpbmQ6IExvY2F0aW9uIHJlcXVpcmVzIGEgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJuOiBtYXRjaGVycy5Db25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gPSBbXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdCcsIGZpbGU6IDAsIGxpbmU6IDEsIGNvbHVtbjogMjAgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlci5wYXJzZShwcm9ibGVtUGF0dGVybik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnVsbCwgcGFyc2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChWYWxpZGF0aW9uU3RhdGUuRXJyb3IsIHJlcG9ydGVyLnN0YXRlKTtcblx0XHRcdGFzc2VydChyZXBvcnRlci5oYXNNZXNzYWdlKCdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIGludmFsaWQuIEl0IG11c3QgaGF2ZSBhdCBsZWFzdCBoYXZlIGEgZmlsZSBhbmQgYSBtZXNzYWdlLicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tpbmQ6IExvY2F0aW9uIHJlcXVpcmVzIGEgZmlsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJuOiBtYXRjaGVycy5Db25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gPSBbXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdCcsIGxpbmU6IDEsIGNvbHVtbjogMjAsIG1lc3NhZ2U6IDAgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlci5wYXJzZShwcm9ibGVtUGF0dGVybik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnVsbCwgcGFyc2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChWYWxpZGF0aW9uU3RhdGUuRXJyb3IsIHJlcG9ydGVyLnN0YXRlKTtcblx0XHRcdGFzc2VydChyZXBvcnRlci5oYXNNZXNzYWdlKCdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIGludmFsaWQuIEl0IG11c3QgZWl0aGVyIGhhdmUga2luZDogXCJmaWxlXCIgb3IgaGF2ZSBhIGxpbmUgb3IgbG9jYXRpb24gbWF0Y2ggZ3JvdXAuJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2luZDogTG9jYXRpb24gcmVxdWlyZXMgZWl0aGVyIGEgbGluZSBvciBsb2NhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJuOiBtYXRjaGVycy5Db25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gPSBbXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdCcsIGZpbGU6IDEsIGNvbHVtbjogMjAsIG1lc3NhZ2U6IDAgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlci5wYXJzZShwcm9ibGVtUGF0dGVybik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnVsbCwgcGFyc2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChWYWxpZGF0aW9uU3RhdGUuRXJyb3IsIHJlcG9ydGVyLnN0YXRlKTtcblx0XHRcdGFzc2VydChyZXBvcnRlci5oYXNNZXNzYWdlKCdUaGUgcHJvYmxlbSBwYXR0ZXJuIGlzIGludmFsaWQuIEl0IG11c3QgZWl0aGVyIGhhdmUga2luZDogXCJmaWxlXCIgb3IgaGF2ZSBhIGxpbmUgb3IgbG9jYXRpb24gbWF0Y2ggZ3JvdXAuJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2luZDogRmlsZSBhY2NlcHRzIGEgcmVnZXhwLCBmaWxlIGFuZCBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm46IG1hdGNoZXJzLkNvbmZpZy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IFtcblx0XHRcdFx0eyByZWdleHA6ICd0ZXN0JywgZmlsZTogMiwga2luZDogJ2ZpbGUnLCBtZXNzYWdlOiA2IH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZXIucGFyc2UocHJvYmxlbVBhdHRlcm4pO1xuXHRcdFx0YXNzZXJ0KHJlcG9ydGVyLmlzT0soKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRyZWdleHA6IHRlc3RSZWdleHAsXG5cdFx0XHRcdFx0a2luZDogbWF0Y2hlcnMuUHJvYmxlbUxvY2F0aW9uS2luZC5GaWxlLFxuXHRcdFx0XHRcdGZpbGU6IDIsXG5cdFx0XHRcdFx0bWVzc2FnZTogNlxuXHRcdFx0XHR9XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tpbmQ6IEZpbGUgcmVxdWlyZXMgYSBmaWxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm46IG1hdGNoZXJzLkNvbmZpZy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IFtcblx0XHRcdFx0eyByZWdleHA6ICd0ZXN0Jywga2luZDogJ2ZpbGUnLCBtZXNzYWdlOiA2IH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZXIucGFyc2UocHJvYmxlbVBhdHRlcm4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG51bGwsIHBhcnNlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVmFsaWRhdGlvblN0YXRlLkVycm9yLCByZXBvcnRlci5zdGF0ZSk7XG5cdFx0XHRhc3NlcnQocmVwb3J0ZXIuaGFzTWVzc2FnZSgnVGhlIHByb2JsZW0gcGF0dGVybiBpcyBpbnZhbGlkLiBJdCBtdXN0IGhhdmUgYXQgbGVhc3QgaGF2ZSBhIGZpbGUgYW5kIGEgbWVzc2FnZS4nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdraW5kOiBGaWxlIHJlcXVpcmVzIGEgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2JsZW1QYXR0ZXJuOiBtYXRjaGVycy5Db25maWcuTXVsdGlMaW5lUHJvYmxlbVBhdHRlcm4gPSBbXG5cdFx0XHRcdHsgcmVnZXhwOiAndGVzdCcsIGtpbmQ6ICdmaWxlJywgZmlsZTogNiB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VyLnBhcnNlKHByb2JsZW1QYXR0ZXJuKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChudWxsLCBwYXJzZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZhbGlkYXRpb25TdGF0ZS5FcnJvciwgcmVwb3J0ZXIuc3RhdGUpO1xuXHRcdFx0YXNzZXJ0KHJlcG9ydGVyLmhhc01lc3NhZ2UoJ1RoZSBwcm9ibGVtIHBhdHRlcm4gaXMgaW52YWxpZC4gSXQgbXVzdCBoYXZlIGF0IGxlYXN0IGhhdmUgYSBmaWxlIGFuZCBhIG1lc3NhZ2UuJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgcGF0dGVybiBhcnJheSBzaG91bGQgYmUgaGFuZGxlZCBncmFjZWZ1bGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYmxlbVBhdHRlcm46IG1hdGNoZXJzLkNvbmZpZy5NdWx0aUxpbmVQcm9ibGVtUGF0dGVybiA9IFtdO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VyLnBhcnNlKHByb2JsZW1QYXR0ZXJuKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChudWxsLCBwYXJzZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZhbGlkYXRpb25TdGF0ZS5FcnJvciwgcmVwb3J0ZXIuc3RhdGUpO1xuXHRcdFx0YXNzZXJ0KHJlcG9ydGVyLmhhc01lc3NhZ2UoJ1RoZSBwcm9ibGVtIHBhdHRlcm4gaXMgaW52YWxpZC4gSXQgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSBwYXR0ZXJuLicpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1Byb2JsZW1QYXR0ZXJuUmVnaXN0cnkgLSBtc0NvbXBpbGUnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHR0ZXN0KCdtYXRjaGVzIGxpbmVzIHdpdGggbGVhZGluZyB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZXIgPSBtYXRjaGVycy5jcmVhdGVMaW5lTWF0Y2hlcih7XG5cdFx0XHRvd25lcjogJ21zQ29tcGlsZScsXG5cdFx0XHRhcHBseVRvOiBtYXRjaGVycy5BcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IG1hdGNoZXJzLkZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBtYXRjaGVycy5Qcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnbXNDb21waWxlJylcblx0XHR9KTtcblx0XHRjb25zdCBsaW5lID0gJyAgICAvd29ya3NwYWNlL2FwcC5jcyg1LDEwKTogZXJyb3IgQ1MxMDAxOiBTYW1wbGUgbWVzc2FnZSc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWF0Y2hlci5oYW5kbGUoW2xpbmVdKTtcblx0XHRhc3NlcnQub2socmVzdWx0Lm1hdGNoKTtcblx0XHRjb25zdCBtYXJrZXIgPSByZXN1bHQubWF0Y2ghLm1hcmtlcjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLmNvZGUsICdDUzEwMDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLm1lc3NhZ2UsICdTYW1wbGUgbWVzc2FnZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzIGxpbmVzIHdpdGhvdXQgZGlhZ25vc3RpYyBjb2RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZXIgPSBtYXRjaGVycy5jcmVhdGVMaW5lTWF0Y2hlcih7XG5cdFx0XHRvd25lcjogJ21zQ29tcGlsZScsXG5cdFx0XHRhcHBseVRvOiBtYXRjaGVycy5BcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IG1hdGNoZXJzLkZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBtYXRjaGVycy5Qcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnbXNDb21waWxlJylcblx0XHR9KTtcblx0XHRjb25zdCBsaW5lID0gJy93b3Jrc3BhY2UvYXBwLmNzKDMsNyk6IHdhcm5pbmcgOiBNZXNzYWdlIHdpdGhvdXQgY29kZSc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWF0Y2hlci5oYW5kbGUoW2xpbmVdKTtcblx0XHRhc3NlcnQub2socmVzdWx0Lm1hdGNoKTtcblx0XHRjb25zdCBtYXJrZXIgPSByZXN1bHQubWF0Y2ghLm1hcmtlcjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLmNvZGUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5tZXNzYWdlLCAnTWVzc2FnZSB3aXRob3V0IGNvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBsaW5lcyB3aXRob3V0IGxvY2F0aW9uIGluZm9ybWF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZXIgPSBtYXRjaGVycy5jcmVhdGVMaW5lTWF0Y2hlcih7XG5cdFx0XHRvd25lcjogJ21zQ29tcGlsZScsXG5cdFx0XHRhcHBseVRvOiBtYXRjaGVycy5BcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IG1hdGNoZXJzLkZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBtYXRjaGVycy5Qcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnbXNDb21waWxlJylcblx0XHR9KTtcblx0XHRjb25zdCBsaW5lID0gJ01haW4uY3M6IHdhcm5pbmcgQ1MwMTY4OiBUaGUgdmFyaWFibGUgXFwneFxcJyBpcyBkZWNsYXJlZCBidXQgbmV2ZXIgdXNlZCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWF0Y2hlci5oYW5kbGUoW2xpbmVdKTtcblx0XHRhc3NlcnQub2socmVzdWx0Lm1hdGNoKTtcblx0XHRjb25zdCBtYXJrZXIgPSByZXN1bHQubWF0Y2ghLm1hcmtlcjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLmNvZGUsICdDUzAxNjgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLm1lc3NhZ2UsICdUaGUgdmFyaWFibGUgXFwneFxcJyBpcyBkZWNsYXJlZCBidXQgbmV2ZXIgdXNlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXIuc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzIGxpbmVzIHdpdGggYnVpbGQgcHJlZml4ZXMgYW5kIGZhdGFsIGVycm9ycycsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVyID0gbWF0Y2hlcnMuY3JlYXRlTGluZU1hdGNoZXIoe1xuXHRcdFx0b3duZXI6ICdtc0NvbXBpbGUnLFxuXHRcdFx0YXBwbHlUbzogbWF0Y2hlcnMuQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiBtYXRjaGVycy5GaWxlTG9jYXRpb25LaW5kLkFic29sdXRlLFxuXHRcdFx0cGF0dGVybjogbWF0Y2hlcnMuUHJvYmxlbVBhdHRlcm5SZWdpc3RyeS5nZXQoJ21zQ29tcGlsZScpXG5cdFx0fSk7XG5cdFx0Y29uc3QgbGluZSA9ICcgIDE+Yzovd29ya3NwYWNlL2FwcC5jcygxMik6IGZhdGFsIGVycm9yIEMxMDAyOiBGYXRhbCBkaWFnbm9zdGljcyc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWF0Y2hlci5oYW5kbGUoW2xpbmVdKTtcblx0XHRhc3NlcnQub2socmVzdWx0Lm1hdGNoKTtcblx0XHRjb25zdCBtYXJrZXIgPSByZXN1bHQubWF0Y2ghLm1hcmtlcjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLmNvZGUsICdDMTAwMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXIubWVzc2FnZSwgJ0ZhdGFsIGRpYWdub3N0aWNzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzIGluZm8gZGlhZ25vc3RpY3Mgd2l0aCBjb2RlcycsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVyID0gbWF0Y2hlcnMuY3JlYXRlTGluZU1hdGNoZXIoe1xuXHRcdFx0b3duZXI6ICdtc0NvbXBpbGUnLFxuXHRcdFx0YXBwbHlUbzogbWF0Y2hlcnMuQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiBtYXRjaGVycy5GaWxlTG9jYXRpb25LaW5kLkFic29sdXRlLFxuXHRcdFx0cGF0dGVybjogbWF0Y2hlcnMuUHJvYmxlbVBhdHRlcm5SZWdpc3RyeS5nZXQoJ21zQ29tcGlsZScpXG5cdFx0fSk7XG5cdFx0Y29uc3QgbGluZSA9ICcyPi93b3Jrc3BhY2UvYXBwLmNzKDIwLDUpOiBpbmZvIElORjEwMDE6IEluZm9ybWF0aW9uYWwgZGlhZ25vc3RpY3MnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG1hdGNoZXIuaGFuZGxlKFtsaW5lXSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tYXRjaCk7XG5cdFx0Y29uc3QgbWFya2VyID0gcmVzdWx0Lm1hdGNoIS5tYXJrZXI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5jb2RlLCAnSU5GMTAwMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXIubWVzc2FnZSwgJ0luZm9ybWF0aW9uYWwgZGlhZ25vc3RpY3MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5JbmZvKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBsaW5lcyB3aXRoIHN1YmNhdGVnb3J5IHByZWZpeGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZXIgPSBtYXRjaGVycy5jcmVhdGVMaW5lTWF0Y2hlcih7XG5cdFx0XHRvd25lcjogJ21zQ29tcGlsZScsXG5cdFx0XHRhcHBseVRvOiBtYXRjaGVycy5BcHBseVRvS2luZC5hbGxEb2N1bWVudHMsXG5cdFx0XHRmaWxlTG9jYXRpb246IG1hdGNoZXJzLkZpbGVMb2NhdGlvbktpbmQuQWJzb2x1dGUsXG5cdFx0XHRwYXR0ZXJuOiBtYXRjaGVycy5Qcm9ibGVtUGF0dGVyblJlZ2lzdHJ5LmdldCgnbXNDb21waWxlJylcblx0XHR9KTtcblx0XHRjb25zdCBsaW5lID0gJ01haW4uY3MoMTcsMjApOiBzdWJjYXRlZ29yeSB3YXJuaW5nIENTMDE2ODogVGhlIHZhcmlhYmxlIFxcJ3hcXCcgaXMgZGVjbGFyZWQgYnV0IG5ldmVyIHVzZWQnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG1hdGNoZXIuaGFuZGxlKFtsaW5lXSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tYXRjaCk7XG5cdFx0Y29uc3QgbWFya2VyID0gcmVzdWx0Lm1hdGNoIS5tYXJrZXI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5jb2RlLCAnQ1MwMTY4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5tZXNzYWdlLCAnVGhlIHZhcmlhYmxlIFxcJ3hcXCcgaXMgZGVjbGFyZWQgYnV0IG5ldmVyIHVzZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBjb21wbGV4IGRpYWdub3N0aWNzIHdpdGggYWxsIHF1YWxpZmllcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hlciA9IG1hdGNoZXJzLmNyZWF0ZUxpbmVNYXRjaGVyKHtcblx0XHRcdG93bmVyOiAnbXNDb21waWxlJyxcblx0XHRcdGFwcGx5VG86IG1hdGNoZXJzLkFwcGx5VG9LaW5kLmFsbERvY3VtZW50cyxcblx0XHRcdGZpbGVMb2NhdGlvbjogbWF0Y2hlcnMuRmlsZUxvY2F0aW9uS2luZC5BYnNvbHV0ZSxcblx0XHRcdHBhdHRlcm46IG1hdGNoZXJzLlByb2JsZW1QYXR0ZXJuUmVnaXN0cnkuZ2V0KCdtc0NvbXBpbGUnKVxuXHRcdH0pO1xuXHRcdGNvbnN0IGxpbmUgPSAnICAxMj5jOi93b3Jrc3BhY2UvTWFpbi5jcyg0Miw3LDQzLDIpOiBzdWJjYXRlZ29yeSBmYXRhbCBlcnJvciBDUzk5OTk6IENvbXBsZXggZGlhZ25vc3RpY3MnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG1hdGNoZXIuaGFuZGxlKFtsaW5lXSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tYXRjaCk7XG5cdFx0Y29uc3QgbWFya2VyID0gcmVzdWx0Lm1hdGNoIS5tYXJrZXI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5jb2RlLCAnQ1M5OTk5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5tZXNzYWdlLCAnQ29tcGxleCBkaWFnbm9zdGljcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXIuc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLnN0YXJ0TGluZU51bWJlciwgNDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXIuc3RhcnRDb2x1bW4sIDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXIuZW5kTGluZU51bWJlciwgNDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXIuZW5kQ29sdW1uLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBkaWFnbm9zdGljcyB3aXRob3V0IG9yaWdpbicsICgpID0+IHtcblx0XHRjb25zdCBtYXRjaGVyID0gbWF0Y2hlcnMuY3JlYXRlTGluZU1hdGNoZXIoe1xuXHRcdFx0b3duZXI6ICdtc0NvbXBpbGUnLFxuXHRcdFx0YXBwbHlUbzogbWF0Y2hlcnMuQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzLFxuXHRcdFx0ZmlsZUxvY2F0aW9uOiBtYXRjaGVycy5GaWxlTG9jYXRpb25LaW5kLkFic29sdXRlLFxuXHRcdFx0cGF0dGVybjogbWF0Y2hlcnMuUHJvYmxlbVBhdHRlcm5SZWdpc3RyeS5nZXQoJ21zQ29tcGlsZScpXG5cdFx0fSk7XG5cdFx0Y29uc3QgbGluZSA9ICd3YXJuaW5nOiBUaGUgdmFyaWFibGUgXFwneFxcJyBpcyBkZWNsYXJlZCBidXQgbmV2ZXIgdXNlZCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbWF0Y2hlci5oYW5kbGUoW2xpbmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1hdGNoLCBudWxsKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFlBQVksY0FBYztBQUUxQixPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBbUMsd0JBQXdCO0FBQ3BFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sZ0JBQTRDO0FBQUEsRUFJakQsY0FBYztBQUNiLFNBQUssb0JBQW9CLElBQUksaUJBQWlCO0FBQzlDLFNBQUssWUFBWSxDQUFDO0FBQUEsRUFDbkI7QUFBQSxFQUVPLEtBQUssU0FBdUI7QUFDbEMsU0FBSyxVQUFVLEtBQUssT0FBTztBQUMzQixTQUFLLGtCQUFrQixRQUFRLGdCQUFnQjtBQUFBLEVBQ2hEO0FBQUEsRUFFTyxLQUFLLFNBQXVCO0FBQ2xDLFNBQUssVUFBVSxLQUFLLE9BQU87QUFDM0IsU0FBSyxrQkFBa0IsUUFBUSxnQkFBZ0I7QUFBQSxFQUNoRDtBQUFBLEVBRU8sTUFBTSxTQUF1QjtBQUNuQyxTQUFLLFVBQVUsS0FBSyxPQUFPO0FBQzNCLFNBQUssa0JBQWtCLFFBQVEsZ0JBQWdCO0FBQUEsRUFDaEQ7QUFBQSxFQUVPLE1BQU0sU0FBdUI7QUFDbkMsU0FBSyxV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
