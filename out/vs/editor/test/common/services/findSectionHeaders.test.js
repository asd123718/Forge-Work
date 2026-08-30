import * as assert from "assert";
import { findSectionHeaders } from "../../../common/services/findSectionHeaders.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
class TestSectionHeaderFinderTarget {
  constructor(lines) {
    this.lines = lines;
  }
  getLineCount() {
    return this.lines.length;
  }
  getLineContent(lineNumber) {
    return this.lines[lineNumber - 1];
  }
}
suite("FindSectionHeaders", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("finds simple section headers", () => {
    const model = new TestSectionHeaderFinderTarget([
      "regular line",
      "MARK: My Section",
      "another line",
      "MARK: Another Section",
      "last line"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "MARK:\\s*(?<label>.*)$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "My Section");
    assert.strictEqual(headers[0].range.startLineNumber, 2);
    assert.strictEqual(headers[0].range.endLineNumber, 2);
    assert.strictEqual(headers[1].text, "Another Section");
    assert.strictEqual(headers[1].range.startLineNumber, 4);
    assert.strictEqual(headers[1].range.endLineNumber, 4);
  });
  test("finds section headers with separators", () => {
    const model = new TestSectionHeaderFinderTarget([
      "regular line",
      "MARK: -My Section",
      "another line",
      "MARK: - Another Section",
      "last line"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "MARK:\\s*(?<separator>-?)\\s*(?<label>.*)$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "My Section");
    assert.strictEqual(headers[0].hasSeparatorLine, true);
    assert.strictEqual(headers[1].text, "Another Section");
    assert.strictEqual(headers[1].hasSeparatorLine, true);
  });
  test("finds multi-line section headers with separators", () => {
    const model = new TestSectionHeaderFinderTarget([
      "regular line",
      "// ==========",
      "// My Section",
      "// ==========",
      "code...",
      "// ==========",
      "// Another Section",
      "// ==========",
      "more code..."
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "My Section");
    assert.strictEqual(headers[0].range.startLineNumber, 2);
    assert.strictEqual(headers[0].range.endLineNumber, 4);
    assert.strictEqual(headers[1].text, "Another Section");
    assert.strictEqual(headers[1].range.startLineNumber, 6);
    assert.strictEqual(headers[1].range.endLineNumber, 8);
  });
  test("handles overlapping multi-line section headers correctly", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      "// Section 1",
      "// ==========",
      "// ==========",
      // This line starts another header
      "// Section 2",
      "// =========="
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 1);
    assert.strictEqual(headers[0].range.endLineNumber, 3);
    assert.strictEqual(headers[1].text, "Section 2");
    assert.strictEqual(headers[1].range.startLineNumber, 4);
    assert.strictEqual(headers[1].range.endLineNumber, 6);
  });
  test("section headers must be in comments when specified", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      "// Section 1",
      // This one is in a comment
      "// ==========",
      "==========",
      // This one isn't
      "Section 2",
      "=========="
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^(?:// )?=+\\n^(?:// )?(?<label>[^\\n]+?)\\n^(?:// )?=+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers[0].shouldBeInComments, true);
  });
  test("handles section headers at chunk boundaries", () => {
    const lines = [];
    for (let i = 0; i < 150; i++) {
      lines.push("line " + i);
    }
    lines[97] = "// ==========";
    lines[98] = "// Section 1";
    lines[99] = "// ==========";
    lines[100] = "// ==========";
    lines[101] = "// Section 2";
    lines[102] = "// ==========";
    const model = new TestSectionHeaderFinderTarget(lines);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 98);
    assert.strictEqual(headers[0].range.endLineNumber, 100);
    assert.strictEqual(headers[1].text, "Section 2");
    assert.strictEqual(headers[1].range.startLineNumber, 101);
    assert.strictEqual(headers[1].range.endLineNumber, 103);
  });
  test("handles empty regex gracefully without infinite loop", () => {
    const model = new TestSectionHeaderFinderTarget([
      "line 1",
      "line 2",
      "line 3"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: ""
      // Empty string that would cause infinite loop
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 0, "Should return no headers for empty regex");
  });
  test("handles whitespace-only regex gracefully without infinite loop", () => {
    const model = new TestSectionHeaderFinderTarget([
      "line 1",
      "line 2",
      "line 3"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "   "
      // Whitespace that would cause infinite loop
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 0, "Should return no headers for whitespace-only regex");
  });
  test("correctly advances past matches without infinite loop", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      "// Section 1",
      "// ==========",
      "some code",
      "// ==========",
      "// Section 2",
      "// ==========",
      "more code",
      "// ==========",
      "// Section 3",
      "// =========="
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 3, "Should find all three section headers");
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[1].text, "Section 2");
    assert.strictEqual(headers[2].text, "Section 3");
  });
  test("handles consecutive section headers correctly", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      "// Section 1",
      "// ==========",
      "// ==========",
      // This line is both the end of Section 1 and start of Section 2
      "// Section 2",
      "// =========="
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2, "Should find both section headers");
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[1].text, "Section 2");
  });
  test("handles nested separators correctly", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==============",
      "// Major Section",
      "// ==============",
      "",
      "// ----------",
      "// Subsection",
      "// ----------"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// [-=]+\\n^// (?<label>[^\\n]+?)\\n^// [-=]+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2, "Should find both section headers");
    assert.strictEqual(headers[0].text, "Major Section");
    assert.strictEqual(headers[1].text, "Subsection");
  });
  test("handles section headers at chunk boundaries correctly", () => {
    const lines = [];
    for (let i = 0; i < 97; i++) {
      lines.push(`line ${i}`);
    }
    lines.push("// ==========");
    lines.push("// Section 1");
    lines.push("// ==========");
    lines.push("// ==========");
    lines.push("// Section 2");
    lines.push("// ==========");
    for (let i = 103; i < 150; i++) {
      lines.push(`line ${i}`);
    }
    const model = new TestSectionHeaderFinderTarget(lines);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2, "Should find both section headers across chunk boundary");
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 98);
    assert.strictEqual(headers[0].range.endLineNumber, 100);
    assert.strictEqual(headers[1].text, "Section 2");
    assert.strictEqual(headers[1].range.startLineNumber, 101);
    assert.strictEqual(headers[1].range.endLineNumber, 103);
  });
  test("handles overlapping section headers without duplicates", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      // Line 1
      "// Section 1",
      // Line 2 - This is part of first header
      "// ==========",
      // Line 3 - This is the end of first
      "// Section 2",
      // Line 4 - This is not a header
      "// ==========",
      // Line 5
      "// ==========",
      // Line 6 - Start of second header
      "// Section 3",
      // Line 7
      "// ==========="
      // Line 8
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 1);
    assert.strictEqual(headers[0].range.endLineNumber, 3);
    assert.strictEqual(headers[1].text, "Section 3");
    assert.strictEqual(headers[1].range.startLineNumber, 6);
    assert.strictEqual(headers[1].range.endLineNumber, 8);
  });
  test("handles partially overlapping multiline section headers correctly", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ================",
      // Line 1
      "// Major Section 1",
      // Line 2
      "// ================",
      // Line 3
      "// --------",
      // Line 4 - Start of subsection that overlaps with end of major section
      "// Subsection 1.1",
      // Line 5
      "// --------",
      // Line 6
      "// ================",
      // Line 7
      "// Major Section 2",
      // Line 8
      "// ================"
      // Line 9
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// [-=]+\\n^// (?<label>[^\\n]+?)\\n^// [-=]+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 3);
    assert.strictEqual(headers[0].text, "Major Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 1);
    assert.strictEqual(headers[0].range.endLineNumber, 3);
    assert.strictEqual(headers[1].text, "Subsection 1.1");
    assert.strictEqual(headers[1].range.startLineNumber, 4);
    assert.strictEqual(headers[1].range.endLineNumber, 6);
    assert.strictEqual(headers[2].text, "Major Section 2");
    assert.strictEqual(headers[2].range.startLineNumber, 7);
    assert.strictEqual(headers[2].range.endLineNumber, 9);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcc2VydmljZXNcXGZpbmRTZWN0aW9uSGVhZGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMsIElTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0LCBmaW5kU2VjdGlvbkhlYWRlcnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvZmluZFNlY3Rpb25IZWFkZXJzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5jbGFzcyBUZXN0U2VjdGlvbkhlYWRlckZpbmRlclRhcmdldCBpbXBsZW1lbnRzIElTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0IHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBsaW5lczogc3RyaW5nW10pIHsgfVxuXG5cdGdldExpbmVDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpbmVzLmxlbmd0aDtcblx0fVxuXG5cdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubGluZXNbbGluZU51bWJlciAtIDFdO1xuXHR9XG59XG5cbnN1aXRlKCdGaW5kU2VjdGlvbkhlYWRlcnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZmluZHMgc2ltcGxlIHNlY3Rpb24gaGVhZGVycycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0U2VjdGlvbkhlYWRlckZpbmRlclRhcmdldChbXG5cdFx0XHQncmVndWxhciBsaW5lJyxcblx0XHRcdCdNQVJLOiBNeSBTZWN0aW9uJyxcblx0XHRcdCdhbm90aGVyIGxpbmUnLFxuXHRcdFx0J01BUks6IEFub3RoZXIgU2VjdGlvbicsXG5cdFx0XHQnbGFzdCBsaW5lJ1xuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnTUFSSzpcXFxccyooPzxsYWJlbD4uKikkJ1xuXHRcdH07XG5cblx0XHRjb25zdCBoZWFkZXJzID0gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycy5sZW5ndGgsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0udGV4dCwgJ015IFNlY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ0Fub3RoZXIgU2VjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2UuZW5kTGluZU51bWJlciwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRzIHNlY3Rpb24gaGVhZGVycyB3aXRoIHNlcGFyYXRvcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0J3JlZ3VsYXIgbGluZScsXG5cdFx0XHQnTUFSSzogLU15IFNlY3Rpb24nLFxuXHRcdFx0J2Fub3RoZXIgbGluZScsXG5cdFx0XHQnTUFSSzogLSBBbm90aGVyIFNlY3Rpb24nLFxuXHRcdFx0J2xhc3QgbGluZSdcblx0XHRdKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyA9IHtcblx0XHRcdGZpbmRSZWdpb25TZWN0aW9uSGVhZGVyczogZmFsc2UsXG5cdFx0XHRmaW5kTWFya1NlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogJ01BUks6XFxcXHMqKD88c2VwYXJhdG9yPi0/KVxcXFxzKig/PGxhYmVsPi4qKSQnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnTXkgU2VjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLmhhc1NlcGFyYXRvckxpbmUsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ0Fub3RoZXIgU2VjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLmhhc1NlcGFyYXRvckxpbmUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kcyBtdWx0aS1saW5lIHNlY3Rpb24gaGVhZGVycyB3aXRoIHNlcGFyYXRvcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0J3JlZ3VsYXIgbGluZScsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnLy8gTXkgU2VjdGlvbicsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnY29kZS4uLicsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnLy8gQW5vdGhlciBTZWN0aW9uJyxcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRcdCdtb3JlIGNvZGUuLi4nXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdeXFwvXFwvID0rXFxcXG5eXFwvXFwvICg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eXFwvXFwvID0rJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdNeSBTZWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCA0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdBbm90aGVyIFNlY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDgpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG92ZXJsYXBwaW5nIG11bHRpLWxpbmUgc2VjdGlvbiBoZWFkZXJzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0U2VjdGlvbkhlYWRlckZpbmRlclRhcmdldChbXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnLy8gU2VjdGlvbiAxJyxcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRcdCcvLyA9PT09PT09PT09JywgLy8gVGhpcyBsaW5lIHN0YXJ0cyBhbm90aGVyIGhlYWRlclxuXHRcdFx0Jy8vIFNlY3Rpb24gMicsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdeXFwvXFwvID0rXFxcXG5eXFwvXFwvICg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eXFwvXFwvID0rJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdTZWN0aW9uIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ1NlY3Rpb24gMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2UuZW5kTGluZU51bWJlciwgNik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlY3Rpb24gaGVhZGVycyBtdXN0IGJlIGluIGNvbW1lbnRzIHdoZW4gc3BlY2lmaWVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRcdCcvLyBTZWN0aW9uIDEnLCAgLy8gVGhpcyBvbmUgaXMgaW4gYSBjb21tZW50XG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnPT09PT09PT09PScsICAgIC8vIFRoaXMgb25lIGlzbid0XG5cdFx0XHQnU2VjdGlvbiAyJyxcblx0XHRcdCc9PT09PT09PT09J1xuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXig/OlxcL1xcLyApPz0rXFxcXG5eKD86XFwvXFwvICk/KD88bGFiZWw+W15cXFxcbl0rPylcXFxcbl4oPzpcXC9cXC8gKT89KyQnXG5cdFx0fTtcblxuXHRcdC8vIEJvdGggcGF0dGVybnMgbWF0Y2gsIGJ1dCB0aGUgc2Vjb25kIG9uZSBzaG91bGQgYmUgZmlsdGVyZWQgb3V0IGJ5IHRoZSB0b2tlbiBjaGVja1xuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnNob3VsZEJlSW5Db21tZW50cywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgc2VjdGlvbiBoZWFkZXJzIGF0IGNodW5rIGJvdW5kYXJpZXMnLCAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIGVub3VnaCBsaW5lcyB0byBlbnN1cmUgd2UgY3Jvc3MgY2h1bmsgYm91bmRhcmllc1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTUwOyBpKyspIHtcblx0XHRcdGxpbmVzLnB1c2goJ2xpbmUgJyArIGkpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBoZWFkZXJzIG5lYXIgdGhlIGNodW5rIGJvdW5kYXJ5IChjaHVuayBzaXplIGlzIDEwMClcblx0XHRsaW5lc1s5N10gPSAnLy8gPT09PT09PT09PSc7XG5cdFx0bGluZXNbOThdID0gJy8vIFNlY3Rpb24gMSc7XG5cdFx0bGluZXNbOTldID0gJy8vID09PT09PT09PT0nO1xuXHRcdGxpbmVzWzEwMF0gPSAnLy8gPT09PT09PT09PSc7XG5cdFx0bGluZXNbMTAxXSA9ICcvLyBTZWN0aW9uIDInO1xuXHRcdGxpbmVzWzEwMl0gPSAnLy8gPT09PT09PT09PSc7XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0U2VjdGlvbkhlYWRlckZpbmRlclRhcmdldChsaW5lcyk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdeXFwvXFwvID0rXFxcXG5eXFwvXFwvICg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eXFwvXFwvID0rJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdTZWN0aW9uIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDk4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ1NlY3Rpb24gMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMTAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCAxMDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGVtcHR5IHJlZ2V4IGdyYWNlZnVsbHkgd2l0aG91dCBpbmZpbml0ZSBsb29wJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnJyAvLyBFbXB0eSBzdHJpbmcgdGhhdCB3b3VsZCBjYXVzZSBpbmZpbml0ZSBsb29wXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMCwgJ1Nob3VsZCByZXR1cm4gbm8gaGVhZGVycyBmb3IgZW1wdHkgcmVnZXgnKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyB3aGl0ZXNwYWNlLW9ubHkgcmVnZXggZ3JhY2VmdWxseSB3aXRob3V0IGluZmluaXRlIGxvb3AnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0J2xpbmUgMScsXG5cdFx0XHQnbGluZSAyJyxcblx0XHRcdCdsaW5lIDMnXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICcgICAnIC8vIFdoaXRlc3BhY2UgdGhhdCB3b3VsZCBjYXVzZSBpbmZpbml0ZSBsb29wXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMCwgJ1Nob3VsZCByZXR1cm4gbm8gaGVhZGVycyBmb3Igd2hpdGVzcGFjZS1vbmx5IHJlZ2V4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcnJlY3RseSBhZHZhbmNlcyBwYXN0IG1hdGNoZXMgd2l0aG91dCBpbmZpbml0ZSBsb29wJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRcdCcvLyBTZWN0aW9uIDEnLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0J3NvbWUgY29kZScsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnLy8gU2VjdGlvbiAyJyxcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRcdCdtb3JlIGNvZGUnLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0Jy8vIFNlY3Rpb24gMycsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdeXFwvXFwvID0rXFxcXG5eXFwvXFwvICg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eXFwvXFwvID0rJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAzLCAnU2hvdWxkIGZpbmQgYWxsIHRocmVlIHNlY3Rpb24gaGVhZGVycycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdTZWN0aW9uIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS50ZXh0LCAnU2VjdGlvbiAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMl0udGV4dCwgJ1NlY3Rpb24gMycpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGNvbnNlY3V0aXZlIHNlY3Rpb24gaGVhZGVycyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0Jy8vIFNlY3Rpb24gMScsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnLy8gPT09PT09PT09PScsIC8vIFRoaXMgbGluZSBpcyBib3RoIHRoZSBlbmQgb2YgU2VjdGlvbiAxIGFuZCBzdGFydCBvZiBTZWN0aW9uIDJcblx0XHRcdCcvLyBTZWN0aW9uIDInLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXlxcL1xcLyA9K1xcXFxuXlxcL1xcLyAoPzxsYWJlbD5bXlxcXFxuXSs/KVxcXFxuXlxcL1xcLyA9KyQnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMiwgJ1Nob3VsZCBmaW5kIGJvdGggc2VjdGlvbiBoZWFkZXJzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0udGV4dCwgJ1NlY3Rpb24gMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdTZWN0aW9uIDInKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBuZXN0ZWQgc2VwYXJhdG9ycyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0Jy8vID09PT09PT09PT09PT09Jyxcblx0XHRcdCcvLyBNYWpvciBTZWN0aW9uJyxcblx0XHRcdCcvLyA9PT09PT09PT09PT09PScsXG5cdFx0XHQnJyxcblx0XHRcdCcvLyAtLS0tLS0tLS0tJyxcblx0XHRcdCcvLyBTdWJzZWN0aW9uJyxcblx0XHRcdCcvLyAtLS0tLS0tLS0tJyxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyA9IHtcblx0XHRcdGZpbmRSZWdpb25TZWN0aW9uSGVhZGVyczogZmFsc2UsXG5cdFx0XHRmaW5kTWFya1NlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogJ15cXC9cXC8gWy09XStcXFxcbl5cXC9cXC8gKD88bGFiZWw+W15cXFxcbl0rPylcXFxcbl5cXC9cXC8gWy09XSskJ1xuXHRcdH07XG5cblx0XHRjb25zdCBoZWFkZXJzID0gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycy5sZW5ndGgsIDIsICdTaG91bGQgZmluZCBib3RoIHNlY3Rpb24gaGVhZGVycycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdNYWpvciBTZWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ1N1YnNlY3Rpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBzZWN0aW9uIGhlYWRlcnMgYXQgY2h1bmsgYm91bmRhcmllcyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Ly8gRmlsbCB1cCB0byBuZWFyIHRoZSBjaHVuayBib3VuZGFyeSAoY2h1bmsgc2l6ZSBpcyAxMDApXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA5NzsgaSsrKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGBsaW5lICR7aX1gKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgYSBzZWN0aW9uIGhlYWRlciB0aGF0IHdvdWxkIGNyb3NzIHRoZSBjaHVuayBib3VuZGFyeVxuXHRcdGxpbmVzLnB1c2goJy8vID09PT09PT09PT0nKTsgIC8vIGxpbmUgOTdcblx0XHRsaW5lcy5wdXNoKCcvLyBTZWN0aW9uIDEnKTsgLy8gbGluZSA5OFxuXHRcdGxpbmVzLnB1c2goJy8vID09PT09PT09PT0nKTsgLy8gbGluZSA5OVxuXHRcdGxpbmVzLnB1c2goJy8vID09PT09PT09PT0nKTsgLy8gbGluZSAxMDAgKGNodW5rIGJvdW5kYXJ5KVxuXHRcdGxpbmVzLnB1c2goJy8vIFNlY3Rpb24gMicpOyAvLyBsaW5lIDEwMVxuXHRcdGxpbmVzLnB1c2goJy8vID09PT09PT09PT0nKTsgLy8gbGluZSAxMDJcblxuXHRcdC8vIEFkZCBtb3JlIGNvbnRlbnQgYWZ0ZXJcblx0XHRmb3IgKGxldCBpID0gMTAzOyBpIDwgMTUwOyBpKyspIHtcblx0XHRcdGxpbmVzLnB1c2goYGxpbmUgJHtpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KGxpbmVzKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyA9IHtcblx0XHRcdGZpbmRSZWdpb25TZWN0aW9uSGVhZGVyczogZmFsc2UsXG5cdFx0XHRmaW5kTWFya1NlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogJ15cXC9cXC8gPStcXFxcbl5cXC9cXC8gKD88bGFiZWw+W15cXFxcbl0rPylcXFxcbl5cXC9cXC8gPSskJ1xuXHRcdH07XG5cblx0XHRjb25zdCBoZWFkZXJzID0gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycy5sZW5ndGgsIDIsICdTaG91bGQgZmluZCBib3RoIHNlY3Rpb24gaGVhZGVycyBhY3Jvc3MgY2h1bmsgYm91bmRhcnknKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdTZWN0aW9uIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDk4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ1NlY3Rpb24gMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMTAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCAxMDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG92ZXJsYXBwaW5nIHNlY3Rpb24gaGVhZGVycyB3aXRob3V0IGR1cGxpY2F0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0Jy8vID09PT09PT09PT0nLCAgLy8gTGluZSAxXG5cdFx0XHQnLy8gU2VjdGlvbiAxJywgICAvLyBMaW5lIDIgLSBUaGlzIGlzIHBhcnQgb2YgZmlyc3QgaGVhZGVyXG5cdFx0XHQnLy8gPT09PT09PT09PScsICAvLyBMaW5lIDMgLSBUaGlzIGlzIHRoZSBlbmQgb2YgZmlyc3Rcblx0XHRcdCcvLyBTZWN0aW9uIDInLCAgIC8vIExpbmUgNCAtIFRoaXMgaXMgbm90IGEgaGVhZGVyXG5cdFx0XHQnLy8gPT09PT09PT09PScsICAvLyBMaW5lIDVcblx0XHRcdCcvLyA9PT09PT09PT09JywgIC8vIExpbmUgNiAtIFN0YXJ0IG9mIHNlY29uZCBoZWFkZXJcblx0XHRcdCcvLyBTZWN0aW9uIDMnLCAgIC8vIExpbmUgN1xuXHRcdFx0Jy8vID09PT09PT09PT09JyAgLy8gTGluZSA4XG5cdFx0XSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdeXFwvXFwvID0rXFxcXG5eXFwvXFwvICg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eXFwvXFwvID0rJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdTZWN0aW9uIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDMpO1xuXG5cdFx0Ly8gYXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ1NlY3Rpb24gMicpO1xuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMyk7XG5cdFx0Ly8gYXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2UuZW5kTGluZU51bWJlciwgNSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS50ZXh0LCAnU2VjdGlvbiAzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCA2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCA4KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBwYXJ0aWFsbHkgb3ZlcmxhcHBpbmcgbXVsdGlsaW5lIHNlY3Rpb24gaGVhZGVycyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0Jy8vID09PT09PT09PT09PT09PT0nLCAgLy8gTGluZSAxXG5cdFx0XHQnLy8gTWFqb3IgU2VjdGlvbiAxJywgICAvLyBMaW5lIDJcblx0XHRcdCcvLyA9PT09PT09PT09PT09PT09JywgIC8vIExpbmUgM1xuXHRcdFx0Jy8vIC0tLS0tLS0tJywgICAgICAgICAvLyBMaW5lIDQgLSBTdGFydCBvZiBzdWJzZWN0aW9uIHRoYXQgb3ZlcmxhcHMgd2l0aCBlbmQgb2YgbWFqb3Igc2VjdGlvblxuXHRcdFx0Jy8vIFN1YnNlY3Rpb24gMS4xJywgICAvLyBMaW5lIDVcblx0XHRcdCcvLyAtLS0tLS0tLScsICAgICAgICAgLy8gTGluZSA2XG5cdFx0XHQnLy8gPT09PT09PT09PT09PT09PScsICAvLyBMaW5lIDdcblx0XHRcdCcvLyBNYWpvciBTZWN0aW9uIDInLCAgIC8vIExpbmUgOFxuXHRcdFx0Jy8vID09PT09PT09PT09PT09PT0nLCAgLy8gTGluZSA5XG5cdFx0XSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdeXFwvXFwvIFstPV0rXFxcXG5eXFwvXFwvICg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eXFwvXFwvIFstPV0rJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdNYWpvciBTZWN0aW9uIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ1N1YnNlY3Rpb24gMS4xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCA2KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzJdLnRleHQsICdNYWpvciBTZWN0aW9uIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1syXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzJdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQStELDBCQUEwQjtBQUN6RixTQUFTLCtDQUErQztBQUV4RCxNQUFNLDhCQUFvRTtBQUFBLEVBQ3pFLFlBQTZCLE9BQWlCO0FBQWpCO0FBQUEsRUFBbUI7QUFBQSxFQUVoRCxlQUF1QjtBQUN0QixXQUFPLEtBQUss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
