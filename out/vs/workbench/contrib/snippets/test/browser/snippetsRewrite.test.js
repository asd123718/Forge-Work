import assert from "assert";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Snippet, SnippetSource } from "../../browser/snippetsFile.js";
suite("SnippetRewrite", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertRewrite(input, expected) {
    const actual = new Snippet(false, ["foo"], "foo", "foo", "foo", input, "foo", SnippetSource.User, generateUuid());
    if (typeof expected === "boolean") {
      assert.strictEqual(actual.codeSnippet, input);
    } else {
      assert.strictEqual(actual.codeSnippet, expected);
    }
  }
  test("bogous variable rewrite", function() {
    assertRewrite("foo", false);
    assertRewrite("hello $1 world$0", false);
    assertRewrite("$foo and $foo", "${1:foo} and ${1:foo}");
    assertRewrite("$1 and $SELECTION and $foo", "$1 and ${SELECTION} and ${2:foo}");
    assertRewrite(
      [
        "for (var ${index} = 0; ${index} < ${array}.length; ${index}++) {",
        "	var ${element} = ${array}[${index}];",
        "	$0",
        "}"
      ].join("\n"),
      [
        "for (var ${1:index} = 0; ${1:index} < ${2:array}.length; ${1:index}++) {",
        "	var ${3:element} = ${2:array}[${1:index}];",
        "	$0",
        "\\}"
      ].join("\n")
    );
  });
  test("Snippet choices: unable to escape comma and pipe, #31521", function() {
    assertRewrite("console.log(${1|not\\, not, five, 5, 1   23|});", false);
  });
  test("lazy bogous variable rewrite", function() {
    const snippet = new Snippet(false, ["fooLang"], "foo", "prefix", "desc", "This is ${bogous} because it is a ${var}", "source", SnippetSource.Extension, generateUuid());
    assert.strictEqual(snippet.body, "This is ${bogous} because it is a ${var}");
    assert.strictEqual(snippet.codeSnippet, "This is ${1:bogous} because it is a ${2:var}");
    assert.strictEqual(snippet.isBogous, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNuaXBwZXRzXFx0ZXN0XFxicm93c2VyXFxzbmlwcGV0c1Jld3JpdGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0LCBTbmlwcGV0U291cmNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zbmlwcGV0c0ZpbGUuanMnO1xuXG5zdWl0ZSgnU25pcHBldFJld3JpdGUnLCBmdW5jdGlvbiAoKSB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0UmV3cml0ZShpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nIHwgYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdHVhbCA9IG5ldyBTbmlwcGV0KGZhbHNlLCBbJ2ZvbyddLCAnZm9vJywgJ2ZvbycsICdmb28nLCBpbnB1dCwgJ2ZvbycsIFNuaXBwZXRTb3VyY2UuVXNlciwgZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdGlmICh0eXBlb2YgZXhwZWN0ZWQgPT09ICdib29sZWFuJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb2RlU25pcHBldCwgaW5wdXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvZGVTbmlwcGV0LCBleHBlY3RlZCk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnYm9nb3VzIHZhcmlhYmxlIHJld3JpdGUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnRSZXdyaXRlKCdmb28nLCBmYWxzZSk7XG5cdFx0YXNzZXJ0UmV3cml0ZSgnaGVsbG8gJDEgd29ybGQkMCcsIGZhbHNlKTtcblxuXHRcdGFzc2VydFJld3JpdGUoJyRmb28gYW5kICRmb28nLCAnJHsxOmZvb30gYW5kICR7MTpmb299Jyk7XG5cdFx0YXNzZXJ0UmV3cml0ZSgnJDEgYW5kICRTRUxFQ1RJT04gYW5kICRmb28nLCAnJDEgYW5kICR7U0VMRUNUSU9OfSBhbmQgJHsyOmZvb30nKTtcblxuXG5cdFx0YXNzZXJ0UmV3cml0ZShcblx0XHRcdFtcblx0XHRcdFx0J2ZvciAodmFyICR7aW5kZXh9ID0gMDsgJHtpbmRleH0gPCAke2FycmF5fS5sZW5ndGg7ICR7aW5kZXh9KyspIHsnLFxuXHRcdFx0XHQnXFx0dmFyICR7ZWxlbWVudH0gPSAke2FycmF5fVske2luZGV4fV07Jyxcblx0XHRcdFx0J1xcdCQwJyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZm9yICh2YXIgJHsxOmluZGV4fSA9IDA7ICR7MTppbmRleH0gPCAkezI6YXJyYXl9Lmxlbmd0aDsgJHsxOmluZGV4fSsrKSB7Jyxcblx0XHRcdFx0J1xcdHZhciAkezM6ZWxlbWVudH0gPSAkezI6YXJyYXl9WyR7MTppbmRleH1dOycsXG5cdFx0XHRcdCdcXHQkMCcsXG5cdFx0XHRcdCdcXFxcfSdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IGNob2ljZXM6IHVuYWJsZSB0byBlc2NhcGUgY29tbWEgYW5kIHBpcGUsICMzMTUyMScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRSZXdyaXRlKCdjb25zb2xlLmxvZygkezF8bm90XFxcXCwgbm90LCBmaXZlLCA1LCAxICAgMjN8fSk7JywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXp5IGJvZ291cyB2YXJpYWJsZSByZXdyaXRlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldChmYWxzZSwgWydmb29MYW5nJ10sICdmb28nLCAncHJlZml4JywgJ2Rlc2MnLCAnVGhpcyBpcyAke2JvZ291c30gYmVjYXVzZSBpdCBpcyBhICR7dmFyfScsICdzb3VyY2UnLCBTbmlwcGV0U291cmNlLkV4dGVuc2lvbiwgZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LmJvZHksICdUaGlzIGlzICR7Ym9nb3VzfSBiZWNhdXNlIGl0IGlzIGEgJHt2YXJ9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQuY29kZVNuaXBwZXQsICdUaGlzIGlzICR7MTpib2dvdXN9IGJlY2F1c2UgaXQgaXMgYSAkezI6dmFyfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LmlzQm9nb3VzLCB0cnVlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFNBQVMscUJBQXFCO0FBRXZDLE1BQU0sa0JBQWtCLFdBQVk7QUFFbkMsMENBQXdDO0FBRXhDLFdBQVMsY0FBYyxPQUFlLFVBQWtDO0FBQ3ZFLFVBQU0sU0FBUyxJQUFJLFFBQVEsT0FBTyxDQUFDLEtBQUssR0FBRyxPQUFPLE9BQU8sT0FBTyxPQUFPLE9BQU8sY0FBYyxNQUFNLGFBQWEsQ0FBQztBQUNoSCxRQUFJLE9BQU8sYUFBYSxXQUFXO0FBQ2xDLGFBQU8sWUFBWSxPQUFPLGFBQWEsS0FBSztBQUFBLElBQzdDLE9BQU87QUFDTixhQUFPLFlBQVksT0FBTyxhQUFhLFFBQVE7QUFBQSxJQUNoRDtBQUFBLEVBQ0Q7QUFFQSxPQUFLLDJCQUEyQixXQUFZO0FBRTNDLGtCQUFjLE9BQU8sS0FBSztBQUMxQixrQkFBYyxvQkFBb0IsS0FBSztBQUV2QyxrQkFBYyxpQkFBaUIsdUJBQXVCO0FBQ3RELGtCQUFjLDhCQUE4QixrQ0FBa0M7QUFHOUU7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNYO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxJQUNaO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0REFBNEQsV0FBWTtBQUM1RSxrQkFBYyxtREFBbUQsS0FBSztBQUFBLEVBQ3ZFLENBQUM7QUFFRCxPQUFLLGdDQUFnQyxXQUFZO0FBQ2hELFVBQU0sVUFBVSxJQUFJLFFBQVEsT0FBTyxDQUFDLFNBQVMsR0FBRyxPQUFPLFVBQVUsUUFBUSw0Q0FBNEMsVUFBVSxjQUFjLFdBQVcsYUFBYSxDQUFDO0FBQ3RLLFdBQU8sWUFBWSxRQUFRLE1BQU0sMENBQTBDO0FBQzNFLFdBQU8sWUFBWSxRQUFRLGFBQWEsOENBQThDO0FBQ3RGLFdBQU8sWUFBWSxRQUFRLFVBQVUsSUFBSTtBQUFBLEVBQzFDLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
