import assert from "assert";
import * as Formatter from "../../common/jsonFormatter.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JSON - formatter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function format(content, expected, insertSpaces = true) {
    let range = void 0;
    const rangeStart = content.indexOf("|");
    const rangeEnd = content.lastIndexOf("|");
    if (rangeStart !== -1 && rangeEnd !== -1) {
      content = content.substring(0, rangeStart) + content.substring(rangeStart + 1, rangeEnd) + content.substring(rangeEnd + 1);
      range = { offset: rangeStart, length: rangeEnd - rangeStart };
    }
    const edits = Formatter.format(content, range, { tabSize: 2, insertSpaces, eol: "\n" });
    let lastEditOffset = content.length;
    for (let i = edits.length - 1; i >= 0; i--) {
      const edit = edits[i];
      assert(edit.offset >= 0 && edit.length >= 0 && edit.offset + edit.length <= content.length);
      assert(typeof edit.content === "string");
      assert(lastEditOffset >= edit.offset + edit.length);
      lastEditOffset = edit.offset;
      content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
    }
    assert.strictEqual(content, expected);
  }
  test("object - single property", () => {
    const content = [
      '{"x" : 1}'
    ].join("\n");
    const expected = [
      "{",
      '  "x": 1',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("object - multiple properties", () => {
    const content = [
      '{"x" : 1,  "y" : "foo", "z"  : true}'
    ].join("\n");
    const expected = [
      "{",
      '  "x": 1,',
      '  "y": "foo",',
      '  "z": true',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("object - no properties ", () => {
    const content = [
      '{"x" : {    },  "y" : {}}'
    ].join("\n");
    const expected = [
      "{",
      '  "x": {},',
      '  "y": {}',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("object - nesting", () => {
    const content = [
      '{"x" : {  "y" : { "z"  : { }}, "a": true}}'
    ].join("\n");
    const expected = [
      "{",
      '  "x": {',
      '    "y": {',
      '      "z": {}',
      "    },",
      '    "a": true',
      "  }",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("array - single items", () => {
    const content = [
      '["[]"]'
    ].join("\n");
    const expected = [
      "[",
      '  "[]"',
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("array - multiple items", () => {
    const content = [
      "[true,null,1.2]"
    ].join("\n");
    const expected = [
      "[",
      "  true,",
      "  null,",
      "  1.2",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("array - no items", () => {
    const content = [
      "[      ]"
    ].join("\n");
    const expected = [
      "[]"
    ].join("\n");
    format(content, expected);
  });
  test("array - nesting", () => {
    const content = [
      '[ [], [ [ {} ], "a" ]  ]'
    ].join("\n");
    const expected = [
      "[",
      "  [],",
      "  [",
      "    [",
      "      {}",
      "    ],",
      '    "a"',
      "  ]",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("syntax errors", () => {
    const content = [
      "[ null 1.2 ]"
    ].join("\n");
    const expected = [
      "[",
      "  null 1.2",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("empty lines", () => {
    const content = [
      "{",
      '"a": true,',
      "",
      '"b": true',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '	"a": true,',
      '	"b": true',
      "}"
    ].join("\n");
    format(content, expected, false);
  });
  test("single line comment", () => {
    const content = [
      "[ ",
      "//comment",
      '"foo", "bar"',
      "] "
    ].join("\n");
    const expected = [
      "[",
      "  //comment",
      '  "foo",',
      '  "bar"',
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("block line comment", () => {
    const content = [
      "[{",
      "        /*comment*/     ",
      '"foo" : true',
      "}] "
    ].join("\n");
    const expected = [
      "[",
      "  {",
      "    /*comment*/",
      '    "foo": true',
      "  }",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("single line comment on same line", () => {
    const content = [
      " {  ",
      '        "a": {}// comment    ',
      " } "
    ].join("\n");
    const expected = [
      "{",
      '  "a": {} // comment    ',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("single line comment on same line 2", () => {
    const content = [
      "{ //comment",
      "}"
    ].join("\n");
    const expected = [
      "{ //comment",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("block comment on same line", () => {
    const content = [
      '{      "a": {}, /*comment*/    ',
      '        /*comment*/ "b": {},    ',
      '        "c": {/*comment*/}    } '
    ].join("\n");
    const expected = [
      "{",
      '  "a": {}, /*comment*/',
      '  /*comment*/ "b": {},',
      '  "c": { /*comment*/}',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("block comment on same line advanced", () => {
    const content = [
      ' {       "d": [',
      "             null",
      "        ] /*comment*/",
      '        ,"e": /*comment*/ [null] }'
    ].join("\n");
    const expected = [
      "{",
      '  "d": [',
      "    null",
      "  ] /*comment*/,",
      '  "e": /*comment*/ [',
      "    null",
      "  ]",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("multiple block comments on same line", () => {
    const content = [
      '{      "a": {} /*comment*/, /*comment*/   ',
      '        /*comment*/ "b": {}  /*comment*/  } '
    ].join("\n");
    const expected = [
      "{",
      '  "a": {} /*comment*/, /*comment*/',
      '  /*comment*/ "b": {} /*comment*/',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("multiple mixed comments on same line", () => {
    const content = [
      "[ /*comment*/  /*comment*/   // comment ",
      "]"
    ].join("\n");
    const expected = [
      "[ /*comment*/ /*comment*/ // comment ",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("range", () => {
    const content = [
      '{ "a": {},',
      '|"b": [null, null]|',
      "} "
    ].join("\n");
    const expected = [
      '{ "a": {},',
      '"b": [',
      "  null,",
      "  null",
      "]",
      "} "
    ].join("\n");
    format(content, expected);
  });
  test("range with existing indent", () => {
    const content = [
      '{ "a": {},',
      '   |"b": [null],',
      '"c": {}',
      "}|"
    ].join("\n");
    const expected = [
      '{ "a": {},',
      '   "b": [',
      "    null",
      "  ],",
      '  "c": {}',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("range with existing indent - tabs", () => {
    const content = [
      '{ "a": {},',
      '|  "b": [null],   ',
      '"c": {}',
      "} |    "
    ].join("\n");
    const expected = [
      '{ "a": {},',
      '	"b": [',
      "		null",
      "	],",
      '	"c": {}',
      "}"
    ].join("\n");
    format(content, expected, false);
  });
  test("block comment none-line breaking symbols", () => {
    const content = [
      '{ "a": [ 1',
      "/* comment */",
      ", 2",
      "/* comment */",
      "]",
      "/* comment */",
      ",",
      ' "b": true',
      "/* comment */",
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "a": [',
      "    1",
      "    /* comment */",
      "    ,",
      "    2",
      "    /* comment */",
      "  ]",
      "  /* comment */",
      "  ,",
      '  "b": true',
      "  /* comment */",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("line comment after none-line breaking symbols", () => {
    const content = [
      '{ "a":',
      "// comment",
      "null,",
      ' "b"',
      "// comment",
      ": null",
      "// comment",
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "a":',
      "  // comment",
      "  null,",
      '  "b"',
      "  // comment",
      "  : null",
      "  // comment",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("toFormattedString", () => {
    const obj = {
      a: { b: 1, d: ["hello"] }
    };
    const getExpected = (tab, eol) => {
      return [
        `{`,
        `${tab}"a": {`,
        `${tab}${tab}"b": 1,`,
        `${tab}${tab}"d": [`,
        `${tab}${tab}${tab}"hello"`,
        `${tab}${tab}]`,
        `${tab}}`,
        "}"
      ].join(eol);
    };
    let actual = Formatter.toFormattedString(obj, { insertSpaces: true, tabSize: 2, eol: "\n" });
    assert.strictEqual(actual, getExpected("  ", "\n"));
    actual = Formatter.toFormattedString(obj, { insertSpaces: true, tabSize: 2, eol: "\r\n" });
    assert.strictEqual(actual, getExpected("  ", "\r\n"));
    actual = Formatter.toFormattedString(obj, { insertSpaces: false, eol: "\r\n" });
    assert.strictEqual(actual, getExpected("	", "\r\n"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGpzb25Gb3JtYXR0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBGb3JtYXR0ZXIgZnJvbSAnLi4vLi4vY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdKU09OIC0gZm9ybWF0dGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGZvcm1hdChjb250ZW50OiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcsIGluc2VydFNwYWNlcyA9IHRydWUpIHtcblx0XHRsZXQgcmFuZ2U6IEZvcm1hdHRlci5SYW5nZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCByYW5nZVN0YXJ0ID0gY29udGVudC5pbmRleE9mKCd8Jyk7XG5cdFx0Y29uc3QgcmFuZ2VFbmQgPSBjb250ZW50Lmxhc3RJbmRleE9mKCd8Jyk7XG5cdFx0aWYgKHJhbmdlU3RhcnQgIT09IC0xICYmIHJhbmdlRW5kICE9PSAtMSkge1xuXHRcdFx0Y29udGVudCA9IGNvbnRlbnQuc3Vic3RyaW5nKDAsIHJhbmdlU3RhcnQpICsgY29udGVudC5zdWJzdHJpbmcocmFuZ2VTdGFydCArIDEsIHJhbmdlRW5kKSArIGNvbnRlbnQuc3Vic3RyaW5nKHJhbmdlRW5kICsgMSk7XG5cdFx0XHRyYW5nZSA9IHsgb2Zmc2V0OiByYW5nZVN0YXJ0LCBsZW5ndGg6IHJhbmdlRW5kIC0gcmFuZ2VTdGFydCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzID0gRm9ybWF0dGVyLmZvcm1hdChjb250ZW50LCByYW5nZSwgeyB0YWJTaXplOiAyLCBpbnNlcnRTcGFjZXM6IGluc2VydFNwYWNlcywgZW9sOiAnXFxuJyB9KTtcblxuXHRcdGxldCBsYXN0RWRpdE9mZnNldCA9IGNvbnRlbnQubGVuZ3RoO1xuXHRcdGZvciAobGV0IGkgPSBlZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgZWRpdCA9IGVkaXRzW2ldO1xuXHRcdFx0YXNzZXJ0KGVkaXQub2Zmc2V0ID49IDAgJiYgZWRpdC5sZW5ndGggPj0gMCAmJiBlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoIDw9IGNvbnRlbnQubGVuZ3RoKTtcblx0XHRcdGFzc2VydCh0eXBlb2YgZWRpdC5jb250ZW50ID09PSAnc3RyaW5nJyk7XG5cdFx0XHRhc3NlcnQobGFzdEVkaXRPZmZzZXQgPj0gZWRpdC5vZmZzZXQgKyBlZGl0Lmxlbmd0aCk7IC8vIG1ha2Ugc3VyZSBhbGwgZWRpdHMgYXJlIG9yZGVyZWRcblx0XHRcdGxhc3RFZGl0T2Zmc2V0ID0gZWRpdC5vZmZzZXQ7XG5cdFx0XHRjb250ZW50ID0gY29udGVudC5zdWJzdHJpbmcoMCwgZWRpdC5vZmZzZXQpICsgZWRpdC5jb250ZW50ICsgY29udGVudC5zdWJzdHJpbmcoZWRpdC5vZmZzZXQgKyBlZGl0Lmxlbmd0aCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fVxuXG5cdHRlc3QoJ29iamVjdCAtIHNpbmdsZSBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3tcInhcIiA6IDF9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwieFwiOiAxJyxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnb2JqZWN0IC0gbXVsdGlwbGUgcHJvcGVydGllcycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3tcInhcIiA6IDEsICBcInlcIiA6IFwiZm9vXCIsIFwielwiICA6IHRydWV9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwieFwiOiAxLCcsXG5cdFx0XHQnICBcInlcIjogXCJmb29cIiwnLFxuXHRcdFx0JyAgXCJ6XCI6IHRydWUnLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXHR0ZXN0KCdvYmplY3QgLSBubyBwcm9wZXJ0aWVzICcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3tcInhcIiA6IHsgICAgfSwgIFwieVwiIDoge319J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwieFwiOiB7fSwnLFxuXHRcdFx0JyAgXCJ5XCI6IHt9Jyxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnb2JqZWN0IC0gbmVzdGluZycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3tcInhcIiA6IHsgIFwieVwiIDogeyBcInpcIiAgOiB7IH19LCBcImFcIjogdHJ1ZX19J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwieFwiOiB7Jyxcblx0XHRcdCcgICAgXCJ5XCI6IHsnLFxuXHRcdFx0JyAgICAgIFwielwiOiB7fScsXG5cdFx0XHQnICAgIH0sJyxcblx0XHRcdCcgICAgXCJhXCI6IHRydWUnLFxuXHRcdFx0JyAgfScsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnYXJyYXkgLSBzaW5nbGUgaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCdbXCJbXVwiXSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQnWycsXG5cdFx0XHQnICBcIltdXCInLFxuXHRcdFx0J10nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FycmF5IC0gbXVsdGlwbGUgaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCdbdHJ1ZSxudWxsLDEuMl0nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J1snLFxuXHRcdFx0JyAgdHJ1ZSwnLFxuXHRcdFx0JyAgbnVsbCwnLFxuXHRcdFx0JyAgMS4yJyxcblx0XHRcdCddJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcnJheSAtIG5vIGl0ZW1zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnWyAgICAgIF0nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J1tdJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcnJheSAtIG5lc3RpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCdbIFtdLCBbIFsge30gXSwgXCJhXCIgXSAgXSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQnWycsXG5cdFx0XHQnICBbXSwnLFxuXHRcdFx0JyAgWycsXG5cdFx0XHQnICAgIFsnLFxuXHRcdFx0JyAgICAgIHt9Jyxcblx0XHRcdCcgICAgXSwnLFxuXHRcdFx0JyAgICBcImFcIicsXG5cdFx0XHQnICBdJyxcblx0XHRcdCddJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnc3ludGF4IGVycm9ycycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J1sgbnVsbCAxLjIgXSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQnWycsXG5cdFx0XHQnICBudWxsIDEuMicsXG5cdFx0XHQnXScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnXCJhXCI6IHRydWUsJyxcblx0XHRcdCcnLFxuXHRcdFx0J1wiYlwiOiB0cnVlJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnXFx0XCJhXCI6IHRydWUsJyxcblx0XHRcdCdcXHRcImJcIjogdHJ1ZScsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCwgZmFsc2UpO1xuXHR9KTtcblx0dGVzdCgnc2luZ2xlIGxpbmUgY29tbWVudCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J1sgJyxcblx0XHRcdCcvL2NvbW1lbnQnLFxuXHRcdFx0J1wiZm9vXCIsIFwiYmFyXCInLFxuXHRcdFx0J10gJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCdbJyxcblx0XHRcdCcgIC8vY29tbWVudCcsXG5cdFx0XHQnICBcImZvb1wiLCcsXG5cdFx0XHQnICBcImJhclwiJyxcblx0XHRcdCddJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cdHRlc3QoJ2Jsb2NrIGxpbmUgY29tbWVudCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J1t7Jyxcblx0XHRcdCcgICAgICAgIC8qY29tbWVudCovICAgICAnLFxuXHRcdFx0J1wiZm9vXCIgOiB0cnVlJyxcblx0XHRcdCd9XSAnXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J1snLFxuXHRcdFx0JyAgeycsXG5cdFx0XHQnICAgIC8qY29tbWVudCovJyxcblx0XHRcdCcgICAgXCJmb29cIjogdHJ1ZScsXG5cdFx0XHQnICB9Jyxcblx0XHRcdCddJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cdHRlc3QoJ3NpbmdsZSBsaW5lIGNvbW1lbnQgb24gc2FtZSBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnIHsgICcsXG5cdFx0XHQnICAgICAgICBcImFcIjoge30vLyBjb21tZW50ICAgICcsXG5cdFx0XHQnIH0gJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwiYVwiOiB7fSAvLyBjb21tZW50ICAgICcsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXHR0ZXN0KCdzaW5nbGUgbGluZSBjb21tZW50IG9uIHNhbWUgbGluZSAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQneyAvL2NvbW1lbnQnLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3sgLy9jb21tZW50Jyxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnYmxvY2sgY29tbWVudCBvbiBzYW1lIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCd7ICAgICAgXCJhXCI6IHt9LCAvKmNvbW1lbnQqLyAgICAnLFxuXHRcdFx0JyAgICAgICAgLypjb21tZW50Ki8gXCJiXCI6IHt9LCAgICAnLFxuXHRcdFx0JyAgICAgICAgXCJjXCI6IHsvKmNvbW1lbnQqL30gICAgfSAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwiYVwiOiB7fSwgLypjb21tZW50Ki8nLFxuXHRcdFx0JyAgLypjb21tZW50Ki8gXCJiXCI6IHt9LCcsXG5cdFx0XHQnICBcImNcIjogeyAvKmNvbW1lbnQqL30nLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdibG9jayBjb21tZW50IG9uIHNhbWUgbGluZSBhZHZhbmNlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0JyB7ICAgICAgIFwiZFwiOiBbJyxcblx0XHRcdCcgICAgICAgICAgICAgbnVsbCcsXG5cdFx0XHQnICAgICAgICBdIC8qY29tbWVudCovJyxcblx0XHRcdCcgICAgICAgICxcImVcIjogLypjb21tZW50Ki8gW251bGxdIH0nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwiZFwiOiBbJyxcblx0XHRcdCcgICAgbnVsbCcsXG5cdFx0XHQnICBdIC8qY29tbWVudCovLCcsXG5cdFx0XHQnICBcImVcIjogLypjb21tZW50Ki8gWycsXG5cdFx0XHQnICAgIG51bGwnLFxuXHRcdFx0JyAgXScsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIGJsb2NrIGNvbW1lbnRzIG9uIHNhbWUgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3sgICAgICBcImFcIjoge30gLypjb21tZW50Ki8sIC8qY29tbWVudCovICAgJyxcblx0XHRcdCcgICAgICAgIC8qY29tbWVudCovIFwiYlwiOiB7fSAgLypjb21tZW50Ki8gIH0gJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwiYVwiOiB7fSAvKmNvbW1lbnQqLywgLypjb21tZW50Ki8nLFxuXHRcdFx0JyAgLypjb21tZW50Ki8gXCJiXCI6IHt9IC8qY29tbWVudCovJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cdHRlc3QoJ211bHRpcGxlIG1peGVkIGNvbW1lbnRzIG9uIHNhbWUgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J1sgLypjb21tZW50Ki8gIC8qY29tbWVudCovICAgLy8gY29tbWVudCAnLFxuXHRcdFx0J10nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J1sgLypjb21tZW50Ki8gLypjb21tZW50Ki8gLy8gY29tbWVudCAnLFxuXHRcdFx0J10nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQneyBcImFcIjoge30sJyxcblx0XHRcdCd8XCJiXCI6IFtudWxsLCBudWxsXXwnLFxuXHRcdFx0J30gJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7IFwiYVwiOiB7fSwnLFxuXHRcdFx0J1wiYlwiOiBbJyxcblx0XHRcdCcgIG51bGwsJyxcblx0XHRcdCcgIG51bGwnLFxuXHRcdFx0J10nLFxuXHRcdFx0J30gJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZ2Ugd2l0aCBleGlzdGluZyBpbmRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCd7IFwiYVwiOiB7fSwnLFxuXHRcdFx0JyAgIHxcImJcIjogW251bGxdLCcsXG5cdFx0XHQnXCJjXCI6IHt9Jyxcblx0XHRcdCd9fCdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneyBcImFcIjoge30sJyxcblx0XHRcdCcgICBcImJcIjogWycsXG5cdFx0XHQnICAgIG51bGwnLFxuXHRcdFx0JyAgXSwnLFxuXHRcdFx0JyAgXCJjXCI6IHt9Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZ2Ugd2l0aCBleGlzdGluZyBpbmRlbnQgLSB0YWJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQneyBcImFcIjoge30sJyxcblx0XHRcdCd8ICBcImJcIjogW251bGxdLCAgICcsXG5cdFx0XHQnXCJjXCI6IHt9Jyxcblx0XHRcdCd9IHwgICAgJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7IFwiYVwiOiB7fSwnLFxuXHRcdFx0J1xcdFwiYlwiOiBbJyxcblx0XHRcdCdcXHRcXHRudWxsJyxcblx0XHRcdCdcXHRdLCcsXG5cdFx0XHQnXFx0XCJjXCI6IHt9Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkLCBmYWxzZSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnYmxvY2sgY29tbWVudCBub25lLWxpbmUgYnJlYWtpbmcgc3ltYm9scycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3sgXCJhXCI6IFsgMScsXG5cdFx0XHQnLyogY29tbWVudCAqLycsXG5cdFx0XHQnLCAyJyxcblx0XHRcdCcvKiBjb21tZW50ICovJyxcblx0XHRcdCddJyxcblx0XHRcdCcvKiBjb21tZW50ICovJyxcblx0XHRcdCcsJyxcblx0XHRcdCcgXCJiXCI6IHRydWUnLFxuXHRcdFx0Jy8qIGNvbW1lbnQgKi8nLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJhXCI6IFsnLFxuXHRcdFx0JyAgICAxJyxcblx0XHRcdCcgICAgLyogY29tbWVudCAqLycsXG5cdFx0XHQnICAgICwnLFxuXHRcdFx0JyAgICAyJyxcblx0XHRcdCcgICAgLyogY29tbWVudCAqLycsXG5cdFx0XHQnICBdJyxcblx0XHRcdCcgIC8qIGNvbW1lbnQgKi8nLFxuXHRcdFx0JyAgLCcsXG5cdFx0XHQnICBcImJcIjogdHJ1ZScsXG5cdFx0XHQnICAvKiBjb21tZW50ICovJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cdHRlc3QoJ2xpbmUgY29tbWVudCBhZnRlciBub25lLWxpbmUgYnJlYWtpbmcgc3ltYm9scycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3sgXCJhXCI6Jyxcblx0XHRcdCcvLyBjb21tZW50Jyxcblx0XHRcdCdudWxsLCcsXG5cdFx0XHQnIFwiYlwiJyxcblx0XHRcdCcvLyBjb21tZW50Jyxcblx0XHRcdCc6IG51bGwnLFxuXHRcdFx0Jy8vIGNvbW1lbnQnLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJhXCI6Jyxcblx0XHRcdCcgIC8vIGNvbW1lbnQnLFxuXHRcdFx0JyAgbnVsbCwnLFxuXHRcdFx0JyAgXCJiXCInLFxuXHRcdFx0JyAgLy8gY29tbWVudCcsXG5cdFx0XHQnICA6IG51bGwnLFxuXHRcdFx0JyAgLy8gY29tbWVudCcsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvRm9ybWF0dGVkU3RyaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9iaiA9IHtcblx0XHRcdGE6IHsgYjogMSwgZDogWydoZWxsbyddIH1cblx0XHR9O1xuXG5cblx0XHRjb25zdCBnZXRFeHBlY3RlZCA9ICh0YWI6IHN0cmluZywgZW9sOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdGB7YCxcblx0XHRcdFx0YCR7dGFifVwiYVwiOiB7YCxcblx0XHRcdFx0YCR7dGFifSR7dGFifVwiYlwiOiAxLGAsXG5cdFx0XHRcdGAke3RhYn0ke3RhYn1cImRcIjogW2AsXG5cdFx0XHRcdGAke3RhYn0ke3RhYn0ke3RhYn1cImhlbGxvXCJgLFxuXHRcdFx0XHRgJHt0YWJ9JHt0YWJ9XWAsXG5cdFx0XHRcdGAke3RhYn19YCxcblx0XHRcdFx0J30nXG5cdFx0XHRdLmpvaW4oZW9sKTtcblx0XHR9O1xuXG5cdFx0bGV0IGFjdHVhbCA9IEZvcm1hdHRlci50b0Zvcm1hdHRlZFN0cmluZyhvYmosIHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiAyLCBlb2w6ICdcXG4nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGdldEV4cGVjdGVkKCcgICcsICdcXG4nKSk7XG5cblx0XHRhY3R1YWwgPSBGb3JtYXR0ZXIudG9Gb3JtYXR0ZWRTdHJpbmcob2JqLCB7IGluc2VydFNwYWNlczogdHJ1ZSwgdGFiU2l6ZTogMiwgZW9sOiAnXFxyXFxuJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBnZXRFeHBlY3RlZCgnICAnLCAnXFxyXFxuJykpO1xuXG5cdFx0YWN0dWFsID0gRm9ybWF0dGVyLnRvRm9ybWF0dGVkU3RyaW5nKG9iaiwgeyBpbnNlcnRTcGFjZXM6IGZhbHNlLCBlb2w6ICdcXHJcXG4nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGdldEV4cGVjdGVkKCdcXHQnLCAnXFxyXFxuJykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1h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
