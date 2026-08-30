import assert from "assert";
import { HistoryNavigator, HistoryNavigator2 } from "../../common/history.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("History Navigator", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("create reduces the input to limit", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 2);
    assert.deepStrictEqual(["3", "4"], toArray(testObject));
  });
  test("create sets the position after last", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 100);
    assert.strictEqual(testObject.current(), null);
    assert.strictEqual(testObject.isNowhere(), true);
    assert.strictEqual(testObject.isFirst(), false);
    assert.strictEqual(testObject.isLast(), false);
    assert.strictEqual(testObject.next(), null);
    assert.strictEqual(testObject.previous(), "4");
    assert.strictEqual(testObject.isNowhere(), false);
    assert.strictEqual(testObject.isFirst(), false);
    assert.strictEqual(testObject.isLast(), true);
  });
  test("last returns last element", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 100);
    assert.strictEqual(testObject.first(), "1");
    assert.strictEqual(testObject.last(), "4");
    assert.strictEqual(testObject.isFirst(), false);
    assert.strictEqual(testObject.isLast(), true);
  });
  test("first returns first element", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    assert.strictEqual("2", testObject.first());
    assert.strictEqual(testObject.isFirst(), true);
    assert.strictEqual(testObject.isLast(), false);
  });
  test("next returns next element", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    testObject.first();
    assert.strictEqual(testObject.next(), "3");
    assert.strictEqual(testObject.next(), "4");
    assert.strictEqual(testObject.next(), null);
  });
  test("previous returns previous element", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    assert.strictEqual(testObject.previous(), "4");
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "2");
    assert.strictEqual(testObject.previous(), null);
  });
  test("next on last element returns null and remains on last", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    testObject.first();
    testObject.last();
    assert.strictEqual(testObject.isLast(), true);
    assert.strictEqual(testObject.current(), "4");
    assert.strictEqual(testObject.next(), null);
    assert.strictEqual(testObject.isLast(), false);
  });
  test("previous on first element returns null and remains on first", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    testObject.first();
    assert.strictEqual(testObject.isFirst(), true);
    assert.strictEqual(testObject.current(), "2");
    assert.strictEqual(testObject.previous(), null);
    assert.strictEqual(testObject.isFirst(), true);
  });
  test("add reduces the input to limit", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 2);
    testObject.add("5");
    assert.deepStrictEqual(toArray(testObject), ["4", "5"]);
  });
  test("adding existing element changes the position", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 5);
    testObject.add("2");
    assert.deepStrictEqual(toArray(testObject), ["1", "3", "4", "2"]);
  });
  test("add resets the navigator to last", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    testObject.first();
    testObject.add("5");
    assert.strictEqual(testObject.previous(), "5");
    assert.strictEqual(testObject.isLast(), true);
    assert.strictEqual(testObject.next(), null);
    assert.strictEqual(testObject.isLast(), false);
  });
  test("adding an existing item changes the order", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.add("1");
    assert.deepStrictEqual(["2", "3", "1"], toArray(testObject));
  });
  test("previous returns null if the current position is the first one", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.first();
    assert.deepStrictEqual(testObject.previous(), null);
    assert.strictEqual(testObject.isFirst(), true);
  });
  test("previous returns object if the current position is not the first one", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.first();
    testObject.next();
    assert.deepStrictEqual(testObject.previous(), "1");
  });
  test("next returns null if the current position is the last one", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.last();
    assert.strictEqual(testObject.isLast(), true);
    assert.deepStrictEqual(testObject.next(), null);
    assert.strictEqual(testObject.isLast(), false);
  });
  test("next returns object if the current position is not the last one", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.last();
    testObject.previous();
    assert.deepStrictEqual(testObject.next(), "3");
  });
  test("clear", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["a", "b", "c"]));
    assert.strictEqual(testObject.previous(), "c");
    testObject.clear();
    assert.strictEqual(testObject.current(), null);
    assert.strictEqual(testObject.isNowhere(), true);
  });
  function toArray(historyNavigator) {
    const result = [];
    historyNavigator.first();
    if (historyNavigator.current()) {
      do {
        result.push(historyNavigator.current());
      } while (historyNavigator.next());
    }
    return result;
  }
});
suite("History Navigator 2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("constructor", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    assert.strictEqual(testObject.current(), "4");
    assert.strictEqual(testObject.isAtEnd(), true);
  });
  test("constructor - initial history is not empty", () => {
    assert.throws(() => new HistoryNavigator2([]));
  });
  test("constructor - capacity limit", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"], 3);
    assert.strictEqual(testObject.current(), "4");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.has("1"), false);
  });
  test("constructor - duplicate values", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4", "3", "2", "1"]);
    assert.strictEqual(testObject.current(), "1");
    assert.strictEqual(testObject.isAtEnd(), true);
  });
  test("navigation", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    assert.strictEqual(testObject.current(), "4");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.next(), "4");
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "2");
    assert.strictEqual(testObject.previous(), "1");
    assert.strictEqual(testObject.previous(), "1");
    assert.strictEqual(testObject.current(), "1");
    assert.strictEqual(testObject.next(), "2");
    assert.strictEqual(testObject.resetCursor(), "4");
  });
  test("add", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    testObject.add("5");
    assert.strictEqual(testObject.current(), "5");
    assert.strictEqual(testObject.isAtEnd(), true);
  });
  test("add - existing value", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    testObject.add("2");
    assert.strictEqual(testObject.current(), "2");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.previous(), "4");
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "1");
  });
  test("replaceLast", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    testObject.replaceLast("5");
    assert.strictEqual(testObject.current(), "5");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.has("4"), false);
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "2");
    assert.strictEqual(testObject.previous(), "1");
  });
  test("replaceLast - existing value", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    testObject.replaceLast("2");
    assert.strictEqual(testObject.current(), "2");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.has("4"), false);
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "1");
  });
  test("prepend", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    assert.strictEqual(testObject.current(), "4");
    assert.ok(testObject.isAtEnd());
    assert.deepStrictEqual(Array.from(testObject), ["1", "2", "3", "4"]);
    testObject.prepend("0");
    assert.strictEqual(testObject.current(), "4");
    assert.ok(testObject.isAtEnd());
    assert.deepStrictEqual(Array.from(testObject), ["0", "1", "2", "3", "4"]);
    testObject.prepend("2");
    assert.strictEqual(testObject.current(), "4");
    assert.ok(testObject.isAtEnd());
    assert.deepStrictEqual(Array.from(testObject), ["0", "1", "2", "3", "4"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGhpc3RvcnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBIaXN0b3J5TmF2aWdhdG9yLCBIaXN0b3J5TmF2aWdhdG9yMiB9IGZyb20gJy4uLy4uL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnSGlzdG9yeSBOYXZpZ2F0b3InLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3JlYXRlIHJlZHVjZXMgdGhlIGlucHV0IHRvIGxpbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnLCAnNCddKSwgMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsnMycsICc0J10sIHRvQXJyYXkodGVzdE9iamVjdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgc2V0cyB0aGUgcG9zaXRpb24gYWZ0ZXIgbGFzdCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJywgJzQnXSksIDEwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTm93aGVyZSgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0ZpcnN0KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0xhc3QoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0Lm5leHQoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc05vd2hlcmUoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzRmlyc3QoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdCByZXR1cm5zIGxhc3QgZWxlbWVudCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJywgJzQnXSksIDEwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5maXJzdCgpLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0Lmxhc3QoKSwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0ZpcnN0KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0xhc3QoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHJldHVybnMgZmlyc3QgZWxlbWVudCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJywgJzQnXSksIDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCcyJywgdGVzdE9iamVjdC5maXJzdCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0ZpcnN0KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25leHQgcmV0dXJucyBuZXh0IGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMycsICc0J10pLCAzKTtcblxuXHRcdHRlc3RPYmplY3QuZmlyc3QoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0Lm5leHQoKSwgJzMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5uZXh0KCksICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QubmV4dCgpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgncHJldmlvdXMgcmV0dXJucyBwcmV2aW91cyBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnLCAnNCddKSwgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICczJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbmV4dCBvbiBsYXN0IGVsZW1lbnQgcmV0dXJucyBudWxsIGFuZCByZW1haW5zIG9uIGxhc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMycsICc0J10pLCAzKTtcblxuXHRcdHRlc3RPYmplY3QuZmlyc3QoKTtcblx0XHR0ZXN0T2JqZWN0Lmxhc3QoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QubmV4dCgpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0xhc3QoKSwgZmFsc2UpOyAvLyBTdGVwcGluZyBwYXN0IHRoZSBsYXN0IGVsZW1lbnQsIGlzIG5vIGxvbmdlciBcImxhc3RcIlxuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aW91cyBvbiBmaXJzdCBlbGVtZW50IHJldHVybnMgbnVsbCBhbmQgcmVtYWlucyBvbiBmaXJzdCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJywgJzQnXSksIDMpO1xuXG5cdFx0dGVzdE9iamVjdC5maXJzdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNGaXJzdCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNGaXJzdCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkIHJlZHVjZXMgdGhlIGlucHV0IHRvIGxpbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnLCAnNCddKSwgMik7XG5cblx0XHR0ZXN0T2JqZWN0LmFkZCgnNScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KHRlc3RPYmplY3QpLCBbJzQnLCAnNSddKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkaW5nIGV4aXN0aW5nIGVsZW1lbnQgY2hhbmdlcyB0aGUgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMycsICc0J10pLCA1KTtcblxuXHRcdHRlc3RPYmplY3QuYWRkKCcyJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkodGVzdE9iamVjdCksIFsnMScsICczJywgJzQnLCAnMiddKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkIHJlc2V0cyB0aGUgbmF2aWdhdG9yIHRvIGxhc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMycsICc0J10pLCAzKTtcblxuXHRcdHRlc3RPYmplY3QuZmlyc3QoKTtcblx0XHR0ZXN0T2JqZWN0LmFkZCgnNScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0xhc3QoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QubmV4dCgpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0xhc3QoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRpbmcgYW4gZXhpc3RpbmcgaXRlbSBjaGFuZ2VzIHRoZSBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJ10pKTtcblxuXHRcdHRlc3RPYmplY3QuYWRkKCcxJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsnMicsICczJywgJzEnXSwgdG9BcnJheSh0ZXN0T2JqZWN0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXZpb3VzIHJldHVybnMgbnVsbCBpZiB0aGUgY3VycmVudCBwb3NpdGlvbiBpcyB0aGUgZmlyc3Qgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnXSkpO1xuXG5cdFx0dGVzdE9iamVjdC5maXJzdCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzRmlyc3QoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXZpb3VzIHJldHVybnMgb2JqZWN0IGlmIHRoZSBjdXJyZW50IHBvc2l0aW9uIGlzIG5vdCB0aGUgZmlyc3Qgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnXSkpO1xuXG5cdFx0dGVzdE9iamVjdC5maXJzdCgpO1xuXHRcdHRlc3RPYmplY3QubmV4dCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICcxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25leHQgcmV0dXJucyBudWxsIGlmIHRoZSBjdXJyZW50IHBvc2l0aW9uIGlzIHRoZSBsYXN0IG9uZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJ10pKTtcblxuXHRcdHRlc3RPYmplY3QubGFzdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNMYXN0KCksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5uZXh0KCksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25leHQgcmV0dXJucyBvYmplY3QgaWYgdGhlIGN1cnJlbnQgcG9zaXRpb24gaXMgbm90IHRoZSBsYXN0IG9uZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJ10pKTtcblxuXHRcdHRlc3RPYmplY3QubGFzdCgpO1xuXHRcdHRlc3RPYmplY3QucHJldmlvdXMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5uZXh0KCksICczJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnYScsICdiJywgJ2MnXSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICdjJyk7XG5cdFx0dGVzdE9iamVjdC5jbGVhcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNOb3doZXJlKCksIHRydWUpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0b0FycmF5KGhpc3RvcnlOYXZpZ2F0b3I6IEhpc3RvcnlOYXZpZ2F0b3I8c3RyaW5nPik6IEFycmF5PHN0cmluZyB8IG51bGw+IHtcblx0XHRjb25zdCByZXN1bHQ6IEFycmF5PHN0cmluZyB8IG51bGw+ID0gW107XG5cdFx0aGlzdG9yeU5hdmlnYXRvci5maXJzdCgpO1xuXHRcdGlmIChoaXN0b3J5TmF2aWdhdG9yLmN1cnJlbnQoKSkge1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRyZXN1bHQucHVzaChoaXN0b3J5TmF2aWdhdG9yLmN1cnJlbnQoKSEpO1xuXHRcdFx0fSB3aGlsZSAoaGlzdG9yeU5hdmlnYXRvci5uZXh0KCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59KTtcblxuc3VpdGUoJ0hpc3RvcnkgTmF2aWdhdG9yIDInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY29uc3RydWN0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yMihbJzEnLCAnMicsICczJywgJzQnXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNBdEVuZCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3RydWN0b3IgLSBpbml0aWFsIGhpc3RvcnkgaXMgbm90IGVtcHR5JywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFtdKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN0cnVjdG9yIC0gY2FwYWNpdHkgbGltaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yMihbJzEnLCAnMicsICczJywgJzQnXSwgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNBdEVuZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5oYXMoJzEnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdHJ1Y3RvciAtIGR1cGxpY2F0ZSB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yMihbJzEnLCAnMicsICczJywgJzQnLCAnMycsICcyJywgJzEnXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNBdEVuZCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbmF2aWdhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFsnMScsICcyJywgJzMnLCAnNCddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0F0RW5kKCksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QubmV4dCgpLCAnNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICczJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICcxJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QubmV4dCgpLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnJlc2V0Q3Vyc29yKCksICc0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFsnMScsICcyJywgJzMnLCAnNCddKTtcblx0XHR0ZXN0T2JqZWN0LmFkZCgnNScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY3VycmVudCgpLCAnNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzQXRFbmQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZCAtIGV4aXN0aW5nIHZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoWycxJywgJzInLCAnMycsICc0J10pO1xuXHRcdHRlc3RPYmplY3QuYWRkKCcyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNBdEVuZCgpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlTGFzdCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFsnMScsICcyJywgJzMnLCAnNCddKTtcblx0XHR0ZXN0T2JqZWN0LnJlcGxhY2VMYXN0KCc1Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICc1Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNBdEVuZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5oYXMoJzQnKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICcxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VMYXN0IC0gZXhpc3RpbmcgdmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yMihbJzEnLCAnMicsICczJywgJzQnXSk7XG5cdFx0dGVzdE9iamVjdC5yZXBsYWNlTGFzdCgnMicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY3VycmVudCgpLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzQXRFbmQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaGFzKCc0JyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICczJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzEnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlcGVuZCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFsnMScsICcyJywgJzMnLCAnNCddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICc0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRlc3RPYmplY3QuaXNBdEVuZCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20odGVzdE9iamVjdCksIFsnMScsICcyJywgJzMnLCAnNCddKTtcblxuXHRcdHRlc3RPYmplY3QucHJlcGVuZCgnMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzQnKTtcblx0XHRhc3NlcnQub2sodGVzdE9iamVjdC5pc0F0RW5kKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbSh0ZXN0T2JqZWN0KSwgWycwJywgJzEnLCAnMicsICczJywgJzQnXSk7XG5cblx0XHR0ZXN0T2JqZWN0LnByZXBlbmQoJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICc0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRlc3RPYmplY3QuaXNBdEVuZCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20odGVzdE9iamVjdCksIFsnMCcsICcxJywgJzInLCAnMycsICc0J10pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0IseUJBQXlCO0FBQ3BELFNBQVMsK0NBQStDO0FBRXhELE1BQU0scUJBQXFCLE1BQU07QUFFaEMsMENBQXdDO0FBRXhDLE9BQUsscUNBQXFDLE1BQU07QUFDL0MsVUFBTSxhQUFhLElBQUksaUJBQWlCLG9CQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDO0FB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
