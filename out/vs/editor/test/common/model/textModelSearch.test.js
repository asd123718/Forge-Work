import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { getMapForWordSeparators } from "../../../common/core/wordCharacterClassifier.js";
import { USUAL_WORD_SEPARATORS } from "../../../common/core/wordHelper.js";
import { EndOfLineSequence, FindMatch, SearchData } from "../../../common/model.js";
import { SearchParams, TextModelSearch, isMultilineRegexSource } from "../../../common/model/textModelSearch.js";
import { createTextModel } from "../testTextModel.js";
suite("TextModelSearch", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const usualWordSeparators = getMapForWordSeparators(USUAL_WORD_SEPARATORS, []);
  function assertFindMatch(actual, expectedRange, expectedMatches = null) {
    assert.deepStrictEqual(actual, new FindMatch(expectedRange, expectedMatches));
  }
  function _assertFindMatches(model, searchParams, expectedMatches) {
    const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), false, 1e3);
    assert.deepStrictEqual(actual, expectedMatches, "findMatches OK");
    let startPos = new Position(1, 1);
    let match = TextModelSearch.findNextMatch(model, searchParams, startPos, false);
    assert.deepStrictEqual(match, expectedMatches[0], `findNextMatch ${startPos}`);
    for (const expectedMatch of expectedMatches) {
      startPos = expectedMatch.range.getStartPosition();
      match = TextModelSearch.findNextMatch(model, searchParams, startPos, false);
      assert.deepStrictEqual(match, expectedMatch, `findNextMatch ${startPos}`);
    }
    startPos = new Position(model.getLineCount(), model.getLineMaxColumn(model.getLineCount()));
    match = TextModelSearch.findPreviousMatch(model, searchParams, startPos, false);
    assert.deepStrictEqual(match, expectedMatches[expectedMatches.length - 1], `findPrevMatch ${startPos}`);
    for (const expectedMatch of expectedMatches) {
      startPos = expectedMatch.range.getEndPosition();
      match = TextModelSearch.findPreviousMatch(model, searchParams, startPos, false);
      assert.deepStrictEqual(match, expectedMatch, `findPrevMatch ${startPos}`);
    }
  }
  function assertFindMatches(text, searchString, isRegex, matchCase, wordSeparators, _expected) {
    const expectedRanges = _expected.map((entry) => new Range(entry[0], entry[1], entry[2], entry[3]));
    const expectedMatches = expectedRanges.map((entry) => new FindMatch(entry, null));
    const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
    const model = createTextModel(text);
    _assertFindMatches(model, searchParams, expectedMatches);
    model.dispose();
    const model2 = createTextModel(text);
    model2.setEOL(EndOfLineSequence.CRLF);
    _assertFindMatches(model2, searchParams, expectedMatches);
    model2.dispose();
  }
  const regularText = [
    "This is some foo - bar text which contains foo and bar - as in Barcelona.",
    "Now it begins a word fooBar and now it is caps Foo-isn't this great?",
    "And here's a dull line with nothing interesting in it",
    "It is also interesting if it's part of a word like amazingFooBar",
    "Again nothing interesting here"
  ];
  test("Simple find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "foo",
      false,
      false,
      null,
      [
        [1, 14, 1, 17],
        [1, 44, 1, 47],
        [2, 22, 2, 25],
        [2, 48, 2, 51],
        [4, 59, 4, 62]
      ]
    );
  });
  test("Case sensitive find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "foo",
      false,
      true,
      null,
      [
        [1, 14, 1, 17],
        [1, 44, 1, 47],
        [2, 22, 2, 25]
      ]
    );
  });
  test("Whole words find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "foo",
      false,
      false,
      USUAL_WORD_SEPARATORS,
      [
        [1, 14, 1, 17],
        [1, 44, 1, 47],
        [2, 48, 2, 51]
      ]
    );
  });
  test("/^/ find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "^",
      true,
      false,
      null,
      [
        [1, 1, 1, 1],
        [2, 1, 2, 1],
        [3, 1, 3, 1],
        [4, 1, 4, 1],
        [5, 1, 5, 1]
      ]
    );
  });
  test("/$/ find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "$",
      true,
      false,
      null,
      [
        [1, 74, 1, 74],
        [2, 69, 2, 69],
        [3, 54, 3, 54],
        [4, 65, 4, 65],
        [5, 31, 5, 31]
      ]
    );
  });
  test("/.*/ find", () => {
    assertFindMatches(
      regularText.join("\n"),
      ".*",
      true,
      false,
      null,
      [
        [1, 1, 1, 74],
        [2, 1, 2, 69],
        [3, 1, 3, 54],
        [4, 1, 4, 65],
        [5, 1, 5, 31]
      ]
    );
  });
  test("/^$/ find", () => {
    assertFindMatches(
      [
        "This is some foo - bar text which contains foo and bar - as in Barcelona.",
        "",
        "And here's a dull line with nothing interesting in it",
        "",
        "Again nothing interesting here"
      ].join("\n"),
      "^$",
      true,
      false,
      null,
      [
        [2, 1, 2, 1],
        [4, 1, 4, 1]
      ]
    );
  });
  test("multiline find 1", () => {
    assertFindMatches(
      [
        "Just some text text",
        "Just some text text",
        "some text again",
        "again some text"
      ].join("\n"),
      "text\\n",
      true,
      false,
      null,
      [
        [1, 16, 2, 1],
        [2, 16, 3, 1]
      ]
    );
  });
  test("multiline find 2", () => {
    assertFindMatches(
      [
        "Just some text text",
        "Just some text text",
        "some text again",
        "again some text"
      ].join("\n"),
      "text\\nJust",
      true,
      false,
      null,
      [
        [1, 16, 2, 5]
      ]
    );
  });
  test("multiline find 3", () => {
    assertFindMatches(
      [
        "Just some text text",
        "Just some text text",
        "some text again",
        "again some text"
      ].join("\n"),
      "\\nagain",
      true,
      false,
      null,
      [
        [3, 16, 4, 6]
      ]
    );
  });
  test("multiline find 4", () => {
    assertFindMatches(
      [
        "Just some text text",
        "Just some text text",
        "some text again",
        "again some text"
      ].join("\n"),
      ".*\\nJust.*\\n",
      true,
      false,
      null,
      [
        [1, 1, 3, 1]
      ]
    );
  });
  test("multiline find with line beginning regex", () => {
    assertFindMatches(
      [
        "if",
        "else",
        "",
        "if",
        "else"
      ].join("\n"),
      "^if\\nelse",
      true,
      false,
      null,
      [
        [1, 1, 2, 5],
        [4, 1, 5, 5]
      ]
    );
  });
  test("matching empty lines using boundary expression", () => {
    assertFindMatches(
      [
        "if",
        "",
        "else",
        "  ",
        "if",
        " ",
        "else"
      ].join("\n"),
      "^\\s*$\\n",
      true,
      false,
      null,
      [
        [2, 1, 3, 1],
        [4, 1, 5, 1],
        [6, 1, 7, 1]
      ]
    );
  });
  test("matching lines starting with A and ending with B", () => {
    assertFindMatches(
      [
        "a if b",
        "a",
        "ab",
        "eb"
      ].join("\n"),
      "^a.*b$",
      true,
      false,
      null,
      [
        [1, 1, 1, 7],
        [3, 1, 3, 3]
      ]
    );
  });
  test("multiline find with line ending regex", () => {
    assertFindMatches(
      [
        "if",
        "else",
        "",
        "if",
        "elseif",
        "else"
      ].join("\n"),
      "if\\nelse$",
      true,
      false,
      null,
      [
        [1, 1, 2, 5],
        [5, 5, 6, 5]
      ]
    );
  });
  test("issue #4836 - ^.*$", () => {
    assertFindMatches(
      [
        "Just some text text",
        "",
        "some text again",
        "",
        "again some text"
      ].join("\n"),
      "^.*$",
      true,
      false,
      null,
      [
        [1, 1, 1, 20],
        [2, 1, 2, 1],
        [3, 1, 3, 16],
        [4, 1, 4, 1],
        [5, 1, 5, 16]
      ]
    );
  });
  test("multiline find for non-regex string", () => {
    assertFindMatches(
      [
        "Just some text text",
        "some text text",
        "some text again",
        "again some text",
        "but not some"
      ].join("\n"),
      "text\nsome",
      false,
      false,
      null,
      [
        [1, 16, 2, 5],
        [2, 11, 3, 5]
      ]
    );
  });
  test("issue #3623: Match whole word does not work for not latin characters", () => {
    assertFindMatches(
      [
        "\u044F",
        "\u043A\u043E\u043C\u043F\u0438\u043B\u044F\u0442\u043E\u0440",
        "\u043E\u0431\u0444\u0443\u0441\u043A\u0430\u0446\u0438\u044F",
        ":\u044F-\u044F"
      ].join("\n"),
      "\u044F",
      false,
      false,
      USUAL_WORD_SEPARATORS,
      [
        [1, 1, 1, 2],
        [4, 2, 4, 3],
        [4, 4, 4, 5]
      ]
    );
  });
  test("issue #27459: Match whole words regression", () => {
    assertFindMatches(
      [
        "this._register(this._textAreaInput.onKeyDown((e: IKeyboardEvent) => {",
        "	this._viewController.emitKeyDown(e);",
        "}));"
      ].join("\n"),
      "((e: ",
      false,
      false,
      USUAL_WORD_SEPARATORS,
      [
        [1, 45, 1, 50]
      ]
    );
  });
  test("issue #27594: Search results disappear", () => {
    assertFindMatches(
      [
        "this.server.listen(0);"
      ].join("\n"),
      "listen(",
      false,
      false,
      USUAL_WORD_SEPARATORS,
      [
        [1, 13, 1, 20]
      ]
    );
  });
  test("findNextMatch without regex", () => {
    const model = createTextModel("line line one\nline two\nthree");
    const searchParams = new SearchParams("line", false, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 6, 1, 10));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
    assertFindMatch(actual, new Range(1, 6, 1, 10));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    model.dispose();
  });
  test("findNextMatch with beginning boundary regex", () => {
    const model = createTextModel("line one\nline two\nthree");
    const searchParams = new SearchParams("^line", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    model.dispose();
  });
  test("findNextMatch with beginning boundary regex and line has repetitive beginnings", () => {
    const model = createTextModel("line line one\nline two\nthree");
    const searchParams = new SearchParams("^line", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    model.dispose();
  });
  test("findNextMatch with beginning boundary multiline regex and line has repetitive beginnings", () => {
    const model = createTextModel("line line one\nline two\nline three\nline four");
    const searchParams = new SearchParams("^line.*\\nline", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(3, 1, 4, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(2, 1), false);
    assertFindMatch(actual, new Range(2, 1, 3, 5));
    model.dispose();
  });
  test("findNextMatch with ending boundary regex", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("line$", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 10, 1, 14));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 4), false);
    assertFindMatch(actual, new Range(1, 10, 1, 14));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(2, 5, 2, 9));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 10, 1, 14));
    model.dispose();
  });
  test("findMatches with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)", true, false, null);
    const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
    assert.deepStrictEqual(actual, [
      new FindMatch(new Range(1, 5, 1, 9), ["line", "line", "in"]),
      new FindMatch(new Range(1, 10, 1, 14), ["line", "line", "in"]),
      new FindMatch(new Range(2, 5, 2, 9), ["line", "line", "in"])
    ]);
    model.dispose();
  });
  test("findMatches multiline with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)\\n", true, false, null);
    const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
    assert.deepStrictEqual(actual, [
      new FindMatch(new Range(1, 10, 2, 1), ["line\n", "line", "in"]),
      new FindMatch(new Range(2, 5, 3, 1), ["line\n", "line", "in"])
    ]);
    model.dispose();
  });
  test("findNextMatch with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)", true, false, null);
    const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    assertFindMatch(actual, new Range(1, 5, 1, 9), ["line", "line", "in"]);
    model.dispose();
  });
  test("findNextMatch multiline with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)\\n", true, false, null);
    const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    assertFindMatch(actual, new Range(1, 10, 2, 1), ["line\n", "line", "in"]);
    model.dispose();
  });
  test("findPreviousMatch with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)", true, false, null);
    const actual = TextModelSearch.findPreviousMatch(model, searchParams, new Position(1, 1), true);
    assertFindMatch(actual, new Range(2, 5, 2, 9), ["line", "line", "in"]);
    model.dispose();
  });
  test("findPreviousMatch multiline with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)\\n", true, false, null);
    const actual = TextModelSearch.findPreviousMatch(model, searchParams, new Position(1, 1), true);
    assertFindMatch(actual, new Range(2, 5, 3, 1), ["line\n", "line", "in"]);
    model.dispose();
  });
  test("\\n matches \\r\\n", () => {
    const model = createTextModel("a\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng\r\nh\r\ni");
    assert.strictEqual(model.getEOL(), "\r\n");
    let searchParams = new SearchParams("h\\n", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1e3)[0];
    assertFindMatch(actual, new Range(8, 1, 9, 1), ["h\n"]);
    searchParams = new SearchParams("g\\nh\\n", true, false, null);
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1e3)[0];
    assertFindMatch(actual, new Range(7, 1, 9, 1), ["g\nh\n"]);
    searchParams = new SearchParams("\\ni", true, false, null);
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1e3)[0];
    assertFindMatch(actual, new Range(8, 2, 9, 2), ["\ni"]);
    model.dispose();
  });
  test("\\r can never be found", () => {
    const model = createTextModel("a\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng\r\nh\r\ni");
    assert.strictEqual(model.getEOL(), "\r\n");
    const searchParams = new SearchParams("\\r\\n", true, false, null);
    const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    assert.strictEqual(actual, null);
    assert.deepStrictEqual(TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1e3), []);
    model.dispose();
  });
  function assertParseSearchResult(searchString, isRegex, matchCase, wordSeparators, expected) {
    const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
    const actual = searchParams.parseSearchRequest();
    if (expected === null) {
      assert.ok(actual === null);
    } else {
      assert.deepStrictEqual(actual.regex, expected.regex);
      assert.deepStrictEqual(actual.simpleSearch, expected.simpleSearch);
      if (wordSeparators) {
        assert.ok(actual.wordSeparators !== null);
      } else {
        assert.ok(actual.wordSeparators === null);
      }
    }
  }
  test("parseSearchRequest invalid", () => {
    assertParseSearchResult("", true, true, USUAL_WORD_SEPARATORS, null);
    assertParseSearchResult("(", true, false, null, null);
  });
  test("parseSearchRequest non regex", () => {
    assertParseSearchResult("foo", false, false, null, new SearchData(/foo/giu, null, null));
    assertParseSearchResult("foo", false, false, USUAL_WORD_SEPARATORS, new SearchData(/foo/giu, usualWordSeparators, null));
    assertParseSearchResult("foo", false, true, null, new SearchData(/foo/gu, null, "foo"));
    assertParseSearchResult("foo", false, true, USUAL_WORD_SEPARATORS, new SearchData(/foo/gu, usualWordSeparators, "foo"));
    assertParseSearchResult("foo\\n", false, false, null, new SearchData(/foo\\n/giu, null, null));
    assertParseSearchResult("foo\\\\n", false, false, null, new SearchData(/foo\\\\n/giu, null, null));
    assertParseSearchResult("foo\\r", false, false, null, new SearchData(/foo\\r/giu, null, null));
    assertParseSearchResult("foo\\\\r", false, false, null, new SearchData(/foo\\\\r/giu, null, null));
  });
  test("parseSearchRequest regex", () => {
    assertParseSearchResult("foo", true, false, null, new SearchData(/foo/giu, null, null));
    assertParseSearchResult("foo", true, false, USUAL_WORD_SEPARATORS, new SearchData(/foo/giu, usualWordSeparators, null));
    assertParseSearchResult("foo", true, true, null, new SearchData(/foo/gu, null, null));
    assertParseSearchResult("foo", true, true, USUAL_WORD_SEPARATORS, new SearchData(/foo/gu, usualWordSeparators, null));
    assertParseSearchResult("foo\\n", true, false, null, new SearchData(/foo\n/gimu, null, null));
    assertParseSearchResult("foo\\\\n", true, false, null, new SearchData(/foo\\n/giu, null, null));
    assertParseSearchResult("foo\\r", true, false, null, new SearchData(/foo\r/gimu, null, null));
    assertParseSearchResult("foo\\\\r", true, false, null, new SearchData(/foo\\r/giu, null, null));
  });
  test("issue #53415. W should match line break.", () => {
    assertFindMatches(
      [
        "text",
        "180702-",
        "180703-180704"
      ].join("\n"),
      "\\d{6}-\\W",
      true,
      false,
      null,
      [
        [2, 1, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just some text",
        "",
        "Just"
      ].join("\n"),
      "\\W",
      true,
      false,
      null,
      [
        [1, 5, 1, 6],
        [1, 10, 1, 11],
        [1, 15, 2, 1],
        [2, 1, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just some text",
        "",
        "Just"
      ].join("\r\n"),
      "\\W",
      true,
      false,
      null,
      [
        [1, 5, 1, 6],
        [1, 10, 1, 11],
        [1, 15, 2, 1],
        [2, 1, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just some text",
        "	Just",
        "Just"
      ].join("\n"),
      "\\W",
      true,
      false,
      null,
      [
        [1, 5, 1, 6],
        [1, 10, 1, 11],
        [1, 15, 2, 1],
        [2, 1, 2, 2],
        [2, 6, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just  some text",
        "",
        "Just"
      ].join("\n"),
      "\\W{2}",
      true,
      false,
      null,
      [
        [1, 5, 1, 7],
        [1, 16, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just  some text",
        "",
        "Just"
      ].join("\r\n"),
      "\\W{2}",
      true,
      false,
      null,
      [
        [1, 5, 1, 7],
        [1, 16, 3, 1]
      ]
    );
  });
  test("Simple find using unicode escape sequences", () => {
    assertFindMatches(
      regularText.join("\n"),
      "\\u{0066}\\u006f\\u006F",
      true,
      false,
      null,
      [
        [1, 14, 1, 17],
        [1, 44, 1, 47],
        [2, 22, 2, 25],
        [2, 48, 2, 51],
        [4, 59, 4, 62]
      ]
    );
  });
  test("isMultilineRegexSource", () => {
    assert(!isMultilineRegexSource("foo"));
    assert(!isMultilineRegexSource(""));
    assert(!isMultilineRegexSource("foo\\sbar"));
    assert(!isMultilineRegexSource("\\\\notnewline"));
    assert(isMultilineRegexSource("foo\\nbar"));
    assert(isMultilineRegexSource("foo\\nbar\\s"));
    assert(isMultilineRegexSource("foo\\r\\n"));
    assert(isMultilineRegexSource("\\n"));
    assert(isMultilineRegexSource("foo\\W"));
    assert(isMultilineRegexSource("foo\n"));
    assert(isMultilineRegexSource("foo\r\n"));
  });
  test("isMultilineRegexSource correctly identifies multiline patterns", () => {
    const singleLinePatterns = [
      "MARK:\\s*(?<label>.*)$",
      "^// Header$",
      "\\s*[-=]+\\s*"
    ];
    const multiLinePatterns = [
      "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$",
      "header\\r\\nfooter",
      "start\\r|\\nend",
      "top\nmiddle\r\nbottom"
    ];
    for (const pattern of singleLinePatterns) {
      assert.strictEqual(isMultilineRegexSource(pattern), false, `Pattern should not be multiline: ${pattern}`);
    }
    for (const pattern of multiLinePatterns) {
      assert.strictEqual(isMultilineRegexSource(pattern), true, `Pattern should be multiline: ${pattern}`);
    }
  });
  test("issue #74715. \\d* finds empty string and stops searching.", () => {
    const model = createTextModel("10.243.30.10");
    const searchParams = new SearchParams("\\d*", true, false, null);
    const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
    assert.deepStrictEqual(actual, [
      new FindMatch(new Range(1, 1, 1, 3), ["10"]),
      new FindMatch(new Range(1, 3, 1, 3), [""]),
      new FindMatch(new Range(1, 4, 1, 7), ["243"]),
      new FindMatch(new Range(1, 7, 1, 7), [""]),
      new FindMatch(new Range(1, 8, 1, 10), ["30"]),
      new FindMatch(new Range(1, 10, 1, 10), [""]),
      new FindMatch(new Range(1, 11, 1, 13), ["10"])
    ]);
    model.dispose();
  });
  test("issue #100134. Zero-length matches should properly step over surrogate pairs", () => {
    assertFindMatches(
      "1\u{1F4BB}1",
      "()",
      true,
      false,
      null,
      [
        [1, 1, 1, 1],
        [1, 2, 1, 2],
        [1, 4, 1, 4],
        [1, 5, 1, 5]
      ]
    );
    assertFindMatches(
      "1\u{1F431}\u200D\u{1F4BB}1",
      "()",
      true,
      false,
      null,
      [
        [1, 1, 1, 1],
        [1, 2, 1, 2],
        [1, 4, 1, 4],
        [1, 5, 1, 5],
        [1, 7, 1, 7],
        [1, 8, 1, 8]
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXHRleHRNb2RlbFNlYXJjaC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS93b3JkQ2hhcmFjdGVyQ2xhc3NpZmllci5qcyc7XG5pbXBvcnQgeyBVU1VBTF9XT1JEX1NFUEFSQVRPUlMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVNlcXVlbmNlLCBGaW5kTWF0Y2gsIFNlYXJjaERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hQYXJhbXMsIFRleHRNb2RlbFNlYXJjaCwgaXNNdWx0aWxpbmVSZWdleFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWxTZWFyY2guanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5cbi8vIC0tLS0tLS0tLSBGaW5kXG5zdWl0ZSgnVGV4dE1vZGVsU2VhcmNoJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHVzdWFsV29yZFNlcGFyYXRvcnMgPSBnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycyhVU1VBTF9XT1JEX1NFUEFSQVRPUlMsIFtdKTtcblxuXHRmdW5jdGlvbiBhc3NlcnRGaW5kTWF0Y2goYWN0dWFsOiBGaW5kTWF0Y2ggfCBudWxsLCBleHBlY3RlZFJhbmdlOiBSYW5nZSwgZXhwZWN0ZWRNYXRjaGVzOiBzdHJpbmdbXSB8IG51bGwgPSBudWxsKTogdm9pZCB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIG5ldyBGaW5kTWF0Y2goZXhwZWN0ZWRSYW5nZSwgZXhwZWN0ZWRNYXRjaGVzKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBfYXNzZXJ0RmluZE1hdGNoZXMobW9kZWw6IFRleHRNb2RlbCwgc2VhcmNoUGFyYW1zOiBTZWFyY2hQYXJhbXMsIGV4cGVjdGVkTWF0Y2hlczogRmluZE1hdGNoW10pOiB2b2lkIHtcblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgZmFsc2UsIDEwMDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZE1hdGNoZXMsICdmaW5kTWF0Y2hlcyBPSycpO1xuXG5cdFx0Ly8gdGVzdCBgZmluZE5leHRNYXRjaGBcblx0XHRsZXQgc3RhcnRQb3MgPSBuZXcgUG9zaXRpb24oMSwgMSk7XG5cdFx0bGV0IG1hdGNoID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgc3RhcnRQb3MsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hdGNoLCBleHBlY3RlZE1hdGNoZXNbMF0sIGBmaW5kTmV4dE1hdGNoICR7c3RhcnRQb3N9YCk7XG5cdFx0Zm9yIChjb25zdCBleHBlY3RlZE1hdGNoIG9mIGV4cGVjdGVkTWF0Y2hlcykge1xuXHRcdFx0c3RhcnRQb3MgPSBleHBlY3RlZE1hdGNoLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdG1hdGNoID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgc3RhcnRQb3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWF0Y2gsIGV4cGVjdGVkTWF0Y2gsIGBmaW5kTmV4dE1hdGNoICR7c3RhcnRQb3N9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gdGVzdCBgZmluZFByZXZNYXRjaGBcblx0XHRzdGFydFBvcyA9IG5ldyBQb3NpdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbC5nZXRMaW5lQ291bnQoKSkpO1xuXHRcdG1hdGNoID0gVGV4dE1vZGVsU2VhcmNoLmZpbmRQcmV2aW91c01hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIHN0YXJ0UG9zLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXRjaCwgZXhwZWN0ZWRNYXRjaGVzW2V4cGVjdGVkTWF0Y2hlcy5sZW5ndGggLSAxXSwgYGZpbmRQcmV2TWF0Y2ggJHtzdGFydFBvc31gKTtcblx0XHRmb3IgKGNvbnN0IGV4cGVjdGVkTWF0Y2ggb2YgZXhwZWN0ZWRNYXRjaGVzKSB7XG5cdFx0XHRzdGFydFBvcyA9IGV4cGVjdGVkTWF0Y2gucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRcdG1hdGNoID0gVGV4dE1vZGVsU2VhcmNoLmZpbmRQcmV2aW91c01hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIHN0YXJ0UG9zLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hdGNoLCBleHBlY3RlZE1hdGNoLCBgZmluZFByZXZNYXRjaCAke3N0YXJ0UG9zfWApO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydEZpbmRNYXRjaGVzKHRleHQ6IHN0cmluZywgc2VhcmNoU3RyaW5nOiBzdHJpbmcsIGlzUmVnZXg6IGJvb2xlYW4sIG1hdGNoQ2FzZTogYm9vbGVhbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZyB8IG51bGwsIF9leHBlY3RlZDogW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl1bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4cGVjdGVkUmFuZ2VzID0gX2V4cGVjdGVkLm1hcChlbnRyeSA9PiBuZXcgUmFuZ2UoZW50cnlbMF0sIGVudHJ5WzFdLCBlbnRyeVsyXSwgZW50cnlbM10pKTtcblx0XHRjb25zdCBleHBlY3RlZE1hdGNoZXMgPSBleHBlY3RlZFJhbmdlcy5tYXAoZW50cnkgPT4gbmV3IEZpbmRNYXRjaChlbnRyeSwgbnVsbCkpO1xuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoc2VhcmNoU3RyaW5nLCBpc1JlZ2V4LCBtYXRjaENhc2UsIHdvcmRTZXBhcmF0b3JzKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKHRleHQpO1xuXHRcdF9hc3NlcnRGaW5kTWF0Y2hlcyhtb2RlbCwgc2VhcmNoUGFyYW1zLCBleHBlY3RlZE1hdGNoZXMpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblxuXG5cdFx0Y29uc3QgbW9kZWwyID0gY3JlYXRlVGV4dE1vZGVsKHRleHQpO1xuXHRcdG1vZGVsMi5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cdFx0X2Fzc2VydEZpbmRNYXRjaGVzKG1vZGVsMiwgc2VhcmNoUGFyYW1zLCBleHBlY3RlZE1hdGNoZXMpO1xuXHRcdG1vZGVsMi5kaXNwb3NlKCk7XG5cdH1cblxuXHRjb25zdCByZWd1bGFyVGV4dCA9IFtcblx0XHQnVGhpcyBpcyBzb21lIGZvbyAtIGJhciB0ZXh0IHdoaWNoIGNvbnRhaW5zIGZvbyBhbmQgYmFyIC0gYXMgaW4gQmFyY2Vsb25hLicsXG5cdFx0J05vdyBpdCBiZWdpbnMgYSB3b3JkIGZvb0JhciBhbmQgbm93IGl0IGlzIGNhcHMgRm9vLWlzblxcJ3QgdGhpcyBncmVhdD8nLFxuXHRcdCdBbmQgaGVyZVxcJ3MgYSBkdWxsIGxpbmUgd2l0aCBub3RoaW5nIGludGVyZXN0aW5nIGluIGl0Jyxcblx0XHQnSXQgaXMgYWxzbyBpbnRlcmVzdGluZyBpZiBpdFxcJ3MgcGFydCBvZiBhIHdvcmQgbGlrZSBhbWF6aW5nRm9vQmFyJyxcblx0XHQnQWdhaW4gbm90aGluZyBpbnRlcmVzdGluZyBoZXJlJ1xuXHRdO1xuXG5cdHRlc3QoJ1NpbXBsZSBmaW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0cmVndWxhclRleHQuam9pbignXFxuJyksXG5cdFx0XHQnZm9vJywgZmFsc2UsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMTQsIDEsIDE3XSxcblx0XHRcdFx0WzEsIDQ0LCAxLCA0N10sXG5cdFx0XHRcdFsyLCAyMiwgMiwgMjVdLFxuXHRcdFx0XHRbMiwgNDgsIDIsIDUxXSxcblx0XHRcdFx0WzQsIDU5LCA0LCA2Ml1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDYXNlIHNlbnNpdGl2ZSBmaW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0cmVndWxhclRleHQuam9pbignXFxuJyksXG5cdFx0XHQnZm9vJywgZmFsc2UsIHRydWUsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxNCwgMSwgMTddLFxuXHRcdFx0XHRbMSwgNDQsIDEsIDQ3XSxcblx0XHRcdFx0WzIsIDIyLCAyLCAyNV1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdXaG9sZSB3b3JkcyBmaW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0cmVndWxhclRleHQuam9pbignXFxuJyksXG5cdFx0XHQnZm9vJywgZmFsc2UsIGZhbHNlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxNCwgMSwgMTddLFxuXHRcdFx0XHRbMSwgNDQsIDEsIDQ3XSxcblx0XHRcdFx0WzIsIDQ4LCAyLCA1MV1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCcvXi8gZmluZCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdHJlZ3VsYXJUZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0J14nLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0XHRbMiwgMSwgMiwgMV0sXG5cdFx0XHRcdFszLCAxLCAzLCAxXSxcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbNSwgMSwgNSwgMV1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCcvJC8gZmluZCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdHJlZ3VsYXJUZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0JyQnLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDc0LCAxLCA3NF0sXG5cdFx0XHRcdFsyLCA2OSwgMiwgNjldLFxuXHRcdFx0XHRbMywgNTQsIDMsIDU0XSxcblx0XHRcdFx0WzQsIDY1LCA0LCA2NV0sXG5cdFx0XHRcdFs1LCAzMSwgNSwgMzFdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnLy4qLyBmaW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0cmVndWxhclRleHQuam9pbignXFxuJyksXG5cdFx0XHQnLionLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDc0XSxcblx0XHRcdFx0WzIsIDEsIDIsIDY5XSxcblx0XHRcdFx0WzMsIDEsIDMsIDU0XSxcblx0XHRcdFx0WzQsIDEsIDQsIDY1XSxcblx0XHRcdFx0WzUsIDEsIDUsIDMxXVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJy9eJC8gZmluZCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgc29tZSBmb28gLSBiYXIgdGV4dCB3aGljaCBjb250YWlucyBmb28gYW5kIGJhciAtIGFzIGluIEJhcmNlbG9uYS4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0FuZCBoZXJlXFwncyBhIGR1bGwgbGluZSB3aXRoIG5vdGhpbmcgaW50ZXJlc3RpbmcgaW4gaXQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0FnYWluIG5vdGhpbmcgaW50ZXJlc3RpbmcgaGVyZSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnXiQnLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzIsIDEsIDIsIDFdLFxuXHRcdFx0XHRbNCwgMSwgNCwgMV1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aWxpbmUgZmluZCAxJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCdKdXN0IHNvbWUgdGV4dCB0ZXh0Jyxcblx0XHRcdFx0J3NvbWUgdGV4dCBhZ2FpbicsXG5cdFx0XHRcdCdhZ2FpbiBzb21lIHRleHQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J3RleHRcXFxcbicsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMTYsIDIsIDFdLFxuXHRcdFx0XHRbMiwgMTYsIDMsIDFdLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpbGluZSBmaW5kIDInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdKdXN0IHNvbWUgdGV4dCB0ZXh0Jyxcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0IHRleHQnLFxuXHRcdFx0XHQnc29tZSB0ZXh0IGFnYWluJyxcblx0XHRcdFx0J2FnYWluIHNvbWUgdGV4dCdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQndGV4dFxcXFxuSnVzdCcsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMTYsIDIsIDVdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlsaW5lIGZpbmQgMycsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0IHRleHQnLFxuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCdzb21lIHRleHQgYWdhaW4nLFxuXHRcdFx0XHQnYWdhaW4gc29tZSB0ZXh0J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCdcXFxcbmFnYWluJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFszLCAxNiwgNCwgNl1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aWxpbmUgZmluZCA0JywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCdKdXN0IHNvbWUgdGV4dCB0ZXh0Jyxcblx0XHRcdFx0J3NvbWUgdGV4dCBhZ2FpbicsXG5cdFx0XHRcdCdhZ2FpbiBzb21lIHRleHQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0Jy4qXFxcXG5KdXN0LipcXFxcbicsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMywgMV1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aWxpbmUgZmluZCB3aXRoIGxpbmUgYmVnaW5uaW5nIHJlZ2V4JywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnaWYnLFxuXHRcdFx0XHQnZWxzZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnaWYnLFxuXHRcdFx0XHQnZWxzZSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnXmlmXFxcXG5lbHNlJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAyLCA1XSxcblx0XHRcdFx0WzQsIDEsIDUsIDVdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hpbmcgZW1wdHkgbGluZXMgdXNpbmcgYm91bmRhcnkgZXhwcmVzc2lvbicsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J2lmJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdlbHNlJyxcblx0XHRcdFx0JyAgJyxcblx0XHRcdFx0J2lmJyxcblx0XHRcdFx0JyAnLFxuXHRcdFx0XHQnZWxzZSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnXlxcXFxzKiRcXFxcbicsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMiwgMSwgMywgMV0sXG5cdFx0XHRcdFs0LCAxLCA1LCAxXSxcblx0XHRcdFx0WzYsIDEsIDcsIDFdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hpbmcgbGluZXMgc3RhcnRpbmcgd2l0aCBBIGFuZCBlbmRpbmcgd2l0aCBCJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnYSBpZiBiJyxcblx0XHRcdFx0J2EnLFxuXHRcdFx0XHQnYWInLFxuXHRcdFx0XHQnZWInXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J15hLipiJCcsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMSwgN10sXG5cdFx0XHRcdFszLCAxLCAzLCAzXVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpbGluZSBmaW5kIHdpdGggbGluZSBlbmRpbmcgcmVnZXgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdpZicsXG5cdFx0XHRcdCdlbHNlJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdpZicsXG5cdFx0XHRcdCdlbHNlaWYnLFxuXHRcdFx0XHQnZWxzZSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnaWZcXFxcbmVsc2UkJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAyLCA1XSxcblx0XHRcdFx0WzUsIDUsIDYsIDVdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ4MzYgLSBeLiokJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnc29tZSB0ZXh0IGFnYWluJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdhZ2FpbiBzb21lIHRleHQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J14uKiQnLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDIwXSxcblx0XHRcdFx0WzIsIDEsIDIsIDFdLFxuXHRcdFx0XHRbMywgMSwgMywgMTZdLFxuXHRcdFx0XHRbNCwgMSwgNCwgMV0sXG5cdFx0XHRcdFs1LCAxLCA1LCAxNl0sXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlsaW5lIGZpbmQgZm9yIG5vbi1yZWdleCBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdKdXN0IHNvbWUgdGV4dCB0ZXh0Jyxcblx0XHRcdFx0J3NvbWUgdGV4dCB0ZXh0Jyxcblx0XHRcdFx0J3NvbWUgdGV4dCBhZ2FpbicsXG5cdFx0XHRcdCdhZ2FpbiBzb21lIHRleHQnLFxuXHRcdFx0XHQnYnV0IG5vdCBzb21lJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCd0ZXh0XFxuc29tZScsIGZhbHNlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDE2LCAyLCA1XSxcblx0XHRcdFx0WzIsIDExLCAzLCA1XSxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzYyMzogTWF0Y2ggd2hvbGUgd29yZCBkb2VzIG5vdCB3b3JrIGZvciBub3QgbGF0aW4gY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J1x1MDQ0RicsXG5cdFx0XHRcdCdcdTA0M0FcdTA0M0VcdTA0M0NcdTA0M0ZcdTA0MzhcdTA0M0JcdTA0NEZcdTA0NDJcdTA0M0VcdTA0NDAnLFxuXHRcdFx0XHQnXHUwNDNFXHUwNDMxXHUwNDQ0XHUwNDQzXHUwNDQxXHUwNDNBXHUwNDMwXHUwNDQ2XHUwNDM4XHUwNDRGJyxcblx0XHRcdFx0JzpcdTA0NEYtXHUwNDRGJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCdcdTA0NEYnLCBmYWxzZSwgZmFsc2UsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUyxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDJdLFxuXHRcdFx0XHRbNCwgMiwgNCwgM10sXG5cdFx0XHRcdFs0LCA0LCA0LCA1XSxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjc0NTk6IE1hdGNoIHdob2xlIHdvcmRzIHJlZ3Jlc3Npb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCd0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYUlucHV0Lm9uS2V5RG93bigoZTogSUtleWJvYXJkRXZlbnQpID0+IHsnLFxuXHRcdFx0XHQnXHR0aGlzLl92aWV3Q29udHJvbGxlci5lbWl0S2V5RG93bihlKTsnLFxuXHRcdFx0XHQnfSkpOycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0JygoZTogJywgZmFsc2UsIGZhbHNlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCA0NSwgMSwgNTBdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI3NTk0OiBTZWFyY2ggcmVzdWx0cyBkaXNhcHBlYXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCd0aGlzLnNlcnZlci5saXN0ZW4oMCk7Jyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnbGlzdGVuKCcsIGZhbHNlLCBmYWxzZSwgVVNVQUxfV09SRF9TRVBBUkFUT1JTLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMTMsIDEsIDIwXVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmROZXh0TWF0Y2ggd2l0aG91dCByZWdleCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnbGluZSBsaW5lIG9uZVxcbmxpbmUgdHdvXFxudGhyZWUnKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJ2xpbmUnLCBmYWxzZSwgZmFsc2UsIG51bGwpO1xuXG5cdFx0bGV0IGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAxKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxLCAxLCA1KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBhY3R1YWwhLnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTApKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAzKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCA2LCAxLCAxMCkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgYWN0dWFsIS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDIsIDEsIDIsIDUpKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIGFjdHVhbCEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxLCAxLCA1KSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmROZXh0TWF0Y2ggd2l0aCBiZWdpbm5pbmcgYm91bmRhcnkgcmVnZXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d29cXG50aHJlZScpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnXmxpbmUnLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRsZXQgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEsIDEsIDUpKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIGFjdHVhbCEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgyLCAxLCAyLCA1KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMyksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMiwgMSwgMiwgNSkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgYWN0dWFsIS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEsIDEsIDUpKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZE5leHRNYXRjaCB3aXRoIGJlZ2lubmluZyBib3VuZGFyeSByZWdleCBhbmQgbGluZSBoYXMgcmVwZXRpdGl2ZSBiZWdpbm5pbmdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdsaW5lIGxpbmUgb25lXFxubGluZSB0d29cXG50aHJlZScpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnXmxpbmUnLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRsZXQgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEsIDEsIDUpKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIGFjdHVhbCEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgyLCAxLCAyLCA1KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMyksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMiwgMSwgMiwgNSkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgYWN0dWFsIS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEsIDEsIDUpKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZE5leHRNYXRjaCB3aXRoIGJlZ2lubmluZyBib3VuZGFyeSBtdWx0aWxpbmUgcmVnZXggYW5kIGxpbmUgaGFzIHJlcGV0aXRpdmUgYmVnaW5uaW5ncycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnbGluZSBsaW5lIG9uZVxcbmxpbmUgdHdvXFxubGluZSB0aHJlZVxcbmxpbmUgZm91cicpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnXmxpbmUuKlxcXFxubGluZScsIHRydWUsIGZhbHNlLCBudWxsKTtcblxuXHRcdGxldCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMSksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMSwgMSwgMiwgNSkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgYWN0dWFsIS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDMsIDEsIDQsIDUpKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigyLCAxKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgyLCAxLCAzLCA1KSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmROZXh0TWF0Y2ggd2l0aCBlbmRpbmcgYm91bmRhcnkgcmVnZXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ29uZSBsaW5lIGxpbmVcXG50d28gbGluZVxcbnRocmVlJyk7XG5cblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCdsaW5lJCcsIHRydWUsIGZhbHNlLCBudWxsKTtcblxuXHRcdGxldCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMSksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE0KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgNCksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE0KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBhY3R1YWwhLnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMiwgNSwgMiwgOSkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgYWN0dWFsIS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEwLCAxLCAxNCkpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTWF0Y2hlcyB3aXRoIGNhcHR1cmluZyBtYXRjaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdvbmUgbGluZSBsaW5lXFxudHdvIGxpbmVcXG50aHJlZScpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnKGwoaW4pZSknLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdHJ1ZSwgMTAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgNSwgMSwgOSksIFsnbGluZScsICdsaW5lJywgJ2luJ10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgMTAsIDEsIDE0KSwgWydsaW5lJywgJ2xpbmUnLCAnaW4nXSksXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgyLCA1LCAyLCA5KSwgWydsaW5lJywgJ2xpbmUnLCAnaW4nXSksXG5cdFx0XSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRNYXRjaGVzIG11bHRpbGluZSB3aXRoIGNhcHR1cmluZyBtYXRjaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdvbmUgbGluZSBsaW5lXFxudHdvIGxpbmVcXG50aHJlZScpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnKGwoaW4pZSlcXFxcbicsIHRydWUsIGZhbHNlLCBudWxsKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTWF0Y2hlcyhtb2RlbCwgc2VhcmNoUGFyYW1zLCBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB0cnVlLCAxMDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgxLCAxMCwgMiwgMSksIFsnbGluZVxcbicsICdsaW5lJywgJ2luJ10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMiwgNSwgMywgMSksIFsnbGluZVxcbicsICdsaW5lJywgJ2luJ10pLFxuXHRcdF0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTmV4dE1hdGNoIHdpdGggY2FwdHVyaW5nIG1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ29uZSBsaW5lIGxpbmVcXG50d28gbGluZVxcbnRocmVlJyk7XG5cblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCcobChpbillKScsIHRydWUsIGZhbHNlLCBudWxsKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDUsIDEsIDkpLCBbJ2xpbmUnLCAnbGluZScsICdpbiddKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZE5leHRNYXRjaCBtdWx0aWxpbmUgd2l0aCBjYXB0dXJpbmcgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnb25lIGxpbmUgbGluZVxcbnR3byBsaW5lXFxudGhyZWUnKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJyhsKGluKWUpXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMSksIHRydWUpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxMCwgMiwgMSksIFsnbGluZVxcbicsICdsaW5lJywgJ2luJ10pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUHJldmlvdXNNYXRjaCB3aXRoIGNhcHR1cmluZyBtYXRjaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdvbmUgbGluZSBsaW5lXFxudHdvIGxpbmVcXG50aHJlZScpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnKGwoaW4pZSknLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZFByZXZpb3VzTWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCB0cnVlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMiwgNSwgMiwgOSksIFsnbGluZScsICdsaW5lJywgJ2luJ10pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUHJldmlvdXNNYXRjaCBtdWx0aWxpbmUgd2l0aCBjYXB0dXJpbmcgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnb25lIGxpbmUgbGluZVxcbnR3byBsaW5lXFxudGhyZWUnKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJyhsKGluKWUpXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZFByZXZpb3VzTWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCB0cnVlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMiwgNSwgMywgMSksIFsnbGluZVxcbicsICdsaW5lJywgJ2luJ10pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdcXFxcbiBtYXRjaGVzIFxcXFxyXFxcXG4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FcXHJcXG5iXFxyXFxuY1xcclxcbmRcXHJcXG5lXFxyXFxuZlxcclxcbmdcXHJcXG5oXFxyXFxuaScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEVPTCgpLCAnXFxyXFxuJyk7XG5cblx0XHRsZXQgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnaFxcXFxuJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXHRcdGxldCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMSksIHRydWUpO1xuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTWF0Y2hlcyhtb2RlbCwgc2VhcmNoUGFyYW1zLCBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB0cnVlLCAxMDAwKVswXTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoOCwgMSwgOSwgMSksIFsnaFxcbiddKTtcblxuXHRcdHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJ2dcXFxcbmhcXFxcbicsIHRydWUsIGZhbHNlLCBudWxsKTtcblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMSksIHRydWUpO1xuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTWF0Y2hlcyhtb2RlbCwgc2VhcmNoUGFyYW1zLCBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB0cnVlLCAxMDAwKVswXTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoNywgMSwgOSwgMSksIFsnZ1xcbmhcXG4nXSk7XG5cblx0XHRzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCdcXFxcbmknLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCB0cnVlKTtcblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdHJ1ZSwgMTAwMClbMF07XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDgsIDIsIDksIDIpLCBbJ1xcbmknXSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1xcXFxyIGNhbiBuZXZlciBiZSBmb3VuZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnYVxcclxcbmJcXHJcXG5jXFxyXFxuZFxcclxcbmVcXHJcXG5mXFxyXFxuZ1xcclxcbmhcXHJcXG5pJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0RU9MKCksICdcXHJcXG4nKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJ1xcXFxyXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFRleHRNb2RlbFNlYXJjaC5maW5kTWF0Y2hlcyhtb2RlbCwgc2VhcmNoUGFyYW1zLCBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB0cnVlLCAxMDAwKSwgW10pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdChzZWFyY2hTdHJpbmc6IHN0cmluZywgaXNSZWdleDogYm9vbGVhbiwgbWF0Y2hDYXNlOiBib29sZWFuLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nIHwgbnVsbCwgZXhwZWN0ZWQ6IFNlYXJjaERhdGEgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcyhzZWFyY2hTdHJpbmcsIGlzUmVnZXgsIG1hdGNoQ2FzZSwgd29yZFNlcGFyYXRvcnMpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHNlYXJjaFBhcmFtcy5wYXJzZVNlYXJjaFJlcXVlc3QoKTtcblxuXHRcdGlmIChleHBlY3RlZCA9PT0gbnVsbCkge1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdHVhbCA9PT0gbnVsbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsIS5yZWdleCwgZXhwZWN0ZWQucmVnZXgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwhLnNpbXBsZVNlYXJjaCwgZXhwZWN0ZWQuc2ltcGxlU2VhcmNoKTtcblx0XHRcdGlmICh3b3JkU2VwYXJhdG9ycykge1xuXHRcdFx0XHRhc3NlcnQub2soYWN0dWFsIS53b3JkU2VwYXJhdG9ycyAhPT0gbnVsbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQub2soYWN0dWFsIS53b3JkU2VwYXJhdG9ycyA9PT0gbnVsbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgncGFyc2VTZWFyY2hSZXF1ZXN0IGludmFsaWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJycsIHRydWUsIHRydWUsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUywgbnVsbCk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJygnLCB0cnVlLCBmYWxzZSwgbnVsbCwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlU2VhcmNoUmVxdWVzdCBub24gcmVnZXgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2ZvbycsIGZhbHNlLCBmYWxzZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvby9naXUsIG51bGwsIG51bGwpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vJywgZmFsc2UsIGZhbHNlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsIG5ldyBTZWFyY2hEYXRhKC9mb28vZ2l1LCB1c3VhbFdvcmRTZXBhcmF0b3JzLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2ZvbycsIGZhbHNlLCB0cnVlLCBudWxsLCBuZXcgU2VhcmNoRGF0YSgvZm9vL2d1LCBudWxsLCAnZm9vJykpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb28nLCBmYWxzZSwgdHJ1ZSwgVVNVQUxfV09SRF9TRVBBUkFUT1JTLCBuZXcgU2VhcmNoRGF0YSgvZm9vL2d1LCB1c3VhbFdvcmRTZXBhcmF0b3JzLCAnZm9vJykpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb29cXFxcbicsIGZhbHNlLCBmYWxzZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvb1xcXFxuL2dpdSwgbnVsbCwgbnVsbCkpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb29cXFxcXFxcXG4nLCBmYWxzZSwgZmFsc2UsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb29cXFxcXFxcXG4vZ2l1LCBudWxsLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2Zvb1xcXFxyJywgZmFsc2UsIGZhbHNlLCBudWxsLCBuZXcgU2VhcmNoRGF0YSgvZm9vXFxcXHIvZ2l1LCBudWxsLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2Zvb1xcXFxcXFxccicsIGZhbHNlLCBmYWxzZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvb1xcXFxcXFxcci9naXUsIG51bGwsIG51bGwpKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VTZWFyY2hSZXF1ZXN0IHJlZ2V4JywgKCkgPT4ge1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb28nLCB0cnVlLCBmYWxzZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvby9naXUsIG51bGwsIG51bGwpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vJywgdHJ1ZSwgZmFsc2UsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUywgbmV3IFNlYXJjaERhdGEoL2Zvby9naXUsIHVzdWFsV29yZFNlcGFyYXRvcnMsIG51bGwpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vJywgdHJ1ZSwgdHJ1ZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvby9ndSwgbnVsbCwgbnVsbCkpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb28nLCB0cnVlLCB0cnVlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsIG5ldyBTZWFyY2hEYXRhKC9mb28vZ3UsIHVzdWFsV29yZFNlcGFyYXRvcnMsIG51bGwpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvb1xcbi9naW11LCBudWxsLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2Zvb1xcXFxcXFxcbicsIHRydWUsIGZhbHNlLCBudWxsLCBuZXcgU2VhcmNoRGF0YSgvZm9vXFxcXG4vZ2l1LCBudWxsLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2Zvb1xcXFxyJywgdHJ1ZSwgZmFsc2UsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb29cXHIvZ2ltdSwgbnVsbCwgbnVsbCkpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb29cXFxcXFxcXHInLCB0cnVlLCBmYWxzZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvb1xcXFxyL2dpdSwgbnVsbCwgbnVsbCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTM0MTUuIFxcVyBzaG91bGQgbWF0Y2ggbGluZSBicmVhay4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCd0ZXh0Jyxcblx0XHRcdFx0JzE4MDcwMi0nLFxuXHRcdFx0XHQnMTgwNzAzLTE4MDcwNCdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnXFxcXGR7Nn0tXFxcXFcnLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzIsIDEsIDMsIDFdXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0p1c3QnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J1xcXFxXJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCA1LCAxLCA2XSxcblx0XHRcdFx0WzEsIDEwLCAxLCAxMV0sXG5cdFx0XHRcdFsxLCAxNSwgMiwgMV0sXG5cdFx0XHRcdFsyLCAxLCAzLCAxXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHQvLyBMaW5lIGJyZWFrIGRvZXNuJ3QgYWZmZWN0IHRoZSByZXN1bHQgYXMgd2UgYWx3YXlzIHVzZSBcXG4gYXMgbGluZSBicmVhayB3aGVuIGRvaW5nIHNlYXJjaFxuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0p1c3QnXG5cdFx0XHRdLmpvaW4oJ1xcclxcbicpLFxuXHRcdFx0J1xcXFxXJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCA1LCAxLCA2XSxcblx0XHRcdFx0WzEsIDEwLCAxLCAxMV0sXG5cdFx0XHRcdFsxLCAxNSwgMiwgMV0sXG5cdFx0XHRcdFsyLCAxLCAzLCAxXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0Jyxcblx0XHRcdFx0J1xcdEp1c3QnLFxuXHRcdFx0XHQnSnVzdCdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnXFxcXFcnLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDUsIDEsIDZdLFxuXHRcdFx0XHRbMSwgMTAsIDEsIDExXSxcblx0XHRcdFx0WzEsIDE1LCAyLCAxXSxcblx0XHRcdFx0WzIsIDEsIDIsIDJdLFxuXHRcdFx0XHRbMiwgNiwgMywgMV0sXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdC8vIGxpbmUgYnJlYWsgaXMgc2VlbiBhcyBvbmUgbm9uLXdvcmQgY2hhcmFjdGVyXG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdKdXN0ICBzb21lIHRleHQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0p1c3QnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J1xcXFxXezJ9JywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCA1LCAxLCA3XSxcblx0XHRcdFx0WzEsIDE2LCAzLCAxXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHQvLyBldmVuIGlmIGl0J3MgXFxyXFxuXG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdKdXN0ICBzb21lIHRleHQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0p1c3QnXG5cdFx0XHRdLmpvaW4oJ1xcclxcbicpLFxuXHRcdFx0J1xcXFxXezJ9JywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCA1LCAxLCA3XSxcblx0XHRcdFx0WzEsIDE2LCAzLCAxXVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NpbXBsZSBmaW5kIHVzaW5nIHVuaWNvZGUgZXNjYXBlIHNlcXVlbmNlcycsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdHJlZ3VsYXJUZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0J1xcXFx1ezAwNjZ9XFxcXHUwMDZmXFxcXHUwMDZGJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxNCwgMSwgMTddLFxuXHRcdFx0XHRbMSwgNDQsIDEsIDQ3XSxcblx0XHRcdFx0WzIsIDIyLCAyLCAyNV0sXG5cdFx0XHRcdFsyLCA0OCwgMiwgNTFdLFxuXHRcdFx0XHRbNCwgNTksIDQsIDYyXVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzTXVsdGlsaW5lUmVnZXhTb3VyY2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCFpc011bHRpbGluZVJlZ2V4U291cmNlKCdmb28nKSk7XG5cdFx0YXNzZXJ0KCFpc011bHRpbGluZVJlZ2V4U291cmNlKCcnKSk7XG5cdFx0YXNzZXJ0KCFpc011bHRpbGluZVJlZ2V4U291cmNlKCdmb29cXFxcc2JhcicpKTtcblx0XHRhc3NlcnQoIWlzTXVsdGlsaW5lUmVnZXhTb3VyY2UoJ1xcXFxcXFxcbm90bmV3bGluZScpKTtcblxuXHRcdGFzc2VydChpc011bHRpbGluZVJlZ2V4U291cmNlKCdmb29cXFxcbmJhcicpKTtcblx0XHRhc3NlcnQoaXNNdWx0aWxpbmVSZWdleFNvdXJjZSgnZm9vXFxcXG5iYXJcXFxccycpKTtcblx0XHRhc3NlcnQoaXNNdWx0aWxpbmVSZWdleFNvdXJjZSgnZm9vXFxcXHJcXFxcbicpKTtcblx0XHRhc3NlcnQoaXNNdWx0aWxpbmVSZWdleFNvdXJjZSgnXFxcXG4nKSk7XG5cdFx0YXNzZXJ0KGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UoJ2Zvb1xcXFxXJykpO1xuXHRcdGFzc2VydChpc011bHRpbGluZVJlZ2V4U291cmNlKCdmb29cXG4nKSk7XG5cdFx0YXNzZXJ0KGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UoJ2Zvb1xcclxcbicpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNNdWx0aWxpbmVSZWdleFNvdXJjZSBjb3JyZWN0bHkgaWRlbnRpZmllcyBtdWx0aWxpbmUgcGF0dGVybnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2luZ2xlTGluZVBhdHRlcm5zID0gW1xuXHRcdFx0J01BUks6XFxcXHMqKD88bGFiZWw+LiopJCcsXG5cdFx0XHQnXi8vIEhlYWRlciQnLFxuXHRcdFx0J1xcXFxzKlstPV0rXFxcXHMqJyxcblx0XHRdO1xuXG5cdFx0Y29uc3QgbXVsdGlMaW5lUGF0dGVybnMgPSBbXG5cdFx0XHQnXlxcL1xcLyA9K1xcXFxuXlxcL1xcLyAoPzxsYWJlbD5bXlxcXFxuXSs/KVxcXFxuXlxcL1xcLyA9KyQnLFxuXHRcdFx0J2hlYWRlclxcXFxyXFxcXG5mb290ZXInLFxuXHRcdFx0J3N0YXJ0XFxcXHJ8XFxcXG5lbmQnLFxuXHRcdFx0J3RvcFxcbm1pZGRsZVxcclxcbmJvdHRvbSdcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHNpbmdsZUxpbmVQYXR0ZXJucykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UocGF0dGVybiksIGZhbHNlLCBgUGF0dGVybiBzaG91bGQgbm90IGJlIG11bHRpbGluZTogJHtwYXR0ZXJufWApO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBtdWx0aUxpbmVQYXR0ZXJucykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UocGF0dGVybiksIHRydWUsIGBQYXR0ZXJuIHNob3VsZCBiZSBtdWx0aWxpbmU6ICR7cGF0dGVybn1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3NDcxNS4gXFxcXGQqIGZpbmRzIGVtcHR5IHN0cmluZyBhbmQgc3RvcHMgc2VhcmNoaW5nLicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnMTAuMjQzLjMwLjEwJyk7XG5cblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCdcXFxcZConLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdHJ1ZSwgMTAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgMSwgMSwgMyksIFsnMTAnXSksXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgWycnXSksXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgWycyNDMnXSksXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgxLCA3LCAxLCA3KSwgWycnXSksXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgxLCA4LCAxLCAxMCksIFsnMzAnXSksXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgxLCAxMCwgMSwgMTApLCBbJyddKSxcblx0XHRcdG5ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKDEsIDExLCAxLCAxMyksIFsnMTAnXSlcblx0XHRdKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEwMDEzNC4gWmVyby1sZW5ndGggbWF0Y2hlcyBzaG91bGQgcHJvcGVybHkgc3RlcCBvdmVyIHN1cnJvZ2F0ZSBwYWlycycsICgpID0+IHtcblx0XHQvLyAxW0xhcHRvcF0xIC0gdGhlcmUgc2hvdWQgYmUgbm8gbWF0Y2hlcyBpbnNpZGUgb2YgW0xhcHRvcF0gZW1vamlcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcygnMVxcdUQ4M0RcXHVEQ0JCMScsICcoKScsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRcdFsxLCAyLCAxLCAyXSxcblx0XHRcdFx0WzEsIDQsIDEsIDRdLFxuXHRcdFx0XHRbMSwgNSwgMSwgNV0sXG5cblx0XHRcdF1cblx0XHQpO1xuXHRcdC8vIDFbSGFja2VyIENhdF0xID0gMVtDYXQgRmFjZV1bWldKXVtMYXB0b3BdMSAtIHRoZXJlIHNob3VkIGJlIG1hdGNoZXMgYmV0d2VlbiBlbW9qaSBhbmQgWldKXG5cdFx0Ly8gdGhlcmUgc2hvdWQgYmUgbm8gbWF0Y2hlcyBpbnNpZGUgb2YgW0NhdCBGYWNlXSBhbmQgW0xhcHRvcF0gZW1vamlcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcygnMVxcdUQ4M0RcXHVEQzMxXFx1MjAwRFxcdUQ4M0RcXHVEQ0JCMScsICcoKScsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMSwgMV0sXG5cdFx0XHRcdFsxLCAyLCAxLCAyXSxcblx0XHRcdFx0WzEsIDQsIDEsIDRdLFxuXHRcdFx0XHRbMSwgNSwgMSwgNV0sXG5cdFx0XHRcdFsxLCA3LCAxLCA3XSxcblx0XHRcdFx0WzEsIDgsIDEsIDhdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUIsV0FBVyxrQkFBa0I7QUFFekQsU0FBUyxjQUFjLGlCQUFpQiw4QkFBOEI7QUFDdEUsU0FBUyx1QkFBdUI7QUFHaEMsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QiwwQ0FBd0M7QUFFeEMsUUFBTSxzQkFBc0Isd0JBQXdCLHVCQUF1QixDQUFDLENBQUM7QUFFN0UsV0FBUyxnQkFBZ0IsUUFBMEIsZUFBc0Isa0JBQW1DLE1BQVk7QUFDdkgsV0FBTyxnQkFBZ0Is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R0FBRyxHQUFHLENBQUM7QUFBQSxNQUNaO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQ7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNYO0FBQUEsTUFBYTtBQUFBLE1BQU07QUFBQSxNQUFPO0FBQUEsTUFDMUI7QUFBQSxRQUNDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDWCxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNaO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQ7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNYO0FBQUEsTUFBVTtBQUFBLE1BQU07QUFBQSxNQUFPO0FBQUEsTUFDdkI7QUFBQSxRQUNDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlDQUF5QyxNQUFNO0FBQ25EO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNYO0FBQUEsTUFBYztBQUFBLE1BQU07QUFBQSxNQUFPO0FBQUEsTUFDM0I7QUFBQSxRQUNDLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWjtBQUFBLElBQ0Q7QUFB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
