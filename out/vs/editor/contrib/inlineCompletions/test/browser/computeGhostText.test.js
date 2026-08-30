import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Range } from "../../../../common/core/range.js";
import { TextReplacement } from "../../../../common/core/edits/textEdit.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { computeGhostText } from "../../browser/model/computeGhostText.js";
suite("computeGhostText", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function getOutput(text, suggestion) {
    const rangeStartOffset = text.indexOf("[");
    const rangeEndOffset = text.indexOf("]") - 1;
    const cleanedText = text.replace("[", "").replace("]", "");
    const tempModel = createTextModel(cleanedText);
    const range = Range.fromPositions(tempModel.getPositionAt(rangeStartOffset), tempModel.getPositionAt(rangeEndOffset));
    const options = ["prefix", "subword"];
    const result = {};
    for (const option of options) {
      result[option] = computeGhostText(new TextReplacement(range, suggestion), tempModel, option)?.render(cleanedText, true);
    }
    tempModel.dispose();
    if (new Set(Object.values(result)).size === 1) {
      return Object.values(result)[0];
    }
    return result;
  }
  test("Basic", () => {
    assert.deepStrictEqual(getOutput("[foo]baz", "foobar"), "foo[bar]baz");
    assert.deepStrictEqual(getOutput("[aaa]aaa", "aaaaaa"), "aaa[aaa]aaa");
    assert.deepStrictEqual(getOutput("[foo]baz", "boobar"), void 0);
    assert.deepStrictEqual(getOutput("[foo]foo", "foofoo"), "foo[foo]foo");
    assert.deepStrictEqual(getOutput("foo[]", "bar\nhello"), "foo[bar\nhello]");
  });
  test("Empty ghost text", () => {
    assert.deepStrictEqual(getOutput("[foo]", "foo"), "foo");
  });
  test("Whitespace (indentation)", () => {
    assert.deepStrictEqual(getOutput("[ foo]", "foobar"), " foo[bar]");
    assert.deepStrictEqual(getOutput("[	foo]", "foobar"), "	foo[bar]");
    assert.deepStrictEqual(getOutput("[	 foo]", "	foobar"), "	 foo[bar]");
    assert.deepStrictEqual(getOutput("[	foo]", "		foobar"), { prefix: void 0, subword: "	[	]foo[bar]" });
    assert.deepStrictEqual(getOutput("[	]", "		foobar"), "	[	foobar]");
    assert.deepStrictEqual(getOutput("	[]", "	"), "	[	]");
    assert.deepStrictEqual(getOutput("	[	]", ""), "		");
    assert.deepStrictEqual(getOutput("[ ]", "return 1"), " [return 1]");
  });
  test("Whitespace (outside of indentation)", () => {
    assert.deepStrictEqual(getOutput("bar[ foo]", "foobar"), void 0);
    assert.deepStrictEqual(getOutput("bar[	foo]", "foobar"), void 0);
  });
  test("Unsupported Case", () => {
    assert.deepStrictEqual(getOutput("fo[o\n]", "x\nbar"), void 0);
  });
  test("New Line", () => {
    assert.deepStrictEqual(getOutput("fo[o\n]", "o\nbar"), "foo\n[bar]");
  });
  test("Multi Part Diffing", () => {
    assert.deepStrictEqual(getOutput("foo[()]", "(x);"), { prefix: void 0, subword: "foo([x])[;]" });
    assert.deepStrictEqual(getOutput("[	foo]", "		foobar"), { prefix: void 0, subword: "	[	]foo[bar]" });
    assert.deepStrictEqual(getOutput("[(y ===)]", "(y === 1) { f(); }"), { prefix: void 0, subword: "(y ===[ 1])[ { f(); }]" });
    assert.deepStrictEqual(getOutput("[(y ==)]", "(y === 1) { f(); }"), { prefix: void 0, subword: "(y ==[= 1])[ { f(); }]" });
    assert.deepStrictEqual(getOutput("[(y ==)]", "(y === 1) { f(); }"), { prefix: void 0, subword: "(y ==[= 1])[ { f(); }]" });
  });
  test("Multi Part Diffing 1", () => {
    assert.deepStrictEqual(getOutput("[if () ()]", "if (1 == f()) ()"), { prefix: void 0, subword: "if ([1 == f()]) ()" });
  });
  test("Multi Part Diffing 2", () => {
    assert.deepStrictEqual(getOutput("[)]", "())"), { prefix: void 0, subword: "[(])[)]" });
    assert.deepStrictEqual(getOutput("[))]", "(())"), { prefix: void 0, subword: "[((]))" });
  });
  test("Parenthesis Matching", () => {
    assert.deepStrictEqual(getOutput("[console.log()]", 'console.log({ label: "(" })'), {
      prefix: void 0,
      subword: 'console.log([{ label: "(" }])'
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFx0ZXN0XFxicm93c2VyXFxjb21wdXRlR2hvc3RUZXh0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGV4dFJlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBjb21wdXRlR2hvc3RUZXh0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tb2RlbC9jb21wdXRlR2hvc3RUZXh0LmpzJztcblxuc3VpdGUoJ2NvbXB1dGVHaG9zdFRleHQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGdldE91dHB1dCh0ZXh0OiBzdHJpbmcsIHN1Z2dlc3Rpb246IHN0cmluZyk6IHVua25vd24ge1xuXHRcdGNvbnN0IHJhbmdlU3RhcnRPZmZzZXQgPSB0ZXh0LmluZGV4T2YoJ1snKTtcblx0XHRjb25zdCByYW5nZUVuZE9mZnNldCA9IHRleHQuaW5kZXhPZignXScpIC0gMTtcblx0XHRjb25zdCBjbGVhbmVkVGV4dCA9IHRleHQucmVwbGFjZSgnWycsICcnKS5yZXBsYWNlKCddJywgJycpO1xuXHRcdGNvbnN0IHRlbXBNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChjbGVhbmVkVGV4dCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHRlbXBNb2RlbC5nZXRQb3NpdGlvbkF0KHJhbmdlU3RhcnRPZmZzZXQpLCB0ZW1wTW9kZWwuZ2V0UG9zaXRpb25BdChyYW5nZUVuZE9mZnNldCkpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBbJ3ByZWZpeCcsICdzdWJ3b3JkJ10gYXMgY29uc3Q7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgcmVzdWx0ID0ge30gYXMgYW55O1xuXHRcdGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcblx0XHRcdHJlc3VsdFtvcHRpb25dID0gY29tcHV0ZUdob3N0VGV4dChuZXcgVGV4dFJlcGxhY2VtZW50KHJhbmdlLCBzdWdnZXN0aW9uKSwgdGVtcE1vZGVsLCBvcHRpb24pPy5yZW5kZXIoY2xlYW5lZFRleHQsIHRydWUpO1xuXHRcdH1cblxuXHRcdHRlbXBNb2RlbC5kaXNwb3NlKCk7XG5cblx0XHRpZiAobmV3IFNldChPYmplY3QudmFsdWVzKHJlc3VsdCkpLnNpemUgPT09IDEpIHtcblx0XHRcdHJldHVybiBPYmplY3QudmFsdWVzKHJlc3VsdClbMF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHRlc3QoJ0Jhc2ljJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbZm9vXWJheicsICdmb29iYXInKSwgJ2Zvb1tiYXJdYmF6Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRPdXRwdXQoJ1thYWFdYWFhJywgJ2FhYWFhYScpLCAnYWFhW2FhYV1hYWEnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnW2Zvb11iYXonLCAnYm9vYmFyJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRPdXRwdXQoJ1tmb29dZm9vJywgJ2Zvb2ZvbycpLCAnZm9vW2Zvb11mb28nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnZm9vW10nLCAnYmFyXFxuaGVsbG8nKSwgJ2Zvb1tiYXJcXG5oZWxsb10nKTtcblx0fSk7XG5cblx0dGVzdCgnRW1wdHkgZ2hvc3QgdGV4dCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnW2Zvb10nLCAnZm9vJyksICdmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnV2hpdGVzcGFjZSAoaW5kZW50YXRpb24pJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbIGZvb10nLCAnZm9vYmFyJyksICcgZm9vW2Jhcl0nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnW1xcdGZvb10nLCAnZm9vYmFyJyksICdcXHRmb29bYmFyXScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbXFx0IGZvb10nLCAnXFx0Zm9vYmFyJyksICdcdCBmb29bYmFyXScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbXFx0Zm9vXScsICdcXHRcXHRmb29iYXInKSwgeyBwcmVmaXg6IHVuZGVmaW5lZCwgc3Vid29yZDogJ1xcdFtcXHRdZm9vW2Jhcl0nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbXFx0XScsICdcXHRcXHRmb29iYXInKSwgJ1xcdFtcXHRmb29iYXJdJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRPdXRwdXQoJ1xcdFtdJywgJ1xcdCcpLCAnXFx0W1xcdF0nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnXFx0W1xcdF0nLCAnJyksICdcXHRcXHQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbIF0nLCAncmV0dXJuIDEnKSwgJyBbcmV0dXJuIDFdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1doaXRlc3BhY2UgKG91dHNpZGUgb2YgaW5kZW50YXRpb24pJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdiYXJbIGZvb10nLCAnZm9vYmFyJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRPdXRwdXQoJ2JhcltcXHRmb29dJywgJ2Zvb2JhcicpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdVbnN1cHBvcnRlZCBDYXNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdmb1tvXFxuXScsICd4XFxuYmFyJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ05ldyBMaW5lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdmb1tvXFxuXScsICdvXFxuYmFyJyksICdmb29cXG5bYmFyXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aSBQYXJ0IERpZmZpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRPdXRwdXQoJ2Zvb1soKV0nLCAnKHgpOycpLCB7IHByZWZpeDogdW5kZWZpbmVkLCBzdWJ3b3JkOiAnZm9vKFt4XSlbO10nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbXFx0Zm9vXScsICdcXHRcXHRmb29iYXInKSwgeyBwcmVmaXg6IHVuZGVmaW5lZCwgc3Vid29yZDogJ1xcdFtcXHRdZm9vW2Jhcl0nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbKHkgPT09KV0nLCAnKHkgPT09IDEpIHsgZigpOyB9JyksIHsgcHJlZml4OiB1bmRlZmluZWQsIHN1YndvcmQ6ICcoeSA9PT1bIDFdKVsgeyBmKCk7IH1dJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnWyh5ID09KV0nLCAnKHkgPT09IDEpIHsgZigpOyB9JyksIHsgcHJlZml4OiB1bmRlZmluZWQsIHN1YndvcmQ6ICcoeSA9PVs9IDFdKVsgeyBmKCk7IH1dJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbKHkgPT0pXScsICcoeSA9PT0gMSkgeyBmKCk7IH0nKSwgeyBwcmVmaXg6IHVuZGVmaW5lZCwgc3Vid29yZDogJyh5ID09Wz0gMV0pWyB7IGYoKTsgfV0nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aSBQYXJ0IERpZmZpbmcgMScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnW2lmICgpICgpXScsICdpZiAoMSA9PSBmKCkpICgpJyksIHsgcHJlZml4OiB1bmRlZmluZWQsIHN1YndvcmQ6ICdpZiAoWzEgPT0gZigpXSkgKCknIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aSBQYXJ0IERpZmZpbmcgMicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnWyldJywgJygpKScpLCAoeyBwcmVmaXg6IHVuZGVmaW5lZCwgc3Vid29yZDogJ1soXSlbKV0nIH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE91dHB1dCgnWykpXScsICcoKCkpJyksICh7IHByZWZpeDogdW5kZWZpbmVkLCBzdWJ3b3JkOiAnWygoXSkpJyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BhcmVudGhlc2lzIE1hdGNoaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0T3V0cHV0KCdbY29uc29sZS5sb2coKV0nLCAnY29uc29sZS5sb2coeyBsYWJlbDogXCIoXCIgfSknKSwge1xuXHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRzdWJ3b3JkOiAnY29uc29sZS5sb2coW3sgbGFiZWw6IFwiKFwiIH1dKSdcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxvQkFBb0IsTUFBTTtBQUMvQiwwQ0FBd0M7QUFFeEMsV0FBUyxVQUFVLE1BQWMsWUFBNkI7QUFDN0QsVUFBTSxtQkFBbUIsS0FBSyxRQUFRLEdBQUc7QUFDekMsVUFBTSxpQkFBaUIsS0FBSyxRQUFRLEdBQUcsSUFBSTtBQUMzQyxVQUFNLGNBQWMsS0FBSyxRQUFRLEtBQUssRUFBRSxFQUFFLFFBQVEsS0FBSyxFQUFFO0FBQ3pELFVBQU0sWUFBWSxnQkFBZ0IsV0FBVztBQUM3QyxVQUFNLFFBQVEsTUFBTSxjQUFjLFVBQVUsY0FBYyxnQkFBZ0IsR0FBRyxVQUFVLGNBQWMsY0FBYyxDQUFDO0FBQ3BILFVBQU0sVUFBVSxDQUFDLFVBQVUsU0FBUztBQUVwQyxVQUFNLFNBQVMsQ0FBQztBQUNoQixlQUFX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
