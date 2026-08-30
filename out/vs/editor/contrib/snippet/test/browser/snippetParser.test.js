import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Choice, FormatString, Placeholder, Scanner, SnippetParser, Text, TextmateSnippet, TokenType, Transform, Variable } from "../../browser/snippetParser.js";
suite("SnippetParser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Scanner", () => {
    const scanner = new Scanner();
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("abc");
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("{{abc}}");
    assert.strictEqual(scanner.next().type, TokenType.CurlyOpen);
    assert.strictEqual(scanner.next().type, TokenType.CurlyOpen);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.CurlyClose);
    assert.strictEqual(scanner.next().type, TokenType.CurlyClose);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("abc() ");
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.Format);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("abc 123");
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.Format);
    assert.strictEqual(scanner.next().type, TokenType.Int);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("$foo");
    assert.strictEqual(scanner.next().type, TokenType.Dollar);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("$foo_bar");
    assert.strictEqual(scanner.next().type, TokenType.Dollar);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("$foo-bar");
    assert.strictEqual(scanner.next().type, TokenType.Dollar);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.Dash);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("${foo}");
    assert.strictEqual(scanner.next().type, TokenType.Dollar);
    assert.strictEqual(scanner.next().type, TokenType.CurlyOpen);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.CurlyClose);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("${1223:foo}");
    assert.strictEqual(scanner.next().type, TokenType.Dollar);
    assert.strictEqual(scanner.next().type, TokenType.CurlyOpen);
    assert.strictEqual(scanner.next().type, TokenType.Int);
    assert.strictEqual(scanner.next().type, TokenType.Colon);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.CurlyClose);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
    scanner.text("\\${}");
    assert.strictEqual(scanner.next().type, TokenType.Backslash);
    assert.strictEqual(scanner.next().type, TokenType.Dollar);
    assert.strictEqual(scanner.next().type, TokenType.CurlyOpen);
    assert.strictEqual(scanner.next().type, TokenType.CurlyClose);
    scanner.text("${foo/regex/format/option}");
    assert.strictEqual(scanner.next().type, TokenType.Dollar);
    assert.strictEqual(scanner.next().type, TokenType.CurlyOpen);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.Forwardslash);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.Forwardslash);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.Forwardslash);
    assert.strictEqual(scanner.next().type, TokenType.VariableName);
    assert.strictEqual(scanner.next().type, TokenType.CurlyClose);
    assert.strictEqual(scanner.next().type, TokenType.EOF);
  });
  function assertText(value, expected) {
    const actual = SnippetParser.asInsertText(value);
    assert.strictEqual(actual, expected);
  }
  function assertMarker(input, ...ctors) {
    let marker;
    if (input instanceof TextmateSnippet) {
      marker = [...input.children];
    } else if (typeof input === "string") {
      const p = new SnippetParser();
      marker = p.parse(input).children;
    } else {
      marker = [...input];
    }
    while (marker.length > 0) {
      const m = marker.pop();
      const ctor = ctors.pop();
      assert.ok(m instanceof ctor);
    }
    assert.strictEqual(marker.length, ctors.length);
    assert.strictEqual(marker.length, 0);
  }
  function assertTextAndMarker(value, escaped, ...ctors) {
    assertText(value, escaped);
    assertMarker(value, ...ctors);
  }
  function assertEscaped(value, expected) {
    const actual = SnippetParser.escape(value);
    assert.strictEqual(actual, expected);
  }
  test("Parser, escaped", function() {
    assertEscaped("foo$0", "foo\\$0");
    assertEscaped("foo\\$0", "foo\\\\\\$0");
    assertEscaped("f$1oo$0", "f\\$1oo\\$0");
    assertEscaped("${1:foo}$0", "\\${1:foo\\}\\$0");
    assertEscaped("$", "\\$");
  });
  test("Parser, text", () => {
    assertText("$", "$");
    assertText("\\\\$", "\\$");
    assertText("{", "{");
    assertText("\\}", "}");
    assertText("\\abc", "\\abc");
    assertText("foo${f:\\}}bar", "foo}bar");
    assertText("\\{", "\\{");
    assertText("I need \\\\\\$", "I need \\$");
    assertText("\\", "\\");
    assertText("\\{{", "\\{{");
    assertText("{{", "{{");
    assertText("{{dd", "{{dd");
    assertText("}}", "}}");
    assertText("ff}}", "ff}}");
    assertText("farboo", "farboo");
    assertText("far{{}}boo", "far{{}}boo");
    assertText("far{{123}}boo", "far{{123}}boo");
    assertText("far\\{{123}}boo", "far\\{{123}}boo");
    assertText("far{{id:bern}}boo", "far{{id:bern}}boo");
    assertText("far{{id:bern {{basel}}}}boo", "far{{id:bern {{basel}}}}boo");
    assertText("far{{id:bern {{id:basel}}}}boo", "far{{id:bern {{id:basel}}}}boo");
    assertText("far{{id:bern {{id2:basel}}}}boo", "far{{id:bern {{id2:basel}}}}boo");
  });
  test("Parser, TM text", () => {
    assertTextAndMarker("foo${1:bar}}", "foobar}", Text, Placeholder, Text);
    assertTextAndMarker("foo${1:bar}${2:foo}}", "foobarfoo}", Text, Placeholder, Placeholder, Text);
    assertTextAndMarker("foo${1:bar\\}${2:foo}}", "foobar}foo", Text, Placeholder);
    const [, placeholder] = new SnippetParser().parse("foo${1:bar\\}${2:foo}}").children;
    const { children } = placeholder;
    assert.strictEqual(placeholder.index, 1);
    assert.ok(children[0] instanceof Text);
    assert.strictEqual(children[0].toString(), "bar}");
    assert.ok(children[1] instanceof Placeholder);
    assert.strictEqual(children[1].toString(), "foo");
  });
  test("Parser, placeholder", () => {
    assertTextAndMarker("farboo", "farboo", Text);
    assertTextAndMarker("far{{}}boo", "far{{}}boo", Text);
    assertTextAndMarker("far{{123}}boo", "far{{123}}boo", Text);
    assertTextAndMarker("far\\{{123}}boo", "far\\{{123}}boo", Text);
  });
  test("Parser, literal code", () => {
    assertTextAndMarker("far`123`boo", "far`123`boo", Text);
    assertTextAndMarker("far\\`123\\`boo", "far\\`123\\`boo", Text);
  });
  test("Parser, variables/tabstop", () => {
    assertTextAndMarker("$far-boo", "-boo", Variable, Text);
    assertTextAndMarker("\\$far-boo", "$far-boo", Text);
    assertTextAndMarker("far$farboo", "far", Text, Variable);
    assertTextAndMarker("far${farboo}", "far", Text, Variable);
    assertTextAndMarker("$123", "", Placeholder);
    assertTextAndMarker("$farboo", "", Variable);
    assertTextAndMarker("$far12boo", "", Variable);
    assertTextAndMarker("000_${far}_000", "000__000", Text, Variable, Text);
    assertTextAndMarker("FFF_${TM_SELECTED_TEXT}_FFF$0", "FFF__FFF", Text, Variable, Text, Placeholder);
  });
  test("Parser, variables/placeholder with defaults", () => {
    assertTextAndMarker("${name:value}", "value", Variable);
    assertTextAndMarker("${1:value}", "value", Placeholder);
    assertTextAndMarker("${1:bar${2:foo}bar}", "barfoobar", Placeholder);
    assertTextAndMarker("${name:value", "${name:value", Text);
    assertTextAndMarker("${1:bar${2:foobar}", "${1:barfoobar", Text, Placeholder);
  });
  test("Parser, variable transforms", function() {
    assertTextAndMarker("${foo///}", "", Variable);
    assertTextAndMarker("${foo/regex/format/gmi}", "", Variable);
    assertTextAndMarker("${foo/([A-Z][a-z])/format/}", "", Variable);
    assertTextAndMarker("${foo/([A-Z][a-z])/format/GMI}", "${foo/([A-Z][a-z])/format/GMI}", Text);
    assertTextAndMarker("${foo/([A-Z][a-z])/format/funky}", "${foo/([A-Z][a-z])/format/funky}", Text);
    assertTextAndMarker("${foo/([A-Z][a-z]/format/}", "${foo/([A-Z][a-z]/format/}", Text);
    assertTextAndMarker("${foo/m\\/atch/$1/i}", "", Variable);
    assertMarker("${foo/regex/format/options}", Text);
    assertTextAndMarker("${foo///", "${foo///", Text);
    assertTextAndMarker("${foo/regex/format/options", "${foo/regex/format/options", Text);
    assertMarker("${foo/.*/${0:fooo}/i}", Variable);
    assertMarker("${foo/.*/${1}/i}", Variable);
    assertMarker("${foo/.*/$1/i}", Variable);
    assertMarker("${foo/.*/This-$1-encloses/i}", Variable);
    assertMarker("${foo/.*/complex${1:else}/i}", Variable);
    assertMarker("${foo/.*/complex${1:-else}/i}", Variable);
    assertMarker("${foo/.*/complex${1:+if}/i}", Variable);
    assertMarker("${foo/.*/complex${1:?if:else}/i}", Variable);
    assertMarker("${foo/.*/complex${1:/upcase}/i}", Variable);
  });
  test("Parser, placeholder transforms", function() {
    assertTextAndMarker("${1///}", "", Placeholder);
    assertTextAndMarker("${1/regex/format/gmi}", "", Placeholder);
    assertTextAndMarker("${1/([A-Z][a-z])/format/}", "", Placeholder);
    assertTextAndMarker("${1/m\\/atch/$1/i}", "", Placeholder);
    assertMarker("${1/regex/format/options}", Text);
    assertTextAndMarker("${1///", "${1///", Text);
    assertTextAndMarker("${1/regex/format/options", "${1/regex/format/options", Text);
  });
  test("No way to escape forward slash in snippet regex #36715", function() {
    assertMarker("${TM_DIRECTORY/src\\//$1/}", Variable);
  });
  test("No way to escape forward slash in snippet format section #37562", function() {
    assertMarker("${TM_SELECTED_TEXT/a/\\/$1/g}", Variable);
    assertMarker("${TM_SELECTED_TEXT/a/in\\/$1ner/g}", Variable);
    assertMarker("${TM_SELECTED_TEXT/a/end\\//g}", Variable);
  });
  test("Parser, placeholder with choice", () => {
    assertTextAndMarker("${1|one,two,three|}", "one", Placeholder);
    assertTextAndMarker("${1|one|}", "one", Placeholder);
    assertTextAndMarker("${1|one1,two2|}", "one1", Placeholder);
    assertTextAndMarker("${1|one1\\,two2|}", "one1,two2", Placeholder);
    assertTextAndMarker("${1|one1\\|two2|}", "one1|two2", Placeholder);
    assertTextAndMarker("${1|one1\\atwo2|}", "one1\\atwo2", Placeholder);
    assertTextAndMarker("${1|one,two,three,|}", "${1|one,two,three,|}", Text);
    assertTextAndMarker("${1|one,", "${1|one,", Text);
    const snippet = new SnippetParser().parse("${1|one,two,three|}");
    const expected = [
      (m) => m instanceof Placeholder,
      (m) => m instanceof Choice && m.options.length === 3 && m.options.every((x) => x instanceof Text)
    ];
    snippet.walk((marker) => {
      assert.ok(expected.shift()(marker));
      return true;
    });
  });
  test("Snippet choices: unable to escape comma and pipe, #31521", function() {
    assertTextAndMarker("console.log(${1|not\\, not, five, 5, 1   23|});", "console.log(not, not);", Text, Placeholder, Text);
  });
  test("Marker, toTextmateString()", function() {
    function assertTextsnippetString(input, expected) {
      const snippet = new SnippetParser().parse(input);
      const actual = snippet.toTextmateString();
      assert.strictEqual(actual, expected);
    }
    assertTextsnippetString("$1", "$1");
    assertTextsnippetString("\\$1", "\\$1");
    assertTextsnippetString("console.log(${1|not\\, not, five, 5, 1   23|});", "console.log(${1|not\\, not, five, 5, 1   23|});");
    assertTextsnippetString("console.log(${1|not\\, not, \\| five, 5, 1   23|});", "console.log(${1|not\\, not, \\| five, 5, 1   23|});");
    assertTextsnippetString("${1|cho\\,ices,wi\\|th,esc\\\\aping,chall\\\\\\,enges|}", "${1|cho\\,ices,wi\\|th,esc\\\\aping,chall\\\\\\,enges|}");
    assertTextsnippetString("this is text", "this is text");
    assertTextsnippetString("this ${1:is ${2:nested with $var}}", "this ${1:is ${2:nested with ${var}}}");
    assertTextsnippetString("this ${1:is ${2:nested with $var}}}", "this ${1:is ${2:nested with ${var}}}\\}");
  });
  test("Marker, toTextmateString() <-> identity", function() {
    function assertIdent(input) {
      const snippet = new SnippetParser().parse(input);
      const input2 = snippet.toTextmateString();
      const snippet2 = new SnippetParser().parse(input2);
      function checkCheckChildren(marker1, marker2) {
        assert.ok(marker1 instanceof Object.getPrototypeOf(marker2).constructor);
        assert.ok(marker2 instanceof Object.getPrototypeOf(marker1).constructor);
        assert.strictEqual(marker1.children.length, marker2.children.length);
        assert.strictEqual(marker1.toString(), marker2.toString());
        for (let i = 0; i < marker1.children.length; i++) {
          checkCheckChildren(marker1.children[i], marker2.children[i]);
        }
      }
      checkCheckChildren(snippet, snippet2);
    }
    assertIdent("$1");
    assertIdent("\\$1");
    assertIdent("console.log(${1|not\\, not, five, 5, 1   23|});");
    assertIdent("console.log(${1|not\\, not, \\| five, 5, 1   23|});");
    assertIdent("this is text");
    assertIdent("this ${1:is ${2:nested with $var}}");
    assertIdent("this ${1:is ${2:nested with $var}}}");
    assertIdent("this ${1:is ${2:nested with $var}} and repeating $1");
  });
  test("Parser, choise marker", () => {
    const { placeholders } = new SnippetParser().parse("${1|one,two,three|}");
    assert.strictEqual(placeholders.length, 1);
    assert.ok(placeholders[0].choice instanceof Choice);
    assert.ok(placeholders[0].children[0] instanceof Choice);
    assert.strictEqual(placeholders[0].children[0].options.length, 3);
    assertText("${1|one,two,three|}", "one");
    assertText("\\${1|one,two,three|}", "${1|one,two,three|}");
    assertText("${1\\|one,two,three|}", "${1\\|one,two,three|}");
    assertText("${1||}", "${1||}");
  });
  test("Backslash character escape in choice tabstop doesn't work #58494", function() {
    const { placeholders } = new SnippetParser().parse("${1|\\,,},$,\\|,\\\\|}");
    assert.strictEqual(placeholders.length, 1);
    assert.ok(placeholders[0].choice instanceof Choice);
  });
  test("Parser, only textmate", () => {
    const p = new SnippetParser();
    assertMarker(p.parse("far{{}}boo"), Text);
    assertMarker(p.parse("far{{123}}boo"), Text);
    assertMarker(p.parse("far\\{{123}}boo"), Text);
    assertMarker(p.parse("far$0boo"), Text, Placeholder, Text);
    assertMarker(p.parse("far${123}boo"), Text, Placeholder, Text);
    assertMarker(p.parse("far\\${123}boo"), Text);
  });
  test("Parser, real world", () => {
    let marker = new SnippetParser().parse("console.warn(${1: $TM_SELECTED_TEXT })").children;
    assert.strictEqual(marker[0].toString(), "console.warn(");
    assert.ok(marker[1] instanceof Placeholder);
    assert.strictEqual(marker[2].toString(), ")");
    const placeholder = marker[1];
    assert.strictEqual(placeholder.index, 1);
    assert.strictEqual(placeholder.children.length, 3);
    assert.ok(placeholder.children[0] instanceof Text);
    assert.ok(placeholder.children[1] instanceof Variable);
    assert.ok(placeholder.children[2] instanceof Text);
    assert.strictEqual(placeholder.children[0].toString(), " ");
    assert.strictEqual(placeholder.children[1].toString(), "");
    assert.strictEqual(placeholder.children[2].toString(), " ");
    const nestedVariable = placeholder.children[1];
    assert.strictEqual(nestedVariable.name, "TM_SELECTED_TEXT");
    assert.strictEqual(nestedVariable.children.length, 0);
    marker = new SnippetParser().parse("$TM_SELECTED_TEXT").children;
    assert.strictEqual(marker.length, 1);
    assert.ok(marker[0] instanceof Variable);
  });
  test("Parser, transform example", () => {
    const { children } = new SnippetParser().parse("${1:name} : ${2:type}${3/\\s:=(.*)/${1:+ :=}${1}/};\n$0");
    assert.ok(children[0] instanceof Placeholder);
    assert.strictEqual(children[0].children.length, 1);
    assert.strictEqual(children[0].children[0].toString(), "name");
    assert.strictEqual(children[0].transform, void 0);
    assert.ok(children[1] instanceof Text);
    assert.strictEqual(children[1].toString(), " : ");
    assert.ok(children[2] instanceof Placeholder);
    assert.strictEqual(children[2].children.length, 1);
    assert.strictEqual(children[2].children[0].toString(), "type");
    assert.ok(children[3] instanceof Placeholder);
    assert.strictEqual(children[3].children.length, 0);
    assert.notStrictEqual(children[3].transform, void 0);
    const transform = children[3].transform;
    assert.deepStrictEqual(transform.regexp, /\s:=(.*)/);
    assert.strictEqual(transform.children.length, 2);
    assert.ok(transform.children[0] instanceof FormatString);
    assert.strictEqual(transform.children[0].index, 1);
    assert.strictEqual(transform.children[0].ifValue, " :=");
    assert.ok(transform.children[1] instanceof FormatString);
    assert.strictEqual(transform.children[1].index, 1);
    assert.ok(children[4] instanceof Text);
    assert.strictEqual(children[4].toString(), ";\n");
  });
  test("Parser, default placeholder values", () => {
    assertMarker("errorContext: `${1:err}`, error: $1", Text, Placeholder, Text, Placeholder);
    const [, p1, , p2] = new SnippetParser().parse("errorContext: `${1:err}`, error:$1").children;
    assert.strictEqual(p1.index, 1);
    assert.strictEqual(p1.children.length, 1);
    assert.strictEqual(p1.children[0].toString(), "err");
    assert.strictEqual(p2.index, 1);
    assert.strictEqual(p2.children.length, 1);
    assert.strictEqual(p2.children[0].toString(), "err");
  });
  test("Parser, default placeholder values and one transform", () => {
    assertMarker("errorContext: `${1:err}`, error: ${1/err/ok/}", Text, Placeholder, Text, Placeholder);
    const [, p3, , p4] = new SnippetParser().parse("errorContext: `${1:err}`, error:${1/err/ok/}").children;
    assert.strictEqual(p3.index, 1);
    assert.strictEqual(p3.children.length, 1);
    assert.strictEqual(p3.children[0].toString(), "err");
    assert.strictEqual(p3.transform, void 0);
    assert.strictEqual(p4.index, 1);
    assert.strictEqual(p4.children.length, 1);
    assert.strictEqual(p4.children[0].toString(), "err");
    assert.notStrictEqual(p4.transform, void 0);
  });
  test("Repeated snippet placeholder should always inherit, #31040", function() {
    assertText("${1:foo}-abc-$1", "foo-abc-foo");
    assertText("${1:foo}-abc-${1}", "foo-abc-foo");
    assertText("${1:foo}-abc-${1:bar}", "foo-abc-foo");
    assertText("${1}-abc-${1:foo}", "foo-abc-foo");
  });
  test("backspace esapce in TM only, #16212", () => {
    const actual = SnippetParser.asInsertText("Foo \\\\${abc}bar");
    assert.strictEqual(actual, "Foo \\bar");
  });
  test("colon as variable/placeholder value, #16717", () => {
    let actual = SnippetParser.asInsertText("${TM_SELECTED_TEXT:foo:bar}");
    assert.strictEqual(actual, "foo:bar");
    actual = SnippetParser.asInsertText("${1:foo:bar}");
    assert.strictEqual(actual, "foo:bar");
  });
  test("incomplete placeholder", () => {
    assertTextAndMarker("${1:}", "", Placeholder);
  });
  test("marker#len", () => {
    function assertLen(template, ...lengths) {
      const snippet = new SnippetParser().parse(template, true);
      snippet.walk((m) => {
        const expected = lengths.shift();
        assert.strictEqual(m.len(), expected);
        return true;
      });
      assert.strictEqual(lengths.length, 0);
    }
    assertLen("text$0", 4, 0);
    assertLen("$1text$0", 0, 4, 0);
    assertLen("te$1xt$0", 2, 0, 2, 0);
    assertLen("errorContext: `${1:err}`, error: $0", 15, 0, 3, 10, 0);
    assertLen("errorContext: `${1:err}`, error: $1$0", 15, 0, 3, 10, 0, 3, 0);
    assertLen("$TM_SELECTED_TEXT$0", 0, 0);
    assertLen("${TM_SELECTED_TEXT:def}$0", 0, 3, 0);
  });
  test("parser, parent node", function() {
    let snippet = new SnippetParser().parse("This ${1:is ${2:nested}}$0", true);
    assert.strictEqual(snippet.placeholders.length, 3);
    let [first, second] = snippet.placeholders;
    assert.strictEqual(first.index, 1);
    assert.strictEqual(second.index, 2);
    assert.ok(second.parent === first);
    assert.ok(first.parent === snippet);
    snippet = new SnippetParser().parse("${VAR:default${1:value}}$0", true);
    assert.strictEqual(snippet.placeholders.length, 2);
    [first] = snippet.placeholders;
    assert.strictEqual(first.index, 1);
    assert.ok(snippet.children[0] instanceof Variable);
    assert.ok(first.parent === snippet.children[0]);
  });
  test("TextmateSnippet#enclosingPlaceholders", () => {
    const snippet = new SnippetParser().parse("This ${1:is ${2:nested}}$0", true);
    const [first, second] = snippet.placeholders;
    assert.deepStrictEqual(snippet.enclosingPlaceholders(first), []);
    assert.deepStrictEqual(snippet.enclosingPlaceholders(second), [first]);
  });
  test("TextmateSnippet#offset", () => {
    let snippet = new SnippetParser().parse("te$1xt", true);
    assert.strictEqual(snippet.offset(snippet.children[0]), 0);
    assert.strictEqual(snippet.offset(snippet.children[1]), 2);
    assert.strictEqual(snippet.offset(snippet.children[2]), 2);
    snippet = new SnippetParser().parse("${TM_SELECTED_TEXT:def}", true);
    assert.strictEqual(snippet.offset(snippet.children[0]), 0);
    assert.strictEqual(snippet.offset(snippet.children[0].children[0]), 0);
    assert.strictEqual(snippet.offset(new Text("foo")), -1);
  });
  test("TextmateSnippet#placeholder", () => {
    let snippet = new SnippetParser().parse("te$1xt$0", true);
    let placeholders = snippet.placeholders;
    assert.strictEqual(placeholders.length, 2);
    snippet = new SnippetParser().parse("te$1xt$1$0", true);
    placeholders = snippet.placeholders;
    assert.strictEqual(placeholders.length, 3);
    snippet = new SnippetParser().parse("te$1xt$2$0", true);
    placeholders = snippet.placeholders;
    assert.strictEqual(placeholders.length, 3);
    snippet = new SnippetParser().parse("${1:bar${2:foo}bar}$0", true);
    placeholders = snippet.placeholders;
    assert.strictEqual(placeholders.length, 3);
  });
  test("TextmateSnippet#replace 1/2", function() {
    const snippet = new SnippetParser().parse("aaa${1:bbb${2:ccc}}$0", true);
    assert.strictEqual(snippet.placeholders.length, 3);
    const [, second] = snippet.placeholders;
    assert.strictEqual(second.index, 2);
    const enclosing = snippet.enclosingPlaceholders(second);
    assert.strictEqual(enclosing.length, 1);
    assert.strictEqual(enclosing[0].index, 1);
    const nested = new SnippetParser().parse("ddd$1eee$0", true);
    snippet.replace(second, nested.children);
    assert.strictEqual(snippet.toString(), "aaabbbdddeee");
    assert.strictEqual(snippet.placeholders.length, 4);
    assert.strictEqual(snippet.placeholders[0].index, 1);
    assert.strictEqual(snippet.placeholders[1].index, 1);
    assert.strictEqual(snippet.placeholders[2].index, 0);
    assert.strictEqual(snippet.placeholders[3].index, 0);
    const newEnclosing = snippet.enclosingPlaceholders(snippet.placeholders[1]);
    assert.ok(newEnclosing[0] === snippet.placeholders[0]);
    assert.strictEqual(newEnclosing.length, 1);
    assert.strictEqual(newEnclosing[0].index, 1);
  });
  test("TextmateSnippet#replace 2/2", function() {
    const snippet = new SnippetParser().parse("aaa${1:bbb${2:ccc}}$0", true);
    assert.strictEqual(snippet.placeholders.length, 3);
    const [, second] = snippet.placeholders;
    assert.strictEqual(second.index, 2);
    const nested = new SnippetParser().parse("dddeee$0", true);
    snippet.replace(second, nested.children);
    assert.strictEqual(snippet.toString(), "aaabbbdddeee");
    assert.strictEqual(snippet.placeholders.length, 3);
  });
  test("Snippet order for placeholders, #28185", function() {
    const _10 = new Placeholder(10);
    const _2 = new Placeholder(2);
    assert.strictEqual(Placeholder.compareByIndex(_10, _2), 1);
  });
  test("Maximum call stack size exceeded, #28983", function() {
    new SnippetParser().parse("${1:${foo:${1}}}");
  });
  test("Snippet can freeze the editor, #30407", function() {
    const seen = /* @__PURE__ */ new Set();
    seen.clear();
    new SnippetParser().parse("class ${1:${TM_FILENAME/(?:\\A|_)([A-Za-z0-9]+)(?:\\.rb)?/(?2::\\u$1)/g}} < ${2:Application}Controller\n  $3\nend").walk((marker) => {
      assert.ok(!seen.has(marker));
      seen.add(marker);
      return true;
    });
    seen.clear();
    new SnippetParser().parse("${1:${FOO:abc$1def}}").walk((marker) => {
      assert.ok(!seen.has(marker));
      seen.add(marker);
      return true;
    });
  });
  test("Snippets: make parser ignore `${0|choice|}`, #31599", function() {
    assertTextAndMarker("${0|foo,bar|}", "${0|foo,bar|}", Text);
    assertTextAndMarker("${1|foo,bar|}", "foo", Placeholder);
  });
  test("Transform -> FormatString#resolve", function() {
    assert.strictEqual(new FormatString(1, "upcase").resolve("foo"), "FOO");
    assert.strictEqual(new FormatString(1, "downcase").resolve("FOO"), "foo");
    assert.strictEqual(new FormatString(1, "capitalize").resolve("bar"), "Bar");
    assert.strictEqual(new FormatString(1, "capitalize").resolve("bar no repeat"), "Bar no repeat");
    assert.strictEqual(new FormatString(1, "pascalcase").resolve("bar-foo"), "BarFoo");
    assert.strictEqual(new FormatString(1, "pascalcase").resolve("bar-42-foo"), "Bar42Foo");
    assert.strictEqual(new FormatString(1, "pascalcase").resolve("snake_AndPascalCase"), "SnakeAndPascalCase");
    assert.strictEqual(new FormatString(1, "pascalcase").resolve("kebab-AndPascalCase"), "KebabAndPascalCase");
    assert.strictEqual(new FormatString(1, "pascalcase").resolve("_justPascalCase"), "JustPascalCase");
    assert.strictEqual(new FormatString(1, "camelcase").resolve("bar-foo"), "barFoo");
    assert.strictEqual(new FormatString(1, "camelcase").resolve("bar-42-foo"), "bar42Foo");
    assert.strictEqual(new FormatString(1, "camelcase").resolve("snake_AndCamelCase"), "snakeAndCamelCase");
    assert.strictEqual(new FormatString(1, "camelcase").resolve("kebab-AndCamelCase"), "kebabAndCamelCase");
    assert.strictEqual(new FormatString(1, "camelcase").resolve("_JustCamelCase"), "justCamelCase");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("barFoo"), "bar-foo");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("BarFoo"), "bar-foo");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("ABarFoo"), "a-bar-foo");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("bar42Foo"), "bar42-foo");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("snake_AndPascalCase"), "snake-and-pascal-case");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("kebab-AndCamelCase"), "kebab-and-camel-case");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("_justPascalCase"), "just-pascal-case");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("__UPCASE__"), "upcase");
    assert.strictEqual(new FormatString(1, "kebabcase").resolve("__BAR_FOO__"), "bar-foo");
    assert.strictEqual(new FormatString(1, "snakecase").resolve("bar-foo"), "bar_foo");
    assert.strictEqual(new FormatString(1, "snakecase").resolve("bar-42-foo"), "bar_42_foo");
    assert.strictEqual(new FormatString(1, "snakecase").resolve("snake_AndPascalCase"), "snake_and_pascal_case");
    assert.strictEqual(new FormatString(1, "snakecase").resolve("kebab-AndPascalCase"), "kebab_and_pascal_case");
    assert.strictEqual(new FormatString(1, "snakecase").resolve("_justPascalCase"), "_just_pascal_case");
    assert.strictEqual(new FormatString(1, "notKnown").resolve("input"), "input");
    assert.strictEqual(new FormatString(1, void 0, "foo", void 0).resolve(void 0), "");
    assert.strictEqual(new FormatString(1, void 0, "foo", void 0).resolve(""), "");
    assert.strictEqual(new FormatString(1, void 0, "foo", void 0).resolve("bar"), "foo");
    assert.strictEqual(new FormatString(1, void 0, void 0, "foo").resolve(void 0), "foo");
    assert.strictEqual(new FormatString(1, void 0, void 0, "foo").resolve(""), "foo");
    assert.strictEqual(new FormatString(1, void 0, void 0, "foo").resolve("bar"), "bar");
    assert.strictEqual(new FormatString(1, void 0, "bar", "foo").resolve(void 0), "foo");
    assert.strictEqual(new FormatString(1, void 0, "bar", "foo").resolve(""), "foo");
    assert.strictEqual(new FormatString(1, void 0, "bar", "foo").resolve("baz"), "bar");
  });
  test("Unicode Variable Transformations", () => {
    const resolver = new class {
      resolve(variable) {
        const values = {
          "RUSSIAN": "\u043E\u0434\u0438\u043D\u0414\u0432\u0430",
          "GREEK": "\u03AD\u03BD\u03B1\u03C2\u0394\u03CD\u03BF",
          "TURKISH": "istanbulL\u0131",
          "JAPANESE": "\u3053\u3093\u306B\u3061\u306F"
        };
        return values[variable.name];
      }
    }();
    function assertTransform(transformName, varName, expected) {
      const p = new SnippetParser();
      const snippet = p.parse(`\${${varName}/(.*)/\${1:/${transformName}}/}`);
      const variable = snippet.children[0];
      variable.resolve(resolver);
      const resolved = variable.toString();
      assert.strictEqual(resolved, expected, `${transformName} failed for ${varName}`);
    }
    assertTransform("kebabcase", "RUSSIAN", "\u043E\u0434\u0438\u043D-\u0434\u0432\u0430");
    assertTransform("kebabcase", "GREEK", "\u03AD\u03BD\u03B1\u03C2-\u03B4\u03CD\u03BF");
    assertTransform("snakecase", "RUSSIAN", "\u043E\u0434\u0438\u043D_\u0434\u0432\u0430");
    assertTransform("snakecase", "GREEK", "\u03AD\u03BD\u03B1\u03C2_\u03B4\u03CD\u03BF");
    assertTransform("camelcase", "RUSSIAN", "\u043E\u0434\u0438\u043D\u0414\u0432\u0430");
    assertTransform("camelcase", "GREEK", "\u03AD\u03BD\u03B1\u03C2\u0394\u03CD\u03BF");
    assertTransform("pascalcase", "RUSSIAN", "\u041E\u0434\u0438\u043D\u0414\u0432\u0430");
    assertTransform("pascalcase", "GREEK", "\u0388\u03BD\u03B1\u03C2\u0394\u03CD\u03BF");
    assertTransform("upcase", "RUSSIAN", "\u041E\u0414\u0418\u041D\u0414\u0412\u0410");
    assertTransform("downcase", "RUSSIAN", "\u043E\u0434\u0438\u043D\u0434\u0432\u0430");
    assertTransform("kebabcase", "TURKISH", "istanbul-l\u0131");
    assertTransform("pascalcase", "TURKISH", "IstanbulL\u0131");
    assertTransform("upcase", "JAPANESE", "\u3053\u3093\u306B\u3061\u306F");
    assertTransform("kebabcase", "JAPANESE", "\u3053\u3093\u306B\u3061\u306F");
  });
  test("Snippet variable transformation doesn't work if regex is complicated and snippet body contains '$$' #55627", function() {
    const snippet = new SnippetParser().parse('const fileName = "${TM_FILENAME/(.*)\\..+$/$1/}"');
    assert.strictEqual(snippet.toTextmateString(), 'const fileName = "${TM_FILENAME/(.*)\\..+$/${1}/}"');
  });
  test("[BUG] HTML attribute suggestions: Snippet session does not have end-position set, #33147", function() {
    const { placeholders } = new SnippetParser().parse('src="$1"', true);
    const [first, second] = placeholders;
    assert.strictEqual(placeholders.length, 2);
    assert.strictEqual(first.index, 1);
    assert.strictEqual(second.index, 0);
  });
  test("Snippet optional transforms are not applied correctly when reusing the same variable, #37702", function() {
    const transform = new Transform();
    transform.appendChild(new FormatString(1, "upcase"));
    transform.appendChild(new FormatString(2, "upcase"));
    transform.regexp = /^(.)|-(.)/g;
    assert.strictEqual(transform.resolve("my-file-name"), "MyFileName");
    const clone = transform.clone();
    assert.strictEqual(clone.resolve("my-file-name"), "MyFileName");
  });
  test("problem with snippets regex #40570", function() {
    const snippet = new SnippetParser().parse("${TM_DIRECTORY/.*src[\\/](.*)/$1/}");
    assertMarker(snippet, Variable);
  });
  test("Variable transformation doesn't work if undefined variables are used in the same snippet #51769", function() {
    const transform = new Transform();
    transform.appendChild(new Text("bar"));
    transform.regexp = new RegExp("foo", "gi");
    assert.strictEqual(transform.toTextmateString(), "/foo/bar/ig");
  });
  test("transform serialization joins children without comma", function() {
    const transformWithFormatString = new Transform();
    transformWithFormatString.appendChild(new FormatString(1, "upcase"));
    transformWithFormatString.appendChild(new Text("_"));
    transformWithFormatString.regexp = new RegExp("foo", "g");
    const serialized = transformWithFormatString.toTextmateString();
    assert.strictEqual(serialized, "/foo/${1:/upcase}_/g");
    const snippet = new SnippetParser().parse(`\${TM_FILENAME${serialized}}`);
    assert.strictEqual(snippet.toTextmateString(), `\${TM_FILENAME${serialized}}`);
  });
  test("Snippet parser freeze #53144", function() {
    const snippet = new SnippetParser().parse("${1/(void$)|(.+)/${1:?-	return nil;}/}");
    assertMarker(snippet, Placeholder);
  });
  test("snippets variable not resolved in JSON proposal #52931", function() {
    assertTextAndMarker("FOO${1:/bin/bash}", "FOO/bin/bash", Text, Placeholder);
  });
  test("Mirroring sequence of nested placeholders not selected properly on backjumping #58736", function() {
    const snippet = new SnippetParser().parse("${3:nest1 ${1:nest2 ${2:nest3}}} $3");
    assert.strictEqual(snippet.children.length, 3);
    assert.ok(snippet.children[0] instanceof Placeholder);
    assert.ok(snippet.children[1] instanceof Text);
    assert.ok(snippet.children[2] instanceof Placeholder);
    function assertParent(marker) {
      marker.children.forEach(assertParent);
      if (!(marker instanceof Placeholder)) {
        return;
      }
      let found = false;
      let m = marker;
      while (m && !found) {
        if (m.parent === snippet) {
          found = true;
        }
        m = m.parent;
      }
      assert.ok(found);
    }
    const [, , clone] = snippet.children;
    assertParent(clone);
  });
  test("Backspace can't be escaped in snippet variable transforms #65412", function() {
    const snippet = new SnippetParser().parse("namespace ${TM_DIRECTORY/[\\/]/\\\\/g};");
    assertMarker(snippet, Text, Variable, Text);
  });
  test("Snippet cannot escape closing bracket inside conditional insertion variable replacement #78883", function() {
    const snippet = new SnippetParser().parse("${TM_DIRECTORY/(.+)/${1:+import { hello \\} from world}/}");
    const variable = snippet.children[0];
    assert.strictEqual(snippet.children.length, 1);
    assert.ok(variable instanceof Variable);
    assert.ok(variable.transform);
    assert.strictEqual(variable.transform.children.length, 1);
    assert.ok(variable.transform.children[0] instanceof FormatString);
    assert.strictEqual(variable.transform.children[0].ifValue, "import { hello } from world");
    assert.strictEqual(variable.transform.children[0].elseValue, void 0);
  });
  test("Snippet escape backslashes inside conditional insertion variable replacement #80394", function() {
    const snippet = new SnippetParser().parse("${CURRENT_YEAR/(.+)/${1:+\\\\}/}");
    const variable = snippet.children[0];
    assert.strictEqual(snippet.children.length, 1);
    assert.ok(variable instanceof Variable);
    assert.ok(variable.transform);
    assert.strictEqual(variable.transform.children.length, 1);
    assert.ok(variable.transform.children[0] instanceof FormatString);
    assert.strictEqual(variable.transform.children[0].ifValue, "\\");
    assert.strictEqual(variable.transform.children[0].elseValue, void 0);
  });
  test("Snippet placeholder empty right after expansion #152553", function() {
    const snippet = new SnippetParser().parse("${1:prog}: ${2:$1.cc} - $2");
    const actual = snippet.toString();
    assert.strictEqual(actual, "prog: prog.cc - prog.cc");
    const snippet2 = new SnippetParser().parse("${1:prog}: ${3:${2:$1.cc}.33} - $2 $3");
    const actual2 = snippet2.toString();
    assert.strictEqual(actual2, "prog: prog.cc.33 - prog.cc prog.cc.33");
    const snippet3 = new SnippetParser().parse("${1:$2.one} <> ${2:$1.two}");
    const actual3 = snippet3.toString();
    assert.strictEqual(actual3, ".two.one.two.one <> .one.two.one.two");
  });
  test("Snippet choices are incorrectly escaped/applied #180132", function() {
    assertTextAndMarker("${1|aaa$aaa|}bbb\\$bbb", "aaa$aaabbb$bbb", Placeholder, Text);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNuaXBwZXRcXHRlc3RcXGJyb3dzZXJcXHNuaXBwZXRQYXJzZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENob2ljZSwgRm9ybWF0U3RyaW5nLCBNYXJrZXIsIFBsYWNlaG9sZGVyLCBTY2FubmVyLCBTbmlwcGV0UGFyc2VyLCBUZXh0LCBUZXh0bWF0ZVNuaXBwZXQsIFRva2VuVHlwZSwgVHJhbnNmb3JtLCBWYXJpYWJsZSwgVmFyaWFibGVSZXNvbHZlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc25pcHBldFBhcnNlci5qcyc7XG5cbnN1aXRlKCdTbmlwcGV0UGFyc2VyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ1NjYW5uZXInLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzY2FubmVyID0gbmV3IFNjYW5uZXIoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkVPRik7XG5cblx0XHRzY2FubmVyLnRleHQoJ2FiYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuVmFyaWFibGVOYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkVPRik7XG5cblx0XHRzY2FubmVyLnRleHQoJ3t7YWJjfX0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkN1cmx5T3Blbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5DdXJseU9wZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuVmFyaWFibGVOYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkN1cmx5Q2xvc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuQ3VybHlDbG9zZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5FT0YpO1xuXG5cdFx0c2Nhbm5lci50ZXh0KCdhYmMoKSAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5Gb3JtYXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuRU9GKTtcblxuXHRcdHNjYW5uZXIudGV4dCgnYWJjIDEyMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuVmFyaWFibGVOYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkZvcm1hdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5JbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuRU9GKTtcblxuXHRcdHNjYW5uZXIudGV4dCgnJGZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuRG9sbGFyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5FT0YpO1xuXG5cdFx0c2Nhbm5lci50ZXh0KCckZm9vX2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuRG9sbGFyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5FT0YpO1xuXG5cdFx0c2Nhbm5lci50ZXh0KCckZm9vLWJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuRG9sbGFyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5EYXNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5FT0YpO1xuXG5cdFx0c2Nhbm5lci50ZXh0KCcke2Zvb30nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkRvbGxhcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5DdXJseU9wZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuVmFyaWFibGVOYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkN1cmx5Q2xvc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuRU9GKTtcblxuXHRcdHNjYW5uZXIudGV4dCgnJHsxMjIzOmZvb30nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkRvbGxhcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5DdXJseU9wZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuSW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkNvbG9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5DdXJseUNsb3NlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkVPRik7XG5cblx0XHRzY2FubmVyLnRleHQoJ1xcXFwke30nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkJhY2tzbGFzaCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5Eb2xsYXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuQ3VybHlPcGVuKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkN1cmx5Q2xvc2UpO1xuXG5cdFx0c2Nhbm5lci50ZXh0KCcke2Zvby9yZWdleC9mb3JtYXQvb3B0aW9ufScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuRG9sbGFyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkN1cmx5T3Blbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5WYXJpYWJsZU5hbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuRm9yd2FyZHNsYXNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLlZhcmlhYmxlTmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5Gb3J3YXJkc2xhc2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuVmFyaWFibGVOYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Nhbm5lci5uZXh0KCkudHlwZSwgVG9rZW5UeXBlLkZvcndhcmRzbGFzaCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5WYXJpYWJsZU5hbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLm5leHQoKS50eXBlLCBUb2tlblR5cGUuQ3VybHlDbG9zZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYW5uZXIubmV4dCgpLnR5cGUsIFRva2VuVHlwZS5FT0YpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhc3NlcnRUZXh0KHZhbHVlOiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBhY3R1YWwgPSBTbmlwcGV0UGFyc2VyLmFzSW5zZXJ0VGV4dCh2YWx1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0TWFya2VyKGlucHV0OiBUZXh0bWF0ZVNuaXBwZXQgfCBNYXJrZXJbXSB8IHN0cmluZywgLi4uY3RvcnM6IEZ1bmN0aW9uW10pIHtcblx0XHRsZXQgbWFya2VyOiBNYXJrZXJbXTtcblx0XHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBUZXh0bWF0ZVNuaXBwZXQpIHtcblx0XHRcdG1hcmtlciA9IFsuLi5pbnB1dC5jaGlsZHJlbl07XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCBwID0gbmV3IFNuaXBwZXRQYXJzZXIoKTtcblx0XHRcdG1hcmtlciA9IHAucGFyc2UoaW5wdXQpLmNoaWxkcmVuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtYXJrZXIgPSBbLi4uaW5wdXRdO1xuXHRcdH1cblx0XHR3aGlsZSAobWFya2VyLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG0gPSBtYXJrZXIucG9wKCk7XG5cdFx0XHRjb25zdCBjdG9yID0gY3RvcnMucG9wKCkhO1xuXHRcdFx0YXNzZXJ0Lm9rKG0gaW5zdGFuY2VvZiBjdG9yKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5sZW5ndGgsIGN0b3JzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlci5sZW5ndGgsIDApO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0VGV4dEFuZE1hcmtlcih2YWx1ZTogc3RyaW5nLCBlc2NhcGVkOiBzdHJpbmcsIC4uLmN0b3JzOiBGdW5jdGlvbltdKSB7XG5cdFx0YXNzZXJ0VGV4dCh2YWx1ZSwgZXNjYXBlZCk7XG5cdFx0YXNzZXJ0TWFya2VyKHZhbHVlLCAuLi5jdG9ycyk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRFc2NhcGVkKHZhbHVlOiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBhY3R1YWwgPSBTbmlwcGV0UGFyc2VyLmVzY2FwZSh2YWx1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0dGVzdCgnUGFyc2VyLCBlc2NhcGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydEVzY2FwZWQoJ2ZvbyQwJywgJ2Zvb1xcXFwkMCcpO1xuXHRcdGFzc2VydEVzY2FwZWQoJ2Zvb1xcXFwkMCcsICdmb29cXFxcXFxcXFxcXFwkMCcpO1xuXHRcdGFzc2VydEVzY2FwZWQoJ2YkMW9vJDAnLCAnZlxcXFwkMW9vXFxcXCQwJyk7XG5cdFx0YXNzZXJ0RXNjYXBlZCgnJHsxOmZvb30kMCcsICdcXFxcJHsxOmZvb1xcXFx9XFxcXCQwJyk7XG5cdFx0YXNzZXJ0RXNjYXBlZCgnJCcsICdcXFxcJCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXJzZXIsIHRleHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0VGV4dCgnJCcsICckJyk7XG5cdFx0YXNzZXJ0VGV4dCgnXFxcXFxcXFwkJywgJ1xcXFwkJyk7XG5cdFx0YXNzZXJ0VGV4dCgneycsICd7Jyk7XG5cdFx0YXNzZXJ0VGV4dCgnXFxcXH0nLCAnfScpO1xuXHRcdGFzc2VydFRleHQoJ1xcXFxhYmMnLCAnXFxcXGFiYycpO1xuXHRcdGFzc2VydFRleHQoJ2ZvbyR7ZjpcXFxcfX1iYXInLCAnZm9vfWJhcicpO1xuXHRcdGFzc2VydFRleHQoJ1xcXFx7JywgJ1xcXFx7Jyk7XG5cdFx0YXNzZXJ0VGV4dCgnSSBuZWVkIFxcXFxcXFxcXFxcXCQnLCAnSSBuZWVkIFxcXFwkJyk7XG5cdFx0YXNzZXJ0VGV4dCgnXFxcXCcsICdcXFxcJyk7XG5cdFx0YXNzZXJ0VGV4dCgnXFxcXHt7JywgJ1xcXFx7eycpO1xuXHRcdGFzc2VydFRleHQoJ3t7JywgJ3t7Jyk7XG5cdFx0YXNzZXJ0VGV4dCgne3tkZCcsICd7e2RkJyk7XG5cdFx0YXNzZXJ0VGV4dCgnfX0nLCAnfX0nKTtcblx0XHRhc3NlcnRUZXh0KCdmZn19JywgJ2ZmfX0nKTtcblxuXHRcdGFzc2VydFRleHQoJ2ZhcmJvbycsICdmYXJib28nKTtcblx0XHRhc3NlcnRUZXh0KCdmYXJ7e319Ym9vJywgJ2Zhcnt7fX1ib28nKTtcblx0XHRhc3NlcnRUZXh0KCdmYXJ7ezEyM319Ym9vJywgJ2Zhcnt7MTIzfX1ib28nKTtcblx0XHRhc3NlcnRUZXh0KCdmYXJcXFxce3sxMjN9fWJvbycsICdmYXJcXFxce3sxMjN9fWJvbycpO1xuXHRcdGFzc2VydFRleHQoJ2Zhcnt7aWQ6YmVybn19Ym9vJywgJ2Zhcnt7aWQ6YmVybn19Ym9vJyk7XG5cdFx0YXNzZXJ0VGV4dCgnZmFye3tpZDpiZXJuIHt7YmFzZWx9fX19Ym9vJywgJ2Zhcnt7aWQ6YmVybiB7e2Jhc2VsfX19fWJvbycpO1xuXHRcdGFzc2VydFRleHQoJ2Zhcnt7aWQ6YmVybiB7e2lkOmJhc2VsfX19fWJvbycsICdmYXJ7e2lkOmJlcm4ge3tpZDpiYXNlbH19fX1ib28nKTtcblx0XHRhc3NlcnRUZXh0KCdmYXJ7e2lkOmJlcm4ge3tpZDI6YmFzZWx9fX19Ym9vJywgJ2Zhcnt7aWQ6YmVybiB7e2lkMjpiYXNlbH19fX1ib28nKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdQYXJzZXIsIFRNIHRleHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignZm9vJHsxOmJhcn19JywgJ2Zvb2Jhcn0nLCBUZXh0LCBQbGFjZWhvbGRlciwgVGV4dCk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignZm9vJHsxOmJhcn0kezI6Zm9vfX0nLCAnZm9vYmFyZm9vfScsIFRleHQsIFBsYWNlaG9sZGVyLCBQbGFjZWhvbGRlciwgVGV4dCk7XG5cblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCdmb28kezE6YmFyXFxcXH0kezI6Zm9vfX0nLCAnZm9vYmFyfWZvbycsIFRleHQsIFBsYWNlaG9sZGVyKTtcblxuXHRcdGNvbnN0IFssIHBsYWNlaG9sZGVyXSA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJ2ZvbyR7MTpiYXJcXFxcfSR7Mjpmb299fScpLmNoaWxkcmVuO1xuXHRcdGNvbnN0IHsgY2hpbGRyZW4gfSA9ICg8UGxhY2Vob2xkZXI+cGxhY2Vob2xkZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8UGxhY2Vob2xkZXI+cGxhY2Vob2xkZXIpLmluZGV4LCAxKTtcblx0XHRhc3NlcnQub2soY2hpbGRyZW5bMF0gaW5zdGFuY2VvZiBUZXh0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW5bMF0udG9TdHJpbmcoKSwgJ2Jhcn0nKTtcblx0XHRhc3NlcnQub2soY2hpbGRyZW5bMV0gaW5zdGFuY2VvZiBQbGFjZWhvbGRlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuWzFdLnRvU3RyaW5nKCksICdmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnUGFyc2VyLCBwbGFjZWhvbGRlcicsICgpID0+IHtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCdmYXJib28nLCAnZmFyYm9vJywgVGV4dCk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignZmFye3t9fWJvbycsICdmYXJ7e319Ym9vJywgVGV4dCk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignZmFye3sxMjN9fWJvbycsICdmYXJ7ezEyM319Ym9vJywgVGV4dCk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignZmFyXFxcXHt7MTIzfX1ib28nLCAnZmFyXFxcXHt7MTIzfX1ib28nLCBUZXh0KTtcblx0fSk7XG5cblx0dGVzdCgnUGFyc2VyLCBsaXRlcmFsIGNvZGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignZmFyYDEyM2Bib28nLCAnZmFyYDEyM2Bib28nLCBUZXh0KTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCdmYXJcXFxcYDEyM1xcXFxgYm9vJywgJ2ZhclxcXFxgMTIzXFxcXGBib28nLCBUZXh0KTtcblx0fSk7XG5cblx0dGVzdCgnUGFyc2VyLCB2YXJpYWJsZXMvdGFic3RvcCcsICgpID0+IHtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckZmFyLWJvbycsICctYm9vJywgVmFyaWFibGUsIFRleHQpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJ1xcXFwkZmFyLWJvbycsICckZmFyLWJvbycsIFRleHQpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJ2ZhciRmYXJib28nLCAnZmFyJywgVGV4dCwgVmFyaWFibGUpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJ2ZhciR7ZmFyYm9vfScsICdmYXInLCBUZXh0LCBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJDEyMycsICcnLCBQbGFjZWhvbGRlcik7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJGZhcmJvbycsICcnLCBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJGZhcjEyYm9vJywgJycsIFZhcmlhYmxlKTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCcwMDBfJHtmYXJ9XzAwMCcsICcwMDBfXzAwMCcsIFRleHQsIFZhcmlhYmxlLCBUZXh0KTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCdGRkZfJHtUTV9TRUxFQ1RFRF9URVhUfV9GRkYkMCcsICdGRkZfX0ZGRicsIFRleHQsIFZhcmlhYmxlLCBUZXh0LCBQbGFjZWhvbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ1BhcnNlciwgdmFyaWFibGVzL3BsYWNlaG9sZGVyIHdpdGggZGVmYXVsdHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHtuYW1lOnZhbHVlfScsICd2YWx1ZScsIFZhcmlhYmxlKTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckezE6dmFsdWV9JywgJ3ZhbHVlJywgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MTpiYXIkezI6Zm9vfWJhcn0nLCAnYmFyZm9vYmFyJywgUGxhY2Vob2xkZXIpO1xuXG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHtuYW1lOnZhbHVlJywgJyR7bmFtZTp2YWx1ZScsIFRleHQpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MTpiYXIkezI6Zm9vYmFyfScsICckezE6YmFyZm9vYmFyJywgVGV4dCwgUGxhY2Vob2xkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXJzZXIsIHZhcmlhYmxlIHRyYW5zZm9ybXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHtmb28vLy99JywgJycsIFZhcmlhYmxlKTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCcke2Zvby9yZWdleC9mb3JtYXQvZ21pfScsICcnLCBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHtmb28vKFtBLVpdW2Etel0pL2Zvcm1hdC99JywgJycsIFZhcmlhYmxlKTtcblxuXHRcdC8vIGludmFsaWQgcmVnZXhcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCcke2Zvby8oW0EtWl1bYS16XSkvZm9ybWF0L0dNSX0nLCAnJHtmb28vKFtBLVpdW2Etel0pL2Zvcm1hdC9HTUl9JywgVGV4dCk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHtmb28vKFtBLVpdW2Etel0pL2Zvcm1hdC9mdW5reX0nLCAnJHtmb28vKFtBLVpdW2Etel0pL2Zvcm1hdC9mdW5reX0nLCBUZXh0KTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCcke2Zvby8oW0EtWl1bYS16XS9mb3JtYXQvfScsICcke2Zvby8oW0EtWl1bYS16XS9mb3JtYXQvfScsIFRleHQpO1xuXG5cdFx0Ly8gdHJpY2t5IHJlZ2V4XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHtmb28vbVxcXFwvYXRjaC8kMS9pfScsICcnLCBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0TWFya2VyKCcke2Zvby9yZWdleFxcL2Zvcm1hdC9vcHRpb25zfScsIFRleHQpO1xuXG5cdFx0Ly8gaW5jb21wbGV0ZVxuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7Zm9vLy8vJywgJyR7Zm9vLy8vJywgVGV4dCk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHtmb28vcmVnZXgvZm9ybWF0L29wdGlvbnMnLCAnJHtmb28vcmVnZXgvZm9ybWF0L29wdGlvbnMnLCBUZXh0KTtcblxuXHRcdC8vIGZvcm1hdCBzdHJpbmdcblx0XHRhc3NlcnRNYXJrZXIoJyR7Zm9vLy4qLyR7MDpmb29vfS9pfScsIFZhcmlhYmxlKTtcblx0XHRhc3NlcnRNYXJrZXIoJyR7Zm9vLy4qLyR7MX0vaX0nLCBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0TWFya2VyKCcke2Zvby8uKi8kMS9pfScsIFZhcmlhYmxlKTtcblx0XHRhc3NlcnRNYXJrZXIoJyR7Zm9vLy4qL1RoaXMtJDEtZW5jbG9zZXMvaX0nLCBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0TWFya2VyKCcke2Zvby8uKi9jb21wbGV4JHsxOmVsc2V9L2l9JywgVmFyaWFibGUpO1xuXHRcdGFzc2VydE1hcmtlcignJHtmb28vLiovY29tcGxleCR7MTotZWxzZX0vaX0nLCBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0TWFya2VyKCcke2Zvby8uKi9jb21wbGV4JHsxOitpZn0vaX0nLCBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0TWFya2VyKCcke2Zvby8uKi9jb21wbGV4JHsxOj9pZjplbHNlfS9pfScsIFZhcmlhYmxlKTtcblx0XHRhc3NlcnRNYXJrZXIoJyR7Zm9vLy4qL2NvbXBsZXgkezE6L3VwY2FzZX0vaX0nLCBWYXJpYWJsZSk7XG5cblx0fSk7XG5cblx0dGVzdCgnUGFyc2VyLCBwbGFjZWhvbGRlciB0cmFuc2Zvcm1zJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MS8vL30nLCAnJywgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MS9yZWdleC9mb3JtYXQvZ21pfScsICcnLCBQbGFjZWhvbGRlcik7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHsxLyhbQS1aXVthLXpdKS9mb3JtYXQvfScsICcnLCBQbGFjZWhvbGRlcik7XG5cblx0XHQvLyB0cmlja3kgcmVnZXhcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckezEvbVxcXFwvYXRjaC8kMS9pfScsICcnLCBQbGFjZWhvbGRlcik7XG5cdFx0YXNzZXJ0TWFya2VyKCckezEvcmVnZXhcXC9mb3JtYXQvb3B0aW9uc30nLCBUZXh0KTtcblxuXHRcdC8vIGluY29tcGxldGVcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckezEvLy8nLCAnJHsxLy8vJywgVGV4dCk7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignJHsxL3JlZ2V4L2Zvcm1hdC9vcHRpb25zJywgJyR7MS9yZWdleC9mb3JtYXQvb3B0aW9ucycsIFRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdObyB3YXkgdG8gZXNjYXBlIGZvcndhcmQgc2xhc2ggaW4gc25pcHBldCByZWdleCAjMzY3MTUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWFya2VyKCcke1RNX0RJUkVDVE9SWS9zcmNcXFxcLy8kMS99JywgVmFyaWFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdObyB3YXkgdG8gZXNjYXBlIGZvcndhcmQgc2xhc2ggaW4gc25pcHBldCBmb3JtYXQgc2VjdGlvbiAjMzc1NjInLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWFya2VyKCcke1RNX1NFTEVDVEVEX1RFWFQvYS9cXFxcLyQxL2d9JywgVmFyaWFibGUpO1xuXHRcdGFzc2VydE1hcmtlcignJHtUTV9TRUxFQ1RFRF9URVhUL2EvaW5cXFxcLyQxbmVyL2d9JywgVmFyaWFibGUpO1xuXHRcdGFzc2VydE1hcmtlcignJHtUTV9TRUxFQ1RFRF9URVhUL2EvZW5kXFxcXC8vZ30nLCBWYXJpYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BhcnNlciwgcGxhY2Vob2xkZXIgd2l0aCBjaG9pY2UnLCAoKSA9PiB7XG5cblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckezF8b25lLHR3byx0aHJlZXx9JywgJ29uZScsIFBsYWNlaG9sZGVyKTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckezF8b25lfH0nLCAnb25lJywgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MXxvbmUxLHR3bzJ8fScsICdvbmUxJywgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MXxvbmUxXFxcXCx0d28yfH0nLCAnb25lMSx0d28yJywgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MXxvbmUxXFxcXHx0d28yfH0nLCAnb25lMXx0d28yJywgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MXxvbmUxXFxcXGF0d28yfH0nLCAnb25lMVxcXFxhdHdvMicsIFBsYWNlaG9sZGVyKTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckezF8b25lLHR3byx0aHJlZSx8fScsICckezF8b25lLHR3byx0aHJlZSx8fScsIFRleHQpO1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MXxvbmUsJywgJyR7MXxvbmUsJywgVGV4dCk7XG5cblx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnJHsxfG9uZSx0d28sdGhyZWV8fScpO1xuXHRcdGNvbnN0IGV4cGVjdGVkOiAoKG06IE1hcmtlcikgPT4gYm9vbGVhbilbXSA9IFtcblx0XHRcdG0gPT4gbSBpbnN0YW5jZW9mIFBsYWNlaG9sZGVyLFxuXHRcdFx0bSA9PiBtIGluc3RhbmNlb2YgQ2hvaWNlICYmIG0ub3B0aW9ucy5sZW5ndGggPT09IDMgJiYgbS5vcHRpb25zLmV2ZXJ5KHggPT4geCBpbnN0YW5jZW9mIFRleHQpLFxuXHRcdF07XG5cdFx0c25pcHBldC53YWxrKG1hcmtlciA9PiB7XG5cdFx0XHRhc3NlcnQub2soZXhwZWN0ZWQuc2hpZnQoKSEobWFya2VyKSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCBjaG9pY2VzOiB1bmFibGUgdG8gZXNjYXBlIGNvbW1hIGFuZCBwaXBlLCAjMzE1MjEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0VGV4dEFuZE1hcmtlcignY29uc29sZS5sb2coJHsxfG5vdFxcXFwsIG5vdCwgZml2ZSwgNSwgMSAgIDIzfH0pOycsICdjb25zb2xlLmxvZyhub3QsIG5vdCk7JywgVGV4dCwgUGxhY2Vob2xkZXIsIFRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdNYXJrZXIsIHRvVGV4dG1hdGVTdHJpbmcoKScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydFRleHRzbmlwcGV0U3RyaW5nKGlucHV0OiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKGlucHV0KTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IHNuaXBwZXQudG9UZXh0bWF0ZVN0cmluZygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdH1cblxuXHRcdGFzc2VydFRleHRzbmlwcGV0U3RyaW5nKCckMScsICckMScpO1xuXHRcdGFzc2VydFRleHRzbmlwcGV0U3RyaW5nKCdcXFxcJDEnLCAnXFxcXCQxJyk7XG5cdFx0YXNzZXJ0VGV4dHNuaXBwZXRTdHJpbmcoJ2NvbnNvbGUubG9nKCR7MXxub3RcXFxcLCBub3QsIGZpdmUsIDUsIDEgICAyM3x9KTsnLCAnY29uc29sZS5sb2coJHsxfG5vdFxcXFwsIG5vdCwgZml2ZSwgNSwgMSAgIDIzfH0pOycpO1xuXHRcdGFzc2VydFRleHRzbmlwcGV0U3RyaW5nKCdjb25zb2xlLmxvZygkezF8bm90XFxcXCwgbm90LCBcXFxcfCBmaXZlLCA1LCAxICAgMjN8fSk7JywgJ2NvbnNvbGUubG9nKCR7MXxub3RcXFxcLCBub3QsIFxcXFx8IGZpdmUsIDUsIDEgICAyM3x9KTsnKTtcblx0XHRhc3NlcnRUZXh0c25pcHBldFN0cmluZygnJHsxfGNob1xcXFwsaWNlcyx3aVxcXFx8dGgsZXNjXFxcXFxcXFxhcGluZyxjaGFsbFxcXFxcXFxcXFxcXCxlbmdlc3x9JywgJyR7MXxjaG9cXFxcLGljZXMsd2lcXFxcfHRoLGVzY1xcXFxcXFxcYXBpbmcsY2hhbGxcXFxcXFxcXFxcXFwsZW5nZXN8fScpO1xuXHRcdGFzc2VydFRleHRzbmlwcGV0U3RyaW5nKCd0aGlzIGlzIHRleHQnLCAndGhpcyBpcyB0ZXh0Jyk7XG5cdFx0YXNzZXJ0VGV4dHNuaXBwZXRTdHJpbmcoJ3RoaXMgJHsxOmlzICR7MjpuZXN0ZWQgd2l0aCAkdmFyfX0nLCAndGhpcyAkezE6aXMgJHsyOm5lc3RlZCB3aXRoICR7dmFyfX19Jyk7XG5cdFx0YXNzZXJ0VGV4dHNuaXBwZXRTdHJpbmcoJ3RoaXMgJHsxOmlzICR7MjpuZXN0ZWQgd2l0aCAkdmFyfX19JywgJ3RoaXMgJHsxOmlzICR7MjpuZXN0ZWQgd2l0aCAke3Zhcn19fVxcXFx9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ01hcmtlciwgdG9UZXh0bWF0ZVN0cmluZygpIDwtPiBpZGVudGl0eScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydElkZW50KGlucHV0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdC8vIGZ1bGwgbG9vcDogKDEpIHBhcnNlIGlucHV0LCAoMikgZ2VuZXJhdGUgdGV4dG1hdGUgc3RyaW5nLCAoMykgcGFyc2UsICg0KSBlbnN1cmUgYm90aCB0cmVlcyBhcmUgZXF1YWxcblx0XHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKGlucHV0KTtcblx0XHRcdGNvbnN0IGlucHV0MiA9IHNuaXBwZXQudG9UZXh0bWF0ZVN0cmluZygpO1xuXHRcdFx0Y29uc3Qgc25pcHBldDIgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKGlucHV0Mik7XG5cblx0XHRcdGZ1bmN0aW9uIGNoZWNrQ2hlY2tDaGlsZHJlbihtYXJrZXIxOiBNYXJrZXIsIG1hcmtlcjI6IE1hcmtlcikge1xuXHRcdFx0XHRhc3NlcnQub2sobWFya2VyMSBpbnN0YW5jZW9mIE9iamVjdC5nZXRQcm90b3R5cGVPZihtYXJrZXIyKS5jb25zdHJ1Y3Rvcik7XG5cdFx0XHRcdGFzc2VydC5vayhtYXJrZXIyIGluc3RhbmNlb2YgT2JqZWN0LmdldFByb3RvdHlwZU9mKG1hcmtlcjEpLmNvbnN0cnVjdG9yKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyMS5jaGlsZHJlbi5sZW5ndGgsIG1hcmtlcjIuY2hpbGRyZW4ubGVuZ3RoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcjEudG9TdHJpbmcoKSwgbWFya2VyMi50b1N0cmluZygpKTtcblxuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1hcmtlcjEuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjaGVja0NoZWNrQ2hpbGRyZW4obWFya2VyMS5jaGlsZHJlbltpXSwgbWFya2VyMi5jaGlsZHJlbltpXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y2hlY2tDaGVja0NoaWxkcmVuKHNuaXBwZXQsIHNuaXBwZXQyKTtcblx0XHR9XG5cblx0XHRhc3NlcnRJZGVudCgnJDEnKTtcblx0XHRhc3NlcnRJZGVudCgnXFxcXCQxJyk7XG5cdFx0YXNzZXJ0SWRlbnQoJ2NvbnNvbGUubG9nKCR7MXxub3RcXFxcLCBub3QsIGZpdmUsIDUsIDEgICAyM3x9KTsnKTtcblx0XHRhc3NlcnRJZGVudCgnY29uc29sZS5sb2coJHsxfG5vdFxcXFwsIG5vdCwgXFxcXHwgZml2ZSwgNSwgMSAgIDIzfH0pOycpO1xuXHRcdGFzc2VydElkZW50KCd0aGlzIGlzIHRleHQnKTtcblx0XHRhc3NlcnRJZGVudCgndGhpcyAkezE6aXMgJHsyOm5lc3RlZCB3aXRoICR2YXJ9fScpO1xuXHRcdGFzc2VydElkZW50KCd0aGlzICR7MTppcyAkezI6bmVzdGVkIHdpdGggJHZhcn19fScpO1xuXHRcdGFzc2VydElkZW50KCd0aGlzICR7MTppcyAkezI6bmVzdGVkIHdpdGggJHZhcn19IGFuZCByZXBlYXRpbmcgJDEnKTtcblx0fSk7XG5cblx0dGVzdCgnUGFyc2VyLCBjaG9pc2UgbWFya2VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcGxhY2Vob2xkZXJzIH0gPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCckezF8b25lLHR3byx0aHJlZXx9Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhY2Vob2xkZXJzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHBsYWNlaG9sZGVyc1swXS5jaG9pY2UgaW5zdGFuY2VvZiBDaG9pY2UpO1xuXHRcdGFzc2VydC5vayhwbGFjZWhvbGRlcnNbMF0uY2hpbGRyZW5bMF0gaW5zdGFuY2VvZiBDaG9pY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPENob2ljZT5wbGFjZWhvbGRlcnNbMF0uY2hpbGRyZW5bMF0pLm9wdGlvbnMubGVuZ3RoLCAzKTtcblxuXHRcdGFzc2VydFRleHQoJyR7MXxvbmUsdHdvLHRocmVlfH0nLCAnb25lJyk7XG5cdFx0YXNzZXJ0VGV4dCgnXFxcXCR7MXxvbmUsdHdvLHRocmVlfH0nLCAnJHsxfG9uZSx0d28sdGhyZWV8fScpO1xuXHRcdGFzc2VydFRleHQoJyR7MVxcXFx8b25lLHR3byx0aHJlZXx9JywgJyR7MVxcXFx8b25lLHR3byx0aHJlZXx9Jyk7XG5cdFx0YXNzZXJ0VGV4dCgnJHsxfHx9JywgJyR7MXx8fScpO1xuXHR9KTtcblxuXHR0ZXN0KCdCYWNrc2xhc2ggY2hhcmFjdGVyIGVzY2FwZSBpbiBjaG9pY2UgdGFic3RvcCBkb2VzblxcJ3Qgd29yayAjNTg0OTQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCB7IHBsYWNlaG9sZGVycyB9ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnJHsxfFxcXFwsLH0sJCxcXFxcfCxcXFxcXFxcXHx9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsYWNlaG9sZGVycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayhwbGFjZWhvbGRlcnNbMF0uY2hvaWNlIGluc3RhbmNlb2YgQ2hvaWNlKTtcblx0fSk7XG5cblx0dGVzdCgnUGFyc2VyLCBvbmx5IHRleHRtYXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHAgPSBuZXcgU25pcHBldFBhcnNlcigpO1xuXHRcdGFzc2VydE1hcmtlcihwLnBhcnNlKCdmYXJ7e319Ym9vJyksIFRleHQpO1xuXHRcdGFzc2VydE1hcmtlcihwLnBhcnNlKCdmYXJ7ezEyM319Ym9vJyksIFRleHQpO1xuXHRcdGFzc2VydE1hcmtlcihwLnBhcnNlKCdmYXJcXFxce3sxMjN9fWJvbycpLCBUZXh0KTtcblxuXHRcdGFzc2VydE1hcmtlcihwLnBhcnNlKCdmYXIkMGJvbycpLCBUZXh0LCBQbGFjZWhvbGRlciwgVGV4dCk7XG5cdFx0YXNzZXJ0TWFya2VyKHAucGFyc2UoJ2ZhciR7MTIzfWJvbycpLCBUZXh0LCBQbGFjZWhvbGRlciwgVGV4dCk7XG5cdFx0YXNzZXJ0TWFya2VyKHAucGFyc2UoJ2ZhclxcXFwkezEyM31ib28nKSwgVGV4dCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BhcnNlciwgcmVhbCB3b3JsZCcsICgpID0+IHtcblx0XHRsZXQgbWFya2VyID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnY29uc29sZS53YXJuKCR7MTogJFRNX1NFTEVDVEVEX1RFWFQgfSknKS5jaGlsZHJlbjtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJbMF0udG9TdHJpbmcoKSwgJ2NvbnNvbGUud2FybignKTtcblx0XHRhc3NlcnQub2sobWFya2VyWzFdIGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJbMl0udG9TdHJpbmcoKSwgJyknKTtcblxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gPFBsYWNlaG9sZGVyPm1hcmtlclsxXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhY2Vob2xkZXIuaW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGFjZWhvbGRlci5jaGlsZHJlbi5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5vayhwbGFjZWhvbGRlci5jaGlsZHJlblswXSBpbnN0YW5jZW9mIFRleHQpO1xuXHRcdGFzc2VydC5vayhwbGFjZWhvbGRlci5jaGlsZHJlblsxXSBpbnN0YW5jZW9mIFZhcmlhYmxlKTtcblx0XHRhc3NlcnQub2socGxhY2Vob2xkZXIuY2hpbGRyZW5bMl0gaW5zdGFuY2VvZiBUZXh0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhY2Vob2xkZXIuY2hpbGRyZW5bMF0udG9TdHJpbmcoKSwgJyAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhY2Vob2xkZXIuY2hpbGRyZW5bMV0udG9TdHJpbmcoKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGFjZWhvbGRlci5jaGlsZHJlblsyXS50b1N0cmluZygpLCAnICcpO1xuXG5cdFx0Y29uc3QgbmVzdGVkVmFyaWFibGUgPSA8VmFyaWFibGU+cGxhY2Vob2xkZXIuY2hpbGRyZW5bMV07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5lc3RlZFZhcmlhYmxlLm5hbWUsICdUTV9TRUxFQ1RFRF9URVhUJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5lc3RlZFZhcmlhYmxlLmNoaWxkcmVuLmxlbmd0aCwgMCk7XG5cblx0XHRtYXJrZXIgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCckVE1fU0VMRUNURURfVEVYVCcpLmNoaWxkcmVuO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXIubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQub2sobWFya2VyWzBdIGluc3RhbmNlb2YgVmFyaWFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXJzZXIsIHRyYW5zZm9ybSBleGFtcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2hpbGRyZW4gfSA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJyR7MTpuYW1lfSA6ICR7Mjp0eXBlfSR7My9cXFxcczo9KC4qKS8kezE6KyA6PX0kezF9L307XFxuJDAnKTtcblxuXHRcdC8vJHsxOm5hbWV9XG5cdFx0YXNzZXJ0Lm9rKGNoaWxkcmVuWzBdIGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlblswXS5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlblswXS5jaGlsZHJlblswXS50b1N0cmluZygpLCAnbmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPFBsYWNlaG9sZGVyPmNoaWxkcmVuWzBdKS50cmFuc2Zvcm0sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyA6XG5cdFx0YXNzZXJ0Lm9rKGNoaWxkcmVuWzFdIGluc3RhbmNlb2YgVGV4dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuWzFdLnRvU3RyaW5nKCksICcgOiAnKTtcblxuXHRcdC8vJHsyOnR5cGV9XG5cdFx0YXNzZXJ0Lm9rKGNoaWxkcmVuWzJdIGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlblsyXS5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlblsyXS5jaGlsZHJlblswXS50b1N0cmluZygpLCAndHlwZScpO1xuXG5cdFx0Ly8kezMvXFxcXHM6PSguKikvJHsxOisgOj19JHsxfS99XG5cdFx0YXNzZXJ0Lm9rKGNoaWxkcmVuWzNdIGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlblszXS5jaGlsZHJlbi5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCgoPFBsYWNlaG9sZGVyPmNoaWxkcmVuWzNdKS50cmFuc2Zvcm0sIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgdHJhbnNmb3JtID0gKDxQbGFjZWhvbGRlcj5jaGlsZHJlblszXSkudHJhbnNmb3JtITtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYW5zZm9ybS5yZWdleHAsIC9cXHM6PSguKikvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNmb3JtLmNoaWxkcmVuLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHRyYW5zZm9ybS5jaGlsZHJlblswXSBpbnN0YW5jZW9mIEZvcm1hdFN0cmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8Rm9ybWF0U3RyaW5nPnRyYW5zZm9ybS5jaGlsZHJlblswXSkuaW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPEZvcm1hdFN0cmluZz50cmFuc2Zvcm0uY2hpbGRyZW5bMF0pLmlmVmFsdWUsICcgOj0nKTtcblx0XHRhc3NlcnQub2sodHJhbnNmb3JtLmNoaWxkcmVuWzFdIGluc3RhbmNlb2YgRm9ybWF0U3RyaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxGb3JtYXRTdHJpbmc+dHJhbnNmb3JtLmNoaWxkcmVuWzFdKS5pbmRleCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKGNoaWxkcmVuWzRdIGluc3RhbmNlb2YgVGV4dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuWzRdLnRvU3RyaW5nKCksICc7XFxuJyk7XG5cblx0fSk7XG5cblx0Ly8gVE9ETyBAanJpZWtlbiBtYWtpbmcgdGhpcyBzdHJpY3RFcXVsIGNhdXNlcyBjaXJjdWxhciBqc29uIGNvbnZlcnNpb24gZXJyb3JzXG5cdHRlc3QoJ1BhcnNlciwgZGVmYXVsdCBwbGFjZWhvbGRlciB2YWx1ZXMnLCAoKSA9PiB7XG5cblx0XHRhc3NlcnRNYXJrZXIoJ2Vycm9yQ29udGV4dDogYCR7MTplcnJ9YCwgZXJyb3I6ICQxJywgVGV4dCwgUGxhY2Vob2xkZXIsIFRleHQsIFBsYWNlaG9sZGVyKTtcblxuXHRcdGNvbnN0IFssIHAxLCAsIHAyXSA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJ2Vycm9yQ29udGV4dDogYCR7MTplcnJ9YCwgZXJyb3I6JDEnKS5jaGlsZHJlbjtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPFBsYWNlaG9sZGVyPnAxKS5pbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8UGxhY2Vob2xkZXI+cDEpLmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8VGV4dD4oPFBsYWNlaG9sZGVyPnAxKS5jaGlsZHJlblswXSkudG9TdHJpbmcoKSwgJ2VycicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8UGxhY2Vob2xkZXI+cDIpLmluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxQbGFjZWhvbGRlcj5wMikuY2hpbGRyZW4ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxUZXh0Pig8UGxhY2Vob2xkZXI+cDIpLmNoaWxkcmVuWzBdKS50b1N0cmluZygpLCAnZXJyJyk7XG5cdH0pO1xuXG5cdC8vIFRPRE8gQGpyaWVrZW4gbWFraW5nIHRoaXMgc3RyaWN0RXF1bCBjYXVzZXMgY2lyY3VsYXIganNvbiBjb252ZXJzaW9uIGVycm9yc1xuXHR0ZXN0KCdQYXJzZXIsIGRlZmF1bHQgcGxhY2Vob2xkZXIgdmFsdWVzIGFuZCBvbmUgdHJhbnNmb3JtJywgKCkgPT4ge1xuXG5cdFx0YXNzZXJ0TWFya2VyKCdlcnJvckNvbnRleHQ6IGAkezE6ZXJyfWAsIGVycm9yOiAkezEvZXJyL29rL30nLCBUZXh0LCBQbGFjZWhvbGRlciwgVGV4dCwgUGxhY2Vob2xkZXIpO1xuXG5cdFx0Y29uc3QgWywgcDMsICwgcDRdID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnZXJyb3JDb250ZXh0OiBgJHsxOmVycn1gLCBlcnJvcjokezEvZXJyL29rL30nKS5jaGlsZHJlbjtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPFBsYWNlaG9sZGVyPnAzKS5pbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8UGxhY2Vob2xkZXI+cDMpLmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8VGV4dD4oPFBsYWNlaG9sZGVyPnAzKS5jaGlsZHJlblswXSkudG9TdHJpbmcoKSwgJ2VycicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPFBsYWNlaG9sZGVyPnAzKS50cmFuc2Zvcm0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxQbGFjZWhvbGRlcj5wNCkuaW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPFBsYWNlaG9sZGVyPnA0KS5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPFRleHQ+KDxQbGFjZWhvbGRlcj5wNCkuY2hpbGRyZW5bMF0pLnRvU3RyaW5nKCksICdlcnInKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoKDxQbGFjZWhvbGRlcj5wNCkudHJhbnNmb3JtLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXBlYXRlZCBzbmlwcGV0IHBsYWNlaG9sZGVyIHNob3VsZCBhbHdheXMgaW5oZXJpdCwgIzMxMDQwJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydFRleHQoJyR7MTpmb299LWFiYy0kMScsICdmb28tYWJjLWZvbycpO1xuXHRcdGFzc2VydFRleHQoJyR7MTpmb299LWFiYy0kezF9JywgJ2Zvby1hYmMtZm9vJyk7XG5cdFx0YXNzZXJ0VGV4dCgnJHsxOmZvb30tYWJjLSR7MTpiYXJ9JywgJ2Zvby1hYmMtZm9vJyk7XG5cdFx0YXNzZXJ0VGV4dCgnJHsxfS1hYmMtJHsxOmZvb30nLCAnZm9vLWFiYy1mb28nKTtcblx0fSk7XG5cblx0dGVzdCgnYmFja3NwYWNlIGVzYXBjZSBpbiBUTSBvbmx5LCAjMTYyMTInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gU25pcHBldFBhcnNlci5hc0luc2VydFRleHQoJ0ZvbyBcXFxcXFxcXCR7YWJjfWJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsICdGb28gXFxcXGJhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xvbiBhcyB2YXJpYWJsZS9wbGFjZWhvbGRlciB2YWx1ZSwgIzE2NzE3JywgKCkgPT4ge1xuXHRcdGxldCBhY3R1YWwgPSBTbmlwcGV0UGFyc2VyLmFzSW5zZXJ0VGV4dCgnJHtUTV9TRUxFQ1RFRF9URVhUOmZvbzpiYXJ9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgJ2ZvbzpiYXInKTtcblxuXHRcdGFjdHVhbCA9IFNuaXBwZXRQYXJzZXIuYXNJbnNlcnRUZXh0KCckezE6Zm9vOmJhcn0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCAnZm9vOmJhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNvbXBsZXRlIHBsYWNlaG9sZGVyJywgKCkgPT4ge1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MTp9JywgJycsIFBsYWNlaG9sZGVyKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya2VyI2xlbicsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydExlbih0ZW1wbGF0ZTogc3RyaW5nLCAuLi5sZW5ndGhzOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UodGVtcGxhdGUsIHRydWUpO1xuXHRcdFx0c25pcHBldC53YWxrKG0gPT4ge1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IGxlbmd0aHMuc2hpZnQoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0ubGVuKCksIGV4cGVjdGVkKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZW5ndGhzLmxlbmd0aCwgMCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0TGVuKCd0ZXh0JDAnLCA0LCAwKTtcblx0XHRhc3NlcnRMZW4oJyQxdGV4dCQwJywgMCwgNCwgMCk7XG5cdFx0YXNzZXJ0TGVuKCd0ZSQxeHQkMCcsIDIsIDAsIDIsIDApO1xuXHRcdGFzc2VydExlbignZXJyb3JDb250ZXh0OiBgJHsxOmVycn1gLCBlcnJvcjogJDAnLCAxNSwgMCwgMywgMTAsIDApO1xuXHRcdGFzc2VydExlbignZXJyb3JDb250ZXh0OiBgJHsxOmVycn1gLCBlcnJvcjogJDEkMCcsIDE1LCAwLCAzLCAxMCwgMCwgMywgMCk7XG5cdFx0YXNzZXJ0TGVuKCckVE1fU0VMRUNURURfVEVYVCQwJywgMCwgMCk7XG5cdFx0YXNzZXJ0TGVuKCcke1RNX1NFTEVDVEVEX1RFWFQ6ZGVmfSQwJywgMCwgMywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlciwgcGFyZW50IG5vZGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCdUaGlzICR7MTppcyAkezI6bmVzdGVkfX0kMCcsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQucGxhY2Vob2xkZXJzLmxlbmd0aCwgMyk7XG5cdFx0bGV0IFtmaXJzdCwgc2Vjb25kXSA9IHNuaXBwZXQucGxhY2Vob2xkZXJzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5pbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5pbmRleCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHNlY29uZC5wYXJlbnQgPT09IGZpcnN0KTtcblx0XHRhc3NlcnQub2soZmlyc3QucGFyZW50ID09PSBzbmlwcGV0KTtcblxuXHRcdHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCcke1ZBUjpkZWZhdWx0JHsxOnZhbHVlfX0kMCcsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LnBsYWNlaG9sZGVycy5sZW5ndGgsIDIpO1xuXHRcdFtmaXJzdF0gPSBzbmlwcGV0LnBsYWNlaG9sZGVycztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuaW5kZXgsIDEpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNuaXBwZXQuY2hpbGRyZW5bMF0gaW5zdGFuY2VvZiBWYXJpYWJsZSk7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0LnBhcmVudCA9PT0gc25pcHBldC5jaGlsZHJlblswXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RleHRtYXRlU25pcHBldCNlbmNsb3NpbmdQbGFjZWhvbGRlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJ1RoaXMgJHsxOmlzICR7MjpuZXN0ZWR9fSQwJywgdHJ1ZSk7XG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gc25pcHBldC5wbGFjZWhvbGRlcnM7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuaXBwZXQuZW5jbG9zaW5nUGxhY2Vob2xkZXJzKGZpcnN0KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25pcHBldC5lbmNsb3NpbmdQbGFjZWhvbGRlcnMoc2Vjb25kKSwgW2ZpcnN0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RleHRtYXRlU25pcHBldCNvZmZzZXQnLCAoKSA9PiB7XG5cdFx0bGV0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCd0ZSQxeHQnLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC5vZmZzZXQoc25pcHBldC5jaGlsZHJlblswXSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0Lm9mZnNldChzbmlwcGV0LmNoaWxkcmVuWzFdKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQub2Zmc2V0KHNuaXBwZXQuY2hpbGRyZW5bMl0pLCAyKTtcblxuXHRcdHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCcke1RNX1NFTEVDVEVEX1RFWFQ6ZGVmfScsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0Lm9mZnNldChzbmlwcGV0LmNoaWxkcmVuWzBdKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQub2Zmc2V0KCg8VmFyaWFibGU+c25pcHBldC5jaGlsZHJlblswXSkuY2hpbGRyZW5bMF0pLCAwKTtcblxuXHRcdC8vIGZvcmdlaW4gbWFya2VyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQub2Zmc2V0KG5ldyBUZXh0KCdmb28nKSksIC0xKTtcblx0fSk7XG5cblx0dGVzdCgnVGV4dG1hdGVTbmlwcGV0I3BsYWNlaG9sZGVyJywgKCkgPT4ge1xuXHRcdGxldCBzbmlwcGV0ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgndGUkMXh0JDAnLCB0cnVlKTtcblx0XHRsZXQgcGxhY2Vob2xkZXJzID0gc25pcHBldC5wbGFjZWhvbGRlcnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsYWNlaG9sZGVycy5sZW5ndGgsIDIpO1xuXG5cdFx0c25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJ3RlJDF4dCQxJDAnLCB0cnVlKTtcblx0XHRwbGFjZWhvbGRlcnMgPSBzbmlwcGV0LnBsYWNlaG9sZGVycztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhY2Vob2xkZXJzLmxlbmd0aCwgMyk7XG5cblxuXHRcdHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCd0ZSQxeHQkMiQwJywgdHJ1ZSk7XG5cdFx0cGxhY2Vob2xkZXJzID0gc25pcHBldC5wbGFjZWhvbGRlcnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsYWNlaG9sZGVycy5sZW5ndGgsIDMpO1xuXG5cdFx0c25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJyR7MTpiYXIkezI6Zm9vfWJhcn0kMCcsIHRydWUpO1xuXHRcdHBsYWNlaG9sZGVycyA9IHNuaXBwZXQucGxhY2Vob2xkZXJzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGFjZWhvbGRlcnMubGVuZ3RoLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnVGV4dG1hdGVTbmlwcGV0I3JlcGxhY2UgMS8yJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCdhYWEkezE6YmJiJHsyOmNjY319JDAnLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LnBsYWNlaG9sZGVycy5sZW5ndGgsIDMpO1xuXHRcdGNvbnN0IFssIHNlY29uZF0gPSBzbmlwcGV0LnBsYWNlaG9sZGVycztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmluZGV4LCAyKTtcblxuXHRcdGNvbnN0IGVuY2xvc2luZyA9IHNuaXBwZXQuZW5jbG9zaW5nUGxhY2Vob2xkZXJzKHNlY29uZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuY2xvc2luZy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmNsb3NpbmdbMF0uaW5kZXgsIDEpO1xuXG5cdFx0Y29uc3QgbmVzdGVkID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnZGRkJDFlZWUkMCcsIHRydWUpO1xuXHRcdHNuaXBwZXQucmVwbGFjZShzZWNvbmQsIG5lc3RlZC5jaGlsZHJlbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC50b1N0cmluZygpLCAnYWFhYmJiZGRkZWVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQucGxhY2Vob2xkZXJzLmxlbmd0aCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQucGxhY2Vob2xkZXJzWzBdLmluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC5wbGFjZWhvbGRlcnNbMV0uaW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LnBsYWNlaG9sZGVyc1syXS5pbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQucGxhY2Vob2xkZXJzWzNdLmluZGV4LCAwKTtcblxuXHRcdGNvbnN0IG5ld0VuY2xvc2luZyA9IHNuaXBwZXQuZW5jbG9zaW5nUGxhY2Vob2xkZXJzKHNuaXBwZXQucGxhY2Vob2xkZXJzWzFdKTtcblx0XHRhc3NlcnQub2sobmV3RW5jbG9zaW5nWzBdID09PSBzbmlwcGV0LnBsYWNlaG9sZGVyc1swXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0VuY2xvc2luZy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdFbmNsb3NpbmdbMF0uaW5kZXgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXh0bWF0ZVNuaXBwZXQjcmVwbGFjZSAyLzInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJ2FhYSR7MTpiYmIkezI6Y2NjfX0kMCcsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQucGxhY2Vob2xkZXJzLmxlbmd0aCwgMyk7XG5cdFx0Y29uc3QgWywgc2Vjb25kXSA9IHNuaXBwZXQucGxhY2Vob2xkZXJzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuaW5kZXgsIDIpO1xuXG5cdFx0Y29uc3QgbmVzdGVkID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnZGRkZWVlJDAnLCB0cnVlKTtcblx0XHRzbmlwcGV0LnJlcGxhY2Uoc2Vjb25kLCBuZXN0ZWQuY2hpbGRyZW4pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQudG9TdHJpbmcoKSwgJ2FhYWJiYmRkZGVlZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LnBsYWNlaG9sZGVycy5sZW5ndGgsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IG9yZGVyIGZvciBwbGFjZWhvbGRlcnMsICMyODE4NScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IF8xMCA9IG5ldyBQbGFjZWhvbGRlcigxMCk7XG5cdFx0Y29uc3QgXzIgPSBuZXcgUGxhY2Vob2xkZXIoMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoUGxhY2Vob2xkZXIuY29tcGFyZUJ5SW5kZXgoXzEwLCBfMiksIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdNYXhpbXVtIGNhbGwgc3RhY2sgc2l6ZSBleGNlZWRlZCwgIzI4OTgzJywgZnVuY3Rpb24gKCkge1xuXHRcdG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJyR7MToke2ZvbzokezF9fX0nKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCBjYW4gZnJlZXplIHRoZSBlZGl0b3IsICMzMDQwNycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PE1hcmtlcj4oKTtcblxuXHRcdHNlZW4uY2xlYXIoKTtcblx0XHRuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCdjbGFzcyAkezE6JHtUTV9GSUxFTkFNRS8oPzpcXFxcQXxfKShbQS1aYS16MC05XSspKD86XFxcXC5yYik/Lyg/Mjo6XFxcXHUkMSkvZ319IDwgJHsyOkFwcGxpY2F0aW9ufUNvbnRyb2xsZXJcXG4gICQzXFxuZW5kJykud2FsayhtYXJrZXIgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZWVuLmhhcyhtYXJrZXIpKTtcblx0XHRcdHNlZW4uYWRkKG1hcmtlcik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHNlZW4uY2xlYXIoKTtcblx0XHRuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCckezE6JHtGT086YWJjJDFkZWZ9fScpLndhbGsobWFya2VyID0+IHtcblx0XHRcdGFzc2VydC5vayghc2Vlbi5oYXMobWFya2VyKSk7XG5cdFx0XHRzZWVuLmFkZChtYXJrZXIpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXRzOiBtYWtlIHBhcnNlciBpZ25vcmUgYCR7MHxjaG9pY2V8fWAsICMzMTU5OScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckezB8Zm9vLGJhcnx9JywgJyR7MHxmb28sYmFyfH0nLCBUZXh0KTtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCckezF8Zm9vLGJhcnx9JywgJ2ZvbycsIFBsYWNlaG9sZGVyKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdUcmFuc2Zvcm0gLT4gRm9ybWF0U3RyaW5nI3Jlc29sdmUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyBzaG9ydGhhbmQgZnVuY3Rpb25zXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ3VwY2FzZScpLnJlc29sdmUoJ2ZvbycpLCAnRk9PJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ2Rvd25jYXNlJykucmVzb2x2ZSgnRk9PJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAnY2FwaXRhbGl6ZScpLnJlc29sdmUoJ2JhcicpLCAnQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ2NhcGl0YWxpemUnKS5yZXNvbHZlKCdiYXIgbm8gcmVwZWF0JyksICdCYXIgbm8gcmVwZWF0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ3Bhc2NhbGNhc2UnKS5yZXNvbHZlKCdiYXItZm9vJyksICdCYXJGb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAncGFzY2FsY2FzZScpLnJlc29sdmUoJ2Jhci00Mi1mb28nKSwgJ0JhcjQyRm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ3Bhc2NhbGNhc2UnKS5yZXNvbHZlKCdzbmFrZV9BbmRQYXNjYWxDYXNlJyksICdTbmFrZUFuZFBhc2NhbENhc2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAncGFzY2FsY2FzZScpLnJlc29sdmUoJ2tlYmFiLUFuZFBhc2NhbENhc2UnKSwgJ0tlYmFiQW5kUGFzY2FsQ2FzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsICdwYXNjYWxjYXNlJykucmVzb2x2ZSgnX2p1c3RQYXNjYWxDYXNlJyksICdKdXN0UGFzY2FsQ2FzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsICdjYW1lbGNhc2UnKS5yZXNvbHZlKCdiYXItZm9vJyksICdiYXJGb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAnY2FtZWxjYXNlJykucmVzb2x2ZSgnYmFyLTQyLWZvbycpLCAnYmFyNDJGb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAnY2FtZWxjYXNlJykucmVzb2x2ZSgnc25ha2VfQW5kQ2FtZWxDYXNlJyksICdzbmFrZUFuZENhbWVsQ2FzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsICdjYW1lbGNhc2UnKS5yZXNvbHZlKCdrZWJhYi1BbmRDYW1lbENhc2UnKSwgJ2tlYmFiQW5kQ2FtZWxDYXNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ2NhbWVsY2FzZScpLnJlc29sdmUoJ19KdXN0Q2FtZWxDYXNlJyksICdqdXN0Q2FtZWxDYXNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ2tlYmFiY2FzZScpLnJlc29sdmUoJ2JhckZvbycpLCAnYmFyLWZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsICdrZWJhYmNhc2UnKS5yZXNvbHZlKCdCYXJGb28nKSwgJ2Jhci1mb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAna2ViYWJjYXNlJykucmVzb2x2ZSgnQUJhckZvbycpLCAnYS1iYXItZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ2tlYmFiY2FzZScpLnJlc29sdmUoJ2JhcjQyRm9vJyksICdiYXI0Mi1mb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAna2ViYWJjYXNlJykucmVzb2x2ZSgnc25ha2VfQW5kUGFzY2FsQ2FzZScpLCAnc25ha2UtYW5kLXBhc2NhbC1jYXNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ2tlYmFiY2FzZScpLnJlc29sdmUoJ2tlYmFiLUFuZENhbWVsQ2FzZScpLCAna2ViYWItYW5kLWNhbWVsLWNhc2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAna2ViYWJjYXNlJykucmVzb2x2ZSgnX2p1c3RQYXNjYWxDYXNlJyksICdqdXN0LXBhc2NhbC1jYXNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ2tlYmFiY2FzZScpLnJlc29sdmUoJ19fVVBDQVNFX18nKSwgJ3VwY2FzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsICdrZWJhYmNhc2UnKS5yZXNvbHZlKCdfX0JBUl9GT09fXycpLCAnYmFyLWZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsICdzbmFrZWNhc2UnKS5yZXNvbHZlKCdiYXItZm9vJyksICdiYXJfZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ3NuYWtlY2FzZScpLnJlc29sdmUoJ2Jhci00Mi1mb28nKSwgJ2Jhcl80Ml9mb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCAnc25ha2VjYXNlJykucmVzb2x2ZSgnc25ha2VfQW5kUGFzY2FsQ2FzZScpLCAnc25ha2VfYW5kX3Bhc2NhbF9jYXNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ3NuYWtlY2FzZScpLnJlc29sdmUoJ2tlYmFiLUFuZFBhc2NhbENhc2UnKSwgJ2tlYmFiX2FuZF9wYXNjYWxfY2FzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsICdzbmFrZWNhc2UnKS5yZXNvbHZlKCdfanVzdFBhc2NhbENhc2UnKSwgJ19qdXN0X3Bhc2NhbF9jYXNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ25vdEtub3duJykucmVzb2x2ZSgnaW5wdXQnKSwgJ2lucHV0Jyk7XG5cblx0XHQvLyBpZlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsIHVuZGVmaW5lZCwgJ2ZvbycsIHVuZGVmaW5lZCkucmVzb2x2ZSh1bmRlZmluZWQpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgdW5kZWZpbmVkLCAnZm9vJywgdW5kZWZpbmVkKS5yZXNvbHZlKCcnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsIHVuZGVmaW5lZCwgJ2ZvbycsIHVuZGVmaW5lZCkucmVzb2x2ZSgnYmFyJyksICdmb28nKTtcblxuXHRcdC8vIGVsc2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ2ZvbycpLnJlc29sdmUodW5kZWZpbmVkKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnZm9vJykucmVzb2x2ZSgnJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IEZvcm1hdFN0cmluZygxLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ2ZvbycpLnJlc29sdmUoJ2JhcicpLCAnYmFyJyk7XG5cblx0XHQvLyBpZi1lbHNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBGb3JtYXRTdHJpbmcoMSwgdW5kZWZpbmVkLCAnYmFyJywgJ2ZvbycpLnJlc29sdmUodW5kZWZpbmVkKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsIHVuZGVmaW5lZCwgJ2JhcicsICdmb28nKS5yZXNvbHZlKCcnKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgRm9ybWF0U3RyaW5nKDEsIHVuZGVmaW5lZCwgJ2JhcicsICdmb28nKS5yZXNvbHZlKCdiYXonKSwgJ2JhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdVbmljb2RlIFZhcmlhYmxlIFRyYW5zZm9ybWF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCByZXNvbHZlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIFZhcmlhYmxlUmVzb2x2ZXIge1xuXHRcdFx0cmVzb2x2ZSh2YXJpYWJsZTogVmFyaWFibGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRjb25zdCB2YWx1ZXM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG5cdFx0XHRcdFx0J1JVU1NJQU4nOiAnXHUwNDNFXHUwNDM0XHUwNDM4XHUwNDNEXHUwNDE0XHUwNDMyXHUwNDMwJyxcblx0XHRcdFx0XHQnR1JFRUsnOiAnXHUwM0FEXHUwM0JEXHUwM0IxXHUwM0MyXHUwMzk0XHUwM0NEXHUwM0JGJyxcblx0XHRcdFx0XHQnVFVSS0lTSCc6ICdpc3RhbmJ1bExcdTAxMzEnLFxuXHRcdFx0XHRcdCdKQVBBTkVTRSc6ICdcdTMwNTNcdTMwOTNcdTMwNkJcdTMwNjFcdTMwNkYnXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJldHVybiB2YWx1ZXNbdmFyaWFibGUubmFtZV07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydFRyYW5zZm9ybSh0cmFuc2Zvcm1OYW1lOiBzdHJpbmcsIHZhck5hbWU6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgcCA9IG5ldyBTbmlwcGV0UGFyc2VyKCk7XG5cdFx0XHRjb25zdCBzbmlwcGV0ID0gcC5wYXJzZShgXFwkeyR7dmFyTmFtZX0vKC4qKS9cXCR7MTovJHt0cmFuc2Zvcm1OYW1lfX0vfWApO1xuXHRcdFx0Y29uc3QgdmFyaWFibGUgPSBzbmlwcGV0LmNoaWxkcmVuWzBdIGFzIFZhcmlhYmxlO1xuXHRcdFx0dmFyaWFibGUucmVzb2x2ZShyZXNvbHZlcik7XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IHZhcmlhYmxlLnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQsIGV4cGVjdGVkLCBgJHt0cmFuc2Zvcm1OYW1lfSBmYWlsZWQgZm9yICR7dmFyTmFtZX1gKTtcblx0XHR9XG5cblx0XHRhc3NlcnRUcmFuc2Zvcm0oJ2tlYmFiY2FzZScsICdSVVNTSUFOJywgJ1x1MDQzRVx1MDQzNFx1MDQzOFx1MDQzRC1cdTA0MzRcdTA0MzJcdTA0MzAnKTtcblx0XHRhc3NlcnRUcmFuc2Zvcm0oJ2tlYmFiY2FzZScsICdHUkVFSycsICdcdTAzQURcdTAzQkRcdTAzQjFcdTAzQzItXHUwM0I0XHUwM0NEXHUwM0JGJyk7XG5cdFx0YXNzZXJ0VHJhbnNmb3JtKCdzbmFrZWNhc2UnLCAnUlVTU0lBTicsICdcdTA0M0VcdTA0MzRcdTA0MzhcdTA0M0RfXHUwNDM0XHUwNDMyXHUwNDMwJyk7XG5cdFx0YXNzZXJ0VHJhbnNmb3JtKCdzbmFrZWNhc2UnLCAnR1JFRUsnLCAnXHUwM0FEXHUwM0JEXHUwM0IxXHUwM0MyX1x1MDNCNFx1MDNDRFx1MDNCRicpO1xuXHRcdGFzc2VydFRyYW5zZm9ybSgnY2FtZWxjYXNlJywgJ1JVU1NJQU4nLCAnXHUwNDNFXHUwNDM0XHUwNDM4XHUwNDNEXHUwNDE0XHUwNDMyXHUwNDMwJyk7XG5cdFx0YXNzZXJ0VHJhbnNmb3JtKCdjYW1lbGNhc2UnLCAnR1JFRUsnLCAnXHUwM0FEXHUwM0JEXHUwM0IxXHUwM0MyXHUwMzk0XHUwM0NEXHUwM0JGJyk7XG5cdFx0YXNzZXJ0VHJhbnNmb3JtKCdwYXNjYWxjYXNlJywgJ1JVU1NJQU4nLCAnXHUwNDFFXHUwNDM0XHUwNDM4XHUwNDNEXHUwNDE0XHUwNDMyXHUwNDMwJyk7XG5cdFx0YXNzZXJ0VHJhbnNmb3JtKCdwYXNjYWxjYXNlJywgJ0dSRUVLJywgJ1x1MDM4OFx1MDNCRFx1MDNCMVx1MDNDMlx1MDM5NFx1MDNDRFx1MDNCRicpO1xuXHRcdGFzc2VydFRyYW5zZm9ybSgndXBjYXNlJywgJ1JVU1NJQU4nLCAnXHUwNDFFXHUwNDE0XHUwNDE4XHUwNDFEXHUwNDE0XHUwNDEyXHUwNDEwJyk7XG5cdFx0YXNzZXJ0VHJhbnNmb3JtKCdkb3duY2FzZScsICdSVVNTSUFOJywgJ1x1MDQzRVx1MDQzNFx1MDQzOFx1MDQzRFx1MDQzNFx1MDQzMlx1MDQzMCcpO1xuXHRcdGFzc2VydFRyYW5zZm9ybSgna2ViYWJjYXNlJywgJ1RVUktJU0gnLCAnaXN0YW5idWwtbFx1MDEzMScpO1xuXHRcdGFzc2VydFRyYW5zZm9ybSgncGFzY2FsY2FzZScsICdUVVJLSVNIJywgJ0lzdGFuYnVsTFx1MDEzMScpO1xuXHRcdGFzc2VydFRyYW5zZm9ybSgndXBjYXNlJywgJ0pBUEFORVNFJywgJ1x1MzA1M1x1MzA5M1x1MzA2Qlx1MzA2MVx1MzA2RicpO1xuXHRcdGFzc2VydFRyYW5zZm9ybSgna2ViYWJjYXNlJywgJ0pBUEFORVNFJywgJ1x1MzA1M1x1MzA5M1x1MzA2Qlx1MzA2MVx1MzA2RicpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IHZhcmlhYmxlIHRyYW5zZm9ybWF0aW9uIGRvZXNuXFwndCB3b3JrIGlmIHJlZ2V4IGlzIGNvbXBsaWNhdGVkIGFuZCBzbmlwcGV0IGJvZHkgY29udGFpbnMgXFwnJCRcXCcgIzU1NjI3JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCdjb25zdCBmaWxlTmFtZSA9IFwiJHtUTV9GSUxFTkFNRS8oLiopXFxcXC4uKyQvJDEvfVwiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQudG9UZXh0bWF0ZVN0cmluZygpLCAnY29uc3QgZmlsZU5hbWUgPSBcIiR7VE1fRklMRU5BTUUvKC4qKVxcXFwuLiskLyR7MX0vfVwiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tCVUddIEhUTUwgYXR0cmlidXRlIHN1Z2dlc3Rpb25zOiBTbmlwcGV0IHNlc3Npb24gZG9lcyBub3QgaGF2ZSBlbmQtcG9zaXRpb24gc2V0LCAjMzMxNDcnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCB7IHBsYWNlaG9sZGVycyB9ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnc3JjPVwiJDFcIicsIHRydWUpO1xuXHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IHBsYWNlaG9sZGVycztcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGFjZWhvbGRlcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuaW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuaW5kZXgsIDApO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXQgb3B0aW9uYWwgdHJhbnNmb3JtcyBhcmUgbm90IGFwcGxpZWQgY29ycmVjdGx5IHdoZW4gcmV1c2luZyB0aGUgc2FtZSB2YXJpYWJsZSwgIzM3NzAyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgdHJhbnNmb3JtID0gbmV3IFRyYW5zZm9ybSgpO1xuXHRcdHRyYW5zZm9ybS5hcHBlbmRDaGlsZChuZXcgRm9ybWF0U3RyaW5nKDEsICd1cGNhc2UnKSk7XG5cdFx0dHJhbnNmb3JtLmFwcGVuZENoaWxkKG5ldyBGb3JtYXRTdHJpbmcoMiwgJ3VwY2FzZScpKTtcblx0XHR0cmFuc2Zvcm0ucmVnZXhwID0gL14oLil8LSguKS9nO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5yZXNvbHZlKCdteS1maWxlLW5hbWUnKSwgJ015RmlsZU5hbWUnKTtcblxuXHRcdGNvbnN0IGNsb25lID0gdHJhbnNmb3JtLmNsb25lKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLnJlc29sdmUoJ215LWZpbGUtbmFtZScpLCAnTXlGaWxlTmFtZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9ibGVtIHdpdGggc25pcHBldHMgcmVnZXggIzQwNTcwJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJyR7VE1fRElSRUNUT1JZLy4qc3JjW1xcXFwvXSguKikvJDEvfScpO1xuXHRcdGFzc2VydE1hcmtlcihzbmlwcGV0LCBWYXJpYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ZhcmlhYmxlIHRyYW5zZm9ybWF0aW9uIGRvZXNuXFwndCB3b3JrIGlmIHVuZGVmaW5lZCB2YXJpYWJsZXMgYXJlIHVzZWQgaW4gdGhlIHNhbWUgc25pcHBldCAjNTE3NjknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdHJhbnNmb3JtID0gbmV3IFRyYW5zZm9ybSgpO1xuXHRcdHRyYW5zZm9ybS5hcHBlbmRDaGlsZChuZXcgVGV4dCgnYmFyJykpO1xuXHRcdHRyYW5zZm9ybS5yZWdleHAgPSBuZXcgUmVnRXhwKCdmb28nLCAnZ2knKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNmb3JtLnRvVGV4dG1hdGVTdHJpbmcoKSwgJy9mb28vYmFyL2lnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zZm9ybSBzZXJpYWxpemF0aW9uIGpvaW5zIGNoaWxkcmVuIHdpdGhvdXQgY29tbWEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdHJhbnNmb3JtV2l0aEZvcm1hdFN0cmluZyA9IG5ldyBUcmFuc2Zvcm0oKTtcblx0XHR0cmFuc2Zvcm1XaXRoRm9ybWF0U3RyaW5nLmFwcGVuZENoaWxkKG5ldyBGb3JtYXRTdHJpbmcoMSwgJ3VwY2FzZScpKTtcblx0XHR0cmFuc2Zvcm1XaXRoRm9ybWF0U3RyaW5nLmFwcGVuZENoaWxkKG5ldyBUZXh0KCdfJykpO1xuXHRcdHRyYW5zZm9ybVdpdGhGb3JtYXRTdHJpbmcucmVnZXhwID0gbmV3IFJlZ0V4cCgnZm9vJywgJ2cnKTtcblx0XHRjb25zdCBzZXJpYWxpemVkID0gdHJhbnNmb3JtV2l0aEZvcm1hdFN0cmluZy50b1RleHRtYXRlU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQsICcvZm9vLyR7MTovdXBjYXNlfV8vZycpO1xuXG5cdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoYFxcJHtUTV9GSUxFTkFNRSR7c2VyaWFsaXplZH19YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQudG9UZXh0bWF0ZVN0cmluZygpLCBgXFwke1RNX0ZJTEVOQU1FJHtzZXJpYWxpemVkfX1gKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCBwYXJzZXIgZnJlZXplICM1MzE0NCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnJHsxLyh2b2lkJCl8KC4rKS8kezE6Py1cXHRyZXR1cm4gbmlsO30vfScpO1xuXHRcdGFzc2VydE1hcmtlcihzbmlwcGV0LCBQbGFjZWhvbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3NuaXBwZXRzIHZhcmlhYmxlIG5vdCByZXNvbHZlZCBpbiBKU09OIHByb3Bvc2FsICM1MjkzMScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRUZXh0QW5kTWFya2VyKCdGT08kezE6L2Jpbi9iYXNofScsICdGT08vYmluL2Jhc2gnLCBUZXh0LCBQbGFjZWhvbGRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ01pcnJvcmluZyBzZXF1ZW5jZSBvZiBuZXN0ZWQgcGxhY2Vob2xkZXJzIG5vdCBzZWxlY3RlZCBwcm9wZXJseSBvbiBiYWNranVtcGluZyAjNTg3MzYnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJyR7MzpuZXN0MSAkezE6bmVzdDIgJHsyOm5lc3QzfX19ICQzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQuY2hpbGRyZW4ubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQub2soc25pcHBldC5jaGlsZHJlblswXSBpbnN0YW5jZW9mIFBsYWNlaG9sZGVyKTtcblx0XHRhc3NlcnQub2soc25pcHBldC5jaGlsZHJlblsxXSBpbnN0YW5jZW9mIFRleHQpO1xuXHRcdGFzc2VydC5vayhzbmlwcGV0LmNoaWxkcmVuWzJdIGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpO1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0UGFyZW50KG1hcmtlcjogTWFya2VyKSB7XG5cdFx0XHRtYXJrZXIuY2hpbGRyZW4uZm9yRWFjaChhc3NlcnRQYXJlbnQpO1xuXHRcdFx0aWYgKCEobWFya2VyIGluc3RhbmNlb2YgUGxhY2Vob2xkZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRcdFx0bGV0IG06IE1hcmtlciA9IG1hcmtlcjtcblx0XHRcdHdoaWxlIChtICYmICFmb3VuZCkge1xuXHRcdFx0XHRpZiAobS5wYXJlbnQgPT09IHNuaXBwZXQpIHtcblx0XHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bSA9IG0ucGFyZW50O1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0Lm9rKGZvdW5kKTtcblx0XHR9XG5cdFx0Y29uc3QgWywgLCBjbG9uZV0gPSBzbmlwcGV0LmNoaWxkcmVuO1xuXHRcdGFzc2VydFBhcmVudChjbG9uZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0JhY2tzcGFjZSBjYW5cXCd0IGJlIGVzY2FwZWQgaW4gc25pcHBldCB2YXJpYWJsZSB0cmFuc2Zvcm1zICM2NTQxMicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCduYW1lc3BhY2UgJHtUTV9ESVJFQ1RPUlkvW1xcXFwvXS9cXFxcXFxcXC9nfTsnKTtcblx0XHRhc3NlcnRNYXJrZXIoc25pcHBldCwgVGV4dCwgVmFyaWFibGUsIFRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IGNhbm5vdCBlc2NhcGUgY2xvc2luZyBicmFja2V0IGluc2lkZSBjb25kaXRpb25hbCBpbnNlcnRpb24gdmFyaWFibGUgcmVwbGFjZW1lbnQgIzc4ODgzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJyR7VE1fRElSRUNUT1JZLyguKykvJHsxOitpbXBvcnQgeyBoZWxsbyBcXFxcfSBmcm9tIHdvcmxkfS99Jyk7XG5cdFx0Y29uc3QgdmFyaWFibGUgPSA8VmFyaWFibGU+c25pcHBldC5jaGlsZHJlblswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayh2YXJpYWJsZSBpbnN0YW5jZW9mIFZhcmlhYmxlKTtcblx0XHRhc3NlcnQub2sodmFyaWFibGUudHJhbnNmb3JtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFyaWFibGUudHJhbnNmb3JtLmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHZhcmlhYmxlLnRyYW5zZm9ybS5jaGlsZHJlblswXSBpbnN0YW5jZW9mIEZvcm1hdFN0cmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8Rm9ybWF0U3RyaW5nPnZhcmlhYmxlLnRyYW5zZm9ybS5jaGlsZHJlblswXSkuaWZWYWx1ZSwgJ2ltcG9ydCB7IGhlbGxvIH0gZnJvbSB3b3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoPEZvcm1hdFN0cmluZz52YXJpYWJsZS50cmFuc2Zvcm0uY2hpbGRyZW5bMF0pLmVsc2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCBlc2NhcGUgYmFja3NsYXNoZXMgaW5zaWRlIGNvbmRpdGlvbmFsIGluc2VydGlvbiB2YXJpYWJsZSByZXBsYWNlbWVudCAjODAzOTQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnJHtDVVJSRU5UX1lFQVIvKC4rKS8kezE6K1xcXFxcXFxcfS99Jyk7XG5cdFx0Y29uc3QgdmFyaWFibGUgPSA8VmFyaWFibGU+c25pcHBldC5jaGlsZHJlblswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayh2YXJpYWJsZSBpbnN0YW5jZW9mIFZhcmlhYmxlKTtcblx0XHRhc3NlcnQub2sodmFyaWFibGUudHJhbnNmb3JtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFyaWFibGUudHJhbnNmb3JtLmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHZhcmlhYmxlLnRyYW5zZm9ybS5jaGlsZHJlblswXSBpbnN0YW5jZW9mIEZvcm1hdFN0cmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8Rm9ybWF0U3RyaW5nPnZhcmlhYmxlLnRyYW5zZm9ybS5jaGlsZHJlblswXSkuaWZWYWx1ZSwgJ1xcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxGb3JtYXRTdHJpbmc+dmFyaWFibGUudHJhbnNmb3JtLmNoaWxkcmVuWzBdKS5lbHNlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXQgcGxhY2Vob2xkZXIgZW1wdHkgcmlnaHQgYWZ0ZXIgZXhwYW5zaW9uICMxNTI1NTMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnJHsxOnByb2d9OiAkezI6JDEuY2N9IC0gJDInKTtcblx0XHRjb25zdCBhY3R1YWwgPSBzbmlwcGV0LnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgJ3Byb2c6IHByb2cuY2MgLSBwcm9nLmNjJyk7XG5cblx0XHRjb25zdCBzbmlwcGV0MiA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJyR7MTpwcm9nfTogJHszOiR7MjokMS5jY30uMzN9IC0gJDIgJDMnKTtcblx0XHRjb25zdCBhY3R1YWwyID0gc25pcHBldDIudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgJ3Byb2c6IHByb2cuY2MuMzMgLSBwcm9nLmNjIHByb2cuY2MuMzMnKTtcblxuXHRcdC8vIGN5Y2xpYyByZWZlcmVuY2VzIG9mIHBsYWNlaG9sZGVyc1xuXHRcdGNvbnN0IHNuaXBwZXQzID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZSgnJHsxOiQyLm9uZX0gPD4gJHsyOiQxLnR3b30nKTtcblx0XHRjb25zdCBhY3R1YWwzID0gc25pcHBldDMudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMywgJy50d28ub25lLnR3by5vbmUgPD4gLm9uZS50d28ub25lLnR3bycpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IGNob2ljZXMgYXJlIGluY29ycmVjdGx5IGVzY2FwZWQvYXBwbGllZCAjMTgwMTMyJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydFRleHRBbmRNYXJrZXIoJyR7MXxhYWEkYWFhfH1iYmJcXFxcJGJiYicsICdhYWEkYWFhYmJiJGJiYicsIFBsYWNlaG9sZGVyLCBUZXh0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFFBQVEsY0FBc0IsYUFBYSxTQUFTLGVBQWUsTUFBTSxpQkFBaUIsV0FBVyxXQUFXLGdCQUFrQztBQUUzSixNQUFNLGlCQUFpQixNQUFNO0FBRTVCLDBDQUF3QztBQUV4QyxPQUFLLFdBQVcsTUFBTTtBQUVyQixVQUFNLFVBQVUsSUFBSSxRQUFRO0FBQzVCLFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsR0FBRztBQUVyRCxZQUFRLEtBQUssS0FBSztBQUNsQixXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFlBQVk7QUFDOUQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxHQUFHO0FBRXJELFlBQVEsS0FBSyxTQUFTO0FBQ3RCLFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsU0FBUztBQUMzRCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFNBQVM7QUFDM0QsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxZQUFZO0FBQzlELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsVUFBVTtBQUM1RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFVBQVU7QUFDNUQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxHQUFHO0FBRXJELFlBQVEsS0FBSyxRQUFRO0FBQ3JCLFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsWUFBWTtBQUM5RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLE1BQU07QUFDeEQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxHQUFHO0FBRXJELFlBQVEsS0FBSyxTQUFTO0FBQ3RCLFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsWUFBWTtBQUM5RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLE1BQU07QUFDeEQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxHQUFHO0FBQ3JELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsR0FBRztBQUVyRCxZQUFRLEtBQUssTUFBTTtBQUNuQixXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLE1BQU07QUFDeEQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxZQUFZO0FBQzlELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsR0FBRztBQUVyRCxZQUFRLEtBQUssVUFBVTtBQUN2QixXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLE1BQU07QUFDeEQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxZQUFZO0FBQzlELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsR0FBRztBQUVyRCxZQUFRLEtBQUssVUFBVTtBQUN2QixXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLE1BQU07QUFDeEQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxZQUFZO0FBQzlELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsSUFBSTtBQUN0RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFlBQVk7QUFDOUQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxHQUFHO0FBRXJELFlBQVEsS0FBSyxRQUFRO0FBQ3JCLFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsTUFBTTtBQUN4RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFNBQVM7QUFDM0QsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxZQUFZO0FBQzlELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsVUFBVTtBQUM1RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLEdBQUc7QUFFckQsWUFBUSxLQUFLLGFBQWE7QUFDMUIsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxNQUFNO0FBQ3hELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsU0FBUztBQUMzRCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLEdBQUc7QUFDckQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxLQUFLO0FBQ3ZELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsWUFBWTtBQUM5RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFVBQVU7QUFDNUQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxHQUFHO0FBRXJELFlBQVEsS0FBSyxPQUFPO0FBQ3BCLFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsU0FBUztBQUMzRCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLE1BQU07QUFDeEQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxTQUFTO0FBQzNELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsVUFBVTtBQUU1RCxZQUFRLEtBQUssNEJBQTRCO0FBQ3pDLFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsTUFBTTtBQUN4RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFNBQVM7QUFDM0QsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxZQUFZO0FBQzlELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsWUFBWTtBQUM5RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFlBQVk7QUFDOUQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxZQUFZO0FBQzlELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsWUFBWTtBQUM5RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLFlBQVk7QUFDOUQsV0FBTyxZQUFZLFFBQVEsS0FBSyxFQUFFLE1BQU0sVUFBVSxZQUFZO0FBQzlELFdBQU8sWUFBWSxRQUFRLEtBQUssRUFBRSxNQUFNLFVBQVUsVUFBVTtBQUM1RCxXQUFPLFlBQVksUUFBUSxLQUFLLEVBQUUsTUFBTSxVQUFVLEdBQUc7QUFBQSxFQUN0RCxDQUFDO0FBRUQsV0FBUyxXQUFXLE9BQWUsVUFBa0I7QUFDcEQsVUFBTSxTQUFTLGNBQWMsYUFBYSxLQUFLO0FBQy9DLFdBQU8sWUFBWSxRQUFRLFFBQVE7QUFBQSxFQUNwQztBQUVBLFdBQVMsYUFBYSxVQUErQyxPQUFtQjtBQUN2RixRQUFJO0FBQ0osUUFBSSxpQkFBaUIsaUJBQWlCO0FBQ3JDLGVBQVMsQ0FBQyxHQUFHLE1BQU0sUUFBUTtBQUFBLElBQzVCLFdBQVcsT0FBTyxVQUFVLFVBQVU7QUFDckMsWUFBTSxJQUFJLElBQUksY0FBYztBQUM1QixlQUFTLEVBQUUsTUFBTSxLQUFLLEVBQUU7QUFBQSxJQUN6QixPQUFPO0FBQ04sZUFBUyxDQUFDLEdBQUcsS0FBSztBQUFBLElBQ25CO0FBQ0EsV0FBTyxPQUFPLFNBQVMsR0FBRztBQUN6QixZQUFNLElBQUksT0FBTyxJQUFJO0FBQ3JCLFlBQU0sT0FBTyxNQUFNLElBQUk7QUFDdkIsYUFBTyxHQUFHLGFBQWEsSUFBSTtBQUFBLElBQzVCO0FBQ0EsV0FBTyxZQUFZLE9BQU8sUUFBUSxNQUFNLE1BQU07QUFDOUMsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQUEsRUFDcEM7QUFFQSxXQUFTLG9CQUFvQixPQUFlLFlBQW9CLE9BQW1CO0FBQ2xGLGVBQVcsT0FBTyxPQUFPO0FBQ3pCLGlCQUFhLE9BQU8sR0FBRyxLQUFLO0FBQUEsRUFDN0I7QUFFQSxXQUFTLGNBQWMsT0FBZSxVQUFrQjtBQUN2RCxVQUFNLFNBQVMsY0FBYyxPQUFPLEtBQUs7QUFDekMsV0FBTyxZQUFZLFFBQVEsUUFBUTtBQUFBLEVBQ3BDO0FBRUEsT0FBSyxtQkFBbUIsV0FBWTtBQUNuQyxrQkFBYyxTQUFTLFNBQVM7QUFDaEMsa0JBQWMsV0FBVyxhQUFhO0FBQ3RDLGtCQUFjLFdBQVcsYUFBYTtBQUN0QyxrQkFBYyxjQUFjLGtCQUFrQjtBQUM5QyxrQkFBYyxLQUFLLEtBQUs7QUFBQSxFQUN6QixDQUFDO0FBRUQsT0FBSyxnQkFBZ0IsTUFBTTtBQUMxQixlQUFXLEtBQUssR0FBRztBQUNuQixlQUFXLFNBQVMsS0FBSztBQUN6QixlQUFXLEtBQUssR0FBRztBQUNuQixlQUFXLE9BQU8sR0FBRztBQUNyQixlQUFXLFNBQVMsT0FBTztBQUMzQixlQUFXLGtCQUFrQixTQUFTO0FBQ3RDLGVBQVcsT0FBTyxLQUFLO0FBQ3ZCLGVBQVcsa0JBQWtCLFlBQVk7QUFDekMsZUFBVyxNQUFNLElBQUk7QUFDckIsZUFBVyxRQUFRLE1BQU07QUFDekIsZUFBVyxNQUFNLElBQUk7QUFDckIsZUFBVyxRQUFRLE1BQU07QUFDekIsZUFBVyxNQUFNLElBQUk7QUFDckIsZUFBVyxRQUFRLE1BQU07QUFFekIsZUFBVyxVQUFVLFFBQVE7QUFDN0IsZUFBVyxjQUFjLFlBQVk7QUFDckMsZUFBVyxpQkFBaUIsZUFBZTtBQUMzQyxlQUFXLG1CQUFtQixpQkFBaUI7QUFDL0MsZUFBVyxxQkFBcUIsbUJBQW1CO0FBQ25ELGVBQVcsK0JBQStCLDZCQUE2QjtBQUN2RSxlQUFXLGtDQUFrQyxnQ0FBZ0M7QUFDN0UsZUFBVyxtQ0FBbUMsaUNBQWlDO0FBQUEsRUFDaEYsQ0FBQztBQUdELE9BQUssbUJBQW1CLE1BQU07QUFDN0Isd0JBQW9CLGdCQUFnQixXQUFXLE1BQU0sYUFBYSxJQUFJO0FBQ3RFLHdCQUFvQix3QkFBd0IsY0FBYyxNQUFNLGFBQWEsYUFBYSxJQUFJO0FBRTlGLHdCQUFvQiwwQkFBMEIsY0FBYyxNQUFNLFdBQVc7QUFFN0UsVUFBTSxDQUFDLEVBQUUsV0FBVyxJQUFJLElBQUksY0FBYyxFQUFFLE1BQU0sd0JBQXdCLEVBQUU7QUFDNUUsVUFBTSxFQUFFLFNBQVMsSUFBa0I7QUFFbkMsV0FBTyxZQUEwQixZQUFhLE9BQU8sQ0FBQztBQUN0RCxXQUFPLEdBQUcsU0FBUyxDQUFDLGFBQWEsSUFBSTtBQUNyQyxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsU0FBUyxHQUFHLE1BQU07QUFDakQsV0FBTyxHQUFHLFNBQVMsQ0FBQyxhQUFhLFdBQVc7QUFDNUMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLFNBQVMsR0FBRyxLQUFLO0FBQUEsRUFDakQsQ0FBQztBQUVELE9BQUssdUJBQXVCLE1BQU07QUFDakMsd0JBQW9CLFVBQVUsVUFBVSxJQUFJO0FBQzVDLHdCQUFvQixjQUFjLGNBQWMsSUFBSTtBQUNwRCx3QkFBb0IsaUJBQWlCLGlCQUFpQixJQUFJO0FBQzFELHdCQUFvQixtQkFBbUIsbUJBQW1CLElBQUk7QUFBQSxFQUMvRCxDQUFDO0FBRUQsT0FBSyx3QkFBd0IsTUFBTTtBQUNsQyx3QkFBb0IsZUFBZSxlQUFlLElBQUk7QUFDdEQsd0JBQW9CLG1CQUFtQixtQkFBbUIsSUFBSTtBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLHdCQUFvQixZQUFZLFFBQVEsVUFBVSxJQUFJO0FBQ3RELHdCQUFvQixjQUFjLFlBQVksSUFBSTtBQUNsRCx3QkFBb0IsY0FBYyxPQUFPLE1BQU0sUUFBUTtBQUN2RCx3QkFBb0IsZ0JBQWdCLE9BQU8sTUFBTSxRQUFRO0FBQ3pELHdCQUFvQixRQUFRLElBQUksV0FBVztBQUMzQyx3QkFBb0IsV0FBVyxJQUFJLFFBQVE7QUFDM0Msd0JBQW9CLGFBQWEsSUFBSSxRQUFRO0FBQzdDLHdCQUFvQixrQkFBa0IsWUFBWSxNQUFNLFVBQVUsSUFBSTtBQUN0RSx3QkFBb0IsaUNBQWlDLFlBQVksTUFBTSxVQUFVLE1BQU0sV0FBVztBQUFBLEVBQ25HLENBQUM7QUFFRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELHdCQUFvQixpQkFBaUIsU0FBUyxRQUFRO0FBQ3RELHdCQUFvQixjQUFjLFNBQVMsV0FBVztBQUN0RCx3QkFBb0IsdUJBQXVCLGFBQWEsV0FBVztBQUVuRSx3QkFBb0IsZ0JBQWdCLGdCQUFnQixJQUFJO0FBQ3hELHdCQUFvQixzQkFBc0IsaUJBQWlCLE1BQU0sV0FBVztBQUFBLEVBQzdFLENBQUM7QUFFRCxPQUFLLCtCQUErQixXQUFZO0FBQy9DLHdCQUFvQixhQUFhLElBQUksUUFBUTtBQUM3Qyx3QkFBb0IsMkJBQTJCLElBQUksUUFBUTtBQUMzRCx3QkFBb0IsK0JBQStCLElBQUksUUFBUTtBQUcvRCx3QkFBb0Isa0NBQWtDLGtDQUFrQyxJQUFJO0FBQzVGLHdCQUFvQixvQ0FBb0Msb0NBQW9DLElBQUk7QUFDaEcsd0JBQW9CLDhCQUE4Qiw4QkFBOEIsSUFBSTtBQUdwRix3QkFBb0Isd0JBQXdCLElBQUksUUFBUTtBQUN4RCxpQkFBYSwrQkFBZ0MsSUFBSTtBQUdqRCx3QkFBb0IsWUFBWSxZQUFZLElBQUk7QUFDaEQsd0JBQW9CLDhCQUE4Qiw4QkFBOEIsSUFBSTtBQUdwRixpQkFBYSx5QkFBeUIsUUFBUTtBQUM5QyxpQkFBYSxvQkFBb0IsUUFBUTtBQUN6QyxpQkFBYSxrQkFBa0IsUUFBUTtBQUN2QyxpQkFBYSxnQ0FBZ0MsUUFBUTtBQUNyRCxpQkFBYSxnQ0FBZ0MsUUFBUTtBQUNyRCxpQkFBYSxpQ0FBaUMsUUFBUTtBQUN0RCxpQkFBYSwrQkFBK0IsUUFBUTtBQUNwRCxpQkFBYSxvQ0FBb0MsUUFBUTtBQUN6RCxpQkFBYSxtQ0FBbUMsUUFBUTtBQUFBLEVBRXpELENBQUM7QUFFRCxPQUFLLGtDQUFrQyxXQUFZO0FBQ2xELHdCQUFvQixXQUFXLElBQUksV0FBVztBQUM5Qyx3QkFBb0IseUJBQXlCLElBQUksV0FBVztBQUM1RCx3QkFBb0IsNkJBQTZCLElBQUksV0FBVztBQUdoRSx3QkFBb0Isc0JBQXNCLElBQUksV0FBVztBQUN6RCxpQkFBYSw2QkFBOEIsSUFBSTtBQUcvQyx3QkFBb0IsVUFBVSxVQUFVLElBQUk7QUFDNUMsd0JBQW9CLDRCQUE0Qiw0QkFBNEIsSUFBSTtBQUFBLEVBQ2pGLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxXQUFZO0FBQzFFLGlCQUFhLDhCQUE4QixRQUFRO0FBQUEsRUFDcEQsQ0FBQztBQUVELE9BQUssbUVBQW1FLFdBQVk7QUFDbkYsaUJBQWEsaUNBQWlDLFFBQVE7QUFDdEQsaUJBQWEsc0NBQXNDLFFBQVE7QUFDM0QsaUJBQWEsa0NBQWtDLFFBQVE7QUFBQSxFQUN4RCxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUU3Qyx3QkFBb0IsdUJBQXVCLE9BQU8sV0FBVztBQUM3RCx3QkFBb0IsYUFBYSxPQUFPLFdBQVc7QUFDbkQsd0JBQW9CLG1CQUFtQixRQUFRLFdBQVc7QUFDMUQsd0JBQW9CLHFCQUFxQixhQUFhLFdBQVc7QUFDakUsd0JBQW9CLHFCQUFxQixhQUFhLFdBQVc7QUFDakUsd0JBQW9CLHFCQUFxQixlQUFlLFdBQVc7QUFDbkUsd0JBQW9CLHdCQUF3Qix3QkFBd0IsSUFBSTtBQUN4RSx3QkFBb0IsWUFBWSxZQUFZLElBQUk7QUFFaEQsVUFBTSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0scUJBQXFCO0FBQy9ELFVBQU0sV0FBdUM7QUFBQSxNQUM1QyxPQUFLLGFBQWE7QUFBQSxNQUNsQixPQUFLLGFBQWEsVUFBVSxFQUFFLFFBQVEsV0FBVyxLQUFLLEVBQUUsUUFBUSxNQUFNLE9BQUssYUFBYSxJQUFJO0FBQUEsSUFDN0Y7QUFDQSxZQUFRLEtBQUssWUFBVTtBQUN0QixhQUFPLEdBQUcsU0FBUyxNQUFNLEVBQUcsTUFBTSxDQUFDO0FBQ25DLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDREQUE0RCxXQUFZO0FBQzVFLHdCQUFvQixtREFBbUQsMEJBQTBCLE1BQU0sYUFBYSxJQUFJO0FBQUEsRUFDekgsQ0FBQztBQUVELE9BQUssOEJBQThCLFdBQVk7QUFFOUMsYUFBUyx3QkFBd0IsT0FBZSxVQUF3QjtBQUN2RSxZQUFNLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSxLQUFLO0FBQy9DLFlBQU0sU0FBUyxRQUFRLGlCQUFpQjtBQUN4QyxhQUFPLFlBQVksUUFBUSxRQUFRO0FBQUEsSUFDcEM7QUFFQSw0QkFBd0IsTUFBTSxJQUFJO0FBQ2xDLDRCQUF3QixRQUFRLE1BQU07QUFDdEMsNEJBQXdCLG1EQUFtRCxpREFBaUQ7QUFDNUgsNEJBQXdCLHVEQUF1RCxxREFBcUQ7QUFDcEksNEJBQXdCLDJEQUEyRCx5REFBeUQ7QUFDNUksNEJBQXdCLGdCQUFnQixjQUFjO0FBQ3RELDRCQUF3QixzQ0FBc0Msc0NBQXNDO0FBQ3BHLDRCQUF3Qix1Q0FBdUMseUNBQXlDO0FBQUEsRUFDekcsQ0FBQztBQUVELE9BQUssMkNBQTJDLFdBQVk7QUFFM0QsYUFBUyxZQUFZLE9BQXFCO0FBRXpDLFlBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLEtBQUs7QUFDL0MsWUFBTSxTQUFTLFFBQVEsaUJBQWlCO0FBQ3hDLFlBQU0sV0FBVyxJQUFJLGNBQWMsRUFBRSxNQUFNLE1BQU07QUFFakQsZUFBUyxtQkFBbUIsU0FBaUIsU0FBaUI7QUFDN0QsZUFBTyxHQUFHLG1CQUFtQixPQUFPLGVBQWUsT0FBTyxFQUFFLFdBQVc7QUFDdkUsZUFBTyxHQUFHLG1CQUFtQixPQUFPLGVBQWUsT0FBTyxFQUFFLFdBQVc7QUFFdkUsZUFBTyxZQUFZLFFBQVEsU0FBUyxRQUFRLFFBQVEsU0FBUyxNQUFNO0FBQ25FLGVBQU8sWUFBWSxRQUFRLFNBQVMsR0FBRyxRQUFRLFNBQVMsQ0FBQztBQUV6RCxpQkFBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLFNBQVMsUUFBUSxLQUFLO0FBQ2pELDZCQUFtQixRQUFRLFNBQVMsQ0FBQyxHQUFHLFFBQVEsU0FBUyxDQUFDLENBQUM7QUFBQSxRQUM1RDtBQUFBLE1BQ0Q7QUFFQSx5QkFBbUIsU0FBUyxRQUFRO0FBQUEsSUFDckM7QUFFQSxnQkFBWSxJQUFJO0FBQ2hCLGdCQUFZLE1BQU07QUFDbEIsZ0JBQVksaURBQWlEO0FBQzdELGdCQUFZLHFEQUFxRDtBQUNqRSxnQkFBWSxjQUFjO0FBQzFCLGdCQUFZLG9DQUFvQztBQUNoRCxnQkFBWSxxQ0FBcUM7QUFDakQsZ0JBQVkscURBQXFEO0FBQUEsRUFDbEUsQ0FBQztBQUVELE9BQUsseUJBQXlCLE1BQU07QUFDbkMsVUFBTSxFQUFFLGFBQWEsSUFBSSxJQUFJLGNBQWMsRUFBRSxNQUFNLHFCQUFxQjtBQUV4RSxXQUFPLFlBQVksYUFBYSxRQUFRLENBQUM7QUFDekMsV0FBTyxHQUFHLGFBQWEsQ0FBQyxFQUFFLGtCQUFrQixNQUFNO0FBQ2xELFdBQU8sR0FBRyxhQUFhLENBQUMsRUFBRSxTQUFTLENBQUMsYUFBYSxNQUFNO0FBQ3ZELFdBQU8sWUFBcUIsYUFBYSxDQUFDLEVBQUUsU0FBUyxDQUFDLEVBQUcsUUFBUSxRQUFRLENBQUM7QUFFMUUsZUFBVyx1QkFBdUIsS0FBSztBQUN2QyxlQUFXLHlCQUF5QixxQkFBcUI7QUFDekQsZUFBVyx5QkFBeUIsdUJBQXVCO0FBQzNELGVBQVcsVUFBVSxRQUFRO0FBQUEsRUFDOUIsQ0FBQztBQUVELE9BQUssb0VBQXFFLFdBQVk7QUFFckYsVUFBTSxFQUFFLGFBQWEsSUFBSSxJQUFJLGNBQWMsRUFBRSxNQUFNLHdCQUF3QjtBQUMzRSxXQUFPLFlBQVksYUFBYSxRQUFRLENBQUM7QUFDekMsV0FBTyxHQUFHLGFBQWEsQ0FBQyxFQUFFLGtCQUFrQixNQUFNO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUsseUJBQXlCLE1BQU07QUFDbkMsVUFBTSxJQUFJLElBQUksY0FBYztBQUM1QixpQkFBYSxFQUFFLE1BQU0sWUFBWSxHQUFHLElBQUk7QUFDeEMsaUJBQWEsRUFBRSxNQUFNLGVBQWUsR0FBRyxJQUFJO0FBQzNDLGlCQUFhLEVBQUUsTUFBTSxpQkFBaUIsR0FBRyxJQUFJO0FBRTdDLGlCQUFhLEVBQUUsTUFBTSxVQUFVLEdBQUcsTUFBTSxhQUFhLElBQUk7QUFDekQsaUJBQWEsRUFBRSxNQUFNLGNBQWMsR0FBRyxNQUFNLGFBQWEsSUFBSTtBQUM3RCxpQkFBYSxFQUFFLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSTtBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLHNCQUFzQixNQUFNO0FBQ2hDLFFBQUksU0FBUyxJQUFJLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxFQUFFO0FBRWpGLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUcsZUFBZTtBQUN4RCxXQUFPLEdBQUcsT0FBTyxDQUFDLGFBQWEsV0FBVztBQUMxQyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsU0FBUyxHQUFHLEdBQUc7QUFFNUMsVUFBTSxjQUEyQixPQUFPLENBQUM7QUFDekMsV0FBTyxZQUFZLFlBQVksT0FBTyxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQ2pELFdBQU8sR0FBRyxZQUFZLFNBQVMsQ0FBQyxhQUFhLElBQUk7QUFDakQsV0FBTyxHQUFHLFlBQVksU0FBUyxDQUFDLGFBQWEsUUFBUTtBQUNyRCxXQUFPLEdBQUcsWUFBWSxTQUFTLENBQUMsYUFBYSxJQUFJO0FBQ2pELFdBQU8sWUFBWSxZQUFZLFNBQVMsQ0FBQyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQzFELFdBQU8sWUFBWSxZQUFZLFNBQVMsQ0FBQyxFQUFFLFNBQVMsR0FBRyxFQUFFO0FBQ3pELFdBQU8sWUFBWSxZQUFZLFNBQVMsQ0FBQyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBRTFELFVBQU0saUJBQTJCLFlBQVksU0FBUyxDQUFDO0FBQ3ZELFdBQU8sWUFBWSxlQUFlLE1BQU0sa0JBQWtCO0FBQzFELFdBQU8sWUFBWSxlQUFlLFNBQVMsUUFBUSxDQUFDO0FBRXBELGFBQVMsSUFBSSxjQUFjLEVBQUUsTUFBTSxtQkFBbUIsRUFBRTtBQUN4RCxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsV0FBTyxHQUFHLE9BQU8sQ0FBQyxhQUFhLFFBQVE7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSyw2QkFBNkIsTUFBTTtBQUN2QyxVQUFNLEVBQUUsU0FBUyxJQUFJLElBQUksY0FBYyxFQUFFLE1BQU0seURBQXlEO0FBR3hHLFdBQU8sR0FBRyxTQUFTLENBQUMsYUFBYSxXQUFXO0FBQzVDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxTQUFTLFFBQVEsQ0FBQztBQUNqRCxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsU0FBUyxDQUFDLEVBQUUsU0FBUyxHQUFHLE1BQU07QUFDN0QsV0FBTyxZQUEwQixTQUFTLENBQUMsRUFBRyxXQUFXLE1BQVM7QUFHbEUsV0FBTyxHQUFHLFNBQVMsQ0FBQyxhQUFhLElBQUk7QUFDckMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLFNBQVMsR0FBRyxLQUFLO0FBR2hELFdBQU8sR0FBRyxTQUFTLENBQUMsYUFBYSxXQUFXO0FBQzVDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxTQUFTLFFBQVEsQ0FBQztBQUNqRCxXQUFPLFlBQVksU0FBUyxDQUFDLEVBQUUsU0FBUyxDQUFDLEVBQUUsU0FBUyxHQUFHLE1BQU07QUFHN0QsV0FBTyxHQUFHLFNBQVMsQ0FBQyxhQUFhLFdBQVc7QUFDNUMsV0FBTyxZQUFZLFNBQVMsQ0FBQyxFQUFFLFNBQVMsUUFBUSxDQUFDO0FBQ2pELFdBQU8sZUFBNkIsU0FBUyxDQUFDLEVBQUcsV0FBVyxNQUFTO0FBQ3JFLFVBQU0sWUFBMEIsU0FBUyxDQUFDLEVBQUc7QUFDN0MsV0FBTyxnQkFBZ0IsVUFBVSxRQUFRLFVBQVU7QUFDbkQsV0FBTyxZQUFZLFVBQVUsU0FBUyxRQUFRLENBQUM7QUFDL0MsV0FBTyxHQUFHLFVBQVUsU0FBUyxDQUFDLGFBQWEsWUFBWTtBQUN2RCxXQUFPLFlBQTJCLFVBQVUsU0FBUyxDQUFDLEVBQUcsT0FBTyxDQUFDO0FBQ2pFLFdBQU8sWUFBMkIsVUFBVSxTQUFTLENBQUMsRUFBRyxTQUFTLEtBQUs7QUFDdkUsV0FBTyxHQUFHLFVBQVUsU0FBUyxDQUFDLGFBQWEsWUFBWTtBQUN2RCxXQUFPLFlBQTJCLFVBQVUsU0FBUyxDQUFDLEVBQUcsT0FBTyxDQUFDO0FBQ2pFLFdBQU8sR0FBRyxTQUFTLENBQUMsYUFBYSxJQUFJO0FBQ3JDLFdBQU8sWUFBWSxTQUFTLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSztBQUFBLEVBRWpELENBQUM7QUFHRCxPQUFLLHNDQUFzQyxNQUFNO0FBRWhELGlCQUFhLHVDQUF1QyxNQUFNLGFBQWEsTUFBTSxXQUFXO0FBRXhGLFVBQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLElBQUksSUFBSSxjQUFjLEVBQUUsTUFBTSxvQ0FBb0MsRUFBRTtBQUVyRixXQUFPLFlBQTBCLEdBQUksT0FBTyxDQUFDO0FBQzdDLFdBQU8sWUFBMEIsR0FBSSxTQUFTLFFBQVEsQ0FBQztBQUN2RCxXQUFPLFlBQWlDLEdBQUksU0FBUyxDQUFDLEVBQUcsU0FBUyxHQUFHLEtBQUs7QUFFMUUsV0FBTyxZQUEwQixHQUFJLE9BQU8sQ0FBQztBQUM3QyxXQUFPLFlBQTBCLEdBQUksU0FBUyxRQUFRLENBQUM7QUFDdkQsV0FBTyxZQUFpQyxHQUFJLFNBQVMsQ0FBQyxFQUFHLFNBQVMsR0FBRyxLQUFLO0FBQUEsRUFDM0UsQ0FBQztBQUdELE9BQUssd0RBQXdELE1BQU07QUFFbEUsaUJBQWEsaURBQWlELE1BQU0sYUFBYSxNQUFNLFdBQVc7QUFFbEcsVUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxJQUFJLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxFQUFFO0FBRS9GLFdBQU8sWUFBMEIsR0FBSSxPQUFPLENBQUM7QUFDN0MsV0FBTyxZQUEwQixHQUFJLFNBQVMsUUFBUSxDQUFDO0FBQ3ZELFdBQU8sWUFBaUMsR0FBSSxTQUFTLENBQUMsRUFBRyxTQUFTLEdBQUcsS0FBSztBQUMxRSxXQUFPLFlBQTBCLEdBQUksV0FBVyxNQUFTO0FBRXpELFdBQU8sWUFBMEIsR0FBSSxPQUFPLENBQUM7QUFDN0MsV0FBTyxZQUEwQixHQUFJLFNBQVMsUUFBUSxDQUFDO0FBQ3ZELFdBQU8sWUFBaUMsR0FBSSxTQUFTLENBQUMsRUFBRyxTQUFTLEdBQUcsS0FBSztBQUMxRSxXQUFPLGVBQTZCLEdBQUksV0FBVyxNQUFTO0FBQUEsRUFDN0QsQ0FBQztBQUVELE9BQUssOERBQThELFdBQVk7QUFDOUUsZUFBVyxtQkFBbUIsYUFBYTtBQUMzQyxlQUFXLHFCQUFxQixhQUFhO0FBQzdDLGVBQVcseUJBQXlCLGFBQWE7QUFDakQsZUFBVyxxQkFBcUIsYUFBYTtBQUFBLEVBQzlDLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFVBQU0sU0FBUyxjQUFjLGFBQWEsbUJBQW1CO0FBQzdELFdBQU8sWUFBWSxRQUFRLFdBQVc7QUFBQSxFQUN2QyxDQUFDO0FBRUQsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxRQUFJLFNBQVMsY0FBYyxhQUFhLDZCQUE2QjtBQUNyRSxXQUFPLFlBQVksUUFBUSxTQUFTO0FBRXBDLGFBQVMsY0FBYyxhQUFhLGNBQWM7QUFDbEQsV0FBTyxZQUFZLFFBQVEsU0FBUztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBQ3BDLHdCQUFvQixTQUFTLElBQUksV0FBVztBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLGNBQWMsTUFBTTtBQUV4QixhQUFTLFVBQVUsYUFBcUIsU0FBeUI7QUFDaEUsWUFBTSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sVUFBVSxJQUFJO0FBQ3hELGNBQVEsS0FBSyxPQUFLO0FBQ2pCLGNBQU0sV0FBVyxRQUFRLE1BQU07QUFDL0IsZUFBTyxZQUFZLEVBQUUsSUFBSSxHQUFHLFFBQVE7QUFDcEMsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUNELGFBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUFBLElBQ3JDO0FBRUEsY0FBVSxVQUFVLEdBQUcsQ0FBQztBQUN4QixjQUFVLFlBQVksR0FBRyxHQUFHLENBQUM7QUFDN0IsY0FBVSxZQUFZLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDaEMsY0FBVSx1Q0FBdUMsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDO0FBQ2hFLGNBQVUseUNBQXlDLElBQUksR0FBRyxHQUFHLElBQUksR0FBRyxHQUFHLENBQUM7QUFDeEUsY0FBVSx1QkFBdUIsR0FBRyxDQUFDO0FBQ3JDLGNBQVUsNkJBQTZCLEdBQUcsR0FBRyxDQUFDO0FBQUEsRUFDL0MsQ0FBQztBQUVELE9BQUssdUJBQXVCLFdBQVk7QUFDdkMsUUFBSSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sOEJBQThCLElBQUk7QUFFMUUsV0FBTyxZQUFZLFFBQVEsYUFBYSxRQUFRLENBQUM7QUFDakQsUUFBSSxDQUFDLE9BQU8sTUFBTSxJQUFJLFFBQVE7QUFDOUIsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxPQUFPLE9BQU8sQ0FBQztBQUNsQyxXQUFPLEdBQUcsT0FBTyxXQUFXLEtBQUs7QUFDakMsV0FBTyxHQUFHLE1BQU0sV0FBVyxPQUFPO0FBRWxDLGNBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSw4QkFBOEIsSUFBSTtBQUN0RSxXQUFPLFlBQVksUUFBUSxhQUFhLFFBQVEsQ0FBQztBQUNqRCxLQUFDLEtBQUssSUFBSSxRQUFRO0FBQ2xCLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUVqQyxXQUFPLEdBQUcsUUFBUSxTQUFTLENBQUMsYUFBYSxRQUFRO0FBQ2pELFdBQU8sR0FBRyxNQUFNLFdBQVcsUUFBUSxTQUFTLENBQUMsQ0FBQztBQUFBLEVBQy9DLENBQUM7QUFFRCxPQUFLLHlDQUF5QyxNQUFNO0FBQ25ELFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLDhCQUE4QixJQUFJO0FBQzVFLFVBQU0sQ0FBQyxPQUFPLE1BQU0sSUFBSSxRQUFRO0FBRWhDLFdBQU8sZ0JBQWdCLFFBQVEsc0JBQXNCLEtBQUssR0FBRyxDQUFDLENBQUM7QUFDL0QsV0FBTyxnQkFBZ0IsUUFBUSxzQkFBc0IsTUFBTSxHQUFHLENBQUMsS0FBSyxDQUFDO0FBQUEsRUFDdEUsQ0FBQztBQUVELE9BQUssMEJBQTBCLE1BQU07QUFDcEMsUUFBSSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sVUFBVSxJQUFJO0FBQ3RELFdBQU8sWUFBWSxRQUFRLE9BQU8sUUFBUSxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDekQsV0FBTyxZQUFZLFFBQVEsT0FBTyxRQUFRLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUN6RCxXQUFPLFlBQVksUUFBUSxPQUFPLFFBQVEsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBRXpELGNBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSwyQkFBMkIsSUFBSTtBQUNuRSxXQUFPLFlBQVksUUFBUSxPQUFPLFFBQVEsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBQ3pELFdBQU8sWUFBWSxRQUFRLE9BQWtCLFFBQVEsU0FBUyxDQUFDLEVBQUcsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDO0FBR2pGLFdBQU8sWUFBWSxRQUFRLE9BQU8sSUFBSSxLQUFLLEtBQUssQ0FBQyxHQUFHLEVBQUU7QUFBQSxFQUN2RCxDQUFDO0FBRUQsT0FBSywrQkFBK0IsTUFBTTtBQUN6QyxRQUFJLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSxZQUFZLElBQUk7QUFDeEQsUUFBSSxlQUFlLFFBQVE7QUFDM0IsV0FBTyxZQUFZLGFBQWEsUUFBUSxDQUFDO0FBRXpDLGNBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSxjQUFjLElBQUk7QUFDdEQsbUJBQWUsUUFBUTtBQUN2QixXQUFPLFlBQVksYUFBYSxRQUFRLENBQUM7QUFHekMsY0FBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLGNBQWMsSUFBSTtBQUN0RCxtQkFBZSxRQUFRO0FBQ3ZCLFdBQU8sWUFBWSxhQUFhLFFBQVEsQ0FBQztBQUV6QyxjQUFVLElBQUksY0FBYyxFQUFFLE1BQU0seUJBQXlCLElBQUk7QUFDakUsbUJBQWUsUUFBUTtBQUN2QixXQUFPLFlBQVksYUFBYSxRQUFRLENBQUM7QUFBQSxFQUMxQyxDQUFDO0FBRUQsT0FBSywrQkFBK0IsV0FBWTtBQUMvQyxVQUFNLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsSUFBSTtBQUV2RSxXQUFPLFlBQVksUUFBUSxhQUFhLFFBQVEsQ0FBQztBQUNqRCxVQUFNLENBQUMsRUFBRSxNQUFNLElBQUksUUFBUTtBQUMzQixXQUFPLFlBQVksT0FBTyxPQUFPLENBQUM7QUFFbEMsVUFBTSxZQUFZLFFBQVEsc0JBQXNCLE1BQU07QUFDdEQsV0FBTyxZQUFZLFVBQVUsUUFBUSxDQUFDO0FBQ3RDLFdBQU8sWUFBWSxVQUFVLENBQUMsRUFBRSxPQUFPLENBQUM7QUFFeEMsVUFBTSxTQUFTLElBQUksY0FBYyxFQUFFLE1BQU0sY0FBYyxJQUFJO0FBQzNELFlBQVEsUUFBUSxRQUFRLE9BQU8sUUFBUTtBQUV2QyxXQUFPLFlBQVksUUFBUSxTQUFTLEdBQUcsY0FBYztBQUNyRCxXQUFPLFlBQVksUUFBUSxhQUFhLFFBQVEsQ0FBQztBQUNqRCxXQUFPLFlBQVksUUFBUSxhQUFhLENBQUMsRUFBRSxPQUFPLENBQUM7QUFDbkQsV0FBTyxZQUFZLFFBQVEsYUFBYSxDQUFDLEVBQUUsT0FBTyxDQUFDO0FBQ25ELFdBQU8sWUFBWSxRQUFRLGFBQWEsQ0FBQyxFQUFFLE9BQU8sQ0FBQztBQUNuRCxXQUFPLFlBQVksUUFBUSxhQUFhLENBQUMsRUFBRSxPQUFPLENBQUM7QUFFbkQsVUFBTSxlQUFlLFFBQVEsc0JBQXNCLFFBQVEsYUFBYSxDQUFDLENBQUM7QUFDMUUsV0FBTyxHQUFHLGFBQWEsQ0FBQyxNQUFNLFFBQVEsYUFBYSxDQUFDLENBQUM7QUFDckQsV0FBTyxZQUFZLGFBQWEsUUFBUSxDQUFDO0FBQ3pDLFdBQU8sWUFBWSxhQUFhLENBQUMsRUFBRSxPQUFPLENBQUM7QUFBQSxFQUM1QyxDQUFDO0FBRUQsT0FBSywrQkFBK0IsV0FBWTtBQUMvQyxVQUFNLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsSUFBSTtBQUV2RSxXQUFPLFlBQVksUUFBUSxhQUFhLFFBQVEsQ0FBQztBQUNqRCxVQUFNLENBQUMsRUFBRSxNQUFNLElBQUksUUFBUTtBQUMzQixXQUFPLFlBQVksT0FBTyxPQUFPLENBQUM7QUFFbEMsVUFBTSxTQUFTLElBQUksY0FBYyxFQUFFLE1BQU0sWUFBWSxJQUFJO0FBQ3pELFlBQVEsUUFBUSxRQUFRLE9BQU8sUUFBUTtBQUV2QyxXQUFPLFlBQVksUUFBUSxTQUFTLEdBQUcsY0FBYztBQUNyRCxXQUFPLFlBQVksUUFBUSxhQUFhLFFBQVEsQ0FBQztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLDBDQUEwQyxXQUFZO0FBRTFELFVBQU0sTUFBTSxJQUFJLFlBQVksRUFBRTtBQUM5QixVQUFNLEtBQUssSUFBSSxZQUFZLENBQUM7QUFFNUIsV0FBTyxZQUFZLFlBQVksZUFBZSxLQUFLLEVBQUUsR0FBRyxDQUFDO0FBQUEsRUFDMUQsQ0FBQztBQUVELE9BQUssNENBQTRDLFdBQVk7QUFDNUQsUUFBSSxjQUFjLEVBQUUsTUFBTSxrQkFBa0I7QUFBQSxFQUM3QyxDQUFDO0FBRUQsT0FBSyx5Q0FBeUMsV0FBWTtBQUV6RCxVQUFNLE9BQU8sb0JBQUksSUFBWTtBQUU3QixTQUFLLE1BQU07QUFDWCxRQUFJLGNBQWMsRUFBRSxNQUFNLG1IQUFtSCxFQUFFLEtBQUssWUFBVTtBQUM3SixhQUFPLEdBQUcsQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDO0FBQzNCLFdBQUssSUFBSSxNQUFNO0FBQ2YsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFNBQUssTUFBTTtBQUNYLFFBQUksY0FBYyxFQUFFLE1BQU0sc0JBQXNCLEVBQUUsS0FBSyxZQUFVO0FBQ2hFLGFBQU8sR0FBRyxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUM7QUFDM0IsV0FBSyxJQUFJLE1BQU07QUFDZixhQUFPO0FBQUEsSUFDUixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1REFBdUQsV0FBWTtBQUN2RSx3QkFBb0IsaUJBQWlCLGlCQUFpQixJQUFJO0FBQzFELHdCQUFvQixpQkFBaUIsT0FBTyxXQUFXO0FBQUEsRUFDeEQsQ0FBQztBQUdELE9BQUsscUNBQXFDLFdBQVk7QUFHckQsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFFBQVEsRUFBRSxRQUFRLEtBQUssR0FBRyxLQUFLO0FBQ3RFLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxVQUFVLEVBQUUsUUFBUSxLQUFLLEdBQUcsS0FBSztBQUN4RSxXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsWUFBWSxFQUFFLFFBQVEsS0FBSyxHQUFHLEtBQUs7QUFDMUUsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFlBQVksRUFBRSxRQUFRLGVBQWUsR0FBRyxlQUFlO0FBQzlGLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxZQUFZLEVBQUUsUUFBUSxTQUFTLEdBQUcsUUFBUTtBQUNqRixXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsWUFBWSxFQUFFLFFBQVEsWUFBWSxHQUFHLFVBQVU7QUFDdEYsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFlBQVksRUFBRSxRQUFRLHFCQUFxQixHQUFHLG9CQUFvQjtBQUN6RyxXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsWUFBWSxFQUFFLFFBQVEscUJBQXFCLEdBQUcsb0JBQW9CO0FBQ3pHLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxZQUFZLEVBQUUsUUFBUSxpQkFBaUIsR0FBRyxnQkFBZ0I7QUFDakcsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFdBQVcsRUFBRSxRQUFRLFNBQVMsR0FBRyxRQUFRO0FBQ2hGLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxXQUFXLEVBQUUsUUFBUSxZQUFZLEdBQUcsVUFBVTtBQUNyRixXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsV0FBVyxFQUFFLFFBQVEsb0JBQW9CLEdBQUcsbUJBQW1CO0FBQ3RHLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxXQUFXLEVBQUUsUUFBUSxvQkFBb0IsR0FBRyxtQkFBbUI7QUFDdEcsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFdBQVcsRUFBRSxRQUFRLGdCQUFnQixHQUFHLGVBQWU7QUFDOUYsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFdBQVcsRUFBRSxRQUFRLFFBQVEsR0FBRyxTQUFTO0FBQ2hGLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxXQUFXLEVBQUUsUUFBUSxRQUFRLEdBQUcsU0FBUztBQUNoRixXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsV0FBVyxFQUFFLFFBQVEsU0FBUyxHQUFHLFdBQVc7QUFDbkYsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFdBQVcsRUFBRSxRQUFRLFVBQVUsR0FBRyxXQUFXO0FBQ3BGLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxXQUFXLEVBQUUsUUFBUSxxQkFBcUIsR0FBRyx1QkFBdUI7QUFDM0csV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFdBQVcsRUFBRSxRQUFRLG9CQUFvQixHQUFHLHNCQUFzQjtBQUN6RyxXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsV0FBVyxFQUFFLFFBQVEsaUJBQWlCLEdBQUcsa0JBQWtCO0FBQ2xHLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxXQUFXLEVBQUUsUUFBUSxZQUFZLEdBQUcsUUFBUTtBQUNuRixXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsV0FBVyxFQUFFLFFBQVEsYUFBYSxHQUFHLFNBQVM7QUFDckYsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFdBQVcsRUFBRSxRQUFRLFNBQVMsR0FBRyxTQUFTO0FBQ2pGLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxXQUFXLEVBQUUsUUFBUSxZQUFZLEdBQUcsWUFBWTtBQUN2RixXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsV0FBVyxFQUFFLFFBQVEscUJBQXFCLEdBQUcsdUJBQXVCO0FBQzNHLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxXQUFXLEVBQUUsUUFBUSxxQkFBcUIsR0FBRyx1QkFBdUI7QUFDM0csV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFdBQVcsRUFBRSxRQUFRLGlCQUFpQixHQUFHLG1CQUFtQjtBQUNuRyxXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsVUFBVSxFQUFFLFFBQVEsT0FBTyxHQUFHLE9BQU87QUFHNUUsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFFBQVcsT0FBTyxNQUFTLEVBQUUsUUFBUSxNQUFTLEdBQUcsRUFBRTtBQUMxRixXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsUUFBVyxPQUFPLE1BQVMsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFO0FBQ25GLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxRQUFXLE9BQU8sTUFBUyxFQUFFLFFBQVEsS0FBSyxHQUFHLEtBQUs7QUFHekYsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFFBQVcsUUFBVyxLQUFLLEVBQUUsUUFBUSxNQUFTLEdBQUcsS0FBSztBQUM3RixXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsUUFBVyxRQUFXLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxLQUFLO0FBQ3RGLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxRQUFXLFFBQVcsS0FBSyxFQUFFLFFBQVEsS0FBSyxHQUFHLEtBQUs7QUFHekYsV0FBTyxZQUFZLElBQUksYUFBYSxHQUFHLFFBQVcsT0FBTyxLQUFLLEVBQUUsUUFBUSxNQUFTLEdBQUcsS0FBSztBQUN6RixXQUFPLFlBQVksSUFBSSxhQUFhLEdBQUcsUUFBVyxPQUFPLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxLQUFLO0FBQ2xGLFdBQU8sWUFBWSxJQUFJLGFBQWEsR0FBRyxRQUFXLE9BQU8sS0FBSyxFQUFFLFFBQVEsS0FBSyxHQUFHLEtBQUs7QUFBQSxFQUN0RixDQUFDO0FBRUQsT0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxVQUFNLFdBQVcsSUFBSSxNQUFrQztBQUFBLE1BQ3RELFFBQVEsVUFBd0M7QUFDL0MsY0FBTSxTQUFvQztBQUFBLFVBQ3pDLFdBQVc7QUFBQSxVQUNYLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFlBQVk7QUFBQSxRQUNiO0FBQ0EsZUFBTyxPQUFPLFNBQVMsSUFBSTtBQUFBLE1BQzVCO0FBQUEsSUFDRDtBQUVBLGFBQVMsZ0JBQWdCLGVBQXVCLFNBQWlCLFVBQWtCO0FBQ2xGLFlBQU0sSUFBSSxJQUFJLGNBQWM7QUFDNUIsWUFBTSxVQUFVLEVBQUUsTUFBTSxNQUFNLE9BQU8sZUFBZSxhQUFhLEtBQUs7QUFDdEUsWUFBTSxXQUFXLFFBQVEsU0FBUyxDQUFDO0FBQ25DLGVBQVMsUUFBUSxRQUFRO0FBQ3pCLFlBQU0sV0FBVyxTQUFTLFNBQVM7QUFDbkMsYUFBTyxZQUFZLFVBQVUsVUFBVSxHQUFHLGFBQWEsZUFBZSxPQUFPLEVBQUU7QUFBQSxJQUNoRjtBQUVBLG9CQUFnQixhQUFhLFdBQVcsNkNBQVU7QUFDbEQsb0JBQWdCLGFBQWEsU0FBUyw2Q0FBVTtBQUNoRCxvQkFBZ0IsYUFBYSxXQUFXLDZDQUFVO0FBQ2xELG9CQUFnQixhQUFhLFNBQVMsNkNBQVU7QUFDaEQsb0JBQWdCLGFBQWEsV0FBVyw0Q0FBUztBQUNqRCxvQkFBZ0IsYUFBYSxTQUFTLDRDQUFTO0FBQy9DLG9CQUFnQixjQUFjLFdBQVcsNENBQVM7QUFDbEQsb0JBQWdCLGNBQWMsU0FBUyw0Q0FBUztBQUNoRCxvQkFBZ0IsVUFBVSxXQUFXLDRDQUFTO0FBQzlDLG9CQUFnQixZQUFZLFdBQVcsNENBQVM7QUFDaEQsb0JBQWdCLGFBQWEsV0FBVyxrQkFBYTtBQUNyRCxvQkFBZ0IsY0FBYyxXQUFXLGlCQUFZO0FBQ3JELG9CQUFnQixVQUFVLFlBQVksZ0NBQU87QUFDN0Msb0JBQWdCLGFBQWEsWUFBWSxnQ0FBTztBQUFBLEVBQ2pELENBQUM7QUFFRCxPQUFLLDhHQUFpSCxXQUFZO0FBQ2pJLFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLGtEQUFrRDtBQUM1RixXQUFPLFlBQVksUUFBUSxpQkFBaUIsR0FBRyxvREFBb0Q7QUFBQSxFQUNwRyxDQUFDO0FBRUQsT0FBSyw0RkFBNEYsV0FBWTtBQUU1RyxVQUFNLEVBQUUsYUFBYSxJQUFJLElBQUksY0FBYyxFQUFFLE1BQU0sWUFBWSxJQUFJO0FBQ25FLFVBQU0sQ0FBQyxPQUFPLE1BQU0sSUFBSTtBQUV4QixXQUFPLFlBQVksYUFBYSxRQUFRLENBQUM7QUFDekMsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxPQUFPLE9BQU8sQ0FBQztBQUFBLEVBRW5DLENBQUM7QUFFRCxPQUFLLGdHQUFnRyxXQUFZO0FBRWhILFVBQU0sWUFBWSxJQUFJLFVBQVU7QUFDaEMsY0FBVSxZQUFZLElBQUksYUFBYSxHQUFHLFFBQVEsQ0FBQztBQUNuRCxjQUFVLFlBQVksSUFBSSxhQUFhLEdBQUcsUUFBUSxDQUFDO0FBQ25ELGNBQVUsU0FBUztBQUVuQixXQUFPLFlBQVksVUFBVSxRQUFRLGNBQWMsR0FBRyxZQUFZO0FBRWxFLFVBQU0sUUFBUSxVQUFVLE1BQU07QUFDOUIsV0FBTyxZQUFZLE1BQU0sUUFBUSxjQUFjLEdBQUcsWUFBWTtBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLHNDQUFzQyxXQUFZO0FBRXRELFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLG9DQUFvQztBQUM5RSxpQkFBYSxTQUFTLFFBQVE7QUFBQSxFQUMvQixDQUFDO0FBRUQsT0FBSyxtR0FBb0csV0FBWTtBQUNwSCxVQUFNLFlBQVksSUFBSSxVQUFVO0FBQ2hDLGNBQVUsWUFBWSxJQUFJLEtBQUssS0FBSyxDQUFDO0FBQ3JDLGNBQVUsU0FBUyxJQUFJLE9BQU8sT0FBTyxJQUFJO0FBQ3pDLFdBQU8sWUFBWSxVQUFVLGlCQUFpQixHQUFHLGFBQWE7QUFBQSxFQUMvRCxDQUFDO0FBRUQsT0FBSyx3REFBd0QsV0FBWTtBQUN4RSxVQUFNLDRCQUE0QixJQUFJLFVBQVU7QUFDaEQsOEJBQTBCLFlBQVksSUFBSSxhQUFhLEdBQUcsUUFBUSxDQUFDO0FBQ25FLDhCQUEwQixZQUFZLElBQUksS0FBSyxHQUFHLENBQUM7QUFDbkQsOEJBQTBCLFNBQVMsSUFBSSxPQUFPLE9BQU8sR0FBRztBQUN4RCxVQUFNLGFBQWEsMEJBQTBCLGlCQUFpQjtBQUM5RCxXQUFPLFlBQVksWUFBWSxzQkFBc0I7QUFFckQsVUFBTSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0saUJBQWlCLFVBQVUsR0FBRztBQUN4RSxXQUFPLFlBQVksUUFBUSxpQkFBaUIsR0FBRyxpQkFBaUIsVUFBVSxHQUFHO0FBQUEsRUFDOUUsQ0FBQztBQUVELE9BQUssZ0NBQWdDLFdBQVk7QUFDaEQsVUFBTSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sd0NBQXlDO0FBQ25GLGlCQUFhLFNBQVMsV0FBVztBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxXQUFZO0FBQzFFLHdCQUFvQixxQkFBcUIsZ0JBQWdCLE1BQU0sV0FBVztBQUFBLEVBQzNFLENBQUM7QUFFRCxPQUFLLHlGQUF5RixXQUFZO0FBQ3pHLFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLHFDQUFxQztBQUMvRSxXQUFPLFlBQVksUUFBUSxTQUFTLFFBQVEsQ0FBQztBQUM3QyxXQUFPLEdBQUcsUUFBUSxTQUFTLENBQUMsYUFBYSxXQUFXO0FBQ3BELFdBQU8sR0FBRyxRQUFRLFNBQVMsQ0FBQyxhQUFhLElBQUk7QUFDN0MsV0FBTyxHQUFHLFFBQVEsU0FBUyxDQUFDLGFBQWEsV0FBVztBQUVwRCxhQUFTLGFBQWEsUUFBZ0I7QUFDckMsYUFBTyxTQUFTLFFBQVEsWUFBWTtBQUNwQyxVQUFJLEVBQUUsa0JBQWtCLGNBQWM7QUFDckM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxRQUFRO0FBQ1osVUFBSSxJQUFZO0FBQ2hCLGFBQU8sS0FBSyxDQUFDLE9BQU87QUFDbkIsWUFBSSxFQUFFLFdBQVcsU0FBUztBQUN6QixrQkFBUTtBQUFBLFFBQ1Q7QUFDQSxZQUFJLEVBQUU7QUFBQSxNQUNQO0FBQ0EsYUFBTyxHQUFHLEtBQUs7QUFBQSxJQUNoQjtBQUNBLFVBQU0sQ0FBQyxFQUFFLEVBQUUsS0FBSyxJQUFJLFFBQVE7QUFDNUIsaUJBQWEsS0FBSztBQUFBLEVBQ25CLENBQUM7QUFFRCxPQUFLLG9FQUFxRSxXQUFZO0FBRXJGLFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLHlDQUF5QztBQUNuRixpQkFBYSxTQUFTLE1BQU0sVUFBVSxJQUFJO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUssa0dBQWtHLFdBQVk7QUFFbEgsVUFBTSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sMkRBQTJEO0FBQ3JHLFVBQU0sV0FBcUIsUUFBUSxTQUFTLENBQUM7QUFDN0MsV0FBTyxZQUFZLFFBQVEsU0FBUyxRQUFRLENBQUM7QUFDN0MsV0FBTyxHQUFHLG9CQUFvQixRQUFRO0FBQ3RDLFdBQU8sR0FBRyxTQUFTLFNBQVM7QUFDNUIsV0FBTyxZQUFZLFNBQVMsVUFBVSxTQUFTLFFBQVEsQ0FBQztBQUN4RCxXQUFPLEdBQUcsU0FBUyxVQUFVLFNBQVMsQ0FBQyxhQUFhLFlBQVk7QUFDaEUsV0FBTyxZQUEyQixTQUFTLFVBQVUsU0FBUyxDQUFDLEVBQUcsU0FBUyw2QkFBNkI7QUFDeEcsV0FBTyxZQUEyQixTQUFTLFVBQVUsU0FBUyxDQUFDLEVBQUcsV0FBVyxNQUFTO0FBQUEsRUFDdkYsQ0FBQztBQUVELE9BQUssdUZBQXVGLFdBQVk7QUFFdkcsVUFBTSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sa0NBQWtDO0FBQzVFLFVBQU0sV0FBcUIsUUFBUSxTQUFTLENBQUM7QUFDN0MsV0FBTyxZQUFZLFFBQVEsU0FBUyxRQUFRLENBQUM7QUFDN0MsV0FBTyxHQUFHLG9CQUFvQixRQUFRO0FBQ3RDLFdBQU8sR0FBRyxTQUFTLFNBQVM7QUFDNUIsV0FBTyxZQUFZLFNBQVMsVUFBVSxTQUFTLFFBQVEsQ0FBQztBQUN4RCxXQUFPLEdBQUcsU0FBUyxVQUFVLFNBQVMsQ0FBQyxhQUFhLFlBQVk7QUFDaEUsV0FBTyxZQUEyQixTQUFTLFVBQVUsU0FBUyxDQUFDLEVBQUcsU0FBUyxJQUFJO0FBQy9FLFdBQU8sWUFBMkIsU0FBUyxVQUFVLFNBQVMsQ0FBQyxFQUFHLFdBQVcsTUFBUztBQUFBLEVBQ3ZGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxXQUFZO0FBRTNFLFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLDRCQUE0QjtBQUN0RSxVQUFNLFNBQVMsUUFBUSxTQUFTO0FBQ2hDLFdBQU8sWUFBWSxRQUFRLHlCQUF5QjtBQUVwRCxVQUFNLFdBQVcsSUFBSSxjQUFjLEVBQUUsTUFBTSx1Q0FBdUM7QUFDbEYsVUFBTSxVQUFVLFNBQVMsU0FBUztBQUNsQyxXQUFPLFlBQVksU0FBUyx1Q0FBdUM7QUFHbkUsVUFBTSxXQUFXLElBQUksY0FBYyxFQUFFLE1BQU0sNEJBQTRCO0FBQ3ZFLFVBQU0sVUFBVSxTQUFTLFNBQVM7QUFDbEMsV0FBTyxZQUFZLFNBQVMsc0NBQXNDO0FBQUEsRUFDbkUsQ0FBQztBQUVELE9BQUssMkRBQTJELFdBQVk7QUFDM0Usd0JBQW9CLDBCQUEwQixrQkFBa0IsYUFBYSxJQUFJO0FBQUEsRUFDbEYsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
