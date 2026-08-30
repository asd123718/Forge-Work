import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MonotonousIndexTransformer } from "../../browser/indexTransformer.js";
import { LengthEdit, LengthReplacement } from "../../../../../editor/common/core/edits/lengthEdit.js";
suite("array operation", () => {
  function seq(start, end) {
    const result = [];
    for (let i = start; i < end; i++) {
      result.push(i);
    }
    return result;
  }
  test("simple", () => {
    const edit = LengthEdit.create([
      LengthReplacement.create(4, 7, 2),
      LengthReplacement.create(8, 8, 2),
      LengthReplacement.create(9, 11, 0)
    ]);
    const arr = seq(0, 15).map((x) => `item${x}`);
    const newArr = edit.applyArray(arr, void 0);
    assert.deepStrictEqual(newArr, [
      "item0",
      "item1",
      "item2",
      "item3",
      void 0,
      void 0,
      "item7",
      void 0,
      void 0,
      "item8",
      "item11",
      "item12",
      "item13",
      "item14"
    ]);
    const transformer = new MonotonousIndexTransformer(edit);
    assert.deepStrictEqual(
      seq(0, 15).map((x) => {
        const t = transformer.transform(x);
        let r = `arr[${x}]: ${arr[x]} -> `;
        if (t !== void 0) {
          r += `newArr[${t}]: ${newArr[t]}`;
        } else {
          r += "undefined";
        }
        return r;
      }),
      [
        "arr[0]: item0 -> newArr[0]: item0",
        "arr[1]: item1 -> newArr[1]: item1",
        "arr[2]: item2 -> newArr[2]: item2",
        "arr[3]: item3 -> newArr[3]: item3",
        "arr[4]: item4 -> undefined",
        "arr[5]: item5 -> undefined",
        "arr[6]: item6 -> undefined",
        "arr[7]: item7 -> newArr[6]: item7",
        "arr[8]: item8 -> newArr[9]: item8",
        "arr[9]: item9 -> undefined",
        "arr[10]: item10 -> undefined",
        "arr[11]: item11 -> newArr[10]: item11",
        "arr[12]: item12 -> newArr[11]: item12",
        "arr[13]: item13 -> newArr[12]: item13",
        "arr[14]: item14 -> newArr[13]: item14"
      ]
    );
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0TWF0ZVxcdGVzdFxcYnJvd3NlclxcYXJyYXlPcGVyYXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTW9ub3Rvbm91c0luZGV4VHJhbnNmb3JtZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2luZGV4VHJhbnNmb3JtZXIuanMnO1xuaW1wb3J0IHsgTGVuZ3RoRWRpdCwgTGVuZ3RoUmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdHMvbGVuZ3RoRWRpdC5qcyc7XG5cbnN1aXRlKCdhcnJheSBvcGVyYXRpb24nLCAoKSA9PiB7XG5cdGZ1bmN0aW9uIHNlcShzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcikge1xuXHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuXHRcdFx0cmVzdWx0LnB1c2goaSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHR0ZXN0KCdzaW1wbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdCA9IExlbmd0aEVkaXQuY3JlYXRlKFtcblx0XHRcdExlbmd0aFJlcGxhY2VtZW50LmNyZWF0ZSg0LCA3LCAyKSxcblx0XHRcdExlbmd0aFJlcGxhY2VtZW50LmNyZWF0ZSg4LCA4LCAyKSxcblx0XHRcdExlbmd0aFJlcGxhY2VtZW50LmNyZWF0ZSg5LCAxMSwgMCksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBhcnIgPSBzZXEoMCwgMTUpLm1hcCh4ID0+IGBpdGVtJHt4fWApO1xuXHRcdGNvbnN0IG5ld0FyciA9IGVkaXQuYXBwbHlBcnJheShhcnIsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdBcnIsIFtcblx0XHRcdCdpdGVtMCcsXG5cdFx0XHQnaXRlbTEnLFxuXHRcdFx0J2l0ZW0yJyxcblx0XHRcdCdpdGVtMycsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQnaXRlbTcnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0J2l0ZW04Jyxcblx0XHRcdCdpdGVtMTEnLFxuXHRcdFx0J2l0ZW0xMicsXG5cdFx0XHQnaXRlbTEzJyxcblx0XHRcdCdpdGVtMTQnLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdHJhbnNmb3JtZXIgPSBuZXcgTW9ub3Rvbm91c0luZGV4VHJhbnNmb3JtZXIoZWRpdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNlcSgwLCAxNSkubWFwKCh4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHQgPSB0cmFuc2Zvcm1lci50cmFuc2Zvcm0oeCk7XG5cdFx0XHRcdGxldCByID0gYGFyclske3h9XTogJHthcnJbeF19IC0+IGA7XG5cdFx0XHRcdGlmICh0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyICs9IGBuZXdBcnJbJHt0fV06ICR7bmV3QXJyW3RdfWA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ciArPSAndW5kZWZpbmVkJztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdH0pLFxuXHRcdFx0W1xuXHRcdFx0XHQnYXJyWzBdOiBpdGVtMCAtPiBuZXdBcnJbMF06IGl0ZW0wJyxcblx0XHRcdFx0J2FyclsxXTogaXRlbTEgLT4gbmV3QXJyWzFdOiBpdGVtMScsXG5cdFx0XHRcdCdhcnJbMl06IGl0ZW0yIC0+IG5ld0FyclsyXTogaXRlbTInLFxuXHRcdFx0XHQnYXJyWzNdOiBpdGVtMyAtPiBuZXdBcnJbM106IGl0ZW0zJyxcblx0XHRcdFx0J2Fycls0XTogaXRlbTQgLT4gdW5kZWZpbmVkJyxcblx0XHRcdFx0J2Fycls1XTogaXRlbTUgLT4gdW5kZWZpbmVkJyxcblx0XHRcdFx0J2Fycls2XTogaXRlbTYgLT4gdW5kZWZpbmVkJyxcblx0XHRcdFx0J2Fycls3XTogaXRlbTcgLT4gbmV3QXJyWzZdOiBpdGVtNycsXG5cdFx0XHRcdCdhcnJbOF06IGl0ZW04IC0+IG5ld0Fycls5XTogaXRlbTgnLFxuXHRcdFx0XHQnYXJyWzldOiBpdGVtOSAtPiB1bmRlZmluZWQnLFxuXHRcdFx0XHQnYXJyWzEwXTogaXRlbTEwIC0+IHVuZGVmaW5lZCcsXG5cdFx0XHRcdCdhcnJbMTFdOiBpdGVtMTEgLT4gbmV3QXJyWzEwXTogaXRlbTExJyxcblx0XHRcdFx0J2FyclsxMl06IGl0ZW0xMiAtPiBuZXdBcnJbMTFdOiBpdGVtMTInLFxuXHRcdFx0XHQnYXJyWzEzXTogaXRlbTEzIC0+IG5ld0FyclsxMl06IGl0ZW0xMycsXG5cdFx0XHRcdCdhcnJbMTRdOiBpdGVtMTQgLT4gbmV3QXJyWzEzXTogaXRlbTE0Jyxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsWUFBWSx5QkFBeUI7QUFFOUMsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QixXQUFTLElBQUksT0FBZSxLQUFhO0FBQ3hDLFVBQU0sU0FBbUIsQ0FBQztBQUMxQixhQUFTLElBQUksT0FBTyxJQUFJLEtBQUssS0FBSztBQUNqQyxhQUFPLEtBQUssQ0FBQztBQUFBLElBQ2Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUVBLE9BQUssVUFBVSxNQUFNO0FBQ3BCLFVBQU0sT0FBTyxXQUFXLE9BQU87QUFBQSxNQUM5QixrQkFBa0IsT0FBTyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ2hDLGtCQUFrQixPQUFPLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDaEMsa0JBQWtCLE9BQU8sR0FBRyxJQUFJLENBQUM7QUFBQSxJQUNsQyxDQUFDO0FBRUQsVUFBTSxNQUFNLElBQUksR0FBRyxFQUFFLEVBQUUsSUFBSSxPQUFLLE9BQU8sQ0FBQyxFQUFFO0FBQzFDLFVBQU0sU0FBUyxLQUFLLFdBQVcsS0FBSyxNQUFTO0FBQzdDLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLGNBQWMsSUFBSSwyQkFBMkIsSUFBSTtBQUN2RCxXQUFPO0FBQUEsTUFDTixJQUFJLEdBQUcsRUFBRSxFQUFFLElBQUksQ0FBQyxNQUFNO0FBQ3JCLGNBQU0sSUFBSSxZQUFZLFVBQVUsQ0FBQztBQUNqQyxZQUFJLElBQUksT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFDNUIsWUFBSSxNQUFNLFFBQVc7QUFDcEIsZUFBSyxVQUFVLENBQUMsTUFBTSxPQUFPLENBQUMsQ0FBQztBQUFBLFFBQ2hDLE9BQU87QUFDTixlQUFLO0FBQUEsUUFDTjtBQUNBLGVBQU87QUFBQSxNQUNSLENBQUM7QUFBQSxNQUNEO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
