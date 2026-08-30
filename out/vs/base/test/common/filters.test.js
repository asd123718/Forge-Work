import assert from "assert";
import { anyScore, createMatches, fuzzyScore, fuzzyScoreGraceful, fuzzyScoreGracefulAggressive, matchesBaseContiguousSubString, matchesCamelCase, matchesContiguousSubString, matchesPrefix, matchesStrictPrefix, matchesSubString, matchesWords, or } from "../../common/filters.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function filterOk(filter, word, wordToMatchAgainst, highlights) {
  const r = filter(word, wordToMatchAgainst);
  assert(r, `${word} didn't match ${wordToMatchAgainst}`);
  if (highlights) {
    assert.deepStrictEqual(r, highlights);
  }
}
function filterNotOk(filter, word, wordToMatchAgainst) {
  assert(!filter(word, wordToMatchAgainst), `${word} matched ${wordToMatchAgainst}`);
}
suite("Filters", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("or", () => {
    let filter;
    let counters;
    const newFilter = function(i, r) {
      return function() {
        counters[i]++;
        return r;
      };
    };
    counters = [0, 0];
    filter = or(newFilter(0, false), newFilter(1, false));
    filterNotOk(filter, "anything", "anything");
    assert.deepStrictEqual(counters, [1, 1]);
    counters = [0, 0];
    filter = or(newFilter(0, true), newFilter(1, false));
    filterOk(filter, "anything", "anything");
    assert.deepStrictEqual(counters, [1, 0]);
    counters = [0, 0];
    filter = or(newFilter(0, true), newFilter(1, true));
    filterOk(filter, "anything", "anything");
    assert.deepStrictEqual(counters, [1, 0]);
    counters = [0, 0];
    filter = or(newFilter(0, false), newFilter(1, true));
    filterOk(filter, "anything", "anything");
    assert.deepStrictEqual(counters, [1, 1]);
  });
  test("PrefixFilter - case sensitive", function() {
    filterNotOk(matchesStrictPrefix, "", "");
    filterOk(matchesStrictPrefix, "", "anything", []);
    filterOk(matchesStrictPrefix, "alpha", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesStrictPrefix, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
    filterNotOk(matchesStrictPrefix, "alpha", "alp");
    filterOk(matchesStrictPrefix, "a", "alpha", [{ start: 0, end: 1 }]);
    filterNotOk(matchesStrictPrefix, "x", "alpha");
    filterNotOk(matchesStrictPrefix, "A", "alpha");
    filterNotOk(matchesStrictPrefix, "AlPh", "alPHA");
  });
  test("PrefixFilter - ignore case", function() {
    filterOk(matchesPrefix, "alpha", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesPrefix, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
    filterNotOk(matchesPrefix, "alpha", "alp");
    filterOk(matchesPrefix, "a", "alpha", [{ start: 0, end: 1 }]);
    filterOk(matchesPrefix, "\xE4", "\xC4lpha", [{ start: 0, end: 1 }]);
    filterNotOk(matchesPrefix, "x", "alpha");
    filterOk(matchesPrefix, "A", "alpha", [{ start: 0, end: 1 }]);
    filterOk(matchesPrefix, "AlPh", "alPHA", [{ start: 0, end: 4 }]);
    filterNotOk(matchesPrefix, "T", "4");
  });
  test("CamelCaseFilter", () => {
    filterNotOk(matchesCamelCase, "", "");
    filterOk(matchesCamelCase, "", "anything", []);
    filterOk(matchesCamelCase, "alpha", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesCamelCase, "AlPhA", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesCamelCase, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
    filterNotOk(matchesCamelCase, "alpha", "alp");
    filterOk(matchesCamelCase, "c", "CamelCaseRocks", [
      { start: 0, end: 1 }
    ]);
    filterOk(matchesCamelCase, "cc", "CamelCaseRocks", [
      { start: 0, end: 1 },
      { start: 5, end: 6 }
    ]);
    filterOk(matchesCamelCase, "ccr", "CamelCaseRocks", [
      { start: 0, end: 1 },
      { start: 5, end: 6 },
      { start: 9, end: 10 }
    ]);
    filterOk(matchesCamelCase, "cacr", "CamelCaseRocks", [
      { start: 0, end: 2 },
      { start: 5, end: 6 },
      { start: 9, end: 10 }
    ]);
    filterOk(matchesCamelCase, "cacar", "CamelCaseRocks", [
      { start: 0, end: 2 },
      { start: 5, end: 7 },
      { start: 9, end: 10 }
    ]);
    filterOk(matchesCamelCase, "ccarocks", "CamelCaseRocks", [
      { start: 0, end: 1 },
      { start: 5, end: 7 },
      { start: 9, end: 14 }
    ]);
    filterOk(matchesCamelCase, "cr", "CamelCaseRocks", [
      { start: 0, end: 1 },
      { start: 9, end: 10 }
    ]);
    filterOk(matchesCamelCase, "fba", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 5 }
    ]);
    filterOk(matchesCamelCase, "fbar", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 6 }
    ]);
    filterOk(matchesCamelCase, "fbara", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 7 }
    ]);
    filterOk(matchesCamelCase, "fbaa", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 5 },
      { start: 6, end: 7 }
    ]);
    filterOk(matchesCamelCase, "fbaab", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 5 },
      { start: 6, end: 8 }
    ]);
    filterOk(matchesCamelCase, "c2d", "canvasCreation2D", [
      { start: 0, end: 1 },
      { start: 14, end: 16 }
    ]);
    filterOk(matchesCamelCase, "cce", "_canvasCreationEvent", [
      { start: 1, end: 2 },
      { start: 7, end: 8 },
      { start: 15, end: 16 }
    ]);
  });
  test("CamelCaseFilter - #19256", function() {
    assert(matchesCamelCase("Debug Console", "Open: Debug Console"));
    assert(matchesCamelCase("Debug console", "Open: Debug Console"));
    assert(matchesCamelCase("debug console", "Open: Debug Console"));
  });
  test("matchesContiguousSubString", () => {
    filterOk(matchesContiguousSubString, "cela", "cancelAnimationFrame()", [
      { start: 3, end: 7 }
    ]);
  });
  test("matchesBaseContiguousSubString", () => {
    filterOk(matchesBaseContiguousSubString, "cela", "cancelAnimationFrame()", [
      { start: 3, end: 7 }
    ]);
    filterOk(matchesBaseContiguousSubString, "cafe", "caf\xE9", [
      { start: 0, end: 4 }
    ]);
    filterOk(matchesBaseContiguousSubString, "cafe", "caf\xE9Bar", [
      { start: 0, end: 4 }
    ]);
    filterOk(matchesBaseContiguousSubString, "resume", "r\xE9sum\xE9", [
      { start: 0, end: 6 }
    ]);
    filterOk(matchesBaseContiguousSubString, "na\xEFve", "na\xEFve", [
      { start: 0, end: 5 }
    ]);
    filterOk(matchesBaseContiguousSubString, "naive", "na\xEFve", [
      { start: 0, end: 5 }
    ]);
    filterOk(matchesBaseContiguousSubString, "aeou", "\xE0\xE9\xF6\xFC", [
      { start: 0, end: 4 }
    ]);
  });
  test("matchesSubString", () => {
    filterOk(matchesSubString, "cmm", "cancelAnimationFrame()", [
      { start: 0, end: 1 },
      { start: 9, end: 10 },
      { start: 18, end: 19 }
    ]);
    filterOk(matchesSubString, "abc", "abcabc", [
      { start: 0, end: 3 }
    ]);
    filterOk(matchesSubString, "abc", "aaabbbccc", [
      { start: 0, end: 1 },
      { start: 3, end: 4 },
      { start: 6, end: 7 }
    ]);
  });
  test("matchesSubString performance (#35346)", function() {
    filterNotOk(matchesSubString, "aaaaaaaaaaaaaaaaaaaax", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
  test("WordFilter", () => {
    filterOk(matchesWords, "alpha", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesWords, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
    filterNotOk(matchesWords, "alpha", "alp");
    filterOk(matchesWords, "a", "alpha", [{ start: 0, end: 1 }]);
    filterNotOk(matchesWords, "x", "alpha");
    filterOk(matchesWords, "A", "alpha", [{ start: 0, end: 1 }]);
    filterOk(matchesWords, "AlPh", "alPHA", [{ start: 0, end: 4 }]);
    assert(matchesWords("Debug Console", "Open: Debug Console"));
    filterOk(matchesWords, "gp", "Git: Pull", [{ start: 0, end: 1 }, { start: 5, end: 6 }]);
    filterOk(matchesWords, "g p", "Git: Pull", [{ start: 0, end: 1 }, { start: 5, end: 6 }]);
    filterOk(matchesWords, "gipu", "Git: Pull", [{ start: 0, end: 2 }, { start: 5, end: 7 }]);
    filterOk(matchesWords, "gp", "Category: Git: Pull", [{ start: 10, end: 11 }, { start: 15, end: 16 }]);
    filterOk(matchesWords, "g p", "Category: Git: Pull", [{ start: 10, end: 11 }, { start: 15, end: 16 }]);
    filterOk(matchesWords, "gipu", "Category: Git: Pull", [{ start: 10, end: 12 }, { start: 15, end: 17 }]);
    filterNotOk(matchesWords, "it", "Git: Pull");
    filterNotOk(matchesWords, "ll", "Git: Pull");
    filterOk(matchesWords, "git: \u30D7\u30EB", "git: \u30D7\u30EB", [{ start: 0, end: 7 }]);
    filterOk(matchesWords, "git \u30D7\u30EB", "git: \u30D7\u30EB", [{ start: 0, end: 3 }, { start: 5, end: 7 }]);
    filterOk(matchesWords, "\xF6\xE4k", "\xD6hm: \xC4lles Klar", [{ start: 0, end: 1 }, { start: 5, end: 6 }, { start: 11, end: 12 }]);
    filterOk(matchesWords, "C++", "C/C++: command", [{ start: 2, end: 5 }]);
    filterOk(matchesWords, ".", ":", []);
    filterOk(matchesWords, ".", ".", [{ start: 0, end: 1 }]);
    filterOk(matchesWords, "bar", "foo-bar");
    filterOk(matchesWords, "bar test", "foo-bar test");
    filterOk(matchesWords, "fbt", "foo-bar test");
    filterOk(matchesWords, "bar test", "foo-bar (test)");
    filterOk(matchesWords, "foo bar", "foo (bar)");
    filterNotOk(matchesWords, "bar est", "foo-bar test");
    filterNotOk(matchesWords, "fo ar", "foo-bar test");
    filterNotOk(matchesWords, "for", "foo-bar test");
    filterOk(matchesWords, "foo bar", "foo-bar");
    filterOk(matchesWords, "foo bar", "123 foo-bar 456");
    filterOk(matchesWords, "foo-bar", "foo bar");
    filterOk(matchesWords, "foo:bar", "foo:bar");
  });
  test("matchesWords performance (#309582)", function() {
    const targets = [
      "workbench.action.terminal.focusNextLine",
      "editor.action.clipboardCopyAction",
      "workbench.action.editor.changeLanguageMode",
      "editor.action.smartSelect.expand",
      "workbench.action.files.saveAll"
    ];
    for (let i = 0; i < 1e3; i++) {
      for (const t of targets) {
        matchesWords("editor.action", t);
      }
    }
  });
  function assertMatches(pattern, word, decoratedWord, filter, opts = {}) {
    const r = filter(pattern, pattern.toLowerCase(), opts.patternPos || 0, word, word.toLowerCase(), opts.wordPos || 0, { firstMatchCanBeWeak: opts.firstMatchCanBeWeak ?? false, boostFullMatch: true });
    assert.ok(!decoratedWord === !r);
    if (r) {
      const matches = createMatches(r);
      let actualWord = "";
      let pos = 0;
      for (const match of matches) {
        actualWord += word.substring(pos, match.start);
        actualWord += "^" + word.substring(match.start, match.end).split("").join("^");
        pos = match.end;
      }
      actualWord += word.substring(pos);
      assert.strictEqual(actualWord, decoratedWord);
    }
  }
  test("fuzzyScore, #23215", function() {
    assertMatches("tit", "win.tit", "win.^t^i^t", fuzzyScore);
    assertMatches("title", "win.title", "win.^t^i^t^l^e", fuzzyScore);
    assertMatches("WordCla", "WordCharacterClassifier", "^W^o^r^dCharacter^C^l^assifier", fuzzyScore);
    assertMatches("WordCCla", "WordCharacterClassifier", "^W^o^r^d^Character^C^l^assifier", fuzzyScore);
  });
  test("fuzzyScore, #23332", function() {
    assertMatches("dete", '"editor.quickSuggestionsDelay"', void 0, fuzzyScore);
  });
  test("fuzzyScore, #23190", function() {
    assertMatches("c:\\do", "& 'C:\\Documents and Settings'", "& '^C^:^\\^D^ocuments and Settings'", fuzzyScore);
    assertMatches("c:\\do", "& 'c:\\Documents and Settings'", "& '^c^:^\\^D^ocuments and Settings'", fuzzyScore);
  });
  test("fuzzyScore, #23581", function() {
    assertMatches("close", "css.lint.importStatement", "^css.^lint.imp^ort^Stat^ement", fuzzyScore);
    assertMatches("close", "css.colorDecorators.enable", "^css.co^l^orDecorator^s.^enable", fuzzyScore);
    assertMatches("close", "workbench.quickOpen.closeOnFocusOut", "workbench.quickOpen.^c^l^o^s^eOnFocusOut", fuzzyScore);
    assertTopScore(fuzzyScore, "close", 2, "css.lint.importStatement", "css.colorDecorators.enable", "workbench.quickOpen.closeOnFocusOut");
  });
  test("fuzzyScore, #23458", function() {
    assertMatches("highlight", "editorHoverHighlight", "editorHover^H^i^g^h^l^i^g^h^t", fuzzyScore);
    assertMatches("hhighlight", "editorHoverHighlight", "editor^Hover^H^i^g^h^l^i^g^h^t", fuzzyScore);
    assertMatches("dhhighlight", "editorHoverHighlight", void 0, fuzzyScore);
  });
  test("fuzzyScore, #23746", function() {
    assertMatches("-moz", "-moz-foo", "^-^m^o^z-foo", fuzzyScore);
    assertMatches("moz", "-moz-foo", "-^m^o^z-foo", fuzzyScore);
    assertMatches("moz", "-moz-animation", "-^m^o^z-animation", fuzzyScore);
    assertMatches("moza", "-moz-animation", "-^m^o^z-^animation", fuzzyScore);
  });
  test("fuzzyScore", () => {
    assertMatches("ab", "abA", "^a^bA", fuzzyScore);
    assertMatches("ccm", "cacmelCase", "^ca^c^melCase", fuzzyScore);
    assertMatches("bti", "the_black_knight", void 0, fuzzyScore);
    assertMatches("ccm", "camelCase", void 0, fuzzyScore);
    assertMatches("cmcm", "camelCase", void 0, fuzzyScore);
    assertMatches("BK", "the_black_knight", "the_^black_^knight", fuzzyScore);
    assertMatches("KeyboardLayout=", "KeyboardLayout", void 0, fuzzyScore);
    assertMatches("LLL", "SVisualLoggerLogsList", "SVisual^Logger^Logs^List", fuzzyScore);
    assertMatches("LLLL", "SVilLoLosLi", void 0, fuzzyScore);
    assertMatches("LLLL", "SVisualLoggerLogsList", void 0, fuzzyScore);
    assertMatches("TEdit", "TextEdit", "^Text^E^d^i^t", fuzzyScore);
    assertMatches("TEdit", "TextEditor", "^Text^E^d^i^tor", fuzzyScore);
    assertMatches("TEdit", "Textedit", "^Text^e^d^i^t", fuzzyScore);
    assertMatches("TEdit", "text_edit", "^text_^e^d^i^t", fuzzyScore);
    assertMatches("TEditDit", "TextEditorDecorationType", "^Text^E^d^i^tor^Decorat^ion^Type", fuzzyScore);
    assertMatches("TEdit", "TextEditorDecorationType", "^Text^E^d^i^torDecorationType", fuzzyScore);
    assertMatches("Tedit", "TextEdit", "^Text^E^d^i^t", fuzzyScore);
    assertMatches("ba", "?AB?", void 0, fuzzyScore);
    assertMatches("bkn", "the_black_knight", "the_^black_^k^night", fuzzyScore);
    assertMatches("bt", "the_black_knight", "the_^black_knigh^t", fuzzyScore);
    assertMatches("ccm", "camelCasecm", "^camel^Casec^m", fuzzyScore);
    assertMatches("fdm", "findModel", "^fin^d^Model", fuzzyScore);
    assertMatches("fob", "foobar", "^f^oo^bar", fuzzyScore);
    assertMatches("fobz", "foobar", void 0, fuzzyScore);
    assertMatches("foobar", "foobar", "^f^o^o^b^a^r", fuzzyScore);
    assertMatches("form", "editor.formatOnSave", "editor.^f^o^r^matOnSave", fuzzyScore);
    assertMatches("g p", "Git: Pull", "^Git:^ ^Pull", fuzzyScore);
    assertMatches("g p", "Git: Pull", "^Git:^ ^Pull", fuzzyScore);
    assertMatches("gip", "Git: Pull", "^G^it: ^Pull", fuzzyScore);
    assertMatches("gip", "Git: Pull", "^G^it: ^Pull", fuzzyScore);
    assertMatches("gp", "Git: Pull", "^Git: ^Pull", fuzzyScore);
    assertMatches("gp", "Git_Git_Pull", "^Git_Git_^Pull", fuzzyScore);
    assertMatches("is", "ImportStatement", "^Import^Statement", fuzzyScore);
    assertMatches("is", "isValid", "^i^sValid", fuzzyScore);
    assertMatches("lowrd", "lowWord", "^l^o^wWo^r^d", fuzzyScore);
    assertMatches("myvable", "myvariable", "^m^y^v^aria^b^l^e", fuzzyScore);
    assertMatches("no", "", void 0, fuzzyScore);
    assertMatches("no", "match", void 0, fuzzyScore);
    assertMatches("ob", "foobar", void 0, fuzzyScore);
    assertMatches("sl", "SVisualLoggerLogsList", "^SVisual^LoggerLogsList", fuzzyScore);
    assertMatches("sllll", "SVisualLoggerLogsList", "^SVisua^l^Logger^Logs^List", fuzzyScore);
    assertMatches("Three", "HTMLHRElement", void 0, fuzzyScore);
    assertMatches("Three", "Three", "^T^h^r^e^e", fuzzyScore);
    assertMatches("fo", "barfoo", void 0, fuzzyScore);
    assertMatches("fo", "bar_foo", "bar_^f^oo", fuzzyScore);
    assertMatches("fo", "bar_Foo", "bar_^F^oo", fuzzyScore);
    assertMatches("fo", "bar foo", "bar ^f^oo", fuzzyScore);
    assertMatches("fo", "bar.foo", "bar.^f^oo", fuzzyScore);
    assertMatches("fo", "bar/foo", "bar/^f^oo", fuzzyScore);
    assertMatches("fo", "bar\\foo", "bar\\^f^oo", fuzzyScore);
  });
  test("fuzzyScore (first match can be weak)", function() {
    assertMatches("Three", "HTMLHRElement", "H^TML^H^R^El^ement", fuzzyScore, { firstMatchCanBeWeak: true });
    assertMatches("tor", "constructor", "construc^t^o^r", fuzzyScore, { firstMatchCanBeWeak: true });
    assertMatches("ur", "constructor", "constr^ucto^r", fuzzyScore, { firstMatchCanBeWeak: true });
    assertTopScore(fuzzyScore, "tor", 2, "constructor", "Thor", "cTor");
  });
  test("fuzzyScore, many matches", function() {
    assertMatches(
      "aaaaaa",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "^a^a^a^a^a^aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fuzzyScore
    );
  });
  test("Freeze when fjfj -> jfjf, https://github.com/microsoft/vscode/issues/91807", function() {
    assertMatches(
      "jfjfj",
      "fjfjfjfjfjfjfjfjfjfjfj",
      void 0,
      fuzzyScore
    );
    assertMatches(
      "jfjfjfjfjfjfjfjfjfj",
      "fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      void 0,
      fuzzyScore
    );
    assertMatches(
      "jfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfj",
      "fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      void 0,
      fuzzyScore
    );
    assertMatches(
      "jfjfjfjfjfjfjfjfjfj",
      "fJfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      "f^J^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^jfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      // strong match
      fuzzyScore
    );
    assertMatches(
      "jfjfjfjfjfjfjfjfjfj",
      "fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      "f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^jfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      // any match
      fuzzyScore,
      { firstMatchCanBeWeak: true }
    );
  });
  test("fuzzyScore, issue #26423", function() {
    assertMatches("baba", "abababab", void 0, fuzzyScore);
    assertMatches(
      "fsfsfs",
      "dsafdsafdsafdsafdsafdsafdsafasdfdsa",
      void 0,
      fuzzyScore
    );
    assertMatches(
      "fsfsfsfsfsfsfsf",
      "dsafdsafdsafdsafdsafdsafdsafasdfdsafdsafdsafdsafdsfdsafdsfdfdfasdnfdsajfndsjnafjndsajlknfdsa",
      void 0,
      fuzzyScore
    );
  });
  test("Fuzzy IntelliSense matching vs Haxe metadata completion, #26995", function() {
    assertMatches("f", ":Foo", ":^Foo", fuzzyScore);
    assertMatches("f", ":foo", ":^foo", fuzzyScore);
  });
  test("Separator only match should not be weak #79558", function() {
    assertMatches(".", "foo.bar", "foo^.bar", fuzzyScore);
  });
  test("Cannot set property '1' of undefined, #26511", function() {
    const word = new Array(123).join("a");
    const pattern = new Array(120).join("a");
    fuzzyScore(pattern, pattern.toLowerCase(), 0, word, word.toLowerCase(), 0);
    assert.ok(true);
  });
  test("Vscode 1.12 no longer obeys 'sortText' in completion items (from language server), #26096", function() {
    assertMatches("  ", "  group", void 0, fuzzyScore, { patternPos: 2 });
    assertMatches("  g", "  group", "  ^group", fuzzyScore, { patternPos: 2 });
    assertMatches("g", "  group", "  ^group", fuzzyScore);
    assertMatches("g g", "  groupGroup", void 0, fuzzyScore);
    assertMatches("g g", "  group Group", "  ^group^ ^Group", fuzzyScore);
    assertMatches(" g g", "  group Group", "  ^group^ ^Group", fuzzyScore, { patternPos: 1 });
    assertMatches("zz", "zzGroup", "^z^zGroup", fuzzyScore);
    assertMatches("zzg", "zzGroup", "^z^z^Group", fuzzyScore);
    assertMatches("g", "zzGroup", "zz^Group", fuzzyScore);
  });
  test("patternPos isn't working correctly #79815", function() {
    assertMatches(":p".substr(1), "prop", "^prop", fuzzyScore, { patternPos: 0 });
    assertMatches(":p", "prop", "^prop", fuzzyScore, { patternPos: 1 });
    assertMatches(":p", "prop", void 0, fuzzyScore, { patternPos: 2 });
    assertMatches(":p", "proP", "pro^P", fuzzyScore, { patternPos: 1, wordPos: 1 });
    assertMatches(":p", "aprop", "a^prop", fuzzyScore, { patternPos: 1, firstMatchCanBeWeak: true });
    assertMatches(":p", "aprop", void 0, fuzzyScore, { patternPos: 1, firstMatchCanBeWeak: false });
  });
  function assertTopScore(filter, pattern, expected, ...words) {
    let topScore = -(100 * 10);
    let topIdx = 0;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const m = filter(pattern, pattern.toLowerCase(), 0, word, word.toLowerCase(), 0);
      if (m) {
        const [score] = m;
        if (score > topScore) {
          topScore = score;
          topIdx = i;
        }
      }
    }
    assert.strictEqual(topIdx, expected, `${pattern} -> actual=${words[topIdx]} <> expected=${words[expected]}`);
  }
  test("topScore - fuzzyScore", function() {
    assertTopScore(fuzzyScore, "cons", 2, "ArrayBufferConstructor", "Console", "console");
    assertTopScore(fuzzyScore, "Foo", 1, "foo", "Foo", "foo");
    assertTopScore(fuzzyScore, "onMess", 1, "onmessage", "onMessage", "onThisMegaEscape");
    assertTopScore(fuzzyScore, "CC", 1, "camelCase", "CamelCase");
    assertTopScore(fuzzyScore, "cC", 0, "camelCase", "CamelCase");
    assertTopScore(fuzzyScore, "p", 4, "parse", "posix", "pafdsa", "path", "p");
    assertTopScore(fuzzyScore, "pa", 0, "parse", "pafdsa", "path");
    assertTopScore(fuzzyScore, "log", 3, "HTMLOptGroupElement", "ScrollLogicalPosition", "SVGFEMorphologyElement", "log", "logger");
    assertTopScore(fuzzyScore, "e", 2, "AbstractWorker", "ActiveXObject", "else");
    assertTopScore(fuzzyScore, "workbench.sideb", 1, "workbench.editor.defaultSideBySideLayout", "workbench.sideBar.location");
    assertTopScore(fuzzyScore, "editor.r", 2, "diffEditor.renderSideBySide", "editor.overviewRulerlanes", "editor.renderControlCharacter", "editor.renderWhitespace");
    assertTopScore(fuzzyScore, "-mo", 1, "-ms-ime-mode", "-moz-columns");
    assertTopScore(fuzzyScore, "convertModelPosition", 0, "convertModelPositionToViewPosition", "convertViewToModelPosition");
    assertTopScore(fuzzyScore, "is", 0, "isValidViewletId", "import statement");
    assertTopScore(fuzzyScore, "title", 1, "files.trimTrailingWhitespace", "window.title");
    assertTopScore(fuzzyScore, "const", 1, "constructor", "const", "cuOnstrul");
  });
  test("Unexpected suggestion scoring, #28791", function() {
    assertTopScore(fuzzyScore, "_lines", 1, "_lineStarts", "_lines");
    assertTopScore(fuzzyScore, "_lines", 1, "_lineS", "_lines");
    assertTopScore(fuzzyScore, "_lineS", 0, "_lineS", "_lines");
  });
  test.skip('Bad completion ranking changes valid variable name to class name when pressing "." #187055', function() {
    assertTopScore(fuzzyScore, "a", 1, "A", "a");
    assertTopScore(fuzzyScore, "theme", 1, "Theme", "theme");
  });
  test("HTML closing tag proposal filtered out #38880", function() {
    assertMatches("		<", "		</body>", "^	^	^</body>", fuzzyScore, { patternPos: 0 });
    assertMatches("		<", "		</body>", "		^</body>", fuzzyScore, { patternPos: 2 });
    assertMatches("	<", "	</body>", "	^</body>", fuzzyScore, { patternPos: 1 });
  });
  test("fuzzyScoreGraceful", () => {
    assertMatches("rlut", "result", void 0, fuzzyScore);
    assertMatches("rlut", "result", "^res^u^l^t", fuzzyScoreGraceful);
    assertMatches("cno", "console", "^co^ns^ole", fuzzyScore);
    assertMatches("cno", "console", "^co^ns^ole", fuzzyScoreGraceful);
    assertMatches("cno", "console", "^c^o^nsole", fuzzyScoreGracefulAggressive);
    assertMatches("cno", "co_new", "^c^o_^new", fuzzyScoreGraceful);
    assertMatches("cno", "co_new", "^c^o_^new", fuzzyScoreGracefulAggressive);
  });
  test("List highlight filter: Not all characters from match are highlighterd #66923", () => {
    assertMatches("foo", "barbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo", "barbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_^f^o^o", fuzzyScore);
  });
  test("Autocompletion is matched against truncated filterText to 54 characters #74133", () => {
    assertMatches(
      "foo",
      "ffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo",
      "ffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_^f^o^o",
      fuzzyScore
    );
    assertMatches(
      "Aoo",
      "Affffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo",
      "^Affffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_f^o^o",
      fuzzyScore
    );
    assertMatches(
      "foo",
      "Gffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo",
      void 0,
      fuzzyScore
    );
  });
  test(`"Go to Symbol" with the exact method name doesn't work as expected #84787`, function() {
    const match = fuzzyScore(":get", ":get", 1, "get", "get", 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
    assert.ok(Boolean(match));
  });
  test("Wrong highlight after emoji #113404", function() {
    assertMatches("di", '\u2728div classname=""></div>', '\u2728^d^iv classname=""></div>', fuzzyScore);
    assertMatches("di", 'adiv classname=""></div>', 'adiv classname=""></^d^iv>', fuzzyScore);
  });
  test("Suggestion is not highlighted #85826", function() {
    assertMatches("SemanticTokens", "SemanticTokensEdits", "^S^e^m^a^n^t^i^c^T^o^k^e^n^sEdits", fuzzyScore);
    assertMatches("SemanticTokens", "SemanticTokensEdits", "^S^e^m^a^n^t^i^c^T^o^k^e^n^sEdits", fuzzyScoreGracefulAggressive);
  });
  test("IntelliSense completion not correctly highlighting text in front of cursor #115250", function() {
    assertMatches("lo", "log", "^l^og", fuzzyScore);
    assertMatches(".lo", "log", "^l^og", anyScore);
    assertMatches(".", "log", "log", anyScore);
  });
  test("anyScore should not require a strong first match", function() {
    assertMatches("bar", "foobAr", "foo^b^A^r", anyScore);
    assertMatches("bar", "foobar", "foo^b^a^r", anyScore);
  });
  test("configurable full match boost", function() {
    const prefix = "create";
    const a = "createModelServices";
    const b = "create";
    let aBoost = fuzzyScore(prefix, prefix, 0, a, a.toLowerCase(), 0, { boostFullMatch: true, firstMatchCanBeWeak: true });
    let bBoost = fuzzyScore(prefix, prefix, 0, b, b.toLowerCase(), 0, { boostFullMatch: true, firstMatchCanBeWeak: true });
    assert.ok(aBoost);
    assert.ok(bBoost);
    assert.ok(aBoost[0] < bBoost[0]);
    const wordPrefix = "$(symbol-function) ";
    aBoost = fuzzyScore(prefix, prefix, 0, `${wordPrefix}${a}`, `${wordPrefix}${a}`.toLowerCase(), wordPrefix.length, { boostFullMatch: true, firstMatchCanBeWeak: true });
    bBoost = fuzzyScore(prefix, prefix, 0, `${wordPrefix}${b}`, `${wordPrefix}${b}`.toLowerCase(), wordPrefix.length, { boostFullMatch: true, firstMatchCanBeWeak: true });
    assert.ok(aBoost);
    assert.ok(bBoost);
    assert.ok(aBoost[0] < bBoost[0]);
    const aScore = fuzzyScore(prefix, prefix, 0, a, a.toLowerCase(), 0, { boostFullMatch: false, firstMatchCanBeWeak: true });
    const bScore = fuzzyScore(prefix, prefix, 0, b, b.toLowerCase(), 0, { boostFullMatch: false, firstMatchCanBeWeak: true });
    assert.ok(aScore);
    assert.ok(bScore);
    assert.ok(aScore[0] === bScore[0]);
  });
  test("Unexpected suggest highlighting ignores whole word match in favor of matching first letter#147423", function() {
    assertMatches("i", "machine/{id}", "machine/{^id}", fuzzyScore);
    assertMatches("ok", "obobobf{ok}/user", "^obobobf{o^k}/user", fuzzyScore);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGZpbHRlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBhbnlTY29yZSwgY3JlYXRlTWF0Y2hlcywgZnV6enlTY29yZSwgZnV6enlTY29yZUdyYWNlZnVsLCBmdXp6eVNjb3JlR3JhY2VmdWxBZ2dyZXNzaXZlLCBGdXp6eVNjb3JlciwgSUZpbHRlciwgSU1hdGNoLCBtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsIG1hdGNoZXNDYW1lbENhc2UsIG1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nLCBtYXRjaGVzUHJlZml4LCBtYXRjaGVzU3RyaWN0UHJlZml4LCBtYXRjaGVzU3ViU3RyaW5nLCBtYXRjaGVzV29yZHMsIG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbmZ1bmN0aW9uIGZpbHRlck9rKGZpbHRlcjogSUZpbHRlciwgd29yZDogc3RyaW5nLCB3b3JkVG9NYXRjaEFnYWluc3Q6IHN0cmluZywgaGlnaGxpZ2h0cz86IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfVtdKSB7XG5cdGNvbnN0IHIgPSBmaWx0ZXIod29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0KTtcblx0YXNzZXJ0KHIsIGAke3dvcmR9IGRpZG4ndCBtYXRjaCAke3dvcmRUb01hdGNoQWdhaW5zdH1gKTtcblx0aWYgKGhpZ2hsaWdodHMpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHIsIGhpZ2hsaWdodHMpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZpbHRlck5vdE9rKGZpbHRlcjogSUZpbHRlciwgd29yZDogc3RyaW5nLCB3b3JkVG9NYXRjaEFnYWluc3Q6IHN0cmluZykge1xuXHRhc3NlcnQoIWZpbHRlcih3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpLCBgJHt3b3JkfSBtYXRjaGVkICR7d29yZFRvTWF0Y2hBZ2FpbnN0fWApO1xufVxuXG5zdWl0ZSgnRmlsdGVycycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnb3InLCAoKSA9PiB7XG5cdFx0bGV0IGZpbHRlcjogSUZpbHRlcjtcblx0XHRsZXQgY291bnRlcnM6IG51bWJlcltdO1xuXHRcdGNvbnN0IG5ld0ZpbHRlciA9IGZ1bmN0aW9uIChpOiBudW1iZXIsIHI6IGJvb2xlYW4pOiBJRmlsdGVyIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uICgpOiBJTWF0Y2hbXSB7IGNvdW50ZXJzW2ldKys7IHJldHVybiByIGFzIGFueTsgfTtcblx0XHR9O1xuXG5cdFx0Y291bnRlcnMgPSBbMCwgMF07XG5cdFx0ZmlsdGVyID0gb3IobmV3RmlsdGVyKDAsIGZhbHNlKSwgbmV3RmlsdGVyKDEsIGZhbHNlKSk7XG5cdFx0ZmlsdGVyTm90T2soZmlsdGVyLCAnYW55dGhpbmcnLCAnYW55dGhpbmcnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50ZXJzLCBbMSwgMV0pO1xuXG5cdFx0Y291bnRlcnMgPSBbMCwgMF07XG5cdFx0ZmlsdGVyID0gb3IobmV3RmlsdGVyKDAsIHRydWUpLCBuZXdGaWx0ZXIoMSwgZmFsc2UpKTtcblx0XHRmaWx0ZXJPayhmaWx0ZXIsICdhbnl0aGluZycsICdhbnl0aGluZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRlcnMsIFsxLCAwXSk7XG5cblx0XHRjb3VudGVycyA9IFswLCAwXTtcblx0XHRmaWx0ZXIgPSBvcihuZXdGaWx0ZXIoMCwgdHJ1ZSksIG5ld0ZpbHRlcigxLCB0cnVlKSk7XG5cdFx0ZmlsdGVyT2soZmlsdGVyLCAnYW55dGhpbmcnLCAnYW55dGhpbmcnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50ZXJzLCBbMSwgMF0pO1xuXG5cdFx0Y291bnRlcnMgPSBbMCwgMF07XG5cdFx0ZmlsdGVyID0gb3IobmV3RmlsdGVyKDAsIGZhbHNlKSwgbmV3RmlsdGVyKDEsIHRydWUpKTtcblx0XHRmaWx0ZXJPayhmaWx0ZXIsICdhbnl0aGluZycsICdhbnl0aGluZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRlcnMsIFsxLCAxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ByZWZpeEZpbHRlciAtIGNhc2Ugc2Vuc2l0aXZlJywgZnVuY3Rpb24gKCkge1xuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNTdHJpY3RQcmVmaXgsICcnLCAnJyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1N0cmljdFByZWZpeCwgJycsICdhbnl0aGluZycsIFtdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzU3RyaWN0UHJlZml4LCAnYWxwaGEnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzU3RyaWN0UHJlZml4LCAnYWxwaGEnLCAnYWxwaGFzb21ldGhpbmcnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzU3RyaWN0UHJlZml4LCAnYWxwaGEnLCAnYWxwJyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1N0cmljdFByZWZpeCwgJ2EnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzU3RyaWN0UHJlZml4LCAneCcsICdhbHBoYScpO1xuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNTdHJpY3RQcmVmaXgsICdBJywgJ2FscGhhJyk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1N0cmljdFByZWZpeCwgJ0FsUGgnLCAnYWxQSEEnKTtcblx0fSk7XG5cblx0dGVzdCgnUHJlZml4RmlsdGVyIC0gaWdub3JlIGNhc2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1ByZWZpeCwgJ2FscGhhJywgJ2FscGhhJywgW3sgc3RhcnQ6IDAsIGVuZDogNSB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1ByZWZpeCwgJ2FscGhhJywgJ2FscGhhc29tZXRoaW5nJywgW3sgc3RhcnQ6IDAsIGVuZDogNSB9XSk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1ByZWZpeCwgJ2FscGhhJywgJ2FscCcpO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNQcmVmaXgsICdhJywgJ2FscGhhJywgW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1ByZWZpeCwgJ1x1MDBFNCcsICdcdTAwQzRscGhhJywgW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1ByZWZpeCwgJ3gnLCAnYWxwaGEnKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzUHJlZml4LCAnQScsICdhbHBoYScsIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNQcmVmaXgsICdBbFBoJywgJ2FsUEhBJywgW3sgc3RhcnQ6IDAsIGVuZDogNCB9XSk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1ByZWZpeCwgJ1QnLCAnNCcpOyAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIyNDAxXG5cdH0pO1xuXG5cdHRlc3QoJ0NhbWVsQ2FzZUZpbHRlcicsICgpID0+IHtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzQ2FtZWxDYXNlLCAnJywgJycpO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICcnLCAnYW55dGhpbmcnLCBbXSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2FscGhhJywgJ2FscGhhJywgW3sgc3RhcnQ6IDAsIGVuZDogNSB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ0FsUGhBJywgJ2FscGhhJywgW3sgc3RhcnQ6IDAsIGVuZDogNSB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2FscGhhJywgJ2FscGhhc29tZXRoaW5nJywgW3sgc3RhcnQ6IDAsIGVuZDogNSB9XSk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2FscGhhJywgJ2FscCcpO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2MnLCAnQ2FtZWxDYXNlUm9ja3MnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdjYycsICdDYW1lbENhc2VSb2NrcycsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMSB9LFxuXHRcdFx0eyBzdGFydDogNSwgZW5kOiA2IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnY2NyJywgJ0NhbWVsQ2FzZVJvY2tzJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiA1LCBlbmQ6IDYgfSxcblx0XHRcdHsgc3RhcnQ6IDksIGVuZDogMTAgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdjYWNyJywgJ0NhbWVsQ2FzZVJvY2tzJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAyIH0sXG5cdFx0XHR7IHN0YXJ0OiA1LCBlbmQ6IDYgfSxcblx0XHRcdHsgc3RhcnQ6IDksIGVuZDogMTAgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdjYWNhcicsICdDYW1lbENhc2VSb2NrcycsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMiB9LFxuXHRcdFx0eyBzdGFydDogNSwgZW5kOiA3IH0sXG5cdFx0XHR7IHN0YXJ0OiA5LCBlbmQ6IDEwIH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnY2Nhcm9ja3MnLCAnQ2FtZWxDYXNlUm9ja3MnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDUsIGVuZDogNyB9LFxuXHRcdFx0eyBzdGFydDogOSwgZW5kOiAxNCB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2NyJywgJ0NhbWVsQ2FzZVJvY2tzJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiA5LCBlbmQ6IDEwIH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnZmJhJywgJ0Zvb0JhckFiZScsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMSB9LFxuXHRcdFx0eyBzdGFydDogMywgZW5kOiA1IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnZmJhcicsICdGb29CYXJBYmUnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDMsIGVuZDogNiB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2ZiYXJhJywgJ0Zvb0JhckFiZScsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMSB9LFxuXHRcdFx0eyBzdGFydDogMywgZW5kOiA3IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnZmJhYScsICdGb29CYXJBYmUnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDMsIGVuZDogNSB9LFxuXHRcdFx0eyBzdGFydDogNiwgZW5kOiA3IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnZmJhYWInLCAnRm9vQmFyQWJlJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDUgfSxcblx0XHRcdHsgc3RhcnQ6IDYsIGVuZDogOCB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2MyZCcsICdjYW52YXNDcmVhdGlvbjJEJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiAxNCwgZW5kOiAxNiB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2NjZScsICdfY2FudmFzQ3JlYXRpb25FdmVudCcsIFtcblx0XHRcdHsgc3RhcnQ6IDEsIGVuZDogMiB9LFxuXHRcdFx0eyBzdGFydDogNywgZW5kOiA4IH0sXG5cdFx0XHR7IHN0YXJ0OiAxNSwgZW5kOiAxNiB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbWVsQ2FzZUZpbHRlciAtICMxOTI1NicsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQobWF0Y2hlc0NhbWVsQ2FzZSgnRGVidWcgQ29uc29sZScsICdPcGVuOiBEZWJ1ZyBDb25zb2xlJykpO1xuXHRcdGFzc2VydChtYXRjaGVzQ2FtZWxDYXNlKCdEZWJ1ZyBjb25zb2xlJywgJ09wZW46IERlYnVnIENvbnNvbGUnKSk7XG5cdFx0YXNzZXJ0KG1hdGNoZXNDYW1lbENhc2UoJ2RlYnVnIGNvbnNvbGUnLCAnT3BlbjogRGVidWcgQ29uc29sZScpKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcnLCAoKSA9PiB7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcsICdjZWxhJywgJ2NhbmNlbEFuaW1hdGlvbkZyYW1lKCknLCBbXG5cdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDcgfVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcnLCAoKSA9PiB7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCAnY2VsYScsICdjYW5jZWxBbmltYXRpb25GcmFtZSgpJywgW1xuXHRcdFx0eyBzdGFydDogMywgZW5kOiA3IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsICdjYWZlJywgJ2NhZlx1MDBFOScsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogNCB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCAnY2FmZScsICdjYWZcdTAwRTlCYXInLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDQgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgJ3Jlc3VtZScsICdyXHUwMEU5c3VtXHUwMEU5JywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiA2IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsICduYVx1MDBFRnZlJywgJ25hXHUwMEVGdmUnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDUgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgJ25haXZlJywgJ25hXHUwMEVGdmUnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDUgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgJ2Flb3UnLCAnXHUwMEUwXHUwMEU5XHUwMEY2XHUwMEZDJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiA0IH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlc1N1YlN0cmluZycsICgpID0+IHtcblx0XHRmaWx0ZXJPayhtYXRjaGVzU3ViU3RyaW5nLCAnY21tJywgJ2NhbmNlbEFuaW1hdGlvbkZyYW1lKCknLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDksIGVuZDogMTAgfSxcblx0XHRcdHsgc3RhcnQ6IDE4LCBlbmQ6IDE5IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzU3ViU3RyaW5nLCAnYWJjJywgJ2FiY2FiYycsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMyB9LFxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNTdWJTdHJpbmcsICdhYmMnLCAnYWFhYmJiY2NjJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDQgfSxcblx0XHRcdHsgc3RhcnQ6IDYsIGVuZDogNyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzU3ViU3RyaW5nIHBlcmZvcm1hbmNlICgjMzUzNDYpJywgZnVuY3Rpb24gKCkge1xuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNTdWJTdHJpbmcsICdhYWFhYWFhYWFhYWFhYWFhYWFhYXgnLCAnYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYScpO1xuXHR9KTtcblxuXHR0ZXN0KCdXb3JkRmlsdGVyJywgKCkgPT4ge1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2FscGhhJywgJ2FscGhhJywgW3sgc3RhcnQ6IDAsIGVuZDogNSB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnYWxwaGEnLCAnYWxwaGFzb21ldGhpbmcnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzV29yZHMsICdhbHBoYScsICdhbHAnKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdhJywgJ2FscGhhJywgW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1dvcmRzLCAneCcsICdhbHBoYScpO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ0EnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdBbFBoJywgJ2FsUEhBJywgW3sgc3RhcnQ6IDAsIGVuZDogNCB9XSk7XG5cdFx0YXNzZXJ0KG1hdGNoZXNXb3JkcygnRGVidWcgQ29uc29sZScsICdPcGVuOiBEZWJ1ZyBDb25zb2xlJykpO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZ3AnLCAnR2l0OiBQdWxsJywgW3sgc3RhcnQ6IDAsIGVuZDogMSB9LCB7IHN0YXJ0OiA1LCBlbmQ6IDYgfV0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2cgcCcsICdHaXQ6IFB1bGwnLCBbeyBzdGFydDogMCwgZW5kOiAxIH0sIHsgc3RhcnQ6IDUsIGVuZDogNiB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZ2lwdScsICdHaXQ6IFB1bGwnLCBbeyBzdGFydDogMCwgZW5kOiAyIH0sIHsgc3RhcnQ6IDUsIGVuZDogNyB9XSk7XG5cblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdncCcsICdDYXRlZ29yeTogR2l0OiBQdWxsJywgW3sgc3RhcnQ6IDEwLCBlbmQ6IDExIH0sIHsgc3RhcnQ6IDE1LCBlbmQ6IDE2IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdnIHAnLCAnQ2F0ZWdvcnk6IEdpdDogUHVsbCcsIFt7IHN0YXJ0OiAxMCwgZW5kOiAxMSB9LCB7IHN0YXJ0OiAxNSwgZW5kOiAxNiB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZ2lwdScsICdDYXRlZ29yeTogR2l0OiBQdWxsJywgW3sgc3RhcnQ6IDEwLCBlbmQ6IDEyIH0sIHsgc3RhcnQ6IDE1LCBlbmQ6IDE3IH1dKTtcblxuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNXb3JkcywgJ2l0JywgJ0dpdDogUHVsbCcpO1xuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNXb3JkcywgJ2xsJywgJ0dpdDogUHVsbCcpO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZ2l0OiBcdTMwRDdcdTMwRUInLCAnZ2l0OiBcdTMwRDdcdTMwRUInLCBbeyBzdGFydDogMCwgZW5kOiA3IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdnaXQgXHUzMEQ3XHUzMEVCJywgJ2dpdDogXHUzMEQ3XHUzMEVCJywgW3sgc3RhcnQ6IDAsIGVuZDogMyB9LCB7IHN0YXJ0OiA1LCBlbmQ6IDcgfV0pO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnXHUwMEY2XHUwMEU0aycsICdcdTAwRDZobTogXHUwMEM0bGxlcyBLbGFyJywgW3sgc3RhcnQ6IDAsIGVuZDogMSB9LCB7IHN0YXJ0OiA1LCBlbmQ6IDYgfSwgeyBzdGFydDogMTEsIGVuZDogMTIgfV0pO1xuXG5cdFx0Ly8gSGFuZGxlcyBpc3N1ZSAjMTIzOTE1XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnQysrJywgJ0MvQysrOiBjb21tYW5kJywgW3sgc3RhcnQ6IDIsIGVuZDogNSB9XSk7XG5cblx0XHQvLyBIYW5kbGVzIGlzc3VlICMxNTQ1MzNcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICcuJywgJzonLCBbXSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnLicsICcuJywgW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSk7XG5cblx0XHQvLyBhc3NlcnQub2sobWF0Y2hlc1dvcmRzKCdnaXB1JywgJ0NhdGVnb3J5OiBHaXQ6IFB1bGwnLCB0cnVlKSA9PT0gbnVsbCk7XG5cdFx0Ly8gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXRjaGVzV29yZHMoJ3B1JywgJ0NhdGVnb3J5OiBHaXQ6IFB1bGwnLCB0cnVlKSwgW3sgc3RhcnQ6IDE1LCBlbmQ6IDE3IH1dKTtcblxuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2JhcicsICdmb28tYmFyJyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnYmFyIHRlc3QnLCAnZm9vLWJhciB0ZXN0Jyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZmJ0JywgJ2Zvby1iYXIgdGVzdCcpO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2JhciB0ZXN0JywgJ2Zvby1iYXIgKHRlc3QpJyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZm9vIGJhcicsICdmb28gKGJhciknKTtcblxuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNXb3JkcywgJ2JhciBlc3QnLCAnZm9vLWJhciB0ZXN0Jyk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1dvcmRzLCAnZm8gYXInLCAnZm9vLWJhciB0ZXN0Jyk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1dvcmRzLCAnZm9yJywgJ2Zvby1iYXIgdGVzdCcpO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZm9vIGJhcicsICdmb28tYmFyJyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZm9vIGJhcicsICcxMjMgZm9vLWJhciA0NTYnKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdmb28tYmFyJywgJ2ZvbyBiYXInKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdmb286YmFyJywgJ2ZvbzpiYXInKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlc1dvcmRzIHBlcmZvcm1hbmNlICgjMzA5NTgyKScsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBTZWFyY2hpbmcgZm9yIGEgdGVybSBjb250YWluaW5nIGEgd29yZCBzZXBhcmF0b3IgKGUuZy4gYC5gKSBhZ2FpbnN0XG5cdFx0Ly8gY29tbWFuZC1pZC1saWtlIHRhcmdldHMgdXNlZCB0byBjYXVzZSBjYXRhc3Ryb3BoaWMgYmFja3RyYWNraW5nIGFuZFxuXHRcdC8vIGZyZWV6ZSB0aGUgS2V5Ym9hcmQgU2hvcnRjdXRzIGVkaXRvci4gV2l0aG91dCB0aGUgZml4IHRoaXMgbG9vcFxuXHRcdC8vIGV4Y2VlZHMgTW9jaGEncyBkZWZhdWx0IHRlc3QgdGltZW91dC5cblx0XHRjb25zdCB0YXJnZXRzID0gW1xuXHRcdFx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNOZXh0TGluZScsXG5cdFx0XHQnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRDb3B5QWN0aW9uJyxcblx0XHRcdCd3b3JrYmVuY2guYWN0aW9uLmVkaXRvci5jaGFuZ2VMYW5ndWFnZU1vZGUnLFxuXHRcdFx0J2VkaXRvci5hY3Rpb24uc21hcnRTZWxlY3QuZXhwYW5kJyxcblx0XHRcdCd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNhdmVBbGwnLFxuXHRcdF07XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDAwOyBpKyspIHtcblx0XHRcdGZvciAoY29uc3QgdCBvZiB0YXJnZXRzKSB7XG5cdFx0XHRcdG1hdGNoZXNXb3JkcygnZWRpdG9yLmFjdGlvbicsIHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0TWF0Y2hlcyhwYXR0ZXJuOiBzdHJpbmcsIHdvcmQ6IHN0cmluZywgZGVjb3JhdGVkV29yZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBmaWx0ZXI6IEZ1enp5U2NvcmVyLCBvcHRzOiB7IHBhdHRlcm5Qb3M/OiBudW1iZXI7IHdvcmRQb3M/OiBudW1iZXI7IGZpcnN0TWF0Y2hDYW5CZVdlYWs/OiBib29sZWFuIH0gPSB7fSkge1xuXHRcdGNvbnN0IHIgPSBmaWx0ZXIocGF0dGVybiwgcGF0dGVybi50b0xvd2VyQ2FzZSgpLCBvcHRzLnBhdHRlcm5Qb3MgfHwgMCwgd29yZCwgd29yZC50b0xvd2VyQ2FzZSgpLCBvcHRzLndvcmRQb3MgfHwgMCwgeyBmaXJzdE1hdGNoQ2FuQmVXZWFrOiBvcHRzLmZpcnN0TWF0Y2hDYW5CZVdlYWsgPz8gZmFsc2UsIGJvb3N0RnVsbE1hdGNoOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5vayghZGVjb3JhdGVkV29yZCA9PT0gIXIpO1xuXHRcdGlmIChyKSB7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gY3JlYXRlTWF0Y2hlcyhyKTtcblx0XHRcdGxldCBhY3R1YWxXb3JkID0gJyc7XG5cdFx0XHRsZXQgcG9zID0gMDtcblx0XHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuXHRcdFx0XHRhY3R1YWxXb3JkICs9IHdvcmQuc3Vic3RyaW5nKHBvcywgbWF0Y2guc3RhcnQpO1xuXHRcdFx0XHRhY3R1YWxXb3JkICs9ICdeJyArIHdvcmQuc3Vic3RyaW5nKG1hdGNoLnN0YXJ0LCBtYXRjaC5lbmQpLnNwbGl0KCcnKS5qb2luKCdeJyk7XG5cdFx0XHRcdHBvcyA9IG1hdGNoLmVuZDtcblx0XHRcdH1cblx0XHRcdGFjdHVhbFdvcmQgKz0gd29yZC5zdWJzdHJpbmcocG9zKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxXb3JkLCBkZWNvcmF0ZWRXb3JkKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdmdXp6eVNjb3JlLCAjMjMyMTUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygndGl0JywgJ3dpbi50aXQnLCAnd2luLl50XmledCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ3RpdGxlJywgJ3dpbi50aXRsZScsICd3aW4uXnReaV50XmxeZScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ1dvcmRDbGEnLCAnV29yZENoYXJhY3RlckNsYXNzaWZpZXInLCAnXldeb15yXmRDaGFyYWN0ZXJeQ15sXmFzc2lmaWVyJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnV29yZENDbGEnLCAnV29yZENoYXJhY3RlckNsYXNzaWZpZXInLCAnXldeb15yXmReQ2hhcmFjdGVyXkNebF5hc3NpZmllcicsIGZ1enp5U2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eVNjb3JlLCAjMjMzMzInLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZGV0ZScsICdcImVkaXRvci5xdWlja1N1Z2dlc3Rpb25zRGVsYXlcIicsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUsICMyMzE5MCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCdjOlxcXFxkbycsICcmIFxcJ0M6XFxcXERvY3VtZW50cyBhbmQgU2V0dGluZ3NcXCcnLCAnJiBcXCdeQ146XlxcXFxeRF5vY3VtZW50cyBhbmQgU2V0dGluZ3NcXCcnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdjOlxcXFxkbycsICcmIFxcJ2M6XFxcXERvY3VtZW50cyBhbmQgU2V0dGluZ3NcXCcnLCAnJiBcXCdeY146XlxcXFxeRF5vY3VtZW50cyBhbmQgU2V0dGluZ3NcXCcnLCBmdXp6eVNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnZnV6enlTY29yZSwgIzIzNTgxJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydE1hdGNoZXMoJ2Nsb3NlJywgJ2Nzcy5saW50LmltcG9ydFN0YXRlbWVudCcsICdeY3NzLl5saW50LmltcF5vcnReU3RhdF5lbWVudCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2Nsb3NlJywgJ2Nzcy5jb2xvckRlY29yYXRvcnMuZW5hYmxlJywgJ15jc3MuY29ebF5vckRlY29yYXRvcl5zLl5lbmFibGUnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdjbG9zZScsICd3b3JrYmVuY2gucXVpY2tPcGVuLmNsb3NlT25Gb2N1c091dCcsICd3b3JrYmVuY2gucXVpY2tPcGVuLl5jXmxeb15zXmVPbkZvY3VzT3V0JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ2Nsb3NlJywgMiwgJ2Nzcy5saW50LmltcG9ydFN0YXRlbWVudCcsICdjc3MuY29sb3JEZWNvcmF0b3JzLmVuYWJsZScsICd3b3JrYmVuY2gucXVpY2tPcGVuLmNsb3NlT25Gb2N1c091dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eVNjb3JlLCAjMjM0NTgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnaGlnaGxpZ2h0JywgJ2VkaXRvckhvdmVySGlnaGxpZ2h0JywgJ2VkaXRvckhvdmVyXkheaV5nXmhebF5pXmdeaF50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnaGhpZ2hsaWdodCcsICdlZGl0b3JIb3ZlckhpZ2hsaWdodCcsICdlZGl0b3JeSG92ZXJeSF5pXmdeaF5sXmleZ15oXnQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdkaGhpZ2hsaWdodCcsICdlZGl0b3JIb3ZlckhpZ2hsaWdodCcsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdH0pO1xuXHR0ZXN0KCdmdXp6eVNjb3JlLCAjMjM3NDYnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnLW1veicsICctbW96LWZvbycsICdeLV5tXm9eei1mb28nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdtb3onLCAnLW1vei1mb28nLCAnLV5tXm9eei1mb28nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdtb3onLCAnLW1vei1hbmltYXRpb24nLCAnLV5tXm9eei1hbmltYXRpb24nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdtb3phJywgJy1tb3otYW5pbWF0aW9uJywgJy1ebV5vXnotXmFuaW1hdGlvbicsIGZ1enp5U2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eVNjb3JlJywgKCkgPT4ge1xuXHRcdGFzc2VydE1hdGNoZXMoJ2FiJywgJ2FiQScsICdeYV5iQScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2NjbScsICdjYWNtZWxDYXNlJywgJ15jYV5jXm1lbENhc2UnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdidGknLCAndGhlX2JsYWNrX2tuaWdodCcsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnY2NtJywgJ2NhbWVsQ2FzZScsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnY21jbScsICdjYW1lbENhc2UnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ0JLJywgJ3RoZV9ibGFja19rbmlnaHQnLCAndGhlX15ibGFja19ea25pZ2h0JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnS2V5Ym9hcmRMYXlvdXQ9JywgJ0tleWJvYXJkTGF5b3V0JywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdMTEwnLCAnU1Zpc3VhbExvZ2dlckxvZ3NMaXN0JywgJ1NWaXN1YWxeTG9nZ2VyXkxvZ3NeTGlzdCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ0xMTEwnLCAnU1ZpbExvTG9zTGknLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ0xMTEwnLCAnU1Zpc3VhbExvZ2dlckxvZ3NMaXN0JywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdURWRpdCcsICdUZXh0RWRpdCcsICdeVGV4dF5FXmReaV50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnVEVkaXQnLCAnVGV4dEVkaXRvcicsICdeVGV4dF5FXmReaV50b3InLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdURWRpdCcsICdUZXh0ZWRpdCcsICdeVGV4dF5lXmReaV50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnVEVkaXQnLCAndGV4dF9lZGl0JywgJ150ZXh0X15lXmReaV50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnVEVkaXREaXQnLCAnVGV4dEVkaXRvckRlY29yYXRpb25UeXBlJywgJ15UZXh0XkVeZF5pXnRvcl5EZWNvcmF0Xmlvbl5UeXBlJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnVEVkaXQnLCAnVGV4dEVkaXRvckRlY29yYXRpb25UeXBlJywgJ15UZXh0XkVeZF5pXnRvckRlY29yYXRpb25UeXBlJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnVGVkaXQnLCAnVGV4dEVkaXQnLCAnXlRleHReRV5kXmledCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2JhJywgJz9BQj8nLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2JrbicsICd0aGVfYmxhY2tfa25pZ2h0JywgJ3RoZV9eYmxhY2tfXmtebmlnaHQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdidCcsICd0aGVfYmxhY2tfa25pZ2h0JywgJ3RoZV9eYmxhY2tfa25pZ2hedCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2NjbScsICdjYW1lbENhc2VjbScsICdeY2FtZWxeQ2FzZWNebScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2ZkbScsICdmaW5kTW9kZWwnLCAnXmZpbl5kXk1vZGVsJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZm9iJywgJ2Zvb2JhcicsICdeZl5vb15iYXInLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmb2J6JywgJ2Zvb2JhcicsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZm9vYmFyJywgJ2Zvb2JhcicsICdeZl5vXm9eYl5hXnInLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmb3JtJywgJ2VkaXRvci5mb3JtYXRPblNhdmUnLCAnZWRpdG9yLl5mXm9ecl5tYXRPblNhdmUnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdnIHAnLCAnR2l0OiBQdWxsJywgJ15HaXQ6XiBeUHVsbCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2cgcCcsICdHaXQ6IFB1bGwnLCAnXkdpdDpeIF5QdWxsJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZ2lwJywgJ0dpdDogUHVsbCcsICdeR15pdDogXlB1bGwnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdnaXAnLCAnR2l0OiBQdWxsJywgJ15HXml0OiBeUHVsbCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2dwJywgJ0dpdDogUHVsbCcsICdeR2l0OiBeUHVsbCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2dwJywgJ0dpdF9HaXRfUHVsbCcsICdeR2l0X0dpdF9eUHVsbCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2lzJywgJ0ltcG9ydFN0YXRlbWVudCcsICdeSW1wb3J0XlN0YXRlbWVudCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2lzJywgJ2lzVmFsaWQnLCAnXmlec1ZhbGlkJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnbG93cmQnLCAnbG93V29yZCcsICdebF5vXndXb15yXmQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdteXZhYmxlJywgJ215dmFyaWFibGUnLCAnXm1eeV52XmFyaWFeYl5sXmUnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdubycsICcnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ25vJywgJ21hdGNoJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdvYicsICdmb29iYXInLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ3NsJywgJ1NWaXN1YWxMb2dnZXJMb2dzTGlzdCcsICdeU1Zpc3VhbF5Mb2dnZXJMb2dzTGlzdCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ3NsbGxsJywgJ1NWaXN1YWxMb2dnZXJMb2dzTGlzdCcsICdeU1Zpc3VhXmxeTG9nZ2VyXkxvZ3NeTGlzdCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ1RocmVlJywgJ0hUTUxIUkVsZW1lbnQnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ1RocmVlJywgJ1RocmVlJywgJ15UXmhecl5lXmUnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmbycsICdiYXJmb28nLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2ZvJywgJ2Jhcl9mb28nLCAnYmFyX15mXm9vJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZm8nLCAnYmFyX0ZvbycsICdiYXJfXkZeb28nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmbycsICdiYXIgZm9vJywgJ2JhciBeZl5vbycsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2ZvJywgJ2Jhci5mb28nLCAnYmFyLl5mXm9vJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZm8nLCAnYmFyL2ZvbycsICdiYXIvXmZeb28nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmbycsICdiYXJcXFxcZm9vJywgJ2JhclxcXFxeZl5vbycsIGZ1enp5U2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eVNjb3JlIChmaXJzdCBtYXRjaCBjYW4gYmUgd2VhayknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnRNYXRjaGVzKCdUaHJlZScsICdIVE1MSFJFbGVtZW50JywgJ0heVE1MXkheUl5FbF5lbWVudCcsIGZ1enp5U2NvcmUsIHsgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9KTtcblx0XHRhc3NlcnRNYXRjaGVzKCd0b3InLCAnY29uc3RydWN0b3InLCAnY29uc3RydWNedF5vXnInLCBmdXp6eVNjb3JlLCB7IGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygndXInLCAnY29uc3RydWN0b3InLCAnY29uc3RyXnVjdG9ecicsIGZ1enp5U2NvcmUsIHsgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9KTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAndG9yJywgMiwgJ2NvbnN0cnVjdG9yJywgJ1Rob3InLCAnY1RvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eVNjb3JlLCBtYW55IG1hdGNoZXMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J2FhYWFhYScsXG5cdFx0XHQnYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhJyxcblx0XHRcdCdeYV5hXmFeYV5hXmFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWEnLFxuXHRcdFx0ZnV6enlTY29yZVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZyZWV6ZSB3aGVuIGZqZmogLT4gamZqZiwgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzkxODA3JywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydE1hdGNoZXMoXG5cdFx0XHQnamZqZmonLFxuXHRcdFx0J2ZqZmpmamZqZmpmamZqZmpmamZqZmonLFxuXHRcdFx0dW5kZWZpbmVkLCBmdXp6eVNjb3JlXG5cdFx0KTtcblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J2pmamZqZmpmamZqZmpmamZqZmonLFxuXHRcdFx0J2ZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmaicsXG5cdFx0XHR1bmRlZmluZWQsIGZ1enp5U2NvcmVcblx0XHQpO1xuXHRcdGFzc2VydE1hdGNoZXMoXG5cdFx0XHQnamZqZmpmamZqZmpmamZqZmpmampmamZqZmpmamZqZmpmamZqZmpqZmpmamZqZmpmamZqZmpmamZqamZqZmpmamZqZmpmamZqZmpmampmamZqZmpmamZqZmpmamZqZmpqZmpmamZqZmpmamZqZmpmamZqJyxcblx0XHRcdCdmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmonLFxuXHRcdFx0dW5kZWZpbmVkLCBmdXp6eVNjb3JlXG5cdFx0KTtcblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J2pmamZqZmpmamZqZmpmamZqZmonLFxuXHRcdFx0J2ZKZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmaicsXG5cdFx0XHQnZl5KXmZeal5mXmpeZl5qXmZeal5mXmpeZl5qXmZeal5mXmpeZl5qZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmaicsIC8vIHN0cm9uZyBtYXRjaFxuXHRcdFx0ZnV6enlTY29yZVxuXHRcdCk7XG5cdFx0YXNzZXJ0TWF0Y2hlcyhcblx0XHRcdCdqZmpmamZqZmpmamZqZmpmamZqJyxcblx0XHRcdCdmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmonLFxuXHRcdFx0J2Zeal5mXmpeZl5qXmZeal5mXmpeZl5qXmZeal5mXmpeZl5qXmZeamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmonLCAvLyBhbnkgbWF0Y2hcblx0XHRcdGZ1enp5U2NvcmUsIHsgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZnV6enlTY29yZSwgaXNzdWUgIzI2NDIzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0TWF0Y2hlcygnYmFiYScsICdhYmFiYWJhYicsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J2ZzZnNmcycsXG5cdFx0XHQnZHNhZmRzYWZkc2FmZHNhZmRzYWZkc2FmZHNhZmFzZGZkc2EnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZnV6enlTY29yZVxuXHRcdCk7XG5cdFx0YXNzZXJ0TWF0Y2hlcyhcblx0XHRcdCdmc2ZzZnNmc2ZzZnNmc2YnLFxuXHRcdFx0J2RzYWZkc2FmZHNhZmRzYWZkc2FmZHNhZmRzYWZhc2RmZHNhZmRzYWZkc2FmZHNhZmRzZmRzYWZkc2ZkZmRmYXNkbmZkc2FqZm5kc2puYWZqbmRzYWpsa25mZHNhJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZ1enp5U2NvcmVcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdGdXp6eSBJbnRlbGxpU2Vuc2UgbWF0Y2hpbmcgdnMgSGF4ZSBtZXRhZGF0YSBjb21wbGV0aW9uLCAjMjY5OTUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZicsICc6Rm9vJywgJzpeRm9vJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZicsICc6Zm9vJywgJzpeZm9vJywgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlcGFyYXRvciBvbmx5IG1hdGNoIHNob3VsZCBub3QgYmUgd2VhayAjNzk1NTgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnLicsICdmb28uYmFyJywgJ2Zvb14uYmFyJywgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Nhbm5vdCBzZXQgcHJvcGVydHkgXFwnMVxcJyBvZiB1bmRlZmluZWQsICMyNjUxMScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3JkID0gbmV3IEFycmF5PHZvaWQ+KDEyMykuam9pbignYScpO1xuXHRcdGNvbnN0IHBhdHRlcm4gPSBuZXcgQXJyYXk8dm9pZD4oMTIwKS5qb2luKCdhJyk7XG5cdFx0ZnV6enlTY29yZShwYXR0ZXJuLCBwYXR0ZXJuLnRvTG93ZXJDYXNlKCksIDAsIHdvcmQsIHdvcmQudG9Mb3dlckNhc2UoKSwgMCk7XG5cdFx0YXNzZXJ0Lm9rKHRydWUpOyAvLyBtdXN0IG5vdCBleHBsb2RlXG5cdH0pO1xuXG5cdHRlc3QoJ1ZzY29kZSAxLjEyIG5vIGxvbmdlciBvYmV5cyBcXCdzb3J0VGV4dFxcJyBpbiBjb21wbGV0aW9uIGl0ZW1zIChmcm9tIGxhbmd1YWdlIHNlcnZlciksICMyNjA5NicsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCcgICcsICcgIGdyb3VwJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDIgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnICBnJywgJyAgZ3JvdXAnLCAnICBeZ3JvdXAnLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDIgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZycsICcgIGdyb3VwJywgJyAgXmdyb3VwJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZyBnJywgJyAgZ3JvdXBHcm91cCcsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZyBnJywgJyAgZ3JvdXAgR3JvdXAnLCAnICBeZ3JvdXBeIF5Hcm91cCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJyBnIGcnLCAnICBncm91cCBHcm91cCcsICcgIF5ncm91cF4gXkdyb3VwJywgZnV6enlTY29yZSwgeyBwYXR0ZXJuUG9zOiAxIH0pO1xuXHRcdGFzc2VydE1hdGNoZXMoJ3p6JywgJ3p6R3JvdXAnLCAnXnpeekdyb3VwJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnenpnJywgJ3p6R3JvdXAnLCAnXnpeel5Hcm91cCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2cnLCAnenpHcm91cCcsICd6el5Hcm91cCcsIGZ1enp5U2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXR0ZXJuUG9zIGlzblxcJ3Qgd29ya2luZyBjb3JyZWN0bHkgIzc5ODE1JywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydE1hdGNoZXMoJzpwJy5zdWJzdHIoMSksICdwcm9wJywgJ15wcm9wJywgZnV6enlTY29yZSwgeyBwYXR0ZXJuUG9zOiAwIH0pO1xuXHRcdGFzc2VydE1hdGNoZXMoJzpwJywgJ3Byb3AnLCAnXnByb3AnLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDEgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnOnAnLCAncHJvcCcsIHVuZGVmaW5lZCwgZnV6enlTY29yZSwgeyBwYXR0ZXJuUG9zOiAyIH0pO1xuXHRcdGFzc2VydE1hdGNoZXMoJzpwJywgJ3Byb1AnLCAncHJvXlAnLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDEsIHdvcmRQb3M6IDEgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnOnAnLCAnYXByb3AnLCAnYV5wcm9wJywgZnV6enlTY29yZSwgeyBwYXR0ZXJuUG9zOiAxLCBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlIH0pO1xuXHRcdGFzc2VydE1hdGNoZXMoJzpwJywgJ2Fwcm9wJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDEsIGZpcnN0TWF0Y2hDYW5CZVdlYWs6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhc3NlcnRUb3BTY29yZShmaWx0ZXI6IHR5cGVvZiBmdXp6eVNjb3JlLCBwYXR0ZXJuOiBzdHJpbmcsIGV4cGVjdGVkOiBudW1iZXIsIC4uLndvcmRzOiBzdHJpbmdbXSkge1xuXHRcdGxldCB0b3BTY29yZSA9IC0oMTAwICogMTApO1xuXHRcdGxldCB0b3BJZHggPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgd29yZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHdvcmQgPSB3b3Jkc1tpXTtcblx0XHRcdGNvbnN0IG0gPSBmaWx0ZXIocGF0dGVybiwgcGF0dGVybi50b0xvd2VyQ2FzZSgpLCAwLCB3b3JkLCB3b3JkLnRvTG93ZXJDYXNlKCksIDApO1xuXHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0Y29uc3QgW3Njb3JlXSA9IG07XG5cdFx0XHRcdGlmIChzY29yZSA+IHRvcFNjb3JlKSB7XG5cdFx0XHRcdFx0dG9wU2NvcmUgPSBzY29yZTtcblx0XHRcdFx0XHR0b3BJZHggPSBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b3BJZHgsIGV4cGVjdGVkLCBgJHtwYXR0ZXJufSAtPiBhY3R1YWw9JHt3b3Jkc1t0b3BJZHhdfSA8PiBleHBlY3RlZD0ke3dvcmRzW2V4cGVjdGVkXX1gKTtcblx0fVxuXG5cdHRlc3QoJ3RvcFNjb3JlIC0gZnV6enlTY29yZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdjb25zJywgMiwgJ0FycmF5QnVmZmVyQ29uc3RydWN0b3InLCAnQ29uc29sZScsICdjb25zb2xlJyk7XG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ0ZvbycsIDEsICdmb28nLCAnRm9vJywgJ2ZvbycpO1xuXG5cdFx0Ly8gIzI0OTA0XG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ29uTWVzcycsIDEsICdvbm1lc3NhZ2UnLCAnb25NZXNzYWdlJywgJ29uVGhpc01lZ2FFc2NhcGUnKTtcblxuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdDQycsIDEsICdjYW1lbENhc2UnLCAnQ2FtZWxDYXNlJyk7XG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ2NDJywgMCwgJ2NhbWVsQ2FzZScsICdDYW1lbENhc2UnKTtcblx0XHQvLyBhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnY0MnLCAxLCAnY2Nmb28nLCAnY2FtZWxDYXNlJyk7XG5cdFx0Ly8gYXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ2NDJywgMSwgJ2NjZm9vJywgJ2NhbWVsQ2FzZScsICdmb28tY0MtYmFyJyk7XG5cblx0XHQvLyBpc3N1ZSAjMTc4MzZcblx0XHQvLyBhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnVEVkaXQnLCAxLCAnVGV4dEVkaXRvckRlY29yYXRpb25UeXBlJywgJ1RleHRFZGl0JywgJ1RleHRFZGl0b3InKTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAncCcsIDQsICdwYXJzZScsICdwb3NpeCcsICdwYWZkc2EnLCAncGF0aCcsICdwJyk7XG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ3BhJywgMCwgJ3BhcnNlJywgJ3BhZmRzYScsICdwYXRoJyk7XG5cblx0XHQvLyBpc3N1ZSAjMTQ1ODNcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnbG9nJywgMywgJ0hUTUxPcHRHcm91cEVsZW1lbnQnLCAnU2Nyb2xsTG9naWNhbFBvc2l0aW9uJywgJ1NWR0ZFTW9ycGhvbG9neUVsZW1lbnQnLCAnbG9nJywgJ2xvZ2dlcicpO1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdlJywgMiwgJ0Fic3RyYWN0V29ya2VyJywgJ0FjdGl2ZVhPYmplY3QnLCAnZWxzZScpO1xuXG5cdFx0Ly8gaXNzdWUgIzE0NDQ2XG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ3dvcmtiZW5jaC5zaWRlYicsIDEsICd3b3JrYmVuY2guZWRpdG9yLmRlZmF1bHRTaWRlQnlTaWRlTGF5b3V0JywgJ3dvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJyk7XG5cblx0XHQvLyBpc3N1ZSAjMTE0MjNcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnZWRpdG9yLnInLCAyLCAnZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJywgJ2VkaXRvci5vdmVydmlld1J1bGVybGFuZXMnLCAnZWRpdG9yLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXInLCAnZWRpdG9yLnJlbmRlcldoaXRlc3BhY2UnKTtcblx0XHQvLyBhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnZWRpdG9yLlInLCAxLCAnZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJywgJ2VkaXRvci5vdmVydmlld1J1bGVybGFuZXMnLCAnZWRpdG9yLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXInLCAnZWRpdG9yLnJlbmRlcldoaXRlc3BhY2UnKTtcblx0XHQvLyBhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnRWRpdG9yLnInLCAwLCAnZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJywgJ2VkaXRvci5vdmVydmlld1J1bGVybGFuZXMnLCAnZWRpdG9yLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXInLCAnZWRpdG9yLnJlbmRlcldoaXRlc3BhY2UnKTtcblxuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICctbW8nLCAxLCAnLW1zLWltZS1tb2RlJywgJy1tb3otY29sdW1ucycpO1xuXHRcdC8vIGR1cGUsIGlzc3VlICMxNDg2MVxuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdjb252ZXJ0TW9kZWxQb3NpdGlvbicsIDAsICdjb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uJywgJ2NvbnZlcnRWaWV3VG9Nb2RlbFBvc2l0aW9uJyk7XG5cdFx0Ly8gZHVwZSwgaXNzdWUgIzE0OTQyXG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ2lzJywgMCwgJ2lzVmFsaWRWaWV3bGV0SWQnLCAnaW1wb3J0IHN0YXRlbWVudCcpO1xuXG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ3RpdGxlJywgMSwgJ2ZpbGVzLnRyaW1UcmFpbGluZ1doaXRlc3BhY2UnLCAnd2luZG93LnRpdGxlJyk7XG5cblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnY29uc3QnLCAxLCAnY29uc3RydWN0b3InLCAnY29uc3QnLCAnY3VPbnN0cnVsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgc3VnZ2VzdGlvbiBzY29yaW5nLCAjMjg3OTEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ19saW5lcycsIDEsICdfbGluZVN0YXJ0cycsICdfbGluZXMnKTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnX2xpbmVzJywgMSwgJ19saW5lUycsICdfbGluZXMnKTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnX2xpbmVTJywgMCwgJ19saW5lUycsICdfbGluZXMnKTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdCYWQgY29tcGxldGlvbiByYW5raW5nIGNoYW5nZXMgdmFsaWQgdmFyaWFibGUgbmFtZSB0byBjbGFzcyBuYW1lIHdoZW4gcHJlc3NpbmcgXCIuXCIgIzE4NzA1NScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnYScsIDEsICdBJywgJ2EnKTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAndGhlbWUnLCAxLCAnVGhlbWUnLCAndGhlbWUnKTtcblx0fSk7XG5cblx0dGVzdCgnSFRNTCBjbG9zaW5nIHRhZyBwcm9wb3NhbCBmaWx0ZXJlZCBvdXQgIzM4ODgwJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydE1hdGNoZXMoJ1xcdFxcdDwnLCAnXFx0XFx0PC9ib2R5PicsICdeXFx0XlxcdF48L2JvZHk+JywgZnV6enlTY29yZSwgeyBwYXR0ZXJuUG9zOiAwIH0pO1xuXHRcdGFzc2VydE1hdGNoZXMoJ1xcdFxcdDwnLCAnXFx0XFx0PC9ib2R5PicsICdcXHRcXHRePC9ib2R5PicsIGZ1enp5U2NvcmUsIHsgcGF0dGVyblBvczogMiB9KTtcblx0XHRhc3NlcnRNYXRjaGVzKCdcXHQ8JywgJ1xcdDwvYm9keT4nLCAnXFx0XjwvYm9keT4nLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmVHcmFjZWZ1bCcsICgpID0+IHtcblxuXHRcdGFzc2VydE1hdGNoZXMoJ3JsdXQnLCAncmVzdWx0JywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdybHV0JywgJ3Jlc3VsdCcsICdecmVzXnVebF50JywgZnV6enlTY29yZUdyYWNlZnVsKTtcblxuXHRcdGFzc2VydE1hdGNoZXMoJ2NubycsICdjb25zb2xlJywgJ15jb15uc15vbGUnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdjbm8nLCAnY29uc29sZScsICdeY29ebnNeb2xlJywgZnV6enlTY29yZUdyYWNlZnVsKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdjbm8nLCAnY29uc29sZScsICdeY15vXm5zb2xlJywgZnV6enlTY29yZUdyYWNlZnVsQWdncmVzc2l2ZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnY25vJywgJ2NvX25ldycsICdeY15vX15uZXcnLCBmdXp6eVNjb3JlR3JhY2VmdWwpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2NubycsICdjb19uZXcnLCAnXmNeb19ebmV3JywgZnV6enlTY29yZUdyYWNlZnVsQWdncmVzc2l2ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpc3QgaGlnaGxpZ2h0IGZpbHRlcjogTm90IGFsbCBjaGFyYWN0ZXJzIGZyb20gbWF0Y2ggYXJlIGhpZ2hsaWdodGVyZCAjNjY5MjMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZm9vJywgJ2JhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcl9mb28nLCAnYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyX15mXm9ebycsIGZ1enp5U2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdBdXRvY29tcGxldGlvbiBpcyBtYXRjaGVkIGFnYWluc3QgdHJ1bmNhdGVkIGZpbHRlclRleHQgdG8gNTQgY2hhcmFjdGVycyAjNzQxMzMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TWF0Y2hlcyhcblx0XHRcdCdmb28nLFxuXHRcdFx0J2ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJfZm9vJyxcblx0XHRcdCdmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyX15mXm9ebycsXG5cdFx0XHRmdXp6eVNjb3JlXG5cdFx0KTtcblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J0FvbycsXG5cdFx0XHQnQWZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJfZm9vJyxcblx0XHRcdCdeQWZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJfZl5vXm8nLFxuXHRcdFx0ZnV6enlTY29yZVxuXHRcdCk7XG5cdFx0YXNzZXJ0TWF0Y2hlcyhcblx0XHRcdCdmb28nLFxuXHRcdFx0J0dmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyX2ZvbycsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmdXp6eVNjb3JlXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnXCJHbyB0byBTeW1ib2xcIiB3aXRoIHRoZSBleGFjdCBtZXRob2QgbmFtZSBkb2VzblxcJ3Qgd29yayBhcyBleHBlY3RlZCAjODQ3ODcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSBmdXp6eVNjb3JlKCc6Z2V0JywgJzpnZXQnLCAxLCAnZ2V0JywgJ2dldCcsIDAsIHsgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSwgYm9vc3RGdWxsTWF0Y2g6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKEJvb2xlYW4obWF0Y2gpKTtcblx0fSk7XG5cblx0dGVzdCgnV3JvbmcgaGlnaGxpZ2h0IGFmdGVyIGVtb2ppICMxMTM0MDQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZGknLCAnXHUyNzI4ZGl2IGNsYXNzbmFtZT1cIlwiPjwvZGl2PicsICdcdTI3MjheZF5pdiBjbGFzc25hbWU9XCJcIj48L2Rpdj4nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdkaScsICdhZGl2IGNsYXNzbmFtZT1cIlwiPjwvZGl2PicsICdhZGl2IGNsYXNzbmFtZT1cIlwiPjwvXmReaXY+JywgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N1Z2dlc3Rpb24gaXMgbm90IGhpZ2hsaWdodGVkICM4NTgyNicsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCdTZW1hbnRpY1Rva2VucycsICdTZW1hbnRpY1Rva2Vuc0VkaXRzJywgJ15TXmVebV5hXm5edF5pXmNeVF5vXmteZV5uXnNFZGl0cycsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ1NlbWFudGljVG9rZW5zJywgJ1NlbWFudGljVG9rZW5zRWRpdHMnLCAnXlNeZV5tXmFebl50XmleY15UXm9ea15lXm5ec0VkaXRzJywgZnV6enlTY29yZUdyYWNlZnVsQWdncmVzc2l2ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ludGVsbGlTZW5zZSBjb21wbGV0aW9uIG5vdCBjb3JyZWN0bHkgaGlnaGxpZ2h0aW5nIHRleHQgaW4gZnJvbnQgb2YgY3Vyc29yICMxMTUyNTAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnbG8nLCAnbG9nJywgJ15sXm9nJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnLmxvJywgJ2xvZycsICdebF5vZycsIGFueVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCcuJywgJ2xvZycsICdsb2cnLCBhbnlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FueVNjb3JlIHNob3VsZCBub3QgcmVxdWlyZSBhIHN0cm9uZyBmaXJzdCBtYXRjaCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCdiYXInLCAnZm9vYkFyJywgJ2Zvb15iXkFecicsIGFueVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdiYXInLCAnZm9vYmFyJywgJ2Zvb15iXmFecicsIGFueVNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhYmxlIGZ1bGwgbWF0Y2ggYm9vc3QnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJlZml4ID0gJ2NyZWF0ZSc7XG5cdFx0Y29uc3QgYSA9ICdjcmVhdGVNb2RlbFNlcnZpY2VzJztcblx0XHRjb25zdCBiID0gJ2NyZWF0ZSc7XG5cblx0XHRsZXQgYUJvb3N0ID0gZnV6enlTY29yZShwcmVmaXgsIHByZWZpeCwgMCwgYSwgYS50b0xvd2VyQ2FzZSgpLCAwLCB7IGJvb3N0RnVsbE1hdGNoOiB0cnVlLCBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlIH0pO1xuXHRcdGxldCBiQm9vc3QgPSBmdXp6eVNjb3JlKHByZWZpeCwgcHJlZml4LCAwLCBiLCBiLnRvTG93ZXJDYXNlKCksIDAsIHsgYm9vc3RGdWxsTWF0Y2g6IHRydWUsIGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKGFCb29zdCk7XG5cdFx0YXNzZXJ0Lm9rKGJCb29zdCk7XG5cdFx0YXNzZXJ0Lm9rKGFCb29zdFswXSA8IGJCb29zdFswXSk7XG5cblx0XHQvLyBhbHNvIHdvcmtzIHdpdGggd29yZFN0YXJ0ID4gMCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE4NzkyMSlcblx0XHRjb25zdCB3b3JkUHJlZml4ID0gJyQoc3ltYm9sLWZ1bmN0aW9uKSAnO1xuXHRcdGFCb29zdCA9IGZ1enp5U2NvcmUocHJlZml4LCBwcmVmaXgsIDAsIGAke3dvcmRQcmVmaXh9JHthfWAsIGAke3dvcmRQcmVmaXh9JHthfWAudG9Mb3dlckNhc2UoKSwgd29yZFByZWZpeC5sZW5ndGgsIHsgYm9vc3RGdWxsTWF0Y2g6IHRydWUsIGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUgfSk7XG5cdFx0YkJvb3N0ID0gZnV6enlTY29yZShwcmVmaXgsIHByZWZpeCwgMCwgYCR7d29yZFByZWZpeH0ke2J9YCwgYCR7d29yZFByZWZpeH0ke2J9YC50b0xvd2VyQ2FzZSgpLCB3b3JkUHJlZml4Lmxlbmd0aCwgeyBib29zdEZ1bGxNYXRjaDogdHJ1ZSwgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soYUJvb3N0KTtcblx0XHRhc3NlcnQub2soYkJvb3N0KTtcblx0XHRhc3NlcnQub2soYUJvb3N0WzBdIDwgYkJvb3N0WzBdKTtcblxuXHRcdGNvbnN0IGFTY29yZSA9IGZ1enp5U2NvcmUocHJlZml4LCBwcmVmaXgsIDAsIGEsIGEudG9Mb3dlckNhc2UoKSwgMCwgeyBib29zdEZ1bGxNYXRjaDogZmFsc2UsIGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUgfSk7XG5cdFx0Y29uc3QgYlNjb3JlID0gZnV6enlTY29yZShwcmVmaXgsIHByZWZpeCwgMCwgYiwgYi50b0xvd2VyQ2FzZSgpLCAwLCB7IGJvb3N0RnVsbE1hdGNoOiBmYWxzZSwgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soYVNjb3JlKTtcblx0XHRhc3NlcnQub2soYlNjb3JlKTtcblx0XHRhc3NlcnQub2soYVNjb3JlWzBdID09PSBiU2NvcmVbMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIHN1Z2dlc3QgaGlnaGxpZ2h0aW5nIGlnbm9yZXMgd2hvbGUgd29yZCBtYXRjaCBpbiBmYXZvciBvZiBtYXRjaGluZyBmaXJzdCBsZXR0ZXIjMTQ3NDIzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0TWF0Y2hlcygnaScsICdtYWNoaW5lL3tpZH0nLCAnbWFjaGluZS97XmlkfScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ29rJywgJ29ib2JvYmZ7b2t9L3VzZXInLCAnXm9ib2JvYmZ7b15rfS91c2VyJywgZnV6enlTY29yZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxVQUFVLGVBQWUsWUFBWSxvQkFBb0IsOEJBQTRELGdDQUFnQyxrQkFBa0IsNEJBQTRCLGVBQWUscUJBQXFCLGtCQUFrQixjQUFjLFVBQVU7QUFDMVIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxTQUFTLFFBQWlCLE1BQWMsb0JBQTRCLFlBQStDO0FBQzNILFFBQU0sSUFBSSxPQUFPLE1BQU0sa0JBQWtCO0FBQ3pDLFNBQU8sR0FBRyxHQUFHLElBQUksaUJBQWlCLGtCQUFrQixFQUFFO0FBQ3RELE1BQUksWUFBWTtBQUNmLFdBQU8sZ0JBQWdCLEdBQUcsVUFBVTtBQUFBLEVBQ3JDO0FBQ0Q7QUFFQSxTQUFTLFlBQVksUUFBaUIsTUFBYyxvQkFBNEI7QUFDL0UsU0FBTyxDQUFDLE9BQU8sTUFBTSxrQkFBa0IsR0FBRyxHQUFHLElBQUksWUFBWSxrQkFBa0IsRUFBRTtBQUNsRjtBQUVBLE1BQU0sV0FBVyxNQUFNO0FBQ3RCLDBDQUF3QztBQUV4QyxPQUFLLE1BQU0sTUFBTTtBQUNoQixRQUFJO0FBQ0osUUFBSTtBQUNKLFVBQU0sWUFBWSxTQUFVLEdBQVcsR0FBcUI7QUFFM0QsYUFBTyxXQUFzQjtBQUFFLGlCQUFTLENBQUM7QUFBSyxlQUFPO0FBQUEsTUFBVTtBQUFBLElBQ2hFO0FBRUEsZUFBVyxDQUFDLEdBQUcsQ0FBQztBQUNoQixhQUFTLEdBQUcsVUFBVSxHQUFHLEtBQUssR0FBRyxVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ3BELGdCQUFZLFFBQVEsWUFBWSxVQUFVO0FBQzFDLFdBQU8sZ0JBQWdCLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUV2QyxlQUFXLENBQUMsR0FBRyxDQUFDO0FBQ2hCLGFBQVMsR0FBRyxVQUFVLEdBQUcsSUFBSSxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFD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
