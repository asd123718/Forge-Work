import assert from "assert";
import * as strings from "../../common/strings.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Strings", () => {
  test("equalsIgnoreCase", () => {
    assert(strings.equalsIgnoreCase("", ""));
    assert(!strings.equalsIgnoreCase("", "1"));
    assert(!strings.equalsIgnoreCase("1", ""));
    assert(strings.equalsIgnoreCase("a", "a"));
    assert(strings.equalsIgnoreCase("abc", "Abc"));
    assert(strings.equalsIgnoreCase("abc", "ABC"));
    assert(strings.equalsIgnoreCase("H\xF6henmeter", "H\xD6henmeter"));
    assert(strings.equalsIgnoreCase("\xD6L", "\xD6l"));
  });
  test("equals", () => {
    assert(!strings.equals(void 0, "abc"));
    assert(!strings.equals("abc", void 0));
    assert(strings.equals(void 0, void 0));
    assert(strings.equals("", ""));
    assert(strings.equals("a", "a"));
    assert(!strings.equals("abc", "Abc"));
    assert(strings.equals("abc", "ABC", true));
    assert(!strings.equals("H\xF6henmeter", "H\xD6henmeter"));
    assert(!strings.equals("\xD6L", "\xD6l"));
    assert(strings.equals("\xD6L", "\xD6l", true));
  });
  test("startsWithIgnoreCase", () => {
    assert(strings.startsWithIgnoreCase("", ""));
    assert(!strings.startsWithIgnoreCase("", "1"));
    assert(strings.startsWithIgnoreCase("1", ""));
    assert(strings.startsWithIgnoreCase("a", "a"));
    assert(strings.startsWithIgnoreCase("abc", "Abc"));
    assert(strings.startsWithIgnoreCase("abc", "ABC"));
    assert(strings.startsWithIgnoreCase("H\xF6henmeter", "H\xD6henmeter"));
    assert(strings.startsWithIgnoreCase("\xD6L", "\xD6l"));
    assert(strings.startsWithIgnoreCase("alles klar", "a"));
    assert(strings.startsWithIgnoreCase("alles klar", "A"));
    assert(strings.startsWithIgnoreCase("alles klar", "alles k"));
    assert(strings.startsWithIgnoreCase("alles klar", "alles K"));
    assert(strings.startsWithIgnoreCase("alles klar", "ALLES K"));
    assert(strings.startsWithIgnoreCase("alles klar", "alles klar"));
    assert(strings.startsWithIgnoreCase("alles klar", "ALLES KLAR"));
    assert(!strings.startsWithIgnoreCase("alles klar", " ALLES K"));
    assert(!strings.startsWithIgnoreCase("alles klar", "ALLES K "));
    assert(!strings.startsWithIgnoreCase("alles klar", "\xF6ALLES K "));
    assert(!strings.startsWithIgnoreCase("alles klar", " "));
    assert(!strings.startsWithIgnoreCase("alles klar", "\xF6"));
  });
  test("endsWithIgnoreCase", () => {
    assert(strings.endsWithIgnoreCase("", ""));
    assert(!strings.endsWithIgnoreCase("", "1"));
    assert(strings.endsWithIgnoreCase("1", ""));
    assert(!strings.endsWithIgnoreCase("abcd", "abcde"));
    assert(strings.endsWithIgnoreCase("a", "a"));
    assert(strings.endsWithIgnoreCase("abc", "Abc"));
    assert(strings.endsWithIgnoreCase("abc", "ABC"));
    assert(strings.endsWithIgnoreCase("H\xF6henmeter", "H\xD6henmeter"));
    assert(strings.endsWithIgnoreCase("\xD6L", "\xD6l"));
    assert(strings.endsWithIgnoreCase("alles klar", "r"));
    assert(strings.endsWithIgnoreCase("alles klar", "R"));
    assert(strings.endsWithIgnoreCase("alles klar", "s klar"));
    assert(strings.endsWithIgnoreCase("alles klar", "S klar"));
    assert(strings.endsWithIgnoreCase("alles klar", "S KLAR"));
    assert(strings.endsWithIgnoreCase("alles klar", "alles klar"));
    assert(strings.endsWithIgnoreCase("alles klar", "ALLES KLAR"));
    assert(!strings.endsWithIgnoreCase("alles klar", "S KLAR "));
    assert(!strings.endsWithIgnoreCase("alles klar", " S KLAR"));
    assert(!strings.endsWithIgnoreCase("alles klar", "S KLAR\xF6"));
    assert(!strings.endsWithIgnoreCase("alles klar", " "));
    assert(!strings.endsWithIgnoreCase("alles klar", "\xF6"));
  });
  test("compareIgnoreCase", () => {
    function assertCompareIgnoreCase(a, b, recurse = true) {
      let actual = strings.compareIgnoreCase(a, b);
      actual = actual > 0 ? 1 : actual < 0 ? -1 : actual;
      let expected = strings.compare(a.toLowerCase(), b.toLowerCase());
      expected = expected > 0 ? 1 : expected < 0 ? -1 : expected;
      assert.strictEqual(actual, expected, `${a} <> ${b}`);
      if (recurse) {
        assertCompareIgnoreCase(b, a, false);
      }
    }
    assertCompareIgnoreCase("", "");
    assertCompareIgnoreCase("abc", "ABC");
    assertCompareIgnoreCase("abc", "ABc");
    assertCompareIgnoreCase("abc", "ABcd");
    assertCompareIgnoreCase("abc", "abcd");
    assertCompareIgnoreCase("foo", "f\xF6o");
    assertCompareIgnoreCase("Code", "code");
    assertCompareIgnoreCase("Code", "c\xF6de");
    assertCompareIgnoreCase("B", "a");
    assertCompareIgnoreCase("a", "B");
    assertCompareIgnoreCase("b", "a");
    assertCompareIgnoreCase("a", "b");
    assertCompareIgnoreCase("aa", "ab");
    assertCompareIgnoreCase("aa", "aB");
    assertCompareIgnoreCase("aa", "aA");
    assertCompareIgnoreCase("a", "aa");
    assertCompareIgnoreCase("ab", "aA");
    assertCompareIgnoreCase("O", "/");
  });
  test("compareIgnoreCase (substring)", () => {
    function assertCompareIgnoreCase(a, b, aStart, aEnd, bStart, bEnd, recurse = true) {
      let actual = strings.compareSubstringIgnoreCase(a, b, aStart, aEnd, bStart, bEnd);
      actual = actual > 0 ? 1 : actual < 0 ? -1 : actual;
      let expected = strings.compare(a.toLowerCase().substring(aStart, aEnd), b.toLowerCase().substring(bStart, bEnd));
      expected = expected > 0 ? 1 : expected < 0 ? -1 : expected;
      assert.strictEqual(actual, expected, `${a} <> ${b}`);
      if (recurse) {
        assertCompareIgnoreCase(b, a, bStart, bEnd, aStart, aEnd, false);
      }
    }
    assertCompareIgnoreCase("", "", 0, 0, 0, 0);
    assertCompareIgnoreCase("abc", "ABC", 0, 1, 0, 1);
    assertCompareIgnoreCase("abc", "Aabc", 0, 3, 1, 4);
    assertCompareIgnoreCase("abcABc", "ABcd", 3, 6, 0, 4);
  });
  test("format", () => {
    assert.strictEqual(strings.format("Foo Bar"), "Foo Bar");
    assert.strictEqual(strings.format("Foo {0} Bar"), "Foo {0} Bar");
    assert.strictEqual(strings.format("Foo {0} Bar", "yes"), "Foo yes Bar");
    assert.strictEqual(strings.format("Foo {0} Bar {0}", "yes"), "Foo yes Bar yes");
    assert.strictEqual(strings.format("Foo {0} Bar {1}{2}", "yes"), "Foo yes Bar {1}{2}");
    assert.strictEqual(strings.format("Foo {0} Bar {1}{2}", "yes", void 0), "Foo yes Bar undefined{2}");
    assert.strictEqual(strings.format("Foo {0} Bar {1}{2}", "yes", 5, false), "Foo yes Bar 5false");
    assert.strictEqual(strings.format("Foo {0} Bar. {1}", "(foo)", ".test"), "Foo (foo) Bar. .test");
  });
  test("format2", () => {
    assert.strictEqual(strings.format2("Foo Bar", {}), "Foo Bar");
    assert.strictEqual(strings.format2("Foo {oops} Bar", {}), "Foo {oops} Bar");
    assert.strictEqual(strings.format2("Foo {foo} Bar", { foo: "bar" }), "Foo bar Bar");
    assert.strictEqual(strings.format2("Foo {foo} Bar {foo}", { foo: "bar" }), "Foo bar Bar bar");
    assert.strictEqual(strings.format2("Foo {foo} Bar {bar}{boo}", { foo: "bar" }), "Foo bar Bar {bar}{boo}");
    assert.strictEqual(strings.format2("Foo {foo} Bar {bar}{boo}", { foo: "bar", bar: "undefined" }), "Foo bar Bar undefined{boo}");
    assert.strictEqual(strings.format2("Foo {foo} Bar {bar}{boo}", { foo: "bar", bar: "5", boo: false }), "Foo bar Bar 5false");
    assert.strictEqual(strings.format2("Foo {foo} Bar. {bar}", { foo: "(foo)", bar: ".test" }), "Foo (foo) Bar. .test");
  });
  test("lcut", () => {
    assert.strictEqual(strings.lcut("foo bar", 0), "");
    assert.strictEqual(strings.lcut("foo bar", 1), "bar");
    assert.strictEqual(strings.lcut("foo bar", 3), "bar");
    assert.strictEqual(strings.lcut("foo bar", 4), "bar");
    assert.strictEqual(strings.lcut("foo bar", 5), "foo bar");
    assert.strictEqual(strings.lcut("test string 0.1.2.3", 3), "2.3");
    assert.strictEqual(strings.lcut("foo bar", 0, "\u2026"), "\u2026");
    assert.strictEqual(strings.lcut("foo bar", 1, "\u2026"), "\u2026bar");
    assert.strictEqual(strings.lcut("foo bar", 3, "\u2026"), "\u2026bar");
    assert.strictEqual(strings.lcut("foo bar", 4, "\u2026"), "\u2026bar");
    assert.strictEqual(strings.lcut("foo bar", 5, "\u2026"), "foo bar");
    assert.strictEqual(strings.lcut("test string 0.1.2.3", 3, "\u2026"), "\u20262.3");
    assert.strictEqual(strings.lcut("", 10), "");
    assert.strictEqual(strings.lcut("a", 10), "a");
    assert.strictEqual(strings.lcut(" a", 10), "a");
    assert.strictEqual(strings.lcut("            a", 10), "a");
    assert.strictEqual(strings.lcut(" bbbb       a", 10), "bbbb       a");
    assert.strictEqual(strings.lcut("............a", 10), "............a");
    assert.strictEqual(strings.lcut("", 10, "\u2026"), "");
    assert.strictEqual(strings.lcut("a", 10, "\u2026"), "a");
    assert.strictEqual(strings.lcut(" a", 10, "\u2026"), "a");
    assert.strictEqual(strings.lcut("            a", 10, "\u2026"), "a");
    assert.strictEqual(strings.lcut(" bbbb       a", 10, "\u2026"), "bbbb       a");
    assert.strictEqual(strings.lcut("............a", 10, "\u2026"), "............a");
  });
  test("rcut", () => {
    assert.strictEqual(strings.rcut("foo bar", 0), "");
    assert.strictEqual(strings.rcut("foo bar", 1), "");
    assert.strictEqual(strings.rcut("foo bar", 3), "foo");
    assert.strictEqual(strings.rcut("foo bar", 4), "foo");
    assert.strictEqual(strings.rcut("foo bar", 5), "foo");
    assert.strictEqual(strings.rcut("foo bar", 7), "foo bar");
    assert.strictEqual(strings.rcut("foo bar", 10), "foo bar");
    assert.strictEqual(strings.rcut("test string 0.1.2.3", 6), "test");
    assert.strictEqual(strings.rcut("foo bar", 0, "\u2026"), "\u2026");
    assert.strictEqual(strings.rcut("foo bar", 1, "\u2026"), "\u2026");
    assert.strictEqual(strings.rcut("foo bar", 3, "\u2026"), "foo\u2026");
    assert.strictEqual(strings.rcut("foo bar", 4, "\u2026"), "foo\u2026");
    assert.strictEqual(strings.rcut("foo bar", 5, "\u2026"), "foo\u2026");
    assert.strictEqual(strings.rcut("foo bar", 7, "\u2026"), "foo bar");
    assert.strictEqual(strings.rcut("foo bar", 10, "\u2026"), "foo bar");
    assert.strictEqual(strings.rcut("test string 0.1.2.3", 6, "\u2026"), "test\u2026");
    assert.strictEqual(strings.rcut("", 10), "");
    assert.strictEqual(strings.rcut("a", 10), "a");
    assert.strictEqual(strings.rcut("a ", 10), "a");
    assert.strictEqual(strings.rcut("a            ", 10), "a");
    assert.strictEqual(strings.rcut("a       bbbb ", 10), "a       bbbb");
    assert.strictEqual(strings.rcut("a............", 10), "a............");
    assert.strictEqual(strings.rcut("", 10, "\u2026"), "");
    assert.strictEqual(strings.rcut("a", 10, "\u2026"), "a");
    assert.strictEqual(strings.rcut("a ", 10, "\u2026"), "a");
    assert.strictEqual(strings.rcut("a            ", 10, "\u2026"), "a");
    assert.strictEqual(strings.rcut("a       bbbb ", 10, "\u2026"), "a       bbbb");
    assert.strictEqual(strings.rcut("a............", 10, "\u2026"), "a............");
  });
  test("escape", () => {
    assert.strictEqual(strings.escape(""), "");
    assert.strictEqual(strings.escape("foo"), "foo");
    assert.strictEqual(strings.escape("foo bar"), "foo bar");
    assert.strictEqual(strings.escape("<foo bar>"), "&lt;foo bar&gt;");
    assert.strictEqual(strings.escape("<foo>Hello</foo>"), "&lt;foo&gt;Hello&lt;/foo&gt;");
  });
  test("ltrim", () => {
    assert.strictEqual(strings.ltrim("foo", "f"), "oo");
    assert.strictEqual(strings.ltrim("foo", "o"), "foo");
    assert.strictEqual(strings.ltrim("http://www.test.de", "http://"), "www.test.de");
    assert.strictEqual(strings.ltrim("/foo/", "/"), "foo/");
    assert.strictEqual(strings.ltrim("//foo/", "/"), "foo/");
    assert.strictEqual(strings.ltrim("/", ""), "/");
    assert.strictEqual(strings.ltrim("/", "/"), "");
    assert.strictEqual(strings.ltrim("///", "/"), "");
    assert.strictEqual(strings.ltrim("", ""), "");
    assert.strictEqual(strings.ltrim("", "/"), "");
    assert.strictEqual(strings.ltrim("---hello", "---"), "hello");
    assert.strictEqual(strings.ltrim("------hello", "---"), "hello");
    assert.strictEqual(strings.ltrim("---------hello", "---"), "hello");
    assert.strictEqual(strings.ltrim("hello---", "---"), "hello---");
  });
  test("rtrim", () => {
    assert.strictEqual(strings.rtrim("foo", "o"), "f");
    assert.strictEqual(strings.rtrim("foo", "f"), "foo");
    assert.strictEqual(strings.rtrim("http://www.test.de", ".de"), "http://www.test");
    assert.strictEqual(strings.rtrim("/foo/", "/"), "/foo");
    assert.strictEqual(strings.rtrim("/foo//", "/"), "/foo");
    assert.strictEqual(strings.rtrim("/", ""), "/");
    assert.strictEqual(strings.rtrim("/", "/"), "");
    assert.strictEqual(strings.rtrim("///", "/"), "");
    assert.strictEqual(strings.rtrim("", ""), "");
    assert.strictEqual(strings.rtrim("", "/"), "");
    assert.strictEqual(strings.rtrim("hello---", "---"), "hello");
    assert.strictEqual(strings.rtrim("hello------", "---"), "hello");
    assert.strictEqual(strings.rtrim("hello---------", "---"), "hello");
    assert.strictEqual(strings.rtrim("---hello", "---"), "---hello");
    assert.strictEqual(strings.rtrim("hello world" + "---".repeat(10), "---"), "hello world");
    assert.strictEqual(strings.rtrim("path/to/file///", "//"), "path/to/file/");
  });
  test("trim", () => {
    assert.strictEqual(strings.trim(" foo "), "foo");
    assert.strictEqual(strings.trim("  foo"), "foo");
    assert.strictEqual(strings.trim("bar  "), "bar");
    assert.strictEqual(strings.trim("   "), "");
    assert.strictEqual(strings.trim("foo bar", "bar"), "foo ");
  });
  test("trimWhitespace", () => {
    assert.strictEqual(" foo ".trim(), "foo");
    assert.strictEqual("	 foo	".trim(), "foo");
    assert.strictEqual("  foo".trim(), "foo");
    assert.strictEqual("bar  ".trim(), "bar");
    assert.strictEqual("   ".trim(), "");
    assert.strictEqual(" 	  ".trim(), "");
  });
  test("lastNonWhitespaceIndex", () => {
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc  	 	 "), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc"), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc	"), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc "), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc  	 	 "), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc  	 	 abc 	 	 "), 11);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc  	 	 abc 	 	 ", 8), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("  	 	 "), -1);
  });
  test("containsRTL", () => {
    assert.strictEqual(strings.containsRTL("a"), false);
    assert.strictEqual(strings.containsRTL(""), false);
    assert.strictEqual(strings.containsRTL(strings.UTF8_BOM_CHARACTER + "a"), false);
    assert.strictEqual(strings.containsRTL("hello world!"), false);
    assert.strictEqual(strings.containsRTL("a\u{1F4DA}\u{1F4DA}b"), false);
    assert.strictEqual(strings.containsRTL("\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644"), true);
    assert.strictEqual(strings.containsRTL("\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"), true);
  });
  test("issue #115221: isEmojiImprecise misses \u2B50", () => {
    const codePoint = strings.getNextCodePoint("\u2B50", "\u2B50".length, 0);
    assert.strictEqual(strings.isEmojiImprecise(codePoint), true);
  });
  test("isFullWidthCharacter", () => {
    assert.strictEqual(strings.isFullWidthCharacter("\uFF21".charCodeAt(0)), true, "\uFF21 U+FF21 fullwidth A");
    assert.strictEqual(strings.isFullWidthCharacter("\uFF1F".charCodeAt(0)), true, "\uFF1F U+FF1F fullwidth question mark");
    assert.strictEqual(strings.isFullWidthCharacter("\uFF03".charCodeAt(0)), true, "\uFF03 U+FF03 fullwidth number sign");
    assert.strictEqual(strings.isFullWidthCharacter("\uFF1D".charCodeAt(0)), true, "\uFF1D U+FF1D fullwidth equals sign");
    assert.strictEqual(strings.isFullWidthCharacter("\u3042".charCodeAt(0)), true, "\u3042 U+3042 hiragana");
    assert.strictEqual(strings.isFullWidthCharacter("\uFFE5".charCodeAt(0)), true, "\uFFE5 U+FFE5 fullwidth yen sign");
    assert.strictEqual(strings.isFullWidthCharacter("A".charCodeAt(0)), false, "A regular ASCII");
    assert.strictEqual(strings.isFullWidthCharacter("?".charCodeAt(0)), false, "? regular ASCII");
  });
  test("isBasicASCII", () => {
    function assertIsBasicASCII(str, expected) {
      assert.strictEqual(strings.isBasicASCII(str), expected, str + ` (${str.charCodeAt(0)})`);
    }
    assertIsBasicASCII("abcdefghijklmnopqrstuvwxyz", true);
    assertIsBasicASCII("ABCDEFGHIJKLMNOPQRSTUVWXYZ", true);
    assertIsBasicASCII("1234567890", true);
    assertIsBasicASCII("`~!@#$%^&*()-_=+[{]}\\|;:'\",<.>/?", true);
    assertIsBasicASCII(" ", true);
    assertIsBasicASCII("	", true);
    assertIsBasicASCII("\n", true);
    assertIsBasicASCII("\r", true);
    let ALL = "\r	\n";
    for (let i = 32; i < 127; i++) {
      ALL += String.fromCharCode(i);
    }
    assertIsBasicASCII(ALL, true);
    assertIsBasicASCII(String.fromCharCode(31), false);
    assertIsBasicASCII(String.fromCharCode(127), false);
    assertIsBasicASCII("\xFC", false);
    assertIsBasicASCII("a\u{1F4DA}\u{1F4DA}b", false);
  });
  test("createRegExp", () => {
    assert.throws(() => strings.createRegExp("", false));
    assert.strictEqual(strings.createRegExp("abc", false).source, "abc");
    assert.strictEqual(strings.createRegExp("([^ ,.]*)", false).source, "\\(\\[\\^ ,\\.\\]\\*\\)");
    assert.strictEqual(strings.createRegExp("([^ ,.]*)", true).source, "([^ ,.]*)");
    assert.strictEqual(strings.createRegExp("abc", false, { wholeWord: true }).source, "\\babc\\b");
    assert.strictEqual(strings.createRegExp("abc", true, { wholeWord: true }).source, "\\babc\\b");
    assert.strictEqual(strings.createRegExp(" abc", true, { wholeWord: true }).source, " abc\\b");
    assert.strictEqual(strings.createRegExp("abc ", true, { wholeWord: true }).source, "\\babc ");
    assert.strictEqual(strings.createRegExp(" abc ", true, { wholeWord: true }).source, " abc ");
    const regExpWithoutFlags = strings.createRegExp("abc", true);
    assert(!regExpWithoutFlags.global);
    assert(regExpWithoutFlags.ignoreCase);
    assert(!regExpWithoutFlags.multiline);
    const regExpWithFlags = strings.createRegExp("abc", true, { global: true, matchCase: true, multiline: true });
    assert(regExpWithFlags.global);
    assert(!regExpWithFlags.ignoreCase);
    assert(regExpWithFlags.multiline);
  });
  test("getLeadingWhitespace", () => {
    assert.strictEqual(strings.getLeadingWhitespace("  foo"), "  ");
    assert.strictEqual(strings.getLeadingWhitespace("  foo", 2), "");
    assert.strictEqual(strings.getLeadingWhitespace("  foo", 1, 1), "");
    assert.strictEqual(strings.getLeadingWhitespace("  foo", 0, 1), " ");
    assert.strictEqual(strings.getLeadingWhitespace("  "), "  ");
    assert.strictEqual(strings.getLeadingWhitespace("  ", 1), " ");
    assert.strictEqual(strings.getLeadingWhitespace("  ", 0, 1), " ");
    assert.strictEqual(strings.getLeadingWhitespace("		function foo(){", 0, 1), "	");
    assert.strictEqual(strings.getLeadingWhitespace("		function foo(){", 0, 2), "		");
  });
  test("fuzzyContains", () => {
    assert.ok(!strings.fuzzyContains(void 0, null));
    assert.ok(strings.fuzzyContains("hello world", "h"));
    assert.ok(!strings.fuzzyContains("hello world", "q"));
    assert.ok(strings.fuzzyContains("hello world", "hw"));
    assert.ok(strings.fuzzyContains("hello world", "horl"));
    assert.ok(strings.fuzzyContains("hello world", "d"));
    assert.ok(!strings.fuzzyContains("hello world", "wh"));
    assert.ok(!strings.fuzzyContains("d", "dd"));
    assert.ok(strings.fuzzyContains("hello world", "H"));
    assert.ok(strings.fuzzyContains("Explorer", "E"));
    assert.ok(strings.fuzzyContains("hello world", "HW"));
    assert.ok(strings.fuzzyContains("\u0130ab", "\u0130b"));
    assert.ok(!strings.fuzzyContains("\u0130ab", "\u0130x"));
  });
  test("startsWithUTF8BOM", () => {
    assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER));
    assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER + "a"));
    assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER + "aaaaaaaaaa"));
    assert(!strings.startsWithUTF8BOM(" " + strings.UTF8_BOM_CHARACTER));
    assert(!strings.startsWithUTF8BOM("foo"));
    assert(!strings.startsWithUTF8BOM(""));
  });
  test("stripUTF8BOM", () => {
    assert.strictEqual(strings.stripUTF8BOM(strings.UTF8_BOM_CHARACTER), "");
    assert.strictEqual(strings.stripUTF8BOM(strings.UTF8_BOM_CHARACTER + "foobar"), "foobar");
    assert.strictEqual(strings.stripUTF8BOM("foobar" + strings.UTF8_BOM_CHARACTER), "foobar" + strings.UTF8_BOM_CHARACTER);
    assert.strictEqual(strings.stripUTF8BOM("abc"), "abc");
    assert.strictEqual(strings.stripUTF8BOM(""), "");
  });
  test("containsUppercaseCharacter", () => {
    [
      [null, false],
      ["", false],
      ["foo", false],
      ["f\xF6\xF6", false],
      ["\u0646\u0627\u0643", false],
      ["\u05DE\u05D1\u05D5\u05E1\u05E1\u05EA", false],
      ["\u{1F600}", false],
      ["(#@()*&%()@*#&09827340982374}{:\">?></'\\~`", false],
      ["Foo", true],
      ["FOO", true],
      ["F\xF6\xD6", true],
      ["F\xF6\xD6", true],
      ["\\Foo", true]
    ].forEach(([str, result]) => {
      assert.strictEqual(strings.containsUppercaseCharacter(str), result, `Wrong result for ${str}`);
    });
  });
  test("containsUppercaseCharacter (ignoreEscapedChars)", () => {
    [
      ["\\Woo", false],
      ["f\\S\\S", false],
      ["foo", false],
      ["Foo", true]
    ].forEach(([str, result]) => {
      assert.strictEqual(strings.containsUppercaseCharacter(str, true), result, `Wrong result for ${str}`);
    });
  });
  test("uppercaseFirstLetter", () => {
    [
      ["", ""],
      ["foo", "Foo"],
      ["f", "F"],
      ["123", "123"],
      [".a", ".a"]
    ].forEach(([inStr, result]) => {
      assert.strictEqual(strings.uppercaseFirstLetter(inStr), result, `Wrong result for ${inStr}`);
    });
  });
  test("getNLines", () => {
    assert.strictEqual(strings.getNLines("", 5), "");
    assert.strictEqual(strings.getNLines("foo", 5), "foo");
    assert.strictEqual(strings.getNLines("foo\nbar", 5), "foo\nbar");
    assert.strictEqual(strings.getNLines("foo\nbar", 2), "foo\nbar");
    assert.strictEqual(strings.getNLines("foo\nbar", 1), "foo");
    assert.strictEqual(strings.getNLines("foo\nbar"), "foo");
    assert.strictEqual(strings.getNLines("foo\nbar\nsomething", 2), "foo\nbar");
    assert.strictEqual(strings.getNLines("foo", 0), "");
  });
  test("getGraphemeBreakType", () => {
    assert.strictEqual(strings.getGraphemeBreakType(3009), strings.GraphemeBreakType.SpacingMark);
  });
  test("truncate", () => {
    assert.strictEqual("hello world", strings.truncate("hello world", 100));
    assert.strictEqual("hello\u2026", strings.truncate("hello world", 5));
  });
  test("truncateMiddle", () => {
    assert.strictEqual("hello world", strings.truncateMiddle("hello world", 100));
    assert.strictEqual("he\u2026ld", strings.truncateMiddle("hello world", 5));
    assert.strictEqual("a\u2026de", strings.truncateMiddle("a\u{1F600}bcde", 5));
    assert.strictEqual("ab\u2026f", strings.truncateMiddle("abcde\u{1F600}f", 5));
  });
  test("replaceAsync", async () => {
    let i = 0;
    assert.strictEqual(await strings.replaceAsync("abcabcabcabc", /b(.)/g, async (match, after) => {
      assert.strictEqual(match, "bc");
      assert.strictEqual(after, "c");
      return `${i++}${after}`;
    }), "a0ca1ca2ca3c");
  });
  suite("removeAnsiEscapeCodes", () => {
    function testSequence(sequence) {
      assert.strictEqual(strings.removeAnsiEscapeCodes(`hello${sequence}world`), "helloworld", `expect to remove ${JSON.stringify(sequence)}`);
      assert.deepStrictEqual(
        [...strings.forAnsiStringParts(`hello${sequence}world`)],
        [{ isCode: false, str: "hello" }, { isCode: true, str: sequence }, { isCode: false, str: "world" }],
        `expect to forAnsiStringParts ${JSON.stringify(sequence)}`
      );
    }
    test("CSI sequences", () => {
      const CSI = "\x1B[";
      const sequences = [
        // Base cases from https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Functions-using-CSI-_-ordered-by-the-final-character_s_
        `${CSI}42@`,
        `${CSI}42 @`,
        `${CSI}42A`,
        `${CSI}42 A`,
        `${CSI}42B`,
        `${CSI}42C`,
        `${CSI}42D`,
        `${CSI}42E`,
        `${CSI}42F`,
        `${CSI}42G`,
        `${CSI}42;42H`,
        `${CSI}42I`,
        `${CSI}42J`,
        `${CSI}?42J`,
        `${CSI}42K`,
        `${CSI}?42K`,
        `${CSI}42L`,
        `${CSI}42M`,
        `${CSI}42P`,
        `${CSI}#P`,
        `${CSI}3#P`,
        `${CSI}#Q`,
        `${CSI}3#Q`,
        `${CSI}#R`,
        `${CSI}42S`,
        `${CSI}?1;2;3S`,
        `${CSI}42T`,
        `${CSI}42;42;42;42;42T`,
        `${CSI}>3T`,
        `${CSI}42X`,
        `${CSI}42Z`,
        `${CSI}42^`,
        `${CSI}42\``,
        `${CSI}42a`,
        `${CSI}42b`,
        `${CSI}42c`,
        `${CSI}=42c`,
        `${CSI}>42c`,
        `${CSI}42d`,
        `${CSI}42e`,
        `${CSI}42;42f`,
        `${CSI}42g`,
        `${CSI}3h`,
        `${CSI}?3h`,
        `${CSI}42i`,
        `${CSI}?42i`,
        `${CSI}3l`,
        `${CSI}?3l`,
        `${CSI}3m`,
        `${CSI}>0;0m`,
        `${CSI}>0m`,
        `${CSI}?0m`,
        `${CSI}42n`,
        `${CSI}>42n`,
        `${CSI}?42n`,
        `${CSI}>42p`,
        `${CSI}!p`,
        `${CSI}0;0"p`,
        `${CSI}42$p`,
        `${CSI}?42$p`,
        `${CSI}#p`,
        `${CSI}3#p`,
        `${CSI}>42q`,
        `${CSI}42q`,
        `${CSI}42 q`,
        `${CSI}42"q`,
        `${CSI}#q`,
        `${CSI}42;42r`,
        `${CSI}?3r`,
        `${CSI}0;0;0;0;3$r`,
        `${CSI}s`,
        `${CSI}0;0s`,
        `${CSI}>42s`,
        `${CSI}?3s`,
        `${CSI}42;42;42t`,
        `${CSI}>3t`,
        `${CSI}42 t`,
        `${CSI}0;0;0;0;3$t`,
        `${CSI}u`,
        `${CSI}42 u`,
        `${CSI}0;0;0;0;0;0;0;0$v`,
        `${CSI}42$w`,
        `${CSI}0;0;0;0'w`,
        `${CSI}42x`,
        `${CSI}42*x`,
        `${CSI}0;0;0;0;0$x`,
        `${CSI}42#y`,
        `${CSI}0;0;0;0;0;0*y`,
        `${CSI}42;0'z`,
        `${CSI}0;1;2;4$z`,
        `${CSI}3'{`,
        `${CSI}#{`,
        `${CSI}3#{`,
        `${CSI}0;0;0;0\${`,
        `${CSI}0;0;0;0#|`,
        `${CSI}42$|`,
        `${CSI}42'|`,
        `${CSI}42*|`,
        `${CSI}#}`,
        `${CSI}42'}`,
        `${CSI}42$}`,
        `${CSI}42'~`,
        `${CSI}42$~`,
        // Common SGR cases:
        `${CSI}1;31m`,
        // multiple attrs
        `${CSI}105m`,
        // bright background
        `${CSI}48:5:128m`,
        // 256 indexed color
        `${CSI}48;5;128m`,
        // 256 indexed color alt
        `${CSI}38:2:0:255:255:255m`,
        // truecolor
        `${CSI}38;2;255;255;255m`
        // truecolor alt
      ];
      for (const sequence of sequences) {
        testSequence(sequence);
      }
    });
    suite("OSC sequences", () => {
      function testOscSequence(prefix, suffix) {
        const sequenceContent = [
          `633;SetMark;`,
          `633;P;Cwd=/foo`,
          `7;file://local/Users/me/foo/bar`
        ];
        const sequences = [];
        for (const content of sequenceContent) {
          sequences.push(`${prefix}${content}${suffix}`);
        }
        for (const sequence of sequences) {
          testSequence(sequence);
        }
      }
      test("ESC ] Ps ; Pt ESC \\", () => {
        testOscSequence("\x1B]", "\x1B\\");
      });
      test("ESC ] Ps ; Pt BEL", () => {
        testOscSequence("\x1B]", "\x07");
      });
      test("ESC ] Ps ; Pt ST", () => {
        testOscSequence("\x1B]", "\x9C");
      });
      test("OSC Ps ; Pt ESC \\", () => {
        testOscSequence("\x9D", "\x1B\\");
      });
      test("OSC Ps ; Pt BEL", () => {
        testOscSequence("\x9D", "\x07");
      });
      test("OSC Ps ; Pt ST", () => {
        testOscSequence("\x9D", "\x9C");
      });
    });
    test("ESC sequences", () => {
      const sequenceContent = [
        ` F`,
        ` G`,
        ` L`,
        ` M`,
        ` N`,
        `#3`,
        `#4`,
        `#5`,
        `#6`,
        `#8`,
        `%@`,
        `%G`,
        `(C`,
        `)C`,
        `*C`,
        `+C`,
        `-C`,
        `.C`,
        `/C`
      ];
      const sequences = [];
      for (const content of sequenceContent) {
        sequences.push(`\x1B${content}`);
      }
      for (const sequence of sequences) {
        testSequence(sequence);
      }
    });
    suite("regression tests", () => {
      test("#209937", () => {
        assert.strictEqual(
          strings.removeAnsiEscapeCodes(`localhost:\x1B[31m1234`),
          "localhost:1234"
        );
      });
    });
  });
  test("removeAnsiEscapeCodesFromPrompt", () => {
    assert.strictEqual(strings.removeAnsiEscapeCodesFromPrompt("\x1B[31m$ \x1B[0m"), "$ ");
    assert.strictEqual(strings.removeAnsiEscapeCodesFromPrompt("\n\\[\x1B[01;34m\\]\\w\\[\x1B[00m\\]\n\\[\x1B[1;32m\\]> \\[\x1B[0m\\]"), "\n\\w\n> ");
  });
  test("count", () => {
    assert.strictEqual(strings.count("hello world", "o"), 2);
    assert.strictEqual(strings.count("hello world", "l"), 3);
    assert.strictEqual(strings.count("hello world", "z"), 0);
    assert.strictEqual(strings.count("hello world", "hello"), 1);
    assert.strictEqual(strings.count("hello world", "world"), 1);
    assert.strictEqual(strings.count("hello world", "hello world"), 1);
    assert.strictEqual(strings.count("hello world", "foo"), 0);
  });
  test("containsAmbiguousCharacter", () => {
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("abcd"), false);
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("\xFC\xE5"), false);
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("(*&^)"), false);
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("\u03BF"), true);
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("ab\u0261c"), true);
  });
  test("containsInvisibleCharacter", () => {
    assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter("abcd"), false);
    assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter(" "), true);
    assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter("a\u{E004E}b"), true);
    assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter("a\u{E015A}\vb"), true);
  });
  test("multibyteAwareBtoa", () => {
    assert.ok(strings.multibyteAwareBtoa("hello world").length > 0);
    assert.ok(strings.multibyteAwareBtoa("\u5E73\u4EEE\u540D").length > 0);
    assert.ok(strings.multibyteAwareBtoa(new Array(1e5).fill("vs").join("")).length > 0);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
test("htmlAttributeEncodeValue", () => {
  assert.strictEqual(strings.htmlAttributeEncodeValue(""), "");
  assert.strictEqual(strings.htmlAttributeEncodeValue("abc"), "abc");
  assert.strictEqual(strings.htmlAttributeEncodeValue('<script>alert("Hello")<\/script>'), "&lt;script&gt;alert(&quot;Hello&quot;)&lt;/script&gt;");
  assert.strictEqual(strings.htmlAttributeEncodeValue("Hello & World"), "Hello &amp; World");
  assert.strictEqual(strings.htmlAttributeEncodeValue('"Hello"'), "&quot;Hello&quot;");
  assert.strictEqual(strings.htmlAttributeEncodeValue("'Hello'"), "&apos;Hello&apos;");
  assert.strictEqual(strings.htmlAttributeEncodeValue(`<>&'"`), "&lt;&gt;&amp;&apos;&quot;");
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHN0cmluZ3MudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnU3RyaW5ncycsICgpID0+IHtcblx0dGVzdCgnZXF1YWxzSWdub3JlQ2FzZScsICgpID0+IHtcblx0XHRhc3NlcnQoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKCcnLCAnJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKCcnLCAnMScpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSgnMScsICcnKSk7XG5cblx0XHRhc3NlcnQoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKCdhJywgJ2EnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSgnYWJjJywgJ0FiYycpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKCdhYmMnLCAnQUJDJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UoJ0hcdTAwRjZoZW5tZXRlcicsICdIXHUwMEQ2aGVubWV0ZXInKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSgnXHUwMEQ2TCcsICdcdTAwRDZsJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdlcXVhbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVxdWFscyh1bmRlZmluZWQsICdhYmMnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVxdWFscygnYWJjJywgdW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZXF1YWxzKHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZXF1YWxzKCcnLCAnJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVxdWFscygnYScsICdhJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5lcXVhbHMoJ2FiYycsICdBYmMnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZXF1YWxzKCdhYmMnLCAnQUJDJywgdHJ1ZSkpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5lcXVhbHMoJ0hcdTAwRjZoZW5tZXRlcicsICdIXHUwMEQ2aGVubWV0ZXInKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVxdWFscygnXHUwMEQ2TCcsICdcdTAwRDZsJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVxdWFscygnXHUwMEQ2TCcsICdcdTAwRDZsJywgdHJ1ZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydHNXaXRoSWdub3JlQ2FzZScsICgpID0+IHtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnJywgJycpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJycsICcxJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCcxJywgJycpKTtcblxuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCdhJywgJ2EnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FiYycsICdBYmMnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FiYycsICdBQkMnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ0hcdTAwRjZoZW5tZXRlcicsICdIXHUwMEQ2aGVubWV0ZXInKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ1x1MDBENkwnLCAnXHUwMEQ2bCcpKTtcblxuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ2EnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnQScpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdhbGxlcyBrJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ2FsbGVzIEsnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnQUxMRVMgSycpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdhbGxlcyBrbGFyJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ0FMTEVTIEtMQVInKSk7XG5cblx0XHRhc3NlcnQoIXN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnIEFMTEVTIEsnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ0FMTEVTIEsgJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdcdTAwRjZBTExFUyBLICcpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnICcpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnXHUwMEY2JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmRzV2l0aElnbm9yZUNhc2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCcnLCAnJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJycsICcxJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnMScsICcnKSk7XG5cblx0XHRhc3NlcnQoIXN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhYmNkJywgJ2FiY2RlJykpO1xuXG5cdFx0YXNzZXJ0KHN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhJywgJ2EnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhYmMnLCAnQWJjJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWJjJywgJ0FCQycpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ0hcdTAwRjZoZW5tZXRlcicsICdIXHUwMEQ2aGVubWV0ZXInKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdcdTAwRDZMJywgJ1x1MDBENmwnKSk7XG5cblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAncicpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnUicpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAncyBrbGFyJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdTIGtsYXInKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ1MgS0xBUicpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnYWxsZXMga2xhcicpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnQUxMRVMgS0xBUicpKTtcblxuXHRcdGFzc2VydCghc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnUyBLTEFSICcpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJyBTIEtMQVInKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdTIEtMQVJcdTAwRjYnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICcgJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnXHUwMEY2JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlSWdub3JlQ2FzZScsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKGE6IHN0cmluZywgYjogc3RyaW5nLCByZWN1cnNlID0gdHJ1ZSk6IHZvaWQge1xuXHRcdFx0bGV0IGFjdHVhbCA9IHN0cmluZ3MuY29tcGFyZUlnbm9yZUNhc2UoYSwgYik7XG5cdFx0XHRhY3R1YWwgPSBhY3R1YWwgPiAwID8gMSA6IGFjdHVhbCA8IDAgPyAtMSA6IGFjdHVhbDtcblxuXHRcdFx0bGV0IGV4cGVjdGVkID0gc3RyaW5ncy5jb21wYXJlKGEudG9Mb3dlckNhc2UoKSwgYi50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGV4cGVjdGVkID0gZXhwZWN0ZWQgPiAwID8gMSA6IGV4cGVjdGVkIDwgMCA/IC0xIDogZXhwZWN0ZWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgYCR7YX0gPD4gJHtifWApO1xuXG5cdFx0XHRpZiAocmVjdXJzZSkge1xuXHRcdFx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZShiLCBhLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJycsICcnKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnYWJjJywgJ0FCQycpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhYmMnLCAnQUJjJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FiYycsICdBQmNkJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FiYycsICdhYmNkJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2ZvbycsICdmXHUwMEY2bycpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdDb2RlJywgJ2NvZGUnKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnQ29kZScsICdjXHUwMEY2ZGUnKTtcblxuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdCJywgJ2EnKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnYScsICdCJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2InLCAnYScpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhJywgJ2InKTtcblxuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhYScsICdhYicpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhYScsICdhQicpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhYScsICdhQScpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhJywgJ2FhJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FiJywgJ2FBJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ08nLCAnLycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wYXJlSWdub3JlQ2FzZSAoc3Vic3RyaW5nKScsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKGE6IHN0cmluZywgYjogc3RyaW5nLCBhU3RhcnQ6IG51bWJlciwgYUVuZDogbnVtYmVyLCBiU3RhcnQ6IG51bWJlciwgYkVuZDogbnVtYmVyLCByZWN1cnNlID0gdHJ1ZSk6IHZvaWQge1xuXHRcdFx0bGV0IGFjdHVhbCA9IHN0cmluZ3MuY29tcGFyZVN1YnN0cmluZ0lnbm9yZUNhc2UoYSwgYiwgYVN0YXJ0LCBhRW5kLCBiU3RhcnQsIGJFbmQpO1xuXHRcdFx0YWN0dWFsID0gYWN0dWFsID4gMCA/IDEgOiBhY3R1YWwgPCAwID8gLTEgOiBhY3R1YWw7XG5cblx0XHRcdGxldCBleHBlY3RlZCA9IHN0cmluZ3MuY29tcGFyZShhLnRvTG93ZXJDYXNlKCkuc3Vic3RyaW5nKGFTdGFydCwgYUVuZCksIGIudG9Mb3dlckNhc2UoKS5zdWJzdHJpbmcoYlN0YXJ0LCBiRW5kKSk7XG5cdFx0XHRleHBlY3RlZCA9IGV4cGVjdGVkID4gMCA/IDEgOiBleHBlY3RlZCA8IDAgPyAtMSA6IGV4cGVjdGVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIGAke2F9IDw+ICR7Yn1gKTtcblxuXHRcdFx0aWYgKHJlY3Vyc2UpIHtcblx0XHRcdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoYiwgYSwgYlN0YXJ0LCBiRW5kLCBhU3RhcnQsIGFFbmQsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnJywgJycsIDAsIDAsIDAsIDApO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhYmMnLCAnQUJDJywgMCwgMSwgMCwgMSk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FiYycsICdBYWJjJywgMCwgMywgMSwgNCk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FiY0FCYycsICdBQmNkJywgMywgNiwgMCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvcm1hdCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQoJ0ZvbyBCYXInKSwgJ0ZvbyBCYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQoJ0ZvbyB7MH0gQmFyJyksICdGb28gezB9IEJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdCgnRm9vIHswfSBCYXInLCAneWVzJyksICdGb28geWVzIEJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdCgnRm9vIHswfSBCYXIgezB9JywgJ3llcycpLCAnRm9vIHllcyBCYXIgeWVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0KCdGb28gezB9IEJhciB7MX17Mn0nLCAneWVzJyksICdGb28geWVzIEJhciB7MX17Mn0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQoJ0ZvbyB7MH0gQmFyIHsxfXsyfScsICd5ZXMnLCB1bmRlZmluZWQpLCAnRm9vIHllcyBCYXIgdW5kZWZpbmVkezJ9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0KCdGb28gezB9IEJhciB7MX17Mn0nLCAneWVzJywgNSwgZmFsc2UpLCAnRm9vIHllcyBCYXIgNWZhbHNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0KCdGb28gezB9IEJhci4gezF9JywgJyhmb28pJywgJy50ZXN0JyksICdGb28gKGZvbykgQmFyLiAudGVzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JtYXQyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdDIoJ0ZvbyBCYXInLCB7fSksICdGb28gQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0MignRm9vIHtvb3BzfSBCYXInLCB7fSksICdGb28ge29vcHN9IEJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdDIoJ0ZvbyB7Zm9vfSBCYXInLCB7IGZvbzogJ2JhcicgfSksICdGb28gYmFyIEJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdDIoJ0ZvbyB7Zm9vfSBCYXIge2Zvb30nLCB7IGZvbzogJ2JhcicgfSksICdGb28gYmFyIEJhciBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQyKCdGb28ge2Zvb30gQmFyIHtiYXJ9e2Jvb30nLCB7IGZvbzogJ2JhcicgfSksICdGb28gYmFyIEJhciB7YmFyfXtib299Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0MignRm9vIHtmb299IEJhciB7YmFyfXtib299JywgeyBmb286ICdiYXInLCBiYXI6ICd1bmRlZmluZWQnIH0pLCAnRm9vIGJhciBCYXIgdW5kZWZpbmVke2Jvb30nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQyKCdGb28ge2Zvb30gQmFyIHtiYXJ9e2Jvb30nLCB7IGZvbzogJ2JhcicsIGJhcjogJzUnLCBib286IGZhbHNlIH0pLCAnRm9vIGJhciBCYXIgNWZhbHNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0MignRm9vIHtmb299IEJhci4ge2Jhcn0nLCB7IGZvbzogJyhmb28pJywgYmFyOiAnLnRlc3QnIH0pLCAnRm9vIChmb28pIEJhci4gLnRlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnbGN1dCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgMCksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgMSksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgMyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgNCksICdiYXInKTsgLy8gTGVhZGluZyB3aGl0ZXNwYWNlIHRyaW1tZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgNSksICdmb28gYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgndGVzdCBzdHJpbmcgMC4xLjIuMycsIDMpLCAnMi4zJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgMCwgJ1x1MjAyNicpLCAnXHUyMDI2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnZm9vIGJhcicsIDEsICdcdTIwMjYnKSwgJ1x1MjAyNmJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2ZvbyBiYXInLCAzLCAnXHUyMDI2JyksICdcdTIwMjZiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgNCwgJ1x1MjAyNicpLCAnXHUyMDI2YmFyJyk7IC8vIExlYWRpbmcgd2hpdGVzcGFjZSB0cmltbWVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnZm9vIGJhcicsIDUsICdcdTIwMjYnKSwgJ2ZvbyBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCd0ZXN0IHN0cmluZyAwLjEuMi4zJywgMywgJ1x1MjAyNicpLCAnXHUyMDI2Mi4zJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCcnLCAxMCksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdhJywgMTApLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJyBhJywgMTApLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJyAgICAgICAgICAgIGEnLCAxMCksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnIGJiYmIgICAgICAgYScsIDEwKSwgJ2JiYmIgICAgICAgYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJy4uLi4uLi4uLi4uLmEnLCAxMCksICcuLi4uLi4uLi4uLi5hJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCcnLCAxMCwgJ1x1MjAyNicpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnYScsIDEwLCAnXHUyMDI2JyksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnIGEnLCAxMCwgJ1x1MjAyNicpLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJyAgICAgICAgICAgIGEnLCAxMCwgJ1x1MjAyNicpLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJyBiYmJiICAgICAgIGEnLCAxMCwgJ1x1MjAyNicpLCAnYmJiYiAgICAgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnLi4uLi4uLi4uLi4uYScsIDEwLCAnXHUyMDI2JyksICcuLi4uLi4uLi4uLi5hJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JjdXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDApLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDEpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDMpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDQpLCAnZm9vJyk7IC8vIFRyYWlsaW5nIHdoaXRlc3BhY2UgdHJpbW1lZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2ZvbyBiYXInLCA1KSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2ZvbyBiYXInLCA3KSwgJ2ZvbyBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgMTApLCAnZm9vIGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ3Rlc3Qgc3RyaW5nIDAuMS4yLjMnLCA2KSwgJ3Rlc3QnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2ZvbyBiYXInLCAwLCAnXHUyMDI2JyksICdcdTIwMjYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgMSwgJ1x1MjAyNicpLCAnXHUyMDI2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDMsICdcdTIwMjYnKSwgJ2Zvb1x1MjAyNicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2ZvbyBiYXInLCA0LCAnXHUyMDI2JyksICdmb29cdTIwMjYnKTsgLy8gVHJhaWxpbmcgd2hpdGVzcGFjZSB0cmltbWVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDUsICdcdTIwMjYnKSwgJ2Zvb1x1MjAyNicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2ZvbyBiYXInLCA3LCAnXHUyMDI2JyksICdmb28gYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDEwLCAnXHUyMDI2JyksICdmb28gYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgndGVzdCBzdHJpbmcgMC4xLjIuMycsIDYsICdcdTIwMjYnKSwgJ3Rlc3RcdTIwMjYnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJycsIDEwKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2EnLCAxMCksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnYSAnLCAxMCksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnYSAgICAgICAgICAgICcsIDEwKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhICAgICAgIGJiYmIgJywgMTApLCAnYSAgICAgICBiYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnYS4uLi4uLi4uLi4uLicsIDEwKSwgJ2EuLi4uLi4uLi4uLi4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJycsIDEwLCAnXHUyMDI2JyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhJywgMTAsICdcdTIwMjYnKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhICcsIDEwLCAnXHUyMDI2JyksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnYSAgICAgICAgICAgICcsIDEwLCAnXHUyMDI2JyksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnYSAgICAgICBiYmJiICcsIDEwLCAnXHUyMDI2JyksICdhICAgICAgIGJiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhLi4uLi4uLi4uLi4uJywgMTAsICdcdTIwMjYnKSwgJ2EuLi4uLi4uLi4uLi4nKTtcblx0fSk7XG5cblx0dGVzdCgnZXNjYXBlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmVzY2FwZSgnJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5lc2NhcGUoJ2ZvbycpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZXNjYXBlKCdmb28gYmFyJyksICdmb28gYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZXNjYXBlKCc8Zm9vIGJhcj4nKSwgJyZsdDtmb28gYmFyJmd0OycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmVzY2FwZSgnPGZvbz5IZWxsbzwvZm9vPicpLCAnJmx0O2ZvbyZndDtIZWxsbyZsdDsvZm9vJmd0OycpO1xuXHR9KTtcblxuXHR0ZXN0KCdsdHJpbScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnZm9vJywgJ2YnKSwgJ29vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubHRyaW0oJ2ZvbycsICdvJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnaHR0cDovL3d3dy50ZXN0LmRlJywgJ2h0dHA6Ly8nKSwgJ3d3dy50ZXN0LmRlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubHRyaW0oJy9mb28vJywgJy8nKSwgJ2Zvby8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnLy9mb28vJywgJy8nKSwgJ2Zvby8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnLycsICcnKSwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnLycsICcvJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnLy8vJywgJy8nKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCcnLCAnJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnJywgJy8nKSwgJycpO1xuXHRcdC8vIE11bHRpLWNoYXJhY3RlciBuZWVkbGUgd2l0aCBjb25zZWN1dGl2ZSByZXBldGl0aW9uc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCctLS1oZWxsbycsICctLS0nKSwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubHRyaW0oJy0tLS0tLWhlbGxvJywgJy0tLScpLCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnLS0tLS0tLS0taGVsbG8nLCAnLS0tJyksICdoZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCdoZWxsby0tLScsICctLS0nKSwgJ2hlbGxvLS0tJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J0cmltJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJ0cmltKCdmb28nLCAnbycpLCAnZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJ0cmltKCdmb28nLCAnZicpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJ2h0dHA6Ly93d3cudGVzdC5kZScsICcuZGUnKSwgJ2h0dHA6Ly93d3cudGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJ0cmltKCcvZm9vLycsICcvJyksICcvZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJy9mb28vLycsICcvJyksICcvZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJy8nLCAnJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJy8nLCAnLycpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJy8vLycsICcvJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnJywgJycpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJycsICcvJyksICcnKTtcblx0XHQvLyBNdWx0aS1jaGFyYWN0ZXIgbmVlZGxlIHdpdGggY29uc2VjdXRpdmUgcmVwZXRpdGlvbnMgKGJ1ZyBmaXgpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJ2hlbGxvLS0tJywgJy0tLScpLCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnaGVsbG8tLS0tLS0nLCAnLS0tJyksICdoZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJ0cmltKCdoZWxsby0tLS0tLS0tLScsICctLS0nKSwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJy0tLWhlbGxvJywgJy0tLScpLCAnLS0taGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnaGVsbG8gd29ybGQnICsgJy0tLScucmVwZWF0KDEwKSwgJy0tLScpLCAnaGVsbG8gd29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgncGF0aC90by9maWxlLy8vJywgJy8vJyksICdwYXRoL3RvL2ZpbGUvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaW0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MudHJpbSgnIGZvbyAnKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnRyaW0oJyAgZm9vJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy50cmltKCdiYXIgICcpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MudHJpbSgnICAgJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy50cmltKCdmb28gYmFyJywgJ2JhcicpLCAnZm9vICcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmltV2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyBmb28gJy50cmltKCksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ1x0IGZvb1x0Jy50cmltKCksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyAgZm9vJy50cmltKCksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ2JhciAgJy50cmltKCksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyAgICcudHJpbSgpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCcgXHQgICcudHJpbSgpLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhc3ROb25XaGl0ZXNwYWNlSW5kZXgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleCgnYWJjICBcXHQgXFx0ICcpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KCdhYmMnKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleCgnYWJjXFx0JyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgoJ2FiYyAnKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleCgnYWJjICBcXHQgXFx0ICcpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KCdhYmMgIFxcdCBcXHQgYWJjIFxcdCBcXHQgJyksIDExKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KCdhYmMgIFxcdCBcXHQgYWJjIFxcdCBcXHQgJywgOCksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgoJyAgXFx0IFxcdCAnKSwgLTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250YWluc1JUTCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb250YWluc1JUTCgnYScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY29udGFpbnNSVEwoJycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY29udGFpbnNSVEwoc3RyaW5ncy5VVEY4X0JPTV9DSEFSQUNURVIgKyAnYScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY29udGFpbnNSVEwoJ2hlbGxvIHdvcmxkIScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY29udGFpbnNSVEwoJ2FcdUQ4M0RcdURDREFcdUQ4M0RcdURDREFiJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb250YWluc1JUTCgnXHUwNjQ3XHUwNjQ2XHUwNjI3XHUwNjQzIFx1MDYyRFx1MDY0Mlx1MDY0QVx1MDY0Mlx1MDYyOSBcdTA2NDVcdTA2MkJcdTA2MjhcdTA2MkFcdTA2MjkgXHUwNjQ1XHUwNjQ2XHUwNjMwIFx1MDYzMlx1MDY0NVx1MDY0NiBcdTA2MzdcdTA2NDhcdTA2NEFcdTA2NDQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY29udGFpbnNSVEwoJ1x1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENScpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExNTIyMTogaXNFbW9qaUltcHJlY2lzZSBtaXNzZXMgXHUyQjUwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvZGVQb2ludCA9IHN0cmluZ3MuZ2V0TmV4dENvZGVQb2ludCgnXHUyQjUwJywgJ1x1MkI1MCcubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Vtb2ppSW1wcmVjaXNlKGNvZGVQb2ludCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0Z1bGxXaWR0aENoYXJhY3RlcicsICgpID0+IHtcblx0XHQvLyBGdWxsd2lkdGggQVNDSUkgKEZGMDEtRkY1RSlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcignXHVGRjIxJy5jaGFyQ29kZUF0KDApKSwgdHJ1ZSwgJ1x1RkYyMSBVK0ZGMjEgZnVsbHdpZHRoIEEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcignXHVGRjFGJy5jaGFyQ29kZUF0KDApKSwgdHJ1ZSwgJ1x1RkYxRiBVK0ZGMUYgZnVsbHdpZHRoIHF1ZXN0aW9uIG1hcmsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcignXHVGRjAzJy5jaGFyQ29kZUF0KDApKSwgdHJ1ZSwgJ1x1RkYwMyBVK0ZGMDMgZnVsbHdpZHRoIG51bWJlciBzaWduJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIoJ1x1RkYxRCcuY2hhckNvZGVBdCgwKSksIHRydWUsICdcdUZGMUQgVStGRjFEIGZ1bGx3aWR0aCBlcXVhbHMgc2lnbicpO1xuXG5cdFx0Ly8gSGlyYWdhbmEgKDMwNDAtMzA5Rilcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcignXHUzMDQyJy5jaGFyQ29kZUF0KDApKSwgdHJ1ZSwgJ1x1MzA0MiBVKzMwNDIgaGlyYWdhbmEnKTtcblxuXHRcdC8vIEZ1bGx3aWR0aCBzeW1ib2xzIChGRkUwLUZGRTYpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIoJ1x1RkZFNScuY2hhckNvZGVBdCgwKSksIHRydWUsICdcdUZGRTUgVStGRkU1IGZ1bGx3aWR0aCB5ZW4gc2lnbicpO1xuXG5cdFx0Ly8gUmVndWxhciBBU0NJSSBzaG91bGQgbm90IGJlIGZ1bGwgd2lkdGhcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcignQScuY2hhckNvZGVBdCgwKSksIGZhbHNlLCAnQSByZWd1bGFyIEFTQ0lJJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIoJz8nLmNoYXJDb2RlQXQoMCkpLCBmYWxzZSwgJz8gcmVndWxhciBBU0NJSScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0Jhc2ljQVNDSUknLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gYXNzZXJ0SXNCYXNpY0FTQ0lJKHN0cjogc3RyaW5nLCBleHBlY3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaXNCYXNpY0FTQ0lJKHN0ciksIGV4cGVjdGVkLCBzdHIgKyBgICgke3N0ci5jaGFyQ29kZUF0KDApfSlgKTtcblx0XHR9XG5cdFx0YXNzZXJ0SXNCYXNpY0FTQ0lJKCdhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eicsIHRydWUpO1xuXHRcdGFzc2VydElzQmFzaWNBU0NJSSgnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonLCB0cnVlKTtcblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoJzEyMzQ1Njc4OTAnLCB0cnVlKTtcblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoJ2B+IUAjJCVeJiooKS1fPStbe119XFxcXHw7OlxcJ1wiLDwuPi8/JywgdHJ1ZSk7XG5cdFx0YXNzZXJ0SXNCYXNpY0FTQ0lJKCcgJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0SXNCYXNpY0FTQ0lJKCdcXHQnLCB0cnVlKTtcblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoJ1xcbicsIHRydWUpO1xuXHRcdGFzc2VydElzQmFzaWNBU0NJSSgnXFxyJywgdHJ1ZSk7XG5cblx0XHRsZXQgQUxMID0gJ1xcclxcdFxcbic7XG5cdFx0Zm9yIChsZXQgaSA9IDMyOyBpIDwgMTI3OyBpKyspIHtcblx0XHRcdEFMTCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGkpO1xuXHRcdH1cblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoQUxMLCB0cnVlKTtcblxuXHRcdGFzc2VydElzQmFzaWNBU0NJSShTdHJpbmcuZnJvbUNoYXJDb2RlKDMxKSwgZmFsc2UpO1xuXHRcdGFzc2VydElzQmFzaWNBU0NJSShTdHJpbmcuZnJvbUNoYXJDb2RlKDEyNyksIGZhbHNlKTtcblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoJ1x1MDBGQycsIGZhbHNlKTtcblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoJ2FcdUQ4M0RcdURDREFcdUQ4M0RcdURDREFiJywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVSZWdFeHAnLCAoKSA9PiB7XG5cdFx0Ly8gRW1wdHlcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHN0cmluZ3MuY3JlYXRlUmVnRXhwKCcnLCBmYWxzZSkpO1xuXG5cdFx0Ly8gRXNjYXBlcyBhcHByb3ByaWF0ZWx5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY3JlYXRlUmVnRXhwKCdhYmMnLCBmYWxzZSkuc291cmNlLCAnYWJjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY3JlYXRlUmVnRXhwKCcoW14gLC5dKiknLCBmYWxzZSkuc291cmNlLCAnXFxcXChcXFxcW1xcXFxeICxcXFxcLlxcXFxdXFxcXCpcXFxcKScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNyZWF0ZVJlZ0V4cCgnKFteICwuXSopJywgdHJ1ZSkuc291cmNlLCAnKFteICwuXSopJyk7XG5cblx0XHQvLyBXaG9sZSB3b3JkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY3JlYXRlUmVnRXhwKCdhYmMnLCBmYWxzZSwgeyB3aG9sZVdvcmQ6IHRydWUgfSkuc291cmNlLCAnXFxcXGJhYmNcXFxcYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNyZWF0ZVJlZ0V4cCgnYWJjJywgdHJ1ZSwgeyB3aG9sZVdvcmQ6IHRydWUgfSkuc291cmNlLCAnXFxcXGJhYmNcXFxcYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNyZWF0ZVJlZ0V4cCgnIGFiYycsIHRydWUsIHsgd2hvbGVXb3JkOiB0cnVlIH0pLnNvdXJjZSwgJyBhYmNcXFxcYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNyZWF0ZVJlZ0V4cCgnYWJjICcsIHRydWUsIHsgd2hvbGVXb3JkOiB0cnVlIH0pLnNvdXJjZSwgJ1xcXFxiYWJjICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNyZWF0ZVJlZ0V4cCgnIGFiYyAnLCB0cnVlLCB7IHdob2xlV29yZDogdHJ1ZSB9KS5zb3VyY2UsICcgYWJjICcpO1xuXG5cdFx0Y29uc3QgcmVnRXhwV2l0aG91dEZsYWdzID0gc3RyaW5ncy5jcmVhdGVSZWdFeHAoJ2FiYycsIHRydWUpO1xuXHRcdGFzc2VydCghcmVnRXhwV2l0aG91dEZsYWdzLmdsb2JhbCk7XG5cdFx0YXNzZXJ0KHJlZ0V4cFdpdGhvdXRGbGFncy5pZ25vcmVDYXNlKTtcblx0XHRhc3NlcnQoIXJlZ0V4cFdpdGhvdXRGbGFncy5tdWx0aWxpbmUpO1xuXG5cdFx0Y29uc3QgcmVnRXhwV2l0aEZsYWdzID0gc3RyaW5ncy5jcmVhdGVSZWdFeHAoJ2FiYycsIHRydWUsIHsgZ2xvYmFsOiB0cnVlLCBtYXRjaENhc2U6IHRydWUsIG11bHRpbGluZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQocmVnRXhwV2l0aEZsYWdzLmdsb2JhbCk7XG5cdFx0YXNzZXJ0KCFyZWdFeHBXaXRoRmxhZ3MuaWdub3JlQ2FzZSk7XG5cdFx0YXNzZXJ0KHJlZ0V4cFdpdGhGbGFncy5tdWx0aWxpbmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMZWFkaW5nV2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZSgnICBmb28nKSwgJyAgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UoJyAgZm9vJywgMiksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZSgnICBmb28nLCAxLCAxKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKCcgIGZvbycsIDAsIDEpLCAnICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKCcgICcpLCAnICAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZSgnICAnLCAxKSwgJyAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZSgnICAnLCAwLCAxKSwgJyAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZSgnXFx0XFx0ZnVuY3Rpb24gZm9vKCl7JywgMCwgMSksICdcXHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZSgnXFx0XFx0ZnVuY3Rpb24gZm9vKCl7JywgMCwgMiksICdcXHRcXHQnKTtcblx0fSk7XG5cblx0dGVzdCgnZnV6enlDb250YWlucycsICgpID0+IHtcblx0XHRhc3NlcnQub2soIXN0cmluZ3MuZnV6enlDb250YWlucygodW5kZWZpbmVkKSEsIG51bGwhKSk7XG5cdFx0YXNzZXJ0Lm9rKHN0cmluZ3MuZnV6enlDb250YWlucygnaGVsbG8gd29ybGQnLCAnaCcpKTtcblx0XHRhc3NlcnQub2soIXN0cmluZ3MuZnV6enlDb250YWlucygnaGVsbG8gd29ybGQnLCAncScpKTtcblx0XHRhc3NlcnQub2soc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdoZWxsbyB3b3JsZCcsICdodycpKTtcblx0XHRhc3NlcnQub2soc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdoZWxsbyB3b3JsZCcsICdob3JsJykpO1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLmZ1enp5Q29udGFpbnMoJ2hlbGxvIHdvcmxkJywgJ2QnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFzdHJpbmdzLmZ1enp5Q29udGFpbnMoJ2hlbGxvIHdvcmxkJywgJ3doJykpO1xuXHRcdGFzc2VydC5vayghc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdkJywgJ2RkJykpO1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLmZ1enp5Q29udGFpbnMoJ2hlbGxvIHdvcmxkJywgJ0gnKSk7XG5cdFx0YXNzZXJ0Lm9rKHN0cmluZ3MuZnV6enlDb250YWlucygnRXhwbG9yZXInLCAnRScpKTtcblx0XHRhc3NlcnQub2soc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdoZWxsbyB3b3JsZCcsICdIVycpKTtcblx0XHQvLyB0b0xvd2VyQ2FzZSgpIGNhbiBsZW5ndGhlbiB0aGUgcXVlcnkgKFx1MDEzMCAtPiBpXHUwMzA3KTsgZXZlcnkgbG93ZXJlZCBjb2RlIHVuaXQgbXVzdCBzdGlsbCBiZSBtYXRjaGVkXG5cdFx0YXNzZXJ0Lm9rKHN0cmluZ3MuZnV6enlDb250YWlucygnXFx1MDEzMGFiJywgJ1xcdTAxMzBiJykpO1xuXHRcdGFzc2VydC5vayghc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdcXHUwMTMwYWInLCAnXFx1MDEzMHgnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0c1dpdGhVVEY4Qk9NJywgKCkgPT4ge1xuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhVVEY4Qk9NKHN0cmluZ3MuVVRGOF9CT01fQ0hBUkFDVEVSKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aFVURjhCT00oc3RyaW5ncy5VVEY4X0JPTV9DSEFSQUNURVIgKyAnYScpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoVVRGOEJPTShzdHJpbmdzLlVURjhfQk9NX0NIQVJBQ1RFUiArICdhYWFhYWFhYWFhJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5zdGFydHNXaXRoVVRGOEJPTSgnICcgKyBzdHJpbmdzLlVURjhfQk9NX0NIQVJBQ1RFUikpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5zdGFydHNXaXRoVVRGOEJPTSgnZm9vJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5zdGFydHNXaXRoVVRGOEJPTSgnJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcFVURjhCT00nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3Muc3RyaXBVVEY4Qk9NKHN0cmluZ3MuVVRGOF9CT01fQ0hBUkFDVEVSKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnN0cmlwVVRGOEJPTShzdHJpbmdzLlVURjhfQk9NX0NIQVJBQ1RFUiArICdmb29iYXInKSwgJ2Zvb2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnN0cmlwVVRGOEJPTSgnZm9vYmFyJyArIHN0cmluZ3MuVVRGOF9CT01fQ0hBUkFDVEVSKSwgJ2Zvb2JhcicgKyBzdHJpbmdzLlVURjhfQk9NX0NIQVJBQ1RFUik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3Muc3RyaXBVVEY4Qk9NKCdhYmMnKSwgJ2FiYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnN0cmlwVVRGOEJPTSgnJyksICcnKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGFpbnNVcHBlcmNhc2VDaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0W1xuXHRcdFx0W251bGwsIGZhbHNlXSxcblx0XHRcdFsnJywgZmFsc2VdLFxuXHRcdFx0Wydmb28nLCBmYWxzZV0sXG5cdFx0XHRbJ2ZcdTAwRjZcdTAwRjYnLCBmYWxzZV0sXG5cdFx0XHRbJ1x1MDY0Nlx1MDYyN1x1MDY0MycsIGZhbHNlXSxcblx0XHRcdFsnXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBJywgZmFsc2VdLFxuXHRcdFx0WydcdUQ4M0RcdURFMDAnLCBmYWxzZV0sXG5cdFx0XHRbJygjQCgpKiYlKClAKiMmMDk4MjczNDA5ODIzNzR9ezpcIj4/PjwvXFwnXFxcXH5gJywgZmFsc2VdLFxuXG5cdFx0XHRbJ0ZvbycsIHRydWVdLFxuXHRcdFx0WydGT08nLCB0cnVlXSxcblx0XHRcdFsnRlx1MDBGNlx1MDBENicsIHRydWVdLFxuXHRcdFx0WydGXHUwMEY2XHUwMEQ2JywgdHJ1ZV0sXG5cdFx0XHRbJ1xcXFxGb28nLCB0cnVlXSxcblx0XHRdLmZvckVhY2goKFtzdHIsIHJlc3VsdF0pID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNvbnRhaW5zVXBwZXJjYXNlQ2hhcmFjdGVyKDxzdHJpbmc+c3RyKSwgcmVzdWx0LCBgV3JvbmcgcmVzdWx0IGZvciAke3N0cn1gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29udGFpbnNVcHBlcmNhc2VDaGFyYWN0ZXIgKGlnbm9yZUVzY2FwZWRDaGFycyknLCAoKSA9PiB7XG5cdFx0W1xuXHRcdFx0WydcXFxcV29vJywgZmFsc2VdLFxuXHRcdFx0WydmXFxcXFNcXFxcUycsIGZhbHNlXSxcblx0XHRcdFsnZm9vJywgZmFsc2VdLFxuXG5cdFx0XHRbJ0ZvbycsIHRydWVdLFxuXHRcdF0uZm9yRWFjaCgoW3N0ciwgcmVzdWx0XSkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY29udGFpbnNVcHBlcmNhc2VDaGFyYWN0ZXIoPHN0cmluZz5zdHIsIHRydWUpLCByZXN1bHQsIGBXcm9uZyByZXN1bHQgZm9yICR7c3RyfWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cHBlcmNhc2VGaXJzdExldHRlcicsICgpID0+IHtcblx0XHRbXG5cdFx0XHRbJycsICcnXSxcblx0XHRcdFsnZm9vJywgJ0ZvbyddLFxuXHRcdFx0WydmJywgJ0YnXSxcblx0XHRcdFsnMTIzJywgJzEyMyddLFxuXHRcdFx0WycuYScsICcuYSddLFxuXHRcdF0uZm9yRWFjaCgoW2luU3RyLCByZXN1bHRdKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy51cHBlcmNhc2VGaXJzdExldHRlcihpblN0ciksIHJlc3VsdCwgYFdyb25nIHJlc3VsdCBmb3IgJHtpblN0cn1gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TkxpbmVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldE5MaW5lcygnJywgNSksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXROTGluZXMoJ2ZvbycsIDUpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TkxpbmVzKCdmb29cXG5iYXInLCA1KSwgJ2Zvb1xcbmJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldE5MaW5lcygnZm9vXFxuYmFyJywgMiksICdmb29cXG5iYXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldE5MaW5lcygnZm9vXFxuYmFyJywgMSksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXROTGluZXMoJ2Zvb1xcbmJhcicpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TkxpbmVzKCdmb29cXG5iYXJcXG5zb21ldGhpbmcnLCAyKSwgJ2Zvb1xcbmJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldE5MaW5lcygnZm9vJywgMCksICcnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0R3JhcGhlbWVCcmVha1R5cGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0R3JhcGhlbWVCcmVha1R5cGUoMHhCQzEpLCBzdHJpbmdzLkdyYXBoZW1lQnJlYWtUeXBlLlNwYWNpbmdNYXJrKTtcblx0fSk7XG5cblx0dGVzdCgndHJ1bmNhdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCdoZWxsbyB3b3JsZCcsIHN0cmluZ3MudHJ1bmNhdGUoJ2hlbGxvIHdvcmxkJywgMTAwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCdoZWxsb1x1MjAyNicsIHN0cmluZ3MudHJ1bmNhdGUoJ2hlbGxvIHdvcmxkJywgNSkpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnVuY2F0ZU1pZGRsZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ2hlbGxvIHdvcmxkJywgc3RyaW5ncy50cnVuY2F0ZU1pZGRsZSgnaGVsbG8gd29ybGQnLCAxMDApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ2hlXHUyMDI2bGQnLCBzdHJpbmdzLnRydW5jYXRlTWlkZGxlKCdoZWxsbyB3b3JsZCcsIDUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ2FcdTIwMjZkZScsIHN0cmluZ3MudHJ1bmNhdGVNaWRkbGUoJ2FcdUQ4M0RcdURFMDBiY2RlJywgNSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnYWJcdTIwMjZmJywgc3RyaW5ncy50cnVuY2F0ZU1pZGRsZSgnYWJjZGVcdUQ4M0RcdURFMDBmJywgNSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlQXN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGkgPSAwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzdHJpbmdzLnJlcGxhY2VBc3luYygnYWJjYWJjYWJjYWJjJywgL2IoLikvZywgYXN5bmMgKG1hdGNoLCBhZnRlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoLCAnYmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZnRlciwgJ2MnKTtcblx0XHRcdHJldHVybiBgJHtpKyt9JHthZnRlcn1gO1xuXHRcdH0pLCAnYTBjYTFjYTJjYTNjJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZW1vdmVBbnNpRXNjYXBlQ29kZXMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdGVzdFNlcXVlbmNlKHNlcXVlbmNlOiBzdHJpbmcpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJlbW92ZUFuc2lFc2NhcGVDb2RlcyhgaGVsbG8ke3NlcXVlbmNlfXdvcmxkYCksICdoZWxsb3dvcmxkJywgYGV4cGVjdCB0byByZW1vdmUgJHtKU09OLnN0cmluZ2lmeShzZXF1ZW5jZSl9YCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbLi4uc3RyaW5ncy5mb3JBbnNpU3RyaW5nUGFydHMoYGhlbGxvJHtzZXF1ZW5jZX13b3JsZGApXSxcblx0XHRcdFx0W3sgaXNDb2RlOiBmYWxzZSwgc3RyOiAnaGVsbG8nIH0sIHsgaXNDb2RlOiB0cnVlLCBzdHI6IHNlcXVlbmNlIH0sIHsgaXNDb2RlOiBmYWxzZSwgc3RyOiAnd29ybGQnIH1dLFxuXHRcdFx0XHRgZXhwZWN0IHRvIGZvckFuc2lTdHJpbmdQYXJ0cyAke0pTT04uc3RyaW5naWZ5KHNlcXVlbmNlKX1gXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ0NTSSBzZXF1ZW5jZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBDU0kgPSAnXFx4MWJbJztcblx0XHRcdGNvbnN0IHNlcXVlbmNlcyA9IFtcblx0XHRcdFx0Ly8gQmFzZSBjYXNlcyBmcm9tIGh0dHBzOi8vaW52aXNpYmxlLWlzbGFuZC5uZXQveHRlcm0vY3Rsc2Vxcy9jdGxzZXFzLmh0bWwjaDMtRnVuY3Rpb25zLXVzaW5nLUNTSS1fLW9yZGVyZWQtYnktdGhlLWZpbmFsLWNoYXJhY3Rlcl9zX1xuXHRcdFx0XHRgJHtDU0l9NDJAYCxcblx0XHRcdFx0YCR7Q1NJfTQyIEBgLFxuXHRcdFx0XHRgJHtDU0l9NDJBYCxcblx0XHRcdFx0YCR7Q1NJfTQyIEFgLFxuXHRcdFx0XHRgJHtDU0l9NDJCYCxcblx0XHRcdFx0YCR7Q1NJfTQyQ2AsXG5cdFx0XHRcdGAke0NTSX00MkRgLFxuXHRcdFx0XHRgJHtDU0l9NDJFYCxcblx0XHRcdFx0YCR7Q1NJfTQyRmAsXG5cdFx0XHRcdGAke0NTSX00MkdgLFxuXHRcdFx0XHRgJHtDU0l9NDI7NDJIYCxcblx0XHRcdFx0YCR7Q1NJfTQySWAsXG5cdFx0XHRcdGAke0NTSX00MkpgLFxuXHRcdFx0XHRgJHtDU0l9PzQySmAsXG5cdFx0XHRcdGAke0NTSX00MktgLFxuXHRcdFx0XHRgJHtDU0l9PzQyS2AsXG5cdFx0XHRcdGAke0NTSX00MkxgLFxuXHRcdFx0XHRgJHtDU0l9NDJNYCxcblx0XHRcdFx0YCR7Q1NJfTQyUGAsXG5cdFx0XHRcdGAke0NTSX0jUGAsXG5cdFx0XHRcdGAke0NTSX0zI1BgLFxuXHRcdFx0XHRgJHtDU0l9I1FgLFxuXHRcdFx0XHRgJHtDU0l9MyNRYCxcblx0XHRcdFx0YCR7Q1NJfSNSYCxcblx0XHRcdFx0YCR7Q1NJfTQyU2AsXG5cdFx0XHRcdGAke0NTSX0/MTsyOzNTYCxcblx0XHRcdFx0YCR7Q1NJfTQyVGAsXG5cdFx0XHRcdGAke0NTSX00Mjs0Mjs0Mjs0Mjs0MlRgLFxuXHRcdFx0XHRgJHtDU0l9PjNUYCxcblx0XHRcdFx0YCR7Q1NJfTQyWGAsXG5cdFx0XHRcdGAke0NTSX00MlpgLFxuXHRcdFx0XHRgJHtDU0l9NDJeYCxcblx0XHRcdFx0YCR7Q1NJfTQyXFxgYCxcblx0XHRcdFx0YCR7Q1NJfTQyYWAsXG5cdFx0XHRcdGAke0NTSX00MmJgLFxuXHRcdFx0XHRgJHtDU0l9NDJjYCxcblx0XHRcdFx0YCR7Q1NJfT00MmNgLFxuXHRcdFx0XHRgJHtDU0l9PjQyY2AsXG5cdFx0XHRcdGAke0NTSX00MmRgLFxuXHRcdFx0XHRgJHtDU0l9NDJlYCxcblx0XHRcdFx0YCR7Q1NJfTQyOzQyZmAsXG5cdFx0XHRcdGAke0NTSX00MmdgLFxuXHRcdFx0XHRgJHtDU0l9M2hgLFxuXHRcdFx0XHRgJHtDU0l9PzNoYCxcblx0XHRcdFx0YCR7Q1NJfTQyaWAsXG5cdFx0XHRcdGAke0NTSX0/NDJpYCxcblx0XHRcdFx0YCR7Q1NJfTNsYCxcblx0XHRcdFx0YCR7Q1NJfT8zbGAsXG5cdFx0XHRcdGAke0NTSX0zbWAsXG5cdFx0XHRcdGAke0NTSX0+MDswbWAsXG5cdFx0XHRcdGAke0NTSX0+MG1gLFxuXHRcdFx0XHRgJHtDU0l9PzBtYCxcblx0XHRcdFx0YCR7Q1NJfTQybmAsXG5cdFx0XHRcdGAke0NTSX0+NDJuYCxcblx0XHRcdFx0YCR7Q1NJfT80Mm5gLFxuXHRcdFx0XHRgJHtDU0l9PjQycGAsXG5cdFx0XHRcdGAke0NTSX0hcGAsXG5cdFx0XHRcdGAke0NTSX0wOzBcInBgLFxuXHRcdFx0XHRgJHtDU0l9NDIkcGAsXG5cdFx0XHRcdGAke0NTSX0/NDIkcGAsXG5cdFx0XHRcdGAke0NTSX0jcGAsXG5cdFx0XHRcdGAke0NTSX0zI3BgLFxuXHRcdFx0XHRgJHtDU0l9PjQycWAsXG5cdFx0XHRcdGAke0NTSX00MnFgLFxuXHRcdFx0XHRgJHtDU0l9NDIgcWAsXG5cdFx0XHRcdGAke0NTSX00MlwicWAsXG5cdFx0XHRcdGAke0NTSX0jcWAsXG5cdFx0XHRcdGAke0NTSX00Mjs0MnJgLFxuXHRcdFx0XHRgJHtDU0l9PzNyYCxcblx0XHRcdFx0YCR7Q1NJfTA7MDswOzA7MyRyYCxcblx0XHRcdFx0YCR7Q1NJfXNgLFxuXHRcdFx0XHRgJHtDU0l9MDswc2AsXG5cdFx0XHRcdGAke0NTSX0+NDJzYCxcblx0XHRcdFx0YCR7Q1NJfT8zc2AsXG5cdFx0XHRcdGAke0NTSX00Mjs0Mjs0MnRgLFxuXHRcdFx0XHRgJHtDU0l9PjN0YCxcblx0XHRcdFx0YCR7Q1NJfTQyIHRgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MDszJHRgLFxuXHRcdFx0XHRgJHtDU0l9dWAsXG5cdFx0XHRcdGAke0NTSX00MiB1YCxcblx0XHRcdFx0YCR7Q1NJfTA7MDswOzA7MDswOzA7MCR2YCxcblx0XHRcdFx0YCR7Q1NJfTQyJHdgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MCd3YCxcblx0XHRcdFx0YCR7Q1NJfTQyeGAsXG5cdFx0XHRcdGAke0NTSX00Mip4YCxcblx0XHRcdFx0YCR7Q1NJfTA7MDswOzA7MCR4YCxcblx0XHRcdFx0YCR7Q1NJfTQyI3lgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MDswOzAqeWAsXG5cdFx0XHRcdGAke0NTSX00MjswJ3pgLFxuXHRcdFx0XHRgJHtDU0l9MDsxOzI7NCR6YCxcblx0XHRcdFx0YCR7Q1NJfTMne2AsXG5cdFx0XHRcdGAke0NTSX0je2AsXG5cdFx0XHRcdGAke0NTSX0zI3tgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MFxcJHtgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MCN8YCxcblx0XHRcdFx0YCR7Q1NJfTQyJHxgLFxuXHRcdFx0XHRgJHtDU0l9NDInfGAsXG5cdFx0XHRcdGAke0NTSX00Mip8YCxcblx0XHRcdFx0YCR7Q1NJfSN9YCxcblx0XHRcdFx0YCR7Q1NJfTQyJ31gLFxuXHRcdFx0XHRgJHtDU0l9NDIkfWAsXG5cdFx0XHRcdGAke0NTSX00Mid+YCxcblx0XHRcdFx0YCR7Q1NJfTQyJH5gLFxuXG5cdFx0XHRcdC8vIENvbW1vbiBTR1IgY2FzZXM6XG5cdFx0XHRcdGAke0NTSX0xOzMxbWAsIC8vIG11bHRpcGxlIGF0dHJzXG5cdFx0XHRcdGAke0NTSX0xMDVtYCwgLy8gYnJpZ2h0IGJhY2tncm91bmRcblx0XHRcdFx0YCR7Q1NJfTQ4OjU6MTI4bWAsIC8vIDI1NiBpbmRleGVkIGNvbG9yXG5cdFx0XHRcdGAke0NTSX00ODs1OzEyOG1gLCAvLyAyNTYgaW5kZXhlZCBjb2xvciBhbHRcblx0XHRcdFx0YCR7Q1NJfTM4OjI6MDoyNTU6MjU1OjI1NW1gLCAvLyB0cnVlY29sb3Jcblx0XHRcdFx0YCR7Q1NJfTM4OzI7MjU1OzI1NTsyNTVtYCwgLy8gdHJ1ZWNvbG9yIGFsdFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBzZXF1ZW5jZSBvZiBzZXF1ZW5jZXMpIHtcblx0XHRcdFx0dGVzdFNlcXVlbmNlKHNlcXVlbmNlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHN1aXRlKCdPU0Mgc2VxdWVuY2VzJywgKCkgPT4ge1xuXHRcdFx0ZnVuY3Rpb24gdGVzdE9zY1NlcXVlbmNlKHByZWZpeDogc3RyaW5nLCBzdWZmaXg6IHN0cmluZykge1xuXHRcdFx0XHRjb25zdCBzZXF1ZW5jZUNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0YDYzMztTZXRNYXJrO2AsXG5cdFx0XHRcdFx0YDYzMztQO0N3ZD0vZm9vYCxcblx0XHRcdFx0XHRgNztmaWxlOi8vbG9jYWwvVXNlcnMvbWUvZm9vL2JhcmBcblx0XHRcdFx0XTtcblxuXHRcdFx0XHRjb25zdCBzZXF1ZW5jZXMgPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb250ZW50IG9mIHNlcXVlbmNlQ29udGVudCkge1xuXHRcdFx0XHRcdHNlcXVlbmNlcy5wdXNoKGAke3ByZWZpeH0ke2NvbnRlbnR9JHtzdWZmaXh9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBzZXF1ZW5jZSBvZiBzZXF1ZW5jZXMpIHtcblx0XHRcdFx0XHR0ZXN0U2VxdWVuY2Uoc2VxdWVuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0ZXN0KCdFU0MgXSBQcyA7IFB0IEVTQyBcXFxcJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0T3NjU2VxdWVuY2UoJ1xceDFiXScsICdcXHgxYlxcXFwnKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnRVNDIF0gUHMgOyBQdCBCRUwnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RPc2NTZXF1ZW5jZSgnXFx4MWJdJywgJ1xceDA3Jyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ0VTQyBdIFBzIDsgUHQgU1QnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RPc2NTZXF1ZW5jZSgnXFx4MWJdJywgJ1xceDljJyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ09TQyBQcyA7IFB0IEVTQyBcXFxcJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0T3NjU2VxdWVuY2UoJ1xceDlkJywgJ1xceDFiXFxcXCcpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdPU0MgUHMgOyBQdCBCRUwnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RPc2NTZXF1ZW5jZSgnXFx4OWQnLCAnXFx4MDcnKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnT1NDIFBzIDsgUHQgU1QnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RPc2NTZXF1ZW5jZSgnXFx4OWQnLCAnXFx4OWMnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRVNDIHNlcXVlbmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcXVlbmNlQ29udGVudCA9IFtcblx0XHRcdFx0YCBGYCxcblx0XHRcdFx0YCBHYCxcblx0XHRcdFx0YCBMYCxcblx0XHRcdFx0YCBNYCxcblx0XHRcdFx0YCBOYCxcblx0XHRcdFx0YCMzYCxcblx0XHRcdFx0YCM0YCxcblx0XHRcdFx0YCM1YCxcblx0XHRcdFx0YCM2YCxcblx0XHRcdFx0YCM4YCxcblx0XHRcdFx0YCVAYCxcblx0XHRcdFx0YCVHYCxcblx0XHRcdFx0YChDYCxcblx0XHRcdFx0YClDYCxcblx0XHRcdFx0YCpDYCxcblx0XHRcdFx0YCtDYCxcblx0XHRcdFx0YC1DYCxcblx0XHRcdFx0YC5DYCxcblx0XHRcdFx0YC9DYFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBjb250ZW50IG9mIHNlcXVlbmNlQ29udGVudCkge1xuXHRcdFx0XHRzZXF1ZW5jZXMucHVzaChgXFx4MWIke2NvbnRlbnR9YCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNlcXVlbmNlIG9mIHNlcXVlbmNlcykge1xuXHRcdFx0XHR0ZXN0U2VxdWVuY2Uoc2VxdWVuY2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3JlZ3Jlc3Npb24gdGVzdHMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCcjMjA5OTM3JywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0c3RyaW5ncy5yZW1vdmVBbnNpRXNjYXBlQ29kZXMoYGxvY2FsaG9zdDpcXHgxYlszMW0xMjM0YCksXG5cdFx0XHRcdFx0J2xvY2FsaG9zdDoxMjM0J1xuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUFuc2lFc2NhcGVDb2Rlc0Zyb21Qcm9tcHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmVtb3ZlQW5zaUVzY2FwZUNvZGVzRnJvbVByb21wdCgnXFx1MDAxYlszMW0kIFxcdTAwMWJbMG0nKSwgJyQgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmVtb3ZlQW5zaUVzY2FwZUNvZGVzRnJvbVByb21wdCgnXFxuXFxcXFtcXHUwMDFiWzAxOzM0bVxcXFxdXFxcXHdcXFxcW1xcdTAwMWJbMDBtXFxcXF1cXG5cXFxcW1xcdTAwMWJbMTszMm1cXFxcXT4gXFxcXFtcXHUwMDFiWzBtXFxcXF0nKSwgJ1xcblxcXFx3XFxuPiAnKTtcblx0fSk7XG5cblx0dGVzdCgnY291bnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ28nKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ2wnKSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ3onKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ2hlbGxvJyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNvdW50KCdoZWxsbyB3b3JsZCcsICd3b3JsZCcpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb3VudCgnaGVsbG8gd29ybGQnLCAnaGVsbG8gd29ybGQnKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ2ZvbycpLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGFpbnNBbWJpZ3VvdXNDaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuQW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRJbnN0YW5jZShuZXcgU2V0KCkpLmNvbnRhaW5zQW1iaWd1b3VzQ2hhcmFjdGVyKCdhYmNkJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldEluc3RhbmNlKG5ldyBTZXQoKSkuY29udGFpbnNBbWJpZ3VvdXNDaGFyYWN0ZXIoJ1x1MDBGQ1x1MDBFNScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuQW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRJbnN0YW5jZShuZXcgU2V0KCkpLmNvbnRhaW5zQW1iaWd1b3VzQ2hhcmFjdGVyKCcoKiZeKScpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldEluc3RhbmNlKG5ldyBTZXQoKSkuY29udGFpbnNBbWJpZ3VvdXNDaGFyYWN0ZXIoJ1x1MDNCRicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldEluc3RhbmNlKG5ldyBTZXQoKSkuY29udGFpbnNBbWJpZ3VvdXNDaGFyYWN0ZXIoJ2FiXHUwMjYxYycpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGFpbnNJbnZpc2libGVDaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuSW52aXNpYmxlQ2hhcmFjdGVycy5jb250YWluc0ludmlzaWJsZUNoYXJhY3RlcignYWJjZCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuSW52aXNpYmxlQ2hhcmFjdGVycy5jb250YWluc0ludmlzaWJsZUNoYXJhY3RlcignICcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5JbnZpc2libGVDaGFyYWN0ZXJzLmNvbnRhaW5zSW52aXNpYmxlQ2hhcmFjdGVyKCdhXFx1e2UwMDRlfWInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuSW52aXNpYmxlQ2hhcmFjdGVycy5jb250YWluc0ludmlzaWJsZUNoYXJhY3RlcignYVxcdXtlMDE1YX1cXHUwMDBiYicpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlieXRlQXdhcmVCdG9hJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLm11bHRpYnl0ZUF3YXJlQnRvYSgnaGVsbG8gd29ybGQnKS5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2soc3RyaW5ncy5tdWx0aWJ5dGVBd2FyZUJ0b2EoJ1x1NUU3M1x1NEVFRVx1NTQwRCcpLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLm11bHRpYnl0ZUF3YXJlQnRvYShuZXcgQXJyYXkoMTAwMDAwKS5maWxsKCd2cycpLmpvaW4oJycpKS5sZW5ndGggPiAwKTsgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExMjAxM1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuXG50ZXN0KCdodG1sQXR0cmlidXRlRW5jb2RlVmFsdWUnLCAoKSA9PiB7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmh0bWxBdHRyaWJ1dGVFbmNvZGVWYWx1ZSgnJyksICcnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlKCdhYmMnKSwgJ2FiYycpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5odG1sQXR0cmlidXRlRW5jb2RlVmFsdWUoJzxzY3JpcHQ+YWxlcnQoXCJIZWxsb1wiKTwvc2NyaXB0PicpLCAnJmx0O3NjcmlwdCZndDthbGVydCgmcXVvdDtIZWxsbyZxdW90OykmbHQ7L3NjcmlwdCZndDsnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlKCdIZWxsbyAmIFdvcmxkJyksICdIZWxsbyAmYW1wOyBXb3JsZCcpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5odG1sQXR0cmlidXRlRW5jb2RlVmFsdWUoJ1wiSGVsbG9cIicpLCAnJnF1b3Q7SGVsbG8mcXVvdDsnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlKCdcXCdIZWxsb1xcJycpLCAnJmFwb3M7SGVsbG8mYXBvczsnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlKCc8PiZcXCdcIicpLCAnJmx0OyZndDsmYW1wOyZhcG9zOyZxdW90OycpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sV0FBVyxNQUFNO0FBQ3RCLE9BQUssb0JBQW9CLE1BQU07QUFDOUIsV0FBTyxRQUFRLGlCQUFpQixJQUFJLEVBQUUsQ0FBQztBQUN2QyxXQUFPLENBQUMsUUFBUSxpQkFBaUIsSUFBSSxHQUFHLENBQUM7QUFDekMsV0FBTyxDQUFDLFFBQVEsaUJBQWlCLEtBQUssRUFBRSxDQUFDO0FBRXpDLFdBQU8sUUFBUSxpQkFBaUIsS0FBSyxHQUFHLENBQUM7QUFDekMsV0FBTyxRQUFRLGlCQUFpQixPQUFPLEtBQUssQ0FBQztBQUM3QyxXQUFPLFFBQVEsaUJBQWlCLE9BQU8sS0FBSyxDQUFDO0FBQzdDLFdBQU8sUUFBUSxpQkFBaUIsaUJBQWMsZUFBWSxDQUFDO0FBQzNELFdBQU8sUUFBUSxpQkFBaUIsU0FBTSxPQUFJLENBQUM7QUFBQSxFQUM1QyxDQUFDO0FBRUQsT0FBSyxVQUFVLE1BQU07QUFDcEIsV0FBTyxDQUFDLFFBQVEsT0FBTyxRQUFXLEtBQUssQ0FBQztBQUN4QyxXQUFPLENBQUMsUUFBUSxPQUFPLE9BQU8sTUFBUyxDQUFDO0FBQ3hDLFdBQU8sUUFBUSxPQUFPLFFBQVcsTUFBUyxDQUFDO0FBQzNDLFdBQU8sUUFBUSxPQUFPLElBQUksRUFBRSxDQUFDO0FBQzdCLFdBQU8sUUFBUSxPQUFPLEtBQUssR0FBRyxDQUFDO0FBQy9CLFdBQU8sQ0FBQyxRQUFRLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFDcEMsV0FBTyxRQUFRLE9BQU8s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QUE7QUFBQSxRQUVqQixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxH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
