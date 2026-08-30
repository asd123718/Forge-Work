import { deepStrictEqual, ok, strictEqual } from "assert";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { detectLinks, detectLinkSuffixes, getLinkSuffix, removeLinkQueryString, removeLinkSuffix } from "../../browser/terminalLinkParsing.js";
const operatingSystems = [
  OperatingSystem.Linux,
  OperatingSystem.Macintosh,
  OperatingSystem.Windows
];
const osTestPath = {
  [OperatingSystem.Linux]: "/test/path/linux",
  [OperatingSystem.Macintosh]: "/test/path/macintosh",
  [OperatingSystem.Windows]: "C:\\test\\path\\windows"
};
const osLabel = {
  [OperatingSystem.Linux]: "[Linux]",
  [OperatingSystem.Macintosh]: "[macOS]",
  [OperatingSystem.Windows]: "[Windows]"
};
const testRow = 339;
const testCol = 12;
const testRowEnd = 341;
const testColEnd = 789;
const testLinks = [
  // Simple
  { link: "foo", prefix: void 0, suffix: void 0, hasRow: false, hasCol: false },
  { link: "foo:339", prefix: void 0, suffix: ":339", hasRow: true, hasCol: false },
  { link: "foo:339:12", prefix: void 0, suffix: ":339:12", hasRow: true, hasCol: true },
  { link: "foo:339:12-789", prefix: void 0, suffix: ":339:12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo:339.12", prefix: void 0, suffix: ":339.12", hasRow: true, hasCol: true },
  { link: "foo:339.12-789", prefix: void 0, suffix: ":339.12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo:339.12-341.789", prefix: void 0, suffix: ":339.12-341.789", hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
  { link: "foo#339", prefix: void 0, suffix: "#339", hasRow: true, hasCol: false },
  { link: "foo#339:12", prefix: void 0, suffix: "#339:12", hasRow: true, hasCol: true },
  { link: "foo#339:12-789", prefix: void 0, suffix: "#339:12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo#339.12", prefix: void 0, suffix: "#339.12", hasRow: true, hasCol: true },
  { link: "foo#339.12-789", prefix: void 0, suffix: "#339.12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo#339.12-341.789", prefix: void 0, suffix: "#339.12-341.789", hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
  { link: "foo 339", prefix: void 0, suffix: " 339", hasRow: true, hasCol: false },
  { link: "foo 339:12", prefix: void 0, suffix: " 339:12", hasRow: true, hasCol: true },
  { link: "foo 339:12-789", prefix: void 0, suffix: " 339:12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo 339.12", prefix: void 0, suffix: " 339.12", hasRow: true, hasCol: true },
  { link: "foo 339.12-789", prefix: void 0, suffix: " 339.12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo 339.12-341.789", prefix: void 0, suffix: " 339.12-341.789", hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
  { link: "foo, 339", prefix: void 0, suffix: ", 339", hasRow: true, hasCol: false },
  // Double quotes
  { link: '"foo",339', prefix: '"', suffix: '",339', hasRow: true, hasCol: false },
  { link: '"foo",339:12', prefix: '"', suffix: '",339:12', hasRow: true, hasCol: true },
  { link: '"foo",339.12', prefix: '"', suffix: '",339.12', hasRow: true, hasCol: true },
  { link: '"foo", line 339', prefix: '"', suffix: '", line 339', hasRow: true, hasCol: false },
  { link: '"foo", line 339, col 12', prefix: '"', suffix: '", line 339, col 12', hasRow: true, hasCol: true },
  { link: '"foo", line 339, column 12', prefix: '"', suffix: '", line 339, column 12', hasRow: true, hasCol: true },
  { link: '"foo":line 339', prefix: '"', suffix: '":line 339', hasRow: true, hasCol: false },
  { link: '"foo":line 339, col 12', prefix: '"', suffix: '":line 339, col 12', hasRow: true, hasCol: true },
  { link: '"foo":line 339, column 12', prefix: '"', suffix: '":line 339, column 12', hasRow: true, hasCol: true },
  { link: '"foo": line 339', prefix: '"', suffix: '": line 339', hasRow: true, hasCol: false },
  { link: '"foo": line 339, col 12', prefix: '"', suffix: '": line 339, col 12', hasRow: true, hasCol: true },
  { link: '"foo": line 339, column 12', prefix: '"', suffix: '": line 339, column 12', hasRow: true, hasCol: true },
  { link: '"foo" on line 339', prefix: '"', suffix: '" on line 339', hasRow: true, hasCol: false },
  { link: '"foo" on line 339, col 12', prefix: '"', suffix: '" on line 339, col 12', hasRow: true, hasCol: true },
  { link: '"foo" on line 339, column 12', prefix: '"', suffix: '" on line 339, column 12', hasRow: true, hasCol: true },
  { link: '"foo" line 339', prefix: '"', suffix: '" line 339', hasRow: true, hasCol: false },
  { link: '"foo" line 339 column 12', prefix: '"', suffix: '" line 339 column 12', hasRow: true, hasCol: true },
  // Single quotes
  { link: "'foo',339", prefix: "'", suffix: "',339", hasRow: true, hasCol: false },
  { link: "'foo',339:12", prefix: "'", suffix: "',339:12", hasRow: true, hasCol: true },
  { link: "'foo',339.12", prefix: "'", suffix: "',339.12", hasRow: true, hasCol: true },
  { link: "'foo', line 339", prefix: "'", suffix: "', line 339", hasRow: true, hasCol: false },
  { link: "'foo', line 339, col 12", prefix: "'", suffix: "', line 339, col 12", hasRow: true, hasCol: true },
  { link: "'foo', line 339, column 12", prefix: "'", suffix: "', line 339, column 12", hasRow: true, hasCol: true },
  { link: "'foo':line 339", prefix: "'", suffix: "':line 339", hasRow: true, hasCol: false },
  { link: "'foo':line 339, col 12", prefix: "'", suffix: "':line 339, col 12", hasRow: true, hasCol: true },
  { link: "'foo':line 339, column 12", prefix: "'", suffix: "':line 339, column 12", hasRow: true, hasCol: true },
  { link: "'foo': line 339", prefix: "'", suffix: "': line 339", hasRow: true, hasCol: false },
  { link: "'foo': line 339, col 12", prefix: "'", suffix: "': line 339, col 12", hasRow: true, hasCol: true },
  { link: "'foo': line 339, column 12", prefix: "'", suffix: "': line 339, column 12", hasRow: true, hasCol: true },
  { link: "'foo' on line 339", prefix: "'", suffix: "' on line 339", hasRow: true, hasCol: false },
  { link: "'foo' on line 339, col 12", prefix: "'", suffix: "' on line 339, col 12", hasRow: true, hasCol: true },
  { link: "'foo' on line 339, column 12", prefix: "'", suffix: "' on line 339, column 12", hasRow: true, hasCol: true },
  { link: "'foo' line 339", prefix: "'", suffix: "' line 339", hasRow: true, hasCol: false },
  { link: "'foo' line 339 column 12", prefix: "'", suffix: "' line 339 column 12", hasRow: true, hasCol: true },
  // No quotes
  { link: "foo, line 339", prefix: void 0, suffix: ", line 339", hasRow: true, hasCol: false },
  { link: "foo, line 339, col 12", prefix: void 0, suffix: ", line 339, col 12", hasRow: true, hasCol: true },
  { link: "foo, line 339, column 12", prefix: void 0, suffix: ", line 339, column 12", hasRow: true, hasCol: true },
  { link: "foo:line 339", prefix: void 0, suffix: ":line 339", hasRow: true, hasCol: false },
  { link: "foo:line 339, col 12", prefix: void 0, suffix: ":line 339, col 12", hasRow: true, hasCol: true },
  { link: "foo:line 339, column 12", prefix: void 0, suffix: ":line 339, column 12", hasRow: true, hasCol: true },
  { link: "foo: line 339", prefix: void 0, suffix: ": line 339", hasRow: true, hasCol: false },
  { link: "foo: line 339, col 12", prefix: void 0, suffix: ": line 339, col 12", hasRow: true, hasCol: true },
  { link: "foo: line 339, column 12", prefix: void 0, suffix: ": line 339, column 12", hasRow: true, hasCol: true },
  { link: "foo on line 339", prefix: void 0, suffix: " on line 339", hasRow: true, hasCol: false },
  { link: "foo on line 339, col 12", prefix: void 0, suffix: " on line 339, col 12", hasRow: true, hasCol: true },
  { link: "foo on line 339, column 12", prefix: void 0, suffix: " on line 339, column 12", hasRow: true, hasCol: true },
  { link: "foo line 339", prefix: void 0, suffix: " line 339", hasRow: true, hasCol: false },
  { link: "foo line 339 column 12", prefix: void 0, suffix: " line 339 column 12", hasRow: true, hasCol: true },
  // Parentheses
  { link: "foo(339)", prefix: void 0, suffix: "(339)", hasRow: true, hasCol: false },
  { link: "foo(339,12)", prefix: void 0, suffix: "(339,12)", hasRow: true, hasCol: true },
  { link: "foo(339, 12)", prefix: void 0, suffix: "(339, 12)", hasRow: true, hasCol: true },
  { link: "foo (339)", prefix: void 0, suffix: " (339)", hasRow: true, hasCol: false },
  { link: "foo (339,12)", prefix: void 0, suffix: " (339,12)", hasRow: true, hasCol: true },
  { link: "foo (339, 12)", prefix: void 0, suffix: " (339, 12)", hasRow: true, hasCol: true },
  { link: "foo: (339)", prefix: void 0, suffix: ": (339)", hasRow: true, hasCol: false },
  { link: "foo: (339,12)", prefix: void 0, suffix: ": (339,12)", hasRow: true, hasCol: true },
  { link: "foo: (339, 12)", prefix: void 0, suffix: ": (339, 12)", hasRow: true, hasCol: true },
  { link: "foo(339:12)", prefix: void 0, suffix: "(339:12)", hasRow: true, hasCol: true },
  { link: "foo (339:12)", prefix: void 0, suffix: " (339:12)", hasRow: true, hasCol: true },
  // Square brackets
  { link: "foo[339]", prefix: void 0, suffix: "[339]", hasRow: true, hasCol: false },
  { link: "foo[339,12]", prefix: void 0, suffix: "[339,12]", hasRow: true, hasCol: true },
  { link: "foo[339, 12]", prefix: void 0, suffix: "[339, 12]", hasRow: true, hasCol: true },
  { link: "foo [339]", prefix: void 0, suffix: " [339]", hasRow: true, hasCol: false },
  { link: "foo [339,12]", prefix: void 0, suffix: " [339,12]", hasRow: true, hasCol: true },
  { link: "foo [339, 12]", prefix: void 0, suffix: " [339, 12]", hasRow: true, hasCol: true },
  { link: "foo: [339]", prefix: void 0, suffix: ": [339]", hasRow: true, hasCol: false },
  { link: "foo: [339,12]", prefix: void 0, suffix: ": [339,12]", hasRow: true, hasCol: true },
  { link: "foo: [339, 12]", prefix: void 0, suffix: ": [339, 12]", hasRow: true, hasCol: true },
  { link: "foo[339:12]", prefix: void 0, suffix: "[339:12]", hasRow: true, hasCol: true },
  { link: "foo [339:12]", prefix: void 0, suffix: " [339:12]", hasRow: true, hasCol: true },
  // OCaml-style
  { link: '"foo", line 339, character 12', prefix: '"', suffix: '", line 339, character 12', hasRow: true, hasCol: true },
  { link: '"foo", line 339, characters 12-789', prefix: '"', suffix: '", line 339, characters 12-789', hasRow: true, hasCol: true, hasColEnd: true },
  { link: '"foo", lines 339-341', prefix: '"', suffix: '", lines 339-341', hasRow: true, hasCol: false, hasRowEnd: true },
  { link: '"foo", lines 339-341, characters 12-789', prefix: '"', suffix: '", lines 339-341, characters 12-789', hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
  // Non-breaking space
  { link: "foo\xA0339:12", prefix: void 0, suffix: "\xA0339:12", hasRow: true, hasCol: true },
  { link: '"foo" on line 339,\xA0column 12', prefix: '"', suffix: '" on line 339,\xA0column 12', hasRow: true, hasCol: true },
  { link: "'foo' on line\xA0339, column 12", prefix: "'", suffix: "' on line\xA0339, column 12", hasRow: true, hasCol: true },
  { link: "foo (339,\xA012)", prefix: void 0, suffix: " (339,\xA012)", hasRow: true, hasCol: true },
  { link: "foo\xA0[339, 12]", prefix: void 0, suffix: "\xA0[339, 12]", hasRow: true, hasCol: true }
];
const testLinksWithSuffix = testLinks.filter((e) => !!e.suffix);
suite("TerminalLinkParsing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("removeLinkSuffix", () => {
    for (const testLink of testLinks) {
      test("`" + testLink.link + "`", () => {
        deepStrictEqual(
          removeLinkSuffix(testLink.link),
          testLink.suffix === void 0 ? testLink.link : testLink.link.replace(testLink.suffix, "")
        );
      });
    }
  });
  suite("getLinkSuffix", () => {
    for (const testLink of testLinks) {
      test("`" + testLink.link + "`", () => {
        deepStrictEqual(
          getLinkSuffix(testLink.link),
          testLink.suffix === void 0 ? null : {
            row: testLink.hasRow ? testRow : void 0,
            col: testLink.hasCol ? testCol : void 0,
            rowEnd: testLink.hasRowEnd ? testRowEnd : void 0,
            colEnd: testLink.hasColEnd ? testColEnd : void 0,
            suffix: {
              index: testLink.link.length - testLink.suffix.length,
              text: testLink.suffix
            }
          }
        );
      });
    }
  });
  suite("detectLinkSuffixes", () => {
    for (const testLink of testLinks) {
      test("`" + testLink.link + "`", () => {
        deepStrictEqual(
          detectLinkSuffixes(testLink.link),
          testLink.suffix === void 0 ? [] : [{
            row: testLink.hasRow ? testRow : void 0,
            col: testLink.hasCol ? testCol : void 0,
            rowEnd: testLink.hasRowEnd ? testRowEnd : void 0,
            colEnd: testLink.hasColEnd ? testColEnd : void 0,
            suffix: {
              index: testLink.link.length - testLink.suffix.length,
              text: testLink.suffix
            }
          }]
        );
      });
    }
    test("foo(1, 2) bar[3, 4] baz on line 5", () => {
      deepStrictEqual(
        detectLinkSuffixes("foo(1, 2) bar[3, 4] baz on line 5"),
        [
          {
            col: 2,
            row: 1,
            rowEnd: void 0,
            colEnd: void 0,
            suffix: {
              index: 3,
              text: "(1, 2)"
            }
          },
          {
            col: 4,
            row: 3,
            rowEnd: void 0,
            colEnd: void 0,
            suffix: {
              index: 13,
              text: "[3, 4]"
            }
          },
          {
            col: void 0,
            row: 5,
            rowEnd: void 0,
            colEnd: void 0,
            suffix: {
              index: 23,
              text: " on line 5"
            }
          }
        ]
      );
    });
  });
  suite("removeLinkQueryString", () => {
    test("should remove any query string from the link", () => {
      strictEqual(removeLinkQueryString("?a=b"), "");
      strictEqual(removeLinkQueryString("foo?a=b"), "foo");
      strictEqual(removeLinkQueryString("./foo?a=b"), "./foo");
      strictEqual(removeLinkQueryString("/foo/bar?a=b"), "/foo/bar");
      strictEqual(removeLinkQueryString("foo?a=b?"), "foo");
      strictEqual(removeLinkQueryString("foo?a=b&c=d"), "foo");
    });
    test("should respect ? in UNC paths", () => {
      strictEqual(removeLinkQueryString("\\\\?\\foo?a=b"), "\\\\?\\foo");
    });
  });
  suite("detectLinks", () => {
    test('foo(1, 2) bar[3, 4] "baz" on line 5', () => {
      deepStrictEqual(
        detectLinks('foo(1, 2) bar[3, 4] "baz" on line 5', OperatingSystem.Linux),
        [
          {
            path: {
              index: 0,
              text: "foo"
            },
            prefix: void 0,
            suffix: {
              col: 2,
              row: 1,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 3,
                text: "(1, 2)"
              }
            }
          },
          {
            path: {
              index: 10,
              text: "bar"
            },
            prefix: void 0,
            suffix: {
              col: 4,
              row: 3,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 13,
                text: "[3, 4]"
              }
            }
          },
          {
            path: {
              index: 21,
              text: "baz"
            },
            prefix: {
              index: 20,
              text: '"'
            },
            suffix: {
              col: void 0,
              row: 5,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 24,
                text: '" on line 5'
              }
            }
          }
        ]
      );
    });
    test("should detect multiple links when opening brackets are in the text", () => {
      deepStrictEqual(
        detectLinks("notlink[foo:45]", OperatingSystem.Linux),
        [
          {
            path: {
              index: 0,
              text: "notlink[foo"
            },
            prefix: void 0,
            suffix: {
              col: void 0,
              row: 45,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 11,
                text: ":45"
              }
            }
          },
          {
            path: {
              index: 8,
              text: "foo"
            },
            prefix: void 0,
            suffix: {
              col: void 0,
              row: 45,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 11,
                text: ":45"
              }
            }
          }
        ]
      );
    });
    test("should extract the link prefix", () => {
      deepStrictEqual(
        detectLinks('"foo", line 5, col 6', OperatingSystem.Linux),
        [
          {
            path: {
              index: 1,
              text: "foo"
            },
            prefix: {
              index: 0,
              text: '"'
            },
            suffix: {
              row: 5,
              col: 6,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 4,
                text: '", line 5, col 6'
              }
            }
          }
        ]
      );
    });
    test("should be smart about determining the link prefix when multiple prefix characters exist", () => {
      deepStrictEqual(
        detectLinks(`echo '"foo", line 5, col 6'`, OperatingSystem.Linux),
        [
          {
            path: {
              index: 7,
              text: "foo"
            },
            prefix: {
              index: 6,
              text: '"'
            },
            suffix: {
              row: 5,
              col: 6,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 10,
                text: '", line 5, col 6'
              }
            }
          }
        ],
        "The outer single quotes should be excluded from the link prefix and suffix"
      );
    });
    test("should detect both suffix and non-suffix links on a single line", () => {
      deepStrictEqual(
        detectLinks(`PS C:\\Github\\microsoft\\vscode> echo '"foo", line 5, col 6'`, OperatingSystem.Windows),
        [
          {
            path: {
              index: 3,
              text: "C:\\Github\\microsoft\\vscode"
            },
            prefix: void 0,
            suffix: void 0
          },
          {
            path: {
              index: 38,
              text: "foo"
            },
            prefix: {
              index: 37,
              text: '"'
            },
            suffix: {
              row: 5,
              col: 6,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 41,
                text: '", line 5, col 6'
              }
            }
          }
        ]
      );
    });
    suite('"|"', () => {
      test("should exclude pipe characters from link paths", () => {
        deepStrictEqual(
          detectLinks("|C:\\Github\\microsoft\\vscode|", OperatingSystem.Windows),
          [
            {
              path: {
                index: 1,
                text: "C:\\Github\\microsoft\\vscode"
              },
              prefix: void 0,
              suffix: void 0
            }
          ]
        );
      });
      test("should exclude pipe characters from link paths with suffixes", () => {
        deepStrictEqual(
          detectLinks("|C:\\Github\\microsoft\\vscode:400|", OperatingSystem.Windows),
          [
            {
              path: {
                index: 1,
                text: "C:\\Github\\microsoft\\vscode"
              },
              prefix: void 0,
              suffix: {
                col: void 0,
                row: 400,
                rowEnd: void 0,
                colEnd: void 0,
                suffix: {
                  index: 27,
                  text: ":400"
                }
              }
            }
          ]
        );
      });
    });
    suite('"<>"', () => {
      for (const os of operatingSystems) {
        test(`should exclude bracket characters from link paths ${osLabel[os]}`, () => {
          deepStrictEqual(
            detectLinks(`<${osTestPath[os]}<`, os),
            [
              {
                path: {
                  index: 1,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
          deepStrictEqual(
            detectLinks(`>${osTestPath[os]}>`, os),
            [
              {
                path: {
                  index: 1,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
        test(`should exclude bracket characters from link paths with suffixes ${osLabel[os]}`, () => {
          deepStrictEqual(
            detectLinks(`<${osTestPath[os]}:400<`, os),
            [
              {
                path: {
                  index: 1,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: {
                  col: void 0,
                  row: 400,
                  rowEnd: void 0,
                  colEnd: void 0,
                  suffix: {
                    index: 1 + osTestPath[os].length,
                    text: ":400"
                  }
                }
              }
            ]
          );
          deepStrictEqual(
            detectLinks(`>${osTestPath[os]}:400>`, os),
            [
              {
                path: {
                  index: 1,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: {
                  col: void 0,
                  row: 400,
                  rowEnd: void 0,
                  colEnd: void 0,
                  suffix: {
                    index: 1 + osTestPath[os].length,
                    text: ":400"
                  }
                }
              }
            ]
          );
        });
      }
    });
    suite("query strings", () => {
      for (const os of operatingSystems) {
        test(`should exclude query strings from link paths ${osLabel[os]}`, () => {
          deepStrictEqual(
            detectLinks(`${osTestPath[os]}?a=b`, os),
            [
              {
                path: {
                  index: 0,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
          deepStrictEqual(
            detectLinks(`${osTestPath[os]}?a=b&c=d`, os),
            [
              {
                path: {
                  index: 0,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
        test("should not detect links starting with ? within query strings that contain posix-style paths (#204195)", () => {
          strictEqual(detectLinks(`http://foo.com/?bar=/a/b&baz=c`, os).some((e) => e.path.text.startsWith("?")), false);
        });
        test("should not detect links starting with ? within query strings that contain Windows-style paths (#204195)", () => {
          strictEqual(detectLinks(`http://foo.com/?bar=a:\\b&baz=c`, os).some((e) => e.path.text.startsWith("?")), false);
        });
      }
    });
    suite("should detect file names in git diffs", () => {
      test("--- a/foo/bar", () => {
        ["a", "c", "w", "i", "o"].forEach((prefix) => {
          deepStrictEqual(
            detectLinks(`--- ${prefix}/foo/bar`, OperatingSystem.Linux),
            [
              {
                path: {
                  index: 6,
                  text: "foo/bar"
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
      });
      test("+++ b/foo/bar", () => {
        ["b", "c", "w", "i", "o"].forEach((prefix) => {
          deepStrictEqual(
            detectLinks(`+++ ${prefix}/foo/bar`, OperatingSystem.Linux),
            [
              {
                path: {
                  index: 6,
                  text: "foo/bar"
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
      });
      test("diff --git a/foo/bar b/foo/baz", () => {
        [["a", "b"], ["c", "w"], ["i", "o"]].forEach(([sourcePrefix, destinationPrefix]) => {
          deepStrictEqual(
            detectLinks(`diff --git ${sourcePrefix}/foo/bar ${destinationPrefix}/foo/baz`, OperatingSystem.Linux),
            [
              {
                path: {
                  index: 13,
                  text: "foo/bar"
                },
                prefix: void 0,
                suffix: void 0
              },
              {
                path: {
                  index: 23,
                  text: "foo/baz"
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
      });
      test("numeric prefixes used by git diff --no-index", () => {
        deepStrictEqual(
          [
            detectLinks("--- 1/foo/bar", OperatingSystem.Linux),
            detectLinks("+++ 2/foo/baz", OperatingSystem.Linux),
            detectLinks("diff --git 1/foo/bar 2/foo/baz", OperatingSystem.Linux)
          ],
          [
            [{
              path: { index: 6, text: "foo/bar" },
              prefix: void 0,
              suffix: void 0
            }],
            [{
              path: { index: 6, text: "foo/baz" },
              prefix: void 0,
              suffix: void 0
            }],
            [{
              path: { index: 13, text: "foo/bar" },
              prefix: void 0,
              suffix: void 0
            }, {
              path: { index: 23, text: "foo/baz" },
              prefix: void 0,
              suffix: void 0
            }]
          ]
        );
      });
      test("reversed numeric prefixes used by git diff --no-index -R", () => {
        deepStrictEqual(
          [
            detectLinks("--- 2/foo/baz", OperatingSystem.Linux),
            detectLinks("+++ 1/foo/bar", OperatingSystem.Linux),
            detectLinks("diff --git 2/foo/baz 1/foo/bar", OperatingSystem.Linux)
          ],
          [
            [{
              path: { index: 6, text: "foo/baz" },
              prefix: void 0,
              suffix: void 0
            }],
            [{
              path: { index: 6, text: "foo/bar" },
              prefix: void 0,
              suffix: void 0
            }],
            [{
              path: { index: 13, text: "foo/baz" },
              prefix: void 0,
              suffix: void 0
            }, {
              path: { index: 23, text: "foo/bar" },
              prefix: void 0,
              suffix: void 0
            }]
          ]
        );
      });
      test("ordinary numeric line suffix", () => {
        deepStrictEqual(
          detectLinks("foo 1", OperatingSystem.Linux),
          [{
            path: { index: 0, text: "foo" },
            prefix: void 0,
            suffix: {
              row: 1,
              col: void 0,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: { index: 3, text: " 1" }
            }
          }]
        );
      });
      test("numeric suffix followed by a path separator", () => {
        deepStrictEqual(
          detectLinks("foo 1/bar", OperatingSystem.Linux),
          [{
            path: { index: 4, text: "1/bar" },
            prefix: void 0,
            suffix: void 0
          }]
        );
      });
      test("ordinary numeric line suffix after diff --git text", () => {
        deepStrictEqual(
          detectLinks("diff --git foo.ts:123", OperatingSystem.Linux),
          [{
            path: { index: 11, text: "foo.ts" },
            prefix: void 0,
            suffix: {
              row: 123,
              col: void 0,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: { index: 17, text: ":123" }
            }
          }]
        );
      });
    });
    suite("should detect 3 suffix links on a single line", () => {
      for (let i = 0; i < testLinksWithSuffix.length - 2; i++) {
        const link1 = testLinksWithSuffix[i];
        const link2 = testLinksWithSuffix[i + 1];
        const link3 = testLinksWithSuffix[i + 2];
        const line = ` ${link1.link} ${link2.link} ${link3.link} `;
        test("`" + line.replaceAll("\xA0", "<nbsp>") + "`", () => {
          strictEqual(detectLinks(line, OperatingSystem.Linux).length, 3);
          ok(link1.suffix);
          ok(link2.suffix);
          ok(link3.suffix);
          const detectedLink1 = {
            prefix: link1.prefix ? {
              index: 1,
              text: link1.prefix
            } : void 0,
            path: {
              index: 1 + (link1.prefix?.length ?? 0),
              text: link1.link.replace(link1.suffix, "").replace(link1.prefix || "", "")
            },
            suffix: {
              row: link1.hasRow ? testRow : void 0,
              col: link1.hasCol ? testCol : void 0,
              rowEnd: link1.hasRowEnd ? testRowEnd : void 0,
              colEnd: link1.hasColEnd ? testColEnd : void 0,
              suffix: {
                index: 1 + (link1.link.length - link1.suffix.length),
                text: link1.suffix
              }
            }
          };
          const detectedLink2 = {
            prefix: link2.prefix ? {
              index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1,
              text: link2.prefix
            } : void 0,
            path: {
              index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1 + (link2.prefix ?? "").length,
              text: link2.link.replace(link2.suffix, "").replace(link2.prefix ?? "", "")
            },
            suffix: {
              row: link2.hasRow ? testRow : void 0,
              col: link2.hasCol ? testCol : void 0,
              rowEnd: link2.hasRowEnd ? testRowEnd : void 0,
              colEnd: link2.hasColEnd ? testColEnd : void 0,
              suffix: {
                index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1 + (link2.link.length - link2.suffix.length),
                text: link2.suffix
              }
            }
          };
          const detectedLink3 = {
            prefix: link3.prefix ? {
              index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1,
              text: link3.prefix
            } : void 0,
            path: {
              index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1 + (link3.prefix ?? "").length,
              text: link3.link.replace(link3.suffix, "").replace(link3.prefix ?? "", "")
            },
            suffix: {
              row: link3.hasRow ? testRow : void 0,
              col: link3.hasCol ? testCol : void 0,
              rowEnd: link3.hasRowEnd ? testRowEnd : void 0,
              colEnd: link3.hasColEnd ? testColEnd : void 0,
              suffix: {
                index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1 + (link3.link.length - link3.suffix.length),
                text: link3.suffix
              }
            }
          };
          deepStrictEqual(
            detectLinks(line, OperatingSystem.Linux),
            [detectedLink1, detectedLink2, detectedLink3]
          );
        });
      }
    });
    suite("should ignore links with suffixes when the path itself is the empty string", () => {
      deepStrictEqual(
        detectLinks('""",1', OperatingSystem.Linux),
        []
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXHRlc3RcXGJyb3dzZXJcXHRlcm1pbmFsTGlua1BhcnNpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZGV0ZWN0TGlua3MsIGRldGVjdExpbmtTdWZmaXhlcywgZ2V0TGlua1N1ZmZpeCwgSVBhcnNlZExpbmssIHJlbW92ZUxpbmtRdWVyeVN0cmluZywgcmVtb3ZlTGlua1N1ZmZpeCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxMaW5rUGFyc2luZy5qcyc7XG5cbmludGVyZmFjZSBJVGVzdExpbmsge1xuXHRsaW5rOiBzdHJpbmc7XG5cdHByZWZpeDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzdWZmaXg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Ly8gVE9ETzogVGhlc2UgaGFzIHZhcnMgd291bGQgYmUgbmljZXIgYXMgYSBmbGFncyBlbnVtXG5cdGhhc1JvdzogYm9vbGVhbjtcblx0aGFzQ29sOiBib29sZWFuO1xuXHRoYXNSb3dFbmQ/OiBib29sZWFuO1xuXHRoYXNDb2xFbmQ/OiBib29sZWFuO1xufVxuXG5jb25zdCBvcGVyYXRpbmdTeXN0ZW1zOiBSZWFkb25seUFycmF5PE9wZXJhdGluZ1N5c3RlbT4gPSBbXG5cdE9wZXJhdGluZ1N5c3RlbS5MaW51eCxcblx0T3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCxcblx0T3BlcmF0aW5nU3lzdGVtLldpbmRvd3Ncbl07XG5jb25zdCBvc1Rlc3RQYXRoOiB7IFtrZXk6IG51bWJlciB8IE9wZXJhdGluZ1N5c3RlbV06IHN0cmluZyB9ID0ge1xuXHRbT3BlcmF0aW5nU3lzdGVtLkxpbnV4XTogJy90ZXN0L3BhdGgvbGludXgnLFxuXHRbT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaF06ICcvdGVzdC9wYXRoL21hY2ludG9zaCcsXG5cdFtPcGVyYXRpbmdTeXN0ZW0uV2luZG93c106ICdDOlxcXFx0ZXN0XFxcXHBhdGhcXFxcd2luZG93cydcbn07XG5jb25zdCBvc0xhYmVsOiB7IFtrZXk6IG51bWJlciB8IE9wZXJhdGluZ1N5c3RlbV06IHN0cmluZyB9ID0ge1xuXHRbT3BlcmF0aW5nU3lzdGVtLkxpbnV4XTogJ1tMaW51eF0nLFxuXHRbT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaF06ICdbbWFjT1NdJyxcblx0W09wZXJhdGluZ1N5c3RlbS5XaW5kb3dzXTogJ1tXaW5kb3dzXSdcbn07XG5cbmNvbnN0IHRlc3RSb3cgPSAzMzk7XG5jb25zdCB0ZXN0Q29sID0gMTI7XG5jb25zdCB0ZXN0Um93RW5kID0gMzQxO1xuY29uc3QgdGVzdENvbEVuZCA9IDc4OTtcbmNvbnN0IHRlc3RMaW5rczogSVRlc3RMaW5rW10gPSBbXG5cdC8vIFNpbXBsZVxuXHR7IGxpbms6ICdmb28nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiB1bmRlZmluZWQsIGhhc1JvdzogZmFsc2UsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vOjMzOScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6MzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbzozMzk6MTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOjMzOToxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbzozMzk6MTItNzg5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzozMzk6MTItNzg5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUsIGhhc1Jvd0VuZDogZmFsc2UsIGhhc0NvbEVuZDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb286MzM5LjEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzozMzkuMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb286MzM5LjEyLTc4OScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6MzM5LjEyLTc4OScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlLCBoYXNSb3dFbmQ6IGZhbHNlLCBoYXNDb2xFbmQ6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vOjMzOS4xMi0zNDEuNzg5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzozMzkuMTItMzQxLjc4OScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlLCBoYXNSb3dFbmQ6IHRydWUsIGhhc0NvbEVuZDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28jMzM5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyMzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vIzMzOToxMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcjMzM5OjEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIzMzOToxMi03ODknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIzMzOToxMi03ODknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSwgaGFzUm93RW5kOiBmYWxzZSwgaGFzQ29sRW5kOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyMzMzkuMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIzMzOS4xMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyMzMzkuMTItNzg5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyMzMzkuMTItNzg5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUsIGhhc1Jvd0VuZDogZmFsc2UsIGhhc0NvbEVuZDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28jMzM5LjEyLTM0MS43ODknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIzMzOS4xMi0zNDEuNzg5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUsIGhhc1Jvd0VuZDogdHJ1ZSwgaGFzQ29sRW5kOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyAzMzknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb28gMzM5OjEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyAzMzk6MTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gMzM5OjEyLTc4OScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgMzM5OjEyLTc4OScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlLCBoYXNSb3dFbmQ6IGZhbHNlLCBoYXNDb2xFbmQ6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIDMzOS4xMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgMzM5LjEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIDMzOS4xMi03ODknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIDMzOS4xMi03ODknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSwgaGFzUm93RW5kOiBmYWxzZSwgaGFzQ29sRW5kOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyAzMzkuMTItMzQxLjc4OScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgMzM5LjEyLTM0MS43ODknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSwgaGFzUm93RW5kOiB0cnVlLCBoYXNDb2xFbmQ6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vLCAzMzknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnLCAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblxuXHQvLyBEb3VibGUgcXVvdGVzXG5cdHsgbGluazogJ1wiZm9vXCIsMzM5JywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiwzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnXCJmb29cIiwzMzk6MTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiLDMzOToxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIsMzM5LjEyJywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiwzMzkuMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiLCBsaW5lIDMzOScsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIsIGxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIsIGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiLCBsaW5lIDMzOSwgY29sIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXCJmb29cIiwgbGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIsIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiOmxpbmUgMzM5JywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIjpsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiOmxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiOmxpbmUgMzM5LCBjb2wgMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiOmxpbmUgMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiOmxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiOiBsaW5lIDMzOScsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCI6IGxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ1wiZm9vXCI6IGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiOiBsaW5lIDMzOSwgY29sIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXCJmb29cIjogbGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCI6IGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiIG9uIGxpbmUgMzM5JywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiBvbiBsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiIG9uIGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiIG9uIGxpbmUgMzM5LCBjb2wgMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiIG9uIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiIG9uIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiIGxpbmUgMzM5JywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiBsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiIGxpbmUgMzM5IGNvbHVtbiAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIgbGluZSAzMzkgY29sdW1uIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblxuXHQvLyBTaW5nbGUgcXVvdGVzXG5cdHsgbGluazogJ1xcJ2Zvb1xcJywzMzknLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcsMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJywzMzk6MTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcsMzM5OjEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXFwnZm9vXFwnLDMzOS4xMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJywzMzkuMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCcsIGxpbmUgMzM5JywgcHJlZml4OiAnXFwnJywgc3VmZml4OiAnXFwnLCBsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCcsIGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcsIGxpbmUgMzM5LCBjb2wgMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCcsIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcsIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCc6bGluZSAzMzknLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCc6bGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnXFwnZm9vXFwnOmxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCc6bGluZSAzMzksIGNvbCAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJzpsaW5lIDMzOSwgY29sdW1uIDEyJywgcHJlZml4OiAnXFwnJywgc3VmZml4OiAnXFwnOmxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCc6IGxpbmUgMzM5JywgcHJlZml4OiAnXFwnJywgc3VmZml4OiAnXFwnOiBsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCc6IGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCc6IGxpbmUgMzM5LCBjb2wgMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCc6IGxpbmUgMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCc6IGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCcgb24gbGluZSAzMzknLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcgb24gbGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnXFwnZm9vXFwnIG9uIGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcgb24gbGluZSAzMzksIGNvbCAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJyBvbiBsaW5lIDMzOSwgY29sdW1uIDEyJywgcHJlZml4OiAnXFwnJywgc3VmZml4OiAnXFwnIG9uIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCcgbGluZSAzMzknLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcgbGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnXFwnZm9vXFwnIGxpbmUgMzM5IGNvbHVtbiAxMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJyBsaW5lIDMzOSBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXG5cdC8vIE5vIHF1b3Rlc1xuXHR7IGxpbms6ICdmb28sIGxpbmUgMzM5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJywgbGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vLCBsaW5lIDMzOSwgY29sIDEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJywgbGluZSAzMzksIGNvbCAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbywgbGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcsIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb286bGluZSAzMzknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOmxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbzpsaW5lIDMzOSwgY29sIDEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzpsaW5lIDMzOSwgY29sIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vOmxpbmUgMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOmxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb286IGxpbmUgMzM5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzogbGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vOiBsaW5lIDMzOSwgY29sIDEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzogbGluZSAzMzksIGNvbCAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbzogbGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6IGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gb24gbGluZSAzMzknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIG9uIGxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbyBvbiBsaW5lIDMzOSwgY29sIDEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyBvbiBsaW5lIDMzOSwgY29sIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIG9uIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIG9uIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gbGluZSAzMzknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIGxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbyBsaW5lIDMzOSBjb2x1bW4gMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIGxpbmUgMzM5IGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cblx0Ly8gUGFyZW50aGVzZXNcblx0eyBsaW5rOiAnZm9vKDMzOSknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnKDMzOSknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vKDMzOSwxMiknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnKDMzOSwxMiknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28oMzM5LCAxMiknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnKDMzOSwgMTIpJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vICgzMzkpJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyAoMzM5KScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb28gKDMzOSwxMiknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnICgzMzksMTIpJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vICgzMzksIDEyKScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgKDMzOSwgMTIpJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vOiAoMzM5KScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6ICgzMzkpJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbzogKDMzOSwxMiknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOiAoMzM5LDEyKScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbzogKDMzOSwgMTIpJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzogKDMzOSwgMTIpJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vKDMzOToxMiknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnKDMzOToxMiknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gKDMzOToxMiknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnICgzMzk6MTIpJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblxuXHQvLyBTcXVhcmUgYnJhY2tldHNcblx0eyBsaW5rOiAnZm9vWzMzOV0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnWzMzOV0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vWzMzOSwxMl0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnWzMzOSwxMl0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb29bMzM5LCAxMl0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnWzMzOSwgMTJdJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIFszMzldJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyBbMzM5XScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb28gWzMzOSwxMl0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIFszMzksMTJdJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIFszMzksIDEyXScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgWzMzOSwgMTJdJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vOiBbMzM5XScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6IFszMzldJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbzogWzMzOSwxMl0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOiBbMzM5LDEyXScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbzogWzMzOSwgMTJdJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzogWzMzOSwgMTJdJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vWzMzOToxMl0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnWzMzOToxMl0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gWzMzOToxMl0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIFszMzk6MTJdJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblxuXHQvLyBPQ2FtbC1zdHlsZVxuXHR7IGxpbms6ICdcImZvb1wiLCBsaW5lIDMzOSwgY2hhcmFjdGVyIDEyJywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiwgbGluZSAzMzksIGNoYXJhY3RlciAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIsIGxpbmUgMzM5LCBjaGFyYWN0ZXJzIDEyLTc4OScsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIsIGxpbmUgMzM5LCBjaGFyYWN0ZXJzIDEyLTc4OScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlLCBoYXNDb2xFbmQ6IHRydWUgfSxcblx0eyBsaW5rOiAnXCJmb29cIiwgbGluZXMgMzM5LTM0MScsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIsIGxpbmVzIDMzOS0zNDEnLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UsIGhhc1Jvd0VuZDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiLCBsaW5lcyAzMzktMzQxLCBjaGFyYWN0ZXJzIDEyLTc4OScsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIsIGxpbmVzIDMzOS0zNDEsIGNoYXJhY3RlcnMgMTItNzg5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUsIGhhc1Jvd0VuZDogdHJ1ZSwgaGFzQ29sRW5kOiB0cnVlIH0sXG5cblx0Ly8gTm9uLWJyZWFraW5nIHNwYWNlXG5cdHsgbGluazogJ2Zvb1xcdTAwQTAzMzk6MTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnXFx1MDBBMDMzOToxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIgb24gbGluZSAzMzksXFx1MDBBMGNvbHVtbiAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIgb24gbGluZSAzMzksXFx1MDBBMGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJyBvbiBsaW5lXFx1MDBBMDMzOSwgY29sdW1uIDEyJywgcHJlZml4OiAnXFwnJywgc3VmZml4OiAnXFwnIG9uIGxpbmVcXHUwMEEwMzM5LCBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gKDMzOSxcXHUwMEEwMTIpJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyAoMzM5LFxcdTAwQTAxMiknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb29cXHUwMEEwWzMzOSwgMTJdJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJ1xcdTAwQTBbMzM5LCAxMl0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXTtcbmNvbnN0IHRlc3RMaW5rc1dpdGhTdWZmaXggPSB0ZXN0TGlua3MuZmlsdGVyKGUgPT4gISFlLnN1ZmZpeCk7XG5cbnN1aXRlKCdUZXJtaW5hbExpbmtQYXJzaW5nJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncmVtb3ZlTGlua1N1ZmZpeCcsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IHRlc3RMaW5rIG9mIHRlc3RMaW5rcykge1xuXHRcdFx0dGVzdCgnYCcgKyB0ZXN0TGluay5saW5rICsgJ2AnLCAoKSA9PiB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRyZW1vdmVMaW5rU3VmZml4KHRlc3RMaW5rLmxpbmspLFxuXHRcdFx0XHRcdHRlc3RMaW5rLnN1ZmZpeCA9PT0gdW5kZWZpbmVkID8gdGVzdExpbmsubGluayA6IHRlc3RMaW5rLmxpbmsucmVwbGFjZSh0ZXN0TGluay5zdWZmaXgsICcnKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblx0c3VpdGUoJ2dldExpbmtTdWZmaXgnLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCB0ZXN0TGluayBvZiB0ZXN0TGlua3MpIHtcblx0XHRcdHRlc3QoJ2AnICsgdGVzdExpbmsubGluayArICdgJywgKCkgPT4ge1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0TGlua1N1ZmZpeCh0ZXN0TGluay5saW5rKSxcblx0XHRcdFx0XHR0ZXN0TGluay5zdWZmaXggPT09IHVuZGVmaW5lZCA/IG51bGwgOiB7XG5cdFx0XHRcdFx0XHRyb3c6IHRlc3RMaW5rLmhhc1JvdyA/IHRlc3RSb3cgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb2w6IHRlc3RMaW5rLmhhc0NvbCA/IHRlc3RDb2wgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRyb3dFbmQ6IHRlc3RMaW5rLmhhc1Jvd0VuZCA/IHRlc3RSb3dFbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb2xFbmQ6IHRlc3RMaW5rLmhhc0NvbEVuZCA/IHRlc3RDb2xFbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IHRlc3RMaW5rLmxpbmsubGVuZ3RoIC0gdGVzdExpbmsuc3VmZml4Lmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0dGV4dDogdGVzdExpbmsuc3VmZml4XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBhcyBSZXR1cm5UeXBlPHR5cGVvZiBnZXRMaW5rU3VmZml4PlxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblx0c3VpdGUoJ2RldGVjdExpbmtTdWZmaXhlcycsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IHRlc3RMaW5rIG9mIHRlc3RMaW5rcykge1xuXHRcdFx0dGVzdCgnYCcgKyB0ZXN0TGluay5saW5rICsgJ2AnLCAoKSA9PiB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRkZXRlY3RMaW5rU3VmZml4ZXModGVzdExpbmsubGluayksXG5cdFx0XHRcdFx0dGVzdExpbmsuc3VmZml4ID09PSB1bmRlZmluZWQgPyBbXSA6IFt7XG5cdFx0XHRcdFx0XHRyb3c6IHRlc3RMaW5rLmhhc1JvdyA/IHRlc3RSb3cgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb2w6IHRlc3RMaW5rLmhhc0NvbCA/IHRlc3RDb2wgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRyb3dFbmQ6IHRlc3RMaW5rLmhhc1Jvd0VuZCA/IHRlc3RSb3dFbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb2xFbmQ6IHRlc3RMaW5rLmhhc0NvbEVuZCA/IHRlc3RDb2xFbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IHRlc3RMaW5rLmxpbmsubGVuZ3RoIC0gdGVzdExpbmsuc3VmZml4Lmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0dGV4dDogdGVzdExpbmsuc3VmZml4XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBhcyBSZXR1cm5UeXBlPHR5cGVvZiBnZXRMaW5rU3VmZml4Pl1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2ZvbygxLCAyKSBiYXJbMywgNF0gYmF6IG9uIGxpbmUgNScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZGV0ZWN0TGlua1N1ZmZpeGVzKCdmb28oMSwgMikgYmFyWzMsIDRdIGJheiBvbiBsaW5lIDUnKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGNvbDogMixcblx0XHRcdFx0XHRcdHJvdzogMSxcblx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDMsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICcoMSwgMiknXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRjb2w6IDQsXG5cdFx0XHRcdFx0XHRyb3c6IDMsXG5cdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAxMyxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ1szLCA0XSdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGNvbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cm93OiA1LFxuXHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMjMsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICcgb24gbGluZSA1J1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdyZW1vdmVMaW5rUXVlcnlTdHJpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJlbW92ZSBhbnkgcXVlcnkgc3RyaW5nIGZyb20gdGhlIGxpbmsnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChyZW1vdmVMaW5rUXVlcnlTdHJpbmcoJz9hPWInKSwgJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVtb3ZlTGlua1F1ZXJ5U3RyaW5nKCdmb28/YT1iJyksICdmb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlbW92ZUxpbmtRdWVyeVN0cmluZygnLi9mb28/YT1iJyksICcuL2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVtb3ZlTGlua1F1ZXJ5U3RyaW5nKCcvZm9vL2Jhcj9hPWInKSwgJy9mb28vYmFyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZW1vdmVMaW5rUXVlcnlTdHJpbmcoJ2Zvbz9hPWI/JyksICdmb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlbW92ZUxpbmtRdWVyeVN0cmluZygnZm9vP2E9YiZjPWQnKSwgJ2ZvbycpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNwZWN0ID8gaW4gVU5DIHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwocmVtb3ZlTGlua1F1ZXJ5U3RyaW5nKCdcXFxcXFxcXD9cXFxcZm9vP2E9YicpLCAnXFxcXFxcXFw/XFxcXGZvbycpO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ2RldGVjdExpbmtzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2ZvbygxLCAyKSBiYXJbMywgNF0gXCJiYXpcIiBvbiBsaW5lIDUnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGRldGVjdExpbmtzKCdmb28oMSwgMikgYmFyWzMsIDRdIFwiYmF6XCIgb24gbGluZSA1JywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdmb28nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0Y29sOiAyLFxuXHRcdFx0XHRcdFx0XHRyb3c6IDEsXG5cdFx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDMsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJygxLCAyKSdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMTAsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdiYXInXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0Y29sOiA0LFxuXHRcdFx0XHRcdFx0XHRyb3c6IDMsXG5cdFx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDEzLFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdbMywgNF0nXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDIxLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnYmF6J1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHByZWZpeDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMjAsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdcIidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0Y29sOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHJvdzogNSxcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogMjQsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ1wiIG9uIGxpbmUgNSdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBtdWx0aXBsZSBsaW5rcyB3aGVuIG9wZW5pbmcgYnJhY2tldHMgYXJlIGluIHRoZSB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRkZXRlY3RMaW5rcygnbm90bGlua1tmb286NDVdJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdub3RsaW5rW2Zvbydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRjb2w6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cm93OiA0NSxcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogMTEsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJzo0NSdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogOCxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ2Zvbydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRjb2w6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cm93OiA0NSxcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogMTEsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJzo0NSdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHRoZSBsaW5rIHByZWZpeCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZGV0ZWN0TGlua3MoJ1wiZm9vXCIsIGxpbmUgNSwgY29sIDYnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ2Zvbydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdcIicsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdHJvdzogNSxcblx0XHRcdFx0XHRcdFx0Y29sOiA2LFxuXHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiA0LFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdcIiwgbGluZSA1LCBjb2wgNidcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBiZSBzbWFydCBhYm91dCBkZXRlcm1pbmluZyB0aGUgbGluayBwcmVmaXggd2hlbiBtdWx0aXBsZSBwcmVmaXggY2hhcmFjdGVycyBleGlzdCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZGV0ZWN0TGlua3MoJ2VjaG8gXFwnXCJmb29cIiwgbGluZSA1LCBjb2wgNlxcJycsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiA3LFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnZm9vJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHByZWZpeDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogNixcblx0XHRcdFx0XHRcdFx0dGV4dDogJ1wiJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0cm93OiA1LFxuXHRcdFx0XHRcdFx0XHRjb2w6IDYsXG5cdFx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDEwLFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdcIiwgbGluZSA1LCBjb2wgNidcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXSxcblx0XHRcdFx0J1RoZSBvdXRlciBzaW5nbGUgcXVvdGVzIHNob3VsZCBiZSBleGNsdWRlZCBmcm9tIHRoZSBsaW5rIHByZWZpeCBhbmQgc3VmZml4J1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgYm90aCBzdWZmaXggYW5kIG5vbi1zdWZmaXggbGlua3Mgb24gYSBzaW5nbGUgbGluZScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZGV0ZWN0TGlua3MoJ1BTIEM6XFxcXEdpdGh1YlxcXFxtaWNyb3NvZnRcXFxcdnNjb2RlPiBlY2hvIFxcJ1wiZm9vXCIsIGxpbmUgNSwgY29sIDZcXCcnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAzLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnQzpcXFxcR2l0aHViXFxcXG1pY3Jvc29mdFxcXFx2c2NvZGUnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMzgsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdmb28nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cHJlZml4OiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAzNyxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ1wiJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0cm93OiA1LFxuXHRcdFx0XHRcdFx0XHRjb2w6IDYsXG5cdFx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDQxLFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdcIiwgbGluZSA1LCBjb2wgNidcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ1wifFwiJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnc2hvdWxkIGV4Y2x1ZGUgcGlwZSBjaGFyYWN0ZXJzIGZyb20gbGluayBwYXRocycsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGRldGVjdExpbmtzKCd8QzpcXFxcR2l0aHViXFxcXG1pY3Jvc29mdFxcXFx2c2NvZGV8JywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdDOlxcXFxHaXRodWJcXFxcbWljcm9zb2Z0XFxcXHZzY29kZSdcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBleGNsdWRlIHBpcGUgY2hhcmFjdGVycyBmcm9tIGxpbmsgcGF0aHMgd2l0aCBzdWZmaXhlcycsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGRldGVjdExpbmtzKCd8QzpcXFxcR2l0aHViXFxcXG1pY3Jvc29mdFxcXFx2c2NvZGU6NDAwfCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnQzpcXFxcR2l0aHViXFxcXG1pY3Jvc29mdFxcXFx2c2NvZGUnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRjb2w6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRyb3c6IDQwMCxcblx0XHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiAyNyxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6ICc6NDAwJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnXCI8PlwiJywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBvcyBvZiBvcGVyYXRpbmdTeXN0ZW1zKSB7XG5cdFx0XHRcdHRlc3QoYHNob3VsZCBleGNsdWRlIGJyYWNrZXQgY2hhcmFjdGVycyBmcm9tIGxpbmsgcGF0aHMgJHtvc0xhYmVsW29zXX1gLCAoKSA9PiB7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoYDwke29zVGVzdFBhdGhbb3NdfTxgLCBvcyksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6IG9zVGVzdFBhdGhbb3NdXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKGA+JHtvc1Rlc3RQYXRoW29zXX0+YCwgb3MpLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiBvc1Rlc3RQYXRoW29zXVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoYHNob3VsZCBleGNsdWRlIGJyYWNrZXQgY2hhcmFjdGVycyBmcm9tIGxpbmsgcGF0aHMgd2l0aCBzdWZmaXhlcyAke29zTGFiZWxbb3NdfWAsICgpID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcyhgPCR7b3NUZXN0UGF0aFtvc119OjQwMDxgLCBvcyksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6IG9zVGVzdFBhdGhbb3NdXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0cm93OiA0MDAsXG5cdFx0XHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxICsgb3NUZXN0UGF0aFtvc10ubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnOjQwMCdcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoYD4ke29zVGVzdFBhdGhbb3NdfTo0MDA+YCwgb3MpLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiBvc1Rlc3RQYXRoW29zXVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb2w6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRcdHJvdzogNDAwLFxuXHRcdFx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMSArIG9zVGVzdFBhdGhbb3NdLmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGV4dDogJzo0MDAnXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHN1aXRlKCdxdWVyeSBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBvcyBvZiBvcGVyYXRpbmdTeXN0ZW1zKSB7XG5cdFx0XHRcdHRlc3QoYHNob3VsZCBleGNsdWRlIHF1ZXJ5IHN0cmluZ3MgZnJvbSBsaW5rIHBhdGhzICR7b3NMYWJlbFtvc119YCwgKCkgPT4ge1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKGAke29zVGVzdFBhdGhbb3NdfT9hPWJgLCBvcyksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6IG9zVGVzdFBhdGhbb3NdXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKGAke29zVGVzdFBhdGhbb3NdfT9hPWImYz1kYCwgb3MpLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiBvc1Rlc3RQYXRoW29zXVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IGxpbmtzIHN0YXJ0aW5nIHdpdGggPyB3aXRoaW4gcXVlcnkgc3RyaW5ncyB0aGF0IGNvbnRhaW4gcG9zaXgtc3R5bGUgcGF0aHMgKCMyMDQxOTUpJywgKCkgPT4ge1xuXHRcdFx0XHRcdC8vID8gYXBwZW5kZWQgdG8gdGhlIGN3ZCB3aWxsIGV4aXN0IHNpbmNlIGl0J3MganVzdCB0aGUgY3dkXG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoZGV0ZWN0TGlua3MoYGh0dHA6Ly9mb28uY29tLz9iYXI9L2EvYiZiYXo9Y2AsIG9zKS5zb21lKGUgPT4gZS5wYXRoLnRleHQuc3RhcnRzV2l0aCgnPycpKSwgZmFsc2UpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgbGlua3Mgc3RhcnRpbmcgd2l0aCA/IHdpdGhpbiBxdWVyeSBzdHJpbmdzIHRoYXQgY29udGFpbiBXaW5kb3dzLXN0eWxlIHBhdGhzICgjMjA0MTk1KScsICgpID0+IHtcblx0XHRcdFx0XHQvLyA/IGFwcGVuZGVkIHRvIHRoZSBjd2Qgd2lsbCBleGlzdCBzaW5jZSBpdCdzIGp1c3QgdGhlIGN3ZFxuXHRcdFx0XHRcdHN0cmljdEVxdWFsKGRldGVjdExpbmtzKGBodHRwOi8vZm9vLmNvbS8/YmFyPWE6XFxcXGImYmF6PWNgLCBvcykuc29tZShlID0+IGUucGF0aC50ZXh0LnN0YXJ0c1dpdGgoJz8nKSksIGZhbHNlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnc2hvdWxkIGRldGVjdCBmaWxlIG5hbWVzIGluIGdpdCBkaWZmcycsICgpID0+IHtcblx0XHRcdHRlc3QoJy0tLSBhL2Zvby9iYXInLCAoKSA9PiB7XG5cdFx0XHRcdFsnYScsICdjJywgJ3cnLCAnaScsICdvJ10uZm9yRWFjaChwcmVmaXggPT4ge1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKGAtLS0gJHtwcmVmaXh9L2Zvby9iYXJgLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDYsXG5cdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnZm9vL2Jhcidcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCcrKysgYi9mb28vYmFyJywgKCkgPT4ge1xuXHRcdFx0XHRbJ2InLCAnYycsICd3JywgJ2knLCAnbyddLmZvckVhY2gocHJlZml4ID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcyhgKysrICR7cHJlZml4fS9mb28vYmFyYCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiA2LFxuXHRcdFx0XHRcdFx0XHRcdFx0dGV4dDogJ2Zvby9iYXInXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZGlmZiAtLWdpdCBhL2Zvby9iYXIgYi9mb28vYmF6JywgKCkgPT4ge1xuXHRcdFx0XHRbWydhJywgJ2InXSwgWydjJywgJ3cnXSwgWydpJywgJ28nXV0uZm9yRWFjaCgoW3NvdXJjZVByZWZpeCwgZGVzdGluYXRpb25QcmVmaXhdKSA9PiB7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoYGRpZmYgLS1naXQgJHtzb3VyY2VQcmVmaXh9L2Zvby9iYXIgJHtkZXN0aW5hdGlvblByZWZpeH0vZm9vL2JhemAsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMTMsXG5cdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnZm9vL2Jhcidcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMjMsXG5cdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnZm9vL2Jheidcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdudW1lcmljIHByZWZpeGVzIHVzZWQgYnkgZ2l0IGRpZmYgLS1uby1pbmRleCcsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKCctLS0gMS9mb28vYmFyJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKCcrKysgMi9mb28vYmF6JywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKCdkaWZmIC0tZ2l0IDEvZm9vL2JhciAyL2Zvby9iYXonLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRwYXRoOiB7IGluZGV4OiA2LCB0ZXh0OiAnZm9vL2JhcicgfSxcblx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRcdHBhdGg6IHsgaW5kZXg6IDYsIHRleHQ6ICdmb28vYmF6JyB9LFxuXHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0cGF0aDogeyBpbmRleDogMTMsIHRleHQ6ICdmb28vYmFyJyB9LFxuXHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdFx0cGF0aDogeyBpbmRleDogMjMsIHRleHQ6ICdmb28vYmF6JyB9LFxuXHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdW11cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgncmV2ZXJzZWQgbnVtZXJpYyBwcmVmaXhlcyB1c2VkIGJ5IGdpdCBkaWZmIC0tbm8taW5kZXggLVInLCAoKSA9PiB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcygnLS0tIDIvZm9vL2JheicsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcygnKysrIDEvZm9vL2JhcicsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcygnZGlmZiAtLWdpdCAyL2Zvby9iYXogMS9mb28vYmFyJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0cGF0aDogeyBpbmRleDogNiwgdGV4dDogJ2Zvby9iYXonIH0sXG5cdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRwYXRoOiB7IGluZGV4OiA2LCB0ZXh0OiAnZm9vL2JhcicgfSxcblx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRcdHBhdGg6IHsgaW5kZXg6IDEzLCB0ZXh0OiAnZm9vL2JheicgfSxcblx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRcdHBhdGg6IHsgaW5kZXg6IDIzLCB0ZXh0OiAnZm9vL2JhcicgfSxcblx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVtdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ29yZGluYXJ5IG51bWVyaWMgbGluZSBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRkZXRlY3RMaW5rcygnZm9vIDEnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRwYXRoOiB7IGluZGV4OiAwLCB0ZXh0OiAnZm9vJyB9LFxuXHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0cm93OiAxLFxuXHRcdFx0XHRcdFx0XHRjb2w6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHsgaW5kZXg6IDMsIHRleHQ6ICcgMScgfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnbnVtZXJpYyBzdWZmaXggZm9sbG93ZWQgYnkgYSBwYXRoIHNlcGFyYXRvcicsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGRldGVjdExpbmtzKCdmb28gMS9iYXInLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRwYXRoOiB7IGluZGV4OiA0LCB0ZXh0OiAnMS9iYXInIH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fV0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdvcmRpbmFyeSBudW1lcmljIGxpbmUgc3VmZml4IGFmdGVyIGRpZmYgLS1naXQgdGV4dCcsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGRldGVjdExpbmtzKCdkaWZmIC0tZ2l0IGZvby50czoxMjMnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRwYXRoOiB7IGluZGV4OiAxMSwgdGV4dDogJ2Zvby50cycgfSxcblx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdHJvdzogMTIzLFxuXHRcdFx0XHRcdFx0XHRjb2w6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHsgaW5kZXg6IDE3LCB0ZXh0OiAnOjEyMycgfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3Nob3VsZCBkZXRlY3QgMyBzdWZmaXggbGlua3Mgb24gYSBzaW5nbGUgbGluZScsICgpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGVzdExpbmtzV2l0aFN1ZmZpeC5sZW5ndGggLSAyOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluazEgPSB0ZXN0TGlua3NXaXRoU3VmZml4W2ldO1xuXHRcdFx0XHRjb25zdCBsaW5rMiA9IHRlc3RMaW5rc1dpdGhTdWZmaXhbaSArIDFdO1xuXHRcdFx0XHRjb25zdCBsaW5rMyA9IHRlc3RMaW5rc1dpdGhTdWZmaXhbaSArIDJdO1xuXHRcdFx0XHRjb25zdCBsaW5lID0gYCAke2xpbmsxLmxpbmt9ICR7bGluazIubGlua30gJHtsaW5rMy5saW5rfSBgO1xuXHRcdFx0XHR0ZXN0KCdgJyArIGxpbmUucmVwbGFjZUFsbCgnXFx1MDBBMCcsICc8bmJzcD4nKSArICdgJywgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKGRldGVjdExpbmtzKGxpbmUsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkubGVuZ3RoLCAzKTtcblx0XHRcdFx0XHRvayhsaW5rMS5zdWZmaXgpO1xuXHRcdFx0XHRcdG9rKGxpbmsyLnN1ZmZpeCk7XG5cdFx0XHRcdFx0b2sobGluazMuc3VmZml4KTtcblx0XHRcdFx0XHRjb25zdCBkZXRlY3RlZExpbmsxOiBJUGFyc2VkTGluayA9IHtcblx0XHRcdFx0XHRcdHByZWZpeDogbGluazEucHJlZml4ID8ge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdFx0dGV4dDogbGluazEucHJlZml4XG5cdFx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMSArIChsaW5rMS5wcmVmaXg/Lmxlbmd0aCA/PyAwKSxcblx0XHRcdFx0XHRcdFx0dGV4dDogbGluazEubGluay5yZXBsYWNlKGxpbmsxLnN1ZmZpeCwgJycpLnJlcGxhY2UobGluazEucHJlZml4IHx8ICcnLCAnJylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0cm93OiBsaW5rMS5oYXNSb3cgPyB0ZXN0Um93IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2w6IGxpbmsxLmhhc0NvbCA/IHRlc3RDb2wgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHJvd0VuZDogbGluazEuaGFzUm93RW5kID8gdGVzdFJvd0VuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiBsaW5rMS5oYXNDb2xFbmQgPyB0ZXN0Q29sRW5kIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogMSArIChsaW5rMS5saW5rLmxlbmd0aCAtIGxpbmsxLnN1ZmZpeC5sZW5ndGgpLFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6IGxpbmsxLnN1ZmZpeFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCBkZXRlY3RlZExpbmsyOiBJUGFyc2VkTGluayA9IHtcblx0XHRcdFx0XHRcdHByZWZpeDogbGluazIucHJlZml4ID8ge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogKGRldGVjdGVkTGluazEucHJlZml4Py5pbmRleCA/PyBkZXRlY3RlZExpbmsxLnBhdGguaW5kZXgpICsgbGluazEubGluay5sZW5ndGggKyAxLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiBsaW5rMi5wcmVmaXhcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAoZGV0ZWN0ZWRMaW5rMS5wcmVmaXg/LmluZGV4ID8/IGRldGVjdGVkTGluazEucGF0aC5pbmRleCkgKyBsaW5rMS5saW5rLmxlbmd0aCArIDEgKyAobGluazIucHJlZml4ID8/ICcnKS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdHRleHQ6IGxpbmsyLmxpbmsucmVwbGFjZShsaW5rMi5zdWZmaXgsICcnKS5yZXBsYWNlKGxpbmsyLnByZWZpeCA/PyAnJywgJycpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdHJvdzogbGluazIuaGFzUm93ID8gdGVzdFJvdyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sOiBsaW5rMi5oYXNDb2wgPyB0ZXN0Q29sIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRyb3dFbmQ6IGxpbmsyLmhhc1Jvd0VuZCA/IHRlc3RSb3dFbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogbGluazIuaGFzQ29sRW5kID8gdGVzdENvbEVuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IChkZXRlY3RlZExpbmsxLnByZWZpeD8uaW5kZXggPz8gZGV0ZWN0ZWRMaW5rMS5wYXRoLmluZGV4KSArIGxpbmsxLmxpbmsubGVuZ3RoICsgMSArIChsaW5rMi5saW5rLmxlbmd0aCAtIGxpbmsyLnN1ZmZpeC5sZW5ndGgpLFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6IGxpbmsyLnN1ZmZpeFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCBkZXRlY3RlZExpbmszOiBJUGFyc2VkTGluayA9IHtcblx0XHRcdFx0XHRcdHByZWZpeDogbGluazMucHJlZml4ID8ge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogKGRldGVjdGVkTGluazIucHJlZml4Py5pbmRleCA/PyBkZXRlY3RlZExpbmsyLnBhdGguaW5kZXgpICsgbGluazIubGluay5sZW5ndGggKyAxLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiBsaW5rMy5wcmVmaXhcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAoZGV0ZWN0ZWRMaW5rMi5wcmVmaXg/LmluZGV4ID8/IGRldGVjdGVkTGluazIucGF0aC5pbmRleCkgKyBsaW5rMi5saW5rLmxlbmd0aCArIDEgKyAobGluazMucHJlZml4ID8/ICcnKS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdHRleHQ6IGxpbmszLmxpbmsucmVwbGFjZShsaW5rMy5zdWZmaXgsICcnKS5yZXBsYWNlKGxpbmszLnByZWZpeCA/PyAnJywgJycpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdHJvdzogbGluazMuaGFzUm93ID8gdGVzdFJvdyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sOiBsaW5rMy5oYXNDb2wgPyB0ZXN0Q29sIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRyb3dFbmQ6IGxpbmszLmhhc1Jvd0VuZCA/IHRlc3RSb3dFbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogbGluazMuaGFzQ29sRW5kID8gdGVzdENvbEVuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IChkZXRlY3RlZExpbmsyLnByZWZpeD8uaW5kZXggPz8gZGV0ZWN0ZWRMaW5rMi5wYXRoLmluZGV4KSArIGxpbmsyLmxpbmsubGVuZ3RoICsgMSArIChsaW5rMy5saW5rLmxlbmd0aCAtIGxpbmszLnN1ZmZpeC5sZW5ndGgpLFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6IGxpbmszLnN1ZmZpeFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcyhsaW5lLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRcdFx0W2RldGVjdGVkTGluazEsIGRldGVjdGVkTGluazIsIGRldGVjdGVkTGluazNdXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ3Nob3VsZCBpZ25vcmUgbGlua3Mgd2l0aCBzdWZmaXhlcyB3aGVuIHRoZSBwYXRoIGl0c2VsZiBpcyB0aGUgZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRkZXRlY3RMaW5rcygnXCJcIlwiLDEnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRbXSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDakQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhLG9CQUFvQixlQUE0Qix1QkFBdUIsd0JBQXdCO0FBYXJILE1BQU0sbUJBQW1EO0FBQUEsRUFDeEQsZ0JBQWdCO0FBQUEsRUFDaEIsZ0JBQWdCO0FBQUEsRUFDaEIsZ0JBQWdCO0FBQ2pCO0FBQ0EsTUFBTSxhQUEwRDtBQUFBLEVBQy9ELENBQUMsZ0JBQWdCLEtBQUssR0FBRztBQUFBLEVBQ3pCLENBQUMsZ0JBQWdCLFNBQVMsR0FBRztBQUFBLEVBQzdCLENBQUMsZ0JBQWdCLE9BQU8sR0FBRztBQUM1QjtBQUNBLE1BQU0sVUFBdUQ7QUFBQSxFQUM1RCxDQUFDLGdCQUFnQixLQUFLLEdBQUc7QUFBQSxFQUN6QixDQUFDLGdCQUFnQixTQUFTLEdBQUc7QUFBQSxFQUM3QixDQUFDLGdCQUFnQixPQUFPLEdBQUc7QUFDNUI7QUFFQSxNQUFNLFVBQVU7QUFDaEIsTUFBTSxVQUFVO0FBQ2hCLE1BQU0sYUFBYTtBQUNuQixNQUFNLGFBQWE7QUFDbkIsTUFBTSxZQUF5QjtBQUFBO0FBQUEsRUFFOUIsRUFBRSxNQUFNLE9BQU8sUUFBUSxRQUFXLFFBQVEsUUFBVyxRQUFRLE9BQU8sUUFBUSxNQUFNO0FBQUEsRUFDbEYsRUFBRSxNQUFNLFdBQVcsUUFBUSxRQUFXLFFBQVEsUUFBUSxRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDbEYsRUFBRSxNQUFNLGNBQWMsUUFBUSxRQUFXLFFBQVEsV0FBVyxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDdkYsRUFBRSxNQUFNLGtCQUFrQixRQUFRLFFBQVcsUUFBUSxlQUFlLFFBQVEsTUFBTSxRQUFRLE1BQU0sV0FBVyxPQUFPLFdBQVcsS0FBSztBQUFBLEVBQ2xJLEVBQUUsTUFBTSxjQUFjLFFBQVEsUUFBVyxRQUFRLFdBQVcsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ3ZGLEVBQUUsTUFBTSxrQkFBa0IsUUFBUSxRQUFXLFFBQVEsZUFBZSxRQUFRLE1BQU0sUUFBUSxNQUFNLFdBQVcsT0FBTyxXQUFXLEtBQUs7QUFBQSxFQUNsSSxFQUFFLE1BQU0sc0JBQXNCLFFBQVEsUUFBVyxRQUFRLG1CQUFtQixRQUFRLE1BQU0sUUFBUSxNQUFNLFdBQVcsTUFBTSxXQUFXLEtBQUs7QUFBQSxFQUN6SSxFQUFFLE1BQU0sV0FBVyxRQUFRLFFBQVcsUUFBUSxRQUFRLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUNsRixFQUFFLE1BQU0sY0FBYyxRQUFRLFFBQVcsUUFBUSxXQUFXLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUN2RixFQUFFLE1BQU0sa0JBQWtCLFFBQVEsUUFBVyxRQUFRLGVBQWUsUUFBUSxNQUFNLFFBQVEsTUFBTSxXQUFXLE9BQU8sV0FBVyxLQUFLO0FBQUEsRUFDbEksRUFBRSxNQUFNLGNBQWMsUUFBUSxRQUFXLFFBQVEsV0FBVyxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDdkYsRUFBRSxNQUFNLGtCQUFrQixRQUFRLFFBQVcsUUFBUSxlQUFlLFFBQVEsTUFBTSxRQUFRLE1BQU0sV0FBVyxPQUFPLFdBQVcsS0FBSztBQUFBLEVBQ2xJLEVBQUUsTUFBTSxzQkFBc0IsUUFBUSxRQUFXLFFBQVEsbUJBQW1CLFFBQVEsTUFBTSxRQUFRLE1BQU0sV0FBVyxNQUFNLFdBQVcsS0FBSztBQUFBLEVBQ3pJLEVBQUUsTUFBTSxXQUFXLFFBQVEsUUFBVyxRQUFRLFFBQVEsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQ2xGLEVBQUUsTUFBTSxjQUFjLFFBQVEsUUFBVyxRQUFRLFdBQVcsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ3ZGLEVBQUUsTUFBTSxrQkFBa0IsUUFBUSxRQUFXLFFBQVEsZUFBZSxRQUFRLE1BQU0sUUFBUSxNQUFNLFdBQVcsT0FBTyxXQUFXLEtBQUs7QUFBQSxFQUNsSSxFQUFFLE1BQU0sY0FBYyxRQUFRLFFBQVcsUUFBUSxXQUFXLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUN2RixFQUFFLE1BQU0sa0JBQWtCLFFBQVEsUUFBVyxRQUFRLGVBQWUsUUFBUSxNQUFNLFFBQVEsTUFBTSxXQUFXLE9BQU8sV0FBVyxLQUFLO0FBQUEsRUFDbEksRUFBRSxNQUFNLHNCQUFzQixRQUFRLFFBQVcsUUFBUSxtQkFBbUIsUUFBUSxNQUFNLFFBQVEsTUFBTSxXQUFXLE1BQU0sV0FBVyxLQUFLO0FBQUEsRUFDekksRUFBRSxNQUFNLFlBQVksUUFBUSxRQUFXLFFBQVEsU0FBUyxRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUE7QUFBQSxFQUdwRixFQUFFLE1BQU0sYUFBYSxRQUFRLEtBQUssUUFBUSxTQUFTLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUMvRSxFQUFFLE1BQU0sZ0JBQWdCLFFBQVEsS0FBSyxRQUFRLFlBQVksUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ3BGLEVBQUUsTUFBTSxnQkFBZ0IsUUFBUSxLQUFLLFFBQVEsWUFBWSxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDcEYsRUFBRSxNQUFNLG1CQUFtQixRQUFRLEtBQUssUUFBUSxlQUFlLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUMzRixFQUFFLE1BQU0sMkJBQTJCLFFBQVEsS0FBSyxRQUFRLHVCQUF1QixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDMUcsRUFBRSxNQUFNLDhCQUE4QixRQUFRLEtBQUssUUFBUSwwQkFBMEIsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ2hILEVBQUUsTUFBTSxrQkFBa0IsUUFBUSxLQUFLLFFBQVEsY0FBYyxRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDekYsRUFBRSxNQUFNLDBCQUEwQixRQUFRLEtBQUssUUFBUSxzQkFBc0IsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ3hHLEVBQUUsTUFBTSw2QkFBNkIsUUFBUSxLQUFLLFFBQVEseUJBQXlCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUM5RyxFQUFFLE1BQU0sbUJBQW1CLFFBQVEsS0FBSyxRQUFRLGVBQWUsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQzNGLEVBQUUsTUFBTSwyQkFBMkIsUUFBUSxLQUFLLFFBQVEsdUJBQXVCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUMxRyxFQUFFLE1BQU0sOEJBQThCLFFBQVEsS0FBSyxRQUFRLDBCQUEwQixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDaEgsRUFBRSxNQUFNLHFCQUFxQixRQUFRLEtBQUssUUFBUSxpQkFBaUIsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQy9GLEVBQUUsTUFBTSw2QkFBNkIsUUFBUSxLQUFLLFFBQVEseUJBQXlCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUM5RyxFQUFFLE1BQU0sZ0NBQWdDLFFBQVEsS0FBSyxRQUFRLDRCQUE0QixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDcEgsRUFBRSxNQUFNLGtCQUFrQixRQUFRLEtBQUssUUFBUSxjQUFjLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUN6RixFQUFFLE1BQU0sNEJBQTRCLFFBQVEsS0FBSyxRQUFRLHdCQUF3QixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUE7QUFBQSxFQUc1RyxFQUFFLE1BQU0sYUFBZSxRQUFRLEtBQU0sUUFBUSxTQUFVLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUNuRixFQUFFLE1BQU0sZ0JBQWtCLFFBQVEsS0FBTSxRQUFRLFlBQWEsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ3hGLEVBQUUsTUFBTSxnQkFBa0IsUUFBUSxLQUFNLFFBQVEsWUFBYSxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDeEYsRUFBRSxNQUFNLG1CQUFxQixRQUFRLEtBQU0sUUFBUSxlQUFnQixRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDL0YsRUFBRSxNQUFNLDJCQUE2QixRQUFRLEtBQU0sUUFBUSx1QkFBd0IsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQzlHLEVBQUUsTUFBTSw4QkFBZ0MsUUFBUSxLQUFNLFFBQVEsMEJBQTJCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUNwSCxFQUFFLE1BQU0sa0JBQW9CLFFBQVEsS0FBTSxRQUFRLGNBQWUsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQzdGLEVBQUUsTUFBTSwwQkFBNEIsUUFBUSxLQUFNLFFBQVEsc0JBQXVCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUM1RyxFQUFFLE1BQU0sNkJBQStCLFFBQVEsS0FBTSxRQUFRLHlCQUEwQixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDbEgsRUFBRSxNQUFNLG1CQUFxQixRQUFRLEtBQU0sUUFBUSxlQUFnQixRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDL0YsRUFBRSxNQUFNLDJCQUE2QixRQUFRLEtBQU0sUUFBUSx1QkFBd0IsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQzlHLEVBQUUsTUFBTSw4QkFBZ0MsUUFBUSxLQUFNLFFBQVEsMEJBQTJCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUNwSCxFQUFFLE1BQU0scUJBQXVCLFFBQVEsS0FBTSxRQUFRLGlCQUFrQixRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDbkcsRUFBRSxNQUFNLDZCQUErQixRQUFRLEtBQU0sUUFBUSx5QkFBMEIsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ2xILEVBQUUsTUFBTSxnQ0FBa0MsUUFBUSxLQUFNLFFBQVEsNEJBQTZCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUN4SCxFQUFFLE1BQU0sa0JBQW9CLFFBQVEsS0FBTSxRQUFRLGNBQWUsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQzdGLEVBQUUsTUFBTSw0QkFBOEIsUUFBUSxLQUFNLFFBQVEsd0JBQXlCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQTtBQUFBLEVBR2hILEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxRQUFXLFFBQVEsY0FBYyxRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDOUYsRUFBRSxNQUFNLHlCQUF5QixRQUFRLFFBQVcsUUFBUSxzQkFBc0IsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQzdHLEVBQUUsTUFBTSw0QkFBNEIsUUFBUSxRQUFXLFFBQVEseUJBQXlCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUNuSCxFQUFFLE1BQU0sZ0JBQWdCLFFBQVEsUUFBVyxRQUFRLGFBQWEsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQzVGLEVBQUUsTUFBTSx3QkFBd0IsUUFBUSxRQUFXLFFBQVEscUJBQXFCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUMzRyxFQUFFLE1BQU0sMkJBQTJCLFFBQVEsUUFBVyxRQUFRLHdCQUF3QixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDakgsRUFBRSxNQUFNLGlCQUFpQixRQUFRLFFBQVcsUUFBUSxjQUFjLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUM5RixFQUFFLE1BQU0seUJBQXlCLFFBQVEsUUFBVyxRQUFRLHNCQUFzQixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDN0csRUFBRSxNQUFNLDRCQUE0QixRQUFRLFFBQVcsUUFBUSx5QkFBeUIsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ25ILEVBQUUsTUFBTSxtQkFBbUIsUUFBUSxRQUFXLFFBQVEsZ0JBQWdCLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUNsRyxFQUFFLE1BQU0sMkJBQTJCLFFBQVEsUUFBVyxRQUFRLHdCQUF3QixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDakgsRUFBRSxNQUFNLDhCQUE4QixRQUFRLFFBQVcsUUFBUSwyQkFBMkIsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ3ZILEVBQUUsTUFBTSxnQkFBZ0IsUUFBUSxRQUFXLFFBQVEsYUFBYSxRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDNUYsRUFBRSxNQUFNLDBCQUEwQixRQUFRLFFBQVcsUUFBUSx1QkFBdUIsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBO0FBQUEsRUFHL0csRUFBRSxNQUFNLFlBQVksUUFBUSxRQUFXLFFBQVEsU0FBUyxRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDcEYsRUFBRSxNQUFNLGVBQWUsUUFBUSxRQUFXLFFBQVEsWUFBWSxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDekYsRUFBRSxNQUFNLGdCQUFnQixRQUFRLFFBQVcsUUFBUSxhQUFhLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUMzRixFQUFFLE1BQU0sYUFBYSxRQUFRLFFBQVcsUUFBUSxVQUFVLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUN0RixFQUFFLE1BQU0sZ0JBQWdCLFFBQVEsUUFBVyxRQUFRLGFBQWEsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQzNGLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxRQUFXLFFBQVEsY0FBYyxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDN0YsRUFBRSxNQUFNLGNBQWMsUUFBUSxRQUFXLFFBQVEsV0FBVyxRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQUEsRUFDeEYsRUFBRSxNQUFNLGlCQUFpQixRQUFRLFFBQVcsUUFBUSxjQUFjLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUM3RixFQUFFLE1BQU0sa0JBQWtCLFFBQVEsUUFBVyxRQUFRLGVBQWUsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQy9GLEVBQUUsTUFBTSxlQUFlLFFBQVEsUUFBVyxRQUFRLFlBQVksUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ3pGLEVBQUUsTUFBTSxnQkFBZ0IsUUFBUSxRQUFXLFFBQVEsYUFBYSxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUE7QUFBQSxFQUczRixFQUFFLE1BQU0sWUFBWSxRQUFRLFFBQVcsUUFBUSxTQUFTLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUNwRixFQUFFLE1BQU0sZUFBZSxRQUFRLFFBQVcsUUFBUSxZQUFZLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUN6RixFQUFFLE1BQU0sZ0JBQWdCLFFBQVEsUUFBVyxRQUFRLGFBQWEsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQzNGLEVBQUUsTUFBTSxhQUFhLFFBQVEsUUFBVyxRQUFRLFVBQVUsUUFBUSxNQUFNLFFBQVEsTUFBTTtBQUFBLEVBQ3RGLEVBQUUsTUFBTSxnQkFBZ0IsUUFBUSxRQUFXLFFBQVEsYUFBYSxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDM0YsRUFBRSxNQUFNLGlCQUFpQixRQUFRLFFBQVcsUUFBUSxjQUFjLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUM3RixFQUFFLE1BQU0sY0FBYyxRQUFRLFFBQVcsUUFBUSxXQUFXLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxFQUN4RixFQUFFLE1BQU0saUJBQWlCLFFBQVEsUUFBVyxRQUFRLGNBQWMsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQzdGLEVBQUUsTUFBTSxrQkFBa0IsUUFBUSxRQUFXLFFBQVEsZUFBZSxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDL0YsRUFBRSxNQUFNLGVBQWUsUUFBUSxRQUFXLFFBQVEsWUFBWSxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDekYsRUFBRSxNQUFNLGdCQUFnQixRQUFRLFFBQVcsUUFBUSxhQUFhLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQTtBQUFBLEVBRzNGLEVBQUUsTUFBTSxpQ0FBaUMsUUFBUSxLQUFLLFFBQVEsNkJBQTZCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUN0SCxFQUFFLE1BQU0sc0NBQXNDLFFBQVEsS0FBSyxRQUFRLGtDQUFrQyxRQUFRLE1BQU0sUUFBUSxNQUFNLFdBQVcsS0FBSztBQUFBLEVBQ2pKLEVBQUUsTUFBTSx3QkFBd0IsUUFBUSxLQUFLLFFBQVEsb0JBQW9CLFFBQVEsTUFBTSxRQUFRLE9BQU8sV0FBVyxLQUFLO0FBQUEsRUFDdEgsRUFBRSxNQUFNLDJDQUEyQyxRQUFRLEtBQUssUUFBUSx1Q0FBdUMsUUFBUSxNQUFNLFFBQVEsTUFBTSxXQUFXLE1BQU0sV0FBVyxLQUFLO0FBQUE7QUFBQSxFQUc1SyxFQUFFLE1BQU0saUJBQW1CLFFBQVEsUUFBVyxRQUFRLGNBQWdCLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUNqRyxFQUFFLE1BQU0sbUNBQXFDLFFBQVEsS0FBSyxRQUFRLCtCQUFpQyxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsRUFDOUgsRUFBRSxNQUFNLG1DQUF1QyxRQUFRLEtBQU0sUUFBUSwrQkFBa0MsUUFBUSxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ2xJLEVBQUUsTUFBTSxvQkFBc0IsUUFBUSxRQUFXLFFBQVEsaUJBQW1CLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxFQUN2RyxFQUFFLE1BQU0sb0JBQXNCLFFBQVEsUUFBVyxRQUFRLGlCQUFtQixRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQ3hHO0FBQ0EsTUFBTSxzQkFBc0IsVUFBVSxPQUFPLE9BQUssQ0FBQyxDQUFDLEVBQUUsTUFBTTtBQUU1RCxNQUFNLHVCQUF1QixNQUFNO0FBQ2xDLDBDQUF3QztBQUV4QyxRQUFNLG9CQUFvQixNQUFNO0FBQy9CLGVBQVcsWUFBWSxXQUFXO0FBQ2pDLFdBQUssTUFBTSxTQUFTLE9BQU8sS0FBSyxNQUFNO0FBQ3JDO0FBQUEsVUFDQyxpQkFBaUIsU0FBUyxJQUFJO0FBQUEsVUFDOUIsU0FBUyxXQUFXLFNBQVksU0FBUyxPQUFPLFNBQVMsS0FBSyxRQUFRLFNBQVMsUUFBUSxFQUFFO0FBQUEsUUFDMUY7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBQ0QsUUFBTSxpQkFBaUIsTUFBTTtBQUM1QixlQUFXLFlBQVksV0FBVztBQUNqQyxXQUFLLE1BQU0sU0FBUyxPQUFPLEtBQUssTUFBTTtBQUNyQztBQUFBLFVBQ0MsY0FBYyxTQUFTLElBQUk7QUFBQSxVQUMzQixTQUFTLFdBQVcsU0FBWSxPQUFPO0FBQUEsWUFDdEMsS0FBSyxTQUFTLFNBQVMsVUFBVTtBQUFBLFlBQ2pDLEtBQUssU0FBUyxTQUFTLFVBQVU7QUFBQSxZQUNqQyxRQUFRLFNBQVMsWUFBWSxhQUFhO0FBQUEsWUFDMUMsUUFBUSxTQUFTLFlBQVksYUFBYTtBQUFBLFlBQzFDLFFBQVE7QUFBQSxjQUNQLE9BQU8sU0FBUyxLQUFLLFNBQVMsU0FBUyxPQUFPO0FBQUEsY0FDOUMsTUFBTSxTQUFTO0FBQUEsWUFDaEI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFDRCxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLGVBQVcsWUFBWSxXQUFXO0FBQ2pDLFdBQUssTUFBTSxTQUFTLE9BQU8sS0FBSyxNQUFNO0FBQ3JDO0FBQUEsVUFDQyxtQkFBbUIsU0FBUyxJQUFJO0FBQUEsVUFDaEMsU0FBUyxXQUFXLFNBQVksQ0FBQyxJQUFJLENBQUM7QUFBQSxZQUNyQyxLQUFLLFNBQVMsU0FBUyxVQUFVO0FBQUEsWUFDakMsS0FBSyxTQUFTLFNBQVMsVUFBVTtBQUFBLFlBQ2pDLFFBQVEsU0FBUyxZQUFZLGFBQWE7QUFBQSxZQUMxQyxRQUFRLFNBQVMsWUFBWSxhQUFhO0FBQUEsWUFDMUMsUUFBUTtBQUFBLGNBQ1AsT0FBTyxTQUFTLEtBQUssU0FBUyxTQUFTLE9BQU87QUFBQSxjQUM5QyxNQUFNLFNBQVM7QUFBQSxZQUNoQjtBQUFBLFVBQ0QsQ0FBcUM7QUFBQSxRQUN0QztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFFQSxTQUFLLHFDQUFxQyxNQUFNO0FBQy9DO0FBQUEsUUFDQyxtQkFBbUIsbUNBQW1DO0FBQUEsUUFDdEQ7QUFBQSxVQUNDO0FBQUEsWUFDQyxLQUFLO0FBQUEsWUFDTCxLQUFLO0FBQUEsWUFDTCxRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsY0FDUCxPQUFPO0FBQUEsY0FDUCxNQUFNO0FBQUEsWUFDUDtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsWUFDQyxLQUFLO0FBQUEsWUFDTCxLQUFLO0FBQUEsWUFDTCxRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsY0FDUCxPQUFPO0FBQUEsY0FDUCxNQUFNO0FBQUEsWUFDUDtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsWUFDQyxLQUFLO0FBQUEsWUFDTCxLQUFLO0FBQUEsWUFDTCxRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsY0FDUCxPQUFPO0FBQUEsY0FDUCxNQUFNO0FBQUEsWUFDUDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNELFFBQU0seUJBQXlCLE1BQU07QUFDcEMsU0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxrQkFBWSxzQkFBc0IsTUFBTSxHQUFHLEVBQUU7QUFDN0Msa0JBQVksc0JBQXNCLFNBQVMsR0FBRyxLQUFLO0FBQ25ELGtCQUFZLHNCQUFzQixXQUFXLEdBQUcsT0FBTztBQUN2RCxrQkFBWSxzQkFBc0IsY0FBYyxHQUFHLFVBQVU7QUFDN0Qsa0JBQVksc0JBQXNCLFVBQVUsR0FBRyxLQUFLO0FBQ3BELGtCQUFZLHNCQUFzQixhQUFhLEdBQUcsS0FBSztBQUFBLElBQ3hELENBQUM7QUFDRCxTQUFLLGlDQUFpQyxNQUFNO0FBQzNDLGtCQUFZLHNCQUFzQixnQkFBZ0IsR0FBRyxZQUFZO0FBQUEsSUFDbEUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNELFFBQU0sZUFBZSxNQUFNO0FBQzFCLFNBQUssdUNBQXVDLE1BQU07QUFDakQ7QUFBQSxRQUNDLFlBQVksdUNBQXVDLGdCQUFnQixLQUFLO0FBQUEsUUFDeEU7QUFBQSxVQUNDO0FBQUEsWUFDQyxNQUFNO0FBQUEsY0FDTCxPQUFPO0FBQUEsY0FDUCxNQUFNO0FBQUEsWUFDUDtBQUFBLFlBQ0EsUUFBUTtBQUFBLFlBQ1IsUUFBUTtBQUFBLGNBQ1AsS0FBSztBQUFBLGNBQ0wsS0FBSztBQUFBLGNBQ0wsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGdCQUNQLE9BQU87QUFBQSxnQkFDUCxNQUFNO0FBQUEsY0FDUDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLGNBQ0wsT0FBTztBQUFBLGNBQ1AsTUFBTTtBQUFBLFlBQ1A7QUFBQSxZQUNBLFFBQVE7QUFBQSxZQUNSLFFBQVE7QUFBQSxjQUNQLEtBQUs7QUFBQSxjQUNMLEtBQUs7QUFBQSxjQUNMLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxnQkFDUCxPQUFPO0FBQUEsZ0JBQ1AsTUFBTTtBQUFBLGNBQ1A7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU07QUFBQSxjQUNMLE9BQU87QUFBQSxjQUNQLE1BQU07QUFBQSxZQUNQO0FBQUEsWUFDQSxRQUFRO0FBQUEsY0FDUCxPQUFPO0FBQUEsY0FDUCxNQUFNO0FBQUEsWUFDUDtBQUFBLFlBQ0EsUUFBUTtBQUFBLGNBQ1AsS0FBSztBQUFBLGNBQ0wsS0FBSztBQUFBLGNBQ0wsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGdCQUNQLE9BQU87QUFBQSxnQkFDUCxNQUFNO0FBQUEsY0FDUDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHNFQUFzRSxNQUFNO0FBQ2hGO0FBQUEsUUFDQyxZQUFZLG1CQUFtQixnQkFBZ0IsS0FBSztBQUFBLFFBQ3BEO0FBQUEsVUFDQztBQUFBLFlBQ0MsTUFBTTtBQUFBLGNBQ0wsT0FBTztBQUFBLGNBQ1AsTUFBTTtBQUFBLFlBQ1A7QUFBQSxZQUNBLFFBQVE7QUFBQSxZQUNSLFFBQVE7QUFBQSxjQUNQLEtBQUs7QUFBQSxjQUNMLEtBQUs7QUFBQSxjQUNMLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxnQkFDUCxPQUFPO0FBQUEsZ0JBQ1AsTUFBTTtBQUFBLGNBQ1A7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU07QUFBQSxjQUNMLE9BQU87QUFBQSxjQUNQLE1BQU07QUFBQSxZQUNQO0FBQUEsWUFDQSxRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsY0FDUCxLQUFLO0FBQUEsY0FDTCxLQUFLO0FBQUEsY0FDTCxRQUFRO0FBQUEsY0FDUixRQUFRO0FBQUEsY0FDUixRQUFRO0FBQUEsZ0JBQ1AsT0FBTztBQUFBLGdCQUNQLE1BQU07QUFBQSxjQUNQO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssa0NBQWtDLE1BQU07QUFDNUM7QUFBQSxRQUNDLFlBQVksd0JBQXdCLGdCQUFnQixLQUFLO0FBQUEsUUFDekQ7QUFBQSxVQUNDO0FBQUEsWUFDQyxNQUFNO0FBQUEsY0FDTCxPQUFPO0FBQUEsY0FDUCxNQUFNO0FBQUEsWUFDUDtBQUFBLFlBQ0EsUUFBUTtBQUFBLGNBQ1AsT0FBTztBQUFBLGNBQ1AsTUFBTTtBQUFBLFlBQ1A7QUFBQSxZQUNBLFFBQVE7QUFBQSxjQUNQLEtBQUs7QUFBQSxjQUNMLEtBQUs7QUFBQSxjQUNMLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxnQkFDUCxPQUFPO0FBQUEsZ0JBQ1AsTUFBTTtBQUFBLGNBQ1A7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywyRkFBMkYsTUFBTTtBQUNyRztBQUFBLFFBQ0MsWUFBWSwrQkFBaUMsZ0JBQWdCLEtBQUs7QUFBQSxRQUNsRTtBQUFBLFVBQ0M7QUFBQSxZQUNDLE1BQU07QUFBQSxjQUNMLE9BQU87QUFBQSxjQUNQLE1BQU07QUFBQSxZQUNQO0FBQUEsWUFDQSxRQUFRO0FBQUEsY0FDUCxPQUFPO0FBQUEsY0FDUCxNQUFNO0FBQUEsWUFDUDtBQUFBLFlBQ0EsUUFBUTtBQUFBLGNBQ1AsS0FBSztBQUFBLGNBQ0wsS0FBSztBQUFBLGNBQ0wsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGdCQUNQLE9BQU87QUFBQSxnQkFDUCxNQUFNO0FBQUEsY0FDUDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxtRUFBbUUsTUFBTTtBQUM3RTtBQUFBLFFBQ0MsWUFBWSxpRUFBbUUsZ0JBQWdCLE9BQU87QUFBQSxRQUN0RztBQUFBLFVBQ0M7QUFBQSxZQUNDLE1BQU07QUFBQSxjQUNMLE9BQU87QUFBQSxjQUNQLE1BQU07QUFBQSxZQUNQO0FBQUEsWUFDQSxRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsVUFDVDtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU07QUFBQSxjQUNMLE9BQU87QUFBQSxjQUNQLE1BQU07QUFBQSxZQUNQO0FBQUEsWUFDQSxRQUFRO0FBQUEsY0FDUCxPQUFPO0FBQUEsY0FDUCxNQUFNO0FBQUEsWUFDUDtBQUFBLFlBQ0EsUUFBUTtBQUFBLGNBQ1AsS0FBSztBQUFBLGNBQ0wsS0FBSztBQUFBLGNBQ0wsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGdCQUNQLE9BQU87QUFBQSxnQkFDUCxNQUFNO0FBQUEsY0FDUDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLE9BQU8sTUFBTTtBQUNsQixXQUFLLGtEQUFrRCxNQUFNO0FBQzVEO0FBQUEsVUFDQyxZQUFZLG1DQUFtQyxnQkFBZ0IsT0FBTztBQUFBLFVBQ3RFO0FBQUEsWUFDQztBQUFBLGNBQ0MsTUFBTTtBQUFBLGdCQUNMLE9BQU87QUFBQSxnQkFDUCxNQUFNO0FBQUEsY0FDUDtBQUFBLGNBQ0EsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLFlBQ1Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssZ0VBQWdFLE1BQU07QUFDMUU7QUFBQSxVQUNDLFlBQVksdUNBQXVDLGdCQUFnQixPQUFPO0FBQUEsVUFDMUU7QUFBQSxZQUNDO0FBQUEsY0FDQyxNQUFNO0FBQUEsZ0JBQ0wsT0FBTztBQUFBLGdCQUNQLE1BQU07QUFBQSxjQUNQO0FBQUEsY0FDQSxRQUFRO0FBQUEsY0FDUixRQUFRO0FBQUEsZ0JBQ1AsS0FBSztBQUFBLGdCQUNMLEtBQUs7QUFBQSxnQkFDTCxRQUFRO0FBQUEsZ0JBQ1IsUUFBUTtBQUFBLGdCQUNSLFFBQVE7QUFBQSxrQkFDUCxPQUFPO0FBQUEsa0JBQ1AsTUFBTTtBQUFBLGdCQUNQO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFVBQU0sUUFBUSxNQUFNO0FBQ25CLGlCQUFXLE1BQU0sa0JBQWtCO0FBQ2xDLGFBQUsscURBQXFELFFBQVEsRUFBRSxDQUFDLElBQUksTUFBTTtBQUM5RTtBQUFBLFlBQ0MsWUFBWSxJQUFJLFdBQVcsRUFBRSxDQUFDLEtBQUssRUFBRTtBQUFBLFlBQ3JDO0FBQUEsY0FDQztBQUFBLGdCQUNDLE1BQU07QUFBQSxrQkFDTCxPQUFPO0FBQUEsa0JBQ1AsTUFBTSxXQUFXLEVBQUU7QUFBQSxnQkFDcEI7QUFBQSxnQkFDQSxRQUFRO0FBQUEsZ0JBQ1IsUUFBUTtBQUFBLGNBQ1Q7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUNBO0FBQUEsWUFDQyxZQUFZLElBQUksV0FBVyxFQUFFLENBQUMsS0FBSyxFQUFFO0FBQUEsWUFDckM7QUFBQSxjQUNDO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGtCQUNMLE9BQU87QUFBQSxrQkFDUCxNQUFNLFdBQVcsRUFBRTtBQUFBLGdCQUNwQjtBQUFBLGdCQUNBLFFBQVE7QUFBQSxnQkFDUixRQUFRO0FBQUEsY0FDVDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQ0QsYUFBSyxtRUFBbUUsUUFBUSxFQUFFLENBQUMsSUFBSSxNQUFNO0FBQzVGO0FBQUEsWUFDQyxZQUFZLElBQUksV0FBVyxFQUFFLENBQUMsU0FBUyxFQUFFO0FBQUEsWUFDekM7QUFBQSxjQUNDO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGtCQUNMLE9BQU87QUFBQSxrQkFDUCxNQUFNLFdBQVcsRUFBRTtBQUFBLGdCQUNwQjtBQUFBLGdCQUNBLFFBQVE7QUFBQSxnQkFDUixRQUFRO0FBQUEsa0JBQ1AsS0FBSztBQUFBLGtCQUNMLEtBQUs7QUFBQSxrQkFDTCxRQUFRO0FBQUEsa0JBQ1IsUUFBUTtBQUFBLGtCQUNSLFFBQVE7QUFBQSxvQkFDUCxPQUFPLElBQUksV0FBVyxFQUFFLEVBQUU7QUFBQSxvQkFDMUIsTUFBTTtBQUFBLGtCQUNQO0FBQUEsZ0JBQ0Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFDQTtBQUFBLFlBQ0MsWUFBWSxJQUFJLFdBQVcsRUFBRSxDQUFDLFNBQVMsRUFBRTtBQUFBLFlBQ3pDO0FBQUEsY0FDQztBQUFBLGdCQUNDLE1BQU07QUFBQSxrQkFDTCxPQUFPO0FBQUEsa0JBQ1AsTUFBTSxXQUFXLEVBQUU7QUFBQSxnQkFDcEI7QUFBQSxnQkFDQSxRQUFRO0FBQUEsZ0JBQ1IsUUFBUTtBQUFBLGtCQUNQLEtBQUs7QUFBQSxrQkFDTCxLQUFLO0FBQUEsa0JBQ0wsUUFBUTtBQUFBLGtCQUNSLFFBQVE7QUFBQSxrQkFDUixRQUFRO0FBQUEsb0JBQ1AsT0FBTyxJQUFJLFdBQVcsRUFBRSxFQUFFO0FBQUEsb0JBQzFCLE1BQU07QUFBQSxrQkFDUDtBQUFBLGdCQUNEO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0saUJBQWlCLE1BQU07QUFDNUIsaUJBQVcsTUFBTSxrQkFBa0I7QUFDbEMsYUFBSyxnREFBZ0QsUUFBUSxFQUFFLENBQUMsSUFBSSxNQUFNO0FBQ3pFO0FBQUEsWUFDQyxZQUFZLEdBQUcsV0FBVyxFQUFFLENBQUMsUUFBUSxFQUFFO0FBQUEsWUFDdkM7QUFBQSxjQUNDO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGtCQUNMLE9BQU87QUFBQSxrQkFDUCxNQUFNLFdBQVcsRUFBRTtBQUFBLGdCQUNwQjtBQUFBLGdCQUNBLFFBQVE7QUFBQSxnQkFDUixRQUFRO0FBQUEsY0FDVDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQ0E7QUFBQSxZQUNDLFlBQVksR0FBRyxXQUFXLEVBQUUsQ0FBQyxZQUFZLEVBQUU7QUFBQSxZQUMzQztBQUFBLGNBQ0M7QUFBQSxnQkFDQyxNQUFNO0FBQUEsa0JBQ0wsT0FBTztBQUFBLGtCQUNQLE1BQU0sV0FBVyxFQUFFO0FBQUEsZ0JBQ3BCO0FBQUEsZ0JBQ0EsUUFBUTtBQUFBLGdCQUNSLFFBQVE7QUFBQSxjQUNUO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFDRCxhQUFLLHlHQUF5RyxNQUFNO0FBRW5ILHNCQUFZLFlBQVksa0NBQWtDLEVBQUUsRUFBRSxLQUFLLE9BQUssRUFBRSxLQUFLLEtBQUssV0FBVyxHQUFHLENBQUMsR0FBRyxLQUFLO0FBQUEsUUFDNUcsQ0FBQztBQUNELGFBQUssMkdBQTJHLE1BQU07QUFFckgsc0JBQVksWUFBWSxtQ0FBbUMsRUFBRSxFQUFFLEtBQUssT0FBSyxFQUFFLEtBQUssS0FBSyxXQUFXLEdBQUcsQ0FBQyxHQUFHLEtBQUs7QUFBQSxRQUM3RyxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0seUNBQXlDLE1BQU07QUFDcEQsV0FBSyxpQkFBaUIsTUFBTTtBQUMzQixTQUFDLEtBQUssS0FBSyxLQUFLLEtBQUssR0FBRyxFQUFFLFFBQVEsWUFBVTtBQUMzQztBQUFBLFlBQ0MsWUFBWSxPQUFPLE1BQU0sWUFBWSxnQkFBZ0IsS0FBSztBQUFBLFlBQzFEO0FBQUEsY0FDQztBQUFBLGdCQUNDLE1BQU07QUFBQSxrQkFDTCxPQUFPO0FBQUEsa0JBQ1AsTUFBTTtBQUFBLGdCQUNQO0FBQUEsZ0JBQ0EsUUFBUTtBQUFBLGdCQUNSLFFBQVE7QUFBQSxjQUNUO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxXQUFLLGlCQUFpQixNQUFNO0FBQzNCLFNBQUMsS0FBSyxLQUFLLEtBQUssS0FBSyxHQUFHLEVBQUUsUUFBUSxZQUFVO0FBQzNDO0FBQUEsWUFDQyxZQUFZLE9BQU8sTUFBTSxZQUFZLGdCQUFnQixLQUFLO0FBQUEsWUFDMUQ7QUFBQSxjQUNDO0FBQUEsZ0JBQ0MsTUFBTTtBQUFBLGtCQUNMLE9BQU87QUFBQSxrQkFDUCxNQUFNO0FBQUEsZ0JBQ1A7QUFBQSxnQkFDQSxRQUFRO0FBQUEsZ0JBQ1IsUUFBUTtBQUFBLGNBQ1Q7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUNELFdBQUssa0NBQWtDLE1BQU07QUFDNUMsU0FBQyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLGNBQWMsaUJBQWlCLE1BQU07QUFDbkY7QUFBQSxZQUNDLFlBQVksY0FBYyxZQUFZLFlBQVksaUJBQWlCLFlBQVksZ0JBQWdCLEtBQUs7QUFBQSxZQUNwRztBQUFBLGNBQ0M7QUFBQSxnQkFDQyxNQUFNO0FBQUEsa0JBQ0wsT0FBTztBQUFBLGtCQUNQLE1BQU07QUFBQSxnQkFDUDtBQUFBLGdCQUNBLFFBQVE7QUFBQSxnQkFDUixRQUFRO0FBQUEsY0FDVDtBQUFBLGNBQ0E7QUFBQSxnQkFDQyxNQUFNO0FBQUEsa0JBQ0wsT0FBTztBQUFBLGtCQUNQLE1BQU07QUFBQSxnQkFDUDtBQUFBLGdCQUNBLFFBQVE7QUFBQSxnQkFDUixRQUFRO0FBQUEsY0FDVDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQ0QsV0FBSyxnREFBZ0QsTUFBTTtBQUMxRDtBQUFBLFVBQ0M7QUFBQSxZQUNDLFlBQVksaUJBQWlCLGdCQUFnQixLQUFLO0FBQUEsWUFDbEQsWUFBWSxpQkFBaUIsZ0JBQWdCLEtBQUs7QUFBQSxZQUNsRCxZQUFZLGtDQUFrQyxnQkFBZ0IsS0FBSztBQUFBLFVBQ3BFO0FBQUEsVUFDQTtBQUFBLFlBQ0MsQ0FBQztBQUFBLGNBQ0EsTUFBTSxFQUFFLE9BQU8sR0FBRyxNQUFNLFVBQVU7QUFBQSxjQUNsQyxRQUFRO0FBQUEsY0FDUixRQUFRO0FBQUEsWUFDVCxDQUFDO0FBQUEsWUFDRCxDQUFDO0FBQUEsY0FDQSxNQUFNLEVBQUUsT0FBTyxHQUFHLE1BQU0sVUFBVTtBQUFBLGNBQ2xDLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxZQUNULENBQUM7QUFBQSxZQUNELENBQUM7QUFBQSxjQUNBLE1BQU0sRUFBRSxPQUFPLElBQUksTUFBTSxVQUFVO0FBQUEsY0FDbkMsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLFlBQ1QsR0FBRztBQUFBLGNBQ0YsTUFBTSxFQUFFLE9BQU8sSUFBSSxNQUFNLFVBQVU7QUFBQSxjQUNuQyxRQUFRO0FBQUEsY0FDUixRQUFRO0FBQUEsWUFDVCxDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLDREQUE0RCxNQUFNO0FBQ3RFO0FBQUEsVUFDQztBQUFBLFlBQ0MsWUFBWSxpQkFBaUIsZ0JBQWdCLEtBQUs7QUFBQSxZQUNsRCxZQUFZLGlCQUFpQixnQkFBZ0IsS0FBSztBQUFBLFlBQ2xELFlBQVksa0NBQWtDLGdCQUFnQixLQUFLO0FBQUEsVUFDcEU7QUFBQSxVQUNBO0FBQUEsWUFDQyxDQUFDO0FBQUEsY0FDQSxNQUFNLEVBQUUsT0FBTyxHQUFHLE1BQU0sVUFBVTtBQUFBLGNBQ2xDLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxZQUNULENBQUM7QUFBQSxZQUNELENBQUM7QUFBQSxjQUNBLE1BQU0sRUFBRSxPQUFPLEdBQUcsTUFBTSxVQUFVO0FBQUEsY0FDbEMsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLFlBQ1QsQ0FBQztBQUFBLFlBQ0QsQ0FBQztBQUFBLGNBQ0EsTUFBTSxFQUFFLE9BQU8sSUFBSSxNQUFNLFVBQVU7QUFBQSxjQUNuQyxRQUFRO0FBQUEsY0FDUixRQUFRO0FBQUEsWUFDVCxHQUFHO0FBQUEsY0FDRixNQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sVUFBVTtBQUFBLGNBQ25DLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxZQUNULENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssZ0NBQWdDLE1BQU07QUFDMUM7QUFBQSxVQUNDLFlBQVksU0FBUyxnQkFBZ0IsS0FBSztBQUFBLFVBQzFDLENBQUM7QUFBQSxZQUNBLE1BQU0sRUFBRSxPQUFPLEdBQUcsTUFBTSxNQUFNO0FBQUEsWUFDOUIsUUFBUTtBQUFBLFlBQ1IsUUFBUTtBQUFBLGNBQ1AsS0FBSztBQUFBLGNBQ0wsS0FBSztBQUFBLGNBQ0wsUUFBUTtBQUFBLGNBQ1IsUUFBUTtBQUFBLGNBQ1IsUUFBUSxFQUFFLE9BQU8sR0FBRyxNQUFNLEtBQUs7QUFBQSxZQUNoQztBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLCtDQUErQyxNQUFNO0FBQ3pEO0FBQUEsVUFDQyxZQUFZLGFBQWEsZ0JBQWdCLEtBQUs7QUFBQSxVQUM5QyxDQUFDO0FBQUEsWUFDQSxNQUFNLEVBQUUsT0FBTyxHQUFHLE1BQU0sUUFBUTtBQUFBLFlBQ2hDLFFBQVE7QUFBQSxZQUNSLFFBQVE7QUFBQSxVQUNULENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxzREFBc0QsTUFBTTtBQUNoRTtBQUFBLFVBQ0MsWUFBWSx5QkFBeUIsZ0JBQWdCLEtBQUs7QUFBQSxVQUMxRCxDQUFDO0FBQUEsWUFDQSxNQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sU0FBUztBQUFBLFlBQ2xDLFFBQVE7QUFBQSxZQUNSLFFBQVE7QUFBQSxjQUNQLEtBQUs7QUFBQSxjQUNMLEtBQUs7QUFBQSxjQUNMLFFBQVE7QUFBQSxjQUNSLFFBQVE7QUFBQSxjQUNSLFFBQVEsRUFBRSxPQUFPLElBQUksTUFBTSxPQUFPO0FBQUEsWUFDbkM7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxpREFBaUQsTUFBTTtBQUM1RCxlQUFTLElBQUksR0FBRyxJQUFJLG9CQUFvQixTQUFTLEdBQUcsS0FBSztBQUN4RCxjQUFNLFFBQVEsb0JBQW9CLENBQUM7QUFDbkMsY0FBTSxRQUFRLG9CQUFvQixJQUFJLENBQUM7QUFDdkMsY0FBTSxRQUFRLG9CQUFvQixJQUFJLENBQUM7QUFDdkMsY0FBTSxPQUFPLElBQUksTUFBTSxJQUFJLElBQUksTUFBTSxJQUFJLElBQUksTUFBTSxJQUFJO0FBQ3ZELGFBQUssTUFBTSxLQUFLLFdBQVcsUUFBVSxRQUFRLElBQUksS0FBSyxNQUFNO0FBQzNELHNCQUFZLFlBQVksTUFBTSxnQkFBZ0IsS0FBSyxFQUFFLFFBQVEsQ0FBQztBQUM5RCxhQUFHLE1BQU0sTUFBTTtBQUNmLGFBQUcsTUFBTSxNQUFNO0FBQ2YsYUFBRyxNQUFNLE1BQU07QUFDZixnQkFBTSxnQkFBNkI7QUFBQSxZQUNsQyxRQUFRLE1BQU0sU0FBUztBQUFBLGNBQ3RCLE9BQU87QUFBQSxjQUNQLE1BQU0sTUFBTTtBQUFBLFlBQ2IsSUFBSTtBQUFBLFlBQ0osTUFBTTtBQUFBLGNBQ0wsT0FBTyxLQUFLLE1BQU0sUUFBUSxVQUFVO0FBQUEsY0FDcEMsTUFBTSxNQUFNLEtBQUssUUFBUSxNQUFNLFFBQVEsRUFBRSxFQUFFLFFBQVEsTUFBTSxVQUFVLElBQUksRUFBRTtBQUFBLFlBQzFFO0FBQUEsWUFDQSxRQUFRO0FBQUEsY0FDUCxLQUFLLE1BQU0sU0FBUyxVQUFVO0FBQUEsY0FDOUIsS0FBSyxNQUFNLFNBQVMsVUFBVTtBQUFBLGNBQzlCLFFBQVEsTUFBTSxZQUFZLGFBQWE7QUFBQSxjQUN2QyxRQUFRLE1BQU0sWUFBWSxhQUFhO0FBQUEsY0FDdkMsUUFBUTtBQUFBLGdCQUNQLE9BQU8sS0FBSyxNQUFNLEtBQUssU0FBUyxNQUFNLE9BQU87QUFBQSxnQkFDN0MsTUFBTSxNQUFNO0FBQUEsY0FDYjtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQ0EsZ0JBQU0sZ0JBQTZCO0FBQUEsWUFDbEMsUUFBUSxNQUFNLFNBQVM7QUFBQSxjQUN0QixRQUFRLGNBQWMsUUFBUSxTQUFTLGNBQWMsS0FBSyxTQUFTLE1BQU0sS0FBSyxTQUFTO0FBQUEsY0FDdkYsTUFBTSxNQUFNO0FBQUEsWUFDYixJQUFJO0FBQUEsWUFDSixNQUFNO0FBQUEsY0FDTCxRQUFRLGNBQWMsUUFBUSxTQUFTLGNBQWMsS0FBSyxTQUFTLE1BQU0sS0FBSyxTQUFTLEtBQUssTUFBTSxVQUFVLElBQUk7QUFBQSxjQUNoSCxNQUFNLE1BQU0sS0FBSyxRQUFRLE1BQU0sUUFBUSxFQUFFLEVBQUUsUUFBUSxNQUFNLFVBQVUsSUFBSSxFQUFFO0FBQUEsWUFDMUU7QUFBQSxZQUNBLFFBQVE7QUFBQSxjQUNQLEtBQUssTUFBTSxTQUFTLFVBQVU7QUFBQSxjQUM5QixLQUFLLE1BQU0sU0FBUyxVQUFVO0FBQUEsY0FDOUIsUUFBUSxNQUFNLFlBQVksYUFBYTtBQUFBLGNBQ3ZDLFFBQVEsTUFBTSxZQUFZLGFBQWE7QUFBQSxjQUN2QyxRQUFRO0FBQUEsZ0JBQ1AsUUFBUSxjQUFjLFFBQVEsU0FBUyxjQUFjLEtBQUssU0FBUyxNQUFNLEtBQUssU0FBUyxLQUFLLE1BQU0sS0FBSyxTQUFTLE1BQU0sT0FBTztBQUFBLGdCQUM3SCxNQUFNLE1BQU07QUFBQSxjQUNiO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxnQkFBNkI7QUFBQSxZQUNsQyxRQUFRLE1BQU0sU0FBUztBQUFBLGNBQ3RCLFFBQVEsY0FBYyxRQUFRLFNBQVMsY0FBYyxLQUFLLFNBQVMsTUFBTSxLQUFLLFNBQVM7QUFBQSxjQUN2RixNQUFNLE1BQU07QUFBQSxZQUNiLElBQUk7QUFBQSxZQUNKLE1BQU07QUFBQSxjQUNMLFFBQVEsY0FBYyxRQUFRLFNBQVMsY0FBYyxLQUFLLFNBQVMsTUFBTSxLQUFLLFNBQVMsS0FBSyxNQUFNLFVBQVUsSUFBSTtBQUFBLGNBQ2hILE1BQU0sTUFBTSxLQUFLLFFBQVEsTUFBTSxRQUFRLEVBQUUsRUFBRSxRQUFRLE1BQU0sVUFBVSxJQUFJLEVBQUU7QUFBQSxZQUMxRTtBQUFBLFlBQ0EsUUFBUTtBQUFBLGNBQ1AsS0FBSyxNQUFNLFNBQVMsVUFBVTtBQUFBLGNBQzlCLEtBQUssTUFBTSxTQUFTLFVBQVU7QUFBQSxjQUM5QixRQUFRLE1BQU0sWUFBWSxhQUFhO0FBQUEsY0FDdkMsUUFBUSxNQUFNLFlBQVksYUFBYTtBQUFBLGNBQ3ZDLFFBQVE7QUFBQSxnQkFDUCxRQUFRLGNBQWMsUUFBUSxTQUFTLGNBQWMsS0FBSyxTQUFTLE1BQU0sS0FBSyxTQUFTLEtBQUssTUFBTSxLQUFLLFNBQVMsTUFBTSxPQUFPO0FBQUEsZ0JBQzdILE1BQU0sTUFBTTtBQUFBLGNBQ2I7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUNBO0FBQUEsWUFDQyxZQUFZLE1BQU0sZ0JBQWdCLEtBQUs7QUFBQSxZQUN2QyxDQUFDLGVBQWUsZUFBZSxhQUFhO0FBQUEsVUFDN0M7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSw4RUFBOEUsTUFBTTtBQUN6RjtBQUFBLFFBQ0MsWUFBWSxTQUFTLGdCQUFnQixLQUFLO0FBQUEsUUFDMUMsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
