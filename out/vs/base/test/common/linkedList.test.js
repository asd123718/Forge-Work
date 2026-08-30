import assert from "assert";
import { LinkedList } from "../../common/linkedList.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("LinkedList", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertElements(list, ...elements) {
    assert.strictEqual(list.size, elements.length);
    assert.deepStrictEqual(Array.from(list), elements);
    assert.deepStrictEqual([...list], elements);
    for (const item of list) {
      assert.strictEqual(item, elements.shift());
    }
    assert.strictEqual(elements.length, 0);
  }
  test("Push/Iter", () => {
    const list = new LinkedList();
    list.push(0);
    list.push(1);
    list.push(2);
    assertElements(list, 0, 1, 2);
  });
  test("Push/Remove", () => {
    let list = new LinkedList();
    let disp = list.push(0);
    list.push(1);
    list.push(2);
    disp();
    assertElements(list, 1, 2);
    list = new LinkedList();
    list.push(0);
    disp = list.push(1);
    list.push(2);
    disp();
    assertElements(list, 0, 2);
    list = new LinkedList();
    list.push(0);
    list.push(1);
    disp = list.push(2);
    disp();
    assertElements(list, 0, 1);
    list = new LinkedList();
    list.push(0);
    list.push(1);
    disp = list.push(2);
    disp();
    disp();
    assertElements(list, 0, 1);
  });
  test("Push/toArray", () => {
    const list = new LinkedList();
    list.push("foo");
    list.push("bar");
    list.push("far");
    list.push("boo");
    assertElements(list, "foo", "bar", "far", "boo");
  });
  test("unshift/Iter", () => {
    const list = new LinkedList();
    list.unshift(0);
    list.unshift(1);
    list.unshift(2);
    assertElements(list, 2, 1, 0);
  });
  test("unshift/Remove", () => {
    let list = new LinkedList();
    let disp = list.unshift(0);
    list.unshift(1);
    list.unshift(2);
    disp();
    assertElements(list, 2, 1);
    list = new LinkedList();
    list.unshift(0);
    disp = list.unshift(1);
    list.unshift(2);
    disp();
    assertElements(list, 2, 0);
    list = new LinkedList();
    list.unshift(0);
    list.unshift(1);
    disp = list.unshift(2);
    disp();
    assertElements(list, 1, 0);
  });
  test("unshift/toArray", () => {
    const list = new LinkedList();
    list.unshift("foo");
    list.unshift("bar");
    list.unshift("far");
    list.unshift("boo");
    assertElements(list, "boo", "far", "bar", "foo");
  });
  test("pop/unshift", function() {
    const list = new LinkedList();
    list.push("a");
    list.push("b");
    assertElements(list, "a", "b");
    const a = list.shift();
    assert.strictEqual(a, "a");
    assertElements(list, "b");
    list.unshift("a");
    assertElements(list, "a", "b");
    const b = list.pop();
    assert.strictEqual(b, "b");
    assertElements(list, "a");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGxpbmtlZExpc3QudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0xpbmtlZExpc3QnLCBmdW5jdGlvbiAoKSB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0RWxlbWVudHM8RT4obGlzdDogTGlua2VkTGlzdDxFPiwgLi4uZWxlbWVudHM6IEVbXSkge1xuXG5cdFx0Ly8gY2hlY2sgc2l6ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0LnNpemUsIGVsZW1lbnRzLmxlbmd0aCk7XG5cblx0XHQvLyBhc3NlcnQgdG9BcnJheVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShsaXN0KSwgZWxlbWVudHMpO1xuXG5cdFx0Ly8gYXNzZXJ0IFN5bWJvbC5pdGVyYXRvciAoMSlcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5saXN0XSwgZWxlbWVudHMpO1xuXG5cdFx0Ly8gYXNzZXJ0IFN5bWJvbC5pdGVyYXRvciAoMilcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgbGlzdCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0sIGVsZW1lbnRzLnNoaWZ0KCkpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudHMubGVuZ3RoLCAwKTtcblx0fVxuXG5cdHRlc3QoJ1B1c2gvSXRlcicsICgpID0+IHtcblx0XHRjb25zdCBsaXN0ID0gbmV3IExpbmtlZExpc3Q8bnVtYmVyPigpO1xuXHRcdGxpc3QucHVzaCgwKTtcblx0XHRsaXN0LnB1c2goMSk7XG5cdFx0bGlzdC5wdXNoKDIpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsIDAsIDEsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdQdXNoL1JlbW92ZScsICgpID0+IHtcblx0XHRsZXQgbGlzdCA9IG5ldyBMaW5rZWRMaXN0PG51bWJlcj4oKTtcblx0XHRsZXQgZGlzcCA9IGxpc3QucHVzaCgwKTtcblx0XHRsaXN0LnB1c2goMSk7XG5cdFx0bGlzdC5wdXNoKDIpO1xuXHRcdGRpc3AoKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAxLCAyKTtcblxuXHRcdGxpc3QgPSBuZXcgTGlua2VkTGlzdDxudW1iZXI+KCk7XG5cdFx0bGlzdC5wdXNoKDApO1xuXHRcdGRpc3AgPSBsaXN0LnB1c2goMSk7XG5cdFx0bGlzdC5wdXNoKDIpO1xuXHRcdGRpc3AoKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAwLCAyKTtcblxuXHRcdGxpc3QgPSBuZXcgTGlua2VkTGlzdDxudW1iZXI+KCk7XG5cdFx0bGlzdC5wdXNoKDApO1xuXHRcdGxpc3QucHVzaCgxKTtcblx0XHRkaXNwID0gbGlzdC5wdXNoKDIpO1xuXHRcdGRpc3AoKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAwLCAxKTtcblxuXHRcdGxpc3QgPSBuZXcgTGlua2VkTGlzdDxudW1iZXI+KCk7XG5cdFx0bGlzdC5wdXNoKDApO1xuXHRcdGxpc3QucHVzaCgxKTtcblx0XHRkaXNwID0gbGlzdC5wdXNoKDIpO1xuXHRcdGRpc3AoKTtcblx0XHRkaXNwKCk7XG5cdFx0YXNzZXJ0RWxlbWVudHMobGlzdCwgMCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1B1c2gvdG9BcnJheScsICgpID0+IHtcblx0XHRjb25zdCBsaXN0ID0gbmV3IExpbmtlZExpc3Q8c3RyaW5nPigpO1xuXHRcdGxpc3QucHVzaCgnZm9vJyk7XG5cdFx0bGlzdC5wdXNoKCdiYXInKTtcblx0XHRsaXN0LnB1c2goJ2ZhcicpO1xuXHRcdGxpc3QucHVzaCgnYm9vJyk7XG5cblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAnZm9vJywgJ2JhcicsICdmYXInLCAnYm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vuc2hpZnQvSXRlcicsICgpID0+IHtcblx0XHRjb25zdCBsaXN0ID0gbmV3IExpbmtlZExpc3Q8bnVtYmVyPigpO1xuXHRcdGxpc3QudW5zaGlmdCgwKTtcblx0XHRsaXN0LnVuc2hpZnQoMSk7XG5cdFx0bGlzdC51bnNoaWZ0KDIpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsIDIsIDEsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnNoaWZ0L1JlbW92ZScsICgpID0+IHtcblx0XHRsZXQgbGlzdCA9IG5ldyBMaW5rZWRMaXN0PG51bWJlcj4oKTtcblx0XHRsZXQgZGlzcCA9IGxpc3QudW5zaGlmdCgwKTtcblx0XHRsaXN0LnVuc2hpZnQoMSk7XG5cdFx0bGlzdC51bnNoaWZ0KDIpO1xuXHRcdGRpc3AoKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAyLCAxKTtcblxuXHRcdGxpc3QgPSBuZXcgTGlua2VkTGlzdDxudW1iZXI+KCk7XG5cdFx0bGlzdC51bnNoaWZ0KDApO1xuXHRcdGRpc3AgPSBsaXN0LnVuc2hpZnQoMSk7XG5cdFx0bGlzdC51bnNoaWZ0KDIpO1xuXHRcdGRpc3AoKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAyLCAwKTtcblxuXHRcdGxpc3QgPSBuZXcgTGlua2VkTGlzdDxudW1iZXI+KCk7XG5cdFx0bGlzdC51bnNoaWZ0KDApO1xuXHRcdGxpc3QudW5zaGlmdCgxKTtcblx0XHRkaXNwID0gbGlzdC51bnNoaWZ0KDIpO1xuXHRcdGRpc3AoKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAxLCAwKTtcblx0fSk7XG5cblx0dGVzdCgndW5zaGlmdC90b0FycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3QgPSBuZXcgTGlua2VkTGlzdDxzdHJpbmc+KCk7XG5cdFx0bGlzdC51bnNoaWZ0KCdmb28nKTtcblx0XHRsaXN0LnVuc2hpZnQoJ2JhcicpO1xuXHRcdGxpc3QudW5zaGlmdCgnZmFyJyk7XG5cdFx0bGlzdC51bnNoaWZ0KCdib28nKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAnYm9vJywgJ2ZhcicsICdiYXInLCAnZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BvcC91bnNoaWZ0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxpc3QgPSBuZXcgTGlua2VkTGlzdDxzdHJpbmc+KCk7XG5cdFx0bGlzdC5wdXNoKCdhJyk7XG5cdFx0bGlzdC5wdXNoKCdiJyk7XG5cblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAnYScsICdiJyk7XG5cblx0XHRjb25zdCBhID0gbGlzdC5zaGlmdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLCAnYScpO1xuXHRcdGFzc2VydEVsZW1lbnRzKGxpc3QsICdiJyk7XG5cblx0XHRsaXN0LnVuc2hpZnQoJ2EnKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAnYScsICdiJyk7XG5cblx0XHRjb25zdCBiID0gbGlzdC5wb3AoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYiwgJ2InKTtcblx0XHRhc3NlcnRFbGVtZW50cyhsaXN0LCAnYScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sY0FBYyxXQUFZO0FBRS9CLDBDQUF3QztBQUV4QyxXQUFTLGVBQWtCLFNBQXdCLFVBQWU7QUFHakUsV0FBTyxZQUFZLEtBQUssTUFBTSxTQUFTLE1BQU07QUFHN0MsV0FBTyxnQkFBZ0IsTUFBTSxLQUFLLElBQUksR0FBRyxRQUFRO0FBR2pELFdBQU8sZ0JBQWdCLENBQUMsR0FBRyxJQUFJLEdBQUcsUUFBUTtBQUcxQyxlQUFXLFFBQVEsTUFBTTtBQUN4QixhQUFPLFlBQVksTUFBTSxTQUFTLE1BQU0sQ0FBQztBQUFBLElBQzFDO0FBQ0EsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDdEM7QUFFQSxPQUFLLGFBQWEsTUFBTTtBQUN2QixVQUFNLE9BQU8sSUFBSSxXQUFtQjtBQUNwQyxTQUFLLEtBQUssQ0FBQztBQUNYLFNBQUssS0FBSyxDQUFDO0FBQ1gsU0FBSyxLQUFLLENBQUM7QUFDWCxtQkFBZSxNQUFNLEdBQUcsR0FBRyxDQUFDO0FBQUEsRUFDN0IsQ0FBQztBQUVELE9BQUssZUFBZSxNQUFNO0FBQ3pCLFFBQUksT0FBTyxJQUFJLFdBQW1CO0FBQ2xDLFFBQUksT0FBTyxLQUFLLEtBQUssQ0FBQztBQUN0QixTQUFLLEtBQUssQ0FBQztBQUNYLFNBQUssS0FBSyxDQUFDO0FBQ1gsU0FBSztBQUNMLG1CQUFlLE1BQU0sR0FBRyxDQUFDO0FBRXpCLFdBQU8sSUFBSSxXQUFtQjtBQUM5QixTQUFLLEtBQUssQ0FBQztBQUNYLFdBQU8sS0FBSyxLQUFLLENBQUM7QUFDbEIsU0FBSyxLQUFLLENBQUM7QUFDWCxTQUFLO0FBQ0wsbUJBQWUsTUFBTSxHQUFHLENBQUM7QUFFekIs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
