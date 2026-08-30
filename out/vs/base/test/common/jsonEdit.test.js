import assert from "assert";
import { removeProperty, setProperty } from "../../common/jsonEdit.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JSON - edits", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertEdit(content, edits, expected) {
    assert(edits);
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
  const formatterOptions = {
    insertSpaces: true,
    tabSize: 2,
    eol: "\n"
  };
  test("set property", () => {
    let content = '{\n  "x": "y"\n}';
    let edits = setProperty(content, ["x"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "bar"\n}');
    content = "true";
    edits = setProperty(content, [], "bar", formatterOptions);
    assertEdit(content, edits, '"bar"');
    content = '{\n  "x": "y"\n}';
    edits = setProperty(content, ["x"], { key: true }, formatterOptions);
    assertEdit(content, edits, '{\n  "x": {\n    "key": true\n  }\n}');
    content = '{\n  "a": "b",  "x": "y"\n}';
    edits = setProperty(content, ["a"], null, formatterOptions);
    assertEdit(content, edits, '{\n  "a": null,  "x": "y"\n}');
  });
  test("insert property", () => {
    let content = "{}";
    let edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": "bar"\n}');
    edits = setProperty(content, ["foo", "foo2"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": {\n    "foo2": "bar"\n  }\n}');
    content = "{\n}";
    edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": "bar"\n}');
    content = "  {\n  }";
    edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '  {\n    "foo": "bar"\n  }');
    content = '{\n  "x": "y"\n}';
    edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "y",\n  "foo": "bar"\n}');
    content = '{\n  "x": "y"\n}';
    edits = setProperty(content, ["e"], "null", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "y",\n  "e": "null"\n}');
    edits = setProperty(content, ["x"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "bar"\n}');
    content = '{\n  "x": {\n    "a": 1,\n    "b": true\n  }\n}\n';
    edits = setProperty(content, ["x"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "bar"\n}\n');
    edits = setProperty(content, ["x", "b"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": "bar"\n  }\n}\n');
    edits = setProperty(content, ["x", "c"], "bar", formatterOptions, () => 0);
    assertEdit(content, edits, '{\n  "x": {\n    "c": "bar",\n    "a": 1,\n    "b": true\n  }\n}\n');
    edits = setProperty(content, ["x", "c"], "bar", formatterOptions, () => 1);
    assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "c": "bar",\n    "b": true\n  }\n}\n');
    edits = setProperty(content, ["x", "c"], "bar", formatterOptions, () => 2);
    assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": true,\n    "c": "bar"\n  }\n}\n');
    edits = setProperty(content, ["c"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": true\n  },\n  "c": "bar"\n}\n');
    content = '{\n  "a": [\n    {\n    } \n  ]  \n}';
    edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "a": [\n    {\n    } \n  ],\n  "foo": "bar"\n}');
    content = "";
    edits = setProperty(content, ["foo", 0], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n}');
    content = "//comment";
    edits = setProperty(content, ["foo", 0], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n} //comment');
  });
  test("remove property", () => {
    let content = '{\n  "x": "y"\n}';
    let edits = removeProperty(content, ["x"], formatterOptions);
    assertEdit(content, edits, "{\n}");
    content = '{\n  "x": "y", "a": []\n}';
    edits = removeProperty(content, ["x"], formatterOptions);
    assertEdit(content, edits, '{\n  "a": []\n}');
    content = '{\n  "x": "y", "a": []\n}';
    edits = removeProperty(content, ["a"], formatterOptions);
    assertEdit(content, edits, '{\n  "x": "y"\n}');
  });
  test("insert item at 0", () => {
    const content = "[\n  2,\n  3\n]";
    const edits = setProperty(content, [0], 1, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  2,\n  3\n]");
  });
  test("insert item at 0 in empty array", () => {
    const content = "[\n]";
    const edits = setProperty(content, [0], 1, formatterOptions);
    assertEdit(content, edits, "[\n  1\n]");
  });
  test("insert item at an index", () => {
    const content = "[\n  1,\n  3\n]";
    const edits = setProperty(content, [1], 2, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  2,\n  3\n]");
  });
  test("insert item at an index im empty array", () => {
    const content = "[\n]";
    const edits = setProperty(content, [1], 1, formatterOptions);
    assertEdit(content, edits, "[\n  1\n]");
  });
  test("insert item at end index", () => {
    const content = "[\n  1,\n  2\n]";
    const edits = setProperty(content, [2], 3, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  2,\n  3\n]");
  });
  test("insert item at end to empty array", () => {
    const content = "[\n]";
    const edits = setProperty(content, [-1], "bar", formatterOptions);
    assertEdit(content, edits, '[\n  "bar"\n]');
  });
  test("insert item at end", () => {
    const content = "[\n  1,\n  2\n]";
    const edits = setProperty(content, [-1], "bar", formatterOptions);
    assertEdit(content, edits, '[\n  1,\n  2,\n  "bar"\n]');
  });
  test("remove item in array with one item", () => {
    const content = "[\n  1\n]";
    const edits = setProperty(content, [0], void 0, formatterOptions);
    assertEdit(content, edits, "[]");
  });
  test("remove item in the middle of the array", () => {
    const content = "[\n  1,\n  2,\n  3\n]";
    const edits = setProperty(content, [1], void 0, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  3\n]");
  });
  test("remove last item in the array", () => {
    const content = '[\n  1,\n  2,\n  "bar"\n]';
    const edits = setProperty(content, [2], void 0, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  2\n]");
  });
  test("remove last item in the array if ends with comma", () => {
    const content = '[\n  1,\n  "foo",\n  "bar",\n]';
    const edits = setProperty(content, [2], void 0, formatterOptions);
    assertEdit(content, edits, '[\n  1,\n  "foo"\n]');
  });
  test("remove last item in the array if there is a comment in the beginning", () => {
    const content = '// This is a comment\n[\n  1,\n  "foo",\n  "bar"\n]';
    const edits = setProperty(content, [2], void 0, formatterOptions);
    assertEdit(content, edits, '// This is a comment\n[\n  1,\n  "foo"\n]');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGpzb25FZGl0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcmVtb3ZlUHJvcGVydHksIHNldFByb3BlcnR5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2pzb25FZGl0LmpzJztcbmltcG9ydCB7IEVkaXQsIEZvcm1hdHRpbmdPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdKU09OIC0gZWRpdHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0RWRpdChjb250ZW50OiBzdHJpbmcsIGVkaXRzOiBFZGl0W10sIGV4cGVjdGVkOiBzdHJpbmcpIHtcblx0XHRhc3NlcnQoZWRpdHMpO1xuXHRcdGxldCBsYXN0RWRpdE9mZnNldCA9IGNvbnRlbnQubGVuZ3RoO1xuXHRcdGZvciAobGV0IGkgPSBlZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgZWRpdCA9IGVkaXRzW2ldO1xuXHRcdFx0YXNzZXJ0KGVkaXQub2Zmc2V0ID49IDAgJiYgZWRpdC5sZW5ndGggPj0gMCAmJiBlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoIDw9IGNvbnRlbnQubGVuZ3RoKTtcblx0XHRcdGFzc2VydCh0eXBlb2YgZWRpdC5jb250ZW50ID09PSAnc3RyaW5nJyk7XG5cdFx0XHRhc3NlcnQobGFzdEVkaXRPZmZzZXQgPj0gZWRpdC5vZmZzZXQgKyBlZGl0Lmxlbmd0aCk7IC8vIG1ha2Ugc3VyZSBhbGwgZWRpdHMgYXJlIG9yZGVyZWRcblx0XHRcdGxhc3RFZGl0T2Zmc2V0ID0gZWRpdC5vZmZzZXQ7XG5cdFx0XHRjb250ZW50ID0gY29udGVudC5zdWJzdHJpbmcoMCwgZWRpdC5vZmZzZXQpICsgZWRpdC5jb250ZW50ICsgY29udGVudC5zdWJzdHJpbmcoZWRpdC5vZmZzZXQgKyBlZGl0Lmxlbmd0aCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCBleHBlY3RlZCk7XG5cdH1cblxuXHRjb25zdCBmb3JtYXR0ZXJPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyA9IHtcblx0XHRpbnNlcnRTcGFjZXM6IHRydWUsXG5cdFx0dGFiU2l6ZTogMixcblx0XHRlb2w6ICdcXG4nXG5cdH07XG5cblx0dGVzdCgnc2V0IHByb3BlcnR5JywgKCkgPT4ge1xuXHRcdGxldCBjb250ZW50ID0gJ3tcXG4gIFwieFwiOiBcInlcIlxcbn0nO1xuXHRcdGxldCBlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsneCddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiBcImJhclwiXFxufScpO1xuXG5cdFx0Y29udGVudCA9ICd0cnVlJztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFtdLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ1wiYmFyXCInKTtcblxuXHRcdGNvbnRlbnQgPSAne1xcbiAgXCJ4XCI6IFwieVwiXFxufSc7XG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ3gnXSwgeyBrZXk6IHRydWUgfSwgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiB7XFxuICAgIFwia2V5XCI6IHRydWVcXG4gIH1cXG59Jyk7XG5cdFx0Y29udGVudCA9ICd7XFxuICBcImFcIjogXCJiXCIsICBcInhcIjogXCJ5XCJcXG59Jztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsnYSddLCBudWxsLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJhXCI6IG51bGwsICBcInhcIjogXCJ5XCJcXG59Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRsZXQgY29udGVudCA9ICd7fSc7XG5cdFx0bGV0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWydmb28nXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcImZvb1wiOiBcImJhclwiXFxufScpO1xuXG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ2ZvbycsICdmb28yJ10sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJmb29cIjoge1xcbiAgICBcImZvbzJcIjogXCJiYXJcIlxcbiAgfVxcbn0nKTtcblxuXHRcdGNvbnRlbnQgPSAne1xcbn0nO1xuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWydmb28nXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcImZvb1wiOiBcImJhclwiXFxufScpO1xuXG5cdFx0Y29udGVudCA9ICcgIHtcXG4gIH0nO1xuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWydmb28nXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICcgIHtcXG4gICAgXCJmb29cIjogXCJiYXJcIlxcbiAgfScpO1xuXG5cdFx0Y29udGVudCA9ICd7XFxuICBcInhcIjogXCJ5XCJcXG59Jztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsnZm9vJ10sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJ4XCI6IFwieVwiLFxcbiAgXCJmb29cIjogXCJiYXJcIlxcbn0nKTtcblxuXHRcdGNvbnRlbnQgPSAne1xcbiAgXCJ4XCI6IFwieVwiXFxufSc7XG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ2UnXSwgJ251bGwnLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJ4XCI6IFwieVwiLFxcbiAgXCJlXCI6IFwibnVsbFwiXFxufScpO1xuXG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ3gnXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcInhcIjogXCJiYXJcIlxcbn0nKTtcblxuXHRcdGNvbnRlbnQgPSAne1xcbiAgXCJ4XCI6IHtcXG4gICAgXCJhXCI6IDEsXFxuICAgIFwiYlwiOiB0cnVlXFxuICB9XFxufVxcbic7XG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ3gnXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcInhcIjogXCJiYXJcIlxcbn1cXG4nKTtcblxuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWyd4JywgJ2InXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcInhcIjoge1xcbiAgICBcImFcIjogMSxcXG4gICAgXCJiXCI6IFwiYmFyXCJcXG4gIH1cXG59XFxuJyk7XG5cblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsneCcsICdjJ10sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zLCAoKSA9PiAwKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJ4XCI6IHtcXG4gICAgXCJjXCI6IFwiYmFyXCIsXFxuICAgIFwiYVwiOiAxLFxcbiAgICBcImJcIjogdHJ1ZVxcbiAgfVxcbn1cXG4nKTtcblxuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWyd4JywgJ2MnXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMsICgpID0+IDEpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcInhcIjoge1xcbiAgICBcImFcIjogMSxcXG4gICAgXCJjXCI6IFwiYmFyXCIsXFxuICAgIFwiYlwiOiB0cnVlXFxuICB9XFxufVxcbicpO1xuXG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ3gnLCAnYyddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucywgKCkgPT4gMik7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiB7XFxuICAgIFwiYVwiOiAxLFxcbiAgICBcImJcIjogdHJ1ZSxcXG4gICAgXCJjXCI6IFwiYmFyXCJcXG4gIH1cXG59XFxuJyk7XG5cblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsnYyddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiB7XFxuICAgIFwiYVwiOiAxLFxcbiAgICBcImJcIjogdHJ1ZVxcbiAgfSxcXG4gIFwiY1wiOiBcImJhclwiXFxufVxcbicpO1xuXG5cdFx0Y29udGVudCA9ICd7XFxuICBcImFcIjogW1xcbiAgICB7XFxuICAgIH0gXFxuICBdICBcXG59Jztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsnZm9vJ10sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJhXCI6IFtcXG4gICAge1xcbiAgICB9IFxcbiAgXSxcXG4gIFwiZm9vXCI6IFwiYmFyXCJcXG59Jyk7XG5cblx0XHRjb250ZW50ID0gJyc7XG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ2ZvbycsIDBdLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwiZm9vXCI6IFtcXG4gICAgXCJiYXJcIlxcbiAgXVxcbn0nKTtcblxuXHRcdGNvbnRlbnQgPSAnLy9jb21tZW50Jztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsnZm9vJywgMF0sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJmb29cIjogW1xcbiAgICBcImJhclwiXFxuICBdXFxufSAvL2NvbW1lbnQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlIHByb3BlcnR5JywgKCkgPT4ge1xuXHRcdGxldCBjb250ZW50ID0gJ3tcXG4gIFwieFwiOiBcInlcIlxcbn0nO1xuXHRcdGxldCBlZGl0cyA9IHJlbW92ZVByb3BlcnR5KGNvbnRlbnQsIFsneCddLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbn0nKTtcblxuXHRcdGNvbnRlbnQgPSAne1xcbiAgXCJ4XCI6IFwieVwiLCBcImFcIjogW11cXG59Jztcblx0XHRlZGl0cyA9IHJlbW92ZVByb3BlcnR5KGNvbnRlbnQsIFsneCddLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJhXCI6IFtdXFxufScpO1xuXG5cdFx0Y29udGVudCA9ICd7XFxuICBcInhcIjogXCJ5XCIsIFwiYVwiOiBbXVxcbn0nO1xuXHRcdGVkaXRzID0gcmVtb3ZlUHJvcGVydHkoY29udGVudCwgWydhJ10sIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcInhcIjogXCJ5XCJcXG59Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCBpdGVtIGF0IDAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdbXFxuICAyLFxcbiAgM1xcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzBdLCAxLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnW1xcbiAgMSxcXG4gIDIsXFxuICAzXFxuXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgaXRlbSBhdCAwIGluIGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnW1xcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzBdLCAxLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnW1xcbiAgMVxcbl0nKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IGl0ZW0gYXQgYW4gaW5kZXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdbXFxuICAxLFxcbiAgM1xcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzFdLCAyLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnW1xcbiAgMSxcXG4gIDIsXFxuICAzXFxuXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgaXRlbSBhdCBhbiBpbmRleCBpbSBlbXB0eSBhcnJheScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1tcXG5dJztcblx0XHRjb25zdCBlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsxXSwgMSwgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ1tcXG4gIDFcXG5dJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCBpdGVtIGF0IGVuZCBpbmRleCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1tcXG4gIDEsXFxuICAyXFxuXSc7XG5cdFx0Y29uc3QgZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbMl0sIDMsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICAxLFxcbiAgMixcXG4gIDNcXG5dJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCBpdGVtIGF0IGVuZCB0byBlbXB0eSBhcnJheScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1tcXG5dJztcblx0XHRjb25zdCBlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFstMV0sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnW1xcbiAgXCJiYXJcIlxcbl0nKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IGl0ZW0gYXQgZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnW1xcbiAgMSxcXG4gIDJcXG5dJztcblx0XHRjb25zdCBlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFstMV0sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnW1xcbiAgMSxcXG4gIDIsXFxuICBcImJhclwiXFxuXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmUgaXRlbSBpbiBhcnJheSB3aXRoIG9uZSBpdGVtJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnW1xcbiAgMVxcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzBdLCB1bmRlZmluZWQsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmUgaXRlbSBpbiB0aGUgbWlkZGxlIG9mIHRoZSBhcnJheScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1tcXG4gIDEsXFxuICAyLFxcbiAgM1xcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzFdLCB1bmRlZmluZWQsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICAxLFxcbiAgM1xcbl0nKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlIGxhc3QgaXRlbSBpbiB0aGUgYXJyYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdbXFxuICAxLFxcbiAgMixcXG4gIFwiYmFyXCJcXG5dJztcblx0XHRjb25zdCBlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsyXSwgdW5kZWZpbmVkLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnW1xcbiAgMSxcXG4gIDJcXG5dJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZSBsYXN0IGl0ZW0gaW4gdGhlIGFycmF5IGlmIGVuZHMgd2l0aCBjb21tYScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1tcXG4gIDEsXFxuICBcImZvb1wiLFxcbiAgXCJiYXJcIixcXG5dJztcblx0XHRjb25zdCBlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsyXSwgdW5kZWZpbmVkLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnW1xcbiAgMSxcXG4gIFwiZm9vXCJcXG5dJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZSBsYXN0IGl0ZW0gaW4gdGhlIGFycmF5IGlmIHRoZXJlIGlzIGEgY29tbWVudCBpbiB0aGUgYmVnaW5uaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnLy8gVGhpcyBpcyBhIGNvbW1lbnRcXG5bXFxuICAxLFxcbiAgXCJmb29cIixcXG4gIFwiYmFyXCJcXG5dJztcblx0XHRjb25zdCBlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsyXSwgdW5kZWZpbmVkLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnLy8gVGhpcyBpcyBhIGNvbW1lbnRcXG5bXFxuICAxLFxcbiAgXCJmb29cIlxcbl0nKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCLG1CQUFtQjtBQUU1QyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGdCQUFnQixNQUFNO0FBRTNCLDBDQUF3QztBQUV4QyxXQUFTLFdBQVcsU0FBaUIsT0FBZSxVQUFrQjtBQUNyRSxXQUFPLEtBQUs7QUFDWixRQUFJLGlCQUFpQixRQUFRO0FBQzdCLGFBQVMsSUFBSSxNQUFNLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUMzQyxZQUFNLE9BQU8sTUFB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
