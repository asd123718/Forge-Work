import assert from "assert";
import { consolidate, groupIntersect, RangeMap } from "../../../../browser/ui/list/rangeMap.js";
import { Range } from "../../../../common/range.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
suite("RangeMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("intersection", () => {
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 0 }, { start: 0, end: 0 }), { start: 0, end: 0 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 0 }, { start: 5, end: 5 }), { start: 0, end: 0 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 1 }, { start: 5, end: 6 }), { start: 0, end: 0 });
    assert.deepStrictEqual(Range.intersect({ start: 5, end: 6 }, { start: 0, end: 1 }), { start: 0, end: 0 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 5 }, { start: 2, end: 2 }), { start: 0, end: 0 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 1 }, { start: 0, end: 1 }), { start: 0, end: 1 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 10 }, { start: 0, end: 5 }), { start: 0, end: 5 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 5 }, { start: 0, end: 10 }), { start: 0, end: 5 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 10 }, { start: 5, end: 10 }), { start: 5, end: 10 });
    assert.deepStrictEqual(Range.intersect({ start: 5, end: 10 }, { start: 0, end: 10 }), { start: 5, end: 10 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 10 }, { start: 2, end: 8 }), { start: 2, end: 8 });
    assert.deepStrictEqual(Range.intersect({ start: 2, end: 8 }, { start: 0, end: 10 }), { start: 2, end: 8 });
    assert.deepStrictEqual(Range.intersect({ start: 0, end: 10 }, { start: 5, end: 15 }), { start: 5, end: 10 });
    assert.deepStrictEqual(Range.intersect({ start: 5, end: 15 }, { start: 0, end: 10 }), { start: 5, end: 10 });
  });
  test("multiIntersect", () => {
    assert.deepStrictEqual(
      groupIntersect(
        { start: 0, end: 0 },
        [{ range: { start: 0, end: 10 }, size: 1 }]
      ),
      []
    );
    assert.deepStrictEqual(
      groupIntersect(
        { start: 10, end: 20 },
        [{ range: { start: 0, end: 10 }, size: 1 }]
      ),
      []
    );
    assert.deepStrictEqual(
      groupIntersect(
        { start: 2, end: 8 },
        [{ range: { start: 0, end: 10 }, size: 1 }]
      ),
      [{ range: { start: 2, end: 8 }, size: 1 }]
    );
    assert.deepStrictEqual(
      groupIntersect(
        { start: 2, end: 8 },
        [{ range: { start: 0, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }]
      ),
      [{ range: { start: 2, end: 8 }, size: 1 }]
    );
    assert.deepStrictEqual(
      groupIntersect(
        { start: 12, end: 18 },
        [{ range: { start: 0, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }]
      ),
      [{ range: { start: 12, end: 18 }, size: 5 }]
    );
    assert.deepStrictEqual(
      groupIntersect(
        { start: 2, end: 18 },
        [{ range: { start: 0, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }]
      ),
      [{ range: { start: 2, end: 10 }, size: 1 }, { range: { start: 10, end: 18 }, size: 5 }]
    );
    assert.deepStrictEqual(
      groupIntersect(
        { start: 2, end: 28 },
        [{ range: { start: 0, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }, { range: { start: 20, end: 30 }, size: 10 }]
      ),
      [{ range: { start: 2, end: 10 }, size: 1 }, { range: { start: 10, end: 20 }, size: 5 }, { range: { start: 20, end: 28 }, size: 10 }]
    );
  });
  test("consolidate", () => {
    assert.deepStrictEqual(consolidate([]), []);
    assert.deepStrictEqual(
      consolidate([{ range: { start: 0, end: 10 }, size: 1 }]),
      [{ range: { start: 0, end: 10 }, size: 1 }]
    );
    assert.deepStrictEqual(
      consolidate([
        { range: { start: 0, end: 10 }, size: 1 },
        { range: { start: 10, end: 20 }, size: 1 }
      ]),
      [{ range: { start: 0, end: 20 }, size: 1 }]
    );
    assert.deepStrictEqual(
      consolidate([
        { range: { start: 0, end: 10 }, size: 1 },
        { range: { start: 10, end: 20 }, size: 1 },
        { range: { start: 20, end: 100 }, size: 1 }
      ]),
      [{ range: { start: 0, end: 100 }, size: 1 }]
    );
    assert.deepStrictEqual(
      consolidate([
        { range: { start: 0, end: 10 }, size: 1 },
        { range: { start: 10, end: 20 }, size: 5 },
        { range: { start: 20, end: 30 }, size: 10 }
      ]),
      [
        { range: { start: 0, end: 10 }, size: 1 },
        { range: { start: 10, end: 20 }, size: 5 },
        { range: { start: 20, end: 30 }, size: 10 }
      ]
    );
    assert.deepStrictEqual(
      consolidate([
        { range: { start: 0, end: 10 }, size: 1 },
        { range: { start: 10, end: 20 }, size: 2 },
        { range: { start: 20, end: 100 }, size: 2 }
      ]),
      [
        { range: { start: 0, end: 10 }, size: 1 },
        { range: { start: 10, end: 100 }, size: 2 }
      ]
    );
  });
  test("empty", () => {
    const rangeMap = new RangeMap();
    assert.strictEqual(rangeMap.size, 0);
    assert.strictEqual(rangeMap.count, 0);
  });
  const one = { size: 1 };
  const two = { size: 2 };
  const three = { size: 3 };
  const five = { size: 5 };
  const ten = { size: 10 };
  test("length & count", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [one]);
    assert.strictEqual(rangeMap.size, 1);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("length & count #2", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [one, one, one, one, one]);
    assert.strictEqual(rangeMap.size, 5);
    assert.strictEqual(rangeMap.count, 5);
  });
  test("length & count #3", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [five]);
    assert.strictEqual(rangeMap.size, 5);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("length & count #4", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 25);
    assert.strictEqual(rangeMap.count, 5);
  });
  test("insert", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 25);
    assert.strictEqual(rangeMap.count, 5);
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 50);
    assert.strictEqual(rangeMap.count, 10);
    rangeMap.splice(5, 0, [ten, ten]);
    assert.strictEqual(rangeMap.size, 70);
    assert.strictEqual(rangeMap.count, 12);
    rangeMap.splice(12, 0, [{ size: 200 }]);
    assert.strictEqual(rangeMap.size, 270);
    assert.strictEqual(rangeMap.count, 13);
  });
  test("delete", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five
    ]);
    assert.strictEqual(rangeMap.size, 100);
    assert.strictEqual(rangeMap.count, 20);
    rangeMap.splice(10, 5);
    assert.strictEqual(rangeMap.size, 75);
    assert.strictEqual(rangeMap.count, 15);
    rangeMap.splice(0, 1);
    assert.strictEqual(rangeMap.size, 70);
    assert.strictEqual(rangeMap.count, 14);
    rangeMap.splice(1, 13);
    assert.strictEqual(rangeMap.size, 5);
    assert.strictEqual(rangeMap.count, 1);
    rangeMap.splice(1, 1);
    assert.strictEqual(rangeMap.size, 5);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("insert & delete", () => {
    const rangeMap = new RangeMap();
    assert.strictEqual(rangeMap.size, 0);
    assert.strictEqual(rangeMap.count, 0);
    rangeMap.splice(0, 0, [one]);
    assert.strictEqual(rangeMap.size, 1);
    assert.strictEqual(rangeMap.count, 1);
    rangeMap.splice(0, 1);
    assert.strictEqual(rangeMap.size, 0);
    assert.strictEqual(rangeMap.count, 0);
  });
  test("insert & delete #2", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one
    ]);
    rangeMap.splice(2, 6);
    assert.strictEqual(rangeMap.count, 4);
    assert.strictEqual(rangeMap.size, 4);
  });
  test("insert & delete #3", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two
    ]);
    rangeMap.splice(8, 4);
    assert.strictEqual(rangeMap.count, 16);
    assert.strictEqual(rangeMap.size, 24);
  });
  test("insert & delete #4", () => {
    const rangeMap = new RangeMap();
    rangeMap.splice(0, 0, [
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two
    ]);
    rangeMap.splice(5, 0, [three, three, three, three, three]);
    assert.strictEqual(rangeMap.count, 25);
    assert.strictEqual(rangeMap.size, 45);
    rangeMap.splice(4, 7);
    assert.strictEqual(rangeMap.count, 18);
    assert.strictEqual(rangeMap.size, 28);
  });
  suite("indexAt, positionAt", () => {
    test("empty", () => {
      const rangeMap = new RangeMap();
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(10), 0);
      assert.strictEqual(rangeMap.indexAt(-1), -1);
      assert.strictEqual(rangeMap.positionAt(0), -1);
      assert.strictEqual(rangeMap.positionAt(10), -1);
      assert.strictEqual(rangeMap.positionAt(-1), -1);
    });
    test("simple", () => {
      const rangeMap = new RangeMap();
      rangeMap.splice(0, 0, [one]);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 1);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), -1);
    });
    test("simple #2", () => {
      const rangeMap = new RangeMap();
      rangeMap.splice(0, 0, [ten]);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(5), 0);
      assert.strictEqual(rangeMap.indexAt(9), 0);
      assert.strictEqual(rangeMap.indexAt(10), 1);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), -1);
    });
    test("insert", () => {
      const rangeMap = new RangeMap();
      rangeMap.splice(0, 0, [one, one, one, one, one, one, one, one, one, one]);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 1);
      assert.strictEqual(rangeMap.indexAt(5), 5);
      assert.strictEqual(rangeMap.indexAt(9), 9);
      assert.strictEqual(rangeMap.indexAt(10), 10);
      assert.strictEqual(rangeMap.indexAt(11), 10);
      rangeMap.splice(10, 0, [one, one, one, one, one, one, one, one, one, one]);
      assert.strictEqual(rangeMap.indexAt(10), 10);
      assert.strictEqual(rangeMap.indexAt(19), 19);
      assert.strictEqual(rangeMap.indexAt(20), 20);
      assert.strictEqual(rangeMap.indexAt(21), 20);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), 1);
      assert.strictEqual(rangeMap.positionAt(19), 19);
      assert.strictEqual(rangeMap.positionAt(20), -1);
    });
    test("delete", () => {
      const rangeMap = new RangeMap();
      rangeMap.splice(0, 0, [one, one, one, one, one, one, one, one, one, one]);
      rangeMap.splice(2, 6);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 1);
      assert.strictEqual(rangeMap.indexAt(3), 3);
      assert.strictEqual(rangeMap.indexAt(4), 4);
      assert.strictEqual(rangeMap.indexAt(5), 4);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), 1);
      assert.strictEqual(rangeMap.positionAt(3), 3);
      assert.strictEqual(rangeMap.positionAt(4), -1);
    });
    test("delete #2", () => {
      const rangeMap = new RangeMap();
      rangeMap.splice(0, 0, [ten, ten, ten, ten, ten, ten, ten, ten, ten, ten]);
      rangeMap.splice(2, 6);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 0);
      assert.strictEqual(rangeMap.indexAt(30), 3);
      assert.strictEqual(rangeMap.indexAt(40), 4);
      assert.strictEqual(rangeMap.indexAt(50), 4);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), 10);
      assert.strictEqual(rangeMap.positionAt(2), 20);
      assert.strictEqual(rangeMap.positionAt(3), 30);
      assert.strictEqual(rangeMap.positionAt(4), -1);
    });
  });
});
suite("RangeMap with top padding", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty", () => {
    const rangeMap = new RangeMap(10);
    assert.strictEqual(rangeMap.size, 10);
    assert.strictEqual(rangeMap.count, 0);
  });
  const one = { size: 1 };
  const five = { size: 5 };
  const ten = { size: 10 };
  test("length & count", () => {
    const rangeMap = new RangeMap(10);
    rangeMap.splice(0, 0, [one]);
    assert.strictEqual(rangeMap.size, 11);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("length & count #2", () => {
    const rangeMap = new RangeMap(10);
    rangeMap.splice(0, 0, [one, one, one, one, one]);
    assert.strictEqual(rangeMap.size, 15);
    assert.strictEqual(rangeMap.count, 5);
  });
  test("length & count #3", () => {
    const rangeMap = new RangeMap(10);
    rangeMap.splice(0, 0, [five]);
    assert.strictEqual(rangeMap.size, 15);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("length & count #4", () => {
    const rangeMap = new RangeMap(10);
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 35);
    assert.strictEqual(rangeMap.count, 5);
  });
  test("insert", () => {
    const rangeMap = new RangeMap(10);
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 35);
    assert.strictEqual(rangeMap.count, 5);
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 60);
    assert.strictEqual(rangeMap.count, 10);
    rangeMap.splice(5, 0, [ten, ten]);
    assert.strictEqual(rangeMap.size, 80);
    assert.strictEqual(rangeMap.count, 12);
    rangeMap.splice(12, 0, [{ size: 200 }]);
    assert.strictEqual(rangeMap.size, 280);
    assert.strictEqual(rangeMap.count, 13);
  });
  suite("indexAt, positionAt", () => {
    test("empty", () => {
      const rangeMap = new RangeMap(10);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(10), 0);
      assert.strictEqual(rangeMap.indexAt(-1), -1);
      assert.strictEqual(rangeMap.positionAt(0), -1);
      assert.strictEqual(rangeMap.positionAt(10), -1);
      assert.strictEqual(rangeMap.positionAt(-1), -1);
    });
    test("simple", () => {
      const rangeMap = new RangeMap(10);
      rangeMap.splice(0, 0, [one]);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 0);
      assert.strictEqual(rangeMap.indexAt(10), 0);
      assert.strictEqual(rangeMap.indexAt(11), 1);
      assert.strictEqual(rangeMap.positionAt(0), 10);
      assert.strictEqual(rangeMap.positionAt(1), -1);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcbGlzdFxccmFuZ2VNYXAudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGNvbnNvbGlkYXRlLCBncm91cEludGVyc2VjdCwgUmFuZ2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL2xpc3QvcmFuZ2VNYXAuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcmFuZ2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ1JhbmdlTWFwJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ludGVyc2VjdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFJhbmdlLmludGVyc2VjdCh7IHN0YXJ0OiAwLCBlbmQ6IDAgfSwgeyBzdGFydDogMCwgZW5kOiAwIH0pLCB7IHN0YXJ0OiAwLCBlbmQ6IDAgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChSYW5nZS5pbnRlcnNlY3QoeyBzdGFydDogMCwgZW5kOiAwIH0sIHsgc3RhcnQ6IDUsIGVuZDogNSB9KSwgeyBzdGFydDogMCwgZW5kOiAwIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoUmFuZ2UuaW50ZXJzZWN0KHsgc3RhcnQ6IDAsIGVuZDogMSB9LCB7IHN0YXJ0OiA1LCBlbmQ6IDYgfSksIHsgc3RhcnQ6IDAsIGVuZDogMCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFJhbmdlLmludGVyc2VjdCh7IHN0YXJ0OiA1LCBlbmQ6IDYgfSwgeyBzdGFydDogMCwgZW5kOiAxIH0pLCB7IHN0YXJ0OiAwLCBlbmQ6IDAgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChSYW5nZS5pbnRlcnNlY3QoeyBzdGFydDogMCwgZW5kOiA1IH0sIHsgc3RhcnQ6IDIsIGVuZDogMiB9KSwgeyBzdGFydDogMCwgZW5kOiAwIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoUmFuZ2UuaW50ZXJzZWN0KHsgc3RhcnQ6IDAsIGVuZDogMSB9LCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSksIHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFJhbmdlLmludGVyc2VjdCh7IHN0YXJ0OiAwLCBlbmQ6IDEwIH0sIHsgc3RhcnQ6IDAsIGVuZDogNSB9KSwgeyBzdGFydDogMCwgZW5kOiA1IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoUmFuZ2UuaW50ZXJzZWN0KHsgc3RhcnQ6IDAsIGVuZDogNSB9LCB7IHN0YXJ0OiAwLCBlbmQ6IDEwIH0pLCB7IHN0YXJ0OiAwLCBlbmQ6IDUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChSYW5nZS5pbnRlcnNlY3QoeyBzdGFydDogMCwgZW5kOiAxMCB9LCB7IHN0YXJ0OiA1LCBlbmQ6IDEwIH0pLCB7IHN0YXJ0OiA1LCBlbmQ6IDEwIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoUmFuZ2UuaW50ZXJzZWN0KHsgc3RhcnQ6IDUsIGVuZDogMTAgfSwgeyBzdGFydDogMCwgZW5kOiAxMCB9KSwgeyBzdGFydDogNSwgZW5kOiAxMCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFJhbmdlLmludGVyc2VjdCh7IHN0YXJ0OiAwLCBlbmQ6IDEwIH0sIHsgc3RhcnQ6IDIsIGVuZDogOCB9KSwgeyBzdGFydDogMiwgZW5kOiA4IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoUmFuZ2UuaW50ZXJzZWN0KHsgc3RhcnQ6IDIsIGVuZDogOCB9LCB7IHN0YXJ0OiAwLCBlbmQ6IDEwIH0pLCB7IHN0YXJ0OiAyLCBlbmQ6IDggfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChSYW5nZS5pbnRlcnNlY3QoeyBzdGFydDogMCwgZW5kOiAxMCB9LCB7IHN0YXJ0OiA1LCBlbmQ6IDE1IH0pLCB7IHN0YXJ0OiA1LCBlbmQ6IDEwIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoUmFuZ2UuaW50ZXJzZWN0KHsgc3RhcnQ6IDUsIGVuZDogMTUgfSwgeyBzdGFydDogMCwgZW5kOiAxMCB9KSwgeyBzdGFydDogNSwgZW5kOiAxMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlJbnRlcnNlY3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGdyb3VwSW50ZXJzZWN0KFxuXHRcdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDAgfSxcblx0XHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAgfSwgc2l6ZTogMSB9XVxuXHRcdFx0KSxcblx0XHRcdFtdXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRncm91cEludGVyc2VjdChcblx0XHRcdFx0eyBzdGFydDogMTAsIGVuZDogMjAgfSxcblx0XHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAgfSwgc2l6ZTogMSB9XVxuXHRcdFx0KSxcblx0XHRcdFtdXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRncm91cEludGVyc2VjdChcblx0XHRcdFx0eyBzdGFydDogMiwgZW5kOiA4IH0sXG5cdFx0XHRcdFt7IHJhbmdlOiB7IHN0YXJ0OiAwLCBlbmQ6IDEwIH0sIHNpemU6IDEgfV1cblx0XHRcdCksXG5cdFx0XHRbeyByYW5nZTogeyBzdGFydDogMiwgZW5kOiA4IH0sIHNpemU6IDEgfV1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGdyb3VwSW50ZXJzZWN0KFxuXHRcdFx0XHR7IHN0YXJ0OiAyLCBlbmQ6IDggfSxcblx0XHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAgfSwgc2l6ZTogMSB9LCB7IHJhbmdlOiB7IHN0YXJ0OiAxMCwgZW5kOiAyMCB9LCBzaXplOiA1IH1dXG5cdFx0XHQpLFxuXHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDIsIGVuZDogOCB9LCBzaXplOiAxIH1dXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRncm91cEludGVyc2VjdChcblx0XHRcdFx0eyBzdGFydDogMTIsIGVuZDogMTggfSxcblx0XHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAgfSwgc2l6ZTogMSB9LCB7IHJhbmdlOiB7IHN0YXJ0OiAxMCwgZW5kOiAyMCB9LCBzaXplOiA1IH1dXG5cdFx0XHQpLFxuXHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDEyLCBlbmQ6IDE4IH0sIHNpemU6IDUgfV1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGdyb3VwSW50ZXJzZWN0KFxuXHRcdFx0XHR7IHN0YXJ0OiAyLCBlbmQ6IDE4IH0sXG5cdFx0XHRcdFt7IHJhbmdlOiB7IHN0YXJ0OiAwLCBlbmQ6IDEwIH0sIHNpemU6IDEgfSwgeyByYW5nZTogeyBzdGFydDogMTAsIGVuZDogMjAgfSwgc2l6ZTogNSB9XVxuXHRcdFx0KSxcblx0XHRcdFt7IHJhbmdlOiB7IHN0YXJ0OiAyLCBlbmQ6IDEwIH0sIHNpemU6IDEgfSwgeyByYW5nZTogeyBzdGFydDogMTAsIGVuZDogMTggfSwgc2l6ZTogNSB9XVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Z3JvdXBJbnRlcnNlY3QoXG5cdFx0XHRcdHsgc3RhcnQ6IDIsIGVuZDogMjggfSxcblx0XHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAgfSwgc2l6ZTogMSB9LCB7IHJhbmdlOiB7IHN0YXJ0OiAxMCwgZW5kOiAyMCB9LCBzaXplOiA1IH0sIHsgcmFuZ2U6IHsgc3RhcnQ6IDIwLCBlbmQ6IDMwIH0sIHNpemU6IDEwIH1dXG5cdFx0XHQpLFxuXHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDIsIGVuZDogMTAgfSwgc2l6ZTogMSB9LCB7IHJhbmdlOiB7IHN0YXJ0OiAxMCwgZW5kOiAyMCB9LCBzaXplOiA1IH0sIHsgcmFuZ2U6IHsgc3RhcnQ6IDIwLCBlbmQ6IDI4IH0sIHNpemU6IDEwIH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29uc29saWRhdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25zb2xpZGF0ZShbXSksIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjb25zb2xpZGF0ZShbeyByYW5nZTogeyBzdGFydDogMCwgZW5kOiAxMCB9LCBzaXplOiAxIH1dKSxcblx0XHRcdFt7IHJhbmdlOiB7IHN0YXJ0OiAwLCBlbmQ6IDEwIH0sIHNpemU6IDEgfV1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvbnNvbGlkYXRlKFtcblx0XHRcdFx0eyByYW5nZTogeyBzdGFydDogMCwgZW5kOiAxMCB9LCBzaXplOiAxIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IHsgc3RhcnQ6IDEwLCBlbmQ6IDIwIH0sIHNpemU6IDEgfVxuXHRcdFx0XSksXG5cdFx0XHRbeyByYW5nZTogeyBzdGFydDogMCwgZW5kOiAyMCB9LCBzaXplOiAxIH1dXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjb25zb2xpZGF0ZShbXG5cdFx0XHRcdHsgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAgfSwgc2l6ZTogMSB9LFxuXHRcdFx0XHR7IHJhbmdlOiB7IHN0YXJ0OiAxMCwgZW5kOiAyMCB9LCBzaXplOiAxIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IHsgc3RhcnQ6IDIwLCBlbmQ6IDEwMCB9LCBzaXplOiAxIH1cblx0XHRcdF0pLFxuXHRcdFx0W3sgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAwIH0sIHNpemU6IDEgfV1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvbnNvbGlkYXRlKFtcblx0XHRcdFx0eyByYW5nZTogeyBzdGFydDogMCwgZW5kOiAxMCB9LCBzaXplOiAxIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IHsgc3RhcnQ6IDEwLCBlbmQ6IDIwIH0sIHNpemU6IDUgfSxcblx0XHRcdFx0eyByYW5nZTogeyBzdGFydDogMjAsIGVuZDogMzAgfSwgc2l6ZTogMTAgfVxuXHRcdFx0XSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAgfSwgc2l6ZTogMSB9LFxuXHRcdFx0XHR7IHJhbmdlOiB7IHN0YXJ0OiAxMCwgZW5kOiAyMCB9LCBzaXplOiA1IH0sXG5cdFx0XHRcdHsgcmFuZ2U6IHsgc3RhcnQ6IDIwLCBlbmQ6IDMwIH0sIHNpemU6IDEwIH1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNvbnNvbGlkYXRlKFtcblx0XHRcdFx0eyByYW5nZTogeyBzdGFydDogMCwgZW5kOiAxMCB9LCBzaXplOiAxIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IHsgc3RhcnQ6IDEwLCBlbmQ6IDIwIH0sIHNpemU6IDIgfSxcblx0XHRcdFx0eyByYW5nZTogeyBzdGFydDogMjAsIGVuZDogMTAwIH0sIHNpemU6IDIgfVxuXHRcdFx0XSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgcmFuZ2U6IHsgc3RhcnQ6IDAsIGVuZDogMTAgfSwgc2l6ZTogMSB9LFxuXHRcdFx0XHR7IHJhbmdlOiB7IHN0YXJ0OiAxMCwgZW5kOiAxMDAgfSwgc2l6ZTogMiB9XG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgUmFuZ2VNYXAoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAwKTtcblx0fSk7XG5cblx0Y29uc3Qgb25lID0geyBzaXplOiAxIH07XG5cdGNvbnN0IHR3byA9IHsgc2l6ZTogMiB9O1xuXHRjb25zdCB0aHJlZSA9IHsgc2l6ZTogMyB9O1xuXHRjb25zdCBmaXZlID0geyBzaXplOiA1IH07XG5cdGNvbnN0IHRlbiA9IHsgc2l6ZTogMTAgfTtcblxuXHR0ZXN0KCdsZW5ndGggJiBjb3VudCcsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBSYW5nZU1hcCgpO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbb25lXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlbmd0aCAmIGNvdW50ICMyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmUsIG9uZSwgb25lLCBvbmUsIG9uZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZW5ndGggJiBjb3VudCAjMycsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBSYW5nZU1hcCgpO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbZml2ZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZW5ndGggJiBjb3VudCAjNCcsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBSYW5nZU1hcCgpO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbZml2ZSwgZml2ZSwgZml2ZSwgZml2ZSwgZml2ZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAyNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCA1KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDI1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDUpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDUwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEwKTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSg1LCAwLCBbdGVuLCB0ZW5dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgNzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTIpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDEyLCAwLCBbeyBzaXplOiAyMDAgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAyNzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTMpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgUmFuZ2VNYXAoKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW2ZpdmUsIGZpdmUsIGZpdmUsIGZpdmUsIGZpdmUsXG5cdFx0XHRmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLFxuXHRcdFx0Zml2ZSwgZml2ZSwgZml2ZSwgZml2ZSwgZml2ZSxcblx0XHRcdGZpdmUsIGZpdmUsIGZpdmUsIGZpdmUsIGZpdmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMTAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDIwKTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSgxMCwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDc1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDE1KTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgNzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTQpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDEsIDEzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAxKTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSgxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0ICYgZGVsZXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMCk7XG5cblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW29uZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgJiBkZWxldGUgIzInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgUmFuZ2VNYXAoKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW29uZSwgb25lLCBvbmUsIG9uZSwgb25lLFxuXHRcdFx0b25lLCBvbmUsIG9uZSwgb25lLCBvbmVdKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMiwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCAmIGRlbGV0ZSAjMycsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBSYW5nZU1hcCgpO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsXG5cdFx0XHRvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSxcblx0XHRcdHR3bywgdHdvLCB0d28sIHR3bywgdHdvLFxuXHRcdFx0dHdvLCB0d28sIHR3bywgdHdvLCB0d29dKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoOCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAxNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDI0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0ICYgZGVsZXRlICM0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSxcblx0XHRcdG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLFxuXHRcdFx0dHdvLCB0d28sIHR3bywgdHdvLCB0d28sXG5cdFx0XHR0d28sIHR3bywgdHdvLCB0d28sIHR3b10pO1xuXHRcdHJhbmdlTWFwLnNwbGljZSg1LCAwLCBbdGhyZWUsIHRocmVlLCB0aHJlZSwgdGhyZWUsIHRocmVlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAyNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDQ1KTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSg0LCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDE4KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMjgpO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW5kZXhBdCwgcG9zaXRpb25BdCcsICgpID0+IHtcblx0XHR0ZXN0KCdlbXB0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoLTEpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgwKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMTApLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgtMSksIC0xKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbXBsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKCk7XG5cdFx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW29uZV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMSksIC0xKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbXBsZSAjMicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKCk7XG5cdFx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW3Rlbl0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoNSksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoOSksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMTApLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDEpLCAtMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNlcnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBSYW5nZU1hcCgpO1xuXHRcdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDUpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDkpLCA5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEwKSwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMTEpLCAxMCk7XG5cblx0XHRcdHJhbmdlTWFwLnNwbGljZSgxMCwgMCwgW29uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMTApLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxOSksIDE5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDIwKSwgMjApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMjEpLCAyMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgxOSksIDE5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDIwKSwgLTEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgUmFuZ2VNYXAoKTtcblx0XHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lXSk7XG5cdFx0XHRyYW5nZU1hcC5zcGxpY2UoMiwgNik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDMpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDQpLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDUpLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDMpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDQpLCAtMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGUgIzInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBSYW5nZU1hcCgpO1xuXHRcdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFt0ZW4sIHRlbiwgdGVuLCB0ZW4sIHRlbiwgdGVuLCB0ZW4sIHRlbiwgdGVuLCB0ZW5dKTtcblx0XHRcdHJhbmdlTWFwLnNwbGljZSgyLCA2KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMSksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMzApLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDQwKSwgNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCg1MCksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMSksIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDIpLCAyMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgzKSwgMzApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoNCksIC0xKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1JhbmdlTWFwIHdpdGggdG9wIHBhZGRpbmcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgUmFuZ2VNYXAoMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAwKTtcblx0fSk7XG5cblx0Y29uc3Qgb25lID0geyBzaXplOiAxIH07XG5cdGNvbnN0IGZpdmUgPSB7IHNpemU6IDUgfTtcblx0Y29uc3QgdGVuID0geyBzaXplOiAxMCB9O1xuXG5cdHRlc3QoJ2xlbmd0aCAmIGNvdW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKDEwKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW29uZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnbGVuZ3RoICYgY291bnQgIzInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgUmFuZ2VNYXAoMTApO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbb25lLCBvbmUsIG9uZSwgb25lLCBvbmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlbmd0aCAmIGNvdW50ICMzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKDEwKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW2ZpdmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlbmd0aCAmIGNvdW50ICM0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKDEwKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW2ZpdmUsIGZpdmUsIGZpdmUsIGZpdmUsIGZpdmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMzUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCcsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBSYW5nZU1hcCgxMCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDM1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDUpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDYwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEwKTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSg1LCAwLCBbdGVuLCB0ZW5dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgODApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTIpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDEyLCAwLCBbeyBzaXplOiAyMDAgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAyODApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTMpO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW5kZXhBdCwgcG9zaXRpb25BdCcsICgpID0+IHtcblx0XHR0ZXN0KCdlbXB0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IFJhbmdlTWFwKDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgtMSksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDApLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgxMCksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KC0xKSwgLTEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2ltcGxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgUmFuZ2VNYXAoMTApO1xuXHRcdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMCksIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDEpLCAtMSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhLGdCQUFnQixnQkFBZ0I7QUFDdEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sWUFBWSxNQUFNO0FBRXZCLDBDQUF3QztBQUV4QyxPQUFLLGdCQUFnQixNQUFNO0FBQzFCLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3hHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3hHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3hHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3hHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3hHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3hHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3pHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3pHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssR0FBRyxDQUFDO0FBQzNHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssR0FBRyxDQUFDO0FBQzNHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3pHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsQ0FBQyxHQUFHLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ3pHLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcsR0FBRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUcs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UyxPQUFPLEdBQUcsR0FBRztBQUFBLE1BQUM7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsTUFDMUM7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsSUFBRyxDQUFDO0FBQ3pCLGFBQVMsT0FBTyxHQUFHLENBQUM7QUFDcEIsV0FBTyxZQUFZLFNBQVMsT0FBTyxDQUFDO0FBQ3BDLFdBQU8sWUFBWSxTQUFTLE1BQU0sQ0FBQztBQUFBLEVBQ3BDLENBQUM7QUFFRCxPQUFLLHNCQUFzQixNQUFNO0FBQ2hDLFVBQU0sV0FBVyxJQUFJLFNBQVM7QUFDOUIsYUFBUyxPQUFPLEdBQUcsR0FBRztBQUFBLE1BQUM7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsTUFDMUM7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsTUFDcEI7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsTUFDcEI7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsSUFBRyxDQUFDO0FBQ3pCLGFBQVMsT0FBTyxHQUFHLENBQUM7QUFDcEIsV0FBTyxZQUFZLFNBQVMsT0FBTyxFQUFFO0FBQ3JDLFdBQU8sWUFBWSxTQUFTLE1BQU0sRUFBRTtBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLHNCQUFzQixNQUFNO0FBQ2hDLFVBQU0sV0FBVyxJQUFJLFNBQVM7QUFDOUIsYUFBUyxPQUFPLEdBQUcsR0FBRztBQUFBLE1BQUM7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsTUFDMUM7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsTUFDcEI7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7QUFBQSxNQUFLO0FBQUEsTUFDcEI7QUFBQSxNQUFLO0FBQUEsTUFBSztBQUFBLE1BQUs7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
