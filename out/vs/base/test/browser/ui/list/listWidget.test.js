import assert from "assert";
import { List } from "../../../../browser/ui/list/listWidget.js";
import { range } from "../../../../common/arrays.js";
import { timeout } from "../../../../common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
suite("ListWidget", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Page up and down", async function() {
    const element = document.createElement("div");
    element.style.height = "200px";
    element.style.width = "200px";
    const delegate = {
      getHeight() {
        return 20;
      },
      getTemplateId() {
        return "template";
      }
    };
    let templatesCount = 0;
    const renderer = {
      templateId: "template",
      renderTemplate() {
        templatesCount++;
      },
      renderElement() {
      },
      disposeTemplate() {
        templatesCount--;
      }
    };
    const listWidget = store.add(new List("test", element, delegate, [renderer]));
    listWidget.layout(200);
    assert.strictEqual(templatesCount, 0, "no templates have been allocated");
    listWidget.splice(0, 0, range(100));
    listWidget.focusFirst();
    listWidget.focusNextPage();
    assert.strictEqual(listWidget.getFocus()[0], 9, "first page down moves focus to element at bottom");
    listWidget.focusNextPage();
    await timeout(0);
    assert.strictEqual(listWidget.getFocus()[0], 19, "page down to next page");
    listWidget.focusPreviousPage();
    assert.strictEqual(listWidget.getFocus()[0], 10, "first page up moves focus to element at top");
    listWidget.focusPreviousPage();
    await timeout(0);
    assert.strictEqual(listWidget.getFocus()[0], 0, "page down to previous page");
  });
  test("Page up and down with item taller than viewport #149502", async function() {
    const element = document.createElement("div");
    element.style.height = "200px";
    element.style.width = "200px";
    const delegate = {
      getHeight() {
        return 200;
      },
      getTemplateId() {
        return "template";
      }
    };
    let templatesCount = 0;
    const renderer = {
      templateId: "template",
      renderTemplate() {
        templatesCount++;
      },
      renderElement() {
      },
      disposeTemplate() {
        templatesCount--;
      }
    };
    const listWidget = store.add(new List("test", element, delegate, [renderer]));
    listWidget.layout(200);
    assert.strictEqual(templatesCount, 0, "no templates have been allocated");
    listWidget.splice(0, 0, range(100));
    listWidget.focusFirst();
    assert.strictEqual(listWidget.getFocus()[0], 0, "initial focus is first element");
    listWidget.focusNextPage();
    await timeout(0);
    assert.strictEqual(listWidget.getFocus()[0], 1, "page down to next page");
    listWidget.focusPreviousPage();
    await timeout(0);
    assert.strictEqual(listWidget.getFocus()[0], 0, "page up to next page");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcbGlzdFxcbGlzdFdpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgcmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0xpc3RXaWRnZXQnLCBmdW5jdGlvbiAoKSB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnUGFnZSB1cCBhbmQgZG93bicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMjAwcHgnO1xuXHRcdGVsZW1lbnQuc3R5bGUud2lkdGggPSAnMjAwcHgnO1xuXG5cdFx0Y29uc3QgZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPG51bWJlcj4gPSB7XG5cdFx0XHRnZXRIZWlnaHQoKSB7IHJldHVybiAyMDsgfSxcblx0XHRcdGdldFRlbXBsYXRlSWQoKSB7IHJldHVybiAndGVtcGxhdGUnOyB9XG5cdFx0fTtcblxuXHRcdGxldCB0ZW1wbGF0ZXNDb3VudCA9IDA7XG5cblx0XHRjb25zdCByZW5kZXJlcjogSUxpc3RSZW5kZXJlcjxudW1iZXIsIHZvaWQ+ID0ge1xuXHRcdFx0dGVtcGxhdGVJZDogJ3RlbXBsYXRlJyxcblx0XHRcdHJlbmRlclRlbXBsYXRlKCkgeyB0ZW1wbGF0ZXNDb3VudCsrOyB9LFxuXHRcdFx0cmVuZGVyRWxlbWVudCgpIHsgfSxcblx0XHRcdGRpc3Bvc2VUZW1wbGF0ZSgpIHsgdGVtcGxhdGVzQ291bnQtLTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBsaXN0V2lkZ2V0ID0gc3RvcmUuYWRkKG5ldyBMaXN0PG51bWJlcj4oJ3Rlc3QnLCBlbGVtZW50LCBkZWxlZ2F0ZSwgW3JlbmRlcmVyXSkpO1xuXG5cdFx0bGlzdFdpZGdldC5sYXlvdXQoMjAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVtcGxhdGVzQ291bnQsIDAsICdubyB0ZW1wbGF0ZXMgaGF2ZSBiZWVuIGFsbG9jYXRlZCcpO1xuXHRcdGxpc3RXaWRnZXQuc3BsaWNlKDAsIDAsIHJhbmdlKDEwMCkpO1xuXHRcdGxpc3RXaWRnZXQuZm9jdXNGaXJzdCgpO1xuXG5cdFx0bGlzdFdpZGdldC5mb2N1c05leHRQYWdlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RXaWRnZXQuZ2V0Rm9jdXMoKVswXSwgOSwgJ2ZpcnN0IHBhZ2UgZG93biBtb3ZlcyBmb2N1cyB0byBlbGVtZW50IGF0IGJvdHRvbScpO1xuXG5cdFx0Ly8gc2Nyb2xsIHRvIG5leHQgcGFnZSBpcyBhc3luY1xuXHRcdGxpc3RXaWRnZXQuZm9jdXNOZXh0UGFnZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RXaWRnZXQuZ2V0Rm9jdXMoKVswXSwgMTksICdwYWdlIGRvd24gdG8gbmV4dCBwYWdlJyk7XG5cblx0XHRsaXN0V2lkZ2V0LmZvY3VzUHJldmlvdXNQYWdlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RXaWRnZXQuZ2V0Rm9jdXMoKVswXSwgMTAsICdmaXJzdCBwYWdlIHVwIG1vdmVzIGZvY3VzIHRvIGVsZW1lbnQgYXQgdG9wJyk7XG5cblx0XHQvLyBzY3JvbGwgdG8gcHJldmlvdXMgcGFnZSBpcyBhc3luY1xuXHRcdGxpc3RXaWRnZXQuZm9jdXNQcmV2aW91c1BhZ2UoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0V2lkZ2V0LmdldEZvY3VzKClbMF0sIDAsICdwYWdlIGRvd24gdG8gcHJldmlvdXMgcGFnZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYWdlIHVwIGFuZCBkb3duIHdpdGggaXRlbSB0YWxsZXIgdGhhbiB2aWV3cG9ydCAjMTQ5NTAyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlbGVtZW50LnN0eWxlLmhlaWdodCA9ICcyMDBweCc7XG5cdFx0ZWxlbWVudC5zdHlsZS53aWR0aCA9ICcyMDBweCc7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8bnVtYmVyPiA9IHtcblx0XHRcdGdldEhlaWdodCgpIHsgcmV0dXJuIDIwMDsgfSxcblx0XHRcdGdldFRlbXBsYXRlSWQoKSB7IHJldHVybiAndGVtcGxhdGUnOyB9XG5cdFx0fTtcblxuXHRcdGxldCB0ZW1wbGF0ZXNDb3VudCA9IDA7XG5cblx0XHRjb25zdCByZW5kZXJlcjogSUxpc3RSZW5kZXJlcjxudW1iZXIsIHZvaWQ+ID0ge1xuXHRcdFx0dGVtcGxhdGVJZDogJ3RlbXBsYXRlJyxcblx0XHRcdHJlbmRlclRlbXBsYXRlKCkgeyB0ZW1wbGF0ZXNDb3VudCsrOyB9LFxuXHRcdFx0cmVuZGVyRWxlbWVudCgpIHsgfSxcblx0XHRcdGRpc3Bvc2VUZW1wbGF0ZSgpIHsgdGVtcGxhdGVzQ291bnQtLTsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBsaXN0V2lkZ2V0ID0gc3RvcmUuYWRkKG5ldyBMaXN0PG51bWJlcj4oJ3Rlc3QnLCBlbGVtZW50LCBkZWxlZ2F0ZSwgW3JlbmRlcmVyXSkpO1xuXG5cdFx0bGlzdFdpZGdldC5sYXlvdXQoMjAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVtcGxhdGVzQ291bnQsIDAsICdubyB0ZW1wbGF0ZXMgaGF2ZSBiZWVuIGFsbG9jYXRlZCcpO1xuXHRcdGxpc3RXaWRnZXQuc3BsaWNlKDAsIDAsIHJhbmdlKDEwMCkpO1xuXHRcdGxpc3RXaWRnZXQuZm9jdXNGaXJzdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0V2lkZ2V0LmdldEZvY3VzKClbMF0sIDAsICdpbml0aWFsIGZvY3VzIGlzIGZpcnN0IGVsZW1lbnQnKTtcblxuXHRcdC8vIHNjcm9sbCB0byBuZXh0IHBhZ2UgaXMgYXN5bmNcblx0XHRsaXN0V2lkZ2V0LmZvY3VzTmV4dFBhZ2UoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0V2lkZ2V0LmdldEZvY3VzKClbMF0sIDEsICdwYWdlIGRvd24gdG8gbmV4dCBwYWdlJyk7XG5cblx0XHQvLyBzY3JvbGwgdG8gcHJldmlvdXMgcGFnZSBpcyBhc3luY1xuXHRcdGxpc3RXaWRnZXQuZm9jdXNQcmV2aW91c1BhZ2UoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0V2lkZ2V0LmdldEZvY3VzKClbMF0sIDAsICdwYWdlIHVwIHRvIG5leHQgcGFnZScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsWUFBWTtBQUNyQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sY0FBYyxXQUFZO0FBQy9CLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyxvQkFBb0IsaUJBQWtCO0FBQzFDLFVBQU0sVUFBVSxTQUFTLGNBQWMsS0FBSztBQUM1QyxZQUFRLE1BQU0sU0FBUztBQUN2QixZQUFRLE1BQU0sUUFBUTtBQUV0QixVQUFNLFdBQXlDO0FBQUEsTUFDOUMsWUFBWTtBQUFFLGVBQU87QUFBQSxNQUFJO0FBQUEsTUFDekIsZ0JBQWdCO0FBQUUsZUFBTztBQUFBLE1BQVk7QUFBQSxJQUN0QztBQUVBLFFBQUksaUJBQWlCO0FBRXJCLFVBQU0sV0FBd0M7QUFBQSxNQUM3QyxZQUFZO0FBQUEsTUFDWixpQkFBaUI7QUFBRTtBQUFBLE1BQWtCO0FBQUEsTUFDckMsZ0JBQWdCO0FBQUEsTUFBRTtBQUFBLE1BQ2xCLGtCQUFrQjtBQUFFO0FBQUEsTUFBa0I7QUFBQSxJQUN2QztBQUVBLFVBQU0sYUFBYSxNQUFNLElBQUksSUFBSSxLQUFhLFFBQVEsU0FBUyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7QUFFcEYsZUFBVyxPQUFPLEdBQUc7QUFDckIsV0FBTyxZQUFZLGdCQUFnQixHQUFHLGtDQUFrQztBQUN4RSxlQUFXLE9BQU8sR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQ2xDLGVBQVcsV0FBVztBQUV0QixlQUFXLGNBQWM7QUFDekIsV0FBTyxZQUFZLFdBQVcsU0FBUyxFQUFFLENBQUMsR0FBRyxHQUFHLGtEQUFrRDtBQUdsRyxlQUFXLGNBQWM7QUFDekIsVUFBTSxRQUFRLENBQUM7QUFDZixXQUFPLFlBQVksV0FBVyxTQUFTLEVBQUUsQ0FBQyxHQUFHLElBQUksd0JBQXdCO0FBRXpFLGVBQVcsa0JBQWtCO0FBQzdCLFdBQU8sWUFBWSxXQUFXLFNBQVMsRUFBRSxDQUFDLEdBQUcsSUFBSSw2Q0FBNkM7QUFHOUYsZUFBVyxrQkFBa0I7QUFDN0IsVUFBTSxRQUFRLENBQUM7QUFDZixXQUFPLFlBQVksV0FBVyxTQUFTLEVBQUUsQ0FBQyxHQUFHLEdBQUcsNEJBQTRCO0FBQUEsRUFDN0UsQ0FBQztBQUVELE9BQUssMkRBQTJELGlCQUFrQjtBQUNqRixVQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsWUFBUSxNQUFNLFNBQVM7QUFDdkIsWUFBUSxNQUFNLFFBQVE7QUFFdEIsVUFBTSxXQUF5QztBQUFBLE1BQzlDLFlBQVk7QUFBRSxlQUFPO0FBQUEsTUFBSztBQUFBLE1BQzFCLGdCQUFnQjtBQUFFLGVBQU87QUFBQSxNQUFZO0FBQUEsSUFDdEM7QUFFQSxRQUFJLGlCQUFpQjtBQUVyQixVQUFNLFdBQXdDO0FBQUEsTUFDN0MsWUFBWTtBQUFBLE1BQ1osaUJBQWlCO0FBQUU7QUFBQSxNQUFrQjtBQUFBLE1BQ3JDLGdCQUFnQjtBQUFBLE1BQUU7QUFBQSxNQUNsQixrQkFBa0I7QUFBRTtBQUFBLE1BQWtCO0FBQUEsSUFDdkM7QUFFQSxVQUFNLGFBQWEsTUFBTSxJQUFJLElBQUksS0FBYSxRQUFRLFNBQVMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBRXBGLGVBQVcsT0FBTyxHQUFHO0FBQ3JCLFdBQU8sWUFBWSxnQkFBZ0IsR0FBRyxrQ0FBa0M7QUFDeEUsZUFBVyxPQUFPLEdBQUcsR0FBRyxNQUFNLEdBQUcsQ0FBQztBQUNsQyxlQUFXLFdBQVc7QUFDdEIsV0FBTyxZQUFZLFdBQVcsU0FBUyxFQUFFLENBQUMsR0FBRyxHQUFHLGdDQUFnQztBQUdoRixlQUFXLGNBQWM7QUFDekIsVUFBTSxRQUFRLENBQUM7QUFDZixXQUFPLFlBQVksV0FBVyxTQUFTLEVBQUUsQ0FBQyxHQUFHLEdBQUcsd0JBQXdCO0FBR3hFLGVBQVcsa0JBQWtCO0FBQzdCLFVBQU0sUUFBUSxDQUFDO0FBQ2YsV0FBTyxZQUFZLFdBQVcsU0FBUyxFQUFFLENBQUMsR0FBRyxHQUFHLHNCQUFzQjtBQUFBLEVBQ3ZFLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
