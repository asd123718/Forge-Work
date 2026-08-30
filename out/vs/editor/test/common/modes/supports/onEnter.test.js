import assert from "assert";
import { IndentAction } from "../../../../common/languages/languageConfiguration.js";
import { OnEnterSupport } from "../../../../common/languages/supports/onEnter.js";
import { javascriptOnEnterRules } from "./onEnterRules.js";
import { EditorAutoIndentStrategy } from "../../../../common/config/editorOptions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("OnEnter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("uses brackets", () => {
    const brackets = [
      ["(", ")"],
      ["begin", "end"]
    ];
    const support = new OnEnterSupport({
      brackets
    });
    const testIndentAction = (beforeText, afterText, expected) => {
      const actual = support.onEnter(EditorAutoIndentStrategy.Advanced, "", beforeText, afterText);
      if (expected === IndentAction.None) {
        assert.strictEqual(actual, null);
      } else {
        assert.strictEqual(actual.indentAction, expected);
      }
    };
    testIndentAction("a", "", IndentAction.None);
    testIndentAction("", "b", IndentAction.None);
    testIndentAction("(", "b", IndentAction.Indent);
    testIndentAction("a", ")", IndentAction.None);
    testIndentAction("begin", "ending", IndentAction.Indent);
    testIndentAction("abegin", "end", IndentAction.None);
    testIndentAction("begin", ")", IndentAction.Indent);
    testIndentAction("begin", "end", IndentAction.IndentOutdent);
    testIndentAction("begin ", " end", IndentAction.IndentOutdent);
    testIndentAction(" begin", "end//as", IndentAction.IndentOutdent);
    testIndentAction("(", ")", IndentAction.IndentOutdent);
    testIndentAction("( ", ")", IndentAction.IndentOutdent);
    testIndentAction("a(", ")b", IndentAction.IndentOutdent);
    testIndentAction("(", "", IndentAction.Indent);
    testIndentAction("(", "foo", IndentAction.Indent);
    testIndentAction("begin", "foo", IndentAction.Indent);
    testIndentAction("begin", "", IndentAction.Indent);
  });
  test("Issue #121125: onEnterRules with global modifier", () => {
    const support = new OnEnterSupport({
      onEnterRules: [
        {
          action: {
            appendText: "/// ",
            indentAction: IndentAction.Outdent
          },
          beforeText: /^\s*\/{3}.*$/gm
        }
      ]
    });
    const testIndentAction = (previousLineText, beforeText, afterText, expectedIndentAction, expectedAppendText, removeText = 0) => {
      const actual = support.onEnter(EditorAutoIndentStrategy.Advanced, previousLineText, beforeText, afterText);
      if (expectedIndentAction === null) {
        assert.strictEqual(actual, null, "isNull:" + beforeText);
      } else {
        assert.strictEqual(actual !== null, true, "isNotNull:" + beforeText);
        assert.strictEqual(actual.indentAction, expectedIndentAction, "indentAction:" + beforeText);
        if (expectedAppendText !== null) {
          assert.strictEqual(actual.appendText, expectedAppendText, "appendText:" + beforeText);
        }
        if (removeText !== 0) {
          assert.strictEqual(actual.removeText, removeText, "removeText:" + beforeText);
        }
      }
    };
    testIndentAction("/// line", "/// line", "", IndentAction.Outdent, "/// ");
    testIndentAction("/// line", "/// line", "", IndentAction.Outdent, "/// ");
  });
  test("uses regExpRules", () => {
    const support = new OnEnterSupport({
      onEnterRules: javascriptOnEnterRules
    });
    const testIndentAction = (previousLineText, beforeText, afterText, expectedIndentAction, expectedAppendText, removeText = 0) => {
      const actual = support.onEnter(EditorAutoIndentStrategy.Advanced, previousLineText, beforeText, afterText);
      if (expectedIndentAction === null) {
        assert.strictEqual(actual, null, "isNull:" + beforeText);
      } else {
        assert.strictEqual(actual !== null, true, "isNotNull:" + beforeText);
        assert.strictEqual(actual.indentAction, expectedIndentAction, "indentAction:" + beforeText);
        if (expectedAppendText !== null) {
          assert.strictEqual(actual.appendText, expectedAppendText, "appendText:" + beforeText);
        }
        if (removeText !== 0) {
          assert.strictEqual(actual.removeText, removeText, "removeText:" + beforeText);
        }
      }
    };
    testIndentAction("", "	/**", " */", IndentAction.IndentOutdent, " * ");
    testIndentAction("", "	/**", "", IndentAction.None, " * ");
    testIndentAction("", "	/** * / * / * /", "", IndentAction.None, " * ");
    testIndentAction("", "	/** /*", "", IndentAction.None, " * ");
    testIndentAction("", "/**", "", IndentAction.None, " * ");
    testIndentAction("", "	/**/", "", null, null);
    testIndentAction("", "	/***/", "", null, null);
    testIndentAction("", "	/*******/", "", null, null);
    testIndentAction("", "	/** * * * * */", "", null, null);
    testIndentAction("", "	/** */", "", null, null);
    testIndentAction("", "	/** asdfg */", "", null, null);
    testIndentAction("", "	/* asdfg */", "", null, null);
    testIndentAction("", "	/* asdfg */", "", null, null);
    testIndentAction("", "	/** asdfg */", "", null, null);
    testIndentAction("", "*/", "", null, null);
    testIndentAction("", "	/*", "", null, null);
    testIndentAction("", "	*", "", null, null);
    testIndentAction("	/**", "	 *", "", IndentAction.None, "* ");
    testIndentAction("	 * something", "	 *", "", IndentAction.None, "* ");
    testIndentAction("	 *", "	 *", "", IndentAction.None, "* ");
    testIndentAction("", "	 */", "", IndentAction.None, null, 1);
    testIndentAction("", "	 * */", "", IndentAction.None, null, 1);
    testIndentAction("", "	 * * / * / * / */", "", null, null);
    testIndentAction("	/**", "	 * ", "", IndentAction.None, "* ");
    testIndentAction("	 * something", "	 * ", "", IndentAction.None, "* ");
    testIndentAction("	 *", "	 * ", "", IndentAction.None, "* ");
    testIndentAction("/**", " * ", "", IndentAction.None, "* ");
    testIndentAction(" * something", " * ", "", IndentAction.None, "* ");
    testIndentAction(" *", " * asdfsfagadfg", "", IndentAction.None, "* ");
    testIndentAction("/**", " * asdfsfagadfg * * * ", "", IndentAction.None, "* ");
    testIndentAction(" * something", " * asdfsfagadfg * * * ", "", IndentAction.None, "* ");
    testIndentAction(" *", " * asdfsfagadfg * * * ", "", IndentAction.None, "* ");
    testIndentAction("/**", " * /*", "", IndentAction.None, "* ");
    testIndentAction(" * something", " * /*", "", IndentAction.None, "* ");
    testIndentAction(" *", " * /*", "", IndentAction.None, "* ");
    testIndentAction("/**", " * asdfsfagadfg * / * / * /", "", IndentAction.None, "* ");
    testIndentAction(" * something", " * asdfsfagadfg * / * / * /", "", IndentAction.None, "* ");
    testIndentAction(" *", " * asdfsfagadfg * / * / * /", "", IndentAction.None, "* ");
    testIndentAction("/**", " * asdfsfagadfg * / * / * /*", "", IndentAction.None, "* ");
    testIndentAction(" * something", " * asdfsfagadfg * / * / * /*", "", IndentAction.None, "* ");
    testIndentAction(" *", " * asdfsfagadfg * / * / * /*", "", IndentAction.None, "* ");
    testIndentAction("", " */", "", IndentAction.None, null, 1);
    testIndentAction(" */", " * test() {", "", IndentAction.Indent, null, 0);
    testIndentAction("", "	 */", "", IndentAction.None, null, 1);
    testIndentAction("", "		 */", "", IndentAction.None, null, 1);
    testIndentAction("", "   */", "", IndentAction.None, null, 1);
    testIndentAction("", "     */", "", IndentAction.None, null, 1);
    testIndentAction("", "	     */", "", IndentAction.None, null, 1);
    testIndentAction("", " *--------------------------------------------------------------------------------------------*/", "", IndentAction.None, null, 1);
    testIndentAction("class A {", "    * test() {", "", IndentAction.Indent, null, 0);
    testIndentAction("", "    * test() {", "", IndentAction.Indent, null, 0);
    testIndentAction("    ", "    * test() {", "", IndentAction.Indent, null, 0);
    testIndentAction("class A {", "  * test() {", "", IndentAction.Indent, null, 0);
    testIndentAction("", "  * test() {", "", IndentAction.Indent, null, 0);
    testIndentAction("  ", "  * test() {", "", IndentAction.Indent, null, 0);
  });
  test("issue #141816", () => {
    const support = new OnEnterSupport({
      onEnterRules: javascriptOnEnterRules
    });
    const testIndentAction = (beforeText, afterText, expected) => {
      const actual = support.onEnter(EditorAutoIndentStrategy.Advanced, "", beforeText, afterText);
      if (expected === IndentAction.None) {
        assert.strictEqual(actual, null);
      } else {
        assert.strictEqual(actual.indentAction, expected);
      }
    };
    testIndentAction("const r = /{/;", "", IndentAction.None);
    testIndentAction("const r = /{[0-9]/;", "", IndentAction.None);
    testIndentAction("const r = /[a-zA-Z]{/;", "", IndentAction.None);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZXNcXHN1cHBvcnRzXFxvbkVudGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2hhcmFjdGVyUGFpciwgSW5kZW50QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgT25FbnRlclN1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL29uRW50ZXIuanMnO1xuaW1wb3J0IHsgamF2YXNjcmlwdE9uRW50ZXJSdWxlcyB9IGZyb20gJy4vb25FbnRlclJ1bGVzLmpzJztcbmltcG9ydCB7IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ09uRW50ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndXNlcyBicmFja2V0cycsICgpID0+IHtcblx0XHRjb25zdCBicmFja2V0czogQ2hhcmFjdGVyUGFpcltdID0gW1xuXHRcdFx0WycoJywgJyknXSxcblx0XHRcdFsnYmVnaW4nLCAnZW5kJ11cblx0XHRdO1xuXHRcdGNvbnN0IHN1cHBvcnQgPSBuZXcgT25FbnRlclN1cHBvcnQoe1xuXHRcdFx0YnJhY2tldHM6IGJyYWNrZXRzXG5cdFx0fSk7XG5cdFx0Y29uc3QgdGVzdEluZGVudEFjdGlvbiA9IChiZWZvcmVUZXh0OiBzdHJpbmcsIGFmdGVyVGV4dDogc3RyaW5nLCBleHBlY3RlZDogSW5kZW50QWN0aW9uKSA9PiB7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBzdXBwb3J0Lm9uRW50ZXIoRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkFkdmFuY2VkLCAnJywgYmVmb3JlVGV4dCwgYWZ0ZXJUZXh0KTtcblx0XHRcdGlmIChleHBlY3RlZCA9PT0gSW5kZW50QWN0aW9uLk5vbmUpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgbnVsbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsIS5pbmRlbnRBY3Rpb24sIGV4cGVjdGVkKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGVzdEluZGVudEFjdGlvbignYScsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJ2InLCBJbmRlbnRBY3Rpb24uTm9uZSk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignKCcsICdiJywgSW5kZW50QWN0aW9uLkluZGVudCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignYScsICcpJywgSW5kZW50QWN0aW9uLk5vbmUpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJ2JlZ2luJywgJ2VuZGluZycsIEluZGVudEFjdGlvbi5JbmRlbnQpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJ2FiZWdpbicsICdlbmQnLCBJbmRlbnRBY3Rpb24uTm9uZSk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignYmVnaW4nLCAnKScsIEluZGVudEFjdGlvbi5JbmRlbnQpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJ2JlZ2luJywgJ2VuZCcsIEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCdiZWdpbiAnLCAnIGVuZCcsIEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcgYmVnaW4nLCAnZW5kLy9hcycsIEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcoJywgJyknLCBJbmRlbnRBY3Rpb24uSW5kZW50T3V0ZGVudCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignKCAnLCAnKScsIEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCdhKCcsICcpYicsIEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KTtcblxuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJygnLCAnJywgSW5kZW50QWN0aW9uLkluZGVudCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignKCcsICdmb28nLCBJbmRlbnRBY3Rpb24uSW5kZW50KTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCdiZWdpbicsICdmb28nLCBJbmRlbnRBY3Rpb24uSW5kZW50KTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCdiZWdpbicsICcnLCBJbmRlbnRBY3Rpb24uSW5kZW50KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdJc3N1ZSAjMTIxMTI1OiBvbkVudGVyUnVsZXMgd2l0aCBnbG9iYWwgbW9kaWZpZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VwcG9ydCA9IG5ldyBPbkVudGVyU3VwcG9ydCh7XG5cdFx0XHRvbkVudGVyUnVsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0YXBwZW5kVGV4dDogJy8vLyAnLFxuXHRcdFx0XHRcdFx0aW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24uT3V0ZGVudFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YmVmb3JlVGV4dDogL15cXHMqXFwvezN9LiokL2dtXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRlc3RJbmRlbnRBY3Rpb24gPSAocHJldmlvdXNMaW5lVGV4dDogc3RyaW5nLCBiZWZvcmVUZXh0OiBzdHJpbmcsIGFmdGVyVGV4dDogc3RyaW5nLCBleHBlY3RlZEluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uIHwgbnVsbCwgZXhwZWN0ZWRBcHBlbmRUZXh0OiBzdHJpbmcgfCBudWxsLCByZW1vdmVUZXh0OiBudW1iZXIgPSAwKSA9PiB7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBzdXBwb3J0Lm9uRW50ZXIoRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkFkdmFuY2VkLCBwcmV2aW91c0xpbmVUZXh0LCBiZWZvcmVUZXh0LCBhZnRlclRleHQpO1xuXHRcdFx0aWYgKGV4cGVjdGVkSW5kZW50QWN0aW9uID09PSBudWxsKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIG51bGwsICdpc051bGw6JyArIGJlZm9yZVRleHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCAhPT0gbnVsbCwgdHJ1ZSwgJ2lzTm90TnVsbDonICsgYmVmb3JlVGV4dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwhLmluZGVudEFjdGlvbiwgZXhwZWN0ZWRJbmRlbnRBY3Rpb24sICdpbmRlbnRBY3Rpb246JyArIGJlZm9yZVRleHQpO1xuXHRcdFx0XHRpZiAoZXhwZWN0ZWRBcHBlbmRUZXh0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCEuYXBwZW5kVGV4dCwgZXhwZWN0ZWRBcHBlbmRUZXh0LCAnYXBwZW5kVGV4dDonICsgYmVmb3JlVGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlbW92ZVRleHQgIT09IDApIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsIS5yZW1vdmVUZXh0LCByZW1vdmVUZXh0LCAncmVtb3ZlVGV4dDonICsgYmVmb3JlVGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGVzdEluZGVudEFjdGlvbignLy8vIGxpbmUnLCAnLy8vIGxpbmUnLCAnJywgSW5kZW50QWN0aW9uLk91dGRlbnQsICcvLy8gJyk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignLy8vIGxpbmUnLCAnLy8vIGxpbmUnLCAnJywgSW5kZW50QWN0aW9uLk91dGRlbnQsICcvLy8gJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgcmVnRXhwUnVsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VwcG9ydCA9IG5ldyBPbkVudGVyU3VwcG9ydCh7XG5cdFx0XHRvbkVudGVyUnVsZXM6IGphdmFzY3JpcHRPbkVudGVyUnVsZXNcblx0XHR9KTtcblx0XHRjb25zdCB0ZXN0SW5kZW50QWN0aW9uID0gKHByZXZpb3VzTGluZVRleHQ6IHN0cmluZywgYmVmb3JlVGV4dDogc3RyaW5nLCBhZnRlclRleHQ6IHN0cmluZywgZXhwZWN0ZWRJbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbiB8IG51bGwsIGV4cGVjdGVkQXBwZW5kVGV4dDogc3RyaW5nIHwgbnVsbCwgcmVtb3ZlVGV4dDogbnVtYmVyID0gMCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gc3VwcG9ydC5vbkVudGVyKEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5BZHZhbmNlZCwgcHJldmlvdXNMaW5lVGV4dCwgYmVmb3JlVGV4dCwgYWZ0ZXJUZXh0KTtcblx0XHRcdGlmIChleHBlY3RlZEluZGVudEFjdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBudWxsLCAnaXNOdWxsOicgKyBiZWZvcmVUZXh0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwgIT09IG51bGwsIHRydWUsICdpc05vdE51bGw6JyArIGJlZm9yZVRleHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsIS5pbmRlbnRBY3Rpb24sIGV4cGVjdGVkSW5kZW50QWN0aW9uLCAnaW5kZW50QWN0aW9uOicgKyBiZWZvcmVUZXh0KTtcblx0XHRcdFx0aWYgKGV4cGVjdGVkQXBwZW5kVGV4dCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwhLmFwcGVuZFRleHQsIGV4cGVjdGVkQXBwZW5kVGV4dCwgJ2FwcGVuZFRleHQ6JyArIGJlZm9yZVRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZW1vdmVUZXh0ICE9PSAwKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCEucmVtb3ZlVGV4dCwgcmVtb3ZlVGV4dCwgJ3JlbW92ZVRleHQ6JyArIGJlZm9yZVRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICdcXHQvKionLCAnICovJywgSW5kZW50QWN0aW9uLkluZGVudE91dGRlbnQsICcgKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnXFx0LyoqJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnICogJyk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJ1xcdC8qKiAqIC8gKiAvICogLycsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSwgJyAqICcpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICdcXHQvKiogLyonLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsICcgKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnLyoqJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnICogJyk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJ1xcdC8qKi8nLCAnJywgbnVsbCwgbnVsbCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJ1xcdC8qKiovJywgJycsIG51bGwsIG51bGwpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICdcXHQvKioqKioqKi8nLCAnJywgbnVsbCwgbnVsbCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJ1xcdC8qKiAqICogKiAqICovJywgJycsIG51bGwsIG51bGwpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICdcXHQvKiogKi8nLCAnJywgbnVsbCwgbnVsbCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJ1xcdC8qKiBhc2RmZyAqLycsICcnLCBudWxsLCBudWxsKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnXFx0LyogYXNkZmcgKi8nLCAnJywgbnVsbCwgbnVsbCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJ1xcdC8qIGFzZGZnICovJywgJycsIG51bGwsIG51bGwpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICdcXHQvKiogYXNkZmcgKi8nLCAnJywgbnVsbCwgbnVsbCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJyovJywgJycsIG51bGwsIG51bGwpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICdcXHQvKicsICcnLCBudWxsLCBudWxsKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnXFx0KicsICcnLCBudWxsLCBudWxsKTtcblxuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJ1xcdC8qKicsICdcXHQgKicsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSwgJyogJyk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignXFx0ICogc29tZXRoaW5nJywgJ1xcdCAqJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCdcXHQgKicsICdcXHQgKicsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSwgJyogJyk7XG5cblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnXFx0ICovJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCBudWxsLCAxKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnXFx0ICogKi8nLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsIG51bGwsIDEpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICdcXHQgKiAqIC8gKiAvICogLyAqLycsICcnLCBudWxsLCBudWxsKTtcblxuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJ1xcdC8qKicsICdcXHQgKiAnLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsICcqICcpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJ1xcdCAqIHNvbWV0aGluZycsICdcXHQgKiAnLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsICcqICcpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJ1xcdCAqJywgJ1xcdCAqICcsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSwgJyogJyk7XG5cblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcvKionLCAnICogJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcgKiBzb21ldGhpbmcnLCAnICogJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcgKicsICcgKiBhc2Rmc2ZhZ2FkZmcnLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsICcqICcpO1xuXG5cdFx0dGVzdEluZGVudEFjdGlvbignLyoqJywgJyAqIGFzZGZzZmFnYWRmZyAqICogKiAnLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsICcqICcpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJyAqIHNvbWV0aGluZycsICcgKiBhc2Rmc2ZhZ2FkZmcgKiAqICogJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcgKicsICcgKiBhc2Rmc2ZhZ2FkZmcgKiAqICogJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblxuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJy8qKicsICcgKiAvKicsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSwgJyogJyk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignICogc29tZXRoaW5nJywgJyAqIC8qJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcgKicsICcgKiAvKicsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSwgJyogJyk7XG5cblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcvKionLCAnICogYXNkZnNmYWdhZGZnICogLyAqIC8gKiAvJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcgKiBzb21ldGhpbmcnLCAnICogYXNkZnNmYWdhZGZnICogLyAqIC8gKiAvJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcgKicsICcgKiBhc2Rmc2ZhZ2FkZmcgKiAvICogLyAqIC8nLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsICcqICcpO1xuXG5cdFx0dGVzdEluZGVudEFjdGlvbignLyoqJywgJyAqIGFzZGZzZmFnYWRmZyAqIC8gKiAvICogLyonLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsICcqICcpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJyAqIHNvbWV0aGluZycsICcgKiBhc2Rmc2ZhZ2FkZmcgKiAvICogLyAqIC8qJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcgKicsICcgKiBhc2Rmc2ZhZ2FkZmcgKiAvICogLyAqIC8qJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCAnKiAnKTtcblxuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICcgKi8nLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsIG51bGwsIDEpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJyAqLycsICcgKiB0ZXN0KCkgeycsICcnLCBJbmRlbnRBY3Rpb24uSW5kZW50LCBudWxsLCAwKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnXFx0ICovJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCBudWxsLCAxKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnXFx0XFx0ICovJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCBudWxsLCAxKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnICAgKi8nLCAnJywgSW5kZW50QWN0aW9uLk5vbmUsIG51bGwsIDEpO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJycsICcgICAgICovJywgJycsIEluZGVudEFjdGlvbi5Ob25lLCBudWxsLCAxKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnXFx0ICAgICAqLycsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSwgbnVsbCwgMSk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJyAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qLycsICcnLCBJbmRlbnRBY3Rpb24uTm9uZSwgbnVsbCwgMSk7XG5cblx0XHQvLyBpc3N1ZSAjNDM0Njlcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCdjbGFzcyBBIHsnLCAnICAgICogdGVzdCgpIHsnLCAnJywgSW5kZW50QWN0aW9uLkluZGVudCwgbnVsbCwgMCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignJywgJyAgICAqIHRlc3QoKSB7JywgJycsIEluZGVudEFjdGlvbi5JbmRlbnQsIG51bGwsIDApO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJyAgICAnLCAnICAgICogdGVzdCgpIHsnLCAnJywgSW5kZW50QWN0aW9uLkluZGVudCwgbnVsbCwgMCk7XG5cdFx0dGVzdEluZGVudEFjdGlvbignY2xhc3MgQSB7JywgJyAgKiB0ZXN0KCkgeycsICcnLCBJbmRlbnRBY3Rpb24uSW5kZW50LCBudWxsLCAwKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCcnLCAnICAqIHRlc3QoKSB7JywgJycsIEluZGVudEFjdGlvbi5JbmRlbnQsIG51bGwsIDApO1xuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJyAgJywgJyAgKiB0ZXN0KCkgeycsICcnLCBJbmRlbnRBY3Rpb24uSW5kZW50LCBudWxsLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0MTgxNicsICgpID0+IHtcblx0XHRjb25zdCBzdXBwb3J0ID0gbmV3IE9uRW50ZXJTdXBwb3J0KHtcblx0XHRcdG9uRW50ZXJSdWxlczogamF2YXNjcmlwdE9uRW50ZXJSdWxlc1xuXHRcdH0pO1xuXHRcdGNvbnN0IHRlc3RJbmRlbnRBY3Rpb24gPSAoYmVmb3JlVGV4dDogc3RyaW5nLCBhZnRlclRleHQ6IHN0cmluZywgZXhwZWN0ZWQ6IEluZGVudEFjdGlvbikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gc3VwcG9ydC5vbkVudGVyKEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5BZHZhbmNlZCwgJycsIGJlZm9yZVRleHQsIGFmdGVyVGV4dCk7XG5cdFx0XHRpZiAoZXhwZWN0ZWQgPT09IEluZGVudEFjdGlvbi5Ob25lKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIG51bGwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCEuaW5kZW50QWN0aW9uLCBleHBlY3RlZCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3RJbmRlbnRBY3Rpb24oJ2NvbnN0IHIgPSAvey87JywgJycsIEluZGVudEFjdGlvbi5Ob25lKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCdjb25zdCByID0gL3tbMC05XS87JywgJycsIEluZGVudEFjdGlvbi5Ob25lKTtcblx0XHR0ZXN0SW5kZW50QWN0aW9uKCdjb25zdCByID0gL1thLXpBLVpdey87JywgJycsIEluZGVudEFjdGlvbi5Ob25lKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUF3QixvQkFBb0I7QUFDNUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxXQUFXLE1BQU07QUFFdEIsMENBQXdDO0FBRXhDLE9BQUssaUJBQWlCLE1BQU07QUFDM0IsVUFBTSxXQUE0QjtBQUFBLE1BQ2pDLENBQUMsS0FBSyxHQUFHO0FBQUEsTUFDVCxDQUFDLFNBQVMsS0FBSztBQUFBLElBQ2hCO0FBQ0EsVUFBTSxVQUFVLElBQUksZUFBZTtBQUFBLE1BQ2xDO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxtQkFBbUIsQ0FBQyxZQUFvQixXQUFtQixhQUEyQjtBQUMzRixZQUFNLFNBQVMsUUFBUSxRQUFRLHlCQUF5QixVQUFVLElBQUksWUFBWSxTQUFTO0FBQzNGLFVBQUksYUFBYSxhQUFhLE1BQU07QUFDbkMsZUFBTyxZQUFZLFFBQVEsSUFBSTtBQUFBLE1BQ2hDLE9BQU87QUFDTixlQUFPLFlBQVksT0FBUSxjQUFjLFFBQVE7QUFBQSxNQUNsRDtBQUFBLElBQ0Q7QUFFQSxxQkFBaUIsS0FBSyxJQUFJLGFBQWEsSUFBSTtBQUMzQyxxQkFBaUIsSUFBSSxLQUFLLGFBQWEsSUFBSTtBQUMzQyxxQkFBaUIsS0FBSyxLQUFLLGFBQWEsTUFBTTtBQUM5QyxxQkFBaUIsS0FBSyxLQUFLLGFBQWEsSUFBSTtBQUM1QyxxQkFBaUIsU0FBUyxVQUFVLGFBQWEsTUFBTTtBQUN2RCxxQkFBaUIsVUFBVSxPQUFPLGFBQWEsSUFBSTtBQUNuRCxxQkFBaUIsU0FBUyxLQUFLLGFBQWEsTUFB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
