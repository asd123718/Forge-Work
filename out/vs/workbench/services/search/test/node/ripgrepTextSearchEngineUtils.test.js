import assert from "assert";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { fixRegexNewline, RipgrepParser, unicodeEscapesToPCRE2, fixNewline, getRgArgs, performBraceExpansionForRipgrep } from "../../node/ripgrepTextSearchEngine.js";
import { Range, TextSearchMatch2 } from "../../common/searchExtTypes.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS } from "../../common/search.js";
suite("RipgrepTextSearchEngine", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("unicodeEscapesToPCRE2", async () => {
    assert.strictEqual(unicodeEscapesToPCRE2("\\u1234"), "\\x{1234}");
    assert.strictEqual(unicodeEscapesToPCRE2("\\u1234\\u0001"), "\\x{1234}\\x{0001}");
    assert.strictEqual(unicodeEscapesToPCRE2("foo\\u1234bar"), "foo\\x{1234}bar");
    assert.strictEqual(unicodeEscapesToPCRE2("\\\\\\u1234"), "\\\\\\x{1234}");
    assert.strictEqual(unicodeEscapesToPCRE2("foo\\\\\\u1234"), "foo\\\\\\x{1234}");
    assert.strictEqual(unicodeEscapesToPCRE2("\\u{1234}"), "\\x{1234}");
    assert.strictEqual(unicodeEscapesToPCRE2("\\u{1234}\\u{0001}"), "\\x{1234}\\x{0001}");
    assert.strictEqual(unicodeEscapesToPCRE2("foo\\u{1234}bar"), "foo\\x{1234}bar");
    assert.strictEqual(unicodeEscapesToPCRE2("[\\u00A0-\\u00FF]"), "[\\x{00A0}-\\x{00FF}]");
    assert.strictEqual(unicodeEscapesToPCRE2("foo\\u{123456}7bar"), "foo\\u{123456}7bar");
    assert.strictEqual(unicodeEscapesToPCRE2("\\u123"), "\\u123");
    assert.strictEqual(unicodeEscapesToPCRE2("foo"), "foo");
    assert.strictEqual(unicodeEscapesToPCRE2(""), "");
  });
  test("fixRegexNewline - src", () => {
    const ttable = [
      ["foo", "foo"],
      ["invalid(", "invalid("],
      ["fo\\no", "fo\\r?\\no"],
      ["f\\no\\no", "f\\r?\\no\\r?\\no"],
      ["f[a-z\\n1]", "f(?:[a-z1]|\\r?\\n)"],
      ["f[\\n-a]", "f[\\n-a]"],
      ["(?<=\\n)\\w", "(?<=\\n)\\w"],
      ["fo\\n+o", "fo(?:\\r?\\n)+o"],
      ["fo[^\\n]o", "fo(?!\\r?\\n)o"],
      ["fo[^\\na-z]o", "fo(?!\\r?\\n|[a-z])o"],
      ["foo[^\\n]+o", "foo.+o"],
      ["foo[^\\nzq]+o", "foo[^zq]+o"],
      ["foo[^\\nzq]+o", "foo[^zq]+o"],
      // preserves quantifies, #137899
      ["fo[^\\S\\n]*o", "fo[^\\S]*o"],
      ["fo[^\\S\\n]{3,}o", "fo[^\\S]{3,}o"]
    ];
    for (const [input, expected] of ttable) {
      assert.strictEqual(fixRegexNewline(input), expected, `${input} -> ${expected}`);
    }
  });
  test("fixRegexNewline - re", () => {
    function testFixRegexNewline([inputReg, testStr, shouldMatch]) {
      const fixed = fixRegexNewline(inputReg);
      const reg = new RegExp(fixed);
      assert.strictEqual(reg.test(testStr), shouldMatch, `${inputReg} => ${reg}, ${testStr}, ${shouldMatch}`);
    }
    [
      ["foo", "foo", true],
      ["foo\\n", "foo\r\n", true],
      ["foo\\n\\n", "foo\n\n", true],
      ["foo\\n\\n", "foo\r\n\r\n", true],
      ["foo\\n", "foo\n", true],
      ["foo\\nabc", "foo\r\nabc", true],
      ["foo\\nabc", "foo\nabc", true],
      ["foo\\r\\n", "foo\r\n", true],
      ["foo\\n+abc", "foo\r\nabc", true],
      ["foo\\n+abc", "foo\n\n\nabc", true],
      ["foo\\n+abc", "foo\r\n\r\n\r\nabc", true],
      ["foo[\\n-9]+abc", "foo1abc", true]
    ].forEach(testFixRegexNewline);
  });
  test("fixNewline - matching", () => {
    function testFixNewline([inputReg, testStr, shouldMatch = true]) {
      const fixed = fixNewline(inputReg);
      const reg = new RegExp(fixed);
      assert.strictEqual(reg.test(testStr), shouldMatch, `${inputReg} => ${reg}, ${testStr}, ${shouldMatch}`);
    }
    [
      ["foo", "foo"],
      ["foo\n", "foo\r\n"],
      ["foo\n", "foo\n"],
      ["foo\nabc", "foo\r\nabc"],
      ["foo\nabc", "foo\nabc"],
      ["foo\r\n", "foo\r\n"],
      ["foo\nbarc", "foobar", false],
      ["foobar", "foo\nbar", false]
    ].forEach(testFixNewline);
  });
  suite("RipgrepParser", () => {
    const TEST_FOLDER = URI.file("/foo/bar");
    function testParser(inputData, expectedResults) {
      const testParser2 = new RipgrepParser(1e3, TEST_FOLDER, DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS);
      const actualResults = [];
      testParser2.on("result", (r) => {
        actualResults.push(r);
      });
      inputData.forEach((d) => testParser2.handleData(d));
      testParser2.flush();
      assert.deepStrictEqual(actualResults, expectedResults);
    }
    function makeRgMatch(relativePath, text, lineNumber, matchRanges) {
      return JSON.stringify({
        type: "match",
        data: {
          path: {
            text: relativePath
          },
          lines: {
            text
          },
          line_number: lineNumber,
          absolute_offset: 0,
          // unused
          submatches: matchRanges.map((mr) => {
            return {
              ...mr,
              match: { text: text.substring(mr.start, mr.end) }
            };
          })
        }
      }) + "\n";
    }
    test("single result", () => {
      testParser(
        [
          makeRgMatch("file1.js", "foobar", 4, [{ start: 3, end: 6 }])
        ],
        [
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "file1.js"),
            [{
              previewRange: new Range(0, 3, 0, 6),
              sourceRange: new Range(3, 3, 3, 6)
            }],
            "foobar"
          )
        ]
      );
    });
    test("multiple results", () => {
      testParser(
        [
          makeRgMatch("file1.js", "foobar", 4, [{ start: 3, end: 6 }]),
          makeRgMatch("app/file2.js", "foobar", 4, [{ start: 3, end: 6 }]),
          makeRgMatch("app2/file3.js", "foobar", 4, [{ start: 3, end: 6 }])
        ],
        [
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "file1.js"),
            [{
              previewRange: new Range(0, 3, 0, 6),
              sourceRange: new Range(3, 3, 3, 6)
            }],
            "foobar"
          ),
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "app/file2.js"),
            [{
              previewRange: new Range(0, 3, 0, 6),
              sourceRange: new Range(3, 3, 3, 6)
            }],
            "foobar"
          ),
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "app2/file3.js"),
            [{
              previewRange: new Range(0, 3, 0, 6),
              sourceRange: new Range(3, 3, 3, 6)
            }],
            "foobar"
          )
        ]
      );
    });
    test("chopped-up input chunks", () => {
      const dataStrs = [
        makeRgMatch("file1.js", "foo bar", 4, [{ start: 3, end: 7 }]),
        makeRgMatch("app/file2.js", "foobar", 4, [{ start: 3, end: 6 }]),
        makeRgMatch("app2/file3.js", "foobar", 4, [{ start: 3, end: 6 }])
      ];
      const dataStr0Space = dataStrs[0].indexOf(" ");
      testParser(
        [
          dataStrs[0].substring(0, dataStr0Space + 1),
          dataStrs[0].substring(dataStr0Space + 1),
          "\n",
          dataStrs[1].trim(),
          "\n" + dataStrs[2].substring(0, 25),
          dataStrs[2].substring(25)
        ],
        [
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "file1.js"),
            [{
              previewRange: new Range(0, 3, 0, 7),
              sourceRange: new Range(3, 3, 3, 7)
            }],
            "foo bar"
          ),
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "app/file2.js"),
            [{
              previewRange: new Range(0, 3, 0, 6),
              sourceRange: new Range(3, 3, 3, 6)
            }],
            "foobar"
          ),
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "app2/file3.js"),
            [{
              previewRange: new Range(0, 3, 0, 6),
              sourceRange: new Range(3, 3, 3, 6)
            }],
            "foobar"
          )
        ]
      );
    });
    test("empty result (#100569)", () => {
      testParser(
        [
          makeRgMatch("file1.js", "foobar", 4, []),
          makeRgMatch("file1.js", "", 5, [])
        ],
        [
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "file1.js"),
            [
              {
                previewRange: new Range(0, 0, 0, 1),
                sourceRange: new Range(3, 0, 3, 1)
              }
            ],
            "foobar"
          ),
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "file1.js"),
            [
              {
                previewRange: new Range(0, 0, 0, 0),
                sourceRange: new Range(4, 0, 4, 0)
              }
            ],
            ""
          )
        ]
      );
    });
    test("multiple submatches without newline in between (#131507)", () => {
      testParser(
        [
          makeRgMatch("file1.js", "foobarbazquux", 4, [{ start: 0, end: 4 }, { start: 6, end: 10 }])
        ],
        [
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "file1.js"),
            [
              {
                previewRange: new Range(0, 0, 0, 4),
                sourceRange: new Range(3, 0, 3, 4)
              },
              {
                previewRange: new Range(0, 6, 0, 10),
                sourceRange: new Range(3, 6, 3, 10)
              }
            ],
            "foobarbazquux"
          )
        ]
      );
    });
    test("multiple submatches with newline in between (#131507)", () => {
      testParser(
        [
          makeRgMatch("file1.js", "foo\nbar\nbaz\nquux", 4, [{ start: 0, end: 5 }, { start: 8, end: 13 }])
        ],
        [
          new TextSearchMatch2(
            joinPath(TEST_FOLDER, "file1.js"),
            [
              {
                previewRange: new Range(0, 0, 1, 1),
                sourceRange: new Range(3, 0, 4, 1)
              },
              {
                previewRange: new Range(2, 0, 3, 1),
                sourceRange: new Range(5, 0, 6, 1)
              }
            ],
            "foo\nbar\nbaz\nquux"
          )
        ]
      );
    });
  });
  suite("getRgArgs", () => {
    test("simple includes", () => {
      function testGetRgArgs(includes, expectedFromIncludes) {
        const query = {
          pattern: "test"
        };
        const options = {
          folderOptions: {
            includes,
            excludes: [],
            useIgnoreFiles: {
              local: false,
              global: false,
              parent: false
            },
            followSymlinks: false,
            folder: URI.file("/some/folder"),
            encoding: "utf8"
          },
          maxResults: 1e3
        };
        const expected = [
          "--hidden",
          "--no-require-git",
          "--ignore-case",
          ...expectedFromIncludes,
          "--no-ignore",
          "--crlf",
          "--fixed-strings",
          "--no-config",
          "--no-ignore-global",
          "--json",
          "--",
          "test",
          "."
        ];
        const result = getRgArgs(query, options);
        assert.deepStrictEqual(result, expected);
      }
      [
        [["a/*", "b/*"], ["-g", "!*", "-g", "/a", "-g", "/a/*", "-g", "/b", "-g", "/b/*"]],
        [["**/a/*", "b/*"], ["-g", "!*", "-g", "/b", "-g", "/b/*", "-g", "**/a/*"]],
        [["**/a/*", "**/b/*"], ["-g", "**/a/*", "-g", "**/b/*"]],
        [["foo/*bar/something/**"], ["-g", "!*", "-g", "/foo", "-g", "/foo/*bar", "-g", "/foo/*bar/something", "-g", "/foo/*bar/something/**"]]
      ].forEach(([includes, expectedFromIncludes]) => testGetRgArgs(includes, expectedFromIncludes));
    });
  });
  test("brace expansion for ripgrep", () => {
    function testBraceExpansion(argGlob, expectedGlob) {
      const result = performBraceExpansionForRipgrep(argGlob);
      assert.deepStrictEqual(result, expectedGlob);
    }
    [
      ["eep/{a,b}/test", ["eep/a/test", "eep/b/test"]],
      ["eep/{a,b}/{c,d,e}", ["eep/a/c", "eep/a/d", "eep/a/e", "eep/b/c", "eep/b/d", "eep/b/e"]],
      ["eep/{a,b}/\\{c,d,e}", ["eep/a/{c,d,e}", "eep/b/{c,d,e}"]],
      ["eep/{a,b\\}/test", ["eep/{a,b}/test"]],
      ["eep/{a,b\\\\}/test", ["eep/a/test", "eep/b\\\\/test"]],
      ["eep/{a,b\\\\\\}/test", ["eep/{a,b\\\\}/test"]],
      ["e\\{ep/{a,b}/test", ["e{ep/a/test", "e{ep/b/test"]],
      ["eep/{a,\\b}/test", ["eep/a/test", "eep/\\b/test"]],
      ["{a/*.*,b/*.*}", ["a/*.*", "b/*.*"]],
      ["{{}", ["{{}"]],
      ["aa{{}", ["aa{{}"]],
      ["{b{}", ["{b{}"]],
      ["{{}c", ["{{}c"]],
      ["{{}}", ["{{}}"]],
      ["\\{{}}", ["{}"]],
      ["{}foo", ["foo"]],
      ["bar{ }foo", ["bar foo"]],
      ["{}", [""]]
    ].forEach(([includePattern, expectedPatterns]) => testBraceExpansion(includePattern, expectedPatterns));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXHRlc3RcXG5vZGVcXHJpcGdyZXBUZXh0U2VhcmNoRW5naW5lVXRpbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBmaXhSZWdleE5ld2xpbmUsIElSZ01hdGNoLCBJUmdNZXNzYWdlLCBSaXBncmVwUGFyc2VyLCB1bmljb2RlRXNjYXBlc1RvUENSRTIsIGZpeE5ld2xpbmUsIGdldFJnQXJncywgcGVyZm9ybUJyYWNlRXhwYW5zaW9uRm9yUmlwZ3JlcCB9IGZyb20gJy4uLy4uL25vZGUvcmlwZ3JlcFRleHRTZWFyY2hFbmdpbmUuanMnO1xuaW1wb3J0IHsgUmFuZ2UsIFRleHRTZWFyY2hNYXRjaDIsIFRleHRTZWFyY2hRdWVyeTIsIFRleHRTZWFyY2hSZXN1bHQyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlYXJjaEV4dFR5cGVzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmlwZ3JlcFRleHRTZWFyY2hPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlYXJjaEV4dFR5cGVzSW50ZXJuYWwuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9URVhUX1NFQVJDSF9QUkVWSUVXX09QVElPTlMgfSBmcm9tICcuLi8uLi9jb21tb24vc2VhcmNoLmpzJztcblxuc3VpdGUoJ1JpcGdyZXBUZXh0U2VhcmNoRW5naW5lJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVzdCgndW5pY29kZUVzY2FwZXNUb1BDUkUyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmljb2RlRXNjYXBlc1RvUENSRTIoJ1xcXFx1MTIzNCcpLCAnXFxcXHh7MTIzNH0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5pY29kZUVzY2FwZXNUb1BDUkUyKCdcXFxcdTEyMzRcXFxcdTAwMDEnKSwgJ1xcXFx4ezEyMzR9XFxcXHh7MDAwMX0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5pY29kZUVzY2FwZXNUb1BDUkUyKCdmb29cXFxcdTEyMzRiYXInKSwgJ2Zvb1xcXFx4ezEyMzR9YmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuaWNvZGVFc2NhcGVzVG9QQ1JFMignXFxcXFxcXFxcXFxcdTEyMzQnKSwgJ1xcXFxcXFxcXFxcXHh7MTIzNH0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5pY29kZUVzY2FwZXNUb1BDUkUyKCdmb29cXFxcXFxcXFxcXFx1MTIzNCcpLCAnZm9vXFxcXFxcXFxcXFxceHsxMjM0fScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuaWNvZGVFc2NhcGVzVG9QQ1JFMignXFxcXHV7MTIzNH0nKSwgJ1xcXFx4ezEyMzR9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuaWNvZGVFc2NhcGVzVG9QQ1JFMignXFxcXHV7MTIzNH1cXFxcdXswMDAxfScpLCAnXFxcXHh7MTIzNH1cXFxceHswMDAxfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmljb2RlRXNjYXBlc1RvUENSRTIoJ2Zvb1xcXFx1ezEyMzR9YmFyJyksICdmb29cXFxceHsxMjM0fWJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmljb2RlRXNjYXBlc1RvUENSRTIoJ1tcXFxcdTAwQTAtXFxcXHUwMEZGXScpLCAnW1xcXFx4ezAwQTB9LVxcXFx4ezAwRkZ9XScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuaWNvZGVFc2NhcGVzVG9QQ1JFMignZm9vXFxcXHV7MTIzNDU2fTdiYXInKSwgJ2Zvb1xcXFx1ezEyMzQ1Nn03YmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuaWNvZGVFc2NhcGVzVG9QQ1JFMignXFxcXHUxMjMnKSwgJ1xcXFx1MTIzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuaWNvZGVFc2NhcGVzVG9QQ1JFMignZm9vJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5pY29kZUVzY2FwZXNUb1BDUkUyKCcnKSwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXhSZWdleE5ld2xpbmUgLSBzcmMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHRhYmxlID0gW1xuXHRcdFx0Wydmb28nLCAnZm9vJ10sXG5cdFx0XHRbJ2ludmFsaWQoJywgJ2ludmFsaWQoJ10sXG5cdFx0XHRbJ2ZvXFxcXG5vJywgJ2ZvXFxcXHI/XFxcXG5vJ10sXG5cdFx0XHRbJ2ZcXFxcbm9cXFxcbm8nLCAnZlxcXFxyP1xcXFxub1xcXFxyP1xcXFxubyddLFxuXHRcdFx0WydmW2EtelxcXFxuMV0nLCAnZig/OlthLXoxXXxcXFxccj9cXFxcbiknXSxcblx0XHRcdFsnZltcXFxcbi1hXScsICdmW1xcXFxuLWFdJ10sXG5cdFx0XHRbJyg/PD1cXFxcbilcXFxcdycsICcoPzw9XFxcXG4pXFxcXHcnXSxcblx0XHRcdFsnZm9cXFxcbitvJywgJ2ZvKD86XFxcXHI/XFxcXG4pK28nXSxcblx0XHRcdFsnZm9bXlxcXFxuXW8nLCAnZm8oPyFcXFxccj9cXFxcbilvJ10sXG5cdFx0XHRbJ2ZvW15cXFxcbmEtel1vJywgJ2ZvKD8hXFxcXHI/XFxcXG58W2Etel0pbyddLFxuXHRcdFx0Wydmb29bXlxcXFxuXStvJywgJ2Zvby4rbyddLFxuXHRcdFx0Wydmb29bXlxcXFxuenFdK28nLCAnZm9vW156cV0rbyddLFxuXHRcdFx0Wydmb29bXlxcXFxuenFdK28nLCAnZm9vW156cV0rbyddLFxuXHRcdFx0Ly8gcHJlc2VydmVzIHF1YW50aWZpZXMsICMxMzc4OTlcblx0XHRcdFsnZm9bXlxcXFxTXFxcXG5dKm8nLCAnZm9bXlxcXFxTXSpvJ10sXG5cdFx0XHRbJ2ZvW15cXFxcU1xcXFxuXXszLH1vJywgJ2ZvW15cXFxcU117Myx9byddLFxuXHRcdF07XG5cblx0XHRmb3IgKGNvbnN0IFtpbnB1dCwgZXhwZWN0ZWRdIG9mIHR0YWJsZSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpeFJlZ2V4TmV3bGluZShpbnB1dCksIGV4cGVjdGVkLCBgJHtpbnB1dH0gLT4gJHtleHBlY3RlZH1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpeFJlZ2V4TmV3bGluZSAtIHJlJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHRlc3RGaXhSZWdleE5ld2xpbmUoW2lucHV0UmVnLCB0ZXN0U3RyLCBzaG91bGRNYXRjaF06IHJlYWRvbmx5IFtzdHJpbmcsIHN0cmluZywgYm9vbGVhbl0pOiB2b2lkIHtcblx0XHRcdGNvbnN0IGZpeGVkID0gZml4UmVnZXhOZXdsaW5lKGlucHV0UmVnKTtcblx0XHRcdGNvbnN0IHJlZyA9IG5ldyBSZWdFeHAoZml4ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZy50ZXN0KHRlc3RTdHIpLCBzaG91bGRNYXRjaCwgYCR7aW5wdXRSZWd9ID0+ICR7cmVnfSwgJHt0ZXN0U3RyfSwgJHtzaG91bGRNYXRjaH1gKTtcblx0XHR9XG5cblx0XHQoW1xuXHRcdFx0Wydmb28nLCAnZm9vJywgdHJ1ZV0sXG5cblx0XHRcdFsnZm9vXFxcXG4nLCAnZm9vXFxyXFxuJywgdHJ1ZV0sXG5cdFx0XHRbJ2Zvb1xcXFxuXFxcXG4nLCAnZm9vXFxuXFxuJywgdHJ1ZV0sXG5cdFx0XHRbJ2Zvb1xcXFxuXFxcXG4nLCAnZm9vXFxyXFxuXFxyXFxuJywgdHJ1ZV0sXG5cdFx0XHRbJ2Zvb1xcXFxuJywgJ2Zvb1xcbicsIHRydWVdLFxuXHRcdFx0Wydmb29cXFxcbmFiYycsICdmb29cXHJcXG5hYmMnLCB0cnVlXSxcblx0XHRcdFsnZm9vXFxcXG5hYmMnLCAnZm9vXFxuYWJjJywgdHJ1ZV0sXG5cdFx0XHRbJ2Zvb1xcXFxyXFxcXG4nLCAnZm9vXFxyXFxuJywgdHJ1ZV0sXG5cblx0XHRcdFsnZm9vXFxcXG4rYWJjJywgJ2Zvb1xcclxcbmFiYycsIHRydWVdLFxuXHRcdFx0Wydmb29cXFxcbithYmMnLCAnZm9vXFxuXFxuXFxuYWJjJywgdHJ1ZV0sXG5cdFx0XHRbJ2Zvb1xcXFxuK2FiYycsICdmb29cXHJcXG5cXHJcXG5cXHJcXG5hYmMnLCB0cnVlXSxcblx0XHRcdFsnZm9vW1xcXFxuLTldK2FiYycsICdmb28xYWJjJywgdHJ1ZV0sXG5cdFx0XSBhcyBjb25zdCkuZm9yRWFjaCh0ZXN0Rml4UmVnZXhOZXdsaW5lKTtcblx0fSk7XG5cblx0dGVzdCgnZml4TmV3bGluZSAtIG1hdGNoaW5nJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHRlc3RGaXhOZXdsaW5lKFtpbnB1dFJlZywgdGVzdFN0ciwgc2hvdWxkTWF0Y2ggPSB0cnVlXTogcmVhZG9ubHkgW3N0cmluZywgc3RyaW5nLCBib29sZWFuP10pOiB2b2lkIHtcblx0XHRcdGNvbnN0IGZpeGVkID0gZml4TmV3bGluZShpbnB1dFJlZyk7XG5cdFx0XHRjb25zdCByZWcgPSBuZXcgUmVnRXhwKGZpeGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWcudGVzdCh0ZXN0U3RyKSwgc2hvdWxkTWF0Y2gsIGAke2lucHV0UmVnfSA9PiAke3JlZ30sICR7dGVzdFN0cn0sICR7c2hvdWxkTWF0Y2h9YCk7XG5cdFx0fVxuXG5cdFx0KFtcblx0XHRcdFsnZm9vJywgJ2ZvbyddLFxuXG5cdFx0XHRbJ2Zvb1xcbicsICdmb29cXHJcXG4nXSxcblx0XHRcdFsnZm9vXFxuJywgJ2Zvb1xcbiddLFxuXHRcdFx0Wydmb29cXG5hYmMnLCAnZm9vXFxyXFxuYWJjJ10sXG5cdFx0XHRbJ2Zvb1xcbmFiYycsICdmb29cXG5hYmMnXSxcblx0XHRcdFsnZm9vXFxyXFxuJywgJ2Zvb1xcclxcbiddLFxuXG5cdFx0XHRbJ2Zvb1xcbmJhcmMnLCAnZm9vYmFyJywgZmFsc2VdLFxuXHRcdFx0Wydmb29iYXInLCAnZm9vXFxuYmFyJywgZmFsc2VdLFxuXHRcdF0gYXMgY29uc3QpLmZvckVhY2godGVzdEZpeE5ld2xpbmUpO1xuXHR9KTtcblxuXHRzdWl0ZSgnUmlwZ3JlcFBhcnNlcicsICgpID0+IHtcblx0XHRjb25zdCBURVNUX0ZPTERFUiA9IFVSSS5maWxlKCcvZm9vL2JhcicpO1xuXG5cdFx0ZnVuY3Rpb24gdGVzdFBhcnNlcihpbnB1dERhdGE6IHN0cmluZ1tdLCBleHBlY3RlZFJlc3VsdHM6IFRleHRTZWFyY2hSZXN1bHQyW10pOiB2b2lkIHtcblx0XHRcdGNvbnN0IHRlc3RQYXJzZXIgPSBuZXcgUmlwZ3JlcFBhcnNlcigxMDAwLCBURVNUX0ZPTERFUiwgREVGQVVMVF9URVhUX1NFQVJDSF9QUkVWSUVXX09QVElPTlMpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWxSZXN1bHRzOiBUZXh0U2VhcmNoUmVzdWx0MltdID0gW107XG5cdFx0XHR0ZXN0UGFyc2VyLm9uKCdyZXN1bHQnLCByID0+IHtcblx0XHRcdFx0YWN0dWFsUmVzdWx0cy5wdXNoKHIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlucHV0RGF0YS5mb3JFYWNoKGQgPT4gdGVzdFBhcnNlci5oYW5kbGVEYXRhKGQpKTtcblx0XHRcdHRlc3RQYXJzZXIuZmx1c2goKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxSZXN1bHRzLCBleHBlY3RlZFJlc3VsdHMpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIG1ha2VSZ01hdGNoKHJlbGF0aXZlUGF0aDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlciwgbWF0Y2hSYW5nZXM6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfVtdKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSg8SVJnTWVzc2FnZT57XG5cdFx0XHRcdHR5cGU6ICdtYXRjaCcsXG5cdFx0XHRcdGRhdGE6IDxJUmdNYXRjaD57XG5cdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0dGV4dDogcmVsYXRpdmVQYXRoXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsaW5lczoge1xuXHRcdFx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bGluZV9udW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0YWJzb2x1dGVfb2Zmc2V0OiAwLCAvLyB1bnVzZWRcblx0XHRcdFx0XHRzdWJtYXRjaGVzOiBtYXRjaFJhbmdlcy5tYXAobXIgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0Li4ubXIsXG5cdFx0XHRcdFx0XHRcdG1hdGNoOiB7IHRleHQ6IHRleHQuc3Vic3RyaW5nKG1yLnN0YXJ0LCBtci5lbmQpIH1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fVxuXHRcdFx0fSkgKyAnXFxuJztcblx0XHR9XG5cblx0XHR0ZXN0KCdzaW5nbGUgcmVzdWx0JywgKCkgPT4ge1xuXHRcdFx0dGVzdFBhcnNlcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdG1ha2VSZ01hdGNoKCdmaWxlMS5qcycsICdmb29iYXInLCA0LCBbeyBzdGFydDogMywgZW5kOiA2IH1dKVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaDIoXG5cdFx0XHRcdFx0XHRqb2luUGF0aChURVNUX0ZPTERFUiwgJ2ZpbGUxLmpzJyksXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRwcmV2aWV3UmFuZ2U6IG5ldyBSYW5nZSgwLCAzLCAwLCA2KSxcblx0XHRcdFx0XHRcdFx0c291cmNlUmFuZ2U6IG5ldyBSYW5nZSgzLCAzLCAzLCA2KSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0J2Zvb2Jhcidcblx0XHRcdFx0XHQpXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgcmVzdWx0cycsICgpID0+IHtcblx0XHRcdHRlc3RQYXJzZXIoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRtYWtlUmdNYXRjaCgnZmlsZTEuanMnLCAnZm9vYmFyJywgNCwgW3sgc3RhcnQ6IDMsIGVuZDogNiB9XSksXG5cdFx0XHRcdFx0bWFrZVJnTWF0Y2goJ2FwcC9maWxlMi5qcycsICdmb29iYXInLCA0LCBbeyBzdGFydDogMywgZW5kOiA2IH1dKSxcblx0XHRcdFx0XHRtYWtlUmdNYXRjaCgnYXBwMi9maWxlMy5qcycsICdmb29iYXInLCA0LCBbeyBzdGFydDogMywgZW5kOiA2IH1dKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2gyKFxuXHRcdFx0XHRcdFx0am9pblBhdGgoVEVTVF9GT0xERVIsICdmaWxlMS5qcycpLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0cHJldmlld1JhbmdlOiBuZXcgUmFuZ2UoMCwgMywgMCwgNiksXG5cdFx0XHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBuZXcgUmFuZ2UoMywgMywgMywgNiksXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdCdmb29iYXInXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoMihcblx0XHRcdFx0XHRcdGpvaW5QYXRoKFRFU1RfRk9MREVSLCAnYXBwL2ZpbGUyLmpzJyksXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRwcmV2aWV3UmFuZ2U6IG5ldyBSYW5nZSgwLCAzLCAwLCA2KSxcblx0XHRcdFx0XHRcdFx0c291cmNlUmFuZ2U6IG5ldyBSYW5nZSgzLCAzLCAzLCA2KSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0J2Zvb2Jhcidcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2gyKFxuXHRcdFx0XHRcdFx0am9pblBhdGgoVEVTVF9GT0xERVIsICdhcHAyL2ZpbGUzLmpzJyksXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRwcmV2aWV3UmFuZ2U6IG5ldyBSYW5nZSgwLCAzLCAwLCA2KSxcblx0XHRcdFx0XHRcdFx0c291cmNlUmFuZ2U6IG5ldyBSYW5nZSgzLCAzLCAzLCA2KSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0J2Zvb2Jhcidcblx0XHRcdFx0XHQpXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2hvcHBlZC11cCBpbnB1dCBjaHVua3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYXRhU3RycyA9IFtcblx0XHRcdFx0bWFrZVJnTWF0Y2goJ2ZpbGUxLmpzJywgJ2ZvbyBiYXInLCA0LCBbeyBzdGFydDogMywgZW5kOiA3IH1dKSxcblx0XHRcdFx0bWFrZVJnTWF0Y2goJ2FwcC9maWxlMi5qcycsICdmb29iYXInLCA0LCBbeyBzdGFydDogMywgZW5kOiA2IH1dKSxcblx0XHRcdFx0bWFrZVJnTWF0Y2goJ2FwcDIvZmlsZTMuanMnLCAnZm9vYmFyJywgNCwgW3sgc3RhcnQ6IDMsIGVuZDogNiB9XSksXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBkYXRhU3RyMFNwYWNlID0gZGF0YVN0cnNbMF0uaW5kZXhPZignICcpO1xuXHRcdFx0dGVzdFBhcnNlcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGRhdGFTdHJzWzBdLnN1YnN0cmluZygwLCBkYXRhU3RyMFNwYWNlICsgMSksXG5cdFx0XHRcdFx0ZGF0YVN0cnNbMF0uc3Vic3RyaW5nKGRhdGFTdHIwU3BhY2UgKyAxKSxcblx0XHRcdFx0XHQnXFxuJyxcblx0XHRcdFx0XHRkYXRhU3Ryc1sxXS50cmltKCksXG5cdFx0XHRcdFx0J1xcbicgKyBkYXRhU3Ryc1syXS5zdWJzdHJpbmcoMCwgMjUpLFxuXHRcdFx0XHRcdGRhdGFTdHJzWzJdLnN1YnN0cmluZygyNSlcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2gyKFxuXHRcdFx0XHRcdFx0am9pblBhdGgoVEVTVF9GT0xERVIsICdmaWxlMS5qcycpLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0cHJldmlld1JhbmdlOiBuZXcgUmFuZ2UoMCwgMywgMCwgNyksXG5cdFx0XHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBuZXcgUmFuZ2UoMywgMywgMywgNyksXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdCdmb28gYmFyJ1xuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaDIoXG5cdFx0XHRcdFx0XHRqb2luUGF0aChURVNUX0ZPTERFUiwgJ2FwcC9maWxlMi5qcycpLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0cHJldmlld1JhbmdlOiBuZXcgUmFuZ2UoMCwgMywgMCwgNiksXG5cdFx0XHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBuZXcgUmFuZ2UoMywgMywgMywgNiksXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdCdmb29iYXInXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoMihcblx0XHRcdFx0XHRcdGpvaW5QYXRoKFRFU1RfRk9MREVSLCAnYXBwMi9maWxlMy5qcycpLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0cHJldmlld1JhbmdlOiBuZXcgUmFuZ2UoMCwgMywgMCwgNiksXG5cdFx0XHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBuZXcgUmFuZ2UoMywgMywgMywgNiksXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdCdmb29iYXInXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHRdKTtcblx0XHR9KTtcblxuXG5cdFx0dGVzdCgnZW1wdHkgcmVzdWx0ICgjMTAwNTY5KScsICgpID0+IHtcblx0XHRcdHRlc3RQYXJzZXIoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRtYWtlUmdNYXRjaCgnZmlsZTEuanMnLCAnZm9vYmFyJywgNCwgW10pLFxuXHRcdFx0XHRcdG1ha2VSZ01hdGNoKCdmaWxlMS5qcycsICcnLCA1LCBbXSksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoMihcblx0XHRcdFx0XHRcdGpvaW5QYXRoKFRFU1RfRk9MREVSLCAnZmlsZTEuanMnKSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHByZXZpZXdSYW5nZTogbmV3IFJhbmdlKDAsIDAsIDAsIDEpLFxuXHRcdFx0XHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBuZXcgUmFuZ2UoMywgMCwgMywgMSksXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHQnZm9vYmFyJ1xuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaDIoXG5cdFx0XHRcdFx0XHRqb2luUGF0aChURVNUX0ZPTERFUiwgJ2ZpbGUxLmpzJyksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwcmV2aWV3UmFuZ2U6IG5ldyBSYW5nZSgwLCAwLCAwLCAwKSxcblx0XHRcdFx0XHRcdFx0XHRzb3VyY2VSYW5nZTogbmV3IFJhbmdlKDQsIDAsIDQsIDApLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0Jydcblx0XHRcdFx0XHQpXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgc3VibWF0Y2hlcyB3aXRob3V0IG5ld2xpbmUgaW4gYmV0d2VlbiAoIzEzMTUwNyknLCAoKSA9PiB7XG5cdFx0XHR0ZXN0UGFyc2VyKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0bWFrZVJnTWF0Y2goJ2ZpbGUxLmpzJywgJ2Zvb2JhcmJhenF1dXgnLCA0LCBbeyBzdGFydDogMCwgZW5kOiA0IH0sIHsgc3RhcnQ6IDYsIGVuZDogMTAgfV0pLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaDIoXG5cdFx0XHRcdFx0XHRqb2luUGF0aChURVNUX0ZPTERFUiwgJ2ZpbGUxLmpzJyksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwcmV2aWV3UmFuZ2U6IG5ldyBSYW5nZSgwLCAwLCAwLCA0KSxcblx0XHRcdFx0XHRcdFx0XHRzb3VyY2VSYW5nZTogbmV3IFJhbmdlKDMsIDAsIDMsIDQpLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cHJldmlld1JhbmdlOiBuZXcgUmFuZ2UoMCwgNiwgMCwgMTApLFxuXHRcdFx0XHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBuZXcgUmFuZ2UoMywgNiwgMywgMTApLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0J2Zvb2JhcmJhenF1dXgnXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIHN1Ym1hdGNoZXMgd2l0aCBuZXdsaW5lIGluIGJldHdlZW4gKCMxMzE1MDcpJywgKCkgPT4ge1xuXHRcdFx0dGVzdFBhcnNlcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdG1ha2VSZ01hdGNoKCdmaWxlMS5qcycsICdmb29cXG5iYXJcXG5iYXpcXG5xdXV4JywgNCwgW3sgc3RhcnQ6IDAsIGVuZDogNSB9LCB7IHN0YXJ0OiA4LCBlbmQ6IDEzIH1dKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2gyKFxuXHRcdFx0XHRcdFx0am9pblBhdGgoVEVTVF9GT0xERVIsICdmaWxlMS5qcycpLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cHJldmlld1JhbmdlOiBuZXcgUmFuZ2UoMCwgMCwgMSwgMSksXG5cdFx0XHRcdFx0XHRcdFx0c291cmNlUmFuZ2U6IG5ldyBSYW5nZSgzLCAwLCA0LCAxKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHByZXZpZXdSYW5nZTogbmV3IFJhbmdlKDIsIDAsIDMsIDEpLFxuXHRcdFx0XHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBuZXcgUmFuZ2UoNSwgMCwgNiwgMSksXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHQnZm9vXFxuYmFyXFxuYmF6XFxucXV1eCdcblx0XHRcdFx0XHQpXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UmdBcmdzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZSBpbmNsdWRlcycsICgpID0+IHtcblx0XHRcdC8vIE9ubHkgdGVzdGluZyB0aGUgYXJncyB0aGF0IGNvbWUgZnJvbSBpbmNsdWRlcy5cblx0XHRcdGZ1bmN0aW9uIHRlc3RHZXRSZ0FyZ3MoaW5jbHVkZXM6IHN0cmluZ1tdLCBleHBlY3RlZEZyb21JbmNsdWRlczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRcdFx0Y29uc3QgcXVlcnk6IFRleHRTZWFyY2hRdWVyeTIgPSB7XG5cdFx0XHRcdFx0cGF0dGVybjogJ3Rlc3QnXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3Qgb3B0aW9uczogUmlwZ3JlcFRleHRTZWFyY2hPcHRpb25zID0ge1xuXHRcdFx0XHRcdGZvbGRlck9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGluY2x1ZGVzOiBpbmNsdWRlcyxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVzOiBbXSxcblx0XHRcdFx0XHRcdHVzZUlnbm9yZUZpbGVzOiB7XG5cdFx0XHRcdFx0XHRcdGxvY2FsOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0Z2xvYmFsOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0cGFyZW50OiBmYWxzZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGZvbGxvd1N5bWxpbmtzOiBmYWxzZSxcblx0XHRcdFx0XHRcdGZvbGRlcjogVVJJLmZpbGUoJy9zb21lL2ZvbGRlcicpLFxuXHRcdFx0XHRcdFx0ZW5jb2Rpbmc6ICd1dGY4Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1heFJlc3VsdHM6IDEwMDAsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHRcdCctLWhpZGRlbicsXG5cdFx0XHRcdFx0Jy0tbm8tcmVxdWlyZS1naXQnLFxuXHRcdFx0XHRcdCctLWlnbm9yZS1jYXNlJyxcblx0XHRcdFx0XHQuLi5leHBlY3RlZEZyb21JbmNsdWRlcyxcblx0XHRcdFx0XHQnLS1uby1pZ25vcmUnLFxuXHRcdFx0XHRcdCctLWNybGYnLFxuXHRcdFx0XHRcdCctLWZpeGVkLXN0cmluZ3MnLFxuXHRcdFx0XHRcdCctLW5vLWNvbmZpZycsXG5cdFx0XHRcdFx0Jy0tbm8taWdub3JlLWdsb2JhbCcsXG5cdFx0XHRcdFx0Jy0tanNvbicsXG5cdFx0XHRcdFx0Jy0tJyxcblx0XHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdFx0Jy4nXTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmdBcmdzKHF1ZXJ5LCBvcHRpb25zKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIGV4cGVjdGVkKTtcblx0XHRcdH1cblxuXHRcdFx0KFtcblx0XHRcdFx0W1snYS8qJywgJ2IvKiddLCBbJy1nJywgJyEqJywgJy1nJywgJy9hJywgJy1nJywgJy9hLyonLCAnLWcnLCAnL2InLCAnLWcnLCAnL2IvKiddXSxcblx0XHRcdFx0W1snKiovYS8qJywgJ2IvKiddLCBbJy1nJywgJyEqJywgJy1nJywgJy9iJywgJy1nJywgJy9iLyonLCAnLWcnLCAnKiovYS8qJ11dLFxuXHRcdFx0XHRbWycqKi9hLyonLCAnKiovYi8qJ10sIFsnLWcnLCAnKiovYS8qJywgJy1nJywgJyoqL2IvKiddXSxcblx0XHRcdFx0W1snZm9vLypiYXIvc29tZXRoaW5nLyoqJ10sIFsnLWcnLCAnISonLCAnLWcnLCAnL2ZvbycsICctZycsICcvZm9vLypiYXInLCAnLWcnLCAnL2Zvby8qYmFyL3NvbWV0aGluZycsICctZycsICcvZm9vLypiYXIvc29tZXRoaW5nLyoqJ11dLFxuXHRcdFx0XS5mb3JFYWNoKChbaW5jbHVkZXMsIGV4cGVjdGVkRnJvbUluY2x1ZGVzXSkgPT4gdGVzdEdldFJnQXJncyg8c3RyaW5nW10+aW5jbHVkZXMsIDxzdHJpbmdbXT5leHBlY3RlZEZyb21JbmNsdWRlcykpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnJhY2UgZXhwYW5zaW9uIGZvciByaXBncmVwJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHRlc3RCcmFjZUV4cGFuc2lvbihhcmdHbG9iOiBzdHJpbmcsIGV4cGVjdGVkR2xvYjogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBlcmZvcm1CcmFjZUV4cGFuc2lvbkZvclJpcGdyZXAoYXJnR2xvYik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWRHbG9iKTtcblx0XHR9XG5cblx0XHRbXG5cdFx0XHRbJ2VlcC97YSxifS90ZXN0JywgWydlZXAvYS90ZXN0JywgJ2VlcC9iL3Rlc3QnXV0sXG5cdFx0XHRbJ2VlcC97YSxifS97YyxkLGV9JywgWydlZXAvYS9jJywgJ2VlcC9hL2QnLCAnZWVwL2EvZScsICdlZXAvYi9jJywgJ2VlcC9iL2QnLCAnZWVwL2IvZSddXSxcblx0XHRcdFsnZWVwL3thLGJ9L1xcXFx7YyxkLGV9JywgWydlZXAvYS97YyxkLGV9JywgJ2VlcC9iL3tjLGQsZX0nXV0sXG5cdFx0XHRbJ2VlcC97YSxiXFxcXH0vdGVzdCcsIFsnZWVwL3thLGJ9L3Rlc3QnXV0sXG5cdFx0XHRbJ2VlcC97YSxiXFxcXFxcXFx9L3Rlc3QnLCBbJ2VlcC9hL3Rlc3QnLCAnZWVwL2JcXFxcXFxcXC90ZXN0J11dLFxuXHRcdFx0WydlZXAve2EsYlxcXFxcXFxcXFxcXH0vdGVzdCcsIFsnZWVwL3thLGJcXFxcXFxcXH0vdGVzdCddXSxcblx0XHRcdFsnZVxcXFx7ZXAve2EsYn0vdGVzdCcsIFsnZXtlcC9hL3Rlc3QnLCAnZXtlcC9iL3Rlc3QnXV0sXG5cdFx0XHRbJ2VlcC97YSxcXFxcYn0vdGVzdCcsIFsnZWVwL2EvdGVzdCcsICdlZXAvXFxcXGIvdGVzdCddXSxcblx0XHRcdFsne2EvKi4qLGIvKi4qfScsIFsnYS8qLionLCAnYi8qLionXV0sXG5cdFx0XHRbJ3t7fScsIFsne3t9J11dLFxuXHRcdFx0WydhYXt7fScsIFsnYWF7e30nXV0sXG5cdFx0XHRbJ3tie30nLCBbJ3tie30nXV0sXG5cdFx0XHRbJ3t7fWMnLCBbJ3t7fWMnXV0sXG5cdFx0XHRbJ3t7fX0nLCBbJ3t7fX0nXV0sXG5cdFx0XHRbJ1xcXFx7e319JywgWyd7fSddXSxcblx0XHRcdFsne31mb28nLCBbJ2ZvbyddXSxcblx0XHRcdFsnYmFyeyB9Zm9vJywgWydiYXIgZm9vJ11dLFxuXHRcdFx0Wyd7fScsIFsnJ11dLFxuXHRcdF0uZm9yRWFjaCgoW2luY2x1ZGVQYXR0ZXJuLCBleHBlY3RlZFBhdHRlcm5zXSkgPT4gdGVzdEJyYWNlRXhwYW5zaW9uKDxzdHJpbmc+aW5jbHVkZVBhdHRlcm4sIDxzdHJpbmdbXT5leHBlY3RlZFBhdHRlcm5zKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsaUJBQXVDLGVBQWUsdUJBQXVCLFlBQVksV0FBVyx1Q0FBdUM7QUFDcEosU0FBUyxPQUFPLHdCQUE2RDtBQUM3RSxTQUFTLCtDQUErQztBQUV4RCxTQUFTLDJDQUEyQztBQUVwRCxNQUFNLDJCQUEyQixNQUFNO0FBQ3RDLDBDQUF3QztBQUN4QyxPQUFLLHlCQUF5QixZQUFZO0FBQ3pDLFdBQU8sWUFBWSxzQkFBc0IsU0FBUyxHQUFHLFdBQVc7QUFDaEUsV0FBTyxZQUFZLHNCQUFzQixnQkFBZ0IsR0FBRyxvQkFBb0I7QUFDaEYsV0FBTyxZQUFZLHNCQUFzQixlQUFlLEdBQUcsaUJBQWlCO0FBQzVFLFdBQU8sWUFBWSxzQkFBc0IsYUFBYSxHQUFHLGVBQWU7QUFDeEUsV0FBTyxZQUFZLHNCQUFzQixnQkFBZ0IsR0FBRyxrQkFBa0I7QUFFOUUsV0FBTyxZQUFZLHNCQUFzQixXQUFXLEdBQUcsV0FBVztBQUNsRSxXQUFPLFlBQVksc0JBQXNCLG9CQUFvQixHQUFHLG9CQUFvQjtBQUNwRixXQUFPLFlBQVksc0JBQXNCLGlCQUFpQixHQUFHLGlCQUFpQjtBQUM5RSxXQUFPLFlBQVksc0JBQXNCLG1CQUFtQixHQUFHLHVCQUF1QjtBQUV0RixXQUFPLFlBQVksc0JBQXNCLG9CQUFvQixHQUFHLG9CQUFvQjtBQUNwRixXQUFPLFlBQVksc0JBQXNCLFFBQVEsR0FBRyxRQUFRO0FBQzVELFdBQU8sWUFBWSxzQkFBc0IsS0FBSyxHQUFHLEtBQUs7QUFDdEQsV0FBTyxZQUFZLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtBQUFBLEVBQ2pELENBQUM7QUFFRCxPQUFLLHlCQUF5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QUEsUUFDdkQsQ0FBQyxDQUFDLHVCQUF1QixHQUFHLENBQUMsTUFBTSxNQUFNLE1BQU0sUUFBUSxNQUFNLGFBQWEsTUFBTSx1QkFBdUIsTUFBTSx3QkFBd0IsQ0FBQztBQUFBLE1BQ3ZJLEVBQUUsUUFBUSxDQUFDLENBQUMsVUFBVSxvQkFBb0IsTUFBTSxjQUF3QixVQUFvQixvQkFBb0IsQ0FBQztBQUFBLElBQ2xILENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtCQUErQixNQUFNO0FBQ3pDLGFBQVMsbUJBQW1CLFNBQWlCLGNBQThCO0FBQzFFLFlBQU0sU0FBUyxnQ0FBZ0MsT0FBTztBQUN0RCxhQUFPLGdCQUFnQixRQUFRLFlBQVk7QUFBQSxJQUM1QztBQUVBO0FBQUEsTUFDQyxDQUFDLGtCQUFrQixDQUFDLGNBQWMsWUFBWSxDQUFDO0FBQUEsTUFDL0MsQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLFdBQVcsV0FBVyxXQUFXLFdBQVcsU0FBUyxDQUFDO0FBQUEsTUFDeEYsQ0FBQyx1QkFBdUIsQ0FBQyxpQkFBaUIsZUFBZSxDQUFDO0FBQUEsTUFDMUQsQ0FBQyxvQkFBb0IsQ0FBQyxnQkFBZ0IsQ0FBQztBQUFBLE1BQ3ZDLENBQUMsc0JBQXNCLENBQUMsY0FBYyxnQkFBZ0IsQ0FBQztBQUFBLE1BQ3ZELENBQUMsd0JBQXdCLENBQUMsb0JBQW9CLENBQUM7QUFBQSxNQUMvQyxDQUFDLHFCQUFxQixDQUFDLGVBQWUsYUFBYSxDQUFDO0FBQUEsTUFDcEQsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLGNBQWMsQ0FBQztBQUFBLE1BQ25ELENBQUMsaUJBQWlCLENBQUMsU0FBUyxPQUFPLENBQUM7QUFBQSxNQUNwQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7QUFBQSxNQUNmLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztBQUFBLE1BQ25CLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztBQUFBLE1BQ2pCLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztBQUFBLE1BQ2pCLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztBQUFBLE1BQ2pCLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQztBQUFBLE1BQ2pCLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztBQUFBLE1BQ2pCLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQztBQUFBLE1BQ3pCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ1osRUFBRSxRQUFRLENBQUMsQ0FBQyxnQkFBZ0IsZ0JBQWdCLE1BQU0sbUJBQTJCLGdCQUEwQixnQkFBZ0IsQ0FBQztBQUFBLEVBQ3pILENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJ0ZXN0UGFyc2VyIl0KfQo=
